# USGS National Hydrography Dataset (public domain) for the art frames. usage: fetch_nhd.py <out dir>
import json, sys, time, urllib.parse, urllib.request
out = sys.argv[1]
BASE = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer'
BOX = '-77.15,42.25,-76.2,43.12'  # both the desktop and phone frames, with room for headwaters outside them
def page(layer, fields, offset, count):
    q = urllib.parse.urlencode({'geometry': BOX, 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326, 'spatialRel': 'esriSpatialRelIntersects', 'where': '1=1', 'outFields': fields, 'returnGeometry': 'true', 'outSR': 26918, 'orderByFields': 'OBJECTID', 'resultOffset': offset, 'resultRecordCount': count, 'f': 'json'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(f'{BASE}/{layer}/query?{q}', headers={'User-Agent': 'geodata-site-dev/1.0'}), timeout=170) as r:
                d = json.load(r)
            if 'features' in d: return d
            print('no features', str(d)[:160], flush=True)
        except Exception as e:
            print('retry', layer, offset, str(e)[:90], flush=True)
        time.sleep(4 * (attempt + 1))
    raise SystemExit(f'gave up on layer {layer} at {offset}')
for layer, name, fields in ((12, 'waterbody', 'ftype,fcode,gnis_name,areasqkm'), (9, 'area', 'ftype,fcode,gnis_name,areasqkm'), (6, 'flowline', 'ftype,fcode,gnis_name,lengthkm,flowdir')):
    feats, off = [], 0
    while True:
        d = page(layer, fields, off, 1000)
        feats += d['features']; off += len(d['features'])
        print(name, off, 'more' if d.get('exceededTransferLimit') else 'done', flush=True)
        if not d.get('exceededTransferLimit') or not d['features']: break
    json.dump(feats, open(f'{out}/{name}.json', 'w'))
    print(name, 'saved', len(feats), flush=True)
