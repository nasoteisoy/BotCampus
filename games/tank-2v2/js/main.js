// R.U.S.E.-style RTS: build bases, roll out infantry / armor / artillery / air, destroy the enemy HQ. No HP bars.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { buildMap, renderMinimap, obstacles, sdObs, segmentHitT, pushOut, minObsDist, HALF, heightAt, surfaceY, waterClass, inForest, onRoad, terrainSpeed, WATER_Y, CITY, riverZ, BRIDGES as BRIDGES_INFO, FORD } from './map.js';
import { NavGrid } from './nav.js';
import { Particles } from './particles.js';
import { UNITS, BUILDINGS, DMG_MULT, ABILITIES, BRANCHES, START_MONEY, HQ_INCOME, DEPOT_INCOME, BUILD_RADIUS, VISION_BLD, HQ_POS, SUPPLY } from './config.js';
import { TEAM, SHARED, buildVehicle, buildPlane, buildSquad, buildBuilding, supplyPadTexture, buildFlag } from './models.js';
import { svg } from './icons.js';

const CFG = { minDist: 8, maxDist: 330, shellSpeed: 72, gravity: 14 };
const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const OTHER = { blue: 'red', red: 'blue' };

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
  const hx = HQ_POS.blue.x, hz = HQ_POS.blue.z - 22;
  controls.target.set(hx, 0, hz);
  const phi = 0.84; cam.dist = cam.want = 90;
  camera.position.set(hx, Math.cos(phi) * cam.dist, hz + Math.sin(phi) * cam.dist);
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

// =====================================================================================
// world state
// =====================================================================================
let units = [], buildings = [], shells = [], emitters = [], markers = [], mines = [], reveals = [], wrecks = [], bombs = [];
const teams = { blue: { money: START_MONEY, rate: 0 }, red: { money: START_MONEY, rate: 0 } };
const game = { state: 'menu', time: 0, endAt: 0, timeScale: 1, result: null, difficulty: 'normal', holdAI: false, stats: { shots: 0, hits: 0, kills: 0, lost: 0, built: 0, trained: 0 } };
const selUnits = new Set();
let selBld = null;
let uid = 0;
const pickMeshes = [];   // unit + building pick volumes
const tmpV = new THREE.Vector3(), tmpP = new THREE.Vector3();
const pos = (e) => e.root.position;
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const isAir = (u) => u.kind === 'air';
const isInf = (u) => u.kind === 'inf';
const enemyOf = (team) => OTHER[team];
const aliveUnits = (team) => units.filter((u) => u.alive && (!team || u.team === team));
const aliveBlds = (team) => buildings.filter((b) => b.alive && (!team || b.team === team));
const hqOf = (team) => buildings.find((b) => b.type === 'hq' && b.team === team);
const inCity = (x, z) => Math.abs(x - CITY.x) < CITY.half && Math.abs(z - CITY.z) < CITY.half;
const houses = obstacles.filter((o) => o.house);

const shellGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.5, 6).rotateX(Math.PI / 2);
const shellMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, toneMapped: false });
const bombGeo = new THREE.CapsuleGeometry(.3, .9, 2, 6).rotateX(Math.PI / 2);
const scorchTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(20,16,12,0.85)'); gr.addColorStop(.6, 'rgba(30,24,18,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const sootColor = new THREE.Color(0x2a2724);
const DMG_DAMAGED = 0.7, DMG_HEAVY = 0.35;

// ---------- supply spots ----------
const padTex = supplyPadTexture();
const spots = SUPPLY.map(([x, z], i) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, surfaceY(x, z) + .12, z); m.renderOrder = 1; scene.add(m);
  return { i, x, z, mesh: m, bld: null };
});

// house pick volumes (garrison targets)
const housePicks = houses.map((o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(o.hx * 2, o.h, o.hz * 2), new THREE.MeshBasicMaterial({ visible: false })); m.position.set(o.x, o.h / 2, o.z); m.userData.house = o; scene.add(m); o.garrison = null; return m; });
const garrisonFlagGeo = new THREE.ConeGeometry(.6, 1.4, 4);

// pooled ring for construction progress (drawRange on a 64-seg ring)
function progressRing(r) {
  const g = new THREE.RingGeometry(r, r + .7, 64, 1).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd65a, transparent: true, opacity: .9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  m.renderOrder = 2; return m;
}

// =====================================================================================
// units
// =====================================================================================
function createUnit(type, team, x, z, yaw = team === 'blue' ? Math.PI : 0) {
  const def = UNITS[type];
  const u = {
    id: `${team[0]}${type}${++uid}`, type, def, team, kind: def.kind, hp: def.hp, maxHp: def.hp, alive: true,
    yaw, turretYaw: 0, speed: 0, path: [], goal: null, order: null, reload: rand(.3, 1.2), fireTarget: null, tgtT: 0,
    vel: new THREE.Vector3(), prev: new THREE.Vector3(x, 0, z), stuck: { t: 0, x, z, n: 0 }, repath: 0, dustT: 0,
    dmg: 0, dmgT: 0, sparkT: 1, flash: 0, recoil: 0, deployT: 0, vis: { blue: team === 'blue', red: team === 'red' }, seen: { blue: 0, red: 0 },
    cd: 0, sprintUntil: 0, suppressedUntil: 0, ambush: false, deployed: false, garrison: null, firedAt: -99, satchel: null,
    men: def.men || 0, ai: null,
  };
  if (u.kind === 'inf') {
    Object.assign(u, buildSquad(type, team, def.men));
    scene.add(u.im);
    u.soldiers = [];
    const cols = Math.ceil(Math.sqrt(def.men * 1.6));
    for (let i = 0; i < def.men; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const ox = (c - (cols - 1) / 2) * 1.35 + rand(-.25, .25), oz = -r * 1.4 + rand(-.25, .25) + (Math.ceil(def.men / cols) - 1) * .7;
      u.soldiers.push({ ox, oz, x: x + ox, z: z + oz, y: 0, yaw, ph: rand(0, 6) });
    }
  } else if (u.kind === 'air') {
    Object.assign(u, buildPlane(type, team));
    scene.add(u.ring); scene.add(u.shadow);
    u.alt = def.alt; u.ammo = def.ammo || 0; u.airState = 'idle'; u.loiterT = 0; u.bank = 0; u.home = null; u.rearmT = 0;
  } else {
    Object.assign(u, buildVehicle(type, team));
  }
  u.baseMain = u.mats?.main.color.clone(); u.baseTrim = u.mats?.trim.color.clone();
  const y = u.kind === 'air' ? 4 : surfaceY(x, z);
  u.root.position.set(x, y, z); u.root.rotation.y = yaw;
  u.pick.userData.ent = u; pickMeshes.push(u.pick);
  scene.add(u.root);
  if (team === 'blue') {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 40), 3));
    u.pathLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x8ff7ff, transparent: true, opacity: .5, depthWrite: false }));
    u.pathLine.frustumCulled = false; u.pathLine.visible = false; scene.add(u.pathLine);
  }
  units.push(u); return u;
}
const menAlive = (u) => Math.max(0, Math.ceil(u.hp / u.def.hpm - 1e-6));

function updateDamageState(u) {
  const f = u.hp / u.maxHp, st = f < DMG_HEAVY ? 2 : f < DMG_DAMAGED ? 1 : 0;
  if (st === u.dmg) return; u.dmg = st;
  if (u.kind === 'inf' || !u.mats) return;
  const k = [0, .4, .62][st];
  u.mats.main.color.copy(u.baseMain).lerp(sootColor, k); u.mats.trim.color.copy(u.baseTrim).lerp(sootColor, k);
}
function setPath(u, x, z) { u.straight = false; u.goal = { x, z }; u.path = nav.findPath(pos(u).x, pos(u).z, x, z); u.stuck.n = 0; u.stuck.t = 0; }
function stop(u) { u.path = []; u.goal = null; }

// ---------- line of sight / range ----------
function losClear(x0, y0, z0, x1, y1, z1, ignoreWreck = null, ignoreObs = null) {
  const extra = ignoreWreck ? wrecks.filter((w) => !ignoreWreck.includes(w.unit)) : wrecks;
  if (ignoreObs) { const i = obstacles.indexOf(ignoreObs); if (i >= 0) { obstacles.splice(i, 1); const r = losClear(x0, y0, z0, x1, y1, z1, ignoreWreck); obstacles.splice(i, 0, ignoreObs); return r; } }
  if (segmentHitT(x0, z0, x1, z1, 0, extra, y0, y1) >= 0) return false;
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.ceil(L / 2.5)); let trees = 0;
  for (let k = 1; k < n; k++) {
    const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t;
    if (heightAt(x, z) > y - 0.3) return false;
    if (Math.min(t, 1 - t) * L > 5 && inForest(x, z) && (trees += L / n) > 9) return false;
  }
  return true;
}
// eye / aim point: garrisoned squads look out from the house wall facing the other party
function eyeOf(e, toward) {
  if (e.isBld) return { x: e.x + clamp(toward.x - e.x, -e.hx, e.hx), y: surfaceY(e.x, e.z) + e.def.h * .5, z: e.z + clamp(toward.z - e.z, -e.hz, e.hz) };
  const p = pos(e);
  if (e.garrison) { const o = e.garrison, dx = toward.x - o.x, dz = toward.z - o.z, k = Math.max(Math.abs(dx) / (o.hx + .6), Math.abs(dz) / (o.hz + .6)) || 1; return { x: o.x + dx / k, y: 3, z: o.z + dz / k }; }
  return { x: p.x, y: p.y + (e.kind === 'inf' ? 1.3 : 1.8), z: p.z };
}
function hasLOS(a, b) {
  const pa = a.isBld ? { x: a.x, z: a.z } : pos(a), pb = b.isBld ? { x: b.x, z: b.z } : pos(b);
  const ea = eyeOf(a, pb), eb = eyeOf(b, pa);
  // a building target: aim at its nearest wall, ignore its own obstacle
  return losClear(ea.x, ea.y, ea.z, eb.x, eb.y, eb.z, [a, b], b.isBld ? b.obs : a.isBld ? a.obs : null);
}
function rangeOf(u, tg) {
  let r = u.def.rng || 0;
  if (u.deployed) r += 8; if (u.garrison) r += 5;
  if (tg && !u.def.indirect && !isAir(tg)) r *= 1 + clamp((pos(u).y - (tg.isBld ? surfaceY(tg.x, tg.z) : pos(tg).y)) / 12, 0, .35);
  return r;
}
const tgtPos = (t) => (t.isBld ? { x: t.x, y: surfaceY(t.x, t.z), z: t.z } : pos(t));
function distTo(u, t) { const p = pos(u); if (t.isBld) { const dx = Math.max(Math.abs(p.x - t.x) - t.hx, 0), dz = Math.max(Math.abs(p.z - t.z) - t.hz, 0); return Math.hypot(dx, dz); } return dist2d(p, pos(t)); }

// =====================================================================================
// buildings
// =====================================================================================
const facingOf = (team) => (team === 'blue' ? -1 : 1);  // door direction along z
function createBuilding(type, team, x, z, built = false) {
  const def = BUILDINGS[type];
  const m = buildBuilding(type, team);
  const b = {
    isBld: true, id: `${team[0]}${type}${++uid}`, type, def, team, x, z, hx: def.hx, hz: def.hz, hp: def.hp, maxHp: def.hp, alive: true,
    built, progress: built ? 1 : 0, ...m, queue: [], prodT: 0, dmg: 0, dmgT: 0, vis: { blue: team === 'blue' || type === 'hq', red: team === 'red' || type === 'hq' }, everSeen: { blue: false, red: false }, seen: { blue: 0, red: 0 },
  };
  const fz = facingOf(team);
  b.door = { x, z: z + fz * (def.hz + 5.5) };
  b.rally = { x: x + rand(-3, 3), z: z + fz * (def.hz + 16) };
  if (type === 'airfield') b.door = { x: x + 14, z: z + fz * 1.8 };
  const y = surfaceY(x, z);
  b.root.position.set(x, y, z); b.root.rotation.y = team === 'blue' ? Math.PI : 0;
  // foundation slab so the building sits cleanly on uneven ground
  const slab = new THREE.Mesh(new THREE.BoxGeometry(def.hx * 2 + 1.2, 1.6, def.hz * 2 + 1.2), SHARED.concreteDark); slab.position.y = -.65; slab.receiveShadow = true; b.root.add(slab);
  const pick = new THREE.Mesh(new THREE.BoxGeometry(def.hx * 2, def.h, def.hz * 2), new THREE.MeshBasicMaterial({ visible: false })); pick.position.y = def.h / 2; pick.userData.ent = b; b.root.add(pick); b.pick = pick; pickMeshes.push(pick);
  // selection frame
  const fr = new THREE.Group(), fm = new THREE.MeshBasicMaterial({ color: TEAM[team].ring, transparent: true, opacity: .9, depthWrite: false, toneMapped: false });
  for (const [w, d, ox, oz] of [[def.hx * 2 + 2, .35, 0, def.hz + 1], [def.hx * 2 + 2, .35, 0, -def.hz - 1], [.35, def.hz * 2 + 2, def.hx + 1, 0], [.35, def.hz * 2 + 2, -def.hx - 1, 0]]) { const s = new THREE.Mesh(new THREE.BoxGeometry(w, .08, d), fm); s.position.set(ox, .2, oz); fr.add(s); }
  fr.visible = false; b.root.add(fr); b.frame = fr;
  b.ringP = progressRing(Math.max(def.hx, def.hz) + 2); b.ringP.position.set(x, y + .3, z); b.ringP.visible = !built; scene.add(b.ringP);
  if (!built) b.body.scale.y = .06;
  scene.add(b.root);
  b.obs = { type: 'box', x, z, hx: def.hx, hz: def.hz, h: def.h, base: y, bld: b };
  obstacles.push(b.obs);
  b.navRect = { x, z, hx: def.hx, hz: def.hz }; nav.addRect(b.navRect);
  if (type === 'depot') { const sp = spots.find((s) => Math.hypot(s.x - x, s.z - z) < 1); if (sp) { sp.bld = b; b.spot = sp; sp.mesh.visible = false; } }
  b.flag = buildFlag(team); b.flag.visible = false; scene.add(b.flag);
  buildings.push(b);
  return b;
}
function freeSpotNear(x, z, r = 8) {
  let best = null, bd = r;
  for (const s of spots) { if (s.bld) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
// Placement rules. Returns {ok, reason, x, z} (depots snap to supply spots).
function canPlace(type, team, x, z, ignoreMoney = false) {
  const def = BUILDINGS[type];
  if (!ignoreMoney && teams[team].money < def.cost) return { ok: false, reason: 'Not enough money', x, z };
  if (type === 'depot') {
    const sp = freeSpotNear(x, z, 9);
    if (!sp) return { ok: false, reason: 'Depots go on a free $ supply spot', x, z };
    x = sp.x; z = sp.z;
    const nearBase = aliveBlds(team).some((b) => (b.built || b.type === 'hq') && Math.hypot(b.x - x, b.z - z) < BUILD_RADIUS + 10);
    const nearTroops = aliveUnits(team).some((u) => !isAir(u) && dist2d(pos(u), { x, z }) < 30);
    if (!nearBase && !nearTroops) return { ok: false, reason: 'Too far: needs your base or troops nearby', x, z };
    if (aliveUnits(enemyOf(team)).some((u) => !isAir(u) && u.vis[team] && dist2d(pos(u), { x, z }) < 14)) return { ok: false, reason: 'Enemy troops on the spot', x, z };
    return { ok: true, x, z };
  }
  if (Math.abs(x) > HALF - def.hx - 4 || Math.abs(z) > HALF - def.hz - 4) return { ok: false, reason: 'Outside the map', x, z };
  let hmin = Infinity, hmax = -Infinity;
  for (let gx = -def.hx; gx <= def.hx + .01; gx += 2) for (let gz = -def.hz; gz <= def.hz + .01; gz += 2) {
    const px = x + gx, pz = z + gz;
    if (waterClass(px, pz)) return { ok: false, reason: 'Cannot build on water', x, z };
    if (inForest(px, pz)) return { ok: false, reason: 'Cannot build in forest', x, z };
    if (onRoad(px, pz)) return { ok: false, reason: 'Cannot build on a road', x, z };
    const h = heightAt(px, pz); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
  }
  if (hmax - hmin > 3) return { ok: false, reason: 'Ground too steep', x, z };
  if (!aliveBlds(team).some((b) => (b.built || b.type === 'hq') && Math.hypot(b.x - x, b.z - z) < BUILD_RADIUS)) return { ok: false, reason: 'Too far from your base', x, z };
  for (const o of obstacles) {
    if (o.border) continue;
    const e = o.type === 'circle' ? o.r : Math.max(o.hx, o.hz);
    if (Math.abs(o.x - x) > def.hx + e + 3 || Math.abs(o.z - z) > def.hz + e + 3) continue;
    const pad = o.bld ? 3 : 1;
    if (o.type === 'circle' ? (Math.max(Math.abs(o.x - x) - def.hx, 0) ** 2 + Math.max(Math.abs(o.z - z) - def.hz, 0) ** 2 < (o.r + pad) ** 2) : (Math.abs(o.x - x) < def.hx + o.hx + pad && Math.abs(o.z - z) < def.hz + o.hz + pad)) return { ok: false, reason: o.bld ? 'Too close to another building' : 'Blocked', x, z };
  }
  for (const s of spots) if (!s.bld && Math.abs(s.x - x) < def.hx + 4.5 && Math.abs(s.z - z) < def.hz + 4.5) return { ok: false, reason: 'Keep supply spots free', x, z };
  for (const u of units) if (u.alive && !isAir(u) && Math.abs(pos(u).x - x) < def.hx + u.def.r && Math.abs(pos(u).z - z) < def.hz + u.def.r) return { ok: false, reason: 'Units in the way', x, z };
  return { ok: true, x, z };
}
function placeBuilding(type, team, x, z) {
  const c = canPlace(type, team, x, z);
  if (!c.ok) return null;
  teams[team].money -= BUILDINGS[type].cost;
  const b = createBuilding(type, team, c.x, c.z, false);
  if (team === 'blue') game.stats.built++;
  for (let i = 0; i < 14; i++) smoke.spawn(c.x + rand(-b.hx, b.hx), surfaceY(c.x, c.z) + .5, c.z + rand(-b.hz, b.hz), rand(-1, 1), rand(.5, 2), rand(-1, 1), rand(2, 3), 1.2, 3, .72, .66, .55, .5, 1.5, -.2);
  return b;
}
function queueUnit(b, type) {
  const def = UNITS[type];
  if (!b.alive || !b.built || !b.def.units.includes(type)) return false;
  if (b.queue.length >= 8) return false;
  if (teams[b.team].money < def.cost) return false;
  teams[b.team].money -= def.cost; b.queue.push(type); return true;
}
function cancelUnit(b, type) {
  const i = b.queue.lastIndexOf(type); if (i < 0) return false;
  b.queue.splice(i, 1); teams[b.team].money += UNITS[type].cost; if (i === 0) b.prodT = 0; return true;
}
function updateBuilding(b, dt) {
  if (!b.alive) return;
  if (!b.built) {
    b.progress = Math.min(1, b.progress + dt / b.def.time);
    b.body.scale.y = .06 + .94 * b.progress;
    b.ringP.geometry.setDrawRange(0, Math.floor(64 * b.progress) * 6);
    if (Math.random() < dt * 6) smoke.spawn(b.x + rand(-b.hx, b.hx), surfaceY(b.x, b.z) + rand(.5, 3), b.z + rand(-b.hz, b.hz), rand(-.5, .5), rand(.3, 1), rand(-.5, .5), rand(1.2, 2), 1, 2.5, .75, .7, .6, .4, 1.2, -.1);
    if (b.progress >= 1) { b.built = true; b.ringP.visible = false; }
    return;
  }
  if (b.queue.length) {
    b.prodT += dt;
    const type = b.queue[0];
    if (b.prodT >= UNITS[type].time) {
      b.prodT = 0; b.queue.shift();
      spawnFrom(b, type);
    }
  }
}
function spawnFrom(b, type) {
  const def = UNITS[type], fz = facingOf(b.team);
  let u;
  if (def.kind === 'air') {
    u = createUnit(type, b.team, b.x + 14, b.z + fz * 1.8, Math.PI / 2);
    u.home = b; u.airState = 'idle'; pos(u).y = 2;
    u.climb = true;
  } else {
    const [fx_, fz_] = nav.freePoint(b.door.x, b.door.z);
    u = createUnit(type, b.team, fx_, fz_, fz > 0 ? 0 : Math.PI);
    const r = b.rally;
    const off = (units.filter((o) => o.alive && o.team === b.team && o.goal && Math.hypot(o.goal.x - r.x, o.goal.z - r.z) < 6).length) * 1.0;
    setPath(u, r.x + rand(-off, off), r.z + rand(-off, off)); u.order = { type: 'move' };
  }
  if (b.team === 'blue') game.stats.trained++;
  if (b.team === 'red' && aiState) aiState.newUnit(u);
  return u;
}
function bldDamageFx(b, dt) {
  if (!b.alive || !b.dmg || !b.vis.blue) return;
  b.dmgT -= dt; if (b.dmgT > 0) return;
  const y = surfaceY(b.x, b.z) + b.def.h * (b.built ? 1 : b.progress);
  const n = b.type === 'airfield' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const x = b.x + rand(-b.hx, b.hx) * .6, z = b.z + rand(-b.hz, b.hz) * .6;
    if (b.dmg === 1) { b.dmgT = .14; smoke.spawn(x, y, z, rand(-.2, .2) + .3, rand(1.4, 2.2), rand(-.2, .2), rand(2.5, 3.5), 1, rand(4, 5), .8, .8, .78, .5, .4, -.2); }
    else { b.dmgT = .07; smoke.spawn(x, y, z, rand(-.3, .3) + .4, rand(2, 3), rand(-.3, .3), rand(3, 4.5), 1.2, rand(5, 7), .14, .13, .12, .6, .3, -.25); fx.spawn(x, y, z, rand(-.3, .3), rand(1.5, 3), rand(-.3, .3), rand(.6, 1), rand(1.2, 1.8), .25, 1, rand(.45, .65), .12, .95, 1, -1.5); }
  }
}
function updateBldDamageState(b) {
  const f = b.hp / b.maxHp, st = f < DMG_HEAVY ? 2 : f < DMG_DAMAGED ? 1 : 0;
  if (st === b.dmg) return; b.dmg = st;
  const k = [0, .25, .45][st];
  for (const m of Object.values(b.mats)) { m.userData.base ||= m.color.clone(); m.color.copy(m.userData.base).lerp(sootColor, k); }
}
function destroyBuilding(b) {
  b.alive = false; b.queue = [];
  if (selBld === b) selBld = null;
  const p = new THREE.Vector3(b.x, surfaceY(b.x, b.z) + 2, b.z);
  for (let i = 0; i < 60; i++) { const a = rand(0, 6.28), s = rand(2, 10); fx.spawn(p.x + rand(-b.hx, b.hx) * .6, p.y + rand(0, 3), p.z + rand(-b.hz, b.hz) * .6, Math.cos(a) * s, rand(2, 10), Math.sin(a) * s, rand(.5, 1.1), rand(2, 3.5), rand(4, 6), 1, rand(.45, .75), .15, .95, 3, 2); }
  for (let i = 0; i < 40; i++) smoke.spawn(p.x + rand(-b.hx, b.hx), p.y, p.z + rand(-b.hz, b.hz), rand(-3, 3), rand(1, 5), rand(-3, 3), rand(3, 5), 3, rand(8, 12), .2, .19, .18, .7, 1.2, -.4);
  flashLight(p, 900, 0xff9040); addShake(p, 1.1);
  for (const m of Object.values(b.mats)) { m.color.setHex(0x2d2a27); }
  b.body.scale.y = .28; b.body.rotation.z = rand(-.04, .04);
  b.ringP.visible = false; b.frame.visible = false; b.flag.visible = false;
  const i = obstacles.indexOf(b.obs); if (i >= 0) obstacles.splice(i, 1);
  nav.removeRect(b.navRect);
  const pi = pickMeshes.indexOf(b.pick); if (pi >= 0) pickMeshes.splice(pi, 1);
  if (b.spot) { b.spot.bld = null; b.spot.mesh.visible = true; }
  emitters.push({ b, age: 0, acc: 0, life: 30 });
  checkEnd();
}

// =====================================================================================
// orders
// =====================================================================================
function leaveGarrison(u, toward) {
  const o = u.garrison; if (!o) return;
  o.garrison = null; u.garrison = null;
  if (o.flagMesh) { scene.remove(o.flagMesh); o.flagMesh = null; }
  const dx = toward.x - o.x, dz = toward.z - o.z, k = Math.max(Math.abs(dx) / (o.hx + 3.5), Math.abs(dz) / (o.hz + 3.5)) || 1;
  const [fx_, fz_] = nav.freePoint(o.x + dx / k, o.z + dz / k);
  pos(u).set(fx_, surfaceY(fx_, fz_), fz_); u.prev.copy(pos(u)); u.safe?.copy(pos(u));
  u.im.visible = true; for (const s of u.soldiers) { s.x = fx_ + s.ox; s.z = fz_ + s.oz; }
}
function prepMove(u, x, z) { if (u.garrison) leaveGarrison(u, { x, z }); u.deployed = false; u.ambush = false; u.satchel = null; }
function orderMove(list, x, z, type = 'move') {
  const ground = list.filter((u) => u.alive && !isAir(u)), air = list.filter((u) => u.alive && isAir(u));
  for (const a of air) airOrder(a, { x, z });
  if (ground.length) {
    const c = ground.reduce((a, u) => a.add(pos(u)), new THREE.Vector3()).multiplyScalar(1 / ground.length);
    const dir = new THREE.Vector3(x - c.x, 0, z - c.z); if (dir.lengthSq() < .01) dir.set(0, 0, -1); dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const sp = Math.max(...ground.map((u) => u.def.r)) * 2.5, perRow = Math.min(5, Math.ceil(Math.sqrt(ground.length * 1.5)));
    const sorted = [...ground].sort((a, b) => pos(a).clone().sub(c).dot(perp) - pos(b).clone().sub(c).dot(perp));
    const rows = Math.ceil(sorted.length / perRow);
    // assign by row: sort into columns by lateral offset, rows by distance
    sorted.forEach((u, i) => {
      const col = i % perRow, row = Math.floor(i / perRow), inRow = Math.min(perRow, sorted.length - row * perRow);
      const off = (col - (inRow - 1) / 2) * sp, back = (row - (rows - 1) / 2) * sp;
      prepMove(u, x, z);
      u.order = type === 'amove' ? { type: 'amove', x, z } : { type: 'move' };
      setPath(u, clamp(x + perp.x * off - dir.x * back, -HALF + 3, HALF - 3), clamp(z + perp.z * off - dir.z * back, -HALF + 3, HALF - 3));
    });
  }
  if (list[0]?.team === 'blue') addMarker(x, z, 0x7dffb0);
}
function orderAttack(list, target) {
  for (const u of list) {
    if (!u.alive) continue;
    if (isAir(u)) { airOrder(u, target); continue; }
    if (!canHurt(u, target)) { prepMove(u, tgtPos(target).x, tgtPos(target).z); setPath(u, tgtPos(target).x, tgtPos(target).z); u.order = { type: 'move' }; continue; }
    if (u.garrison && distTo(u, target) > rangeOf(u, target)) leaveGarrison(u, tgtPos(target));
    u.ambush = false; u.order = { type: 'attack', target }; u.repath = 0;
  }
  if (list[0]?.team === 'blue') addMarker(tgtPos(target).x, tgtPos(target).z, 0xff5050, true);
}
function orderGarrison(list, house) {
  const inf = list.filter((u) => u.alive && isInf(u));
  const other = list.filter((u) => u.alive && !isInf(u));
  if (other.length) orderMove(other, house.x, house.z + house.hz + 8);
  inf.forEach((u, i) => {
    if (i === 0 && !house.garrison) { prepMove(u, house.x, house.z); u.order = { type: 'garrison', house }; const [gx, gz] = nav.freePoint(house.x, house.z + Math.sign(pos(u).z - house.z || 1) * (house.hz + 3)); setPath(u, gx, gz); }
    else { prepMove(u, house.x, house.z); u.order = { type: 'move' }; const [gx, gz] = nav.freePoint(house.x + rand(-6, 6), house.z + Math.sign(pos(u).z - house.z || 1) * (house.hz + 6)); setPath(u, gx, gz); }
  });
  if (list[0]?.team === 'blue') addMarker(house.x, house.z, 0xffd65a, true);
}
function enterGarrison(u, house) {
  if (house.garrison) return false;
  house.garrison = u; u.garrison = house; stop(u); u.order = null;
  pos(u).set(house.x, surfaceY(house.x, house.z), house.z);
  u.im.visible = false;
  const f = new THREE.Mesh(garrisonFlagGeo, new THREE.MeshBasicMaterial({ color: TEAM[u.team].ring, toneMapped: false }));
  f.position.set(house.x, house.h + 1.6, house.z); f.rotation.x = Math.PI; scene.add(f); house.flagMesh = f;
  return true;
}

// ---------- markers ----------
const markerGeo = new THREE.RingGeometry(0.8, 1.15, 32).rotateX(-Math.PI / 2);
function addMarker(x, z, color, big = false) {
  const m = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false }));
  m.position.set(x, surfaceY(x, z) + .15, z); m.renderOrder = 1; scene.add(m); markers.push({ m, t: 0, big });
}

// =====================================================================================
// combat
// =====================================================================================
const multOf = (wpn, t) => DMG_MULT[wpn][t.isBld ? 'bld' : t.def.armor];
function canHurt(u, t) { const w = u.def.wpn; return !!w && multOf(w, t) > 0; }
function concealed(t) { // harder to spot: infantry in cover, vehicles in forest, ambushers
  if (t.isBld || isAir(t)) return 0;
  const p = pos(t);
  if (t.ambush) return 3;
  if (t.garrison) return 2;
  if (isInf(t) && (inForest(p.x, p.z) || inCity(p.x, p.z))) return 2;
  if (inForest(p.x, p.z) && game.time - t.firedAt > 3) return 1;
  if (t.kind === 'gun' && t.speed < .3 && game.time - t.firedAt > 3) return 1;
  return 0;
}
function validTarget(u, t) {
  if (!t.alive || t.team === u.team || !t.vis[u.team]) return false;
  if (!canHurt(u, t)) return false;
  if (isAir(t) !== !!(u.def.wpn === 'flak' || u.def.wpn === 'aamg')) return false;
  if (t.isBld && !t.everSeen[u.team] && t.type !== 'hq') return false;
  const d = distTo(u, t);
  if (d > rangeOf(u, t)) return false;
  if (u.def.minRng && d < u.def.minRng) return false;
  if (u.def.indirect || isAir(t) || isAir(u)) return true;
  return hasLOS(u, t);
}
function chooseFireTarget(u) {
  if (u.order?.type === 'attack' && validTarget(u, u.order.target)) return u.order.target;
  if (u.fireTarget && validTarget(u, u.fireTarget) && !u.fireTarget.isBld) return u.fireTarget;
  let best = null, bs = Infinity;
  const R = (u.def.rng || 0) + 14;
  for (const t of units) {
    if (!t.alive || t.team === u.team || Math.abs(pos(t).x - pos(u).x) > R || Math.abs(pos(t).z - pos(u).z) > R) continue;
    if (!validTarget(u, t)) continue;
    const s = distTo(u, t) / rangeOf(u, t) - multOf(u.def.wpn, t) * 1.2 + (u.team === 'red' ? t.hp / t.maxHp * .4 : 0);
    if (s < bs) { bs = s; best = t; }
  }
  if (!best) for (const b of buildings) {
    if (!b.alive || b.team === u.team || Math.abs(b.x - pos(u).x) > R + 16 || Math.abs(b.z - pos(u).z) > R + 16) continue;
    if (!validTarget(u, b)) continue;
    const s = distTo(u, b); if (s < bs) { bs = s; best = b; }
  }
  return best;
}
function applyDamage(t, amount, wpn, from, attacker) {
  if (!t.alive) return;
  let d = amount * multOf(wpn, t);
  if (!t.isBld) {
    const p = pos(t);
    if (isInf(t)) { if (t.garrison) d *= .35; else if (inForest(p.x, p.z) || inCity(p.x, p.z)) d *= .5; }
    if (t.def.front && from && (wpn === 'at' || wpn === 'cannon' || wpn === 'rocket')) {
      const a = Math.abs(wrap(Math.atan2(from.x - p.x, from.z - p.z) - t.yaw));
      d *= a < 1.0 ? t.def.front : a > 2.3 ? 1.25 : 1;
    }
    if (t.kind === 'inf' && attacker?.def?.suppress) t.suppressedUntil = game.time + 3;
  } else if (!t.built) d *= 1.4;
  if (d <= 0) return;
  const menBefore = t.kind === 'inf' ? menAlive(t) : 0;
  t.hp = Math.max(game.invuln === t.team && t.type === 'hq' ? 1 : 0, t.hp - d); t.flash = .12;
  if (attacker?.team === 'blue') game.stats.hits++;
  if (t.team === 'red' && attacker && aiState) aiState.attacked(t, attacker);
  if (t.isBld) { updateBldDamageState(t); if (t.hp <= 0) destroyBuilding(t); return; }
  updateDamageState(t);
  if (t.kind === 'inf') {
    const m = menAlive(t);
    if (m < menBefore && t.im.visible) for (let k = m; k < menBefore; k++) { const s = t.soldiers[k]; if (s) for (let i = 0; i < 5; i++) smoke.spawn(s.x, s.y + .4, s.z, rand(-1, 1), rand(.3, 1.2), rand(-1, 1), rand(.6, 1), .8, 1.5, .55, .5, .42, .5, 1.5, 0); }
    t.im.count = m;
  }
  if (t.hp <= 0) killUnit(t);
}
function killUnit(u) {
  u.alive = false; u.path = []; u.order = null; u.speed = 0;
  if (u.team === 'red') game.stats.kills++; else game.stats.lost++;
  selUnits.delete(u);
  const pi = pickMeshes.indexOf(u.pick); if (pi >= 0) pickMeshes.splice(pi, 1);
  if (u.pathLine) u.pathLine.visible = false;
  u.ring.visible = false;
  if (u.garrison) { const o = u.garrison; o.garrison = null; if (o.flagMesh) { scene.remove(o.flagMesh); o.flagMesh = null; } u.garrison = null; }
  if (isInf(u)) { u.im.count = 0; scene.remove(u.im); scene.remove(u.root); return; }
  if (isAir(u)) { u.falling = { vy: -2, spin: rand(-2, 2) }; return; }
  const p = pos(u).clone(); p.y += 1.2;
  explodeFx(p, u.kind === 'gun' ? .7 : 1);
  u.mats.main.color.setHex(0x2d2a27); u.mats.trim.color.setHex(0x1d1b19); u.mats.main.emissive.setHex(0); u.mats.trim.emissive.setHex(0);
  u.turret.rotation.z = rand(-.35, .35); u.turret.position.y += .18; u.turretYaw += rand(-.8, .8); u.turret.rotation.y = u.turretYaw; u.barrel.rotation.x = .18;
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false }));
  sc.rotation.x = -Math.PI / 2; sc.position.set(p.x, surfaceY(p.x, p.z) + .09, p.z); sc.material.polygonOffset = true; sc.material.polygonOffsetFactor = -4; scene.add(sc);
  emitters.push({ u, age: 0, acc: 0, scorch: sc, life: 40 });
  if (u.kind === 'veh') wrecks.push({ type: 'circle', x: p.x, z: p.z, r: u.def.r * .9, h: 2.4, base: pos(u).y, unit: u });
  // keep the battlefield readable: old wrecks fade out
  const dead = units.filter((o) => !o.alive && !isInf(o) && !isAir(o));
  if (dead.length > 24) removeWreck(dead[0]);
}
function removeWreck(u) {
  scene.remove(u.root); if (u.pathLine) scene.remove(u.pathLine);
  const e = emitters.find((e) => e.u === u); if (e) { scene.remove(e.scorch); emitters.splice(emitters.indexOf(e), 1); }
  wrecks = wrecks.filter((w) => w.unit !== u);
  units.splice(units.indexOf(u), 1);
}
function explodeFx(p, s = 1) {
  for (let i = 0; i < 40 * s; i++) { const a = rand(0, 6.28), v = rand(2, 9); fx.spawn(p.x, p.y + rand(0, 1), p.z, Math.cos(a) * v, rand(2, 9), Math.sin(a) * v, rand(.35, .8) * s, rand(2, 3.5), rand(4, 6), 1, rand(.45, .75), .15, .95, 3, 2); }
  for (let i = 0; i < 30 * s; i++) fx.spawn(p.x, p.y, p.z, rand(-16, 16), rand(5, 18), rand(-16, 16), rand(.5, 1.1), .45, .1, 1, .8, .4, 1, .8, 22);
  for (let i = 0; i < 20 * s; i++) smoke.spawn(p.x + rand(-1, 1), p.y, p.z + rand(-1, 1), rand(-3, 3), rand(1, 5), rand(-3, 3), rand(2, 3.5), 3, rand(7, 10), .18, .17, .16, .7, 1.2, -.5);
  flashLight(p, 600 * s, 0xff9040); addShake(p, .9 * s);
}
const flakColor = [.12, .12, .12];
function tracer(a, b, col = [1, .85, .45]) {
  const n = Math.min(30, Math.ceil(a.distanceTo(b) / 1.2));
  for (let k = 0; k < n; k++) { const q = a.clone().lerp(b, (k + Math.random()) / n); fx.spawn(q.x, q.y, q.z, 0, 0, 0, .09, .5, .08, col[0], col[1], col[2], .9); }
}
function muzzleOf(u) { return u.kind === 'inf' ? eyeOf(u, u.fireTarget ? tgtPos(u.fireTarget) : pos(u)) : u.muzzle.getWorldPosition(new THREE.Vector3()); }
function fireAt(u, t) {
  const def = u.def, wpn = def.wpn;
  let rof = def.rof;
  if (u.deployed) rof *= .4;
  if (game.time < u.suppressedUntil) rof *= 2;
  if (isInf(u) && u.speed > .5) rof *= 1.6;
  u.reload = rof * rand(.9, 1.1);
  u.firedAt = game.time;
  let dmg = def.dmg * (isInf(u) ? menAlive(u) / def.men * .5 + .5 : 1);
  if (u.ambush) { dmg *= 2; u.ambush = false; u.cd = ABILITIES.ambush.cd; }
  if (u.team === 'blue') game.stats.shots++;
  const m0 = muzzleOf(u), m = new THREE.Vector3(m0.x, m0.y, m0.z);
  const tp = tgtPos(t), aimY = t.isBld ? tp.y + t.def.h * .45 : isAir(t) ? tp.y : tp.y + (isInf(t) ? .9 : 1.15);
  if (wpn === 'mg' || wpn === 'flak' || wpn === 'aamg') {
    const tpt = t.isBld ? eyeOf(t, m) : t.garrison ? eyeOf(t, m) : { x: tp.x, y: aimY, z: tp.z };
    let hit = Math.random() < (isInf(t) ? (concealed(t) >= 2 ? .5 : .72) : wpn === 'flak' ? .5 : .8);
    const end = new THREE.Vector3(tpt.x + rand(-1, 1) * (hit ? .6 : 3), tpt.y + rand(-.5, .5) * (hit ? 1 : 3), tpt.z + rand(-1, 1) * (hit ? .6 : 3));
    if (wpn === 'flak') {
      // flak: tracer + dark puff bursts around the plane
      tracer(m, end, [1, .7, .3]);
      for (let k = 0; k < 2; k++) { const q = end.clone().add(new THREE.Vector3(rand(-3, 3), rand(-2, 2), rand(-3, 3))); for (let i = 0; i < 6; i++) smoke.spawn(q.x, q.y, q.z, rand(-1.5, 1.5), rand(-1, 1.5), rand(-1.5, 1.5), rand(1.5, 2.4), .8, rand(2, 3), flakColor[0], flakColor[1], flakColor[2], .8, 1, 0); fx.spawn(q.x, q.y, q.z, 0, 0, 0, .1, 2.6, 1.2, 1, .7, .3, .9); }
    } else {
      for (let k = 0; k < 3; k++) tracer(m, end.clone().add(new THREE.Vector3(rand(-.4, .4), rand(-.3, .3), rand(-.4, .4))));
      fx.spawn(m.x, m.y, m.z, 0, 0, 0, .06, 1.6, 1.2, 1, .8, .4, 1);
      if (!hit && !isAir(t)) for (let i = 0; i < 3; i++) smoke.spawn(end.x, surfaceY(end.x, end.z) + .2, end.z, rand(-.6, .6), rand(.4, 1.2), rand(-.6, .6), .5, .5, 1, .6, .55, .45, .5, 1.5, 0);
    }
    if (hit) applyDamage(t, dmg, wpn, m, u);
    return;
  }
  if (wpn === 'he') {
    const d = dist2d(m, tp), T = 2.4 + d / 55;
    const spread = 2 + d * .045;
    const ax = tp.x + rand(-1, 1) * spread, az = tp.z + rand(-1, 1) * spread, ay = surfaceY(ax, az);
    const vel = new THREE.Vector3((ax - m.x) / T, (ay - m.y + .5 * CFG.gravity * T * T) / T, (az - m.z) / T);
    spawnShell(u, m, vel, { dmg, wpn, splash: def.splash, he: true, life: T + 1 });
    muzzleFx(m, vel, 1.6); u.recoil = 1; return;
  }
  // ballistic direct-fire shell (tank cannon, AT gun, bazooka, plane rockets)
  const d = dist2d(m, tp), speed = wpn === 'rocket' ? 60 : isInf(u) ? 48 : CFG.shellSpeed, flight = d / speed;
  const lat = (rand(-1, 1) + rand(-1, 1)) * (.6 + d * .05) * (concealed(t) ? 1.6 : 1) * (t.isBld ? .3 : 1);
  const px = -(tp.z - m.z) / (d || 1), pz = (tp.x - m.x) / (d || 1);
  const tv = t.vel || { x: 0, z: 0 };
  const aim = t.isBld ? eyeOf(t, m) : t.garrison ? eyeOf(t, m) : { x: tp.x + tv.x * flight * .9 + px * lat, y: aimY + rand(-.3, .3), z: tp.z + tv.z * flight * .9 + pz * lat };
  const hd = Math.hypot(aim.x - m.x, aim.z - m.z), tt = Math.max(.05, hd / speed);
  const g = wpn === 'rocket' ? 0 : CFG.gravity;
  const vel = new THREE.Vector3((aim.x - m.x) / tt, (aim.y - m.y) / tt + .5 * g * tt, (aim.z - m.z) / tt);
  spawnShell(u, m, vel, { dmg, wpn, target: t, g, small: isInf(u), splash: wpn === 'rocket' ? 3.5 : 0 });
  muzzleFx(m, vel, isInf(u) ? .5 : 1);
  if (!isInf(u) && !isAir(u)) { u.recoil = 1; u.pitch = -.07; }
}
function muzzleFx(m, vel, s) {
  const dir = vel.clone().normalize();
  for (let i = 0; i < 7 * s; i++) { const v = rand(4, 14); fx.spawn(m.x, m.y, m.z, dir.x * v + rand(-2, 2), dir.y * v + rand(-1, 2), dir.z * v + rand(-2, 2), rand(.08, .16) * s, rand(1.6, 2.6), .4, 1, rand(.6, .85), .3, 1, 6); }
  fx.spawn(m.x, m.y, m.z, 0, 0, 0, .07, 4.5 * s, 2, 1, .9, .6, 1);
  for (let i = 0; i < 6 * s; i++) { const v = rand(1, 5); smoke.spawn(m.x, m.y, m.z, dir.x * v + rand(-1, 1), rand(.3, 1.4), dir.z * v + rand(-1, 1), rand(.8, 1.6), 1, rand(2.5, 4), .78, .76, .72, .45, 1.5, -.4); }
  if (s >= 1) { flashLight(m, 120 * s); addShake(m, .08 * s); }
}
function spawnShell(owner, m, vel, o) {
  const mesh = new THREE.Mesh(o.he ? bombGeo : shellGeo, shellMat); mesh.position.copy(m); if (o.small) mesh.scale.setScalar(.7); scene.add(mesh);
  shells.push({ mesh, pos: m.clone(), vel, owner, team: owner.team, life: o.life || 2.5, dist: 0, g: o.g ?? CFG.gravity, ...o });
}
function inBldBox(b, x, y, z, pad = 0) { return b.alive && Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad && y < surfaceY(b.x, b.z) + b.def.h * (b.built ? 1 : Math.max(.3, b.progress)) + pad; }
function splashDamage(p, r, dmg, wpn, owner, team) {
  for (const t of units) { if (!t.alive || t.team === team || isAir(t)) continue; const d = dist2d(pos(t), p); if (d < r) applyDamage(t, dmg * (1 - d / r * .6), wpn, p, owner); }
  for (const b of buildings) { if (!b.alive || b.team === team) continue; const dx = Math.max(Math.abs(p.x - b.x) - b.hx, 0), dz = Math.max(Math.abs(p.z - b.z) - b.hz, 0), d = Math.hypot(dx, dz); if (d < r) applyDamage(b, dmg * (1 - d / r * .5), wpn, p, owner); }
}
function updateShells(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i]; const a = s.pos.clone();
    s.vel.y -= s.g * dt; s.pos.addScaledVector(s.vel, dt); s.life -= dt;
    const b = s.pos;
    let bestT = 2, hit = null;
    if (!s.he) {
      for (const t of units) {
        if (!t.alive || t.team === s.team || isAir(t)) continue;
        const p = t.garrison ? null : pos(t); if (!p) continue;
        if (Math.abs(p.x - b.x) > 12 || Math.abs(p.z - b.z) > 12) continue;
        const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz || 1e-6;
        const u = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / L, 0, 1);
        const cx = a.x + dx * u, cz = a.z + dz * u, y = a.y + (b.y - a.y) * u;
        if (Math.hypot(cx - p.x, cz - p.z) < t.def.r + .2 && y < p.y + 2.5 && y > p.y - .6 && u < bestT) { bestT = u; hit = t; }
      }
      for (const bl of buildings) if (bl.team !== s.team && inBldBox(bl, b.x, b.y, b.z, .3) && .99 < bestT) { bestT = .99; hit = bl; }
      if (s.target?.garrison && s.target.alive) { const o = s.target.garrison; if (Math.abs(b.x - o.x) < o.hx + .8 && Math.abs(b.z - o.z) < o.hz + .8) { bestT = .5; hit = s.target; } }
      if (!hit) {
        const ownB = buildings.find((bl) => bl.team === s.team && inBldBox(bl, b.x, b.y, b.z));
        const to = segmentHitT(a.x, a.z, b.x, b.z, 0, wrecks, a.y, b.y);
        if (to >= 0 && to < bestT && !ownB) { bestT = to; hit = 'obs'; }
      }
    }
    const segL = Math.hypot(b.x - a.x, b.z - a.z); s.dist += segL;
    const gy = Math.max(surfaceY(b.x, b.z), waterClass(b.x, b.z) ? WATER_Y : -99);
    if (b.y <= gy) { const ga = Math.max(surfaceY(a.x, a.z), waterClass(a.x, a.z) ? WATER_Y : -99); const tg = (a.y - ga) / Math.max(1e-6, (a.y - ga) - (b.y - gy)); if (tg < bestT) { bestT = clamp(tg, 0, 1); hit = waterClass(b.x, b.z) === 1 || waterClass(b.x, b.z) === 2 ? 'water' : 'ground'; } }
    if (!hit && !s.he && s.dist > 6 && inForest(b.x, b.z) && b.y < heightAt(b.x, b.z) + 6 && Math.random() < .03 * segL) { bestT = .5; hit = 'tree'; }
    s.mesh.position.copy(b); s.mesh.lookAt(tmpV.copy(b).add(s.vel));
    fx.spawn(b.x, b.y, b.z, 0, 0, 0, .05, 1.6, 1.2, 1, .85, .5, 1);
    if (!s.he) { const nTrail = Math.min(24, Math.ceil(a.distanceTo(b) / .35)); for (let k = 0; k < nTrail; k++) { const q = a.clone().lerp(b, k / nTrail); fx.spawn(q.x, q.y, q.z, 0, 0, 0, .16, .75, .12, 1, .7, .3, .55); } }
    if (s.small || s.wpn === 'rocket' || s.he) smoke.spawn(b.x, b.y, b.z, rand(-.3, .3), rand(0, .4), rand(-.3, .3), .7, .5, 1.6, .85, .83, .8, .35);
    if (hit || s.life <= 0) {
      const p = a.clone().lerp(b, Math.min(bestT, 1));
      if (s.splash) { bigBoom(p, s.he ? 1 : .6); splashDamage(p, s.splash, s.dmg, s.wpn, s.owner, s.team); }
      else if (hit && typeof hit === 'object') { hitFx(p); applyDamage(hit, s.dmg, s.wpn, s.owner.alive ? pos(s.owner) : p, s.owner); }
      else if (hit === 'water') splash(p);
      else if (hit === 'tree') splinters(p);
      else if (hit) impact(p, hit === 'ground');
      scene.remove(s.mesh); shells.splice(i, 1);
    }
  }
}
function hitFx(p) {
  for (let i = 0; i < 18; i++) fx.spawn(p.x, p.y, p.z, rand(-9, 9), rand(2, 10), rand(-9, 9), rand(.2, .45), rand(.25, .5), .05, 1, rand(.7, .95), .4, 1, 2, 20);
  for (let i = 0; i < 6; i++) fx.spawn(p.x, p.y, p.z, rand(-2, 2), rand(0, 2), rand(-2, 2), rand(.15, .3), rand(1.5, 2.6), 3.5, 1, .55, .15, .9, 3);
  for (let i = 0; i < 5; i++) smoke.spawn(p.x, p.y, p.z, rand(-1.5, 1.5), rand(.5, 2), rand(-1.5, 1.5), rand(1, 1.8), 1.5, 4, .25, .23, .22, .55, 1, -.6);
  flashLight(p, 160); addShake(p, .35);
}
function bigBoom(p, s) {
  if (waterClass(p.x, p.z) === 1 && p.y < 0) { splash(p); return; }
  for (let i = 0; i < 30 * s; i++) fx.spawn(p.x, p.y + .5, p.z, rand(-8, 8), rand(3, 12), rand(-8, 8), rand(.4, .9), rand(.6, 1.2), rand(.4, .8), 1, rand(.5, .8), .2, 1, 2, 12);
  for (let i = 0; i < 18 * s; i++) smoke.spawn(p.x + rand(-1.5, 1.5), p.y + .5, p.z + rand(-1.5, 1.5), rand(-3, 3), rand(2, 7), rand(-3, 3), rand(2, 3.5), 1.5, rand(4, 6), .45, .4, .32, .65, 1.4, -.1);
  flashLight(p, 400 * s); addShake(p, .6 * s);
}
function splash(p) {
  p.y = WATER_Y + .1;
  for (let i = 0; i < 26; i++) smoke.spawn(p.x, p.y, p.z, rand(-2, 2), rand(4, 11), rand(-2, 2), rand(.6, 1.2), .8, rand(1.5, 2.6), .9, .95, 1, .8, .5, 14);
  for (let i = 0; i < 8; i++) smoke.spawn(p.x, p.y, p.z, rand(-3, 3), rand(0, 1), rand(-3, 3), rand(.8, 1.4), 1.5, 4, .85, .9, .95, .5, 2, 0);
  addShake(p, .08);
}
function splinters(p) {
  for (let i = 0; i < 14; i++) smoke.spawn(p.x, p.y, p.z, rand(-6, 6), rand(1, 7), rand(-6, 6), rand(.4, .8), .35, .2, .45, .32, .18, .9, 1.5, 16);
  for (let i = 0; i < 6; i++) smoke.spawn(p.x, p.y, p.z, rand(-1.5, 1.5), rand(.5, 2), rand(-1.5, 1.5), rand(1, 1.6), 1, 3.5, .55, .52, .45, .5, 1.5, -.3);
  fx.spawn(p.x, p.y, p.z, 0, 0, 0, .1, 2.4, 1, 1, .7, .3, .8);
}
function impact(p, ground) {
  for (let i = 0; i < 12; i++) fx.spawn(p.x, p.y, p.z, rand(-7, 7), rand(1, 8), rand(-7, 7), rand(.15, .35), rand(.25, .45), .05, 1, .8, .45, 1, 2, 18);
  fx.spawn(p.x, p.y, p.z, 0, 0, 0, .12, 3.2, 1, 1, .7, .3, .9);
  const c = ground ? [.62, .55, .4] : [.6, .58, .55];
  for (let i = 0; i < 9; i++) smoke.spawn(p.x, p.y, p.z, rand(-2.5, 2.5), rand(.5, 3.5), rand(-2.5, 2.5), rand(.8, 1.6), 1, rand(3, 5), c[0], c[1], c[2], .6, 1.5, 1);
  flashLight(p, 70); addShake(p, .15);
}
// bombs from bombers: fall with the plane's velocity, explode on the ground
function updateBombs(dt) {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i]; b.vel.y -= CFG.gravity * 1.4 * dt; b.vel.x *= .99; b.vel.z *= .99; b.mesh.position.addScaledVector(b.vel, dt);
    b.mesh.lookAt(tmpV.copy(b.mesh.position).add(b.vel));
    const p = b.mesh.position;
    if (p.y <= surfaceY(p.x, p.z)) { scene.remove(b.mesh); bombs.splice(i, 1); bigBoom(p.clone(), 1.3); splashDamage(p, b.splash, b.dmg, 'bomb', b.owner, b.team); }
  }
}
// mines: hidden from the enemy, blow up enemy ground vehicles (and hurt infantry) that roll over them
const mineGeo = new THREE.CylinderGeometry(.55, .65, .22, 10);
function layMine(u) {
  const p = pos(u), m = new THREE.Mesh(mineGeo, new THREE.MeshStandardMaterial({ color: 0x4a4d40, roughness: .8 }));
  m.position.set(p.x, surfaceY(p.x, p.z) + .1, p.z); scene.add(m);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: .7, depthWrite: false, toneMapped: false })); ring.position.y = .05; m.add(ring);
  mines.push({ team: u.team, x: p.x, z: p.z, mesh: m, armT: 1.5, owner: u });
}
function updateMines(dt) {
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i]; m.armT -= dt; m.mesh.visible = m.team === 'blue' || game.state === 'over';
    if (m.armT > 0) continue;
    const t = units.find((u) => u.alive && u.team !== m.team && !isAir(u) && !u.garrison && Math.hypot(pos(u).x - m.x, pos(u).z - m.z) < (isInf(u) ? 1.6 : u.def.r + .6));
    if (!t) continue;
    const p = new THREE.Vector3(m.x, surfaceY(m.x, m.z) + .3, m.z);
    bigBoom(p, .9); applyDamage(t, 95, 'mine', p, m.owner); splashDamage(p, 3, 20, 'mine', m.owner, m.team);
    scene.remove(m.mesh); mines.splice(i, 1);
  }
}

// =====================================================================================
// unit update
// =====================================================================================
function wet(x, z, r = 1.8) {
  if (waterClass(x, z) === 1) return true;
  for (let a = 0; a < 6.28; a += 1.05) if (waterClass(x + Math.cos(a) * r, z + Math.sin(a) * r) === 1) return true;
  return false;
}
function speedOf(u) {
  const p = pos(u);
  let s = u.def.speed * (u.dmg === 2 && !isInf(u) ? .8 : 1);
  if (isInf(u)) { const w = waterClass(p.x, p.z); s *= w === 2 ? .6 : 1; if (game.time < u.sprintUntil) s *= 1.8; if (game.time < u.suppressedUntil) s *= .5; }
  else s *= terrainSpeed(p.x, p.z);
  if (u.ai) s *= .95;
  return s;
}
function updateUnit(u, dt) {
  if (isAir(u)) return updatePlane(u, dt);
  const p = pos(u);
  u.vel.set((p.x - u.prev.x) / dt, 0, (p.z - u.prev.z) / dt); u.prev.copy(p);
  if (!u.alive) return;
  if (u.cd > 0) u.cd -= dt;
  if (u.garrison) { u.speed = 0; return combatTick(u, dt); }
  const o = u.order;
  // attack: chase until in range with LOS
  if (o?.type === 'attack') {
    const tg = o.target;
    if (!tg.alive || (!tg.vis[u.team] && !tg.isBld)) { u.order = null; stop(u); }
    else {
      u.repath -= dt;
      if (u.repath <= 0) {
        u.repath = 1.1 + Math.random() * .4;
        const d = distTo(u, tg), tp = tgtPos(tg);
        if (d > rangeOf(u, tg) * .9 || (!u.def.indirect && !hasLOS(u, tg))) { if (!u.goal || Math.hypot(u.goal.x - tp.x, u.goal.z - tp.z) > 5 || !u.path.length) setPath(u, tp.x, tp.z); }
        else stop(u);
      }
    }
  }
  // attack-move (AI waves): stop to fight anything in range, then continue
  if (o?.type === 'amove') {
    u.repath -= dt;
    if (u.repath <= 0) {
      u.repath = 1 + Math.random() * .5;
      if (u.fireTarget && u.kind !== 'veh') stop(u);
      else if (!u.path.length && Math.hypot(p.x - o.x, p.z - o.z) > 8) setPath(u, o.x, o.z);
    }
  }
  if (o?.type === 'garrison') { const h = o.house; if (h.garrison && h.garrison !== u) { u.order = null; } else if (Math.abs(p.x - h.x) < h.hx + 4.5 && Math.abs(p.z - h.z) < h.hz + 4.5) enterGarrison(u, h); }
  if (u.satchel) satchelTick(u, dt);
  // engineers: repair damaged friendly vehicles/buildings nearby while idle
  if (u.def.repair && !u.path.length && Math.random() < dt * 2) {
    const t = [...units, ...buildings].find((e) => e.alive && e.team === u.team && e !== u && !isInf(e) && !isAir(e) && e.hp < e.maxHp && (e.isBld ? distTo(u, e) < 6 : dist2d(pos(e), p) < 10));
    if (t) { t.hp = Math.min(t.maxHp, t.hp + u.def.repair * .5 * menAlive(u) / u.def.men * 2); if (t.isBld) updateBldDamageState(t); else updateDamageState(t); u.repairing = t; const q = tgtPos(t); for (let i = 0; i < 3; i++) fx.spawn(q.x + rand(-1.5, 1.5), q.y + rand(1, 2.5), q.z + rand(-1.5, 1.5), rand(-2, 2), rand(1, 3), rand(-2, 2), rand(.15, .3), .3, .1, .6, .9, 1, 1, 2, 10); }
    else u.repairing = null;
  }
  // follow path
  const turn = isInf(u) ? 8 : u.def.turn;
  if (u.path.length && !u.deployed) {
    const wp = u.path[0], dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz), last = u.path.length === 1;
    if (d < (last ? 1.0 : 2.2)) { u.path.shift(); if (!u.path.length && (u.order?.type === 'move')) u.order = null; }
    else {
      const err = wrap(Math.atan2(dx, dz) - u.yaw);
      u.yaw = wrap(u.yaw + clamp(err, -turn * dt, turn * dt));
      const align = isInf(u) ? 1 : Math.max(0, Math.cos(err));
      let want = Math.abs(err) > 1.1 && !isInf(u) ? .6 : speedOf(u) * align * align;
      if (last) want = Math.min(want, 1.5 + d * 1.6);
      u.speed += (want - u.speed) * Math.min(1, dt * (isInf(u) ? 8 : 4));
    }
    u.stuck.t += dt;
    if (u.stuck.t > 1.5) {
      const moved = Math.hypot(p.x - u.stuck.x, p.z - u.stuck.z); u.stuck.t = 0; u.stuck.x = p.x; u.stuck.z = p.z;
      if (moved < 1.2 && u.goal && !u.straight) { if (++u.stuck.n > 3) { stop(u); if (u.order?.type === 'move') u.order = null; } else u.path = nav.findPath(p.x, p.z, u.goal.x, u.goal.z); }
    }
  } else u.speed += (0 - u.speed) * Math.min(1, dt * 6);
  const mx = Math.sin(u.yaw) * u.speed * dt, mz = Math.cos(u.yaw) * u.speed * dt, wr = Math.min(1.8, u.def.r * .9);
  if (!wet(p.x + mx, p.z + mz, wr)) { p.x += mx; p.z += mz; }
  else if (!wet(p.x + mx, p.z, wr)) p.x += mx;
  else if (!wet(p.x, p.z + mz, wr)) p.z += mz;
  else u.speed *= .5;
  if (u.speed > .4) { u.deployT = 0; if (u.ambush) { u.ambush = false; } }
  else u.deployT += dt;
  if (u.def.ability === 'deploy' && u.wantDeploy && u.speed < .3 && !u.path.length) { u.deployed = true; u.wantDeploy = false; }
  settleOnGround(u, dt);
  combatTick(u, dt);
  // juice
  if (!isInf(u)) {
    u.recoil = Math.max(0, u.recoil - dt * 4); u.barrel.position.z = (u.barrelZ0 ??= u.barrel.position.z) - u.recoil * .5;
    u.flash = Math.max(0, u.flash - dt); const e = u.flash > 0 ? .9 : 0; u.mats.main.emissive.setScalar(e); u.mats.trim.emissive.setScalar(e);
    if (u.speed > 2 && u.root.visible) {
      u.dustT -= dt;
      if (u.dustT <= 0) { u.dustT = .1; const bx = p.x - Math.sin(u.yaw) * 2.2, bz = p.z - Math.cos(u.yaw) * 2.2; smoke.spawn(bx, p.y + .3, bz, rand(-.5, .5), rand(.3, 1), rand(-.5, .5), rand(.8, 1.3), .8, 2.6, .72, .64, .48, .3, 1.5, -.2); }
    }
  }
}
function combatTick(u, dt) {
  u.reload -= dt;
  u.tgtT -= dt;
  if (u.tgtT <= 0) { u.tgtT = .35 + Math.random() * .15; u.fireTarget = u.def.wpn ? chooseFireTarget(u) : null; }
  if (u.fireTarget && !u.fireTarget.alive) u.fireTarget = null;
  const t = u.fireTarget;
  const p = pos(u);
  if (isInf(u)) {
    if (t && u.speed < .5) { const tp = tgtPos(t); const err = wrap(Math.atan2(tp.x - p.x, tp.z - p.z) - u.yaw); u.yaw = wrap(u.yaw + clamp(err, -8 * dt, 8 * dt)); }
    if (t && u.reload <= 0 && game.state === 'playing' && menAlive(u) > 0) fireAt(u, t);
    return;
  }
  const isGun = u.kind === 'gun';
  let want = 0;
  if (t) { const tp = tgtPos(t); want = wrap(Math.atan2(tp.x - p.x, tp.z - p.z) - u.yaw); }
  else if (u.order?.type === 'attack') { const tp = tgtPos(u.order.target); want = wrap(Math.atan2(tp.x - p.x, tp.z - p.z) - u.yaw); }
  if (isGun && !u.def.antiAir) {
    // towed guns: limited traverse; the whole carriage swings toward the target when stopped
    want = clamp(want, -.45, .45);
    if (t && u.speed < .3 && !u.path.length) { const tp = tgtPos(t); const err = wrap(Math.atan2(tp.x - p.x, tp.z - p.z) - u.yaw); if (Math.abs(err) > .35) u.yaw = wrap(u.yaw + clamp(err, -u.def.turn * dt, u.def.turn * dt)); }
  }
  const terr = wrap(want - u.turretYaw);
  const tt = isGun ? 1.6 : 2.4;
  u.turretYaw = wrap(u.turretYaw + clamp(terr, -tt * dt, tt * dt));
  u.turret.rotation.y = u.turretYaw;
  if (u.def.antiAir && t) { const tp = tgtPos(t); u.barrel.rotation.x = -clamp(Math.atan2(tp.y - p.y, dist2d(tp, p)), .2, 1.3); }
  const ready = !u.def.deploy || u.deployT >= u.def.deploy;
  if (t && Math.abs(terr) < (isGun ? .12 : .06) && u.reload <= 0 && ready && game.state === 'playing') fireAt(u, t);
}
function settleOnGround(u, dt) {
  const p = pos(u), sy = Math.sin(u.yaw), cy = Math.cos(u.yaw);
  if (isInf(u)) { p.y = surfaceY(p.x, p.z); u.root.rotation.set(0, u.yaw, 0); return; }
  const L = u.def.r, hf = surfaceY(p.x + sy * L, p.z + cy * L), hb = surfaceY(p.x - sy * L, p.z - cy * L);
  const hr = surfaceY(p.x + cy * L * .75, p.z - sy * L * .75), hl = surfaceY(p.x - cy * L * .75, p.z + sy * L * .75);
  const targetY = Math.max(surfaceY(p.x, p.z), (hf + hb + hr + hl) / 4);
  p.y += (targetY - p.y) * Math.min(1, dt * 12);
  const pitch = -Math.atan2(hf - hb, L * 2), roll = Math.atan2(hr - hl, L * 1.5);
  u.tiltP = (u.tiltP || 0) + (pitch - (u.tiltP || 0)) * Math.min(1, dt * 8);
  u.tiltR = (u.tiltR || 0) + (roll - (u.tiltR || 0)) * Math.min(1, dt * 8);
  u.root.rotation.set(u.tiltP, u.yaw, u.tiltR, 'YXZ');
}
function separate() {
  const live = units.filter((u) => u.alive && !isAir(u) && !u.garrison);
  for (let i = 0; i < live.length; i++) {
    const a = pos(live[i]), ra = live[i].def.r;
    for (let j = i + 1; j < live.length; j++) {
      const b = pos(live[j]); const dx = b.x - a.x, dz = b.z - a.z; if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      const d = Math.hypot(dx, dz) || 1e-3, min = (ra + live[j].def.r) * (isInf(live[i]) && isInf(live[j]) ? .7 : 1.02);
      if (d < min) { const k = (min - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
    }
  }
  for (const u of live) {
    const p = pos(u), R = u.def.r;
    for (const w of wrecks) { const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz) || 1e-3, min = R + w.r; if (d < min) { p.x = w.x + dx / d * min; p.z = w.z + dz / d * min; } }
    [p.x, p.z] = pushOut(p.x, p.z, isInf(u) ? 1.2 : R);
    p.x = clamp(p.x, -HALF + 2.2, HALF - 2.2); p.z = clamp(p.z, -HALF + 2.2, HALF - 2.2);
    if (wet(p.x, p.z, Math.min(1.8, R * .9))) { if (u.safe) { p.x = u.safe.x; p.z = u.safe.z; } } else (u.safe ||= new THREE.Vector3()).copy(p);
  }
}

// ---------- infantry squads: individual soldiers follow formation slots, drop one by one ----------
const _im = new THREE.Matrix4(), _iq = new THREE.Quaternion(), _iy = new THREE.Vector3(0, 1, 0), _is = new THREE.Vector3(1, 1, 1), _ip = new THREE.Vector3();
function updateSquadVisual(u, dt, now) {
  if (!u.alive || !u.im.visible) return;
  const p = pos(u), sy = Math.sin(u.yaw), cy = Math.cos(u.yaw), moving = u.speed > .5;
  const n = menAlive(u);
  const deployed = u.deployed, k = Math.min(1, dt * (moving ? 5 : 3));
  for (let i = 0; i < n; i++) {
    const s = u.soldiers[i];
    let ox = s.ox, oz = s.oz;
    if (deployed) { ox *= .6; oz *= .5; }
    const tx = p.x + ox * cy + oz * sy, tz = p.z - ox * sy + oz * cy;
    s.x += (tx - s.x) * k; s.z += (tz - s.z) * k;
    const gy = surfaceY(s.x, s.z);
    s.ph += dt * (moving ? 11 : 0);
    s.y = gy + (moving ? Math.abs(Math.sin(s.ph)) * .18 : 0);
    let face = u.yaw;
    if (u.fireTarget && !moving) { const tp = tgtPos(u.fireTarget); face = Math.atan2(tp.x - s.x, tp.z - s.z); }
    s.yaw += wrap(face - s.yaw) * Math.min(1, dt * 8);
    const crouch = (deployed || u.ambush || (!moving && u.fireTarget)) ? .78 : 1;
    _iq.setFromAxisAngle(_iy, s.yaw); _is.set(1, crouch, 1);
    _im.compose(_ip.set(s.x, s.y, s.z), _iq, _is); u.im.setMatrixAt(i, _im);
  }
  u.im.count = n; u.im.instanceMatrix.needsUpdate = true;
  // muzzle flicker for firing soldiers
  if (u.fireTarget && game.time - u.firedAt < .08) for (let i = 0; i < Math.min(n, 3); i++) { const s = u.soldiers[(i * 3 + (now * 10 | 0)) % n]; fx.spawn(s.x + Math.sin(s.yaw) * .9, s.y + 1.2, s.z + Math.cos(s.yaw) * .9, 0, 0, 0, .05, 1.2, 1, 1, .8, .4, 1); }
}

// ---------- abilities ----------
function useAbility(list, ab) {
  let used = 0;
  for (const u of list) {
    if (!u.alive || u.def.ability !== ab) continue;
    if (ab === 'deploy') { if (u.deployed) { u.deployed = false; used++; continue; } if (u.cd > 0) continue; stop(u); if (u.order?.type === 'move') u.order = null; u.wantDeploy = true; u.cd = ABILITIES.deploy.cd; used++; continue; }
    if (ab === 'ambush' && u.ambush) { u.ambush = false; used++; continue; }
    if (u.cd > 0) continue;
    if (ab === 'sprint') { u.sprintUntil = game.time + ABILITIES.sprint.dur; }
    else if (ab === 'ambush') { stop(u); if (u.order?.type === 'move') u.order = null; u.ambush = true; }
    else if (ab === 'binoculars') { reveals.push({ team: u.team, x: pos(u).x, z: pos(u).z, r: 120, until: game.time + ABILITIES.binoculars.dur, unit: u }); flashReveal(u); }
    else if (ab === 'mine') { if (u.garrison) continue; layMine(u); }
    else if (ab === 'satchel') {
      const t = nearestSatchelTarget(u); if (!t) { if (u.team === 'blue') toast('No tank or building in reach'); continue; }
      u.satchel = { target: t }; u.order = { type: 'move' }; u.sprintUntil = Math.max(u.sprintUntil, game.time + 5); if (u.garrison) leaveGarrison(u, tgtPos(t)); setPath(u, tgtPos(t).x, tgtPos(t).z);
    }
    if (ab !== 'satchel') u.cd = ABILITIES[ab].cd;
    used++;
  }
  return used;
}
function nearestSatchelTarget(u) {
  let best = null, bd = 45;
  for (const t of [...units, ...buildings]) {
    if (!t.alive || t.team === u.team || isAir(t) || isInf(t) || !t.vis[u.team]) continue;
    const d = distTo(u, t); if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function satchelTick(u, dt) {
  const s = u.satchel, t = s.target;
  if (!t.alive) { u.satchel = null; return; }
  if (s.fuse !== undefined) { s.fuse -= dt; if (s.fuse <= 0) { const p = t.isBld ? new THREE.Vector3(...Object.values(eyeOf(t, pos(u)))) : pos(t).clone().setY(pos(t).y + 1); bigBoom(p, 1.2); applyDamage(t, 170, 'satchel', pos(u), u); u.satchel = null; } return; }
  if (distTo(u, t) < (t.isBld ? 5 : 6)) {
    stop(u); u.order = null; s.fuse = 1.2; u.cd = ABILITIES.satchel.cd;
    const a = muzzleOf(u), q = tgtPos(t); tracer(new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(q.x, q.y + 1, q.z), [.9, .8, .5]);
  } else if (!u.path.length) setPath(u, tgtPos(t).x, tgtPos(t).z);
}
function flashReveal(u) {
  const p = pos(u);
  const m = new THREE.Mesh(new THREE.RingGeometry(118, 120, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbfffd0, transparent: true, opacity: .5, depthWrite: false, toneMapped: false }));
  m.position.set(p.x, 1.5, p.z); scene.add(m); markers.push({ m, t: 0, ring: true, dur: ABILITIES.binoculars.dur });
}

// =====================================================================================
// aircraft: fly out, loiter / attack, return to the airfield and rearm
// =====================================================================================
function homeOf(u) { if (u.home?.alive) return u.home; u.home = aliveBlds(u.team).find((b) => b.type === 'airfield' && b.built) || hqOf(u.team); return u.home; }
function airOrder(u, tgt) {
  if (u.airState === 'rearm' || u.falling) return;
  u.airTarget = tgt.isBld || tgt.def ? tgt : null;
  const tp = u.airTarget ? tgtPos(tgt) : tgt; u.airPoint = { x: tp.x, z: tp.z };
  u.airState = 'out'; u.loiterT = 0; u.runT = 0;
  if (u.team === 'blue') addMarker(u.airPoint.x, u.airPoint.z, u.airTarget ? 0xff5050 : 0xc58cff, true);
}
function steerPlane(u, tx, tz, dt, turnRate = 1.3) {
  const p = pos(u), want = Math.atan2(tx - p.x, tz - p.z), err = wrap(want - u.yaw);
  const turn = clamp(err, -turnRate * dt, turnRate * dt); u.yaw = wrap(u.yaw + turn);
  u.bank += (clamp(-err * 1.2, -.7, .7) - u.bank) * Math.min(1, dt * 3);
  return Math.abs(err);
}
function orbit(u, cx, cz, r, dt) { // aim at a point ahead on the circle
  const p = pos(u), a = Math.atan2(p.x - cx, p.z - cz) + .55;
  return steerPlane(u, cx + Math.sin(a) * r, cz + Math.cos(a) * r, dt);
}
function updatePlane(u, dt) {
  const p = pos(u), def = u.def;
  u.prev.copy(p);
  if (u.falling) {
    u.falling.vy -= 9 * dt; p.y += u.falling.vy * dt; u.yaw += u.falling.spin * dt; u.bank += dt * 2;
    p.x += Math.sin(u.yaw) * def.speed * .6 * dt; p.z += Math.cos(u.yaw) * def.speed * .6 * dt;
    smoke.spawn(p.x, p.y, p.z, rand(-.5, .5), rand(0, 1), rand(-.5, .5), rand(1.5, 2.5), 1, rand(3, 5), .15, .14, .13, .7, .5, -.2);
    fx.spawn(p.x, p.y, p.z, 0, 1, 0, rand(.4, .8), 1.2, .3, 1, .55, .15, .9, 1);
    if (p.y <= surfaceY(p.x, p.z) + .5) { explodeFx(p.clone(), .8); scene.remove(u.root); scene.remove(u.ring); scene.remove(u.shadow); u.falling = null; u.gone = true; }
    u.root.rotation.set(0, u.yaw, 0); u.body.rotation.z = u.bank; u.body.rotation.x = .5;
    return;
  }
  if (!u.alive) return;
  u.reload -= dt;
  let speed = def.speed, altWant = def.alt;
  const home = homeOf(u);
  if (u.airTarget && !u.airTarget.alive) u.airTarget = null;
  if (u.airTarget) { const q = tgtPos(u.airTarget); u.airPoint = { x: q.x, z: q.z }; }
  const tp = u.airPoint;
  switch (u.airState) {
    case 'idle': case 'rearm': {
      if (home) orbit(u, home.x, home.z, 26, dt);
      altWant = u.airState === 'rearm' ? 20 : def.alt;
      if (u.airState === 'rearm') { u.rearmT -= dt; if (u.rearmT <= 0) { u.airState = 'idle'; u.ammo = def.ammo || 0; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .5); updateDamageState(u); } }
      break;
    }
    case 'out': {
      const d = dist2d(p, tp);
      if (def.wpn === 'rocket' || def.wpn === 'bomb') { attackRun(u, dt); break; }
      steerPlane(u, tp.x, tp.z, dt);
      if (d < 30) { u.airState = 'loiter'; u.loiterT = def.loiter || 30; }
      break;
    }
    case 'loiter': {
      u.loiterT -= dt;
      // fighters chase enemy aircraft that come near the patrol point
      let enemy = null;
      if (def.wpn === 'aamg') { let bd = 70; for (const e of units) if (e.alive && isAir(e) && e.team !== u.team && e.vis[u.team]) { const d = Math.min(dist2d(pos(e), tp), dist2d(pos(e), p)); if (d < bd) { bd = d; enemy = e; } } }
      if (enemy) {
        const ep = pos(enemy), err = steerPlane(u, ep.x, ep.z, dt, 1.8); altWant = ep.y;
        if (dist2d(ep, p) < def.rng && err < .5 && u.reload <= 0) { u.fireTarget = enemy; fireAt(u, enemy); }
      } else orbit(u, tp.x, tp.z, 24, dt);
      if (u.loiterT <= 0) goHome(u);
      break;
    }
    case 'return': {
      if (!home) { u.airState = 'idle'; break; }
      steerPlane(u, home.x, home.z, dt);
      if (dist2d(p, home) < 30) { u.airState = 'rearm'; u.rearmT = 8; }
      break;
    }
  }
  if (u.climb) { altWant = Math.min(altWant, p.y + 6); if (p.y > def.alt - 2) u.climb = false; speed *= .8; }
  if (u.diving) altWant = 13;
  p.y += (altWant - p.y) * Math.min(1, dt * (u.diving ? 2 : .8));
  p.x += Math.sin(u.yaw) * speed * dt; p.z += Math.cos(u.yaw) * speed * dt;
  p.x = clamp(p.x, -HALF - 30, HALF + 30); p.z = clamp(p.z, -HALF - 30, HALF + 30);
  u.vel.set(Math.sin(u.yaw) * speed, 0, Math.cos(u.yaw) * speed);
  u.root.rotation.set(0, u.yaw, 0); u.body.rotation.z = u.bank; u.body.rotation.x = u.diving ? .25 : 0;
  u.prop.rotation.z += dt * 40;
  const gy = surfaceY(p.x, p.z);
  u.ring.position.set(p.x, gy + .15, p.z); u.shadow.position.set(p.x - 3, gy + .12, p.z + 2);
  u.flash = Math.max(0, u.flash - dt); const e = u.flash > 0 ? .9 : 0; u.mats.main.emissive.setScalar(e);
  if (u.dmg && u.root.visible) { u.dmgT -= dt; if (u.dmgT <= 0) { u.dmgT = u.dmg === 2 ? .05 : .1; smoke.spawn(p.x - Math.sin(u.yaw) * 2, p.y, p.z - Math.cos(u.yaw) * 2, 0, .3, 0, u.dmg === 2 ? 1.6 : 1.1, .8, 3, u.dmg === 2 ? .15 : .8, u.dmg === 2 ? .14 : .8, u.dmg === 2 ? .13 : .78, .6, .3, 0); if (u.dmg === 2) fx.spawn(p.x, p.y, p.z, 0, 0, 0, .5, .6, .2, 1, .55, .15, .9); } }
}
function goHome(u) { u.airState = 'return'; u.diving = false; u.airTarget = null; }
// fighter-bombers dive and fire rockets at a ground target; bombers fly straight over and drop a stick of bombs
function attackRun(u, dt) {
  const p = pos(u), def = u.def;
  let tgt = u.airTarget;
  if (!tgt || !tgt.alive) { // pick a target near the ordered point (fighter-bombers prefer vehicles)
    let best = null, bs = 1e9;
    for (const t of [...units, ...buildings]) {
      if (!t.alive || t.team === u.team || isAir(t) || !t.vis[u.team]) continue;
      const d = dist2d(tgtPos(t), u.airPoint); if (d > 35) continue;
      const s = d - (def.wpn === 'rocket' ? (t.def.armor === 'armor' ? 25 : t.kind === 'veh' || t.kind === 'gun' ? 15 : 0) : (t.isBld ? 25 : 0)); if (s < bs) { bs = s; best = t; }
    }
    tgt = best; u.airTarget = best;
  }
  const tp = tgt ? tgtPos(tgt) : u.airPoint;
  const d = dist2d(p, tp);
  if (u.runT > 0) { u.runT -= dt; steerPlane(u, p.x + Math.sin(u.yaw) * 50, p.z + Math.cos(u.yaw) * 50, dt, .5); if (u.runT <= 0 && u.ammo <= 0) goHome(u); return; }
  const err = steerPlane(u, tp.x, tp.z, dt, 1.1);
  if (!tgt && d < 12 && def.wpn === 'rocket') { goHome(u); return; }
  if (def.wpn === 'rocket') {
    u.diving = d < 70 && err < .5;
    if (d < 38 && d > 14 && err < .18 && u.ammo > 0 && u.reload <= 0 && tgt) {
      u.reload = 1.2; u.ammo--;
      for (const s of [-1, 1]) { const m = p.clone().add(new THREE.Vector3(Math.cos(u.yaw) * s * 2.2, -.5, -Math.sin(u.yaw) * s * 2.2)); const aim = tgt.isBld ? eyeOf(tgt, m) : { x: tp.x, y: tp.y + 1, z: tp.z }; const v = new THREE.Vector3(aim.x - m.x, aim.y - m.y, aim.z - m.z).normalize().multiplyScalar(70); spawnShell(u, m, v, { dmg: def.dmg / 2, wpn: 'rocket', target: tgt, g: 0, splash: 4, life: 2 }); }
      u.runT = 2.6; u.diving = false;
    }
  } else if (def.wpn === 'bomb') {
    // lead the drop: bombs carry the plane's forward speed
    const lead = def.speed * Math.sqrt(2 * p.y / (CFG.gravity * 1.4));
    if (d < lead + 4 && err < .3 && u.ammo > 0) {
      u.ammo--; u.runT = 3.5;
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(bombGeo, SHARED.dark); m.position.copy(p).add(new THREE.Vector3(Math.sin(u.yaw) * (i - 3) * 2.2, -1, Math.cos(u.yaw) * (i - 3) * 2.2)); scene.add(m); bombs.push({ mesh: m, vel: new THREE.Vector3(Math.sin(u.yaw) * def.speed, -1, Math.cos(u.yaw) * def.speed), dmg: def.dmg, splash: def.splash, owner: u, team: u.team }); }
    }
  }
}

// =====================================================================================
// spotting (fog of war): a team only sees what its units / buildings / planes / binoculars see
// =====================================================================================
function observersOf(team) {
  const list = [];
  for (const u of units) if (u.alive && u.team === team) list.push(u);
  for (const b of buildings) if (b.alive && b.team === team) list.push(b);
  return list;
}
function seesTarget(o, t) {
  const op = o.isBld ? { x: o.x, z: o.z } : pos(o), tp = tgtPos(t);
  const d = t.isBld ? Math.hypot(Math.max(Math.abs(op.x - t.x) - t.hx, 0), Math.max(Math.abs(op.z - t.z) - t.hz, 0)) : dist2d(op, tp);
  const conceal = concealed(t);
  if (isAir(t)) return d < (o.isBld ? VISION_BLD : o.def.vis) * 1.1 + 10;
  if (!o.isBld && isAir(o)) return d < o.def.vis && conceal < 3;
  if (d < (conceal >= 3 ? 7 : 12)) return true;
  let V = o.isBld ? VISION_BLD : o.def.vis;
  if (conceal === 3) V = Math.min(V, 7); else if (conceal === 2) V = Math.min(V, 26); else if (conceal === 1) V = Math.min(V, 30);
  if (d > V) return false;
  if (t.isBld) return true;
  return hasLOS(o, t);
}
function updateSpotting(dt) {
  game.spotT = (game.spotT || 0) - dt; if (game.spotT > 0) return; game.spotT = .25;
  for (const team of ['blue', 'red']) {
    const obs = observersOf(team), foe = enemyOf(team);
    const rv = reveals.filter((r) => r.team === team && r.until > game.time && r.unit?.alive !== false);
    for (const t of [...units, ...buildings]) {
      if (t.team !== foe) continue;
      if (!t.alive) { t.vis[team] = !isInf(t); continue; }
      if (game.state !== 'playing') { t.vis[team] = true; continue; }
      let seen = false;
      const tp = tgtPos(t);
      for (const r of rv) if (Math.hypot(tp.x - r.x, tp.z - r.z) < r.r) { seen = true; break; }
      if (!seen) for (const o of obs) {
        const op = o.isBld ? o : pos(o);
        const reach = (o.isBld ? VISION_BLD : o.def.vis) + 20;
        if (Math.abs(op.x - tp.x) > reach || Math.abs(op.z - tp.z) > reach) continue;
        if (seesTarget(o, t)) { seen = true; break; }
      }
      if (seen) { t.seen[team] = game.time + 1.5; if (t.isBld) t.everSeen[team] = true; }
      t.vis[team] = t.type === 'hq' || (t.isBld && t.everSeen[team]) || game.time < t.seen[team];
    }
  }
  for (const u of units) {
    const show = u.team === 'blue' || u.vis.blue;
    if (isInf(u)) { u.im.visible = show && !u.garrison && u.alive; u.root.visible = show; }
    else { u.root.visible = show && !u.gone; if (isAir(u)) { u.shadow.visible = show && !u.gone && u.alive; } }
  }
  for (const b of buildings) b.root.visible = b.team === 'blue' || b.vis.blue;
}

// ---------- vehicle damage effects (R.U.S.E.-style: smoke / fire on the model, no bars) ----------
function damageFx(u, dt) {
  if (!u.alive || !u.dmg || !u.root.visible || isInf(u) || isAir(u)) return;
  const p = pos(u), sy = Math.sin(u.yaw), cy = Math.cos(u.yaw);
  const ex = p.x - sy * 1.6, ez = p.z - cy * 1.6;
  u.dmgT -= dt;
  if (u.dmgT <= 0) {
    if (u.dmg === 1) { u.dmgT = .1; smoke.spawn(ex + rand(-.4, .4), p.y + 1.6, ez + rand(-.4, .4), rand(-.2, .2) + .3, rand(1.4, 2.2), rand(-.2, .2), rand(1.8, 2.6), .8, rand(3, 4.2), .86, .86, .84, .5, .4, -.2); }
    else {
      u.dmgT = .06; smoke.spawn(ex + rand(-.5, .5), p.y + 1.7, ez + rand(-.5, .5), rand(-.3, .3) + .4, rand(1.8, 3), rand(-.3, .3), rand(2.2, 3.2), 1, rand(4, 6), .14, .13, .12, .6, .3, -.25);
      for (let i = 0; i < 2; i++) fx.spawn(ex + rand(-.6, .6), p.y + 1.7, ez + rand(-.6, .6), rand(-.2, .2), rand(1.2, 2.6), rand(-.2, .2), rand(.3, .55), rand(1.1, 1.7), .25, 1, rand(.45, .65), .12, .95, 1, -1.5);
    }
  }
  if (u.dmg === 2) { u.sparkT -= dt; if (u.sparkT <= 0) { u.sparkT = rand(.5, 1.4); for (let i = 0; i < 6; i++) fx.spawn(ex, p.y + 1.6, ez, rand(-3, 3), rand(2, 5), rand(-3, 3), rand(.25, .5), .3, .05, 1, .85, .45, 1, 1.5, 16); } }
}
function updateEmitters(dt) {
  for (let i = emitters.length - 1; i >= 0; i--) {
    const e = emitters[i];
    e.age += dt; e.acc -= dt;
    if (e.acc > 0) continue;
    const late = e.age > 10;
    e.acc = late ? .2 : .06;
    if (e.age > e.life) { if (e.b) { emitters.splice(i, 1); } continue; }
    if (e.b) {
      const b = e.b, x = b.x + rand(-b.hx, b.hx) * .7, z = b.z + rand(-b.hz, b.hz) * .7, y = surfaceY(b.x, b.z) + 1.5;
      if (!b.root.visible) continue;
      smoke.spawn(x, y, z, rand(-.4, .4) + .6, rand(2, 3.2), rand(-.4, .4), rand(3.5, 5), 1.4, rand(6, 9), .16, .15, .14, late ? .4 : .65, .3, -.25);
      if (!late || Math.random() < .3) fx.spawn(x, y, z, rand(-.3, .3), rand(1.5, 3), rand(-.3, .3), rand(.6, 1.1), rand(1, 1.8), .3, 1, rand(.4, .6), .1, .9, 1, -1);
      continue;
    }
    const p = pos(e.u);
    if (!e.u.root.visible) continue;
    smoke.spawn(p.x + rand(-.6, .6), p.y + 2, p.z + rand(-.6, .6), rand(-.4, .4) + .6, rand(2, 3.2), rand(-.4, .4), rand(2.8, 4.2), 1.4, rand(5, 8), .16, .15, .14, late ? .4 : .6, .3, -.25);
    if (!late || Math.random() < .3) fx.spawn(p.x + rand(-.7, .7), p.y + 1.8, p.z + rand(-.7, .7), rand(-.3, .3), rand(1.5, 3), rand(-.3, .3), rand(.3, .6), rand(1, 1.8), .3, 1, rand(.4, .6), .1, .9, 1, -1);
  }
}

// ---------- economy ----------
function incomeOf(team) {
  const hq = hqOf(team);
  let r = hq?.alive ? HQ_INCOME : 0;
  for (const b of buildings) if (b.alive && b.built && b.team === team && b.type === 'depot') r += DEPOT_INCOME;
  if (team === 'red' && game.difficulty === 'easy') r *= .7;
  return r;
}
function updateEconomy(dt) { for (const t of ['blue', 'red']) { teams[t].rate = incomeOf(t); teams[t].money += teams[t].rate * dt; } }

function checkEnd() {
  if (game.state !== 'playing') return;
  const bh = hqOf('blue'), rh = hqOf('red');
  const blueDead = !bh?.alive || !aliveBlds('blue').length, redDead = !rh?.alive || !aliveBlds('red').length;
  if (!blueDead && !redDead) return;
  game.state = 'ending'; game.result = blueDead && redDead ? 'draw' : redDead ? 'win' : 'lose'; game.endAt = game.time + 2.5;
  const loser = redDead ? 'red' : 'blue';
  shells = shells.filter((s) => { if (s.team === loser) { scene.remove(s.mesh); return false; } return true; });
}

// =====================================================================================
// enemy commander AI: economy, base building, production mix, defense, growing attack waves, air
// =====================================================================================
let aiState = null;
function makeAI(diff) {
  const easy = diff === 'easy';
  const T = 'red', FOE = 'blue';
  const A = {
    t: 0, period: easy ? 2.4 : 1.4, wave: 0, waveTarget: easy ? 4 : 5, nextWave: easy ? 260 : 170, waveGap: easy ? 150 : 105,
    army: new Set(), attackers: new Set(), lastAlarm: -99, alarmAt: null,
    newUnit(u) { u.ai = { role: 'home', idle: 0 }; this.army.add(u); },
    attacked(t, attacker) { if (attacker?.alive !== false && attacker && !isAir(attacker)) { const p = tgtPos(attacker); this.alarmAt = { x: p.x, z: p.z, t: game.time }; } },
  };
  const hq = () => hqOf(T);
  const count = (pred) => units.filter((u) => u.alive && u.team === T && pred(u)).length + buildings.filter((b) => b.alive && b.team === T).reduce((n, b) => n + b.queue.filter((q) => pred({ type: q, def: UNITS[q], kind: UNITS[q].kind })).length, 0);
  const have = (type) => buildings.filter((b) => b.alive && b.team === T && b.type === type).length;
  const foeCount = (pred) => units.filter((u) => u.alive && u.team === FOE && u.vis[T] && pred(u)).length;
  const money = () => teams[T].money;
  function findSite(type) {
    const h = hq(); if (!h) return null;
    const anchors = aliveBlds(T).filter((b) => b.built || b.type === 'hq');
    for (let k = 0; k < 160; k++) {
      const a = anchors[(Math.random() * anchors.length) | 0];
      const ang = rand(0, 6.28), r = rand(16, BUILD_RADIUS - 4);
      let x = a.x + Math.sin(ang) * r, z = a.z + Math.cos(ang) * r;
      if (z > h.z + 30) continue;            // keep the base behind the HQ (away from the river)
      const c = canPlace(type, T, x, z);
      if (c.ok) return c;
    }
    return null;
  }
  function build(type) {
    if (type === 'depot') {
      const sp = spots.filter((s) => !s.bld).map((s) => ({ s, c: canPlace('depot', T, s.x, s.z) })).filter((o) => o.c.ok).sort((a, b) => Math.abs(a.s.z - hq().z) - Math.abs(b.s.z - hq().z))[0];
      if (sp) return placeBuilding('depot', T, sp.s.x, sp.s.z);
      return null;
    }
    const c = findSite(type); if (c) return placeBuilding(type, T, c.x, c.z);
    return null;
  }
  function planBuild() {
    const depots = have('depot'), m = money(), tm = game.time;
    const want = [];
    if (depots < 3) want.push('depot');
    if (!have('barracks')) want.push('barracks');
    if (depots >= 1 && !have('factory')) want.push('factory');
    if (tm > 60 && !have('recon')) want.push('recon');
    if (tm > 120 && !have('atdepot') && (foeCount((u) => u.def.armor === 'armor') > 0 || tm > 220)) want.push('atdepot');
    if (tm > 150 && !have('artillery')) want.push('artillery');
    if (tm > (easy ? 420 : 260) && !have('airfield')) want.push('airfield');
    if (spots.some((s) => !s.bld && canPlace('depot', T, s.x, s.z, true).ok)) want.push('depot');
    if (tm > 360 && m > 1400 && have('barracks') < 2) want.push('barracks');
    if (tm > 420 && m > 1600 && have('factory') < 2) want.push('factory');
    A.saving = 0;
    for (const w of want) { if (m >= BUILDINGS[w].cost) { if (build(w)) return; } else if (w === want[0]) { A.saving = BUILDINGS[w].cost; return; } }  // save up for the first priority
  }
  function pickUnit(b) {
    const tm = game.time, foeArmor = foeCount((u) => u.def.armor === 'armor'), foeInf = foeCount((u) => isInf(u)), foeAir = foeCount((u) => isAir(u));
    const w = {};
    if (b.type === 'barracks') Object.assign(w, { rifle: 3 + foeInf * .2, bazooka: 1.5 + foeArmor * .8, mgteam: 1 + foeInf * .2, engineer: count((u) => u.type === 'engineer') < 2 ? .6 : 0, scout: count((u) => u.type === 'scout') < 1 ? .6 : 0, commando: tm > 360 ? .6 : 0 });
    if (b.type === 'factory') Object.assign(w, { light: 1.6, medium: 3, heavy: tm > 330 ? 1.2 + foeArmor * .2 : 0 });
    if (b.type === 'recon') Object.assign(w, { jeep: count((u) => u.type === 'jeep') < 2 ? 1 : 0 });
    if (b.type === 'atdepot') Object.assign(w, { atgun: count((u) => u.type === 'atgun') < 2 + foeArmor / 2 ? 1 : 0 });
    if (b.type === 'artillery') Object.assign(w, { howitzer: count((u) => u.type === 'howitzer') < (easy ? 1 : 2) ? 1 : 0, aagun: count((u) => u.type === 'aagun') < Math.min(3, foeAir + (tm > 400 ? 1 : 0)) ? 2 : 0 });
    if (b.type === 'airfield') { const planes = count((u) => isAir(u)); if (planes < (easy ? 2 : 4)) Object.assign(w, { fbomber: 2, fighter: foeAir ? 2.5 : .5, bomber: tm > 480 ? 1 : 0, reconplane: count((u) => u.type === 'reconplane') < 1 ? .6 : 0 }); }
    const tot = Object.values(w).reduce((a, b) => a + b, 0); if (tot <= 0) return null;
    let r = Math.random() * tot; for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return null;
  }
  const PRIO = { factory: 0, airfield: 1, artillery: 2, atdepot: 3, recon: 4, barracks: 5 };
  function produce() {
    const reserve = A.saving || 0;
    const prod = aliveBlds(T).filter((b) => b.built && b.def.units.length).sort((a, b) => PRIO[a.type] - PRIO[b.type]);
    const heavyIdle = prod.some((b) => (b.type === 'factory' || b.type === 'airfield') && !b.queue.length);
    for (const b of prod) {
      if (b.queue.length >= 2) continue;
      const k = pickUnit(b); if (!k) continue;
      // cheap infantry must not starve the factory / airfield: leave room for a tank or plane
      const extra = b.type === 'barracks' && heavyIdle ? 420 : 0;
      if (money() - UNITS[k].cost >= reserve + extra) queueUnit(b, k);
    }
  }
  function foeTargets() { return aliveBlds(FOE).filter((b) => b.everSeen[T] || b.type === 'hq' || b.spot); }
  function nearestFoeBld(from) { let best = null, bd = 1e9; for (const b of foeTargets()) { const d = Math.hypot(b.x - from.x, b.z - from.z) + (b.type === 'hq' ? 40 : 0); if (d < bd) { bd = d; best = b; } } return best; }
  function commandArmy() {
    const h = hq(); if (!h) return;
    const home = { x: h.x + 6, z: h.z + 30 };
    const ground = [...A.army].filter((u) => u.alive && !isAir(u));
    for (const u of [...A.army]) if (!u.alive) A.army.delete(u);
    // defense: threats near any of our buildings
    let threat = null;
    for (const e of units) { if (!e.alive || e.team !== FOE || isAir(e) || !e.vis[T]) continue; for (const b of aliveBlds(T)) if (Math.hypot(pos(e).x - b.x, pos(e).z - b.z) < 50) { threat = e; break; } if (threat) break; }
    if (!threat && A.alarmAt && game.time - A.alarmAt.t < 6) { const near = aliveBlds(T).some((b) => Math.hypot(A.alarmAt.x - b.x, A.alarmAt.z - b.z) < 60); if (near) threat = { pt: A.alarmAt }; }
    const homeUnits = ground.filter((u) => u.ai.role === 'home');
    if (threat) {
      const tp = threat.pt || pos(threat);
      const defenders = homeUnits.filter((u) => u.type !== 'aagun');
      for (const u of defenders) if (!u.order || u.order.type !== 'amove' || Math.hypot(u.order.x - tp.x, u.order.z - tp.z) > 15) orderMove([u], tp.x + rand(-6, 6), tp.z + rand(-6, 6), 'amove');
    } else {
      for (const u of homeUnits) if (!u.path.length && !u.fireTarget && Math.hypot(pos(u).x - home.x, pos(u).z - home.z) > 26 && u.type !== 'howitzer' && u.type !== 'aagun') orderMove([u], home.x + rand(-14, 14), home.z + rand(-8, 8));
    }
    // waves
    const ready = homeUnits.filter((u) => u.type !== 'aagun' && u.type !== 'howitzer');
    if (game.time >= A.nextWave && (ready.length >= A.waveTarget || game.time > A.nextWave + 80) && ready.length >= 2) {
      const tgt = pickWaveTarget();
      if (tgt) {
        for (const u of ready) { u.ai.role = 'wave'; u.ai.idle = 0; }
        const g = ready; orderMove(g, tgt.x, tgt.z + (tgt.isBld ? -tgt.hz - 6 : 0), 'amove');
        A.wave++; A.waveTarget += easy ? 1 : 2; A.nextWave = game.time + A.waveGap; A.waveObj = tgt;
        // an AA gun escorts later waves when the player has air
        const aa = homeUnits.find((u) => u.type === 'aagun'); if (aa && foeCount(isAir)) { aa.ai.role = 'wave'; orderMove([aa], tgt.x, tgt.z, 'amove'); }
      }
    }
    // wave units: keep pushing; retarget when the objective falls; never stall
    for (const u of ground.filter((u) => u.ai.role === 'wave')) {
      const busy = u.fireTarget || u.path.length;
      u.ai.idle = busy ? 0 : u.ai.idle + A.period;
      if (u.ai.idle > 5) {
        const nb = nearestFoeBld(pos(u));
        if (nb) { orderMove([u], nb.x + rand(-5, 5), nb.z + (nb.hz + 6) * (pos(u).z < nb.z ? -1 : 1), 'amove'); u.ai.idle = 0; }
      }
      // contest supply spots the wave passes by
      if (money() >= 250) for (const s of spots) if (!s.bld && dist2d(pos(u), s) < 24 && canPlace('depot', T, s.x, s.z).ok) { placeBuilding('depot', T, s.x, s.z); break; }
    }
    // engineers stay home and repair; scouts lead waves
    // aircraft
    for (const u of [...A.army].filter((u) => u.alive && isAir(u) && u.airState === 'idle')) {
      if (u.def.wpn === 'rocket') { const t = units.find((e) => e.alive && e.team === FOE && e.vis[T] && e.def.armor === 'armor') || units.find((e) => e.alive && e.team === FOE && e.vis[T] && !isAir(e)); if (t) airOrder(u, t); else if (game.time > A.nextWave - A.waveGap + 20) { const b = nearestFoeBld(pos(u)); if (b) airOrder(u, b); } }
      else if (u.def.wpn === 'bomb') { const bs = foeTargets().filter((b) => b.type !== 'hq'); const b = bs.find((b) => b.def.units.length) || bs[0] || hqOf(FOE); if (b) airOrder(u, b); }
      else if (u.def.wpn === 'aamg') { const e = units.find((e) => e.alive && e.team === FOE && isAir(e) && e.vis[T]); airOrder(u, e ? e : { x: h.x, z: h.z + 40, isBld: false, def: null, root: { position: new THREE.Vector3(h.x, 0, h.z + 40) } }); }
      else { const b = hqOf(FOE); if (b) airOrder(u, { root: { position: new THREE.Vector3(b.x + rand(-40, 40), 0, b.z - 30) } }); }
    }
  }
  function pickWaveTarget() {
    // contested supply depots first, then whatever is nearest to our HQ, the HQ last
    const h = hq(); const list = foeTargets();
    const depots = list.filter((b) => b.type === 'depot').sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z));
    if (depots.length && A.wave % 2 === 0) return depots[0];
    return nearestFoeBld({ x: h.x, z: h.z }) || hqOf(FOE);
  }
  A.tick = (dt) => {
    A.t -= dt; if (A.t > 0) return; A.t = A.period;
    if (!hq()?.alive) return;
    planBuild(); produce(); commandArmy();
  };
  return A;
}

// =====================================================================================
// minimap
// =====================================================================================
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
  mmT -= dt; if (mmT > 0) return; mmT = .1;
  const g = mmCtx; g.drawImage(mmBg, 0, 0, MM, MM);
  for (const s of spots) { if (s.bld) continue; const [x, y] = w2m(s.x, s.z); g.strokeStyle = '#ffd65a'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.stroke(); }
  for (const b of buildings) {
    if (b.team === 'red' && !b.vis.blue) continue;
    const [x, y] = w2m(b.x, b.z), w = Math.max(4, b.hx / HALF * MM), h = Math.max(4, b.hz / HALF * MM);
    g.fillStyle = !b.alive ? '#333' : b.team === 'blue' ? '#4aa3ff' : '#ff4a3a'; g.strokeStyle = b === selBld ? '#fff' : '#111'; g.lineWidth = 1;
    g.fillRect(x - w / 2, y - h / 2, w, h); g.strokeRect(x - w / 2, y - h / 2, w, h);
    if (b.type === 'hq' && b.alive) { g.fillStyle = '#fff'; g.font = 'bold 8px system-ui'; g.textAlign = 'center'; g.fillText('HQ', x, y + 3); }
  }
  for (const u of units) {
    if (!u.alive || (u.team === 'red' && !u.vis.blue)) continue;
    const [x, y] = w2m(pos(u).x, pos(u).z);
    g.fillStyle = u.team === 'blue' ? '#7cc4ff' : '#ff6a5a'; g.strokeStyle = selUnits.has(u) ? '#fff' : '#111'; g.lineWidth = selUnits.has(u) ? 1.6 : .8;
    g.beginPath();
    if (isAir(u)) { const a = u.yaw; g.moveTo(x + Math.sin(a) * 5, y + Math.cos(a) * 5); g.lineTo(x + Math.sin(a + 2.5) * 4, y + Math.cos(a + 2.5) * 4); g.lineTo(x + Math.sin(a - 2.5) * 4, y + Math.cos(a - 2.5) * 4); g.closePath(); }
    else if (isInf(u)) g.rect(x - 2, y - 2, 4, 4);
    else g.arc(x, y, 3, 0, 7);
    g.fill(); g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.2; g.beginPath();
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([sx, sy], i) => { const c = viewCorner(sx, sy); const [x, y] = w2m(clamp(c.x, -HALF * 1.5, HALF * 1.5), clamp(c.z, -HALF * 1.5, HALF * 1.5)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath(); g.stroke();
}
let mmDrag = false;
function mmJump(e) {
  const r = mmCanvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * HALF * 2 - HALF, z = ((e.clientY - r.top) / r.height) * HALF * 2 - HALF;
  cam.shift.set(x - controls.target.x, 0, z - controls.target.z); mmT = 0;
}
mmCanvas.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  if (e.button === 2 && (selUnits.size || selBld)) { // right-click on minimap: order there
    const r = mmCanvas.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * HALF * 2 - HALF, z = ((e.clientY - r.top) / r.height) * HALF * 2 - HALF;
    if (selUnits.size) orderMove([...selUnits], x, z); else setRally(selBld, x, z);
    return;
  }
  mmDrag = true; mmCanvas.setPointerCapture(e.pointerId); mmJump(e);
});
mmCanvas.addEventListener('pointermove', (e) => { if (mmDrag) mmJump(e); });
mmCanvas.addEventListener('pointerup', () => { mmDrag = false; });
mmCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// =====================================================================================
// selection, placement & input
// =====================================================================================
function toScreen(v) { tmpP.copy(v).project(camera); return { x: (tmpP.x + 1) / 2 * innerWidth, y: (1 - tmpP.y) / 2 * innerHeight, z: tmpP.z }; }
function selectUnits(list, additive = false) { if (!additive) selUnits.clear(); selBld = null; for (const u of list) if (u.alive && u.team === 'blue') selUnits.add(u); hudDirty = true; }
function selectBuilding(b) { selUnits.clear(); selBld = b; hudDirty = true; }
function clearSelection() { selUnits.clear(); selBld = null; hudDirty = true; }
function pickEntity(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickMeshes, false);
  for (const h of hits) { const e = h.object.userData.ent; if (e?.alive && e.root.visible && (!isInf(e) || e.im.visible)) return e; }
  let best = null, bd = 26;
  for (const u of units) { if (!u.alive || !u.root.visible || (isInf(u) && !u.im.visible)) continue; const s = toScreen(tmpV.copy(pos(u)).setY(pos(u).y + 1.2)); const d = Math.hypot(s.x - cx, s.y - cy); if (d < bd) { bd = d; best = u; } }
  return best;
}
function pickHouse(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); raycaster.setFromCamera(ndc, camera);
  const h = raycaster.intersectObjects(housePicks, false)[0]; return h ? h.object.userData.house : null;
}
function setRally(b, x, z) { if (!b || b.team !== 'blue') return; b.rally = { x: clamp(x, -HALF + 4, HALF - 4), z: clamp(z, -HALF + 4, HALF - 4) }; addMarker(x, z, 0x59f0ff, true); }

// --- placement ghost ---
let placing = null;
const ghostMats = { ok: new THREE.MeshBasicMaterial({ color: 0x4dff88, transparent: true, opacity: .45, depthWrite: false }), bad: new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: .45, depthWrite: false }) };
const ghostCache = {};
const radiusRings = new THREE.Group(); scene.add(radiusRings);
function ghostFor(type) {
  if (ghostCache[type]) return ghostCache[type];
  const m = buildBuilding(type, 'blue'), g = m.root;
  const fp = new THREE.Mesh(new THREE.BoxGeometry(BUILDINGS[type].hx * 2, .3, BUILDINGS[type].hz * 2), ghostMats.ok); fp.position.y = .2; g.add(fp);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  g.rotation.y = Math.PI; g.visible = false; scene.add(g);
  return (ghostCache[type] = g);
}
function startPlacing(type) {
  cancelPlacing();
  if (teams.blue.money < BUILDINGS[type].cost) { toast('Not enough money'); return; }
  placing = { type, ghost: ghostFor(type), ok: false };
  clearSelection();
  radiusRings.clear();
  if (type !== 'depot') for (const b of aliveBlds('blue')) if (b.built || b.type === 'hq') {
    const ring = new THREE.Mesh(new THREE.RingGeometry(BUILD_RADIUS - .5, BUILD_RADIUS, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fffd0, transparent: true, opacity: .35, depthWrite: false, toneMapped: false }));
    ring.position.set(b.x, Math.max(1, surfaceY(b.x, b.z) + .5), b.z); radiusRings.add(ring);
  }
  hudDirty = true;
}
function cancelPlacing() { if (placing) { placing.ghost.visible = false; placing = null; radiusRings.clear(); hudDirty = true; } }
function updateGhost(cx, cy) {
  if (!placing) return;
  const g = groundAt(cx, cy); if (!g) return;
  const c = canPlace(placing.type, 'blue', g.x, g.z);
  placing.ok = c.ok; placing.reason = c.reason; placing.x = c.x; placing.z = c.z;
  const gh = placing.ghost; gh.visible = true; gh.position.set(c.x, surfaceY(c.x, c.z) + .05, c.z);
  const mat = c.ok ? ghostMats.ok : ghostMats.bad; gh.traverse((o) => { if (o.isMesh) o.material = mat; });
}
function tryPlace(shift) {
  if (!placing) return;
  if (!placing.ok) { toast(placing.reason || 'Cannot build here'); return; }
  const type = placing.type;
  const b = placeBuilding(type, 'blue', placing.x, placing.z);
  if (!b) { toast('Cannot build here'); return; }
  if (!shift || teams.blue.money < BUILDINGS[type].cost) cancelPlacing();
}

let lastClick = { t: 0, ent: null };
function handleClick(cx, cy, shift, right) {
  if (game.state !== 'playing' && game.state !== 'ending') return;
  if (placing) { if (right) cancelPlacing(); else tryPlace(shift); return; }
  const e = pickEntity(cx, cy);
  const now = performance.now();
  if (!right && e && e.team === 'blue') {
    if (e.isBld) { selectBuilding(e); return; }
    if (now - lastClick.t < 380 && lastClick.ent && lastClick.ent.type === e.type) { // double-click: all of this type on screen
      selectUnits(aliveUnits('blue').filter((u) => u.type === e.type && onScreen(pos(u))), shift);
    } else if (shift) { if (selUnits.has(e)) selUnits.delete(e); else selUnits.add(e); selBld = null; hudDirty = true; }
    else selectUnits([e]);
    lastClick = { t: now, ent: e };
    return;
  }
  if (selBld && !selUnits.size) {
    if (right) { const g = groundAt(cx, cy); if (g) setRally(selBld, g.x, g.z); return; }
    clearSelection(); return;
  }
  if (!selUnits.size) { if (!right) clearSelection(); return; }
  if (e && e.team === 'red') { orderAttack([...selUnits], e); return; }
  const house = pickHouse(cx, cy);
  if (house && [...selUnits].some(isInf)) { orderGarrison([...selUnits], house); return; }
  const g = groundAt(cx, cy); if (g) orderMove([...selUnits], clamp(g.x, -HALF + 3, HALF - 3), clamp(g.z, -HALF + 3, HALF - 3));
}
function onScreen(p) { const s = toScreen(tmpV.copy(p)); return s.z < 1 && s.x > 0 && s.x < innerWidth && s.y > 0 && s.y < innerHeight; }
const drag = { on: false, active: false, x: 0, y: 0, btn: 0 };
const selbox = $('#selbox');
let hovered = null;
canvas.addEventListener('pointerdown', (e) => { drag.btn = e.button; drag.x = e.clientX; drag.y = e.clientY; drag.on = true; drag.active = false; });
window.addEventListener('pointermove', (e) => {
  if (placing && e.target === canvas) updateGhost(e.clientX, e.clientY);
  if (drag.on && drag.btn === 0 && !placing) {
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.active = true;
    if (drag.active) { const x = Math.min(e.clientX, drag.x), y = Math.min(e.clientY, drag.y); Object.assign(selbox.style, { display: 'block', left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - drag.x) + 'px', height: Math.abs(e.clientY - drag.y) + 'px' }); }
  } else if (!drag.on && e.target === canvas && !placing) {
    const t = pickEntity(e.clientX, e.clientY); hovered = t;
    const house = !t && selUnits.size && [...selUnits].some(isInf) ? pickHouse(e.clientX, e.clientY) : null;
    canvas.style.cursor = t ? (t.team === 'blue' ? 'pointer' : (selUnits.size ? 'crosshair' : 'default')) : house ? 'alias' : (selUnits.size ? 'cell' : 'default');
  }
});
window.addEventListener('pointerup', (e) => {
  if (!drag.on) return; drag.on = false;
  const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
  if (drag.btn === 0 && drag.active) {
    selbox.style.display = 'none';
    const x0 = Math.min(e.clientX, drag.x), x1 = Math.max(e.clientX, drag.x), y0 = Math.min(e.clientY, drag.y), y1 = Math.max(e.clientY, drag.y);
    const inBox = aliveUnits('blue').filter((u) => { if (u.garrison) { const o = u.garrison; const s = toScreen(tmpV.set(o.x, o.h, o.z)); return s.z < 1 && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; } const s = toScreen(tmpV.copy(pos(u)).setY(pos(u).y + 1)); return s.z < 1 && s.x >= x0 - 10 && s.x <= x1 + 10 && s.y >= y0 - 10 && s.y <= y1 + 10; });
    if (inBox.length) selectUnits(inBox, e.shiftKey);
  } else if (drag.btn === 0 && e.target === canvas) handleClick(e.clientX, e.clientY, e.shiftKey, false);
  else if (drag.btn === 2 && moved < 5) handleClick(e.clientX, e.clientY, e.shiftKey, true);
  drag.active = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const groups = {};
let lastGroupKey = { k: null, t: 0 };
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  if (game.state === 'menu') return;
  keys.add(e.code);
  const dm = /^Digit([1-5])$/.exec(e.code);
  if (dm) {
    const k = dm[1];
    if (e.ctrlKey || e.metaKey) { groups[k] = [...selUnits]; toast(`Group ${k}: ${groups[k].length} unit${groups[k].length === 1 ? '' : 's'}`); e.preventDefault(); }
    else if (groups[k]) {
      const live = groups[k].filter((u) => u.alive); selectUnits(live, e.shiftKey);
      if (lastGroupKey.k === k && performance.now() - lastGroupKey.t < 400) focusSelection();
      lastGroupKey = { k, t: performance.now() };
    }
    return;
  }
  if (e.code === 'Escape') { if (placing) cancelPlacing(); else clearSelection(); }
  for (const [ab, A] of Object.entries(ABILITIES)) if (e.code === A.key && selUnits.size) useAbility([...selUnits], ab);
  if (e.code === 'KeyX') for (const u of selUnits) { if (!isAir(u)) { u.order = null; stop(u); u.satchel = null; } }
  if (e.code === 'KeyH') { const h = hqOf('blue'); if (h) cam.shift.set(h.x - controls.target.x, 0, h.z - 18 - controls.target.z); }
  if (e.code === 'Space') { e.preventDefault(); focusSelection(); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
  if (e.ctrlKey && e.code === 'KeyA') { selectUnits(aliveUnits('blue')); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
function focusSelection() {
  const list = selUnits.size ? [...selUnits] : selBld ? [selBld] : [hqOf('blue')].filter(Boolean); if (!list.length) return;
  const c = list.reduce((a, t) => a.add(new THREE.Vector3(tgtPos(t).x, 0, tgtPos(t).z)), new THREE.Vector3()).multiplyScalar(1 / list.length);
  cam.shift.set(c.x - controls.target.x, 0, c.z - controls.target.z);
}

// =====================================================================================
// HUD: top bar, build bar (4 branches), selection / production panel, tooltips, toasts
// =====================================================================================
let hudDirty = true, hudT = 0, activeTab = 'inf';
const fmt$ = (n) => '$' + Math.floor(n).toLocaleString('en-US');
const BRANCH_BLDS = { inf: ['barracks', 'recon'], armor: ['factory'], art: ['atdepot', 'artillery'], air: ['airfield'] };
const tipEl = $('#tip');
function showTip(el, html) {
  tipEl.innerHTML = html; tipEl.classList.add('on');
  const r = el.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
  tipEl.style.left = clamp(r.left + r.width / 2 - tr.width / 2, 6, innerWidth - tr.width - 6) + 'px';
  tipEl.style.top = (r.top - tr.height - 8) + 'px';
}
function hideTip() { tipEl.classList.remove('on'); }
canvas.addEventListener('pointerenter', hideTip);
document.addEventListener('pointerover', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el, el.dataset.tip); });
document.addEventListener('pointerout', (e) => { const el = e.target.closest?.('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); toastT = 2.2; }
const esc = (h) => h.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const tipFor = (name, cost, desc, extra = '') => `<b>${name}</b>${cost ? ` <span class="cost">${fmt$(cost)}</span>` : ''}<br><span class="desc">${desc || ''}</span>${extra}`;

function buildBar() {
  const bb = $('#buildbar');
  const tabs = Object.entries(BRANCHES).map(([k, B]) => `<button class="tab ${k === activeTab ? 'on' : ''}" data-tab="${k}" style="--c:${B.color}" data-tip="<b>${B.name}</b>">${svg('tab_' + k)}<span>${B.name}</span></button>`).join('');
  const bl = (t) => { const d = BUILDINGS[t]; const uses = d.units.map((u) => UNITS[u].name).join(', '); return `<button class="bbtn" data-build="${t}" data-tip="${esc(tipFor(d.name, d.cost, d.desc, uses ? `<br><span class='uses'>${uses}</span>` : ''))}">${svg(t)}<span class="price">${fmt$(d.cost)}</span></button>`; };
  bb.innerHTML = `<div class="row eco">${bl('depot')}</div><div class="sep"></div><div class="col"><div class="row blds" style="--c:${BRANCHES[activeTab].color}">${BRANCH_BLDS[activeTab].map(bl).join('')}</div><div class="row tabs">${tabs}</div></div>`;
  bb.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => { activeTab = el.dataset.tab; buildBar(); }));
  bb.querySelectorAll('[data-build]').forEach((el) => el.addEventListener('click', () => { hideTip(); startPlacing(el.dataset.build); }));
}
function selSignature() { return selBld ? 'b' + selBld.id + (selBld.built ? 1 : 0) : 'u' + [...selUnits].map((u) => u.id).join(','); }
let lastSig = '';
function renderSelPanel() {
  hideTip();  // the hovered button may be replaced; never leave a stale tooltip behind
  const sp = $('#selpanel');
  if (selBld && selBld.alive) {
    const b = selBld, d = b.def;
    const prod = d.units.map((t) => { const U = UNITS[t]; return `<button class="pbtn" data-unit="${t}" style="--c:${BRANCHES[U.br].color}" data-tip="${esc(tipFor(U.name, U.cost, U.desc, U.ability ? `<br><span class='uses'>Ability: ${ABILITIES[U.ability].name}</span>` : ''))}">${svg(t, 'blue')}<span class="price">${fmt$(U.cost)}</span><i class="q"></i><i class="bar"></i></button>`; }).join('');
    sp.innerHTML = `<div class="head">${svg(b.type, 'blue')}<div><b>${d.name}</b><div class="sub" id="bstate"></div></div></div>${prod ? `<div class="prod">${prod}</div><div class="hint">Click: queue · Right-click: cancel · Right-click ground: rally point</div>` : `<div class="hint">${b.type === 'hq' ? 'Your HQ. If it falls, you lose. +$120/min.' : b.type === 'depot' ? 'Supply depot: +$270/min.' : ''}</div>`}`;
    sp.querySelectorAll('[data-unit]').forEach((el) => {
      el.addEventListener('click', () => { if (!queueUnit(selBld, el.dataset.unit)) toast(!selBld.built ? 'Still under construction' : teams.blue.money < UNITS[el.dataset.unit].cost ? 'Not enough money' : 'Queue full'); updatePanelDynamic(); });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); cancelUnit(selBld, el.dataset.unit); updatePanelDynamic(); });
    });
    sp.classList.remove('hidden'); return;
  }
  const list = [...selUnits].filter((u) => u.alive);
  if (!list.length) { sp.classList.add('hidden'); sp.innerHTML = ''; return; }
  const cards = list.slice(0, 24).map((u) => `<div class="ucard" data-id="${u.id}" data-tip="${esc(`<b>${u.def.name}</b><br><span class='desc'>${u.def.desc}</span>`)}">${svg(u.type, 'blue')}<i class="smk"></i><i class="fire"></i></div>`).join('');
  const abs = [...new Set(list.map((u) => u.def.ability).filter(Boolean))];
  const abHtml = abs.map((a) => { const A = ABILITIES[a]; return `<button class="abtn" data-ab="${a}" data-tip="${esc(tipFor(A.name + ` <span class='key'>${A.label}</span>`, 0, A.desc))}">${svg(a)}<span class="hk">${A.label}</span><i class="cdr"></i></button>`; }).join('');
  sp.innerHTML = `<div class="ucards">${cards}${list.length > 24 ? `<div class="more">+${list.length - 24}</div>` : ''}</div>${abHtml ? `<div class="abil">${abHtml}</div>` : ''}`;
  sp.querySelectorAll('.ucard').forEach((el) => el.addEventListener('click', (e) => { const u = units.find((u) => u.id === el.dataset.id); if (u) { if (e.shiftKey) { selUnits.delete(u); hudDirty = true; } else selectUnits([u]); } }));
  sp.querySelectorAll('[data-ab]').forEach((el) => el.addEventListener('click', () => useAbility([...selUnits], el.dataset.ab)));
  sp.classList.remove('hidden');
}
function updatePanelDynamic() {
  const sp = $('#selpanel');
  if (selBld && selBld.alive) {
    const b = selBld, st = $('#bstate');
    if (st) st.textContent = !b.built ? `Building… ${Math.floor(b.progress * 100)}%` : b.queue.length ? `Producing ${UNITS[b.queue[0]].name}` : b.def.units.length ? 'Ready' : '';
    sp.querySelectorAll('[data-unit]').forEach((el) => {
      const t = el.dataset.unit, n = b.queue.filter((q) => q === t).length;
      el.querySelector('.q').textContent = n || ''; el.querySelector('.q').style.display = n ? '' : 'none';
      el.classList.toggle('poor', teams.blue.money < UNITS[t].cost); el.classList.toggle('locked', !b.built);
      el.querySelector('.bar').style.width = b.queue[0] === t ? (b.prodT / UNITS[t].time * 100).toFixed(0) + '%' : '0';
    });
    return;
  }
  sp.querySelectorAll('.ucard').forEach((el) => {
    const u = units.find((u) => u.id === el.dataset.id); if (!u) return;
    el.dataset.state = !u.alive ? 'dead' : ['clean', 'damaged', 'burning'][u.dmg];
    el.classList.toggle('garr', !!u.garrison);
  });
  sp.querySelectorAll('[data-ab]').forEach((el) => {
    const ab = el.dataset.ab, us = [...selUnits].filter((u) => u.alive && u.def.ability === ab);
    const cd = Math.min(...us.map((u) => Math.max(0, u.cd))), max = ABILITIES[ab].cd;
    el.querySelector('.cdr').style.background = cd > 0 ? `conic-gradient(rgba(0,0,0,.62) ${(cd / max * 100).toFixed(1)}%, transparent 0)` : 'none';
    el.classList.toggle('active', us.some((u) => (ab === 'deploy' && (u.deployed || u.wantDeploy)) || (ab === 'ambush' && u.ambush) || (ab === 'sprint' && game.time < u.sprintUntil) || (ab === 'satchel' && u.satchel) || (ab === 'binoculars' && reveals.some((r) => r.unit === u && r.until > game.time))));
  });
}
function updateHUD(dt) {
  toastT -= dt; if (toastT <= 0) $('#toast').classList.remove('on');
  hudT -= dt;
  const sig = selSignature();
  if (sig !== lastSig || hudDirty) { lastSig = sig; hudDirty = false; renderSelPanel(); hudT = 0; }
  if (hudT > 0) return; hudT = .2;
  const T = teams.blue;
  $('#money').textContent = fmt$(T.money);
  $('#income').textContent = `+${Math.round(T.rate * 60)}/min`;
  const tm = Math.floor(game.time); $('#clock').textContent = `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}`;
  document.querySelectorAll('#buildbar [data-build]').forEach((el) => el.classList.toggle('poor', T.money < BUILDINGS[el.dataset.build].cost));
  document.querySelectorAll('#buildbar [data-build]').forEach((el) => el.classList.toggle('on', placing?.type === el.dataset.build));
  updatePanelDynamic();
}

// =====================================================================================
// game lifecycle
// =====================================================================================
function clearWorld() {
  for (const u of units) { scene.remove(u.root); if (u.im) scene.remove(u.im); if (u.pathLine) scene.remove(u.pathLine); if (u.ring && isAir(u)) scene.remove(u.ring); if (u.shadow) scene.remove(u.shadow); }
  for (const b of buildings) { scene.remove(b.root); scene.remove(b.ringP); scene.remove(b.flag); const i = obstacles.indexOf(b.obs); if (i >= 0) obstacles.splice(i, 1); if (b.alive) nav.removeRect(b.navRect); }
  for (const s of shells) scene.remove(s.mesh);
  for (const b of bombs) scene.remove(b.mesh);
  for (const e of emitters) if (e.scorch) scene.remove(e.scorch);
  for (const m of markers) scene.remove(m.m);
  for (const m of mines) scene.remove(m.mesh);
  for (const h of houses) { h.garrison = null; if (h.flagMesh) { scene.remove(h.flagMesh); h.flagMesh = null; } }
  for (const s of spots) { s.bld = null; s.mesh.visible = true; }
  units = []; buildings = []; shells = []; bombs = []; wrecks = []; emitters = []; markers = []; mines = []; reveals = []; pickMeshes.length = 0;
  selUnits.clear(); selBld = null; cancelPlacing();
  for (const k in groups) delete groups[k];
  fx.clear(); smoke.clear();
}
function startGame(diff = game.difficulty) {
  clearWorld();
  game.difficulty = diff;
  Object.assign(game, { state: 'playing', time: 0, endAt: 0, result: null, holdAI: false, invuln: null, stats: { shots: 0, hits: 0, kills: 0, lost: 0, built: 0, trained: 0 } });
  teams.blue.money = START_MONEY; teams.red.money = START_MONEY;
  aiState = makeAI(diff);
  for (const team of ['blue', 'red']) {
    const p = HQ_POS[team]; createBuilding('hq', team, p.x, p.z, true);
    const j = createUnit('jeep', team, p.x - 12, p.z + facingOf(team) * 14);
    if (team === 'red') aiState.newUnit(j);
  }
  $('#banner').classList.add('hidden'); $('#start').classList.add('hidden'); $('#hud').classList.remove('hidden');
  setCameraHome(); buildBar(); hudDirty = true;
}
function showBanner() {
  game.state = 'over';
  for (const u of units) if (!isAir(u)) { u.order = null; stop(u); }
  cancelPlacing();
  const win = game.result === 'win';
  const b = $('#banner'); b.classList.remove('hidden'); b.classList.toggle('win', win); b.classList.toggle('lose', game.result === 'lose');
  b.querySelector('.title').textContent = win ? 'VICTORY' : game.result === 'lose' ? 'DEFEAT' : 'DRAW';
  const tm = Math.round(game.time);
  b.querySelector('.sub').textContent = `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}  ·  ${game.stats.kills} enemy units destroyed  ·  ${game.stats.lost} lost`;
}
$('#restart').addEventListener('click', () => { $('#banner').classList.add('hidden'); game.state = 'menu'; $('#start').classList.remove('hidden'); });
document.querySelectorAll('#start [data-diff]').forEach((el) => el.addEventListener('click', () => { document.querySelectorAll('#start [data-diff]').forEach((e) => e.classList.toggle('on', e === el)); game.difficulty = el.dataset.diff; }));
$('#play').addEventListener('click', () => startGame(game.difficulty));

// =====================================================================================
// per-frame visuals & loop
// =====================================================================================
function updateVisuals(dt, now) {
  for (const u of units) {
    if (isInf(u)) updateSquadVisual(u, dt, now);
    if (!u.alive) { if (u.pathLine) u.pathLine.visible = false; continue; }
    const sel = selUnits.has(u), hov = hovered === u;
    const targeted = u.team === 'red' && [...selUnits].some((s) => s.order?.type === 'attack' && s.order.target === u);
    u.ring.visible = (sel || hov || targeted) && (u.team === 'blue' || u.vis.blue) && !u.garrison;
    u.ring.material.opacity = sel ? .95 : targeted ? .55 + .4 * Math.sin(now * 8) : .4;
    if (u.pathLine) {
      const show = sel && u.path.length > 0 && game.state === 'playing'; u.pathLine.visible = show;
      if (show) { const a = u.pathLine.geometry.attributes.position; const pts = [pos(u), ...u.path].slice(0, 40); pts.forEach((q, i) => a.setXYZ(i, q.x, surfaceY(q.x, q.z) + .3, q.z)); a.needsUpdate = true; u.pathLine.geometry.setDrawRange(0, pts.length); }
    }
  }
  for (const b of buildings) {
    b.frame.visible = b.alive && (selBld === b || hovered === b);
    b.flag.visible = b.alive && selBld === b && b.def.units.length > 0;
    if (b.flag.visible) { b.flag.position.set(b.rally.x, surfaceY(b.rally.x, b.rally.z), b.rally.z); b.flag.children[1].rotation.y = Math.sin(now * 3) * .3; }
  }
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i]; m.t += dt;
    if (m.ring) { const k = m.t / m.dur; m.m.material.opacity = .5 * (1 - k); if (k >= 1) { scene.remove(m.m); markers.splice(i, 1); } continue; }
    const k = m.t / .55;
    m.m.scale.setScalar((m.big ? 3.2 : 2) * (1 - k * .6)); m.m.material.opacity = 1 - k;
    if (k >= 1) { scene.remove(m.m); m.m.material.dispose(); markers.splice(i, 1); }
  }
  for (const s of spots) if (s.mesh.visible) s.mesh.material.opacity = placing?.type === 'depot' ? .6 + .4 * Math.sin(now * 6) : .85;
  for (const f of flashLights) { f.t = Math.max(0, f.t - dt); f.l.intensity = f.peak * (f.t / .18) ** 2; }
}
const clock = new THREE.Clock();
let cpuMs = 0, fps = 60, fpsAcc = 0, fpsN = 0, simMs = 0;
function step(dt) {
  if (game.state !== 'over') game.time += dt;
  if (game.state === 'playing' || game.state === 'ending') {
    updateEconomy(dt);
    if (!game.holdAI && aiState && game.state === 'playing') aiState.tick(dt);
    for (const b of buildings) { updateBuilding(b, dt); bldDamageFx(b, dt); }
  }
  for (let i = units.length - 1; i >= 0; i--) { const u = units[i]; if (u.gone) { units.splice(i, 1); continue; } updateUnit(u, dt); damageFx(u, dt); }
  updateSpotting(dt);
  separate();
  updateShells(dt); updateBombs(dt); updateMines(dt);
  updateEmitters(dt);
  fx.update(dt); smoke.update(dt);
  reveals = reveals.filter((r) => r.until > game.time);
  if (game.state === 'ending' && game.time >= game.endAt) showBanner();
}
function frame() {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const raw = clock.getDelta(); const dt = Math.min(raw, .05);
  fpsAcc += raw; fpsN++; if (fpsAcc > .5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  if (game.state !== 'menu') for (let s = 0; s < game.timeScale; s++) step(dt);
  simMs = simMs * .9 + (performance.now() - t0) * .1;
  updateVisuals(dt, performance.now() / 1000);
  updateCamera(dt);
  if (game.state !== 'menu') { updateHUD(dt); drawMinimap(dt); }
  cpuMs = cpuMs * .9 + (performance.now() - t0) * .1;
  renderer.render(scene, camera);
}
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  const u = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  fx.mat.uniforms.uScale.value = smoke.mat.uniforms.uScale.value = u;
}
window.addEventListener('resize', onResize); onResize();
// menu backdrop: slow orbit over the map
setCameraHome();
frame();

// =====================================================================================
// test / debug hooks
// =====================================================================================
const entById = (id) => units.find((u) => u.id === id) || buildings.find((b) => b.id === id);
const uInfo = (u) => ({ id: u.id, type: u.type, kind: u.kind, team: u.team, hp: u.hp, maxHp: u.maxHp, dmg: u.dmg, alive: u.alive, x: pos(u).x, y: pos(u).y, z: pos(u).z, men: u.kind === 'inf' ? menAlive(u) : 0, shownMen: u.im ? u.im.count : 0, selected: selUnits.has(u), order: u.order?.type || null, pathLen: u.path.length, visBlue: u.vis.blue, visRed: u.vis.red, cd: u.cd, deployed: u.deployed, ambush: u.ambush, sprinting: game.time < u.sprintUntil, satchel: !!u.satchel, garrison: !!u.garrison, airState: u.airState || null, ammo: u.ammo, fireTarget: u.fireTarget?.id || null, hullColor: u.mats?.main.color.getHexString() });
const bInfo = (b) => ({ id: b.id, type: b.type, team: b.team, hp: b.hp, maxHp: b.maxHp, dmg: b.dmg, alive: b.alive, built: b.built, progress: b.progress, x: b.x, z: b.z, hx: b.hx, hz: b.hz, queue: [...b.queue], rally: { ...b.rally }, visBlue: b.vis.blue, selected: selBld === b });
window.__game = {
  get state() { return game.state; }, get result() { return game.result; }, get stats() { return { ...game.stats }; }, get fps() { return fps; }, get cpuMs() { return cpuMs; }, get simMs() { return simMs; },
  get difficulty() { return game.difficulty; },
  start: (d = 'normal') => startGame(d),
  money: (team = 'blue') => teams[team].money, income: (team = 'blue') => teams[team].rate * 60,
  addMoney: (n, team = 'blue') => { teams[team].money += n; },
  units: (team) => units.filter((u) => !team || u.team === team).map(uInfo),
  buildings: (team) => buildings.filter((b) => !team || b.team === team).map(bInfo),
  unit: (id) => { const u = entById(id); return u ? (u.isBld ? bInfo(u) : uInfo(u)) : null; },
  spawn: (type, team, x, z) => { const u = createUnit(type, team, x, z); if (team === 'red' && aiState) aiState.newUnit(u); if (isAir(u)) { u.home = homeOf(u); pos(u).y = u.def.alt; } return u.id; },
  build: (type, team, x, z, done = false) => { const b = done ? createBuilding(type, team, x, z, true) : placeBuilding(type, team, x, z); return b?.id || null; },
  canPlace: (type, x, z, team = 'blue') => canPlace(type, team, x, z),
  finishBuildings: () => { for (const b of buildings) if (b.alive && !b.built) { b.progress = 1; b.built = true; b.body.scale.y = 1; b.ringP.visible = false; } },
  queue: (id, type) => queueUnit(entById(id), type),
  order: (ids, x, z) => orderMove(ids.map(entById), x, z), attack: (ids, tid) => orderAttack(ids.map(entById), entById(tid)),
  garrison: (ids, hi) => orderGarrison(ids.map(entById), houses[hi]), houses: () => houses.map((h) => ({ x: h.x, z: h.z, hx: h.hx, hz: h.hz, h: h.h, taken: !!h.garrison })),
  ability: (ids, ab) => useAbility(ids.map(entById), ab),
  select: (ids) => selectUnits(ids.map(entById)), selectBuilding: (id) => selectBuilding(entById(id)),
  selection: () => ({ units: [...selUnits].map((u) => u.id), building: selBld?.id || null }),
  damage: (id, n, wpn = 'cannon') => { const e = entById(id); if (e) applyDamage(e, n / multOf(wpn, e), wpn, null, null); },
  kill: (id) => { const e = entById(id); if (e?.alive) { if (e.isBld) { e.hp = 0; destroyBuilding(e); } else { e.hp = 0; killUnit(e); } } },
  teleport: (id, x, z) => { const u = entById(id); pos(u).set(x, isAir(u) ? pos(u).y : surfaceY(x, z), z); u.prev.copy(pos(u)); u.safe?.copy(pos(u)); stop(u); u.order = null; if (u.soldiers) for (const s of u.soldiers) { s.x = x + s.ox; s.z = z + s.oz; } },
  face: (id, yaw) => { const u = entById(id); u.yaw = yaw; },
  revealAll: (on = true) => { game.revealAll = on; if (on) reveals.push({ team: 'blue', x: 0, z: 0, r: 999, until: 1e9 }); else reveals = reveals.filter((r) => r.r !== 999); },
  setTimeScale: (n) => { game.timeScale = Math.max(0, n | 0); }, holdAI: (v) => { game.holdAI = !!v; },
  gameTime: () => game.time,
  screenOf: (id) => { const e = entById(id); const p = e.isBld ? new THREE.Vector3(e.x, surfaceY(e.x, e.z) + e.def.h * .5, e.z) : e.garrison ? new THREE.Vector3(e.garrison.x, e.garrison.h * .6, e.garrison.z) : tmpV.copy(pos(e)).setY(pos(e).y + (isInf(e) ? 1 : 1.2)); const s = toScreen(p); return { x: s.x, y: s.y }; },
  groundScreen: (x, z) => { const s = toScreen(new THREE.Vector3(x, surfaceY(x, z), z)); return { x: s.x, y: s.y }; },
  worldToScreen: (x, y, z) => { const s = toScreen(new THREE.Vector3(x, y, z)); return { x: s.x, y: s.y }; },
  focus: (x, z, d) => {  // test hook: snap the camera instantly (headless frame rates are very low)
    cam.shift.set(0, 0, 0);
    const mv = new THREE.Vector3(x - controls.target.x, 0, z - controls.target.z);
    controls.target.add(mv); camera.position.add(mv);
    if (d) { cam.want = cam.dist = clamp(d, CFG.minDist, CFG.maxDist); cam.tiltWant = tiltFor(cam.want); cam.tiltT = 0; sph.setFromVector3(camera.position.clone().sub(controls.target)); sph.radius = cam.dist; sph.phi = clamp(cam.tiltWant, controls.minPolarAngle, controls.maxPolarAngle); camera.position.setFromSpherical(sph).add(controls.target); }
    controls.update(); camera.updateMatrixWorld();
  },
  cameraTarget: () => ({ x: controls.target.x, z: controls.target.z }), cameraDistance: () => camera.position.distanceTo(controls.target),
  minimapRect: () => { const r = mmCanvas.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
  spots: () => spots.map((s) => ({ x: s.x, z: s.z, taken: !!s.bld, team: s.bld?.team || null })),
  shellsInFlight: () => shells.length + bombs.length, mines: () => mines.map((m) => ({ team: m.team, x: m.x, z: m.z, visible: m.mesh.visible })),
  reveals: () => reveals.length,
  countHealthBarObjects: () => { let n = 0; scene.traverse((o) => { if (o.isSprite || /hp|health/i.test(o.name || '')) n++; }); return n + document.querySelectorAll('.hpbar, .healthbar, [class*="hp-"]').length; },
  placing: () => placing && { type: placing.type, ok: placing.ok, reason: placing.reason },
  isWet: (x, z) => wet(x, z), riverZ: (x) => riverZ(x), bridges: () => BRIDGES_INFO,
  ai: () => aiState && { wave: aiState.wave, waveTarget: aiState.waveTarget, nextWave: aiState.nextWave, army: [...aiState.army].filter((u) => u.alive).length },
  findSite: (type, cx = HQ_POS.blue.x, cz = HQ_POS.blue.z, team = 'blue') => {
    if (type === 'depot') { const sp = spots.filter((s) => !s.bld && canPlace('depot', team, s.x, s.z, true).ok).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0]; return sp ? { x: sp.x, z: sp.z } : null; }
    const okAt = (x, z) => [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].every(([dx, dz]) => canPlace(type, team, x + dx, z + dz, true).ok);
    const anchors = [{ x: cx, z: cz }, ...aliveBlds(team).filter((b) => b.built || b.type === 'hq')];
    for (const an of anchors) for (let r = 0; r < BUILD_RADIUS; r += 2) for (let a = 0; a < 6.28; a += 0.3) { const x = an.x + Math.sin(a) * r, z = an.z + Math.cos(a) * r; if (okAt(x, z)) return { x, z }; }
    return null;
  },
  los: (x0, z0, x1, z1) => losClear(x0, surfaceY(x0, z0) + 1.8, z0, x1, surfaceY(x1, z1) + 1.3, z1) && !inForest(x0, z0) && !inForest(x1, z1),
  // test hook: run the simulation headless-fast (no rendering) for `sec` game seconds
  simulate: (sec, dt = 1 / 20) => { const t0 = performance.now(); let n = 0; while (n * dt < sec && (game.state === 'playing' || game.state === 'ending')) { step(dt); n++; } hudDirty = true; return { steps: n, ms: performance.now() - t0 }; },
  invulnerable: (team, on = true) => { game.invuln = on ? team : null; },
  pathLinesVisible: () => units.filter((u) => u.pathLine?.visible).length,
};
