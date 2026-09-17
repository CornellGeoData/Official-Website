import { useEffect, useRef, useState } from 'react';
import TileMap, { type MapTarget, type Overlay } from './TileMap';
import type { MapSite } from './sensorData';
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
const INITIAL_SMALL = window.matchMedia('(max-width: 720px)').matches;
const HOME = { lat: 42.75, lon: -76.6, zoom: INITIAL_SMALL ? 8.2 : 9 };

// fallback when the manifest doesn't publish its own group_order
const DEFAULT_GROUP_ORDER = ['StormCast', 'Nowcast', 'MRMS', 'HRRR'];

// the key sits straight on the map - no card. Black ink with a white halo
// reads on the light basemap and any overlay alike. Vertical, highest value
// at the top, numbers inboard of the bar.
const HALO = '0 0 4px rgba(255,255,255,0.95), 0 0 2px rgba(255,255,255,0.9)';
function ColorScale({ scale, small }: { scale: Scale; small: boolean }) {
  // the bar shrinks on short windows so the key clears the launcher button
  // above and the timebar below
  const H = Math.max(160, Math.min(small ? 230 : 300, window.innerHeight - 260));
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
    const every = scale.bounds.length > 12 ? 2 : 1;
    ticks = scale.bounds.map((v, i) => ({ frac: i / n, v })).filter((_, i) => i % every === 0);
  } else if (scale.type === 'gradient' && scale.stops) {
    bar = <div style={{ width: 10, height: H, background: `linear-gradient(to top, ${scale.stops.join(',')})`, boxShadow: ring }} />;
    const { min = 0, max = 1 } = scale;
    ticks = Array.from({ length: 5 }, (_, i) => ({ frac: i / 4, v: min + ((max - min) * i) / 4 }));
  }
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

// the "MODEL"/"VARIABLE" caption box is the dropdown trigger, styled exactly
// like every option box. The current selection sits below it, always
// visible, in the same style; opening the dropdown adds the *other* options
// underneath that - the selected box never duplicates into the list.
function PickerColumn({ label, value, valueId, options, open, onToggle, onPick }: {
  label: string; value: string; valueId: string;
  options: { id: string; label: string }[];
  open: boolean; onToggle: () => void; onPick: (id: string) => void;
}) {
  const box = (active: boolean): React.CSSProperties => ({
    ...PANEL, cursor: 'pointer', padding: '7px 11px', minWidth: 132, minHeight: 34,
    fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left',
    // flex, not block: a <div> box would sit its text on the top padding
    // while the <button> boxes centre theirs, and the row would look off
    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center',
    ...(active ? { background: '#e6ecf0', color: '#0e141c', border: '1px solid #0e141c' } : {}),
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button onClick={onToggle} aria-expanded={open} style={box(false)}>{label} {open ? '▴' : '▾'}</button>
      <div style={{ ...box(true), cursor: 'default' }}>{value}</div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {options.filter((o) => o.id !== valueId).map((o) => (
            <button key={o.id} onClick={() => onPick(o.id)} style={box(false)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Cornell's local zone, always - a visitor's own timezone doesn't matter for a
// regional forecast, and every model run is discussed in ET on the team anyway.
const LOCAL_TZ = 'America/New_York';
const fmtZulu = (iso: string) => {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return d.getUTCMinutes() ? `${hh}:${String(d.getUTCMinutes()).padStart(2, '0')}Z` : `${hh}Z`;
};
// e.g. "Thu 2:00 PM EDT (18Z)" - the short form drops the weekday for the
// narrow range-end labels under the slider, which still need both zones.
const fmtValid = (iso: string) =>
  `${new Date(iso).toLocaleString([], { timeZone: LOCAL_TZ, weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).replace(',', '')} (${fmtZulu(iso)})`;
// the run provenance carries the date too - a 48-hour HRRR run and a
// twice-daily StormCast scout are both easy to misread without it
const fmtValidDated = (iso: string) =>
  `${new Date(iso).toLocaleString([], { timeZone: LOCAL_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).replace(',', '')} (${fmtZulu(iso)})`;
// compact drops the weekday and the "EDT" abbreviation - there's only
// ~140px under the slider on a phone. Desktop keeps the weekday: a 49-hour
// HRRR run's two ends land on the same hour two days apart, which reads as
// identical without it.
const fmtValidShort = (iso: string, compact = false) =>
  `${new Date(iso).toLocaleString([], { timeZone: LOCAL_TZ, ...(compact ? {} : { weekday: 'short' as const }), hour: 'numeric', minute: '2-digit', timeZoneName: compact ? undefined : 'short' }).replace(',', '')} (${fmtZulu(iso)})`;

// Preserve the requested valid time when switching hourly and ten-minute products.
function nearestFrame(frames: { valid: string }[], time: number): number {
  return frames.reduce((best, frame, i) =>
    Math.abs(Date.parse(frame.valid) - time) < Math.abs(Date.parse(frames[best].valid) - time) ? i : best, 0);
}

function freshness(layer: WxLayer, now: number): string | null {
  const end = Date.parse(layer.valid_until ?? layer.frames[layer.frames.length - 1]?.valid ?? '');
  if (layer.kind === 'forecast' && now > end) return 'Forecast ended';
  const due = layer.expected_update_at ? Date.parse(layer.expected_update_at)
    : Date.parse(layer.init ?? layer.frames[0]?.valid ?? '') + layer.stale_minutes * 60_000;
  return layer.kind === 'obs' && now > due ? 'Radar delayed' : null;
}

export default function WeatherForecast() {
  const [small, setSmall] = useState(INITIAL_SMALL);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const resize = () => setSmall(media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
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
  const idx = layer ? nearestFrame(layer.frames, requestedTime ?? now) : 0;
  const selectedFrame = layer?.frames[idx];

  // the Model/Variable picker columns: only one unfolds at a time, and a
  // click anywhere outside them folds whichever is open, like a native select
  const [openPicker, setOpenPicker] = useState<'model' | 'variable' | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openPicker) return;
    const onDown = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpenPicker(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [openPicker]);

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
  const stale = layer ? freshness(layer, now) : null;

  // the map wants a target; the forecast stage just parks on the region
  const target = useRef<MapTarget>({ ...HOME, nonce: 0 }).current;

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
    <div className="wxview" style={{ position: 'absolute', inset: 0, background: '#e8e8e6', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <style>{'.wxview button, .wxview input{-webkit-tap-highlight-color:transparent}.wxview ::-webkit-scrollbar{display:none}'}</style>
      <TileMap
        sites={probeSites}
        selectedIds={probe ? ['probe'] : []}
        onSelect={() => setProbe(null)}
        onPick={(lat, lon) => setProbe({ lat, lon })}
        showLegend={false}
        target={target}
        initial={HOME}
        dur={1}
        tileUrl={LIGHT_TILES}
        attribution={`Basemap: CARTO${layer ? `. ${layer.source.replace(/\s*·\s*/g, ', ')}` : ''}`}
        minZ={2}
        maxZ={15}
        overlays={overlays}
        gridBounds={layer?.bounds}
      />

      {/* top-left: model + variable pickers - the run provenance and current
          selection read out in the bar below instead, so this stays small no
          matter how many models/variables we add */}
      <div style={{ position: 'absolute', top: small ? 18 : 24, left: small ? 12 : 24, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 7, maxWidth: small ? 'calc(100vw - 74px)' : 'calc(100% - 110px)' }}>
        {layers.length > 0 && (
          <div ref={pickerRef} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <PickerColumn
              label="Model"
              value={shownGroup ?? ''}
              valueId={shownGroup ?? ''}
              options={groups.map((g) => ({ id: g, label: g }))}
              open={openPicker === 'model'}
              onToggle={() => setOpenPicker(openPicker === 'model' ? null : 'model')}
              onPick={(g) => { setOpenGroup(g); setLayerId(layers.find(l => groupOf(l) === g)?.id ?? null); setOpenPicker(null); }}
            />
            <PickerColumn
              label="Variable"
              value={layer ? layer.label.replace(new RegExp(`^${groupOf(layer)} `), '') : ''}
              valueId={layer?.id ?? ''}
              options={layers.filter((l) => groupOf(l) === shownGroup).map((l) => ({ id: l.id, label: l.label.replace(new RegExp(`^${groupOf(l)} `), '') }))}
              open={openPicker === 'variable'}
              onToggle={() => setOpenPicker(openPicker === 'variable' ? null : 'variable')}
              onPick={(id) => { setLayerId(id); setOpenPicker(null); }}
            />
          </div>
        )}
        {(refreshError || imageError) && (
          <div role="status" style={{ fontFamily: RESIPLE, color: '#3d4a55', textShadow: HALO, fontSize: 11 }}>
            {refreshError ? 'Feed refresh failed.' : 'This frame is unavailable.'}{' '}
            <button onClick={() => { valueCache.clear(); setRetry(n => n + 1); }} style={{ appearance: 'none', background: 'none', border: 0, color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>Retry</button>
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
        <div style={{ position: 'absolute', right: small ? 14 : 26, top: '50%', transform: 'translateY(-50%)', zIndex: 4, pointerEvents: 'none' }}>
          <ColorScale small={small} scale={displayed.layer.scale} />
        </div>
      )}

      {/* bottom-center: the timebar - now also where the current model/variable
          and its run provenance read out, so the top-left picker can stay tiny */}
      {layer && (
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: small ? 30 : 34, zIndex: 4, ...PANEL, padding: '10px 18px 12px', width: 'min(720px, calc(100vw - 32px))' }}>
          {/* the picker already names the model and variable - this line is
              just where the run came from and when it started */}
          <div style={{ fontSize: 10.5, letterSpacing: '0.02em', color: stale ? '#e0a94a' : '#9fb0ba', marginBottom: 8 }}>
            {layer.kind === 'obs' ? 'Observed: NOAA MRMS radar' : `Forecast: ${layer.source.replace(/\s*·\s*/g, ', ')}`}
            {layer.init ? `, ${layer.kind === 'obs' ? 'observed' : 'initialized'} ${fmtValidDated(layer.init)}` : ''}
            {stale && <strong style={{ color: '#e0a94a' }}> · {stale}</strong>}
            {layer.accumulation_start && <span> · Accumulated from {fmtValidDated(layer.accumulation_start)}</span>}
          </div>
          {layer.frames.length > 1 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', columnGap: 12, alignItems: 'center' }}>
              <button
                onClick={() => setPlaying((p) => !p)}
                aria-pressed={playing}
                aria-label={playing ? 'Pause animation' : 'Play animation'}
                title={playing ? 'Pause' : 'Play through the forecast'}
                style={{ appearance: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 32, minHeight: 32, padding: 0, fontSize: 13, color: '#e6ecf0',
                  background: playing ? 'rgba(255,255,255,0.16)' : 'transparent', border: '1px solid #8fa0ab', cursor: 'pointer' }}
              >{playing ? '❚❚' : '▶'}</button>
              <input
                type="range"
                min={0}
                max={layer.frames.length - 1}
                step={1}
                value={idx}
                onChange={(e) => { setPlaying(false); setRequestedTime(Date.parse(layer.frames[Number(e.target.value)].valid)); }}
                aria-label="Forecast valid time"
                aria-valuetext={fmtValid(layer.frames[idx].valid)}
                style={{ gridColumn: 2, minWidth: 0, accentColor: '#e6ecf0' }}
              />
              <button
                onClick={() => { setPlaying(false); setNow(Date.now()); setRequestedTime(null); }}
                aria-pressed={requestedTime === null}
                title="Show the forecast nearest the current time"
                style={{ appearance: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  minHeight: 32, padding: '5px 10px', fontFamily: RESIPLE, fontSize: 11, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: requestedTime === null ? '#0e141c' : '#e6ecf0',
                  background: requestedTime === null ? '#e6ecf0' : 'transparent', border: '1px solid #8fa0ab', cursor: 'pointer' }}
              >Now</button>
              {/* fixed width, not auto: the grid's 1fr slider column would
                  otherwise resize with every frame as this string's length changes */}
              <span style={{ fontSize: 12, whiteSpace: 'nowrap', textAlign: 'right', width: small ? '17ch' : '19ch' }}>{fmtValid(displayed?.frame.valid ?? layer.frames[idx].valid)}</span>
              {/* aligned to the slider's own grid column, not the row's full width */}
              <div style={{ gridColumn: 2, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8fa0ab', marginTop: 3 }}>
                <span>{fmtValidShort(layer.frames[0].valid, small)}</span>
                <span>{fmtValidShort(layer.frames[layer.frames.length - 1].valid, small)}</span>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12 }}>{fmtValid(layer.frames[0].valid)}</div>
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
