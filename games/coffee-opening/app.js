/* Coffee Opening: isometric Three.js project tracker for opening a new coffee shop.
   The 3D lot builds up from the real checklist (data.js). Drag/pinch only with ✋ on. */
import * as THREE from './three.module.min.js';

const CO = window.CO, S = CO.STAGES, N = S.length, V = CO.IDX.vote;
const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DEMO_S = 60;

// ---------------------------------------------------------------- state
let state = CO.load(localStorage);
const ui = { sel: -1, sheet: null, drag: false, demo: null, dtour: null, mode: 'lot', filter: 'all', sort: 'urgency', editing: null, confirm: null, hiIssue: null, today: CO.today() };
const store = () => state.stores.find((s) => s.id === state.cur) || state.stores[0];
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => localStorage.setItem(CO.KEY, JSON.stringify(state)), 150); }
function saveNow() { clearTimeout(saveT); localStorage.setItem(CO.KEY, JSON.stringify(state)); }
addEventListener('pagehide', saveNow);

function model() {
  if (ui.demo) {
    const x = clamp((performance.now() - ui.demo.t0) / 1000 / DEMO_S), f = x * N;
    const p = S.map((_, i) => clamp(f - i));
    return { p, status: p.map((v) => (v >= 1 ? 'done' : 'ok')), vote: p[V] >= 1 ? 'approved' : 'pending', stopped: p.map(() => false), cur: Math.min(N - 1, Math.floor(f)), overall: x, days: Math.round((1 - x) * 250), demo: true, x };
  }
  const st = store(), d = ui.today;
  if (CO.isOpen(st)) { const one = S.map(() => 1); return { p: one, status: S.map(() => 'done'), vote: 'approved', stopped: S.map(() => false), cur: N - 1, overall: 1, days: CO.diffDays(st.ops.opened, d), open: true, ops: CO.opsStatus(st, d) }; }
  return { p: S.map((_, i) => CO.eff(st, i)), status: S.map((_, i) => CO.status(st, i, d)), vote: st.stages[V].vote, stopped: S.map((_, i) => CO.stopped(st, i)), cur: CO.current(st), overall: CO.overall(st), days: CO.daysTo(st, d) };
}
let M = model();

// ---------------------------------------------------------------- renderer, camera, lights
const cv = $('scene'), stageEl = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
const lot = new THREE.Group(); scene.add(lot);    // one store's lot (hidden on the 🗺 district map)
const dist = new THREE.Group(); scene.add(dist); dist.visible = false;
let EL = THREE.MathUtils.degToRad(38);   // camera elevation: steeper in portrait so the lot fills the tall screen
const view = { tx: 0, tz: 0, h: 30, az: Math.PI / 4, ox: 0, oy: 0 };   // shown
const dst = { tx: 0, tz: 0, h: 30, az: Math.PI / 4, ox: 0, oy: 0 };   // wanted
const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b8c4, 1.7); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-14, 30, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 80 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);

// ---------------------------------------------------------------- palettes + materials by role
const PAL = {
  day: { bg: 0xeef0f3, ground: 0xe4e7eb, grid: 0xc9ced6, dirt: 0xdccbaa, asphalt: 0x8d949e, road: 0x9ca3ad, paint: 0xffffff, wall: 0xf7f3ec, roof: 0x4a5160, trim: 0xff6b5b,
    glass: 0x9fd3e6, concrete: 0xc4c6ca, wood: 0xc9a27a, crane: 0xf2b134, truck: 0xf2a03d, van: 0xffffff, staff: 0xff6b5b, skin: 0xf1c7a6, pad: 0xffffff, ringBase: 0xd7dbe1,
    route: 0xff6b5b, todo: 0xbfc5ce, leaf: 0x86c89f, trunk: 0x9b7653, paper: 0xffffff, dark: 0x3b4250, flag: 0xff7a3d, metal: 0xaab2bd, sign: 0xffffff, lampOff: 0x9aa3ae,
    car0: 0x5b8def, car1: 0x2fb171, car2: 0xffffff, car3: 0x9b6bff, bal0: 0xff6b5b, bal1: 0xffc23d, bal2: 0x5b8def },
  night: { bg: 0x0b0f17, ground: 0x151c28, grid: 0x26344a, dirt: 0x4a3f30, asphalt: 0x262d38, road: 0x20262f, paint: 0x6a7484, wall: 0x46516a, roof: 0x232a36, trim: 0xff8c1a,
    glass: 0xffc861, concrete: 0x3a404a, wood: 0x5e4c3b, crane: 0xc98a1d, truck: 0xcf7a1c, van: 0xb8c0cc, staff: 0xff8c1a, skin: 0xcfa486, pad: 0x1b2230, ringBase: 0x263142,
    route: 0xff8c1a, todo: 0x2e3a4c, leaf: 0x2f5a44, trunk: 0x4a3a2c, paper: 0xc9d0da, dark: 0x0e1117, flag: 0xff8c1a, metal: 0x5c6573, sign: 0x232a36, lampOff: 0x3b4452,
    car0: 0x3d6bc4, car1: 0x23875a, car2: 0xaab3c0, car3: 0x7350c4, bal0: 0xff6b5b, bal1: 0xffc23d, bal2: 0x5b8def },
};
const GLOW = { day: { glass: 0x000000, sign: 0x000000 }, night: { glass: 0x6b4a10, sign: 0x40250a } };
const ST_COL = { day: { ok: 0xff6b5b, risk: 0xf5a524, blocked: 0xe5484d, done: 0x2fb171, todo: 0xc4cad3 }, night: { ok: 0xff8c1a, risk: 0xffb020, blocked: 0xff4d55, done: 0x34d17f, todo: 0x324056 } };
const mats = {};
function mat(role, basic) {
  const k = role + (basic ? '#b' : '');
  if (!mats[k]) mats[k] = basic ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  mats[k].userData.role = role; return mats[k];
}
const pal = () => PAL[state.theme];

// geometry helpers: boxes/cylinders sit on y = 0 so scale.y grows them from the ground
const G = {};
function bgeo(w, h, d) { const k = `b${w},${h},${d}`; if (!G[k]) { G[k] = new THREE.BoxGeometry(w, h, d); G[k].translate(0, h / 2, 0); } return G[k]; }
function cgeo(rt, rb, h, seg = 8) { const k = `c${rt},${rb},${h},${seg}`; if (!G[k]) { G[k] = new THREE.CylinderGeometry(rt, rb, h, seg); G[k].translate(0, h / 2, 0); } return G[k]; }
function sgeo(r, seg = 8) { const k = `s${r},${seg}`; if (!G[k]) G[k] = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)); return G[k]; }
function add(geo, role, x, y, z, parent, shadow = true) {
  const m = new THREE.Mesh(geo, typeof role === 'string' ? mat(role) : role); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; (parent || lot).add(m); return m;
}
const box = (w, h, d, role, x, y, z, p, sh) => add(bgeo(w, h, d), role, x, y, z, p, sh);
const cyl = (rt, rb, h, role, x, y, z, p, seg) => add(cgeo(rt, rb, h, seg), role, x, y, z, p);
const ball = (r, role, x, y, z, p, seg) => add(sgeo(r, seg), role, x, y, z, p);
const flat = (w, d, role, x, z, y = 0.02, p) => { const m = box(w, 0.02, d, role, x, y, z, p, false); return m; };
function group(x = 0, z = 0, parent = lot) { const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g); return g; }

// text on a canvas texture (signs)
function textTex(lines, bg, fg, w = 256, h = 96) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const L = Array.isArray(lines) ? lines : [lines];
  L.forEach((t, i) => { g.font = `800 ${i ? 24 : 34}px system-ui, sans-serif`; g.fillText(t, w / 2, h * (i + 1) / (L.length + 1)); });
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
// soft glow sprite for pulses and lamps
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff6b5b, transparent: true, depthWrite: false, opacity: 0.55 });
const lampGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc861, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });

// ---------------------------------------------------------------- ground, roads, lot
const ground = add(new THREE.PlaneGeometry(160, 160), 'ground', 0, 0, 0, scene, false); ground.rotation.x = -Math.PI / 2;
const grid = new THREE.GridHelper(160, 160, 0xffffff, 0xffffff); grid.material.transparent = true; grid.material.opacity = 0.35; grid.position.y = 0.005; scene.add(grid);
flat(70, 3.2, 'road', 0, 14.5, 0.01);
for (let x = -33; x < 34; x += 3) flat(1.4, 0.12, 'paint', x, 14.5, 0.03);
const LANE = [[5.6, 12.9, 5.6, -4.9], [5.6, -4.9, -5.6, -4.9], [-5.6, -4.9, -5.6, 4.9], [-5.6, 4.9, -1.6, 4.9], [-1.6, 4.9, -1.6, 12.9]];
const laneMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
for (const [x1, z1, x2, z2] of LANE) { const w = Math.abs(x2 - x1) + 1.6, d = Math.abs(z2 - z1) + 1.6; flat(w, d, laneMat, (x1 + x2) / 2, (z1 + z2) / 2, 0.015); }
flat(8.6, 6.2, laneMat, -7.4, 9.7, 0.015);                                       // parking lot
const stalls = group(); for (let k = 0; k < 6; k++) flat(0.1, 2.2, 'paint', -11.2 + k * 1.4, 8.1, 0.04, stalls);
for (let k = 0; k < 6; k++) flat(0.1, 2.2, 'paint', -11.2 + k * 1.4, 11.3, 0.04, stalls);
const arrows = group(); for (const [x, z] of [[5.6, 8], [5.6, 0], [0, -4.9], [-5.6, 0]]) flat(0.5, 0.5, 'paint', x, z, 0.04, arrows);
// trees + street lamps (lamps glow at night)
for (const [x, z, s] of [[-20, -14, 1.2], [-18, 6, 1], [-19, -2, 0.9], [18, -14, 1.1], [19, 2, 0.9], [-6, -16, 1], [4, -16, 1.2], [14, -16, 0.8], [19, 9, 1], [-20, 12, 0.9], [-16, -12, 0.8], [16, 11.5, 0.7]]) {
  const g = group(x, z); cyl(0.12 * s, 0.16 * s, 1 * s, 'trunk', 0, 0, 0, g, 6); add(new THREE.ConeGeometry(0.9 * s, 2.2 * s, 7), 'leaf', 0, 2 * s, 0, g);
}
const lamps = [];
for (const [x, z] of [[-12, 12.6], [-4, 12.6], [3.6, 12.6], [11, 12.6], [-12, 6.3], [7.6, 6]]) {
  const g = group(x, z); cyl(0.06, 0.08, 3, 'metal', 0, 0, 0, g, 6); box(0.5, 0.12, 0.25, 'metal', 0.15, 3, 0, g);
  const b = ball(0.14, 'lampOff', 0.3, 2.95, 0, g, 6); const s = new THREE.Sprite(lampGlowMat); s.scale.setScalar(2.4); s.position.set(0.3, 2.9, 0); g.add(s); lamps.push({ b, s });
}

// ---------------------------------------------------------------- the coffee shop (builds up with Pre-con + Construction + later stages)
const shop = group(0, 0);
const slab = box(7.6, 0.35, 5.6, 'concrete', 0, 0, 0, shop);
const walls = group(0, 0, shop);
const WH = 2.8;
box(7, WH, 0.25, 'wall', 0, 0.35, -2.4, walls); box(0.25, WH, 4.8, 'wall', -3.4, 0.35, 0, walls); box(0.25, WH, 4.8, 'wall', 3.4, 0.35, 0, walls);
box(2.2, WH, 0.25, 'wall', -2.4, 0.35, 2.4, walls); box(1.2, WH, 0.25, 'wall', 2.9, 0.35, 2.4, walls); box(3.6, 0.7, 0.25, 'wall', 0.5, 0.35 + WH - 0.7, 2.4, walls);
const finish = group(0, 0, shop);   // glass front, door, drive-thru window, trim band
const glass = box(3.4, WH - 0.7, 0.08, 'glass', 0.3, 0.35, 2.42, finish); glass.material.transparent = true; glass.material.opacity = 0.55;
box(0.9, 2.1, 0.1, 'dark', 1.9, 0.35, 2.45, finish);                                // door
box(0.1, 1.1, 1.3, 'glass', -3.55, 1.3, 0.2, finish); box(0.6, 0.12, 1.8, 'trim', -3.75, 2.5, 0.2, finish);   // drive-thru window + awning
box(7.3, 0.35, 0.3, 'trim', 0, 0.35 + WH - 0.35, 2.55, finish);
const interior = group(0, 0, shop);   // counter + espresso machines (seen through the glass)
box(4.2, 1, 0.8, 'wood', 0, 0.35, 0.6, interior);
const machines = [];
for (let k = 0; k < 4; k++) { const g = group(-1.5 + k * 1, 0.6, interior); g.position.y = 1.35; box(0.6, 0.45, 0.45, 'metal', 0, 0, 0, g); box(0.62, 0.08, 0.47, 'trim', 0, 0.45, 0, g); cyl(0.05, 0.05, 0.2, 'dark', 0, 0.05, 0.2, g, 6); machines.push(g); }
const roof = group(0, 0, shop); roof.position.y = 0.35 + WH;
box(7.9, 0.22, 5.9, 'trim', 0, 0, 0, roof); box(7.6, 0.32, 5.6, 'roof', 0, 0.12, 0, roof);
const hvac = []; for (let k = 0; k < 2; k++) hvac.push(box(0.9, 0.6, 0.9, 'metal', -2 + k * 1.6, 0.47, -1, roof));
const signTex = { day: textTex(['☕ COFFEE', 'OPENING SOON'], '#ffffff', '#ff6b5b'), night: textTex(['☕ COFFEE', 'OPENING SOON'], '#1b1f29', '#ff8c1a'),
  dayOpen: textTex(['☕ COFFEE', 'NOW OPEN'], '#ffffff', '#ff6b5b'), nightOpen: textTex(['☕ COFFEE', 'NOW OPEN'], '#1b1f29', '#ff8c1a') };
const signMat = new THREE.MeshBasicMaterial({ map: signTex.day });
const sign = group(0, 0, roof); sign.position.set(0.5, 0.45, 2.3);
box(3.6, 1.3, 0.2, 'trim', 0, 0, 0, sign); add(new THREE.PlaneGeometry(3.4, 1.15), signMat, 0, 0.65, 0.11, sign, false);
const pylon = group(9.5 - 2.4, 11.6);   // road sign by the entrance
box(0.25, 3.2, 0.25, 'metal', 0, 0, 0, pylon); box(2, 1.1, 0.3, 'trim', 0, 3, 0, pylon); add(new THREE.PlaneGeometry(1.85, 0.95), signMat, 0, 3.55, 0.16, pylon, false);
const stakes = group(0, 0);   // survey stakes for the footprint (pre-construction)
for (const [x, z] of [[-3.8, -2.8], [3.8, -2.8], [-3.8, 2.8], [3.8, 2.8]]) { cyl(0.05, 0.05, 0.8, 'wood', x, 0, z, stakes, 5); box(0.25, 0.15, 0.02, 'flag', x + 0.12, 0.65, z, stakes); }
const fence = group(0, 0);    // construction fence while building
for (let k = 0; k < 4; k++) { const L = k % 2 ? 8 : 10.4, x = [0, 5.1, 0, -5.1][k], z = [-4, 0, 4, 0][k]; const f = box(k % 2 ? 0.06 : L, 1, k % 2 ? L : 0.06, 'flag', x, 0, z, fence); f.material = mat('fence'); }
mat('fence').transparent = true; mat('fence').opacity = 0.55;
const patioLights = group(0, 0);
for (let k = 0; k < 9; k++) { const b = ball(0.08, 'glassLamp', -3.4 + k * 0.85, 3.05 + Math.sin(k / 8 * Math.PI) * -0.25, 2.75, patioLights, 5); b.castShadow = false; }

// ---------------------------------------------------------------- stations: pad + progress ring + props per stage
const POS = [[-14.5, 9], [-14.5, 3], [-14.5, -3], [-10, -9.5], [-4.5, -11.2], [1.5, -9], [7.5, -11.2], [12.5, -8], [14, -1.5], [12.5, 6], [9.5, 11]];
const RIN = 1.45, ROUT = 1.72;
const stations = POS.map(([x, z], i) => {
  const g = group(x, z);
  const pad = add(cgeo(1.85, 1.85, 0.06, 36), 'pad', 0, 0, 0, g, false); pad.castShadow = false;
  const base = new THREE.Mesh(new THREE.RingGeometry(RIN, ROUT, 48), new THREE.MeshBasicMaterial({ color: 0xd7dbe1 })); base.rotation.x = -Math.PI / 2; base.position.y = 0.075; g.add(base);
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xff6b5b });
  const fill = new THREE.Mesh(new THREE.BufferGeometry(), fillMat); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.085; g.add(fill);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), fillMat); dot.rotation.x = -Math.PI / 2; dot.position.set(0, 0.09, -(RIN + ROUT) / 2); g.add(dot);
  const hit = new THREE.Mesh(cgeo(1.9, 1.9, 1.4, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.userData.stage = i; g.add(hit);
  return { i, g, x, z, pad, base, fill, fillMat, dot, hit, shown: -1, shownP: 0, props: null, labelY: 2.4 };
});
function setRing(s, p) {
  if (Math.abs(p - s.shown) < 0.004) return; s.shown = p; s.fill.geometry.dispose();
  s.fill.geometry = p > 0.002 ? new THREE.RingGeometry(RIN, ROUT, Math.max(3, Math.ceil(48 * p)), 1, Math.PI / 2 - p * Math.PI * 2, p * Math.PI * 2) : new THREE.BufferGeometry();
  const a = Math.PI / 2 - p * Math.PI * 2, r = (RIN + ROUT) / 2; s.dot.position.set(Math.cos(a) * r, 0.09, -Math.sin(a) * r); s.dot.visible = p > 0.002 && p < 0.999;
}
const st = (i) => stations[i].g;
// 1 scouting: tripod + flagged stakes + map board
const P = {};
{ const g = st(0); const t = group(0, 0, g); for (let k = 0; k < 3; k++) { const l = cyl(0.03, 0.03, 1.2, 'dark', Math.cos(k * 2.1) * 0.25, 0, Math.sin(k * 2.1) * 0.25, t, 4); l.rotation.z = Math.cos(k * 2.1) * -0.2; l.rotation.x = Math.sin(k * 2.1) * 0.2; }
  box(0.3, 0.2, 0.2, 'crane', 0, 1.15, 0, t);
  P.scout = []; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.6, f = group(Math.cos(a) * 1.05, Math.sin(a) * 1.05, g); cyl(0.03, 0.03, 0.7, 'wood', 0, 0, 0, f, 4); box(0.22, 0.14, 0.02, 'flag', 0.11, 0.55, 0, f); P.scout.push(f); } }
// 2 LOI: sign post FOR LEASE → LEASED
const loiTex = { a: textTex(['FOR LEASE', 'LOI ✍'], '#ffffff', '#3b4250'), b: textTex(['LEASED ✔', 'LOI signed'], '#2fb171', '#ffffff') };
const loiMat = new THREE.MeshBasicMaterial({ map: loiTex.a });
{ const g = st(1); cyl(0.05, 0.05, 1.6, 'wood', -0.6, 0, 0, g, 5); cyl(0.05, 0.05, 1.6, 'wood', 0.6, 0, 0, g, 5); box(1.5, 0.8, 0.08, 'sign', 0, 0.8, 0, g);
  const pl = add(new THREE.PlaneGeometry(1.42, 0.72), loiMat, 0, 1.2, 0.05, g, false); P.loiSign = pl; }
// 3 REC package: table + binders + blueprint roll
{ const g = st(2); box(1.6, 0.6, 0.9, 'wood', 0, 0, 0, g); P.binders = []; const cols = ['trim', 'car0', 'car1', 'car3', 'crane', 'dark'];
  for (let k = 0; k < 6; k++) P.binders.push(box(0.5, 0.12, 0.38, cols[k], -0.35 + (k % 2) * 0.05, 0.6 + Math.floor(k / 1) * 0.12, 0, g));
  const r = cyl(0.07, 0.07, 0.9, 'paper', 0.45, 0.67, 0.1, g, 6); r.rotation.z = Math.PI / 2; r.position.y = 0.67; P.blue = r; }
// 4 REC vote: podium + 3 lamps (approved / deferred / rejected)
{ const g = st(3); box(0.9, 0.9, 0.6, 'dark', 0, 0, 0.3, g); box(1.8, 0.1, 0.12, 'metal', 0, 1.6, -0.5, g); cyl(0.04, 0.04, 1.6, 'metal', -0.85, 0, -0.5, g, 5); cyl(0.04, 0.04, 1.6, 'metal', 0.85, 0, -0.5, g, 5);
  P.voteLamps = ['approved', 'deferred', 'rejected'].map((v, k) => { const m = new THREE.MeshLambertMaterial({ color: 0x777777, flatShading: true }); const b = ball(0.2, m, -0.5 + k * 0.5, 1.82, -0.5, g, 8); return { v, b, m }; }); }
// 5 pre-construction: site trailer + permit board
{ const g = st(4); box(2.1, 1, 1, 'van', -0.2, 0.15, -0.3, g); box(0.4, 0.7, 0.04, 'dark', 0.2, 0.2, 0.22, g); box(0.5, 0.3, 0.04, 'glass', -0.6, 0.6, 0.22, g);
  cyl(0.04, 0.04, 1.2, 'wood', 1.1, 0, 0.7, g, 4); box(0.8, 0.6, 0.06, 'sign', 1.1, 0.9, 0.7, g);
  P.permits = []; for (let k = 0; k < 4; k++) P.permits.push(box(0.16, 0.22, 0.02, 'paper', 0.85 + (k % 2) * 0.32 + (k > 1 ? 0.16 : 0) * 0, 0.95 + (k > 1 ? 0 : 0.26), 0.74, g));
  for (let k = 0; k < 4; k++) { P.permits[k].position.x = 0.8 + (k % 2) * 0.3 + (k > 1 ? 0.15 : 0) - (k > 1 ? 0.15 : 0); P.permits[k].position.y = k > 1 ? 0.95 : 1.2; } }
// 6 construction: tower crane reaching over the shop
{ const g = st(5); box(0.5, 0.3, 0.5, 'concrete', 0, 0, 0, g); box(0.3, 8.6, 0.3, 'crane', 0, 0.3, 0, g); const jib = group(0, 0, g); jib.position.y = 8.9;
  box(0.35, 0.3, 9.5, 'crane', 0, 0, 3.6, jib); box(0.35, 0.3, 2.2, 'crane', 0, 0, -1.5, jib); box(0.7, 0.6, 0.7, 'concrete', 0, -0.3, -2.3, jib); box(0.5, 0.5, 0.5, 'dark', 0, 0.3, 0, jib);
  const line = cyl(0.02, 0.02, 4, 'dark', 0, -4, 6, jib, 3); const hook = box(0.5, 0.3, 0.5, 'wood', 0, -4.3, 6, jib); P.jib = jib; P.crane = g.children.slice(); P.hook = [line, hook];
  const hat = group(0.9, 0.9, g); cyl(0.03, 0.03, 0.6, 'wood', 0, 0, 0, hat, 4); box(0.45, 0.3, 0.04, 'crane', 0, 0.5, 0, hat); P.hat = hat; }
// 7 equipment: crates waiting to be installed
{ const g = st(6); P.crates = []; for (let k = 0; k < 4; k++) P.crates.push(box(0.6, 0.55, 0.6, 'wood', -0.4 + (k % 2) * 0.75, 0, -0.4 + Math.floor(k / 2) * 0.75, g));
  box(0.25, 0.25, 0.25, 'metal', 0.8, 0, 0.8, g); }
// 8 hire & train: training huddle around a whiteboard
function person(parent, role = 'staff') { const g = group(0, 0, parent); cyl(0.17, 0.2, 0.55, role, 0, 0, 0, g, 6); ball(0.15, 'skin', 0, 0.68, 0, g, 6); return g; }
{ const g = st(7); box(0.9, 0.6, 0.05, 'sign', 0, 0.5, -0.9, g); cyl(0.025, 0.025, 0.5, 'metal', -0.35, 0, -0.9, g, 4); cyl(0.025, 0.025, 0.5, 'metal', 0.35, 0, -0.9, g, 4);
  P.staff = []; for (let k = 0; k < 6; k++) { const a = Math.PI * (0.15 + k * 0.14), p = person(g); p.position.set(Math.cos(a) * 1, 0, -0.9 + Math.sin(a) * 1.35); p.lookAt(g.position.x, 0, g.position.z - 0.9); P.staff.push(p); } }
// 9 one month out: supply pallets + readiness lamps (☕ equipment, 👥 staff)
{ const g = st(8); P.pallets = []; for (let k = 0; k < 3; k++) { const p = group(-0.7 + k * 0.7, 0.35, g); box(0.6, 0.12, 0.6, 'wood', 0, 0, 0, p); box(0.5, 0.45, 0.5, k === 1 ? 'paper' : 'trim', 0, 0.12, 0, p); P.pallets.push(p); }
  P.rollLamps = [0, 1].map((k) => { const m = new THREE.MeshLambertMaterial({ color: 0x777777 }); cyl(0.03, 0.03, 0.9, 'metal', -0.4 + k * 0.8, 0, -0.75, g, 4); return { b: ball(0.16, m, -0.4 + k * 0.8, 1, -0.75, g, 8), m }; }); }
// 10 soft open: patio tables with umbrellas
{ const g = st(9); P.tables = []; for (let k = 0; k < 3; k++) { const t = group([-0.7, 0.75, 0][k], [-0.5, -0.3, 0.75][k], g); cyl(0.32, 0.32, 0.06, 'wood', 0, 0.5, 0, t, 10); cyl(0.04, 0.04, 0.5, 'metal', 0, 0, 0, t, 4);
  cyl(0.03, 0.03, 1.5, 'metal', 0, 0.5, 0, t, 4); add(new THREE.ConeGeometry(0.75, 0.35, 8), 'trim', 0, 2.1, 0, t); ball(0.13, 'paper', 0.45, 0.25, 0, t, 6); ball(0.13, 'paper', -0.45, 0.25, 0, t, 6); P.tables.push(t); } }
// 11 grand opening: balloon arch + ribbon + confetti
{ const g = st(10); P.arch = group(0, 0, g); for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; ball(0.2, ['bal0', 'bal1', 'bal2'][k % 3], Math.cos(a) * 1.3, Math.sin(a) * 1.9 + 0.2, 0, P.arch, 7); }
  P.ribbon = box(2.6, 0.12, 0.04, 'trim', 0, 0.8, 0, g); }
const CONF = 90, conf = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.02, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }), CONF);
const confD = []; { const cols = [0xff6b5b, 0xffc23d, 0x5b8def, 0x2fb171, 0xff8c1a, 0xffffff]; for (let k = 0; k < CONF; k++) { conf.setColorAt(k, new THREE.Color(cols[k % cols.length])); confD.push({ x: 0, y: -1, z: 0, vy: 0, r: Math.random() * 6, life: 0 }); } }
conf.visible = false; conf.frustumCulled = false; lot.add(conf);

// ---------------------------------------------------------------- routes: dotted paths + glowing pulses + movers
function polyPath(pts, r = 1.2) {   // straight segments, rounded corners
  const V3 = (p) => new THREE.Vector3(p[0], 0.1, p[1]), path = new THREE.CurvePath(); let prev = V3(pts[0]);
  for (let k = 1; k < pts.length; k++) {
    const b = V3(pts[k]);
    if (k < pts.length - 1) {
      const c = V3(pts[k + 1]), d1 = b.clone().sub(prev), d2 = c.clone().sub(b), rr = Math.min(r, d1.length() / 2, d2.length() / 2);
      const p1 = b.clone().sub(d1.normalize().multiplyScalar(rr)), p2 = b.clone().add(d2.normalize().multiplyScalar(rr));
      if (p1.distanceTo(prev) > 1e-3) path.add(new THREE.LineCurve3(prev, p1)); path.add(new THREE.QuadraticBezierCurve3(p1, b, p2)); prev = p2;
    } else path.add(new THREE.LineCurve3(prev, b));
  }
  return path;
}
const dotGeo = new THREE.CircleGeometry(0.085, 8); dotGeo.rotateX(-Math.PI / 2);
const pulseGeo = sgeo(0.15, 8);
const routes = {};
function route(id, pts, o = {}) {
  const curve = polyPath(pts, o.r || 1.2), len = curve.getLength(), n = Math.floor(len / 0.6);
  const mesh = new THREE.InstancedMesh(dotGeo, mat('route', true), n); const m4 = new THREE.Matrix4();
  for (let k = 0; k < n; k++) { const p = curve.getPointAt((k + 0.5) / n); m4.makeTranslation(p.x, 0.06, p.z); mesh.setMatrixAt(k, m4); }
  mesh.frustumCulled = false; lot.add(mesh);
  const pulses = []; for (let k = 0; k < (o.pulses ?? 3); k++) { const b = new THREE.Mesh(pulseGeo, mat('pulse', true)); const s = new THREE.Sprite(glowMat); s.scale.setScalar(1.1); b.add(s); lot.add(b); pulses.push({ b, u: k / (o.pulses ?? 3) }); }
  return (routes[id] = { id, curve, len, mesh, pulses, on: false, fade: 0, speed: o.speed || 3, movers: [] });
}
route('scout', [[-30, 13.8], [-12, 13.8], [-12, -6]]);
route('truck', [[30, 15.2], [6.6, 15.2], [6.6, -6.7], [3, -6.7]]);
route('van', [[30, 15.2], [6.9, 15.2], [6.9, -8.6], [9.4, -8.6]], { r: 0.8 });
route('staff', [[-7, 10], [-7, 6.3], [0.6, 6.3], [0.6, 3]], { pulses: 2, speed: 1.6 });
route('drive', [[30, 13.8], [5.6, 13.8], [5.6, -4.9], [-5.6, -4.9], [-5.6, 4.9], [-1.6, 4.9], [-1.6, 13.8], [-30, 13.8]], { pulses: 5 });
const roadA = polyPath([[-34, 15.2], [34, 15.2]]), roadB = polyPath([[34, 13.8], [-34, 13.8]]);
// the journey: a dotted path linking the 11 stations in order (done part lit, pulses run up to the current stage)
const journey = (() => {
  const segs = []; const m4 = new THREE.Matrix4();
  for (let i = 0; i < N - 1; i++) {
    const a = new THREE.Vector3(POS[i][0], 0.1, POS[i][1]), b = new THREE.Vector3(POS[i + 1][0], 0.1, POS[i + 1][1]), dir = b.clone().sub(a).normalize();
    const a2 = a.clone().add(dir.clone().multiplyScalar(2.05)), b2 = b.clone().sub(dir.clone().multiplyScalar(2.05)), L = a2.distanceTo(b2), n = Math.max(1, Math.floor(L / 0.5));
    const mesh = new THREE.InstancedMesh(dotGeo, mat('todo', true), n);
    for (let k = 0; k < n; k++) { const p = a2.clone().lerp(b2, (k + 0.5) / n); m4.makeTranslation(p.x, 0.06, p.z); mesh.setMatrixAt(k, m4); }
    mesh.frustumCulled = false; lot.add(mesh); segs.push({ a: a2, b: b2, L, mesh });
  }
  const pulses = []; for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(pulseGeo, mat('pulse', true)); const s = new THREE.Sprite(glowMat); s.scale.setScalar(1.1); b.add(s); lot.add(b); pulses.push({ b, u: k / 4 }); }
  return { segs, pulses };
})();
// vehicles (built facing +z)
function wheels(g, xs, zs, r = 0.2) { for (const x of xs) for (const z of zs) { const w = cyl(r, r, 0.16, 'dark', x, r, z, g, 8); w.rotation.z = Math.PI / 2; w.position.y = r; } }
function truck() { const g = group(); box(1.1, 0.9, 0.9, 'truck', 0, 0.25, 1, g); box(0.95, 0.35, 0.05, 'glass', 0, 0.75, 1.46, g); box(1.2, 0.75, 2, 'truck', 0, 0.25, -0.6, g); box(1.05, 0.3, 1.8, 'dirt2', 0, 1, -0.6, g); wheels(g, [-0.55, 0.55], [1, -1.1]); return g; }
mat('dirt2');
function van() { const g = group(); box(1, 1.1, 2.3, 'van', 0, 0.2, 0, g); box(0.9, 0.35, 0.05, 'glass', 0, 0.85, 1.16, g); box(1.02, 0.15, 2.32, 'trim', 0, 0.6, 0, g); wheels(g, [-0.5, 0.5], [0.75, -0.75]); return g; }
function car(k) { const g = group(); box(0.95, 0.4, 1.8, 'car' + (k % 4), 0, 0.18, 0, g); box(0.8, 0.35, 0.95, 'car' + (k % 4), 0, 0.58, -0.1, g); box(0.82, 0.25, 0.05, 'glass', 0, 0.63, 0.38, g); wheels(g, [-0.45, 0.45], [0.6, -0.6], 0.17); return g; }
function mover(obj, curve, o) { obj.visible = false; return Object.assign({ obj, curve, len: curve.getLength(), u: 0, dir: 1, wait: 0, mode: 'loop', speed: 3, on: false }, o); }
const movers = [
  mover(car(3), routes.scout.curve, { mode: 'ping', speed: 4, r: 'scout' }),
  mover(truck(), routes.truck.curve, { mode: 'ping', speed: 3.4, r: 'truck' }),
  mover(truck(), routes.truck.curve, { mode: 'ping', speed: 3.4, r: 'truck', u: 0.5 }),
  mover(van(), routes.van.curve, { mode: 'ping', speed: 3.6, r: 'van' }),
  ...[0, 1, 2].map((k) => mover(person(lot), routes.staff.curve, { mode: 'ping', speed: 1.2, r: 'staff', u: k / 3, dir: k % 2 ? -1 : 1 })),
  ...[0, 1, 2, 3, 4].map((k) => mover(car(k), routes.drive.curve, { speed: 3, r: 'drive', u: k / 5, need: k })),
  ...[0, 1, 2].map((k) => mover(car(k + 1), k % 2 ? roadB : roadA, { speed: 5 + k, r: 'road', u: k / 3, need: k })),
  ...[0, 1, 2, 3].map((k) => mover(person(lot, 'car' + k), routes.staff.curve, { mode: 'ping', speed: 1.1, r: 'cust', u: 0.15 + k * 0.22, dir: k % 2 ? 1 : -1 })),   // 🏪 customers walking in
];
for (const m of movers) m.obj.position.y = 0;
const tan = new THREE.Vector3();
function moveAll(dt) {
  for (const m of movers) {
    m.obj.visible = m.on; if (!m.on) continue;
    if (m.wait > 0) { m.wait -= dt; } else {
      m.u += m.dir * m.speed * dt / m.len;
      if (m.mode === 'ping') { if (m.u >= 1) { m.u = 1; m.dir = -1; m.wait = 1.2; } else if (m.u <= 0) { m.u = 0; m.dir = 1; m.wait = 0.8; } } else m.u %= 1;
    }
    const uu = clamp(m.u, 0.0001, 0.9999), p = m.curve.getPointAt(uu); m.curve.getTangentAt(uu, tan);
    m.obj.position.set(p.x, 0, p.z); m.obj.rotation.y = Math.atan2(tan.x, tan.z) + (m.dir < 0 ? Math.PI : 0);
  }
}

// ---------------------------------------------------------------- apply progress to the 3D scene
const shown = S.map(() => 0); let shownVote = '', paved = 0, t0 = performance.now();
const grow = (o, v) => { o.visible = v > 0.01; o.scale.y = Math.max(0.01, v); };
function apply(dt, now) {
  const k = Math.min(1, dt * 2.5);
  for (let i = 0; i < N; i++) shown[i] = Math.abs(M.p[i] - shown[i]) < 0.002 ? M.p[i] : lerp(shown[i], M.p[i], k);
  const [p1, p2, p3, , p5, p6, p7, p8, p9, p10, p11] = shown, night = state.theme === 'night', C = ST_COL[state.theme];
  // stations: rings + colours by status
  stations.forEach((s, i) => {
    const stt = M.stopped[i] ? 'blocked' : M.status[i] === 'ok' && M.p[i] === 0 && i !== M.cur ? 'todo' : M.status[i];
    s.g.visible = !M.open || i === 9; s.pad.visible = s.base.visible = s.fill.visible = !M.open;   // open store: only the patio stays
    setRing(s, shown[i]); if (M.open) s.dot.visible = false; s.fillMat.color.setHex(C[stt]); s.base.material.color.setHex(M.stopped[i] ? C.blocked : PAL[state.theme].ringBase);
    s.base.material.transparent = M.stopped[i]; s.base.material.opacity = M.stopped[i] ? 0.45 : 1;
  });
  // 1-5
  P.scout.forEach((f, j) => { f.visible = p1 * 4 > j + 0.01; });
  const loi = p2 >= 1 ? loiTex.b : loiTex.a; if (loiMat.map !== loi) { loiMat.map = loi; loiMat.needsUpdate = true; }
  P.binders.forEach((b, j) => { b.visible = p3 * 6 > j + 0.01; }); P.blue.visible = p3 >= 1;
  const vote = M.vote; P.voteLamps.forEach((L) => { const on = L.v === vote; const col = { approved: 0x2fb171, deferred: 0xf5a524, rejected: 0xe5484d }[L.v];
    L.m.color.setHex(on ? col : night ? 0x2a3140 : 0x9aa3ae); L.m.emissive.setHex(on ? col : 0); L.m.emissiveIntensity = on ? (vote === 'pending' ? 0 : 0.6 + 0.4 * Math.sin(now / 300)) : 0; });
  if (vote === 'pending') { const b = P.voteLamps[1]; b.m.emissive.setHex(0xf5a524); b.m.emissiveIntensity = 0.25 + 0.25 * Math.sin(now / 400); }
  P.permits.forEach((b, j) => { b.visible = p5 * 4 > j + 0.01; });
  stakes.visible = p5 > 0 && p6 < 0.2; fence.visible = p6 > 0.001 && p6 < 0.999;
  // the shop: foundation → walls → roof → finish → paving → signage
  const fnd = clamp(p6 / 0.2), wl = clamp((p6 - 0.2) / 0.3), rf = clamp((p6 - 0.5) / 0.15), fin = clamp((p6 - 0.62) / 0.12);
  grow(slab, fnd); grow(walls, wl); roof.visible = rf > 0.01; roof.position.y = 0.35 + WH + (1 - rf) * 2.5; roof.scale.setScalar(Math.max(0.01, 0.6 + rf * 0.4));
  finish.visible = fin > 0.01; finish.scale.y = Math.max(0.01, fin); interior.visible = wl > 0.5;
  paved = lerp(paved, p6 >= 0.86 ? 1 : 0, k); laneMat.color.setHex(PAL[state.theme].dirt).lerp(new THREE.Color(PAL[state.theme].asphalt), paved);
  laneMat.transparent = true; laneMat.opacity = 0.35 + 0.65 * Math.max(paved, clamp(p6 * 3)); stalls.visible = arrows.visible = paved > 0.5;
  const sg = clamp((p6 - 0.93) / 0.07); sign.visible = sg > 0.01; sign.scale.setScalar(Math.max(0.01, sg)); pylon.visible = sg > 0.5;
  const open = p11 >= 1 || p10 >= 1; const stx = open ? (night ? signTex.nightOpen : signTex.dayOpen) : night ? signTex.night : signTex.day; if (signMat.map !== stx) { signMat.map = stx; signMat.needsUpdate = true; }
  // crane while building
  const crane = p6 > 0.001 && p6 < 0.999 || (M.cur === 5 && !M.stopped[5]); P.crane.forEach((o) => { o.visible = crane; }); P.jib.rotation.y = Math.sin(now / 3000) * 0.35 - 0.1; P.hat.visible = !crane;
  P.hook[1].position.y = -4.3 + Math.sin(now / 900) * 0.8; P.hook[0].scale.y = 1 - Math.sin(now / 900) * 0.2;
  // equipment: crates go in as machines appear
  P.crates.forEach((c, j) => { c.visible = (p7 > 0 || M.cur === 6) && j >= Math.round(p7 * 4); });
  machines.forEach((m, j) => { m.visible = p7 * 4 > j + 0.01; }); hvac.forEach((h, j) => { h.visible = p7 > 0.3 + j * 0.3; });
  P.staff.forEach((s, j) => { s.visible = p8 * 6 > j + 0.01; s.position.y = Math.abs(Math.sin(now / 300 + j)) * 0.06; });
  P.pallets.forEach((p, j) => { p.visible = p9 * 3 > j + 0.01; });
  P.rollLamps.forEach((L, j) => { const ok = (j ? p8 : p7) >= 0.999; L.m.color.setHex(ok ? 0x2fb171 : night ? 0x3a4250 : 0xb7bec8); L.m.emissive.setHex(ok ? 0x2fb171 : 0); L.m.emissiveIntensity = ok ? 0.5 : 0; });
  P.tables.forEach((t, j) => { t.visible = p10 * 3 > j + 0.01; });
  P.arch.visible = p11 > 0.01 && !M.open; P.arch.scale.setScalar(Math.max(0.01, p11)); P.ribbon.visible = p11 > 0.5 && p11 < 1;
  patioLights.visible = p10 > 0.5 && rf > 0.9;
  // night glow
  const lit = (night && wl > 0.6) || M.open; mat('glass').emissive.setHex(lit ? (night ? GLOW.night.glass : 0x5a3c0c) : 0); mat('glassLamp').color.setHex(night ? 0xffd27a : 0xfff1c9); mat('glassLamp').emissive.setHex(night ? 0xffb030 : 0x000000);
  lamps.forEach((L) => { L.s.visible = night; L.b.material = night ? mat('lampOn') : mat('lampOff'); });
  // routes on/off by stage
  const R = { scout: M.cur <= 2 && !M.demo || (M.demo && M.cur <= 2), truck: !M.stopped[5] && (p6 > 0 && p6 < 1 || M.cur === 5 || (M.cur === 4 && p5 > 0.5)),
    van: !M.stopped[6] && (M.cur >= 6 && M.cur <= 8 && p9 < 1), staff: p8 >= 0.5, drive: p10 > 0.2 || p11 > 0 };
  for (const id in routes) { const r = routes[id]; r.on = !!R[id]; r.fade = lerp(r.fade, r.on ? 1 : 0, k); r.mesh.visible = r.fade > 0.05; r.pulses.forEach((p) => { p.b.visible = r.on; }); }
  const busy = M.open ? 5 : (p10 > 0.2 ? 2 : 0) + (p11 > 0 ? 1 : 0) + (p11 >= 1 ? 2 : 0), roadCars = M.open ? 3 : 1 + (p10 > 0 ? 1 : 0) + (p11 >= 1 ? 1 : 0);
  for (const m of movers) m.on = m.r === 'road' ? m.need < roadCars : m.r === 'drive' ? routes.drive.on && m.need < busy : m.r === 'cust' ? (M.open || p11 >= 0.999) && !M.demo : routes[m.r].on;
  applyOpen(now, night);
  // confetti at the grand opening
  conf.visible = p11 >= 0.999 && !M.open;
}

// ---------------------------------------------------------------- 🏪 open store: floating 3D issue bubbles over the roof (red pulse = urgent)
const OPS = { ok: ['🟢', 'Normal', 'var(--ok)', 0x2fb171], attn: ['🟠', 'Needs attention', 'var(--risk)', 0xf5a524], urgent: ['🔴', 'Urgent', 'var(--block)', 0xe5484d] };
const PRI = { low: ['🔵', 'Low', '#5b8def'], high: ['🟠', 'High', '#f5a524'], urgent: ['🔴', 'Urgent', '#e5484d'] };
const PRANK = { urgent: 0, high: 1, low: 2 };
const byPrio = (a, b) => PRANK[a.prio] - PRANK[b.prio] || (a.due || '9').localeCompare(b.due || '9');
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const bubCache = new Map();
function bubTex(icon, col, night) {
  const key = icon + col + night; if (bubCache.has(key)) return bubCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.beginPath(); g.moveTo(50, 100); g.lineTo(64, 124); g.lineTo(78, 100); g.fillStyle = col; g.fill();
  g.beginPath(); g.arc(64, 58, 50, 0, Math.PI * 2); g.fillStyle = night ? '#1b2230' : '#ffffff'; g.fill(); g.lineWidth = 10; g.strokeStyle = col; g.stroke();
  g.font = `56px ${EMOJI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#333'; g.fillText(icon, 64, 62);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; bubCache.set(key, t); return t;
}
const pulseTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.lineWidth = 9; g.strokeStyle = '#e5484d'; g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const BUBN = 10, bubbles = [];
for (let k = 0; k < BUBN; k++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); sp.scale.set(1.5, 1.5, 1); sp.center.set(0.5, 0.1); sp.renderOrder = 6; sp.visible = false; lot.add(sp);
  const pu = new THREE.Sprite(new THREE.SpriteMaterial({ map: pulseTex, transparent: true, depthWrite: false })); pu.center.set(0.5, 0.5); pu.renderOrder = 5; pu.visible = false; lot.add(pu);
  bubbles.push({ sp, pu, id: null, key: '', prio: '' });
}
function applyOpen(now, night) {
  const s = store(), on = M.open && !ui.demo, list = on ? CO.openIssues(s).slice().sort(byPrio) : [];
  const items = on ? (list.length ? list.slice(0, BUBN) : [{ id: 'ok', icon: '✅', prio: 'ok' }]) : [];
  const n = items.length, rx = Math.cos(view.az), rz = -Math.sin(view.az), gap = 2.1;
  bubbles.forEach((b, k) => {
    const it = items[k]; b.sp.visible = !!it; b.pu.visible = false; if (!it) { b.id = null; b.prio = ''; return; }
    const col = it.prio === 'ok' ? '#2fb171' : PRI[it.prio][2], key = it.icon + col + night;
    if (b.key !== key) { b.key = key; b.sp.material.map = bubTex(it.icon, col, night); b.sp.material.needsUpdate = true; }
    b.id = it.id; b.prio = it.prio; b.sp.userData.issue = it.id;
    const off = (k - (n - 1) / 2) * gap, y = 5.6 + Math.sin(now / 520 + k * 1.3) * 0.18 + (it.id === ui.hiIssue ? 0.5 : 0);
    b.sp.position.set(rx * off, y, rz * off); const sc = it.id === ui.hiIssue ? 2.5 : 2; b.sp.scale.set(sc, sc, 1);
    if (it.prio === 'urgent') { const ph = (now / 1100 + k * 0.3) % 1; b.pu.visible = true; b.pu.position.set(rx * off, y + 0.9 * sc / 1.5, rz * off); b.pu.scale.setScalar(1.8 + ph * 2.2); b.pu.material.opacity = 0.95 * (1 - ph); }
  });
}

// ---------------------------------------------------------------- 🗺 district map: every store as a mini 3D building with a status ring
const DCELL = 11, dHits = [], dPulse = []; let distSig = '', distPos = [], distPts = [];
const HCOL = { ok: 0xff6b5b, risk: 0xf5a524, blocked: 0xe5484d, attn: 0xf5a524, urgent: 0xe5484d, open: 0x2fb171 };
const dHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
function dLayout(n) {
  const cols = Math.max(1, Math.min(n, isPortrait() ? 3 : Math.min(6, Math.max(4, Math.ceil(n / 2))))), rows = Math.ceil(n / cols), az = Math.PI / 4;
  const R = [Math.cos(az), -Math.sin(az)], F = [-Math.sin(az), -Math.cos(az)];   // screen right / screen up (on the ground) at the home angle
  return Array.from({ length: n }, (_, k) => { const r = Math.floor(k / cols), c = k % cols, rowN = Math.min(cols, n - r * cols);
    const u = (c - (rowN - 1) / 2) * DCELL, v = ((rows - 1) / 2 - r) * DCELL * (isPortrait() ? 1.05 : 1.5); return [R[0] * u + F[0] * v, R[1] * u + F[1] * v]; });
}
const dKind = (s) => (CO.isOpen(s) ? 'open:' + CO.opsStatus(s, ui.today) : 'opening:' + CO.health(s, ui.today));
function buildDistrict(force) {
  const list = state.stores, sig = (isPortrait() ? 'p' : 'l') + state.theme + list.map((s) => [s.id, s.icon, dKind(s), Math.round(CO.overall(s) * 50), Math.round(CO.eff(s, 5) * 20)].join(',')).join('|');
  if (!force && sig === distSig) return; distSig = sig;
  for (const c of [...dist.children]) { c.traverse((o) => { if (o.userData.own) o.geometry.dispose(); }); dist.remove(c); }
  dHits.length = 0; dPulse.length = 0; distPos = dLayout(list.length); distPts = [];
  const az = Math.PI / 4;
  list.forEach((s, k) => {
    const [x, z] = distPos[k]; for (let a = 0; a < 8; a++) distPts.push([x + Math.cos(a * Math.PI / 4) * 4.6, 0, z + Math.sin(a * Math.PI / 4) * 4.6]); distPts.push([x, 6.2, z]);
    const g = group(x, z, dist); g.userData.store = s.id;
    const open = CO.isOpen(s), h = CO.health(s, ui.today), b = open ? 1 : CO.stopped(s, 5) ? 0 : CO.eff(s, 5), p = open ? 1 : CO.overall(s), rej = CO.rejected(s);
    const pad = add(cgeo(4.3, 4.3, 0.06, 32), 'pad', 0, 0, 0, g, false); pad.castShadow = false;
    flat(5.6, 1.1, open || b >= 0.86 ? 'asphalt' : 'dirt2', 0, 2.9, 0.07, g);
    const base = new THREE.Mesh(new THREE.RingGeometry(3.55, 4.1, 48), mat('ringBase', true)); base.userData.own = true; base.rotation.x = -Math.PI / 2; base.position.y = 0.08; g.add(base);
    const col = open ? (h === 'ok' ? HCOL.open : HCOL[h]) : HCOL[h] || HCOL.ok, fm = new THREE.MeshBasicMaterial({ color: col });
    if (p > 0.002) { const f = new THREE.Mesh(new THREE.RingGeometry(3.55, 4.1, Math.max(3, Math.ceil(48 * p)), 1, Math.PI / 2 - p * Math.PI * 2, p * Math.PI * 2), fm); f.userData.own = true; f.rotation.x = -Math.PI / 2; f.position.y = 0.09; g.add(f); }
    if (rej) { const f = new THREE.Mesh(new THREE.RingGeometry(3.55, 4.1, 48), fm); f.userData.own = true; f.rotation.x = -Math.PI / 2; f.position.y = 0.09; g.add(f); }
    // the mini shop grows like the big one: slab → walls → roof → glass → sign
    const wl = clamp((b - 0.2) / 0.3);
    if (b > 0.001) box(4.4, 0.2, 3.2, 'concrete', 0, 0, 0, g);
    if (wl > 0.01) { const w = box(4, 1.7, 2.8, 'wall', 0, 0.2, 0, g); w.scale.y = Math.max(0.05, wl); }
    if (b >= 0.62) { box(4.6, 0.14, 3.4, 'trim', 0, 1.9, 0, g); box(4.4, 0.22, 3.2, 'roof', 0, 1.98, 0, g); }
    if (b >= 0.74) box(2.4, 1.0, 0.06, open ? 'lampOn' : 'glass', 0.2, 0.5, 1.42, g, false);
    if (b >= 0.93) { box(2.2, 0.7, 0.16, 'trim', 0.2, 2.2, 1.3, g); box(1.9, 0.42, 0.04, open ? 'lampOn' : 'sign', 0.2, 2.34, 1.39, g, false); }
    if (b > 0.001 && b < 0.999) { box(0.22, 5, 0.22, 'crane', 1.7, 0, -1.1, g); box(3.6, 0.22, 0.22, 'crane', 0.6, 4.9, -1.1, g); }
    if (b <= 0.001) { for (const [sx, sz] of [[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.2], [1.8, 1.2]]) cyl(0.06, 0.06, 0.8, rej ? 'dark' : 'wood', sx, 0, sz, g, 5);
      const sg = group(-2.4, 1.8, g); cyl(0.06, 0.06, 1.3, 'metal', 0, 0, 0, sg, 5); box(1.1, 0.6, 0.08, rej ? 'dark' : 'paper', 0, 1.0, 0, sg); }
    if (open) { for (let c = 0; c < 2; c++) { const cg = group(-1.2 + c * 1.9, 2.9, g); cg.rotation.y = Math.PI / 2; box(0.6, 0.3, 1.1, 'car' + ((k + c) % 4), 0, 0.08, 0, cg); }
      for (let c = 0; c < 2; c++) { cyl(0.13, 0.15, 0.42, 'car' + ((k + c + 1) % 4), 1.6 + c * 0.5, 0, 1.9, g, 6); ball(0.11, 'skin', 1.6 + c * 0.5, 0.53, 1.9, g, 6); } }
    for (const [tx, tz] of [[-3.4, -3.0], [3.5, -2.6]]) { const t = group(tx, tz, g); cyl(0.08, 0.1, 0.6, 'trunk', 0, 0, 0, t, 5); add(new THREE.ConeGeometry(0.55, 1.4, 6), 'leaf', 0, 1.2, 0, t); }
    if (h === 'urgent' || h === 'blocked') { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pulseTex, transparent: true, depthWrite: false })); sp.position.set(0, 3.2, 0); g.add(sp); dPulse.push(sp); }
    const hit = new THREE.Mesh(cgeo(4.3, 4.3, 3.2, 12), dHitMat); hit.userData.store = s.id; g.add(hit); dHits.push(hit);
  });
  // roads between the rows
  const rows = [...new Set(distPos.map(([x, z]) => Math.round((x * -Math.sin(az) + z * -Math.cos(az)) * 10) / 10))];
  for (const v of rows) { const off = DCELL * (isPortrait() ? 1.05 : 1.5) / 2, cx = -Math.sin(az) * (v - off), cz = -Math.cos(az) * (v - off);
    const r = flat(4 * DCELL + 10, 1.8, 'road', cx, cz, 0.012, dist); r.rotation.y = az; }
  renderDistLabels();
}
function applyDistrict(now) {
  if (!dist.visible) return;
  dPulse.forEach((sp, k) => { const ph = (now / 1200 + k * 0.37) % 1; sp.scale.setScalar(2 + ph * 3); sp.material.opacity = 0.9 * (1 - ph); });
}
// district pills: icon + % or status, name always shown
const dLabels = [];
function renderDistLabels() {
  const list = state.stores;
  while (dLabels.length < list.length) { const b = document.createElement('button'); b.className = 'pill dpill'; labels.appendChild(b); dLabels.push(b); }
  dLabels.forEach((b, k) => { const s = list[k]; if (!s) { b.hidden = true; b.dataset.store = ''; return; } b.hidden = false; b.dataset.store = s.id;
    const open = CO.isOpen(s), h = CO.health(s, ui.today), n = open ? CO.openIssues(s).length : 0;
    const pc = open ? `${OPS[h][0]}${n ? ' ' + n : ''}` : CO.rejected(s) ? '❌' : Math.round(CO.overall(s) * 100) + '%';
    const cls = open ? (h === 'ok' ? 'st-done' : h === 'attn' ? 'st-risk' : 'st-blocked pulse') : 'st-' + (h === 'blocked' ? 'blocked' : h);
    const dim = !CO.FILTERS[ui.filter](s, ui.today);
    b.className = `pill dpill ${cls}${dim ? ' dim' : ''}${s.id === state.cur ? ' cur' : ''}${(ui.dtour && ui.tourId === s.id) || ui.flying === s.id ? ' sel' : ''}`;
    b.innerHTML = `<b>${s.icon}</b><span class="pc">${pc}</span><span class="nm">${esc(s.name)}</span>${open ? '<i class="op">🏪</i>' : ''}`; b.setAttribute('aria-label', s.name); });
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3();
function animate(dt, now) {
  for (const id in routes) { const r = routes[id]; if (!r.on) continue; for (const p of r.pulses) { p.u = (p.u + r.speed * 1.6 * dt / r.len) % 1; const pt = r.curve.getPointAt(clamp(p.u, 0.0001, 0.9999)); p.b.position.set(pt.x, 0.25, pt.z); } }
  // journey: done segments lit, pulses travel from station 1 to the current one
  const reach = M.stopped.some(Boolean) ? V : M.cur;
  journey.segs.forEach((s) => { s.mesh.visible = !M.open; });
  journey.segs.forEach((s, i) => { const done = shown[i] >= 0.999 && i < reach + (shown[reach] >= 0.999 ? 1 : 0); const m = done ? mat('route', true) : mat('todo', true); if (s.mesh.material !== m) s.mesh.material = m; });
  const total = journey.segs.slice(0, reach).reduce((a, s) => a + s.L, 0);
  journey.pulses.forEach((p) => { p.b.visible = total > 0.5 && !M.stopped[V + 1] && !M.open; if (!p.b.visible) return; p.u = (p.u + 4 * dt / Math.max(4, total)) % 1; let d = p.u * total;
    for (let i = 0; i < reach; i++) { const s = journey.segs[i]; if (d <= s.L) { v3.copy(s.a).lerp(s.b, d / s.L); break; } d -= s.L; } p.b.position.set(v3.x, 0.25, v3.z); });
  moveAll(dt);
  if (conf.visible) {
    const c = stations[10];
    confD.forEach((d, i) => { d.life -= dt; if (d.life <= 0 || d.y < 0) { d.x = c.x + (Math.random() - 0.5) * 3; d.z = c.z + (Math.random() - 0.5) * 2; d.y = 3 + Math.random() * 1.5; d.vy = -0.6 - Math.random() * 0.8; d.life = 3 + Math.random() * 2; }
      d.y += d.vy * dt; d.r += dt * 4; e3.set(d.r, d.r * 0.7, 0); q.setFromEuler(e3); m4.compose(v3.set(d.x + Math.sin(d.r) * 0.2, d.y, d.z), q, one); conf.setMatrixAt(i, m4); });
    conf.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- theme
function applyTheme() {
  const night = state.theme === 'night', Pp = pal();
  document.body.classList.toggle('night', night); $('themeBtn').textContent = night ? '☀️' : '🌙';
  document.querySelector('meta[name=theme-color]').content = night ? '#0b0f17' : '#eef0f3';
  scene.background = new THREE.Color(Pp.bg);
  for (const k in mats) { const m = mats[k], r = m.userData.role; if (Pp[r] != null) m.color.setHex(Pp[r]); }
  mat('pulse', true).color.setHex(night ? 0xffb04a : 0xff6b5b); mat('route', true).color.setHex(Pp.route); mat('todo', true).color.setHex(Pp.todo);
  mat('lampOn').color.setHex(0xffd27a); mat('lampOn').emissive.setHex(0xffb030); mat('glassLamp').color.setHex(0xffd27a);
  mat('dirt2').color.setHex(Pp.dirt); mat('fence').color.setHex(night ? 0xff8c1a : 0xff7a3d);
  glowMat.color.setHex(night ? 0xff8c1a : 0xff6b5b); glowMat.blending = night ? THREE.AdditiveBlending : THREE.NormalBlending; glowMat.opacity = night ? 0.9 : 0.45; glowMat.needsUpdate = true;
  grid.material.color.setHex(Pp.grid); grid.material.opacity = night ? 0.5 : 0.35;
  hemi.intensity = night ? 1.0 : 1.7; hemi.color.setHex(night ? 0x8090c0 : 0xffffff); hemi.groundColor.setHex(night ? 0x101420 : 0xb0b8c4);
  sun.intensity = night ? 1.1 : 2.1; sun.color.setHex(night ? 0x9fb4ff : 0xffffff);
  for (const s of stations) s.base.material.color.setHex(Pp.ringBase);
  stations.forEach((s) => { s.shown = -1; });
}

// ---------------------------------------------------------------- camera: smooth focus, zoom buttons, ✋ drag/pinch/twist only when on
const isPortrait = () => stageEl.clientHeight > stageEl.clientWidth;
function fitH() { const w = stageEl.clientWidth, h = Math.max(1, stageEl.clientHeight), a = w / h; return Math.max(27, 37 / a); }
function focusH(needW = 9, needH = 7.5) {   // full-canvas view height so the station fits in the part the sheet leaves free
  const sp = sheetPx(), W = Math.max(1, stageEl.clientWidth - sp.w), H = Math.max(1, stageEl.clientHeight - sp.h), ppu = Math.min(W / needW, H / needH);
  return stageEl.clientHeight / ppu; }
function sheetPx() { const sh = $('sheet'); if (sh.hidden) return { h: 0, w: 0 }; const r = sh.getBoundingClientRect(), s = stageEl.getBoundingClientRect(); return r.width > s.width * 0.7 ? { h: s.bottom - r.top, w: 0 } : { h: 0, w: s.right - r.left }; }
// fit the whole lot (all 11 stations + the shop) into the free part of the canvas for the current rotation
const FITPTS = []; for (const [x, z] of [[-14.5, 9], [-14.5, 3], [-14.5, -3], [-10, -9.5], [-4.5, -11.2], [1.5, -9], [7.5, -11.2], [12.5, -8], [14, -1.5], [12.5, 6], [9.5, 11]]) for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) FITPTS.push([x + dx, 0, z + dz], [x, 3, z]);
FITPTS.push([1.5, 9.5, -9], [0, 4, 0]);
const sp0 = () => sheetPx().w > 0;   // a side panel already covers the right-hand buttons
function fitView(pts = FITPTS) {
  const az = dst.az, R = [Math.cos(az), 0, -Math.sin(az)], F = [-Math.sin(az), 0, -Math.cos(az)];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y, z] of pts) { const u = x * R[0] + z * R[2], v = -(x * F[0] + z * F[2]) * Math.sin(EL) * -1 + y * Math.cos(EL); x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
  const padR = pts === distPts && !sp0() ? 56 : 0, sp = sheetPx(), W = Math.max(1, stageEl.clientWidth - sp.w - padR), H = Math.max(1, stageEl.clientHeight - sp.h - 30), ppu = Math.min(W / ((x1 - x0) * (pts === distPts ? 1.16 : 1.06)), H / ((y1 - y0) * 1.1));
  const cu = (x0 + x1) / 2 + padR / 2 / ppu, cv2 = (y0 + y1) / 2;   // centre in (right, up) units; ground point shift along F moves up by sin(EL)
  return { tx: R[0] * cu + F[0] * cv2 / Math.sin(EL), tz: R[2] * cu + F[2] * cv2 / Math.sin(EL), h: stageEl.clientHeight / ppu };
}
const FITOPEN = [[-12.5, 0, 6.5], [-12.5, 0, 13], [-2, 0, 16], [10, 0, 15.5], [14.5, 0, 6], [7, 0, -6.5], [-7, 0, -6.5], [0, 7.5, 0], [7, 4.5, 11.6]];
function home() { const f = fitView(ui.mode === 'district' && distPts.length ? distPts : M && M.open && !ui.demo ? FITOPEN : FITPTS); dst.tx = f.tx; dst.tz = f.tz; dst.h = f.h; }
function focusShop() { dst.tx = 0; dst.tz = 0.5; dst.h = focusH(13, 12); }
function focus(i) { if (i < 0) return home(); const s = stations[i]; dst.tx = i === 5 ? 0.6 : s.x; dst.tz = i === 5 ? -3.2 : s.z; dst.h = i === 5 ? focusH(15, 13) : focusH(); }
function resize() {
  const w = stageEl.clientWidth, h = stageEl.clientHeight; renderer.setSize(w, h, false); EL = THREE.MathUtils.degToRad(h > w * 1.2 ? 52 : 36);
  const s = sheetPx(); document.documentElement.style.setProperty('--sheetH', s.h + 'px'); document.documentElement.style.setProperty('--panelW', s.w + 'px');
  dst.ox = s.w / 2; dst.oy = s.h / 2;
  if (ui.sel < 0 && !ui.demo) dst.h = Math.min(Math.max(dst.h, 4), 120);
}
function camUpdate(dt) {
  const k = 1 - Math.exp(-dt * 5);
  for (const key of ['tx', 'tz', 'h', 'ox', 'oy']) view[key] = lerp(view[key], dst[key], k);
  let da = dst.az - view.az; view.az += da * k;
  const w = stageEl.clientWidth, h = stageEl.clientHeight, a = w / h, hh = view.h / 2;
  cam.left = -hh * a; cam.right = hh * a; cam.top = hh; cam.bottom = -hh;
  const D = 80; cam.position.set(view.tx + Math.sin(view.az) * Math.cos(EL) * D, Math.sin(EL) * D, view.tz + Math.cos(view.az) * Math.cos(EL) * D);
  cam.lookAt(view.tx, 0, view.tz);
  if (Math.abs(view.ox) > 0.5 || Math.abs(view.oy) > 0.5) cam.setViewOffset(w, h, view.ox, view.oy, w, h); else cam.clearViewOffset();
  cam.updateProjectionMatrix();
}
// pointer input: taps always work; drag / pinch / twist / wheel only with ✋ on
const ptrs = new Map(); let gest = null, tapStart = null;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(cx, cy) {
  const r = cv.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, cam);
  if (ui.mode === 'district') { const h = raycaster.intersectObjects(dHits, false)[0]; return h ? { store: h.object.userData.store } : -1; }
  if (M.open && !ui.demo) {
    const hb = raycaster.intersectObjects(bubbles.filter((b) => b.sp.visible).map((b) => b.sp), false)[0]; if (hb) return { issue: hb.object.userData.issue };
    return raycaster.intersectObjects([shop, stations[9].hit], true).length ? { ops: true } : -1;
  }
  const hits = raycaster.intersectObjects([...stations.map((s) => s.hit), shop], true);
  for (const h of hits) { let o = h.object; while (o) { if (o.userData.stage != null) return o.userData.stage; if (o === shop) return 5; o = o.parent; } }
  return -1;
}
function panBy(dx, dy) {
  const w = stageEl.clientWidth, wpp = view.h / stageEl.clientHeight;   // world units per pixel
  const rx = Math.cos(view.az), rz = -Math.sin(view.az), fx = -Math.sin(view.az), fz = -Math.cos(view.az);
  dst.tx -= (dx * rx - dy * fx / Math.sin(EL)) * wpp; dst.tz -= (dx * rz - dy * fz / Math.sin(EL)) * wpp; void w;
  dst.tx = clamp(dst.tx, -30, 30); dst.tz = clamp(dst.tz, -30, 30); view.tx = dst.tx; view.tz = dst.tz;
}
const pinchInfo = () => { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture?.(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }; else tapStart = null;
  if (ui.drag && ptrs.size === 2) gest = Object.assign(pinchInfo(), { h: dst.h, az: dst.az });
});
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 8) tapStart.moved = true;
  if (!ui.drag) return;                                   // ✋ off: the camera ignores drags and pinches
  if (ptrs.size === 1 && !gest) panBy(dx, dy);
  else if (ptrs.size === 2 && gest) { const g = pinchInfo(); dst.h = clamp(gest.h * gest.d / Math.max(10, g.d), 4, 120); view.h = dst.h; dst.az = gest.az - (g.ang - gest.ang); view.az = dst.az; }
});
function up(e) {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) gest = null;
  if (tapStart && !tapStart.moved && performance.now() - tapStart.t < 600 && ptrs.size === 0) { const i = pick(e.clientX, e.clientY); if (typeof i === 'object') { if (i.store) flyTo(i.store); else openOps(i.issue && i.issue !== 'ok' ? i.issue : null); } else if (i >= 0) select(i); }
  if (ptrs.size === 0) tapStart = null;
}
cv.addEventListener('pointerup', up);
cv.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });   // no ghost click into the sheet that just opened
cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); gest = null; tapStart = null; });
cv.addEventListener('wheel', (e) => { e.preventDefault(); if (!ui.drag) return; dst.h = clamp(dst.h * Math.exp(e.deltaY * 0.001), 4, 120); }, { passive: false });
stageEl.addEventListener('touchmove', (e) => { if (!e.target.closest('#sheet')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
$('zIn').onclick = () => { dst.h = clamp(dst.h / 1.35, 4, 120); };
$('zOut').onclick = () => { dst.h = clamp(dst.h * 1.35, 4, 120); };
$('rot').onclick = () => { dst.az += Math.PI / 4; };
$('home').onclick = () => { dst.az = Math.round(dst.az / (Math.PI * 2)) * Math.PI * 2 + Math.PI / 4; home(); };
$('dragBtn').onclick = () => { ui.drag = !ui.drag; $('dragBtn').classList.toggle('on', ui.drag); stageEl.classList.toggle('drag', ui.drag); toast(ui.drag ? '✋ on: drag, pinch, twist' : '✋ off'); };

// ---------------------------------------------------------------- labels (HTML pills pinned to stations)
const labels = $('labels'); const pills = stations.map((s, i) => {
  const b = document.createElement('button'); b.className = 'pill'; b.dataset.st = i; b.innerHTML = `<b>${S[i].icon}</b><span class="pc"></span><span class="nm">${esc(S[i].name)}</span>`; labels.appendChild(b); return b; });
labels.addEventListener('click', (e) => { const d = e.target.closest('[data-store]'); if (d && d.dataset.store) return flyTo(d.dataset.store); const b = e.target.closest('[data-st]'); if (b) select(+b.dataset.st); });
const pv = new THREE.Vector3();
function placeLabels() {
  const w = stageEl.clientWidth, h = stageEl.clientHeight, lotOn = ui.mode === 'lot', hideSt = !lotOn || (M.open && !M.demo);
  dLabels.forEach((pl, k) => { const p = distPos[k]; if (lotOn || !p || pl.hidden) { pl.style.display = 'none'; return; }
    pv.set(p[0], 4.6, p[1]).project(cam); const x = (pv.x + 1) / 2 * w, y = (1 - pv.y) / 2 * h, out = x < -60 || x > w + 60 || y < -10 || y > h + 40;
    pl.style.display = out ? 'none' : ''; if (!out) pl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`; });
  stations.forEach((s, i) => {
    if (hideSt) { pills[i].style.display = 'none'; return; }
    pv.set(s.x, i === 5 ? 3 : 2.4, s.z).project(cam); const x = (pv.x + 1) / 2 * w, y = (1 - pv.y) / 2 * h;
    const pl = pills[i]; const out = x < -40 || x > w + 40 || y < -10 || y > h + 40; pl.style.display = out ? 'none' : '';
    if (!out) pl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  });
}
const stCls = (i) => (M.stopped[i] ? 'st-blocked' : M.status[i] === 'ok' && M.p[i] === 0 && i !== M.cur ? 'st-todo' : 'st-' + M.status[i]);
const pctTxt = (i) => (M.stopped[i] ? '⛔' : M.p[i] >= 1 ? '✅' : Math.round(M.p[i] * 100) + '%');
let lastSig = '';
function refreshLabels() {
  stations.forEach((s, i) => { const pl = pills[i]; pl.className = `pill ${stCls(i)}${ui.sel === i ? ' sel' : ''}${M.cur === i ? ' cur' : ''}`; pl.querySelector('.pc').textContent = pctTxt(i); });
  if (ui.mode === 'district') renderDistLabels();
}

// ---------------------------------------------------------------- top bar + bottom bars (timeline / 🏪 ops dashboard / 🗺 district filters)
function renderTop() {
  const s = store(), ring = $('overall'), days = $('days');
  if (ui.mode === 'district') {
    const L = state.stores, nOpen = L.filter(CO.isOpen).length, nAttn = L.filter((x) => CO.needsAttention(x, ui.today)).length;
    $('storeIc').textContent = '🗺'; $('storeName').textContent = `District · ${L.length}`; $('exTag').hidden = !L.some((x) => x.example);
    ring.style.setProperty('--p', Math.round(nOpen / L.length * 100)); ring.style.setProperty('--c', 'var(--ok)'); $('overallTxt').textContent = `🏪${nOpen}`;
    $('daysIc').textContent = '⚠️'; $('daysN').textContent = nAttn; days.querySelector('small').textContent = ''; days.classList.add('nodate'); days.setAttribute('aria-label', 'Stores needing attention');
    return;
  }
  $('storeIc').textContent = s.icon; $('storeName').textContent = s.name; $('exTag').hidden = !s.example;
  if (M.open && !ui.demo) {
    const st = M.ops; ring.style.setProperty('--p', 100); ring.style.setProperty('--c', OPS[st][2]); $('overallTxt').textContent = OPS[st][0];
    $('daysIc').textContent = '🏪'; $('daysN').textContent = Math.max(0, M.days); days.querySelector('small').textContent = 'd'; days.classList.add('nodate'); days.setAttribute('aria-label', 'Days open');
    return;
  }
  const o = Math.round(M.overall * 100); ring.style.setProperty('--p', o); $('overallTxt').textContent = o + '%';
  ring.style.setProperty('--c', M.stopped.some(Boolean) ? 'var(--block)' : o >= 100 ? 'var(--ok)' : 'var(--acc)');
  $('daysIc').textContent = '🎉'; $('daysN').textContent = M.days; days.querySelector('small').textContent = 'd'; days.classList.remove('nodate'); days.setAttribute('aria-label', 'Days to grand opening');
  if (document.activeElement !== $('target')) $('target').value = s.target;
}
function renderTL() {
  const tl = $('tl');
  if (!tl.children.length) tl.innerHTML = S.map((x, i) => `${i ? '<i class="chev"></i>' : ''}<button class="node" data-i="${i}" aria-label="${esc(x.name)}"><span class="ring">${x.icon}</span><small>${esc(x.short)}</small></button>`).join('') +
    `<i class="chev"></i><button class="node opennode" data-open="1" aria-label="Open the store"><span class="ring">🏪</span><small>Open</small></button>`;
  tl.querySelectorAll('.node[data-i]').forEach((b) => { const i = +b.dataset.i; b.className = `node ${stCls(i)}${M.cur === i ? ' cur' : ''}${ui.sel === i ? ' sel' : ''}${M.stopped[i] ? ' stop' : ''}`;
    const r = b.querySelector('.ring'); r.style.setProperty('--p', Math.round(M.p[i] * 100)); b.title = `${S[i].name} ${pctTxt(i)}`; });
  const rd = !M.demo && CO.ready(store()), on = tl.querySelector('.opennode'); on.className = `node opennode ${rd ? 'st-done ready' : 'st-todo'}${ui.sheet === 'open' ? ' sel' : ''}`; on.querySelector('.ring').style.setProperty('--p', rd ? 100 : 0);
  tl.querySelectorAll('.chev').forEach((c, i) => c.classList.toggle('done', i < N - 1 ? M.p[i] >= 1 : rd));
}
function renderBars() {
  const district = ui.mode === 'district', open = !district && M.open && !ui.demo;
  $('tl').hidden = district || open; $('ops').hidden = !open; $('dbar').hidden = !district;
  if (open) {
    const s = store(), st = M.ops, iss = CO.openIssues(s).slice().sort(byPrio), ch = s.ops.checks, done = ch.filter((c) => CO.checkState(c, ui.today) === 'done').length, late = ch.filter((c) => CO.checkState(c, ui.today) === 'late').length;
    $('ops').innerHTML = `<button class="ostat" data-ops="1" style="--c:${OPS[st][2]}" aria-label="Status ${OPS[st][1]}"><span class="dotc">${OPS[st][0]}</span><b>${OPS[st][1]}</b></button>
      <button class="oiss" data-ops="1" aria-label="${iss.length} open issues">${iss.length ? iss.slice(0, 4).map((x) => `<span class="bub p-${x.prio}">${x.icon}</span>`).join('') + (iss.length > 4 ? `<small>+${iss.length - 4}</small>` : '') : '<span class="bub p-ok">✅</span>'}<small class="n">${iss.length}</small></button>
      <button class="ochk ${late ? 'late' : done === ch.length ? 'ok' : ''}" data-ops="checks" aria-label="Routine checks ${done} of ${ch.length}">🔁<b>${done}/${ch.length}</b></button>
      <button class="ibtn oadd" data-ops="add" aria-label="Add issue">➕</button>`;
  }
  if (district) {
    const L = state.stores, F = { all: '🏪', opening: '🏗', open: '☕', attn: '⚠️' }, T = { all: 'All', opening: 'Opening', open: 'Open', attn: 'Attention' };
    $('dbar').innerHTML = Object.keys(F).map((k) => `<button class="fchip ${ui.filter === k ? 'on' : ''}" data-filter="${k}" aria-label="${T[k]}"><span>${F[k]}</span><b>${L.filter((x) => CO.FILTERS[k](x, ui.today)).length}</b><small>${T[k]}</small></button>`).join('') +
      `<button class="fchip" data-act="dtour" aria-label="District tour"><span>🎬</span><small>Tour</small></button>`;
  }
}
function scrollTL(i) { const b = $('tl').querySelector(`[data-i="${i}"]`); if (b) { const tl = $('tl'); tl.scrollTo({ left: b.offsetLeft - tl.clientWidth / 2 + b.offsetWidth / 2, behavior: 'smooth' }); } }
$('tl').addEventListener('click', (e) => { if (e.target.closest('[data-open]')) { if (ui.demo) stopDemo(); ui.sel = -1; openSheet('open'); requestAnimationFrame(() => { resize(); focusShop(); }); return refresh(); } const b = e.target.closest('[data-i]'); if (b) { if (ui.demo) stopDemo(); select(+b.dataset.i); } });

// ---------------------------------------------------------------- sheet: stage detail (editable checklist), stage list, stores, menu
const STAT = { ok: ['🟢', 'On track'], risk: ['🟠', 'At risk'], blocked: ['🔴', 'Blocked'], done: ['✅', 'Done'] };
const VOTE = { approved: ['✅', 'Approved', 'var(--ok)'], rejected: ['❌', 'Rejected', 'var(--block)'], deferred: ['⏸', 'Deferred', 'var(--risk)'], pending: ['⏳', 'Pending', 'var(--sub)'] };
const short = (d) => { if (!CO.isDate(d)) return '📅'; const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
function openSheet(kind) { ui.sheet = kind; ui.openedAt = performance.now(); $('sheet').hidden = false; renderSheet(); requestAnimationFrame(resize); }
function closeSheet() { ui.sheet = null; ui.sel = -1; ui.editing = null; ui.hiIssue = null; $('sheet').hidden = true; resize(); home(); refresh(); }
function select(i) {
  if (ui.demo) stopDemo();
  ui.sel = i; ui.editing = null; openSheet('stage'); requestAnimationFrame(() => { resize(); focus(i); }); scrollTL(i); refresh();
}
function renderSheet() {
  const hd = $('sheetHd'), bd = $('sheetBd'), s = store(), keep = bd.scrollTop;
  if (ui.sheet === 'stage') {
    const i = ui.sel, Sd = S[i], sg = s.stages[i], stt = CO.status(s, i, ui.today), stopped = CO.stopped(s, i), pc = Math.round(CO.eff(s, i) * 100);
    hd.innerHTML = `<span class="big">${Sd.icon}</span><h2>${i + 1}. ${esc(Sd.name)}</h2><button class="ibtn" data-act="close" aria-label="Close">✕</button>`;
    const cls = stopped ? 'st-blocked' : 'st-' + stt;
    let h = `<div class="meta"><span class="ring ${cls}" style="--p:${pc};--c:var(--c)">${stopped ? '⛔' : pc + '%'}</span>
      <div class="chips" role="group" aria-label="Status">${['auto', 'ok', 'risk', 'blocked'].map((k) => `<button class="chip ${k !== 'auto' ? 'st-' + k : ''} ${sg.status === k ? 'on' : ''}" data-status="${k}" aria-label="${k === 'auto' ? 'Auto status' : STAT[k][1]}">${k === 'auto' ? '🤖 ' + STAT[CO.status(Object.assign({}, s, { stages: s.stages.map((x, j) => (j === i ? Object.assign({}, x, { status: 'auto' }) : x)) }), i, ui.today)][0] : STAT[k][0]}</button>`).join('')}</div>
      <div class="row"><span class="chip st-${stt} on" id="statusTxt">${STAT[stt][0]} ${STAT[stt][1]}</span></div></div>
      <div class="row"><label class="fld">👤<input data-f="owner" value="${esc(sg.owner)}" placeholder="Owner" aria-label="Owner"></label>
      <label class="fld" style="flex:none">📅<input type="date" data-f="due" value="${sg.due}" aria-label="Due date"></label></div>`;
    if (stopped) h += `<div class="banner red">⛔ 🗳 REC ❌ → stopped</div>`;
    if (Sd.vote) h += `<h3>🗳 Vote</h3><div class="chips">${['approved', 'deferred', 'rejected', 'pending'].map((v) => `<button class="chip ${sg.vote === v ? 'on' : ''}" style="--c:${VOTE[v][2]}" data-vote="${v}">${VOTE[v][0]} ${VOTE[v][1]}</button>`).join('')}</div>
      ${sg.vote === 'rejected' ? '<div class="banner red">❌ Rejected → stages 5–11 stopped</div>' : sg.vote === 'deferred' ? '<div class="banner amber">⏸ Deferred → 🟠 at risk</div>' : ''}`;
    if (Sd.rollup) h += `<h3>🔗 Ready checks</h3>${Sd.rollup.map((id) => { const j = CO.IDX[id], p = CO.eff(s, j); return `<button class="task roll ${p >= 1 ? 'done' : ''}" data-goto="${j}" style="width:100%;text-align:left"><span class="ck">${p >= 1 ? '✔' : ''}</span><span class="tx">${S[j].icon} ${esc(S[j].name)}</span><span class="dt">${Math.round(p * 100)}%</span><span class="mini">›</span></button>`; }).join('')}`;
    const done = sg.tasks.filter((t) => t.done).length;
    h += `<h3>☑ <span class="grow">${done}/${sg.tasks.length}</span></h3><div id="tasks">${sg.tasks.map((t) => {
      const late = !t.done && CO.isDate(t.due) && t.due < ui.today;
      return `<div class="task ${t.done ? 'done' : ''}" data-task="${t.id}"><button class="ck" data-act="tick" aria-label="${t.done ? 'Untick' : 'Tick'}">${t.done ? '✔' : ''}</button>
        <span class="tx">${ui.editing === t.id ? `<input data-f="rename" value="${esc(t.t)}" aria-label="Task name">` : esc(t.t)}</span>
        <label class="dt ${late ? 'late' : ''}">${short(t.due)}<input type="date" data-f="tdue" value="${t.due}" aria-label="Task date"></label>
        <button class="mini" data-act="edit" aria-label="Rename">✏️</button><button class="mini ${ui.confirm === t.id ? 'warn' : ''}" data-act="del" aria-label="Delete">${ui.confirm === t.id ? '🗑?' : '🗑'}</button></div>`; }).join('')}</div>
      <div class="add"><label class="fld">＋<input id="newTask" placeholder="New task" aria-label="New task" enterkeyhint="done"></label><button class="ibtn" data-act="add" aria-label="Add task">＋</button></div>
      <div class="nav2"><button class="chip" data-goto="${Math.max(0, i - 1)}" ${i ? '' : 'disabled'}>◀ ${S[Math.max(0, i - 1)].icon}</button><button class="chip" data-goto="${Math.min(N - 1, i + 1)}" ${i < N - 1 ? '' : 'disabled'}>${S[Math.min(N - 1, i + 1)].icon} ▶</button></div>`;
    if (i === N - 1 && CO.ready(s)) h += `<button class="bigbtn" data-act="goOpen">🏪 Open the store</button>`;
    bd.innerHTML = h;
    const ed = bd.querySelector('[data-f="rename"]'); if (ed) { ed.focus(); ed.select(); }
  } else if (ui.sheet === 'list') {
    hd.innerHTML = `<span class="big">📋</span><h2>${esc(s.icon + ' ' + s.name)}</h2><button class="ibtn" data-act="close" aria-label="Close">✕</button>`;
    bd.innerHTML = S.map((x, i) => { const stt = M.stopped[i] ? 'blocked' : M.status[i], sg = s.stages[i]; return `<button class="li st-${stt}" data-goto="${i}"><span class="ic">${x.icon}</span><span class="grow"><div class="nm">${esc(x.name)}</div>
      <div class="sub">${STAT[stt][0]} ${sg.tasks.filter((t) => t.done).length}/${sg.tasks.length} · 📅 ${short(sg.due)}${x.vote ? ' · ' + VOTE[sg.vote][0] : ''}</div><div class="bar"><i style="width:${Math.round(M.p[i] * 100)}%"></i></div></span><span class="pc">${pctTxt(i)}</span></button>`; }).join('');
  } else if (ui.sheet === 'stores') {
    const L = state.stores, F = { all: '🏪', opening: '🏗', open: '☕', attn: '⚠️' }, T = { all: 'All', opening: 'Opening', open: 'Open', attn: 'Needs attention' };
    hd.innerHTML = `<span class="big">🏪</span><h2>Stores · ${L.length}</h2><button class="ibtn ${ui.mode === 'district' ? 'on' : ''}" data-act="map" aria-label="District map">🗺</button><button class="ibtn" data-act="close" aria-label="Close">✕</button>`;
    const list = CO.sorted(L.filter((x) => CO.FILTERS[ui.filter](x, ui.today)), ui.sort, ui.today);
    let h = `<div class="chips filt" role="group" aria-label="Filter">${Object.keys(F).map((k) => `<button class="chip ${ui.filter === k ? 'on' : ''}" data-filter="${k}" aria-label="${T[k]}">${F[k]} ${k === 'all' ? '' : ''}<b>${L.filter((x) => CO.FILTERS[k](x, ui.today)).length}</b></button>`).join('')}</div>
      <div class="chips sortc" role="group" aria-label="Sort">↕ ${[['urgency', '🚨'], ['stage', '📶'], ['name', '🔤']].map(([k, ic]) => `<button class="chip ${ui.sort === k ? 'on' : ''}" data-sort="${k}" aria-label="Sort by ${k}">${ic}</button>`).join('')}</div><div id="storeList">`;
    h += list.map((x) => { const open = CO.isOpen(x), hl = CO.health(x, ui.today), o = CO.overall(x), c = CO.current(x), rej = CO.rejected(x);
      let sub, pc, bar;
      if (open) { const iss = CO.openIssues(x).slice().sort(byPrio), ch = x.ops.checks, dn = ch.filter((q) => CO.checkState(q, ui.today) === 'done').length;
        sub = `${OPS[hl][0]} 🏪 ${iss.length ? iss.slice(0, 5).map((i) => i.icon).join('') : '✅'} · 🔁 ${dn}/${ch.length}`; pc = OPS[hl][0]; bar = `<div class="bar" style="--c:${OPS[hl][2]}"><i style="width:100%"></i></div>`; }
      else { sub = `${rej ? '❌ REC' : S[c].icon + ' ' + esc(S[c].short)} · 🎉 ${CO.daysTo(x, ui.today)}d${hl !== 'ok' ? ' · ' + STAT[hl][0] : ''}`; pc = rej ? '❌' : Math.round(o * 100) + '%';
        bar = `<div class="bar" style="--c:${rej || hl === 'blocked' ? 'var(--block)' : hl === 'risk' ? 'var(--risk)' : 'var(--acc)'}"><i style="width:${Math.round(o * 100)}%"></i></div>`; }
      return `<button class="li st-${open ? (hl === 'ok' ? 'done' : hl === 'attn' ? 'risk' : 'blocked') : hl} ${x.id === s.id ? 'on' : ''}" data-store="${x.id}"><span class="ic">${x.icon}</span><span class="grow">
      <div class="nm">${esc(x.name)} ${x.example ? '<i class="ex">🧪</i>' : ''}</div><div class="sub">${sub}</div>${bar}</span><span class="pc">${pc}</span></button>`; }).join('') || '<div class="banner gray">∅</div>';
    h += `</div><h3>✏️ ${esc(s.icon)} <span class="grow"></span></h3><div class="row"><button class="ibtn" data-act="icon" aria-label="Change icon">${s.icon}</button><label class="fld"><input data-f="sname" value="${esc(s.name)}" aria-label="Store name"></label></div>
      <div class="row wrap" style="margin-top:8px"><button class="chip" data-act="newStore">＋ 🏪 New</button><button class="chip ${ui.confirm === 'delStore' ? 'on' : ''}" style="--c:var(--block)" data-act="delStore" ${L.length < 2 ? 'disabled' : ''}>${ui.confirm === 'delStore' ? '🗑 Sure?' : '🗑 Delete'}</button>
      ${CO.isOpen(s) ? `<button class="chip ${ui.confirm === 'unopen' ? 'on' : ''}" style="--c:var(--risk)" data-act="unopen">${ui.confirm === 'unopen' ? '↩ Sure?' : '↩ 🏗 Opening'}</button>` : ''}</div>`;
    bd.innerHTML = h;
  } else if (ui.sheet === 'open') {
    const rd = CO.ready(s);
    hd.innerHTML = `<span class="big">🏪</span><h2>Open / Operating</h2><button class="ibtn" data-act="close" aria-label="Close">✕</button>`;
    bd.innerHTML = rd ? `<div class="banner green">🎉 ✅ 11/11</div><button class="bigbtn" data-act="goOpen">🏪 Open the store</button><div class="sub" style="color:var(--sub);margin-top:6px">→ 🛠 issues · 🔁 routine checks · 🟢🟠🔴</div>`
      : `<div class="banner gray">🔒 ${Math.round(CO.overall(s) * 100)}% → 🎉 first</div>` + S.map((x, i) => { const p = CO.eff(s, i); return p >= 1 ? '' : `<button class="li" data-goto="${i}"><span class="ic">${x.icon}</span><span class="grow"><div class="nm">${esc(x.name)}</div><div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div></span><span class="pc">${Math.round(p * 100)}%</span></button>`; }).join('');
  } else if (ui.sheet === 'ops') {
    const o = s.ops, st = CO.opsStatus(s, ui.today), auto = CO.opsAuto(s, ui.today), iss = o.issues.filter((x) => !x.done).sort(byPrio), res = o.issues.filter((x) => x.done);
    hd.innerHTML = `<span class="big">${s.icon}</span><h2>${esc(s.name)}</h2><button class="ibtn" data-act="close" aria-label="Close">✕</button>`;
    let h = `<div class="meta"><span class="ring" style="--p:100;--c:${OPS[st][2]}" id="opsRing">${OPS[st][0]}</span>
      <div class="chips" role="group" aria-label="Status">${['auto', 'ok', 'attn', 'urgent'].map((k) => `<button class="chip ${o.status === k ? 'on' : ''}" data-ostatus="${k}" aria-label="${k === 'auto' ? 'Auto status' : OPS[k][1]}">${k === 'auto' ? '🤖 ' + OPS[auto][0] : OPS[k][0]}</button>`).join('')}</div>
      <div class="row"><span class="chip on" style="--c:${OPS[st][2]}" id="opsTxt">${OPS[st][0]} ${OPS[st][1]}</span><small style="color:var(--sub)">🏪 ${Math.max(0, CO.diffDays(o.opened, ui.today))}d</small></div></div>`;
    h += `<h3>🛠 <span class="grow">${iss.length}</span></h3><div id="issues">${iss.map((x) => { const late = CO.isDate(x.due) && x.due < ui.today, ed = ui.editing === x.id;
      return `<div class="task issue p-${x.prio}${ui.hiIssue === x.id ? ' hi' : ''}" data-issue="${x.id}"><button class="ck" data-act="resolve" aria-label="Resolve"></button><span class="iic">${x.icon}</span>
        <span class="tx">${ed ? `<input data-f="ititle" value="${esc(x.t)}" aria-label="Issue"><input data-f="iowner" value="${esc(x.owner)}" aria-label="Owner" class="ow">` : `${esc(x.t)}<small>👤 ${esc(x.owner || '—')}</small>`}</span>
        <button class="mini pri" data-act="prio" aria-label="Priority ${x.prio}">${PRI[x.prio][0]}</button>
        <label class="dt ${late ? 'late' : ''}">${short(x.due)}<input type="date" data-f="idue" value="${x.due}" aria-label="Due date"></label>
        <button class="mini" data-act="iedit" aria-label="Edit">✏️</button><button class="mini ${ui.confirm === x.id ? 'warn' : ''}" data-act="idel" aria-label="Delete">${ui.confirm === x.id ? '🗑?' : '🗑'}</button></div>`; }).join('') || '<div class="banner green">✅ 0 🛠</div>'}</div>
      <div class="presets" role="group" aria-label="Add an issue">${CO.ISSUES.map(([ic, t, p], k) => `<button class="pre p-${p}" data-preset="${k}" aria-label="${esc(t)}" title="${esc(t)}"><span>${ic}</span><small>${esc(t.split(' ')[0])}</small></button>`).join('')}</div>
      <div class="add"><label class="fld">🛠<input id="newIssue" placeholder="Other issue" aria-label="New issue" enterkeyhint="done"></label><button class="ibtn" data-act="addIssue" aria-label="Add issue">＋</button></div>`;
    if (res.length) h += `<h3>✔ <span class="grow">${res.length}</span></h3>${res.map((x) => `<div class="task done issue" data-issue="${x.id}"><button class="ck" data-act="reopen" aria-label="Reopen">✔</button><span class="iic">${x.icon}</span><span class="tx">${esc(x.t)}</span><button class="mini" data-act="reopen" aria-label="Reopen">↩</button><button class="mini ${ui.confirm === x.id ? 'warn' : ''}" data-act="idel" aria-label="Delete">${ui.confirm === x.id ? '🗑?' : '🗑'}</button></div>`).join('')}`;
    const cs = o.checks.map((c) => CO.checkState(c, ui.today)), dn = cs.filter((x) => x === 'done').length, lt = cs.filter((x) => x === 'late').length;
    h += `<h3 id="routineHd">🔁 <span class="grow">${dn}/${o.checks.length}</span>${dn === o.checks.length ? '<span class="chip on" style="--c:var(--ok)" id="routineOk">✅ Normal</span>' : `<span class="chip">⏳ ${o.checks.length - dn - lt}</span>${lt ? `<span class="chip on" style="--c:var(--risk)">⚠️ ${lt}</span>` : ''}`}</h3>`;
    const EV = { daily: '📅 Daily', weekly: '🗓 Weekly', monthly: '🗓 Monthly' };
    for (const ev of CO.EVERY) { const cc = o.checks.filter((c) => c.every === ev); if (!cc.length) continue;
      h += `<div class="evh">${EV[ev]}</div>` + cc.map((c) => { const k = CO.checkState(c, ui.today); return `<div class="task check ${k === 'done' ? 'done' : ''} ck-${k}" data-check="${c.id}"><button class="ck" data-act="ctick" aria-label="${k === 'done' ? 'Untick' : 'Tick'}">${k === 'done' ? '✔' : ''}</button><span class="iic">${c.icon}</span><span class="tx">${esc(c.t)}</span><span class="cst">${k === 'done' ? '✅' : k === 'late' ? '⚠️' : '⏳'}</span></div>`; }).join(''); }
    bd.innerHTML = h;
    const ed = bd.querySelector('[data-f="ititle"]'); if (ed && ui.focusEdit) { ui.focusEdit = false; ed.focus(); ed.select(); }
    if (ui.scrollTo) { const t = bd.querySelector(ui.scrollTo); ui.scrollTo = null; if (t) { bd.scrollTop = t.offsetTop - 8; return; } }
  } else if (ui.sheet === 'menu') {
    hd.innerHTML = `<span class="big">⚙</span><h2>Coffee Opening</h2><button class="ibtn" data-act="close" aria-label="Close">✕</button>`;
    const nEx = state.stores.filter((x) => x.example).length;
    bd.innerHTML = `${nEx ? `<div class="banner gray">🧪 Example data: ${nEx} generic stores, not a real company. Edit, 🧹 clear or ↺ reset.</div>` : ''}<div class="menu">
      <button class="li" data-act="map"><span class="ic">🗺</span><span class="grow nm">District map</span></button>
      <button class="li" data-act="dtour"><span class="ic">🎬</span><span class="grow nm">District tour</span></button>
      <label class="li"><span class="ic">🎉</span><span class="grow"><div class="nm">Grand opening</div><div class="sub">${esc(s.name)}</div></span><input type="date" data-f="starget" value="${s.target}" aria-label="Grand opening date"></label>
      <button class="li" data-act="export"><span class="ic">⬇</span><span class="grow nm">Export JSON</span></button>
      <button class="li" data-act="import"><span class="ic">⬆</span><span class="grow nm">Import JSON</span></button>
      <button class="li" data-act="theme"><span class="ic">${state.theme === 'night' ? '☀️' : '🌙'}</span><span class="grow nm">${state.theme === 'night' ? 'Day' : 'Night'}</span></button>
      <button class="li" data-act="demo"><span class="ic">🏗</span><span class="grow nm">Build tour (60 s)</span></button>
      <button class="li ${ui.confirm === 'reset' ? 'on' : ''}" data-act="reset"><span class="ic">↺</span><span class="grow nm">${ui.confirm === 'reset' ? 'Tap again: reset ALL to example data' : 'Reset to example data'}</span></button>
      <button class="li ${ui.confirm === 'clearEx' ? 'on' : ''}" data-act="clearEx" ${nEx ? '' : 'disabled'}><span class="ic">🧹</span><span class="grow nm">${ui.confirm === 'clearEx' ? `Tap again: remove ${nEx} 🧪 stores` : `Clear examples (${nEx})`}</span></button></div>
      <div class="sub" style="color:var(--sub);font-size:11px;margin-top:8px">Saved on this device. 3D: three.js (MIT).</div>`;
  }
  bd.scrollTop = keep;
}
function edited() { save(); M = model(); refresh(); renderSheet(); }
let confirmT = 0; function arm(k) { ui.confirm = k; clearTimeout(confirmT); confirmT = setTimeout(() => { ui.confirm = null; if (ui.sheet) renderSheet(); }, 3000); }
$('sheet').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return; if (performance.now() - (ui.openedAt || 0) < 350 && b.dataset.act !== 'close') return; const s = store();   // (ghost-click guard above)
  const tEl = b.closest('[data-task]'), sg = ui.sel >= 0 ? s.stages[ui.sel] : null, task = tEl && sg ? sg.tasks.find((t) => t.id === tEl.dataset.task) : null;
  const act = b.dataset.act;
  if (act === 'close') return closeSheet();
  if (b.dataset.goto != null) return select(+b.dataset.goto);
  if (act === 'map') { hideSheet(); return setMode(ui.mode === 'district' ? 'lot' : 'district'); }
  if (act === 'dtour') { hideSheet(); return startDTour(); }
  if (b.dataset.filter) { ui.filter = b.dataset.filter; refresh(); return renderSheet(); }
  if (b.dataset.sort) { ui.sort = b.dataset.sort; return renderSheet(); }
  if (b.dataset.store && ui.mode === 'district') return flyTo(b.dataset.store);
  if (b.dataset.ostatus) { s.ops.status = b.dataset.ostatus; return edited(); }
  const iEl = b.closest('[data-issue]'), iss = iEl && s.ops ? s.ops.issues.find((x) => x.id === iEl.dataset.issue) : null;
  if (act === 'resolve' && iss) { iss.done = true; iss.at = ui.today; if (ui.hiIssue === iss.id) ui.hiIssue = null; toast(`✔ ${iss.icon}`); return edited(); }
  if (act === 'reopen' && iss) { iss.done = false; iss.at = ''; return edited(); }
  if (act === 'prio' && iss) { iss.prio = CO.PRIO[(CO.PRIO.indexOf(iss.prio) + 1) % CO.PRIO.length]; return edited(); }
  if (act === 'iedit' && iss) { ui.editing = ui.editing === iss.id ? null : iss.id; ui.focusEdit = !!ui.editing; return renderSheet(); }
  if (act === 'idel' && iss) { if (ui.confirm !== iss.id) { arm(iss.id); return renderSheet(); } s.ops.issues = s.ops.issues.filter((x) => x !== iss); ui.confirm = null; toast('🗑'); return edited(); }
  if (b.dataset.preset != null && s.ops) { const n = CO.preset(+b.dataset.preset, ui.today); s.ops.issues.push(n); ui.hiIssue = n.id; toast(`＋ ${n.icon}`); return edited(); }
  if (act === 'addIssue') return addIssue();
  const cEl = b.closest('[data-check]'), chk = cEl && s.ops ? s.ops.checks.find((x) => x.id === cEl.dataset.check) : null;
  if (act === 'ctick' && chk) { if (CO.checkState(chk, ui.today) === 'done') chk.last = chk.prev && chk.prev < CO.pStart(chk.every, ui.today) ? chk.prev : ''; else { chk.prev = chk.last; chk.last = ui.today; } return edited(); }
  if (act === 'goOpen') { if (!CO.ready(s)) return; CO.openStore(s, ui.today); save(); hideSheet(); snapStore(); toast('🏪 Open!'); refresh(); home(); return; }
  if (act === 'unopen') { if (ui.confirm !== 'unopen') { arm('unopen'); return renderSheet(); } s.phase = 'opening'; ui.confirm = null; snapStore(); toast('↩ 🏗'); edited(); return home(); }
  if (act === 'clearEx') { if (ui.confirm !== 'clearEx') { arm('clearEx'); return renderSheet(); } CO.clearExamples(state); ui.confirm = null; ui.sel = -1; saveNow(); snapStore(); toast('🧹 ✅'); refresh(); if (ui.mode === 'district') home(); return renderSheet(); }
  if (b.dataset.store) { state.cur = b.dataset.store; ui.sel = -1; save(); M = model(); stations.forEach((x) => { x.shown = -1; }); toast(`${store().icon} ${store().name}`); refresh(); home(); renderSheet(); return; }
  if (b.dataset.status) { sg.status = b.dataset.status; return edited(); }
  if (b.dataset.vote) { sg.vote = b.dataset.vote; return edited(); }
  if (act === 'tick' && task) { task.done = !task.done; if (task.done) burst(ui.sel); return edited(); }
  if (act === 'edit' && task) { ui.editing = ui.editing === task.id ? null : task.id; return renderSheet(); }
  if (act === 'del' && task) { if (ui.confirm !== task.id) { arm(task.id); return renderSheet(); } sg.tasks = sg.tasks.filter((t) => t !== task); ui.confirm = null; toast('🗑'); return edited(); }
  if (act === 'add') return addTask();
  if (act === 'icon') { const I = ['🏪', '🌳', '🌊', '✈️', '⛰', '🌵', '🏙', '🌻', '🚗', '🏖']; s.icon = I[(I.indexOf(s.icon) + 1) % I.length]; return edited(); }
  if (act === 'newStore') { const n = CO.newStore({ name: `New store ${state.stores.length + 1}` }); state.stores.push(n); state.cur = n.id; toast('＋ 🏪'); stations.forEach((x) => { x.shown = -1; }); return edited(); }
  if (act === 'delStore') { if (ui.confirm !== 'delStore') { arm('delStore'); return renderSheet(); } state.stores = state.stores.filter((x) => x !== s); state.cur = state.stores[0].id; ui.confirm = null; snapStore(); toast('🗑 🏪'); return edited(); }
  if (act === 'export') return exportJSON();
  if (act === 'import') return $('importFile').click();
  if (act === 'theme') return toggleTheme();
  if (act === 'demo') { closeSheet(); return startDemo(); }
  if (act === 'reset') { if (ui.confirm !== 'reset') { arm('reset'); return renderSheet(); } const th = state.theme; state = CO.fresh(); state.theme = th; ui.confirm = null; ui.sel = -1; saveNow(); snapStore(); toast('↺ 🧪'); refresh(); if (ui.mode === 'district') home(); return renderSheet(); }
});
function addIssue() { const inp = $('newIssue'), t = (inp && inp.value || '').trim(); if (!t) { inp && inp.focus(); return; } const n = CO.issue('🛠', t.slice(0, 80), 'high', CO.addDays(ui.today, 3)); store().ops.issues.push(n); ui.hiIssue = n.id; toast('＋ 🛠'); edited(); }
function addTask() { const inp = $('newTask'), t = (inp && inp.value || '').trim(); if (!t) { inp && inp.focus(); return; } store().stages[ui.sel].tasks.push({ id: CO.uid(), t: t.slice(0, 120), done: false, due: '' }); edited(); const n = $('newTask'); if (n) { n.focus(); const tk = $('tasks'); tk && tk.lastElementChild && tk.lastElementChild.scrollIntoView({ block: 'nearest' }); } }
$('sheet').addEventListener('change', (e) => {
  const f = e.target.dataset.f; if (!f) return; const s = store(), sg = ui.sel >= 0 ? s.stages[ui.sel] : null, tEl = e.target.closest('[data-task]'), task = tEl && sg ? sg.tasks.find((t) => t.id === tEl.dataset.task) : null, v = e.target.value;
  if (f === 'owner') sg.owner = v.slice(0, 60); else if (f === 'due') sg.due = CO.isDate(v) ? v : '';
  else if (f === 'tdue' && task) task.due = CO.isDate(v) ? v : '';
  else if (f === 'rename' && task) { if (v.trim()) task.t = v.trim().slice(0, 120); ui.editing = null; }
  else if (f === 'idue' || f === 'ititle' || f === 'iowner') { const iEl = e.target.closest('[data-issue]'), iss = iEl && s.ops ? s.ops.issues.find((x) => x.id === iEl.dataset.issue) : null; if (!iss) return;
    if (f === 'idue') iss.due = CO.isDate(v) ? v : ''; else if (f === 'ititle') { if (v.trim()) iss.t = v.trim().slice(0, 80); } else iss.owner = v.trim().slice(0, 40); }
  else if (f === 'sname') s.name = v.trim().slice(0, 40) || s.name;
  else if (f === 'starget' && CO.isDate(v)) s.target = v;
  edited();
});
$('sheet').addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; if (e.target.id === 'newTask') { e.preventDefault(); addTask(); } else if (e.target.id === 'newIssue') { e.preventDefault(); addIssue(); } else if (e.target.dataset.f === 'iowner') { ui.editing = null; e.target.blur(); renderSheet(); } else if (e.target.dataset.f === 'ititle') e.target.blur(); else if (e.target.dataset.f === 'rename' || e.target.dataset.f === 'sname' || e.target.dataset.f === 'owner') e.target.blur(); });
$('target').addEventListener('change', (e) => { if (CO.isDate(e.target.value)) { store().target = e.target.value; toast(`🎉 ${short(e.target.value)}`); edited(); } });
$('storeBtn').onclick = () => { if (ui.demo) stopDemo(); ui.sel = -1; ui.sheet === 'stores' ? closeSheet() : (openSheet('stores'), refresh()); };
$('overall').onclick = $('listBtn').onclick = () => { if (ui.demo) stopDemo(); ui.sel = -1;
  if (ui.mode === 'district') return ui.sheet === 'stores' ? closeSheet() : (openSheet('stores'), refresh());
  if (M.open) return ui.sheet === 'ops' ? closeSheet() : openOps();
  ui.sheet === 'list' ? closeSheet() : (openSheet('list'), home(), refresh()); };
$('mapBtn').onclick = () => { if (ui.dtour) stopDTour(); hideSheet(); setMode(ui.mode === 'district' ? 'lot' : 'district'); };
$('ops').addEventListener('click', (e) => { const b = e.target.closest('[data-ops]'); if (!b) return; const k = b.dataset.ops; ui.scrollTo = k === 'checks' ? '#routineHd' : k === 'add' ? '.presets' : null; openOps(); });
$('dbar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.act === 'dtour') return ui.dtour ? stopDTour() : startDTour();
  if (b.dataset.filter) { if (ui.dtour) stopDTour(); ui.filter = b.dataset.filter; openSheet('stores'); refresh(); } });
$('menuBtn').onclick = () => { if (ui.demo) stopDemo(); ui.sel = -1; ui.sheet === 'menu' ? closeSheet() : (openSheet('menu'), refresh()); };
function exportJSON() {
  saveNow(); const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `coffee-opening-${ui.today}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast('⬇ JSON');
}
$('importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const o = CO.importJSON(await f.text()); o.theme = state.theme; state = o; saveNow(); ui.sel = -1; M = model(); stations.forEach((x) => { x.shown = -1; }); toast(`⬆ ✅ ${state.stores.length} 🏪`); refresh(); if (ui.sheet) renderSheet(); }
  catch (err) { toast('⬆ ❌ not a plan'); }
});
function toggleTheme() { state.theme = state.theme === 'night' ? 'day' : 'night'; save(); applyTheme(); if (ui.sheet === 'menu') renderSheet(); }
$('themeBtn').onclick = toggleTheme;

// little ring burst when a task is ticked
function burst(i) { const s = stations[i]; s.burst = performance.now(); }

// ---------------------------------------------------------------- 🎬 auto tour: 0 → 100% in 60 s (does not touch your data)
function startDemo() {
  if (ui.dtour) stopDTour(true); if (ui.mode !== 'lot') setMode('lot');
  if (ui.sheet) closeSheet(); ui.demo = { t0: performance.now(), lastCur: -1 }; $('demoBar').hidden = false; $('demoBtn').classList.add('on');
  stations.forEach((x) => { x.shown = -1; }); for (let i = 0; i < N; i++) shown[i] = 0; paved = 0; toast('🎬 0 → 🎉');
}
function stopDemo() { ui.demo = null; $('demoBar').hidden = true; $('demoBtn').classList.remove('on'); M = model(); home(); refresh(); }
$('demoBtn').onclick = () => (ui.dtour ? stopDTour() : ui.mode === 'district' ? startDTour() : ui.demo ? stopDemo() : startDemo());
$('demoStop').onclick = () => (ui.dtour ? stopDTour() : stopDemo());
// 🎬 district tour: fly over every store (in the current filter + sort), ~2.4 s each
function startDTour() {
  if (ui.demo) stopDemo(); if (ui.mode !== 'district') setMode('district'); if (ui.sheet) hideSheet();
  let ids = CO.sorted(state.stores.filter((x) => CO.FILTERS[ui.filter](x, ui.today)), ui.sort, ui.today).map((x) => x.id); if (!ids.length) ids = state.stores.map((x) => x.id);
  ui.dtour = { t0: performance.now(), ids, i: -1 }; $('demoBar').hidden = false; $('demoBtn').classList.add('on'); toast('🎬 🗺');
}
function stopDTour(quiet) { ui.dtour = null; ui.tourId = null; $('demoBar').hidden = true; $('demoBtn').classList.remove('on'); if (!quiet) { home(); refresh(); } }
function dtourTick(now) {
  const d = ui.dtour, el = (now - d.t0) / 1000, k = Math.floor(el / 2.4), n = d.ids.length;
  $('demoFill').style.width = Math.round(Math.min(1, el / (2.4 * n)) * 100) + '%'; $('demoPct').textContent = `${Math.min(n, k + 1)}/${n}`;
  if (k >= n) { if (!d.end) { d.end = el; ui.tourId = null; home(); renderDistLabels(); toast('🗺 ✅'); } if (el - d.end > 1.6) stopDTour(); return; }
  if (k !== d.i) { d.i = k; const id = d.ids[k], j = state.stores.findIndex((x) => x.id === id), s = state.stores[j]; if (!s) return;
    const [x, z] = distPos[j]; dst.tx = x; dst.tz = z; dst.h = focusH(17, 14); ui.tourId = id; renderDistLabels();
    const h = CO.health(s, ui.today); toast(`${s.icon} ${s.name} ${CO.isOpen(s) ? OPS[h][0] : CO.rejected(s) ? '❌' : Math.round(CO.overall(s) * 100) + '%'}`, 2200); }
}
function demoTick() {
  const d = ui.demo; if (!d) return;
  const el = (performance.now() - d.t0) / 1000;
  $('demoFill').style.width = Math.round(M.x * 100) + '%'; $('demoPct').textContent = Math.round(M.x * 100) + '%';
  if (M.x < 1 && M.cur !== d.lastCur) { d.lastCur = M.cur; focus(M.cur); dst.tx *= 0.6; dst.tz = dst.tz * 0.6 - 1;   // frame the stage + the shop together
    dst.h = M.cur === 5 ? focusH(24, 20) : focusH(26, 21); scrollTL(M.cur); }
  if (M.x >= 1 && !d.end) { d.end = el; home(); toast('🎉 100%'); }
  if (d.end && el - d.end > 4) stopDemo();
}

// ---------------------------------------------------------------- 🗺 mode switch + fly-to
function setMode(m) {
  if (ui.demo) stopDemo(); if (ui.dtour && m === 'lot') stopDTour(true);
  ui.mode = m; lot.visible = m === 'lot'; dist.visible = m === 'district'; ui.sel = -1; ui.hiIssue = null;
  stageEl.classList.toggle('district', m === 'district'); $('mapBtn').classList.toggle('on', m === 'district');
  if (m === 'district') { if (ui.sheet && ui.sheet !== 'stores' && ui.sheet !== 'menu') hideSheet(); buildDistrict(true); }
  refresh(); resize(); home();
}
function hideSheet() { ui.sheet = null; ui.sel = -1; ui.editing = null; $('sheet').hidden = true; resize(); }
function snapStore() { M = model(); stations.forEach((x) => { x.shown = -1; }); for (let i = 0; i < N; i++) shown[i] = M.p[i]; paved = M.p[5] >= 0.86 ? 1 : 0; }
function flyTo(id) {
  const k = state.stores.findIndex((x) => x.id === id); if (k < 0 || ui.flying) return;
  if (ui.dtour) stopDTour(true); if (ui.sheet) hideSheet();
  const [x, z] = distPos[k] || [0, 0]; dst.tx = x; dst.tz = z; dst.h = 9; ui.flying = id; renderDistLabels();
  setTimeout(() => {
    ui.flying = null; state.cur = id; save(); snapStore(); setMode('lot');
    view.tx = 0; view.tz = 0; view.h = 9; const s = store(); toast(`${s.icon} ${s.name}`);
    if (CO.isOpen(s) && CO.opsStatus(s, ui.today) !== 'ok') setTimeout(() => { if (ui.mode === 'lot' && !ui.sheet) openOps(); }, 500);
  }, 650);
}
function openOps(issueId) { if (ui.demo) stopDemo(); ui.sel = -1; ui.hiIssue = issueId || null; openSheet('ops'); requestAnimationFrame(() => { resize(); dst.tx = 0; dst.tz = 0.5; dst.h = focusH(13, 12); }); refresh(); }

// ---------------------------------------------------------------- misc
let toastT = 0; function toast(t, ms = 1600) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms); }
function refresh() { M = model(); if (ui.mode === 'district') buildDistrict(); renderTop(); renderTL(); renderBars(); refreshLabels(); }
new ResizeObserver(() => { resize(); if (ui.mode === 'district') buildDistrict(); if (ui.sel >= 0) focus(ui.sel); else if (ui.sheet === 'ops' || ui.sheet === 'open') focusShop(); else if (!ui.demo && !ui.dtour) home(); }).observe(stageEl);
new ResizeObserver(() => resize()).observe($('sheet'));
setInterval(() => { const d = CO.today(); if (d !== ui.today) { ui.today = d; refresh(); } }, 30000);

// ---------------------------------------------------------------- main loop
let last = performance.now(), sigT = 0;
function loop(now) {
  const rdt = Math.min(0.5, (now - last) / 1000), dt = Math.min(0.1, rdt); last = now;
  if (ui.demo) { M = model(); demoTick(); if (now - sigT > 120) { sigT = now; renderTop(); renderTL(); renderBars(); refreshLabels(); } }
  if (ui.dtour) dtourTick(now);
  if (lot.visible) { apply(dt, now); animate(dt, now); } applyDistrict(now);
  stations.forEach((s) => { const b = s.burst ? (now - s.burst) / 600 : 2; const sc = b < 1 ? 1 + Math.sin(b * Math.PI) * 0.18 : 1; s.base.scale.setScalar(sc); s.fill.scale.setScalar(sc); });
  camUpdate(rdt); placeLabels(); renderer.render(scene, cam);
  requestAnimationFrame(loop);
}
applyTheme(); resize(); home(); Object.assign(view, dst); refresh(); for (let i = 0; i < N; i++) shown[i] = M.p[i]; paved = M.p[5] >= 0.86 ? 1 : 0;
requestAnimationFrame(loop);

// test hooks (read-only views + helpers used by the headless checks)
window.COG = { get state() { return state; }, get model() { return M; }, get ui() { return ui; }, view, dst, shown, cam, stations, routes, movers, P, shop: { slab, walls, roof, sign, finish, machines }, bubbles, dHits, get distPos() { return distPos; }, lot, dist, flyTo, setMode, openOps, startDTour, stopDTour, select, startDemo, stopDemo, focus, home, pick,
  project: (x, y, z) => { pv.set(x, y, z).project(cam); const r = cv.getBoundingClientRect(); return { x: r.left + (pv.x + 1) / 2 * r.width, y: r.top + (1 - pv.y) / 2 * r.height }; }, saveNow };
