// Chrome shared by the weather stages (Forecast and History). Lifted out of
// WeatherForecast so both render the same key, pickers and glass panels.
import { RESIPLE } from '../../styles/theme';
import type { Scale } from './wxClient';

// the key sits straight on the map - no card. Black ink with a white halo
// reads on the light basemap and any overlay alike. Vertical, highest value
// at the top, numbers inboard of the bar.
export const HALO = '0 0 4px rgba(255,255,255,0.95), 0 0 2px rgba(255,255,255,0.9)';

export const PANEL: React.CSSProperties = {
  background: 'rgba(14,20,28,0.82)', backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255,255,255,0.25)', color: '#e6ecf0', fontFamily: RESIPLE,
};

export function ColorScale({ scale, small }: { scale: Scale; small: boolean }) {
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
        {/* marginTop -0.5px closes the hairline seams that subpixel rounding
            opens up once a ramp has sixty bands rather than a dozen */}
        {scale.colors.map((c, i) => <span key={i} style={{ flex: 1, background: c, marginTop: -0.5 }} />)}
      </div>
    );
    // A scale may name the bounds worth labelling - temperature does, so the
    // freezing line always gets a number even though it sits among 60 bands.
    // Otherwise thin to about a dozen labels however many bands there are.
    if (scale.ticks) {
      ticks = scale.ticks
        .map((v) => ({ frac: scale.bounds!.indexOf(v) / n, v }))
        .filter((t) => t.frac >= 0);
    } else {
      const every = Math.max(1, Math.ceil(scale.bounds.length / 12));
      ticks = scale.bounds.map((v, i) => ({ frac: i / n, v })).filter((_, i) => i % every === 0);
    }
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

// the "MODEL"/"VARIABLE" caption box is the dropdown trigger, styled exactly
// like every option box. The current selection sits below it, always
// visible, in the same style; opening the dropdown adds the *other* options
// underneath that - the selected box never duplicates into the list.
export function PickerColumn({ label, value, valueId, options, open, onToggle, onPick, minWidth = 132 }: {
  label: string; value: string; valueId: string;
  options: { id: string; label: string }[];
  open: boolean; onToggle: () => void; onPick: (id: string) => void;
  minWidth?: number;
}) {
  const box = (active: boolean): React.CSSProperties => ({
    ...PANEL, cursor: 'pointer', padding: '7px 11px', minWidth, minHeight: 34,
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
        // the option list can outgrow the window once a dataset has 27
        // variables, so it scrolls rather than running off the bottom
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '46vh', overflowY: 'auto' }}>
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
