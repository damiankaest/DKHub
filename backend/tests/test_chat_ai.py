import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import chat_ai
import main


def choice(tool, confidence=.98):
    return {'answers': {'action': {'type': 'choice', 'choice': tool, 'confidence': confidence}}}


@pytest.fixture
def configured(monkeypatch):
    # Test the Jev-only installation by default. Never read developer/provider credentials.
    monkeypatch.setattr(chat_ai, 'config', lambda: {
        'enabled': True, 'typesafe_key': 'jev-test', 'openai_key': '', 'jev_model': 'jev-test-model', 'openai_model': 'llm-test',
    })


def unused_catalog():
    pytest.fail('Browser commands must not read the server catalog')


@pytest.mark.parametrize(('message','selected','tool','intent'), [
    ('Bring mich bitte zu DKCoach', 'dkhub_open_app', 'dkhub_open_app', 'open'),
    ('Welche Apps können Schallplatten erkennen?', 'dkhub_search_apps', 'dkhub_search_apps', 'search'),
    ('Was hatte ich zuletzt geöffnet?', 'dkhub_list_recent', 'dkhub_list_recent', 'recent'),
    ('Schließe die aktuelle App', 'dkhub_close_active_app', 'dkhub_close_active_app', 'close_active'),
    ('Meine Favoriten', 'dkhub_list_favorites', 'dkhub_list_favorites', 'favorites'),
    ('Zeige alle Apps', 'list_all_apps', 'dkhub_search_apps', 'catalog'),
    ('Zur Startseite', 'dkhub_show_library', 'dkhub_show_library', 'library'),
    ('Öffne das Formular für eine neue Webseite', 'dkhub_prepare_add_app', 'dkhub_prepare_add_app', 'prepare_add'),
])
def test_control_uses_one_jev_call_without_openai_or_catalog(configured, monkeypatch, message, selected, tool, intent):
    calls = []
    def provider(url, key, body):
        calls.append(url)
        assert key == 'jev-test' and body['model'] == 'jev-test-model'
        assert body['state'] == {'message': message}
        assert selected in body['questions']['action']['criteria']
        return choice(selected)
    monkeypatch.setattr(chat_ai, 'post_json', provider)
    # e.g. another visitor is generating a theme using OpenAI.
    with chat_ai.AI_LOCK:
        answer = chat_ai.respond(chat_ai.ChatRequest(message=message, history=[{'role':'user','text':'private history'}]), unused_catalog)
    assert calls == ['https://api.typesafe.ai/v1/systemone']
    assert (answer['tool'], answer['intent'], answer['engine']) == (tool, intent, 'jev')
    assert answer.get('query') == (message if intent in {'open','search','close_active'} else None)


@pytest.mark.parametrize('value', [0, .55, .749])
def test_uncertain_navigation_never_executes_or_calls_llm(configured, monkeypatch, value):
    monkeypatch.setattr(chat_ai, 'post_json', lambda *args: choice('dkhub_open_app', value))
    answer = chat_ai.respond(chat_ai.ChatRequest(message='Vielleicht das da?'), unused_catalog)
    assert answer['intent'] == 'clarify' and answer['tool'] == 'none' and answer['reply']


@pytest.mark.parametrize('response', [
    choice('arbitrary_tool'), choice('dkhub_open_app', True), choice('dkhub_open_app', float('nan')),
    choice('dkhub_open_app', 1.5), {'answers': {'action': {'type':'choice', 'choice':'dkhub_open_app'}}},
])
def test_malformed_decisions_release_jev_lock(configured, monkeypatch, response):
    monkeypatch.setattr(chat_ai, 'post_json', lambda *args: response)
    for _ in range(2):
        with pytest.raises(HTTPException) as exc:
            chat_ai.respond(chat_ai.ChatRequest(message='Hallo'), unused_catalog)
        assert exc.value.status_code == 502


def test_recommendations_and_conversation_work_without_an_openai_key(configured, monkeypatch):
    for selected, tool in [('recommend','dkhub_search_apps'),('conversation','none')]:
        monkeypatch.setattr(chat_ai, 'post_json', lambda url, key, body: choice(selected))
        result = chat_ai.respond(chat_ai.ChatRequest(message='Was passt zu Musik?'), unused_catalog)
        assert result['tool'] == tool and result['engine'] == 'jev'
        assert result.get('query') == ('Was passt zu Musik?' if tool!='none' else None)


def test_optional_llm_can_only_return_clickable_registered_suggestions(configured, monkeypatch):
    cfg = {**chat_ai.config(), 'openai_key': 'llm-test'}
    monkeypatch.setattr(chat_ai, 'config', lambda: cfg)
    calls = []
    def provider(url, key, body):
        calls.append(key)
        if key == 'jev-test': return choice('recommend')
        assert url == 'https://api.openai.com/v1/responses' and body['store'] is False
        context = json.loads(body['input'])
        assert context['intent_hint'] == 'recommend'
        assert context['apps'] == [{'id':'weather','name':'Wetter','description':'Karte','category':'Info'}]
        assert 'http://private' not in body['input']
        return {'status':'completed','output':[{'type':'message','content':[{'type':'output_text',
            'text':json.dumps({'reply':'Wetter passt.', 'app_ids':['weather','unknown','weather'], 'tool':'dkhub_open_app'})}]}]}
    monkeypatch.setattr(chat_ai, 'post_json', provider)
    app = SimpleNamespace(id='weather', name='Wetter', description='Karte', category='Info', url='http://private')
    result = chat_ai.respond(chat_ai.ChatRequest(message='Was passt?'), lambda:[app])
    assert calls == ['jev-test','llm-test']
    assert result == {'intent':'recommend','tool':'dkhub_search_apps','app_ids':['weather'],'reply':'Wetter passt.','engine':'jev+openai'}


def test_disabled_or_missing_jev_key_does_not_contact_a_provider(configured, monkeypatch):
    monkeypatch.setattr(chat_ai, 'post_json', lambda *args: pytest.fail('Provider must not be called'))
    base = chat_ai.config()
    for config in [{**base, 'enabled': False}, {**base, 'typesafe_key':'','openai_key':'llm-only'}]:
        monkeypatch.setattr(chat_ai, 'config', lambda: config)
        with pytest.raises(HTTPException) as exc:
            chat_ai.respond(chat_ai.ChatRequest(message='Hallo'), unused_catalog)
        assert exc.value.status_code == 503


def test_ai_endpoint_requires_admin_and_same_origin(monkeypatch):
    monkeypatch.setenv('DKHUB_ADMIN_PASSWORD', 'admin-test')
    monkeypatch.setattr(main, 'respond', lambda payload, load_apps: {'reply':'Hallo','app_ids':[]})
    client = TestClient(main.app)
    headers = {'Origin':'http://testserver', 'X-DKHub-Admin':'admin-test'}
    assert client.post('/api/chat/ai',json={'message':'Hallo'},headers={**headers,'X-DKHub-Admin':'wrong'}).status_code == 403
    assert client.post('/api/chat/ai',json={'message':'Hallo'},headers={**headers,'Origin':'http://other'}).status_code == 403
    assert client.post('/api/chat/ai',json={'message':'Hallo'},headers=headers).json()['reply'] == 'Hallo'
