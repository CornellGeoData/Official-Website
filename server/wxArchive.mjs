// Shared reader and rasteriser for dynamical.org's open Icechunk archives.
//
// Everything that knows about STAC, Icechunk, Zarr chunking, map projections
// and turning a slab of numbers into a picture lives here. What each page wants
// to *compare* lives alongside it (see wxVerify.mjs).
//
// Cost model, measured for the Central NY window:
//   analysis datasets are chunked [many times, small tile] - one read covers
//     months for that tile (HRRR analysis 49 MB / 90 days, MRMS 5.8 MB / 27 days)
//   forecast datasets are chunked [1 init_time, ALL lead_times, tile] - one read
//     covers an entire run (HRRR 10.2 MB, GFS 2.7 MB, AIFS 3.1 MB), so once a
//     run is in hand every one of its lead times renders with no more network
// That second property is what makes a verification page practical at all.
import sharp from 'sharp';
import proj4 from 'proj4';
import * as zarr from 'zarrita';
import * as ic from '@earthmover/icechunk';
import { makeColorizer } from './wxScales.mjs';

const STAC_ROOT = 'https://stac.dynamical.org/catalog.json';
const BYTE_CACHE_LIMIT = 768 * 1024 * 1024;
// Purely a bug guard. The region is a server-side constant now, so there is no
// visitor-supplied bbox to abuse; this only catches a coding mistake before it
// turns into a multi-gigabyte read.
const MAX_CHUNKS = 64;

// ---- STAC: never hard-code a bucket or a version, they change on reprocess ----
let catalogPromise = null;
function stacCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch(STAC_ROOT, { signal: AbortSignal.timeout(20_000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`STAC ${r.status}`))));
    catalogPromise.catch(() => { catalogPromise = null; });
  }
  return catalogPromise;
}

const collections = new Map();
export function collection(dataset) {
  let hit = collections.get(dataset);
  if (!hit) {
    hit = stacCatalog().then(async (root) => {
      const link = (root.links || []).find(
        (l) => l.rel === 'child' && typeof l.href === 'string' && l.href.includes(`/${dataset}/`),
      );
      if (!link) throw new Error(`unknown dataset ${dataset}`);
      const r = await fetch(link.href, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`STAC collection ${r.status}`);
      return r.json();
    });
    hit.catch(() => collections.delete(dataset));
    collections.set(dataset, hit);
  }
  return hit;
}

// ---- byte-level LRU, with in-flight de-duplication ----
// Zarrita re-reads a chunk on every `get`, and a verification page fires many
// panel renders at once - without the in-flight map, eight concurrent panels
// from one run would each pull the same chunk off S3.
class ByteCache {
  constructor(limit) { this.limit = limit; this.bytes = 0; this.map = new Map(); this.inflight = new Map(); }
  get(key) {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key); this.map.set(key, v);
    return v;
  }
  set(key, value) {
    if (!value || value.length > this.limit) return;
    if (this.map.has(key)) this.bytes -= this.map.get(key).length;
    this.map.set(key, value);
    this.bytes += value.length;
    while (this.bytes > this.limit) {
      const oldest = this.map.keys().next().value;
      this.bytes -= this.map.get(oldest).length;
      this.map.delete(oldest);
    }
  }
  /** Run `load` for `key` once, however many callers ask for it concurrently. */
  once(key, load) {
    const hit = this.get(key);
    if (hit) return Promise.resolve(hit);
    let p = this.inflight.get(key);
    if (!p) {
      p = load().then((v) => { if (v) this.set(key, v); return v; })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }
}
const byteCache = new ByteCache(BYTE_CACHE_LIMIT);

// bytes actually pulled from upstream, per render, for the transfer gate
let transferred = 0;
export function resetTransfer() { transferred = 0; }
export function upstreamBytes() { return transferred; }

// Icechunk's Store already speaks zarrita's RangeQuery shape. Passing the range
// through unchanged is essential: give zarrita a store without a real
// `getRange` and its sharding codec silently falls back to whole-shard reads -
// hundreds of MB instead of a few, and misaligned values.
function cachedStore(icstore, dataset) {
  const wrap = (v) => (v ? new Uint8Array(v) : undefined);
  return {
    get: (key) => {
      const k = key.replace(/^\//, '');
      return byteCache.once(`${dataset}|${k}`, async () => {
        const v = wrap(await icstore.get(k));
        if (v) transferred += v.length;
        return v;
      });
    },
    getRange: (key, range) => {
      const k = key.replace(/^\//, '');
      const ck = `${dataset}|${k}|${range.offset ?? ''}|${range.length ?? ''}|${range.suffixLength ?? ''}`;
      return byteCache.once(ck, async () => {
        const v = wrap(await icstore.getRange(k, range));
        if (v) transferred += v.length;
        return v;
      });
    },
  };
}

// ---- opening a dataset ----
const datasets = new Map();
export function openDataset(dataset) {
  let hit = datasets.get(dataset);
  if (!hit) {
    hit = (async () => {
      const coll = await collection(dataset);
      const href = coll.assets?.['icechunk-https']?.href;
      if (!href) throw new Error(`no icechunk-https asset for ${dataset}`);
      const repo = await ic.Repository.open(await ic.Storage.newHttp(href));
      const session = await repo.readonlySession({ branch: 'main' });
      const store = cachedStore(session.store, dataset);
      return { id: dataset, coll, store, root: zarr.root(store), raw: session.store, meta: new Map(), axes: new Map(), arrays: new Map() };
    })();
    hit.catch(() => datasets.delete(dataset));
    datasets.set(dataset, hit);
  }
  return hit;
}

const decoder = new TextDecoder();
export async function arrayMeta(ds, name) {
  let hit = ds.meta.get(name);
  if (!hit) {
    hit = ds.store.get(`${name}/zarr.json`).then((b) => {
      if (!b) throw new Error(`missing array ${name}`);
      return JSON.parse(decoder.decode(b));
    });
    hit.catch(() => ds.meta.delete(name));
    ds.meta.set(name, hit);
  }
  return hit;
}

function openArray(ds, name) {
  let hit = ds.arrays.get(name);
  if (!hit) {
    hit = zarr.open(ds.root.resolve(name), { kind: 'array' });
    hit.catch(() => ds.arrays.delete(name));
    ds.arrays.set(name, hit);
  }
  return hit;
}

// the inner chunk is the real unit of network cost; for a sharded array the
// outer chunk_grid is the shard, which is far bigger
function innerChunkShape(meta) {
  const sharding = (meta.codecs || []).find((c) => c.name === 'sharding_indexed');
  return sharding?.configuration?.chunk_shape ?? meta.chunk_grid?.configuration?.chunk_shape ?? null;
}

/**
 * A whole coordinate vector, cached. `time` and `init_time` come back as epoch
 * milliseconds; `lead_time` as seconds, which is how the archives store it.
 */
export function axis(ds, name) {
  let hit = ds.axes.get(name);
  if (!hit) {
    hit = (async () => {
      const arr = await openArray(ds, name);
      const out = await zarr.get(arr, [zarr.slice(0, arr.shape[0])]);
      const scale = name === 'lead_time' ? 1 : 1000; // lead is a duration, not an instant
      const v = new Float64Array(out.data.length);
      for (let i = 0; i < out.data.length; i++) v[i] = Number(out.data[i]) * scale;
      return v;
    })();
    hit.catch(() => ds.axes.delete(name));
    ds.axes.set(name, hit);
  }
  return hit;
}

/** Index of the closest value, by binary search - axes are sorted but may have gaps. */
export function nearestIndex(values, target) {
  let lo = 0, hi = values.length - 1;
  if (target <= values[0]) return 0;
  if (target >= values[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= target) lo = mid; else hi = mid;
  }
  return target - values[lo] <= values[hi] - target ? lo : hi;
}

/** Index of an exact value, or -1. Used where a near miss would be a lie. */
export function exactIndex(values, target, tolerance = 1) {
  const i = nearestIndex(values, target);
  return Math.abs(values[i] - target) <= tolerance ? i : -1;
}

// ---- grid geometry ----
// `dims` is the variable's own dimension_names, and it is the only reliable
// signal. Every dataset carries a `spatial_ref` array - it is the CF way to
// record a CRS, including plain EPSG:4326 - so its presence says nothing, and
// HRRR publishes 2-D latitude/longitude as well as its native x/y.
const geometries = new Map();
export function geometry(ds, dims) {
  let hit = geometries.get(ds.id);
  if (!hit) {
    hit = (async () => {
      if (Array.isArray(dims) && dims.includes('y') && dims.includes('x')) {
        const sr = await arrayMeta(ds, 'spatial_ref');
        const a = sr.attributes || {};
        if (a.grid_mapping_name !== 'lambert_conformal_conic') {
          throw new Error(`unsupported projection ${a.grid_mapping_name} for ${ds.id}`);
        }
        const [gx0, dx, , gy0, , dy] = String(a.GeoTransform).trim().split(/\s+/).map(Number);
        const sp = Array.isArray(a.standard_parallel) ? a.standard_parallel : [a.standard_parallel, a.standard_parallel];
        const def = `+proj=lcc +lat_0=${a.latitude_of_projection_origin} +lon_0=${a.longitude_of_central_meridian}`
          + ` +lat_1=${sp[0]} +lat_2=${sp[1] ?? sp[0]} +x_0=${a.false_easting ?? 0} +y_0=${a.false_northing ?? 0}`
          + ` +R=${a.semi_major_axis} +units=m +no_defs`;
        // The cone constant, which is also the rate at which grid north departs
        // from true north. Verified against the dataset's own 2-D latitude and
        // longitude arrays: agreement is within 0.004 degrees across CONUS, and
        // 0.019 degrees on the central meridian where it must be zero.
        const p1 = Number(sp[0]) * DEG;
        const p2 = Number(sp[1] ?? sp[0]) * DEG;
        const coneN = Math.abs(p1 - p2) < 1e-9
          ? Math.sin(p1)
          : Math.log(Math.cos(p1) / Math.cos(p2))
            / Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
        // GeoTransform anchors the corner of cell 0; sample from cell centres
        return {
          kind: 'projected', forward: proj4('EPSG:4326', def).forward,
          x0: gx0 + dx / 2, dx, y0: gy0 + dy / 2, dy,
          lon0: Number(a.longitude_of_central_meridian), coneN,
        };
      }
      const lat = await axisRaw(ds, 'latitude');
      const lon = await axisRaw(ds, 'longitude');
      return { kind: 'geographic', lat, lon };
    })();
    hit.catch(() => geometries.delete(ds.id));
    geometries.set(ds.id, hit);
  }
  return hit;
}

async function axisRaw(ds, name) {
  const arr = await openArray(ds, name);
  const out = await zarr.get(arr, [zarr.slice(0, arr.shape[0])]);
  return Float64Array.from(out.data);
}

const step = (a) => (a[a.length - 1] - a[0]) / (a.length - 1);
const DEG = Math.PI / 180;

/**
 * Turn grid-relative wind components into earth-relative ones.
 *
 * HRRR publishes `x_wind`/`y_wind` - dynamical's own comment says "velocity
 * along the model grid's x dimension, not eastward velocity" - so on its
 * Lambert grid the components are rotated away from true north by the cone
 * convergence, about 13 degrees over central New York. Speed is unaffected
 * (a rotation preserves magnitude), but direction is wrong without this.
 * Datasets on plain latitude/longitude grids publish `eastward_wind` and need
 * no correction.
 */
export function earthRelativeWind(u, v, lon, geom) {
  if (geom.kind !== 'projected' || !Number.isFinite(geom.coneN)) return [u, v];
  const g = geom.coneN * (lon - geom.lon0) * DEG;
  const c = Math.cos(g), s2 = Math.sin(g);
  return [u * c + v * s2, -u * s2 + v * c];
}

/** lon/lat -> fractional grid indices [col, row]. */
export function locate(geom, lon, lat) {
  if (geom.kind === 'projected') {
    const [px, py] = geom.forward([lon, lat]);
    return [(px - geom.x0) / geom.dx, (py - geom.y0) / geom.dy];
  }
  // every geographic dataset here is on a regular grid, so this is a division
  return [(lon - geom.lon[0]) / step(geom.lon), (lat - geom.lat[0]) / step(geom.lat)];
}

/** The grid window covering a bbox, with a cell of margin. */
export function windowFor(geom, bbox, rows, cols) {
  const corners = [[bbox.w, bbox.n], [bbox.e, bbox.n], [bbox.w, bbox.s], [bbox.e, bbox.s]]
    .map(([lon, lat]) => locate(geom, lon, lat));
  const cs = corners.map((c) => c[0]);
  const rs = corners.map((c) => c[1]);
  return {
    x0: Math.max(0, Math.floor(Math.min(...cs)) - 1),
    x1: Math.min(cols, Math.ceil(Math.max(...cs)) + 2),
    y0: Math.max(0, Math.floor(Math.min(...rs)) - 1),
    y1: Math.min(rows, Math.ceil(Math.max(...rs)) + 2),
  };
}

// ---- Web Mercator, matching the client's mercator.ts ----
const mx = (lon) => lon / 360 + 0.5;
const my = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
const mxInv = (x) => (x - 0.5) * 360;
const myInv = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/**
 * Read a 2-D spatial slab. `leading` is the indices before the spatial dims:
 * [timeIndex] for an analysis, [initIndex, leadIndex] for a forecast.
 */
export async function readSlab(ds, variable, leading, bbox) {
  const meta = await arrayMeta(ds, variable);
  const arr = await openArray(ds, variable);
  const geom = await geometry(ds, meta.dimension_names);
  const rows = arr.shape[arr.shape.length - 2];
  const cols = arr.shape[arr.shape.length - 1];
  const win = windowFor(geom, bbox, rows, cols);
  if (win.x1 <= win.x0 || win.y1 <= win.y0) {
    throw Object.assign(new Error('region is outside this dataset'), { status: 422 });
  }
  const shape = innerChunkShape(meta);
  if (shape) {
    const cy = shape[shape.length - 2];
    const cx = shape[shape.length - 1];
    const n = Math.ceil((win.y1 - win.y0) / cy) * Math.ceil((win.x1 - win.x0) / cx);
    if (n > MAX_CHUNKS) {
      throw Object.assign(new Error(`region needs ${n} chunks (limit ${MAX_CHUNKS})`), { status: 413 });
    }
  }
  const out = await zarr.get(arr, [...leading, zarr.slice(win.y0, win.y1), zarr.slice(win.x0, win.x1)]);
  return { data: out.data, win, geom, meta };
}

// The panel is enlarged by this factor before barbs are drawn onto it.
const BARB_SUPERSAMPLE = 2;

const KNOTS = 1.943844; // barbs are read in knots the world over, whatever the fill shows

/**
 * One station's wind barb, as SVG path data.
 *
 * The staff points into the wind - the direction it blows *from* - and carries
 * a pennant per 50 kt, a full barb per 10 and a half barb per 5, rounded to the
 * nearest 5 as convention requires. Under about 2.5 kt there is no meaningful
 * direction, so it becomes the usual calm circle.
 */
function barbPath(x, y, u, v, L) {
  const speed = Math.hypot(u, v) * KNOTS;
  if (!Number.isFinite(speed)) return null;
  if (speed < 2.5) {
    const r = Math.max(2, L * 0.12);
    return {
      lines: `M${(x + r).toFixed(1)},${y.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 1 1 ${(x - r).toFixed(1)},${y.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 1 1 ${(x + r).toFixed(1)},${y.toFixed(1)}`,
      flags: '',
    };
  }
  // screen-space unit vector pointing upwind: east is +x, north is -y
  const len = Math.hypot(u, v);
  const sx = -u / len;
  const sy = v / len;
  const tipX = x + sx * L, tipY = y + sy * L;
  let lines = `M${x.toFixed(1)},${y.toFixed(1)} L${tipX.toFixed(1)},${tipY.toFixed(1)}`;
  let flags = '';

  // Barbs sit on the left-hand side when looking downwind - stand with your back
  // to the wind and they point the way Buys Ballot puts the low. The staff runs
  // the other way (into the wind), so this is +120 degrees from it, not -120.
  const a = 2 * Math.PI / 3;
  const bx = sx * Math.cos(a) - sy * Math.sin(a);
  const by = sx * Math.sin(a) + sy * Math.cos(a);

  let remaining = Math.round(speed / 5) * 5;
  const gap = L * 0.19, fullLen = L * 0.42, halfLen = L * 0.23;
  let back = 0;
  const marks = [];
  while (remaining >= 50) { marks.push('pennant'); remaining -= 50; }
  while (remaining >= 10) { marks.push('full'); remaining -= 10; }
  if (remaining >= 5) marks.push('half');
  // a lone half barb hanging off the very tip reads as noise; inset it
  if (marks.length === 1 && marks[0] === 'half') back = gap;

  for (const mark of marks) {
    const ax = tipX - sx * back, ay = tipY - sy * back;
    if (mark === 'pennant') {
      const cx = ax - sx * gap, cy = ay - sy * gap;
      flags += `M${ax.toFixed(1)},${ay.toFixed(1)} L${(ax + bx * fullLen).toFixed(1)},${(ay + by * fullLen).toFixed(1)} L${cx.toFixed(1)},${cy.toFixed(1)} Z`;
      back += gap * 1.7;
    } else {
      const l = mark === 'full' ? fullLen : halfLen;
      lines += ` M${ax.toFixed(1)},${ay.toFixed(1)} L${(ax + bx * l).toFixed(1)},${(ay + by * l).toFixed(1)}`;
      back += gap;
    }
  }
  return { lines, flags };
}

/**
 * A grid of wind barbs over the panel, as an SVG overlay.
 *
 * Drawn as vectors and composited by sharp rather than rasterised by hand, so
 * the strokes are properly anti-aliased. Every barb carries a white halo
 * underneath, because a dark stroke alone disappears over the deep end of the
 * speed ramp.
 */
export function windBarbSvg({ u, v, slab, bbox, W, H, cols = 10, rows = 10 }) {
  const { win, geom } = slab;
  const sw = win.x1 - win.x0, sh = win.y1 - win.y0;
  const mxw = mx(bbox.w), mxe = mx(bbox.e), myn = my(bbox.n), mys = my(bbox.s);
  const L = Math.max(11, Math.round(W / 34));
  let lines = '', flags = '';
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const sxp = ((i + 0.5) / cols) * W;
      const syp = ((j + 0.5) / rows) * H;
      const lon = mxInv(mxw + (sxp / W) * (mxe - mxw));
      const lat = myInv(myn + (syp / H) * (mys - myn));
      const [fc, fr] = locate(geom, lon, lat);
      const c = Math.round(fc) - win.x0, r = Math.round(fr) - win.y0;
      if (c < 0 || c >= sw || r < 0 || r >= sh) continue;
      const ru = u[r * sw + c], rv = v[r * sw + c];
      if (!Number.isFinite(ru) || !Number.isFinite(rv)) continue;
      const [eu, ev] = earthRelativeWind(ru, rv, lon, geom);
      const p = barbPath(sxp, syp, eu, ev, L);
      if (!p) continue;
      lines += p.lines + ' ';
      flags += p.flags;
    }
  }
  if (!lines) return null;
  // proportional to the staff, so the barbs look identical whatever resolution
  // the panel is rendered at
  const ink = Math.max(0.9, L * 0.058);
  const halo = ink * 2.4;
  const caps = 'stroke-linecap="round" stroke-linejoin="round"';
  const haloG = `<g fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="${halo.toFixed(2)}" ${caps}><path d="${lines}"/>${flags ? `<path d="${flags}" fill="#ffffff" fill-opacity="0.9"/>` : ''}</g>`;
  const inkG = `<g fill="none" stroke="#10202c" stroke-width="${ink.toFixed(2)}" ${caps}><path d="${lines}"/>${flags ? `<path d="${flags}" fill="#10202c"/>` : ''}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${haloG}${inkG}</svg>`;
}

/**
 * Colorize a slab into a WebP in EPSG:3857, stretched between the bbox corners -
 * the shape WeatherOverlay already knows how to composite.
 *
 * Lossless on purpose: the colour *is* the value here, so lossy compression
 * would shift pixels off the ramp and a readout would disagree with the map.
 */
export async function renderSlab({ slab, bbox, scale, factor = 1, offset = 0, px = 768, barbs = null }) {
  const { data, win, geom } = slab;
  const sw = win.x1 - win.x0;
  const sh = win.y1 - win.y0;
  const mxw = mx(bbox.w), mxe = mx(bbox.e), myn = my(bbox.n), mys = my(bbox.s);
  const aspect = (mxe - mxw) / (mys - myn);
  const W = Math.max(16, Math.min(px, Math.round(aspect >= 1 ? px : px * aspect)));
  const H = Math.max(16, Math.round(W / aspect));
  const colorFor = makeColorizer(scale);

  const out = Buffer.alloc(W * H * 4);
  for (let j = 0; j < H; j++) {
    const lat = myInv(myn + ((j + 0.5) / H) * (mys - myn));
    for (let i = 0; i < W; i++) {
      const lon = mxInv(mxw + ((i + 0.5) / W) * (mxe - mxw));
      const [fc, fr] = locate(geom, lon, lat);
      const c = Math.round(fc) - win.x0;
      const r = Math.round(fr) - win.y0;
      if (c < 0 || c >= sw || r < 0 || r >= sh) continue;
      // into the display unit before colouring: the ramps are written in what a
      // reader expects, not in the archive's CF units
      const v = data[r * sw + c] * factor + offset;
      if (!Number.isFinite(v)) continue; // archive gaps are NaN, not zero
      const rgb = colorFor(v);
      if (!rgb) continue;               // below a scale's floor: draw nothing
      const o = (j * W + i) * 4;
      out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255;
    }
  }
  let img = sharp(out, { raw: { width: W, height: H, channels: 4 } });
  if (barbs) {
    // The map draws this panel considerably larger than it is rendered, and
    // WeatherOverlay switches to nearest-neighbour once it is magnifying, which
    // turns thin vector strokes into staircases. So enlarge the field first -
    // nearest-neighbour costs it nothing, its cells are already blocks - and
    // draw the barbs into the larger canvas, where they get the pixels to stay
    // smooth. The expensive per-pixel reprojection above is untouched.
    const k = BARB_SUPERSAMPLE;
    // sharp applies composite after resize within one pipeline, so this needs no
    // intermediate encode
    const svg = windBarbSvg({ ...barbs, slab, bbox, W: W * k, H: H * k });
    if (svg) {
      img = img.resize(W * k, H * k, { kernel: 'nearest' })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
    }
    // barbs ride in the same image as the field, so a panel stays one atomic,
    // immutable object - flipping between runs can never show one run's fill
    // under another run's barbs
  }
  return img.webp({ lossless: true, effort: 4 }).toBuffer();
}

export function unitOf(meta) {
  return meta?.attributes?.units || '';
}
