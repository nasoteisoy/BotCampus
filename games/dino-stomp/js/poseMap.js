// Dino Stomp: pose -> controls (pure, no DOM; unit-tested in test/unit-moves.mjs).
//   march / run in place = walk (faster marching = faster)   lean left / right = turn
//   jump = big stomp jump                                     both arms up high = ROAR
// Output: { tracked, fwd 0..1, turn -1..1, vert 0, jump, roar, step, stroke } (jump / roar / step = one-shot events)
import { toBody } from './body.js';
import { Size, Lean, Level, Jump, ArmsUp, March, MOVE } from './moves.js';

export const EVENTS = ['jump', 'roar', 'step', 'stroke'];
export const IDLE_OUT = { tracked: false, fwd: 0, turn: 0, vert: 0, jump: false, roar: false, step: false, stroke: false, up: false };

export class PoseMapper {
  constructor(opts = {}) { this.o = { ...MOVE, ...opts }; this.reset(); }
  reset() {
    this.size = new Size(); this.lean = new Lean(this.o); this.level = new Level(this.o); this.jumpD = new Jump(this.o);
    this.arms = new ArmsUp(this.o); this.march = new March(this.o); this.prevT = null; this.last = null;
  }
  /** @param lm 33 raw MediaPipe landmarks (or null), t seconds, ar frame width / height */
  update(lm, t, ar = 4 / 3) {
    let dt = this.prevT == null ? 1 / 30 : t - this.prevT; this.prevT = t;
    if (!(dt > 0)) dt = 1 / 30; dt = Math.min(dt, 0.5);
    const b = toBody(lm, ar, this.o.visMin ?? 0.5);
    if (!b) {
      this.arms.lost(dt);
      return { ...IDLE_OUT, turn: this.lean.lost(dt), fwd: (this.march.lost(t, dt), this.march.fwd) };
    }
    const T = this.size.update(b, dt);
    const turn = this.lean.update(b, T, dt);
    this.level.update(b, T, dt);
    const roar = this.arms.update(b, T, dt);
    const jump = this.jumpD.update(this.level, !!b.hip, dt);
    const step = this.march.update(b, T, t, dt, this.arms.held || ArmsUp.isUp(b, T, this.o));
    return { tracked: true, fwd: this.march.fwd, turn, vert: 0, jump, roar, step, stroke: false, up: this.arms.held, src: this.march.src };
  }
}
