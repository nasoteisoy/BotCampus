// Practice step before a camera round: the kid does each move once, it turns ✅, then the game starts.
// Pure move checks (no DOM; unit-tested in move-play/test/unit.mjs). Bodies come from toBody() (mirrored,
// normalized, lengths in frame heights via b.ar). `mem` is per-player memory kept between frames.
export const HOLD = 0.2; // a move must show for this long (s) to count (one noisy frame can't tick it)
/** v4 kid-friendly thresholds (all in torso lengths = relative to each kid's own size; energy = torso / s).
 *  Lower than v3 (in brackets) but still above tracker noise for a kid standing still (unit-tested). */
export const EASY = {
  reachAbove: -0.05, // a hand above (head - this * torso): -0.05 = level with the eyes is enough [0.1 above the head]
  squatKnee: 0.7,    // thigh "height" (knee below hip) under this = knees bent [0.6]
  squatDrop: 0.2,    // or shoulders this far below standing [0.3]
  kickFoot: 0.25,    // one foot this much higher than the other [0.35]
  jumpUp: 0.1,       // shoulders this far above the standing line [0.15]
  leanStep: 0.25,    // shoulders moved sideways this far from the start [0.35]
  leanTilt: 0.18,    // or shoulders this far off the hips [0.25]
  danceOn: 0.7,      // hand / foot energy that counts as dancing [0.9]
  danceSec: 0.6,     // for this long [0.8]
  stillMax: 0.35,    // energy under this = statue [0.25]
  stillSec: 0.7,     // for this long [1.0]
};

const base = (mem, b) => {
  // standing reference: a slow average of the shoulder line (a quick jump/squat barely moves it) + start x
  if (mem.sy == null) { mem.sy = b.sh.y; mem.sx = b.sh.x; mem.T = b.torso; }
  mem.sy += (b.sh.y - mem.sy) * 0.02;
  mem.T += (b.torso - mem.T) * 0.05;
  return mem;
};
export const CHECKS = {
  /** a hand above the head */
  reach(b) { const P = b.p, w = [P.lw, P.rw, P.li, P.ri].filter(Boolean); return w.some((q) => q.y < b.head.y - b.torso * EASY.reachAbove); },
  /** knees bent (thighs close to level) or shoulders clearly below the standing line */
  squat(b, mem) {
    base(mem, b); const P = b.p;
    const k = P.lk && P.rk && b.hip ? ((P.lk.y + P.rk.y) / 2 - b.hip.y) / b.torso : 9;
    return k < EASY.squatKnee || b.sh.y - mem.sy > mem.T * EASY.squatDrop;
  },
  /** one foot clearly higher than the other */
  kick(b) { const P = b.p, l = P.la || P.lf, r = P.ra || P.rf; return !!(l && r) && Math.abs(l.y - r.y) > b.torso * EASY.kickFoot; },
  /** whole body up off the standing line */
  jump(b, mem) { const sy0 = mem.sy; base(mem, b); return sy0 != null && b.sh.y < sy0 - mem.T * EASY.jumpUp; },
  /** step / lean sideways from where you started */
  lean(b, mem) { base(mem, b); const ar = b.ar || 1, hx = b.hip ? b.hip.x : b.sh.x; return Math.abs(b.sh.x - mem.sx) * ar > mem.T * EASY.leanStep || Math.abs(b.sh.x - hx) * ar > b.torso * EASY.leanTilt; },
  /** wiggle: hands moving a lot for ~1 s */
  dance(b, mem, dt) { const e = motion(b, mem, dt); mem.danceT = e > EASY.danceOn ? (mem.danceT || 0) + dt : Math.max(0, (mem.danceT || 0) - dt * 0.5); return mem.danceT > EASY.danceSec; },
  /** after moving, stand still like a statue */
  freeze(b, mem, dt) { const e = motion(b, mem, dt); mem.moved = mem.moved || e > EASY.danceOn; mem.stillT = e < EASY.stillMax ? (mem.stillT || 0) + dt : 0; return mem.moved && mem.stillT > EASY.stillSec; },
};
/** hand + foot speed in torso lengths per second (smoothed) */
export function motion(b, mem, dt) {
  const P = b.p, ar = b.ar || 1, pts = ['lw', 'rw', 'la', 'ra'];
  let sum = 0, n = 0;
  for (const k of pts) { const q = P[k], o = mem['m' + k]; if (q && o) { sum += Math.hypot((q.x - o.x) * ar, q.y - o.y); n++; } if (q) mem['m' + k] = { x: q.x, y: q.y }; }
  const v = n ? sum / n / Math.max(1e-3, dt) / b.torso : 0;
  mem.energy = (mem.energy || 0) * 0.8 + v * 0.2;
  return mem.energy;
}

/** Steps state: steps = [{move, icon, check?(b, mem, dt)}]; any player can tick the current step. */
export class Practice {
  constructor(steps) { this.steps = steps.map((s) => ({ ...s, done: false })); this.i = 0; this.mem = new Map(); this.t = 0; this.skipped = false; }
  get current() { return this.steps[this.i] || null; }
  get done() { return this.i >= this.steps.length; }
  skip() { this.skipped = true; this.i = this.steps.length; }
  /** players [{id, body}] -> returns the step that was just completed (or null) */
  update(players, dt) {
    const st = this.current; if (!st) return null;
    let ok = false;
    for (const p of players || []) {
      if (!p.body) continue;
      const key = p.id + ':' + this.i; let m = this.mem.get(key); if (!m) { m = { hold: 0 }; this.mem.set(key, m); }
      const fn = st.check || CHECKS[st.move];
      if (fn && fn(p.body, m, dt)) { m.hold += dt; if (m.hold >= (st.hold ?? HOLD)) ok = true; } else m.hold = 0;
    }
    if (!ok) return null;
    st.done = true; this.i++;
    return st;
  }
}
