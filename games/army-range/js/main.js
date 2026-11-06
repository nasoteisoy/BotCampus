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

// Bright daytime yard (Chumi: don't make it dark)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec7f0);
scene.fog = new THREE.Fog(0xb9d9f2, 42, 95);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.08, 120);
camera.position.set(0, 2.2, 11);

const hemi = new THREE.HemisphereLight(0xfff2d6, 0x7a9a55, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e0, 1.55);
sun.position.set(10, 22, 8);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(48, 48),
  new THREE.MeshStandardMaterial({ color: 0xc9b896, roughness: 0.92 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(40, 40, 0xa89870, 0xb8a878);
grid.position.y = 0.02;
scene.add(grid);

const walls = [];
const wallMeshes = [];
function addWall(x, z, w, d) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, 1.5, d),
    new THREE.MeshStandardMaterial({ color: 0xe4ddd0, roughness: 0.82 })
  );
  m.position.set(x, 0.75, z);
  m.userData.cover = true;
  scene.add(m);
  wallMeshes.push(m);
  walls.push({
    minX: x - w / 2 - 0.35, maxX: x + w / 2 + 0.35,
    minZ: z - d / 2 - 0.35, maxZ: z + d / 2 + 0.35,
    mesh: m,
  });
}
addWall(-12, 0, 1, 24);
addWall(12, 0, 1, 24);
addWall(0, -12, 24, 1);
addWall(0, 12, 24, 1);
addWall(-4, -2, 4, 0.6);
addWall(5, 3, 0.6, 5);

const fx = new FX(scene);

// ---- player (visible HQ trooper) ----
const keys = Object.create(null);
let yaw = 0;
let pitch = 0.12; // slight downward look default
let moveX = 0, moveY = 0;
let lookDx = 0, lookDy = 0;
let fireHeld = false, firePressed = false;
let playing = false, pointerLocked = false;
let ignoreFireUntil = 0;
const sens = isTouch ? 0.0032 : 0.0022;
const player = { x: 0, z: 8 };
let playerTrooper = null;
let playerPose = 'idle';
let playerPoseT = 0;
// Adventure body heading (HQ root.rotation.y). Not locked to camera look.
let bodyYaw = Math.PI;
const BODY_TURN_RATE = 12; // exp approach; Opsive Adventure turn-to-travel
let shootPoseLeft = 0;
let shots = 0, hits = 0;
let hitFlash = 0;
let muzzleCool = 0;

// OTS camera (Battlefront-style): behind + right shoulder so body sits left of reticle
// camera-systems: pitch clamp, exp follow after move, spring-arm wall pull-in
const CAM_DIST = 3.35;
const CAM_HEIGHT = 1.58;
const SHOULDER_R = 0.62;
const LOOK_H = 1.38;
const PITCH_MIN = THREE.MathUtils.degToRad(-70);
const PITCH_MAX = THREE.MathUtils.degToRad(42);
const POS_RATE = 12.5;
// HQ trooper rest forward is +Z; lookDir at yaw=0 is -Z → offset π so back faces camera
const BODY_YAW_OFFSET = Math.PI;
/** Shortest signed angle delta into (-π, π]. */
function shortestAngleDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function approachYaw(from, to, dt, rate) {
  const t = 1 - Math.exp(-rate * dt);
  return from + shortestAngleDelta(from, to) * t;
}

const camPos = new THREE.Vector3(0, 2.2, 11);
const _lookDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _ideal = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _aimPt = new THREE.Vector3();
const _from = new THREE.Vector3();
const _dir = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

function updateHud() {
  hitsEl.textContent = String(hits);
  shotsEl.textContent = String(shots);
  accEl.textContent = shots ? Math.round((100 * hits) / shots) + '%' : '—';
}

function spawnPlayer() {
  if (playerTrooper) {
    disposeHqTrooper(playerTrooper);
    playerTrooper = null;
  }
  playerTrooper = createHqTrooper({ side: 'attacker', cls: 'rifle' });
  playerTrooper.root.position.set(player.x, 0, player.z);
  bodyYaw = yaw + BODY_YAW_OFFSET;
  playerTrooper.root.rotation.y = bodyYaw;
  scene.add(playerTrooper.root);
  playerPose = 'idle';
  playerPoseT = 0;
  poseTrooper(playerTrooper, 'idle', 0, 0.016);
  playerTrooper.root.rotation.y = bodyYaw;
}

// Targets
const targets = [];
const PATHS = [
  { pts: [new THREE.Vector3(-6, 0, -4), new THREE.Vector3(6, 0, -4), new THREE.Vector3(6, 0, 4), new THREE.Vector3(-6, 0, 4)], speed: 2.2, side: 'defender' },
  { pts: [new THREE.Vector3(8, 0, -6), new THREE.Vector3(8, 0, 6)], speed: 1.8, side: 'defender' },
  { pts: [new THREE.Vector3(-8, 0, 5), new THREE.Vector3(-2, 0, -6), new THREE.Vector3(-8, 0, -3)], speed: 2.4, side: 'defender' },
  { pts: [new THREE.Vector3(0, 0, -8), new THREE.Vector3(4, 0, -2), new THREE.Vector3(-4, 0, -2)], speed: 1.6, side: 'defender' },
];

function spawnTarget(cfg, i) {
  const t = createHqTrooper({ side: cfg.side, cls: 'rifle' });
  const start = cfg.pts[0];
  t.root.position.set(start.x, 0, start.z);
  scene.add(t.root);
  const obj = {
    id: i, trooper: t, pts: cfg.pts, seg: 0, u: 0,
    speed: cfg.speed, alive: true, state: 'run', stateT: 0, hitR: 0.72,
  };
  targets.push(obj);
  poseTrooper(t, 'run', 0, 0.016);
  return obj;
}

function clearTargets() {
  for (const o of targets) disposeHqTrooper(o.trooper);
  targets.length = 0;
}

function spawnAll() {
  clearTargets();
  PATHS.forEach((p, i) => spawnTarget(p, i));
  spawnPlayer();
}

function advanceTarget(o, dt) {
  if (!o.alive) {
    o.stateT += dt;
    poseTrooper(o.trooper, 'die', o.stateT, dt);
    if (o.stateT > 2.8) {
      o.alive = true; o.state = 'run'; o.stateT = 0; o.seg = 0; o.u = 0;
      const p = o.pts[0];
      o.trooper.root.position.set(p.x, 0, p.z);
      o.trooper.root.visible = true;
      poseTrooper(o.trooper, 'run', 0, dt);
    }
    return;
  }
  const a2 = o.pts[o.seg];
  const b2 = o.pts[(o.seg + 1) % o.pts.length];
  const dx = b2.x - a2.x, dz = b2.z - a2.z;
  const len = Math.hypot(dx, dz) || 1;
  o.u += (o.speed * dt) / len;
  if (o.u >= 1) { o.u -= 1; o.seg = (o.seg + 1) % o.pts.length; }
  const a = o.pts[o.seg];
  const b = o.pts[(o.seg + 1) % o.pts.length];
  o.trooper.root.position.x = a.x + (b.x - a.x) * o.u;
  o.trooper.root.position.z = a.z + (b.z - a.z) * o.u;
  o.trooper.root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
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
  return {
    x: Math.max(-11.2, Math.min(11.2, x)),
    z: Math.max(-11.2, Math.min(11.2, z)),
  };
}

function lookBasis() {
  // Match three.js YXZ camera: forward & right on XZ with pitch
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  _lookDir.set(-sy * cp, sp, -cy * cp).normalize();
  _right.set(cy, 0, -sy).normalize();
}

function updateCamera(dt, hard = false) {
  lookBasis();
  _pivot.set(player.x, LOOK_H, player.z);
  // Ideal: behind along -look (flattened) + right shoulder + height
  _ideal.copy(_pivot)
    .addScaledVector(_lookDir, -CAM_DIST)
    .addScaledVector(_right, SHOULDER_R);
  // shoulder height; pitch lifts/lowers slightly without flipping
  _ideal.y = CAM_HEIGHT + (-pitch) * 0.45;

  // Spring-arm wall / cover pull-in (camera-systems §4 / pitfalls)
  _from.copy(_pivot);
  _dir.copy(_ideal).sub(_from);
  const wantDist = _dir.length();
  if (wantDist > 1e-4) {
    _dir.multiplyScalar(1 / wantDist);
    raycaster.set(_from, _dir);
    raycaster.far = wantDist;
    const hitsWall = raycaster.intersectObjects(wallMeshes, false);
    let dist = wantDist;
    if (hitsWall.length) dist = Math.max(0.45, hitsWall[0].distance - 0.18);
    _ideal.copy(_from).addScaledVector(_dir, dist);
  }
  // Ground clamp
  if (_ideal.y < 0.45) _ideal.y = 0.45;

  if (hard) camPos.copy(_ideal);
  else {
    const t = 1 - Math.exp(-POS_RATE * dt);
    camPos.lerp(_ideal, t);
  }
  camera.position.copy(camPos);
  // Look through reticle: aim point ahead of pivot so body stays left of center
  _aimPt.copy(_pivot).addScaledVector(_lookDir, 12);
  camera.up.set(0, 1, 0);
  camera.lookAt(_aimPt);
}

function getMuzzleWorld(out) {
  const rig = playerTrooper?.rig;
  if (rig) {
    try {
      rig.world('muzzle', 0, out);
      return out;
    } catch (_) { /* fall through */ }
  }
  lookBasis();
  return out.set(player.x, 1.35, player.z).addScaledVector(_lookDir, 0.55).addScaledVector(_right, 0.15);
}

function coverBlocks(from, to) {
  _dir.copy(to).sub(from);
  const dist = _dir.length();
  if (dist < 0.05) return true;
  _dir.multiplyScalar(1 / dist);
  raycaster.set(from, _dir);
  raycaster.far = dist - 0.05;
  return raycaster.intersectObjects(wallMeshes, false).length > 0;
}

function tryFire() {
  if (!playing || muzzleCool > 0) return;
  if (performance.now() < ignoreFireUntil) return;
  muzzleCool = 0.18;
  shots += 1;
  updateHud();
  shootPoseLeft = 0.35;
  playerPose = 'shoot';
  playerPoseT = 0;

  lookBasis();
  _pivot.set(player.x, LOOK_H, player.z);
  // Centre-reticle aim from camera
  camera.getWorldDirection(_dir);
  raycaster.set(camera.position, _dir);
  raycaster.far = 50;
  const coverHit = raycaster.intersectObjects(wallMeshes, false);
  if (coverHit.length) _aimPt.copy(coverHit[0].point);
  else _aimPt.copy(camera.position).addScaledVector(_dir, 40);

  getMuzzleWorld(_muzzle);
  // Muzzle → aim convergence
  _dir.copy(_aimPt).sub(_muzzle).normalize();
  fx.muzzle(_muzzle, _dir, 0xffd27a, 0.85);

  // Blocked by cover between muzzle and aim?
  const blocked = coverBlocks(_muzzle, _aimPt);

  let best = null, bestD = 40;
  if (!blocked) {
    for (const o of targets) {
      if (!o.alive) continue;
      // exclude self (player is not in targets, but skip if same root)
      if (playerTrooper && o.trooper.root === playerTrooper.root) continue;
      const p = o.trooper.root.position;
      const center = _tmp.set(p.x, 1.1, p.z);
      const to = center.clone().sub(_muzzle);
      const t = to.dot(_dir);
      if (t < 0.4 || t > bestD) continue;
      const closest = _muzzle.clone().addScaledVector(_dir, t);
      if (closest.distanceTo(center) <= o.hitR) {
        // also ensure cover doesn't sit between muzzle and target
        if (coverBlocks(_muzzle, center)) continue;
        best = o; bestD = t;
      }
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
    fireFx(scene, playerTrooper, hp);
    hitmark.hidden = false;
    hitmark.classList.add('on');
    hitFlash = 0.12;
  } else {
    fx.tracer(_muzzle, _aimPt, 0xffe08a, 0.08, 0.025);
  }
}

function restart() {
  shots = 0; hits = 0; updateHud();
  player.x = 0; player.z = 8;
  yaw = 0; pitch = 0.12;
  bodyYaw = Math.PI;
  shootPoseLeft = 0;
  ignoreFireUntil = performance.now() + 350;
  fireHeld = false; firePressed = false;
  spawnAll();
  updateCamera(1 / 60, true);
}

function isUiEventTarget(t) {
  return !!(t && t.closest && t.closest('button, #start, #hud button, #btnRestart, #btnStart, #btnFire'));
}

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
  if (e.button !== 0) return;
  if (isUiEventTarget(e.target)) return; // restart/start must not fire
  if (!pointerLocked) return; // only shoot while locked (fixes restart-click-fires)
  fireHeld = true; firePressed = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) fireHeld = false;
});

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
  e.preventDefault(); e.stopPropagation();
  fireHeld = true; firePressed = true;
});
document.getElementById('btnFire').addEventListener('pointerup', () => { fireHeld = false; });
document.getElementById('btnFire').addEventListener('pointercancel', () => { fireHeld = false; });

document.getElementById('btnStart').addEventListener('click', (e) => {
  e.stopPropagation();
  startEl.hidden = true;
  playing = true;
  ignoreFireUntil = performance.now() + 350;
  restart();
  if (!isTouch) canvas.requestPointerLock?.();
  canvas.focus();
  setTimeout(() => hint.classList.add('fade'), 4000);
});
document.getElementById('btnRestart').addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  ignoreFireUntil = performance.now() + 400;
  fireHeld = false; firePressed = false;
  restart();
});

const params = new URLSearchParams(location.search);
if (params.get('test') === '1') {
  window.__ARMY_RANGE_TEST__ = {
    getState: () => ({
      shots, hits, playing,
      yaw, pitch,
      player: { x: player.x, z: player.z, pose: playerPose },
      cam: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      targets: targets.map((t) => ({
        alive: t.alive,
        x: t.trooper.root.position.x,
        z: t.trooper.root.position.z,
        state: t.state,
      })),
    }),
    fire: () => tryFire(),
    restart,
    start: () => {
      startEl.hidden = true; playing = true;
      ignoreFireUntil = 0; restart();
    },
    setLook: (y, p) => {
      // Adventure: camera orbit must not turn the body
      yaw = y;
      pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, p));
      if (playerTrooper) playerTrooper.root.updateMatrixWorld(true);
      updateCamera(1 / 30, true);
    },
    walkForward: (dist = 2) => {
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      const wx = -sy * dist, wz = -cy * dist;
      const n = collidePlayer(player.x + wx, player.z + wz);
      player.x = n.x; player.z = n.z;
      bodyYaw = Math.atan2(wx, wz);
      if (playerTrooper) {
        playerTrooper.root.position.x = player.x;
        playerTrooper.root.position.z = player.z;
        playerTrooper.root.rotation.y = bodyYaw;
        playerPose = 'run'; playerPoseT = 0.2;
        poseTrooper(playerTrooper, 'run', playerPoseT, 0.05);
        playerTrooper.root.rotation.y = bodyYaw;
        playerTrooper.root.updateMatrixWorld(true);
      }
      updateCamera(1 / 30, true);
    },
    setPlayerPos: (x, z, faceYaw = null) => {
      player.x = x; player.z = z;
      if (faceYaw != null) bodyYaw = faceYaw;
      if (playerTrooper) {
        playerTrooper.root.position.x = player.x;
        playerTrooper.root.position.z = player.z;
        playerTrooper.root.rotation.y = bodyYaw;
        playerTrooper.root.updateMatrixWorld(true);
      }
      updateCamera(1 / 30, true);
    },

    /** Live scene orientation (actual playerTrooper), not a rebuilt probe. */
    getOrient: () => {
      if (!playerTrooper) return null;
      lookBasis();
      playerTrooper.root.updateMatrixWorld(true);
      const q = new THREE.Quaternion();
      playerTrooper.root.getWorldQuaternion(q);
      const localFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
      const muzzle = new THREE.Vector3();
      const chest = new THREE.Vector3();
      try { playerTrooper.rig.world('muzzle', 0, muzzle); } catch (_) { muzzle.set(player.x, 1.35, player.z); }
      try { playerTrooper.rig.world('chest', 0, chest); } catch (_) { chest.set(player.x, 1.2, player.z); }
      const rifleDir = muzzle.clone().sub(chest).normalize();
      const piv = new THREE.Vector3(player.x, LOOK_H, player.z);
      const cam = camera.position.clone();
      const camFromPivot = cam.clone().sub(piv);
      const lookFlat = _lookDir.clone().setY(0).normalize();
      const fwdFlat = localFwd.clone().setY(0).normalize();
      const rifleFlat = rifleDir.clone().setY(0).normalize();
      const camFlat = camFromPivot.clone().setY(0).normalize();
      const camToPlayer = piv.clone().sub(cam).setY(0).normalize();
      const behindDot = camFlat.dot(lookFlat);
      const fwdDotLook = fwdFlat.dot(lookFlat);
      const fwdDotCam = fwdFlat.dot(camToPlayer);
      const rifleDotLook = rifleFlat.dot(lookFlat);
      const rifleDotCam = rifleFlat.dot(camToPlayer);
      return {
        yaw, pitch, bodyYaw, bodyYawOffset: BODY_YAW_OFFSET,
        lookDir: [_lookDir.x, _lookDir.y, _lookDir.z],
        localFwd: [localFwd.x, localFwd.y, localFwd.z],
        rifleDir: [rifleDir.x, rifleDir.y, rifleDir.z],
        muzzle: [muzzle.x, muzzle.y, muzzle.z],
        cam: [cam.x, cam.y, cam.z],
        behindDot, fwdDotLook, fwdDotCam, rifleDotLook, rifleDotCam,
        // camToPlayer = cam→pivot. Back to camera ⇒ forward aligns with that (+), front to camera ⇒ opposite (−).
        camIsBehindLook: behindDot < -0.3,
        backTowardCamera: fwdDotLook > 0.5 && fwdDotCam > 0.5,
        rifleTowardReticle: rifleDotLook > 0.35 && rifleDotCam > 0.25,
      };
    },
  };
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (playing) {
    yaw -= lookDx * sens;
    pitch -= lookDy * sens;
    pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch));
    lookDx = 0; lookDy = 0;

    let mx = moveX, my = moveY;
    if (!isTouch) {
      mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      my = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    }
    const mlen = Math.hypot(mx, my);
    if (mlen > 1) { mx /= mlen; my /= mlen; }
    const moving = mlen > 0.12;
    const speed = (keys.ShiftLeft || keys.ShiftRight) ? 6.2 : 4.0;
    const s = Math.sin(yaw), c = Math.cos(yaw);
    // camera-relative intent (Opsive Adventure): travel relative to look, body turns into travel
    const moveWx = c * mx - s * my;
    const moveWz = -s * mx - c * my;
    const dx = moveWx * speed * dt;
    const dz = moveWz * speed * dt;
    const n = collidePlayer(player.x + dx, player.z + dz);
    player.x = n.x; player.z = n.z;

    const aimingFire = shootPoseLeft > 0 || fireHeld;
    if (aimingFire) {
      // Face reticle for muzzle alignment. HQ has no strafe clips — use shoot pose (not forward run)
      // while firing so A/D+fire does not moonwalk. Lateral slide without run gait is a documented limit.
      bodyYaw = approachYaw(bodyYaw, yaw + BODY_YAW_OFFSET, dt, BODY_TURN_RATE * 1.4);
    } else if (moving) {
      // Adventure: turn body toward camera-relative travel; HQ +Z forward = atan2(wx,wz)
      const want = Math.atan2(moveWx, moveWz);
      bodyYaw = approachYaw(bodyYaw, want, dt, BODY_TURN_RATE);
    }
    // else idle: keep bodyYaw; camera orbit alone does not turn body

    if (playerTrooper) {
      playerTrooper.root.position.x = player.x;
      playerTrooper.root.position.z = player.z;
      playerTrooper.root.rotation.y = bodyYaw;
      playerPoseT += dt;
      if (aimingFire) {
        if (shootPoseLeft > 0) shootPoseLeft -= dt;
        if (playerPose !== 'shoot') { playerPose = 'shoot'; playerPoseT = 0; }
        poseTrooper(playerTrooper, 'shoot', playerPoseT, dt);
        playerTrooper.root.rotation.y = bodyYaw;
      } else if (moving) {
        if (playerPose !== 'run') { playerPose = 'run'; playerPoseT = 0; }
        poseTrooper(playerTrooper, 'run', playerPoseT, dt);
        playerTrooper.root.rotation.y = bodyYaw;
      } else {
        if (playerPose !== 'idle') { playerPose = 'idle'; playerPoseT = 0; }
        poseTrooper(playerTrooper, 'idle', playerPoseT, dt);
        playerTrooper.root.rotation.y = bodyYaw;
      }
    }

    // Camera AFTER movement (camera-systems §7)
    updateCamera(dt, false);

    if (firePressed || (fireHeld && muzzleCool <= 0 && !isTouch && pointerLocked)) tryFire();
    firePressed = false;
    if (muzzleCool > 0) muzzleCool -= dt;
    if (hitFlash > 0) {
      hitFlash -= dt;
      if (hitFlash <= 0) hitmark.classList.remove('on');
    }

    for (const o of targets) advanceTarget(o, dt);
  } else if (playerTrooper) {
    // preview idle on start screen
    playerPoseT += dt;
    poseTrooper(playerTrooper, 'idle', playerPoseT, dt);
    for (const o of targets) advanceTarget(o, dt);
    updateCamera(dt, false);
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

spawnAll();
updateCamera(1 / 60, true);
updateHud();
if (hint) {
  hint.textContent = 'Third-person · WASD / stick move · look · Fire · Restart';
}
