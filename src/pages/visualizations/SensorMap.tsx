import { useEffect, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { MapSite } from './sensorData';
import { lonToX } from './mercator';
import TileMap, { type MapTarget } from './TileMap';
import { useCompactViewport } from './useCompactViewport';

// The whole network fits in about 3.3 km. The map opens wide and eases in to
// the whole network, so arriving lands on something you can read rather than
// on one roof.
const MAP_OPEN_Z = 12.4;
const MAP_NET_Z = 14.8;
// where the map lands: hand-tuned framing, a touch west of the sites'
// centroid so campus and the Gamefarm cluster share the screen
const LAND = { lat: 42.44742, lon: -76.46413 };

// where the detached readings card parks: inset from the side, clear of the
// title and the top-right controls
const EDGE = 12;
const CARD_TOP = 68;

export default function SensorMap({ sites, selectedIds, onSelect, cards }: {
  sites: MapSite[];
  selectedIds: string[];
  onSelect: (id: string | null) => void;
  // one floating readings card per open sensor
  cards?: { id: string; node: ReactNode }[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapViewRef = useRef<{ lat: number; lon: number; zoom: number } | null>(null);
  // phones: the readings card docks as a bottom sheet instead of floating
  const isMobile = useCompactViewport();
  // a phone's narrow frame needs a wider landing to fit the whole network
  const target = useMemo<MapTarget>(() => ({ lat: LAND.lat, lon: LAND.lon, zoom: isMobile ? MAP_NET_Z - 1.6 : MAP_NET_Z, nonce: isMobile ? 1 : 2 }), [isMobile]);

  return (
    // selection-proof: finger drags on the map must never start a text
    // selection or an iOS long-press callout
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <style>{`@media (min-width: 600px) and (max-width:1100px) and (max-height:500px) { .sensor-card-dock { left:auto!important; right:12px!important; bottom:12px!important; width:min(420px,48vw); } .sensor-reading-card { max-height:calc(100dvh - 88px)!important; } }`}</style>
      <TileMap
        sites={sites}
        selectedIds={selectedIds}
        onSelect={onSelect}
        target={target}
        initial={{ lat: LAND.lat, lon: LAND.lon, zoom: MAP_OPEN_Z }}
        onView={(v) => { mapViewRef.current = v; }}
        dur={1400}
      />

      {/* ---- the readings: one card per open sensor. Desktop: floating,
          auto-parked in a cascade until dragged. Mobile: the topmost open
          sensor docks as a full-width bottom sheet over the imagery. ---- */}
      {isMobile
        ? (cards?.length ? (
            <div className="sensor-card-dock" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 12 }}>
              {cards[cards.length - 1].node}
            </div>
          ) : null)
        : cards?.map(({ id, node }, i) => (
            <FloatingCard key={id} index={i} node={node} site={sites.find((s) => s.id === id)} rootRef={rootRef} mapViewRef={mapViewRef} />
          ))}
    </div>
  );
}

// bring-to-front counter shared by every floating card on the stage
let zTop = 10;

// One sensor's readings card: parks in whichever top corner is away from its
// pin (cascaded by index so stacked cards stay reachable), until the user
// drags it by its header - from then on their placement wins, clamped to the
// stage so it can never be lost off-screen. Clicking anywhere on a card
// raises it above its siblings.
function FloatingCard({ site, index, node, rootRef, mapViewRef }: {
  site?: MapSite;
  index: number;
  node: ReactNode;
  rootRef: { current: HTMLDivElement | null };
  mapViewRef: { current: { lat: number; lon: number; zoom: number } | null };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // a card opens on top of the stack, not under it
  useEffect(() => { if (ref.current) ref.current.style.zIndex = String(++zTop); }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = ref.current, box = rootRef.current;
      if (!el || !box) return;
      const w = box.clientWidth;
      let x: number, y: number;
      if (pos.current) {
        ({ x, y } = pos.current);
      } else {
        const v = mapViewRef.current;
        let px = 0;
        if (v && site) {
          const Z = Math.max(11, Math.min(20, Math.round(v.zoom)));
          const k = 2 ** (v.zoom - Z);
          px = (lonToX(site.lon, Z) - lonToX(v.lon, Z)) * k + w / 2;
        }
        const left = px >= w / 2;
        x = (left ? EDGE : w - el.offsetWidth - EDGE) + (left ? 1 : -1) * index * 36;
        y = CARD_TOP + index * 36;
      }
      x = Math.max(EDGE, Math.min(w - el.offsetWidth - EDGE, x));
      y = Math.max(EDGE, Math.min(box.clientHeight - 56, y));
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [site, index, rootRef, mapViewRef]);

  const endDrag = () => {
    drag.current = null;
    if (ref.current) ref.current.style.transition = 'transform 350ms ease';
  };

  return (
    <div
      ref={ref}
      onPointerDownCapture={() => { if (ref.current) ref.current.style.zIndex = String(++zTop); }}
      onPointerDown={(e) => {
        const t = e.target as HTMLElement;
        if (!t.closest('[data-drag-handle]') || t.closest('button')) return;
        const el = ref.current!;
        const r = el.getBoundingClientRect();
        const br = rootRef.current!.getBoundingClientRect();
        drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        pos.current = { x: r.left - br.left, y: r.top - br.top };
        // capture keeps the drag alive when the cursor outruns the card; a
        // pointer already released by now just means an ordinary short click
        try { el.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
        el.style.transition = 'none';
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const br = rootRef.current!.getBoundingClientRect();
        pos.current = { x: e.clientX - br.left - d.dx, y: e.clientY - br.top - d.dy };
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ position: 'absolute', top: 0, left: 0, zIndex: 6, willChange: 'transform', transition: 'transform 350ms ease' }}
    >
      {node}
    </div>
  );
}
