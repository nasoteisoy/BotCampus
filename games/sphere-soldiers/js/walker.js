// Surface walking on a sphere centred at the origin: position p (|p| = R) and heading f (unit, tangent to the surface).
// Each step turns the heading a little inside the tangent plane, moves along the great circle it points at,
// then snaps p back to radius R and re-orthonormalises f against the surface normal so nothing drifts.
import * as THREE from '../vendor/three.module.min.js';

export const WALK_SPEED = 1.0;        // metres per second, matches the HQ walk gait stride
const TURN_JITTER = 1.6;              // how fast the turn rate wanders (rad/s per s)
const TURN_DAMP = 0.7;                // pulls the turn rate back toward straight
const TURN_MAX = 0.45;                // gentle: at most ~26 degrees per second, so nobody walks in tight circles

const _n = new THREE.Vector3(), _axis = new THREE.Vector3(), _x = new THREE.Vector3(), _m = new THREE.Matrix4();

/** New walker standing at `point` (already on the surface) with a random tangent heading. */
export function makeWalker(point, rand = Math.random) {
  const p = point.clone();
  const n = p.clone().normalize();
  const helper = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const f = helper.sub(n.clone().multiplyScalar(helper.dot(n))).normalize().applyAxisAngle(n, rand() * Math.PI * 2);
  return { p, f, turn: 0, dist: 0, age: 0 };
}

/** Advance one walker by dt seconds on a sphere of radius R. */
export function stepWalker(w, dt, R, rand = Math.random) {
  w.turn += (rand() * 2 - 1) * TURN_JITTER * dt - w.turn * TURN_DAMP * dt;
  w.turn = THREE.MathUtils.clamp(w.turn, -TURN_MAX, TURN_MAX);
  _n.copy(w.p).normalize();
  w.f.applyAxisAngle(_n, w.turn * dt);
  const angle = (WALK_SPEED * dt) / R;
  _axis.crossVectors(_n, w.f).normalize();          // rotating about n x f carries n toward f
  w.p.applyAxisAngle(_axis, angle).setLength(R);
  w.f.applyAxisAngle(_axis, angle);
  _n.copy(w.p).normalize();
  w.f.addScaledVector(_n, -w.f.dot(_n)).normalize();
  w.dist += WALK_SPEED * dt;
  w.age += dt;
  return w;
}

/** Orientation with local +Y = surface normal and local +Z = heading (the trooper faces +Z). */
export function surfaceQuaternion(w, out = new THREE.Quaternion()) {
  _n.copy(w.p).normalize();
  _x.crossVectors(_n, w.f);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _n, w.f));
}
