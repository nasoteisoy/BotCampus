// Walking HQ troopers on the planet. One createHqTrooper() supplies the approved look and part template;
// every soldier is a Rig on that template (rigid parts, HQ walk gait). All soldiers draw through one
// InstancedMesh per rigid part, so draw calls stay flat however many soldiers are walking.
import * as THREE from '../vendor/three.module.min.js';
import { createHqTrooper, disposeHqTrooper } from './hq/api.js';
import { Rig } from './hq/demo-rig.js';
import { arenaPose } from './hq/demo-actions.js';
import { makeWalker, stepWalker, surfaceQuaternion } from './walker.js';

export const MAX_SOLDIERS = 60;     // at the cap the oldest soldier makes way for the new one

export class Army {
  constructor(scene, R, rand = Math.random) {
    this.scene = scene; this.R = R; this.rand = rand;
    this.soldiers = [];
    this.proto = null;   // { root, rig } from createHqTrooper: look + template owner
    this.parts = [];     // InstancedMesh per rigid part, same order as rig.meshes
  }
  get count() { return this.soldiers.length; }

  spawn(point) {
    if (!this.proto) this.#build();
    if (this.soldiers.length >= MAX_SOLDIERS) this.soldiers.shift();
    const rig = new Rig(this.proto.rig.tpl, this.proto.rig.look);
    const carrier = new THREE.Group();
    carrier.add(rig.root);
    const s = { rig, carrier, walker: makeWalker(point, this.rand), spawn: point.clone() };   // spawn: where it was dropped
    this.soldiers.push(s);
    this.#place(s);
    this.#upload();
    return s;
  }

  update(dt) {
    for (const s of this.soldiers) { stepWalker(s.walker, dt, this.R, this.rand); this.#place(s); }
    if (this.parts.length) this.#upload();
  }

  /** Remove every soldier and free the GPU side (instance buffers, part geometry, look texture + materials). */
  clear() {
    this.soldiers = [];
    for (const im of this.parts) { this.scene.remove(im); im.dispose(); }
    this.parts = [];
    if (this.proto) {
      const { rig } = this.proto;
      rig.tpl.dispose();   // api.js keeps the template cached; three re-uploads its geometry if a soldier is spawned again
      rig.look.tex.dispose(); rig.look.team.dispose(); rig.look.visor.dispose();
      disposeHqTrooper(this.proto);
      this.proto = null;
    }
  }

  #build() {
    this.proto = createHqTrooper({ side: 'attacker', cls: 'rifle' });
    this.parts = this.proto.rig.meshes.map((m) => {
      const im = new THREE.InstancedMesh(m.geometry, m.material, MAX_SOLDIERS);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true; im.frustumCulled = false; im.count = 0; im.name = 'soldiers:' + m.name;
      this.scene.add(im);
      return im;
    });
  }

  // stand the soldier on the surface (up = normal, facing its heading) and pose the rigid parts for its walk
  #place(s) {
    const w = s.walker;
    s.carrier.position.copy(w.p);
    surfaceQuaternion(w, s.carrier.quaternion);
    s.rig.apply(arenaPose({ t: w.age, aim: 0.1, move: 1, run: false, dist: w.dist }));
    s.carrier.updateMatrixWorld(true);
  }

  #upload() {
    const n = this.soldiers.length;
    this.parts.forEach((im, k) => {
      for (let i = 0; i < n; i++) im.setMatrixAt(i, this.soldiers[i].rig.meshes[k].matrixWorld);
      im.count = n; im.instanceMatrix.needsUpdate = true;
    });
  }
}
