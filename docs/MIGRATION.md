# Bereitstellung und spätere Abschaltung

**Dieses Dokument ist eine Anleitung. Keiner der folgenden Serverschritte wurde ausgeführt.** Die laufende Website, Apache, Docker und Elasticsearch wurden nicht verändert. Die neue Version ist lokal unter `dist/` fertig vorbereitet. Tippfehler in Pfadbeispielen nicht blind übernehmen: Pfade und VHost-Dateien vorab am tatsächlichen Server feststellen.

## 1. Bestand und Rückweg sichern

- Das ursprüngliche Export-ZIP bleibt als unveränderte Sicherung beim Nutzer; seine Termindaten werden nicht in die neue Website übernommen. Eine Aufbewahrung oder Löschung dieser ursprünglichen Sicherung ist getrennt von der Bereinigung der Anwendung. Das ZIP ist ein Datenexport für die Migration, kein Elasticsearch-Snapshot; Plugins, Benutzer, weitere Indizes und Clusterkonfiguration sind darin nicht enthalten.
- Bestehenden Webroot, Compose-Dateien, `.env`, Apache-VHosts und Import-/Cron-Konfiguration vertraulich sichern. Zugangsdaten nicht ins öffentliche `dist/` kopieren.
- Aktive Container und Datenablage prüfen. Insbesondere zeigt die alte Repo-Compose-Datei eine auskommentierte Persistenz: einen Container **nicht löschen oder neu erstellen**, bevor dessen Datenablage gesichert ist.

Nur lesende Bestandsaufnahme auf dem Server:

```sh
docker inspect familien-dashboard_elasticsearch_1 --format '{{json .Mounts}}'
docker inspect familien-dashboard_elasticsearch_1 --format '{{json .HostConfig.RestartPolicy}}'
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Image}}'
curl --fail --silent --show-error http://127.0.0.1:9202/_cat/indices?v
apachectl -S
crontab -l
systemctl list-timers --all
```

Cronjobs anderer Nutzer/root und externe Crawler separat erfassen. Prüfen, ob andere Anwendungen Indizes oder den Port 9202 verwenden. Im Frontend bestand ein alternativer Suchhost `elasticsearch.codeformuenster.org/mein-ms2-`; die neue Version verwendet ihn nicht. Ein eigener Datenexport belegt nicht, dass niemand sonst den lokalen Container nutzt.

## 2. Neuen Release separat bereitstellen

Den **Inhalt von `dist/` einschließlich `.htaccess`** in ein neues, leeres Release-Verzeichnis außerhalb des bisherigen Webroots kopieren. Beispiele: `/var/www/mein-ms/releases/2026-10-21-static/`. Diese Pfade sind Vorschläge, keine festgestellte Infrastruktur.

Nur die Dateien von `dist/` veröffentlichen, nicht das vollständige Projekt, Export-ZIP, Tests, Backups oder Importskripte. Kein `npm install` auf dem Server erforderlich. MIME-Typ für `.mjs`: `text/javascript`. Daten haben `application/json`. Die vier alten/neuen Unterseiten haben echte `index.html`-Dateien und brauchen keine SPA-Umschreibung.

Für die Abnahme eine bestehende Staging-Domain oder einen SSH-Tunnel verwenden. Keine neue DNS- oder Serveränderung ist Bestandteil dieser lokalen Arbeit. Auf HTTPS achten, damit die Standortfunktion funktioniert.

Vorher Betreiberangaben im aus dem alten Projekt übernommenen Impressum bestätigen. Die dort erwähnte Organisation wurde nicht als heutiger Betreiber verifiziert. Die Datenschutzerklärung beschreibt die Anwendung; konkrete Hosting-/Protokollierungsangaben ergänzen. POI-Quelllizenzen sind im Export nicht enthalten und müssen vor einer erneuten öffentlichen Veröffentlichung bestätigt werden. basemap.de-Attribution ist eingebaut und deren Nutzungsbedingungen sind geprüft.

## 3. Funktionsabnahme

- Startseite und basemap.de-Karte, sichtbare Attribution, Marker und zusammengefasste Gruppen.
- 326 Spielplätze, 24 Still-/Wickelplätze, Gievenbeck + Spielplätze = 25 im gelieferten Datenbestand.
- Freitext Name/Straße, Kategorien (auch leere), Stadtteilgrenze und 500 m / 2 km Umkreis.
- Details mit Originaleigenschaften und sicheren externen Links. Beispielhafte Öffnungszeiten am Originalanbieter abgleichen.
- Standort freigeben und verweigern; bei Verweigerung bleibt die Suche bedienbar. Externe Standorte außerhalb Münster werden nicht übernommen.
- Keine Termindaten, Terminkategorie oder Archivfunktion vorhanden. Ein alter Terminlink liefert keine Termindetails.
- Mobile Ansicht, Listen-/Kartenwechsel, Tastatur, Dialogschließen, Such-/Ortslinks nach Neuladen.
- `/impressum/`, `/copyright/`, `/datenschutz/` erreichbar. `/aktuelles/` führt zurück zur Karte. `/aktuelles` ohne Schrägstrich darf vom Webserver auf `/aktuelles/` umgeleitet werden.
- Netzwerkprüfung: keine Anfragen an `data.mein-ms.de`, `data2.mein-ms.de`, Elasticsearch-Fallback oder `.php`; nur eigene Dateien und Kartenkacheln. Kartenfehler lassen die Liste nutzbar.

## 4. Frontend umstellen

Erst nach Abnahme die bisherige Veröffentlichung auf den neuen Release zeigen lassen. Bei einem bestehenden Apache-VHost dessen `DocumentRoot` bzw. bei bisherigem Reverse Proxy nur die frontendbezogenen Proxyregeln gezielt anpassen. **Kein globales PHP-Modul deaktivieren**, andere Domains können es benötigen.

Möglicher Directory-Block für den geprüften Release (im bestehenden VHost, Pfad anpassen):

```apache
DocumentRoot /var/www/mein-ms/releases/2026-10-21-static
<Directory /var/www/mein-ms/releases/2026-10-21-static>
    Require all granted
    Options -Indexes -MultiViews
    AllowOverride None
    DirectoryIndex index.html
    AddType text/javascript .mjs
</Directory>
```

Header aus `dist/.htaccess` bei `AllowOverride None` bei Bedarf in den VHost übernehmen. `AddType` benötigt mod_mime; Header-Anweisungen mod_headers. Bestehende TLS-Einstellungen erhalten. Alte ProxyPass-Regeln für das Frontend müssen entfernt/angepasst werden, wenn sie den statischen Webroot sonst übersteuern. Nichts an den Daten-VHosts ändern, solange alte Frontends noch darauf angewiesen sind.

Anschließend **erst** `apachectl configtest`, dann bei erfolgreicher Prüfung `systemctl reload apache2` (Distributionsnamen können abweichen). Aus mehreren Browsern und einem Mobilgerät prüfen. Den alten Release und Container für einen vereinbarten Beobachtungszeitraum aufbewahren. Alte Browser-Tabs können weiterhin das alte Frontend verwenden; deren Datenzugriffe erst nach dieser Übergangszeit beenden.

**Rückweg:** Veröffentlichung/DocumentRoot zurück auf den gesicherten alten Webroot, Konfiguration testen und neu laden. Solange Elasticsearch und Datenproxy noch laufen, ist dieser Rückweg direkt möglich.

## 5. Alten Suchzugang schließen

Nach Beobachtung und Prüfung, dass keine weiteren Clients abhängig sind, die auf `localhost:9202` gerichteten ProxyPass-/ProxyPassReverse-Zeilen im **ausschließlich dafür zuständigen** Daten-VHost entfernen. Für `data.mein-ms.de` und Alias `data2.mein-ms.de` kann ein klarer HTTP 410 Status verbleiben, bei erhaltenem TLS-Setup:

```apache
RewriteEngine On
RewriteRule ^ - [G,L]
```

Keine alten Proxyregeln darunter stehen lassen. Vor Änderung die VHost-Datei sichern, danach Konfiguration testen, neu laden und extern auf beiden Namen HTTP 410 verifizieren. Zertifikatsverwaltung, andere Domains und DNS nicht pauschal ändern. Falls der VHost weitere Aufgaben hat, diese zuvor trennen. Zugriffsprotokolle nutzen, um verbliebene Altclients zu erkennen.

## 6. Importer deaktivieren, Elasticsearch stoppen

Erst wenn keine anderen Verbraucher festgestellt wurden: alte auf ES schreibende Importer/Crawler und deren Wiederholungsjobs gezielt deaktivieren. Die alten Skripte unter `import-scripts/` nicht mehr mit `docker-compose up` starten, da sie ES erneut starten oder beschreiben könnten.

Dann kann der bekannte Container zunächst **reversibel** gestoppt werden:

```sh
docker stop familien-dashboard_elasticsearch_1
```

Die Bestandsaufnahme der Restart-Policy entscheidet, ob ein explizites `docker update --restart=no familien-dashboard_elasticsearch_1` zusätzlich sinnvoll ist; vorherigen Wert für den Rückweg notieren. Compose-/Systemdienst-/Timer-Autostarts separat prüfen, damit der Dienst nicht unbeabsichtigt wieder erscheint.

Prüfen, dass die neue Website unverändert funktioniert, Port 9202 geschlossen ist und die API-Domains HTTP 410 liefern. Keine Containers/Volumes/Images löschen, kein `docker compose down -v`, kein globales Docker-Pruning. Eine endgültige Bereinigung ist ein gesonderter Schritt nach gesicherter Rückhaltefrist und bestätigter Datensicherung.

**Rückweg nach Stopp:** `docker start familien-dashboard_elasticsearch_1`; gesicherte Daten-VHost-Konfiguration wiederherstellen und testen/neu laden; bei Bedarf alten Frontend-Release aktivieren. Vorherige Restart-Policy und Importjobs nur gezielt wiederherstellen. Containerdaten müssen dafür unverändert vorhanden sein.
