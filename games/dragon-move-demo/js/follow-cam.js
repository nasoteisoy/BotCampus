// Follow camera with lag on top of OrbitControls: the orbit target eases toward the subject and the camera keeps
// its orbit offset, so drag-orbit and pinch / wheel zoom keep working while it follows. Same exponential smoothing
// as the parts-library ground-lead-cam follow, made frame-rate independent.
import * as THREE from 'three';

export class FollowCam {
  constructor(camera, controls, { lag = 3.5, lookHeight = 0.9 } = {}) {
    this.camera = camera; this.controls = controls; this.lag = lag; this.lookHeight = lookHeight;
    this._want = new THREE.Vector3(); this._step = new THREE.Vector3();
  }
  /** Jump straight to the subject (first frame). */
  snap(pos) { this._want.set(pos.x, pos.y + this.lookHeight, pos.z); this._step.subVectors(this._want, this.controls.target); this.controls.target.add(this._step); this.camera.position.add(this._step); }
  update(dt, pos) {
    this._want.set(pos.x, pos.y * 0.35 + this.lookHeight, pos.z);   // follow hops only a little so the view does not bob
    this._step.subVectors(this._want, this.controls.target).multiplyScalar(1 - Math.exp(-this.lag * dt));
    this.controls.target.add(this._step); this.camera.position.add(this._step);
  }
}
