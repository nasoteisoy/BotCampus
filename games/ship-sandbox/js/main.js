// Ship Sandbox: one capital ship made of breakable parts vs. a palette of attacks.
// three.js setup / particles / attack-level rules reused from Front Line (games/tank-2v2) and Space Defense (games/space-defense).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Particles } from './particles.js';
import * as C from './config.js';
import { ICON, svg } from './icons.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const rr = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------- renderer / scene ----------
const cv = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
camera.position.set(34, 24, 52);
const controls = new OrbitControls(camera, cv);
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.minDistance = 18; controls.maxDistance = 220;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x201820, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(40, 60, 30); scene.add(sun);
const rim = new THREE.DirectionalLight(0x6fa8ff, 0.8); rim.position.set(-40, -10, -40); scene.add(rim);

// starfield (streams past to show ship speed)
const STAR_N = 1400, starPos = new Float32Array(STAR_N * 3);
for (let i = 0; i < STAR_N; i++) { starPos[i * 3] = rr(-400, 400); starPos[i * 3 + 1] = rr(-250, 250); starPos[i * 3 + 2] = rr(-400, 400); }
const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.1, sizeAttenuation: true })));
// nebula backdrop
{ const g = new THREE.SphereGeometry(900, 24, 16); const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'varying vec3 vP; void main(){ float a=pow(max(0.0,dot(vP,normalize(vec3(-0.6,0.3,-0.7)))),3.0); float b=pow(max(0.0,dot(vP,normalize(vec3(0.7,-0.2,0.5)))),4.0); gl_FragColor=vec4(vec3(0.16,0.06,0.28)*a+vec3(0.03,0.12,0.2)*b+vec3(0.01,0.012,0.03),1.0); }' });
  scene.add(new THREE.Mesh(g, m)); }

const fxAdd = new Particles(scene, 3000, true, 1.6);   // sparks, fire, engine plume, tracers
const fxSmoke = new Particles(scene, 1600, false, 1.2); // smoke

// ---------- materials ----------
const M = {
  hull: () => new THREE.MeshStandardMaterial({ color: 0x8a97ad, metalness: 0.55, roughness: 0.5 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x4a5266, metalness: 0.5, roughness: 0.6 }),
  glow: (c) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 1.6 }),
};
const SOOT = new THREE.Color(0x1c1a1a);

// ---------- ship build ----------
const shipRoot = new THREE.Group(); scene.add(shipRoot);
const partMeshes = [];
function addMesh(grp, geo, mat, x = 0, y = 0, z = 0, glowing = false) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); grp.add(m);
  m.userData.glow = glowing; return m;
}
function buildPart(def) {
  const g = new THREE.Group(); g.position.set(...def.pos);
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), Cy = (a, b, h, s = 16) => new THREE.CylinderGeometry(a, b, h, s);
  const p = { def, grp: g, aim: null };
  switch (def.id) {
    case 'bow': { const m = addMesh(g, Cy(0.6, 4.2, 14, 6), M.hull()); m.rotation.z = -Math.PI / 2; m.scale.set(1, 1, 1.15);
      addMesh(g, B(9, .35, .35), M.glow(0x6ff3ff), -1, 1.6, 3.2, true); addMesh(g, B(9, .35, .35), M.glow(0x6ff3ff), -1, 1.6, -3.2, true); break; }
    case 'mid': addMesh(g, B(20, 5, 8.4), M.hull()); addMesh(g, B(16, .4, .3), M.glow(0x6ff3ff), 0, 1.2, 4.25, true); addMesh(g, B(16, .4, .3), M.glow(0x6ff3ff), 0, 1.2, -4.25, true);
      addMesh(g, B(18, 0.6, 5), M.dark(), 0, 2.8, 0); break;
    case 'stern': addMesh(g, B(13, 5.6, 9.4), M.hull()); addMesh(g, B(10, .4, .3), M.glow(0x6ff3ff), 0, 1.4, 4.75, true); addMesh(g, B(10, .4, .3), M.glow(0x6ff3ff), 0, 1.4, -4.75, true); break;
    case 'bridge': addMesh(g, B(5, 3.2, 4), M.hull()); addMesh(g, B(3.4, 1.4, 3), M.dark(), 0, 2.2, 0); addMesh(g, B(.3, .5, 3.2), M.glow(0x8ff7ff), 1.75, 2.2, 0, true); addMesh(g, Cy(.12, .12, 3, 6), M.dark(), -1, 4, 0); break;
    case 'sensors': { addMesh(g, Cy(.35, .5, 3.4, 8), M.dark(), 0, 0, 0); const d = new THREE.Group(); d.position.y = 1.9; g.add(d);
      const dish = addMesh(d, new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, 1.1), M.hull()); dish.rotation.z = Math.PI / 2.4;
      addMesh(d, new THREE.SphereGeometry(.28, 8, 6), M.glow(0x4dff88), 0.9, .3, 0, true); p.spin = d; break; }
    case 'reactor': addMesh(g, Cy(1.9, 2.2, 1.6, 20), M.dark()); { const t = addMesh(g, new THREE.TorusGeometry(1.7, .32, 8, 24), M.glow(0x4dff88), 0, .9, 0, true); t.rotation.x = Math.PI / 2; p.pulse = t; }
      addMesh(g, new THREE.SphereGeometry(1, 16, 10), M.glow(0x7affc0), 0, .9, 0, true); break;
    case 'shield': addMesh(g, Cy(1.8, 2, .8, 16), M.dark()); addMesh(g, new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.glow(0xb88cff), 0, .4, 0, true);
      { const t = addMesh(g, new THREE.TorusGeometry(2.3, .16, 6, 24), M.glow(0xd6b8ff), 0, .6, 0, true); t.rotation.x = Math.PI / 2; p.pulse = t; } break;
    case 'engL': case 'engR': { const b = addMesh(g, Cy(1.7, 2.1, 7, 16), M.dark()); b.rotation.z = Math.PI / 2;
      const n = addMesh(g, Cy(1.5, 1.5, .4, 16), M.glow(0x6fb8ff), -3.6, 0, 0, true); n.rotation.z = Math.PI / 2; p.nozzle = V(-4, 0, 0); break; }
    case 'gun1': case 'gun2': { addMesh(g, Cy(1.4, 1.6, .8, 12), M.dark()); const tur = new THREE.Group(); tur.position.y = .9; g.add(tur);
      addMesh(tur, B(3, 1.3, 2.4), M.hull()); const bar = new THREE.Group(); bar.position.set(1, .2, 0); tur.add(bar);
      for (const z of [-.5, .5]) { const c = addMesh(bar, Cy(.18, .2, 4, 6), M.dark(), 2, 0, z); c.rotation.z = Math.PI / 2; }
      p.aim = tur; p.pitch = bar; p.muzzle = V(4, 1, 0); break; }
    case 'launcher': { addMesh(g, B(4, 1.6, 2), M.dark()); const tur = new THREE.Group(); tur.position.y = 1; g.add(tur); addMesh(tur, B(2.6, 1.6, 2.2), M.hull());
      for (let i = 0; i < 6; i++) addMesh(tur, Cy(.25, .25, .2, 6), M.glow(0xff6a3a), 1.32, -.4 + (i % 2) * .8, -.7 + Math.floor(i / 2) * .7, true).rotation.z = Math.PI / 2;
      p.aim = tur; p.muzzle = V(1.5, 1, 0); break; }
    case 'laser': { addMesh(g, B(4, 1.6, 2), M.dark()); const tur = new THREE.Group(); tur.position.y = 1; g.add(tur);
      const c = addMesh(tur, Cy(.5, .8, 3.4, 10), M.hull(), 1.4, .2, 0); c.rotation.z = -Math.PI / 2; addMesh(tur, new THREE.SphereGeometry(.45, 10, 8), M.glow(0x6ff3ff), 3.2, .2, 0, true);
      p.aim = tur; p.muzzle = V(3.4, 1.2, 0); break; }
    case 'hangar': addMesh(g, B(11, 2.4, 7.2), M.hull()); addMesh(g, B(7, 1.6, .2), new THREE.MeshBasicMaterial({ color: 0x050505 }), 0, -.1, 3.62);
      addMesh(g, B(7, .2, .2), M.glow(0xffd65a), 0, -1, 3.7, true); addMesh(g, B(7, .2, .2), M.glow(0xffd65a), 0, .8, 3.7, true); break;
  }
  g.traverse((m) => { if (m.isMesh) { m.userData.part = def.id; m.userData.col0 = m.material.color.clone(); m.userData.em0 = m.material.emissiveIntensity ?? 0; partMeshes.push(m); } });
  shipRoot.add(g);
  return p;
}

// shield bubble
const BUB = V(34, 13, 14);
const bubbleMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uA: { value: .5 }, uHit: { value: V(0, 99, 0) }, uHitT: { value: 9 }, uCol: { value: new THREE.Color(0x9a7cff) } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vL; void main(){ vL=position; vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
  fragmentShader: `uniform float uA; uniform vec3 uHit; uniform float uHitT; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying vec3 vL;
    void main(){ float f=pow(1.0-abs(dot(vN,vV)),2.5); float d=length(vL-uHit); float r=uHitT*28.0; float ring=exp(-pow((d-r)*0.5,2.0))*max(0.0,1.0-uHitT*1.4);
    float hex=0.5+0.5*sin(vL.x*2.2)*sin(vL.y*2.2+vL.z*1.6); gl_FragColor=vec4(uCol*(f*0.9+ring*1.6+0.04*hex), (f*0.8+ring+0.03)*uA); }` });
const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), bubbleMat); bubble.scale.copy(BUB); bubble.position.set(-3, 1.5, 0); scene.add(bubble);
function inBubble(p) { const x = (p.x - bubble.position.x) / BUB.x, y = (p.y - bubble.position.y) / BUB.y, z = (p.z - bubble.position.z) / BUB.z; return x * x + y * y + z * z < 1; }

// ---------- state ----------
let S = null;
const parts = {};
for (const d of C.PARTS) parts[d.id] = buildPart(d);
const ui = { tab: 'parts', count: 0, speedI: 0, dirty: true };
function reset() {
  for (const a of S?.atk || []) scene.remove(a.mesh);
  for (const p of S?.proj || []) scene.remove(p.mesh);
  for (const f of S?.friends || []) scene.remove(f.mesh);
  for (const d of S?.debris || []) scene.remove(d);
  S = { t: 0, paused: false, timeScale: C.SPEEDS[ui.speedI], atk: [], proj: [], beams: [], friends: [], debris: [], log: [], shieldHp: C.SHIP.shieldHp, shieldOn: true,
    shieldHitT: -99, fireBack: !!S?.fireBack, target: null, hangarT: 2, launched: 0, lost: false, lastCell: null, stats: { dmg: 0, shd: 0, hits: 0 } };
  for (const id in parts) {
    const p = parts[id]; p.hp = p.def.hp; p.broken = false; p.cd = rr(0, 1);
    p.grp.position.set(...p.def.pos); p.grp.rotation.set(0, 0, 0); p.grp.scale.set(1, 1, 1);
    p.grp.traverse((m) => { if (m.isMesh) { m.material.color.copy(m.userData.col0); if (m.material.emissive) m.material.emissiveIntensity = m.userData.em0; } });
  }
  fxAdd.clear(); fxSmoke.clear();
  $('banner').classList.add('hidden');
  log({ ev: '↺ Ship ready' });
  ui.dirty = true;
}
const power = () => !parts.reactor.broken;
const working = (p) => !p.broken && (p.def.fn === 'hull' || p.def.fn === 'aim' || p.def.fn === 'power' || p.def.fn === 'engine' || power());
const shieldUp = () => S.shieldOn && !parts.shield.broken && power() && S.shieldHp > 0;
function aimMul() { return (parts.bridge.broken ? 2.5 : 1) * (parts.sensors.broken ? 2 : 1); }
function speedNow() {
  const eng = ['engL', 'engR'].filter((k) => !parts[k].broken).length / 2;
  if (S.lost) return 0;
  return C.SHIP.speed * eng * (power() ? 1 : C.SHIP.auxPower);
}
function partWorld(p, out = V()) { return p.grp.getWorldPosition(out); }

// ---------- log / floats ----------
function log(e) { e.t = S.t; S.log.unshift(e); if (S.log.length > 120) S.log.pop(); ui.dirty = true; }
const floats = [];
function floatNum(pos, txt, cls) {
  if (floats.length > 46) { const f = floats.shift(); f.el.remove(); }
  const el = document.createElement('div'); el.className = 'fl ' + (cls || ''); el.textContent = txt; $('floats').appendChild(el);
  floats.push({ el, pos: pos.clone().add(V(rr(-1, 1), 1.5, rr(-1, 1))), t: 0 });
}

// ---------- damage ----------
function damagePart(p, raw, akey, pos, splash) {
  const A = C.ATTACKS[akey];
  if (p.broken) { // broken parts pass hits to the hull under them at half damage
    const hull = nearestHull(pos); if (!hull || hull === p) return; p = hull; raw *= 0.5;
  }
  const lvl = A.vs[p.def.armor] ?? 0, mul = C.LVL_MULT[lvl];
  const dmg = Math.round(raw * mul * rr(0.9, 1.1));
  S.lastCell = { a: akey, r: p.def.armor, t: S.t };
  if (dmg <= 0) { if (!splash) { floatNum(pos, '0', 'weak'); log({ a: akey, p: p.def.id, d: 0, lvl }); } return; }
  p.hp = Math.max(0, p.hp - dmg); S.stats.dmg += dmg; S.stats.hits++;
  if (!splash || dmg > 20) floatNum(pos, '-' + dmg, lvl >= 4 ? 'big' : lvl <= 1 ? 'weak' : '');
  log({ a: akey, p: p.def.id, d: dmg, lvl, sp: !!splash });
  sparks(pos, lvl >= 4 ? 14 : 7);
  if (p.hp <= 0) breakPart(p, akey);
  ui.dirty = true;
}
function nearestHull(pos) {
  let best = null, bd = 1e9;
  for (const id of ['bow', 'mid', 'stern']) { const h = parts[id]; if (h.broken) continue; const d = partWorld(h).distanceTo(pos); if (d < bd) { bd = d; best = h; } }
  return best;
}
// hit = one projectile arriving. Shield absorbs first, overflow goes to the part.
function impact(akey, part, pos, raw) {
  const A = C.ATTACKS[akey];
  if (shieldUp()) {
    const sm = C.LVL_MULT[A.vs.shd];
    const sd = raw * sm;
    const took = Math.min(S.shieldHp, sd);
    S.shieldHp -= took; S.shieldHitT = S.t; S.stats.shd += took;
    bubbleMat.uniforms.uHit.value.copy(pos).sub(bubble.position); bubbleMat.uniforms.uHitT.value = 0;
    S.lastCell = { a: akey, r: 'shd', t: S.t };
    if (took >= 3 || Math.random() < .15) floatNum(pos, '🫧-' + Math.round(took), 'shd');
    log({ a: akey, p: 'shd', d: Math.round(took), lvl: A.vs.shd });
    for (let i = 0; i < 8; i++) fxAdd.spawn(pos.x, pos.y, pos.z, rr(-6, 6), rr(-6, 6), rr(-6, 6), .4, .8, .1, .7, .55, 1, 1, 3);
    if (S.shieldHp <= 0) { log({ ev: '🫧 Shield down' }); floatNum(pos, '🫧✖', 'ev'); }
    ui.dirty = true;
    const left = sd > 0 ? (sd - took) / sd : 0;      // overflow fraction reaches the hull
    if (left <= 0) return;
    raw *= left;
  }
  boom(pos, A.splash ? 1.6 : .8);
  damagePart(part, raw, akey, pos, false);
  if (A.splash) for (const id in parts) {
    const q = parts[id]; if (q === part || q.broken) continue;
    const d = partWorld(q).distanceTo(pos); if (d < A.splash) damagePart(q, raw * 0.5 * (1 - d / A.splash / 2), akey, partWorld(q), true);
  }
}
function breakPart(p, akey) {
  p.broken = true; p.hp = 0;
  const pos = partWorld(p);
  p.grp.traverse((m) => { if (m.isMesh) { m.material.color.lerp(SOOT, .75); if (m.material.emissive) m.material.emissiveIntensity = 0; } });
  if (p.def.fn !== 'hull') { p.grp.rotation.set(rr(-.35, .35), rr(-.4, .4), rr(-.35, .35)); p.grp.position.y -= .5; p.grp.scale.multiplyScalar(.92); }
  boom(pos, 3.5);
  for (let i = 0; i < 10; i++) debris(pos);
  floatNum(pos, '💥' + p.def.icon, 'ev');
  log({ ev: `💥 ${p.def.icon} ${p.def.name} destroyed`, a: akey });
  // cascades
  const fn = p.def.fn;
  if (p.def.id === 'reactor') log({ ev: '☢️ → ⚡ Power lost: weapons, shield, hangar offline; engines 25%' });
  if (p.def.id === 'shield') log({ ev: '🫧 Shield bubble collapsed' });
  if (fn === 'aim') log({ ev: `${p.def.icon} → 🎯 Aim worse (${Math.round(100 / aimMul())}%)` });
  if (fn === 'engine') log({ ev: `🔥 → 🚀 Speed ${speedNow().toFixed(0)}` });
  if (p.def.id === 'hangar') log({ ev: '🛬 Hangar gone: no more fighters' });
  if (['bow', 'mid', 'stern'].every((k) => parts[k].broken) && !S.lost) {
    S.lost = true; log({ ev: '💀 Ship lost' });
    for (let i = 0; i < 6; i++) setTimeout(() => boom(V(rr(-20, 20), rr(-2, 4), rr(-4, 4)), 5), i * 200);
    setTimeout(() => { if (S.lost) $('banner').classList.remove('hidden'); }, 1300);
  }
  ui.dirty = true;
}
function repairPart(id) {
  const p = parts[id]; if (!p) return;
  const was = p.broken;
  p.hp = p.def.hp; p.broken = false;
  p.grp.position.set(...p.def.pos); p.grp.rotation.set(0, 0, 0); p.grp.scale.set(1, 1, 1);
  p.grp.traverse((m) => { if (m.isMesh) { m.material.color.copy(m.userData.col0); if (m.material.emissive) m.material.emissiveIntensity = m.userData.em0; } });
  if (id === 'shield' && was) S.shieldHp = Math.max(S.shieldHp, C.SHIP.shieldHp * .3);
  if (S.lost && !['bow', 'mid', 'stern'].every((k) => parts[k].broken)) { S.lost = false; $('banner').classList.add('hidden'); }
  for (let i = 0; i < 12; i++) fxAdd.spawn(p.grp.position.x, p.grp.position.y + 1, p.grp.position.z, rr(-3, 3), rr(1, 5), rr(-3, 3), .7, .6, .1, .4, 1, .5, 1, 2);
  log({ ev: `🔧 ${p.def.icon} ${p.def.name} repaired` });
}

// ---------- effects ----------
function sparks(p, n) { for (let i = 0; i < n; i++) fxAdd.spawn(p.x, p.y, p.z, rr(-9, 9), rr(-4, 10), rr(-9, 9), rr(.2, .5), .45, .05, 1, rr(.6, .9), .3, 1, 2.5, 6); }
function boom(p, s) {
  for (let i = 0; i < 10 * s; i++) fxAdd.spawn(p.x, p.y, p.z, rr(-5, 5) * s, rr(-5, 5) * s, rr(-5, 5) * s, rr(.25, .6), 1.4 * s, .3, 1, rr(.45, .75), .2, 1, 3);
  for (let i = 0; i < 4 * s; i++) fxSmoke.spawn(p.x, p.y, p.z, rr(-2, 2), rr(0, 2), rr(-2, 2), rr(1.2, 2.4), 1 * s, 3 * s, .25, .24, .24, .7, .8);
}
const debrisGeo = new THREE.BoxGeometry(.5, .35, .6), debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: .9 });
function debris(p) {
  const m = new THREE.Mesh(debrisGeo, debrisMat); m.position.copy(p); m.scale.setScalar(rr(.5, 1.8));
  m.userData = { v: V(rr(-8, 8), rr(-2, 9), rr(-8, 8)), w: V(rr(-6, 6), rr(-6, 6), rr(-6, 6)), life: rr(3, 5) };
  scene.add(m); S.debris.push(m);
}

// ---------- attackers ----------
const AG = {
  fighter: new THREE.ConeGeometry(.7, 2.6, 4).rotateZ(-Math.PI / 2),
  bomber: new THREE.BoxGeometry(4, 1, 3.4),
  ship: new THREE.BoxGeometry(5, 1.6, 2.2),
  shell: new THREE.SphereGeometry(.28, 6, 4),
  rocket: new THREE.ConeGeometry(.25, 1.4, 5).rotateZ(-Math.PI / 2),
  torp: new THREE.CapsuleGeometry(.45, 2.2, 3, 8).rotateZ(Math.PI / 2),
  orb: new THREE.SphereGeometry(.8, 10, 8),
};
const RED = new THREE.MeshStandardMaterial({ color: 0xc8303c, emissive: 0x501018, metalness: .4, roughness: .5 });
const BLUE = new THREE.MeshStandardMaterial({ color: 0x4aa3ff, emissive: 0x10305a, metalness: .4, roughness: .5 });
const PM = { shell: new THREE.MeshBasicMaterial({ color: 0xffe08a }), rocket: new THREE.MeshBasicMaterial({ color: 0xffb347 }), torp: new THREE.MeshBasicMaterial({ color: 0x8ff7ff }),
  orb: new THREE.MeshBasicMaterial({ color: 0x9a7cff, transparent: true, opacity: .85 }), blue: new THREE.MeshBasicMaterial({ color: 0x8fd0ff }) };
const STAND = { gun: 58, rocket: 64, beam: 48, torp: 70, arty: 105, emp: 54 };
function pickPart(akey) {
  if (S.target && parts[S.target]) return parts[S.target];
  const alive = Object.values(parts).filter((p) => !p.broken);
  const pool = alive.length ? alive : Object.values(parts);
  return pool[(Math.random() * pool.length) | 0];
}
function camSideDir() { // spawn mostly on the side the player is looking from so attacks are visible
  const d = camera.position.clone().normalize(); const az = Math.atan2(d.z, d.x) + rr(-1.3, 1.3); const el = rr(-.25, .55);
  return V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
}
function fire(akey, count = C.COUNTS[ui.count]) {
  if (!C.ATTACKS[akey]) return 0;
  for (let i = 0; i < count; i++) spawnAttacker(akey, i);
  log({ ev: `${C.ATTACKS[akey].icon} ×${count} ${C.ATTACKS[akey].name} → ${S.target ? parts[S.target].def.icon : '🚢'}` });
  return count;
}
function spawnAttacker(akey, i) {
  const A = C.ATTACKS[akey];
  const dir = camSideDir();
  const geo = A.kind === 'fighter' ? AG.fighter : A.kind === 'bomber' ? AG.bomber : AG.ship;
  const mesh = new THREE.Mesh(geo, RED); scene.add(mesh);
  const a = { akey, A, mesh, pos: dir.clone().multiplyScalar(170 + i * 6), vel: V(), hp: A.hp || 240, mhp: A.hp || 240, state: 'in', t: 0, shots: A.n, cd: rr(0, .3) + i * .12,
    part: pickPart(akey), stand: dir.clone().multiplyScalar(STAND[A.kind] || 60 + rr(-4, 4)).add(V(rr(-6, 6), rr(-6, 6), rr(-6, 6))), orbit: rr(0, 6.28), orbR: rr(14, 22), side: Math.random() < .5 ? -1 : 1 };
  if (A.kind === 'arty') a.stand.y = Math.abs(a.stand.y) + 40;
  if (A.kind === 'bomber') { // straight run along the keel over the target part
    const tp = partWorld(a.part); const z = rr(-2, 2) + i * 2.2 - (C.COUNTS[ui.count] - 1) * 1.1;
    a.runA = V(90 * a.side, tp.y + 12 + i * .6, tp.z + z); a.runB = V(-90 * a.side, tp.y + 12 + i * .6, tp.z + z); a.pos = a.runA.clone().add(V(60 * a.side, 0, 0)); a.dropX = tp.x;
  }
  mesh.position.copy(a.pos); S.atk.push(a);
}
function faceTo(mesh, from, to) { const d = to.clone().sub(from); if (d.lengthSq() < 1e-6) return; mesh.rotation.order = 'YZX'; mesh.rotation.set(0, Math.atan2(-d.z, d.x), Math.atan2(d.y, Math.hypot(d.x, d.z))); }
function aimPoint(part, spread) { return partWorld(part).add(V(rr(-1, 1), rr(-.6, 1), rr(-1, 1)).multiplyScalar(spread)); }
function shoot(a) {
  const A = a.A, from = a.pos.clone();
  if (a.part.broken && !S.target) a.part = pickPart(a.akey);
  const to = aimPoint(a.part, 1);
  if (A.kind === 'beam') { beam(from, to, 0xff5a6a, a.akey, a.part); return; }
  const kind = { gun: 'shell', fighter: 'shell', rocket: 'rocket', torp: 'torp', arty: 'shell', emp: 'orb', bomber: 'shell' }[A.kind];
  const mesh = new THREE.Mesh(AG[kind], PM[kind]); mesh.position.copy(from); scene.add(mesh);
  const pr = { team: 'e', akey: a.akey, part: a.part, to, pos: from, mesh, life: 12, kind: A.kind, spd: A.spd || 40 };
  if (A.kind === 'arty') { // lobbed shell: ballistic arc from far above
    const T = from.distanceTo(to) / A.spd; pr.g = 18; pr.vel = to.clone().sub(from).divideScalar(T); pr.vel.y += pr.g * T / 2;
  } else if (A.kind === 'bomber') { pr.vel = a.vel.clone().multiplyScalar(.6); pr.g = 14; pr.vel.y = -2; mesh.scale.setScalar(1.8); }
  else pr.vel = to.clone().sub(from).normalize().multiplyScalar(pr.spd);
  if (A.kind === 'rocket') pr.vel.add(V(rr(-6, 6), rr(-2, 8), rr(-6, 6)));
  S.proj.push(pr);
}
// ray vs bubble for instant beams
function bubbleEntry(from, to) {
  const o = from.clone().sub(bubble.position).divide(BUB), d = to.clone().sub(from).divide(BUB);
  const a = d.dot(d), b = 2 * o.dot(d), c = o.dot(o) - 1, disc = b * b - 4 * a * c; if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a); return t >= 0 && t <= 1 ? from.clone().lerp(to, t) : null;
}
function beam(from, to, col, akey, part, onHit) {
  let end = to;
  if (akey) { const e = shieldUp() && !inBubble(from) ? bubbleEntry(from, to) : null; if (e) end = e; }
  const g = new THREE.BufferGeometry().setFromPoints([from, end]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
  scene.add(l); S.beams.push({ l, t: .1 });
  if (akey) impact(akey, part, end, C.ATTACKS[akey].dmg); else if (onHit) onHit(end);
}
function updAttackers(dt) {
  for (const a of S.atk) {
    a.t += dt; const A = a.A;
    if (A.kind === 'bomber') {
      const goal = a.state === 'in' ? a.runA : a.runB;
      const dir = goal.clone().sub(a.pos); const d = dir.length();
      a.vel.copy(dir.normalize().multiplyScalar(A.spd * (a.state === 'in' ? 1.6 : 1)));
      if (a.state === 'in') { if (d < 3) a.state = 'run'; }
      else if (a.state === 'run') { a.cd -= dt; if (a.shots > 0 && Math.abs(a.pos.x - a.dropX) < 9 && a.cd <= 0) { a.cd = A.gap; a.shots--; shoot(a); } if (d < 3) { a.state = 'out'; a.runB = a.runB.clone().add(V(-150 * a.side, 20, 0)); } }
    } else if (A.kind === 'fighter') {
      const c = partWorld(a.part);
      if (a.state === 'in') { a.vel.copy(c.clone().sub(a.pos).normalize().multiplyScalar(A.spd * 1.5)); if (a.pos.distanceTo(c) < a.orbR + 4) a.state = 'orbit'; }
      else if (a.state === 'orbit') {
        a.orbit += dt * 1.1;
        const goal = c.clone().add(V(Math.cos(a.orbit) * a.orbR, 6 + Math.sin(a.orbit * 2) * 4, Math.sin(a.orbit) * a.orbR));
        a.vel.lerp(goal.sub(a.pos).multiplyScalar(2.2), clamp(dt * 3, 0, 1));
        a.cd -= dt; if (a.cd <= 0 && a.shots > 0) { a.cd = A.gap; a.shots--; shoot(a); }
        if (a.shots <= 0) a.state = 'out';
      } else a.vel.lerp(a.pos.clone().normalize().multiplyScalar(A.spd * 2), dt * 2);
    } else {
      if (a.state === 'in') { const dir = a.stand.clone().sub(a.pos); const d = dir.length(); a.vel.copy(dir.normalize().multiplyScalar(Math.min(60, d * 2 + 6))); if (d < 1.5) a.state = 'fire'; }
      else if (a.state === 'fire') { a.vel.multiplyScalar(.9); a.cd -= dt; if (a.cd <= 0 && a.shots > 0) { a.cd = A.gap; a.shots--; shoot(a); } if (a.shots <= 0) { a.state = 'out'; a.t = 0; } }
      else a.vel.lerp(a.pos.clone().normalize().multiplyScalar(50), dt);
    }
    a.pos.addScaledVector(a.vel, dt); a.mesh.position.copy(a.pos);
    if (A.kind === 'fighter' || A.kind === 'bomber' || a.state !== 'fire') faceTo(a.mesh, a.pos, a.pos.clone().add(a.vel));
    else faceTo(a.mesh, a.pos, partWorld(a.part));
    // engine trail
    if (Math.random() < .6) { const b = a.vel.clone().normalize().multiplyScalar(-1.6).add(a.pos); fxAdd.spawn(b.x, b.y, b.z, 0, 0, 0, .3, .7, .1, 1, .4, .3, .8); }
    if ((a.state === 'out' && a.pos.length() > 190) || a.t > 60) a.gone = true;
  }
  S.atk = S.atk.filter((a) => { if (a.gone) scene.remove(a.mesh); return !a.gone; });
}
function updProjectiles(dt) {
  for (const p of S.proj) {
    p.life -= dt;
    if (p.kind === 'rocket' && p.team === 'e') { const want = p.to.clone().sub(p.pos).normalize().multiplyScalar(p.spd); p.vel.lerp(want, clamp(dt * 3, 0, 1)); }
    if (p.homing && p.homing.hp > 0) { const want = p.homing.pos.clone().sub(p.pos).normalize().multiplyScalar(p.spd); p.vel.lerp(want, clamp(dt * 4, 0, 1)); }
    if (p.g) p.vel.y -= p.g * dt;
    const prev = p.pos.clone();
    p.pos.addScaledVector(p.vel, dt); p.mesh.position.copy(p.pos); faceTo(p.mesh, prev, p.pos);
    if (p.kind === 'rocket' || p.kind === 'torp') fxSmoke.spawn(prev.x, prev.y, prev.z, 0, 0, 0, .8, .4, 1.2, .7, .7, .75, .5);
    if (p.kind === 'torp' || p.kind === 'emp') fxAdd.spawn(prev.x, prev.y, prev.z, 0, 0, 0, .3, 1.2, .2, .5, .9, 1, .8);
    if (p.team === 'e') {
      if (shieldUp() && inBubble(p.pos) && !inBubble(prev)) { impact(p.akey, p.part, p.pos, C.ATTACKS[p.akey].dmg); p.dead = true; continue; }
      if (p.pos.distanceTo(p.to) < Math.max(1.3, p.vel.length() * dt) || (p.g && p.pos.y < p.to.y && p.vel.y < 0)) { impact(p.akey, p.part, p.pos.clone(), C.ATTACKS[p.akey].dmg); p.dead = true; continue; }
    } else {
      for (const a of S.atk) if (a.pos.distanceTo(p.pos) < 2.6) { hitAttacker(a, p.dmg); p.dead = true; break; }
    }
    if (p.life <= 0) p.dead = true;
  }
  S.proj = S.proj.filter((p) => { if (p.dead) scene.remove(p.mesh); return !p.dead; });
}
function hitAttacker(a, dmg) {
  if (a.gone) return;
  a.hp -= dmg; sparks(a.pos, 4);
  if (a.hp <= 0) { a.gone = true; boom(a.pos, 1.4); floatNum(a.pos, '✖' + a.A.icon, 'ev'); log({ ev: `🎯 Ship shot down ${a.A.icon} ${a.A.name}` }); S.downed = (S.downed || 0) + 1; }
}

// ---------- ship systems ----------
const tmp = V();
function nearestAttacker(from, range) { let best = null, bd = range; for (const a of S.atk) { if (a.gone) continue; const d = a.pos.distanceTo(from); if (d < bd) { bd = d; best = a; } } return best; }
function updShip(dt) {
  // shield regen
  if (!parts.shield.broken && power() && S.shieldOn && S.t - S.shieldHitT > C.SHIP.shieldDelay) S.shieldHp = Math.min(C.SHIP.shieldHp, S.shieldHp + C.SHIP.shieldRegen * dt);
  // weapons fire back
  const spread = 0.035 * aimMul(), range = C.SHIP.fireRange * (parts.sensors.broken ? .6 : 1);
  for (const id of ['gun1', 'gun2', 'launcher', 'laser']) {
    const p = parts[id]; if (!working(p)) continue;
    const from = partWorld(p).add(V(0, 1, 0));
    const tgt = S.fireBack ? nearestAttacker(from, range) : null;
    if (p.aim) { // turn toward target (or idle sweep)
      const look = tgt ? tgt.pos : from.clone().add(V(Math.cos(S.t * .3 + p.cd * 6) * 10, 0, Math.sin(S.t * .3 + p.cd * 6) * 10));
      const lp = p.grp.worldToLocal(look.clone()); const yaw = Math.atan2(-lp.z, lp.x);
      const dy = ((yaw - p.aim.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI; p.aim.rotation.y += clamp(dy, -dt * 3, dt * 3);
      if (p.pitch) p.pitch.rotation.z = clamp(Math.atan2(lp.y, Math.hypot(lp.x, lp.z)), -.1, 1.2);
    }
    p.cd -= dt; if (!tgt || p.cd > 0) continue;
    const wpn = p.def.wpn;
    const lead = tgt.pos.clone().addScaledVector(tgt.vel, from.distanceTo(tgt.pos) / 80);
    const miss = V(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(from.distanceTo(lead) * spread);
    if (wpn === 'cannon') { p.cd = .45 * (parts.bridge.broken ? 1.6 : 1); for (const o of [-.4, .4]) { const st = from.clone().add(V(0, 0, o)); const m = new THREE.Mesh(AG.shell, PM.blue); m.position.copy(st); scene.add(m); S.proj.push({ team: 's', pos: st, vel: lead.clone().add(miss).sub(st).normalize().multiplyScalar(80), mesh: m, life: 2, dmg: 22 }); } }
    else if (wpn === 'rocket') { p.cd = 1.4; const m = new THREE.Mesh(AG.rocket, PM.rocket); m.position.copy(from); scene.add(m); S.proj.push({ team: 's', kind: 'rocket', pos: from.clone(), vel: V(0, 18, 0), homing: tgt, spd: 40 / Math.sqrt(aimMul()), mesh: m, life: 5, dmg: 70 }); }
    else if (wpn === 'laser') { p.cd = .5; const hit = Math.random() < 0.85 / aimMul(); beam(from, hit ? tgt.pos.clone() : lead.clone().add(miss.multiplyScalar(3)), 0x6ff3ff, null, null, () => { if (hit) hitAttacker(tgt, 16); }); }
  }
  // hangar launches fighters while it works
  if (working(parts.hangar)) {
    S.hangarT -= dt;
    if (S.hangarT <= 0 && S.friends.length < C.SHIP.hangarMax) {
      S.hangarT = C.SHIP.hangarEvery;
      const h = partWorld(parts.hangar).add(V(0, 0, 4.5));
      const mesh = new THREE.Mesh(AG.fighter, BLUE); mesh.scale.setScalar(.8); mesh.position.copy(h); scene.add(mesh);
      S.friends.push({ mesh, pos: h, vel: V(0, 0, 14), hp: 60, orbit: rr(0, 6.28), cd: 1, r: rr(26, 34), y: rr(-6, 10) });
      S.launched++; log({ ev: '🛬 → ✈️ Fighter launched' });
    }
  }
  for (const f of S.friends) {
    const tgt = S.fireBack ? nearestAttacker(f.pos, 80) : null;
    let goal;
    if (tgt) goal = tgt.pos.clone().add(tgt.pos.clone().sub(f.pos).normalize().multiplyScalar(-8));
    else { f.orbit += dt * .45; goal = V(Math.cos(f.orbit) * f.r, f.y, Math.sin(f.orbit) * f.r * .6); }
    f.vel.lerp(goal.sub(f.pos).normalize().multiplyScalar(24), clamp(dt * 2, 0, 1));
    f.pos.addScaledVector(f.vel, dt); f.mesh.position.copy(f.pos); faceTo(f.mesh, f.pos, f.pos.clone().add(f.vel));
    f.cd -= dt;
    if (tgt && f.cd <= 0 && f.pos.distanceTo(tgt.pos) < 30) { f.cd = .5; const hit = Math.random() < .6; beam(f.pos.clone(), hit ? tgt.pos.clone() : tgt.pos.clone().add(V(rr(-4, 4), rr(-4, 4), rr(-4, 4))), 0x8fd0ff, null, null, () => { if (hit) hitAttacker(tgt, 12); }); }
  }
  // enemy fighters can shoot down escort fighters
  for (const a of S.atk) if (a.A.kind === 'fighter' && a.state === 'orbit' && S.friends.length && Math.random() < dt * .3) { const f = S.friends[(Math.random() * S.friends.length) | 0]; f.hp -= 20; if (f.hp <= 0) { f.dead = true; boom(f.pos, 1); } }
  S.friends = S.friends.filter((f) => { if (f.dead) scene.remove(f.mesh); return !f.dead; });

  // looks: lights, engines, smoke from damaged parts
  const thrust = speedNow() / C.SHIP.speed;
  for (const id in parts) {
    const p = parts[id], pos = partWorld(p, tmp);
    const live = !p.broken && (p.def.fn === 'hull' || p.def.fn === 'aim' || p.def.fn === 'power' ? true : p.def.fn === 'engine' ? thrust > 0 : power());
    const hullDark = p.def.fn === 'hull' && !power();
    if (!p.broken) p.grp.traverse((m) => { if (m.isMesh && m.userData.glow) m.material.emissiveIntensity = (live && !hullDark ? m.userData.em0 : 0.04) * (p.def.fn === 'engine' ? .3 + thrust : 1); });
    if (p.pulse && !p.broken) p.pulse.rotation.z += dt * (live ? 2 : 0);
    if (p.spin && !p.broken) p.spin.rotation.y += dt * 1.2;
    const fr = p.hp / p.def.hp;
    if (p.broken) { if (Math.random() < dt * 16) fxSmoke.spawn(pos.x + rr(-1, 1), pos.y + 1, pos.z + rr(-1, 1), rr(-.5, .5), rr(1.5, 3.5), rr(-.5, .5), rr(2, 3.5), 1, 4, .42, .4, .4, .75, .3, -.4);
      if (Math.random() < dt * 3) sparks(pos.clone().add(V(rr(-1, 1), 1, rr(-1, 1))), 6); if (Math.random() < dt * 12) fxAdd.spawn(pos.x + rr(-.8, .8), pos.y + .8, pos.z + rr(-.8, .8), rr(-1, 1), rr(1, 3), rr(-1, 1), .6, 1.6, .4, 1, .45, .1, 1); }
    else if (fr < .5 && Math.random() < dt * 8 * (1 - fr)) fxSmoke.spawn(pos.x, pos.y + 1, pos.z, rr(-.4, .4), rr(1, 2.5), rr(-.4, .4), 2, .5, 2.2, .35, .35, .36, .45, .3, -.3);
    if (p.def.fn === 'engine' && !p.broken && thrust > 0) { const n = p.grp.localToWorld(p.nozzle.clone()); for (let i = 0; i < 2; i++) fxAdd.spawn(n.x, n.y + rr(-.6, .6), n.z + rr(-.6, .6), -rr(10, 18) * thrust, 0, 0, .35, 2 * thrust + .3, .2, .4, .7, 1, .9); }
  }
}

// ---------- main loop ----------
let last = performance.now();
function step(dt) {
  S.t += dt;
  updShip(dt); updAttackers(dt); updProjectiles(dt);
  for (const b of S.beams) { b.t -= dt; b.l.material.opacity = Math.max(0, b.t * 10); }
  S.beams = S.beams.filter((b) => { if (b.t <= 0) { scene.remove(b.l); b.l.geometry.dispose(); b.l.material.dispose(); } return b.t > 0; });
  for (const d of S.debris) { const u = d.userData; d.position.addScaledVector(u.v, dt); d.rotation.x += u.w.x * dt; d.rotation.y += u.w.y * dt; u.life -= dt; if (Math.random() < dt * 6) fxSmoke.spawn(d.position.x, d.position.y, d.position.z, 0, 0, 0, 1, .3, .9, .2, .2, .2, .5); }
  S.debris = S.debris.filter((d) => { if (d.userData.life <= 0) scene.remove(d); return d.userData.life > 0; });
  // stars stream past at ship speed
  const sp = speedNow() * 3 * dt, arr = starGeo.attributes.position.array;
  if (sp > 0) { for (let i = 0; i < STAR_N; i++) { arr[i * 3] -= sp; if (arr[i * 3] < -400) arr[i * 3] += 800; } starGeo.attributes.position.needsUpdate = true; }
  shipRoot.position.y = Math.sin(S.t * .6) * .25 * (S.lost ? 0 : 1);
  if (S.lost) shipRoot.rotation.z = Math.min(.25, shipRoot.rotation.z + dt * .05); else shipRoot.rotation.z *= .95;
  fxAdd.update(dt); fxSmoke.update(dt);
  bubbleMat.uniforms.uHitT.value += dt;
}
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(.05, (now - last) / 1000); last = now;
  if (!S.paused) { const dt = rdt * S.timeScale; step(dt); for (const f of floats) f.t += dt; }
  // bubble look
  const up = shieldUp(); bubble.visible = up || bubbleMat.uniforms.uHitT.value < .6 && S.shieldOn && !parts.shield.broken && power();
  bubbleMat.uniforms.uA.value = .25 + .55 * (S.shieldHp / C.SHIP.shieldHp);
  controls.update();
  if (!window.__noRender) renderer.render(scene, camera);
  drawFloats();
  hud(now);
}
const pv = V();
function drawFloats() {
  const W = innerWidth, H = innerHeight;
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    if (f.t > 1.3) { f.el.remove(); floats.splice(i, 1); continue; }
    pv.copy(f.pos); pv.y += f.t * 3; pv.project(camera);
    if (pv.z > 1) { f.el.style.opacity = 0; continue; }
    f.el.style.transform = `translate(${((pv.x + 1) / 2 * W).toFixed(0)}px,${((1 - pv.y) / 2 * H).toFixed(0)}px) translate(-50%,-50%)`;
    f.el.style.opacity = String(clamp(1.6 - f.t * 1.3, 0, 1));
  }
}

// ---------- HUD ----------
const tAgo = (t) => { const s = Math.max(0, S.t - t); return s < 60 ? s.toFixed(0) + 's' : (s / 60).toFixed(0) + 'm'; };
function barCls(f) { return f < .3 ? 'low' : f < .6 ? 'mid' : ''; }
function partStatus(p) { return p.broken ? '💥' : !working(p) ? '⚡✖' : p.hp < p.def.hp * .5 ? '🔥' : '✅'; }
let lastHud = 0;
function hud(now) {
  if (now - lastHud < 120 && !ui.dirty) return;
  lastHud = now;
  $('shBar').style.width = (100 * (shieldUp() ? S.shieldHp / C.SHIP.shieldHp : 0)) + '%';
  $('spdV').textContent = speedNow().toFixed(0);
  $('pwrV').textContent = power() ? 'ON' : 'OFF'; $('pwrV').style.color = power() ? '#4dff88' : '#ff8f80';
  $('aimV').textContent = Math.round(100 / aimMul()) + '%';
  $('fgtV').textContent = S.friends.length + (working(parts.hangar) ? '' : '✖');
  const tp = S.target && parts[S.target];
  $('tgtIc').textContent = tp ? tp.def.icon : '🚢'; $('tgtName').textContent = tp ? tp.def.name : 'Whole ship';
  if (!ui.dirty && ui.tab !== 'log') return;
  if (ui.dirty || now - (ui.logT || 0) > 1000) { ui.logT = now; renderSheet(); }
  ui.dirty = false;
}
function renderSheet() {
  const body = $('sheetBody'); if ($('sheet').classList.contains('hidden')) return;
  const keepScroll = $('sheet').scrollTop;
  if (ui.tab === 'parts') {
    const rows = [`<div class="row ${S.target ? '' : 'sel'}" data-tgt=""><span class="pi">🚢</span><span class="nm">Whole ship</span><span class="ar">🎯</span></div>`,
      `<div class="row ${shieldUp() ? '' : 'off'}"><span class="pi">🫧</span><span class="nm">Bubble</span><span class="ar">🫧</span><span class="bar"><i style="width:${100 * S.shieldHp / C.SHIP.shieldHp}%"></i></span><span class="hpn">${Math.round(S.shieldHp)}</span><span class="stt">${shieldUp() ? '✅' : '✖'}</span></div>`];
    for (const d of C.PARTS) {
      const p = parts[d.id], f = p.hp / d.hp;
      rows.push(`<div class="row ${S.target === d.id ? 'sel' : ''} ${p.broken ? 'broken' : !working(p) ? 'off' : ''}" data-tgt="${d.id}" data-part="${d.id}"><span class="pi">${d.icon}</span><span class="nm">${d.name}</span><span class="ar">${C.ARMOR[d.armor].icon}</span>` +
        `<span class="bar"><i class="${barCls(f)}" style="width:${100 * f}%"></i></span><span class="hpn">${Math.ceil(p.hp)}</span><span class="stt">${partStatus(p)}</span>` +
        `<button class="rb fix" data-fix="${d.id}" ${p.hp >= d.hp ? 'disabled' : ''} title="Repair">🔧</button></div>`);
    }
    body.innerHTML = rows.join('');
  } else if (ui.tab === 'log') {
    body.innerHTML = '<div class="log">' + S.log.slice(0, 60).map((e) => e.ev
      ? `<div class="row"><span class="tm">${tAgo(e.t)}</span><span class="ev">${e.ev}</span></div>`
      : `<div class="row"><span class="tm">${tAgo(e.t)}</span><span>${C.ATTACKS[e.a].icon}</span><span>→</span><span>${e.p === 'shd' ? '🫧' : parts[e.p].def.icon}</span><span class="ar">${e.p === 'shd' ? '' : C.ARMOR[parts[e.p].def.armor].icon}</span>${e.sp ? '<span title="splash">💫</span>' : ''}<span class="dmg ${e.p === 'shd' ? 'shd' : ''}" style="color:${['#666', '#ff8f80', '#ffc84a', '#d8ff7a', '#4dff88', '#8ff7ff'][e.lvl]}">-${e.d}</span></div>`).join('') + '</div>';
  } else {
    const tA = S.target ? parts[S.target].def.armor : null, hot = S.lastCell && S.t - S.lastCell.t < 3 ? S.lastCell : null;
    let h = '<table class="mx"><tr><th></th>' + C.ARMOR_KEYS.map((k) => `<th class="${k === tA ? 'col' : ''}" title="${C.ARMOR[k].name}">${C.ARMOR[k].icon}</th>`).join('') + '</tr>';
    for (const a of C.ATTACK_KEYS) {
      h += `<tr><th title="${C.ATTACKS[a].name}">${C.ATTACKS[a].icon}</th>` + C.ARMOR_KEYS.map((k) => { const l = C.ATTACKS[a].vs[k] ?? 0; return `<td class="l${l} ${k === tA ? 'col' : ''} ${hot && hot.a === a && hot.r === k ? 'hot' : ''}">×${C.LVL_MULT[l]}</td>`; }).join('') + '</tr>';
    }
    body.innerHTML = h + '</table><div class="mxkey">🫧 shield · 🧱 plate · 🛡️ heavy · ⚙️ mech · 📡 light · ⚡ energy</div>';
  }
  $('sheet').scrollTop = keepScroll;
}
function setTab(t) {
  const open = !$('sheet').classList.contains('hidden');
  if (open && ui.tab === t) $('sheet').classList.add('hidden'); else { ui.tab = t; $('sheet').classList.remove('hidden'); }
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab && !$('sheet').classList.contains('hidden')));
  ui.dirty = true; renderSheet(); fit(false);
}
function setTarget(id) { S.target = id && parts[id] ? id : null; ui.dirty = true; for (const a of S.atk) if (S.target) a.part = parts[S.target]; }

// ---------- controls wiring ----------
$('bPause').innerHTML = svg(ICON.pause); $('bReset').innerHTML = svg(ICON.reset); $('backIc').innerHTML = svg(ICON.back);
function syncButtons() {
  $('bPause').innerHTML = svg(S.paused ? ICON.play : ICON.pause); $('bPause').classList.toggle('paused', S.paused);
  $('slowV').textContent = '×' + C.SPEEDS[ui.speedI]; $('bSlow').classList.toggle('on', ui.speedI > 0);
  $('shieldV').textContent = S.shieldOn ? 'ON' : 'OFF'; $('bShield').classList.toggle('on', S.shieldOn); $('bShield').classList.toggle('warn', !S.shieldOn);
  $('backV').textContent = S.fireBack ? 'ON' : 'OFF'; $('bBack').classList.toggle('on', S.fireBack);
  $('countV').textContent = '×' + C.COUNTS[ui.count];
}
$('bPause').onclick = () => { S.paused = !S.paused; syncButtons(); };
$('bSlow').onclick = () => { ui.speedI = (ui.speedI + 1) % C.SPEEDS.length; S.timeScale = C.SPEEDS[ui.speedI]; syncButtons(); };
$('bReset').onclick = () => { const p = S.paused; reset(); S.paused = p; syncButtons(); };
$('bAgain').onclick = () => { reset(); syncButtons(); };
$('bShield').onclick = () => { S.shieldOn = !S.shieldOn; log({ ev: S.shieldOn ? '🫧 Shield ON' : '🫧 Shield OFF' }); syncButtons(); };
$('bBack').onclick = () => { S.fireBack = !S.fireBack; log({ ev: S.fireBack ? '↩ Ship fires back' : '↩ Ship holds fire' }); syncButtons(); };
$('bCount').onclick = () => { ui.count = (ui.count + 1) % C.COUNTS.length; syncButtons(); };
$('tgt').onclick = () => setTarget(null);
$('palette').innerHTML = C.ATTACK_KEYS.map((k) => `<button class="atk" data-atk="${k}" title="${C.ATTACKS[k].name}"><span class="ai">${C.ATTACKS[k].icon}</span><small>${C.ATTACKS[k].name}</small></button>`).join('');
$('palette').onclick = (e) => { const b = e.target.closest('.atk'); if (!b) return; fire(b.dataset.atk); b.classList.add('fired'); setTimeout(() => b.classList.remove('fired'), 200); };
document.querySelectorAll('.tab').forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });
$('sheetBody').onclick = (e) => {
  const fx = e.target.closest('[data-fix]'); if (fx) { repairPart(fx.dataset.fix); ui.dirty = true; return; }
  const r = e.target.closest('[data-tgt]'); if (r) setTarget(r.dataset.tgt || null);
};
// tap on the ship = choose that part as target (tap it again = whole ship); drags go to the camera
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
cv.addEventListener('pointerup', (e) => {
  if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (moved > 10 || dt > 600) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(partMeshes, false)[0];
  if (hit) { const id = hit.object.userData.part; setTarget(S.target === id ? null : id); floatNum(hit.point, '🎯' + parts[id].def.icon, 'ev'); }
});

// ---------- layout: keep the ship centred in the free area between the UI ----------
function freeRect() {
  let l = 0, t = 0, r = innerWidth, b = innerHeight;
  const top = $('stats').getBoundingClientRect(); t = Math.max(t, top.bottom);
  const land = innerWidth > innerHeight;
  const pal = $('palette').getBoundingClientRect(), dock = $('dock').getBoundingClientRect(), sheet = $('sheet');
  if (!land) b = Math.min(b, (sheet.classList.contains('hidden') ? $('tabs') : sheet).getBoundingClientRect().top);
  else { r = Math.min(r, sheet.classList.contains('hidden') ? innerWidth - 60 : dock.left); if (pal.height > innerHeight * .6) l = pal.right; else b = Math.min(b, pal.top); }
  return { l, t, r, b, w: Math.max(50, r - l), h: Math.max(50, b - t) };
}
function fit(resetDist = true) {
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  const f = freeRect(), cx = (f.l + f.r) / 2, cy = (f.t + f.b) / 2;
  camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
  camera.updateProjectionMatrix();
  if (resetDist) {
    const tf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const half = Math.atan(tf * Math.min(f.w, f.h * 1.15) / H); const d = 27 / Math.sin(half);
    camera.position.copy(V(.55, .38, .74).normalize().multiplyScalar(clamp(d, 30, 200)));
    controls.target.set(0, 0, 0);
  }
  ui.free = f;
}
addEventListener('resize', () => fit(true));

// ---------- test / debug hooks ----------
window.__ss = {
  get S() { return S; }, parts, fire, setTarget, repairPart, reset,
  state: () => ({ t: S.t, paused: S.paused, timeScale: S.timeScale, shieldHp: S.shieldHp, shieldUp: shieldUp(), power: power(), speed: speedNow(), aim: 1 / aimMul(), friends: S.friends.length, launched: S.launched, atk: S.atk.length, proj: S.proj.length,
    fireBack: S.fireBack, count: C.COUNTS[ui.count], target: S.target, lost: S.lost, downed: S.downed || 0, log: S.log.length, stats: { ...S.stats },
    parts: Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, { hp: Math.round(p.hp), broken: p.broken, on: working(p) }])) }),
  run: (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) step(dt); },
  screenOf: (id) => { const p = partWorld(parts[id]).project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; },
  free: () => ui.free,
};

reset(); syncButtons();
if (innerWidth > innerHeight && innerWidth > 1000) setTab('parts');
fit(true);
requestAnimationFrame(frame);
