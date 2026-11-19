// Arcade flight model for kids: speed is automatic, stick turns and climbs, soft limits stop crashes.
// From parts-library carrier-flight-feel, adapted for space: no sea floor, a soft keep-out box around the carrier hull.
// Bank/pitch easing follows parts-library space-vehicle-feel (createFighterFeel: bank from yaw rate, pitch from climb).
import * as THREE from 'three';
import { DECK_Y, HULL } from './models.js';

export const FLY = {
  cruise: 50, approach: 30, turnRate: 1.0, climbRate: 18, ceiling: 300, floor: -220,
  bankK: 0.95, bankMax: 0.95, bankEase: 0.16, pitchEase: 0.14, takeoffAccel: 10, liftSpeed: 32, bounds: 1500,
};
const ex = (rate, dt) => 1 - Math.exp(-rate * dt);

export function createPlane() {
  return {
    pos: new THREE.Vector3(0, DECK_Y, 66), yaw: Math.PI, vy: 0, speed: 0, yawRate: 0, bank: 0, pitch: 0,
    fwd: new THREE.Vector3(0, 0, 1), climbAssist: 0, propSpin: 0,
  };
}
export function resetPlane(p) {
  p.pos.set(0, DECK_Y, 66); p.yaw = Math.PI; p.vy = 0; p.speed = 0; p.yawRate = 0; p.bank = 0; p.pitch = 0; p.climbAssist = 0;
  p.fwd.set(0, 0, 1);
}
// soft vertical limits at (x, z): open space, except the carrier hull, which pushes the fighter over or under it
export function limitsAt(x, y, z) {
  let lo = FLY.floor, hi = FLY.ceiling;
  if (Math.abs(x) < HULL.halfW && z > HULL.zMin && z < HULL.zMax) {
    if (y > (HULL.top + HULL.bottom) / 2) lo = HULL.top + 10; else hi = HULL.bottom - 10;
  }
  return { lo, hi };
}

// free flight (mission + home)
export function flyStep(p, inp, dt) {
  // stay in the play area: gently turn back toward the carrier
  let steer = inp.x;
  const dist = Math.hypot(p.pos.x, p.pos.z);
  if (dist > FLY.bounds) {
    const toC = Math.atan2(p.pos.x, p.pos.z); // yaw that faces the origin
    let d = toC - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    steer = THREE.MathUtils.clamp(-d * 2, -1, 1);
  }
  p.yawRate += (-steer * FLY.turnRate - p.yawRate) * ex(5, dt);
  p.yaw += p.yawRate * dt;
  let vyT = inp.y * FLY.climbRate;
  if (p.climbAssist > 0) { p.climbAssist -= dt; vyT = Math.max(vyT, 7); }
  p.vy += (vyT - p.vy) * ex(4, dt);
  const lim = limitsAt(p.pos.x, p.pos.y, p.pos.z);
  if (p.pos.y < lim.lo) p.vy = Math.max(p.vy, (lim.lo - p.pos.y) * 2.2);
  if (p.pos.y > lim.hi) p.vy = Math.min(p.vy, (lim.hi - p.pos.y) * 2.2);
  p.speed += (FLY.cruise - p.speed) * ex(1.5, dt);
  integrate(p, dt);
}
export function integrate(p, dt) {
  p.fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  p.pos.addScaledVector(p.fwd, p.speed * dt);
  p.pos.y += p.vy * dt;
  // eased bank + pitch (visual only)
  const bankT = THREE.MathUtils.clamp(p.yawRate * FLY.bankK, -FLY.bankMax, FLY.bankMax);
  p.bank += (bankT - p.bank) * (1 - Math.exp(-dt / FLY.bankEase));
  const pitchT = Math.atan2(p.vy, Math.max(8, p.speed));
  p.pitch += (pitchT - p.pitch) * (1 - Math.exp(-dt / FLY.pitchEase));
}
export function applyPose(p, obj) {
  obj.position.copy(p.pos);
  obj.rotation.set(p.pitch, p.yaw, p.bank, 'YXZ');
}
