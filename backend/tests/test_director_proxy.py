import pytest
from fastapi.testclient import TestClient
import main

client = TestClient(main.app)
HEADERS = {'Origin':'http://testserver', 'X-DKHub-Admin':'secret'}


def test_backup_proxy_routes_require_admin_and_forward_exact_plan(monkeypatch):
    monkeypatch.setenv("DKHUB_ADMIN_PASSWORD", "secret")
    monkeypatch.setenv("DKHUB_NO_AUTH", "0")
    calls = []

    def director(path, method="GET", payload=None):
        calls.append((path, method, payload))
        return {"ok": True}

    monkeypatch.setattr(main, "director_request", director)
    service_id = "dkhub-" + "a" * 32
    backup_id = "b" * 32
    director_path = f"/services/{service_id}/backups"
    path = "/api/director" + director_path
    restore = f"/{backup_id}/restore"
    plan = {"plan_id": "c" * 32, "confirmation": "RESTORE"}
    assert client.post(path + "/list").status_code == 403
    assert client.post(path + restore, headers=HEADERS,
                       json={**plan, "confirmation": "YES"}).status_code == 422
    assert client.post(path.replace(service_id, "other"), headers=HEADERS).status_code == 404
    assert not calls
    assert client.post(path + "/list", headers=HEADERS).status_code == 200
    assert client.post(path, headers=HEADERS).status_code == 201
    assert client.post(path + restore + "/preview", headers=HEADERS).status_code == 200
    assert client.post(path + restore, headers=HEADERS, json=plan).status_code == 200
    assert calls == [
        (director_path, "GET", None), (director_path, "POST", None),
        (director_path + restore + "/preview", "POST", None),
        (director_path + restore, "POST", plan),
    ]


def test_proxy_requires_admin_and_registers_service(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'CATALOG', tmp_path / 'apps.json')
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'secret')
    monkeypatch.setenv('DKDIRECTOR_BIND_IP', '192.168.1.40')
    calls = []
    def director(path, method='GET', payload=None):
        calls.append((path, method, payload))
        return {'id':'dkhub-' + 'a' * 32, 'name':'Test', 'host_port':31231, 'host_ip':'192.168.1.40', 'state':'running'}
    monkeypatch.setattr(main, 'director_request', director)
    payload = {'name':'Test', 'image':'nginx:1.0', 'port':80}
    assert client.post('/api/director/install', json=payload).status_code == 403
    assert not calls
    assert client.post('/api/director/install', json=payload, headers=HEADERS).status_code == 201
    apps = client.get('/api/apps').json()
    assert apps[-1]['url'] == 'http://192.168.1.40:31231'
    assert apps[-1]['name'] == 'Test'
    assert client.post('/api/director/services/other/stop', headers=HEADERS).status_code == 404


def test_tile_is_added_for_a_service_and_later_only_its_address_changes(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'CATALOG', tmp_path / 'apps.json')
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'secret')
    monkeypatch.setenv('DKDIRECTOR_BIND_IP', '192.168.1.40')
    service_id = 'dkhub-' + 'b' * 32
    service = {'id':service_id, 'name':'Test', 'image':'nginx:1.0', 'host_port':31231, 'host_ip':'192.168.1.40'}
    monkeypatch.setattr(main, 'director_request', lambda *args: [service])
    path = f'/api/director/services/{service_id}/tile'
    assert client.post(path).status_code == 403
    tile = client.post(path, headers=HEADERS).json()
    assert tile['url'] == 'http://192.168.1.40:31231'
    update = {'name':'Mein Dienst', 'url':tile['url'] + '/admin', 'category':'Zuhause', 'mode':'external'}
    assert client.put('/api/apps/' + tile['id'], json=update, headers=HEADERS).status_code == 200
    service['host_port'] = 25000
    again = client.post(path, headers=HEADERS).json()
    assert (again['name'], again['category'], again['url']) == ('Mein Dienst', 'Zuhause', 'http://192.168.1.40:25000/admin')
    assert sum(item['id'] == tile['id'] for item in client.get('/api/apps').json()) == 1
    service['host_port'] = None
    assert client.post(path, headers=HEADERS).status_code == 409
    assert client.post('/api/director/services/dkhub-' + 'c' * 32 + '/tile', headers=HEADERS).status_code == 404


def test_port_question_adds_no_tile_and_start_syncs_an_outdated_address(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'CATALOG', tmp_path / 'apps.json')
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'secret')
    monkeypatch.setenv('DKDIRECTOR_BIND_IP', '192.168.1.40')
    before = client.get('/api/apps').json()
    monkeypatch.setattr(main, 'director_request', lambda *args: {'port_required': True, 'ports': [80, 443]})
    response = client.post('/api/director/install', json={'name':'Test', 'image':'nginx:1.0'}, headers=HEADERS)
    assert response.status_code == 200 and response.json()['ports'] == [80, 443]
    assert client.get('/api/apps').json() == before

    service_id = 'dkhub-' + 'd' * 32
    main.save_service_tile(service_id, 'Test', 'nginx:1.0', 'http://192.168.1.40:50000')
    service = {'id':service_id, 'image':'nginx:1.0', 'host_port':50999, 'host_ip':'192.168.1.40', 'state':'running'}
    monkeypatch.setattr(main, 'director_request', lambda *args: service)
    assert client.post(f'/api/director/services/{service_id}/start', headers=HEADERS).status_code == 200
    assert client.get('/api/apps').json()[-1]['url'] == 'http://192.168.1.40:50999'


def test_director_install_requires_explicit_host_before_docker(tmp_path, monkeypatch):
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'secret')
    monkeypatch.delenv('DKDIRECTOR_BIND_IP', raising=False)
    monkeypatch.setattr(main, 'director_request', lambda *args: pytest.fail('must not contact director'))
    assert client.post('/api/director/install', json={'name':'Test', 'image':'nginx:latest', 'port':80}, headers=HEADERS).status_code == 503
