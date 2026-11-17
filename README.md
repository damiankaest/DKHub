# DKHub

Eine schlanke Startseite für eigene Web-Apps und Links im Heimnetz. Die erste Version enthält zwei fest konfigurierte Beispiele: eine lokale Demo zum Einbetten und einen externen Link. Sie verfügt noch über kein Backend, keine Anmeldung und keine Docker-Verwaltung.

## Lokal starten

Voraussetzung: Node.js 24 und npm.

```bash
npm ci
npm run dev
```

Die von Vite angezeigte lokale Adresse im Browser öffnen. Für Tests von einem anderen Gerät im selben Netz die angezeigte Netzwerkadresse und den Port verwenden; Erreichbarkeit hängt von Netzwerk und Firewall des Servers ab. Dieser Entwicklungsserver ist für lokale Tests gedacht, nicht für die Freigabe ins Internet.

Produktionsbuild testen:

```bash
npm run build
npm run preview
```

## Kacheln anpassen

Die vorläufigen Einträge stehen in `src/apps.js`. Eine Kachel mit `mode: 'embed'` öffnet die URL innerhalb des Hubs; `mode: 'external'` öffnet sie in einem neuen Tab. Nur vertrauenswürdige URLs eintragen. HTTPS-Seiten können keine unsicheren HTTP-Inhalte einbetten. Manche Apps blockieren die Einbettung; dann den Link im neuen Tab öffnen. Eine vom eigenen Computer aus erreichbare `localhost`-Adresse bezeichnet auf jedem anderen Gerät dessen eigenen Computer; für das Heimnetz die vom Client erreichbare Serveradresse verwenden.

Nächste Schritte: Backend für die Registry, eigene Web-Apps anbinden, danach Docker-Apps testen und erst später deren Verwaltung und Projektvorlagen ergänzen.
