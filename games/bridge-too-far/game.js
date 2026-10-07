/* Bridge Too Far: a small real-time squad tactics game for phones.
   Original code and art. Plain canvas + vanilla JS, no dependencies. */
(() => {
'use strict';

// ---------------------------------------------------------------- constants
const W = 1800, H = 1100, CELL = 10, GW = W / CELL, GH = H / CELL;
const PC = 20, PW = W / PC, PH = H / PC;
const GAME_TIME = 540;          // 9 minutes
const DT = 1 / 30;
const CAP_R = 55;
const TAU = Math.PI * 2;
const RX0 = 830, RX1 = 970, BY0 = 500, BY1 = 600;
const T_GRASS = 0, T_ROAD = 1, T_RIVER = 2, T_BRIDGE = 3, T_HOUSE = 4, T_HEDGE = 5, T_WALL = 6, T_TREE = 7;

const SIDE_COL = ['#b8443f', '#56646d'];
const SIDE_COL_D = ['#7d2622', '#353f45'];
const MCOL = ['#58c050', '#e6c83a', '#f08a28', '#e8402f', '#9a9a9a'];
const MNAME = ['Steady', 'Shaken', 'Pinned', 'Panic', 'Broken'];
const MODE_SPD = { move: 34, fast: 66, sneak: 15 };

// ---------------------------------------------------------------- map data
const ROADS = [[0, 530, W, 40], [580, 0, 30, H], [1190, 0, 30, H], [790, 0, 25, H], [985, 0, 25, H]];
const FIELDS = [[30, 30, 230, 90], [60, 840, 130, 100], [1590, 860, 170, 110], [1560, 30, 210, 100], [250, 980, 220, 90], [1300, 980, 200, 90]];
const HOUSES = [
  // west bank
  [640, 410, 110, 75], [655, 620, 95, 80], [450, 400, 100, 85], [470, 620, 80, 95], [300, 180, 80, 80],
  [440, 190, 90, 70], [310, 335, 70, 85], [150, 620, 110, 75], [200, 790, 90, 85], [420, 830, 120, 75],
  [640, 810, 95, 95], [650, 240, 100, 85], [470, 80, 90, 70], [690, 90, 90, 80], [130, 300, 80, 100],
  // east bank
  [1050, 410, 110, 75], [1050, 615, 95, 85], [1250, 405, 100, 80], [1250, 625, 85, 95], [1380, 700, 120, 90],
  [1420, 865, 80, 80], [1525, 715, 80, 90], [1530, 420, 110, 80], [1250, 830, 110, 80], [1060, 800, 95, 100],
  [1050, 240, 100, 85], [1260, 150, 90, 70], [1080, 90, 90, 80], [1420, 240, 100, 80], [1640, 620, 90, 80],
  [1590, 250, 80, 90]
];
const HEDGES = [
  [40, 500, 370, 8], [60, 720, 8, 170], [300, 750, 140, 8], [240, 140, 8, 140], [700, 720, 8, 80], [40, 960, 300, 8],
  [1390, 508, 370, 8], [1730, 720, 8, 170], [1360, 640, 130, 8], [1550, 140, 8, 90], [1100, 715, 8, 75], [1460, 960, 300, 8]
];
const WALLS = [
  [560, 300, 6, 80], [640, 340, 110, 6], [380, 600, 6, 100], [760, 620, 6, 80],
  [1230, 300, 6, 80], [1050, 340, 110, 6], [1375, 820, 6, 90], [1030, 620, 6, 80]
];
const TREES = [
  [100, 180, 22], [140, 150, 18], [80, 240, 20], [330, 640, 20], [560, 770, 22], [760, 960, 24], [150, 1010, 20], [720, 30, 20],
  [1700, 200, 22], [1660, 150, 18], [1720, 260, 20], [1480, 600, 20], [1240, 1000, 22], [1040, 1000, 24], [1650, 1010, 20], [1100, 30, 20],
  [40, 400, 18], [1760, 420, 18]
];
const FLAG_POS = [[405, 295], [900, 550], [1470, 825]];

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

// ---------------------------------------------------------------- terrain grid
const terr = new Uint8Array(GW * GH);
const hid = new Int16Array(GW * GH);
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
        if (cx >= 0 && cy >= 0 && cx < GW && cy < GH && terr[cy * GW + cx] !== T_RIVER) terr[cy * GW + cx] = t;
  };
  ROADS.forEach(r => byCenter(r, T_ROAD));
  byCenter([RX0, 0, RX1 - RX0, H], T_RIVER);
  byCenter([RX0, BY0, RX1 - RX0, BY1 - BY0], T_BRIDGE);
  byCenter([RX0, BY0, RX1 - RX0, 10], T_WALL);
  byCenter([RX0, BY1 - 10, RX1 - RX0, 10], T_WALL);
  TREES.forEach(([x, y, r]) => {
    for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
      for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
        if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) continue;
        if (dxy(cx * CELL + 5, cy * CELL + 5, x, y) <= r && terr[cy * GW + cx] !== T_RIVER) terr[cy * GW + cx] = T_TREE;
      }
  });
  HEDGES.forEach(r => byOverlap(r, T_HEDGE));
  WALLS.forEach(r => byOverlap(r, T_WALL));
  HOUSES.forEach((r, i) => byCenter(r, T_HOUSE, i + 1));
})();
const cellIdx = (x, y) => clamp(Math.floor(y / CELL), 0, GH - 1) * GW + clamp(Math.floor(x / CELL), 0, GW - 1);
const terrAt = (x, y) => terr[cellIdx(x, y)];
const houseAt = (x, y) => hid[cellIdx(x, y)];
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

// pathing grid (20px cells)
const passI = new Uint8Array(PW * PH), passV = new Uint8Array(PW * PH);
const costI = new Float32Array(PW * PH), costV = new Float32Array(PW * PH);
(function buildPath() {
  const ci = { [T_GRASS]: 1, [T_ROAD]: 0.9, [T_BRIDGE]: 0.9, [T_HOUSE]: 1.8, [T_HEDGE]: 1.4, [T_WALL]: 1.4, [T_TREE]: 1.4, [T_RIVER]: 1 };
  const cv = { [T_GRASS]: 1.1, [T_ROAD]: 0.8, [T_BRIDGE]: 0.8, [T_HOUSE]: 9, [T_HEDGE]: 1.6, [T_WALL]: 1.5, [T_TREE]: 1.8, [T_RIVER]: 1 };
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    let river = false, house = false, ci2 = 0, cv2 = 0;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const t = terr[(py * 2 + sy) * GW + px * 2 + sx];
      if (t === T_RIVER) river = true;
      if (t === T_HOUSE) house = true;
      ci2 += ci[t] / 4; cv2 += cv[t] / 4;
    }
    const k = py * PW + px;
    passI[k] = river ? 0 : 1; passV[k] = river || house ? 0 : 1;
    costI[k] = ci2; costV[k] = cv2;
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
  const h = (k) => { const dx = Math.abs(k % PW - tx0), dy = Math.abs(((k / PW) | 0) - ty0); return 0.85 * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)); };
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
  // string pulling
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
  for (let i = 1; i < n; i++) {
    const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
    if (!passAt(x, y, veh)) return false;
    if (!veh) { const h = houseAt(x, y); if (h && h !== ha && h !== hb) return false; }
  }
  return true;
}

// ---------------------------------------------------------------- weapons & unit types
// arm: damage multiplier vs armor class [infantry, light vehicle, assault gun]
const WPN = {
  rifle:  { range: 330, rof: 1.7, acc: 0.5, dmg: 13, supp: 5, arm: [1, 0.15, 0] },
  smg:    { range: 200, rof: 1.1, acc: 0.5, dmg: 10, supp: 4, arm: [1, 0.12, 0] },
  mg:     { range: 420, rof: 0.55, acc: 0.36, dmg: 8, supp: 6, arm: [1, 0.25, 0] },
  sniper: { range: 560, rof: 4.5, acc: 0.85, dmg: 30, supp: 9, fall: 0.25, arm: [1, 0.1, 0] },
  mortar: { range: 600, min: 110, rof: 6, indirect: true, he: true, dmg: 26, splash: 36, supp: 24, arm: [1, 0.5, 0.12] },
  piat:   { range: 150, rof: 6.5, acc: 0.75, he: true, dmg: 80, splash: 16, supp: 22, arm: [0.5, 1, 1] },
  gun:    { range: 420, rof: 9, acc: 0.5, he: true, dmg: 28, splash: 26, supp: 24, arm: [1, 1, 1] },
};
const UT = {
  officer:   { hp: 60, w: 'smg', ammo: 70, smoke: 1, spd: 1, role: 'lead' },
  rifle:     { hp: 100, w: 'rifle', ammo: 90, smoke: 2, spd: 1, role: 'assault' },
  mg:        { hp: 70, w: 'mg', ammo: 160, smoke: 0, spd: 0.85, role: 'support' },
  piat:      { hp: 60, w: 'smg', ammo: 40, at: 'piat', ammo2: 8, smoke: 1, spd: 1, role: 'assault' },
  sniper:    { hp: 40, w: 'sniper', ammo: 30, smoke: 0, spd: 1, stealth: 0.55, role: 'support' },
  mortar:    { hp: 60, w: 'mortar', ammo: 18, smokeRounds: 6, smoke: 0, spd: 0.8, role: 'mortar' },
  halftrack: { hp: 75, w: 'mg', ammo: 240, veh: 1, armor: 1, spd: 1.7, role: 'armor' },
  stug:      { hp: 150, w: 'gun', ammo: 24, veh: 1, armor: 2, spd: 1.2, role: 'armor' },
};
const ROSTER = [
  // British airborne (player)
  [0, 'officer', 'Lt. Ashby', 520, 450, 2],
  [0, 'rifle', '1 Section', 700, 450, 2],
  [0, 'rifle', '2 Section', 700, 660, 2],
  [0, 'rifle', '3 Section', 400, 315, 1, 'guard'],
  [0, 'mg', 'Bren team', 690, 285, 1],
  [0, 'piat', 'PIAT team', 510, 665, 1],
  [0, 'sniper', 'Sniper', 730, 130, 2],
  [0, 'mortar', 'Mortar', 345, 380, 1],
  // German garrison (AI)
  [1, 'officer', 'Leutnant', 1290, 670, 1],
  [1, 'rifle', 'Gruppe A', 1100, 280, 1],
  [1, 'rifle', 'Gruppe B', 1105, 850, 0],
  [1, 'rifle', 'Gruppe C', 1465, 825, 2, 'guard'],
  [1, 'mg', 'MG team', 1300, 440, 2],
  [1, 'mortar', 'Mortar', 1580, 460, 1],
  [1, 'halftrack', 'Half-track', 1600, 550, 1],
  [1, 'stug', 'Assault gun', 1730, 550, 1],
];

// ---------------------------------------------------------------- game state
const G = {};
function mkUnit(side, type, name, x, y, exp, role) {
  const t = UT[type];
  return {
    id: G.units.length, side, type, name, x, y, exp, t,
    hp: t.hp, maxHp: t.hp, morale: 82 + exp * 6, state: 0,
    ammo: t.ammo, ammoMax: t.ammo, ammo2: t.ammo2 || 0, ammo2Max: t.ammo2 || 0,
    smoke: t.smoke || 0, smokeRounds: t.smokeRounds || 0,
    veh: !!t.veh, armor: t.armor || 0, ang: side ? Math.PI : 0,
    path: [], mode: 'move', order: { type: 'idle' },
    cool: rnd(0, 1), cool2: 0, lastFired: -99, lastHit: -99, threat: null,
    alive: true, fled: false, moving: false, seenUntil: [-1, -1], wasSeen: false,
    role: role || t.role, aiCool: rnd(0, 2), kills: 0, flash: 0, deadSeen: false, fleeT: 0,
  };
}
function newGame(auto) {
  Object.assign(G, {
    units: [], smokes: [], shells: [], tracers: [], booms: [], markers: [], ghosts: [],
    los: new Map(), time: 0, running: false, paused: false, over: false, result: null,
    auto: !!auto, sel: [], pend: 'move', speed: G.speed || 1, visT: 0, aiT: 0, flagT: 0,
    ai: [{ smokeCd: 60 }, { smokeCd: 40 }],
    stats: { dead: [0, 0], fled: [0, 0] },
  });
  G.flags = FLAG_POS.map(([x, y], i) => ({ x, y, owner: i === 0 ? 0 : i === 2 ? 1 : -1, prog: 0, capSide: -1, name: ['West', 'Bridge', 'East'][i] }));
  for (const r of ROSTER) G.units.push(mkUnit(r[0], r[1], r[2], r[3], r[4], r[5], r[6]));
  updateVis();
}
const live = (u) => u.alive && !u.fled;
const isSeen = (o, side) => o.side === side || o.seenUntil[side] > G.time;

// ---------------------------------------------------------------- line of sight & spotting
function LOS(ax, ay, bx, by) {
  const ha = houseAt(ax, ay), hb = houseAt(bx, by);
  const d = dxy(ax, ay, bx, by), n = Math.ceil(d / 6);
  let trees = 0;
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
    const k = cellIdx(x, y);
    const h = hid[k];
    if (h && h !== ha && h !== hb) return false;
    if (terr[k] === T_TREE && i > 3 && i < n - 3 && ++trees > 5) return false;
  }
  for (const s of G.smokes) {
    if (s.r < 16 || s.age > s.life - 3) continue;
    if (segDist(s.x, s.y, ax, ay, bx, by) < s.r * 0.85) return false;
  }
  return true;
}
const losKey = (a, b) => (a.side === 0 ? a.id * 64 + b.id : b.id * 64 + a.id);
function losU(a, b) { return a.side === b.side ? true : !!G.los.get(losKey(a, b)); }

function spotRange(a, b) {
  let r = 460;
  if (b.veh) r *= 1.5;
  else {
    r *= [1, 0.7, 0.55][coverAt(b.x, b.y)];
    if (!b.moving) r *= b.order.type === 'hold' ? 0.6 : 0.8;
    else if (b.mode === 'sneak') r *= 0.6;
    else if (b.mode === 'fast') r *= 1.15;
    if (b.t.stealth) r *= b.t.stealth;
  }
  if (G.time - b.lastFired < 2) r *= b.type === 'sniper' ? 1.6 : 2.2;
  if (a.state >= 3) r *= 0.6;
  return Math.max(r, 70);
}
function updateVis() {
  G.los.clear();
  const A = G.units.filter(live);
  const s0 = A.filter(u => u.side === 0), s1 = A.filter(u => u.side === 1);
  for (const a of s0) for (const b of s1) {
    if (dist(a, b) < 720) G.los.set(losKey(a, b), LOS(a.x, a.y, b.x, b.y));
  }
  for (const [mine, theirs, s] of [[s0, s1, 0], [s1, s0, 1]]) {
    for (const b of theirs) {
      for (const a of mine) {
        if (losU(a, b) && dist(a, b) <= spotRange(a, b)) { b.seenUntil[s] = G.time + 1.0; break; }
      }
    }
  }
  // ghosts: last known enemy positions for the player
  for (const b of s1) {
    const now = isSeen(b, 0);
    if (b.wasSeen && !now) G.ghosts.push({ x: b.x, y: b.y, t: G.time, veh: b.veh });
    b.wasSeen = now;
  }
  G.ghosts = G.ghosts.filter(g => G.time - g.t < 8);
}

// ---------------------------------------------------------------- combat
function hitChance(u, w, d, o) {
  let p = w.acc * (1 - (d / w.range) * (w.fall ?? 0.6));
  if (o.veh) p *= 1.5;
  else {
    p *= [1, 0.55, 0.32][coverAt(o.x, o.y)];
    if (o.moving) p *= (o.mode === 'fast' || o.state >= 3) ? 1.25 : o.mode === 'sneak' ? 0.7 : 1.0;
    else p *= 0.85;
  }
  if (u.veh) p *= 0.8;
  if (u.moving) p *= u.veh ? 0.6 : u.mode === 'sneak' ? 0.6 : 0.5;
  p *= [1, 0.75, 0.4, 0, 0][u.state];
  p *= [0.85, 1, 1.15][u.exp];
  if (u.order.type === 'hold' && !u.moving) p *= 1.15;
  return clamp(p, 0.02, 0.95);
}
function suppress(o, amt, src) {
  if (!o.alive || amt <= 0) return;
  let m = [1.2, 1, 0.8][o.exp] * (o.veh ? 0.12 : [1, 0.75, 0.55][coverAt(o.x, o.y)]);
  if (o.order.type === 'hold') m *= 0.9;
  if (o.morale > 3) o.morale = Math.max(3, o.morale - amt * m); // suppression alone can't break a unit
  o.lastHit = G.time;
  o.threat = { x: src.x, y: src.y, id: src.id };
}
function damage(o, amt, src) {
  if (!o.alive || amt <= 0.05) return;
  o.hp -= amt;
  o.morale -= amt * (o.veh ? 0.6 : 0.6) * [1.2, 1, 0.8][o.exp];
  if (o.veh && amt >= 30) o.morale -= 25;
  o.lastHit = G.time;
  if (o.hp <= 0) kill(o, src);
}
function kill(o, src) {
  o.alive = false; o.hp = 0; o.path = [];
  o.deadSeen = o.side === 0 || isSeen(o, 0) || G.time - o.lastFired < 3;
  G.stats.dead[o.side]++;
  if (src) src.kills++;
  for (const f of G.units) if (live(f) && f.side === o.side && dist(f, o) < 160) f.morale -= o.type === 'officer' ? 18 : 10;
  if (o.veh) { addBoom(o.x, o.y, 34); addSmoke(o.x, o.y, 22, 14); }
  if (o.side === 0) toast('✖ ' + o.name);
  else if (o.deadSeen) toast('✔ ' + o.name + ' down');
  G.sel = G.sel.filter(u => u !== o);
}
function addBoom(x, y, r) { G.booms.push({ x, y, r, t: 0 }); }
function addSmoke(x, y, maxR = 50, life = 28) { G.smokes.push({ x, y, r: 4, maxR, age: 0, life }); }
function tracer(u, x, y) { G.tracers.push({ x1: u.x, y1: u.y, x2: x, y2: y, t: 0, side: u.side, sid: u.id }); }

function fireWeapon(u, wk, x, y, tgt) {
  const w = WPN[wk];
  u.lastFired = G.time; u.flash = 0.08;
  if (u.veh) u.ang += angDiff(Math.atan2(y - u.y, x - u.x), u.ang) * (u.moving ? 0 : 0.5);
  const d = dxy(u.x, u.y, x, y);
  if (w.indirect) {
    const sc = 16 + d * 0.08 * (1.2 - u.exp * 0.15), a = rnd(0, TAU), r = rnd(0, sc);
    G.shells.push({ x0: u.x, y0: u.y, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, t: 0, dur: 1.2 + d / 450, w, src: u, kind: 'he', arc: true });
    return;
  }
  if (w.he) {
    const p = tgt ? hitChance(u, w, d, tgt) : 0.3;
    let ix = x, iy = y;
    if (Math.random() > p) { const a = rnd(0, TAU), r = rnd(16, 40) + d * 0.05; ix += Math.cos(a) * r; iy += Math.sin(a) * r; }
    G.shells.push({ x0: u.x, y0: u.y, x: ix, y: iy, t: 0, dur: 0.08 + d / 700, w, src: u, kind: 'he' });
    return;
  }
  const fp = 0.45 + 0.55 * u.hp / u.maxHp;
  if (tgt) {
    const p = hitChance(u, w, d, tgt), hit = Math.random() < p;
    suppress(tgt, w.supp * fp, u);
    if (hit) damage(tgt, w.dmg * fp * rnd(0.6, 1.4) * w.arm[tgt.armor], u);
    tracer(u, tgt.x + (hit ? 0 : rnd(-16, 16)), tgt.y + (hit ? 0 : rnd(-16, 16)));
  } else {
    tracer(u, x + rnd(-22, 22), y + rnd(-22, 22));
    for (const o of G.units) {
      if (!live(o) || o.side === u.side) continue;
      const dd = dxy(o.x, o.y, x, y);
      if (dd < 55) {
        suppress(o, w.supp * fp * 0.8, u);
        if (Math.random() < hitChance(u, w, d, o) * 0.35) damage(o, w.dmg * fp * rnd(0.6, 1.2) * w.arm[o.armor], u);
      }
    }
  }
}
function explode(x, y, w, src) {
  addBoom(x, y, w.splash);
  for (const o of G.units) {
    if (!live(o) || o.side === src.side) continue;
    const d = dxy(o.x, o.y, x, y);
    if (d < w.splash) {
      let f = 1 - d / w.splash;
      if (o.veh) f = d < 18 ? 1 : f * 0.4;
      let dm = w.dmg * f * w.arm[o.armor];
      if (!o.veh) dm *= [1, 0.75, 0.45][coverAt(o.x, o.y)];
      damage(o, dm * rnd(0.7, 1.2), src);
    }
    if (o.alive && d < w.splash * 2.2) suppress(o, w.supp * (1 - d / (w.splash * 2.2)), src);
  }
}
function validTarget(u, o, w) {
  if (!live(o) || o.side === u.side || !isSeen(o, u.side)) return false;
  const d = dist(u, o);
  if (d > w.range || (w.min && d < w.min)) return false;
  if (!w.indirect && !losU(u, o)) return false;
  if (w.arm[o.armor] <= 0.001) return false;
  return true;
}
function canAct(u) { return u.state < 3; }
function updateFire(u) {
  u.cool -= DT; u.cool2 -= DT; if (u.flash > 0) u.flash -= DT;
  if (!canAct(u)) return;
  if (u.moving && u.mode === 'fast' && !u.veh) return;
  const ord = u.order;
  // anti-tank weapon first
  if (u.t.at && u.ammo2 > 0 && u.cool2 <= 0) {
    const w = WPN[u.t.at];
    let tgt = null;
    if (ord.type === 'fire' && ord.target.veh && validTarget(u, ord.target, w)) tgt = ord.target;
    else {
      let bd = 1e9;
      for (const o of G.units) if (o.veh && validTarget(u, o, w)) { const d = dist(u, o); if (d < bd) { bd = d; tgt = o; } }
    }
    if (tgt && !(ord.type === 'hold' && G.time - u.lastHit > 3 && dist(u, tgt) > w.range * 0.8)) {
      fireWeapon(u, u.t.at, tgt.x, tgt.y, tgt); u.ammo2--; u.cool2 = w.rof * rnd(0.9, 1.1); u.cool = Math.max(u.cool, 1);
      return;
    }
  }
  if (u.ammo <= 0 || u.cool > 0) return;
  const w = WPN[u.t.w];
  let tgt = null, area = null;
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
    const ambush = ord.type === 'hold' && G.time - u.lastHit > 3;
    for (const o of G.units) {
      if (!validTarget(u, o, w)) continue;
      const d = dist(u, o);
      if (ambush && d > w.range * 0.55) continue;
      if (w.indirect && G.units.some(f => live(f) && f.side === u.side && dxy(f.x, f.y, o.x, o.y) < 50)) continue; // no danger-close
      let s = d / w.range;
      if (o.veh && w.arm[o.armor] < 0.2) s += 2;
      if (o.type === 'mg' || o.type === 'piat') s -= 0.15;
      if (u.threat && u.threat.id === o.id) s -= 0.3;
      if (o.state >= 3) s += 0.5;
      if (s < bs) { bs = s; tgt = o; }
    }
  }
  if (!tgt && !area) return;
  if (tgt) fireWeapon(u, u.t.w, tgt.x, tgt.y, tgt);
  else fireWeapon(u, u.t.w, area.x, area.y, null);
  u.ammo--;
  u.cool = w.rof * rnd(0.85, 1.15) * (u.state === 2 ? 1.5 : 1);
  if (u.side === 0 && u.ammo === Math.floor(u.ammoMax * 0.2)) toast('⚠ ' + u.name + ' low ammo');
}
function updateShells() {
  for (const s of G.shells) {
    s.t += DT;
    if (s.t >= s.dur && !s.done) {
      s.done = true;
      if (s.kind === 'smoke') addSmoke(s.x, s.y);
      else explode(s.x, s.y, s.w, s.src);
    }
  }
  G.shells = G.shells.filter(s => !s.done);
}

// ---------------------------------------------------------------- morale
function nearOfficer(u) {
  return G.units.some(o => o !== u && o.type === 'officer' && live(o) && o.side === u.side && o.state <= 1 && dist(o, u) < 170);
}
function updateMorale(u) {
  if (u.state === 4) return;
  const hpf = u.hp / u.maxHp, off = nearOfficer(u);
  const maxM = 35 + 60 * hpf + (off ? 10 : 0) + u.exp * 3;
  if (G.time - u.lastHit > 2.5) {
    const rec = (3 + u.exp * 1.5) * (off ? 2 : 1) * (u.type === 'officer' ? 1.3 : 1);
    if (u.morale < maxM) u.morale = Math.min(maxM, u.morale + rec * DT);
  }
  if (u.morale > maxM) u.morale = Math.max(maxM, u.morale - 1.5 * DT);
  u.morale = Math.min(u.morale, 100);
  let s = u.morale >= 62 ? 0 : u.morale >= 40 ? 1 : u.morale >= 18 ? 2 : u.morale > -12 ? 3 : 4;
  if (u.state === 3 && s === 2 && u.morale < 24) s = 3; // hysteresis
  if (u.veh && s === 2) s = 1;
  if (s === 4) return enterBroken(u);
  if (s === 3 && u.state < 3) { u.state = 3; enterPanic(u); return; }
  if (s < 3 && u.state === 3) { u.path = []; u.order = { type: 'idle' }; }
  if (u.state === 3) {
    u.fleeT -= DT;
    if (!u.path.length && G.time - u.lastHit < 1.5 && u.fleeT <= 0) enterPanic(u);
  }
  if (s === 2 && u.state < 2 && u.side === 0) toast('▼ ' + u.name + ' pinned');
  u.state = s;
}
function homeX(side) { return side === 0 ? 12 : W - 12; }
function enterPanic(u) {
  u.fleeT = 4;
  let ax = u.x, ay = u.y;
  const th = u.threat || { x: u.side === 0 ? u.x + 100 : u.x - 100, y: u.y };
  let vx = u.x - th.x, vy = u.y - th.y; const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
  vx += u.side === 0 ? -0.8 : 0.8;
  const l2 = Math.hypot(vx, vy) || 1;
  ax = clamp(u.x + vx / l2 * 170, 20, W - 20); ay = clamp(u.y + vy / l2 * 170, 20, H - 20);
  const c = u.veh ? null : coverNear(ax, ay, 70, u.side);
  const p = findPath(u.x, u.y, c ? c.x : ax, c ? c.y : ay, u.veh);
  u.path = p || []; u.mode = 'fast'; u.order = { type: 'flee' };
  if (u.side === 0) toast('! ' + u.name + ' panics');
}
function enterBroken(u) {
  u.state = 4; u.morale = -12;
  const p = findPath(u.x, u.y, homeX(u.side), u.y, u.veh);
  u.path = p || []; u.mode = 'fast'; u.order = { type: 'rout' };
  G.sel = G.sel.filter(s => s !== u);
  toast((u.side === 0 ? '🏳 ' : '✔ ') + u.name + ' broken');
}

// ---------------------------------------------------------------- movement
function updateMove(u) {
  u.moving = false;
  if (!u.path.length) return;
  if (u.state === 2) return; // pinned
  if (u.order.type === 'hold') { u.path = []; return; }
  const p = u.path[0];
  let sp = (u.state >= 3 ? 60 : MODE_SPD[u.mode]) * u.t.spd;
  const t = terrAt(u.x, u.y);
  if (u.veh) sp *= (t === T_ROAD || t === T_BRIDGE) ? 1.1 : (t === T_HEDGE || t === T_TREE || t === T_WALL) ? 0.55 : 0.85;
  else sp *= t === T_HOUSE ? 0.6 : (t === T_HEDGE || t === T_WALL || t === T_TREE) ? 0.7 : 1;
  if (u.state === 1) sp *= 0.9;
  if (u.veh) {
    const want = Math.atan2(p.y - u.y, p.x - u.x), da = angDiff(want, u.ang), turn = 2.2 * DT;
    if (Math.abs(da) > turn) { u.ang += Math.sign(da) * turn; if (Math.abs(da) > 0.6) return; } else u.ang = want;
  }
  const d = dxy(u.x, u.y, p.x, p.y), step = sp * DT;
  u.moving = true;
  if (d <= step) {
    u.x = p.x; u.y = p.y; u.path.shift();
    if (!u.path.length) {
      if (u.order.type === 'move') u.order = { type: 'idle' };
      if (u.order.type === 'rout' && (u.x < 30 || u.x > W - 30)) { u.fled = true; G.stats.fled[u.side]++; }
    }
  } else { u.x += (p.x - u.x) / d * step; u.y += (p.y - u.y) / d * step; }
}
function separate() {
  const A = G.units.filter(live);
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const a = A[i], b = A[j];
    if (a.side !== b.side && !a.veh && !b.veh) continue;
    const min = (a.veh || b.veh) ? 24 : 15;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= min || d < 0.01) continue;
    const push = (min - d) / 2 * 0.5, nx = dx / d * push, ny = dy / d * push;
    if (passAt(a.x - nx, a.y - ny, a.veh)) { a.x -= nx; a.y -= ny; }
    if (passAt(b.x + nx, b.y + ny, b.veh)) { b.x += nx; b.y += ny; }
  }
}

// ---------------------------------------------------------------- flags, smoke, effects
function updateFlags() {
  for (const f of G.flags) {
    const c = [0, 0];
    for (const u of G.units) if (live(u) && u.state <= 2 && dxy(u.x, u.y, f.x, f.y) < CAP_R) c[u.side]++;
    const s = c[0] && !c[1] ? 0 : c[1] && !c[0] ? 1 : -1;
    if (s >= 0 && f.owner !== s) {
      if (f.capSide !== s) { f.capSide = s; f.prog = 0; }
      f.prog += DT / 4;
      if (f.prog >= 1) {
        const prev = f.owner;
        f.owner = s; f.prog = 0; f.capSide = -1;
        toast((s === 0 ? '🚩 ' : '⚠ ') + f.name + (s === 0 ? ' taken' : (prev === 0 ? ' lost' : ' enemy')));
      }
    } else if (s < 0 || f.owner === s) { f.prog = Math.max(0, f.prog - DT / 6); if (!f.prog) f.capSide = -1; }
  }
}
function updateFx() {
  for (const s of G.smokes) { s.age += DT; s.r = Math.min(s.maxR, s.r + DT * 24); }
  G.smokes = G.smokes.filter(s => s.age < s.life);
  for (const t of G.tracers) t.t += DT;
  G.tracers = G.tracers.filter(t => t.t < 0.16);
  for (const b of G.booms) b.t += DT;
  G.booms = G.booms.filter(b => b.t < 0.6);
}
function checkEnd() {
  const able = [0, 1].map(s => G.units.filter(u => live(u) && u.side === s && u.state < 4).length);
  let res = null;
  if (!able[0] || !able[1]) res = !able[1] && able[0] ? 'win' : !able[0] && able[1] ? 'lose' : 'draw';
  else if (G.time >= GAME_TIME) {
    const o0 = G.flags.filter(f => f.owner === 0).length, o1 = G.flags.filter(f => f.owner === 1).length;
    res = o0 > o1 ? 'win' : o1 > o0 ? 'lose' : 'draw';
  }
  if (res) endGame(res, !able[0] || !able[1]);
}

// ---------------------------------------------------------------- AI
function coverNear(x, y, r, side, toward, self) {
  let best = null, bs = -1e9;
  const r2 = r * r;
  for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      if (cx < 1 || cy < 1 || cx >= GW - 1 || cy >= GH - 1) continue;
      const px = cx * CELL + 5, py = cy * CELL + 5;
      const d2 = (px - x) ** 2 + (py - y) ** 2;
      if (d2 > r2 || !passAt(px, py, false)) continue;
      let s = coverAt(px, py) * 30 - Math.sqrt(d2) * 0.1;
      if (toward) s -= dxy(px, py, toward.x, toward.y) * 0.05;
      for (const u of G.units) if (u !== self && live(u) && u.side === side && dxy(u.x, u.y, px, py) < 16) s -= 25;
      if (s > bs) { bs = s; best = { x: px, y: py }; }
    }
  return best;
}
function pointAlong(u, goal, len) {
  const p = findPath(u.x, u.y, goal.x, goal.y, u.veh);
  if (!p || !p.length) return { x: goal.x, y: goal.y };
  let px = u.x, py = u.y, left = len;
  for (const q of p) {
    const d = dxy(px, py, q.x, q.y);
    if (d >= left) return { x: px + (q.x - px) / d * left, y: py + (q.y - py) / d * left };
    left -= d; px = q.x; py = q.y;
  }
  return { x: px, y: py };
}
function aiMove(u, p, mode) {
  if (!p || dxy(u.x, u.y, p.x, p.y) < 12) return false;
  const path = findPath(u.x, u.y, p.x, p.y, u.veh);
  if (!path || !path.length) return false;
  u.path = path; u.mode = mode; u.order = { type: 'move' };
  return true;
}
function aiHold(u) { u.path = []; if (u.order.type !== 'hold') u.order = { type: 'hold' }; }
function aiStop(u) { u.path = []; if (u.order.type === 'move' || u.order.type === 'hold') u.order = { type: 'idle' }; }

function aiThink(side) {
  const mine = G.units.filter(u => live(u) && u.side === side && u.state < 3);
  if (!mine.length) return;
  const home = G.flags[side === 0 ? 0 : 2];
  const remaining = GAME_TIME - G.time;
  const own = G.flags.filter(f => f.owner === side).length, theirs = G.flags.filter(f => f.owner === 1 - side).length;
  const targets = G.flags.filter(f => f.owner !== side).sort((a, b) => dist(a, home) - dist(b, home));
  let obj;
  if (!targets.length || (remaining < 75 && own > theirs)) obj = G.flags[1].owner === side ? G.flags[1] : home;
  else obj = targets[0];
  // if home flag is threatened or lost, it takes priority
  if (home.owner !== side) obj = home;
  const seen = G.units.filter(o => live(o) && o.side !== side && isSeen(o, side));
  const assault = mine.filter(u => u.role === 'assault' && !u.veh);
  const front = assault.sort((a, b) => dist(a, obj) - dist(b, obj))[0];

  // smoke screen for a bridge crossing
  const myEnd = { x: side === 1 ? RX1 + 50 : RX0 - 50, y: 550 };
  const crossing = side === 1 ? obj.x < RX1 : obj.x > RX0;
  if (crossing && G.time > G.ai[side].smokeCd && seen.some(o => dxy(o.x, o.y, 900, 550) < 450) &&
      assault.some(u => dist(u, myEnd) < 220)) {
    const mort = mine.find(u => u.type === 'mortar' && u.smokeRounds > 0 && dxy(u.x, u.y, 900, 550) < 600);
    const sx = 900 + (side === 1 ? -40 : 40), sy = 550;
    if (mort) { mort.smokeRounds--; G.shells.push({ x0: mort.x, y0: mort.y, x: sx + rnd(-15, 15), y: sy + rnd(-15, 15), t: 0, dur: 2, kind: 'smoke', src: mort, arc: true }); }
    else {
      const thr = assault.find(u => u.smoke > 0 && dist(u, myEnd) < 220);
      if (thr) throwSmoke(thr, sx, sy);
    }
    G.ai[side].smokeCd = G.time + 50;
  }

  for (const u of mine) {
    u.aiCool -= 0.5;
    if (u.aiCool > 0) continue;
    u.aiCool = rnd(2, 3.5);
    if (u.state === 2) continue;
    if ((u.order.type === 'fire' || u.order.type === 'area') && G.time - u.order.t < 6) continue;
    aiUnit(u, obj, home, seen, front, side);
  }
}
function aiUnit(u, obj, home, seen, front, side) {
  const engaged = G.time - u.lastFired < 2.5 || G.time - u.lastHit < 2.5;
  const cov = coverAt(u.x, u.y), hpf = u.hp / u.maxHp, d = dist(u, obj);
  if (u.veh) return aiVehicle(u, obj, home, seen, front, hpf);
  if (hpf < 0.35 && u.role !== 'guard' && dist(u, home) > 90) return aiMove(u, coverNear(home.x, home.y, 80, side, null, u), 'move');
  switch (u.role) {
    case 'guard': {
      if (dist(u, home) > CAP_R * 0.7) aiMove(u, coverNear(home.x, home.y, CAP_R * 0.7, side, null, u), engaged ? 'move' : 'fast');
      else aiHold(u);
      return;
    }
    case 'mortar': {
      if (d > 520 || d < 180) {
        const p = pointAlong(u, obj, Math.max(0, d - 380));
        aiMove(u, coverNear(p.x, p.y, 60, side, null, u), 'move');
      }
      return;
    }
    case 'support': {
      if (engaged && cov >= 1) return;
      if (u._ow && u._owObj === obj && dist(u, u._ow) < 20) { aiHold(u); return; }
      let best = null, bs = -1e9;
      for (let i = 0; i < 30; i++) {
        const a = rnd(0, TAU), r = rnd(200, u.type === 'sniper' ? 420 : 330);
        const x = obj.x + Math.cos(a) * r, y = obj.y + Math.sin(a) * r;
        if (x < 20 || y < 20 || x > W - 20 || y > H - 20 || !passAt(x, y, false)) continue;
        if (dxy(x, y, home.x, home.y) > dist(obj, home) + 120) continue;
        let s = coverAt(x, y) * 40 + (LOS(x, y, obj.x, obj.y) ? 60 : 0) - dxy(x, y, u.x, u.y) * 0.05;
        const far = side === 1 ? x < RX0 : x > RX1, objFar = side === 1 ? obj.x < RX0 : obj.x > RX1;
        if (far && !objFar) s -= 50;
        if (s > bs) { bs = s; best = { x, y }; }
      }
      if (best) { const c = coverNear(best.x, best.y, 30, side, null, u) || best; u._ow = c; u._owObj = obj; aiMove(u, c, u.type === 'sniper' ? 'sneak' : 'move'); }
      return;
    }
    case 'lead': {
      const grp = G.units.filter(o => live(o) && o.side === side && o.role === 'assault' && !o.veh);
      if (!grp.length) { u.role = 'assault'; return; }
      const cx = grp.reduce((s, o) => s + o.x, 0) / grp.length, cy = grp.reduce((s, o) => s + o.y, 0) / grp.length;
      if (engaged && cov >= 1 && dxy(u.x, u.y, cx, cy) < 160) return;
      const v = { x: cx + (home.x - cx) * 0.12, y: cy + (home.y - cy) * 0.12 };
      if (dxy(u.x, u.y, v.x, v.y) > 60) aiMove(u, coverNear(v.x, v.y, 60, side, null, u), 'move');
      return;
    }
    default: {
      // PIAT teams hunt vehicles
      if (u.t.at && u.ammo2 > 0) {
        const veh = seen.filter(o => o.veh).sort((a, b) => dist(a, u) - dist(b, u))[0];
        if (veh && dist(veh, u) < 380) {
          if (dist(veh, u) > 120) aiMove(u, coverNear(veh.x, veh.y, 100, side, u, u), 'sneak');
          return;
        }
      }
      if (engaged && cov >= 1 && Math.random() < 0.65) return;
      if (engaged && cov === 0) { const c = coverNear(u.x, u.y, 90, side, obj, u); if (c && aiMove(u, c, 'fast')) return; }
      if (d < CAP_R * 0.7) {
        if (cov < 1) { const c = coverNear(obj.x, obj.y, CAP_R * 0.7, side, null, u); if (c && dxy(c.x, c.y, u.x, u.y) > 12) { aiMove(u, c, 'move'); return; } }
        aiHold(u);
        return;
      }
      let goal;
      if (d < 200) goal = coverNear(obj.x, obj.y, CAP_R * 0.7, side, null, u) || { x: obj.x, y: obj.y };
      else { const p = pointAlong(u, obj, 170); goal = coverNear(p.x, p.y, 70, side, obj, u) || p; }
      const near = seen.some(o => dist(o, u) < 320);
      aiMove(u, goal, near ? (u.t.at ? 'sneak' : 'move') : (d > 350 ? 'fast' : 'move'));
    }
  }
}
function aiVehicle(u, obj, home, seen, front, hpf) {
  const threat = seen.filter(o => !o.veh && dist(o, u) < (u.type === 'stug' ? 170 : 140)).sort((a, b) => dist(a, u) - dist(b, u))[0];
  if (threat) {
    let vx = u.x - threat.x, vy = u.y - threat.y; const l = Math.hypot(vx, vy) || 1;
    const p = { x: clamp(u.x + vx / l * 130, 20, W - 20), y: clamp(u.y + vy / l * 130, 20, H - 20) };
    if (!aiMove(u, p, 'move')) aiMove(u, pointAlong(u, home, 130), 'move');
    return;
  }
  if (hpf < 0.35) { aiMove(u, pointAlong(u, home, 200), 'move'); return; }
  const standoff = u.type === 'stug' ? 160 : 80;
  const d = dist(u, obj);
  if (front) {
    if (d < dist(front, obj) + standoff) { aiStop(u); return; }
  } else if (seen.length && d < 260) { aiStop(u); return; }
  aiMove(u, pointAlong(u, obj, 150), 'move');
}
function throwSmoke(u, x, y) {
  const d = dxy(u.x, u.y, x, y), max = 110;
  if (d > max) { x = u.x + (x - u.x) / d * max; y = u.y + (y - u.y) / d * max; }
  u.smoke--;
  G.shells.push({ x0: u.x, y0: u.y, x, y, t: 0, dur: 0.8, kind: 'smoke', src: u, arc: true });
}

// ---------------------------------------------------------------- orders (player)
function issueMove(us, x, y, mode) {
  const n = us.length;
  us.forEach((u, i) => {
    const a = i / n * TAU, r = n > 1 ? 16 + n * 3 : 0;
    const tx = clamp(x + Math.cos(a) * r, 10, W - 10), ty = clamp(y + Math.sin(a) * r, 10, H - 10);
    const p = findPath(u.x, u.y, tx, ty, u.veh);
    if (p && p.length) { u.path = p; u.mode = mode; u.order = { type: 'move' }; }
  });
  G.markers.push({ x, y, t: 0, kind: mode });
}
function issueFire(us, o) {
  for (const u of us) { u.path = []; u.order = { type: 'fire', target: o, t: G.time }; }
  G.markers.push({ x: o.x, y: o.y, t: 0, kind: 'fire' });
}
function issueArea(us, x, y) {
  let ok = false;
  for (const u of us) {
    const w = WPN[u.t.w], d = dxy(u.x, u.y, x, y);
    if (u.ammo <= 0 || d > w.range || (w.min && d < w.min) || (!w.indirect && !LOS(u.x, u.y, x, y))) continue;
    u.path = []; u.order = { type: 'area', x, y, t: G.time, until: G.time + 20 }; ok = true;
  }
  G.markers.push({ x, y, t: 0, kind: ok ? 'area' : 'no' });
  if (!ok) toast('✖ out of range or no line of sight');
}
function issueSmoke(us, x, y) {
  let ok = false;
  for (const u of us) {
    const d = dxy(u.x, u.y, x, y);
    if (u.smokeRounds > 0 && d <= WPN.mortar.range && d >= WPN.mortar.min) {
      u.smokeRounds--; ok = true; u.lastFired = G.time;
      G.shells.push({ x0: u.x, y0: u.y, x: x + rnd(-12, 12), y: y + rnd(-12, 12), t: 0, dur: 1.2 + d / 450, kind: 'smoke', src: u, arc: true });
      break;
    }
  }
  if (!ok) for (const u of us) if (u.smoke > 0) { throwSmoke(u, x, y); ok = true; break; }
  G.markers.push({ x, y, t: 0, kind: ok ? 'smoke' : 'no' });
  if (!ok) toast('✖ no smoke');
}
function issueHold(us) { for (const u of us) { u.path = []; u.order = { type: 'hold' }; } }

// ---------------------------------------------------------------- main step
function step() {
  G.time += DT;
  G.visT -= DT; if (G.visT <= 0) { G.visT = 0.25; updateVis(); }
  G.aiT -= DT; if (G.aiT <= 0) { G.aiT = 0.5; aiThink(1); if (G.auto) aiThink(0); }
  for (const u of G.units) {
    if (!live(u)) continue;
    updateMorale(u);
    if (!live(u)) continue;
    updateMove(u);
    if (!live(u)) continue;
    updateFire(u);
  }
  separate();
  updateShells();
  updateFlags();
  updateFx();
  for (const m of G.markers) m.t += DT;
  G.markers = G.markers.filter(m => m.t < 1.2);
  G.flagT -= DT;
  if (G.flagT <= 0) { G.flagT = 0.5; checkEnd(); }
}

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
function drawMap() {
  mapCv.width = W * MS; mapCv.height = H * MS;
  const c = mapCv.getContext('2d');
  c.scale(MS, MS);
  c.fillStyle = '#76844f'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#82905a'; FIELDS.forEach(([x, y, w, h]) => c.fillRect(x, y, w, h));
  c.strokeStyle = 'rgba(0,0,0,.05)'; c.lineWidth = 1;
  FIELDS.forEach(([x, y, w, h]) => { for (let yy = y + 8; yy < y + h; yy += 10) { c.beginPath(); c.moveTo(x + 4, yy); c.lineTo(x + w - 4, yy); c.stroke(); } });
  c.fillStyle = '#b5aa8a'; ROADS.forEach(([x, y, w, h]) => c.fillRect(x, y, w, h));
  c.fillStyle = 'rgba(0,0,0,.06)'; ROADS.forEach(([x, y, w, h]) => { if (w > h) c.fillRect(x, y + h / 2 - 1, w, 2); else c.fillRect(x + w / 2 - 1, y, 2, h); });
  // river
  c.fillStyle = '#5d7a52'; c.fillRect(RX0 - 6, 0, RX1 - RX0 + 12, H);
  c.fillStyle = '#4b7891'; c.fillRect(RX0, 0, RX1 - RX0, H);
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 2;
  for (let y = 20; y < H; y += 46) { const x = RX0 + 20 + ((y * 37) % 90); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 18, y); c.stroke(); }
  // bridge
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(RX0 - 4, BY0 + 6, RX1 - RX0 + 8, BY1 - BY0);
  c.fillStyle = '#a19c90'; c.fillRect(RX0 - 4, BY0, RX1 - RX0 + 8, BY1 - BY0);
  c.fillStyle = '#6c675e'; c.fillRect(RX0 - 4, BY0, RX1 - RX0 + 8, 10); c.fillRect(RX0 - 4, BY1 - 10, RX1 - RX0 + 8, 10);
  c.fillStyle = 'rgba(0,0,0,.1)'; for (let x = RX0 + 10; x < RX1; x += 28) c.fillRect(x, BY0 + 10, 2, BY1 - BY0 - 20);
  // trees
  TREES.forEach(([x, y, r]) => {
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(x + 4, y + 4, r, 0, TAU); c.fill();
    c.fillStyle = '#4d6b37'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = '#5c7c43'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x + Math.cos(k * 1.7) * r * 0.45, y + Math.sin(k * 1.7) * r * 0.45, r * 0.42, 0, TAU); c.fill(); }
  });
  // hedges & walls
  HEDGES.forEach(([x, y, w, h]) => { c.fillStyle = '#3e5a2b'; rrect(c, x - 1, y - 1, w + 2, h + 2, 4); c.fill(); c.fillStyle = '#4a6a33'; rrect(c, x + 1, y + 1, w - 2, h - 2, 3); c.fill(); });
  WALLS.forEach(([x, y, w, h]) => { c.fillStyle = '#5f5b54'; c.fillRect(x, y, w, h); c.fillStyle = '#9a958a'; c.fillRect(x + 1, y + 1, w - 2, h - 2); });
  // houses
  const roofs = ['#9a5a44', '#8a6e5c', '#7b5e52', '#a36b4c'];
  HOUSES.forEach(([x, y, w, h], i) => {
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + 5, y + 5, w, h);
    c.fillStyle = roofs[i % roofs.length]; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(255,255,255,.08)';
    if (w >= h) c.fillRect(x, y, w, h / 2); else c.fillRect(x, y, w / 2, h);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5;
    c.beginPath(); if (w >= h) { c.moveTo(x + 6, y + h / 2); c.lineTo(x + w - 6, y + h / 2); } else { c.moveTo(x + w / 2, y + 6); c.lineTo(x + w / 2, y + h - 6); } c.stroke();
    c.strokeStyle = '#3a2a22'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
  });
}
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  clampCam();
}
function zLimits() { return [Math.max(0.25, Math.min(VW / W, VH / H) * 0.9), 2.5]; }
function clampCam() {
  const [zmin, zmax] = zLimits();
  cam.z = clamp(cam.z, zmin, zmax);
  const vw = VW / cam.z, vh = VH / cam.z, m = 110 / cam.z;
  cam.x = vw > W + 2 * m ? (W - vw) / 2 : clamp(cam.x, -m, W - vw + m);
  cam.y = vh > H + 2 * m ? (H - vh) / 2 : clamp(cam.y, -m, H - vh + m);
}
function centerOn(x, y) { cam.x = x - VW / cam.z / 2; cam.y = y - VH / cam.z / 2; clampCam(); }
const toWorld = (sx, sy) => ({ x: cam.x + sx / cam.z, y: cam.y + sy / cam.z });

function glyph(c, type, s) {
  c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineCap = 'round'; c.lineWidth = 2.2 * s;
  const L = (a, b, d, e) => { c.beginPath(); c.moveTo(a * s, b * s); c.lineTo(d * s, e * s); c.stroke(); };
  switch (type) {
    case 'rifle': L(-5, 5, 5, -5); L(2, -6, 6, -2); break;
    case 'mg': L(-6, -1, 6, -1); L(-1, -1, -5, 5); L(-1, -1, 3, 5); break;
    case 'piat': c.lineWidth = 3.4 * s; L(-6, 3, 4, -2); c.beginPath(); c.arc(5 * s, -2.5 * s, 2.3 * s, 0, TAU); c.fill(); break;
    case 'sniper': c.lineWidth = 1.6 * s; c.beginPath(); c.arc(0, 0, 4.5 * s, 0, TAU); c.stroke(); L(-7, 0, 7, 0); L(0, -7, 0, 7); break;
    case 'mortar': c.lineWidth = 3 * s; L(-1, 5, 3, -5); c.lineWidth = 2 * s; L(-6, 5, 6, 5); break;
    case 'officer': {
      c.beginPath();
      for (let i = 0; i < 10; i++) { const r = (i % 2 ? 2.6 : 6) * s, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fill(); break;
    }
  }
}
function drawUnitBody(c, u, x, y, s, alpha) {
  c.save(); c.translate(x, y); c.globalAlpha = alpha;
  if (u.veh) {
    c.rotate(u.ang);
    const L = u.type === 'stug' ? 32 : 30, Wd = u.type === 'stug' ? 19 : 15;
    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(-L / 2 * s + 3, -Wd / 2 * s + 3, L * s, Wd * s);
    c.fillStyle = MCOL[u.state]; c.fillRect(-L / 2 * s - 2.5, -Wd / 2 * s - 2.5, L * s + 5, Wd * s + 5);
    c.fillStyle = SIDE_COL[u.side]; c.fillRect(-L / 2 * s, -Wd / 2 * s, L * s, Wd * s);
    c.fillStyle = SIDE_COL_D[u.side];
    if (u.type === 'stug') {
      c.fillRect(-9 * s, -7 * s, 16 * s, 14 * s);
      c.strokeStyle = '#2a2f33'; c.lineWidth = 3.5 * s; c.beginPath(); c.moveTo(6 * s, 0); c.lineTo(24 * s, 0); c.stroke();
    } else {
      c.fillRect(-13 * s, -5 * s, 18 * s, 10 * s);
      c.fillStyle = '#222'; c.fillRect(9 * s, -9 * s, 5 * s, 3 * s); c.fillRect(9 * s, 6 * s, 5 * s, 3 * s);
      c.strokeStyle = '#ddd'; c.lineWidth = 1.6 * s; c.beginPath(); c.moveTo(4 * s, 0); c.lineTo(12 * s, 0); c.stroke();
    }
  } else {
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(2 * s, 2 * s, 12 * s, 0, TAU); c.fill();
    c.beginPath(); c.arc(0, 0, 12.5 * s, 0, TAU); c.strokeStyle = MCOL[u.state]; c.lineWidth = 3.5 * s; c.stroke();
    c.beginPath(); c.arc(0, 0, 10 * s, 0, TAU); c.fillStyle = SIDE_COL[u.side]; c.fill();
    glyph(c, u.type, s);
  }
  c.restore();
}
function drawUnit(c, u, s) {
  const x = u.x, y = u.y;
  if (u.flash > 0) { c.fillStyle = 'rgba(255,230,140,.9)'; c.beginPath(); c.arc(x, y, 15 * s, 0, TAU); c.fill(); }
  drawUnitBody(c, u, x, y, s, 1);
  // hp bar
  const bw = 24 * s, by = y - 21 * s, f = u.hp / u.maxHp;
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 4.5 * s + 2);
  c.fillStyle = f > 0.6 ? '#8bd35a' : f > 0.3 ? '#e6c83a' : '#e8402f'; c.fillRect(x - bw / 2, by, bw * f, 4.5 * s);
  // status marks
  c.font = `bold ${12 * s}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  if (u.state === 3) { c.fillStyle = '#e8402f'; c.fillText('!', x + 15 * s, y - 10 * s); }
  if (u.state === 4) { c.fillStyle = '#fff'; c.fillText('✕', x + 15 * s, y - 10 * s); }
  if (u.state === 2) { c.fillStyle = MCOL[2]; c.beginPath(); c.moveTo(x + 11 * s, y - 14 * s); c.lineTo(x + 19 * s, y - 14 * s); c.lineTo(x + 15 * s, y - 8 * s); c.fill(); }
  if (u.side === 0) {
    const am = u.ammo / u.ammoMax;
    if (am < 0.25) { c.fillStyle = u.ammo <= 0 ? '#e8402f' : '#e6c83a'; c.fillRect(x + 10 * s, y + 8 * s, 5 * s, 5 * s); }
    if (u.order.type === 'hold') {
      c.fillStyle = '#dfe8ff'; c.beginPath(); c.moveTo(x - 17 * s, y - 13 * s); c.lineTo(x - 11 * s, y - 13 * s); c.lineTo(x - 11 * s, y - 8 * s); c.lineTo(x - 14 * s, y - 5 * s); c.lineTo(x - 17 * s, y - 8 * s); c.fill();
    }
  }
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2b311f'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, -cam.x * cam.z * DPR, -cam.y * cam.z * DPR);
  ctx.drawImage(mapCv, 0, 0, W, H);
  const s = Math.max(1, 0.8 / cam.z);
  // flags
  for (const f of G.flags) {
    ctx.beginPath(); ctx.arc(f.x, f.y, CAP_R, 0, TAU);
    ctx.fillStyle = f.owner === 0 ? 'rgba(184,68,63,.13)' : f.owner === 1 ? 'rgba(86,100,109,.18)' : 'rgba(255,255,255,.08)'; ctx.fill();
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    if (f.prog > 0) { ctx.beginPath(); ctx.arc(f.x, f.y, CAP_R, -Math.PI / 2, -Math.PI / 2 + TAU * f.prog); ctx.strokeStyle = SIDE_COL[f.capSide] || '#fff'; ctx.lineWidth = 5; ctx.stroke(); }
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(f.x, f.y + 4 * s); ctx.lineTo(f.x, f.y - 22 * s); ctx.stroke();
    ctx.fillStyle = f.owner === 0 ? SIDE_COL[0] : f.owner === 1 ? SIDE_COL[1] : '#f0f0f0';
    ctx.beginPath(); ctx.moveTo(f.x, f.y - 22 * s); ctx.lineTo(f.x + 16 * s, f.y - 16 * s); ctx.lineTo(f.x, f.y - 10 * s); ctx.fill();
  }
  // dead
  for (const u of G.units) if (!u.alive && u.deadSeen) {
    ctx.strokeStyle = u.veh ? 'rgba(20,20,20,.8)' : 'rgba(40,30,25,.55)'; ctx.lineWidth = u.veh ? 9 : 3;
    const r = u.veh ? 12 : 6;
    ctx.beginPath(); ctx.moveTo(u.x - r, u.y - r); ctx.lineTo(u.x + r, u.y + r); ctx.moveTo(u.x + r, u.y - r); ctx.lineTo(u.x - r, u.y + r); ctx.stroke();
  }
  // ghosts
  for (const g of G.ghosts) {
    const a = 1 - (G.time - g.t) / 8;
    ctx.globalAlpha = a * 0.6; ctx.setLineDash([3, 3]); ctx.strokeStyle = '#d8dde0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(g.x, g.y, 11 * s, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#d8dde0'; ctx.font = `bold ${11 * s}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', g.x, g.y);
    ctx.globalAlpha = 1;
  }
  // selection overlays: paths, targets, ranges
  for (const u of G.sel) {
    if (G.pend === 'fire' || G.pend === 'smoke') {
      const r = G.pend === 'smoke' ? (u.smokeRounds > 0 ? WPN.mortar.range : 110) : WPN[u.t.w].range;
      ctx.beginPath(); ctx.arc(u.x, u.y, r, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (u.path.length) {
      ctx.setLineDash([7, 6]); ctx.lineWidth = 2;
      ctx.strokeStyle = u.mode === 'fast' ? 'rgba(255,220,90,.85)' : u.mode === 'sneak' ? 'rgba(120,220,255,.85)' : 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.moveTo(u.x, u.y); for (const p of u.path) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
    }
    if (u.order.type === 'fire' && live(u.order.target)) {
      ctx.strokeStyle = 'rgba(255,80,60,.75)'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.order.target.x, u.order.target.y); ctx.stroke(); ctx.setLineDash([]);
    }
    if (u.order.type === 'area') {
      ctx.strokeStyle = 'rgba(255,80,60,.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u.order.x, u.order.y, 45, 0, TAU); ctx.stroke();
    }
  }
  // units
  for (const u of G.units) {
    if (!live(u)) continue;
    if (u.side === 1 && !isSeen(u, 0) && !G.over) continue;
    if (G.sel.includes(u)) {
      ctx.beginPath(); ctx.arc(u.x, u.y, (u.veh ? 24 : 18) * s, 0, TAU); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    drawUnit(ctx, u, s);
  }
  // shells in flight
  for (const sh of G.shells) {
    const t = clamp(sh.t / sh.dur, 0, 1);
    const x = sh.x0 + (sh.x - sh.x0) * t, y = sh.y0 + (sh.y - sh.y0) * t - (sh.arc ? Math.sin(t * Math.PI) * 60 : 0);
    if (sh.src.side === 1 && !isSeen(sh.src, 0) && t < 0.6) continue;
    ctx.fillStyle = sh.kind === 'smoke' ? '#ddd' : '#222'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
  }
  // tracers
  for (const t of G.tracers) {
    const shooter = G.units[t.sid];
    const vis = t.side === 0 || isSeen(shooter, 0);
    const a = 1 - t.t / 0.16, f0 = vis ? 0 : 0.6;
    ctx.strokeStyle = t.side === 0 ? `rgba(255,220,120,${a})` : `rgba(230,240,255,${a})`; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(t.x1 + (t.x2 - t.x1) * f0, t.y1 + (t.y2 - t.y1) * f0); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  // explosions
  for (const b of G.booms) {
    const k = b.t / 0.6;
    ctx.fillStyle = `rgba(255,${Math.round(200 - k * 150)},60,${0.85 * (1 - k)})`;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.4 + k * 0.8), 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(40,30,20,${0.6 * (1 - k)})`; ctx.lineWidth = 3; ctx.stroke();
  }
  // smoke
  for (const sm of G.smokes) {
    const fade = Math.min(1, (sm.life - sm.age) / 4);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6 + sm.age * 0.05, ox = Math.cos(a) * sm.r * 0.35, oy = Math.sin(a) * sm.r * 0.35;
      ctx.fillStyle = `rgba(225,225,220,${0.32 * fade})`; ctx.beginPath(); ctx.arc(sm.x + ox, sm.y + oy, sm.r * 0.75, 0, TAU); ctx.fill();
    }
  }
  // order markers
  for (const m of G.markers) {
    const a = 1 - m.t / 1.2;
    ctx.strokeStyle = m.kind === 'no' ? `rgba(255,60,60,${a})` : m.kind === 'fire' || m.kind === 'area' ? `rgba(255,90,60,${a})` : `rgba(255,255,255,${a})`;
    ctx.lineWidth = 2.5;
    if (m.kind === 'no') { ctx.beginPath(); ctx.moveTo(m.x - 10, m.y - 10); ctx.lineTo(m.x + 10, m.y + 10); ctx.moveTo(m.x + 10, m.y - 10); ctx.lineTo(m.x - 10, m.y + 10); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(m.x, m.y, 8 + m.t * 20, 0, TAU); ctx.stroke(); }
  }
}

// ---------------------------------------------------------------- input
const ptrs = new Map();
let gest = null;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture?.(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) gest = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, panned: false, pinched: false };
  else if (ptrs.size === 2 && gest) {
    const [a, b] = [...ptrs.values()];
    gest.pinched = true;
    gest.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; gest.z0 = cam.z;
    gest.mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId) || !gest) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size >= 2 && gest.pinched) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.z = gest.z0 * d / gest.d0; clampCam();
    cam.x = gest.mid.x - mx / cam.z; cam.y = gest.mid.y - my / cam.z; clampCam();
  } else if (ptrs.size === 1 && !gest.pinched) {
    const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
    if (!gest.panned && Math.hypot(dx, dy) > 10) gest.panned = true;
    if (gest.panned) { cam.x = gest.cx - dx / cam.z; cam.y = gest.cy - dy / cam.z; clampCam(); }
  }
});
const endPtr = (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (gest && ptrs.size === 0) {
    if (!gest.panned && !gest.pinched && e.type === 'pointerup') tap(e.clientX, e.clientY);
    gest = null;
  }
};
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const w0 = toWorld(e.clientX, e.clientY);
  cam.z *= e.deltaY < 0 ? 1.12 : 1 / 1.12; clampCam();
  cam.x = w0.x - e.clientX / cam.z; cam.y = w0.y - e.clientY / cam.z; clampCam();
}, { passive: false });

function unitAt(wx, wy) {
  const r = Math.max(20, 26 / cam.z);
  let best = null, bd = r;
  for (const u of G.units) {
    if (!live(u)) continue;
    if (u.side === 1 && !isSeen(u, 0)) continue;
    const d = dxy(u.x, u.y, wx, wy) - (u.side === 0 ? 2 : 0);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
function tap(sx, sy) {
  if (!G.running || G.over) return;
  const p = toWorld(sx, sy);
  const u = unitAt(p.x, p.y);
  const sel = G.sel.filter(s => live(s) && s.state < 4);
  if (u && u.side === 0) {
    if (G.sel.length === 1 && G.sel[0] === u) G.sel = [];
    else G.sel = [u];
    G.pend = 'move'; refreshUI(true); return;
  }
  if (!sel.length) return;
  if (u && u.side === 1) { issueFire(sel, u); G.pend = 'move'; refreshUI(true); return; }
  if (G.pend === 'fire') issueArea(sel, p.x, p.y);
  else if (G.pend === 'smoke') issueSmoke(sel, p.x, p.y);
  else issueMove(sel, p.x, p.y, G.pend);
  G.pend = 'move'; refreshUI(true);
}

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
const rosterEl = $('roster'), infoEl = $('info'), toastEl = $('toast');
const orderBtns = [...document.querySelectorAll('#orders button')];
let toastTimer = 0;
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg; toastEl.style.opacity = '1';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (toastEl.style.opacity = '0'), 1800);
}
function buildLegend(el) {
  el.innerHTML = MNAME.map((n, i) => `<div><span class="ring" style="border-color:${MCOL[i]}"></span>${n}</div>`).join('');
}
buildLegend($('legend1')); buildLegend($('legend2'));
let chips = [];
function buildRoster() {
  rosterEl.innerHTML = '';
  chips = G.units.filter(u => u.side === 0).map(u => {
    const b = document.createElement('button');
    b.className = 'chip'; b.title = u.name;
    const c = document.createElement('canvas'); c.width = 76; c.height = 76;
    const bar = document.createElement('i'); bar.innerHTML = '<b></b>';
    b.append(c, bar);
    let lastTap = 0;
    b.addEventListener('click', () => {
      if (!live(u) || u.state >= 4) return;
      const now = performance.now();
      if (G.sel.length === 1 && G.sel[0] === u && now - lastTap < 600) centerOn(u.x, u.y);
      else if (G.sel.length === 1 && G.sel[0] === u) centerOn(u.x, u.y);
      G.sel = [u]; G.pend = 'move'; lastTap = now; refreshUI(true);
    });
    rosterEl.append(b);
    return { u, b, c, bar: bar.firstChild, key: '' };
  });
}
function refreshUI(force) {
  for (const ch of chips) {
    const u = ch.u, key = [u.state, Math.round(u.hp), u.alive, u.fled, G.sel.includes(u)].join();
    if (!force && key === ch.key) continue;
    ch.key = key;
    const g = ch.c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 76, 76);
    g.setTransform(2, 0, 0, 2, 0, 0);
    drawUnitBody(g, Object.assign({}, u, { ang: 0 }), 19, 18, u.veh ? 0.9 : 1.2, 1);
    ch.b.style.borderColor = MCOL[u.state];
    ch.bar.style.width = (100 * Math.max(0, u.hp) / u.maxHp) + '%';
    ch.b.classList.toggle('dead', !live(u) || u.state === 4);
    ch.b.classList.toggle('sel', G.sel.includes(u));
  }
  G.sel = G.sel.filter(u => live(u) && u.state < 4);
  const any = G.sel.length > 0;
  for (const b of orderBtns) {
    const o = b.dataset.o;
    b.classList.toggle('on', any && G.pend === o && o !== 'move');
    b.disabled = !any || (o === 'smoke' && !G.sel.some(u => u.smoke > 0 || u.smokeRounds > 0));
  }
  if (G.sel.length === 1) {
    const u = G.sel[0];
    const ammo = u.t.at ? `${u.ammo} · AT ${u.ammo2}` : u.smokeRounds ? `${u.ammo} · 💨${u.smokeRounds}` : `${u.ammo}`;
    infoEl.innerHTML = `${'★'.repeat(u.exp + 1)} ${u.name} · <b style="color:${MCOL[u.state]}">${MNAME[u.state]}</b> · ⁍${ammo}${u.smoke ? ' · 💨' + u.smoke : ''}`;
    infoEl.style.display = 'block';
  } else if (G.sel.length > 1) { infoEl.textContent = `👥 ${G.sel.length} units`; infoEl.style.display = 'block'; }
  else infoEl.style.display = 'none';
  const rem = Math.max(0, GAME_TIME - G.time);
  $('clock').textContent = `${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, '0')}`;
  $('clock').style.color = rem < 60 ? '#ffb347' : '';
  G.flags.forEach((f, i) => { $('fl' + i).className = 'fl ' + (f.owner === 0 ? 'o0' : f.owner === 1 ? 'o1' : 'on'); });
  $('bPause').textContent = G.paused ? '▶' : '⏸';
  $('pausedTag').style.display = G.paused && G.running && !G.over ? 'block' : 'none';
  $('bSpeed').textContent = G.speed + 'x';
}
orderBtns.forEach(b => b.addEventListener('click', () => {
  const o = b.dataset.o;
  if (!G.sel.length) return;
  if (o === 'hold') { issueHold(G.sel); G.pend = 'move'; toast('🛡 Hold'); }
  else G.pend = G.pend === o ? 'move' : o;
  refreshUI(true);
}));
$('bPause').addEventListener('click', () => { if (G.running && !G.over) { G.paused = !G.paused; refreshUI(true); } });
$('bSpeed').addEventListener('click', () => { G.speed = G.speed === 1 ? 2 : 1; refreshUI(true); });
$('bAll').addEventListener('click', () => {
  const all = G.units.filter(u => u.side === 0 && live(u) && u.state < 3);
  G.sel = G.sel.length === all.length ? [] : all; G.pend = 'move'; refreshUI(true);
});
$('bHelp').addEventListener('click', () => { $('ovHelp').classList.remove('hidden'); if (G.running && !G.over) G.paused = true; refreshUI(true); });
$('bHelpClose').addEventListener('click', () => { $('ovHelp').classList.add('hidden'); });
$('bStart').addEventListener('click', () => startGame(false));
$('bRematch').addEventListener('click', () => startGame(G.auto));
document.addEventListener('visibilitychange', () => { if (document.hidden && G.running && !G.over) { G.paused = true; refreshUI(true); } });

function endGame(res, rout) {
  if (G.over) return;
  G.over = true; G.result = res; G.sel = [];
  const titles = { win: 'Victory', lose: 'Defeat', draw: 'Stalemate' }, icons = { win: '🏆', lose: '🏳️', draw: '🤝' };
  $('endIcon').textContent = icons[res];
  $('endTitle').textContent = titles[res];
  $('endFlags').innerHTML = G.flags.map(f => `<span class="fl ${f.owner === 0 ? 'o0' : f.owner === 1 ? 'o1' : 'on'}">${f.name[0]}</span>`).join('');
  const lost = (s) => G.units.filter(u => u.side === s && (!u.alive || u.fled || u.state === 4)).length;
  $('endStats').innerHTML = `${rout ? (res === 'win' ? 'Enemy broken<br>' : res === 'lose' ? 'Your force broke<br>' : '') : '⏱ Time up<br>'}` +
    `<span style="color:${SIDE_COL[0]}">■</span> Airborne lost ${lost(0)}/8 &nbsp; <span style="color:#9fb0ba">■</span> Enemy lost ${lost(1)}/8`;
  setTimeout(() => $('ovEnd').classList.remove('hidden'), 700);
  refreshUI(true);
}
function startGame(auto) {
  newGame(auto);
  G.running = true;
  ['ovStart', 'ovEnd', 'ovHelp'].forEach(id => $(id).classList.add('hidden'));
  const z0 = clamp(Math.max(VW, VH) / 1400, 0.45, 1.3);
  cam.z = z0; centerOn(720, 520);
  buildRoster(); refreshUI(true);
}

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0, uiT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (G.running && !G.paused && !G.over) {
    acc += dt * G.speed;
    let n = 0;
    while (acc >= DT && n < 12) { step(); acc -= DT; n++; }
    if (n >= 12) acc = 0;
  }
  render();
  uiT -= dt; if (uiT <= 0) { uiT = 0.2; refreshUI(false); }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
drawMap();
newGame(false);
resize();
cam.z = clamp(Math.max(VW, VH) / 1400, 0.45, 1.3); centerOn(900, 550);
requestAnimationFrame(frame);

// test / debug hooks (harmless in normal play)
window.BTF = {
  G, start: startGame, step,
  fast(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n && !G.over; i++) step(); refreshUI(true); return G.time; },
  tap, toWorld, cam, centerOn, findPath, LOS, coverAt,
};
const qs = new URLSearchParams(location.search);
if (qs.get('auto') === '1') startGame(true);
})();
