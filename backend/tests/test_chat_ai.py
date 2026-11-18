import json
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
import chat_ai
import main


def configured(monkeypatch):
    monkeypatch.setenv('DKHUB_AI_ENABLED', '1')
    monkeypatch.setenv('TYPESAFE_API_KEY', 'jev-secret')
    monkeypatch.setenv('OPENAI_API_KEY', 'llm-secret')


def test_ai_uses_jev_and_only_returns_known_suggestions(monkeypatch):
    configured(monkeypatch)
    calls = []
    def provider(url, key, body):
        calls.append((url, key, body))
        if 'typesafe' in url:
            return {'answers': {'intent': {'type': 'choice', 'choice': 'search'}}}
        context = json.loads(body['input'])
        assert context['intent_hint'] == 'search'
        assert context['apps'] == [{'id': 'weather', 'name': 'Wetter', 'description': '', 'category': 'Info'}]
        assert '192.168.' not in body['input']
        assert body['store'] is False
        return {'status': 'completed', 'output': [{'type': 'message', 'content': [
            {'type': 'output_text', 'text': json.dumps({'reply': 'Hier ist Wetter.', 'app_ids': ['weather', 'unknown', 'weather']})}]}]}
    monkeypatch.setattr(chat_ai, 'post_json', provider)
    app = SimpleNamespace(id='weather', name='Wetter', description='', category='Info', url='http://192.168.1.10')
    result = chat_ai.respond(chat_ai.ChatRequest(message='Wie wird das Wetter?'), [app])
    assert result == {'reply': 'Hier ist Wetter.', 'app_ids': ['weather'], 'intent': 'search'}
    assert calls[0][1] == 'jev-secret' and calls[1][1] == 'llm-secret'


def test_invalid_provider_answer_and_disabled_mode(monkeypatch):
    monkeypatch.delenv('DKHUB_AI_ENABLED', raising=False)
    with pytest.raises(HTTPException) as exc:
        chat_ai.respond(chat_ai.ChatRequest(message='Hallo'), [])
    assert exc.value.status_code == 503
    configured(monkeypatch)
    monkeypatch.setattr(chat_ai, 'post_json', lambda *args: {'answers': {'intent': {'type': 'choice', 'choice': 'invalid'}}})
    for _ in range(2):
        with pytest.raises(HTTPException) as exc:
            chat_ai.respond(chat_ai.ChatRequest(message='Hallo'), [])
        assert exc.value.status_code == 502


def test_ai_endpoint_requires_admin_and_same_origin(monkeypatch):
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'admin-test')
    monkeypatch.setattr(main, 'respond', lambda payload, apps: {'reply': 'Hallo', 'app_ids': [], 'intent': 'conversation'})
    client = TestClient(main.app)
    body = {'message': 'Hallo'}
    headers = {'Origin': 'http://testserver', 'X-DKHub-Admin': 'admin-test'}
    assert client.post('/api/chat/ai', json=body, headers={**headers, 'X-DKHub-Admin': 'wrong'}).status_code == 403
    assert client.post('/api/chat/ai', json=body, headers={**headers, 'Origin': 'http://other'}).status_code == 403
    assert client.post('/api/chat/ai', json=body, headers=headers).json()['reply'] == 'Hallo'
