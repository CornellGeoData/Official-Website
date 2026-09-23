import { useEffect, useState } from 'react';
import { earthCrowdsHero } from './SpaceBackground';

// The hero is transparent: the globe it sits beside belongs to the page-wide
// SpaceBackground behind it.
export default function Hero() {
  // Where the globe would reach into a half-width column - phones, and any
  // window tall enough for it to grow past the copy - the copy takes the whole
  // stage instead.
  const [solo, setSolo] = useState(earthCrowdsHero);
  useEffect(() => {
    const onResize = () => setSolo(earthCrowdsHero());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <section className="globe-sticky" style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <div className={`hero-panel${solo ? ' hero-panel-solo' : ''}`} style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: 'min(560px,50%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 clamp(24px,5vw,72px)', zIndex: 10, pointerEvents: 'none' }}>
        <h1 className="hero-title" style={{ fontFamily: "'Intan',sans-serif", fontWeight: 700, fontSize: 'clamp(60px,8vw,120px)', lineHeight: 0.95, letterSpacing: '-0.03em', margin: '0 0 -0.19em -0.045em' }}>Geo<span style={{ color: '#086727' }}>Data</span></h1>
        <div style={{ fontFamily: "'Resiple',sans-serif", fontSize: 'clamp(16px,1.55vw,20px)', fontWeight: 700, letterSpacing: '0.17em', textTransform: 'uppercase', color: '#4fae7d', marginTop: 26 }}>Cornell University Project Team</div>
        <div style={{ marginTop: 34 }}>
          <a href="#join" style={{ display: 'inline-block', padding: '14px 28px', borderRadius: 999, background: '#086727', color: '#eaf2ee', fontWeight: 700, fontSize: 17.5, fontFamily: "'Resiple',sans-serif", pointerEvents: 'auto' }}>Join the team</a>
        </div>
      </div>
    </section>
  );
}
