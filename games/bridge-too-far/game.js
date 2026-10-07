/* Bridge Too Far v3: a small real-time squad tactics game for phones.
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
const VERSION = 'v3.0';
const ZONE = { x0: 20, y0: 20, x1: 780, y1: 1080 };  // British drop zone (deploy + resupply)
const BRIDGE_END = { x0: 780, y0: BY0 + 4, x1: 862, y1: BY1 - 4 }; // the airborne also hold the bridge's west end
const GZONE_X = 1240;                                  // German rear area (resupply)

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
  rifle:  { range: 330, eff: 0.5, rof: 1.7, acc: 0.5, dmg: 13, supp: 5, arm: [1, 0.15, 0] },
  smg:    { range: 200, eff: 0.5, rof: 1.1, acc: 0.5, dmg: 10, supp: 4, arm: [1, 0.12, 0] },
  mg:     { range: 420, eff: 0.5, rof: 0.55, acc: 0.36, dmg: 8, supp: 6, arm: [1, 0.25, 0] },
  sniper: { range: 560, eff: 0.7, rof: 4.5, acc: 0.85, dmg: 30, supp: 9, fall: 0.25, arm: [1, 0.1, 0] },
  mortar: { range: 600, min: 110, rof: 6, indirect: true, he: true, dmg: 26, splash: 36, supp: 24, arm: [1, 0.5, 0.12] },
  piat:   { range: 150, eff: 0.6, rof: 6.5, acc: 0.75, he: true, dmg: 80, splash: 16, supp: 22, arm: [0.5, 1, 1] },
  gun:    { range: 420, eff: 0.5, rof: 9, acc: 0.5, he: true, dmg: 28, splash: 26, supp: 24, arm: [1, 1, 1] },
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
// [type, name, exp, role]
const B_ROSTER = [
  ['officer', 'Lt. Ashby', 2], ['rifle', '1 Section', 2], ['rifle', '2 Section', 2], ['rifle', '3 Section', 1, 'guard'],
  ['mg', 'Bren team', 1], ['piat', 'PIAT team', 1], ['sniper', 'Sniper', 2], ['mortar', 'Mortar', 1],
];
const G_ROSTER = [
  ['officer', 'Leutnant', 1], ['rifle', 'Gruppe A', 1], ['rifle', 'Gruppe B', 0], ['rifle', 'Gruppe C', 2, 'guard'],
  ['mg', 'MG team', 2], ['mortar', 'Mortar', 1], ['halftrack', 'Half-track', 1], ['stug', 'Assault gun', 1],
];
// British deploy presets (same order as B_ROSTER)
const B_SETUPS = [
  [[665, 470], [856, 572], [720, 640], [400, 315], [730, 440], [765, 650], [720, 280], [540, 650]],   // bridge watch
  [[700, 625], [856, 528], [856, 572], [400, 300], [740, 455], [770, 640], [690, 285], [530, 450]],   // forward line
  [[520, 450], [720, 430], [856, 572], [410, 300], [765, 665], [700, 660], [730, 130], [540, 680]],   // depth
];
// German setups (same order as G_ROSTER) + seconds before the assault starts
const G_SETUPS = [
  { name: 'bridgehead', delay: 0,  pos: [[1290, 670], [1100, 450], [1095, 655], [1465, 825], [1100, 285], [1580, 460], [1600, 550], [1730, 550]] },
  { name: 'standard',   delay: 15, pos: [[1290, 670], [1100, 280], [1105, 850], [1465, 825], [1300, 440], [1580, 460], [1600, 550], [1730, 550]] },
  { name: 'north',      delay: 25, pos: [[1300, 440], [1125, 130], [1100, 280], [1465, 825], [1300, 185], [1460, 280], [1650, 360], [1600, 550]] },
  { name: 'south',      delay: 40, pos: [[1290, 670], [1105, 850], [1300, 870], [1465, 825], [1100, 655], [1560, 760], [1650, 800], [1730, 550]] },
];
const DIFFS = {
  // pushT: seconds left when the late German push on the Bridge starts; digS: how close to the
  // objective the scripted British support teams stay dug in (AI-vs-AI harness only)
  easy:   { acc: 0.82, think: 1.5, stay: 0.8, reinf: ['rifle'], reinfT: 330, exp: -1, pushT: 110, digS: 300 },
  normal: { acc: 1.0, think: 1.0, stay: 0.65, reinf: ['rifle', 'mg', 'rifle'], reinfT: 250, exp: 0, pushT: 150, digS: 300 },
  hard:   { acc: 1.12, think: 0.7, stay: 0.5, reinf: ['rifle', 'mg', 'rifle', 'rifle'], reinfT: 210, exp: 1, pushT: 170, digS: 300 },
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

// haptics (feature-detected; iOS Safari has no vibrate, so this is a no-op there)
const HAPTIC_OK = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
let hapticOn = store.get('btf-haptic', '1') === '1';
let buzzT = 0;
function buzz(pat) {
  if (!HAPTIC_OK || !hapticOn || G.auto || G.silent) return;
  const now = performance.now();
  if (now - buzzT < 120) return;
  buzzT = now;
  try { navigator.vibrate(pat); } catch (e) { /* ignore */ }
}
// veterans: experience carried between battles (per roster slot)
const VETS_KEY = 'btf-vets';
function loadVets() {
  try { const v = JSON.parse(store.get(VETS_KEY, '') || 'null'); if (v && Array.isArray(v.exp)) return v; } catch (e) { /* bad data */ }
  return null;
}
const saveVets = (v) => store.set(VETS_KEY, v ? JSON.stringify(v) : '');

// ---------------------------------------------------------------- game state
const G = { diff: store.get('btf-diff', 'normal'), ringsAll: store.get('btf-rings', '0') === '1' };
if (!DIFFS[G.diff]) G.diff = 'normal';
function mkUnit(side, type, name, x, y, exp, role) {
  const t = UT[type];
  return {
    id: G.units.length, side, type, name, x, y, exp, t,
    hp: t.hp, maxHp: t.hp, morale: 82 + exp * 6, state: 0,
    ammo: t.ammo, ammoMax: t.ammo, ammo2: t.ammo2 || 0, ammo2Max: t.ammo2 || 0,
    smoke: t.smoke || 0, smokeRounds: t.smokeRounds || 0, ammoF: 0, resT: 0,
    veh: !!t.veh, armor: t.armor || 0, ang: side ? Math.PI : 0,
    path: [], mode: 'move', order: { type: 'idle' },
    cool: rnd(0, 1), cool2: 0, lastFired: -99, lastHit: -99, threat: null,
    alive: true, fled: false, moving: false, seenUntil: [-1, -1], wasSeen: false,
    role: role || t.role, aiCool: rnd(0, 2), kills: 0, flash: 0, deadSeen: false, fleeT: 0, rallyT: 0, fT: {},
  };
}
function newGame(auto) {
  Object.assign(G, {
    units: [], smokes: [], shells: [], tracers: [], booms: [], markers: [], ghosts: [], floaters: [],
    los: new Map(), time: 0, running: true, paused: false, over: false, result: null, phase: 'deploy',
    auto: !!auto, sel: [], pend: 'move', speed: G.speed || 1, visT: 0, aiT: 0, flagT: 0, shake: 0,
    reinfDone: false, preview: null, bSetup: Math.floor(Math.random() * B_SETUPS.length),
    aim: null, inspect: null, flagLog: [], logT: 0, pushAt: null, reinfAt: null,
    ai: [{ smokeCd: 60, holdUntil: 0 }, { smokeCd: 40, holdUntil: 0 }],
    stats: { dead: [0, 0], fled: [0, 0], rallied: [0, 0] },
  });
  const D = DIFFS[G.diff];
  // the airborne seized the West village and the bridge; the Germans hold the East
  G.flags = FLAG_POS.map(([x, y], i) => ({ x, y, owner: i === 2 ? 1 : 0, prog: 0, capSide: -1, contested: false, name: ['West', 'Bridge', 'East'][i] }));
  const bs = B_SETUPS[G.bSetup];
  const vets = auto ? null : loadVets();
  B_ROSTER.forEach((r, i) => {
    const e = vets ? clamp(vets.exp[i] ?? r[2], 0, 2) : r[2];
    const u = mkUnit(0, r[0], r[1], bs[i][0], bs[i][1], e, r[3]);
    u.slot = i; u.exp0 = e; u.med = (vets && vets.med && vets.med[i]) || 0;
    G.units.push(u);
  });
  const gs = G_SETUPS[Math.floor(Math.random() * G_SETUPS.length)];
  G.gSetup = gs.name; G.ai[1].holdUntil = gs.delay;
  G_ROSTER.forEach((r, i) => {
    let [x, y] = gs.pos[i];
    const u = mkUnit(1, r[0], r[1], x, y, clamp(r[2] + D.exp, 0, 2), r[3]);
    if (!u.veh) { const c = coverNear(x, y, 30, 1, null, u); if (c) { u.x = c.x; u.y = c.y; } }
    else { u.x += rnd(-20, 20); u.y += rnd(-15, 15); if (!passAt(u.x, u.y, true)) { u.x = x; u.y = y; } }
    G.units.push(u);
  });
  jitterBritish();
  updateVis();
}
function jitterBritish() {
  const bs = B_SETUPS[G.bSetup];
  G.units.filter(u => u.side === 0).forEach((u, i) => {
    u.x = bs[i][0]; u.y = bs[i][1];
    const c = coverNear(u.x, u.y, inBridgeEnd(u.x, u.y) ? 8 : 25, 0, null, u);
    if (c && inZone(c.x, c.y)) { u.x = c.x; u.y = c.y; }
  });
}
const live = (u) => u.alive && !u.fled;
const isSeen = (o, side) => o.side === side || o.seenUntil[side] > G.time;
const inHouse = (u) => terrAt(u.x, u.y) === T_HOUSE;

// ---------------------------------------------------------------- line of sight & spotting
// returns 0 when blocked, otherwise a visibility factor (hedges/walls in between thin it out)
function sight(ax, ay, bx, by) {
  const ha = houseAt(ax, ay), hb = houseAt(bx, by);
  const d = dxy(ax, ay, bx, by), n = Math.ceil(d / 6);
  let trees = 0, f = 1, inH = false;
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
    const k = cellIdx(x, y);
    const h = hid[k];
    if (h && h !== ha && h !== hb) return 0;
    const t = terr[k];
    if (t === T_TREE && i > 3 && i < n - 3 && ++trees > 5) return 0;
    if ((t === T_HEDGE || t === T_WALL) && i > 2 && i < n - 2) { if (!inH) { f *= 0.55; inH = true; } }
    else inH = false;
  }
  for (const s of G.smokes) {
    if (s.r < 16 || s.age > s.life - 3) continue;
    if (segDist(s.x, s.y, ax, ay, bx, by) < s.r * 0.85) return 0;
  }
  return f;
}
const LOS = (ax, ay, bx, by) => sight(ax, ay, bx, by) > 0;
const losKey = (a, b) => (a.side === 0 ? a.id * 64 + b.id : b.id * 64 + a.id);
function losU(a, b) { return a.side === b.side ? 1 : (G.los.get(losKey(a, b)) || 0); }

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
  if (!a.veh && inHouse(a)) r *= 1.15; // upstairs windows
  return Math.max(r, 70);
}
function updateVis() {
  G.los.clear();
  const A = G.units.filter(live);
  const s0 = A.filter(u => u.side === 0), s1 = A.filter(u => u.side === 1);
  for (const a of s0) for (const b of s1) {
    if (dist(a, b) < 720) G.los.set(losKey(a, b), sight(a.x, a.y, b.x, b.y));
  }
  for (const [mine, theirs, s] of [[s0, s1, 0], [s1, s0, 1]]) {
    for (const b of theirs) {
      for (const a of mine) {
        const f = losU(a, b);
        if (f > 0 && dist(a, b) <= Math.max(60, spotRange(a, b) * f)) { b.seenUntil[s] = G.time + 1.0; break; }
      }
    }
  }
  for (const b of s1) {
    const now = isSeen(b, 0);
    if (b.wasSeen && !now) G.ghosts.push({ x: b.x, y: b.y, t: G.time, veh: b.veh });
    b.wasSeen = now;
  }
  G.ghosts = G.ghosts.filter(g => G.time - g.t < 8);
}

// ---------------------------------------------------------------- floating icons
const FLOAT_CD = { hit: 0.7, sup: 1.6, pin: 2, panic: 2, star: 1, ammo: 6, broken: 2 };
function floater(u, kind) {
  if (!(u.side === 0 || isSeen(u, 0))) return;
  if (G.time - (u.fT[kind] ?? -99) < FLOAT_CD[kind]) return;
  u.fT[kind] = G.time;
  G.floaters.push({ x: u.x + rnd(-4, 4), y: u.y, kind, t: 0 });
}

// ---------------------------------------------------------------- combat
function hitChance(u, w, d, o, losF) {
  let p = w.acc * (1 - (d / w.range) * (w.fall ?? 0.6));
  if (o.veh) p *= 1.5;
  else {
    p *= [1, 0.55, 0.32][coverAt(o.x, o.y)];
    if (o.moving) p *= (o.mode === 'fast' || o.state >= 3) ? 1.25 : o.mode === 'sneak' ? 0.7 : 1.0;
    else p *= 0.85;
  }
  if (!w.indirect) p *= 0.6 + 0.4 * (losF ?? losU(u, o)); // shooting through hedges
  if (u.veh) p *= 0.8;
  if (u.moving) p *= u.veh ? 0.6 : u.mode === 'sneak' ? 0.6 : 0.5;
  else if (!u.veh && inHouse(u)) p *= 1.15;           // garrison bonus
  p *= [1, 0.75, 0.4, 0, 0][u.state];
  p *= [0.85, 1, 1.15][u.exp];
  if (u.order.type === 'hold' && !u.moving) p *= 1.15;
  if (u.side === 1) p *= DIFFS[G.diff].acc;
  return clamp(p, 0.02, 0.95);
}
function suppress(o, amt, src) {
  if (!o.alive || amt <= 0) return;
  let m = [1.2, 1, 0.8][o.exp] * (o.veh ? 0.12 : [1, 0.75, 0.55][coverAt(o.x, o.y)]);
  if (o.order.type === 'hold') m *= 0.9;
  if (o.morale > 3) o.morale = Math.max(3, o.morale - amt * m); // suppression alone can't break a unit
  o.lastHit = G.time;
  o.threat = { x: src.x, y: src.y, id: src.id };
  if (!o.veh && amt * m > 3) floater(o, 'sup');
}
function damage(o, amt, src) {
  if (!o.alive || amt <= 0.05) return;
  o.hp -= amt;
  o.morale -= amt * 0.6 * [1.2, 1, 0.8][o.exp];
  if (o.veh && amt >= 30) o.morale -= 25;
  o.lastHit = G.time;
  if (amt >= 2) floater(o, 'hit');
  if (o.hp <= 0) kill(o, src);
}
function kill(o, src) {
  o.alive = false; o.hp = 0; o.path = [];
  o.deadSeen = o.side === 0 || isSeen(o, 0) || G.time - o.lastFired < 3;
  G.stats.dead[o.side]++;
  if (src) src.kills++;
  for (const f of G.units) if (live(f) && f.side === o.side && dist(f, o) < 160) f.morale -= o.type === 'officer' ? 18 : 10;
  if (o.veh) { addBoom(o.x, o.y, 34); addSmoke(o.x, o.y, 22, 14); SFX.boom(o.x, o.y, 60); shakeAt(o.x, o.y, 10); }
  if (o.side === 0) { toast('✖ ' + o.name); buzz([50, 40, 50]); }
  else if (o.deadSeen) toast('✔ ' + o.name);
  if (o.veh && G.units.some(f => f.side === 0 && live(f) && dist(f, o) < 160)) buzz(40);
  G.sel = G.sel.filter(u => u !== o);
}
function shakeAt(x, y, amp) {
  const cx = cam.x + VW / cam.z / 2, cy = cam.y + VH / cam.z / 2;
  const half = Math.max(VW, VH) / cam.z / 2;
  G.shake = Math.max(G.shake, amp * clamp(1.3 - dxy(x, y, cx, cy) / (half * 1.4), 0, 1));
}
function addBoom(x, y, r) { G.booms.push({ x, y, r, t: 0 }); }
function addSmoke(x, y, maxR = 50, life = 28) { G.smokes.push({ x, y, r: 4, maxR, age: 0, life }); }
function tracer(u, x, y) { G.tracers.push({ x1: u.x, y1: u.y, x2: x, y2: y, t: 0, side: u.side, sid: u.id }); }

function fireWeapon(u, wk, x, y, tgt) {
  const w = WPN[wk];
  u.lastFired = G.time; u.flash = 0.08;
  if (u.side === 0 || isSeen(u, 0) || dxy(u.x, u.y, x, y) < 400) SFX.shot(wk, u);
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
  SFX.boom(x, y, w.splash);
  if (w.splash >= 26) {
    shakeAt(x, y, w === WPN.mortar ? 5 : 7);
    if (G.units.some(f => f.side === 0 && live(f) && dxy(f.x, f.y, x, y) < 110)) buzz(35);
  }
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
  if (!w.indirect && !(losU(u, o) > 0)) return false;
  if (w.arm[o.armor] <= 0.001) return false;
  return true;
}
function canAct(u) { return u.state < 3; }
function updateFire(u) {
  u.cool -= DT; u.cool2 -= DT; if (u.flash > 0) u.flash -= DT;
  if (!canAct(u)) return;
  if (u.moving && u.mode === 'fast' && !u.veh) return;
  const ord = u.order;
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
      if (w.indirect && G.units.some(f => live(f) && f.side === u.side && dxy(f.x, f.y, o.x, o.y) < 50)) continue;
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
  if (u.side === 0 && u.ammo === Math.floor(u.ammoMax * 0.2)) toast('⚠ ⁍ ' + u.name);
}
function updateShells() {
  for (const s of G.shells) {
    s.t += DT;
    if (s.arc && s.kind === 'he' && !s.wh && s.dur - s.t <= 0.95) { s.wh = true; SFX.whistle(s.x, s.y, s.dur - s.t); }
    if (s.t >= s.dur && !s.done) {
      s.done = true;
      if (s.kind === 'smoke') { addSmoke(s.x, s.y); SFX.puff(s.x, s.y); }
      else explode(s.x, s.y, s.w, s.src);
    }
  }
  G.shells = G.shells.filter(s => !s.done);
}

// ---------------------------------------------------------------- morale, rally, resupply
function officerNear(u, r = 170) {
  return G.units.find(o => o !== u && o.type === 'officer' && live(o) && o.side === u.side && o.state <= 1 && dist(o, u) < r);
}
const nearOfficer = (u) => !!officerNear(u);
function rallyCheck(u, off) {
  if (u.veh || u.type === 'officer') { u.rallyT = 0; return; }
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
  const off = nearOfficer(u);
  if (u.state >= 3) rallyCheck(u, off);
  if (u.state === 4) return;
  const hpf = u.hp / u.maxHp;
  const maxM = 35 + 60 * hpf + (off ? 10 : 0) + u.exp * 3;
  if (G.time - u.lastHit > 2.5) {
    const rec = (3 + u.exp * 1.5) * (off ? 2 : 1) * (u.type === 'officer' ? 1.3 : 1) * (inHouse(u) ? 1.25 : 1);
    if (u.morale < maxM) u.morale = Math.min(maxM, u.morale + rec * DT);
  }
  if (u.morale > maxM) u.morale = Math.max(maxM, u.morale - 1.5 * DT);
  u.morale = Math.min(u.morale, 100);
  let s = u.morale >= 62 ? 0 : u.morale >= 40 ? 1 : u.morale >= 18 ? 2 : u.morale > -12 ? 3 : 4;
  if (u.state === 3 && s === 2 && u.morale < 24) s = 3;
  if (u.veh && s === 2) s = 1;
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
function enterPanic(u) {
  u.fleeT = 4;
  const th = u.threat || { x: u.side === 0 ? u.x + 100 : u.x - 100, y: u.y };
  let vx = u.x - th.x, vy = u.y - th.y; const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
  vx += u.side === 0 ? -0.8 : 0.8;
  const l2 = Math.hypot(vx, vy) || 1;
  const ax = clamp(u.x + vx / l2 * 170, 20, W - 20), ay = clamp(u.y + vy / l2 * 170, 20, H - 20);
  const c = u.veh ? null : coverNear(ax, ay, 70, u.side);
  const p = findPath(u.x, u.y, c ? c.x : ax, c ? c.y : ay, u.veh);
  u.path = p || []; u.mode = 'fast'; u.order = { type: 'flee' };
  floater(u, 'panic');
  if (u.side === 0) toast('! ' + u.name);
}
function enterBroken(u) {
  u.state = 4; u.morale = -12; u.rallyT = 0;
  const p = findPath(u.x, u.y, homeX(u.side), u.y, u.veh);
  u.path = p || []; u.mode = 'fast'; u.order = { type: 'rout' };
  G.sel = G.sel.filter(s => s !== u);
  floater(u, 'broken');
  toast((u.side === 0 ? '🏳 ' : '✔ ') + u.name);
}
function resupply(u) {
  if (u.veh || u.state >= 3) return;
  const zone = u.side === 0 ? u.x < ZONE.x1 : u.x > GZONE_X;
  const off = u.type !== 'officer' && nearOfficer(u);
  if ((!zone && !off) || G.time - u.lastFired < 6) { u.resT = 0; return; }
  let gained = false;
  if (u.ammo < u.ammoMax) {
    const rate = (zone ? 0.02 : 0.012) * (u.type === 'mortar' ? 0.3 : 1);
    u.ammoF += u.ammoMax * rate * DT;
    while (u.ammoF >= 1 && u.ammo < u.ammoMax) { u.ammo++; u.ammoF--; gained = true; }
  }
  if (zone) {
    u.resT += DT;
    if (u.resT > 20) {
      u.resT = 0;
      if (u.ammo2 < u.ammo2Max) { u.ammo2++; gained = true; }
      if (u.type === 'mortar' && u.smokeRounds < 6) { u.smokeRounds++; gained = true; }
      if (u.smoke < (u.t.smoke || 0)) { u.smoke++; gained = true; }
    }
  }
  if (gained && u.side === 0) floater(u, 'ammo');
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
    if (Math.abs(da) > turn) { u.ang += Math.sign(da) * turn; if (Math.abs(da) > 0.6) { u.moving = true; return; } } else u.ang = want;
  }
  const d = dxy(u.x, u.y, p.x, p.y), stp = sp * DT;
  u.moving = true;
  if (d <= stp) {
    u.x = p.x; u.y = p.y; u.path.shift();
    if (!u.path.length) {
      if (u.order.type === 'move') u.order = { type: 'idle' };
      if (u.order.type === 'rout' && (u.x < 30 || u.x > W - 30)) { u.fled = true; G.stats.fled[u.side]++; }
    }
  } else { u.x += (p.x - u.x) / d * stp; u.y += (p.y - u.y) / d * stp; }
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

// ---------------------------------------------------------------- flags, reinforcements, effects
function updateFlags() {
  for (const f of G.flags) {
    // present = can block a capture; cap = can take it (steady/shaken and not under fire right now)
    const c = [0, 0], cap = [0, 0];
    for (const u of G.units) {
      if (!live(u) || u.state > 2 || dxy(u.x, u.y, f.x, f.y) >= CAP_R) continue;
      c[u.side]++;
      if (!u.veh && u.state <= 1 && G.time - u.lastHit > 1) cap[u.side]++; // only infantry take flags; vehicles just contest
    }
    f.contested = c[0] > 0 && c[1] > 0;
    const s = cap[0] && !c[1] ? 0 : cap[1] && !c[0] ? 1 : -1;
    if (s >= 0 && f.owner !== s) {
      if (f.capSide !== s) { f.capSide = s; f.prog = 0; }
      f.prog += DT / 7;
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
  const y0 = [300, 550, 800][Math.floor(Math.random() * 3)];
  D.reinf.forEach((type, i) => {
    const name = type === 'mg' ? 'MG team 2' : 'Gruppe ' + 'DEFG'[i];
    const u = mkUnit(1, type, name, W - 14 - i * 8, clamp(y0 + (i - 1) * 32, 30, H - 30), 1, type === 'mg' ? 'support' : 'assault');
    u.aiCool = 0.5 + i * 0.5;
    G.units.push(u);
  });
  G.reinfAt = { y: y0, t: G.time };
  if (!G.auto) { toast('⚠ ➕ ' + D.reinf.length); SFX.radio('alert'); }
}
function updateFx() {
  for (const s of G.smokes) { s.age += DT; s.r = Math.min(s.maxR, s.r + DT * 24); }
  G.smokes = G.smokes.filter(s => s.age < s.life);
  for (const t of G.tracers) t.t += DT;
  G.tracers = G.tracers.filter(t => t.t < 0.16);
  for (const b of G.booms) b.t += DT;
  G.booms = G.booms.filter(b => b.t < 0.6);
  for (const f of G.floaters) f.t += DT;
  G.floaters = G.floaters.filter(f => f.t < 1.3);
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
const pointAlong = (u, goal, len) => pointAlongFrom(u.x, u.y, goal, len, u.veh);
function aiMove(u, p, mode) {
  if (!p || dxy(u.x, u.y, p.x, p.y) < 12) return false;
  const path = findPath(u.x, u.y, p.x, p.y, u.veh);
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
    if (x < 20 || y < 20 || x > W - 20 || y > H - 20 || !passAt(x, y, false)) continue;
    if (dxy(x, y, home.x, home.y) > dist(obj, home) + 120) continue;
    let s = coverAt(x, y) * 40 + (LOS(x, y, obj.x, obj.y) ? 60 : 0) - dxy(x, y, u.x, u.y) * 0.05;
    const far = side === 1 ? x < RX0 : x > RX1, objFar = side === 1 ? obj.x < RX0 : obj.x > RX1;
    if (far && !objFar) s -= 50;
    for (const o of G.units) if (o !== u && live(o) && o.side === side && dxy(o.x, o.y, x, y) < 22) s -= 30;
    if (s > bs) { bs = s; best = { x, y }; }
  }
  return best ? (coverNear(best.x, best.y, 30, side, null, u) || best) : null;
}

function aiThink(side) {
  const D = DIFFS[G.diff];
  const mine = G.units.filter(u => live(u) && u.side === side && u.state < 3);
  if (!mine.length) return;
  const A = G.ai[side];
  const home = G.flags[side === 0 ? 0 : 2], enemyHome = G.flags[side === 0 ? 2 : 0];
  const remaining = GAME_TIME - G.time;
  const own = G.flags.filter(f => f.owner === side).length, theirs = G.flags.filter(f => f.owner === 1 - side).length;
  const targets = G.flags.filter(f => f.owner !== side).sort((a, b) => dist(a, home) - dist(b, home));
  const capping = G.flags.filter(f => f.owner === side && f.capSide === 1 - side && f.prog > 0.05).sort((a, b) => dist(a, home) - dist(b, home));
  let obj, mode = 'attack';
  if (home.owner !== side) obj = home;
  else if (capping.length) { obj = capping[0]; mode = 'counter'; }
  else if (G.time < A.holdUntil) { obj = targets[0] || G.flags[1]; mode = 'wait'; }
  else if (own > theirs || !targets.length) {
    mode = 'defend';
    obj = G.flags.filter(f => f.owner === side && f !== home).sort((a, b) => dist(a, enemyHome) - dist(b, enemyHome))[0] || home;
  } else obj = targets[0];
  // late push: in the last minutes the Germans throw everything at the Bridge
  if (side === 1 && remaining <= D.pushT && G.flags[1].owner !== 1 && home.owner === side && mode !== 'counter') {
    mode = 'push'; obj = G.flags[1];
    if (!A.push) {
      A.push = true; G.pushAt = G.time; A.smokeCd = Math.min(A.smokeCd, G.time);
      if (!G.auto) { toast('⚠ 🌉'); SFX.radio('alert'); buzz([30, 40, 30]); }
    }
  }
  A.obj = obj; A.mode = mode;
  A.stay = side === 1 ? D.stay : 0.65;
  if (mode === 'push') A.stay = D.pushStay ?? 0.15;
  if (mode === 'attack' && own < theirs && remaining < 120) A.stay *= 0.5; // running out of time: push
  const seen = G.units.filter(o => live(o) && o.side !== side && isSeen(o, side));
  const assault = mine.filter(u => u.role === 'assault' && !u.veh);
  const front = assault.slice().sort((a, b) => dist(a, obj) - dist(b, obj))[0];

  // smoke screen for a bridge crossing
  const myEnd = { x: side === 1 ? RX1 + 50 : RX0 - 50, y: 550 };
  const crossing = side === 1 ? obj.x < RX1 : obj.x > RX0;
  if ((mode === 'attack' || mode === 'counter' || mode === 'push') && crossing && G.time > A.smokeCd &&
      (mode === 'push' || seen.some(o => dxy(o.x, o.y, 900, 550) < 450)) && assault.some(u => dist(u, myEnd) < 220)) {
    const mort = mine.find(u => u.type === 'mortar' && u.smokeRounds > 0 && dxy(u.x, u.y, 900, 550) < 600);
    const sx = 900 + (side === 1 ? -40 : 40), sy = 550;
    if (mort) { mort.smokeRounds--; G.shells.push({ x0: mort.x, y0: mort.y, x: sx + rnd(-15, 15), y: sy + rnd(-15, 15), t: 0, dur: 2, kind: 'smoke', src: mort, arc: true }); }
    else {
      const thr = assault.find(u => u.smoke > 0 && dist(u, myEnd) < 220);
      if (thr) throwSmoke(thr, sx, sy);
    }
    A.smokeCd = G.time + (mode === 'push' ? 28 : 50);
  }
  // push: the attacker's mortar shells the defenders' end of the bridge; the defender answers on the far end
  const barrage = (mode === 'push' || (side === 0 && G.ai[1].push)) && (D.pushBar ?? 1);
  if (barrage && G.time > (A.barrageCd || 0)) {
    const mort = mine.find(u => u.type === 'mortar' && u.ammo > 0 && u.state < 2 && G.time - u.lastFired > 3);
    if (mort) {
      const near = seen.filter(o => !o.veh && dxy(o.x, o.y, 900, 550) < 220);
      const tx = near.length ? near.reduce((a, o) => a + o.x, 0) / near.length : (side === 1 ? 845 : 990) + rnd(-25, 25);
      const ty = near.length ? near.reduce((a, o) => a + o.y, 0) / near.length : 550 + rnd(-30, 30);
      const d = dxy(mort.x, mort.y, tx, ty);
      if (d <= WPN.mortar.range && d >= WPN.mortar.min) {
        mort.path = []; mort.order = { type: 'area', x: tx, y: ty, t: G.time, until: G.time + 10 };
        A.barrageCd = G.time + 18;
      }
    }
  }

  for (const u of mine) {
    u.aiCool -= 0.5;
    if (u.aiCool > 0) continue;
    u.aiCool = rnd(2, 3.5) * (side === 1 ? D.think : 1);
    if (u.state === 2) continue;
    if ((u.order.type === 'fire' || u.order.type === 'area') && G.time - u.order.t < 6) continue;
    aiUnit(u, obj, home, seen, front, side, mode, A.stay);
  }
}
function aiUnit(u, obj, home, seen, front, side, mode, stay) {
  const engaged = G.time - u.lastFired < 2.5 || G.time - u.lastHit < 2.5;
  const cov = coverAt(u.x, u.y), hpf = u.hp / u.maxHp, d = dist(u, obj);
  if (u.veh) return aiVehicle(u, obj, home, seen, front, hpf, mode);
  // late push: attackers commit everyone; an active defender brings its reserve up to the bridge
  const P = DIFFS[G.diff];
  const allIn = (mode === 'push' || (side === 0 && mode === 'defend' && G.ai[1].push)) && hpf >= (P.pushHurt ?? 0.15);
  if (hpf < 0.35 && mode !== 'counter' && !allIn && u.role !== 'guard' && u.role !== 'support' && u.role !== 'mortar') {
    // wounded: stop assaulting, hold the nearest friendly flag instead
    const keep = G.flags.filter(f => f.owner === side).sort((a, b) => dist(a, u) - dist(b, u))[0] || home;
    if (u._dw && u._dwObj === keep && dist(u, u._dw) < 20) { aiHold(u); return; }
    if (engaged && cov >= 1 && dist(u, keep) < 260) return;
    const p = overwatch(u, keep, home, side, 50, 200);
    if (p) { u._dw = p; u._dwObj = keep; aiMove(u, p, 'move'); }
    return;
  }
  switch (allIn && u.role === 'guard' && (P.pushGuard ?? 1) ? 'assault' : u.role) {
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
      if (side === 0 && mode === 'defend' && cov >= 1 && d < (DIFFS[G.diff].digS ?? 500)) { aiStop(u); return; }
      if (u._ow && u._owObj === obj && dist(u, u._ow) < 20) { aiHold(u); return; }
      const p = overwatch(u, obj, home, side, 200, u.type === 'sniper' ? 420 : 330);
      if (p) { u._ow = p; u._owObj = obj; aiMove(u, p, u.type === 'sniper' ? 'sneak' : 'move'); }
      return;
    }
    case 'lead': {
      const grp = G.units.filter(o => live(o) && o.side === side && o.role === 'assault' && !o.veh);
      if (!grp.length) { u.role = 'assault'; return; }
      // go to the most shaken friend nearby to rally it
      const needy = G.units.filter(o => live(o) && o.side === side && !o.veh && o.state >= 3 && dist(o, u) < 300).sort((a, b) => dist(a, u) - dist(b, u))[0];
      if (needy && G.time - u.lastHit > 3) { aiMove(u, coverNear(needy.x, needy.y, 60, side, null, u), 'move'); return; }
      const cx = grp.reduce((s, o) => s + o.x, 0) / grp.length, cy = grp.reduce((s, o) => s + o.y, 0) / grp.length;
      if (engaged && cov >= 1 && dxy(u.x, u.y, cx, cy) < 160) return;
      const v = { x: cx + (home.x - cx) * 0.12, y: cy + (home.y - cy) * 0.12 };
      if (dxy(u.x, u.y, v.x, v.y) > 60) aiMove(u, coverNear(v.x, v.y, 60, side, null, u), 'move');
      return;
    }
    default: {
      if (u.t.at && u.ammo2 > 0) {
        const veh = seen.filter(o => o.veh).sort((a, b) => dist(a, u) - dist(b, u))[0];
        if (veh && dist(veh, u) < 380) {
          if (dist(veh, u) > 120) aiMove(u, coverNear(veh.x, veh.y, 100, side, u, u), 'sneak');
          return;
        }
      }
      if (mode === 'wait') {
        if (cov < 1 && !engaged) aiMove(u, coverNear(u.x, u.y, 60, side, null, u), 'move'); else aiHold(u);
        return;
      }
      if (mode === 'defend') {
        if (engaged && cov >= 1) return;
        if (side === 0 && cov >= 1 && d < (DIFFS[G.diff].digA ?? 450) && !allIn) { aiStop(u); return; } // dug in: stay put and keep shooting
        if (u._dw && u._dwObj === obj && dist(u, u._dw) < 20) { aiHold(u); return; }
        const p = overwatch(u, obj, home, side, 60, 230);
        if (p) { u._dw = p; u._dwObj = obj; aiMove(u, p, seen.some(o => dist(o, u) < 320) ? 'move' : 'fast'); }
        return;
      }
      if (mode === 'counter' && d > 380) { if (engaged && cov >= 1) return; }
      const nearE = seen.reduce((m, o) => Math.min(m, dist(o, u)), 1e9);
      if (engaged && cov >= 1 && nearE < 300 && Math.random() < stay) return; // trade fire only at close range, else keep closing
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
function aiVehicle(u, obj, home, seen, front, hpf, mode) {
  const threat = seen.filter(o => !o.veh && dist(o, u) < (u.type === 'stug' ? 170 : 140)).sort((a, b) => dist(a, u) - dist(b, u))[0];
  if (threat) {
    let vx = u.x - threat.x, vy = u.y - threat.y; const l = Math.hypot(vx, vy) || 1;
    const p = { x: clamp(u.x + vx / l * 130, 20, W - 20), y: clamp(u.y + vy / l * 130, 20, H - 20) };
    if (!aiMove(u, p, 'move')) aiMove(u, pointAlong(u, home, 130), 'move');
    return;
  }
  if (hpf < 0.35) { aiMove(u, pointAlong(u, home, 200), 'move'); return; }
  if (mode === 'wait' || mode === 'defend') {
    const p = pointAlongFrom(obj.x, obj.y, home, u.type === 'stug' ? 280 : 200, true);
    if (dist(u, p) > 40) aiMove(u, p, 'move'); else aiStop(u);
    return;
  }
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
function groupSpots(us, x, y) {
  const n = us.length;
  return us.map((u, i) => {
    const a = i / n * TAU, r = n > 1 ? 16 + n * 3 : 0;
    return { x: clamp(x + Math.cos(a) * r, 10, W - 10), y: clamp(y + Math.sin(a) * r, 10, H - 10) };
  });
}
function issueMove(us, x, y, mode) {
  const spots = groupSpots(us, x, y);
  let ok = false;
  us.forEach((u, i) => {
    const p = findPath(u.x, u.y, spots[i].x, spots[i].y, u.veh);
    if (p && p.length) { u.path = p; u.mode = mode; u.order = { type: 'move' }; ok = true; }
  });
  G.markers.push({ x, y, t: 0, kind: ok ? mode : 'no' });
  SFX.radio(mode); buzz(ok ? 12 : [10, 40, 10]);
}
function issueFire(us, o) {
  for (const u of us) { u.path = []; u.order = { type: 'fire', target: o, t: G.time }; }
  G.markers.push({ x: o.x, y: o.y, t: 0, kind: 'fire' });
  SFX.radio('fire'); buzz(15);
}
function issueArea(us, x, y) {
  let ok = false;
  for (const u of us) {
    const w = WPN[u.t.w], d = dxy(u.x, u.y, x, y);
    if (u.ammo <= 0 || d > w.range || (w.min && d < w.min) || (!w.indirect && !LOS(u.x, u.y, x, y))) continue;
    u.path = []; u.order = { type: 'area', x, y, t: G.time, until: G.time + 20 }; ok = true;
  }
  G.markers.push({ x, y, t: 0, kind: ok ? 'area' : 'no' });
  if (!ok) { toast('✖ 👁'); SFX.click(true); buzz([10, 40, 10]); } else { SFX.radio('fire'); buzz(15); }
}
function issueSmoke(us, x, y) {
  let ok = false;
  for (const u of us) {
    const d = dxy(u.x, u.y, x, y);
    if (u.smokeRounds > 0 && d <= WPN.mortar.range && d >= WPN.mortar.min) {
      u.smokeRounds--; ok = true; u.lastFired = G.time; SFX.shot('mortar', u);
      G.shells.push({ x0: u.x, y0: u.y, x: x + rnd(-12, 12), y: y + rnd(-12, 12), t: 0, dur: 1.2 + d / 450, kind: 'smoke', src: u, arc: true });
      break;
    }
  }
  if (!ok) for (const u of us) if (u.smoke > 0) { throwSmoke(u, x, y); ok = true; break; }
  G.markers.push({ x, y, t: 0, kind: ok ? 'smoke' : 'no' });
  if (!ok) { toast('✖ 💨'); SFX.click(true); buzz([10, 40, 10]); } else { SFX.radio('smoke'); buzz(12); }
}
function issueHold(us) { for (const u of us) { u.path = []; u.order = { type: 'hold' }; } SFX.radio('hold'); buzz(12); }

// ---------------------------------------------------------------- deployment
const inBridgeEnd = (x, y) => x >= BRIDGE_END.x0 && x <= BRIDGE_END.x1 && y >= BRIDGE_END.y0 && y <= BRIDGE_END.y1;
function inZone(x, y) { return ((x >= ZONE.x0 && x <= ZONE.x1 && y >= ZONE.y0 && y <= ZONE.y1) || inBridgeEnd(x, y)) && passAt(x, y, false); }
function placeUnit(u, x, y) {
  if (!inBridgeEnd(x, y)) { x = clamp(x, ZONE.x0, ZONE.x1); y = clamp(y, ZONE.y0, ZONE.y1); }
  if (!passAt(x, y, false)) { const c = coverNear(x, y, 40, 0, null, u); if (!c) return false; x = c.x; y = c.y; }
  for (let k = 0; k < 12; k++) {
    if (!G.units.some(o => o !== u && o.side === 0 && dxy(o.x, o.y, x, y) < 16)) break;
    const a = k * 2.4, nx = x + Math.cos(a) * 14, ny = y + Math.sin(a) * 14;
    if (inZone(nx, ny)) { x = nx; y = ny; }
  }
  u.x = x; u.y = y; u.path = [];
  return true;
}
function autoDeploy() {
  G.bSetup = (G.bSetup + 1) % B_SETUPS.length;
  jitterBritish();
  SFX.radio('move');
}
function beginBattle() {
  if (G.phase !== 'deploy') return;
  G.phase = 'battle'; G.paused = false; G.sel = G.sel.filter(live);
  for (const u of G.units) { u.path = []; u.order = { type: 'idle' }; }
  updateVis();
  SFX.whistleStart();
  toast('▶');
  refreshUI(true);
}

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
    resupply(u);
  }
  separate();
  updateShells();
  updateFlags();
  updateFx();
  for (const m of G.markers) m.t += DT;
  G.markers = G.markers.filter(m => m.t < 1.2);
  if (G.time >= G.logT) { G.flagLog.push(G.flags.map(f => f.owner)); G.logT += 5; }
  G.flagT -= DT;
  if (G.flagT <= 0) { G.flagT = 0.5; checkReinforce(); checkEnd(); }
}

// ---------------------------------------------------------------- sound (synthesized WebAudio, no files)
const SFX = (() => {
  let ac = null, master = null, noiseBuf = null, eng = null, voices = 0;
  let muted = store.get('btf-mute', '0') === '1';
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
  const crack = (dest, t, vol, bright, len = 0.09) => { noise(dest, t, len, 'bandpass', bright, 0.9, vol); tone(dest, t, 0.06, 'sine', 170, 60, vol * 0.5); };
  function shot(wk, u) {
    if (!ok() || voices > 26) return;
    const t = ac.currentTime + 0.01 + Math.random() * 0.03;
    const dest = out(u.x, u.y, u.side === 0 ? 0.5 : 0.42);
    switch (wk) {
      case 'rifle': { const n = 2 + (Math.random() * 2 | 0); for (let i = 0; i < n; i++) crack(dest, t + i * rnd(0.07, 0.17), 0.6, rnd(1300, 1900), 0.12); voice(0.6); break; }
      case 'smg': for (let i = 0; i < 4; i++) crack(dest, t + i * 0.075, 0.4, 2300, 0.06); voice(0.4); break;
      case 'mg': {
        const n = u.side === 0 ? 5 : 8, gap = u.side === 0 ? 0.085 : 0.042; // Bren thuds, MG42 rips
        for (let i = 0; i < n; i++) crack(dest, t + i * gap, 0.5, u.side === 0 ? 1500 : 2100, 0.07);
        voice(n * gap + 0.1); break;
      }
      case 'sniper': noise(dest, t, 0.35, 'bandpass', 2600, 0.6, 0.9); tone(dest, t, 0.14, 'sine', 220, 50, 0.6); voice(0.4); break;
      case 'piat': tone(dest, t, 0.28, 'sine', 150, 45, 0.9); noise(dest, t, 0.4, 'bandpass', 800, 1.2, 0.5, 0.03); voice(0.45); break;
      case 'mortar': tone(dest, t, 0.2, 'sine', 280, 90, 0.7); noise(dest, t, 0.12, 'lowpass', 700, 0.7, 0.5); voice(0.25); break;
      case 'gun': tone(dest, t, 0.45, 'sine', 120, 35, 1.0); noise(dest, t, 0.5, 'lowpass', 1500, 0.7, 0.9); voice(0.55); break;
    }
  }
  function boom(x, y, size) {
    if (!ok() || voices > 32) return;
    const t = ac.currentTime + 0.01, dest = out(x, y, clamp(size / 40, 0.4, 1));
    noise(dest, t, 0.6 + size / 60, 'lowpass', 420, 0.8, 1, 0.004);
    tone(dest, t, 0.5, 'sine', 95, 28, 0.9);
    noise(dest, t, 0.12, 'bandpass', 1800, 1, 0.35);
    voice(1.2);
  }
  function whistle(x, y, dur) {
    if (!ok() || voices > 30) return;
    const t = ac.currentTime + 0.01, dest = out(x, y, 0.22);
    tone(dest, t, Math.max(0.3, dur), 'sine', 1800, 650, 0.35, 0.12); voice(dur);
  }
  function puff(x, y) { if (!ok()) return; const t = ac.currentTime + 0.01; noise(out(x, y, 0.4), t, 0.5, 'lowpass', 900, 0.5, 0.5, 0.05); voice(0.5); }
  function radio(kind) {
    if (!ok()) return;
    const t = ac.currentTime + 0.01, dest = out(null, null, 0.32);
    noise(dest, t, 0.07, 'bandpass', 2400, 2, 0.5);
    const f = kind === 'fire' ? [760, 560] : kind === 'hold' ? [900, 900] : kind === 'smoke' ? [660, 990] : kind === 'alert' ? [520, 520] : kind === 'fast' ? [1000, 1330] : kind === 'sneak' ? [700, 820] : [880, 1180];
    tone(dest, t + 0.07, 0.06, 'square', f[0], f[0], 0.14);
    tone(dest, t + 0.14, 0.07, 'square', f[1], f[1], 0.14);
    if (kind === 'alert') tone(dest, t + 0.24, 0.12, 'square', 520, 520, 0.14);
    noise(dest, t + 0.22, 0.05, 'bandpass', 2400, 2, 0.35);
    voice(0.4);
  }
  function whistleStart() {
    if (!ok()) return;
    const t = ac.currentTime + 0.02, dest = out(null, null, 0.4);
    for (const [s, d] of [[0, 0.22], [0.32, 0.55]]) {
      const o = tone(dest, t + s, d, 'sine', 2300, 2300, 0.4, 0.02);
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 38; lg.gain.value = 90;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t + s); lfo.stop(t + s + d + 0.05);
    }
    voice(1);
  }
  function notes(seq, type, vol) {
    if (!ok()) return;
    const t = ac.currentTime + 0.02, dest = out(null, null, vol);
    seq.forEach(([f, s, d]) => tone(dest, t + s, d, type, f, f, 0.5, 0.01));
    voice(1.5);
  }
  const chime = (good) => notes(good ? [[523, 0, 0.18], [659, 0.12, 0.18], [784, 0.24, 0.35]] : [[392, 0, 0.2], [330, 0.15, 0.2], [262, 0.3, 0.4]], 'triangle', 0.35);
  const rally = () => notes([[392, 0, 0.12], [523, 0.1, 0.12], [659, 0.2, 0.12], [784, 0.3, 0.3]], 'triangle', 0.3);
  const end = (res) => notes(res === 'win' ? [[523, 0, 0.2], [659, 0.18, 0.2], [784, 0.36, 0.2], [1047, 0.54, 0.6]] : res === 'lose' ? [[392, 0, 0.3], [349, 0.28, 0.3], [311, 0.56, 0.3], [262, 0.84, 0.8]] : [[440, 0, 0.3], [440, 0.3, 0.5]], 'triangle', 0.4);
  function click(bad) { if (!ok()) return; const t = ac.currentTime + 0.005; tone(out(null, null, 0.2), t, 0.04, 'square', bad ? 300 : 1400, bad ? 200 : 1400, 0.15); voice(0.1); }
  function engine(level) {
    if (!ac) return;
    if (!eng) {
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o1.type = 'sawtooth'; o1.frequency.value = 38; o2.type = 'square'; o2.frequency.value = 55.5;
      f.type = 'lowpass'; f.frequency.value = 170; g.gain.value = 0;
      lfo.frequency.value = 9; lg.gain.value = 0.35;
      const am = ac.createGain(); am.gain.value = 1;
      o1.connect(f); o2.connect(f); f.connect(am); am.connect(g); g.connect(master);
      lfo.connect(lg); lg.connect(am.gain);
      o1.start(); o2.start(); lfo.start();
      eng = { g, o1 };
    }
    const v = (muted || G.silent) ? 0 : clamp(level, 0, 1) * 0.3;
    eng.g.gain.setTargetAtTime(v, ac.currentTime, 0.3);
    eng.o1.frequency.setTargetAtTime(34 + level * 14, ac.currentTime, 0.4);
  }
  function setMuted(m) {
    muted = m; store.set('btf-mute', m ? '1' : '0');
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.02);
  }
  return { unlock, shot, boom, whistle, puff, radio, whistleStart, chime, rally, end, click, engine, setMuted, isMuted: () => muted, ctx: () => ac };
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
function star(c, x, y, r, fill) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); if (fill) c.fill(); else c.stroke();
}
function drawUnit(c, u, s, now) {
  const x = u.x, y = u.y;
  if (u.flash > 0) { c.fillStyle = 'rgba(255,230,140,.9)'; c.beginPath(); c.arc(x, y, 15 * s, 0, TAU); c.fill(); }
  drawUnitBody(c, u, x, y, s, 1);
  const bw = 24 * s, by = y - 21 * s, f = u.hp / u.maxHp;
  c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - bw / 2 - 1, by - 1, bw + 2, 4.5 * s + 2);
  c.fillStyle = f > 0.6 ? '#8bd35a' : f > 0.3 ? '#e6c83a' : '#e8402f'; c.fillRect(x - bw / 2, by, bw * f, 4.5 * s);
  c.font = `bold ${12 * s}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  if (u.state === 3) { c.fillStyle = '#e8402f'; c.fillText('!', x + 15 * s, y - 10 * s); }
  if (u.state === 4) { c.fillStyle = '#fff'; c.fillText('✕', x + 15 * s, y - 10 * s); }
  if (u.state === 2) { c.fillStyle = MCOL[2]; c.beginPath(); c.moveTo(x + 11 * s, y - 14 * s); c.lineTo(x + 19 * s, y - 14 * s); c.lineTo(x + 15 * s, y - 8 * s); c.fill(); }
  if (u.rallyT > 0 && u.state >= 3) {
    const k = u.rallyT / (u.state === 4 ? 6 : 3.5);
    c.strokeStyle = '#ffd34d'; c.lineWidth = 2.5 * s;
    c.beginPath(); c.arc(x, y, 16 * s, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
    c.fillStyle = '#ffd34d'; star(c, x - 15 * s, y - 13 * s, 5 * s, true);
  }
  if (u.side === 0) {
    const am = u.ammo / u.ammoMax;
    if (am < 0.25) { c.fillStyle = u.ammo <= 0 ? '#e8402f' : '#e6c83a'; c.fillRect(x + 10 * s, y + 8 * s, 5 * s, 5 * s); }
    if (u.order.type === 'hold' && !(u.rallyT > 0)) {
      c.fillStyle = '#dfe8ff'; c.beginPath(); c.moveTo(x - 17 * s, y - 13 * s); c.lineTo(x - 11 * s, y - 13 * s); c.lineTo(x - 11 * s, y - 8 * s); c.lineTo(x - 14 * s, y - 5 * s); c.lineTo(x - 17 * s, y - 8 * s); c.fill();
    }
  }
}
function drawFloater(c, f, s) {
  const k = f.t / 1.3, x = f.x, y = f.y - 26 * s - k * 22 * s;
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
  }
  c.globalAlpha = 1;
}
function drawPin(c, x, y, mode, s, a) {
  const col = mode === 'fast' ? '255,220,90' : mode === 'sneak' ? '120,220,255' : '255,255,255';
  c.strokeStyle = `rgba(${col},${a})`; c.lineWidth = 2.2 * s;
  c.beginPath(); c.arc(x, y, 7 * s, 0, TAU); c.stroke();
  c.fillStyle = `rgba(${col},${a})`; c.beginPath(); c.arc(x, y, 2.5 * s, 0, TAU); c.fill();
}
function pathLine(c, u, path, mode, s, alpha) {
  const col = mode === 'fast' ? '255,220,90' : mode === 'sneak' ? '120,220,255' : '255,255,255';
  c.setLineDash([7 * s, 6 * s]); c.lineWidth = 2 * s; c.strokeStyle = `rgba(${col},${alpha})`;
  c.beginPath(); c.moveTo(u.x, u.y); for (const p of path) c.lineTo(p.x, p.y); c.stroke(); c.setLineDash([]);
}

// ---------------------------------------------------------------- fire-range rings & aiming
// colour + dash per weapon; solid inner ring = effective range, dashed outer ring = max range
const RING = {
  rifle:  { col: '150,230,110', dash: [10, 7] },
  smg:    { col: '185,240,150', dash: [7, 6] },
  mg:     { col: '255,214,74', dash: [3, 5] },
  sniper: { col: '110,205,255', dash: [20, 8] },
  mortar: { col: '205,150,255', dash: [3, 9] },
  piat:   { col: '255,140,50', dash: [2, 5] },
  gun:    { col: '255,120,90', dash: [12, 6] },
};
const THREAT_COL = '240,70,55';
const RAYS = 120;
// march a ray the same way sight() samples a line: other houses stop it (you can see into the
// first house you hit, not through it), thick trees stop it, hedges/walls only thin it
function rayReach(x0, y0, dx, dy, maxR, ha) {
  let trees = 0, clear = -1, inH = 0;
  for (let r = 6, i = 1; r <= maxR; r += 6, i++) {
    const x = x0 + dx * r, y = y0 + dy * r;
    if (x < 0 || y < 0 || x >= W || y >= H) return [r, clear < 0 ? r : clear];
    const k = cellIdx(x, y), h = hid[k];
    if (inH) { if (h !== inH) return [r - 3, clear < 0 ? r - 3 : Math.min(clear, r - 3)]; }
    else if (h && h !== ha) inH = h;
    const t = terr[k];
    if (t === T_TREE && i > 3 && ++trees > 5) return [r, clear < 0 ? r : Math.min(clear, r)];
    if (clear < 0 && (t === T_HEDGE || t === T_WALL) && i > 2) clear = r + 10;
  }
  return [maxR, clear < 0 ? maxR : Math.min(clear, maxR)];
}
function smokeClamp(x0, y0, dx, dy, r) {
  for (const sm of G.smokes) {
    if (sm.r < 16 || sm.age > sm.life - 3) continue;
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
// k = intensity (1 selected, ~0.4 faint "all units" mode); threat = enemy view in red
function drawRings(c, u, s, k, threat) {
  const w = WPN[u.t.w], st = RING[u.t.w] || RING.rifle;
  const col = threat ? THREAT_COL : st.col, full = k >= 0.5;
  const R = w.range, E = R * (w.eff || 0.5);
  c.save();
  if (w.indirect) {
    // mortar: indirect, so no sight clipping; can't fire inside the min ring
    c.beginPath(); c.arc(u.x, u.y, R, 0, TAU); c.arc(u.x, u.y, w.min, 0, TAU, true);
    c.fillStyle = `rgba(${col},${0.09 * k})`; c.fill();
    c.beginPath(); c.arc(u.x, u.y, w.min, 0, TAU);
    if (full) { c.fillStyle = `rgba(240,70,55,${0.1 * k})`; c.fill(); }
    c.setLineDash([4 * s, 4 * s]); c.strokeStyle = `rgba(240,90,70,${0.85 * k})`; c.lineWidth = 1.8 * s; c.stroke();
  } else {
    const V = visPoly(u, R);
    if (full) {
      // in range but out of sight (houses, woods, smoke) -> dark shadow
      c.beginPath(); c.arc(u.x, u.y, R, 0, TAU); polyPath(c, V.far);
      c.fillStyle = `rgba(8,10,6,${0.32 * k})`; c.fill('evenodd');
      // behind hedges/walls -> lighter shadow (harder to see and hit)
      c.beginPath(); polyPath(c, V.far); polyPath(c, V.clr);
      c.fillStyle = `rgba(8,10,6,${0.13 * k})`; c.fill('evenodd');
    }
    c.save(); c.beginPath(); polyPath(c, V.far); c.clip();
    c.beginPath(); c.arc(u.x, u.y, R, 0, TAU); c.fillStyle = `rgba(${col},${0.08 * k})`; c.fill();
    c.beginPath(); c.arc(u.x, u.y, E, 0, TAU); c.fillStyle = `rgba(${col},${0.12 * k})`; c.fill();
    c.restore();
    c.beginPath(); c.arc(u.x, u.y, E, 0, TAU); c.setLineDash([]);
    c.strokeStyle = `rgba(${col},${0.9 * k})`; c.lineWidth = 2.2 * s; c.stroke();
  }
  c.beginPath(); c.arc(u.x, u.y, R, 0, TAU); c.setLineDash((threat ? [9, 6] : st.dash).map(v => v * s));
  c.strokeStyle = `rgba(${col},${0.85 * k})`; c.lineWidth = 1.8 * s; c.stroke(); c.setLineDash([]);
  if (u.t.at && u.ammo2 > 0 && !threat) {
    const r2 = WPN[u.t.at].range;
    c.beginPath(); c.arc(u.x, u.y, r2, 0, TAU); c.setLineDash([2 * s, 5 * s]);
    c.strokeStyle = `rgba(${RING.piat.col},${0.95 * k})`; c.lineWidth = 3.2 * s; c.stroke(); c.setLineDash([]);
    if (full) ringLabel(c, u.x + Math.cos(-2.3) * r2, u.y + Math.sin(-2.3) * r2, `◆${r2}m`, RING.piat.col, s);
  }
  if (full) ringLabel(c, u.x + Math.cos(-0.8) * R, u.y + Math.sin(-0.8) * R, w.indirect ? `${w.min}–${R}m` : `${R}m`, col, s);
  c.restore();
}
function inRangeOf(sel, o) {
  for (const u of sel) {
    if (!live(u) || !canAct(u)) continue;
    if (u.ammo > 0 && validTarget(u, o, WPN[u.t.w])) return true;
    if (u.t.at && u.ammo2 > 0 && validTarget(u, o, WPN[u.t.at])) return true;
  }
  return false;
}
function aimInfo(u, x, y, tgt) {
  let wk = u.t.w;
  if (tgt && tgt.veh && u.t.at && u.ammo2 > 0) wk = u.t.at;
  const w = WPN[wk], d = dxy(u.x, u.y, x, y);
  const r = { wk, d, ok: true, p: 0, why: '', area: !tgt };
  const sf = w.indirect ? 1 : sight(u.x, u.y, x, y);
  if (wk === u.t.w && u.ammo <= 0) { r.ok = false; r.why = '⁍'; }
  else if (d > w.range || (w.min && d < w.min)) { r.ok = false; r.why = ''; }
  else if (!(sf > 0)) { r.ok = false; r.why = '👁'; }
  else if (tgt && w.arm[tgt.armor] <= 0.001) { r.ok = false; r.why = '🛡'; }
  if (r.ok) {
    if (w.indirect) r.p = Math.min(1, (w.splash * 0.6) / (16 + d * 0.08 * (1.2 - u.exp * 0.15)));
    else {
      const o = tgt || { veh: false, x, y, moving: false, mode: 'move', state: 0, armor: 0 };
      r.p = hitChance(u, w, d, o, tgt ? undefined : sf);
    }
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
    if (!live(u) || u.state >= 3) continue;
    const r = aimInfo(u, x, y, tgt), w = WPN[r.wk];
    let col;
    if (!r.ok) col = BAD;
    else if (r.area && !w.indirect) col = r.d <= w.range * (w.eff || 0.5) ? GOOD : FAIR;
    else col = r.p >= 0.3 ? GOOD : r.p >= 0.14 ? FAIR : BAD;
    anyOk = anyOk || r.ok;
    c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 5 * s; c.setLineDash(r.ok ? [] : [7 * s, 6 * s]);
    c.beginPath(); c.moveTo(u.x, u.y);
    const mx = (u.x + x) / 2, my = (u.y + y) / 2 - (w.indirect ? Math.min(140, r.d * 0.3) : 0);
    if (w.indirect) c.quadraticCurveTo(mx, my, x, y); else c.lineTo(x, y);
    c.stroke();
    c.strokeStyle = `rgb(${col})`; c.lineWidth = 2.6 * s; c.stroke(); c.setLineDash([]);
    const txt = !r.ok ? `✖${r.why ? ' ' + r.why : ''} ${Math.round(r.d)}m`
      : (r.area && !w.indirect) ? `${Math.round(r.d)}m ≋` : `${r.wk === 'piat' ? '◆' : ''}${Math.round(r.d)}m ${Math.round(r.p * 100)}%`;
    const bx = w.indirect ? (u.x + 2 * mx + x) / 4 : u.x + (x - u.x) * 0.6, by = w.indirect ? (u.y + 2 * my + y) / 4 : u.y + (y - u.y) * 0.6;
    badges.push({ x: bx, y: by, txt, col });
  }
  // aim point
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
  const r = (o.veh ? 25 : 18) * s, L = 6 * s, a = 0.55 + 0.35 * Math.sin(now * 5);
  c.strokeStyle = `rgba(255,224,102,${a})`; c.lineWidth = 2.2 * s;
  c.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    c.moveTo(o.x + sx * r, o.y + sy * (r - L)); c.lineTo(o.x + sx * r, o.y + sy * r); c.lineTo(o.x + sx * (r - L), o.y + sy * r);
  }
  c.stroke();
}
function render() {
  const now = performance.now() / 1000;
  const dbg = G.dbg = { rings: 0, faint: 0, threat: 0, inRange: 0, badges: 0 }; // read by the test harness
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2b311f'; ctx.fillRect(0, 0, cv.width, cv.height);
  let shx = 0, shy = 0;
  if (G.shake > 0.3) { shx = rnd(-1, 1) * G.shake; shy = rnd(-1, 1) * G.shake; }
  ctx.setTransform(DPR * cam.z, 0, 0, DPR * cam.z, (-cam.x * cam.z + shx) * DPR, (-cam.y * cam.z + shy) * DPR);
  ctx.drawImage(mapCv, 0, 0, W, H);
  const s = Math.max(1, 0.8 / cam.z);
  const battle = G.phase === 'battle';
  // deploy zone
  if (G.phase === 'deploy') {
    const pulse = 0.5 + 0.5 * Math.sin(now * 3);
    ctx.fillStyle = `rgba(184,68,63,${0.08 + pulse * 0.05})`; ctx.fillRect(ZONE.x0, ZONE.y0, ZONE.x1 - ZONE.x0, ZONE.y1 - ZONE.y0);
    ctx.setLineDash([12, 8]); ctx.strokeStyle = 'rgba(255,215,200,.85)'; ctx.lineWidth = 3 * s;
    ctx.strokeRect(ZONE.x0, ZONE.y0, ZONE.x1 - ZONE.x0, ZONE.y1 - ZONE.y0);
    ctx.fillRect(BRIDGE_END.x0, BRIDGE_END.y0, BRIDGE_END.x1 - BRIDGE_END.x0, BRIDGE_END.y1 - BRIDGE_END.y0);
    ctx.strokeRect(BRIDGE_END.x0, BRIDGE_END.y0, BRIDGE_END.x1 - BRIDGE_END.x0, BRIDGE_END.y1 - BRIDGE_END.y0); ctx.setLineDash([]);
    // parachute glyphs along the zone edge
    for (const py of [150, 550, 950]) {
      const px = ZONE.x1 - 30 * s, r = 12 * s;
      ctx.fillStyle = 'rgba(255,235,225,.85)'; ctx.beginPath(); ctx.arc(px, py, r, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(255,235,225,.85)'; ctx.lineWidth = 1.2 * s; ctx.beginPath();
      for (const o of [-r, -r / 3, r / 3, r]) { ctx.moveTo(px + o, py); ctx.lineTo(px, py + r * 1.3); } ctx.stroke();
    }
  }
  // flags with capture rings
  for (const f of G.flags) {
    ctx.beginPath(); ctx.arc(f.x, f.y, CAP_R, 0, TAU);
    ctx.fillStyle = f.owner === 0 ? 'rgba(184,68,63,.15)' : f.owner === 1 ? 'rgba(86,100,109,.2)' : 'rgba(255,255,255,.08)'; ctx.fill();
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
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(f.x, f.y + 4 * s); ctx.lineTo(f.x, f.y - 22 * s); ctx.stroke();
    const wave = Math.sin(now * 4 + f.x) * 2 * s;
    ctx.fillStyle = f.owner === 0 ? SIDE_COL[0] : f.owner === 1 ? SIDE_COL[1] : '#f0f0f0';
    ctx.beginPath(); ctx.moveTo(f.x, f.y - 22 * s); ctx.lineTo(f.x + 16 * s, f.y - 16 * s + wave); ctx.lineTo(f.x, f.y - 10 * s); ctx.fill();
  }
  // reinforcement warning arrow at the east edge
  if (G.reinfAt && G.time - G.reinfAt.t < 7 && !G.auto) {
    const a = 0.5 + 0.5 * Math.sin(now * 6), y = G.reinfAt.y;
    ctx.fillStyle = `rgba(232,64,47,${a})`;
    ctx.beginPath(); ctx.moveTo(W - 10, y - 26); ctx.lineTo(W - 50, y); ctx.lineTo(W - 10, y + 26); ctx.closePath(); ctx.fill();
  }
  // dead
  for (const u of G.units) if (!u.alive && u.deadSeen) {
    ctx.strokeStyle = u.veh ? 'rgba(20,20,20,.8)' : 'rgba(40,30,25,.55)'; ctx.lineWidth = u.veh ? 9 : 3;
    const r = u.veh ? 12 : 6;
    ctx.beginPath(); ctx.moveTo(u.x - r, u.y - r); ctx.lineTo(u.x + r, u.y + r); ctx.moveTo(u.x + r, u.y - r); ctx.lineTo(u.x - r, u.y + r); ctx.stroke();
  }
  for (const g of G.ghosts) {
    const a = 1 - (G.time - g.t) / 8;
    ctx.globalAlpha = a * 0.6; ctx.setLineDash([3, 3]); ctx.strokeStyle = '#d8dde0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(g.x, g.y, 11 * s, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#d8dde0'; ctx.font = `bold ${11 * s}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', g.x, g.y);
    ctx.globalAlpha = 1;
  }
  // fire-range rings: faint for everyone (🎯 toggle), full for the selection, red for an inspected enemy
  if (G.ringsAll) for (const u of G.units) if (u.side === 0 && live(u) && u.state < 4 && !G.sel.includes(u)) { drawRings(ctx, u, s, 0.4, false); dbg.faint++; }
  for (const u of G.sel) if (live(u)) { drawRings(ctx, u, s, G.sel.length > 1 ? 0.7 : 1, false); dbg.rings++; }
  const I = G.inspect;
  if (I && (performance.now() > I.until || !live(I.u) || !isSeen(I.u, 0))) G.inspect = null;
  else if (I && battle) { drawRings(ctx, I.u, s, 1, true); dbg.threat++; }
  // own movement plans: faint for everyone, bold + destination pin for the selection
  for (const u of G.units) {
    if (u.side !== 0 || !live(u) || !u.path.length) continue;
    const sel = G.sel.includes(u);
    if (!sel && u.order.type !== 'move') continue;
    pathLine(ctx, u, u.path, u.mode, s, sel ? 0.85 : 0.28);
    const e = u.path[u.path.length - 1];
    drawPin(ctx, e.x, e.y, u.mode, s, sel ? 0.95 : 0.4);
  }
  // live path preview while the finger is down
  if (G.preview) {
    const P = G.preview, pulse = 0.6 + 0.4 * Math.sin(now * 10);
    P.paths.forEach((p, i) => { const u = P.units[i]; if (p && live(u)) pathLine(ctx, u, p, P.mode, s, 0.95); });
    drawPin(ctx, P.x, P.y, P.mode, s * (1 + pulse * 0.4), 1);
  }
  for (const u of G.sel) {
    if (G.pend === 'smoke') {
      const r = u.smokeRounds > 0 ? WPN.mortar.range : 110;
      ctx.beginPath(); ctx.arc(u.x, u.y, r, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5 * s; ctx.setLineDash([3 * s, 6 * s]); ctx.stroke(); ctx.setLineDash([]);
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
  const selOk = battle && G.sel.length ? G.sel.filter(live) : null;
  for (const u of G.units) {
    if (!live(u)) continue;
    if (u.side === 1 && (!isSeen(u, 0) || G.phase === 'deploy') && !G.over) continue;
    if (u.side === 1 && selOk && !G.over && inRangeOf(selOk, u)) { drawInRange(ctx, u, s, now); dbg.inRange++; }
    if (G.sel.includes(u)) {
      ctx.beginPath(); ctx.arc(u.x, u.y, (u.veh ? 24 : 18) * s, 0, TAU); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -now * 12; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    drawUnit(ctx, u, s, now);
  }
  for (const sh of G.shells) {
    const t = clamp(sh.t / sh.dur, 0, 1);
    const x = sh.x0 + (sh.x - sh.x0) * t, y = sh.y0 + (sh.y - sh.y0) * t - (sh.arc ? Math.sin(t * Math.PI) * 60 : 0);
    if (sh.src.side === 1 && !isSeen(sh.src, 0) && t < 0.6) continue;
    ctx.fillStyle = sh.kind === 'smoke' ? '#ddd' : '#222'; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
  }
  for (const t of G.tracers) {
    const shooter = G.units[t.sid];
    const vis = t.side === 0 || isSeen(shooter, 0);
    const a = 1 - t.t / 0.16, f0 = vis ? 0 : 0.6;
    ctx.strokeStyle = t.side === 0 ? `rgba(255,220,120,${a})` : `rgba(230,240,255,${a})`; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(t.x1 + (t.x2 - t.x1) * f0, t.y1 + (t.y2 - t.y1) * f0); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  for (const b of G.booms) {
    const k = b.t / 0.6;
    ctx.fillStyle = `rgba(255,${Math.round(200 - k * 150)},60,${0.85 * (1 - k)})`;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.4 + k * 0.8), 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(40,30,20,${0.6 * (1 - k)})`; ctx.lineWidth = 3; ctx.stroke();
  }
  for (const sm of G.smokes) {
    const fade = Math.min(1, (sm.life - sm.age) / 4);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6 + sm.age * 0.05, ox = Math.cos(a) * sm.r * 0.35, oy = Math.sin(a) * sm.r * 0.35;
      ctx.fillStyle = `rgba(225,225,220,${0.32 * fade})`; ctx.beginPath(); ctx.arc(sm.x + ox, sm.y + oy, sm.r * 0.75, 0, TAU); ctx.fill();
    }
  }
  for (const m of G.markers) {
    const a = 1 - m.t / 1.2;
    ctx.strokeStyle = m.kind === 'no' ? `rgba(255,60,60,${a})` : m.kind === 'fire' || m.kind === 'area' ? `rgba(255,90,60,${a})` : `rgba(255,255,255,${a})`;
    ctx.lineWidth = 2.5 * s;
    if (m.kind === 'no') { ctx.beginPath(); ctx.moveTo(m.x - 10, m.y - 10); ctx.lineTo(m.x + 10, m.y + 10); ctx.moveTo(m.x + 10, m.y - 10); ctx.lineTo(m.x - 10, m.y + 10); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(m.x, m.y, (8 + m.t * 20) * s, 0, TAU); ctx.stroke(); }
  }
  for (const f of G.floaters) drawFloater(ctx, f, s);
  const badges = [];
  if (battle && !G.over) drawAim(ctx, s, badges);
  dbg.badges = badges.length; dbg.badgeText = badges.map(b => b.txt).join(' | ');
  drawBadges(badges);
  // box selection (screen space)
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
const MOVE_MODES = ['move', 'fast', 'sneak'];
function makePreview(x, y) {
  const units = G.sel.filter(u => live(u) && u.state < 3);
  if (!units.length) return;
  const spots = groupSpots(units, x, y);
  G.preview = { x, y, mode: G.pend, units, paths: units.map((u, i) => findPath(u.x, u.y, spots[i].x, spots[i].y, u.veh)) };
}
cv.addEventListener('pointerdown', (e) => {
  SFX.unlock();
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) {
    const w = toWorld(e.clientX, e.clientY);
    const hit = unitAt(w.x, w.y);
    gest = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, mode: 'pending', w, hit };
    const battleSel = G.phase === 'battle' && !G.over && G.sel.length > 0;
    if (G.phase === 'deploy' && hit && hit.side === 0) gest.mode = 'unitPending';
    else if (battleSel && G.pend === 'fire' && !(hit && hit.side === 0)) { gest.mode = 'aim'; setAim(w); }
    else {
      gest.timer = setTimeout(() => {
        if (gest && gest.mode === 'pending') {
          if (battleSel && gest.hit && gest.hit.side === 1) { gest.mode = 'aimHold'; setAim(gest.w); buzz(12); return; }
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
      if (moved > 6) { gest.mode = 'drag'; G.sel = [gest.hit]; refreshUI(true); }
      break;
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
    else if (gest.mode === 'drag') SFX.click();
    else if (gest.mode === 'aim') tap(e.clientX, e.clientY);
    else if (gest.mode === 'aimHold') { if (G.aim && G.aim.tgt) tap(e.clientX, e.clientY); }
    else if (gest.mode === 'box') {
      if (Math.abs(gest.ex - gest.bx) > 16 || Math.abs(gest.ey - gest.by) > 16) boxSelect(gest.bx, gest.by, gest.ex, gest.ey);
      else tap(e.clientX, e.clientY);
    }
  }
  G.preview = null; G.aim = null; gest = null;
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
  const r = Math.max(20, 26 / cam.z);
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
  if (pick.length) { G.sel = pick; G.pend = 'move'; SFX.click(); }
  refreshUI(true);
}
function tap(sx, sy) {
  if (!G.running || G.over) return;
  const p = toWorld(sx, sy);
  const u = unitAt(p.x, p.y);
  if (u && u.side === 0) {
    if (G.sel.length === 1 && G.sel[0] === u) G.sel = [];
    else if (u.state < 4) G.sel = [u];
    G.pend = 'move'; SFX.click(); refreshUI(true); return;
  }
  const sel = G.sel.filter(s => live(s) && s.state < 4);
  if (u && u.side === 1 && G.phase === 'battle') G.inspect = { u, until: performance.now() + (sel.length ? 2500 : 6000) };
  if (!sel.length) {
    if (u && u.side === 1) SFX.click(); else G.inspect = null;
    return;
  }
  if (G.phase === 'deploy') {
    if (inZone(p.x, p.y)) { const spots = groupSpots(sel, p.x, p.y); sel.forEach((s, i) => placeUnit(s, spots[i].x, spots[i].y)); SFX.click(); G.markers.push({ x: p.x, y: p.y, t: 0, kind: 'move' }); }
    else { G.markers.push({ x: p.x, y: p.y, t: 0, kind: 'no' }); SFX.click(true); toast('✖ 🪂'); }
    return;
  }
  if (u && u.side === 1) { issueFire(sel, u); G.pend = 'move'; refreshUI(true); return; }
  if (G.pend === 'fire') issueArea(sel, p.x, p.y);
  else if (G.pend === 'smoke') issueSmoke(sel, p.x, p.y);
  else issueMove(sel, p.x, p.y, G.pend);
  G.pend = 'move'; refreshUI(true);
}

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
const rosterEl = $('roster'), toastEl = $('toast'), cardEl = $('card');
const orderBtns = [...document.querySelectorAll('#orders button')];
let toastTimer = 0;
function toast(msg) {
  if (!toastEl || G.auto) return;
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
    let lastTap = 0;
    b.addEventListener('click', () => {
      if (!live(u) || u.state >= 4) return;
      const now = performance.now();
      if (now - lastTap < 380) centerOn(u.x, u.y);
      lastTap = now;
      G.sel = [u]; G.pend = 'move'; SFX.click(); refreshUI(true);
    });
    rosterEl.append(b);
    return { u, b, c, bar: bar.firstChild, key: '' };
  });
}
const STATE_ICON = ['●', '◐', '▼', '!', '✕'];
function setBar(id, frac, col) { const el = $(id); el.style.width = (clamp(frac, 0, 1) * 100) + '%'; if (col) el.style.background = col; }
function refreshCard() {
  const sel = G.sel.filter(live);
  if (!sel.length) { cardEl.style.display = 'none'; return; }
  cardEl.style.display = 'flex';
  const u = sel[0], n = sel.length;
  const avg = (fn) => sel.reduce((s, o) => s + fn(o), 0) / n;
  const hp = avg(o => o.hp / o.maxHp), am = avg(o => o.ammo / o.ammoMax), mo = avg(o => clamp(o.morale, 0, 100) / 100);
  const st = n === 1 ? u.state : Math.max(...sel.map(o => o.state));
  $('cName').textContent = n === 1 ? u.name : '👥 ' + n;
  $('cStars').textContent = n === 1 ? '★'.repeat(u.exp + 1) + (u.med ? '🎖' : '') : '';
  setBar('cHp', hp, hp > 0.6 ? '#8bd35a' : hp > 0.3 ? '#e6c83a' : '#e8402f');
  setBar('cAmmo', am, am > 0.25 ? '#e0b24a' : '#e8402f');
  setBar('cMor', mo, MCOL[st]);
  $('cMIcon').textContent = STATE_ICON[st]; $('cMIcon').style.color = MCOL[st];
  let aux = '';
  if (n === 1) {
    const w = WPN[u.t.w];
    aux += `<span style="color:rgb(${(RING[u.t.w] || RING.rifle).col})">◎${w.indirect ? w.min + '–' : ''}${w.range}</span> `;
    if (u.ammo2Max) aux += '◆'.repeat(u.ammo2) + '<span style="opacity:.3">' + '◆'.repeat(u.ammo2Max - u.ammo2) + '</span> ';
    if (u.smokeRounds) aux += '💨' + u.smokeRounds + ' ';
    else if (u.smoke) aux += '💨' + u.smoke + ' ';
  }
  $('cAux').innerHTML = aux;
  const badges = [];
  if (n === 1) {
    if (!u.veh && inHouse(u)) badges.push('🏠');
    if (nearOfficer(u)) badges.push('⭐');
    if (u.order.type === 'hold') badges.push('🛡️');
    if (G.phase === 'battle' && G.time - u.lastFired >= 6 && (u.x < ZONE.x1 || nearOfficer(u)) && u.ammo < u.ammoMax) badges.push('⁍+');
  }
  $('cBadges').textContent = badges.join(' ');
  const g = $('cardIcon').getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 80, 80); g.setTransform(2, 0, 0, 2, 0, 0);
  drawUnitBody(g, Object.assign({}, u, { ang: 0 }), 20, 20, u.veh ? 0.95 : 1.25, 1);
}
function refreshUI(force) {
  for (const ch of chips) {
    const u = ch.u, key = [u.state, Math.round(u.hp), u.alive, u.fled, G.sel.includes(u), u.rallyT > 0].join();
    if (!force && key === ch.key) continue;
    ch.key = key;
    const g = ch.c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 76, 76);
    g.setTransform(2, 0, 0, 2, 0, 0);
    drawUnitBody(g, Object.assign({}, u, { ang: 0 }), 19, 18, u.veh ? 0.9 : 1.2, 1);
    if (u.rallyT > 0 && u.state >= 3) { g.fillStyle = '#ffd34d'; star(g, 31, 7, 5, true); }
    ch.b.style.borderColor = MCOL[u.state];
    ch.bar.style.width = (100 * Math.max(0, u.hp) / u.maxHp) + '%';
    ch.b.classList.toggle('dead', !live(u) || u.state === 4);
    ch.b.classList.toggle('sel', G.sel.includes(u));
  }
  G.sel = G.sel.filter(u => live(u) && u.state < 4);
  const deploy = G.phase === 'deploy';
  $('orders').style.display = deploy ? 'none' : 'flex';
  $('deployBar').style.display = deploy && G.running ? 'flex' : 'none';
  const any = G.sel.length > 0;
  for (const b of orderBtns) {
    const o = b.dataset.o;
    b.classList.toggle('on', any && G.pend === o && o !== 'move');
    b.disabled = !any || (o === 'smoke' && !G.sel.some(u => u.smoke > 0 || u.smokeRounds > 0));
  }
  refreshCard();
  const rem = Math.max(0, GAME_TIME - G.time);
  $('clock').textContent = `${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, '0')}`;
  $('clock').style.color = rem < 60 ? '#ffb347' : deploy ? '#9fb0ba' : '';
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
}
orderBtns.forEach(b => b.addEventListener('click', () => {
  const o = b.dataset.o;
  if (!G.sel.length) return;
  if (o === 'hold') { issueHold(G.sel); G.pend = 'move'; toast('🛡️'); }
  else { G.pend = G.pend === o ? 'move' : o; SFX.click(); }
  refreshUI(true);
}));
$('bPause').addEventListener('click', () => { if (G.running && !G.over && G.phase === 'battle') { G.paused = !G.paused; SFX.click(); refreshUI(true); } });
$('bSpeed').addEventListener('click', () => { G.speed = G.speed === 1 ? 2 : 1; SFX.click(); refreshUI(true); });
$('bMute').addEventListener('click', () => { SFX.unlock(); SFX.setMuted(!SFX.isMuted()); SFX.click(); refreshUI(true); });
$('bAll').addEventListener('click', () => {
  const all = G.units.filter(u => u.side === 0 && live(u) && u.state < 3);
  G.sel = G.sel.length === all.length ? [] : all; G.pend = 'move'; SFX.click(); refreshUI(true);
});
$('bHelp').addEventListener('click', () => { $('ovHelp').classList.remove('hidden'); if (G.running && !G.over && G.phase === 'battle') G.paused = true; refreshUI(true); });
$('bHelpClose').addEventListener('click', () => { $('ovHelp').classList.add('hidden'); });
$('bStart').addEventListener('click', () => startGame(false));
$('bRematch').addEventListener('click', () => startGame(G.auto));
$('bAuto').addEventListener('click', () => { autoDeploy(); refreshUI(true); });
$('bGo').addEventListener('click', () => beginBattle());

$('bRings').addEventListener('click', () => {
  G.ringsAll = !G.ringsAll; store.set('btf-rings', G.ringsAll ? '1' : '0'); SFX.click(); buzz(10);
  toast(G.ringsAll ? '🎯 👥' : '🎯 ✖'); refreshUI(true);
});
function paintHaptic() {
  const b = $('bHaptic');
  b.textContent = !HAPTIC_OK ? '📳 —' : hapticOn ? '📳' : '📴';
  b.disabled = !HAPTIC_OK;
}
$('bHaptic').addEventListener('click', () => {
  hapticOn = !hapticOn; store.set('btf-haptic', hapticOn ? '1' : '0'); paintHaptic(); SFX.click(); buzz(20);
});
paintHaptic();
function resetVets() {
  saveVets(null); SFX.click(); toast('♻️ 🎖');
  if (G.phase === 'deploy') for (const u of G.units) if (u.side === 0 && u.slot != null) { u.exp = B_ROSTER[u.slot][2]; u.med = 0; }
  refreshUI(true);
}
$('bVetReset').addEventListener('click', resetVets);
$('bVet2').addEventListener('click', resetVets);

// ---------------------------------------------------------------- tutorial (first launch, replay from help)
const TUT = [
  { icon: '👆', txt: 'Tap a unit' },
  { icon: '➜', txt: 'Tap the ground to move · ⏩ fast · 🐾 sneak' },
  { icon: '◎', txt: 'Solid ring: good shots · dashed: long shots · dark: no sight · tap an enemy to fire' },
  { icon: '🚩', txt: 'Hold 2 of 3 flags when ⏱ runs out' },
];
let tutStep = -1;
function openTut() {
  tutStep = 0; paintTut();
  $('ovTut').classList.remove('hidden'); $('ovHelp').classList.add('hidden');
}
function closeTut() {
  tutStep = -1; store.set('btf-tut', '1');
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
function tutHouse(c, x, y, w, h) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + 4, y + 4, w, h); c.fillStyle = '#9a5a44'; c.fillRect(x, y, w, h); c.strokeStyle = '#3a2a22'; c.lineWidth = 2; c.strokeRect(x, y, w, h); }
function drawTut(t) {
  const c = tg;
  c.setTransform(2, 0, 0, 2, 0, 0);
  c.fillStyle = '#76844f'; c.fillRect(0, 0, 300, 170);
  c.fillStyle = '#b5aa8a'; c.fillRect(0, 128, 300, 18);
  const U = (type, side, x, y, al = 1) => drawUnitBody(c, { type, side, state: 0, veh: false, ang: 0 }, x, y, 1.1, al);
  const sel = (x, y) => { c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([5, 4]); c.lineDashOffset = -t * 12; c.beginPath(); c.arc(x, y, 18, 0, TAU); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0; };
  if (tutStep === 0) {
    tutHouse(c, 200, 20, 70, 50);
    U('rifle', 0, 90, 90); U('mg', 0, 170, 105); U('officer', 0, 60, 135);
    if ((t % 2.4) > 0.75) sel(90, 90);
    finger(c, 90, 92, t);
  } else if (tutStep === 1) {
    const p = (t % 3) / 3, ux = 50 + (240 - 50) * Math.min(1, p * 1.4), uy = 120 + (50 - 120) * Math.min(1, p * 1.4);
    c.setLineDash([7, 6]); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2; c.beginPath(); c.moveTo(ux, uy); c.lineTo(240, 50); c.stroke(); c.setLineDash([]);
    c.strokeStyle = '#fff'; c.beginPath(); c.arc(240, 50, 7, 0, TAU); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(240, 50, 2.5, 0, TAU); c.fill();
    U('rifle', 0, ux, uy); sel(ux, uy);
    finger(c, 240, 52, t);
  } else if (tutStep === 2) {
    const ux = 80, uy = 100, R = 118, E = 59, col = RING.rifle.col, hx = 112, hy = 38, hw = 30, hh = 32;
    c.beginPath(); c.arc(ux, uy, R, 0, TAU); c.fillStyle = `rgba(${col},.1)`; c.fill();
    c.beginPath(); c.arc(ux, uy, E, 0, TAU); c.fillStyle = `rgba(${col},.14)`; c.fill();
    // shadow cast by the house, seen from the unit (silhouette corners pushed outward)
    const far = (x, y) => [ux + (x - ux) * 6, uy + (y - uy) * 6];
    c.save(); c.beginPath(); c.arc(ux, uy, R, 0, TAU); c.clip();
    c.beginPath(); c.moveTo(hx, hy); c.lineTo(...far(hx, hy)); c.lineTo(...far(hx + hw, hy + hh)); c.lineTo(hx + hw, hy + hh); c.lineTo(hx + hw, hy); c.closePath();
    c.fillStyle = 'rgba(8,10,6,.5)'; c.fill(); c.restore();
    tutHouse(c, hx, hy, hw, hh);
    c.beginPath(); c.arc(ux, uy, E, 0, TAU); c.strokeStyle = `rgb(${col})`; c.lineWidth = 2.2; c.stroke();
    c.beginPath(); c.arc(ux, uy, R, 0, TAU); c.setLineDash([10, 7]); c.lineWidth = 1.8; c.stroke(); c.setLineDash([]);
    ringLabel(c, ux + Math.cos(-0.25) * R - 4, uy + Math.sin(-0.25) * R - 10, '330m', col, 0.9);
    U('rifle', 0, ux, uy); sel(ux, uy);
    const ex = 158, ey = 128;
    U('rifle', 1, ex, ey); drawInRange(c, { x: ex, y: ey, veh: false }, 1, t);
    U('rifle', 1, 158, 22, 0.35);
    c.strokeStyle = `rgb(${GOOD})`; c.lineWidth = 2.6; c.beginPath(); c.moveTo(ux, uy); c.lineTo(ex, ey); c.stroke();
    c.font = 'bold 10px system-ui,sans-serif'; const tx = '120m 41%', tw = c.measureText(tx).width + 10;
    c.fillStyle = 'rgba(12,14,9,.85)'; rrect(c, 122 - tw / 2, 96, tw, 18, 9); c.fill(); c.strokeStyle = `rgb(${GOOD})`; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(tx, 122, 105.5);
    // tiny legend: solid / dashed / PIAT
    c.fillStyle = 'rgba(12,14,9,.7)'; rrect(c, 214, 6, 80, 36, 6); c.fill();
    c.font = 'bold 10px system-ui,sans-serif'; c.textAlign = 'left';
    c.strokeStyle = `rgb(${RING.piat.col})`; c.lineWidth = 3; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(220, 16); c.lineTo(240, 16); c.stroke(); c.setLineDash([]);
    c.fillStyle = `rgb(${RING.piat.col})`; c.fillText('◆ PIAT', 245, 17);
    c.strokeStyle = `rgb(${THREAT_COL})`; c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath(); c.moveTo(220, 32); c.lineTo(240, 32); c.stroke(); c.setLineDash([]);
    c.fillStyle = `rgb(${THREAT_COL})`; c.fillText('enemy', 245, 33);
  } else if (tutStep === 3) {
    const prog = (t % 4) / 4;
    [[55, 'W', 0], [150, 'B', 0], [245, 'E', 1]].forEach(([x, n, o], i) => {
      const y = 75;
      c.beginPath(); c.arc(x, y, 34, 0, TAU); c.fillStyle = o === 0 ? 'rgba(184,68,63,.25)' : 'rgba(86,100,109,.3)'; c.fill();
      c.setLineDash([5, 5]); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
      if (i === 2) { c.beginPath(); c.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * prog); c.strokeStyle = '#fff'; c.lineWidth = 8; c.stroke(); c.strokeStyle = SIDE_COL[0]; c.lineWidth = 5; c.stroke(); }
      c.strokeStyle = '#eee'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x, y - 20); c.stroke();
      c.fillStyle = SIDE_COL[o]; c.beginPath(); c.moveTo(x, y - 20); c.lineTo(x + 15, y - 14); c.lineTo(x, y - 8); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 13px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n, x, y + 48);
    });
    U('rifle', 0, 232, 92); U('rifle', 0, 258, 95);
  }
}
function paintDiff() { document.querySelectorAll('.diff').forEach(b => b.classList.toggle('on', b.dataset.d === G.diff)); }
document.querySelectorAll('.diff').forEach(b => b.addEventListener('click', () => { G.diff = b.dataset.d; store.set('btf-diff', G.diff); SFX.click(); paintDiff(); }));
paintDiff();
document.addEventListener('visibilitychange', () => { if (document.hidden && G.running && !G.over && G.phase === 'battle') { G.paused = true; refreshUI(true); } });

function updateVets(res) {
  const v = loadVets() || { exp: B_ROSTER.map(r => r[2]), xp: B_ROSTER.map(() => 0), med: B_ROSTER.map(() => 0) };
  v.xp = v.xp || B_ROSTER.map(() => 0); v.med = v.med || B_ROSTER.map(() => 0);
  const out = [];
  for (const u of G.units) {
    if (u.side !== 0 || u.slot == null) continue;
    const i = u.slot;
    if (!u.alive) { v.exp[i] = B_ROSTER[i][2]; v.xp[i] = 0; v.med[i] = 0; out[i] = 'lost'; continue; }
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
  ['W', 'B', 'E'].forEach((nm, r) => {
    const y = 6 + r * (rowH + 4);
    c.fillStyle = '#ddd'; c.font = 'bold 18px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(nm, 18, y + rowH / 2);
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
}
function buildAAR(res, rout, vet) {
  const mine = G.units.filter(u => u.side === 0 && u.slot != null);
  const lost = (s) => G.units.filter(u => u.side === s && (!u.alive || u.fled || u.state === 4)).length;
  const own = G.flags.filter(f => f.owner === 0).length;
  const stars = res === 'lose' ? 0 : res === 'draw' ? 1 : 1 + (lost(0) <= 2 ? 1 : 0) + (own === 3 || rout ? 1 : 0);
  $('endStars').innerHTML = '★'.repeat(stars) + '<span style="opacity:.25">' + '★'.repeat(3 - stars) + '</span>';
  G.stars = stars;
  const score = (u) => u.kills * 3 + (u.alive ? 2 : 0) + u.hp / u.maxHp;
  const mvp = mine.filter(u => u.kills > 0).sort((a, b) => score(b) - score(a))[0];
  G.mvp = mvp ? mvp.name : null;
  const el = $('endUnits'); el.innerHTML = '';
  for (const u of mine) {
    const row = document.createElement('div'); row.className = 'ur' + (u === mvp ? ' mvp' : '');
    const cvs = document.createElement('canvas'); cvs.width = 56; cvs.height = 56;
    const g = cvs.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
    drawUnitBody(g, Object.assign({}, u, { ang: 0, state: u.alive ? Math.min(u.state, 4) : 4 }), 14, 14, 0.9, u.alive ? 1 : 0.45);
    const st = !u.alive ? '✖' : u.fled ? '🏳' : u.state >= 3 ? '!' : '✚';
    const up = vet && vet.out[u.slot];
    const exp = vet && u.alive && !u.fled ? vet.v.exp[u.slot] : u.exp;
    const hp = Math.max(0, u.hp / u.maxHp);
    row.innerHTML = `<span class="un">${u.name}</span><span class="us">${'★'.repeat(exp + 1)}${up === 1 ? ' ⬆' : up === 2 ? ' 🎖' : ''}${up === 'lost' ? ' <s>★</s>' : ''}</span>` +
      `<span class="uk">✔${u.kills}</span><i class="uh"><b style="width:${hp * 100}%;background:${hp > 0.6 ? '#8bd35a' : hp > 0.3 ? '#e6c83a' : '#e8402f'}"></b></i>` +
      `<span class="ust">${u === mvp ? '🏅' : st}</span>`;
    row.prepend(cvs);
    el.append(row);
  }
  drawTimeline();
}
function endGame(res, rout) {
  if (G.over) return;
  G.over = true; G.result = res; G.sel = []; G.aim = null; G.inspect = null;
  SFX.engine(0); SFX.end(res);
  buzz(res === 'win' ? [30, 60, 30, 60, 90] : [120]);
  const titles = { win: 'Victory', lose: 'Defeat', draw: 'Stalemate' }, icons = { win: '🏆', lose: '🏳️', draw: '🤝' };
  $('endIcon').textContent = icons[res];
  $('endTitle').textContent = titles[res];
  $('endFlags').innerHTML = G.flags.map(f => `<span class="fl ${f.owner === 0 ? 'o0' : f.owner === 1 ? 'o1' : 'on'}">${f.name[0]}</span>`).join('');
  const tot = (s) => G.units.filter(u => u.side === s).length;
  const lost = (s) => G.units.filter(u => u.side === s && (!u.alive || u.fled || u.state === 4)).length;
  const dIcon = { easy: '🙂', normal: '😐', hard: '💀' }[G.diff];
  $('endStats').innerHTML = `${rout ? (res === 'win' ? '💥 ✔<br>' : res === 'lose' ? '🏳️<br>' : '') : '⏱ 0:00<br>'}` +
    `<span style="color:${SIDE_COL[0]}">■</span> ✖ ${lost(0)}/${tot(0)} &nbsp; <span style="color:#9fb0ba">■</span> ✖ ${lost(1)}/${tot(1)}` +
    `<br>⭐ ${G.stats.rallied[0]} &nbsp; ${dIcon}`;
  const vet = G.auto ? null : updateVets(res);
  buildAAR(res, rout, vet);
  setTimeout(() => $('ovEnd').classList.remove('hidden'), 700);
  refreshUI(true);
}
function startGame(auto) {
  newGame(auto);
  ['ovStart', 'ovEnd', 'ovHelp', 'ovTut'].forEach(id => $(id).classList.add('hidden'));
  cam.z = clamp(Math.max(VW, VH) / 1400, 0.45, 1.3); centerOn(auto ? 900 : 600, 550);
  buildRoster();
  if (auto) beginBattle();
  else { toast('🪂 👆 ▶'); if (store.get('btf-tut', '0') !== '1') openTut(); }
  refreshUI(true);
}

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0, uiT = 0;
function engineLevel() {
  if (G.phase !== 'battle' || G.paused || G.over) return SFX.engine(0);
  const cx = cam.x + VW / cam.z / 2, cy = cam.y + VH / cam.z / 2, half = Math.max(VW, VH) / cam.z / 2;
  let lv = 0;
  for (const u of G.units) if (live(u) && u.veh) {
    const near = clamp(1.2 - dxy(u.x, u.y, cx, cy) / (half * 2), 0, 1);
    lv += near * (u.moving ? 0.8 : 0.25) * (u.side === 1 && !isSeen(u, 0) ? 0.6 : 1);
  }
  SFX.engine(lv);
}
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
  uiT -= dt; if (uiT <= 0) { uiT = 0.2; refreshUI(false); engineLevel(); }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
drawMap();
newGame(false);
G.running = false;
resize();
cam.z = clamp(Math.max(VW, VH) / 1400, 0.45, 1.3); centerOn(900, 550);
requestAnimationFrame(frame);

// test / debug hooks (harmless in normal play)
window.BTF = {
  G, start: startGame, begin: beginBattle, step, autoDeploy, placeUnit, inZone, SFX,
  fast(sec) { G.silent = true; const n = Math.round(sec / DT); for (let i = 0; i < n && !G.over; i++) step(); G.silent = false; refreshUI(true); return G.time; },
  setDiff(d) { G.diff = d; paintDiff(); },
  tap, toWorld, cam, centerOn, findPath, LOS, sight, coverAt, validTarget, losU, WPN,
  aimInfo, visPoly, inRangeOf, openTut, loadVets, hitChance, DIFFS,
  haptic: () => ({ ok: HAPTIC_OK, on: hapticOn }),
};
const qs = new URLSearchParams(location.search);
if (qs.get('auto') === '1') startGame(true);
})();
