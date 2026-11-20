# DKHub · Design und Abnahme für den ersten Heimnetz-Release

**Ziel:** Gäste erkennen ihre Apps sofort. Beim Öffnen gehört die Fläche der App. Verwaltung und Gestaltung sind von der alltäglichen Nutzung getrennt. Der Hub bleibt React + CSS und FastAPI; neue UI-Pakete und weitere Container sind dafür nicht erforderlich.

| Schritt | Gestaltung | Woran wir Erfolg erkennen |
| --- | --- | --- |
| 1. Bibliothek | Kompakte Navigation, Suche und Kategorien vor den App-Reihen. Bild, App-Name und Öffnungsart haben Vorrang vor Verwaltungsaktionen. | Eine App ist ohne Kenntnis ihres Namens auffindbar. Filtern, Favorisieren, Öffnen und Zurückkehren funktionieren auch per Tastatur. |
| 2. Erscheinungsbild | Gemeinsame Farben, Typografie, Formen, Zustände und Fokusmarkierungen für Katalog, Viewer, Chat und Verwaltung. Hell/Dunkel plus Anime und Weihnachten. | Kein horizontaler Seitenüberlauf am Handy. Das sichtbare Fokusziel ist im TV-Modus erkennbar. Fremde Apps behalten ihr eigenes Design. |
| 3. Theme-Studio | Admin sieht Muster, probiert sie lokal aus und aktiviert ein Design für alle. Eigene Rezepte entstehen manuell oder aus einem KI-Entwurf. | Vorschau darf das aktive Design anderer Clients nicht ändern; Abbrechen stellt es wieder her. Ein gespeichertes Design überlebt Neuladen und Serverneustart. |
| 4. Abnahme | Browserabläufe für Katalog, Theme-Wechsel, reduzierte Bewegung, Mehrfenster, Admin und Fehlerfälle. | CI inklusive Docker-Test ist grün. Geräteabnahme auf dem Homeserver erfolgt separat. |

**Vor Freigabe im Haus:** Eine App auf dem Handy öffnen und zwischen zwei Fenstern wechseln; am Fire TV mit Richtungstasten, OK und Zurück testen. Mit einem freigegebenen OpenAI-Schlüssel einen Theme-Entwurf anfordern und erst nach Sichtprüfung aktivieren. Ein einfaches Test-Image mit DKDirector installieren, vom zweiten Gerät erreichen, stoppen und wieder starten. Die Docker-Steuerung existiert bereits; die Prüfung auf diesem konkreten Host steht separat an.
