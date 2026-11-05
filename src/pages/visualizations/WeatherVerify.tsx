import { useEffect, useMemo, useRef, useState } from 'react';
import TileMap, { type MapTarget, type Overlay } from './TileMap';
import { RESIPLE } from '../../styles/theme';
import { PANEL, ColorScale } from './wxUi';
import { useCompactViewport } from './useCompactViewport';
import { loadImage } from './wxClient';
import {
  fetchCatalog, fetchMatrix, panelUrl, panelError, sameSelection,
  type VerifyCatalog, type VerifyField, type Matrix, type MatrixCell, type Selection, type UnitSystem,
} from './verifyClient';
import { WX_EVENTS, EVENT_KINDS, type WxEvent } from '../../data/wxEvents';

const CARTO_KEY = import.meta.env.VITE_CARTO_KEY;
const LIGHT_TILES = (z: number, x: number, y: number) =>
  `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`;

const HOUR = 3_600_000;
const SIX = 6 * HOUR;
const LOCAL_TZ = 'America/New_York';

const INK = '#e6ecf0';
const DIM = '#a9b7c0';

const zulu = (ms: number) => `${String(new Date(ms).getUTCHours()).padStart(2, '0')}Z`;
// the reader's wall clock: Ithaca time
const nyParts = (ms: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: LOCAL_TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(ms).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour };
};
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString([], { timeZone: LOCAL_TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).replace(/,/g, '');
const fmtHour = (ms: number) => new Date(ms).toLocaleTimeString([], { timeZone: LOCAL_TZ, hour: 'numeric' });
const fmtInit = (ms: number) =>
  `${new Date(ms).toLocaleString([], { timeZone: 'UTC', month: 'short', day: 'numeric' })} ${zulu(ms)}`;
const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString([], { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });

const dateValue = (ms: number) => {
  const { y, m, d } = nyParts(ms);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// Preserve the Ithaca hour when the selected day crosses a daylight-saving change.
function onDay(value: number, day: string) {
  const { y, m, d, h } = nyParts(value);
  const desired = Date.parse(`${day}T00:00:00Z`) + h * HOUR;
  let result = value + desired - Date.UTC(y, m, d, h);
  const local = nyParts(result);
  result += desired - Date.UTC(local.y, local.m, local.d, local.h);
  return result;
}

const initOf = (s: Selection) => (s as { init: number }).init;

export default function WeatherVerify() {
  const small = useCompactViewport();

  const [catalog, setCatalog] = useState<VerifyCatalog | 'loading' | 'error'>('loading');
  // imperial by default - the club is in New York. The ramp is baked into the
  // rendered pixels, so this re-renders the panels rather than relabelling them.
  const [units, setUnits] = useState<UnitSystem>('imperial');
  const [fieldId, setFieldId] = useState('temperature_2m');
  const [valid, setValid] = useState<number | null>(null);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [sel, setSel] = useState<Selection>({ source: 'obs' });
  // the last panel that finished decoding, kept on screen until the next one lands
  const [ready, setReady] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // one popover open at a time
  const [open, setOpen] = useState<'field' | 'events' | 'date' | 'hour' | null>(null);
  const toggle = (k: NonNullable<typeof open>) => setOpen((o) => (o === k ? null : k));

  useEffect(() => {
    let alive = true;
    fetchCatalog(units)
      .then((c) => {
        if (!alive) return;
        setCatalog(c);
        // only jump to the newest hour on first load; switching units must not
        // move the reader off the time they were studying
        setValid((v) => {
          if (v !== null) return v;
          const f = c.fields.find((x) => x.id === fieldId) ?? c.fields[0];
          // open on a synoptic hour, so every model (AIFS too) has a forecast
          return Math.floor(f.truth.end / SIX) * SIX;
        });
      })
      .catch(() => alive && setCatalog('error'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('[data-pop]')) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const cat = catalog !== 'loading' && catalog !== 'error' ? catalog : null;
  const field: VerifyField | null = cat?.fields.find((f) => f.id === fieldId) ?? cat?.fields[0] ?? null;

  // the window the observation can actually answer, narrowed to where at least
  // one model has runs
  const bounds = useMemo(() => {
    if (!field) return null;
    const firstInit = Math.min(...field.models.map((m) => m.firstInit));
    return {
      min: Math.max(field.truth.start, firstInit),
      max: Math.floor(field.truth.end / HOUR) * HOUR,
    };
  }, [field]);

  useEffect(() => {
    if (!bounds || valid === null) return;
    const clamped = Math.min(Math.max(valid, bounds.min), bounds.max);
    if (clamped !== valid) setValid(clamped);
  }, [bounds, valid]);

  useEffect(() => {
    if (!field || valid === null) return;
    let alive = true;
    setMatrix(null);
    fetchMatrix(field.id, valid)
      .then((m) => alive && setMatrix(m))
      .catch((e) => alive && setError(String(e.message ?? e)));
    return () => { alive = false; };
  }, [field, valid]);

  // keep the selection meaningful when the valid time or field moves: the same
  // lead in the same model, rather than an init that no longer has a forecast
  useEffect(() => {
    if (!matrix || matrix.valid !== valid || sel.source === 'obs') return;
    const row = matrix.rows.find((r) => r.model === sel.source);
    if (row?.cells.some((c) => c && c.init === initOf(sel))) return;
    const firstOpen = row?.cells.find((c) => c);
    setSel(firstOpen ? { source: sel.source, init: firstOpen.init } : { source: 'obs' });
  }, [matrix, sel, valid]);

  // init -1 means "whichever run the next matrix offers", see snapTo
  const pending = sel.source !== 'obs' && initOf(sel) === -1;
  const url = field && valid !== null && !pending ? panelUrl(field.id, valid, sel, units, small ? 512 : 768) : null;

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setError(null);
    loadImage(url)
      .then(() => { if (alive) setReady(url); })
      .catch(() => { void panelError(url).then((m) => alive && setError(m)); });
    return () => { alive = false; };
  }, [url]);

  // warm the observation and the neighbouring leads, so flipping back and
  // forth lands on something already decoded
  useEffect(() => {
    if (!field || valid === null || !matrix) return;
    const id = window.setTimeout(() => {
      const px = small ? 512 : 768;
      const warm: Selection[] = [{ source: 'obs' }];
      if (sel.source !== 'obs') {
        const row = matrix.rows.find((r) => r.model === sel.source);
        const i = row?.cells.findIndex((c) => c && c.init === initOf(sel)) ?? -1;
        for (const k of [i - 1, i + 1]) {
          const c = k >= 0 ? row?.cells[k] : null;
          if (c) warm.push({ source: sel.source, init: c.init });
        }
      }
      for (const s of warm) {
        if (sameSelection(s, sel)) continue;
        void loadImage(panelUrl(field.id, valid, s, units, px)).catch(() => {});
      }
    }, 500);
    return () => clearTimeout(id);
  }, [field, valid, matrix, sel, small, units]);

  // switching model keeps the lead column the reader was on when it can
  const pickModel = (model: string) => {
    const row = matrix?.rows.find((r) => r.model === model);
    if (!row) return;
    const curRow = matrix?.rows.find((r) => r.model === sel.source);
    const col = sel.source === 'obs' ? -1 : curRow?.cells.findIndex((c) => c && c.init === initOf(sel)) ?? -1;
    const cell = (col >= 0 ? row.cells[col] : null) ?? row.cells.find((c) => c);
    if (cell) setSel({ source: model, init: cell.init });
  };

  // AIFS steps in sixes, so off the synoptic hours it has nothing to show:
  // jump to the nearest hour it does cover rather than leaving it greyed out
  const snapTo = (model: string) => {
    if (valid === null || !bounds) return;
    let t = Math.round(valid / SIX) * SIX;
    if (t > bounds.max) t -= SIX;
    if (t < bounds.min) t += SIX;
    setValid(t);
    setSel({ source: model, init: -1 });
  };

  const goToEvent = (e: WxEvent) => {
    setFieldId(e.field);
    setValid(Date.parse(e.valid));
    setSel({ source: 'obs' });
    setOpen(null);
  };

  const overlays: Overlay[] = ready && ready === url && cat
    ? [{ url: ready, bounds: cat.region, opacity: 0.82 }] : [];
  const target = useRef<MapTarget>({ lat: 42.55, lon: -76.55, zoom: 7.4, nonce: 0 }).current;

  // "the present" is the newest hour the observation actually reaches, not the
  // wall clock - the archives run a few hours behind
  const atLatest = bounds !== null && valid !== null && valid === bounds.max;
  const activeEvent = WX_EVENTS.find((e) => e.field === field?.id && Date.parse(e.valid) === valid);
  const activeRow = sel.source === 'obs' ? null : matrix?.rows.find((r) => r.model === sel.source) ?? null;
  const leads = activeRow?.cells.filter((c): c is MatrixCell => c != null) ?? [];
  const leadIdx = leads.findIndex((c) => c.init === initOf(sel));
  const activeCell = leads[leadIdx];
  const localHour = valid !== null ? nyParts(valid).h : 0;
  const shift = (h: number) => valid !== null && bounds &&
    setValid(Math.min(Math.max(valid + h * HOUR, bounds.min), bounds.max));

  const status = catalog === 'error'
    ? 'The weather archive is temporarily unavailable. Please try again later.'
    : error ?? (url && !ready ? 'Reading the archive. The first panel of a run takes a few seconds.' : null);

  return (
    <div className={`wxview${small ? ' wxv-compact' : ''}`} style={{ position: 'absolute', inset: 0, background: '#e8e8e6', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <style>{`
        .wxview button { -webkit-tap-highlight-color: transparent; font-family: ${RESIPLE}; }
        .wxview ::-webkit-scrollbar { display: none }
        .wxv-q { appearance: none; border: 0; background: transparent; color: ${DIM}; cursor: pointer; transition: color .15s, background .15s; }
        .wxv-q:hover:not(:disabled) { color: ${INK}; background: rgba(255,255,255,0.06); }
        .wxv-q:disabled { cursor: default; opacity: .35; }
        .wxv-opt { appearance: none; display: flex; align-items: baseline; gap: 10px; width: 100%; text-align: left; border: 0; background: transparent; color: ${INK}; cursor: pointer; padding: 7px 14px; font-size: 12.5px; white-space: nowrap; }
        .wxv-opt:hover { background: rgba(255,255,255,0.07); }
        .wxv-opt[aria-pressed="true"] { background: rgba(255,255,255,0.12); font-weight: 600; }
        .wxv-day { appearance: none; border: 0; background: transparent; color: ${INK}; cursor: pointer; height: 28px; font-size: 12px; }
        .wxv-day:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
        .wxv-day[aria-pressed="true"] { background: ${INK}; color: #0e141c; font-weight: 600; }
        .wxv-day:disabled { opacity: .22; cursor: default; }
        .wxv-tab { appearance: none; border: 0; background: transparent; padding: 4px 0; font-size: 12px; font-weight: 500; color: ${DIM}; cursor: pointer; transition: color .15s; }
        .wxv-tab:hover:not(:disabled) { color: #fff; }
        .wxv-tab[aria-pressed="true"] { color: #fff; font-weight: 600; }
        .wxv-tab:disabled { opacity: .3; cursor: default; }
        .wxv-range { -webkit-appearance: none; appearance: none; display: block; width: 100%; height: 14px; margin: 0; background: transparent; cursor: pointer; }
        .wxv-range::-webkit-slider-runnable-track { height: 3px; border-radius: 3px; background: rgba(255,255,255,0.18); }
        .wxv-range::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4.5px; border-radius: 50%; background: #fff; }
        .wxv-range::-moz-range-track { height: 3px; border-radius: 3px; background: rgba(255,255,255,0.18); }
        .wxv-range::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: #fff; }
        .wxv-tick { appearance: none; border: 0; background: transparent; padding: 2px 3px; font-size: 10.5px; color: ${DIM}; cursor: pointer; white-space: nowrap; }
        .wxv-tick[aria-pressed="true"] { color: #fff; font-weight: 600; }
        .wxview :is(button,select,input):focus-visible { outline: 2px solid #e6ecf0; outline-offset: 3px; }
        .wxv-native { display: block; width: 100%; min-width: 0; min-height: 44px; box-sizing: border-box; border: 1px solid #617581; border-radius: 0; padding: 6px; background: #101720; color: ${INK}; font: 16px ${RESIPLE}; color-scheme: dark; }
        .wxv-mobile-label { min-width: 0; display: grid; gap: 4px; font-size: 11px; color: ${DIM}; }
        .wxv-compact .wxv-range { height: 44px; }
        .wxv-compact .wxv-range::-webkit-slider-thumb { width: 24px; height: 24px; margin-top: -10.5px; }
        .wxv-compact .wxv-range::-moz-range-thumb { width: 24px; height: 24px; }
        .wxv-top { display: grid; grid-template-columns: minmax(0,1.45fr) minmax(0,1fr); gap: 8px; }
        .wxv-mobile-controls { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap: 8px; }
        @media(min-width:721px) and (max-width:919px) { .wxv-storms { bottom: 66px !important; } }
        @media(max-width:380px) { .wxv-top { grid-template-columns: minmax(0,1fr); } }
        @media(max-width:340px) { .wxv-mobile-controls { grid-template-columns: repeat(2,minmax(0,1fr)); } }
        @media(min-width:480px) and (max-height:500px) {
          .wxv-mobile-controls { grid-template-columns: minmax(0,1.3fr) repeat(3,minmax(0,1fr)); }
          .wxv-mobile-label { gap: 0; }
          .wxv-mobile-label>span { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
          .wxv-compact .wxv-lead { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:center; padding-top:4px!important; }
          .wxv-compact .wxv-legend { top:70px!important; transform:none!important; }
        }
      `}</style>
      <TileMap
        sites={[]}
        selectedIds={[]}
        onSelect={() => {}}
        showLegend={false}
        target={target}
        dur={1}
        tileUrl={LIGHT_TILES}
        attribution="Basemap: CARTO. Data: dynamical.org"
        minZ={5}
        maxZ={12}
        overlays={overlays}
        gridBounds={cat?.region}
      />

      {/* top-left: the variable */}
      {small && cat && field && (
        <div className="wxv-top" style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 'max(12px, env(safe-area-inset-left))', right: 'calc(max(12px, env(safe-area-inset-right)) + 56px)', maxWidth: 460, zIndex: 6 }}>
          <select className="wxv-native" aria-label="Weather variable" value={field.id} onChange={(e) => setFieldId(e.target.value)}>
            {cat.fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select className="wxv-native" aria-label="Past storms" value={activeEvent?.id ?? ''} onChange={(e) => { const event = WX_EVENTS.find((event) => event.id === e.target.value); if (event) goToEvent(event); }}>
            <option value="">Past storms</option>
            {EVENT_KINDS.map((kind) => <optgroup key={kind.id} label={kind.label}>
              {WX_EVENTS.filter((event) => event.kind === kind.id).map((event) => <option key={event.id} value={event.id}>{event.label}, {fmtDay(Date.parse(event.valid))}</option>)}
            </optgroup>)}
          </select>
        </div>
      )}
      {!small && cat && field && (
        <div data-pop style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 'max(12px, env(safe-area-inset-left))', zIndex: 6 }}>
          <button className="wxv-q" onClick={() => toggle('field')} aria-expanded={open === 'field'} style={TRIGGER}>
            {field.label} <Caret up={open === 'field'} />
          </button>
          {open === 'field' && (
            <div style={{ ...POP, top: 'calc(100% + 6px)', left: 0, minWidth: '100%' }}>
              {cat.fields.map((f) => (
                <button key={f.id} className="wxv-opt" aria-pressed={f.id === field.id} onClick={() => { setFieldId(f.id); setOpen(null); }}>{f.label}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phones use the native Past storms picker beside the variable. */}
      {!small && (
        <div data-pop className="wxv-storms" style={{ position: 'absolute', bottom: 'max(12px, env(safe-area-inset-bottom))', left: 'max(12px, env(safe-area-inset-left))', zIndex: 6 }}>
          <button className="wxv-q" onClick={() => toggle('events')} aria-expanded={open === 'events'} style={TRIGGER}>
            Past storms <Caret up={open === 'events'} />
          </button>
          {open === 'events' && (
            <div style={{ ...POP, bottom: 'calc(100% + 6px)', left: 0, width: 320, maxHeight: '62vh', overflowY: 'auto' }}>
              {EVENT_KINDS.map((kind) => {
                const rows = WX_EVENTS.filter((e) => e.kind === kind.id);
                if (!rows.length) return null;
                return (
                  <div key={kind.id} style={{ padding: '4px 0' }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6d7f89', padding: '6px 14px 3px' }}>{kind.label}</div>
                    {rows.map((e) => (
                      <button key={e.id} className="wxv-opt" aria-pressed={activeEvent?.id === e.id} onClick={() => goToEvent(e)}>
                        <span style={{ flex: 1 }}>{e.label}</span>
                        <span style={{ fontSize: 10.5, color: DIM }}>{fmtDay(Date.parse(e.valid))}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {field?.scale && (
        <div className="wxv-legend" style={{ position: 'absolute', right: 'max(12px, env(safe-area-inset-right))', top: small ? '40%' : '44%', transform: 'translateY(-50%)', zIndex: 4, pointerEvents: 'none' }}>
          <ColorScale small={small} scale={field.scale} />
        </div>
      )}

      {/* bottom: date, hour and source on one line; lead slider only for a model */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'max(12px, env(safe-area-inset-bottom))', zIndex: 4, ...PANEL, background: 'rgba(14,20,28,0.94)', width: 'min(620px, calc(100% - max(24px, env(safe-area-inset-left) + env(safe-area-inset-right))))', boxSizing: 'border-box', padding: '8px 12px', maxHeight: 'calc(100dvh - 88px)', overflowY: small ? 'auto' : undefined }}>
        {small ? (
          <div className="wxv-mobile-controls">
            <label className="wxv-mobile-label"><span>Date (Ithaca time)</span>
              <input className="wxv-native" type="date" value={valid !== null ? dateValue(valid) : ''} min={bounds ? dateValue(bounds.min) : undefined} max={bounds ? dateValue(bounds.max) : undefined} disabled={!bounds || valid === null}
                onChange={(e) => { if (e.target.value && bounds && valid !== null) setValid(Math.min(bounds.max, Math.max(bounds.min, onDay(valid, e.target.value)))); }} />
            </label>
            <label className="wxv-mobile-label"><span>Hour (Ithaca time)</span>
              <select className="wxv-native" value={valid ?? ''} disabled={!bounds || valid === null} onChange={(e) => setValid(Number(e.target.value))}>
                {valid !== null && bounds && Array.from({ length: 24 }, (_, k) => valid + (k - localHour) * HOUR).map((ms) => <option key={ms} value={ms} disabled={ms < bounds.min || ms > bounds.max}>{fmtHour(ms)} ({zulu(ms)})</option>)}
              </select>
            </label>
            <label className="wxv-mobile-label"><span>Source</span>
              <select className="wxv-native" value={sel.source} disabled={!matrix} onChange={(e) => {
                const source = e.target.value;
                if (source === 'obs') setSel({ source });
                else if (matrix?.rows.find((row) => row.model === source)?.cells.some(Boolean)) pickModel(source);
                else snapTo(source);
              }}>
                <option value="obs" disabled={!matrix?.truth.available}>Observed</option>
                {matrix?.rows.map((row) => {
                  const model = field?.models.find((model) => model.id === row.model);
                  const available = row.cells.some(Boolean) || (!!model && model.leadStepHours > 1 && valid !== null && valid >= model.firstInit);
                  return <option key={row.model} value={row.model} disabled={!available}>{row.label}</option>;
                })}
              </select>
            </label>
            <label className="wxv-mobile-label"><span>Units</span>
              <select className="wxv-native" value={units} onChange={(e) => setUnits(e.target.value as UnitSystem)}>
                <option value="imperial">°F / in</option><option value="metric">°C / mm</option>
              </select>
            </label>
          </div>
        ) : <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 14, rowGap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div data-pop style={BOX}>
              <button className="wxv-q" onClick={() => shift(-24)} disabled={!bounds || valid === bounds.min} aria-label="Previous day" style={ARROW}>&lsaquo;</button>
              <button className="wxv-q" onClick={() => toggle('date')} aria-expanded={open === 'date'} style={BOX_LABEL}>
                {valid !== null ? fmtDate(valid) : '\u00a0'}
              </button>
              <button className="wxv-q" onClick={() => shift(24)} disabled={!bounds || atLatest} aria-label="Next day" style={ARROW}>&rsaquo;</button>
              {open === 'date' && valid !== null && bounds && (
                <div style={{ ...POP, bottom: 'calc(100% + 10px)', left: 0, padding: 0 }}>
                  <Calendar value={valid} min={bounds.min} max={bounds.max} onPick={(ms) => { setValid(ms); setOpen(null); }} />
                </div>
              )}
            </div>
            <div data-pop style={BOX}>
              <button className="wxv-q" onClick={() => shift(-1)} disabled={!bounds || valid === bounds.min} aria-label="One hour earlier" style={ARROW}>&lsaquo;</button>
              <button className="wxv-q" onClick={() => toggle('hour')} aria-expanded={open === 'hour'} style={BOX_LABEL}>
                {valid !== null ? `${fmtHour(valid)} (${zulu(valid)})` : '\u00a0'}
              </button>
              <button className="wxv-q" onClick={() => shift(1)} disabled={!bounds || atLatest} aria-label="One hour later" style={ARROW}>&rsaquo;</button>
              {open === 'hour' && valid !== null && bounds && (
                <div style={{ ...POP, bottom: 'calc(100% + 10px)', left: 0, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 64px)', gap: 2 }}>
                  {Array.from({ length: 24 }, (_, k) => valid + (k - localHour) * HOUR).map((ms) => (
                    <button
                      key={ms}
                      className="wxv-day"
                      aria-pressed={ms === valid}
                      disabled={ms < bounds.min || ms > bounds.max}
                      onClick={() => { setValid(ms); setOpen(null); }}
                      style={{ height: 34, lineHeight: 1.2 }}
                    >
                      {fmtHour(ms)}<br /><span style={{ fontSize: 10, opacity: 0.7 }}>{zulu(ms)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <span style={{ flex: 1 }} />

          {matrix ? (
            <div style={{ display: 'flex', gap: 14 }}>
              <button
                className="wxv-tab"
                onClick={() => setSel({ source: 'obs' })}
                disabled={!matrix.truth.available}
                aria-pressed={sel.source === 'obs'}
                title={matrix.truth.available ? matrix.truth.label : 'No observation at this hour'}
              >Observed</button>
              {matrix.rows.map((row) => {
                const has = row.cells.some((c) => c);
                const m = field?.models.find((x) => x.id === row.model);
                const snaps = !has && !!m && m.leadStepHours > 1 && valid !== null && valid >= m.firstInit;
                return (
                  <button
                    key={row.model}
                    className="wxv-tab"
                    onClick={() => (has ? pickModel(row.model) : snapTo(row.model))}
                    disabled={!has && !snaps}
                    aria-pressed={sel.source === row.model}
                    title={has ? undefined : snaps ? `${row.label} runs every 6 hours. Jump to the nearest one` : `${row.label} has no forecast for this date`}
                  >{row.label}</button>
                );
              })}
            </div>
          ) : (
            <span style={{ fontSize: 11.5, color: DIM }}>{catalog === 'error' ? 'Service unavailable' : 'Loading runs'}</span>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            {(['imperial', 'metric'] as const).map((u) => (
              <button
                key={u}
                className="wxv-tab"
                onClick={() => setUnits(u)}
                aria-pressed={units === u}
                title={u === 'imperial' ? 'Fahrenheit, inches per hour' : 'Celsius, millimetres per hour'}
              >{u === 'imperial' ? '°F' : '°C'}</button>
            ))}
          </div>
        </div>}

        {activeRow && activeCell && (
          <div className="wxv-lead" style={{ padding: '10px 6px 0' }}>
            <input
              type="range"
              className="wxv-range"
              min={0}
              max={leads.length - 1}
              step={1}
              value={leadIdx}
              onChange={(e) => setSel({ source: activeRow.model, init: leads[Number(e.target.value)].init })}
              aria-label="Forecast lead time"
              aria-valuetext={`${activeCell.leadHours} hours ahead, run ${fmtInit(activeCell.init)}`}
            />
            {small ? <div style={{ fontSize: 12, color: DIM }}>+{activeCell.leadHours} hours, run {fmtInit(activeCell.init)}</div> : <div style={{ position: 'relative', height: 16, marginTop: 4 }}>
              {leads.map((c, i) => (
                <button
                  key={c.init}
                  className="wxv-tick"
                  onClick={() => setSel({ source: activeRow.model, init: c.init })}
                  aria-pressed={i === leadIdx}
                  tabIndex={-1}
                  style={{ position: 'absolute', left: `calc(6px + (100% - 12px) * ${leads.length > 1 ? i / (leads.length - 1) : 0})`, transform: 'translateX(-50%)' }}
                >+{c.leadHours}h</button>
              ))}
            </div>}
          </div>
        )}

        {status && (
          <div role="status" style={{ fontSize: 11, color: DIM, lineHeight: 1.5, paddingTop: 6 }}>{status}</div>
        )}
      </div>
    </div>
  );
}

const POP: React.CSSProperties = { ...PANEL, background: 'rgba(14,20,28,0.96)', position: 'absolute', zIndex: 8, padding: '6px 0' };
const TRIGGER: React.CSSProperties = { ...PANEL, background: '#141c26', border: '1px solid rgba(255,255,255,.5)', height: 44, padding: '0 10px', fontSize: 16, color: INK, display: 'inline-flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap' };
const BOX: React.CSSProperties = { position: 'relative', display: 'flex', alignItems: 'center', height: 28 };
const BOX_LABEL: React.CSSProperties = { height: '100%', padding: '0 4px', color: '#fff', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' };
const ARROW: React.CSSProperties = { width: 22, height: '100%', fontSize: 16, color: '#fff' };

function Caret({ up }: { up: boolean }) {
  return <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: up ? 'rotate(180deg)' : undefined }}><path d="M2 4.2 6 8.2l4-4" /></svg>;
}

/** Month grid in Ithaca time. Picking a day keeps the hour on screen. */
function Calendar({ value, min, max, onPick }: { value: number; min: number; max: number; onPick: (ms: number) => void }) {
  const cur = nyParts(value);
  const [view, setView] = useState({ y: cur.y, m: cur.m });
  const lo = nyParts(min);
  const hi = nyParts(max);
  const key = (y: number, m: number, d: number) => Date.UTC(y, m, d);
  const curK = key(cur.y, cur.m, cur.d);
  const loK = key(lo.y, lo.m, lo.d);
  const hiK = key(hi.y, hi.m, hi.d);
  const lead = new Date(key(view.y, view.m, 1)).getUTCDay();
  const days = new Date(key(view.y, view.m + 1, 0)).getUTCDate();
  const go = (dm: number) => {
    const t = new Date(key(view.y, view.m + dm, 1));
    setView({ y: t.getUTCFullYear(), m: t.getUTCMonth() });
  };
  const monthStart = key(view.y, view.m, 1);
  const nav = (label: string, dm: number, ok: boolean, aria: string) => (
    <button className="wxv-q" onClick={() => go(dm)} disabled={!ok} aria-label={aria} style={{ width: 26, height: 26, fontSize: 13, color: '#fff' }}>{label}</button>
  );
  return (
    <div style={{ width: 240, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        {nav('\u00ab', -12, key(view.y - 1, view.m + 1, 0) >= loK, 'Previous year')}
        {nav('\u2039', -1, monthStart > key(lo.y, lo.m, 1), 'Previous month')}
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: '#fff' }}>
          {new Date(monthStart).toLocaleDateString([], { timeZone: 'UTC', month: 'long', year: 'numeric' })}
        </span>
        {nav('\u203a', 1, monthStart < key(hi.y, hi.m, 1), 'Next month')}
        {nav('\u00bb', 12, key(view.y + 1, view.m, 1) <= hiK, 'Next year')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} style={{ fontSize: 10, color: '#6d7f89', textAlign: 'center', padding: '2px 0 4px' }}>{d}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const k = key(view.y, view.m, i + 1);
          return (
            <button
              key={k}
              className="wxv-day"
              aria-pressed={k === curK}
              disabled={k < loK || k > hiK}
              onClick={() => onPick(onDay(value, new Date(k).toISOString().slice(0, 10)))}
            >{i + 1}</button>
          );
        })}
      </div>
    </div>
  );
}
