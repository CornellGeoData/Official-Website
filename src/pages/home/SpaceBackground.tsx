import { useEffect, useRef, useState } from 'react';

// The home page's whole background: one fixed layer of space that every
// section scrolls over. Two pieces make it:
//
//   space-full.webp       the scene as a still - the clip's frame, its black
//                         sky tinted to the page navy, extended left into a
//                         starfield cloned from the clip's own stars so the
//                         copy sits on dark sky. 2.865:1, wide enough to cover
//                         any desktop window.
//   earth-globe-full.mp4  a 1280px square around the whole globe making one
//                         full turn in 30.25s, at the clip's own speed. The
//                         clip only turns half way, so it was factored into a
//                         world map and its view-fixed lighting (sun, terminator,
//                         haze, rim); the globe is that map spun under that
//                         lighting, which reproduces the clip where it looked
//                         and extends it, recoloured Blue Marble filling the
//                         side it never showed. The night side, the twinkling
//                         sky and the star glints are the clip's own frames
//                         (three passes of a 242-frame sky loop per turn). Its
//                         edges are feathered into the still's exact pixels,
//                         and its first frame is painted into the still, so
//                         starting it changes nothing on screen.
//
// Only the globe moves, so the browser decodes 1.6MP per frame instead of a
// full-window video, and nothing blends or masks at runtime.
//
// Geometry, in the still's own coordinates (6188 x 2160 at full size): the
// video square spans SQUARE, centred on the globe (radius 986). The still is
// always the window's full height, placed so x = 4208 lands GLOBE_X across.
//
// A phone is too narrow for that: the globe would fill the screen behind the
// copy. There the still shrinks to 70% of the height and drops so the globe
// rises from the bottom edge (centre at 95% down: 95 - 47.2% of 70 = 62% for
// the still's top), its top edge fading into the same still's starfield, which
// fills the window behind it from the one image already downloaded.
const STILL_ASPECT = 6188 / 2160;
const SQUARE = { x: 3248, y: 34, size: 2064 };
const PHONE = 720;
const GLOBE_X = 0.72;
const GLOBE_RADIUS = 458 / 1080;
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

// Where the globe would reach under the hero copy (the column runs to
// min(560px, half the width), plus 32px of air), a gradient darkens the left of
// the window so the copy still reads.
export function earthCrowdsHero() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w <= PHONE) return true;
  return w * GLOBE_X - h * GLOBE_RADIUS < Math.min(560, w / 2) + 32;
}

// how dark the scene gets once the hero has scrolled away, so body copy reads
const MAX_DIM = 0.72;

export default function SpaceBackground() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dimRef = useRef<HTMLDivElement | null>(null);
  const [crowded, setCrowded] = useState(earthCrowdsHero);
  const [phone, setPhone] = useState(() => window.innerWidth <= PHONE);
  // phones and reduced-motion get the still alone: no video download, no decoding
  const [still] = useState(() => window.innerWidth <= PHONE || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // the video waits until the page itself has finished loading
  const [pageLoaded, setPageLoaded] = useState(() => document.readyState === 'complete');
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const onResize = () => { setCrowded(earthCrowdsHero()); setPhone(window.innerWidth <= PHONE); };
    const onLoad = () => setPageLoaded(true);
    window.addEventListener('resize', onResize);
    window.addEventListener('load', onLoad);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('load', onLoad);
    };
  }, []);

  // One passive scroll handler, batched to a frame: fades the scene down as
  // the hero leaves (an opacity change the compositor applies without
  // repainting), and stops the globe once it sits under full dimming, so
  // reading the rest of the page costs no video decoding at all.
  useEffect(() => {
    let raf = 0, running: boolean | undefined;
    const update = () => {
      raf = 0;
      const progress = Math.min(1, window.scrollY / window.innerHeight);
      if (dimRef.current) dimRef.current.style.opacity = String(progress * MAX_DIM);
      const video = videoRef.current;
      if (!video || !pageLoaded) return;
      const shouldRun = progress < 1;
      if (shouldRun === running) return;
      running = shouldRun;
      if (shouldRun) video.play().catch(() => {});
      else video.pause();
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [pageLoaded]);

  const fadeTop = 'linear-gradient(to bottom, transparent 0%, #000 22%)';
  return (
    <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100lvh', zIndex: 0, overflow: 'hidden', pointerEvents: 'none', background: phone ? '#0e141c url(/space-full.webp) left top / auto 100% no-repeat' : '#0e141c' }}>
      <div style={{ position: 'absolute', top: phone ? '62%' : 0, left: pct(phone ? 0.6 : GLOBE_X), height: phone ? '70%' : '100%', aspectRatio: String(STILL_ASPECT), transform: `translateX(-${pct(4208 / 6188)})`, maskImage: phone ? fadeTop : undefined, WebkitMaskImage: phone ? fadeTop : undefined }}>
        <img src="/space-full.webp" alt="" style={{ display: 'block', width: '100%', height: '100%' }} />
        {!still && (
          <video
            ref={videoRef}
            src={pageLoaded ? '/earth-globe-full.mp4' : undefined}
            muted loop playsInline preload="auto" disablePictureInPicture
            onPlaying={() => setPlaying(true)}
            style={{ position: 'absolute', left: pct(SQUARE.x / 6188), top: pct(SQUARE.y / 2160), width: pct(SQUARE.size / 6188), height: pct(SQUARE.size / 2160), borderRadius: '50%', opacity: playing ? 1 : 0 }}
          />
        )}
      </div>
      {crowded && !phone && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(14,20,28,0.88) 0%, rgba(14,20,28,0.62) 50%, rgba(14,20,28,0.15) 85%)' }} />}
      <div ref={dimRef} style={{ position: 'absolute', inset: 0, background: '#0e141c', opacity: 0 }} />
    </div>
  );
}
