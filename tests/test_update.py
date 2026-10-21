import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import update_data as updater


def record(identifier, category='wc'):
    return {'id': identifier, 'sourceId': identifier, 'sourceType': 'static',
            'lat': 51.96, 'lon': 7.62, 'source': {'name': identifier, 'type': category}}


class UpdateTests(unittest.TestCase):
    def test_idempotent_replacement_preserves_other_categories(self):
        current = [record('old'), record('keep', 'pool')]
        changed = updater.merge(current, {'wc': [record('new')]})
        self.assertEqual(updater.merge(changed, {'wc': [record('new')]}), changed)
        self.assertEqual({p['id'] for p in changed}, {'keep', 'new'})

    def test_empty_or_strongly_shrunken_source_cannot_erase_category(self):
        current = [record(str(i)) for i in range(10)]
        for rows in ([], [record('new')]):
            with self.assertRaises(ValueError):
                updater.merge(current, {'wc': rows})

    def test_source_errors_and_truncation_rejected(self):
        for data in [b'<Exception>bad WFS</Exception>', b'{"type":"FeatureCollection","features":[],"numberMatched":25,"numberReturned":0}']:
            with self.assertRaises(ValueError):
                updater.geojson(data)
        with self.assertRaises(ValueError):
            updater.overpass(b'{"elements":[],"remark":"timed out"}')

    def test_nrw_filters_municipality_and_quarantines_invalid_source_coordinates(self):
        raw=('Id;Einrichtung Name;Ort;Straße;Geokoordinate\n'
             '1;Gut;Münster;Straße 1;51.96,7.62\n'
             '2;Ohne;Münster;Straße 2;\n'
             '3;Falsch;Münster;Straße 3;49.9,8.8\n'
             '4;Andere Stadt;Düsseldorf;Straße 4;51.2,6.8\n').encode()
        source={'category':'kindergarden','format':'nrw-kitas-csv','nameFields':['Einrichtung Name']}
        with self.assertRaises(ValueError):
            updater.transform(raw, source)
        rows, pending=updater.transform(raw, source, allow_unlocated=True)
        self.assertEqual(len(rows),1);self.assertEqual(len(pending),2)
        self.assertEqual(rows[0]['lat'],51.96);self.assertEqual(rows[0]['lon'],7.62)
        self.assertEqual(updater.transform(raw, source, True)[0][0]['id'], rows[0]['id'])

    def test_osm_ways_use_centers_and_type_qualified_ids(self):
        raw=json.dumps({'elements':[
            {'id':1,'type':'node','lat':51.96,'lon':7.62,'tags':{}},
            {'id':1,'type':'way','center':{'lat':51.97,'lon':7.63},'tags':{}}]}).encode()
        rows,_=updater.transform(raw,{'category':'container','format':'overpass-json'})
        self.assertEqual(len({r['id'] for r in rows}),2)

    def test_termine_rejected(self):
        with self.assertRaises(ValueError):
            updater.merge([],{'event':[record('bad','event')]})

    def test_commit_failure_rolls_back_both_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=root/'site/data';folder.mkdir(parents=True)
            (folder/'places.json').write_text('["original"]')
            (folder/'metadata.json').write_text('{"original":true}')
            original=updater.atomic_json
            def fail_metadata(path,data):
                if path.name=='metadata.json':raise OSError('simulated disk error')
                original(path,data)
            with patch.object(updater,'ROOT',root), patch.object(updater,'atomic_json',side_effect=fail_metadata):
                with self.assertRaises(OSError):updater.commit_dataset([],{},'test')
            self.assertEqual(json.loads((folder/'places.json').read_text()),['original'])
            self.assertEqual(json.loads((folder/'metadata.json').read_text()),{'original':True})


if __name__ == '__main__':
    unittest.main()
