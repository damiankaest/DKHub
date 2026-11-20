import json

import pytest
from fastapi.testclient import TestClient

import chat_ai
import main
import settings

ADMIN = "/api/admin/themes"
HEADERS = {"Origin": "http://testserver", "X-DKHub-Admin": "test-admin"}
RECIPE = {"name": "Polarlicht", "mode": "dark", "accent": "#42CAB2", "highlight": "#CF9AEA",
          "motif": "aurora", "shape": "round", "motion": True}


@pytest.fixture
def hub(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "SETTINGS", tmp_path / "settings.json")
    monkeypatch.setenv("DKHUB_ADMIN_PASSWORD", "test-admin")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("DKHUB_AI_ENABLED", raising=False)
    return TestClient(main.app)


def test_home_design_persists_and_public_route_only_exposes_active_theme(hub):
    settings.save_settings({"openai_key": "private-test-value"})
    res = hub.get("/api/theme")
    assert res.json()["id"] == "light" and res.headers["cache-control"] == "no-store"
    assert [t["id"] for t in hub.post(ADMIN + "/list", headers=HEADERS).json()["themes"]] == ["light", "dark", "anime", "christmas"]
    created = hub.post(ADMIN, json=RECIPE, headers=HEADERS)
    assert created.status_code == 201
    saved = created.json()
    assert saved["id"].startswith("custom-")
    assert hub.get("/api/theme").json() == res.json()
    assert hub.post(ADMIN, json={**RECIPE, "name": " polarlicht "}, headers=HEADERS).status_code == 409
    url = ADMIN + "/" + saved["id"]
    assert hub.post(url + "/activate", headers=HEADERS).json() == saved
    settings.save_settings({"enabled": True})
    assert TestClient(main.app).get("/api/theme").json() == saved
    assert "private-test-value" not in hub.post(ADMIN + "/list", headers=HEADERS).text
    assert json.loads(settings.SETTINGS.read_text())["openai_key"] == "private-test-value"
    assert hub.delete(url, headers=HEADERS).status_code == 409
    assert hub.post(ADMIN + "/dark/activate", headers=HEADERS).status_code == 200
    assert hub.delete(ADMIN + "/anime", headers=HEADERS).status_code == 409
    assert hub.delete(url, headers=HEADERS).status_code == 204
    assert hub.post(url + "/activate", headers=HEADERS).status_code == 404


@pytest.mark.parametrize("path,method,body", [("/list","post",None), ("","post",RECIPE),
                         ("/dark/activate","post",None), ("/dark","delete",None), ("/draft","post",{"prompt":"Schnee"})])
def test_all_admin_routes_require_password_and_origin(hub, path, method, body):
    for headers in ({}, {**HEADERS, "Origin": "http://other.test"}, {**HEADERS, "X-DKHub-Admin": "wrong"}):
        assert hub.request(method, ADMIN+path, json=body, headers=headers).status_code == 403


def test_limits_and_disabled_provider(hub):
    for update in ({"accent":"red"}, {"motion":"yes"}, {"css":"body{}"}, {"motif":"stars"}, {"name":"  "}):
        assert hub.post(ADMIN, json={**RECIPE, **update}, headers=HEADERS).status_code == 422
    assert hub.post(ADMIN + "/draft", json={"prompt":"   "}, headers=HEADERS).status_code == 422
    assert hub.post(ADMIN + "/draft", json={"prompt":"Winter"}, headers=HEADERS).status_code == 503
    for n in range(12):
        assert hub.post(ADMIN, json={**RECIPE, "name":f"Theme {n}"}, headers=HEADERS).status_code == 201
    assert hub.post(ADMIN, json=RECIPE, headers=HEADERS).status_code == 409


def test_ai_returns_editable_recipe_without_publishing_or_storing_prompt(hub, monkeypatch):
    settings.save_settings({"enabled": True, "openai_key":"test-only", "openai_model":"test-model"})
    prompt = "Japanische Listening-Bar mit ruhigen Lichtbändern"
    def provider(url, key, payload):
        assert key == "test-only" and payload["model"] == "test-model"
        assert payload["input"] == prompt and payload["store"] is False
        assert "test-only" not in json.dumps(payload) and "tools" not in payload
        return {"status":"completed", "output":[{"type":"message","content":[{"type":"output_text","text":json.dumps(RECIPE)}]}]}
    monkeypatch.setattr(chat_ai, "post_json", provider)
    res = hub.post(ADMIN + "/draft", json={"prompt":prompt}, headers=HEADERS)
    assert res.status_code == 200 and res.json() == RECIPE
    assert len(hub.post(ADMIN + "/list", headers=HEADERS).json()["themes"]) == 4
    assert hub.get("/api/theme").json()["id"] == "light"
    assert prompt not in settings.SETTINGS.read_text()
    monkeypatch.setattr(chat_ai, "post_json", lambda *args: {"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"{}"}]}]})
    assert hub.post(ADMIN+"/draft", json={"prompt":prompt}, headers=HEADERS).status_code == 502
    assert hub.get("/api/theme").json()["id"] == "light"
