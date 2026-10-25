// Arena engine for the 🥊 Combat demo and the 👥 Team demo.
// Every number that decides a fight comes from the ONE shared stats file (games/shared/army/stats.js, Conquest v2.3):
// HP, speed, weapon damage / range / fire rate / splash, aim (acc), cover + crouch + moving hit factors, trait behaviour (TRAIT_FX), mines.
// Arena distances are Conquest metres × SCALE so long-range weapons fit on a phone screen; speeds use the same scale.
// Magazines, reload and pickups come from stats.js MAGS (shared with Conquest's pickups flag). Gear (sidearm / explosive / gadget):
// arena-gear.js, same rules as Conquest gear.js. Taken out: flinch, knockback, onto its back, weapon drops, ~3 s down, fade (OUT_T).
import * as THREE from 'three';
import { OrbitControls } from '../vendor/addons/controls/OrbitControls.js?v=6';
import * as T from './trooper.js?v=7';
import { RigTemplate, Rig } from './demo-rig.js?v=8';
import { FX } from './demo-fx.js?v=8';
import { arenaPose, arenaTankPose, FIRE_PROFILES, OUT_T, dropWeapon } from './demo-actions.js?v=8';
import { S } from './army-data.js?v=8';
import { ArenaGear } from './arena-gear.js?v=8';

export const SCALE = 0.4;
const M = S.MAGS;   // magazines / reload / packs (shared stats.js)
export const DEMO = Object.freeze({ healthPack: M.healthPack, dummyAim: 0.6 });   // healthPack = alias of MAGS (combat.js toast)
const B = S.BATTLE;
const WICON = (i) => (S.ITEMS.trooper.weapon[i] || S.ITEMS.trooper.weapon[0]).i;
export { OUT_T };
export const ENEMY_NAT = Object.freeze({ p: '#9b2a22', s: '#23272e', suit: 0, sym: 3, sc: 0, vis: 1, glow: 1, name: 'Dummies', player: 'Training' });
const TAU = Math.PI * 2;
const angLerp = (a, b, k) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * k; };
const flat = (v) => new THREE.Vector3(v.x, 0, v.z);
// seeded RNG so a ?seed= run (and the tests) replay the same fight
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
function finish(p) { const o = { ...p }, lean = p.prx + p.trx; o.arx = p.arx - lean * (p.lvl ?? 1); o.hrx = p.hrx - lean * (p.hlv ?? 0.85); return o; }
const emojiTex = (() => { const cache = {}; return (txt, color = '#fff', w = 128) => cache[txt + color + w] || (cache[txt + color + w] = canvasTex(w, 64, (x) => {
  x.font = 'bold 44px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(txt, w / 2, 34); x.fillStyle = color; x.fillText(txt, w / 2, 34);
})); })();

export class Arena {
  constructor(app, opts = {}) {
    this.opts = opts; this.rand = rng(opts.seed || (Math.random() * 1e9) | 0);
    this.size = opts.size || [26, 30];
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    app.append(r.domElement); this.app = app;
    const sc = this.scene = new THREE.Scene(); sc.background = new THREE.Color(0x0b1029); sc.fog = new THREE.Fog(0x0b1029, 30, 70);
    sc.add(new THREE.HemisphereLight(0xcfe0ff, 0x30343c, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(8, 14, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 50 }); key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02; sc.add(key, key.target);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160);
    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.1; c.enablePan = false; c.minDistance = 4; c.maxDistance = 46; c.maxPolarAngle = Math.PI * 0.47;
    this.fx = new FX(sc); this.gear = new ArenaGear(this, SCALE); this.wreckMat = mat(0x2a2c30, { flatShading: true });
    this.units = []; this.covers = []; this.pickups = []; this.mines = []; this.flags = []; this.labels = [];
    this.time = 0; this.speed = 1; this.paused = false; this.cam = 'orbit'; this.follow = null; this.listeners = {};
    this.buildGround();
    this.resize(); addEventListener('resize', () => this.resize());
    if (window.visualViewport) visualViewport.addEventListener('resize', () => this.resize());
    let last = performance.now();
    r.setAnimationLoop((now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; this.frame(dt); });
  }
  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  emit(ev, ...a) { for (const f of this.listeners[ev] || []) f(...a); }
  resize() { const w = this.app.clientWidth || 1, h = this.app.clientHeight || 1; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  buildGround() {
    const [W, D] = this.size;
    const tex = canvasTex(128, 128, (x, w) => { x.fillStyle = '#2a313d'; x.fillRect(0, 0, w, w); x.fillStyle = '#323a48'; x.fillRect(3, 3, 60, 60); x.fillRect(67, 67, 58, 58); x.fillStyle = '#2e3542'; x.fillRect(67, 3, 58, 60); x.fillRect(3, 67, 60, 58); });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(W / 2, D / 2);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), mat(0xffffff, { map: tex })); g.receiveShadow = true; this.scene.add(g);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.02, D)), new THREE.LineBasicMaterial({ color: 0x6ff3ff, transparent: true, opacity: 0.35 })); edge.position.y = 0.01; this.scene.add(edge);
    const far = new THREE.Mesh(new THREE.CircleGeometry(90, 40).rotateX(-Math.PI / 2), mat(0x1a1f2a)); far.position.y = -0.02; this.scene.add(far);
  }
  // ---------- props ----------
  addCover(type, x, z, rot = 0) {
    const g = new THREE.Group(); let hx, hz, h;
    if (type === 'sandbags') { hx = 1.3; hz = 0.38; h = 0.85; for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - (row % 2); i++) { const m = shadowy(new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.32, 3, 8).rotateZ(Math.PI / 2), mat(row % 2 ? 0xa48d64 : 0x977f58))); m.position.set(-1.04 + i * 0.52 + (row % 2) * 0.26, 0.16 + row * 0.27, 0); m.scale.set(1, 0.9, 1.6); g.add(m); } }
    else if (type === 'wall') { hx = 1.6; hz = 0.2; h = 1.3; g.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, 0.4), mat(0x8c939c))).translateY(0.65)); g.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 0.5), mat(0x6c737c))).translateY(1.33)); }
    else if (type === 'barrels') { hx = 0.75; hz = 0.4; h = 1.0; for (const dx of [-0.38, 0.38]) { const m = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.0, 12), mat(dx < 0 ? 0x2f6d8f : 0x9b4b2a))); m.position.set(dx, 0.5, 0); g.add(m); } }
    else { type = 'crate'; hx = 0.6; hz = 0.6; h = 1.15; g.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.15, 1.2), mat(0x8a6a3e))).translateY(0.575)); g.add(new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.12, 1.22), mat(0x5e4626)).translateY(0.95)); }
    if (Math.abs(Math.sin(rot)) > 0.5) [hx, hz] = [hz, hx];
    g.rotation.y = rot; g.position.set(x, 0, z); this.scene.add(g);
    const cv = { type, pos: new THREE.Vector3(x, 0, z), hx, hz, h, mesh: g, icon: { sandbags: '🟫', wall: '🧱', barrels: '🛢️', crate: '📦' }[type] };
    this.covers.push(cv); return cv;
  }
  addPickup(kind, x, z, opt = {}) {
    const col = { health: 0xe74c3c, ammo: 0xf1c40f, weapon: 0x3498db }[kind];
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const box = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.5), mat(0xe9edf1))); box.position.y = 0.45; g.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.52), new THREE.MeshBasicMaterial({ color: col })); band.position.y = 0.45; g.add(band);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6 })); ring.position.y = 0.02; g.add(ring);
    const p = { kind, pos: new THREE.Vector3(x, 0, z), mesh: g, box, band, active: true, t: 0, weapon: opt.weapon ?? null };
    const icon = kind === 'health' ? '❤️' : kind === 'ammo' ? '📦' : WICON(p.weapon ?? 0);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(icon, '#fff', 64), depthWrite: false })); sp.scale.set(0.7, 0.7, 1); sp.position.y = 1.05; g.add(sp); p.sprite = sp; p.icon = icon;
    this.scene.add(g); this.pickups.push(p); return p;
  }
  addFlag(x, z, nat, team) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 6), mat(0xb8c0c8))).translateY(1.3));
    g.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.12, 10), mat(0x4a4f57))).translateY(0.06));
    const c = document.createElement('canvas'); c.width = 128; c.height = 84; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.66).translate(0.52, 0, 0), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })); cloth.position.y = 2.2; g.add(cloth);
    const f = { pos: new THREE.Vector3(x, 0, z), team, nat, tex, cloth, mesh: g, hold: 0 };
    this.paintFlag(f, nat); this.scene.add(g); this.flags.push(f); return f;
  }
  paintFlag(f, nat) { const x = f.tex.image.getContext('2d'); x.fillStyle = nat.s; x.fillRect(0, 0, 128, 84); x.strokeStyle = nat.p; x.lineWidth = 8; x.strokeRect(4, 4, 120, 76); T.drawSymbol(x, nat.sym, 64, 42, 28, T.symbolColor(nat)); f.tex.needsUpdate = true; f.owner = nat; }
  label(pos, txt, color = '#fff', life = 1.1) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(txt, color), depthWrite: false, transparent: true })); sp.scale.set(1.3, 0.65, 1); sp.position.copy(pos); sp.renderOrder = 9;
    this.scene.add(sp); this.labels.push({ sp, life: 0, max: life });
  }
  // ---------- units ----------
  addUnit(o) {
    const kind = o.kind || 'trooper', st = { ...o.st }, nat = o.nat;
    const stats = o.stats || S.combatStats(kind, st);
    const u = {
      id: o.id || 'x' + this.units.length, name: o.name || 'Unit', icon: o.icon || (kind === 'tank' ? '🚜' : '🪖'), kind, team: o.team, st, nat, stats, base: stats, enemy: !!o.enemy,
      hp: stats.hp, maxHp: stats.hp, pos: new THREE.Vector3(o.x, 0, o.z), home: new THREE.Vector3(o.x, 0, o.z), yaw: o.yaw ?? (o.team === 'A' ? 0 : Math.PI), hullYaw: o.yaw ?? 0, turret: 0,
      t: this.rand() * 5, dist: 0, move: 0, run: false, aim: 0, crouch: 0, shot: null, hit: null, down: null, reload: null, win: null, cd: 0.4 + this.rand() * 0.6,
      mag: 0, ammo: 0, reserve: 0, trait: o.trait || null, tfx: S.TRAIT_FX[o.trait] || null, role: o.role || 'fight', aimMul: o.aimMul ?? 1,
      cover: null, coverUntil: 0, goal: null, goalWhy: '', target: null, think: 0, lastHit: -99, lastShot: -99, wpn: kind === 'tank' ? st.gun : st.weapon, buff: null,
      hits: 0, shots: 0, downs: 0, taken: 0, dmgTaken: 0, dmgDealt: 0, mines: 0, healed: 0, mood: '🧍', entry: o.entry || null, state: 'idle',
    };
    this.setWeapon(u, u.wpn, true);
    this.buildRig(u); this.units.push(u); this.gear.init(u); return u;
  }
  buildRig(u) {
    if (u.rig) { this.scene.remove(u.rig.root); u.tpl.dispose(); }
    if (!u.look) { u.look = new T.TeamLook(); u.look.paint({ ...T.NATION_DEFAULT, ...u.nat, skin: u.kind === 'trooper' ? u.st.skin ?? 1 : 1, ...u.st }); }
    u.pistol = null; u.tpl = new RigTemplate(u.kind, u.st); u.rig = new Rig(u.tpl, u.look); u.rig.wreckMat = this.wreckMat; this.scene.add(u.rig.root);
  }
  setWeapon(u, w, init) {
    if (u.kind === 'tank') { u.mag = M.tankMag; } else { u.st.weapon = w; u.wpn = w; u.mag = M.mag[w] || M.magDefault; }
    const hp = u.hp, max = u.maxHp;
    u.stats = S.combatStats(u.kind, u.st); u.fire = FIRE_PROFILES[u.wpn] || FIRE_PROFILES[0];
    u.ammo = u.mag; u.reserve = u.mag * M.reserveMags; u.reload = null;
    if (!init) { u.maxHp = u.stats.hp; u.hp = Math.min(u.maxHp, hp * (u.maxHp / max)); this.buildRig(u); }
  }
  alive(u) { return u.down == null && u.hp > 0; }
  foes(u) { return this.units.filter((x) => x.team !== u.team && this.alive(x)); }
  friends(u) { return this.units.filter((x) => x.team === u.team && x !== u && this.alive(x)); }
  rangeOf(u) { return u.stats.range * SCALE; }
  speedOf(u) { return u.stats.speed * SCALE; }
  inCover(u) { return u.cover && u.pos.distanceTo(u.cover.spot) < 0.6; }
  ducked(u) { return this.inCover(u) && u.crouch > 0.6; }
  // cover spot = the far side of a cover object, seen from the threat
  coverSpot(cv, from) {
    const d = flat(cv.pos).sub(flat(from)); if (d.lengthSq() < 1e-4) d.set(0, 0, 1); d.normalize();
    const ext = Math.abs(d.x) * cv.hx + Math.abs(d.z) * cv.hz;
    return cv.pos.clone().addScaledVector(d, ext + 0.5);
  }
  findCover(u, threat, maxR) {
    let best = null, bs = Infinity; const R = this.rangeOf(u);
    for (const cv of this.covers) {
      const spot = this.coverSpot(cv, threat.pos), dMe = spot.distanceTo(u.pos), dT = spot.distanceTo(threat.pos);
      if (dMe > maxR || dT > R * 0.98 || dT < 2.5) continue;
      const taken = this.units.some((x) => x !== u && x.team === u.team && x.cover === cv && this.alive(x));
      const s = dMe + (taken ? 6 : 0) + Math.abs(dT - R * 0.7) * 0.3;
      if (s < bs) { bs = s; best = { cv, spot }; }
    }
    return best;
  }
  nearestPickup(u, kind) { let b = null, bd = Infinity; for (const p of this.pickups) if (p.active && p.kind === kind) { const d = p.pos.distanceTo(u.pos); if (d < bd) { bd = d; b = p; } } return b && { p: b, d: bd }; }
  // ---------- brain: Conquest TRAIT_FX numbers decide cover use, hold time, fighting on the move, nests, healing, mines, guarding, retaking ----------
  thinkUnit(u) {
    const foes = this.foes(u); u.target = null;
    if (!foes.length) { u.goal = null; u.cover = null; u.goalWhy = 'win'; return; }
    let tgt = null, td = Infinity; for (const f of foes) { const d = f.pos.distanceTo(u.pos); if (d < td) { td = d; tgt = f; } }
    u.target = tgt; const R = this.rangeOf(u), fx = u.tfx || S.TRAIT_FX.rusher;
    const set = (pos, why, cover = null) => { u.goal = pos ? flat(pos) : null; u.goalWhy = why; u.cover = cover; };
    if (u.enemy) { // training dummies: hold a cover spot or walk in
      if (u.role === 'hold' && u.cover && this.alive(tgt)) { u.cover.spot = this.coverSpot(u.cover.cv || u.cover, tgt.pos); set(u.cover.spot, 'cover', u.cover); return; }
      if (u.role === 'hold') { const c = this.findCover(u, tgt, 5); if (c) { u.cover = { ...c.cv, cv: c.cv, spot: c.spot }; set(c.spot, 'cover', u.cover); return; } }
      if (td > R * 0.8) set(tgt.pos, 'advance'); else set(null, 'fight'); return;
    }
    if (u.kind === 'tank') { if (td > R * 0.75) set(tgt.pos, 'advance'); else set(null, 'fight'); return; }
    // 🎒 explosive job first: carry a ⏰ time bomb to the enemy post / close in to place a 🧨 detpack (arena-gear.js)
    { const gw = this.gear.want(u, tgt); if (gw) return set(gw.pos, gw.why); }
    // needs first: health, ammo, weapon packs
    if (this.opts.pickups !== false) {
      const hp = u.hp / u.maxHp, out = u.ammo + u.reserve === 0;
      const H = this.nearestPickup(u, 'health'); if (H && (hp < 0.45 || (hp < 0.8 && H.d < 4))) return set(H.p.pos, 'health');
      const A = this.nearestPickup(u, 'ammo'); if (A && (out || (u.reserve < u.mag && A.d < 6))) return set(A.p.pos, 'ammo');
      const Wp = this.nearestPickup(u, 'weapon'); if (Wp && !u.buff && Wp.d < 9 && Wp.p.weapon !== u.wpn) return set(Wp.p.pos, 'weapon');
      if (out) { set(u.home, 'retreat'); return; }
    }
    // supplier: walk to a hurt friend and patch them up
    if (fx.heal) { const hurt = this.friends(u).filter((f) => f.hp / f.maxHp < 0.7 && f.pos.distanceTo(u.pos) < fx.seekR * SCALE * 1.4).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (hurt) { if (hurt.pos.distanceTo(u.pos) > fx.healR * SCALE) return set(hurt.pos, 'heal'); u.healTarget = hurt; } else u.healTarget = null; }
    // guard: stay by our flag
    const own = this.flags.find((f) => f.team === u.team), theirs = this.flags.find((f) => f.team !== u.team);
    if (fx.guard && own) { if (u.pos.distanceTo(own.pos) > 3) { const c = this.findCover(u, tgt, 4); return c && c.spot.distanceTo(own.pos) < 4 ? set(c.spot, 'guard', { ...c.cv, cv: c.cv, spot: c.spot }) : set(own.pos, 'guard'); } if (td > R) return set(null, 'guard'); }
    // retaker: go flip the enemy flag
    if (fx.retakeHot && theirs && theirs.owner !== u.nat) return set(theirs.pos, 'retake');
    // sniper nest: keep far back, crouched
    if (fx.nest) { const want = R * 0.92; if (td < fx.nestNear * SCALE * 0.6 || td > R) { const dir = flat(u.pos).sub(flat(tgt.pos)).normalize(); return set(flat(tgt.pos).addScaledVector(dir, want), 'nest'); } return set(null, 'nest'); }
    // mine layer: plant along the way in (TRAIT_FX.mines per life)
    if (fx.mines && u.mines < fx.mines && td < R * 1.3 && u.state !== 'plant' && this.time - (u.lastMine || -9) > 2.2) { u.plantT = 0; u.lastMine = this.time; }
    // cover: TRAIT_FX.cover is the chance to take cover, hold = seconds to stay
    if (u.cover && this.time < u.coverUntil && this.alive(tgt)) { const spot = this.coverSpot(u.cover.cv, tgt.pos); if (spot.distanceTo(tgt.pos) <= R) { u.cover.spot = spot; return set(spot, 'cover', u.cover); } }
    if (!u.coverRoll || this.time > u.coverRoll) {
      u.coverRoll = this.time + fx.hold + 1;
      if (this.rand() < fx.cover) { const c = this.findCover(u, tgt, fx.coverR * SCALE + 6); if (c) { u.coverUntil = this.time + fx.hold + 2 + c.spot.distanceTo(u.pos) / Math.max(0.5, this.speedOf(u)); return set(c.spot, 'cover', { cv: c.cv, spot: c.spot }); } }
    }
    const close = fx.fight > 0.6 ? 0.55 : 0.8;
    if (td > R * close) set(tgt.pos, 'advance'); else set(null, 'fight');
  }
  // ---------- shooting: Conquest sim.fire hit chance + damage ----------
  fireAt(u, tgt) {
    const w = u.stats, d = u.pos.distanceTo(tgt.pos) / SCALE;
    let chance = w.acc * u.aimMul * Math.max(0.05, 1 - B.rangeFalloff * d / w.range) + this.gear.spotBonus(u);
    const tCover = this.inCover(tgt);
    if (tCover) chance *= B.hitInCover; else if (tgt.crouch > 0.5) chance *= B.hitCrouch;
    if (tgt.move > 0.3) chance *= B.hitMoving;
    const blocked = this.ducked(tgt), hit = !blocked && this.rand() < chance;
    u.shots++; u.shot = 0; u.lastShot = this.time; u.ammo--;
    const from = u.kind === 'tank' ? u.rig.world('muzzles', u.shots) : u.rig.world('muzzle');
    const aimP = tgt.rig.world(tgt.kind === 'tank' ? 'hullTop' : 'chest');
    let to = aimP.clone();
    if (blocked) to = tgt.cover.cv.pos.clone().setY(tgt.cover.cv.h * 0.85).lerp(aimP, 0.2);
    else if (!hit) to.add(new THREE.Vector3((this.rand() - 0.5) * 2.2, (this.rand() - 0.3) * 1.2, (this.rand() - 0.5) * 2.2));
    const dir = to.clone().sub(from).normalize();
    const col = u.kind === 'tank' ? 0xffb060 : new THREE.Color(T.VISOR[u.nat.vis] || '#5ee8ff').getHex();
    const fx = this.fx; fx.muzzle(from, dir, col, u.kind === 'tank' ? 2 : u.fire.big || 1);
    const dmg = () => w.dmg * (B.dmgSpread[0] + this.rand() * (B.dmgSpread[1] - B.dmgSpread[0]));
    const land = (p) => {
      if (w.splash) { fx.explosion(p.clone().setY(Math.max(0.3, p.y)), Math.min(2, 0.6 + w.splash * 0.25)); this.splash(u, p, w.splash * SCALE, w.dmg, hit ? tgt : null); }
      else if (blocked) { fx.sparks(p, 8, 0xffe0a0, 2.5, 0.3); fx.smoke(p, 1, 0.4, 0xa89c88, 0.3, 0.2, 0.8); this.emit('blocked', tgt, u); }
      else if (hit) this.damage(tgt, dmg(), u, p);
      else fx.sparks(p.clone().setY(0.05), 3, 0xffd27a, 1.5, 0.2);
      if (hit && w.splash && this.alive(tgt)) this.damage(tgt, dmg(), u, p);
    };
    if (u.kind === 'tank' || w.weapon === 'rocket') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(u.kind === 'tank' ? 0.1 : 0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
      fx.lob(m, from, to, from.distanceTo(to) / 22, u.kind === 'tank' ? 0.3 : 0.15, (p) => { land(p); m.geometry.dispose(); m.material.dispose(); }, 30, 0);
    } else if (w.laser) { fx.tracer(from, to, col, 0.2, 0.05); fx.tracer(from, to, 0xffffff, 0.1, 0.018); land(to); }
    else if (w.id === 'shotgun') { for (let i = 0; i < 5; i++) fx.tracer(from, to.clone().add(fx.rv(0.4, 0.3, 0.4)), 0xffe6a0, 0.07, 0.015); land(to); }
    else fx.bolt(from, to, col, 50, 0.55, land);
    if (u.ammo <= 0 && u.reserve > 0) u.reload = 0;
    this.emit('shot', u, tgt, hit);
  }
  splash(u, p, r, base, skip) {
    for (const x of this.units) {
      if (x.team === u.team || !this.alive(x) || x === skip) continue;
      const d = x.pos.distanceTo(flat(p)); if (d > r) continue;
      let dm = base * (1 - B.splashFalloff * d / r); if (this.ducked(x)) dm *= B.splashDuckInCover;
      this.damage(x, dm, u, x.rig.world(x.kind === 'tank' ? 'hullTop' : 'chest'));
    }
  }
  damage(x, amount, by, p) {
    if (!this.alive(x)) return;
    amount *= this.gear.takenMul(x);
    x.hp -= amount; x.taken++; x.dmgTaken += amount; x.hit = 0; x.lastHit = this.time; if (by) { by.hits++; by.dmgDealt += amount; }
    this.fx.hitPuff(p || x.pos.clone().setY(1.2), amount > 30 ? 2 : 1);
    this.label((p || x.pos).clone().setY(2.3 + this.rand() * 0.3), '−' + Math.round(amount), x.enemy ? '#ffd27a' : '#ff8a7a');
    if (x.hp <= 0) {
      x.hp = 0; x.down = 0; x.goal = null; x.cover = null; x.reload = null; x.side = null; x.dropped = false; if (by) by.downs++;
      if (x.kind === 'trooper') { this.gear.holster(x); if (by && by.pos) x.yaw = Math.atan2(by.pos.x - x.pos.x, by.pos.z - x.pos.z); }   // faces the shooter, knocked back away from it
      this.fx.smoke(x.pos.clone().setY(0.8), 8, 1.1, 0x8d939a, 0.7, 0.5, 2.4);
      if (x.kind === 'tank') { this.fx.explosion(x.rig.world('hullTop'), 1.5); this.fx.emit(() => this.fx.smoke(x.rig.world('deck'), 1, 0.9, 0x3a3d42, 1.2, 0.3, 2.5), 6, 6, 'wreck' + x.id); }
      this.emit('down', x, by);
    } else this.emit('hit', x, by, amount);
  }
  heal(x, amount, by) { if (!this.alive(x)) return; const before = x.hp; x.hp = Math.min(x.maxHp, x.hp + amount); if (by) by.healed += x.hp - before; if (x.hp > before + 0.5) this.label(x.pos.clone().setY(2.3), '➕' + Math.round(x.hp - before), '#7dffa0', 0.8); }
  respawn(u, x, z) {
    u.hp = u.maxHp = u.stats.hp; u.down = null; u.hit = null; u.reload = null; u.win = null; u.cover = null; u.goal = null; u.mines = 0; u.buff = null;
    if (u.baseWpn != null && u.wpn !== u.baseWpn) this.setWeapon(u, u.baseWpn);
    u.ammo = u.mag; u.reserve = u.mag * M.reserveMags; u.pos.set(x ?? u.home.x, 0, z ?? u.home.z); u.rig.root.visible = true; u.side = null; u.dropped = false; u.plantT = null; u.plantGear = null;
    if (u.kind === 'trooper') { u.yaw = u.team === 'A' ? 0 : Math.PI; this.gear.init(u); }
    if (u.kind === 'tank') { u.rig.setWreck(false, this.wreckMat); this.fx.stop('wreck' + u.id); }
    this.fx.ring(u.pos.clone(), 0x6ff3ff, 1.4, 0.6); this.emit('respawn', u);
  }
  // ---------- per-frame ----------
  step(dt) {
    this.time += dt;
    for (const u of this.units) {
      u.t += dt; for (const k of ['shot', 'hit', 'down']) if (u[k] != null) u[k] += dt; if (u.win != null) u.win += dt;
      if (u.down != null) { u.move = 0;
        if (u.kind === 'trooper') { if (!u.dropped && u.down > OUT_T.drop) { u.dropped = true; dropWeapon({ rig: u.rig, fx: this.fx }); } if (u.down > OUT_T.fade) u.rig.root.visible = false; }
        continue; }
      if (u.reload != null) { u.reload += dt / M.reload; if (u.reload >= 1) { const n = Math.min(u.mag, u.reserve); u.ammo = n; u.reserve -= n; u.reload = null; } }
      if (u.plantT != null) { u.plantT += dt; u.state = 'plant'; u.move = Math.max(0, u.move - dt * 6); u.crouch += (1 - u.crouch) * Math.min(1, dt * 8);
        if (u.plantT > B.mine.plant) { u.plantT = null; u.mines++; this.addMine(u, u.plantGear); u.plantGear = null; } this.pose(u, dt); continue; }
      u.think -= dt; if (u.think <= 0) { u.think = 0.35 + this.rand() * 0.15; this.thinkUnit(u); }
      const tgt = u.target && this.alive(u.target) ? u.target : null, R = this.rangeOf(u);
      const tDist = tgt ? tgt.pos.distanceTo(u.pos) : Infinity, inRange = tDist <= R;
      // move toward goal (steer around cover objects + friends)
      let moving = false;
      if (u.goal) {
        const to = u.goal.clone().sub(u.pos); to.y = 0; const d = to.length();
        if (d > 0.25) {
          const dir = to.normalize(), steer = dir.clone();
          for (const cv of this.covers) { const dx = u.pos.x - cv.pos.x, dz = u.pos.z - cv.pos.z, px = Math.max(0, Math.abs(dx) - cv.hx), pz = Math.max(0, Math.abs(dz) - cv.hz), dd = Math.hypot(px, pz);
            if (dd < 0.7) { const push = (0.7 - dd) / 0.7 * 2.2; steer.x += Math.sign(dx) * (px > 0 || Math.abs(dx) / cv.hx > Math.abs(dz) / cv.hz ? 1 : 0) * push; steer.z += Math.sign(dz) * (pz > 0 || Math.abs(dz) / cv.hz >= Math.abs(dx) / cv.hx ? 1 : 0) * push; } }
          for (const f of this.units) if (f !== u && this.alive(f)) { const v = u.pos.clone().sub(f.pos); v.y = 0; const l = v.length(); if (l < 0.75 && l > 1e-3) steer.addScaledVector(v.normalize(), (0.75 - l) * 2); }
          { const n = steer.length(); if (n < 1e-3 || steer.dot(dir) / n < 0.25) { steer.x += dir.z * 0.9; steer.z -= dir.x * 0.9; } }   // pushed straight back by a wall: slide along it
          steer.normalize();
          const fight = tgt && inRange && (u.tfx ? this.rand() < u.tfx.fight * dt * 8 || u.aim > 0.5 : u.enemy);
          u.run = u.kind === 'trooper' && d > 3 && !(tgt && inRange) && u.goalWhy !== 'nest';
          const sp = this.speedOf(u) * (u.run ? 1 : 0.7) * (fight ? 0.6 : 1) * (u.crouch > 0.5 ? 0.5 : 1);
          const stepL = Math.min(d, sp * dt); u.pos.addScaledVector(steer, stepL); u.dist += stepL; moving = true;
          u.pos.x = THREE.MathUtils.clamp(u.pos.x, -this.size[0] / 2 + 0.5, this.size[0] / 2 - 0.5); u.pos.z = THREE.MathUtils.clamp(u.pos.z, -this.size[1] / 2 + 0.5, this.size[1] / 2 - 0.5);
          if (!(tgt && inRange && u.aim > 0.4)) u.yaw = angLerp(u.yaw, Math.atan2(steer.x, steer.z), Math.min(1, dt * 8));
          if (u.kind === 'tank') u.hullYaw = angLerp(u.hullYaw, Math.atan2(steer.x, steer.z), Math.min(1, dt * 2.5));
        } else if (u.goalWhy === 'retake') this.retake(u, dt);
      }
      u.move += ((moving ? 1 : 0) - u.move) * Math.min(1, dt * 7);
      // pickups
      for (const p of this.pickups) if (p.active && p.pos.distanceTo(u.pos) < 0.7 && !u.enemy && u.kind === 'trooper' && !(p.kind === 'weapon' && p.weapon === u.wpn)) this.take(u, p);
      // mines
      for (const m of this.mines) if (!m.done && m.armed && m.team !== u.team && m.pos.distanceTo(u.pos) < B.mine.r * SCALE) this.boom(m);
      // supplier heal pulse
      if (u.tfx && u.tfx.heal) { u.healAcc = (u.healAcc || 0) + dt; if (u.healAcc > 1) { u.healAcc = 0; for (const f of this.friends(u)) if (f.pos.distanceTo(u.pos) < u.tfx.healR * SCALE * 1.5 && f.hp < f.maxHp) { this.heal(f, u.tfx.healHp * 2, u); this.fx.sparks(f.pos.clone().setY(1.4), 5, 0x7dffa0, 1.2, 0.4); } } }
      // regen out of combat (Conquest CFG.regen)
      if (this.time - u.lastHit > 6 && this.time - u.lastShot > 4 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * B.regen * dt * 0.5);
      // aim + fire
      const ready = tgt && inRange && u.reload == null && u.ammo > 0;
      if (tgt && inRange) { const want = Math.atan2(tgt.pos.x - u.pos.x, tgt.pos.z - u.pos.z); if (u.kind === 'tank') u.turret = angLerp(u.turret, want - u.hullYaw, Math.min(1, dt * 4)); else u.yaw = angLerp(u.yaw, want, Math.min(1, dt * 7)); }
      const inCov = this.inCover(u), nest = u.goalWhy === 'nest' && !moving;
      // in cover: stay ducked, pop up for the shot
      let crouchWant = inCov ? (ready && u.cd < 0.45 ? 0 : 1) : nest ? 1 : 0;
      if (u.kind === 'trooper') u.crouch += (crouchWant - u.crouch) * Math.min(1, dt * 7);
      u.aim += ((ready || (tgt && inRange) ? 1 : 0) - u.aim) * Math.min(1, dt * 6);
      u.cd -= dt;
      const canShoot = ready && u.cd <= 0 && (u.kind === 'tank' || u.aim > 0.7) && (!inCov || u.crouch < 0.35) && (!moving || u.enemy || (u.tfx && this.rand() < u.tfx.fight + 0.15) || u.kind === 'tank');
      if (canShoot) { const sp = B.rofSpread; u.cd = u.stats.rof * (sp[0] + this.rand() * (sp[1] - sp[0])); this.fireAt(u, tgt); }
      else if (u.cd <= 0 && ready && moving) u.cd = 0.2;
      // 🔸 sidearm while the main weapon reloads / is empty · 🎒 explosive + gadget (arena-gear.js)
      if (u.gear) {
        const sideOn = tgt && (u.reload != null || u.ammo + u.reserve === 0) && this.gear.sidearm(u, tgt, dt);
        if (sideOn) u.side = (u.side ?? 0) + dt; else if (u.side != null) { u.side = null; this.gear.holster(u); }
        this.gear.step(u, dt, tgt, inRange);
      }
      if (!this.foes(u).length && !u.enemy && u.win == null && this.units.some((x) => x.enemy)) u.win = 0;
      if (this.foes(u).length) u.win = null;
      u.state = u.down != null ? 'down' : u.reload != null ? 'reload' : inCov ? 'cover' : nest ? 'nest' : moving ? (u.run ? 'run' : 'walk') : u.aim > 0.5 ? 'aim' : 'idle';
      this.pose(u, dt);
    }
    for (const u of this.units) if (u.down != null) this.pose(u, dt);
    this.gear.update(dt);
    // pickups respawn + bob
    for (const p of this.pickups) {
      p.t += dt; if (!p.active && p.t > M.respawn) { p.active = true; p.mesh.visible = true; this.fx.ring(p.pos.clone(), 0xffffff, 0.8, 0.4); }
      if (p.active) { p.box.rotation.y += dt; p.band.rotation.y = p.box.rotation.y; p.sprite.position.y = 1.05 + 0.08 * Math.sin(p.t * 3); }
    }
    for (const m of this.mines) if (!m.armed && this.time - m.t0 > B.mine.arm) { m.armed = true; m.light.material.color.set(0xff3b30); }
    this.mines = this.mines.filter((m) => !m.done);
  }
  pose(u, dt) {
    if (u.kind === 'tank') {
      const p = arenaTankPose({ t: u.t, turret: u.turret, move: u.move, shot: u.shot, hit: u.hit, wreck: u.down != null });
      p.x = u.pos.x; p.z = u.pos.z; p.yaw = u.hullYaw; u.rig.apply(p);
    } else {
      const p = arenaPose({ t: u.t, aim: u.aim, crouch: u.crouch, move: u.move, dist: u.dist, run: u.run, shot: u.shot, fire: u.fire, hit: u.hit, reload: u.side != null ? null : u.reload, side: u.side, down: u.down, win: u.win });
      p.x = u.pos.x; p.z = u.pos.z; p.yaw = u.yaw; u.rig.apply(finish(p));
    }
  }
  take(u, p) {
    p.active = false; p.t = 0; p.mesh.visible = false; this.fx.ring(p.pos.clone(), 0xffffff, 1, 0.4); this.fx.sparks(p.pos.clone().setY(0.6), 10, 0xffffff, 2, 0.4);
    if (p.kind === 'health') { this.heal(u, M.healthPack); }
    else if (p.kind === 'ammo') { u.reserve = u.mag * M.reserveMags; if (u.ammo === 0) u.reload = 0; this.label(u.pos.clone().setY(2.3), '📦 +' + u.reserve, '#ffe27a'); }
    else if (p.kind === 'weapon' && p.weapon != null) { if (u.baseWpn == null) u.baseWpn = u.wpn; this.setWeapon(u, p.weapon); u.buff = p.weapon; this.label(u.pos.clone().setY(2.3), p.icon + ' ' + S.ITEMS.trooper.weapon[p.weapon].n, '#9fd6ff', 1.4);
      p.weapon = (p.weapon + 1 + Math.floor(this.rand() * 5)) % 6; p.icon = WICON(p.weapon); p.sprite.material.map = emojiTex(p.icon, '#fff', 64); }
    this.emit('pickup', u, p);
  }
  addMine(u, ex) {   // ex: the ⚠️ mines explosive (its damage + blast), else the trait mine (B.mine)
    const g = new THREE.Group(); g.position.copy(u.pos).addScaledVector(new THREE.Vector3(Math.sin(u.yaw), 0, Math.cos(u.yaw)), 0.6);
    g.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.07, 10), mat(0x4a5340))).translateY(0.035));
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0x55ff77 })); light.position.y = 0.08; g.add(light);
    this.scene.add(g); this.mines.push({ pos: g.position.clone(), team: u.team, owner: u, mesh: g, light, t0: this.time, armed: false, dmg: ex ? ex.dmg : B.mine.dmg, splash: ex ? ex.splash : B.mine.splash });
    this.label(g.position.clone().setY(1.2), ex ? '⚠️' : '💣', '#fff', 0.8); this.emit('mine', u);
  }
  boom(m) {
    m.done = true; this.scene.remove(m.mesh); this.fx.explosion(m.pos.clone().setY(0.2), 1.2);
    for (const x of this.units) if (x.team !== m.team && this.alive(x)) { const d = x.pos.distanceTo(m.pos), r = m.splash * SCALE; if (d < r) this.damage(x, m.dmg * (1 - B.splashFalloff * d / r), m.owner, x.pos.clone().setY(0.8)); }
  }
  retake(u, dt) {
    const f = this.flags.find((x) => x.team !== u.team); if (!f || f.owner === u.nat) return;
    f.hold += dt; if (f.hold > 2) { f.hold = 0; this.paintFlag(f, u.nat); this.fx.ring(f.pos.clone(), 0x7dffa0, 2, 0.6); this.label(f.pos.clone().setY(3), '🚩 taken!', '#7dffa0', 1.4); this.emit('flag', u, f); }
  }
  reset() {
    this.gear.clear();
    for (const u of this.units) { this.scene.remove(u.rig.root); u.tpl.dispose(); u.look.tex.dispose(); u.look.team.dispose(); u.look.visor.dispose(); }
    for (const m of this.mines) this.scene.remove(m.mesh);
    for (const l of this.labels) { this.scene.remove(l.sp); l.sp.material.dispose(); }
    this.units = []; this.mines = []; this.labels = []; this.fx.clear();
    for (const p of this.pickups) { p.active = true; p.mesh.visible = true; p.t = 0; }
  }
  // ---------- camera ----------
  setCam(mode, follow) {
    this.cam = mode; if (follow !== undefined) this.follow = follow;
    const c = this.controls, [W, D] = this.size, aspect = this.camera.aspect || 1;
    const fit = Math.max(D * 0.62, (W * 0.62) / Math.min(1, aspect));
    if (mode === 'top') { c.target.set(0, 0, 0); this.camera.position.set(0, fit * 1.45, 0.01); }
    else if (mode === 'side') { c.target.set(0, 0.5, 0); this.camera.position.set(fit * 1.05, fit * 0.42, 0); }
    else if (mode === 'follow' && this.follow) { const u = this.follow; c.target.copy(u.pos).setY(1); this.camera.position.copy(u.pos).add(new THREE.Vector3(-Math.sin(u.yaw) * 5, 3.2, -Math.cos(u.yaw) * 5)); }
    else { this.cam = 'orbit'; c.target.set(0, 0.5, 1); this.camera.position.set(fit * 0.55, fit * 0.7, -fit * 0.95); }
    c.update();
  }
  frame(dt) {
    const sdt = this.paused ? 0 : dt * this.speed;
    if (sdt > 0) { this.step(sdt); this.emit('tick', sdt); }
    this.fx.update(sdt, this.camera);
    for (const l of this.labels) { l.life += sdt; l.sp.position.y += sdt * 0.9; l.sp.material.opacity = Math.max(0, 1 - l.life / l.max); }
    this.labels = this.labels.filter((l) => { if (l.life < l.max) return true; this.scene.remove(l.sp); l.sp.material.dispose(); return false; });
    if (this.cam === 'follow' && this.follow) {
      const u = this.follow, want = u.pos.clone().setY(1); this.controls.target.lerp(want, 1 - Math.exp(-dt * 5));
      const back = new THREE.Vector3(-Math.sin(u.yaw) * 5, 3.2, -Math.cos(u.yaw) * 5).add(u.pos); this.camera.position.lerp(back, 1 - Math.exp(-dt * 1.5));
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
  // test + tooling: run the sim fast without rendering
  fast(seconds, h = 1 / 30) { for (let t = 0; t < seconds; t += h) { this.step(h); this.emit('tick', h); this.fx.update(h, this.camera); } }
}
export function stateOf(u) { return { id: u.id, name: u.name, team: u.team, kind: u.kind, hp: Math.round(u.hp), maxHp: Math.round(u.maxHp), speed: +u.stats.speed.toFixed(2), dmg: +u.stats.dmg.toFixed(1), range: u.stats.range, state: u.state, why: u.goalWhy, trait: u.trait, wpn: u.wpn, ammo: u.ammo, reserve: u.reserve, hits: u.hits, shots: u.shots, downs: u.downs, taken: u.taken, dmgTaken: Math.round(u.dmgTaken), healed: Math.round(u.healed), mines: u.mines, x: +u.pos.x.toFixed(2), z: +u.pos.z.toFixed(2), down: u.down != null, side: u.side != null, gear: u.gear ? { side: u.gear.side.id, expl: u.gear.ex.id, gadget: u.gear.gd.id, explLeft: u.gear.exLeft, gadgetUsed: u.gear.gdUsed } : null }; }
