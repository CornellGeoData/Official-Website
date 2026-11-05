// Everything on the home page that moves with scroll reads this one eased position, from one loop, so a wheel
// notch glides instead of jumping and the globe, map and projects stay in step at any refresh rate. The page
// itself scrolls natively.
//
// A critically damped spring, not a plain ease toward the target. A plain ease changes speed the instant the
// target moves, and real input is stair-stepped: scrollY holds for a few frames then leaps whenever the main
// thread is busy, so every leap kicked the map. The spring keeps speed continuous through flicks and reversals.

// How far behind the scrollbar it runs, in ms. Replaying recorded input through candidates, these two beat the old
// plain ease of 260 on jerk at no cost in lag: about 60% less on a wheel, 30% less and a little closer on a finger.
const LAG = { wheel: 260, touch: 180 };

export function springStep(y: number, v: number, target: number, dt: number, lag: number) {
  const w = 2 / lag, e = Math.exp(-w * dt), off = y - target, k = (v + w * off) * dt;
  return { y: target + (off + k) * e, v: (v - w * k) * e };
}

const listeners = new Set<(y: number) => void>();
let y = 0, v = 0, seen = 0, last = 0, frame = 0, lag = LAG.wheel;

const tick = (now: number) => {
  // cleared first, so a listener that throws can't leave wake() believing a frame is still coming
  frame = 0;
  const target = window.scrollY;
  // a nav link or the End key lands in one frame and shouldn't replay the whole journey. A hard fling
  // covers far less than this per frame, so it is never mistaken for one
  if (Math.abs(target - seen) > window.innerHeight * 3) { y = target; v = 0; }
  seen = target;
  // clamped: a long stall must not cause a jump
  ({ y, v } = springStep(y, v, target, last ? Math.min(64, now - last) : 16.7, lag));
  last = now;
  if (Math.abs(target - y) < 0.2 && Math.abs(v) < 0.02) { y = target; v = 0; }
  listeners.forEach((draw) => draw(y));
  if (y !== target) frame = requestAnimationFrame(tick);
};

const wake = () => {
  if (frame) return;
  last = 0;
  frame = requestAnimationFrame(tick);
};

export function onSmoothScroll(draw: (y: number) => void) {
  if (!listeners.size) {
    y = seen = window.scrollY; v = 0;
    lag = window.matchMedia('(pointer: coarse)').matches ? LAG.touch : LAG.wheel;
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake);
  }
  listeners.add(draw);
  draw(y);
  return () => {
    listeners.delete(draw);
    if (listeners.size) return;
    cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener('scroll', wake);
    window.removeEventListener('resize', wake);
  };
}
