# Reads the USGS grid, finds the lakes, and caches arrays for the art scripts.
# usage: dem_base.py <tiff> <outdir>
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
Image.MAX_IMAGE_PIXELS = None
tiff, out = sys.argv[1], sys.argv[2]
z = np.array(Image.open(tiff), dtype=np.float32)
print('grid', z.shape, 'range', float(np.nanmin(z)), float(np.nanmax(z)))
bad = ~np.isfinite(z) | (z < -100) | (z > 3000)
print('bad cells', int(bad.sum()))
if bad.any():
    idx = ndi.distance_transform_edt(bad, return_distances=False, return_indices=True)
    z = z[tuple(idx)]
# hydro-flattened lakes are exactly level, so level connected patches are water
gy, gx = np.gradient(z)
flat = (np.abs(gx) + np.abs(gy)) < 0.02
flat = ndi.binary_opening(flat, iterations=2)
lab, n = ndi.label(flat)
area = ndi.sum(np.ones_like(z), lab, np.arange(1, n + 1))
keep = np.where(area * (28 ** 2) > 1.5e6)[0] + 1
water = np.isin(lab, keep)
water = ndi.binary_closing(water, iterations=2)
print('flat patches over 1.5 km2:', len(keep))
for k in keep:
    m = lab == k
    ys, xs = np.where(m)
    print(f'  area {area[k-1]*28*28/1e6:7.1f} km2  elev {float(np.median(z[m])):6.1f} m  length {(ys.max()-ys.min())*28/1000:5.1f} km  centre E {335000+xs.mean()*28:.0f} N {4768000-ys.mean()*28:.0f}')
np.save(out + '/z.npy', z); np.save(out + '/water.npy', water)
