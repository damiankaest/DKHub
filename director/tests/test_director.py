import json
import os
import subprocess
import time
from urllib.request import urlopen

import pytest
from fastapi.testclient import TestClient

from director import main

client = TestClient(main.app)
TOKEN = {'X-Director-Token': 'test-token'}


def test_auth_search_and_input_validation(monkeypatch):
    monkeypatch.setenv('DKDIRECTOR_TOKEN', 'test-token')
    calls = []
    def fake(*args, **kwargs):
        calls.append(args)
        return json.dumps({'Name':'nginx', 'Description':'server', 'StarCount':'10', 'IsOfficial':'[OK]'})
    monkeypatch.setattr(main, 'docker', fake)
    assert client.get('/search?q=nginx').status_code == 403
    assert client.get('/search?q=--bad', headers=TOKEN).status_code == 422
    response = client.get('/search?q=nginx', headers=TOKEN)
    assert response.json()[0]['name'] == 'nginx'
    assert calls == [('search', '--limit', '10', '--format', '{{json .}}', 'nginx')]
    assert client.post('/services', headers=TOKEN, json={'name':'bad', 'image':'--privileged:yes', 'port':80}).status_code == 422
    assert client.post('/services/not-ours/stop', headers=TOKEN).status_code == 404


def test_only_inspected_managed_services_can_be_stopped(monkeypatch):
    monkeypatch.setenv('DKDIRECTOR_TOKEN', 'test-token')
    service_id = 'dkhub-' + 'a' * 32
    calls = []
    def fake(*args, **kwargs):
        calls.append(args)
        return json.dumps([{'Name':'/' + service_id, 'Config':{'Labels':{}, 'Image':'nginx:latest'}, 'State':{}, 'NetworkSettings':{}}])
    monkeypatch.setattr(main, 'docker', fake)
    assert client.post(f'/services/{service_id}/stop', headers=TOKEN).status_code == 404
    assert all(args[0] != 'stop' for args in calls)


@pytest.mark.skipif(os.environ.get('DKDIRECTOR_DOCKER_TEST') != '1', reason='disposable Docker runner required')
def test_real_docker_web_service(monkeypatch):
    monkeypatch.setenv('DKDIRECTOR_TOKEN', 'test-token')
    monkeypatch.setenv('DKDIRECTOR_BIND_IP', '127.0.0.1')
    service_id = None
    try:
        response = client.post('/services', headers=TOKEN, json={'name':'Test', 'image':'traefik/whoami:v1.10.4', 'port':80})
        assert response.status_code == 201, response.text
        service = response.json()
        service_id = service['id']
        assert service['state'] == 'running' and service['host_ip'] == '127.0.0.1'
        for _ in range(30):
            try:
                with urlopen(f"http://127.0.0.1:{service['host_port']}/", timeout=2) as result:
                    assert result.status == 200
                    break
            except OSError:
                time.sleep(1)
        else:
            pytest.fail('Service did not become reachable')
        assert client.post(f'/services/{service_id}/stop', headers=TOKEN).json()['state'] == 'exited'
        assert client.post(f'/services/{service_id}/start', headers=TOKEN).json()['state'] == 'running'
    finally:
        if service_id:
            subprocess.run(['docker', 'rm', '-f', service_id], check=True, capture_output=True)
