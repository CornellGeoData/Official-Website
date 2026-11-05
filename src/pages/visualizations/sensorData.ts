import soilArchive from '../../data/soil-archive.json';

// the families the network splits into; pins and legends wear these
export const AIR = '#6d9dcd';
export const SOIL = '#c1703f';
// regional NEWA weather stations wear the water team's blue
export const WEATHER = '#2e6fc9';

// A sensor or point probe displayed on a map.
export interface MapSite {
  id: string;
  name: string;
  sub: string;
  lat: number;
  lon: number;
  tone: string;
  retired?: boolean;
  // hover/selected name renders under the dot instead of above it - set on
  // sensors whose label would otherwise sit on a crowded neighbor
  labelBelow?: boolean;
}

// ACTIVE SENSORS - the /api/aqi proxy (server.mjs) passes through the Egg API's
// reduced+grouped JSON. Shape-tolerant on purpose: a portal-side format tweak
// should degrade to "no chart", not a crash.
export interface SensorPoint { t: number; v: number }

export function eggSeries(raw: unknown): { key: string; points: SensorPoint[] }[] {
  let obj = raw as Record<string, unknown> | null;
  // unwrap single-key wrappers (e.g. keyed by serial number)
  while (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj);
    const inner = keys.length === 1 ? obj[keys[0]] : null;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) obj = inner as Record<string, unknown>;
    else break;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const out: { key: string; points: SensorPoint[] }[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (!Array.isArray(val)) continue;
    // the Egg reports ~every minute; charts show one sample per 5-minute bucket.
    // no averaging - the kept sample's noise is the instrument's real behaviour
    const points = (val as { t?: string; time?: string; date?: string; v?: unknown; value?: unknown }[])
      .map((p) => ({ t: Date.parse(p?.t ?? p?.time ?? p?.date ?? ''), v: Number(p?.v ?? p?.value) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
      .sort((a, b) => a.t - b.t)
      .filter((p, i, a) => i === 0 || Math.floor(p.t / 300_000) !== Math.floor(a[i - 1].t / 300_000));
    if (points.length > 1) out.push({ key: key.toLowerCase(), points });
  }
  return out;
}

// channels rendered in this order when present in the feed. PM readings in clean
// air sit near 0 and quantize in ~0.1 steps, so those charts pin the baseline to
// 0 with a minimum y-span instead of autoscaling the noise to full height.
// the first four are the charts a
// card shows at its opening size; the rest follow on scroll
export const EGG_CHANNELS: { key: string; label: string; unit: string; scale?: (v: number) => number; y0?: number; minSpan?: number; epaBands?: boolean; footnote?: string }[] = [
  // pm10p0 isn't charted but still feeds the AQI badge via AQI_BP
  // minSpan keeps a channel's ordinary wiggle from autoscaling to full height:
  // the plot only stretches when something actually happens
  { key: 'co2', label: 'CO2', unit: 'ppm', minSpan: 80 },
  { key: 'temperature', label: 'Temperature', unit: '°C', minSpan: 6 },
  { key: 'pm2p5', label: 'PM2.5', unit: 'µg/m³', epaBands: true, footnote: '* EPA AQI "Good" ceiling: 9 µg/m³ (2024 annual standard)' },
  { key: 'pm1p0', label: 'PM1.0', unit: 'µg/m³', y0: 0, minSpan: 15 },
  { key: 'no2', label: 'NO2', unit: 'ppb', y0: 0, minSpan: 50 },
  { key: 'o3', label: 'O3', unit: 'ppb', y0: 0, minSpan: 50 },
  { key: 'so2', label: 'SO2', unit: 'ppb', y0: 0, minSpan: 30 },
  { key: 'co', label: 'CO', unit: 'ppm', y0: 0, minSpan: 4 },
  { key: 'humidity', label: 'Humidity', unit: '%', minSpan: 15 },
  // the Egg has reported pressure in Pa on older firmware and hPa on current, so pick
  // by magnitude: station pressure is ~1013 hPa at sea level and never near 10,000.
  { key: 'pressure', label: 'Pressure', unit: 'hPa', scale: (v) => (v > 10_000 ? v / 100 : v) },
];

// US EPA AQI breakpoints [Clow, Chigh, Ilow, Ihigh] (2024 PM2.5 revision).
// Gas breakpoints are the EPA 8h (O3, CO) / 1h (NO2, SO2) tables applied to
// instantaneous readings, same simplification the PM badge already makes.
const AQI_BP: Record<string, number[][]> = {
  pm2p5: [[0, 9, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]],
  pm10p0: [[0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150], [255, 354, 151, 200], [355, 424, 201, 300], [425, 604, 301, 500]],
  o3: [[0, 54, 0, 50], [55, 70, 51, 100], [71, 85, 101, 150], [86, 105, 151, 200], [106, 200, 201, 300], [201, 604, 301, 500]],
  no2: [[0, 53, 0, 50], [54, 100, 51, 100], [101, 360, 101, 150], [361, 649, 151, 200], [650, 1249, 201, 300], [1250, 2049, 301, 500]],
  so2: [[0, 35, 0, 50], [36, 75, 51, 100], [76, 185, 101, 150], [186, 304, 151, 200], [305, 604, 201, 300], [605, 1004, 301, 500]],
  co: [[0, 4.4, 0, 50], [4.5, 9.4, 51, 100], [9.5, 12.4, 101, 150], [12.5, 15.4, 151, 200], [15.5, 30.4, 201, 300], [30.5, 50.4, 301, 500]],
};

function aqiFrom(conc: number, bp: number[][]): number {
  const [cl, ch, il, ih] = bp.find(([lo, hi]) => conc >= lo && conc <= hi) ?? bp[bp.length - 1];
  return Math.round(il + ((Math.min(conc, ch) - cl) / (ch - cl)) * (ih - il));
}

const AQI_CATS: readonly (readonly [number, string, string])[] = [
  [50, 'Good', '#00e400'],
  [100, 'Moderate', '#ffff00'],
  [150, 'Unhealthy for Sensitive Groups', '#ff7e00'],
  [200, 'Unhealthy', '#ff0000'],
  [300, 'Very Unhealthy', '#8f3f97'],
  [Infinity, 'Hazardous', '#7e0023'],
];

export const aqiCat = (aqi: number) => AQI_CATS.find(([max]) => aqi <= max)!;

export type Rating = (v: number) => readonly [number, string, string];

// every channel with an EPA AQI standard gets a badge; PM1.0, CO2, and the
// weather channels have no standard, so they stay unrated
export const RATINGS: Record<string, Rating> = Object.fromEntries(
  Object.keys(AQI_BP).map((k) => [k, (v: number) => aqiCat(aqiFrom(v, AQI_BP[k]))]),
);

export const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---- CSV export: every channel, one row per 5-minute bucket ----
export type SensorTable = { cols: { label: string; unit: string }[]; rows: { t: number; vals: (number | null)[] }[] };

const TABLE_META: Record<string, { label: string; unit: string }> = Object.fromEntries([
  ...EGG_CHANNELS.map((c) => [c.key, { label: c.label, unit: c.unit }]),
  ['pm10p0', { label: 'PM10', unit: 'µg/m³' }],
]);

const TABLE_ORDER = ['pm2p5', 'co2', 'temperature', 'pm10p0', 'pm1p0', 'no2', 'o3', 'so2', 'co', 'humidity', 'pressure'];

export function eggTable(series: { key: string; points: SensorPoint[] }[], unit: 'C' | 'F'): SensorTable {
  const keys = TABLE_ORDER.filter((k) => series.some((s) => s.key === k && s.points.length));
  const by = new Map<number, (number | null)[]>();
  keys.forEach((k, ci) => {
    const scale = EGG_CHANNELS.find((c) => c.key === k)?.scale;
    for (const p of series.find((s) => s.key === k)!.points) {
      let v = scale ? scale(p.v) : p.v;
      if (k === 'temperature' && unit === 'F') v = (v * 9) / 5 + 32;
      const b = Math.floor(p.t / 300_000) * 300_000;
      const row = by.get(b) ?? Array<number | null>(keys.length + 1).fill(null);
      row[ci + 1] = v;
      by.set(b, row);
    }
  });
  // AQI leads each row: the worse of the two PM sub-indices, same as the chart
  for (const row of by.values()) {
    const subs = (['pm2p5', 'pm10p0'] as const).flatMap((k) => {
      const i = keys.indexOf(k);
      const v = i >= 0 ? row[i + 1] : null;
      return v == null ? [] : [aqiFrom(v, AQI_BP[k])];
    });
    if (subs.length) row[0] = Math.max(...subs);
  }
  return {
    cols: [{ label: 'AQI', unit: '' }, ...keys.map((k) => (k === 'temperature' ? { label: 'Temperature', unit: unit === 'F' ? '°F' : '°C' } : TABLE_META[k]))],
    rows: [...by.entries()].sort((a, b) => b[0] - a[0]).map(([t, vals]) => ({ t, vals })),
  };
}

export function soilTable(points: SensorPoint[]): SensorTable {
  return {
    cols: [{ label: 'Soil moisture', unit: '% VWC' }],
    rows: [...points].sort((a, b) => b.t - a.t).map((p) => ({ t: p.t, vals: [p.v] })),
  };
}

export function downloadCsv(name: string, table: SensorTable) {
  const head = ['time', ...table.cols.map((c) => (c.unit ? `${c.label} (${c.unit})` : c.label))];
  const lines = [head.join(','), ...[...table.rows].reverse().map((r) => [new Date(r.t).toISOString(), ...r.vals.map((v) => v ?? '')].join(','))];
  const a = document.createElement('a');
  // BOM so Excel reads the unit glyphs as UTF-8
  a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' }));
  a.download = `${name.toLowerCase().replace(/\s+/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// one Soilmote card: the same soilmoisture trace at three zooms. Month tells the
// story, day answers "is it wet right now". Battery voltage is in the feed too,
// deliberately not charted.
// a chart only needs ~1 point per plot pixel: keep the first sample per bucket,
// same idiom as eggSeries' 5-minute pass
export function thin(pts: SensorPoint[]): SensorPoint[] {
  if (pts.length < 2) return pts;
  const b = (pts[pts.length - 1].t - pts[0].t) / 1500;
  return b <= 300_000 ? pts : pts.filter((p, i, a) => i === 0 || Math.floor(p.t / b) !== Math.floor(a[i - 1].t / b));
}

// the static sheet's time window, shared by charts, log, and download
export const RANGES = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['life', 'Lifetime']] as const;

export type TimeRange = (typeof RANGES)[number][0];

const RANGE_MS: Record<string, number> = { day: 86_400_000, week: 7 * 86_400_000, month: 31 * 86_400_000 };

// windows anchor to the newest sample, not the wall clock, so an offline
// sensor's last day still shows something
export function clip(pts: SensorPoint[], r: TimeRange): SensorPoint[] {
  if (r === 'life' || pts.length === 0) return pts;
  const newest = pts[pts.length - 1].t;
  return pts.filter((p) => p.t >= newest - RANGE_MS[r]);
}

// "N 42\u00b0 27.060' W 76\u00b0 26.863'" -> decimal degrees. Degrees-and-decimal-
// minutes is how the team records positions in the field, so it stays the stored
// form and the globe derives its pins from it rather than keeping a second copy.
export function dm(coords: string): { lat: number; lon: number } {
  const [lat, lon] = [...coords.matchAll(/([NSEW])\s*(\d+)\u00b0\s*([\d.]+)'/g)]
    .map(([, hem, deg, min]) => (Number(deg) + Number(min) / 60) * (hem === 'S' || hem === 'W' ? -1 : 1));
  return { lat, lon };
}

// one card per egg. Ids are the slot names /api/aqi assigns in EGG_SERIAL order,
// so adding an egg = append its serial to EGG_SERIAL on the server + an entry here.
export const EGGS = [
  { id: 'egg1', name: 'Snee Egg', location: 'Snee Hall roof', coords: "N 42\u00b0 26.613' W 76\u00b0 29.105'" },
  { id: 'egg2', name: 'ELL Egg', location: 'GeoData workbench', coords: "N 42\u00b0 26.636' W 76\u00b0 28.971'" },
];

// Zynect Soilmotes ride the same Wicked Device API as the eggs, but the grouped
// feed is keyed by internal serial (the portal name, e.g. CENSE, is an alias).
// That API needs no key and allows any origin, so the client fetches it directly.
export const SOILMOTES = [
  // labelBelow: sits under GLITZ/CAMPS, so its name drops beneath the dot
  { id: 'eggba7714fb1f826a6a', name: 'CENSE', location: 'Gamefarm', lifeFrom: Date.parse('2025-03-18T00:00:00Z'), coords: "N 42\u00b0 26.924' W 76\u00b0 26.812'", labelBelow: true },
  { id: 'egg6489edb8c8318336', name: 'NINJA', location: 'Gamefarm', lifeFrom: Date.parse('2026-03-21T00:00:00Z'), coords: "N 42\u00b0 26.926' W 76\u00b0 26.757'" },
];

// retired probes: their history never changes, so it's cataloged once into
// soil-archive.json (thinned to ~900 pts each) instead of refetched from the
// slow archive API. A probe that comes back moves to SOILMOTES and out of the archive.
export const ARCHIVE: Record<string, SensorPoint[]> = Object.fromEntries(
  // a 0% reading means the probe wasn't reading, not dry soil - drop them
  Object.entries(soilArchive as unknown as Record<string, [number, number][]>).map(([k, v]) => [k, v.map(([t, x]) => ({ t, v: x })).filter((p) => p.v !== 0)]),
);

export const RETIRED = [
  { coords: "N 42\u00b0 27.060' W 76\u00b0 26.863'", name: 'GRASP', from: '5/14/25', to: '8/29/26' },
  { coords: "N 42\u00b0 27.032' W 76\u00b0 26.729'", name: 'CAMPS', from: '4/18/25', to: '4/19/26' },
  { coords: "N 42\u00b0 26.949' W 76\u00b0 26.816'", name: 'GLITZ', from: '3/18/25', to: '4/13/26' },
];

// Regional NEWA weather stations around Cayuga Lake, served by the Northeast
// Regional Climate Center (hrly.nrcc.cornell.edu - keyless, CORS-open, hourly
// with a 1-2 h lag). sid is the NRCC "<station> <network>" pair; lat/lon come
// from their station list, already decimal.
export const NEWA_STATIONS = [
  { id: 'wx-itha', sid: 'ny_itha nwon', name: 'Cornell Orchards (NEWA)', location: 'Ithaca', lat: 42.443624, lon: -76.463274 },
  { id: 'wx-itbl', sid: 'ny_itbl nwon', name: 'Bluegrass Lane (NEWA)', location: 'Ithaca', lat: 42.461956, lon: -76.463891 },
  { id: 'wx-lans', sid: 'ny_lans nwon', name: 'Lansing (NEWA)', location: 'Cornell Orchards', lat: 42.572295, lon: -76.595127 },
  { id: 'wx-aur', sid: 'aur newa', name: 'Aurora (NEWA)', location: 'East shore, Cayuga Lake', lat: 42.73367, lon: -76.65383 },
  { id: 'wx-int', sid: 'int newa', name: 'Interlaken (NEWA)', location: 'Airy Acres', lat: 42.636288, lon: -76.725271 },
];

// charted in this order when the station reports them. Leaf wetness rides the
// feed but isn't charted, same call as battery voltage.
// temp/dwpt arrive in °F and stay stored that way - the °C pick converts at
// render, mirroring the eggs (stored °C, converted to °F).
export const NEWA_CHANNELS: { key: string; label: string; unit: string; y0?: number; minSpan?: number }[] = [
  { key: 'temp', label: 'Temperature', unit: '°F', minSpan: 10 },
  { key: 'dwpt', label: 'Dew point', unit: '°F', minSpan: 10 },
  { key: 'rhum', label: 'Humidity', unit: '%', minSpan: 15 },
  // wdir draws as a wind rose, not a line; the entry also names its CSV column
  { key: 'wdir', label: 'Wind direction', unit: 'deg' },
  { key: 'prcp', label: 'Precipitation', unit: 'in/hr', y0: 0, minSpan: 0.25 },
  { key: 'wspd', label: 'Wind speed', unit: 'mph', y0: 0, minSpan: 12 },
  { key: 'srad', label: 'Solar radiation', unit: 'W/m²', y0: 0, minSpan: 400 },
];

// {hrlyFields, hrlyData} columns -> one series per channel. Everything is
// strings; "M" and "NaN" (missing) drop out through the finite filter.
export function newaSeries(raw: unknown): { key: string; points: SensorPoint[] }[] {
  const r = raw as { hrlyFields?: string[]; hrlyData?: string[][] } | null;
  if (!Array.isArray(r?.hrlyFields) || !Array.isArray(r?.hrlyData)) return [];
  const di = r.hrlyFields.indexOf('date');
  return r.hrlyFields.flatMap((f, ci) => {
    if (f === 'date' || f === 'flags') return [];
    const points = r.hrlyData!
      // NEWA reports solar radiation in langleys per hour; 1 ly/hr = 11.6 W/m²
      .map((row) => ({ t: Date.parse(row[di]), v: Number(row[ci]) * (f === 'srad' ? 11.6 : 1) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
    return points.length > 1 ? [{ key: f, points }] : [];
  });
}

export const isF = (key: string) => key === 'temp' || key === 'dwpt';

export const toC = (pts: SensorPoint[]) => pts.map((p) => ({ t: p.t, v: ((p.v - 32) * 5) / 9 }));

// one weather station's channels as rows, one per hour - feeds the CSV
export function newaTable(series: { key: string; points: SensorPoint[] }[], unit: 'C' | 'F'): SensorTable {
  const cols = NEWA_CHANNELS.filter((c) => series.some((s) => s.key === c.key && s.points.length));
  const by = new Map<number, (number | null)[]>();
  cols.forEach((c, ci) => {
    const pts = series.find((s) => s.key === c.key)!.points;
    for (const p of isF(c.key) && unit === 'C' ? toC(pts) : pts) {
      const row = by.get(p.t) ?? Array<number | null>(cols.length).fill(null);
      row[ci] = p.v;
      by.set(p.t, row);
    }
  });
  return {
    cols: cols.map((c) => ({ label: c.label, unit: isF(c.key) ? `°${unit}` : c.unit })),
    rows: [...by.entries()].sort((a, b) => b[0] - a[0]).map(([t, vals]) => ({ t, vals })),
  };
}

