#!/usr/bin/env python3
"""Build static assets; optionally migrate a verified Elasticsearch export ZIP."""
import argparse
import collections
import hashlib
import html
import json
import math
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def migrate(archive, destination):
    with zipfile.ZipFile(archive) as z:
        if sum(i.file_size for i in z.infolist()) > 250_000_000:
            raise ValueError('Export exceeds 250 MB uncompressed.')
        def read(suffix):
            matches = [n for n in z.namelist() if n.endswith('/' + suffix) or n == suffix]
            if len(matches) != 1:
                raise ValueError('Missing or ambiguous file: ' + suffix)
            return z.read(matches[0])
        manifest = json.loads(read('manifest.json'))
        records = {}
        for index in ('places', 'districts'):
            raw = read(index + '.ndjson')
            expected = manifest['indices'][index]
            if hashlib.sha256(raw).hexdigest() != expected['sha256']:
                raise ValueError('Checksum mismatch: ' + index)
            docs = [json.loads(line) for line in raw.splitlines() if line.strip()]
            if len(docs) != expected['expected'] or len(docs) != expected['documents']:
                raise ValueError('Count mismatch: ' + index)
            keys = {(d.get('_index', index), d.get('_type', '_doc'), d['_id']) for d in docs}
            if len(keys) != len(docs):
                raise ValueError('Duplicate document IDs: ' + index)
            if any('_source' not in d for d in docs):
                raise ValueError('Missing source: ' + index)
            records[index] = docs
    places, rejected = [], []
    excluded = 0
    for d in records['places']:
        s = d['_source']
        if s.get('type') == 'event':
            excluded += 1
            continue
        try:
            lat, lon = float(s['address']['geo']['lat']), float(s['address']['geo']['lon'])
            if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
                raise ValueError('coordinates out of range')
        except (KeyError, ValueError, TypeError) as error:
            rejected.append({'document': d, 'reason': str(error)})
            continue
        item = {
            'id': d.get('_type', '_doc') + ':' + d['_id'],
            'sourceId': d['_id'], 'sourceType': d.get('_type', '_doc'),
            'lat': lat, 'lon': lon, 'source': s,
        }
        places.append(item)
    districts = []
    for d in records['districts']:
        s = d['_source']
        if s['geometry']['type'] not in ('Polygon', 'MultiPolygon'):
            raise ValueError('Unsupported district geometry: ' + d['_id'])
        districts.append({'id': d['_id'], 'type': 'Feature', 'geometry': s['geometry'],
                          'properties': s['properties'], 'center': s['center']})
    districts.sort(key=lambda d: d['properties']['Name'])
    metadata = {
        'exportedAt': manifest['created_utc'], 'sourceCounts': {k: len(v) for k, v in records.items()},
        'places': len(places), 'excludedDocuments': excluded, 'districts': len(districts),
        'types': dict(collections.Counter(p['source'].get('type', 'other') for p in places)),
        'rejected': len(rejected),
        'unnamed': sum(not p['source'].get('name') for p in places),
        'sourceChecksums': {k: v['sha256'] for k, v in manifest['indices'].items()},
    }
    # Only write after the whole input has been validated.
    dump(destination / 'places.json', places)
    dump(destination / 'districts.json', {'type': 'FeatureCollection', 'features': districts})
    dump(destination / 'metadata.json', metadata)
    dump(ROOT / 'docs' / 'migration-report.json', metadata)
    if rejected:
        dump(ROOT / 'docs' / 'rejected-records.json', rejected)
        raise ValueError('Invalid coordinates: records preserved in docs/rejected-records.json; fix before publishing.')
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


def legal_page(title, content):
    return '''<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="../styles.css"><link rel="stylesheet" href="../playful.css"><link rel="icon" href="../favicon.svg" type="image/svg+xml">
<title>''' + html.escape(title) + ''' · Mein Münster</title><body class="document"><main>
<a class="back" href="../">← Zurück zur Karte</a><h1>''' + html.escape(title) + '</h1>' + content + '</main></body></html>'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export', type=Path, help='Verified ZIP from export-mein-ms.py')
    parser.add_argument('--legacy', type=Path, help='Original checkout for preserving the imprint')
    args = parser.parse_args()
    site = ROOT / 'site'
    if args.export:
        migrate(args.export, site / 'data')
    if args.legacy:
        source = args.legacy / 'src/Router/Pages/Impressum/Impressum.js'
        text = source.read_text(encoding='utf-8')
        start = text.index('<h1>Impressum</h1>') + len('<h1>Impressum</h1>')
        end = text.index('<h2>Datenschutzerklärung</h2>')
        fragment = text[start:end]
        # This file is static JSX markup; do not execute it.
        if '{' in fragment or '}' in fragment or '<script' in fragment.lower():
            raise ValueError('Imprint needs manual migration: dynamic markup found.')
        (site / 'impressum').mkdir(exist_ok=True)
        (site / 'impressum/index.html').write_text(legal_page('Impressum', fragment), encoding='utf-8')
    for name in ('places', 'districts', 'metadata'):
        if not (site / 'data' / (name + '.json')).exists():
            raise ValueError('Data missing. First build must specify --export.')
    if not (site / 'impressum/index.html').exists():
        raise ValueError('Imprint missing. First build must specify --legacy.')
    # Retire the old dataset even when updating an existing source directory.
    for retired in (site / 'data').glob('events.*'):
        if retired.is_file():
            retired.unlink()
    # Old bookmarks lead to the map, with no retained calendar page.
    (site / 'aktuelles').mkdir(exist_ok=True)
    (site / 'aktuelles/index.html').write_text('<!doctype html><html lang="de"><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=../"><title>Mein Münster</title><a href="../">Zur Karte</a></html>', encoding='utf-8')
    current = json.loads((site / 'data/places.json').read_text(encoding='utf-8'))
    if any(p['source'].get('type') == 'event' for p in current):
        raise ValueError('Termine sind ausgeschlossen. Eingabedaten bereinigen.')
    dist = ROOT / 'dist'
    if dist.exists():
        # The build only replaces its own generated directory.
        shutil.rmtree(dist)
    shutil.copytree(site, dist, ignore=shutil.ignore_patterns('*.bak', '*.tmp', '__pycache__'))
    metadata = json.loads((site / 'data/metadata.json').read_text(encoding='utf-8'))
    latest = {r['category']: r for r in metadata.get('revisions', [])}
    rows = []
    names = {'kindergarden': 'Kitas', 'babychange': 'Still- und Wickelplätze'}
    for key, revision in sorted(latest.items()):
        rows.append('<tr>' + ''.join('<td>' + html.escape(str(value)) + '</td>' for value in (
            names.get(key, key), revision['documents'], revision.get('sourceDataDate') or 'Unbekannt',
            revision['updatedAt'][:10], revision.get('unlocated', 0))) + '</tr>')
    status = '<h2>Zuletzt übernommene Datenquellen</h2><p>Dateistand und Abrufdatum sind getrennte Angaben. Ein neuer Abruf macht alte Quelldaten nicht automatisch aktuell.</p><table><thead><tr><th>Quelle</th><th>Kartierbare Einträge</th><th>Quell-Dateistand</th><th>Übernommen</th><th>Ohne verwendbare Koordinate</th></tr></thead><tbody>' + ''.join(rows) + '</tbody></table>' if rows else ''
    page = dist / 'copyright/index.html'
    page.write_text(page.read_text(encoding='utf-8').replace('<!-- DATA_STATUS -->', status), encoding='utf-8')
    print('Static website ready:', dist)


if __name__ == '__main__':
    main()
