# @dkforge/ui

Importiere `Panel`, `Button` und `Field` aus `@dkforge/ui` und einmal
`@dkforge/ui/styles.css`. Theme-Farben lassen sich über die
`--dkf-*`-Variablen überschreiben. `Field` braucht eine eindeutige ID,
um das sichtbare Label mit dem Eingabefeld zu verbinden.

DKForge legt diese Version als lokale Paketkopie in `ui/` ab. Das Projekt
kann damit unabhängig von DKHub gebaut werden. Die Bibliothek lässt sich
mit `npm pack` im Ordner `ui` als separates npm-Paket beziehen.
Bei einer Aktualisierung Version und Changelog prüfen, die Kopie ersetzen
und im Frontend das Lockfile mit `npm install --package-lock-only` erneuern.
