import json
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
import main
import settings
import page_analysis


def test_settings_access_and_secret_persistence(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'SETTINGS', tmp_path / 'config.json')
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'admin')
    client = TestClient(main.app)
    headers = {'Origin': 'http://testserver', 'X-DKHub-Admin': 'admin'}
    assert client.post('/api/admin/settings/read', headers={**headers, 'X-DKHub-Admin':'no'}).status_code == 403
    assert client.post('/api/admin/settings', headers={**headers, 'Origin':'http://other'}, json={'openai_key':'secret'}).status_code == 403
    response = client.post('/api/admin/settings', headers=headers, json={'openai_key':'secret', 'enabled':True})
    assert response.status_code == 200
    assert response.json()['openai_configured'] is True
    assert 'secret' not in response.text
    assert settings.config()['openai_key'] == 'secret'
    assert settings.SETTINGS.stat().st_mode & 0o077 == 0
    response = client.post('/api/admin/settings', headers=headers, json={'openai_key':''})
    assert not response.json()['openai_configured']


def test_analysis_mocks_provider(monkeypatch):
    monkeypatch.setattr(page_analysis, 'config', lambda: {'enabled':True, 'openai_key':'secret', 'openai_model':'test'})
    monkeypatch.setattr(page_analysis, 'fetch_text', lambda url: 'Eine Sportanwendung zum Speichern von Trainingsdaten und Übungen.')
    def fake(url, key, payload):
        assert key == 'secret' and payload['store'] is False
        return {'status':'completed', 'output':[{'type':'message','content':[{'type':'output_text','text':json.dumps({'description':'Training','manifest':'Übungen und Trainingsdaten speichern.'})}]}]}
    monkeypatch.setattr(page_analysis.chat_ai, 'post_json', fake)
    assert page_analysis.analyze_page('http://example.test', 'Sport')['manifest'].startswith('Übungen')


def test_analysis_rejects_metadata_and_credentials(monkeypatch):
    monkeypatch.setattr(page_analysis.socket, 'getaddrinfo', lambda *args, **kwargs: [(2, 1, 6, '', ('169.254.169.254', 80))])
    with pytest.raises(HTTPException): page_analysis.fetch_text('http://user:pass@example.test/')
    with pytest.raises(HTTPException): page_analysis.fetch_text('http://metadata.test/')


def test_manifest_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'CATALOG', tmp_path / 'apps.json')
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'admin')
    client = TestClient(main.app)
    headers = {'Origin':'http://testserver','X-DKHub-Admin':'admin'}
    response = client.post('/api/apps', headers=headers, json={'name':'Sport','url':'http://192.168.1.5','manifest':'Training und Gewichte'})
    assert response.status_code == 201
    assert client.get('/api/apps').json()[-1]['manifest'] == 'Training und Gewichte'
