"""Full DKForge deployment against an isolated test Director and catalog."""

import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
from time import monotonic, sleep
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from director.volumes import DockerVolumes, OWNER


@pytest.mark.skipif(os.environ.get("DKFORGE_DOCKER_TEST") != "1", reason="requires a disposable Docker service")
def test_forge_build_register_and_restart_sqlite(tmp_path, monkeypatch):
    token = uuid4().hex
    monkeypatch.setenv("DKDIRECTOR_TOKEN", token)
    monkeypatch.setenv("DKDIRECTOR_BIND_IP", "127.0.0.1")
    monkeypatch.setenv("DKDIRECTOR_DATA_DIR", str(tmp_path / "director"))
    monkeypatch.setenv("DKFORGE_ROOT", str(tmp_path / "forge"))
    monkeypatch.setenv("DKHUB_NO_AUTH", "0")
    monkeypatch.setenv("DKHUB_ADMIN_PASSWORD", "forge-test")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    monkeypatch.setenv("DKDIRECTOR_PORT", str(port))
    engine = DockerVolumes()
    project = None
    with (tmp_path / "director.log").open("wb") as log:
        process = subprocess.Popen([sys.executable, "-m", "uvicorn", "director.main:app",
                                    "--host", "127.0.0.1", "--port", str(port)],
                                   stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(80):
                try:
                    req = Request(f"http://127.0.0.1:{port}/health", headers={"X-Director-Token": token})
                    with urlopen(req, timeout=1) as response:
                        assert response.status == 200
                    break
                except OSError:
                    sleep(.1)
            else:
                pytest.fail("Isolated Director did not start")
            path = Path(__file__).resolve().parents[2] / "backend" / "main.py"
            monkeypatch.syspath_prepend(str(path.parent))
            spec = importlib.util.spec_from_file_location("forge_docker_hub", path)
            hub_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(hub_module)
            monkeypatch.setattr(hub_module, "CATALOG", tmp_path / "apps.json")
            director_request = hub_module.director_request
            containers = []

            def lose_first_response(url, *args):
                result = director_request(url, *args)
                if url.startswith("/forge/") and url.endswith("/start"):
                    containers.append(result["id"])
                    if len(containers) == 1:
                        raise HTTPException(503, "Simulation: Startantwort verloren")
                return result

            monkeypatch.setattr(hub_module, "director_request", lose_first_response)
            hub = TestClient(hub_module.app, headers={
                "Origin": "http://testserver", "X-DKHub-Admin": "forge-test",
            })
            base = "/api/forge/projects"
            response = hub.post(base, json={"name": "Forge Test " + token[:8], "sqlite": True,
                                            "description": "Isoliertes SQLite-Projekt", "design": "Schlicht",
                                            "features": ["Beispiel-Notiz speichern"]})
            assert response.status_code == 201, response.text
            project = response.json()
            path = f"{base}/{project['id']}"
            revision = {"revision": project["revision"]}
            generated = hub.post(path + "/generate", json=revision)
            assert generated.status_code == 200 and generated.json()["generated"], generated.text

            def build():
                queued = hub.post(path + "/build", json=revision)
                assert queued.status_code == 202, queued.text
                deadline = monotonic() + 270
                while monotonic() < deadline:
                    state = hub.post(path + "/status").json()
                    if state["status"] not in {"queued", "running"}:
                        return state
                    sleep(.25)
                pytest.fail("Docker job did not complete")

            failed = build()
            assert failed["status"] == "failed" and failed["phase"] == "start" and failed["image_built"], failed
            assert not any(item["id"] == f"director-{project['id']}" for item in hub.get("/api/apps").json())
            ready = build()
            assert ready["status"] == "ready", ready
            assert containers == [ready["service_id"], ready["service_id"]]
            assert hub.post(path + "/build", json=revision).json()["status"] == "ready"
            assert [item["id"] for item in hub.get("/api/apps").json()].count(ready["tile_id"]) == 1
            url = ready["url"]
            with urlopen(url + "/", timeout=5) as response:
                assert "vite" not in response.url and b'id="root"' in response.read()
            with urlopen(url + "/api/project", timeout=5) as response:
                assert json.load(response)["sqlite"]
            with urlopen(Request(url + "/api/notes", data=b'{"text":"persisted"}',
                                 headers={"Content-Type": "application/json"}), timeout=5) as response:
                assert response.status == 201
            service_path = f"/api/director/services/{ready['service_id']}"
            stopped = hub.post(service_path + "/stop")
            assert stopped.status_code == 200 and stopped.json()["state"] == "exited", stopped.text
            restarted = hub.post(service_path + "/start")
            assert restarted.status_code == 200 and restarted.json()["volumes"] == stopped.json()["volumes"], restarted.text
            for _ in range(20):
                try:
                    with urlopen(url + "/api/notes", timeout=2) as response:
                        assert json.load(response)[0]["text"] == "persisted"
                    break
                except (OSError, HTTPError):
                    sleep(.25)
            else:
                pytest.fail("Restarted app did not become reachable")
        finally:
            process.terminate()
            process.wait(timeout=10)
            if project:
                service_id = project["expected_service_id"]
                owned = engine.run("ps", "-a", "--filter", f"label=io.dkhub.forge={project['id']}",
                                   "--format", "{{.Names}}").splitlines()
                if service_id in owned:
                    engine.run("rm", "-f", "--", service_id)
                volume = service_id + ".data"
                if volume in engine.names() and engine.inspect(volume).get(OWNER) == service_id:
                    engine.run("volume", "rm", "--", volume)
                image = project["image"]
                if image in engine.run("image", "ls", "--format", "{{.Repository}}:{{.Tag}}").splitlines():
                    engine.run("image", "rm", "--", image)
