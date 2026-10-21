# Datenpflege ohne Elasticsearch

Die fertige Website liest ausschließlich `data/places.json`, `data/districts.json` und `data/metadata.json`. Ein Datenupdate erfolgt beim Erstellen einer neuen statischen Version. Die Website benötigt dazu weder einen Suchserver noch PHP; ein Aktualisierungsjob kann später auf einem separaten Rechner laufen.

## Neue GeoJSON-Daten übernehmen

1. Aktuelle Quelle und Nutzungsrechte prüfen; geprüfte Daten als WGS84-GeoJSON (`FeatureCollection`, `Point`, Koordinaten `[Längengrad, Breitengrad]`) lokal speichern. WFS-Antworten ggf. vorher nach EPSG:4326 transformieren. Die historischen Quell-URLs stehen in `ANALYSE.md`; ihre heutige Verfügbarkeit und ihre Schemas sind nicht bestätigt.
2. Quellordner oder Git-Stand vor der Änderung sichern. Der Import ersetzt **eine ganze Kategorie**, damit gelöschte Einrichtungen nicht unbegrenzt weitergeführt werden. Er überschreibt keine anderen Kategorien.
3. Beispiel für eine vorbereitete Datei `spielplaetze.geojson` mit den Eigenschaften `ID` und `Name` (URL und Lizenz durch die tatsächlich geprüften Angaben ersetzen):

```sh
python3 scripts/import_geojson.py spielplaetze.geojson \
  --category playground --id-field ID --name-field Name \
  --source-url 'URL-DER-GEPRUEFTEN-QUELLE' --license 'LIZENZ-DER-QUELLE'
python3 scripts/build.py
npm test
```

Das Skript benötigt nur Python 3, liest lokale Dateien und führt keine Netzanfragen aus. Es prüft stabile eindeutige IDs, Punktgeometrie, Projektion und Koordinaten im Raum Münster. Eine leere Antwort ersetzt den Bestand nur mit dem ausdrücklich gesetzten `--allow-empty`. Eine Kategorie erhält neue stabile IDs `static:KATEGORIE:QUELL-ID`; alte Links zu den exportierten ES-IDs dieser Kategorie werden dadurch ungültig. Für dauerhafte Links beim ersten produktiven Update eine geprüfte ID-Zuordnung pflegen.

Termine werden weder importiert noch ausgeliefert. Die Kategorie `event` wird vom Importwerkzeug abgelehnt.

Der Import legt eine `.bak`-Datei der bisherigen Kategorie-Datei an und vermerkt Quelle, Lizenz, Zeitpunkt, Dokumentzahl und Eingabe-Prüfsumme in `metadata.json`. `.bak` und `.tmp` werden nicht in `dist/` übernommen. Für einen vollständigen Rückweg auch `metadata.json` und den vorherigen Release sichern. Aktualisierungen von Anwendung und Daten immer als zusammengehörigen Release austauschen.

Die mitgelieferten Tests enthalten zusätzlich die einmaligen Migrationszahlen der Originaldaten. Nach einem beabsichtigten Kategorieupdate werden diese festen Erwartungen nicht mehr passen: `tests/search.test.mjs` um die neue geprüfte Referenz ergänzen; die Prüfungen gegen `sourceCounts` nur für den ursprünglichen Export verwenden. Such-, Geo-, Sicherheits- und Ausschlusstests weiterlaufen lassen.

## Andere Formate

Das öffentliche Dateiformat ist ein Array von Objekten:

```json
{
  "id": "static:wc:beispiel",
  "sourceId": "beispiel",
  "sourceType": "static",
  "lat": 51.96,
  "lon": 7.62,
  "source": {
    "name": "Beispiel-WC",
    "type": "wc",
    "address": {"street": "Beispielstraße 1", "geo": {"lat": 51.96, "lon": 7.62}},
    "properties": {"Öffnungszeiten": "Angaben aus der geprüften Quelle"}
  }
}
```

CSV-Daten können mit Python-Standardbibliothek `csv` in dieses Format oder GeoJSON umgewandelt werden. Datenfelder nicht zu HTML zusammensetzen. `source` bleibt der vollständige fachliche Datensatz. Stadtteilgrenzen bleiben eine `FeatureCollection` aus Polygon/MultiPolygon mit `properties.Name`, `properties.Nr`, `id` und `center` als GeoJSON-Punkt.

## Keine ungefragte Automatisierung

Es wurden keine neuen Cronjobs, WFS-Aufrufe, Scraper oder externen Dienste eingerichtet. Den alten ES-Importer erst nach dem Wechsel deaktivieren (siehe `MIGRATION.md`). Ein neuer Job sollte erst nach Prüfung der aktuellen Quell-Schnittstellen und Datenrechte eingerichtet werden; fehlgeschlagene/unerwartet leere Quellantworten dürfen den letzten guten Release nicht ersetzen.
