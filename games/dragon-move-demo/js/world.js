// The two islands. Both use the same layout (slots.js); each spawns only the models its build manifest lists,
// so a model that has not been made yet is simply not there. A style (cute or realistic) is one pair of islands.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { TOOLS, SLOTS } from './slots.js';
import { buildIsland } from './island.js';
import { Dragon } from './dragon.js';
import { Actor } from './actor.js';
import { MOVE } from './mover.js';

export const ISLAND = Object.freeze({ R: 6, inner: 4.6, outer: 5.4 });
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const _box = new THREE.Box3(), _size = new THREE.Vector3(), _c = new THREE.Vector3();

/** Idle skinned footprint around the root: half the longer of length/width, and the radius from the root that covers the AABB. */
export function measureFootprint(dragon) {
  dragon.play('idle', 0); dragon.update(0);
  const r = dragon.root, yaw = r.rotation.y;
  r.rotation.y = 0; r.updateMatrixWorld(true);
  _box.makeEmpty();
  dragon.model.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); _box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  if (_box.isEmpty()) _box.setFromObject(dragon.model);
  _box.getSize(_size); _box.getCenter(_c);
  const length = _size.z, width = _size.x, halfMax = 0.5 * Math.max(length, width);
  const fromRoot = Math.max(
    Math.hypot(_box.min.x - r.position.x, _box.min.z - r.position.z),
    Math.hypot(_box.min.x - r.position.x, _box.max.z - r.position.z),
    Math.hypot(_box.max.x - r.position.x, _box.min.z - r.position.z),
    Math.hypot(_box.max.x - r.position.x, _box.max.z - r.position.z),
  );
  r.rotation.y = yaw; r.updateMatrixWorld(true);
  return { length, width, height: _size.y, halfMax, fromRoot };
}

function placeProp(scene, slot, under) {
  const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = slot.height / (size.y || 1);
  scene.scale.setScalar(k); scene.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  const g = new THREE.Group(); g.add(scene);
  const baseY = under ? under.top * 0.55 : 0;
  g.position.set(slot.pos[0], baseY, slot.pos[1]); g.rotation.y = slot.yaw;
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, top: baseY + slot.height };
}

export class Island {
  constructor(tool, slots = SLOTS, cute = true) { this.tool = tool; this.slots = slots; this.cute = cute; this.group = new THREE.Group(); this.group.name = `island-${tool}`; this.group.add(buildIsland(ISLAND.R, ISLAND.inner)); this.actors = []; this.props = {}; this.obstacles = []; this.player = null; }
  get dragons() { return this.actors; }
  async load(entries) {
    const got = await Promise.all(entries.map((e) => loader.loadAsync(e.v ? `${e.url}?v=${e.v}` : e.url).then((g) => [e, g])));
    const bySlot = Object.fromEntries(got.map(([e, g]) => [e.slot, { e, g }]));
    for (const slot of this.slots) {               // layout order keeps the nest placed before the egg on it
      const hit = bySlot[slot.id]; if (!hit) continue;
      if (slot.kind === 'dragon') {
        const dragon = new Dragon(hit.g, hit.e, slot);
        const foot = measureFootprint(dragon);
        // Cute keeps the r3 radius of 0.42. Realistic uses the root-covering footprint so long uncentered bodies do not poke through.
        const bodyR = this.cute ? MOVE.radius : +foot.fromRoot.toFixed(3);
        dragon.footprint = { ...foot, bodyR };
        const a = new Actor(dragon, slot, ISLAND, bodyR);
        this.actors.push(a); this.group.add(a.dragon.root);
      } else {
        const p = placeProp(hit.g.scene, slot, slot.sitOn && this.props[slot.sitOn]);
        this.props[slot.id] = p; this.group.add(p.group);
        if (slot.radius) this.obstacles.push({ x: slot.pos[0], z: slot.pos[1], r: slot.radius });
      }
    }
    this.separate();
    return this;
  }
  /** round obstacles for one dragon: the props plus every other dragon */
  obstaclesFor(actor) { return this.obstacles.concat(this.actors.filter((a) => a !== actor && !a.airborne && !actor.airborne).map((a) => ({ x: a.mover.x, z: a.mover.z, r: a.mover.bodyR }))); }
  /** Push overlapping dragons apart (spawn and after teleport). */
  separate() {
    for (let i = 0; i < 8; i++) {
      for (const a of this.actors) { if (!a.airborne) a.mover.resolve(this.obstaclesFor(a)); }
    }
    for (const a of this.actors) a.sync();
  }
  setPlayer(actor) { for (const a of this.actors) a.setPlayer(a === actor); this.player = actor; }
  update(dt, input) { for (const a of this.actors) a.update(dt, a === this.player ? input : null, this); }
}

export async function loadWorld(manifestUrl, slots = SLOTS, cute = true) {
  const slotById = Object.fromEntries(slots.map((s) => [s.id, s]));
  const res = await fetch(manifestUrl, { cache: 'no-cache' });
  const manifest = await res.json();
  const islands = {};
  await Promise.all(TOOLS.map((t) => new Island(t, slots, cute).load((manifest.islands[t] || []).filter((e) => slotById[e.slot])).then((i) => { islands[t] = i; })));
  return islands;
}
