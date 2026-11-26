# DKForge als Funktion in DKHub

DKForge ist in der Diensteverwaltung unter **Neuen eigenen Dienst erstellen** erreichbar. Das MVP verwendet ein React/Vite- und FastAPI-Template. Ein mehrstufiger Docker-Build packt das gebaute Frontend und das Backend in ein Image. FastAPI liefert beide unter einer Origin aus und stellt `GET /health` bereit. Ein Projekt kann ohne Datenbank starten oder SQLite unter `/data` in einem benannten Director-Volume nutzen. Damit reicht auf Windows ein Docker-Desktop-Container pro generierter App.

## Ablauf und Komponenten

1. **Planentwurf in DKHub.** Die Eingabe ist eine kurze Web-App-Idee. Der Planeditor bearbeitet ein validiertes Schema mit Funktionen, Seiten, Datenentitäten, Designvorgaben und priorisierter Roadmap. Ein optionaler KI-Vorschlag füllt dieses Schema, die freizugebende Fassung bleibt bearbeitbar.
2. **Projektgenerator.** Ein freigegebener Plan erzeugt in einem neuen Ordner ein eigenständiges Git-fähiges Projekt. Der Generator setzt nur Werte ein, die das Template unterstützt, und legt eine erste funktionsfähige App-Hülle an. Freie Anforderungen bleiben als Aufgaben in der Roadmap. Vorhandene Projektdateien bleiben beim Wiederholen erhalten.
3. **Build und Registrierung.** Ein lokaler Job baut das versionierte Image, startet es über Director und prüft HTTP-Erreichbarkeit. Erst danach erscheint die Kachel im Hub. Die Oberfläche zeigt Jobzustand und Build-Fehler an. Projekt-ID, Planrevision, Image-Referenz und Director-ID werden gespeichert, damit Wiederholungen den bestehenden Zustand erkennen.
4. **Lokale Weiterarbeit.** DKForge zeigt den absoluten Ordnerpfad und bietet das Kopieren des lokalen VS-Code-Befehls an. Auf dem Windows-Host kann der Ordner mit `code "<Projektordner>"` geöffnet werden. [VS Code CLI](https://code.visualstudio.com/docs/configure/command-line#_opening-files-and-folders)

```text
<Forge-Projektstamm>/<slug>/
  frontend/           # Vite, React, Lockfile
  backend/            # FastAPI, /health, optional SQLite und Migrationen
  docs/
    vision.md         # Ziele und Funktionen aus dem freigegebenen Plan
    architecture.md   # Start, Datenpfade, Schnittstellen
    roadmap.md        # priorisierte Aufgaben
  plan.json           # freigegebener Plan für diese Revision
  AGENTS.md           # Start-, Build- und Testbefehle, Verweise auf docs/
  CLAUDE.md           # kurzer Einstieg mit Verweis auf AGENTS.md
  Dockerfile
  .dockerignore
  .gitignore
  README.md
```

## Schnittstellen und Wiederverwendung

Alle Hub-Routen verwenden die bestehende Admin-Autorisierung und prüfen die Origin. Bei aktiver KI-Option wird nur die eingegebene Idee über die vorhandene OpenAI-Konfiguration verarbeitet. Ist der Dienst aus, belegt oder liefert er keinen gültigen Plan, bleibt der manuelle Entwurf bearbeitbar.

| Schnittstelle | Aufgabe |
| --- | --- |
| `POST /api/forge/projects` | Idee annehmen, Projekt-ID und editierbaren Plan liefern |
| `POST /api/forge/projects/list` | Gespeicherte Entwürfe und Projekte auflisten |
| `PUT /api/forge/projects/{id}/plan` | `{revision, plan}` prüfen und den Entwurf bei Änderungen als neue Revision speichern |
| `POST /api/forge/projects/{id}/generate` | Mit `{revision}` das eigenständige Projekt erzeugen |
| `POST /api/forge/projects/{id}/build` | Mit `{revision}` einen lokalen Build starten oder den letzten Lauf fortsetzen. HTTP 202 liefert den Projektstand. |
| `POST /api/forge/projects/{id}/status` | Phase, Fehler, Pfad und erreichbare Adresse sowie bestätigte Dienst- und Kachel-IDs liefern |

DKDirector startet für DKForge das lokal gebaute Tag `dkforge/project-<id>:v1` auf einem festen Hostport. Er verwendet pro Projekt dieselbe Dienst-ID und prüft vor Wiederverwendung das Forge-Label, Image und die Volume-Zuordnung. Auf diese Weise kann ein verlorener Start-Response wiederholt werden, ohne einen zweiten Container anzulegen. Der Hub schreibt die Kachel mit der Dienst-ID als Schlüssel erst nach erfolgreichem `/health`-Check.

## Windows-Betrieb

- `DKFORGE_ROOT` setzt den Projektstamm auf dem DKHub-Host. Vorgabe ist `backend/.local/forge`. Projektquellen liegen unter `projects`, lokale Statusdateien und das letzte Build-Protokoll unter `state`. Der Ordner braucht Schreibzugriff für DKHub und sollte unter Windows über geeignete NTFS-Berechtigungen geschützt sein.
- Für Build und Start benötigt der Hub-Host Docker Desktop im Linux-Modus und einen gestarteten DKDirector. Der erste Docker-Build benötigt Zugriff auf die Paket- und Image-Registries. Der lokale Worker führt einen Build gleichzeitig aus. Eine DKHub-Instanz soll den Projektstamm verwalten.
- Ein bereits belegter Projektpfad wird abgewiesen. Für einen neuen Versuch einen anderen Namen wählen oder den belegten Ordner selbst prüfen. Nach der Erzeugung erfolgt die Weiterarbeit im Projektordner. Ein Build-Fehler lässt sich nach einer lokalen Korrektur erneut versuchen. Nach einem Start- oder Registrierungsfehler bleiben das zuvor gebaute Image und bereits vorhandene Ressourcen erhalten.
- Den in der Oberfläche angezeigten PowerShell-Befehl auf dem Windows-Host ausführen. Auf einem anderen Gerät ist der angezeigte Ordner ein Serverpfad.

## Zusammenführen und Tests

`frontend/src/Director.jsx` erhält den zusätzlichen Ansichtswechsel und den Forge-API-Anschluss. Dort beim Zusammenführen die lokal hinzugekommenen Übergänge und Einstellungen mit übernehmen. `main.jsx`, die globale Navigation und globale Styles brauchen für Forge keine Änderung. Die React-Komponenten und Styles für den Planeditor liegen unter `frontend/src/forge`. Der Serveranschluss liegt in `backend/main.py` und `director/main.py`.

Die Backend-Suite prüft den Entwurf, die Planbearbeitung, KI-Fallback und Wiederholung nach Build-, Start- und Katalogfehlern. Playwright prüft die Hub-Ansicht auf Desktop und Mobilbreite mit simulierten API-Antworten. Mit `DKFORGE_DOCKER_TEST=1` prüft `director/tests/test_forge_docker.py` den echten Build, Wiederholung nach verlorener Startantwort, Kachelregistrierung und SQLite nach Stoppen und Starten mit temporärem Projekt und eigenen Docker-Ressourcen.

## Offene Entscheidungen

- Das Template liefert eine Startseite und bei SQLite den Beispiel-Workflow für Notizen. Fachfunktionen und projektspezifisches Design werden aus der Roadmap weiterentwickelt. Automatische Neuveröffentlichung bereits registrierter Projekte ist eine spätere Erweiterung.
- Quellcode und Plan gehören in das Projekt-Repository. SQLite-Laufzeitdaten können über die vorhandenen Director-Volume-Backups gesichert werden.
- Eine spätere gemeinsame PostgreSQL-Instanz braucht eigene Datenbanken und Zugangsdaten pro Dienst sowie Datenbanksicherungen.
- Eine versionierte UI-Komponentenbibliothek kann als gepinntes Frontend-Paket ins Template aufgenommen werden. Die erzeugten Projekte sollen dabei eigenständig bleiben.
