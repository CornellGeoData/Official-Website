// Weather maps and value grids are published separately from the website.
export const WX_BASE = import.meta.env.VITE_WX_BASE || 'https://cornellgeodata.github.io/geodata-wx';

export interface Frame { file: string; valid: string; data?: string }
// per-layer regular grid of point values (row 0 = north edge, row-major),
// published next to the PNGs so a click can read the actual number
export interface ValuesMeta { n: number; s: number; w: number; e: number; rows: number; cols: number; unit: string }
// the colour scale as data - rendered as a real DOM element, not a raster
export interface Scale {
  type: 'steps' | 'gradient';
  label: string;
  bounds?: number[];
  colors?: string[];
  over?: string;
  min?: number;
  max?: number;
  stops?: string[];
}
export interface WxLayer {
  id: string;
  label: string;
  source: string;
  kind: 'obs' | 'forecast';
  init: string | null;
  stale_minutes: number;
  group?: string;
  expected_update_at?: string;
  valid_until?: string;
  accumulation_start?: string;
  opacity: number;
  bounds: { n: number; s: number; w: number; e: number };
  tiles?: { width: number; height: number; size: number };
  scale?: Scale;
  values?: ValuesMeta;
  frames: Frame[];
}
export interface Manifest { version: number; generated: string; layers: WxLayer[]; status?: { degraded?: boolean; reason?: string }; group_order?: string[] }

export async function fetchManifest(): Promise<Manifest> {
  const response = await fetch(`${WX_BASE}/latest.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(String(response.status));
  const m: Manifest = await response.json();
  if (!Array.isArray(m.layers) || !m.layers.every(l => Array.isArray(l.frames))) throw new Error('Invalid weather feed');
  return m;
}

export async function readWeatherValues(response: Response): Promise<(number | null)[]> {
  if (!response.ok) throw new Error(`Weather values: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  const body = new Blob([bytes]).stream();
  // GitHub Pages serves .json.gz as a file, without Content-Encoding. Check
  // the bytes so plain JSON and responses already decoded by fetch also work.
  const decoded = header[0] === 0x1f && header[1] === 0x8b
    ? body.pipeThrough(new DecompressionStream('gzip'))
    : body;
  const { v } = await new Response(decoded).json();
  if (!Array.isArray(v)) throw new Error('Weather values: missing grid');
  return v;
}

// Shared across WeatherForecast's readiness check and WeatherOverlay's
// painting, so the same URL is only ever decoded into one Image element.
export const imageCache = new Map<string, HTMLImageElement>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  let img = imageCache.get(url);
  if (img && img.complete && img.naturalWidth) return Promise.resolve(img);
  if (!img) {
    img = new Image();
    imageCache.set(url, img);
    img.src = url;
  }
  const loaded = img;
  return loaded.decode().then(() => loaded);
}
