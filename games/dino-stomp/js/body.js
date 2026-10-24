// Copied from move-play/shared/js/body.js (Move & Play v2). Keep in sync.
// Pure full-body helpers (no DOM). MediaPipe landmarks -> mirrored, visibility-filtered body.
// Coordinates stay normalized (x 0..1 left->right on the MIRRORED screen, y 0..1 top->bottom).
// Distances use `ar` (frame width / height) so they are in "frame heights".
export const LM = {
  nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, li: 19, ri: 20,
  lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28, lf: 31, rf: 32,
};
export const BONES = [
  ['ls', 'rs'], ['ls', 'le'], ['le', 'lw'], ['rs', 're'], ['re', 'rw'],
  ['ls', 'lh'], ['rs', 'rh'], ['lh', 'rh'], ['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra'], ['la', 'lf'], ['ra', 'rf'],
];
export const VIS_MIN = 0.5;
const fin = (q) => !!q && Number.isFinite(q.x) && Number.isFinite(q.y);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dist = (a, b, ar = 1) => Math.hypot((a.x - b.x) * ar, a.y - b.y);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** @returns {null | {ar, p:{name:{x,y}}, sh, hip, sw, torso, head}} (null when shoulders are not visible) */
export function toBody(lm, ar = 1, visMin = VIS_MIN) {
  if (!lm || lm.length < 25) return null;
  const p = {};
  for (const k in LM) {
    const q = lm[LM[k]];
    if (fin(q) && (q.visibility === undefined || q.visibility >= visMin)) p[k] = { x: 1 - q.x, y: q.y };
  }
  if (!p.ls || !p.rs) return null;
  const sh = mid(p.ls, p.rs), sw = dist(p.ls, p.rs, ar);
  if (sw < 0.01) return null;
  const hip = p.lh && p.rh ? mid(p.lh, p.rh) : null;
  // torso = shoulder-mid to hip-mid; without hips estimate from shoulder width (kids ~1.3-1.6 sw)
  const torso = hip ? Math.max(dist(sh, hip, ar), sw * 0.8) : sw * 1.45;
  const head = p.nose || { x: sh.x, y: sh.y - torso * 0.55 };
  return { ar, p, sh, hip, sw, torso, head };
}
/** Hand + foot points (screen-normalized) for touching things. Prefer index fingers / foot tips, else wrists / ankles. */
export function touchPoints(b) {
  if (!b) return [];
  const out = [];
  const pick = (a, c, kind) => { const q = b.p[a] || b.p[c]; if (q) out.push({ x: q.x, y: q.y, kind }); };
  pick('li', 'lw', 'hand'); pick('ri', 'rw', 'hand'); pick('lf', 'la', 'foot'); pick('rf', 'ra', 'foot');
  return out;
}
/** object-fit: cover mapping from a vw x vh frame into a W x H screen. Returns normalized->px functions. */
export function coverMap(vw, vh, W, H) {
  const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s, ox = (W - dw) / 2, oy = (H - dh) / 2;
  return { s, dw, dh, ox, oy, x: (nx) => ox + nx * dw, y: (ny) => oy + ny * dh, nx: (px) => (px - ox) / dw, ny: (py) => (py - oy) / dh };
}
