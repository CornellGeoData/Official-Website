# The home page's first map: all eleven Finger Lakes in the land style of terrain.webp, north up.
# Also prints every coordinate Descent.tsx needs, in the lake map's pixels ("world").
# usage: art_region.py <region tiff> <public art dir> <out dir>
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
Image.MAX_IMAGE_PIXELS = None
tiff, pub, out = sys.argv[1:4]
E0, N0, CELL = 170000.0, 4810000.0, 100.0  # top-left of the grid, UTM 18N

def hex3(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

z = np.array(Image.open(tiff), dtype=np.float32)
bad = ~np.isfinite(z) | (z < -100) | (z > 3000)
if bad.any():
    z = z[tuple(ndi.distance_transform_edt(bad, return_distances=False, return_indices=True))]
H, W = z.shape
print('grid', W, H, 'elev', float(z.min()), float(z.max()), 'bad', int(bad.sum()))

# lake map frame (see art_terrain.py), turned north-up: world px <-> UTM
MW, MH, S = 2606, 4000, 17.0
a = np.array([-19500.0, 56000.0]); a /= np.linalg.norm(a)
ae, an = a
px, py = an, -ae
BETA = -1194.0
cx, cy = 368250.0 + BETA * px, 4729000.0 + BETA * py
def world(E, N):
    dE, dN = E - cx, N - cy
    return MW / 2 + (dE * px + dN * py) / S, MH / 2 - (dE * ae + dN * an) / S

# WGS84 -> UTM 18N (Krueger series; NAD83 and WGS84 agree to about a metre here)
def utm(lat, lon):
    f = 1 / 298.257223563; n = f / (2 - f); A = 6378137 / (1 + n) * (1 + n * n / 4 + n ** 4 / 64)
    al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240]
    phi, lam = np.radians(lat), np.radians(lon + 75)
    e = 2 * np.sqrt(n) / (1 + n)
    t = np.sinh(np.arctanh(np.sin(phi)) - e * np.arctanh(e * np.sin(phi)))
    xi, eta = np.arctan2(t, np.cos(lam)), np.arctanh(np.sin(lam) / np.sqrt(1 + t * t))
    E = 500000 + 0.9996 * A * (eta + sum(al[j] * np.cos(2 * (j + 1) * xi) * np.sinh(2 * (j + 1) * eta) for j in range(3)))
    N = 0.9996 * A * (xi + sum(al[j] * np.sin(2 * (j + 1) * xi) * np.cosh(2 * (j + 1) * eta) for j in range(3)))
    return float(E), float(N)
def rc(E, N): return (N0 - N) / CELL, (E - E0) / CELL

# hydro-flattened lakes are exactly level, so level connected patches are water
gy, gx = np.gradient(z)
flat = (np.abs(gx) + np.abs(gy)) < 0.02
flat = ndi.binary_opening(flat, iterations=1)
lab, n = ndi.label(flat)
area = ndi.sum(np.ones_like(z), lab, np.arange(1, n + 1))
water = np.isin(lab, np.where(area * CELL * CELL > 1.5e6)[0] + 1)
water = ndi.binary_closing(water, iterations=1)
water = ndi.binary_fill_holes(water)
lab, n = ndi.label(water)

# a point on each lake, near its middle, to find it in the grid
FINGERS = {
    'Conesus': (42.78, -77.72), 'Hemlock': (42.72, -77.61), 'Canadice': (42.72, -77.57), 'Honeoye': (42.76, -77.51),
    'Canandaigua': (42.78, -77.31), 'Keuka': (42.60, -77.09), 'Seneca': (42.65, -76.92), 'Cayuga': (42.70, -76.71),
    'Owasco': (42.82, -76.51), 'Skaneateles': (42.90, -76.39), 'Otisco': (42.87, -76.27),
}
# published surface areas (km2), as an outside check on the masks below
PUBLISHED = {'Conesus': 13.0, 'Hemlock': 7.2, 'Canadice': 2.6, 'Honeoye': 7.1, 'Canandaigua': 42.6, 'Keuka': 47.0, 'Seneca': 175.4, 'Cayuga': 172.0, 'Owasco': 26.7, 'Skaneateles': 35.9, 'Otisco': 8.9}
# a lake surface is the most common level among the flat cells near its middle; everything
# connected to it within a thin band of that level is the lake, even where the grid is not dead flat
all_flat = (np.abs(gx) + np.abs(gy)) < 0.05
masks = {}
for name, (la, lo) in FINGERS.items():
    r, c = rc(*utm(la, lo)); r, c = int(r), int(c)
    R = 18
    win = (max(0, r - R), r + R + 1, max(0, c - R), c + R + 1)
    fz, zw = all_flat[win[0]:win[1], win[2]:win[3]], z[win[0]:win[1], win[2]:win[3]]
    vals = np.round(zw[fz] * 2) / 2
    lvls, counts = np.unique(vals, return_counts=True)
    lvl = float(lvls[counts.argmax()])
    band = np.abs(z - lvl) < 1.3
    band = ndi.binary_opening(band, iterations=1)
    l2, _ = ndi.label(band)
    near = l2[win[0]:win[1], win[2]:win[3]]
    near = near[(near > 0) & (np.abs(zw - lvl) < 0.6)]
    m = l2 == int(np.bincount(near).argmax())
    m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=1))
    # shave off the marshes and inlets that sit at lake level: they are narrower than the lake
    if PUBLISHED[name] > 5:
        o = ndi.binary_opening(m, structure=np.ones((3, 3)), iterations=2 if PUBLISHED[name] < 100 else 3)
        l3, _ = ndi.label(o)
        m = l3 == int(np.bincount(l3[l3 > 0]).argmax())
        m = ndi.binary_dilation(m, iterations=1) & (band | m)
    if name == 'Cayuga':
        # Montezuma marsh continues north at lake level; the lake map's mask ends the lake at v = 288
        rr, cc = np.mgrid[0:H, 0:W]
        m = m & (world(E0 + cc * CELL, N0 - rr * CELL)[1] > 280)
    masks[name] = m
    km2 = m.sum() * CELL * CELL / 1e6
    print(f'{name:12s} level {lvl:6.1f} m  area {km2:7.1f} km2  published {PUBLISHED[name]:6.1f}  ratio {km2 / PUBLISHED[name]:.2f}')
fingers = np.logical_or.reduce(list(masks.values()))
cayuga = masks['Cayuga']
lab2, _ = ndi.label(fingers)
ids = {name: None for name in masks}

# Where the lake map's finer grid reaches, draw from it: the same shore and the same elevations, so that
# when one map crossfades into the other there is only ever one lake and one set of hills.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from terrain import load, CELL as FINE, E0 as FINE_E0, N0 as FINE_N0
fine_z, fine_w = load(out)
rows, cols = np.mgrid[0:H, 0:W].astype(np.float32)
fr, fc = (FINE_N0 - (N0 - rows * CELL)) / FINE, ((E0 + cols * CELL) - FINE_E0) / FINE
inside = (fr >= 0) & (fr < fine_w.shape[0] - 1) & (fc >= 0) & (fc < fine_w.shape[1] - 1)
def coarsen(grid):  # area-average down to this map's cells
    return ndi.map_coordinates(ndi.gaussian_filter(grid.astype(np.float32), CELL / FINE / 2), [fr, fc], order=1, mode='nearest')
fl, _ = ndi.label(fine_w)
fine_cayuga = fl == fl[int((FINE_N0 - 4724970) / FINE), int((363399 - FINE_E0) / FINE)]

# the land, as in terrain.webp: page color and thin real contour lines, coarser for the scale
zs = np.where(inside, coarsen(fine_z), ndi.gaussian_filter(z, 1.1))
gy, gx = np.gradient(zs)
g = np.sqrt(gx * gx + gy * gy) + 1e-4
def lines(interval, width):
    d = np.abs(((zs / interval + 0.5) % 1) - 0.5) * interval / g
    return smoothstep(width + 0.7, width - 0.7, d) * (g > 0.05)
amt = np.clip(lines(100.0, 0.55) * 0.5 + lines(200.0, 0.95) * 0.8, 0, 1)  # levels the lake map draws too, so these lines become its lines
# the big lakes at the edges of the grid carry data-seam artifacts and nothing the eye needs
l4, n4 = ndi.label(water)
sizes = ndi.sum(np.ones_like(z), l4, np.arange(1, n4 + 1))
big = np.isin(l4, np.where(sizes * CELL * CELL > 30e6)[0] + 1) & ~fingers
out_of_frame = ndi.binary_dilation(big | (z < 80), iterations=6)
amt = amt * ~out_of_frame
# quieter away from the lakes, so they stay the subject
near = ndi.gaussian_filter(fingers.astype(np.float32), 110)
amt = (amt * (0.42 + 0.58 * np.clip(near / np.percentile(near[fingers], 40), 0, 1)))[..., None]
# transparent where there is nothing but land, so it can lie directly over the satellite picture
rgb = np.ones((H, W, 3), np.float32) * hex3('#3f7a68')
alpha = amt.copy()
def paint(cover, color):
    global rgb, alpha
    al = smoothstep(0.25, 0.75, cover)[..., None]  # keeps the partial cells, so an enlarged shore stays smooth
    rgb = rgb * (1 - al) + hex3(color) * al
    alpha = alpha + (1 - alpha) * al
soft = lambda mask: ndi.gaussian_filter(mask.astype(np.float32), 0.8)
paint(soft(water & ~fingers & ~out_of_frame & ~inside), '#1f4a63')   # other water, for context
paint(np.where(inside, coarsen(fine_w), soft(fingers)), '#3c8cb3')
paint(np.where(inside, coarsen(fine_cayuga), soft(cayuga)), '#6cb6d6')  # where the scroll is about to go
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
alpha = alpha * smoothstep(0, 1, np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy]) / 90)[..., None]  # soft edges
rgba = np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)])
im = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')
im.save(f'{out}/region-full.png')
im.save(f'{pub}/region.webp', quality=60, alpha_quality=35, method=6)
print('region.webp', os.path.getsize(f'{pub}/region.webp') // 1024, 'KB')

# everything Descent.tsx needs, in world px
def grid_to_world(r, c): return world(E0 + c * CELL, N0 - r * CELL)
res = {'region_origin': grid_to_world(0, 0), 'region_scale': CELL / S, 'turn_rad': float(np.arctan2(-ae, px))}
tips = {}
for name, m in masks.items():
    ys, xs = np.where(m)
    k_n, k_s = ys.argmin(), ys.argmax()
    tips[name] = {'n': grid_to_world(ys[k_n], xs[k_n]), 's': grid_to_world(ys[k_s], xs[k_s]), 'c': grid_to_world(ys.mean(), xs.mean())}
res['tips'] = tips
ys, xs = np.where(fingers)
res['fingers_bbox_km'] = [(xs.max() - xs.min()) * CELL / 1000, (ys.max() - ys.min()) * CELL / 1000]
res['fingers_centre'] = grid_to_world((ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2)
res['places'] = {k: world(*utm(*v)) for k, v in {'Ithaca': (42.4406, -76.4966), 'Rochester': (43.1566, -77.6088), 'Syracuse': (43.0481, -76.1474), 'McGraw': (42.44757, -76.48504)}.items()}
json.dump(res, open(f'{out}/region.json', 'w'), indent=1, default=float)
print(json.dumps({k: res[k] for k in ['region_origin', 'region_scale', 'turn_rad', 'fingers_bbox_km', 'fingers_centre', 'places']}, default=float))
