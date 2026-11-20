"""Serve the production app on loopback with deterministic Jev answers, no real keys."""
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
DECISIONS = {
    'Bring mich bitte zur DKHub Demo.': ('dkhub_open_app', .98),
    'Was hatte ich vorhin offen?': ('dkhub_list_recent', .97),
    'Schließe bitte die aktuelle Ansicht.': ('dkhub_close_active_app', .98),
    'Vielleicht das da?': ('dkhub_open_app', .41),
}


def provider(url, key, body):
    assert url == 'https://api.typesafe.ai/v1/systemone' and key == 'fixture-only'
    assert set(body['state']) == {'message'}
    name, confidence = DECISIONS[body['state']['message']]
    assert name in body['questions']['action']['criteria']
    return {'answers': {'action': {'type': 'choice', 'choice': name, 'confidence': confidence}}}


if __name__ == '__main__':
    with TemporaryDirectory() as tmp:
        os.environ.update(DKHUB_ADMIN_PASSWORD='fixture-admin', DKHUB_AI_ENABLED='1',
                          TYPESAFE_API_KEY='fixture-only', OPENAI_API_KEY='',
                          DKHUB_SETTINGS_FILE=str(Path(tmp)/'settings.json'), DKHUB_APPS_FILE=str(Path(tmp)/'apps.json'),
                          DKHUB_IMAGE_DIR=str(Path(tmp)/'images'))
        import chat_ai
        import main
        chat_ai.post_json = provider
        uvicorn.run(main.app, host='127.0.0.1', port=4188, log_level='warning')
