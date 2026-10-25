// Small demo: your BattleShip vs a target ship. Turrets aim + fire, enemy shots hit your shield (bubble flash) or hull
// (sparks), the hangar launches SpaceShips / trooper pods. Numbers come from battleshipStats().
// setCrafts(kit): kit from spacecraft.js = the player's real SpaceShips (Dev B's models + stats); null = our own small craft.
import * as THREE from 'three';
import { buildShip, disposeTree, SHIELD_REST } from './ship3d.js?v=1';
import { battleshipStats } from './battleship-stats.js?v=1';

const tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3();
export function createDemo(root) {
  let kit = null, devBLaunches = 0, on = false, me = null, foe = null, t = 0, st = null, fx = [], timers = {}, hud = { hp: 1, shield: 1 }, hp = 0, sh = 0, launches = 0, flashes = 0, hullHits = 0, shots = 0, foeFlashes = 0;
  const grp = new THREE.Group(); root.add(grp);
  const boltGeo = new THREE.BoxGeometry(0.5, 0.06, 0.06), sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const craftGeo = new THREE.ConeGeometry(0.14, 0.42, 4), podGeo = new THREE.CapsuleGeometry(0.08, 0.18, 2, 6);
  function clear() { for (const f of fx) grp.remove(f.m), drop(f.m); fx = []; if (me) grp.remove(me), disposeTree(me); if (foe) grp.remove(foe), disposeTree(foe); me = foe = null; }
  const drop = (m) => { if (m.material) m.material.dispose(); }; // Dev B craft share cached geometry/materials: just remove them
  function start(ship, colors) {
    clear(); on = true; t = 0; launches = 0; devBLaunches = 0; flashes = 0; foeFlashes = 0; hullHits = 0; shots = 0; st = battleshipStats(ship);
    me = buildShip(ship.parts, colors, { shield: 'demo' }); grp.add(me);
    foe = buildShip({ hull: 'frigate', armor: 'plated', shield: 'basic', guns: 'pulse', hangar: 'none', engine: 'ion' }, { primary: '#8a2a2a', secondary: '#ff6b5a' }, { shield: 'demo' });
    foe.rotation.y = Math.PI; grp.add(foe);
    hp = st.hp; sh = st.shield; timers = { foe: 0.8, hangar: 1.0, turrets: me.userData.turrets.map((_, i) => 0.2 + i * 0.15) };
  }
  function stop() { on = false; clear(); }
  function add(m, o) { grp.add(m); fx.push({ m, ...o }); }
  function sparks(at, color, n = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(at); add(m, { kind: 'spark', v: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), life: 0.5, max: 0.5 });
    }
  }
  function bolt(from, to, color, kind, speed) {
    const m = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color })); m.position.copy(from);
    const v = to.clone().sub(from).normalize().multiplyScalar(speed); m.lookAt(to); m.rotateY(Math.PI / 2);
    add(m, { kind, v, target: to.clone(), life: from.distanceTo(to) / speed });
  }
  const SEP = () => 7 + (me ? me.userData.L : 4) * 0.6;
  function tick(dt) {
    if (!on) return;
    t += dt;
    const mv = Math.min(1.6, 0.4 + st.speed / 120);
    me.position.set(-SEP() / 2, Math.sin(t * 0.6) * 0.5, Math.sin(t * 0.45 * mv) * 2.2);
    me.rotation.set(Math.sin(t * 0.45 * mv) * 0.12, 0, Math.cos(t * 0.45 * mv) * 0.06);
    foe.position.set(SEP() / 2, Math.cos(t * 0.5) * 0.4, Math.sin(t * 0.33 + 1) * 1.8);
    for (const e of me.userData.engines) e.scale.setScalar(0.8 + 0.35 * Math.random() * mv);
    const foeC = foe.getWorldPosition(new THREE.Vector3()), meC = me.getWorldPosition(new THREE.Vector3());
    // turrets: aim (yaw in each turret's own frame) + fire at rate
    me.userData.turrets.forEach((tr, i) => {
      tmpV.copy(foeC); tr.node.worldToLocal(tmpV); tr.head.rotation.y = Math.atan2(-tmpV.z, tmpV.x);
      timers.turrets[i] -= dt;
      if (timers.turrets[i] <= 0) {
        timers.turrets[i] = Math.max(0.35, 1 / st.gunRof) * (0.85 + Math.random() * 0.3);
        shots++; tr.muzzles.forEach((mz, k) => { if (k > 1 && st.weapon !== 'missile') return; mz.getWorldPosition(tmpW); bolt(tmpW.clone(), foeC.clone().add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.8)), BOLT[st.weapon], 'mine', st.weapon === 'missile' ? 9 : st.weapon === 'rail' ? 40 : 20); });
      }
    });
    // enemy shoots back
    timers.foe -= dt;
    if (timers.foe <= 0) { timers.foe = 1.1; const f = foeC.clone().add(new THREE.Vector3(-1.5, 0.2, 0)); bolt(f, meC.clone().add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6)), 0xff3b3b, 'foe', 16); }
    // hangar
    if (st.launchRate > 0 && me.userData.hangar) {
      timers.hangar -= dt;
      if (timers.hangar <= 0 && fx.filter((f) => f.kind === 'craft').length < 6) {
        timers.hangar = Math.max(1.2, 1 / st.launchRate) * 0.6;
        const troop = st.troopers > 0 && (st.hangarSlots === 0 || launches % 2 === 1); launches++;
        let m, life = 3.2, devB = false;
        if (!troop && kit) { m = kit.make(devBLaunches++); devB = true; const sp = m.userData.ship.stats && m.userData.ship.stats.spaceSpeed; if (sp) life = Math.max(2.2, Math.min(4.2, 3.2 * 10 / sp)); }
        else m = new THREE.Mesh(troop ? podGeo : craftGeo, new THREE.MeshStandardMaterial({ color: troop ? 0xd8dde4 : 0x6ff3ff, flatShading: true, emissive: troop ? 0x222222 : 0x0d4450 }));
        me.userData.hangar.getWorldPosition(tmpW); m.position.copy(tmpW);
        add(m, { kind: 'craft', troop, devB, life, max: life, from: tmpW.clone(), side: me.userData.hangar.position.z >= 0 ? 1 : -1, ph: Math.random() * 6 });
      }
    }
    // shield regen
    if (st.shield > 0 && timers.lastHit !== undefined && t - timers.lastHit > 1.5) sh = Math.min(st.shield, sh + st.shieldRegen * dt * 3);
    const shM = me.userData.shield;
    if (shM) { shM.material.opacity += (SHIELD_REST.demo - shM.material.opacity) * Math.min(1, dt * 5); shM.visible = sh > 0; }
    const foeSh = foe.userData.shield; if (foeSh) foeSh.material.opacity += (SHIELD_REST.demo - foeSh.material.opacity) * Math.min(1, dt * 5); // same light edge glow as yours
    // effects
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.life -= dt;
      if (f.kind === 'spark') { f.m.position.addScaledVector(f.v, dt); f.m.material.opacity = Math.max(0, f.life / f.max); }
      else if (f.kind === 'mine' || f.kind === 'foe') {
        f.m.position.addScaledVector(f.v, dt);
        if (f.life <= 0) {
          if (f.kind === 'mine') { sparks(f.m.position, 0xffd27a, 4); if (foeSh) { foeSh.material.opacity = 0.35; foeFlashes++; } }
          else hitMe(f.m.position);
        }
      } else if (f.kind === 'craft') {
        const k = 1 - f.life / f.max; // fly out sideways, then curve to the enemy
        const out = f.from.clone().add(new THREE.Vector3(0, f.troop ? -1.2 : 0.4, f.side * 2.2));
        const p = k < 0.35 ? f.from.clone().lerp(out, k / 0.35) : out.clone().lerp(foeC.clone().add(new THREE.Vector3(Math.cos(t * 3 + f.ph) * 1.2, Math.sin(t * 2 + f.ph) * 0.8, Math.sin(t * 3 + f.ph) * 1.2)), (k - 0.35) / 0.65);
        f.m.lookAt(p); if (!f.devB) f.m.rotateX(Math.PI / 2); f.m.position.copy(p); // Dev B ships: nose is +Z, lookAt points +Z
        if (f.life <= 0) sparks(p, f.troop ? 0xffffff : 0x6ff3ff, 3);
      }
      if (f.life <= 0) { grp.remove(f.m); drop(f.m); fx.splice(i, 1); }
    }
    hud.hp = st.hp ? hp / st.hp : 0; hud.shield = st.shield ? sh / st.shield : 0;
  }
  function hitMe(at) {
    const dmg = 0.07 * (st.hp + st.shield); timers.lastHit = t;
    if (sh > 0) { flashes++; sh = Math.max(0, sh - dmg); const s = me.userData.shield; if (s) { s.material.opacity = 0.35; } sparks(at, 0x7fd8ff, 5); }
    else { hullHits++; hp -= dmg * (1 - st.armor / 100); sparks(at, 0xff8a3c, 7); if (hp <= 0) { hp = st.hp; sh = st.shield; } }
  }
  return {
    start, stop, tick, get on() { return on; }, hud, group: grp, setCrafts(k) { kit = k || null; }, get craftNames() { return kit ? kit.ships.map((s) => s.name) : []; }, get restShield() { return { me: me && me.userData.shield ? me.userData.shield.userData.base : null, foe: foe && foe.userData.shield ? foe.userData.shield.userData.base : null, target: SHIELD_REST.demo }; }, get foeShieldOpacity() { return foe && foe.userData.shield ? foe.userData.shield.material.opacity : null; }, get foeFlashes() { return foeFlashes; }, get shieldOpacity() { return me && me.userData.shield ? me.userData.shield.material.opacity : null; }, get craftSource() { return kit ? kit.source : 'own'; },
    get counts() { return { bolts: fx.filter((f) => f.kind === 'mine').length, foeBolts: fx.filter((f) => f.kind === 'foe').length, crafts: fx.filter((f) => f.kind === 'craft').length, sparks: fx.filter((f) => f.kind === 'spark').length, launches, devBLaunches, devBInFlight: fx.filter((f) => f.devB).length, shots, shieldFlashes: flashes, hullHits };  },
  };
}
const BOLT = { laser: 0xff4a4a, pulse: 0xffd84a, missile: 0xff9a3c, rail: 0x7fe6ff, lance: 0xc77dff };
