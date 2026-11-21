// The two islands. Both use the same layout (slots.js); each spawns only the models its build manifest lists,
// so a model that has not been made yet is simply not there.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { TOOLS, SLOTS } from './slots.js';
import { buildIsland } from './island.js';
import { Dragon } from './dragon.js';
import { Actor } from './actor.js';

export const ISLAND = Object.freeze({ R: 6, inner: 4.6, outer: 5.4 });
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const slotById = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

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
  constructor(tool) { this.tool = tool; this.group = new THREE.Group(); this.group.name = `island-${tool}`; this.group.add(buildIsland(ISLAND.R, ISLAND.inner)); this.actors = []; this.props = {}; this.obstacles = []; this.player = null; }
  get dragons() { return this.actors; }
  async load(entries) {
    const got = await Promise.all(entries.map((e) => loader.loadAsync(e.v ? `${e.url}?v=${e.v}` : e.url).then((g) => [e, g])));
    const bySlot = Object.fromEntries(got.map(([e, g]) => [e.slot, { e, g }]));
    for (const slot of SLOTS) {               // layout order keeps the nest placed before the egg on it
      const hit = bySlot[slot.id]; if (!hit) continue;
      if (slot.kind === 'dragon') {
        const a = new Actor(new Dragon(hit.g, hit.e, slot), slot, ISLAND);
        this.actors.push(a); this.group.add(a.dragon.root);
      } else {
        const p = placeProp(hit.g.scene, slot, slot.sitOn && this.props[slot.sitOn]);
        this.props[slot.id] = p; this.group.add(p.group);
        if (slot.radius) this.obstacles.push({ x: slot.pos[0], z: slot.pos[1], r: slot.radius });
      }
    }
    return this;
  }
  /** round obstacles for one dragon: the props plus every other dragon */
  obstaclesFor(actor) { return this.obstacles.concat(this.actors.filter((a) => a !== actor && !a.airborne && !actor.airborne).map((a) => ({ x: a.mover.x, z: a.mover.z, r: 0.42 }))); }
  setPlayer(actor) { for (const a of this.actors) a.setPlayer(a === actor); this.player = actor; }
  update(dt, input) { for (const a of this.actors) a.update(dt, a === this.player ? input : null, this); }
}

export async function loadWorld(manifestUrl) {
  const res = await fetch(manifestUrl, { cache: 'no-cache' });
  const manifest = await res.json();
  const islands = {};
  await Promise.all(TOOLS.map((t) => new Island(t).load((manifest.islands[t] || []).filter((e) => slotById[e.slot])).then((i) => { islands[t] = i; })));
  return islands;
}
