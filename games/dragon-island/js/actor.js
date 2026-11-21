// What a dragon is doing. The player's dragon follows input; the others wander (idle, walk, sleep, happy, look
// around) and keep an eye on the player. Every pose comes from the GLB's own clips; actions whose clip is missing
// are skipped for that dragon.
import * as THREE from 'three';
import { Mover } from './mover.js';
import { damp, wrapAngle } from './ease.js';
import { FlightPose, FLY } from './flight-pose.js';

export const SPEED = Object.freeze({ walk: 0.85, run: 2.2, fly: 2.0, wander: 0.6 });
/** Speed / turn easing per gait (see Mover.update): run reacts a little faster, flight is heavy and turns wide. */
const FEEL = Object.freeze({
  walk: {} /* MOVE defaults */, run: { accel: 5, decel: 3.5 }, fly: { accel: 1.8, decel: 1.2, turnMax: 1.5 },
});
const FLY_STEER = 0.4;   // share of fly speed the stick still steers with during takeoff / landing
const TURN_STEP = 0.8;   // rad/s: turning in place this fast plays slow walk steps instead of idle
const NEAR = 4.5, LOOK_MAX = 1.0, IDLE_FIDGET = 7;
const rand = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _up = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();

export class Actor {
  constructor(dragon, slot, edge, bodyR = 0.42) {
    this.dragon = dragon; this.slot = slot;
    this.mover = new Mover({ x: slot.pos[0], z: slot.pos[1], yaw: slot.yaw, inner: edge.inner, outer: edge.outer, bodyR });
    this.isPlayer = false; this.state = 'ground'; this.timer = rand(1, 3); this.idleFor = 0; this.target = null;
    this.wantLand = false; this.lookYaw = 0; this.happyCool = 0; this.yawRate = 0; this.landClipDone = false;
    this.flight = new FlightPose();
    dragon.onFinished = (clip) => this.#finished(clip);
    this.#sync();
  }
  /** Public pose write (used after a spawn resolve). */
  sync() { this.#sync(); }
  get airborne() { return this.state === 'takeoff' || this.state === 'fly' || this.state === 'land'; }
  canFly() { return this.dragon.has('fly'); }
  canFire() { return this.dragon.has('fire_breath') && !this.airborne; }

  setPlayer(on) {
    this.isPlayer = on; this.target = null; this.lookYaw = 0;
    if (this.state === 'sleep' || this.state === 'look' || this.state === 'happy' || this.state === 'walk') this.#toGround();
    if (on && this.state === 'ground' && this.dragon.play('happy')) this.state = 'happy';
  }
  /** Fly button: take off (takeoff, then fly) or come down (land); a tap during a transition is kept for later */
  toggleFly() {
    if (!this.canFly()) return;
    if (this.state === 'fly') return this.#land();
    if (this.state === 'takeoff') { this.wantLand = true; return; }
    if (this.state === 'land') return;
    this.wantLand = false;
    this.state = 'takeoff';
    if (!this.dragon.play('takeoff')) this.dragon.play('fly');
    this.flight.startArc(FLY.cruise, this.dragon.clipLength('takeoff'));
  }
  fire() {
    if (!this.canFire() || this.state === 'fire') return;
    if (this.dragon.play('fire_breath')) this.state = 'fire';
  }

  /** input: { x, z } wanted direction (length 0..1) and run flag, only for the player */
  update(dt, input, world) {
    const m = this.mover;
    const yaw0 = m.yaw;
    let wx = 0, wz = 0, feel = this.airborne ? FEEL.fly : FEEL.walk;
    if (this.isPlayer) {
      const mag = Math.min(1, Math.hypot(input.x, input.z));
      if (mag > 0.05 && (this.state === 'happy' || this.state === 'look')) this.#toGround();
      if (this.state === 'ground' && input.run) feel = FEEL.run;
      const top = this.state === 'fly' ? SPEED.fly : this.airborne ? SPEED.fly * FLY_STEER : input.run ? SPEED.run : SPEED.walk;
      if (this.state === 'ground' || this.airborne) { wx = input.x * top; wz = input.z * top; }
    } else this.#think(dt, world);
    if (this.state === 'walk' && this.target) {
      const dx = this.target[0] - m.x, dz = this.target[1] - m.z, d = Math.hypot(dx, dz);
      if (d < 0.3 || (this.timer -= dt) < 0) this.#toGround(); else { wx = (dx / d) * SPEED.wander; wz = (dz / d) * SPEED.wander; }
    }
    m.update(dt, wx, wz, world.obstaclesFor(this), feel);
    this.yawRate = dt > 0 ? wrapAngle(m.yaw - yaw0) / dt : 0;
    this.flight.update(dt, { airborne: this.airborne, yawRate: this.yawRate, speed: m.speed });
    if (this.state === 'land' && this.flight.arcDone && this.landClipDone) this.#toGround();
    if (this.state === 'ground') this.#locomotion(dt);
    if (this.state === 'fly') this.dragon.setRate(1);
    if (this.state === 'walk') this.dragon.setRate(THREE.MathUtils.clamp(m.speed / SPEED.walk, 0.6, 1.3));
    this.#sync();
    this.dragon.update(dt);
    if (!this.isPlayer) this.#lookAt(dt, world.player);
  }

  #locomotion(dt) {
    const s = this.mover.speed, d = this.dragon;
    if (s < 0.15 && Math.abs(this.yawRate) < TURN_STEP) {
      this.idleFor += dt;
      if (this.isPlayer && this.idleFor > IDLE_FIDGET && d.play('look_around')) { this.state = 'look'; this.idleFor = 0; return; }
      d.play('idle'); return;
    }
    this.idleFor = 0;
    const run = s > (SPEED.walk + SPEED.run) / 2 && d.has('run');
    if (run) { d.play('run'); d.setRate(THREE.MathUtils.clamp(s / SPEED.run, 0.6, 1.3)); }
    else if (d.play('walk')) d.setRate(THREE.MathUtils.clamp(s / SPEED.walk, 0.6, 1.4));   // a pivot in place steps at the 0.6 floor
  }
  #think(dt, world) {
    this.happyCool -= dt;
    const p = world.player, near = p && Math.hypot(p.mover.x - this.mover.x, p.mover.z - this.mover.z);
    if (this.state === 'sleep') { if (near < 1.3) { this.#toGround(); this.#happy(); } else if ((this.timer -= dt) < 0) this.#toGround(); return; }
    if (this.state !== 'ground') return;
    if (near < 1.6 && this.happyCool < 0 && this.#happy()) return;
    if ((this.timer -= dt) > 0) return;
    const roll = Math.random();
    if (roll < 0.55 && this.dragon.has('walk')) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.mover.inner * 0.85;
      this.target = [Math.cos(a) * r, Math.sin(a) * r]; this.state = 'walk'; this.timer = 9; this.dragon.play('walk');
    } else if (roll < 0.72 && near > 3 && this.dragon.play('sleep')) { this.state = 'sleep'; this.timer = rand(6, 10); }
    else if (roll < 0.86 && this.dragon.play('look_around')) this.state = 'look';
    else this.timer = rand(2, 4);
  }
  #happy() { if (!this.dragon.play('happy')) return false; this.state = 'happy'; this.happyCool = 9; return true; }
  /** Come down along a height arc timed to the land clip; update() lands it once the clip ends and the arc is down. */
  #land() {
    this.wantLand = false; this.state = 'land'; this.landClipDone = !this.dragon.play('land');
    this.flight.startArc(0, this.dragon.clipLength('land'));
  }
  #toGround() { this.state = 'ground'; this.target = null; this.timer = rand(2, 5); this.idleFor = 0; this.dragon.play('idle'); }
  #finished(clip) {
    if (clip === 'takeoff' && this.state === 'takeoff') { this.dragon.play('fly'); this.state = 'fly'; if (this.wantLand) this.#land(); return; }
    if (clip === 'land') { this.landClipDone = true; return; }
    if (clip === 'fire_breath' || clip === 'happy' || clip === 'look_around') if (this.state !== 'fly' && this.state !== 'takeoff') this.#toGround();
  }
  /** turn toward the player when idle, and turn the head bone on top of the clip pose (clamped, eased) */
  #lookAt(dt, player) {
    const awake = this.state === 'ground' || this.state === 'happy' || this.state === 'walk' || this.state === 'look';
    let want = 0;
    if (player && awake) {
      const dx = player.mover.x - this.mover.x, dz = player.mover.z - this.mover.z, d = Math.hypot(dx, dz);
      if (d < NEAR) {
        const yawTo = Math.atan2(dx, dz);
        if (this.state === 'ground' && this.mover.speed < 0.15) this.mover.faceToward(yawTo, dt, 2.5);
        want = THREE.MathUtils.clamp(wrapAngle(yawTo - this.mover.yaw), -LOOK_MAX, LOOK_MAX);
      }
    }
    this.lookYaw += (want - this.lookYaw) * damp(4, dt);
    const h = this.dragon.head; if (!h || Math.abs(this.lookYaw) < 1e-3) return;
    this.dragon.root.updateMatrixWorld(true);
    h.parent.getWorldQuaternion(_pq);
    _up.set(0, 1, 0).applyQuaternion(_pq.invert());
    h.quaternion.premultiply(_q.setFromAxisAngle(_up, this.lookYaw));
  }
  #sync() {
    const r = this.dragon.root, f = this.flight;
    r.position.set(this.mover.x, f.alt, this.mover.z); r.rotation.set(f.pitch, this.mover.yaw, f.bank, 'YXZ');
  }
}
