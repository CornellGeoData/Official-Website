import { useEffect, useRef, useState } from 'react';

// a static starfield for the mobile hero - same colour and sparseness as the
// Points cloud the 3D engine scatters around the desktop globe
const STARS = Array.from({ length: 90 }, () => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
  r: Math.random() < 0.25 ? 1.2 : 0.7,
  o: 0.3 + Math.random() * 0.45,
}));

// Ithaca's position on the home globe.
const ITHACA = { lat: 42.4474, lon: -76.4641 };

// Where the globe lands, read off globeEngine's camera: the group sits at
// 0.44 of a half-width right of centre, so its centre is always 72% across the
// viewport, and the 42-degree vertical field of view makes the drawn sphere
// 0.219 of the viewport height in radius. The hero column runs to
// min(560px, half the width), and 32px keeps the text off the limb.
const GLOBE_CENTRE = 0.72;
const GLOBE_RADIUS = 0.219;
const HERO_CLEARANCE = 32;
function earthCrowdsHero() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w <= 720) return true;
  return w * GLOBE_CENTRE - h * GLOBE_RADIUS < Math.min(560, w / 2) + HERO_CLEARANCE;
}

export default function Globe() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);
  // WebGL blocked (Firefox resistFingerprinting, blocklisted drivers, etc.):
  // swap the canvas for a pre-rendered still of the same scene
  const [noWebGL, setNoWebGL] = useState(false);
  // The earth only earns its place when it clears the hero copy, which was
  // always the point of parking it right of centre. Where it would reach into
  // the text - phones, and any window tall enough for the sphere to grow past
  // the hero column - the hero runs on the starfield alone and the engine
  // chunk is never even downloaded.
  const [earthHidden, setEarthHidden] = useState(earthCrowdsHero);
  useEffect(() => {
    const onResize = () => setEarthHidden(earthCrowdsHero());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (earthHidden) return;
    // dynamic import keeps three.js out of the initial bundle - the hero copy
    // paints immediately and the globe streams in behind it
    let engine: { unmount(): void } | undefined;
    let cancelled = false;
    const canvasEl = canvasRef.current!;
    import('./globeEngine').then((mod) => {
      if (cancelled) return;
      // the pin rides the globe, repositioned against each drawn frame
      const onFrame = () => {
        const el = pinRef.current;
        const p = e.project(ITHACA.lat, ITHACA.lon);
        if (!el) return;
        if (!p || !p.visible) { el.style.opacity = '0'; return; }
        el.style.opacity = '1';
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      };
      const e = new mod.GlobeEngine(onFrame);
      e.mount({ canvasEl, onNoWebGL: () => setNoWebGL(true) });
      engine = e;
    });
    return () => { cancelled = true; engine?.unmount(); };
  }, [earthHidden]);

  return (
    <section className="globe-sticky" style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      {!earthHidden && !noWebGL && <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />}
      {!earthHidden && !noWebGL && (
        <div ref={pinRef} aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, opacity: 0, width: 46, height: 46, display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: 5 }}>
          <span style={{ width: 14, height: 14, borderRadius: 999, background: '#ffffff', border: '2px solid #0e141c', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }} />
          <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 1, fontFamily: "'Resiple',sans-serif", fontSize: 12.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#e6ecf0', textShadow: '0 1px 6px rgba(0,0,0,0.9)', whiteSpace: 'nowrap' }}>Ithaca</span>
        </div>
      )}
      {!earthHidden && noWebGL && <img src="/globe-fallback.webp" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right center' }} />}
      {/* no earth: just the engine's starfield - two identical tiles
          drifting left in a seamless loop, the CSS twin of the 3D scene's
          slow stars.rotation.y */}
      {earthHidden && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '200%', display: 'flex', animation: 'star-drift 90s linear infinite' }}>
            {[0, 1].map((k) => (
              <svg key={k} style={{ width: '50%', height: '100%' }}>
                {STARS.map((s, i) => <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="#7d99a8" opacity={s.o} />)}
              </svg>
            ))}
          </div>
        </div>
      )}

      {/* HERO */}
      <div className={`hero-panel${earthHidden ? ' hero-panel-solo' : ''}`} style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: 'min(560px,50%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 clamp(24px,5vw,72px)', zIndex: 10, pointerEvents: 'none' }}>
        <h1 className="hero-title" style={{ fontFamily: "'Intan',sans-serif", fontWeight: 700, fontSize: 'clamp(60px,8vw,120px)', lineHeight: 0.95, letterSpacing: '-0.03em', margin: '0 0 -0.19em -0.045em' }}>Geo<span style={{ color: '#086727' }}>Data</span></h1>
        <div style={{ fontFamily: "'Resiple',sans-serif", fontSize: 'clamp(16px,1.55vw,20px)', fontWeight: 700, letterSpacing: '0.17em', textTransform: 'uppercase', color: '#4fae7d', marginTop: 26 }}>Cornell University Project Team</div>
        <div style={{ marginTop: 34 }}>
          <a href="#join" style={{ display: 'inline-block', padding: '14px 28px', borderRadius: 999, background: '#086727', color: '#eaf2ee', fontWeight: 700, fontSize: 17.5, fontFamily: "'Resiple',sans-serif", pointerEvents: 'auto' }}>Join the team</a>
        </div>
      </div>
    </section>
  );
}
