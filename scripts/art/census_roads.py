# TIGER road shapefiles -> arrays in UTM 18N for the Business art.
# usage: census_roads.py <census dir> <art dir>
import sys, os, glob, struct, zipfile
import numpy as np
cdir, art = sys.argv[1:3]
def utm(lat, lon):
    lat, lon = np.asarray(lat, float), np.asarray(lon, float)
    f = 1 / 298.257222101; n = f / (2 - f); A = 6378137 / (1 + n) * (1 + n * n / 4 + n ** 4 / 64)
    al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240]
    phi, lam = np.radians(lat), np.radians(lon + 75)
    e = 2 * np.sqrt(n) / (1 + n)
    t = np.sinh(np.arctanh(np.sin(phi)) - e * np.arctanh(e * np.sin(phi)))
    xi, eta = np.arctan2(t, np.cos(lam)), np.arctanh(np.sin(lam) / np.sqrt(1 + t * t))
    E = 500000 + 0.9996 * A * (eta + sum(al[j] * np.cos(2 * (j + 1) * xi) * np.sinh(2 * (j + 1) * eta) for j in range(3)))
    N = 0.9996 * A * (xi + sum(al[j] * np.sin(2 * (j + 1) * xi) * np.cosh(2 * (j + 1) * eta) for j in range(3)))
    return E, N
def read_dbf(b):
    nrec, hlen, rlen = struct.unpack('<xxxxIHH', b[:12])
    fields, off = [], 32
    while b[off] != 0x0D:
        name = b[off:off + 11].split(b'\0')[0].decode(); ln = b[off + 16]
        fields.append((name, ln)); off += 32
    out, p = [], hlen
    for _ in range(nrec):
        rec, q = {}, p + 1
        for name, ln in fields:
            rec[name] = b[q:q + ln].decode('latin1').strip(); q += ln
        out.append(rec); p += rlen
    return out
def read_lines(b):
    p, lines = 100, []
    while p < len(b):
        _, clen = struct.unpack('>II', b[p:p + 8])
        rec = b[p + 8:p + 8 + clen * 2]; p += 8 + clen * 2
        if struct.unpack('<i', rec[:4])[0] != 3: lines.append(None); continue
        nparts, npts = struct.unpack('<ii', rec[36:44])
        parts = list(struct.unpack(f'<{nparts}i', rec[44:44 + 4 * nparts])) + [npts]
        pts = np.frombuffer(rec, '<f8', npts * 2, 44 + 4 * nparts).reshape(-1, 2)
        lines.append([pts[parts[i]:parts[i + 1]] for i in range(nparts)])
    return lines
KEEP = {'S1100': 'major', 'S1200': 'major', 'S1630': 'major', 'S1400': 'street', 'S1730': 'street'}
roads = {'major': [], 'street': []}
for z in sorted(glob.glob(cdir + '/tl_2023_*_roads.zip')):
    with zipfile.ZipFile(z) as f:
        stem = os.path.basename(z)[:-4]
        recs, shp = read_dbf(f.read(stem + '.dbf')), read_lines(f.read(stem + '.shp'))
    for r, parts in zip(recs, shp):
        c = KEEP.get(r['MTFCC'])
        if not c or parts is None: continue
        for pts in parts:
            E, N = utm(pts[:, 1], pts[:, 0])
            roads[c].append(np.stack([E, N], 1).astype(np.float32))
print({k: len(v) for k, v in roads.items()})
np.savez_compressed(art + '/roads.npz', **{f'{k}_lens': np.array([len(x) for x in v]) for k, v in roads.items()}, **{f'{k}_pts': np.concatenate(v) for k, v in roads.items()})
