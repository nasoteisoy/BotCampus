// Pure pose -> control mapping (no DOM, no three). Unit-tested in test/unit-pose.mjs.
// Input: MediaPipe PoseLandmarker landmarks (normalized x,y in [0,1], y down, optional visibility).
// Output: { lift (m/s^2 upward accel), bank (-1..1, + = bank right), flap (true on a new downstroke), tracked }
export const IDX = { LS: 11, RS: 12, LE: 13, RE: 14, LW: 15, RW: 16 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class PoseMapper {
  constructor(opts = {}) {
    this.o = {
      visMin: 0.5,      // landmark visibility needed
      flapThresh: 2.0,  // downward wrist speed (shoulder-widths / s) before lift starts
      strokeOn: 3.0,    // speed that counts as a new flap stroke (for wing animation)
      liftGain: 2.6,    // m/s^2 per (sw/s) above threshold
      maxLift: 30,
      bankGain: 0.9,
      deadzone: 0.15,
      bankRate: 9,      // smoothing (1/s)
      posRate: 24,      // position smoothing (1/s), frame-rate independent
      velRate: 21,      // velocity smoothing (1/s)
      ...opts,
    };
    this.reset();
  }
  reset() {
    this.arms = [{ y: null, src: null, v: 0 }, { y: null, src: null, v: 0 }];
    this.prevT = null; this.sw = null;
    this.bank = 0; this.lift = 0; this.vel = 0;
    this.inStroke = false; this.flapCount = 0; this.tracked = false;
  }
  _ok(p) {
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility === undefined || p.visibility >= this.o.visMin);
  }
  _lost(dt) {
    // Nothing usable: no lift, bank eases back to level.
    this.bank *= Math.exp(-3 * dt);
    if (Math.abs(this.bank) < 1e-3) this.bank = 0;
    this.lift = 0; this.vel = 0; this.inStroke = false; this.tracked = false;
    for (const a of this.arms) { a.y = null; a.src = null; a.v = 0; }
    return { lift: 0, bank: this.bank, flap: false, tracked: false };
  }
  /** @param lm landmarks array (33) or null; @param t seconds */
  update(lm, t) {
    let dt = this.prevT == null ? 1 / 30 : t - this.prevT;
    this.prevT = t;
    if (!(dt > 0)) dt = 1 / 30;
    const stale = dt > 0.5; // big gap: don't derive velocity across it
    dt = Math.min(dt, 0.5);
    const o = this.o;
    if (!lm || !lm.length) return this._lost(dt);
    const ls = lm[IDX.LS], rs = lm[IDX.RS];
    if (!this._ok(ls) || !this._ok(rs)) return this._lost(dt);
    const swRaw = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    if (swRaw < 0.02) return this._lost(dt);
    this.sw = this.sw == null ? swRaw : this.sw * 0.8 + swRaw * 0.2;
    const sw = this.sw;
    this.tracked = true;

    // Arm height relative to its shoulder in shoulder-widths (+ = below shoulder).
    const rel = (w, e, s) => {
      if (this._ok(w)) return { y: (w.y - s.y) / sw, src: 'w' };
      if (this._ok(e)) return { y: ((e.y - s.y) / sw) * 1.8, src: 'e' }; // elbow travels ~half as far
      return null;
    };
    const L = rel(lm[IDX.LW], lm[IDX.LE], ls);
    const R = rel(lm[IDX.RW], lm[IDX.RE], rs);

    // ---- bank: person's left arm higher than right => bank right (+)
    if (L && R) {
      const tilt = R.y - L.y;
      const mag = Math.max(0, Math.abs(tilt) - o.deadzone) * o.bankGain;
      const target = clamp(Math.sign(tilt) * mag, -1, 1);
      this.bank += (target - this.bank) * (1 - Math.exp(-o.bankRate * dt));
    } else {
      this.bank *= Math.exp(-2 * dt); // one arm missing: can't judge tilt, ease to level
    }

    // ---- flap: per-arm downward velocity (robust to a missing wrist)
    const vs = [];
    [L, R].forEach((cur, i) => {
      const a = this.arms[i];
      if (!cur) { a.y = null; a.src = null; a.v = 0; return; }
      if (a.y == null || a.src !== cur.src || stale) { a.y = cur.y; a.src = cur.src; a.v = 0; return; }
      const ny = a.y + (cur.y - a.y) * (1 - Math.exp(-o.posRate * dt));
      const v = (ny - a.y) / dt;
      a.y = ny;
      a.v = a.v + (v - a.v) * (1 - Math.exp(-o.velRate * dt));
      vs.push(a.v);
    });
    // both arms visible: both must move down (min), so a quick tilt (one up, one down) isn't a flap
    this.vel = vs.length === 2 ? Math.min(vs[0], vs[1]) : vs.length ? vs[0] : 0;
    this.lift = this.vel > o.flapThresh ? Math.min(o.maxLift, (this.vel - o.flapThresh) * o.liftGain) : 0;
    let flap = false;
    if (!this.inStroke && this.vel > o.strokeOn) { this.inStroke = true; flap = true; this.flapCount++; }
    else if (this.inStroke && this.vel < o.flapThresh * 0.3) this.inStroke = false;
    return { lift: this.lift, bank: this.bank, flap, tracked: true };
  }
}
