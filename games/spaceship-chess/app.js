// Spaceship Chess: Three.js scene, input, UI. Rules/AI live in rules.js (window.RULES).
import * as THREE from './three.module.min.js';
const RU = window.RULES;
const $ = (s) => document.querySelector(s);
const GAP = 2.6;                    // world distance between levels (exploded stack)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ game state
let game = RU.load(localStorage);   // { mode: 'ai'|'pass', moves: [] }
let st = RU.replay(game.moves) || RU.fresh();
let status = RU.status(st);
const ui = { sel: -1, targets: [], focus: -1, thinking: false, token: 0, lastAi: null, armNew: 0 };
const save = () => { try { localStorage.setItem(RU.KEY, JSON.stringify(game)); } catch (e) { /* storage full / private mode */ } };
const humanTurn = () => game.mode === 'pass' || st.turn === 1;

// ------------------------------------------------------------------ renderer / scene
const canvas = $('#scene'), stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setClearColor(0x050814, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 600);
scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x1a1030, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(6, 20, 10); scene.add(sun);

// stars + soft nebula backdrop (procedural)
{
  const n = 1400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 160 + Math.random() * 120, s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * s * r, u * r + 10, Math.sin(a) * s * r], i * 3);
    const w = 0.6 + Math.random() * 0.4, tint = Math.random();
    col.set(tint < 0.15 ? [w, w * 0.8, w * 0.6] : tint < 0.3 ? [w * 0.7, w * 0.85, w] : [w, w, w], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: true, depthWrite: false })));
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#050814'; x.fillRect(0, 0, 512, 256);
  for (const [cx, cy, r, colr] of [[120, 120, 120, 'rgba(60,70,190,.35)'], [380, 90, 140, 'rgba(150,50,140,.25)'], [300, 190, 110, 'rgba(255,120,40,.12)'], [40, 60, 80, 'rgba(40,140,200,.2)']]) {
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, colr); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 512, 256);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false })));
}

// ------------------------------------------------------------------ board: cells (InstancedMesh), lattice lines, labels
const wpos = (s, out = new THREE.Vector3()) => out.set(RU.X(s) - 3.5, RU.Z(s) * GAP, 3.5 - RU.Y(s));
const cellMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false });
const cells = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 0.05, 0.92), cellMat, 512);
cells.renderOrder = 1;
const M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), C = new THREE.Color();
for (let s = 0; s < 512; s++) { M4.makeTranslation(wpos(s, V3)); cells.setMatrixAt(s, M4); }
scene.add(cells);
function colorCells() {
  for (let s = 0; s < 512; s++) {
    const dark = (RU.X(s) + RU.Y(s)) % 2 === 0, z = RU.Z(s), dim = ui.focus >= 0 && ui.focus !== z;
    // focus mode hides the other plates (their frames + ghost ships stay as context)
    wpos(s, V3); M4.makeTranslation(V3); if (dim) M4.scale(V3.set(0.001, 0.001, 0.001)); cells.setMatrixAt(s, M4);
    C.set(dark ? 0x1c2f66 : 0x3c66b8); if (ui.focus === z) C.multiplyScalar(1.35);
    cells.setColorAt(s, C);
  }
  cells.instanceMatrix.needsUpdate = true; cells.instanceColor.needsUpdate = true;
}
const lineOn = new THREE.LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.85 });
const lineOff = new THREE.LineBasicMaterial({ color: 0x4f7fd8, transparent: true, opacity: 0.35 });
const lineDim = new THREE.LineBasicMaterial({ color: 0x31508f, transparent: true, opacity: 0.14 });
const levelFrames = [];
{
  const v = []; for (let i = 0; i <= 8; i++) { const a = i - 4; v.push(-4, 0, a, 4, 0, a, a, 0, -4, a, 0, 4); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  for (let z = 0; z < 8; z++) { const l = new THREE.LineSegments(g, lineOff); l.position.y = z * GAP - 0.03; scene.add(l); levelFrames.push(l); }
  // station struts at the corners + mid edges
  const sv = []; for (const [x, zz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) sv.push(x, -0.03, zz, x, 7 * GAP - 0.03, zz);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
  scene.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x7fb6ff, transparent: true, opacity: 0.5 })));
  const nodeG = new THREE.OctahedronGeometry(0.12); const nodeM = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
  const nodes = new THREE.InstancedMesh(nodeG, nodeM, 32); let k = 0;
  for (let z = 0; z < 8; z++) for (const [x, zz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { M4.makeTranslation(x, z * GAP - 0.03, zz); nodes.setMatrixAt(k++, M4); }
  scene.add(nodes);
}
function textSprite(t, color, size = 0.7) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.font = 'bold 44px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; x.fillText(t, 32, 35);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.set(size, size, 1); return sp;
}
const levelTags = [];
for (let z = 0; z < 8; z++) { const sp = textSprite(String(z + 1), z < 2 ? '#9cc0ff' : z > 5 ? '#ffc08a' : '#cfe0ff', 0.9); sp.position.set(-4.7, z * GAP + 0.2, 4.4); scene.add(sp); levelTags.push(sp); }
const coordTags = new THREE.Group(); scene.add(coordTags);
for (let i = 0; i < 8; i++) {
  const f = textSprite('abcdefgh'[i], '#bcd3ff', 0.55); f.position.set(i - 3.5, 0.1, 4.55); coordTags.add(f);
  const r = textSprite(String(i + 1), '#bcd3ff', 0.55); r.position.set(-4.5, 0.1, 3.5 - i); coordTags.add(r);
}
coordTags.visible = false;

// ------------------------------------------------------------------ highlights (InstancedMesh), selection ring, last move, check
const HL_MAX = 160;
const hl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 18), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }), HL_MAX);
hl.renderOrder = 3; hl.count = 0; scene.add(hl);
const hlBeam = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshBasicMaterial({ color: 0xffffff }), HL_MAX);
hlBeam.count = 0; scene.add(hlBeam);
const selRing = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffffff }));
selRing.rotation.x = Math.PI / 2; selRing.visible = false; scene.add(selRing);
const lastM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 0.07, 0.92), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.35, depthWrite: false }), 2);
lastM.count = 0; lastM.renderOrder = 2; scene.add(lastM);
const chkRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color: 0xff3355 }));
chkRing.rotation.x = Math.PI / 2; chkRing.visible = false; scene.add(chkRing);
const flash = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc86b, transparent: true, opacity: 0, depthWrite: false }));
scene.add(flash); let flashT = 9;

// ------------------------------------------------------------------ spaceship pieces (procedural low-poly)
const FACTION = [{ hull: 0x3d7bff, glow: 0x7fe3ff }, { hull: 0xff7a1a, glow: 0xffe08a }];
const MATS = [0, 1].map((f) => [false, true].map((ghost) => {
  const t = (m) => { if (ghost) { m.transparent = true; m.opacity = 0.16; m.depthWrite = false; } return m; };
  return {
    hull: t(new THREE.MeshLambertMaterial({ color: FACTION[f].hull, emissive: FACTION[f].hull, emissiveIntensity: 0.28, flatShading: true })),
    trim: t(new THREE.MeshLambertMaterial({ color: 0x9aa6c0, emissive: 0x20283c, flatShading: true })),
    glow: t(new THREE.MeshBasicMaterial({ color: FACTION[f].glow })),
  };
}));
const G = {}; const geo = (k, f) => G[k] || (G[k] = f());
const nose = (g) => { g.rotateX(Math.PI / 2); return g; };   // +Y-pointing primitive -> +Z (forward)
function part(g, role, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(g, null); m.userData.role = role; m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); return m;
}
const BUILD = {
  1: () => [ // drone: octa core + ring + eye
    part(geo('oct', () => new THREE.OctahedronGeometry(0.17)), 'hull', 0, 0.22, 0),
    part(geo('ring', () => new THREE.TorusGeometry(0.25, 0.035, 5, 14)), 'trim', 0, 0.22, 0, Math.PI / 2),
    part(geo('eye', () => new THREE.SphereGeometry(0.065, 8, 6)), 'glow', 0, 0.24, 0.15)],
  2: () => [ // fighter: X-wing silhouette
    part(geo('fus', () => nose(new THREE.ConeGeometry(0.11, 0.62, 6))), 'hull', 0, 0.26, 0.02),
    part(geo('wing', () => new THREE.BoxGeometry(0.62, 0.03, 0.16)), 'trim', 0, 0.3, -0.12, 0, 0, 0.42),
    part(geo('wing'), 'trim', 0, 0.22, -0.12, 0, 0, -0.42),
    part(geo('eng', () => new THREE.SphereGeometry(0.07, 8, 6)), 'glow', 0, 0.26, -0.3)],
  3: () => [ // interceptor: needle + delta wing + tail fin
    part(geo('needle', () => nose(new THREE.ConeGeometry(0.075, 0.8, 5))), 'hull', 0, 0.24, 0.02),
    part(geo('delta', () => new THREE.CylinderGeometry(0.36, 0.36, 0.03, 3)), 'trim', 0, 0.22, -0.08, 0, 0, 0, 1, 1, 1.15),
    part(geo('fin', () => new THREE.BoxGeometry(0.03, 0.22, 0.2)), 'hull', 0, 0.36, -0.22),
    part(geo('eng'), 'glow', 0, 0.24, -0.36, 0, 0, 0, 0.8, 0.8, 0.8)],
  4: () => [ // battleship: cube hull, bridge, twin guns, engines
    part(geo('hullbox', () => new THREE.BoxGeometry(0.5, 0.24, 0.72)), 'hull', 0, 0.2, 0),
    part(geo('bridge', () => new THREE.BoxGeometry(0.28, 0.18, 0.26)), 'trim', 0, 0.4, -0.12),
    part(geo('gun', () => new THREE.BoxGeometry(0.05, 0.05, 0.36)), 'trim', -0.1, 0.35, 0.22),
    part(geo('gun'), 'trim', 0.1, 0.35, 0.22),
    part(geo('thr', () => nose(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 8))), 'glow', -0.14, 0.2, -0.4),
    part(geo('thr'), 'glow', 0.14, 0.2, -0.4)],
  5: () => [ // mothership: big saucer + dome + glow ring + mast
    part(geo('saucer', () => new THREE.CylinderGeometry(0.43, 0.28, 0.13, 14)), 'hull', 0, 0.22, 0),
    part(geo('dome', () => new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), 'trim', 0, 0.28, 0),
    part(geo('halo', () => new THREE.TorusGeometry(0.43, 0.03, 5, 28)), 'glow', 0, 0.22, 0, Math.PI / 2),
    part(geo('mast', () => new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4)), 'trim', 0, 0.55, 0),
    part(geo('tip', () => new THREE.OctahedronGeometry(0.06)), 'glow', 0, 0.72, 0)],
  6: () => [ // command station: ring + spokes + tall spire + beacon (tallest piece)
    part(geo('sring', () => new THREE.TorusGeometry(0.33, 0.06, 6, 18)), 'hull', 0, 0.2, 0, Math.PI / 2),
    part(geo('spoke', () => new THREE.BoxGeometry(0.66, 0.04, 0.04)), 'trim', 0, 0.2, 0),
    part(geo('spoke'), 'trim', 0, 0.2, 0, 0, Math.PI / 2),
    part(geo('spire', () => new THREE.CylinderGeometry(0.06, 0.13, 0.72, 6)), 'trim', 0, 0.48, 0),
    part(geo('hub', () => new THREE.OctahedronGeometry(0.17)), 'hull', 0, 0.55, 0),
    part(geo('beacon', () => new THREE.SphereGeometry(0.09, 8, 6)), 'glow', 0, 0.92, 0)],
  7: () => [ // scout (unicorn): sleek pod + long glowing horn + side pods
    part(geo('pod', () => new THREE.SphereGeometry(0.16, 8, 6)), 'hull', 0, 0.24, -0.04, 0, 0, 0, 1, 0.7, 1.7),
    part(geo('horn', () => nose(new THREE.ConeGeometry(0.035, 0.42, 6))), 'glow', 0, 0.3, 0.42),
    part(geo('side', () => nose(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6))), 'trim', -0.2, 0.2, -0.08),
    part(geo('side'), 'trim', 0.2, 0.2, -0.08)],
};
function makeShip(p) {
  const g = new THREE.Group(); const t = Math.abs(p); g.userData = { p, t, f: p > 0 ? 0 : 1, ghost: null, phase: Math.random() * 6 };
  for (const m of BUILD[t]()) g.add(m);
  g.scale.setScalar(1.15);
  g.rotation.y = p > 0 ? Math.PI : 0;   // Blue noses toward row 8 (-Z), Orange toward row 1 (+Z)
  setGhost(g, false); return g;
}
function setGhost(g, ghost) {
  if (g.userData.ghost === ghost) return; g.userData.ghost = ghost; const M = MATS[g.userData.f][ghost ? 1 : 0];
  g.traverse((m) => { if (m.isMesh) m.material = M[m.userData.role]; });
}
const ships = new Map();   // square -> Group
const shipRoot = new THREE.Group(); scene.add(shipRoot);
let anims = [];            // {g, from, to, t, dur, die}
function rebuildShips() {
  for (const g of ships.values()) shipRoot.remove(g); ships.clear(); anims = [];
  for (let s = 0; s < 512; s++) if (st.b[s]) { const g = makeShip(st.b[s]); wpos(s, g.position); g.userData.base = g.position.y; shipRoot.add(g); ships.set(s, g); }
  refreshVisuals();
}
function animateMove(m, promoted) {
  const f = m & 511, t = m >> 9, g = ships.get(f), dead = ships.get(t);
  if (dead) { ships.delete(t); anims.push({ g: dead, t: 0, dur: 0.45, die: true }); }
  if (!g) return rebuildShips();
  ships.delete(f); ships.set(t, g);
  if (promoted) { const ng = makeShip(st.b[t]); ng.position.copy(g.position); shipRoot.remove(g); shipRoot.add(ng); ships.set(t, ng); anims.push({ g: ng, from: g.position.clone(), to: wpos(t), t: 0, dur: 0.5 }); }
  else anims.push({ g, from: g.position.clone(), to: wpos(t), t: 0, dur: 0.5 });
}

// ------------------------------------------------------------------ visuals that depend on state
function refreshVisuals() {
  for (const [s, g] of ships) setGhost(g, ui.focus >= 0 && RU.Z(s) !== ui.focus);
  colorCells();
  levelFrames.forEach((l, z) => { l.material = ui.focus < 0 ? lineOff : ui.focus === z ? lineOn : lineDim; });
  levelTags.forEach((sp, z) => { sp.visible = ui.focus < 0 || ui.focus === z; });
  coordTags.visible = ui.focus >= 0; coordTags.position.y = Math.max(0, ui.focus) * GAP;
  // highlights
  hl.count = Math.min(HL_MAX, ui.targets.length); hlBeam.count = hl.count;
  for (let i = 0; i < hl.count; i++) {
    const t = ui.targets[i] >> 9, cap = !!st.b[t]; wpos(t, V3);
    M4.makeTranslation(V3.x, V3.y + 0.06, V3.z); if (cap) M4.scale(V3.set(1.35, 1, 1.35)); hl.setMatrixAt(i, M4);
    hl.setColorAt(i, C.set(cap ? 0xff4d6a : 0x46f29a));
    wpos(t, V3); M4.makeTranslation(V3.x, V3.y + (cap ? 1.15 : 0.45), V3.z); hlBeam.setMatrixAt(i, M4);
    hlBeam.setColorAt(i, C.set(cap ? 0xff8095 : 0xa6ffd0));
  }
  hl.instanceMatrix.needsUpdate = true; hlBeam.instanceMatrix.needsUpdate = true;
  if (hl.instanceColor) hl.instanceColor.needsUpdate = true; if (hlBeam.instanceColor) hlBeam.instanceColor.needsUpdate = true;
  selRing.visible = ui.sel >= 0; if (ui.sel >= 0) { wpos(ui.sel, selRing.position); selRing.position.y += 0.06; }
  const last = game.moves[game.moves.length - 1];
  lastM.count = last === undefined ? 0 : 2;
  if (last !== undefined) { [last & 511, last >> 9].forEach((s, i) => { wpos(s, V3); M4.makeTranslation(V3.x, V3.y + 0.01, V3.z); lastM.setMatrixAt(i, M4); }); lastM.instanceMatrix.needsUpdate = true; }
  const k = st.turn > 0 ? st.kw : st.kb;
  chkRing.visible = (status === 'check' || status === 'mate') && k >= 0; if (chkRing.visible) { wpos(k, chkRing.position); chkRing.position.y += 0.08; }
  renderLevels(); renderTop();
}

// ------------------------------------------------------------------ camera (orbit around the stack, eased)
const view = { az: 0, el: 0.42, dist: 30, ty: 3.5 * GAP }, dst = { ...view };
function fitDist(h, w) { const tf = Math.tan((camera.fov * Math.PI / 180) / 2); return Math.max(h / (2 * tf), w / (2 * tf * camera.aspect)); }
function home() {
  ui.focus = -1; dst.az = game.mode === 'pass' && st.turn < 0 ? Math.PI : 0; const portrait = camera.aspect < 1; dst.el = portrait ? 0.4 : 0.34; dst.ty = 3.5 * GAP - 0.4;
  const h = 7 * GAP * Math.cos(dst.el) + 9 * Math.sin(dst.el) + 1.5;
  dst.dist = clamp(fitDist(h, 13.5) + 5, 10, 90); refreshVisuals();
}
function focusLevel(z) {
  ui.focus = z; dst.ty = z * GAP; dst.el = 0.95; dst.dist = clamp(fitDist(9, 10.5) + 2.5, 8, 90); refreshVisuals();
}
function camUpdate(dt) {
  const k = 1 - Math.exp(-dt * 6);
  for (const key of ['az', 'el', 'dist', 'ty']) view[key] += (dst[key] - view[key]) * k;
  const ce = Math.cos(view.el);
  camera.position.set(Math.sin(view.az) * ce * view.dist, view.ty + Math.sin(view.el) * view.dist, Math.cos(view.az) * ce * view.dist);
  camera.lookAt(0, view.ty, 0);
}
function resize() {
  const r = stage.getBoundingClientRect(); const w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setSize(w, h, false); camera.aspect = w / h;
  // shift the picture right by half the level-chip column so the stack is centred in the free area
  const chips = $('#levels').getBoundingClientRect(); const off = Math.round((chips.right - r.left) / 2);
  camera.setViewOffset(w, h, -off, 0, w, h); camera.updateProjectionMatrix();
  if (ui.focus >= 0) focusLevel(ui.focus); else home();
}
new ResizeObserver(resize).observe(stage);

// ------------------------------------------------------------------ picking (screen-space, finger friendly)
const PV = new THREE.Vector3();
function project(s, lift = 0.3) {
  wpos(s, PV); PV.y += lift; camera.updateMatrixWorld(); PV.project(camera);
  const r = canvas.getBoundingClientRect(); return { x: r.left + (PV.x + 1) / 2 * r.width, y: r.top + (1 - PV.y) / 2 * r.height, z: PV.z };
}
function cellPx(s) { const a = project(s, 0.3); wpos(s, PV); PV.x += 1; PV.y += 0.3; PV.project(camera); const r = canvas.getBoundingClientRect(); return Math.hypot((PV.x + 1) / 2 * r.width + r.left - a.x, (1 - PV.y) / 2 * r.height + r.top - a.y); }
function pick(x, y) {
  let best = null, bd = Infinity;
  const consider = (s, kind, lift) => { const p = project(s, lift); if (p.z > 1) return; const rad = Math.max(22, cellPx(s) * 0.62); const d = Math.hypot(p.x - x, p.y - y) / rad; if (d < 1 && d < bd) { bd = d; best = { s, kind }; } };
  for (const m of ui.targets) consider(m >> 9, 'target', 0.1);
  if (humanTurn() && !isOver()) for (let s = 0; s < 512; s++) if (st.b[s] * st.turn > 0 && (ui.focus < 0 || RU.Z(s) === ui.focus)) consider(s, 'piece', 0.3);
  return best;
}
function onTap(x, y) {
  const h = pick(x, y);
  if (!h) { if (ui.sel >= 0) select(-1); return; }
  if (h.kind === 'target') { const m = ui.targets.find((mm) => (mm >> 9) === h.s); if (m !== undefined) play(m); return; }
  select(h.s === ui.sel ? -1 : h.s);
}
function select(s) {
  ui.sel = s; ui.targets = s >= 0 && humanTurn() && !isOver() ? RU.legal(st, s) : [];
  if (s >= 0 && !ui.targets.length) toast('🚫 No moves for this ship');
  refreshVisuals();
}

// ------------------------------------------------------------------ playing moves
const isOver = () => status === 'mate' || status === 'stalemate' || status === 'draw';
function play(m) {
  const p = st.b[m & 511], c = p > 0 ? 1 : -1, t = m >> 9;
  const promoted = Math.abs(p) === RU.P && RU.promoSq(c, t);
  if (st.b[t]) { wpos(t, flash.position); flash.position.y += 0.3; flashT = 0; }
  RU.make(st, m); st.stack.length = 0; game.moves.push(m); save();
  status = RU.status(st); ui.sel = -1; ui.targets = [];
  animateMove(m, promoted); renderLog(); refreshVisuals();
  if (status === 'check') toast('⚠️ Check!'); else if (promoted) toast('🤖 → 🛸 Promoted!');
  if (game.mode === 'pass' && !isOver()) dst.az = st.turn > 0 ? 0 : Math.PI;
  maybeAi();
}
let worker = null;
try { worker = new Worker('ai-worker.js'); worker.onmessage = (e) => onAi(e.data); worker.onerror = () => { worker = null; }; } catch (e) { worker = null; }
function maybeAi() {
  if (game.mode !== 'ai' || st.turn !== -1 || isOver() || ui.thinking) return;
  ui.thinking = true; const id = ++ui.token; renderTop();
  const t0 = performance.now();
  const go = () => {
    if (worker) worker.postMessage({ id, board: st.b, turn: st.turn, ms: 900 });
    else setTimeout(() => { const r = RU.search(RU.clone(st), { ms: 700 }); onAi({ id, move: r.move, depth: r.depth, ms: r.ms }); }, 30);
  };
  ui.t0 = t0; setTimeout(go, 120);
}
function onAi(r) {
  if (r.id !== ui.token) return;            // cancelled by undo / new game
  ui.thinking = false; ui.lastAi = { ms: Math.round(performance.now() - ui.t0), depth: r.depth, workerMs: r.ms };
  if (r.move >= 0 && RU.legal(st).indexOf(r.move) >= 0) play(r.move); else renderTop();
}
function undo() {
  if (!game.moves.length) return;
  ui.token++; ui.thinking = false;
  game.moves.pop();
  if (game.mode === 'ai' && game.moves.length && game.moves.length % 2 === 1) game.moves.pop(); // back to Blue's turn
  st = RU.replay(game.moves) || RU.fresh(); status = RU.status(st); save();
  ui.sel = -1; ui.targets = []; hideOver(); rebuildShips(); renderLog();
  if (game.mode === 'pass') dst.az = st.turn > 0 ? 0 : Math.PI;
  maybeAi();
}
function newGame() {
  ui.token++; ui.thinking = false; game = { mode: game.mode, moves: [] }; st = RU.fresh(); status = 'play'; save();
  ui.sel = -1; ui.targets = []; hideOver(); rebuildShips(); renderLog(); dst.az = 0; home();
}

// ------------------------------------------------------------------ HTML UI
const lvWrap = $('#levels');
lvWrap.innerHTML = '<button class="lv" data-l="-1" aria-label="All levels">▦</button>' +
  [7, 6, 5, 4, 3, 2, 1, 0].map((z) => `<button class="lv ${z < 2 ? 'b' : z > 5 ? 'o' : ''}" data-l="${z}" aria-label="Level ${z + 1}">${z + 1}</button>`).join('');
lvWrap.addEventListener('click', (e) => { const b = e.target.closest('.lv'); if (!b) return; const z = +b.dataset.l; if (z < 0 || z === ui.focus) { home(); } else focusLevel(z); });
function renderLevels() {
  const cnt = new Array(8).fill(0), cap = new Array(8).fill(false);
  for (const m of ui.targets) { const t = m >> 9; cnt[RU.Z(t)]++; if (st.b[t]) cap[RU.Z(t)] = true; }
  for (const b of lvWrap.children) {
    const z = +b.dataset.l; b.classList.toggle('on', z === ui.focus);
    const old = b.querySelector('i'); if (old) old.remove();
    if (z >= 0 && cnt[z]) { const i = document.createElement('i'); i.textContent = cnt[z]; if (cap[z]) i.className = 'cap'; b.appendChild(i); }
  }
}
function renderTop() {
  const tEl = $('#turn'), txt = $('#turnTxt');
  tEl.classList.toggle('o', st.turn < 0); tEl.classList.toggle('think', ui.thinking); tEl.classList.toggle('chk', status === 'check');
  const side = st.turn > 0 ? 'Blue' : 'Orange';
  let s;
  if (status === 'mate') s = `🏆 ${st.turn > 0 ? 'Orange' : 'Blue'} wins`;
  else if (status === 'stalemate' || status === 'draw') s = '🤝 Draw';
  else if (ui.thinking) s = '🤔 Thinking…';
  else if (game.mode === 'ai') s = st.turn > 0 ? (status === 'check' ? '⚠️ Check!' : '👆 Your move') : '🤖 Orange';
  else s = (status === 'check' ? '⚠️ Check! ' : '👆 ') + side;
  txt.textContent = s;
  const mb = $('#modeBtn'); mb.textContent = game.mode === 'ai' ? '🤖' : '👥';
  mb.setAttribute('aria-label', game.mode === 'ai' ? 'Mode: vs computer (tap for pass and play)' : 'Mode: pass and play (tap for vs computer)');
  $('#undoBtn').disabled = !game.moves.length;
  if (isOver()) showOver(s); else hideOver();
}
function showOver(s) { $('#overTxt').textContent = s + (status === 'mate' ? ' · checkmate' : status === 'stalemate' ? ' · stalemate' : ''); $('#over').hidden = false; }
function hideOver() { $('#over').hidden = true; }
const cellName = (s) => `<b>${RU.name(s)}</b><sup>${RU.Z(s) + 1}</sup>`;
function renderLog() {
  const log = $('#log');
  if (!game.moves.length) { log.innerHTML = '<span class="empty">🚀 → 🛰️</span>'; return; }
  const s = RU.fresh(); let html = '';
  game.moves.forEach((m, i) => {
    const f = m & 511, t = m >> 9, p = s.b[f], cap = s.b[t];
    const promo = Math.abs(p) === RU.P && RU.promoSq(p > 0 ? 1 : -1, t);
    RU.make(s, m); const chk = RU.inCheck(s, s.turn);
    html += `<span class="mv ${p > 0 ? 'b' : 'o'}"><em>${(i >> 1) + 1}</em>${RU.ICON[Math.abs(p)]}${cellName(t)}${cap ? '💥' + RU.ICON[Math.abs(cap)] : ''}${promo ? '→🛸' : ''}${chk ? '⚠️' : ''}</span>`;
  });
  log.innerHTML = html; log.scrollLeft = log.scrollWidth;
}
let toastT = 0;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 1800); }

$('#modeBtn').addEventListener('click', () => {
  game.mode = game.mode === 'ai' ? 'pass' : 'ai'; ui.token++; ui.thinking = false; save();
  toast(game.mode === 'ai' ? '🤖 vs computer · you are 🔵' : '👥 Pass & play'); renderTop(); maybeAi();
});
$('#undoBtn').addEventListener('click', undo); $('#overUndo').addEventListener('click', undo);
function armNew() {
  const b = $('#newBtn');
  if (!game.moves.length || isOver() || ui.armNew > performance.now()) { b.classList.remove('arm'); ui.armNew = 0; newGame(); toast('🆕 New game'); return; }
  ui.armNew = performance.now() + 3000; b.classList.add('arm'); toast('🆕 Tap again for a new game');
  setTimeout(() => { if (ui.armNew && performance.now() >= ui.armNew) { ui.armNew = 0; b.classList.remove('arm'); } }, 3100);
}
$('#newBtn').addEventListener('click', armNew); $('#overNew').addEventListener('click', () => { newGame(); });
$('#helpBtn').addEventListener('click', () => { $('#help').hidden = false; });
$('#helpClose').addEventListener('click', () => { $('#help').hidden = true; });
$('#help').addEventListener('click', (e) => { if (e.target.id === 'help') $('#help').hidden = true; });
$('#rotL').addEventListener('click', () => { dst.az -= Math.PI / 4; });
$('#rotR').addEventListener('click', () => { dst.az += Math.PI / 4; });
$('#zIn').addEventListener('click', () => { dst.dist = clamp(dst.dist / 1.25, 5, 90); });
$('#zOut').addEventListener('click', () => { dst.dist = clamp(dst.dist * 1.25, 5, 90); });
$('#home').addEventListener('click', () => { home(); });

// ------------------------------------------------------------------ gestures: 1 finger rotate, 2 fingers pinch, tap = pick
const ptrs = new Map(); let gest = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) gest = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0, multi: false };
  else if (gest) { gest.multi = true; const [a, b] = [...ptrs.values()]; gest.d0 = Math.hypot(a.x - b.x, a.y - b.y); gest.dist0 = dst.dist; }
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p || !gest) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  gest.moved = Math.max(gest.moved, Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0));
  if (ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (gest.d0 > 10) dst.dist = clamp(gest.dist0 * gest.d0 / Math.max(10, d), 5, 90); }
  else if (gest.moved > 8) { dst.az -= dx * 0.009; dst.el = clamp(dst.el + dy * 0.006, 0.05, 1.45); }
});
const endPtr = (e) => {
  if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
  if (ptrs.size === 0 && gest) { if (!gest.multi && gest.moved < 8 && performance.now() - gest.t0 < 600 && e.type === 'pointerup') onTap(e.clientX, e.clientY); gest = null; }
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); dst.dist = clamp(dst.dist * (e.deltaY > 0 ? 1.1 : 0.9), 5, 90); }, { passive: false });
canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (!e.target.closest('#help .bd, #log')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock(); let frames = 0;
function loop() {
  const dt = Math.min(0.1, clock.getDelta()), time = clock.elapsedTime; frames++;
  camUpdate(dt);
  for (const a of anims) {
    a.t = Math.min(1, a.t + dt / a.dur); const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
    if (a.die) { const s = 1.15 * (1 - a.t); a.g.scale.setScalar(Math.max(0.001, s)); a.g.rotation.y += dt * 12; if (a.t >= 1) shipRoot.remove(a.g); }
    else { a.g.position.lerpVectors(a.from, a.to, e); a.g.position.y += Math.sin(a.t * Math.PI) * 1.2; a.g.userData.base = a.to.y; if (a.t >= 1) a.g.position.copy(a.to); }
  }
  if (anims.length) anims = anims.filter((a) => a.t < 1);
  for (const g of ships.values()) if (!anims.some((a) => a.g === g)) g.position.y = g.userData.base + 0.04 + Math.sin(time * 2 + g.userData.phase) * 0.035;
  if (flashT < 1) { flashT += dt * 2.5; flash.material.opacity = Math.max(0, 0.8 * (1 - flashT)); flash.scale.setScalar(0.5 + flashT * 2); }
  selRing.rotation.z = time * 1.5; chkRing.scale.setScalar(1 + Math.sin(time * 6) * 0.08);
  hl.material.opacity = 0.65 + Math.sin(time * 4) * 0.2;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ boot + test hooks
rebuildShips(); renderLog(); resize(); Object.assign(view, dst); camUpdate(1);
if (game.mode === 'pass') { dst.az = view.az = st.turn > 0 ? 0 : Math.PI; }
requestAnimationFrame(loop); maybeAi();
window.APP = {
  get st() { return st; }, get game() { return game; }, get status() { return status; }, ui, view, dst, renderer,
  get frames() { return frames; }, get hlCount() { return hl.count; }, get shipCount() { return ships.size; },
  project, pick, select, focusLevel, home, saveNow: save, sq: RU.sq,
};
