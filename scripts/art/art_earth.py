# Two sharper layers of the globe around Ithaca, so the ground stays crisp on the way down from space.
# NASA Blue Marble Next Generation (public domain), December 2004, the month public/earth-4k.webp is.
# usage: art_earth.py <A1.jpg> <B1.jpg> <public dir>     A1 and B1 are the 500 m tiles: 90N to 0, 180W to 90W and 90W to 0
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
Image.MAX_IMAGE_PIXELS = None
a1, b1, pub = sys.argv[1:4]
PER_DEG = 240
# name, lon0, lon1, lat0, lat1, output width, edge feather in degrees, quality
TIERS = [('earth-ne', -105, -60, 28, 56, 2025, 1.6, 66), ('earth-ny', -84, -68, 38, 48, 1920, 0.7, 66)]
base = Image.open(f'{pub}/earth-4k.webp').convert('RGB').transpose(Image.FLIP_TOP_BOTTOM)  # stored south-up
tiles = [(Image.open(a1), -180), (Image.open(b1), -90)]
for name, lon0, lon1, lat0, lat1, ow, fe, q in TIERS:
    w, h = (lon1 - lon0) * PER_DEG, (lat1 - lat0) * PER_DEG
    canvas = Image.new('RGB', (w, h))
    for tile, west in tiles:
        x0, x1 = max(lon0, west), min(lon1, west + 90)
        if x0 >= x1: continue
        box = ((x0 - west) * PER_DEG, (90 - lat1) * PER_DEG, (x1 - west) * PER_DEG, (90 - lat0) * PER_DEG)
        canvas.paste(tile.crop(box), ((x0 - lon0) * PER_DEG, 0))
    oh = round(ow * h / w)
    im = np.asarray(canvas.resize((ow, oh), Image.LANCZOS), np.float32)
    # same imagery as the globe, so a small per-channel fit against it makes the seam disappear
    bw, bh = base.size
    ref = np.asarray(base.crop(((lon0 + 180) * bw // 360, (90 - lat1) * bh // 180, (lon1 + 180) * bw // 360, (90 - lat0) * bh // 180)), np.float32)
    small = np.asarray(canvas.resize((ref.shape[1], ref.shape[0]), Image.BOX), np.float32)
    for c in range(3):
        m, b = np.polyfit(small[..., c].ravel(), ref[..., c].ravel(), 1)
        im[..., c] = np.clip(im[..., c] * m + b, 0, 255)
    print(name, 'mean difference from the globe', round(float(np.abs(small * 1 - ref).mean()), 2))
    # feathered edges, so there is no line where the layer ends
    yy, xx = np.mgrid[0:oh, 0:ow].astype(np.float32)
    d = np.minimum.reduce([xx, ow - 1 - xx, yy, oh - 1 - yy]) / (ow / (lon1 - lon0)) / fe
    t = np.clip(d, 0, 1); alpha = (t * t * (3 - 2 * t) * 255).astype(np.uint8)
    out = Image.fromarray(np.dstack([im.astype(np.uint8), alpha]), 'RGBA')
    out.save(f'{pub}/art/{name}.webp', quality=q, alpha_quality=40, method=6)
    print(name, ow, oh, os.path.getsize(f'{pub}/art/{name}.webp') // 1024, 'KB')
