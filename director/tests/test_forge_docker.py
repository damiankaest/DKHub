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
from director.forge_postgres import Postgres


@pytest.mark.skipif(os.environ.get("DKFORGE_DOCKER_TEST") != "1", reason="requires a disposable Docker service")
@pytest.mark.parametrize("postgres", [False, True], ids=["sqlite", "postgres"])
def test_forge_build_register_restart_and_release(tmp_path, monkeypatch, postgres):
    token = uuid4().hex
    monkeypatch.setenv("DKDIRECTOR_TOKEN", token)
    monkeypatch.setenv("DKDIRECTOR_BIND_IP", "127.0.0.1")
    monkeypatch.setenv("DKDIRECTOR_DATA_DIR", str(tmp_path / "director"))
    monkeypatch.setenv("DKFORGE_ROOT", str(tmp_path / "forge"))
    monkeypatch.setenv("DKHUB_NO_AUTH", "0")
    monkeypatch.setenv("DKHUB_ADMIN_PASSWORD", "forge-test")
    monkeypatch.setenv("DKFORGE_POSTGRES_INSTANCE", "dkforge-test-" + token[:10])
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    monkeypatch.setenv("DKDIRECTOR_PORT", str(port))
    engine = DockerVolumes()
    cluster = Postgres()
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
            response = hub.post(base, json={"name": "Forge Test " + token[:8], "sqlite": not postgres,
                                            "postgres": postgres,
                                            "description": "Isoliertes SQLite-Projekt", "design": "Schlicht",
                                            "features": ["Beispiel-Notiz speichern"]})
            assert response.status_code == 201, response.text
            project = response.json()
            path = f"{base}/{project['id']}"
            revision = {"revision": project["revision"]}
            generated = hub.post(path + "/generate", json=revision)
            assert generated.status_code == 200 and generated.json()["generated"], generated.text

            def build(action="build"):
                queued = hub.post(path + "/" + action, json=revision)
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
                data = json.load(response)
                assert data["sqlite"] != postgres and data["postgres"] == postgres
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
            if postgres:
                second_id = uuid4().hex
                with cluster.project_args(second_id):
                    assert cluster.sql(f"SELECT has_database_privilege('forge_{project['id']}', 'forge_{second_id}', 'CONNECT');") == "f"
                    assert cluster.sql(f"SELECT has_database_privilege('forge_{second_id}', 'forge_{project['id']}', 'CONNECT');") == "f"
                backup = hub.post(path + "/postgres/backup")
                assert backup.status_code == 200, backup.text
                assert Path(backup.json()["path"]).read_bytes().startswith(b"PGDMP")
            source = Path(generated.json()["path"]) / "frontend" / "index.html"
            updated_html = source.read_bytes().replace(b"<title>Projekt</title>", b"<title>Neue Version</title>")
            if postgres:
                with hub:
                    setting = hub.put(path + "/watch", json={"enabled": True})
                    assert setting.status_code == 200, setting.text
                    source.write_bytes(updated_html)
                    deadline = monotonic() + 120
                    while monotonic() < deadline:
                        published = hub.post(path + "/status").json()
                        if published["status"] == "failed" or published.get("published_image") != ready["published_image"]:
                            break
                        sleep(.25)
                    else:
                        pytest.fail("Docker source change was not published")
                    assert hub.put(path + "/watch", json={"enabled": False}).status_code == 200
            else:
                source.write_bytes(updated_html)
                published = build("redeploy")
            assert published["status"] == "ready", published
            assert published["service_id"] == ready["service_id"] and published["url"] == url
            assert published["published_image"] != ready["published_image"]
            with urlopen(url + "/", timeout=5) as response:
                assert b"<title>Neue Version</title>" in response.read()
            with urlopen(url + "/api/notes", timeout=5) as response:
                assert json.load(response)[0]["text"] == "persisted"
            if not postgres:
                app_source = Path(generated.json()["path"]) / "backend" / "app.py"
                app_source.write_bytes(app_source.read_bytes().replace(
                    b'return {"status": "ok"}', b'raise HTTPException(503, "test")'))
                rolled_back = build("redeploy")
                assert rolled_back["status"] == "failed" and "vorige Container" in rolled_back["error"], rolled_back
                assert engine.run("inspect", "--format", "{{.Config.Image}}", ready["service_id"]).strip() == published["published_image"]
                with urlopen(url + "/api/notes", timeout=5) as response:
                    assert json.load(response)[0]["text"] == "persisted"
        finally:
            process.terminate()
            process.wait(timeout=10)
            if project:
                service_id = project["expected_service_id"]
                owned = engine.run("ps", "-a", "--filter", f"label=io.dkhub.forge={project['id']}",
                                   "--format", "{{.Names}}").splitlines()
                for own in (service_id, service_id + "-rollback"):
                    if own in owned:
                        engine.run("rm", "-f", "--", own)
                volume = service_id + ".data"
                if volume in engine.names() and engine.inspect(volume).get(OWNER) == service_id:
                    engine.run("volume", "rm", "--", volume)
                prefix = project["image"].split(":")[0] + ":"
                for image in engine.run("image", "ls", "--format", "{{.Repository}}:{{.Tag}}").splitlines():
                    if image.startswith(prefix):
                        engine.run("image", "rm", "--", image)
            if postgres:
                containers = engine.run("ps", "-a", "--format", "{{.Names}}").splitlines()
                if cluster.name in containers and cluster.owned("container", cluster.name):
                    engine.run("rm", "-f", "--", cluster.name)
                if cluster.volume in engine.names() and cluster.owned("volume", cluster.volume):
                    engine.run("volume", "rm", "--", cluster.volume)
                networks = engine.run("network", "ls", "--format", "{{.Name}}").splitlines()
                if cluster.network in networks and cluster.owned("network", cluster.network):
                    engine.run("network", "rm", "--", cluster.network)
