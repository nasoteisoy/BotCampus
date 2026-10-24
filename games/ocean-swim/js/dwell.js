// Copied from move-play/shared/js/dwell.js (Move & Play v2). Keep in sync.
// Dwell-to-click for body-controlled menus (pure, no DOM; unit-tested in move-play/test/unit.mjs).
// A hand cursor that stays over the same target for `holdSec` fills a ring and "clicks" it once.
//  - leaving the target (or the hand dropping / vanishing for longer than `graceSec`) resets that ring
//  - one click per dwell: after a click the cursor must leave the target before it can click it again
//  - after any click every cursor waits `cooldownSec` (two hands / two kids can't double-fire)
export const DWELL = { holdSec: 1.2, graceSec: 0.15, cooldownSec: 0.6 };

export class DwellClicker {
  constructor(opts = {}) { this.o = { ...DWELL, ...opts }; this.clicks = 0; this.reset(); }
  reset() { this.c = new Map(); this.coolUntil = -1; this.settleNext = false; this.settleUntil = -1; } // clicks = lifetime total
  /** the screen changed (e.g. after a click): a hand already resting on whatever is under it now must leave first */
  settle() { this.settleNext = true; }
  /**
   * @param cursors [{id, x, y}] screen px (only raised hands)
   * @param targets [{id, x, y, w, h}] screen px rects (visible, clickable)
   * @param t seconds
   * @returns {{ fired: [{targetId, cursorId}], rings: [{cursorId, targetId, p}] }}  p = 0..1 ring fill
   */
  update(cursors, targets, t) {
    const o = this.o, fired = [], rings = [], seen = new Set(), just = new Set();
    if (this.settleNext) { this.settleUntil = t + 0.35; this.settleNext = false; } // a fade-in new screen counts too
    for (const cur of cursors || []) {
      seen.add(cur.id);
      let st = this.c.get(cur.id);
      if (!st) { st = { target: null, since: t, lastSeen: t, armed: true, dt: 0 }; this.c.set(cur.id, st); }
      const hit = hitTarget(targets, cur.x, cur.y);
      const id = hit ? hit.id : null;
      if (id !== st.target) { st.target = id; st.since = t; st.armed = true; if (t <= this.settleUntil && id != null) st.armed = false; }
      if (just.has(id)) st.armed = false;
      st.lastSeen = t;
      let p = 0;
      if (id != null && st.armed) {
        if (t < this.coolUntil) st.since = Math.max(st.since, this.coolUntil); // ring only starts after the cooldown
        p = Math.max(0, Math.min(1, (t - st.since) / o.holdSec));
        if (p >= 1) {
          st.armed = false; this.coolUntil = t + o.cooldownSec; this.clicks++; just.add(id);
          for (const s2 of this.c.values()) if (s2.target === id) s2.armed = false; // other hands on it: no second click
          fired.push({ targetId: id, cursorId: cur.id }); p = 1;
        }
      } else if (id != null) p = 1; // already clicked: full ring until the hand leaves
      rings.push({ cursorId: cur.id, targetId: id, p, x: cur.x, y: cur.y, done: !st.armed && id != null });
    }
    // hands that vanished: keep their state briefly (detector flicker), then forget it
    for (const [id, st] of this.c) if (!seen.has(id) && t - st.lastSeen > o.graceSec) this.c.delete(id);
    return { fired, rings };
  }
}
export function hitTarget(targets, x, y, pad = 0) {
  let best = null, bd = Infinity;
  for (const r of targets || []) {
    if (x < r.x - pad || x > r.x + r.w + pad || y < r.y - pad || y > r.y + r.h + pad) continue;
    const d = Math.hypot(x - (r.x + r.w / 2), y - (r.y + r.h / 2));
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
