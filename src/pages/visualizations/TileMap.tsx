import { useEffect, useRef, useState } from 'react';
import { TILE, lonToX, latToY, xToLon, yToLat, type RasterTiles } from './mercator';
import { AIR, SOIL, WEATHER, type MapSite } from './sensorData';
import { RESIPLE } from '../../styles/theme';
import WeatherOverlay from './WeatherOverlay';

// Esri World Imagery uses {z}/{y}/{x} tile order.
const TILE_URL = (z: number, x: number, y: number) =>
  `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const ATTRIBUTION = 'Imagery: Esri, Maxar, Earthstar Geographics';

const MIN_Z = 11;
const MAX_Z = 20;

// a georeferenced image (rendered in EPSG:3857) stretched between two mercator
// corners - how the Forecast View drapes weather fields over the tiles
export interface Overlay {
  url: string;
  bounds: { n: number; s: number; w: number; e: number };
  opacity: number;
  tiles?: RasterTiles;
}
// phones get a compact legend; decided once, like every other mobile fork here
const SMALL = window.matchMedia('(max-width: 720px)').matches;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export interface MapTarget { lat: number; lon: number; zoom: number; nonce: number }

export default function TileMap({ sites, selectedIds, onSelect, target, initial, onView, dur = 1400, tileUrl = TILE_URL, attribution = ATTRIBUTION, minZ = MIN_Z, maxZ = MAX_Z, overlays, gridBounds, onPick, showLegend }: {
  sites: MapSite[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  // the map eases to this whenever `nonce` changes
  target: MapTarget;
  // where the map opens before easing to the first target - a wide framing, so
  // arriving from the globe continues the fall instead of cutting to the ground
  initial?: { lat: number; lon: number; zoom: number };
  // reports the live view, so an overlay anchored to a pin can follow it
  onView?: (v: { lat: number; lon: number; zoom: number }) => void;
  dur?: number;
  // Forecast View re-skins the same map: light tiles, regional zoom bounds,
  // weather overlays. Defaults keep the sensor Map View exactly as it was.
  tileUrl?: (z: number, x: number, y: number) => string;
  attribution?: string;
  minZ?: number;
  maxZ?: number;
  overlays?: Overlay[];
  gridBounds?: Overlay['bounds'];
  // a non-drag click on empty map reports its lat/lon - the Forecast View's
  // point probe. Clicks on pins still go to onSelect, never here.
  onPick?: (lat: number, lon: number) => void;
  // the sensor legend only decodes pin families; a probe pin isn't one
  showLegend?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // tiles fade in on arrival instead of popping; once seen, a tile stays
  // opaque across re-renders (the set outlives the onLoad DOM write)
  const seen = useRef(new Set<string>()).current;
  const [view, setView] = useState(initial ?? { lat: target.lat, lon: target.lon, zoom: target.zoom });
  const fittedGrid = useRef('');
  const viewRef = useRef(view);
  viewRef.current = view;
  // the pan/pinch handlers are attached once; they read the zoom bounds
  // through a ref so prop changes never re-wire the listeners
  const zBounds = useRef({ minZ, maxZ });
  zBounds.current = { minZ, maxZ };
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Refit when the source domain changes, leaving room for forecast controls.
  useEffect(() => {
    if (!gridBounds || !size.w || !size.h) return;
    const key = [gridBounds.n, gridBounds.s, gridBounds.w, gridBounds.e, size.w, size.h].join(',');
    if (fittedGrid.current === key) return;
    fittedGrid.current = key;
    const dx = lonToX(gridBounds.e, 0) - lonToX(gridBounds.w, 0);
    const y0 = latToY(gridBounds.n, 0);
    const y1 = latToY(gridBounds.s, 0);
    const zoom = Math.log2(Math.min(Math.max(100, size.w - 64) / dx, Math.max(100, size.h - 250) / (y1 - y0)));
    setView({ lon: (gridBounds.w + gridBounds.e) / 2, lat: yToLat((y0 + y1) / 2, 0), zoom: clamp(zoom, minZ, maxZ) });
  }, [gridBounds, size, minZ, maxZ]);

  // ease to each new target rather than jumping, so arriving from the globe and
  // moving between sensors read as the same continuous descent
  useEffect(() => {
    if (gridBounds && target.nonce === 0) return;
    const from = { ...viewRef.current };
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const k = easeInOut(Math.min(1, (performance.now() - t0) / dur));
      setView({
        lat: from.lat + (target.lat - from.lat) * k,
        lon: from.lon + (target.lon - from.lon) * k,
        zoom: from.zoom + (target.zoom - from.zoom) * k,
      });
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.nonce]);

  // ---- panning and pinch: one pointer pans, two zoom (globeEngine's idiom) ----
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let pinchSpan = 0;
    const span = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pts.size === 2) pinchSpan = span();
      el.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const v = viewRef.current;
      if (pts.size >= 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const s = span();
        // Pinch zoom is anchored to the map center.
        setView({ ...v, zoom: clamp(v.zoom + Math.log2(s / (pinchSpan || s)), zBounds.current.minZ, zBounds.current.maxZ) });
        pinchSpan = s;
        return;
      }
      const z = v.zoom;
      const cx = lonToX(v.lon, z) - (e.clientX - p.x);
      const cy = latToY(v.lat, z) - (e.clientY - p.y);
      p.x = e.clientX;
      p.y = e.clientY;
      setView({ lat: yToLat(cy, z), lon: xToLon(cx, z), zoom: z });
    };
    const up = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      // a still finger (or mouse) that was the only pointer = a pick, not a pan
      if (p && pts.size === 1 && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 6 && onPickRef.current) {
        const rect = el.getBoundingClientRect();
        const v = viewRef.current;
        const lon = xToLon(lonToX(v.lon, v.zoom) + (e.clientX - rect.left - rect.width / 2), v.zoom);
        const lat = yToLat(latToY(v.lat, v.zoom) + (e.clientY - rect.top - rect.height / 2), v.zoom);
        onPickRef.current(lat, lon);
      }
      pts.delete(e.pointerId);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (pts.size < 2) pinchSpan = 0;
      if (pts.size === 0) el.style.cursor = 'grab';
    };
    // unlike the globe, the map owns a plain wheel too: the imagery fills the
    // page, so scrolling reads as zoom, not as leaving
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      setView({ ...v, zoom: clamp(v.zoom - e.deltaY * 0.01, zBounds.current.minZ, zBounds.current.maxZ) });
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, []);

  useEffect(() => { onView?.(view); }, [view, onView]);

  const { w, h } = size;
  const midX = w / 2;
  const Z = clamp(Math.round(view.zoom), minZ, maxZ);
  const scale = 2 ** (view.zoom - Z);

  // one integer zoom level's worth of tiles, centred on the view
  const layer = (lvl: number) => {
    if (!w || !h) return null;
    const s = 2 ** (view.zoom - lvl);
    const cx = lonToX(view.lon, lvl);
    const cy = latToY(view.lat, lvl);
    const halfW = w / 2 / s + TILE;
    const halfH = h / 2 / s + TILE;
    const n = 2 ** lvl;
    const out = [];
    for (let x = Math.floor((cx - halfW) / TILE); x <= Math.floor((cx + halfW) / TILE); x++) {
      for (let y = Math.floor((cy - halfH) / TILE); y <= Math.floor((cy + halfH) / TILE); y++) {
        if (y < 0 || y >= n) continue;
        const wx = ((x % n) + n) % n;
        const url = tileUrl(lvl, wx, y);
        out.push(
          <img
            key={`${lvl}/${x}/${y}`}
            src={url}
            alt=""
            draggable={false}
            decoding="async"
            // load can complete before React wires the handler (memory cache,
            // remounts) - the ref callback catches those, onLoad the rest
            ref={(el) => { if (el && el.complete && el.naturalWidth > 0) { seen.add(url); el.style.opacity = '1'; } }}
            onLoad={(e) => { seen.add(url); e.currentTarget.style.opacity = '1'; }}
            style={{ position: 'absolute', left: x * TILE - cx, top: y * TILE - cy, width: TILE, height: TILE, userSelect: 'none', opacity: seen.has(url) ? 1 : 0, transition: 'opacity 250ms ease' }}
          />,
        );
      }
    }
    return (
      <div style={{ position: 'absolute', left: midX, top: h / 2, transform: `scale(${s})`, transformOrigin: '0 0' }}>
        {out}
      </div>
    );
  };

  const cx = lonToX(view.lon, Z);
  const cy = latToY(view.lat, Z);
  const screen = (s: MapSite) => ({
    x: (lonToX(s.lon, Z) - cx) * scale + midX,
    y: (latToY(s.lat, Z) - cy) * scale + h / 2,
  });

  return (
    // touchAction none: the map fills a page that never scrolls, so every
    // finger gesture belongs to pan/pinch, not the browser
    <div ref={boxRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'grab', background: '#0e141c', touchAction: 'none' }}>
      {/* the parent level sits underneath so a zoom step never shows through to
          nothing while the finer tiles are still arriving */}
      {Z > minZ && layer(Z - 1)}
      {layer(Z)}

      {overlays?.map((o) => <WeatherOverlay key={o.url} overlay={o} view={view} size={size} />)}

      {/* Jefferson-style markers: the color is the information - a solid dot
          per family, hollow for retired, no names printed on the map. The
          name fades in on hover and stays while selected; the legend below
          decodes the colors. */}
      <style>{'.pin-label{opacity:0;transition:opacity .15s ease}button:hover>.pin-label{opacity:1}'}</style>
      {sites.map((s) => {
        const p = screen(s);
        if (!w || p.x < -80 || p.y < -40 || p.x > w + 80 || p.y > h + 40) return null;
        const on = selectedIds.includes(s.id);
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            aria-label={`${s.name} - ${s.sub}`}
            style={{
              position: 'absolute', left: p.x, top: p.y, width: 0, height: 0, overflow: 'visible',
              appearance: 'none', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0,
            }}
          >
            {/* invisible 34px halo: finger-sized tap target, visual unchanged */}
            <span style={{ position: 'absolute', left: -17, top: -17, width: 34, height: 34, borderRadius: 999 }} />
            <span style={{
              position: 'absolute', left: -8, top: -8, width: 16, height: 16, borderRadius: 999,
              background: s.retired ? 'transparent' : s.tone,
              border: s.retired ? `2px solid ${s.tone}` : '2px solid rgba(14,20,28,0.9)',
              // retired rings are hollow, so they get a dark line on both faces
              // of the tone ring to hold their edge against any imagery
              boxShadow:
                (s.retired ? 'inset 0 0 0 1.5px rgba(14,20,28,0.9), 0 0 0 1.5px rgba(14,20,28,0.9), ' : '') +
                (on ? `0 0 0 ${s.retired ? 4.5 : 3}px #ffffff, 0 0 16px ${s.tone}` : `0 0 9px ${s.tone}80, 0 1px 4px rgba(0,0,0,0.5)`),
              transition: 'box-shadow .18s',
            }} />
            <span className="pin-label" style={{
              position: 'absolute', left: 0, top: s.labelBelow ? 14 : -32, transform: 'translateX(-50%)', whiteSpace: 'nowrap',
              fontFamily: RESIPLE, fontSize: 12.5, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#ffffff', textShadow: '0 1px 4px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.6)',
              opacity: on ? 1 : undefined, pointerEvents: 'none',
            }}>
              {s.name}
            </span>
          </button>
        );
      })}

      {/* the legend that lets the dots stay wordless - compact on phones, and
          raised there so the attribution line below never runs through it.
          No sites (Forecast View) = nothing to decode = no legend. */}
      {(showLegend ?? true) && sites.length > 0 && <div style={{
        position: 'absolute', left: 14, bottom: SMALL ? 22 : 12, display: 'flex', flexWrap: 'wrap', gap: SMALL ? '4px 10px' : '6px 18px', alignItems: 'center', maxWidth: 'calc(100% - 28px)',
        padding: SMALL ? '5px 9px' : '8px 14px', background: 'rgba(14,20,28,0.72)', backdropFilter: 'blur(6px)',
        border: '1px solid #ffffff', pointerEvents: 'none',
      }}>
        {([
          [AIR, 'Air quality', false],
          [SOIL, 'Soil moisture', false],
          [WEATHER, 'Weather', false],
          // hollow ring = retired sensor; white, since the ring shape applies
          // to any sensor family, not one tone
          ['#ffffff', 'Inactive', true],
        ] as const).map(([tone, name, ring]) => (
          <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: SMALL ? 5 : 7, fontFamily: RESIPLE, fontSize: SMALL ? 9.5 : 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ffffff' }}>
            <span style={{
              width: SMALL ? 8 : 10, height: SMALL ? 8 : 10, borderRadius: 999, boxSizing: 'border-box',
              background: ring ? 'transparent' : tone,
              border: ring ? `1.5px solid ${tone}` : '1px solid rgba(14,20,28,0.9)',
              boxShadow: ring ? 'inset 0 0 0 1px rgba(14,20,28,0.9), 0 0 0 1px rgba(14,20,28,0.9)' : undefined,
            }} />
            {name}
          </span>
        ))}
      </div>}

      {/* phones: the bottom edge belongs to the legend and the card sheet, so
          the credit line rides the top-left instead */}
      {attribution && <span style={{ position: 'absolute', ...(SMALL ? { left: 6, top: 4 } : { right: 12, bottom: 12 }), fontFamily: RESIPLE, fontSize: SMALL ? 8.5 : 10.5, color: 'rgba(230,236,240,0.75)', textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none' }}>
        {attribution}
      </span>}
    </div>
  );
}
