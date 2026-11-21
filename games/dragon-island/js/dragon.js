// One rigged dragon: its GLB scene, a mixer over the GLB's own clips, and crossfades between them.
// Only clips that exist in the file are used; a missing clip means that action is skipped for this dragon.
import * as THREE from 'three';
import { CLIPS } from './slots.js';

const FADE = 0.25;
const ONCE = new Set(['takeoff', 'land', 'fire_breath', 'look_around', 'happy']);

export class Dragon {
  constructor(gltf, entry, slot) {
    this.slot = slot; this.entry = entry;
    this.root = new THREE.Group(); this.root.name = `dragon-${slot.id}`;
    this.model = gltf.scene; this.root.add(this.model);
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    this.socket = entry.socket ? this.model.getObjectByName(entry.socket) : null;
    this.head = this.model.getObjectByName('head');
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of gltf.animations) {
      if (!CLIPS.includes(clip.name)) continue;
      const a = this.mixer.clipAction(clip);
      if (ONCE.has(clip.name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[clip.name] = a;
    }
    this.current = null; this.clip = null;
    this.onFinished = null;
    this.mixer.addEventListener('finished', (e) => { if (e.action === this.current && this.onFinished) this.onFinished(this.clip); });
    this.play('idle', 0);
  }
  has(name) { return !!this.actions[name]; }
  /** crossfade to a clip; returns false (and changes nothing) when this dragon has no such clip */
  play(name, fade = FADE) {
    const next = this.actions[name];
    if (!next) return false;
    if (next === this.current) { if (ONCE.has(name) && !next.isRunning()) next.reset().play(); return true; }
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, false);
    else if (this.current) this.current.stop();
    this.current = next; this.clip = name;
    return true;
  }
  /** playback speed of the current loop (walk / run follow the move speed so the feet do not slide much) */
  setRate(r) { if (this.current) this.current.setEffectiveTimeScale(r); }
  /** seconds one play of a clip takes at normal speed (0 when this dragon has no such clip) */
  clipLength(name) { return this.actions[name] ? this.actions[name].getClip().duration : 0; }
  get clipTime() { return this.current ? this.current.time : 0; }
  get clipDuration() { return this.clip ? this.clipLength(this.clip) : 0; }
  update(dt) { this.mixer.update(dt); }
}
