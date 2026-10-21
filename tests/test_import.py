import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('geoimport', ROOT / 'scripts/import_geojson.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def collection(features=None):
    return {'type': 'FeatureCollection', 'features': features if features is not None else [feature()]}


def feature(identifier='wc1', coordinates=None):
    return {'type': 'Feature', 'id': identifier,
            'properties': {'Name': 'Bült', 'Öffnungszeiten': '07:00–24:00'},
            'geometry': {'type': 'Point', 'coordinates': coordinates or [7.63, 51.96]}}


class ImportTests(unittest.TestCase):
    def test_fields_and_identity_preserved(self):
        data = collection()
        result = module.convert(data, 'wc', None, 'Name')
        self.assertEqual(result[0]['source']['properties'], data['features'][0]['properties'])
        self.assertEqual(result[0]['id'], 'static:wc:wc1')
        self.assertEqual(result[0]['lat'], 51.96)

    def test_duplicate_canonical_ids_rejected(self):
        with self.assertRaises(ValueError):
            module.convert(collection([feature(1), feature('1')]), 'wc', None, 'Name')

    def test_missing_id_rejected(self):
        with self.assertRaises(ValueError):
            module.convert(collection([feature(None)]), 'wc', None, 'Name')

    def test_wrong_projection_rejected(self):
        data = collection()
        data['crs'] = {'properties': {'name': 'EPSG:25832'}}
        with self.assertRaises(ValueError):
            module.convert(data, 'wc', None, 'Name')

    def test_wrong_axis_and_non_finite_rejected(self):
        for coordinates in [[51.96, 7.63], [float('nan'), 51.96], [405000, 5750000]]:
            with self.assertRaises(ValueError):
                module.convert(collection([feature(coordinates=coordinates)]), 'wc', None, 'Name')

    def test_nonpoint_rejected(self):
        data = collection()
        data['features'][0]['geometry']['type'] = 'Polygon'
        with self.assertRaises(ValueError):
            module.convert(data, 'wc', None, 'Name')

    def test_event_category_is_rejected(self):
        self.assertNotIn('event', module.CATEGORIES)
        with self.assertRaises(ValueError):
            module.convert(collection(), 'event', None, 'Name')


if __name__ == '__main__':
    unittest.main()
