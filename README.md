# DKHub

Ein leichter Hub für Web-Apps und Links im Heimnetz. React-Frontend und FastAPI-Backend liegen gemeinsam in diesem Repository. Das Backend stellt Kacheln über `GET /api/apps` bereit. Neue Webseiten lassen sich über ein Formular mit Admin-Passwort hinzufügen. Gäste brauchen kein Konto. Für einfache Docker-Dienste lässt sich DKDirector optional zuschalten.

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

## DK-Assistent

Öffne **Assistent** in der Navigation. Auf dem Desktop sitzt der Chat rechts neben der Bibliothek oder deiner laufenden App. Auf dem Tablet ist er eine ausblendbare Seitenleiste, auf dem Handy eine Vollbildansicht. Nach dem Öffnen einer App ist der Platz dort wieder frei. Der Verlauf bleibt beim Ein- und Ausblenden im aktuellen Tab erhalten; **Neuer Chat** setzt den jeweiligen Modus zurück.

**Lokal** funktioniert ohne Schlüssel und ohne Anbieteraufruf. **KI-Chat** versteht auch frei formulierte Befehle: „Bring mich bitte zu DKCoach“, „Welche Apps haben mit Schallplatten zu tun?“, „Was hatte ich zuletzt offen?“ oder „Schließe die aktuelle App“.

Für die Steuerung wählt **Jev von TypeSafe mit einer einzigen Anfrage** ein Werkzeug. TypeSafe erhält nur die aktuelle Nachricht. Name, Route und Suchbegriffe werden im Browser mit deinem Katalog abgeglichen. Ein eindeutig genannter Name kann eine eingebettete App direkt öffnen; bei mehreren Treffern, einer bloßen Themenbeschreibung oder externen Links wählst du selbst. Ist Jevs Entscheidung unsicher, fragt der Chat nach. Erst für eine Empfehlung, einen Vergleich oder eine freie Antwort kann zusätzlich OpenAI zum Einsatz kommen. Ohne OpenAI-Schlüssel gibt es für Empfehlungen eine Katalogsuche. Die Antwort zeigt an, welche Anbieter beteiligt waren.

### WebMCP im Heimnetz

Der geöffnete Hub registriert sieben Werkzeuge über `document.modelContext`:

| Chatbeispiel | Werkzeug |
| --- | --- |
| „Finde Apps für Musik“ / „Zeige alle Apps“ | `dkhub_search_apps` |
| „Öffne DKCoach“ | `dkhub_open_app` |
| „Meine Favoriten“ | `dkhub_list_favorites` |
| „Was war zuletzt offen?“ | `dkhub_list_recent` |
| „Zur Bibliothek“ | `dkhub_show_library` |
| „Schließe die aktuelle App“ | `dkhub_close_active_app` (nur die Ansicht; der Dienst läuft weiter) |
| „App hinzufügen“ | `dkhub_prepare_add_app` (öffnet das Admin-Formular) |

Die Werkzeuge bleiben auch bei geschlossener Chatleiste verfügbar. Favoriten und Verlauf gehören zum jeweiligen Browser. Werkzeuge des Hub-Dokuments steuern nur den Hub. Beim Wechsel der aktiven App verwirft der Assistent einen verspäteten Schließbefehl.

Steht unten im Chat **WebMCP**, führt der Browser diese Aktionen über seine native Schnittstelle aus. Dazu sind ein unterstützender Browser und ein sicherer Kontext (HTTPS oder localhost) nötig. Beim üblichen Zugriff über eine HTTP-IP im Heimnetz oder ohne die Browserfunktion steht dort **Hub-Werkzeuge**: dieselben Aktionen laufen direkt im Hub. Zum Testen in Chrome siehe die [WebMCP-Anleitung](https://developer.chrome.com/docs/ai/webmcp). Es ist kein MCP-Server zu installieren.

Für die KI-Steuerung genügen ein TypeSafe-API-Schlüssel und das Hub-Admin-Passwort. Unter **Einstellungen → KI-Zugänge** die KI aktivieren und den TypeSafe-Schlüssel hinterlegen. OpenAI ist optional. API-Nutzung kann Kosten verursachen; ein ChatGPT-Abo enthält nicht automatisch API-Guthaben. Vor dem Start beispielsweise unter Linux/macOS setzen:

```bash
export DKHUB_ADMIN_PASSWORD='DEIN-EIGENES-LANGES-PASSWORT'
export DKHUB_AI_ENABLED=1
export TYPESAFE_API_KEY='DEIN-TYPESAFE-API-SCHLUESSEL'
# Optional für freie Antworten und Empfehlungen:
# export OPENAI_API_KEY='DEIN-OPENAI-API-SCHLUESSEL'
./start.sh
```

Unter PowerShell dieselben Variablen mit `$env:DKHUB_AI_ENABLED = '1'` und entsprechend `$env:TYPESAFE_API_KEY`, `$env:OPENAI_API_KEY` und `$env:DKHUB_ADMIN_PASSWORD` setzen, dann das lokale Startskript ausführen. Schlüssel nicht ins Repository schreiben. Optional können `DKHUB_JEV_MODEL` und `DKHUB_OPENAI_MODEL` die Standardmodelle `jev-latest` und `gpt-6-luna` überschreiben; dein API-Zugang muss das gewählte Modell unterstützen.

Im Chat **KI-Chat** wählen und das Admin-Passwort eingeben. Es bleibt im Arbeitsspeicher und wird beim Schließen des Chats oder beim Moduswechsel verworfen; über HTTP wird es im Netzwerk unverschlüsselt übertragen. Die Nachricht wird an TypeSafe gesendet; wenn OpenAI benötigt wird, erhält es die Nachricht, bis zu sechs vorherige KI-Chatbeiträge sowie IDs, Namen, Kategorien und Beschreibungen der ersten 100 Apps. Lokale Chatbeiträge werden nicht mitgesendet. Vertrauliche Informationen gehören nicht in diese Inhalte. OpenAI-Anfragen werden mit `store: false` gestellt. Der lokale Chat funktioniert weiterhin ohne API-Schlüssel. Spracheingabe ist noch nicht implementiert.

Der Integrationstest für die Chatsteuerung startet FastAPI mit Testdaten und führt die Aktionen in Chromium aus (nur die TypeSafe-Antwort ist simuliert). Mit installierten Backend-Abhängigkeiten und Playwright Chromium im Ordner `frontend`: `npm run build`, dann `npx playwright test -c playwright.control.config.js`. Echte Anbieter-Schlüssel sind nicht nötig.

## Design für den Hub

Unter **Einstellungen → Design-Studio** stehen **Hell**, **Dunkel**, **Anime** und **Weihnachten** bereit. Die Auswahl zeigt eine Vorschau nur in deinem Tab. **Für alle aktivieren** speichert das Hausdesign auf dem Server. Andere Geräte übernehmen es beim Öffnen, Neuladen oder wenn ihr Browser-Tab wieder sichtbar wird. Ohne Konfiguration startet der Hub in Hell.

**Eigenes Theme:** Über **Manuell gestalten** kannst du Name, Hell/Dunkel, zwei Farben, Kanten, Motiv und Animationen festlegen. Oder aktiviere unter **KI-Zugänge** die KI und hinterlege einen **OpenAI-API-Schlüssel**. Beschreibe dann z. B. „Eine japanische Listening-Bar bei Nacht: Petrol, Apricot und ruhige Lichtbänder“ und wähle **KI-Entwurf erstellen**. Nur dieser Wunsch wird an OpenAI übermittelt; dafür ist kein TypeSafe-Schlüssel nötig. Prüfe und ändere den Entwurf, wähle **Theme speichern** und anschließend bei Bedarf **Für alle aktivieren**. Bis zu zwölf eigene Designs bleiben zusammen mit den vier Vorlagen in der Sammlung. Unter einem neuen Namen kannst du Abwandlungen speichern.

Die Motive (Raster, Ringe, Manga, Schnee und Polarlicht) sind lokal enthalten; ein Theme lädt keine externen Bilder, Schriften oder Skripte. Eingebettete Apps behalten ihr eigenes Design. Das Betriebssystem kann alle Animationen mit „Bewegung reduzieren“ abschalten. Hinweise zur [Abnahme auf Handy und TV](docs/ui-release.md).

## Admin-Zentrale und KI-Beschreibung

Über **Einstellungen** in der Navigation mit dem serverseitig gesetzten Admin-Passwort anmelden. Unter **KI-Zugänge** können die TypeSafe- und OpenAI-Schlüssel sowie die Modelle eingerichtet werden. Leere Eingabefelder behalten bestehende Schlüssel; die Entfernen-Schaltfläche löscht sie ausdrücklich. Gespeicherte Schlüssel werden nicht an das Frontend zurückgegeben. Die Anmeldung gilt nur solange die Seite geöffnet ist; andere bestehende Verwaltungsformulare fragen weiterhin nach dem Passwort.

Die Schlüssel liegen standardmäßig in `backend/.local/settings.json`, mit Dateirechten `0600` auf unterstützten Systemen. Die Datei enthält die Schlüssel im Klartext: Zugriff auf Server, Sicherungen und Dateisystem entsprechend einschränken. Sie wird nicht ins Git-Repository eingecheckt. `DKHUB_SETTINGS_FILE` kann einen anderen Pfad bestimmen. Gespeicherte Werte haben Vorrang vor Umgebungsvariablen; ausdrücklich entfernte Schlüssel deaktivieren auch einen entsprechenden Umgebungswert. Das Admin-Passwort muss weiterhin vor dem Start gesetzt werden. Über HTTP werden Passwort und Schlüssel im Netzwerk unverschlüsselt übertragen; nutze die Oberfläche für diese Einstellungen nur über einen geschützten Zugriff und gebe sie nicht ins Internet frei.

Beim Hinzufügen oder Bearbeiten einer Anwendung können Admins **Mit KI beschreiben** wählen. Dazu zuerst Name, absolute HTTP(S)-URL und Admin-Passwort eingeben; KI und OpenAI-Schlüssel müssen aktiviert sein. DKHub lädt die einzelne Seite serverseitig und sendet den lesbaren HTML-Text an OpenAI. API-Kosten können anfallen. Der Vorschlag für Kurzbeschreibung und ausführliche Suchbeschreibung kann vor dem Speichern bearbeitet werden. Die ausführliche Beschreibung wird im App-Katalog gespeichert, ist für alle Hub-Nutzer lesbar und wird beim KI-Chat an OpenAI übermittelt. Keine vertraulichen Inhalte analysieren oder speichern.

Die Analyse folgt keinen Weiterleitungen, führt kein JavaScript aus und meldet sich nicht an. Sie erkennt daher bei vielen React-Apps nur eine leere Hülle oder eine Anmeldeseite. In diesem Fall Beschreibung manuell ergänzen. Abfragen mit Query-Parametern, Zugangsdaten und Link-Local-Adressen sind nicht zugelassen. Die Suche nutzt diese Beschreibung im Browser. Nur für freie Antworten oder Empfehlungen mit OpenAI wird sie zusätzlich als Katalogkontext an OpenAI gesendet. Das garantiert weder korrekte Beschreibungen noch eine bestimmte Antwortgeschwindigkeit. Ein Live-Test mit Anbieter-Zugang ist erforderlich.

## Kategorien und Suche

Beim Hinzufügen oder Bearbeiten einer App lässt sich eine Kategorie frei eingeben oder aus bestehenden Kategorien auswählen. Ohne Eingabe wird „Meine Apps“ verwendet. Die Kategorie wird im gemeinsamen App-Katalog gespeichert; bestehende Kategorien bleiben beim Bearbeiten erhalten. Auf der Startseite kann nach Kategorie gefiltert und gleichzeitig nach Name, Kategorie, Kurz- oder ausführlicher Beschreibung gesucht werden. Der Filter gilt für den aktuellen Browserzustand und ändert keine Katalogdaten.

## Kachelbilder, Kategorien und TV-Modus

Beim Hinzufügen oder Bearbeiten einer App kann optional ein Kachelbild hochgeladen oder entfernt werden (PNG, JPEG oder WebP, höchstens 2 MB). Das Backend speichert die Datei unter `backend/.local/images`; ein anderer Pfad ist mit `DKHUB_IMAGE_DIR` möglich. Katalog und Bilder gemeinsam sichern. Bilder sind im Heimnetz für Hub-Nutzer sichtbar. Entfernte oder ersetzte Bilder bleiben zunächst auf dem Server liegen, da sie auch von anderen Einträgen verwendet werden können; ein Aufräumprozess ist nicht enthalten. Fehlgeschlagene App-Speicherungen können ebenfalls ungenutzte Dateien hinterlassen.

Mit Bild lädt die Kachel die eingebettete Webseite erst beim Öffnen. Ohne Bild bleibt die Live-Vorschau wie bisher. Die Kategorien erscheinen als horizontale Reihen, die sich per Scrollen, Wischen oder Pfeilschaltflächen bewegen lassen; Suche und Kategorie-Filter gelten weiterhin.

Der optionale **TV-Modus** vergrößert Kacheln. Wenn eine Kachel fokussiert ist, wechseln Pfeiltasten zwischen Anwendungen und Reihen; Enter öffnet sie. Tab erreicht die übrigen Bedienelemente. Die Weitergabe von Tasten und das Verhalten eingebetteter Apps hängen vom jeweiligen TV-Browser ab; Fire TV separat testen. Der Modus gilt nur für die aktuelle Seite.

## Favoriten und Verlauf

Eine Kachel oder eine geöffnete App kann mit dem Stern zu den Favoriten hinzugefügt werden. Die Navigation zeigt Favoriten und die letzten fünf geöffneten Anwendungen. Die Listen werden nur im jeweiligen Browser gespeichert und nicht zwischen Geräten synchronisiert. Eingebettete Apps werden für eine Live-Vorschau geladen und beim Öffnen im selben Frame vergrößert. Sie bleiben beim Wechsel im Browser bestehen, solange DKHub geöffnet bleibt; einzelne Webseiten können sich selbst neu laden. Die Vorschau stellt echte Verbindungen her und kann Ressourcen benötigen; externe Links zeigen zunächst ein Platzhalterbild. Einbettung kann von Webseiten untersagt werden.

## Fenster und Links

Über „+ Fenster“ lassen sich bis zu vier einbettbare Apps nebeneinander öffnen; auf kleinen Displays stehen sie untereinander. Jedes Fenster kann geschlossen werden. Die Seitenleiste lässt sich auf großen Bildschirmen ein- und ausklappen. Einbettung hängt weiterhin von der jeweiligen Webseite ab.

Jede App erhält einen eindeutigen DKHub-Pfad, zum Beispiel `http://SERVER-IP:8000/weather`. Beim Hinzufügen kann `weather` als Pfad eingetragen werden; ohne Eingabe wird er aus dem Namen erzeugt. Vorhandene Einträge erhalten ebenfalls automatisch einen Pfad und werden beim nächsten Speichern in der Katalogdatei festgehalten. Links lassen sich im Heimnetz teilen; `localhost` funktioniert nur auf dem jeweiligen Gerät. Der Link öffnet die einzelne App, nicht die gesamte Fensteranordnung. Für externe Links bietet DKHub die Option „Neuer Tab“.

Kacheln lassen sich über das Optionsmenü (⋯) und „Bearbeiten“ mit Admin-Passwort ändern. Im geöffneten Fenster zeigt „Adresse“ die konfigurierte Ziel-URL; dort kann sie kopiert oder bearbeitet werden. Browser-Sicherheitsregeln verhindern bei fremden Seiten das Auslesen ihrer internen Navigation. Eine Kachel kann über „Entfernen“ mit Admin-Passwort gelöscht werden. Die externe Webseite und deren Daten werden dabei nicht verändert.

## Webseiten hinzufügen

Damit das Formular speichern kann, vor dem Start ein eigenes Admin-Passwort als Umgebungsvariable setzen. Beispiel für Linux/macOS:

```bash
export DKHUB_ADMIN_PASSWORD='DEIN-EIGENES-LANGES-PASSWORT'
./start.sh
```

In PowerShell: `$env:DKHUB_ADMIN_PASSWORD = 'DEIN-EIGENES-LANGES-PASSWORT'` und anschließend das eigene Startskript ausführen. Das Passwort nicht im Repository speichern. Es gilt für den laufenden Prozess und muss beim späteren Start wieder gesetzt werden. Ohne Passwort bleibt die Startseite lesbar, das Hinzufügen ist deaktiviert.

In der Bibliothek **App hinzufügen** wählen. Mit **Einbettung testen** wird die eingegebene Adresse vor dem Speichern als echte Vorschau geladen. Wenn der Bereich leer bleibt oder eine Fehlermeldung der Webseite zeigt, kann die Seite Einbettung blockieren; der Browser erlaubt keine verlässliche automatische Erkennung. Anschließend Name und erreichbare HTTP(S)-Adresse angeben und auswählen, ob die Webseite im Hub oder in einem neuen Tab geöffnet werden soll. Manche Webseiten erlauben keine Einbettung. `localhost` bezeichnet auf jedem Gerät dieses Gerät selbst; für andere Clients eine erreichbare Serveradresse angeben. HTTPS-Seiten können HTTP-Inhalte nicht einbetten.

Die mitgelieferten Beispiele stehen in `backend/apps.json`. Beim ersten Speichern wird daraus zusammen mit dem neuen Eintrag `backend/.local/apps.json`; diese Datei enthält danach den aktuellen Katalog und bleibt bei Git-Updates erhalten. Bestehende Einträge in `backend/apps.json` werden beim ersten Speichern übernommen. Danach die aktive Datei `backend/.local/apps.json` sichern. Mit `DKHUB_APPS_FILE` kann ein anderer Speicherort angegeben werden.

Der Zugriff ist für ein vertrauenswürdiges Heimnetz gedacht: Über HTTP wird das Admin-Passwort im Netzwerk unverschlüsselt übertragen. Für unzuverlässige Netze oder Internetzugriff sind HTTPS und ein geeignetes Sicherheitskonzept nötig. Keine Internet-Portfreigabe einrichten.

## Prüfungen

```bash
cd frontend && npm ci && npm run build
cd ../backend && pip install -r requirements.txt pytest httpx && python -m pytest -q tests
```

## Einstellungen in `.env` und Betrieb ohne Passwort

Unter Windows liest `start.ps1` die Datei `.env` im Hauptverzeichnis (Vorlage: `.env.example`, nicht in Git). Ihre Werte überschreiben gleichnamige Variablen der Sitzung. Unter Linux die Variablen wie gewohnt exportieren.

`DKHUB_NO_AUTH=1` schaltet die Passwortabfrage auf allen Geräten ab. Jeder im Netzwerk kann dann Kacheln ändern, API-Schlüssel setzen und, falls aktiviert, Docker-Container installieren. Nur in einem vertrauenswürdigen Heimnetz verwenden. Die Herkunftsprüfung bleibt aktiv; Verwaltungsaktionen funktionieren dann nur über IP-Adresse, `localhost` oder den Rechnernamen.

## DKDirector: einfache Docker-Dienste

DKDirector ist ein eigener Prozess im Verzeichnis `director/`. Er steuert nur Container, die er selbst angelegt und markiert hat. Die Admin-Oberfläche **Dienste** sucht öffentliche Images über Docker Hub, fragt das Image-Tag ab und installiert nach deinem Klick einen Container. Den internen TCP-Port liest der Director aus den Metadaten des geladenen Images; nennt es keinen oder mehrere, wählst du ihn selbst. Danach prüft er bis zu 30 Sekunden, ob der Dienst per HTTP antwortet. Neue Dienste starten mit Docker wieder (`unless-stopped`), sofern du sie nicht gestoppt hast. DKHub erhält danach eine Kachel mit der vom Docker-Host aus erreichbaren Adresse. Start und Stopp sind über die Dienstliste möglich. Je Dienst lässt sich dort auch die Kachel konfigurieren, als Favorit markieren, aus der Bibliothek entfernen oder wieder hinzufügen. Ohne Passwortabfrage lädt die Liste beim Öffnen automatisch.

Für die erste Version sind nur einfache einzelne Web-Container vorgesehen. Volumes, Datenbanken, Konfigurationsvariablen, automatische Updates und der Upload eigener Image-Dateien sind noch nicht enthalten. Ohne Volume können Daten beim Entfernen des Containers verloren gehen. Nur Images installieren, denen du vertraust: Container können Netzwerkzugriff und weitreichende Auswirkungen haben.

### Linux: optional aktivieren

Docker Engine und Zugriff auf Docker für den ausführenden Benutzer sind erforderlich. Die **explizite IPv4-Adresse des Servers im Heimnetz** eintragen (kein `0.0.0.0`); darauf werden neue Dienste mit einem automatisch gewählten freien Port (20000–29999) erreichbar. Der Port bleibt dem Dienst auch nach Neustarts fest zugeordnet; die IP-Adresse sollte dafür ebenfalls fest vergeben sein (zum Beispiel im Router). Früher installierte Dienste behalten ihren wechselnden Port, bis sie neu angelegt werden. Der DKDirector selbst lauscht ausschließlich auf `127.0.0.1:8765`. DKHub und Director laufen hier auf demselben Host.

```bash
export DKHUB_ADMIN_PASSWORD='DEIN-EIGENES-LANGES-PASSWORT'
export DKDIRECTOR_BIND_IP='192.168.1.50'  # durch die eigene Server-IP ersetzen
export DKHUB_ENABLE_DIRECTOR=1
./start.sh
```

Das Startskript erzeugt ein kurzlebiges gemeinsames Token und beendet seinen eigenen Director-Prozess beim Beenden. Ohne die Option bleibt der bisherige Start unverändert. Beispieltest: In **Dienste** nach `traefik/whoami` suchen, Version `v1.10.4`, den Port leer lassen und installieren. Docker Hub und der Image-Download benötigen Internet. Falls eine Aktion ausfällt oder ein Timeout auftritt: erst die Dienstliste aktualisieren und Docker auf dem Server prüfen, bevor sie wiederholt wird.

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
