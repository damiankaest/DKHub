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

## DKHub Chat

Über „Chat“ lassen sich registrierte Apps lokal mit einfachen Befehlen finden und öffnen, zum Beispiel `Suche Musik` oder `Öffne Wetter`. Optional beantwortet der KI-Chat natürlich formulierte Fragen: Jev ordnet die Anfrage ein, ein OpenAI-Sprachmodell formuliert die Antwort und schlägt passende registrierte Apps vor. Diese öffnest du über den jeweiligen Vorschlag. Der KI-Chat installiert und verändert keine Dienste.

Für den optionalen KI-Chat benötigst du separate API-Zugänge von TypeSafe AI und OpenAI sowie ein Admin-Passwort. API-Nutzung kann Kosten verursachen; ein ChatGPT-Abo enthält nicht automatisch API-Guthaben. Vor dem Start beispielsweise unter Linux/macOS setzen:

```bash
export DKHUB_ADMIN_PASSWORD='DEIN-EIGENES-LANGES-PASSWORT'
export DKHUB_AI_ENABLED=1
export TYPESAFE_API_KEY='DEIN-TYPESAFE-API-SCHLUESSEL'
export OPENAI_API_KEY='DEIN-OPENAI-API-SCHLUESSEL'
./start.sh
```

Unter PowerShell dieselben Variablen mit `$env:DKHUB_AI_ENABLED = '1'` und entsprechend `$env:TYPESAFE_API_KEY`, `$env:OPENAI_API_KEY` und `$env:DKHUB_ADMIN_PASSWORD` setzen, dann das lokale Startskript ausführen. Schlüssel nicht ins Repository schreiben. Optional können `DKHUB_JEV_MODEL` und `DKHUB_OPENAI_MODEL` die Standardmodelle `jev-latest` und `gpt-6-luna` überschreiben; dein API-Zugang muss das gewählte Modell unterstützen.

Im Chat **KI-Chat** wählen und das Admin-Passwort eingeben. Es bleibt nur für die aktuelle Seite im Speicher; über HTTP wird es im Netzwerk unverschlüsselt übertragen. Die Nachricht wird an TypeSafe gesendet; Nachricht, bis zu sechs vorherige Chatbeiträge sowie IDs, Namen, Kategorien und Beschreibungen der ersten 100 Apps werden an OpenAI gesendet. Vertrauliche Informationen gehören nicht in diese Inhalte. OpenAI-Anfragen werden mit `store: false` gestellt. Der lokale Chat funktioniert weiterhin ohne API-Schlüssel. Spracheingabe und WebMCP sind noch nicht implementiert.

## Admin-Zentrale und KI-Beschreibung

Über **Admin** auf der Startseite mit dem serverseitig gesetzten Admin-Passwort anmelden. Unter KI können die TypeSafe- und OpenAI-Schlüssel sowie die Modelle eingerichtet werden. Leere Eingabefelder behalten bestehende Schlüssel; die Entfernen-Schaltfläche löscht sie ausdrücklich. Gespeicherte Schlüssel werden nicht an das Frontend zurückgegeben. Die Anmeldung gilt nur solange die Seite geöffnet ist; andere bestehende Verwaltungsformulare fragen weiterhin nach dem Passwort.

Die Schlüssel liegen standardmäßig in `backend/.local/settings.json`, mit Dateirechten `0600` auf unterstützten Systemen. Die Datei enthält die Schlüssel im Klartext: Zugriff auf Server, Sicherungen und Dateisystem entsprechend einschränken. Sie wird nicht ins Git-Repository eingecheckt. `DKHUB_SETTINGS_FILE` kann einen anderen Pfad bestimmen. Gespeicherte Werte haben Vorrang vor Umgebungsvariablen; ausdrücklich entfernte Schlüssel deaktivieren auch einen entsprechenden Umgebungswert. Das Admin-Passwort muss weiterhin vor dem Start gesetzt werden. Über HTTP werden Passwort und Schlüssel im Netzwerk unverschlüsselt übertragen; nutze die Oberfläche für diese Einstellungen nur über einen geschützten Zugriff und gebe sie nicht ins Internet frei.

Beim Hinzufügen oder Bearbeiten einer Anwendung können Admins **Mit KI beschreiben** wählen. Dazu zuerst Name, absolute HTTP(S)-URL und Admin-Passwort eingeben; KI und OpenAI-Schlüssel müssen aktiviert sein. DKHub lädt die einzelne Seite serverseitig und sendet den lesbaren HTML-Text an OpenAI. API-Kosten können anfallen. Der Vorschlag für Kurzbeschreibung und ausführliche Suchbeschreibung kann vor dem Speichern bearbeitet werden. Die ausführliche Beschreibung wird im App-Katalog gespeichert, ist für alle Hub-Nutzer lesbar und wird beim KI-Chat an OpenAI übermittelt. Keine vertraulichen Inhalte analysieren oder speichern.

Die Analyse folgt keinen Weiterleitungen, führt kein JavaScript aus und meldet sich nicht an. Sie erkennt daher bei vielen React-Apps nur eine leere Hülle oder eine Anmeldeseite. In diesem Fall Beschreibung manuell ergänzen. Abfragen mit Query-Parametern, Zugangsdaten und Link-Local-Adressen sind nicht zugelassen. Der KI-Chat erhält die Beschreibung als Katalogkontext; Jev klassifiziert weiterhin zunächst die Anfrage, während das Sprachmodell passende Apps auswählt. Das garantiert weder korrekte Beschreibungen noch eine bestimmte Antwortgeschwindigkeit. Ein Live-Test mit Anbieter-Zugang ist erforderlich.

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

Auf der Startseite **Anwendung hinzufügen** wählen. Mit **Einbettung testen** wird die eingegebene Adresse vor dem Speichern als echte Vorschau geladen. Wenn der Bereich leer bleibt oder eine Fehlermeldung der Webseite zeigt, kann die Seite Einbettung blockieren; der Browser erlaubt keine verlässliche automatische Erkennung. Anschließend Name und erreichbare HTTP(S)-Adresse angeben und auswählen, ob die Webseite im Hub oder in einem neuen Tab geöffnet werden soll. Manche Webseiten erlauben keine Einbettung. `localhost` bezeichnet auf jedem Gerät dieses Gerät selbst; für andere Clients eine erreichbare Serveradresse angeben. HTTPS-Seiten können HTTP-Inhalte nicht einbetten.

Die mitgelieferten Beispiele stehen in `backend/apps.json`. Beim ersten Speichern wird daraus zusammen mit dem neuen Eintrag `backend/.local/apps.json`; diese Datei enthält danach den aktuellen Katalog und bleibt bei Git-Updates erhalten. Bestehende Einträge in `backend/apps.json` werden beim ersten Speichern übernommen. Danach die aktive Datei `backend/.local/apps.json` sichern. Mit `DKHUB_APPS_FILE` kann ein anderer Speicherort angegeben werden.

Der Zugriff ist für ein vertrauenswürdiges Heimnetz gedacht: Über HTTP wird das Admin-Passwort im Netzwerk unverschlüsselt übertragen. Für unzuverlässige Netze oder Internetzugriff sind HTTPS und ein geeignetes Sicherheitskonzept nötig. Keine Internet-Portfreigabe einrichten.

## Prüfungen

```bash
cd frontend && npm ci && npm run build
cd ../backend && pip install -r requirements.txt pytest httpx && python -m pytest -q tests
```

## DKDirector: einfache Docker-Dienste

DKDirector ist ein eigener Prozess im Verzeichnis `director/`. Er steuert nur Container, die er selbst angelegt und markiert hat. Die Admin-Oberfläche **Dienste** sucht öffentliche Images über Docker Hub, fragt Image-Tag und internen TCP-Port ab und installiert nach deinem Klick einen Container. DKHub erhält danach eine Kachel mit der vom Docker-Host aus erreichbaren Adresse. Start und Stopp sind über die Dienstliste möglich.

Für die erste Version sind nur einfache einzelne Web-Container vorgesehen. Volumes, Datenbanken, Konfigurationsvariablen, automatische Updates und der Upload eigener Image-Dateien sind noch nicht enthalten. Ohne Volume können Daten beim Entfernen des Containers verloren gehen. Nur Images installieren, denen du vertraust: Container können Netzwerkzugriff und weitreichende Auswirkungen haben.

### Linux: optional aktivieren

Docker Engine und Zugriff auf Docker für den ausführenden Benutzer sind erforderlich. Die **explizite IPv4-Adresse des Servers im Heimnetz** eintragen (kein `0.0.0.0`); darauf werden neue Dienste mit einem automatisch gewählten freien Port erreichbar. Der DKDirector selbst lauscht ausschließlich auf `127.0.0.1:8765`. DKHub und Director laufen hier auf demselben Host.

```bash
export DKHUB_ADMIN_PASSWORD='DEIN-EIGENES-LANGES-PASSWORT'
export DKDIRECTOR_BIND_IP='192.168.1.50'  # durch die eigene Server-IP ersetzen
export DKHUB_ENABLE_DIRECTOR=1
./start.sh
```

Das Startskript erzeugt ein kurzlebiges gemeinsames Token und beendet seinen eigenen Director-Prozess beim Beenden. Ohne die Option bleibt der bisherige Start unverändert. Beispieltest: In **Dienste** nach `traefik/whoami` suchen, Version `v1.10.4`, internen Port `80` angeben und installieren. Docker Hub und der Image-Download benötigen Internet. Falls eine Aktion ausfällt oder ein Timeout auftritt: erst die Dienstliste aktualisieren und Docker auf dem Server prüfen, bevor sie wiederholt wird.

Die gestarteten App-Ports sind auf der gewählten Netzwerkadresse erreichbar. Die App selbst ist für ihre Anmeldung und den Schutz ihrer Daten verantwortlich. Das Admin-Passwort wird bei HTTP unverschlüsselt übertragen; ausschließlich im vertrauenswürdigen Heimnetz testen. Keine Portweiterleitung ins Internet einrichten.

### Windows mit vorhandenem `start.ps1`

Das eigene PowerShell-Startskript wird nicht verändert. Falls es bereits `backend/.venv` angelegt hat und Docker Desktop läuft, kann DKDirector zunächst separat gestartet werden. In **derselben PowerShell-Sitzung** die Variablen für beide Prozesse setzen und dann den Backendstart im eigenen Skript ausführen:

```powershell
$env:DKHUB_ADMIN_PASSWORD = 'DEIN-EIGENES-LANGES-PASSWORT'
$env:DKDIRECTOR_BIND_IP = '192.168.1.50' # eigene, für andere Geräte erreichbare IPv4-Adresse
$env:DKDIRECTOR_PORT = '8765'
$env:DKDIRECTOR_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
Start-Process -FilePath '.\backend\.venv\Scripts\python.exe' -ArgumentList '-m','uvicorn','director.main:app','--host','127.0.0.1','--port','8765'
.\start.ps1
```

Bei Windows PowerShell 5.1 kann die Token-Erzeugung abweichen; dann ein sicher zufälliges Token verwenden. Der Director-Prozess muss bei dieser manuellen Variante anschließend selbst beendet werden. Docker Desktop kann je nach Netzwerk-Konfiguration andere Bind-Adressen erfordern; die Erreichbarkeit vom zweiten Gerät ist separat zu testen.
