"""Local administrator settings, kept outside the repository."""
import json
import os
import tempfile
from pathlib import Path
from threading import Lock
from fastapi import HTTPException

SETTINGS = Path(os.environ.get('DKHUB_SETTINGS_FILE', Path(__file__).parent / '.local' / 'settings.json'))
LOCK = Lock()


def read_settings():
    try:
        if not SETTINGS.exists():
            return {}
        value = json.loads(SETTINGS.read_text(encoding='utf-8'))
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (OSError, ValueError) as exc:
        raise HTTPException(500, 'Einstellungen können nicht gelesen werden.') from exc


def config():
    saved = read_settings()
    return {
        'enabled': saved.get('enabled', os.environ.get('DKHUB_AI_ENABLED') == '1'),
        'typesafe_key': saved.get('typesafe_key', os.environ.get('TYPESAFE_API_KEY', '')),
        'openai_key': saved.get('openai_key', os.environ.get('OPENAI_API_KEY', '')),
        'jev_model': saved.get('jev_model', os.environ.get('DKHUB_JEV_MODEL', 'jev-latest')),
        'openai_model': saved.get('openai_model', os.environ.get('DKHUB_OPENAI_MODEL', 'gpt-6-luna')),
    }


def status():
    c = config()
    return {'enabled': c['enabled'], 'typesafe_configured': bool(c['typesafe_key']),
            'openai_configured': bool(c['openai_key']), 'jev_model': c['jev_model'], 'openai_model': c['openai_model']}


def save_settings(update):
    with LOCK:
        value = read_settings()
        for key, item in update.items():
            if item is not None:
                value[key] = item
        SETTINGS.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temp = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=SETTINGS.parent, delete=False) as output:
                temp = Path(output.name)
                os.chmod(temp, 0o600)
                json.dump(value, output, ensure_ascii=False)
            os.replace(temp, SETTINGS)
        finally:
            if temp is not None:
                temp.unlink(missing_ok=True)
    return status()
