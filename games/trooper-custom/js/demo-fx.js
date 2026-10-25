// Demo Viewer effects: pooled sprites (smoke, fire, flash, sparks), shell casings, tracers/beams, projectiles, lights.
// Phone friendly: fixed pools, no shadows on effects, all driven by the (speed-scaled) demo clock.
import * as THREE from 'three';

function softTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function puffTex() { // lumpy smoke puff
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  for (const [cx, cy, r] of [[32, 34, 22], [22, 28, 14], [42, 26, 15], [30, 20, 13], [44, 40, 12], [20, 42, 12]]) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class FX {
  constructor(scene) {
    this.scene = scene; this.t = 0;
    this.tex = { smoke: puffTex(), glow: softTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,240,200,.85)'], [1, 'rgba(255,200,120,0)']]), spark: softTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]) };
    this.sprites = []; this.free = [];
    for (let i = 0; i < 260; i++) {
      const m = new THREE.SpriteMaterial({ map: this.tex.smoke, transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 5; scene.add(s); this.free.push(s);
    }
    this.solids = []; // shell casings, mags, grenades, debris (meshes with gravity + bounce)
    this.tweens = []; // dropped weapons: arc from the hand to lying flat on the ground, then fade (own material copies)
    this.lines = []; // tracers / beams
    this.lights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffc070, 0, 6, 2); scene.add(l); this.lights.push({ l, life: 0, max: 1, I: 0 }); }
    this.emitters = []; this.projectiles = []; this.rings = [];
    this.casingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6); this.casingMat = new THREE.MeshLambertMaterial({ color: 0xd9a441 });
    this.debrisGeo = new THREE.BoxGeometry(0.12, 0.08, 0.1); this.debrisMat = new THREE.MeshLambertMaterial({ color: 0x2b2f35 });
    this.lineGeo = new THREE.BoxGeometry(1, 1, 1); this.lineGeo.translate(0, 0, 0.5);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 40); this.ringGeo.rotateX(-Math.PI / 2);
  }
  sprite(o) {
    const s = this.free.pop() || this.sprites.shift(); if (!s) return null;
    const m = s.material; m.map = this.tex[o.tex || 'smoke']; m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.color.set(o.color ?? 0xffffff); m.rotation = Math.random() * 6.28; m.needsUpdate = true;
    s.position.copy(o.p); s.visible = true;
    s.userData = { v: (o.v || new THREE.Vector3()).clone(), life: 0, max: o.life ?? 1, s0: o.s0 ?? 0.3, s1: o.s1 ?? 1, a: o.a ?? 0.9, g: o.g ?? 0, drag: o.drag ?? 1.5, spin: (Math.random() - 0.5) * (o.spin ?? 1), fadeIn: o.fadeIn ?? 0.08, c1: o.c1 != null ? new THREE.Color(o.c1) : null, c0: new THREE.Color(o.color ?? 0xffffff) };
    this.sprites.push(s); return s;
  }
  rnd(a) { return (Math.random() * 2 - 1) * a; }
  rv(x, y, z) { return new THREE.Vector3(this.rnd(x), this.rnd(y), this.rnd(z)); }
  light(p, color = 0xffc070, I = 6, life = 0.08, dist = 6) {
    const L = this.lights.reduce((a, b) => (a.life / a.max > b.life / b.max ? a : b)); // oldest
    L.l.position.copy(p); L.l.color.set(color); L.l.distance = dist; L.I = I; L.life = 0; L.max = life; L.l.intensity = I;
  }
  // ----- recipes -----
  muzzle(p, dir, color = 0xffd27a, big = 1) {
    this.sprite({ p, tex: 'glow', add: true, color, life: 0.07, s0: 0.35 * big, s1: 0.5 * big, a: 1, drag: 0, fadeIn: 0 });
    this.sprite({ p: p.clone().addScaledVector(dir, 0.12 * big), tex: 'glow', add: true, color: 0xffffff, life: 0.05, s0: 0.18 * big, s1: 0.25 * big, a: 1, fadeIn: 0 });
    for (let i = 0; i < 2 + big; i++) this.sprite({ p: p.clone(), v: dir.clone().multiplyScalar(0.8 + Math.random()).add(this.rv(0.2, 0.25, 0.2)), color: 0xb9c0c8, life: 0.7 + Math.random() * 0.4, s0: 0.08 * big, s1: 0.45 * big, a: 0.45, drag: 3, g: -0.4 });
    this.light(p, color, 5 * big, 0.07);
  }
  casing(p, side) { // side: world-space eject direction
    const m = new THREE.Mesh(this.casingGeo, this.casingMat); m.position.copy(p); m.rotation.set(Math.random() * 3, Math.random() * 3, 0); this.scene.add(m);
    this.solids.push({ m, v: side.clone().multiplyScalar(1.6 + Math.random() * 0.6).add(new THREE.Vector3(0, 1.8 + Math.random() * 0.6, 0)), w: this.rv(18, 18, 18), life: 0, max: 2.2, bounce: 0.35, r: 0.012 });
  }
  solid(mesh, p, v, max = 2, bounce = 0.3, r = 0.03, w = 8) {
    mesh.position.copy(p); this.scene.add(mesh);
    const o = { m: mesh, v: v.clone(), w: this.rv(w, w, w), life: 0, max, bounce, r }; this.solids.push(o); return o;
  }
  // obj flies from (p0, q0) to (p1, q1) in dur s with an arc, lies still, then fades out over the last 0.7 s of life
  tween(obj, p0, q0, p1, q1, dur, life, arc = 0.5) {
    obj.position.copy(p0); obj.quaternion.copy(q0); this.scene.add(obj);
    const o = { m: obj, p0: p0.clone(), q0: q0.clone(), p1: p1.clone(), q1: q1.clone(), dur, life: 0, max: life, arc }; this.tweens.push(o); return o;
  }
  dropTween(o) { o.m.parent && o.m.parent.remove(o.m); o.m.traverse((k) => { if (k.material && k.material.dispose) k.material.dispose(); }); }
  tracer(a, b, color = 0xfff0a0, life = 0.09, width = 0.025) {
    const m = new THREE.Mesh(this.lineGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const d = _v.copy(b).sub(a), len = d.length(); m.position.copy(a); m.quaternion.setFromUnitVectors(Z, d.normalize()); m.scale.set(width, width, len);
    this.scene.add(m); this.lines.push({ m, life: 0, max: life, w: width });
    return m;
  }
  bolt(a, b, color = 0xff5a3c, speed = 60, len = 0.7, onHit) { // visible moving blaster bolt
    const m = new THREE.Mesh(this.lineGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.scale.set(0.035, 0.035, len); m.quaternion.setFromUnitVectors(Z, b.clone().sub(a).normalize()); this.scene.add(m);
    const glow = this.sprite({ p: a, tex: 'glow', add: true, color, life: 9, s0: 0.25, s1: 0.25, a: 0.8, drag: 0, fadeIn: 0 });
    this.projectiles.push({ m, glow, a: a.clone(), b: b.clone(), t: 0, dur: a.distanceTo(b) / speed, arc: 0, onHit, trail: 0, kind: 'bolt' });
  }
  lob(mesh, a, b, dur, arc, onHit, trail = 0, spin = 10) { // grenade / rocket / tank shell
    this.scene.add(mesh); mesh.position.copy(a);
    this.projectiles.push({ m: mesh, a: a.clone(), b: b.clone(), t: 0, dur, arc, onHit, trail, spin, kind: 'lob', last: a.clone() });
  }
  smoke(p, n = 6, size = 1, color = 0x9aa1a8, rise = 0.6, spread = 0.4, life = 2.2) {
    for (let i = 0; i < n; i++) this.sprite({ p: p.clone().add(this.rv(spread * 0.4, 0.1, spread * 0.4)), v: this.rv(spread, 0.1, spread).add(new THREE.Vector3(0, rise, 0)), color, life: life * (0.7 + Math.random() * 0.6), s0: 0.25 * size, s1: 1.2 * size, a: 0.7, drag: 1.2, g: -0.1 });
  }
  sparks(p, n = 10, color = 0xffd27a, speed = 3, life = 0.35) {
    for (let i = 0; i < n; i++) this.sprite({ p: p.clone(), tex: 'spark', add: true, color, v: this.rv(1, 1, 1).normalize().multiplyScalar(speed * (0.4 + Math.random())).add(new THREE.Vector3(0, 1, 0)), life: life * (0.6 + Math.random() * 0.8), s0: 0.07, s1: 0.02, a: 1, g: 6, drag: 1, fadeIn: 0 });
  }
  hitPuff(p, n = 1) { // R.U.S.E. style: spark + grey puff, no blood
    this.sparks(p, 8 * n, 0xffe2a0, 2.6);
    this.smoke(p, 3 * n, 0.45, 0xb8bec6, 0.5, 0.5, 1.2);
    this.sprite({ p, tex: 'glow', add: true, color: 0xfff0c0, life: 0.1, s0: 0.3, s1: 0.5, a: 1, fadeIn: 0 });
  }
  explosion(p, size = 1, color = 0xffa040) {
    this.sprite({ p: p.clone().add(new THREE.Vector3(0, 0.2 * size, 0)), tex: 'glow', add: true, color: 0xffffff, life: 0.12, s0: 1.2 * size, s1: 2.2 * size, a: 1, fadeIn: 0 });
    for (let i = 0; i < 8; i++) this.sprite({ p: p.clone().add(this.rv(0.3, 0.2, 0.3).multiplyScalar(size)), tex: 'glow', add: true, color, c1: 0x802010, v: this.rv(2, 1, 2).add(new THREE.Vector3(0, 1.8, 0)).multiplyScalar(size), life: 0.45 + Math.random() * 0.3, s0: 0.7 * size, s1: 1.4 * size, a: 0.95, drag: 3, fadeIn: 0 });
    this.smoke(p.clone().add(new THREE.Vector3(0, 0.3 * size, 0)), 9, 1.2 * size, 0x5d6168, 1.2 * size, 1.6 * size, 2.8);
    this.sparks(p, 16, 0xffc060, 6 * size, 0.6);
    this.ring(p, 0xffd28a, 2.8 * size, 0.45);
    this.light(p.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xff9a40, 12 * size, 0.3, 10 * size);
    for (let i = 0; i < 4; i++) this.solid(new THREE.Mesh(this.debrisGeo, this.debrisMat), p.clone().add(new THREE.Vector3(0, 0.2, 0)), this.rv(2.5, 0, 2.5).add(new THREE.Vector3(0, 3 + Math.random() * 2, 0)).multiplyScalar(size), 2, 0.3, 0.05, 10).m.scale.setScalar(0.5 + Math.random() * 0.6);
  }
  ring(p, color, R = 2, life = 0.5, y = 0.04) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(p.x, y, p.z); this.scene.add(m); this.rings.push({ m, life: 0, max: life, R });
  }
  // continuous emitters: fn(dt) called each frame while alive; returns emitter so actions can stop it
  emit(fn, rate, life = Infinity, tag = '') { const e = { fn, rate, acc: 0, life: 0, max: life, tag }; this.emitters.push(e); return e; }
  stop(tag) { this.emitters = this.emitters.filter((e) => e.tag !== tag); }
  clear() {
    for (const s of this.sprites) { s.visible = false; this.free.push(s); } this.sprites = [];
    for (const o of [...this.solids, ...this.lines, ...this.rings]) { o.m.parent && o.m.parent.remove(o.m); if (o.m.material !== this.casingMat && o.m.material !== this.debrisMat && o.m.material.dispose) o.m.material.dispose(); }
    for (const p of this.projectiles) { p.m.parent && p.m.parent.remove(p.m); if (p.glow) { p.glow.visible = false; } }
    for (const o of this.tweens) this.dropTween(o);
    this.solids = []; this.lines = []; this.rings = []; this.projectiles = []; this.emitters = []; this.tweens = [];
    for (const L of this.lights) { L.life = L.max; L.l.intensity = 0; }
  }
  get count() { return this.sprites.length + this.solids.length + this.lines.length + this.projectiles.length + this.tweens.length; }
  update(dt, cam) {
    this.t += dt;
    for (const e of this.emitters) { e.life += dt; e.acc += dt * e.rate; while (e.acc >= 1) { e.acc -= 1; e.fn(); } }
    this.emitters = this.emitters.filter((e) => e.life < e.max);
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i], u = s.userData; u.life += dt;
      if (u.life >= u.max) { s.visible = false; this.sprites.splice(i, 1); this.free.push(s); continue; }
      const k = u.life / u.max;
      u.v.multiplyScalar(Math.max(0, 1 - u.drag * dt)); u.v.y -= u.g * dt; s.position.addScaledVector(u.v, dt);
      const sc = u.s0 + (u.s1 - u.s0) * (1 - (1 - k) * (1 - k)); s.scale.set(sc, sc, 1);
      s.material.opacity = u.a * Math.min(1, u.fadeIn ? u.life / u.fadeIn : 1) * (1 - k) * (1 - k * 0.3);
      s.material.rotation += u.spin * dt;
      if (u.c1) s.material.color.copy(u.c0).lerp(u.c1, k);
    }
    for (let i = this.solids.length - 1; i >= 0; i--) {
      const o = this.solids[i]; o.life += dt;
      if (o.life >= o.max) { o.m.parent && o.m.parent.remove(o.m); this.solids.splice(i, 1); continue; }
      o.v.y -= 9.8 * dt; o.m.position.addScaledVector(o.v, dt);
      if (o.m.position.y < o.r) { o.m.position.y = o.r; if (o.v.y < 0) { o.v.y *= -o.bounce; o.v.x *= 0.6; o.v.z *= 0.6; o.w.multiplyScalar(0.5); } }
      o.m.rotation.x += o.w.x * dt; o.m.rotation.y += o.w.y * dt; o.m.rotation.z += o.w.z * dt;
      if (o.life > o.max - 0.3) o.m.scale.multiplyScalar(0.9);
    }
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const o = this.tweens[i]; o.life += dt;
      if (o.life >= o.max) { this.dropTween(o); this.tweens.splice(i, 1); continue; }
      const k = Math.min(1, o.life / o.dur), e = k * k * (3 - 2 * k);
      o.m.position.lerpVectors(o.p0, o.p1, k); o.m.position.y += o.arc * Math.sin(Math.PI * k);
      o.m.quaternion.slerpQuaternions(o.q0, o.q1, e);
      const fade = Math.min(1, (o.max - o.life) / 0.7);
      if (fade < 1) o.m.traverse((m) => { if (m.material) { m.material.transparent = true; m.material.opacity = fade; } });
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const o = this.lines[i]; o.life += dt; const k = o.life / o.max;
      if (k >= 1) { this.scene.remove(o.m); o.m.material.dispose(); this.lines.splice(i, 1); continue; }
      o.m.material.opacity = 1 - k; o.m.scale.x = o.m.scale.y = o.w * (1 - k * 0.5);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const o = this.rings[i]; o.life += dt; const k = o.life / o.max;
      if (k >= 1) { this.scene.remove(o.m); o.m.material.dispose(); this.rings.splice(i, 1); continue; }
      const r = o.R * (1 - (1 - k) ** 3); o.m.scale.set(r, 1, r); o.m.material.opacity = 1 - k;
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.t += dt; const k = Math.min(1, p.t / p.dur);
      _v.copy(p.a).lerp(p.b, k); _v.y += p.arc * 4 * k * (1 - k);
      if (p.kind === 'bolt') {
        p.m.position.copy(_v);
        if (p.glow) { p.glow.position.copy(_v); p.glow.userData.life = 0; }
      } else {
        p.m.position.copy(_v);
        if (p.spin) { p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.6 * dt; }
        else { const d = new THREE.Vector3().copy(_v).sub(p.last); if (d.lengthSq() > 1e-8) p.m.quaternion.setFromUnitVectors(Z, d.normalize()); }
        if (p.trail) { p.tacc = (p.tacc || 0) + dt * p.trail; while (p.tacc >= 1) { p.tacc -= 1; this.sprite({ p: _v.clone(), color: 0xd8dde3, life: 0.9, s0: 0.12, s1: 0.6, a: 0.55, drag: 2, g: -0.2 }); } }
        p.last.copy(_v);
      }
      if (k >= 1) {
        this.scene.remove(p.m); if (p.glow) { p.glow.userData.life = p.glow.userData.max; }
        if (p.kind === 'bolt') p.m.material.dispose();
        this.projectiles.splice(i, 1); if (p.onHit) p.onHit(p.b.clone());
      }
    }
    for (const L of this.lights) { L.life += dt; L.l.intensity = L.life < L.max ? L.I * (1 - L.life / L.max) : 0; }
  }
}
