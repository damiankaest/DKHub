# Dauerhafte Daten und Backups in DKHub

DKDirector startet aktuell pro Installation einen Container per `docker run -d`. Die generierte ID `dkhub-<32 Hexzeichen>` dient als Containername. Labels identifizieren den verwalteten Dienst, den Anzeigenamen und den Anwendungsport. Der Hostport wird dynamisch vergeben. Es gibt weder explizite Mounts noch einen gespeicherten Deployment-Plan. Daten im Container-Dateisystem und anonyme Volumes aus Image-Deklarationen müssen bei der Migration bestehender Dienste gesondert betrachtet werden.

Auf Windows mit Docker Desktop im Linux-Modus liegen die Volume-Daten im Docker-Dateisystem. Ein kurzlebiger Linux-Hilfscontainer archiviert ein Volume mit `tar`; Python streamt das Archiv binär über die Docker-CLI in eine Datei auf dem Windows-Host. Das Volume wird bei der Sicherung nur lesbar eingehängt. Der Hilfscontainer hat ein schreibgeschütztes Root-Dateisystem, kein Netzwerk und keinen Host-Bind-Mount. Beim Restore erhält er jeweils nur das neue Zielvolume. Die Docker-Dokumentation beschreibt auch das separate Sichern des gesamten VM-Datenträgers. [Docker Volumes](https://docs.docker.com/engine/storage/volumes/) · [Docker Desktop sichern und wiederherstellen](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/)

## Lokale Bedienung

Die CLI benötigt Python ab 3.11. Für Volumes braucht sie Zugriff auf den Linux-Docker-Daemon und ein lokal vorhandenes, vertrauenswürdiges Hilfsimage mit `sh` und `tar`. Vorgabe ist `alpine:3.22`. Das Image bei Bedarf vorab mit `docker pull alpine:3.22` bereitstellen. `--helper-image` erlaubt ein anderes bereits lokal verfügbares Image oder einen Digest. Reine Konfigurationsbackups brauchen keinen Docker-Zugriff.

Beispiel mit einer vorhandenen DKDirector-ID. `provision` legt die Volumes an und gibt die `--mount`-Werte für eine spätere Containererstellung aus. Das Anlegen allein ändert die Mounts eines bestehenden Containers nicht.

```powershell
$service = 'dkhub-0123456789abcdef0123456789abcdef'
py -m director.backup_cli provision $service db=/var/lib/example media=/srv/media
py -m director.backup_cli create E:/Backups/dkhub-01 --service $service --config
py -m director.backup_cli --root E:/Recovery/DKHub restore E:/Backups/dkhub-01
```

Vor der Sicherung alle Container stoppen, die diese Volumes verwenden, und bis zum Abschluss gestoppt lassen. Für einen konsistenten Satz aus Katalog, Bildern und Einstellungen müssen auch Änderungen im Backend pausieren. Für Datenbanken ein sauberes Herunterfahren sicherstellen oder zusätzlich den anwendungseigenen Export verwenden. Die CLI prüft auf laufende Container, koordiniert aber keine Docker-Starts oder fremden Schreibzugriffe. Die Volumes eines Dienstes werden nacheinander gelesen.

Das Backup-Ziel ist ein neues Verzeichnis unter einem vorhandenen Elternverzeichnis. Erst ein abschließend geschriebenes `manifest.json` kennzeichnet die Sicherung als vollständig. Bei Fehlern liegen eventuell Teilarchive im Ziel. Für einen erneuten Versuch ein neues Ziel wählen. Das Verzeichnis als Ganzes aufbewahren.

## Umfang und Zugangsdaten

| Inhalt | Auswahl und Ablage |
| --- | --- |
| Verwaltete Volumes eines Dienstes | `--service` sichert die ursprüngliche Volume-Gruppe. `--generation` wählt alternativ eine bestimmte Restore-Gruppe. Quelle, Dienst-ID, Volume-Schlüssel, Linux-Mountpfad und Generation stehen im Manifest. |
| Katalog | `--config` sichert `backend/.local/apps.json` oder `DKHUB_APPS_FILE`. Solange kein lokaler Katalog existiert, wird der aktive Seed `backend/apps.json` gesichert. Restore schreibt in den vorgesehenen lokalen Katalog. |
| Kachelbilder | `--config` sichert Dateien mit DKHub-Bildnamen aus `backend/.local/images` oder `DKHUB_IMAGE_DIR`, einschließlich vorhandener unreferenzierter Bilder. |
| Administratoreinstellungen | `--config --include-secrets` sichert `backend/.local/settings.json` oder `DKHUB_SETTINGS_FILE`. Die Datei kann neben dem Theme und KI-Einstellungen auch API-Schlüssel im Klartext enthalten. |
| Projektbezogene `.env` | `--config --include-secrets` sichert eine vorhandene `.env` im Projektstamm vollständig. Ob und wie der Startprozess sie lädt, hängt von der Installation ab. |

Die nummerierten `.data`-Dateien enthalten rohe TAR-Archive oder Kopien einzelner Konfigurationsdateien. SHA-256 im Manifest prüft die Integrität, bietet aber keine Authentifizierung. Backups sind unverschlüsselt. Auch Volumes und Katalogeinträge können Zugangsdaten enthalten. Für Windows ein zugriffsbeschränktes Backup-Verzeichnis mit passenden NTFS-ACLs und verschlüsseltem Speicher verwenden. Nur Backups aus vertrauenswürdigen Quellen wiederherstellen.

Zum Umfang gehören die benannten DKHub-Volumes und die oben aufgeführten Dateien. Images, Container-Schreibschichten, anonyme Volumes, Bind-Mounts, Browser-Lokalspeicher, laufende Prozessumgebung und die vollständige Dienstdefinition liegen außerhalb des Bundles. Für die Wiederinbetriebnahme Image-Referenz, Ports und weitere dienstspezifische Startparameter separat aufbewahren. Der TAR-Transfer erhält gewöhnliche Dateien, Verzeichnisse, Links, Dateimodi und numerische Eigentümer. Erweiterte Attribute und ACLs sind nicht Teil der zugesicherten Wiederherstellung.

## Wiederherstellung

1. Mit den für das Ziel gültigen `DKHUB_*_FILE`- und `DKHUB_IMAGE_DIR`-Werten starten. Diese Overrides gelten auch bei `--root`. Hostdateien können zunächst in einer separaten Wiederherstellungsumgebung geprüft werden. Für die Veröffentlichung der Dateien benötigt das Ziellaufwerk Hardlink-Unterstützung, etwa NTFS.
2. `restore` prüft Manifest und Prüfsummen und zeigt Quell- und Zielvolumes sowie die Zielpfade der Hostdateien. `settings.json` und `.env` erfordern auch beim Restore ausdrücklich `--include-secrets`. Die CLI schreibt erst nach Eingabe von `RESTORE`.
3. Jeder Restore erzeugt eine neue Gruppe mit `.restore-<Generation>` im Namen. Vorhandene Volumes und Dateien bleiben erhalten. Existiert eine ausgewählte Hostdatei bereits, bricht der Restore vor dem Schreiben ab. Eine spätere Aktivierung erfordert die kontrollierte Neuerstellung des Dienstcontainers mit den im Plan genannten Mounts und den separat gesicherten Startparametern.
4. Bei einem Fehler meldet die CLI einen unvollständigen Vorgang und endet mit Status 1. Bereits geschriebene Ziele bleiben erhalten. Ein begonnenes Volume kann Teildaten enthalten. Vor einer Aktivierung die Gruppe prüfen. Bei einem neuen Versuch ein freies Konfigurationsziel verwenden.

## Anschluss an DKDirector und DKHub

- `director/main.py` kann nach Validierung der Installationsanfrage und Erzeugung der Dienst-ID `DockerVolumes.provision(service_id, [(key, target), ...])` aufrufen. Die zurückgegebenen `Volume.mount()`-Werte jeweils nach `--mount` vor dem Image an den bestehenden Docker-Aufruf anhängen. Für bestehende Images prüfen, welche Initialisierung künftig die Anwendung übernimmt; `volume-nocopy` unterbindet Dockers automatisches Kopieren aus dem Image in ein leeres Volume. Installationen ohne Mounts behalten ihren bisherigen Aufruf.
- Die Installation sollte die vollständige Dienstdefinition und die aktiven Volume-Namen dauerhaft speichern. Bei einem fehlgeschlagenen Containerstart bleiben bereits angelegte Volumes erhalten. Bestehende Dienste benötigen eine explizite Migration, falls sie Daten in anonymen Volumes oder im Container-Dateisystem haben.
- Für eine spätere API- oder UI-Anbindung in `backend/main.py` und `Director.jsx` Mount-Definitionen und die aktive Generation über den bestehenden Admin-Zugriff einbinden. Vor einer Bestätigung müssen die konkreten Ziele angezeigt werden. Die Bestätigung an genau diesen Plan binden, Zielkonflikte vor dem Schreiben erneut prüfen, den Dienst während des Backups gegen parallele Startaktionen sperren und Restore und Aktivierung als separate Vorgänge abbilden.

## Tests

```powershell
py -m unittest director.tests.test_backups -v
$env:DKHUB_TEST_DOCKER_IMAGE = 'alpine:3.22'
py -m unittest director.tests.test_backups -v
```

Ohne die Testvariable verwendet die Suite für Volume-Transfers einen Speicherersatz. Der optionale Docker-Test erzeugt zwei eigene Testvolumes, befüllt sie und prüft die restaurierten Kopien und Originale auf Dateninhalt, Symlink, Dateimodus, UID und GID. Die Bereinigung betrifft ausschließlich die Volumes der zufällig erzeugten Test-Dienst-ID.
