import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import Globe from './Globe';
import { Descent } from './Descent';
import { flagLevels } from './flagLevels';
import { RESIPLE, MANTI, PILL, PILL_PRIMARY } from '../../styles/theme';
import { CROWDFUNDING } from '../../data/content';

// line icons for the donation bar's markers
const TICK_ICONS: Record<string, ReactNode> = {
  chip: <><rect x="7" y="7" width="10" height="10" rx="1" /><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" /></>,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  signal: <path d="M12 20h.01M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 14 0M2 9.3a15 15 0 0 1 20 0" />,
  probe: <path d="M9 3h6v5H9zM10.5 8v12M13.5 8v12M3 13h5M16 13h5" />,
  drop: <><path d="M12 3s6.5 6.6 6.5 11.2a6.5 6.5 0 0 1-13 0C5.5 9.6 12 3 12 3z" /><path d="M9 14.5a3 3 0 0 0 3 3" /></>,
  computer: <><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M12 16v4M8 20h8" /></>,
  station: <><path d="M12 21V6M8 21l4-7 4 7M7 6h10M12 6V3" /><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /></>,
  buoy: <path d="M12 2v6M9 8h6l2 8H7zM3 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />,
};
const INTAN = "'Intan',sans-serif";
const money = (dollars: number) => `$${dollars.toLocaleString('en-US')}`;
// Reserve a little room for the small gifts; the rest of the scale is linear.
const along = (dollars: number) => Math.min(100, dollars <= 100
  ? dollars / 100 * 12
  : 12 + (dollars - 100) / (CROWDFUNDING.goal - 100) * 88);
const RULER = [0, ...[10, 100, 1000].flatMap((unit) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => n * unit))].filter((v) => v <= CROWDFUNDING.goal);
const RULER_LABELS = [0, 100, 1000, CROWDFUNDING.goal];
const flagLift = (level: number) => `calc((var(--flag) + 8px) * ${level} + 8px)`;

// The fill is the live total; each marker stands at what that much money buys and
// lights once the total passes it. Moving along the bar snaps to the nearest marker
// and previews that gift on the fill.
function DonationBar({ msLeft }: { msLeft: number }) {
  const { goal, ticks, url } = CROWDFUNDING;
  const days = Math.floor(msLeft / 86_400_000), hours = Math.floor(msLeft / 3_600_000) % 24, minutes = Math.floor(msLeft / 60_000) % 60;
  const [raised, setRaised] = useState<number | null>(null);
  const [active, setActive] = useState(1); // opens on a small gift, since that's what most people give
  const [seen, setSeen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const flagsRef = useRef<HTMLDivElement>(null);
  const [levels, setLevels] = useState(() => ticks.map(() => 0));
  // Markers are spaced by dollars but sized in pixels, so whether they touch depends on the bar's real width.
  useLayoutEffect(() => {
    const box = flagsRef.current!;
    const place = () => {
      const flag = box.querySelector('button')!.offsetWidth;
      if (!flag) return; // hidden on phones
      const next = flagLevels(ticks.map((t) => along(t.amount) / 100 * box.clientWidth), flag);
      setLevels((now) => (String(now) === String(next) ? now : next));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(box);
    return () => observer.disconnect();
  }, [ticks]);
  useEffect(() => {
    // no total on failure: a stale or made-up number is worse than none
    fetch('/api/crowdfunding').then((r) => (r.ok ? r.json() : null)).then((data) => setRaised(data?.raised ?? null)).catch(() => {});
    // the fill grows when it scrolls into view, not while it's offscreen
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); observer.disconnect(); }
    }, { threshold: 0.5 });
    observer.observe(barRef.current!);
    return () => observer.disconnect();
  }, []);
  const tick = ticks[active];
  const total = raised ?? 0;
  // a marker under the pointer wins; anywhere else the pointer only has to be near one
  const snap = (e: PointerEvent<HTMLDivElement>) => {
    const flag = (e.target as HTMLElement).closest<HTMLElement>('[data-tick]');
    if (flag) { setActive(Number(flag.dataset.tick)); return; }
    const box = barRef.current!.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width * 100;
    setActive(ticks.reduce((best, t, i) => (Math.abs(along(t.amount) - x) < Math.abs(along(ticks[best].amount) - x) ? i : best), 0));
  };
  return (
    <div style={{ maxWidth: 1180, marginTop: 40 }}>
      <div className="give-summary">
        <div className="give-total">
          <strong style={{ fontFamily: INTAN }}>{money(raised ?? goal)}</strong>
          <span>{raised === null ? 'goal' : `of ${money(goal)}`}</span>
        </div>
        <div className="give-countdown" role="timer" aria-label={`${days} ${days === 1 ? 'day' : 'days'}, ${hours} ${hours === 1 ? 'hour' : 'hours'} and ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left to give`}>
          <ClockUnit value={days} label={days === 1 ? 'day' : 'days'} />
          <ClockUnit value={hours} label={hours === 1 ? 'hour' : 'hours'} />
          <ClockUnit value={minutes} label="min" />
          <span className="give-countdown-left">left</span>
        </div>
      </div>
      <div className="give-graphic" onPointerMove={snap} onPointerDown={snap} style={{ marginTop: 18, touchAction: 'pan-y' }}>
        <div ref={flagsRef} role="group" aria-label="What gifts buy" className="give-flags" style={{ position: 'relative', height: `calc((var(--flag) + 8px) * ${Math.max(...levels) + 1})` }}>
          {ticks.map((t, i) => {
            const passed = seen && t.amount <= total;
            const color = passed ? '#4fae7d' : '#5f7078';
            const delay = `${(along(t.amount) / (along(total) || 1)) ** 2 * 0.9}s`;
            return (
              <Fragment key={t.lvid}>
                <span aria-hidden="true" className="give-flag" style={{ position: 'absolute', left: `${along(t.amount)}%`, bottom: 0, width: 1, height: flagLift(levels[i]), marginLeft: -0.5, background: 'currentColor', color, '--delay': delay } as CSSProperties} />
                <button
                  type="button"
                  data-tick={i}
                  className="give-flag"
                  aria-label={`${money(t.amount)} ${t.does}`}
                  aria-pressed={active === i}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  style={{ position: 'absolute', left: `${along(t.amount)}%`, bottom: flagLift(levels[i]), zIndex: active === i ? 2 : 1, display: 'grid', placeItems: 'center', width: 'var(--flag)', height: 'var(--flag)', marginLeft: 'calc(var(--flag) / -2)', padding: 0, cursor: 'pointer', color, border: '1.5px solid currentColor', '--delay': delay } as CSSProperties}
                >
                  <svg width="66%" height="66%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TICK_ICONS[t.icon]}</svg>
                </button>
              </Fragment>
            );
          })}
        </div>
        <div ref={barRef} role="progressbar" aria-label="Crowdfunding progress" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(total, goal)} aria-valuetext={`${money(total)} raised of ${money(goal)}`} style={{ position: 'relative', height: 'clamp(16px, 1.7vw, 24px)', background: '#23403a' }}>
          <div className="give-fill" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${seen ? along(total) : 0}%`, background: '#4fae7d' }} />
          {raised !== null && seen && (
            <div className="give-preview" style={{ position: 'absolute', top: 0, bottom: 0, left: `${along(total)}%`, width: `${along(total + tick.amount) - along(total)}%`, background: '#4fae7d', opacity: 0.4, borderLeft: '2px solid #0e141c' }} />
          )}
          {ticks.map((t) => (
            <span key={t.lvid} aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: `${along(t.amount)}%`, width: 2, marginLeft: -1, background: '#0e141c' }} />
          ))}
          <span aria-hidden="true" style={{ position: 'absolute', top: -3, bottom: -3, right: 0, width: 2, background: '#e6ecf0' }} />
        </div>
        <svg aria-hidden="true" width="100%" height="10" viewBox="0 0 100 10" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible', marginTop: 4 }}>
          {RULER.map((v) => (
            <line key={v} x1={along(v)} x2={along(v)} y1={0} y2={RULER_LABELS.includes(v) ? 10 : 5} stroke={RULER_LABELS.includes(v) ? '#5f7078' : '#34434f'} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div aria-hidden="true" style={{ position: 'relative', height: 18, marginTop: 5, fontFamily: RESIPLE, fontSize: 13, color: '#7c909b', fontVariantNumeric: 'tabular-nums' }}>
          {RULER_LABELS.map((v) => (
            <span key={v} className={v === 100 ? 'give-axis-small' : undefined} style={{ position: 'absolute', left: `${along(v)}%`, whiteSpace: 'nowrap', color: v === goal ? '#e6ecf0' : undefined, transform: v === 0 ? undefined : v === goal ? 'translateX(-100%)' : 'translateX(-50%)' }}>{money(v)}{v === goal ? ' goal' : ''}</span>
          ))}
        </div>
      </div>
      <label className="give-mobile-select">
        Choose a gift
        <select value={active} onChange={(event) => setActive(Number(event.target.value))}>
          {ticks.map((gift, i) => <option key={gift.lvid} value={i}>{money(gift.amount)}: {gift.does}</option>)}
        </select>
      </label>
      <p className="give-impact" aria-live="polite" style={{ fontFamily: RESIPLE, fontSize: 20, lineHeight: 1.4, minHeight: 28, color: '#a9bcc6', margin: '20px 0 0' }}>
        <strong style={{ color: '#e6ecf0' }}>{money(tick.amount)}</strong> {tick.does}
      </p>
      <div className="give-actions" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 22 }}>
        <a href={`${url}/donate?amount=${tick.amount}&lvid=${tick.lvid}`} target="_blank" rel="noopener noreferrer" style={PILL_PRIMARY}>Give {money(tick.amount)}</a>
        <a href={url} target="_blank" rel="noopener noreferrer" style={PILL}>See the campaign</a>
      </div>
    </div>
  );
}

function ClockUnit({ value, label }: { value: number; label: string }) {
  return (
    <span className="give-clock-unit">
      <strong style={{ fontFamily: INTAN }}>{String(value).padStart(2, '0')}</strong>
      <span>{label}</span>
    </span>
  );
}

// the home page's call to action while the Cornell Crowdfunding campaign runs;
// after it closes the section points at sponsorship instead
function SupportSection() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(clock);
  }, []);
  const left = Date.parse(CROWDFUNDING.end) - now;
  const open = left > 0;
  return (
    <section id="support" style={{ padding: '104px clamp(24px,5vw,72px) 110px' }}>
      <div style={{ maxWidth: 820 }}>
        <h2 style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 'clamp(42px,6.2vw,80px)', letterSpacing: '-0.03em', lineHeight: 1, margin: '0 0 0 -0.03em' }}>Explore the world,<br /><span style={{ color: '#4fae7d' }}>one data point at a time</span></h2>
        {!open && <a href="#/sponsors" style={{ ...PILL_PRIMARY, marginTop: 38 }}>Become a sponsor</a>}
      </div>
      {open && <DonationBar msLeft={left} />}
    </section>
  );
}

export function HomePage() {
  return (
    <>
    <Globe />
    <Descent>
    {/* TEAM PHOTO */}
    <section id="team" style={{ padding: '0 clamp(24px,5vw,72px) 64px' }}>
      <div>
        <figure className="map-frame" style={{ margin: '0 auto', position: 'relative', maxWidth: 840 }}>
          <img loading="lazy" decoding="async" src="/team.webp" alt="The GeoData team on the stairs of Upson Hall" style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '1600/1066' }} />
          <figcaption className="team-photo-caption" style={{ position: 'absolute', bottom: 30, left: 30, background: '#086727', color: '#eaf2ee', fontFamily: "'Intan',sans-serif", fontSize: 'clamp(16px,2.2vw,24px)', letterSpacing: '0.04em', padding: '10px 22px', whiteSpace: 'nowrap' }}>Team Photo '25 – '26</figcaption>
        </figure>
      </div>
    </section>

    <SupportSection />
    </Descent>

    </>
  );
}
