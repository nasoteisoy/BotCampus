// Sector map: 2.5D node board. Drag to pan, pinch / wheel to zoom, tap a node to fly there.
// Pattern from parts-library galaxy-map-3d (node board + fly-to + selection rings), rebuilt for tap-to-move on phone + PC.
import * as THREE from 'three';
import { buildWorld, glowTex, toon } from './world.js';
import { Particles } from './particles.js';
import { iconImage } from './icons.js';
import { NODES, LINKS, ROUTES, SHIPS, NODE_ICON } from './data.js';
import { visibleSet, convoyNode, neighbors, FIELD_ROCKS, WRECK_BITS } from './state.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const NODE_COL = { station: '#7ff0ff', field: '#ffb067', wreck: '#c9d2e8', nest: '#ff5a64', beacon: '#9fc0f5' };

function discTex(iconName, ring, fill = '#ffffff', badge = null) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const draw = (img) => {
    g.clearRect(0, 0, 128, 128);
    g.beginPath(); g.arc(64, 64, 52, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = 9; g.strokeStyle = ring; g.stroke();
    g.lineWidth = 3; g.strokeStyle = '#13294b'; g.beginPath(); g.arc(64, 64, 57, 0, 7); g.stroke();
    if (img) g.drawImage(img, 30, 30, 68, 68);
    if (badge != null) {
      g.beginPath(); g.arc(100, 26, 22, 0, 7); g.fillStyle = '#ff5a64'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 28px Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(badge), 100, 27);
    }
    t.needsUpdate = true;
  };
  if (iconName) { const img = iconImage(iconName, '#13294b'); img.onload = () => draw(img); draw(null); } else draw(null);
  return t;
}
function labelTex(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = 'bold 34px Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#13294b'; g.strokeText(text, 128, 34); g.fillStyle = color; g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sprite = (map, sx, sy, att = false) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, sizeAttenuation: att }));
  s.scale.set(sx, sy, 1); s.renderOrder = 20; return s;
};

export function createMap(renderer, A, canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 9000);
  buildWorld(scene, null);
  const fx = new Particles(scene, 900, true, 1.4);
  const fxN = new Particles(scene, 500, false, 1.2);

  // sector floor: faint grid disc so the board reads as a board
  const grid = new THREE.PolarGridHelper(230, 12, 8, 96, 0x6f97ec, 0x3f5fc0);
  grid.material.transparent = true; grid.material.opacity = 0.28; grid.position.set(35, -8, 4); scene.add(grid);

  // soft nebula glows under the board for depth
  for (const [c, x, z, sz] of [[0xff6fd8, -60, -60, 260], [0x55e0ff, 120, 60, 300], [0x8a7dff, 40, -10, 380], [0xffa64d, 170, -80, 200]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: c, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(x, -90, z); sp.scale.setScalar(sz); sp.renderOrder = -1; scene.add(sp);
  }
  const unknownTex = discTex('help', '#9fc0f5', '#c9d8f5');

  // ---------- nodes ----------
  const nodeObjs = NODES.map((n) => {
    const g = new THREE.Group(); g.position.set(n.x, 0, n.z); scene.add(g);
    const o = { n, g, model: null, rocks: [], pick: null, ring: null, icon: null, label: null };
    const ringCol = new THREE.Color(NODE_COL[n.type]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.55, 8, 40), new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0.75 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -3; g.add(ring); o.ring = ring;
    if (n.type === 'station') {
      const s = A.make('station', 22); s.rotation.y = n.id * 0.7; s.rotation.x = 0.25; g.add(s); o.model = s;
      if (n.planet) { const p = (n.planet === 'ring' ? A.battle.planets.ring : A.battle.planets.blue).clone(); p.scale.setScalar(2.6); p.position.set(-17, -10, -14); g.add(p); o.planet = p; }
      o.label = sprite(labelTex(n.name, '#' + n.color.toString(16).padStart(6, '0')), 0.16, 0.04); o.label.position.y = -9; g.add(o.label);
    } else if (n.type === 'field' || n.type === 'wreck') {
      const cnt = n.type === 'field' ? FIELD_ROCKS : WRECK_BITS;
      if (n.type === 'wreck') { const w = A.make('wreck', 13); w.rotation.set(0.5, 1.2, 0.9); g.add(w); o.model = w; }
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * Math.PI * 2 + n.id, r = 9 + (i % 2) * 4;
        let m;
        if (n.type === 'field') { m = new THREE.Mesh(A.battle.rocks[i % 2], A.mat); m.scale.setScalar(0.55 + (i % 3) * 0.18); }
        else { m = A.make(i % 2 ? 'wreck' : 'pirate', 3.2 + (i % 3)); m.rotation.set(i, i * 2, i * 0.5); }
        const holder = new THREE.Group(); holder.position.set(Math.cos(a) * r, (i % 3) * 2 - 2, Math.sin(a) * r); holder.add(m); g.add(holder);
        const hit = new THREE.Mesh(new THREE.SphereGeometry(4.2, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData = { rock: i, node: n.id }; holder.add(hit);
        const mark = sprite(discTex(n.type === 'field' ? 'drill' : 'magnet', '#ffc83d', '#fff7d6'), 0.045, 0.045); mark.position.y = 5; mark.visible = false; holder.add(mark);
        o.rocks.push({ holder, m, hit, mark, spin: 0.2 + (i % 3) * 0.15, alive: true, popT: 0 });
      }
    } else if (n.type === 'nest') {
      const b = A.make('pirateboss', 15); g.add(b); o.model = b;
      o.guards = [0, 1, 2].map((i) => { const p = A.make('pirate', 5); g.add(p); return p; });
    } else {
      const b = new THREE.Mesh(new THREE.OctahedronGeometry(2.6), toon(0x9fc0f5, { emissive: 0x3d7dff, emissiveIntensity: 0.5 })); g.add(b); o.model = b;
    }
    const ic = n.type === 'beacon' ? null : NODE_ICON[n.type]; // jump points stay icon-free so the board is calm
    if (ic) { o.icon = sprite(discTex(ic, NODE_COL[n.type]), 0.06, 0.06); o.icon.position.y = 14; g.add(o.icon); }
    o.unknown = sprite(unknownTex, 0.035, 0.035); o.unknown.position.set(n.x, 0, n.z); o.unknown.material = o.unknown.material.clone(); o.unknown.material.opacity = 0.7; scene.add(o.unknown);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(13, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData = { node: n.id }; g.add(pick); o.pick = pick;
    return o;
  });

  // ---------- lanes ----------
  const routeKey = new Set(); for (const r of ROUTES) for (let i = 0; i < r.path.length - 1; i++) routeKey.add([r.path[i], r.path[i + 1]].sort((a, b) => a - b).join('-'));
  const laneMatN = new THREE.MeshBasicMaterial({ color: 0x9fc0f5, transparent: true, opacity: 0.55 });
  const laneMatT = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 });
  const laneMatHi = new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.95 });
  const lanes = LINKS.map(([a, b]) => {
    const A1 = NODES[a], B1 = NODES[b], trade = routeKey.has([a, b].sort((x, y) => x - y).join('-'));
    const len = Math.hypot(B1.x - A1.x, B1.z - A1.z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(trade ? 1.5 : 0.6, 0.2, len), trade ? laneMatT : laneMatN);
    m.position.set((A1.x + B1.x) / 2, -3, (A1.z + B1.z) / 2); m.rotation.y = Math.atan2(B1.x - A1.x, B1.z - A1.z);
    scene.add(m); return { a, b, m, trade, base: trade ? laneMatT : laneMatN };
  });
  // trade flow dots moving along the gold lanes
  const flowN = 60, flow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.75, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }), flowN);
  flow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(flow);
  const tradeLanes = lanes.filter((l) => l.trade);

  // ---------- carrier + fleet ----------
  const carrier = new THREE.Group(); scene.add(carrier);
  const cMesh = A.make('carrier', 17); carrier.add(cMesh);
  const cGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x7fe8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  cGlow.scale.setScalar(8); cGlow.position.set(0, 0, -8.5); carrier.add(cGlow);
  const youTex = discTex('ship', '#3ccf7a', '#e9fff1');
  const youIcon = sprite(youTex, 0.05, 0.05); youIcon.position.y = 9; carrier.add(youIcon);
  let escorts = [];
  const SLOT = [[-8, -6], [8, -6], [-14, -13], [14, -13], [0, -16], [-19, -3], [19, -3], [0, -24]];
  function setFleet(list) {
    for (const e of escorts) carrier.remove(e.g);
    escorts = list.map((id, i) => {
      const g = A.make(SHIPS[id].model, SHIPS[id].size * 3.2); const [x, z] = SLOT[i % SLOT.length];
      g.position.set(x, 0, z); carrier.add(g); return { g, x, z, ph: i * 1.3 };
    });
  }

  // ---------- convoys + raids ----------
  const raidTex = [];
  const convoys = ROUTES.map(() => {
    const g = new THREE.Group(); scene.add(g);
    const f = A.make('freighter', 8); g.add(f);
    const f2 = A.make('freighter', 6); f2.position.set(3.5, 1, -5); g.add(f2);
    const pir = [0, 1, 2].map(() => { const p = A.make('pirate', 3.6); g.add(p); return p; });
    const warn = sprite(discTex('swords', '#ff5a64', '#fff'), 0.065, 0.065); warn.position.y = 11; g.add(warn);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.7, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff5a64, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -2; g.add(ring);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(10, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); g.add(pick);
    return { g, f, pir, warn, ring, pick, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, raid: false, days: 0 };
  });
  const offsetFor = (i) => new THREE.Vector3(i % 2 ? 9 : -9, 2, i % 2 ? 9 : 11);

  // ---------- camera rig ----------
  const cam = { tx: NODES[0].x, tz: NODES[0].z, d: 150 };
  const camGoal = { tx: cam.tx, tz: cam.tz, d: cam.d };
  function placeCamera() {
    const portrait = camera.aspect < 1;
    const d = cam.d * (portrait ? 1.35 : 1);
    camera.position.set(cam.tx, d * 0.8, cam.tz + d * 0.62);
    camera.lookAt(cam.tx, 0, cam.tz + (portrait ? 6 : 0));
  }
  function focus(x, z, d) { camGoal.tx = x; camGoal.tz = z; if (d) camGoal.d = d; }

  // ---------- input: tap vs drag vs pinch ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const ptrs = new Map(); let drag = null, pinch0 = 0, tapCb = null, enabled = true, moved = 0;
  const worldPerPx = () => (cam.d * (camera.aspect < 1 ? 1.35 : 1) * 1.15) / innerHeight;
  canvas.addEventListener('pointerdown', (e) => {
    if (!enabled) return;
    canvas.setPointerCapture?.(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY }; moved = 0; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); moved = 99; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p || !enabled) return;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1 && drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 10) { const k = worldPerPx(); camGoal.tx -= dx * k; camGoal.tz -= dy * k * 1.3; cam.tx = camGoal.tx; cam.tz = camGoal.tz; clampCam(); }
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) { camGoal.d = THREE.MathUtils.clamp(camGoal.d * (pinch0 / d), 45, 300); cam.d = camGoal.d; } pinch0 = d;
    }
  });
  const up = (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
    if (ptrs.size === 0) {
      if (moved <= 10 && performance.now() - p.t0 < 700 && enabled) tap(e.clientX, e.clientY);
      drag = null;
    } else { const q = [...ptrs.values()][0]; drag = { x: q.x, y: q.y }; pinch0 = 0; }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); drag = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); camGoal.d = THREE.MathUtils.clamp(camGoal.d * (1 + Math.sign(e.deltaY) * 0.12), 45, 300); }, { passive: false });
  function clampCam() { camGoal.tx = THREE.MathUtils.clamp(camGoal.tx, -120, 190); camGoal.tz = THREE.MathUtils.clamp(camGoal.tz, -90, 100); }
  let harvestNode = -1;
  function tap(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (harvestNode >= 0) {
      const hits = ray.intersectObjects(nodeObjs[harvestNode].rocks.filter((k) => k.alive).map((k) => k.hit), false);
      if (hits.length) { tapCb && tapCb({ rock: hits[0].object.userData.rock, node: harvestNode }); return; }
    }
    const list = nodeObjs.filter((o) => o.g.visible).map((o) => o.pick);
    for (const c of convoys) if (c.g.visible && c.raid) list.push(c.pick);
    const hits = ray.intersectObjects(list, false);
    if (hits.length) {
      const o = hits[0].object;
      if (o.userData.node != null) tapCb && tapCb({ node: o.userData.node });
      else { const ci = convoys.findIndex((c) => c.pick === o); tapCb && tapCb({ convoy: ci }); }
    }
  }

  // ---------- sync from state ----------
  let S = null, vis = new Set();
  function sync(state, { snap = false } = {}) {
    S = state; vis = visibleSet(S);
    for (const o of nodeObjs) {
      o.g.visible = vis.has(o.n.id);
      o.unknown.visible = !o.g.visible;
      if (o.n.type === 'field' || o.n.type === 'wreck') {
        const left = S.fields[o.n.id];
        let alive = o.rocks.filter((k) => k.alive).length;
        for (const k of o.rocks) { if (alive < left && !k.alive) { k.alive = true; k.popT = 0; k.holder.visible = true; k.holder.scale.setScalar(1); alive++; } }
        for (let i = o.rocks.length - 1; i >= 0 && alive > left; i--) { const k = o.rocks[i]; if (k.alive) { k.alive = false; k.holder.visible = false; alive--; } }
        if (harvestNode === o.n.id) o.rocks.forEach((k) => { k.mark.visible = k.alive; });
      }
      if (o.n.type === 'nest') {
        const down = S.nests[o.n.id].down > 0;
        o.guards.forEach((p) => { p.visible = !down; });
        o.ring.material.color.set(down ? 0x8d97b0 : 0xff5a64);
      }
    }
    for (const l of lanes) l.m.visible = vis.has(l.a) && vis.has(l.b);
    S.convoys.forEach((c, i) => {
      const v = convoys[i], n = NODES[convoyNode(c)];
      const tgt = new THREE.Vector3(n.x, 0, n.z).add(offsetFor(i));
      if (snap || !v.init) { v.g.position.copy(tgt); v.from.copy(tgt); v.to.copy(tgt); v.t = 1; v.init = true; }
      else if (!v.to.equals(tgt)) { v.from.copy(v.g.position); v.to.copy(tgt); v.t = 0; }
      v.raid = !!c.raid; v.days = c.raid ? c.raid.days : 0;
      v.g.visible = vis.has(convoyNode(c));
      v.pir.forEach((p) => { p.visible = v.raid; }); v.warn.visible = v.raid; v.ring.visible = v.raid;
      if (v.raid) { const key = v.days; raidTex[key] = raidTex[key] || discTex('swords', '#ff5a64', '#fff', key); v.warn.material.map = raidTex[key]; }
    });
    setHighlights();
  }
  function setHighlights(pathNodes = null) {
    const nb = new Set(S ? neighbors(S.node) : []);
    const onPath = new Set(pathNodes || []);
    for (const o of nodeObjs) {
      o.hl = nb.has(o.n.id) ? 1 : 0; o.onPath = onPath.has(o.n.id);
    }
    const p = pathNodes ? [S.node, ...pathNodes] : [];
    const pk = new Set(); for (let i = 0; i < p.length - 1; i++) pk.add([p[i], p[i + 1]].sort((a, b) => a - b).join('-'));
    for (const l of lanes) l.m.material = pk.has([l.a, l.b].sort((x, y) => x - y).join('-')) ? laneMatHi : l.base;
  }
  const parkPos = (id) => new THREE.Vector3(NODES[id].x + 17, 5, NODES[id].z + 14);
  function placeCarrier(id) { carrier.position.copy(parkPos(id)); carrier.rotation.y = 0; }

  // one hop tween; resolves when the carrier arrives
  let hopT = null;
  function flyHop(from, to) {
    return new Promise((res) => {
      const a = parkPos(from), b = parkPos(to);
      hopT = { a, b, t: 0, dur: 0.85, res, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
      focus(b.x, b.z - 6);
    });
  }

  // ---------- effects ----------
  function burst(p, cols, n = 40, speed = 16, size = 2.2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, b = Math.random() * 3.14 - 1.57, s = speed * (0.4 + Math.random() * 0.8), c = cols[i % cols.length];
      fxN.spawn(p.x, p.y, p.z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s, Math.sin(a) * Math.cos(b) * s, 0.9 + Math.random() * 0.5, size, size * 0.4, c[0], c[1], c[2], 1, 1.2, 0);
    }
    for (let i = 0; i < 2; i++) fx.spawn(p.x, p.y, p.z, 0, 0, 0, 0.35 + i * 0.1, 8 + i * 5, 18 + i * 8, 1, 0.85, 0.55, 0.9, 0, 0);
  }
  function popRock(nodeId, idx) {
    const o = nodeObjs[nodeId], k = o.rocks[idx]; if (!k || !k.alive) return null;
    k.alive = false; k.popT = 0.25; k.mark.visible = false;
    const p = k.holder.getWorldPosition(new THREE.Vector3());
    burst(p, o.n.type === 'field' ? [[1, 0.62, 0.36], [1, 0.82, 0.54], [1, 1, 1]] : [[0.75, 0.8, 0.9], [1, 0.6, 0.25], [1, 1, 1]], 46, 18, 2.4);
    // chunks stream into the carrier's hold
    const c = carrier.position;
    for (let i = 0; i < 10; i++) fx.spawn(p.x, p.y, p.z, (c.x - p.x) * 1.6 + (Math.random() - 0.5) * 6, (c.y - p.y) * 1.6 + 4, (c.z - p.z) * 1.6 + (Math.random() - 0.5) * 6, 0.6, 1.4, 0.6, 1, 0.9, 0.5, 0.95, 0, 0);
    return p;
  }
  function harvest(nodeId) { // nodeId < 0 ends harvest mode
    if (harvestNode >= 0) nodeObjs[harvestNode].rocks.forEach((k) => { k.mark.visible = false; });
    harvestNode = nodeId;
    if (nodeId >= 0) { nodeObjs[nodeId].rocks.forEach((k) => { k.mark.visible = k.alive; }); const n = NODES[nodeId]; focus(n.x, n.z + 4, 70); }
  }
  // auto-resolve skirmish show at a node: laser flashes and pops, ~2.2 s
  let skirmish = null;
  function playSkirmish(at, win) {
    return new Promise((res) => {
      const p = at.clone(); focus(p.x, p.z, 80);
      skirmish = { p, t: 0, win, res, next: 0 };
    });
  }
  function rocksScreen(nodeId) { // read-only helper for the QA probe
    return nodeObjs[nodeId].rocks.map((k) => ({ alive: k.alive, ...toScreen(k.holder.getWorldPosition(new THREE.Vector3())) }));
  }
  function toScreen(v) { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, on: p.z < 1 }; }

  // ---------- per-frame ----------
  const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3();
  function update(dt, t) {
    // camera ease
    cam.tx += (camGoal.tx - cam.tx) * (1 - Math.exp(-5 * dt)); cam.tz += (camGoal.tz - cam.tz) * (1 - Math.exp(-5 * dt)); cam.d += (camGoal.d - cam.d) * (1 - Math.exp(-5 * dt));
    placeCamera();
    // nodes idle motion + legal-move pulse
    for (const o of nodeObjs) {
      if (!o.g.visible) continue;
      if (o.n.type === 'station') o.model.rotation.y += dt * 0.15;
      if (o.planet) o.planet.rotation.y += dt * 0.2;
      if (o.n.type === 'beacon') { o.model.rotation.y += dt; o.model.position.y = Math.sin(t * 2 + o.n.id) * 0.6; }
      if (o.n.type === 'nest') o.guards.forEach((p, i) => { const a = t * 0.6 + i * 2.1; p.position.set(Math.cos(a) * 12, 2 + i, Math.sin(a) * 12); p.rotation.y = -a; });
      const k = o.hl ? 1 + 0.12 * Math.sin(t * 5) : 1; o.ring.scale.setScalar(o.onPath ? 1.25 : k);
      o.ring.material.opacity = o.hl || o.onPath ? 0.95 : 0.45;
      for (const r of o.rocks) {
        if (r.alive) { r.m.rotation.x += dt * r.spin; r.m.rotation.y += dt * r.spin * 0.7; if (r.mark.visible) r.mark.scale.setScalar(0.045 * (1 + 0.15 * Math.sin(t * 6 + r.spin * 9)) * (camera.aspect < 1 ? 1.5 : 1)); }
        else if (r.popT > 0) { r.popT -= dt; r.holder.scale.setScalar(Math.max(0.01, r.popT / 0.25) * 1.3); if (r.popT <= 0) r.holder.visible = false; }
      }
      const sm = camera.aspect < 1 ? 1.5 : 1;
      if (o.icon) o.icon.scale.set(0.06 * sm, 0.06 * sm, 1);
      if (o.label) o.label.scale.set(0.16 * sm, 0.04 * sm, 1);
    }
    // trade flow
    let fi = 0;
    for (const l of tradeLanes) {
      if (!l.m.visible) continue;
      const a = NODES[l.a], b = NODES[l.b];
      for (let j = 0; j < 4 && fi < flowN; j++) { const u = (t * 0.12 + j / 4) % 1; tmpM.makeTranslation(a.x + (b.x - a.x) * u, -2.6, a.z + (b.z - a.z) * u); flow.setMatrixAt(fi++, tmpM); }
    }
    flow.count = fi; flow.instanceMatrix.needsUpdate = true;
    // convoys
    convoys.forEach((v, i) => {
      if (v.t < 1) { v.t = Math.min(1, v.t + dt / 1.1); v.g.position.lerpVectors(v.from, v.to, ease(v.t)); }
      if (v.raid) {
        v.pir.forEach((p, j) => { const a = t * 1.4 + j * 2.1; p.position.set(Math.cos(a) * 8, 3 + j, Math.sin(a) * 8); p.rotation.y = -a; });
        v.ring.scale.setScalar(1 + 0.15 * Math.sin(t * 6)); v.warn.scale.setScalar(0.065 * (1 + 0.12 * Math.sin(t * 7)) * (camera.aspect < 1 ? 1.5 : 1));
        if (Math.random() < 0.08) { const p = v.g.position; fx.spawn(p.x + (Math.random() - 0.5) * 10, p.y + 2, p.z + (Math.random() - 0.5) * 10, 0, 0, 0, 0.25, 2, 5, 1, 0.5, 0.4, 0.9, 0, 0); }
      }
      v.f.position.y = Math.sin(t * 1.5 + i) * 0.5;
    });
    // carrier hop + idle bob
    if (hopT) {
      hopT.t += dt / hopT.dur; const k = ease(Math.min(1, hopT.t));
      carrier.position.lerpVectors(hopT.a, hopT.b, k); carrier.position.y += Math.sin(k * Math.PI) * 3;
      carrier.rotation.y += (hopT.yaw - carrier.rotation.y) * Math.min(1, dt * 8);
      if (Math.random() < 0.9) { const e = tmpV.set(0, 0, -7).applyMatrix4(carrier.matrixWorld); fx.spawn(e.x, e.y, e.z, 0, 0, 0, 0.5, 1.6, 0.4, 0.5, 0.95, 1, 0.8, 0, 0); }
      if (hopT.t >= 1) { const r = hopT.res; hopT = null; r(); }
    } else carrier.rotation.y += (0 - carrier.rotation.y) * Math.min(1, dt * 2);
    cMesh.position.y = Math.sin(t * 1.2) * 0.4;
    cGlow.material.opacity = 0.7 + 0.3 * Math.sin(t * 7);
    youIcon.scale.setScalar(0.05 * (camera.aspect < 1 ? 1.5 : 1));
    for (const e of escorts) { e.g.position.y = Math.sin(t * 1.6 + e.ph) * 0.7; e.g.position.x = e.x + Math.sin(t * 0.7 + e.ph) * 0.6; }
    // skirmish show
    if (skirmish) {
      const s = skirmish; s.t += dt;
      if (s.t > s.next && s.t < 1.9) {
        s.next = s.t + 0.16;
        const q = tmpV.copy(s.p).add(new THREE.Vector3((Math.random() - 0.5) * 18, 2 + Math.random() * 4, (Math.random() - 0.5) * 18));
        const good = Math.random() < (s.win ? 0.7 : 0.35);
        burst(q, good ? [[1, 0.5, 0.4], [1, 0.85, 0.4], [1, 1, 1]] : [[0.5, 0.94, 1], [1, 1, 1]], 18, 10, 1.6);
        // laser streak from the carrier toward the fight
        const c = carrier.position; for (let i = 0; i < 6; i++) { const u = i / 6; fx.spawn(c.x + (q.x - c.x) * u, c.y + (q.y - c.y) * u, c.z + (q.z - c.z) * u, 0, 0, 0, 0.18, 1.2, 0.5, 0.6, 1, 1, 0.9, 0, 0); }
      }
      if (s.t > 2.3) { skirmish = null; s.res(); }
    }
    fx.update(dt); fxN.update(dt);
  }
  function render() { renderer.render(scene, camera); }
  function resize(w, h) { camera.aspect = w / h; camera.fov = w < h ? 55 : 42; camera.updateProjectionMatrix(); }
  function nodeScreen(id) { return toScreen(new THREE.Vector3(NODES[id].x, 0, NODES[id].z)); }
  function convoyScreen(i) { return toScreen(convoys[i].g.position); }

  return {
    scene, camera, update, render, resize, sync, setFleet, placeCarrier, flyHop, focus, harvest, popRock, playSkirmish, setHighlights, burst,
    onTap(cb) { tapCb = cb; }, setEnabled(v) { enabled = v; if (!v) { ptrs.clear(); drag = null; } },
    nodeScreen, convoyScreen, rocksScreen, get harvestNode() { return harvestNode; }, get camD() { return cam.d; },
    carrierPos: () => carrier.position.clone(), convoyPos: (i) => convoys[i].g.position.clone(), nodePos: (id) => new THREE.Vector3(NODES[id].x, 0, NODES[id].z),
    get calls() { return renderer.info.render.calls; },
  };
}
