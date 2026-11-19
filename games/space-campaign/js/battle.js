// Convoy battle: the Space Carrier fighter loop (launch, fly, shoot, fly home, land) against pirate raiders.
// Flight, landing, particles, audio and feel are the Space Carrier modules; campaign tech changes the fight:
// lasers = faster guns, missiles = homing shots, shields = more hits you can take, fighters/bombers in the fleet = wingmen.
import * as THREE from 'three';
import { buildWorld, toon } from './world.js';
import { DECK_Y, DECK, HULL } from './models.js';
import { markerTex } from './targets.js';
import { createLanding, approachStep, inFunnel, GP0, TD } from './landing.js';
import { createPlane, resetPlane, flyStep, integrate, applyPose, FLY } from './flight.js';
import { pulse, wobble } from './feel.js';
import { createInput } from './input.js';
import { Particles } from './particles.js';
import { icon } from './icons.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const CONVOY = new THREE.Vector3(-40, 30, 820);
const PIRATE_R = 15;

export function createBattle(renderer, A, audio, isTouch) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 7000);
  const M = A.battle;
  const world = buildWorld(scene, M.planets);
  const carrier = M.carrier, fighter = M.fighter;
  scene.add(carrier, fighter);
  const fxAdd = new Particles(scene, 800, true, 1.4), fxN = new Particles(scene, 1200, false, 1.2);
  const landing = createLanding(scene); landing.show(false);
  const input = createInput({ stickZone: $('stickZone'), stickBase: $('stickBase'), stickKnob: $('stickKnob'), btnFire: $('btnFire'), btnGo: $('btnGo'), canvas: renderer.domElement });

  // convoy freighters (not targets) + pirates
  const freighters = [0, 1, 2].map((i) => { const f = A.make('freighter', i ? 34 : 44); f.position.set(CONVOY.x + (i - 1) * 46, CONVOY.y + (i % 2) * 14, CONVOY.z + i * 30); scene.add(f); return f; });
  const markMat = new THREE.SpriteMaterial({ map: markerTex('target'), sizeAttenuation: false, depthTest: false, transparent: true });
  const pirates = [0, 1, 2, 3, 4, 5].map((i) => {
    const g = new THREE.Group(); const m = A.make('pirate', 20); g.add(m);
    const s = new THREE.Sprite(markMat); s.scale.set(0.045, 0.045, 1); s.position.y = 16; s.renderOrder = 10; g.add(s);
    scene.add(g); return { i, g, m, s, alive: false, hp: 0, ang: 0, rad: 0, h: 0, w: 0, fireCd: 0, popT: 0, flashT: 0 };
  });
  const wings = [0, 1, 2].map(() => { const w = A.make('fighter', 9); scene.add(w); w.visible = false; return { g: w, cd: 0 }; });

  // bullets: player (yellow), missiles (orange), pirate bolts (red)
  const mkInst = (geo, color, n) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
  const bulletMesh = mkInst(new THREE.BoxGeometry(0.22, 0.22, 3.2), 0xfff27a, 140);
  const missileMesh = mkInst(new THREE.ConeGeometry(0.8, 4, 8).rotateX(Math.PI / 2), 0xff9440, 12);
  const boltMesh = mkInst(new THREE.SphereGeometry(1.6, 10, 8), 0xff3d6e, 40);
  const bullets = [], missiles = [], bolts = [];

  const arrow = (() => {
    const g = new THREE.Group();
    const shaft = new THREE.CylinderGeometry(0.32, 0.32, 2.4, 10); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -0.2);
    const head = new THREE.ConeGeometry(0.85, 1.6, 12); head.rotateX(Math.PI / 2); head.translate(0, 0, 1.6);
    const mat = toon(0xffd23f, { emissive: 0x7a5a00, emissiveIntensity: 0.4 }), out = new THREE.MeshBasicMaterial({ color: 0x13294b, side: THREE.BackSide });
    for (const geo of [shaft, head]) { g.add(new THREE.Mesh(geo, mat)); const o = new THREE.Mesh(geo, out); o.scale.setScalar(1.12); g.add(o); }
    scene.add(g); g.visible = false; return g;
  })();
  const homeSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex('home'), sizeAttenuation: false, depthTest: false, transparent: true }));
  homeSprite.position.set(0, DECK_Y + 45, 110); homeSprite.renderOrder = 10; homeSprite.visible = false; scene.add(homeSprite);

  const plane = createPlane();
  const G = { phase: 'off', t: 0, phaseT: 0, hits: 0, total: 0, shields: 3, maxShields: 3, inv: 0, trauma: 0, timeScale: 1, hitStopT: 0, fireCd: 0, lastFireT: -9, touchT: -9, landedT: 0, missileCd: 0, cfg: null, done: null, waveOffs: 0 };
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), Z = new THREE.Vector3(0, 0, 1), ONE = new THREE.Vector3(1, 1, 1);
  const pipsEl = $('pips'), shEl = $('shields'), keysEl = $('keys');
  const K = (t) => `<span class="k">${t}</span>`;
  const KEYS_DECK = `<span class="grp">${K('Space')} ${icon('rocket', { size: 20 })}</span>`;
  const KEYS_FLY = `<span class="grp">${K('←')}${K('→')}${K('↑')}${K('↓')} ${icon('ship', { size: 20 })}</span><span class="grp">${K('Space')} ${icon('zap', { size: 20 })}</span>`;

  const BANNERS = {
    deck: () => ['rocket', isTouch ? 'Tap GO' : 'Press Space'], takeoff: () => ['rocket', 'Launch!'],
    mission: () => ['skull', 'Stop the pirates'], home: () => ['dock', G.waveOffs ? 'Try again' : 'Fly home'],
    approach: () => ['rings', 'Fly through rings'], trap: () => ['dock', 'Landed!'], retreat: () => ['shield', 'Shields down'],
  };
  function setBanner() {
    const b = BANNERS[G.phase], el = $('banner'); if (!b) { el.classList.add('hidden'); return; }
    const [ic, text] = b(); el.classList.remove('hidden');
    el.querySelector('.bi').innerHTML = icon(ic, { size: 22 }); el.querySelector('.bt').textContent = text;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  function setPhase(ph) {
    G.phase = ph; G.phaseT = 0;
    const flying = ph === 'mission' || ph === 'home' || ph === 'approach';
    $('btnGo').classList.toggle('hidden', ph !== 'deck');
    $('btnFire').classList.toggle('hidden', ph !== 'mission' && ph !== 'home');
    $('btnHome').classList.toggle('hidden', ph !== 'mission');
    $('stickZone').classList.toggle('hidden', !flying);
    $('guide').classList.toggle('hidden', ph !== 'approach');
    keysEl.classList.toggle('hidden', isTouch || !(ph === 'deck' || ph === 'mission'));
    keysEl.innerHTML = ph === 'deck' ? KEYS_DECK : KEYS_FLY;
    landing.show(ph === 'home' || ph === 'approach' || ph === 'trap');
    homeSprite.visible = ph === 'home';
    setBanner();
  }
  function drawPips() {
    pipsEl.innerHTML = '';
    for (let i = 0; i < G.total; i++) { const d = document.createElement('div'); d.className = 'pip' + (i < G.hits ? ' done' : ''); d.innerHTML = icon(i < G.hits ? 'check' : 'skull', { size: 26 }); pipsEl.appendChild(d); }
    shEl.innerHTML = '';
    for (let i = 0; i < G.maxShields; i++) { const d = document.createElement('div'); d.className = 'sh' + (i < G.shields ? ' on' : ''); d.innerHTML = icon('shield', { size: 22 }); shEl.appendChild(d); }
  }

  // ---------- start / end ----------
  function start(cfg, done) {
    G.cfg = cfg; G.done = done; G.total = cfg.pirates; G.hits = 0; G.maxShields = 3 + cfg.shield; G.shields = G.maxShields;
    G.trauma = 0; G.timeScale = 1; G.hitStopT = 0; G.fireCd = 0; G.missileCd = 2; G.waveOffs = 0; G.inv = 0;
    resetPlane(plane); landing.reset(); input.reset(); fxAdd.clear(); fxN.clear();
    bullets.length = missiles.length = bolts.length = 0;
    pirates.forEach((p, i) => {
      p.alive = i < cfg.pirates; p.g.visible = p.alive; p.s.visible = p.alive; p.g.scale.setScalar(1); p.popT = 0;
      p.hp = 8 + (cfg.tough || 0); p.ang = (i / cfg.pirates) * Math.PI * 2; p.rad = 110 + (i % 3) * 45; p.h = (i % 3) * 30 - 20;
      p.w = (0.13 + (i % 2) * 0.05) * (i % 2 ? 1 : -1); p.fireCd = 3 + i * 0.7;
    });
    wings.forEach((w, i) => { w.g.visible = i < cfg.wing; w.cd = 0.5 + i * 0.2; });
    applyPose(plane, fighter);
    camPos.set(0, DECK_Y + 7, plane.pos.z - 19); camLook.set(0, DECK_Y + 2, plane.pos.z + 28);
    drawPips(); setPhase('deck');
  }
  function finish(landed) {
    if (G.phase === 'off') return;
    const r = { kills: G.hits, total: G.total, landed };
    setPhase('off'); arrow.visible = false; $('edge').classList.add('hidden'); audio.engine(0, false);
    G.done && G.done(r);
  }

  // ---------- feel ----------
  const addTrauma = (a) => { if (!REDUCED) G.trauma = Math.min(1, G.trauma + a); };
  const hitStop = (s) => { if (!REDUCED) { G.hitStopT = s; G.timeScale = 0.08; } };
  function flash(alpha, color = '#fff') { if (REDUCED) return; const f = $('flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = alpha; requestAnimationFrame(() => { f.style.transition = 'opacity .3s'; f.style.opacity = 0; }); }
  function explode(p, big) {
    const cols = [[1, 0.36, 0.4], [1, 0.62, 0.25], [1, 0.9, 0.45], [1, 1, 1], [0.5, 0.94, 1]];
    for (let i = 0; i < (big ? 70 : 16); i++) {
      const a = Math.random() * 6.28, b = Math.random() * 3.14 - 1.57, s = (big ? 22 : 10) + Math.random() * 28, c = cols[i % cols.length];
      fxN.spawn(p.x, p.y, p.z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s, Math.sin(a) * Math.cos(b) * s, 1.4 + Math.random() * 0.8, big ? 9 : 4, 4, c[0], c[1], c[2], 1, 0.5, 0);
    }
    if (big) { for (let i = 0; i < 3; i++) fxAdd.spawn(p.x, p.y, p.z, 0, 0, 0, 0.45 + i * 0.1, 40 + i * 25, 100 + i * 40, 1, 0.75, 0.5, 0.9, 0, 0); }
  }
  function damage(p, dmg) {
    if (!p.alive) return;
    p.hp -= dmg; p.flashT = 0.08; explode(p.g.position, false);
    if (p.hp <= 0) {
      p.alive = false; p.popT = 0.25; p.s.visible = false; G.hits++;
      explode(p.g.position, true); audio.pop(); addTrauma(0.35); hitStop(0.07); flash(0.18); drawPips();
      const pip = pipsEl.children[G.hits - 1]; if (pip) pip.classList.add('pop');
      if (G.hits >= G.total) setTimeout(() => { if (G.phase === 'mission') setPhase('home'); }, 700);
    }
  }
  const alive = () => pirates.filter((p) => p.alive);
  const aimDir = (out) => out.set(-Math.sin(plane.yaw) * Math.cos(plane.pitch), Math.sin(plane.pitch), -Math.cos(plane.yaw) * Math.cos(plane.pitch));
  function bestTarget(from, dir, cone, range) {
    let aim = null, best = cone;
    for (const t of alive()) { tmpV.subVectors(t.g.position, from); const d = tmpV.length(); if (d > range) continue; const c = tmpV.normalize().dot(dir); if (c > best) { best = c; aim = t; } }
    return aim;
  }
  function fire(dt) {
    G.fireCd -= dt; if (G.fireCd > 0) return;
    G.fireCd = 0.1 - 0.015 * G.cfg.laser; G.lastFireT = G.t;
    const dir0 = aimDir(new THREE.Vector3());
    const aim = bestTarget(plane.pos, dir0, 0.95, 600);
    for (const m of fighter.userData.muzzles) {
      const o = m.clone().applyMatrix4(fighter.matrixWorld);
      const dir = aim ? new THREE.Vector3().subVectors(aim.g.position, o).normalize() : dir0.clone();
      bullets.push({ p: o, v: dir.multiplyScalar(300 + plane.speed), life: 1.6, dmg: 1 + 0.5 * G.cfg.laser });
      fxAdd.spawn(o.x, o.y, o.z, 0, 0, 0, 0.07, 2.0, 0.6, 0.5, 1, 1, 1, 0, 0);
    }
    if (bullets.length > 130) bullets.splice(0, bullets.length - 130);
    audio.gun();
  }
  function segHit(prev, seg, L2, c, r) {
    const k = THREE.MathUtils.clamp((c.x - prev.x) * seg.x + (c.y - prev.y) * seg.y + (c.z - prev.z) * seg.z, 0, L2) / L2;
    const dx = prev.x + seg.x * k - c.x, dy = prev.y + seg.y * k - c.y, dz = prev.z + seg.z * k - c.z;
    return dx * dx + dy * dy + dz * dz < r * r;
  }
  function updateShots(dt) {
    const prev = new THREE.Vector3(), seg = new THREE.Vector3();
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; prev.copy(b.p); b.p.addScaledVector(b.v, dt); b.life -= dt;
      seg.subVectors(b.p, prev); const L2 = seg.lengthSq() || 1; let hit = false;
      for (const t of alive()) if (segHit(prev, seg, L2, t.g.position, PIRATE_R + 2.5)) { damage(t, b.dmg); hit = true; break; }
      if (hit || b.life <= 0) bullets.splice(i, 1);
    }
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i]; m.life -= dt;
      if (m.t && !m.t.alive) m.t = alive()[0] || null;
      if (m.t) { tmpV.subVectors(m.t.g.position, m.p).normalize().multiplyScalar(170); m.v.lerp(tmpV, 1 - Math.exp(-3.5 * dt)); }
      m.p.addScaledVector(m.v, dt);
      if (Math.random() < 0.9) fxAdd.spawn(m.p.x, m.p.y, m.p.z, 0, 0, 0, 0.4, 2.2, 0.5, 1, 0.6, 0.3, 0.8, 0, 0);
      if (m.t && m.p.distanceTo(m.t.g.position) < PIRATE_R) { damage(m.t, 4); missiles.splice(i, 1); continue; }
      if (m.life <= 0) missiles.splice(i, 1);
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; prev.copy(b.p); b.p.addScaledVector(b.v, dt); b.life -= dt;
      seg.subVectors(b.p, prev); const L2 = seg.lengthSq() || 1;
      if (G.inv <= 0 && (G.phase === 'mission' || G.phase === 'home') && segHit(prev, seg, L2, plane.pos, 5.5)) {
        bolts.splice(i, 1); G.shields--; G.inv = 1.4; drawPips(); audio.thud(); addTrauma(0.5); flash(0.35, '#ff5a64');
        for (let k = 0; k < 24; k++) fxAdd.spawn(plane.pos.x, plane.pos.y, plane.pos.z, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.5, 3, 1, 0.5, 0.9, 1, 0.9, 2, 0);
        if (G.shields <= 0) { setPhase('retreat'); }
        continue;
      }
      if (b.life <= 0) bolts.splice(i, 1);
    }
    let n = 0;
    for (const b of bullets) { tmpQ.setFromUnitVectors(Z, tmpV.copy(b.v).normalize()); tmpM.compose(b.p, tmpQ, ONE); bulletMesh.setMatrixAt(n++, tmpM); }
    bulletMesh.count = n; bulletMesh.instanceMatrix.needsUpdate = true; n = 0;
    for (const m of missiles) { tmpQ.setFromUnitVectors(Z, tmpV.copy(m.v).normalize()); tmpM.compose(m.p, tmpQ, ONE); missileMesh.setMatrixAt(n++, tmpM); }
    missileMesh.count = n; missileMesh.instanceMatrix.needsUpdate = true; n = 0;
    for (const b of bolts) { tmpM.makeTranslation(b.p.x, b.p.y, b.p.z); boltMesh.setMatrixAt(n++, tmpM); }
    boltMesh.count = n; boltMesh.instanceMatrix.needsUpdate = true;
  }
  function updatePirates(dt, t) {
    for (const p of pirates) {
      if (p.alive) {
        p.ang += p.w * dt;
        const x = CONVOY.x + Math.cos(p.ang) * p.rad, z = CONVOY.z + Math.sin(p.ang) * p.rad, y = CONVOY.y + p.h + Math.sin(t * 0.8 + p.i) * 6;
        p.g.position.set(x, y, z);
        p.g.rotation.set(0, Math.atan2(-Math.sin(p.ang) * Math.sign(p.w), Math.cos(p.ang) * Math.sign(p.w)), -0.4 * Math.sign(p.w));
        p.m.scale.setScalar(p.flashT > 0 ? 1.12 : 1); p.flashT -= dt;
        p.s.scale.set(0.045 * (camera.aspect < 1 ? 1.5 : 1), 0.045 * (camera.aspect < 1 ? 1.5 : 1), 1);
        // pirates shoot slow red bolts you can dodge
        if (G.phase === 'mission' || G.phase === 'home') {
          p.fireCd -= dt; const d = p.g.position.distanceTo(plane.pos);
          if (p.fireCd <= 0 && d < 420) {
            p.fireCd = 4 + Math.random() * 2;
            const v = tmpV2.copy(plane.pos).addScaledVector(plane.fwd, plane.speed * 0.3).sub(p.g.position).normalize().multiplyScalar(62);
            bolts.push({ p: p.g.position.clone(), v: v.clone(), life: 6 });
          }
        }
      } else if (p.popT > 0) { p.popT -= dt; p.g.scale.setScalar(0.2 + Math.max(0, p.popT / 0.25) * 1.1); if (p.popT <= 0) p.g.visible = false; }
    }
    freighters.forEach((f, i) => { f.position.y = CONVOY.y + (i % 2) * 14 + Math.sin(t * 0.5 + i) * 2; f.rotation.y = Math.sin(t * 0.1 + i) * 0.1; });
  }
  function updateWings(dt) {
    const right = tmpV.set(Math.cos(plane.yaw), 0, -Math.sin(plane.yaw));
    const slots = [[-13, 4, -9], [13, 4, -9], [0, 9, -18]];
    wings.forEach((w, i) => {
      if (!w.g.visible) return;
      let [sx, sy, sb] = slots[i];
      // on the landing run the wingmen break high and wide, then fly on out of sight
      if (G.phase === 'approach' || G.phase === 'trap') { sx = (i % 2 ? 1 : -1) * (45 + i * 10); sy = 30 + i * 8; sb = 40 + G.phaseT * 30; }
      const goal = tmpV2.copy(plane.pos).addScaledVector(right, sx).addScaledVector(plane.fwd, sb); goal.y += sy;
      w.g.position.lerp(goal, 1 - Math.exp(-4 * dt));
      w.g.rotation.set(plane.pitch, plane.yaw + Math.PI, plane.bank, 'YXZ');
      if (G.phase === 'mission' && G.phaseT > 1.5) {
        w.cd -= dt;
        if (w.cd <= 0) {
          w.cd = 0.45;
          const aim = bestTarget(w.g.position, aimDir(new THREE.Vector3()), 0.85, 520);
          if (aim) {
            const o = w.g.position.clone(), dir = new THREE.Vector3().subVectors(aim.g.position, o).normalize();
            dir.x += (Math.random() - 0.5) * 0.03; dir.y += (Math.random() - 0.5) * 0.03;
            bullets.push({ p: o, v: dir.multiplyScalar(320), life: 1.8, dmg: 1 });
          }
        }
      }
    });
  }

  // ---------- simulation ----------
  let guideErr = { errX: 0, errY: 0 };
  function step(dt, inp) {
    G.phaseT += dt; G.inv = Math.max(0, G.inv - dt);
    switch (G.phase) {
      case 'deck': if (inp.go) { audio.unlock(); audio.go(); setPhase('takeoff'); } break;
      case 'takeoff':
        plane.speed = Math.min(FLY.liftSpeed + 8, plane.speed + FLY.takeoffAccel * dt); plane.yawRate = 0;
        if (plane.pos.z > 118 && plane.speed > FLY.liftSpeed) plane.vy += (6 - plane.vy) * (1 - Math.exp(-3 * dt)); else plane.vy = 0;
        integrate(plane, dt); plane.pos.y = Math.max(DECK_Y, plane.pos.y);
        if (Math.random() < 0.7) { const p = plane.pos; fxAdd.spawn(p.x + (Math.random() - 0.5) * 3, DECK_Y + 0.5, p.z - 3, (Math.random() - 0.5) * 4, 1, -6, 0.6, 1.6, 4, 0.5, 0.95, 1, 0.6, 1, 0); }
        if (plane.pos.z > DECK.bow + 12) { plane.climbAssist = 2.5; wings.forEach((w, i) => w.g.position.copy(plane.pos).add(new THREE.Vector3((i - 1) * 14, 4, -16))); setPhase('mission'); }
        break;
      case 'mission':
        flyStep(plane, inp, dt); if (inp.fire) fire(dt);
        if (G.cfg.missile > 0) {
          G.missileCd -= dt;
          if (G.missileCd <= 0) {
            const t = bestTarget(plane.pos, aimDir(new THREE.Vector3()), 0.3, 700);
            if (t) { G.missileCd = 7 - 1.5 * G.cfg.missile; missiles.push({ p: plane.pos.clone().add(new THREE.Vector3(0, -1.5, 0)), v: plane.fwd.clone().multiplyScalar(90), t, life: 6 }); audio.go(); }
          }
        }
        break;
      case 'home': flyStep(plane, inp, dt); if (inp.fire) fire(dt); if (inFunnel(plane)) setPhase('approach'); break;
      case 'approach': {
        guideErr = approachStep(plane, inp, dt); integrate(plane, dt);
        const z = plane.pos.z;
        if (z <= TD.z + 4) { if (Math.abs(plane.pos.x) < 10 && plane.pos.y < DECK_Y + 8) touchDown(); else { G.waveOffs++; plane.climbAssist = 2.5; landing.reset(); setPhase('home'); } }
        else if (Math.abs(plane.pos.x) > 320 || z > 960) setPhase('home');
        break;
      }
      case 'trap':
        plane.speed = Math.max(0, plane.speed - 13 * dt); plane.vy = 0; plane.yawRate *= 0.9; plane.pos.x *= 1 - Math.min(1, 3 * dt);
        plane.yaw += (0 - plane.yaw) * Math.min(1, 3 * dt); integrate(plane, dt); plane.pos.y = DECK_Y; plane.pitch *= 0.9;
        if (plane.speed === 0) { G.landedT += dt; if (G.landedT > 0.9) finish(true); }
        break;
      case 'retreat': // shields gone: the carrier's tractor beam pulls the fighter home
        plane.speed = Math.max(10, plane.speed * (1 - dt)); integrate(plane, dt);
        if (G.phaseT > 1.8) finish(false);
        break;
    }
  }
  function touchDown() {
    plane.pos.y = DECK_Y; plane.vy = 0; G.landedT = 0; G.touchT = G.t; audio.thud(); addTrauma(0.45); flash(0.12);
    for (let i = 0; i < 18; i++) fxAdd.spawn(plane.pos.x + (Math.random() - 0.5) * 5, DECK_Y + 0.5, plane.pos.z + 2, (Math.random() - 0.5) * 14, 1 + Math.random() * 3, 4 + Math.random() * 8, 0.6, 1.2, 2.6, 0.5, 0.95, 1, 0.55, 1.2, 0);
    setPhase('trap');
  }

  // ---------- camera ----------
  let shakeT = 0;
  function updateCamera(rdt) {
    const portrait = camera.aspect < 1, ph = G.phase, fwd = plane.fwd;
    if (ph === 'trap') {
      const a = 0.7, dist = portrait ? 34 : 26;
      tmpV.set(plane.pos.x - 14 + Math.sin(a) * dist, DECK_Y + 12, plane.pos.z + Math.cos(a) * dist);
      camPos.lerp(tmpV, 1 - Math.exp(-2 * rdt)); camLook.lerp(tmpV2.copy(plane.pos).setY(DECK_Y + 3), 1 - Math.exp(-3 * rdt));
    } else {
      const back = (ph === 'deck' || ph === 'takeoff' ? 19 : 16) * (portrait ? 1.25 : 1);
      const up = ph === 'deck' || ph === 'takeoff' ? 7.5 : 6.4 + Math.max(0, -plane.pitch) * 6;
      tmpV.copy(plane.pos).addScaledVector(fwd, -back); tmpV.y += up - Math.sin(plane.pitch) * back * 0.5;
      camPos.lerp(tmpV, 1 - Math.exp(-(ph === 'deck' ? 10 : 5.5) * rdt));
      if (Math.abs(camPos.x) < HULL.halfW && camPos.z > HULL.zMin && camPos.z < HULL.zMax && plane.pos.y > DECK_Y - 2) camPos.y = Math.max(camPos.y, DECK_Y + 3);
      tmpV2.copy(plane.pos).addScaledVector(fwd, 28); tmpV2.y += (ph === 'deck' || ph === 'takeoff' ? 2.2 : 4.6) + Math.sin(plane.pitch) * 20;
      camLook.lerp(tmpV2, 1 - Math.exp(-9 * rdt));
    }
    camera.position.copy(camPos); camera.lookAt(camLook);
    G.trauma = Math.max(0, G.trauma - 1.3 * rdt); shakeT += rdt * 30;
    const s = G.trauma * G.trauma;
    if (s > 0) { camera.position.x += 0.9 * s * Math.sin(shakeT * 1.7); camera.position.y += 0.6 * s * Math.sin(shakeT * 2.3); camera.rotateZ(0.03 * s * Math.sin(shakeT * 1.1)); }
  }
  function updateGuides(t) {
    const ph = G.phase; let goal = null;
    if (ph === 'mission') { let best = 1e9; for (const p of alive()) { const d = p.g.position.distanceToSquared(plane.pos); if (d < best) { best = d; goal = p.g.position; } } }
    else if (ph === 'home') goal = GP0;
    arrow.visible = !!goal; const edge = $('edge');
    if (goal) {
      arrow.position.copy(plane.pos).addScaledVector(plane.fwd, 14); arrow.position.y += 5.8;
      tmpV.copy(goal); tmpV.y = arrow.position.y + THREE.MathUtils.clamp(goal.y - arrow.position.y, -25, 25) * 0.25; arrow.lookAt(tmpV);
      arrow.scale.setScalar(1.7 * (1 + 0.08 * Math.sin(t * 7)));
      tmpV.copy(goal).project(camera);
      const behind = tmpV.z > 1; let nx = behind ? -tmpV.x : tmpV.x, ny = behind ? -tmpV.y : tmpV.y;
      const off = behind || Math.abs(nx) > 0.92 || Math.abs(ny) > 0.88; edge.classList.toggle('hidden', !off);
      if (off) {
        if (behind && Math.abs(nx) < 0.05) nx = 0.05;
        const m = Math.max(Math.abs(nx) / 0.86, Math.abs(ny) / 0.78); nx /= m; ny /= m;
        edge.style.transform = `translate(${(nx * 0.5 + 0.5) * innerWidth}px, ${(-ny * 0.5 + 0.5) * innerHeight}px) rotate(${Math.atan2(-ny, nx) + Math.PI}rad)`;
      }
    } else edge.classList.add('hidden');
    const mul = camera.aspect < 1 ? 1.5 : 1; homeSprite.scale.set(0.05 * mul, 0.05 * mul, 1);
    if (ph === 'approach') {
      const ex = guideErr.errX, ey = guideErr.errY, g = $('guide');
      g.querySelector('.chev.left').classList.toggle('on', ex > 3); g.querySelector('.chev.right').classList.toggle('on', ex < -3);
      g.querySelector('.chev.down').classList.toggle('on', ey > 3); g.querySelector('.chev.up').classList.toggle('on', ey < -3);
      g.querySelector('.gdot').style.transform = `translate(${THREE.MathUtils.clamp(ex * 1.5, -40, 40)}px, ${THREE.MathUtils.clamp(-ey * 1.5, -40, 40)}px)`;
    }
  }
  function fighterFeel(dt) {
    const u = fighter.userData;
    const thr = G.phase === 'deck' ? 0.25 : (G.phase === 'trap' && plane.speed === 0) ? 0.1 : Math.min(1, 0.35 + plane.speed / 60);
    const flare = 1 + 0.5 * pulse(G.t, G.lastFireT, 0.02, 0.12), flick = 1 + 0.08 * Math.sin(G.t * 40);
    u.flames.forEach((f, i) => { f.scale.setScalar((i < 2 ? 3.0 : 1.0) * (0.5 + thr * 0.9) * flick * flare); });
    u.model.position.y = -0.35 * Math.abs(REDUCED ? 0 : wobble(G.t, G.touchT, 3, 0.25));
    u.model.visible = !(G.inv > 0 && Math.floor(G.t * 16) % 2 === 0);
    audio.engine(thr, G.phase !== 'off');
    if (G.phase === 'takeoff' || G.phase === 'mission' || G.phase === 'home' || G.phase === 'approach') {
      for (const e of u.engines) if (Math.random() < 0.8) { const p = e.clone().applyMatrix4(fighter.matrixWorld); fxAdd.spawn(p.x, p.y, p.z, -plane.fwd.x * 8, -plane.fwd.y * 8, -plane.fwd.z * 8, 0.35, 1.3, 0.4, 1, 0.65, 0.3, 0.8, 0, 0); }
      if (Math.abs(plane.bank) > 0.35) for (const w of u.wingTips) { const p = w.clone().applyMatrix4(fighter.matrixWorld); fxN.spawn(p.x, p.y, p.z, 0, 0, 0, 0.6, 0.2, 0.55, 0.75, 0.95, 1, 0.55, 0, 0); }
    }
    carrier.userData.glows.forEach((g, i) => { g.material.opacity = 0.75 + 0.25 * Math.sin(G.t * 6 + i); });
  }

  function update(rdt, paused) {
    if (G.phase === 'off') return;
    if (G.hitStopT > 0) { G.hitStopT -= rdt; if (G.hitStopT <= 0) G.timeScale = 1; }
    const dt = rdt * G.timeScale;
    if (!paused) {
      G.t += rdt;
      step(dt, input.sample());
      if (G.phase === 'off') return;
      applyPose(plane, fighter); fighter.updateMatrixWorld();
      updatePirates(dt, G.t); updateWings(dt); updateShots(dt); fighterFeel(dt); updateGuides(G.t);
      const passed = landing.update(dt, G.t, plane, G.phase === 'approach');
      if (passed >= 0) { audio.ring(); const r = landing.rings[passed]; for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28; fxAdd.spawn(r.m.position.x + Math.cos(a) * r.r, r.m.position.y + Math.sin(a) * r.r, r.z, 0, 0, 0, 0.5, 3, 0.5, 1, 0.9, 0.3, 0.9, 0, 0); } }
      world.update(dt, G.t); fxAdd.update(dt); fxN.update(dt);
      updateCamera(rdt);
    }
  }
  return {
    start, update, finish, input,
    render() { renderer.render(scene, camera); },
    resize(w, h) { camera.aspect = w / h; camera.fov = w < h ? 74 : 62; camera.updateProjectionMatrix(); },
    goHome() { if (G.phase === 'mission') setPhase('home'); },
    get phase() { return G.phase; },
    probe: () => ({ phase: G.phase, hits: G.hits, total: G.total, shields: G.shields, plane: { x: plane.pos.x, y: plane.pos.y, z: plane.pos.z, yaw: plane.yaw },
      pirates: pirates.filter((p) => p.alive).map((p) => ({ x: p.g.position.x, y: p.g.position.y, z: p.g.position.z })), gp0: { x: GP0.x, y: GP0.y, z: GP0.z } }),
  };
}
