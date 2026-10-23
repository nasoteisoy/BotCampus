import * as THREE from 'three';
import { createWorld, WORLD, SKY } from './world.js';
import { createBird } from './bird.js';
import { Particles, Ribbon } from './fx.js';
import { Sound } from './audio.js';
import { PoseInput } from './pose.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const STEP = 1 / 60;

// ---------- tuning
const T = {
  sink: -2.6,       // glide sink speed (m/s)
  sinkRate: 0.9,    // how fast vy settles to the glide
  flapImpulse: 6.0, // m/s per flap
  maxVy: 10,
  baseSpeed: 13,
  maxRoll: 0.75,    // rad
  rollRate: 3,
  turnRate: 1.25,   // yaw rad/s per rad of roll
  ceiling: 170,
  groundClear: 1.3,
  bounceVy: 5,
  collectR: 6.5,
};

// ---------- renderer
const DPR_MAX = isTouch ? 2 : 1.5;
let dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
const renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5, powerPreference: 'high-performance' });
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY.clone(), 70, 560);
scene.add(new THREE.HemisphereLight('#fff6e2', '#9db58a', 1.7));
const sun = new THREE.DirectionalLight('#fff0d4', 1.5); sun.position.set(-0.5, 1, 0.35); scene.add(sun);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 2600);

let seed = Number(params.get('seed')) || ((Math.random() * 1e9) | 0);
let world = createWorld(scene, seed);
const bird = createBird(); scene.add(bird.root);
const ribbons = [new Ribbon(scene, 30), new Ribbon(scene, 30)];
const dust = new Particles(scene, 160, false);
const spark = new Particles(scene, 260, false);
const sound = new Sound();

// ---------- state
const S = {
  mode: 'title', x: 0, y: 40, z: 0, vy: 0, speed: T.baseSpeed, yaw: 0, roll: 0, pitch: 0,
  collected: 0, bounces: 0, flaps: 0, time: 0, playTime: 0, winAt: null, edge: false, lastHit: -9, inputMode: 'keys',
};
const input = { left: 0, right: 0, drag: 0, tilt: 0, test: 0, autopilot: false };
let paused = false;
const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), roll: 0 };
const fwd = new THREE.Vector3();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), qW = new THREE.Quaternion();

function nearestAppleYaw() {
  let best = null, bd = 1e9;
  for (const a of world.apples) if (!a.collected) { const d = Math.hypot(a.x - S.x, a.z - S.z); if (d < bd) { bd = d; best = a; } }
  return best ? Math.atan2(-(best.x - S.x), -(best.z - S.z)) : 0;
}
function resetBird() {
  S.x = 0; S.z = 0; S.y = world.height(0, 0) + 30; S.vy = 0; S.speed = T.baseSpeed; S.roll = 0; S.pitch = 0;
  S.yaw = nearestAppleYaw();
  ribbons.forEach((r) => r.reset());
  snapCamera();
}
function snapCamera() {
  fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  cam.pos.set(S.x, S.y, S.z).addScaledVector(fwd, -camDist()).add(v1.set(0, camHeight(), 0));
  cam.look.set(S.x, S.y + 1, S.z).addScaledVector(fwd, 6);
  cam.roll = 0;
  applyCamera();
}
const portrait = () => innerWidth / innerHeight < 0.85;
const camDist = () => (portrait() ? 12.5 : 10.5);
const camHeight = () => (portrait() ? 6 : 5);
function applyCamera() {
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  camera.rotateZ(-cam.roll * 0.3);
}

// ---------- actions
function flap(strength = 1) {
  if (S.mode === 'title') return;
  S.vy = Math.min(S.vy + T.flapImpulse * strength, T.maxVy);
  S.flaps++;
  bird.flap(); sound.flap();
}
function puff(x, y, z) {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * 6.283, s = 2 + Math.random() * 5;
    dust.emit({ x: x + Math.cos(a) * 0.6, y: y + 0.2, z: z + Math.sin(a) * 0.6, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2.5, vz: Math.sin(a) * s, drag: 2.2, grav: 0.6, size: 1.1 + Math.random() * 1.1, grow: 1.6, r: 0.85, g: 0.76, b: 0.6, a: 0.75, max: 1.1 + Math.random() * 0.8 });
  }
}
function sparkle(a) {
  const cols = [[1, 0.42, 0.55], [1, 0.78, 0.25], [1, 0.95, 0.75], [0.95, 0.3, 0.4], [0.55, 0.8, 1]];
  for (let i = 0; i < 60; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * 6.283, r = Math.sqrt(1 - u * u), s = 3 + Math.random() * 7, c = cols[i % 5];
    spark.emit({ x: a.x, y: a.y, z: a.z, vx: r * Math.cos(th) * s, vy: u * s + 2, vz: r * Math.sin(th) * s, drag: 1.6, grav: 1.5, size: 0.45 + Math.random() * 0.5, r: c[0], g: c[1], b: c[2], max: 0.9 + Math.random() * 0.9 });
  }
  for (let i = 0; i < 30; i++) spark.emit({ x: a.x + (Math.random() - 0.5) * 2, y: a.y + Math.random() * 30, z: a.z + (Math.random() - 0.5) * 2, vx: 0, vy: 6 + Math.random() * 8, vz: 0, drag: 0.6, size: 0.6, r: 1, g: 0.5, b: 0.65, max: 1.5 });
}
function collect(a) {
  world.collect(a);
  S.collected++;
  sparkle(a);
  sound.chime(S.collected);
  const c = $('count'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  $('cn').textContent = S.collected;
  if (S.collected >= world.apples.length && S.winAt == null) S.winAt = S.time + 1.6;
}
function showWin() {
  S.mode = 'win';
  const t = Math.round(S.playTime);
  $('wTime').textContent = `⏱️ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('win').classList.remove('hidden'); $('hint').classList.add('hidden');
  sound.win();
}
function newGame(newSeed) {
  if (newSeed != null) {
    seed = newSeed;
    world.dispose();
    world = createWorld(scene, seed);
  }
  S.collected = 0; S.bounces = 0; S.flaps = 0; S.playTime = 0; S.winAt = null;
  $('cn').textContent = '0'; $('ct').textContent = '/' + world.apples.length;
  dust.clear(); spark.clear();
  resetBird();
}
function start() {
  sound.init();
  if (S.mode === 'play') return;
  if (S.mode === 'win') newGame((Math.random() * 1e9) | 0); else newGame();
  S.mode = 'play';
  $('title').classList.add('hidden'); $('win').classList.add('hidden'); $('hud').classList.remove('hidden');
  const h = $('hint'); h.classList.remove('hidden'); h.style.animation = 'none'; void h.offsetWidth; h.style.animation = '';
}

// ---------- simulation step (fixed dt)
function step(dt) {
  S.time += dt;
  const playing = S.mode === 'play';
  if (playing) S.playTime += dt;
  let bankIn = input.right - input.left + input.drag + input.tilt + input.test;
  const poseFresh = pose.active && performance.now() - pose.outT < 300;
  if (poseFresh) bankIn += pose.out.bank;
  const gh0 = world.height(S.x, S.z);
  if (S.mode !== 'play' || input.autopilot) { // title / win: lazy circles
    bankIn = 0.3;
    if (S.y - gh0 < 22 && !bird.flapping && Math.random() < 0.05) { S.vy = Math.min(S.vy + T.flapImpulse, T.maxVy); bird.flap(); }
  }
  bankIn = clamp(bankIn, -1, 1);
  if (poseFresh && playing) S.vy = Math.min(S.vy + pose.out.lift * dt, T.maxVy);

  S.roll += (bankIn * T.maxRoll - S.roll) * (1 - Math.exp(-T.rollRate * dt));
  S.yaw = wrap(S.yaw - S.roll * T.turnRate * dt);
  // soft invisible edge: steer back toward the middle
  const r = Math.hypot(S.x, S.z);
  S.edge = r > WORLD.SOFT;
  if (S.edge) {
    const k = ((r - WORLD.SOFT) / (WORLD.HALF - WORLD.SOFT)) * 2.2;
    S.yaw = wrap(S.yaw + wrap(Math.atan2(S.x, S.z) - S.yaw) * (1 - Math.exp(-k * dt)));
  }
  S.vy += (T.sink - S.vy) * (1 - Math.exp(-T.sinkRate * dt));
  if (S.y > T.ceiling) S.vy -= (S.y - T.ceiling) * 0.5 * dt;
  const tgt = T.baseSpeed + clamp(-S.vy - 1, 0, 6) * 0.6;
  S.speed += (tgt - S.speed) * (1 - Math.exp(-0.6 * dt));
  S.x += -Math.sin(S.yaw) * S.speed * dt;
  S.z += -Math.cos(S.yaw) * S.speed * dt;
  S.y += S.vy * dt;
  const r2 = Math.hypot(S.x, S.z);
  if (r2 > WORLD.HALF) { S.x *= WORLD.HALF / r2; S.z *= WORLD.HALF / r2; }
  // ground: dust puff + gentle bounce, never game over
  const gh = world.height(S.x, S.z);
  if (S.y < gh + T.groundClear) {
    S.y = gh + T.groundClear;
    if (S.time - S.lastHit > 0.25) {
      S.vy = Math.max(-S.vy * 0.35, 0) + T.bounceVy;
      S.lastHit = S.time;
      if (playing) { S.bounces++; sound.thump(); }
      puff(S.x, gh, S.z);
    } else S.vy = Math.max(S.vy, 3);
  }
  // apples: fly through the beam
  if (playing) for (const a of world.apples) {
    if (a.collected) continue;
    const dx = a.x - S.x, dz = a.z - S.z;
    if (dx * dx + dz * dz < T.collectR * T.collectR && S.y > a.y - 4 && S.y < a.y + WORLD.BEAM_H) collect(a);
  }
  if (playing && S.winAt != null && S.time >= S.winAt) showWin();

  // ---- visuals
  S.pitch += (clamp(S.vy * 0.06, -0.35, 0.4) - S.pitch) * (1 - Math.exp(-4 * dt));
  bird.root.position.set(S.x, S.y, S.z);
  bird.root.rotation.y = S.yaw;
  bird.update(dt, S.roll, S.pitch);
  bird.root.updateMatrixWorld(true);
  bird.body.getWorldQuaternion(qW);
  v2.set(1, 0, 0).applyQuaternion(qW);
  bird.tips.forEach((tip, i) => { tip.getWorldPosition(v1); ribbons[i].push(v1, v2); ribbons[i].update(); });
  dust.update(dt); spark.update(dt);
  world.update(S.time, dt);
  // trailing camera with heavy smoothing
  fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  v1.set(S.x, S.y, S.z).addScaledVector(fwd, -camDist()); v1.y += camHeight();
  v1.y = Math.max(v1.y, world.height(v1.x, v1.z) + 2);
  cam.pos.lerp(v1, 1 - Math.exp(-2.2 * dt));
  v2.set(S.x, S.y + 1, S.z).addScaledVector(fwd, 6);
  cam.look.lerp(v2, 1 - Math.exp(-4 * dt));
  cam.roll += (S.roll - cam.roll) * (1 - Math.exp(-2 * dt));
  applyCamera();
}

// ---------- pose / camera mode
const pose = new PoseInput({
  box: $('camBox'), video: $('camVid'), canvas: $('camCv'), status: $('camSt'),
  onStatus: (s) => { $('mCam').classList.toggle('bad', s === 'denied' || s === 'nomodel'); if (s === 'denied') setMode('keys'); },
});
function setMode(m) {
  S.inputMode = m;
  for (const b of document.querySelectorAll('.mb')) b.classList.toggle('on', b.dataset.mode === m);
}
async function toggleCamera() {
  sound.init();
  if (pose.active) { pose.stop(); setMode('keys'); return; }
  setMode('cam');
  await pose.start();
}
let tiltOn = false;
function onTilt(e) {
  if (e.gamma == null) return;
  const ang = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
  let t = ang === 90 ? e.beta : ang === 270 || ang === -90 ? -e.beta : e.gamma;
  t = Math.abs(t) < 3 ? 0 : t - Math.sign(t) * 3;
  input.tilt = clamp(t / 22, -1, 1);
}
async function toggleTilt() {
  sound.init();
  if (tiltOn) { tiltOn = false; input.tilt = 0; removeEventListener('deviceorientation', onTilt); setMode('keys'); return; }
  try {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) throw new Error('no tilt');
    if (typeof DOE.requestPermission === 'function') { const r = await DOE.requestPermission(); if (r !== 'granted') throw new Error('denied'); }
    addEventListener('deviceorientation', onTilt);
    tiltOn = true; $('mTilt').classList.remove('bad');
    if (pose.active) pose.stop();
    setMode('tilt');
  } catch (e) { $('mTilt').classList.add('bad'); setMode('keys'); }
}

// ---------- input wiring
const keysBtn = $('mKeys');
keysBtn.textContent = isTouch ? '👆' : '⌨️';
if (isTouch) {
  $('mTilt').classList.remove('hidden');
  $('hFlap').textContent = '👆'; $('hFlap').classList.remove('key'); $('hBank').textContent = '↔️';
  $('howFlap').textContent = '👆 = 🪽'; $('howBank').textContent = '👆↔️ / 📱 = ↩️↪️';
}
$('mCam').addEventListener('click', toggleCamera);
$('mTilt').addEventListener('click', toggleTilt);
keysBtn.addEventListener('click', () => { sound.init(); if (pose.active) pose.stop(); if (tiltOn) toggleTilt(); setMode('keys'); });
const muteBtn = $('muteBtn');
const syncMute = () => (muteBtn.textContent = sound.muted ? '🔇' : '🔊');
syncMute();
muteBtn.addEventListener('click', () => { sound.init(); sound.setMuted(!sound.muted); syncMute(); });
$('playBtn').addEventListener('click', start);
$('replayBtn').addEventListener('click', start);

const KEYMAP = { Space: 'flap', KeyW: 'flap', ArrowUp: 'flap', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (k || e.code === 'Enter') e.preventDefault();
  if (e.code === 'KeyM') { muteBtn.click(); return; }
  if (S.mode !== 'play') { if (k === 'flap' || e.code === 'Enter') start(); return; }
  if (k === 'flap' && !e.repeat) flap();
  if (k === 'left') input.left = 1;
  if (k === 'right') input.right = 1;
});
addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k === 'left') input.left = 0;
  if (k === 'right') input.right = 0;
});
addEventListener('blur', () => { input.left = input.right = input.drag = 0; });
// pointer: tap/click = flap, hold + drag sideways = bank
const drag = { id: null, x0: 0 };
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => {
  if (S.mode !== 'play') return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  sound.init();
  flap();
  if (drag.id == null) { drag.id = e.pointerId; drag.x0 = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (_) {} }
});
cv.addEventListener('pointermove', (e) => {
  if (e.pointerId !== drag.id) return;
  input.drag = clamp((e.clientX - drag.x0) / (Math.min(innerWidth, 900) * 0.22), -1, 1);
});
const endDrag = (e) => { if (e.pointerId === drag.id) { drag.id = null; input.drag = 0; } };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (sound.ctx) document.hidden ? sound.ctx.suspend() : sound.ctx.resume(); });

// ---------- resize / perf
const noAdapt = params.has('noadapt');
function resize() {
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = portrait() ? 72 : 60;
  camera.updateProjectionMatrix();
  const sc = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  dust.mat.uniforms.uScale.value = spark.mat.uniforms.uScale.value = sc;
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

const perf = { fps: 0, frameMs: 0, dpr, calls: 0, triangles: 0, frames: 0 };
let fpsAcc = 0, fpsN = 0, lowStreak = 0;

// ---------- main loop
let last = performance.now(), acc = 0;
resetBird();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const po = pose.tick(now);
  if (po && po.flap && S.mode === 'play') { bird.flap(); sound.flap(); S.flaps++; }
  if (!paused) { acc += dt; let n = 0; while (acc >= STEP && n++ < 6) { step(STEP); acc -= STEP; } if (n >= 6) acc = 0; }
  $('edge').classList.toggle('hidden', !(S.edge && S.mode === 'play'));
  sound.wind(S.speed, S.vy);
  renderer.render(scene, camera);
  perf.calls = renderer.info.render.calls; perf.triangles = renderer.info.render.triangles; perf.frames++;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 2) {
    perf.fps = Math.round(fpsN / fpsAcc); perf.frameMs = +((fpsAcc / fpsN) * 1000).toFixed(1);
    if (!noAdapt && perf.fps < 45 && dpr > 1) { if (++lowStreak >= 1) { dpr = Math.max(1, dpr - 0.25); perf.dpr = dpr; resize(); lowStreak = 0; } }
    else lowStreak = 0;
    fpsAcc = 0; fpsN = 0;
  }
}
requestAnimationFrame(frame);

// ---------- test hooks
window.__game = {
  get state() {
    return {
      mode: S.mode, x: S.x, y: S.y, z: S.z, alt: S.y - world.height(S.x, S.z), vy: S.vy, speed: S.speed, yaw: S.yaw, roll: S.roll,
      collected: S.collected, total: world.apples.length, bounces: S.bounces, flaps: S.flaps, seed, time: S.time, playTime: S.playTime,
      inputMode: S.inputMode, edge: S.edge, gameOver: false, paused,
    };
  },
  get apples() { return world.apples.map((a) => ({ x: a.x, y: a.y, z: a.z, collected: a.collected })); },
  get perf() { return { ...perf, dpr, trees: world.trees, foliage: world.foliage }; },
  get pose() { return { active: pose.active, status: pose.status, frames: pose.frames, out: pose.out }; },
  start, flap,
  bank(x) { input.test = clamp(+x || 0, -1, 1); },
  simulate(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) step(STEP); return this.state; },
  setPaused(p) { paused = !!p; acc = 0; },
  setBird(o) { Object.assign(S, o); snapCamera(); ribbons.forEach((r) => r.reset()); },
  height: (x, z) => world.height(x, z),
  replay: (s) => { S.mode = 'win'; start(); if (s != null) newGame(s); },
  toggleCamera, setMode,
  snapCamera,
};
