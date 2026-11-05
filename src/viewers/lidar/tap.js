// A pinch or a drag that returns to its start must never become a selection.
export function onTap(element, select) {
  const pointers = new Set();
  let start = null;
  element.addEventListener('pointerdown', event => {
    pointers.add(event.pointerId);
    start = pointers.size === 1 && event.isPrimary && event.button === 0
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, slop: event.pointerType === 'touch' ? 8 : 5 }
      : null;
  });
  element.addEventListener('pointermove', event => {
    if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > start.slop) start = null;
  });
  element.addEventListener('pointerup', event => {
    const tapped = start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= start.slop;
    start = null;
    pointers.delete(event.pointerId);
    if (tapped) select(event);
  });
  for (const name of ['pointercancel', 'lostpointercapture']) {
    element.addEventListener(name, event => {
      pointers.delete(event.pointerId);
      start = null;
    });
  }
}
