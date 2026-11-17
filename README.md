# DKHub

Ein leichter Hub für Web-Apps und Links im Heimnetz. React-Frontend und FastAPI-Backend liegen gemeinsam in diesem Repository. Das Backend stellt Kacheln über `GET /api/apps` bereit. Neue Webseiten lassen sich über ein Formular mit Admin-Passwort hinzufügen. Es gibt noch keine Nutzerverwaltung und keine Containersteuerung.

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

## Favoriten und Verlauf

Eine Kachel oder eine geöffnete App kann mit dem Stern zu den Favoriten hinzugefügt werden. Die Navigation zeigt Favoriten und die letzten fünf geöffneten Anwendungen. Die Listen werden nur im jeweiligen Browser gespeichert und nicht zwischen Geräten synchronisiert. Eingebettete Apps werden für eine Live-Vorschau geladen und beim Öffnen im selben Frame vergrößert. Sie bleiben beim Wechsel im Browser bestehen, solange DKHub geöffnet bleibt; einzelne Webseiten können sich selbst neu laden. Die Vorschau stellt echte Verbindungen her und kann Ressourcen benötigen; externe Links zeigen zunächst ein Platzhalterbild. Einbettung kann von Webseiten untersagt werden.

## Fenster und Links

Über „+ Fenster“ lassen sich bis zu vier einbettbare Apps nebeneinander öffnen; auf kleinen Displays stehen sie untereinander. Jedes Fenster kann geschlossen werden. Die Seitenleiste lässt sich auf großen Bildschirmen ein- und ausklappen. Einbettung hängt weiterhin von der jeweiligen Webseite ab.

Jede App erhält einen eindeutigen DKHub-Pfad, zum Beispiel `http://SERVER-IP:8000/weather`. Beim Hinzufügen kann `weather` als Pfad eingetragen werden; ohne Eingabe wird er aus dem Namen erzeugt. Vorhandene Einträge erhalten ebenfalls automatisch einen Pfad und werden beim nächsten Speichern in der Katalogdatei festgehalten. Links lassen sich im Heimnetz teilen; `localhost` funktioniert nur auf dem jeweiligen Gerät. Der Link öffnet die einzelne App, nicht die gesamte Fensteranordnung. Für externe Links bietet DKHub die Option „Neuer Tab“.

Kacheln lassen sich über „Bearbeiten“ mit Admin-Passwort ändern. Im geöffneten Fenster zeigt „Adresse“ die konfigurierte Ziel-URL; dort kann sie kopiert oder bearbeitet werden. Browser-Sicherheitsregeln verhindern bei fremden Seiten das Auslesen ihrer internen Navigation. Eine Kachel kann über „Entfernen“ mit Admin-Passwort gelöscht werden. Die externe Webseite und deren Daten werden dabei nicht verändert.

## Webseiten hinzufügen

Damit das Formular speichern kann, vor dem Start ein eigenes Admin-Passwort als Umgebungsvariable setzen. Beispiel für Linux/macOS:

```bash
export DKHUB_ADMIN_PASSWORD='DEIN-EIGENES-LANGES-PASSWORT'
./start.sh
```

In PowerShell: `$env:DKHUB_ADMIN_PASSWORD = 'DEIN-EIGENES-LANGES-PASSWORT'` und anschließend das eigene Startskript ausführen. Das Passwort nicht im Repository speichern. Es gilt für den laufenden Prozess und muss beim späteren Start wieder gesetzt werden. Ohne Passwort bleibt die Startseite lesbar, das Hinzufügen ist deaktiviert.

Auf der Startseite **Anwendung hinzufügen** wählen, Name und erreichbare HTTP(S)-Adresse angeben und auswählen, ob die Webseite im Hub oder in einem neuen Tab geöffnet werden soll. Manche Webseiten erlauben keine Einbettung. `localhost` bezeichnet auf jedem Gerät dieses Gerät selbst; für andere Clients eine erreichbare Serveradresse angeben. HTTPS-Seiten können HTTP-Inhalte nicht einbetten.

Die mitgelieferten Beispiele stehen in `backend/apps.json`. Beim ersten Speichern wird daraus zusammen mit dem neuen Eintrag `backend/.local/apps.json`; diese Datei enthält danach den aktuellen Katalog und bleibt bei Git-Updates erhalten. Bestehende Einträge in `backend/apps.json` werden beim ersten Speichern übernommen. Danach die aktive Datei `backend/.local/apps.json` sichern. Mit `DKHUB_APPS_FILE` kann ein anderer Speicherort angegeben werden.

Der Zugriff ist für ein vertrauenswürdiges Heimnetz gedacht: Über HTTP wird das Admin-Passwort im Netzwerk unverschlüsselt übertragen. Für unzuverlässige Netze oder Internetzugriff sind HTTPS und ein geeignetes Sicherheitskonzept nötig. Keine Internet-Portfreigabe einrichten.

## Prüfungen

```bash
cd frontend && npm ci && npm run build
cd ../backend && pip install -r requirements.txt pytest httpx && python -m pytest -q tests
```
