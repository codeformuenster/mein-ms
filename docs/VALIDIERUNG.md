# Validierung nach Entfernung der Termine

Die aktuelle Fassung enthält ausschließlich Ortsdaten und 45 Stadtteile. Alle 13.423 Termindatensätze wurden aus Quelle, Build und Downloadpaketen der neuen Anwendung entfernt. Der ursprüngliche Nutzerexport und der Produktivserver bleiben unverändert.

## Automatisierte Prüfungen

- JavaScript: Datenzählung nach explizitem Ausschluss, eindeutige Orts-IDs, Ortsfelder, Kategoriesuche, Freitext, Straße, Distanz, Umkreis, Polygon/MultiPolygon und Stadtteilfilter.
- Rückfallschutz: Termindatei fehlt in Quelle und Build; alte Kategorie-/Archiv-/Datumsparameter aktivieren keine Terminfunktion; Laufzeitcode lädt keine Termindaten; Oberfläche enthält keine Termin- oder Archivverweise.
- Python: GeoJSON-Eigenschaften und IDs, Duplikate, fehlende IDs, Projektion, Achsenfolge, ungültige Koordinaten und Geometrien. Die ausgeschlossene Kategorie wird abgelehnt.
- Sichere URLs, begrenzte Parameter und gerundete Suchlinks; statische Einstiege; kein Elasticsearch-/PHP-Aufruf.

## Browserabnahme

Die vorangegangene Abnahme der Ortsfunktionen umfasste geladene basemap.de-Kacheln, 326 Spielplätze, 25 davon in Gievenbeck, Detailansicht und Straßensuche nach Hagelbachstiege (Krullys) sowie mobile Karten-/Listenumschaltung. Diese Ortsdaten sind unverändert.

Nach der Bereinigung geprüft: Laden ohne JavaScript-Fehler, keine Termin-/Archivbedienung, Spielplatzsuche mit 326 Ergebnissen und der alte Einstieg /aktuelles/. Dieser Einstieg enthält keine Anwendungskopie und leitet nur auf die Karte weiter. Auch alte Kategorie-/Archivparameter werden beim Laden entfernt. Die aktualisierte Vorschau wurde gespeichert. Nach den weiteren Reparaturen: 25 Tests erfolgreich (11 JavaScript, 14 Python), einschließlich Gruppierung Pleistermühlenweg, idempotenter Kategorieersetzung, Fehlerschutz und Rollback. Die aktuelle Quellenlage und echte Importergebnisse stehen in IMPORT.md und import-reports/.

## Grenzen

Kein Produktivdeployment und keine Serveränderung. Standortfreigabe nicht ausgelöst. Keine separate Abnahme in Safari/Firefox. Datenaktualität und Betreiber-/Hostingangaben bleiben vor Veröffentlichung zu bestätigen. Kein neuer Aktualisierungsjob eingerichtet.

## Letzte Überarbeitung

217 kartierbare NRW-Kitas (Quell-Dateistand 02.06.2025), zwei beanstandete Koordinatenfälle im Bericht, 25 lokale Still-/Wickelplätze. Insgesamt 2.428 Quelleneinträge; zusammengefasste Orte können weniger sein. Neues lokal ausgeliefertes Pexels-Prinzipalmarkt-Foto und farbiges Layout. Der letzte Quellprüflauf bestätigt die weiterhin blockierten Stadt-/OSM-Abrufe, ohne den Altbestand zu überschreiben.
