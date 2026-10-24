// 🔍: how far the chase camera sits behind the hero (multiplies the game base framing in game.js META.cam).
// portrait tiles 12.5 m, 6 m, fov 72). Default 'fit' pulls the camera back so more of the world + apples show.
export const CHASE = [
  { id: 'out', icon: '➖', dist: 1.45, height: 1.3, fov: 8 }, // far: 15.2 m behind, fov 68 (portrait 18.1 m, 80)
  { id: 'fit', icon: '', dist: 1.2, height: 1.12, fov: 4 },   // default: 12.6 m, 5.6 m up, fov 64 (portrait 15 m, 76)
  { id: 'in', icon: '➕', dist: 1, height: 1, fov: 0 },        // close = the v2 framing
];
export const ZKEY = 'oceanswim.zoom';
/** saved level (0 out, 1 fit, 2 in); default / broken / private mode -> 1 */
export function loadZoom(store = globalThis.localStorage) {
  try { const v = store.getItem(ZKEY); const z = +v; return v != null && v !== '' && CHASE[z] ? z : 1; } catch (e) { return 1; }
}
