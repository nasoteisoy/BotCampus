// Follow camera on top of OrbitControls: the orbit target eases toward the subject (plus a little look-ahead along
// its velocity) and the camera keeps its orbit offset, so drag-orbit and pinch / wheel zoom keep working while it
// follows. Same exponential smoothing as the parts-library ground-lead-cam follow, frame-rate independent.
import * as THREE from 'three';
import { damp } from './ease.js';

export class FollowCam {
  /**
   * @param {{ lag?: number, lookHeight?: number, rise?: number, lead?: number, leadRate?: number }} o lag: follow
   * rate (1/s); rise: share of the subject's height the view follows; lead: seconds of velocity to look ahead
   */
  constructor(camera, controls, { lag = 2.6, lookHeight = 0.9, rise = 0.9, lead = 0.35, leadRate = 2 } = {}) {
    this.camera = camera; this.controls = controls;
    this.lag = lag; this.lookHeight = lookHeight; this.rise = rise; this.lead = lead; this.leadRate = leadRate;
    this._want = new THREE.Vector3(); this._step = new THREE.Vector3(); this._ahead = new THREE.Vector3();
  }
  /** Jump straight to the subject (first frame, swap). */
  snap(pos) {
    this._ahead.set(0, 0, 0);
    this._want.set(pos.x, pos.y * this.rise + this.lookHeight, pos.z);
    this.#move(this._step.subVectors(this._want, this.controls.target));
  }
  /** pos: subject position (y = flight height); vel: its XZ velocity in m/s */
  update(dt, pos, vel = { x: 0, z: 0 }) {
    const k = damp(this.leadRate, dt);
    this._ahead.x += (vel.x * this.lead - this._ahead.x) * k; this._ahead.z += (vel.z * this.lead - this._ahead.z) * k;
    this._want.set(pos.x + this._ahead.x, pos.y * this.rise + this.lookHeight, pos.z + this._ahead.z);
    this.#move(this._step.subVectors(this._want, this.controls.target).multiplyScalar(damp(this.lag, dt)));
  }
  #move(step) { this.controls.target.add(step); this.camera.position.add(step); }
}
