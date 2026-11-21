// Ground mover for one dragon: it heads where it faces, turns at a capped rate, eases into and out of its speed
// (slower to stop than to start), and keeps a soft island edge and round obstacles. Moves the whole rig in XZ only;
// the legs come from the GLB's own walk / run clips.
import { damp, wrapAngle, smoothstep } from './ease.js';

/** accel / decel: speed easing rates (1/s); turnRate: heading easing (1/s); turnMax: yaw speed cap (rad/s) */
export const MOVE = Object.freeze({ accel: 4, decel: 3, turnRate: 6, turnMax: 2.2, radius: 0.42 });

export class Mover {
  /** @param {{ x: number, z: number, yaw: number, inner: number, outer: number }} o soft edge from inner to outer (m) */
  constructor({ x, z, yaw, inner, outer, bodyR = MOVE.radius }) {
    this.x = x; this.z = z; this.yaw = yaw; this.vx = 0; this.vz = 0; this.inner = inner; this.outer = outer; this.bodyR = bodyR;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get radius() { return Math.hypot(this.x, this.z); }

  /**
   * (wx, wz) wanted velocity in m/s; obstacles: [{ x, z, r }]. The dragon first turns toward the wanted direction
   * (capped yaw speed), then moves along its facing; far off-heading it slows down so a reversal is a pivot, not a snap.
   * @param {{ accel?: number, decel?: number, turnMax?: number }} feel per-call overrides (run, flight)
   */
  update(dt, wx, wz, obstacles = [], { accel = MOVE.accel, decel = MOVE.decel, turnMax = MOVE.turnMax } = {}) {
    const want = Math.hypot(wx, wz);
    let tx = 0, tz = 0;
    if (want > 1e-3) {
      const heading = Math.atan2(wx, wz);
      this.faceToward(heading, dt, MOVE.turnRate, turnMax);
      const sp = want * smoothstep(-0.6, 0.7, Math.cos(heading - this.yaw));   // full speed within ~45 deg, none when reversing
      tx = Math.sin(this.yaw) * sp; tz = Math.cos(this.yaw) * sp;
    }
    const k = damp(Math.hypot(tx, tz) >= this.speed ? accel : decel, dt);
    this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    this.#softEdge();
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.resolve(obstacles);
  }
  /** Ease the heading toward yaw, never faster than turnMax rad/s. */
  faceToward(yaw, dt, rate = MOVE.turnRate, turnMax = MOVE.turnMax) {
    const lim = turnMax * dt, step = Math.min(lim, Math.max(-lim, wrapAngle(yaw - this.yaw) * damp(rate, dt)));
    this.yaw = wrapAngle(this.yaw + step);
  }
  /** Push out of obstacles and back inside the outer edge. */
  resolve(obstacles = []) {
    for (const o of obstacles) this.#pushOut(o);
    const r = this.radius; if (r > this.outer) { this.x *= this.outer / r; this.z *= this.outer / r; }
  }

  #softEdge() {   // outward speed fades to zero between inner and outer; sliding along the edge stays free
    const r = this.radius; if (r < this.inner || r === 0) return;
    const nx = this.x / r, nz = this.z / r, out = this.vx * nx + this.vz * nz;
    if (out <= 0) return;
    const cut = smoothstep(this.inner, this.outer, r + out * 0.05);
    this.vx -= nx * out * cut; this.vz -= nz * out * cut;
  }
  #pushOut(o) {
    const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz), min = o.r + this.bodyR;
    if (d >= min || d === 0) return;
    this.x = o.x + (dx / d) * min; this.z = o.z + (dz / d) * min;
    const nx = dx / d, nz = dz / d, into = this.vx * nx + this.vz * nz;
    if (into >= 0) return;
    const sp = this.speed, side = (this.vx * -nz + this.vz * nx) >= 0 ? 1 : -1;   // slide round it at the same speed
    this.vx = -nz * side * sp; this.vz = nx * side * sp;
  }
}
