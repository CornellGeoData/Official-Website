import { useEffect, useRef } from 'react';
import { isSmallScreen } from './dive';

type Star = { x: number; y: number; r: number; a: number; tint: number; glint: boolean };

const TINTS = ['255,255,255', '214,228,255', '255,236,214'];

// soft round glow, drawn scaled per star/comet head
function makeGlow(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(235,243,255,0.75)');
  grad.addColorStop(0.45, 'rgba(190,215,255,0.18)');
  grad.addColorStop(1, 'rgba(190,215,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

// the clip's four-point sparkle: two thin tapered spikes crossed
function makeGlint(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const grad = g.createLinearGradient(32 - 32 * dx, 32 - 32 * dy, 32 + 32 * dx, 32 + 32 * dy);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    if (dx) g.fillRect(0, 31.2, 64, 1.6); else g.fillRect(31.2, 0, 1.6, 64);
  }
  return c;
}

function makeStars(w: number, h: number): Star[] {
  const n = Math.min(1800, Math.round((w * h) / 1000));
  return Array.from({ length: n }, () => {
    const k = Math.random();
    // 75% faint pinpricks, 20% mid, 5% bright
    const r = k < 0.75 ? 0.55 + Math.random() * 0.5 : k < 0.95 ? 0.95 + Math.random() * 0.55 : 1.6 + Math.random() * 0.7;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r,
      a: k < 0.75 ? 0.4 + Math.random() * 0.5 : 0.75 + Math.random() * 0.25,
      tint: Math.random() < 0.8 ? 0 : Math.random() < 0.7 ? 1 : 2,
      glint: k >= 0.95 && Math.random() < 0.35,
    };
  });
}

export default function Sky() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const glow = makeGlow();
    const glint = makeGlint();
    const small = isSmallScreen();
    let w = 0, h = 0, dpr = 0;
    let stars: Star[] = [];

    // The globe carries the motion; the sky only redraws when its size changes.
    const draw = () => {
      const nextW = canvas.clientWidth, nextH = canvas.clientHeight;
      const nextDpr = Math.min(window.devicePixelRatio, small ? 1.5 : 2);
      if (!nextW || !nextH || (w === nextW && h === nextH && dpr === nextDpr)) return;
      if (w === nextW && stars.length) for (const star of stars) star.y *= nextH / h;
      else stars = makeStars(nextW, nextH);
      w = nextW; h = nextH;
      dpr = nextDpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const star of stars) {
        if (star.r > 1.5) {
          const radius = star.r * 7;
          ctx.globalAlpha = star.a * 0.4;
          ctx.drawImage(glow, star.x - radius, star.y - radius, radius * 2, radius * 2);
        }
        if (star.glint) {
          const radius = star.r * 6;
          ctx.globalAlpha = star.a * 0.5;
          ctx.drawImage(glint, star.x - radius, star.y - radius, radius * 2, radius * 2);
        }
        ctx.globalAlpha = star.a * 0.75;
        ctx.fillStyle = `rgb(${TINTS[star.tint]})`;
        ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    draw();
    window.addEventListener('resize', draw);
    return () => {
      window.removeEventListener('resize', draw);
      canvas.width = canvas.height = glow.width = glow.height = glint.width = glint.height = 0;
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />;
}
