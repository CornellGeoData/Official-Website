// How long the home page's animations take to catch up with the scrollbar, in ms. Everything that
// moves with scroll reads this one eased position, so a wheel notch glides instead of jumping and
// the globe, map and projects stay in step at any screen refresh rate. The page itself scrolls natively.
const LAG = 260;

export function onSmoothScroll(draw: (y: number) => void) {
  let y = window.scrollY, last = 0, frame = 0;
  const tick = (now: number) => {
    const target = window.scrollY;
    // clamped: a frame's timestamp can predate wake(), and a long stall must not cause a jump
    y += (target - y) * (1 - Math.exp(-Math.max(1, Math.min(50, now - last)) / LAG));
    last = now;
    // close enough to stop, or a jump (a nav link, the End key) that shouldn't replay the whole journey
    if (Math.abs(target - y) < 0.2 || Math.abs(target - y) > window.innerHeight * 3) y = target;
    draw(y);
    frame = y === target ? 0 : requestAnimationFrame(tick);
  };
  const wake = () => {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };
  draw(y);
  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('resize', wake);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', wake);
    window.removeEventListener('resize', wake);
  };
}
