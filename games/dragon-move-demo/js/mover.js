// Ground mover for one dragon: velocity eases toward the wanted direction, smooth turn-to-face, soft island edge and
// round obstacles. Moves the whole rig only; the legs come from the GLB's own walk / run clips.
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const MOVE = Object.freeze({ accel: 7, turnRate: 7, radius: 0.42 });

export class Mover {
  /** @param {{ x: number, z: number, yaw: number, inner: number, outer: number }} o soft edge from inner to outer (m) */
  constructor({ x, z, yaw, inner, outer }) {
    this.x = x; this.z = z; this.yaw = yaw; this.vx = 0; this.vz = 0; this.inner = inner; this.outer = outer;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get radius() { return Math.hypot(this.x, this.z); }

  /** (wx, wz) wanted velocity in m/s; obstacles: [{ x, z, r }] */
  update(dt, wx, wz, obstacles = []) {
    const k = damp(MOVE.accel, dt);
    this.vx += (wx - this.vx) * k; this.vz += (wz - this.vz) * k;
    this.#softEdge();
    this.x += this.vx * dt; this.z += this.vz * dt;
    for (const o of obstacles) this.#pushOut(o);
    const r = this.radius; if (r > this.outer) { this.x *= this.outer / r; this.z *= this.outer / r; }
    if (this.speed > 0.15) this.faceToward(Math.atan2(this.vx, this.vz), dt);
  }
  faceToward(yaw, dt, rate = MOVE.turnRate) { this.yaw = wrapAngle(this.yaw + wrapAngle(yaw - this.yaw) * damp(rate, dt)); }

  #softEdge() {   // outward speed fades to zero between inner and outer; sliding along the edge stays free
    const r = this.radius; if (r < this.inner || r === 0) return;
    const nx = this.x / r, nz = this.z / r, out = this.vx * nx + this.vz * nz;
    if (out <= 0) return;
    const cut = smoothstep(this.inner, this.outer, r + out * 0.05);
    this.vx -= nx * out * cut; this.vz -= nz * out * cut;
  }
  #pushOut(o) {
    const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz), min = o.r + MOVE.radius;
    if (d >= min || d === 0) return;
    this.x = o.x + (dx / d) * min; this.z = o.z + (dz / d) * min;
    const nx = dx / d, nz = dz / d, into = this.vx * nx + this.vz * nz;
    if (into >= 0) return;
    const sp = this.speed, side = (this.vx * -nz + this.vz * nx) >= 0 ? 1 : -1;   // slide round it at the same speed
    this.vx = -nz * side * sp; this.vz = nx * side * sp;
  }
}
