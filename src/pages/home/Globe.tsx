import { useEffect, useRef, useState } from 'react';
import Sky from './Sky';
import { onSmoothScroll } from './smoothScroll';
import { ITHACA_LATLON, diveAt } from './dive';

export default function Globe() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);
  // neither WebGL nor a 2D canvas: swap the canvas for a pre-rendered still
  const [noWebGL, setNoWebGL] = useState(false);
  // the hero stays pinned while the first stretch of scroll falls toward Ithaca,
  // fading out the copy and stars, until the terrain map takes over
  const trackRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const skyRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLAnchorElement | null>(null);
  const engineRef = useRef<{ zoom?: number } | undefined>(undefined);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return onSmoothScroll((y) => {
      const track = trackRef.current!;
      const pin = track.offsetHeight - (track.firstElementChild as HTMLElement).clientHeight;
      const p = Math.min(1, Math.max(0, y / Math.max(1, pin)));
      copyRef.current!.style.opacity = String(Math.max(0, 1 - p * 3));
      copyRef.current!.style.transform = `translateY(${(-p * 90).toFixed(1)}px)`;
      copyRef.current!.inert = p >= 1 / 3;
      scrollRef.current!.style.opacity = String(Math.max(0, 1 - p * 5));
      scrollRef.current!.inert = p >= 0.2;
      skyRef.current!.style.opacity = String(Math.max(0, 1 - p * 1.4));
      if (engineRef.current) engineRef.current.zoom = diveAt(y, pin);
    });
  }, []);

  useEffect(() => {
    // dynamic import keeps three.js out of the initial bundle - the hero copy
    // paints immediately and the globe streams in behind it
    let engine: { unmount(): void; project(lat: number, lon: number): { x: number; y: number; visible: boolean } | null; zoom?: number } | undefined;
    let cancelled = false;
    const canvasEl = canvasRef.current!;
    // the pin rides the globe, repositioned against each drawn frame
    const onFrame = () => {
      const el = pinRef.current;
      const p = engine?.project(ITHACA_LATLON.lat, ITHACA_LATLON.lon);
      if (!el) return;
      if (!p || !p.visible) { el.style.opacity = '0'; return; }
      el.style.opacity = '1';
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    };
    import('./globeEngine').then((mod) => {
      if (cancelled) return;
      const e = new mod.GlobeEngine(onFrame);
      engine = e;
      engineRef.current = e;
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        e.zoom = diveAt(window.scrollY, trackRef.current!.offsetHeight - canvasEl.clientHeight);
      }
      // no WebGL: the same globe, software-shaded on a 2D canvas; the
      // still image is only for browsers that refuse that too
      e.mount({ canvasEl, onNoWebGL: () => {
        e.unmount();
        import('./globe2d').then((m) => {
          if (cancelled) return;
          const g = new m.Globe2D(onFrame);
          if (g.mount(canvasEl)) engine = g;
          else setNoWebGL(true);
        });
      } });
    });
    return () => { cancelled = true; engine?.unmount(); engineRef.current = undefined; };
  }, []);

  return (
    <div ref={trackRef} className="hero-track">
    <section className="globe-sticky" style={{ width: '100%', overflow: 'hidden' }}>
      {/* stars and comets, behind the earth */}
      <div ref={skyRef} style={{ position: 'absolute', inset: 0 }}><Sky /></div>
      {!noWebGL && <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />}
      {!noWebGL && (
        <div ref={pinRef} aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, opacity: 0, width: 46, height: 46, display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: 5 }}>
          <span style={{ width: 14, height: 14, borderRadius: 999, background: '#ffffff', border: '2px solid #0e141c', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }} />
          <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 1, fontFamily: "'Resiple',sans-serif", fontSize: 12.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#e6ecf0', textShadow: '0 1px 6px rgba(0,0,0,0.9)', whiteSpace: 'nowrap' }}>Ithaca</span>
        </div>
      )}
      {noWebGL && <img className="globe-fallback" src="/globe-fallback.webp" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right center' }} />}
      {/* HERO */}
      <div ref={copyRef} className="hero-panel" style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: 'min(560px,50%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 clamp(24px,5vw,72px)', zIndex: 10, pointerEvents: 'none' }}>
        <h1 className="hero-title" style={{ fontFamily: "'Intan',sans-serif", fontWeight: 700, fontSize: 'clamp(60px,8vw,120px)', lineHeight: 0.95, letterSpacing: '-0.03em', margin: '0 0 -0.19em -0.045em' }}>Geo<span style={{ color: '#086727' }}>Data</span></h1>
        <div className="hero-subtitle" style={{ fontFamily: "'Resiple',sans-serif", fontSize: 'clamp(16px,1.55vw,20px)', fontWeight: 700, letterSpacing: '0.17em', textTransform: 'uppercase', color: '#4fae7d', marginTop: 26, textWrap: 'balance' }}>Cornell University Project Team</div>
        <div className="hero-desktop-action" style={{ marginTop: 34 }}>
          <a href="#support" style={{ display: 'inline-block', padding: '14px 28px', borderRadius: 999, background: '#086727', color: '#eaf2ee', fontWeight: 700, fontSize: 17.5, fontFamily: "'Resiple',sans-serif", pointerEvents: 'auto' }}>Support the team</a>
        </div>
      </div>
      <a ref={scrollRef} className="hero-scroll" href="#finger-lakes">Explore our work <span aria-hidden="true">↓</span></a>
    </section>
    </div>
  );
}
