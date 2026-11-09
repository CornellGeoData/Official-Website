// Building Energy stage: campus building footprints shaded by how far each day's
// electricity forecast was from the metered load, with a year-long timeline and a
// per-building chart of forecast vs actual.
//
// Data: public/energy/buildings.json, written by the ColdSnaps project
// (scripts/export_building_map.py --json-out). Forecasts are rolling backtests
// issued every 7 days over Aug 2025 - Jul 2026; for each day the file keeps the
// most recent forecast (1-7 days ahead). Footprints are OpenStreetMap buildings.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import TileMap, { type MapTarget } from './TileMap';
import { lonToX, latToY, yToLat } from './mercator';
import { RESIPLE } from '../../styles/theme';
import { PANEL } from './wxUi';
import { useCompactViewport } from './useCompactViewport';

type Series = (number | null)[];
interface Model { key: string; label: string; band: boolean }
interface Building {
  id: string; name: string; type: string;
  lat: number | null; lon: number | null; precision: string; source: string;
  mean: number;
  // MultiPolygon as Leaflet-style [lat, lon] rings: polygons -> rings -> points
  shape: [number, number][][][] | null;
  y: Series;
  p: Record<string, Series>; lo: Record<string, Series>; hi: Record<string, Series>;
  wape: Record<string, number | null>;
}
interface EnergyData { start: string; n: number; temp: Series; models: Model[]; buildings: Building[] }

const ATTRIBUTION = 'Imagery: Esri, Maxar, Earthstar Geographics. Footprints: © OpenStreetMap contributors';
const INK = '#e6ecf0';
const DIM = '#a9bcc6';
const MUTED = '#7f909b';
const LINE = 'rgba(255,255,255,0.18)';
const SLATE = '#141c26';
// diverging error scale: forecast too low (blue) -> on target (grey) -> too high (red)
const UNDER = [79, 141, 253];
const MID = [154, 160, 168];
const OVER = [255, 107, 91];
const PRED = '#f2c14e';
const BAND = 'rgba(242,193,78,0.2)';
const COLD_TONE = '#7fb2ff';
const COLD_F = 20;
const ERR_SPAN = 20; // % at which the colour saturates

const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`;
const errColor = (e: number) => {
  const t = Math.max(-1, Math.min(1, e / ERR_SPAN));
  return t < 0 ? mix(MID, UNDER, -t) : mix(MID, OVER, t);
};
const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;
const fmtKW = (v: number | null | undefined) =>
  v == null ? '–' : v >= 1000 ? `${(v / 1000).toFixed(2)} MW` : v >= 100 ? String(Math.round(v)) : v.toFixed(1);

const BTN: CSSProperties = {
  appearance: 'none', cursor: 'pointer', height: 44, boxSizing: 'border-box', padding: '0 14px',
  border: '1px solid rgba(255,255,255,.5)', background: SLATE, color: INK, fontFamily: RESIPLE, fontSize: 15,
};
const LABEL: CSSProperties = { fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: MUTED };
const NUM: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

function inRing(lat: number, lon: number, ring: [number, number][]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [y1, x1] = ring[i], [y2, x2] = ring[j];
    if ((y1 > lat) !== (y2 > lat) && lon < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}
// even-odd across rings, so courtyards (inner rings) don't count
const inShape = (lat: number, lon: number, shape: [number, number][][][]) =>
  shape.some((poly) => poly.reduce((c, ring) => (inRing(lat, lon, ring) ? !c : c), false));

export default function BuildingEnergy() {
  const small = useCompactViewport();
  const [data, setData] = useState<EnergyData | 'loading' | 'error'>('loading');
  const [day, setDay] = useState(0);
  const [model, setModel] = useState('timesfm_weather');
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [about, setAbout] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [target, setTarget] = useState<MapTarget | null>(null);
  const viewRef = useRef<{ lat: number; lon: number; zoom: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/energy/buildings.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: EnergyData) => {
        if (!alive) return;
        setData(d);
        if (!d.models.some((m) => m.key === 'timesfm_weather')) setModel(d.models[0].key);
        // open on the third day of the longest cold snap - the story worth seeing first
        const snaps = coldSnaps(d.temp);
        const longest = snaps.slice().sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
        setDay(longest ? Math.min(longest[0] + 3, d.n - 1) : d.n - 1);
      })
      .catch(() => alive && setData('error'));
    return () => { alive = false; };
  }, []);

  const ready = typeof data === 'object' ? data : null;
  const buildings = ready?.buildings ?? [];
  const mapped = useMemo(() => buildings.filter((b) => b.shape), [buildings]);
  const snaps = useMemo(() => (ready ? coldSnaps(ready.temp) : []), [ready]);

  // frame every footprint once the data and the window size are known
  const home = useMemo(() => {
    if (!mapped.length) return null;
    const pts = mapped.flatMap((b) => b.shape![0][0]);
    const s = Math.min(...pts.map((p) => p[0])), n = Math.max(...pts.map((p) => p[0]));
    const w = Math.min(...pts.map((p) => p[1])), e = Math.max(...pts.map((p) => p[1]));
    const dx = lonToX(e, 0) - lonToX(w, 0), y0 = latToY(n, 0), y1 = latToY(s, 0);
    const W = window.innerWidth, H = window.innerHeight;
    const zoom = Math.log2(Math.min((W - (small ? 32 : 120)) / dx, (H - (small ? 260 : 300)) / (y1 - y0)));
    return { lat: yToLat((y0 + y1) / 2 + (small ? 0 : 0.02 * (y1 - y0)), 0), lon: (w + e) / 2, zoom: Math.min(17, zoom) };
  }, [mapped, small]);
  useEffect(() => { if (home) setTarget({ ...home, nonce: 1 }); }, [home]);

  // playback: about eight days a second
  useEffect(() => {
    if (!playing || !ready) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setInterval(() => setDay((d) => {
      if (d >= ready.n - 1) { setPlaying(false); return d; }
      return d + 1;
    }), reduced ? 400 : 120);
    return () => clearInterval(t);
  }, [playing, ready]);

  const errOf = (b: Building, i: number) => {
    const y = b.y[i], p = b.p[model]?.[i];
    return y == null || p == null || y <= 0 ? null : ((p - y) / y) * 100;
  };

  const select = (id: string | null, fly: boolean) => {
    setSelected(id);
    setAbout(false);
    const b = id ? buildings.find((x) => x.id === id) : null;
    if (fly && b?.lat != null && b.lon != null) {
      setTarget((t) => ({ lat: b.lat!, lon: b.lon!, zoom: Math.max(viewRef.current?.zoom ?? 16, 17), nonce: (t?.nonce ?? 0) + 1 }));
    }
  };

  const totals = useMemo(() => {
    if (!ready) return null;
    let ya = 0, pa = 0, n = 0;
    for (const b of buildings) {
      const y = b.y[day], p = b.p[model]?.[day];
      if (y != null && p != null) { ya += y; pa += p; n++; }
    }
    return n ? { ya, pa, n } : null;
  }, [ready, buildings, day, model]);

  if (!ready) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#0e141c', fontFamily: RESIPLE, color: DIM, padding: 24, textAlign: 'center' }}>
        {data === 'error' ? 'The building forecasts did not load. Reload the page to try again.' : 'Loading building forecasts…'}
      </div>
    );
  }

  const sel = selected ? buildings.find((b) => b.id === selected) ?? null : null;
  const hovered = hover ? buildings.find((b) => b.id === hover.id) : null;
  const t = ready.temp[day];
  const modelInfo = ready.models.find((m) => m.key === model)!;
  const edge = 'max(12px, env(safe-area-inset-left))';
  const edgeR = 'max(12px, env(safe-area-inset-right))';
  const bottom = 'max(12px, env(safe-area-inset-bottom))';
  const wide = !small && window.innerWidth > 1100;

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: RESIPLE, color: INK, userSelect: 'none', WebkitUserSelect: 'none' }}>
      {target && (
        <TileMap
          sites={[]}
          selectedIds={[]}
          onSelect={() => {}}
          target={target}
          initial={home ? { ...home, zoom: home.zoom - 2 } : undefined}
          onView={(v) => { viewRef.current = v; }}
          attribution={ATTRIBUTION}
          minZ={13}
          maxZ={19}
          onPick={(lat, lon) => {
            const hit = mapped.find((b) => inShape(lat, lon, b.shape!));
            select(hit ? (hit.id === selected ? null : hit.id) : null, false);
          }}
          vectorLayer={(project, size) => (
            <svg width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden="true">
              {mapped.map((b) => {
                const d = b.shape!.map((poly) => poly.map((ring) => 'M' + ring.map(([la, lo]) => {
                  const p = project(la, lo);
                  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                }).join('L') + 'Z').join('')).join('');
                const e = errOf(b, day), on = b.id === selected;
                return (
                  <path key={b.id} d={d} fillRule="evenodd"
                    fill={e == null ? 'rgba(169,188,198,0.15)' : errColor(e)}
                    fillOpacity={e == null ? 1 : 0.82}
                    stroke={on ? PRED : e == null ? DIM : '#ffffff'}
                    strokeWidth={on ? 3 : e == null ? 1.5 : 0.8}
                    strokeDasharray={e == null && !on ? '3 3' : undefined}
                    style={{ cursor: 'pointer' }}
                    onPointerMove={(ev) => {
                      if (ev.pointerType !== 'mouse') return;
                      const r = rootRef.current!.getBoundingClientRect();
                      setHover({ id: b.id, x: ev.clientX - r.left, y: ev.clientY - r.top });
                    }}
                    onPointerLeave={() => setHover(null)}
                  />
                );
              })}
            </svg>
          )}
        />
      )}

      {/* hover label */}
      {hovered && hover && (
        <div style={{ ...PANEL, position: 'absolute', left: hover.x + 14, top: hover.y + 14, padding: '6px 9px', fontSize: 13, pointerEvents: 'none', zIndex: 4, whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 700 }}>{hovered.name}</div>
          <div style={{ color: DIM, ...NUM }}>
            {errOf(hovered, day) == null ? 'No meter data this day'
              : `Actual ${fmtKW(hovered.y[day])} kW, forecast ${fmtKW(hovered.p[model][day])} kW (${pct(errOf(hovered, day)!)})`}
          </div>
        </div>
      )}

      {/* ---- top-left: finder, model, about ---- */}
      <div style={{ position: 'absolute', top: small ? 'max(22px, env(safe-area-inset-top))' : 'max(12px, env(safe-area-inset-top))', left: edge, zIndex: 3, display: 'flex', flexDirection: 'column', gap: 8, width: small ? 'calc(100% - 92px)' : 320 }}>
        <Finder buildings={buildings} onChoose={(id) => select(id, true)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Forecast model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} style={{ ...BTN, width: '100%', height: 38, fontSize: 14, paddingRight: 30, appearance: 'none' }}>
              {ready.models.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <Chevron style={{ right: 12, top: 15 }} />
          </label>
          <button onClick={() => setAbout((a) => !a)} aria-expanded={about} style={{ ...BTN, height: 38, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: DIM }}>About</button>
        </div>
        {about && (
          <div style={{ ...PANEL, padding: 14, display: 'grid', gap: 9, fontSize: 13, lineHeight: 1.55, color: DIM, maxHeight: '55dvh', overflowY: 'auto', userSelect: 'text' }}>
            <div style={{ color: INK, fontWeight: 700, fontSize: 15 }}>Campus building load forecasts</div>
            <p style={{ margin: 0 }}>Each building is shaded by how far the forecast for the selected day was from its metered electricity use. Blue means the forecast was too low, red means too high.</p>
            <p style={{ margin: 0 }}>Forecasts are backtests issued every 7 days from Aug 2025 to Jul 2026. For each day the map shows the most recent forecast, made 1 to 7 days ahead with the weather forecast available at the time. Ranges are 80% forecast intervals.</p>
            <p style={{ margin: 0 }}>Load is the daily mean in kW. Temperature is the campus daily mean in °F; cold days average 20 °F or below.</p>
            <p style={{ margin: 0 }}>{mapped.length} buildings are matched to OpenStreetMap footprints. The other {buildings.length - mapped.length} have no footprint yet; find them with the search box.</p>
          </div>
        )}
      </div>

      {/* ---- legend ---- */}
      {!small && (
        <div style={{ ...PANEL, position: 'absolute', zIndex: 2, left: edge, ...(wide ? { bottom } : { top: about ? undefined : 120, bottom: about ? bottom : undefined }), padding: '10px 12px', width: 220, display: 'grid', gap: 6 }}>
          <span style={LABEL}>Forecast vs actual</span>
          <Ramp />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: DIM }}>
            <span style={{ width: 12, height: 10, border: `1.5px dashed ${DIM}`, boxSizing: 'border-box' }} />No meter data that day
          </div>
        </div>
      )}

      {/* ---- timeline ---- */}
      {!(small && sel) && (
        <div style={{
          // desktop: lifted clear of the imagery credit along the bottom-right edge
          ...PANEL, position: 'absolute', zIndex: 2, bottom: small ? 'max(26px, calc(env(safe-area-inset-bottom) + 14px))' : 'max(34px, calc(env(safe-area-inset-bottom) + 22px))', padding: '10px 14px 12px', boxSizing: 'border-box', display: 'grid', gap: 8,
          ...(wide ? { left: '50%', transform: 'translateX(-50%)', width: 'min(720px, calc(100% - 520px))' } : { left: edge, right: edgeR }),
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{fmtLong(ready.start, day)}{t != null ? `, ${Math.round(t)} °F` : ''}</span>
            <span style={{ fontSize: 12, color: DIM, ...NUM }}>
              {totals ? `Campus: actual ${(totals.ya / 1000).toFixed(2)} MW, forecast ${(totals.pa / 1000).toFixed(2)} MW (${pct(((totals.pa - totals.ya) / totals.ya) * 100)})` : 'No meter data this day'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => { if (!playing && day >= ready.n - 1) setDay(0); setPlaying((p) => !p); }} aria-label={playing ? 'Pause' : 'Play'}
              style={{ ...BTN, width: 38, height: 38, padding: 0, display: 'grid', placeItems: 'center', flex: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill={INK} aria-hidden="true">
                {playing ? <><rect x="2" y="1" width="3.5" height="12" /><rect x="8.5" y="1" width="3.5" height="12" /></> : <path d="M2 1l11 6-11 6z" />}
              </svg>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TempStrip temp={ready.temp} day={day} onPick={(i) => { setPlaying(false); setDay(i); }} />
              <input type="range" min={0} max={ready.n - 1} value={day} aria-label="Day"
                onChange={(e) => { setPlaying(false); setDay(+e.target.value); }}
                style={{ width: '100%', margin: '4px 0 0', accentColor: INK }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: MUTED }}>
            {small ? <div style={{ flex: '1 1 160px', display: 'grid', gap: 3 }}><Ramp /></div>
              : <span>Strip: daily mean temperature, <span style={{ color: COLD_TONE }}>cold days ≤ 20 °F</span></span>}
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {snaps.map(([a, b]) => (
                <button key={a} onClick={() => { setPlaying(false); setDay(a); }}
                  style={{ appearance: 'none', cursor: 'pointer', border: `1px solid ${LINE}`, background: 'transparent', color: DIM, fontFamily: RESIPLE, fontSize: 12, padding: '3px 8px' }}>
                  {small ? fmtShort(ready.start, a) : `Cold snap ${fmtShort(ready.start, a)}${b > a ? `–${fmtShort(ready.start, b)}` : ''}`}
                </button>
              ))}
            </span>
          </div>
        </div>
      )}

      {/* ---- building detail ---- */}
      {sel && (
        <div style={{
          ...PANEL, position: 'absolute', zIndex: 3, boxSizing: 'border-box', padding: 16, display: 'grid', gap: 14, overflowY: 'auto',
          ...(small
            ? { left: 0, right: 0, bottom: 0, maxHeight: '64dvh', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }
            : { top: 68, right: edgeR, width: 430, maxHeight: wide ? 'calc(100dvh - 80px)' : 'calc(100dvh - 300px)' }),
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}>{sel.name}</div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{sel.type}, averages {fmtKW(sel.mean)}{sel.mean >= 1000 ? '' : ' kW'}</div>
            </div>
            <button onClick={() => select(null, false)} aria-label="Close building details" style={{ ...BTN, width: 38, height: 38, padding: 11, flex: 'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>
            </button>
          </div>
          {small && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <button onClick={() => setDay((d) => Math.max(0, d - 1))} aria-label="Previous day" style={{ ...BTN, height: 34, padding: '0 12px' }}>‹</button>
              <span style={{ fontSize: 14 }}>{fmtLong(ready.start, day)}{t != null ? `, ${Math.round(t)} °F` : ''}</span>
              <button onClick={() => setDay((d) => Math.min(ready.n - 1, d + 1))} aria-label="Next day" style={{ ...BTN, height: 34, padding: '0 12px' }}>›</button>
            </div>
          )}
          <Stats b={sel} day={day} model={modelInfo} start={ready.start} err={errOf(sel, day)} />
          <DetailChart b={sel} model={modelInfo} data={ready} day={day} onPick={(i) => { setPlaying(false); setDay(i); }} />
          <p style={{ margin: 0, fontSize: 12, color: sel.shape ? MUTED : PRED, lineHeight: 1.5 }}>
            {sel.shape ? `Footprint: ${sel.source.replace(/^OSM: /, 'OpenStreetMap, ')}.` : "No footprint matched for this building, so it isn't drawn on the map."}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------- helpers ----------

function coldSnaps(temp: Series) {
  const out: [number, number][] = [];
  for (let i = 0, run = 0; i <= temp.length; i++) {
    const v = temp[i];
    if (i < temp.length && v != null && v <= COLD_F) run++;
    else { if (run >= 3) out.push([i - run, i - 1]); run = 0; }
  }
  return out;
}

const dayMs = (start: string, i: number) => Date.parse(`${start}T00:00:00Z`) + i * 864e5;
const fmtLong = (start: string, i: number) =>
  new Date(dayMs(start, i)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtShort = (start: string, i: number) =>
  new Date(dayMs(start, i)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Chevron({ style }: { style: CSSProperties }) {
  return <span aria-hidden="true" style={{ position: 'absolute', width: 7, height: 7, borderRight: `2px solid ${DIM}`, borderBottom: `2px solid ${DIM}`, transform: 'rotate(45deg)', pointerEvents: 'none', ...style }} />;
}

function Ramp() {
  return (
    <>
      <div style={{ height: 8, background: `linear-gradient(90deg, rgb(${UNDER}), rgb(${MID}), rgb(${OVER}))` }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: DIM }}>
        <span>−{ERR_SPAN}% too low</span><span>0</span><span>+{ERR_SPAN}% too high</span>
      </div>
    </>
  );
}

function Finder({ buildings, onChoose }: { buildings: Building[]; onChoose: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const sorted = useMemo(() => buildings.slice().sort((a, b) => a.name.localeCompare(b.name)), [buildings]);
  const shown = sorted.filter((b) => !q || b.name.toLowerCase().includes(q.toLowerCase()) || b.type.toLowerCase().includes(q.toLowerCase()));
  const choose = (b: Building) => { setOpen(false); setQ(''); (document.activeElement as HTMLElement | null)?.blur(); onChoose(b.id); };
  return (
    <div style={{ position: 'relative' }}>
      <input value={q} placeholder="Find a building" role="combobox" aria-expanded={open} aria-controls="energy-results" aria-label="Find a building" autoComplete="off"
        aria-activedescendant={active >= 0 ? `energy-opt-${active}` : undefined}
        onFocus={() => { setActive(-1); setOpen(true); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); setOpen(true);
            setActive((a) => Math.max(0, Math.min(shown.length - 1, a + (e.key === 'ArrowDown' ? 1 : -1))));
          } else if (e.key === 'Enter' && shown[Math.max(active, 0)]) choose(shown[Math.max(active, 0)]);
          else if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
        }}
        className="energy-find"
        style={{ ...BTN, width: '100%', fontSize: 16, fontWeight: 700, paddingRight: 40, cursor: 'text', userSelect: 'text' }} />
      <style>{'.energy-find::placeholder{color:#e6ecf0;opacity:1}'}</style>
      <Chevron style={{ right: 16, top: 16 }} />
      {open && (
        <ul id="energy-results" role="listbox" style={{ position: 'absolute', top: 46, left: 0, right: 0, maxHeight: 'min(360px, 55dvh)', overflowY: 'auto', margin: 0, padding: '4px 0', listStyle: 'none', background: SLATE, border: '1px solid rgba(255,255,255,.5)', zIndex: 5 }}>
          {shown.length ? shown.map((b, k) => (
            <li key={b.id} id={`energy-opt-${k}`} role="option" aria-selected={k === active}
              ref={(el) => { if (el && k === active) el.scrollIntoView({ block: 'nearest' }); }}
              onMouseDown={(e) => { e.preventDefault(); choose(b); }}
              onMouseEnter={() => setActive(k)}
              style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10, background: k === active ? '#232e3b' : 'transparent', fontSize: 14 }}>
              <span>{b.name}</span>
              <span style={{ color: MUTED, fontSize: 12, whiteSpace: 'nowrap' }}>{b.shape ? b.type : 'not on map'}</span>
            </li>
          )) : <li style={{ padding: '8px 14px', color: MUTED, fontSize: 13 }}>No building matches “{q}”</li>}
        </ul>
      )}
    </div>
  );
}

function TempStrip({ temp, day, onPick }: { temp: Series; day: number; onPick: (i: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c || !w) return;
    const h = 26, dpr = window.devicePixelRatio || 1, n = temp.length;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const vals = temp.filter((v): v is number => v != null);
    const lo = Math.min(...vals), hi = Math.max(...vals), bw = w / n;
    temp.forEach((v, i) => {
      if (v == null) return;
      const bh = 3 + ((h - 3) * (hi - v)) / (hi - lo); // taller = colder
      g.fillStyle = v <= COLD_F ? COLD_TONE : 'rgba(255,255,255,0.22)';
      g.fillRect(i * bw, h - bh, Math.max(bw - 0.4, 0.6), bh);
    });
    g.fillStyle = INK;
    g.fillRect((day + 0.5) * bw - 1, 0, 2, h);
  }, [temp, day, w]);
  return (
    <canvas ref={ref} aria-hidden="true" style={{ display: 'block', width: '100%', height: 26, cursor: 'pointer' }}
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onPick(Math.floor(((e.clientX - r.left) / r.width) * temp.length)); }} />
  );
}

function Stats({ b, day, model, start, err }: { b: Building; day: number; model: Model; start: string; err: number | null }) {
  const lo = model.band ? b.lo[model.key]?.[day] : null, hi = model.band ? b.hi[model.key]?.[day] : null;
  const w = b.wape[model.key];
  const cell: CSSProperties = { background: SLATE, padding: '8px 10px', display: 'grid', gap: 2, minWidth: 0 };
  const v: CSSProperties = { fontSize: 17, ...NUM };
  const s: CSSProperties = { fontSize: 12, color: MUTED };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: LINE, border: `1px solid ${LINE}` }}>
      <div style={cell}><span style={LABEL}>Actual</span><span style={v}>{fmtKW(b.y[day])}</span><span style={s}>{fmtShort(start, day)}, kW</span></div>
      <div style={cell}><span style={LABEL}>Forecast</span><span style={v}>{fmtKW(b.p[model.key]?.[day])}</span>
        <span style={s}>{err == null ? 'kW' : `${pct(err)}${lo != null && hi != null ? `, ${fmtKW(lo)}–${fmtKW(hi)}` : ''}`}</span></div>
      <div style={cell}><span style={LABEL}>Year error</span><span style={v}>{w == null ? '–' : `${w.toFixed(1)}%`}</span><span style={s}>WAPE, {model.label}</span></div>
    </div>
  );
}

function niceTicks(lo: number, hi: number, n: number) {
  const step0 = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(step0));
  const s = ([1, 2, 2.5, 5, 10].find((f) => f * mag >= step0) ?? 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(+v.toFixed(6));
  return out;
}

function DetailChart({ b, model, data, day, onPick }: { b: Building; model: Model; data: EnergyData; day: number; onPick: (i: number) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(380);
  const [year, setYear] = useState(false);
  const [tip, setTip] = useState<number | null>(null);
  useEffect(() => {
    const el = boxRef.current!;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const N = data.n, span = year ? N : 60;
  const a = year ? 0 : Math.max(0, Math.min(N - span, day - Math.floor(span / 2)));
  const z = Math.min(N - 1, a + span - 1);
  const P = b.p[model.key] ?? [], LO = model.band ? b.lo[model.key] : null, HI = model.band ? b.hi[model.key] : null;
  const idx = Array.from({ length: z - a + 1 }, (_, k) => a + k);
  const vals = idx.flatMap((i) => [b.y[i], P[i], LO?.[i], HI?.[i]]).filter((v): v is number => v != null);
  const temps = data.temp.filter((v): v is number => v != null);
  const tlo = Math.min(...temps), thi = Math.max(...temps);

  const H = 230, ml = 44, mr = 8, mt = 8, plotH = 150, stripTop = mt + plotH + 22, stripH = 26;
  let vmin = vals.length ? Math.min(...vals) : 0, vmax = vals.length ? Math.max(...vals) : 1;
  const pad = (vmax - vmin) * 0.08 || 1;
  vmin -= pad; vmax += pad;
  const x = (i: number) => ml + ((i - a) / Math.max(1, z - a)) * (W - ml - mr);
  const yv = (v: number) => mt + plotH - ((v - vmin) / (vmax - vmin)) * plotH;
  const line = (arr: Series) => {
    let d = '', pen = false;
    for (const i of idx) {
      const v = arr[i];
      if (v == null) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${yv(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  let band = '';
  if (LO && HI) {
    let seg: number[] = [];
    const flush = () => {
      if (seg.length > 1) band += 'M' + seg.map((i) => `${x(i).toFixed(1)},${yv(HI[i]!).toFixed(1)}`).join('L') + 'L' + seg.slice().reverse().map((i) => `${x(i).toFixed(1)},${yv(LO[i]!).toFixed(1)}`).join('L') + 'Z';
      seg = [];
    };
    for (const i of idx) { if (LO[i] != null && HI[i] != null) seg.push(i); else flush(); }
    flush();
  }
  const every = W < 400 ? 2 : 1;
  const xticks = idx.filter((i) => {
    const d = new Date(dayMs(data.start, i));
    const ok = year ? d.getUTCDate() === 1 : d.getUTCDay() === 1 && Math.floor((i - a) / 7) % every === 0;
    return ok && x(i) > ml + 12 && x(i) < W - mr - 12;
  });
  const at = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return Math.max(a, Math.min(z, Math.round(a + ((px - ml) / (W - ml - mr)) * (z - a))));
  };
  const text: CSSProperties = { fill: MUTED, fontSize: 10, fontFamily: RESIPLE };
  const tipErr = tip != null && b.y[tip] != null && P[tip] != null && b.y[tip]! > 0 ? ((P[tip]! - b.y[tip]!) / b.y[tip]!) * 100 : null;
  const segBtn = (on: boolean): CSSProperties => ({ appearance: 'none', border: 0, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: RESIPLE, background: on ? INK : 'transparent', color: on ? '#0e141c' : DIM });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={LABEL}>Daily load, kW</span>
        <div role="group" aria-label="Chart span" style={{ display: 'inline-flex', border: `1px solid ${LINE}` }}>
          <button aria-pressed={!year} onClick={() => setYear(false)} style={segBtn(!year)}>60 days</button>
          <button aria-pressed={year} onClick={() => setYear(true)} style={segBtn(year)}>Full year</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: DIM, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 16, height: 2, background: '#fff' }} />Actual</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 16, height: 2, background: PRED }} />{model.label}</span>
        {model.band && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 16, height: 8, background: BAND }} />80% range</span>}
      </div>
      <div ref={boxRef} style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${b.name}: actual versus forecast daily load`} style={{ display: 'block', overflow: 'visible' }}
          onPointerMove={(e) => setTip(at(e.clientX, e.currentTarget))}
          onPointerLeave={() => setTip(null)}
          onClick={(e) => onPick(at(e.clientX, e.currentTarget))}>
          {vals.length ? <>
            {niceTicks(vmin, vmax, 4).filter((t) => t >= vmin && t <= vmax).map((t) => (
              <g key={t}>
                <line x1={ml} x2={W - mr} y1={yv(t)} y2={yv(t)} stroke={LINE} />
                <text x={ml - 6} y={yv(t) + 3} textAnchor="end" style={text}>{t >= 1000 ? `${t / 1000}k` : t}</text>
              </g>
            ))}
            {xticks.map((i) => (
              <text key={i} x={x(i)} y={mt + plotH + 14} textAnchor="middle" style={text}>
                {year ? new Date(dayMs(data.start, i)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) : fmtShort(data.start, i)}
              </text>
            ))}
            {band && <path d={band} fill={BAND} />}
            <path d={line(P)} fill="none" stroke={PRED} strokeWidth={2} strokeLinejoin="round" />
            <path d={line(b.y)} fill="none" stroke="#ffffff" strokeWidth={2} strokeLinejoin="round" />
          </> : <text x={W / 2} y={80} textAnchor="middle" style={text}>No data in this window</text>}
          {/* temperature: its own band and scale, never a second y-axis */}
          {idx.map((i) => {
            const v = data.temp[i];
            if (v == null) return null;
            const bw = (W - ml - mr) / idx.length, h = 2 + ((stripH - 2) * (thi - v)) / (thi - tlo);
            return <rect key={i} x={x(i) - bw / 2 + 0.3} y={stripTop + stripH - h} width={Math.max(bw - 0.6, 0.6)} height={h} fill={v <= COLD_F ? COLD_TONE : 'rgba(255,255,255,0.22)'} />;
          })}
          <text x={ml - 6} y={stripTop + stripH - 2} textAnchor="end" style={text}>temp</text>
          {day >= a && day <= z && <>
            <line x1={x(day)} x2={x(day)} y1={mt} y2={stripTop + stripH} stroke={INK} strokeDasharray="3 3" />
            {b.y[day] != null && <circle cx={x(day)} cy={yv(b.y[day]!)} r={4} fill="#fff" stroke={SLATE} strokeWidth={2} />}
            {P[day] != null && <circle cx={x(day)} cy={yv(P[day]!)} r={4} fill={PRED} stroke={SLATE} strokeWidth={2} />}
          </>}
          {tip != null && <line x1={x(tip)} x2={x(tip)} y1={mt} y2={stripTop + stripH} stroke={MUTED} />}
          <rect x={ml} y={0} width={W - ml - mr} height={H} fill="transparent" style={{ cursor: 'crosshair' }} />
        </svg>
        {tip != null && (
          <div style={{
            position: 'absolute', top: 4, pointerEvents: 'none', background: SLATE, border: `1px solid ${LINE}`, padding: '6px 8px', fontSize: 12, whiteSpace: 'nowrap', display: 'grid', gap: 2, zIndex: 2,
            ...(x(tip) > W / 2 ? { right: `${((W - x(tip)) / W) * 100}%`, marginRight: 10 } : { left: `${(x(tip) / W) * 100}%`, marginLeft: 10 }),
          }}>
            <div>{fmtLong(data.start, tip)}</div>
            <TipRow k="Actual" v={fmtKW(b.y[tip])} />
            <TipRow k="Forecast" v={`${fmtKW(P[tip])}${tipErr == null ? '' : ` (${pct(tipErr)})`}`} />
            {LO && HI && LO[tip] != null && <TipRow k="80% range" v={`${fmtKW(LO[tip])}–${fmtKW(HI[tip])}`} />}
            {data.temp[tip] != null && <TipRow k="Temp" v={`${Math.round(data.temp[tip]!)} °F`} />}
          </div>
        )}
      </div>
    </div>
  );
}

function TipRow({ k, v }: { k: string; v: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}><span style={{ color: DIM }}>{k}</span><span style={NUM}>{v}</span></div>;
}
