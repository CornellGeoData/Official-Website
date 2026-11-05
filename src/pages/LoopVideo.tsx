import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

const toggle = (video: HTMLVideoElement) => {
  if (video.paused) video.play().catch(() => {});
  else video.pause();
};

// A muted looping clip. It downloads and plays only while on screen, stays on its
// poster for readers who prefer reduced motion, and a click or key pauses or plays it.
export function LoopVideo({ src, poster, label, style }: { src: string; poster: string; label: string; style?: CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current!;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.25 });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      tabIndex={0}
      aria-label={`${label} Select to pause or play.`}
      onClick={(e) => toggle(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(e.currentTarget); }
      }}
      style={{ display: 'block', width: '100%', cursor: 'pointer', ...style }}
    />
  );
}
