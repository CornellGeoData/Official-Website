import { useEffect, useRef, useState } from 'react';
import { MANTI } from '../../styles/theme';
import { ALUMNI } from '../../data/content';

// Physics updates DOM transforms without triggering React renders.
export function AlumniPit({ alumni }: { alumni: typeof ALUMNI }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [still, setStill] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || still) return;
    let R = Math.min(60, wrap.clientWidth / 7);
    interface Ball { el: HTMLElement; x: number; y: number; vx: number; vy: number; rx: number; ry: number }
    const balls: Ball[] = Array.from(wrap.children as HTMLCollectionOf<HTMLElement>).map((el, i) => {
      el.style.width = el.style.height = `${R * 2}px`;
      // spawn stacked above the pit so they rain in on arrival
      const x = R + Math.random() * Math.max(1, wrap.clientWidth - 2 * R);
      const y = -R - i * R * 2.4;
      return { el, x, y, vx: (Math.random() - 0.5) * 120, vy: 0, rx: x, ry: y };
    });
    let W = wrap.clientWidth;
    let H = wrap.clientHeight;
    let quietFrames = 0;
    // wake everyone on resize - the walls/floor moved out from under sleepers
    const onResize = () => {
      const nextWidth = wrap.clientWidth;
      R = Math.min(60, nextWidth / 7);
      for (const b of balls) {
        b.x *= nextWidth / W;
        b.el.style.width = b.el.style.height = `${R * 2}px`;
      }
      W = nextWidth; H = wrap.clientHeight;
      quietFrames = 0;
      wake();
    };

    let dragged: Ball | null = null;
    let activePointer: number | null = null, offsetX = 0, offsetY = 0, movedAt = 0;
    const pointAt = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      return { px: e.clientX - r.left, py: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      if (activePointer !== null || e.button !== 0) return;
      const { px, py } = pointAt(e);
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if ((px - b.x) ** 2 + (py - b.y) ** 2 <= R * R) {
          dragged = b;
          activePointer = e.pointerId;
          offsetX = px - b.x; offsetY = py - b.y;
          movedAt = performance.now();
          b.vx = b.vy = 0;
          quietFrames = 0;
          wake();
          wrap.setPointerCapture(e.pointerId);
          break;
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragged || e.pointerId !== activePointer) return;
      const { px, py } = pointAt(e);
      const now = performance.now(), dt = Math.max(0.008, (now - movedAt) / 1000);
      const x = Math.max(R, Math.min(W - R, px - offsetX)), y = Math.min(H - R, py - offsetY);
      // Release velocity follows the gesture, with a cap to keep fast flicks in the collision solver.
      dragged.vx = Math.max(-1200, Math.min(1200, (x - dragged.x) / dt));
      dragged.vy = Math.max(-1200, Math.min(1200, (y - dragged.y) / dt));
      dragged.x = x; dragged.y = y; movedAt = now;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      if (dragged && (e.type !== 'pointerup' || performance.now() - movedAt > 80)) dragged.vx = dragged.vy = 0;
      dragged = null; activePointer = null;
      if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
    };
    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointercancel', onUp);
    wrap.addEventListener('lostpointercapture', onUp);

    const G = 1800;
    const REST = 0.78;
    // Sleep the pile together only after every contact has settled.
    const SLEEP_AT = 45;
    let raf = 0;
    let last = performance.now(), visible = false;
    const wake = () => {
      if (!visible || document.hidden || raf || quietFrames >= SLEEP_AT) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    };
    const step = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      if (dragged && now - movedAt > 80) dragged.vx = dragged.vy = 0;
      for (const b of balls) {
        b.rx = b.x; b.ry = b.y;
        if (b === dragged) continue;
        b.vy += G * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < R) { b.x = R; b.vx = -b.vx * REST; }
        else if (b.x > W - R) { b.x = W - R; b.vx = -b.vx * REST; }
        // no ceiling - a hard throw arcs out the top and falls back in
        // slow floor contacts don't rebound, otherwise gravity feeds a
        // tiny bounce every frame and the pile vibrates forever
        if (b.y > H - R) { b.y = H - R; b.vy = -b.vy * REST; b.vx *= 0.96; if (-b.vy < 60) b.vy = 0; }
      }
      // Multiple contact passes carry the weight through the whole stack.
      for (let iter = 0; iter < 64; iter++) {
        for (const b of balls) {
          if (b.x < R) { b.x = R; b.vx = Math.max(0, b.vx); }
          else if (b.x > W - R) { b.x = W - R; b.vx = Math.min(0, b.vx); }
          if (b.y >= H - R) { b.y = H - R; b.vy = Math.min(0, b.vy); }
        }
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i], b = balls[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy);
            if (d >= 2 * R) continue;
            const nx = d === 0 ? 1 : dx / d, ny = d === 0 ? 0 : dy / d;
            const aMass = a === dragged ? 0 : 1, bMass = b === dragged ? 0 : 1;
            const mass = aMass + bMass;
            const push = (2 * R - d) / mass;
            a.x -= nx * push * aMass; a.y -= ny * push * aMass;
            b.x += nx * push * bMass; b.y += ny * push * bMass;
            const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rvn < 0) {
              const impulse = -(1 + (rvn < -80 ? REST : 0)) * rvn / mass;
              a.vx -= impulse * nx * aMass; a.vy -= impulse * ny * aMass;
              b.vx += impulse * nx * bMass; b.vy += impulse * ny * bMass;
            }
          }
        }
      }
      let quiet = !dragged;
      for (const b of balls) {
        b.x = Math.max(R, Math.min(W - R, b.x));
        b.y = Math.min(H - R, b.y);
        if (Math.hypot(b.x - b.rx, b.y - b.ry) > 0.15 || Math.hypot(b.vx, b.vy) > 40) quiet = false;
        b.el.style.transform = `translate(${b.x - R}px, ${b.y - R}px)`;
      }
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          if (Math.hypot(balls[j].x - balls[i].x, balls[j].y - balls[i].y) < 2 * R - 0.5) quiet = false;
        }
      }
      quietFrames = quiet ? quietFrames + 1 : 0;
      if (quietFrames < SLEEP_AT) raf = requestAnimationFrame(step);
      else for (const b of balls) b.vx = b.vy = 0;
    };
    // Pause the simulation once settled or outside the viewport.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
      else { cancelAnimationFrame(raf); raf = 0; }
    });
    io.observe(wrap);
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(wrap);
    document.addEventListener('visibilitychange', wake);

    return () => {
      io.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', wake);
      wrap.removeEventListener('pointerdown', onDown);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerup', onUp);
      wrap.removeEventListener('pointercancel', onUp);
      wrap.removeEventListener('lostpointercapture', onUp);
    };
  }, [still, alumni]);

  return (
    <div ref={wrapRef} className={`alumni-pit${still ? ' alumni-pit-static' : ''}`} style={{ position: 'relative', height: 'clamp(340px,48vw,500px)', overflow: 'hidden', touchAction: 'pan-y', background: '#121a23', WebkitTapHighlightColor: 'transparent', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      {alumni.map((a, i) => (
        <div key={`${still}:${i}`} title={a.place} style={{ position: 'absolute', top: 0, left: 0, transform: 'translate(-100vw,0)', borderRadius: 999, background: '#e6ecf0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', willChange: 'transform', touchAction: still ? 'pan-y' : 'none', cursor: still ? 'auto' : 'grab' }}>
          {a.logo ? (
            <img src={a.logo} alt={a.place} draggable={false} style={{ width: '68%', height: '68%', objectFit: 'contain', pointerEvents: 'none' }} />
          ) : (
            <span style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 26, color: '#0e141c', pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}>{a.place.split(' ').map((w) => w[0]).join('').slice(0, 3)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
