# Befund und Umsetzung

Untersucht: `/home/bob/git/muenster-dashboard`, insbesondere `src/Services/SearchService/searchService.js`, `src/Services/DistrictService/districtService.js`, `src/Router/Pages/Home/Home.js`, `src/Components/LunchMap/LunchMap.js`, `src/Constants/SearchTerms.js` sowie `import-scripts/`.

## Die bisherigen Abfragen

| Abfrage | Bisheriges Verhalten | Statische Umsetzung |
|---|---|---|
| `districts/_search`: Laden | Bis zu 100 Features; `properties`, `center`, `geometry`; alphabetisch nach Name | Alle 45 Features lokal in `districts.json`; alphabetische Auswahl |
| `districts/_search`: Koordinaten | `geo_shape` mit Relation `contains`, Punkt `[lon, lat]`; erster passender Stadtteilname | Point-in-Polygon für Polygon und MultiPolygon, einschließlich Löchern; für Grenzpunkte wird deterministisch ein angrenzender Stadtteil gewählt |
| `places/_search`: Suche | `size` 200 (News-Variante 15), `type` per Kategorie/`wildcard`, `date_start` aufsteigend, Entfernung per `plane` | Vollständiger lokaler Datenbestand mit Seitendarstellung; lesbare Kategorie, Name, Straße und Eigenschaften werden durchsucht; Haversine-Entfernung und explizite Sortierung |

Die News-Variante ist dieselbe Suchabfrage mit einem anderen Limit, keine zusätzliche Datenquelle. `/aktuelles` war im aktuellen Quellcode lediglich eine Überschrift „News“; dieser alte Einstieg führt nun ausschließlich zurück zur Karte.

## Bewusst verbesserte Semantik

- Das alte Suchfeld sendete den eingegebenen Text als `wildcard` gegen `type`, nicht als Volltext gegen Ortsnamen. Es werden jetzt zusätzlich Namen, Adressen und Eigenschaften durchsucht. Keine Regex-Auswertung der Nutzereingabe.
- Die `should`-Klauseln für 2 km Umkreis und Termine (`now-1d` bis `now+2d`) waren bei gleichzeitigem `must` nicht verpflichtend (ohne `minimum_should_match`). Die neue Oberfläche bietet den Umkreis als eindeutigen Filter. Termine werden auf Wunsch des Nutzers vollständig ausgeschlossen.
- Die Stadtteilauswahl verschob früher den Suchmittelpunkt; der räumliche Stadtteilfilter und die Flächenübergabe an die Karte waren im aktuellen Home-Code auskommentiert. Die neue Auswahl filtert tatsächlich innerhalb der Fläche und zeigt deren Grenze.
- „Stillplätze“ war fälschlich auf `kindergarden` abgebildet. Korrekt ist `babychange` mit 24 Datensätzen.
- Die bisherige Kategorieauswahl enthielt keine Schulen, Sportstätten, Büchereien, Bücherbusse, Friedhöfe und Ämter, obwohl diese Daten vorhanden sind. Sie sind nun direkt auswählbar.
- `construction`, `lunch`, `webcam` bleiben als Kategorien erhalten, sind aber im gelieferten Export leer; die Oberfläche meldet das transparent.
- Abfalleimer dominieren mit 1.332 Einträgen. Sie sind in der ungefilterten Entdeckeransicht ausgeblendet und über Kategorie oder Suchtext vollständig auffindbar.
- Kein Zugriff auf `payment_methods.push` bei fehlendem Array; 30 Datensätze ohne Namen bleiben mit einer Kategoriebezeichnung nutzbar.
- Alle ursprünglichen Datenfelder sind unter `source` erhalten. Technische ID und sämtliche Eigenschaften sind in der Detailansicht verfügbar. Datensatztexte werden als Text ausgegeben, URLs nur mit HTTP(S) zugelassen.

## Quellen und Aktualität

ZIP: `mein-ms-export-20261021T203627532631Z.zip`. Prüfsummen, Zahl der Dokumente und eindeutige IDs wurden geprüft. Auf ausdrücklichen Wunsch werden die 13.423 Termine verworfen. Es bleiben 2.368 Orte und 45 Stadtteil-Features. Die Migration überspringt die ausgeschlossene Kategorie vor jeder weiteren Verarbeitung; es wird keine Termindatei erzeugt. Exportdatum ist **kein** Nachweis aktueller Ortsinformationen.

| Bestand | Herkunft laut altem Code | Bisheriger Import |
|---|---|---|
| Bäder, Ämter, Bücherbus, Büchereien, Friedhöfe, WCs, WLAN, Abfalleimer | Stadt Münster WFS, historisch `mapserv706/poiserv` | GeoJSON-WFS-Worker |
| Kitas, Schulen, Spielplätze, Sport | Münster WFS (`kitaserv`, `schulenserv`, `odspielplserv`, `odsportstserv`) | Kategorieweise Worker |
| Recycling | `container.json`, aus Overpass/OpenStreetMap | Python mit Elasticsearch-Client |
| Still-/Wickelplätze | `stillplaetze.csv`, Stillflyer des Kreisverbands der Hebammen Münster | Python mit Elasticsearch-Client |
| Stadtteile | `import-scripts/districts/data/districts.json` | GeoJSON-Dokumente mit Zentrum |
| Historische WN-News/Webcams | separates PHP-Scraping unter `wn-events-news-cams/` | Kein entsprechender Datenbestand im Export |

Die alten WFS-URLs werden nicht ungeprüft als aktuelle Schnittstellen weiterverwendet. Die neue Datenpflege übernimmt geprüfte WGS84-GeoJSON-Dateien direkt und benötigt weder PHP noch Elasticsearch. Kein Scraper oder Schlüssel wird mit ausgeliefert.

## Karte

basemap.de Web Raster Farbe; WMTS GLOBAL_WEBMERCATOR, 256-px-Kacheln. Aktuelle Capabilities geprüft am 21.10.2026: Matrix-IDs `00` bis `19`; der Client formatiert zweistellig und begrenzt die Ansicht auf Zoom 18. Farbe und Grau sind laut Produktbeschreibung möglich, hier wird Farbe verwendet. Kein API-Schlüssel nötig. Attribution sichtbar mit verlinktem BKG und CC BY 4.0 sowie Jahr des Datenbezugs. Unveränderte Rasterkarte, eigene Overlay-Ebenen separat.

- Produkt/Einbindung: https://basemap.de/produkte-und-dienste/web-raster/
- Nutzungsbedingungen: https://sgx.geodatenzentrum.de/web_public/gdz/lizenz/deu/nutzungsbedingungen_basemapde.pdf
- Capabilities: https://sgx.geodatenzentrum.de/wmts_basemapde/1.0.0/WMTSCapabilities.xml
- Leaflet: https://leafletjs.com/download.html

Leaflet 1.9.4 (stabile Version laut offizieller Downloadseite am Prüftag) liegt lokal. SHA-256 Base64 entspricht den offiziellen Hashes: JS `20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=`, CSS `p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=`.

Impressum: Inhalt aus dem alten Quellcode übernommen, bisherige Datenschutzerklärung durch eine Beschreibung der neuen tatsächlichen Technik ersetzt. Der ursprüngliche Betreiber wird nicht neu bestimmt. Betreiber/Hostingangaben und Datenrechte sind vor Veröffentlichung zu bestätigen. Die CC-BY-Lizenz der Hintergrundkarte macht keine Aussage über die Lizenzen der POI-Daten.
