// Tells a tap from an orbit drag or a pinch: one pointer, little movement, short press.
export const TAP_MOVE_PX = 7;
export const TAP_MAX_MS = 350;

export function watchTaps(el, onTap, now = () => performance.now()) {
  const down = new Map();      // pointerId -> { x, y }
  let g = null;                // current gesture: { id, x, y, t, moved, multi, primary }
  el.addEventListener('pointerdown', (e) => {
    down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down.size === 1) g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now(), moved: false, multi: false, primary: e.pointerType !== 'mouse' || e.button === 0 };
    else if (g) g.multi = true;
  });
  el.addEventListener('pointermove', (e) => {
    if (g && e.pointerId === g.id && Math.hypot(e.clientX - g.x, e.clientY - g.y) > TAP_MOVE_PX) g.moved = true;
  });
  const end = (e, cancelled) => {
    if (!down.delete(e.pointerId)) return;
    if (g && e.pointerId === g.id && !cancelled && g.primary && !g.multi && !g.moved && now() - g.t <= TAP_MAX_MS
      && Math.hypot(e.clientX - g.x, e.clientY - g.y) <= TAP_MOVE_PX) onTap(e.clientX, e.clientY);
    if (g && e.pointerId === g.id) g.multi = true;   // the rest of this gesture can no longer be a tap
    if (down.size === 0) g = null;
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
}
