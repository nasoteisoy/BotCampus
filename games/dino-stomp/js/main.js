// Move & Play 3D: shared game shell (same file in every 3D game; the game itself lives in game.js).
// Players (1-4, camera roll call or keys / touch), split screen, chase cameras, body menus, practice, HUD, hooks.
// Architecture copied from flap-flyer-v2/js/main.js (one renderer, scissored viewports, fixed-step sim).
import * as THREE from 'three';
import { META, createGame } from './game.js';
import { Particles } from './fx.js';
import { Sound } from './audio.js';
import { PoseInput } from './pose.js';
import { layoutViewports, screenOrder, PLAYER_COLORS, MAX_PLAYERS } from './multi.js';
import { BodyMenu } from './menu.js';
import { LockUI } from './lockui.js';
import { startDemos } from './demo.js';
import { Practice } from './practice.js';
import { CHASE, ZKEY, loadZoom } from './chase.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const STEP = 1 / 60;
const GAP = 4;
const TIMED_SEC = 180;
const VIEWQ = META.viewq;

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
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 1400);
const dust = new Particles(scene, 260, false);
const spark = new Particles(scene, 360, false);
const sound = new Sound(META.muteKey);
let seed = Number(params.get('seed')) || ((Math.random() * 1e9) | 0);

// ---------- global state
const G = { mode: 'title', time: 0, playTime: 0, winAt: null, inputMode: 'keys', timed: params.get('timed') === '1', left: TIMED_SEC };
let paused = false;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), fwd = new THREE.Vector3();
const env = {
  scene, sound, dust, spark, get time() { return G.time; },
  onCollect: (item, p) => collect(item, p),
  get players() { return onPlayers(); },
};
let game = createGame(env, seed);

// ---------- players
const tilesEl = $('tiles');
const guideGeo = new THREE.ConeGeometry(0.55, 1.6, 4); guideGeo.rotateX(-Math.PI / 2); // points to -z (forward)
const markerGeo = new THREE.OctahedronGeometry(0.6, 0);
function makePlayer(slot) {
  const col = PLAYER_COLORS[slot];
  const tile = document.createElement('div');
  tile.className = 'tile hidden'; tile.dataset.slot = slot; tile.style.setProperty('--c', col.css);
  tile.innerHTML = `<div class="badge"><span class="bn">${slot + 1}</span><span class="bc">${META.icon}<b>0</b></span></div><div class="away">🙈</div><div class="tedge">↩️</div>`;
  tilesEl.appendChild(tile);
  const guide = new THREE.Mesh(guideGeo, new THREE.MeshBasicMaterial({ color: '#ffd54a', transparent: true, opacity: 0.9, fog: false, depthTest: false }));
  guide.renderOrder = 9; guide.visible = false; scene.add(guide);
  const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: col.css, fog: false }));
  marker.visible = false; scene.add(marker);
  const p = {
    slot, col, tile, tileCount: tile.querySelector('.bc b'), guide, marker,
    S: { collected: 0, edge: false },
    in: { fwd: 0, left: 0, right: 0, up: 0, down: 0, drag: 0, hold: 0, test: null },
    ev: { jump: false, roar: false, stroke: false, step: false }, // one-shot actions waiting for the next sim step
    cam: { pos: new THREE.Vector3(), look: new THREE.Vector3() },
    on: false, away: false, ever: false, aspect: innerWidth / innerHeight,
  };
  game.initPlayer(p);
  return p;
}
const players = Array.from({ length: MAX_PLAYERS }, (_, i) => makePlayer(i));
let order = [];
let layout = layoutViewports(1, innerWidth, innerHeight, GAP);
const onPlayers = () => order.map((s) => players[s]);
const primary = () => players[order[0] ?? 0];

const tilePortrait = (p) => p.aspect < 0.85;
let zoom = loadZoom();
const C = META.cam;
const camDist = (p) => (tilePortrait(p) ? C.distP : C.dist) * CHASE[zoom].dist;
const camHeight = (p) => (tilePortrait(p) ? C.heightP : C.height) * CHASE[zoom].height;
const camFov = (p) => (tilePortrait(p) ? C.fovP : C.fov) + CHASE[zoom].fov;
function camGoal(p, out) {
  const T = game.camTarget(p);
  fwd.set(-Math.sin(T.yaw), 0, -Math.cos(T.yaw));
  out.set(T.x, T.y, T.z).addScaledVector(fwd, -camDist(p)); out.y += camHeight(p);
  game.camClamp(out, T);
  return T;
}
function snapCamera(p = primary()) {
  const T = camGoal(p, p.cam.pos);
  p.cam.look.set(T.x, T.y + C.lookUp, T.z).addScaledVector(fwd, C.lookAhead);
}
function resetPlayer(p, k = 0, n = 1) { game.reset(p, k, n); snapCamera(p); }
function leaderOf(except) {
  let best = null;
  for (const q of players) if (q !== except && q.on && (!best || q.S.collected > best.S.collected)) best = q;
  return best;
}
function spawnNearLeader(p) {
  const L = leaderOf(p);
  if (!L) { resetPlayer(p); return; }
  const nOn = players.filter((q) => q.on && q !== p && q !== L).length;
  game.spawnNear(p, L, (nOn % 2 ? -1 : 1) * (3.5 + 2.5 * Math.floor(nOn / 2)));
  snapCamera(p);
}

// ---------- who is playing
function wantedSlots() {
  if (pose.active) { const ps = pose.players; if (ps.length) return ps; }
  if (G.inputMode === 'keys2') return [{ slot: 0 }, { slot: 1 }];
  return [{ slot: 0 }];
}
function syncPlayers() {
  const want = wantedSlots();
  const key = want.map((e) => e.slot).sort().join(','), cur = order.slice().sort().join(',');
  for (const e of want) players[e.slot].away = e.state === 'lost';
  if (key === cur) return false;
  const wantSet = new Set(want.map((e) => e.slot)), joined = [];
  for (const p of players) {
    const on = wantSet.has(p.slot);
    if (on && !p.on) joined.push(p);
    if (!on && p.on) { p.on = false; p.away = false; }
  }
  for (const p of joined) p.on = true;
  order = screenOrder(want).map((e) => e.slot);
  for (const p of joined) {
    if (G.mode === 'play') spawnNearLeader(p);
    else if (!p.ever) resetPlayer(p, order.indexOf(p.slot), order.length);
    p.ever = true;
  }
  for (const p of players) { game.setVisible(p, p.on); if (!p.on) p.guide.visible = false; }
  resize();
  return true;
}

// ---------- score
const teamTotal = () => game.items.filter((a) => a.collected).length;
const pop = (el) => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
function collect(item, p) {
  p.S.collected++;
  const total = teamTotal();
  sound.chime(total);
  pop($('count')); pop(p.tile.querySelector('.badge'));
  $('cn').textContent = total; p.tileCount.textContent = p.S.collected;
  renderBoard();
  if (total >= game.items.length && G.winAt == null) G.winAt = G.time + 1.8;
}
function renderBoard() {
  const b = $('board');
  if (!b || b.classList.contains('hidden')) return;
  b.innerHTML = onPlayers().map((p) => `<div class="row" style="--c:${p.col.css}"><span class="bn">${p.slot + 1}</span><span>${META.icon}</span><b>${p.S.collected}</b></div>`).join('')
    + `<div class="row tot">${META.icon}<b>${teamTotal()}</b><i>/${game.items.length}</i></div>`;
}
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function showWin() {
  G.mode = 'win';
  $('wTime').textContent = G.timed ? '⏱️ ' + fmt(TIMED_SEC - Math.max(0, G.left)) : '⏱️ ' + fmt(G.playTime);
  $('wn').textContent = `${teamTotal()}/${game.items.length}`;
  $('win').classList.toggle('all', teamTotal() >= game.items.length);
  const ps = onPlayers(), wp = $('wPlayers');
  wp.innerHTML = ps.length > 1 ? ps.map((p) => `<span class="wpp" style="--c:${p.col.css}"><span class="bn">${p.slot + 1}</span>${META.icon}<b>${p.S.collected}</b></span>`).join('') : '';
  wp.classList.toggle('hidden', ps.length < 2);
  $('win').classList.remove('hidden'); $('hint').classList.add('hidden'); $('camHint').classList.add('hidden'); $('acts').classList.add('hidden');
  sound.win();
}
function newGame(newSeed) {
  if (newSeed != null) {
    seed = newSeed; game.dispose();
    game = createGame(env, seed);
    for (const p of players) { game.initPlayer(p); game.setVisible(p, p.on); }
  }
  G.playTime = 0; G.winAt = null; G.left = TIMED_SEC;
  $('cn').textContent = '0'; $('ct').textContent = '/' + game.items.length;
  dust.clear(); spark.clear();
  const ps = onPlayers();
  for (const p of players) { p.S.collected = 0; p.tileCount.textContent = '0'; }
  ps.forEach((p, k) => resetPlayer(p, k, ps.length));
  renderBoard(); syncTimer();
}
function syncTimer() {
  $('timer').classList.toggle('hidden', !G.timed);
  $('timer').querySelector('b').textContent = fmt(Math.max(0, G.left));
  $('bTimed').textContent = G.timed ? '⏱️' : '♾️';
  $('bTimed').setAttribute('aria-pressed', String(G.timed));
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
  $('acts').classList.toggle('hidden', cam || G.mode !== 'play');
  for (const h of [$('hint'), $('camHint')]) { h.style.animation = 'none'; void h.offsetWidth; h.style.animation = ''; }
}
// ---------- ▶️ -> 👤 how many -> 📣 roll call -> practice -> play (keys skip all of it)
let practice = null, lastPractice = null, practiced = false, practiceOpt = params.get('practice') !== '0';
function go() {
  sound.init();
  if (G.mode === 'play' || G.mode === 'practice' || G.mode === 'pick' || G.mode === 'roll') return;
  const after = () => { if (pose.active && practiceOpt && !practiced) startPractice(); else start(); };
  if (pose.active && G.inputMode === 'cam' && G.mode === 'title') lockFlow({ pick: !lockedOk(pose.nPick) }, after); else start();
}
const lockedOk = (n) => pose.phase === 'locked' && pose.tracker.n === n && pose.tracker.filled.length === n && pose.tracker.filled.every((p) => p.state === 'active');
function lockFlow(opts, done) {
  const prev = G.mode;
  $('title').classList.add('hidden'); $('win').classList.add('hidden');
  const fin = () => { G.mode = prev; if (prev === 'title') $('title').classList.remove('hidden'); if (prev === 'win') $('win').classList.remove('hidden'); syncPlayersBtn(); done?.(); };
  const roll = () => {
    if (!opts.roll && lockedOk(pose.nPick)) { fin(); return; }
    G.mode = 'roll'; lockUI.showRoll(fin);
  };
  if (opts.pick === false) roll(); else { G.mode = 'pick'; lockUI.showPick(() => { syncPlayersBtn(); roll(); }); }
}
function syncPlayersBtn() { const b = $('bPlayers'); if (b) { b.querySelector('b').textContent = pose.nPick; b.setAttribute('aria-label', `Players: ${pose.nPick}. Change`); } }
function startPractice() {
  practice = new Practice(META.practice); practiced = true;
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
  if (got) { sound.chime(practice.i); renderPractice(); if (practice.done) { G.mode = 'title'; start(); } }
}
function skipPractice() { if (!practice) return; practice.skip(); G.mode = 'title'; start(); }

// ---------- controls: keys + touch + camera + test overrides -> one control set per player per step
function controls(p, playing) {
  const inp = p.in, c = { fwd: 0, turn: 0, vert: 0, jump: false, roar: false, stroke: false, step: false, cam: false, auto: !playing };
  c.fwd = Math.max(inp.fwd, inp.hold);
  c.turn = inp.right - inp.left + inp.drag;
  c.vert = inp.up - inp.down;
  const pe = pose.active ? pose.slots[p.slot] : null;
  if (pe && performance.now() - pe.outT < 400 && pe.out.tracked) { c.cam = true; c.fwd = Math.max(c.fwd, pe.out.fwd); c.turn += pe.out.turn; c.vert += pe.out.vert; }
  if (inp.test) { if (inp.test.fwd != null) c.fwd = inp.test.fwd; if (inp.test.turn != null) c.turn = inp.test.turn; if (inp.test.vert != null) c.vert = inp.test.vert; }
  c.turn = clamp(c.turn, -1, 1); c.vert = clamp(c.vert, -1, 1); c.fwd = clamp(c.fwd, 0, 1);
  for (const k in p.ev) { c[k] = p.ev[k]; p.ev[k] = false; }
  if (!playing) { c.fwd = c.turn = c.vert = 0; for (const k in p.ev) c[k] = false; }
  return c;
}
function action(name, slot) {
  if (G.mode !== 'play') return;
  const p = slot == null ? primary() : players[slot];
  if (p && p.on && name in p.ev) p.ev[name] = true;
}

// ---------- simulation
function stepPlayer(p, dt, playing) {
  if (p.away) { game.idle(p, dt); return; }
  const ctl = controls(p, playing);
  game.step(p, dt, playing, ctl);
  // guide arrow: over the hero, pointing at the nearest thing still to find (only when it is far)
  const T = game.camTarget(p), near = game.nearest(p);
  p.guide.visible = playing && !!near && near.d > META.guideMin;
  if (p.guide.visible) {
    p.guide.position.set(T.x, T.y + META.guideY + Math.sin(G.time * 4) * 0.15, T.z);
    p.guide.rotation.set(0, Math.atan2(-(near.x - T.x), -(near.z - T.z)), 0);
  }
  p.marker.position.set(T.x, T.y + META.guideY + 1.4 + Math.sin(G.time * 3 + p.slot) * 0.2, T.z); p.marker.rotation.y = G.time * 2;
  // chase camera
  const goal = camGoal(p, v1);
  p.cam.pos.lerp(v1, 1 - Math.exp(-C.posLerp * dt));
  v2.set(goal.x, goal.y + C.lookUp, goal.z).addScaledVector(fwd, C.lookAhead);
  p.cam.look.lerp(v2, 1 - Math.exp(-C.lookLerp * dt));
}
function step(dt) {
  G.time += dt;
  const playing = G.mode === 'play';
  if (playing) {
    G.playTime += dt;
    if (G.timed) { const before = Math.ceil(G.left); G.left -= dt; if (Math.ceil(G.left) !== before) $('timer').querySelector('b').textContent = fmt(Math.max(0, G.left)); if (G.left <= 0 && G.winAt == null) G.winAt = G.time; }
  }
  for (const p of onPlayers()) stepPlayer(p, dt, playing);
  if (playing && G.winAt != null && G.time >= G.winAt) showWin();
  dust.update(dt); spark.update(dt);
  game.update(G.time, dt, onPlayers(), playing);
}

// ---------- camera / input mode
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
  if (G.mode === 'play') showHint();
}
async function toggleCamera() {
  sound.init();
  if (pose.active) { pose.stop(); setMode('keys'); return; }
  setMode('cam');
  const ok = await pose.start();
  if (ok && (G.mode === 'play' || G.mode === 'practice') && pose.phase !== 'locked') pose.lockAuto(pose.nPick, true);
}
function toggleDuo() {
  sound.init();
  if (G.inputMode === 'keys2') { setMode('keys'); return; }
  if (pose.active) pose.stop();
  setMode('keys2');
}
function updateHint() {
  const duo = G.inputMode === 'keys2';
  $('hint').classList.toggle('duo', duo);
  $('hint').innerHTML = isTouch ? META.hintTouch : duo ? META.hintDuo : META.hintKeys;
}
async function camFirst() {
  if (pose.active || G.inputMode === 'keys2') return;
  setMode('cam');
  const ok = await pose.start();
  if (!ok && pose.status === 'tap') {
    const again = () => { removeEventListener('pointerdown', again, true); if (!pose.active && G.inputMode !== 'keys2') camFirst(); };
    addEventListener('pointerdown', again, true);
  }
}
const upperBodyInFrame = (b) => b.sw < 0.5 && b.head.y > 0.03 && b.sh.x > 0.08 && b.sh.x < 0.92;
const lockUI = new LockUI({
  cam: pose, sound: { pop: () => sound.chime(0), good: () => sound.chime(2) },
  getMap: () => { const r = $('camBox').getBoundingClientRect(); return r.width ? { x: (nx) => r.left + nx * r.width, y: (ny) => r.top + ny * r.height } : null; },
});
const menu = new BodyMenu({
  enabled: () => pose.active && G.mode !== 'play',
  scope: () => (G.mode === 'pick' || G.mode === 'roll' ? lockUI.scope : G.mode === 'practice' ? [$('practice')] : G.mode === 'win' ? [$('win'), $('tr')] : [$('title'), $('tr')]),
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
if (isTouch) { const h = $('howKeys'); if (h) h.innerHTML = META.howTouch; }
updateHint();
$('mCam').addEventListener('click', toggleCamera);
$('mDuo').addEventListener('click', toggleDuo);
keysBtn.addEventListener('click', () => { sound.init(); if (pose.active) pose.stop(); setMode('keys'); });
const muteBtn = $('muteBtn');
const syncMute = () => (muteBtn.textContent = sound.muted ? '🔇' : '🔊');
syncMute();
muteBtn.addEventListener('click', () => { sound.init(); sound.setMuted(!sound.muted); syncMute(); });
$('playBtn').addEventListener('click', go);
const camReady = () => pose.active && !['denied', 'nocam', 'tap'].includes(pose.status);
$('bPlayers').addEventListener('click', () => { sound.init(); if (camReady() && G.mode === 'title') lockFlow({ roll: true }); });
$('bRoll').addEventListener('click', () => { sound.init(); if (camReady() && G.mode === 'title') lockFlow({ pick: false, roll: true }); });
$('bTimed').addEventListener('click', () => { sound.init(); G.timed = !G.timed; G.left = TIMED_SEC; syncTimer(); });
syncPlayersBtn(); syncTimer();
$('pSkip').addEventListener('click', skipPractice);
$('replayBtn').addEventListener('click', start);
// on-screen action buttons (keys / touch mode): hold = continuous (up / down), tap = one-shot (roar / jump)
for (const b of document.querySelectorAll('#acts [data-act]')) {
  const a = b.dataset.act;
  const down = (e) => { e.preventDefault(); sound.init(); const p = primary(); if (a in p.in) p.in[a] = 1; else action(a); b.classList.add('on'); };
  const up = () => { const p = primary(); if (a in p.in) p.in[a] = 0; b.classList.remove('on'); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
}
// keys: META.keys = { code: [act, who] }; act is a held input (fwd/left/right/up/down) or a one-shot action (jump/roar/...)
const keyPlayer = (code) => { const k = META.keys[code]; if (G.inputMode === 'keys2' && k) return players[k[1] || 0]; return primary(); };
addEventListener('keydown', (e) => {
  const k = META.keys[e.code];
  if (k || e.code === 'Enter') e.preventDefault();
  if (e.code === 'KeyM') { muteBtn.click(); return; }
  if (e.code === 'KeyZ') { zoomBtn.click(); return; }
  if (G.mode === 'practice') { if (e.code === 'Space' || e.code === 'Enter') skipPractice(); return; }
  if (G.mode !== 'play') { if (e.code === 'Space' || e.code === 'Enter') start(); return; }
  if (!k) return;
  const p = keyPlayer(e.code);
  if (k[0] in p.in) p.in[k[0]] = 1; else if (!e.repeat) action(k[0], p.slot);
});
addEventListener('keyup', (e) => { const k = META.keys[e.code]; if (!k) return; const p = keyPlayer(e.code); if (k[0] in p.in) p.in[k[0]] = 0; });
addEventListener('blur', () => { for (const p of players) Object.assign(p.in, { fwd: 0, left: 0, right: 0, up: 0, down: 0, drag: 0, hold: 0 }); });
// touch / mouse on a screen: hold = go forward, drag sideways = turn, quick tap = META.tapAct (jump / up)
const drags = new Map();
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
  if ([...drags.values()].some((d) => d.slot === p.slot)) return;
  drags.set(e.pointerId, { slot: p.slot, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false });
  p.in.hold = 1;
  try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
});
cv.addEventListener('pointermove', (e) => {
  const d = drags.get(e.pointerId); if (!d) return;
  const w = layout.views[order.indexOf(d.slot)]?.w || innerWidth;
  const dx = e.clientX - d.x0; if (Math.abs(dx) > 12 || Math.abs(e.clientY - d.y0) > 12) d.moved = true;
  players[d.slot].in.drag = clamp(dx / (Math.min(w, 900) * 0.2), -1, 1);
});
const endDrag = (e) => {
  const d = drags.get(e.pointerId); if (!d) return;
  drags.delete(e.pointerId); const p = players[d.slot]; p.in.drag = 0; p.in.hold = 0;
  if (!d.moved && performance.now() - d.t0 < 260) action(META.tapAct, d.slot);
};
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (sound.ctx) document.hidden ? sound.ctx.suspend() : sound.ctx.resume(); });

// ---------- resize / layout / perf
const noAdapt = params.has('noadapt');
let viewDpr = dpr;
function resize() {
  const n = Math.max(1, order.length), q = VIEWQ[n];
  viewDpr = Math.min(dpr, q.dprCap);
  renderer.setPixelRatio(viewDpr);
  renderer.setSize(innerWidth, innerHeight);
  layout = layoutViewports(n, innerWidth, innerHeight, GAP);
  game.setQuality(q);
  const multi = n > 1 || pose.active;
  players.forEach((p) => p.tile.classList.add('hidden'));
  for (const p of players) if (!p.on) p.tile.classList.remove('isaway', 'isedge');
  layout.views.forEach((r, i) => {
    const p = players[order[i]]; if (!p) return;
    p.aspect = r.w / r.h;
    const t = p.tile;
    t.classList.remove('hidden'); t.classList.toggle('solo', !multi);
    Object.assign(t.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    t.classList.toggle('right', r.x + r.w >= innerWidth - 1);
    t.classList.toggle('bottom', r.y + r.h >= innerHeight - 1);
  });
  $('hud').classList.toggle('multi', n > 1); $('hud').dataset.n = n;
  document.body.classList.toggle('multi', n > 1); document.body.dataset.n = n;
  const b = $('board');
  if (layout.extra) {
    const r = layout.extra;
    Object.assign(b.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    b.classList.remove('hidden'); renderBoard();
  } else b.classList.add('hidden');
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

const perf = { fps: 0, frameMs: 0, dpr, calls: 0, triangles: 0, frames: 0, views: 1, viewRects: [] };
let fpsAcc = 0, fpsN = 0;
const clearCol = new THREE.Color(META.gapColor);
function render() {
  const n = order.length, H = innerHeight;
  renderer.info.reset();
  renderer.setScissorTest(false);
  if (n > 1) { renderer.setClearColor(clearCol, 1); renderer.clear(); }
  renderer.setScissorTest(n > 1);
  const rects = [];
  layout.views.forEach((r, i) => {
    const p = players[order[i]]; if (!p) return;
    renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h);
    renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h);
    camera.aspect = r.w / r.h; camera.fov = camFov(p); camera.updateProjectionMatrix();
    camera.position.copy(p.cam.pos); camera.lookAt(p.cam.look);
    const sc = (r.h * viewDpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    dust.mat.uniforms.uScale.value = spark.mat.uniforms.uScale.value = sc;
    game.setView(camera, p);
    // own guide arrow only in your own view; friends' heroes right in front of your camera are hidden for this view
    for (const q of players) { q.guide.visible = q === p && q.guide.userData.want; q.marker.visible = q.on && q !== p && n > 1; }
    for (const q of players) if (q !== p && q.on) game.setVisible(q, game.heroPos(q).distanceToSquared(camera.position) > 4);
    renderer.render(scene, camera);
    for (const q of players) game.setVisible(q, q.on);
    rects.push({ slot: p.slot, ...r });
  });
  if (layout.extra) {
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
resetPlayer(players[0]);
newGame();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const res = pose.tick(now);
  if (res) {
    syncPlayers();
    if (G.mode === 'play') for (const e of res) {
      const p = players[e.slot]; if (!p.on || p.away) continue;
      for (const k of ['jump', 'roar', 'stroke', 'step']) if (e.out[k]) p.ev[k] = true;
    }
  }
  if (G.mode === 'practice') updatePractice(dt);
  pose.tracker.swapEnabled = G.mode !== 'play';
  lockUI.update(dt);
  menu.update(pose.active ? pose.bodies : [], now / 1000);
  document.body.classList.toggle('camlive', pose.active && (pose.fake || pose.hasVideo)); document.body.classList.toggle('inplay', G.mode === 'play');
  if (!paused) { acc += dt; let n = 0; while (acc >= STEP && n++ < 6) { step(STEP); acc -= STEP; } if (n >= 6) acc = 0; }
  const ps = onPlayers(), playing = G.mode === 'play';
  for (const p of players) p.guide.userData.want = p.guide.visible;
  $('edge').classList.toggle('hidden', !(ps.length === 1 && primary().S.edge && playing));
  for (const p of ps) { p.tile.classList.toggle('isaway', p.away); p.tile.classList.toggle('isedge', ps.length > 1 && p.S.edge && playing); }
  // camera players standing still for a while get the big "march / swim" figure again
  $('camHint').classList.toggle('low', playing && G.inputMode === 'cam' && G.playTime > 4 && ps.some((p) => !p.away && game.stillFor(p) > 5));
  // "do this now" hint: ROAR under a golden-fruit tree, jump at an egg on a rock (figure in camera mode, key otherwise)
  const need = playing && ps.length ? game.hintFor(primary()) : null, nh = $('needHint');
  nh.classList.toggle('hidden', !need);
  if (need && nh.dataset.k !== need + G.inputMode) {
    nh.dataset.k = need + G.inputMode; nh.querySelector('canvas').dataset.demo = need;
    nh.querySelector('b').innerHTML = G.inputMode === 'cam' ? META.need[need].icon : isTouch ? META.need[need].touch : META.need[need].key;
    nh.classList.toggle('cam', G.inputMode === 'cam');
  }
  sound.ambient(game.ambient(primary()), META.underwater);
  render();
  for (const p of players) p.guide.visible = p.guide.userData.want;
  perf.frames++;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 2) {
    perf.fps = Math.round(fpsN / fpsAcc); perf.frameMs = +((fpsAcc / fpsN) * 1000).toFixed(1);
    if (!noAdapt && perf.fps < 45 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); perf.dpr = dpr; resize(); }
    fpsAcc = 0; fpsN = 0;
  }
}
requestAnimationFrame(frame);
if (params.get('autocam') !== '0') camFirst();

// ---------- test hooks
const pstate = (p) => ({ slot: p.slot, color: p.col.name, ...game.state(p), collected: p.S.collected, away: p.away, edge: p.S.edge, guide: p.guide.userData.want });
window.__game = {
  get state() {
    const p = primary();
    return {
      mode: G.mode, ...game.state(p), collected: teamTotal(), total: game.items.length, seed, time: G.time, playTime: G.playTime,
      inputMode: G.inputMode, edge: p.S.edge, gameOver: false, paused, players: order.length, timed: G.timed, left: G.left, zoom,
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
  get items() { return game.items.map((a) => ({ kind: a.kind, x: a.x, y: a.y, z: a.z, collected: a.collected, ...(a.extra ? a.extra() : {}) })); },
  get perf() { return { ...perf, dpr, viewDpr }; },
  get pose() {
    return { active: pose.active, fake: pose.fake, status: pose.status, frames: pose.frames, out: pose.out, raw: pose.raw,
      tracks: pose.tracks.map((k) => ({ id: k.id, slot: k.slot, state: k.state, x: +k.x.toFixed(3) })),
      outs: pose.players.map((e) => ({ slot: e.slot, ...e.out })) };
  },
  start,
  /** hold a control for a player: {fwd 0..1, turn -1..1, vert -1..1}; null = release */
  control(c, slot) { const p = slot == null ? primary() : players[slot]; p.in.test = c || null; },
  action: (name, slot) => action(name, slot),
  simulate(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) step(STEP); return this.state; },
  setPaused(v) { paused = !!v; acc = 0; },
  place(o, slot) { const p = slot == null ? primary() : players[slot]; game.place(p, o); snapCamera(p); },
  height: (x, z) => game.height(x, z),
  replay: (s) => { G.mode = 'win'; start(); if (s != null) newGame(s); },
  setTimed(v) { G.timed = !!v; G.left = TIMED_SEC; syncTimer(); },
  setLeft(s) { G.left = s; },
  toggleCamera, setMode, toggleDuo, go, skipPractice,
  get practice() { const P = practice || lastPractice; return P ? { live: P === practice, i: P.i, done: P.done, skipped: P.skipped, steps: P.steps.map((s) => ({ move: s.move, done: s.done })) } : null; },
  get menu() { return menu.state; },
  get zoom() { return zoom; }, setZoom,
  get chase() { const p = primary(); return { level: zoom, dist: camDist(p), height: camHeight(p), fov: camFov(p), camFov: camera.fov, cam: p.cam.pos.toArray(), look: p.cam.look.toArray() }; },
  camInfo: () => ({ ...pose.info, status: pose.status, active: pose.active, fake: pose.fake, ar: pose.ar }),
  get preview() {
    const b = $('camBox').getBoundingClientRect(), v = $('camVid'), c = $('camCv');
    return { box: { w: b.width, h: b.height, x: b.x, y: b.y }, video: { w: v.videoWidth, h: v.videoHeight }, canvas: { w: c.width, h: c.height }, fit: getComputedStyle(v).objectFit };
  },
  snapCamera: () => onPlayers().forEach(snapCamera),
  fakeCamera(opts = {}) {
    pose.startFake(); setMode('cam'); practiceOpt = !!opts.practice;
    if (opts.players) pose.setPlayers(opts.players);
    if (!opts.pick && !opts.roll) pose.lockAuto(opts.players || 4);
    else if (G.mode === 'title') lockFlow({ pick: !!opts.pick, roll: true });
  },
  get lock() { const tr = pose.tracker; return { phase: tr.phase, n: tr.n, pick: pose.nPick, numPoses: pose.numPoses, ui: lockUI.mode, roll: tr.rollState(), cands: pose.cands.length, swapEnabled: tr.swapEnabled, debug: { rejected: tr.debug.rejected.map((r) => r.why), held: tr.debug.held.map((h) => h.slot) } }; },
  pickPlayers: (n) => lockUI._picked(n),
  setFakeVideo: (c) => { pose.fakeFrame = c || null; },
  debug: (on = true) => lockUI.setDebug(on),
  get mode() { return G.mode; },
  injectPeople(list) { pose.inject(list); },
  fakeFrame(ar) { pose.fakeAr = ar; pose._fitBox(); },
  render,
  get game() { return game; },
  _three: { scene, renderer, camera },
};
