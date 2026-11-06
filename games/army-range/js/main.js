import * as THREE from '../vendor/three.module.min.js';
import { createHqTrooper, poseTrooper, fireFx, disposeHqTrooper } from '../hq/api.js';
import { FX } from '../hq/demo-fx.js';

const canvas = document.getElementById('c');
const hint = document.getElementById('hint');
const startEl = document.getElementById('start');
const hitmark = document.getElementById('hitmark');
const hitsEl = document.getElementById('hits');
const shotsEl = document.getElementById('shots');
const accEl = document.getElementById('acc');
const touchEl = document.getElementById('touch');

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) touchEl.hidden = false;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1024);
scene.fog = new THREE.Fog(0x0b1024, 18, 55);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 80);
const eyeH = 1.62;
camera.position.set(0, eyeH, 8);

const hemi = new THREE.HemisphereLight(0xb8d0ff, 0x2a1a10, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2a8, 1.15);
sun.position.set(6, 14, 4);
scene.add(sun);

// Yard
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x2a3348, roughness: 0.95 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(40, 40, 0x3a4a6a, 0x1c2438);
grid.position.y = 0.01;
scene.add(grid);

// Low walls (collision)
const walls = [];
function addWall(x, z, w, d) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, 1.4, d),
    new THREE.MeshStandardMaterial({ color: 0x3d465c, roughness: 0.35, roughnessMap: null })
  );
  m.position.set(x, 0.7, z);
  scene.add(m);
  walls.push({ minX: x - w / 2 - 0.35, maxX: x + w / 2 + 0.35, minZ: z - d / 2 - 0.35, maxZ: z + d / 2 + 0.35 });
}
addWall(-12, 0, 1, 24);
addWall(12, 0, 1, 24);
addWall(0, -12, 24, 1);
addWall(0, 12, 24, 1);
addWall(-4, -2, 4, 0.6);
addWall(5, 3, 0.6, 5);

const fx = new FX(scene);

// Player state
const keys = Object.create(null);
let yaw = 0, pitch = 0;
let moveX = 0, moveY = 0;
let lookDx = 0, lookDy = 0;
let fireHeld = false, firePressed = false;
let playing = false, pointerLocked = false;
let sens = isTouch ? 0.0032 : 0.0022;
const player = { x: 0, z: 8, vx: 0, vz: 0 };
let shots = 0, hits = 0;
let hitFlash = 0;
let muzzleCool = 0;

function updateHud() {
  hitsEl.textContent = String(hits);
  shotsEl.textContent = String(shots);
  accEl.textContent = shots ? Math.round((100 * hits) / shots) + '%' : '—';
}

// Targets: HQ troopers that walk / strafe with poseTrooper gait
const targets = [];
const PATHS = [
  { pts: [new THREE.Vector3(-6, 0, -4), new THREE.Vector3(6, 0, -4), new THREE.Vector3(6, 0, 4), new THREE.Vector3(-6, 0, 4)], speed: 2.2, side: 'defender' },
  { pts: [new THREE.Vector3(8, 0, -6), new THREE.Vector3(8, 0, 6)], speed: 1.8, side: 'defender' },
  { pts: [new THREE.Vector3(-8, 0, 5), new THREE.Vector3(-2, 0, -6), new THREE.Vector3(-8, 0, -3)], speed: 2.4, side: 'defender' },
  { pts: [new THREE.Vector3(0, 0, -8), new THREE.Vector3(4, 0, -2), new THREE.Vector3(-4, 0, -2)], speed: 1.6, side: 'attacker' },
];

function spawnTarget(cfg, i) {
  const t = createHqTrooper({ side: cfg.side, cls: 'rifle' });
  const start = cfg.pts[0];
  t.root.position.set(start.x, 0, start.z);
  scene.add(t.root);
  const obj = {
    id: i,
    trooper: t,
    pts: cfg.pts,
    seg: 0,
    u: 0,
    speed: cfg.speed,
    alive: true,
    state: 'run',
    stateT: 0,
    hitR: 0.55,
  };
  targets.push(obj);
  poseTrooper(t, 'run', 0, 0.016);
  return obj;
}

function clearTargets() {
  for (const o of targets) {
    disposeHqTrooper(o.trooper);
  }
  targets.length = 0;
}

function spawnAll() {
  clearTargets();
  PATHS.forEach((p, i) => spawnTarget(p, i));
}

function advanceTarget(o, dt) {
  if (!o.alive) {
    o.stateT += dt;
    poseTrooper(o.trooper, 'die', o.stateT, dt);
    if (o.stateT > 2.8) {
      // respawn on same path
      o.alive = true;
      o.state = 'run';
      o.stateT = 0;
      o.seg = 0;
      o.u = 0;
      const p = o.pts[0];
      o.trooper.root.position.set(p.x, 0, p.z);
      o.trooper.root.visible = true;
      poseTrooper(o.trooper, 'run', 0, dt);
    }
    return;
  }
  const a = o.pts[o.seg];
  const b = o.pts[(o.seg + 1) % o.pts.length];
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  o.u += (o.speed * dt) / len;
  if (o.u >= 1) {
    o.u -= 1;
    o.seg = (o.seg + 1) % o.pts.length;
  }
  const a2 = o.pts[o.seg];
  const b2 = o.pts[(o.seg + 1) % o.pts.length];
  const x = a2.x + (b2.x - a2.x) * o.u;
  const z = a2.z + (b2.z - a2.z) * o.u;
  const yawFace = Math.atan2(b2.x - a2.x, b2.z - a2.z);
  o.trooper.root.position.x = x;
  o.trooper.root.position.z = z;
  o.trooper.root.rotation.y = yawFace;
  o.stateT += dt;
  poseTrooper(o.trooper, 'run', o.stateT, dt);
}

function collidePlayer(nx, nz) {
  let x = nx, z = nz;
  for (const w of walls) {
    if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) {
      const cx = (w.minX + w.maxX) / 2;
      const cz = (w.minZ + w.maxZ) / 2;
      if (Math.abs(nx - cx) > Math.abs(nz - cz)) x = nx < cx ? w.minX : w.maxX;
      else z = nz < cz ? w.minZ : w.maxZ;
    }
  }
  x = Math.max(-11.2, Math.min(11.2, x));
  z = Math.max(-11.2, Math.min(11.2, z));
  return { x, z };
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

function tryFire() {
  if (!playing || muzzleCool > 0) return;
  muzzleCool = 0.18;
  shots += 1;
  updateHud();

  camera.getWorldDirection(_dir);
  _origin.copy(camera.position);
  raycaster.set(_origin, _dir);

  // simple muzzle FX from eye
  const muzzle = _origin.clone().add(_dir.clone().multiplyScalar(0.4));
  fx.muzzle(muzzle, _dir, 0xffd27a, 0.7);

  let best = null, bestD = 40;
  for (const o of targets) {
    if (!o.alive) continue;
    const p = o.trooper.root.position;
    const center = new THREE.Vector3(p.x, 1.1, p.z);
    const to = center.clone().sub(_origin);
    const t = to.dot(_dir);
    if (t < 0.3 || t > bestD) continue;
    const closest = _origin.clone().add(_dir.clone().multiplyScalar(t));
    if (closest.distanceTo(center) <= o.hitR) {
      best = o; bestD = t;
    }
  }
  if (best) {
    hits += 1;
    updateHud();
    best.alive = false;
    best.state = 'die';
    best.stateT = 0;
    const hp = best.trooper.root.position.clone().setY(1.2);
    fx.hitPuff(hp, 1.2);
    fireFx(scene, best.trooper, hp);
    hitmark.hidden = false;
    hitmark.classList.add('on');
    hitFlash = 0.12;
  } else {
    const miss = _origin.clone().add(_dir.clone().multiplyScalar(30));
    fx.tracer(muzzle, miss, 0xffe08a, 0.08, 0.025);
  }
}

function restart() {
  shots = 0; hits = 0; updateHud();
  player.x = 0; player.z = 8; yaw = 0; pitch = 0;
  spawnAll();
}

// Input — keyboard
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape') document.exitPointerLock?.();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

canvas.addEventListener('click', () => {
  if (!playing) return;
  if (!isTouch && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  lookDx += e.movementX;
  lookDy += e.movementY;
});
document.addEventListener('mousedown', (e) => {
  if (!playing || isTouch) return;
  if (e.button === 0) { fireHeld = true; firePressed = true; }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) fireHeld = false;
});

// Touch joy + look + fire
const joy = document.getElementById('joy');
const joyKnob = document.getElementById('joyKnob');
const lookzone = document.getElementById('lookzone');
let joyId = null, lookId = null, joyOX = 0, joyOY = 0, lookLX = 0, lookLY = 0;

joy.addEventListener('pointerdown', (e) => {
  joyId = e.pointerId; joy.setPointerCapture(e.pointerId);
  const r = joy.getBoundingClientRect();
  joyOX = r.left + r.width / 2; joyOY = r.top + r.height / 2;
  moveStick(e.clientX, e.clientY);
});
joy.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyId) return;
  moveStick(e.clientX, e.clientY);
});
function endJoy(e) {
  if (e.pointerId !== joyId) return;
  joyId = null; moveX = 0; moveY = 0;
  joyKnob.style.transform = 'translate(0,0)';
}
joy.addEventListener('pointerup', endJoy);
joy.addEventListener('pointercancel', endJoy);

function moveStick(cx, cy) {
  let dx = cx - joyOX, dy = cy - joyOY;
  const max = 40, m = Math.hypot(dx, dy) || 1;
  if (m > max) { dx = (dx / m) * max; dy = (dy / m) * max; }
  joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
  moveX = dx / max; moveY = -dy / max;
}

lookzone.addEventListener('pointerdown', (e) => {
  lookId = e.pointerId; lookzone.setPointerCapture(e.pointerId);
  lookLX = e.clientX; lookLY = e.clientY;
});
lookzone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookId) return;
  lookDx += e.clientX - lookLX;
  lookDy += e.clientY - lookLY;
  lookLX = e.clientX; lookLY = e.clientY;
});
function endLook(e) { if (e.pointerId === lookId) lookId = null; }
lookzone.addEventListener('pointerup', endLook);
lookzone.addEventListener('pointercancel', endLook);

document.getElementById('btnFire').addEventListener('pointerdown', (e) => {
  e.preventDefault(); fireHeld = true; firePressed = true;
});
document.getElementById('btnFire').addEventListener('pointerup', () => { fireHeld = false; });
document.getElementById('btnFire').addEventListener('pointercancel', () => { fireHeld = false; });

document.getElementById('btnStart').addEventListener('click', () => {
  startEl.hidden = true;
  playing = true;
  restart();
  if (!isTouch) canvas.requestPointerLock?.();
  canvas.focus();
  setTimeout(() => hint.classList.add('fade'), 4000);
});
document.getElementById('btnRestart').addEventListener('click', () => {
  restart();
});

// Test hooks (?test=1)
const params = new URLSearchParams(location.search);
if (params.get('test') === '1') {
  window.__ARMY_RANGE_TEST__ = {
    getState: () => ({ shots, hits, playing, targets: targets.map((t) => ({ alive: t.alive, x: t.trooper.root.position.x, z: t.trooper.root.position.z, state: t.state })) }),
    fire: () => tryFire(),
    restart,
    start: () => { startEl.hidden = true; playing = true; restart(); },
  };
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (playing) {
    // look
    yaw -= lookDx * sens;
    pitch -= lookDy * sens;
    pitch = Math.max(-1.35, Math.min(1.35, pitch));
    lookDx = 0; lookDy = 0;

    // move
    let mx = moveX, my = moveY;
    if (!isTouch) {
      mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      my = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const speed = (keys.ShiftLeft || keys.ShiftRight) ? 6.5 : 4.2;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const dx = (mx * c + my * s) * speed * dt;
    const dz = (-mx * s + my * c) * speed * dt;
    const n = collidePlayer(player.x + dx, player.z + dz);
    player.x = n.x; player.z = n.z;

    camera.position.set(player.x, eyeH, player.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    if (firePressed || (fireHeld && muzzleCool <= 0 && !isTouch)) tryFire();
    firePressed = false;
    if (muzzleCool > 0) muzzleCool -= dt;
    if (hitFlash > 0) {
      hitFlash -= dt;
      if (hitFlash <= 0) hitmark.classList.remove('on');
    }

    for (const o of targets) advanceTarget(o, dt);
  }

  fx.update(dt, camera);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
});

// Auto-show start; spawn preview troopers so load validates HQ
spawnAll();
updateHud();
