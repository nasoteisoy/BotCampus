// Map: 280 x 280 terrain with regions (city, forest, river + bridges + ford, hill, farmland, roads).
// Also 2D collision helpers on the XZ plane and fast terrain queries.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HALF = 140;
export const WATER_Y = -0.45;
export const RIVER_HW = 8;
export const obstacles = [];      // {type:'circle'|'box', x,z, r | hx,hz, h, base}
export const CITY = { x: -62, z: 82, half: 53 };
export const FARM = { x0: 25, x1: 137, z0: 52, z1: 137 };
export const HILL = { x: 80, z: -78 };
export function riverZ(x) { return 2 + 8 * Math.sin(x / 40 + 1) + 3 * Math.sin(x / 13); }
export const BRIDGES = [-70, 15, 95].map((x) => ({ x, z: riverZ(x), hw: 5.5, hl: 15 }));
export const FORD = { x: 55, hw: 7 };
export const ROADS = [
  [[20, -142], [20, -60], [15, -30], [15, 35], [5, 60], [5, 142]],
  [[-14, 44], [142, 44]],
  [[-70, 29], [-70, -22], [-62, -40], [-75, -80], [-95, -142]],
  [[-62, -40], [20, -50], [70, -35], [95, -22], [95, 26], [95, 44]],
  [[48, 44], [48, 57]],
  [[55, 44], [55, 15]],
  [[55, -6], [50, -37]],
];
const ROAD_HW = 3.6;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- analytic terrain ----------
export function waterClass(x, z) { // 0 land, 1 deep, 2 ford, 3 bridge
  for (const b of BRIDGES) if (Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hl) return 3;
  if (Math.abs(z - riverZ(x)) >= RIVER_HW) return 0;
  return Math.abs(x - FORD.x) < FORD.hw ? 2 : 1;
}
function inRect(x, z, x0, x1, z0, z1, pad) { // 1 inside, fades to 0 over pad outside
  const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
  return 1 - smooth(0, pad, Math.hypot(dx, dz));
}
function hillH(x, z) {
  const dx = x - HILL.x, dz = z - HILL.z, a = 0.5, u = dx * Math.cos(a) + dz * Math.sin(a), v = -dx * Math.sin(a) + dz * Math.cos(a);
  return 14 * Math.exp(-(u * u / 1500 + v * v / 480)) + 6 * Math.exp(-((x - 42) ** 2 + (z + 108) ** 2) / 320);
}
function rawHeight(x, z) {
  let flat = Math.max(inRect(x, z, CITY.x - CITY.half, CITY.x + CITY.half, CITY.z - CITY.half, CITY.z + CITY.half, 10), inRect(x, z, FARM.x0, FARM.x1, FARM.z0, FARM.z1, 10));
  const edge = smooth(HALF, HALF - 12, Math.max(Math.abs(x), Math.abs(z)));
  let h = (0.45 + 0.45 * Math.sin(x * 0.09 + 1) * Math.cos(z * 0.07) + 0.2 * Math.sin(x * 0.21 + z * 0.17)) * (1 - flat) * edge;
  h = Math.max(0, h) + hillH(x, z);
  const d = Math.abs(z - riverZ(x));
  const ford = Math.abs(x - FORD.x) < FORD.hw + 2;
  const k = smooth(RIVER_HW + 5, RIVER_HW - 1.5, d);
  return h * (1 - k) + (ford ? -0.95 : -2.2) * k;
}
// forest: union of blobs with a wobbly edge, kept clear of the river banks
const FOREST_BLOBS = [[-80, -75, 36], [-112, -55, 26], [-50, -98, 28], [-104, -112, 26], [-44, -60, 20], [-124, -92, 20], [-70, -120, 22]];
function forestShape(x, z) {
  if (Math.abs(z - riverZ(x)) < 18) return false;
  const wob = 0.1 * Math.sin(x * 0.31) * Math.cos(z * 0.27) + 0.06 * Math.sin(x * 0.9 + z * 0.7);
  for (const [cx, cz, r] of FOREST_BLOBS) if (Math.hypot(x - cx, z - cz) / r + wob < 1) return true;
  return false;
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
export function roadDist(x, z) {
  let m = Infinity;
  for (const pl of ROADS) for (let i = 0; i < pl.length - 1; i++) m = Math.min(m, segDist(x, z, pl[i][0], pl[i][1], pl[i + 1][0], pl[i + 1][1]));
  return m;
}

// ---------- precomputed grids ----------
const G = 2, GN = HALF * 2 / G;            // 140 x 140 cells, heights at 141 x 141 corners
const H = new Float32Array((GN + 1) * (GN + 1));
const FOREST = new Uint8Array(GN * GN), ROAD = new Uint8Array(GN * GN);
for (let j = 0; j <= GN; j++) for (let i = 0; i <= GN; i++) H[j * (GN + 1) + i] = rawHeight(-HALF + i * G, -HALF + j * G);
for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
  const x = -HALF + (i + .5) * G, z = -HALF + (j + .5) * G;
  FOREST[j * GN + i] = forestShape(x, z) ? 1 : 0;
  ROAD[j * GN + i] = roadDist(x, z) < ROAD_HW ? 1 : 0;
}
const cellIdx = (x, z) => {
  const i = Math.floor((x + HALF) / G), j = Math.floor((z + HALF) / G);
  return i < 0 || j < 0 || i >= GN || j >= GN ? -1 : j * GN + i;
};
export function heightAt(x, z) { // terrain only (bilinear)
  const fx = Math.max(0, Math.min(GN - 1e-4, (x + HALF) / G)), fz = Math.max(0, Math.min(GN - 1e-4, (z + HALF) / G));
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, W = GN + 1;
  const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
export function deckY(x, z) {
  for (const b of BRIDGES) if (Math.abs(x - b.x) < b.hw + 0.5 && Math.abs(z - b.z) < b.hl) return 0.65 * Math.min(1, (b.hl - Math.abs(z - b.z)) / 4);
  return -Infinity;
}
export function surfaceY(x, z) { return Math.max(heightAt(x, z), deckY(x, z)); } // what tanks drive on
export function inForest(x, z) { const k = cellIdx(x, z); return k >= 0 && FOREST[k] === 1; }
export function onRoad(x, z) { const k = cellIdx(x, z); return k >= 0 && ROAD[k] === 1; }
export function terrainSpeed(x, z) {
  const w = waterClass(x, z);
  if (w === 3 || onRoad(x, z)) return 1.2;
  if (w === 2) return 0.5;
  return inForest(x, z) ? 0.7 : 1;
}
export function navCost(x, z) {
  const w = waterClass(x, z);
  if (w === 3 || onRoad(x, z)) return 0.8;
  if (w === 2) return 2.5;
  return inForest(x, z) ? 1.6 : 1;
}

// ---------- obstacle helpers ----------
export function sdObs(o, x, z) {
  if (o.type === 'circle') return Math.hypot(x - o.x, z - o.z) - o.r;
  const dx = Math.abs(x - o.x) - o.hx, dz = Math.abs(z - o.z) - o.hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}
export function minObsDist(x, z, list = obstacles) {
  let m = Infinity;
  for (const o of list) { const d = sdObs(o, x, z); if (d < m) m = d; }
  return m;
}
const ext = (o) => (o.type === 'circle' ? o.r : Math.max(o.hx, o.hz));
// First hit fraction t in [0,1] along a segment (sampled), or -1. Heights compared against obstacle base + h.
export function segmentHitT(x0, z0, x1, z1, pad = 0, extra = null, y0 = 0, y1 = 0) {
  const minx = Math.min(x0, x1) - pad, maxx = Math.max(x0, x1) + pad, minz = Math.min(z0, z1) - pad, maxz = Math.max(z0, z1) + pad;
  const cand = [];
  for (const list of [obstacles, extra]) if (list) for (const o of list) {
    const e = ext(o);
    if (o.x + e < minx || o.x - e > maxx || o.z + e < minz || o.z - e > maxz) continue;
    cand.push(o);
  }
  if (!cand.length) return -1;
  const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(len / 0.3));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t;
    for (const o of cand) if (y < (o.base || 0) + o.h && sdObs(o, x, z) < pad) return t;
  }
  return -1;
}
export function pushOut(x, z, R) {
  for (let pass = 0; pass < 2; pass++) for (const o of obstacles) {
    if (Math.abs(o.x - x) > ext(o) + R + 1 || Math.abs(o.z - z) > ext(o) + R + 1) continue;
    if (o.type === 'circle') {
      const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz) || 1e-4, min = o.r + R;
      if (d < min) { x = o.x + dx / d * min; z = o.z + dz / d * min; }
    } else {
      const cx = Math.max(o.x - o.hx, Math.min(x, o.x + o.hx)), cz = Math.max(o.z - o.hz, Math.min(z, o.z + o.hz));
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d === 0) {
        const px = o.hx - Math.abs(x - o.x), pz = o.hz - Math.abs(z - o.z);
        if (px < pz) x = o.x + Math.sign(x - o.x || 1) * (o.hx + R); else z = o.z + Math.sign(z - o.z || 1) * (o.hz + R);
      } else if (d < R) { x = cx + dx / d * R; z = cz + dz / d * R; }
    }
  }
  return [x, z];
}

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

export function buildMap(scene) {
  const rand = rng(7);
  const add = (mesh) => { mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh; };

  // ---------- terrain mesh (faceted, vertex-coloured by region) ----------
  const tg = new THREE.PlaneGeometry(HALF * 2, HALF * 2, GN, GN); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, cols = new Float32Array(tp.count * 3), c = new THREE.Color();
  const grass = new THREE.Color(0x7f9b4c), grass2 = new THREE.Color(0x93a457), forestC = new THREE.Color(0x46642f), mud = new THREE.Color(0x8b7b55), bed = new THREE.Color(0x3c5560), hillC = new THREE.Color(0xb3a868), farmC = new THREE.Color(0x98a656);
  for (let k = 0; k < tp.count; k++) {
    const x = tp.getX(k), z = tp.getZ(k), h = rawHeight(x, z); tp.setY(k, h);
    const n = rand() * 0.06 - 0.03;
    c.copy(grass).lerp(grass2, 0.5 + 0.5 * Math.sin(x * 0.05) * Math.cos(z * 0.04));
    if (h > 1.2) c.lerp(hillC, Math.min(1, (h - 1.2) / 7));
    if (x > FARM.x0 && x < FARM.x1 && z > FARM.z0 && z < FARM.z1) c.copy(farmC);
    if (forestShape(x, z)) c.copy(forestC);
    const d = Math.abs(z - riverZ(x));
    if (d < RIVER_HW + 4) c.lerp(mud, smooth(RIVER_HW + 4, RIVER_HW + 1, d));
    if (h < WATER_Y) c.copy(bed);
    c.offsetHSL(0, 0, n);
    cols.set([c.r, c.g, c.b], k * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3)); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  terrain.receiveShadow = true; terrain.name = 'terrain'; scene.add(terrain);
  // surrounding countryside: a big square with a hole where the terrain mesh is
  const os = new THREE.Shape([new THREE.Vector2(-700, -700), new THREE.Vector2(700, -700), new THREE.Vector2(700, 700), new THREE.Vector2(-700, 700)]);
  os.holes.push(new THREE.Path([new THREE.Vector2(-HALF, -HALF), new THREE.Vector2(-HALF, HALF), new THREE.Vector2(HALF, HALF), new THREE.Vector2(HALF, -HALF)]));
  const outer = new THREE.Mesh(new THREE.ShapeGeometry(os), new THREE.MeshStandardMaterial({ color: 0x6b8646, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; outer.receiveShadow = true; scene.add(outer);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 40, 60, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3d8fc4, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.9 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, WATER_Y, 2); water.receiveShadow = true; scene.add(water);

  // ---------- city (original arena content, offset into its sector) ----------
  const CX = CITY.x, CZ = CITY.z;
  const groundTex = canvasTex(512, (g, s) => {
    g.fillStyle = '#b9a77c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) { g.fillStyle = rand() < .5 ? 'rgba(120,100,60,0.10)' : 'rgba(240,225,180,0.10)'; const r = 1 + rand() * 3; g.fillRect(rand() * s, rand() * s, r, r); }
    for (let i = 0; i < 40; i++) { const x = rand() * s, y = rand() * s, r = 20 + rand() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rand() < .5 ? 'rgba(120,130,70,0.22)' : 'rgba(150,120,80,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.strokeStyle = 'rgba(70,60,40,0.18)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 1); g.lineTo(s, 1); g.moveTo(1, 0); g.lineTo(1, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
  }, 2.65);
  const cityGround = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2, CITY.half * 2), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  cityGround.rotation.x = -Math.PI / 2; cityGround.position.set(CX, 0.03, CZ); cityGround.receiveShadow = true; scene.add(cityGround);

  const concrete = new THREE.MeshStandardMaterial({ color: 0xa9a59b, roughness: .9, flatShading: true });
  const concreteDark = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: .9, flatShading: true });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8378, roughness: 1, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a4b3a, roughness: .85, flatShading: true });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: .9, flatShading: true });
  const winMat = new THREE.MeshStandardMaterial({ color: 0x2c3540, roughness: .4 });
  const sand = new THREE.MeshStandardMaterial({ color: 0xa89466, roughness: 1, flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1, flatShading: true });

  function wall(x, z, w, d, h = 3.4) {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), concrete)); m.position.set(x, h / 2, z);
    const cap = add(new THREE.Mesh(new THREE.BoxGeometry(w + .3, .3, d + .3), concreteDark)); cap.position.set(x, h + .15, z);
    obstacles.push({ type: 'box', x, z, hx: w / 2, hz: d / 2, h: h + .3, base: 0 });
  }
  const bagGeo = new THREE.IcosahedronGeometry(1, 1); bagGeo.scale(0.78, 0.36, 0.42);
  function sandbags(x, z, w, d) {
    const h = 2.6, along = w > d, L = Math.max(w, d), n = Math.max(2, Math.round(L / 1.45));
    for (let row = 0; row < 4; row++) {
      const cnt = row % 2 ? n - 1 : n;
      for (let i = 0; i < cnt; i++) {
        const t = (i + (row % 2 ? 1 : .5)) / n - .5;
        const b = add(new THREE.Mesh(bagGeo, sand));
        b.position.set(x + (along ? t * L : rand() * .1), .34 + row * .6, z + (along ? rand() * .1 : t * L));
        b.rotation.y = (along ? 0 : Math.PI / 2) + (rand() - .5) * .25;
        b.scale.set(1, 1, Math.min(w, d) / 0.84 * .5 + .5);
      }
    }
    obstacles.push({ type: 'box', x, z, hx: w / 2, hz: d / 2, h, base: 0 });
  }
  function rock(x, z, r) {
    const base = heightAt(x, z);
    const geo = new THREE.DodecahedronGeometry(r, 0), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = .82 + rand() * .3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    geo.computeVertexNormals();
    const m = add(new THREE.Mesh(geo, rockMat)); m.position.set(x, base + r * .45, z); m.scale.y = 1.15; m.rotation.y = rand() * 6;
    const m2 = add(new THREE.Mesh(new THREE.DodecahedronGeometry(r * .55, 0), rockMat)); m2.position.set(x + r * .7, base + r * .2, z - r * .4);
    obstacles.push({ type: 'circle', x, z, r: r * .92, h: r * 1.5, base });
  }
  function building(x, z, w, d, h, walls = wallMat, roof = roofMat) {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), walls)); m.position.set(x, h / 2, z);
    const rf = add(new THREE.Mesh(new THREE.BoxGeometry(w + .6, .5, d + .6), roof)); rf.position.set(x, h + .25, z);
    const parapet = add(new THREE.Mesh(new THREE.BoxGeometry(w * .4, .8, d * .4), concreteDark)); parapet.position.set(x + w * .15, h + .9, z - d * .1);
    const floors = Math.floor(h / 3);
    for (let f = 0; f < floors; f++) {
      const y = 1.9 + f * 3;
      for (let i = 0; i < Math.floor(w / 2.6); i++) { const wx = x - w / 2 + 1.6 + i * 2.6; if (wx > x + w / 2 - 1) break; for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, .1), winMat); win.position.set(wx, y, z + s * (d / 2 + .03)); scene.add(win); } }
      for (let i = 0; i < Math.floor(d / 2.6); i++) { const wz = z - d / 2 + 1.6 + i * 2.6; if (wz > z + d / 2 - 1) break; for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.3, 1.1), winMat); win.position.set(x + s * (w / 2 + .03), y, wz); scene.add(win); } }
    }
    obstacles.push({ type: 'box', x, z, hx: w / 2, hz: d / 2, h: h + .5, base: 0, house: true });
  }
  const sym = (fn, x, z, ...a) => { fn(CX + x, CZ + z, ...a); fn(CX - x, CZ - z, ...a); };
  building(CX, CZ, 10, 8, 6.5);
  sym(wall, -20, 14, 14, 1.6); sym(wall, -32, -18, 1.6, 12);
  sym(sandbags, 12, 26, 8, 1.4); sym(sandbags, -44, 26, 1.4, 7);
  sym(rock, 14, 12, 2.8); sym(rock, -42, 4, 3.6); sym(rock, 6, -30, 2.4); sym(rock, 46, 40, 3.0); sym(rock, 28, 2, 2.2);
  sym(building, 36, -34, 9, 7, 6); sym(wall, 18, -46, 1.6, 9);

  // ---------- roads (ribbons laid on the terrain; bridges carry their own deck) ----------
  const roadMat = new THREE.MeshStandardMaterial({ color: 0xb49c70, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const rp = [], ri = [];
  for (const pl of ROADS) for (let s = 0; s < pl.length - 1; s++) {
    const [ax, az] = pl[s], [bx, bz] = pl[s + 1], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 2);
    const px = -(bz - az) / L * ROAD_HW, pz = (bx - ax) / L * ROAD_HW;
    const ext = s > 0 ? 1.2 : 0; // overlap joints a little
    const base = rp.length / 3;
    for (let k = 0; k <= n; k++) {
      const t = -ext / L + (k / n) * (1 + 2 * ext / L), x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const sgn of [-1, 1]) { const vx = x + px * sgn, vz = z + pz * sgn; rp.push(vx, Math.max(heightAt(vx, vz), heightAt(x, z)) + 0.07, vz); }
      if (k < n) { const a = base + k * 2; ri.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  }
  const roadGeo = new THREE.BufferGeometry(); roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); roadGeo.setIndex(ri); roadGeo.computeVertexNormals();
  const roads = new THREE.Mesh(roadGeo, roadMat); roads.receiveShadow = true; scene.add(roads);
  // joint discs
  for (const pl of ROADS) for (let s = 1; s < pl.length - 1; s++) { const d = new THREE.Mesh(new THREE.CircleGeometry(ROAD_HW, 16), roadMat); d.rotation.x = -Math.PI / 2; d.position.set(pl[s][0], heightAt(pl[s][0], pl[s][1]) + 0.08, pl[s][1]); d.receiveShadow = true; scene.add(d); }

  // ---------- bridges ----------
  const stone = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: .95, flatShading: true });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x7c705f, roughness: 1, flatShading: true });
  for (const b of BRIDGES) {
    const deck = add(new THREE.Mesh(new THREE.BoxGeometry(b.hw * 2, 0.5, 22), deckMat)); deck.position.set(b.x, 0.4, b.z);
    for (const s of [-1, 1]) {
      const ramp = add(new THREE.Mesh(new THREE.BoxGeometry(b.hw * 2, 0.4, 4.4), deckMat)); ramp.position.set(b.x, 0.3, b.z + s * 12.9); ramp.rotation.x = s * 0.15;
      const rail = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 22), stone)); rail.position.set(b.x + s * (b.hw - 0.1), 1.0, b.z);
      for (const pz of [-6, 6]) { const pier = add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 3, 2.2), stone)); pier.position.set(b.x + s * 3, -1.3, b.z + pz); }
      for (const pz of [-11, 11]) { const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), stone)); post.position.set(b.x + s * (b.hw - 0.1), 1.0, b.z + pz); }
    }
  }
  // ford marker stones
  // ford: shallow, lighter water over a gravel bed, marker stones along both edges
  const shallow = new THREE.Mesh(new THREE.PlaneGeometry(FORD.hw * 2, RIVER_HW * 2 + 2), new THREE.MeshStandardMaterial({ color: 0x9fd0dc, roughness: .4, transparent: true, opacity: 0.55, depthWrite: false }));
  shallow.rotation.x = -Math.PI / 2; shallow.position.set(FORD.x, WATER_Y + 0.02, riverZ(FORD.x)); scene.add(shallow);
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
    const x = FORD.x + sx * (FORD.hw + 0.6), z = riverZ(x) - RIVER_HW + 1.5 + k * (RIVER_HW * 2 - 3) / 5;
    const st = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + rand() * 0.3, 0), rockMat)); st.position.set(x, WATER_Y + 0.1, z); st.scale.y = 0.6;
  }

  // ---------- farmland: fields, hedgerows, fences, farm buildings ----------
  const fieldTex = (a, b) => canvasTex(128, (g, s) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(0, i * s / 8, s, s / 8); } for (let i = 0; i < 600; i++) { g.fillStyle = 'rgba(60,50,20,0.12)'; g.fillRect(rand() * s, rand() * s, 2, 2); } });
  const FIELDS = [[30, 78, 100, 134, '#c9b25a', '#b8a24c', 4], [84, 134, 60, 93, '#8ea24a', '#7f9443', 5], [84, 134, 100, 134, '#c7a35a', '#a98a48', 4], [30, 76, 72, 94, '#a7b25a', '#96a14e', 3]];
  for (const [x0, x1, z0, z1, a, b, rep] of FIELDS) {
    const t = fieldTex(a, b); t.repeat.set(1, rep);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: t, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    f.rotation.x = -Math.PI / 2; f.position.set((x0 + x1) / 2, 0.04, (z0 + z1) / 2); f.receiveShadow = true; scene.add(f);
  }
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  const HEDGES = [[81, 56, 81, 92], [81, 102, 81, 137], [27, 97, 50, 97], [60, 97, 110, 97], [120, 97, 137, 97]];
  const bushes = [];
  for (const [x0, z0, x1, z1] of HEDGES) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 1.3);
    for (let i = 0; i <= n; i++) bushes.push([x0 + (x1 - x0) * i / n + (rand() - .5) * .4, z0 + (z1 - z0) * i / n + (rand() - .5) * .4, 1 + rand() * .5]);
    obstacles.push({ type: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: Math.abs(x1 - x0) / 2 + 1, hz: Math.abs(z1 - z0) / 2 + 1, h: 2.6, base: 0, hedge: true });
  }
  const bushMesh = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ color: 0x4f7a34, roughness: 1, flatShading: true }), bushes.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  bushes.forEach(([x, z, s], i) => { q.setFromAxisAngle(up, rand() * 6); sc.set(s * 1.1, s * 1.15, s * 1.1); pv.set(x, s * 0.9, z); m4.compose(pv, q, sc); bushMesh.setMatrixAt(i, m4); bushMesh.setColorAt(i, new THREE.Color().setHSL(.27 + rand() * .04, .4, .26 + rand() * .08)); });
  bushMesh.castShadow = bushMesh.receiveShadow = true; scene.add(bushMesh);
  // fences along the farm road (visual only)
  const posts = [], rails = [];
  for (let x = 27; x < 137; x += 3) { if (Math.abs(x - 48) < 5 || Math.abs(x - 95) < 5) continue; posts.push([x, 49]); }
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.18, 1.2, .18), wood, posts.length);
  posts.forEach(([x, z], i) => { m4.makeTranslation(x, .6, z); postMesh.setMatrixAt(i, m4); });
  postMesh.castShadow = true; scene.add(postMesh);
  for (const [x0, x1] of [[27, 43], [53, 90], [100, 136]]) for (const y of [.55, .95]) { const r = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, .08, .08), wood); r.position.set((x0 + x1) / 2, y, 49); r.castShadow = true; scene.add(r); rails.push(r); }
  // farmhouse, barn, silo, hay bales
  building(40, 66, 9, 7, 5, new THREE.MeshStandardMaterial({ color: 0xeae2cf, roughness: .9, flatShading: true }));
  const barnMat = new THREE.MeshStandardMaterial({ color: 0x9c3b2e, roughness: .9, flatShading: true });
  const barn = add(new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), barnMat)); barn.position.set(60, 2.5, 66);
  const gShape = new THREE.Shape([new THREE.Vector2(-4.5, 0), new THREE.Vector2(4.5, 0), new THREE.Vector2(0, 2.8)]);
  const gGeo = new THREE.ExtrudeGeometry(gShape, { depth: 10.8, bevelEnabled: false }); gGeo.translate(0, 0, -5.4); gGeo.rotateY(Math.PI / 2);
  const gable = add(new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ color: 0x4d4a47, roughness: .9, flatShading: true }))); gable.position.set(60, 5, 66);
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.6, .1), new THREE.MeshStandardMaterial({ color: 0xf2efe6 })); door.position.set(60, 1.8, 61.96); scene.add(door);
  obstacles.push({ type: 'box', x: 60, z: 66, hx: 5, hz: 4, h: 7, base: 0, house: true });
  const silo = add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 9, 14), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: .5, metalness: .4, flatShading: true }))); silo.position.set(70, 4.5, 62);
  const dome = add(new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), silo.material)); dome.position.set(70, 9, 62);
  obstacles.push({ type: 'circle', x: 70, z: 62, r: 2.4, h: 11, base: 0 });
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xd6bb6a, roughness: 1, flatShading: true });
  for (const [x, z] of [[40, 112], [58, 122], [66, 106], [100, 116], [118, 124], [110, 108]]) {
    const h = add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.6, 12), hayMat)); h.rotation.z = Math.PI / 2; h.rotation.y = rand() * 3; h.position.set(x, 1.2, z);
    obstacles.push({ type: 'circle', x, z, r: 1.2, h: 2.4, base: 0 });
  }

  // ---------- hill rocks + a few rocks in the open ----------
  rock(70, -88, 3.2); rock(92, -70, 2.6); rock(58, -66, 2.4); rock(100, -92, 3.0); rock(42, -104, 2.2);
  rock(-20, -10, 2.6); rock(40, -20, 2.8); rock(120, 15, 3.0); rock(-120, 20, 3.0); rock(-30, 30, 2.4);

  // ---------- trees (instanced, two species; forest + scattered + outskirts) ----------
  const trunkC = new THREE.Color(0x5a4030);
  function colorGeo(g, col) { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set([col.r, col.g, col.b], i); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
  const pine = mergeGeometries([
    colorGeo(new THREE.CylinderGeometry(.25, .35, 2, 5).translate(0, 1, 0).toNonIndexed(), trunkC),
    colorGeo(new THREE.ConeGeometry(2.1, 4, 7).translate(0, 3.6, 0).toNonIndexed(), new THREE.Color(0xffffff)),
    colorGeo(new THREE.ConeGeometry(1.5, 3.2, 7).translate(0, 5.6, 0).toNonIndexed(), new THREE.Color(0xe8f0e8)),
  ]);
  const oak = mergeGeometries([
    colorGeo(new THREE.CylinderGeometry(.3, .4, 2.6, 5).translate(0, 1.3, 0).toNonIndexed(), trunkC),
    colorGeo(new THREE.IcosahedronGeometry(2.3, 0).translate(0, 4, 0), new THREE.Color(0xffffff)),
  ]);
  const pts = { pine: [], oak: [] };
  const ok = (x, z) => waterClass(x, z) === 0 && Math.abs(z - riverZ(x)) > RIVER_HW + 2 && roadDist(x, z) > ROAD_HW + 1.2;
  for (let x = -HALF + 2; x < 0; x += 3.1) for (let z = -HALF + 2; z < 0; z += 3.1) {
    const jx = x + (rand() - .5) * 2.4, jz = z + (rand() - .5) * 2.4;
    if (!forestShape(jx, jz) || !ok(jx, jz) || rand() < 0.08) continue;
    (rand() < 0.7 ? pts.pine : pts.oak).push([jx, jz, .85 + rand() * .6]);
  }
  const nearSpawn = (x, z) => Math.hypot(x - 5, z - 128) < 20 || Math.hypot(x - 20, z + 128) < 20;
  const inCity = (x, z) => Math.abs(x - CX) < CITY.half + 2 && Math.abs(z - CZ) < CITY.half + 2;
  const inFarm = (x, z) => x > FARM.x0 - 2 && z > FARM.z0 - 4;
  for (let i = 0; i < 260; i++) { // scattered groves near the map edges and on the hill flanks (visual)
    const x = (rand() - .5) * HALF * 2, z = (rand() - .5) * HALF * 2;
    if (!ok(x, z) || inCity(x, z) || inFarm(x, z) || nearSpawn(x, z) || forestShape(x, z)) continue;
    const edge = Math.max(Math.abs(x), Math.abs(z)) > HALF - 14;
    const hill = hillH(x, z) > 2 && hillH(x, z) < 6;
    if (!edge && !hill && rand() > 0.12) continue;
    (rand() < 0.5 ? pts.pine : pts.oak).push([x, z, .8 + rand() * .6]);
  }
  for (let i = 0; i < 1300; i++) { // outskirts ring
    const a = rand() * Math.PI * 2, r = HALF + 4 + rand() * 90; const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 1.2;
    if (Math.abs(x) < HALF + 3 && Math.abs(z) < HALF + 3) continue;
    if (Math.abs(z - riverZ(x)) < RIVER_HW + 4) continue;
    (rand() < 0.65 ? pts.pine : pts.oak).push([x, z, .9 + rand() * .7]);
  }
  for (const [kind, geo, hue, lit] of [['pine', pine, .3, .26], ['oak', oak, .25, .2]]) {
    const list = pts[kind];
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), list.length);
    list.forEach(([x, z, s], i) => {
      q.setFromAxisAngle(up, rand() * 6); sc.set(s, s * (.85 + rand() * .35), s); pv.set(x, heightAt(x, z) - 0.1, z); m4.compose(pv, q, sc); im.setMatrixAt(i, m4);
      im.setColorAt(i, new THREE.Color().setHSL(hue + rand() * .05, .4, lit + rand() * .1));
    });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  }
  return { terrain, treeCount: pts.pine.length + pts.oak.length };
}

// Pre-rendered minimap background (terrain, water, forest, roads, buildings).
export function renderMinimap(size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size);
  const s = (HALF * 2) / size;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = -HALF + (px + .5) * s, z = -HALF + (py + .5) * s;
    const w = waterClass(x, z), h = heightAt(x, z);
    let r = 118, gg = 146, b = 74;
    if (x > FARM.x0 && x < FARM.x1 && z > FARM.z0 && z < FARM.z1) { r = 150; gg = 160; b = 82; }
    if (Math.abs(x - CITY.x) < CITY.half && Math.abs(z - CITY.z) < CITY.half) { r = 178; gg = 162; b = 120; }
    if (h > 1) { const k = Math.min(1, h / 10); r += 40 * k; gg += 25 * k; b += 10 * k; }
    if (inForest(x, z)) { r = 52; gg = 88; b = 44; }
    if (onRoad(x, z)) { r = 196; gg = 176; b = 128; }
    if (w === 1) { r = 58; gg = 120; b = 170; } else if (w === 2) { r = 96; gg = 156; b = 190; } else if (w === 3) { r = 150; gg = 144; b = 134; }
    const k = (py * size + px) * 4; img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#4a4744';
  for (const o of obstacles) {
    const x = (o.x + HALF) / s, y = (o.z + HALF) / s;
    if (o.type === 'circle') { g.beginPath(); g.arc(x, y, Math.max(1, o.r / s), 0, 7); g.fill(); }
    else { g.fillStyle = o.hedge ? '#3c5e2a' : '#4a4744'; g.fillRect(x - o.hx / s, y - o.hz / s, Math.max(1, o.hx * 2 / s), Math.max(1, o.hz * 2 / s)); g.fillStyle = '#4a4744'; }
  }
  return cv;
}
