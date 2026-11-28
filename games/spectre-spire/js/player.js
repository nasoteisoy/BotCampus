// The local hunter: first-person movement with collision, jump, knockback, dash and head bob.
import { T } from './config.js';
import { collideCircle, groundAt } from './tower.js';

export class LocalPlayer {
  constructor() { this.reset(0, 0, 0); }
  reset(x, z, yaw) {
    Object.assign(this, { x, z, y: 0, vy: 0, yaw, pitch: -0.05, kx: 0, kz: 0, vx: 0, vz: 0, onGround: true, bob: 0, dashT: 0, moving: 0 });
  }
  knock(dx, dz, power = 7) { this.kx += dx * power; this.kz += dz * power; this.vy = Math.max(this.vy, 3); this.onGround = false; }
  dash() { const f = this.forward(); this.kx += f.x * 13; this.kz += f.z * 13; this.dashT = 5; }
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }

  update(dt, inp, floor, { speedMul = 1, down = false, carry = 1, jump = false }) {
    this.yaw -= inp.lookDx; this.pitch -= inp.lookDy;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    this.dashT = Math.max(0, this.dashT - dt);
    const f = this.forward(), r = { x: -f.z, z: f.x };
    let mx = r.x * inp.mx + f.x * inp.my, mz = r.z * inp.mx + f.z * inp.my;
    const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    const speed = T.walk * speedMul * carry * (down ? 0.28 : 1) * (this.dashT > 0 ? 1.4 : 1);
    const accel = this.onGround ? 14 : 5;
    this.vx += (mx * speed - this.vx) * Math.min(1, dt * accel);
    this.vz += (mz * speed - this.vz) * Math.min(1, dt * accel);
    this.kx *= Math.exp(-dt * 5); this.kz *= Math.exp(-dt * 5);
    this.x += (this.vx + this.kx) * dt; this.z += (this.vz + this.kz) * dt;
    if (jump && this.onGround && !down) { this.vy = T.jumpV; this.onGround = false; }
    this.vy -= T.gravity * dt; this.y += this.vy * dt;
    const g = groundAt(floor, this.x, this.z, T.playerR, this.y);
    if (this.y <= g) { this.y = g; this.vy = 0; this.onGround = true; } else this.onGround = this.y - g < 0.02;
    [this.x, this.z] = collideCircle(floor, this.x, this.z, T.playerR, this.y, this.y + 1.7);
    this.moving = Math.hypot(this.vx, this.vz) / T.walk;
    if (this.onGround) this.bob += dt * Math.hypot(this.vx, this.vz) * 2.2;
  }
}
