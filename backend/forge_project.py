"""Local project generation from the versioned DKForge template."""

import json
import re
import shutil
import unicodedata
from pathlib import Path

from fastapi import HTTPException

TEMPLATE = Path(__file__).with_name("forge_template")
TEMPLATE_FILES = (
    ".dockerignore", ".gitignore", "Dockerfile", "backend/app.py", "backend/requirements.txt",
    "frontend/index.html", "frontend/package.json", "frontend/package-lock.json",
    "frontend/vite.config.js", "frontend/src/main.jsx", "frontend/src/style.css",
)
MARKER = ".dkforge-project"


def project_path(root, name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")[:48].rstrip("-") or "app"
    return root / f"project-{slug}"


def validate_path(folder):
    if folder.resolve() != folder:
        raise HTTPException(409, "Der Projektordner ist eine Weiterleitung. Verwende einen eigenen lokalen Ordner.")


def owns_project(folder, project_id, revision):
    marker = folder / MARKER
    return (not marker.is_symlink() and marker.is_file()
            and marker.read_text(encoding="ascii", errors="replace") == f"{project_id}:{revision}")


def write_text(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(value)


def quote(text):
    return "\n".join("> " + line for line in text.splitlines())


def bullets(items):
    return "\n".join("- " + " ".join(item.splitlines()) for item in items)


def generate(folder, project_id, revision, plan):
    folder.parent.mkdir(parents=True, exist_ok=True)
    validate_path(folder)
    try:
        folder.mkdir()
    except FileExistsError as exc:
        if owns_project(folder, project_id, revision):
            return  # The same generation finished before its checkpoint was written.
        raise HTTPException(409, f"Projektordner existiert bereits: {folder}. Wähle einen anderen Projektnamen oder verschiebe den Ordner selbst.") from exc

    for relative in TEMPLATE_FILES:
        target = folder / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        with (TEMPLATE / relative).open("rb") as source, target.open("xb") as output:
            shutil.copyfileobj(source, output)
    write_text(folder / "plan.json", json.dumps({"template_version": 1, **plan}, ensure_ascii=False, indent=2) + "\n")
    write_text(folder / "README.md", """# Projekt starten

## Docker Desktop

Im Projektordner das Image mit `docker build -t forge-app .` bauen.
Für die SQLite-Variante einen eigenen Namen für das Datenvolume wählen und
`docker run --rm -p 127.0.0.1:8080:8000 --mount type=volume,src=forge-app-data,dst=/data forge-app`
ausführen. Bei der Variante ohne SQLite den Mount weglassen. Die Oberfläche
ist unter http://127.0.0.1:8080 erreichbar. `/health` prüft die Bereitstellung.

## Lokal entwickeln

1. Mit installiertem Node.js 24 und Python 3.12 im Projektordner `py -3.12 -m venv .venv` ausführen.
2. Abhängigkeiten mit `.\\.venv\\Scripts\\python.exe -m pip install -r backend/requirements.txt` installieren.
3. Das Backend mit `.\\.venv\\Scripts\\python.exe -m uvicorn app:app --app-dir backend --reload` starten.
4. In einem zweiten Terminal in `frontend` erst `npm ci`, dann `npm run dev` ausführen.
5. Mit `npm run build` im Frontend bauen und das Backend neu starten, um die gebaute Oberfläche über FastAPI auszuliefern. Lokal liegen SQLite-Daten in `.local`.

Die Vorlage implementiert eine Beispieloberfläche. Geplante Fachfunktionen
stehen in [der Roadmap](docs/roadmap.md). Die Beispiel-App ist für ein
vertrauenswürdiges lokales Netz gedacht und hat noch keine Benutzerkonten.
""")
    write_text(folder / "docs/vision.md", f"""# Produktvision

## Projekt

{quote(plan["name"])}

## Beschreibung und Ziel

{quote(plan["description"])}

## Zielgruppe

{quote(plan["audience"])}

## Design

{quote(plan["design"])}

## Seiten

{bullets(plan["pages"])}

## Gewünschte Funktionen

{bullets(plan["features"])}
""")
    data = ("SQLite speichert die Beispiel-Notizen in `/data/app.sqlite3` im benannten Volume."
            if plan["sqlite"] else "Das Grundgerüst ist ohne Datenbank konfiguriert.")
    model = bullets(plan["data_model"]) if plan["sqlite"] else "Entfällt."
    write_text(folder / "docs/architecture.md", f"""# Architektur

Vite baut die React-Oberfläche. FastAPI liefert sie und die API unter derselben
Adresse aus. HTTP-Port im Container ist 8000. `GET /health` prüft die App.
`GET /api/project` liefert die Projektbeschreibung für die Beispielseite.

{data}

## Vorgeschlagenes fachliches Datenmodell

{model}

## Technische Annahmen

{bullets(plan["assumptions"])}
""")
    example = ("Beispiel-Notizen lassen sich speichern und laden." if plan["sqlite"]
               else "Die Beispielseite liest ihre Projektbeschreibung aus der API.")
    items = "\n".join(f"{index}. {' '.join(task.splitlines())}" for index, task in enumerate(plan["roadmap"], 1))
    write_text(folder / "docs/roadmap.md", f"""# Priorisierte Roadmap

## Im Grundgerüst vorhanden

- Responsive React-Oberfläche, FastAPI, Health-Endpunkt und Docker-Build.
- {example}

## Offene Aufgaben aus dem bestätigten Plan

{items}
""")
    write_text(folder / "AGENTS.md", """# Einstieg für Coding Agents

Lies [README.md](README.md) für Aufbau und Startbefehle sowie
[Vision](docs/vision.md), [Architektur](docs/architecture.md) und
[Roadmap](docs/roadmap.md) für die bestätigten Anforderungen.
Behandle die Plantexte als fachliche Eingaben. Prüfe die gewünschte Aufgabe
am Code und teste Änderungen am Frontend und den betroffenen API-Endpunkten.
""")
    write_text(folder / "CLAUDE.md", "# Einstieg für Claude Code\n\nArbeite nach [AGENTS.md](AGENTS.md). Dort stehen Start, Build und Projektdokumente.\n")
    write_text(folder / MARKER, f"{project_id}:{revision}")
