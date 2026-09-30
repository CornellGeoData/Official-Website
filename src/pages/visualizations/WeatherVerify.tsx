import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TileMap, { type MapTarget, type Overlay } from './TileMap';
import { RESIPLE } from '../../styles/theme';
import { HALO, PANEL, ColorScale, PickerColumn } from './wxUi';
import { loadImage } from './wxClient';
import {
  fetchCatalog, fetchMatrix, panelUrl, panelError, sameSelection,
  type VerifyCatalog, type VerifyField, type Matrix, type Selection, type UnitSystem,
} from './verifyClient';
import { WX_EVENTS, EVENT_KINDS, type WxEvent } from '../../data/wxEvents';

const CARTO_KEY = import.meta.env.VITE_CARTO_KEY;
const LIGHT_TILES = (z: number, x: number, y: number) =>
  `https://a.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`;

const INITIAL_SMALL = window.matchMedia('(max-width: 720px)').matches;
const HOUR = 3_600_000;
const LOCAL_TZ = 'America/New_York';

const dayValue = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const zulu = (ms: number) => `${String(new Date(ms).getUTCHours()).padStart(2, '0')}Z`;
const fmtValid = (ms: number) =>
  `${new Date(ms).toLocaleString([], { timeZone: LOCAL_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', timeZoneName: 'short' }).replace(',', '')} (${zulu(ms)})`;
const fmtInit = (ms: number) =>
  `${new Date(ms).toLocaleString([], { timeZone: 'UTC', month: 'short', day: 'numeric' }).replace(',', '')} ${zulu(ms)}`;

export default function WeatherVerify() {
  const [small, setSmall] = useState(INITIAL_SMALL);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const resize = () => setSmall(media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

  const [catalog, setCatalog] = useState<VerifyCatalog | 'loading' | 'error'>('loading');
  // imperial by default - the club is in New York. The ramp is baked into the
  // rendered pixels, so this re-renders the panels rather than relabelling them.
  const [units, setUnits] = useState<UnitSystem>('imperial');
  const [fieldId, setFieldId] = useState('temperature_2m');
  const [valid, setValid] = useState<number | null>(null);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [sel, setSel] = useState<Selection>({ source: 'obs' });
  // the last forecast looked at, so the blink toggle has somewhere to go back to
  const lastForecast = useRef<Selection | null>(null);
  const [ready, setReady] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState(false);
  const [openEvents, setOpenEvents] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef<HTMLDivElement>(null);

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
          return Math.floor(f.truth.end / HOUR) * HOUR;
        });
      })
      .catch(() => alive && setCatalog('error'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units]);

  useEffect(() => {
    if (!openPicker) return;
    const onDown = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpenPicker(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [openPicker]);

  useEffect(() => {
    if (!openEvents) return;
    const onDown = (e: PointerEvent) => {
      if (eventsRef.current && !eventsRef.current.contains(e.target as Node)) setOpenEvents(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenEvents(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [openEvents]);

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
    if (!field || !bounds || valid === null) return;
    const clamped = Math.min(Math.max(valid, bounds.min), bounds.max);
    if (clamped !== valid) setValid(clamped);
  }, [field, bounds, valid]);

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
    if (!matrix) return;
    if (sel.source === 'obs') return;
    const row = matrix.rows.find((r) => r.model === sel.source);
    const stillThere = row?.cells.some((c) => c && c.init === (sel as { init: number }).init);
    if (stillThere) return;
    const firstOpen = row?.cells.find((c) => c);
    setSel(firstOpen ? { source: sel.source, init: firstOpen.init } : { source: 'obs' });
  }, [matrix, sel]);

  /**
   * Which models have a forecast valid at an instant. Runs start on the 6-hourly
   * synoptic cycle, so the set of available lead times is fixed by where the
   * instant falls in that cycle - which is why AIFS, whose lead times step in
   * sixes, only ever appears at 00/06/12/18Z.
   */
  const modelsAt = useCallback((ms: number) => {
    if (!field) return [];
    const offset = (ms - Math.floor(ms / (6 * HOUR)) * (6 * HOUR)) / HOUR;
    return field.models
      .filter((m) => ms >= m.firstInit && offset % m.leadStepHours === 0)
      .map((m) => m.label);
  }, [field]);

  const goToEvent = (e: WxEvent) => {
    setFieldId(e.field);
    setValid(Date.parse(e.valid));
    setSel({ source: 'obs' });
    lastForecast.current = null;
    setOpenEvents(false);
  };

  const url = field && valid !== null ? panelUrl(field.id, valid, sel, units, small ? 512 : 768) : null;

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setError(null);
    loadImage(url)
      .then(() => { if (alive) setReady({ url }); })
      .catch(() => { void panelError(url).then((m) => alive && setError(m)); });
    return () => { alive = false; };
  }, [url]);

  // warm the observation and the neighbouring runs, so a blink or a step lands
  // on something already decoded
  useEffect(() => {
    if (!field || valid === null || !matrix) return;
    const id = window.setTimeout(() => {
      const px = small ? 512 : 768;
      const warm: Selection[] = [{ source: 'obs' }];
      if (sel.source !== 'obs') {
        const row = matrix.rows.find((r) => r.model === sel.source);
        const i = row?.cells.findIndex((c) => c && c.init === (sel as { init: number }).init) ?? -1;
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

  // ---- keyboard: the flip-book controls ----
  const step = useCallback((dCol: number, dRow: number) => {
    if (!matrix) return;
    const rows = matrix.rows;
    if (sel.source === 'obs') {
      const back = lastForecast.current;
      if (back) setSel(back);
      else {
        const r = rows.find((x) => x.cells.some((c) => c));
        const c = r?.cells.find((x) => x);
        if (r && c) setSel({ source: r.model, init: c.init });
      }
      return;
    }
    let ri = rows.findIndex((r) => r.model === sel.source);
    let ci = rows[ri]?.cells.findIndex((c) => c && c.init === (sel as { init: number }).init) ?? 0;
    if (dRow) {
      for (let k = 1; k <= rows.length; k++) {
        const nr = (ri + dRow * k + rows.length * 2) % rows.length;
        if (rows[nr].cells[ci]) { ri = nr; break; }
      }
    }
    if (dCol) {
      const cells = rows[ri].cells;
      for (let k = ci + dCol; k >= 0 && k < cells.length; k += dCol) {
        if (cells[k]) { ci = k; break; }
      }
    }
    const cell = rows[ri]?.cells[ci];
    if (cell) setSel({ source: rows[ri].model, init: cell.init });
  }, [matrix, sel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1, 0); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); step(0, -1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); step(0, 1); }
      else if (e.key === ' ' || e.key.toLowerCase() === 'o') {
        // the blink comparator: flip between what happened and what was forecast
        e.preventDefault();
        if (sel.source === 'obs') { if (lastForecast.current) setSel(lastForecast.current); }
        else { lastForecast.current = sel; setSel({ source: 'obs' }); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, sel]);

  const pick = (s: Selection) => {
    if (s.source !== 'obs') lastForecast.current = s;
    setSel(s);
  };

  const overlays: Overlay[] = ready && ready.url === url && cat
    ? [{ url: ready.url, bounds: cat.region, opacity: 0.82 }] : [];
  const target = useRef<MapTarget>({ lat: 42.55, lon: -76.55, zoom: 7.4, nonce: 0 }).current;

  const selLabel = sel.source === 'obs'
    ? (field?.truth.label ?? 'Observed')
    : (() => {
      const row = matrix?.rows.find((r) => r.model === sel.source);
      const cell = row?.cells.find((c) => c && c.init === (sel as { init: number }).init);
      return cell ? `${row?.label} +${cell.leadHours}h · run ${fmtInit(cell.init)}` : row?.label ?? '';
    })();

  const cellBtn = (active: boolean, on: boolean): React.CSSProperties => ({
    appearance: 'none', cursor: on ? 'pointer' : 'default', minWidth: 44, height: 26, padding: '0 5px',
    fontFamily: RESIPLE, fontSize: 10.5, letterSpacing: '0.02em',
    border: active ? '1px solid #0e141c' : `1px solid ${on ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
    background: active ? '#e6ecf0' : 'transparent',
    color: active ? '#0e141c' : on ? '#e6ecf0' : '#4e5c66',
  });

  // "the present" is the newest hour the observation actually reaches, not the
  // wall clock - the archives run a few hours behind
  const atLatest = bounds !== null && valid !== null && valid === bounds.max;
  const dateVal = valid !== null ? dayValue(valid) : '';
  const hourVal = valid !== null ? new Date(valid).getUTCHours() : 0;

  return (
    <div className="wxview" style={{ position: 'absolute', inset: 0, background: '#e8e8e6', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <style>{'.wxview button, .wxview input, .wxview select{-webkit-tap-highlight-color:transparent}.wxview ::-webkit-scrollbar{display:none}'}</style>
      <TileMap
        sites={[]}
        selectedIds={[]}
        onSelect={() => {}}
        showLegend={false}
        target={target}
        dur={1}
        tileUrl={LIGHT_TILES}
        attribution={`Basemap: CARTO${field?.truth.attribution ? `. ${field.truth.attribution}` : ''}`}
        minZ={5}
        maxZ={12}
        overlays={overlays}
        gridBounds={cat?.region}
      />

      {/* top-left: the field, and what is currently drawn */}
      <div style={{ position: 'absolute', top: small ? 18 : 24, left: small ? 12 : 24, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 7, maxWidth: small ? 'calc(100vw - 74px)' : 'calc(100% - 110px)' }}>
        {cat && field && (
          <div ref={pickerRef} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <PickerColumn
              label="Field"
              value={field.label}
              valueId={field.id}
              options={cat.fields.map((f) => ({ id: f.id, label: f.label }))}
              open={openPicker}
              onToggle={() => setOpenPicker(!openPicker)}
              onPick={(id) => { setFieldId(id); setOpenPicker(false); }}
              minWidth={168}
            />
          </div>
        )}
        <div style={{ ...PANEL, padding: '7px 11px', fontSize: 12, letterSpacing: '0.03em', maxWidth: 360 }}>
          <strong style={{ fontWeight: 600 }}>{selLabel}</strong>
          {sel.source === 'obs' && <span style={{ color: '#84d3ab' }}> · observed</span>}
        </div>
        {catalog === 'error' && (
          <div role="status" style={{ fontFamily: RESIPLE, color: '#3d4a55', textShadow: HALO, fontSize: 11 }}>
            The verification service is unreachable. Run <code>node server.mjs</code> alongside the dev server.
          </div>
        )}
        {error && (
          <div role="status" style={{ fontFamily: RESIPLE, color: '#3d4a55', textShadow: HALO, fontSize: 11, maxWidth: 340, lineHeight: 1.5 }}>{error}</div>
        )}
        {!error && url && !ready && (
          <div role="status" style={{ fontFamily: RESIPLE, color: '#3d4a55', textShadow: HALO, fontSize: 11 }}>
            Reading the archive&hellip; the first panel of a run takes a few seconds.
          </div>
        )}

        {/* a way in for anyone who does not know which day to look at */}
        <div ref={eventsRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenEvents((o) => !o)}
            aria-expanded={openEvents}
            style={{
              ...PANEL, cursor: 'pointer', padding: '6px 10px', minHeight: 30,
              fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
              ...(openEvents ? { background: '#e6ecf0', color: '#0e141c', border: '1px solid #0e141c' } : {}),
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 12 }}>&#9633;</span>
            Notable events {openEvents ? '\u25b4' : '\u25be'}
          </button>

          {openEvents && (
            <div style={{
              ...PANEL, position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 8,
              width: small ? 'calc(100vw - 32px)' : 380, maxHeight: '58vh', overflowY: 'auto',
              padding: '12px 14px 14px',
            }}>
              <div style={{ fontSize: 10, color: '#8fa0ab', lineHeight: 1.5, marginBottom: 10 }}>
                Days worth looking at in central New York, from the National Weather Service
                Binghamton event archive. Each time is the hour the event actually peaked in
                the archives, not a guess.
              </div>
              {EVENT_KINDS.map((kind) => {
                const rows = WX_EVENTS.filter((e) => e.kind === kind.id);
                if (!rows.length) return null;
                return (
                  <div key={kind.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7c909b', marginBottom: 5 }}>
                      {kind.label}
                    </div>
                    {rows.map((e) => {
                      const ms = Date.parse(e.valid);
                      const has = modelsAt(ms);
                      return (
                        <button
                          key={e.id}
                          onClick={() => goToEvent(e)}
                          style={{
                            appearance: 'none', display: 'block', width: '100%', textAlign: 'left',
                            cursor: 'pointer', background: 'transparent', color: 'inherit',
                            border: '1px solid rgba(255,255,255,0.12)', padding: '7px 9px',
                            marginBottom: 4, fontFamily: RESIPLE,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#e6ecf0' }}>{e.label}</span>
                            <span style={{ flex: 1 }} />
                            <span style={{ fontSize: 10, color: '#9fb0ba', whiteSpace: 'nowrap' }}>
                              {new Date(ms).toLocaleDateString([], { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })} {zulu(ms)}
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: '#8fa0ab', lineHeight: 1.45, marginTop: 3 }}>{e.blurb}</div>
                          <div style={{ fontSize: 9, color: has.length === 3 ? '#84d3ab' : '#7c909b', marginTop: 4, letterSpacing: '0.06em' }}>
                            {has.join(' \u00b7 ') || 'no model coverage'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {field?.scale && (
        <div style={{ position: 'absolute', right: small ? 14 : 26, top: '44%', transform: 'translateY(-50%)', zIndex: 4, pointerEvents: 'none' }}>
          <ColorScale small={small} scale={field.scale} />
        </div>
      )}

      {/* bottom: the run matrix - rows are models, columns are lead time */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: small ? 16 : 24, zIndex: 4, ...PANEL, padding: small ? '10px 12px' : '12px 16px 13px', width: 'min(820px, calc(100vw - 20px))' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          {/* live indicator: green only when parked on the newest hour the
              observation reaches, and a way back to it from anywhere */}
          <button
            onClick={() => bounds && setValid(bounds.max)}
            disabled={!bounds || atLatest}
            aria-label={atLatest ? 'Showing the most recent available hour' : 'Jump to the most recent available hour'}
            title={atLatest ? 'Most recent available hour' : 'Back to the present'}
            style={{
              appearance: 'none', border: 0, background: 'transparent', padding: 4, lineHeight: 0,
              cursor: bounds && !atLatest ? 'pointer' : 'default', flexShrink: 0,
            }}
          >
            <span style={{
              display: 'block', width: 9, height: 9, borderRadius: 999,
              background: atLatest ? '#4fae7d' : '#5f7078',
              boxShadow: atLatest ? '0 0 0 3px rgba(79,174,125,0.25)' : 'none',
            }} />
          </button>
          <input
            type="date" value={dateVal}
            min={bounds ? dayValue(bounds.min) : undefined}
            max={bounds ? dayValue(bounds.max) : undefined}
            onChange={(e) => {
              if (!e.target.value) return;
              setValid(Date.parse(`${e.target.value}T00:00:00Z`) + hourVal * HOUR);
            }}
            aria-label="Valid date"
            style={{ appearance: 'none', height: 30, padding: '0 8px', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(14,20,28,0.6)', color: '#e6ecf0', fontFamily: RESIPLE, fontSize: 11.5, cursor: 'pointer' }}
          />
          <select
            value={hourVal}
            onChange={(e) => valid !== null && setValid(Math.floor(valid / 86_400_000) * 86_400_000 + Number(e.target.value) * HOUR)}
            aria-label="Valid hour (UTC)"
            style={{ appearance: 'none', height: 30, padding: '0 8px', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(14,20,28,0.6)', color: '#e6ecf0', fontFamily: RESIPLE, fontSize: 11.5, cursor: 'pointer' }}
          >
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}Z</option>)}
          </select>
          <span style={{ fontSize: 11.5, color: '#9fb0ba' }}>{valid !== null ? fmtValid(valid) : ''}</span>
          <span style={{ flex: 1 }} />
          {/* the ramp is rendered into the pixels, so this re-renders the panels */}
          <span style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.25)', overflow: 'hidden', flexShrink: 0 }}>
            {(['imperial', 'metric'] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnits(u)}
                aria-pressed={units === u}
                title={u === 'imperial' ? 'Fahrenheit, inches per hour' : 'Celsius, millimetres per hour'}
                style={{
                  appearance: 'none', border: 0, cursor: 'pointer', height: 30, padding: '0 10px',
                  fontFamily: RESIPLE, fontSize: 11, letterSpacing: '0.06em',
                  background: units === u ? '#e6ecf0' : 'transparent',
                  color: units === u ? '#0e141c' : '#9fb0ba',
                }}
              >{u === 'imperial' ? '°F' : '°C'}</button>
            ))}
          </span>
        </div>

        {matrix ? (
          <div style={{ display: 'grid', gridTemplateColumns: `auto repeat(${matrix.columns.length}, 1fr)`, gap: 4, alignItems: 'center' }}>
            <button
              onClick={() => pick({ source: 'obs' })}
              disabled={!matrix.truth.available}
              style={{ ...cellBtn(sel.source === 'obs', matrix.truth.available), gridColumn: '1 / -1', height: 30, marginBottom: 2, letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              {matrix.truth.available ? `Observed — ${matrix.truth.label}` : `No observation at this hour (${matrix.truth.label})`}
            </button>

            <span style={{ fontSize: 10, color: '#7c909b', textAlign: 'right', paddingRight: 4 }}>lead</span>
            {matrix.columns.map((c) => (
              <span key={c.init} style={{ fontSize: 10, color: '#7c909b', textAlign: 'center' }}>+{c.leadHours}h</span>
            ))}

            {matrix.rows.map((row) => (
              <Row key={row.model} row={row} sel={sel} pick={pick} cellBtn={cellBtn} />
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: RESIPLE, fontSize: 12.5, color: '#8fa0ab', padding: '14px 2px' }}>
            {catalog === 'error' ? 'Service unavailable.' : 'Working out which runs cover this hour…'}
          </div>
        )}

        <div style={{ fontSize: 9.5, color: '#6d7f89', marginTop: 9, lineHeight: 1.5 }}>
          Central NY &middot; &larr;&rarr; lead &middot; &uarr;&darr; model &middot; space blinks to observed
          {/* the fill is in mph or m/s but barbs are knots, as they are everywhere */}
          {field?.id === 'wind_speed_10m' && <> &middot; barbs in knots, pointing into the wind</>}
          {field?.truth.attribution && (
            <> <br />Forecasts and analyses from dynamical.org under CC-BY-4.0. {field.truth.attribution}</>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ row, sel, pick, cellBtn }: {
  row: Matrix['rows'][number];
  sel: Selection;
  pick: (s: Selection) => void;
  cellBtn: (active: boolean, on: boolean) => React.CSSProperties;
}) {
  const none = row.cells.every((c) => !c);
  return (
    <>
      <span style={{ fontSize: 11, color: none ? '#5d6c76' : '#c7d3da', textAlign: 'right', paddingRight: 6, whiteSpace: 'nowrap' }}>
        {row.label}
      </span>
      {row.cells.map((cell, i) => {
        const active = cell != null && sel.source === row.model && (sel as { init: number }).init === cell.init;
        return (
          <button
            key={i}
            onClick={() => cell && pick({ source: row.model, init: cell.init })}
            disabled={!cell}
            title={cell ? `${row.label} +${cell.leadHours}h, run ${fmtInit(cell.init)}` : `${row.label} has no forecast valid at this hour`}
            style={cellBtn(active, cell != null)}
          >
            {cell ? `+${cell.leadHours}h` : '–'}
          </button>
        );
      })}
    </>
  );
}
