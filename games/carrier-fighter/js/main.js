// Carrier Fighter — take off from the carrier, pop 5 target balloons, fly home and land.
import * as THREE from 'three';
import { buildWorld, toon } from './world.js';
import { loadModels, DECK_Y, DECK } from './models.js';
import { createTargets, markerTex, TARGET_R } from './targets.js';
import { createLanding, approachStep, inFunnel, GP0, TD, glideY } from './landing.js';
import { createPlane, resetPlane, flyStep, integrate, applyPose, FLY } from './flight.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { Particles } from './particles.js';
import { icon } from './icons.js';

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test'), DEV = Q.has('dev');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('pc', !isTouch);

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 4000);
const world = buildWorld(scene);
const fxAdd = new Particles(scene, 700, true, 1.4);
const fxN = new Particles(scene, 1200, false, 1.2);
const audio = createAudio();

// ---------- HUD wiring ----------
const ico = (el, name, size) => { el.innerHTML = icon(name, { size: size || 26 }); };
ico($('btnMenu'), 'menu'); ico($('btnInfo'), 'info'); ico($('btnMute'), 'volume');
ico($('btnGo'), 'go', 48); ico($('btnFire'), 'crosshair', 48); ico($('btnPlay'), 'play', 48); ico($('btnAgain'), 'refresh', 46);
ico($('cClose'), 'x');
document.querySelectorAll('[data-ico]').forEach((el) => ico(el, el.dataset.ico, 36));
$('mResume').querySelector('i').innerHTML = icon('play'); $('mRestart').querySelector('i').innerHTML = icon('refresh'); $('mCredits').querySelector('i').innerHTML = icon('info');
document.querySelector('.win .trophy').innerHTML = icon('trophy', { size: 56 });
document.querySelectorAll('.stars i').forEach((el) => { el.innerHTML = icon('star', { size: 44 }); });
const pipsEl = $('pips');
for (let i = 0; i < 5; i++) { const d = document.createElement('div'); d.className = 'pip'; d.innerHTML = icon('target', { size: 28 }); pipsEl.appendChild(d); }
const keysEl = $('keys');
const K = (t) => `<span class="k">${t}</span>`;
const KEYS_DECK = `<span class="grp">${K('Space')} ${icon('go', { size: 20 })}</span>`;
const KEYS_FLY = `<span class="grp">${K('←')}${K('→')}${K('↑')}${K('↓')} ${icon('plane', { size: 20 })}</span><span class="grp">${K('Space')} ${icon('crosshair', { size: 20 })}</span>`;

// long-press / hover tips for icon buttons
const tipEl = $('tip'); let tipTimer = 0, tipShown = false;
document.querySelectorAll('[data-tip]').forEach((b) => {
  b.title = b.dataset.tip;
  b.addEventListener('pointerdown', () => {
    clearTimeout(tipTimer); tipShown = false;
    tipTimer = setTimeout(() => {
      const r = b.getBoundingClientRect(); tipEl.textContent = b.dataset.tip; tipEl.classList.remove('hidden');
      tipEl.style.left = Math.min(innerWidth - 120, Math.max(8, r.left)) + 'px'; tipEl.style.top = (r.bottom + 8) + 'px'; tipShown = true;
    }, 450);
  });
  const hide = () => { clearTimeout(tipTimer); setTimeout(() => tipEl.classList.add('hidden'), 600); };
  b.addEventListener('pointerup', hide); b.addEventListener('pointerleave', hide);
  b.addEventListener('click', (e) => { if (tipShown) { e.stopImmediatePropagation(); tipShown = false; } }, true);
});

const input = createInput({ stickZone: $('stickZone'), stickBase: $('stickBase'), stickKnob: $('stickKnob'), btnFire: $('btnFire'), btnGo: $('btnGo'), canvas });

// ---------- game objects (filled after load) ----------
let carrier, fighter, targets, landing, arrow, homeSprite;
const plane = createPlane();
const G = { phase: 'loading', paused: false, t: 0, phaseT: 0, runT: 0, hits: 0, shots: 0, timeScale: 1, hitStopT: 0, trauma: 0, fireCd: 0, waveOffs: 0, landedT: 0 };
const bullets = []; let bulletMesh;
const camPos = new THREE.Vector3(0, 30, 140), camLook = new THREE.Vector3(0, DECK_Y, 40);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function buildArrow() {
  const g = new THREE.Group();
  const shaft = new THREE.CylinderGeometry(0.32, 0.32, 2.4, 10); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -0.2);
  const head = new THREE.ConeGeometry(0.85, 1.6, 12); head.rotateX(Math.PI / 2); head.translate(0, 0, 1.6);
  const mat = toon(0xffd23f, { emissive: 0x7a5a00, emissiveIntensity: 0.4 });
  const out = new THREE.MeshBasicMaterial({ color: 0x13294b, side: THREE.BackSide });
  for (const geo of [shaft, head]) {
    g.add(new THREE.Mesh(geo, mat));
    const o = new THREE.Mesh(geo, out); o.scale.setScalar(1.12); g.add(o);
  }
  g.renderOrder = 5;
  return g;
}

function buildBullets() {
  const geo = new THREE.BoxGeometry(0.22, 0.22, 3.2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  bulletMesh = new THREE.InstancedMesh(geo, mat, 90);
  bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bulletMesh.count = 0; bulletMesh.frustumCulled = false;
  scene.add(bulletMesh);
}

// ---------- phases ----------
const BANNERS = {
  deck: () => ['go', isTouch ? 'Tap GO' : 'Press Space'],
  takeoff: () => ['takeoff', 'Take off!'],
  mission: () => ['target', 'Pop the balloons'],
  home: () => ['anchor', G.waveOffs ? 'Try again' : 'Fly home'],
  approach: () => ['rings', 'Fly through rings'],
  trap: () => ['land', 'Landed!'],
};
function setBanner() {
  const b = BANNERS[G.phase]; const el = $('banner');
  if (!b) { el.classList.add('hidden'); return; }
  const [ic, text] = b();
  el.classList.remove('hidden');
  el.querySelector('.bi').innerHTML = icon(ic, { size: 22 });
  el.querySelector('.bt').textContent = text;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function setPhase(ph) {
  G.phase = ph; G.phaseT = 0;
  const flying = ph === 'mission' || ph === 'home' || ph === 'approach';
  $('btnGo').classList.toggle('hidden', ph !== 'deck');
  $('btnFire').classList.toggle('hidden', ph !== 'mission');
  $('stickZone').classList.toggle('hidden', !flying);
  $('guide').classList.toggle('hidden', ph !== 'approach');
  keysEl.classList.toggle('hidden', isTouch || !(ph === 'deck' || ph === 'mission'));
  keysEl.innerHTML = ph === 'deck' ? KEYS_DECK : KEYS_FLY;
  landing.show(ph === 'home' || ph === 'approach' || ph === 'trap');
  homeSprite.visible = ph === 'home';
  setBanner();
}

function resetGame() {
  resetPlane(plane); targets.reset(); targets.restoreSprites(); landing.reset();
  bullets.length = 0; bulletMesh.count = 0; fxAdd.clear(); fxN.clear(); input.reset();
  G.hits = 0; G.shots = 0; G.runT = 0; G.trauma = 0; G.waveOffs = 0; G.timeScale = 1; G.hitStopT = 0; G.fireCd = 0;
  [...pipsEl.children].forEach((p) => { p.classList.remove('done', 'pop'); p.innerHTML = icon('target', { size: 28 }); });
  $('win').classList.add('hidden'); $('menu').classList.add('hidden'); $('credits').classList.add('hidden');
  G.paused = false;
  applyPose(plane, fighter);
  camPos.set(0, DECK_Y + 7, 70 + 19); camLook.set(0, DECK_Y + 2, 40);
  setPhase('deck');
}

// ---------- feel ----------
function addTrauma(a) { if (!REDUCED) G.trauma = Math.min(1, G.trauma + a); }
function hitStop(sec) { if (!REDUCED) { G.hitStopT = sec; G.timeScale = 0.08; } }
function flash(alpha) { if (REDUCED) return; const f = $('flash'); f.style.transition = 'none'; f.style.opacity = alpha; requestAnimationFrame(() => { f.style.transition = 'opacity .25s'; f.style.opacity = 0; }); }

function popTarget(t) {
  targets.pop(t); G.hits++;
  const p = t.g.position;
  const cols = [[1, 0.29, 0.33], [1, 1, 1], [1, 0.82, 0.25], [0.24, 0.8, 0.48], [0.35, 0.65, 1]];
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * 6.28, b = Math.random() * 3.14 - 1.57, s = 14 + Math.random() * 22, c = cols[i % cols.length];
    fxN.spawn(p.x, p.y, p.z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + 6, Math.sin(a) * Math.cos(b) * s, 1.4 + Math.random() * 0.8, 2.6, 1.6, c[0], c[1], c[2], 1, 1.6, 9);
  }
  for (let i = 0; i < 16; i++) fxAdd.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.35, 5, 12, 1, 0.9, 0.5, 0.9, 3, 0);
  audio.pop(); addTrauma(0.35); hitStop(0.07); flash(0.18);
  const pip = pipsEl.children[G.hits - 1]; if (pip) { pip.classList.add('done', 'pop'); pip.innerHTML = icon('check', { size: 28 }); }
  if (targets.alive().length === 0) setTimeout(() => { if (G.phase === 'mission') setPhase('home'); }, 700);
}

function fire(dt) {
  G.fireCd -= dt;
  if (G.fireCd > 0) return;
  G.fireCd = 0.09; G.shots++;
  // aim assist: snap the stream onto a balloon inside a wide cone
  let aim = null, best = 0.96;
  for (const t of targets.alive()) {
    tmpV.subVectors(t.g.position, plane.pos); const d = tmpV.length();
    if (d > 560) continue;
    const c = tmpV.normalize().dot(tmpV2.set(-Math.sin(plane.yaw) * Math.cos(plane.pitch), Math.sin(plane.pitch), -Math.cos(plane.yaw) * Math.cos(plane.pitch)));
    if (c > best) { best = c; aim = t; }
  }
  for (const m of fighter.userData.muzzles) {
    const o = m.clone().applyMatrix4(fighter.matrixWorld);
    const dir = aim ? tmpV.subVectors(aim.g.position, o).normalize().clone()
      : new THREE.Vector3(-Math.sin(plane.yaw) * Math.cos(plane.pitch), Math.sin(plane.pitch), -Math.cos(plane.yaw) * Math.cos(plane.pitch));
    bullets.push({ p: o, v: dir.multiplyScalar(260 + plane.speed), life: 1.6 });
    fxAdd.spawn(o.x, o.y, o.z, 0, 0, 0, 0.06, 1.6, 0.6, 1, 0.85, 0.4, 1, 0, 0);
  }
  if (bullets.length > 88) bullets.splice(0, bullets.length - 88);
  audio.gun();
}

function updateBullets(dt) {
  let n = 0;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const prev = tmpV2.copy(b.p);
    b.p.addScaledVector(b.v, dt); b.life -= dt;
    let hit = false;
    const seg = tmpV.subVectors(b.p, prev), L2 = seg.lengthSq() || 1;
    for (const t of targets.alive()) {
      // segment-sphere test, generous radius for kids
      const c = t.g.position;
      const k = THREE.MathUtils.clamp((c.x - prev.x) * seg.x + (c.y - prev.y) * seg.y + (c.z - prev.z) * seg.z, 0, L2) / L2;
      const dx = prev.x + seg.x * k - c.x, dy = prev.y + seg.y * k - c.y, dz = prev.z + seg.z * k - c.z;
      if (dx * dx + dy * dy + dz * dz < (TARGET_R + 2.5) ** 2) { popTarget(t); hit = true; break; }
    }
    if (hit || b.life <= 0 || b.p.y < 0) { bullets.splice(i, 1); continue; }
  }
  for (const b of bullets) {
    tmpQ.setFromUnitVectors(Z_AXIS, tmpV.copy(b.v).normalize());
    tmpM.compose(b.p, tmpQ, tmpV2.set(1, 1, 1));
    bulletMesh.setMatrixAt(n++, tmpM);
  }
  bulletMesh.count = n; bulletMesh.instanceMatrix.needsUpdate = true;
}

// ---------- per-phase simulation ----------
let guideErr = { errX: 0, errY: 0 };
function step(dt, inp) {
  G.phaseT += dt;
  if (G.phase !== 'deck' && G.phase !== 'win' && G.phase !== 'trap') G.runT += dt;
  switch (G.phase) {
    case 'deck':
      if (inp.go) { audio.unlock(); audio.go(); setPhase('takeoff'); }
      break;
    case 'takeoff': {
      plane.speed = Math.min(FLY.liftSpeed + 8, plane.speed + FLY.takeoffAccel * dt);
      plane.yawRate = 0;
      if (plane.pos.z < -30 && plane.speed > FLY.liftSpeed) plane.vy += (6 - plane.vy) * (1 - Math.exp(-3 * dt));
      else plane.vy = 0;
      integrate(plane, dt);
      plane.pos.y = Math.max(DECK_Y, plane.pos.y);
      if (plane.pos.z < -40 && plane.pos.y > DECK_Y + 0.3 && Math.random() < 0.6) {
        const p = plane.pos; fxN.spawn(p.x, DECK_Y + 0.4, p.z + 3, 0, 1, 4, 0.8, 1.5, 4, 1, 1, 1, 0.5, 1, -0.5);
      }
      if (plane.pos.z < DECK.bow - 12) { plane.climbAssist = 2.5; setPhase('mission'); }
      break;
    }
    case 'mission':
      flyStep(plane, inp, dt);
      if (inp.fire) fire(dt);
      break;
    case 'home':
      flyStep(plane, inp, dt);
      if (inFunnel(plane)) { setPhase('approach'); }
      break;
    case 'approach': {
      guideErr = approachStep(plane, inp, dt);
      integrate(plane, dt);
      const z = plane.pos.z;
      if (z <= TD.z + 4) {
        if (Math.abs(plane.pos.x) < 10 && plane.pos.y < DECK_Y + 8) { touchDown(); }
        else { waveOff(); }
      } else if (Math.abs(plane.pos.x) > 320 || z > 900) { setPhase('home'); }
      break;
    }
    case 'trap': {
      const decel = 13;
      plane.speed = Math.max(0, plane.speed - decel * dt);
      plane.vy = 0; plane.yawRate *= 0.9; plane.pos.x *= 1 - Math.min(1, 3 * dt);
      plane.yaw += (0 - plane.yaw) * Math.min(1, 3 * dt);
      integrate(plane, dt);
      plane.pos.y = DECK_Y; plane.pitch *= 0.9;
      if (plane.speed === 0) { G.landedT += dt; if (G.landedT > 0.9) showWin(); }
      break;
    }
  }
}
function touchDown() {
  plane.pos.y = DECK_Y; plane.vy = 0; G.landedT = 0;
  audio.thud(); addTrauma(0.45); flash(0.12);
  for (let i = 0; i < 26; i++) fxN.spawn(plane.pos.x + (Math.random() - 0.5) * 5, DECK_Y + 0.5, plane.pos.z + 2, (Math.random() - 0.5) * 6, 2 + Math.random() * 3, 6 + Math.random() * 6, 1.2, 1.8, 5, 1, 1, 1, 0.6, 1.2, -0.4);
  setPhase('trap');
}
function waveOff() {
  G.waveOffs++; plane.climbAssist = 2.5; landing.reset(); setPhase('home');
}
function showWin() {
  if (G.phase === 'win') return;
  setPhase('win'); $('banner').classList.add('hidden');
  const t = Math.round(G.runT);
  $('wTime').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('wTargets').textContent = `${G.hits}/5`;
  const stars = t < 110 ? 3 : t < 170 ? 2 : 1;
  document.querySelectorAll('.stars i').forEach((el, i) => el.classList.toggle('on', i < stars));
  $('win').classList.remove('hidden');
  audio.win();
}

// ---------- camera ----------
let shakeT = 0;
function updateCamera(dt, rdt) {
  const portrait = camera.aspect < 1;
  const ph = G.phase;
  const fwd = plane.fwd;
  if (ph === 'title') {
    const a = G.t * 0.12;
    tmpV.set(Math.sin(a) * 150, 55, Math.cos(a) * 150 + 20);
    camPos.lerp(tmpV, 1 - Math.exp(-2 * rdt)); camLook.lerp(tmpV2.set(0, DECK_Y, 10), 1 - Math.exp(-3 * rdt));
  } else if (ph === 'trap' || ph === 'win') {
    // slow orbit, plane kept in the lower part of the frame (the win card sits in the middle)
    const a = 0.7 + (ph === 'win' ? G.phaseT * 0.1 : 0);
    const dist = portrait ? 34 : 26;
    tmpV.set(plane.pos.x - 14 + Math.sin(a) * dist, DECK_Y + 12, plane.pos.z + Math.cos(a) * dist);
    camPos.lerp(tmpV, 1 - Math.exp(-2 * rdt)); camLook.lerp(tmpV2.copy(plane.pos).setY(DECK_Y + (ph === 'win' ? 9 : 3)), 1 - Math.exp(-3 * rdt));
  } else {
    const back = (ph === 'deck' || ph === 'takeoff' ? 19 : 16) * (portrait ? 1.25 : 1);
    const up = ph === 'deck' || ph === 'takeoff' ? 6.5 : 4.8 + Math.max(0, -plane.pitch) * 6;
    tmpV.copy(plane.pos).addScaledVector(fwd, -back); tmpV.y += up - Math.sin(plane.pitch) * back * 0.5;
    const rate = ph === 'deck' ? 10 : 5.5;
    camPos.lerp(tmpV, 1 - Math.exp(-rate * rdt));
    // never dip below the floor / deck while following
    camPos.y = Math.max(camPos.y, 3);
    tmpV2.copy(plane.pos).addScaledVector(fwd, 28); tmpV2.y += 2.2 + Math.sin(plane.pitch) * 20;
    camLook.lerp(tmpV2, 1 - Math.exp(-9 * rdt));
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  // additive trauma shake (smooth sin noise), never moves the plane
  G.trauma = Math.max(0, G.trauma - 1.3 * rdt); shakeT += rdt * 30;
  const s = G.trauma * G.trauma;
  if (s > 0) {
    camera.position.x += 0.9 * s * Math.sin(shakeT * 1.7); camera.position.y += 0.6 * s * Math.sin(shakeT * 2.3);
    camera.rotateZ(0.03 * s * Math.sin(shakeT * 1.1));
  }
}

// ---------- guide arrow + markers ----------
function updateGuides(t) {
  const ph = G.phase;
  let goal = null;
  if (ph === 'mission') {
    let best = 1e9;
    for (const tg of targets.alive()) { const d = tg.g.position.distanceToSquared(plane.pos); if (d < best) { best = d; goal = tg.g.position; } }
  } else if (ph === 'home') goal = GP0;
  arrow.visible = !!goal;
  const edge = $('edge');
  if (goal) {
    arrow.position.copy(plane.pos).addScaledVector(plane.fwd, 14); arrow.position.y += 5.8;
    // keep the arrow mostly level so it reads as "turn this way" instead of a foreshortened dot
    tmpV.copy(goal); tmpV.y = arrow.position.y + THREE.MathUtils.clamp(goal.y - arrow.position.y, -25, 25) * 0.25;
    arrow.lookAt(tmpV);
    const s = 1.7 * (1 + 0.08 * Math.sin(t * 7)); arrow.scale.setScalar(s);
    // 2D edge pointer when the goal is off screen
    tmpV.copy(goal).project(camera);
    const behind = tmpV.z > 1;
    let nx = behind ? -tmpV.x : tmpV.x, ny = behind ? -tmpV.y : tmpV.y;
    const off = behind || Math.abs(nx) > 0.92 || Math.abs(ny) > 0.88;
    edge.classList.toggle('hidden', !off);
    if (off) {
      if (behind && Math.abs(nx) < 0.05) nx = 0.05;
      const m = Math.max(Math.abs(nx) / 0.86, Math.abs(ny) / 0.78); nx /= m; ny /= m;
      const px = (nx * 0.5 + 0.5) * innerWidth, py = (-ny * 0.5 + 0.5) * innerHeight;
      const ang = Math.atan2(-ny, nx) + Math.PI; // svg arrow points left at 0deg
      edge.style.transform = `translate(${px}px, ${py}px) rotate(${ang}rad)`;
    }
  } else edge.classList.add('hidden');
  const mul = camera.aspect < 1 ? 1.5 : 1;
  homeSprite.scale.set(0.05 * mul, 0.05 * mul, 1);
  // landing guide chevrons (point the way back onto the path)
  if (ph === 'approach') {
    const ex = guideErr.errX, ey = guideErr.errY;
    const g = $('guide');
    g.querySelector('.chev.left').classList.toggle('on', ex > 3);
    g.querySelector('.chev.right').classList.toggle('on', ex < -3);
    g.querySelector('.chev.down').classList.toggle('on', ey > 3);
    g.querySelector('.chev.up').classList.toggle('on', ey < -3);
    const dot = g.querySelector('.gdot');
    dot.style.transform = `translate(${THREE.MathUtils.clamp(ex * 1.5, -40, 40)}px, ${THREE.MathUtils.clamp(-ey * 1.5, -40, 40)}px)`;
  }
}

// ---------- plane feel (prop, contrails) ----------
function planeFeel(dt) {
  const u = fighter.userData;
  const rpm = G.phase === 'deck' ? 0.35 : G.phase === 'win' || (G.phase === 'trap' && plane.speed === 0) ? 0.15 : Math.min(1, 0.4 + plane.speed / 60);
  u.blades.rotation.z += dt * (8 + rpm * 70);
  u.blades.visible = rpm < 0.45; u.disc.visible = rpm >= 0.45;
  audio.engine(rpm, G.phase !== 'title' && G.phase !== 'loading');
  if ((G.phase === 'mission' || G.phase === 'home') && Math.abs(plane.bank) > 0.35) {
    for (const w of u.wingTips) { const p = w.clone().applyMatrix4(fighter.matrixWorld); fxN.spawn(p.x, p.y, p.z, 0, 0, 0, 0.6, 0.18, 0.55, 1, 1, 1, 0.5, 0, 0); }
  }
}

// ---------- loop ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsShow = 0, fpsLowT = 0;
const fpsLog = [];
function frame(now) {
  let rdt = (now - last) / 1000; last = now;
  rdt = Math.min(Math.max(rdt, 0), 0.1);
  fpsAcc += rdt; fpsN++;
  if (fpsAcc > 1) {
    fpsShow = fpsN / fpsAcc; fpsLog.push(Math.round(fpsShow)); if (fpsLog.length > 600) fpsLog.shift();
    // adaptive resolution: drop to 1x if sustained low fps
    if (fpsShow < 40 && pixelRatio > 1) { fpsLowT++; if (fpsLowT >= 3) { pixelRatio = 1; renderer.setPixelRatio(1); onResize(); } } else fpsLowT = 0;
    fpsAcc = 0; fpsN = 0;
  }
  if (G.hitStopT > 0) { G.hitStopT -= rdt; if (G.hitStopT <= 0) G.timeScale = 1; }
  const dt = rdt * G.timeScale;
  if (!G.paused && G.phase !== 'loading') {
    G.t += rdt;
    const inp = input.sample();
    if (G.phase !== 'title' && G.phase !== 'win') step(dt, inp);
    else if (G.phase === 'win' && inp.go && G.phaseT > 0.8) resetGame();
    if (G.phase === 'win') G.phaseT += rdt;
    applyPose(plane, fighter);
    fighter.updateMatrixWorld();
    updateBullets(dt);
    planeFeel(dt);
    updateGuides(G.t);
    const passed = landing.update(dt, G.t, plane, G.phase === 'approach');
    if (passed >= 0) { audio.ring(); for (let i = 0; i < 18; i++) { const r = landing.rings[passed]; const a = i / 18 * 6.28; fxAdd.spawn(r.m.position.x + Math.cos(a) * r.r, r.m.position.y + Math.sin(a) * r.r, r.z, 0, 0, 0, 0.5, 3, 0.5, 1, 0.9, 0.3, 0.9, 0, 0); } }
    targets.update(dt, G.t, camera.aspect < 1 ? 1.5 : 1);
    world.update(dt, G.t);
    fxAdd.update(dt); fxN.update(dt);
    updateCamera(dt, rdt);
  }
  renderer.render(scene, camera);
  if (DEV) $('dev').textContent = `fps ${fpsShow.toFixed(0)} | calls ${renderer.info.render.calls} | tris ${renderer.info.render.triangles} | pr ${pixelRatio}`;
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.fov = w < h ? 74 : 62;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.suspend(); else { audio.resume(); last = performance.now(); } });

// ---------- menus ----------
function pause(v) { G.paused = v; if (v) input.reset(); last = performance.now(); }
$('btnPlay').addEventListener('click', () => { audio.unlock(); $('title').classList.add('hidden'); $('hud').classList.remove('hidden'); resetGame(); });
$('btnMenu').addEventListener('click', () => { pause(true); $('menu').classList.remove('hidden'); });
$('mResume').addEventListener('click', () => { $('menu').classList.add('hidden'); pause(false); });
$('mRestart').addEventListener('click', () => { resetGame(); });
const openCredits = () => { pause(true); $('menu').classList.add('hidden'); $('credits').classList.remove('hidden'); };
$('mCredits').addEventListener('click', openCredits); $('btnInfo').addEventListener('click', openCredits);
$('cClose').addEventListener('click', () => { $('credits').classList.add('hidden'); if (G.phase === 'title') return; pause(false); });
$('btnMute').addEventListener('click', () => { audio.setMuted(!audio.muted); ico($('btnMute'), audio.muted ? 'mute' : 'volume'); });
$('btnAgain').addEventListener('click', () => { resetGame(); });
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && G.phase !== 'title' && G.phase !== 'loading') {
    const open = !$('menu').classList.contains('hidden') || !$('credits').classList.contains('hidden');
    $('menu').classList.add('hidden'); $('credits').classList.add('hidden');
    if (open) pause(false); else { pause(true); $('menu').classList.remove('hidden'); }
  }
  if (e.code === 'KeyR' && G.phase === 'win') resetGame();
  if ((e.code === 'Enter' || e.code === 'Space') && G.phase === 'title' && !$('title').classList.contains('hidden')) { e.preventDefault(); $('btnPlay').click(); }
});

// ---------- boot ----------
async function boot() {
  onResize();
  const m = await loadModels();
  carrier = m.carrier; fighter = m.fighter;
  scene.add(carrier, fighter);
  targets = createTargets(scene);
  landing = createLanding(scene); landing.show(false);
  arrow = buildArrow(); scene.add(arrow); arrow.visible = false;
  homeSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex('home'), sizeAttenuation: false, depthTest: false, transparent: true }));
  homeSprite.position.set(0, DECK_Y + 45, 30); homeSprite.renderOrder = 10; homeSprite.visible = false; scene.add(homeSprite);
  buildBullets();
  applyPose(plane, fighter);
  $('loading').classList.add('hidden');
  G.phase = 'title';
  renderer.setAnimationLoop(frame);
}
boot().catch((e) => { console.error(e); });

if (TEST) {
  // read-only probe for automated QA; it never drives the game (all play goes through real input)
  window.__cf = {
    state: () => ({
      phase: G.phase, paused: G.paused, hits: G.hits, shots: G.shots, runT: G.runT, waveOffs: G.waveOffs,
      plane: { x: plane.pos.x, y: plane.pos.y, z: plane.pos.z, yaw: plane.yaw, speed: plane.speed, vy: plane.vy },
      targets: targets ? targets.list.map((t) => ({ x: t.g.position.x, y: t.g.position.y, z: t.g.position.z, alive: t.alive })) : [],
      gp0: { x: GP0.x, y: GP0.y, z: GP0.z }, td: { x: TD.x, y: TD.y, z: TD.z }, glideAtPlane: glideY(plane.pos.z),
      fps: fpsShow, fpsLog: fpsLog.slice(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pixelRatio,
    }),
  };
}
