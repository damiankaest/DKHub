# DKForge als Funktion in DKHub

Für das erste End-to-End-MVP empfiehlt sich ein fest versioniertes React/Vite- und FastAPI-Template. Ein mehrstufiger Docker-Build packt das gebaute Frontend und das Backend in ein Image. FastAPI liefert beide unter einer Origin aus und stellt einen HTTP-Health-Endpunkt bereit. Ein Projekt kann ohne Datenbank starten oder SQLite unter `/data` in einem benannten Director-Volume nutzen. Damit reicht auf Windows ein Docker-Desktop-Container pro generierter App.

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
    product.md        # Ziele und Funktionen aus dem freigegebenen Plan
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

| Schnittstelle | Aufgabe |
| --- | --- |
| `POST /api/forge/projects` | Idee annehmen, Projekt-ID und editierbaren Plan liefern |
| `PUT /api/forge/projects/{id}/plan` | Geprüfte Planrevision speichern |
| `POST /api/forge/projects/{id}/build` | Freigegebene Revision erzeugen, bauen und starten. Job-ID zurückgeben. |
| `POST /api/forge/jobs/{id}/status` | Phase, Fehler, Projektpfad und bei Erfolg die Dienst- und Kachel-IDs liefern |

DKDirector kann bereits ein vorhandenes lokales Image anhand eines gültigen Tags starten, einen festen Hostport zuweisen, explizite Volumes zuordnen, Start/Stopp ausführen und HTTP-Erreichbarkeit prüfen. Der Hub kann Dienstkacheln anlegen und ihre Adresse synchronisieren.

DKForge ergänzt Planeditor, Schema, Generator, Vorlagenversionierung und die lokale Jobverwaltung. Für den Build braucht der Host eine kleine Schnittstelle mit festem Build-Kontext unter einem konfigurierten Projektstamm. Ein generiertes Projekt kann beispielsweise als `dkforge/<slug>:<revision>` getaggt werden. Der Aufruf bleibt auf serverseitig definierte Build-Parameter beschränkt. Die Wiederaufnahme eines Jobs muss bereits generierte Dateien oder installierte Dienste wiedererkennen. Für die verzögerte Registrierung kann der bestehende Kachel-Endpunkt nach erfolgreicher Director-Health-Prüfung verwendet werden.

## Offene Entscheidungen

- Den Windows-Projektstamm und seine Zugriffsrechte festlegen. Projektordner und Volumedaten haben unterschiedliche Sicherungswege. Quellcode und Plan gehören in das Projekt-Repository, Laufzeitdaten in das Volume-Backup.
- Entscheiden, welche Planfelder das erste Template direkt umsetzt. Für das MVP reichen Startseite und eine einfache Datenschnittstelle. Weitere Funktionen bleiben sichtbar in der Roadmap.
- Festlegen, wer auf einem gemeinsam genutzten Hub Builds auslösen darf und wie lange Build-Protokolle aufbewahrt werden.
- Eine verwaltete PostgreSQL-Instanz mit eigener Datenbank und eigenen Zugangsdaten je Projekt sowie eine separat versionierte UI-Komponentenbibliothek als spätere Ausbaustufen behandeln. Für PostgreSQL dann Provisionierung, Secret-Verwaltung und Datenbanksicherungen ergänzen.
