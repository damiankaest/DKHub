import importlib.util
import json
from pathlib import Path
from threading import Event
from time import monotonic, sleep

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import forge
import forge_plan
import main

HEADERS = {"Origin": "http://testserver", "X-DKHub-Admin": "forge-test"}
BASE = "/api/forge/projects"
IDEA = {"name": "Notizwerk", "description": "Kleine Projektideen festhalten",
        "features": ["Notizen erfassen", "Projektideen filtern"],
        "design": "Übersichtliche Karten", "sqlite": True}


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DKHUB_NO_AUTH", "0")
    monkeypatch.setenv("DKHUB_ADMIN_PASSWORD", "forge-test")
    monkeypatch.setenv("DKFORGE_ROOT", str(tmp_path / "forge"))
    monkeypatch.setenv("DKFORGE_DATA_DIR", str(tmp_path / "generated-data"))
    monkeypatch.setattr(main, "CATALOG", tmp_path / "catalog.json")
    return TestClient(main.app, headers=HEADERS)


def create(client, **options):
    response = client.post(BASE, json={**IDEA, **options})
    assert response.status_code == 201, response.text
    return response.json()


def action(client, project, name):
    return client.post(f"{BASE}/{project['id']}/{name}", json={"revision": project["revision"]})


def wait(client, project):
    deadline = monotonic() + 8
    while monotonic() < deadline:
        response = client.post(f"{BASE}/{project['id']}/status")
        assert response.status_code == 200, response.text
        current = response.json()
        if current["status"] not in {"running", "queued"}:
            return current
        sleep(.03)
    pytest.fail("Forge job did not reach a final status")


@pytest.mark.parametrize("sqlite", [False, True])
def test_manual_edit_generates_independent_project(client, sqlite):
    assert client.post(BASE, json=IDEA, headers={"X-DKHub-Admin": "wrong"}).status_code == 403
    draft = create(client, sqlite=sqlite)
    assert draft["source"] == "manual" and draft["path"] is None
    with_draft = {**draft["plan"], "audience": "Kleine Teams", "roadmap": ["Suchfilter für Projekte ergänzen"]}
    path = f"{BASE}/{draft['id']}/plan"
    response = client.put(path, json={"revision": 1, "plan": with_draft})
    assert response.status_code == 200, response.text
    revised = response.json()
    assert revised["revision"] == 2
    assert action(client, draft, "generate").status_code == 409
    generated = action(client, revised, "generate").json()
    project = Path(generated["path"])
    assert json.loads((project / "plan.json").read_text(encoding="utf-8"))["audience"] == "Kleine Teams"
    for name in ["README.md", "AGENTS.md", "CLAUDE.md", "Dockerfile", ".dockerignore", "docs/vision.md",
                 "docs/architecture.md", "docs/roadmap.md", "frontend/package-lock.json"]:
        assert (project / name).is_file(), name
    roadmap = (project / "docs/roadmap.md").read_text(encoding="utf-8")
    assert "Im Grundgerüst vorhanden" in roadmap and "Suchfilter für Projekte ergänzen" in roadmap
    assert action(client, revised, "generate").json()["path"] == str(project)
    assert client.put(path, json={"revision": 2, "plan": with_draft}).status_code == 409
    assert client.post(BASE + "/list").json()[0]["id"] == draft["id"]
    spec = importlib.util.spec_from_file_location("forge_generated_test", project / "backend/app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = TestClient(module.app)
    assert app.get("/health").json() == {"status": "ok"}
    assert app.get("/api/project").json()["sqlite"] == sqlite
    assert app.post("/api/notes", json={"text": "Test"}).status_code == (201 if sqlite else 404)


def test_ai_unconfigured_failure_and_valid_structured_plan(client, monkeypatch):
    monkeypatch.setattr(forge_plan.settings, "config", lambda: {"enabled": False, "openai_key": ""})
    assert "nicht eingerichtet" in create(client, use_ai=True)["notice"]
    monkeypatch.setattr(forge_plan.settings, "config",
                        lambda: {"enabled": True, "openai_key": "mock", "openai_model": "mock-model"})

    def unavailable(*args):
        raise HTTPException(502, "simulated provider failure")

    monkeypatch.setattr(forge_plan.chat_ai, "post_json", unavailable)
    fallback = create(client, use_ai=True)
    assert fallback["source"] == "manual" and "gültigen Plan" in fallback["notice"]
    sections = {key: value for key, value in fallback["plan"].items() if key in forge_plan.PlanDetails.model_fields}
    sections["audience"] = "Plan aus KI-Test"

    def success(url, key, body):
        assert body["store"] is False
        return {"status": "completed", "output": [{"type": "message", "content": [
            {"type": "output_text", "text": json.dumps(sections)},
        ]}]}

    monkeypatch.setattr(forge_plan.chat_ai, "post_json", success)
    planned = create(client, sqlite=False, use_ai=True)
    assert planned["source"] == "ai" and planned["plan"]["audience"] == "Plan aus KI-Test"
    assert planned["plan"]["data_model"] == []


def test_existing_directory_is_preserved(client):
    project = create(client)
    folder = forge.Store(forge.forge_root()).folder(project)
    folder.mkdir(parents=True)
    marker = folder / "README.md"
    marker.write_text("vorhanden", encoding="utf-8")
    conflict = action(client, project, "generate")
    assert conflict.status_code == 409 and "existiert bereits" in conflict.json()["detail"]
    assert list(folder.iterdir()) == [marker]
    assert marker.read_text(encoding="utf-8") == "vorhanden"


def test_resume_build_start_and_catalog_without_duplicates(client, monkeypatch):
    project = action(client, create(client), "generate").json()
    events = []
    original_save = main.save_service_tile
    monkeypatch.setenv("DKDIRECTOR_BIND_IP", "127.0.0.1")

    def build(folder, image, log):
        events.append("build")
        if events.count("build") == 1:
            raise HTTPException(502, "simulierter Buildfehler")

    def director(path, method="GET", payload=None):
        assert path.startswith(f"/forge/{project['id']}/")
        if path.endswith("/start"):
            events.append("start")
            if events.count("start") == 1:
                raise HTTPException(502, "simulierter Startfehler")
            return {"id": project["expected_service_id"], "host_ip": "127.0.0.1", "host_port": 25123}
        events.append("health")
        return {"status": "reachable"}

    def register(*args):
        events.append("tile")
        tile = original_save(*args)
        if events.count("tile") == 1:
            raise OSError("simulated interruption after saving the tile")
        return tile

    monkeypatch.setattr(forge, "build_image", build)
    monkeypatch.setattr(main, "director_request", director)
    monkeypatch.setattr(main, "save_service_tile", register)
    for phase, has_image, has_service in [("build", False, False), ("start", True, False), ("catalog", True, True)]:
        assert action(client, project, "build").status_code == 202
        failed = wait(client, project)
        assert failed["status"] == "failed" and failed["phase"] == phase
        assert failed["image_built"] == has_image and bool(failed["service_id"]) == has_service
        assert failed["error"]
    assert action(client, project, "build").status_code == 202
    ready = wait(client, project)
    assert ready["status"] == "ready"
    assert action(client, project, "build").json()["status"] == "ready"
    assert events == ["build", "build", "start", "start", "health", "tile", "start", "health", "tile"]
    assert [item["id"] for item in client.get("/api/apps").json()].count(ready["tile_id"]) == 1


def test_concurrent_build_requests_share_the_same_job(client, monkeypatch):
    project = action(client, create(client), "generate").json()
    started = Event()
    release = Event()
    builds = []
    monkeypatch.setenv("DKDIRECTOR_BIND_IP", "127.0.0.1")

    def build(folder, image, log):
        builds.append(image)
        started.set()
        assert release.wait(4)

    def director(path, *args):
        if path.endswith("/health"):
            return {"status": "reachable"}
        return {"id": project["expected_service_id"], "host_ip": "127.0.0.1", "host_port": 25124}

    monkeypatch.setattr(forge, "build_image", build)
    monkeypatch.setattr(main, "director_request", director)
    assert action(client, project, "build").status_code == 202
    try:
        assert started.wait(4)
        duplicate = action(client, project, "build")
        assert duplicate.status_code == 202
        assert duplicate.json()["phase"] == "build"
    finally:
        release.set()
    assert wait(client, project)["status"] == "ready"
    assert builds == [project["image"]]
