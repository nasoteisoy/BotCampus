// Copied from move-play/shared/js/view.js (Move & Play v2). Keep in sync.
// How the camera frame is fitted to the screen (pure, no DOM; unit-tested in move-play/test/unit.mjs).
// v1 drew the feed with object-fit: cover, which crops a 4:3 / portrait frame hard on phones
// ("the camera is too zoomed in"). Now the WHOLE frame is shown (contain) by default, and the
// 🔍 button cycles three levels:
//   0 ➖ out : contain, shrunk to 78 % (bodies look smaller, everything fits with room to spare)
//   1    fit : contain (the full camera frame, letterboxed; default)
//   2 ➕ in  : zoomed in up to 1.35x past contain (never more than the old cover crop)
// Every game maps landmarks AND draws the video with the same map, so overlays / hit tests line up.
export const ZOOM_LEVELS = [
  { id: 'out', icon: '➖', k: 0.78 },
  { id: 'fit', icon: '', k: 1 },
  { id: 'in', icon: '➕', k: 1.35 },
];
export const ZOOM_DEFAULT = 1;
export const ZOOM_KEY = 'moveplay.zoom';
export const clampZoom = (z) => (Number.isInteger(+z) && +z >= 0 && +z < ZOOM_LEVELS.length ? +z : ZOOM_DEFAULT);

/**
 * Map a vw x vh camera frame (normalized 0..1 coords, already mirrored like the selfie view) into a
 * W x H box (screen px). Same shape as body.js coverMap(): {s, dw, dh, ox, oy, x(), y(), nx(), ny()}
 * plus `rect` = the part of the box the video actually covers (clipped to the box) and `level`.
 */
export function viewMap(vw, vh, W, H, level = ZOOM_DEFAULT) {
  level = clampZoom(level);
  const contain = Math.min(W / vw, H / vh), cover = Math.max(W / vw, H / vh);
  const s = level === 2 ? Math.min(cover, contain * ZOOM_LEVELS[2].k) : contain * ZOOM_LEVELS[level].k;
  const dw = vw * s, dh = vh * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
  const rx = Math.max(0, ox), ry = Math.max(0, oy);
  const rect = { x: rx, y: ry, w: Math.min(W, ox + dw) - rx, h: Math.min(H, oy + dh) - ry };
  return { s, dw, dh, ox, oy, level, rect, x: (nx) => ox + nx * dw, y: (ny) => oy + ny * dh, nx: (px) => (px - ox) / dw, ny: (py) => (py - oy) / dh };
}

/** remembered zoom level (localStorage; any failure = default) */
export function loadZoom(store = globalThis.localStorage) {
  try { const v = store?.getItem(ZOOM_KEY); return v == null ? ZOOM_DEFAULT : clampZoom(v); } catch (e) { return ZOOM_DEFAULT; }
}
export function saveZoom(z, store = globalThis.localStorage) {
  try { store?.setItem(ZOOM_KEY, String(clampZoom(z))); } catch (e) { /* private mode */ }
}
/** Pick the widest front camera from enumerateDevices() output, or null to keep the default one.
 *  Browsers don't report field of view, so this goes by label ("ultra wide", "0.5x", "wide angle"). */
export function pickWideFront(devices, currentId = '') {
  const cams = (devices || []).filter((d) => d.kind === 'videoinput');
  if (cams.length < 2) return null;
  const front = cams.filter((d) => /front|user|facetime|selfie|facing front/i.test(d.label || ''));
  const wide = front.find((d) => /ultra[\s-]?wide|wide[\s-]?angle|\b0[.,]5\s?x?\b/i.test(d.label || ''));
  return wide && wide.deviceId && wide.deviceId !== currentId ? wide : null;
}
