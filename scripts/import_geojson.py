#!/usr/bin/env python3
"""Replace one category with a reviewed WGS84 Point GeoJSON, without any database."""
import argparse
import collections
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {'playground', 'kindergarden', 'babychange', 'wc', 'pool', 'library', 'bookbus',
              'sport', 'school', 'wifi', 'container', 'agencies', 'cemetery', 'papierkorb',
              'construction', 'lunch', 'webcam'}


def convert(document, category, id_field, name_field):
    if category not in CATEGORIES:
        raise ValueError("Unsupported category; Termine sind ausgeschlossen.")
    if document.get('type') != 'FeatureCollection':
        raise ValueError('Expected a GeoJSON FeatureCollection.')
    crs = document.get('crs', {}).get('properties', {}).get('name', '')
    if crs and not any(v in crs.upper() for v in ('4326', 'CRS84')):
        raise ValueError('Input must use WGS84 longitude/latitude (EPSG:4326).')
    seen, result = set(), []
    for feature in document['features']:
        geometry = feature.get('geometry') or {}
        if geometry.get('type') != 'Point':
            raise ValueError('Every feature must have Point geometry; do not silently infer centroids.')
        lon, lat = map(float, geometry['coordinates'][:2])
        if not all(map(math.isfinite, (lon, lat))) or not (7.2 <= lon <= 8 and 51.7 <= lat <= 52.2):
            raise ValueError('Coordinates outside the Münster area; verify axis order and projection.')
        properties = feature.get('properties') or {}
        identifier = properties.get(id_field) if id_field else feature.get('id')
        if identifier is None or str(identifier).strip() == '' or str(identifier) in seen:
            raise ValueError('Stable, unique IDs required. Use --id-field if Feature.id is missing.')
        seen.add(str(identifier))
        source = {'name': properties.get(name_field) or category, 'type': category,
                  'properties': properties, 'address': {'geo': {'lat': lat, 'lon': lon}, 'geometry': geometry}}
        result.append({'id': 'static:' + category + ':' + str(identifier), 'sourceId': str(identifier),
                       'sourceType': 'static', 'lat': lat, 'lon': lon, 'source': source})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('--category', required=True, choices=sorted(CATEGORIES))
    parser.add_argument('--id-field', help='Stable ID property; defaults to Feature.id')
    parser.add_argument('--name-field', default='NAME')
    parser.add_argument('--source-url', required=True, help='Documentation/source URL for this revision')
    parser.add_argument('--license', required=True, help='Exact license name or URL checked for this source')
    parser.add_argument('--allow-empty', action='store_true', help='Explicitly permit removing all entries of this category')
    args = parser.parse_args()
    raw = args.file.read_bytes()
    rows = convert(json.loads(raw), args.category, args.id_field, args.name_field)
    if not rows and not args.allow_empty:
        parser.error('Empty source rejected; use --allow-empty only for an intentionally empty category.')
    folder = ROOT / 'site/data'
    target = folder / 'places.json'
    current = json.loads(target.read_text(encoding='utf-8'))
    merged = [p for p in current if p['source']['type'] != args.category] + rows
    # A category refresh replaces its old records, preventing duplicates and stale deletions.
    data = (json.dumps(merged, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    target.with_suffix('.json.bak').write_bytes(target.read_bytes())
    tmp = target.with_suffix('.json.tmp')
    tmp.write_bytes(data)
    tmp.replace(target)
    meta_path = folder / 'metadata.json'
    metadata = json.loads(meta_path.read_text(encoding='utf-8'))
    places = json.loads((folder / 'places.json').read_text(encoding='utf-8'))
    metadata.update(places=len(places),
                    types=dict(collections.Counter(p['source']['type'] for p in places)))
    metadata.setdefault('revisions', []).append({'category': args.category, 'documents': len(rows),
        'updatedAt': datetime.now(timezone.utc).isoformat(), 'source': args.source_url, 'license': args.license,
        'inputSha256': hashlib.sha256(raw).hexdigest()})
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Backup files are for editing only and are not part of the built webroot.
    print('Replaced %s: %s entries. Source backup: %s' % (args.category, len(rows), target.with_suffix('.json.bak')))
    print('Now run: python3 scripts/build.py && npm test')


if __name__ == '__main__':
    main()
