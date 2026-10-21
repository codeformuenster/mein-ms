#!/usr/bin/env python3
"""Fetch/rebuild the static place dataset. No PHP, Elasticsearch or background service."""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import socket
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from import_geojson import convert, CATEGORIES

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 30_000_000


def fetch(url, timeout=15, body=None):
    request = urllib.request.Request(url, data=body, headers={
        'User-Agent': 'Mein-Muenster-Static-Importer/1.0',
        'Accept': 'application/geo+json,application/json,text/csv,*/*;q=0.5',
    })
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('Source exceeds 30 MB; keep the previous dataset.')
        return raw, response.headers.get('Last-Modified')


def nrw_kitas(raw):
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig')), delimiter=';')
    required = {'Id', 'Einrichtung Name', 'Ort', 'Straße', 'Geokoordinate'}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError('NRW CSV schema changed: required columns missing.')
    features, unlocated = [], []
    for row in reader:
        if row['Ort'].strip().casefold() != 'münster':
            continue
        if not row['Geokoordinate'].strip():
            unlocated.append({'sourceId': row['Id'], 'reason': 'Keine Geokoordinate in der Quelle', 'properties': row})
            continue
        # This official CSV explicitly uses latitude,longitude in its single coordinate column.
        lat, lon = [float(v.strip()) for v in row['Geokoordinate'].split(',')]
        if not math.isfinite(lat) or not math.isfinite(lon) or not (51.7 <= lat <= 52.2 and 7.2 <= lon <= 8):
            unlocated.append({'sourceId': row['Id'], 'reason': 'Quellkoordinate liegt außerhalb von Münster', 'properties': row})
            continue
        features.append({'type': 'Feature', 'id': row['Id'],
                         'geometry': {'type': 'Point', 'coordinates': [lon, lat]}, 'properties': row})
    return {'type': 'FeatureCollection', 'features': features}, unlocated


def overpass(raw):
    data = json.loads(raw)
    if data.get('remark'):
        raise ValueError('Overpass returned an incomplete result: ' + data['remark'])
    if 'elements' not in data:
        raise ValueError('Missing Overpass elements.')
    features = []
    for element in data['elements']:
        point = element if element['type'] == 'node' else element.get('center', {})
        tags = element.get('tags', {})
        if 'lat' not in point or 'lon' not in point:
            raise ValueError('OSM object without position: ' + str(element.get('id')))
        properties = dict(tags)
        properties['NAME'] = tags.get('name') or 'Recycling-Container'
        properties['URL'] = 'https://www.openstreetmap.org/%s/%s' % (element['type'], element['id'])
        features.append({'type': 'Feature', 'id': element['type'] + ':' + str(element['id']),
                         'geometry': {'type': 'Point', 'coordinates': [point['lon'], point['lat']]},
                         'properties': properties})
    return {'type': 'FeatureCollection', 'features': features}, []


def babychange(raw):
    features = []
    for number, row in enumerate(csv.reader(io.StringIO(raw.decode('utf-8-sig'))), 1):
        if not row or not any(row):
            continue
        if len(row) != 8:
            raise ValueError('Stillplatz CSV: expected 8 columns, row %s.' % number)
        name, address, floor, lat, lon, description, source, hint = [v.strip() for v in row]
        # A stable content key avoids the old lossy name-only regular expression.
        identifier = hashlib.sha256((name + '\0' + address).encode()).hexdigest()[:20]
        features.append({'type': 'Feature', 'id': identifier,
                         'geometry': {'type': 'Point', 'coordinates': [float(lon), float(lat)]},
                         'properties': {'NAME': name, 'ADRESSE': address, 'Stockwerk': floor,
                                        'Beschreibung': description, 'Quelle': source, 'Hinweis': hint}})
    return {'type': 'FeatureCollection', 'features': features}, []


def geojson(raw):
    result = json.loads(raw)
    if result.get('type') != 'FeatureCollection' or not isinstance(result.get('features'), list):
        raise ValueError('Expected GeoJSON; WFS exceptions and HTML errors cannot replace the dataset.')
    # Refuse capped WFS responses rather than silently importing the first page.
    matched, returned = result.get('numberMatched'), result.get('numberReturned', len(result['features']))
    if matched not in (None, 'unknown') and int(matched) > int(returned):
        raise ValueError('WFS response is truncated; configure an uncapped/paginated download.')
    return result, []


def transform(raw, source, allow_unlocated=False):
    category = source['category']
    if category not in CATEGORIES:
        raise ValueError('Unsupported category; Termine sind ausgeschlossen.')
    parser = {'nrw-kitas-csv': nrw_kitas, 'overpass-json': overpass,
              'babychange-csv': babychange, 'geojson': geojson}[source['format']]
    document, unlocated = parser(raw)
    if unlocated and not allow_unlocated:
        raise ValueError('%s entries without coordinates. Inspect source and use --allow-unlocated explicitly.' % len(unlocated))
    properties = [f.get('properties', {}) for f in document['features']]
    name_field = next((n for n in source.get('nameFields', ['NAME', 'Name', 'name', 'standpunkt'])
                       if any(p.get(n) for p in properties)), None)
    if not name_field:
        raise ValueError('Missing place name field or empty response.')
    id_field = next((n for n in source.get('idFields', []) if properties and all(p.get(n) is not None for p in properties)), None)
    # Retain real source IDs. If only Feature.id is supplied, convert() uses that.
    records = convert(document, category, id_field, name_field)
    if not records:
        raise ValueError('Empty source rejected.')
    for record in records:
        p = record['source']['properties']
        street = p.get('Straße') or p.get('ADRESSE') or p.get('street')
        if street:
            record['source']['address']['street'] = street
        if source['format'] == 'nrw-kitas-csv':
            record['source']['address'].update(city=p['Ort'], zip=p.get('PLZ'))
    return records, unlocated


def merge(current, replacements, allow_large_drop=False):
    for category, records in replacements.items():
        previous = sum(p['source']['type'] == category for p in current)
        if previous and len(records) < previous * .6 and not allow_large_drop:
            raise ValueError('%s shrank from %s to %s; inspect before --allow-large-drop.' % (category, previous, len(records)))
    result = [p for p in current if p['source']['type'] not in replacements]
    for records in replacements.values():
        result.extend(records)
    if len({p['id'] for p in result}) != len(result):
        raise ValueError('Duplicate IDs after merge.')
    if any(p['source']['type'] == 'event' for p in result):
        raise ValueError('Termine sind ausgeschlossen.')
    return sorted(result, key=lambda p: p['id'])


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.' + path.name, suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as file:
            file.write(raw)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='all', help='Comma-separated categories or all')
    parser.add_argument('--config', type=Path, default=ROOT / 'sources.json')
    parser.add_argument('--apply', action='store_true', help='Write successful imports to site/data (default: check only)')
    parser.add_argument('--input', type=Path, help='Use a downloaded file for exactly one selected source')
    parser.add_argument('--allow-partial', action='store_true', help='Apply valid categories even if others fail')
    parser.add_argument('--allow-unlocated', action='store_true', help='Keep rows without coordinates in the report; omit from map')
    parser.add_argument('--allow-large-drop', action='store_true')
    parser.add_argument('--timeout', type=int, default=15)
    args = parser.parse_args()
    sources = json.loads(args.config.read_text(encoding='utf-8'))['sources']
    selected = sources if args.source == 'all' else [s for s in sources if s['category'] in args.source.split(',')]
    if not selected or (args.source != 'all' and set(args.source.split(',')) != {s['category'] for s in selected}):
        parser.error('Unknown source/category.')
    if args.input and len(selected) != 1:
        parser.error('--input requires exactly one source.')
    now = datetime.now(timezone.utc).isoformat()
    current = json.loads((ROOT / 'site/data/places.json').read_text(encoding='utf-8'))
    def load(source):
        report = {'category': source['category'], 'source': source.get('sourcePage', source.get('url')),
                  'license': source['license'], 'checkedAt': now, 'sourceDataDate': source.get('dataDate')}
        try:
            if args.input:
                raw, modified = args.input.read_bytes(), None
            elif source.get('path'):
                raw, modified = (ROOT / source['path']).read_bytes(), None
            else:
                body = urllib.parse.urlencode({'data': source['query']}).encode() if source.get('query') else None
                raw, modified = fetch(source['url'], args.timeout, body)
            records, unlocated = transform(raw, source, args.allow_unlocated)
            # Validate shrinkage before including a source in the staged update.
            merge(current, {source['category']: records}, args.allow_large_drop)
            report.update(status='ok', documents=len(records), unlocated=unlocated,
                          inputSha256=hashlib.sha256(raw).hexdigest(), httpLastModified=modified)
            return report, records
        except (ValueError, KeyError, TypeError, OSError, urllib.error.URLError, csv.Error) as error:
            report.update(status='failed', error=str(error), action='Vorhandener Bestand bleibt erhalten')
            return report, None
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(load, selected))
    report = {'checkedAt': now, 'applied': False, 'sources': [r for r, _ in results]}
    failed = [r for r, _ in results if r['status'] != 'ok']
    for entry, _ in results:
        print('%s: %s %s' % (entry['category'], entry['status'], entry.get('error') or '%s Orte, %s ohne Koordinate' % (entry['documents'], len(entry['unlocated']))))
    if args.apply and (not failed or args.allow_partial):
        replacements = {r['category']: data for r, data in results if data is not None}
        if replacements:
            merged = merge(current, replacements, args.allow_large_drop)
            meta_path = ROOT / 'site/data/metadata.json'
            metadata = json.loads(meta_path.read_text(encoding='utf-8'))
            metadata['places'] = len(merged)
            metadata['types'] = {category: sum(p['source']['type'] == category for p in merged)
                                 for category in sorted({p['source']['type'] for p in merged})}
            metadata['unnamed'] = sum(not p['source'].get('name') for p in merged)
            metadata['dataUpdatedAt'] = now
            revisions = metadata.setdefault('revisions', [])
            for entry, data in results:
                if data is not None:
                    revisions.append({'category': entry['category'], 'updatedAt': now,
                        'documents': len(data), 'source': entry['source'], 'license': entry['license'],
                        'sourceDataDate': entry['sourceDataDate'], 'inputSha256': entry['inputSha256'],
                        'unlocated': len(entry['unlocated'])})
            # Apply to the offline source directory, with rollback and a full backup.
            # The public dist/ directory is only replaced by a later successful build.
            commit_dataset(merged, metadata, now)
            report['applied'] = True
    atomic_json(ROOT / 'docs/import-report.json', report)
    for entry in report['sources']:
        source_report = {**entry, 'applied': report['applied'] and entry['status'] == 'ok'}
        atomic_json(ROOT / 'docs/import-reports' / (entry['category'] + '.json'), source_report)
        if source_report['applied']:
            atomic_json(ROOT / 'docs/import-reports' / (entry['category'] + '.applied.json'), source_report)
    print('Report:', ROOT / 'docs/import-report.json')
    if failed and not args.allow_partial:
        print('No changes applied. Fix sources or deliberately select --allow-partial.', file=sys.stderr)
    return 2 if failed else 0


def commit_dataset(places, metadata, stamp):
    import shutil
    # The webroot is rebuilt only after validation; site/ is an offline source directory.
    data = ROOT / 'site/data'
    backup = ROOT / 'backups' / stamp.replace(':', '-')
    shutil.copytree(data, backup)
    try:
        atomic_json(data / 'places.json', places)
        atomic_json(data / 'metadata.json', metadata)
    except Exception:
        for name in ('places.json', 'metadata.json'):
            shutil.copy2(backup / name, data / name)
        raise


if __name__ == '__main__':
    sys.exit(main())
