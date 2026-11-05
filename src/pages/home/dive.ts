// One camera from space down to the Finger Lakes. The globe and the map both take their framing from
// here, so at every moment of the scroll they agree on where Ithaca is and how many pixels a kilometre
// covers. There is no cut between them to notice, in either direction. Window size and progress in,
// framing out. Progress runs 0 at the resting globe to 1 at the finished map.

export const ITHACA_LATLON = { lat: 42.4406, lon: -76.4966 };
// Everything below is in the lake map's pixels (17 m each). region.webp is true north-up UTM at 100 m
// per pixel: where its corner falls, how many lake map pixels one of its pixels covers, and how far the
// lake map is turned from north.
export const ITHACA = { x: 1289, y: 3791 };
export const REGION = { x: -8073, y: -6335, scale: 100 / 17, turn: 0.3351 };
const REGION_CENTRE = { x: -401, y: 1613 };
const MAP_KM_PER_PX = 0.017;

// Phones and small tablets, where the stacked layout runs: smaller art, because their screens need no more and
// the system kills a tab that uses too much memory. Chosen once at load, rotating doesn't reload anything.
export const isSmallScreen = () => window.innerWidth <= 1100;

// the earth as drawn: its radius in scene units, and where the camera starts above the ground
export const EARTH_RADIUS = 0.71375;
const KM_PER_UNIT = 6371 / EARTH_RADIUS;
// the earth is fully veiled by the map from here on, so it stops being drawn
export const EARTH_GONE = 0.97;
// the ground turns to face the camera while it is still far away, and is simply descended to after that
export const TURN_END = 0.45;

export function rotated(x: number, y: number, a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: c * x - s * y, y: s * x + c * y };
}

// The shared map framing. On stacked layouts, centre the descent before easing into the region view.
export function regionFrame(vw: number, vh: number, progress = 1) {
  const stacked = vw <= 1100;
  const k = stacked ? Math.min(vw / 8400, vh / 7300) * 1.15 : Math.max(vw / 12910, vh / 8500);
  const i = rotated(ITHACA.x - REGION_CENTRE.x, ITHACA.y - REGION_CENTRE.y, -REGION.turn);
  const t = stacked ? Math.min(1, Math.max(0, (progress - TURN_END) / (1 - TURN_END))) : 1;
  const pan = t * t * (3 - 2 * t);
  const targetX = vw * (stacked ? 0.425 : 0.67) + i.x * k;
  const targetY = vh * (stacked ? 0.56 : 0.57) + i.y * k;
  return { k, x: stacked ? vw / 2 + (targetX - vw / 2) * pan : targetX, y: stacked ? vh / 2 + (targetY - vh / 2) * pan : targetY };
}

// How far down the zoom a scroll position is. Nearly linear, because the altitude below is already a
// steady zoom: easing the whole range would rush through the middle. y and pin in px.
export function diveAt(y: number, pin: number) {
  const u = Math.min(1, Math.max(0, y / Math.max(1, pin)));
  return u + (u * u * (3 - 2 * u) - u) * 0.35;
}

// pixels per scene unit at one unit of distance, for the camera's 42 degree field of view
export const focal = (vh: number) => vh / 2 / Math.tan((21 * Math.PI) / 180);

// Keep the opening globe below the copy on portrait screens, and beside it in landscape.
// The same resting camera starts the zoom, so the first scroll cannot jump its size or position.
export function globeFrame(vw: number, vh: number) {
  const f = focal(vh);
  const portrait = vw <= 1100 && vh > vw;
  const landscape = vw <= 1100 && vh <= 500;
  if (portrait || landscape) {
    const radius = portrait ? Math.min(vw * 0.39, vh * 0.2) : vh * 0.22;
    const z = Math.hypot(f * EARTH_RADIUS / radius, EARTH_RADIUS);
    return { x: portrait ? 0 : vw * 0.22 * z / f, y: -vh * (portrait ? 0.16 : 0.05) * z / f, z };
  }
  return { x: vw * 0.22 * 3.4 / f, y: -0.04, z: 3.4 };
}

// Height above the ground, in scene units: ends where the globe's scale equals the finished map's, and
// falls by an even ratio along the way, so the zoom feels steady across its huge range.
export function altitude(progress: number, vw: number, vh: number) {
  const start = globeFrame(vw, vh).z - EARTH_RADIUS;
  const end = focal(vh) / ((regionFrame(vw, vh).k / MAP_KM_PER_PX) * KM_PER_UNIT);
  return start * (end / start) ** progress;
}
