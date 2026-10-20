// Maps (v2.2: several maps). x = west(-)..east(+), z = north(-)..south(+). Every map is point-mirrored
// around (0, 0) for fairness: blue (team 0) plays west, red (team 1) east.
// Pure data + helpers (no three.js), shared by the sim and the renderer.
//
// MAP is the ACTIVE map. It is one object that is updated in place by setMap(id), so modules (and tests) that hold
// a reference to MAP always see the active map. Map shape:
//   { id, name, icon, size: 'S'|'L', hx, hz (half extents, m), postR (capture ring radius, m),
//     posts: [{ id, x, z, owner (0 blue, 1 red, -1 neutral), value (bleed weight), home? }],
//     hills: [{ x, z, r, h }], walls: [{ x, z, hx, hz, h }] (axis-aligned boxes), rocks: [{ x, z, r }],
//     cfg: { …overrides of sim CFG, e.g. tickets, live, timeLimit }, view: { camMax, camStart, fogNear, fogFar, minimap },
//     frontR (m: "enemy post this close = front line" for the commander AI), navCell (m) }
// Cover spots and the nav grid are derived from the props per map (sim.js getNav / getCover cache them by MAP.id).

const lcg = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
const mirrorAll = (list) => list.flatMap((o) => (Math.abs(o.x) < 1e-6 && Math.abs(o.z) < 1e-6 ? [o] : [o, { ...o, x: -o.x, z: -o.z }]));

// rocks: deterministic scatter, kept away from posts + walls, mirrored for fairness
function scatterRocks(M, { seed, n, ax, az, rMin, rMax, gap = 5, postGap = 5, wallGap = 4, minX = 6 }) {
  const rnd = lcg(seed), out = M.rocks;
  const far = (x, z) => M.posts.every((p) => Math.hypot(p.x - x, p.z - z) > M.postR + postGap) && M.walls.every((w) => Math.abs(w.x - x) > w.hx + wallGap || Math.abs(w.z - z) > w.hz + wallGap);
  let tries = 0; const goal = out.length + n;
  while (out.length < goal && tries++ < n * 30) {
    const x = (rnd() * 2 - 1) * ax, z = (rnd() * 2 - 1) * az, r = rMin + rnd() * (rMax - rMin);
    if (!far(x, z) || !far(-x, -z) || Math.abs(x) < minX) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + gap)) continue;
    out.push({ x, z, r }, { x: -x, z: -z, r });
  }
}

// ---------------- Dust Ridge: small, 3 posts, 200 x 120 m (v1-v2.1 map, unchanged) ----------------
function dustRidge() {
  const M = {
    id: 'dust-ridge', name: 'Dust Ridge', icon: '🏜️', size: 'S',
    hx: 100, hz: 60,
    posts: [
      { id: 'A', x: -72, z: 8, owner: 0, value: 1, home: true },    // blue home
      { id: 'B', x: 0, z: 0, owner: -1, value: 2 },                 // middle (neutral), worth more bleed
      { id: 'C', x: 72, z: -8, owner: 1, value: 1, home: true },    // red home
    ],
    postR: 9,
    hills: [
      { x: 4, z: -34, r: 30, h: 7 },     // the ridge north of B
      { x: -34, z: 36, r: 18, h: 3 },
      { x: 40, z: 38, r: 16, h: 2.5 },
    ],
    walls: [
      { x: -3, z: -11, hx: 5, hz: 0.5, h: 1.4 }, { x: 3, z: 11, hx: 5, hz: 0.5, h: 1.4 },
      { x: -12, z: 2, hx: 0.5, hz: 4, h: 1.4 }, { x: 12, z: -2, hx: 0.5, hz: 4, h: 1.4 },
      { x: -38, z: -4, hx: 6, hz: 0.5, h: 1.6 }, { x: 38, z: 4, hx: 6, hz: 0.5, h: 1.6 },
      { x: -60, z: -6, hx: 0.5, hz: 5, h: 1.6 }, { x: 60, z: 6, hx: 0.5, hz: 5, h: 1.6 },
      { x: -82, z: 22, hx: 5, hz: 0.5, h: 1.6 }, { x: 82, z: -22, hx: 5, hz: 0.5, h: 1.6 },
    ],
    rocks: [],
    cfg: {},                                   // CFG defaults: 200 tickets, 20 live
    view: { camMax: 170, camStart: [80, 105], fogNear: 160, fogFar: 330, minimap: false },
    frontR: 90, navCell: 2,
  };
  scatterRocks(M, { seed: 7, n: 28, ax: 90, az: 52, rMin: 1.2, rMax: 3.6 });
  M.rocks.push({ x: -8, z: -30, r: 3.5 }, { x: 16, z: -38, r: 3 }, { x: 2, z: -22, r: 2.2 });   // big landmark rocks on the ridge
  return M;
}

// ---------------- Grand Valley: large, 5 posts, 600 x 360 m (v2.2) ----------------
// Battlefront II-style conquest valley: each side has a home base + a forward outpost, the contested middle
// (Old Temple, worth most) sits between two flanking ridges. Three lanes: north (through B), center, south (through D).
// Every post is a walled compound with gaps (fights happen at posts); ruins along the lanes give cover on the way.
function grandValley() {
  const M = {
    id: 'grand-valley', name: 'Grand Valley', icon: '🏞️', size: 'L',
    hx: 300, hz: 180,
    posts: [
      { id: 'A', x: -240, z: 40, owner: 0, value: 1, home: true, name: 'West Base' },
      { id: 'B', x: -115, z: -75, owner: 0, value: 1, name: 'North Outpost' },
      { id: 'C', x: 0, z: 0, owner: -1, value: 2, name: 'Old Temple' },
      { id: 'D', x: 115, z: 75, owner: 1, value: 1, name: 'South Outpost' },
      { id: 'E', x: 240, z: -40, owner: 1, value: 1, home: true, name: 'East Base' },
    ],
    postR: 11,
    hills: [],
    walls: [],
    rocks: [],
    cfg: { tickets: 300, live: 32, timeLimit: 1800 },
    view: { camMax: 440, camStart: [130, 160], fogNear: 300, fogFar: 760, minimap: true, sky: '#b4bfa6', lo: '#a9b27a', hi: '#8c8a5e', edge: '#6f7452', rock: '#7b7468', wall: '#b0a796' },
    frontR: 180, navCell: 2,
  };
  // hills (west half, mirrored): ridges flanking the middle, high ground behind the outposts, rolling ground near the bases
  M.hills = mirrorAll([
    { x: -20, z: -78, r: 50, h: 22 }, { x: 34, z: -100, r: 40, h: 17 }, { x: -64, z: -124, r: 36, h: 13 },  // North Ridge (over C + B's lane)
    { x: -170, z: -142, r: 42, h: 15 }, { x: -222, z: -112, r: 30, h: 9 },                                  // high ground behind B
    { x: -205, z: 132, r: 50, h: 18 }, { x: -140, z: 152, r: 34, h: 11 },                                   // Southwest Bluffs (behind A)
    { x: -150, z: 25, r: 30, h: 6 }, { x: -70, z: 40, r: 26, h: 4.5 },                                      // rolling ground A→C
    { x: -280, z: -50, r: 38, h: 12 },                                                                      // behind West Base
  ]);
  // walled compound around a post: 4 sides with a gap in the middle of each side, plus low inner cover blocks
  const fort = (px, pz, R, seg, h, inner) => {
    const s = R - seg - 3;   // center of each half-side wall
    const w = [
      { x: px - s, z: pz - R, hx: seg / 2, hz: 0.5, h }, { x: px + s, z: pz - R, hx: seg / 2, hz: 0.5, h },
      { x: px - s, z: pz + R, hx: seg / 2, hz: 0.5, h }, { x: px + s, z: pz + R, hx: seg / 2, hz: 0.5, h },
      { x: px - R, z: pz - s, hx: 0.5, hz: seg / 2, h }, { x: px - R, z: pz + s, hx: 0.5, hz: seg / 2, h },
      { x: px + R, z: pz - s, hx: 0.5, hz: seg / 2, h }, { x: px + R, z: pz + s, hx: 0.5, hz: seg / 2, h },
    ];
    if (inner) w.push({ x: px - 5, z: pz + 4, hx: 2, hz: 0.5, h: 1.2 }, { x: px + 5, z: pz - 4, hx: 2, hz: 0.5, h: 1.2 }, { x: px - 4, z: pz - 6, hx: 0.5, hz: 1.6, h: 1.2 }, { x: px + 4, z: pz + 6, hx: 0.5, hz: 1.6, h: 1.2 });
    return w;
  };
  const west = [
    ...fort(-240, 40, 20, 9, 2, true),          // West Base: big compound
    ...fort(-115, -75, 17, 7, 1.7, true),        // North Outpost
    // lane ruins (cover on the way); x,z west half, mirrored below
    { x: -185, z: -10, hx: 6, hz: 0.5, h: 1.5 }, { x: -178, z: -4, hx: 0.5, hz: 4, h: 1.5 },               // A→B ruin
    { x: -170, z: 75, hx: 7, hz: 0.5, h: 1.5 }, { x: -160, z: 88, hx: 0.5, hz: 5, h: 1.5 },                // south lane, behind A
    { x: -60, z: -40, hx: 5, hz: 0.5, h: 1.5 }, { x: -52, z: -32, hx: 0.5, hz: 4, h: 1.5 },                // B→C approach
    { x: -75, z: 15, hx: 0.5, hz: 6, h: 1.6 }, { x: -88, z: 2, hx: 4, hz: 0.5, h: 1.6 },                   // center lane, west half
    { x: -150, z: -115, hx: 6, hz: 0.5, h: 1.5 },                                                          // north lane, behind B
    { x: -45, z: 95, hx: 6, hz: 0.5, h: 1.5 }, { x: -30, z: 120, hx: 0.5, hz: 6, h: 1.5 },                 // south lane west side (toward D)
    { x: -260, z: 110, hx: 5, hz: 0.5, h: 1.6 }, { x: -205, z: -60, hx: 0.5, hz: 6, h: 1.5 },
  ];
  // Old Temple (C): double compound, already point-symmetric around (0,0)
  const temple = [...fort(0, 0, 22, 9, 2.2, true),
    { x: -11, z: 0, hx: 0.5, hz: 3, h: 1.4 }, { x: 11, z: 0, hx: 0.5, hz: 3, h: 1.4 }, { x: 0, z: -12, hx: 3, hz: 0.5, h: 1.4 }, { x: 0, z: 12, hx: 3, hz: 0.5, h: 1.4 }];
  M.walls = [...mirrorAll(west), ...temple];
  // landmark rocks (big, named in the README) + broken rock lines along the ridge crests (gaps = routes over the ridge)
  const land = [
    { x: -32, z: -52, r: 7 }, { x: -6, z: -96, r: 8.5 },               // Twin Spires on the North Ridge
    { x: -120, z: -150, r: 7.5 },                                      // Watch Rock behind B
    { x: -205, z: 150, r: 9 }, { x: -140, z: 140, r: 6 },              // Bluff Stones behind A
    { x: -95, z: 70, r: 6.5 },                                         // Lone Rock, center-south
    { x: -285, z: -150, r: 8 }, { x: -60, z: -165, r: 6 },
  ];
  const chain = [];
  for (let k = 0; k < 9; k++) if (k !== 3 && k !== 6) chain.push({ x: -78 + k * 9, z: -112 + k * 3.2, r: 2.6 + (k % 3) * 0.6 });   // North Ridge crest
  for (let k = 0; k < 8; k++) if (k !== 4) chain.push({ x: -230 + k * 10, z: 100 + (k % 2) * 4, r: 2.4 + (k % 3) * 0.5 });          // bluff line south of A
  M.rocks = mirrorAll([...land, ...chain]);
  scatterRocks(M, { seed: 11, n: 110, ax: 290, az: 170, rMin: 1.2, rMax: 3.8, gap: 7, postGap: 14, wallGap: 4 });
  // rock clusters near each post (cover just outside the compound walls), west half mirrored
  const rnd = lcg(5), near = [];
  for (const p of M.posts.slice(0, 3)) for (let k = 0; k < (p.x === 0 ? 3 : 4); k++) {
    const a = rnd() * Math.PI * 2, d = (p.x === 0 ? 34 : 30) + rnd() * 10, r = 1.6 + rnd() * 1.4;
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (M.walls.some((w) => Math.abs(w.x - x) < w.hx + r + 3 && Math.abs(w.z - z) < w.hz + r + 3)) continue;
    if ([...M.rocks, ...near].some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 4)) continue;
    near.push({ x, z, r });
  }
  M.rocks.push(...mirrorAll(near));
  return M;
}

const BUILDERS = { 'dust-ridge': dustRidge, 'grand-valley': grandValley };
// map list for menus (order = campaign rotation order; index 0 = Dust Ridge so old campaign saves keep their mapIndex)
export const MAP_LIST = [
  { id: 'dust-ridge', name: 'Dust Ridge', icon: '🏜️', size: 'S', dims: '200×120 m', posts: 3 },
  { id: 'grand-valley', name: 'Grand Valley', icon: '🏞️', size: 'L', dims: '600×360 m', posts: 5 },
];
export const DEFAULT_MAP = 'dust-ridge';
export const isMap = (id) => !!BUILDERS[id];
const cache = {};
// the active map (mutated in place by setMap)
export const MAP = {};
let GRID = null;
// setMap(id): make `id` the active map (unknown id → Dust Ridge). Returns MAP. Cheap if it is already active.
export function setMap(id) {
  if (!BUILDERS[id]) id = DEFAULT_MAP;
  if (MAP.id === id) return MAP;
  const M = cache[id] ||= BUILDERS[id]();
  for (const k of Object.keys(MAP)) delete MAP[k];
  Object.assign(MAP, M);
  GRID = buildGrid();
  return MAP;
}
// props spatial grid (16 m cells): lineClear only tests the props near the line (same result, much faster on big maps)
const GC = 16;
function buildGrid() {
  const cells = new Map(), add = (i0, i1, j0, j1, v) => { for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 4096 + j; let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(v); } };
  const f = Math.floor;
  MAP.rocks.forEach((r, i) => add(f((r.x - r.r) / GC), f((r.x + r.r) / GC), f((r.z - r.r) / GC), f((r.z + r.r) / GC), i));
  MAP.walls.forEach((w, i) => add(f((w.x - w.hx) / GC), f((w.x + w.hx) / GC), f((w.z - w.hz) / GC), f((w.z + w.hz) / GC), 1000 + i));
  return { cells, stamp: new Uint32Array(1000 + MAP.walls.length + 1), tick: 0 };
}
setMap(DEFAULT_MAP);

export function heightAt(x, z) {
  let h = 0;
  for (const H of MAP.hills) { const d = Math.hypot(x - H.x, z - H.z) / H.r; if (d < 1) h += H.h * (0.5 + 0.5 * Math.cos(Math.PI * d)); }
  return h + 0.25 * Math.sin(x * 0.11) * Math.cos(z * 0.13);
}

// signed distance to the nearest solid thing (rock or wall); < 0 inside
export function solidDist(x, z) {
  let d = Infinity;
  for (const r of MAP.rocks) d = Math.min(d, Math.hypot(x - r.x, z - r.z) - r.r);
  for (const w of MAP.walls) { const dx = Math.abs(x - w.x) - w.hx, dz = Math.abs(z - w.z) - w.hz; d = Math.min(d, Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0)); }
  return d;
}

// is any rock or wall closer than r? (same answer as solidDist(x, z) < r, but only looks at nearby props)
export function solidWithin(x, z, r) {
  const G = GRID, f = Math.floor;
  for (let i = f((x - r) / GC); i <= f((x + r) / GC); i++) for (let j = f((z - r) / GC); j <= f((z + r) / GC); j++) {
    const list = G.cells.get(i * 4096 + j); if (!list) continue;
    for (const v of list) {
      if (v < 1000) { const o = MAP.rocks[v]; if (Math.hypot(x - o.x, z - o.z) - o.r < r) return true; }
      else { const w = MAP.walls[v - 1000], dx = Math.abs(x - w.x) - w.hx, dz = Math.abs(z - w.z) - w.hz; if (Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) < r) return true; }
    }
  }
  return false;
}
function rockBlocks(r, x0, z0, dx, dz, L2) {
  const t = Math.max(0, Math.min(1, ((r.x - x0) * dx + (r.z - z0) * dz) / L2));
  const px = x0 + dx * t - r.x, pz = z0 + dz * t - r.z;
  return px * px + pz * pz < r.r * r.r * 0.8;
}
function wallBlocks(w, x0, z0, dx, dz) { // slab test
  let t0 = 0, t1 = 1;
  for (const [o, d, c, h] of [[x0, dx, w.x, w.hx], [z0, dz, w.z, w.hz]]) {
    if (Math.abs(d) < 1e-9) { if (o < c - h || o > c + h) { t0 = 2; break; } continue; }
    let a = (c - h - o) / d, b = (c + h - o) / d; if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
  }
  return t0 <= t1 && t0 > 0.02 && t0 < 0.98;
}
// line of fire: blocked by walls and rocks (segment vs circle / box).
// skipA / skipB: a prop to ignore (rock i = i, wall i = 1000 + i): a unit popping up over its cover shoots across it.
export function lineClear(x0, z0, x1, z1, skipA = -1, skipB = -1) {
  const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1e-6, G = GRID, f = Math.floor;
  const i0 = f(Math.min(x0, x1) / GC), i1 = f(Math.max(x0, x1) / GC), j0 = f(Math.min(z0, z1) / GC), j1 = f(Math.max(z0, z1) / GC);
  const tick = G.tick = (G.tick + 1) >>> 0 || 1;
  // long lines: walk only the cells within one cell of the segment (cell-center distance test)
  const len = Math.sqrt(L2), nx = -dz / len, nz = dx / len, band = GC * 0.75;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    if (len > GC * 2) { const cx = (i + 0.5) * GC - x0, cz = (j + 0.5) * GC - z0; if (Math.abs(cx * nx + cz * nz) > band) continue; }
    const list = G.cells.get(i * 4096 + j); if (!list) continue;
    for (const v of list) {
      if (G.stamp[v] === tick) continue; G.stamp[v] = tick;
      if (v === skipA || v === skipB) continue;
      if (v < 1000 ? rockBlocks(MAP.rocks[v], x0, z0, dx, dz, L2) : wallBlocks(MAP.walls[v - 1000], x0, z0, dx, dz)) return false;
    }
  }
  return true;
}
