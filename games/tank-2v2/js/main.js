import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { buildMap, renderMinimap, obstacles, sdObs, segmentHitT, pushOut, minObsDist, HALF, heightAt, surfaceY, waterClass, inForest, terrainSpeed, WATER_Y } from './map.js';
import { NavGrid } from './nav.js';
import { BRIDGES as BRIDGES_INFO, riverZ, FORD } from './map.js';
import { Particles } from './particles.js';

// ---------- tuning ----------
const CFG = {
  speed: 7.5, turn: 2.6, turretTurn: 2.4, range: 40, reload: 2.1, shellSpeed: 72, gravity: 14,
  hp: 120, dmgMin: 17, dmgMax: 25, radius: 2.1,
  minDist: 8, maxDist: 330, vision: 70, forestVision: 24,
};
const TEAM = {
  blue: { main: 0x3d7ee6, trim: 0x1f4f9c, ring: 0x59f0ff, css: '#4aa3ff' },
  red: { main: 0xd9483a, trim: 0x8c2a20, ring: 0xff4d4d, css: '#ff5a4a' },
};
const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
$('#app').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9cbe0);
scene.fog = new THREE.Fog(0xa9cbe0, 200, 600);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 1600);

scene.add(new THREE.HemisphereLight(0xe3f0ff, 0x6b5d45, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.position.set(-45, 85, 35); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 300 });
const SUN_OFF = new THREE.Vector3(-45, 85, 35); scene.add(sun.target);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun);

const { terrain: groundMesh, treeCount } = buildMap(scene);
const nav = new NavGrid(1.75, 2.7);

const fx = new Particles(scene, 1800, true, 1.2);    // fire, sparks, flashes
const smoke = new Particles(scene, 2200, false, 1.6); // smoke, dust

// pooled flash lights (kept in scene permanently so shader programs never change)
const flashLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffb060, 0, 26, 1.6); scene.add(l); return { l, t: 0, peak: 0 }; });
let flashIdx = 0;
function flashLight(p, peak, color = 0xffb060) {
  const f = flashLights[flashIdx++ % flashLights.length];
  f.l.position.set(p.x, p.y + 1.2, p.z); f.l.color.setHex(color); f.peak = peak; f.t = 0.18;
}

// ---------- camera: MapControls (pan/rotate) + custom smooth wheel zoom ----------
const controls = new MapControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.enableZoom = false;            // wheel handled below for smooth, clamped, tilt-aware zoom
controls.screenSpacePanning = false;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.minPolarAngle = 0.12; controls.maxPolarAngle = 1.36;
controls.rotateSpeed = 0.6; controls.panSpeed = 1.1;
const cam = { dist: 70, want: 70, tiltT: 0, tiltWant: 0.9, shift: new THREE.Vector3(), shake: 0, shakeOff: new THREE.Vector3() };
function setCameraHome() {
  controls.target.set(0, 0, 100);
  const phi = 0.84; cam.dist = cam.want = 78;
  camera.position.set(0, Math.cos(phi) * cam.dist, 100 + Math.sin(phi) * cam.dist);
  camera.lookAt(controls.target); controls.update();
}
setCameraHome();
const tiltFor = (d) => THREE.MathUtils.lerp(1.3, 0.42, clamp((d - CFG.minDist) / (CFG.maxDist - CFG.minDist), 0, 1) ** 0.55);

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(groundMesh, false)[0];
  if (hit) return hit.point.clone();
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, p) ? p : null;
}
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const old = cam.want;
  const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  cam.want = clamp(cam.want * Math.exp(dy * 0.0013), CFG.minDist, CFG.maxDist);
  // zoom toward cursor: keep the ground point under the mouse roughly fixed
  const p = groundAt(e.clientX, e.clientY);
  if (p && cam.want !== old) {
    const k = 1 - cam.want / old;
    cam.shift.add(p.sub(controls.target).setY(0).multiplyScalar(k * 0.85));
  }
  cam.tiltWant = tiltFor(cam.want); cam.tiltT = 0.7;
}, { passive: false });
controls.addEventListener('start', () => { cam.tiltT = 0; });

const keys = new Set();
const sph = new THREE.Spherical();
function updateCamera(dt) {
  camera.position.sub(cam.shakeOff); cam.shakeOff.set(0, 0, 0);
  // keyboard pan
  let fx_ = 0, fz_ = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fz_ += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fz_ -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) fx_ -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) fx_ += 1;
  const move = new THREE.Vector3();
  if (fx_ || fz_) {
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    move.addScaledVector(fwd, fz_).addScaledVector(right, fx_).normalize().multiplyScalar((12 + cam.dist * 0.9) * dt);
  }
  const k = Math.min(1, dt * 9);
  move.addScaledVector(cam.shift, k); cam.shift.multiplyScalar(1 - k);
  // clamp target to arena
  const nt = controls.target.clone().add(move);
  nt.x = clamp(nt.x, -HALF - 10, HALF + 10); nt.z = clamp(nt.z, -HALF - 10, HALF + 10); nt.y = 0;
  move.subVectors(nt, controls.target);
  controls.target.add(move); camera.position.add(move);
  // smooth zoom + tilt
  cam.dist += (cam.want - cam.dist) * Math.min(1, dt * 10);
  sph.setFromVector3(camera.position.clone().sub(controls.target));
  sph.radius = cam.dist;
  if (cam.tiltT > 0) { cam.tiltT -= dt; sph.phi += (cam.tiltWant - sph.phi) * Math.min(1, dt * 5); }
  sph.phi = clamp(sph.phi, controls.minPolarAngle, controls.maxPolarAngle);
  camera.position.setFromSpherical(sph).add(controls.target);
  controls.update();
  scene.fog.near = 120 + cam.dist * 1.1; scene.fog.far = 420 + cam.dist * 2.2;
  // shadow frustum follows the view and grows with zoom
  const ext = clamp(cam.dist * 1.15, 60, 170), sc = sun.shadow.camera;
  if (Math.abs(sc.right - ext) > 4) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
  sun.target.position.set(Math.round(controls.target.x / 4) * 4, 0, Math.round(controls.target.z / 4) * 4);
  sun.position.copy(sun.target.position).add(SUN_OFF);
  // shake
  if (cam.shake > 0.001) {
    cam.shakeOff.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(cam.shake * (0.4 + cam.dist * 0.012));
    camera.position.add(cam.shakeOff); cam.shake *= Math.exp(-dt * 9);
  }
}
function addShake(p, amount) {
  const d = camera.position.distanceTo(p);
  const f = clamp(1 - d / (40 + cam.dist * 0.8), 0, 1);
  cam.shake = Math.min(1.2, cam.shake + amount * f);
}

// ---------- tanks ----------
let tanks = [], shells = [], wrecks = [], emitters = [], markers = [];
const game = { state: 'playing', time: 0, endAt: 0, stats: { shots: 0, hits: 0, kills: 0 }, timeScale: 1, result: null };
const selected = new Set();
const pickMeshes = [];

const shellGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.5, 6).rotateX(Math.PI / 2);
const shellMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, toneMapped: false });
const ringGeo = new THREE.RingGeometry(2.95, 3.25, 48).rotateX(-Math.PI / 2);
const scorchTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(20,16,12,0.85)'); gr.addColorStop(.6, 'rgba(30,24,18,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();

function buildTank(team) {
  const C = TEAM[team];
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const main = new THREE.MeshStandardMaterial({ color: C.main, roughness: .6, metalness: .2, flatShading: true });
  const trim = new THREE.MeshStandardMaterial({ color: C.trim, roughness: .7, metalness: .2, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: .9, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: 0x5b6066, roughness: .6, metalness: .4, flatShading: true });
  const mk = (geo, m, x, y, z, parent = body) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
  for (const s of [-1, 1]) {
    mk(new THREE.BoxGeometry(0.9, 0.95, 4.9), dark, s * 1.55, 0.5, 0);
    mk(new THREE.BoxGeometry(1.05, 0.12, 5.1), trim, s * 1.55, 1.04, 0);
    for (let k = 0; k < 5; k++) { const w = mk(new THREE.CylinderGeometry(.36, .36, .14, 10), metal, s * 2.03, .45, -1.72 + k * .86); w.rotation.z = Math.PI / 2; }
  }
  mk(new THREE.BoxGeometry(2.3, 0.75, 4.4), main, 0, 0.95, 0);
  const glacis = mk(new THREE.BoxGeometry(2.3, 0.14, 1.25), main, 0, 1.12, 2.28); glacis.rotation.x = 0.55;
  mk(new THREE.BoxGeometry(1.8, 0.16, 1.1), trim, 0, 1.38, -1.55);
  const turret = new THREE.Group(); turret.position.set(0, 1.33, -0.15); body.add(turret);
  mk(new THREE.CylinderGeometry(1.0, 1.18, 0.66, 8), main, 0, 0.33, 0, turret);
  mk(new THREE.BoxGeometry(1.5, 0.52, 1.0), main, 0, 0.3, -0.85, turret);
  mk(new THREE.BoxGeometry(0.75, 0.5, 0.45), trim, 0, 0.33, 1.05, turret);
  mk(new THREE.CylinderGeometry(.32, .32, .14, 10), trim, 0.38, 0.72, -0.25, turret);
  mk(new THREE.CylinderGeometry(.025, .025, 1.9, 4), dark, -0.62, 1.5, -0.9, turret);
  const barrel = new THREE.Group(); barrel.position.set(0, 0.36, 1.15); turret.add(barrel);
  const tube = mk(new THREE.CylinderGeometry(.12, .14, 2.7, 8), metal, 0, 0, 1.35, barrel); tube.rotation.x = Math.PI / 2;
  const brake = mk(new THREE.CylinderGeometry(.2, .2, .42, 8), dark, 0, 0, 2.7, barrel); brake.rotation.x = Math.PI / 2;
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 3.0); barrel.add(muzzle);
  // selection ring + invisible pick volume
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: C.ring, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  ring.position.y = 0.07; ring.visible = false; ring.renderOrder = 1; root.add(ring);
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 3.4, 12), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.y = 1.5; root.add(pick);
  return { root, body, turret, barrel, muzzle, ring, pick, mats: { main, trim } };
}

// R.U.S.E.-style: no health bars. Player tanks get a tiny ID badge only; enemies get nothing.
function makeBadge(t) {
  if (t.team !== 'blue') return null;
  const el = document.createElement('div'); el.className = 'badge'; el.textContent = t.idx + 1;
  $('#bars').appendChild(el); return el;
}
// Damage reads on the model: 0 clean, 1 damaged (<70%): grey wisps + darker hull, 2 heavy (<35%): black smoke, flames, sparks, slower.
const DMG_DAMAGED = 0.7, DMG_HEAVY = 0.35;
const sootColor = new THREE.Color(0x2a2724);
function updateDamageState(t) {
  const f = t.hp / CFG.hp;
  const st = f < DMG_HEAVY ? 2 : f < DMG_DAMAGED ? 1 : 0;
  if (st === t.dmg) return;
  t.dmg = st;
  const k = [0, 0.4, 0.62][st];
  t.mats.main.color.copy(t.baseMain).lerp(sootColor, k);
  t.mats.trim.color.copy(t.baseTrim).lerp(sootColor, k);
}

function spawnTank(team, idx, x, z, yaw) {
  const m = buildTank(team);
  const t = {
    id: `${team}${idx}`, team, idx, hp: CFG.hp, alive: true, ...m,
    yaw, turretYaw: 0, speed: 0, path: [], goal: null, order: null, reload: rand(0.3, 1.2),
    fireTarget: null, vel: new THREE.Vector3(), prev: new THREE.Vector3(x, 0, z), recoil: 0, pitch: 0, flash: 0,
    stuck: { t: 0, x, z, n: 0 }, repath: 0, dustT: 0,
    ai: team === 'red' ? { timer: 0, start: 3.5 + idx * 0.3, next: 0, mode: 'engage', until: 0, coverCd: 0 } : null,
    pathLine: null, dmg: 0, dmgT: 0, sparkT: 1,
  };
  t.baseMain = t.mats.main.color.clone(); t.baseTrim = t.mats.trim.color.clone();
  t.root.position.set(x, surfaceY(x, z), z); t.root.rotation.y = yaw;
  t.pick.userData.tank = t; pickMeshes.push(t.pick);
  scene.add(t.root);
  t.bar = makeBadge(t);
  if (team === 'blue') {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 40), 3));
    t.pathLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x8ff7ff, transparent: true, opacity: 0.55, depthWrite: false }));
    t.pathLine.frustumCulled = false; t.pathLine.visible = false; scene.add(t.pathLine);
  }
  tanks.push(t); return t;
}

const alive = (team) => tanks.filter((t) => t.alive && t.team === team);
const pos = (t) => t.root.position;
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wreckCols = () => wrecks;
// Line of sight: obstacles, wrecks, terrain (hill crests) and forest depth (>9 units of trees between blocks sight).
function losClear(x0, y0, z0, x1, y1, z1, ignore = null) {
  if (segmentHitT(x0, z0, x1, z1, 0, ignore ? wrecks.filter((w) => !ignore.includes(w.tank)) : wrecks, y0, y1) >= 0) return false;
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.ceil(L / 2)); let trees = 0;
  for (let k = 1; k < n; k++) {
    const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t;
    if (heightAt(x, z) > y - 0.3) return false;
    const fromEnds = Math.min(t, 1 - t) * L;
    if (fromEnds > 5 && inForest(x, z) && (trees += L / n) > 9) return false;
  }
  return true;
}
function hasLOS(a, b) { const p = pos(a), q = pos(b); return losClear(p.x, p.y + 1.9, p.z, q.x, q.y + 1.3, q.z, [a, b]); }
// Height advantage: up to +35% range for firing downhill.
function rangeFor(a, b) { return CFG.range * (1 + clamp((pos(a).y - pos(b).y) / 12, 0, 0.35)); }

function setPath(t, x, z) { t.straight = false; t.goal = { x, z }; t.path = nav.findPath(pos(t).x, pos(t).z, x, z); t.stuck.n = 0; t.stuck.t = 0; }
function stop(t) { t.path = []; t.goal = null; }

// ---------- orders ----------
function orderMove(list, x, z) {
  const ts = list.filter((t) => t.alive); if (!ts.length) return;
  const c = ts.reduce((a, t) => a.add(pos(t)), new THREE.Vector3()).multiplyScalar(1 / ts.length);
  const dir = new THREE.Vector3(x - c.x, 0, z - c.z); if (dir.lengthSq() < 0.01) dir.set(0, 0, -1); dir.normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  // keep relative left/right assignment so tanks don't cross paths
  const sorted = [...ts].sort((a, b) => pos(a).clone().sub(c).dot(perp) - pos(b).clone().sub(c).dot(perp));
  sorted.forEach((t, i) => {
    const off = (i - (sorted.length - 1) / 2) * 5.5;
    t.order = { type: 'move' }; setPath(t, clamp(x + perp.x * off, -HALF + 3, HALF - 3), clamp(z + perp.z * off, -HALF + 3, HALF - 3));
  });
  addMarker(x, z, 0x7dffb0);
}
function orderAttack(list, target) {
  for (const t of list) if (t.alive) { t.order = { type: 'attack', target }; t.repath = 0; }
  addMarker(pos(target).x, pos(target).z, 0xff5050, true);
}

// ---------- markers ----------
const markerGeo = new THREE.RingGeometry(0.8, 1.15, 32).rotateX(-Math.PI / 2);
function addMarker(x, z, color, big = false) {
  const m = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false }));
  m.position.set(x, surfaceY(x, z) + 0.15, z); m.renderOrder = 1; scene.add(m); markers.push({ m, t: 0, big });
}

// ---------- combat ----------
const tmpV = new THREE.Vector3();
function fire(t, tg) {
  t.reload = CFG.reload * rand(0.92, 1.08);
  const m = t.muzzle.getWorldPosition(new THREE.Vector3());
  const tp = pos(tg); const d = dist2d(m, tp);
  const flight = d / CFG.shellSpeed;
  const lead = 0.9;
  // lateral (perpendicular) spread, triangular distribution: close shots almost always hit, long shots miss ~1 in 4
  const hAdv = clamp((m.y - tp.y - 1.5) / 12, 0, 0.3);
  const lat = (rand(-1, 1) + rand(-1, 1)) * (0.6 + d * 0.05) * (inForest(tp.x, tp.z) ? 1.6 : 1) * (1 - hAdv);
  t.firedAt = game.time;
  const px = -(tp.z - m.z) / (d || 1), pz = (tp.x - m.x) / (d || 1);
  const aim = new THREE.Vector3(tp.x + tg.vel.x * flight * lead + px * lat, tp.y + 1.15 + rand(-.3, .3), tp.z + tg.vel.z * flight * lead + pz * lat);
  const hd = Math.hypot(aim.x - m.x, aim.z - m.z), tt = Math.max(0.05, hd / CFG.shellSpeed);
  const vel = new THREE.Vector3((aim.x - m.x) / tt, (aim.y - m.y) / tt + 0.5 * CFG.gravity * tt, (aim.z - m.z) / tt);
  const mesh = new THREE.Mesh(shellGeo, shellMat); mesh.position.copy(m); scene.add(mesh);
  shells.push({ mesh, pos: m.clone(), vel, owner: t, life: 2.5, dist: 0 });
  game.stats.shots++;
  // muzzle flash
  const dir = vel.clone().normalize();
  for (let i = 0; i < 7; i++) { const s = rand(4, 14); fx.spawn(m.x, m.y, m.z, dir.x * s + rand(-2, 2), dir.y * s + rand(-1, 2), dir.z * s + rand(-2, 2), rand(.08, .16), rand(1.6, 2.6), .4, 1, rand(.6, .85), .3, 1, 6); }
  fx.spawn(m.x, m.y, m.z, 0, 0, 0, .07, 4.5, 2, 1, .9, .6, 1);
  for (let i = 0; i < 6; i++) { const s = rand(1, 5); smoke.spawn(m.x, m.y, m.z, dir.x * s + rand(-1, 1), rand(.3, 1.4), dir.z * s + rand(-1, 1), rand(.8, 1.6), 1, rand(2.5, 4), .78, .76, .72, .45, 1.5, -0.4); }
  flashLight(m, 120);
  t.recoil = 1; t.pitch = -0.07;
  addShake(m, 0.08);
}
function hitTank(tg, dmg, p, shooter) {
  tg.hp = Math.max(0, tg.hp - dmg); tg.flash = 0.12; game.stats.hits++;
  updateDamageState(tg);
  for (let i = 0; i < 18; i++) fx.spawn(p.x, p.y, p.z, rand(-9, 9), rand(2, 10), rand(-9, 9), rand(.2, .45), rand(.25, .5), .05, 1, rand(.7, .95), .4, 1, 2, 20);
  for (let i = 0; i < 6; i++) fx.spawn(p.x, p.y, p.z, rand(-2, 2), rand(0, 2), rand(-2, 2), rand(.15, .3), rand(1.5, 2.6), 3.5, 1, .55, .15, .9, 3);
  for (let i = 0; i < 5; i++) smoke.spawn(p.x, p.y, p.z, rand(-1.5, 1.5), rand(.5, 2), rand(-1.5, 1.5), rand(1, 1.8), 1.5, 4, .25, .23, .22, .55, 1, -0.6);
  flashLight(p, 160); addShake(p, 0.35);
  if (tg.hp <= 0 && tg.alive) killTank(tg);
}
function killTank(t) {
  t.alive = false; t.path = []; t.order = null; t.speed = 0; game.stats.kills++;
  selected.delete(t);
  const p = pos(t).clone(); p.y += 1.2;
  for (let i = 0; i < 40; i++) { const a = rand(0, 6.28), s = rand(2, 9); fx.spawn(p.x, p.y + rand(0, 1), p.z, Math.cos(a) * s, rand(2, 9), Math.sin(a) * s, rand(.35, .8), rand(2, 3.5), rand(4, 6), 1, rand(.45, .75), .15, .95, 3, 2); }
  for (let i = 0; i < 40; i++) fx.spawn(p.x, p.y, p.z, rand(-16, 16), rand(5, 18), rand(-16, 16), rand(.5, 1.1), .45, .1, 1, .8, .4, 1, .8, 22);
  for (let i = 0; i < 24; i++) smoke.spawn(p.x + rand(-1, 1), p.y, p.z + rand(-1, 1), rand(-3, 3), rand(1, 5), rand(-3, 3), rand(2, 3.5), 3, rand(7, 10), .18, .17, .16, .7, 1.2, -0.5);
  flashLight(p, 600, 0xff9040); addShake(p, 0.9);
  // wreck look
  t.mats.main.color.setHex(0x2d2a27); t.mats.trim.color.setHex(0x1d1b19); t.mats.main.emissive.setHex(0); t.mats.trim.emissive.setHex(0);
  t.turret.rotation.z = rand(-.35, .35); t.turret.position.y += 0.18; t.turretYaw += rand(-.8, .8); t.barrel.rotation.x = 0.18;
  t.body.rotation.z = rand(-.06, .06);
  t.ring.visible = false; if (t.bar) t.bar.style.display = 'none'; if (t.pathLine) t.pathLine.visible = false;
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false }));
  sc.rotation.x = -Math.PI / 2; sc.position.set(p.x, surfaceY(p.x, p.z) + 0.09, p.z); sc.material.polygonOffset = true; sc.material.polygonOffsetFactor = -4; scene.add(sc);
  emitters.push({ t, age: 0, acc: 0, scorch: sc });
  wrecks.push({ type: 'circle', x: p.x, z: p.z, r: 1.9, h: 2.4, base: pos(t).y, tank: t });
  const pi = pickMeshes.indexOf(t.pick); if (pi >= 0) pickMeshes.splice(pi, 1);
  checkEnd();
}
function checkEnd() {
  const r = alive('red').length, bl = alive('blue').length;
  if (game.state === 'ending') { if (!r && !bl) game.result = 'draw'; return; }
  if (game.state !== 'playing') return;
  if (r && bl) return;
  game.state = 'ending'; game.result = !r && !bl ? 'draw' : !r ? 'win' : 'lose'; game.endAt = game.time + 1.6;
  // shells already fired by the losing side fizzle, so the result can't flip during the outro
  const loser = !r ? 'red' : 'blue';
  shells = shells.filter((s) => { if (s.owner.team === loser) { scene.remove(s.mesh); return false; } return true; });
}

function updateShells(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i]; const a = s.pos.clone();
    s.vel.y -= CFG.gravity * dt; s.pos.addScaledVector(s.vel, dt); s.life -= dt;
    const b = s.pos;
    let bestT = 2, hit = null;
    // tanks (analytic segment vs circle in XZ)
    for (const t of tanks) {
      if (!t.alive || t.team === s.owner.team) continue;
      const p = pos(t), dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1e-6;
      const u = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / L, 0, 1);
      const cx = a.x + dx * u, cz = a.z + dz * u, y = a.y + (b.y - a.y) * u;
      if (Math.hypot(cx - p.x, cz - p.z) < 2.05 && y < p.y + 2.5 && y > p.y - 0.6 && u < bestT) { bestT = u; hit = t; }
    }
    const to = segmentHitT(a.x, a.z, b.x, b.z, 0, wrecks, a.y, b.y);
    if (to >= 0 && to < bestT) { bestT = to; hit = 'obs'; }
    const segL = Math.hypot(b.x - a.x, b.z - a.z); s.dist += segL;
    const gy = Math.max(surfaceY(b.x, b.z), waterClass(b.x, b.z) ? WATER_Y : -99);
    if (b.y <= gy) { const ga = Math.max(surfaceY(a.x, a.z), waterClass(a.x, a.z) ? WATER_Y : -99); const tg = (a.y - ga) / Math.max(1e-6, (a.y - ga) - (b.y - gy)); if (tg < bestT) { bestT = clamp(tg, 0, 1); hit = waterClass(b.x, b.z) === 1 || waterClass(b.x, b.z) === 2 ? 'water' : 'ground'; } }
    // forests eat some shells: chance to strike a trunk per unit flown through trees (not right at the muzzle)
    if (!hit && s.dist > 6 && inForest(b.x, b.z) && b.y < heightAt(b.x, b.z) + 6 && Math.random() < 0.03 * segL) { bestT = 0.5; hit = 'tree'; }
    s.mesh.position.copy(b); s.mesh.lookAt(tmpV.copy(b).add(s.vel));
    // trail
    fx.spawn(b.x, b.y, b.z, 0, 0, 0, .05, 1.6, 1.2, 1, .85, .5, 1);
    const nTrail = Math.min(24, Math.ceil(a.distanceTo(b) / 0.35));
    for (let k = 0; k < nTrail; k++) { const q = a.clone().lerp(b, k / nTrail); fx.spawn(q.x, q.y, q.z, 0, 0, 0, .16, .75, .12, 1, .7, .3, .55); }
    smoke.spawn(b.x, b.y, b.z, rand(-.3, .3), rand(0, .4), rand(-.3, .3), .5, .4, 1.2, .85, .83, .8, .25);
    if (hit || s.life <= 0) {
      const p = a.clone().lerp(b, Math.min(bestT, 1));
      if (hit && typeof hit === 'object') hitTank(hit, Math.round(rand(CFG.dmgMin, CFG.dmgMax)), p, s.owner);
      else if (hit === 'water') splash(p);
      else if (hit === 'tree') splinters(p);
      else if (hit) impact(p, hit === 'ground');
      scene.remove(s.mesh); shells.splice(i, 1);
    }
  }
}
function splash(p) {
  p.y = WATER_Y + 0.1;
  for (let i = 0; i < 26; i++) smoke.spawn(p.x, p.y, p.z, rand(-2, 2), rand(4, 11), rand(-2, 2), rand(.6, 1.2), .8, rand(1.5, 2.6), .9, .95, 1, .8, .5, 14);
  for (let i = 0; i < 8; i++) smoke.spawn(p.x, p.y, p.z, rand(-3, 3), rand(0, 1), rand(-3, 3), rand(.8, 1.4), 1.5, 4, .85, .9, .95, .5, 2, 0);
  addShake(p, 0.08);
}
function splinters(p) {
  for (let i = 0; i < 14; i++) smoke.spawn(p.x, p.y, p.z, rand(-6, 6), rand(1, 7), rand(-6, 6), rand(.4, .8), .35, .2, .45, .32, .18, .9, 1.5, 16);
  for (let i = 0; i < 6; i++) smoke.spawn(p.x, p.y, p.z, rand(-1.5, 1.5), rand(.5, 2), rand(-1.5, 1.5), rand(1, 1.6), 1, 3.5, .55, .52, .45, .5, 1.5, -0.3);
  fx.spawn(p.x, p.y, p.z, 0, 0, 0, .1, 2.4, 1, 1, .7, .3, .8);
}
function impact(p, ground) {
  for (let i = 0; i < 12; i++) fx.spawn(p.x, p.y, p.z, rand(-7, 7), rand(1, 8), rand(-7, 7), rand(.15, .35), rand(.25, .45), .05, 1, .8, .45, 1, 2, 18);
  fx.spawn(p.x, p.y, p.z, 0, 0, 0, .12, 3.2, 1, 1, .7, .3, .9);
  const c = ground ? [.62, .55, .4] : [.6, .58, .55];
  for (let i = 0; i < 9; i++) smoke.spawn(p.x, p.y, p.z, rand(-2.5, 2.5), rand(.5, 3.5), rand(-2.5, 2.5), rand(.8, 1.6), 1, rand(3, 5), c[0], c[1], c[2], .6, 1.5, 1);
  flashLight(p, 70); addShake(p, 0.15);
}

// ---------- AI ----------
function aiSpot(t, target, mode) {
  const tp = pos(target), me = pos(t);
  const cands = [];
  for (let k = 0; k < 16; k++) { const a = rand(0, 6.28), d = rand(18, 34); cands.push([tp.x + Math.sin(a) * d, tp.z + Math.cos(a) * d]); }
  for (const o of obstacles) {
    if (o.border || Math.abs(o.x - tp.x) > 45 || Math.abs(o.z - tp.z) > 45) continue;
    const R = (o.type === 'circle' ? o.r : Math.max(o.hx, o.hz)) + 3.4;
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28 + rand(0, .6); cands.push([o.x + Math.sin(a) * R, o.z + Math.cos(a) * R]); }
  }
  const ally = alive('red').find((o) => o !== t);
  let best = null, bs = Infinity;
  for (const [x, z] of cands) {
    if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4 || nav.blockedAt(x, z)) continue;
    const d = Math.hypot(x - tp.x, z - tp.z), self = Math.hypot(x - me.x, z - me.z);
    const sy = surfaceY(x, z); const los = losClear(x, sy + 1.9, z, tp.x, tp.y + 1.3, tp.z, [target]);
    const near = minObsDist(x, z) < 4;
    let s;
    if (mode === 'cover') s = (los ? 40 : 0) + self * 0.6 + (d < 20 ? 20 : 0) - (near ? 6 : 0);
    else s = Math.abs(d - 27) + self * 0.3 + (los ? 0 : 22) - (near ? 7 : 0) + (d < 15 ? 30 : 0) + rand(0, 4);
    if (ally?.goal && Math.hypot(x - ally.goal.x, z - ally.goal.z) < 8) s += 12;
    if (s < bs) { bs = s; best = [x, z]; }
  }
  return best;
}
function aiThink(t, dt) {
  const ai = t.ai; ai.timer -= dt; if (ai.timer > 0) return; ai.timer = 0.45;
  if (game.time < ai.start) return;
  const foes = alive('blue'); if (!foes.length) return;
  const target = foes.reduce((a, b) => (dist2d(pos(a), pos(t)) < dist2d(pos(b), pos(t)) ? a : b));
  t.aiTarget = target;
  const d = dist2d(pos(target), pos(t));
  if (t.hp < 45 && game.time > ai.coverCd) { // duck behind cover for a few seconds
    const s = aiSpot(t, target, 'cover'); if (s) { setPath(t, s[0], s[1]); t.order = { type: 'move' }; ai.mode = 'cover'; ai.until = game.time + 4.5; ai.coverCd = game.time + 14; }
    return;
  }
  if (ai.mode === 'cover' && game.time < ai.until) return;
  ai.mode = 'engage';
  // stalemate breaker: if we can't see anyone for a while, hunt the target directly
  const see = foes.some((f) => dist2d(pos(f), pos(t)) <= rangeFor(t, f) && hasLOS(t, f));
  ai.blind = see ? 0 : (ai.blind || 0) + 0.45;
  // regroup: the lead tank waits for its partner instead of arriving alone
  const ally = alive('red').find((o) => o !== t);
  if (!see && ally && dist2d(pos(ally), pos(t)) > 28 && dist2d(pos(t), pos(target)) + 10 < dist2d(pos(ally), pos(target))) {
    if (t.path.length) { stop(t); t.order = null; } ai.blind = 0; return;
  }
  if (ai.blind > 3) { if (t.order?.type !== 'attack' || !t.order.target.alive) { t.order = { type: 'attack', target }; t.repath = 0; } return; }
  if (t.order?.type === 'attack') { t.order = null; ai.next = 0; }
  const idle = !t.path.length;
  if (d < 13 || (idle && game.time > ai.next) || game.time > ai.next + 4 || (idle && !hasLOS(t, target))) {
    const s = aiSpot(t, target, 'engage'); if (s) { setPath(t, s[0], s[1]); t.order = { type: 'move' }; }
    ai.next = game.time + rand(4.5, 7.5);
  }
}

// ---------- tank update ----------
function chooseFireTarget(t) {
  const inRange = (o) => o.alive && dist2d(pos(o), pos(t)) <= rangeFor(t, o) && hasLOS(t, o);
  if (t.order?.type === 'attack' && inRange(t.order.target)) return t.order.target;
  if (t.ai) { // AI focus-fires the weakest visible enemy
    let w = null; for (const o of tanks) if (o.team !== t.team && inRange(o) && (!w || o.hp < w.hp)) w = o;
    if (w) return w;
  }
  if (t.fireTarget && inRange(t.fireTarget)) return t.fireTarget;
  let best = null, bd = Infinity;
  for (const o of tanks) if (o.team !== t.team && inRange(o)) { const d = dist2d(pos(o), pos(t)); if (d < bd) { bd = d; best = o; } }
  return best;
}
function updateTank(t, dt) {
  const p = pos(t);
  t.vel.set((p.x - t.prev.x) / dt, 0, (p.z - t.prev.z) / dt); t.prev.copy(p);
  if (!t.alive) return;
  if (t.ai && !game.holdAI) aiThink(t, dt);
  // orders
  if (t.order?.type === 'attack') {
    const tg = t.order.target;
    if (!tg.alive) { t.order = null; stop(t); }
    else {
      t.repath -= dt;
      if (t.repath <= 0) {
        t.repath = 0.7;
        const d = dist2d(pos(tg), p);
        if (d > rangeFor(t, tg) * 0.85 || !hasLOS(t, tg)) setPath(t, pos(tg).x, pos(tg).z); else stop(t);
      }
    }
  }
  // follow path
  if (t.path.length) {
    const wp = t.path[0], dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz), last = t.path.length === 1;
    if (d < (last ? 1.0 : 2.2)) { t.path.shift(); if (!t.path.length && t.order?.type === 'move') t.order = null; }
    else {
      const err = wrap(Math.atan2(dx, dz) - t.yaw);
      t.yaw = wrap(t.yaw + clamp(err, -CFG.turn * dt, CFG.turn * dt));
      const align = Math.max(0, Math.cos(err));
      let want = Math.abs(err) > 1.1 ? 0.6 : CFG.speed * (t.ai ? 0.9 : 1) * (t.dmg === 2 ? 0.8 : 1) * terrainSpeed(p.x, p.z) * align * align;
      if (last) want = Math.min(want, 1.5 + d * 1.6);
      t.speed += (want - t.speed) * Math.min(1, dt * 4);
    }
    // stuck detection -> repath
    t.stuck.t += dt;
    if (t.stuck.t > 1.2) {
      const moved = Math.hypot(p.x - t.stuck.x, p.z - t.stuck.z); t.stuck.t = 0; t.stuck.x = p.x; t.stuck.z = p.z;
      if (moved < 1.2 && t.goal && !t.straight) { if (++t.stuck.n > 3) stop(t); else t.path = nav.findPath(p.x, p.z, t.goal.x, t.goal.z); }
    }
  } else t.speed += (0 - t.speed) * Math.min(1, dt * 6);
  const mx = Math.sin(t.yaw) * t.speed * dt, mz = Math.cos(t.yaw) * t.speed * dt;
  if (!wet(p.x + mx, p.z + mz)) { p.x += mx; p.z += mz; }
  else if (!wet(p.x + mx, p.z)) p.x += mx;      // slide along the bank
  else if (!wet(p.x, p.z + mz)) p.z += mz;
  else t.speed *= 0.5;
  settleOnGround(t, dt);
  // turret
  t.fireTarget = chooseFireTarget(t);
  const aimT = t.fireTarget || (t.order?.type === 'attack' ? t.order.target : null) || (t.ai ? t.aiTarget : null);
  let want = 0;
  if (aimT) { const q = pos(aimT); want = wrap(Math.atan2(q.x - p.x, q.z - p.z) - t.yaw); }
  const terr = wrap(want - t.turretYaw);
  t.turretYaw = wrap(t.turretYaw + clamp(terr, -CFG.turretTurn * dt, CFG.turretTurn * dt));
  t.turret.rotation.y = t.turretYaw;
  t.reload -= dt;
  if (t.fireTarget && Math.abs(terr) < 0.05 && t.reload <= 0 && game.state === 'playing') fire(t, t.fireTarget);
  // juice: recoil, pitch, hit flash, dust
  t.recoil = Math.max(0, t.recoil - dt * 4); t.barrel.position.z = 1.15 - t.recoil * 0.55;
  t.pitch += (-t.pitch) * Math.min(1, dt * 6); t.body.rotation.x = t.pitch - (t.speed / CFG.speed) * 0.0;
  t.flash = Math.max(0, t.flash - dt);
  const e = t.flash > 0 ? 0.9 : 0; t.mats.main.emissive.setScalar(e); t.mats.trim.emissive.setScalar(e);
  if (t.speed > 2) {
    t.dustT -= dt;
    if (t.dustT <= 0) {
      t.dustT = 0.09;
      for (const s of [-1, 1]) {
        const bx = p.x - Math.sin(t.yaw) * 2.3 + Math.cos(t.yaw) * 1.5 * s, bz = p.z - Math.cos(t.yaw) * 2.3 - Math.sin(t.yaw) * 1.5 * s;
        smoke.spawn(bx, p.y + .3, bz, rand(-.5, .5), rand(.3, 1), rand(-.5, .5), rand(.8, 1.3), .8, 2.6, .72, .64, .48, .32, 1.5, -0.2);
      }
    }
  }
}
function damageFx(t, dt) {
  if (!t.alive || !t.dmg || !t.root.visible) return;
  const p = pos(t), sy = Math.sin(t.yaw), cy = Math.cos(t.yaw);
  const ex = p.x - sy * 1.6, ez = p.z - cy * 1.6; // engine deck (rear)
  t.dmgT -= dt;
  if (t.dmgT <= 0) {
    if (t.dmg === 1) {
      t.dmgT = 0.1;
      smoke.spawn(ex + rand(-.4, .4), p.y + 1.6, ez + rand(-.4, .4), rand(-.2, .2) + .3, rand(1.4, 2.2), rand(-.2, .2), rand(1.8, 2.6), .8, rand(3, 4.2), .86, .86, .84, .5, .4, -0.2);
    } else {
      t.dmgT = 0.06;
      smoke.spawn(ex + rand(-.5, .5), p.y + 1.7, ez + rand(-.5, .5), rand(-.3, .3) + .4, rand(1.8, 3), rand(-.3, .3), rand(2.2, 3.2), 1, rand(4, 6), .14, .13, .12, .6, .3, -0.25);
      for (let i = 0; i < 2; i++) fx.spawn(ex + rand(-.6, .6), p.y + 1.7, ez + rand(-.6, .6), rand(-.2, .2), rand(1.2, 2.6), rand(-.2, .2), rand(.3, .55), rand(1.1, 1.7), .25, 1, rand(.45, .65), .12, .95, 1, -1.5);
    }
  }
  if (t.dmg === 2) {
    t.sparkT -= dt;
    if (t.sparkT <= 0) {
      t.sparkT = rand(0.5, 1.4);
      for (let i = 0; i < 6; i++) fx.spawn(ex, p.y + 1.6, ez, rand(-3, 3), rand(2, 5), rand(-3, 3), rand(.25, .5), .3, .05, 1, .85, .45, 1, 1.5, 16);
    }
  }
}
// a tank (radius ~1.8) may not enter deep water; bridges and the ford are fine
function wet(x, z) {
  if (waterClass(x, z) === 1) return true;
  for (let a = 0; a < 6.28; a += 1.05) if (waterClass(x + Math.cos(a) * 1.8, z + Math.sin(a) * 1.8) === 1) return true;
  return false;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
function settleOnGround(t, dt) {
  const p = pos(t), sy = Math.sin(t.yaw), cy = Math.cos(t.yaw);
  const hf = surfaceY(p.x + sy * 2, p.z + cy * 2), hb = surfaceY(p.x - sy * 2, p.z - cy * 2);
  const hr = surfaceY(p.x + cy * 1.5, p.z - sy * 1.5), hl = surfaceY(p.x - cy * 1.5, p.z + sy * 1.5);
  const targetY = Math.max(surfaceY(p.x, p.z), (hf + hb + hr + hl) / 4);
  p.y += (targetY - p.y) * Math.min(1, dt * 12);
  const pitch = -Math.atan2(hf - hb, 4), roll = Math.atan2(hr - hl, 3);
  t.tiltP = (t.tiltP || 0) + (pitch - (t.tiltP || 0)) * Math.min(1, dt * 8);
  t.tiltR = (t.tiltR || 0) + (roll - (t.tiltR || 0)) * Math.min(1, dt * 8);
  _e.set(t.tiltP, t.yaw, t.tiltR); t.root.quaternion.setFromEuler(_e);
}
function separate() {
  const live = tanks.filter((t) => t.alive);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = pos(live[i]), b = pos(live[j]); const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3, min = CFG.radius * 2.1;
    if (d < min) { const k = (min - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
  }
  for (const t of live) {
    const p = pos(t);
    for (const w of wrecks) { const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz) || 1e-3, min = CFG.radius + 2; if (d < min) { p.x = w.x + dx / d * min; p.z = w.z + dz / d * min; } }
    [p.x, p.z] = pushOut(p.x, p.z, CFG.radius);
    p.x = clamp(p.x, -HALF + 2.2, HALF - 2.2); p.z = clamp(p.z, -HALF + 2.2, HALF - 2.2);
    if (wet(p.x, p.z)) { if (t.safe) { p.x = t.safe.x; p.z = t.safe.z; } } else (t.safe ||= new THREE.Vector3()).copy(p);
  }
}
function updateEmitters(dt) {
  for (const e of emitters) {
    e.age += dt; e.acc -= dt;
    if (e.acc > 0) continue;
    e.acc = e.age < 6 ? 0.05 : 0.12;
    const p = pos(e.t);
    smoke.spawn(p.x + rand(-.6, .6), p.y + 2, p.z + rand(-.6, .6), rand(-.4, .4) + 0.6, rand(2, 3.2), rand(-.4, .4), rand(2.8, 4.2), 1.4, rand(5, 8), .16, .15, .14, e.age < 6 ? .6 : .4, 0.3, -0.25);
    if (e.age < 10 || Math.random() < 0.3) fx.spawn(p.x + rand(-.7, .7), p.y + 1.8, p.z + rand(-.7, .7), rand(-.3, .3), rand(1.5, 3), rand(-.3, .3), rand(.3, .6), rand(1, 1.8), .3, 1, rand(.4, .6), .1, .9, 1, -1);
  }
}

// ---------- spotting (R.U.S.E.-style: enemies are only shown when one of your tanks sees them) ----------
function updateSpotting(dt) {
  game.spotT = (game.spotT || 0) - dt; if (game.spotT > 0) return; game.spotT = 0.2;
  const blues = alive('blue');
  for (const r of tanks) {
    if (r.team !== 'red') continue;
    if (!r.alive || game.state !== 'playing') { r.spotted = true; r.root.visible = true; continue; }
    const rp = pos(r), hidden = inForest(rp.x, rp.z) && game.time - (r.firedAt ?? -99) > 3;
    const V = hidden ? CFG.forestVision : CFG.vision;
    let seen = false;
    for (const b of blues) { const d = dist2d(pos(b), rp); if (d < 14 || (d < V && hasLOS(b, r))) { seen = true; break; } }
    if (seen) r.seenUntil = game.time + 1.5;
    r.spotted = game.time < (r.seenUntil || 0);
    r.root.visible = r.spotted;
  }
}

// ---------- minimap ----------
const MM = 200, mmCanvas = $('#minimap'), mmCtx = mmCanvas.getContext('2d'), mmBg = renderMinimap(256);
mmCanvas.width = mmCanvas.height = MM;
const w2m = (x, z) => [(x + HALF) / (HALF * 2) * MM, (z + HALF) / (HALF * 2) * MM];
let mmT = 0;
function viewCorner(sx, sy) {
  ndc.set(sx * 2 - 1, -(sy * 2 - 1)); raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, p) && p.distanceTo(camera.position) < 900) return p;
  return camera.position.clone().addScaledVector(raycaster.ray.direction, 900);
}
function drawMinimap(dt) {
  mmT -= dt; if (mmT > 0) return; mmT = 0.1;
  const g = mmCtx; g.drawImage(mmBg, 0, 0, MM, MM);
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.2; g.beginPath();
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([sx, sy], i) => { const c = viewCorner(sx, sy); const [x, y] = w2m(clamp(c.x, -HALF * 1.5, HALF * 1.5), clamp(c.z, -HALF * 1.5, HALF * 1.5)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath(); g.stroke();
  for (const t of tanks) {
    if (t.team === 'red' && !t.spotted) continue;
    const [x, y] = w2m(pos(t).x, pos(t).z);
    if (!t.alive) { g.strokeStyle = '#222'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 3, y - 3); g.lineTo(x + 3, y + 3); g.moveTo(x + 3, y - 3); g.lineTo(x - 3, y + 3); g.stroke(); continue; }
    g.fillStyle = t.team === 'blue' ? '#4aa3ff' : '#ff4a3a'; g.strokeStyle = selected.has(t) ? '#b6fbff' : '#111'; g.lineWidth = selected.has(t) ? 2 : 1;
    g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.stroke();
  }
}
let mmDrag = false;
function mmJump(e) {
  const r = mmCanvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * HALF * 2 - HALF, z = ((e.clientY - r.top) / r.height) * HALF * 2 - HALF;
  cam.shift.set(x - controls.target.x, 0, z - controls.target.z); mmT = 0;
}
mmCanvas.addEventListener('pointerdown', (e) => { e.stopPropagation(); mmDrag = true; mmCanvas.setPointerCapture(e.pointerId); mmJump(e); });
mmCanvas.addEventListener('pointermove', (e) => { if (mmDrag) mmJump(e); });
mmCanvas.addEventListener('pointerup', () => { mmDrag = false; });
mmCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- selection & input ----------
function setSelection(list, additive = false) {
  if (!additive) selected.clear();
  for (const t of list) if (t.alive && t.team === 'blue') selected.add(t);
}
function toggleSel(t) { if (selected.has(t)) selected.delete(t); else if (t.alive) selected.add(t); }
const tmpP = new THREE.Vector3();
function toScreen(v) { tmpP.copy(v).project(camera); return { x: (tmpP.x + 1) / 2 * innerWidth, y: (1 - tmpP.y) / 2 * innerHeight, z: tmpP.z }; }
function pickTank(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickMeshes, false);
  const vis = hits.find((h) => h.object.userData.tank.root.visible);
  if (vis) return vis.object.userData.tank;
  // forgiving screen-space fallback (helps at wide zoom)
  let best = null, bd = 30;
  for (const t of tanks) { if (!t.alive || !t.root.visible) continue; const s = toScreen(tmpV.copy(pos(t)).setY(pos(t).y + 1.2)); const d = Math.hypot(s.x - cx, s.y - cy); if (d < bd) { bd = d; best = t; } }
  return best;
}
function handleClick(cx, cy, shift, right) {
  if (game.state === 'over') return;
  const t = pickTank(cx, cy);
  if (t && t.team === 'blue') { if (right) return; if (shift) toggleSel(t); else setSelection([t]); return; }
  if (!selected.size) return;
  if (t && t.team === 'red') { orderAttack([...selected], t); return; }
  const g = groundAt(cx, cy); if (g) orderMove([...selected], clamp(g.x, -HALF + 3, HALF - 3), clamp(g.z, -HALF + 3, HALF - 3));
}
const drag = { on: false, active: false, x: 0, y: 0, btn: 0 };
const selbox = $('#selbox');
canvas.addEventListener('pointerdown', (e) => {
  drag.btn = e.button; drag.x = e.clientX; drag.y = e.clientY; drag.on = true; drag.active = false;
});
window.addEventListener('pointermove', (e) => {
  if (drag.on && drag.btn === 0) {
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.active = true;
    if (drag.active) {
      const x = Math.min(e.clientX, drag.x), y = Math.min(e.clientY, drag.y);
      Object.assign(selbox.style, { display: 'block', left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - drag.x) + 'px', height: Math.abs(e.clientY - drag.y) + 'px' });
    }
  } else if (!drag.on && e.target === canvas) {
    const t = pickTank(e.clientX, e.clientY);
    hovered = t;
    canvas.style.cursor = t ? (t.team === 'blue' ? 'pointer' : (selected.size ? 'crosshair' : 'default')) : (selected.size ? 'cell' : 'default');
  }
});
let hovered = null;
window.addEventListener('pointerup', (e) => {
  if (!drag.on) return; drag.on = false;
  const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
  if (drag.btn === 0 && drag.active) {
    selbox.style.display = 'none';
    const x0 = Math.min(e.clientX, drag.x), x1 = Math.max(e.clientX, drag.x), y0 = Math.min(e.clientY, drag.y), y1 = Math.max(e.clientY, drag.y);
    const inBox = alive('blue').filter((t) => { const s = toScreen(tmpV.copy(pos(t)).setY(pos(t).y + 1)); return s.z < 1 && s.x >= x0 - 12 && s.x <= x1 + 12 && s.y >= y0 - 12 && s.y <= y1 + 12; });
    if (inBox.length) setSelection(inBox, e.shiftKey);
  } else if (drag.btn === 0 && e.target === canvas) handleClick(e.clientX, e.clientY, e.shiftKey, false);
  else if (drag.btn === 2 && moved < 5) handleClick(e.clientX, e.clientY, e.shiftKey, true);
  drag.active = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  keys.add(e.code);
  const b = tanks.filter((t) => t.team === 'blue');
  if (e.code === 'Digit1' && b[0]) setSelection([b[0]], e.shiftKey);
  if (e.code === 'Digit2' && b[1]) setSelection([b[1]], e.shiftKey);
  if (e.code === 'Digit3' || (e.code === 'KeyA' && e.ctrlKey)) { setSelection(b); e.preventDefault(); }
  if (e.code === 'Escape') selected.clear();
  if (e.code === 'KeyX') for (const t of selected) { t.order = null; stop(t); }
  if (e.code === 'Space') { e.preventDefault(); focusSelection(); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
function focusSelection() {
  const list = selected.size ? [...selected] : alive('blue'); if (!list.length) return;
  const c = list.reduce((a, t) => a.add(pos(t)), new THREE.Vector3()).multiplyScalar(1 / list.length);
  cam.shift.set(c.x - controls.target.x, 0, c.z - controls.target.z);
}

// ---------- HUD ----------
// Card icon: tank silhouette + damage overlays (smoke wisps / flames) toggled by CSS state class.
const tankSvg = (c) => `<svg viewBox="0 0 40 30"><g class="tk"><rect x="3" y="17" width="34" height="9" rx="4" fill="#222"/><rect x="6" y="12" width="28" height="8" rx="2" class="hull" fill="${c}"/><rect x="13" y="7" width="13" height="7" rx="3" class="hull" fill="${c}"/><rect x="25" y="9" width="13" height="2.6" fill="#ccc"/></g>
  <g class="smk"><circle cx="9" cy="8" r="3" /><circle cx="6" cy="4" r="2.3" /><circle cx="10" cy="1.6" r="1.6" /></g>
  <g class="fire"><path d="M8 13c-3-3 0-5 0-8 2 2 4 3 2 6 1 0 2-1 2-2 1 2 0 4-1 4z"/><path d="M14 12c-1-2 0-3 1-5 1 2 2 3 0 5z"/></g></svg>`;
function buildHUD() {
  $('#units').innerHTML = [0, 1].map((i) => `<div class="card" data-i="${i}"><span class="key">${i + 1}</span>${tankSvg(TEAM.blue.css)}</div>`).join('');
  document.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', (e) => { const t = tanks.filter((t) => t.team === 'blue')[+el.dataset.i]; if (t) { if (e.shiftKey) toggleSel(t); else setSelection([t]); } });
    el.addEventListener('dblclick', () => focusSelection());
  });
}
buildHUD();
function updateHUD() {
  const blue = tanks.filter((t) => t.team === 'blue');
  document.querySelectorAll('.card').forEach((el, i) => {
    const t = blue[i]; if (!t) return;
    el.classList.toggle('sel', selected.has(t)); el.classList.toggle('dead', !t.alive);
    const st = t.alive ? ['clean', 'damaged', 'burning'][t.dmg] : 'dead';
    if (el.dataset.state !== st) { el.dataset.state = st; el.title = st; }
  });
  $('#score').innerHTML = ['blue', 'red'].map((tm) => tanks.filter((t) => t.team === tm).map((t) => `<i class="pip ${tm} ${t.alive ? '' : 'dead'}"></i>`).join('')).join('<span class="vs">VS</span>');
  for (const t of tanks) {
    if (!t.alive || !t.bar) continue;
    const s = toScreen(tmpV.copy(pos(t)).setY(pos(t).y + 3.4));
    if (s.z > 1 || s.x < -50 || s.x > innerWidth + 50 || s.y < -30 || s.y > innerHeight + 30 || game.state === 'over') { t.bar.style.display = 'none'; continue; }
    t.bar.style.display = '';
    t.bar.style.transform = `translate(${s.x | 0}px, ${s.y | 0}px) translate(-50%, -100%)`;
    t.bar.classList.toggle('sel', selected.has(t));
  }
}

// ---------- game lifecycle ----------
function clearWorld() {
  for (const t of tanks) { scene.remove(t.root); t.bar?.remove(); if (t.pathLine) scene.remove(t.pathLine); t.root.traverse((o) => { if (o.isMesh && o.geometry !== ringGeo) o.geometry.dispose(); }); }
  for (const s of shells) scene.remove(s.mesh);
  for (const e of emitters) scene.remove(e.scorch);
  for (const m of markers) scene.remove(m.m);
  tanks = []; shells = []; wrecks = []; emitters = []; markers = []; pickMeshes.length = 0; selected.clear();
  fx.clear(); smoke.clear();
}
function startGame() {
  clearWorld();
  spawnTank('blue', 0, -1, 128, Math.PI); spawnTank('blue', 1, 11, 128, Math.PI);
  spawnTank('red', 0, 26, -128, 0); spawnTank('red', 1, 14, -128, 0);
  Object.assign(game, { state: 'playing', time: 0, endAt: 0, result: null, stats: { shots: 0, hits: 0, kills: 0 } });
  $('#banner').classList.add('hidden');
  setSelection(tanks.filter((t) => t.team === 'blue'));
  setCameraHome();
}
$('#restart').addEventListener('click', () => startGame());
function showBanner() {
  game.state = 'over';
  for (const t of tanks) { t.order = null; stop(t); }
  const win = game.result === 'win';
  const b = $('#banner'); b.classList.remove('hidden'); b.classList.toggle('win', win); b.classList.toggle('lose', game.result === 'lose');
  b.querySelector('.title').textContent = win ? 'VICTORY' : game.result === 'lose' ? 'DEFEAT' : 'DRAW';
  const tm = Math.round(game.time), acc = game.stats.shots ? Math.round(game.stats.hits / game.stats.shots * 100) : 0;
  b.querySelector('.sub').textContent = `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}  ·  ${alive('blue').length} of 2 tanks survived`;
}

// ---------- per-frame visuals ----------
function updateVisuals(dt, now) {
  for (const t of tanks) {
    if (!t.alive) { if (t.pathLine) t.pathLine.visible = false; continue; }
    const sel = selected.has(t), hov = hovered === t;
    const targeted = t.team === 'red' && [...selected].some((s) => s.order?.type === 'attack' && s.order.target === t);
    t.ring.visible = sel || hov || targeted;
    t.ring.material.opacity = sel ? 0.95 : targeted ? 0.55 + 0.4 * Math.sin(now * 8) : 0.4;
    t.ring.scale.setScalar(sel ? 1 + 0.04 * Math.sin(now * 5) : 1);
    if (t.pathLine) {
      const show = sel && t.alive && t.path.length > 0 && game.state === 'playing'; t.pathLine.visible = show;
      if (show) {
        const a = t.pathLine.geometry.attributes.position; const pts = [pos(t), ...t.path].slice(0, 40);
        pts.forEach((q, i) => a.setXYZ(i, q.x, surfaceY(q.x, q.z) + 0.3, q.z)); a.needsUpdate = true; t.pathLine.geometry.setDrawRange(0, pts.length);
      }
    }
  }
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i]; m.t += dt; const k = m.t / 0.55;
    m.m.scale.setScalar((m.big ? 3.2 : 2) * (1 - k * 0.6)); m.m.material.opacity = 1 - k;
    if (k >= 1) { scene.remove(m.m); m.m.material.dispose(); markers.splice(i, 1); }
  }
  for (const f of flashLights) { f.t = Math.max(0, f.t - dt); f.l.intensity = f.peak * (f.t / 0.18) ** 2; }
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let cpuMs = 0, fps = 60, fpsAcc = 0, fpsN = 0;
function frame() {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const raw = clock.getDelta(); const dt = Math.min(raw, 0.05);
  fpsAcc += raw; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  for (let s = 0; s < game.timeScale; s++) {
    if (game.state !== 'over') game.time += dt;
    for (const t of tanks) { updateTank(t, dt); damageFx(t, dt); }
    updateSpotting(dt);
    separate();
    updateShells(dt);
    updateEmitters(dt);
    fx.update(dt); smoke.update(dt);
    if (game.state === 'ending' && game.time >= game.endAt) showBanner();
  }
  updateVisuals(dt, performance.now() / 1000);
  updateCamera(dt);
  updateHUD();
  drawMinimap(dt);
  cpuMs = cpuMs * 0.9 + (performance.now() - t0) * 0.1;
  renderer.render(scene, camera);
}
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  const u = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  fx.mat.uniforms.uScale.value = smoke.mat.uniforms.uScale.value = u;
}
window.addEventListener('resize', onResize); onResize();
startGame();
frame();

// ---------- test / debug hooks ----------
window.__game = {
  get state() { return game.state; }, get result() { return game.result; }, get stats() { return { ...game.stats }; }, get fps() { return fps; }, get cpuMs() { return cpuMs; },
  tanks: () => tanks.map((t) => ({ id: t.id, team: t.team, hp: t.hp, dmg: t.dmg, speedMul: t.dmg === 2 ? 0.8 : 1, hullColor: t.mats.main.color.getHexString(), alive: t.alive, x: pos(t).x, z: pos(t).z, selected: selected.has(t), order: t.order?.type || null, pathLen: t.path.length, turretYaw: t.turretYaw, yaw: t.yaw })),
  screenOf: (id) => { const t = tanks.find((t) => t.id === id); const s = toScreen(tmpV.copy(pos(t)).setY(pos(t).y + 1.2)); return { x: s.x, y: s.y }; },
  worldToScreen: (x, y, z) => { const s = toScreen(new THREE.Vector3(x, y, z)); return { x: s.x, y: s.y }; },
  cameraDistance: () => camera.position.distanceTo(controls.target) ,
  cameraTarget: () => ({ x: controls.target.x, z: controls.target.z }),
  cameraPos: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
  shellsInFlight: () => shells.length,
  setTimeScale: (n) => { game.timeScale = Math.max(1, n | 0); },
  focus: (x, z, d) => { cam.shift.set(x - controls.target.x, 0, z - controls.target.z); if (d) { cam.want = clamp(d, CFG.minDist, CFG.maxDist); cam.tiltWant = tiltFor(cam.want); cam.tiltT = 0.7; } },
  restart: startGame,
  groundScreen: (x, z) => { const s = toScreen(new THREE.Vector3(x, surfaceY(x, z), z)); return { x: s.x, y: s.y }; },
  riverZ: (x) => riverZ(x),
  forceStraight: (id, x, z) => { const t = tanks.find((t) => t.id === id); t.order = { type: 'move' }; t.goal = { x, z }; t.path = [{ x, z }]; t.straight = true; },
  losBetween: (x0, z0, x1, z1) => losClear(x0, surfaceY(x0, z0) + 1.9, z0, x1, surfaceY(x1, z1) + 1.3, z1),
  inForest: (x, z) => inForest(x, z),
  isWet: (x, z) => wet(x, z),
  navBlocked: (x, z) => nav.blockedAt(x, z),
  pathFor: (id, x, z) => { const t = tanks.find((t) => t.id === id); return nav.findPath(pos(t).x, pos(t).z, x, z); },
  teleport: (id, x, z) => { const t = tanks.find((t) => t.id === id); pos(t).set(x, surfaceY(x, z), z); t.prev.copy(pos(t)); t.safe?.copy(pos(t)); stop(t); t.order = null; },
  spotted: (id) => !!tanks.find((t) => t.id === id)?.root.visible,
  minimapRect: () => { const r = mmCanvas.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
  treeCount,
  bridges: () => BRIDGES_INFO,
  ford: FORD,
  gameTime: () => game.time,
  maxHp: CFG.hp,
  thresholds: { damaged: DMG_DAMAGED, heavy: DMG_HEAVY },
  debugHit: (id, dmg) => { const t = tanks.find((t) => t.id === id); if (t?.alive) hitTank(t, dmg, pos(t).clone().setY(pos(t).y + 1.5), null); },
  holdAI: (v) => { game.holdAI = !!v; },
  countHealthBarObjects: () => { let n = 0; scene.traverse((o) => { if (o.isSprite || /hp|health/i.test(o.name || '')) n++; }); return n; },
  pathLinesVisible: () => tanks.filter((t) => t.pathLine?.visible).length,
  debugAttack: (id) => { const t = tanks.find((t) => t.id === id); if (t) orderAttack(alive('blue'), t); },
};
