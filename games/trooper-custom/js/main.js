// Trooper Customizer v2: Player -> Nation (colors + flag) -> unit looks (trooper, tank).
import * as THREE from 'three';
import { OrbitControls } from '../vendor/addons/controls/OrbitControls.js?v=3';
import * as T from './trooper.js?v=3';
import { TANK, TANK_FIELDS, TANK_DEFAULT } from './tank.js?v=3';
import { COST, unitCost, optionCost, fmt } from './cost.js?v=3';

const UNITS = { trooper: T.TROOPER, tank: TANK };
const NATION_KEYS = new Set(['p', 's', ...T.NATION_FIELDS.map(([k]) => k)]);
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v); }
  for (const c of [].concat(kids)) if (c != null) e.append(c);
  return e;
};
const clean = (x, max = 24) => String(x ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pick = (a) => a[(Math.random() * a.length) | 0];

// ---------- storage + data model ----------
const LS_DB = 'trooper-custom:db', LS_CUR_V1 = 'trooper-custom:current', LS_LOOKS_V1 = 'trooper-custom:looks', MAX_LOOKS = 60, MAX_NATIONS = 12;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const newNation = (name, colors) => ({ id: newId(), name, ...T.sanitizeNation(colors) });
function cleanDB(d) {
  const db = { v: 2, player: { name: clean(d.player && d.player.name) || 'Player' }, nations: [], active: null, unit: d.unit === 'tank' ? 'tank' : 'trooper', cur: {}, looks: [] };
  if (d.migratedFrom) db.migratedFrom = String(d.migratedFrom);
  for (const n of d.nations || []) if (n && typeof n.id === 'string') db.nations.push({ id: n.id, name: clean(n.name) || 'Nation', ...T.sanitizeNation(n) });
  if (!db.nations.length) db.nations.push(newNation('Nation 1', T.NATION_DEFAULT));
  db.active = db.nations.some((n) => n.id === d.active) ? d.active : db.nations[0].id;
  db.cur.trooper = T.sanitizeFields(d.cur && d.cur.trooper, T.TROOPER_FIELDS, T.TROOPER_DEFAULT);
  db.cur.tank = T.sanitizeFields(d.cur && d.cur.tank, TANK_FIELDS, TANK_DEFAULT);
  const ids = new Set(db.nations.map((n) => n.id));
  for (const l of d.looks || []) {
    if (!l || typeof l.id !== 'string' || !ids.has(l.nationId) || !UNITS[l.unit]) continue;
    const u = T.undigits(l.u, UNITS[l.unit].fields, UNITS[l.unit].defaults); if (!u) continue;
    db.looks.push({ id: l.id, nationId: l.nationId, unit: l.unit, name: clean(l.name) || 'Look', u: T.digits(u, UNITS[l.unit].fields), thumb: typeof l.thumb === 'string' ? l.thumb : '', tk: typeof l.tk === 'string' ? l.tk : '' });
  }
  return db;
}
// v1 -> v2: one nation per distinct color/flag combo found in the v1 current look + saved looks
function migrateV1() {
  const d = { player: { name: 'Player' }, nations: [], looks: [], cur: {}, unit: 'trooper' };
  const combos = new Map();
  const nationFor = (nat) => { const key = T.nationCode(nat); if (!combos.has(key)) { const n = newNation('Nation ' + (combos.size + 1), nat); combos.set(key, n); d.nations.push(n); } return combos.get(key); };
  const cur = T.decodeTC1(lsGet(LS_CUR_V1));
  if (cur) { d.active = nationFor(cur.nation).id; d.cur.trooper = cur.trooper; }
  let old = []; try { old = JSON.parse(lsGet(LS_LOOKS_V1) || '[]'); } catch (e) { old = []; }
  if (Array.isArray(old)) for (const l of old) {
    const dec = l && T.decodeTC1(l.code); if (!dec) continue;
    const n = nationFor(dec.nation);
    d.looks.push({ id: typeof l.id === 'string' ? l.id : newId(), nationId: n.id, unit: 'trooper', name: clean(l.name) || 'Trooper', u: T.digits(dec.trooper, T.TROOPER_FIELDS) });
  }
  if (cur || d.looks.length) d.migratedFrom = 'v1';
  return cleanDB(d);
}
function loadDB() {
  try { const d = JSON.parse(lsGet(LS_DB) || 'null'); if (d && d.v === 2) return cleanDB(d); } catch (e) { /* fall through */ }
  const m = migrateV1(); justMigrated = !!m.migratedFrom; return m;
}
let justMigrated = false;
let db = loadDB();
let saveT = 0;
let wiped = false;
const flushDB = () => { clearTimeout(saveT); saveT = 0; return wiped || lsSet(LS_DB, JSON.stringify(db)); };
const saveDB = () => { clearTimeout(saveT); saveT = setTimeout(flushDB, 60); };
addEventListener('pagehide', flushDB);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDB(); });
flushDB();

const nation = (id = db.active) => db.nations.find((n) => n.id === id) || db.nations[0];
const fullState = (unit = db.unit, us = db.cur[unit], nat = nation()) => ({ ...nat, skin: unit === 'trooper' ? us.skin : db.cur.trooper.skin, ...us });

// ---------- renderer / scene ----------
const view = $('#view'), app = $('#app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
function addLights(sc) {
  sc.add(new THREE.HemisphereLight(0xcfe0ff, 0x262a33, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(2.5, 4, 3.5); sc.add(key);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 1.2); rim.position.set(-3, 2.5, -3.5); sc.add(rim);
}
addLights(scene);

const stage = new THREE.Group(); scene.add(stage);
const padGroup = new THREE.Group(); stage.add(padGroup);
{
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshLambertMaterial({ color: 0x1a2232 }));
  pad.rotation.x = -Math.PI / 2; padGroup.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.06, 1.1, 40), new THREE.MeshBasicMaterial({ color: 0x6ff3ff, transparent: true, opacity: 0.45 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; padGroup.add(ring);
}
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
const blobGeo = new THREE.PlaneGeometry(0.9, 0.9);
const blob = new THREE.Mesh(blobGeo, blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.004; stage.add(blob);

const field = new THREE.Group(); field.visible = false; scene.add(field);
{
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshLambertMaterial({ color: 0x151b28 }));
  gnd.rotation.x = -Math.PI / 2; field.add(gnd);
  const grid = new THREE.GridHelper(160, 64, 0x2c3a55, 0x1f2840); grid.position.y = 0.003; field.add(grid);
}

// one shared look (atlas + 2 materials) per nation on screen; both units use it
const look = new T.TeamLook();
const units = { trooper: new T.Unit(look, T.TROOPER), tank: new T.Unit(look, TANK) };
for (const u of Object.values(units)) stage.add(u.root);

// ---------- camera / controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.12; controls.enablePan = false; controls.rotateSpeed = 0.8;
controls.autoRotateSpeed = 2.5;
const FIT = { trooper: { hh: 1.25, hw: 0.8, ty: 1.0, pol: 1.38, min: 1.3, max: 9 }, tank: { hh: 1.6, hw: 3.1, ty: 0.8, pol: 1.2, min: 3, max: 18 } };
let squadOn = false, squadN = 100, squadMix = false;
const SQUAD_SIZES = [50, 100, 200];
function fitDistance() {
  const f = FIT[db.unit], t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.max(f.hh / t, f.hw / (t * camera.aspect)) * 1.12;
}
function setOrbit(target, r, polar, az) {
  controls.target.set(...target);
  camera.position.setFromSpherical(new THREE.Spherical(r, polar, az)).add(controls.target);
  camera.lookAt(controls.target); controls.update();
}
function camHome() {
  if (squadOn && squad) {
    controls.minDistance = 4; controls.maxDistance = 200;
    setOrbit([0, 0, 0], squad.extent * 1.6 / Math.min(1, camera.aspect) + 8, 0.85, 0.2);
  } else {
    const f = FIT[db.unit]; controls.minDistance = f.min; controls.maxDistance = f.max;
    setOrbit([0, f.ty, 0], fitDistance(), f.pol, 0.5);
  }
}
let tween = null;
function viewTo(name) {
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const az = { front: 0, side: -Math.PI / 2, back: Math.PI }[name] ?? 0;
  let d = az - s.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
  tween = { t0: performance.now(), dur: 450, from: s.theta, d, phiFrom: s.phi, phiTo: squadOn ? 0.85 : FIT[db.unit].pol + 0.04, r: s.radius };
}
function resize() {
  const w = Math.max(1, view.clientWidth), hh = Math.max(1, view.clientHeight);
  renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix();
  if (!squadOn) { const off = camera.position.clone().sub(controls.target); off.setLength(fitDistance()); camera.position.copy(controls.target).add(off); controls.update(); }
}
new ResizeObserver(resize).observe(view);

// ---------- squad (instanced: 2 draw calls per unit type) ----------
let squad = null;
function disposeSquad() {
  if (!squad) return;
  for (const g of squad.groups) for (const m of g.meshes) { field.remove(m); m.geometry.dispose(); m.dispose?.(); }
  field.remove(squad.blobs); squad.blobs.dispose?.(); squad = null;
}
function squadPlan() {
  if (!squadMix) return [{ unit: db.unit, count: squadN }];
  const tanks = Math.max(1, Math.round(squadN / 10));
  return [{ unit: 'tank', count: tanks }, { unit: 'trooper', count: squadN - tanks }];
}
function buildSquad() {
  disposeSquad();
  const groups = [], slots = [];
  let zCursor = 0, extent = 0;
  for (const { unit, count } of squadPlan()) {
    const geos = T.buildMergedDef(UNITS[unit], fullState(unit)), meshes = [];
    let perTris = 0;
    for (const [mat, g] of Object.entries(geos)) {
      const im = new THREE.InstancedMesh(g, mat === 'team' ? look.team : look.visor, count);
      im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.name = `squad:${unit}:${mat}`;
      field.add(im); meshes.push(im); perTris += g.attributes.position.count / 3;
    }
    const tank = unit === 'tank', sx = tank ? 3.6 : 1.25, sz = tank ? 4.8 : 1.35;
    const cols = Math.ceil(Math.sqrt(count * (tank && squadMix ? 2 : 1))), rows = Math.ceil(count / cols), offs = [];
    for (let i = 0; i < count; i++) {
      const c = i % cols, r = (i / cols) | 0;
      const x = (c - (cols - 1) / 2) * sx + (tank ? 0 : (r % 2) * 0.3), z = zCursor - r * sz;
      offs.push({ x, z, ph: (i * 2.399) % 6.283, yaw: Math.sin(i * 12.9898) * (tank ? 0.12 : 0.25), hover: tank && db.cur.tank.drive === 1 });
      slots.push({ x, z, sx: tank ? 2.6 : 1, sz: tank ? 4.2 : 1 });
    }
    extent = Math.max(extent, cols * sx, rows * sz + Math.abs(zCursor));
    zCursor -= rows * sz + (tank ? 1.5 : 0);
    groups.push({ unit, count, meshes, offs, perTris });
  }
  // recenter on z
  const zMid = zCursor / 2;
  for (const g of groups) for (const o of g.offs) o.z -= zMid;
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, slots.length); blobs.frustumCulled = false; field.add(blobs);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  slots.forEach((s, i) => blobs.setMatrixAt(i, m4.compose(new THREE.Vector3(s.x, 0.004, s.z - zMid), q, new THREE.Vector3(s.sx, s.sz, 1))));
  blobs.instanceMatrix.needsUpdate = true;
  squad = { groups, blobs, extent };
  animateSquad(0);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _sc = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);
function animateSquad(t) {
  if (!squad) return;
  for (const g of squad.groups) {
    const tank = g.unit === 'tank';
    for (let i = 0; i < g.offs.length; i++) {
      const o = g.offs[i];
      _p.set(o.x, o.hover ? 0.035 * Math.sin(t * 1.7 + o.ph) : 0, o.z);
      _q.setFromAxisAngle(_y, o.yaw + (tank ? 0 : 0.04 * Math.sin(t * 0.7 + o.ph)));
      _sc.set(1, tank ? 1 : 1 + 0.01 * Math.sin(t * 2.1 + o.ph), 1);
      _m.compose(_p, _q, _sc);
      for (const im of g.meshes) im.setMatrixAt(i, _m);
    }
    for (const im of g.meshes) im.instanceMatrix.needsUpdate = true;
  }
}
function setSquad(on) {
  squadOn = !!on;
  stage.visible = !squadOn; field.visible = squadOn;
  if (squadOn) buildSquad(); else disposeSquad();
  $('#squadBtn').classList.toggle('on', squadOn); $('#squadbar').classList.toggle('hidden', !squadOn);
  $('#squadN b').textContent = squadN; $('#squadMix').classList.toggle('on', squadMix);
  camHome(); updateStatsText();
}

// ---------- thumbnails (offscreen render target, shared renderer) ----------
const TS = 144;
const thumbRT = new THREE.WebGLRenderTarget(TS, TS);
const thumbScene = new THREE.Scene(); addLights(thumbScene);
const thumbLook = new T.TeamLook();
const thumbCam = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
const thumbPix = new Uint8Array(TS * TS * 4);
const LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LUT[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
const FRAMES = {
  full: { t: [0, 1.0, 0], r: 4.4, az: 0.45, pol: 1.4 },
  head: { t: [0, 1.65, 0.02], r: 0.85, az: 0.55, pol: 1.4 },
  torso: { t: [0, 1.12, 0], r: 2.0, az: 0.5, pol: 1.35 },
  arm: { t: [0.2, 1.28, 0], r: 1.35, az: 0.95, pol: 1.3 },
  back: { t: [0, 1.4, -0.1], r: 2.2, az: Math.PI - 0.55, pol: 1.3 },
  rifle: { t: [-0.1, 1.15, 0.38], r: 1.35, az: -1.35, pol: 1.3 },
  tank: { t: [0, 0.8, 0.3], r: 8.6, az: 0.7, pol: 1.15 },
  tturret: { t: [0, 1.25, 0.1], r: 5.2, az: 0.75, pol: 1.1 },
  tgun: { t: [0, 1.15, 0.8], r: 6.2, az: 1.15, pol: 1.2 },
  tback: { t: [0, 1.25, -0.3], r: 7.0, az: 2.45, pol: 1.15 },
};
function renderThumb(unit, state, frame) {
  thumbLook.paint(state);
  const geos = T.buildMergedDef(UNITS[unit], state), meshes = [];
  for (const [mat, g] of Object.entries(geos)) { const m = new THREE.Mesh(g, mat === 'team' ? thumbLook.team : thumbLook.visor); thumbScene.add(m); meshes.push(m); }
  const f = FRAMES[frame] || FRAMES.full, tgt = new THREE.Vector3(...f.t);
  thumbCam.position.setFromSpherical(new THREE.Spherical(f.r, f.pol, f.az)).add(tgt); thumbCam.lookAt(tgt);
  renderer.setRenderTarget(thumbRT); renderer.clear(); renderer.render(thumbScene, thumbCam);
  renderer.readRenderTargetPixels(thumbRT, 0, 0, TS, TS, thumbPix);
  renderer.setRenderTarget(null);
  for (const m of meshes) { thumbScene.remove(m); m.geometry.dispose(); }
  const img = new ImageData(TS, TS), d = img.data;
  for (let y = 0; y < TS; y++) {
    const src = (TS - 1 - y) * TS * 4, dst = y * TS * 4;
    for (let x = 0; x < TS * 4; x += 4) { d[dst + x] = LUT[thumbPix[src + x]]; d[dst + x + 1] = LUT[thumbPix[src + x + 1]]; d[dst + x + 2] = LUT[thumbPix[src + x + 2]]; d[dst + x + 3] = thumbPix[src + x + 3]; }
  }
  return img;
}
const thumbCache = new Map();
let thumbQueue = [];
const stateKey = (unit, st) => unit + '|' + T.nationCode(st) + st.skin + '|' + T.digits(st, UNITS[unit].fields);
function cachedThumb(unit, state, frame) {
  const key = frame + '|' + stateKey(unit, state);
  let img = thumbCache.get(key);
  if (!img) { img = renderThumb(unit, state, frame); thumbCache.set(key, img); if (thumbCache.size > 300) thumbCache.delete(thumbCache.keys().next().value); }
  return img;
}
function thumbDataURL(unit, state) {
  const img = cachedThumb(unit, state, unit === 'tank' ? 'tank' : 'full');
  const c = h('canvas', { width: TS, height: TS }); c.getContext('2d').putImageData(img, 0, 0);
  const s = h('canvas', { width: 96, height: 96 }); s.getContext('2d').drawImage(c, 0, 0, 96, 96);
  return s.toDataURL('image/png');
}
function pumpThumbs() {
  let n = 0;
  while (thumbQueue.length && n < 4) {
    const job = thumbQueue.shift();
    if (!job.canvas.isConnected) continue;
    job.canvas.getContext('2d').putImageData(cachedThumb(job.unit, job.state, job.frame), 0, 0); n++;
  }
}
function drawFlag(c, nat) {
  const g = c.getContext('2d'), W = c.width;
  g.clearRect(0, 0, W, W); g.fillStyle = nat.s; g.beginPath(); g.roundRect(W * 0.05, W * 0.05, W * 0.9, W * 0.9, W * 0.14); g.fill();
  g.strokeStyle = nat.p; g.lineWidth = Math.max(2, W * 0.06); g.stroke();
  T.drawSymbol(g, nat.sym, W / 2, W / 2, W * 0.31, T.symbolColor(nat));
}

// ---------- panel ----------
const TAB_DEF = {
  nation: { ico: '🏳️', title: 'Nation: player, colors, flag' },
  head: { ico: '🪖', title: 'Helmet' }, armor: { ico: '🛡️', title: 'Armor & pads' }, gear: { ico: '🎒', title: 'Backpack, banner & extras' }, rifle: { ico: '🔫', title: 'Rifle' },
  hull: { ico: '⛓️', title: 'Hull & drive' }, turret: { ico: '🎯', title: 'Turret & gun' }, tx: { ico: '📡', title: 'Tank extras' },
  looks: { ico: '💾', title: 'Saved looks & share code' },
};
const UNIT_TABS = { trooper: ['nation', 'head', 'armor', 'gear', 'rifle', 'looks'], tank: ['nation', 'hull', 'turret', 'tx', 'looks'] };
const PARTS = {
  helm: { unit: 'trooper', frame: 'head', names: ['Dome', 'Angular', 'Crest', 'Goggles', 'Recon'] },
  armor: { unit: 'trooper', frame: 'torso', names: ['Light', 'Medium', 'Heavy'] },
  pads: { unit: 'trooper', frame: 'arm', names: ['None', 'Round', 'Angular'] },
  pack: { unit: 'trooper', frame: 'back', names: ['None', 'Jet', 'Radio', 'Ammo'] },
  extra: { unit: 'trooper', frame: 'back', names: ['None', 'Cape', 'Scarf'] },
  rifle: { unit: 'trooper', frame: 'rifle', names: ['Carbine', 'Laser', 'Bullpup'] },
  banner: { unit: 'trooper', frame: 'back', names: ['Off', 'On'] },
  hull: { unit: 'tank', frame: 'tank', names: ['Light', 'Medium', 'Heavy'] },
  drive: { unit: 'tank', frame: 'tank', names: ['Treads', 'Hover'] },
  turret: { unit: 'tank', frame: 'tturret', names: ['Dome', 'Wedge', 'Box'] },
  gun: { unit: 'tank', frame: 'tgun', names: ['Cannon', 'Twin', 'Rail', 'Laser'] },
};
const TOGGLES = [['antenna', 'tback', 'Antenna'], ['pennant', 'tback', 'Pennant'], ['skirts', 'tank', 'Skirts'], ['smoke', 'tturret', 'Smoke'], ['mg', 'tturret', 'Roof MG']];
let tab = 'nation';
const tabsEl = $('#tabs'), body = $('#pbody');
tabsEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });

const lab = (ico, txt) => h('div', { className: 'lab' }, [ico, txt ? h('small', { textContent: txt }) : null]);
function swatchRow(key, palette, custom, glow = false) {
  const row = h('div', { className: 'sw', 'data-key': key });
  palette.forEach((c, i) => row.append(h('button', { type: 'button', title: c, 'aria-label': key + ' ' + c, 'data-k': key, 'data-v': custom ? c : String(i), style: `--c:${c}`, className: glow ? 'glow' : '' })));
  if (custom) {
    const inp = h('input', { type: 'color', 'aria-label': 'Custom color' });
    inp.addEventListener('input', () => setValues({ [key]: inp.value }));
    row.append(h('label', { title: 'Custom color', 'data-custom': key }, [h('span', { textContent: '🎨' }), inp]));
  }
  return row;
}
function partTiles(key) {
  const p = PARTS[key], row = h('div', { className: 'tiles', 'data-key': key });
  p.names.forEach((n, i) => row.append(h('button', { type: 'button', title: n, 'aria-label': key + ' ' + n, 'data-k': key, 'data-v': String(i), 'data-frame': p.frame, 'data-unit': p.unit },
    [h('canvas', { width: TS, height: TS }), h('i', { textContent: n }), costBadge(p.unit, key, i)])));
  return row;
}
function costBadge(unit, k, v) { const c = optionCost(unit, k, v); return h('b', { className: 'cb' + (c ? '' : ' free'), textContent: c ? '+' + c : '' }); }
function toggleTiles() {
  const row = h('div', { className: 'tiles', 'data-key': 'toggles' });
  for (const [k, frame, n] of TOGGLES) row.append(h('button', { type: 'button', title: n, 'aria-label': 'toggle ' + n, 'data-toggle': k, 'data-frame': frame, 'data-unit': 'tank' }, [h('canvas', { width: TS, height: TS }), h('i', { textContent: n }), costBadge('tank', k, 1)]));
  return row;
}
function symTiles() {
  const row = h('div', { className: 'tiles sym', 'data-key': 'sym' });
  T.SYMBOLS.forEach((n, i) => row.append(h('button', { type: 'button', title: n, 'aria-label': 'symbol ' + n, 'data-k': 'sym', 'data-v': String(i) }, [h('canvas', { width: 88, height: 88, 'data-sym': String(i) })])));
  return row;
}
function scTiles() {
  const row = h('div', { className: 'tiles sym', 'data-key': 'sc' });
  ['Auto', 'Light', 'Dark', 'Primary'].forEach((n, i) => row.append(h('button', { type: 'button', title: n, 'aria-label': 'symbol color ' + n, 'data-k': 'sc', 'data-v': String(i) }, [h('canvas', { width: 88, height: 88, 'data-sc': String(i) }), h('i', { textContent: ['A', '☀', '☾', '1'][i] })])));
  return row;
}
function iconTiles(key, icons, titles) {
  const row = h('div', { className: 'tiles small', 'data-key': key });
  icons.forEach((ic, i) => row.append(h('button', { type: 'button', title: titles[i], 'aria-label': key + ' ' + titles[i], 'data-k': key, 'data-v': String(i) }, [h('span', { className: 'ico', textContent: ic })])));
  return row;
}
const SECS = {
  nation: () => [
    lab('👤', 'player'),
    h('div', { className: 'saverow' }, [h('input', { id: 'playerName', type: 'text', maxLength: 24, placeholder: '👤', 'aria-label': 'Player name', autocomplete: 'off' })]),
    lab('🏳️', 'nations'), h('div', { id: 'nations', className: 'rows' }),
    h('button', { id: 'addNation', type: 'button', className: 'btn go wide', title: 'New nation', textContent: '➕ 🏳️' }),
    lab('🎨 1', 'main'), swatchRow('p', T.PRIMARY, true), lab('🎨 2', 'trim'), swatchRow('s', T.SECONDARY, true),
    lab('🧥', 'suit'), swatchRow('suit', T.SUIT, false),
    lab('🏳️', 'symbol'), symTiles(), lab('◐', 'symbol color'), scTiles(),
    lab('👁️', 'glow color'), swatchRow('vis', T.VISOR, false, true), lab('✨', 'glow'), iconTiles('glow', ['🌑', '🌓', '🌕'], ['Off', 'Soft', 'Bright']),
  ],
  head: () => [lab('🪖', 'helmet'), partTiles('helm'), lab('✋', 'skin (goggles)'), swatchRow('skin', T.SKIN, false)],
  armor: () => [lab('🛡️', 'build'), partTiles('armor'), lab('🔰', 'shoulders'), partTiles('pads')],
  gear: () => [lab('🎒', 'backpack'), partTiles('pack'), lab('🚩', 'back flag'), partTiles('banner'), lab('🧣', 'extra'), partTiles('extra')],
  rifle: () => [lab('🔫', 'rifle'), partTiles('rifle')],
  hull: () => [lab('⛓️', 'hull'), partTiles('hull'), lab('🛞', 'drive'), partTiles('drive')],
  turret: () => [lab('🎯', 'turret'), partTiles('turret'), lab('💥', 'main gun'), partTiles('gun')],
  tx: () => [lab('📡', 'extras'), toggleTiles()],
  looks: () => [
    lab('💾', 'save this look → active nation'),
    h('div', { className: 'saverow' }, [h('input', { id: 'lookName', type: 'text', maxLength: 24, placeholder: '🏷️ name', 'aria-label': 'Look name', autocomplete: 'off' }), h('button', { id: 'saveLook', type: 'button', className: 'btn go', title: 'Save as new look', textContent: '💾 +' })]),
    h('div', { id: 'looks', className: 'rows' }),
    lab('🔗', 'share code'),
    h('div', { className: 'coderow' }, [h('input', { id: 'codeIn', type: 'text', spellcheck: false, autocomplete: 'off', 'aria-label': 'Share code' }), h('button', { id: 'copyCode', type: 'button', className: 'btn', title: 'Copy code', textContent: '📋' }), h('button', { id: 'loadCode', type: 'button', className: 'btn go', title: 'Load pasted code', textContent: '⤵' })]),
  ],
};
for (const id of Object.keys(TAB_DEF)) body.append(h('div', { className: 'sec', 'data-sec': id }, SECS[id]()));
$('#playerName').addEventListener('input', (e) => { db.player.name = clean(e.target.value) || 'Player'; saveDB(); });
$('#playerName').addEventListener('change', (e) => { e.target.value = db.player.name; refreshCode(); });

body.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (b) { const k = b.dataset.k, v = b.dataset.v; setValues({ [k]: k === 'p' || k === 's' ? v : Number(v) }); return; }
  const t = e.target.closest('button[data-toggle]');
  if (t) { const k = t.dataset.toggle; setValues({ [k]: db.cur.tank[k] ? 0 : 1 }); }
});

function buildTabs() {
  tabsEl.replaceChildren(...UNIT_TABS[db.unit].map((id) => h('button', { type: 'button', title: TAB_DEF[id].title, 'aria-label': TAB_DEF[id].title, role: 'tab', 'data-tab': id, textContent: TAB_DEF[id].ico })));
  for (const b of document.querySelectorAll('#unitbar [data-unit]')) b.classList.toggle('on', b.dataset.unit === db.unit);
}
function setTab(id) {
  if (!UNIT_TABS[db.unit].includes(id)) id = UNIT_TABS[db.unit][1];
  tab = id;
  for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.tab === id);
  for (const s of body.children) s.classList.toggle('on', s.dataset.sec === id);
  body.scrollTop = 0;
  refreshPanel();
}

let thumbTimer = 0;
function refreshPanel() {
  const sec = body.querySelector(`.sec[data-sec="${tab}"]`), nat = nation();
  for (const b of sec.querySelectorAll('button[data-k]')) {
    const k = b.dataset.k, v = b.dataset.v, src = NATION_KEYS.has(k) ? nat : db.cur[PARTS[k]?.unit || 'trooper'];
    b.classList.toggle('on', k === 'p' || k === 's' ? src[k] === v : src[k] === Number(v));
  }
  for (const b of sec.querySelectorAll('button[data-toggle]')) b.classList.toggle('on', !!db.cur.tank[b.dataset.toggle]);
  for (const l of sec.querySelectorAll('label[data-custom]')) {
    const k = l.dataset.custom, pal = k === 'p' ? T.PRIMARY : T.SECONDARY, custom = !pal.includes(nat[k]);
    l.classList.toggle('on', custom); l.style.background = custom ? nat[k] : '';
    const inp = l.querySelector('input'); if (document.activeElement !== inp) inp.value = nat[k];
  }
  for (const c of sec.querySelectorAll('canvas[data-sym],canvas[data-sc]')) {
    const s2 = { ...nat }; if (c.dataset.sym) s2.sym = +c.dataset.sym; if (c.dataset.sc) s2.sc = +c.dataset.sc;
    drawFlag(c, s2);
  }
  if (tab === 'nation') { const pn = $('#playerName'); if (document.activeElement !== pn) pn.value = db.player.name; renderNations(); }
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    thumbQueue = [];
    for (const b of sec.querySelectorAll('button[data-frame]')) {
      const unit = b.dataset.unit, k = b.dataset.k || b.dataset.toggle, v = b.dataset.k ? Number(b.dataset.v) : 1;
      const s2 = fullState(unit, { ...db.cur[unit], [k]: v });
      const c = b.querySelector('canvas'), key = b.dataset.frame + '|' + stateKey(unit, s2);
      if (c.dataset.key === key) continue;
      c.dataset.key = key; thumbQueue.push({ canvas: c, unit, state: s2, frame: b.dataset.frame });
    }
  }, 60);
  if (tab === 'looks') { renderLooks(); refreshCode(); }
}
function refreshCode() { const ci = $('#codeIn'); if (ci && document.activeElement !== ci) ci.value = currentCode(); }

// ---------- nations ----------
let nEdit = null, nDel = null;
function renderNations() {
  const box = $('#nations'); box.replaceChildren();
  for (const n of db.nations) {
    const row = h('div', { className: 'look' + (n.id === db.active ? ' on' : ''), 'data-nid': n.id });
    const flag = h('canvas', { width: 96, height: 96, className: 'flag' }); drawFlag(flag, n);
    const cnt = db.looks.filter((l) => l.nationId === n.id).length;
    if (nEdit === n.id) {
      const inp = h('input', { type: 'text', value: n.name, maxLength: 24, 'aria-label': 'Nation name', className: 'rn' });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') nationAct('renok', n.id); if (e.key === 'Escape') nationAct('cancel', n.id); });
      row.append(flag, inp, h('button', { type: 'button', className: 'ib', 'data-nact': 'renok', title: 'Save name', textContent: '✔️' }), h('button', { type: 'button', className: 'ib', 'data-nact': 'cancel', title: 'Cancel', textContent: '✖️' }));
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    } else if (nDel === n.id) {
      row.append(flag, h('span', { className: 'q', textContent: `🗑️ ?${cnt ? ' +' + cnt + '💾' : ''}` }), h('button', { type: 'button', className: 'ib btn bad', 'data-nact': 'delok', title: 'Delete nation and its looks', textContent: '✔️' }), h('button', { type: 'button', className: 'ib', 'data-nact': 'cancel', title: 'Keep', textContent: '✖️' }));
    } else {
      row.append(...[h('button', { type: 'button', className: 'ld', 'data-nact': 'activate', title: 'Use ' + n.name }, [flag, h('span', { className: 'nm', textContent: n.name }), cnt ? h('small', { className: 'cnt', textContent: '💾' + cnt }) : null]),
        h('button', { type: 'button', className: 'ib', 'data-nact': 'rename', title: 'Rename nation', textContent: '✏️' }),
        db.nations.length > 1 ? h('button', { type: 'button', className: 'ib', 'data-nact': 'del', title: 'Delete nation', textContent: '🗑️' }) : null].filter(Boolean));
    }
    box.append(row);
  }
  $('#addNation').disabled = db.nations.length >= MAX_NATIONS;
}
function createNation(name, colors) {
  if (db.nations.length >= MAX_NATIONS) { toast('🏳️ ' + MAX_NATIONS + ' max', true); return null; }
  if (!colors) { // fresh random colors + symbol, distinct from the active nation
    const cur = nation(); let p, s;
    do { p = pick(T.PRIMARY); } while (p === cur.p);
    do { s = pick(T.SECONDARY); } while (s === p);
    colors = { p, s, suit: (Math.random() * 5) | 0, sym: (Math.random() * 12) | 0, sc: 0, vis: (Math.random() * 6) | 0, glow: 1 };
  }
  const n = newNation(clean(name) || 'Nation ' + (db.nations.length + 1), colors);
  db.nations.push(n); db.active = n.id; nEdit = nDel = null;
  applyState(); toast('🏳️ ' + n.name); return n.id;
}
function nationAct(act, id, arg) {
  const n = db.nations.find((x) => x.id === id); if (!n) return false;
  if (act === 'activate') { db.active = id; nEdit = nDel = null; applyState(); toast('🏳️ ' + n.name); return true; }
  if (act === 'rename') { nEdit = id; nDel = null; }
  else if (act === 'renok') { const v = clean(arg ?? $(`[data-nid="${id}"] input.rn`)?.value); if (v) n.name = v; nEdit = null; saveDB(); refreshCode(); }
  else if (act === 'del') { if (db.nations.length < 2) return false; nDel = id; nEdit = null; }
  else if (act === 'delok') {
    if (db.nations.length < 2) return false;
    db.nations = db.nations.filter((x) => x.id !== id); db.looks = db.looks.filter((l) => l.nationId !== id);
    if (db.active === id) db.active = db.nations[0].id;
    nDel = null; applyState(); toast('🗑️ ' + n.name); return true;
  }
  else if (act === 'cancel') { nEdit = nDel = null; }
  if (tab === 'nation') renderNations();
  return true;
}
body.addEventListener('click', (e) => {
  const b = e.target.closest('[data-nact]'); if (b) { const row = b.closest('[data-nid]'); if (row) nationAct(b.dataset.nact, row.dataset.nid); return; }
  if (e.target.closest('#addNation')) createNation();
});

// ---------- saved looks (grouped by nation, thumbnails in nation colors) ----------
let editId = null, delId = null;
const lookState = (l) => { const def = UNITS[l.unit], u = T.undigits(l.u, def.fields, def.defaults); return fullState(l.unit, u, nation(l.nationId)); };
function ensureThumb(l) {
  const st = lookState(l), tk = stateKey(l.unit, st);
  if (l.tk !== tk || !l.thumb) { l.thumb = thumbDataURL(l.unit, st); l.tk = tk; saveDB(); }
  return l.thumb;
}
function renderLooks() {
  const box = $('#looks'), curU = T.digits(db.cur[db.unit], UNITS[db.unit].fields);
  box.replaceChildren();
  if (!db.looks.length) { box.append(h('div', { className: 'empty', textContent: '💾 → 🏷️ 📋' })); return; }
  const order = [nation(), ...db.nations.filter((n) => n.id !== db.active)];
  for (const n of order) {
    const mine = db.looks.filter((l) => l.nationId === n.id); if (!mine.length) continue;
    const flag = h('canvas', { width: 64, height: 64, className: 'flag sm' }); drawFlag(flag, n);
    box.append(h('div', { className: 'grp' + (n.id === db.active ? ' on' : ''), 'data-gid': n.id }, [flag, h('b', { textContent: n.name }), h('small', { textContent: '💾' + mine.length })]));
    for (const l of mine) {
      const active = l.nationId === db.active && l.unit === db.unit && l.u === curU;
      const row = h('div', { className: 'look' + (active ? ' on' : ''), 'data-id': l.id, 'data-unit': l.unit });
      const img = h('img', { src: ensureThumb(l), alt: '' });
      const lc = unitCost(l.unit, lookState(l));
      const badge = h('span', { className: 'ub', textContent: l.unit === 'tank' ? '🚜' : '🪖' });
      if (editId === l.id) {
        const inp = h('input', { type: 'text', value: l.name, maxLength: 24, 'aria-label': 'New name', className: 'rn' });
        row.append(img, inp, h('button', { type: 'button', className: 'ib', 'data-act': 'renok', title: 'Save name', textContent: '✔️' }), h('button', { type: 'button', className: 'ib', 'data-act': 'cancel', title: 'Cancel', textContent: '✖️' }));
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookAct('renok', l.id); if (e.key === 'Escape') lookAct('cancel', l.id); });
        setTimeout(() => { inp.focus(); inp.select(); }, 0);
      } else if (delId === l.id) {
        row.append(img, h('span', { className: 'q', textContent: '🗑️ ?' }), h('button', { type: 'button', className: 'ib btn bad', 'data-act': 'delok', title: 'Delete', textContent: '✔️' }), h('button', { type: 'button', className: 'ib', 'data-act': 'cancel', title: 'Keep', textContent: '✖️' }));
      } else {
        row.append(h('button', { type: 'button', className: 'ld', 'data-act': 'load', title: 'Load ' + l.name }, [h('span', { className: 'tw' }, [img, badge]), h('span', { className: 'nm' }, [l.name, h('small', { className: 'lc' }, ['💰' + fmt(lc.cost), h('i', { textContent: '⚡' + lc.power })])])]),
          h('button', { type: 'button', className: 'ib', 'data-act': 'copy', title: 'Copy share code', textContent: '🔗' }),
          h('button', { type: 'button', className: 'ib', 'data-act': 'update', title: 'Overwrite with current look', textContent: '🔁' }),
          h('button', { type: 'button', className: 'ib', 'data-act': 'rename', title: 'Rename', textContent: '✏️' }),
          h('button', { type: 'button', className: 'ib', 'data-act': 'del', title: 'Delete', textContent: '🗑️' }));
      }
      box.append(row);
    }
  }
}
function saveLook(name) {
  if (db.looks.length >= MAX_LOOKS) { toast('📦 ' + MAX_LOOKS + ' max', true); return null; }
  const unit = db.unit, n = nation();
  name = clean(name) || (unit === 'tank' ? 'Tank ' : 'Trooper ') + (db.looks.filter((l) => l.unit === unit && l.nationId === n.id).length + 1);
  const l = { id: newId(), nationId: n.id, unit, name, u: T.digits(db.cur[unit], UNITS[unit].fields), thumb: '', tk: '' };
  ensureThumb(l);
  db.looks.unshift(l);
  if (!flushDB()) { db.looks.shift(); toast('⚠️ storage full', true); return null; }
  toast('💾 ' + name); return l.id;
}
function lookCode(l) {
  const def = UNITS[l.unit], u = T.undigits(l.u, def.fields, def.defaults), n = nation(l.nationId);
  return T.encodeTC2({ player: db.player.name, nationName: n.name, nation: n, trooper: l.unit === 'trooper' ? u : db.cur.trooper, tank: l.unit === 'tank' ? u : db.cur.tank, unit: l.unit }, TANK_FIELDS);
}
function lookAct(act, id, arg) {
  const l = db.looks.find((x) => x.id === id); if (!l) return false;
  if (act === 'load') {
    const def = UNITS[l.unit], u = T.undigits(l.u, def.fields, def.defaults);
    db.active = l.nationId; db.cur[l.unit] = u; switchUnit(l.unit, false); applyState(); toast('✅ ' + l.name); return true;
  }
  if (act === 'copy') copyText(lookCode(l));
  else if (act === 'update') { l.u = T.digits(db.cur[l.unit], UNITS[l.unit].fields); ensureThumb(l); saveDB(); toast('🔁 ' + l.name); }
  else if (act === 'rename') { editId = id; delId = null; }
  else if (act === 'renok') { const n = clean(arg ?? $(`.look[data-id="${id}"] input.rn`)?.value); if (n) { l.name = n; saveDB(); } editId = null; }
  else if (act === 'del') { delId = id; editId = null; }
  else if (act === 'delok') { db.looks = db.looks.filter((x) => x.id !== id); delId = null; saveDB(); toast('🗑️'); }
  else if (act === 'cancel') { editId = null; delId = null; }
  if (tab === 'looks') renderLooks();
  return true;
}
body.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (b) { const row = b.closest('.look'); if (row) lookAct(b.dataset.act, row.dataset.id); return; }
  if (e.target.closest('#saveLook')) { const inp = $('#lookName'); if (saveLook(inp.value)) { inp.value = ''; renderLooks(); } }
  else if (e.target.closest('#copyCode')) copyText(currentCode());
  else if (e.target.closest('#loadCode')) loadCodeFromField();
});
body.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'lookName') $('#saveLook').click();
  if (e.target.id === 'codeIn') loadCodeFromField();
  if (e.target.id === 'playerName') e.target.blur();
});

// ---------- share codes ----------
const currentCode = () => T.encodeTC2({ player: db.player.name, nationName: nation().name, nation: nation(), trooper: db.cur.trooper, tank: db.cur.tank, unit: db.unit }, TANK_FIELDS);
function parseCode(c) {
  const s = String(c || '').replace(/\s+/g, '');
  if (/^TC2:/i.test(s)) { const d = T.decodeTC2('TC2:' + s.slice(4), TANK_FIELDS, TANK_DEFAULT); return d && { kind: 'TC2', ...d }; }
  const d1 = T.decodeTC1(s); return d1 && { kind: 'TC1', nation: d1.nation, trooper: d1.trooper, unit: 'trooper', nationName: '', player: '' };
}
// import: reuse a nation with the same colors/flag (prefer same name), else create one
function importNation(nat, name) {
  const code = T.nationCode(nat);
  const same = db.nations.filter((n) => T.nationCode(n) === code);
  let n = same.find((x) => name && x.name === name) || same[0];
  if (!n) {
    if (db.nations.length >= MAX_NATIONS) { n = nation(); Object.assign(n, T.sanitizeNation(nat)); }
    else { n = newNation(clean(name) || 'Nation ' + (db.nations.length + 1), nat); db.nations.push(n); }
  }
  db.active = n.id; return n;
}
function loadCode(c) {
  const d = parseCode(c); if (!d) return false;
  importNation(d.nation, d.nationName);
  db.cur.trooper = d.trooper; if (d.tank) db.cur.tank = d.tank;
  switchUnit(d.unit, false); applyState();
  return d;
}
function loadCodeFromField() {
  const ci = $('#codeIn'), d = loadCode(ci.value);
  if (!d) { toast('❌ code', true); ci.classList.remove('shake'); void ci.offsetWidth; ci.classList.add('shake'); return false; }
  ci.blur(); refreshCode(); toast('✅ ' + (d.player ? '👤 ' + d.player + ' · ' : '') + '🏳️ ' + nation().name); return true;
}
async function copyText(t) {
  let ok = false;
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); ok = true; } } catch (e) { ok = false; }
  if (!ok) { try { const ta = h('textarea', { value: t, style: 'position:fixed;left:-999px;top:0;opacity:0' }); document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (e) { ok = false; } }
  toast(ok ? '📋 ' + t.slice(0, 22) + '…' : '📋 ✖', !ok);
  return ok;
}

// ---------- state ----------
function setValues(patch) {
  const nat = nation(), np = {}, up = {};
  for (const [k, v] of Object.entries(patch)) {
    if (NATION_KEYS.has(k)) np[k] = v;
    else if (UNITS[db.unit].fields.some(([f]) => f === k)) up[k] = v;
    else if (k === 'skin') db.cur.trooper = T.sanitizeFields({ ...db.cur.trooper, skin: v }, T.TROOPER_FIELDS, T.TROOPER_DEFAULT);
    else { const owner = Object.values(UNITS).find((d) => d.fields.some(([f]) => f === k)); if (owner) db.cur[owner.id] = T.sanitizeFields({ ...db.cur[owner.id], [k]: v }, owner.fields, owner.defaults); }
  }
  if (Object.keys(np).length) Object.assign(nat, T.sanitizeNation({ ...nat, ...np }));
  if (Object.keys(up).length) { const d = UNITS[db.unit]; db.cur[db.unit] = T.sanitizeFields({ ...db.cur[db.unit], ...up }, d.fields, d.defaults); }
  applyState();
}
function applyState() {
  look.paint(fullState('trooper'));
  for (const [id, u] of Object.entries(units)) { u.build(fullState(id)); u.root.visible = id === db.unit; }
  const tank = db.unit === 'tank';
  padGroup.scale.setScalar(tank ? 2.6 : 1); blob.scale.set(tank ? 2.4 : 1, tank ? 4.0 : 1, 1);
  if (squadOn) buildSquad();
  saveDB();
  refreshPanel(); updateStatsText();
}
function switchUnit(u, apply = true) {
  if (!UNITS[u]) return;
  const changed = u !== db.unit; db.unit = u; buildTabs(); setTab(tab);
  if (apply) applyState();
  if (changed) { if (squadOn) setSquad(true); else camHome(); }
}
function randomize() {
  if (tab === 'nation') { // nation colors + flag
    let p = Math.random() < 0.85 ? pick(T.PRIMARY) : '#' + ((Math.random() * 0xffffff) | 0).toString(16).padStart(6, '0'), s;
    do { s = pick(T.SECONDARY); } while (s === p);
    const o = { p, s }; for (const [k, n] of T.NATION_FIELDS) o[k] = (Math.random() * n) | 0;
    o.sc = Math.random() < 0.7 ? 0 : o.sc; o.glow = Math.max(1, o.glow);
    setValues(o); return;
  }
  const d = UNITS[db.unit], o = {};
  for (const [k, n] of d.fields) o[k] = (Math.random() * n) | 0;
  if (db.unit === 'trooper') { o.extra = Math.random() < 0.65 ? 0 : 1 + ((Math.random() * 2) | 0); o.banner = Math.random() < 0.7 ? 1 : 0; }
  setValues(o);
}
function resetUnit() { db.cur[db.unit] = { ...UNITS[db.unit].defaults }; applyState(); }

// ---------- HUD ----------
let fps = 0, frames = 0, fpsT = performance.now(), lastInfo = { calls: 0, triangles: 0 };
function modelStats() {
  if (squadOn && squad) {
    let tris = 0, calls = 0, count = 0; const per = {};
    for (const g of squad.groups) { tris += g.perTris * g.count; calls += g.meshes.length; count += g.count; per[g.unit] = { count: g.count, tris: g.perTris }; }
    let cost = 0, power = 0;
    for (const g of squad.groups) { const c = unitCost(g.unit, fullState(g.unit)); cost += c.cost * g.count; power += c.power * g.count; per[g.unit].cost = c.cost; }
    return { mode: 'squad', mix: squadMix, count, tris, calls, per, cost, power };
  }
  const u = units[db.unit], c = unitCost(db.unit, fullState());
  return { mode: 'single', unit: db.unit, count: 1, tris: u.tris, perTris: u.tris, calls: u.meshes.length, cost: c.cost, power: c.power };
}
function updateStatsText() {
  const m = modelStats();
  $('#sMode').textContent = m.mode === 'squad' ? '👥' + m.count : db.unit === 'tank' ? '🚜' : '🧍';
  $('#sTri').textContent = m.tris >= 10000 ? (m.tris / 1000).toFixed(1) + 'k' : String(m.tris);
  $('#sCalls').textContent = String(m.calls);
  const c = unitCost(db.unit, fullState()), cc = $('#cCost'), prev = cc.textContent;
  cc.textContent = fmt(c.cost); $('#cPow').textContent = String(c.power);
  if (prev !== cc.textContent && prev !== '0') { const chip = $('#costchip'); chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
  $('#squadCost').textContent = m.mode === 'squad' ? '💰' + fmt(m.cost) + ' ⚡' + fmt(m.power) : '';
}
let toastT = 0;
function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1400);
}
for (const b of document.querySelectorAll('#viewbar [data-view]')) b.addEventListener('click', () => { controls.autoRotate = false; $('#spinBtn').classList.remove('on'); viewTo(b.dataset.view); });
for (const b of document.querySelectorAll('#unitbar [data-unit]')) b.addEventListener('click', () => switchUnit(b.dataset.unit));
$('#spinBtn').addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; $('#spinBtn').classList.toggle('on', controls.autoRotate); });
$('#squadBtn').addEventListener('click', () => setSquad(!squadOn));
$('#squadN').addEventListener('click', () => { squadN = SQUAD_SIZES[(SQUAD_SIZES.indexOf(squadN) + 1) % SQUAD_SIZES.length]; setSquad(true); });
$('#squadMix').addEventListener('click', () => { squadMix = !squadMix; setSquad(true); });
$('#randBtn').addEventListener('click', () => { randomize(); toast('🎲'); });
$('#resetBtn').addEventListener('click', () => { resetUnit(); toast('↺'); });

// ---------- loop ----------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const t = clock.getElapsedTime();
  if (tween) {
    const k = Math.min(1, (performance.now() - tween.t0) / tween.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    camera.position.setFromSpherical(new THREE.Spherical(tween.r, tween.phiFrom + (tween.phiTo - tween.phiFrom) * e, tween.from + tween.d * e)).add(controls.target);
    if (k >= 1) tween = null;
  }
  controls.update();
  if (squadOn) animateSquad(t); else units[db.unit].animate(t);
  pumpThumbs();
  renderer.render(scene, camera);
  lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  frames++;
  const now = performance.now();
  if (now - fpsT >= 500) {
    fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
    $('#sFps').textContent = fps.toFixed(0);
    $('#stats').classList.toggle('slow', fps < 30); $('#stats').classList.toggle('ok', fps >= 50);
  }
}

// ---------- boot ----------
resize();
buildTabs();
applyState();
setTab(justMigrated && db.looks.length ? 'looks' : UNIT_TABS[db.unit][1]);
camHome();
loop();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- test / debug hooks ----------
const sigOf = (u) => ({ geo: units[u].sig, atlas: look.hash(), visor: look.visor.color.getHexString() + '/' + look.visor.emissiveIntensity });
window.__tc = {
  get state() { return fullState(); },
  get unit() { return db.unit; },
  get db() { return JSON.parse(JSON.stringify(db)); },
  setUnit: (u) => switchUnit(u),
  fields: (u = db.unit) => UNITS[u].fields.map(([k, n]) => ({ k, n })),
  nationFields: T.NATION_FIELDS.map(([k, n]) => ({ k, n })),
  palettes: { p: T.PRIMARY, s: T.SECONDARY },
  set: (k, v) => setValues({ [k]: v }),
  setState: (o) => setValues(o),
  code: currentCode, loadCode, parse: parseCode,
  tc1: () => T.encodeTC1(nation(), db.cur.trooper),
  randomize, reset: resetUnit,
  resetNation: () => { Object.assign(nation(), T.sanitizeNation(T.NATION_DEFAULT)); applyState(); },
  signature: (u = db.unit) => sigOf(u),
  cost: (u = db.unit, o) => unitCost(u, o ? { ...fullState(u), ...o } : fullState(u)),
  costTable: COST,
  atlasColor: (x = 72) => { const d = look.ctx.getImageData(x, 32, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); },
  trisFor: (u, o) => { const d = UNITS[u], g = T.buildMergedDef(d, { ...T.NATION_DEFAULT, skin: 1, ...T.sanitizeFields(o, d.fields, d.defaults) }); let n = 0; for (const x of Object.values(g)) { n += x.attributes.position.count / 3; x.dispose(); } return n; },
  stats: () => ({ ...modelStats(), fps, frame: { ...lastInfo }, materials: new Set(units[db.unit].meshes.map((m) => m.material.uuid)).size, sharedMaterials: units.trooper.meshes[0].material === units.tank.meshes[0].material }),
  squad: (on, n, mix) => { if (n) squadN = n; if (mix != null) squadMix = !!mix; setSquad(on); return modelStats(); },
  tab: setTab, view: viewTo, flush: flushDB,
  wipe: () => { wiped = true; clearTimeout(saveT); try { localStorage.clear(); } catch (e) { /* ignore */ } },
  player: (name) => { if (name != null) { db.player.name = clean(name) || 'Player'; saveDB(); refreshPanel(); } return db.player.name; },
  nations: {
    list: () => db.nations.map((n) => ({ ...n, active: n.id === db.active, looks: db.looks.filter((l) => l.nationId === n.id).length })),
    create: (name, colors) => createNation(name, colors),
    act: nationAct,
  },
  looks: {
    list: () => db.looks.map((l) => ({ id: l.id, nationId: l.nationId, unit: l.unit, name: l.name, u: l.u, hasThumb: l.thumb.startsWith('data:image/') })),
    save: (name) => { const id = saveLook(name); if (tab === 'looks') renderLooks(); return id; },
    act: lookAct,
  },
  ready: true,
};
