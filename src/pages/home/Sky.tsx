import { useEffect, useRef } from 'react';

// The hero's sky, on its own 2D canvas behind the earth (the globe canvas is
// transparent, so the earth occludes whatever passes behind it). Styled after
// the source clip's sky: a dense field of white stars, the brighter ones
// twinkling, a few with four-point glints, plus the occasional shooting star
// or slow comet. Faint stars are drawn once to an offscreen tile; per frame
// the tile is blitted twice (it drifts left and wraps) and only the twinkling
// stars and comets are drawn on top.

type Star = { x: number; y: number; r: number; a: number; tint: number; tw: number; ph: number; glint: boolean };
type Comet = { x: number; y: number; vx: number; vy: number; len: number; width: number; age: number; life: number; big: boolean };

const TINTS = ['255,255,255', '214,228,255', '255,236,214'];
// px per second the sky slides left: slow, but visibly moving
const DRIFT = 10;

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
    // 75% faint pinpricks, 20% mid, 5% bright - the bright ones carry the glow
    const r = k < 0.75 ? 0.55 + Math.random() * 0.5 : k < 0.95 ? 0.95 + Math.random() * 0.55 : 1.6 + Math.random() * 0.7;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r,
      a: k < 0.75 ? 0.4 + Math.random() * 0.5 : 0.75 + Math.random() * 0.25,
      tint: Math.random() < 0.8 ? 0 : Math.random() < 0.7 ? 1 : 2,
      tw: k < 0.75 ? 0 : 0.6 + Math.random() * 1.8,
      ph: Math.random() * Math.PI * 2,
      glint: k >= 0.95 && Math.random() < 0.35,
    };
  });
}

function spawnComet(w: number, h: number): Comet {
  const big = Math.random() < 0.25;
  // enters over the top edge or the right edge and heads down-left, so most
  // of its path crosses the open sky around the earth rather than the copy
  const angle = (Math.PI * (big ? 0.72 : 0.68)) + Math.random() * Math.PI * 0.12;
  const speed = big ? 140 + Math.random() * 90 : 520 + Math.random() * 380;
  const fromTop = Math.random() < 0.6;
  return {
    x: fromTop ? w * (0.35 + Math.random() * 0.7) : w + 20,
    y: fromTop ? -20 : h * Math.random() * 0.55,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    len: big ? 260 + Math.random() * 160 : 130 + Math.random() * 140,
    width: big ? 2.6 : 1.8,
    age: 0,
    life: big ? 3.2 + Math.random() * 1.4 : 0.9 + Math.random() * 0.7,
    big,
  };
}

export default function Sky() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const glow = makeGlow();
    const glint = makeGlint();
    const tile = document.createElement('canvas');
    let w = 0, h = 0, dpr = 1;
    let stars: Star[] = [];
    let twinklers: Star[] = [];
    let comets: Comet[] = [];
    let nextComet = 1.5 + Math.random() * 2;
    let t = 0, last = 0, raf = 0, visible = true;

    const resize = () => {
      const pw = w, ph = h;
      w = canvas.clientWidth; h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      // a phone's toolbar showing or hiding only changes the height: stretch
      // the same sky to fit rather than re-rolling every star mid-scroll
      if (w === pw && stars.length) for (const s of stars) s.y *= h / ph;
      else stars = makeStars(w, h);
      twinklers = stars.filter((s) => s.tw > 0);
      // the static tile holds every star that does not twinkle
      tile.width = canvas.width; tile.height = canvas.height;
      const tctx = tile.getContext('2d')!;
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const s of stars) {
        if (s.tw) continue;
        tctx.fillStyle = `rgba(${TINTS[s.tint]},${s.a})`;
        tctx.beginPath(); tctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); tctx.fill();
      }
      if (still) draw();
    };

    const drawStar = (s: Star, x: number) => {
      const a = s.a * (s.tw ? 0.55 + 0.45 * Math.sin(t * s.tw + s.ph) : 1);
      if (s.r > 1.5) {
        const g = s.r * 7;
        ctx.globalAlpha = a * 0.55;
        ctx.drawImage(glow, x - g, s.y - g, g * 2, g * 2);
      }
      if (s.glint) {
        const g = s.r * 9 * (0.7 + 0.3 * Math.sin(t * s.tw * 1.3 + s.ph));
        ctx.globalAlpha = a * 0.8;
        ctx.drawImage(glint, x - g, s.y - g, g * 2, g * 2);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${TINTS[s.tint]})`;
      ctx.beginPath(); ctx.arc(x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    };

    const drawComet = (c: Comet) => {
      const p = c.age / c.life;
      const a = Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.35);
      if (a <= 0) return;
      const sp = Math.hypot(c.vx, c.vy);
      const tx = c.x - (c.vx / sp) * c.len, ty = c.y - (c.vy / sp) * c.len;
      ctx.globalAlpha = a;
      const grad = ctx.createLinearGradient(c.x, c.y, tx, ty);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.25, c.big ? 'rgba(200,225,255,0.45)' : 'rgba(215,232,255,0.5)');
      grad.addColorStop(1, 'rgba(160,200,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = c.width;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tx, ty); ctx.stroke();
      if (c.big) {
        // a wider, fainter coma around the slow comets' tails
        ctx.globalAlpha = a * 0.35;
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - (c.vx / sp) * c.len * 0.45, c.y - (c.vy / sp) * c.len * 0.45); ctx.stroke();
      }
      const g = c.big ? 16 : 9;
      ctx.globalAlpha = a;
      ctx.drawImage(glow, c.x - g, c.y - g, g * 2, g * 2);
    };

    function draw() {
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.clearRect(0, 0, canvas.width, canvas.height);
      const off = ((t * DRIFT) % w) * dpr;
      ctx!.globalAlpha = 1;
      ctx!.drawImage(tile, -off, 0);
      ctx!.drawImage(tile, canvas.width - off, 0);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const shift = (t * DRIFT) % w;
      for (const s of twinklers) {
        let x = s.x - shift;
        if (x < -20) x += w;
        drawStar(s, x);
      }
      for (const c of comets) drawComet(c);
      ctx!.globalAlpha = 1;
    }

    const frame = (now: number) => {
      raf = 0;
      if (!visible) return;
      // clamp so a backgrounded tab does not resume with a jump
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      t += dt;
      nextComet -= dt;
      if (nextComet <= 0) {
        comets.push(spawnComet(w, h));
        nextComet = 3 + Math.random() * 6;
      }
      for (const c of comets) { c.age += dt; c.x += c.vx * dt; c.y += c.vy * dt; }
      comets = comets.filter((c) => c.age < c.life);
      draw();
      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener('resize', resize);
    // nothing to animate once the hero has scrolled away
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !still && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    });
    io.observe(canvas);
    if (!still) raf = requestAnimationFrame(frame);
    canvas.style.opacity = '1';
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none', opacity: 0, transition: 'opacity 600ms ease' }} />;
}
