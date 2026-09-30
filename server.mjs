import { existsSync } from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import express from 'express';
import { wxVerifyRouter, warmObservations } from './server/wxVerify.mjs';

// serves dist/ and proxies the Air Quality Egg API so the key stays server-side.
// EGG_SERIAL and EGG_API_KEY live in the host's environment (Railway), never in the repo.
const app = express();
const CACHE_MS = 5 * 60_000; // the Egg reports ~every minute; 15-min buckets make 5 min plenty
let cache = { t: 0, data: null };

app.get('/api/aqi', async (_req, res) => {
  if (!process.env.EGG_SERIAL || !process.env.EGG_API_KEY) {
    res.status(503).json({ error: 'sensor proxy not configured' });
    return;
  }
  try {
    if (!cache.data || Date.now() - cache.t > CACHE_MS) {
      // EGG_SERIAL may be a comma-separated list; the API batches them in one call.
      // dur is only valid with an anchor date (422 otherwise)
      const serials = process.env.EGG_SERIAL.split(',').map((x) => x.trim()).filter(Boolean);
      const url =
        `https://airqualityegg.com/api/v2/messages/device/${serials.join(',')}` +
        `?dur=P1D&end-date=${new Date().toISOString()}&reduced=1&grouped=1&apiKey=${process.env.EGG_API_KEY}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      const raw = await r.json();
      // re-key each egg by its position in EGG_SERIAL (egg1, egg2, ...) so the
      // client references stable slots and never sees the serial numbers
      const data = Object.fromEntries(
        serials.map((sn, i) => {
          const k = Object.keys(raw ?? {}).find((x) => x.toLowerCase() === sn.toLowerCase());
          return [`egg${i + 1}`, k ? raw[k] : null];
        }),
      );
      cache = { t: Date.now(), data };
    }
    res.set('cache-control', 'public, max-age=60');
    res.json(cache.data);
  } catch (err) {
    if (cache.data) {
      res.json(cache.data); // stale beats nothing
      return;
    }
    res.status(502).json({ error: String(err) });
  }
});

// the eggs' lifetime archive: same re-keying as /api/aqi, but a year deep and
// refreshed every 6h - the history only grows at the margin
let eggLife = { t: 0, p: null };
app.get('/api/aqi-lifetime', async (_req, res) => {
  if (!process.env.EGG_SERIAL || !process.env.EGG_API_KEY) {
    res.status(503).json({ error: 'sensor proxy not configured' });
    return;
  }
  const serials = process.env.EGG_SERIAL.split(',').map((x) => x.trim()).filter(Boolean);
  if (!eggLife.p || Date.now() - eggLife.t > 6 * 3600_000) {
    const url =
      `https://airqualityegg.com/api/v2/messages/device/${serials.join(',')}` +
      `?dur=P1Y&end-date=${new Date().toISOString()}&reduced=1&grouped=1&apiKey=${process.env.EGG_API_KEY}`;
    eggLife = {
      t: Date.now(),
      p: fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`upstream ${r.status}`))))
        .then((raw) => Object.fromEntries(
          serials.map((sn, i) => {
            const k = Object.keys(raw ?? {}).find((x) => x.toLowerCase() === sn.toLowerCase());
            return [`egg${i + 1}`, k ? raw[k] : null];
          }),
        )),
    };
    eggLife.p.catch(() => { eggLife.p = null; }); // failed fetch: next request retries
  }
  try {
    res.set('cache-control', 'public, max-age=3600');
    res.json(await eggLife.p);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// the Soilmote lifetime archive: Zynect takes ~a minute to assemble it, so one
// upstream fetch is shared by all visitors and refreshed every 6h. Serials must
// match SOILMOTES in src/pages/visualizations/sensorData.ts (internal ids, not portal aliases).
const SOIL_SERIALS = ['egge82d1055169daf2b'];
let soilLife = { t: 0, p: null };
app.get('/api/soil-lifetime', async (_req, res) => {
  if (!soilLife.p || Date.now() - soilLife.t > 6 * 3600_000) {
    const url =
      `https://zynect.com/api/v2/messages/device/${SOIL_SERIALS.join(',')}` +
      `?dur=P2Y&end-date=${new Date().toISOString()}&reduced=1&grouped=1`;
    soilLife = { t: Date.now(), p: fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`upstream ${r.status}`)))) };
    soilLife.p.catch(() => { soilLife.p = null; }); // failed fetch: next request retries
  }
  try {
    res.set('cache-control', 'public, max-age=3600');
    res.json(await soilLife.p);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// the NEWA stations' 5-year hourly archives: ~4MB of JSON each from NRCC, so
// one shared fetch (all stations in parallel) is cached 6h and stored gzipped -
// the repetitive rows shrink ~10x, and history only grows at the margin.
// Ids must match NEWA_STATIONS in src/pages/visualizations/sensorData.ts.
const WX_STATIONS = { 'wx-itha': 'ny_itha nwon', 'wx-itbl': 'ny_itbl nwon', 'wx-lans': 'ny_lans nwon', 'wx-aur': 'aur newa', 'wx-int': 'int newa' };
// station-local (NY) YYYYMMDDHH; the API rejects an edate past the current hour
const nrccStamp = (t) => new Date(t).toLocaleString('sv', { timeZone: 'America/New_York' }).replace(/\D/g, '').slice(0, 10);
let wxLife = { t: 0, p: null };
const fetchWxLife = () => {
  wxLife = {
    t: Date.now(),
    p: Promise.allSettled(Object.entries(WX_STATIONS).map(async ([id, sid]) => {
      const r = await fetch('https://hrly.nrcc.cornell.edu/stnHrly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, sdate: nrccStamp(Date.now() - 5 * 365 * 86_400_000), edate: nrccStamp(Date.now()) }),
      });
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      return [id, await r.json()];
    })).then((results) => {
      // a silent station just drops out; the client falls back to its month feed
      const entries = results.filter((x) => x.status === 'fulfilled').map((x) => x.value);
      if (entries.length === 0) throw new Error('all stations failed');
      return gzipSync(JSON.stringify(Object.fromEntries(entries)));
    }),
  };
  wxLife.p.catch(() => { wxLife.p = null; }); // failed fetch: next request retries
};
fetchWxLife(); // warm at boot so the first Lifetime click doesn't wait ~30s
app.get('/api/wx-lifetime', async (req, res) => {
  if (!wxLife.p || Date.now() - wxLife.t > 6 * 3600_000) fetchWxLife();
  try {
    const gz = await wxLife.p;
    res.set('cache-control', 'public, max-age=3600');
    res.type('json');
    if (req.acceptsEncodings('gzip')) {
      res.set('content-encoding', 'gzip');
      res.send(gz);
    } else res.send(gunzipSync(gz));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// Model verification maps, read from dynamical.org's open Icechunk archives.
// Rendering is server-side because one panel touches several MB of chunks - see
// server/wxArchive.mjs for the cost model. Panels are immutable and the module
// keeps its own byte cache, so once a run is warm it costs no upstream traffic.
app.use('/api/wx-verify', wxVerifyRouter());
// One analysis read covers ~90 days for the region, so warming it at boot makes
// every observation panel in that window instant - the same trick as the NEWA
// archive above. Wind is included because it costs two component reads and is
// otherwise the slowest first click. Deliberately not awaited.
void warmObservations();

// Serve the .br/.gz files produced by compress.mjs.
const DIST = path.resolve('dist');
const COMPRESSIBLE = /\.(?:js|css|html|svg|json|glb|stl|urdf)$/;
app.use((req, res, next) => {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !COMPRESSIBLE.test(req.path)) return next();
  if (req.headers.range) return next();
  const enc = req.acceptsEncodings('br', 'gzip');
  if (!enc) return next();
  const file = path.join(DIST, req.path) + (enc === 'br' ? '.br' : '.gz');
  if (!file.startsWith(DIST + path.sep) || !existsSync(file)) return next();
  res.set('content-encoding', enc);
  res.set('vary', 'accept-encoding');
  res.type(req.path.endsWith('.urdf') ? 'application/xml' : path.extname(req.path));
  // vite hashes /assets/ filenames, so they can be cached forever
  if (req.path.startsWith('/assets/')) res.set('cache-control', 'public, max-age=31536000, immutable');
  if (req.path === '/lidar/metadata.json') res.set('cache-control', 'no-cache');
  res.sendFile(file);
});

// long cache for static assets; html stays no-cache so deploys show up immediately
app.use(express.static('dist', {
  etag: true,
  maxAge: '30d',
  setHeaders: (res, p) => {
    if (p.endsWith('.html') || p.endsWith(`${path.sep}lidar${path.sep}metadata.json`)) res.set('cache-control', 'no-cache');
    else if (/[/\\]lidar[/\\][a-f0-9]{12}[/\\]/.test(p)) res.set('cache-control', 'public, max-age=31536000, immutable');
    else if (p.includes(`${path.sep}assets${path.sep}`)) res.set('cache-control', 'public, max-age=31536000, immutable');
  },
}));
app.use((_req, res) => res.sendFile('index.html', { root: 'dist' }));

app.listen(process.env.PORT ?? 4173);
