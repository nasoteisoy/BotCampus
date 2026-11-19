// Captain Bridge r1: walk the bridge as the captain (third person), talk to officers, read reports and
// flight plans, and flip to an outside view of the whole carrier with its routes.
import * as THREE from 'three';
import { loadModels } from './models.js';
import { buildBridge, collide, ROOM } from './bridge.js';
import { buildOutside } from './outside.js';
import { makeCrew, poseCrew } from './crew.js';
import { badgeSprite } from './icontex.js';
import { createSpaceAudio } from './audio.js';
import { createUI, hudButton, icon } from './ui.js';
import { DEPTS, OFFICERS, STATUS } from './data.js';

const Q = new URLSearchParams(location.search);
const TEST = Q.get('test') === '1', DEV = Q.get('dev') === '1';
const $ = (s) => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;

const sfxA = createSpaceAudio();
const SAVE_KEY = 'captain-bridge-settings';
const settings = Object.assign({ invert: false, sens: 1.0, fov: 62, muted: false }, (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (_) { return {}; } })());
const saveSettings = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(settings)); } catch (_) {} };
sfxA.setMuted(settings.muted);
const sfx = (n) => { try { sfxA[n]?.(); } catch (_) {} };

const models = await loadModels('./models/');
const B = buildBridge(models);
const O = buildOutside(models);
$('#loading').remove();

// ---------- crew
const captain = makeCrew('captain', '#2443b8', '#ffd23f', 1, '#3a6cf0');
B.scene.add(captain.root);
const player = { pos: new THREE.Vector3(0, 0, 3.4), yaw: Math.PI, speed: 0, r: 0.32, bumped: 0 };
const officers = OFFICERS.map((o, i) => {
  const d = DEPTS.find((x) => x.id === o.dept), st = B.stations[o.dept];
  const c = makeCrew('officer', d.color, '#ffffff', [0, 2, 3, 1, 4, 2][i] ?? 1);
  c.root.position.set(st.x, 0, st.z); c.root.rotation.y = st.yaw; B.scene.add(c.root);
  const tag = badgeSprite(d.icon, d.color, 0.56, { fg: '#10204a' }); tag.position.set(st.x, 2.25, st.z); B.scene.add(tag);
  const sdot = badgeSprite(STATUS[o.status].icon, STATUS[o.status].color, 0.26, { fg: '#ffffff' }); sdot.position.set(st.x + 0.34, 2.5, st.z); B.scene.add(sdot);
  B.colliders.push({ x0: st.x - 0.28, x1: st.x + 0.28, z0: st.z - 0.28, z1: st.z + 0.28 });
  return { o, d, c, st, tag, sdot, yaw: st.yaw, armed: true, phase: i * 1.3 };
});

// ---------- cameras
const bCam = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 6000);
const oCam = new THREE.PerspectiveCamera(50, 1, 1, 9000);
const look = { yaw: Math.PI, pitch: 0.28 };             // bridge follow-cam look (player-controlled)
const camPivot = new THREE.Vector3().copy(player.pos).setY(1.2);
let camDist = 3.4;                                       // current (collision-shortened) distance
const orbit = { yaw: -2.5, pitch: 0.42, dist: 640, gy: -2.5, gp: 0.42, gd: 640, t: new THREE.Vector3(0, 0, 60), gt: new THREE.Vector3(0, 0, 60) };
const ray = new THREE.Raycaster();
let view = 'bridge';

function camProfile() { // ground-lead-cam numbers: phone sits higher/further for thumbs, PC is a tight over-the-shoulder
  const narrow = innerWidth < 700 || innerHeight < 500;
  return narrow && isTouch ? { dist: 4.2, lookY: 1.25, side: -0.45 } : { dist: 3.2, lookY: 1.35, side: 0.45 };
}

function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
  for (const c of [bCam, oCam]) { c.aspect = w / h; c.updateProjectionMatrix(); }
  bCam.fov = settings.fov * (w < h ? 1.15 : 1); bCam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- UI
const ui = createUI({
  sfx,
  onClose() { talking = null; },
  onAct(act, id) {
    sfx('blip');
    if (act === 'reports') ui.reports();
    else if (act === 'show') { showPlan(id); }
    else if (act === 'invert') { settings.invert = !settings.invert; saveSettings(); ui.settings(settings); }
    else if (act === 'sens-' || act === 'sens+') { settings.sens = Math.round(Math.min(2, Math.max(0.4, settings.sens + (act === 'sens+' ? 0.2 : -0.2))) * 10) / 10; saveSettings(); ui.settings(settings); }
    else if (act === 'fov-' || act === 'fov+') { settings.fov = Math.min(80, Math.max(50, settings.fov + (act === 'fov+' ? 4 : -4))); saveSettings(); resize(); ui.settings(settings); }
    else if (act === 'mute') { settings.muted = !settings.muted; sfxA.setMuted(settings.muted); saveSettings(); ui.settings(settings); }
  },
});
const openSheet = (fn) => fn();
let talking = null;
hudButton('bReports', 'clipboard', 'Reports').addEventListener('click', () => { sfx('blip'); ui.open === 'reports' ? ui.close() : openSheet(ui.reports); });
hudButton('bPlans', 'route', 'Plans').addEventListener('click', () => { sfx('blip'); ui.open === 'plans' ? ui.close() : openSheet(ui.plans); });
hudButton('bSettings', 'settings', 'Settings').addEventListener('click', () => { sfx('blip'); ui.open === 'settings' ? ui.close() : openSheet(() => ui.settings(settings)); });
$('#bZoomIn').innerHTML = icon('plus', { size: 26 }); $('#bZoomOut').innerHTML = icon('minus', { size: 26 });
$('#sheetClose').innerHTML = icon('x', { size: 26 });
$('#bZoomIn').addEventListener('click', () => { zoomBy(0.75); sfx('blip'); });
$('#bZoomOut').addEventListener('click', () => { zoomBy(1 / 0.75); sfx('blip'); });
$('#bView').addEventListener('click', () => setView(view === 'bridge' ? 'outside' : 'bridge'));
function refreshHud() {
  $('#where').innerHTML = view === 'bridge' ? `${icon('bridge', { size: 24 })}<span>Bridge</span>` : `${icon('ship', { size: 24 })}<span>Outside</span>`;
  $('#bView').innerHTML = view === 'bridge' ? `${icon('ship', { size: 34 })}<span>Outside</span>` : `${icon('bridge', { size: 34 })}<span>Bridge</span>`;
  $('#zoom').hidden = view !== 'outside';
  document.body.classList.toggle('outside', view === 'outside');
  $('#hint').innerHTML = view === 'bridge'
    ? (isTouch ? `<span>${icon('walk', { size: 24 })}Left thumb</span><span>${icon('drag', { size: 24 })}Drag look</span><span>${icon('user', { size: 24 })}Tap crew</span>`
      : `<span>${icon('walk', { size: 24 })}WASD</span><span>${icon('drag', { size: 24 })}Drag look</span><span>${icon('user', { size: 24 })}Click crew</span>`)
    : `<span>${icon('drag', { size: 24 })}Drag turn</span><span>${icon('zoom', { size: 24 })}${isTouch ? 'Pinch' : 'Wheel'} zoom</span>`;
}
$('#stickGhost').innerHTML = icon('walk', { size: 30 });
let hintT = 7;
const clampD = (d) => Math.min(1600, Math.max(150, d));
const SHIP_C = new THREE.Vector3(0, 0, 40);
function zoomBy(f) { // zooming in also drifts the orbit centre back to the carrier, so the ship never leaves the shot
  const nd = clampD(orbit.gd * f); if (nd < orbit.gd) orbit.gt.lerp(SHIP_C, Math.min(1, 0.6 * (1 - nd / orbit.gd) + 0.15)); orbit.gd = nd;
}

function setView(v, quiet) {
  if (v === view) return;
  const f = $('#fade'); f.classList.add('on'); if (!quiet) sfx('whoosh');
  setTimeout(() => {
    view = v; refreshHud(); hintT = 6; $('#hint').classList.remove('off');
    if (v === 'outside') { O.setFocus(null); }
    stick.id = null; stick.x = stick.y = 0; showStick(false); f.classList.remove('on');
  }, 170);
}
function showPlan(id) {
  const fc = O.focusCenter(id); if (!fc) return;
  O.setFocus(id);
  orbit.gt.copy(fc.c).lerp(SHIP_C, innerWidth < innerHeight ? 0.4 : 0.15); orbit.gd = clampD(fc.s * (innerWidth < innerHeight ? 1.5 : 1.05)); orbit.gp = 0.55;
  if (view !== 'outside') setView('outside'); 
  if (innerWidth < innerHeight) ui.close();
}
refreshHud();

// ---------- input
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.repeat) return; const k = e.key.toLowerCase(); keys.add(k);
  if (k === 'v') setView(view === 'bridge' ? 'outside' : 'bridge');
  else if (k === 'r') openSheet(ui.reports); else if (k === 'p') openSheet(ui.plans);
  else if (k === 'escape') ui.close();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const canvas = renderer.domElement;
const ptrs = new Map();            // active pointers on the canvas
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
let pinch0 = 0, pinchD0 = 0;
function showStick(on, x, y) {
  const s = $('#stick'); s.classList.toggle('on', on); document.body.classList.toggle('stickon', on);
  if (on) { s.style.left = x + 'px'; s.style.top = y + 'px'; $('#knob').style.transform = ''; }
}
canvas.addEventListener('pointerdown', (e) => {
  sfxA.unlock?.().catch?.(() => {});
  canvas.setPointerCapture?.(e.pointerId);
  const p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0, type: e.pointerType, btn: e.button };
  ptrs.set(e.pointerId, p);
  if (view === 'bridge' && e.pointerType === 'touch' && e.clientX < innerWidth * 0.45 && stick.id === null) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; p.stick = true; showStick(true, e.clientX, e.clientY);
  }
  if (view === 'outside' && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchD0 = Math.hypot(a.x - b.x, a.y - b.y); pinch0 = orbit.gd; }
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) { if (e.pointerType === 'mouse' && view === 'bridge') canvas.style.cursor = pickOfficer(e.clientX, e.clientY) ? 'pointer' : 'grab'; return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
  if (p.stick) {
    let sx = e.clientX - stick.ox, sy = e.clientY - stick.oy; const m = Math.hypot(sx, sy), R = 56;
    if (m > R) { sx *= R / m; sy *= R / m; }
    stick.x = sx / R; stick.y = sy / R; $('#knob').style.transform = `translate(${sx}px,${sy}px)`; return;
  }
  if (view === 'outside' && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchD0 > 10) zoomBy(clampD(pinch0 * pinchD0 / Math.max(10, d)) / orbit.gd); return;
  }
  const s = (p.type === 'touch' ? 0.0062 : 0.0048) * settings.sens;
  if (view === 'bridge') {
    look.yaw -= dx * s; look.pitch += dy * s * (settings.invert ? -1 : 1);
    look.pitch = Math.max(-0.35, Math.min(1.0, look.pitch));
  } else {
    orbit.gy -= dx * s * 1.2; orbit.gp = Math.max(-1.2, Math.min(1.35, orbit.gp + dy * s * (settings.invert ? -1 : 1)));
  }
});
function endPtr(e) {
  const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
  if (p.stick) { stick.id = null; stick.x = stick.y = 0; showStick(false); return; }
  if (p.moved < 12 && performance.now() - p.t < 450 && view === 'bridge') {
    const hit = pickOfficer(e.clientX, e.clientY);
    if (hit) { openOfficer(hit); }
  }
}
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (view === 'outside') zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const _v = new THREE.Vector3();
function pickOfficer(x, y) {
  // 3D hit first, then the nearest officer badge/head within a thumb-sized radius
  const nd = new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(nd, bCam);
  const objs = officers.flatMap((f) => [f.c.root, f.tag]);
  const hits = ray.intersectObjects(objs, true);
  if (hits.length) { const o = officers.find((f) => f.tag === hits[0].object || isChild(hits[0].object, f.c.root)); if (o) return o; }
  let best = null, bd = 56;
  for (const f of officers) {
    for (const h of [1.1, 1.6, 2.25]) {
      _v.set(f.st.x, h, f.st.z).project(bCam); if (_v.z > 1) continue;
      const sx = (_v.x + 1) / 2 * innerWidth, sy = (1 - _v.y) / 2 * innerHeight, d = Math.hypot(sx - x, sy - y);
      if (d < bd) { bd = d; best = f; }
    }
  }
  return best;
}
function isChild(o, root) { for (let p = o; p; p = p.parent) if (p === root) return true; return false; }
function openOfficer(f, how = 'tap') {
  talking = f; if (how === 'walk') f.armed = false; openSheet(() => ui.officer(f.o)); lastOpen = { dept: f.o.dept, how };
}
let lastOpen = null;

// ---------- loop
const clock = new THREE.Clock(); let t = 0, fpsN = 0, fpsT = 0, fps = 0, stepT = 0;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _ideal = new THREE.Vector3(), _dir = new THREE.Vector3();
function update(dt) {
  t += dt;
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('#hint').classList.add('off'); }
  if (view === 'bridge') {
    // move relative to the camera
    let ix = 0, iz = 0;
    if (keys.has('w') || keys.has('arrowup')) iz += 1; if (keys.has('s') || keys.has('arrowdown')) iz -= 1;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1; if (keys.has('d') || keys.has('arrowright')) ix += 1;
    if (stick.id !== null) { ix += stick.x; iz -= stick.y; }
    const m = Math.min(1, Math.hypot(ix, iz));
    const moving = m > 0.12;
    if (moving) {
      _f.set(Math.sin(look.yaw), 0, Math.cos(look.yaw)); _r.set(-Math.cos(look.yaw), 0, Math.sin(look.yaw));
      _dir.copy(_f).multiplyScalar(iz).addScaledVector(_r, ix).normalize();
      const sp = 3.0 * m;
      player.pos.addScaledVector(_dir, sp * dt);
      const want = Math.atan2(_dir.x, _dir.z); let dy = ((want - player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      player.yaw += dy * Math.min(1, dt * 12);
      stepT -= dt; if (stepT <= 0) { sfx('step'); stepT = 0.34; }
    }
    if (collide(player.pos, player.r, B.colliders)) player.bumped = t;
    captain.root.position.copy(player.pos); captain.root.rotation.y = player.yaw;
    poseCrew(captain, moving ? 'run' : 'idle', dt);
    // officers: idle at their console; turn to face the captain while you talk
    for (const f of officers) {
      const dx = player.pos.x - f.st.x, dz = player.pos.z - f.st.z, d = Math.hypot(dx, dz);
      const want = talking === f ? Math.atan2(dx, dz) : f.st.yaw;
      let dy = ((want - f.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; f.yaw += dy * Math.min(1, dt * 5);
      f.c.root.rotation.y = f.yaw; poseCrew(f.c, 'idle', dt);
      f.tag.position.y = 2.25 + Math.sin(t * 2 + f.phase) * 0.04; f.sdot.position.y = f.tag.position.y + 0.2;
      if (d < 1.45 && f.armed && !(ui.open && ui.open.startsWith('officer:' + f.o.dept))) openOfficer(f, 'walk');
      if (d > 2.3 && !f.armed) { f.armed = true; if (talking === f && lastOpen?.how === 'walk' && ui.open === 'officer:' + f.o.dept) ui.close(); } // walking away closes a walk-up card
    }
    B.holo.rotation.y += dt * 0.4;
    // follow cam: pivot trails the captain (lag), then the camera is pulled in front of any wall
    const P = camProfile();
    camPivot.lerp(_v.set(player.pos.x, P.lookY, player.pos.z), 1 - Math.exp(-dt * 7));
    const cp = Math.cos(look.pitch), back = _ideal.set(-Math.sin(look.yaw) * cp, Math.sin(look.pitch), -Math.cos(look.yaw) * cp);
    const side = _r.set(-Math.cos(look.yaw), 0, Math.sin(look.yaw)).multiplyScalar(-P.side);
    const origin = _f.copy(camPivot).add(side);
    ray.set(origin, back.clone()); ray.far = P.dist + 0.3;
    const hits = ray.intersectObjects(B.camBlockers, false);
    const allowed = hits.length ? Math.max(0.2, hits[0].distance - 0.28) : P.dist;
    camDist = allowed < camDist ? allowed : camDist + (allowed - camDist) * Math.min(1, dt * 4);
    bCam.position.copy(origin).addScaledVector(back, camDist);
    bCam.position.y = Math.min(ROOM.h - 0.2, Math.max(0.3, bCam.position.y));
    bCam.position.x = Math.min(ROOM.x1 - 0.18, Math.max(ROOM.x0 + 0.18, bCam.position.x));
    bCam.position.z = Math.min(ROOM.z1 - 0.18, Math.max(ROOM.z0 + 0.18, bCam.position.z));
    captain.root.visible = bCam.position.distanceTo(origin) > 0.75; // never fill the screen with the captain's back
    bCam.lookAt(origin.x + Math.sin(look.yaw) * 2, origin.y + 0.1 - look.pitch * 0.6, origin.z + Math.cos(look.yaw) * 2);
  } else {
    O.update(dt, t);
    orbit.yaw += (orbit.gy - orbit.yaw) * Math.min(1, dt * 6); orbit.pitch += (orbit.gp - orbit.pitch) * Math.min(1, dt * 6);
    orbit.dist += (orbit.gd - orbit.dist) * Math.min(1, dt * 5); orbit.t.lerp(orbit.gt, Math.min(1, dt * 3));
    const cp = Math.cos(orbit.pitch);
    oCam.position.set(orbit.t.x + Math.sin(orbit.yaw) * cp * orbit.dist, orbit.t.y + Math.sin(orbit.pitch) * orbit.dist, orbit.t.z + Math.cos(orbit.yaw) * cp * orbit.dist);
    oCam.lookAt(orbit.t);
  }
}
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  renderer.render(view === 'bridge' ? B.scene : O.scene, view === 'bridge' ? bCam : oCam);
  if (DEV) { fpsN++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; const i = renderer.info.render; $('#dev').hidden = false; $('#dev').textContent = `${fps} fps · ${i.calls} calls · ${(i.triangles / 1000).toFixed(1)}k tris`; } }
}
renderer.setAnimationLoop(frame);
addEventListener('visibilitychange', () => { document.hidden ? sfxA.suspend() : sfxA.resume(); });

// read-only probe for automated QA (?test=1)
if (TEST) {
  window.__cb = {
    state() {
      const scr = (x, y, z, cam) => { _v.set(x, y, z).project(cam); return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight, on: _v.z < 1 && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1 }; };
      return {
        view, panel: ui.open, lastOpen, player: { x: player.pos.x, z: player.pos.z, yaw: player.yaw, bumped: player.bumped, t },
        look: { ...look }, camDist, cam: bCam.position.toArray(), orbitDist: orbit.dist, orbitGoal: orbit.gd, orbitYaw: orbit.yaw,
        officers: officers.map((f) => ({ dept: f.o.dept, x: f.st.x, z: f.st.z, scr: scr(f.st.x, 1.3, f.st.z, bCam) })),
        ship: scr(0, 0, 40, oCam),
        routes: Object.values(O.plans).map((P) => ({ id: P.p.id, scr: scr(...P.curve.getPointAt(0.5).toArray(), oCam) })),
      };
    },
  };
}
