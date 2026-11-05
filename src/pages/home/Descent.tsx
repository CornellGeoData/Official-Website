import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { RESIPLE, MANTI, fmtTag } from '../../styles/theme';
import { PROJECTS } from '../../data/content';
import type { Project } from '../../data/content';
import { LoopVideo } from '../LoopVideo';
import { onSmoothScroll } from './smoothScroll';
import { ITHACA, REGION, altitude, diveAt, regionFrame, rotated } from './dive';

// The home page under the hero, on two maps of the real terrain (USGS 3DEP elevation, see
// public/art). The globe's zoom lands on all the Finger Lakes, north up, then drops to the north end of
// Cayuga, where the lake map is turned so the water runs straight down the page. Scrolling follows
// it south, one project at a time on either side of it, and ends at Cornell.

// Cayuga's centre line, north to south, measured from the data: [fraction down, fraction across]
const LAKE = [[0.082, 0.506], [0.186, 0.479], [0.29, 0.391], [0.394, 0.345], [0.498, 0.359], [0.603, 0.358], [0.707, 0.396], [0.811, 0.493], [0.915, 0.483]];
const MAP_W = 2606, MAP_H = 4000;
// In the lake map's pixels: McGraw Tower (OSM 42.4476, -76.4850) through the
// UTM transform the map was rendered with; lake shore landmarks land within 200 m of the drawn water.
const CORNELL = { x: 1357, y: 3767 };
// lake names sit off whichever tip keeps them apart; minor ones give way on small screens
const LABELS = [
  { name: 'Conesus', x: -3260, y: -678, at: 'above', minor: true },
  { name: 'Hemlock', x: -3171, y: 499, at: 'below', minor: true },
  { name: 'Canadice', x: -3012, y: 436, at: 'right', minor: true },
  { name: 'Honeoye', x: -2518, y: -34, at: 'above', minor: true },
  { name: 'Canandaigua', x: -2184, y: 1098, at: 'below' },
  { name: 'Keuka', x: -2050, y: 2807, at: 'below' },
  { name: 'Seneca', x: 150, y: 353, at: 'above' },
  { name: 'Cayuga', x: 1339, y: 282, at: 'above', hero: true },
  { name: 'Owasco', x: 2159, y: 2043, at: 'below' },
  { name: 'Skaneateles', x: 2720, y: 806, at: 'above', minor: true },
  { name: 'Otisco', x: 3160, y: 1296, at: 'above', minor: true },
  { name: 'Rochester', x: -2075, y: -2471, at: 'right', city: true, minor: true },
  { name: 'Syracuse', x: 4232, y: 641, at: 'left', city: true },
  { name: 'Ithaca', x: ITHACA.x, y: ITHACA.y, at: 'below', city: true },
];
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function lakeAt(t: number) {
  const f = clamp(t) * (LAKE.length - 1), i = Math.min(LAKE.length - 2, Math.floor(f));
  return { y: mix(LAKE[i][0], LAKE[i + 1][0], f - i), x: mix(LAKE[i][1], LAKE[i + 1][1], ease(f - i)) };
}

function Statement({ lines }: { lines: string[] }) {
  return (
    <h2 className="statement" style={{ fontFamily: MANTI }}>
      {lines.map((line, i) => <span key={line} style={{ display: 'block', color: i === lines.length - 1 ? '#7fd0a4' : undefined }}>{line} </span>)}
    </h2>
  );
}

function Chapter({ project, onFocus }: { project: Project; onFocus: () => void }) {
  const tall = project.photoAspect === '4/5';
  const media = { aspectRatio: project.photoAspect ?? '16/10', objectFit: 'cover', objectPosition: project.photoPosition } as const;
  return (
    <article className="chapter" onFocusCapture={onFocus}>
      <div>
        <div className="chapter-tag" style={{ fontFamily: RESIPLE }}>{fmtTag(project.tag)}</div>
        <h3 className="chapter-title">
          {project.slug ? <a href={`#/posts/${project.slug}`} className="post-link" aria-label={`Read the ${project.title} post`}>{project.title}{' '}<span aria-hidden="true" style={{ color: '#7fd0a4' }}>→</span></a> : project.title}
        </h3>
        <p className="chapter-body">{project.body}</p>
      </div>
      <div className={`chapter-media map-frame${tall ? ' chapter-media-tall' : ''}`}>
        {project.video && project.photo
          ? <LoopVideo src={project.video.src} poster={project.photo} label={project.video.label} style={media} />
          : <img loading="lazy" decoding="async" src={project.photo} alt={project.title} style={{ display: 'block', width: '100%', ...media }} />}
      </div>
    </article>
  );
}

export function Descent({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const regionRef = useRef<HTMLImageElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const chaptersRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLElement>(null);
  const starRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const map = mapRef.current!, img = imgRef.current!, region = regionRef.current!, veil = veilRef.current!, fade = fadeRef.current!, labels = labelsRef.current!, star = starRef.current!, list = chaptersRef.current!, root = rootRef.current!, closing = closingRef.current!;
    const chapters = [...list.querySelectorAll<HTMLElement>('.chapter')];
    const stacked = window.matchMedia('(max-width: 1100px)');
    // z: 0 high over the region, 1 down at the lake. t: how far along the lake. inStage: 0 for the
    // big statements with the lake off to the right, 1 for the projects with it running between
    // the text and the photo.
    const cam = { z: 0, t: 0, inStage: 0 };
    let dive = 0; // the globe's zoom: 0 at rest, 1 once it has landed on the region map

    const draw = () => {
      const { x, y } = lakeAt(cam.t);
      const vw = window.innerWidth, vh = map.clientHeight;
      // the lake camera. Scales with the window so every width gets the same picture. Stacked layouts
      // push the lake to the right edge, which takes enough zoom that the map still fills the left.
      const k = stacked.matches ? Math.max(0.34, vw / 1200, vh / MAP_H) * 1.15 : Math.max(vw / MAP_W, vh / MAP_H) * mix(1.6, 1.22, cam.inStage);
      // stacked: the lake stays clear of the text column until the end brings Cornell into view.
      // wide: the middle of the gap between text and photo, which starts at the page margin. For the
      // opening statement, far enough left that Seneca stays out from under the words.
      const on = stacked.matches ? mix(0.86, 0.7, ease(clamp((cam.t - 0.9) * 10))) : mix(mix(0.72, 0.8, cam.t), 0.38 + Math.min(0.05, 72 / vw), cam.inStage);
      const qx = x * MAP_W, qy = y * MAP_H; // the point on the lake it follows
      const lakeX = clamp(vw * on - qx * k, vw - MAP_W * k, 0) + qx * k;
      // Use the full vertical travel on phones so edge clamps never pause the journey.
      const lakeY = stacked.matches ? qy * k + (vh - MAP_H * k) * cam.t : clamp(vh / 2 - qy * k, vh - MAP_H * k, 0) + qy * k;
      // the region camera, north up
      const landed = regionFrame(vw, vh, dive), kr = landed.k;
      const fromIthaca = rotated(qx - ITHACA.x, qy - ITHACA.y, -REGION.turn);
      const regionX = landed.x + fromIthaca.x * kr, regionY = landed.y + fromIthaca.y * kr;
      // the flight between them, even in scale rather than in distance
      const zz = cam.z, angle = -REGION.turn * (1 - zz);
      let sc = Math.exp(mix(Math.log(kr), Math.log(k), zz));
      const q = rotated(qx, qy, angle);
      let ox = mix(regionX, lakeX, zz) - q.x * sc, oy = mix(regionY, lakeY, zz) - q.y * sc;
      // coming down from space the map grows around Ithaca at exactly the globe's scale
      if (dive < 1) {
        sc *= altitude(1, vw, vh) / altitude(dive, vw, vh);
        const i = rotated(ITHACA.x, ITHACA.y, angle);
        ox = landed.x - i.x * sc; oy = landed.y - i.y * sc;
      }
      // The map is transparent: its lakes come up right over the same lakes in the satellite picture, then
      // the ground dims behind them into the page. The names arrive last, once there is room for them.
      const mapIn = ease(clamp((dive - 0.74) / 0.12));
      veil.style.opacity = fade.style.opacity = String(ease(clamp((dive - 0.8) / 0.17)));
      const place = (px: number, py: number) => {
        const p = rotated(px, py, angle);
        return `translate3d(${(ox + p.x * sc).toFixed(1)}px,${(oy + p.y * sc).toFixed(1)}px,0)`;
      };
      img.style.transform = `${place(0, 0)} rotate(${angle.toFixed(4)}rad) scale(${sc.toFixed(4)})`;
      img.style.opacity = String(ease(clamp((zz - 0.3) / 0.4)));
      region.style.transform = `${place(REGION.x, REGION.y)} rotate(${(angle + REGION.turn).toFixed(4)}rad) scale(${(sc * REGION.scale).toFixed(4)})`;
      // gone once the lake map fills the frame: this close its pixels would show as blur at the edges
      region.style.opacity = String(mapIn * (1 - ease(clamp((zz - 0.6) / 0.4))));
      star.style.transform = place(CORNELL.x, CORNELL.y);
      // Phones reveal Cornell while approaching the south end, before the closing statement.
      star.style.opacity = String(stacked.matches ? zz * ease(clamp((cam.t - 0.7) / 0.15)) : zz * (1 - cam.inStage) * ease(clamp((cam.t - 0.8) / 0.2)));
      labels.style.opacity = String(ease(clamp((dive - 0.9) / 0.1)) * (1 - clamp(zz * 4)));
      LABELS.forEach((l, i) => {
        const label = labels.children[i] as HTMLElement;
        label.style.transform = place(l.x, l.y);
      });
    };
    return onSmoothScroll((y) => {
      const vh = map.clientHeight, now = window.scrollY;
      const top = list.getBoundingClientRect().top + now, end = top + list.offsetHeight - vh;
      const hero = root.previousElementSibling as HTMLElement;
      const heroPin = hero.offsetHeight - (hero.firstElementChild as HTMLElement).clientHeight;
      dive = diveAt(y, heroPin);
      // Ease out of the fixed map, then follow the photo at native scroll speed.
      const c = closing.getBoundingClientRect();
      const release = vh / 2 - (c.top + c.height / 2), blend = vh * 0.3;
      const ramp = clamp((release + blend / 2) / blend);
      const gone = release >= blend / 2 ? release : blend * ramp * ramp / 2;
      map.style.transform = `translateY(${(-gone).toFixed(1)}px)`;
      map.style.visibility = dive <= 0.74 || gone > vh ? 'hidden' : 'visible';
      // Hold over the region, descend to Cayuga for the project statement, then follow the water south.
      const hold = top - vh, fly = root.querySelector('.opening')!.getBoundingClientRect().top + now + vh * 0.15;
      cam.z = ease(clamp((y - fly) / (hold - fly)));
      cam.t = clamp((y - hold) / (end - hold));
      cam.inStage = ease(clamp((y - top + vh * 1.1) / (vh * 1.1))) * (1 - ease(clamp((y - end) / vh)));
      draw();
      if (stacked.matches) return;
      const f = (y - top) / ((end - top) / (chapters.length - 1));
      chapters.forEach((el, i) => {
        const d = f - i;
        const near = (i === 0 && d < 0) || (i === chapters.length - 1 && d > 0) ? 0 : Math.abs(d);
        const [text, photo] = el.children as unknown as HTMLElement[];
        // one project leaves before the next arrives, with only the lake between them
        text.style.opacity = photo.style.opacity = String(ease(clamp((0.47 - near) / 0.27)));
        el.style.setProperty('--chapter-offset', `${(near === 0 ? 0 : -d * 60).toFixed(1)}px`);
        el.style.setProperty('--chapter-pointer-events', near < 0.3 ? 'auto' : 'none');
      });
    });
  }, []);

  // tabbing to a hidden project's link brings that project into the frame
  const showChapter = (i: number) => {
    const list = chaptersRef.current!;
    if (window.matchMedia('(max-width: 1100px), (prefers-reduced-motion: reduce)').matches) return;
    const top = list.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + ((list.offsetHeight - window.innerHeight) / (PROJECTS.length - 1)) * i });
  };

  return (
    <div ref={rootRef} className="descent">
      <div ref={mapRef} className="terrain" aria-hidden="true">
        <div ref={veilRef} className="terrain-veil" />
        <img ref={regionRef} className="terrain-region" src="/art/region.webp" alt="" width={2700} height={1700} decoding="async" />
        <img ref={imgRef} src="/art/terrain.webp" alt="" width={MAP_W} height={MAP_H} decoding="async" />
        <div ref={fadeRef} className="terrain-fade" />
        <div ref={labelsRef} className="map-labels">
          {LABELS.map((l) => (
            <div key={l.name} className={`map-label map-label-${l.at}${l.city ? ' map-city' : ''}${l.minor ? ' map-minor' : ''}${l.hero ? ' map-hero' : ''}`}><span>{l.name}</span></div>
          ))}
        </div>
        <div ref={starRef} className="terrain-star">
          <svg viewBox="0 0 24 24">
            <path className="terrain-star-tower" d="M12-3 14.1 3.6V6.2H15V10H14.4V25H9.6V10H9V6.2H9.9V3.6Z" />
            <path className="terrain-star-gaps" d="M10.7 7.1h.9v2h-.9zM12.4 7.1h.9v2h-.9z" /><circle className="terrain-star-gaps" cx="12" cy="13" r="1.45" />
          </svg>
          <span>Cornell University</span>
        </div>
      </div>
      <section id="finger-lakes" className="opening">
        <Statement lines={["New York's", 'Finger Lakes']} />
      </section>
      <section id="projects" className="opening">
        <Statement lines={['Instruments built by students,', 'deployed in the field']} />
      </section>
      <div ref={chaptersRef} className="chapters" style={{ '--n': PROJECTS.length } as React.CSSProperties}>
        <div className="stage">
          {PROJECTS.map((p, i) => <Chapter key={p.title} project={p} onFocus={() => showChapter(i)} />)}
        </div>
      </div>
      <section ref={closingRef} className="closing">
        <Statement lines={['The only project team', 'focused on, supported by, and for', 'Earth and Atmospheric Science']} />
      </section>
      {children}
    </div>
  );
}
