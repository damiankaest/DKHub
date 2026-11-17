import pytest
from fastapi.testclient import TestClient
import main

client = TestClient(main.app)
HEADERS = {'Origin':'http://testserver', 'X-DKHub-Admin':'secret'}


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


def test_director_install_requires_explicit_host_before_docker(tmp_path, monkeypatch):
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'secret')
    monkeypatch.delenv('DKDIRECTOR_BIND_IP', raising=False)
    monkeypatch.setattr(main, 'director_request', lambda *args: pytest.fail('must not contact director'))
    assert client.post('/api/director/install', json={'name':'Test', 'image':'nginx:latest', 'port':80}, headers=HEADERS).status_code == 503
