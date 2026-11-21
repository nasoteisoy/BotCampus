// Fire breath: a cone of flame from just in front of the GLB's mouth socket while fire_breath breathes,
// with smoke puffs, a few embers, a flickering warm light at the mouth, a tiny camera kick at the start
// and a short scorch where the flame meets the ground. Everything is pooled: fixed buffers, no per-frame allocation.
import * as THREE from 'three';
import { Particles } from './particles.js';
import { FlamePool } from './flame-particles.js';

const WINDOW = [0.42, 0.82];   // the breath part of fire_breath (fraction of its length): the clip rears up first, then breathes
const PITCH = [-0.45, 0.25];   // radians: breath follows the head pitch, kept between -26 and +14 degrees
const FLAME = { rate: 270, life: [0.4, 0.65], length: 1.5, width: 0.6, lead: 0.05 };  // length and width are x body size
const SMOKE = { rate: 22, life: [1.1, 1.7] };
const EMBER = { rate: 9, life: [0.9, 1.6] };
const LIGHT = { color: 0xff8a3a, peak: 3.2, distance: 3.2, fadeIn: 14, fadeOut: 10 };
const SHAKE = { amp: 0.03, time: 0.22 };
const SCORCH = { hold: 0.1, fade: 1.0 };   // seconds visible after the last flame touch, then fades out (gone by 1.1 s)

const _p = new THREE.Vector3(), _h = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _box = new THREE.Box3(), _size = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

/** turn the head-to-mouth line into a breath direction: its heading, with the pitch clamped */
function aim(d, yaw) {
  const flat = Math.hypot(d.x, d.z), len = d.length() || 1;
  const pitch = THREE.MathUtils.clamp(Math.asin(d.y / len), PITCH[0], PITCH[1]);
  const hx = flat > 0.3 * len ? d.x / flat : Math.sin(yaw), hz = flat > 0.3 * len ? d.z / flat : Math.cos(yaw);
  const c = Math.cos(pitch);
  return d.set(hx * c, Math.sin(pitch), hz * c);
}

/** body length (along its facing) and width of a dragon at rest, measured once from the skinned bounds */
function bodySize(dragon) {
  if (dragon.fireSize) return dragon.fireSize;
  const r = dragon.root, yaw = r.rotation.y;
  r.rotation.y = 0; r.updateMatrixWorld(true);
  _box.makeEmpty(); dragon.model.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); _box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  if (_box.isEmpty()) _box.setFromObject(dragon.model);
  r.rotation.y = yaw; r.updateMatrixWorld(true);
  _box.getSize(_size);
  return (dragon.fireSize = { length: _size.z, width: _size.x });
}

/** soft round decal texture from colour stops [offset, css colour] */
function discTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class FireFx {
  constructor(scene) {
    this.flame = new FlamePool(scene, 420);
    this.smoke = new Particles(scene, 90, false, 2.2);
    this.light = new THREE.PointLight(LIGHT.color, 0, LIGHT.distance, 2);   // always in the scene (no shader rebuilds), dark when idle
    scene.add(this.light);
    const disc = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);   // unit disc, scaled to the flame width per hit
    this.scorch = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ map: discTexture([[0, 'rgba(40,22,10,0.85)'], [0.55, 'rgba(70,40,15,0.45)'], [1, 'rgba(70,40,15,0)']]), transparent: true, depthWrite: false, opacity: 0 }));
    this.flash = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ map: discTexture([[0, 'rgba(255,150,60,1)'], [0.5, 'rgba(255,90,20,0.5)'], [1, 'rgba(255,60,10,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.scorch.renderOrder = 1; this.flash.renderOrder = 2;
    for (const m of [this.scorch, this.flash]) { m.visible = false; m.position.y = 0.012; scene.add(m); }
    this.acc = { flame: 0, smoke: 0, ember: 0 };
    this.breathing = false; this.lightK = 0; this.shakeT = 0; this.sinceHit = Infinity; this.flashK = 0; this.warm = 3;
    this.spawned = 0; this.last = null; this.stats = { flame: 0, smoke: 0, ember: 0, breathTime: 0 };
  }
  /** call once per frame after the dragon's mixer ran; emits only inside the breath window */
  emit(dt, dragon) {
    const on = !!dragon && dragon.clip === 'fire_breath' && !!dragon.socket && !!dragon.head &&
      dragon.clipTime / dragon.clipDuration >= WINDOW[0] && dragon.clipTime / dragon.clipDuration <= WINDOW[1];
    if (on && !this.breathing) { this.shakeT = SHAKE.time; this.stats = { flame: 0, smoke: 0, ember: 0, breathTime: 0 }; }
    this.breathing = on;
    if (!on) return;
    this.stats.breathTime += dt;
    const size = bodySize(dragon), len = FLAME.length * size.length, half = 0.5 * FLAME.width * size.width;
    dragon.root.updateMatrixWorld(true);
    dragon.socket.getWorldPosition(_p); dragon.head.getWorldPosition(_h);
    aim(_d.subVectors(_p, _h), dragon.root.rotation.y);
    _o.copy(_p).addScaledVector(_d, FLAME.lead);                       // flame starts just in front of the mouth
    _u.set(0, 1, 0).cross(_d).normalize(); _v.crossVectors(_d, _u);    // cone axes
    this.light.position.copy(_o).addScaledVector(_d, 0.25);
    this.scorch.scale.setScalar(half * 1.3); this.flash.scale.setScalar(half * 1.6);
    this.#flame(dt, len, half); this.#smoke(dt, len); this.#embers(dt, len);
    this.last = [_o.x, _o.y, _o.z];
  }
  #flame(dt, len, half) {
    this.acc.flame += FLAME.rate * dt;
    while (this.acc.flame >= 1) {
      this.acc.flame -= 1;
      const life = rnd(FLAME.life[0], FLAME.life[1]), speed = len / life * rnd(0.85, 1.1);
      const spread = half / len * Math.sqrt(Math.random()), ang = Math.random() * Math.PI * 2;  // even fill of the cone
      const sx = Math.cos(ang) * spread, sy = Math.sin(ang) * spread;
      const vx = (_d.x + _u.x * sx + _v.x * sy) * speed, vy = (_d.y + _u.y * sx + _v.y * sy) * speed, vz = (_d.z + _u.z * sx + _v.z * sy) * speed;
      const back = dt * Math.random();  // spread each frame's spawns along their first step, so slow frames leave no gap at the mouth
      const s1 = half * rnd(1.8, 2.6);   // sprites overlap into a solid cone; small at the mouth so the belly stays clear
      this.flame.emit(true, _o.x - vx * back, _o.y - vy * back, _o.z - vz * back, vx, vy, vz, life, rnd(0.08, 0.12), s1, 1, 1, 1, rnd(0.8, 1), 0, -0.5);
      this.spawned++; this.stats.flame++;
    }
  }
  #smoke(dt, len) {
    this.acc.smoke += SMOKE.rate * dt;
    while (this.acc.smoke >= 1) {
      this.acc.smoke -= 1;
      const k = len * rnd(0.6, 1), g = rnd(0.45, 0.58);
      this.smoke.spawn(_o.x + _d.x * k, _o.y + _d.y * k + 0.05, _o.z + _d.z * k, _d.x * 0.3 + rnd(-0.1, 0.1), rnd(0.25, 0.45), _d.z * 0.3 + rnd(-0.1, 0.1),
        rnd(SMOKE.life[0], SMOKE.life[1]), 0.3, rnd(0.8, 1.2), g, g, g + 0.02, 0.4, 0.9, -0.15);
      this.stats.smoke++;
    }
  }
  #embers(dt, len) {
    this.acc.ember += EMBER.rate * dt;
    while (this.acc.ember >= 1) {
      this.acc.ember -= 1;
      const k = len * rnd(0.3, 0.9);
      this.flame.emit(false, _o.x + _d.x * k, _o.y + _d.y * k, _o.z + _d.z * k, rnd(-0.3, 0.3) + _d.x * 0.4, rnd(0.3, 0.7), rnd(-0.3, 0.3) + _d.z * 0.4,
        rnd(EMBER.life[0], EMBER.life[1]), 0.025, 0.012, 1, rnd(0.45, 0.65), 0.12, 1, 0.6, -0.1);
      this.stats.ember++;
    }
  }
  update(dt) {
    this.flame.update(dt); this.smoke.update(dt);
    // light: eases in while breathing with a flicker, eases out after
    this.lightK += ((this.breathing ? 1 : 0) - this.lightK) * Math.min(1, dt * (this.breathing ? LIGHT.fadeIn : LIGHT.fadeOut));
    if (!this.breathing && this.lightK < 0.01) this.lightK = 0;
    const flicker = 0.75 + 0.25 * Math.sin(performance.now() * 0.031) * Math.sin(performance.now() * 0.017 + 1.3) + Math.random() * 0.15;
    this.light.intensity = LIGHT.peak * this.lightK * (this.lightK ? flicker : 0);
    // scorch + grass flash where flame particles touched the ground this frame
    const H = this.flame.hit;
    if (H.n >= 1) { this.scorch.position.set(H.x / H.n, 0.012, H.z / H.n); this.flash.position.copy(this.scorch.position); this.sinceHit = 0; this.flashK = rnd(0.6, 1); }
    else this.sinceHit += dt;
    const k = this.sinceHit <= SCORCH.hold ? 1 : Math.max(0, 1 - (this.sinceHit - SCORCH.hold) / SCORCH.fade);
    this.scorch.material.opacity = 0.75 * k; this.flash.material.opacity = 0.28 * this.flashK * Math.max(0, 1 - this.sinceHit / 0.35);
    this.scorch.visible = k > 0 || this.warm > 0; this.flash.visible = this.flash.material.opacity > 0 || this.warm > 0;
    if (this.warm > 0) this.warm--;   // first frames draw them at opacity 0 so their shaders compile at load, not mid-breath
  }
  /** offset for the camera this frame (call before render, undo after): a tiny kick that dies out */
  shake(out, dt) {
    const a = SHAKE.amp * (this.shakeT / SHAKE.time);
    this.shakeT = Math.max(0, this.shakeT - dt);
    return out.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).setLength(a);
  }
  clear() {
    this.flame.clear(); this.smoke.clear(); this.acc.flame = this.acc.smoke = this.acc.ember = 0;
    this.breathing = false; this.lightK = 0; this.light.intensity = 0; this.shakeT = 0; this.sinceHit = Infinity; this.update(0);
  }
}
