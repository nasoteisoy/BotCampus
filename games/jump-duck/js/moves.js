// Pure jump / squat / lean detection with per-player calibration (no DOM).
// Unit-tested in move-play/test/unit-jump.mjs. All lengths are in TORSO lengths (shoulder-mid to hip-mid),
// measured during a 2 s "stand still" calibration, so tall dads and short kids use the same thresholds.
import { clamp } from './body.js';

export const OPTS = {
  calibSec: 2.0,      // standing still this long = calibrated
  calibMove: 0.12,    // max wobble (torso) during calibration (kids wiggle; generous)
  jumpRise: 0.12,     // hips must rise this much above standing (torso units)...
  jumpVel: 0.9,       // ...while moving up at least this fast (torso / s)
  jumpBig: 0.3,       // or simply be this high (slow-motion jump still counts)
  jumpCooldown: 0.45,
  duckDrop: 0.28,     // shoulders this far below standing = ducking (squat / bend)
  duckExit: 0.18,     // hysteresis
  laneOn: 0.3,        // body shifted / leaned this far (torso) left or right = side lane
  laneOff: 0.18,      // back within this = middle lane
  leanW: 1.6,         // weight of torso lean angle (shoulders vs hips) vs whole-body step
};

/** Core reference points of a body: hip-mid if visible (best for jumps), else shoulders. */
function core(b) { return { sy: b.sh.y, sx: b.sh.x, hy: b.hip ? b.hip.y : null, hx: b.hip ? b.hip.x : b.sh.x }; }

export class MoveDetector {
  constructor(opts = {}) { this.o = { ...OPTS, ...opts }; this.reset(); }
  reset() {
    this.cal = null; this.calT = 0; this.calBuf = []; this.prevT = null;
    this.h = 0; this.vy = 0; this.lastJump = -9; this.ducking = false; this.lane = 0; this.lean = 0; this.drop = 0; this.seen = false;
  }
  get calibrated() { return !!this.cal; }
  get calibProgress() { return this.cal ? 1 : clamp(this.calT / this.o.calibSec, 0, 1); }
  /**
   * @param b body from toBody() (or null when not seen); t seconds
   * @returns {{ jump: boolean, duck: boolean, lane: -1|0|1, calibrated: boolean, h, drop, lean }}
   */
  update(b, t) {
    const o = this.o;
    const dt = this.prevT == null ? 1 / 30 : clamp(t - this.prevT, 1e-3, 0.5);
    this.prevT = t;
    const out = { jump: false, duck: this.ducking, lane: this.lane, calibrated: !!this.cal, h: this.h, drop: this.drop, lean: this.lean };
    if (!b) { this.seen = false; return out; }
    this.seen = true;
    const c = core(b), T = b.torso, ar = b.ar || 1;
    if (!this.cal) {
      // ---- calibration: collect ~2 s of a calm standing pose
      this.calBuf.push({ ...c, T });
      const first = this.calBuf[0];
      const moved = Math.abs(c.sy - first.sy) / T > o.calibMove || Math.abs(c.sx - first.sx) * ar / T > o.calibMove * 1.5;
      if (moved) { this.calBuf = [this.calBuf[this.calBuf.length - 1]]; this.calT = 0; return out; }
      this.calT += dt;
      if (this.calT >= o.calibSec) {
        const avg = (k) => { const v = this.calBuf.map((q) => q[k]).filter((x) => x != null); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null; };
        this.cal = { sy: avg('sy'), sx: avg('sx'), hy: avg('hy'), hx: avg('hx'), T: avg('T') };
        this.calBuf = [];
      }
      out.calibrated = !!this.cal; return out;
    }
    const cal = this.cal, CT = cal.T;
    // vertical: hips (or shoulders when hips are hidden) above the standing line, in torso units
    const yNow = c.hy != null && cal.hy != null ? c.hy : c.sy, yCal = c.hy != null && cal.hy != null ? cal.hy : cal.sy;
    const h = (yCal - yNow) / CT;
    const vy = (h - this.h) / dt;
    this.vy = this.vy + (vy - this.vy) * Math.min(1, dt * 18);
    this.h = h;
    if (t - this.lastJump > o.jumpCooldown && ((h > o.jumpRise && this.vy > o.jumpVel) || h > o.jumpBig)) {
      // a jump lifts the shoulders too; a squat->stand rebound only gets back to ~0, so it can't trigger
      if ((cal.sy - c.sy) / CT > o.jumpRise * 0.6) { this.lastJump = t; out.jump = true; }
    }
    // duck: shoulders dropped below standing height (squat or bend over)
    this.drop = (c.sy - cal.sy) / CT;
    if (!this.ducking && this.drop > o.duckDrop) this.ducking = true;
    else if (this.ducking && this.drop < o.duckExit) this.ducking = false;
    // lane: whole-body step sideways + torso lean (shoulders vs hips). + = player's right (screen right, mirrored)
    const step = (c.hx - cal.hx) * ar / CT;
    const leanA = b.hip ? ((c.sx - c.hx) - (cal.sx - cal.hx)) * ar / CT : 0;
    this.lean = step + leanA * o.leanW;
    if (this.lane === 0 && Math.abs(this.lean) > o.laneOn) this.lane = Math.sign(this.lean);
    else if (this.lane !== 0) {
      if (Math.sign(this.lean) !== this.lane && Math.abs(this.lean) > o.laneOn) this.lane = Math.sign(this.lean);
      else if (Math.abs(this.lean) < o.laneOff) this.lane = 0;
    }
    // slow drift of the standing reference while calm (camera bumped, kid walked closer)
    if (Math.abs(h) < 0.06 && Math.abs(this.drop) < 0.06 && this.lane === 0) {
      const k = Math.min(1, dt * 0.25);
      if (c.hy != null && cal.hy != null) cal.hy += (c.hy - cal.hy) * k;
      cal.sy += (c.sy - cal.sy) * k; cal.T += (T - cal.T) * k;
    }
    out.jump = out.jump; out.duck = this.ducking; out.lane = this.lane; out.calibrated = true; out.h = h; out.drop = this.drop; out.lean = this.lean;
    return out;
  }
}

// ---- course (seeded, identical for every player so it's fair)
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/**
 * Obstacles along the track: { d (distance m), type: 'log'|'bar'|'rock'|'star', lane }.
 * log = jump over (all lanes), bar = duck under (all lanes), rock = blocks one or two lanes (switch lanes), star = bonus in a lane.
 */
export function makeCourse(seed, lengthM, { start = 25, gap = 11 } = {}) {
  const r = mulberry32(seed), out = [];
  let d = start, last = '';
  while (d < lengthM) {
    const p = r();
    let type = p < 0.3 ? 'log' : p < 0.55 ? 'bar' : 'rock';
    if (type === last && r() < 0.6) type = type === 'rock' ? 'log' : 'rock';
    last = type;
    if (type === 'rock') {
      const free = Math.floor(r() * 3) - 1; // the open lane
      for (const lane of [-1, 0, 1]) if (lane !== free) out.push({ d, type, lane });
      out.push({ d, type: 'star', lane: free });
    } else {
      out.push({ d, type, lane: 0, wide: true });
      if (r() < 0.5) out.push({ d: d + gap * 0.5, type: 'star', lane: Math.floor(r() * 3) - 1 });
    }
    d += gap * (0.85 + r() * 0.5);
  }
  return out;
}
/** Does obstacle o hit a runner (lane, airborne, ducking)? */
export function collides(o, run) {
  if (o.type === 'log') return !run.air;
  if (o.type === 'bar') return !run.duck;
  if (o.type === 'rock') return run.lane === o.lane;
  return false;
}
export function starsFor(score, maxScore) {
  const k = maxScore > 0 ? score / maxScore : 0;
  return k >= 0.8 ? 3 : k >= 0.5 ? 2 : k >= 0.25 ? 1 : 0; // standing still (coins in your lane only) ≈ 0.15 → no star
}
