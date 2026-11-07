import * as THREE from '../vendor/three.module.min.js';
import { createHqTrooper, poseTrooper, fireFx, disposeHqTrooper } from '../hq/api.js';
import { createSim, step, issueMove, issueAttack, issueAttackMove, issueStop, squadAlive, squadCenter, squadUnits } from './sim.js';

const TEST = new URLSearchParams(location.search).has('test');
const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3f5);
scene.fog = new THREE.Fog(0x9fd3f5, 70, 140);
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 300);
scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x7aa860, 1.25));
const sun = new THREE.DirectionalLight(0xfff4dc, 1.6);
sun.position.set(18, 30, 12); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 80 });
scene.add(sun);

// ---- map ----
let sim = createSim();
const HALF = sim.cfg.half;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ color: 0x8cc96a }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const outer = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ color: 0x7fb85e }));
outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; scene.add(outer);
{ // edge berm
  const m = new THREE.MeshLambertMaterial({ color: 0xc9b07a });
  for (const [x, z, w, d] of [[0, -HALF, HALF * 2 + 1, 0.8], [0, HALF, HALF * 2 + 1, 0.8], [-HALF, 0, 0.8, HALF * 2], [HALF, 0, 0.8, HALF * 2]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), m); b.position.set(x, 0.25, z); b.receiveShadow = true; scene.add(b);
  }
  // spawn pads
  for (const [z, c] of [[17, 0x4aa8ff], [-17, 0xff5a4a]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(22, 5), new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.18 }));
    p.rotation.x = -Math.PI / 2; p.position.set(0, 0.01, z); scene.add(p);
  }
}
const rockMat = new THREE.MeshLambertMaterial({ color: 0xa59a8a }), crateMat = new THREE.MeshLambertMaterial({ color: 0xb88a4a });
for (const [i, o] of sim.obstacles.entries()) {
  const g = i % 2 ? new THREE.CylinderGeometry(o.r * 0.95, o.r, 1.6, 10) : new THREE.DodecahedronGeometry(o.r, 0);
  const m = new THREE.Mesh(g, i % 2 ? crateMat : rockMat);
  m.position.set(o.x, i % 2 ? 0.8 : o.r * 0.55, o.z); m.castShadow = m.receiveShadow = true; scene.add(m);
}
// capture point
const pt = sim.point;
const ptDisk = new THREE.Mesh(new THREE.CircleGeometry(pt.r, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
ptDisk.rotation.x = -Math.PI / 2; ptDisk.position.set(pt.x, 0.02, pt.z); scene.add(ptDisk);
const ptRing = new THREE.Mesh(new THREE.RingGeometry(pt.r - 0.25, pt.r, 48), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
ptRing.rotation.x = -Math.PI / 2; ptRing.position.set(pt.x, 0.03, pt.z); scene.add(ptRing);
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 8), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
pole.position.set(pt.x, 1.7, pt.z); pole.castShadow = true; scene.add(pole);
const flagMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), flagMat); flag.position.set(pt.x + 0.6, 3.0, pt.z); scene.add(flag);

let fx = null;

// ---- units view ----
const COL = { player: 0x4aa8ff, enemy: 0xff5a4a };
const ringGeo = new THREE.RingGeometry(0.55, 0.72, 24), diskGeo = new THREE.CircleGeometry(0.5, 20);
const selMat = new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.95, depthWrite: false });
const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6, depthTest: false });
const hpFgMats = { player: new THREE.MeshBasicMaterial({ color: 0x7dffb0, depthTest: false }), enemy: new THREE.MeshBasicMaterial({ color: 0xff7a6a, depthTest: false }) };
const barGeo = new THREE.PlaneGeometry(0.9, 0.11);
let views = [];
function buildViews() {
  for (const v of views) { disposeHqTrooper(v.t); scene.remove(v.disk, v.sel, v.hp); }
  views = sim.units.map((u) => {
    const t = createHqTrooper({ side: u.team === 'player' ? 'attacker' : 'defender', cls: 'rifle' });
    t.root.position.set(u.x, 0, u.z); t.root.rotation.y = u.faceYaw;
    t.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(t.root);
    const disk = new THREE.Mesh(diskGeo, new THREE.MeshBasicMaterial({ color: COL[u.team], transparent: true, opacity: 0.45, depthWrite: false }));
    disk.rotation.x = -Math.PI / 2; scene.add(disk);
    const sel = new THREE.Mesh(ringGeo, selMat); sel.rotation.x = -Math.PI / 2; sel.visible = false; scene.add(sel);
    const hp = new THREE.Group(); const bg = new THREE.Mesh(barGeo, hpBgMat); const fg = new THREE.Mesh(barGeo, hpFgMats[u.team]);
    fg.position.z = 0.001; bg.renderOrder = 10; fg.renderOrder = 11; hp.add(bg, fg); scene.add(hp);
    poseTrooper(t, 'idle', 0, 0.016);
    return { u, t, disk, sel, hp, fg, yaw: u.faceYaw, state: 'idle', st: 0, shotT: 9 };
  });
}

// markers
const markers = [];
function marker(x, z, color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.55, 28), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); scene.add(m); markers.push({ m, t: 0 });
}

// ---- camera (bounded, smoothed) ----
const cam = { x: 0, z: 13, tx: 0, tz: 13, dist: 30, tdist: innerWidth < innerHeight ? 44 : 30, pitch: 0.95 };
function placeCamera(dt) {
  const k = 1 - Math.exp(-10 * dt);
  cam.tx = THREE.MathUtils.clamp(cam.tx, -HALF + 2, HALF - 2); cam.tz = THREE.MathUtils.clamp(cam.tz, -HALF + 2, HALF + 6);
  cam.tdist = THREE.MathUtils.clamp(cam.tdist, 14, 50);
  cam.x += (cam.tx - cam.x) * k; cam.z += (cam.tz - cam.z) * k; cam.dist += (cam.tdist - cam.dist) * k;
  camera.position.set(cam.x, Math.sin(cam.pitch) * cam.dist, cam.z + Math.cos(cam.pitch) * cam.dist);
  camera.lookAt(cam.x, 0, cam.z);
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w < h ? 58 : 45; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---- selection + orders ----
const selected = new Set();
let amoveArmed = false;
const playerSquads = () => sim.squads.filter((q) => q.team === 'player');
function select(ids, add = false) { if (!add) selected.clear(); for (const i of ids) if (squadAlive(sim, i)) selected.add(i); refreshCards(); }
function orderMove(x, z, attackMove) {
  if (!selected.size) return false;
  for (const id of selected) attackMove ? issueAttackMove(sim, id, x, z) : issueMove(sim, id, x, z);
  marker(x, z, attackMove ? 0xff9a3c : 0x7dffb0); return true;
}
function orderAttack(enemySquad) {
  if (!selected.size) return false;
  for (const id of selected) issueAttack(sim, id, enemySquad);
  const c = squadCenter(sim, enemySquad); if (c) marker(c.x, c.z, 0xff3b30); return true;
}
function setAMove(on) { amoveArmed = on; $('btnAMove').setAttribute('aria-pressed', String(on)); }

// ---- picking ----
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), gplane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), tmp = new THREE.Vector3();
function groundAt(cx, cy) {
  const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(gplane, new THREE.Vector3());
}
function toScreen(x, y, z) { tmp.set(x, y, z).project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (tmp.x + 1) / 2 * r.width, y: r.top + (1 - tmp.y) / 2 * r.height }; }
function pickUnit(cx, cy, radius) {
  let best = null, bd = radius;
  for (const u of sim.units) { if (!u.alive) continue; const p = toScreen(u.x, 0.9, u.z); const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = u; } }
  return best;
}

// ---- input ----
const ptrs = new Map(); let gesture = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.focus(); canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType, button: e.button });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), dist0: cam.tdist }; }
  else if (ptrs.size === 1) gesture = { kind: 'tap', moved: false };
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (!gesture) return;
  if (gesture.kind === 'pinch' && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); cam.tdist = gesture.dist0 * (gesture.d0 / Math.max(20, d)); return; }
  if (Math.hypot(p.x - p.sx, p.y - p.sy) > 10) gesture.moved = true;
  if (!gesture.moved) return;
  if (p.type === 'mouse' && p.button === 0) { gesture.kind = 'box'; drawBox(p); }
  else if (p.type !== 'mouse' || p.button === 1) { // touch drag / middle drag pans
    gesture.kind = 'pan'; const s = cam.dist / innerHeight * 1.25; cam.tx -= dx * s; cam.tz -= dy * s;
  }
});
function drawBox(p) { const b = $('box'); b.hidden = false; Object.assign(b.style, { left: Math.min(p.sx, p.x) + 'px', top: Math.min(p.sy, p.y) + 'px', width: Math.abs(p.x - p.sx) + 'px', height: Math.abs(p.y - p.sy) + 'px' }); }
function endPtr(e, cancel) {
  const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
  const g = gesture; if (ptrs.size === 0) gesture = null; if (!g || cancel || g.kind === 'pinch') { if (ptrs.size === 0) gesture = null; return; }
  if (g.kind === 'box') {
    $('box').hidden = true; const x0 = Math.min(p.sx, p.x), x1 = Math.max(p.sx, p.x), y0 = Math.min(p.sy, p.y), y1 = Math.max(p.sy, p.y);
    const ids = new Set(); for (const u of sim.units) if (u.alive && u.team === 'player') { const s = toScreen(u.x, 0.9, u.z); if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) ids.add(u.squad); }
    select(ids, e.shiftKey); return;
  }
  if (g.kind !== 'tap' || g.moved) return;
  click(p.x, p.y, p.type, p.button, e);
}
canvas.addEventListener('pointerup', (e) => endPtr(e, false));
canvas.addEventListener('pointercancel', (e) => endPtr(e, true));
function click(x, y, type, button, e) {
  if (!running) return;
  const touch = type !== 'mouse';
  const u = pickUnit(x, y, touch ? 40 : 26);
  const gp = groundAt(x, y);
  if (button === 2) { // PC context order
    if (u && u.team === 'enemy') orderAttack(u.squad);
    else if (gp) orderMove(gp.x, gp.z, e.ctrlKey || amoveArmed);
    setAMove(false); return;
  }
  if (u && u.team === 'player') { select([u.squad], e.shiftKey || e.ctrlKey); return; }
  if (u && u.team === 'enemy') { if (orderAttack(u.squad)) setAMove(false); return; }
  if (gp && (touch || amoveArmed) && selected.size) { orderMove(gp.x, gp.z, amoveArmed); setAMove(false); return; }
  if (!touch) { selected.clear(); refreshCards(); }
}
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.tdist *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.repeat) return; keys.add(e.code);
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') select([+e.code.slice(5) - 1], e.shiftKey);
  if (e.code === 'Backquote' || e.code === 'KeyQ') select(playerSquads().map((q) => q.id));
  if (e.code === 'KeyA') setAMove(!amoveArmed);
  if (e.code === 'KeyS' && !e.ctrlKey) for (const id of selected) issueStop(sim, id);
  if (e.code === 'Escape') { selected.clear(); setAMove(false); refreshCards(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// ---- HUD ----
const cards = $('squads');
function buildCards() {
  cards.innerHTML = '';
  for (const q of playerSquads()) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'card'; b.dataset.squad = q.id;
    b.innerHTML = `<div class="nm"><span>${q.name}</span><kbd>${q.id + 1}</kbd></div><div class="pips"></div><div class="hp"><i></i></div>`;
    b.addEventListener('click', (e) => { select([q.id], e.shiftKey); });
    cards.appendChild(b);
  }
  refreshCards();
}
function refreshCards() {
  for (const b of cards.children) {
    const id = +b.dataset.squad, us = sim.units.filter((u) => u.squad === id);
    const alive = us.filter((u) => u.alive).length, hp = us.reduce((a, u) => a + u.hp, 0) / us.reduce((a, u) => a + u.maxHp, 0);
    if (!alive) selected.delete(id);
    b.classList.toggle('sel', selected.has(id)); b.classList.toggle('dead', !alive);
    const pips = us.map((u) => `<i class="${u.alive ? '' : 'x'}"></i>`).join('');
    const pe = b.querySelector('.pips'); if (pe.innerHTML !== pips) pe.innerHTML = pips;
    b.querySelector('.hp i').style.width = (hp * 100).toFixed(0) + '%';
  }
}
$('btnAll').addEventListener('click', () => select(playerSquads().map((q) => q.id)));
$('btnAMove').addEventListener('click', () => setAMove(!amoveArmed));
$('btnStop').addEventListener('click', () => { for (const id of selected) issueStop(sim, id); });
function refreshPoint() {
  const p = sim.point;
  $('ptState').textContent = p.contested ? 'Contested' : p.owner === 'player' ? 'You hold the point' : p.owner === 'enemy' ? 'Enemy holds the point' : 'Neutral point';
  const f = $('ptFill'); const w = Math.abs(p.progress) * 50;
  f.style.width = w + '%'; f.style.left = p.progress >= 0 ? '50%' : (50 - w) + '%'; f.style.background = p.progress >= 0 ? 'var(--you)' : 'var(--foe)';
  $('holdP').textContent = Math.floor(p.hold.player); $('holdE').textContent = Math.floor(p.hold.enemy); $('holdGoal').textContent = sim.cfg.holdToWin;
  const c = p.contested ? 0xff9a3c : p.owner === 'player' ? COL.player : p.owner === 'enemy' ? COL.enemy : 0xffd23f;
  ptRing.material.color.setHex(c); flagMat.color.setHex(p.owner ? COL[p.owner] : 0xffffff);
}

// ---- game flow ----
let running = false;
function reset() {
  sim = createSim({ seed: (Math.random() * 1e9) | 0 });
  buildViews(); selected.clear(); setAMove(false); buildCards();
  for (const m of markers) scene.remove(m.m); markers.length = 0;
  cam.tx = 0; cam.tz = 13; cam.tdist = innerWidth < innerHeight ? 44 : 30; $('end').hidden = true; select([0]);
}
function start() { $('start').hidden = true; reset(); running = true; }
$('btnStart').addEventListener('click', start);
$('btnAgain').addEventListener('click', start);
$('btnRestart').addEventListener('click', start);
function showEnd() {
  running = false; const win = sim.result === 'victory';
  $('endTitle').textContent = win ? 'Victory' : 'Defeat';
  const held = win ? sim.point.hold.player >= sim.cfg.holdToWin : sim.point.hold.enemy >= sim.cfg.holdToWin;
  $('endSub').textContent = (held ? (win ? 'You held the point.' : 'The enemy held the point.') : (win ? 'Enemy force wiped out.' : 'Your force was wiped out.'))
    + ` Losses: you ${sim.casualties.player} · enemy ${sim.casualties.enemy}`;
  $('end').className = 'overlay ' + (win ? 'win' : 'lose'); $('end').hidden = false;
}

const shortest = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const tv = new THREE.Vector3();
let last = performance.now(), hudT = 0, errors = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (running) {
    // keyboard pan
    const pan = 18 * dt * cam.dist / 30;
    if (keys.has('ArrowLeft') || keys.has('KeyJ')) cam.tx -= pan; if (keys.has('ArrowRight') || keys.has('KeyL')) cam.tx += pan;
    if (keys.has('ArrowUp') || keys.has('KeyI')) cam.tz -= pan; if (keys.has('ArrowDown') || keys.has('KeyK')) cam.tz += pan;
    step(sim, dt);
    for (const ev of sim.events) {
      if (ev.type !== 'shot') continue;
      const sv = views[ev.from], tvw = views[ev.to];
      sv.state = 'shoot'; sv.st = 0; sv.shotT = 0; sv.yaw = sv.u.faceYaw; sv.t.root.rotation.y = sv.yaw;
      poseTrooper(sv.t, 'shoot', 0.05, dt); sv.t.root.updateMatrixWorld(true);
      tv.set(tvw.u.x, 1.1, tvw.u.z); if (!ev.hit) tv.x += (Math.random() - 0.5) * 1.4, tv.y += Math.random() * 0.4;
      fx = fireFx(scene, sv.t, tv) || fx;
    }
    if (sim.result) showEnd();
  }
  for (const v of views) {
    const u = v.u; v.t.root.position.x = u.x; v.t.root.position.z = u.z;
    v.disk.position.set(u.x, 0.03, u.z); v.sel.position.set(u.x, 0.04, u.z);
    v.sel.visible = u.alive && u.team === 'player' && selected.has(u.squad);
    v.disk.visible = u.alive;
    v.hp.visible = u.alive && u.hp < u.maxHp; v.hp.position.set(u.x, 2.2, u.z); v.hp.quaternion.copy(camera.quaternion);
    v.fg.scale.x = Math.max(0.001, u.hp / u.maxHp); v.fg.position.x = -0.45 * (1 - v.fg.scale.x);
    let want = u.alive ? (u.state === 'shoot' && v.shotT < 0.6 ? 'shoot' : u.state === 'run' ? 'run' : u.state === 'shoot' ? 'shoot' : 'idle') : 'die';
    if (want !== v.state) { v.state = want; v.st = 0; }
    v.st += dt; v.shotT += dt;
    if (u.alive) { const d = shortest(u.faceYaw - v.yaw); v.yaw += d * (1 - Math.exp(-14 * dt)); v.t.root.rotation.y = v.yaw; }
    if (v.state === 'die' && u.deadT > 3.2) { v.t.root.visible = false; continue; }
    poseTrooper(v.t, v.state, v.state === 'shoot' ? Math.min(v.shotT, 0.55) : v.st, dt);
  }
  for (let i = markers.length - 1; i >= 0; i--) { const m = markers[i]; m.t += dt; m.m.scale.setScalar(1 + m.t * 2); m.m.material.opacity = Math.max(0, 1 - m.t / 0.8); if (m.t > 0.8) { scene.remove(m.m); markers.splice(i, 1); } }
  hudT -= dt; if (hudT <= 0) { hudT = 0.15; refreshCards(); refreshPoint(); }
  flag.rotation.y = Math.sin(now / 400) * 0.25;
  placeCamera(dt);
  if (fx) fx.update(dt, camera);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
buildViews(); buildCards(); refreshPoint(); placeCamera(1);
requestAnimationFrame(frame);

if (TEST) {
  addEventListener('error', () => errors++);
  window.__ic = {
    get sim() { return sim; }, selected, running: () => running, cam,
    screenOfUnit: (id) => { const u = sim.units[id]; return toScreen(u.x, 0.9, u.z); },
    screenOfSquad: (id) => { const c = squadCenter(sim, id); return c && toScreen(c.x, 0.9, c.z); },
    screenOfWorld: (x, z) => toScreen(x, 0, z),
    hitsCanvas: (x, y) => document.elementFromPoint(x, y) === canvas,
    squadUnits: (id) => squadUnits(sim, id).map((u) => ({ id: u.id, x: u.x, z: u.z, vx: u.vx, vz: u.vz, state: u.state, yaw: views[u.id].t.root.rotation.y, face: u.faceYaw })),
    viewState: (id) => views[id].state,
    muzzle: (id) => { const o = new THREE.Vector3(); try { views[id].t.rig.world('muzzle', 0, o); } catch (_) { return null; } return { x: o.x, y: o.y, z: o.z }; },
    setHold: (n) => { sim.cfg.holdToWin = n; },
    errors: () => errors,
  };
}
