import { useEffect, useRef, useState } from 'react';
import { RESIPLE } from '../../styles/theme';
import {
  EGG_CHANNELS, NEWA_CHANNELS, RATINGS, fmtTime, thin, isF, toC,
  type SensorPoint, type Rating,
} from './sensorData';

const fmtVal = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1));

// "PM2.5 ..." -> PM₂.₅-style label; styled <sub>, since the custom fonts ship no
// subscript glyphs. Only the number goes down - a suffix like "Lifetime" stays up.
const subPM = (label: string) => {
  if (!label.startsWith('PM')) return label;
  const [head, ...rest] = label.split(' ');
  return <>PM<sub style={{ fontSize: '0.72em' }}>{head.slice(2)}</sub>{rest.length > 0 && ` ${rest.join(' ')}`}</>;
};

const fmtDay = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

const fmtMoYr = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', year: 'numeric' });

const fmtTick = (v: number) => (Math.abs(v % 1) < 1e-9 ? Math.round(v).toLocaleString() : v.toFixed(1));

// dark-native figure plates: elevation comes from the slightly lighter
// surface and a hairline, not from borders or colored frames, so the charts
// read as one instrument panel over the night imagery
const PLATE = { paper: '#151c26', rule: 'rgba(230,236,240,0.55)', grid: 'rgba(255,255,255,0.07)', ink: '#e6ecf0', muted: '#8fa0ab' };

// the PM2.5 y-axis is anchored to the EPA health scale (top of the Moderate band);
// the 9 µg/m³ standard itself is explained in the plate's footnote
const PM_TOP = 35.4;

// round tick values on a 1-2-5 ladder, so the axis reads in numbers a person
// would choose, never in data-derived extremes
function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1;
  const mag = 10 ** Math.floor(Math.log10(span / n));
  const step = [1, 2, 5, 10].map((c) => c * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(v);
  return out;
}

const CHART_H = 172;

const M = { l: 46, r: 18, t: 10, b: 24 };

export function SensorChart({ label, unit, points, y0, minSpan, epaBands, rating, footnote }: { label: string; unit: string; points: SensorPoint[]; y0?: number; minSpan?: number; epaBands?: boolean; rating?: Rating; footnote?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const pinned = useRef(false);
  // real pixel coordinates: the path is regenerated at the measured width, so the
  // geometry is never non-uniformly stretched and slope means rate of change
  const [w, setW] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const vs = points.map((p) => p.v);
  const dmin = Math.min(...vs);
  const dmax = Math.max(...vs);
  let lo: number, hi: number;
  if (epaBands) {
    // anchored to the health scale, expanding only if readings exceed Moderate
    lo = 0;
    hi = Math.max(PM_TOP, dmax * 1.05);
  } else if (y0 != null) {
    lo = y0;
    hi = y0 + (Math.max(dmax - y0, minSpan ?? 0) || 1) * 1.08;
  } else {
    const pad = Math.max((dmax - dmin) * 0.15, (minSpan ?? 0) / 2, 1e-9);
    lo = dmin - pad;
    hi = dmax + pad;
  }
  // a trace pinned to the floor (clean-air PM reads a flat 0.00, AQI 0) would
  // draw exactly on the axis line and vanish - undershoot the domain a hair
  // so a legitimate zero stays visible just above the baseline
  if (dmin <= lo) lo -= (hi - lo) * 0.03;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const tspan = t1 - t0 || 1;
  const plotW = Math.max(w - M.l - M.r, 1);
  const plotH = CHART_H - M.t - M.b;
  const X = (t: number) => M.l + ((t - t0) / tspan) * plotW;
  const Y = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * plotH;
  // no line across a data gap: a step far beyond the series' own cadence starts
  // a new segment, so outages read as blank stretches
  const dts = points.slice(1).map((p, i) => p.t - points[i].t).sort((a, b) => a - b);
  const gapMs = 5 * (dts[Math.floor(dts.length / 2)] || Infinity);
  const path = points.map((p, i) => `${i && p.t - points[i - 1].t <= gapMs ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const cur = points[points.length - 1];
  const hp = hover != null ? points[hover] : null;
  const ticks = niceTicks(lo, hi);

  // x ticks on 6h boundaries; the midnight rule runs the full plot and carries the
  // date. Past ~3 days the 6h grid overcrowds, so ticks step in whole days instead.
  const xticks: { t: number; midnight: boolean }[] = [];
  const spanDays = tspan / 86_400_000;
  const first = new Date(t0);
  first.setMinutes(0, 0, 0);
  if (spanDays > 3) {
    const stepDays = Math.ceil(spanDays / 6);
    first.setHours(24); // next midnight
    for (let d = new Date(first); d.getTime() <= t1; d.setDate(d.getDate() + stepDays)) xticks.push({ t: d.getTime(), midnight: true });
  } else {
    const step6h = 6 * 3600_000;
    first.setHours(Math.ceil(first.getHours() / 6) * 6);
    for (let t = first.getTime(); t <= t1; t += step6h) xticks.push({ t, midnight: new Date(t).getHours() === 0 });
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - rect.left - M.l) / plotW) * tspan;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
    setHover(best);
  };

  return (
    <div data-plate style={{ background: PLATE.paper, border: '1px solid rgba(255,255,255,0.08)', padding: '16px 18px 12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px 12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 10px', minWidth: 0 }}>
          <div style={{ fontFamily: RESIPLE, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: PLATE.ink, overflowWrap: 'anywhere' }}>
            {subPM(label)}{unit && <> <span style={{ textTransform: 'none', letterSpacing: 0, color: PLATE.muted }}>({unit})</span></>}
          </div>
          {rating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: RESIPLE, fontSize: 11.5, color: PLATE.muted, whiteSpace: 'nowrap' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: rating((hp ?? cur).v)[2], border: '1px solid rgba(255,255,255,0.25)', flexShrink: 0 }} />
              {rating((hp ?? cur).v)[1]}{footnote && '*'}
            </div>
          )}
        </div>

      </div>
      <div aria-live="polite" aria-atomic="true" style={{ fontFamily: RESIPLE, fontSize: 13, lineHeight: 1.5, color: PLATE.muted, marginTop: 6 }}>
        {hp ? `${fmtVal(hp.v)} ${unit}, ${fmtDay(hp.t)}, ${fmtTime(hp.t)}` : `Latest: ${fmtVal(cur.v)} ${unit} at ${fmtTime(cur.t)}`}
      </div>
      <div
        ref={wrapRef}
        tabIndex={0}
        role="slider"
        aria-label={`${label} reading. Use left and right arrows to explore.`}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, points.length - 1)}
        aria-valuenow={hp ? hover! : points.length - 1}
        aria-valuetext={`${fmtVal((hp ?? cur).v)} ${unit}, ${fmtDay((hp ?? cur).t)} ${fmtTime((hp ?? cur).t)}`}
        onPointerDown={(e) => { pinned.current = true; onMove(e); }}
        onPointerMove={onMove}
        onPointerLeave={() => { if (!pinned.current) setHover(null); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { pinned.current = false; setHover(null); return; }
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          pinned.current = true;
          setHover((i) => e.key === 'Home' ? 0 : e.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (i ?? points.length - 1) + (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1))));
        }}
        style={{ position: 'relative', marginTop: 8, touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      >
        <svg width={w || '100%'} height={CHART_H} style={{ display: 'block' }} aria-label={`${label} history`}>
          {w > 0 && (
            <>
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={M.l} x2={M.l + plotW} y1={Y(v)} y2={Y(v)} stroke={PLATE.grid} strokeWidth={1} />
                  <text x={M.l - 7} y={Y(v)} fontSize={10.5} fill={PLATE.muted} textAnchor="end" dominantBaseline="middle" fontFamily="Resiple, sans-serif">{fmtTick(v)}</text>
                </g>
              ))}
              {/* never let time labels crowd: keep every k-th tick so what
                  remains fits the measured width */}
              {xticks.filter((_, ti, a) => ti % Math.max(1, Math.ceil(a.length / Math.max(2, Math.floor(plotW / 70)))) === 0).map(({ t, midnight }) => (
                <g key={t}>
                  <line x1={X(t)} x2={X(t)} y1={M.t + plotH} y2={M.t + plotH + 4} stroke={PLATE.rule} strokeWidth={1} />
                  <text x={X(t)} y={CHART_H - 7} fontSize={10} fill={PLATE.muted} textAnchor="middle" fontFamily="Resiple, sans-serif">
                    {spanDays > 300 ? fmtMoYr(t) : midnight ? fmtDay(t) : fmtTime(t)}
                  </text>
                </g>
              ))}
              {/* the measurement frame: a real L-axis, not floating hairlines */}
              <line x1={M.l} x2={M.l} y1={M.t} y2={M.t + plotH} stroke={PLATE.rule} strokeWidth={1.2} />
              <line x1={M.l} x2={M.l + plotW} y1={M.t + plotH} y2={M.t + plotH} stroke={PLATE.rule} strokeWidth={1.2} />
              <path d={path} fill="none" stroke={PLATE.ink} strokeWidth={1.4} />
              {hp && (
                <>
                  <line x1={X(hp.t)} x2={X(hp.t)} y1={M.t} y2={M.t + plotH} stroke={PLATE.ink} strokeWidth={0.8} opacity={0.35} />
                  <circle cx={X(hp.t)} cy={Y(hp.v)} r={3.2} fill={PLATE.ink} stroke={PLATE.paper} strokeWidth={1.5} />
                </>
              )}
            </>
          )}
        </svg>
      </div>
      {footnote && (
        <div style={{ fontFamily: RESIPLE, fontSize: 10.5, color: PLATE.muted, marginTop: 2 }}>
          {footnote}
        </div>
      )}
    </div>
  );
}

export function SoilCharts({ points, lifetime }: { points: SensorPoint[]; lifetime?: SensorPoint[] }) {
  const newest = points[points.length - 1].t;
  // lifetime pops in when the slow archive fetch lands
  const windows = [
    { label: 'Lifetime', pts: lifetime ?? [] },
    { label: 'Month', pts: points.filter((p) => p.t >= newest - 31 * 86_400_000) },
    { label: 'Week', pts: points.filter((p) => p.t >= newest - 7 * 86_400_000) },
    { label: 'Day', pts: points.filter((p) => p.t >= newest - 86_400_000) },
  ]
    .map((w) => ({ ...w, pts: w.pts.length > 1 ? thin(w.pts) : w.pts }))
    .filter((w) => w.pts.length > 1);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 18 }}>
      {windows.map((w) => (
        <SensorChart key={w.label} label={w.label} unit="% VWC" points={w.pts} y0={0} minSpan={20} />
      ))}
    </div>
  );
}

// wind rose: the window's hours binned into 16 compass sectors by the heading
// the wind blew FROM (meteorological convention), petal length proportional to
// the busiest sector. Cardinal labels, intercardinal ticks.
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function WindRose({ points }: { points: SensorPoint[] }) {
  const SECT = 16;
  const [hover, setHover] = useState<number | null>(null);
  const bins = Array<number>(SECT).fill(0);
  for (const p of points) bins[Math.round(p.v / (360 / SECT)) % SECT]++;
  const max = Math.max(...bins, 1);
  const W = 220;
  const cx = W / 2;
  const cy = CHART_H / 2;
  const R = CHART_H / 2 - 18;
  const pt = (a: number, r: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
  // one sector's wedge path at radius r; trim < 1 stops the petal a hair short
  // of the sector edge, so neighbors read apart
  const wedge = (i: number, r: number, trim = 1) => {
    const a = (i * 2 * Math.PI) / SECT;
    const half = (Math.PI / SECT) * trim;
    const [x0, y0] = pt(a - half, r);
    const [x1, y1] = pt(a + half, r);
    return `M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`;
  };
  return (
    <div data-plate style={{ background: PLATE.paper, border: '1px solid rgba(255,255,255,0.08)', padding: '16px 18px 12px' }}>
      <div style={{ fontFamily: RESIPLE, fontSize: 12, lineHeight: 1.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: PLATE.ink }}>
        Wind rose <span style={{ textTransform: 'none', letterSpacing: 0, color: PLATE.muted }}>
          {hover != null ? `${COMPASS[hover]}: ${Math.round((bins[hover] / points.length) * 100)}% of hours` : '(share of hours by heading)'}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${CHART_H}`} width="100%" height={CHART_H} style={{ display: 'block', marginTop: 8 }} aria-label="Wind rose. Use left and right arrows to explore directions." tabIndex={0} role="slider" aria-valuemin={0} aria-valuemax={15} aria-valuenow={hover ?? 0} aria-valuetext={`${COMPASS[hover ?? 0]}: ${Math.round((bins[hover ?? 0] / points.length) * 100)}% of hours`} onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setHover((i) => ((i ?? 0) + (e.key === 'ArrowLeft' ? 15 : 1)) % 16); } }}>
        {[1 / 3, 2 / 3, 1].map((f) => (
          <circle key={f} cx={cx} cy={cy} r={R * f} fill="none" stroke={PLATE.grid} strokeWidth={1} />
        ))}
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          const [x0, y0] = pt(a, R);
          const [x1, y1] = pt(a, R + 4);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={PLATE.rule} strokeWidth={i % 2 ? 0.6 : 1} />;
        })}
        {(['N', 'E', 'S', 'W'] as const).map((c, i) => {
          const [x, y] = pt((i * Math.PI) / 2, R + 11);
          return <text key={c} x={x} y={y} fontSize={10.5} fill={PLATE.muted} textAnchor="middle" dominantBaseline="middle" fontFamily="Resiple, sans-serif">{c}</text>;
        })}
        {bins.map((b, i) => b > 0 && (
          <path key={i} d={wedge(i, (b / max) * R, 0.82)} fill={PLATE.ink} opacity={hover == null ? 0.9 : hover === i ? 1 : 0.45} style={{ transition: 'opacity .15s ease' }} />
        ))}
        {/* full-radius invisible sectors catch the pointer, so a short petal
            is as hoverable as a long one */}
        {bins.map((_, i) => (
          <path key={`hit-${i}`} d={wedge(i, R)} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
        ))}
      </svg>
    </div>
  );
}

export function WeatherCharts({ series, unit }: { series: { key: string; points: SensorPoint[] }[]; unit: 'C' | 'F' }) {
  const charts = NEWA_CHANNELS.map((c) => ({ ...c, s: series.find((x) => x.key === c.key) })).filter((c) => c.s);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 18 }}>
      {charts.map((c) => c.key === 'wdir' ? <WindRose key={c.key} points={c.s!.points} /> : (
        <SensorChart
          key={c.key}
          label={c.label}
          unit={isF(c.key) ? `°${unit}` : c.unit}
          points={thin(isF(c.key) && unit === 'C' ? toC(c.s!.points) : c.s!.points)}
          y0={c.y0}
          minSpan={isF(c.key) && unit === 'C' ? (c.minSpan! * 5) / 9 : c.minSpan}
        />
      ))}
    </div>
  );
}

export function EggCharts({ series, unit }: { series: { key: string; points: SensorPoint[] }[]; unit: 'C' | 'F' }) {
  const charts = EGG_CHANNELS.map((c) => ({ ...c, series: series.find((s) => s.key === c.key) })).filter((c) => c.series);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 18 }}>
        {charts.map((c) => {
          let points = c.scale ? c.series!.points.map((p) => ({ t: p.t, v: c.scale!(p.v) })) : c.series!.points;
          let chartUnit = c.unit;
          let minSpan = c.minSpan;
          if (c.key === 'temperature' && unit === 'F') {
            points = points.map((p) => ({ t: p.t, v: (p.v * 9) / 5 + 32 }));
            chartUnit = '°F';
            minSpan = minSpan != null ? (minSpan * 9) / 5 : undefined;
          }
          return <SensorChart key={c.key} label={c.label} unit={chartUnit} points={thin(points)} y0={c.y0} minSpan={minSpan} epaBands={c.epaBands} rating={RATINGS[c.key]} footnote={c.footnote} />;
        })}
      </div>
    </div>
  );
}
