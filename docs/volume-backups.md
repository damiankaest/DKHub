# Dauerhafte Daten und Backups in DKHub

DKDirector startet pro Installation einen Container per `docker run -d`. Die generierte ID `dkhub-<32 Hexzeichen>` dient als Containername. Director wählt bei der Installation einen freien festen Hostport und reserviert ihn auch für den gestoppten Dienst. Bei explizit konfigurierten Mounts legt Director benannte Volumes an und speichert die Dienstdefinition samt Zuordnung. Daten bestehender Dienste im Container-Dateisystem und anonyme Volumes aus Image-Deklarationen benötigen eine gesonderte Migration.

Auf Windows mit Docker Desktop im Linux-Modus liegen die Volume-Daten im Docker-Dateisystem. Ein kurzlebiger Linux-Hilfscontainer archiviert ein Volume mit `tar`; Python streamt das Archiv binär über die Docker-CLI in eine Datei auf dem Windows-Host. Das Volume wird bei der Sicherung nur lesbar eingehängt. Der Hilfscontainer hat ein schreibgeschütztes Root-Dateisystem, kein Netzwerk und keinen Host-Bind-Mount. Beim Restore erhält er jeweils nur das neue Zielvolume. Die Docker-Dokumentation beschreibt auch das separate Sichern des gesamten VM-Datenträgers. [Docker Volumes](https://docs.docker.com/engine/storage/volumes/) · [Docker Desktop sichern und wiederherstellen](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/)

## Bedienung in DKHub

Bei **Neuer Dienst** lassen sich unter **Dauerhafte Daten** die in der Anleitung des Images angegebenen Datenpfade eintragen. Die App muss in diese Pfade schreiben, damit ihre Daten in den Volumes liegen. Eine Rückfrage zum automatisch gesuchten Web-Port erhält die eingegebenen Mounts.

**Daten und Backups** zeigt pro Dienst die aktiven, von DKHub verwalteten Mounts und die vorhandenen Backups. Für ein Backup zuerst den Dienst stoppen. Die Wiederherstellung zeigt die Sicherungsquellen und die exakten Namen der neuen Volumes. Nach Eingabe von `RESTORE` werden diese befüllt. Für die Nutzung restaurierter Daten ist anschließend eine manuelle Aktivierung durch kontrollierte Neuerstellung des Containers nötig. Backups liegen unverschlüsselt auf dem DKHub-Rechner.

## Stoppen und Neustarten

Der Director speichert für Installationen mit Volumes Name, Image-Referenz, Container-Port, feste Host-Adresse, Hostport, Neustartregel und Volume-Zuordnung. Start/Stopp verwenden denselben Container und dieselben Volumes. Die Dienstliste meldet fehlende Volumes oder eine abweichende Mount-Zuordnung über `volume_issue`. Beim Start über DKHub prüft Director zusätzlich das Eigentumskennzeichen der Volumes und die Verfügbarkeit des festen Ports. Bestehende Container ohne gespeicherte Volume-Definition werden weiterhin über Docker verwaltet.

Neue Container nutzen Dockers `unless-stopped`. Docker Desktop startet nach einem Daemon-Neustart zuvor laufende Dienste mit der gespeicherten Containerkonfiguration. Ausdrücklich gestoppte Dienste bleiben aus. Director und Docker starten dabei keinen Restore. [Docker-Neustartregeln](https://docs.docker.com/engine/containers/start-containers-automatically/)

Der Test mit zwei echten Testvolumes prüft Stoppen, Starten, einen belegten Hostport, unveränderte Mounts, Backup und Restore. Er ändert nach dem Backup bewusst die Testdaten im Original und prüft, dass ein weiterer Start diese Änderung behält. Der echte Daemon-Neustart blieb in der gemeinsam genutzten Umgebung offen. Auf einem exklusiven Testsystem sind dafür zwei Testdienste mit derselben Neustartregel sinnvoll, einer laufend und einer ausdrücklich gestoppt. Vor und nach dem Daemon-Neustart Container-ID, Zustand, festen Port, Volume-Namen und Testdateien vergleichen.

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
| Verwaltete Volumes eines Dienstes | `--service` sichert die ursprüngliche Volume-Gruppe. `--generation` wählt alternativ eine bestimmte Restore-Gruppe. Quelle, Dienst-ID, Volume-Schlüssel, Linux-Mountpfad und Generation stehen im Manifest. Über die Director-API erstellte Bundles enthalten zusätzlich die gespeicherte Dienstdefinition. |
| Katalog | `--config` sichert `backend/.local/apps.json` oder `DKHUB_APPS_FILE`. Solange kein lokaler Katalog existiert, wird der aktive Seed `backend/apps.json` gesichert. Restore schreibt in den vorgesehenen lokalen Katalog. |
| Kachelbilder | `--config` sichert Dateien mit DKHub-Bildnamen aus `backend/.local/images` oder `DKHUB_IMAGE_DIR`, einschließlich vorhandener unreferenzierter Bilder. |
| Administratoreinstellungen | `--config --include-secrets` sichert `backend/.local/settings.json` oder `DKHUB_SETTINGS_FILE`. Die Datei kann neben dem Theme und KI-Einstellungen auch API-Schlüssel im Klartext enthalten. |
| Projektbezogene `.env` | `--config --include-secrets` sichert eine vorhandene `.env` im Projektstamm vollständig. Ob und wie der Startprozess sie lädt, hängt von der Installation ab. |

Die nummerierten `.data`-Dateien enthalten rohe TAR-Archive oder Kopien einzelner Konfigurationsdateien. SHA-256 im Manifest prüft die Integrität, bietet aber keine Authentifizierung. Backups sind unverschlüsselt. Auch Volumes und Katalogeinträge können Zugangsdaten enthalten. Für Windows ein zugriffsbeschränktes Backup-Verzeichnis mit passenden NTFS-ACLs und verschlüsseltem Speicher verwenden. Nur Backups aus vertrauenswürdigen Quellen wiederherstellen.

Zum Umfang gehören die benannten DKHub-Volumes und die oben aufgeführten Dateien. Images, Container-Schreibschichten, anonyme Volumes, Bind-Mounts, Browser-Lokalspeicher und laufende Prozessumgebung liegen außerhalb des Bundles. Bei CLI-Backups die Image-Referenz, Ports und weitere Startparameter separat aufbewahren. Der TAR-Transfer erhält gewöhnliche Dateien, Verzeichnisse, Links, Dateimodi und numerische Eigentümer. Erweiterte Attribute und ACLs sind nicht Teil der zugesicherten Wiederherstellung.

## Wiederherstellung

1. Mit den für das Ziel gültigen `DKHUB_*_FILE`- und `DKHUB_IMAGE_DIR`-Werten starten. Diese Overrides gelten auch bei `--root`. Hostdateien können zunächst in einer separaten Wiederherstellungsumgebung geprüft werden. Für die Veröffentlichung der Dateien benötigt das Ziellaufwerk Hardlink-Unterstützung, etwa NTFS.
2. `restore` prüft Manifest und Prüfsummen und zeigt Quell- und Zielvolumes sowie die Zielpfade der Hostdateien. `settings.json` und `.env` erfordern auch beim Restore ausdrücklich `--include-secrets`. Die CLI schreibt erst nach Eingabe von `RESTORE`.
3. Jeder Restore erzeugt eine neue Gruppe mit `.restore-<Generation>` im Namen. Vorhandene Volumes und Dateien bleiben erhalten. Existiert eine ausgewählte Hostdatei bereits, bricht der Restore vor dem Schreiben ab. Eine spätere Aktivierung erfordert die kontrollierte Neuerstellung des Dienstcontainers mit den im Plan genannten Mounts und den separat gesicherten Startparametern.
4. Bei einem Fehler meldet die CLI einen unvollständigen Vorgang und endet mit Status 1. Bereits geschriebene Ziele bleiben erhalten. Ein begonnenes Volume kann Teildaten enthalten. Vor einer Aktivierung die Gruppe prüfen. Bei einem neuen Versuch ein freies Konfigurationsziel verwenden.

## API für Dienstvolumes

Alle unten angegebenen Backend-Endpunkte nutzen `POST` und die bestehende Admin-Autorisierung mit passendem `Origin` und, im Passwortmodus, `X-DKHub-Admin`. Die Director-Gegenstücke sind nur auf Loopback mit `X-Director-Token` verfügbar. Dort liegen die Backup-Routen unter `/services/{service_id}/backups`, und die Liste nutzt `GET` ohne den Suffix `/list`.

**Installation** über `POST /api/director/install` mit optionalem Feld `volumes`.

```json
{
  "name": "Beispiel",
  "image": "example/service:1.0",
  "port": 8080,
  "volumes": [
    {"key": "db", "target": "/var/lib/example"},
    {"key": "media", "target": "/srv/media"}
  ]
}
```

Pro Dienst sind bis zu 16 Volume-Schlüssel möglich. Schlüssel bestehen aus Kleinbuchstaben, Ziffern und Bindestrichen, beginnen alphanumerisch und haben maximal 32 Zeichen. Ziele sind normalisierte absolute Linux-Pfade mit maximal 255 Zeichen aus Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich und Pfadtrennern. Ziele müssen eindeutig sein und dürfen sich nicht überlappen. Docker erzeugt Namen nach dem Muster `{service_id}.{key}`. `volume-nocopy` lässt das Volume leer starten, sodass der Dienst seine Daten selbst initialisieren muss.

`port` ist weiterhin optional. Bei genau einem deklarierten TCP-Port verwendet Director diesen automatisch, andernfalls liefert die API HTTP 200 mit `{"port_required":true,"ports":[...]}`. In diesem Fall wurden noch keine Volumes angelegt. Die UI soll bei ihrer erneuten Anfrage die Volume-Angaben mitsenden. Eine erfolgreiche Installation antwortet mit HTTP 201. Installierte Dienste melden `volumes` als Liste mit `key`, `target` und `name` in den Dienstdaten.

Die folgenden Pfade verwenden `/api/director/services/{service_id}/backups` als Basis. `service_id` hat die Form `dkhub-` plus 32 Kleinbuchstaben-Hexzeichen. Backup- und Plan-IDs haben jeweils 32 Kleinbuchstaben-Hexzeichen.

| Suffix | Anfrage | Erfolg |
| --- | --- | --- |
| `/list` | Ohne Body | HTTP 200, Array mit `id`, `service_id`, `created_utc` und `volumes`, neueste zuerst |
| Kein Suffix | Ohne Body | HTTP 201, ein Objekt im Format der Liste. Der Dienst muss zuvor gestoppt sein. |
| `/{backup_id}/restore/preview` | Ohne Body | HTTP 200 mit `plan_id`, `expires_in` in Sekunden, `confirmation: "RESTORE"` und `targets` mit `key`, `target`, `source` und dem genauen neuen Volume-Namen `name` |
| `/{backup_id}/restore` | `{"plan_id":"<ID aus Vorschau>","confirmation":"RESTORE"}` | HTTP 200 mit `service_id`, `backup_id`, `generation` und `volumes` mit `key`, `target`, `name` |

Die UI zeigt Quell- und Zielnamen sowie Mountpfade aus `targets` an und sendet die Bestätigung erst nach einer ausdrücklichen Benutzereingabe. Ein Plan gilt zehn Minuten, ist an genau Dienst und Backup gebunden und wird beim bestätigten Versuch verbraucht. Ein Director-Neustart verwirft ausstehende Vorschauen. Vor dem Schreiben überprüft Director die Prüfsummen und Zielkonflikte erneut. Der Restore befüllt neue Volumes und ändert die Mounts des bestehenden Containers nicht. Für die Aktivierung ist weiterhin eine kontrollierte Neuerstellung nötig.

Fehler stehen in `detail`. HTTP 403 steht für fehlende Autorisierung, 404 für ungültige IDs oder fehlende Backups, 409 etwa für einen noch laufenden Dienst, fehlende verwaltete Mounts, eine parallele Director-Operation oder einen abgelaufenen Plan. HTTP 422 meldet ungültige Eingaben oder ein bei der Vorschau nicht verwendbares Bundle. HTTP 502/503 melden fehlgeschlagene Docker-, Speicher- oder Verbindungsoperationen. Bei Teilerfolg und nach einem Verbindungsabbruch zuerst den Zustand prüfen. Die Operationen laufen synchron, sind innerhalb einer Director-Instanz mit Start/Stopp koordiniert und können bei großen Volumes die HTTP-Zeitlimits erreichen. Direkte Docker-Operationen sind von dieser Koordination ausgenommen.

Director legt Dienstdefinitionen unter `director/.local/services` und API-Backups unter `director/.local/backups/{service_id}/{backup_id}` ab. `DKDIRECTOR_DATA_DIR` ändert das gemeinsame Stammverzeichnis. Nur vollständig geschriebene Bundles mit Manifest erscheinen in der Liste. `DKDIRECTOR_BACKUP_IMAGE` wählt das lokal vorhandene Hilfsimage. Das Datenverzeichnis benötigt Zugriffsschutz sowie Hardlink-Unterstützung für die Veröffentlichung von Dienstdefinitionen. Falls ein Installationsfehler bereits angelegte Volumes hinterlässt, bleiben sie zur manuellen Prüfung erhalten. Katalog, Bilder, Einstellungen und `.env` werden weiter über die lokale CLI verwaltet. Die API für Dienstvolumes verarbeitet ausschließlich Volume-Bundles.

## Tests

```powershell
py -m unittest director.tests.test_backups -v
$env:DKHUB_TEST_DOCKER_IMAGE = 'alpine:3.22'
py -m unittest director.tests.test_backups -v
```

Ohne die Testvariable verwendet die Suite für Volume-Transfers einen Speicherersatz. Der optionale Docker-Test erzeugt zwei eigene Testvolumes, befüllt sie und prüft die restaurierten Kopien und Originale auf Dateninhalt, Symlink, Dateimodus, UID und GID. Die Bereinigung betrifft ausschließlich die Volumes der zufällig erzeugten Test-Dienst-ID.

## Zusammenführen mit der UI-Arbeit

Die Anschlusspunkte in bestehenden UI-Dateien sind `frontend/src/Director.jsx` (API-Fehlerstatus, Ladezustand, Backup-Panel), `frontend/src/director/InstallPanel.jsx` (Mount-Eingaben und erneute Anfrage mit manuell gewähltem Port) und `frontend/src/director/ServiceCard.jsx` (Volume-Fehler und Platz für das Backup-Panel). Gegen den geprüften Stand von `feature/ui-polish` bei `2870dc6` gibt es keine direkt gemeinsam geänderten Dateien. Nach dem Zusammenführen bleibt der Aufruf des Directors über die neue Navigation ein gemeinsamer Testpfad. Die Darstellung liegt in `frontend/src/director/storage.css`. `main.jsx` und die globalen Styles sind von diesem Branch unberührt.

Gegen den parallel fortgeschrittenen Stand von `main` ist `.github/workflows/ci.yml` eine gemeinsam geänderte Datei. Die Director-Testvorbereitung mit dem lokalen TAR-Hilfsimage beim Zusammenführen beibehalten.
