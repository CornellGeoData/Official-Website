# Shared terrain code. Pure functions: arrays in, arrays out.
import numpy as np
from scipy import ndimage as ndi
CELL = 28.0
E0, N0 = 335000.0, 4768000.0  # top-left of the grid, NAD83 UTM 18N
LAKES = [(116.6, 363399, 4724970), (135.6, 343504, 4719353), (217.3, 376539, 4743566), (263.2, 388446, 4746372), (240.6, 394580, 4747261)]
def rc(e, n): return int((N0 - n) / CELL), int((e - E0) / CELL)
def load(art):
    z = np.load(art + '/z.npy')
    w = np.zeros(z.shape, bool)
    for lvl, e, n in LAKES:
        # a thin band around lake level, so a high lake cannot flood the land below it
        lab, _ = ndi.label((z < lvl) & (z > lvl - 1.6))
        w |= lab == lab[rc(e, n)]
    w = ndi.binary_opening(w, iterations=2)
    w = ndi.binary_fill_holes(w)
    # only real lakes: drop marsh and canal fragments at the north end
    lab, n = ndi.label(w)
    sizes = ndi.sum(np.ones_like(z), lab, np.arange(1, n + 1))
    w = np.isin(lab, np.where(sizes * CELL * CELL > 8e6)[0] + 1)
    return z, ndi.binary_closing(w, iterations=3)
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
def lights(z, water, az=315.0, alt=22.0, exag=3.0, cell=CELL, shadow_steps=170):
    """z in metres -> (direct light 0..1 incl. cast shadow, sky visibility 0..1)"""
    h = ndi.gaussian_filter(z, 0.6) * exag
    gy, gx = np.gradient(h, cell)
    a, b = np.radians(az), np.radians(alt)
    sx, sy, sz = np.sin(a) * np.cos(b), np.cos(a) * np.cos(b), np.sin(b)  # +y is north, rows run south
    n = np.sqrt(gx * gx + gy * gy + 1)
    lam = np.clip((-gx * sx + gy * sy + sz) / n, 0, 1)
    shadow = np.zeros(z.shape, bool)
    dx, dy, rise = np.sin(a), -np.cos(a), np.tan(b) * cell
    for k in range(1, shadow_steps):
        shadow |= np.roll(h, (-int(round(k * dy)), -int(round(k * dx))), (0, 1)) - k * rise > h + 0.5
    soft = 1 - ndi.gaussian_filter(shadow.astype(np.float32), 1.2)
    sky = np.zeros(z.shape, np.float32)
    dirs = 12
    for i in range(dirs):
        t = 2 * np.pi * i / dirs
        best = np.zeros(z.shape, np.float32)
        for r in (1, 2, 4, 8, 16, 32, 64):
            s = (np.roll(h, (int(round(r * np.sin(t))), int(round(r * np.cos(t)))), (0, 1)) - h) / (r * cell)
            best = np.maximum(best, s)
        sky += 1 / (1 + best * best)
    sky /= dirs
    return lam * soft, sky
def tonemap(c, exposure=1.0):
    return np.clip(1 - np.exp(-c * exposure), 0, 1) ** (1 / 2.2)
def to8(c, seed=1):
    # a little noise so dark gradients do not band
    n = np.random.default_rng(seed).random(c.shape[:2])[..., None] / 255
    return (np.clip(c + n, 0, 1) * 255).astype(np.uint8)

# ---- the shared look: one dark land, one bright lake
def hex3(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255
def ramp(t, stops):
    xs = np.linspace(0, 1, len(stops)); cs = np.array([hex3(c) for c in stops])
    return np.stack([np.interp(t, xs, cs[:, k]) for k in range(3)], -1)
def land_base(lam, sky):
    t = np.clip(lam ** 1.35 + 0.05 * sky ** 3, 0, 1)
    return ramp(t, ['#0a100f', '#0d1916', '#142620', '#233c33', '#4a6a5c', '#94b3a5'])
def add_lake(rgb, wa, along):
    """The lake as one flat ribbon, lighter at Ithaca and deepening north. along: 0 to 1."""
    lake = ramp(smoothstep(0.05, 0.95, along), ['#5ea8c8', '#3c8cb3', '#2a7199', '#1d5a80'])
    a = wa[..., None]
    return rgb * (1 - a) + lake * a
