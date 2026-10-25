// 🎬 Demo: the ship flies in and lands, troopers board (one per seat), it lifts off, fires at a drone,
// takes hits (🛡️ shield absorbs first, then ❤️ hull), then leaves for space. Plain three.js, ~15 s.
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), ease = (t) => t * t * (3 - 2 * t);
const boltGeo = new THREE.BoxGeometry(0.07, 0.07, 0.6);

export class Demo {
  // ctx: { scene, camera, controls, field, stars, ship: () => built ship {root, shield, flames, muzzles}, stats, crew: [names], colors: {primary, secondary}, hud(state), onEnd() }
  constructor(ctx) { this.ctx = ctx; this.running = false; this.objs = []; }
  start() {
    const c = this.ctx, st = c.stats;
    this.stop(true);
    this.running = true; this.t = 0; this.phase = 'fly';
    this.hp = st.hp; this.sh = st.shield; this.maxHp = st.hp; this.maxSh = st.shield;
    this.seats = st.seats; this.crew = c.crew.slice(0, st.seats); this.boarded = 0; this.lastName = '';
    this.shots = 0; this.hits = 0; this.log = [];
    const g = new THREE.Group(); c.scene.add(g); this.g = g;
    // troopers: one per crew name, standing in a line to the right of the landing spot
    const body = new THREE.MeshStandardMaterial({ color: c.colors.primary, roughness: 0.6, flatShading: true });
    const helm = new THREE.MeshStandardMaterial({ color: c.colors.secondary, roughness: 0.5, flatShading: true });
    const vis = new THREE.MeshBasicMaterial({ color: 0x6ff3ff });
    this.mats = [body, helm, vis];
    this.troops = this.crew.map((name, i) => {
      const t = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.26, 2, 6), body); b.position.y = 0.27; t.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), helm); h.position.y = 0.58; t.add(h);
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.04), vis); v.position.set(0, 0.59, 0.1); t.add(v);
      t.position.set(3.2 + i * 0.55, 0, 1.6); t.rotation.y = -Math.PI / 2; t.visible = false; g.add(t);
      return { obj: t, name, t0: 2.0 + i * 0.5 };
    });
    this.tBoard = 2.0 + this.troops.length * 0.5 + 0.9;
    // enemy drones
    const red = new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0x401010, roughness: 0.4, flatShading: true }); this.mats.push(red);
    this.enemy = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), red); this.enemy.position.set(0, 3, 15); this.enemy.visible = false; g.add(this.enemy);
    this.enemy2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), red); this.enemy2.position.set(-8, 5, 9); this.enemy2.visible = false; g.add(this.enemy2);
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff }); this.badBolt = new THREE.MeshBasicMaterial({ color: 0xff6b5a }); this.mats.push(this.boltMat, this.badBolt);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd65a, transparent: true, opacity: 0, depthWrite: false })); g.add(this.flash); this.mats.push(this.flash.material);
    this.bolts = [];
    // camera
    c.controls.enabled = false; c.controls.autoRotate = false;
    c.field.visible = true; c.stars.visible = false;
    // (the editor's camera follows the ship each frame and frames it above the status strip)
    const s = c.ship(); s.root.position.set(-14, 7, -12); s.root.rotation.set(0, 0, 0);
    this.shFlashes = 0;
    this.tFire = this.tBoard + 1.0; this.tHit = this.tFire + 2.2; this.tSpace = this.tHit + 2.4; this.tEnd = this.tSpace + 2.4;
    this.hud();
  }
  hud(extra) { const c = this.ctx; c.hud({ phase: this.phase, hp: this.hp, maxHp: this.maxHp, sh: this.sh, maxSh: this.maxSh, boarded: this.boarded, seats: this.seats, crew: this.troops.length, name: this.lastName, ...extra }); }
  bolt(from, to, mat, onHit) { const m = new THREE.Mesh(boltGeo, mat); m.position.copy(from); m.lookAt(to); this.g.add(m); this.bolts.push({ m, from: from.clone(), to: to.clone(), t: 0, onHit }); }
  // damage: shield first, then hull
  damage(n) {
    const s = this.ctx.ship(); let absorbed = 0;
    if (this.sh > 0) { absorbed = Math.min(this.sh, n); this.sh -= absorbed; n -= absorbed; s.shield.children[0].material.uniforms.uFlash.value = 1; this.shFlash = 0.4; this.shFlashes = (this.shFlashes || 0) + 1; }
    if (n > 0) { this.hp = Math.max(1, this.hp - n); this.shake = 0.35; this.flash.position.copy(s.root.position); this.flash.scale.setScalar(0.6); this.flash.material.opacity = 0.8; }
    this.log.push({ absorbed, hull: n }); this.hits++; this.hud();
  }
  update(dt) {
    if (!this.running) return;
    const c = this.ctx, s = c.ship(), r = s.root; this.t += dt; const t = this.t;
    for (const f of s.flames) f.scale.z = f.userData.base * (this.phase === 'space' ? 3 : 1.2) * (0.85 + Math.random() * 0.3);
    if (t < 1.8) { const k = ease(t / 1.8); r.position.set(lerp(-14, 0, k), lerp(7, 0.8, k), lerp(-12, 0, k)); r.rotation.y = lerp(0.75, 0, k); r.rotation.z = lerp(-0.4, 0, k); }
    else if (t < this.tBoard) {
      if (this.phase !== 'board') { this.phase = 'board'; this.hud(); }
      r.position.y = 0.8 + Math.sin(t * 3) * 0.03;
      for (const tr of this.troops) {
        const k = (t - tr.t0) / 1.1; tr.obj.visible = k > -0.6 && k < 1;
        if (k > -0.6 && k < 1) { const kk = clamp(k); tr.obj.position.x = lerp(3.2 + this.troops.indexOf(tr) * 0.25, 0.7, kk); tr.obj.position.z = lerp(1.6, 0.1, kk); tr.obj.scale.setScalar(kk > 0.8 ? 1 - (kk - 0.8) * 4 : 1); tr.obj.position.y = Math.abs(Math.sin(t * 12)) * 0.05; }
        if (k >= 1 && !tr.in) { tr.in = true; tr.obj.visible = false; this.boarded++; this.lastName = tr.name; this.hud(); }
      }
    } else if (t < this.tFire) {
      if (this.phase !== 'lift') { this.phase = 'lift'; for (const tr of this.troops) if (!tr.in) { tr.in = true; tr.obj.visible = false; this.boarded++; } this.hud(); }
      const k = ease((t - this.tBoard) / (this.tFire - this.tBoard)); r.position.y = lerp(0.8, 3, k); this.enemy.visible = true; this.enemy.position.y = 3 + Math.sin(t * 2) * 0.2;
    } else if (t < this.tHit) {
      if (this.phase !== 'fire') { this.phase = 'fire'; this.hud(); this.nextShot = this.tFire; }
      r.position.y = 3 + Math.sin(t * 2.5) * 0.05; this.enemy.rotation.y += dt * 2;
      if (this.shots < 4 && t >= this.nextShot) {
        this.shots++; this.nextShot += 0.4; const to = this.enemy.position.clone();
        for (const m of s.muzzles) { const p = new THREE.Vector3(); m.getWorldPosition(p); this.bolt(p, to, this.boltMat, () => { this.enemy.material.emissive.setHex(0xffffff); setTimeout(() => this.enemy && this.enemy.material.emissive.setHex(0x401010), 80); }); }
      }
      if (this.shots >= 4 && t > this.nextShot + 0.3 && this.enemy.visible) { this.enemy.visible = false; this.flash.position.copy(this.enemy.position); this.flash.scale.setScalar(0.3); this.flash.material.opacity = 1; }
    } else if (t < this.tSpace) {
      if (this.phase !== 'hit') { this.phase = 'hit'; this.hud(); this.enemy2.visible = true; this.nextHit = this.tHit + 0.2; this.hitN = 0; this.hitDmg = Math.max(30, Math.ceil((this.maxSh + this.maxHp * 0.3) / 4)); }
      r.position.y = 3 + Math.sin(t * 2.5) * 0.05; this.enemy2.rotation.y += dt * 2;
      if (this.hitN < 4 && t >= this.nextHit) { this.hitN++; this.nextHit += 0.45; this.bolt(this.enemy2.position.clone(), r.position.clone(), this.badBolt, () => this.damage(this.hitDmg)); }
    } else if (t < this.tEnd) {
      if (this.phase !== 'space') { this.phase = 'space'; this.enemy2.visible = false; c.field.visible = false; c.stars.visible = true; this.hud(); }
      const k = (t - this.tSpace) / (this.tEnd - this.tSpace); r.position.z = lerp(0, 22, k * k); r.position.y = 3 + k * 1.5; r.rotation.z = Math.sin(t * 3) * 0.15;
    } else { this.stop(); return; }
    // bolts
    for (const b of this.bolts.slice()) { b.t += dt / 0.35; b.m.position.lerpVectors(b.from, b.to, Math.min(1, b.t)); if (b.t >= 1) { this.g.remove(b.m); this.bolts.splice(this.bolts.indexOf(b), 1); b.onHit && b.onHit(); } }
    if (this.flash.material.opacity > 0) { this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 2.5); this.flash.scale.multiplyScalar(1 + dt * 3); }
    if (this.shFlash > 0) { this.shFlash = Math.max(0, this.shFlash - dt); s.shield.children[0].material.uniforms.uFlash.value = this.shFlash / 0.4; } // hit flash fades out
    if (this.shake > 0) { this.shake -= dt; r.position.x = (Math.random() - 0.5) * 0.15; } else if (this.phase !== 'space') r.position.x = 0;
  }
  stop(silent) {
    if (!this.g) { this.running = false; return; }
    const c = this.ctx, s = c.ship();
    this.running = false; c.scene.remove(this.g);
    this.g.traverse((m) => { if (m.isMesh && m.geometry !== boltGeo) m.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
    this.g = null; this.bolts = [];
    if (s) { s.root.position.set(0, 0, 0); s.root.rotation.set(0, 0, 0); s.shield.children[0].material.uniforms.uFlash.value = 0; this.shFlash = 0; }
    c.controls.enabled = true;
    if (!silent) c.onEnd({ hp: this.hp, sh: this.sh, boarded: this.boarded, shots: this.shots, hits: this.hits, log: this.log });
  }
}
