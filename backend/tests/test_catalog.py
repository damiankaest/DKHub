import json
from pathlib import Path

from fastapi.testclient import TestClient

import main


client = TestClient(main.app)


def test_catalog_reads_current_file(tmp_path, monkeypatch):
    catalog = tmp_path / "apps.json"
    monkeypatch.setattr(main, "CATALOG", catalog)
    original = json.loads((Path(main.ROOT) / "apps.json").read_text(encoding="utf-8"))
    catalog.write_text(json.dumps(original), encoding="utf-8")
    response = client.get("/api/apps")
    assert response.status_code == 200
    assert response.json()[0]["id"] == "demo"
    catalog.write_text("[]", encoding="utf-8")
    assert client.get("/api/apps").json() == []


def test_invalid_catalog_does_not_expose_data(tmp_path, monkeypatch):
    catalog = tmp_path / "apps.json"
    monkeypatch.setattr(main, "CATALOG", catalog)
    entry = json.loads((Path(main.ROOT) / "apps.json").read_text(encoding="utf-8"))[0]
    entry["url"] = "javascript:alert(1)"
    catalog.write_text(json.dumps([entry]), encoding="utf-8")
    response = client.get("/api/apps")
    assert response.status_code == 500
    assert response.json() == {"detail": "Unable to read app catalog"}


def test_frontend_and_demo_when_build_exists():
    if not main.FRONTEND.is_dir():
        return  # CI tests the frontend build in its own job.
    assert client.get("/").status_code == 200
    assert "DKHub" in client.get("/").text
    assert "Hallo aus deiner Demo-App" in client.get("/demo.html").text


def test_add_app_requires_password_and_same_origin_and_persists(tmp_path, monkeypatch):
    catalog = tmp_path / "apps.json"
    monkeypatch.setattr(main, "CATALOG", catalog)
    monkeypatch.setenv("DKHUB_ADMIN_PASSWORD", "test-password")
    payload = {"name": "Teamgeist", "url": "http://192.168.1.10:3000", "mode": "embed"}
    headers = {"Origin": "http://testserver", "X-DKHub-Admin": "test-password"}
    assert client.post("/api/apps", json=payload, headers={**headers, "X-DKHub-Admin": "wrong"}).status_code == 403
    assert client.post("/api/apps", json=payload, headers={**headers, "Origin": "http://other"}).status_code == 403
    assert not catalog.exists()
    response = client.post("/api/apps", json=payload, headers=headers)
    assert response.status_code == 201
    assert response.json()["name"] == "Teamgeist"
    assert client.get("/api/apps").json()[-1]["url"] == "http://192.168.1.10:3000"
    assert json.loads(catalog.read_text())[-1]["mode"] == "embed"


def test_no_auth_mode_keeps_origin_and_host_checks(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "CATALOG", tmp_path / "apps.json")
    monkeypatch.delenv("DKHUB_ADMIN_PASSWORD", raising=False)
    monkeypatch.setenv("DKHUB_NO_AUTH", "1")
    payload = {"name": "Offen", "url": "https://example.com"}
    lan = TestClient(main.app, base_url="http://192.168.1.10:8000")
    assert lan.get("/api/auth").json() == {"password_required": False}
    assert lan.post("/api/apps", json=payload, headers={"Origin": "http://evil.example"}).status_code == 403
    assert lan.post("/api/apps", json=payload).status_code == 403
    rebound = TestClient(main.app, base_url="http://evil.example")
    assert rebound.post("/api/apps", json=payload, headers={"Origin": "http://evil.example"}).status_code == 403
    assert lan.post("/api/apps", json=payload, headers={"Origin": "http://192.168.1.10:8000"}).status_code == 201


def test_add_app_rejects_invalid_url_and_disabled_admin(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "CATALOG", tmp_path / "apps.json")
    monkeypatch.delenv("DKHUB_ADMIN_PASSWORD", raising=False)
    headers = {"Origin": "http://testserver", "X-DKHub-Admin": "test-password"}
    payload = {"name": "Bad", "url": "javascript:alert(1)", "mode": "embed"}
    assert client.post("/api/apps", json=payload, headers=headers).status_code == 503
    monkeypatch.setenv("DKHUB_ADMIN_PASSWORD", "test-password")
    assert client.post("/api/apps", json=payload, headers=headers).status_code == 422


def test_routes_and_deletion_preserve_other_apps(tmp_path, monkeypatch):
    catalog = tmp_path / "apps.json"
    monkeypatch.setattr(main, "CATALOG", catalog)
    monkeypatch.setenv("DKHUB_ADMIN_PASSWORD", "secret")
    headers = {"Origin": "http://testserver", "X-DKHub-Admin": "secret"}
    payload = {"name": "Wetter", "route": "weather", "url": "https://example.com", "mode": "embed"}
    first = client.post("/api/apps", json=payload, headers=headers)
    assert first.status_code == 201
    assert first.json()["route"] == "weather"
    assert client.post("/api/apps", json=payload, headers=headers).status_code == 409
    assert client.delete('/api/apps/' + first.json()['id'], headers={**headers, 'X-DKHub-Admin':'wrong'}).status_code == 403
    assert client.get('/api/apps').json()[-1]['route'] == 'weather'
    if main.FRONTEND.is_dir():
        assert client.get('/weather').status_code == 200
        assert 'id="root"' in client.get('/weather').text
        assert client.get('/unknown-route').status_code == 404
        assert client.get('/demo.html').status_code == 200
    assert client.delete('/api/apps/' + first.json()['id'], headers=headers).status_code == 204
    assert len(client.get('/api/apps').json()) == 2
    assert client.delete('/api/apps/' + first.json()['id'], headers=headers).status_code == 404


def test_old_apps_receive_stable_routes_on_write(tmp_path, monkeypatch):
    catalog = tmp_path / 'apps.json'
    monkeypatch.setattr(main, 'CATALOG', catalog)
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'secret')
    entries = json.loads((Path(main.ROOT) / 'apps.json').read_text(encoding='utf-8'))
    entries[0]['name'] = 'Wetter'
    entries[1]['name'] = 'Wetter'
    catalog.write_text(json.dumps(entries), encoding='utf-8')
    before = client.get('/api/apps').json()
    assert before[0]['route'] == 'wetter'
    assert before[1]['route'].startswith('wetter-')
    headers = {'Origin':'http://testserver', 'X-DKHub-Admin':'secret'}
    assert client.delete('/api/apps/' + before[0]['id'], headers=headers).status_code == 204
    assert client.get('/api/apps').json()[0]['route'] == before[1]['route']


def test_edit_requires_admin_and_keeps_identity_and_other_apps(tmp_path, monkeypatch):
    catalog = tmp_path / 'apps.json'
    monkeypatch.setattr(main, 'CATALOG', catalog)
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'secret')
    headers = {'Origin': 'http://testserver', 'X-DKHub-Admin': 'secret'}
    before = client.get('/api/apps').json()
    app_id = before[0]['id']
    change = {'name': 'Wetter', 'url': 'http://192.168.1.20:31231', 'description': 'Wetter', 'mode': 'embed', 'route': 'weather'}
    assert client.put('/api/apps/' + app_id, json=change, headers={**headers, 'X-DKHub-Admin':'wrong'}).status_code == 403
    assert client.put('/api/apps/' + app_id, json=change, headers={**headers, 'Origin':'http://other'}).status_code == 403
    assert not catalog.exists()
    duplicate = {**change, 'route': before[1]['route']}
    assert client.put('/api/apps/' + app_id, json=duplicate, headers=headers).status_code == 409
    assert client.put('/api/apps/' + app_id, json={**change, 'url':'javascript:alert(1)'}, headers=headers).status_code == 422
    result = client.put('/api/apps/' + app_id, json=change, headers=headers)
    assert result.status_code == 200
    assert result.json()['id'] == app_id
    assert result.json()['route'] == 'weather'
    assert result.json()['url'] == change['url']
    assert client.get('/api/apps').json()[1] == before[1]
    assert client.put('/api/apps/missing', json=change, headers=headers).status_code == 404
    assert json.loads(catalog.read_text())[0]['url'] == change['url']


def test_reorder_persists_without_losing_data_and_rejects_stale_catalog(tmp_path, monkeypatch):
    catalog = tmp_path / 'apps.json'
    monkeypatch.setattr(main, 'CATALOG', catalog)
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'secret')
    headers = {'Origin': 'http://testserver', 'X-DKHub-Admin': 'secret'}
    original = client.get('/api/apps').json()
    ids = [entry['id'] for entry in original]
    endpoint = '/api/apps/reorder'
    assert client.post(endpoint, json={'ids': ids[::-1]}).status_code == 403
    assert client.post(endpoint, json={'ids': [ids[0], ids[0]]}, headers=headers).status_code == 409
    assert client.post(endpoint, json={'ids': ids[:-1]}, headers=headers).status_code == 409
    assert not catalog.exists()
    response = client.post(endpoint, json={'ids': ids[::-1]}, headers=headers)
    assert response.status_code == 200
    assert response.json() == original[::-1]
    assert client.get('/api/apps').json() == original[::-1]
    assert json.loads(catalog.read_text(encoding='utf-8')) == original[::-1]


def test_category_is_saved_updated_and_preserved_for_older_clients(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'CATALOG', tmp_path / 'apps.json')
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'secret')
    headers = {'Origin': 'http://testserver', 'X-DKHub-Admin': 'secret'}
    payload = {'name': 'Training', 'url': 'https://example.com', 'category': '  Fitness  '}
    created = client.post('/api/apps', headers=headers, json=payload)
    assert created.status_code == 201
    assert created.json()['category'] == 'Fitness'
    app_id = created.json()['id']
    old_client = {'name':'Training', 'url':'https://example.com'}
    assert client.put(f'/api/apps/{app_id}', headers=headers, json=old_client).json()['category'] == 'Fitness'
    updated = client.put(f'/api/apps/{app_id}', headers=headers, json={**old_client, 'category':'Medien'})
    assert updated.json()['category'] == 'Medien'
    assert client.get('/api/apps').json()[-1]['category'] == 'Medien'
    assert client.put(f'/api/apps/{app_id}', headers=headers, json={**old_client, 'category':'   '}).status_code == 422
