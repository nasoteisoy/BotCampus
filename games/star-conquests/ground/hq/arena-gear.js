// 🎒 Loadout in the Combat + Team arenas: sidearm, explosive and gadget, with the same rules + numbers as
// Conquest's gear.js (games/shared/army/stats.js SIDEARMS / EXPLOSIVES / GADGETS / TANK_RULES). Metres × SCALE.
//   🔸 sidearm    fires while the main weapon reloads or is empty
//   🤾 thermal    thrown at a seen enemy in range (steps in to throwing range when healthy), explodes after the fuse · ×count per life, cooldown cd
//   ⚠ mines      planted where it stands when enemies are near (mine rules, the explosive's damage + blast)
//   🧨 detpack    placed on a tank, an enemy group or a dug-in enemy in range (closes in to place it), set off after the fuse (×detpackMul vs tanks)
//   ⏰ time bomb  carried to the enemy post (Team: their flag · Combat: the dummies' line), planted, explodes after the fuse
//   🗼 turret     deployed once per life on the first fight: shoots enemies in range for life s
//   🛰 bot      deployed once per life on first sight: follows, shoots, allies near it aim better (spotAcc)
//   🎒 jetpack    speed (stats) + a jet trail · 🔧 fusion cutter: repairs allied tanks + turrets close by
//   📦 supply     crate: heals allies in r and refills their spare magazines · 📣 rally: allies in r take less damage
import * as THREE from '../../vendor/three.module.min.js';
import { S } from './army-data-stub.js';
import { pistolMesh, chargeMesh, turretMesh, botMesh } from './demo-actions.js';

const SIDE = S.SIDEARMS, EXPL = S.EXPLOSIVES, GAD = S.GADGETS, TR = S.TANK_RULES, B = S.BATTLE;
const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const disposeObj = (o) => o.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
function crateMesh() {
  const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.45), mat(0x3c6b45)).translateY(0.2));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.08, 0.47), mat(0xe9edf1)).translateY(0.3));
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0x5dff7a })); l.position.set(0, 0.45, 0); g.add(l); g.userData.led = l; return g;
}
function rallyMesh(r) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), mat(0xc9ced6)).translateY(0.8));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.02), mat(0xffd23a)).translateY(1.4).translateX(0.26));
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.08, r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.45, depthWrite: false })); ring.position.y = 0.03; g.add(ring);
  return g;
}

export class ArenaGear {
  constructor(arena, scale) { this.a = arena; this.k = scale; this.things = []; this.used = { side: 0, thermal: 0, mines: 0, detpack: 0, 'time-bomb': 0, turret: 0, 'recon-bot': 0, supply: 0, rally: 0, repair: 0, jet: 0 }; }
  // per life (addUnit + respawn): the unit's saved loadout
  init(u) {
    u.gear = null; if (u.kind !== 'trooper' || u.enemy) return;
    const st = u.st, side = SIDE[st.side | 0] || SIDE[0], ex = EXPL[st.expl | 0] || EXPL[0], gd = GAD[st.gadget | 0] || GAD[0];
    u.gear = { side, ex, exLeft: ex.count, exT: 1.5 + this.a.rand() * 1.5, gd, gdUsed: false, sideT: 0 };
    if (u.pistol) { u.rig.clearProps(); u.pistol = null; }
  }
  enemyPost(u) {   // Team: the enemy flag · Combat: the dummies' post pad (opts.post) · else where the enemies started
    const f = this.a.flags.find((x) => x.team !== u.team); if (f) return f.pos;
    if (this.a.post && this.a.post.team !== u.team) return this.a.post.pos;
    const hs = this.a.units.filter((x) => x.team !== u.team); if (!hs.length) return null;
    const p = new THREE.Vector3(); for (const x of hs) p.add(x.home); return p.multiplyScalar(1 / hs.length).setY(0);
  }
  // where the explosive wants the unit to go (null = no change): Conquest plants the time bomb while taking a post
  want(u, tgt) {
    const g = u.gear; if (!g || g.exLeft <= 0 || u.hp < u.maxHp * (g.ex.id === 'time-bomb' ? 0.3 : 0.5)) return null;
    if (g.ex.id === 'time-bomb') { const post = this.enemyPost(u); if (post && u.pos.distanceTo(post) > 2) return { pos: post, why: 'bomb' }; }
    if (g.ex.id === 'thermal' && tgt && g.exT < 1 && u.hp > u.maxHp * 0.6 && u.pos.distanceTo(tgt.pos) > g.ex.range * this.k * 0.9) return { pos: tgt.pos, why: 'throw' };   // steps in to throwing range
    if (g.ex.id === 'detpack' && tgt && this.detpackOk(u, tgt) && u.pos.distanceTo(tgt.pos) > g.ex.range * this.k * 0.8) return { pos: tgt.pos, why: 'detpack' };
    return null;
  }
  // detpack target: a tank, an enemy group (2+ within 4 m) or one dug in behind cover
  detpackOk(u, tgt) { return tgt.kind === 'tank' || this.a.inCover(tgt) || this.a.foes(u).filter((e) => e.pos.distanceTo(tgt.pos) < 4 * this.k).length >= 2; }
  // a post pad on the ground (Combat: the dummies' post, the ⏰ time bomb's target)
  addPost(x, z, team, color = 0xff5a3c) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.04, 28), new THREE.MeshLambertMaterial({ color: 0x2a2f38 })).translateY(0.02));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color })); ring.position.y = 0.05; g.add(ring);
    this.a.scene.add(g); this.a.post = { pos: g.position, team, mesh: g }; return this.a.post;
  }
  // bonus hit chance for u (and turrets) near a friendly recon bot
  spotBonus(u) { for (const t of this.things) if (t.kind === 'recon-bot' && t.team === u.team && t.pos.distanceTo(u.pos) < t.g.spotR * this.k) return t.g.spotAcc; return 0; }
  // damage multiplier for x standing in a friendly rally zone
  takenMul(x) { for (const t of this.things) if (t.kind === 'rally' && t.team === x.team && t.pos.distanceTo(x.pos) < t.g.r * this.k) return t.g.dmgTaken; return 1; }
  // main weapon can't fire: the sidearm does (Conquest gear.sidearm)
  sidearm(u, tgt, dt) {
    const g = u.gear, a = this.a; if (!g || !tgt) return false;
    const d = u.pos.distanceTo(tgt.pos) / this.k; if (d > g.side.range) return false;
    if (!u.pistol) u.pistol = u.rig.attach(pistolMesh(g.side.id), 'handR');
    if ((g.sideT -= dt) > 0) return true;
    g.sideT = g.side.rof * (0.85 + 0.3 * a.rand());
    let p = u.stats.acc * u.aimMul * (1 - 0.45 * d / g.side.range) * (tgt.move > 0.3 ? 0.9 : 1) * (a.inCover(tgt) ? 0.7 : tgt.crouch > 0.5 ? 0.85 : 1) + this.spotBonus(u);
    const blocked = a.ducked(tgt), hit = !blocked && a.rand() < p;
    const from = u.pistol.userData.muzzle.getWorldPosition(new THREE.Vector3()), aimP = tgt.rig.world(tgt.kind === 'tank' ? 'hullTop' : 'chest');
    const to = hit ? aimP : blocked ? tgt.cover.cv.pos.clone().setY(tgt.cover.cv.h * 0.85) : aimP.clone().add(new THREE.Vector3((a.rand() - 0.5) * 2, (a.rand() - 0.3), (a.rand() - 0.5) * 2));
    const col = 0xffb347; a.fx.muzzle(from, to.clone().sub(from).normalize(), col, 0.5);
    a.fx.bolt(from, to, col, 50, 0.4, (pp) => { if (hit) a.damage(tgt, g.side.dmg * (0.85 + 0.3 * a.rand()) * (tgt.kind === 'tank' ? TR.armorMul : 1), u, pp); else a.fx.sparks(pp, 3, 0xffd27a, 1.5, 0.2); });
    u.shots++; u.lastShot = a.time; this.used.side++; a.emit('gear', u, 'side');
    return true;
  }
  holster(u) { if (u.pistol) { u.rig.clearProps(); u.pistol = null; } }
  add(kind, u, g, mesh, pos, o = {}) { mesh.position.copy(pos); mesh.traverse((m) => { if (m.isMesh) m.castShadow = true; }); this.a.scene.add(mesh); const t = { kind, team: u.team, by: u, g, mesh, pos: mesh.position, t: this.a.time, fireT: 0.6, hp: g.hp || 0, ...o }; this.things.push(t); return t; }
  side(u) { return new THREE.Vector3(Math.cos(u.yaw), 0, -Math.sin(u.yaw)); }
  fwd(u) { return new THREE.Vector3(Math.sin(u.yaw), 0, Math.cos(u.yaw)); }
  // per unit per step (alive, not planting)
  step(u, dt, tgt, inRange) {
    const g = u.gear, a = this.a, k = this.k; if (!g) return;
    const foes = a.foes(u), friends = a.friends(u);
    // ----- explosive -----
    if (g.exLeft > 0 && (g.exT -= dt) <= 0) {
      const ex = g.ex, d = tgt ? u.pos.distanceTo(tgt.pos) / k : Infinity, post = this.enemyPost(u);
      if (ex.id === 'thermal' && tgt && d < ex.range && d > 3) { this.throwAt(u, tgt.pos, ex, 1, 'thermal'); g.exLeft--; g.exT = ex.cd; }
      else if (ex.id === 'detpack' && tgt && d < ex.range) {
        if (this.detpackOk(u, tgt)) { this.throwAt(u, tgt.pos, ex, tgt.kind === 'tank' ? TR.detpackMul : 1, 'detpack'); g.exLeft--; g.exT = ex.cd; } else g.exT = 0.6;
      } else if (ex.id === 'time-bomb' && post && u.pos.distanceTo(post) < 6 * k) {
        const m = chargeMesh(0x4a5058, 0xffd23a); this.add('time-bomb', u, ex, m, u.pos.clone(), { T: ex.fuse, blink: (q) => 1.5 + 10 * q });
        a.label(u.pos.clone().setY(1.6), 'Time ' + ex.fuse + ' s', '#ffd23a', 1); this.used['time-bomb']++; g.exLeft--; g.exT = ex.cd; a.emit('gear', u, 'time-bomb');
      } else if (ex.id === 'mines' && tgt && d < ex.splash * 4 + 10 && u.plantT == null && !a.mines.some((m) => m.pos.distanceTo(u.pos) < 3 * k)) {
        u.plantT = 0; u.plantGear = ex; this.used.mines++; g.exLeft--; g.exT = ex.cd; a.emit('gear', u, 'mines');
      } else g.exT = 0.6;
    }
    // ----- gadget -----
    const gd = g.gd;
    if (gd.use === 'deploy' && !g.gdUsed) {
      const want = gd.id === 'turret' ? !!tgt && inRange : gd.id === 'recon-bot' ? !!tgt : gd.id === 'supply' ? (u.hp < u.maxHp * 0.6 || u.reserve < u.mag || friends.some((f) => f.hp < f.maxHp * 0.6 && f.pos.distanceTo(u.pos) < gd.r * k)) : gd.id === 'rally' ? !!tgt && inRange : false;
      if (want) this.deploy(u, gd);
    } else if (gd.id === 'fusion-cutter') {
      const R = gd.repairR * k;
      for (const f of friends) if (f.kind === 'tank' && f.hp < f.maxHp && f.pos.distanceTo(u.pos) < R) { const h = Math.min(f.maxHp - f.hp, gd.repairHp * dt); f.hp += h; this.used.repair += h; if ((u.fixT = (u.fixT || 0) - dt) <= 0) { u.fixT = 0.5; a.fx.sparks(f.rig.world('hullTop'), 6, 0x8ff0ff, 1.6, 0.35); a.label(f.pos.clone().setY(2.4), 'Fix +' + Math.round(gd.repairHp * 0.5), '#8ff0ff', 0.7); } }
      for (const t of this.things) if (t.kind === 'turret' && t.team === u.team && t.hp < t.g.hp && t.pos.distanceTo(u.pos) < R) { t.hp = Math.min(t.g.hp, t.hp + gd.repairHp * dt); this.used.repair += gd.repairHp * dt; }
    } else if (gd.id === 'jetpack' && u.run && u.move > 0.5) {
      if ((u.jetT = (u.jetT || 0) - dt) <= 0) { u.jetT = 0.06; const p = u.rig.world('back'); a.fx.sparks(p, 1, 0x8fd8ff, 0.8, 0.25); this.used.jet++; }
    }
  }
  deploy(u, gd) {
    const a = this.a, k = this.k; u.gear.gdUsed = true; this.used[gd.id]++;
    const at = u.pos.clone().addScaledVector(this.side(u), 0.7).addScaledVector(this.fwd(u), 0.3);
    if (gd.id === 'turret') { const m = turretMesh(); m.rotation.y = u.yaw; this.add('turret', u, gd, m, at); a.label(at.clone().setY(1.4), 'turret', '#9fd6ff', 1); }
    else if (gd.id === 'recon-bot') { const m = botMesh(); this.add('recon-bot', u, gd, m, u.pos.clone().setY(2.1)); a.label(u.pos.clone().setY(2.6), 'bot', '#9fd6ff', 1); }
    else if (gd.id === 'supply') { const m = crateMesh(); this.add('supply', u, gd, m, at, { blink: 1.2 }); a.fx.ring(at.clone(), 0x5dff7a, gd.r * k, 0.9); a.label(at.clone().setY(1.2), 'supply', '#7dffa0', 1); }
    else if (gd.id === 'rally') { const m = rallyMesh(gd.r * k); this.add('rally', u, gd, m, u.pos.clone()); a.fx.ring(u.pos.clone(), 0xffd23a, gd.r * k, 0.8); a.label(u.pos.clone().setY(2.4), 'rally!', '#ffd23a', 1.2); }
    a.fx.ring(at.clone(), 0x6ff3ff, 0.8, 0.4); a.emit('gear', u, gd.id);
  }
  throwAt(u, pos, ex, tankMul, kind) {
    const a = this.a, from = u.rig.world('handL'), to = pos.clone().setY(0.15);
    const m = kind === 'detpack' ? chargeMesh(0x8a5a2b, 0xff3a2a) : new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshLambertMaterial({ color: 0x8a95a3, emissive: 0x331100 }));
    const flight = Math.max(0.35, Math.min(ex.fuse * 0.6, from.distanceTo(to) / 9));
    a.fx.lob(m, from, to, flight, 0.5, (p) => {
      if (m.geometry) { m.geometry.dispose(); m.material.dispose(); } else disposeObj(m);
      const c = kind === 'detpack' ? chargeMesh(0x8a5a2b, 0xff3a2a) : new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshLambertMaterial({ color: 0x8a95a3 }));
      this.add(kind, u, ex, c, p.clone().setY(0.05), { T: Math.max(0.15, ex.fuse - flight), blink: kind === 'detpack' ? 4 : 8, tankMul });
    }, 0, 12);
    u.shot = 0; this.used[kind]++; a.label(u.pos.clone().setY(2.3), kind === 'detpack' ? 'Detpack' : 'Throw', '#fff', 0.7); a.emit('gear', u, kind);
  }
  blast(t) {
    const a = this.a, k = this.k, R = t.g.splash * k, p = t.pos.clone();
    a.fx.explosion(p.clone().setY(0.3), Math.min(2.2, 0.8 + t.g.splash * 0.25)); a.fx.ring(p, 0xffd28a, R, 0.6);
    for (const x of a.units) if (x.team !== t.team && a.alive(x)) { const d = x.pos.distanceTo(p); if (d < R) { let dm = t.g.dmg * (1 - B.splashFalloff * d / R); if (a.ducked(x)) dm *= B.splashDuckInCover; if (x.kind === 'tank') dm *= t.tankMul || 1; a.damage(x, dm, t.by, x.rig.world(x.kind === 'tank' ? 'hullTop' : 'chest')); } }
    for (const o of this.things) if (o !== t && o.team !== t.team && o.hp > 0) { const d = o.pos.distanceTo(p); if (d < R) o.hp -= t.g.dmg * (1 - 0.6 * d / R); }
  }
  nearestFoe(o, range) { let best = null, bd = range; for (const e of this.a.units) if (e.team !== o.team && this.a.alive(e)) { const d = e.pos.distanceTo(o.pos); if (d < bd) { bd = d; best = e; } } return best; }
  shootFrom(t, mz, e, chance, dmg, color) {
    const a = this.a, from = mz.getWorldPosition(new THREE.Vector3()), aimP = e.rig.world(e.kind === 'tank' ? 'hullTop' : 'chest'), hit = !a.ducked(e) && a.rand() < chance;
    const to = hit ? aimP : aimP.clone().add(new THREE.Vector3((a.rand() - 0.5) * 2, a.rand() - 0.3, (a.rand() - 0.5) * 2));
    a.fx.muzzle(from, to.clone().sub(from).normalize(), color, 0.5);
    a.fx.bolt(from, to, color, 50, 0.45, (pp) => { if (hit && a.alive(e)) a.damage(e, dmg * (e.kind === 'tank' ? TR.armorMul : 1), t.by, pp); });
  }
  // deployed things (once per arena step)
  update(dt) {
    const a = this.a, k = this.k, now = a.time;
    for (const t of this.things) {
      const age = now - t.t;
      if (t.blink && t.mesh.userData.led) { const hz = typeof t.blink === 'function' ? t.blink(Math.min(1, age / (t.T || 1))) : t.blink; t.ph = (t.ph || 0) + dt * hz; t.mesh.userData.led.visible = t.ph % 1 < 0.5; }
      if (t.T != null) { if (age >= t.T) { t.done = true; this.blast(t); } continue; }
      if ((t.g.hp && t.hp <= 0) || age > t.g.life || (t.kind === 'recon-bot' && !a.alive(t.by))) { t.done = true; if (t.g.hp && t.hp <= 0) a.fx.explosion(t.pos.clone().setY(0.4), 0.7); else a.fx.smoke(t.pos.clone().setY(0.4), 3, 0.5, 0x9aa1a8, 0.4, 0.2, 1); continue; }
      if (t.kind === 'turret') {
        const e = this.nearestFoe(t, t.g.range * k); if (!e) continue;
        const head = t.mesh.userData.head, want = Math.atan2(e.pos.x - t.pos.x, e.pos.z - t.pos.z) - t.mesh.rotation.y; head.rotation.y += (want - head.rotation.y) * Math.min(1, dt * 6);
        if ((t.fireT -= dt) <= 0) { t.fireT = t.g.rof; this.shootFrom(t, t.mesh.userData.mz, e, 0.55 + this.spotBonus(t), t.g.dmg, 0x7fd8ff); }
      } else if (t.kind === 'recon-bot') {
        const o = t.by, ang = now * 1.3; t.pos.set(o.pos.x + Math.cos(ang) * 0.9, 2.0 + 0.1 * Math.sin(now * 3), o.pos.z + Math.sin(ang) * 0.9);
        const e = this.nearestFoe(t, t.g.range * k); if (e) t.mesh.lookAt(e.pos.clone().setY(1.2));
        if (e && (t.fireT -= dt) <= 0) { t.fireT = t.g.rof; this.shootFrom(t, t.mesh.userData.mz, e, 0.5, t.g.dmg, 0x6ff3ff); }
        if ((t.ringT = (t.ringT || 0) - dt) <= 0) { t.ringT = 2; a.fx.ring(o.pos.clone(), 0x6ff3ff, t.g.spotR * k * 0.5, 0.8); }
      } else if (t.kind === 'supply') {
        for (const x of [t.by, ...a.friends(t.by)]) {
          if (!a.alive(x) || x.kind !== 'trooper' || x.pos.distanceTo(t.pos) > t.g.r * k) continue;
          if (x.hp < x.maxHp) { const h = Math.min(x.maxHp - x.hp, t.g.healHp * dt); x.hp += h; t.by.healed += h; if ((x.supT = (x.supT || 0) - dt) <= 0) { x.supT = 1; a.label(x.pos.clone().setY(2.3), '+' + t.g.healHp, '#7dffa0', 0.7); } }
          if (t.g.ammo && x.reserve < x.mag * S.MAGS.reserveMags) { x.reserve = x.mag * S.MAGS.reserveMags; if (x.ammo === 0 && x.reload == null) x.reload = 0; a.label(x.pos.clone().setY(2.5), 'refill', '#ffe27a', 0.8); }
        }
      } else if (t.kind === 'rally') {
        const q = age / t.g.life, ring = t.mesh.children[2]; if (ring) ring.material.opacity = 0.45 * (1 - q) + 0.1;
      }
    }
    if (this.things.some((t) => t.done)) this.things = this.things.filter((t) => { if (!t.done) return true; a.scene.remove(t.mesh); disposeObj(t.mesh); return false; });
  }
  clear() { for (const t of this.things) { this.a.scene.remove(t.mesh); disposeObj(t.mesh); } this.things = []; for (const u of this.a.units) if (u.pistol) { u.rig.clearProps(); u.pistol = null; } }
  list() { return this.things.map((t) => ({ kind: t.kind, team: t.team, by: t.by.id, hp: Math.round(t.hp), age: +(this.a.time - t.t).toFixed(2) })); }
}
