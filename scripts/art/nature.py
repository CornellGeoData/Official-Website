# Real hydrography and bedrock for the Water and Rock art, in UTM 18N.
# Streams and ponds: USGS National Hydrography Dataset. Bedrock: USGS state geologic map of New York.
# usage: nature.py <nhd dir> <geology dir> <region tiff> <art dir>
import sys, os, csv, json, struct, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from terrain import load, CELL, E0, N0
Image.MAX_IMAGE_PIXELS = None
nhd, geo, tiff, art = sys.argv[1:5]

# the regional grid, so a frame reaching past the finer one keeps real ground instead of smeared edge cells
z = np.array(Image.open(tiff), dtype=np.float32)
bad = ~np.isfinite(z) | (z < -100) | (z > 3000)
if bad.any(): z = z[tuple(ndi.distance_transform_edt(bad, return_distances=False, return_indices=True))]
np.save(f'{art}/region_z.npy', z)

# ---- streams: each reach's upstream channel length, from the network's own connections
KEEP = {460: 'stream', 558: 'path', 334: 'connector', 336: 'canal'}  # no pipelines or underground conduits
lines = []
for f in json.load(open(f'{nhd}/flowline.json')):
    a, g = f['attributes'], f.get('geometry')
    if not g or a['fcode'] // 100 not in KEEP: continue
    for path in g['paths']:
        p = np.array(path, dtype=np.float64)
        if len(p) > 1: lines.append((p, a['fcode'], a['flowdir']))
key = lambda xy: (round(float(xy[0])), round(float(xy[1])))
out_of, in_to = collections.defaultdict(list), collections.defaultdict(list)
for i, (p, _, _) in enumerate(lines):
    out_of[key(p[0])].append(i); in_to[key(p[-1])].append(i)
size = [float(np.hypot(*np.diff(p, axis=0).T).sum()) / 1000 for p, _, _ in lines]
waiting = {n: len(v) for n, v in in_to.items()}
ready = [n for n in out_of if not waiting.get(n)]
total = collections.defaultdict(float)
start, seen = np.zeros(len(lines)), np.zeros(len(lines), bool)
while ready:  # upstream to downstream; where a stream forks, each branch takes its share
    n = ready.pop()
    for i in out_of[n]:
        start[i] = total[n] / len(out_of[n]); seen[i] = True
        m = key(lines[i][0][-1])
        total[m] += start[i] + size[i]; waiting[m] -= 1
        if waiting[m] == 0 and m in out_of: ready.append(m)
print('reaches', len(lines), 'routed', int(seen.sum()), 'largest upstream km', round(float((start + size).max())))
pts, lens, ups = [], [], []
for i, (p, fcode, _) in enumerate(lines):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))] / 1000
    pts.append(p); lens.append(len(p)); ups.append(start[i] + d)
fcodes = np.array([l[1] for l in lines])

# ---- ponds, wide rivers and marshes
def rings_of(name, want):
    out = []
    for f in json.load(open(f'{nhd}/{name}.json')):
        g = f.get('geometry')
        a = {k.lower(): v for k, v in f['attributes'].items()}  # these two layers spell their fields differently
        if not g or a['ftype'] not in want: continue
        for r in g['rings']:
            r = np.array(r, dtype=np.float64)
            if len(r) > 2: out.append((a['ftype'], float(a.get('areasqkm') or 0), r))
    return out
LAKEPOND, RESERVOIR, STREAMRIVER, MARSH, CANAL = 390, 436, 460, 466, 336
# the big lakes come from the elevation grid, as in every other team's art, so all the slices share one shore
# and ponds under a hectare are specks at this scale
bodies = [b for b in rings_of('waterbody', {LAKEPOND, RESERVOIR, MARSH}) if 0.01 <= b[1] < 5] + rings_of('area', {STREAMRIVER, CANAL})
print('water areas', collections.Counter(b[0] for b in bodies))
np.savez_compressed(f'{art}/hydro.npz', pts=np.concatenate(pts).astype(np.float32), lens=np.array(lens), ups=np.concatenate(ups).astype(np.float32), fcode=fcodes,
    body_pts=np.concatenate([b[2] for b in bodies]).astype(np.float32), body_lens=np.array([len(b[2]) for b in bodies]), body_type=np.array([b[0] for b in bodies]))

# ---- bedrock
def utm(lon, lat):  # WGS84 to UTM 18N
    f = 1 / 298.257222101; n = f / (2 - f); A = 6378137 / (1 + n) * (1 + n * n / 4 + n ** 4 / 64)
    al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240]
    phi, lam = np.radians(lat), np.radians(lon + 75); e = 2 * np.sqrt(n) / (1 + n)
    t = np.sinh(np.arctanh(np.sin(phi)) - e * np.arctanh(e * np.sin(phi)))
    xi, eta = np.arctan2(t, np.cos(lam)), np.arctanh(np.sin(lam) / np.sqrt(1 + t * t))
    return (500000 + 0.9996 * A * (eta + sum(al[j] * np.cos(2 * (j + 1) * xi) * np.sinh(2 * (j + 1) * eta) for j in range(3))),
            0.9996 * A * (xi + sum(al[j] * np.sin(2 * (j + 1) * xi) * np.cosh(2 * (j + 1) * eta) for j in range(3))))
def read_dbf(b):
    nrec, hlen, rlen = struct.unpack('<xxxxIHH', b[:12])
    fields, off = [], 32
    while b[off] != 0x0D:
        fields.append((b[off:off + 11].split(b'\0')[0].decode(), b[off + 16])); off += 32
    recs, p = [], hlen
    for _ in range(nrec):
        rec, q = {}, p + 1
        for name, ln in fields:
            rec[name] = b[q:q + ln].decode('latin1').strip(); q += ln
        recs.append(rec); p += rlen
    return recs
recs = read_dbf(open(f'{geo}/NY_geol_poly.dbf', 'rb').read())
shp = open(f'{geo}/NY_geol_poly.shp', 'rb').read()
units = {r['unit_link'].strip(): r for r in csv.DictReader(open(f'{geo}/NY_units.csv', encoding='latin1'))}
polys, p = [], 100
for rec in recs:
    _, clen = struct.unpack('>II', shp[p:p + 8])
    body = shp[p + 8:p + 8 + clen * 2]; p += 8 + clen * 2
    if struct.unpack('<i', body[:4])[0] != 5: continue
    x0, y0, x1, y1 = struct.unpack('<4d', body[4:36])
    if x1 < -77.3 or x0 > -76.0 or y1 < 42.2 or y0 > 43.2: continue
    nparts, npts = struct.unpack('<ii', body[36:44])
    parts = list(struct.unpack(f'<{nparts}i', body[44:44 + 4 * nparts])) + [npts]
    xy = np.frombuffer(body, '<f8', npts * 2, 44 + 4 * nparts).reshape(-1, 2)
    E, N = utm(xy[:, 0], xy[:, 1])
    for i in range(nparts):
        polys.append((rec['UNIT_LINK'].strip(), np.stack([E[parts[i]:parts[i + 1]], N[parts[i]:parts[i + 1]]], 1)))
# largest first: a hole's island is smaller than what surrounds it, so painting in this order fills holes correctly
polys.sort(key=lambda u: -float(np.ptp(u[1][:, 0]) * np.ptp(u[1][:, 1])))
links = sorted({l for l, _ in polys})
index = {l: i + 1 for i, l in enumerate(links)}
table = [{'link': l, 'name': units.get(l, {}).get('unit_name', ''), 'age': units.get(l, {}).get('unit_age', ''), 'rock': units.get(l, {}).get('rocktype1', ''), 'rock2': units.get(l, {}).get('rocktype2', '')} for l in links]
print('bedrock polygons', len(polys), 'units', len(links))

# ---- how the layers actually tilt, from where mapped contacts cross the real ground
fz, fw = load(art)
h, w = fz.shape
step = 7  # about 200 m
gw, gh = w // step, h // step
canvas = Image.new('I', (gw, gh), 0); d = ImageDraw.Draw(canvas)
for link, ring in polys:
    d.polygon([((e - E0) / CELL / step, (N0 - n) / CELL / step) for e, n in ring.tolist()], fill=index[link])
g = np.asarray(canvas)
zs = ndi.zoom(ndi.gaussian_filter(fz, 3), (gh / h, gw / w), order=1)[:gh, :gw]
water = ndi.zoom(fw.astype(np.float32), (gh / h, gw / w), order=1)[:gh, :gw] > 0.05
rows = []
for dr, dc in ((0, 1), (1, 0)):
    a, b = g[:gh - dr, :gw - dc], g[dr:, dc:]
    r_, c_ = np.where((a != b) & (a > 0) & (b > 0) & ~water[:gh - dr, :gw - dc])
    for rr, cc in zip(r_.tolist(), c_.tolist()):
        A, B = sorted((int(a[rr, cc]), int(b[rr, cc])))
        rows.append((A, B, E0 + cc * step * CELL, N0 - rr * step * CELL, float(zs[rr, cc])))
rows = np.array(rows)
pair = rows[:, 0] * 1000 + rows[:, 1]
Ee, Nn, Zz = rows[:, 2], rows[:, 3], rows[:, 4]
keep = np.ones(len(rows), bool)
for _ in range(6):  # each contact has its own level; the tilt is shared. Outliers are map error, or faulted ground
    uniq, inv = np.unique(pair[keep], return_inverse=True)
    dm = lambda v: v - (np.bincount(inv, v) / np.bincount(inv))[inv]
    X = np.stack([dm(Ee[keep]), dm(Nn[keep])], 1); y = dm(Zz[keep])
    coef = np.linalg.lstsq(X, y, rcond=None)[0]
    levels = np.bincount(inv, Zz[keep] - X[:, 0] * 0 - (Ee[keep] * coef[0] + Nn[keep] * coef[1])) / np.bincount(inv)
    res = np.full(len(rows), 1e9)
    idx = {u: l for u, l in zip(uniq.tolist(), levels.tolist())}
    for i in np.flatnonzero(np.isin(pair, uniq)):
        res[i] = Zz[i] - (Ee[i] * coef[0] + Nn[i] * coef[1] + idx[pair[i]])
    sigma = float(np.std(res[keep]))
    keep = np.abs(res) < 2.2 * sigma
mag = float(np.hypot(*coef)) * 1000
toward = (np.degrees(np.arctan2(-coef[0], -coef[1]))) % 360
print(f'contact points {len(rows)} kept {int(keep.sum())}; layers fall {mag:.1f} m per km toward {toward:.0f} degrees (scatter {sigma:.0f} m)')
json.dump({'units': table, 'polys': [l for l, _ in polys], 'dip': [float(coef[0]), float(coef[1])]}, open(f'{art}/geology.json', 'w'))
np.savez_compressed(f'{art}/geology.npz', pts=np.concatenate([r for _, r in polys]).astype(np.float32), lens=np.array([len(r) for _, r in polys]), unit=np.array([index[l] for l, _ in polys]))
