// Height, bank and pitch for one dragon, applied to its root group as a rigid pose (the clips stay on the model).
// Takeoff and landing ease along a height arc timed to the clip; in flight it holds cruise with a slow glide;
// bank comes from the turn rate and pitch from climb / sink, both eased frame-rate independently.
// Bank / pitch easing follows parts-library carrier-flight-feel (bank from yaw rate, pitch = atan2(vy, speed)).
// Collision never sees this height: dragons still collide in XZ only.
import { damp, smoothstep } from './ease.js';

/** cruise / glide in m; bank and pitch limits in rad; *Tau easing time constants in s; arcFallback in s */
export const FLY = Object.freeze({
  cruise: 1.8, glideAmp: 0.06, glideRate: 1.1, holdRate: 2,
  bankK: 0.32, bankMax: 0.42, bankTau: 0.28, pitchMax: 0.25, pitchTau: 0.22, arcFallback: 0.8,
});
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class FlightPose {
  constructor() { this.alt = 0; this.vy = 0; this.bank = 0; this.pitch = 0; this.arc = null; this.glideT = 0; }
  get arcDone() { return !this.arc; }
  /** Ease height from where it is now to `to` over `dur` seconds (ease-in-out, no pop). */
  startArc(to, dur) { this.arc = { from: this.alt, to, t: 0, dur: dur > 0 ? dur : FLY.arcFallback }; }
  /** @param {{ airborne: boolean, yawRate: number, speed: number }} s yawRate in rad/s, speed = XZ m/s */
  update(dt, { airborne, yawRate, speed }) {
    const before = this.alt;
    if (this.arc) {
      const a = this.arc, u = Math.min(1, (a.t += dt) / a.dur);
      this.alt = a.from + (a.to - a.from) * smoothstep(0, 1, u);
      if (u >= 1) this.arc = null;
    } else if (airborne) {
      this.glideT += dt;
      const hold = FLY.cruise + FLY.glideAmp * Math.sin(this.glideT * FLY.glideRate);
      this.alt += (hold - this.alt) * damp(FLY.holdRate, dt);
    } else this.alt = 0;
    this.vy = dt > 0 ? (this.alt - before) / dt : 0;
    // The model faces +Z, so a left turn (yaw rising) rolls the left wing (+X) down: negative Z rotation.
    const bankTo = airborne ? -clamp(yawRate * FLY.bankK, -FLY.bankMax, FLY.bankMax) : 0;
    // Positive X rotation dips the nose, so a climb (vy > 0) is a negative pitch.
    const pitchTo = airborne ? -clamp(Math.atan2(this.vy, Math.max(1, speed)), -FLY.pitchMax, FLY.pitchMax) : 0;
    this.bank += (bankTo - this.bank) * damp(1 / FLY.bankTau, dt);
    this.pitch += (pitchTo - this.pitch) * damp(1 / FLY.pitchTau, dt);
  }
}
