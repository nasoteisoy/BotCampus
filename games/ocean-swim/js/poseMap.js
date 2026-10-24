// Ocean Swim: pose -> controls (pure, no DOM; unit-tested in test/unit-moves.mjs).
//   arm strokes (flap down, or sweep out) = swim forward (more strokes = faster)   lean left / right = turn
//   both arms up high and held = float up            squat down = dive down
// Output: { tracked, fwd 0..1, turn -1..1, vert -1..1, stroke (one-shot), jump, roar, step, up }
import { toBody } from './body.js';
import { Size, Lean, Level, Squat, ArmsUp, Stroke, MOVE } from './moves.js';

export const EVENTS = ['jump', 'roar', 'step', 'stroke'];
export const IDLE_OUT = { tracked: false, fwd: 0, turn: 0, vert: 0, jump: false, roar: false, step: false, stroke: false, up: false };
const RISE_HOLD = 0.45;   // s with both hands up high before floating up (a stroke passes through "up" quickly)
const RISE_AFTER = 1.6;   // s after the last stroke before arms-up counts as "float up"

export class PoseMapper {
  constructor(opts = {}) { this.o = { ...MOVE, ...opts }; this.reset(); }
  reset() {
    this.size = new Size(); this.lean = new Lean(this.o); this.level = new Level(this.o); this.squat = new Squat(this.o);
    this.arms = new ArmsUp({ ...this.o, upHold: RISE_HOLD }); this.stroke = new Stroke(this.o); this.prevT = null; this.lastStroke = -9; this.vert = 0;
  }
  _fwd() { const p = this.stroke.power; return p > 0.05 ? Math.min(1, 0.3 + 0.75 * p) : 0; }
  /** @param lm 33 raw MediaPipe landmarks (or null), t seconds, ar frame width / height */
  update(lm, t, ar = 4 / 3) {
    let dt = this.prevT == null ? 1 / 30 : t - this.prevT; this.prevT = t;
    if (!(dt > 0)) dt = 1 / 30; dt = Math.min(dt, 0.5);
    const b = toBody(lm, ar, this.o.visMin ?? 0.5);
    if (!b) {
      this.arms.lost(dt); this.stroke.lost(t, dt); this.vert *= Math.exp(-4 * dt); if (Math.abs(this.vert) < 0.02) this.vert = 0;
      return { ...IDLE_OUT, turn: this.lean.lost(dt), fwd: this._fwd(), vert: this.vert };
    }
    const T = this.size.update(b, dt);
    const turn = this.lean.update(b, T, dt);
    this.level.update(b, T, dt);
    const down = this.squat.update(this.level, dt);
    this.arms.update(b, T, dt);
    const stroke = this.stroke.update(b, T, t, dt);
    if (stroke) this.lastStroke = t;
    const up = this.arms.held && t - this.lastStroke > RISE_AFTER;
    const want = up ? 1 : down ? -1 : 0;
    this.vert += (want - this.vert) * (1 - Math.exp(-(want ? 6 : 5) * dt));
    if (!want && Math.abs(this.vert) < 0.02) this.vert = 0;
    return { tracked: true, fwd: this._fwd(), turn, vert: this.vert, jump: false, roar: false, step: false, stroke, up };
  }
}
