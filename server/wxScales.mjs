// Colour scales and unit handling for the verification maps.
//
// The server colorizes pixels with these and the client draws its key from the
// same object (served by /api/wx-verify/fields), so there is one definition and
// the bar can never disagree with the image. Shape matches the `Scale` type the
// Forecast stage already renders - see src/.../wxClient.ts.
//
// Because the ramp is baked into the pixels, the unit system is a property of
// the rendered image, not a client-side display choice: switching to metric
// re-renders rather than relabelling.

// ---- colour helpers (needed by the ramp builders below) ----
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
const toHex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Sample a list of hex stops at 0..1. */
function sample(stops, t) {
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const k = Math.min(Math.floor(u), stops.length - 2);
  return lerp(hexToRgb(stops[k]), hexToRgb(stops[k + 1]), u - k);
}

/**
 * A finely-banded stepped ramp with one deliberate discontinuity.
 *
 * Temperature wants small contour intervals so a two-degree difference between
 * runs is visible, but it also wants the freezing line to be a hard edge. Those
 * pull against each other: interpolating one ramp across the break would smear
 * it over several bands. So the two sides are interpolated independently - the
 * cold side reaches its final colour just below the break, the warm side starts
 * at its first - and the jump lands exactly on `breakAt`.
 */
function splitRamp({ from, to, step, breakAt, cold, warm, label, under, ticks }) {
  const bounds = [];
  for (let v = from; v <= to + 1e-9; v += step) bounds.push(Math.round(v * 1000) / 1000);
  const colors = bounds.map((v) => {
    const isCold = v < breakAt;
    const stops = isCold ? cold : warm;
    const lo = isCold ? from : breakAt;
    const hi = isCold ? breakAt - step : to; // so each side spans its own stops fully
    return toHex(sample(stops, hi > lo ? (v - lo) / (hi - lo) : 0));
  });
  return { type: 'steps', label, bounds, colors, under, ticks };
}

/** An evenly-banded stepped ramp from a short list of stops. */
function bandedRamp({ bounds, stops, label, under, over, ticks }) {
  const colors = bounds.map((_, i) => toHex(sample(stops, i / Math.max(1, bounds.length - 1))));
  return { type: 'steps', label, bounds, colors, under, over, ticks };
}

// ---- unit conversion ----
//
// The archives publish CF units, which are rarely what a reader wants on a map:
// precipitation is a *rate* in kg m-2 s-1 (0.0039 is heavy rain, not a trace),
// pressure is Pa, temperature is Celsius. Note `m s-1` means wind for one
// variable and snowfall for another, so this keys on the variable name as well
// as the unit - matching on unit alone would turn gusts into snow depth.
//
// Temperature needs an offset as well as a factor, which is why conversions are
// {factor, offset} rather than a bare multiplier.
const CONVERSIONS = [
  //  match,                        from unit,      imperial,                              metric
  [/temperature|dew_point/i, 'degree_Celsius', { factor: 9 / 5, offset: 32, unit: '°F' }, { factor: 1, offset: 0, unit: '°C' }],
  [/precipitation|rain/i, 'kg m-2 s-1', { factor: 3600 / 25.4, offset: 0, unit: 'in/hr' }, { factor: 3600, offset: 0, unit: 'mm/hr' }],
  [/snowfall/i, 'm s-1', { factor: 3600 * 39.3701, offset: 0, unit: 'in/hr' }, { factor: 360000, offset: 0, unit: 'cm/hr' }],
  // millibars and hectopascals are the same number; US forecasters say mb
  [/pressure/i, 'Pa', { factor: 0.01, offset: 0, unit: 'mb' }, { factor: 0.01, offset: 0, unit: 'hPa' }],
  [/wind|gust/i, 'm s-1', { factor: 2.236936, offset: 0, unit: 'mph' }, { factor: 1, offset: 0, unit: 'm/s' }],
  [/snow_thickness|snow_depth/i, 'm', { factor: 39.3701, offset: 0, unit: 'in' }, { factor: 100, offset: 0, unit: 'cm' }],
];

/** How to get from a variable's published unit to the one the map is drawn in. */
export function conversionFor(variable, unit, system = 'imperial') {
  for (const [re, from, imperial, metric] of CONVERSIONS) {
    if (re.test(variable) && unit === from) return system === 'metric' ? metric : imperial;
  }
  return { factor: 1, offset: 0, unit: unit || '' };
}

// ---- temperature ----
// Anchors for each side of the freezing line. Interpolated to 2 F (1 C) bands by
// splitRamp, so neighbouring bands sit close together and a small difference
// between two runs still reads, while 32 F stays a hard edge.
const TEMP_COLD = ['#241043', '#3b1157', '#4c2a91', '#3a4cae', '#2e79c4', '#5cb2d6'];
const TEMP_WARM = ['#1d7a4c', '#4aa85e', '#93c455', '#e2cf45', '#eda63c', '#e07235', '#cc3a2c', '#94203f'];

const TEMP_F = splitRamp({
  from: -20, to: 100, step: 2, breakAt: 32,
  cold: TEMP_COLD, warm: TEMP_WARM,
  label: '2 m temperature (°F)', under: '#180a30',
  ticks: [-20, 0, 20, 32, 50, 70, 90, 100],
});
const TEMP_C = splitRamp({
  from: -30, to: 40, step: 1, breakAt: 0,
  cold: TEMP_COLD, warm: TEMP_WARM,
  label: '2 m temperature (°C)', under: '#180a30',
  ticks: [-30, -20, -10, 0, 10, 20, 30, 40],
});

// ---- precipitation ----
// No `under`, so anything below the first bound stays transparent: dry ground
// should show the basemap, not a colour.
const PRECIP_COLORS = [
  '#d7f0d5', '#a6dba0', '#5aae61', '#1b7837', '#a6cee3', '#3690c0',
  '#0570b0', '#023858', '#fdae61', '#f46d43', '#a50026',
];
const PRECIP_IN = {
  type: 'steps',
  label: 'Precipitation rate (in/hr)',
  bounds: [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0],
  colors: PRECIP_COLORS,
  over: '#6a0043',
};
const PRECIP_MM = {
  type: 'steps',
  label: 'Precipitation rate (mm/hr)',
  bounds: [0.2, 0.5, 1, 2, 4, 7, 10, 15, 20, 30, 50],
  colors: PRECIP_COLORS,
  over: '#6a0043',
};

// MSL pressure varies by only a few millibars across a 400 km box, so the bands
// are narrow and cover just the range that actually occurs. Even so this is a
// synoptic diagnostic rather than a regional one.
const PRESSURE = (unit) => ({
  type: 'steps',
  label: `MSL pressure (${unit})`,
  bounds: [990, 994, 998, 1002, 1006, 1010, 1014, 1018, 1022, 1026, 1030, 1034],
  colors: [
    '#3f1d5c', '#5b2d8e', '#4358ad', '#3d84c6', '#7ab8d9', '#bcdcea',
    '#f2efe4', '#f6dfae', '#f0bd6f', '#e4933f', '#cf6224', '#a33417',
  ],
  under: '#2a0f3f',
  over: '#6d1d0c',
  ticks: [990, 998, 1006, 1014, 1022, 1030],
});

// ---- 10 m wind speed ----
// Calm reads as near-transparent pale, rising through teal and yellow into red
// and magenta, so the windy areas are what the eye lands on.
const WIND_STOPS = ['#eef3f5', '#bcdbe4', '#7ec4bf', '#63b06a', '#c4cc55', '#f0c447', '#ea8f3c', '#d9542f', '#b02456', '#7a1060'];
const WIND_MPH = bandedRamp({
  bounds: [1, 3, 5, 8, 11, 15, 20, 25, 30, 35, 45, 55],
  stops: WIND_STOPS, label: '10 m wind speed (mph)', over: '#4d0a45', under: '#f7fafb',
  ticks: [1, 5, 11, 20, 30, 45, 55],
});
const WIND_MS = bandedRamp({
  bounds: [0.5, 1.5, 2.5, 3.5, 5, 7, 9, 11, 14, 16, 20, 25],
  stops: WIND_STOPS, label: '10 m wind speed (m/s)', over: '#4d0a45', under: '#f7fafb',
  ticks: [0.5, 2.5, 5, 9, 14, 20, 25],
});

// ---- cloud cover ----
// Plain grey to blue, as asked: clear sky is a pale neutral, overcast a deep
// blue, with nothing in between competing for attention.
const CLOUD = bandedRamp({
  bounds: [5, 15, 25, 35, 45, 55, 65, 75, 85, 95],
  stops: ['#eceff1', '#c8d2d8', '#9fb2bf', '#7594a8', '#4d7793', '#2b5f8a'],
  label: 'Total cloud cover (%)',
  under: '#f4f6f7', // clear sky still reads as the palest grey, not a hole
  ticks: [5, 25, 45, 65, 85, 95],
});

// ---- relative humidity ----
// Dry is brown, saturated is deep green-blue; the midpoint is deliberately
// neutral so the eye reads the extremes.
const HUMIDITY = bandedRamp({
  bounds: [10, 20, 30, 40, 50, 60, 70, 80, 90, 95],
  stops: ['#8c5a28', '#c19a5b', '#e6d5a8', '#f2f0e4', '#b9d9c4', '#5fae8e', '#2a7f7a', '#164f63'],
  label: 'Relative humidity (%)',
  under: '#7a4a1c', // very dry air is rare here but must still draw
  ticks: [10, 30, 50, 70, 90, 95],
});

const VIRIDIS = ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'];

function pretty(name) {
  return name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
function niceRange(lo, hi) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [0, 1];
  const s = 10 ** Math.floor(Math.log10((hi - lo) / 4 || 1));
  return [Math.floor(lo / s) * s, Math.ceil(hi / s) * s];
}

/**
 * The scale for one variable, in the display unit. `stats` is only consulted for
 * variables with no fixed ramp, so a known field keeps the same colours across
 * every date, model and run - without that, two panels could not be compared.
 */
export function scaleFor(variable, unit, stats, system = 'imperial') {
  const imperial = system !== 'metric';
  if (/reflectivity/i.test(variable)) {
    return {
      type: 'steps', label: 'Composite reflectivity (dBZ)',
      bounds: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70],
      colors: ['#04e9e7', '#019ff4', '#0300f4', '#02fd02', '#01c501', '#008e00',
        '#fdf802', '#e5bc00', '#fd9500', '#fd0000', '#d40000', '#bc0000', '#f800fd', '#9854c6'],
      over: '#4b0076',
    };
  }
  if (/humidity/i.test(variable)) return HUMIDITY;
  if (/cloud_cover/i.test(variable)) return CLOUD;
  if (/wind|gust/i.test(variable)) return imperial ? WIND_MPH : WIND_MS;
  if (/temperature|dew_point/i.test(variable)) {
    const base = imperial ? TEMP_F : TEMP_C;
    return { ...base, label: `${pretty(variable).replace(/ 2m$/, '')} (${unit})` };
  }
  if (/snowfall/i.test(variable)) {
    return { ...(imperial ? PRECIP_IN : PRECIP_MM), label: `${pretty(variable)} (${unit})` };
  }
  if (/precipitation|rain/i.test(variable)) {
    return { ...(imperial ? PRECIP_IN : PRECIP_MM), label: `Precipitation rate (${unit})` };
  }
  if (/pressure/i.test(variable)) return PRESSURE(unit);
  const [min, max] = niceRange(stats?.min ?? 0, stats?.max ?? 1);
  return { type: 'gradient', label: `${pretty(variable)}${unit ? ` (${unit})` : ''}`, min, max, stops: VIRIDIS };
}

/** True when the scale is fixed, i.e. it needs no sample of the data. */
export function isFixed(variable) {
  return /reflectivity|temperature|dew_point|precipitation|rain|snowfall|pressure|cloud_cover|humidity|wind|gust/i.test(variable);
}

/**
 * Build `value -> [r,g,b] | null` for a scale. null means "draw nothing", which
 * is how dry ground stays transparent under a precipitation layer.
 *
 * Stepped scales compare against their bounds directly rather than through a
 * quantised lookup table, so a boundary lands exactly on its value - that is
 * what makes the freezing line fall on 32 degrees and not 31.8.
 */
export function makeColorizer(scale) {
  if (scale.type === 'steps') {
    const { bounds } = scale;
    const cols = scale.colors.map(hexToRgb);
    const under = scale.under ? hexToRgb(scale.under) : null;
    const over = scale.over ? hexToRgb(scale.over) : null;
    const last = bounds[bounds.length - 1];
    return (v) => {
      if (v < bounds[0]) return under;
      if (over && v >= last) return over;
      let k = 0;
      while (k + 1 < bounds.length && v >= bounds[k + 1]) k++;
      return cols[Math.min(k, cols.length - 1)];
    };
  }
  const stops = scale.stops.map(hexToRgb);
  const { min = 0, max = 1 } = scale;
  const span = max - min || 1;
  return (v) => sample(stops.map(toHex), (v - min) / span);
}
