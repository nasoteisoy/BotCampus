// Trooper Customizer: scene, turntable, squad preview, customization panel, saved looks library.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/addons/controls/OrbitControls.js?v=1';
import * as T from './trooper.js?v=1';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v); }
  for (const c of [].concat(kids)) if (c != null) e.append(c);
  return e;
};

// ---------- storage ----------
const LS_CUR = 'trooper-custom:current', LS_LOOKS = 'trooper-custom:looks', MAX_LOOKS = 40;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
let st = T.decode(lsGet(LS_CUR)) || { ...T.DEFAULT };
let looks = [];
try { const a = JSON.parse(lsGet(LS_LOOKS) || '[]'); if (Array.isArray(a)) looks = a.filter((l) => l && typeof l.id === 'string' && T.decode(l.code)).map((l) => ({ id: l.id, name: String(l.name || 'Trooper').slice(0, 24), code: l.code, thumb: typeof l.thumb === 'string' ? l.thumb : '', t: +l.t || 0 })); } catch (e) { looks = []; }
const saveLooks = () => lsSet(LS_LOOKS, JSON.stringify(looks));

// ---------- renderer / scene ----------
const view = $('#view'), app = $('#app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 300);
function addLights(sc) {
  sc.add(new THREE.HemisphereLight(0xcfe0ff, 0x262a33, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(2.5, 4, 3.5); sc.add(key);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 1.2); rim.position.set(-3, 2.5, -3.5); sc.add(rim);
}
addLights(scene);

// stage for the single trooper
const stage = new THREE.Group(); scene.add(stage);
{
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshLambertMaterial({ color: 0x1a2232 }));
  pad.rotation.x = -Math.PI / 2; stage.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.06, 1.1, 40), new THREE.MeshBasicMaterial({ color: 0x6ff3ff, transparent: true, opacity: 0.45 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; stage.add(ring);
}
// soft blob shadow (shared by single + squad)
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.004; stage.add(blob);

// squad field
const field = new THREE.Group(); field.visible = false; scene.add(field);
{
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x151b28 }));
  gnd.rotation.x = -Math.PI / 2; field.add(gnd);
  const grid = new THREE.GridHelper(80, 40, 0x2c3a55, 0x1f2840); grid.position.y = 0.003; field.add(grid);
}

const look = new T.TeamLook();
const trooper = new T.Trooper(look);
stage.add(trooper.root);

// ---------- camera / controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.12; controls.enablePan = false; controls.rotateSpeed = 0.8;
controls.autoRotateSpeed = 2.5;
let squadOn = false, squadN = 100;
const SQUAD_SIZES = [50, 100, 200];
function fitDistance() {
  const aspect = camera.aspect, t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.max(1.25 / t, 0.8 / (t * aspect)) * 1.12;
}
function setOrbit(target, r, polar, az) {
  controls.target.set(...target);
  const s = new THREE.Spherical(r, polar, az);
  camera.position.setFromSpherical(s).add(controls.target);
  camera.lookAt(controls.target); controls.update();
}
function squadSpread() { const cols = Math.ceil(Math.sqrt(squadN)); return cols * 1.25; }
function camHome() {
  if (squadOn) {
    controls.minDistance = 4; controls.maxDistance = 90;
    const r = squadSpread() * 1.35 / Math.min(1, camera.aspect) + 10;
    setOrbit([0, 0, 0], r, 0.85, 0.35);
  } else {
    controls.minDistance = 1.3; controls.maxDistance = 9;
    setOrbit([0, 1.0, 0], fitDistance(), 1.38, 0.45);
  }
}
let tween = null;
function viewTo(name) {
  const off = camera.position.clone().sub(controls.target), s = new THREE.Spherical().setFromVector3(off);
  let az = { front: 0, side: -Math.PI / 2, back: Math.PI }[name] ?? 0;
  let d = az - s.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
  tween = { t0: performance.now(), dur: 450, from: s.theta, d, phiFrom: s.phi, phiTo: squadOn ? 0.85 : 1.42, r: s.radius };
}

function resize() {
  const w = Math.max(1, view.clientWidth), hh = Math.max(1, view.clientHeight);
  renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix();
  if (!squadOn) { const off = camera.position.clone().sub(controls.target); off.setLength(fitDistance()); camera.position.copy(controls.target).add(off); controls.update(); }
}
new ResizeObserver(resize).observe(view);

// ---------- squad (instanced: 2 draw calls for the whole squad) ----------
let squad = null; // {meshes, offs, perTris}
function disposeSquad() {
  if (!squad) return;
  for (const m of squad.meshes) { field.remove(m); m.geometry.dispose(); m.dispose?.(); }
  field.remove(squad.blobs); squad.blobs.dispose?.(); squad = null;
}
function buildSquad() {
  disposeSquad();
  const geos = T.buildMerged(st), meshes = [];
  let perTris = 0;
  for (const [mat, g] of Object.entries(geos)) {
    const im = new THREE.InstancedMesh(g, mat === 'team' ? look.team : look.visor, squadN);
    im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.name = 'squad:' + mat;
    field.add(im); meshes.push(im); perTris += g.attributes.position.count / 3;
  }
  const blobs = new THREE.InstancedMesh(blob.geometry, blobMat, squadN); blobs.frustumCulled = false; field.add(blobs);
  const cols = Math.ceil(Math.sqrt(squadN)), rows = Math.ceil(squadN / cols), offs = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(-Math.PI / 2, 0, 0);
  for (let i = 0; i < squadN; i++) {
    const c = i % cols, r = (i / cols) | 0;
    const x = (c - (cols - 1) / 2) * 1.25 + (r % 2) * 0.3, z = (r - (rows - 1) / 2) * 1.35;
    offs.push({ x, z, ph: (i * 2.399) % 6.283, yaw: Math.sin(i * 12.9898) * 0.25 });
    blobs.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.004, z), q.setFromEuler(e), new THREE.Vector3(1, 1, 1)));
  }
  blobs.instanceMatrix.needsUpdate = true;
  squad = { meshes, offs, perTris, blobs };
  animateSquad(0);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _sc = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);
function animateSquad(t) {
  if (!squad) return;
  for (let i = 0; i < squad.offs.length; i++) {
    const o = squad.offs[i];
    _p.set(o.x, 0, o.z); _q.setFromAxisAngle(_y, o.yaw + 0.04 * Math.sin(t * 0.7 + o.ph));
    _sc.set(1, 1 + 0.01 * Math.sin(t * 2.1 + o.ph), 1);
    _m.compose(_p, _q, _sc);
    for (const im of squad.meshes) im.setMatrixAt(i, _m);
  }
  for (const im of squad.meshes) im.instanceMatrix.needsUpdate = true;
}
function setSquad(on) {
  squadOn = !!on;
  stage.visible = !squadOn; field.visible = squadOn;
  if (squadOn) buildSquad(); else disposeSquad();
  $('#squadBtn').classList.toggle('on', squadOn); $('#squadbar').classList.toggle('hidden', !squadOn);
  $('#squadN b').textContent = squadN;
  camHome(); updateStatsText();
}

// ---------- thumbnails (offscreen render target, shared renderer) ----------
const TS = 144;
const thumbRT = new THREE.WebGLRenderTarget(TS, TS);
const thumbScene = new THREE.Scene(); addLights(thumbScene);
const thumbLook = new T.TeamLook();
const thumbCam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
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
};
function renderThumb(state, frame) {
  thumbLook.paint(state);
  const geos = T.buildMerged(state), meshes = [];
  for (const [mat, g] of Object.entries(geos)) { const m = new THREE.Mesh(g, mat === 'team' ? thumbLook.team : thumbLook.visor); thumbScene.add(m); meshes.push(m); }
  const f = FRAMES[frame] || FRAMES.full;
  const tgt = new THREE.Vector3(...f.t);
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
function cachedThumb(state, frame) {
  const key = frame + '|' + T.encode(state);
  let img = thumbCache.get(key);
  if (!img) { img = renderThumb(state, frame); thumbCache.set(key, img); if (thumbCache.size > 240) thumbCache.delete(thumbCache.keys().next().value); }
  return img;
}
function lookThumbDataURL(state) {
  const img = cachedThumb(state, 'full');
  const c = h('canvas', { width: TS, height: TS }); c.getContext('2d').putImageData(img, 0, 0);
  const s = h('canvas', { width: 96, height: 96 }); s.getContext('2d').drawImage(c, 0, 0, 96, 96);
  return s.toDataURL('image/png');
}
function pumpThumbs() {
  let n = 0;
  while (thumbQueue.length && n < 4) {
    const job = thumbQueue.shift();
    if (!job.canvas.isConnected) continue;
    job.canvas.getContext('2d').putImageData(cachedThumb(job.state, job.frame), 0, 0); n++;
  }
}

// ---------- panel ----------
const TABS = [
  { id: 'color', ico: '🎨', title: 'Colors' }, { id: 'flag', ico: '🏳️', title: 'Flag symbol' }, { id: 'head', ico: '🪖', title: 'Helmet & visor' },
  { id: 'armor', ico: '🛡️', title: 'Armor & pads' }, { id: 'gear', ico: '🎒', title: 'Backpack & extras' }, { id: 'rifle', ico: '🔫', title: 'Rifle' },
  { id: 'looks', ico: '💾', title: 'Saved looks & share code' },
];
const PARTS = {
  helm: { frame: 'head', names: ['Dome', 'Angular', 'Crest', 'Goggles', 'Recon'] },
  armor: { frame: 'torso', names: ['Light', 'Medium', 'Heavy'] },
  pads: { frame: 'arm', names: ['None', 'Round', 'Angular'] },
  pack: { frame: 'back', names: ['None', 'Jet', 'Radio', 'Ammo'] },
  extra: { frame: 'back', names: ['None', 'Cape', 'Scarf'] },
  rifle: { frame: 'rifle', names: ['Carbine', 'Laser', 'Bullpup'] },
  banner: { frame: 'back', names: ['Off', 'On'] },
};
let tab = 'color';
const tabsEl = $('#tabs'), body = $('#pbody');
for (const t of TABS) tabsEl.append(h('button', { type: 'button', title: t.title, 'aria-label': t.title, role: 'tab', 'data-tab': t.id, textContent: t.ico }));
tabsEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });

const lab = (ico, txt) => h('div', { className: 'lab' }, [ico, txt ? h('small', { textContent: txt }) : null]);
function swatchRow(key, palette, custom, glow = false) {
  const row = h('div', { className: 'sw', 'data-key': key });
  palette.forEach((c, i) => row.append(h('button', { type: 'button', title: c, 'aria-label': key + ' ' + c, 'data-k': key, 'data-v': custom ? c : String(i), style: `--c:${c}`, className: glow ? 'glow' : '' })));
  if (custom) {
    const inp = h('input', { type: 'color', 'aria-label': 'Custom color', 'data-k': key });
    inp.addEventListener('input', () => setState({ [key]: inp.value }));
    row.append(h('label', { title: 'Custom color', 'data-custom': key }, [h('span', { textContent: '🎨' }), inp]));
  }
  return row;
}
function partTiles(key) {
  const p = PARTS[key], row = h('div', { className: 'tiles', 'data-key': key });
  p.names.forEach((n, i) => row.append(h('button', { type: 'button', title: n, 'aria-label': key + ' ' + n, 'data-k': key, 'data-v': String(i), 'data-frame': p.frame },
    [h('canvas', { width: TS, height: TS }), h('i', { textContent: n })])));
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
  color: () => [lab('🎨 1', 'main'), swatchRow('p', T.PRIMARY, true), lab('🎨 2', 'trim'), swatchRow('s', T.SECONDARY, true), lab('🧥', 'suit'), swatchRow('suit', T.SUIT, false)],
  flag: () => [lab('🏳️', 'symbol'), symTiles(), lab('◐', 'symbol color'), scTiles(), lab('🚩', 'back flag'), partTiles('banner')],
  head: () => [lab('🪖', 'helmet'), partTiles('helm'), lab('👁️', 'visor'), swatchRow('vis', T.VISOR, false, true), lab('✨', 'glow'), iconTiles('glow', ['🌑', '🌓', '🌕'], ['Off', 'Soft', 'Bright']), lab('✋', 'skin (goggles)'), swatchRow('skin', T.SKIN, false)],
  armor: () => [lab('🛡️', 'build'), partTiles('armor'), lab('🔰', 'shoulders'), partTiles('pads')],
  gear: () => [lab('🎒', 'backpack'), partTiles('pack'), lab('🧣', 'extra'), partTiles('extra')],
  rifle: () => [lab('🔫', 'rifle'), partTiles('rifle')],
  looks: () => [
    lab('💾', 'save this look'),
    h('div', { className: 'saverow' }, [h('input', { id: 'lookName', type: 'text', maxLength: 24, placeholder: '🏷️ name', 'aria-label': 'Look name', autocomplete: 'off' }), h('button', { id: 'saveLook', type: 'button', className: 'btn go', title: 'Save as new look', textContent: '💾 +' })]),
    h('div', { id: 'looks' }),
    lab('🔗', 'share code'),
    h('div', { className: 'coderow' }, [h('input', { id: 'codeIn', type: 'text', spellcheck: false, autocomplete: 'off', 'aria-label': 'Share code' }), h('button', { id: 'copyCode', type: 'button', className: 'btn', title: 'Copy code', textContent: '📋' }), h('button', { id: 'loadCode', type: 'button', className: 'btn go', title: 'Load pasted code', textContent: '⤵' })]),
  ],
};
for (const t of TABS) body.append(h('div', { className: 'sec', 'data-sec': t.id }, SECS[t.id]()));

body.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  const k = b.dataset.k, v = b.dataset.v;
  setState({ [k]: k === 'p' || k === 's' ? v : Number(v) });
});

function setTab(id) {
  tab = id;
  for (const b of tabsEl.children) b.classList.toggle('on', b.dataset.tab === id);
  for (const s of body.children) s.classList.toggle('on', s.dataset.sec === id);
  body.scrollTop = 0;
  refreshPanel();
}

let thumbTimer = 0;
function refreshPanel() {
  const sec = body.querySelector(`.sec[data-sec="${tab}"]`);
  // selection highlight
  for (const b of sec.querySelectorAll('button[data-k]')) {
    const k = b.dataset.k, v = b.dataset.v;
    b.classList.toggle('on', k === 'p' || k === 's' ? st[k] === v : st[k] === Number(v));
  }
  for (const l of sec.querySelectorAll('label[data-custom]')) {
    const k = l.dataset.custom, pal = k === 'p' ? T.PRIMARY : T.SECONDARY, custom = !pal.includes(st[k]);
    l.classList.toggle('on', custom); l.style.background = custom ? st[k] : '';
    const inp = l.querySelector('input'); if (document.activeElement !== inp) inp.value = st[k];
  }
  // flag symbol canvases (2D, instant)
  for (const c of sec.querySelectorAll('canvas[data-sym],canvas[data-sc]')) {
    const s2 = { ...st }; if (c.dataset.sym) s2.sym = +c.dataset.sym; if (c.dataset.sc) s2.sc = +c.dataset.sc;
    const g = c.getContext('2d'), W = c.width;
    g.clearRect(0, 0, W, W); g.fillStyle = s2.s; g.beginPath(); g.roundRect(4, 4, W - 8, W - 8, 12); g.fill();
    g.strokeStyle = s2.p; g.lineWidth = 5; g.stroke();
    T.drawSymbol(g, s2.sym, W / 2, W / 2, W * 0.31, T.symbolColor(s2));
  }
  // 3D part thumbnails (debounced, a few per frame)
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    thumbQueue = [];
    for (const b of sec.querySelectorAll('button[data-frame]')) {
      const c = b.querySelector('canvas'), s2 = { ...st, [b.dataset.k]: Number(b.dataset.v) };
      const key = b.dataset.frame + '|' + T.encode(s2);
      if (c.dataset.key === key) continue;
      c.dataset.key = key; thumbQueue.push({ canvas: c, state: s2, frame: b.dataset.frame });
    }
  }, 60);
  if (tab === 'looks') { renderLooks(); const ci = $('#codeIn'); if (document.activeElement !== ci) ci.value = T.encode(st); }
}

// ---------- saved looks ----------
let editId = null, delId = null;
function renderLooks() {
  const box = $('#looks'), cur = T.encode(st);
  box.replaceChildren();
  if (!looks.length) { box.append(h('div', { className: 'empty', textContent: '💾 → 🏷️ 📋' })); return; }
  for (const l of looks) {
    const row = h('div', { className: 'look' + (l.code === cur ? ' on' : ''), 'data-id': l.id });
    const img = h('img', { src: l.thumb || '', alt: '' });
    if (editId === l.id) {
      const inp = h('input', { type: 'text', value: l.name, maxLength: 24, 'aria-label': 'New name', className: 'rn' });
      row.append(img, inp, h('button', { type: 'button', className: 'ib', 'data-act': 'renok', title: 'Save name', textContent: '✔️' }), h('button', { type: 'button', className: 'ib', 'data-act': 'cancel', title: 'Cancel', textContent: '✖️' }));
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookAct('renok', l.id); if (e.key === 'Escape') lookAct('cancel', l.id); });
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    } else if (delId === l.id) {
      row.append(img, h('span', { className: 'q', textContent: '🗑️ ?' }), h('button', { type: 'button', className: 'ib btn bad', 'data-act': 'delok', title: 'Delete', textContent: '✔️' }), h('button', { type: 'button', className: 'ib', 'data-act': 'cancel', title: 'Keep', textContent: '✖️' }));
    } else {
      row.append(h('button', { type: 'button', className: 'ld', 'data-act': 'load', title: 'Load ' + l.name }, [img, h('span', { className: 'nm', textContent: l.name })]),
        h('button', { type: 'button', className: 'ib', 'data-act': 'copy', title: 'Copy share code', textContent: '🔗' }),
        h('button', { type: 'button', className: 'ib', 'data-act': 'update', title: 'Overwrite with current look', textContent: '🔁' }),
        h('button', { type: 'button', className: 'ib', 'data-act': 'rename', title: 'Rename', textContent: '✏️' }),
        h('button', { type: 'button', className: 'ib', 'data-act': 'del', title: 'Delete', textContent: '🗑️' }));
    }
    box.append(row);
  }
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function saveLook(name) {
  name = String(name || '').trim().slice(0, 24) || 'Trooper ' + (looks.length + 1);
  if (looks.length >= MAX_LOOKS) { toast('📦 ' + MAX_LOOKS + ' max', true); return null; }
  const l = { id: newId(), name, code: T.encode(st), thumb: lookThumbDataURL(st), t: Date.now() };
  looks.unshift(l);
  if (!saveLooks()) { looks.shift(); toast('⚠️ storage full', true); return null; }
  toast('💾 ' + name); return l.id;
}
function lookAct(act, id, arg) {
  const l = looks.find((x) => x.id === id); if (!l) return false;
  if (act === 'load') { const s = T.decode(l.code); if (s) { st = s; applyState(); toast('✅ ' + l.name); } }
  else if (act === 'copy') copyText(l.code);
  else if (act === 'update') { l.code = T.encode(st); l.thumb = lookThumbDataURL(st); l.t = Date.now(); saveLooks(); toast('🔁 ' + l.name); }
  else if (act === 'rename') { editId = id; delId = null; }
  else if (act === 'renok') {
    const v = arg ?? $(`.look[data-id="${id}"] input.rn`)?.value;
    const n = String(v || '').trim().slice(0, 24); if (n) { l.name = n; saveLooks(); } editId = null;
  }
  else if (act === 'del') { delId = id; editId = null; }
  else if (act === 'delok') { looks = looks.filter((x) => x.id !== id); delId = null; saveLooks(); toast('🗑️'); }
  else if (act === 'cancel') { editId = null; delId = null; }
  if (tab === 'looks') renderLooks();
  return true;
}
body.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (b) { const row = b.closest('.look'); if (row) lookAct(b.dataset.act, row.dataset.id); return; }
  if (e.target.closest('#saveLook')) { const inp = $('#lookName'); if (saveLook(inp.value)) { inp.value = ''; renderLooks(); } }
  else if (e.target.closest('#copyCode')) copyText(T.encode(st));
  else if (e.target.closest('#loadCode')) loadCodeFromField();
});
body.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'lookName') $('#saveLook').click();
  if (e.target.id === 'codeIn') loadCodeFromField();
});
function loadCodeFromField() {
  const ci = $('#codeIn'), s = T.decode(ci.value);
  if (!s) { toast('❌ code', true); ci.classList.remove('shake'); void ci.offsetWidth; ci.classList.add('shake'); return false; }
  st = s; ci.blur(); applyState(); toast('✅'); return true;
}
async function copyText(t) {
  let ok = false;
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); ok = true; } } catch (e) { ok = false; }
  if (!ok) {
    try { const ta = h('textarea', { value: t, style: 'position:fixed;left:-999px;top:0;opacity:0' }); document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (e) { ok = false; }
  }
  toast(ok ? '📋 ' + t : '📋 ✖', !ok);
  return ok;
}

// ---------- state ----------
function setState(patch) { st = T.sanitize({ ...st, ...patch }); applyState(); }
function applyState() {
  look.paint(st);
  trooper.build(st);
  if (squadOn) buildSquad();
  lsSet(LS_CUR, T.encode(st));
  refreshPanel(); updateStatsText();
}
const pick = (a) => a[(Math.random() * a.length) | 0];
function randomize() {
  const s = {};
  for (const [k, n] of T.FIELDS) s[k] = (Math.random() * n) | 0;
  s.p = Math.random() < 0.85 ? pick(T.PRIMARY) : '#' + ((Math.random() * 0xffffff) | 0).toString(16).padStart(6, '0');
  do { s.s = pick(T.SECONDARY); } while (s.s === s.p);
  s.extra = Math.random() < 0.65 ? 0 : 1 + ((Math.random() * 2) | 0);
  s.banner = Math.random() < 0.7 ? 1 : 0;
  s.sc = Math.random() < 0.7 ? 0 : s.sc;
  st = T.sanitize(s); applyState();
}

// ---------- HUD ----------
let fps = 0, frames = 0, fpsT = performance.now(), lastInfo = { calls: 0, triangles: 0 };
function modelStats() {
  if (squadOn && squad) return { mode: 'squad', count: squadN, tris: squad.perTris * squadN, perTris: squad.perTris, calls: squad.meshes.length };
  return { mode: 'single', count: 1, tris: trooper.tris, perTris: trooper.tris, calls: trooper.meshes.length };
}
function updateStatsText() {
  const m = modelStats();
  $('#sMode').textContent = m.mode === 'squad' ? '👥' + m.count : '🧍';
  $('#sTri').textContent = m.tris >= 10000 ? (m.tris / 1000).toFixed(1) + 'k' : String(m.tris);
  $('#sCalls').textContent = String(m.calls);
}
let toastT = 0;
function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1400);
}
for (const b of document.querySelectorAll('#viewbar [data-view]')) b.addEventListener('click', () => { controls.autoRotate = false; $('#spinBtn').classList.remove('on'); viewTo(b.dataset.view); });
$('#spinBtn').addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; $('#spinBtn').classList.toggle('on', controls.autoRotate); });
$('#squadBtn').addEventListener('click', () => setSquad(!squadOn));
$('#squadN').addEventListener('click', () => { squadN = SQUAD_SIZES[(SQUAD_SIZES.indexOf(squadN) + 1) % SQUAD_SIZES.length]; setSquad(true); });
$('#randBtn').addEventListener('click', () => { randomize(); toast('🎲'); });
$('#resetBtn').addEventListener('click', () => { st = { ...T.DEFAULT }; applyState(); toast('↺'); });

// ---------- loop ----------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const t = clock.getElapsedTime();
  if (tween) {
    const k = Math.min(1, (performance.now() - tween.t0) / tween.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const s = new THREE.Spherical(tween.r, tween.phiFrom + (tween.phiTo - tween.phiFrom) * e, tween.from + tween.d * e);
    camera.position.setFromSpherical(s).add(controls.target);
    if (k >= 1) tween = null;
  }
  controls.update();
  if (squadOn) animateSquad(t); else trooper.animate(t);
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
applyState();
setTab('color');
camHome();
loop();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- test / debug hooks ----------
window.__tc = {
  get state() { return { ...st }; },
  fields: T.FIELDS.map(([k, n]) => ({ k, n })),
  palettes: { p: T.PRIMARY, s: T.SECONDARY },
  set: (k, v) => setState({ [k]: v }),
  setState: (o) => setState(o),
  code: () => T.encode(st),
  loadCode: (c) => { const s = T.decode(c); if (!s) return false; st = s; applyState(); return true; },
  decode: (c) => T.decode(c),
  trisFor: (o) => { const g = T.buildMerged(T.sanitize(o)); let n = 0; for (const x of Object.values(g)) { n += x.attributes.position.count / 3; x.dispose(); } return n; },
  randomize, reset: () => { st = { ...T.DEFAULT }; applyState(); },
  signature: () => ({ geo: trooper.sig, atlas: look.hash(), visor: look.visor.color.getHexString() + '/' + look.visor.emissiveIntensity }),
  stats: () => ({ ...modelStats(), fps, frame: { ...lastInfo }, materials: new Set(trooper.meshes.map((m) => m.material.uuid)).size }),
  squad: (on, n) => { if (n) squadN = n; setSquad(on); return modelStats(); },
  tab: setTab,
  view: viewTo,
  looks: {
    list: () => looks.map((l) => ({ id: l.id, name: l.name, code: l.code, hasThumb: l.thumb.startsWith('data:image/') })),
    save: (name) => { const id = saveLook(name); if (tab === 'looks') renderLooks(); return id; },
    act: lookAct,
  },
  ready: true,
};
