/* Austerlitz 1805 v2: a small real-time Napoleonic corps tactics game for phones.
   Sibling of Bridge Too Far. Original code and art. Plain canvas + vanilla JS, no dependencies.
   v2 adds division commanders: give a commander a zone (take / hold) and he picks formations,
   positions and facings for his battalions. Cavalry fights in squadron pairs, guns in 2-gun sections. */
(() => {
'use strict';

// ---------------------------------------------------------------- constants
const W = 1800, H = 1100, CELL = 10, GW = W / CELL, GH = H / CELL;
const PC = 20, PW = W / PC, PH = H / PC;
const GAME_TIME = 600;          // 10 minutes
const DT = 1 / 30;
const CAP_R = 70, CAP_T = 8;
const TAU = Math.PI * 2;
const T_GRASS = 0, T_ROAD = 1, T_STREAM = 2, T_BRIDGE = 3, T_HOUSE = 4, T_HEDGE = 5, T_WALL = 6, T_TREE = 7, T_WATER = 8;
const FOG0 = 150, FOG1 = 270;   // morning fog starts lifting / is gone (battle seconds)
const GUARD_UNLOCK = 180, GUARD_AUTO = 360;
const HMAX = 30;

const SIDE_COL = ['#3359b5', '#4f7d3f'];  // French blue / Allied green
const SIDE_COL_D = ['#1f377a', '#2f4f26'];
const NAT = {
  fr: { fill: '#3a5fbf', dark: '#1b2d66', trim: '#efe8d2' },
  ru: { fill: '#4b7a3c', dark: '#24401c', trim: '#d8c48a' },
  au: { fill: '#ebe6d6', dark: '#7d7868', trim: '#b8433b' },
};
const MCOL = ['#58c050', '#e6c83a', '#f08a28', '#e8402f', '#9a9a9a'];
const MNAME = ['Steady', 'Shaken', 'Wavering', 'Panic', 'Broken'];
const VERSION = 'v2.0';
const FNAME = ['Santon', 'Pratzen', 'Sokolnitz'];
const FABBR = ['Sa', 'Pr', 'So'];

// ---------------------------------------------------------------- map data
// the Goldbach runs north-south on the French side; the Pratzen plateau fills the centre-east
const STREAM = [[575, 0], [590, 140], [566, 300], [600, 470], [620, 640], [612, 800], [640, 950], [660, 1100]];
const PONDS = [[1290, 1078, 125, 46], [1520, 1092, 95, 34]];
const ROADS = [
  [[0, 95], [600, 90], [1200, 110], [1800, 130]],                                   // Brünn–Olmütz road
  [[430, 0], [420, 300], [440, 600], [452, 850], [470, 1100]],                       // French lateral road
  [[452, 850], [620, 842], [760, 800], [950, 700], [1180, 585], [1450, 522], [1800, 482]], // Sokolnitz–Pratzen
  [[470, 1012], [650, 1008], [900, 980], [1200, 930], [1800, 880]],                 // Telnitz road
  [[440, 440], [600, 440], [800, 452], [980, 476], [1180, 585]],                    // Puntowitz–Pratze
  [[600, 90], [700, 200], [760, 236]],                                               // Girzikowitz lane
];
const ROAD_W = 20;
const FIELDS = [[40, 380, 200, 110], [60, 760, 160, 110], [250, 960, 200, 100], [880, 820, 220, 110], [1450, 640, 200, 120], [1500, 220, 220, 100], [760, 300, 160, 90], [140, 40, 200, 40]];
const HOUSES = [
  // Telnitz
  [596, 962, 40, 28], [655, 958, 44, 28], [606, 1032, 38, 32], [680, 1030, 40, 30], [722, 984, 30, 30],
  // Sokolnitz
  [584, 798, 38, 28], [588, 866, 36, 32], [652, 788, 34, 28], [668, 862, 40, 30], [704, 818, 30, 34],
  // Puntowitz
  [575, 408, 36, 26], [642, 404, 40, 26], [652, 464, 34, 30], [584, 470, 30, 28],
  // Girzikowitz
  [728, 204, 36, 28], [780, 198, 34, 30], [752, 256, 40, 26],
  // Pratze
  [948, 416, 36, 28], [996, 412, 34, 30], [968, 500, 40, 24],
  // Blasowitz
  [1350, 184, 36, 28], [1402, 190, 34, 30], [1372, 236, 40, 26],
  // Krzenowitz (Allied rear)
  [1630, 566, 36, 28], [1672, 578, 34, 30],
  // Santon chapel
  [314, 140, 26, 22],
];
const VILLAGES = [['Telnitz', 660, 1072], ['Sokolnitz', 650, 760], ['Puntowitz', 615, 380], ['Girzikowitz', 760, 176], ['Pratze', 975, 392], ['Blasowitz', 1380, 160], ['Krzenowitz', 1655, 540]];
const HEDGES = [[700, 1052, 90, 6], [540, 930, 6, 60], [760, 1050, 6, 40], [240, 520, 120, 6], [1500, 760, 120, 6]];
const WALLS = [ // the walled pheasantry east of Sokolnitz (gap on the west side)
  [740, 880, 96, 6], [740, 962, 96, 6], [740, 880, 6, 30], [740, 936, 6, 32], [830, 880, 6, 88],
];
const TREES = [
  [880, 140, 40], [925, 172, 30], [790, 925, 26], [812, 948, 22], [1600, 300, 40], [1642, 338, 30],
  [1620, 820, 40], [1662, 858, 30], [1050, 1040, 34], [300, 610, 30], [262, 648, 24], [200, 905, 32],
  [1010, 300, 28], [1760, 700, 24], [150, 250, 26], [480, 1060, 22],
];
const FLAG_POS = [[330, 188], [1220, 560], [646, 836]];

// ---------------------------------------------------------------- helpers
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dxy = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  let t = l2 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0; t = clamp(t, 0, 1);
  return dxy(px, py, ax + vx * t, ay + vy * t);
}
function polyDist(px, py, pts) {
  let m = 1e9;
  for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, segDist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return m;
}
const plateau = (r, r0, r1) => { if (r <= r0) return 1; if (r >= r1) return 0; const s = (r1 - r) / (r1 - r0); return s * s * (3 - 2 * s); };

// ---------------------------------------------------------------- terrain grid + heights
const terr = new Uint8Array(GW * GH);
const hid = new Int16Array(GW * GH);
const hgt = new Float32Array(GW * GH);
function heightFn(x, y) {
  const p1 = plateau(Math.hypot((x - 1230) / 360, (y - 560) / 320), 0.5, 1.0) * HMAX;        // Pratzen plateau
  const p2 = plateau(Math.hypot((x - 1075) / 210, (y - 650) / 160), 0.35, 1.0) * HMAX * 0.85; // western spur
  const p3 = plateau(Math.hypot(x - 330, y - 188) / 125, 0.2, 1.0) * 20;                       // Santon
  return Math.max(p1, p2, p3);
}
(function buildGrid() {
  const byCenter = (r, t, id) => {
    const [x, y, w, h] = r;
    for (let cy = Math.floor(y / CELL); cy < Math.ceil((y + h) / CELL); cy++)
      for (let cx = Math.floor(x / CELL); cx < Math.ceil((x + w) / CELL); cx++) {
        if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) continue;
        const px = cx * CELL + 5, py = cy * CELL + 5;
        if (px >= x && px < x + w && py >= y && py < y + h) { terr[cy * GW + cx] = t; if (id) hid[cy * GW + cx] = id; }
      }
  };
  const byOverlap = (r, t) => {
    const [x, y, w, h] = r;
    for (let cy = Math.floor(y / CELL); cy <= Math.floor((y + h - 0.01) / CELL); cy++)
      for (let cx = Math.floor(x / CELL); cx <= Math.floor((x + w - 0.01) / CELL); cx++)
        if (cx >= 0 && cy >= 0 && cx < GW && cy < GH) { const k = cy * GW + cx; if (terr[k] !== T_STREAM && terr[k] !== T_WATER && terr[k] !== T_BRIDGE) terr[k] = t; }
  };
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    const px = cx * CELL + 5, py = cy * CELL + 5, k = cy * GW + cx;
    hgt[k] = heightFn(px, py);
    if (polyDist(px, py, STREAM) < 11) terr[k] = T_STREAM;
    for (const [ex, ey, rx, ry] of PONDS) if (((px - ex) / rx) ** 2 + ((py - ey) / ry) ** 2 < 1) terr[k] = T_WATER;
    if (terr[k] !== T_WATER) for (const r of ROADS) if (polyDist(px, py, r) < ROAD_W / 2) { terr[k] = terr[k] === T_STREAM ? T_BRIDGE : (terr[k] === T_BRIDGE ? T_BRIDGE : T_ROAD); break; }
  }
  TREES.forEach(([x, y, r]) => {
    for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
      for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
        if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) continue;
        const k = cy * GW + cx;
        if (dxy(cx * CELL + 5, cy * CELL + 5, x, y) <= r && terr[k] === T_GRASS) terr[k] = T_TREE;
      }
  });
  HEDGES.forEach(r => byOverlap(r, T_HEDGE));
  WALLS.forEach(r => byOverlap(r, T_WALL));
  HOUSES.forEach((r, i) => byCenter(r, T_HOUSE, i + 1));
})();
const cellIdx = (x, y) => clamp(Math.floor(y / CELL), 0, GH - 1) * GW + clamp(Math.floor(x / CELL), 0, GW - 1);
const terrAt = (x, y) => terr[cellIdx(x, y)];
const houseAt = (x, y) => hid[cellIdx(x, y)];
const heightAt = (x, y) => hgt[cellIdx(x, y)];
function coverAt(x, y) {
  const t = terrAt(x, y);
  if (t === T_HOUSE) return 2;
  if (t === T_HEDGE || t === T_WALL || t === T_TREE) return 1;
  for (const [ox, oy] of [[9, 0], [-9, 0], [0, 9], [0, -9]]) {
    const n = terrAt(x + ox, y + oy);
    if (n === T_HEDGE || n === T_WALL) return 1;
  }
  return 0;
}

// pathing grid (20px cells). I = foot & horse (can wade the Goldbach), V = guns (bridges only)
const passI = new Uint8Array(PW * PH), passV = new Uint8Array(PW * PH);
const costI = new Float32Array(PW * PH), costV = new Float32Array(PW * PH);
(function buildPath() {
  const ci = { [T_GRASS]: 1, [T_ROAD]: 0.85, [T_BRIDGE]: 0.85, [T_HOUSE]: 1.8, [T_HEDGE]: 1.4, [T_WALL]: 1.5, [T_TREE]: 1.5, [T_STREAM]: 3, [T_WATER]: 9 };
  const cv = { [T_GRASS]: 1.1, [T_ROAD]: 0.7, [T_BRIDGE]: 0.7, [T_HOUSE]: 9, [T_HEDGE]: 1.8, [T_WALL]: 2.5, [T_TREE]: 2.2, [T_STREAM]: 9, [T_WATER]: 9 };
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    let water = false, stream = false, bridge = false, house = 0, ci2 = 0, cv2 = 0;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const t = terr[(py * 2 + sy) * GW + px * 2 + sx];
      if (t === T_WATER) water = true;
      if (t === T_STREAM) stream = true;
      if (t === T_BRIDGE) bridge = true;
      if (t === T_HOUSE) house++;
      ci2 += ci[t] / 4; cv2 += cv[t] / 4;
    }
    const k = py * PW + px;
    passI[k] = water ? 0 : 1;
    passV[k] = water || (stream && !bridge) || house >= 2 ? 0 : 1;
    costI[k] = ci2; costV[k] = bridge ? 0.8 : cv2;
  }
})();
const pIdx = (x, y) => clamp(Math.floor(y / PC), 0, PH - 1) * PW + clamp(Math.floor(x / PC), 0, PW - 1);
const passAt = (x, y, veh) => x >= 0 && y >= 0 && x < W && y < H && (veh ? passV : passI)[pIdx(x, y)] === 1;

function nearestPass(k, pass) {
  if (pass[k]) return k;
  const cx = k % PW, cy = (k / PW) | 0;
  for (let r = 1; r < 30; r++) {
    let best = -1, bd = 1e9;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= PW || y >= PH) continue;
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
      const kk = y * PW + x;
      if (pass[kk]) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; best = kk; } }
    }
    if (best >= 0) return best;
  }
  return -1;
}

// binary heap A*
const gScore = new Float32Array(PW * PH), came = new Int32Array(PW * PH), closed = new Uint8Array(PW * PH);
function findPath(sx, sy, tx, ty, veh) {
  const pass = veh ? passV : passI, cost = veh ? costV : costI;
  const s = nearestPass(pIdx(sx, sy), pass), t = nearestPass(pIdx(tx, ty), pass);
  if (s < 0 || t < 0) return null;
  gScore.fill(1e9); came.fill(-1); closed.fill(0);
  const tx0 = t % PW, ty0 = (t / PW) | 0;
  const heap = [];
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (k) => { const dx = Math.abs(k % PW - tx0), dy = Math.abs(((k / PW) | 0) - ty0); return 0.7 * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)); };
  gScore[s] = 0; push(h(s), s);
  let found = false;
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    if (k === t) { found = true; break; }
    closed[k] = 1;
    const cx = k % PW, cy = (k / PW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= PW || ny >= PH) continue;
      const nk = ny * PW + nx;
      if (!pass[nk] || closed[nk]) continue;
      if (dx && dy && (!pass[cy * PW + nx] || !pass[ny * PW + cx])) continue;
      const g = gScore[k] + (dx && dy ? 1.414 : 1) * (cost[k] + cost[nk]) / 2;
      if (g < gScore[nk]) { gScore[nk] = g; came[nk] = k; push(g + h(nk), nk); }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let k = t; k !== -1 && k !== s; k = came[k]) cells.push(k);
  cells.reverse();
  const pts = [{ x: sx, y: sy }].concat(cells.map(k => ({ x: (k % PW) * PC + PC / 2, y: ((k / PW) | 0) * PC + PC / 2 })));
  const endOk = passAt(tx, ty, veh) && (!veh || terrAt(tx, ty) !== T_HOUSE);
  if (endOk) { if (pts.length > 1) pts[pts.length - 1] = { x: tx, y: ty }; else pts.push({ x: tx, y: ty }); }
  // string pulling (never across the stream on foot unless the straight line also wades it cheaply)
  const out = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineOK(pts[i], pts[j], veh)) j--;
    out.push(pts[j]); i = j;
  }
  return out;
}
function lineOK(a, b, veh) {
  const d = dist(a, b), n = Math.ceil(d / 8);
  const ha = houseAt(a.x, a.y), hb = houseAt(b.x, b.y);
  let wet = 0;
  for (let i = 1; i < n; i++) {
    const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
    if (!passAt(x, y, veh)) return false;
    if (!veh) {
      const h = houseAt(x, y); if (h && h !== ha && h !== hb) return false;
      if (terrAt(x, y) === T_STREAM && ++wet > 4) return false; // don't shortcut along the stream bed
    }
  }
  return true;
}

// ---------------------------------------------------------------- weapons & unit types
// volley muskets fire by formation; guns fire roundshot along a line (bounces through deep
// formations) and switch to canister inside the inner ring
const WPN = {
  musket:  { range: 190, eff: 0.5, rof: 4.5, acc: 0.55, dmg: 14, supp: 4, fall: 0.65 },
  lmusket: { range: 230, eff: 0.55, rof: 3, acc: 0.5, dmg: 5.5, supp: 3, fall: 0.55 },
  cannon:  { range: 650, eff: 0.45, rof: 6.5, acc: 0.5, dmg: 7, supp: 9, can: 170, canDmg: 22, gun: true },
  hcannon: { range: 560, eff: 0.45, rof: 5.5, acc: 0.5, dmg: 5.5, supp: 7, can: 150, canDmg: 17, gun: true },
};
const UT = {
  cmdr:  { hp: 40, w: null, kind: 'cmdr', spd: 1, role: 'lead', melee: 0.4, form0: 'staff', label: 'Marshal' },
  line:  { hp: 100, w: 'musket', ammo: 40, kind: 'inf', spd: 1, role: 'assault', melee: 1, form0: 'line', label: 'Line infantry' },
  guard: { hp: 130, w: 'musket', ammo: 50, kind: 'inf', spd: 1, role: 'assault', melee: 1.6, form0: 'column', elite: 1, label: 'Imperial Guard' },
  light: { hp: 70, w: 'lmusket', ammo: 50, kind: 'light', spd: 1, role: 'skirm', melee: 0.6, form0: 'open', label: 'Light infantry' },
  hcav:  { hp: 80, w: null, kind: 'cav', spd: 1, role: 'cav', melee: 1.25, charge: 1.5, form0: 'mounted', label: 'Heavy cavalry' },
  lcav:  { hp: 65, w: null, kind: 'cav', spd: 1.15, role: 'cav', melee: 0.95, charge: 1.15, form0: 'mounted', label: 'Light cavalry' },
  art:   { hp: 55, w: 'cannon', ammo: 30, kind: 'art', spd: 1, role: 'art', melee: 0.35, form0: 'deployed', label: 'Foot battery' },
  hart:  { hp: 45, w: 'hcannon', ammo: 30, kind: 'art', spd: 1.35, role: 'art', melee: 0.3, form0: 'deployed', label: 'Horse battery' },
};
const FORM_NAME = { line: 'Line', column: 'Column', square: 'Square', open: 'Open order', mounted: 'Mounted', limbered: 'Limbered', deployed: 'Unlimbered', staff: 'Staff' };
const FORM_ICON = { line: '▬', column: '▮', square: '◻', limbered: '🐴', deployed: '💥' };
const FIRE_ARC = { line: 1.05, column: 1.3, square: 4, open: 4, deployed: 0.6, staff: 4, mounted: 0, limbered: 0 };
const FORM_FIRE = { line: 1, column: 0.3, square: 0.42, open: 1, deployed: 1 };
const VULN = { line: 1, column: 1.25, square: 1.2, open: 0.55, mounted: 1.1, limbered: 1.1, deployed: 0.8, staff: 0.35 };
const RAD = { line: 12, column: 13, square: 13, open: 12, mounted: 11, limbered: 10, deployed: 11, staff: 7 };
const CHARGE_R = { cav: 400, inf: 170 };
const RALLY_R = 190;
// [type, name, exp, nation, role, division, size]. size < 1 = a detachment: cavalry regiments are
// split into pairs of squadrons (½) and 6-gun batteries into 2-gun sections (⅓). Strength and
// firepower scale with size, so a whole regiment or battery hits about as hard as before.
const F_ROSTER = [
  ['cmdr', 'Marshal Soult', 2, 'fr'],
  ['line', '4e de Ligne', 2, 'fr', null, 'van'], ['line', '28e de Ligne', 1, 'fr', null, 'sth'],
  ['line', '46e de Ligne', 1, 'fr', null, 'van'], ['line', '57e de Ligne', 1, 'fr', 'guard', 'lan'],
  ['light', '10e Léger', 2, 'fr', null, 'sth'], ['light', '26e Léger', 1, 'fr', null, 'leg'],
  ['hcav', 'Cuirassiers sq.1-2', 1, 'fr', null, 'mur', 0.5], ['hcav', 'Cuirassiers sq.3-4', 1, 'fr', null, 'mur', 0.5],
  ['lcav', 'Hussars sq.1-2', 1, 'fr', null, 'mur', 0.5], ['lcav', 'Hussars sq.3-4', 1, 'fr', null, 'mur', 0.5],
  ['art', 'Foot Bty sec.1', 1, 'fr', null, 'van', 1 / 3], ['art', 'Foot Bty sec.2', 1, 'fr', null, 'sth', 1 / 3], ['art', 'Foot Bty sec.3', 1, 'fr', null, 'leg', 1 / 3],
  ['hart', 'Horse Bty sec.1', 1, 'fr', null, 'leg', 1 / 3], ['hart', 'Horse Bty sec.2', 1, 'fr', null, 'lan', 1 / 3], ['hart', 'Horse Bty sec.3', 1, 'fr', null, 'mur', 1 / 3],
  ['guard', 'Guard Grenadiers', 2, 'fr', null, 'gar'],
];
const F_PARENT = [0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 8, 9, 9, 9, 10, 10, 10, 11]; // v1 unit each piece came from (deploy presets)
const GUARD_SLOT = 17;
const A_ROSTER = [
  ['cmdr', 'Gen. Kutuzov', 1, 'ru'],
  ['line', 'Novgorod Musk.', 1, 'ru', null, 'mil'], ['line', 'Apsheron Musk.', 1, 'ru', null, 'mil'], ['line', 'Salzburg Inf.', 0, 'au', null, 'kol'],
  ['line', 'Kursk Musk.', 0, 'ru', null, 'lng'], ['line', 'Podolia Musk.', 1, 'ru', 'guard', 'kam'],
  ['light', 'Russian Jägers', 1, 'ru', null, 'lng'], ['light', 'Grenz Bn', 0, 'au', null, 'kol'],
  ['lcav', 'Uhlans sq.1-2', 1, 'ru', null, 'lie', 0.5], ['lcav', 'Uhlans sq.3-4', 1, 'ru', null, 'lie', 0.5],
  ['hcav', 'Austrian Cuir. sq.1-2', 1, 'au', null, 'lie', 0.5], ['hcav', 'Austrian Cuir. sq.3-4', 1, 'au', null, 'lie', 0.5],
  ['art', 'Russian Bty sec.1', 1, 'ru', null, 'mil', 1 / 3], ['art', 'Russian Bty sec.2', 1, 'ru', null, 'mil', 1 / 3], ['art', 'Russian Bty sec.3', 1, 'ru', null, 'lng', 1 / 3],
  ['art', 'Austrian Bty sec.1', 0, 'au', null, 'kol', 1 / 3], ['art', 'Austrian Bty sec.2', 0, 'au', null, 'kol', 1 / 3], ['art', 'Austrian Bty sec.3', 0, 'au', null, 'kam', 1 / 3],
];
const A_PARENT = [0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 9, 10, 10, 10, 11, 11, 11];
const REINF_NAMES = { line: [['Pskov Musk.', 'ru'], ['Erzherzog Inf.', 'au'], ['Vladimir Musk.', 'ru']], art: [['Horse Bty (ru)', 'ru']], lcav: [['Hussars (au)', 'au']] };
// division commanders. The French ones take your zone orders; the Allied ones get theirs from the AI.
const F_DIVS = [
  { key: 'van', name: 'Vandamme', sub: 'IV Corps, 1st Division', col: '#ffd34d' },
  { key: 'sth', name: 'St-Hilaire', sub: 'IV Corps, 2nd Division', col: '#ff9a3c' },
  { key: 'leg', name: 'Legrand', sub: 'IV Corps, 3rd Division (Goldbach)', col: '#4fd6c2' },
  { key: 'lan', name: 'Lannes', sub: 'V Corps (Santon)', col: '#ff7096' },
  { key: 'mur', name: 'Murat', sub: 'Cavalry Reserve', col: '#c4a0ff' },
  { key: 'gar', name: 'Garde', sub: 'Imperial Guard (Bessières)', col: '#f4efe2' },
];
const A_DIVS = [
  { key: 'mil', name: 'Miloradovich', sub: '4th Column', col: '#e3cf8f' },
  { key: 'kol', name: 'Kolowrat', sub: '4th Column (Austrian)', col: '#f1ede0' },
  { key: 'lng', name: 'Langeron', sub: '2nd Column', col: '#a6dc8c' },
  { key: 'kam', name: 'Kamensky', sub: 'Pratzen brigade', col: '#e7a868' },
  { key: 'lie', name: 'Liechtenstein', sub: '5th Column (cavalry)', col: '#b8c8ff' },
  { key: 'dok', name: 'Dokhturov', sub: '1st Column (arriving)', col: '#ff8f80' },
];
// named zones: tap near one to send a commander there (or tap anywhere for a free zone)
const ZONES = [
  { name: 'Santon', x: 330, y: 188, r: 105, flag: 0 },
  { name: 'Pratzen', x: 1220, y: 560, r: 150, flag: 1 },
  { name: 'Sokolnitz', x: 646, y: 836, r: 105, flag: 2 },
  { name: 'Telnitz', x: 662, y: 1002, r: 95 },
  { name: 'Puntowitz', x: 615, y: 436, r: 95 },
  { name: 'Girzikowitz', x: 758, y: 226, r: 85 },
  { name: 'Pratze', x: 975, y: 456, r: 90 },
  { name: 'Pheasantry', x: 788, y: 924, r: 70 },
  { name: 'Blasowitz', x: 1378, y: 206, r: 90 },
];
// French deploy presets (v1 unit order, Guard excluded; split pieces start next to each other)
const F_SETUPS = [
  [[470, 600], [545, 720], [690, 845], [530, 470], [350, 225], [680, 1000], [598, 832], [380, 700], [400, 360], [520, 600], [480, 300]],   // Goldbach line
  [[500, 760], [700, 800], [700, 930], [540, 560], [345, 230], [700, 1000], [600, 856], [430, 820], [420, 560], [540, 760], [500, 900]],   // forward at Sokolnitz
  [[420, 400], [520, 300], [690, 850], [540, 540], [345, 225], [690, 990], [600, 840], [360, 470], [330, 330], [470, 200], [520, 680]],    // Santon anchor
];
// Allied setups (v1 unit order) + seconds before the columns step off; wing = divisions sent at Santon
const A_SETUPS = [
  { name: 'heights', delay: 0, wing: ['kol'], pos: [[1280, 560], [1120, 640], [1160, 700], [1100, 520], [1300, 660], [1225, 590], [1040, 680], [1080, 780], [1360, 440], [1420, 700], [1160, 580], [1190, 480]] },
  { name: 'descending', delay: 10, wing: ['kol'], pos: [[1180, 650], [980, 700], [1020, 760], [960, 600], [1120, 760], [1220, 560], [900, 760], [940, 860], [1250, 760], [1300, 820], [1100, 640], [1180, 520]] },
  { name: 'north', delay: 20, wing: ['kol', 'mil'], pos: [[1240, 470], [1080, 420], [1040, 500], [1150, 380], [1260, 440], [1225, 580], [960, 380], [1100, 620], [1300, 300], [1380, 560], [1150, 480], [1200, 640]] },
  { name: 'south', delay: 25, wing: ['kol'], pos: [[1200, 740], [1080, 820], [1140, 880], [1040, 740], [1220, 800], [1225, 570], [960, 900], [1000, 960], [1330, 860], [1400, 780], [1140, 700], [1240, 640]] },
];
// offsets for the pieces of a split regiment / battery (across the facing)
const PIECE_OFF = (k, n) => (k - (n - 1) / 2) * (n === 2 ? 34 : 32);
const DIFFS = {
  // acc: Allied fire; think: AI reaction; stay: how long Allied lines trade fire before pressing on;
  // reinf/reinfT: Allied columns from the east; pushT: seconds left when the late push starts;
  // cavT: how good a target must be before Allied cavalry charges; exp: Allied veterancy (+1 star on Hard)
  // v2: tuned with division commanders on both sides (AI vs AI ~78 / 59 / 27 %, scripted zone-order player ~76 / 54 / 30 %)
  easy:   { acc: 0.82, think: 0.85, stay: 0.6, reinf: ['line', 'line', 'art'], reinfT: 250, exp: 0, pushT: 120, cavT: 1.65, mor: 0.9 },
  normal: { acc: 1.0, think: 0.7, stay: 0.5, reinf: ['line', 'line', 'art'], reinfT: 220, exp: 0, pushT: 160, cavT: 1.5, mor: 1.03 },
  hard:   { acc: 1.0, think: 0.7, stay: 0.5, reinf: ['line', 'line', 'line', 'lcav'], reinfT: 210, exp: 1, pushT: 180, cavT: 1.5, mor: 1.0 },
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

// haptics (feature-detected; iOS Safari has no vibrate, so this is a no-op there)
const HAPTIC_OK = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
let hapticOn = store.get('aus-haptic', '1') === '1';
let buzzT = 0;
function buzz(pat) {
  if (!HAPTIC_OK || !hapticOn || G.auto || G.silent) return;
  const now = performance.now();
  if (now - buzzT < 120) return;
  buzzT = now;
  try { navigator.vibrate(pat); } catch (e) { /* ignore */ }
}
// veterans: experience carried between battles (per roster slot)
const VETS_KEY = 'aus-vets2'; // v2 roster (v1 saves had 12 slots)
function loadVets() {
  try { const v = JSON.parse(store.get(VETS_KEY, '') || 'null'); if (v && Array.isArray(v.exp)) return v; } catch (e) { /* bad data */ }
  return null;
}
const saveVets = (v) => store.set(VETS_KEY, v ? JSON.stringify(v) : '');

// ---------------------------------------------------------------- game state
const G = { diff: store.get('aus-diff', 'normal'), ringsAll: store.get('aus-rings', '0') === '1' };
if (!DIFFS[G.diff]) G.diff = 'normal';
function mkUnit(side, type, name, x, y, exp, nat, role, sz) {
  const t = UT[type];
  let form = t.form0;
  if (side === 1 && t.kind === 'inf') form = 'column';
  sz = sz || 1;
  return {
    id: G.units.length, side, nat, type, name, x, y, exp, t, kind: t.kind, sz,
    hp: t.hp * sz, maxHp: t.hp * sz, morale: 82 + exp * 6, state: 0,
    ammo: t.ammo || 0, ammoMax: t.ammo || 0, ammoF: 0, fat: 0,
    form, formTo: null, formT: 0, formT0: 1, formAt: -99, ang: side ? Math.PI : 0,
    path: [], mode: 'move', order: { type: 'idle' },
    cool: rnd(0, 2), lastFired: -99, lastHit: -99, threat: null,
    alive: true, fled: false, reserve: false, moving: false, seenUntil: [-1, -1], wasSeen: false,
    role: role || t.role, aiCool: rnd(0, 2), kills: 0, flash: 0, deadSeen: false, fleeT: 0, rallyT: 0, fT: {},
    chargeD: 0, cpT: 0, meleeT: -99, dv: null, spot: null, direct: false, directUntil: 0, home: { x, y }, faceAng: null,
  };
}
const isInf = (u) => u.kind === 'inf';
const isArt = (u) => u.kind === 'art';
const isCav = (u) => u.kind === 'cav';
const canCharge = (u) => (isCav(u) && u.fat < 50) || (isInf(u) && u.form !== 'square');
function newGame(auto) {
  Object.assign(G, {
    units: [], smokes: [], shells: [], tracers: [], booms: [], markers: [], ghosts: [], floaters: [], dust: [],
    los: new Map(), time: 0, running: true, paused: false, over: false, result: null, phase: 'deploy',
    auto: !!auto, sel: [], pend: 'move', speed: G.speed || 1, visT: 0, aiT: 0, flagT: 0, shake: 0,
    reinfDone: false, preview: null, fSetup: Math.floor(Math.random() * F_SETUPS.length),
    aim: null, inspect: null, flagLog: [], logT: 0, pushAt: null, reinfAt: null, guardAt: null, guardIn: false,
    fog: 1, fogToast: false, wind: { x: rnd(3, 7), y: rnd(-2.5, 2.5) },
    ai: [{ holdUntil: 0, stay: 0.65, mode: 'defend', stage: {} }, { holdUntil: 0, stay: 0.5, mode: 'wait', stage: {} }],
    divs: [], selDiv: null, zonePrev: null,
    stats: { dead: [0, 0], fled: [0, 0], rallied: [0, 0], charges: [0, 0], squares: [0, 0], dmg: {}, sqForm: [0, 0] },
  });
  const D = DIFFS[G.diff];
  // the French hold Santon and Sokolnitz; the Allies stand on the Pratzen
  G.flags = FLAG_POS.map(([x, y], i) => ({ x, y, owner: i === 1 ? 1 : 0, prog: 0, capSide: -1, contested: false, name: FNAME[i] }));
  F_DIVS.forEach(d => mkDiv(0, d)); A_DIVS.forEach(d => mkDiv(1, d));
  const vets = auto ? null : loadVets();
  F_ROSTER.forEach((r, i) => {
    const e = vets ? clamp(vets.exp[i] ?? r[2], 0, 2) : r[2];
    const u = mkUnit(0, r[0], r[1], i === GUARD_SLOT ? -60 : 0, 480, e, r[3], r[4], r[6]);
    u.slot = i; u.exp0 = e; u.med = (vets && vets.med && vets.med[i]) || 0;
    if (i === GUARD_SLOT) { u.reserve = true; G.guard = u; }
    joinDiv(u, r[5]);
    G.units.push(u);
  });
  const as = A_SETUPS[Math.floor(Math.random() * A_SETUPS.length)];
  G.aSetup = as.name; G.ai[1].holdUntil = as.delay + (D.waitT ?? 30); G.ai[1].wing = as.wing;
  A_ROSTER.forEach((r, i) => {
    const par = A_PARENT[i], n = A_PARENT.filter(p => p === par).length, k = A_PARENT.slice(0, i).filter(p => p === par).length;
    const [x0, y0] = as.pos[par], x = x0, y = y0 + PIECE_OFF(k, n);
    const u = mkUnit(1, r[0], r[1], x, y, clamp(r[2] + D.exp, 0, 2), r[3], r[4], r[6]);
    u.x += rnd(-10, 10); u.y += rnd(-10, 10);
    if (!passAt(u.x, u.y, isArt(u)) || terrAt(u.x, u.y) === T_STREAM) { u.x = x; u.y = y; }
    joinDiv(u, r[5]);
    G.units.push(u);
  });
  placeSections(1);
  jitterFrench();
  for (const u of G.units) u.home = { x: u.x, y: u.y };
  updateVis();
}
function mkDiv(side, def) {
  const d = Object.assign({ id: G.divs.length, side, units: [], zone: null, post: 'hold', hq: null, theta: null, layT: 0, mode: 'hold', ctl: [], player: false }, def);
  G.divs.push(d);
  return d;
}
const divByKey = (side, key) => G.divs.find(d => d.side === side && d.key === key);
function joinDiv(u, key) {
  const d = key ? divByKey(u.side, key) : null;
  if (!d) return;
  u.dv = d; d.units.push(u);
}
// gun sections deploy behind the battalions of their own division
function placeSections(side) {
  for (const d of G.divs) {
    if (d.side !== side) continue;
    const secs = d.units.filter(u => isArt(u) && !u.reserve), rest = d.units.filter(u => !isArt(u) && !u.reserve);
    if (!secs.length || !rest.length) continue;
    const c = centroid(rest), back = side ? 55 : -55;
    secs.forEach((u, k) => {
      const tx = c.x + back, ty = c.y + PIECE_OFF(k, secs.length) * 1.2;
      const p = side ? snapSpot(tx, ty, true, []) : nearestOk(tx, ty, true);
      if (p) { u.x = p.x; u.y = p.y; }
    });
  }
}
const centroid = (us) => { let x = 0, y = 0; for (const u of us) { x += u.x; y += u.y; } return { x: x / us.length, y: y / us.length }; };
function jitterFrench() {
  const fs = F_SETUPS[G.fSetup];
  G.units.filter(u => u.side === 0 && u.slot !== GUARD_SLOT).forEach((u) => {
    const i = u.slot, par = F_PARENT[i], n = F_PARENT.filter(p => p === par).length, k = F_PARENT.slice(0, i).filter(p => p === par).length;
    u.x = fs[par][0]; u.y = fs[par][1] + PIECE_OFF(k, n);
    const q = nearestOk(u.x, u.y, isArt(u)); if (q) { u.x = q.x; u.y = q.y; }
    if (u.kind === 'light' || isInf(u)) {
      const c = coverNear(u.x, u.y, 25, 0, null, u);
      if (c && inZone(c.x, c.y) && terrAt(c.x, c.y) !== T_STREAM) { u.x = c.x; u.y = c.y; }
    }
    u.ang = 0;
  });
  placeSections(0);
  for (const u of G.units) if (u.side === 0) u.home = { x: u.x, y: u.y };
}
const live = (u) => u.alive && !u.fled && !u.reserve;
const isSeen = (o, side) => o.side === side || o.seenUntil[side] > G.time;
const inHouse = (u) => terrAt(u.x, u.y) === T_HOUSE;
const hpf = (u) => clamp(u.hp / u.maxHp, 0, 1);

// formation footprint: [depth along facing, frontage]; battalions shrink as they take losses
function dims(u) {
  const k = 0.55 + 0.45 * hpf(u);
  switch (u.form) {
    case 'line': return [9, (u.type === 'guard' ? 50 : 46) * k];
    case 'column': return [26 * (0.7 + 0.3 * k), 18];
    case 'square': return [22, 22];
    case 'open': return [14, 38];
    case 'mounted': return [14, 30 * k * (0.45 + 0.55 * (u.sz || 1))];
    case 'limbered': return [(u.sz || 1) < 0.5 ? 20 : 24, 10];
    case 'deployed': return [12, (u.sz || 1) < 0.5 ? 24 : 34];
    default: return [10, 10];
  }
}
const rad = (u) => (RAD[u.form] || 10) * (0.75 + 0.25 * (u.sz || 1));
// length of segment a-b inside the unit's rectangle (roundshot penetration)
function clipLen(u, ax, ay, bx, by) {
  const [d, w] = dims(u), c = Math.cos(-u.ang), s = Math.sin(-u.ang);
  const lx = (x, y) => (x - u.x) * c - (y - u.y) * s, ly = (x, y) => (x - u.x) * s + (y - u.y) * c;
  const x0 = lx(ax, ay), y0 = ly(ax, ay), x1 = lx(bx, by), y1 = ly(bx, by);
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0, hx = d / 2 + 1, hy = w / 2 + 1;
  for (const [p, q] of [[-dx, x0 + hx], [dx, hx - x0], [-dy, y0 + hy], [dy, hy - y0]]) {
    if (p === 0) { if (q < 0) return 0; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return 0; if (r > t0) t0 = r; } else { if (r < t0) return 0; if (r < t1) t1 = r; }
  }
  return Math.max(0, t1 - t0) * Math.hypot(dx, dy);
}
// half-width of the target as seen along a line of fire coming from (x,y)
function perpHalf(o, x, y) {
  const [d, w] = dims(o), phi = Math.atan2(o.y - y, o.x - x) - o.ang;
  return Math.abs(d / 2 * Math.sin(phi)) + Math.abs(w / 2 * Math.cos(phi));
}
// angle of an attack coming from (x,y) relative to the unit's front: 0 front .. PI rear
const attackAngle = (o, x, y) => Math.abs(angDiff(Math.atan2(y - o.y, x - o.x), o.ang));

// ---------------------------------------------------------------- line of sight & spotting
// returns 0 when blocked, otherwise a visibility factor (hedges, walls and gunsmoke thin it out)
function sight(ax, ay, bx, by) {
  const ha = houseAt(ax, ay), hb = houseAt(bx, by);
  const d = dxy(ax, ay, bx, by), n = Math.ceil(d / 6);
  const za = heightAt(ax, ay) + 2, zb = heightAt(bx, by) + 2;
  let trees = 0, f = 1, inH = false;
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
    const k = cellIdx(x, y);
    const h = hid[k];
    if (h && h !== ha && h !== hb) return 0;
    const t = terr[k];
    if (t === T_TREE && i > 3 && i < n - 3 && ++trees > 5) return 0;
    if ((t === T_HEDGE || t === T_WALL) && i > 2 && i < n - 2) { if (!inH) { f *= 0.6; inH = true; } }
    else inH = false;
    if (i * 6 > 18 && (n - i) * 6 > 18 && hgt[k] > za + (zb - za) * i / n + 0.6) return 0; // hill crest
  }
  for (const s of G.smokes) {
    if (s.r < 10) continue;
    if (segDist(s.x, s.y, ax, ay, bx, by) < s.r * 0.85) {
      f *= 1 - s.dens * clamp((s.life - s.age) / 3, 0, 1);
      if (f < 0.18) return 0;
    }
  }
  return f;
}
const LOS = (ax, ay, bx, by) => sight(ax, ay, bx, by) > 0;
const losKey = (a, b) => (a.side === 0 ? a.id * 512 + b.id : b.id * 512 + a.id);
function losU(a, b) { return a.side === b.side ? 1 : (G.los.get(losKey(a, b)) || 0); }

function fogMul(a, b) {
  if (G.fog <= 0) return 1;
  const hf = (heightAt(a.x, a.y) + heightAt(b.x, b.y)) / (2 * HMAX);
  return 1 - G.fog * (0.62 - 0.2 * hf);
}
function spotRange(a, b) {
  let r = 540;
  r *= [1, 0.62, 0.5][coverAt(b.x, b.y)];
  if (b.kind === 'light') r *= b.moving ? 0.85 : 0.72;
  else if (b.kind === 'cmdr') r *= 0.75;
  else r *= 1.1;
  if (!b.moving) r *= b.order.type === 'hold' ? 0.8 : 0.9;
  if (G.time - b.lastFired < 2) r *= 1.6;
  if (a.state >= 3) r *= 0.6;
  if (heightAt(a.x, a.y) > heightAt(b.x, b.y) + 8) r *= 1.2;
  if (inHouse(a)) r *= 1.1;
  r *= fogMul(a, b);
  return Math.max(r, 70);
}
function updateVis() {
  G.los.clear();
  const A = G.units.filter(live);
  const s0 = A.filter(u => u.side === 0), s1 = A.filter(u => u.side === 1);
  for (const a of s0) for (const b of s1) {
    if (dist(a, b) < 760) G.los.set(losKey(a, b), sight(a.x, a.y, b.x, b.y));
  }
  for (const [mine, theirs, s] of [[s0, s1, 0], [s1, s0, 1]]) {
    for (const b of theirs) {
      for (const a of mine) {
        const f = losU(a, b);
        if (f > 0 && dist(a, b) <= Math.max(60, spotRange(a, b) * (0.5 + 0.5 * f))) { b.seenUntil[s] = G.time + 1.0; break; }
      }
    }
  }
  for (const b of s1) {
    const now = isSeen(b, 0);
    if (b.wasSeen && !now) G.ghosts.push({ x: b.x, y: b.y, t: G.time, ang: b.ang, form: b.form });
    b.wasSeen = now;
  }
  G.ghosts = G.ghosts.filter(g => G.time - g.t < 8);
}

// ---------------------------------------------------------------- floating icons
const FLOAT_CD = { hit: 0.7, sup: 1.6, pin: 2, panic: 2, star: 1, ammo: 6, broken: 2, clash: 0.5, blown: 3 };
function floater(u, kind) {
  if (!(u.side === 0 || isSeen(u, 0))) return;
  if (G.time - (u.fT[kind] ?? -99) < FLOAT_CD[kind]) return;
  u.fT[kind] = G.time;
  G.floaters.push({ x: u.x + rnd(-4, 4), y: u.y, kind, t: 0 });
}

// ---------------------------------------------------------------- combat
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const accMul = (u) => (u.side === 1 ? DIFFS[G.diff].acc : 1);
function hitChance(u, w, d, o, losF) {
  let p = w.acc * (1 - (d / w.range) * w.fall);
  p *= [1, 0.6, 0.42][coverAt(o.x, o.y)];
  if (o.moving) p *= 1.05;
  p *= 0.6 + 0.4 * (losF ?? losU(u, o));
  if (u.moving) p *= 0.5;
  p *= [1, 0.8, 0.55, 0, 0][u.state];
  p *= [0.85, 1, 1.15][u.exp];
  if (u.order.type === 'hold' && !u.moving) p *= 1.1;
  if (heightAt(u.x, u.y) > heightAt(o.x, o.y) + 8) p *= 1.1;
  if (terrAt(u.x, u.y) === T_STREAM) p *= 0.6;
  p *= accMul(u);
  return clamp(p, 0.02, 0.95);
}
// roundshot spread (sideways, px) at distance d
const gunScatter = (u, d) => (8 + d * 0.035) * (1.25 - u.exp * 0.15) * (u.state >= 1 ? 1.25 : 1) / accMul(u);
function gunHitP(u, w, d, o, losF) {
  const lf = 0.6 + 0.4 * (losF ?? (o.id != null ? losU(u, o) : 1));
  if (d <= w.can) return clamp(0.85 * (1 - 0.4 * d / w.can) * (VULN[o.form] || 1) * [1, 0.65, 0.45][coverAt(o.x, o.y)] * accMul(u), 0.05, 0.95);
  const half = o.id != null ? perpHalf(o, u.x, u.y) : 12;
  const sd = gunScatter(u, d) * 0.58;
  return clamp(erf(half / (sd * 1.4142)) * lf * [1, 0.85, 0.75][coverAt(o.x, o.y)], 0.03, 0.95);
}
function suppress(o, amt, src) {
  if (!o.alive || amt <= 0) return;
  let m = [1.2, 1, 0.8][o.exp] * [1, 0.75, 0.55][coverAt(o.x, o.y)];
  if (o.order.type === 'hold') m *= 0.9;
  if (o.type === 'guard') m *= 0.7;
  if (o.morale > 3) o.morale = Math.max(3, o.morale - amt * m); // suppression alone can't break a unit
  o.lastHit = G.time;
  o.threat = { x: src.x, y: src.y, id: src.id };
  if (amt * m > 3) floater(o, 'sup');
}
function damage(o, amt, src) {
  if (!o.alive || amt <= 0.05) return;
  o.hp -= amt;
  if (src && G.stats.dmg) { const k = src.side + (src.kind === 'art' ? (dist(src, o) <= (WPN[src.t.w].can || 0) + 20 ? 'can' : 'ball') : src.kind) + (o.state >= 3 ? 'R' : ''); G.stats.dmg[k] = (G.stats.dmg[k] || 0) + Math.min(amt, o.hp + amt); }
  o.morale -= amt * 1.1 * [1.2, 1, 0.8][o.exp] * (o.type === 'guard' ? 0.7 : 1) / (o.side === 1 ? DIFFS[G.diff].mor : 1);
  o.lastHit = G.time;
  if (src) o.threat = { x: src.x, y: src.y, id: src.id };
  if (amt >= 2) floater(o, 'hit');
  if (o.hp <= 0) kill(o, src);
}
function kill(o, src) {
  if (!o.alive) return;
  o.alive = false; o.hp = 0; o.path = [];
  o.deadSeen = o.side === 0 || isSeen(o, 0) || G.time - o.lastFired < 3;
  G.stats.dead[o.side]++;
  if (src) src.kills++;
  for (const f of G.units) if (live(f) && f.side === o.side && dist(f, o) < (o.kind === 'cmdr' ? 400 : 170)) f.morale -= o.kind === 'cmdr' ? 22 : 10 * (o.sz || 1);
  if (o.side === 0) { toast('✖ ' + o.name); buzz([50, 40, 50]); }
  else if (o.deadSeen) toast('✔ ' + o.name);
  G.sel = G.sel.filter(u => u !== o);
}
function shakeAt(x, y, amp) {
  if (G.silent) return;
  const cx = cam.x + VW / cam.z / 2, cy = cam.y + VH / cam.z / 2;
  const half = Math.max(VW, VH) / cam.z / 2;
  G.shake = Math.max(G.shake, amp * clamp(1.3 - dxy(x, y, cx, cy) / (half * 1.4), 0, 1));
}
function addBoom(x, y, r, kind, ang) { if (!G.silent) G.booms.push({ x, y, r, t: 0, kind: kind || 'dust', ang }); }
function addGunsmoke(x, y, maxR, life, dens) {
  for (const s of G.smokes) {
    if (s.age < 5 && dxy(s.x, s.y, x, y) < 16) { s.age = Math.min(s.age, 1); s.dens = Math.min(0.6, s.dens + dens * 0.35); s.maxR = Math.max(s.maxR, maxR); s.life = Math.max(s.life, life); return; }
  }
  G.smokes.push({ x, y, r: 4, maxR, age: 0, life, dens });
  if (G.smokes.length > 70) G.smokes.shift();
}
function frontPt(u, k = 0, ahead = 0) {
  const [d, w] = dims(u), c = Math.cos(u.ang), s = Math.sin(u.ang);
  return { x: u.x + c * (d / 2 + ahead) - s * w * k, y: u.y + s * (d / 2 + ahead) + c * w * k };
}
function tracer(u, x, y) { if (!G.silent) G.tracers.push({ x1: u.x, y1: u.y, x2: x, y2: y, t: 0, side: u.side, sid: u.id }); }

const TSF = (o) => 0.6 + 0.4 * (o.sz || 1); // a 2-gun section or a squadron pair is a narrower target for musketry
function fireVolley(u, w, tgt, area) {
  const fp = (0.45 + 0.55 * hpf(u)) * (FORM_FIRE[u.form] ?? 1) * (u.sz || 1);
  if (u.side === 0 || isSeen(u, 0) || dist(u, tgt || area) < 400) SFX.shot(u.t.w, u);
  const tx = tgt ? tgt.x : area.x, ty = tgt ? tgt.y : area.y;
  if (!G.silent) for (const k of (u.form === 'line' ? [-0.35, 0, 0.35] : [0])) {
    const p = frontPt(u, k);
    G.tracers.push({ x1: p.x, y1: p.y, x2: tx + rnd(-14, 14), y2: ty + rnd(-14, 14), t: 0, side: u.side, sid: u.id });
  }
  const fpnt = frontPt(u, 0, 12);
  if (u.kind === 'light') addGunsmoke(fpnt.x, fpnt.y, 14, 7, 0.12);
  else addGunsmoke(fpnt.x, fpnt.y, 22, 9, 0.22);
  if (tgt) {
    const d = dist(u, tgt), p = hitChance(u, w, d, tgt);
    suppress(tgt, w.supp * fp, u);
    damage(tgt, w.dmg * fp * p * rnd(0.75, 1.25) * (VULN[tgt.form] || 1) * TSF(tgt), u);
  } else {
    for (const o of G.units) {
      if (!live(o) || o.side === u.side) continue;
      const dd = dxy(o.x, o.y, area.x, area.y);
      if (dd < 55) {
        suppress(o, w.supp * fp * 0.8, u);
        damage(o, w.dmg * fp * hitChance(u, w, dist(u, o), o) * 0.45 * rnd(0.7, 1.2) * (VULN[o.form] || 1) * TSF(o), u);
      }
    }
  }
}
function fireGun(u, w, x, y, tgt) {
  const d = dxy(u.x, u.y, x, y), fp = (0.5 + 0.5 * hpf(u)) * (u.sz || 1);
  if (u.side === 0 || isSeen(u, 0) || d < 500) SFX.shot(d <= w.can ? 'canister' : 'cannon', u);
  const fpnt = frontPt(u, 0, 16);
  addGunsmoke(fpnt.x, fpnt.y, 30, 13, 0.4);
  if (d <= w.can) { canister(u, w, x, y, fp); return; }
  const a = Math.atan2(y - u.y, x - u.x), off = (rnd() + rnd() + rnd() - 1.5) * gunScatter(u, d) * 1.15;
  const ax = x - Math.sin(a) * off, ay = y + Math.cos(a) * off;
  const g = d * rnd(0.84, 0.95), e = d + 150;
  const ca = Math.cos(Math.atan2(ay - u.y, ax - u.x)), sa = Math.sin(Math.atan2(ay - u.y, ax - u.x));
  G.shells.push({ x0: u.x, y0: u.y, gx: u.x + ca * g, gy: u.y + sa * g, ex: clamp(u.x + ca * e, 0, W), ey: clamp(u.y + sa * e, 0, H), t: 0, dur: 0.15 + g / 700, w, fp, src: u });
}
function roundshot(s) {
  const src = s.src, w = s.w;
  const hits = [];
  for (const o of G.units) {
    if (!live(o) || o.side === src.side) continue;
    const L = clipLen(o, s.gx, s.gy, s.ex, s.ey);
    if (L > 0) hits.push([dxy(s.gx, s.gy, o.x, o.y), o, L]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  let energy = 1;
  for (const [, o, L] of hits) {
    let dm = w.dmg * s.fp * energy * clamp(L / 18, 0.35, 2.4) * [1, 0.7, 0.5][coverAt(o.x, o.y)] * rnd(0.8, 1.2);
    if (o.kind === 'light') dm *= 0.4; else if (o.kind === 'cmdr') dm *= 0.5;
    suppress(o, w.supp * energy * (src.sz || 1), src);
    damage(o, dm, src);
    energy *= 0.6;
  }
  if (!G.silent) {
    addBoom(s.gx, s.gy, 9);
    const n = 3;
    for (let i = 1; i <= n; i++) G.dust.push({ x: s.gx + (s.ex - s.gx) * i / (n + 1), y: s.gy + (s.ey - s.gy) * i / (n + 1), t: -i * 0.06 });
    SFX.thud(s.gx, s.gy);
    if (hits.length && hits[0][1].side === 0) shakeAt(s.gx, s.gy, 3);
  }
}
function canister(u, w, x, y, fp) {
  const a0 = Math.atan2(y - u.y, x - u.x);
  addBoom(u.x + Math.cos(a0) * 20, u.y + Math.sin(a0) * 20, w.can, 'cone', a0);
  for (const o of G.units) {
    if (!live(o) || o.side === u.side) continue;
    const d = dist(u, o);
    if (d > w.can + rad(o)) continue;
    if (Math.abs(angDiff(Math.atan2(o.y - u.y, o.x - u.x), a0)) > 0.32 + rad(o) / Math.max(d, 1)) continue;
    const dm = w.canDmg * fp * (1 - 0.5 * Math.min(d, w.can) / w.can) * (VULN[o.form] || 1) * [1, 0.65, 0.45][coverAt(o.x, o.y)] * [0.85, 1, 1.15][u.exp] * accMul(u) * rnd(0.8, 1.2) * TSF(o);
    suppress(o, w.supp * 1.6 * (u.sz || 1), u);
    damage(o, dm, u);
  }
  shakeAt(u.x, u.y, 4);
  if (u.side === 1 && G.units.some(f => f.side === 0 && live(f) && dist(f, u) < w.can)) buzz(30);
}
function pushBack(u, from, len) {
  if (!u.alive) return;
  let vx = u.x - from.x, vy = u.y - from.y; const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
  for (const k of [1, 0.6, 0.3]) {
    const px = clamp(u.x + vx * len * k, 15, W - 15), py = clamp(u.y + vy * len * k, 15, H - 15);
    if (passAt(px, py, isArt(u)) && lineOK(u, { x: px, y: py }, isArt(u))) {
      if (u.state < 3) { u.path = [{ x: px, y: py }]; u.mode = 'move'; u.order = { type: 'move', back: true }; }
      return;
    }
  }
}
// melee: a charge hits home. Cavalry momentum vs formation, flank, terrain, state and fatigue
// mass of a charge: the sizes of friendly units charging the same target close together (a lone
// squadron pair hits with half the weight of the full regiment; two pairs side by side hit like one)
function chargeMass(a, d) {
  let m = a.sz || 1;
  if (m >= 1) return m;
  for (const o of G.units) if (o !== a && live(o) && o.side === a.side && o.order.type === 'charge' && o.order.target === d && dist(o, a) < 90) m += o.sz || 1;
  return m;
}
function meleePowers(a, d) {
  const D = DIFFS[G.diff];
  const mom = isCav(a) ? clamp(a.chargeD / 160, 0.35, 1) : clamp(a.chargeD / 90, 0.5, 1);
  const ang = attackAngle(d, a.x, a.y);
  const flank = ang > 2.1 ? 'rear' : ang > 1.0 ? 'flank' : 'front';
  const vsCav = isCav(a);
  const SM = [1, 0.85, 0.6, 0.3, 0.2];
  let ap = a.t.melee * Math.sqrt(hpf(a)) * SM[a.state] * [0.85, 1, 1.15][a.exp] * (1 - a.fat / 220);
  if (vsCav) ap *= a.t.charge * (0.5 + 0.5 * mom);
  else ap *= ({ column: 1.3, line: 0.8, open: 0.55 }[a.form] || 0.6) * (0.8 + 0.2 * mom);
  const mass = chargeMass(a, d);
  ap *= Math.sqrt(clamp(mass, 0.25, 1));
  let dp = d.t.melee * Math.sqrt(hpf(d)) * [0.85, 1, 1.15][d.exp] * (1 - d.fat / 250);
  let fd;
  if (d.formT > 0) fd = vsCav && d.formTo === 'square' ? 0.75 + 3.0 * clamp(1 - d.formT / (d.formT0 || 1), 0, 1) ** 1.5 : 0.5;
  else switch (d.form) {
    case 'square': fd = vsCav ? 4.2 : 0.9; break;
    case 'line': fd = vsCav ? 0.75 : 1; break;
    case 'column': fd = vsCav ? 1.0 : 1.15; break;
    case 'open': fd = vsCav ? 0.35 : 0.55; break;
    case 'mounted': fd = d.fat < 50 ? 0.9 * d.t.charge : 0.6; break;
    case 'deployed': fd = 0.35; break;
    case 'limbered': fd = 0.2; break;
    default: fd = 0.3;
  }
  dp *= fd * Math.sqrt(d.sz || 1);
  if (d.form !== 'square' && d.formT <= 0) dp *= flank === 'rear' ? (d.form === 'line' ? 0.3 : 0.55) : flank === 'flank' ? (d.form === 'line' ? 0.42 : 0.75) : 1;
  dp *= SM[d.state];
  if (inHouse(d)) dp *= vsCav ? 2.5 : 1.6; else if (coverAt(d.x, d.y) === 1) dp *= 1.25;
  if (terrAt(d.x, d.y) === T_STREAM) dp *= 0.7;
  if (terrAt(a.x, a.y) === T_STREAM) ap *= 0.7;
  if (d.order.type === 'hold' && d.state === 0) dp *= 1.1;
  if (a.side === 1) ap *= D.mor; else dp *= D.mor;
  return { ap, dp, vsCav, mass };
}
function resolveMelee(a, d) {
  const { ap, dp, vsCav, mass } = meleePowers(a, d);
  const r = clamp(ap / (ap + dp) + rnd(-0.1, 0.1), 0.03, 0.97);
  const sq = d.form === 'square' && vsCav && d.formT <= 0;
  const as = a.sz || 1, ds = d.sz || 1;
  const toD = (vsCav ? 32 : 24) * r * (sq ? 0.4 : 1) * as;            // each piece of a combined charge deals its share
  const toA = (22 * (1 - r) + (sq ? 10 : 0)) * (as / Math.max(mass, as)) * ds; // ...and shares the losses
  a.meleeT = d.meleeT = G.time;
  G.stats.charges[a.side]++;
  if (sq) G.stats.squares[d.side]++;
  const seen = a.side === 0 || d.side === 0 || isSeen(a, 0);
  if (seen) { floater(d, 'clash'); SFX.clash((a.x + d.x) / 2, (a.y + d.y) / 2, vsCav); shakeAt(d.x, d.y, vsCav ? 6 : 4); addBoom((a.x + d.x) / 2, (a.y + d.y) / 2, 22); }
  if (d.side === 0 || a.side === 0) buzz(vsCav ? [40, 30, 40] : 30);
  damage(d, toD, a); damage(a, toA, d);
  if (r >= 0.55) {
    if (d.alive) { d.morale -= (30 + 60 * (r - 0.5)) * as; if (d.state < 3) pushBack(d, a, 60); }
    a.morale = Math.min(100, a.morale + 8);
  } else if (r <= 0.45) {
    a.morale -= 22 + 50 * (0.5 - r);
    pushBack(a, d, vsCav ? 110 : 70);
    d.morale = Math.min(100, d.morale + 6);
  } else {
    pushBack(a, d, 60); d.morale -= 10; a.morale -= 8;
  }
  if (a.order.type === 'charge') a.order = a.path.length ? { type: 'move', back: true } : { type: 'idle' };
  a.mode = 'move';
  a.fat = Math.min(100, a.fat + (vsCav ? 35 : 15));
  if (vsCav && a.fat >= 50) floater(a, 'blown');
  a.chargeD = 0;
  if (a.side === 0 && sq) toast('◻ ✖ ' + a.name);
}
function validTarget(u, o, w) {
  if (!live(o) || o.side === u.side || !isSeen(o, u.side)) return false;
  const d = dist(u, o);
  if (d > w.range) return false;
  if (!(losU(u, o) > 0)) return false;
  return true;
}
function canAct(u) { return u.state < 3; }
function updateFire(u) {
  u.cool -= DT; if (u.flash > 0) u.flash -= DT;
  if (!u.t.w || !canAct(u) || u.formT > 0) return;
  if (isArt(u) && u.form !== 'deployed') return;
  if (u.moving && u.kind !== 'light') return;
  if (u.order.type === 'charge') return;
  if (u.ammo <= 0 || u.cool > 0) return;
  const w = WPN[u.t.w];
  let tgt = null, area = null;
  const ord = u.order;
  if (ord.type === 'fire') {
    const o = ord.target;
    if (!live(o)) u.order = { type: 'idle' };
    else if (validTarget(u, o, w)) { tgt = o; ord.lastOk = G.time; }
    else if (G.time - (ord.lastOk || ord.t) > 4) u.order = { type: 'idle' };
  } else if (ord.type === 'area') {
    if (G.time > ord.until) u.order = { type: 'idle' };
    else area = ord;
  }
  if (!tgt && !area) {
    let bs = 1e9;
    const ambush = ord.type === 'hold' && G.time - u.lastHit > 3 && !isArt(u);
    for (const o of G.units) {
      if (!validTarget(u, o, w)) continue;
      const d = dist(u, o);
      if (ambush && d > w.range * 0.7) continue;
      let s = d / w.range;
      if (o.order.type === 'charge' && o.order.target && o.order.target.side === u.side && d < 260) s -= 0.6; // closing volley at chargers
      if (u.threat && u.threat.id === o.id) s -= 0.2;
      if (o.state >= 3) s += 1.0;
      if (Math.abs(angDiff(Math.atan2(o.y - u.y, o.x - u.x), u.ang)) > FIRE_ARC[u.form]) s += 0.35;
      if (w.gun && (o.form === 'column' || o.form === 'square')) s -= 0.15;
      if (s < bs) { bs = s; tgt = o; }
    }
  }
  if (!tgt && !area) return;
  const tx = tgt ? tgt.x : area.x, ty = tgt ? tgt.y : area.y;
  u.aimAng = Math.atan2(ty - u.y, tx - u.x); u.aimT = G.time;
  if (Math.abs(angDiff(u.aimAng, u.ang)) > FIRE_ARC[u.form]) { u.cool = 0.3; return; } // wheel to face first
  if (w.gun) fireGun(u, w, tx, ty, tgt); else fireVolley(u, w, tgt, area);
  u.ammo--; u.lastFired = G.time; u.flash = 0.12;
  u.cool = w.rof * rnd(0.85, 1.15) * (u.state === 2 ? 1.5 : 1) * (u.form === 'square' ? 1.25 : 1);
  if (u.side === 0 && u.ammo === Math.floor(u.ammoMax * 0.2)) toast('⚠ ⁍ ' + u.name);
}
function updateShells() {
  for (const s of G.shells) {
    s.t += DT;
    if (s.t >= s.dur && !s.done) { s.done = true; roundshot(s); }
  }
  G.shells = G.shells.filter(s => !s.done);
}

// ---------------------------------------------------------------- morale, rally, resupply, fatigue
function cmdrNear(u, r = RALLY_R) {
  return G.units.find(o => o !== u && o.kind === 'cmdr' && live(o) && o.side === u.side && o.state <= 1 && dist(o, u) < r);
}
const nearCmdr = (u) => !!cmdrNear(u);
function rallyCheck(u, off) {
  if (u.kind === 'cmdr') { u.rallyT = 0; return; }
  if (off && G.time - u.lastHit > 2.5) {
    u.rallyT += DT;
    if (u.rallyT >= (u.state === 4 ? 6 : 3.5)) {
      u.state = 1; u.morale = 48; u.rallyT = 0; u.path = []; u.order = { type: 'idle' };
      G.stats.rallied[u.side]++;
      floater(u, 'star');
      if (u.side === 0) { toast('⭐ ' + u.name); SFX.rally(); }
    }
  } else u.rallyT = Math.max(0, u.rallyT - DT * 2);
}
function updateMorale(u) {
  const off = nearCmdr(u);
  if (u.state >= 3) rallyCheck(u, off);
  if (u.state === 4) return;
  const maxM = 30 + 65 * hpf(u) + (off ? 10 : 0) + u.exp * 3 + (u.type === 'guard' ? 10 : 0);
  if (G.time - u.lastHit > 2.5) {
    const rec = (3 + u.exp * 1.5) * (off ? 2 : 1) * (u.kind === 'cmdr' ? 1.3 : 1) * (inHouse(u) ? 1.25 : 1);
    if (u.morale < maxM) u.morale = Math.min(maxM, u.morale + rec * DT);
  }
  if (u.morale > maxM) u.morale = Math.max(maxM, u.morale - 1.5 * DT);
  // shock of an incoming charge (a square or a steady line facing it shrugs it off)
  if (u.state >= 1 && u.state < 3 && u.form !== 'square') {
    for (const o of G.units) {
      if (o.side === u.side || !live(o) || o.order.type !== 'charge' || o.order.target !== u || dist(o, u) > 130) continue;
      u.morale -= (isCav(o) ? 6 : 3) * DT * (attackAngle(u, o.x, o.y) > 1 ? 1.6 : 1);
      break;
    }
  }
  u.morale = Math.min(u.morale, 100);
  let s = u.morale >= 62 ? 0 : u.morale >= 40 ? 1 : u.morale >= 18 ? 2 : u.morale > -12 ? 3 : 4;
  if (u.state === 3 && s === 2 && u.morale < 24) s = 3;
  if (s === 4) return enterBroken(u);
  if (s === 3 && u.state < 3) { u.state = 3; enterPanic(u); return; }
  if (s < 3 && u.state === 3) { u.path = []; u.order = { type: 'idle' }; }
  if (u.state === 3) {
    u.fleeT -= DT;
    if (!u.path.length && G.time - u.lastHit < 1.5 && u.fleeT <= 0) enterPanic(u);
  }
  if (s === 2 && u.state < 2) { floater(u, 'pin'); if (u.side === 0) toast('▼ ' + u.name); }
  u.state = s;
}
function homeX(side) { return side === 0 ? 12 : W - 12; }
function disorder(u) {
  u.formT = 0; u.formTo = null; u.chargeD = 0;
  if (isInf(u) && u.form !== 'column') u.form = 'column';
  if (isArt(u)) u.form = 'limbered';
}
function enterPanic(u) {
  u.fleeT = 4; disorder(u);
  const th = u.threat || { x: u.side === 0 ? u.x + 100 : u.x - 100, y: u.y };
  let vx = u.x - th.x, vy = u.y - th.y; const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
  vx += u.side === 0 ? -0.8 : 0.8;
  const l2 = Math.hypot(vx, vy) || 1;
  const ax = clamp(u.x + vx / l2 * 170, 20, W - 20), ay = clamp(u.y + vy / l2 * 170, 20, H - 20);
  const c = isArt(u) ? null : coverNear(ax, ay, 70, u.side);
  const p = findPath(u.x, u.y, c ? c.x : ax, c ? c.y : ay, isArt(u));
  u.path = p || []; u.mode = 'quick'; u.order = { type: 'flee' };
  floater(u, 'panic');
  if (u.side === 0) toast('! ' + u.name);
}
function enterBroken(u) {
  u.state = 4; u.morale = -12; u.rallyT = 0; disorder(u);
  const p = findPath(u.x, u.y, homeX(u.side), u.y, isArt(u));
  u.path = p || []; u.mode = 'quick'; u.order = { type: 'rout' };
  G.sel = G.sel.filter(s => s !== u);
  floater(u, 'broken');
  toast((u.side === 0 ? '🏳 ' : '✔ ') + u.name);
}
const inHomeZone = (u) => (u.side === 0 ? (u.x < 585 || (u.x < 735 && u.y > 760)) : u.x > 1420);
function resupply(u) {
  if (!u.ammoMax || u.state >= 3) return;
  const zone = inHomeZone(u);
  const off = nearCmdr(u);
  if ((!zone && !off) || G.time - u.lastFired < 6) return;
  if (u.ammo < u.ammoMax) {
    const rate = (zone ? 0.02 : 0.012) * (isArt(u) ? 0.5 : 1);
    u.ammoF += u.ammoMax * rate * DT;
    let gained = false;
    while (u.ammoF >= 1 && u.ammo < u.ammoMax) { u.ammo++; u.ammoF--; gained = true; }
    if (gained && u.side === 0) floater(u, 'ammo');
  }
}
// stragglers drift back to the colours: slow hp recovery out of action, in the home zone or near the commander
function regroup(u) {
  if (u.kind === 'cmdr' || u.state >= 3 || G.time - u.lastHit < 15 || u.hp >= u.maxHp * 0.7) return;
  if (!inHomeZone(u) && !nearCmdr(u)) return;
  u.hp = Math.min(u.maxHp * 0.7, u.hp + u.maxHp * 0.0035 * DT);
}
function updateFatigue(u) {
  if (isArt(u) || u.kind === 'cmdr') return;
  const cav = isCav(u);
  if (u.moving && u.order.type === 'charge') u.fat += (cav ? 7 : 5) * DT;
  else if (u.moving && u.mode === 'quick' && u.state < 3) u.fat += (cav ? 3.5 : 1.5) * DT;
  else if (G.time - u.meleeT > 3) u.fat -= (cav ? 3.2 : 2.5) * DT * (u.moving ? 0.6 : 1);
  u.fat = clamp(u.fat, 0, 100);
}

// ---------------------------------------------------------------- formations, movement, facing, charges
const FORM_T = { 'line>column': 4, 'column>line': 4, 'line>square': 3, 'column>square': 2.5, 'square>line': 4, 'square>column': 3.5, 'deployed>limbered': 4, 'limbered>deployed': 5 };
function setForm(u, f, instant) {
  if (u.formT > 0 && u.formTo === f) return;
  if (u.form === f && u.formT <= 0) return;
  if (u.form === f) { u.formT = 0; u.formTo = null; return; } // cancel a change in progress
  const t = (FORM_T[u.form + '>' + f] || 4) * [1.25, 1, 0.8][u.exp] * (u.state >= 1 ? 1.2 : 1);
  if (instant || G.phase === 'deploy') { u.form = f; u.formTo = null; u.formT = 0; u._vis = null; return; }
  u.formTo = f; u.formT = t; u.formT0 = t; u.formAt = G.time;
}
function updateForm(u) {
  if (u.formT > 0) {
    u.formT -= DT;
    if (u.formT <= 0) { u.form = u.formTo; u.formTo = null; u.formT = 0; u._vis = null; if (u.form === 'deployed') u.depT = G.time; }
  }
}
function speedOf(u) {
  let sp;
  const quick = u.mode === 'quick';
  if (u.state >= 3) sp = isCav(u) ? 75 : u.kind === 'cmdr' ? 70 : 44;
  else if (u.order.type === 'charge') sp = isCav(u) ? 100 : 44;
  else switch (u.kind) {
    case 'inf': sp = (quick ? 34 : 22) * ({ line: 0.55, column: 1, square: 0.28 }[u.form] || 1); break;
    case 'light': sp = quick ? 38 : 25; break;
    case 'cav': sp = quick ? 68 : 34; break;
    case 'art': sp = quick ? 34 : 24; break;
    default: sp = quick ? 70 : 42;
  }
  sp *= u.t.spd;
  const t = terrAt(u.x, u.y);
  if (t === T_ROAD || t === T_BRIDGE) sp *= isArt(u) ? 1.2 : 1.08;
  else if (t === T_HOUSE) sp *= isCav(u) ? 0.45 : 0.6;
  else if (t === T_TREE) sp *= isCav(u) ? 0.5 : isArt(u) ? 0.45 : 0.65;
  else if (t === T_STREAM) sp *= 0.45;
  else if (t === T_HEDGE || t === T_WALL) sp *= 0.7;
  if (u.state === 1) sp *= 0.92;
  if (u.fat > 60) sp *= 0.6;
  if (u.order.back) sp *= 0.7;
  return sp;
}
const TURN = { line: 0.9, column: 2.2, square: 0.8, open: 3, mounted: 3, limbered: 2, deployed: 0.8, staff: 4 };
function turnTo(u, want) {
  const da = angDiff(want, u.ang), tr = (TURN[u.form] || 2) * DT;
  if (Math.abs(da) <= tr) { u.ang = want; return 0; }
  u.ang += Math.sign(da) * tr; return Math.abs(da) - tr;
}
function updateMove(u) {
  u.moving = false;
  if (u.order.type === 'charge') return updateCharge(u);
  if (!u.path.length) return;
  if (u.formT > 0) return;
  if (u.state === 2 && waverBlock(u)) return; // wavering: won't advance on the enemy (may fall back)
  if (u.order.type === 'hold') { u.path = []; return; }
  if (isArt(u) && u.form === 'deployed') { setForm(u, 'limbered'); return; }
  const p = u.path[0];
  const d = dxy(u.x, u.y, p.x, p.y);
  if (!u.order.back && d > 0.5) {
    const rem = turnTo(u, Math.atan2(p.y - u.y, p.x - u.x));
    if (u.form === 'line' && rem > 1.0 && u.state < 3) return; // wheel before advancing in line
  }
  const stp = speedOf(u) * DT;
  if (u.state < 3 && d > 0.01) {
    const k = Math.min(stp, d) / d, nx = u.x + (p.x - u.x) * k, ny = u.y + (p.y - u.y) * k;
    for (const o of G.units) {
      if (!live(o) || o.side === u.side || o.state >= 4) continue;
      const dn = dxy(nx, ny, o.x, o.y);
      if (dn < rad(u) + rad(o) + 6 && dn < dist(u, o)) { u.path = []; if (u.order.type === 'move') u.order = { type: 'idle' }; return; }
    }
  }
  u.moving = true;
  if (d <= stp) {
    u.x = p.x; u.y = p.y; u.path.shift();
    if (!u.path.length) arrive(u);
  } else { u.x += (p.x - u.x) / d * stp; u.y += (p.y - u.y) / d * stp; }
}
function waverBlock(u) {
  const p = u.path[0]; let ne = null, nd = 320;
  for (const o of G.units) { if (!live(o) || o.side === u.side || o.state >= 3) continue; const d = dist(o, u); if (d < nd) { nd = d; ne = o; } }
  return !!ne && dxy(p.x, p.y, ne.x, ne.y) < nd - 1;
}
function arrive(u) {
  if (u.order.type === 'move') u.order = { type: 'idle' };
  if (u.order.type === 'rout' && (u.x < 30 || u.x > W - 30)) { u.fled = true; G.stats.fled[u.side]++; G.sel = G.sel.filter(s => s !== u); }
  if (isArt(u) && u.form === 'limbered' && u.state < 3) setForm(u, 'deployed');
}
function updateCharge(u) {
  const o = u.order.target;
  if (!live(o) || u.state >= 2 || (!isSeen(o, u.side) && G.time - (u.order.seenT || 0) > 2) || (!isCav(u) && o.state >= 4)) {
    u.order = { type: 'idle' }; u.path = []; u.chargeD = 0; return;
  }
  if (isSeen(o, u.side)) u.order.seenT = G.time;
  if (u.formT > 0) return;
  const d = dist(u, o);
  if (d <= rad(u) + rad(o) + 3) { resolveMelee(u, o); return; }
  if (u.chargeD > (isCav(u) ? 560 : 280)) { u.order = { type: 'idle' }; u.path = []; u.chargeD = 0; u.fat = Math.min(100, u.fat + 10); return; }
  let p;
  if (lineOK(u, o, false)) { p = o; u.path = []; }
  else {
    u.cpT -= DT;
    if (u.cpT <= 0 || !u.path.length) { u.cpT = 0.5; u.path = findPath(u.x, u.y, o.x, o.y, false) || []; }
    while (u.path.length && dxy(u.x, u.y, u.path[0].x, u.path[0].y) < 4) u.path.shift();
    p = u.path[0] || o;
  }
  turnTo(u, Math.atan2(p.y - u.y, p.x - u.x));
  const stp = speedOf(u) * DT, dd = dxy(u.x, u.y, p.x, p.y);
  if (dd < 0.01) return;
  const k = Math.min(stp, dd) / dd;
  u.x += (p.x - u.x) * k; u.y += (p.y - u.y) * k; u.chargeD += Math.min(stp, dd); u.moving = true;
  if (isCav(u) && !G.silent && Math.random() < 0.25) G.dust.push({ x: u.x - Math.cos(u.ang) * 10 + rnd(-8, 8), y: u.y - Math.sin(u.ang) * 10 + rnd(-8, 8), t: 0 });
}
function updateFace(u) {
  if (u.moving || u.formT > 0 || u.state >= 3 || u.form === 'square' || u.kind === 'cmdr') return;
  let want = null;
  if (u.aimT && G.time - u.aimT < 2.5) want = u.aimAng;
  else {
    let bd = isArt(u) ? 700 : 320, best = null;
    for (const o of G.units) if (live(o) && o.side !== u.side && isSeen(o, u.side)) { const d = dist(u, o); if (d < bd) { bd = d; best = o; } }
    if (best) want = Math.atan2(best.y - u.y, best.x - u.x);
    else if (u.threat && G.time - u.lastHit < 4) want = Math.atan2(u.threat.y - u.y, u.threat.x - u.x);
    else if (u.faceAng != null && !u.direct && !u.path.length) want = u.faceAng;
  }
  if (want != null) turnTo(u, want);
}
function separate() {
  const A = G.units.filter(live);
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const a = A[i], b = A[j];
    const min = a.side === b.side ? (rad(a) + rad(b)) * 0.75 : rad(a) + rad(b);
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= min || d < 0.01) continue;
    const push = (min - d) / 2 * 0.5, nx = dx / d * push, ny = dy / d * push;
    if (passAt(a.x - nx, a.y - ny, isArt(a))) { a.x -= nx; a.y -= ny; }
    if (passAt(b.x + nx, b.y + ny, isArt(b))) { b.x += nx; b.y += ny; }
  }
}

// ---------------------------------------------------------------- flags, reinforcements, Guard, fog, effects
function updateFlags() {
  for (const f of G.flags) {
    // present = can block a capture; cap = foot troops that can take it (steady/shaken, not under fire)
    const c = [0, 0], cap = [0, 0];
    for (const u of G.units) {
      if (!live(u) || u.state > 2 || dxy(u.x, u.y, f.x, f.y) >= CAP_R) continue;
      c[u.side]++;
      if ((isInf(u) || u.kind === 'light') && u.state <= 1 && G.time - u.lastHit > 1) cap[u.side]++;
    }
    f.contested = c[0] > 0 && c[1] > 0;
    const s = cap[0] && !c[1] ? 0 : cap[1] && !c[0] ? 1 : -1;
    if (s >= 0 && f.owner !== s) {
      if (f.capSide !== s) { f.capSide = s; f.prog = 0; }
      f.prog += DT / CAP_T;
      if (f.prog >= 1) {
        const prev = f.owner;
        f.owner = s; f.prog = 0; f.capSide = -1;
        toast((s === 0 ? '🚩 ' : '⚠ 🚩 ') + f.name);
        if (!G.auto) SFX.chime(s === 0);
        if (s === 0) buzz([20, 40, 20]);
        else if (prev === 0) buzz([80, 50, 80]);
      }
    } else if (!f.contested && !(f.capSide >= 0 && c[f.capSide])) { f.prog = Math.max(0, f.prog - DT / 6); if (!f.prog) f.capSide = -1; }
  }
}
function checkReinforce() {
  const D = DIFFS[G.diff];
  if (G.reinfDone || G.time < D.reinfT) return;
  G.reinfDone = true;
  const y0 = [480, 860, 300][Math.floor(Math.random() * 3)];
  const used = {};
  let i = 0;
  D.reinf.forEach((type) => {
    used[type] = (used[type] || 0);
    const nm = REINF_NAMES[type][used[type]++ % REINF_NAMES[type].length];
    const n = isArt({ kind: UT[type].kind }) ? 3 : UT[type].kind === 'cav' ? 2 : 1;
    for (let k = 0; k < n; k++, i++) {
      const name = n === 3 ? nm[0] + ' sec.' + (k + 1) : n === 2 ? nm[0] + ' sq.' + (k * 2 + 1) + '-' + (k * 2 + 2) : nm[0];
      const u = mkUnit(1, type, name, W - 16 - (i % 3) * 12, clamp(y0 + (i - 1.5) * 26, 30, H - 30), 1, nm[1], null, 1 / n);
      if (isArt(u)) u.form = 'limbered';
      u.aiCool = 0.5 + i * 0.3;
      joinDiv(u, 'dok');
      G.units.push(u);
    }
  });
  G.reinfAt = { y: y0, t: G.time };
  if (!G.auto) { toast('⚠ ➕ ' + D.reinf.length); SFX.bugle('alert'); }
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function commitGuard(auto) {
  if (G.guardIn || G.phase !== 'battle' || !G.guard || G.over) return false;
  if (!auto && G.time < GUARD_UNLOCK) { toast('🦅 ⏳ ' + fmt(GUARD_UNLOCK - G.time)); SFX.click(true); return false; }
  const u = G.guard;
  u.reserve = false; u.x = 16; u.y = 480; u.ang = 0; u.form = 'column'; u.home = { x: 270, y: 480 }; u.aiCool = 6;
  G.guardIn = true; G.guardAt = G.time;
  const p = findPath(u.x, u.y, 270, 480, false);
  if (p) { u.path = p; u.mode = 'move'; u.order = { type: 'move' }; }
  for (const f of G.units) if (live(f) && f.side === 0) f.morale = Math.min(100, f.morale + 8);
  if (!G.auto) { toast('🦅 La Garde!'); SFX.bugle('guard'); buzz([30, 50, 30, 50, 60]); }
  if (typeof refreshUI === 'function' && chips.length) { buildRoster(); refreshUI(true); }
  return true;
}
function updateFog() {
  G.fog = clamp(1 - (G.time - FOG0) / (FOG1 - FOG0), 0, 1);
  if (G.fog <= 0 && !G.fogToast) { G.fogToast = true; if (!G.auto) { toast('☀ The fog lifts'); SFX.bugle('sun'); } }
}
function updateFx() {
  for (const s of G.smokes) { s.age += DT; s.r = Math.min(s.maxR, s.r + DT * 20); s.x += G.wind.x * DT; s.y += G.wind.y * DT; }
  G.smokes = G.smokes.filter(s => s.age < s.life);
  for (const t of G.tracers) t.t += DT;
  G.tracers = G.tracers.filter(t => t.t < 0.2);
  for (const b of G.booms) b.t += DT;
  G.booms = G.booms.filter(b => b.t < 0.6);
  for (const f of G.floaters) f.t += DT;
  G.floaters = G.floaters.filter(f => f.t < 1.3);
  for (const d of G.dust) d.t += DT;
  G.dust = G.dust.filter(d => d.t < 1.1);
}
function armyState(s) {
  const arrived = G.units.filter(u => u.side === s && !u.reserve && u.kind !== 'cmdr');
  const w = (us) => us.reduce((t, u) => t + (u.sz || 1), 0);
  return { able: w(arrived.filter(u => live(u) && u.state < 4)), n: w(arrived) };
}
function checkEnd() {
  const a = [armyState(0), armyState(1)];
  const broken = a.map(x => x.able <= Math.floor(x.n * 0.3 + 1e-6) + 1e-6);
  let res = null;
  if (broken[0] || broken[1]) res = broken[1] && !broken[0] ? 'win' : broken[0] && !broken[1] ? 'lose' : 'draw';
  else if (G.time >= GAME_TIME) {
    const o0 = G.flags.filter(f => f.owner === 0).length, o1 = G.flags.filter(f => f.owner === 1).length;
    res = o0 > o1 ? 'win' : o1 > o0 ? 'lose' : 'draw';
  }
  if (res) endGame(res, broken[0] || broken[1]);
}

// ---------------------------------------------------------------- AI
function streamX(y) {
  for (let i = 0; i < STREAM.length - 1; i++) {
    const [x0, y0] = STREAM[i], [x1, y1] = STREAM[i + 1];
    if (y >= y0 && y <= y1) return x0 + (x1 - x0) * (y - y0) / (y1 - y0 || 1);
  }
  return STREAM[STREAM.length - 1][0];
}
function coverNear(x, y, r, side, toward, self) {
  let best = null, bs = -1e9;
  const r2 = r * r;
  for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      if (cx < 1 || cy < 1 || cx >= GW - 1 || cy >= GH - 1) continue;
      const px = cx * CELL + 5, py = cy * CELL + 5;
      const d2 = (px - x) ** 2 + (py - y) ** 2;
      if (d2 > r2 || !passAt(px, py, false)) continue;
      const t = terr[cy * GW + cx];
      if (t === T_STREAM) continue;
      let s = coverAt(px, py) * 30 - Math.sqrt(d2) * 0.1;
      if (toward) s -= dxy(px, py, toward.x, toward.y) * 0.05;
      for (const u of G.units) if (u !== self && live(u) && u.side === side && dxy(u.x, u.y, px, py) < 22) s -= 25;
      if (s > bs) { bs = s; best = { x: px, y: py }; }
    }
  return best;
}
function pointAlongFrom(x, y, goal, len, veh) {
  const p = findPath(x, y, goal.x, goal.y, veh);
  if (!p || !p.length) return { x: goal.x, y: goal.y };
  let px = x, py = y, left = len;
  for (const q of p) {
    const d = dxy(px, py, q.x, q.y);
    if (d >= left) return { x: px + (q.x - px) / d * left, y: py + (q.y - py) / d * left };
    left -= d; px = q.x; py = q.y;
  }
  return { x: px, y: py };
}
const pointAlong = (u, goal, len) => pointAlongFrom(u.x, u.y, goal, len, isArt(u));
function pathLen(u) { let L = 0, px = u.x, py = u.y; for (const p of u.path) { L += dxy(px, py, p.x, p.y); px = p.x; py = p.y; } return L; }
function aiMove(u, p, mode) {
  if (!p || dxy(u.x, u.y, p.x, p.y) < 12) return false;
  if (terrAt(p.x, p.y) === T_STREAM) { const c = coverNear(p.x, p.y, 40, u.side, null, u); if (c) p = c; }
  const path = findPath(u.x, u.y, p.x, p.y, isArt(u));
  if (!path || !path.length) return false;
  u.path = path; u.mode = mode; u.order = { type: 'move' };
  return true;
}
function aiHold(u) { u.path = []; if (u.order.type !== 'hold') u.order = { type: 'hold' }; }
function aiStop(u) { u.path = []; if (u.order.type === 'move' || u.order.type === 'hold') u.order = { type: 'idle' }; }
function overwatch(u, obj, home, side, rMin, rMax) {
  let best = null, bs = -1e9;
  for (let i = 0; i < 32; i++) {
    const a = rnd(0, TAU), r = rnd(rMin, rMax);
    const x = obj.x + Math.cos(a) * r, y = obj.y + Math.sin(a) * r;
    if (x < 20 || y < 20 || x > W - 20 || y > H - 20 || !passAt(x, y, false) || terrAt(x, y) === T_STREAM) continue;
    if (dxy(x, y, home.x, home.y) > dist(obj, home) + 120) continue;
    let s = coverAt(x, y) * 40 + (LOS(x, y, obj.x, obj.y) ? 60 : 0) - dxy(x, y, u.x, u.y) * 0.05;
    const sx = streamX(y), far = side === 1 ? x < sx : x > sx + 140, objFar = side === 1 ? obj.x < streamX(obj.y) : obj.x > streamX(obj.y) + 140;
    if (far && !objFar) s -= 50;
    for (const o of G.units) if (o !== u && live(o) && o.side === side && dxy(o.x, o.y, x, y) < 26) s -= 30;
    if (s > bs) { bs = s; best = { x, y }; }
  }
  return best ? (coverNear(best.x, best.y, 30, side, null, u) || best) : null;
}
function orderCharge(u, o) {
  u.order = { type: 'charge', target: o, t: G.time, seenT: G.time }; u.path = []; u.mode = 'charge'; u.chargeD = 0; u.cpT = 0;
  if (isCav(u) && (u.side === 0 || isSeen(u, 0))) SFX.hooves(u.x, u.y);
}
const cavThreat = (u, seen) => seen.some(o => isCav(o) && o.state < 2 && o.fat < 50 && dist(o, u) < ((o.order.type === 'charge' && o.order.target === u) ? 400 : 170));
// AI formations: square when cavalry threatens, line when engaged and stationary, column to march
function aiForm(u, seen) {
  if (!isInf(u) || u.state >= 2 || u.formT > 0 || u.order.type === 'charge') return;
  if (cavThreat(u, seen)) { if (u.form !== 'square' && u.formTo !== 'square') { setForm(u, 'square'); G.stats.sqForm[u.side]++; } u.sqT = G.time; return; }
  if (u.form === 'square' && G.time - (u.sqT || 0) < 4) return;
  let nearE = 1e9;
  for (const o of seen) if (!isCav(o)) nearE = Math.min(nearE, dist(o, u));
  const pl = u.path.length ? pathLen(u) : 0;
  let want = u.form;
  if (pl > 60) want = nearE < 200 ? (u.form === 'square' ? 'line' : u.form === 'column' && nearE < 200 && u.order.type !== 'charge' ? 'line' : u.form) : 'column';
  else if (nearE < 260 || G.time - u.lastHit < 3) want = 'line';
  else if (u.form === 'square') want = 'line';
  else if (u.spot && u.spot.k === 'front' && u.dv && (u.dv.mode === 'hold' || u.dv.mode === 'engage') && nearE < 560 && dist(u, u.spot) < 30) want = 'line';
  if (u.form === 'square' && want === 'square' && pl > 0) want = 'column';
  if (want !== u.form && (G.time - u.formAt > 5 || u.form === 'square')) setForm(u, want);
}
// player assist: battalions on 🛡 Hold form square against cavalry by themselves
function holdAssist() {
  const seen = G.units.filter(o => live(o) && o.side === 1 && isSeen(o, 0));
  for (const u of G.units) {
    if (u.side !== 0 || !live(u) || !isInf(u) || u.order.type !== 'hold' || u.state >= 2 || u.formT > 0) continue;
    const cav = cavThreat(u, seen);
    if (cav && u.form !== 'square') { setForm(u, 'square'); u.sqAuto = true; u.sqT = G.time; toast('◻ ' + u.name); }
    else if (cav) u.sqT = G.time;
    else if (u.form === 'square' && u.sqAuto && G.time - u.sqT > 5) { setForm(u, 'line'); u.sqAuto = false; }
  }
}

// The side AI is now a strategist: it picks an objective and a mode exactly as before, then hands
// zones to its division commanders. The French player does that job by hand.
function aiThink(side) {
  const D = DIFFS[G.diff];
  const A = G.ai[side];
  const mine = G.units.filter(u => live(u) && u.side === side && u.state < 3);
  if (!mine.length) return;
  const home = G.flags[side === 0 ? 0 : 1], enemyHome = G.flags[side === 0 ? 1 : 0];
  const remaining = GAME_TIME - G.time;
  const own = G.flags.filter(f => f.owner === side).length, theirs = G.flags.filter(f => f.owner === 1 - side).length;
  const targets = G.flags.filter(f => f.owner !== side).sort((a, b) => dist(a, home) - dist(b, home));
  const capping = G.flags.filter(f => f.owner === side && f.capSide === 1 - side && f.prog > 0.05).sort((a, b) => dist(a, home) - dist(b, home));
  let obj, mode = 'attack';
  if (home.owner !== side) obj = home;
  else if (capping.length) { obj = capping[0]; mode = 'counter'; }
  else if (G.time < A.holdUntil) { obj = targets[0] || G.flags[2]; mode = 'wait'; }
  else if (own > theirs || !targets.length) {
    mode = 'defend';
    obj = G.flags.filter(f => f.owner === side && f !== home).sort((a, b) => dist(a, enemyHome) - dist(b, enemyHome))[0] || home;
  } else obj = targets[0];
  // late push: the Allies throw everything at the most weakly held French flag
  if (side === 1 && remaining <= D.pushT && mode !== 'counter' && home.owner === 1) {
    const fr = G.flags.filter(f => f.owner === 0);
    if (fr.length) {
      const str = (f) => G.units.filter(u => live(u) && u.side === 0 && u.state < 3 && dist(u, f) < 240).reduce((s, u) => s + hpf(u) * (u.sz || 1) * (u.kind === 'cmdr' ? 0.3 : 1), 0) + dist(f, home) / 900;
      if (!A.pushObj || A.pushObj.owner !== 0) A.pushObj = fr.sort((a, b) => str(a) - str(b))[0];
      mode = 'push'; obj = A.pushObj;
      if (!A.push) {
        A.push = true; G.pushAt = G.time;
        if (!G.auto) { toast('⚠ ⚔ ' + obj.name); SFX.bugle('alert'); buzz([30, 40, 30]); }
      }
    }
  }
  // French counterstroke once the Guard is in: strike the Pratzen
  if (side === 0 && G.guardIn && mode === 'defend' && G.flags[1].owner === 1 && remaining > 45 && remaining > (DIFFS[G.diff].strikeMin || 0)) { mode = 'strike'; obj = G.flags[1]; }
  A.obj = obj; A.mode = mode;
  A.stay = side === 1 ? D.stay : 0.65;
  if (mode === 'push') A.stay = 0.15;
  if (mode === 'attack' && own < theirs && remaining < 120) A.stay *= 0.5;
  if (side === 0 && !G.guardIn && G.time >= GUARD_UNLOCK && (capping.length || own <= theirs || remaining < 200)) commitGuard(true);
  planZones(side, obj, mode);
}
const flagZone = (f) => { const i = G.flags.indexOf(f), z = ZONES.find(q => q.flag === i); return z ? Object.assign({ flag: i }, z) : null; };
const sameZone = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.r === b.r;
const divStr = (d) => { let h = 0, m = 0; for (const u of d.units) { if (u.reserve) continue; m += u.maxHp; if (live(u) && u.state < 4) h += u.hp; } return m ? h / m : 0; };
function planZones(side, obj, mode) {
  const A = G.ai[side], home = G.flags[side ? 1 : 0];
  for (const d of G.divs) {
    if (d.side !== side || !d.units.some(live)) continue;
    let z = flagZone(obj), post = mode === 'defend' ? 'hold' : 'attack';
    if (mode === 'wait') { z = null; post = 'hold'; }
    if (d.key === 'lan' || d.key === 'kam') { z = flagZone(home); post = 'hold'; } // flag garrisons stay put
    if (side === 1 && (A.wing || []).includes(d.key) && (mode === 'attack' || mode === 'wait') && G.flags[0].owner === 0 && divStr(d) > 0.4) { z = flagZone(G.flags[0]); post = 'attack'; }
    if (side === 0 && mode === 'strike' && d.key === 'leg') { z = flagZone(G.flags[2]); post = 'hold'; }
    setZone(d, z, post);
  }
}
function setZone(d, z, post) {
  if (sameZone(d.zone, z) && d.post === post) return;
  if (!z && !d.zone && d.post === post) return;
  d.zone = z; d.post = post; d.layT = 0; d.theta = null;
  for (const u of d.units) if (u.spot && u.spot.k === 'gun') u.spot = null;
}

// ---------------------------------------------------------------- division commanders
// each commander lays his units out inside the zone: a front line with supports behind, light
// infantry in cover or screening ahead, guns on high ground with a clear field of fire, cavalry on the
// flanks. Battered battalions rotate to the rear and fresh ones fill the gaps.
function snapSpot(x, y, veh, taken, minD = 34) {
  const ok = (px, py) => {
    if (px < 26 || py < 26 || px > W - 26 || py > H - 26 || !passAt(px, py, veh)) return false;
    const t = terrAt(px, py);
    if (t === T_STREAM || t === T_WATER || (veh && (t === T_HOUSE || t === T_TREE))) return false;
    for (const s of taken) if (dxy(s.x, s.y, px, py) < minD) return false;
    return true;
  };
  x = clamp(x, 26, W - 26); y = clamp(y, 26, H - 26);
  if (ok(x, y)) return { x, y };
  for (let r = 8; r <= 130; r += 8) for (let k = 0; k < 14; k++) {
    const a = k / 14 * TAU + r * 0.07, nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
    if (ok(nx, ny)) return { x: nx, y: ny };
  }
  return minD > 0 ? snapSpot(x, y, veh, [], 0) : { x, y };
}
function frontAngle(d, Z, seen, cen) {
  let sx = 0, sy = 0, n = 0;
  for (const o of seen) {
    if (o.state >= 4) continue;
    const dd = dxy(o.x, o.y, Z.x, Z.y);
    if (dd < Z.r + 520) { const w = 1 / (60 + dd); sx += (o.x - Z.x) * w; sy += (o.y - Z.y) * w; n += w; }
  }
  let a;
  if (n > 0 && Math.hypot(sx, sy) / n > Z.r * 0.4) a = Math.atan2(sy, sx);
  else if (cen && dxy(cen.x, cen.y, Z.x, Z.y) > Z.r + 60) a = Math.atan2(Z.y - cen.y, Z.x - cen.x);
  else {
    const ef = G.flags.filter(f => f.owner === 1 - d.side && dxy(f.x, f.y, Z.x, Z.y) > 80).sort((p, q) => dxy(p.x, p.y, Z.x, Z.y) - dxy(q.x, q.y, Z.x, Z.y))[0];
    a = ef ? Math.atan2(ef.y - Z.y, ef.x - Z.x) : (d.side ? Math.PI : 0);
  }
  a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
  if (d.theta == null || Math.abs(angDiff(a, d.theta)) > 0.42) d.theta = a;
  return d.theta;
}
// enemy standing between an attacking division and its objective: form a battle line facing them at
// musket range, let the guns work, press in once they waver, and carry on to the zone when the way is clear
function blockers(d, Z, cen, seen) {
  const dc = dxy(cen.x, cen.y, Z.x, Z.y);
  if (dc < Z.r + 60) return null;
  const ax = (Z.x - cen.x) / dc, ay = (Z.y - cen.y) / dc;
  let b0 = 1e9, sw = 0, sl = 0, sx = 0, sy = 0, weak = 0, n = 0;
  for (const o of seen) {
    if (o.state >= 3 || o.kind === 'cmdr' || isCav(o)) continue;
    const t = (o.x - cen.x) * ax + (o.y - cen.y) * ay, l = (o.x - cen.x) * -ay + (o.y - cen.y) * ax;
    if (t < -60 || t > dc - Z.r * 0.8 || Math.abs(l) > 230 || t > 520) continue;
    if (dxy(o.x, o.y, Z.x, Z.y) < Z.r + 20) continue;           // defenders of the zone itself: that is the assault
    b0 = Math.min(b0, t); const w = (o.sz || 1); sw += w; sl += l * w; sx += o.x * w; sy += o.y * w; n++;
    weak += (o.state >= 1 || hpf(o) < 0.45) ? w : 0;
  }
  if (!n) return null;
  const bx = sx / sw, by = sy / sw;
  let th = Math.atan2(by - cen.y, bx - cen.x); th = Math.round(th / (Math.PI / 12)) * (Math.PI / 12);
  if (d.theta != null && d.mode === 'engage' && Math.abs(angDiff(th, d.theta)) < 0.42) th = d.theta;
  const press = weak / sw > 0.5 || DIFFS[G.diff] && d.units.filter(u => live(u) && isInf(u) && u.state < 2).length >= 2 * n + 1;
  const back = press ? 70 : 150, lc = clamp(sl / sw, -150, 150);
  const C = { x: cen.x + ax * (b0 - back) + -ay * lc, y: cen.y + ay * (b0 - back) + ax * lc };
  return { C, th, press };
}
// assault staging: the foot heading for one zone gathers ~340 m short and goes in together
function stageReady(d, Z) {
  const D = DIFFS[G.diff], A = G.ai[d.side];
  const key = Math.round(Z.x) + ',' + Math.round(Z.y);
  let S = A.stage[key];
  if (!S || G.time - S.seen > 4) S = A.stage[key] = { t0: G.time, seen: G.time, go: false };
  S.seen = G.time;
  if (S.go) return true;
  const grp = G.units.filter(u => live(u) && u.side === d.side && !u.direct && u.dv && u.dv.post === 'attack' && sameZone(u.dv.zone, Z) && (isInf(u) || u.kind === 'light') && u.state < 2 && hpf(u) >= 0.3);
  const near = grp.filter(u => dxy(u.x, u.y, Z.x, Z.y) < 400).length;
  if (grp.length < 2 || near / grp.length >= 0.7 || G.time - S.t0 > (D.stageMax ?? 40)) S.go = true;
  return S.go;
}
const fitness = (u) => hpf(u) * [1, 0.8, 0.45, 0, 0][u.state];
function coverSpot(C, R, fx, fy, taken, side) {
  let best = null, bs = -1e9;
  for (let y = C.y - R; y <= C.y + R; y += 10) for (let x = C.x - R; x <= C.x + R; x += 10) {
    const d = dxy(x, y, C.x, C.y);
    if (d > R || x < 26 || y < 26 || x > W - 26 || y > H - 26 || !passAt(x, y, false) || terrAt(x, y) === T_STREAM) continue;
    const cv = coverAt(x, y); if (!cv) continue;
    if (taken.some(s => dxy(s.x, s.y, x, y) < 36)) continue;
    const s = cv * 30 + ((x - C.x) * fx + (y - C.y) * fy) * 0.12 - d * 0.04;
    if (s > bs) { bs = s; best = { x, y }; }
  }
  return best;
}
function gunSpot(u, d, Z, C, mode, fx, fy, fo, taken, seen) {
  const w = WPN[u.t.w];
  const T = mode === 'hold' ? { x: C.x + fx * 230, y: C.y + fy * 230 } : { x: Z.x, y: Z.y };
  const O = mode === 'hold' ? C : Z;
  const radii = mode === 'hold' ? [30, 70, 110, Z.r + 30, Z.r + 80] : [210, 280, 350, Math.min(430, w.range * 0.7)];
  let best = null, bs = -1e9;
  for (const r of radii) for (let k = 0; k < 20; k++) {
    const a = k / 20 * TAU, x = O.x + Math.cos(a) * r, y = O.y + Math.sin(a) * r;
    if (x < 30 || y < 30 || x > W - 30 || y > H - 30 || !passAt(x, y, true)) continue;
    const t = terrAt(x, y); if (t === T_TREE || t === T_HOUSE || t === T_STREAM || t === T_WATER) continue;
    const ahead = (x - C.x) * fx + (y - C.y) * fy;
    if (mode !== 'hold' && ahead > -40) continue;              // on our side of the objective
    let s = heightAt(x, y) * 1.5 + (LOS(x, y, T.x, T.y) ? 60 : 0) - dxy(x, y, u.x, u.y) * 0.04;
    if (mode === 'hold' && ahead > fo + 12) s -= 80;            // keep the guns level with or behind the line
    for (const e of seen) if (dxy(x, y, e.x, e.y) < 180) s -= 40;
    for (const q of taken) { const dd = dxy(q.x, q.y, x, y); if (dd < 34) s -= 60; else if (q.k === 'gun' && dd < 90) s += 6; }
    if (s > bs) { bs = s; best = { x, y }; }
  }
  return best;
}
function layoutDiv(d, ctl, seenAll) {
  const side = d.side, Z = d.zone;
  if (!ctl.length) return;
  if (!Z) { // no zone yet: hold where they stand
    d.mode = 'hold';
    for (const u of ctl) u.spot = { x: u.home.x, y: u.home.y, k: 'home', face: d.theta ?? (side ? Math.PI : 0) };
    return;
  }
  const seen = seenAll[side];
  const cen = centroid(ctl), home = G.flags[side ? 1 : 0];
  const hostile = (Z.flag >= 0 && G.flags[Z.flag].owner !== side) || seen.some(o => o.state < 3 && o.kind !== 'cmdr' && dxy(o.x, o.y, Z.x, Z.y) < Z.r + 30);
  let mode = 'hold', C = { x: Z.x, y: Z.y }, blk = null;
  if (d.post === 'attack' && hostile) {
    mode = 'assault';
    blk = blockers(d, Z, cen, seen);
    if (blk) { mode = 'engage'; C = blk.C; }
    else if (!stageReady(d, Z)) { mode = 'stage'; const dc = dxy(cen.x, cen.y, Z.x, Z.y); C = dc < 380 ? cen : pointAlongFrom(Z.x, Z.y, cen, 340, false); }
  }
  d.mode = mode;
  let th;
  if (mode === 'hold') { if (d.atk) { d.atk = false; d.theta = null; } th = frontAngle(d, Z, seen, cen); }
  else if (mode === 'engage') { d.atk = true; th = blk.th; d.theta = th; }
  else { // attacking: face the objective along the line of approach
    d.atk = true;
    const dc = dxy(cen.x, cen.y, Z.x, Z.y);
    if (d.theta == null || dc > 130) {
      let a = Math.atan2(Z.y - cen.y, Z.x - cen.x); a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      if (d.theta == null || Math.abs(angDiff(a, d.theta)) > 0.42) d.theta = a;
    }
    th = d.theta;
  }
  const fx = Math.cos(th), fy = Math.sin(th), px = -fy, py = fx;
  // divisions sharing a zone split it side by side
  const share = G.divs.filter(o => o.side === side && sameZone(o.zone, Z) && o.ctl.length).sort((a, b) => a.id - b.id);
  if (share.length > 1) { const k = share.indexOf(d), sh = (k - (share.length - 1) / 2) * (mode === 'assault' ? 80 : 150); C = { x: C.x + px * sh, y: C.y + py * sh }; }
  const taken = [];
  for (const o of G.divs) if (o !== d && o.side === side) for (const u of o.ctl) if (u.spot && live(u)) taken.push(u.spot);
  const put = (x, y, veh, k, minD) => { const s = snapSpot(x, y, veh, taken, minD); s.k = k; s.face = th; taken.push(s); return s; };
  const lat = (u) => (u.x - C.x) * px + (u.y - C.y) * py;
  const inf = ctl.filter(isInf), lights = ctl.filter(u => u.kind === 'light'), cav = ctl.filter(isCav), guns = ctl.filter(isArt);
  const R = Z.r, fo = mode === 'hold' ? Math.min(R * 0.2, 28) : 0, SP = 60, holdish = mode === 'hold' || mode === 'engage';
  // infantry: fittest in front, others in support, battered ones rotated to the rear
  const byFit = inf.slice().sort((a, b) => fitness(b) - fitness(a));
  let rest = byFit.filter(u => hpf(u) < 0.35 || u.state === 2), act = byFit.filter(u => !rest.includes(u));
  if (!act.length) { act = rest; rest = []; }
  const nf = act.length <= 2 ? act.length : Math.ceil(act.length * 0.6);
  const rank = (list, off, k) => {
    const sorted = list.slice().sort((a, b) => lat(a) - lat(b));
    sorted.forEach((u, i) => { const l = (i - (list.length - 1) / 2) * SP; u.spot = put(C.x + fx * off + px * l, C.y + fy * off + py * l, false, k, 30); });
  };
  rank(act.slice(0, nf), fo, 'front');
  rank(act.slice(nf), fo - 65, 'sup');
  rank(rest, fo - 130, 'res');
  const half = Math.max(1, nf) * SP / 2;
  // light infantry: cover inside the zone when holding, otherwise a skirmish screen ahead
  lights.slice().sort((a, b) => lat(a) - lat(b)).forEach((u, i) => {
    let c = null;
    if (mode === 'hold') c = coverSpot(C, R, fx, fy, taken, side);
    else if (mode === 'engage') c = coverSpot(C, 80, fx, fy, taken, side);
    else if (mode === 'assault' && dxy(cen.x, cen.y, Z.x, Z.y) < R + 120) c = coverSpot({ x: Z.x - fx * 30, y: Z.y - fy * 30 }, 90, fx, fy, taken, side);
    if (c) u.spot = put(c.x, c.y, false, 'skirm', 30);
    else { const l = (i - (lights.length - 1) / 2) * 80, f2 = mode === 'assault' ? -20 : fo + 60; u.spot = put(C.x + fx * f2 + px * l, C.y + fy * f2 + py * l, false, 'skirm', 30); }
  });
  // cavalry: on the flanks of the line (or held back behind an assault), squadron pairs side by side
  const groups = [];
  for (const u of cav) { let g = groups.find(q => q.type === u.type); if (!g) groups.push(g = { type: u.type, us: [] }); g.us.push(u); }
  const cavOnly = !inf.length && !lights.length;
  let CC = C;
  if (!holdish) { const p = pointAlongFrom(Z.x, Z.y, home, cavOnly ? 230 : 170, false); CC = { x: p.x, y: p.y }; }
  groups.forEach((g, gi) => {
    const sgn = gi % 2 ? 1 : -1, tier = Math.floor(gi / 2);
    const latBase = cavOnly ? (holdish ? R * 0.55 : 55) + tier * 70 : half + 60 + tier * 70;
    const back = cavOnly ? (holdish ? -R * 0.25 : 0) : -35;
    g.us.forEach((u, k) => { const l = sgn * (latBase + k * 34); u.spot = put(CC.x + fx * back + px * l, CC.y + fy * back + py * l, false, 'flank', 30); });
  });
  // guns: keep a good spot for a while; otherwise find high ground with a field of fire
  const zk = Math.round(Z.x) + ',' + Math.round(Z.y) + mode;
  for (const u of guns) {
    const s = u.spot;
    if (s && s.k === 'gun' && s.zk === zk && G.time - s.t < 25 && !taken.some(q => dxy(q.x, q.y, s.x, s.y) < 28)) { taken.push(s); continue; }
    const g = gunSpot(u, d, Z, C, holdish ? 'hold' : mode, fx, fy, fo, taken, seen);
    if (g) { u.spot = put(g.x, g.y, true, 'gun', 30); u.spot.zk = zk; u.spot.t = G.time; }
  }
}
function updateHQ(snap) {
  for (const d of G.divs) {
    const us = d.units.filter(u => live(u) && u.state < 4);
    if (!us.length) { d.hq = null; continue; }
    const c = centroid(us), th = d.theta ?? (d.side ? Math.PI : 0);
    const tx = c.x - Math.cos(th) * 40, ty = c.y - Math.sin(th) * 40;
    if (!d.hq || snap) { d.hq = { x: tx, y: ty }; continue; }
    const dd = dxy(d.hq.x, d.hq.y, tx, ty), st = Math.max(40, dd * 1.2) * DT;
    if (dd <= st) { d.hq.x = tx; d.hq.y = ty; } else { d.hq.x += (tx - d.hq.x) / dd * st; d.hq.y += (ty - d.hq.y) / dd * st; }
  }
}
// a unit given a direct order drops back under its commander once the order is done
function releaseDirect() {
  for (const u of G.units) {
    if (!u.direct) continue;
    if (!live(u) || u.state >= 4) { u.direct = false; continue; }
    if (u.order.type === 'idle' && !u.path.length && u.formT <= 0 && G.time > u.directUntil) { u.direct = false; u.aiCool = 0; }
  }
}
function markDirect(us, hold) { for (const u of us) { u.direct = true; u.directUntil = G.time + (hold || 3); u.spot = null; } }
function rejoin(us) {
  let n = 0;
  for (const u of us) if (u.direct) { u.direct = false; u.aiCool = 0; if (u.order.type === 'hold') u.order = { type: 'idle' }; n++; }
  for (const d of new Set(us.map(u => u.dv).filter(Boolean))) d.layT = 0;
  return n;
}
function commandUnits(side, seenAll) {
  const D = DIFFS[G.diff], A = G.ai[side];
  const think = side === 1 ? D.think : 1;
  const seen = seenAll[side];
  const home = G.flags[side === 0 ? 0 : 1];
  for (const d of G.divs) {
    if (d.side !== side) continue;
    d.ctl = d.units.filter(u => live(u) && u.state < 3 && !u.direct);
  }
  for (const d of G.divs) if (d.side === side && G.time >= d.layT) { layoutDiv(d, d.ctl, seenAll); d.layT = G.time + rnd(2.4, 3.2); }
  // assault pacing: foot going in on one zone keeps level with the slower battalions
  const pace = {};
  for (const d of G.divs) {
    if (d.side !== side || d.mode !== 'assault' || !d.zone) continue;
    const k = Math.round(d.zone.x) + ',' + Math.round(d.zone.y), P = pace[k] || (pace[k] = []);
    for (const u of d.ctl) if ((isInf(u) || u.kind === 'light') && u.state < 2 && u.spot && u.spot.k !== 'res') P.push(dxy(u.x, u.y, d.zone.x, d.zone.y));
  }
  for (const k in pace) { const P = pace[k].sort((a, b) => a - b); pace[k] = P.length ? P[Math.floor((P.length - 1) * 0.7)] : 0; }
  A.pace = pace;
  const mine = G.units.filter(u => live(u) && u.side === side && u.state < 3 && !u.direct && (u.dv || u.kind === 'cmdr'));
  for (const u of mine) aiForm(u, seen);
  for (const u of mine) {
    u.aiCool -= 0.5;
    if (u.aiCool > 0) continue;
    u.aiCool = rnd(2, 3.5) * think;
    if (u.order.type === 'charge') continue;
    if (u.kind === 'cmdr') { aiCmdr(u, null, home, seen, side); continue; }
    if (u.state === 2) { if (!u.path.length && !isArt(u) && G.time - u.lastHit < 5) aiMove(u, pointAlong(u, home, 120), 'move'); continue; }
    if ((u.order.type === 'fire' || u.order.type === 'area') && G.time - u.order.t < 6) continue;
    if (u.spot) cmdUnit(u, u.dv, u.spot, seen, side, home, A);
  }
}
const pathEnd = (u) => (u.path.length ? u.path[u.path.length - 1] : null);
function cmdUnit(u, d, s, seen, side, home, A) {
  if (isCav(u)) return cmdCav(u, d, s, seen, side, home);
  if (isArt(u)) return cmdArt(u, s, seen);
  u.faceAng = s.face;
  const engaged = G.time - u.lastFired < 3 || G.time - u.lastHit < 3;
  const nearE = seen.reduce((m, o) => Math.min(m, dist(o, u)), 1e9);
  const assault = d.mode === 'assault', push = A.mode === 'push';
  const dd = dist(u, s);
  const Z = d.zone, zd = Z ? dxy(u.x, u.y, Z.x, Z.y) : 0;
  if (u.kind === 'light') {
    if (engaged && coverAt(u.x, u.y) >= 1 && dd < 140) return;
  } else {
    if (aiChargeCheck(u, seen, assault && push ? 150 : assault ? 130 : 120, assault && push ? 0.5 : 0)) return;
    if (engaged && nearE < 220 && Math.random() < A.stay) return; // trade volleys a while
    if (assault && nearE < 170 && u.form === 'line' && Math.random() < 0.55) { if (u.path.length) aiStop(u); return; } // halt and fire
  }
  if (assault && Z && !push && zd > Z.r * 0.6) { // don't run ahead of the attack
    const P = A.pace && A.pace[Math.round(Z.x) + ',' + Math.round(Z.y)];
    if (P && zd < P - 90) { if (u.path.length) aiStop(u); return; }
  }
  if (dd < 14) { if (u.path.length) aiStop(u); return; }
  const end = pathEnd(u);
  if (!assault && end && dxy(end.x, end.y, s.x, s.y) < 14) return; // already on the way
  const goal = assault && dd > 200 ? pointAlong(u, s, 180) : s;
  aiMove(u, goal, nearE < 350 ? 'move' : (dd > 400 ? 'quick' : 'move'));
}
function cavCharge(u, seen, side) {
  const D = DIFFS[G.diff], hf = hpf(u);
  if (u.fat < 50 && u.state === 0 && G.time - u.meleeT > 4) {
    const cc = seen.find(o => isCav(o) && o.order.type === 'charge' && dist(o, u) < 260);
    if (cc) { orderCharge(u, cc); return true; }
  }
  const thr = side === 1 ? D.cavT : (D.cavTF || 1.7);
  if (u.fat < 40 && u.state === 0 && hf > 0.35 && G.time - u.meleeT > 5) {
    let best = null, bs = -1e9;
    for (const o of seen) {
      const d = dist(u, o);
      if (d > 420 || (o.state >= 4 && d > 250)) continue;
      if (o.form === 'square' || inHouse(o) || (coverAt(o.x, o.y) === 1 && o.kind === 'light')) continue;
      let v;
      if (o.state >= 3) v = 3;
      else if (isArt(o)) v = 2.4 + (o.form === 'limbered' ? 0.3 : 0);
      else if (o.formT > 0) v = o.formTo === 'square' ? 1.0 : 2.3;
      else if (o.kind === 'light') v = 2.0;
      else if (o.kind === 'cmdr') v = 1.6;
      else if (isCav(o)) v = o.fat >= 50 ? 2.2 : 0.8;
      else if (o.form === 'line') v = attackAngle(o, u.x, u.y) > 1.0 ? 2.4 : 0.6 + (o.state >= 1 ? 0.7 : 0);
      else if (o.form === 'column') v = 1.3 + (attackAngle(o, u.x, u.y) > 1.0 ? 0.4 : 0);
      else v = 1;
      if (o.state === 2) v += 0.6;
      v += (1 - hpf(o)) * 0.6;
      v -= d / 420 * 0.5;
      for (const e of seen) {
        if (e === o || e.state >= 2) continue;
        if (isInf(e) && e.form !== 'column' && dist(e, o) < 120) v -= 0.45;
        if (isArt(e) && e.form === 'deployed' && dist(e, o) < 160) v -= 0.6;
      }
      if (!lineOK(u, o, false)) v -= 0.5;
      if (v > bs) { bs = v; best = o; }
    }
    if (best && bs >= thr) { orderCharge(u, best); return true; }
  }
  return false;
}
// the other squadron pair of the regiment goes in alongside (two pairs hit like the whole regiment)
function cavPartner(u) {
  const o = u.order.target;
  if (!o || (u.sz || 1) >= 1) return;
  let best = null, bd = 130;
  for (const p of G.units) {
    if (p === u || !live(p) || p.side !== u.side || !isCav(p) || p.dv !== u.dv || p.direct || p.state > 0 || p.fat >= 40 || p.order.type === 'charge' || hpf(p) < 0.35) continue;
    const d = dist(p, u);
    if (d < bd && dist(p, o) < 440 && lineOK(p, o, false)) { bd = d; best = p; }
  }
  if (best) orderCharge(best, o);
}
function cmdCav(u, d, s, seen, side, home) {
  u.faceAng = s.face;
  if (cavCharge(u, seen, side)) { cavPartner(u); return; }
  let spot = s;
  if (u.fat >= 40 || hpf(u) < 0.35) spot = pointAlongFrom(s.x, s.y, home, 120, false); // rest the horses behind
  const end = pathEnd(u);
  if (dist(u, spot) > 40) { if (!end || dxy(end.x, end.y, spot.x, spot.y) > 30) aiMove(u, spot, 'move'); }
  else aiStop(u);
}
function cmdArt(u, s, seen) {
  const w = WPN[u.t.w];
  if (u.formT > 0) return;
  u.faceAng = s.face;
  const dd = dist(u, s);
  if (u.form === 'deployed') {
    if (seen.some(o => validTarget(u, o, w))) { aiStop(u); return; } // keep firing while there are targets
    if (G.time - Math.max(u.lastFired, u.depT || 0) < 12) return;
    if (dd < 70) return;
  }
  if (dd < 16) { if (!u.path.length && u.form === 'limbered') setForm(u, 'deployed'); return; }
  const end = pathEnd(u);
  if (end && dxy(end.x, end.y, s.x, s.y) < 16) return;
  aiMove(u, s, 'move');
}
function aiChargeCheck(u, seen, range, aggr) {
  if (!canCharge(u) || u.state > 0 || hpf(u) < 0.45 || G.time - u.meleeT < 5) return false;
  let best = null, bs = 0;
  for (const o of seen) {
    const d = dist(u, o);
    if (d > range || d < 25 || o.state >= 4) continue;
    if (!lineOK(u, o, false)) continue;
    let v = 0;
    if (o.state >= 2) v += 1.5; else if (o.state === 1) v += 0.6;
    if (isArt(o)) v += 1.2;
    if (o.kind === 'light' && coverAt(o.x, o.y) === 0) v += 0.8;
    if (o.formT > 0) v += 0.8;
    if (attackAngle(o, u.x, u.y) > 1.0 && o.form !== 'square') v += 0.8;
    if (inHouse(o)) v -= 1;
    if (hpf(o) < 0.5) v += 0.5;
    v += aggr || 0;
    v -= d / range * 0.4;
    if (v > bs) { bs = v; best = o; }
  }
  if (best && bs >= 1.2) { orderCharge(u, best); return true; }
  return false;
}
function aiCmdr(u, obj, home, seen, side) {
  const nearE = seen.reduce((m, o) => Math.min(m, dist(o, u)), 1e9);
  if (nearE < 150) { aiMove(u, pointAlong(u, home, 130), 'quick'); return; }
  const needy = G.units.filter(o => live(o) && o.side === side && o.kind !== 'cmdr' && o.state >= 3 && dist(o, u) < 380).sort((a, b) => dist(a, u) - dist(b, u))[0];
  if (needy && G.time - u.lastHit > 3) { aiMove(u, { x: needy.x + (home.x - needy.x) * 0.08, y: needy.y + (home.y - needy.y) * 0.08 }, 'quick'); return; }
  const grp = G.units.filter(o => live(o) && o.side === side && (isInf(o) || o.kind === 'light') && o.state < 3);
  if (!grp.length) return;
  const cx = grp.reduce((s, o) => s + o.x, 0) / grp.length, cy = grp.reduce((s, o) => s + o.y, 0) / grp.length;
  const v = { x: cx + (home.x - cx) * 0.15, y: cy + (home.y - cy) * 0.15 };
  if (dxy(u.x, u.y, v.x, v.y) > 60) aiMove(u, v, 'move');
}
// ---------------------------------------------------------------- orders (commanders)
// a tap near a named place snaps to it; anywhere else makes a free zone (radius 95, or dragged)
function zoneAt(x, y, r) {
  const nz = ZONES.filter(z => dxy(z.x, z.y, x, y) < z.r * 0.85).sort((a, b) => dxy(a.x, a.y, x, y) - dxy(b.x, b.y, x, y))[0];
  if (nz && !r) return { name: nz.name, x: nz.x, y: nz.y, r: nz.r, flag: nz.flag ?? -1 };
  r = clamp(r || 95, 55, 240); x = clamp(x, 40, W - 40); y = clamp(y, 40, H - 40);
  const fi = G.flags.findIndex(f => dxy(f.x, f.y, x, y) < Math.max(45, r * 0.8));
  return { name: nz ? '≈' + nz.name : '', x, y, r, flag: fi };
}
function orderDiv(d, z, post, quiet) {
  d.zone = z; d.post = post; d.layT = 0; d.theta = null; d.player = true;
  for (const u of d.units) { if (u.spot && u.spot.k === 'gun') u.spot = null; if (G.phase === 'battle') u.aiCool = Math.min(u.aiCool, rnd(0.2, 1.2)); }
  if (quiet) return;
  G.markers.push({ x: z.x, y: z.y, t: 0, kind: 'zone', r: z.r, col: d.col });
  toast(`${post === 'attack' ? '⚔' : '🛡'} ${d.name} → ${z.name || '📍'}`);
  SFX.drum(post === 'attack' ? 'quick' : 'hold'); buzz(15);
}
const zoneLabel = (d) => (d.zone ? (d.zone.name || '📍') : d.units.some(u => u.reserve) ? '🦅' : 'in place');
const DIV_AB = { van: 'V', sth: 'SH', leg: 'Lg', lan: 'Ln', mur: 'M', gar: 'G', mil: 'Mi', kol: 'Ko', lng: 'Lr', kam: 'Ka', lie: 'Li', dok: 'Do' };
function selectDiv(d) {
  if (!d) return;
  G.selDiv = G.selDiv === d ? null : d; G.sel = []; G.pend = 'move'; G.inspect = null;
  if (G.selDiv) toast(`⚑ ${d.name}: 👆 map = zone`);
  SFX.click(); buzz(10); refreshUI(true);
}
function hqAt(wx, wy) {
  const r = Math.max(20, 26 / cam.z);
  let best = null, bd = r;
  for (const d of G.divs) {
    if (d.side !== 0 || !d.hq) continue;
    const dd = dxy(d.hq.x, d.hq.y, wx, wy);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best ? { d: best, dist: bd } : null;
}

// ---------------------------------------------------------------- orders (player)
function groupSpots(us, x, y) {
  const n = us.length;
  return us.map((u, i) => {
    const a = i / n * TAU, r = n > 1 ? 22 + n * 5 : 0;
    return { x: clamp(x + Math.cos(a) * r, 10, W - 10), y: clamp(y + Math.sin(a) * r, 10, H - 10) };
  });
}
function issueMove(us, x, y, mode) {
  markDirect(us);
  const spots = groupSpots(us, x, y);
  let ok = false;
  us.forEach((u, i) => {
    const p = findPath(u.x, u.y, spots[i].x, spots[i].y, isArt(u));
    if (p && p.length) { u.path = p; u.mode = mode; u.order = { type: 'move' }; ok = true; }
  });
  G.markers.push({ x, y, t: 0, kind: ok ? mode : 'no' });
  SFX.drum(mode); buzz(ok ? 12 : [10, 40, 10]);
}
function issueCharge(us, o) {
  let ok = 0, blown = false;
  for (const u of us) {
    if (!canCharge(u) || u.state >= 2) { if (isCav(u) && u.fat >= 50) blown = true; continue; }
    if (dist(u, o) > CHARGE_R[isCav(u) ? 'cav' : 'inf'] * 1.15) continue;
    markDirect([u]); orderCharge(u, o); ok++;
  }
  G.markers.push({ x: o.x, y: o.y, t: 0, kind: ok ? 'charge' : 'no' });
  if (ok) { SFX.bugle('charge'); buzz([20, 30, 20]); }
  else { toast(blown ? '🐎💨' : '✖ ⚔'); SFX.click(true); buzz([10, 40, 10]); }
  return ok;
}
function issueFire(us, o) {
  const firers = us.filter(u => u.t.w), riders = us.filter(u => !u.t.w && isCav(u));
  markDirect(firers);
  for (const u of firers) { u.path = []; u.order = { type: 'fire', target: o, t: G.time }; }
  if (riders.length) issueCharge(riders, o);
  if (firers.length) { G.markers.push({ x: o.x, y: o.y, t: 0, kind: 'fire' }); SFX.drum('fire'); buzz(15); }
}
function issueArea(us, x, y) {
  let ok = false;
  for (const u of us) {
    if (!u.t.w) continue;
    const w = WPN[u.t.w], d = dxy(u.x, u.y, x, y);
    if (u.ammo <= 0 || d > w.range || !LOS(u.x, u.y, x, y)) continue;
    markDirect([u]); u.path = []; u.order = { type: 'area', x, y, t: G.time, until: G.time + 20 }; ok = true;
  }
  G.markers.push({ x, y, t: 0, kind: ok ? 'area' : 'no' });
  if (!ok) { toast('✖ 👁'); SFX.click(true); buzz([10, 40, 10]); } else { SFX.drum('fire'); buzz(15); }
}
function issueHold(us) { markDirect(us); for (const u of us) { u.path = []; u.order = { type: 'hold' }; } SFX.drum('hold'); buzz(12); }
const NEXT_FORM = { line: 'column', column: 'square', square: 'line' };
function nextForm(sel) {
  const inf = sel.find(u => isInf(u) && u.state < 3);
  if (inf) return NEXT_FORM[inf.formTo || inf.form] || 'line';
  const art = sel.find(u => isArt(u) && u.state < 3);
  if (art) return (art.formTo || art.form) === 'deployed' ? 'limbered' : 'deployed';
  return null;
}
function issueForm(us) {
  const nf = nextForm(us);
  if (!nf) { SFX.click(true); return; }
  if (G.phase === 'battle') markDirect(us.filter(u => u.state < 3 && (isInf(u) || isArt(u))), 15);
  for (const u of us) {
    if (u.state >= 3) continue;
    if (isInf(u) && (nf === 'line' || nf === 'column' || nf === 'square')) { setForm(u, nf); u.sqAuto = false; if (u.order.type === 'hold' && nf !== 'square') u.order = { type: 'idle' }; }
    if (isArt(u) && (nf === 'limbered' || nf === 'deployed')) { u.path = []; if (u.order.type === 'move') u.order = { type: 'idle' }; setForm(u, nf); }
  }
  toast(FORM_ICON[nf] + ' ' + FORM_NAME[nf]);
  SFX.drum('form'); buzz(12);
}

// ---------------------------------------------------------------- deployment
const inZoneRect = (x, y) => (x >= 20 && x <= 585 && y >= 20 && y <= 1080) || (x >= 585 && x <= 735 && y >= 760 && y <= 1075);
function inZone(x, y) { return inZoneRect(x, y) && passAt(x, y, false) && terrAt(x, y) !== T_STREAM; }
function nearestOk(x, y, veh) {
  if (passAt(x, y, veh) && terrAt(x, y) !== T_STREAM && inZoneRect(x, y)) return { x, y };
  for (let r = 10; r < 120; r += 10) for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU, nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
    if (passAt(nx, ny, veh) && terrAt(nx, ny) !== T_STREAM && inZoneRect(nx, ny)) return { x: nx, y: ny };
  }
  return null;
}
function placeUnit(u, x, y) {
  if (!inZoneRect(x, y)) { y = clamp(y, 20, 1075); x = clamp(x, 20, y >= 760 ? 735 : 585); }
  const p = nearestOk(x, y, isArt(u));
  if (!p) return false;
  x = p.x; y = p.y;
  for (let k = 0; k < 12; k++) {
    if (!G.units.some(o => o !== u && o.side === 0 && live(o) && dxy(o.x, o.y, x, y) < 22)) break;
    const a = k * 2.4, nx = x + Math.cos(a) * 18, ny = y + Math.sin(a) * 18;
    if (inZone(nx, ny) && passAt(nx, ny, isArt(u))) { x = nx; y = ny; }
  }
  u.x = x; u.y = y; u.path = [];
  return true;
}
function autoDeploy() {
  G.fSetup = (G.fSetup + 1) % F_SETUPS.length;
  jitterFrench();
  SFX.drum('move');
}
function beginBattle() {
  if (G.phase !== 'deploy') return;
  G.phase = 'battle'; G.paused = false; G.sel = G.sel.filter(live);
  for (const u of G.units) { u.path = []; u.order = { type: 'idle' }; u.home = { x: u.x, y: u.y }; }
  updateHQ(true);
  updateVis();
  SFX.bugle('start');
  toast('▶ 🌫');
  refreshUI(true);
}

// ---------------------------------------------------------------- main step
function step() {
  G.time += DT;
  updateFog();
  G.visT -= DT; if (G.visT <= 0) { G.visT = 0.25; updateVis(); }
  G.aiT -= DT;
  if (G.aiT <= 0) {
    G.aiT = 0.5;
    aiThink(1);
    if (G.auto) aiThink(0); else { holdAssist(); releaseDirect(); }
    const seenAll = [0, 1].map(s => G.units.filter(o => live(o) && o.side !== s && isSeen(o, s)));
    commandUnits(1, seenAll); commandUnits(0, seenAll);
  }
  updateHQ(false);
  for (const u of G.units) {
    if (!live(u)) continue;
    updateMorale(u);
    if (!live(u)) continue;
    updateForm(u);
    updateMove(u);
    if (!live(u)) continue;
    updateFace(u);
    updateFire(u);
    updateFatigue(u);
    resupply(u); regroup(u);
  }
  separate();
  updateShells();
  updateFlags();
  updateFx();
  for (const m of G.markers) m.t += DT;
  G.markers = G.markers.filter(m => m.t < 1.2);
  if (G.time >= G.logT) { G.flagLog.push(G.flags.map(f => f.owner)); G.logT += 5; }
  if (!G.guardIn && G.time >= GUARD_AUTO) commitGuard(true);
  G.flagT -= DT;
  if (G.flagT <= 0) { G.flagT = 0.5; checkReinforce(); checkEnd(); }
}

// ---------------------------------------------------------------- sound (synthesized WebAudio, no files)
const SFX = (() => {
  let ac = null, master = null, noiseBuf = null, voices = 0;
  let muted = store.get('aus-mute', '0') === '1';
  const ok = () => ac && !muted && !G.silent && ac.state === 'running';
  function unlock() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 6;
        master = ac.createGain(); master.gain.value = muted ? 0 : 0.8;
        master.connect(comp); comp.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0); // iOS unlock
      }
      if (ac.state !== 'running') ac.resume();
    } catch (e) { /* audio unavailable */ }
  }
  function out(x, y, vol) {
    let v = vol, pan = 0;
    if (x != null && VW) {
      const cx = cam.x + VW / cam.z / 2, cy = cam.y + VH / cam.z / 2;
      const half = Math.max(VW, VH) / cam.z / 2;
      v *= clamp(1.2 - dxy(x, y, cx, cy) / (half * 2.2), 0.1, 1);
      pan = clamp((x - cx) / (VW / cam.z / 2), -1, 1) * 0.6;
    }
    const g = ac.createGain(); g.gain.value = v;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); }
    else g.connect(master);
    return g;
  }
  function voice(dur) { voices++; setTimeout(() => { voices--; }, dur * 1000 + 60); }
  function env(g, t0, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function noise(dest, t0, dur, type, freq, q, vol, attack = 0.002) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); env(g, t0, vol, attack, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
    return f;
  }
  function tone(dest, t0, dur, type, f0, f1, vol, attack = 0.005) {
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain(); env(g, t0, vol, attack, dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  const crack = (dest, t, vol, bright, len = 0.1) => { noise(dest, t, len, 'bandpass', bright, 0.8, vol); tone(dest, t, 0.08, 'sine', 140, 50, vol * 0.6); };
  function shot(wk, u) {
    if (!ok() || voices > 26) return;
    const t = ac.currentTime + 0.01 + Math.random() * 0.03;
    const dest = out(u.x, u.y, u.side === 0 ? 0.5 : 0.42);
    switch (wk) {
      case 'musket': { // a rolling battalion volley
        const n = 9 + (Math.random() * 5 | 0);
        for (let i = 0; i < n; i++) crack(dest, t + rnd(0, 0.38), 0.4, rnd(800, 1400), 0.14);
        noise(dest, t, 0.7, 'lowpass', 500, 0.6, 0.5, 0.02); voice(0.8); break;
      }
      case 'lmusket': { const n = 2 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) crack(dest, t + rnd(0, 0.5), 0.45, rnd(1100, 1700), 0.12); voice(0.6); break; }
      case 'cannon': tone(dest, t, 0.7, 'sine', 90, 28, 1.0); noise(dest, t, 0.9, 'lowpass', 600, 0.7, 0.9); noise(dest, t, 0.08, 'bandpass', 1500, 1, 0.4); voice(1); break;
      case 'canister': tone(dest, t, 0.6, 'sine', 100, 30, 1.0); noise(dest, t, 0.7, 'lowpass', 700, 0.7, 0.8); noise(dest, t + 0.02, 0.3, 'bandpass', 2600, 0.9, 0.6); voice(0.9); break;
    }
  }
  function thud(x, y) {
    if (!ok() || voices > 30) return;
    const t = ac.currentTime + 0.01, dest = out(x, y, 0.35);
    tone(dest, t, 0.25, 'sine', 120, 45, 0.7); noise(dest, t, 0.3, 'lowpass', 350, 0.8, 0.5); voice(0.35);
  }
  function clash(x, y, cav) {
    if (!ok() || voices > 30) return;
    const t = ac.currentTime + 0.01, dest = out(x, y, 0.5);
    for (let i = 0; i < 6; i++) { const tt = t + rnd(0, 0.5); tone(dest, tt, 0.09, 'square', rnd(1800, 2900), rnd(1500, 2500), 0.12); noise(dest, tt, 0.05, 'highpass', 3000, 0.7, 0.25); }
    noise(dest, t, 0.6, 'lowpass', cav ? 300 : 500, 0.6, 0.6, 0.05); voice(0.8);
  }
  function hooves(x, y) {
    if (!ok() || voices > 28) return;
    const t = ac.currentTime + 0.01, dest = out(x, y, 0.5);
    for (let i = 0; i < 14; i++) { const tt = t + i * 0.11 + (i % 3 === 2 ? 0.04 : 0); noise(dest, tt, 0.06, 'lowpass', 220, 0.9, 0.7 * (0.6 + i / 30)); tone(dest, tt, 0.05, 'sine', 90, 60, 0.3); }
    voice(1.7);
  }
  function drum(kind) {
    if (!ok()) return;
    const t = ac.currentTime + 0.01, dest = out(null, null, 0.3);
    const hit = (tt, v = 0.6) => { noise(dest, tt, 0.09, 'bandpass', 1900, 0.7, v); tone(dest, tt, 0.07, 'sine', 190, 90, v * 0.6); };
    const pat = { move: [0, 0.14], quick: [0, 0.08, 0.16, 0.24], fire: [0], hold: [0, 0.18, 0.36], form: [0, 0.06, 0.12, 0.18, 0.3] }[kind] || [0, 0.14];
    pat.forEach((s, i) => hit(t + s, i === pat.length - 1 ? 0.7 : 0.45));
    voice(0.5);
  }
  function notes(seq, type, vol) {
    if (!ok()) return;
    const t = ac.currentTime + 0.02, dest = out(null, null, vol);
    seq.forEach(([f, s, d]) => { tone(dest, t + s, d, type, f, f, 0.5, 0.015); tone(dest, t + s, d, 'square', f, f, 0.06, 0.02); });
    voice(1.8);
  }
  const BUGLE = {
    start: [[392, 0, 0.18], [523, 0.2, 0.18], [659, 0.4, 0.18], [784, 0.6, 0.45]],
    charge: [[392, 0, 0.1], [523, 0.12, 0.1], [659, 0.24, 0.1], [784, 0.36, 0.22], [659, 0.62, 0.1], [784, 0.74, 0.4]],
    guard: [[523, 0, 0.15], [523, 0.16, 0.1], [659, 0.28, 0.15], [784, 0.45, 0.15], [1047, 0.62, 0.55]],
    alert: [[784, 0, 0.15], [659, 0.18, 0.15], [784, 0.36, 0.15], [659, 0.54, 0.3]],
    sun: [[523, 0, 0.3], [659, 0.3, 0.3], [784, 0.6, 0.6]],
  };
  const bugle = (kind) => notes(BUGLE[kind] || BUGLE.alert, 'triangle', 0.32);
  const chime = (good) => notes(good ? [[523, 0, 0.18], [659, 0.12, 0.18], [784, 0.24, 0.35]] : [[392, 0, 0.2], [330, 0.15, 0.2], [262, 0.3, 0.4]], 'triangle', 0.35);
  const rally = () => notes([[392, 0, 0.12], [523, 0.1, 0.12], [659, 0.2, 0.12], [784, 0.3, 0.3]], 'triangle', 0.3);
  const end = (res) => notes(res === 'win' ? [[523, 0, 0.2], [659, 0.18, 0.2], [784, 0.36, 0.2], [1047, 0.54, 0.6]] : res === 'lose' ? [[392, 0, 0.3], [349, 0.28, 0.3], [311, 0.56, 0.3], [262, 0.84, 0.8]] : [[440, 0, 0.3], [440, 0.3, 0.5]], 'triangle', 0.4);
  function click(bad) { if (!ok()) return; const t = ac.currentTime + 0.005; tone(out(null, null, 0.2), t, 0.04, 'square', bad ? 300 : 1400, bad ? 200 : 1400, 0.15); voice(0.1); }
  function setMuted(m) {
    muted = m; store.set('aus-mute', m ? '1' : '0');
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.02);
  }
  return { unlock, shot, thud, clash, hooves, drum, bugle, chime, rally, end, click, setMuted, isMuted: () => muted, ctx: () => ac };
})();

// ---------------------------------------------------------------- rendering
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
const cam = { x: 400, y: 150, z: 0.7 };
const MS = 1.5;
const mapCv = document.createElement('canvas');
function rrect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function polyStroke(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.stroke(); }
function drawMap() {
  mapCv.width = W * MS; mapCv.height = H * MS;
  const c = mapCv.getContext('2d');
  c.scale(MS, MS);
  // ground tinted by height (low meadows muted green, plateau lighter olive-cream)
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    const h = hgt[cy * GW + cx] / HMAX;
    c.fillStyle = `rgb(${(114 + 50 * h) | 0},${(129 + 38 * h) | 0},${(80 + 30 * h) | 0})`;
    c.fillRect(cx * CELL, cy * CELL, CELL + 0.6, CELL + 0.6);
  }
  // grass speckle (deterministic)
  let seed = 7; const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { c.fillStyle = rr() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,230,.05)'; c.fillRect(rr() * W, rr() * H, 3, 2); }
  c.fillStyle = '#a7a171'; FIELDS.forEach(([x, y, w, h]) => c.fillRect(x, y, w, h));
  c.strokeStyle = 'rgba(80,60,20,.12)'; c.lineWidth = 1;
  FIELDS.forEach(([x, y, w, h]) => { for (let yy = y + 7; yy < y + h; yy += 9) { c.beginPath(); c.moveTo(x + 3, yy); c.lineTo(x + w - 3, yy); c.stroke(); } });
  // contour lines every 6 m (marching squares over cell centres)
  c.strokeStyle = 'rgba(70,55,25,.3)'; c.lineWidth = 1.1; c.beginPath();
  for (let L = 6; L < HMAX; L += 6) {
    for (let cy = 0; cy < GH - 1; cy++) for (let cx = 0; cx < GW - 1; cx++) {
      const k = cy * GW + cx, v = [hgt[k], hgt[k + 1], hgt[k + GW + 1], hgt[k + GW]];
      if (Math.max(...v) < L || Math.min(...v) >= L) continue;
      const x0 = cx * CELL + CELL / 2, y0 = cy * CELL + CELL / 2;
      const P = [[x0, y0], [x0 + CELL, y0], [x0 + CELL, y0 + CELL], [x0, y0 + CELL]], pts = [];
      for (let e = 0; e < 4; e++) {
        const a = v[e], b = v[(e + 1) % 4];
        if ((a < L) !== (b < L)) { const t = (L - a) / (b - a), A = P[e], B = P[(e + 1) % 4]; pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
      }
      for (let i = 0; i + 1 < pts.length; i += 2) { c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[i + 1][0], pts[i + 1][1]); }
    }
  }
  c.stroke();
  // ponds
  PONDS.forEach(([x, y, rx, ry]) => {
    c.fillStyle = '#56704a'; c.beginPath(); c.ellipse(x, y, rx + 5, ry + 5, 0, 0, TAU); c.fill();
    c.fillStyle = '#5a7d93'; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
  });
  // the Goldbach
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = '#5a7148'; c.lineWidth = 30; polyStroke(c, STREAM);
  c.strokeStyle = '#557a92'; c.lineWidth = 18; polyStroke(c, STREAM);
  c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 2; c.setLineDash([14, 30]); polyStroke(c, STREAM); c.setLineDash([]);
  // roads
  c.strokeStyle = '#9b8e68'; c.lineWidth = ROAD_W; ROADS.forEach(r => polyStroke(c, r));
  c.strokeStyle = '#c4b78e'; c.lineWidth = ROAD_W - 6; ROADS.forEach(r => polyStroke(c, r));
  c.strokeStyle = 'rgba(0,0,0,.06)'; c.lineWidth = 2; ROADS.forEach(r => polyStroke(c, r));
  // bridges where roads cross the stream
  ROADS.forEach(r => {
    for (let i = 0; i < r.length - 1; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[i + 1], L = dxy(x0, y0, x1, y1), a = Math.atan2(y1 - y0, x1 - x0);
      for (let t = 0; t < L; t += 4) {
        const x = x0 + (x1 - x0) * t / L, y = y0 + (y1 - y0) * t / L;
        if (Math.abs(polyDist(x, y, STREAM)) < 2.5) {
          c.save(); c.translate(x, y); c.rotate(a);
          c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-17, -ROAD_W / 2 + 2, 36, ROAD_W + 2);
          c.fillStyle = '#8f7a58'; c.fillRect(-18, -ROAD_W / 2 - 1, 36, ROAD_W + 2);
          c.fillStyle = '#5e4a32'; c.fillRect(-18, -ROAD_W / 2 - 3, 36, 3); c.fillRect(-18, ROAD_W / 2 + 0, 36, 3);
          c.fillStyle = 'rgba(0,0,0,.12)'; for (let k = -15; k < 18; k += 6) c.fillRect(k, -ROAD_W / 2, 1.5, ROAD_W);
          c.restore(); t += 40;
        }
      }
    }
  });
  // woods
  TREES.forEach(([x, y, r]) => {
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(x + 4, y + 4, r, 0, TAU); c.fill();
    c.fillStyle = '#4a6436'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = '#58733f'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + Math.cos(k * 1.3) * r * 0.5, y + Math.sin(k * 1.3) * r * 0.5, r * 0.4, 0, TAU); c.fill(); }
  });
  HEDGES.forEach(([x, y, w, h]) => { c.fillStyle = '#3e5a2b'; rrect(c, x - 1, y - 1, w + 2, h + 2, 3); c.fill(); c.fillStyle = '#4a6a33'; rrect(c, x + 1, y + 1, w - 2, h - 2, 2); c.fill(); });
  WALLS.forEach(([x, y, w, h]) => { c.fillStyle = '#6a645a'; c.fillRect(x, y, w, h); c.fillStyle = '#b3ab98'; c.fillRect(x + 1, y + 1, w - 2, h - 2); });
  // villages: whitewashed houses with tiled roofs
  const roofs = ['#a5573f', '#93604a', '#b26a4b', '#8b5141'];
  HOUSES.forEach(([x, y, w, h], i) => {
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + 4, y + 4, w, h);
    c.fillStyle = '#e4dcc6'; c.fillRect(x, y, w, h);
    c.fillStyle = roofs[i % roofs.length]; c.fillRect(x + 2, y + 2, w - 4, h - 4);
    c.fillStyle = 'rgba(255,255,255,.1)';
    if (w >= h) c.fillRect(x + 2, y + 2, w - 4, (h - 4) / 2); else c.fillRect(x + 2, y + 2, (w - 4) / 2, h - 4);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.2;
    c.beginPath(); if (w >= h) { c.moveTo(x + 4, y + h / 2); c.lineTo(x + w - 4, y + h / 2); } else { c.moveTo(x + w / 2, y + 4); c.lineTo(x + w / 2, y + h - 4); } c.stroke();
    c.strokeStyle = '#4a3a2c'; c.lineWidth = 1.5; c.strokeRect(x, y, w, h);
  });
  // chapel cross on the Santon
  c.strokeStyle = '#f2ead6'; c.lineWidth = 2; c.beginPath(); c.moveTo(327, 143); c.lineTo(327, 159); c.moveTo(321, 148); c.lineTo(333, 148); c.stroke();
  // labels
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = 'italic 600 15px Georgia,serif'; c.fillStyle = 'rgba(40,32,18,.62)';
  VILLAGES.forEach(([n, x, y]) => c.fillText(n, x, y));
  c.font = 'italic 700 26px Georgia,serif'; c.fillStyle = 'rgba(60,48,22,.38)';
  c.save(); c.translate(1235, 440); c.fillText('P R A T Z E N   H E I G H T S', 0, 0); c.restore();
  c.font = 'italic 700 17px Georgia,serif'; c.fillText('Santon', 330, 100 + 22);
  c.save(); c.translate(548, 620); c.rotate(Math.PI / 2 - 0.12); c.font = 'italic 600 14px Georgia,serif'; c.fillStyle = 'rgba(30,50,70,.55)'; c.fillText('G o l d b a c h', 0, 0); c.restore();
  c.font = 'italic 600 13px Georgia,serif'; c.fillStyle = 'rgba(30,50,70,.5)'; c.fillText('Satschan ponds', 1300, 1040);
  c.strokeStyle = 'rgba(30,25,15,.6)'; c.lineWidth = 6; c.strokeRect(0, 0, W, H);
}
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  clampCam();
}
function zLimits() { return [Math.max(0.2, Math.min(VW / W, VH / H) * 0.9), 2.5]; }
function clampCam() {
  const [zmin, zmax] = zLimits();
  cam.z = clamp(cam.z, zmin, zmax);
  const vw = VW / cam.z, vh = VH / cam.z, m = 110 / cam.z;
  cam.x = vw > W + 2 * m ? (W - vw) / 2 : clamp(cam.x, -m, W - vw + m);
  cam.y = vh > H + 2 * m ? (H - vh) / 2 : clamp(cam.y, -m, H - vh + m);
}
function centerOn(x, y) { cam.x = x - VW / cam.z / 2; cam.y = y - VH / cam.z / 2; clampCam(); }
const toWorld = (sx, sy) => ({ x: cam.x + sx / cam.z, y: cam.y + sy / cam.z });

function star(c, x, y, r, fill) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); if (fill) c.fill(); else c.stroke();
}
// a unit is a block: depth along its facing (+x), frontage across (y)
function drawUnitBody(c, u, x, y, s, alpha) {
  c.save(); c.translate(x, y); c.globalAlpha = alpha;
  const N = NAT[u.nat] || NAT.fr, mc = MCOL[u.state];
  if (u.kind === 'cmdr') {
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.arc(1.5 * s, 1.5 * s, 8 * s, 0, TAU); c.fill();
    c.beginPath(); c.arc(0, 0, 8.5 * s, 0, TAU); c.strokeStyle = mc; c.lineWidth = 2.6 * s; c.stroke();
    c.beginPath(); c.arc(0, 0, 7 * s, 0, TAU); c.fillStyle = N.fill; c.fill();
    c.fillStyle = '#ffd34d'; star(c, 0, 0, 5 * s, true);
    c.strokeStyle = '#eee'; c.lineWidth = 1.2 * s; c.beginPath(); c.moveTo(6 * s, -2 * s); c.lineTo(6 * s, -16 * s); c.stroke();
    if (u.side === 0) { const fw = 3.2 * s; ['#2f4fb0', '#f4efe2', '#c23a32'].forEach((col, i) => { c.fillStyle = col; c.fillRect(6 * s + i * fw, -16 * s, fw, 7 * s); }); }
    else { c.fillStyle = '#f4efe2'; c.fillRect(6 * s, -16 * s, 9.6 * s, 7 * s); c.strokeStyle = SIDE_COL[1]; c.lineWidth = 1.4 * s; c.beginPath(); c.moveTo(6 * s, -16 * s); c.lineTo(15.6 * s, -9 * s); c.moveTo(15.6 * s, -16 * s); c.lineTo(6 * s, -9 * s); c.stroke(); }
    c.restore(); return;
  }
  c.rotate(u.ang);
  const [d0, w0] = dims(u), d = d0 * s, w = w0 * s;
  c.fillStyle = 'rgba(0,0,0,.28)';
  if (u.form !== 'open') c.fillRect(-d / 2 + 2 * s, -w / 2 + 2 * s, d, w);
  switch (u.form) {
    case 'open': {
      c.setLineDash([3 * s, 3 * s]); c.strokeStyle = mc; c.lineWidth = 1.6 * s; c.strokeRect(-d / 2, -w / 2, d, w); c.setLineDash([]);
      for (let i = 0; i < 8; i++) {
        const px = ((((i * 37 + u.id * 13) % 10) / 10) - 0.5) * d * 0.8, py = (i / 7 - 0.5) * w * 0.9;
        c.beginPath(); c.arc(px, py, 2.6 * s, 0, TAU); c.fillStyle = N.fill; c.fill(); c.strokeStyle = N.dark; c.lineWidth = 1 * s; c.stroke();
      }
      break;
    }
    case 'square': {
      c.fillStyle = mc; c.fillRect(-d / 2 - 2.5 * s, -w / 2 - 2.5 * s, d + 5 * s, w + 5 * s);
      c.fillStyle = N.fill; c.fillRect(-d / 2, -w / 2, d, w);
      c.fillStyle = 'rgba(40,46,28,.85)'; c.fillRect(-d / 2 + 5 * s, -w / 2 + 5 * s, d - 10 * s, w - 10 * s);
      c.strokeStyle = N.trim; c.lineWidth = 1.2 * s; c.strokeRect(-d / 2 + 1 * s, -w / 2 + 1 * s, d - 2 * s, w - 2 * s);
      break;
    }
    case 'deployed': {
      c.strokeStyle = mc; c.lineWidth = 2 * s; c.strokeRect(-d / 2 - 2 * s, -w / 2 - 2 * s, d + 4 * s, w + 4 * s);
      c.fillStyle = 'rgba(30,26,18,.35)'; c.fillRect(-d / 2, -w / 2, d, w);
      for (const k of ((u.sz || 1) < 0.5 ? [-0.9, 0.9] : [-1, 0, 1])) {
        const yy = k * w / 3;
        c.fillStyle = '#5a4630'; c.fillRect(-4 * s, yy - 4 * s, 3 * s, 8 * s);
        c.strokeStyle = '#1e1e1e'; c.lineWidth = 3 * s; c.beginPath(); c.moveTo(-3 * s, yy); c.lineTo(7 * s, yy); c.stroke();
        c.fillStyle = N.fill; c.beginPath(); c.arc(-8 * s, yy + 3 * s, 2 * s, 0, TAU); c.fill();
      }
      break;
    }
    case 'limbered': {
      c.fillStyle = mc; c.fillRect(-d / 2 - 2 * s, -w / 2 - 2 * s, d + 4 * s, w + 4 * s);
      c.fillStyle = '#6a5236'; c.fillRect(-d / 2, -w / 2, d * 0.55, w);
      c.fillStyle = N.fill; c.fillRect(-d / 2 + d * 0.1, -w / 2 + 2 * s, d * 0.3, w - 4 * s);
      c.fillStyle = '#7b5a3a'; for (const k of [-1, 1]) { c.beginPath(); c.ellipse(d * 0.22, k * w * 0.22, 4.5 * s, 2.2 * s, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(d * 0.42, k * w * 0.22, 4.5 * s, 2.2 * s, 0, 0, TAU); c.fill(); }
      break;
    }
    case 'mounted': {
      c.fillStyle = mc; c.fillRect(-d / 2 - 2.5 * s, -w / 2 - 2.5 * s, d + 5 * s, w + 5 * s);
      c.fillStyle = N.fill; c.fillRect(-d / 2, -w / 2, d, w);
      c.strokeStyle = N.trim; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(-d / 2, w / 2); c.lineTo(d / 2, -w / 2); c.stroke(); // cavalry slash
      if (u.type === 'hcav') { c.strokeStyle = 'rgba(230,235,240,.85)'; c.lineWidth = 1.4 * s; c.strokeRect(-d / 2 + 2 * s, -w / 2 + 2 * s, d - 4 * s, w - 4 * s); }
      break;
    }
    default: { // line / column (and the Guard)
      c.fillStyle = mc; c.fillRect(-d / 2 - 2.5 * s, -w / 2 - 2.5 * s, d + 5 * s, w + 5 * s);
      c.fillStyle = N.fill; c.fillRect(-d / 2, -w / 2, d, w);
      if (u.form === 'column') { c.fillStyle = N.dark; for (let k = 1; k < 4; k++) c.fillRect(-d / 2 + d * k / 4 - 0.6 * s, -w / 2, 1.2 * s, w); }
      else { c.fillStyle = N.dark; c.fillRect(-d / 2, -w / 2, d * 0.35, w); }
      if (u.type === 'guard') { c.strokeStyle = '#e8bf4a'; c.lineWidth = 1.6 * s; c.strokeRect(-d / 2 + 1 * s, -w / 2 + 1 * s, d - 2 * s, w - 2 * s); c.fillStyle = '#1a1a22'; c.fillRect(d / 2 - 2.6 * s, -w / 2 + 1 * s, 1.6 * s, w - 2 * s); }
      c.fillStyle = N.trim; c.fillRect(d / 2 - 1.6 * s, -w / 2, 1.6 * s, w);
    }
  }
  // facing pointer
  if (u.form !== 'square') { c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.moveTo(d / 2 + 6 * s, 0); c.lineTo(d / 2 + 1.5 * s, -3.5 * s); c.lineTo(d / 2 + 1.5 * s, 3.5 * s); c.fill(); }
  c.restore();
}
// icon version for chips, cards and the after-action list (facing up, scaled to fit)
function drawUnitIcon(g, u, cx, cy, size, alpha = 1) {
  const fake = Object.assign({}, u, { ang: -Math.PI / 2, form: u.formTo || u.form });
  if (u.kind === 'cmdr') return drawUnitBody(g, fake, cx, cy + 3, size / 22, alpha);
  const [d, w] = dims(fake);
  drawUnitBody(g, fake, cx, cy + 2, Math.min(1.6, size / (Math.max(d, w) + 8)), alpha);
}
function drawUnit(c, u, s, now) {
  const x = u.x, y = u.y, sv = Math.min(s, 1.5);
  if (u.flash > 0 && u.t.w) {
    c.fillStyle = 'rgba(255,230,140,.95)';
    for (const k of (u.form === 'line' ? [-0.4, -0.13, 0.13, 0.4] : u.form === 'deployed' ? ((u.sz || 1) < 0.5 ? [-0.3, 0.3] : [-0.33, 0, 0.33]) : [0])) { const p = frontPt(u, k, 3); c.beginPath(); c.arc(p.x, p.y, (u.form === 'deployed' ? 5 : 3) * sv, 0, TAU); c.fill(); }
  }
  drawUnitBody(c, u, x, y, sv, 1);
  const bw = 24 * s, by = y - (u.kind === 'cmdr' ? 22 : 24) * s, f = hpf(u);
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 4 * s + 2);
  c.fillStyle = f > 0.6 ? '#8bd35a' : f > 0.3 ? '#e6c83a' : '#e8402f'; c.fillRect(x - bw / 2, by, bw * f, 4 * s);
  if (isCav(u)) { // stamina sliver under the strength bar
    const st = 1 - u.fat / 100;
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - bw / 2 - 1, by + 4 * s + 1, bw + 2, 2.5 * s + 1);
    c.fillStyle = u.fat >= 50 ? '#9a9a9a' : '#7fc7ff'; c.fillRect(x - bw / 2, by + 4 * s + 1.5, bw * st, 2 * s);
  }
  c.font = `bold ${12 * s}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  if (u.state === 3) { c.fillStyle = '#e8402f'; c.fillText('!', x + 17 * s, by + 2 * s); }
  if (u.state === 4) { c.fillStyle = '#fff'; c.fillText('✕', x + 17 * s, by + 2 * s); }
  if (u.state === 2) { c.fillStyle = MCOL[2]; c.beginPath(); c.moveTo(x + 13 * s, by - 2 * s); c.lineTo(x + 21 * s, by - 2 * s); c.lineTo(x + 17 * s, by + 4 * s); c.fill(); }
  if (u.formT > 0) {
    const k = 1 - u.formT / u.formT0;
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 4 * s; c.beginPath(); c.arc(x, y, 19 * s, 0, TAU); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 2.4 * s; c.beginPath(); c.arc(x, y, 19 * s, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
    c.font = `bold ${11 * s}px system-ui,sans-serif`; c.fillStyle = '#fff'; c.fillText(FORM_ICON[u.formTo] || '…', x - 19 * s, by + 2 * s);
  }
  if (isCav(u) && u.fat >= 50 && u.state < 4) { c.fillStyle = 'rgba(230,230,230,.8)'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x - 16 * s + i * 4 * s, y + 13 * s - ((now * 8 + i * 3) % 6) * s, 2.2 * s, 0, TAU); c.fill(); } }
  if (u.order.type === 'charge' && u.state < 3) {
    c.strokeStyle = u.side === 0 ? 'rgba(255,215,90,.95)' : 'rgba(255,90,70,.95)'; c.lineWidth = 2.6 * s;
    const a = u.ang, ph = (now * 3) % 1;
    for (let k = 0; k < 2; k++) {
      const r = (18 + (k + ph) * 7) * s, cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
      c.beginPath(); c.moveTo(cx - Math.cos(a - 0.7) * 6 * s, cy - Math.sin(a - 0.7) * 6 * s); c.lineTo(cx, cy); c.lineTo(cx - Math.cos(a + 0.7) * 6 * s, cy - Math.sin(a + 0.7) * 6 * s); c.stroke();
    }
  }
  if (u.rallyT > 0 && u.state >= 3) {
    const k = u.rallyT / (u.state === 4 ? 6 : 3.5);
    c.strokeStyle = '#ffd34d'; c.lineWidth = 2.5 * s;
    c.beginPath(); c.arc(x, y, 20 * s, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
    c.fillStyle = '#ffd34d'; star(c, x - 17 * s, by, 5 * s, true);
  }
  if (u.side === 0 && u.dv) { // division pip (hollow white = under your direct orders)
    c.beginPath(); c.arc(x - bw / 2 + 3 * s, by - 4.5 * s, 2.8 * s, 0, TAU);
    if (u.direct) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5 * s; c.stroke(); }
    else { c.fillStyle = u.dv.col; c.fill(); c.strokeStyle = 'rgba(0,0,0,.65)'; c.lineWidth = 1 * s; c.stroke(); }
  }
  if (u.side === 0) {
    if (u.ammoMax && u.ammo / u.ammoMax < 0.25) { c.fillStyle = u.ammo <= 0 ? '#e8402f' : '#e6c83a'; c.fillRect(x + 13 * s, y + 9 * s, 5 * s, 5 * s); }
    if (u.order.type === 'hold' && !(u.rallyT > 0) && !(u.formT > 0)) {
      const hx = x - 18 * s, hy = by - 1 * s;
      c.fillStyle = '#dfe8ff'; c.beginPath(); c.moveTo(hx - 3 * s, hy - 2 * s); c.lineTo(hx + 3 * s, hy - 2 * s); c.lineTo(hx + 3 * s, hy + 3 * s); c.lineTo(hx, hy + 6 * s); c.lineTo(hx - 3 * s, hy + 3 * s); c.fill();
    }
  }
}
function drawFloater(c, f, s) {
  const k = f.t / 1.3, x = f.x, y = f.y - 30 * s - k * 22 * s;
  c.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
  c.lineCap = 'round';
  switch (f.kind) {
    case 'hit':
      c.strokeStyle = '#ff4b3a'; c.lineWidth = 2.6 * s;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(x - Math.cos(a) * 6 * s, y - Math.sin(a) * 6 * s); c.lineTo(x + Math.cos(a) * 6 * s, y + Math.sin(a) * 6 * s); c.stroke(); }
      break;
    case 'sup':
      c.strokeStyle = '#ffe066'; c.lineWidth = 2 * s;
      for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x - 7 * s, y + i * 4 * s); c.quadraticCurveTo(x - 3.5 * s, y + i * 4 * s - 3 * s, x, y + i * 4 * s); c.quadraticCurveTo(x + 3.5 * s, y + i * 4 * s + 3 * s, x + 7 * s, y + i * 4 * s); c.stroke(); }
      break;
    case 'pin':
      c.strokeStyle = MCOL[2]; c.lineWidth = 2.8 * s;
      for (const o of [-3, 3]) { c.beginPath(); c.moveTo(x - 6 * s, y + (o - 3) * s); c.lineTo(x, y + (o + 2) * s); c.lineTo(x + 6 * s, y + (o - 3) * s); c.stroke(); }
      break;
    case 'panic':
      c.fillStyle = MCOL[3]; c.beginPath(); c.arc(x, y, 7 * s, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.font = `bold ${11 * s}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', x, y + 0.5 * s);
      break;
    case 'broken':
      c.strokeStyle = '#ddd'; c.lineWidth = 1.6 * s; c.beginPath(); c.moveTo(x - 4 * s, y + 7 * s); c.lineTo(x - 4 * s, y - 7 * s); c.stroke();
      c.fillStyle = '#fff'; c.fillRect(x - 4 * s, y - 7 * s, 10 * s, 7 * s);
      break;
    case 'star':
      c.fillStyle = '#ffd34d'; star(c, x, y, 8 * s, true); c.strokeStyle = '#8a6d10'; c.lineWidth = 1; star(c, x, y, 8 * s, false);
      break;
    case 'ammo':
      c.fillStyle = '#e0b24a';
      for (const o of [-5, 0, 5]) { c.fillRect(x + o * s - 1.6 * s, y - 3 * s, 3.2 * s, 7 * s); c.beginPath(); c.arc(x + o * s, y - 3 * s, 1.6 * s, Math.PI, 0); c.fill(); }
      break;
    case 'clash':
      c.strokeStyle = '#f2f2f2'; c.lineWidth = 2.6 * s;
      c.beginPath(); c.moveTo(x - 7 * s, y + 7 * s); c.lineTo(x + 7 * s, y - 7 * s); c.moveTo(x + 7 * s, y + 7 * s); c.lineTo(x - 7 * s, y - 7 * s); c.stroke();
      c.strokeStyle = '#e8bf4a'; c.lineWidth = 2.2 * s;
      c.beginPath(); c.moveTo(x - 7 * s, y + 3 * s); c.lineTo(x - 3 * s, y + 7 * s); c.moveTo(x + 7 * s, y + 3 * s); c.lineTo(x + 3 * s, y + 7 * s); c.stroke();
      break;
    case 'blown':
      c.fillStyle = 'rgba(230,230,230,.9)'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x - 6 * s + i * 6 * s, y - (i % 2) * 3 * s, 3.2 * s, 0, TAU); c.fill(); }
      break;
  }
  c.globalAlpha = 1;
}
const MODE_COL = { quick: '255,220,90', charge: '255,110,80', move: '255,255,255' };
function drawPin(c, x, y, mode, s, a) {
  const col = MODE_COL[mode] || MODE_COL.move;
  c.strokeStyle = `rgba(${col},${a})`; c.lineWidth = 2.2 * s;
  c.beginPath(); c.arc(x, y, 7 * s, 0, TAU); c.stroke();
  c.fillStyle = `rgba(${col},${a})`; c.beginPath(); c.arc(x, y, 2.5 * s, 0, TAU); c.fill();
}
function pathLine(c, u, path, mode, s, alpha) {
  const col = MODE_COL[mode] || MODE_COL.move;
  c.setLineDash([7 * s, 6 * s]); c.lineWidth = 2 * s; c.strokeStyle = `rgba(${col},${alpha})`;
  c.beginPath(); c.moveTo(u.x, u.y); for (const p of path) c.lineTo(p.x, p.y); c.stroke(); c.setLineDash([]);
}

// ---------------------------------------------------------------- fire-range rings & aiming
// solid inner ring = effective range, dashed outer ring = max range; guns add a canister ring
const RING = {
  musket:  { col: '150,230,110', dash: [10, 7] },
  lmusket: { col: '110,205,255', dash: [20, 8] },
  cannon:  { col: '255,176,80', dash: [12, 6] },
  hcannon: { col: '255,196,120', dash: [12, 6] },
  canister: { col: '255,84,60' },
  charge:  { col: '255,110,80', dash: [3, 6] },
  aura:    { col: '255,211,77', dash: [6, 6] },
};
const THREAT_COL = '240,70,55';
const RAYS = 120;
// march a ray like sight(): other houses stop it, thick woods stop it, a hill crest stops it,
// hedges/walls only thin it
function rayReach(x0, y0, dx, dy, maxR, ha) {
  let trees = 0, clear = -1, inH = 0, maxSl = -1e9;
  const z0 = heightAt(x0, y0) + 2;
  for (let r = 6, i = 1; r <= maxR; r += 6, i++) {
    const x = x0 + dx * r, y = y0 + dy * r;
    if (x < 0 || y < 0 || x >= W || y >= H) return [r, clear < 0 ? r : clear];
    const k = cellIdx(x, y), h = hid[k];
    if (inH) { if (h !== inH) return [r - 3, clear < 0 ? r - 3 : Math.min(clear, r - 3)]; }
    else if (h && h !== ha) inH = h;
    const t = terr[k];
    if (t === T_TREE && i > 3 && ++trees > 5) return [r, clear < 0 ? r : Math.min(clear, r)];
    if (clear < 0 && (t === T_HEDGE || t === T_WALL) && i > 2) clear = r + 10;
    if (r > 18 && (hgt[k] + 2 - z0) / r < maxSl - 0.003) return [r, clear < 0 ? r : Math.min(clear, r)];
    if (r > 12) { const sg = (hgt[k] - 0.6 - z0) / r; if (sg > maxSl) maxSl = sg; }
  }
  return [maxR, clear < 0 ? maxR : Math.min(clear, maxR)];
}
function smokeClamp(x0, y0, dx, dy, r) {
  for (const sm of G.smokes) {
    if (sm.r < 12 || sm.dens < 0.35) continue;
    const R = sm.r * 0.85, ox = sm.x - x0, oy = sm.y - y0;
    const t = ox * dx + oy * dy, perp = Math.abs(ox * dy - oy * dx);
    if (perp >= R) continue;
    const half = Math.sqrt(R * R - perp * perp);
    if (t + half <= 0) continue;
    r = Math.min(r, Math.max(0, t - half));
  }
  return r;
}
function visPoly(u, R) {
  const now = performance.now(), c = u._vis;
  if (c && c.R === R && Math.abs(c.x - u.x) < 3 && Math.abs(c.y - u.y) < 3 && now - c.t < 400 && c.ns === G.smokes.length) return c;
  const ha = houseAt(u.x, u.y), far = new Float32Array(RAYS * 2), clr = new Float32Array(RAYS * 2);
  for (let i = 0; i < RAYS; i++) {
    const a = i / RAYS * TAU, dx = Math.cos(a), dy = Math.sin(a);
    let [f, cl] = rayReach(u.x, u.y, dx, dy, R, ha);
    f = smokeClamp(u.x, u.y, dx, dy, f); cl = Math.min(cl, f);
    far[i * 2] = u.x + dx * f; far[i * 2 + 1] = u.y + dy * f;
    clr[i * 2] = u.x + dx * cl; clr[i * 2 + 1] = u.y + dy * cl;
  }
  return (u._vis = { x: u.x, y: u.y, R, t: now, ns: G.smokes.length, far, clr });
}
function polyPath(c, P) { c.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) c.lineTo(P[i], P[i + 1]); c.closePath(); }
function ringLabel(c, x, y, txt, col, s) {
  c.font = `bold ${11 * s}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 3 * s; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(txt, x, y);
  c.fillStyle = `rgb(${col})`; c.fillText(txt, x, y);
}
function losFill(c, u, R, col, k, full, inner) {
  const V = visPoly(u, R);
  if (full) {
    c.beginPath(); c.arc(u.x, u.y, R, 0, TAU); polyPath(c, V.far);
    c.fillStyle = `rgba(8,10,6,${0.32 * k})`; c.fill('evenodd');
    c.beginPath(); polyPath(c, V.far); polyPath(c, V.clr);
    c.fillStyle = `rgba(8,10,6,${0.13 * k})`; c.fill('evenodd');
  }
  c.save(); c.beginPath(); polyPath(c, V.far); c.clip();
  c.beginPath(); c.arc(u.x, u.y, R, 0, TAU); c.fillStyle = `rgba(${col},${0.08 * k})`; c.fill();
  if (inner) { c.beginPath(); c.arc(u.x, u.y, inner, 0, TAU); c.fillStyle = `rgba(${col},${0.12 * k})`; c.fill(); }
  c.restore();
}
// k = intensity (1 selected, ~0.4 faint "all units" mode); threat = enemy view in red
function drawRings(c, u, s, k, threat) {
  const full = k >= 0.5;
  c.save();
  if (u.kind === 'cmdr') {
    const col = threat ? THREAT_COL : RING.aura.col;
    c.beginPath(); c.arc(u.x, u.y, RALLY_R, 0, TAU); c.fillStyle = `rgba(${col},${0.07 * k})`; c.fill();
    c.setLineDash(RING.aura.dash.map(v => v * s)); c.strokeStyle = `rgba(${col},${0.85 * k})`; c.lineWidth = 2 * s; c.stroke(); c.setLineDash([]);
    if (full) ringLabel(c, u.x + Math.cos(-0.8) * RALLY_R, u.y + Math.sin(-0.8) * RALLY_R, `⭐${RALLY_R}m`, col, s);
    c.restore(); return;
  }
  if (!u.t.w) { // cavalry: charge reach
    const R = CHARGE_R.cav, blown = u.fat >= 50, col = threat ? THREAT_COL : blown ? '170,170,170' : RING.charge.col;
    losFill(c, u, R, col, k, full, 0);
    c.beginPath(); c.arc(u.x, u.y, R, 0, TAU); c.setLineDash(RING.charge.dash.map(v => v * s));
    c.strokeStyle = `rgba(${col},${0.9 * k})`; c.lineWidth = 2.4 * s; c.stroke(); c.setLineDash([]);
    if (full) ringLabel(c, u.x + Math.cos(-0.8) * R, u.y + Math.sin(-0.8) * R, blown ? '💨 blown' : `⚔${R}m`, col, s);
    c.restore(); return;
  }
  const w = WPN[u.t.w], st = RING[u.t.w];
  const col = threat ? THREAT_COL : st.col;
  const R = w.range, E = R * (w.eff || 0.5);
  losFill(c, u, R, col, k, full, E);
  c.beginPath(); c.arc(u.x, u.y, E, 0, TAU); c.setLineDash([]);
  c.strokeStyle = `rgba(${col},${0.9 * k})`; c.lineWidth = 2.2 * s; c.stroke();
  c.beginPath(); c.arc(u.x, u.y, R, 0, TAU); c.setLineDash((threat ? [9, 6] : st.dash).map(v => v * s));
  c.strokeStyle = `rgba(${col},${0.85 * k})`; c.lineWidth = 1.8 * s; c.stroke(); c.setLineDash([]);
  if (w.gun) {
    const cc = threat ? THREAT_COL : RING.canister.col;
    c.beginPath(); c.arc(u.x, u.y, w.can, 0, TAU); c.fillStyle = `rgba(${cc},${0.1 * k})`; c.fill();
    c.strokeStyle = `rgba(${cc},${0.95 * k})`; c.lineWidth = 3 * s; c.stroke();
    if (full) ringLabel(c, u.x + Math.cos(-2.3) * w.can, u.y + Math.sin(-2.3) * w.can, `✸${w.can}m`, cc, s);
  }
  if (full) ringLabel(c, u.x + Math.cos(-0.8) * R, u.y + Math.sin(-0.8) * R, `${R}m`, col, s);
  c.restore();
}
function inRangeOf(sel, o) {
  for (const u of sel) {
    if (!live(u) || !canAct(u)) continue;
    if (u.t.w && u.ammo > 0 && validTarget(u, o, WPN[u.t.w])) return true;
    if (isCav(u) && u.fat < 50 && isSeen(o, 0) && dist(u, o) <= CHARGE_R.cav && losU(u, o) > 0) return true;
  }
  return false;
}
function aimInfo(u, x, y, tgt) {
  const d = dxy(u.x, u.y, x, y);
  if (!u.t.w || (G.pend === 'charge' && tgt && canCharge(u))) { // charge estimate
    const r = { wk: 'charge', d, ok: true, p: 0, why: '', area: !tgt, charge: true };
    const R = CHARGE_R[isCav(u) ? 'cav' : 'inf'];
    if (!canCharge(u)) { r.ok = false; r.why = isCav(u) ? '💨' : '◻'; }
    else if (d > R * 1.15) { r.ok = false; }
    else if (!LOS(u.x, u.y, x, y)) { r.ok = false; r.why = '👁'; }
    else if (tgt) { const m = meleePowers(Object.assign({}, u, { chargeD: Math.min(d, 200) }), tgt); r.p = m.ap / (m.ap + m.dp); }
    else r.p = 0.5;
    return r;
  }
  const w = WPN[u.t.w];
  const r = { wk: u.t.w, d, ok: true, p: 0, why: '', area: !tgt, can: w.gun && d <= w.can };
  const sf = sight(u.x, u.y, x, y);
  if (u.ammo <= 0) { r.ok = false; r.why = '⁍'; }
  else if (d > w.range) { r.ok = false; r.why = ''; }
  else if (!(sf > 0)) { r.ok = false; r.why = '👁'; }
  else if (isArt(u) && (u.formTo || u.form) !== 'deployed') { r.ok = false; r.why = '🐴'; }
  if (r.ok) {
    const o = tgt || { x, y, moving: false, form: 'column', ang: 0 };
    r.p = w.gun ? gunHitP(u, w, d, o, tgt ? undefined : sf) : hitChance(u, w, d, o, tgt ? undefined : sf);
  }
  return r;
}
const GOOD = '126,224,90', FAIR = '255,214,74', BAD = '240,70,55';
function drawAim(c, s, badges) {
  const A = G.aim;
  if (!A) return;
  const tgt = A.tgt && live(A.tgt) ? A.tgt : null;
  const x = tgt ? tgt.x : A.x, y = tgt ? tgt.y : A.y;
  let anyOk = false;
  for (const u of G.sel) {
    if (!live(u) || u.state >= 3 || u.kind === 'cmdr') continue;
    const r = aimInfo(u, x, y, tgt), w = WPN[r.wk];
    let col;
    if (!r.ok) col = BAD;
    else if (r.charge) col = r.p >= 0.58 ? GOOD : r.p >= 0.45 ? FAIR : BAD;
    else if (r.area && !w.gun) col = r.d <= w.range * (w.eff || 0.5) ? GOOD : FAIR;
    else col = r.p >= 0.3 ? GOOD : r.p >= 0.14 ? FAIR : BAD;
    anyOk = anyOk || r.ok;
    c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 5 * s; c.setLineDash(r.ok ? [] : [7 * s, 6 * s]);
    c.beginPath(); c.moveTo(u.x, u.y); c.lineTo(x, y); c.stroke();
    c.strokeStyle = `rgb(${col})`; c.lineWidth = 2.6 * s; if (r.charge && r.ok) c.setLineDash([12 * s, 5 * s]); c.stroke(); c.setLineDash([]);
    const txt = !r.ok ? `✖${r.why ? ' ' + r.why : ''} ${Math.round(r.d)}m`
      : r.charge ? `⚔ ${Math.round(r.d)}m ${Math.round(r.p * 100)}%`
      : (r.area && !w.gun) ? `${Math.round(r.d)}m ≋` : `${r.can ? '✸' : ''}${Math.round(r.d)}m ${Math.round(r.p * 100)}%`;
    badges.push({ x: u.x + (x - u.x) * 0.6, y: u.y + (y - u.y) * 0.6, txt, col });
  }
  const col = anyOk ? '255,255,255' : BAD;
  c.strokeStyle = `rgb(${col})`; c.lineWidth = 2.2 * s;
  c.beginPath(); c.arc(x, y, 13 * s, 0, TAU); c.stroke();
  c.beginPath(); c.moveTo(x - 19 * s, y); c.lineTo(x - 7 * s, y); c.moveTo(x + 7 * s, y); c.lineTo(x + 19 * s, y);
  c.moveTo(x, y - 19 * s); c.lineTo(x, y - 7 * s); c.moveTo(x, y + 7 * s); c.lineTo(x, y + 19 * s); c.stroke();
  if (!anyOk) {
    c.lineWidth = 3.5 * s; c.beginPath(); c.moveTo(x - 8 * s, y - 8 * s); c.lineTo(x + 8 * s, y + 8 * s); c.moveTo(x + 8 * s, y - 8 * s); c.lineTo(x - 8 * s, y + 8 * s); c.stroke();
  }
}
function drawBadges(badges) {
  if (!badges.length) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.font = 'bold 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const b of badges) {
    const sx = (b.x - cam.x) * cam.z, sy = (b.y - cam.y) * cam.z - 14;
    const tw = ctx.measureText(b.txt).width + 12;
    ctx.fillStyle = 'rgba(12,14,9,.85)'; rrect(ctx, sx - tw / 2, sy - 10, tw, 20, 10); ctx.fill();
    ctx.strokeStyle = `rgb(${b.col})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(b.txt, sx, sy + 0.5);
  }
}
function drawInRange(c, o, s, now) {
  const r = 20 * s, L = 6 * s, a = 0.55 + 0.35 * Math.sin(now * 5);
  c.strokeStyle = `rgba(255,224,102,${a})`; c.lineWidth = 2.2 * s;
  c.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    c.moveTo(o.x + sx * r, o.y + sy * (r - L)); c.lineTo(o.x + sx * r, o.y + sy * r); c.lineTo(o.x + sx * (r - L), o.y + sy * r);
  }
  c.stroke();
}
// commanders and their zones
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function arrowTo(c, x0, y0, x1, y1, col, s, a) {
  const an = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
  c.strokeStyle = `rgba(0,0,0,${0.4 * a})`; c.lineWidth = 5 * s; c.stroke();
  c.strokeStyle = hexA(col, 0.95 * a); c.lineWidth = 2.4 * s; c.setLineDash([9 * s, 6 * s]); c.stroke(); c.setLineDash([]);
  c.fillStyle = hexA(col, 0.95 * a); c.beginPath(); c.moveTo(x1, y1);
  c.lineTo(x1 - Math.cos(an - 0.45) * 14 * s, y1 - Math.sin(an - 0.45) * 14 * s); c.lineTo(x1 - Math.cos(an + 0.45) * 14 * s, y1 - Math.sin(an + 0.45) * 14 * s); c.closePath(); c.fill();
}
function tagText(c, txt, x, y, col, s, a = 1) {
  c.font = `bold ${11 * s}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.globalAlpha = a; c.lineWidth = 3.2 * s; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(txt, x, y);
  c.fillStyle = col; c.fillText(txt, x, y); c.globalAlpha = 1;
}
function drawZone(c, d, Z, post, s, now, a, sel, k) {
  c.beginPath(); c.arc(Z.x, Z.y, Z.r, 0, TAU);
  c.fillStyle = hexA(d.col, (sel ? 0.13 : 0.05) * a); c.fill();
  c.strokeStyle = `rgba(0,0,0,${0.32 * a})`; c.lineWidth = (sel ? 6 : 4) * s; c.stroke();
  c.setLineDash([11 * s, 7 * s]); c.lineDashOffset = sel ? -now * 14 : 0;
  c.strokeStyle = hexA(d.col, 0.95 * a); c.lineWidth = (sel ? 3 : 2) * s; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
  tagText(c, `${post === 'attack' ? '⚔' : '🛡'} ${d.name}${Z.name ? ' · ' + Z.name : ''}`, Z.x, Z.y - Z.r - (9 + k * 15) * s, d.col, s, sel ? 1 : 0.8);
}
function drawZones(c, s, now) {
  const cnt = {};
  for (const d of G.divs) {
    if (d.side !== 0 || !d.zone || !d.units.some(u => (live(u) && u.state < 4) || u.reserve)) continue;
    const Z = d.zone, key = Z.x + ',' + Z.y, k = cnt[key] = (cnt[key] ?? -1) + 1;
    const sel = G.selDiv === d, a = sel ? 1 : 0.5;
    drawZone(c, d, Z, d.post, s, now, a, sel, k);
    if (d.hq) { const dd = dxy(d.hq.x, d.hq.y, Z.x, Z.y); if (dd > Z.r + 26) arrowTo(c, d.hq.x, d.hq.y, Z.x - (Z.x - d.hq.x) / dd * Z.r, Z.y - (Z.y - d.hq.y) / dd * Z.r, d.col, s, a); }
    if (sel) for (const u of d.units) {
      if (!live(u) || !u.spot || u.direct || u.state >= 3 || dist(u, u.spot) < 14) continue;
      c.strokeStyle = hexA(d.col, 0.55); c.lineWidth = 1.4 * s; c.setLineDash([3 * s, 4 * s]);
      c.beginPath(); c.moveTo(u.x, u.y); c.lineTo(u.spot.x, u.spot.y); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(u.spot.x, u.spot.y, 5 * s, 0, TAU); c.strokeStyle = hexA(d.col, 0.9); c.lineWidth = 1.8 * s; c.stroke();
    }
  }
  const P = G.zonePrev;
  if (P && P.div) {
    drawZone(c, P.div, P, P.div.post, s, now, 1, true, 0);
    if (P.div.hq) { const dd = dxy(P.div.hq.x, P.div.hq.y, P.x, P.y); if (dd > P.r + 10) arrowTo(c, P.div.hq.x, P.div.hq.y, P.x - (P.x - P.div.hq.x) / dd * P.r, P.y - (P.y - P.div.hq.y) / dd * P.r, P.div.col, s, 1); }
  }
}
function drawHQ(c, d, x, y, s, now) {
  const sel = G.selDiv === d, r = 9 * s;
  if (sel) { c.beginPath(); c.arc(x, y, r + (6 + 2 * Math.sin(now * 6)) * s, 0, TAU); c.strokeStyle = '#fff'; c.lineWidth = 2 * s; c.stroke(); }
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(x + 1.5 * s, y + 1.5 * s, r, 0, TAU); c.fill();
  c.fillStyle = d.side ? '#2a4521' : '#1b2d66'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.strokeStyle = d.col; c.lineWidth = 2.6 * s; c.stroke();
  const sx = x + r * 0.7, top = y - r - 12 * s, fw = 13 * s, fh = 7.5 * s;
  c.strokeStyle = '#eee'; c.lineWidth = 1.3 * s; c.beginPath(); c.moveTo(sx, y - r * 0.6); c.lineTo(sx, top); c.stroke();
  c.beginPath(); c.moveTo(sx, top); c.lineTo(sx + fw, top); c.lineTo(sx + fw * 0.7, top + fh / 2); c.lineTo(sx + fw, top + fh); c.lineTo(sx, top + fh); c.closePath();
  c.fillStyle = d.col; c.fill(); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 0.8 * s; c.stroke();
  c.fillStyle = d.col; c.font = `bold ${(DIV_AB[d.key] || '').length > 1 ? 7.5 * s : 10 * s}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(DIV_AB[d.key] || d.name[0], x, y + 0.5 * s);
  tagText(c, d.name, x, y + r + 8 * s, sel ? '#fff' : d.col, s * 0.92);
}
function drawHQs(c, s, now) {
  for (const d of G.divs) {
    if (d.side === 0) { if (d.hq) drawHQ(c, d, d.hq.x, d.hq.y, s, now); continue; }
    if (G.phase !== 'battle') continue;
    const vis = d.units.filter(u => live(u) && u.state < 4 && (isSeen(u, 0) || G.over));
    if (!vis.length) continue;
    const ce = centroid(vis), th = d.theta ?? Math.PI;
    drawHQ(c, d, ce.x - Math.cos(th) * 40, ce.y - Math.sin(th) * 40, s, now);
  }
}
// fog banks: big soft blobs drifting with the wind
const FOG_BLOBS = Array.from({ length: 16 }, (_, i) => ({ x: (i * 397) % W, y: (i * 271 + 90) % H, r: 160 + (i * 53) % 120 }));
function drawFog(c, now) {
  if (G.fog <= 0.01) return;
  c.fillStyle = `rgba(222,226,218,${0.3 * G.fog})`; c.fillRect(-200, -200, W + 400, H + 400);
  const t = G.phase === 'battle' ? G.time : now;
  for (const b of FOG_BLOBS) {
    const x = ((b.x + t * 6) % (W + 400)) - 200, y = b.y + Math.sin(t * 0.05 + b.r) * 20;
    const g = c.createRadialGradient(x, y, 0, x, y, b.r);
    g.addColorStop(0, `rgba(235,238,232,${0.32 * G.fog})`); g.addColorStop(1, 'rgba(235,238,232,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, b.r, 0, TAU); c.fill();
  }
}
function drawFlag(c, f, s, now) {
  c.strokeStyle = '#eee'; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(f.x, f.y + 4 * s); c.lineTo(f.x, f.y - 24 * s); c.stroke();
  const wave = Math.sin(now * 4 + f.x) * 1.5 * s, fw = 18 * s, fh = 12 * s, x0 = f.x, y0 = f.y - 24 * s;
  if (f.owner === 0) ['#2f4fb0', '#f4efe2', '#c23a32'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.moveTo(x0 + i * fw / 3, y0 + (i ? wave * i / 3 : 0)); c.lineTo(x0 + (i + 1) * fw / 3, y0 + wave * (i + 1) / 3); c.lineTo(x0 + (i + 1) * fw / 3, y0 + fh + wave * (i + 1) / 3); c.lineTo(x0 + i * fw / 3, y0 + fh + (i ? wave * i / 3 : 0)); c.fill(); });
  else if (f.owner === 1) { c.fillStyle = '#f4efe2'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + fw, y0 + wave); c.lineTo(x0 + fw, y0 + fh + wave); c.lineTo(x0, y0 + fh); c.fill(); c.strokeStyle = SIDE_COL[1]; c.lineWidth = 2.4 * s; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + fw, y0 + fh + wave); c.moveTo(x0 + fw, y0 + wave); c.lineTo(x0, y0 + fh); c.stroke(); }
  else { c.fillStyle = '#ddd'; c.fillRect(x0, y0, fw, fh); }
}
function render() {
  const now = performance.now() / 1000;
  const dbg = G.dbg = { rings: 0, faint: 0, threat: 0, inRange: 0, badges: 0 }; // read by the test harness
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#262e1e'; ctx.fillRect(0, 0, cv.width, cv.height);
  let shx = 0, shy = 0;
  if (G.shake > 0.3) { shx = rnd(-1, 1) * G.shake; shy = rnd(-1, 1) * G.shake; }
  ctx.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, (-cam.x * cam.z + shx) * DPR, (-cam.y * cam.z + shy) * DPR);
  ctx.drawImage(mapCv, 0, 0, W, H);
  const s = Math.max(1, 0.8 / cam.z);
  const battle = G.phase === 'battle';
  drawFog(ctx, now);
  if (G.phase === 'deploy') {
    const pulse = 0.5 + 0.5 * Math.sin(now * 3);
    ctx.fillStyle = `rgba(51,89,181,${0.1 + pulse * 0.06})`;
    ctx.beginPath(); ctx.moveTo(20, 20); ctx.lineTo(585, 20); ctx.lineTo(585, 760); ctx.lineTo(735, 760); ctx.lineTo(735, 1075); ctx.lineTo(585, 1075); ctx.lineTo(585, 1080); ctx.lineTo(20, 1080); ctx.closePath();
    ctx.fill(); ctx.setLineDash([12, 8]); ctx.strokeStyle = 'rgba(220,230,255,.85)'; ctx.lineWidth = 3 * s; ctx.stroke(); ctx.setLineDash([]);
    for (const py of [180, 520, 900]) { const px = 585 - 26 * s; ['#2f4fb0', '#f4efe2', '#c23a32'].forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(px + i * 5 * s, py - 6 * s, 5 * s, 12 * s); }); }
  }
  for (const f of G.flags) {
    ctx.beginPath(); ctx.arc(f.x, f.y, CAP_R, 0, TAU);
    ctx.fillStyle = f.owner === 0 ? 'rgba(51,89,181,.16)' : f.owner === 1 ? 'rgba(79,125,63,.2)' : 'rgba(255,255,255,.08)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    if (f.prog > 0) {
      ctx.beginPath(); ctx.arc(f.x, f.y, CAP_R, -Math.PI / 2, -Math.PI / 2 + TAU * f.prog);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = SIDE_COL[f.capSide] || '#fff'; ctx.lineWidth = 6; ctx.stroke();
    }
    if (f.contested && battle) {
      ctx.beginPath(); ctx.arc(f.x, f.y, CAP_R + 6, 0, TAU);
      ctx.strokeStyle = `rgba(255,240,120,${0.4 + 0.4 * Math.sin(now * 8)})`; ctx.lineWidth = 3; ctx.stroke();
    }
    drawFlag(ctx, f, s, now);
  }
  if (G.phase === 'deploy') updateHQ(true);
  drawZones(ctx, s, now);
  if (G.reinfAt && G.time - G.reinfAt.t < 7 && !G.auto) {
    const a = 0.5 + 0.5 * Math.sin(now * 6), y = G.reinfAt.y;
    ctx.fillStyle = `rgba(232,64,47,${a})`;
    ctx.beginPath(); ctx.moveTo(W - 10, y - 26); ctx.lineTo(W - 50, y); ctx.lineTo(W - 10, y + 26); ctx.closePath(); ctx.fill();
  }
  if (G.guardAt != null && G.time - G.guardAt < 7 && !G.auto) {
    const a = 0.5 + 0.5 * Math.sin(now * 6);
    ctx.fillStyle = `rgba(232,191,74,${a})`;
    ctx.beginPath(); ctx.moveTo(10, 454); ctx.lineTo(50, 480); ctx.lineTo(10, 506); ctx.closePath(); ctx.fill();
  }
  for (const u of G.units) if (!u.alive && u.deadSeen) {
    ctx.strokeStyle = 'rgba(40,30,25,.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(u.x - 8, u.y - 8); ctx.lineTo(u.x + 8, u.y + 8); ctx.moveTo(u.x + 8, u.y - 8); ctx.lineTo(u.x - 8, u.y + 8); ctx.stroke();
  }
  for (const g of G.ghosts) {
    const a = 1 - (G.time - g.t) / 8;
    ctx.globalAlpha = a * 0.6; ctx.setLineDash([3, 3]); ctx.strokeStyle = '#d8dde0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(g.x, g.y, 13 * s, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#d8dde0'; ctx.font = `bold ${11 * s}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', g.x, g.y);
    ctx.globalAlpha = 1;
  }
  if (G.ringsAll) for (const u of G.units) if (u.side === 0 && live(u) && u.state < 4 && !G.sel.includes(u)) { drawRings(ctx, u, s, 0.4, false); dbg.faint++; }
  for (const u of G.sel) if (live(u)) { drawRings(ctx, u, s, G.sel.length > 1 ? 0.7 : 1, false); dbg.rings++; }
  const I = G.inspect;
  if (I && (performance.now() > I.until || !live(I.u) || !isSeen(I.u, 0))) G.inspect = null;
  else if (I && battle) { drawRings(ctx, I.u, s, 1, true); dbg.threat++; }
  for (const u of G.units) {
    if (u.side !== 0 || !live(u) || !u.path.length || u.order.type === 'charge') continue;
    const sel = G.sel.includes(u);
    if (!sel && u.order.type !== 'move') continue;
    pathLine(ctx, u, u.path, u.mode, s, sel ? 0.85 : 0.28);
    const e = u.path[u.path.length - 1];
    drawPin(ctx, e.x, e.y, u.mode, s, sel ? 0.95 : 0.4);
  }
  if (G.preview) {
    const P = G.preview, pulse = 0.6 + 0.4 * Math.sin(now * 10);
    P.paths.forEach((p, i) => { const u = P.units[i]; if (p && live(u)) pathLine(ctx, u, p, P.mode, s, 0.95); });
    drawPin(ctx, P.x, P.y, P.mode, s * (1 + pulse * 0.4), 1);
  }
  for (const u of G.sel) {
    if (u.order.type === 'fire' && live(u.order.target)) {
      ctx.strokeStyle = 'rgba(255,80,60,.75)'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.order.target.x, u.order.target.y); ctx.stroke(); ctx.setLineDash([]);
    }
    if (u.order.type === 'area') {
      ctx.strokeStyle = 'rgba(255,80,60,.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u.order.x, u.order.y, 45, 0, TAU); ctx.stroke();
    }
  }
  for (const d of G.dust) {
    if (d.t < 0) continue;
    const k = d.t / 1.1; ctx.fillStyle = `rgba(150,128,90,${0.45 * (1 - k)})`; ctx.beginPath(); ctx.arc(d.x, d.y, 5 + k * 10, 0, TAU); ctx.fill();
  }
  const selOk = battle && G.sel.length ? G.sel.filter(live) : null;
  for (const u of G.units) {
    if (!live(u)) continue;
    if (u.side === 1 && (!isSeen(u, 0) || G.phase === 'deploy') && !G.over) continue;
    if (u.side === 1 && selOk && !G.over && inRangeOf(selOk, u)) { drawInRange(ctx, u, s, now); dbg.inRange++; }
    if (G.sel.includes(u)) {
      ctx.beginPath(); ctx.arc(u.x, u.y, 22 * s, 0, TAU); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -now * 12; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    drawUnit(ctx, u, s, now);
  }
  drawHQs(ctx, s, now);
  for (const sh of G.shells) {
    const t = clamp(sh.t / sh.dur, 0, 1);
    if (sh.src.side === 1 && !isSeen(sh.src, 0) && t < 0.6) continue;
    const x = sh.x0 + (sh.gx - sh.x0) * t, y = sh.y0 + (sh.gy - sh.y0) * t - Math.sin(t * Math.PI) * 26;
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
  }
  for (const t of G.tracers) {
    const shooter = G.units[t.sid];
    const vis = t.side === 0 || (shooter && isSeen(shooter, 0));
    const a = 1 - t.t / 0.2, f0 = vis ? 0 : 0.6;
    ctx.strokeStyle = t.side === 0 ? `rgba(255,236,190,${a * 0.8})` : `rgba(230,240,255,${a * 0.8})`; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(t.x1 + (t.x2 - t.x1) * f0, t.y1 + (t.y2 - t.y1) * f0); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  for (const b of G.booms) {
    const k = b.t / 0.6;
    if (b.kind === 'cone') {
      ctx.fillStyle = `rgba(255,214,140,${0.5 * (1 - k)})`;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, b.r * (0.5 + k * 0.5), b.ang - 0.32, b.ang + 0.32); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = `rgba(140,118,80,${0.6 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.4 + k * 0.8), 0, TAU); ctx.fill();
    }
  }
  for (const sm of G.smokes) {
    const fade = Math.min(1, (sm.life - sm.age) / 4), a = (0.25 + sm.dens * 0.6) * fade;
    for (let k = 0; k < 3; k++) {
      const an = k * 2.1 + sm.age * 0.08, ox = Math.cos(an) * sm.r * 0.3, oy = Math.sin(an) * sm.r * 0.3;
      ctx.fillStyle = `rgba(232,230,222,${a * 0.55})`; ctx.beginPath(); ctx.arc(sm.x + ox, sm.y + oy, sm.r * 0.75, 0, TAU); ctx.fill();
    }
  }
  for (const m of G.markers) {
    const a = 1 - m.t / 1.2;
    ctx.strokeStyle = m.kind === 'no' ? `rgba(255,60,60,${a})` : m.kind === 'fire' || m.kind === 'area' || m.kind === 'charge' ? `rgba(255,90,60,${a})` : `rgba(255,255,255,${a})`;
    ctx.lineWidth = 2.5 * s;
    if (m.kind === 'no') { ctx.beginPath(); ctx.moveTo(m.x - 10, m.y - 10); ctx.lineTo(m.x + 10, m.y + 10); ctx.moveTo(m.x + 10, m.y - 10); ctx.lineTo(m.x - 10, m.y + 10); ctx.stroke(); }
    else if (m.kind === 'zone') { ctx.strokeStyle = hexA(m.col, a); ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (1.5 - 0.5 * Math.min(1, m.t / 0.5)), 0, TAU); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(m.x, m.y, (8 + m.t * 20) * s, 0, TAU); ctx.stroke(); }
  }
  for (const f of G.floaters) drawFloater(ctx, f, s);
  const badges = [];
  if (battle && !G.over) drawAim(ctx, s, badges);
  dbg.badges = badges.length; dbg.badgeText = badges.map(b => b.txt).join(' | ');
  drawBadges(badges);
  if (gest && gest.mode === 'box') {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const x = Math.min(gest.bx, gest.ex), y = Math.min(gest.by, gest.ey), w = Math.abs(gest.ex - gest.bx), h = Math.abs(gest.ey - gest.by);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, w, h);
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
  }
}

// ---------------------------------------------------------------- input
const ptrs = new Map();
let gest = null;
const LONG_MS = 420;
const MOVE_MODES = ['move', 'quick'];
function makePreview(x, y) {
  const units = G.sel.filter(u => live(u) && u.state < 3);
  if (!units.length) return;
  const spots = groupSpots(units, x, y);
  G.preview = { x, y, mode: G.pend, units, paths: units.map((u, i) => findPath(u.x, u.y, spots[i].x, spots[i].y, isArt(u))) };
}
cv.addEventListener('pointerdown', (e) => {
  SFX.unlock();
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) {
    const w = toWorld(e.clientX, e.clientY);
    const hit = unitAt(w.x, w.y);
    const hq = G.running && !G.over ? hqAt(w.x, w.y) : null;
    gest = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, mode: 'pending', w, hit };
    const battleSel = G.phase === 'battle' && !G.over && G.sel.length > 0;
    if (hq && !(G.sel.length && (G.pend === 'fire' || G.pend === 'charge')) && (!hit || hq.dist <= dxy(hit.x, hit.y, w.x, w.y) + 6)) { gest.mode = 'hqPending'; gest.div = hq.d; gest.hit = null; }
    else if (G.phase === 'deploy' && hit && hit.side === 0) gest.mode = 'unitPending';
    else if (battleSel && (G.pend === 'fire' || G.pend === 'charge') && !(hit && hit.side === 0)) { gest.mode = 'aim'; setAim(w); }
    else {
      gest.timer = setTimeout(() => {
        if (gest && gest.mode === 'pending') {
          if (battleSel && gest.hit && gest.hit.side === 1) { gest.mode = 'aimHold'; setAim(gest.w); buzz(12); return; }
          if (G.selDiv && !G.over && !(gest.hit && gest.hit.side === 0)) { gest.mode = 'zoneDraw'; G.zonePrev = Object.assign(zoneAt(gest.w.x, gest.w.y, 55), { div: G.selDiv }); buzz(12); return; }
          gest.mode = 'box'; gest.bx = gest.ex = gest.sx; gest.by = gest.ey = gest.sy; G.preview = null;
          buzz(12);
        }
      }, LONG_MS);
      if (G.phase === 'battle' && !G.over && G.sel.length && !hit && MOVE_MODES.includes(G.pend)) makePreview(w.x, w.y);
    }
  } else if (ptrs.size === 2 && gest) {
    clearTimeout(gest.timer); G.preview = null; G.aim = null;
    const [a, b] = [...ptrs.values()];
    gest.mode = 'pinch';
    gest.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; gest.z0 = cam.z;
    gest.mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId) || !gest) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy, moved = Math.hypot(dx, dy);
  switch (gest.mode) {
    case 'pinch': {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.z = gest.z0 * d / gest.d0; clampCam();
      cam.x = gest.mid.x - mx / cam.z; cam.y = gest.mid.y - my / cam.z; clampCam();
      break;
    }
    case 'unitPending':
      if (moved > 6) { gest.mode = 'drag'; G.sel = [gest.hit]; G.selDiv = null; refreshUI(true); }
      break;
    case 'hqPending':
      if (moved > 8) { gest.mode = 'hqDrag'; if (G.selDiv !== gest.div) { G.selDiv = gest.div; G.sel = []; refreshUI(true); } }
      break;
    case 'hqDrag': { const w = toWorld(e.clientX, e.clientY); G.zonePrev = Object.assign(zoneAt(w.x, w.y), { div: gest.div }); break; }
    case 'zoneDraw': { const w = toWorld(e.clientX, e.clientY); G.zonePrev = Object.assign(zoneAt(gest.w.x, gest.w.y, Math.max(55, dxy(gest.w.x, gest.w.y, w.x, w.y))), { div: G.selDiv }); break; }
    case 'drag': { const w = toWorld(e.clientX, e.clientY); placeUnit(gest.hit, w.x, w.y); break; }
    case 'pending':
      if (moved > 10) { gest.mode = 'pan'; clearTimeout(gest.timer); G.preview = null; }
      break;
    case 'pan': cam.x = gest.cx - dx / cam.z; cam.y = gest.cy - dy / cam.z; clampCam(); break;
    case 'box': gest.ex = e.clientX; gest.ey = e.clientY; break;
    case 'aim': case 'aimHold': setAim(toWorld(e.clientX, e.clientY)); break;
  }
});
const endPtr = (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (!gest || ptrs.size) return;
  clearTimeout(gest.timer);
  const up = e.type === 'pointerup';
  if (up) {
    if (gest.mode === 'pending' || gest.mode === 'unitPending') tap(e.clientX, e.clientY);
    else if (gest.mode === 'hqPending') selectDiv(gest.div);
    else if ((gest.mode === 'hqDrag' || gest.mode === 'zoneDraw') && G.zonePrev) { const P = G.zonePrev, d = P.div; delete P.div; orderDiv(d, P, d.post); refreshUI(true); }
    else if (gest.mode === 'drag') SFX.click();
    else if (gest.mode === 'aim') tap(e.clientX, e.clientY);
    else if (gest.mode === 'aimHold') { if (G.aim && G.aim.tgt) tap(e.clientX, e.clientY); }
    else if (gest.mode === 'box') {
      if (Math.abs(gest.ex - gest.bx) > 16 || Math.abs(gest.ey - gest.by) > 16) boxSelect(gest.bx, gest.by, gest.ex, gest.ey);
      else tap(e.clientX, e.clientY);
    }
  }
  G.preview = null; G.aim = null; G.zonePrev = null; gest = null;
};
function setAim(w) {
  const h = unitAt(w.x, w.y);
  G.aim = { x: w.x, y: w.y, tgt: h && h.side === 1 ? h : null };
}
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const w0 = toWorld(e.clientX, e.clientY);
  cam.z *= e.deltaY < 0 ? 1.12 : 1 / 1.12; clampCam();
  cam.x = w0.x - e.clientX / cam.z; cam.y = w0.y - e.clientY / cam.z; clampCam();
}, { passive: false });
['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, () => SFX.unlock(), { capture: true, passive: true }));

function unitAt(wx, wy) {
  const r = Math.max(22, 26 / cam.z);
  let best = null, bd = r;
  for (const u of G.units) {
    if (!live(u)) continue;
    if (u.side === 1 && (!isSeen(u, 0) || G.phase === 'deploy')) continue;
    const d = dxy(u.x, u.y, wx, wy) - (u.side === 0 ? 2 : 0);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
function boxSelect(x1, y1, x2, y2) {
  const a = toWorld(Math.min(x1, x2), Math.min(y1, y2)), b = toWorld(Math.max(x1, x2), Math.max(y1, y2));
  const pick = G.units.filter(u => u.side === 0 && live(u) && u.state < 4 && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y);
  if (pick.length) { G.sel = pick; G.selDiv = null; G.pend = 'move'; SFX.click(); }
  refreshUI(true);
}
function tap(sx, sy) {
  if (!G.running || G.over) return;
  const p = toWorld(sx, sy);
  const u = unitAt(p.x, p.y);
  if (u && u.side === 0) {
    if (G.sel.length === 1 && G.sel[0] === u) G.sel = [];
    else if (u.state < 4) G.sel = [u];
    G.selDiv = null; G.pend = 'move'; SFX.click(); refreshUI(true); return;
  }
  if (G.selDiv) { // commander selected: the tap is his zone (an enemy tapped = attack there)
    const d = G.selDiv;
    if (u && u.side === 1 && G.phase === 'battle') orderDiv(d, zoneAt(u.x, u.y), 'attack');
    else orderDiv(d, zoneAt(p.x, p.y), d.post);
    refreshUI(true); return;
  }
  const sel = G.sel.filter(s => live(s) && s.state < 4);
  if (u && u.side === 1 && G.phase === 'battle') G.inspect = { u, until: performance.now() + (sel.length ? 2500 : 6000) };
  if (!sel.length) {
    if (u && u.side === 1) SFX.click(); else G.inspect = null;
    return;
  }
  if (G.phase === 'deploy') {
    if (inZone(p.x, p.y)) { const spots = groupSpots(sel, p.x, p.y); sel.forEach((s, i) => placeUnit(s, spots[i].x, spots[i].y)); SFX.click(); G.markers.push({ x: p.x, y: p.y, t: 0, kind: 'move' }); }
    else { G.markers.push({ x: p.x, y: p.y, t: 0, kind: 'no' }); SFX.click(true); toast('✖ 🇫🇷'); }
    return;
  }
  if (u && u.side === 1) {
    if (G.pend === 'charge') issueCharge(sel, u); else issueFire(sel, u);
    G.pend = 'move'; refreshUI(true); return;
  }
  if (G.pend === 'fire') issueArea(sel, p.x, p.y);
  else if (G.pend === 'charge') { toast('⚔ 👆 enemy'); SFX.click(true); return; }
  else issueMove(sel, p.x, p.y, G.pend);
  G.pend = 'move'; refreshUI(true);
}

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
const rosterEl = $('roster'), toastEl = $('toast'), cardEl = $('card');
const orderBtns = [...document.querySelectorAll('#orders button')];
let toastTimer = 0;
function toast(msg) {
  if (!toastEl || G.auto || G.over) return;
  toastEl.textContent = msg; toastEl.style.opacity = '1';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (toastEl.style.opacity = '0'), 1800);
}
function buildLegend(el) {
  el.innerHTML = MNAME.map((n, i) => `<div><span class="ring" style="border-color:${MCOL[i]}"></span>${n}</div>`).join('');
}
buildLegend($('legend1')); buildLegend($('legend2'));
$('ver').textContent = VERSION;
let chips = [];
function buildRoster() {
  rosterEl.innerHTML = '';
  chips = G.units.filter(u => u.side === 0).map(u => {
    const b = document.createElement('button');
    b.className = 'chip'; b.title = u.name;
    const c = document.createElement('canvas'); c.width = 76; c.height = 76;
    const bar = document.createElement('i'); bar.innerHTML = '<b></b>';
    b.append(c, bar);
    if (u.dv) { const pip = document.createElement('u'); pip.style.background = u.dv.col; b.append(pip); }
    let lastTap = 0;
    b.addEventListener('click', () => {
      if (u.reserve) { if (G.phase === 'battle') toast(G.time < GUARD_UNLOCK ? '🦅 ⏳ ' + fmt(GUARD_UNLOCK - G.time) : '🦅 → ' + fmt(Math.max(0, GUARD_AUTO - G.time))); else toast('🦅 ⏳'); SFX.click(true); return; }
      if (!live(u) || u.state >= 4) return;
      const now = performance.now();
      if (now - lastTap < 380) centerOn(u.x, u.y);
      lastTap = now;
      G.sel = [u]; G.selDiv = null; G.pend = 'move'; SFX.click(); refreshUI(true);
    });
    rosterEl.append(b);
    return { u, b, c, bar: bar.firstChild, key: '' };
  });
  buildDivStrip();
}
// the division strip: one thumb-sized button per French commander (name, zone, posture, strength)
let divBtns = [];
function buildDivStrip() {
  const el = $('divStrip'); el.innerHTML = '';
  divBtns = G.divs.filter(d => d.side === 0).map(d => {
    const b = document.createElement('button');
    b.className = 'dv'; b.title = d.name + ' · ' + d.sub; b.style.borderColor = d.col;
    b.innerHTML = `<span class="dn"><em style="background:${d.col}"></em>${d.name}</span><span class="dz"></span><i><b style="background:${d.col}"></b></i>`;
    let lastTap = 0;
    b.addEventListener('click', () => {
      const now = performance.now();
      if (now - lastTap < 380 && d.hq) { centerOn(d.hq.x, d.hq.y); lastTap = 0; if (G.selDiv !== d) selectDiv(d); return; }
      lastTap = now;
      if (!d.units.some(u => (live(u) && u.state < 4) || u.reserve)) { SFX.click(true); return; }
      selectDiv(d);
    });
    el.append(b);
    return { d, b, z: b.querySelector('.dz'), bar: b.querySelector('i b'), key: '' };
  });
}
function refreshDivUI() {
  for (const it of divBtns) {
    const d = it.d, str = divStr(d), res = d.units.some(u => u.reserve), dead = !res && !d.units.some(u => live(u) && u.state < 4);
    const dir = d.units.filter(u => u.direct && live(u)).length;
    const key = [G.selDiv === d, zoneLabel(d), d.post, Math.round(str * 40), dead, dir, d.mode].join();
    if (key === it.key) continue;
    it.key = key;
    it.z.textContent = `${res ? '' : d.post === 'attack' ? '⚔' : '🛡'}${zoneLabel(d)}${dir ? ' 👆' + dir : ''}`;
    it.bar.style.width = (res ? 100 : str * 100) + '%';
    it.b.classList.toggle('sel', G.selDiv === d);
    it.b.classList.toggle('dead', dead);
    it.b.classList.toggle('res', res);
  }
  const d = G.selDiv;
  if (d) {
    $('bTake').classList.toggle('on', d.post === 'attack');
    $('bHoldZ').classList.toggle('on', d.post === 'hold');
    $('bDivRejoin').disabled = !d.units.some(u => u.direct && live(u));
    $('bDivUnits').disabled = !d.units.some(u => live(u) && u.state < 4);
    $('divName').textContent = d.name;
    $('divName').style.color = d.col;
  }
}
const STATE_ICON = ['●', '◐', '▼', '!', '✕'];
function setBar(id, frac, col) { const el = $(id); el.style.width = (clamp(frac, 0, 1) * 100) + '%'; if (col) el.style.background = col; }
function refreshCard() {
  const sel = G.sel.filter(live);
  if (!sel.length) { cardEl.style.display = 'none'; return; }
  cardEl.style.display = 'flex';
  const u = sel[0], n = sel.length;
  const avg = (fn) => sel.reduce((s, o) => s + fn(o), 0) / n;
  const hp = avg(o => hpf(o)), mo = avg(o => clamp(o.morale, 0, 100) / 100);
  const st = n === 1 ? u.state : Math.max(...sel.map(o => o.state));
  $('cName').textContent = n === 1 ? u.name : '👥 ' + n;
  $('cStars').textContent = n === 1 ? '★'.repeat(u.exp + 1) + (u.med ? '🎖' : '') : '';
  setBar('cHp', hp, hp > 0.6 ? '#8bd35a' : hp > 0.3 ? '#e6c83a' : '#e8402f');
  const cav = n === 1 && isCav(u);
  if (cav) { const sta = 1 - u.fat / 100; setBar('cAmmo', sta, u.fat >= 50 ? '#9a9a9a' : '#7fc7ff'); $('cAIcon').textContent = '♞'; $('cAIcon').style.color = '#7fc7ff'; }
  else { const am = avg(o => (o.ammoMax ? o.ammo / o.ammoMax : 1)); setBar('cAmmo', am, am > 0.25 ? '#e0b24a' : '#e8402f'); $('cAIcon').textContent = '⁍'; $('cAIcon').style.color = '#e0b24a'; }
  setBar('cMor', mo, MCOL[st]);
  $('cMIcon').textContent = STATE_ICON[st]; $('cMIcon').style.color = MCOL[st];
  let aux = '';
  if (n === 1) {
    aux += `<span style="color:#e9e2c8">${u.formT > 0 ? '→' + FORM_NAME[u.formTo] : FORM_NAME[u.form]}</span> `;
    if (u.t.w) { const w = WPN[u.t.w]; aux += `<span style="color:rgb(${RING[u.t.w].col})">◎${w.range}</span>${w.gun ? `<span style="color:rgb(${RING.canister.col})"> ✸${w.can}</span>` : ''}`; }
    else if (cav) aux += `<span style="color:rgb(${RING.charge.col})">⚔${CHARGE_R.cav}</span>`;
    else if (u.kind === 'cmdr') aux += `<span style="color:rgb(${RING.aura.col})">⭐${RALLY_R}</span>`;
    if (u.dv) aux += ` <span style="color:${u.dv.col}">⚑${u.dv.name}${u.direct ? ' 👆' : ''}</span>`;
  }
  $('cAux').innerHTML = aux;
  const badges = [];
  if (n === 1) {
    if (inHouse(u)) badges.push('🏠');
    if (heightAt(u.x, u.y) > HMAX * 0.6) badges.push('⛰');
    if (nearCmdr(u)) badges.push('⭐');
    if (u.order.type === 'hold') badges.push('🛡️');
    if (cav && u.fat >= 50) badges.push('💨');
    if (G.phase === 'battle' && u.ammoMax && G.time - u.lastFired >= 6 && (inHomeZone(u) || nearCmdr(u)) && u.ammo < u.ammoMax) badges.push('⁍+');
  }
  $('cBadges').textContent = badges.join(' ');
  const g = $('cardIcon').getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 80, 80); g.setTransform(2, 0, 0, 2, 0, 0);
  drawUnitIcon(g, u, 20, 20, 34);
}
function refreshUI(force) {
  for (const ch of chips) {
    const u = ch.u, key = [u.state, Math.round(u.hp), u.alive, u.fled, u.reserve, G.sel.includes(u), u.rallyT > 0, u.form, u.formTo, u.fat >= 50].join();
    if (!force && key === ch.key) continue;
    ch.key = key;
    const g = ch.c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 76, 76);
    g.setTransform(2, 0, 0, 2, 0, 0);
    drawUnitIcon(g, u, 19, 17, 32, u.reserve ? 0.5 : 1);
    if (u.reserve) { g.font = '13px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🦅', 30, 8); }
    if (u.rallyT > 0 && u.state >= 3) { g.fillStyle = '#ffd34d'; star(g, 31, 7, 5, true); }
    ch.b.style.borderColor = u.reserve ? '#e8bf4a' : MCOL[u.state];
    ch.bar.style.width = (100 * Math.max(0, u.hp) / u.maxHp) + '%';
    ch.b.classList.toggle('dead', !u.reserve && (!live(u) || u.state === 4));
    ch.b.classList.toggle('res', !!u.reserve);
    ch.b.classList.toggle('sel', G.sel.includes(u));
  }
  G.sel = G.sel.filter(u => live(u) && u.state < 4);
  const deploy = G.phase === 'deploy';
  if (G.selDiv && (G.over || !G.selDiv.units.some(u => (live(u) && u.state < 4) || u.reserve))) G.selDiv = null;
  const selD = G.running && !G.over ? G.selDiv : null;
  $('orders').style.display = deploy || selD ? 'none' : 'flex';
  $('deployBar').style.display = deploy && G.running && !selD ? 'flex' : 'none';
  $('divBar').style.display = selD ? 'flex' : 'none';
  $('divStrip').style.display = G.running && !G.over ? 'flex' : 'none';
  refreshDivUI();
  const sel = G.sel, any = sel.length > 0;
  const nf = nextForm(sel);
  for (const b of orderBtns) {
    const o = b.dataset.o;
    b.classList.toggle('on', any && G.pend === o && o !== 'move');
    let dis = !any;
    if (o === 'charge') dis = !sel.some(u => canCharge(u) && u.state < 2);
    else if (o === 'fire') dis = !sel.some(u => u.t.w);
    else if (o === 'form') dis = !nf;
    else if (o === 'rejoin') dis = !sel.some(u => u.direct && u.dv);
    b.disabled = dis;
  }
  const fb = $('bForm');
  const fi = nf ? FORM_ICON[nf] : '▦', fl = nf ? ({ line: 'Line', column: 'Column', square: 'Square', limbered: 'Limber', deployed: 'Unlimber' }[nf]) : 'Form';
  if (fb.dataset.k !== fi + fl) { fb.dataset.k = fi + fl; fb.innerHTML = `${fi}<small>${fl}</small>`; }
  refreshCard();
  const rem = Math.max(0, GAME_TIME - G.time);
  $('clockT').textContent = fmt(rem);
  $('clock').style.color = rem < 60 ? '#ffb347' : deploy ? '#a9b4c8' : '';
  $('fogTag').style.display = G.fog > 0.02 && G.running && !G.over ? '' : 'none';
  G.flags.forEach((f, i) => {
    const el = $('fl' + i);
    el.className = 'fl ' + (f.owner === 0 ? 'o0' : f.owner === 1 ? 'o1' : 'on') + (f.contested ? ' hot' : '');
    el.style.background = f.prog > 0 ? `conic-gradient(${SIDE_COL[f.capSide]} ${Math.round(f.prog * 360)}deg, ${f.owner === 0 ? SIDE_COL[0] : f.owner === 1 ? SIDE_COL[1] : '#555'} 0)` : '';
  });
  $('bPause').textContent = G.paused ? '▶' : '⏸';
  $('bPause').disabled = deploy;
  $('pausedTag').style.display = G.paused && G.running && !G.over && !deploy ? 'block' : 'none';
  $('bSpeed').textContent = G.speed + 'x';
  $('bMute').textContent = SFX.isMuted() ? '🔇' : '🔊';
  $('bRings').classList.toggle('on', G.ringsAll);
  $('bRings').style.display = G.running && !G.over ? '' : 'none';
  const gb = $('bGuard');
  const showG = G.running && !G.over && G.phase === 'battle' && !G.guardIn && !G.auto;
  gb.style.display = showG ? '' : 'none';
  if (showG) {
    const ready = G.time >= GUARD_UNLOCK;
    gb.classList.toggle('ready', ready);
    const lbl = ready ? '🦅<small>Guard</small>' : `🦅<small>${fmt(GUARD_UNLOCK - G.time)}</small>`;
    if (gb.dataset.k !== lbl) { gb.dataset.k = lbl; gb.innerHTML = lbl; }
  }
}
orderBtns.forEach(b => b.addEventListener('click', () => {
  const o = b.dataset.o;
  if (!G.sel.length) return;
  if (o === 'hold') { issueHold(G.sel); G.pend = 'move'; toast('🛡️'); }
  else if (o === 'rejoin') { const n = rejoin(G.sel); toast(n ? '↩️ ⚑ ' + n : '⚑'); SFX.drum('move'); buzz(12); G.pend = 'move'; }
  else if (o === 'form') { issueForm(G.sel); G.pend = 'move'; }
  else { G.pend = G.pend === o ? 'move' : o; SFX.click(); }
  refreshUI(true);
}));
$('bPause').addEventListener('click', () => { if (G.running && !G.over && G.phase === 'battle') { G.paused = !G.paused; SFX.click(); refreshUI(true); } });
$('bSpeed').addEventListener('click', () => { G.speed = G.speed === 1 ? 2 : 1; SFX.click(); refreshUI(true); });
$('bMute').addEventListener('click', () => { SFX.unlock(); SFX.setMuted(!SFX.isMuted()); SFX.click(); refreshUI(true); });
$('bAll').addEventListener('click', () => {
  const all = G.units.filter(u => u.side === 0 && live(u) && u.state < 3);
  G.sel = G.sel.length === all.length ? [] : all; G.selDiv = null; G.pend = 'move'; SFX.click(); refreshUI(true);
});
const setPost = (p) => {
  const d = G.selDiv; if (!d) return;
  if (d.post !== p) { d.post = p; d.layT = 0; d.player = true; }
  toast(d.zone ? `${p === 'attack' ? '⚔' : '🛡'} ${d.name} → ${d.zone.name || '📍'}` : `${p === 'attack' ? '⚔' : '🛡'} 👆 map`);
  SFX.drum(p === 'attack' ? 'quick' : 'hold'); buzz(12); refreshUI(true);
};
$('bTake').addEventListener('click', () => setPost('attack'));
$('bHoldZ').addEventListener('click', () => setPost('hold'));
$('bDivUnits').addEventListener('click', () => {
  const d = G.selDiv; if (!d) return;
  G.sel = d.units.filter(u => live(u) && u.state < 4); G.selDiv = null; G.pend = 'move'; SFX.click(); refreshUI(true);
});
$('bDivRejoin').addEventListener('click', () => { const d = G.selDiv; if (!d) return; const n = rejoin(d.units); toast('↩️ ⚑ ' + n); SFX.drum('move'); buzz(12); refreshUI(true); });
$('bDivClose').addEventListener('click', () => { G.selDiv = null; SFX.click(); refreshUI(true); });
$('bHelp').addEventListener('click', () => { $('ovHelp').classList.remove('hidden'); if (G.running && !G.over && G.phase === 'battle') G.paused = true; refreshUI(true); });
$('bHelpClose').addEventListener('click', () => { $('ovHelp').classList.add('hidden'); });
$('bStart').addEventListener('click', () => startGame(false));
$('bRematch').addEventListener('click', () => startGame(G.auto));
$('bAuto').addEventListener('click', () => { autoDeploy(); refreshUI(true); });
$('bGo').addEventListener('click', () => beginBattle());
$('bGuard').addEventListener('click', () => { if (commitGuard(false)) centerOn(G.guard.x + 200, G.guard.y); refreshUI(true); });
$('bRings').addEventListener('click', () => {
  G.ringsAll = !G.ringsAll; store.set('aus-rings', G.ringsAll ? '1' : '0'); SFX.click(); buzz(10);
  toast(G.ringsAll ? '🎯 👥' : '🎯 ✖'); refreshUI(true);
});
function paintHaptic() {
  const b = $('bHaptic');
  b.textContent = !HAPTIC_OK ? '📳 —' : hapticOn ? '📳' : '📴';
  b.disabled = !HAPTIC_OK;
}
$('bHaptic').addEventListener('click', () => {
  hapticOn = !hapticOn; store.set('aus-haptic', hapticOn ? '1' : '0'); paintHaptic(); SFX.click(); buzz(20);
});
paintHaptic();
function resetVets() {
  saveVets(null); SFX.click(); toast('♻️ 🎖');
  if (G.phase === 'deploy') for (const u of G.units) if (u.side === 0 && u.slot != null) { u.exp = F_ROSTER[u.slot][2]; u.med = 0; }
  refreshUI(true);
}
$('bVetReset').addEventListener('click', resetVets);
$('bVet2').addEventListener('click', resetVets);

// ---------------------------------------------------------------- tutorial (first launch, replay from help)
const TUT = [
  { d: 'cmd', icon: '⚑', txt: 'Tap a division commander (or his button in the bottom strip), then tap a place. He takes that zone and deploys his battalions himself' },
  { d: 'post', icon: '⚔🛡', txt: '⚔ Take attacks the zone, 🛡 Hold defends it. Drag from a commander to point him; press, hold and drag the map to size a zone' },
  { d: 'move', icon: '👆', txt: 'Override: tap a battalion and order it directly. It rejoins its commander when done, or tap ↩️ Div' },
  { d: 'form', icon: '▦', txt: 'Commanders pick formations: ▬ Line fires best · ▮ Column marches and charges · ◻ Square stops cavalry (guns shred it)' },
  { d: 'cav', icon: '⚔', txt: 'Cavalry rides in squadron pairs, guns in 2-gun sections. Two pairs charging together hit like the whole regiment' },
  { d: 'rings', icon: '◎', txt: 'Solid ring: good shots · dashed: long shots · red: canister · dark: no sight (hills, villages, smoke, fog)' },
  { d: 'flags', icon: '🚩', txt: 'Hold 2 of 3 flags when ⏱ runs out, or break their army · 🦅 the Guard after 3:00' },
];
let tutStep = -1;
function openTut() {
  tutStep = 0; paintTut();
  $('ovTut').classList.remove('hidden'); $('ovHelp').classList.add('hidden');
}
function closeTut() {
  tutStep = -1; store.set('aus-tut', '1');
  $('ovTut').classList.add('hidden');
}
function paintTut() {
  $('tutText').innerHTML = `<b>${TUT[tutStep].icon}</b> ${TUT[tutStep].txt}`;
  $('tutDots').innerHTML = TUT.map((_, i) => `<i class="${i === tutStep ? 'on' : ''}"></i>`).join('');
  $('bTutNext').textContent = tutStep === TUT.length - 1 ? '✔' : '▶';
}
$('bTutNext').addEventListener('click', () => { SFX.click(); if (tutStep >= TUT.length - 1) closeTut(); else { tutStep++; paintTut(); } });
$('bTutSkip').addEventListener('click', () => { SFX.click(); closeTut(); });
$('bTut').addEventListener('click', () => { SFX.click(); openTut(); });
const tutCv = $('tutCv'), tg = tutCv.getContext('2d');
function finger(c, x, y, t) {
  const p = (t % 1.2) / 1.2, press = p > 0.5 && p < 0.7;
  c.font = '30px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
  c.fillText('👆', x + 4, y + (press ? 2 : 10));
  if (press) { c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 14 + (p - 0.5) * 60, 0, TAU); c.stroke(); }
}
function tutHouse(c, x, y, w, h) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + 4, y + 4, w, h); c.fillStyle = '#e4dcc6'; c.fillRect(x, y, w, h); c.fillStyle = '#a5573f'; c.fillRect(x + 2, y + 2, w - 4, h - 4); }
function drawTut(t) {
  const c = tg;
  c.setTransform(2, 0, 0, 2, 0, 0);
  c.fillStyle = '#7a8754'; c.fillRect(0, 0, 300, 170);
  c.fillStyle = '#c4b78e'; c.fillRect(0, 132, 300, 14);
  const U = (type, side, form, x, y, ang = -Math.PI / 2, s = 1.1, extra) => drawUnitBody(c, Object.assign({ id: 3, type, side, nat: side ? 'ru' : 'fr', state: 0, kind: UT[type].kind, form, ang, hp: 100, maxHp: 100, t: UT[type], fat: 0 }, extra || {}), x, y, s, 1);
  const sel = (x, y) => { c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([5, 4]); c.lineDashOffset = -t * 12; c.beginPath(); c.arc(x, y, 22, 0, TAU); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0; };
  const lbl = (txt, x, y, col = '#fff') => { c.font = 'bold 11px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(txt, x, y); c.fillStyle = col; c.fillText(txt, x, y); };
  const D = TUT[tutStep].d;
  const zone = (x, y, r, col, a = 1) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = hexA(col, 0.13 * a); c.fill(); c.setLineDash([9, 6]); c.lineDashOffset = -t * 14; c.strokeStyle = hexA(col, a); c.lineWidth = 2.5; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0; };
  const hq = (x, y, col, nm, ab, hi) => drawHQ(c, { side: 0, col, name: nm, key: ab }, x, y, 1.15, t) || (hi && (c.strokeStyle = '#fff', c.lineWidth = 2, c.beginPath(), c.arc(x, y, 17 + 2 * Math.sin(t * 6), 0, TAU), c.stroke()));
  const lerp = (a, b, k) => a + (b - a) * k;
  if (D === 'cmd') {
    tutHouse(c, 200, 52, 26, 18); tutHouse(c, 232, 84, 22, 18);
    const p = (t % 5) / 5, onZ = p > 0.22, k = clamp((p - 0.34) / 0.45, 0, 1), done = k >= 1;
    if (onZ) { zone(222, 78, 54, '#ffd34d'); arrowTo(c, 52, 138, 222 - 54 * 0.94, 78 + 54 * 0.34, '#ffd34d', 1, 1); lbl('🛡 Vandamme · Sokolnitz', 222, 14, '#ffd34d'); }
    const go = (sx, sy, ex, ey, type, f0, f1, ang) => U(type, 0, k > 0 && !done ? (type === 'art' ? 'limbered' : f0) : f1, lerp(sx, ex, k), lerp(sy, ey, k), k > 0 && !done ? Math.atan2(ey - sy, ex - sx) : ang, 1);
    go(80, 120, 238, 62, 'line', 'column', 'line', 0);
    go(100, 150, 238, 100, 'line', 'column', 'line', 0);
    go(60, 100, 168, 78, 'art', 'limbered', 'deployed', 0);
    hq(46, 140, '#ffd34d', 'Vandamme', 'van', p < 0.25);
    finger(c, p < 0.22 ? 46 : 222, p < 0.22 ? 140 : 80, t);
  } else if (D === 'post') {
    zone(78, 82, 52, '#ff9a3c'); zone(226, 82, 52, '#4fd6c2');
    lbl('⚔ Take', 78, 18, '#ff9a3c'); lbl('🛡 Hold', 226, 18, '#4fd6c2');
    const p = (t % 3) / 3;
    U('line', 1, 'line', 92, 82, Math.PI, 0.9);
    U('line', 0, 'column', 30 + p * 34, 64, 0, 0.95); U('line', 0, 'column', 30 + p * 34, 102, 0, 0.95);
    U('line', 0, 'line', 240, 66, 0, 0.95); U('line', 0, 'square', 240, 104, 0, 0.95);
    U('lcav', 1, 'mounted', 290 - Math.abs(Math.sin(t * 2)) * 10, 112, Math.PI, 0.9);
    lbl('◻ 🐎', 214, 140, '#fff');
  } else if (D === 'move') {
    tutHouse(c, 220, 20, 50, 34);
    const p = (t % 3.6) / 3.6, go = p > 0.4, k = go ? Math.min(1, (p - 0.4) * 2.2) : 0;
    const ux = 70 + (210 - 70) * k, uy = 110 + (80 - 110) * k;
    if (go && k < 1) { c.setLineDash([7, 6]); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2; c.beginPath(); c.moveTo(ux, uy); c.lineTo(210, 80); c.stroke(); c.setLineDash([]); }
    U('line', 0, go && k < 1 ? 'column' : 'line', ux, uy, go ? Math.atan2(80 - 110, 210 - 70) : -Math.PI / 2);
    U('art', 0, 'deployed', 150, 140, -Math.PI / 2, 1);
    U('cmdr', 0, 'staff', 40, 150, 0, 1.1);
    if (p > 0.15) sel(ux, uy);
    finger(c, go ? 210 : 70, go ? 82 : 112, t);
  } else if (D === 'form') {
    const cyc = Math.floor(t / 1.4) % 3;
    [['line', 55, '▬ Line'], ['column', 150, '▮ Column'], ['square', 245, '◻ Square']].forEach(([f, x, n], i) => {
      if (i === cyc) { c.fillStyle = 'rgba(255,211,77,.22)'; rrect(c, x - 44, 22, 88, 120, 10); c.fill(); }
      U('line', 0, f, x, 80, -Math.PI / 2, 1.4);
      lbl(n, x, 124, i === cyc ? '#ffd34d' : '#fff');
    });
    lbl('🔥🔥🔥', 55, 36); lbl('🏃 ⚔', 150, 36); lbl('🐎✖', 245, 36);
  } else if (D === 'cav') {
    const p = (t % 3) / 3;
    U('line', 1, 'line', 175, 70, Math.PI / 2, 1.3);
    const cx = 40 + Math.min(1, p * 1.5) * 108, cy = 70;
    if (p < 0.67) for (let i = 0; i < 4; i++) { c.fillStyle = `rgba(150,128,90,${0.4 - i * 0.08})`; c.beginPath(); c.arc(cx - 16 - i * 10, cy + Math.sin(i + t * 9) * 4, 5 + i * 2, 0, TAU); c.fill(); }
    U('hcav', 0, 'mounted', cx, cy - 13, 0, 1.3, { sz: 0.5 }); U('hcav', 0, 'mounted', cx, cy + 13, 0, 1.3, { sz: 0.5 });
    U('art', 0, 'deployed', 34, 140, 0, 1, { sz: 1 / 3 }); U('art', 0, 'deployed', 66, 146, 0, 1, { sz: 1 / 3 });
    if (p >= 0.67) { c.font = '22px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⚔️', 162, 50); }
    lbl('flank!', 175, 104, '#ffd34d');
    U('line', 1, 'square', 255, 120, Math.PI, 1.2);
    U('lcav', 0, 'mounted', 222 - Math.abs(Math.sin(t * 2)) * 12, 128, 0, 1.0, { fat: 70 });
    lbl('◻ = 🐎✖', 255, 150, '#ff9a8a');
  } else if (D === 'rings') {
    const ux = 70, uy = 110, R = 125, E = 56, C = 34, col = RING.cannon.col;
    c.beginPath(); c.arc(ux, uy, R, 0, TAU); c.fillStyle = `rgba(${col},.1)`; c.fill();
    c.beginPath(); c.arc(ux, uy, E, 0, TAU); c.fillStyle = `rgba(${col},.14)`; c.fill();
    // a hill crest throws a shadow
    c.save(); c.beginPath(); c.arc(ux, uy, R, 0, TAU); c.clip();
    c.fillStyle = '#93976a'; c.beginPath(); c.ellipse(170, 40, 34, 20, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(150, 30); c.lineTo(300, -40); c.lineTo(320, 60); c.lineTo(190, 52); c.closePath(); c.fillStyle = 'rgba(8,10,6,.45)'; c.fill(); c.restore();
    c.beginPath(); c.arc(ux, uy, E, 0, TAU); c.strokeStyle = `rgb(${col})`; c.lineWidth = 2.2; c.stroke();
    c.beginPath(); c.arc(ux, uy, R, 0, TAU); c.setLineDash([12, 6]); c.lineWidth = 1.8; c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(ux, uy, C, 0, TAU); c.strokeStyle = `rgb(${RING.canister.col})`; c.lineWidth = 3; c.stroke();
    ringLabel(c, ux + 108, uy - 72, '650m', col, 0.9); ringLabel(c, ux - 26, uy - 40, '✸', RING.canister.col, 1);
    U('art', 0, 'deployed', ux, uy, -0.4, 1);
    const ex = 168, ey = 118;
    U('line', 1, 'column', ex, ey, Math.PI, 1.1); drawInRange(c, { x: ex, y: ey }, 1, t);
    c.strokeStyle = `rgb(${GOOD})`; c.lineWidth = 2.6; c.beginPath(); c.moveTo(ux, uy); c.lineTo(ex, ey); c.stroke();
    c.font = 'bold 10px system-ui,sans-serif'; const tx = '300m 46%', tw = c.measureText(tx).width + 10;
    c.fillStyle = 'rgba(12,14,9,.85)'; rrect(c, 124 - tw / 2, 96, tw, 18, 9); c.fill(); c.strokeStyle = `rgb(${GOOD})`; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(tx, 124, 105.5);
  } else if (D === 'flags') {
    const prog = (t % 4) / 4;
    [[55, 'Sa', 0], [150, 'Pr', 1], [245, 'So', 0]].forEach(([x, n, o], i) => {
      const y = 70;
      c.beginPath(); c.arc(x, y, 34, 0, TAU); c.fillStyle = o === 0 ? 'rgba(51,89,181,.3)' : 'rgba(79,125,63,.35)'; c.fill();
      c.setLineDash([5, 5]); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
      if (i === 1) { c.beginPath(); c.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * prog); c.strokeStyle = '#fff'; c.lineWidth = 8; c.stroke(); c.strokeStyle = SIDE_COL[0]; c.lineWidth = 5; c.stroke(); }
      drawFlag(c, { x, y: y + 4, owner: o }, 1, t);
      lbl(n, x, y + 48);
    });
    U('guard', 0, 'column', 138, 92, -Math.PI / 2, 1.1); U('line', 0, 'line', 166, 96, -Math.PI / 2, 0.9);
    c.font = '20px system-ui'; c.textAlign = 'center'; c.fillText('🦅', 150, 152);
  }
}
function paintDiff() { document.querySelectorAll('.diff').forEach(b => b.classList.toggle('on', b.dataset.d === G.diff)); }
document.querySelectorAll('.diff').forEach(b => b.addEventListener('click', () => { G.diff = b.dataset.d; store.set('aus-diff', G.diff); SFX.click(); paintDiff(); }));
paintDiff();
document.addEventListener('visibilitychange', () => { if (document.hidden && G.running && !G.over && G.phase === 'battle') { G.paused = true; refreshUI(true); } });

function updateVets(res) {
  const v = loadVets() || { exp: F_ROSTER.map(r => r[2]), xp: F_ROSTER.map(() => 0), med: F_ROSTER.map(() => 0) };
  v.xp = v.xp || F_ROSTER.map(() => 0); v.med = v.med || F_ROSTER.map(() => 0);
  const out = [];
  for (const u of G.units) {
    if (u.side !== 0 || u.slot == null) continue;
    const i = u.slot;
    if (u.reserve) { out[i] = 0; continue; }
    if (!u.alive) { v.exp[i] = F_ROSTER[i][2]; v.xp[i] = 0; v.med[i] = 0; out[i] = 'lost'; continue; }
    if (u.fled) { out[i] = 0; continue; }
    v.exp[i] = u.exp;
    v.xp[i] = (v.xp[i] || 0) + u.kills * 2 + 1 + (res === 'win' ? 1 : 0);
    let up = 0;
    while (v.xp[i] >= 6) { v.xp[i] -= 6; if (v.exp[i] < 2) { v.exp[i]++; up = 1; } else { v.med[i] = (v.med[i] || 0) + 1; up = up || 2; } }
    out[i] = up;
  }
  saveVets(v);
  return { v, out };
}
function drawTimeline() {
  const c = $('endTl').getContext('2d'), Wc = 600, rowH = 22, x0 = 40;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, Wc, 90);
  const log = G.flagLog.concat([G.flags.map(f => f.owner)]), n = log.length, span = Math.max(G.time, 5);
  const xOf = (tt) => x0 + (Wc - x0 - 6) * clamp(tt / span, 0, 1);
  FABBR.forEach((nm, r) => {
    const y = 6 + r * (rowH + 4);
    c.fillStyle = '#ddd'; c.font = 'bold 16px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(nm, 18, y + rowH / 2);
    for (let i = 0; i < n; i++) {
      const ta = i * 5, tb = i + 1 < n ? Math.min((i + 1) * 5, span) : span;
      const o = log[i][r];
      c.fillStyle = o === 0 ? SIDE_COL[0] : o === 1 ? SIDE_COL[1] : '#666';
      c.fillRect(xOf(ta), y, Math.max(1, xOf(tb) - xOf(ta) + 0.5), rowH);
    }
  });
  const mark = (tt, col) => { if (tt == null) return; const x = xOf(tt); c.fillStyle = col; c.beginPath(); c.moveTo(x - 7, 0); c.lineTo(x + 7, 0); c.lineTo(x, 9); c.fill(); c.fillRect(x - 1, 0, 2, 84); };
  mark(G.reinfAt && G.reinfAt.t, '#ffb347');
  mark(G.pushAt, '#ff5a3c');
  mark(G.guardAt, '#e8bf4a');
}
function buildAAR(res, rout, vet) {
  const mine = G.units.filter(u => u.side === 0 && u.slot != null);
  const lost = (s) => G.units.filter(u => u.side === s && !u.reserve && (!u.alive || u.fled || u.state === 4)).reduce((t, u) => t + (u.sz || 1), 0);
  const own = G.flags.filter(f => f.owner === 0).length;
  const stars = res === 'lose' ? 0 : res === 'draw' ? 1 : 1 + (lost(0) <= 3 ? 1 : 0) + (own === 3 || rout ? 1 : 0);
  $('endStars').innerHTML = '★'.repeat(stars) + '<span style="opacity:.25">' + '★'.repeat(3 - stars) + '</span>';
  G.stars = stars;
  const score = (u) => u.kills * 3 + (u.alive ? 2 : 0) + hpf(u);
  const mvp = mine.filter(u => u.kills > 0).sort((a, b) => score(b) - score(a))[0];
  G.mvp = mvp ? mvp.name : null;
  const el = $('endUnits'); el.innerHTML = '';
  for (const u of mine) {
    const row = document.createElement('div'); row.className = 'ur' + (u === mvp ? ' mvp' : '');
    const cvs = document.createElement('canvas'); cvs.width = 56; cvs.height = 56;
    const g = cvs.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
    drawUnitIcon(g, Object.assign({}, u, { state: u.alive ? Math.min(u.state, 4) : 4 }), 14, 12, 24, u.alive && !u.reserve ? 1 : 0.45);
    const st = u.reserve ? '🦅' : !u.alive ? '✖' : u.fled ? '🏳' : u.state >= 3 ? '!' : '✚';
    const up = vet && vet.out[u.slot];
    const exp = vet && u.alive && !u.fled && !u.reserve ? vet.v.exp[u.slot] : u.exp;
    const hp = hpf(u);
    row.innerHTML = `<span class="un">${u.name}</span><span class="us">${'★'.repeat(exp + 1)}${up === 1 ? ' ⬆' : up === 2 ? ' 🎖' : ''}${up === 'lost' ? ' <s>★</s>' : ''}</span>` +
      `<span class="uk">✔${u.kills}</span><i class="uh"><b style="width:${hp * 100}%;background:${hp > 0.6 ? '#8bd35a' : hp > 0.3 ? '#e6c83a' : '#e8402f'}"></b></i>` +
      `<span class="ust">${u === mvp ? '🏅' : st}</span>`;
    row.prepend(cvs);
    el.append(row);
  }
  drawTimeline();
}
function endGame(res, rout) {
  if (toastEl) { clearTimeout(toastTimer); toastEl.style.opacity = '0'; }
  if (G.over) return;
  G.over = true; G.result = res; G.sel = []; G.aim = null; G.inspect = null;
  SFX.end(res);
  buzz(res === 'win' ? [30, 60, 30, 60, 90] : [120]);
  const titles = { win: 'Victory', lose: 'Defeat', draw: 'Stalemate' }, icons = { win: '🦅', lose: '🏳️', draw: '🤝' };
  $('endIcon').textContent = icons[res];
  $('endTitle').textContent = titles[res];
  $('endFlags').innerHTML = G.flags.map((f, i) => `<span class="fl ${f.owner === 0 ? 'o0' : f.owner === 1 ? 'o1' : 'on'}">${FABBR[i]}</span>`).join('');
  const tot = (s) => G.units.filter(u => u.side === s && !u.reserve).length;
  const lost = (s) => G.units.filter(u => u.side === s && !u.reserve && (!u.alive || u.fled || u.state === 4)).length;
  const dIcon = { easy: '🙂', normal: '😐', hard: '💀' }[G.diff];
  $('endStats').innerHTML = `${rout ? (res === 'win' ? '💥 Allied army broken<br>' : res === 'lose' ? '🏳️ Your corps broke<br>' : '') : '⏱ 0:00<br>'}` +
    `<span style="color:${SIDE_COL[0]}">■</span> ✖ ${lost(0)}/${tot(0)} &nbsp; <span style="color:${SIDE_COL[1]}">■</span> ✖ ${lost(1)}/${tot(1)}` +
    `<br>⚔ ${G.stats.charges[0]} &nbsp; ◻ ${G.stats.squares[0]} &nbsp; ⭐ ${G.stats.rallied[0]} &nbsp; ${G.guardIn ? '🦅' : '🦅✖'} &nbsp; ${dIcon}`;
  const vet = G.auto ? null : updateVets(res);
  buildAAR(res, rout, vet);
  setTimeout(() => $('ovEnd').classList.remove('hidden'), 700);
  refreshUI(true);
}
function startGame(auto) {
  newGame(auto);
  ['ovStart', 'ovEnd', 'ovHelp', 'ovTut'].forEach(id => $(id).classList.add('hidden'));
  cam.z = clamp(Math.max(VW, VH) / 1500, 0.4, 1.2); centerOn(auto ? 900 : 560, 560);
  buildRoster();
  if (auto) beginBattle();
  else { toast('🇫🇷 👆 ▶'); if (store.get('aus-tut', '0') !== '1') openTut(); }
  refreshUI(true);
}

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0, uiT = 0;
function frame(nowMs) {
  const dt = Math.min(0.1, (nowMs - last) / 1000); last = nowMs;
  if (G.running && G.phase === 'battle' && !G.paused && !G.over) {
    acc += dt * G.speed;
    let n = 0;
    while (acc >= DT && n < 12) { step(); acc -= DT; n++; }
    if (n >= 12) acc = 0;
  }
  G.shake = G.shake > 0.3 ? G.shake * Math.exp(-dt * 9) : 0;
  render();
  if (tutStep >= 0) drawTut(nowMs / 1000);
  uiT -= dt; if (uiT <= 0) { uiT = 0.2; refreshUI(false); }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
drawMap();
newGame(false);
G.running = false;
resize();
cam.z = clamp(Math.max(VW, VH) / 1500, 0.4, 1.2); centerOn(900, 560);
requestAnimationFrame(frame);

// test / debug hooks (harmless in normal play)
window.AUS = {
  G, start: startGame, begin: beginBattle, step, autoDeploy, placeUnit, inZone, SFX,
  fast(sec) { G.silent = true; const n = Math.round(sec / DT); for (let i = 0; i < n && !G.over; i++) step(); G.silent = false; refreshUI(true); return G.time; },
  setDiff(d) { G.diff = d; paintDiff(); },
  tap, toWorld, cam, centerOn, findPath, LOS, sight, coverAt, validTarget, losU, WPN, UT,
  aimInfo, visPoly, inRangeOf, openTut, loadVets, hitChance, gunHitP, DIFFS, commitGuard, setForm,
  orderCharge, meleePowers, issueForm, issueCharge, heightAt, terrAt, passAt, dims,
  haptic: () => ({ ok: HAPTIC_OK, on: hapticOn }),
  ZONES, divByKey, rejoin, layoutDiv, snapSpot,
  // zone order by commander key ('van', 'sth', 'leg', 'lan', 'mur', 'gar'), zone name or {x,y,r}, 'attack' | 'hold'
  orderDiv(key, zone, post, side = 0) {
    const d = divByKey(side, key); if (!d) return false;
    const z = typeof zone === 'string' ? zoneAt(ZONES.find(q => q.name === zone).x, ZONES.find(q => q.name === zone).y) : zoneAt(zone.x, zone.y, zone.r);
    orderDiv(d, z, post || d.post, true); return true;
  },
};
const qs = new URLSearchParams(location.search);
if (qs.get('auto') === '1') startGame(true);
})();
