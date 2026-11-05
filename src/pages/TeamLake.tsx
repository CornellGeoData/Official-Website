import { useState } from 'react';
import type { CSSProperties } from 'react';
import { SUBTEAM_COLORS } from '../data/content';

// One picture of Cayuga Lake from the USGS 3DEP elevation grid (see public/art). The land and
// lake are the same in every team's image; only the thematic data layer changes. A
// team's slice is a clipped window onto its own image, which is how a slice can widen on hover.

export const lensSrc = (team: string) => `/art/${team.toLowerCase()}.webp`;
export const lensSrcSet = (team: string) => `/art/${team.toLowerCase()}-1200.webp 1200w, /art/${team.toLowerCase()}.webp 2400w`;
// AVIF first: it keeps the thin colored lines' color, where WebP smears it (see scripts/art/publish.mjs)
export const lensAvif = (team: string) => `/art/${team.toLowerCase()}-1600.avif 1600w, /art/${team.toLowerCase()}.avif 3200w`;
export const teamAnchor = (team: string) => `team-${team}`;
export const teamInk = (team: string) => `color-mix(in srgb, ${SUBTEAM_COLORS[team] ?? '#7c909b'} 72%, #fff)`;

// Extend the six wedges to the square's edges; the map's round frame trims the outside.
const MOBILE_SLICES = [
  '50% 50%, 21.132% 0, 78.868% 0',
  '50% 50%, 78.868% 0, 100% 0, 100% 50%',
  '50% 50%, 100% 50%, 100% 100%, 78.868% 100%',
  '50% 50%, 78.868% 100%, 21.132% 100%',
  '50% 50%, 21.132% 100%, 0 100%, 0 50%',
  '50% 50%, 0 50%, 0 0, 21.132% 0',
];

const flyTo = (team: string) => {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const section = document.getElementById(teamAnchor(team));
  section?.querySelector('h3')?.focus({ preventScroll: true });
  section?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
};

export function TeamLake({ teams }: { teams: string[] }) {
  const [hot, setHot] = useState<number | null>(null);
  const grow = 2.3, rest = hot === null ? 1 : (teams.length - grow) / (teams.length - 1);
  const edges = [0];
  teams.forEach((_, i) => edges.push(edges[i] + ((hot === i ? grow : rest) / teams.length) * 100));
  return (
    <div className="lake-map" role="group" aria-label="Explore the six subteams" onMouseLeave={() => setHot(null)}>
      {teams.map((team, i) => (
        <button
          key={team}
          type="button"
          className="lens"
          aria-label={team === 'Leadership' ? 'Leadership' : `${team} team`}
          style={{
            clipPath: `inset(0 ${(100 - edges[i + 1]).toFixed(3)}% 0 ${edges[i].toFixed(3)}%)`,
            '--mobile-clip': `polygon(${MOBILE_SLICES[i]})`,
            '--label-x': `${50 + 32 * Math.cos((i * 60 - 90) * Math.PI / 180)}%`,
            '--label-y': `${50 + 32 * Math.sin((i * 60 - 90) * Math.PI / 180)}%`,
          } as CSSProperties}
          onMouseEnter={() => setHot(i)}
          onFocus={() => setHot(i)}
          onClick={() => flyTo(team)}
        >
          <picture>
            <source media="(max-width: 900px)" srcSet="/art/subteams-mobile.webp" />
            <source type="image/avif" srcSet={lensAvif(team)} sizes="100vw" />
            <img src={lensSrc(team)} srcSet={lensSrcSet(team)} sizes="100vw" alt="" decoding="async" draggable={false} />
          </picture>
          <span className="lens-label" style={{ left: `${edges[i]}%`, color: teamInk(team) }}>{team}</span>
        </button>
      ))}
    </div>
  );
}
