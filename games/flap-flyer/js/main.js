import * as THREE from 'three';
import { createWorld, WORLD, SKY } from './world.js';
import { createBird } from './bird.js';
import { Particles, Ribbon } from './fx.js';
import { Sound } from './audio.js';
import { PoseInput } from './pose.js';
import { layoutViewports, screenOrder, PLAYER_COLORS, MAX_PLAYERS } from './multi.js';
import { BodyMenu } from './menu.js';
import { startDemos, MOVES } from './demo.js';
import { Practice } from './practice.js';
import { CHASE, ZKEY, loadZoom } from './chase.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const STEP = 1 / 60;
const GAP = 4; // px divider between split-screen tiles

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
// per-view quality by number of views (one renderer, several scissored viewports)
const VIEWQ = {
  1: { fogNear: 70, fogFar: 560, treeDist: Infinity, lowDetail: false, dprCap: 2 },
  2: { fogNear: 55, fogFar: 420, treeDist: 380, lowDetail: isTouch, dprCap: 2 },
  3: { fogNear: 40, fogFar: 330, treeDist: 290, lowDetail: true, dprCap: 1.5 },
  4: { fogNear: 40, fogFar: 330, treeDist: 290, lowDetail: true, dprCap: 1.5 },
};

// ---------- renderer
const DPR_MAX = isTouch ? 2 : 1.5;
let dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
const renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5, powerPreference: 'high-performance' });
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY.clone(), 70, 560);
scene.add(new THREE.HemisphereLight('#fff6e2', '#9db58a', 1.7));
const sun = new THREE.DirectionalLight('#fff0d4', 1.5); sun.position.set(-0.5, 1, 0.35); scene.add(sun);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 2600);

let seed = Number(params.get('seed')) || ((Math.random() * 1e9) | 0);
let world = createWorld(scene, seed);
const dust = new Particles(scene, 220, false);
const spark = new Particles(scene, 320, false);
const sound = new Sound();

// ---------- global game state
const G = { mode: 'title', time: 0, playTime: 0, winAt: null, inputMode: 'keys' };
const input = { tilt: 0, autopilot: false };
let paused = false;
const fwd = new THREE.Vector3();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), qW = new THREE.Quaternion();

// ---------- players (4 slots, created once; only "on" ones fly / get a screen)
const markerGeo = new THREE.OctahedronGeometry(0.7, 0);
const tilesEl = $('tiles');
function makePlayer(slot) {
  const col = PLAYER_COLORS[slot];
  const bird = createBird(col); scene.add(bird.root); bird.root.visible = false;
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: col.css, fog: false }));
  marker.visible = false; scene.add(marker);
  const rc = slot === 0 ? '#9fd3f5' : new THREE.Color(col.tip).lerp(new THREE.Color('#ffffff'), 0.45).getStyle();
  const ribbons = [new Ribbon(scene, 30, rc), new Ribbon(scene, 30, rc)];
  ribbons.forEach((r) => (r.mesh.visible = false));
  const tile = document.createElement('div');
  tile.className = 'tile hidden'; tile.dataset.slot = slot; tile.style.setProperty('--c', col.css);
  tile.innerHTML = `<div class="badge"><span class="bn">${slot + 1}</span><span class="bc">🍎<b>0</b></span></div><div class="away">🙈</div><div class="tedge">↩️</div>`;
  tilesEl.appendChild(tile);
  return {
    slot, col, bird, marker, ribbons, tile, tileCount: tile.querySelector('.bc b'),
    S: { x: 0, y: 40, z: 0, vy: 0, speed: T.baseSpeed, yaw: 0, roll: 0, pitch: 0, collected: 0, bounces: 0, flaps: 0, edge: false, lastHit: -9 },
    in: { left: 0, right: 0, drag: 0, test: 0 },
    cam: { pos: new THREE.Vector3(), look: new THREE.Vector3(), roll: 0 },
    on: false, away: false, ever: false, aspect: innerWidth / innerHeight,
  };
}
const players = Array.from({ length: MAX_PLAYERS }, (_, i) => makePlayer(i));
let order = [];          // slots shown on screen, in tile order
let layout = layoutViewports(1, innerWidth, innerHeight, GAP);
const onPlayers = () => order.map((s) => players[s]);
const primary = () => players[order[0] ?? 0];

function nearestAppleYaw(S) {
  let best = null, bd = 1e9;
  for (const a of world.apples) if (!a.collected) { const d = Math.hypot(a.x - S.x, a.z - S.z); if (d < bd) { bd = d; best = a; } }
  return best ? Math.atan2(-(best.x - S.x), -(best.z - S.z)) : 0;
}
function resetBird(p, k = 0, n = 1) {
  const S = p.S;
  // start side by side, 9 m apart, all facing the nearest apple
  S.x = 0; S.z = 0; S.yaw = nearestAppleYaw(S);
  const off = (k - (n - 1) / 2) * 9;
  S.x = Math.cos(S.yaw) * off; S.z = -Math.sin(S.yaw) * off;
  S.y = world.height(S.x, S.z) + 30; S.vy = 0; S.speed = T.baseSpeed; S.roll = 0; S.pitch = 0;
  p.ribbons.forEach((r) => r.reset());
  snapCamera(p);
}
function leaderOf(except) {
  let best = null;
  for (const q of players) {
    if (q === except || !q.on) continue;
    if (!best || q.S.collected > best.S.collected) best = q;
  }
  if (best) return best;
  for (const q of players) if (q !== except && q.ever && (!best || q.S.collected > best.S.collected)) best = q;
  return best;
}
// someone joins mid-game: appear beside the leader, same heading
function spawnNearLeader(p) {
  const L = leaderOf(p);
  if (!L) { resetBird(p); return; }
  const S = p.S, LS = L.S;
  // beside the leader (never right behind: that is where the leader's camera is)
  const nOn = players.filter((q) => q.on && q !== p && q !== L).length;
  const side = (nOn % 2 ? -1 : 1) * (10 + 6 * Math.floor(nOn / 2));
  S.yaw = LS.yaw;
  S.x = LS.x + Math.cos(LS.yaw) * side + Math.sin(LS.yaw) * 2;
  S.z = LS.z - Math.sin(LS.yaw) * side + Math.cos(LS.yaw) * 2;
  S.y = Math.max(LS.y + 2, world.height(S.x, S.z) + 15); S.vy = 0; S.speed = LS.speed; S.roll = 0; S.pitch = 0;
  p.ribbons.forEach((r) => r.reset());
  snapCamera(p);
}
const tilePortrait = (p) => p.aspect < 0.85;
// v3 chase camera, pulled back so the bird and more of the world fit ("zoom out more").
// v2 was 10.5 m behind / 5 m up / fov 60 (portrait tiles 12.5 / 6 / 72). 🔍 cycles: fit (default) -> ➖ -> ➕.
let zoom = loadZoom(); // 🔍 chase camera distance (js/chase.js)
const camDist = (p) => (tilePortrait(p) ? 12.5 : 10.5) * CHASE[zoom].dist;
const camHeight = (p) => (tilePortrait(p) ? 6 : 5) * CHASE[zoom].height;
const camFov = (p) => (tilePortrait(p) ? 72 : 60) + CHASE[zoom].fov;
function snapCamera(p = primary()) {
  const S = p.S;
  fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  p.cam.pos.set(S.x, S.y, S.z).addScaledVector(fwd, -camDist(p)).add(v1.set(0, camHeight(p), 0));
  p.cam.look.set(S.x, S.y + 1, S.z).addScaledVector(fwd, 6);
  p.cam.roll = 0;
}
function applyCamera(p) {
  camera.position.copy(p.cam.pos);
  camera.lookAt(p.cam.look);
  camera.rotateZ(-p.cam.roll * 0.3);
}

// ---------- who is playing (camera people / 2-key mode / single)
function wantedSlots() {
  if (pose.active) { const ps = pose.players; if (ps.length) return ps; }
  if (G.inputMode === 'keys2') return [{ slot: 0 }, { slot: 1 }];
  return [{ slot: 0 }];
}
function syncPlayers() {
  const want = wantedSlots();
  const key = want.map((e) => e.slot).sort().join(',');
  const cur = order.slice().sort().join(',');
  for (const e of want) players[e.slot].away = e.state === 'lost';
  if (key === cur) return false;
  const wantSet = new Set(want.map((e) => e.slot));
  const joined = [];
  for (const p of players) {
    const on = wantSet.has(p.slot);
    if (on && !p.on) joined.push(p);
    if (!on && p.on) { p.on = false; p.away = false; }
  }
  for (const p of joined) p.on = true;
  // tiles follow where people stand (left to right); only re-sorted when someone joins / leaves
  order = screenOrder(want).map((e) => e.slot);
  for (const p of joined) {
    if (G.mode === 'play') spawnNearLeader(p);
    else if (!p.ever) resetBird(p, order.indexOf(p.slot), order.length);
    p.ever = true;
  }
  for (const p of players) {
    p.bird.root.visible = p.on;
    p.ribbons.forEach((r) => { r.mesh.visible = p.on; if (!p.on) r.reset(); });
  }
  resize();
  return true;
}

// ---------- actions
function flap(strength = 1, slot) {
  if (G.mode === 'title') return;
  const p = slot == null ? primary() : players[slot];
  if (!p || !p.on) return;
  const S = p.S;
  S.vy = Math.min(S.vy + T.flapImpulse * strength, T.maxVy);
  S.flaps++;
  p.bird.flap(); sound.flap();
}
function puff(x, y, z) {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * 6.283, s = 2 + Math.random() * 5;
    dust.emit({ x: x + Math.cos(a) * 0.6, y: y + 0.2, z: z + Math.sin(a) * 0.6, vx: Math.cos(a) * s, vy: 1 + Math.random() * 2.5, vz: Math.sin(a) * s, drag: 2.2, grav: 0.6, size: 1.1 + Math.random() * 1.1, grow: 1.6, r: 0.85, g: 0.76, b: 0.6, a: 0.75, max: 1.1 + Math.random() * 0.8 });
  }
}
function sparkle(a, col) {
  const pc = new THREE.Color(col);
  const cols = [[1, 0.42, 0.55], [1, 0.78, 0.25], [1, 0.95, 0.75], [pc.r, pc.g, pc.b], [0.55, 0.8, 1]];
  for (let i = 0; i < 60; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * 6.283, r = Math.sqrt(1 - u * u), s = 3 + Math.random() * 7, c = cols[i % 5];
    spark.emit({ x: a.x, y: a.y, z: a.z, vx: r * Math.cos(th) * s, vy: u * s + 2, vz: r * Math.sin(th) * s, drag: 1.6, grav: 1.5, size: 0.45 + Math.random() * 0.5, r: c[0], g: c[1], b: c[2], max: 0.9 + Math.random() * 0.9 });
  }
  for (let i = 0; i < 30; i++) spark.emit({ x: a.x + (Math.random() - 0.5) * 2, y: a.y + Math.random() * 30, z: a.z + (Math.random() - 0.5) * 2, vx: 0, vy: 6 + Math.random() * 8, vz: 0, drag: 0.6, size: 0.6, r: 1, g: 0.5, b: 0.65, max: 1.5 });
}
const teamTotal = () => world.apples.filter((a) => a.collected).length;
const pop = (el) => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
// Apples are SHARED (co-op): whoever flies through a beam first gets it; the team needs all 16.
function collect(a, p) {
  world.collect(a);
  p.S.collected++;
  const total = teamTotal();
  sparkle(a, p.col.css);
  sound.chime(total);
  pop($('count')); pop(p.tile.querySelector('.badge'));
  $('cn').textContent = total;
  p.tileCount.textContent = p.S.collected;
  renderBoard();
  if (total >= world.apples.length && G.winAt == null) G.winAt = G.time + 1.6;
}
function renderBoard() {
  const b = $('board');
  if (!b || b.classList.contains('hidden')) return;
  b.innerHTML = onPlayers().map((p) => `<div class="row" style="--c:${p.col.css}"><span class="bn">${p.slot + 1}</span><span>🍎</span><b>${p.S.collected}</b></div>`).join('')
    + `<div class="row tot">🍎<b>${teamTotal()}</b><i>/${world.apples.length}</i></div>`;
}
function showWin() {
  G.mode = 'win';
  const t = Math.round(G.playTime);
  $('wTime').textContent = `⏱️ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const ps = onPlayers();
  const wp = $('wPlayers');
  wp.innerHTML = ps.length > 1 ? ps.map((p) => `<span class="wpp" style="--c:${p.col.css}"><span class="bn">${p.slot + 1}</span>🍎<b>${p.S.collected}</b></span>`).join('') : '';
  wp.classList.toggle('hidden', ps.length < 2);
  $('win').classList.remove('hidden'); $('hint').classList.add('hidden'); $('camHint').classList.add('hidden');
  sound.win();
}
function newGame(newSeed) {
  if (newSeed != null) {
    seed = newSeed;
    world.dispose();
    world = createWorld(scene, seed);
  }
  G.playTime = 0; G.winAt = null;
  $('cn').textContent = '0'; $('ct').textContent = '/' + world.apples.length;
  dust.clear(); spark.clear();
  const ps = onPlayers();
  for (const p of players) { Object.assign(p.S, { collected: 0, bounces: 0, flaps: 0 }); p.tileCount.textContent = '0'; }
  ps.forEach((p, k) => resetBird(p, k, ps.length));
  renderBoard();
}
function start() {
  sound.init();
  if (G.mode === 'play') return;
  if (G.mode === 'win') newGame((Math.random() * 1e9) | 0); else newGame();
  G.mode = 'play';
  $('title').classList.add('hidden'); $('win').classList.add('hidden'); $('practice').classList.add('hidden'); $('hud').classList.remove('hidden');
  if (practice) lastPractice = practice;
  practice = null;
  showHint();
}
function showHint() {
  const cam = G.inputMode === 'cam';
  $('hint').classList.toggle('hidden', cam); $('camHint').classList.toggle('hidden', !cam);
  for (const h of [$('hint'), $('camHint')]) { h.style.animation = 'none'; void h.offsetWidth; h.style.animation = ''; }
}
// ---------- v3: ▶️ -> (camera on) practice each move once -> play. Keys / Space skip straight to play.
const PRACTICE = [
  { move: 'flap', icon: '🪽', hold: 0, check: (e) => e.out.flap },
  { move: 'bankL', icon: '↩️', hold: 0.25, check: (e) => e.out.bank < -0.4 },
  { move: 'bankR', icon: '↪️', hold: 0.25, check: (e) => e.out.bank > 0.4 },
];
let practice = null, lastPractice = null, practiced = false, practiceOpt = params.get('practice') !== '0';
function go() {
  sound.init();
  if (G.mode === 'play' || G.mode === 'practice') return;
  if (pose.active && practiceOpt && !practiced && G.mode === 'title') startPractice(); else start();
}
function startPractice() {
  practice = new Practice(PRACTICE); practiced = true;
  G.mode = 'practice';
  $('title').classList.add('hidden'); $('win').classList.add('hidden'); $('practice').classList.remove('hidden');
  renderPractice();
}
function renderPractice() {
  const P = practice; if (!P) return;
  $('pSteps').innerHTML = P.steps.map((st, i) => `<span class="ps${st.done ? ' ok' : ''}${i === P.i ? ' cur' : ''}"><canvas data-demo="${st.move}"${i === P.i ? '' : ' data-paused="1"'}></canvas><b>${st.done ? '✅' : st.icon}</b></span>`).join('');
  const cur = P.current;
  if (cur) { $('pDemo').dataset.demo = cur.move; $('pIcon').textContent = cur.icon; }
}
function updatePractice(dt) {
  if (!practice) return;
  const got = practice.update(pose.players.filter((e) => !e.away && e.state !== 'lost').map((e) => ({ id: e.id, body: e })), dt);
  if (got) { sound.chime?.(practice.i); renderPractice(); if (practice.done) { G.mode = 'title'; start(); } }
}
function skipPractice() { if (!practice) return; practice.skip(); G.mode = 'title'; start(); }

// ---------- simulation step (fixed dt)
function stepPlayer(p, dt, playing) {
  const S = p.S, inp = p.in, bird = p.bird;
  if (p.away) { // person left the camera: bird hovers frozen until they come back or the screen closes
    bird.update(dt, S.roll, S.pitch);
    return;
  }
  let bankIn = inp.right - inp.left + inp.drag + inp.test;
  if (p === primary()) bankIn += input.tilt;
  const pe = pose.active ? pose.slots[p.slot] : null;
  const poseFresh = !!pe && performance.now() - pe.outT < 300;
  if (poseFresh) bankIn += pe.out.bank;
  const gh0 = world.height(S.x, S.z);
  if (!playing || input.autopilot) { // title / win: lazy circles
    bankIn = 0.3;
    if (S.y - gh0 < 22 && !bird.flapping && Math.random() < 0.05) { S.vy = Math.min(S.vy + T.flapImpulse, T.maxVy); bird.flap(); }
  }
  bankIn = clamp(bankIn, -1, 1);
  if (poseFresh && playing) S.vy = Math.min(S.vy + pe.out.lift * dt, T.maxVy);

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
    if (G.time - S.lastHit > 0.25) {
      S.vy = Math.max(-S.vy * 0.35, 0) + T.bounceVy;
      S.lastHit = G.time;
      if (playing) { S.bounces++; sound.thump(); }
      puff(S.x, gh, S.z);
    } else S.vy = Math.max(S.vy, 3);
  }
  // apples: fly through the beam
  if (playing) for (const a of world.apples) {
    if (a.collected) continue;
    const dx = a.x - S.x, dz = a.z - S.z;
    if (dx * dx + dz * dz < T.collectR * T.collectR && S.y > a.y - 4 && S.y < a.y + WORLD.BEAM_H) collect(a, p);
  }

  // ---- visuals
  S.pitch += (clamp(S.vy * 0.06, -0.35, 0.4) - S.pitch) * (1 - Math.exp(-4 * dt));
  bird.root.position.set(S.x, S.y, S.z);
  bird.root.rotation.y = S.yaw;
  bird.update(dt, S.roll, S.pitch);
  bird.root.updateMatrixWorld(true);
  bird.body.getWorldQuaternion(qW);
  v2.set(1, 0, 0).applyQuaternion(qW);
  bird.tips.forEach((tip, i) => { tip.getWorldPosition(v1); p.ribbons[i].push(v1, v2); p.ribbons[i].update(); });
  p.marker.position.set(S.x, S.y + 3.2 + Math.sin(G.time * 3 + p.slot) * 0.25, S.z);
  p.marker.rotation.y = G.time * 2;
  // trailing camera with heavy smoothing
  const c = p.cam;
  fwd.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
  v1.set(S.x, S.y, S.z).addScaledVector(fwd, -camDist(p)); v1.y += camHeight(p);
  v1.y = Math.max(v1.y, world.height(v1.x, v1.z) + 2);
  c.pos.lerp(v1, 1 - Math.exp(-2.2 * dt));
  v2.set(S.x, S.y + 1, S.z).addScaledVector(fwd, 6);
  c.look.lerp(v2, 1 - Math.exp(-4 * dt));
  c.roll += (S.roll - c.roll) * (1 - Math.exp(-2 * dt));
}
function step(dt) {
  G.time += dt;
  const playing = G.mode === 'play';
  if (playing) G.playTime += dt;
  for (const p of onPlayers()) stepPlayer(p, dt, playing);
  if (playing && G.winAt != null && G.time >= G.winAt) showWin();
  dust.update(dt); spark.update(dt);
  world.update(G.time, dt);
}

// ---------- pose / camera mode
const pose = new PoseInput({
  box: $('camBox'), video: $('camVid'), canvas: $('camCv'), status: $('camSt'),
  onStatus: (s) => {
    $('mCam').classList.toggle('bad', s === 'denied' || s === 'nocam' || s === 'nomodel');
    if (s === 'denied' || s === 'nocam' || s === 'tap') { if (G.inputMode === 'cam') setMode('keys'); }
    document.body.dataset.cam = s;
    $('camMsg').textContent = { loading: '⏳', tap: '👆', denied: '🚫', nocam: '🚫', nomodel: '⚠️', none: '🙋', track: '🙋' }[s] || '📷';
  },
});
function setMode(m) {
  G.inputMode = m;
  for (const b of document.querySelectorAll('.mb')) b.classList.toggle('on', b.dataset.mode === m);
  updateHint();
  syncPlayers();
  if (G.mode === 'play') { $('hint').classList.toggle('hidden', m === 'cam'); $('camHint').classList.toggle('hidden', m !== 'cam'); }
}
async function toggleCamera() {
  sound.init();
  if (pose.active) { pose.stop(); setMode('keys'); return; }
  if (tiltOn) stopTilt();
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
function stopTilt() { tiltOn = false; input.tilt = 0; removeEventListener('deviceorientation', onTilt); }
async function toggleTilt() {
  sound.init();
  if (tiltOn) { stopTilt(); setMode('keys'); return; }
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
function toggleDuo() {
  sound.init();
  if (G.inputMode === 'keys2') { setMode('keys'); return; }
  if (pose.active) pose.stop();
  if (tiltOn) stopTilt();
  setMode('keys2');
}
function updateHint() {
  const duo = G.inputMode === 'keys2';
  $('hint').classList.toggle('duo', duo);
  if (duo) {
    $('hFlap').textContent = isTouch ? '👆' : 'W'; $('hFlap').classList.toggle('key', !isTouch);
    $('hBank').innerHTML = isTouch ? '1 · 2' : `<b class="dot" style="--c:${PLAYER_COLORS[0].css}"></b><span class="gap"></span><b class="key">↑</b><b class="dot" style="--c:${PLAYER_COLORS[1].css}"></b>`;
  } else if (isTouch) { $('hFlap').textContent = '👆'; $('hFlap').classList.remove('key'); $('hBank').textContent = '↔️'; }
  else { $('hFlap').textContent = '␣'; $('hFlap').classList.add('key'); $('hBank').textContent = '⬅️➡️'; }
}

// v3: the camera is the default input. It starts on load (Chrome / desktop: no tap needed); browsers that want a
// gesture first get one 👆 tap. Keys / tap / tilt stay as the fallback (and whenever the camera is off / blocked).
async function camFirst() {
  if (pose.active || tiltOn || G.inputMode === 'keys2') return;
  setMode('cam');
  const ok = await pose.start();
  if (!ok && pose.status === 'tap') {
    const again = () => { removeEventListener('pointerdown', again, true); if (!pose.active && G.inputMode !== 'keys2' && !tiltOn) camFirst(); };
    addEventListener('pointerdown', again, true);
  }
}
// body-controlled menus: raise a hand -> ✋ cursor, hold ~1.2 s on ▶️ / 🔄 / 🔍 / 🔊 / ⏭ (off while flying)
const upperBodyInFrame = (b) => b.sw < 0.5 && b.head.y > 0.03 && b.sh.x > 0.08 && b.sh.x < 0.92; // flying needs head + both arms: not too close
const menu = new BodyMenu({
  enabled: () => pose.active && G.mode !== 'play',
  scope: () => (G.mode === 'practice' ? [$('practice')] : G.mode === 'win' ? [$('win'), $('tr')] : [$('title'), $('tr')]),
  inFrame: upperBodyInFrame,
});
const zoomBtn = $('zoomBtn');
const ZORDER = [1, 0, 2];
function setZoom(z) {
  zoom = CHASE[z] ? z : 1;
  try { localStorage.setItem(ZKEY, String(zoom)); } catch (e) { /* private mode */ }
  zoomBtn.querySelector('sup').textContent = CHASE[zoom].icon;
}
setZoom(zoom);
zoomBtn.addEventListener('click', () => setZoom(ZORDER[(ZORDER.indexOf(zoom) + 1) % ZORDER.length]));
startDemos(document);

// ---------- input wiring
const keysBtn = $('mKeys');
keysBtn.textContent = isTouch ? '👆' : '⌨️';
if (isTouch) {
  $('mTilt').classList.remove('hidden');
  $('howFlap').textContent = '👆 = 🪽'; $('howBank').textContent = '👆↔️ / 📱 = ↩️↪️';
}
updateHint();
$('mCam').addEventListener('click', toggleCamera);
$('mTilt').addEventListener('click', toggleTilt);
$('mDuo').addEventListener('click', toggleDuo);
keysBtn.addEventListener('click', () => { sound.init(); if (pose.active) pose.stop(); if (tiltOn) stopTilt(); setMode('keys'); });
const muteBtn = $('muteBtn');
const syncMute = () => (muteBtn.textContent = sound.muted ? '🔇' : '🔊');
syncMute();
muteBtn.addEventListener('click', () => { sound.init(); sound.setMuted(!sound.muted); syncMute(); });
$('playBtn').addEventListener('click', go);
$('pSkip').addEventListener('click', skipPractice);
$('replayBtn').addEventListener('click', start);

// keys: one player = every key flies bird 1. 👥 duo mode: W/A/D (+Space) = bird 1, ↑/←/→ = bird 2.
const KEYMAP = { Space: 'flap', KeyW: 'flap', ArrowUp: 'flap', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
const keySlot = (code) => (G.inputMode === 'keys2' && code.startsWith('Arrow') ? 1 : G.inputMode === 'keys2' ? 0 : null);
const keyPlayer = (code) => { const s = keySlot(code); return s == null ? primary() : players[s]; };
addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (k || e.code === 'Enter') e.preventDefault();
  if (e.code === 'KeyM') { muteBtn.click(); return; }
  if (e.code === 'KeyZ') { zoomBtn.click(); return; }
  if (G.mode === 'practice') { if (k === 'flap' || e.code === 'Enter') skipPractice(); return; }
  if (G.mode !== 'play') { if (k === 'flap' || e.code === 'Enter') start(); return; }
  const p = keyPlayer(e.code);
  if (k === 'flap' && !e.repeat) flap(1, p.slot);
  if (k === 'left') p.in.left = 1;
  if (k === 'right') p.in.right = 1;
});
addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  const p = keyPlayer(e.code);
  if (k === 'left') p.in.left = 0;
  if (k === 'right') p.in.right = 0;
});
addEventListener('blur', () => { for (const p of players) p.in.left = p.in.right = p.in.drag = 0; });
// pointer: tap/click = flap the bird whose screen you touched, hold + drag sideways = bank it
const drags = new Map(); // pointerId -> { slot, x0 }
const cv = renderer.domElement;
function tileAt(x, y) {
  const vs = layout.views;
  for (let i = 0; i < vs.length; i++) { const r = vs[i]; if (x >= r.x - GAP && x < r.x + r.w + GAP && y >= r.y - GAP && y < r.y + r.h + GAP) return players[order[i]]; }
  return primary();
}
cv.addEventListener('pointerdown', (e) => {
  if (G.mode !== 'play') return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  sound.init();
  const p = tileAt(e.clientX, e.clientY);
  flap(1, p.slot);
  if (![...drags.values()].some((d) => d.slot === p.slot)) { drags.set(e.pointerId, { slot: p.slot, x0: e.clientX }); try { cv.setPointerCapture(e.pointerId); } catch (_) {} }
});
cv.addEventListener('pointermove', (e) => {
  const d = drags.get(e.pointerId); if (!d) return;
  const w = layout.views[order.indexOf(d.slot)]?.w || innerWidth;
  players[d.slot].in.drag = clamp((e.clientX - d.x0) / (Math.min(w, 900) * 0.22), -1, 1);
});
const endDrag = (e) => { const d = drags.get(e.pointerId); if (d) { drags.delete(e.pointerId); players[d.slot].in.drag = 0; } };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (sound.ctx) document.hidden ? sound.ctx.suspend() : sound.ctx.resume(); });

// ---------- resize / layout / perf
const noAdapt = params.has('noadapt');
let viewDpr = dpr;
function resize() {
  const n = Math.max(1, order.length);
  const q = VIEWQ[n];
  viewDpr = Math.min(dpr, q.dprCap);
  renderer.setPixelRatio(viewDpr);
  renderer.setSize(innerWidth, innerHeight);
  layout = layoutViewports(n, innerWidth, innerHeight, GAP);
  scene.fog.near = q.fogNear; scene.fog.far = q.fogFar;
  const multi = n > 1 || pose.active;
  players.forEach((p) => p.tile.classList.add('hidden'));
  for (const p of players) if (!p.on) p.tile.classList.remove('isaway', 'isedge');
  layout.views.forEach((r, i) => {
    const p = players[order[i]]; if (!p) return;
    p.aspect = r.w / r.h;
    const t = p.tile;
    t.classList.remove('hidden');
    t.classList.toggle('solo', !multi);
    Object.assign(t.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    t.classList.toggle('right', r.x + r.w >= innerWidth - 1);
    t.classList.toggle('bottom', r.y + r.h >= innerHeight - 1);
  });
  $('hud').classList.toggle('multi', n > 1);
  $('hud').dataset.n = n;
  document.body.classList.toggle('multi', n > 1); document.body.dataset.n = n; // preview + 🔊 live outside #hud
  const b = $('board');
  if (layout.extra) {
    const r = layout.extra;
    Object.assign(b.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    b.classList.remove('hidden'); renderBoard();
  } else b.classList.add('hidden');
  for (const p of players) p.marker.visible = p.on && n > 1;
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

const perf = { fps: 0, frameMs: 0, dpr, calls: 0, triangles: 0, frames: 0, views: 1, viewRects: [] };
let fpsAcc = 0, fpsN = 0, lowStreak = 0;
const clearCol = new THREE.Color('#fff8e6');

function render() {
  const n = order.length;
  const q = VIEWQ[Math.max(1, n)];
  const H = innerHeight;
  renderer.info.reset();
  renderer.setScissorTest(false);
  if (n > 1) { renderer.setClearColor(clearCol, 1); renderer.clear(); }
  renderer.setScissorTest(n > 1);
  const rects = [];
  layout.views.forEach((r, i) => {
    const p = players[order[i]]; if (!p) return;
    renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h);
    renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h);
    camera.aspect = r.w / r.h;
    camera.fov = camFov(p);
    camera.updateProjectionMatrix();
    applyCamera(p);
    const sc = (r.h * viewDpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    dust.mat.uniforms.uScale.value = spark.mat.uniforms.uScale.value = sc;
    world.setView(camera.position, q.treeDist, q.lowDetail);
    p.marker.visible = false; // your own marker would just sit in front of your camera
    // a friend's bird right in front of your camera would fill the screen: hide it for this view only
    for (const q of players) if (q !== p && q.on) q.bird.root.visible = q.bird.root.position.distanceToSquared(camera.position) > 36;
    renderer.render(scene, camera);
    for (const q of players) q.bird.root.visible = q.on;
    p.marker.visible = p.on && n > 1;
    rects.push({ slot: p.slot, ...r });
  });
  if (layout.extra) { // 3 players: 4th cell is the scoreboard (DOM), keep it clean
    const r = layout.extra;
    renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h); renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h);
    renderer.setClearColor(clearCol, 1); renderer.clear();
  }
  renderer.setScissorTest(false);
  perf.views = rects.length; perf.viewRects = rects;
  perf.calls = renderer.info.render.calls; perf.triangles = renderer.info.render.triangles;
}

// ---------- main loop
let last = performance.now(), acc = 0;
syncPlayers();
resetBird(players[0]);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const res = pose.tick(now);
  if (res) {
    syncPlayers();
    if (G.mode === 'play' || G.mode === 'practice') for (const e of res) {
      const p = players[e.slot];
      if (e.out.flap && p.on && !p.away) { p.bird.flap(); sound.flap(); if (G.mode === 'play') p.S.flaps++; }
    }
  }
  if (G.mode === 'practice') updatePractice(dt);
  menu.update(pose.active ? pose.bodies : [], now / 1000);
  document.body.classList.toggle('camlive', pose.active && (pose.fake || pose.hasVideo)); document.body.classList.toggle('inplay', G.mode === 'play'); // multi: centered preview only while flying
  if (!paused) { acc += dt; let n = 0; while (acc >= STEP && n++ < 6) { step(STEP); acc -= STEP; } if (n >= 6) acc = 0; }
  const ps = onPlayers(), playing = G.mode === 'play';
  $('edge').classList.toggle('hidden', !(ps.length === 1 && primary().S.edge && playing));
  for (const p of ps) { p.tile.classList.toggle('isaway', p.away); p.tile.classList.toggle('isedge', ps.length > 1 && p.S.edge && playing); }
  const P = primary().S;
  // live hint: camera players flying low get the big "flap!" figure
  $('camHint').classList.toggle('low', playing && G.inputMode === 'cam' && ps.some((p) => !p.away && p.S.y - world.height(p.S.x, p.S.z) < 7));
  sound.wind(P.speed, P.vy);
  render();
  perf.frames++;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 2) {
    perf.fps = Math.round(fpsN / fpsAcc); perf.frameMs = +((fpsAcc / fpsN) * 1000).toFixed(1);
    if (!noAdapt && perf.fps < 45 && dpr > 1) { if (++lowStreak >= 1) { dpr = Math.max(1, dpr - 0.25); perf.dpr = dpr; resize(); lowStreak = 0; } }
    else lowStreak = 0;
    fpsAcc = 0; fpsN = 0;
  }
}
requestAnimationFrame(frame);
if (params.get('autocam') !== '0') camFirst();

// ---------- test hooks
const pstate = (p) => ({
  slot: p.slot, color: p.col.name, x: p.S.x, y: p.S.y, z: p.S.z, alt: p.S.y - world.height(p.S.x, p.S.z), vy: p.S.vy, speed: p.S.speed, yaw: p.S.yaw, roll: p.S.roll,
  collected: p.S.collected, flaps: p.S.flaps, bounces: p.S.bounces, away: p.away, edge: p.S.edge,
});
window.__game = {
  get state() {
    const p = primary(), S = p.S;
    return {
      mode: G.mode, x: S.x, y: S.y, z: S.z, alt: S.y - world.height(S.x, S.z), vy: S.vy, speed: S.speed, yaw: S.yaw, roll: S.roll,
      collected: teamTotal(), total: world.apples.length, bounces: S.bounces, flaps: S.flaps, seed, time: G.time, playTime: G.playTime,
      inputMode: G.inputMode, edge: S.edge, gameOver: false, paused, players: order.length, sharedApples: true,
    };
  },
  get players() { return onPlayers().map(pstate); },
  get views() {
    return {
      n: perf.views, order: order.slice(), rects: perf.viewRects, extra: layout.extra,
      tiles: [...document.querySelectorAll('#tiles .tile:not(.hidden)')].map((t) => +t.dataset.slot),
      board: !$('board').classList.contains('hidden'),
    };
  },
  get apples() { return world.apples.map((a) => ({ x: a.x, y: a.y, z: a.z, collected: a.collected })); },
  get perf() { return { ...perf, dpr, viewDpr, trees: world.trees, foliage: world.foliage }; },
  get pose() {
    return {
      active: pose.active, fake: pose.fake, status: pose.status, frames: pose.frames, out: pose.out, raw: pose.raw,
      tracks: pose.tracker.tracks.map((k) => ({ id: k.id, slot: k.slot, state: k.state, x: +k.x.toFixed(3) })),
    };
  },
  start,
  flap: (strength, slot) => flap(strength, slot),
  bank(x, slot) { const p = slot == null ? primary() : players[slot]; p.in.test = clamp(+x || 0, -1, 1); },
  simulate(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) step(STEP); return this.state; },
  setPaused(p) { paused = !!p; acc = 0; },
  setBird(o, slot) { const p = slot == null ? primary() : players[slot]; Object.assign(p.S, o); snapCamera(p); p.ribbons.forEach((r) => r.reset()); },
  height: (x, z) => world.height(x, z),
  replay: (s) => { G.mode = 'win'; start(); if (s != null) newGame(s); },
  toggleCamera, setMode, toggleDuo,
  go, skipPractice,
  get practice() { const P = practice || lastPractice; return P ? { live: P === practice, i: P.i, done: P.done, skipped: P.skipped, steps: P.steps.map((s) => ({ move: s.move, done: s.done })) } : null; },
  get menu() { return menu.state; },
  get zoom() { return zoom; }, setZoom,
  get chase() { const p = primary(); return { level: zoom, dist: camDist(p), height: camHeight(p), fov: camFov(p), camFov: camera.fov }; },
  camInfo: () => ({ ...pose.info, status: pose.status, active: pose.active, fake: pose.fake, ar: pose.ar }),
  get preview() {
    const b = $('camBox').getBoundingClientRect(), v = $('camVid'), c = $('camCv');
    return { box: { w: b.width, h: b.height, x: b.x, y: b.y }, video: { w: v.videoWidth, h: v.videoHeight }, canvas: { w: c.width, h: c.height }, fit: getComputedStyle(v).objectFit };
  },
  snapCamera: () => onPlayers().forEach(snapCamera),
  // fake camera: no webcam / model, landmarks come from injectPeople([lm33, lm33, ...]) (raw MediaPipe coords)
  fakeCamera(opts = {}) { if (tiltOn) stopTilt(); pose.startFake(); setMode('cam'); practiceOpt = !!opts.practice; },
  injectPeople(list) { pose.inject(list); },
  fakeFrame(ar) { pose.fakeAr = ar; pose._fitBox(); }, // fake camera frame aspect (portrait phone = 0.75)
  render,
  _three: { scene, renderer, camera, get world() { return world; } },
};
