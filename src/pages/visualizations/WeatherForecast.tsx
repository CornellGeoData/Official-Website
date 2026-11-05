import { useEffect, useRef, useState } from 'react';
import TileMap, { type MapTarget, type Overlay } from './TileMap';
import type { MapSite } from './sensorData';
import { useCompactViewport } from './useCompactViewport';
import { RESIPLE } from '../../styles/theme';
import { WX_BASE, fetchManifest, readWeatherValues, loadImage, type Frame, type Scale, type WxLayer, type Manifest } from './wxClient';

// CARTO Positron: clean and light like the old gray canvas, but with a real
// state-boundary line and labels baked in - unlike USGS Topo it carries no
// terrain shading or dense hydrology labeling, so it doesn't compete with
// the weather colors. Needs a free key (carto.com/basemaps/apikey) or every
// tile is watermarked "API KEY REQUIRED"; set VITE_CARTO_KEY in .env.local.
const CARTO_KEY = import.meta.env.VITE_CARTO_KEY;
const LIGHT_TILES = (z: number, x: number, y: number) =>
  `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`;

// Initial position before the selected feed's full grid arrives.
const HOME = { lat: 42.75, lon: -76.6, zoom: 9 };

// fallback when the manifest doesn't publish its own group_order
const DEFAULT_GROUP_ORDER = ['StormCast', 'Nowcast', 'MRMS', 'HRRR'];

// the key sits straight on the map - no card. Black ink with a white halo
// reads on the light basemap and any overlay alike. Vertical, highest value
// at the top, numbers inboard of the bar.
const HALO = '0 0 4px rgba(255,255,255,0.95), 0 0 2px rgba(255,255,255,0.9)';
function ColorScale({ scale, small }: { scale: Scale; small: boolean }) {
  // the bar shrinks on short windows so the key clears the launcher button
  // above and the timebar below
  const H = small ? 'clamp(72px, calc(100dvh - 430px), 190px)' : 'clamp(80px, calc(100dvh - 260px), 300px)';
  const ring = '0 0 0 1px rgba(255,255,255,0.9), 0 1px 4px rgba(0,0,0,0.5)';
  let bar = null;
  let ticks: { frac: number; v: number }[] = [];
  if (scale.type === 'steps' && scale.bounds && scale.colors) {
    const n = scale.colors.length;
    bar = (
      <div style={{ display: 'flex', flexDirection: 'column-reverse', width: 10, height: H, boxShadow: ring }}>
        {scale.colors.map((c, i) => <span key={i} style={{ flex: 1, background: c }} />)}
      </div>
    );
    const every = !small && scale.bounds.length > 12 ? 2 : 1;
    ticks = scale.bounds.map((v, i) => ({ frac: i / n, v })).filter((_, i, all) => i % every === 0 || i === all.length - 1);
  } else if (scale.type === 'gradient' && scale.stops) {
    bar = <div style={{ width: 10, height: H, background: `linear-gradient(to top, ${scale.stops.join(',')})`, boxShadow: ring }} />;
    const { min = 0, max = 1 } = scale;
    ticks = Array.from({ length: 5 }, (_, i) => ({ frac: i / 4, v: min + ((max - min) * i) / 4 }));
  }
  if (small && ticks.length > 5) ticks = Array.from({ length: 5 }, (_, i) => ticks[Math.round(i * (ticks.length - 1) / 4)]);
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : Math.abs(v) >= 10 ? String(Math.round(v)) : String(v));
  return (
    <div style={{ fontFamily: RESIPLE, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', gap: 7 }}>
        <div style={{ position: 'relative', width: 26, height: H }}>
          {ticks.map((t) => (
            // edge ticks align inward, so the top and bottom numbers sit beside
            // the bar instead of hanging past its ends
            <span key={`${t.frac}`} style={{ position: 'absolute', right: 0, top: `${(1 - t.frac) * 100}%`, transform: t.frac === 0 ? 'translateY(-100%)' : t.frac === 1 ? 'none' : 'translateY(-50%)', fontSize: 10, color: '#0e141c', textShadow: HALO, whiteSpace: 'nowrap' }}>
              {fmt(t.v)}
            </span>
          ))}
        </div>
        {bar}
      </div>
      {/* caption stays horizontal under the bar, right-aligned to the edge */}
      <div style={{ fontSize: 10, letterSpacing: '0.05em', color: '#0e141c', textShadow: HALO, marginTop: 7, maxWidth: 130, textAlign: 'right' }}>{scale.label}</div>
    </div>
  );
}

const PANEL: React.CSSProperties = {
  background: 'rgba(14,20,28,0.82)', backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255,255,255,0.25)', color: '#e6ecf0', fontFamily: RESIPLE,
};

// hover/focus states can't live in inline styles, so the
// controls are classes. Square everywhere, same dark glass as PANEL.
const CSS = `
.wxview button,.wxview input{-webkit-tap-highlight-color:transparent}
.wxview ::-webkit-scrollbar{display:none}
.wxbox{display:block;min-width:124px;height:44px;max-width:100%;background:#141c26;border:1px solid rgba(255,255,255,.5);color:#e6ecf0;font-family:${RESIPLE};font-size:16px;cursor:pointer;color-scheme:dark}
.wxbox:hover{border-color:rgba(255,255,255,.8)}
.wxview :is(button,select,input):focus-visible{outline:2px solid #e6ecf0;outline-offset:3px}
.wxpickers{display:flex;gap:8px;align-items:flex-start}
.wx-compact .wxpickers{display:grid;grid-template-columns:auto minmax(0,1fr)}
.wx-compact .wxbox{min-width:0;width:100%}
.wx-compact .wx-time-range{height:44px;width:100%}
.wx-compact .wx-time-range::-webkit-slider-thumb{width:24px;height:24px}
@media(max-width:440px){.wx-compact .wxpickers{grid-template-columns:minmax(0,1fr)}}
@media(min-width:480px) and (max-height:500px){
  .wx-compact .wx-time-grid{grid-template-columns:44px minmax(0,1fr) 44px!important}
  .wx-compact .wx-time-grid>button{grid-row:2!important}
  .wx-compact .wx-time-range{grid-column:2!important;grid-row:2!important}
  .wx-compact .wx-time-valid{grid-column:1/-1!important;grid-row:1!important;font-size:12px!important}
  .wx-compact .wx-time-ends{display:none!important}
  .wx-compact .wx-legend{top:84px!important;transform:none!important}
}
`;
// play and Now: one height, one border, so they sit on the slider's line
const BAR_BOX: React.CSSProperties = {
  appearance: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 26,
  padding: 0, border: '1px solid #8fa0ab', color: '#e6ecf0', fontFamily: RESIPLE, fontSize: 10.5,
  letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
};

function Picker({ label, valueId, options, onPick }: {
  label: string; valueId: string;
  options: { id: string; label: string; sub?: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <select className="wxbox" aria-label={label} value={valueId} onChange={(e) => onPick(e.target.value)}>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}{o.sub ? ` (${o.sub})` : ''}</option>)}
    </select>
  );
}

// plain names for the acronyms a visitor won't know; the full source still
// reads out in the map attribution
const GROUP_NAME: Record<string, string> = { MRMS: 'Radar' };

// Cornell's local zone, always - a visitor's own timezone doesn't matter for a
// regional forecast, and every model run is discussed in ET on the team anyway.
const LOCAL_TZ = 'America/New_York';
const fmtZulu = (iso: string) => {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return d.getUTCMinutes() ? `${hh}:${String(d.getUTCMinutes()).padStart(2, '0')}Z` : `${hh}Z`;
};
// every time is ET (see LOCAL_TZ), so no zone name: "Thu 2:00 PM (18Z)"
const fmtValid = (iso: string) =>
  `${new Date(iso).toLocaleString([], { timeZone: LOCAL_TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(',', '')} (${fmtZulu(iso)})`;
// the run time carries the date - a 48-hour HRRR run and a twice-daily
// StormCast scout are both easy to misread without it
const fmtValidDated = (iso: string) =>
  `${new Date(iso).toLocaleString([], { timeZone: LOCAL_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(',', '')} (${fmtZulu(iso)})`;
// slider ends: local time only, the readout carries Zulu. Desktop keeps the
// weekday since a 49-hour run's two ends land on the same hour; phones drop it.
const fmtValidShort = (iso: string, compact = false) =>
  new Date(iso).toLocaleString([], { timeZone: LOCAL_TZ, ...(compact ? {} : { weekday: 'short' as const }), hour: 'numeric', minute: '2-digit' }).replace(',', '');

// Preserve the requested valid time when switching hourly and ten-minute products.
function nearestFrame(frames: { valid: string }[], time: number): number {
  return frames.reduce((best, frame, i) =>
    Math.abs(Date.parse(frame.valid) - time) < Math.abs(Date.parse(frames[best].valid) - time) ? i : best, 0);
}


export default function WeatherForecast() {
  const small = useCompactViewport();
  const [manifest, setManifest] = useState<Manifest | 'loading' | 'error'>('loading');
  const [layerId, setLayerId] = useState<string | null>(null);
  const [requestedTime, setRequestedTime] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [refreshError, setRefreshError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState<{ layer: WxLayer; frame: Frame } | null>(null);
  const [imageError, setImageError] = useState(false);
  // the point probe: click the map to pin it, click the pin to clear it. It
  // survives layer switches and scrubbing, so you can watch one spot evolve.
  const [probe, setProbe] = useState<{ lat: number; lon: number } | null>(null);
  const valueCache = useRef(new Map<string, (number | null)[] | 'pending' | 'failed'>()).current;
  const [, bump] = useState(0);

  useEffect(() => {
    let alive = true;
    let fetching = false;
    const refresh = async () => {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        const m = await fetchManifest();
        if (alive) { setManifest(m); setRefreshError(false); }
      } catch {
        if (alive) {
          setRefreshError(true);
          setManifest(previous => typeof previous === 'object' ? previous : 'error');
        }
      } finally { fetching = false; }
    };
    void refresh();
    const interval = window.setInterval(() => { setNow(Date.now()); void refresh(); }, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, [retry]);

  const layers = typeof manifest === 'object' ? manifest.layers.filter(l =>
    !['stormcast_rain', 'stormcast_precip'].includes(l.id) && l.frames.length > 0)
    .sort((a, b) => Number(b.id.endsWith('refc')) - Number(a.id.endsWith('refc'))) : [];
  const layer = layers.find(l => l.id === layerId) ?? layers.find(l => l.id === 'stormcast_refc') ?? layers.find(l => l.id === 'radar_refc') ?? layers[0] ?? null;
  const groupOf = (l: WxLayer) => l.group ??
    (l.source.includes('MRMS') ? 'MRMS' : l.source.includes('StormScope') ? 'Nowcast' : l.source.includes('StormCast') ? 'StormCast' : 'HRRR');
  const resolvedGroupOrder = (typeof manifest === 'object' && manifest.group_order) || DEFAULT_GROUP_ORDER;
  const groups = [...new Set(layers.map(groupOf))].sort((a, b) => resolvedGroupOrder.indexOf(a) - resolvedGroupOrder.indexOf(b));
  const [openGroup, setOpenGroup] = useState<string | null | undefined>(undefined);
  const shownGroup = openGroup === undefined ? (layer ? groupOf(layer) : null) : openGroup;
  // a source reads "GeoData StormScope <sep> DGX Spark": the model, then the
  // box it ran on. Phones keep the model and drop the hardware credit.
  const sourceLabel = (source: string) => (small ? source.split('\u00b7')[0].trim() : source.replace(/\s*\u00b7\s*/g, ', '));
  const idx = layer ? nearestFrame(layer.frames, requestedTime ?? now) : 0;
  const selectedFrame = layer?.frames[idx];

  // "next 48h" / "past 2h" from the group's own frames, so it never goes stale
  const horizon = (g: string) => {
    const l = layers.find((x) => groupOf(x) === g);
    if (!l || l.frames.length < 2) return undefined;
    const mins = (Date.parse(l.frames[l.frames.length - 1].valid) - Date.parse(l.frames[0].valid)) / 60_000;
    const span = mins >= 90 ? `${Math.round(mins / 60)}h` : `${Math.round(mins)}m`;
    return l.kind === 'obs' ? `past ${span}` : `next ${span}`;
  };

  // basic play/pause: step one frame at a time and loop, off by default and
  // whenever the model/variable changes so switching layers never keeps
  // animating through an unrelated frame set
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setPlaying(false); }, [layerId]);
  useEffect(() => {
    if (!playing || !layer || layer.frames.length <= 1) return;
    const id = window.setTimeout(() => {
      setRequestedTime(Date.parse(layer.frames[(idx + 1) % layer.frames.length].valid));
    }, 700);
    return () => clearTimeout(id);
  }, [playing, layer, idx]);

  useEffect(() => {
    if (!layer || !selectedFrame) return;
    let alive = true;
    setImageError(false);
    const timeout = window.setTimeout(() => { if (alive) setImageError(true); }, 15_000);
    void loadImage(`${WX_BASE}/${selectedFrame.file}`).then(() => {
      if (!alive) return;
      clearTimeout(timeout);
      setImageError(false);
      setReady({ layer, frame: selectedFrame });
      // Only warm the next two frames. A 49-hour layer should not download on selection.
      layer.frames.slice(idx + 1, idx + 3).forEach(f => { void loadImage(`${WX_BASE}/${f.file}`); });
    }).catch(() => { if (alive) setImageError(true); });
    return () => { alive = false; clearTimeout(timeout); };
  }, [layer, selectedFrame, idx, retry]);

  const displayed = ready?.layer.id === layer?.id ? ready : null;
  const overlays: Overlay[] = displayed
    ? [{ url: `${WX_BASE}/${displayed.frame.file}`, bounds: displayed.layer.bounds, opacity: displayed.layer.opacity,
      tiles: displayed.layer.tiles }]
    : [];

  // the map wants a target; the forecast stage just parks on the region
  const target = useRef<MapTarget>({ ...HOME, zoom: small ? 8.2 : 9, nonce: 0 }).current;


  // the number under the probe for the active layer+frame; fetches the frame's
  // value grid on demand and caches it, so scrubbing re-reads instantly
  const valueAt = (lat: number, lon: number): string => {
    const meta = displayed?.layer.values;
    const data = displayed?.frame.data;
    if (!meta || !data) return '–';
    const url = `${WX_BASE}/${data}`;
    const hit = valueCache.get(url);
    if (hit === undefined && valueCache.size > 12) valueCache.delete(valueCache.keys().next().value!);
    if (hit === undefined) {
      valueCache.set(url, 'pending');
      fetch(url)
        .then(readWeatherValues)
        .then((values) => { valueCache.set(url, values); bump((n) => n + 1); })
        .catch(() => { valueCache.set(url, 'failed'); bump((n) => n + 1); });
      return '…';
    }
    if (hit === 'pending') return '…';
    if (hit === 'failed') return '–';
    const row = Math.round(((meta.n - lat) / (meta.n - meta.s)) * (meta.rows - 1));
    const col = Math.round(((lon - meta.w) / (meta.e - meta.w)) * (meta.cols - 1));
    if (row < 0 || row >= meta.rows || col < 0 || col >= meta.cols) return '–';
    const v = hit[row * meta.cols + col];
    return v == null ? '–' : `${v} ${meta.unit}`;
  };

  // the probe rides TileMap's existing pin machinery: a white dot whose
  // always-on label IS the readout
  const probeSites: MapSite[] = probe
    ? [{ id: 'probe', name: valueAt(probe.lat, probe.lon), sub: 'point reading', lat: probe.lat, lon: probe.lon, tone: '#ffffff' }]
    : [];

  return (
    // userSelect none inherits everywhere: no long-press text selection or
    // copy callouts on chips, labels, scales, or the map - it's an app, not a page
    <div className={`wxview${small ? ' wx-compact' : ''}`} style={{ position: 'absolute', inset: 0, background: '#e8e8e6', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <style>{CSS}</style>
      <TileMap
        sites={probeSites}
        selectedIds={probe ? ['probe'] : []}
        onSelect={() => setProbe(null)}
        onPick={(lat, lon) => setProbe({ lat, lon })}
        showLegend={false}
        target={target}
        initial={target}
        dur={1}
        tileUrl={LIGHT_TILES}
        attribution={`Basemap: CARTO${layer ? `. ${sourceLabel(layer.source)}` : ''}`}
        minZ={2}
        maxZ={15}
        overlays={overlays}
        gridBounds={layer?.bounds}
      />

      {/* top-left: model + variable pickers - the run provenance and current
          selection read out in the bar below instead, so this stays small no
          matter how many models/variables we add */}
      <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 'max(12px, env(safe-area-inset-left))', right: small ? 'calc(max(12px, env(safe-area-inset-right)) + 56px)' : undefined, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 7, maxWidth: small ? 460 : 'calc(100% - 110px)' }}>
        {layers.length > 0 && (
          <div className="wxpickers">
            <Picker
              label="Model"
              valueId={shownGroup ?? ''}
              options={groups.map((g) => ({ id: g, label: GROUP_NAME[g] ?? g, sub: horizon(g) }))}
              onPick={(g) => { setOpenGroup(g); setLayerId(layers.find(l => groupOf(l) === g)?.id ?? null); }}
            />
            <Picker
              label="Variable"
              valueId={layer?.id ?? ''}
              options={layers.filter((l) => groupOf(l) === shownGroup).map((l) => ({ id: l.id, label: l.label.replace(new RegExp(`^${groupOf(l)} `), '') }))}
              onPick={setLayerId}
            />
          </div>
        )}
        {(refreshError || imageError) && (
          <div role="status" style={{ fontFamily: RESIPLE, color: '#3d4a55', textShadow: HALO, fontSize: 11 }}>
            {refreshError ? 'Feed refresh failed.' : 'This frame is unavailable.'}{' '}
            <button onClick={() => { valueCache.clear(); setRetry(n => n + 1); }} style={{ appearance: 'none', background: 'none', border: 0, minHeight: 44, padding: '0 8px', color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Retry</button>
          </div>
        )}
        {typeof manifest === 'object' && manifest.status?.degraded && layer && ['Nowcast', 'MRMS'].includes(groupOf(layer)) && (
          <div role="status" style={{ fontFamily: RESIPLE, color: '#3d4a55', textShadow: HALO, fontSize: 11 }}>Live radar input is delayed or incomplete.</div>
        )}
      </div>

      {/* right side: the active layer's colour scale, straight on the map,
          centred vertically now that the launcher opens as a panel, not a
          dropdown that could reach it */}
      {displayed?.layer.scale && (
        <div className="wx-legend" style={{ position: 'absolute', right: 'max(12px, env(safe-area-inset-right))', top: small ? '44%' : '50%', transform: 'translateY(-50%)', zIndex: 4, pointerEvents: 'none' }}>
          <ColorScale small={small} scale={displayed.layer.scale} />
        </div>
      )}

      {/* bottom-center: the timebar. The pickers name the model and variable
          and the attribution names the source, so the top line is only the run time */}
      {layer && (
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'max(12px, env(safe-area-inset-bottom))', zIndex: 4, ...PANEL, padding: '7px 12px 6px', width: 'min(600px, calc(100% - max(24px, env(safe-area-inset-left) + env(safe-area-inset-right))))' }}>
          {layer.init && (
            <div style={{ fontSize: 10, color: '#8fa0ab', marginBottom: 5 }}>
              {layer.kind === 'obs' ? 'Updated' : 'Run'} {fmtValidDated(layer.init)}
              {layer.accumulation_start && `, total since ${fmtValidDated(layer.accumulation_start)}`}
            </div>
          )}
          {layer.frames.length > 1 ? (
            <div className="wx-time-grid" style={{ display: 'grid', gridTemplateColumns: small ? '44px minmax(0, 1fr) auto' : 'auto 1fr auto auto', columnGap: 8, alignItems: 'center' }}>
              <button
                onClick={() => setPlaying((p) => !p)}
                aria-pressed={playing}
                aria-label={playing ? 'Pause animation' : 'Play animation'}
                title={playing ? 'Pause' : 'Play'}
                style={{ ...BAR_BOX, width: small ? 44 : 26, height: small ? 44 : 26, gridColumn: 1, gridRow: 1, background: playing ? 'rgba(255,255,255,0.16)' : 'transparent' }}
              >
                {/* svg, not ▶/❚❚ text: glyphs sit at different heights per font */}
                <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
                  {playing ? <path d="M2 1h2v8H2zM6 1h2v8H6z" /> : <path d="M2 1l7 4-7 4z" />}
                </svg>
              </button>
              <input
                type="range"
                className="wx-time-range"
                min={0}
                max={layer.frames.length - 1}
                step={1}
                value={idx}
                onChange={(e) => { setPlaying(false); setRequestedTime(Date.parse(layer.frames[Number(e.target.value)].valid)); }}
                aria-label="Forecast valid time"
                aria-valuetext={fmtValid(layer.frames[idx].valid)}
                style={{ gridColumn: small ? '1 / -1' : 2, gridRow: small ? 2 : 1, minWidth: 0, margin: 0, accentColor: '#e6ecf0' }}
              />
              {/* fixed width, not auto: the grid's 1fr slider column would
                  otherwise resize with every frame as this string's length changes */}
              <span className="wx-time-valid" style={{ gridColumn: small ? 2 : 3, gridRow: 1, fontSize: small ? 13 : 11.5, whiteSpace: small ? 'normal' : 'nowrap', textAlign: small ? 'center' : 'right', width: small ? undefined : '17ch' }}>{fmtValid(displayed?.frame.valid ?? layer.frames[idx].valid)}</span>
              <button
                onClick={() => { setPlaying(false); setNow(Date.now()); setRequestedTime(null); }}
                aria-pressed={requestedTime === null}
                title="Jump to the current time"
                style={{ ...BAR_BOX, gridColumn: small ? 3 : 4, gridRow: 1, minWidth: small ? 44 : undefined, height: small ? 44 : 26, padding: '0 8px', color: requestedTime === null ? '#0e141c' : '#e6ecf0',
                  background: requestedTime === null ? '#e6ecf0' : 'transparent' }}
              >Now</button>
              {/* aligned to the slider's own grid column, not the row's full width */}
              <div className="wx-time-ends" style={{ gridColumn: small ? '1 / -1' : 2, gridRow: small ? 3 : 2, display: 'flex', justifyContent: 'space-between', fontSize: small ? 11 : 9.5, color: '#a9b7c0', marginTop: 1 }}>
                <span>{fmtValidShort(layer.frames[0].valid, small)}</span>
                <span>{fmtValidShort(layer.frames[layer.frames.length - 1].valid, small)}</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11.5 }}>{fmtValid(layer.frames[0].valid)}</div>
          )}
        </div>
      )}

      {(manifest === 'error' || (typeof manifest === 'object' && layers.length === 0)) && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 4, fontFamily: RESIPLE, color: '#3d4a55', textShadow: HALO, fontSize: 13 }}>
          The forecast feed could not be loaded. Retrying automatically.
        </div>
      )}
    </div>
  );
}
