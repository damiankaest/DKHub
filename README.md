# DKHub

Ein leichter Hub für Web-Apps und Links im Heimnetz. React-Frontend und FastAPI-Backend liegen gemeinsam in diesem Repository. Das Backend liest die Kacheln aus `backend/apps.json` und stellt sie über `GET /api/apps` bereit. Der Katalog ist zunächst bewusst nur über die Datei änderbar; es gibt noch keinen Adminbereich, keine Nutzeranmeldung und keine Containersteuerung.

## Start für den Heimnetztest

Voraussetzungen auf dem Linux-Server: Python 3.12 mit `venv` und `pip`, Node.js 24 und npm. Im Hauptverzeichnis ausführen:

```bash
./start.sh
```

Das Skript erstellt bei Bedarf `backend/.venv`, installiert die Abhängigkeiten, baut das Frontend und startet das Backend. Beim ersten Start und für fehlende Pakete ist eine Internetverbindung erforderlich. Es kann auch erneut ausgeführt werden und verändert den App-Katalog nicht. Mit **Strg+C** beenden.

Auf dem Server `http://localhost:8000` öffnen; auf anderen Geräten im Heimnetz `http://SERVER-IP:8000` verwenden. Der Server muss erreichbar und der Port entsprechend freigegeben sein. Keine Internet-Portfreigabe einrichten. Optional kann der Port mit `DKHUB_PORT=8080 ./start.sh` und der Python-Befehl mit `DKHUB_PYTHON=python3.12 ./start.sh` gewählt werden.

Das Skript richtet sich an Linux und macOS; unter Windows kann es in WSL ausgeführt werden. Für reine Windows-Installationen gelten zunächst die einzelnen Entwicklungsschritte unten.

## Entwicklung

Backend wie oben starten (ohne `--host 0.0.0.0` genügt lokal), dann in einem zweiten Terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite leitet `/api` an das Backend auf `127.0.0.1:8000` weiter. Der Vite-Entwicklungsserver ist für lokale Tests gedacht.

## Apps eintragen

`backend/apps.json` enthält die Kacheln. Änderungen werden beim nächsten Abruf gelesen. Für einen Eintrag eine eindeutige `id`, Namen, Beschreibung, Kategorie, Icon (`spark` oder `globe`), Farbe (`sage` oder `sand`), URL, Modus (`embed` oder `external`) und eine kurze Beschriftung angeben. `embed` zeigt eine Seite im Hub; `external` öffnet einen neuen Tab. Nur vertrauenswürdige URLs verwenden. Bei ungültigen Daten meldet das Frontend einen Fehler.

Einige Webseiten verbieten Einbettung; dafür bietet die Detailseite einen Link zum Öffnen in einem neuen Tab. HTTPS-Seiten können HTTP-Inhalte nicht einbetten. `localhost` bezeichnet auf jedem Gerät dieses Gerät selbst: Für andere Clients eine erreichbare Serveradresse verwenden. Die Demo `/demo.html` wird mit dem Frontend ausgeliefert.

## Prüfungen

```bash
cd frontend && npm ci && npm run build
cd ../backend && pip install -r requirements.txt pytest httpx && python -m pytest -q tests
```
