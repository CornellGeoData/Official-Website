// Model verification for a fixed region: what actually happened, beside what
// each model said would happen.
//
// The page answers one question - "for this valid time, how did the runs
// converge?" - so a panel is identified by (field, source, valid time, run) and
// nothing else. The region is a server-side constant, which is why there is no
// bbox in any of these URLs.
//
// What makes this affordable: forecast archives are chunked
// [1 init_time, ALL lead_times, spatial tile], so reading one run costs one
// chunk set and then *every* lead time of that run is already in memory.
// Stepping along a row of the matrix costs a run; re-verifying a different
// valid time from runs already loaded costs nothing.
import express from 'express';
import {
  openDataset, arrayMeta, axis, nearestIndex, exactIndex, readSlab, renderSlab,
  unitOf, resetTransfer, upstreamBytes, collection,
} from './wxArchive.mjs';
import { scaleFor, conversionFor } from './wxScales.mjs';

// Central NY. Fixed: a panel set is only comparable if every panel frames the
// same ground, and a constant region is what lets runs be cached and reused.
export const REGION = { n: 44.2, s: 40.9, w: -78.9, e: -74.2 };

const HOUR = 3_600_000;
const SIX = 6 * HOUR;

// All three models initialise on the 6-hourly synoptic cycle, so one init grid
// serves every row and the matrix columns line up.
const MODELS = {
  hrrr: {
    label: 'HRRR', dataset: 'noaa-hrrr-forecast-48-hour',
    maxLeadHours: 48, leadStepHours: 1,
    note: '3 km, CONUS',
  },
  gfs: {
    label: 'GFS', dataset: 'noaa-gfs-forecast',
    // hourly lead times only run to 120 h; past that GFS goes 3-hourly, and a
    // week-out forecast is not what this page is for
    maxLeadHours: 120, leadStepHours: 1,
    note: '0.25°, global',
  },
  aifs: {
    label: 'AIFS', dataset: 'ecmwf-aifs-single-forecast',
    // 6-hourly lead times, so AIFS can only ever be valid at 00/06/12/18Z
    maxLeadHours: 360, leadStepHours: 6,
    note: '0.25°, global, ML',
  },
};

// HRRR analysis stands in for observation on the continuous fields - it is the
// model's own best estimate of what happened, not an independent instrument -
// while precipitation uses MRMS Pass-2 QPE, which is radar and gauge derived.
const FIELDS = {
  temperature_2m: {
    label: '2 m temperature',
    truth: { label: 'HRRR analysis', dataset: 'noaa-hrrr-analysis', variables: ['temperature_2m'] },
    variables: ['temperature_2m'],
    models: ['hrrr', 'gfs', 'aifs'],
  },
  wind_speed_10m: {
    label: '10 m wind speed',
    // Not a stored variable anywhere: the archives carry the u and v components,
    // so both are read and combined into a magnitude before colouring. Keeping
    // the components lets the same read also draw direction barbs.
    combine: 'magnitude',
    barbs: true,
    truth: { label: 'HRRR analysis', dataset: 'noaa-hrrr-analysis', variables: ['wind_u_10m', 'wind_v_10m'] },
    variables: ['wind_u_10m', 'wind_v_10m'],
    models: ['hrrr', 'gfs', 'aifs'],
  },
  total_cloud_cover: {
    label: 'Total cloud cover',
    truth: { label: 'HRRR analysis', dataset: 'noaa-hrrr-analysis', variables: ['total_cloud_cover_atmosphere'] },
    variables: ['total_cloud_cover_atmosphere'],
    models: ['hrrr', 'gfs', 'aifs'],
  },
  relative_humidity_2m: {
    label: '2 m relative humidity',
    truth: { label: 'HRRR analysis', dataset: 'noaa-hrrr-analysis', variables: ['relative_humidity_2m'] },
    variables: ['relative_humidity_2m'],
    // AIFS does not carry relative humidity at all, so this field simply has two
    // rows. dynamical processes variables for model training rather than for
    // maps, and the full set lives in the GRIB-backed virtual datasets.
    models: ['hrrr', 'gfs'],
  },
  precipitation_rate: {
    label: 'Precipitation rate',
    // `precipitation_surface` is MRMS's best-available composite: Pass-2 from
    // 2020-10-15 on, and the best product available before that, falling back to
    // Pass-1 or radar-only where Pass-2 is missing. It therefore covers the
    // whole archive, where `precipitation_pass_2_surface` is entirely NaN over
    // this region until 2020-10-15 (measured) and would have shown six years of
    // convincing blank maps. The label stays "Pass-2" because that is what the
    // composite resolves to for almost all of the range this page offers.
    truth: { label: 'MRMS Pass-2 QPE', dataset: 'noaa-mrms-conus-analysis-hourly', variables: ['precipitation_surface'] },
    variables: ['precipitation_surface'],
    // A rate has no value at the initialisation instant - there is no preceding
    // interval to average over - so every model stores NaN at lead 0 and the
    // panel would 404. Instantaneous fields (temperature, pressure) are fine at
    // lead 0, so this is per-field rather than a blanket rule.
    minLeadHours: 1,
    models: ['hrrr', 'gfs', 'aifs'],
  },
  mslp: {
    label: 'MSL pressure',
    truth: { label: 'HRRR analysis', dataset: 'noaa-hrrr-analysis', variables: ['pressure_reduced_to_mean_sea_level'] },
    variables: ['pressure_reduced_to_mean_sea_level'],
    models: ['hrrr', 'gfs', 'aifs'],
  },
};

// How many runs back the matrix offers. Eight 6-hourly runs reaches 42 h of
// lead, which covers HRRR's useful range and is where the interesting
// disagreement lives.
const RUNS = 8;

// Decoded slabs, keyed by dataset, variables and indices - the region is a
// constant, so a panel's window never varies.
//
// The byte cache upstream stops us re-fetching chunks, but zarrita decompresses
// them again on every read, and a chunk is ~17 MB raw. That is what makes a
// panel take a second or two rather than a hundred milliseconds, and it is paid
// twice for a two-component field like wind. The extracted window is only about
// 90 kB, so keeping it is nearly free and makes revisiting a panel - blinking
// between observed and forecast, stepping back along a row - essentially
// instant.
const SLAB_CACHE_MAX = 400;
const slabCache = new Map();

function cachedSlab(key, load) {
  const hit = slabCache.get(key);
  if (hit) {
    slabCache.delete(key);
    slabCache.set(key, hit); // refresh recency
    return hit;
  }
  const p = load();
  p.catch(() => slabCache.delete(key));
  slabCache.set(key, p);
  while (slabCache.size > SLAB_CACHE_MAX) slabCache.delete(slabCache.keys().next().value);
  return p;
}

/**
 * Read a field's spatial slab, combining components where the field is derived.
 * A magnitude keeps NaN: sqrt of a NaN sum is NaN, so archive gaps stay gaps.
 */
function readField(ds, variables, leading, combine) {
  return cachedSlab(`${ds.id}|${variables.join('+')}|${leading.join(',')}`,
    () => readFieldUncached(ds, variables, leading, combine));
}

async function readFieldUncached(ds, variables, leading, combine) {
  const slabs = await Promise.all(variables.map((v) => readSlab(ds, v, leading, REGION)));
  if (slabs.length === 1) return slabs[0];
  if (combine !== 'magnitude') throw new Error(`unknown combine: ${combine}`);
  const [a, b] = slabs;
  const data = new Float32Array(a.data.length);
  for (let i = 0; i < data.length; i++) {
    const u = a.data[i], v = b.data[i];
    data[i] = Math.sqrt(u * u + v * v);
  }
  // the components ride along so barbs cost no second read
  return { ...a, data, components: { u: a.data, v: b.data } };
}

/** The name the scale and unit conversion are keyed on. */
const canonicalOf = (fieldId, field) => (field.combine ? fieldId : field.variables[0]);

/**
 * One scale per *field*, shared by the observation and every model.
 * This is the whole point: panels drawn on different ramps cannot be compared
 * by eye, which is what this page is for.
 */
const fieldScales = new Map();
async function scaleOf(fieldId, system) {
  const key = `${fieldId}|${system}`;
  let hit = fieldScales.get(key);
  if (!hit) {
    hit = (async () => {
      const field = FIELDS[fieldId];
      const ds = await openDataset(field.truth.dataset);
      const meta = await arrayMeta(ds, field.truth.variables[0]);
      const canonical = canonicalOf(fieldId, field);
      const conv = conversionFor(canonical, unitOf(meta), system);
      return { scale: scaleFor(canonical, conv.unit, null, system), unit: conv.unit };
    })();
    hit.catch(() => fieldScales.delete(key));
    fieldScales.set(key, hit);
  }
  return hit;
}

/** The conversion for one source's own published unit. */
async function convOf(dataset, variable, canonical, system) {
  const ds = await openDataset(dataset);
  const meta = await arrayMeta(ds, variable);
  return conversionFor(canonical, unitOf(meta), system);
}

/** Imperial unless metric is asked for explicitly - the club is in New York. */
const systemOf = (q) => (String(q ?? '') === 'metric' ? 'metric' : 'imperial');

/** The candidate run times for a valid instant: the most recent synoptic inits. */
function initGrid(validMs, count = RUNS) {
  const latest = Math.floor(validMs / SIX) * SIX;
  return Array.from({ length: count }, (_, k) => latest - k * SIX);
}

async function modelAvailability(modelId, validMs, inits, minLeadHours = 0) {
  const m = MODELS[modelId];
  const ds = await openDataset(m.dataset);
  const [initAxis, leadAxis] = await Promise.all([axis(ds, 'init_time'), axis(ds, 'lead_time')]);
  return inits.map((init) => {
    const leadHours = (validMs - init) / HOUR;
    if (leadHours < minLeadHours || leadHours > m.maxLeadHours) return null;
    // AIFS only carries 6-hourly lead times, so it simply has no forecast valid
    // at an off-synoptic hour - that is a real gap, not a loading state
    if (leadHours % m.leadStepHours !== 0) return null;
    const ii = exactIndex(initAxis, init, HOUR / 2);
    if (ii < 0) return null; // the run itself is missing from the archive
    const li = exactIndex(leadAxis, leadHours * 3600, 1);
    if (li < 0) return null;
    return { init, leadHours };
  });
}

/**
 * Pull the observation chunks for the newest hour into the byte cache.
 *
 * Analysis archives are chunked [many times, small tile], so this one read
 * covers about 90 days of HRRR analysis over Central NY - every observation
 * panel inside that window then renders with no upstream traffic at all. It is
 * the single biggest latency win available, and it costs one read per boot.
 * Fire-and-forget: a failure here must never stop the site from serving.
 */
export async function warmObservations(fieldIds = ['temperature_2m', 'wind_speed_10m']) {
  // sequential on purpose: this is background work, and there is no reason to
  // open several large reads against dynamical at once
  for (const fieldId of fieldIds) {
    try {
      const field = FIELDS[fieldId];
      if (!field) continue;
      const ds = await openDataset(field.truth.dataset);
      const ta = await axis(ds, 'time');
      await readField(ds, field.truth.variables, [ta.length - 1], field.combine);
    } catch {
      // offline, upstream hiccup, or a cold container with no network yet -
      // the first visitor just pays the read instead
    }
  }
}

export function wxVerifyRouter() {
  const router = express.Router();

  // the catalogue: fields, their truth source, the models, and each one's span
  router.get('/fields', async (req, res) => {
    try {
      const system = systemOf(req.query.units);
      const fields = await Promise.all(Object.entries(FIELDS).map(async ([id, f]) => {
        const { scale, unit } = await scaleOf(id, system);
        const truthDs = await openDataset(f.truth.dataset);
        const truthAxis = await axis(truthDs, 'time');
        const truthColl = await collection(f.truth.dataset);
        const models = await Promise.all(f.models.map(async (mid) => {
          const m = MODELS[mid];
          const ds = await openDataset(m.dataset);
          const ia = await axis(ds, 'init_time');
          return {
            id: mid, label: m.label, note: m.note,
            maxLeadHours: m.maxLeadHours, leadStepHours: m.leadStepHours,
            firstInit: ia[0], lastInit: ia[ia.length - 1],
          };
        }));
        return {
          id, label: f.label, unit, scale,
          truth: {
            label: f.truth.label,
            // no field needs `truthStart` today - the MRMS composite covers its
            // whole axis - but a truth source whose record is shorter than its
            // time axis is a real hazard, so the hook stays
            start: Math.max(truthAxis[0], f.truthStart ?? 0),
            end: truthAxis[truthAxis.length - 1],
            attribution: truthColl.attribution ?? null,
          },
          models,
        };
      }));
      res.set('cache-control', 'public, max-age=600');
      return res.json({ region: REGION, runs: RUNS, units: system, fields });
    } catch (err) {
      return res.status(err.status ?? 502).json({ error: String(err.message ?? err) });
    }
  });

  // the matrix for one valid time: which runs exist, at what lead. Pure index
  // arithmetic over cached coordinate axes - no field data is touched, so this
  // answers immediately and the client can paint the grid before any panel loads.
  router.get('/matrix', async (req, res) => {
    try {
      const fieldId = String(req.query.field ?? '');
      const field = FIELDS[fieldId];
      if (!field) return res.status(400).json({ error: `unknown field ${fieldId}` });
      const valid = Number(req.query.valid);
      if (!Number.isFinite(valid)) return res.status(400).json({ error: 'valid is required' });
      const validMs = Math.round(valid / HOUR) * HOUR;

      const inits = initGrid(validMs);
      const truthDs = await openDataset(field.truth.dataset);
      const truthAxis = await axis(truthDs, 'time');
      const ti = exactIndex(truthAxis, validMs, HOUR / 2);

      const rows = await Promise.all(field.models.map(async (mid) => ({
        model: mid,
        label: MODELS[mid].label,
        cells: await modelAvailability(mid, validMs, inits, field.minLeadHours ?? 0),
      })));

      res.set('cache-control', 'public, max-age=600');
      return res.json({
        field: fieldId,
        valid: validMs,
        region: REGION,
        columns: inits.map((init) => ({ init, leadHours: (validMs - init) / HOUR })),
        minLeadHours: field.minLeadHours ?? 0,
        truth: { label: field.truth.label, available: ti >= 0 },
        rows,
      });
    } catch (err) {
      return res.status(err.status ?? 502).json({ error: String(err.message ?? err) });
    }
  });

  // one panel. Immutable: a past valid time never changes.
  router.get('/panel.webp', async (req, res) => {
    try {
      const fieldId = String(req.query.field ?? '');
      const field = FIELDS[fieldId];
      if (!field) return res.status(400).json({ error: `unknown field ${fieldId}` });
      const source = String(req.query.source ?? '');
      const valid = Number(req.query.valid);
      if (!Number.isFinite(valid)) return res.status(400).json({ error: 'valid is required' });
      const validMs = Math.round(valid / HOUR) * HOUR;
      const px = Math.min(1024, Math.max(64, Number(req.query.px) || 768));

      const system = systemOf(req.query.units);
      const { scale } = await scaleOf(fieldId, system);
      const started = Date.now();
      resetTransfer();

      let slab, factor, offset, label;
      if (source === 'obs') {
        const ds = await openDataset(field.truth.dataset);
        const ta = await axis(ds, 'time');
        const ti = exactIndex(ta, validMs, HOUR / 2);
        if (ti < 0) return res.status(404).json({ error: 'no observation at this time' });
        ({ factor, offset } = await convOf(field.truth.dataset, field.truth.variables[0], canonicalOf(fieldId, field), system));
        slab = await readField(ds, field.truth.variables, [ti], field.combine);
        label = field.truth.label;
      } else {
        const m = MODELS[source];
        if (!m) return res.status(400).json({ error: `unknown source ${source}` });
        const init = Number(req.query.init);
        if (!Number.isFinite(init)) return res.status(400).json({ error: 'init is required' });
        const initMs = Math.round(init / HOUR) * HOUR;
        const leadHours = (validMs - initMs) / HOUR;
        if (leadHours < 0 || leadHours > m.maxLeadHours || leadHours % m.leadStepHours !== 0) {
          return res.status(404).json({ error: `${m.label} has no forecast valid at this time from that run` });
        }
        const ds = await openDataset(m.dataset);
        const [ia, la] = await Promise.all([axis(ds, 'init_time'), axis(ds, 'lead_time')]);
        const ii = exactIndex(ia, initMs, HOUR / 2);
        const li = exactIndex(la, leadHours * 3600, 1);
        if (ii < 0 || li < 0) return res.status(404).json({ error: `${m.label} run not in the archive` });
        ({ factor, offset } = await convOf(m.dataset, field.variables[0], canonicalOf(fieldId, field), system));
        slab = await readField(ds, field.variables, [ii, li], field.combine);
        label = `${m.label} +${leadHours}h`;
      }

      // A gap in an archive comes back as a full slab of NaN, which would
      // otherwise render as a convincing blank map. Say so instead.
      let finite = false;
      for (let i = 0; i < slab.data.length; i++) {
        if (Number.isFinite(slab.data[i])) { finite = true; break; }
      }
      if (!finite) {
        return res.status(404).json({ error: `${label} has no data for this hour (gap in the archive)` });
      }

      // barbs are drawn from the raw components in their own units, so they read
      // in knots regardless of what the fill is labelled in
      const barbs = field.barbs && slab.components ? slab.components : null;
      const webp = await renderSlab({ slab, bbox: REGION, scale, factor, offset, px, barbs });
      res.type('image/webp');
      res.set('cache-control', 'public, max-age=31536000, immutable');
      res.set('x-wx-panel', label);
      // the transfer gate: a warm run must cost zero upstream bytes
      res.set('x-wx-upstream-bytes', String(upstreamBytes()));
      res.set('server-timing', `render;dur=${Date.now() - started}`);
      return res.send(webp);
    } catch (err) {
      return res.status(err.status ?? 502).json({ error: String(err.message ?? err) });
    }
  });

  return router;
}
