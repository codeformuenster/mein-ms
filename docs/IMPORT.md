# Aktualisierung und zusammengefasste Orte

## Benutzung im Projekt

Die neue Anwendung liegt in `static-app/`. Der Einstieg `import-scripts/import.sh` ruft jetzt den neuen statischen Importer auf; er startet weder Docker noch Elasticsearch.

```sh
# Aus dem Repository-Hauptverzeichnis: alle Quellen nur prüfen
./import-scripts/import.sh --source all --allow-unlocated

# Aktuell erreichbaren Kita-Datensatz übernehmen
./import-scripts/import.sh --source kindergarden --apply --allow-unlocated

# Lokale Still-/Wickelplatzdatei neu einlesen (keine neue externe Erhebung)
./import-scripts/import.sh --source babychange --apply

# Anschließend neu bauen, testen und lokal ansehen
cd static-app
python3 scripts/build.py
npm test
npm run dev
```

Kein Paketdownload nötig: Python 3 für die Importe, Node ≥18 für die JavaScript-Tests. `dist/` ist das veröffentlichbare Ergebnis. `--apply` ändert ausschließlich `site/data` im lokalen Checkout. Ein Produktivserver wird damit nicht berührt. Ein Build veröffentlicht ebenfalls nichts.

## Tatsächlich geprüft am 21.10.2026

| Quelle | Ergebnis |
|---|---|
| Kitas NRW | Offizieller CSV-Download erreichbar, Dateistand 02.06.2025. 219 Zeilen mit Ortsangabe Münster: 217 mit verwendbaren Koordinaten übernommen. Eine fehlende Koordinate und eine Koordinate außerhalb Münsters werden im Bericht mit allen Quellangaben aufbewahrt. |
| Still-/Wickelplätze | Lokale CSV des bisherigen Projekts wieder einlesbar: 25 Datensätze. Der ES-Export enthielt nur 24; die neue ID aus Name und Adresse verhindert Zusammenfälle der alten verlustbehafteten Namens-IDs. Kein Nachweis aktueller fachlicher Erhebung. |
| Stadt Münster WFS | Historische `mapserv706`-URLs sind nicht mehr nutzbar: curl liefert HTTP 404, der Python-Abruf teilweise Umleitungsschleifen. Alle betroffenen Kategorien bleiben auf ihrem bisherigen Bestand. |
| Open-Data-Portal Münster | Von dieser Umgebung aus Verbindungszeitüberschreitung. Aktuelle Ersatz-Downloads können daher nicht verlässlich aufgelöst werden. Die offiziellen GovData-Metadaten sind erreichbar, verweisen aber auf das nicht erreichbare Portal. |
| Recycling / OpenStreetMap | Adapter für Nodes, Ways und Relations vorhanden; echte Abrufe lieferten HTTP 406 bzw. Zeitüberschreitung. Keine Ersetzung der bisherigen 61 Quellobjekte durch leere Daten. |

Die Herkunft wird mit Quelle, Lizenz, Prüfsumme, Datei-/Abrufdatum und Dokumentzahl protokolliert. Ein Metadaten-Änderungsdatum im Katalog bedeutet nicht, dass die fachlichen Daten neu erhoben wurden. Die Oberfläche trennt daher Quell-Dateistand und Übernahmezeitpunkt.

## Fehlertoleranz und Wiederholung

- Ohne `--apply` nur Prüfung. Bei Fehlern Exitstatus 2 und Bericht unter `docs/import-report.json` bzw. `docs/import-reports/`.
- Standardmäßig verhindert ein Fehler die Übernahme des gesamten ausgewählten Laufs. Mit `--allow-partial` lassen sich bewusst nur die erfolgreichen Kategorien übernehmen; das Ergebnis bleibt wegen fehlgeschlagener Quellen Exitstatus 2.
- Stabile, mit Kategorie versehene Quell-IDs. Eine Aktualisierung ersetzt eine ganze Kategorie. Wiederholung erzeugt keine zusätzlichen Datensätze; entfernte Quellobjekte verschwinden beim erfolgreichen Austausch.
- Leere Ergebnisse, HTML/XML-Fehlerseiten, erkennbare WFS-Kappung, Schemaänderungen, ungültige IDs und auffälliger Bestandsverlust werden abgelehnt. Bei einer WFS-Quelle mit begrenzten Ergebnissen wird abgebrochen; dann ist eine vollständige Download- oder Paginierungslösung zu konfigurieren.
- Standardmäßig stoppen fehlende/falsche Koordinaten den Import. Für die konkret geprüften Kita-Quellfehler erlaubt `--allow-unlocated` die Übernahme des verwendbaren Restes. Die problematischen Zeilen stehen vollständig im Bericht und erscheinen nicht als erfundene Kartenpunkte.
- Eine Reduktion auf unter 60 % des bisherigen Bestands verlangt nach Prüfung `--allow-large-drop`.
- Änderungen erst nach Prüfung aller ausgewählten Quellen. Vollständige Sicherung von `site/data` vor Übernahme unter `backups/`, außerhalb des Webroots. Bei Schreibfehlern Rollback beider geänderter Dateien. Importer nacheinander ausführen. Den vollständigen vorherigen Release für Rückwege aufbewahren.
- Bei Bedarf `--input /pfad/zur/datei` für genau eine ausgewählte Quelle: derselbe geprüfte Adapter arbeitet dann ohne Netzwerk. `sources.json` enthält Endpunkte, Namen-/ID-Felder und Lizenzangaben. Erreichbare, geprüfte Ersatz-GeoJSON-Downloads können dort gezielt eingetragen werden. Keine Zugangsdaten aus den alten Skripten übernommen.
- Termine bleiben vollständig ausgeschlossen, auch aus neuen Quellen und Importkonfigurationen.

`*.applied.json` dokumentiert die letzte tatsächliche Übernahme einer Kategorie; ein späterer Prüflauf überschreibt diese Übernahmebelege nicht.

## Doppelte Anzeige Pleistermühlenweg

Die beiden ursprünglichen Datensätze 364 und 430 gehören zur gleichen Sportanlage und haben identische Koordinaten. Sie unterscheiden sich fachlich: Bezirkssportanlage (überlassen) und Sondersportanlage (Bouleanlagen).

Die Suchansicht fasst benannte Einträge mit identischem normalisiertem Namen, gleicher Kategorie und gleichem Punkt (Koordinaten auf sechs Nachkommastellen) zusammen. Alle Original-IDs und Eigenschaften bleiben als Varianten erhalten. Die Karte zeigt einen Ort; Details erklären die mehreren Angebote. Alte Links auf eine der Varianten öffnen den gemeinsamen Ort.

Andere Kategorien an derselben Stelle, benachbarte Anlagen und namenlose Einträge werden nicht zusammengelegt. Quelleneintragszahlen und die Zahl sichtbarer Orte können deshalb voneinander abweichen. Kategorien in der Oberfläche zeigen die Zahl zusammengefasster Orte.

## Belege

- https://www.opengeodata.nrw.de/produkte/bildung_wissenschaft/kitas/
- https://www.govdata.de/ckan/dataset/bader.ttl
- https://www.stadt-muenster.de/katasteramt/geodatenmanagement/open-data
- Historische Quelleinstellungen im bisherigen `import-scripts/geojsonwfs/`.

Die übrigen Quellen sind ausdrücklich noch nicht repariert abrufbar. Sobald gültige Ersatzadressen bzw. das städtische Portal verfügbar sind, kann derselbe Importweg deren GeoJSON ohne Elasticsearch übernehmen. Es wurden keine neuen Cronjobs eingerichtet.
