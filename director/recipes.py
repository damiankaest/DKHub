"""Settings an app needs but its image does not declare. Only add facts checked against the app's own docs."""

# https://github.com/TraceApps/lifttrace (docker-compose.yml, .env.example, DEPLOY.md), read 2026-11-26
LIFTTRACE = {
    "title": "LiftTrace",
    "note": "Vorlage nach der LiftTrace-Anleitung. Beim ersten Öffnen richtest du dein Konto in der App ein.",
    "volumes": [
        {"key": "db", "target": "/data/db", "label": "Datenbank (Trainings und Konten)"},
        {"key": "uploads", "target": "/data/uploads", "label": "Bilder und App-Backups"},
    ],
    "env": [
        {"key": "DB_PATH", "value": "/data/db/lifttrace.db", "label": "Ort der Datenbank", "required": True},
        {"key": "UPLOADS_PATH", "value": "/data/uploads", "label": "Ort der Uploads", "required": True},
        {"key": "JWT_SECRET", "value": "", "label": "Geheimer Schlüssel für die Anmeldung", "required": True,
         "secret": True, "generate": True},
        {"key": "INSECURE_COOKIES", "value": "1", "required": False,
         "label": "Anmeldung über http:// im Heimnetz erlauben. Nie für Zugriff aus dem Internet."},
    ],
}

RECIPES = {
    "traceapps/lifttrace": LIFTTRACE,
    "ghcr.io/traceapps/lifttrace": LIFTTRACE,
}


def recipe_for(image: str) -> dict | None:
    return RECIPES.get(image.rsplit(":", 1)[0])
