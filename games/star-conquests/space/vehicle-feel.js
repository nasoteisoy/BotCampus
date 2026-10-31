/**
 * STAR CONQUESTS — Vehicle Feel (fighters + capital ships)
 * Spec: qa/VEHICLE-FEEL-SPEC.md §§0,3,4. Free stack. Pure + testable.
 *
 * =====================================================================
 * battle.js WIRING HOOKS (small patch later — do NOT edit battle.js here)
 * =====================================================================
 * Once per scene:
 *   import { attachVehicleFeel, createFighterFeel, createCapitalFeel } from './vehicle-feel.js';
 *   const feelFX = attachVehicleFeel(scene);          // FX pool; call feelFX.update(dt, camera) each frame
 *
 * Per fighter craft after buildSpaceShip / mesh spawn:
 *   ship.feel = createFighterFeel(ship.mesh, { fx: feelFX, flames: mesh.userData.flames, muzzles: mesh.userData.muzzles });
 * Per capital after buildBattleShip:
 *   cap.feel  = createCapitalFeel(cap.mesh,  { fx: feelFX, flames: mesh.userData.flames, turrets: mesh.userData.turrets, L: mesh.userData.L });
 *
 * Each frame (after sim step, before render):
 *   ship.feel.update(dt, { yawRate, throttle, boost, climb, lateral, speedFrac, reduceMotion });
 *   cap.feel.update(dt,  { throttle, target: enemyPos|null, reduceMotion });
 *   feelFX.update(dt, camera);
 *
 * On lead/AI fire pulse:
 *   ship.feel.onFire(muzzleWorldDir);                 // gun recoil + muzzle flash
 *   // optional capital turret fire: cap.feel.onFire(dir, { turretIndex })
 *   // broadside: when >=3 turrets fire within 120ms, call cap.feel.onBroadside() (or onFire auto-detects)
 *
 * On damage applied to craft:
 *   ship.feel.onHit({ kind: 'shield'|'hull', point: worldVec3|null });
 *   cap.feel.onHit({ kind: 'shield'|'hull', point });
 *
 * On HP <= 0 (kill credit already awarded by sim):
 *   ship.feel.kill();   // starts 3.2s fighter death; hide/pool when ship.feel.isDone()
 *   cap.feel.kill();    // starts 7.5s capital cascade; pool when cap.feel.isDone()
 *
 * Camera trauma (optional): read feelFX.trauma / feelFX.consumeTrauma() for chase-cam shake.
 *
 * Clipping (capital breakup hull thirds):
 *   renderer.localClippingEnabled = true;   // REQUIRED for clipped wreck sections
 *   Prefer: attachVehicleFeel(scene, { renderer }) — enables it for you (additive opts).
 *   Or set it in battle.js when creating the WebGLRenderer. Without it, sections render whole.
 *   Demo-only additive: createCapitalFeel(mesh, { cpuClipBreakup: true }) also CPU-filters
 *   triangles so stills read on GL backends that ignore clippingPlanes (SwiftShader).
 * =====================================================================
 */
import * as THREE from './vendor/three.module.min.js';

/* ------------------------------------------------------------------ */
/* HQ primitives — forked from ship-harmony/games/trooper-custom/js/   */
/* demo-actions.js (sm, eOut, eIn, back, pulse, pulses, wobble, OUT_T) */
/* and demo-fx.js recipe numbers (muzzle/sparks/hitPuff/explosion/…).  */
/* Cross-tree import avoided; cite source, keep signatures/values.     */
/* ------------------------------------------------------------------ */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const TAU = Math.PI * 2;
/** smoothstep x²(3−2x) — demo-actions.js */
export const sm = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
/** ease-out cubic — demo-actions.js */
export const eOut = (x) => { x = clamp01(x); return 1 - (1 - x) ** 3; };
/** ease-in cubic — demo-actions.js */
export const eIn = (x) => { x = clamp01(x); return x * x * x; };
/** overshoot back easing c=1.7 — demo-actions.js */
export const back = (x) => { x = clamp01(x); const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
/** rise + exp decay envelope — demo-actions.js */
export const pulse = (t, at, rise = 0.03, decay = 0.14) => (t < at ? 0 : t < at + rise ? (t - at) / rise : Math.exp(-(t - at - rise) / decay));
export const pulses = (t, times, rise, decay) => times.reduce((s, x) => s + pulse(t, x, rise, decay), 0);
/** sin · exp decay rock — demo-actions.js */
export const wobble = (t, at, f = 9, d = 0.35) => (t < at ? 0 : Math.sin((t - at) * f * TAU / 2) * Math.exp(-(t - at) / d));
/** Death timing skeleton (trooper) — demo-actions.js; vehicle deaths use FEEL_* below */
export const OUT_T = Object.freeze({ flinch: 0.12, fall: 0.65, drop: 0.25, lie: 3.65, fade: 4.35, knock: 0.75 });

/** Tunable knobs — VEHICLE-FEEL-SPEC §6 */
export const FEEL = Object.freeze({
  TRAUMA_S: 0.05, TRAUMA_M: 0.35, TRAUMA_L: 0.75, TRAUMA_XL: 1.0,
  TRAUMA_DECAY: 1.2,
  RECOIL_K: 1.0,
  FLAME_MAX_FIGHTER: 3.0,
  FLAME_MAX_CAPITAL: 1.6,
  DEATH_FIGHTER_S: 3.2,
  DEATH_CAPITAL_S: 7.5,
  FIGHTER_BANK: 0.55,
  FIGHTER_BANK_EASE: 0.12,
  CAPITAL_BOB_Y: 0.5,
  CAPITAL_BOB_F: 0.6,
  CAPITAL_ROLL: 0.06,
  CORE_BLAST_T: 4.2,
  BREAKUP_T: 4.2,
});

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

function softTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [k, col] of stops) grd.addColorStop(k, col);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

function nodeTexFallback() {
  // Node / headless: 1x1 white DataTexture so sprites still construct
  const data = new Uint8Array([255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 1, 1); t.needsUpdate = true; return t;
}

function makeGlowTex() {
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      return softTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,240,200,.85)'], [1, 'rgba(255,200,120,0)']]);
    }
  } catch (_) { /* node */ }
  return nodeTexFallback();
}

/* ------------------------------------------------------------------ */
/* FeelFX — lightweight pool matching demo-fx.js recipe numbers        */
/* ------------------------------------------------------------------ */
export class FeelFX {
  constructor(scene) {
    this.scene = scene;
    this.t = 0;
    this.trauma = 0;
    this.hitStop = 0;
    this.sprites = [];
    this.free = [];
    this.solids = [];
    this.rings = [];
    this.lights = [];
    this.emitters = [];
    this.tex = { glow: makeGlowTex(), spark: makeGlowTex() };
    this.debrisMat = new THREE.MeshBasicMaterial({ color: 0x4a4e55 });
    this.debrisGeo = new THREE.BoxGeometry(0.12, 0.08, 0.18);
    this.ringGeo = new THREE.RingGeometry(0.97, 1, 48); // annulus width ~3% of radius
    this.ringGeo.rotateX(-Math.PI / 2);
    this.events = []; // {t, kind, ...} for tests / demo asserts
  }
  log(kind, extra = {}) { this.events.push({ t: this.t, kind, ...extra }); }
  addTrauma(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  consumeTrauma() { const x = this.trauma; return x * x; }
  hitStopMs(ms, scale = 0.05) { this.hitStop = Math.max(this.hitStop, ms / 1000); this._hsScale = scale; }

  _sprite(o) {
    let s = this.free.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    }
    s.material.map = this.tex[o.tex || 'glow'];
    s.material.color.setHex(o.color ?? 0xffd27a);
    s.material.opacity = o.a ?? 1;
    s.material.blending = o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending;
    s.position.copy(o.p);
    s.scale.setScalar(o.s0 ?? 0.3);
    s.visible = true;
    s.userData = { life: 0, max: o.life ?? 0.4, s0: o.s0 ?? 0.3, s1: o.s1 ?? 0.5, a: o.a ?? 1, v: o.v ? o.v.clone() : null, drag: o.drag ?? 0, g: o.g ?? 0, c1: o.c1 };
    this.scene.add(s);
    this.sprites.push(s);
    return s;
  }

  muzzle(p, dir, color = 0xffd27a, big = 1, hold = 0) {
    // demo-fx: glow 70ms (hold extends for readable stills); s0=0.35·big→0.5·big
    const life = 0.07 + hold;
    this._sprite({ p: p.clone(), tex: 'glow', add: true, color, life, s0: 0.35 * big, s1: 0.85 * big, a: 1 });
    this._sprite({ p: p.clone().addScaledVector(dir, 0.12 * big), tex: 'glow', add: true, color: 0xffffff, life: 0.05 + hold * 0.6, s0: 0.18 * big, s1: 0.45 * big, a: 1 });
    for (let i = 0; i < 2 + Math.floor(big); i++) {
      this._sprite({
        p: p.clone(),
        color: 0xb9c0c8,
        life: 0.7 + Math.random() * 0.4,
        s0: 0.08 * big, s1: 0.45 * big, a: 0.45, drag: 3, g: -0.4,
        v: dir.clone().multiplyScalar(0.8 + Math.random()).add(this._rv(0.2, 0.25, 0.2)),
      });
    }
    this.light(p, color, 5 * big, 0.07 + hold * 0.5);
    this.log('muzzle', { big, color });
  }

  /** Visible bolt streak flying from a→ along dir (for broadside stills). */
  boltStreak(a, dir, color = 0xffd84a, len = 4, life = 0.55, width = 0.12) {
    const geo = new THREE.CylinderGeometry(width, width * 0.5, len, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    const d = dir.clone().normalize();
    m.position.copy(a).addScaledVector(d, len * 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    this.scene.add(m);
    const tip = this._sprite({ p: a.clone().addScaledVector(d, len), tex: 'glow', add: true, color: 0xffffff, life, s0: 0.35, s1: 0.15, a: 1 });
    this.solids.push({
      m, v: d.clone().multiplyScalar(28), w: new THREE.Vector3(0, 0, 0), life: 0, max: life, bounce: 0,
      _bolt: true,
    });
    this.log('bolt', { len });
  }

  sparks(p, n = 10, color = 0xffd27a, speed = 3, life = 0.35) {
    for (let i = 0; i < n; i++) {
      this._sprite({
        p: p.clone(), tex: 'spark', add: true, color,
        v: this._rv(1, 1, 1).normalize().multiplyScalar(speed * (0.4 + Math.random())).add(new THREE.Vector3(0, 1, 0)),
        life: life * (0.6 + Math.random() * 0.8), s0: 0.07, s1: 0.02, a: 1, g: 6, drag: 1,
      });
    }
    this.log('sparks', { n, color });
  }

  smoke(p, n = 6, size = 1, color = 0x9aa1a8, rise = 0.6, spread = 0.4, life = 2.2) {
    for (let i = 0; i < n; i++) {
      this._sprite({
        p: p.clone().add(this._rv(spread * 0.4, 0.1, spread * 0.4)),
        v: this._rv(spread, 0.1, spread).add(new THREE.Vector3(0, rise, 0)),
        color, life: life * (0.7 + Math.random() * 0.6), s0: 0.25 * size, s1: 1.2 * size, a: 0.7, drag: 1.2, g: -0.1, add: false,
      });
    }
    this.log('smoke', { n });
  }

  hitPuff(p, n = 1) {
    this.sparks(p, 8 * n, 0xffe2a0, 2.6);
    this.smoke(p, 3 * n, 0.45, 0xb8bec6, 0.5, 0.5, 1.2);
    this._sprite({ p: p.clone(), tex: 'glow', add: true, color: 0xfff0c0, life: 0.1, s0: 0.3, s1: 0.5, a: 1 });
    this.log('hitPuff', { n });
  }

  explosion(p, size = 1, color = 0xffb040) {
    // Warm white → yellow → orange core (no green tint)
    this._sprite({ p: p.clone().add(new THREE.Vector3(0, 0.2 * size, 0)), tex: 'glow', add: true, color: 0xfff6d8, life: 0.28, s0: 1.5 * size, s1: 3.0 * size, a: 1 });
    this._sprite({ p: p.clone(), tex: 'glow', add: true, color: 0xffe08a, life: 0.45, s0: 1.1 * size, s1: 2.4 * size, a: 0.95 });
    for (let i = 0; i < 8; i++) {
      const warm = (i % 2 === 0) ? 0xffc050 : 0xff9020;
      this._sprite({
        p: p.clone().add(this._rv(0.3, 0.2, 0.3).multiplyScalar(size)),
        tex: 'glow', add: true, color: warm, c1: 0x802010,
        v: this._rv(2, 1, 2).add(new THREE.Vector3(0, 1.8, 0)).multiplyScalar(size),
        life: 0.75 + Math.random() * 0.45, s0: 0.9 * size, s1: 1.8 * size, a: 0.95, drag: 2.2,
      });
    }
    this.smoke(p.clone().add(new THREE.Vector3(0, 0.3 * size, 0)), 6, 1.0 * size, 0x5a5550, 1.0 * size, 1.3 * size, 2.2);
    this.sparks(p, 16, 0xffd080, 6 * size, 0.6);
    if (size < 3.5) this.ring(p, 0xffd28a, Math.min(2.2 * size, 6), 0.35); // skip fat rings on capital-scale blasts
    this.light(p.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffb040, 12 * size, 0.3, 10 * size);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.debrisGeo, this.debrisMat.clone());
      m.scale.setScalar(0.5 + Math.random() * 0.6);
      const v = this._rv(2.5, 0, 2.5).add(new THREE.Vector3(0, 3 + Math.random() * 2, 0)).multiplyScalar(size);
      this.scene.add(m); m.position.copy(p).add(new THREE.Vector3(0, 0.2, 0));
      this.solids.push({ m, v, w: this._rv(10, 10, 10), life: 0, max: 2, bounce: 0.3 });
    }
    this.log('explosion', { size, color });
  }

  ring(p, color, R = 2, life = 0.45) {
    // Shockwave: additive thin annulus, fades fast (cap <0.6s). Never a solid disc.
    const maxLife = Math.min(0.55, Math.max(0.2, life));
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.set(p.x, p.y, p.z);
    m.scale.set(0.01, 1, 0.01);
    this.scene.add(m);
    this.rings.push({ m, life: 0, max: maxLife, R: Math.max(0.5, R), a0: 0.45 });
    this.log('ring', { R, life: maxLife });
  }

  /** Drop every live shockwave ring (call at breakup so stills stay clean). */
  clearRings() {
    for (const o of this.rings) {
      this.scene.remove(o.m);
      if (o.m.material) o.m.material.dispose();
    }
    this.rings = [];
  }

  light(p, color, intensity, life, dist = 8) {
    const l = new THREE.PointLight(color, intensity, dist);
    l.position.copy(p);
    this.scene.add(l);
    this.lights.push({ l, life: 0, max: life, I0: intensity });
  }

  emit(fn, rate, life = Infinity, tag = '') {
    const e = { fn, rate, acc: 0, life: 0, max: life, tag };
    this.emitters.push(e);
    return e;
  }
  stop(tag) { this.emitters = this.emitters.filter((e) => e.tag !== tag); }

  _rv(x, y, z) {
    return new THREE.Vector3((Math.random() * 2 - 1) * x, (Math.random() * 2 - 1) * y, (Math.random() * 2 - 1) * z);
  }

  update(dt) {
    if (this.hitStop > 0) {
      const used = Math.min(dt, this.hitStop);
      this.hitStop -= used;
      dt = Math.max(0, dt - used) + used * (this._hsScale || 0.05);
    }
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - FEEL.TRAUMA_DECAY * dt);

    for (const e of this.emitters) {
      e.life += dt; e.acc += dt * e.rate;
      while (e.acc >= 1) { e.acc -= 1; e.fn(); }
    }
    this.emitters = this.emitters.filter((e) => e.life < e.max);

    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i], u = s.userData;
      u.life += dt;
      if (u.life >= u.max) {
        s.visible = false; this.scene.remove(s); this.sprites.splice(i, 1); this.free.push(s); continue;
      }
      const k = u.life / u.max;
      if (u.v) {
        if (u.g) u.v.y -= u.g * dt;
        if (u.drag) u.v.multiplyScalar(Math.max(0, 1 - u.drag * dt));
        s.position.addScaledVector(u.v, dt);
      }
      const sc = u.s0 + (u.s1 - u.s0) * k;
      s.scale.setScalar(sc);
      s.material.opacity = u.a * (1 - k);
    }
    for (let i = this.solids.length - 1; i >= 0; i--) {
      const o = this.solids[i];
      o.life += dt;
      if (o.life >= o.max) { this.scene.remove(o.m); this.solids.splice(i, 1); continue; }
      if (!o._bolt) o.v.y -= 6 * dt;
      o.m.position.addScaledVector(o.v, dt);
      o.m.rotation.x += (o.w?.x || 0) * dt; o.m.rotation.y += (o.w?.y || 0) * dt; o.m.rotation.z += (o.w?.z || 0) * dt;
      const fade = 1 - o.life / o.max;
      if (o.m.material && o.m.material.opacity != null) { o.m.material.transparent = true; o.m.material.opacity = fade; }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const o = this.rings[i]; o.life += dt; const k = o.life / o.max;
      if (k >= 1) { this.scene.remove(o.m); o.m.material.dispose(); this.rings.splice(i, 1); continue; }
      const r = o.R * eOut(k); o.m.scale.set(r, 1, r); o.m.material.opacity = (o.a0 != null ? o.a0 : 0.45) * (1 - k);
    }
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const o = this.lights[i]; o.life += dt;
      if (o.life >= o.max) { this.scene.remove(o.l); this.lights.splice(i, 1); continue; }
      o.l.intensity = o.I0 * (1 - o.life / o.max);
    }
  }

  clear() {
    for (const s of this.sprites) { s.visible = false; this.scene.remove(s); this.free.push(s); }
    this.sprites = [];
    for (const o of this.solids) this.scene.remove(o.m);
    for (const o of this.rings) { this.scene.remove(o.m); o.m.material.dispose(); }
    for (const o of this.lights) this.scene.remove(o.l);
    this.solids = []; this.rings = []; this.lights = []; this.emitters = [];
  }
}

/**
 * Attach FX pool to a scene (one per battle/demo).
 * Additive opts only (do not break existing attachVehicleFeel(scene) callers):
 *   opts.renderer | opts.gl — if passed, sets renderer.localClippingEnabled = true
 *     so capital breakup clipped hull clones render correctly.
 */
export function attachVehicleFeel(scene, opts = {}) {
  const fx = new FeelFX(scene);
  const renderer = (opts && (opts.renderer || opts.gl)) || null;
  if (renderer) {
    // Capital breakup uses material.clippingPlanes on cloned hull thirds.
    renderer.localClippingEnabled = true;
  }
  fx.renderer = renderer;
  return fx;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */
function ensureFeelRoot(obj3d) {
  let fr = obj3d.getObjectByName && obj3d.getObjectByName('feelRoot');
  if (fr) return fr;
  fr = new THREE.Group();
  fr.name = 'feelRoot';
  // Reparent existing children under feelRoot so sim root stays authoritative
  const kids = obj3d.children.slice();
  for (const c of kids) fr.add(c);
  obj3d.add(fr);
  return fr;
}

function finite(...nums) {
  for (const n of nums) if (!Number.isFinite(n)) return false;
  return true;
}

/** Remove shield / non-hull visuals from a cloned capital feelRoot. */
function stripShieldFromClone(root) {
  const kill = [];
  root.traverse((ch) => {
    if (ch === root) return;
    const n = (ch.name || '').toLowerCase();
    const slot = ch.userData && ch.userData.slot;
    if (n.includes('shield') || slot === 'shield') kill.push(ch);
    else if (ch.isMesh && ch.material && ch.material.uniforms &&
      (ch.material.uniforms.uOp || ch.material.uniforms.uFlash || ch.material.uniforms.uC)) {
      kill.push(ch);
    }
  });
  for (const ch of kill) { if (ch.parent) ch.parent.remove(ch); }
}

/**
 * CPU-side clip of a BufferGeometry to root-local X range [xMin, xMax] (inclusive).
 * Drops triangles whose centroid (in section-root local space via meshMatrix) falls outside.
 * Returns a NEW non-indexed geometry (caller owns/disposes). Used so breakup reads even when
 * the GL backend ignores material.clippingPlanes (e.g. some SwiftShader paths); GPU planes
 * stay on the material for real WebGL in battle.js.
 */
function cpuClipGeometryToXRange(srcGeo, meshMatrix, xMin, xMax, cutXs = []) {
  const g = srcGeo.index ? srcGeo.toNonIndexed() : srcGeo.clone();
  const pos = g.attributes.position;
  if (!pos) return g;
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  const keep = [];
  const nTri = (pos.count / 3) | 0;
  const pad = 1e-3;
  // Wide band + low |nx| threshold so end-caps / bulkheads never read as red planks
  const band = Math.max(0.12, (xMax - xMin) * 0.18);
  for (let t = 0; t < nTri; t++) {
    const i0 = t * 3, i1 = i0 + 1, i2 = i0 + 2;
    v0.fromBufferAttribute(pos, i0).applyMatrix4(meshMatrix);
    v1.fromBufferAttribute(pos, i1).applyMatrix4(meshMatrix);
    v2.fromBufferAttribute(pos, i2).applyMatrix4(meshMatrix);
    const x0 = v0.x, x1 = v1.x, x2 = v2.x;
    // Keep only tris fully inside the third
    if (!(x0 >= xMin - pad && x0 <= xMax + pad
      && x1 >= xMin - pad && x1 <= xMax + pad
      && x2 >= xMin - pad && x2 <= xMax + pad)) continue;
    // Drop X-facing faces ONLY near a cut. Dropping ALL of them turns in-section
    // boxes into open tubes that read as flat grey diamond slabs beside the wreck.
    e1.subVectors(v1, v0); e2.subVectors(v2, v0);
    nrm.crossVectors(e1, e2);
    const nl = nrm.length() || 1;
    const nxx = Math.abs(nrm.x / nl);
    if (nxx > 0.35 && cutXs && cutXs.length) {
      const cx = (x0 + x1 + x2) / 3;
      const nearCut = cutXs.some((cut) => Math.abs(cx - cut) < band);
      if (nearCut) continue;
    }
    keep.push(i0, i1, i2);
  }
  if (keep.length === 0) {
    const empty = new THREE.BufferGeometry();
    empty.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), 3));
    empty.userData._feelOwnedGeo = true;
    if (g !== srcGeo) g.dispose();
    return empty;
  }
  const outCount = keep.length;
  const outPos = new Float32Array(outCount * 3);
  const srcArr = pos.array;
  const item = pos.itemSize || 3;
  for (let i = 0; i < outCount; i++) {
    const si = keep[i] * item;
    const di = i * 3;
    outPos[di] = srcArr[si]; outPos[di + 1] = srcArr[si + 1]; outPos[di + 2] = srcArr[si + 2];
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  if (g.attributes.normal) {
    const nArr = g.attributes.normal.array;
    const outN = new Float32Array(outCount * 3);
    const nItem = g.attributes.normal.itemSize || 3;
    for (let i = 0; i < outCount; i++) {
      const si = keep[i] * nItem;
      const di = i * 3;
      outN[di] = nArr[si]; outN[di + 1] = nArr[si + 1]; outN[di + 2] = nArr[si + 2];
    }
    out.setAttribute('normal', new THREE.BufferAttribute(outN, 3));
  } else {
    out.computeVertexNormals();
  }
  if (g.attributes.uv) {
    const uArr = g.attributes.uv.array;
    const outU = new Float32Array(outCount * 2);
    for (let i = 0; i < outCount; i++) {
      const si = keep[i] * 2;
      const di = i * 2;
      outU[di] = uArr[si]; outU[di + 1] = uArr[si + 1];
    }
    out.setAttribute('uv', new THREE.BufferAttribute(outU, 2));
  }
  out.userData._feelOwnedGeo = true;
  if (g !== srcGeo) g.dispose();
  return out;
}

/** Battle path: drop only cut-facing end caps (shared geo otherwise). Returns new geo or null. */
function stripCutFacingCaps(srcGeo, meshMatrix, cutXs, band) {
  if (!cutXs || !cutXs.length) return null;
  const g = srcGeo.index ? srcGeo.toNonIndexed() : srcGeo.clone();
  const pos = g.attributes.position;
  if (!pos) { if (g !== srcGeo) g.dispose(); return null; }
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  const keep = [];
  let dropped = 0;
  const nTri = (pos.count / 3) | 0;
  for (let t = 0; t < nTri; t++) {
    const i0 = t * 3, i1 = i0 + 1, i2 = i0 + 2;
    v0.fromBufferAttribute(pos, i0).applyMatrix4(meshMatrix);
    v1.fromBufferAttribute(pos, i1).applyMatrix4(meshMatrix);
    v2.fromBufferAttribute(pos, i2).applyMatrix4(meshMatrix);
    const cx = (v0.x + v1.x + v2.x) / 3;
    e1.subVectors(v1, v0); e2.subVectors(v2, v0);
    nrm.crossVectors(e1, e2);
    const nl = nrm.length() || 1;
    const nxx = Math.abs(nrm.x / nl);
    let nearCut = false;
    for (const c of cutXs) if (Math.abs(cx - c) < band) { nearCut = true; break; }
    if (nearCut && nxx > 0.35) { dropped++; continue; }
    keep.push(i0, i1, i2);
  }
  if (!dropped) {
    if (g !== srcGeo) g.dispose();
    return null; // keep sharing source geometry
  }
  // rebuild like cpu clip
  const outCount = keep.length;
  if (!outCount) { if (g !== srcGeo) g.dispose(); return null; }
  const outPos = new Float32Array(outCount * 3);
  const srcArr = pos.array;
  const item = pos.itemSize || 3;
  for (let i = 0; i < outCount; i++) {
    const si = keep[i] * item, di = i * 3;
    outPos[di] = srcArr[si]; outPos[di + 1] = srcArr[si + 1]; outPos[di + 2] = srcArr[si + 2];
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  out.computeVertexNormals();
  out.userData._feelOwnedGeo = true;
  if (g !== srcGeo) g.dispose();
  return out;
}

/**
 * Clone capital visual 3× with per-section local clipping planes (thirds along +X).
 * Materials are cloned (not shared); geometries stay shared with the source.
 * Requires renderer.localClippingEnabled = true (see file header / attachVehicleFeel).
 * Returns { sections, clonedMats }.
 */
/** Scorch → cool gunmetal grey (~RGB 55–70). Embers live on cut FX, not hull wash. */
function scorchClonedMat(c) {
  if (!c || !c.color) return;
  // Cool gunmetal target (not maroon): ~0x586270 → RGB 88,98,112 before lights ≈ 50–75 on screen
  c.color.setHex(0x5a6572);
  if (c.emissive) {
    c.emissive.setHex(0x000000);
    c.emissiveIntensity = 0;
  }
}

/** Lit Lambert for battle + demo — smooth shading so bow isn't a flat triangle. */
function makeScorchedLambert(srcMat, meshPlanes, cpuClip) {
  const c = new THREE.MeshLambertMaterial({
    color: new THREE.Color(0x5a6572),
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
    transparent: !!(srcMat && srcMat.transparent),
    opacity: (srcMat && srcMat.opacity != null) ? srcMat.opacity : 1,
    side: THREE.FrontSide,
    flatShading: false,
  });
  if (!cpuClip && meshPlanes && meshPlanes.length) {
    c.clippingPlanes = meshPlanes.map((p) => p.clone());
    c.clipShadows = true;
  } else {
    c.clippingPlanes = [];
  }
  scorchClonedMat(c);
  c.needsUpdate = true;
  c.userData = Object.assign({}, (srcMat && srcMat.userData) || {}, { _feelCloned: true });
  return c;
}


/** Flat protruding panels from ships3d (rails/deck/spine/keel/fins/wings). */
const THIN_PANEL_NAME_RE = /rail|deck|spine|keel|fin|wing|plate|stripe|trim|antenna|mast|bay|nose|wedge/i;
function isThinPanelMesh(ch) {
  if (!ch || !ch.isMesh || !ch.geometry) return false;
  if (ch.userData && ch.userData._feelCutFx) return false;
  if (ch.userData && ch.userData._feelOwnedGeo && ch.geometry && ch.geometry.type === 'SphereGeometry') return false;
  const nm = (ch.name || '') + ' ' + ((ch.userData && ch.userData.part) || '');
  if (THIN_PANEL_NAME_RE.test(nm)) return true;
  // Capital nose wedge: CylinderGeometry with ≤4 radial segments reads as a flat grey diamond slab
  const gp = ch.geometry.parameters;
  if (ch.geometry.type === 'CylinderGeometry' && gp && (gp.radialSegments | 0) > 0 && (gp.radialSegments | 0) <= 4) {
    return true;
  }
  if (ch.geometry.type === 'ConeGeometry' && gp && (gp.radialSegments | 0) > 0 && (gp.radialSegments | 0) <= 4) {
    return true;
  }
  // Local geo thinness
  if (!ch.geometry.boundingBox) ch.geometry.computeBoundingBox();
  const bb = ch.geometry.boundingBox;
  if (!bb) return false;
  const sx = Math.abs(bb.max.x - bb.min.x);
  const sy = Math.abs(bb.max.y - bb.min.y);
  const sz = Math.abs(bb.max.z - bb.min.z);
  const maxE = Math.max(sx, sy, sz);
  const minE = Math.min(sx, sy, sz);
  if (maxE < 1e-8) return true;
  if ((minE / maxE) < 0.06) return true;
  // Long flat strips just above 6% (wing plates ~0.07–0.09) — still hide
  if (minE < 0.18 && maxE > minE * 10) return true;
  // World AABB thinness (capital non-uniform scale can change visual wafers)
  try {
    ch.updateWorldMatrix(true, false);
    const wb = new THREE.Box3().setFromObject(ch);
    const ws = new THREE.Vector3();
    wb.getSize(ws);
    const wMax = Math.max(ws.x, ws.y, ws.z);
    const wMin = Math.min(ws.x, ws.y, ws.z);
    if (wMax > 1e-6 && (wMin / wMax) < 0.06) return true;
  } catch (_) { /* ignore */ }
  return false;
}

function spawnClippedHullSections(feelRoot, worldL, parent, fx, cpuClip = false) {
  const sections = [];
  const clonedMats = [];
  const nSec = 3;

  // Measure source local AABB along X (builder units) for equal thirds
  // Probe clone at identity so Box3 is in feelRoot-local (builder) units
  const probe = feelRoot.clone(true);
  stripShieldFromClone(probe);
  probe.position.set(0, 0, 0);
  probe.rotation.set(0, 0, 0);
  probe.scale.set(1, 1, 1);
  probe.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(probe);
  // dispose probe hierarchy references only (shared geos — do not dispose)
  probe.traverse(() => {});
  const minX = Number.isFinite(box.min.x) ? box.min.x : -worldL * 0.05;
  const maxX = Number.isFinite(box.max.x) ? box.max.x : worldL * 0.05;
  const span = Math.max(0.01, maxX - minX);
  const a = minX + span / 3; // aft|mid cut
  const b = minX + (2 * span) / 3; // mid|bow cut
  const midY = (box.min.y + box.max.y) * 0.5;
  const midZ = (box.min.z + box.max.z) * 0.5;
  const cutH = Math.max(0.22, Math.min(1.2, (box.max.y - box.min.y) * 0.35));
  const cutW = Math.max(0.25, Math.min(1.4, (box.max.z - box.min.z) * 0.4));

  // World pose of the live feelRoot (includes capital scale/yaw)
  feelRoot.updateWorldMatrix(true, true);
  const wPos = new THREE.Vector3();
  const wQuat = new THREE.Quaternion();
  const wScale = new THREE.Vector3();
  feelRoot.matrixWorld.decompose(wPos, wQuat, wScale);

  // Plane helpers in feelRoot-local space. Three.js discards where normal·p + constant > 0.
  function planesForSection(i) {
    if (i === 0) {
      // aft third: keep x <= a
      return [new THREE.Plane(new THREE.Vector3(1, 0, 0), -a)];
    }
    if (i === 1) {
      // mid: keep a <= x <= b
      return [
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), a),
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -b),
      ];
    }
    // bow: keep x >= b
    return [new THREE.Plane(new THREE.Vector3(-1, 0, 0), b)];
  }

  function applyClippedMats(root, rootPlanes, xMin, xMax, cutXs) {
    root.updateMatrixWorld(true);
    root.traverse((ch) => {
      if (!ch.isMesh || !ch.material || !ch.geometry) return;
      // Drop ships3d flat panels (rails/deck/spine/keel/fins) — they stick out as grey planks in battle
      if (isThinPanelMesh(ch)) {
        ch.visible = false;
        ch.userData._feelHiddenPanel = true;
        return;
      }
      // Convert root-local planes into this mesh's local space (localClippingEnabled)
      const toMesh = new THREE.Matrix4().copy(ch.matrixWorld).invert();
      const meshPlanes = rootPlanes.map((p) => {
        const cp = p.clone();
        cp.applyMatrix4(toMesh);
        return cp;
      });
      const srcMats = Array.isArray(ch.material) ? ch.material : [ch.material];
      // Drop neon glow strips only (green bay, cyan glass, bright yellow ticks) — not hull MeshBasic
      const src0 = srcMats[0];
      if (src0 && src0.isMeshBasicMaterial && src0.color) {
        const col = src0.color;
        const isNeon = (col.g > col.r + 0.08 && col.g > col.b + 0.08) // green edge
          || (col.b > 0.55 && col.g > 0.55 && col.r < 0.55) // cyan glass
          || (col.r > 0.75 && col.g > 0.55 && col.b < 0.4); // bright yellow tick
        let maxE = 1;
        if (ch.geometry) {
          ch.geometry.computeBoundingBox();
          const bb0 = ch.geometry.boundingBox;
          if (bb0) {
            const sx0 = bb0.max.x - bb0.min.x, sy0 = bb0.max.y - bb0.min.y, sz0 = bb0.max.z - bb0.min.z;
            maxE = Math.max(sx0, sy0, sz0);
          }
        }
        // neon OR tiny bright Basic accent (not large hull panels)
        if (isNeon || (maxE < 0.45 && (col.r + col.g + col.b) > 1.6)) {
          ch.visible = false;
          return;
        }
      }
      const out = srcMats.map((m) => {
        const c = makeScorchedLambert(m, meshPlanes, cpuClip);
        clonedMats.push(c);
        return c;
      });
      ch.material = Array.isArray(ch.material) ? out : out[0];
      // Optional CPU clip (additive): demo/capture when GL ignores/breaks on clippingPlanes.
      // Default OFF so sections share source geometry (battle.js / unit tests).
      {
        const meshMatrix = ch.matrixWorld.clone(); // root at identity ⇒ root-local
        if (cpuClip) {
          const clipped = cpuClipGeometryToXRange(ch.geometry, meshMatrix, xMin, xMax, cutXs || []);
          clipped.computeVertexNormals();
          ch.geometry = clipped;
          ch.userData._feelOwnedGeo = true;
          const pc = clipped.getAttribute('position');
          // Hide empty / plane-like leftovers (≤4 verts, thin wafer, or coplanar shell)
          if (!pc || pc.count <= 4) {
            ch.visible = false;
          } else {
            clipped.computeBoundingBox();
            const bbC = clipped.boundingBox;
            if (bbC) {
              const cx = Math.abs(bbC.max.x - bbC.min.x);
              const cy = Math.abs(bbC.max.y - bbC.min.y);
              const cz = Math.abs(bbC.max.z - bbC.min.z);
              const cMax = Math.max(cx, cy, cz) || 1;
              const cMin = Math.min(cx, cy, cz);
              // <0.06 = plane-like (suite); <0.20 = cut-face wafer that still reads as a flat grey slab
              if ((cMin / cMax) < 0.20) ch.visible = false;
            }
            // Coplanar shell: every triangle normal within ~25° of the mean → flat slab
            if (ch.visible !== false) {
              const nTri = (pc.count / 3) | 0;
              if (nTri >= 1 && nTri <= 12) {
                const a = pc.array;
                const mean = new THREE.Vector3();
                const tmpN = new THREE.Vector3();
                const t0 = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
                let ok = 0;
                for (let ti = 0; ti < nTri; ti++) {
                  const b = ti * 9;
                  t0.set(a[b], a[b + 1], a[b + 2]);
                  t1.set(a[b + 3], a[b + 4], a[b + 5]);
                  t2.set(a[b + 6], a[b + 7], a[b + 8]);
                  tmpN.crossVectors(t1.clone().sub(t0), t2.clone().sub(t0));
                  if (tmpN.lengthSq() < 1e-12) continue;
                  tmpN.normalize();
                  mean.add(tmpN);
                  ok++;
                }
                if (ok >= 2) {
                  mean.normalize();
                  let allNear = true;
                  for (let ti = 0; ti < nTri; ti++) {
                    const b = ti * 9;
                    t0.set(a[b], a[b + 1], a[b + 2]);
                    t1.set(a[b + 3], a[b + 4], a[b + 5]);
                    t2.set(a[b + 6], a[b + 7], a[b + 8]);
                    tmpN.crossVectors(t1.clone().sub(t0), t2.clone().sub(t0));
                    if (tmpN.lengthSq() < 1e-12) continue;
                    tmpN.normalize();
                    if (Math.abs(tmpN.dot(mean)) < 0.9) { allNear = false; break; }
                  }
                  if (allNear) ch.visible = false;
                }
              }
            }
          }
        } else {
          // Battle: keep shared geos when possible; strip only cut-facing end caps (red planks)
          const band = Math.max(0.12, ((xMax - xMin) || 1) * 0.18);
          const stripped = stripCutFacingCaps(ch.geometry, meshMatrix, cutXs || [], band);
          if (stripped) {
            ch.geometry = stripped;
            ch.userData._feelOwnedGeo = true;
          }
        }
        // Near a cut: hide YZ wafers (bulkhead planks) and charcoal the wound
        if (ch.visible !== false && cutXs && cutXs.length) {
          ch.geometry.computeBoundingBox();
          const bb = ch.geometry.boundingBox;
          if (bb) {
            const c0 = bb.min.clone().add(bb.max).multiplyScalar(0.5).applyMatrix4(meshMatrix);
            const touch = cutXs.some((cx) => Math.abs(c0.x - cx) < Math.max(0.2, (xMax - xMin) * 0.22));
            if (touch) {
              const sx = bb.max.x - bb.min.x;
              const sy = bb.max.y - bb.min.y;
              const sz = bb.max.z - bb.min.z;
              const maxYZ = Math.max(sy, sz);
              if (maxYZ > 1e-4 && sx < maxYZ * 0.22) {
                ch.visible = false; // bulkhead wafer / thin cut remnant at the cut
              } else {
                const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
                for (const mm of mats) {
                  if (mm.color) mm.color.setHex(0x3a424c); // darker gunmetal at the wound
                  if (mm.emissive) {
                    mm.emissive.setHex(0xff5010);
                    mm.emissiveIntensity = 0.18;
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  function addCutFx(sec, cutXs) {
    // Thin orange-hot seam along cut perimeter — small spheres only (never a plank/slab)
    const nSeam = 10;
    for (const cx of cutXs) {
      for (let e = 0; e < nSeam; e++) {
        const t = e / nSeam;
        const ang = t * Math.PI * 2;
        const fireMat = new THREE.MeshBasicMaterial({
          color: (e % 3 === 0) ? 0xffcc66 : 0xff5010,
          transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        fireMat.userData._feelCloned = true;
        clonedMats.push(fireMat);
        const r = Math.max(0.02, span * 0.0045);
        const fire = new THREE.Mesh(new THREE.SphereGeometry(r, 5, 5), fireMat);
        fire.userData._feelOwnedGeo = true;
        fire.userData._feelCutFx = true;
        fire.position.set(
          cx,
          midY + Math.sin(ang) * cutH * 0.55,
          midZ + Math.cos(ang) * cutW * 0.55,
        );
        sec.add(fire);
      }
    }
  }

  for (let i = 0; i < nSec; i++) {
    const sec = feelRoot.clone(true);
    sec.name = 'wreckSection' + i;
    stripShieldFromClone(sec);
    // Bake clipping at identity so mesh-local planes match builder space
    sec.position.set(0, 0, 0);
    sec.rotation.set(0, 0, 0);
    sec.scale.set(1, 1, 1);
    sec.updateMatrixWorld(true);
    const xMin = i === 0 ? minX - 0.05 : i === 1 ? a : b;
    const xMax = i === 0 ? a : i === 1 ? b : maxX + 0.05;
    const cutXs = i === 0 ? [a] : i === 2 ? [b] : [a, b];
    applyClippedMats(sec, planesForSection(i), xMin, xMax, cutXs);
    addCutFx(sec, cutXs);

    // Place at live ship pose, then separate along hull axis
    sec.position.copy(wPos);
    sec.quaternion.copy(wQuat);
    sec.scale.copy(wScale);
    sec.visible = true;
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(wQuat);
    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(wQuat);
    const sep = (i - 1) * worldL * 0.11; // gaps; each piece ≤~25% at fill 0.70
    sec.position.addScaledVector(axis, sep);
    sec.position.y += worldL * 0.01 * (i - 1) * 0.3;
    sec.position.addScaledVector(side, (i - 1) * worldL * 0.02);
    sec.userData.vel = axis.clone().multiplyScalar((i - 1) * worldL * 0.02)
      .add(new THREE.Vector3(0, worldL * 0.012 + Math.random() * worldL * 0.004, 0))
      .add(side.clone().multiplyScalar((i - 1) * worldL * 0.008));
    sec.userData.spin = new THREE.Vector3(
      0.12 + Math.random() * 0.1,
      0.18 + Math.random() * 0.12,
      0.1 + Math.random() * 0.08,
    );
    sec.userData.clonedMats = clonedMats;
    if (parent) parent.add(sec);
    sections.push(sec);
    if (fx) {
      // No shockwave rings here — breakup still must stay clean
      fx.sparks(sec.position.clone(), 18, 0xff8020, 6, 0.7);
      fx._sprite({ p: sec.position.clone(), tex: 'glow', add: true, color: 0xffb040, life: 0.9, s0: worldL * 0.03, s1: worldL * 0.06, a: 0.9 });
      fx.smoke(sec.position.clone(), 4, Math.max(1.2, worldL * 0.025), 0x3a3a40, 0.9, 0.5, 2.2);
      for (let d = 0; d < 4; d++) {
        const m = new THREE.Mesh(fx.debrisGeo, fx.debrisMat.clone());
        m.scale.setScalar(0.9 + Math.random());
        const v = fx._rv(worldL * 0.05, worldL * 0.025, worldL * 0.05); v.y = Math.abs(v.y) + worldL * 0.008;
        fx.scene.add(m); m.position.copy(sec.position);
        fx.solids.push({ m, v, w: fx._rv(6, 6, 6), life: 0, max: 2.8, bounce: 0.1 });
      }
    }
  }

  // drop probe (no dispose of shared geos/mats)
  probe.traverse((ch) => {
    if (ch.isMesh && ch.material) {
      // probe materials are shared with source — do not dispose
    }
  });

  // Battle + demo: key + rim so gunmetal hulls silhouette (not demo-only)
  const wreckLights = [];
  if (parent && sections.length) {
    const mid = sections[1] || sections[0];
    const key = new THREE.DirectionalLight(0xe8eef8, 2.4);
    key.position.set(worldL * 0.6, worldL * 0.8, worldL * 0.9);
    key.target = mid;
    parent.add(key);
    parent.add(key.target);
    const rim = new THREE.DirectionalLight(0x9ab0ff, 1.35);
    rim.position.set(-worldL * 0.7, worldL * 0.3, -worldL * 0.5);
    rim.target = mid;
    parent.add(rim);
    parent.add(rim.target);
    const fillL = new THREE.AmbientLight(0x6a7888, 0.55);
    parent.add(fillL);
    wreckLights.push(key, rim, fillL);
    for (const sec of sections) sec.userData.wreckLights = wreckLights;
  }

  return { sections, clonedMats, cuts: { a, b, minX, maxX }, wreckLights };
}

function disposeBreakupSections(st) {
  if (st.breakupDisposed) return;
  st.breakupDisposed = true;
  const wl = (st.sections && st.sections[0] && st.sections[0].userData.wreckLights) || st.wreckLights || [];
  for (const Lgt of wl) {
    try {
      if (Lgt.parent) Lgt.parent.remove(Lgt);
      if (Lgt.target && Lgt.target.parent) Lgt.target.parent.remove(Lgt.target);
      if (Lgt.dispose) Lgt.dispose();
    } catch (_) { /* ignore */ }
  }
  for (const sec of st.sections) {
    if (sec.parent) sec.parent.remove(sec);
    sec.traverse((ch) => {
      if (!ch.isMesh) return;
      if (ch.userData && ch.userData._feelOwnedGeo && ch.geometry) {
        ch.geometry.dispose();
      }
      const mats = Array.isArray(ch.material) ? ch.material : (ch.material ? [ch.material] : []);
      for (const m of mats) {
        if (m && m.userData && m.userData._feelCloned) {
          try { m.dispose(); } catch (_) { /* ignore */ }
        }
      }
    });
  }
  if (st.clonedMats) {
    for (const m of st.clonedMats) {
      try { if (m && m.dispose) m.dispose(); } catch (_) { /* ignore */ }
    }
  }
  st.sections = [];
  st.clonedMats = [];
}

/* ------------------------------------------------------------------ */
/* FIGHTER FEEL — VEHICLE-FEEL-SPEC §3                                 */
/* ------------------------------------------------------------------ */
export function createFighterFeel(obj3d, opts = {}) {
  const fx = opts.fx || null;
  const flames = opts.flames || (obj3d.userData && obj3d.userData.flames) || [];
  const muzzles = opts.muzzles || (obj3d.userData && obj3d.userData.muzzles) || [];
  const feelRoot = opts.noReparent ? obj3d : ensureFeelRoot(obj3d);
  const reduceDefault = !!(opts.reduceMotion);

  const st = {
    t: 0,
    bank: 0,
    pitch: 0,
    stretchT: 0,
    stretchMode: 0, // 0 rest, 1 accel, -1 brake
    fireTimes: [],
    recoil: 0,
    hitKind: null,
    hitAt: -99,
    hitDir: 1,
    dead: false,
    deathT: 0,
    done: false,
    huskOpacity: 1,
    sections: [], // unused for fighter; kept for API parity
    lastFlameMul: 1,
    shieldFlash: 0,
    smokeEmit: null,
    debrisSpawned: false,
    boomDone: false,
    enginePopDone: false,
    baseFlame: flames.map((f) => (f.userData && f.userData.base != null ? f.userData.base : f.scale.z)),
  };

  const api = {
    kind: 'fighter',
    feelRoot,
    state: st,
    update(dt, ctx = {}) {
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.1) dt = 0.1;
      const rm = ctx.reduceMotion != null ? ctx.reduceMotion : reduceDefault;
      st.t += dt;

      if (st.dead) {
        api._updateDeath(dt, rm);
        return;
      }

      const yawRate = ctx.yawRate || 0;
      const throttle = clamp01(ctx.throttle != null ? ctx.throttle : 0);
      const boost = ctx.boost ? 1 : 0;
      const climb = ctx.climb || 0;
      const lateral = ctx.lateral || 0;
      const speedFrac = clamp01(ctx.speedFrac != null ? ctx.speedFrac : throttle);

      // Bank into turns — roll from yaw rate, eased (§3.3)
      const targetBank = THREE.MathUtils.clamp(-yawRate * FEEL.FIGHTER_BANK, -FEEL.FIGHTER_BANK, FEEL.FIGHTER_BANK);
      const bankEase = 1 - Math.exp(-dt / Math.max(1e-4, FEEL.FIGHTER_BANK_EASE));
      st.bank += (targetBank - st.bank) * bankEase;

      // Pitch from climb
      const targetPitch = THREE.MathUtils.clamp(-climb * 0.35, -0.4, 0.4);
      st.pitch += (targetPitch - st.pitch) * (1 - Math.exp(-dt / 0.14));

      // Idle float when nearly still (§3.2)
      let idleY = 0, idleRx = 0, idleRz = 0;
      if (speedFrac < 0.05) {
        idleY = 0.04 * Math.sin(st.t * 2.2);
        idleRx = 0.012 * Math.sin(st.t * 2.2 + 0.5);
        idleRz = 0.018 * Math.sin(st.t * 1.3);
      } else {
        idleY = 0.02 * Math.sin(st.t * 14) * lateral;
      }

      // Throttle squash/stretch (§3.3)
      const dTh = (ctx.throttleDelta != null ? ctx.throttleDelta : 0);
      if (dTh > 0.15 || boost) { st.stretchMode = 1; st.stretchT = 0.16; }
      else if (dTh < -0.15) { st.stretchMode = -1; st.stretchT = 0.18; }
      if (st.stretchT > 0) st.stretchT = Math.max(0, st.stretchT - dt);
      const sk = st.stretchT > 0 ? back(1 - st.stretchT / (st.stretchMode < 0 ? 0.18 : 0.16)) : 1;
      let sx = 1, sy = 1, sz = 1;
      if (st.stretchMode > 0 && st.stretchT > 0) {
        const a = 1 - sk;
        sx = 0.97 + 0.03 * sk; sy = 0.97 + 0.03 * sk; sz = 1.06 - 0.06 * sk;
        // blend toward rest as sk→1
        sx = THREE.MathUtils.lerp(0.97, 1, sk);
        sy = THREE.MathUtils.lerp(0.97, 1, sk);
        sz = THREE.MathUtils.lerp(1.06, 1, sk);
      } else if (st.stretchMode < 0 && st.stretchT > 0) {
        sx = THREE.MathUtils.lerp(1.05, 1, sk);
        sy = THREE.MathUtils.lerp(1.03, 1, sk);
        sz = THREE.MathUtils.lerp(0.94, 1, sk);
      }

      // Recoil from fireTimes — FIRE[0] pulse profile fork
      const r = pulses(st.t, st.fireTimes, 0.025, 0.11) * FEEL.RECOIL_K;
      st.recoil = r;
      const recoilZ = -0.035 * r;
      const recoilRx = -0.04 * r;

      // Hit flinch (§3.5)
      let hitRz = 0, hitOff = 0;
      if (st.hitAt > -90) {
        const age = st.t - st.hitAt;
        if (st.hitKind === 'shield') {
          // blue ripple / small wobble
          hitRz = 0.12 * wobble(st.t, st.hitAt, 7, 0.28) * st.hitDir;
          st.shieldFlash = Math.max(0, 1 - age / 0.4);
        } else if (st.hitKind === 'hull') {
          hitRz = 0.42 * eOut(clamp01(1 - age / 0.7)) * Math.sin(age * 18) * st.hitDir;
          hitOff = 0.18 * wobble(st.t, st.hitAt, 9, 0.4);
          if (age > 0.7) { /* settled */ }
        }
      }

      // Apply visual pose on feelRoot
      feelRoot.rotation.z = st.bank + idleRz + hitRz;
      feelRoot.rotation.x = st.pitch + idleRx + recoilRx;
      feelRoot.rotation.y = 0;
      feelRoot.position.set(hitOff, idleY, recoilZ);
      feelRoot.scale.set(sx, sy, sz);

      // Engine flames — length/intensity from speed + boost (§3.3)
      const flameMul = THREE.MathUtils.lerp(1.0, FEEL.FLAME_MAX_FIGHTER, throttle) * (boost ? 1.25 : 1) * (0.85 + Math.random() * 0.15 * (rm ? 0 : 1));
      const idleFlick = speedFrac < 0.05 ? (0.55 + 0.15 * Math.sin(st.t * 8)) : 1;
      st.lastFlameMul = flameMul * idleFlick;
      for (let i = 0; i < flames.length; i++) {
        const base = st.baseFlame[i] != null ? st.baseFlame[i] : 0.6;
        flames[i].scale.z = base * st.lastFlameMul;
        if (flames[i].material && flames[i].material.opacity != null) {
          flames[i].material.opacity = 0.55 + 0.35 * throttle + 0.15 * boost;
        }
      }

      // Shield flash visual on userData.shMat if present
      const shMat = obj3d.userData && obj3d.userData.shMat;
      if (shMat && st.shieldFlash > 0) {
        if (shMat.uniforms && shMat.uniforms.uFlash) shMat.uniforms.uFlash.value = st.shieldFlash;
        else if (shMat.userData) shMat.userData.flash = st.shieldFlash;
      }

      if (!finite(feelRoot.rotation.x, feelRoot.rotation.z, feelRoot.position.y, sx, sy, sz, st.bank)) {
        // recover from NaN
        feelRoot.rotation.set(0, 0, 0); feelRoot.position.set(0, 0, 0); feelRoot.scale.set(1, 1, 1); st.bank = 0;
      }
    },

    onFire(dir) {
      if (st.dead) return;
      const d = dir && dir.clone ? dir.clone().normalize() : new THREE.Vector3(0, 0, 1);
      st.fireTimes.push(st.t);
      // keep recent only
      if (st.fireTimes.length > 24) st.fireTimes.splice(0, st.fireTimes.length - 16);
      if (fx) {
        let mz = muzzles[0];
        const p = new THREE.Vector3();
        if (mz) mz.getWorldPosition(p); else obj3d.getWorldPosition(p);
        fx.muzzle(p, d, 0x7fe8ff, 0.9);
        fx.addTrauma(0.15);
      }
    },

    onHit({ kind = 'hull', point = null } = {}) {
      if (st.dead) return;
      st.hitKind = kind === 'shield' ? 'shield' : 'hull';
      st.hitAt = st.t;
      st.hitDir = Math.random() < 0.5 ? -1 : 1;
      const p = point ? point.clone() : new THREE.Vector3();
      if (!point) obj3d.getWorldPosition(p);
      if (fx) {
        if (st.hitKind === 'shield') {
          fx.sparks(p, 5, 0x7fd8ff, 3, 0.35);
          fx.addTrauma(0.2);
          st.shieldFlash = 1;
        } else {
          fx.hitPuff(p, 3);
          fx.sparks(p, 28, 0xff8a3c, 8, 0.7);
          fx.sparks(p, 12, 0xffcc40, 5, 0.5);
          fx.smoke(p, 5, 0.7, 0x6a6060, 0.9, 0.45, 1.8);
          fx._sprite({ p: p.clone(), tex: 'glow', add: true, color: 0xff6020, life: 0.35, s0: 1.2, s1: 2.2, a: 1 });
          fx._sprite({ p: p.clone(), tex: 'glow', add: true, color: 0xffaa40, life: 0.22, s0: 0.6, s1: 1.4, a: 1 });
          fx.light(p, 0xff7020, 10, 0.25, 12);
          fx.addTrauma(0.45);
          if (!st.smokeEmit) {
            st.smokeEmit = fx.emit(() => {
              const q = new THREE.Vector3(); obj3d.getWorldPosition(q);
              fx.smoke(q, 1, 0.5, 0x5d6168, 0.8, 0.3, 1.6);
            }, 6, 2.5, 'hullsmoke');
          }
        }
      }
    },

    kill() {
      if (st.dead) return;
      st.dead = true;
      st.deathT = 0;
      st.done = false;
      st.debrisSpawned = false;
      st.boomDone = false;
      st.enginePopDone = false;
      if (fx) {
        fx.addTrauma(0.7);
        fx.hitStopMs(90, 0.08);
        const p = new THREE.Vector3(); obj3d.getWorldPosition(p);
        fx.hitPuff(p, 2);
        st.smokeEmit = fx.emit(() => {
          const q = new THREE.Vector3(); obj3d.getWorldPosition(q);
          fx.smoke(q, 1, 0.6, 0x5d6168, 1.0, 0.4, 1.8);
        }, 12, 2.0, 'deathsmoke');
      }
      // snuff flames toward base·0.2 over 150ms — handled in _updateDeath
    },

    isDone() { return !!st.done; },

    _updateDeath(dt, rm) {
      st.deathT += dt;
      const t = st.deathT;
      const p = new THREE.Vector3(); obj3d.getWorldPosition(p);

      // Beat 0–1: uncontrolled spin 0–400ms; flames snuff in 150ms
      const snuff = clamp01(t / 0.15);
      for (let i = 0; i < flames.length; i++) {
        const base = st.baseFlame[i] != null ? st.baseFlame[i] : 0.6;
        flames[i].scale.z = base * THREE.MathUtils.lerp(st.lastFlameMul || 1, 0.2, eOut(snuff));
      }

      if (t < 0.9) {
        const amp = 0.6 * (rm ? 0.25 : 1);
        feelRoot.rotation.x += wobble(t, 0, 4, 0.8) * amp * dt * 8;
        feelRoot.rotation.y += wobble(t, 0.05, 3.5, 0.85) * amp * dt * 7;
        feelRoot.rotation.z += wobble(t, 0.02, 5, 0.75) * amp * dt * 9;
      }

      // Beat 2: engine pop @ 450ms
      if (!st.enginePopDone && t >= 0.45) {
        st.enginePopDone = true;
        if (fx) fx.explosion(p.clone().add(new THREE.Vector3(0, 0, -0.8)), 0.7);
      }

      // Beat 3: main boom @ 900ms
      if (!st.boomDone && t >= 0.9) {
        st.boomDone = true;
        if (fx) {
          fx.explosion(p, 1.4);
          fx.ring(p, 0xffd28a, 3.2, 0.5);
          fx.sparks(p, 20, 0xffc060, 7, 0.55);
          fx.light(p, 0xff9a40, 14, 0.35, 16);
          fx.addTrauma(0.85);
        }
      }

      // Beat 4: debris chunks 900–1800ms
      if (!st.debrisSpawned && t >= 0.9) {
        st.debrisSpawned = true;
        if (fx) {
          for (let i = 0; i < 8; i++) {
            const m = new THREE.Mesh(fx.debrisGeo, fx.debrisMat.clone());
            m.scale.setScalar(0.6 + Math.random() * 0.9);
            const v = fx._rv(8, 4, 8); v.y = Math.abs(v.y) + 2;
            fx.scene.add(m); m.position.copy(p);
            fx.solids.push({ m, v, w: fx._rv(12, 12, 12), life: 0, max: 2.2, bounce: 0.2 });
          }
        }
      }

      // Beat 5: fade husk 1800–2800 (700ms window ending ~2.5–2.8)
      if (t >= 1.8) {
        const fadeK = clamp01((t - 1.8) / 0.7);
        st.huskOpacity = 1 - fadeK;
        feelRoot.traverse((ch) => {
          if (ch.isMesh && ch.material) {
            const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
            for (const mat of mats) {
              mat.transparent = true;
              mat.opacity = Math.min(mat.opacity != null ? mat.opacity : 1, st.huskOpacity);
              mat.depthWrite = st.huskOpacity > 0.2;
            }
          }
        });
        if (fadeK >= 1 && fx) fx.stop('deathsmoke');
      }

      // Beat 6: despawn @ 3200ms
      if (t >= FEEL.DEATH_FIGHTER_S) {
        st.done = true;
        feelRoot.visible = false;
        if (fx) fx.stop('deathsmoke');
      }

      if (!finite(feelRoot.rotation.x, feelRoot.rotation.y, feelRoot.rotation.z)) {
        feelRoot.rotation.set(0, 0, 0);
      }
    },
  };

  return api;
}

/* ------------------------------------------------------------------ */
/* CAPITAL FEEL — VEHICLE-FEEL-SPEC §4                                 */
/* ------------------------------------------------------------------ */
export function createCapitalFeel(obj3d, opts = {}) {
  const fx = opts.fx || null;
  const flames = opts.flames || (obj3d.userData && obj3d.userData.flames) || [];
  const turrets = opts.turrets || (obj3d.userData && obj3d.userData.turrets) || [];
  const L = opts.L || (obj3d.userData && obj3d.userData.L) || 5.6;
  const feelRoot = opts.noReparent ? obj3d : ensureFeelRoot(obj3d);
  const reduceDefault = !!(opts.reduceMotion);

  const st = {
    t: 0,
    throttle: 0,
    throttleVis: 0,
    dead: false,
    deathT: 0,
    done: false,
    hitKind: null,
    hitAt: -99,
    fireLog: [], // {t, turretIndex}
    broadsideAt: -99,
    broadsideKick: 0,
    broadsideFlashes: 0,
    acquire: turrets.map(() => ({ yaw: 0, targetYaw: 0, t0: 0, from: 0, active: false })),
    cascadeNext: 0,
    cascadeCount: 0,
    enginesOut: false,
    coreBlast: false,
    breakup: false,
    intactBurn: false,
    sections: [],
    clonedMats: [],
    breakupDisposed: false,
    secondaryA: false,
    secondaryB: false,
    baseFlame: flames.map((f) => (f.userData && f.userData.base != null ? f.userData.base : (f.scale.x || 1))),
    hullFlash: 0,
  };

  const api = {
    kind: 'capital',
    feelRoot,
    state: st,
    update(dt, ctx = {}) {
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      if (dt > 0.1) dt = 0.1;
      const rm = ctx.reduceMotion != null ? ctx.reduceMotion : reduceDefault;
      st.t += dt;

      if (st.dead) {
        api._updateDeath(dt, rm);
        return;
      }

      const throttle = clamp01(ctx.throttle != null ? ctx.throttle : 0);
      // Heavy accel ease ~2.2s (§4.3)
      st.throttleVis += (throttle - st.throttleVis) * (1 - Math.exp(-dt / 2.2));
      st.throttle = throttle;

      // Idle bob + micro roll (§4.2)
      const bobY = FEEL.CAPITAL_BOB_Y * Math.sin(st.t * FEEL.CAPITAL_BOB_F);
      const roll = FEEL.CAPITAL_ROLL * Math.cos(st.t * 0.45);
      const pitch = 0.12 * Math.sin(st.t * 0.35) * 0.15; // keep subtle vs demo 0.12 full

      // Hull flash decay
      if (st.hullFlash > 0) st.hullFlash = Math.max(0, st.hullFlash - dt * 4);

      // Broadside hull recoil/roll
      if (st.broadsideKick > 0) st.broadsideKick = Math.max(0, st.broadsideKick - dt * 2.2);
      const bsRoll = -0.12 * pulse(1 - st.broadsideKick, 0, 0.05, 0.35) * (st.broadsideKick > 0 ? 1 : 0);
      // simpler: kick decays linearly, roll = kick * amp
      const kickRoll = -0.14 * st.broadsideKick;
      const kickYaw = 0.04 * st.broadsideKick;
      feelRoot.position.y = bobY;
      feelRoot.rotation.z = roll + kickRoll;
      feelRoot.rotation.x = pitch;
      feelRoot.rotation.y = kickYaw;

      // Engine flicker (§4.2 / §4.3) — never fighter ×3
      const flameMul = THREE.MathUtils.lerp(0.7, FEEL.FLAME_MAX_CAPITAL, st.throttleVis);
      for (let i = 0; i < flames.length; i++) {
        const flick = 0.8 + 0.35 * Math.random() * (rm ? 0 : 1) * Math.max(0.25, st.throttleVis);
        const s = flameMul * flick;
        // capital engines are often scale on cone along local axis
        if (flames[i].scale) {
          const b = st.baseFlame[i] != null ? st.baseFlame[i] : 1;
          flames[i].scale.x = b * s;
          flames[i].scale.y = b * s;
          if (flames[i].userData && flames[i].userData.base != null) {
            flames[i].scale.z = flames[i].userData.base * s;
          }
        }
      }

      // Turret acquire with back() overshoot (§4.4)
      const target = ctx.target || null;
      for (let i = 0; i < turrets.length; i++) {
        const tur = turrets[i];
        const ac = st.acquire[i] || (st.acquire[i] = { yaw: 0, targetYaw: 0, t0: 0, from: 0, active: false });
        if (target && tur && tur.head) {
          // aim in local XZ (battleship nose +X) — approximate yaw toward target
          const hp = new THREE.Vector3();
          tur.head.getWorldPosition(hp);
          const dx = target.x - hp.x;
          const dz = target.z - hp.z;
          // local aim: battleship uses atan2 for local; store desired
          const desired = Math.atan2(dz, dx);
          if (!ac.active || Math.abs(desired - ac.targetYaw) > 0.05) {
            ac.from = ac.yaw;
            ac.targetYaw = desired;
            ac.t0 = st.t;
            ac.active = true;
          }
          const u = clamp01((st.t - ac.t0) / 0.45);
          const k = back(u);
          // overshoot ±0.04 baked into back()
          ac.yaw = ac.from + (ac.targetYaw - ac.from) * k;
          // Apply relative yaw on head — use delta from rest
          if (tur.head.rotation) {
            // map to head.y as demo does for idle sweep
            tur.head.rotation.y = ac.yaw * 0.15 + (ac.active ? (k - 1) * 0.04 : 0);
          }
          if (u >= 1) ac.active = false;
        } else if (tur && tur.head) {
          // idle sweep
          tur.head.rotation.y = 0.35 * Math.sin(st.t * TAU / 8 + i * 0.7);
        }
      }

      // Broadside trauma linger handled at fire time
      if (!finite(feelRoot.position.y, feelRoot.rotation.z, feelRoot.rotation.x)) {
        feelRoot.position.y = 0; feelRoot.rotation.set(0, 0, 0);
      }
    },

    onFire(dir, extra = {}) {
      if (st.dead) return;
      const idx = extra.turretIndex != null ? extra.turretIndex : 0;
      st.fireLog.push({ t: st.t, turretIndex: idx });
      // prune
      st.fireLog = st.fireLog.filter((e) => st.t - e.t < 0.2);
      const recent = st.fireLog.filter((e) => st.t - e.t <= 0.12);
      const uniqueTur = new Set(recent.map((e) => e.turretIndex));

      if (fx) {
        const d = dir && dir.clone ? dir.clone().normalize() : new THREE.Vector3(1, 0, 0);
        let p = new THREE.Vector3();
        const tur = turrets[idx];
        if (tur && tur.muzzles && tur.muzzles[0]) tur.muzzles[0].getWorldPosition(p);
        else obj3d.getWorldPosition(p);
        fx.muzzle(p, d, 0xffd84a, 1.8);
        // turret head recoil kick
        if (tur && tur.head) {
          tur.head.position.z = (tur.head.position.z || 0) - 0.04;
          // will settle via pulse in update — apply one-shot offset restored next frames
          const kickAt = st.t;
          const head = tur.head;
          const baseZ = head.userData._baseZ != null ? head.userData._baseZ : (head.userData._baseZ = head.position.z + 0.04);
          // store pending kick
          head.userData._kickAt = kickAt;
        }
        fx.addTrauma(0.2);
      }

      if (uniqueTur.size >= 3) api.onBroadside();
    },

    onBroadside() {
      if (st.dead) return;
      if (st.t - st.broadsideAt < 0.3) return; // debounce
      st.broadsideAt = st.t;
      st.broadsideKick = 1; // hull recoil/roll envelope
      if (fx) {
        fx.addTrauma(0.55);
        fx.hitStopMs(70, 0.05);
        const origin = new THREE.Vector3(); obj3d.getWorldPosition(origin);
        // Side-out direction in world (hull broadside = local +Z for battleship nose +X)
        const side = new THREE.Vector3(0, 0, 1).applyQuaternion(obj3d.getWorldQuaternion(new THREE.Quaternion())).normalize();
        const alongAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(obj3d.getWorldQuaternion(new THREE.Quaternion())).normalize();
        fx.ring(origin.clone().add(new THREE.Vector3(0, -0.4, 0)), 0xffd28a, L * 0.45, 0.5);
        const nFlash = Math.max(5, (turrets.length || 0) + 2);
        st.broadsideFlashes = nFlash;
        for (let i = 0; i < nFlash; i++) {
          const along = (i / Math.max(1, nFlash - 1) - 0.5) * L * 0.85;
          let q;
          const tur = turrets[i % Math.max(1, turrets.length)];
          if (tur && tur.muzzles && tur.muzzles[0]) {
            q = new THREE.Vector3();
            tur.muzzles[0].getWorldPosition(q);
            // nudge to side for readability
            q.addScaledVector(side, 0.35);
          } else {
            q = origin.clone().addScaledVector(alongAxis, along).addScaledVector(side, L * 0.18);
            q.y += 0.25;
          }
          // Large warm muzzle scaled to capital world length; held for stills
          const big = Math.max(4, L * 0.09);
          const boltLen = Math.max(8, L * 0.22);
          fx.muzzle(q, side, 0xffc050, big, 0.7);
          fx.muzzle(q.clone().addScaledVector(side, L * 0.02), side, 0xfff0a0, big * 0.7, 0.55);
          fx.boltStreak(q.clone().addScaledVector(side, L * 0.03), side, 0xffd84a, boltLen, 0.75, Math.max(0.2, L * 0.004));
          // Kick turret head
          if (tur && tur.head) {
            tur.head.position.z = (tur.head.userData._baseZ != null ? tur.head.userData._baseZ : (tur.head.userData._baseZ = tur.head.position.z)) - 0.08;
          }
        }
        fx.log('broadside', { L, nFlash });
      }
    },

    onHit({ kind = 'hull', point = null } = {}) {
      if (st.dead) return;
      st.hitKind = kind === 'shield' ? 'shield' : 'hull';
      st.hitAt = st.t;
      const p = point ? point.clone() : new THREE.Vector3();
      if (!point) obj3d.getWorldPosition(p);
      if (fx) {
        if (st.hitKind === 'shield') {
          fx.sparks(p, 5, 0x7fd8ff, 3, 0.35);
          fx.addTrauma(0.25);
          const sh = obj3d.userData && obj3d.userData.shield;
          const shMat = obj3d.userData && obj3d.userData.shMat;
          if (shMat) {
            if (shMat.opacity != null) shMat.opacity = 0.35;
            if (shMat.userData) shMat.userData.flash = 1;
            if (shMat.uniforms && shMat.uniforms.uFlash) shMat.uniforms.uFlash.value = 1;
          }
          if (sh) sh.visible = true;
        } else {
          fx.sparks(p, 7, 0xff8a3c, 3.5, 0.4);
          fx.addTrauma(0.4);
          st.hullFlash = 1;
          // brief emissive-style flash via additive sprite
          fx._sprite({ p: p.clone(), tex: 'glow', add: true, color: 0xffa060, life: 0.12, s0: 0.8, s1: 1.4, a: 0.9 });
        }
      }
    },

    // 0694fdb restore: capital death visuals owned by battle.js (grey wreck + spawnExplosion + wreckT).
    // Instant-done — no cascade / intact-burn / breakup / feelFX fireball plates.
    kill() {
      if (st.dead) return;
      st.dead = true;
      st.deathT = 0;
      st.done = true;
      st.cascadeNext = 0;
      st.cascadeCount = 0;
      st.enginesOut = true;
      st.coreBlast = false;
      st.breakup = false;
      st.intactBurn = false;
      st._fadeMats = [];
      st.sections = [];
      st.clonedMats = [];
      st.breakupDisposed = true;
      st.secondaryA = true;
      st.secondaryB = true;
      st.activeFireballs = 0;
      if (obj3d.userData && obj3d.userData.shield) {
        obj3d.userData.shield.visible = false;
        obj3d.userData.shieldRestHidden = true;
      }
      if (fx) fx.log('capital_kill_0694fdb_handoff');
    },

    isDone() { return !!st.done; },

    _updateDeath(dt, rm) {
      // 0694fdb: battle owns capital death — skip cascade/intact burn FX
      if (st.done) return;
      st.deathT += dt;
      const t = st.deathT;
      const p = new THREE.Vector3(); obj3d.getWorldPosition(p);

      // Settle bob freeze → slow tumble
      feelRoot.position.y = FEEL.CAPITAL_BOB_Y * 0.3 * Math.sin(t * 0.4);
      feelRoot.rotation.z = 0.08 * Math.sin(t * 0.7);
      feelRoot.rotation.x = 0.05 * t * 0.15;

      // B: cascade — 6–10 big fireballs walking the hull (every ~200–280ms), 0.15–2.8s
      if (t >= 0.15 && t <= 2.8 && t >= st.cascadeNext) {
        st.cascadeCount++;
        st.cascadeNext = t + 0.2 + Math.random() * 0.08;
        if (fx) {
          // Walk along hull length (nose +X)
          const u = (st.cascadeCount % 8) / 7;
          const along = (u - 0.5) * L * 0.9;
          const side = ((st.cascadeCount % 2) * 2 - 1) * L * 0.08;
          const q = p.clone().add(new THREE.Vector3(along, 0.35 + Math.random() * 0.4, side));
          const sz = Math.max(1.6, L * 0.028) + Math.random() * Math.max(0.5, L * 0.012);
          fx.explosion(q, sz);
          fx.smoke(q.clone().add(new THREE.Vector3(0, L * 0.02, 0)), 6, Math.max(2, L * 0.04), 0x4a4a50, 2.0, 1.2, 3.2);
          fx.light(q, 0xff8020, 6 * sz, 0.25, Math.max(10, L * 0.2)); // soft — avoid salmon hull tint
          // second simultaneous fireball every other beat
          if (st.cascadeCount % 2 === 0) {
            const q2 = p.clone().add(new THREE.Vector3(-along * 0.6, L * 0.02, -side));
            fx.explosion(q2, sz * 0.85);
            st.activeFireballs = (st.activeFireballs || 0) + 1;
          }
          st.activeFireballs = (st.activeFireballs || 0) + 1;
          const tur = turrets[st.cascadeCount % Math.max(1, turrets.length)];
          if (tur && tur.head) {
            tur.head.rotation.x = back(1) * 0.6;
            tur.head.rotation.z = 0.4;
          }
        }
      }

      // C: engines out @ 2500ms
      if (!st.enginesOut && t >= 2.5) {
        st.enginesOut = true;
        if (fx) {
          fx.emit(() => {
            for (const f of flames) {
              const q = new THREE.Vector3();
              f.getWorldPosition(q);
              fx.smoke(q, 1, 0.7, 0x3a3a40, 0.5, 0.4, 2.5);
            }
          }, 15, 3.0, 'engout');
        }
      }
      if (t >= 2.5) {
        const sn = clamp01((t - 2.5) / 0.4);
        for (let i = 0; i < flames.length; i++) {
          const b = st.baseFlame[i] != null ? st.baseFlame[i] : 1;
          const s = b * (1 - eOut(sn));
          flames[i].scale.x = s; flames[i].scale.y = s;
        }
      }

      // D: core breach @ 4200ms
      if (!st.coreBlast && t >= FEEL.CORE_BLAST_T) {
        st.coreBlast = true;
        if (fx) {
          fx.explosion(p, Math.max(7.5, L * 0.13)); // 9:16-ish peak, suite caps ≤35%
          // no persistent ring — clearRings on breakup; sparks + light carry the punch
          fx.light(p, 0xffc080, 18, 0.35, Math.max(18, L * 0.25)); // soft — fireball is sprites, not hull tint
          fx.sparks(p, 64, 0xffc060, 14, 0.9);
          fx.sparks(p, 28, 0xff8020, 9, 0.7);
          // Intact path: NO debris solids / BoxGeometry chunks (Lead HOLD breakup)
          fx.addTrauma(1.0);
          fx.hitStopMs(160, 0.03);
          fx.log('core_blast');
        }
      }

      // E: INTACT burn + fade (Lead HOLD breakup) — NO spawnClippedHullSections, NO chunks/boxes.
      // Original gunmetal materials stay unchanged (no recolor / no scorched clone).
      if (!st.intactBurn && t >= FEEL.CORE_BLAST_T) {
        st.intactBurn = true;
        st.breakup = false; // never split
        st.sections = [];
        if (obj3d.userData && obj3d.userData.shield) obj3d.userData.shield.visible = false;
        if (fx && fx.clearRings) fx.clearRings();
        // Hide thin flat panels (rails/armor plates) so fade never reads as a bare dark plate
        feelRoot.traverse((ch) => {
          if (!ch.isMesh || !ch.visible || !ch.geometry) return;
          if (ch.userData && (ch.userData._feelCutFx || ch.userData._battleTrimHidden)) return;
          if (!ch.geometry.boundingBox) {
            try { ch.geometry.computeBoundingBox(); } catch (_) { return; }
          }
          const bb = ch.geometry.boundingBox;
          if (!bb) return;
          const sx = Math.abs(bb.max.x - bb.min.x);
          const sy = Math.abs(bb.max.y - bb.min.y);
          const sz = Math.abs(bb.max.z - bb.min.z);
          const maxE = Math.max(sx, sy, sz) || 1;
          const minE = Math.min(sx, sy, sz);
          const thin = minE / maxE;
          const pos = ch.geometry.getAttribute('position');
          const verts = pos ? pos.count : 0;
          // Thin plates / tiny quads / PlaneGeometry → hide (Lead: no bare plate by bridge)
          if (thin < 0.10 || verts <= 8 || /PlaneGeometry/i.test(ch.geometry.type || '')) {
            ch.visible = false;
            ch.userData._intactThinHidden = true;
          }
        });
        // Snapshot mats; swap Standard→Basic with SAME color so fireball lights cannot salmon-tint hull
        st._fadeMats = [];
        feelRoot.traverse((ch) => {
          if (!ch.isMesh || !ch.material || !ch.visible) return;
          const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
          const next = [];
          let changed = false;
          for (const m of mats) {
            if (!m || m.userData && m.userData._feelFadeTracked) { next.push(m); continue; }
            let use = m;
            if (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial) {
              const basic = new THREE.MeshBasicMaterial({
                color: m.color ? m.color.clone() : new THREE.Color(0x4a5568),
                map: m.map || null,
                transparent: !!m.transparent,
                opacity: m.opacity != null ? m.opacity : 1,
                side: m.side,
                depthWrite: m.depthWrite !== false,
                fog: m.fog !== false,
              });
              basic.userData = Object.assign({}, m.userData || {}, { _feelFadeTracked: true, _feelBasicSwap: true });
              use = basic;
              changed = true;
            } else {
              if (m.userData) m.userData._feelFadeTracked = true;
              else m.userData = { _feelFadeTracked: true };
            }
            st._fadeMats.push({
              m: use, orig: m, mesh: ch, wasArr: Array.isArray(ch.material),
              opac: use.opacity != null ? use.opacity : 1, wasTrans: !!use.transparent,
            });
            next.push(use);
          }
          if (changed) ch.material = Array.isArray(ch.material) ? next : next[0];
        });
        fx && fx.log('intact_burn', { mats: st._fadeMats.length });
      }

      if (st.intactBurn) {
        // Drift slowly while burning (no section split)
        feelRoot.position.y += dt * 0.15;
        feelRoot.rotation.z += dt * 0.04;
        // Stay readable through kill+2s (~6.2), then finish fade by ~6.7
        const fadeK = clamp01((t - FEEL.CORE_BLAST_T - 1.0) / 1.4);
        const opac = 1 - eIn(fadeK);
        for (const rec of (st._fadeMats || [])) {
          const m = rec.m;
          if (!m) continue;
          m.transparent = true;
          m.opacity = rec.opac * opac;
          m.depthWrite = opac > 0.35;
          m.needsUpdate = true;
        }
        // Embers / flame lick on intact hull — sprites only, never new BoxGeometry
        if (fx && Math.floor(t * 8) !== st._emberTick) {
          st._emberTick = Math.floor(t * 8);
          const along = (Math.random() - 0.5) * L * 0.7;
          const q = p.clone().add(new THREE.Vector3(along, (Math.random() - 0.3) * L * 0.08, (Math.random() - 0.5) * L * 0.12));
          fx.sparks(q, 4, 0xff8020, 2.5, 0.4);
          fx._sprite({ p: q, tex: 'glow', add: true, color: 0xff6010, life: 0.28, s0: L * 0.012, s1: L * 0.02, a: 0.7 });
          if (fadeK < 0.85) fx.smoke(q.clone().add(new THREE.Vector3(0, L * 0.02, 0)), 1, 0.45, 0x3a3a40, 0.6, 0.25, 1.4);
        }
        if (fadeK >= 1) {
          feelRoot.visible = false;
          obj3d.visible = false;
        }
      }

      // secondary sparks @ 4800 and 5400 (no geometry spawn)
      if (!st.secondaryA && t >= 4.8) {
        st.secondaryA = true;
        if (fx) {
          const q = p.clone().add(new THREE.Vector3(L * 0.2, 0, 0));
          fx.sparks(q, 12, 0xff8020, 5, 0.5);
          fx._sprite({ p: q, tex: 'glow', add: true, color: 0xff8020, life: 0.35, s0: L * 0.03, s1: L * 0.05, a: 0.85 });
        }
      }
      if (!st.secondaryB && t >= 5.4) {
        st.secondaryB = true;
        if (fx) {
          const q = p.clone().add(new THREE.Vector3(-L * 0.2, 0, 0));
          fx.sparks(q, 12, 0xff8020, 5, 0.5);
          fx._sprite({ p: q, tex: 'glow', add: true, color: 0xff8020, life: 0.35, s0: L * 0.03, s1: L * 0.05, a: 0.85 });
        }
      }

      // Done shortly after fade completes (~6.7s) — no breakup dispose needed
      if (t >= Math.min(FEEL.DEATH_CAPITAL_S, FEEL.CORE_BLAST_T + 2.55)) {
        st.done = true;
        if (fx) { fx.stop('engout'); fx.stop('aftermath'); }
        feelRoot.visible = false;
        obj3d.visible = false;
        // Restore original materials (undo Basic swap + opacity)
        for (const rec of (st._fadeMats || [])) {
          if (rec.orig && rec.mesh) {
            if (rec.wasArr) {
              const mats = Array.isArray(rec.mesh.material) ? rec.mesh.material.slice() : [rec.mesh.material];
              const i = mats.indexOf(rec.m);
              if (i >= 0) mats[i] = rec.orig;
              rec.mesh.material = mats;
            } else if (rec.mesh.material === rec.m) {
              rec.mesh.material = rec.orig;
            }
            if (rec.m && rec.m.userData && rec.m.userData._feelBasicSwap) {
              try { rec.m.dispose(); } catch (_) {}
            }
          } else if (rec.m) {
            rec.m.opacity = rec.opac;
            rec.m.transparent = rec.wasTrans;
          }
        }
        st._fadeMats = [];
        disposeBreakupSections(st); // no-op if no sections
      }

      if (!finite(feelRoot.rotation.x, feelRoot.rotation.z)) feelRoot.rotation.set(0, 0, 0);
    },
  };

  return api;
}

export default { attachVehicleFeel, createFighterFeel, createCapitalFeel, FeelFX, FEEL, sm, eOut, eIn, back, pulse, pulses, wobble, OUT_T };
