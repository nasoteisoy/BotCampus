// Copied from move-play/shared/js/hands.js (Move & Play v2). Keep in sync.
// Raised-hand cursors from pose bodies (pure, no DOM; unit-tested in move-play/test/unit.mjs).
// Each player gets one cursor while a hand is raised (wrist above the hip line, or up by the chest).
// The cursor moves inside a "reach box" around the player's own shoulders, so a kid can reach every
// button on screen without walking: hand straight out to the side = screen edge, hand above the head =
// top, hand at the belly = bottom. Mirrored like the selfie view (bodies from toBody() are mirrored).
import { clamp } from './body.js';
export const REACH = { halfW: 1.25, top: 1.15, bottom: 0.55, smooth: 0.45, raise: 0.25, switchBy: 0.35 };

/** body -> {x, y} in 0..1 of the screen for one hand, or null. hand: 'l' | 'r' */
export function handPoint(b, hand, o = REACH) {
  if (!b) return null;
  const q = b.p[hand + 'i'] || b.p[hand + 'w'];
  if (!q) return null;
  const T = b.torso, ar = b.ar || 1, sh = b.sh;
  const hipY = b.hip ? b.hip.y : sh.y + T;
  if (q.y > hipY - T * o.raise) return null;                 // hand hanging down = no cursor
  const ux = 0.5 + ((q.x - sh.x) * ar) / (T * o.halfW * 2);
  const uy = (q.y - (sh.y - T * o.top)) / (T * (o.top + o.bottom));
  return { x: clamp(ux, 0, 1), y: clamp(uy, 0, 1) };
}
/** inverse of handPoint (tests / demos): where the wrist must be (mirrored-normalized) to aim at (ux, uy) */
export function aimHand(b, ux, uy, o = REACH) {
  const T = b.torso, ar = b.ar || 1, sh = b.sh;
  return { x: sh.x + ((ux - 0.5) * T * o.halfW * 2) / ar, y: sh.y - T * o.top + uy * T * (o.top + o.bottom) };
}

export class HandCursors {
  constructor(opts = {}) { this.o = { ...REACH, ...opts }; this.m = new Map(); }
  reset() { this.m.clear(); }
  /** players [{id, slot, body}] -> cursors [{id, slot, x, y}] in px of a W x H screen */
  update(players, W, H) {
    const out = [], seen = new Set();
    for (const p of players || []) {
      if (!p.body) continue;
      const L = handPoint(p.body, 'l', this.o), R = handPoint(p.body, 'r', this.o);
      let st = this.m.get(p.id);
      if (!L && !R) { if (st) st.hand = null; continue; }
      if (!st) { st = { hand: null, x: 0, y: 0 }; this.m.set(p.id, st); }
      // keep the hand you started with unless the other one is clearly higher
      let hand = st.hand && (st.hand === 'l' ? L : R) ? st.hand : (L && (!R || L.y <= R.y) ? 'l' : 'r');
      const cur = hand === 'l' ? L : R, other = hand === 'l' ? R : L;
      if (other && other.y < cur.y - this.o.switchBy) hand = hand === 'l' ? 'r' : 'l';
      const q = hand === 'l' ? L : R, x = q.x * W, y = q.y * H;
      if (st.hand !== hand) { st.x = x; st.y = y; } else { const a = this.o.smooth; st.x += (x - st.x) * a; st.y += (y - st.y) * a; }
      st.hand = hand; seen.add(p.id);
      out.push({ id: p.id, slot: p.slot, x: st.x, y: st.y, hand });
    }
    for (const id of [...this.m.keys()]) if (!seen.has(id)) this.m.delete(id);
    return out;
  }
}
/** Is the whole body in frame? false -> show "📏 step back". Needs head, both shoulders, hips and an ankle/foot,
 *  with nothing pressed against the frame edge. */
export function fullBodyInFrame(b) {
  if (!b) return false;
  const P = b.p, need = [P.ls, P.rs, P.lh || P.rh, P.la || P.ra || P.lf || P.rf];
  if (need.some((q) => !q)) return false;
  const head = b.head, feet = [P.la, P.ra, P.lf, P.rf].filter(Boolean);
  if (head.y < 0.02 || feet.some((q) => q.y > 0.99)) return false;
  return true;
}
