// Pure body-move detectors for the Move & Play 3D games (no DOM, no three). Unit-tested in test/unit-moves.mjs.
// Bodies come from toBody() (body.js): mirrored screen coords, y down, lengths in frame heights.
// EVERY threshold is in units of the kid's own torso length (T, shoulder-mid to hip-mid, smoothed), so a small
// kid far from the camera and a tall parent close to it need the same move. Each detector has a grace window
// (a short hold, a hysteresis band, a re-arm) so one noisy frame never fires and a sloppy move still counts.
// Standing still (landmark jitter only) must output nothing: test/unit-moves.mjs runs 20 s of noisy standing.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ema = (cur, x, rate, dt) => (cur == null ? x : cur + (x - cur) * (1 - Math.exp(-rate * dt)));

export const MOVE = {
  // lean = turn
  leanDead: 0.1, leanFull: 0.3, leanRate: 8, leanSmooth: 4, neutralRate: 0.08, neutralMax: 0.1,
  // standing level (shoulder line), for jump / squat
  levelFast: 1.5, levelSlow: 0.1, levelBand: 0.12,
  jumpOn: 0.2, jumpHip: 0.12, jumpOff: 0.08, jumpCool: 0.45,
  squatOn: 0.24, squatOff: 0.16, squatHold: 0.12,
  // arms up high (roar / rise)
  upHold: 0.2, upGrace: 0.25, upAbove: 0.05,
  // march in place (knees / feet alternate; arm pump when the legs are out of frame)
  stepOn: 0.18, stepOff: 0.08, armStepOn: 0.3, armStepOff: 0.12, stepMinGap: 0.14, stepWin: 2, stepGap: 1.1,
  // swim strokes
  strokeUp: -0.15, strokeDown: 0.45, strokeIn: 0.45, strokeOut: 1.0, strokeWin: 1.6, strokeMaxGap: 1.4,
};

/** smoothed torso length (the size unit) */
export class Size {
  constructor() { this.T = null; }
  update(b, dt) { this.T = ema(this.T, b.torso, 3, dt); return this.T; }
}

/** body lean left / right -> turn -1..1 (+ = the kid's right = screen right in the mirrored view) */
export class Lean {
  constructor(o = MOVE) { this.o = o; this.neutral = 0; this.turn = 0; this.raw = null; this.age = 0; }
  update(b, T, dt) {
    const o = this.o, P = b.p, ar = b.ar || 1;
    const tilt = Math.atan2(P.rs.y - P.ls.y, Math.max(1e-4, (P.rs.x - P.ls.x) * ar)); // right shoulder lower = lean right
    let raw;
    if (b.hip) raw = ((b.sh.x - b.hip.x) * ar) / T + tilt * 0.35;
    else raw = tilt * 1.2;
    raw = this.raw = ema(this.raw, raw, o.leanSmooth, dt);
    if ((this.age += dt) < 0.3) return 0; // warm-up (smoothing settles)
    // slow self-calibration of a crooked stance / tilted camera (only while near neutral)
    if (Math.abs(raw - this.neutral) < this.o.leanDead * 1.2) this.neutral = clamp(ema(this.neutral, raw, o.neutralRate, dt), -o.neutralMax, o.neutralMax);
    const d = raw - this.neutral, mag = clamp((Math.abs(d) - o.leanDead) / (o.leanFull - o.leanDead), 0, 1);
    this.turn = ema(this.turn, Math.sign(d) * mag, o.leanRate, dt);
    if (mag === 0 && Math.abs(this.turn) < 0.05) this.turn = 0;
    return this.turn;
  }
  lost(dt) { this.turn *= Math.exp(-4 * dt); if (Math.abs(this.turn) < 0.02) this.turn = 0; return this.turn; }
}

/** standing level of the shoulders (+ hips): dev > 0 = lower than standing (squat), < 0 = higher (jump) */
export class Level {
  constructor(o = MOVE) { this.o = o; this.sy = null; this.hy = null; this.dev = 0; this.hdev = 0; }
  update(b, T, dt) {
    const o = this.o;
    if (this.sy == null) this.sy = b.sh.y;
    if (b.hip && this.hy == null) this.hy = b.hip.y;
    this.dev = (b.sh.y - this.sy) / T;
    this.hdev = b.hip && this.hy != null ? (b.hip.y - this.hy) / T : this.dev;
    // follow slow changes fast (walking nearer / further), real jumps / squats only very slowly
    this.sy = ema(this.sy, b.sh.y, Math.abs(this.dev) < o.levelBand ? o.levelFast : o.levelSlow, dt);
    if (b.hip) this.hy = ema(this.hy, b.hip.y, Math.abs(this.hdev) < o.levelBand ? o.levelFast : o.levelSlow, dt);
    return this.dev;
  }
}

/** jump: shoulders (and hips, when seen) clearly above the standing level. One event per jump. */
export class Jump {
  constructor(o = MOVE) { this.o = o; this.armed = true; this.cool = 0; this.count = 0; }
  update(level, hasHip, dt) {
    const o = this.o; this.cool -= dt;
    const up = -level.dev, hup = -level.hdev;
    if (this.armed && this.cool <= 0 && up > o.jumpOn && (!hasHip || hup > o.jumpHip)) { this.armed = false; this.cool = o.jumpCool; this.count++; return true; }
    if (!this.armed && up < o.jumpOff) this.armed = true;
    return false;
  }
}

/** squat: shoulders clearly below the standing level for a moment. Continuous (held) state with hysteresis. */
export class Squat {
  constructor(o = MOVE) { this.o = o; this.t = 0; this.on = false; }
  update(level, dt) {
    const o = this.o, d = level.dev;
    if (d > o.squatOn) this.t += dt; else if (d < o.squatOff) this.t = 0;
    if (!this.on && this.t >= o.squatHold) this.on = true;
    if (this.on && d < o.squatOff) this.on = false;
    return this.on;
  }
}

/** both hands up high (above the head). `held` = continuous, `fired` = one event per raise (roar). */
export class ArmsUp {
  constructor(o = MOVE) { this.o = o; this.t = 0; this.gone = 0; this.held = false; this.armed = true; this.count = 0; }
  static isUp(b, T, o = MOVE) {
    const P = b.p, topY = b.head.y - T * o.upAbove;
    const side = (w, i, e, s) => {
      const q = P[i] || P[w];
      if (q) return q.y < topY;
      return !!(P[e] && P[s] && P[e].y < P[s].y - T * 0.3); // wrist out of frame at the top: elbow high is enough
    };
    return side('lw', 'li', 'le', 'ls') && side('rw', 'ri', 're', 'rs');
  }
  update(b, T, dt) {
    const o = this.o, up = ArmsUp.isUp(b, T, o);
    let fired = false;
    if (up) { this.t += dt; this.gone = 0; } else { this.gone += dt; if (this.gone > o.upGrace) this.t = 0; }
    this.held = this.t >= o.upHold;
    if (this.held && this.armed) { this.armed = false; fired = true; this.count++; }
    if (!up && this.gone > 0.3) this.armed = true;
    return fired;
  }
  lost(dt) { this.gone += dt; if (this.gone > this.o.upGrace) { this.t = 0; this.held = false; } }
}

/** one limb (knee / wrist) lifted above its own relaxed position (relative to the hip / shoulder, in T) */
class Lift {
  constructor() { this.base = null; this.v = null; this.up = false; this.age = 0; }
  update(raw, on, off, dt) {
    if (raw == null) { this.v = null; this.up = false; return false; }
    this.v = ema(this.v, raw, 8, dt);
    if (this.base == null) this.base = this.v;
    if ((this.age += dt) < 0.4) { this.base = ema(this.base, this.v, 6, dt); return false; } // warm-up: learn the relaxed pose
    const h = this.base - this.v; // + = higher than relaxed
    if (!this.up && h < off) this.base = ema(this.base, this.v, h < 0 ? 3 : 1, dt); // relaxed: follow posture / distance changes
    let fired = false;
    if (!this.up && h > on) { this.up = true; fired = true; }
    else if (this.up && h < off) this.up = false;
    if (this.up && h > on * 4) this.base = ema(this.base, this.v, 0.05, dt);
    return fired;
  }
}
/** march / run in place: knees (+ feet) go up one after the other (any knee lift = one step; walking needs 2 steps
 *  within stepWin s, so one lifted knee is not a walk). Arm pump counts when the legs are not in the frame.
 *  step = one event per lift, fwd 0..1 from the step rate. */
export class March {
  constructor(o = MOVE) { this.o = o; this.L = [new Lift(), new Lift()]; this.src = ''; this.lastStep = -9; this.steps = []; this.fwd = 0; this.count = 0; }
  update(b, T, t, dt, armsBusy = false) {
    const o = this.o, P = b.p, inF = (q) => q && q.y < 0.985;
    let raws = null, on = o.stepOn, off = o.stepOff, src = '';
    if (b.hip && inF(P.lk) && inF(P.rk)) {
      src = 'legs';
      const leg = (k, a) => (P[k].y - b.hip.y) / T + (inF(P[a]) ? ((P[a].y - b.hip.y) / T) * 0.5 : 0);
      raws = [leg('lk', 'la'), leg('rk', 'ra')];
      if (!(inF(P.la) && inF(P.ra))) raws = [(P.lk.y - b.hip.y) / T * 1.5, (P.rk.y - b.hip.y) / T * 1.5];
    } else if (!armsBusy && P.lw && P.rw) { src = 'arms'; on = o.armStepOn; off = o.armStepOff; raws = [(P.lw.y - P.ls.y) / T, (P.rw.y - P.rs.y) / T]; }
    if (src !== this.src) { this.L = [new Lift(), new Lift()]; this.src = src; }
    let step = false;
    if (raws) for (let k = 0; k < 2; k++) if (this.L[k].update(raws[k], on, off, dt) && t - this.lastStep >= o.stepMinGap) { step = true; this.lastStep = t; this.steps.push(t); this.count++; }
    return this._rate(step, t, dt);
  }
  _rate(step, t, dt) {
    const o = this.o;
    while (this.steps.length && t - this.steps[0] > o.stepWin) this.steps.shift();
    const n = this.steps.length, rate = n / o.stepWin; // lifts per second
    const target = n >= 2 && t - this.lastStep < o.stepGap ? clamp(0.2 + rate * 0.27, 0.35, 1) : 0;
    this.fwd = ema(this.fwd, target, target > this.fwd ? 8 : target ? 2.5 : 4, dt);
    if (target === 0 && this.fwd < 0.03) this.fwd = 0;
    return step;
  }
  lost(t, dt) { for (const l of this.L) l.update(null); return this._rate(false, t, dt); }
}

/** swim strokes: an arm goes up above the shoulder and pulls down (crawl / flap), or sweeps from in front of the
 *  chest out to the side (breaststroke). One event per pull per arm. power 0..1 = strokes over the last strokeWin s. */
export class Stroke {
  constructor(o = MOVE) { this.o = o; this.arms = [{ y: null, x: null, upT: -9, inT: -9 }, { y: null, x: null, upT: -9, inT: -9 }]; this.times = []; this.power = 0; this.count = 0; }
  update(b, T, t, dt) {
    const o = this.o, P = b.p, ar = b.ar || 1; let ev = false;
    [['lw', 'li', 'ls'], ['rw', 'ri', 'rs']].forEach(([w, i, s], k) => {
      const A = this.arms[k], q = P[w] || P[i], sh = P[s];
      if (!q || !sh) { A.y = A.x = null; return; }
      const rel = (q.y - sh.y) / T, dx = (Math.abs(q.x - b.sh.x) * ar) / T;
      A.y = ema(A.y, rel, 15, dt); A.x = ema(A.x, dx, 15, dt);
      if (A.y < o.strokeUp) A.upT = t;
      if (A.x < o.strokeIn && A.y < 0.6) A.inT = t;
      let fire = false;
      if (A.y > o.strokeDown && t - A.upT < o.strokeMaxGap) { fire = true; A.upT = -9; }
      if (A.x > o.strokeOut && t - A.inT < o.strokeMaxGap) { fire = true; A.inT = -9; }
      if (fire) ev = true;
    });
    if (ev && (!this.times.length || t - this.times[this.times.length - 1] > 0.18)) { this.times.push(t); this.count++; } else ev = false;
    return this._rate(ev, t, dt);
  }
  _rate(ev, t, dt) {
    while (this.times.length && t - this.times[0] > this.o.strokeWin) this.times.shift();
    this.power = ema(this.power, clamp(this.times.length / 3, 0, 1), 4, dt);
    if (!this.times.length && this.power < 0.03) this.power = 0;
    return ev;
  }
  lost(t, dt) { for (const A of this.arms) { A.y = A.x = null; } return this._rate(false, t, dt); }
}
