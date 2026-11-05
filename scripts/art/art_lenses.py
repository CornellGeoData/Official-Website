# One picture of Cayuga Lake, lake running left (Ithaca) to right (north). Every team shares the
# same land and the same bright lake; only its data layer differs, so the slices line up.
# usage: art_lenses.py <art dir> <scripts dir> [--mobile] [--data-model=/path/to/model.npz] [lens ...]
import sys, json, os
sys.path.insert(0, sys.argv[2])
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from terrain import *
art = sys.argv[1]
only = set(sys.argv[3:])
data_model = next((arg.split('=', 1)[1] for arg in only if arg.startswith('--data-model=')), None)
only = {arg for arg in only if not arg.startswith('--data-model=')}
mobile = '--mobile' in only
only.discard('--mobile')
OW, OH = 3200, 1200
W, H, s = 4800, 1800, 15.0  # 72 by 27 km
PAD = 320
a = np.array([-19500.0, 56000.0]); a /= np.linalg.norm(a)
ae, an = a
# centred a little west of the lake, which also leaves Owasco out of frame
cx, cy = 368250.0 - 2300.0 * an, 4729000.0 + 2300.0 * ae
if mobile:
    # The full lake fits inside the mobile circle, with real terrain to its edge.
    OW = OH = 1200
    W = H = 1800
    s = 35.0
    ae, an = (ae + an) / np.sqrt(2), (an - ae) / np.sqrt(2)
    cx, cy = 367500.0, 4729000.0
def frame_to_grid(u, v):
    E = cx + (u - W / 2) * s * ae + (v - H / 2) * s * an
    N = cy + (u - W / 2) * s * an - (v - H / 2) * s * ae
    return (N0 - N) / CELL, (E - E0) / CELL
vv, uu = np.mgrid[-PAD:H + PAD, -PAD:W + PAD].astype(np.float32)
r, c = frame_to_grid(uu, vv)
zraw, wraw = load(art)
zs = ndi.gaussian_filter(zraw, 0.9); zs[wraw] = zraw[wraw]
Z = ndi.map_coordinates(zs, [r, c], order=3, mode='nearest').astype(np.float32)
# past the edge of the fine grid, the regional one: real ground, instead of edge cells smeared into stripes
edge = np.minimum.reduce([r, zraw.shape[0] - 1 - r, c, zraw.shape[1] - 1 - c])
if edge.min() < 30 and os.path.exists(art + '/region_z.npy'):
    Zr = ndi.map_coordinates(ndi.gaussian_filter(np.load(art + '/region_z.npy'), 0.6), [(4810000.0 - (N0 - r * CELL)) / 100.0, ((E0 + c * CELL) - 170000.0) / 100.0], order=3, mode='nearest').astype(np.float32)
    Z = Zr + (Z - Zr) * smoothstep(0, 30, edge)
Wm = ndi.gaussian_filter(ndi.map_coordinates(wraw.astype(np.float32), [r, c], order=1, mode='nearest'), 2.4)
wa_full = smoothstep(0.42, 0.58, Wm).astype(np.float32)
crop = lambda x: x[PAD:PAD + H, PAD:PAD + W]
lam, sky = lights(Z, None, az=315, alt=20, exag=3.6, cell=s, shadow_steps=260)
BASE = land_base(crop(lam), crop(sky))
wa = crop(wa_full)
ALONG = (np.arange(W, dtype=np.float32) / W)[None, :] * np.ones((H, W), np.float32)
def finish(color, amt, name):
    amt = np.clip(amt, 0, 1)[..., None]
    rgb = BASE * (1 - amt) + color * amt
    rgb = add_lake(rgb, wa, ALONG)
    img = Image.fromarray(to8(np.clip(rgb, 0, 1).astype(np.float32))).resize((OW, OH), Image.LANCZOS)
    suffix = '-mobile' if mobile else ''
    img.save(f'{art}/lens-{name}{suffix}.png'); print(name + suffix, 'ok', flush=True)
want = lambda n: not only or n in only

if want('leadership'):  # the land itself, lit green
    t = crop(lam) ** 1.7
    finish(ramp(t, ['#0f3a26', '#2a7a52', '#7fd0a4', '#e4f8ec']), t * 1.5, 'leadership')

if want('rock'):        # the real bedrock (USGS), showing as layered rock only where the ground is steep enough to expose it
    meta = json.load(open(f'{art}/geology.json')); geo = np.load(f'{art}/geology.npz')
    Eg, Ng = E0 + c * CELL, N0 - r * CELL
    px = 15.0 / s  # so textures stay the same size on the ground in either frame
    rng = np.random.default_rng(23)
    def noise(sigma):
        n = ndi.gaussian_filter(rng.standard_normal(Z.shape).astype(np.float32), max(0.6, sigma * px))
        return n / n.std()
    # a layer's height in the rock: elevation with the regional tilt taken out, wavering as real beds do
    S = Z - meta['dip'][0] * (Eg - cx) - meta['dip'][1] * (Ng - cy) + 9 * noise(70) + 3 * noise(16)
    BED = 30.0
    u = S / BED
    u = u + 0.30 * np.sin(2 * np.pi * u * 0.31) + 0.18 * np.sin(2 * np.pi * u * 0.13)  # uneven bed thickness
    bed = np.floor(u); frac = u - bed
    gy, gx = np.gradient(ndi.gaussian_filter(Z, 1.0), s)
    # hillslopes are under glacial till and forest; gorges and lake bluffs are bare rock
    steep = np.hypot(gx, gy) * (1 + 0.28 * noise(10))
    bare = smoothstep(0.05, 0.20, steep).astype(np.float32)
    Zd = Z + bare * 7.0 * smoothstep(0.0, 0.22, frac) * (0.75 + 0.25 * np.sin(bed * 12.9898))  # hard beds stand out as ledges
    lit, sky2 = lights(Zd, None, az=315, alt=24, exag=3.3, cell=s, shadow_steps=110)
    # each formation in the color of its rock
    SHADES = {'shale': '#7a5a44', 'black shale': '#4d3b31', 'siltstone': '#8f6d4f', 'sandstone': '#9c7a55', 'limestone': '#a08a6c', 'dolostone (dolomite)': '#967f62'}
    STEPS = [1.0, 0.84, 1.14, 0.92, 1.07]  # neighboring formations of the same rock still read apart
    colors = np.zeros((len(meta['units']) + 1, 3), np.float32) + hex3('#6d5546')
    for i, unit in enumerate(meta['units']):
        colors[i + 1] = hex3(SHADES.get(unit['rock'], '#6d5546')) * STEPS[i % len(STEPS)]
    canvas = Image.new('L', (W + 2 * PAD, H + 2 * PAD), 0); dr = ImageDraw.Draw(canvas)
    dE, dN = geo['pts'][:, 0] - cx, geo['pts'][:, 1] - cy
    gu, gv = W / 2 + (dE * ae + dN * an) / s + PAD, H / 2 + (dE * an - dN * ae) / s + PAD
    off = 0
    for n, unit in zip(geo['lens'].tolist(), geo['unit'].tolist()):
        if gu[off:off + n].max() > 0 and gu[off:off + n].min() < W + 2 * PAD and gv[off:off + n].max() > 0 and gv[off:off + n].min() < H + 2 * PAD:
            dr.polygon(list(zip(gu[off:off + n].tolist(), gv[off:off + n].tolist())), fill=unit)
        off += n
    # map contacts are only good to a couple hundred meters, so they waver rather than running as drawn lines
    wx, wy = 5 * px * noise(40), 5 * px * noise(40)
    yy, xx = np.mgrid[0:Z.shape[0], 0:Z.shape[1]].astype(np.float32)
    units = ndi.map_coordinates(np.asarray(canvas), [yy + wy, xx + wx], order=0)
    tone = 0.84 + 0.32 * ((np.sin(bed * 78.233) * 43758.5453) % 1)  # each bed its own shade
    tone = 1 + (tone - 1) * (0.42 + 0.58 * bare)
    # formations grade into each other on the ground rather than meeting at a drawn edge
    col = ndi.gaussian_filter(colors[units], (3.5 * W / OW, 3.5 * W / OW, 0)) * tone[..., None]
    col = col * (1 - 0.34 * bare[..., None]) + hex3('#c1703f') * tone[..., None] * 0.34 * bare[..., None]  # weathered, iron-stained faces
    shade = 0.12 + 1.30 * lit ** 1.1 + 0.08 * sky2 ** 3
    rgb = col * shade[..., None] * (1 + 0.05 * noise(0.8) + 0.06 * noise(3.5))[..., None]
    # forest and soil over the rock on gentle ground, thinning as it steepens
    cover = (0.36 * (1 - bare) * (0.8 + 0.2 * noise(30).clip(-1, 1)))[..., None]
    land = np.zeros_like(rgb); land[PAD:PAD + H, PAD:PAD + W] = BASE
    rgb = rgb * (1 - cover) + land * cover
    finish(crop(rgb), np.ones((H, W), np.float32), 'rock')

if want('business'):    # just the roads: every real street in one color, nothing marking a town
    rd = np.load(f'{art}/roads.npz')
    def streets(kind, width):
        canvas = Image.new('L', (W, H), 0); draw = ImageDraw.Draw(canvas)
        pts, off = rd[f'{kind}_pts'], 0
        dE, dN = pts[:, 0] - cx, pts[:, 1] - cy
        U, V = W / 2 + (dE * ae + dN * an) / s, H / 2 + (dE * an - dN * ae) / s
        for n in rd[f'{kind}_lens'].tolist():
            u, v = U[off:off + n], V[off:off + n]; off += n
            if u.max() < 0 or u.min() > W or v.max() < 0 or v.min() > H: continue
            draw.line(list(zip(u.tolist(), v.tolist())), fill=255, width=width)
        return np.asarray(canvas, np.float32) / 255
    local, major = streets('street', 2), streets('major', 5)
    amt = np.clip(local * 0.5 + major * 0.95, 0, 1)
    finish(ramp(major * 0.6, ['#c9a92c', '#dcbe32', '#f0d65a']), amt, 'business')

# used by the Data layer
Zc = crop(Z)
zs3 = ndi.gaussian_filter(Zc, 3)

if want('data'):        # real machine learning: k-means sorts the land by shape, with no labels given
    if data_model:
        # A single geographic classification is sampled into either frame, without retraining.
        with np.load(data_model) as model:
            mr = (float(model['n0']) - (N0 - crop(r) * CELL)) / float(model['cell'])
            mc = ((E0 + crop(c) * CELL) - float(model['e0'])) / float(model['cell'])
            lab = ndi.map_coordinates(model['labels'], [mr, mc], order=0, mode='constant', cval=255)
            coverage = ndi.map_coordinates(model['valid'].astype(np.uint8), [mr, mc], order=0, mode='constant', cval=0)
            visible = (crop(uu) - W / 2) ** 2 + (crop(vv) - H / 2) ** 2 <= (W / 2) ** 2 if mobile else np.ones((H, W), bool)
            assert coverage[visible & (wa < 0.01)].all(), 'Terrain model must cover all visible land'
            valid = lab < 8
            v = np.zeros((H, W), np.float32)
            v[valid] = model['rank_by_class'][lab[valid]] / 7.0
        edge = np.zeros((H, W), bool)
        edge[1:, :] |= (lab[1:, :] != lab[:-1, :]) & valid[1:, :] & valid[:-1, :]
        edge[:, 1:] |= (lab[:, 1:] != lab[:, :-1]) & valid[:, 1:] & valid[:, :-1]
    else:
        from scipy.cluster.vq import kmeans2
        gy, gx = np.gradient(ndi.gaussian_filter(Zc, 5))
        slope = np.hypot(gx, gy); curv = ndi.gaussian_laplace(Zc, 12)
        feats = np.stack([ (zs3 - zs3.mean()) / zs3.std(), np.clip(slope / np.percentile(slope, 98), 0, 1) * 2.4,
                           np.clip(curv / np.percentile(np.abs(curv), 98), -1, 1) * 1.6, gx / (slope + 0.05) * 0.8, gy / (slope + 0.05) * 0.8 ], -1)
        rng = np.random.default_rng(3); idx = rng.choice(W * H, 60000, replace=False)
        centers, _ = kmeans2(feats.reshape(-1, 5)[idx].astype(np.float64), 8, minit='++', seed=3, iter=30)
        d2 = ((feats[..., None, :] - centers[None, None, :, :].astype(np.float32)) ** 2).sum(-1)
        lab = d2.argmin(-1)
        lab = ndi.median_filter(lab.astype(np.uint8), size=9)
        # brighter for the classes with more relief, so the ramp means something
        order = np.argsort(np.argsort([slope[lab == i].mean() if (lab == i).any() else 0 for i in range(8)]))
        v = (order[lab] / 7.0).astype(np.float32)
        edge = ((lab != np.roll(lab, 1, 0)) | (lab != np.roll(lab, 1, 1)))
    edge = ndi.gaussian_filter(edge.astype(np.float32), 0.8) * 1.6
    amount = np.clip(0.10 + v ** 1.3 * 0.62 + edge * 0.6, 0, 1)
    if data_model:
        amount *= valid
    finish(ramp(np.clip(v * 0.8 + edge * 0.3, 0, 1), ['#6a2ca0', '#8f45cc', '#b57ae6', '#efdcff']), amount, 'data')

if want('tech'):        # the land as an engineering mesh: cells sized by real curvature, lifted and lit from real elevation
    from scipy.spatial import Delaunay, cKDTree
    from scipy.interpolate import LinearNDInterpolator
    PINK = ['#8e1a42', '#c92556', '#ee4a7d', '#ffc2d6']
    # built on the frame plus a margin, so hills lifted in relief still reach the frame's edges
    M = 200
    field = ndi.gaussian_filter(Z, 2.0)[PAD - M:PAD + H + M, PAD - M:PAD + W + M]
    water = wa_full[PAD - M:PAD + H + M, PAD - M:PAD + W + M] >= 0.5
    def z_at(p):
        return ndi.map_coordinates(field, [p[:, 1] + M, p[:, 0] + M], order=1, mode='nearest')
    ey, ex = np.mgrid[-M:H + M:3, -M:W + M:3]
    EV = np.stack([ex.ravel(), ey.ravel()], 1).astype(np.float64)
    EZ = z_at(EV); EW = water[(EV[:, 1] + M).astype(int), (EV[:, 0] + M).astype(int)]

    def shoreline(spacing):
        """Points along the shore, so triangles end at the water instead of being cut off by it."""
        e = ndi.binary_dilation(water) & ~water
        ys, xs = np.where(e); p = np.stack([xs - M, ys - M], 1).astype(np.float64)
        cell = np.floor(p / spacing).astype(int); _, i = np.unique(cell, axis=0, return_index=True)
        return p[i]

    def curvature_density(sigma=6.0, spread=22.0, floor=0.045):
        """Linear facets miss the ground by about h^2 x curvature, so the best cell size h goes as 1/sqrt(curvature):
        point density proportional to curvature, with a floor so flat land still has a mesh, and spread so sizes grade smoothly."""
        f = ndi.gaussian_filter(field, sigma)
        gy, gx = np.gradient(f); hyy, hyx = np.gradient(gy); hxy, hxx = np.gradient(gx)
        tr, det = hxx + hyy, hxx * hyy - hxy * hyx
        disc = np.sqrt(np.maximum(tr * tr / 4 - det, 0))
        k = np.maximum(np.abs(tr / 2 + disc), np.abs(tr / 2 - disc))
        k = ndi.gaussian_filter(k, spread)
        rho = np.clip(k / np.percentile(k[~water], 88), floor, 1.0)
        rho[water] = 0
        return rho

    def graded(n, rounds=4, iters=9, shore_spacing=46.0, seed=7):
        """Weighted Lloyd relaxation: every point moves to the density-weighted centre of its own cell, which evens out the
        triangles. Between rounds, density rises wherever the mesh still misses the ground, so accuracy improves without knots."""
        rho = curvature_density()
        fixed = shoreline(shore_spacing)
        rng = np.random.default_rng(seed)
        idx = (EV[:, 1] + M).astype(int), (EV[:, 0] + M).astype(int)
        r = rho[idx].astype(np.float64); use = r > 0; ev = EV[use]; w = r[use]
        free = ev[rng.choice(len(ev), n, replace=False, p=w / w.sum())] + rng.random((n, 2)) * 3
        for rd in range(rounds):
            w = rho[idx].astype(np.float64)[use]
            for _ in range(iters):
                gens = np.vstack([fixed, free])
                _, who = cKDTree(gens).query(ev, workers=-1)
                m = np.bincount(who, w, len(gens)); cx_ = np.bincount(who, w * ev[:, 0], len(gens)); cy_ = np.bincount(who, w * ev[:, 1], len(gens))
                ok = m[len(fixed):] > 0
                free[ok, 0] = (cx_[len(fixed):] / np.maximum(m[len(fixed):], 1e-9))[ok]
                free[ok, 1] = (cy_[len(fixed):] / np.maximum(m[len(fixed):], 1e-9))[ok]
            if rd == rounds - 1: break
            pts = np.vstack([fixed, free])
            err = np.abs(LinearNDInterpolator(Delaunay(pts), z_at(pts))(EV) - EZ); err[np.isnan(err) | EW] = 0
            grid = np.zeros(rho.shape, np.float32); grid[idx] = err
            grid = ndi.gaussian_filter(ndi.maximum_filter(grid, 5), 14)
            rho = np.where(water, 0, np.clip(rho * (1 + 1.6 * np.clip(grid / np.percentile(grid[~water], 97), 0, 1.5)), 0.045, 4.0))
        return np.vstack([fixed, free])

    def draw(pts, name, relief_k=0.0, SS=2):
        """Land is the mesh itself: facets lit from their real slope and tinted by real elevation, edges heavier where the ground folds."""
        tri = Delaunay(pts); z = z_at(pts); simp = tri.simplices
        a, b, c = pts[simp[:, 0]], pts[simp[:, 1]], pts[simp[:, 2]]
        za, zb, zc = z[simp[:, 0]], z[simp[:, 1]], z[simp[:, 2]]
        det = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (c[:, 0] - a[:, 0]) * (b[:, 1] - a[:, 1]); det[np.abs(det) < 1e-6] = 1e-6
        ex_ = 3.2 / s
        gx = ((zb - za) * (c[:, 1] - a[:, 1]) - (zc - za) * (b[:, 1] - a[:, 1])) / det * ex_
        gy = ((zc - za) * (b[:, 0] - a[:, 0]) - (zb - za) * (c[:, 0] - a[:, 0])) / det * ex_
        az, alt = np.radians(315), np.radians(38)
        sx, sy, sz = np.sin(az) * np.cos(alt), np.cos(az) * np.cos(alt), np.sin(alt)
        nz = np.sqrt(gx * gx + gy * gy + 1)
        lit = np.clip((-gx * sx + gy * sy + sz) / nz, 0, 1)
        shade = np.clip((lit - sz) * 2.2, -1, 1)                     # + on slopes facing the light, - on the far side
        high = smoothstep(116, 500, (za + zb + zc) / 3)
        cent = (a + b + c) / 3
        wet = water[np.clip((cent[:, 1] + M).astype(int), 0, water.shape[0] - 1), np.clip((cent[:, 0] + M).astype(int), 0, water.shape[1] - 1)]
        nrm = np.stack([-gx, gy, np.ones_like(gx)], 1) / nz[:, None]
        P = pts.copy(); P[:, 1] = P[:, 1] - (z - 116.0) * relief_k
        order = np.argsort(P[simp].mean(1)[:, 1])                    # far to near, so nearer ground hides what is behind it
        SW, SH = W * SS, H * SS
        mk = lambda: Image.new('F', (SW, SH), 0)
        Lit, Hi, La, Lv = mk(), mk(), mk(), mk()
        dL, dH, dA, dV = map(ImageDraw.Draw, (Lit, Hi, La, Lv))
        xy = lambda i: (float(P[i, 0] * SS), float(P[i, 1] * SS))
        neigh = tri.neighbors
        for k in order.tolist():
            if wet[k]: continue
            i, j, l = simp[k].tolist(); q = [xy(i), xy(j), xy(l)]
            dL.polygon(q, fill=float(shade[k])); dH.polygon(q, fill=float(high[k])); dA.polygon(q, fill=0.0); dV.polygon(q, fill=0.0)
            for e_, (u, w_) in enumerate(((j, l), (l, i), (i, j))):
                o = neigh[k, e_]
                fold = 0.0 if o < 0 else float(np.clip(np.arccos(np.clip(nrm[k] @ nrm[o], -1, 1)) / 0.55, 0, 1))
                al = 0.64 + 0.18 * float(high[k]) + 0.30 * fold
                va = min(0.88, 0.52 + 0.24 * float(high[k]) + 0.30 * fold)
                dA.line([xy(u), xy(w_)], fill=float(min(1, al)), width=SS + (SS if fold > 0.35 else 0))
                dV.line([xy(u), xy(w_)], fill=float(min(1, va)), width=SS + (SS if fold > 0.35 else 0))
        grab = lambda im: np.asarray(im.resize((W, H), Image.BOX), np.float32)
        lt, hg, la, lv = grab(Lit), grab(Hi), grab(La), grab(Lv)
        land_ = hex3('#0c1316') * (1 - np.clip(-lt, 0, 1)[..., None] * 0.6)
        pink = hex3('#d62d62')
        sun = np.clip(lt, 0, 1)[..., None] ** 0.85 * (0.30 + 0.58 * hg[..., None]) * pink     # slopes facing the light
        sky = (0.015 + 0.12 * hg[..., None]) * (1 - np.clip(-lt, 0, 1)[..., None] * 0.5) * pink   # higher ground sits lighter, whichever way it faces
        rgb = land_ + sun + sky
        rgb = rgb * (1 - la[..., None]) + ramp(np.clip(lv / np.maximum(la, 1e-3), 0, 1), PINK) * la[..., None]
        finish(np.clip(rgb, 0, 1), np.ones((H, W), np.float32), name)

    draw(graded(8600), 'tech', relief_k=0.3)

if want('air'):         # WindNinja mass conservation, retaining the full HRRR field
    from air_wind import render
    # Wind crosses water too, so draw it after the shared lake instead of using finish().
    background = Image.fromarray(to8(add_lake(BASE, wa, ALONG))).resize((OW, OH), Image.LANCZOS)
    suffix = '-mobile' if mobile else ''
    render(background, W, H, s, ae, an, cx, cy, f'{art}/lens-air{suffix}.png')
    print('air' + suffix, 'ok', flush=True)

if want('water'):       # every real stream and pond (USGS National Hydrography Dataset), widening as rivers do
    hy = np.load(f'{art}/hydro.npz')
    SS = 2
    # this frame's pixels per pixel of the finished image, and drawing doubles that for smooth edges
    unit = W / OW * SS
    pts, lens, ups, fcode = hy['pts'], hy['lens'], hy['ups'], hy['fcode']
    dE, dN = pts[:, 0] - cx, pts[:, 1] - cy
    U, V = (W / 2 + (dE * ae + dN * an) / s) * SS, (H / 2 + (dE * an - dN * ae) / s) * SS
    reaches = []
    off = 0
    for n, code in zip(lens.tolist(), fcode.tolist()):
        u, v, up = U[off:off + n], V[off:off + n], ups[off:off + n]; off += n
        if u.max() < 0 or u.min() > W * SS or v.max() < 0 or v.min() > H * SS: continue
        reaches.append((float(up[-1]), u, v, up, code))
    reaches.sort(key=lambda x: x[0])
    alpha = Image.new('L', (W * SS, H * SS), 0); shade = Image.new('L', (W * SS, H * SS), 0)
    da, ds = ImageDraw.Draw(alpha), ImageDraw.Draw(shade)
    # on the smaller phone frame the same network is far denser, so the smallest creeks give way
    smallest = 0.0 if not mobile else 2.5
    for end, u, v, up, code in reaches:
        if end < smallest: continue
        kind = code // 100
        faint = 0.72 if code == 46003 else 0.55 if kind == 336 else 1.0  # intermittent creeks and ditches
        # a channel widens roughly with the square root of what drains into it
        width = (0.88 + 0.34 * np.sqrt(up + 0.05)).clip(0, 7.5) * unit * (0.9 if code == 46003 else 1.0)
        t = np.clip(np.log10(up + 1) / np.log10(500), 0, 1)
        a_ = np.clip((0.6 + 0.4 * t) * faint, 0, 1)
        nx, ny = np.gradient(v), -np.gradient(u)
        nl = np.hypot(nx, ny) + 1e-6; nx, ny = nx / nl, ny / nl
        for i in range(len(u) - 1):
            w0, w1 = width[i] / 2, width[i + 1] / 2
            quad = [(u[i] + nx[i] * w0, v[i] + ny[i] * w0), (u[i + 1] + nx[i + 1] * w1, v[i + 1] + ny[i + 1] * w1), (u[i + 1] - nx[i + 1] * w1, v[i + 1] - ny[i + 1] * w1), (u[i] - nx[i] * w0, v[i] - ny[i] * w0)]
            aval, sval = int(a_[i] * 255), int(t[i] * 255)
            da.polygon(quad, fill=aval); ds.polygon(quad, fill=sval)
            if w1 > 1.2:
                box = (u[i + 1] - w1, v[i + 1] - w1, u[i + 1] + w1, v[i + 1] + w1)
                da.ellipse(box, fill=aval); ds.ellipse(box, fill=sval)
    pond = Image.new('L', (W * SS, H * SS), 0); marsh = Image.new('L', (W * SS, H * SS), 0)
    dp, dm = ImageDraw.Draw(pond), ImageDraw.Draw(marsh)
    dE, dN = hy['body_pts'][:, 0] - cx, hy['body_pts'][:, 1] - cy
    bu, bv = (W / 2 + (dE * ae + dN * an) / s) * SS, (H / 2 + (dE * an - dN * ae) / s) * SS
    off = 0
    for n, kind in zip(hy['body_lens'].tolist(), hy['body_type'].tolist()):
        u, v = bu[off:off + n], bv[off:off + n]; off += n
        if u.max() < 0 or u.min() > W * SS or v.max() < 0 or v.min() > H * SS: continue
        (dm if kind == 466 else dp).polygon(list(zip(u.tolist(), v.tolist())), fill=255)
    small = lambda im: np.asarray(im.resize((W, H), Image.BOX), np.float32) / 255
    A, T, P, M = small(alpha), small(shade), small(pond), small(marsh)
    color = ramp(T, ['#1d5f86', '#2b7fab', '#4aa0c8', '#7fc6e0'])
    # wet valley floors: the ground darkens and cools for a little way either side of the larger streams
    near = ndi.gaussian_filter(A * smoothstep(0.25, 0.75, T), 7.0 * W / OW)[..., None]
    rgb = BASE * (1 - np.clip(near * 2.2, 0, 0.5)) + hex3('#123a44') * np.clip(near * 2.2, 0, 0.5)
    rgb = rgb * (1 - M[..., None] * 0.55) + hex3('#22524f') * M[..., None] * 0.55
    rgb = rgb * (1 - A[..., None]) + color * A[..., None]
    rgb = rgb * (1 - P[..., None]) + hex3('#3c8cb3') * P[..., None]
    finish(rgb, np.ones((H, W), np.float32), 'water')
