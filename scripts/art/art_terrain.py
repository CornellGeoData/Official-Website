# The home backdrop: the same land and lake, turned so Cayuga runs straight down the page with
# the north end at the top and Ithaca at the bottom, so scrolling travels south to Cornell.
# usage: art_terrain.py <art dir> <scripts dir> <public art dir>
import sys, os
sys.path.insert(0, sys.argv[2])
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from terrain import *
art, _, pub = sys.argv[1:4]
os.makedirs(pub, exist_ok=True)
W, H, s = 2606, 4000, 17.0   # 44 by 68 km
a = np.array([-19500.0, 56000.0]); a /= np.linalg.norm(a)
ae, an = a
px, py = an, -ae             # east-ish, across the lake
BETA = -1194.0               # keeps the corners inside the elevation grid
cx, cy = 368250.0 + BETA * px, 4729000.0 + BETA * py
PAD = 200
vv, uu = np.mgrid[-PAD:H + PAD, -PAD:W + PAD].astype(np.float32)
du, dv = (uu - W / 2) * s, (vv - H / 2) * s
E = cx + dv * ae - du * px   # down the page is north; no mirror
N = cy + dv * an - du * py
r, c = (N0 - N) / CELL, (E - E0) / CELL
z, w = load(art)
zs = ndi.gaussian_filter(z, 0.9); zs[w] = z[w]
Z = ndi.map_coordinates(zs, [r, c], order=3, mode='nearest').astype(np.float32)
Wm = ndi.gaussian_filter(ndi.map_coordinates(w.astype(np.float32), [r, c], order=1, mode='nearest'), 2.2)
wa = smoothstep(0.44, 0.56, Wm).astype(np.float32)
crop = lambda x: x[PAD:PAD + H, PAD:PAD + W]
Zc, wc = crop(Z), crop(wa)
# the land is the page color itself, drawn only as thin real contour lines
gy, gx = np.gradient(ndi.gaussian_filter(Zc, 1.6))
g = np.sqrt(gx * gx + gy * gy) + 1e-4
def lines(interval, width):
    d = np.abs(((Zc / interval + 0.5) % 1) - 0.5) * interval / g
    return smoothstep(width + 0.7, width - 0.7, d) * (g > 0.004)
amt = np.clip(lines(20.0, 0.8) * 0.48 + lines(100.0, 1.3) * 0.85, 0, 1)[..., None]
page = np.ones((H, W, 3), np.float32) * hex3('#0e141c')
rgb = page * (1 - amt) + hex3('#3f7a68') * amt
along = (np.arange(H, dtype=np.float32) / H)[:, None] * np.ones((H, W), np.float32)
rgb = add_lake(rgb, wc, along)
im = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8))
# rendered south-up, which is the frame the numbers above are in, then turned to north-up
im = im.rotate(180)
im.save(f'{art}/terrain-full.png')
# soft edges, baked in, so the lake map melts into the region map behind it. The same fade as a CSS mask costs
# a layer the size of the whole map, which is hundreds of MB on a phone.
edge = lambda n: np.clip(np.minimum(np.arange(n), n - 1 - np.arange(n)) / (n * 0.04), 0, 1)
faded = im.copy()
faded.putalpha(Image.fromarray((edge(H)[:, None] * edge(W)[None, :] * 255 + 0.5).astype(np.uint8)))
faded.save(f'{pub}/terrain.webp', quality=82, method=6)
# Cayuga's centre line, so the camera can keep the ribbon in the same place on screen
lab, _ = ndi.label(wc > 0.5)
sizes = ndi.sum(np.ones(lab.shape), lab, np.arange(1, lab.max() + 1))
big = lab == (np.argsort(sizes)[-1] + 1)
ys, xs = np.where(big)
print('Cayuga spans y (north-up)', round(1 - ys.max() / H, 3), 'to', round(1 - ys.min() / H, 3))
for fy in np.linspace(ys.max() / H - 0.01, ys.min() / H + 0.01, 9):
    row = big[int(fy * H)]
    print(f'  [{1 - fy:.3f}, {1 - np.where(row)[0].mean() / W:.3f}],  width km {row.sum() * s / 1000:.1f}')
print('terrain', os.path.getsize(f'{pub}/terrain.webp') // 1024, 'KB')
