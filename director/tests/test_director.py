import json
import os
import socket
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


@pytest.mark.parametrize("volumes", [
    [{"key": "state", "target": "/state,readonly"}],
    [{"key": "state", "target": "/state"}, {"key": "logs", "target": "/state/logs"}],
    [{"key": "state", "target": "/state"}, {"key": "state", "target": "/logs"}],
])
def test_invalid_volume_mounts_fail_before_docker(monkeypatch, volumes):
    monkeypatch.setenv("DKDIRECTOR_TOKEN", "test-token")
    monkeypatch.setattr(main, "docker", lambda *args: pytest.fail("Docker must not run"))
    response = client.post("/services", headers=TOKEN, json={
        "name": "Test", "image": "nginx:latest", "volumes": volumes,
    })
    assert response.status_code == 422


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


def test_install_publishes_a_fixed_port_not_reserved_by_other_services(monkeypatch):
    monkeypatch.setenv('DKDIRECTOR_TOKEN', 'test-token')
    monkeypatch.setenv('DKDIRECTOR_BIND_IP', '127.0.0.1')
    # The first candidate belongs to a stopped service, the second one is free.
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        free = sock.getsockname()[1]
    monkeypatch.setattr(main.random, 'sample', lambda *args: [20000, free])
    calls = []
    def fake(*args, **kwargs):
        calls.append(args)
        if args[0] == 'ps':
            return 'abc123\n'
        if args == ('inspect', '--', 'abc123'):
            return json.dumps([{'HostConfig': {'PortBindings': {'80/tcp': [{'HostPort': '20000'}]}}}])
        if args[:2] == ('image', 'inspect'):
            return '{"80/tcp":{}}'
        if args[0] == 'inspect':
            return json.dumps([{'Name': '/' + args[-1], 'Config': {'Labels': {'io.dkhub.director': 'managed'}}}])
        return ''
    monkeypatch.setattr(main, 'docker', fake)
    response = client.post('/services', headers=TOKEN, json={'name':'Test', 'image':'nginx:latest', 'port':80})
    assert response.status_code == 201, response.text
    run = next(args for args in calls if args[0] == 'run')
    assert run[run.index('--publish') + 1] == f'127.0.0.1:{free}:80'


def fake_docker(calls, declared='{"8080/tcp":{}}', run_errors=(), loaded=True):
    errors = list(run_errors)
    local = {'image': loaded}
    def fake(*args, **kwargs):
        calls.append(args)
        if args[:2] == ('image', 'inspect'):
            if not local['image']:
                raise main.HTTPException(502, 'missing')
            return declared
        if args[0] == 'pull':
            local['image'] = True
        if args[0] == 'run' and errors:
            error = main.HTTPException(502, 'failed')
            error.stderr = errors.pop(0)
            raise error
        if args[:2] == ('inspect', '--format'):
            return 'created\n'
        if args[0] == 'inspect':
            return json.dumps([{'Name': '/' + args[-1], 'Config': {'Labels': {'io.dkhub.director': 'managed'}}}])
        return ''
    return fake


def install(monkeypatch, calls, port=None, **options):
    monkeypatch.setenv('DKDIRECTOR_TOKEN', 'test-token')
    monkeypatch.setenv('DKDIRECTOR_BIND_IP', '127.0.0.1')
    monkeypatch.setattr(main, 'docker', fake_docker(calls, **options))
    body = {'name': 'Test', 'image': 'nginx:latest'}
    if port:
        body['port'] = port
    return client.post('/services', headers=TOKEN, json=body)


def published(calls):
    return [args[args.index('--publish') + 1] for args in calls if args[0] == 'run']


def test_single_declared_port_is_used_after_loading_the_image(monkeypatch):
    calls = []
    assert install(monkeypatch, calls, loaded=False, declared='{"53/udp":{},"8080/tcp":{}}').status_code == 201
    assert [args[0] for args in calls][:3] == ['image', 'pull', 'image']
    assert published(calls)[0].endswith(':8080')
    run = next(args for args in calls if args[0] == 'run')
    assert run[run.index('--restart') + 1] == 'unless-stopped'


@pytest.mark.parametrize('declared,ports', [('null', []), ('{"53/udp":{}}', []), ('{"443/tcp":{},"80/tcp":{}}', [80, 443])])
def test_missing_or_ambiguous_ports_ask_instead_of_creating_a_container(monkeypatch, declared, ports):
    calls = []
    response = install(monkeypatch, calls, declared=declared)
    assert response.status_code == 200
    assert response.json() == {'port_required': True, 'ports': ports}
    assert not any(args[0] == 'run' for args in calls)


def test_manual_port_wins_and_a_port_conflict_retries_with_another_port(monkeypatch):
    calls = []
    response = install(monkeypatch, calls, port=3000, run_errors=['Bind failed: port is already allocated'])
    assert response.status_code == 201
    first, second = published(calls)
    assert first != second and second.endswith(':3000')
    assert [args[0] for args in calls].count('rm') == 1


def test_other_start_errors_are_not_retried_and_leave_no_container(monkeypatch):
    calls = []
    response = install(monkeypatch, calls, run_errors=['exec: not found'])
    assert response.status_code == 502 and 'Einstellungen' in response.json()['detail']
    assert len(published(calls)) == 1
    assert [args[0] for args in calls].count('rm') == 1


def test_silently_unpublished_port_is_replaced(monkeypatch):
    calls = []
    states = iter([True, True, False, False])
    monkeypatch.setattr(main.time, 'sleep', lambda _: None)
    monkeypatch.setattr(main, 'inspect_service', lambda _: {'port_blocked': next(states)})
    assert install(monkeypatch, calls).status_code == 201
    first, second = published(calls)
    assert first != second
    assert [args[:2] for args in calls].count(('rm', '-f')) == 1


def test_running_service_without_published_port_has_no_address():
    item = {'Name': '/dkhub-' + 'a' * 32, 'Config': {'Labels': {'io.dkhub.director': 'managed', 'io.dkhub.port': '80'}},
            'State': {'Status': 'running'}, 'NetworkSettings': {'Ports': {'80/tcp': []}},
            'HostConfig': {'PortBindings': {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '25000'}]}}}
    view = main.service_view(item)
    assert view['port_blocked'] and view['host_port'] is None
    item['RestartCount'] = 3
    assert not main.service_view(item)['port_blocked']


def test_labels_keep_the_port_of_a_stopped_service_reserved(monkeypatch):
    # What Docker Desktop reports for a stopped container: no host port in its configuration.
    item = {'Name': '/dkhub-' + 'a' * 32, 'State': {'Status': 'exited'}, 'NetworkSettings': {'Ports': {}},
            'Config': {'Labels': {'io.dkhub.director': 'managed', 'io.dkhub.port': '80',
                                  'io.dkhub.host-ip': '192.168.1.5', 'io.dkhub.host-port': '25000'}},
            'HostConfig': {'PortBindings': {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': ''}]}}}
    view = main.service_view(item)
    assert (view['fixed_port'], view['host_ip'], view['host_port']) == (True, '192.168.1.5', 25000)
    monkeypatch.setattr(main, 'docker', lambda *args, **kwargs: 'abc' if args[0] == 'ps' else json.dumps([item]))
    assert main.reserved_ports() == {25000}


def test_port_used_on_all_addresses_is_not_free():
    with socket.socket() as sock:
        sock.bind(('0.0.0.0', 0))
        sock.listen()
        assert not main.port_is_free('127.0.0.1', sock.getsockname()[1])


def test_stopped_service_reports_its_fixed_port_and_running_one_the_actual_port():
    item = {'Name': '/dkhub-' + 'a' * 32, 'Config': {'Labels': {'io.dkhub.director': 'managed', 'io.dkhub.port': '80'}},
            'State': {'Status': 'exited'}, 'NetworkSettings': {'Ports': {}},
            'HostConfig': {'PortBindings': {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '25000'}]}}}
    assert main.service_view(item)['host_port'] == 25000
    item['HostConfig']['PortBindings']['80/tcp'][0]['HostPort'] = ''
    assert main.service_view(item)['host_port'] is None and not main.service_view(item)['fixed_port']
    item['NetworkSettings']['Ports'] = {'80/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '50123'}]}
    assert main.service_view(item)['host_port'] == 50123


@pytest.mark.parametrize('state,code,expected', [('running', 404, 'reachable'), ('running', None, 'unreachable'),
                                                 ('restarting', None, 'restarting'), ('exited', None, 'stopped')])
def test_health_states(monkeypatch, state, code, expected):
    monkeypatch.setenv('DKDIRECTOR_TOKEN', 'test-token')
    monkeypatch.setattr(main, 'inspect_service', lambda _: {'state': state, 'host_ip': '127.0.0.1', 'host_port': 25000})
    monkeypatch.setattr(main, 'probe', lambda *args: code)
    assert client.get('/services/dkhub-x/health', headers=TOKEN).json()['status'] == expected


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
        stopped = client.post(f'/services/{service_id}/stop', headers=TOKEN).json()
        assert stopped['state'] == 'exited' and stopped['host_port'] == service['host_port']
        assert service['host_port'] in main.reserved_ports()
        restarted = client.post(f'/services/{service_id}/start', headers=TOKEN).json()
        assert restarted['state'] == 'running' and restarted['host_port'] == service['host_port']
    finally:
        if service_id:
            subprocess.run(['docker', 'rm', '-f', service_id], check=True, capture_output=True)


@pytest.mark.skipif(os.environ.get('DKDIRECTOR_DOCKER_TEST') != '1', reason='disposable Docker runner required')
def test_hub_to_director_real_service(tmp_path, monkeypatch):
    import importlib.util
    import socket
    import sys
    from pathlib import Path
    from uuid import uuid4

    from director.volumes import DockerVolumes, SERVICE

    monkeypatch.setenv('DKDIRECTOR_TOKEN', 'test-token')
    monkeypatch.setenv('DKDIRECTOR_BIND_IP', '127.0.0.1')
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'admin-test')
    monkeypatch.setenv('DKHUB_NO_AUTH', '0')
    state_dir = tmp_path / 'director'
    monkeypatch.setenv('DKDIRECTOR_DATA_DIR', str(state_dir))
    helper = os.environ.get('DKHUB_TEST_DOCKER_IMAGE', 'alpine:3.22')
    monkeypatch.setenv('DKDIRECTOR_BACKUP_IMAGE', helper)
    engine = DockerVolumes(helper)
    test_name = 'BackupTest-' + uuid4().hex
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    monkeypatch.setenv('DKDIRECTOR_PORT', str(port))
    process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'director.main:app', '--host', '127.0.0.1', '--port', str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    service_id = None
    try:
        for _ in range(50):
            try:
                with urlopen(f'http://127.0.0.1:{port}/not-found', timeout=1):
                    pass
            except Exception as exc:
                if getattr(exc, 'code', None) == 404:
                    break
                time.sleep(0.1)
        else:
            pytest.fail('Director did not start')
        backend_path = Path(__file__).resolve().parents[2] / 'backend' / 'main.py'
        monkeypatch.syspath_prepend(str(backend_path.parent))
        spec = importlib.util.spec_from_file_location('director_test_hub', backend_path)
        hub_module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = hub_module
        spec.loader.exec_module(hub_module)
        monkeypatch.setattr(hub_module, 'CATALOG', tmp_path / 'apps.json')
        hub = TestClient(hub_module.app)
        headers = {'Origin':'http://testserver', 'X-DKHub-Admin':'admin-test'}
        response = hub.post('/api/director/install', headers=headers, json={
            'name': test_name, 'image': 'traefik/whoami:v1.10.4',
            'volumes': [{'key': 'data', 'target': '/srv/data'}, {'key': 'logs', 'target': '/srv/logs'}],
        })
        assert response.status_code == 201, response.text
        service = response.json()
        service_id = service['id']
        assert hub.get('/api/apps').json()[-1]['url'] == f"http://127.0.0.1:{service['host_port']}"
        assert service['container_port'] == 80 and service['fixed_port']
        saved = json.loads((state_dir / 'services' / f'{service_id}.json').read_text())
        assert saved['host_port'] == service['host_port']
        originals = engine.discover(service_id)
        assert len(originals) == 2
        base = f'/api/director/services/{service_id}'
        assert hub.post(base + '/backups', headers=headers).status_code == 409
        for volume in originals:
            payload = tmp_path / f'{volume.key}.txt'
            payload.write_text(volume.key, encoding='ascii')
            subprocess.run(['docker', 'cp', str(payload), f'{service_id}:{volume.target}/marker'],
                           check=True, capture_output=True)
        stopped = hub.post(base + '/stop', headers=headers).json()
        assert stopped['state'] == 'exited' and stopped['host_port'] == service['host_port']
        created = hub.post(base + '/backups', headers=headers)
        assert created.status_code == 201, created.text
        backup = created.json()
        assert hub.post(base + '/backups/list', headers=headers).json() == [backup]
        manifest = json.loads((state_dir / 'backups' / service_id / backup['id'] / 'manifest.json').read_text())
        assert manifest['service_definition'] == saved
        restore = base + f"/backups/{backup['id']}/restore"
        preview = hub.post(restore + '/preview', headers=headers)
        assert preview.status_code == 200, preview.text
        plan = preview.json()
        assert set(v['source'] for v in plan['targets']) == {v.name for v in originals}
        assert hub.post(restore, headers=headers, json={
            'plan_id': plan['plan_id'], 'confirmation': 'NO',
        }).status_code == 422
        assert engine.discover(service_id) == originals
        request = {'plan_id': plan['plan_id'], 'confirmation': 'RESTORE'}
        restored = hub.post(restore, headers=headers, json=request)
        assert restored.status_code == 200, restored.text
        assert {v['name'] for v in restored.json()['volumes']} == {v['name'] for v in plan['targets']}
        assert hub.post(restore, headers=headers, json=request).status_code == 409
        all_volumes = engine.discover(service_id)
        assert len(all_volumes) == 4
        for volume in all_volumes:
            engine.helper(volume, 'sh', '-ec', 'test "$(cat /data/marker)" = "$1"',
                          'sh', volume.key, readonly=True)
        restarted = hub.post(base + '/start', headers=headers).json()
        assert restarted['state'] == 'running' and restarted['host_port'] == service['host_port']
        assert restarted['volumes'] == service['volumes']
    finally:
        process.terminate()
        process.wait(timeout=10)
        test_services = set(engine.run('ps', '-a', '--filter', f'label=io.dkhub.name={test_name}',
                                       '--format', '{{.Names}}').splitlines())
        if service_id:
            test_services.add(service_id)
        definitions = state_dir / 'services'
        for test_id in test_services | {path.stem for path in definitions.glob('*.json')}:
            if not SERVICE.fullmatch(test_id):
                continue
            if test_id in test_services:
                engine.run('rm', '-f', '--', test_id)
            for volume in engine.discover(test_id):
                engine.run('volume', 'rm', '--', volume.name)
