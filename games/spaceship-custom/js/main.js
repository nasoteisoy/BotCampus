// SpaceShip Editor (Army HQ). Ships live in the shared army save 'botcampus:army' as army.spaceships[] (one entry per ship,
// owned by a player = that player's nation via playerId). Write safety (same rules as the Trooper Customizer):
//  - dirty flag: nothing is written until this page changed a ship;
//  - merge on write: re-read storage right before writing and replace ONLY spaceships[] entries this page changed or deleted;
//    every other army field (players, units, squads, ships, ext, updatedAt, unknown keys) is written back exactly as stored;
//  - 'storage' listener: another tab / iframe changed the save → reload (when clean) and re-render.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/addons/controls/OrbitControls.js?v=1';
import * as Army from '../../shared/army/schema.js?v=8';
import * as S from './ship-stats.js?v=1';
import { ShipLook, buildShip } from './ship3d.js?v=1';
import { Demo } from './demo.js?v=1';

const $ = (s) => document.querySelector(s);
const h = (tag, attrs = {}, kids = []) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k in e && k !== 'style') e[k] = v; else e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c != null) e.append(c); return e; };
const KEY = Army.ARMY_KEY, LS_SEL = 'spaceship-custom:sel', LS_HINT = 'spaceship-custom:hint';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const RO = { getItem: lsGet, setItem() {}, removeItem() {} }; // read-only: reading never writes (no migration write on load)
const q = new URLSearchParams(location.search);
let inFrame = false; try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
const EMBED = inFrame || q.has('section') || q.get('embed') === '1';
document.body.classList.toggle('hq', EMBED);

// ---------- save: read ----------
let army = null, ships = [], draft = null, selId = null, view = 'edit', tab = 'hull';
const dirtyIds = new Set(), deletedIds = new Set();
let saveT = 0, reloads = 0, writes = 0, changedOnce = false;
// ① ship strip (pick / new / rename / delete) · ② a part tab or a part change · ③ only after ✅ Done (the next part change goes back to ②)
let stepNow = 1;
function goStep(n) { stepNow = n; renderSteps(); }
function readArmy(keepEmpty) {
  const has = lsGet(KEY) != null || lsGet(Army.LEGACY_KEYS.customizer) != null;
  if (!has && keepEmpty && army) return army; // nothing stored yet: keep this page's in-memory Player 1 (stable ids)
  let a; try { a = Army.load(RO); } catch (e) { a = Army.emptyArmy(); }
  return a;
}
function loadAll(keep) {
  army = readArmy(true);
  const raw = Array.isArray(army.spaceships) ? army.spaceships : [];
  const pids = new Set(army.players.map((p) => p.id));
  ships = raw.filter((s) => s && typeof s === 'object' && typeof s.id === 'string' && pids.has(s.playerId)).map((s) => S.cleanShip(s));
  // keep this page's unsaved edits (dirty) on top of what was reloaded
  if (keep) for (const k of keep) { const i = ships.findIndex((s) => s.id === k.id); if (i >= 0) ships[i] = k; else ships.push(k); }
  for (const id of deletedIds) ships = ships.filter((s) => s.id !== id);
}
const player = () => Army.activePlayer(army);
const myShips = () => ships.filter((s) => s.playerId === player().id);
const cur = () => myShips().find((s) => s.id === selId) || myShips()[0] || null;
function ensureShip() {
  if (myShips().length) { draft = null; return; }
  if (!draft || draft.playerId !== player().id) draft = S.newShip(ships, player().id); // first open: one cheap base ship (saved on first change / Done)
  ships.push(draft); selId = draft.id;
}
function pickSel() {
  let m = {}; try { m = JSON.parse(lsGet(LS_SEL) || '{}') || {}; } catch (e) { m = {}; }
  const want = selId && myShips().some((s) => s.id === selId) ? selId : m[player().id];
  selId = myShips().some((s) => s.id === want) ? want : (myShips()[0] || {}).id;
}
const remember = () => { let m = {}; try { m = JSON.parse(lsGet(LS_SEL) || '{}') || {}; } catch (e) { m = {}; } m[player().id] = selId; lsSet(LS_SEL, JSON.stringify(m)); };

// ---------- save: write (merge) ----------
function markDirty(ship) { if (ship) { ship.updatedAt = new Date().toISOString(); ship.stats = S.spaceshipStats(ship.parts); dirtyIds.add(ship.id); if (ship === draft) draft = null; } clearTimeout(saveT); saveT = setTimeout(() => flush(), 250); }
export function flush() {
  clearTimeout(saveT); saveT = 0;
  if (!dirtyIds.size && !deletedIds.size) return true;
  let raw = lsGet(KEY);
  if (raw == null && lsGet(Army.LEGACY_KEYS.customizer) != null) { try { Army.load(localStorage); } catch (e) { /* ignore */ } raw = lsGet(KEY); } // legacy-only save: let the shared loader migrate it once
  let st = null; if (raw != null) { try { st = JSON.parse(raw); } catch (e) { st = undefined; } }
  let out;
  if (st && typeof st === 'object' && Array.isArray(st.players)) {
    let list = Array.isArray(st.spaceships) ? st.spaceships.slice() : [];
    list = list.filter((s) => !(s && deletedIds.has(s.id)));
    for (const id of dirtyIds) { const mine = ships.find((s) => s.id === id); if (!mine) continue; const i = list.findIndex((s) => s && s.id === id); if (i >= 0) list[i] = mine; else list.push(mine); }
    // army.spaceships = this editor's rideable transports (NOT army.ships, which the schema reserves for Ship Sandbox capital ships).
    // Only this page writes it, merge-on-write; games read it through ship-stats.js (cleanShip / spaceshipStats). See README.
    out = { ...st, spaceships: list };
  } else if (raw == null) { // no army yet: write a fresh one (Player 1 / Nation 1, like the Customizer's first run) + our ships
    out = { ...Army.sanitize(army), updatedAt: new Date().toISOString(), updatedBy: 'spaceship-custom', spaceships: ships.filter((s) => dirtyIds.has(s.id)) };
  } else { toast('⚠️ Save is broken: not changed', true); return false; } // unreadable save: never overwrite it
  if (!lsSet(KEY, JSON.stringify(out))) { toast('⚠️ Storage full', true); return false; }
  dirtyIds.clear(); deletedIds.clear(); writes++; flashSaved();
  return true;
}
addEventListener('pagehide', () => flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
// another tab / iframe changed the army save
addEventListener('storage', (e) => {
  if (e.key !== null && e.key !== KEY) return;
  const keep = [...dirtyIds].map((id) => ships.find((s) => s.id === id)).filter(Boolean);
  if (draft && !keep.includes(draft)) keep.push(draft); // the unsaved first ship stays on screen
  const prevPlayer = army && player().id;
  loadAll(keep); reloads++;
  if (player().id !== prevPlayer) selId = null;
  ensureShip(); pickSel(); renderAll(true);
});

// ---------- 3D ----------
const appEl = $('#app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setClearColor(0x000000, 0);
appEl.appendChild(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
const lights = (sc) => { sc.add(new THREE.HemisphereLight(0xcfe0ff, 0x262a33, 1.8)); const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(3, 5, 4); sc.add(k); const r = new THREE.DirectionalLight(0x8fb4ff, 1.2); r.position.set(-3, 2.5, -4); sc.add(r); };
lights(scene);
const holder = new THREE.Group(); scene.add(holder);
const field = new THREE.Group(); scene.add(field); // 🌍 ground: pad + grid
{
  const gnd = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshLambertMaterial({ color: 0x18202e })); gnd.rotation.x = -Math.PI / 2; field.add(gnd);
  const grid = new THREE.GridHelper(60, 30, 0x2c3a55, 0x1f2840); grid.position.y = 0.004; field.add(grid);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.0, 40), new THREE.MeshBasicMaterial({ color: 0x6ff3ff, transparent: true, opacity: 0.5 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; field.add(ring);
}
const stars = new THREE.Group(); scene.add(stars); // 🌌 space: stars + a planet
{
  const n = 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(80 + Math.random() * 60); pos.set([v.x, v.y, v.z], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true })));
  // 🪐 a smooth, far-off planet: day-to-night gradient shading + a soft additive atmosphere rim (no facets)
  const PL_SUN = new THREE.Vector3(0.82, 0.45, -0.3).normalize() // side-lit, so the day/night edge shows;
  const pl = new THREE.Mesh(new THREE.SphereGeometry(3.2, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: PL_SUN }, uDay: { value: new THREE.Color(0x4f86e8) }, uNight: { value: new THREE.Color(0x0d1838) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vLat; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vLat = normal.y; vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uSun; uniform vec3 uDay; uniform vec3 uNight; varying vec3 vN; varying vec3 vV; varying float vLat; void main(){ float l = smoothstep(-0.25, 0.75, dot(normalize(vN), uSun)); float band = 0.9 + 0.1 * sin(vLat * 9.0) + 0.05 * sin(vLat * 23.0); float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5); vec3 c = mix(uNight, uDay * band, l) + vec3(0.35, 0.65, 1.0) * rim * 0.55 * (0.3 + l); gl_FragColor = vec4(c, 1.0); }'
  }));
  const atm = new THREE.Mesh(new THREE.SphereGeometry(3.95, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: PL_SUN } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uSun; varying vec3 vN; varying vec3 vV; void main(){ float e = -dot(normalize(vN), normalize(vV)); float k = smoothstep(0.0, 0.62, e); float lit = 0.35 + 0.65 * clamp(dot(-normalize(vN), uSun) * 0.5 + 0.6, 0.0, 1.0); gl_FragColor = vec4(vec3(0.4, 0.7, 1.0) * k * k * 0.7 * lit, 1.0); }'
  }));
  pl.add(atm); pl.position.set(-51, -16, -45); stars.userData.planet = pl; stars.add(pl); // ≈75 away: in front of the star shell (80+), far behind the ship
}
let backdrop = 'ground';
const setBackdrop = (b) => { backdrop = b; field.visible = b === 'ground'; stars.visible = b === 'space'; const btn = $('#bgBtn'); btn.querySelector('.vi').textContent = b === 'ground' ? '🌌' : '🌍'; btn.querySelector('.vl').textContent = b === 'ground' ? 'Space' : 'Ground'; btn.title = b === 'ground' ? 'Show in space' : 'Show on the ground'; };
const look = new ShipLook();
let built = null, builtKey = '';
function rebuild() {
  const s = cur(); if (!s) return;
  const n = player().nation, key = JSON.stringify([s.parts, n.colors]);
  if (key === builtKey && built) return;
  look.setColors(n.colors.primary, n.colors.secondary);
  if (built) holder.remove(built.root);
  built = buildShip(s.parts, look); builtKey = key;
  look.shield.uniforms.uRim.value = [0, 0.35, 0.5, 0.7][built.shield.userData.lvl]; look.shield.uniforms.uFlash.value = 0; // fill stays ≈0.08, only the edge glow grows with the level
  holder.add(built.root);
  if (view !== 'demo') frameShip(!framed); // keep the same view angle, re-fit to the new ship
}
// ---------- camera framing: the ship fills most of the preview's free area (the part not under the view buttons / caption / demo strip) ----------
const _v = new THREE.Vector3(), _box = new THREE.Box3();
function shipBox(out) { // world-space box of the ship body (the shield bubble is left out)
  out.makeEmpty(); if (!built) return out; holder.updateMatrixWorld(true);
  for (const ch of built.root.children) if (ch !== built.shield) out.expandByObject(ch);
  return out;
}
function safeRect() { // preview-local px rect where the ship may be drawn
  const v = $('#view').getBoundingClientRect(), W = v.width, H = v.height, b = $('#viewbar').getBoundingClientRect();
  const col = getComputedStyle($('#viewbar')).flexDirection === 'column'; // phones: a column of buttons on the right edge; PC: a row top-right
  const bot = view === 'demo' ? $('#dhud').getBoundingClientRect() : $('#modes').getBoundingClientRect();
  const y1 = (bot.height ? bot.top - v.top : H) - 6;
  return col ? { x0: 8, y0: 6, x1: b.left - v.left - 8, y1, W, H } : { x0: 8, y0: b.bottom - v.top + 6, x1: W - 8, y1, W, H };
}
function projRect(box) { // projected px rect (preview-local) of a world box with the current camera
  camera.updateMatrixWorld(true); const W = viewW, H = viewH; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < 8; i++) { _v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera); const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
let viewW = 1, viewH = 1, demoD = 10, demoFit = null, framed = false;
function applyOffset(r) { camera.setViewOffset(r.W, r.H, r.W / 2 - (r.x0 + r.x1) / 2, r.H / 2 - (r.y0 + r.y1) / 2, r.W, r.H); }
// distance so the box (seen from `dir`, and from every spin angle when `spin`) fills FILL of the safe rect
function fitDistance(box, dir, r, fill, spin) {
  const c = box.getCenter(new THREE.Vector3()); let d = 12;
  const hw = (r.x1 - r.x0) / 2 * fill, hh = (r.y1 - r.y0) / 2 * fill, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, keep = camera.position.clone();
  for (let it = 0; it < 4; it++) {
    let ex = 0, ey = 0;
    for (let k = 0; k < (spin ? 12 : 1); k++) {
      const dd = dir.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, (k / 12) * Math.PI * 2);
      camera.position.copy(c).addScaledVector(dd, d); camera.lookAt(c);
      const p = projRect(box); ex = Math.max(ex, cx - p.x0, p.x1 - cx); ey = Math.max(ey, cy - p.y0, p.y1 - cy);
    }
    d *= Math.max(ex / hw, ey / hh);
  }
  camera.position.copy(keep); return Math.min(60, Math.max(1.5, d));
}
const HOME_DIR = new THREE.Vector3(5.5, 3.4, 6.5).normalize(), DEMO_DIR = new THREE.Vector3(8.5, 5, 10).normalize();
function frameShip(home) {
  if (!built || view === 'demo') return;
  const r = safeRect(); if (r.x1 - r.x0 < 20 || r.y1 - r.y0 < 20) return;
  const hy = holder.position.y; holder.position.y = 1.1; holder.updateMatrixWorld(true); // fit around the resting hover height
  applyOffset(r); shipBox(_box); const c = _box.getCenter(new THREE.Vector3()); holder.position.y = hy;
  const dir = home ? HOME_DIR.clone() : camera.position.clone().sub(controls.target).normalize();
  const d = fitDistance(_box, dir, r, 0.98, true);
  controls.target.copy(c); camera.position.copy(c).addScaledVector(dir, d); camera.lookAt(c);
  controls.minDistance = d * 0.6; controls.maxDistance = d * 1.8; controls.update(); framed = true;
}
// demo: the camera follows the ship at a fixed angle so it always fills the free area above the status strip
function demoFrame(start) {
  const s = built; if (!s) return; const r = safeRect(); applyOffset(r);
  if (start) { // fit once on the ship at rest (no tilt)
    const p = s.root.position.clone(), rot = s.root.rotation.clone(); s.root.position.set(0, 0, 0); s.root.rotation.set(0, 0, 0);
    shipBox(_box); demoFit = { off: _box.getCenter(new THREE.Vector3()) }; demoD = fitDistance(_box, DEMO_DIR, r, 0.97, false);
    s.root.position.copy(p); s.root.rotation.copy(rot); s.root.updateMatrixWorld(true);
  }
  // follow the ship's current box (tilts in fly / space make it bigger): never closer than the rest fit, zoom out only as much as the tilt needs
  shipBox(_box); const c = _box.getCenter(new THREE.Vector3()); if (demo.shake > 0) c.x -= s.root.position.x; // the camera holds still so the hit shake shows as the ship jolting
  const d = Math.max(demoD, fitDistance(_box, DEMO_DIR, r, 0.97, false));
  camera.position.copy(c).addScaledVector(DEMO_DIR, d); camera.lookAt(c);
}
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.12; controls.enablePan = false; controls.rotateSpeed = 0.9;
controls.minDistance = 2; controls.maxDistance = 40; controls.maxPolarAngle = 1.5; controls.autoRotate = true; controls.autoRotateSpeed = 2.2;
controls.addEventListener('start', () => { if (controls.autoRotate) { controls.autoRotate = false; paintSpin(); } });
function camHome() { frameShip(true); }
function resize() {
  placeBlocks();
  const r = $('#view').getBoundingClientRect(), w = Math.max(1, r.width), hh = Math.max(1, r.height);
  viewW = w; viewH = hh; renderer.setSize(w, hh, false); camera.aspect = w / hh;
  camera.updateProjectionMatrix();
}
// phone landscape: stats go under the preview and the steps into the header; elsewhere they sit in the panel
const LAND = matchMedia('(min-width: 700px) and (max-height: 520px)');
function placeBlocks() {
  const sb = $('#statbox'), st = $('#steps');
  if (LAND.matches) { if (sb.parentElement.id !== 'left') $('#left').append(sb); if (st.parentElement.id !== 'hsteps') $('#hsteps').append(st); }
  else { if (sb.parentElement.id !== 'pscroll') $('#ships').after(sb); if (st.parentElement.id !== 'nav') $('#nav').prepend(st); }
}
addEventListener('resize', () => { resize(); if (view !== 'demo') frameShip(false); else demoFrame(true); placeHint(); });

// thumbnails (saved ships show a picture): one small offscreen renderer
const thumbs = new Map();
let tR = null; const tScene = new THREE.Scene(), tCam = new THREE.PerspectiveCamera(34, 1, 0.1, 50); lights(tScene);
tCam.position.set(4.2, 2.8, 4.6); tCam.lookAt(0, 0, 0.1);
function thumbOf(s) {
  const n = player().nation, key = JSON.stringify([s.parts, n.colors]);
  if (thumbs.has(key)) return thumbs.get(key);
  try {
    if (!tR) { tR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); tR.setSize(88, 88, false); tR.setClearColor(0x000000, 0); }
    const lk = new ShipLook(); lk.setColors(n.colors.primary, n.colors.secondary);
    const b = buildShip(s.parts, lk); b.shield.visible = false; tScene.add(b.root); tR.render(tScene, tCam); tScene.remove(b.root);
    const url = tR.domElement.toDataURL('image/png'); thumbs.set(key, url); return url;
  } catch (e) { return ''; }
}

// ---------- UI: header / breadcrumb ----------
const SYM = { star: '★', planet: '🪐', comet: '☄', skull: '☠', wing: '🪽', bolt: '⚡', chevron: '︽', crescent: '☾', gear: '⚙', atom: '⚛', triangle: '▲', circle: '●' };
function drawFlag(c, n) {
  const g = c.getContext('2d'), W = c.width; g.clearRect(0, 0, W, W); g.fillStyle = n.colors.primary; g.fillRect(0, 0, W, W);
  g.fillStyle = n.flag.symbolColor === 'white' ? '#fff' : n.flag.symbolColor === 'black' ? '#111' : n.flag.symbolColor === 'primary' ? n.colors.primary : n.colors.secondary;
  g.font = `bold ${W * 0.62}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(SYM[n.flag.symbol] || '★', W / 2, W / 2 + 2);
}
function renderHeader() {
  const s = cur(), n = player().nation, slot = S.SLOT_INFO[tab];
  document.documentElement.style.setProperty('--np', n.colors.primary);
  drawFlag($('#whoFlag'), n);
  const sep = () => h('span', { class: 'sep', text: '›' });
  // Nation › SpaceShips › Name › Part (the open part tab is the last crumb)
  const parts = [h('span', { text: n.name }), sep(), h('span', { text: 'SpaceShips' }), sep(), h('span', { class: 'nm', text: s ? s.name : '' }), sep(), h('span', { class: 'cur', text: slot.n })];
  $('#crumbTxt').replaceChildren(...parts);
  $('#crumb').title = `${player().name} · ${n.name}`;
  $('#tIc').textContent = view === 'demo' ? '🎬' : '🛸';
  $('#tVerb').textContent = view === 'demo' ? 'Demo:' : 'Editing:';
  $('#tName').textContent = s ? s.name : '';
  document.title = (s ? s.name : 'SpaceShip') + ' · SpaceShip Editor';
  // ⬅️ Back: in a sub-screen (demo) it closes it. On the main screen: standalone = Army HQ link; inside Army HQ the shell's 🏠 sits here (#homeSpot)
  const back = $('#backBtn'), sub = view === 'demo';
  back.classList.toggle('off', EMBED && !sub); $('#homeSpot').classList.toggle('on', EMBED && !sub);
  back.title = sub ? 'Back to editing' : 'Back to Army HQ'; back.setAttribute('aria-label', back.title);
}
let savedT = 0;
function flashSaved() { const e = $('#saved'); e.classList.add('on'); clearTimeout(savedT); savedT = setTimeout(() => e.classList.remove('on'), 1600); }
let toastT = 0;
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }

// ---------- UI: steps ----------
function renderSteps() {
  const step = stepNow;
  for (const li of document.querySelectorAll('#steps li')) { const k = +li.dataset.step; li.classList.toggle('done', k < step); li.classList.toggle('now', k === step); }
}

// ---------- UI: ship strip (pick a ship) ----------
let delAsk = 0;
function renderShips() {
  const list = myShips(), box = $('#ships');
  const btns = list.map((s) => {
    const b = h('button', { type: 'button', class: s.id === selId ? 'on' : '', role: 'tab', 'aria-selected': String(s.id === selId), title: s.name, 'data-id': s.id },
      [h('img', { alt: '', src: thumbOf(s) || 'data:,' }), h('span', { class: 'nm' }, [h('span', { text: s.name }), h('small', { text: '💰 ' + s.stats.cost })])]);
    b.addEventListener('click', () => selectShip(s.id)); return b;
  });
  const add = h('button', { type: 'button', class: 'add', title: 'New ship', 'aria-label': 'New ship', text: '➕ New' });
  add.addEventListener('click', () => createShip());
  const del = h('button', { type: 'button', class: 'del' + (delAsk ? ' ask' : ''), title: 'Delete this ship', 'aria-label': 'Delete this ship', text: delAsk ? '🗑️ Sure?' : '🗑️' });
  del.addEventListener('click', () => { if (!delAsk) { delAsk = 1; renderShips(); setTimeout(() => { if (delAsk) { delAsk = 0; renderShips(); } }, 2500); return; } delAsk = 0; removeShip(selId); });
  const ren = h('button', { type: 'button', id: 'renameBtn', class: 'ren', title: 'Rename this ship', 'aria-label': 'Rename this ship', text: '✏️' });
  ren.addEventListener('click', openRename);
  box.replaceChildren(...btns, ren, add, del);
  const on = box.querySelector('button.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------- UI: stats (icon + word + bar, ▲/▼ deltas) ----------
const BAR_COLOR = { hp: '#ff7a7a', shield: '#6ff3ff', speed: '#a8ffb0', firepower: '#ffb15a', range: '#c9a8ff', seats: '#ffd65a', cost: '#ffe08a' };
const STAT_HELP = { hp: '❤️ Hull = health. When it is gone the ship is down.', shield: '🛡️ Shield = blocks hits first, then the hull is hit.', speed: '⚡ Speed = how fast it flies.', firepower: '💥 Firepower = damage per second.', range: '🎯 Range = how far the guns shoot.', seats: '🪑 Seats = troopers it carries into battle.', cost: '💰 Cost = army points to build it.' };
const pct = (k, v) => Math.max(0, Math.min(100, (v / S.STAT_ROWS.find((r) => r.k === k).max) * 100));
const fmtD = (k, d) => { const r = S.STAT_ROWS.find((x) => x.k === k), good = d * r.good > 0, n = Math.abs(d) % 1 ? Math.abs(d).toFixed(1) : String(Math.abs(d)); return { txt: (d > 0 ? '▲' : '▼') + n, good }; };
const SEG = 10, segs = (k, v) => Math.round(pct(k, v) / 10);
function buildStatbox() {
  $('#statbox').replaceChildren(...S.STAT_ROWS.map((r) => {
    // icon + word on top; 10-segment bar + its own ▲/▼ badge slot below (the badge never sits on the word)
    const b = h('button', { type: 'button', class: 'srow', 'data-k': r.k, title: STAT_HELP[r.k], 'aria-label': r.n }, [h('span', { class: 'nm' }, [h('span', { class: 'si', text: r.i }), h('span', { class: 'sl', text: r.n })]), h('span', { class: 'bar' }, Array.from({ length: SEG }, () => h('s'))), h('em', { class: 'dl' })]);
    b.addEventListener('click', () => showTip(b, STAT_HELP[r.k]));
    return b;
  }));
}
let deltaT = 0;
// stats of the current ship; `from` (optional) = stats before a swap / preview → ghost bar + ▲/▼ for 1.6 s
function renderStats(from, preview) {
  const s = cur(); if (!s) return; const st = s.stats;
  const tgt = preview || st, base = preview ? st : from;
  for (const r of S.STAT_ROWS) {
    const row = $(`#statbox [data-k="${r.k}"]`), sg = row.querySelectorAll('.bar s'), dl = row.querySelector('.dl');
    const d = base ? Math.round((tgt[r.k] - base[r.k]) * 10) / 10 : 0;
    const now = Math.max(tgt[r.k] > 0 ? 1 : 0, segs(r.k, tgt[r.k])), was = base ? Math.max(base[r.k] > 0 ? 1 : 0, segs(r.k, base[r.k])) : now;
    // filled segments; a swap shows the gained ones green and the lost ones as red outlines (like BattleShip)
    sg.forEach((e, i) => { e.className = d && i >= Math.min(now, was) && i < Math.max(now, was) ? (now > was ? 'up' : 'dn') : i < now ? 'f' : ''; });
    if (d) { const f = fmtD(r.k, d), n = Math.abs(now - was); dl.textContent = (d > 0 ? '▲' : '▼') + (n ? n : ''); dl.title = f.txt; dl.className = 'dl on ' + (f.good ? 'good' : 'bad'); }
    else { dl.textContent = ''; dl.className = 'dl'; }
    row.setAttribute('aria-label', `${r.n} ${tgt[r.k]}`);
  }
  clearTimeout(deltaT);
  if (from && !preview) deltaT = setTimeout(() => renderStats(), 1600);
}

// ---------- UI: part tabs (grouped) + option cards ----------
const GROUPS = [{ n: 'Body', s: ['hull', 'wings', 'seats'] }, { n: 'Power', s: ['engines', 'shield'] }, { n: 'Attack', s: ['guns'] }];
function buildTabs() {
  $('#tabs').replaceChildren(...GROUPS.map((g) => {
    const box = h('div', { class: 'tg' }, [h('small', { text: g.n }), h('div', { class: 'tgb' }, g.s.map((k) => {
      const b = h('button', { type: 'button', role: 'tab', 'data-tab': k, title: S.SLOT_INFO[k].n, 'aria-label': S.SLOT_INFO[k].n }, [h('span', { class: 'ti', text: S.SLOT_INFO[k].i }), h('span', { class: 'tl', text: S.SLOT_INFO[k].n })]);
      b.addEventListener('click', () => setTab(k, true)); return b;
    }))]);
    box.style.setProperty('--n', g.s.length); return box;
  }));
}
function setTab(k, user) { if (user && k !== tab) hideHint(true); if (user && view !== 'demo') goStep(2); tab = k; for (const b of document.querySelectorAll('#tabs [data-tab]')) { b.classList.toggle('on', b.dataset.tab === k); b.setAttribute('aria-selected', String(b.dataset.tab === k)); } renderTiles(); renderHeader(); }
function renderTiles() {
  const s = cur(); if (!s) return; const slot = S.SLOT_INFO[tab], curId = s.parts[tab];
  const tiles = S.PARTS[tab].map((p) => {
    const on = p.id === curId;
    const lines = on ? [h('span', { class: 'd same', text: 'On your ship' })] : S.partDelta(tab, p.id, curId).map((x) => { const f = fmtD(x.k, x.d); return h('span', { class: 'd ' + (f.good ? 'good' : 'bad'), text: `${x.i} ${x.n} ${f.txt}` }); });
    if (!on && !lines.length) lines.push(h('span', { class: 'd same', text: '🎨 Look only' }));
    const b = h('button', { type: 'button', class: on ? 'on' : '', 'data-part': p.id, 'aria-pressed': String(on), title: `${slot.n}: ${p.n}` }, [h('span', { class: 'hd' }, [h('span', { class: 'ico', text: p.i }), h('span', { class: 'nm', text: p.n })]), h('span', { class: 'ds' }, lines), on ? h('span', { class: 'tick', text: '✓ On' }) : null]);
    b.addEventListener('click', () => setPart(tab, p.id));
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !on) renderStats(null, S.spaceshipStats({ ...s.parts, [tab]: p.id })); });
    b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') renderStats(); });
    return b;
  });
  $('#pbody').replaceChildren(h('div', { class: 'lab' }, [h('span', { text: `${slot.i} Pick ${slot.n}` }), h('small', { text: `${S.PARTS[tab].length} choices` })]), h('div', { class: 'tiles' }, tiles));
}

// ---------- actions ----------
function setPart(slot, id) {
  const s = cur(); if (!s || s.parts[slot] === id || view === 'demo') return;
  const before = s.stats; s.parts = { ...s.parts, [slot]: id }; markDirty(s);
  changedOnce = true; hideHint(true); stepNow = 2;
  rebuild(); renderStats(before); renderTiles(); renderShips(); renderSteps();
}
function selectShip(id) { if (view === 'demo') return; stepNow = 1; if (id === selId) { renderSteps(); return; } selId = id; remember(); delAsk = 0; renderAll(); }
function createShip() {
  if (view === 'demo') return;
  if (myShips().length >= S.LIMITS.shipsPerPlayer) { toast('⚠️ Max ' + S.LIMITS.shipsPerPlayer + ' ships', true); return; }
  if (draft) markDirty(draft); // the shown first ship becomes real once a second one exists
  const s = S.newShip(ships, player().id); ships.push(s); selId = s.id; markDirty(s); remember(); stepNow = 1;
  renderAll(); toast('🛸 ' + s.name);
}
function removeShip(id) {
  const s = ships.find((x) => x.id === id); if (!s || view === 'demo') return;
  ships = ships.filter((x) => x.id !== id); dirtyIds.delete(id); if (s !== draft) deletedIds.add(id); else draft = null;
  selId = null; ensureShip(); pickSel(); remember(); markDirty(null); stepNow = 1; renderAll(); toast('🗑️ ' + s.name);
}
function renameShip(name) {
  const s = cur(); const n = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, S.LIMITS.name);
  if (!s || !n) return false; s.name = n; markDirty(s); changedOnce = true; stepNow = 1; renderAll(); return true;
}
function randomize() { const s = cur(); if (!s || view === 'demo') return; const before = s.stats; s.parts = Object.fromEntries(S.SLOTS.map((k) => [k, S.PARTS[k][Math.floor(Math.random() * S.PARTS[k].length)].id])); markDirty(s); changedOnce = true; hideHint(true); rebuild(); renderStats(before); renderTiles(); renderShips(); renderSteps(); }
function done() {
  if (view === 'demo') { demo.stop(); return; }
  const s = cur(); if (s && s === draft) markDirty(s); // Done always keeps the ship, even the untouched first one
  const ok = flush(); flashSaved(); changedOnce = true; goStep(3);
  toast(ok ? '✓ Saved: ' + (s ? s.name : '') : '⚠️ Not saved', !ok);
  const btn = $('#doneBtn'); btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse');
}
// rename sheet
function openRename() { if (view === 'demo') return; goStep(1); const s = cur(); $('#renameIn').value = s ? s.name : ''; $('#renameSheet').classList.remove('hidden'); setTimeout(() => { $('#renameIn').focus(); $('#renameIn').select(); }, 30); }
function closeRename(ok) { if (ok && !renameShip($('#renameIn').value)) { $('#renameSheet .rs').classList.remove('shake'); void $('#renameSheet').offsetWidth; $('#renameSheet .rs').classList.add('shake'); return; } $('#renameSheet').classList.add('hidden'); }
$('#renameOk').addEventListener('click', () => closeRename(true));
$('#renameNo').addEventListener('click', () => closeRename(false));
$('#renameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') closeRename(true); if (e.key === 'Escape') closeRename(false); });
$('#renameSheet').addEventListener('click', (e) => { if (e.target.id === 'renameSheet') closeRename(false); });
$('#doneBtn').addEventListener('click', done);
$('#backBtn').addEventListener('click', (e) => { if (view === 'demo') { e.preventDefault(); demo.stop(); return; } flush(); }); // standalone: plain same-tab link to Army HQ
// view bar
function paintSpin() { $('#spinBtn').classList.toggle('on', controls.autoRotate); }
$('#spinBtn').addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; paintSpin(); });
$('#bgBtn').addEventListener('click', () => setBackdrop(backdrop === 'ground' ? 'space' : 'ground'));
$('#demoBtn').addEventListener('click', () => (view === 'demo' ? demo.stop() : startDemo()));

// ---------- tap-to-explain tooltip ----------
let tipT = 0;
function showTip(el, text) {
  const t = $('#tip'); t.textContent = text; t.classList.add('on');
  const r = el.getBoundingClientRect(), w = t.offsetWidth, hh = t.offsetHeight;
  let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8), y = r.top - hh - 6; if (y < 8) y = r.bottom + 6;
  t.style.left = x + 'px'; t.style.top = y + 'px'; clearTimeout(tipT); tipT = setTimeout(() => t.classList.remove('on'), 2200);
}

// ---------- first-run coach mark: ONE bubble above (or below) the part-tab row, arrow pointing at a tab; it never covers a tab ----------
let hintOn = lsGet(LS_HINT) !== '1';
const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
function placeHint() {
  const e = $('#hint'), tabsEl = $('#tabs');
  if (!hintOn || view === 'demo' || $('#renameSheet').offsetParent) { e.classList.add('hidden'); return; }
  const t = document.querySelector('#tabs [data-tab]:not(.on)'), tr = tabsEl.getBoundingClientRect(), pr = $('#pscroll').getBoundingClientRect();
  if (!t || tr.bottom < pr.top || tr.top > pr.bottom) { e.classList.add('hidden'); return; }
  e.classList.remove('hidden');
  const r = t.getBoundingClientRect(), tabsAll = [...document.querySelectorAll('[role=tab]')].map((x) => x.getBoundingClientRect()).filter((x) => x.width);
  const place = (below) => {
    $('#hintIc').textContent = below ? '👆' : '👇'; e.classList.toggle('below', below);
    const w = e.offsetWidth, hh = e.offsetHeight, x = Math.min(Math.max(8, r.left + r.width / 2 - 28), innerWidth - w - 8);
    const y = below ? tr.bottom + 12 : $('#nav').getBoundingClientRect().top - hh - 10;
    e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.setProperty('--ax', Math.max(10, Math.min(w - 28, r.left + r.width / 2 - x - 9)) + 'px');
    const box = { left: x, top: y, right: x + w, bottom: y + hh };
    return y >= $('#top').getBoundingClientRect().bottom + 2 && y + hh <= innerHeight - 4 && !tabsAll.some((a) => hits(a, box));
  };
  if (!place(false)) place(true);
}
function hideHint(forever) { if (forever) { hintOn = false; lsSet(LS_HINT, '1'); } $('#hint').classList.add('hidden'); }
$('#pscroll').addEventListener('scroll', () => placeHint(), { passive: true });

// ---------- demo ----------
function crewNames(n) {
  const tr = Army.playerUnits(army, player().id, { kind: 'trooper' }).filter((u) => u.roster !== false);
  const names = tr.map((u) => u.name);
  if (!names.length) for (let i = 0; i < n; i++) names.push('Trooper ' + (i + 1));
  return names.slice(0, n);
}
const demo = new Demo({
  scene, camera, controls, field, stars, ship: () => built,
  get stats() { return cur().stats; }, get crew() { return crewNames(cur().stats.seats); }, get colors() { return player().nation.colors; },
  hud: (d) => {
    const e = $('#dhud'); e.classList.remove('hidden');
    const row = (cls, i, n, v, max) => h('div', { class: 'dr ' + cls, title: n }, [h('span', { text: i }), h('span', { class: 'w', text: n }), h('i', {}, h('u', { style: `width:${max ? Math.round((v / max) * 100) : 0}%` }))]);
    const ph = { fly: '🛬 Landing', board: '🪖 Boarding', lift: '🛫 Lift off', fire: '🔫 Firing', hit: '💥 Hit!', space: '🌌 To space' }[d.phase] || '';
    e.replaceChildren(h('div', { class: 'who', text: ph + (d.phase === 'board' && d.name ? ' · ' + d.name + ' ✓' : '') }), row('hp', '❤️', 'Hull', d.hp, d.maxHp), row('sh', '🛡️', 'Shield', d.sh, d.maxSh || 1), h('div', { class: 'dr st', title: 'Seats' }, [h('span', { text: '🪑' }), h('span', { class: 'w', text: 'Seats' }), h('span', { text: `${d.boarded}/${d.seats}` })]));
    e.dataset.phase = d.phase; e.dataset.hp = d.hp; e.dataset.sh = d.sh; e.dataset.boarded = d.boarded;
  },
  onEnd: (r) => { lastDemo = r; view = 'edit'; document.body.classList.remove('demo'); $('#dhud').classList.add('hidden'); setBackdrop(backdropBefore); holder.position.y = 1.1; resize(); camHome(); controls.autoRotate = spinBefore; paintSpin(); renderAll(); },
});
let lastDemo = null, backdropBefore = 'ground', spinBefore = true;
function startDemo() {
  const s = cur(); if (!s) return; hideHint(false);
  backdropBefore = backdrop; spinBefore = controls.autoRotate; view = 'demo'; document.body.classList.add('demo'); $('#renameSheet').classList.add('hidden');
  holder.position.y = 0; demo.start(); $('#dhud').classList.remove('hidden'); resize(); demoFrame(true); renderHeader(); renderSteps(); $('#demoBtn .vl').textContent = 'Stop'; $('#demoBtn .vi').textContent = '⏹️';
}

// ---------- render all ----------
function renderAll(keepStats) {
  pickSel(); rebuild(); renderHeader(); renderSteps(); renderShips(); renderStats(); setTab(tab);
  $('#demoBtn .vl').textContent = view === 'demo' ? 'Stop' : 'Demo'; $('#demoBtn .vi').textContent = view === 'demo' ? '⏹️' : '🎬';
  setTimeout(placeHint, 50);
}

// ---------- loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  if (view === 'demo') { demo.update(dt); if (view === 'demo' && demo.running) demoFrame(false); }
  else if (built) { holder.position.y = 1.1 + Math.sin(now / 700) * 0.06; for (const f of built.flames) f.scale.z = f.userData.base * (0.9 + Math.random() * 0.25); }
  if (controls.enabled) controls.update();
  renderer.render(scene, camera);
}

// ---------- boot ----------
loadAll(); ensureShip(); pickSel();
buildStatbox(); buildTabs(); resize(); camHome(); setBackdrop('ground'); paintSpin(); holder.position.y = 1.1;
renderAll();
requestAnimationFrame(loop);
setInterval(placeHint, 700);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- test hooks (no UI) ----------
window.__ssc = {
  ready: true, embed: EMBED,
  get army() { return JSON.parse(JSON.stringify(army)); }, get ships() { return JSON.parse(JSON.stringify(myShips())); }, get ship() { return JSON.parse(JSON.stringify(cur())); },
  get view() { return view; }, get tab() { return tab; }, get dirty() { return dirtyIds.size + deletedIds.size; }, get reloads() { return reloads; }, get writes() { return writes; },
  get demo() { return { running: demo.running, phase: demo.phase, t: demo.t, last: lastDemo, shFlashes: demo.shFlashes || 0 }; },
  // the space planet's look + where it sits on screen (tests: smooth, glowing, small, far behind the ship)
  planetLook: () => { const pl = stars.userData.planet, atm = pl.children[0], g = pl.geometry.parameters, v = pl.getWorldPosition(new THREE.Vector3()), n = v.clone().project(camera), d = v.distanceTo(camera.position); shipBox(_box);
    return { segW: g.widthSegments, segH: g.heightSegments, flat: !!pl.material.flatShading, shader: !!pl.material.isShaderMaterial, glow: atm.material.blending === THREE.AdditiveBlending, glowR: atm.geometry.parameters.radius / g.radius, x: n.x, y: n.y, rFrac: Math.atan(atm.geometry.parameters.radius / d) / (camera.fov * Math.PI / 360), dist: d, shipDist: _box.distanceToPoint(camera.position) + _box.getSize(new THREE.Vector3()).length(), visible: stars.visible }; },
  // the shield bubble's look (tests: ≈0.08 fill, edge glow only, no wireframe)
  shieldLook: () => { if (!built) return null; const mats = []; built.shield.traverse((o) => { if (o.material) mats.push(o.material); }); const m = mats[0]; return { n: mats.length, opacity: m.opacity, wire: mats.some((x) => x.wireframe), shader: !!m.isShaderMaterial, rim: m.uniforms ? m.uniforms.uRim.value : null, flash: m.uniforms ? m.uniforms.uFlash.value : null, additive: m.blending === THREE.AdditiveBlending, visible: built.shield.visible }; },
  azimuth: () => controls.getAzimuthalAngle(), select: selectShip, setPart, setTab, create: createShip, remove: removeShip, rename: renameShip, randomize, startDemo, flush, done,
  stats: S.spaceshipStats,
  // ship's projected box + the free area + the overlays, all in page px (tests: framing / no overlap)
  shipRect: () => { shipBox(_box); const p = projRect(_box), v = $('#view').getBoundingClientRect(); return { left: p.x0 + v.left, top: p.y0 + v.top, right: p.x1 + v.left, bottom: p.y1 + v.top, vw: v.width, vh: v.height, vl: v.left, vt: v.top }; },
};
