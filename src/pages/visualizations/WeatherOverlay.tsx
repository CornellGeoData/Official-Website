import { useLayoutEffect, useRef } from 'react';
import { latToY, lonToX, visibleRasterTiles, type Rect } from './mercator';
import type { Overlay } from './TileMap';
import { imageCache } from './wxClient';

export default function WeatherOverlay({ overlay, view, size }: {
  overlay: Overlay;
  view: { lat: number; lon: number; zoom: number };
  size: { w: number; h: number };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dpr = window.devicePixelRatio || 1;

  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !size.w || !size.h) return;
    const ctx = context;
    const images = imageCache;
    const { bounds, tiles, url } = overlay;
    const { zoom } = view;
    const imageRect = {
      x: lonToX(bounds.w, zoom) - lonToX(view.lon, zoom) + size.w / 2,
      y: latToY(bounds.n, zoom) - latToY(view.lat, zoom) + size.h / 2,
      w: lonToX(bounds.e, zoom) - lonToX(bounds.w, zoom),
      h: latToY(bounds.s, zoom) - latToY(bounds.n, zoom),
    };
    // The feed's overview fits within 1000 × 1000. Switch as soon as its
    // pixels would be enlarged, including on Retina screens.
    const useTiles = tiles && Math.max(imageRect.w, imageRect.h) * dpr > 1000;
    const visible = useTiles ? visibleRasterTiles(tiles, imageRect, size) : [];
    const urls = [url, ...visible.map(({ row, col }) => `${url.replace(/\.[^/.]+$/, '')}/${row}-${col}.webp`)];
    const requested = urls.map((src) => {
      let img = images.get(src);
      if (!img) {
        img = new Image();
        images.set(src, img);
        img.src = src;
      }
      return img;
    });
    const overview = requested[0];
    const pieces = visible.map(({ rect }, i) => ({ img: requested[i + 1], rect }));

    // Crop before drawing: a continent-wide <img> becomes millions of CSS
    // pixels at street zoom and can be downsampled by the browser compositor.
    function paint(img: HTMLImageElement, full: Rect, clip: Rect) {
      if (!img.complete || !img.naturalWidth) return;
      const x = Math.max(0, clip.x), y = Math.max(0, clip.y);
      const w = Math.min(size.w, clip.x + clip.w) - x;
      const h = Math.min(size.h, clip.y + clip.h) - y;
      if (w <= 0 || h <= 0) return;
      // Below native resolution (zoomed out), smooth so many model cells
      // blending into one screen pixel doesn't alias. Past native resolution
      // (zoomed in), switch to nearest-neighbor so real grid cells render as
      // crisp, well-defined blocks instead of a blurred interpolation.
      const magnification = (full.w / img.naturalWidth) * dpr;
      ctx.imageSmoothingEnabled = magnification <= 1;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img,
        (x - full.x) / full.w * img.naturalWidth, (y - full.y) / full.h * img.naturalHeight,
        w / full.w * img.naturalWidth, h / full.h * img.naturalHeight,
        x, y, w, h);
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      if (!pieces.length) paint(overview, imageRect, imageRect);
      for (const { img, rect } of pieces) {
        // Draw exactly one source per piece: transparent radar must replace
        // its preview, otherwise overlapping alpha makes echoes darker.
        if (img.complete && img.naturalWidth) paint(img, rect, rect);
        else paint(overview, imageRect, rect);
      }
    }
    requested.forEach((img) => img.addEventListener('load', draw));
    draw();
    return () => { requested.forEach((img) => img.removeEventListener('load', draw)); };
  }, [overlay, view, size, dpr]);

  return <canvas ref={canvas} aria-hidden="true" width={Math.round(size.w * dpr)} height={Math.round(size.h * dpr)}
    style={{ position: 'absolute', inset: 0, width: size.w, height: size.h, opacity: overlay.opacity, pointerEvents: 'none' }} />;
}
