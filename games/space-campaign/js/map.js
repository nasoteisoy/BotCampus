// Sector map: free flight. Tap anywhere in space and the carrier flies straight there; tap inside a location's bubble and it
// parks at the bubble's centre. Drag to pan, pinch / wheel to zoom (anchored under your fingers or the mouse).
// Pattern from parts-library galaxy-map-3d (board + fly-to + selection rings), rebuilt for free movement on phone + PC.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWorld, glowTex, toon } from './world.js';
import { Particles } from './particles.js';
import { iconImage } from './icons.js';
import { NODES, ROUTES, SHIPS, NODE_ICON, WORLD, OFFICER_MAX, OFFICER_COLORS } from './data.js';
import { visibleSet, convoyNode, officerRadius, FIELD_ROCKS, WRECK_BITS } from './state.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const NODE_COL = { station: '#7ff0ff', field: '#ffb067', wreck: '#c9d2e8', nest: '#ff5a64', beacon: '#9fc0f5' };
const ZOOM_MIN = 38, ZOOM_MAX = 640;

function canvasTex(size, draw, iconName, iconCol = '#13294b') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const paint = (img) => { g.clearRect(0, 0, size, size); draw(g, img); t.needsUpdate = true; };
  if (iconName) { const img = iconImage(iconName, iconCol); img.onload = () => paint(img); }
  paint(null); return t;
}
function discTex(iconName, ring, fill = '#ffffff', badge = null) {
  return canvasTex(128, (g, img) => {
    g.beginPath(); g.arc(64, 64, 52, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = 9; g.strokeStyle = ring; g.stroke();
    g.lineWidth = 3; g.strokeStyle = '#13294b'; g.beginPath(); g.arc(64, 64, 57, 0, 7); g.stroke();
    if (img) g.drawImage(img, 30, 30, 68, 68);
    if (badge != null) {
      g.beginPath(); g.arc(100, 26, 22, 0, 7); g.fillStyle = '#ff5a64'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 28px Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(badge), 100, 27);
    }
  }, iconName);
}
// officer portrait: cap icon in the officer's colour with rank chevrons under it (no reading needed)
export function officerTex(color, rank) {
  return canvasTex(128, (g, img) => {
    g.beginPath(); g.arc(64, 56, 46, 0, 7); g.fillStyle = color; g.fill(); g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
    if (img) g.drawImage(img, 30, 22, 68, 68);
    g.fillStyle = '#ffc83d'; g.strokeStyle = '#13294b'; g.lineWidth = 3; // one gold chevron per rank, side by side
    for (let i = 0; i <= rank; i++) { const y = 104, x = 64 + (i - rank / 2) * 22; g.beginPath(); g.moveTo(x - 10, y - 4); g.lineTo(x, y - 12); g.lineTo(x + 10, y - 4); g.lineTo(x + 10, y + 4); g.lineTo(x, y - 4); g.lineTo(x - 10, y + 4); g.closePath(); g.fill(); g.stroke(); }
  }, 'officer', '#ffffff');
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
const pickSphere = (r, data) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); m.userData = data; return m; };

export function createMap(renderer, A, canvas) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 9000);
  buildWorld(scene, null);
  const fx = new Particles(scene, 900, true, 1.4);
  const fxN = new Particles(scene, 500, false, 1.2);
  const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
  const CX = (WORLD.minX + WORLD.maxX) / 2, CZ = (WORLD.minZ + WORLD.maxZ) / 2;

  // sector floor: faint grid disc so the board reads as a board
  const grid = new THREE.PolarGridHelper(560, 16, 10, 96, 0x6f97ec, 0x3f5fc0);
  grid.material.transparent = true; grid.material.opacity = 0.22; grid.position.set(CX, -8, CZ); scene.add(grid);
  for (const [c, x, z, sz] of [[0xff6fd8, -180, -180, 650], [0x55e0ff, 360, 180, 750], [0x8a7dff, 120, -30, 950], [0xffa64d, 500, -240, 500]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: c, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(x, -120, z); sp.scale.setScalar(sz); sp.renderOrder = -1; scene.add(sp);
  }
  const unknownTex = discTex('help', '#9fc0f5', '#c9d8f5');

  // ---------- bubbles: one instanced rim + one instanced soft floor for every location ----------
  const rimMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.024, 6, 64), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 }), NODES.length);
  const floorMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.13, depthWrite: false }), NODES.length);
  for (const m of [rimMesh, floorMesh]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }

  // ---------- locations ----------
  const nodeObjs = NODES.map((n) => {
    const g = new THREE.Group(); g.position.set(n.x, 0, n.z); scene.add(g);
    const o = { n, g, model: null, rocks: [], back: -n.r * 0.6, col: new THREE.Color(NODE_COL[n.type]), hl: 0, seen: true };
    // the location's own model sits at the back of its bubble so the carrier can park in the middle
    if (n.type === 'station') {
      const s = A.make('station', 22); s.rotation.y = n.id * 0.7; s.rotation.x = 0.25; s.position.z = o.back; g.add(s); o.model = s;
      if (n.planet) { const p = (n.planet === 'ring' ? A.battle.planets.ring : A.battle.planets.blue).clone(); p.scale.setScalar(2.6); p.position.set(-24, -12, o.back - 18); g.add(p); o.planet = p; }
      o.label = sprite(labelTex(n.name, '#' + n.color.toString(16).padStart(6, '0')), 0.16, 0.04); o.label.center.set(0.5, -0.45); o.label.position.set(0, 18, o.back); g.add(o.label); // just above the icon
    } else if (n.type === 'field' || n.type === 'wreck') {
      const cnt = n.type === 'field' ? FIELD_ROCKS : WRECK_BITS;
      if (n.type === 'wreck') { const w = A.make('wreck', 13); w.rotation.set(0.5, 1.2, 0.9); w.position.z = o.back; g.add(w); o.model = w; }
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * Math.PI * 2 + n.id, r = n.r * (0.55 + (i % 2) * 0.2);
        let m;
        if (n.type === 'field') { m = new THREE.Mesh(A.battle.rocks[i % 2], A.mat); m.scale.setScalar(0.6 + (i % 3) * 0.2); }
        else { m = A.make(i % 2 ? 'wreck' : 'pirate', 3.4 + (i % 3)); m.rotation.set(i, i * 2, i * 0.5); }
        const holder = new THREE.Group(); holder.position.set(Math.cos(a) * r, (i % 3) * 2 - 2, Math.sin(a) * r); holder.add(m); g.add(holder);
        const hit = pickSphere(5, { rock: i, node: n.id }); holder.add(hit);
        const mark = sprite(discTex(n.type === 'field' ? 'drill' : 'magnet', '#ffc83d', '#fff7d6'), 0.045, 0.045); mark.position.y = 5; mark.visible = false; holder.add(mark);
        o.rocks.push({ holder, m, hit, mark, spin: 0.2 + (i % 3) * 0.15, alive: true, popT: 0 });
      }
    } else if (n.type === 'nest') {
      const b = A.make('pirateboss', 16); b.position.z = o.back; g.add(b); o.model = b;
      o.guards = [0, 1, 2].map(() => { const p = A.make('pirate', 5); g.add(p); return p; });
    } else {
      const b = new THREE.Mesh(new THREE.OctahedronGeometry(3), toon(0x9fc0f5, { emissive: 0x3d7dff, emissiveIntensity: 0.5 })); b.position.z = o.back; g.add(b); o.model = b;
    }
    const ic = n.type === 'beacon' ? null : NODE_ICON[n.type]; // jump points stay icon-free so the board is calm
    if (ic) { o.icon = sprite(discTex(ic, NODE_COL[n.type]), 0.06, 0.06); o.icon.position.set(0, 18, o.back); g.add(o.icon); }
    o.unknown = sprite(unknownTex, 0.035, 0.035); o.unknown.position.set(n.x, 0, n.z); o.unknown.material = o.unknown.material.clone(); o.unknown.material.opacity = 0.7; scene.add(o.unknown);
    o.pick = pickSphere(n.r, { node: n.id }); g.add(o.pick);
    return o;
  });

  // ---------- trade lanes (convoys only): one merged mesh + one instanced flow ----------
  const segs = []; for (const r of ROUTES) for (let i = 0; i < r.path.length - 1; i++) segs.push([NODES[r.path[i]], NODES[r.path[i + 1]]]);
  const laneGeo = mergeGeometries(segs.map(([a, b]) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z), geo = new THREE.BoxGeometry(2.2, 0.2, len);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(b.x - a.x, b.z - a.z)).setPosition((a.x + b.x) / 2, -4, (a.z + b.z) / 2)); return geo;
  }));
  scene.add(new THREE.Mesh(laneGeo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.75 })));
  const flowN = segs.length * 6, flow = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }), flowN);
  flow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); flow.frustumCulled = false; scene.add(flow);

  // ---------- carrier, escorts and its idle air wing ----------
  const carrier = new THREE.Group(); scene.add(carrier);
  const cMesh = A.make('carrier', 17); carrier.add(cMesh);
  const cGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x7fe8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  cGlow.scale.setScalar(8); cGlow.position.set(0, 0, -8.5); carrier.add(cGlow);
  const youIcon = sprite(discTex('ship', '#3ccf7a', '#e9fff1'), 0.05, 0.05); youIcon.position.y = 10; carrier.add(youIcon);
  let escorts = [];
  // escort slots sit around the hull so the whole group is centred on the parking spot
  const SLOT = [[-9, 3], [9, 3], [-13, -4], [13, -4], [0, -8], [-17, 9], [17, 9], [0, 14]];
  function setFleet(list) {
    for (const e of escorts) carrier.remove(e.g);
    escorts = list.slice(0, SLOT.length).map((id, i) => {
      const g = A.make(SHIPS[id].model, SHIPS[id].size * 3); const [x, z] = SLOT[i];
      g.position.set(x, 0, z); carrier.add(g); return { g, x, z, ph: i * 1.3 };
    });
    wingN = Math.min(WING_MAX, 3 + list.filter((id) => id === 'fighter' || id === 'bomber').length * 2 + list.filter((id) => id === 'carrier').length * 3);
  }
  // fighters flying loops around the carrier (one instanced draw)
  const WING_MAX = 12; let wingN = 3;
  const fgeo = A.geos.fighter, fbb = fgeo.boundingBox, fScale = 3 / Math.max(fbb.max.x - fbb.min.x, fbb.max.z - fbb.min.z);
  const wing = new THREE.InstancedMesh(fgeo, A.mat, WING_MAX); wing.instanceMatrix.setUsage(THREE.DynamicDrawUsage); wing.frustumCulled = false; scene.add(wing);
  const wingPos = Array.from({ length: WING_MAX }, () => new THREE.Vector3());

  // ---------- officer fleets ----------
  const officerObjs = Array.from({ length: OFFICER_MAX }, (_, i) => {
    const g = new THREE.Group(); g.visible = false; scene.add(g);
    const col = new THREE.Color(OFFICER_COLORS[i]);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 96), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = -3; g.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -3.5; g.add(floor);
    const ships = new THREE.Group(); g.add(ships);
    const badge = sprite(null, 0.055, 0.055); badge.position.y = 16; ships.add(badge);
    const pick = pickSphere(16, { officer: i }); ships.add(pick);
    return { g, rim, floor, ships, badge, pick, models: [], key: '', rank: -1, fly: null, post: null };
  });

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
    const pick = pickSphere(12, {}); g.add(pick);
    return { g, f, pir, warn, ring, pick, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, raid: false, days: 0 };
  });
  // convoys wait at the edge of a location's bubble (the centre is the carrier's parking spot)
  const convoySpot = (i, n) => { const a = 0.7 + i * 1.7; return new THREE.Vector3(n.x + Math.cos(a) * n.r * 0.62, 2, n.z + Math.sin(a) * n.r * 0.62); };

  // ---------- flight target marker ----------
  const marker = new THREE.Mesh(new THREE.TorusGeometry(6, 0.6, 6, 40), new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.9 }));
  marker.rotation.x = -Math.PI / 2; marker.visible = false; scene.add(marker);
  const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: 0x7dffb0, dashSize: 6, gapSize: 4 }));
  trail.visible = false; trail.frustumCulled = false; scene.add(trail);

  // ---------- camera rig ----------
  const cam = { tx: NODES[0].x, tz: NODES[0].z, d: 150 };
  const camGoal = { tx: cam.tx, tz: cam.tz, d: cam.d };
  function placeCamera() {
    const portrait = camera.aspect < 1, d = cam.d * (portrait ? 1.35 : 1);
    camera.position.set(cam.tx, d * 0.8, cam.tz + d * 0.62);
    camera.lookAt(cam.tx, 0, cam.tz); camera.updateMatrixWorld();
  }
  function focus(x, z, d) { camGoal.tx = x; camGoal.tz = z; if (d) camGoal.d = THREE.MathUtils.clamp(d, ZOOM_MIN, ZOOM_MAX); clampCam(); }
  function clampCam() { camGoal.tx = THREE.MathUtils.clamp(camGoal.tx, WORLD.minX, WORLD.maxX); camGoal.tz = THREE.MathUtils.clamp(camGoal.tz, WORLD.minZ, WORLD.maxZ); }

  // ---------- input: tap vs drag vs pinch, all anchored to the ground under the pointer ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function groundAt(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(ground, new THREE.Vector3());
  }
  const snapCam = () => { cam.tx = camGoal.tx; cam.tz = camGoal.tz; cam.d = camGoal.d; placeCamera(); };
  function zoomAt(x, y, f) { // zoom keeping the point under (x, y) fixed
    snapCam(); const a = groundAt(x, y);
    camGoal.d = THREE.MathUtils.clamp(camGoal.d * f, ZOOM_MIN, ZOOM_MAX); snapCam();
    const b = groundAt(x, y); if (a && b) { camGoal.tx += a.x - b.x; camGoal.tz += a.z - b.z; clampCam(); snapCam(); }
  }
  const ptrs = new Map(); let drag = null, pinch0 = 0, tapCb = null, enabled = true, moved = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (!enabled) return;
    canvas.setPointerCapture?.(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, t0: performance.now() });
    if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY }; moved = 0; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); moved = 99; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p || !enabled) return;
    const px = p.x, py = p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1 && drag) {
      moved += Math.abs(e.clientX - px) + Math.abs(e.clientY - py);
      if (moved > 10) { snapCam(); const a = groundAt(px, py), b = groundAt(e.clientX, e.clientY); if (a && b) { camGoal.tx += a.x - b.x; camGoal.tz += a.z - b.z; clampCam(); snapCam(); } }
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0 && d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch0 / d); pinch0 = d;
    }
  });
  const up = (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
    if (ptrs.size === 0) { if (moved <= 10 && performance.now() - p.t0 < 700 && enabled) tap(e.clientX, e.clientY); drag = null; }
    else { const q = [...ptrs.values()][0]; drag = { x: q.x, y: q.y }; pinch0 = 0; }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); drag = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (enabled) zoomAt(e.clientX, e.clientY, 1 + Math.sign(e.deltaY) * 0.14); }, { passive: false });
  let harvestNode = -1;
  function tap(x, y) {
    const gp = groundAt(x, y); // also sets the ray
    if (harvestNode >= 0) {
      const hits = ray.intersectObjects(nodeObjs[harvestNode].rocks.filter((k) => k.alive).map((k) => k.hit), false);
      if (hits.length) { tapCb && tapCb({ rock: hits[0].object.userData.rock, node: harvestNode }); return; }
      return;
    }
    const raidPicks = convoys.filter((c) => c.g.visible && c.raid).map((c) => c.pick);
    const offPicks = officerObjs.filter((o) => o.g.visible).map((o) => o.pick);
    let hits = ray.intersectObjects([...raidPicks, ...offPicks], false);
    if (hits.length) {
      const u = hits[0].object.userData;
      if (u.officer != null) { tapCb && tapCb({ officer: u.officer, ground: gp && { x: gp.x, z: gp.z } }); return; }
      tapCb && tapCb({ convoy: convoys.findIndex((c) => c.pick === hits[0].object), ground: gp && { x: gp.x, z: gp.z } }); return;
    }
    hits = ray.intersectObjects(nodeObjs.filter((o) => o.seen).map((o) => o.pick), false);
    if (hits.length) { tapCb && tapCb({ node: hits[0].object.userData.node, ground: gp && { x: gp.x, z: gp.z } }); return; }
    if (gp) tapCb && tapCb({ ground: { x: gp.x, z: gp.z } });
  }

  // ---------- sync from state ----------
  let S = null, vis = new Set();
  function sync(state, { snap = false } = {}) {
    S = state; vis = visibleSet(S);
    for (const o of nodeObjs) {
      o.seen = vis.has(o.n.id); o.g.visible = o.seen; o.unknown.visible = !o.seen;
      if (o.n.type === 'field' || o.n.type === 'wreck') {
        const left = S.fields[o.n.id];
        let alive = o.rocks.filter((k) => k.alive).length;
        for (const k of o.rocks) { if (alive < left && !k.alive) { k.alive = true; k.popT = 0; k.holder.visible = true; k.holder.scale.setScalar(1); alive++; } }
        for (let i = o.rocks.length - 1; i >= 0 && alive > left; i--) { const k = o.rocks[i]; if (k.alive) { k.alive = false; k.holder.visible = false; alive--; } }
        if (harvestNode === o.n.id) o.rocks.forEach((k) => { k.mark.visible = k.alive; });
      }
      o.col.set(NODE_COL[o.n.type]);
      if (o.n.type === 'nest') { const down = S.nests[o.n.id].down > 0; o.guards.forEach((p) => { p.visible = !down; }); if (down) o.col.set(0x8d97b0); }
    }
    S.convoys.forEach((c, i) => {
      const v = convoys[i], tgt = convoySpot(i, NODES[convoyNode(c)]);
      if (snap || !v.init) { v.g.position.copy(tgt); v.from.copy(tgt); v.to.copy(tgt); v.t = 1; v.init = true; }
      else if (!v.to.equals(tgt)) { v.from.copy(v.g.position); v.to.copy(tgt); v.t = 0; }
      v.raid = !!c.raid; v.days = c.raid ? c.raid.days : 0;
      v.g.visible = vis.has(convoyNode(c));
      v.pir.forEach((p) => { p.visible = v.raid; }); v.warn.visible = v.raid; v.ring.visible = v.raid;
      if (v.raid) { const key = v.days; raidTex[key] = raidTex[key] || discTex('swords', '#ff5a64', '#fff', key); v.warn.material.map = raidTex[key]; }
    });
    syncOfficers(snap);
  }
  function syncOfficers(snap) {
    officerObjs.forEach((ob, i) => {
      const o = S && S.officers[i];
      const posted = !!(o && o.post && o.ships.length);
      if (!posted) { ob.g.visible = false; ob.post = null; return; }
      const r = officerRadius(o); ob.rim.scale.setScalar(r); ob.floor.scale.setScalar(r);
      if (ob.rank !== o.rank) { ob.badge.material.map = officerTex(OFFICER_COLORS[i], o.rank); ob.badge.material.needsUpdate = true; ob.rank = o.rank; }
      const key = o.ships.join(',');
      if (ob.key !== key) {
        for (const m of ob.models) ob.ships.remove(m.g);
        ob.models = o.ships.map((id, k) => { const g = A.make(SHIPS[id].model, SHIPS[id].size * 3); ob.ships.add(g); return { g, a: k * (Math.PI * 2 / o.ships.length), r: 9 + (k % 2) * 5 }; });
        ob.key = key;
      }
      const tgt = new THREE.Vector3(o.post.x, 0, o.post.z);
      if (!ob.post || !ob.post.equals(tgt)) {
        if (snap || !ob.g.visible) { ob.g.position.copy(tgt); ob.ships.position.set(0, 4, 0); if (!snap) { ob.fly = { a: carrier.position.clone().sub(tgt), t: 0 }; } }
        else { ob.fly = { a: ob.g.position.clone().sub(tgt), t: 0 }; ob.g.position.copy(tgt); }
        ob.post = tgt.clone();
      }
      ob.g.visible = true;
    });
  }
  const parkY = 2;
  function placeCarrier(pos) { carrier.position.set(pos.x, parkY, pos.z); carrier.rotation.y = 0; }

  // straight flight; time on screen grows with distance (a long trip still takes under ~2.4 s)
  let hopT = null;
  function flyTo(x, z) {
    return new Promise((res) => {
      const a = carrier.position.clone(), b = new THREE.Vector3(x, parkY, z), d = a.distanceTo(b);
      hopT = { a, b, t: 0, dur: THREE.MathUtils.clamp(0.45 + d / 160, 0.5, 2.4), res, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
      marker.position.set(x, -2.5, z); marker.visible = true;
      trail.geometry.setFromPoints([a.clone().setY(-2), b.clone().setY(-2)]); trail.computeLineDistances(); trail.visible = true;
      focus(x, z);
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
    const c = carrier.position; // chunks stream into the carrier's hold
    for (let i = 0; i < 10; i++) fx.spawn(p.x, p.y, p.z, (c.x - p.x) * 1.6 + (Math.random() - 0.5) * 6, (c.y - p.y) * 1.6 + 4, (c.z - p.z) * 1.6 + (Math.random() - 0.5) * 6, 0.6, 1.4, 0.6, 1, 0.9, 0.5, 0.95, 0, 0);
    return p;
  }
  function harvest(nodeId) { // nodeId < 0 ends harvest mode
    if (harvestNode >= 0) nodeObjs[harvestNode].rocks.forEach((k) => { k.mark.visible = false; });
    harvestNode = nodeId;
    if (nodeId >= 0) { nodeObjs[nodeId].rocks.forEach((k) => { k.mark.visible = k.alive; }); const n = NODES[nodeId]; focus(n.x, n.z + 4, 95); }
  }
  // auto-resolve skirmish show: laser flashes and pops, ~2.2 s (from = who shoots: the carrier, or an officer fleet)
  let skirmish = null;
  function playSkirmish(at, win, from = null) {
    return new Promise((res) => { const p = at.clone(); focus(p.x, p.z, 110); skirmish = { p, t: 0, win, res, next: 0, from: from ? from.clone() : null }; });
  }
  function toScreen(v) { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, on: p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 }; }

  // ---------- per-frame ----------
  function update(dt, t) {
    const k5 = 1 - Math.exp(-5 * dt);
    cam.tx += (camGoal.tx - cam.tx) * k5; cam.tz += (camGoal.tz - cam.tz) * k5; cam.d += (camGoal.d - cam.d) * k5;
    placeCamera();
    const far = cam.d > 360; // zoomed far out: skip the small idle details
    const sm = camera.aspect < 1 ? 1.5 : 1, here = S ? S.node : -1;
    NODES.forEach((n, i) => {
      const o = nodeObjs[i], s = o.seen ? n.r * (i === here ? 1 + 0.03 * Math.sin(t * 3) : 1) : 0;
      tmpM.compose(tmpV.set(n.x, -3, n.z), tmpQ.setFromEuler(tmpE.set(-Math.PI / 2, 0, 0)), tmpS.set(s, s, s));
      rimMesh.setMatrixAt(i, tmpM); rimMesh.setColorAt(i, tmpC.copy(o.col).multiplyScalar(i === here ? 1.15 : 0.9));
      tmpM.compose(tmpV.set(n.x, -3.6, n.z), tmpQ, tmpS); floorMesh.setMatrixAt(i, tmpM); floorMesh.setColorAt(i, o.col);
      if (!o.seen) return;
      if (n.type === 'station') o.model.rotation.y += dt * 0.15;
      if (o.planet) o.planet.rotation.y += dt * 0.2;
      if (n.type === 'beacon') { o.model.rotation.y += dt; o.model.position.y = Math.sin(t * 2 + n.id) * 0.6; }
      if (n.type === 'nest' && !far) o.guards.forEach((p, j) => { const a = t * 0.5 + j * 2.1; p.position.set(Math.cos(a) * n.r * 0.72, 2 + j, Math.sin(a) * n.r * 0.72); p.rotation.y = -a; });
      for (const r of o.rocks) {
        if (r.alive) { if (!far) { r.m.rotation.x += dt * r.spin; r.m.rotation.y += dt * r.spin * 0.7; } if (r.mark.visible) r.mark.scale.setScalar(0.045 * (1 + 0.15 * Math.sin(t * 6 + r.spin * 9)) * sm); }
        else if (r.popT > 0) { r.popT -= dt; r.holder.scale.setScalar(Math.max(0.01, r.popT / 0.25) * 1.3); if (r.popT <= 0) r.holder.visible = false; }
      }
      if (o.icon) o.icon.scale.set(0.06 * sm, 0.06 * sm, 1);
      if (o.label) o.label.scale.set(0.16 * sm, 0.04 * sm, 1);
    });
    rimMesh.instanceMatrix.needsUpdate = floorMesh.instanceMatrix.needsUpdate = true;
    rimMesh.instanceColor.needsUpdate = floorMesh.instanceColor.needsUpdate = true;
    // trade flow
    let fi = 0;
    for (const [a, b] of segs) for (let j = 0; j < 6; j++) { const u = (t * 0.06 + j / 6) % 1; tmpM.makeTranslation(a.x + (b.x - a.x) * u, -3.6, a.z + (b.z - a.z) * u); flow.setMatrixAt(fi++, tmpM); }
    flow.count = fi; flow.instanceMatrix.needsUpdate = true;
    // convoys
    convoys.forEach((v, i) => {
      if (v.t < 1) { v.t = Math.min(1, v.t + dt / 1.4); v.g.position.lerpVectors(v.from, v.to, ease(v.t)); }
      if (v.raid) {
        v.pir.forEach((p, j) => { const a = t * 1.4 + j * 2.1; p.position.set(Math.cos(a) * 8, 3 + j, Math.sin(a) * 8); p.rotation.y = -a; });
        v.ring.scale.setScalar(1 + 0.15 * Math.sin(t * 6)); v.warn.scale.setScalar(0.065 * (1 + 0.12 * Math.sin(t * 7)) * sm);
        if (Math.random() < 0.08) { const p = v.g.position; fx.spawn(p.x + (Math.random() - 0.5) * 10, p.y + 2, p.z + (Math.random() - 0.5) * 10, 0, 0, 0, 0.25, 2, 5, 1, 0.5, 0.4, 0.9, 0, 0); }
      }
      v.f.position.y = Math.sin(t * 1.5 + i) * 0.5;
    });
    // carrier flight + idle bob
    if (hopT) {
      hopT.t += dt / hopT.dur; const k = ease(Math.min(1, hopT.t));
      carrier.position.lerpVectors(hopT.a, hopT.b, k); carrier.position.y += Math.sin(k * Math.PI) * 3;
      carrier.rotation.y += (hopT.yaw - carrier.rotation.y) * Math.min(1, dt * 8);
      if (Math.random() < 0.9) { const e = tmpV.set(0, 0, -7).applyMatrix4(carrier.matrixWorld); fx.spawn(e.x, e.y, e.z, 0, 0, 0, 0.5, 1.6, 0.4, 0.5, 0.95, 1, 0.8, 0, 0); }
      camGoal.tx = carrier.position.x; camGoal.tz = carrier.position.z;
      if (hopT.t >= 1) { const r = hopT.res; hopT = null; marker.visible = false; trail.visible = false; r(); }
    } else carrier.rotation.y += (0 - carrier.rotation.y) * Math.min(1, dt * 2);
    if (marker.visible) marker.scale.setScalar(1 + 0.2 * Math.sin(t * 8));
    cMesh.position.y = Math.sin(t * 1.2) * 0.4;
    cGlow.material.opacity = 0.7 + 0.3 * Math.sin(t * 7);
    youIcon.scale.setScalar(0.05 * sm);
    for (const e of escorts) { e.g.position.y = Math.sin(t * 1.6 + e.ph) * 0.7; e.g.position.x = e.x + Math.sin(t * 0.7 + e.ph) * 0.6; }
    // air wing: loops around the carrier, banked into the turn
    wing.visible = !far; wing.count = wingN;
    if (!far) for (let i = 0; i < wingN; i++) {
      const dir = i % 2 ? 1 : -1, r = 15 + (i % 3) * 5, w = (0.55 + (i % 4) * 0.08) * dir, a = t * w + i * 2.4;
      const c = carrier.position, y = c.y + 6 + (i % 3) * 2.5 + Math.sin(t * 1.3 + i) * 1.2;
      wingPos[i].set(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r * 0.8);
      const vx = -Math.sin(a) * w, vz = Math.cos(a) * w * 0.8;
      tmpQ.setFromEuler(tmpE.set(0, Math.atan2(vx, vz) + Math.PI, -0.5 * dir, 'YXZ'));
      wing.setMatrixAt(i, tmpM.compose(wingPos[i], tmpQ, tmpS.setScalar(fScale)));
    }
    wing.instanceMatrix.needsUpdate = true;
    // officer fleets: fly out to their post, then circle it
    for (const ob of officerObjs) {
      if (!ob.g.visible) continue;
      if (ob.fly) { ob.fly.t = Math.min(1, ob.fly.t + dt / 1.3); ob.ships.position.copy(ob.fly.a).multiplyScalar(1 - ease(ob.fly.t)).setY(4); if (ob.fly.t >= 1) ob.fly = null; }
      ob.rim.material.opacity = 0.6 + 0.25 * Math.sin(t * 2.5);
      ob.badge.scale.setScalar(0.055 * sm);
      for (const m of ob.models) { const a = m.a + t * 0.35; m.g.position.set(Math.cos(a) * m.r, Math.sin(t * 1.4 + m.a) * 0.8, Math.sin(a) * m.r); m.g.rotation.y = -a; }
    }
    // skirmish show
    if (skirmish) {
      const s = skirmish; s.t += dt;
      if (s.t > s.next && s.t < 1.9) {
        s.next = s.t + 0.16;
        const q = tmpV.copy(s.p).add(new THREE.Vector3((Math.random() - 0.5) * 18, 2 + Math.random() * 4, (Math.random() - 0.5) * 18));
        const good = Math.random() < (s.win ? 0.7 : 0.35);
        burst(q, good ? [[1, 0.5, 0.4], [1, 0.85, 0.4], [1, 1, 1]] : [[0.5, 0.94, 1], [1, 1, 1]], 18, 10, 1.6);
        const c = s.from || carrier.position; for (let i = 0; i < 6; i++) { const u = i / 6; fx.spawn(c.x + (q.x - c.x) * u, c.y + (q.y - c.y) * u, c.z + (q.z - c.z) * u, 0, 0, 0, 0.18, 1.2, 0.5, 0.6, 1, 1, 0.9, 0, 0); }
      }
      if (s.t > 2.3) { skirmish = null; s.res(); }
    }
    fx.update(dt); fxN.update(dt);
  }
  function render() { renderer.render(scene, camera); }
  function resize(w, h) { camera.aspect = w / h; camera.fov = w < h ? 55 : 42; camera.updateProjectionMatrix(); }

  // read-only helpers for the QA probe (screen positions of things)
  const P3 = (x, y, z) => toScreen(new THREE.Vector3(x, y, z));
  return {
    scene, camera, update, render, resize, sync, setFleet, placeCarrier, flyTo, focus, harvest, popRock, playSkirmish, burst,
    onTap(cb) { tapCb = cb; }, setEnabled(v) { enabled = v; if (!v) { ptrs.clear(); drag = null; } },
    get harvestNode() { return harvestNode; }, get camD() { return cam.d; }, get flying() { return !!hopT; },
    carrierPos: () => carrier.position.clone(), convoyPos: (i) => convoys[i].g.position.clone(), nodePos: (id) => new THREE.Vector3(NODES[id].x, 0, NODES[id].z),
    officerPos: (i) => officerObjs[i].g.position.clone(),
    nodeScreen: (id) => ({ ...P3(NODES[id].x, 0, NODES[id].z), edge: P3(NODES[id].x + NODES[id].r, 0, NODES[id].z) }),
    convoyScreen: (i) => toScreen(convoys[i].g.position),
    carrierScreen: () => toScreen(carrier.position),
    officerScreen: (i) => ({ visible: officerObjs[i].g.visible, ...toScreen(officerObjs[i].ships.getWorldPosition(new THREE.Vector3())) }),
    wingScreen: () => wingPos.slice(0, wing.visible ? wingN : 0).map((p) => toScreen(p)),
    rocksScreen: (id) => nodeObjs[id].rocks.map((k) => ({ alive: k.alive, ...toScreen(k.holder.getWorldPosition(new THREE.Vector3())) })),
    worldScreen: (x, z) => P3(x, 0, z),
    get calls() { return renderer.info.render.calls; },
  };
}
