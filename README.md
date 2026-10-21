# Mein Münster – statische Neufassung

Fertige Website: **`dist/`**. Diesen Ordner als Webroot ausliefern. Kein PHP, kein Elasticsearch, keine Datenbank und kein Node.js im Produktivbetrieb. Nur die Hintergrundkarte wird von basemap.de geladen. Leaflet, Schriften (Systemschriften), Symbole und alle Suchdaten liegen lokal.

## Lokal ansehen

Python 3 ist ausreichend:

```sh
python3 -m http.server 4175 --bind 127.0.0.1 --directory dist
```

Anschließend `http://127.0.0.1:4175/` öffnen. Auf einem Server einen SSH-Tunnel verwenden; für die Standortfreigabe benötigt der Browser HTTPS oder localhost.

## Enthalten

- 2.428 Quelleneinträge und 45 Stadtteile, darunter 217 Kitas aus dem NRW-Download (Dateistand Juni 2025) und 25 Still-/Wickelplätze. Gleich benannte Anlagen am gleichen Punkt erscheinen einmal mit allen Quellangaben in den Details. Die 13.423 Termine wurden auf Wunsch vollständig entfernt und werden auch bei erneuter Migration ausgeschlossen.
- Volltextsuche nach Name, Straße, Kategorie und Eigenschaften; kombinierbar mit Kategorie, echter Stadtteilfläche und Suchradius.
- Entfernungssortierung und A–Z; Ergebnisliste mit nachladbaren Einträgen, zusammengefasste Kartenmarker, Details und externe Informationslinks.
- Standortsuche erst auf Knopfdruck; Suche durch Klick auf einen Stadtteil oder über den Kartenmittelpunkt.
- Teilbare Such- und Ortslinks; mobile Karten-/Listenansicht; Tastaturbedienung und Dialoge.
- `/copyright/`, `/impressum/` und `/datenschutz/` sind statische Seiten. `/aktuelles/` führt nur noch zur Karte zurück.

## Erneut bauen und testen

```sh
python3 scripts/build.py
npm test
```

Node.js ≥ 18 dient nur den Tests. Es ist keine Paketinstallation nötig. `site/` ist die bearbeitbare Quelle, `dist/` das generierte Ergebnis.

Export erneut übernehmen:

```sh
python3 scripts/build.py --export /pfad/mein-ms-export.zip
```

Beim erstmaligen Wiederaufbau ohne vorhandene Impressumsdatei zusätzlich `--legacy /pfad/zum/alten/checkout` angeben. Die mitgelieferten Daten und Impressumsdateien sind bereits übernommen; der Original-Checkout wird für normale Builds nicht benötigt.

Reparierte Importe und aktuelle Quellenlage: **`docs/IMPORT.md`**. Quellen prüfen: `python3 scripts/update_data.py --source all --allow-unlocated`. Kitas aktualisieren: `python3 scripts/update_data.py --source kindergarden --apply --allow-unlocated`. Der Quell-Dateistand und das Abrufdatum sind getrennt. Einige alte Stadt-URLs und der OSM-Abruf sind derzeit nicht nutzbar; fehlgeschlagene Abrufe ersetzen niemals den vorhandenen Bestand.

Neue GeoJSON-Dateien ohne Elasticsearch übernehmen: siehe `docs/DATENPFLEGE.md`.

## Umstellung

Konkrete Schritte, Rückweg und spätere Elasticsearch-Abschaltung: **`docs/MIGRATION.md`**. Quellcodeanalyse und Unterschiede: **`docs/ANALYSE.md`**. Datenzählung und Prüfsummen: `docs/migration-report.json`.

Es wurden keine Server, Domains, Container oder Cronjobs verändert und nichts veröffentlicht. Die neue Anwendung liegt im bestehenden Repository unter `static-app/`; dessen README und Import-Einstieg verweisen auf die neue Version. Vor einer öffentlichen Umstellung die Betreiberangaben im übernommenen Impressum, die Hosting-Angaben zum Datenschutz sowie die ursprünglichen Datenlizenzen bestätigen; diese Informationen sind aus dem Export allein nicht aktuell nachweisbar.

## Gestaltung und Bild

Farbenfrohe Münster-Gestaltung mit lokal ausgeliefertem Prinzipalmarkt-Foto von Ramon Karolan (Pexels), Leezen-Motiv und farbigen Kategorien. Fotoquelle und Lizenz: `site/assets/PHOTO-CREDIT.md`.
