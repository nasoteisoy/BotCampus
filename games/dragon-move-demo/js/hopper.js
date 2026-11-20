// Whole-model hop movement for an unrigged model: the model never deforms, it only moves, turns and scales as one piece.
// Hops while there is input, squashes a little on each landing and springs back, turns smoothly to face where it goes,
// and slows to a stop at the island edge instead of hitting a wall.
export const HOP = Object.freeze({
  speed: 2.4,        // m/s at full input
  accel: 9,          // velocity smoothing (1/s)
  hopTime: 0.4,      // seconds in the air per hop
  hopHeight: 0.22,   // metres
  turnRate: 9,       // turn smoothing (1/s)
  squash: 0.14,      // landing squash amount (scale y = 1 - squash at impact)
  squashTime: 0.26,  // seconds for the squash to spring back to rest
  stretch: 0.05,     // extra height while rising / falling fast
});

const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Hopper {
  /** @param {{ inner: number, outer: number, reduceMotion?: boolean }} edge soft edge starts at inner, stops at outer (metres from centre) */
  constructor({ inner, outer, reduceMotion = false }) {
    this.inner = inner; this.outer = outer;
    this.cfg = reduceMotion ? { ...HOP, hopHeight: 0.08, squash: 0, stretch: 0 } : HOP;
    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0; this.yaw = 0;
    this.y = 0; this.sy = 1; this.sxz = 1;
    this.airborne = false; this.phase = 0; this.sinceLand = Infinity; this.landings = 0;
  }

  /** dt seconds; (ix, iz) wanted direction on the ground, length 0..1 */
  update(dt, ix, iz) {
    const c = this.cfg, want = Math.min(1, Math.hypot(ix, iz));
    // velocity eases toward the input
    const k = damp(c.accel, dt);
    this.vx += (ix * c.speed - this.vx) * k; this.vz += (iz * c.speed - this.vz) * k;
    this.#softEdge();
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.#clampEdge();
    // hop: start one whenever there is input and we are on the ground; a started hop always finishes
    if (!this.airborne && want > 0.1) { this.airborne = true; this.phase = 0; }
    if (this.airborne) {
      this.phase += dt / c.hopTime;
      if (this.phase >= 1) { this.airborne = false; this.phase = 0; this.sinceLand = 0; this.landings++; }   // landing frame shows full squash
    } else this.sinceLand += dt;
    this.y = this.airborne ? c.hopHeight * Math.sin(Math.PI * this.phase) : 0;
    // squash on landing (damped spring back), slight stretch at take-off / before landing; volume kept
    let sy = 1;
    if (this.airborne) sy += c.stretch * Math.abs(Math.cos(Math.PI * this.phase));
    else if (this.sinceLand < c.squashTime) { const t = this.sinceLand / c.squashTime; sy -= c.squash * Math.exp(-5 * t) * Math.cos(2.5 * Math.PI * t) * (1 - t); }
    this.sy = sy; this.sxz = 1 / Math.sqrt(sy);
    // face the way we are going
    if (Math.hypot(this.vx, this.vz) > 0.2) this.yaw += wrapAngle(Math.atan2(this.vx, this.vz) - this.yaw) * damp(c.turnRate, dt);
    this.yaw = wrapAngle(this.yaw);
    return this;
  }

  get radius() { return Math.hypot(this.x, this.z); }

  // outward speed fades to zero between inner and outer, sliding along the edge stays free
  #softEdge() {
    const r = this.radius; if (r < this.inner || r === 0) return;
    const nx = this.x / r, nz = this.z / r, out = this.vx * nx + this.vz * nz;
    if (out <= 0) return;
    const keep = 1 - smoothstep(this.inner, this.outer, r + out * 0.05);
    this.vx -= nx * out * (1 - keep); this.vz -= nz * out * (1 - keep);
  }
  #clampEdge() {
    const r = this.radius; if (r <= this.outer) return;
    this.x *= this.outer / r; this.z *= this.outer / r;
  }
}
