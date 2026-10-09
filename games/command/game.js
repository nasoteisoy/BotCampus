/* Command Layers: a WW2 multi-layer objectives sandbox (battalion > company > platoon > section).
   Original code and art. Plain canvas + DOM, no dependencies. Units: metres and seconds. */
(function boot() {
'use strict';
// the doctrine (all objective maps, drills and scoring weights) lives in doctrine.js; load it first if a stale page missed it
if (!window.CLDoctrine) { const sc = document.createElement('script'); sc.src = 'doctrine.js'; sc.onload = boot; document.head.appendChild(sc); return; }
const DOCL = window.CLDoctrine.load(), DOC = DOCL.doc;
const VERSION = 'v1.2';
const WW = 1200, WH = 900, TAU = Math.PI * 2, TICK = 0.5;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const t = l2 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return hyp(px - ax - vx * t, py - ay - vy * t);
}
function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (!d) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
function segRect(ax, ay, bx, by, x0, y0, x1, y1) {
  const dx = bx - ax, dy = by - ay; let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
    if (p === 0) { if (q < 0) return false; } else {
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return t0 <= t1;
}
function polyDist(P, x, y) { let b = 1e9; for (let i = 0; i < P.length - 1; i++) b = Math.min(b, segDist(x, y, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1])); return b; }

// ---------------------------------------------------------------- map (metres; north is up, the British attack from the south)
const RIVER = [[0, 214], [180, 196], [360, 204], [520, 226], [690, 214], [860, 196], [1040, 206], [1200, 198]], RIVER_W = 24;
const BRIDGE = { x: 690, y: 214 };
const ROADS = [
  [[690, 0], [690, 180], [690, 250], [650, 360], [620, 450], [608, 620], [600, 900]],
  [[0, 478], [180, 470], [300, 462], [460, 456], [620, 450], [800, 444], [1000, 432], [1200, 428]],
  [[300, 462], [292, 520], [286, 572]],
];
const HOUSES = [
  // village round the crossroads
  [560, 428, 14, 12], [645, 405, 14, 12], [655, 462, 14, 14], [590, 462, 14, 14], [628, 470, 12, 12],
  [560, 462, 16, 12], [585, 425, 14, 12], [672, 425, 14, 12], [700, 456, 12, 14], [584, 500, 12, 14],
  // church (nave + tower)
  [516, 372, 22, 42, 'church'], [521, 359, 12, 13, 'church'],
  // farm
  [266, 584, 22, 14, 'farm'], [296, 596, 14, 26, 'farm'],
  // north bank hamlet
  [640, 120, 14, 12], [728, 112, 16, 12],
].map(([x, y, w, h, k]) => ({ x, y, w, h, k: k || 'house' }));
const WOOD = { x: 960, y: 560, rx: 150, ry: 110 };
const RIDGE = { x: 230, y: 330, rx: 230, ry: 78, a: -0.25 };
const HEDGES = [
  [[60, 700], [280, 690]], [[320, 688], [560, 700]], [[640, 700], [900, 690]], [[950, 705], [1150, 690]],
  [[100, 540], [240, 530]], [[380, 560], [520, 540]], [[740, 560], [800, 640]],
  [[420, 330], [480, 420]], [[740, 330], [820, 380]], [[840, 300], [1000, 320]],
  [[150, 780], [150, 880]], [[450, 760], [450, 880]], [[780, 760], [780, 880]], [[360, 470], [380, 640]],
];
const FEATS = [
  { id: 'bridge', name: 'Bridge', x: 690, y: 222, r: 45, icon: '🌉' },
  { id: 'xroads', name: 'Crossroads', x: 622, y: 452, r: 70, icon: '✚' },
  { id: 'church', name: 'Church', x: 527, y: 392, r: 55, icon: '⛪' },
  { id: 'wood', name: 'Wood', x: 950, y: 560, r: 120, icon: '🌲' },
  { id: 'ridge', name: 'Ridge', x: 230, y: 330, r: 110, icon: '⛰' },
  { id: 'farm', name: 'Farm', x: 288, y: 598, r: 55, icon: '🏚' },
  { id: 'nbank', name: 'North bank', x: 690, y: 130, r: 70, icon: '🏞' },
  { id: 'start', name: 'Start line', x: 620, y: 810, r: 160, icon: '🚩' },
];
const FEAT = Object.fromEntries(FEATS.map(f => [f.id, f]));
const TREES = (() => { const r = mulberry(11), out = []; for (let i = 0; i < 420; i++) { const a = r() * TAU, d = Math.sqrt(r()); out.push([WOOD.x + Math.cos(a) * d * WOOD.rx * 0.97, WOOD.y + Math.sin(a) * d * WOOD.ry * 0.97, 4 + r() * 5]); } return out; })();
const inWood = (x, y) => ((x - WOOD.x) / WOOD.rx) ** 2 + ((y - WOOD.y) / WOOD.ry) ** 2 < 1;
function elev(x, y) {
  const c = Math.cos(-RIDGE.a), s = Math.sin(-RIDGE.a), dx = x - RIDGE.x, dy = y - RIDGE.y;
  const u = dx * c - dy * s, v = dx * s + dy * c;
  return Math.max(0, 1 - (u / RIDGE.rx) ** 2 - (v / RIDGE.ry) ** 2);
}
const onBridge = (x, y) => Math.abs(x - BRIDGE.x) < 8 && Math.abs(y - BRIDGE.y) < 26;
const inRiver = (x, y) => !onBridge(x, y) && polyDist(RIVER, x, y) < RIVER_W / 2;
const houseAt = (x, y, m = 0) => HOUSES.find(h => x > h.x - m && x < h.x + h.w + m && y > h.y - m && y < h.y + h.h + m);
const hedgeDist = (x, y) => { let b = 1e9; for (const [a, c] of HEDGES) b = Math.min(b, segDist(x, y, a[0], a[1], c[0], c[1])); return b; };
const roadDist = (x, y) => { let b = 1e9; for (const R of ROADS) b = Math.min(b, polyDist(R, x, y)); return b; };
function coverAt(x, y) {
  const h = houseAt(x, y, 5);
  if (h) return h.k === 'church' ? 0.32 : 0.4;
  if (inWood(x, y)) return 0.55;
  if (hedgeDist(x, y) < 6) return 0.6;
  if (elev(x, y) > 0.55) return 0.85;
  return 1;
}
function terrMul(x, y) {
  if (inWood(x, y)) return 0.6;
  if (hedgeDist(x, y) < 3) return 0.5;
  if (roadDist(x, y) < 5) return 1.2;
  return 1;
}
// line of sight: houses, the wood, hedges (unless you're on them) and the ridge crest
function los(ax, ay, bx, by) {
  const ea = elev(ax, ay), eb = elev(bx, by), high = ea > 0.45 || eb > 0.45;
  for (const h of HOUSES) {
    if ((ax > h.x - 4 && ax < h.x + h.w + 4 && ay > h.y - 4 && ay < h.y + h.h + 4) || (bx > h.x - 4 && bx < h.x + h.w + 4 && by > h.y - 4 && by < h.y + h.h + 4)) continue;
    if (segRect(ax, ay, bx, by, h.x, h.y, h.x + h.w, h.y + h.h)) return false;
  }
  const L = hyp(bx - ax, by - ay), n = Math.ceil(L / 8);
  let woodRun = 0;
  for (let i = 1; i < n; i++) {
    const t = i / n, x = lerp(ax, bx, t), y = lerp(ay, by, t), dA = t * L, dB = L - dA;
    if (dA > 22 && dB > 22 && inWood(x, y)) { woodRun += L / n; if (woodRun > 30) return false; }
    if (!high && elev(x, y) > 0.6 && ea < 0.35 && eb < 0.35) return false; // over the crest
  }
  if (!high) for (const [p, q] of HEDGES) {
    if (segSeg(ax, ay, bx, by, p[0], p[1], q[0], q[1]) && segDist(ax, ay, p[0], p[1], q[0], q[1]) > 12 && segDist(bx, by, p[0], p[1], q[0], q[1]) > 12) return false;
  }
  return true;
}


// line of sight to an objective: for the wood, seeing its near edge counts
function losT(ax, ay, bx, by) {
  if (los(ax, ay, bx, by)) return true;
  if (!inWood(bx, by)) return false;
  const L = hyp(ax - bx, ay - by), ux = (ax - bx) / L, uy = (ay - by) / L;
  let d = 0; while (d < L && inWood(bx + ux * d, by + uy * d)) d += 5;
  d = Math.max(0, d - 14);
  return los(ax, ay, bx + ux * d, by + uy * d);
}
// ---------------------------------------------------------------- pathfinding: 5 m weighted grid, A*, string-pull
const GC = 5, GX = WW / GC, GY = WH / GC, NC = GX * GY;
const costG = new Uint8Array(NC); // 0 = blocked, else cost x10
(function buildGrid() {
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    const x = gx * GC + GC / 2, y = gy * GC + GC / 2;
    let c = 10;
    if (houseAt(x, y, 2) || inRiver(x, y)) c = 0;
    else if (roadDist(x, y) < 5 || onBridge(x, y)) c = 8;
    else if (inWood(x, y)) c = 17;
    else if (hedgeDist(x, y) < 3) c = 26;
    else if (elev(x, y) > 0.3) c = 11;
    if (gx === 0 || gy === 0 || gx === GX - 1 || gy === GY - 1) c = 0;
    costG[gy * GX + gx] = c;
  }
})();
const cellAt = (x, y) => clamp(Math.floor(y / GC), 0, GY - 1) * GX + clamp(Math.floor(x / GC), 0, GX - 1);
const passable = (x, y) => costG[cellAt(x, y)] > 0;
function nearestOpen(x, y) {
  if (passable(x, y)) return { x, y };
  for (let r = GC; r < 120; r += GC) for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (px > 5 && py > 5 && px < WW - 5 && py < WH - 5 && passable(px, py)) return { x: px, y: py }; }
  return { x, y };
}
const gS = new Float32Array(NC), seen = new Uint32Array(NC), shut = new Uint32Array(NC), from = new Int32Array(NC);
const HEAP = 1 << 18, hI = new Int32Array(HEAP), hF = new Float32Array(HEAP);
let gen = 0, hn = 0;
function hPush(i, f) { if (hn >= HEAP) return; let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hF[p] <= f) break; hI[k] = hI[p]; hF[k] = hF[p]; k = p; } hI[k] = i; hF[k] = f; }
function hPop() { const top = hI[0], li = hI[--hn], lf = hF[hn]; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && hF[c + 1] < hF[c]) c++; if (hF[c] >= lf) break; hI[k] = hI[c]; hF[k] = hF[c]; k = c; } hI[k] = li; hF[k] = lf; return top; }
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
function astar(start, goal) {
  if (start === goal) return [goal];
  const g0 = goal % GX, g1 = (goal / GX) | 0;
  gen++; hn = 0;
  const hf = (x, y) => { const dx = Math.abs(x - g0), dy = Math.abs(y - g1); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * 0.8; };
  gS[start] = 0; seen[start] = gen; from[start] = -1; hPush(start, hf(start % GX, (start / GX) | 0));
  let budget = 45000;
  while (hn > 0 && budget-- > 0) {
    const cur = hPop();
    if (shut[cur] === gen) continue;
    shut[cur] = gen;
    if (cur === goal) { const out = []; for (let c = cur; c !== -1; c = from[c]) out.push(c); return out.reverse(); }
    const cx = cur % GX, cy = (cur / GX) | 0, g = gS[cur];
    for (const [ox, oy, d] of NB) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= GX || ny >= GY) continue;
      const ni = ny * GX + nx, c = costG[ni];
      if (!c || shut[ni] === gen) continue;
      if (ox && oy && (!costG[cy * GX + nx] || !costG[ny * GX + cx])) continue;
      const ng = g + d * c / 10;
      if (seen[ni] === gen && ng >= gS[ni]) continue;
      seen[ni] = gen; gS[ni] = ng; from[ni] = cur; hPush(ni, ng + hf(nx, ny));
    }
  }
  return null;
}
function lineOK(ax, ay, bx, by, maxC) {
  const L = hyp(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 2.5));
  for (let i = 0; i <= n; i++) { const c = costG[cellAt(lerp(ax, bx, i / n), lerp(ay, by, i / n))]; if (!c || c > maxC) return false; }
  return true;
}
const STATS = { plans: 0, planMs: 0, fail: 0 };
function findPath(sx, sy, tx, ty) {
  const g = nearestOpen(tx, ty); tx = g.x; ty = g.y;
  if (lineOK(sx, sy, tx, ty, 11)) return [{ x: tx, y: ty }];
  const t0 = performance.now();
  const st = nearestOpen(sx, sy);
  const cells = astar(cellAt(st.x, st.y), cellAt(tx, ty));
  STATS.plans++; STATS.planMs += performance.now() - t0;
  if (!cells) { STATS.fail++; return [{ x: tx, y: ty }]; }
  const pts = cells.map(c => ({ x: (c % GX) * GC + GC / 2, y: ((c / GX) | 0) * GC + GC / 2, c: costG[c] }));
  pts[pts.length - 1] = { x: tx, y: ty, c: 10 };
  const out = []; let ax = sx, ay = sy, i = 0;
  while (i < pts.length - 1) {
    let j = i + 1, mc = Math.max(10, pts[j].c);
    while (j + 1 < pts.length) { const m2 = Math.max(mc, pts[j + 1].c); if (!lineOK(ax, ay, pts[j + 1].x, pts[j + 1].y, m2)) break; j++; mc = m2; }
    out.push({ x: pts[j].x, y: pts[j].y }); ax = pts[j].x; ay = pts[j].y; i = j;
  }
  return out;
}

// ---------------------------------------------------------------- order of battle, commanders
const COYS = [{ id: 'A', col: '#e4573f', home: [300, 840] }, { id: 'B', col: '#3f8fe4', home: [620, 845] }, { id: 'C', col: '#e8c440', home: [950, 840] }];
const COYCOL = Object.fromEntries(COYS.map(c => [c.id, c.col]));
const BN = { id: 'BN', name: '1st Bn', col: '#efe6c8', home: [623, 872] }; // battalion HQ (a marker: it doesn't fight)
COYCOL.BN = BN.col;
const BN_FROM = { x: avgOf(COYS.map(c => c.home[0])), y: avgOf(COYS.map(c => c.home[1])) };
function avgOf(a) { return a.reduce((s, v) => s + v, 0) / a.length; }
const QUIRKS = { aggressive: ['🔥', 'Aggressive'], cautious: ['🐢', 'Cautious'], glory: ['🏅', 'Glory-seeker'], book: ['📘', 'By-the-book'] };
const FIRST = ['Alfie', 'Bert', 'Cyril', 'Dennis', 'Eddie', 'Frank', 'George', 'Harry', 'Ivor', 'Jack', 'Ken', 'Len', 'Monty', 'Norman', 'Ollie', 'Percy', 'Reg', 'Stan', 'Ted', 'Vic', 'Wilf', 'Arthur', 'Basil', 'Clive', 'Donald', 'Ernie', 'Fred', 'Gordon', 'Hugh', 'Jim', 'Laurie', 'Maurice', 'Neville', 'Ron', 'Sid', 'Tom', 'Wally', 'Les', 'Alec', 'Bob'];
const LAST = ['Ashby', 'Barlow', 'Carver', 'Dunmore', 'Ellery', 'Fenwick', 'Garside', 'Hollis', 'Ingram', 'Jessop', 'Kettle', 'Lofthouse', 'Marlow', 'Naylor', 'Oakes', 'Pruett', 'Quayle', 'Rudd', 'Selby', 'Thwaite', 'Upton', 'Varley', 'Whitlock', 'Yeats', 'Brindle', 'Cobbold', 'Dimmock', 'Frayne', 'Gadsby', 'Hext', 'Kember', 'Lusk', 'Mabey', 'Pell', 'Rook', 'Starling', 'Tebbit', 'Wragg', 'Cottam', 'Penhale', 'Druce', 'Halsey'];
const S = {
  seed: 1, rng: mulberry(1), time: 0, phase: 'plan', speed: 4, paused: true, autoPause: store.get('cl-ap', '1') === '1',
  hqExp: +store.get('cl-hq', '1'), units: [], U: {}, nodes: {}, feed: [], reqs: [], toasts: [], tracers: [], pending: [],
  sel: null, nextReq: 1, casualty: {}, stats: STATS, endMsg: null, dbg: {}, dragOn: false,
};
const R = () => S.rng();
// the battalion CO plans with his own random stream, so adding the battalion layer leaves the companies' dice untouched
function withB(fn) { const m = S.rng; S.rng = S.brng; try { return fn(); } finally { S.rng = m; } }
const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += R(); return (u - 2) / 0.577; };
function mkPersona(level) {
  if (level === 'bn') { // a battalion CO: more experienced, usually sharper
    const b = () => clamp(0.15 + 0.7 * R() + (R() - 0.5) * 0.3, 0.02, 0.98), q = R();
    return { first: FIRST[(R() * FIRST.length) | 0], last: LAST[(R() * LAST.length) | 0], rank: 'Lt Col', obed: b(), judg: clamp(b() + 0.12, 0, 0.98), exp: clamp(b() + 0.25, 0, 0.98),
      quirk: q < 0.16 ? 'aggressive' : q < 0.32 ? 'cautious' : q < 0.44 ? 'glory' : q < 0.58 ? 'book' : null, trust: 0.5 };
  }
  const rank = level === 'coy' ? (R() < 0.6 ? 'Maj' : 'Capt') : level === 'pl' ? (R() < 0.6 ? 'Lt' : '2Lt') : (R() < 0.75 ? 'Cpl' : 'Sgt');
  const b = () => clamp(0.15 + 0.7 * R() + (R() - 0.5) * 0.3, 0.02, 0.98);
  const q = R();
  return {
    first: FIRST[(R() * FIRST.length) | 0], last: LAST[(R() * LAST.length) | 0], rank,
    obed: b(), judg: b(), exp: level === 'sec' ? b() : clamp(b() + 0.1, 0, 1),
    quirk: q < 0.16 ? 'aggressive' : q < 0.32 ? 'cautious' : q < 0.44 ? 'glory' : q < 0.58 ? 'book' : null, trust: 0.5,
  };
}
const cname = (c) => `${c.rank} ${c.last}`;
function mkUnit(o) {
  return Object.assign({
    px: o.x, py: o.y, a: -Math.PI / 2, path: null, gx: NaN, gy: NaN, supp: 0, morale: o.side === 'GB' ? 80 : 75, state: 'ok',
    fireCd: R() * 4, firedT: -99, hitT: -99, men0: o.men, moving: false, seenT: -999, last: null, vis: false, kills: 0, ph: 0, waitT: 0,
    pinT: 0, okT: 0,
  }, o);
}
function buildOOB() {
  S.units = []; S.U = {};
  const add = (u) => { u = mkUnit(u); S.units.push(u); S.U[u.id] = u; return u; };
  COYS.forEach((C, ci) => {
    const [hx, hy] = C.home;
    add({ id: C.id, side: 'GB', kind: 'coyhq', coy: C.id, name: `${C.id} Coy HQ`, men: 6, lmg: 0, x: hx, y: hy + 35, cmdr: mkPersona('coy') });
    for (let p = 0; p < 3; p++) {
      const pn = ci * 3 + p + 1, pid = 'P' + pn, px = hx + (p - 1) * 85, py = hy;
      add({ id: pid, side: 'GB', kind: 'plhq', coy: C.id, pl: pid, pn, name: `${pn} Pl HQ`, men: 4, lmg: 0, x: px, y: py + 18, cmdr: mkPersona('pl') });
      for (let s = 0; s < 3; s++) add({ id: `${pid}S${s + 1}`, side: 'GB', kind: 'sec', coy: C.id, pl: pid, pn, sn: s + 1, name: `${pn} Pl/${s + 1} Sec`, men: 10, lmg: 1, x: px + (s - 1) * 24, y: py - 12, cmdr: mkPersona('sec') });
    }
  });
  // battalion HQ: kept out of S.units (no firing, no casualties, no dice in the battle loop)
  S.U.BN = withB(() => mkUnit({ id: 'BN', side: 'GB', kind: 'bnhq', coy: 'BN', name: '1st Bn HQ', men: 8, lmg: 0, x: BN.home[0], y: BN.home[1], cmdr: mkPersona('bn') }));
  // German force: positions vary by scenario
  const v = S.seed % 3;
  const G = [
    ['church', 527, 384, 'mg'], ['church', 548, 418, 'sec'], ['xroads', 640, 440, v === 1 ? 'mg' : 'sec'], ['farm', 282, 578, v === 2 ? 'mg' : 'sec'],
    ['wood', 905, 518, v === 0 ? 'mg' : 'sec'], ['wood', 985, 602, 'sec'], ['bridge', 690, 252, 'mg'], ['ridge', 236, 318, 'op'],
    ['nbank', 665, 140, 'res'], ['nbank', 715, 140, 'res'], ...(v === 2 ? [['nbank', 690, 120, 'res']] : []),
  ];
  G.forEach(([f, x, y, k], i) => add({
    id: 'G' + (i + 1), side: 'DE', kind: k === 'mg' ? 'mg' : 'gsec', role: k === 'res' ? 'reserve' : k === 'op' ? 'outpost' : 'hold', feat: f, home: f,
    name: k === 'mg' ? 'MG team' : k === 'op' ? 'Outpost' : 'Gruppe', men: k === 'mg' ? 6 : k === 'op' ? 6 : 9, lmg: k === 'mg' ? 2 : 1, x, y, postX: x, postY: y,
  }));
}
const alive = (u) => u && u.state !== 'dead' && u.state !== 'surr';
const secsOf = (plId) => [1, 2, 3].map(s => S.U[`${plId}S${s}`]);
const plsOf = (coy) => [0, 1, 2].map(p => S.U['P' + (COYS.findIndex(c => c.id === coy) * 3 + p + 1)]);
function strength(units) { let m = 0, m0 = 0; for (const u of units) { m0 += u.men0; if (alive(u)) m += u.men; } return m0 ? m / m0 : 0; }
const coyUnits = (coy) => S.units.filter(u => u.side === 'GB' && u.coy === coy);
function centroid(us) { const a = us.filter(alive); if (!a.length) return { x: 0, y: 0 }; return { x: a.reduce((s, u) => s + u.x, 0) / a.length, y: a.reduce((s, u) => s + u.y, 0) / a.length }; }
function tName(p) {
  if (!p) return '—';
  let best = null;
  for (const f of FEATS) { const d = hyp(f.x - p.x, f.y - p.y); if (d < f.r * 1.25 && (!best || d < best.d)) best = { f, d }; }
  return best ? best.f.name : `Grid ${String(Math.round(p.x / 10)).padStart(3, '0')}-${String(Math.round((WH - p.y) / 10)).padStart(3, '0')}`;
}

// ---------------------------------------------------------------- task types
// icons + labels, and which task types each level can be given: from the doctrine (Objective Editor)
const T = Object.fromEntries(Object.entries(DOC.types).map(([k, v]) => [k, [v.icon, v.label]]));
const TYPES = DOC.levels;
const FIRE_T = new Set(['sbf', 'suppress', 'overwatch']);

// ---------------------------------------------------------------- plan scoring (0-100) + reasons
const P = (x, y) => ({ x: clamp(x, 8, WW - 8), y: clamp(y, 8, WH - 8) });
const unitV = (dx, dy) => { const l = hyp(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
function approachCover(a, b) { let c = 0; const n = 10; for (let i = 1; i <= n; i++) { const t = i / n; if (coverAt(lerp(a.x, b.x, t), lerp(a.y, b.y, t)) < 0.9) c++; } return c / n; }
const angBetween = (a, b) => Math.acos(clamp((a.x * b.x + a.y * b.y) / ((hyp(a.x, a.y) || 1) * (hyp(b.x, b.y) || 1)), -1, 1));
const coverScore = (p) => (1 - coverAt(p.x, p.y)) / 0.68; // 0 open .. 1 church
// section task quality
function rateSec(sp, ad) {
  const notes = []; let q = 0; const W = DOC.score.sec;
  const pos = sp.pos || sp.target, tg = sp.target;
  if (!passable(pos.x, pos.y)) { notes.push("can't stand there"); return { q: 5, notes }; }
  if (sp.type === 'suppress' || sp.type === 'overwatch') {
    if (losT(pos.x, pos.y, tg.x, tg.y)) q += W.fireLos; else notes.push('no line of sight to the target');
    const cs = coverScore(pos); q += W.fireCover * cs; if (cs < 0.2) notes.push('no cover there');
    const d = hyp(tg.x - pos.x, tg.y - pos.y);
    if (d > W.rangeMin && d < W.rangeMax) q += W.fireRange; else { q += Math.max(0, W.fireRange - Math.abs(d < W.rangeMin ? W.rangeMin - d : d - W.rangeMax) / 6); notes.push(d < W.rangeMin ? 'too close' : 'too far to shoot'); }
  } else if (sp.type === 'assault') {
    q += W.assaultBase;
    const fup = sp.pos || pos;
    const cs = coverScore(fup); q += W.fupCover * cs; if (sp.pos && cs < 0.2) notes.push('start point in the open');
    const ac = approachCover(fup, tg); q += W.approach * ac; if (ac < 0.3) notes.push('across open ground');
    const d = hyp(tg.x - fup.x, tg.y - fup.y); q += d < W.runInMax ? W.runIn : Math.max(0, W.runIn - (d - W.runInMax) / 10);
    if (d >= W.runInMax) notes.push('long run in');
  } else if (sp.type === 'hold') {
    const cs = coverScore(pos); q += W.holdCover * cs; if (cs < 0.2) notes.push('no cover there');
    const fx = pos.x + ad.x * 150, fy = pos.y + ad.y * 150;
    if (losT(pos.x, pos.y, fx, fy)) q += W.holdField; else notes.push('no field of fire');
    q += W.holdBase;
  } else { // move
    q += W.moveBase + W.moveApproach * approachCover(sp.pos || pos, tg) + W.moveCover * coverScore(pos);
  }
  return { q: clamp(Math.round(q), 0, 100), notes };
}
// company / platoon plan quality: geometry of the roles together
function ratePlan(kind, X, roles, from) {
  const notes = []; let q = 0; const SC = DOC.score;
  const ad = unitV(X.x - from.x, X.y - from.y);
  const has = (t) => roles.filter(r => r && r.type === t);
  const fire = roles.filter(r => r && FIRE_T.has(r.type));
  const asl = roles.filter(r => r && (r.type === 'assault' || r.type === 'clear'));
  if (kind === 'seize' || kind === 'clear' || kind === 'assault') {
    const W = SC.attack, sup = fire[0];
    if (sup && sup.pos) {
      if (losT(sup.pos.x, sup.pos.y, X.x, X.y)) q += W.supLos; else notes.push("support can't see the objective");
      q += W.supCover * coverScore(sup.pos);
      const d = hyp(sup.pos.x - X.x, sup.pos.y - X.y); if (d > W.supMin && d < W.supMax) q += W.supRange; else notes.push(d <= W.supMin ? 'support too close' : 'support too far back');
    } else if (kind !== 'clear') notes.push('no fire support');
    else q += W.clearNoSup;
    const a = asl[0];
    if (a) {
      const fup = a.pos || from;
      const ref = sup && sup.pos ? { x: sup.pos.x - X.x, y: sup.pos.y - X.y } : { x: from.x - X.x, y: from.y - X.y };
      const ang = angBetween({ x: fup.x - X.x, y: fup.y - X.y }, ref);
      if (ang > W.flankAngle) q += W.flank; else notes.push(sup ? 'frontal, in line with our own fire' : 'frontal assault');
      const ac = approachCover(fup, a.target); q += W.approach * ac; if (ac < 0.3) notes.push('across open ground');
      if (hyp(a.target.x - X.x, a.target.y - X.y) < W.onTargetDist) q += W.onTarget; else notes.push('wrong target');
    } else notes.push('nobody assaults');
    if (has('reserve').length || has('cutoff').length || has('hold').length || roles.some(r => r && r.type === 'overwatch')) q += W.reserve; else notes.push('no reserve');
    q += W.base;
  } else if (kind === 'hold' || kind === 'reserve' || kind === 'cutoff') {
    const W = SC.defend, ps = roles.filter(Boolean).map(r => r.pos || r.target);
    q += W.cover * ps.reduce((s, p) => s + coverScore(p), 0) / Math.max(1, ps.length);
    const depth = ps.some(p => (X.x - p.x) * ad.x + (X.y - p.y) * ad.y > W.depthDist);
    if (depth || kind !== 'hold') q += W.depth; else notes.push('no depth');
    let minD = 1e9, maxD = 0; for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = hyp(ps[i].x - ps[j].x, ps[i].y - ps[j].y); minD = Math.min(minD, d); maxD = Math.max(maxD, d); }
    if (minD > W.minGap && maxD < W.maxGap) q += W.spacing; else notes.push(minD <= W.minGap ? 'bunched up' : 'too spread out');
    const fof = ps.filter(p => losT(p.x, p.y, p.x + ad.x * W.fieldRange, p.y + ad.y * W.fieldRange)).length / Math.max(1, ps.length);
    q += W.fields * fof; if (fof < 0.5) notes.push('poor fields of fire');
  } else if (kind === 'screen') {
    const W = SC.screen, ps = roles.filter(Boolean).map(r => r.pos || r.target);
    let maxD = 0; for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) maxD = Math.max(maxD, hyp(ps[i].x - ps[j].x, ps[i].y - ps[j].y));
    if (maxD > W.minSpread) q += W.spread; else notes.push('bunched up');
    const fof = ps.filter(p => losT(p.x, p.y, p.x + ad.x * W.viewRange, p.y + ad.y * W.viewRange)).length / Math.max(1, ps.length);
    q += W.view * fof; if (fof < 0.5) notes.push("can't see the approaches");
    q += W.cover * ps.reduce((s, p) => s + coverScore(p), 0) / Math.max(1, ps.length);
  } else if (kind === 'recon') {
    const W = SC.recon, r = roles.find(x => x && (x.type === 'recon' || x.type === 'overwatch'));
    if (r && r.pos && losT(r.pos.x, r.pos.y, X.x, X.y)) q += W.observer; else notes.push("observers can't see the target");
    if (fire.length) q += W.coveringFire; else notes.push('no covering fire');
    if (roles.filter(x => x && (x.type === 'reserve' || x.type === 'hold')).length) q += W.reserve; else notes.push('everyone forward');
  } else if (kind === 'sbf') {
    const W = SC.sbf, f = fire.length ? fire : roles.filter(Boolean);
    const seeing = f.filter(r => r.pos && losT(r.pos.x, r.pos.y, X.x, X.y)).length;
    q += W.seeing * seeing / Math.max(1, f.length); if (seeing < f.length) notes.push("some can't see the target");
    q += W.cover * f.reduce((s, r) => s + coverScore(r.pos || r.target), 0) / Math.max(1, f.length);
    if (roles.some(r => r && (r.type === 'reserve' || r.type === 'hold'))) q += W.reserve; else notes.push('no reserve');
  } else if (kind === 'withdraw') {
    const W = SC.withdraw;
    if (roles.some(r => r && r.gate)) q += W.rearguard; else notes.push('no rearguard');
    const near = roles.filter(r => r && hyp((r.pos || r.target).x - X.x, (r.pos || r.target).y - X.y) < W.nearDist).length;
    q += W.near * near / Math.max(1, roles.filter(Boolean).length);
  } else { q = SC.other.base; }
  return { q: clamp(Math.round(q), 0, 100), notes };
}
// battalion plan quality: main effort on the objective, flanking enemy positions dealt with, fire base, reserve, frontage
const OFF_T = new Set(['seize', 'clear', 'assault']);
// known enemy-held features flanking the approach to X (not the objective itself, not beyond it)
function threatFeats(X, from) {
  const W = DOC.score.bn, ad = unitV(X.x - from.x, X.y - from.y), perp = { x: -ad.y, y: ad.x };
  return FEATS.filter(f => f.id !== 'start').map(f => {
    const dx = f.x - X.x, dy = f.y - X.y;
    return { f, d: hyp(dx, dy), fwd: dx * ad.x + dy * ad.y, lat: dx * perp.x + dy * perp.y };
  }).filter(o => o.d > W.threatMin && o.d <= W.threatMax && o.fwd <= W.threatFwd && enemyNear(o.f, o.f.r, true).n > 0);
}
function rateBn(kind, X, roles, from) {
  const notes = []; let q = 0; const W = DOC.score.bn;
  const rs = roles.filter(Boolean), dX = (r) => hyp(r.target.x - X.x, r.target.y - X.y);
  const ad = unitV(X.x - from.x, X.y - from.y);
  if (kind === 'attack' || kind === 'recon') {
    const mainT = kind === 'attack' ? OFF_T : new Set(['recon', 'seize', 'clear']);
    if (rs.some(r => mainT.has(r.type) && dX(r) < W.onObjDist)) q += W.main; else notes.push(kind === 'attack' ? 'nobody takes the objective' : 'nobody looks at the objective');
    const th = threatFeats(X, from), cov = th.filter(o => rs.some(r => r.type !== 'reserve' && r.type !== 'withdraw' && hyp(r.target.x - o.f.x, r.target.y - o.f.y) < 90));
    q += W.flanks * (th.length ? cov.length / th.length : 1);
    for (const o of th) if (!cov.includes(o)) notes.push(`${o.f.name} on the flank left alone`);
    if (rs.some(r => r.type === 'sbf' && dX(r) < W.onObjDist)) q += W.fire; else if (kind === 'attack') notes.push('no fire base');
    if (rs.some(r => r.type === 'reserve' || r.type === 'hold')) q += W.reserve; else notes.push('no reserve');
    q += W.base;
  } else if (kind === 'defend' || kind === 'screen') {
    const ps = rs.map(r => r.target);
    if (rs.some(r => dX(r) < W.onObjDist * 2)) q += W.main; else notes.push('nobody on the objective');
    let minD = 1e9, maxD = 0; for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = hyp(ps[i].x - ps[j].x, ps[i].y - ps[j].y); minD = Math.min(minD, d); maxD = Math.max(maxD, d); }
    if (minD > W.minGap && maxD < W.maxSpread) q += W.spread; else notes.push(minD <= W.minGap ? 'companies bunched up' : 'frontage too wide');
    if (kind === 'defend') { if (ps.some(p => (X.x - p.x) * ad.x + (X.y - p.y) * ad.y > W.depthDist)) q += W.depth; else notes.push('no depth'); }
    else { const v = ps.filter(p => losT(p.x, p.y, p.x + ad.x * W.viewRange, p.y + ad.y * W.viewRange)).length / Math.max(1, ps.length); q += W.view * v; if (v < 0.5) notes.push("can't see the approaches"); }
    q += W.cover * ps.reduce((s, p) => s + coverScore(p), 0) / Math.max(1, ps.length);
    q += W.base;
  } else if (kind === 'withdraw') {
    if (rs.some(r => r.gate === 'rear')) q += W.rearguard; else notes.push('no rearguard');
    q += W.near * rs.filter(r => dX(r) < W.nearDist).length / Math.max(1, rs.length);
    q += W.base;
  } else q = DOC.score.other.base;
  return { q: clamp(Math.round(q), 0, 100), notes };
}
// a leader picks a spot: smart ones find cover + line of sight, dumb ones pick almost anywhere
function pickPos(c, rad, tgt, cmdr) {
  const noise = 50 * (1 - cmdr.judg) * (1 - 0.4 * cmdr.exp);
  let best = null, bp = -1e9;
  for (let k = 0; k < 14; k++) {
    const a = R() * TAU, d = k === 0 ? 0 : Math.sqrt(R()) * rad;
    const p = P(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d);
    if (!passable(p.x, p.y)) continue;
    let sc = 45 * coverScore(p) + 8 * elev(p.x, p.y);
    if (tgt) sc += losT(p.x, p.y, tgt.x, tgt.y) ? 50 : 0;
    const perc = sc + gauss() * noise;
    if (perc > bp) { bp = perc; best = p; }
  }
  return best || nearestOpen(c.x, c.y);
}
// support-by-fire candidates around X on our side
function supportCands(X, from) {
  const back = Math.atan2(from.y - X.y, from.x - X.x), out = [];
  for (let d = 160; d <= 340; d += 45) for (let k = -4; k <= 4; k++) {
    const a = back + k * 0.35, p = P(X.x + Math.cos(a) * d, X.y + Math.sin(a) * d);
    if (!passable(p.x, p.y)) continue;
    const l = losT(p.x, p.y, X.x, X.y);
    out.push({ p, sc: (l ? 40 : 0) + 30 * coverScore(p) + 15 * elev(p.x, p.y) + 20 - Math.abs(d - 240) / 6 - hyp(p.x - from.x, p.y - from.y) / 40, l });
  }
  return out.sort((a, b) => b.sc - a.sc);
}
function fupAt(X, from, ang, dist = 130) {
  const back = Math.atan2(from.y - X.y, from.x - X.x) + ang;
  return nearestOpen(X.x + Math.cos(back) * dist, X.y + Math.sin(back) * dist);
}
// ---- objective maps (doctrine.bn / doctrine.coy / doctrine.pl, editable in the Objective Editor)
const tagObj = (tags) => { const o = {}; for (const t of tags) o[t] = 1; return o; };
const bnKind = (t) => (DOC.bn[t] ? DOC.bn[t].scoreAs : 'other');
// candidate company role-sets for a battalion objective: one per variant
function bnCandidates(type, X, from) {
  const B = DOC.bn[type]; if (!B) return [];
  const ad = unitV(X.x - from.x, X.y - from.y), perp = { x: -ad.y, y: ad.x };
  const th = threatFeats(X, from);
  const spot = (fwd, side) => nearestOpen(clamp(X.x + ad.x * fwd + perp.x * side, 15, WW - 15), clamp(X.y + ad.y * fwd + perp.y * side, 15, WH - 15));
  return B.variants.map(v => {
    const used = new Set(), roles = [];
    for (const rs of v.roles) {
      const pl = rs.place; let type = rs.type, target = { x: X.x, y: X.y };
      if (pl.kind === 'flank') {
        const c = th.filter(o => !used.has(o.f.id) && o.lat * pl.dir >= pl.minSide)
          .sort((a, b) => (pl.pick === 'close' ? a.d - b.d : pl.pick === 'deep' ? b.fwd - a.fwd : a.fwd - b.fwd))[0];
        if (c) { used.add(c.f.id); target = { x: c.f.x, y: c.f.y }; } else { type = pl.fallback; target = spot(pl.fbFwd, pl.dir * pl.fbSide); }
      } else if (pl.kind === 'offset') target = spot(pl.fwd, pl.side);
      else if (pl.kind === 'behind') target = spot(-pl.dist, pl.side);
      if (rs.woods && type === 'seize' && inWood(target.x, target.y)) type = 'clear';
      const r = { type, target, pos: null, imp: rs.imp }; if (rs.gate) r.gate = rs.gate;
      roles.push(r);
    }
    return { roles, tags: tagObj(v.tags), vid: v.id, vname: v.name };
  });
}
const coyKind = (t) => (DOC.coy[t] ? DOC.coy[t].scoreAs : t);
const plKind = (t) => (DOC.pl[t] || DOC.pl.hold).scoreAs;
// candidate role-sets for a company objective: every variant, tried at every swept fire site x approach angle
function coyCandidates(type, X, from, cmdr) {
  const B = DOC.coy[type]; if (!B) return [];
  const ad = unitV(X.x - from.x, X.y - from.y), perp = { x: -ad.y, y: ad.x };
  const out = [], srch = B.search;
  let sc = null; const SCs = () => sc || (sc = supportCands(X, from));
  // one site choice; ref = the main fire site (the swept one, else role 1's)
  const site1 = (sel, s, got) => {
    const [k, a] = sel.split(':'), n = +a, ref = s || got[0];
    switch (k) {
      case 'sweep': return s || undefined;
      case 'rank': return SCs()[n];
      case 'blind': return SCs().find(z => !z.l);
      case 'last': { const L = SCs(); return L[L.length - 1]; }
      case 'random': { const L = SCs(); return L[(R() * L.length) | 0]; }
      case 'apart': return ref ? SCs().find(z => z !== ref && hyp(z.p.x - ref.p.x, z.p.y - ref.p.y) > n) : undefined;
      case 'seeApart': return ref ? SCs().find(z => z.l && hyp(z.p.x - ref.p.x, z.p.y - ref.p.y) > n) : undefined;
      case 'role': return got[n];
    }
    return undefined;
  };
  const siteChain = (chain, s, got) => { for (const c of chain) { const z = site1(c, s, got); if (z) return z; } return undefined; };
  const sweep = srch.sites.length ? srch.sites.map(c => site1(c, null, [])).filter(Boolean) : [null];
  const wrong = srch.wrongChance > 0 ? FEATS.filter(f => f.id !== 'start' && hyp(f.x - X.x, f.y - X.y) > 120).sort((a, b) => hyp(a.x - X.x, a.y - X.y) - hyp(b.x - X.x, b.y - X.y))[0] : null;
  const angles = srch.angles.length ? srch.angles : [null];
  for (const s of sweep) for (const ang of angles) for (const v of B.variants) {
    const a0 = ang === null ? 0 : ang, side = Math.sign(a0) || 1;
    const wr = srch.wrongChance > 0 && R() < srch.wrongChance && wrong ? { x: wrong.x, y: wrong.y } : null;
    const roles = [], got = []; let ok = true;
    for (let i = 0; i < v.roles.length && ok; i++) {
      const rs = v.roles[i], pl = rs.place, X1 = rs.mistake && wr ? wr : X;
      let target = X1, pos = null;
      if (pl.kind === 'fup') pos = fupAt(X, from, (pl.sweep ? a0 : 0) + side * pl.off, pl.dist);
      else if (pl.kind === 'fire') { const z = siteChain(pl.site, s, got); if (!z) { ok = false; break; } got[i] = z; pos = z.p; }
      else if (pl.kind === 'offset' || pl.kind === 'behind') {
        const sd = pl.mirror ? side : 1;
        const p = pl.kind === 'offset' ? nearestOpen(X.x + ad.x * pl.fwd + perp.x * sd * pl.side, X.y + ad.y * pl.fwd + perp.y * sd * pl.side)
          : nearestOpen(X.x - ad.x * 280 * (pl.dist / 280) + perp.x * sd * pl.side, X.y - ad.y * 280 * (pl.dist / 280) + perp.y * sd * pl.side);
        if (pl.kind === 'offset' && pl.aim === 'obj') pos = p; else target = p;
      }
      const r = { type: rs.type, target, pos, imp: rs.imp }; if (rs.gate) r.gate = rs.gate;
      roles.push(r);
    }
    if (!ok) continue;
    const tags = tagObj(v.tags);
    if (srch.styleTags) { tags.frontal = ang !== null && Math.abs(ang) < 0.1; tags.noLos = s ? !s.l : false; tags.wrong = !!wr; }
    out.push({ roles, tags, vid: v.id });
  }
  return out;
}
// a commander chooses among candidates: perceived quality = real quality + noise (judgment, experience) + quirks
function choose(cands, kind, X, from, cmdr, rate = ratePlan) {
  const W = DOC.score.prefs;
  const noise = W.noise * (1 - cmdr.judg) * (1 - 0.45 * cmdr.exp);
  let best = null, bp = -1e9;
  for (const c of cands) {
    const r = rate(kind, X, c.roles, from);
    let perc = r.q + gauss() * noise;
    const tg = c.tags || {};
    if (cmdr.judg < W.dumbBelow) { // dumb leaders like the obvious: straight at them, everyone in, no fuss about sight lines
      const k = (W.dumbBelow - cmdr.judg) * W.dumbScale * (1 - 0.5 * cmdr.exp);
      if (tg.frontal) perc += k * W.frontal; if (tg.noLos) perc += k * W.noLos; if (tg.allIn) perc += k * W.allIn; if (tg.bunched) perc += k * W.bunched; if (tg.wrong) perc += k * W.wrong;
    }
    if (cmdr.quirk === 'aggressive' && (tg.cutoff || tg.allIn)) perc += W.aggressive;
    if (cmdr.quirk === 'cautious' && (tg.reserve || tg.book)) perc += W.cautious;
    if (cmdr.quirk === 'glory' && tg.allIn) perc += W.glory;
    if (cmdr.quirk === 'book' && (tg.book || (tg.reserve && !tg.frontal))) perc += W.book;
    if (perc > bp) { bp = perc; best = { c, q: r.q, notes: r.notes }; }
  }
  return best;
}
// section roles for a platoon task: each point is the platoon's target ('obj') or position ('pos') + side/forward offset,
// optionally the leader's pick of the best spot within a radius
function plCandidates(pt, from, cmdr) {
  const X = pt.target, F = pt.pos || X;
  const ad = unitV(X.x - from.x, X.y - from.y), perp = { x: -ad.y, y: ad.x };
  const at = (b, s, f = 0) => P(b.x + perp.x * s + ad.x * f, b.y + perp.y * s + ad.y * f);
  const B = DOC.pl[pt.type] || DOC.pl.hold;
  const point = (sp) => {
    if (!sp) return null;
    const b = sp.base === 'obj' ? X : F, c = sp.side || sp.fwd ? at(b, sp.side, sp.fwd) : b;
    if (!sp.pick) return c;
    const look = sp.look === 'obj' ? X : sp.look === 'ahead' ? at(b, sp.side, sp.lookFwd) : null;
    return pickPos(c, sp.pick, look, cmdr);
  };
  return B.variants.map(v => ({ roles: v.roles.map(r => { const pos = point(r.pos); return { type: r.type, pos, target: point(r.target) || X }; }), tags: tagObj(v.tags), vid: v.id }));
}

// ---------------------------------------------------------------- objective tree
const far = (a, b, d = 4) => (!a) !== (!b) || (a && b && hyp(a.x - b.x, a.y - b.y) > d);
const cp = (p) => (p ? { x: p.x, y: p.y } : null);
const specOf = (n) => ({ type: n.type, target: cp(n.target), pos: cp(n.pos), gate: n.gate });
function mkNode(id, level, coy, parent) {
  return { id, level, coy, parent, kids: [], type: null, target: null, pos: null, gate: null, prio: 1, aggr: 1, locked: false, manual: false, auto: false,
    status: 'planned', prog: 0, q: 50, notes: [], flash: 0, ghost: null, changedT: -99, shown: null, ignored: null, byYou: false, rejected: false, orig: null, t0: 0, e0: 0, done: false };
}
function buildTree() {
  S.nodes = {};
  const bn = S.nodes.BN = mkNode('BN', 'bn', 'BN', null);
  for (const C of COYS) {
    const cn = S.nodes[C.id] = mkNode(C.id, 'coy', C.id, 'BN'); bn.kids.push(C.id);
    for (const pu of plsOf(C.id)) {
      const pn = S.nodes[pu.id] = mkNode(pu.id, 'pl', C.id, C.id); cn.kids.push(pu.id);
      for (const su of secsOf(pu.id)) { S.nodes[su.id] = mkNode(su.id, 'sec', C.id, pu.id); pn.kids.push(su.id); }
    }
  }
}
const cmdrOf = (n) => S.U[n.id].cmdr;
const unitOf = (n) => S.U[n.id];
const nodeName = (n) => (n.level === 'bn' ? BN.name : n.level === 'coy' ? `${n.id} Coy` : n.level === 'pl' ? `${S.U[n.id].pn} Pl` : S.U[n.id].name);
const label = (sp) => `${T[sp.type][0]} ${T[sp.type][1]} ${tName(sp.target)}`;
const gbSecs = () => S.units.filter(u => u.side === 'GB' && u.kind === 'sec');
function nodeFrom(n) {
  if (n.level === 'bn') return S.phase === 'plan' ? BN_FROM : centroid(gbSecs());
  if (n.level === 'coy') return S.phase === 'plan' ? { x: COYS.find(c => c.id === n.id).home[0], y: COYS.find(c => c.id === n.id).home[1] } : centroid(coyUnits(n.id).filter(u => u.kind === 'sec'));
  if (n.level === 'pl') return centroid(secsOf(n.id));
  return S.U[n.id];
}
// apply a spec to a node, recording the visible diff
function setSpec(n, sp, who) {
  const old = specOf(n);
  const changed = !n.type || n.type !== sp.type || far(n.target, sp.target) || far(n.pos, sp.pos);
  n.type = sp.type; n.target = cp(sp.target); n.pos = cp(sp.pos); n.gate = sp.gate || null;
  if (changed) {
    if (old.type) {
      n.flash = performance.now(); n.changedT = S.time;
      if (old.target && far(old.target, n.target, 8)) n.ghost = { ox: old.target.x, oy: old.target.y, t: performance.now() };
    }
    n.status = 'planned'; n.prog = 0; n.t0 = S.time; n.done = false; n.e0 = 0; n.orig = null; n.flags = {}; n.d0 = 0; n.goT = 0; n.engT = 0; n.lostLogged = false; n.seen = 0; n.wait = false;
    const u = S.U[n.id]; if (u) { u.ph = 0; u.path = null; u.waitT = 0; }
    n.shown = null; n.ignored = null; n.byYou = false; n.rejected = false;
  }
  n.manual = who === 'you' ? true : (changed ? false : n.manual);
  n.auto = who === 'auto' && changed ? true : (changed ? false : n.auto);
  return changed;
}
function bestAssign(free, roles, posOf) {
  // brute-force the cheapest matching (<= 3 units)
  const idx = free.map((_, i) => i); let best = null, bc = 1e18;
  const perm = (a, k) => {
    if (k === a.length) {
      let c = 0; a.forEach((ri, ui) => { if (ri < roles.length) { const p = roles[ri].pos || roles[ri].target, u = posOf(free[ui]); c += hyp(p.x - u.x, p.y - u.y); } });
      if (c < bc) { bc = c; best = a.slice(); } return;
    }
    for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; }
  };
  const slots = idx.map(i => i); perm(slots, 0);
  return best || idx;
}
function decomposeCoy(n, who, dry) {
  const cm = cmdrOf(n), from = nodeFrom(n);
  const pick = choose(coyCandidates(n.type, n.target, from, cm), coyKind(n.type), n.target, from, cm);
  if (dry) return pick ? pick.q : 30;
  const res = { pls: 0, secs: 0 };
  if (!pick) return res;
  n.q = pick.q; n.notes = pick.notes;
  const pls = n.kids.map(id => S.nodes[id]);
  const free = pls.filter(p => !p.locked && alive(S.U[p.id]));
  const roles = pick.c.roles.slice().sort((a, b) => b.imp - a.imp).slice(0, free.length);
  // an edited map with fewer roles than platoons: the spare platoons go into reserve behind the objective
  for (let i = roles.length, ad = unitV(n.target.x - from.x, n.target.y - from.y); i < free.length; i++) roles.push({ type: 'reserve', target: nearestOpen(n.target.x - ad.x * 280 - ad.y * 50 * (i - 1), n.target.y - ad.y * 280 + ad.x * 50 * (i - 1)), pos: null, imp: 0 });
  const asg = bestAssign(free, roles, p => nodeFrom(p));
  const roleNode = {};
  asg.forEach((ri, ui) => { if (ri < roles.length) roleNode[ri] = free[ui]; });
  asg.forEach((ri, ui) => {
    if (ri >= roles.length) return;
    const r = roles[ri], pl = free[ui];
    let gate = null;
    if (r.gate === 'sbf') { const sb = Object.entries(roleNode).find(([k]) => roles[k].type === 'sbf'); if (sb) gate = { wait: sb[1].id, minT: DOC.sm.gates.sbfWait }; }
    if (r.gate === 'rear') gate = { rear: true, minT: DOC.sm.gates.rearHold };
    const ch = setSpec(pl, { type: r.type, target: r.target, pos: r.pos, gate }, who);
    pl.aggr = n.aggr; pl.prio = n.prio;
    if (ch || !pl.kids.some(k => S.nodes[k].type)) { res.pls += ch ? 1 : 0; res.secs += decomposePl(pl, who); }
  });
  n.q = Math.round(0.6 * pick.q + 0.4 * avg(pls.map(p => p.q)));
  return res;
}
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
// battalion -> companies: the CO picks a variant (own dice), then each free company gets its task and plans it
function decomposeBn(n, who, dry) {
  const cm = cmdrOf(n), from = nodeFrom(n);
  if (!n.type) return dry ? 30 : { coys: 0, pls: 0, secs: 0 };
  const pick = withB(() => choose(bnCandidates(n.type, n.target, from), bnKind(n.type), n.target, from, cm, rateBn));
  if (dry) return pick ? pick.q : 30;
  const res = { coys: 0, pls: 0, secs: 0 };
  if (!pick) { n.notes = ['no battalion map for this objective']; return res; }
  n.vname = pick.c.vname;
  const coys = n.kids.map(id => S.nodes[id]);
  const free = coys.filter(c => !c.locked && coyUnits(c.id).some(u => u.kind === 'sec' && alive(u)));
  const roles = pick.c.roles.slice().sort((a, b) => b.imp - a.imp).slice(0, free.length);
  // fewer roles than companies (edited map): the spare companies go into reserve behind the objective
  for (let i = roles.length, ad = unitV(n.target.x - from.x, n.target.y - from.y); i < free.length; i++) roles.push({ type: 'reserve', target: nearestOpen(n.target.x - ad.x * 300 - ad.y * 120 * (i - 1), n.target.y - ad.y * 300 + ad.x * 120 * (i - 1)), pos: null, imp: 0 });
  const asg = bestAssign(free, roles, c => nodeFrom(c));
  const roleNode = {};
  asg.forEach((ri, ui) => { if (ri < roles.length) roleNode[ri] = free[ui]; });
  asg.forEach((ri, ui) => {
    if (ri >= roles.length) return;
    const r = roles[ri], co = free[ui];
    let gate = null;
    if (r.gate === 'sbf') { const sb = Object.entries(roleNode).find(([k]) => roles[k].type === 'sbf'); if (sb) gate = { wait: sb[1].id, minT: SM.gates.coyWait }; }
    if (r.gate === 'rear') gate = { rear: true, minT: SM.gates.rearHold };
    const ch = setSpec(co, { type: r.type, target: r.target, pos: null, gate }, who);
    co.aggr = n.aggr; co.prio = n.prio;
    if (ch || !co.kids.some(k => S.nodes[k].type)) { res.coys += ch ? 1 : 0; const k = decomposeCoy(co, who); res.pls += k.pls || 0; res.secs += k.secs || 0; }
  });
  n.q = Math.round(0.6 * pick.q + 0.4 * avg(coys.filter(c => c.type).map(c => c.q)));
  n.notes = pick.notes;
  return res;
}
// battalion quality after a company changed under it
function bnRequal() {
  const n = S.nodes.BN; if (!n || !n.type) return;
  const coys = n.kids.map(k => S.nodes[k]), r = rateBn(bnKind(n.type), n.target, coys.map(c => (c.type ? specOf(c) : null)), nodeFrom(n));
  n.q = Math.round(0.6 * r.q + 0.4 * avg(coys.filter(c => c.type).map(c => c.q))); n.notes = r.notes;
}
function decomposePl(pl, who) {
  const cm = cmdrOf(pl), from = nodeFrom(pl), pt = specOf(pl);
  const pick = choose(plCandidates(pt, from, cm), plKind(pt.type), pt.target, from, cm);
  if (!pick) return 0;
  const secs = pl.kids.map(id => S.nodes[id]);
  const free = secs.filter(s => !s.locked && alive(S.U[s.id]));
  const roles = pick.c.roles.slice(0, free.length);
  // fewer section roles than sections (edited map): the spare sections hold at the platoon's position
  for (let i = roles.length, F = pt.pos || pt.target; i < free.length; i++) roles.push({ type: 'hold', target: nearestOpen(F.x + 20 * (i - 1), F.y + 15), pos: null });
  const asg = bestAssign(free, roles, s => S.U[s.id]);
  let n = 0;
  const ad = unitV(pt.target.x - from.x, pt.target.y - from.y);
  asg.forEach((ri, ui) => {
    if (ri >= roles.length) return;
    const s = free[ui], r = roles[ri];
    if (setSpec(s, { type: r.type, target: r.target, pos: r.pos, gate: null }, who)) n++;
    s.aggr = pl.aggr; s.prio = pl.prio;
  });
  for (const s of secs) if (s.type) { const r = rateSec(specOf(s), ad); s.q = r.q; s.notes = r.notes; }
  pl.q = Math.round(0.55 * pick.q + 0.45 * avg(secs.filter(s => s.type).map(s => s.q)));
  pl.notes = pick.notes;
  return n;
}
function planAll() { for (const C of COYS) decomposeCoy(S.nodes[C.id], 'plan'); }
// a node's own plan quality, for any level
function selfQ(n) { return n.level === 'bn' ? decomposeBn(n, null, true) : decomposeCoy(n, null, true); }

// ---------------------------------------------------------------- your edits are suggestions
// how good would your version be, in the context of the plan around it?
function qualityOf(n, sp) {
  if (n.level === 'coy' || n.level === 'bn') { const save = specOf(n); Object.assign(n, { type: sp.type, target: sp.target }); const q = selfQ(n); Object.assign(n, { type: save.type, target: save.target }); return q; }
  const par = S.nodes[n.parent], from = nodeFrom(par);
  const roles = par.kids.map(k => (k === n.id ? sp : specOf(S.nodes[k]))).filter(r => r.type);
  const kind = n.level === 'pl' ? coyKind(par.type) : plKind(par.type);
  const plan = ratePlan(kind, par.target, roles, from);
  if (n.level === 'pl') return plan.q;
  const own = rateSec(sp, unitV(par.target.x - from.x, par.target.y - from.y));
  return Math.round(0.5 * plan.q + 0.5 * own.q);
}
function notesOf(n, sp) {
  if (n.level === 'bn') {
    const from = nodeFrom(n), pick = withB(() => choose(bnCandidates(sp.type, sp.target, from), bnKind(sp.type), sp.target, from, { judg: 1, exp: 1 }, rateBn));
    const known = enemyNear(sp.target, 150, true);
    return [...(known.n > 2 ? ['strongly held'] : []), ...(pick ? pick.notes : [])];
  }
  if (n.level === 'sec') { const par = S.nodes[n.parent], from = nodeFrom(par); return rateSec(sp, unitV(par.target.x - from.x, par.target.y - from.y)).notes; }
  const par = n.level === 'pl' ? S.nodes[n.parent] : null;
  if (par) { const roles = par.kids.map(k => (k === n.id ? sp : specOf(S.nodes[k]))).filter(r => r.type); return ratePlan(coyKind(par.type), par.target, roles, nodeFrom(par)).notes; }
  const from = nodeFrom(n); const pick = choose(coyCandidates(sp.type, sp.target, from, { judg: 1, exp: 1, quirk: null }), coyKind(sp.type), sp.target, from, { judg: 1, exp: 1 });
  const known = enemyNear(sp.target, 120, true);
  return [...(known.mg ? ['held by an MG'] : []), ...(known.n > 2 ? ['strongly held'] : []), ...(pick ? pick.notes : [])];
}
// the commander decides: how much better does YOUR plan look to HIM, and how obedient is he?
function decide(c, qY, qT, mode, level) {
  const noise = 32 * (1 - c.judg) * (1 - 0.5 * c.exp);
  let perc = qY - qT + gauss() * noise;
  if (c.quirk === 'glory' && mode === 'suggest') perc -= 4;
  if (c.quirk === 'book') perc += 3;
  const lvl = level === 'coy' ? 0.3 : level === 'bn' ? 0.35 : 0;
  const comply = clamp(c.obed * 0.8 + c.trust * 0.35 + lvl + (mode === 'insist' ? 0.45 : mode === 'order' ? 0.6 : 0) - 0.3, 0, 1.3);
  if (c.obed > 0.88 || (c.obed > 0.75 && mode !== 'suggest')) return { out: 'accept', perc, blind: true };
  if (perc >= 6) return { out: c.obed < 0.2 && R() < 0.3 ? 'grumble' : 'accept', perc, better: true };
  if (perc > -6) return { out: R() < 0.35 + comply * 0.6 ? 'accept' : 'grumble', perc };
  if (mode === 'order') { // an order is obeyed, except now and then by the very stubborn
    if (c.obed < 0.3 && R() < 0.1 + (0.3 - c.obed) * 0.5) return { out: R() < 0.5 ? 'delay' : 'ignore', perc };
    return { out: 'grumble', perc };
  }
  if (R() < comply) return { out: perc < -15 ? 'grumble' : 'accept', perc };
  if (mode !== 'suggest') return { out: R() < 0.5 ? 'delay' : 'ignore', perc };
  if (c.judg + 0.5 * c.exp > 0.75 || R() < 0.35) return { out: 'counter', perc };
  if (c.obed < 0.35) return { out: 'ignore', perc };
  return { out: 'delay', perc };
}
const pickL = (a) => a[(R() * a.length) | 0];
function say(c, kind, extra = '') {
  const dumb = c.judg < 0.3, stub = c.obed < 0.3, blind = c.obed > 0.85;
  const L = {
    wilco: blind ? ['Yes sir! Right away.', 'Wilco, sir.', 'At once, sir.'] : ['Wilco.', 'Roger, on it.', 'Understood.'],
    better: ['Good shout, sir. Doing it.', 'Better plan, sir. Moving.', "Right, that's sharper. Wilco."],
    grumble: stub ? ['Wilco. Under protest.', 'If you insist… my way was better.'] : ['Wilco… not keen, mind.', 'If you say so, sir.', 'Roger. Bit iffy, that.'],
    delay: ['Will do, once we sort ourselves out.', 'Give us a few minutes, sir.', 'Roger, in a bit.'],
    insistOk: ['Very well, sir. On your head.', 'Understood. Doing it your way.'],
    refuse: ['…', 'Roger.'],
    found: ['has been doing his own thing', 'never changed course', 'quietly carried on with his own plan'],
    worked: ['Your plan worked, sir.', 'Spot on, sir.', 'Good call, sir.'],
    should: ["Should've listened to you, sir.", 'You were right, sir.'],
    achieved: c.quirk === 'glory' ? ['Objective taken. My lads did it!', 'Ours, sir. First in!'] : c.quirk === 'cautious' ? ['Objective secure. Digging in.', 'In position, all quiet.'] : ['Objective achieved.', 'Done, sir.', 'In position.'],
    failed: ['Not going to happen, sir.', "We're stopped.", "Can't do it, sir."],
    quirk: { aggressive: ["Let's get stuck in!"], cautious: ['Bit exposed, that.'], glory: ['My lads will have it first!'], book: ['As per the drill book.'] },
  };
  let s = pickL(L[kind] || ['Roger.']);
  if (kind === 'wilco' && dumb && R() < 0.4) s = pickL(['Righto, straight at \'em!', 'Lovely, the lads like a good run.']);
  if ((kind === 'wilco' || kind === 'achieved') && c.quirk && R() < 0.35) s += ' ' + L.quirk[c.quirk][0];
  return s + (extra ? ' ' + extra : '');
}
function reasonText(c, notes, theirs) {
  if (c.judg < 0.3) return pickL(["The lads like it where we are.", "Never done it that way, sir.", "Looks a bit far.", "My way's quicker."]);
  const n = notes[0];
  if (!n) return `Mine's as good, and the lads know it. I'd stay with ${label(theirs)}.`;
  return `${n[0].toUpperCase() + n.slice(1)}. I'd rather ${label(theirs)}.`;
}
// entry point for every edit you make
function proposeEdit(n, patch, opts = {}) {
  const cur = specOf(n), u = S.U[n.id];
  const prop = { type: patch.type || cur.type, target: cp(patch.target || cur.target), pos: cp(patch.pos !== undefined ? patch.pos : cur.pos), gate: cur.gate };
  if (patch.type && patch.type !== cur.type && n.level !== 'coy' && n.level !== 'bn' && patch.pos === undefined) {
    if (FIRE_T.has(prop.type) || prop.type === 'recon' || prop.type === 'sbf') prop.pos = pickPos(P(lerp(u.x, prop.target.x, 0.35), lerp(u.y, prop.target.y, 0.35)), 60, prop.target, { judg: 0.75, exp: 0.7 });
    else if (prop.type === 'assault' || prop.type === 'clear') prop.pos = fupAt(prop.target, u, 0.8);
    else prop.pos = null;
    if (n.level === 'pl' && prop.type !== 'assault' && prop.type !== 'clear') prop.gate = null;
  }
  if ((n.level === 'coy' || n.level === 'bn') && patch.type) prop.pos = null;
  const c = cmdrOf(n);
  const mode = opts.mode || (n.locked || opts.lock ? 'order' : 'suggest');
  const qY = qualityOf(n, prop), qT = n.type ? qualityOf(n, cur) : 0;
  const d = opts.force ? { out: 'accept', perc: 0 } : decide(c, qY, qT, mode, n.level);
  d.qY = qY; d.qT = qT;
  const who = `${cname(c)} (${nodeName(n)})`;
  const lvl = n.level;
  if (d.out === 'accept' || d.out === 'grumble') {
    applyProp(n, prop, 'you');
    if (opts.lock) n.locked = true;
    if (d.out === 'grumble') c.trust = clamp(c.trust - 0.02, 0, 1);
    log(lvl, 'chg', n.id, `${who}: ${say(c, d.out === 'grumble' ? 'grumble' : mode === 'insist' ? 'insistOk' : d.better ? 'better' : 'wilco')} → ${label(prop)}`, 'you');
  } else if (d.out === 'counter') {
    const theirs = cur.type ? cur : prop;
    const reason = reasonText(c, notesOf(n, prop), theirs);
    addReq({ kind: 'counter', node: n.id, prop, theirs, reason, text: `${who}: ${reason}`, qY, qT, cmdr: c });
    log(lvl, 'req', n.id, `${who} pushes back: ${reason}`, 'them');
  } else if (d.out === 'delay') {
    S.pending.push({ node: n.id, prop, at: Math.max(S.time, 0) + 50 + R() * 90, lock: !!opts.lock });
    log(lvl, 'chg', n.id, `${who}: ${say(c, 'delay')}`, 'them');
  } else { // ignore: it looks accepted, but he keeps his own plan
    n.shown = prop; n.ignored = { at: Math.max(S.time, 0) + 45 + R() * 90 }; n.manual = true; n.flash = performance.now();
    log(lvl, 'chg', n.id, `${who}: ${mode === 'suggest' ? 'Wilco.' : say(c, 'refuse')}`, 'them');
  }
  if (mode === 'insist') { c.trust = clamp(c.trust - 0.08, 0, 1); for (const uu of unitsUnder(n)) uu.morale = Math.max(10, uu.morale - 4); }
  S.lastDecision = d;
  refreshUI();
  return d;
}
function unitsUnder(n) { const out = [S.U[n.id]]; for (const k of n.kids) out.push(...unitsUnder(S.nodes[k])); return out.filter(alive); }
function applyProp(n, prop, who) {
  setSpec(n, prop, who);
  n.byYou = who === 'you'; n.manual = who === 'you';
  n.flash = performance.now();
  if (n.level === 'bn') { const r = decomposeBn(n, 'cmdr'); log('bn', 'chg', n.id, `${BN.name} re-plans (${n.vname || 'own plan'}): ${r.coys} company, ${r.pls} platoon, ${r.secs} section tasks updated (plan quality ${n.q}).`, 'auto'); }
  else if (n.level === 'coy') { const r = decomposeCoy(n, 'cmdr'); if (r.pls + r.secs) log('coy', 'chg', n.id, `${n.id} Coy re-plans: ${r.pls} platoon, ${r.secs} section tasks updated (plan quality ${n.q}).`, 'auto'); bnRequal(); }
  else if (n.level === 'pl') { const k = decomposePl(n, 'cmdr'); if (k) log('pl', 'chg', n.id, `${nodeName(n)}: ${k} section tasks updated.`, 'auto'); }
  else { const par = S.nodes[n.parent], from = nodeFrom(par), r = rateSec(specOf(n), unitV(par.target.x - from.x, par.target.y - from.y)); n.q = r.q; n.notes = r.notes; }
  if (n.level === 'pl') { const par = S.nodes[n.parent]; par.q = Math.round(0.6 * qualityOf(n, specOf(n)) + 0.4 * avg(par.kids.map(k => S.nodes[k].q))); }
}
// your answer to a counter-proposal
function answerCounter(rq, how) {
  const n = S.nodes[rq.node], c = cmdrOf(n);
  rq.status = how;
  if (how === 'insist') {
    const d = proposeEdit(n, { type: rq.prop.type, target: rq.prop.target, pos: rq.prop.pos }, { mode: 'insist' });
    rq.result = d.out;
  } else if (how === 'theirs') {
    c.trust = clamp(c.trust + 0.05, 0, 1); n.rejected = true;
    log(n.level, 'chg', n.id, `${cname(c)}: Thank you, sir. Carrying on with ${label(rq.theirs)}.`, 'you');
  } else if (how === 'compromise') {
    const mid = (a, b) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a || b);
    const prop = { type: rq.prop.type, target: mid(rq.prop.target, rq.theirs.target), pos: mid(rq.prop.pos, rq.theirs.pos), gate: rq.theirs.gate };
    applyProp(n, prop, 'you'); c.trust = clamp(c.trust + 0.02, 0, 1);
    log(n.level, 'chg', n.id, `${cname(c)}: Fair enough, meet you halfway. → ${label(prop)}`, 'you');
  }
  refreshUI();
}
// feed
function log(lvl, kind, unit, text, who) {
  const e = { id: S.feed.length + 1, t: S.time, lvl, kind, unit, text, who };
  S.feed.push(e);
  const u = S.U[unit];
  if (u && S.toasts.length < 6 && (lvl !== 'sec' || kind === 'fail' || kind === 'req' || who === 'you' || who === 'them')) S.toasts.push({ x: u.x, y: u.y, text: text.length > 46 ? text.slice(0, 44) + '…' : text, kind, t: performance.now() });
  if (typeof feedDirty !== 'undefined') feedDirty = true;
  return e;
}

// ---------------------------------------------------------------- simulation
const AGG = DOC.sm.common.aggr; // section drills: doctrine.sm (Objective Editor)
const SM = DOC.sm;
const OFFENSIVE = new Set(['seize', 'clear']);
const intelKnown = (u) => u.role !== 'reserve';
function enemyNear(p, r, known) {
  let n = 0, mg = 0, str = 0;
  for (const u of S.units) {
    if (u.side !== 'DE' || !alive(u)) continue;
    let x = u.x, y = u.y;
    if (known) {
      if (S.phase === 'plan') { if (!intelKnown(u)) continue; }
      else if (!u.vis) { if (!u.last || S.time - u.seenT > 300) continue; x = u.last.x; y = u.last.y; }
    }
    if (u.state === 'broken') continue;
    if (hyp(x - p.x, y - p.y) < r) { n++; if (u.kind === 'mg') mg++; str += u.men; }
  }
  return { n, mg, str };
}
const targetClear = (p, r) => !S.units.some(u => u.side === 'DE' && alive(u) && u.state !== 'broken' && hyp(u.x - p.x, u.y - p.y) < r);
const gbNear = (p, r) => S.units.some(u => u.side === 'GB' && u.kind === 'sec' && alive(u) && u.state !== 'broken' && hyp(u.x - p.x, u.y - p.y) < r);
function updVis() {
  const gb = S.units.filter(u => u.side === 'GB' && alive(u)), de = S.units.filter(u => u.side === 'DE' && alive(u));
  for (const d of de) {
    const fired = S.time - d.firedT < 8, cov = coverAt(d.x, d.y) < 0.7;
    const R0 = fired ? 620 : cov ? 200 : 430;
    let v = false;
    for (const g of gb) { const dd = hyp(g.x - d.x, g.y - d.y); if (dd < 35 || (dd < R0 && los(g.x, g.y, d.x, d.y))) { v = true; break; } }
    d.vis = v;
    if (v) {
      if (!d.spotted) { d.spotted = true; const f = tName(d); log('coy', 'info', d.id, `Contact: ${d.name} at ${f}.`, 'auto'); }
      d.seenT = S.time; d.last = { x: d.x, y: d.y };
    }
  }
  for (const g of gb) {
    const R0 = S.time - g.firedT < 8 ? 620 : g.moving ? 450 : coverAt(g.x, g.y) < 0.7 ? 190 : 360;
    g.vis = de.some(d => { const dd = hyp(g.x - d.x, g.y - d.y); return d.state !== 'broken' && (dd < 35 || (dd < R0 && los(g.x, g.y, d.x, d.y))); });
  }
}
function moveTo(u, gx, gy, sp, dt, arrive = 3) {
  if (hyp(gx - u.x, gy - u.y) < arrive) { u.moving = false; return true; }
  if (!u.path || hyp(u.gx - gx, u.gy - gy) > 4) { u.path = findPath(u.x, u.y, gx, gy); u.gx = gx; u.gy = gy; }
  let rem = sp * terrMul(u.x, u.y) * dt;
  while (rem > 0 && u.path.length) {
    const w = u.path[0], d = hyp(w.x - u.x, w.y - u.y);
    if (d > 0.01) u.a = Math.atan2(w.y - u.y, w.x - u.x);
    if (d <= rem) { u.x = w.x; u.y = w.y; rem -= d; u.path.shift(); } else { u.x += (w.x - u.x) / d * rem; u.y += (w.y - u.y) / d * rem; rem = 0; }
  }
  u.moving = u.path.length > 0;
  return !u.path.length;
}
function setSt(n, s) { if (n.status !== 'achieved' && n.status !== 'failed') n.status = s; }
function progTo(n, u, g) {
  const d = hyp(g.x - u.x, g.y - u.y);
  if (!n.d0 || n.dg !== g) { n.d0 = Math.max(d, 1); n.dg = g; }
  return clamp(1 - d / n.d0, 0, 1);
}
function gateOK(pl, sec) {
  if (!pl || !pl.gate) return true;
  const g = pl.gate, waited = S.time - pl.t0;
  if (waited > g.minT * SM.gates.aggrScale[pl.aggr]) return true;
  if (g.rear) return false;
  const sb = S.nodes[g.wait];
  if (!sb || sb.type !== 'sbf') return true;
  if (!secsOf(sb.id).some(alive)) return true;
  if (sb.engT && S.time - sb.engT > SM.gates.sbfEngaged) return true;
  return sb.status === 'achieved';
}
// a company-level gate from the battalion map: e.g. this company's assault waits for the fire-base company
function coyGateOK(co) {
  if (!co || !co.gate) return true;
  const g = co.gate;
  if (S.time - co.t0 > g.minT * SM.gates.aggrScale[co.aggr]) return true;
  if (g.rear) return false;
  const sb = S.nodes[g.wait];
  if (!sb || sb.type !== 'sbf' || !coyUnits(sb.id).some(u => u.kind === 'sec' && alive(u))) return true;
  if (sb.status === 'achieved') return true;
  return sb.kids.some(k => { const p = S.nodes[k]; return p.engT && S.time - p.engT > SM.gates.sbfEngaged; }) || coyUnits(sb.id).some(u => u.kind === 'sec' && S.time - u.firedT < 10 && S.time - co.t0 > 60);
}
function secAct(u, n, dt) {
  const home = COYS.find(c => c.id === u.coy).home;
  if (u.state === 'broken') { moveTo(u, home[0], home[1] - 40, SM.broken.speed, dt); setSt(n, n.status); return; }
  if (u.state === 'pinned') { u.moving = false; return; }
  if (!n.type) return;
  const pl = S.nodes[n.parent];
  const sp = SM.common.speed * AGG[n.aggr];
  n.wait = false;
  switch (n.type) {
    case 'move': case 'hold': {
      const M = SM[n.type], g = n.pos && n.type === 'hold' ? n.pos : n.target;
      n.prog = progTo(n, u, g);
      if (moveTo(u, g.x, g.y, sp * M.speed, dt, M.arrive)) { u.ph = 1; if (n.status !== 'achieved' && n.status !== 'failed') achieve(n, 'in position'); } else setSt(n, 'moving');
      break;
    }
    case 'suppress': case 'overwatch': {
      const M = SM[n.type], g = n.pos || n.target;
      if (u.ph === 0) {
        n.prog = progTo(n, u, g) * (n.type === 'overwatch' ? 1 : 0.6);
        if (moveTo(u, g.x, g.y, sp * M.speed, dt, M.arrive)) { u.ph = 1; if (n.type === 'overwatch') achieve(n, 'in position'); }
        else setSt(n, 'moving');
      } else {
        u.moving = false;
        if (n.type === 'suppress') { n.prog = Math.max(n.prog, 0.6); setSt(n, S.time - u.firedT < M.engaged ? 'engaging' : 'moving'); if (S.time - u.firedT < M.engaged && pl && pl.type === 'sbf') pl.engT = pl.engT || S.time; }
      }
      break;
    }
    case 'assault': {
      const A = SM.assault;
      if (u.ph === 0) { // 0: move to the jump-off point
        if (!n.pos || !A.jumpoff.on) { u.ph = 1; break; }
        n.prog = progTo(n, u, n.pos) * 0.3;
        if (moveTo(u, n.pos.x, n.pos.y, sp * A.jumpoff.speed, dt, A.jumpoff.arrive)) { u.ph = 1; u.waitT = 0; }
        setSt(n, 'moving');
      } else if (u.ph === 1) { // 1: wait for the other assault sections and the fire-support gate
        const Wt = A.wait;
        u.waitT += dt; n.wait = Wt.on; n.prog = 0.35; u.moving = false;
        const sibs = pl && Wt.sync ? pl.kids.map(k => S.nodes[k]).filter(k => k.type === 'assault' && alive(S.U[k.id]) && S.U[k.id].state !== 'broken') : [];
        const ready = sibs.every(k => S.U[k.id].ph >= 1) || u.waitT > Wt.syncMax;
        if (!Wt.on || ((!Wt.gate || (gateOK(pl, n) && coyGateOK(S.nodes[u.coy]))) && ready) || u.waitT > Wt.maxWait) { u.ph = 2; n.wait = false; if (pl && !pl.goT) { pl.goT = S.time; log('pl', 'info', pl.id, `${nodeName(pl)}: ${pickL(['Going in now!', 'Assault going in.', 'Up and at \'em!'])}`, 'auto'); } }
      } else if (u.ph === 2) { // 2: charge
        const C = A.charge, d = hyp(n.target.x - u.x, n.target.y - u.y);
        n.prog = 0.4 + 0.5 * progTo(n, u, n.target);
        setSt(n, 'engaging');
        // close assault: suppressed defenders near the bayonets crack
        for (const e of S.units) if (e.side === 'DE' && alive(e) && e.state !== 'broken' && e.supp > C.shockSupp && hyp(e.x - u.x, e.y - u.y) < C.shock) e.morale -= dt * (C.shockBase + C.shockAggr * n.aggr) * (u.men / 10);
        if (moveTo(u, n.target.x, n.target.y, sp * (d < C.closeDist ? C.close : C.far), dt)) {
          if (targetClear(n.target, C.take)) { u.ph = 3; achieve(n, 'objective taken'); }
        }
      } else { // 3: consolidate; mop up anything left near the objective
        const K = A.consolidate;
        if (!K.on) { u.moving = false; break; }
        const co = S.nodes[u.coy], X = co.type && OFFENSIVE.has(co.type) ? co.target : n.target, rr = co.type === 'clear' ? K.clearRadius : K.radius;
        let h = null, hd = 1e9;
        for (const e of S.units) if (e.side === 'DE' && alive(e) && e.state !== 'broken' && (e.vis || S.time - e.seenT < K.memory) && hyp(e.x - X.x, e.y - X.y) < rr) { const d = hyp(e.x - u.x, e.y - u.y); if (d < hd && d < K.hunt) { hd = d; h = e; } }
        if (h && hd > K.closeIn) moveTo(u, h.x, h.y, sp * K.huntSpeed, dt);
        else if (!h && OFFENSIVE.has(co.type) && !targetClear(X, rr)) { // sweep the objective for hidden enemy
          n.sw = n.sw || 0;
          const a = (n.sw + u.sn * 2) * TAU / 6, sp2 = nearestOpen(X.x + Math.cos(a) * rr * K.ring, X.y + Math.sin(a) * rr * K.ring);
          if (moveTo(u, sp2.x, sp2.y, sp * K.sweepSpeed, dt)) n.sw++;
        } else if (!h && hyp(u.x - n.target.x, u.y - n.target.y) > K.back) moveTo(u, n.target.x, n.target.y, sp, dt); else u.moving = false;
      }
      break;
    }
  }
}
function bnHqAct(dt) { // the battalion HQ follows behind the battalion
  const u = S.U.BN; u.px = u.x; u.py = u.y; u.pa = u.a;
  const c = centroid(gbSecs()); if (!c.x) { u.moving = false; return; }
  const back = unitV(BN.home[0] - c.x, BN.home[1] - c.y), g = nearestOpen(c.x + back.x * 110, c.y + back.y * 110);
  if (hyp(g.x - u.x, g.y - u.y) > 15) moveTo(u, g.x, g.y, 1.5, dt); else u.moving = false;
}
function hqAct(u, dt) {
  const kids = u.kind === 'coyhq' ? coyUnits(u.coy).filter(k => k.kind === 'sec') : secsOf(u.id);
  const c = centroid(kids); if (!c.x) return;
  const home = COYS.find(x => x.id === u.coy).home;
  const back = unitV(home[0] - c.x, home[1] - c.y), off = u.kind === 'coyhq' ? 55 : 25;
  const g = nearestOpen(c.x + back.x * off, c.y + back.y * off);
  if (hyp(g.x - u.x, g.y - u.y) > 12) moveTo(u, g.x, g.y, 1.5, dt); else u.moving = false;
}
function deAct(u, dt) {
  if (u.state === 'broken') {
    moveTo(u, 690, 112, 1.9, dt);
    if (S.units.some(g => g.side === 'GB' && alive(g) && g.state !== 'broken' && hyp(g.x - u.x, g.y - u.y) < 35)) { u.state = 'surr'; log('coy', 'cas', u.id, `${u.name} at ${tName(u)} surrenders.`, 'auto'); }
    return;
  }
  if (u.state === 'pinned') { u.moving = false; return; }
  if (u.role === 'outpost' && S.units.some(g => g.side === 'GB' && alive(g) && hyp(g.x - u.x, g.y - u.y) < 300 && g.vis)) {
    u.role = 'hold'; u.postX = 598; u.postY = 432;
    if (u.vis) log('coy', 'info', u.id, `Enemy outpost on the ${tName(u)} pulling back.`, 'auto');
  }
  if (u.role === 'reserve') { u.moving = false; return; }
  moveTo(u, u.postX, u.postY, u.role === 'catk' ? 1.6 : 1.4, dt);
}
function featLost(fid) { const f = FEAT[fid]; return gbNear(f, 55) && targetClear(f, 60); }
function deBrain() {
  if (S.de.catk) return;
  const lost = ['church', 'xroads', 'bridge'].find(featLost);
  if (lost || S.time > S.de.catkT) {
    let fid = lost;
    if (!fid) { // reinforce the most threatened position
      let worst = null;
      for (const u of S.units) if (u.side === 'DE' && alive(u) && u.role === 'hold' && (!worst || u.supp > worst.supp)) worst = u;
      fid = worst ? worst.feat : 'church';
    }
    S.de.catk = fid; S.de.obj = `Counter-attack ${FEAT[fid].name}`;
    for (const u of S.units) if (u.side === 'DE' && alive(u) && u.role === 'reserve') { const p = nearestOpen(FEAT[fid].x + (R() - 0.5) * 30, FEAT[fid].y + (R() - 0.5) * 30); u.role = 'catk'; u.postX = p.x; u.postY = p.y; u.feat = fid; }
    S.de.catkLogged = false;
  }
}
function masked(u, p) { // own troops in the line of fire
  for (const f of S.units) {
    if (f.side !== u.side || f === u || !alive(f) || f.kind !== 'sec') continue;
    const df = hyp(f.x - u.x, f.y - u.y); if (df < 25) continue;
    if (segDist(f.x, f.y, u.x, u.y, p.x, p.y) < 14 && hyp(f.x - p.x, f.y - p.y) > 8) return true;
  }
  return false;
}
function shoot(u, tgt, area) {
  const p = tgt || area, d = hyp(p.x - u.x, p.y - u.y);
  if (masked(u, p)) { u.masked = S.time; return false; }
  const turned = u.side === 'DE' && tgt && flankOf(u, tgt) ? 0.6 : 1; // defenders turning to meet a flank attack
  const rifles = Math.max(0, u.men - u.lmg - (u.kind === 'coyhq' || u.kind === 'plhq' ? 2 : 0)), lmgs = Math.min(u.lmg, u.men);
  let fp = rifles * Math.max(0, 1 - d / 350) + lmgs * (u.side === 'GB' ? 4 : 7) * Math.max(0, 1 - d / 600);
  fp *= turned * (u.state === 'pinned' ? 0.2 : 1) * (1 - u.supp / 180) * (u.moving ? 0.5 : 1);
  if (fp <= 0.05) return false;
  u.firedT = S.time;
  const close = d < 40 ? 2.5 : 1;
  if (tgt) hit(tgt, fp * close, 1, u);
  else for (const f of S.units) if (f.side !== u.side && alive(f) && hyp(f.x - area.x, f.y - area.y) < 45) hit(f, fp, 0.35, u);
  if (S.tracers.length < 220) S.tracers.push({ x0: u.x, y0: u.y, x1: p.x + (R() - 0.5) * 16, y1: p.y + (R() - 0.5) * 16, t: S.time, de: u.side === 'DE', mg: u.lmg > 0 });
  return true;
}
// defenders face their heaviest incoming fire; anything arriving from >60 deg off that is a flank
function flankOf(t, src) {
  if (!t.fx && !t.fy) return false;
  const v = unitV(src.x - t.x, src.y - t.y);
  return v.x * t.fx + v.y * t.fy < 0.5;
}
function hit(t, fp, eff, src) {
  const dS = hyp(src.x - t.x, src.y - t.y);
  const fl = t.side === 'DE' && dS < 200 && flankOf(t, src);
  if (t.side === 'DE' && dS > 60 && !fl) { const v = unitV(src.x - t.x, src.y - t.y); const fx = (t.fx || 0) * 0.7 + v.x * 0.3, fy = (t.fy || 0) * 0.7 + v.y * 0.3, l = hyp(fx, fy) || 1; t.fx = fx / l; t.fy = fy / l; }
  if (fl) { eff *= 1.3; }
  const dug = t.side === 'DE' && t.role === 'hold' && coverAt(t.x, t.y) > 0.5 && hyp(t.x - t.postX, t.y - t.postY) < 12 ? 0.65 : 1; // foxholes, not on top of building cover
  const cov = coverAt(t.x, t.y) * dug, mv = t.moving ? (coverAt(t.x, t.y) > 0.9 ? 1.7 : 1.2) : 1, ex = t.cmdr ? t.cmdr.exp : 0.5;
  t.supp = Math.min(100, t.supp + fp * 2.6 * eff * (0.45 + 0.55 * cov) * (1.2 - 0.4 * ex));
  const e = fp * 0.0045 * eff * (fl ? Math.min(1, cov * 1.7) : cov) * mv * (t.state === 'pinned' ? 0.6 : 1);
  let k = Math.floor(e); if (R() < e - k) k++;
  if (!k) return;
  k = Math.min(k, t.men); t.men -= k; t.hitT = S.time; src.kills += k;
  t.morale -= k * (t.side === 'GB' ? 6 : 7);
  if (t.side === 'GB') { S.casualty[t.coy] = (S.casualty[t.coy] || 0) + k; S.stats.gbCas += k; } else S.stats.deCas += k;
  if (t.men <= 0) {
    t.state = 'dead'; t.moving = false;
    if (t.side === 'GB') { const n = S.nodes[t.id]; log(n ? n.level : 'sec', 'cas', t.id, `${t.name} wiped out.`, 'auto'); if (n && n.status !== 'achieved') fail(n, 'wiped out'); }
    else if (t.vis || t.spotted) log('coy', 'cas', t.id, `Enemy ${t.name} at ${tName(t)} knocked out.`, 'auto');
  }
}
function moraleUpd(u, dt) {
  const ex = u.cmdr ? u.cmdr.exp : 0.5, top = u.side === 'GB' ? 80 : 75;
  u.supp = Math.max(0, u.supp - dt * (2.2 + 3.5 * ex));
  if (u.state === 'broken') {
    u.morale = Math.min(top, u.morale + dt * 0.25);
    if (u.side === 'GB' && u.supp < SM.broken.rallySupp && u.morale > SM.broken.rallyMorale && u.men > Math.ceil(u.men0 * SM.broken.strength) && S.time - (u.brokeT || 0) > SM.broken.rallyDelay) { u.state = 'ok'; u.ph = 0; u.path = null; const n = S.nodes[u.id]; log(n ? n.level : 'sec', 'info', u.id, `${u.name} rallied.`, 'auto'); }
    return;
  }
  const gb = u.side === 'GB', brk = gb ? SM.broken : null, pin = gb ? SM.pinned : null;
  if (u.morale < (gb ? brk.morale : 25) || u.men <= Math.ceil(u.men0 * (gb ? brk.strength : 0.3))) {
    u.state = 'broken'; u.path = null; u.brokeT = S.time;
    if (u.side === 'GB') { const n = S.nodes[u.id]; log(n ? n.level : 'sec', 'cas', u.id, `${u.name} has broken and is falling back!`, 'auto'); }
    else if (u.vis) log('coy', 'info', u.id, `Enemy ${u.name} at ${tName(u)} is breaking!`, 'auto');
    return;
  }
  if (u.state === 'pinned') { if (u.supp < (gb ? pin.recover : 35)) { u.state = 'ok'; u.okT = S.time; } else u.pinT += dt; }
  else if (u.supp > (gb ? pin.at + pin.expBonus * ex : 70)) { u.state = 'pinned'; u.pinT = 0; }
  if (u.supp < 20) u.morale = Math.min(top, u.morale + dt * 0.15);
}
function pickTarget(u, pref, maxD = 560) {
  let best = null, bs = 1e9;
  for (const f of S.units) {
    if (f.side === u.side || !alive(f) || !f.vis) continue;
    const d = hyp(f.x - u.x, f.y - u.y); if (d > maxD) continue;
    let s = d - (f.kind === 'mg' ? 60 : 0) + (f.state === 'broken' ? 150 : 0);
    if (pref) s += hyp(f.x - pref.x, f.y - pref.y) * 0.8;
    if (s < bs && los(u.x, u.y, f.x, f.y)) { bs = s; best = f; }
  }
  return best;
}
function fireStep(u) {
  if (u.state === 'broken' || u.state === 'surr') return;
  const n = S.nodes[u.id];
  if (u.side === 'GB' && n && n.type && (n.type === 'suppress' || n.type === 'overwatch') && u.ph >= 1) {
    // spread fire over everything at the target, least-suppressed first
    const FS = SM[n.type];
    let t = null, bs = 1e9;
    for (const f of S.units) {
      if (f.side === u.side || !alive(f) || !f.vis || f.state === 'broken') continue;
      if (hyp(f.x - n.target.x, f.y - n.target.y) > FS.focus || hyp(f.x - u.x, f.y - u.y) > FS.range) continue;
      const s = f.supp + R() * 25 - (f.kind === 'mg' ? 10 : 0);
      if (s < bs && los(u.x, u.y, f.x, f.y)) { bs = s; t = f; }
    }
    if (t) return shoot(u, t);
    t = pickTarget(u, n.target, FS.range);
    if (n.type === 'suppress' && hyp(n.target.x - u.x, n.target.y - u.y) < FS.areaRange && losT(u.x, u.y, n.target.x, n.target.y) && enemyNear(n.target, 60, true).n) return shoot(u, null, n.target);
    if (t) return shoot(u, t);
    return false;
  }
  const t = pickTarget(u, null, u.side === 'DE' ? 600 : 500);
  if (t) return shoot(u, t);
  return false;
}
// ---- objective bookkeeping
function achieve(n, why) {
  if (n.status === 'achieved') return;
  const wasFail = n.status === 'failed';
  n.status = 'achieved'; n.prog = 1; n.doneT = S.time;
  if (wasFail) return;
  S.stats.ach[n.level]++;
  const c = cmdrOf(n);
  if (S.phase !== 'battle') return;
  if (n.level !== 'sec' || n.type === 'assault') log(n.level, 'ach', n.id, `${nodeName(n)}: ${say(c, 'achieved')} (${label(n)})`, 'auto');
  else log('sec', 'ach', n.id, `${nodeName(n)}: ${why}.`, 'auto');
  if (n.byYou) { c.trust = clamp(c.trust + 0.08, 0, 1); if (n.level !== 'sec') log(n.level, 'say', n.id, `${cname(c)}: ${say(c, 'worked')}`, 'auto'); }
  if (n.level === 'pl') for (const s of n.kids) { const sn = S.nodes[s]; if (sn.status !== 'failed' && sn.type !== 'assault' && alive(S.U[s])) { sn.status = 'achieved'; sn.prog = 1; } }
  if (n.level === 'coy') {
    for (const k of n.kids) { const p = S.nodes[k]; if (p.status !== 'failed') { p.status = 'achieved'; p.prog = 1; } for (const s of p.kids) { const sn = S.nodes[s]; if (sn.status !== 'failed' && sn.type !== 'assault') { sn.status = 'achieved'; sn.prog = 1; } } }
  }
}
function fail(n, why) {
  if (n.status === 'failed' || n.status === 'achieved') return;
  n.status = 'failed'; n.failWhy = why; n.doneT = S.time;
  S.stats.fail[n.level]++;
  const c = cmdrOf(n);
  log(n.level, 'fail', n.id, `${nodeName(n)}: ${say(c, 'failed')} ${why ? '(' + why + ')' : ''}`, 'auto');
  if (n.byYou) c.trust = clamp(c.trust - 0.06, 0, 1);
  if (n.rejected) { c.trust = clamp(c.trust + 0.1, 0, 1); log(n.level, 'say', n.id, `${cname(c)}: ${say(c, 'should')}`, 'auto'); }
}
function updNodes() {
  for (const C of COYS) {
    const cn = S.nodes[C.id];
    for (const pid of cn.kids) {
      const pl = S.nodes[pid], ks = pl.kids.map(k => S.nodes[k]);
      const live = ks.filter(k => alive(S.U[k.id]));
      if (!pl.type) continue;
      pl.prog = avg(ks.map(k => (alive(S.U[k.id]) ? k.prog : 0)));
      if (pl.status === 'achieved' || pl.status === 'failed') continue;
      const str = strength(secsOf(pl.id));
      if (!live.length || str < 0.3) { fail(pl, 'too many casualties'); continue; }
      if (live.every(k => S.U[k.id].state === 'broken')) { fail(pl, 'platoon broken'); continue; }
      if (pl.type === 'assault' || pl.type === 'clear') {
        if (targetClear(pl.target, pl.type === 'clear' ? 90 : 45) && live.some(k => hyp(S.U[k.id].x - pl.target.x, S.U[k.id].y - pl.target.y) < 50)) achieve(pl, 'taken');
        else setSt(pl, live.some(k => k.status === 'engaging') ? 'engaging' : 'moving');
        pl.wait = live.some(k => k.wait);
      } else if (pl.type === 'sbf') {
        setSt(pl, live.some(k => k.status === 'engaging') ? 'engaging' : 'moving');
        if (targetClear(pl.target, 55)) achieve(pl, 'target silenced');
      } else if (live.every(k => k.status === 'achieved')) achieve(pl, 'in position');
      else setSt(pl, 'moving');
    }
    coyStatus(cn);
  }
  withB(() => bnStatus(S.nodes.BN));
}
function bnStatus(n) {
  if (!n || !n.type) return;
  const cs = n.kids.map(k => S.nodes[k]);
  n.prog = avg(cs.map(c => (c.type ? c.prog : 0)));
  if (n.status === 'achieved' || n.status === 'failed') {
    if (n.status === 'achieved' && (n.type === 'hold' || OFFENSIVE.has(n.type)) && !targetClear(n.target, 40) && !gbNear(n.target, 70) && !n.lostLogged) {
      n.lostLogged = true; n.status = 'failed'; S.stats.fail.bn++; log('bn', 'fail', n.id, `${BN.name}: We've lost the ${tName(n.target)}!`, 'auto');
    }
    return;
  }
  if (strength(gbSecs()) < 0.35) return fail(n, 'battalion shattered');
  if (OFFENSIVE.has(n.type)) {
    if (targetClear(n.target, n.type === 'clear' ? 90 : 60) && gbNear(n.target, n.type === 'clear' ? 90 : 55)) return achieve(n, 'objective taken');
    if (S.time - n.t0 > [2000, 2600, 3400][n.prio]) return fail(n, 'attack ran out of steam');
  } else if (n.type === 'recon') { if (cs.some(c => c.type === 'recon' && c.status === 'achieved')) return achieve(n, 'objective scouted'); }
  else if (cs.every(c => !c.type || c.status === 'achieved' || c.status === 'failed')) return achieve(n, 'in position');
  setSt(n, cs.some(c => c.status === 'engaging') ? 'engaging' : 'moving');
}
function coyStatus(n) {
  if (!n.type) return;
  const pls = n.kids.map(k => S.nodes[k]);
  n.prog = avg(pls.map(p => p.prog));
  if (n.status === 'achieved' || n.status === 'failed') {
    if (n.status === 'achieved' && (n.type === 'hold' || n.type === 'seize' || n.type === 'clear') && !targetClear(n.target, 40) && !gbNear(n.target, 70) && !n.lostLogged) {
      n.lostLogged = true; n.status = 'failed'; S.stats.fail.coy++; log('coy', 'fail', n.id, `${n.id} Coy: We've lost the ${tName(n.target)}!`, 'auto');
    }
    return;
  }
  const str = strength(coyUnits(n.id).filter(u => u.kind === 'sec'));
  const limit = [1300, 1800, 2600][n.prio];
  if (str < 0.4) return fail(n, 'company shattered');
  switch (n.type) {
    case 'seize': case 'clear':
      if (targetClear(n.target, n.type === 'clear' ? 90 : 60) && gbNear(n.target, n.type === 'clear' ? 90 : 55)) return achieve(n);
      if (S.time - n.t0 > limit) return fail(n, 'attack ran out of steam');
      break;
    case 'recon': {
      const seeing = S.units.some(u => u.side === 'GB' && alive(u) && u.kind === 'sec' && hyp(u.x - n.target.x, u.y - n.target.y) < 360 && losT(u.x, u.y, n.target.x, n.target.y));
      if (seeing) n.seen = (n.seen || 0) + 1;
      if (n.seen > 25) {
        for (const u of S.units) if (u.side === 'DE' && alive(u) && hyp(u.x - n.target.x, u.y - n.target.y) < 130) { u.seenT = S.time; u.last = { x: u.x, y: u.y }; u.spotted = true; }
        const e = enemyNear(n.target, 130, true);
        achieve(n); log('coy', 'info', n.id, `${n.id} Coy recon: ${e.n ? `${e.n} enemy groups${e.mg ? `, ${e.mg} MG` : ''} at ${tName(n.target)}` : `${tName(n.target)} looks empty`}.`, 'auto');
      }
      break;
    }
    case 'sbf':
      if (targetClear(n.target, 60)) return achieve(n);
      break;
    case 'hold': case 'reserve': case 'screen': case 'withdraw':
      if (pls.every(p => p.status === 'achieved' || p.status === 'failed' || !secsOf(p.id).some(alive))) return achieve(n);
      break;
  }
  setSt(n, pls.some(p => p.status === 'engaging') ? 'engaging' : 'moving');
}
// ---- auto-adapt: pinned sections return fire, platoons swap a shattered assault section
function adapt() {
  for (const u of S.units) {
    if (u.side !== 'GB' || u.kind !== 'sec' || !alive(u)) continue;
    const n = S.nodes[u.id]; if (!n.type) continue;
    const ex = u.cmdr.exp, lim = SM.pinned.returnFire - SM.pinned.expFaster * ex;
    const close = n.type === 'assault' && u.ph === 2 && n.target && hyp(u.x - n.target.x, u.y - n.target.y) < 80;
    if (u.state === 'pinned' && u.pinT > lim && !n.orig && !close && (n.type === 'assault' || n.type === 'move' || n.type === 'hold') && n.status !== 'achieved') {
      const t = pickTarget(u, null, 600);
      if (t) {
        n.orig = { ...specOf(n), ph: u.ph, prog: n.prog };
        n.type = 'suppress'; n.target = { x: t.x, y: t.y }; n.pos = { x: u.x, y: u.y }; u.ph = 1; n.auto = true; n.flash = performance.now(); n.adaptT = S.time;
        log('sec', 'chg', u.id, `${u.name}: Pinned by ${t.name} at ${tName(t)} — returning fire.`, 'auto');
      }
    } else if (n.orig && u.state === 'ok' && S.time - (u.okT || 0) > SM.pinned.resume && S.time - n.adaptT > 20) {
      const o = n.orig; n.orig = null;
      n.type = o.type; n.target = o.target; n.pos = o.pos; u.ph = o.ph; n.prog = o.prog; n.auto = false; n.flash = performance.now(); u.path = null;
      log('sec', 'chg', u.id, `${u.name}: Fire's slackened, pressing on.`, 'auto');
    }
  }
  // company commander commits his reserve when the assault is spent
  for (const C of COYS) {
    const cn = S.nodes[C.id], c = cmdrOf(cn);
    if (!OFFENSIVE.has(cn.type) || cn.status === 'achieved' || cn.status === 'failed' || S.time < (cn.commitCd || 0)) continue;
    const pls = cn.kids.map(k => S.nodes[k]);
    const asl = pls.filter(p => p.type === 'assault' || p.type === 'clear');
    const spent = (p) => p.status === 'failed' || (p.goT && S.time - p.goT > 140 + 360 * (1 - c.judg)) || (p.status === 'achieved' && !targetClear(cn.target, cn.type === 'clear' ? 90 : 60)) || secsOf(p.id).filter(u => alive(u) && u.state !== 'broken' && u.men >= 4).length === 0;
    if (asl.length && !asl.every(spent)) continue;
    const res = pls.filter(p => !asl.includes(p) && !p.locked && p.type !== 'sbf' && strength(secsOf(p.id)) > 0.55).sort((a, b) => strength(secsOf(b.id)) - strength(secsOf(a.id)))[0];
    cn.commitCd = S.time + 60;
    if (!res || R() > 0.3 + 0.7 * c.judg) continue;
    const from = centroid(secsOf(res.id));
    setSpec(res, { type: cn.type === 'clear' ? 'clear' : 'assault', target: cn.target, pos: fupAt(cn.target, from, (R() < 0.5 ? -1 : 1) * (0.4 + 0.6 * c.judg)), gate: null }, 'auto');
    decomposePl(res, 'auto');
    log('coy', 'chg', C.id, `${C.id} Coy: ${cname(c)} commits ${nodeName(res)} to the ${cn.type === 'clear' ? 'clearance' : 'assault'}.`, 'auto');
  }
  withB(bnCommit);
  for (const C of COYS) for (const pid of S.nodes[C.id].kids) {
    const pl = S.nodes[pid], c = cmdrOf(pl);
    if (pl.status === 'achieved' || pl.status === 'failed' || !(pl.type === 'assault' || pl.type === 'clear')) continue;
    if (S.time < (pl.swapCd || 0)) continue;
    const ks = pl.kids.map(k => S.nodes[k]);
    const bad = ks.find(k => k.type === 'assault' && !k.locked && (S.U[k.id].state === 'broken' || S.U[k.id].men < 5));
    const good = ks.find(k => (k.type === 'overwatch' || k.type === 'suppress') && !k.locked && !k.orig && alive(S.U[k.id]) && S.U[k.id].men >= 7 && S.U[k.id].state === 'ok');
    if (bad && good) {
      pl.swapCd = S.time + 120;
      if (R() > 0.3 + 0.7 * c.judg) continue; // dumb leaders don't notice
      const a = specOf(bad), b = specOf(good);
      setSpec(good, a, 'auto'); setSpec(bad, b, 'auto'); S.U[good.id].ph = 0;
      log('pl', 'chg', pl.id, `${nodeName(pl)}: ${S.U[good.id].sn} Sec takes over the assault from ${S.U[bad.id].sn} Sec (casualties).`, 'auto');
    }
  }
}
// battalion CO commits a reserve company when the companies on the objective are spent
function bnCommit() {
  const bn = S.nodes.BN, c = cmdrOf(bn);
  if (!bn.type || !OFFENSIVE.has(bn.type) || bn.status === 'achieved' || bn.status === 'failed' || S.time < (bn.commitCd || 0)) return;
  const cs = bn.kids.map(k => S.nodes[k]);
  const main = cs.filter(co => OFFENSIVE.has(co.type) && hyp(co.target.x - bn.target.x, co.target.y - bn.target.y) < 100);
  const spent = (co) => co.status === 'failed' || strength(coyUnits(co.id).filter(u => u.kind === 'sec')) < 0.45 || (co.status === 'achieved' && !targetClear(bn.target, 60));
  if (main.length && !main.every(spent)) return;
  const res = cs.filter(co => !main.includes(co) && !co.locked && (co.type === 'reserve' || co.type === 'hold') && strength(coyUnits(co.id).filter(u => u.kind === 'sec')) > 0.55)[0];
  bn.commitCd = S.time + 90;
  if (!res || R() > 0.3 + 0.7 * c.judg) return;
  setSpec(res, { type: bn.type, target: bn.target, pos: null, gate: null }, 'auto');
  decomposeCoy(res, 'auto');
  log('bn', 'chg', 'BN', `${BN.name}: ${cname(c)} commits ${res.id} Coy to the ${bn.type === 'clear' ? 'clearance' : 'attack'} on the ${tName(bn.target)}.`, 'auto');
}
// ---- bottom-up requests
const REQ_WHY = { cas: 'Casualties over 40%', stall: 'Attack stalled', early: 'Objective achieved early', weak: 'Enemy weakening', flank: 'Flank open' };
function sugQ(n, s) {
  const save = specOf(n); n.type = s.type; n.target = s.target;
  let q = decomposeCoy(n, null, true); n.type = save.type; n.target = save.target;
  const e = enemyNear(s.target, 90, true), str = strength(coyUnits(n.id).filter(u => u.kind === 'sec'));
  if (OFFENSIVE.has(s.type)) q -= 12 * e.mg + 5 * e.n + (str < 0.6 ? 25 : 0);
  if ((s.type === 'hold' || s.type === 'withdraw') && str < 0.6) q += 20;
  return clamp(Math.round(q), 0, 100);
}
function heldFeats() { return FEATS.filter(f => f.id !== 'start' && enemyNear(f, f.r, true).n > 0); }
function makeReq(n, kind) {
  const c = cmdrOf(n), here = centroid(coyUnits(n.id).filter(u => u.kind === 'sec'));
  const hereP = nearestOpen(here.x, here.y), tgts = COYS.map(C => S.nodes[C.id]).filter(o => o !== n && OFFENSIVE.has(o.type) && o.status !== 'achieved');
  const nearFeat = (excl) => heldFeats().filter(f => !excl || hyp(f.x - excl.x, f.y - excl.y) > 60).sort((a, b) => hyp(a.x - here.x, a.y - here.y) - hyp(b.x - here.x, b.y - here.y))[0];
  let sugs = [];
  const S_ = (type, target, why) => target && sugs.push({ type, target: { x: target.x, y: target.y }, why });
  if (kind === 'cas') {
    S_('hold', hereP, "Dig in where we are, we can't go on like this");
    S_('withdraw', FEAT.start, 'Pull back to the start line and reorganise');
    S_('sbf', n.target, 'Support others by fire instead of assaulting');
  } else if (kind === 'stall') {
    S_('sbf', n.target, 'Pin them down, let another company go round');
    const alt = nearFeat(n.target); if (alt) S_('seize', alt, `${alt.name} looks weaker`);
    S_('recon', n.target, 'Find out what we are really up against');
    S_('seize', n.target, 'Give us another go, new plan');
  } else if (kind === 'early') {
    const nx = nearFeat(n.target); if (nx) S_('seize', nx, `Push on to the ${nx.name} while they're off balance`);
    S_('hold', n.target, `Consolidate on the ${tName(n.target)}`);
    if (tgts[0]) S_('sbf', tgts[0].target, `Help ${tgts[0].id} Coy at the ${tName(tgts[0].target)}`);
  } else if (kind === 'weak') {
    S_('seize', n.weakF, `Enemy at the ${n.weakF.name} is breaking, exploit it`);
    S_(n.type, n.target, 'Stick to the plan');
  } else if (kind === 'flank') {
    const o = n.flankOf, mid = nearestOpen((here.x + o.x) / 2, (here.y + o.y) / 2);
    S_('screen', mid, 'Guard the open flank');
    S_('hold', hereP, 'Hold here till the flank is sorted');
  }
  sugs = sugs.slice(0, 3);
  for (const s of sugs) { s.q = sugQ(n, s); s.perc = s.q + gauss() * 30 * (1 - c.judg) * (1 - 0.5 * c.exp); }
  sugs.sort((a, b) => b.perc - a.perc);
  const lines = {
    cas: ["We've taken a beating, sir.", 'Lost a lot of good lads.', 'Casualties heavy.'],
    stall: ["We're held up, sir.", "Can't get forward.", 'Pinned in front of them.'],
    early: ["We're on the objective, sir. What next?", 'Objective ours. Ready for more.'],
    weak: ['Jerry looks shaky over there.', "They're pulling out, sir!"],
    flank: ['Our flank is hanging in the air.', 'Nobody on our flank, sir.'],
  };
  let txt = pickL(lines[kind]);
  if (c.quirk === 'aggressive' && kind !== 'cas') txt += ' Let us at them!';
  if (c.quirk === 'cautious') txt += ' Suggest we play it safe.';
  addReq({ kind: 'req', why: kind, coy: n.id, node: n.id, text: `${cname(c)} (${n.id} Coy): ${txt}`, sugs, cmdr: c });
  S.stats.reqs[kind] = (S.stats.reqs[kind] || 0) + 1;
  log('coy', 'req', n.id, `${n.id} Coy request — ${REQ_WHY[kind]}: ${txt}`, 'them');
}
// the battalion CO asks you too
function bnSugQ(n, s) {
  const save = specOf(n); n.type = s.type; n.target = s.target;
  let q = decomposeBn(n, null, true); n.type = save.type; n.target = save.target;
  const e = enemyNear(s.target, 120, true), str = strength(gbSecs());
  if (OFFENSIVE.has(s.type)) q -= 8 * e.mg + 4 * e.n + (str < 0.6 ? 25 : 0);
  if ((s.type === 'hold' || s.type === 'withdraw') && str < 0.6) q += 20;
  return clamp(Math.round(q), 0, 100);
}
function makeBnReq(n, kind) {
  const c = cmdrOf(n), here = centroid(gbSecs()), hereP = nearestOpen(here.x, here.y);
  const ok = (t) => !!DOC.bn[t];
  let sugs = [];
  const S_ = (type, target, why) => target && ok(type) && sugs.push({ type, target: { x: target.x, y: target.y }, why });
  const next = heldFeats().filter(f => hyp(f.x - n.target.x, f.y - n.target.y) > 80).sort((a, b) => hyp(a.x - n.target.x, a.y - n.target.y) - hyp(b.x - n.target.x, b.y - n.target.y))[0];
  if (kind === 'cas') {
    S_('hold', hereP, "The battalion's hurt. Let us dig in where we are");
    S_('withdraw', FEAT.start, 'Pull the battalion back to the start line');
    S_('recon', n.target, 'Stop attacking, just watch them');
  } else if (kind === 'stall') {
    if (next) S_('seize', next, `Switch the main effort to the ${next.name}`);
    S_('recon', n.target, 'Find out what we are really up against');
    S_(n.type, n.target, 'Give us another go, new plan');
  } else if (kind === 'early') {
    if (next) S_('seize', next, `Push on to the ${next.name} while they're off balance`);
    S_('hold', n.target, `Consolidate the battalion on the ${tName(n.target)}`);
  }
  sugs = sugs.slice(0, 3);
  if (!sugs.length) return;
  for (const s of sugs) { s.q = bnSugQ(n, s); s.perc = s.q + gauss() * 30 * (1 - c.judg) * (1 - 0.5 * c.exp); }
  sugs.sort((a, b) => b.perc - a.perc);
  const lines = { cas: ['The battalion has taken a beating, sir.', 'We are losing too many men, sir.'], stall: ['The battalion attack is stuck, sir.', "We can't get onto the objective."], early: ['Battalion objective taken, sir. What next?', 'We hold the objective. Orders?'] };
  let txt = pickL(lines[kind]);
  if (c.quirk === 'aggressive' && kind !== 'cas') txt += ' Let us at them!';
  if (c.quirk === 'cautious') txt += ' Suggest we play it safe.';
  addReq({ kind: 'req', why: kind, coy: 'BN', node: 'BN', text: `${cname(c)} (${BN.name}): ${txt}`, sugs, cmdr: c });
  S.stats.reqs['bn-' + kind] = (S.stats.reqs['bn-' + kind] || 0) + 1;
  log('bn', 'req', 'BN', `${BN.name} request — ${REQ_WHY[kind]}: ${txt}`, 'them');
}
function checkBnReqs() {
  const n = S.nodes.BN; if (!n || !n.type) return; n.flags = n.flags || {};
  if (S.reqs.some(r => r.status === 'open' && r.coy === 'BN' && r.kind === 'req')) return;
  if (S.time < (n.reqCd || 90)) return;
  const str = strength(gbSecs());
  let kind = null;
  if (str < 0.6 && !n.flags.cas && n.status !== 'achieved' && n.status !== 'failed' && n.type !== 'withdraw') kind = 'cas';
  else if (OFFENSIVE.has(n.type) && n.status !== 'achieved' && !n.flags.stall && S.time - n.t0 > 1100 && n.prog < 0.55) kind = 'stall';
  else if (n.status === 'achieved' && !n.flags.early && n.doneT && S.time - n.doneT > 20 && (OFFENSIVE.has(n.type) || n.type === 'recon')) kind = 'early';
  if (kind) { n.flags[kind] = 1; n.reqCd = S.time + 200; makeBnReq(n, kind); }
}
function addReq(r) {
  r.id = S.nextReq++; r.t = S.time; r.status = 'open'; r.coy = r.coy || S.nodes[r.node].coy;
  S.reqs.push(r);
  if (S.autoPause && S.phase === 'battle' && !S.noPause) { S.paused = true; S.pausedBy = 'req'; }
  if (typeof onReq === 'function') onReq(r);
}
function checkReqs() {
  for (const C of COYS) {
    const n = S.nodes[C.id]; n.flags = n.flags || {};
    if (S.reqs.some(r => r.status === 'open' && r.coy === C.id && r.kind === 'req')) continue;
    if (S.time < (n.reqCd || 60)) continue;
    const secs = coyUnits(C.id).filter(u => u.kind === 'sec');
    const str = strength(secs);
    let kind = null;
    const off = OFFENSIVE.has(n.type);
    if (str < (n.prio === 2 ? 0.5 : 0.6) && !n.flags.cas && n.status !== 'achieved' && n.status !== 'failed' && n.type !== 'withdraw') kind = 'cas';
    else if (off && n.status !== 'achieved' && !n.flags.stall && (secs.some(u => { const sn = S.nodes[u.id]; return sn.orig && S.time - sn.adaptT > 50; }) || (S.time - n.t0 > 800 && n.prog < 0.6))) kind = 'stall';
    else if (n.status === 'achieved' && !n.flags.early && n.doneT && S.time - n.doneT > 20 && (OFFENSIVE.has(n.type) || n.type === 'recon' || n.type === 'sbf')) kind = 'early';
    else if (!n.flags.weak) {
      const here = centroid(secs);
      const f = FEATS.find(f => f.id !== 'start' && f.id !== 'nbank' && hyp(f.x - here.x, f.y - here.y) < 450 && !COYS.some(o => S.nodes[o.id].target && hyp(S.nodes[o.id].target.x - f.x, S.nodes[o.id].target.y - f.y) < 60)
        && S.units.some(u => u.side === 'DE' && u.feat === f.id && u.vis && u.state === 'broken') && enemyNear(f, f.r, true).n <= 1);
      if (f && !S.weakDone[f.id]) { kind = 'weak'; n.weakF = f; S.weakDone[f.id] = 1; }
    }
    if (!kind && !n.flags.flank && n.status !== 'failed') {
      const i = COYS.indexOf(C);
      for (const j of [i - 1, i + 1]) {
        const o = COYS[j]; if (!o) continue;
        const on = S.nodes[o.id];
        if (!S.flankDone[C.id + o.id] && (on.status === 'failed' || on.type === 'withdraw' || strength(coyUnits(o.id).filter(u => u.kind === 'sec')) < 0.45)) { S.flankDone[C.id + o.id] = 1; kind = 'flank'; n.flankOf = centroid(coyUnits(o.id)); if (!n.flankOf.x) n.flankOf = { x: o.home[0], y: o.home[1] - 300 }; break; }
      }
    }
    if (kind) { n.flags[kind] = 1; n.reqCd = S.time + 150; makeReq(n, kind); }
  }
}
function answerReq(r, how, sIdx = 0) {
  const n = S.nodes[r.node], c = cmdrOf(n);
  r.status = how;
  if (how === 'accept') {
    const s = r.sugs[sIdx];
    applyProp(n, { type: s.type, target: s.target, pos: null }, 'cmdr');
    n.manual = false; n.byYou = false; n.flags = n.flags || {};
    c.trust = clamp(c.trust + 0.03, 0, 1);
    log(n.level, 'chg', n.id, `You approved ${nodeName(n)}'s request: ${label(s)}. ${cname(c)}: ${pickL(['Thank you, sir.', 'On our way.', 'Right you are.'])}`, 'you');
  } else if (how === 'deny') {
    n.reqCd = S.time + 240; c.trust = clamp(c.trust - 0.02, 0, 1);
    log(n.level, 'req', n.id, `Request denied. ${cname(c)}: ${c.obed < 0.3 ? 'Rather hoped you\'d say yes.' : 'Understood, carrying on.'}`, 'you');
  }
  refreshUI();
}
function feedCas() {
  for (const C of COYS) {
    const k = S.casualty[C.id] || 0; if (!k) continue;
    S.casualty[C.id] = 0;
    const s = Math.round(strength(coyUnits(C.id)) * 100);
    log('coy', 'cas', C.id, `${C.id} Coy: ${k} casualt${k > 1 ? 'ies' : 'y'} in the last minute, ${s}% strength.`, 'auto');
  }
}
function tick() {
  const dt = TICK;
  S.time += dt; S.tickN++;
  for (const u of S.units) { u.px = u.x; u.py = u.y; u.pa = u.a; }
  if (S.tickN % 2 === 0) updVis();
  for (const u of S.units) { if (!alive(u)) continue; moraleUpd(u, dt); }
  for (const u of S.units) {
    if (!alive(u)) continue;
    if (u.side === 'DE') deAct(u, dt);
    else if (u.kind === 'sec') secAct(u, S.nodes[u.id], dt);
    else hqAct(u, dt);
  }
  bnHqAct(dt);
  for (const u of S.units) {
    if (!alive(u)) continue;
    u.fireCd -= dt;
    if (u.fireCd <= 0) { u.fireCd = 1.8 + R() * 0.6; fireStep(u); }
  }
  if (S.tickN % 2 === 0) { updNodes(); adapt(); }
  if (S.tickN % 10 === 0) deBrain();
  if (S.de.catk && !S.de.catkLogged && S.units.some(u => u.side === 'DE' && u.role === 'catk' && u.vis)) { S.de.catkLogged = true; log('coy', 'info', null, `⚠ Enemy counter-attack toward the ${FEAT[S.de.catk].name}!`, 'auto'); }
  if (S.tickN % 30 === 0) { checkReqs(); withB(checkBnReqs); }
  if (S.tickN % 120 === 0) feedCas();
  for (let i = S.pending.length - 1; i >= 0; i--) {
    const p = S.pending[i];
    if (S.time >= p.at) { S.pending.splice(i, 1); const n = S.nodes[p.node]; applyProp(n, p.prop, 'you'); if (p.lock) n.locked = true; log(n.level, 'chg', n.id, `${cname(cmdrOf(n))}: Right, doing it your way now. → ${label(p.prop)}`, 'you'); }
  }
  for (const id in S.nodes) {
    const n = S.nodes[id];
    if (n.ignored && S.time >= n.ignored.at) {
      const c = cmdrOf(n); n.ignored = null; n.shown = null; n.manual = false; n.flash = performance.now();
      c.trust = clamp(c.trust - 0.1, 0, 1); S.stats.found++;
      log(n.level, 'chg', n.id, `⚠ You find out ${cname(c)} (${nodeName(n)}) ${say(c, 'found')}: still on ${label(n)}.`, 'auto');
    }
  }
  S.tracers = S.tracers.filter(t => S.time - t.t < 1.2);
  if (S.tickN % 10 === 0) checkEnd();
}
function checkEnd() {
  if (S.endMsg) return;
  const de = S.units.filter(u => u.side === 'DE' && alive(u) && u.state !== 'broken' && u.y > 240);
  const gb = strength(S.units.filter(u => u.side === 'GB' && u.kind === 'sec'));
  const coys = COYS.map(C => S.nodes[C.id]);
  const done = coys.every(n => n.status === 'achieved' || n.status === 'failed');
  let msg = null;
  if (!de.length) msg = 'Enemy south of the river routed. Victory!';
  else if (gb < 0.3) msg = 'The battalion is spent. Defeat.';
  else if (done && S.time > 120) { const a = coys.filter(n => n.status === 'achieved').length; msg = a === 3 ? 'All company objectives achieved.' : `${a} of 3 company objectives achieved.`; }
  else if (S.time >= 3600) msg = 'Time is up (H+60).';
  if (msg) {
    S.endMsg = msg; S.paused = true;
    log('coy', 'info', null, `🏁 ${msg} British casualties ${S.stats.gbCas}, enemy ${S.stats.deCas}.`, 'auto');
    if (typeof onEnd === 'function') onEnd();
  }
}
// ---------------------------------------------------------------- scenario
// the battalion is ordered to seize the Church; its textbook plan puts A Coy on the Farm, B Coy on the Church and C Coy into the Wood
const DEFAULT_PLAN = { BN: ['seize', 'church'] };
function newScenario(seed, plan) {
  S.seed = seed; S.rng = mulberry(seed * 7919 + 13); S.brng = mulberry(seed * 104729 + 31);
  S.time = 0; S.tickN = 0; S.phase = 'plan'; S.paused = true; S.feed = []; S.reqs = []; S.toasts = []; S.tracers = []; S.pending = [];
  S.casualty = {}; S.endMsg = null; S.sel = null; S.nextReq = 1; S.weakDone = {}; S.flankDone = {};
  S.stats = { ach: { bn: 0, coy: 0, pl: 0, sec: 0 }, fail: { bn: 0, coy: 0, pl: 0, sec: 0 }, reqs: {}, gbCas: 0, deCas: 0, found: 0, nav: STATS };
  S.de = { catk: null, catkT: 480 + R() * 300, obj: 'Hold the village line' };
  buildOOB(); buildTree();
  plan = plan || DEFAULT_PLAN;
  const bn = S.nodes.BN;
  if (plan.BN) bn.type = plan.BN[0], bn.target = { x: FEAT[plan.BN[1]].x, y: FEAT[plan.BN[1]].y };
  bn.flags = {};
  if (plan.A) { // company-level plan (tests / old callers): the battalion keeps its objective but doesn't re-plan the companies
    for (const C of COYS) { const n = S.nodes[C.id], [t, f] = plan[C.id]; n.type = t; n.target = { x: FEAT[f].x, y: FEAT[f].y }; n.flags = {}; }
    planAll(); if (bn.type) bnRequal();
  } else decomposeBn(bn, 'plan');
  for (const id in S.nodes) { S.nodes[id].flash = 0; S.nodes[id].ghost = null; S.nodes[id].status = 'planned'; }
  if (bn.type) log('bn', 'info', 'BN', `${BN.name} orders: ${label(bn)}. ${cname(cmdrOf(bn))} plans: ${bn.vname || 'own plan'} (quality ${bn.q}).`, 'auto');
  log('coy', 'info', null, `Orders: ${COYS.map(C => `${C.id} Coy ${label(S.nodes[C.id])}`).join(' · ')}. Review, edit, then ▶ Play.`, 'auto');
}
function startBattle() {
  if (S.phase !== 'plan') return;
  S.phase = 'battle'; S.paused = false;
  for (const id in S.nodes) { const n = S.nodes[id]; n.t0 = 0; }
  log('coy', 'info', null, 'H-hour. Advance!', 'auto');
}

// ---------------------------------------------------------------- rendering
const cv = document.getElementById('cv'), cx = cv.getContext('2d');
const cam = { x: WW / 2, y: WH * 0.62, z: 1, vw: 1, vh: 1, ox: 0, oy: 0, fit: true };
let DPR = 1, W = 1, H = 1;
const MS = 1.5; // map raster px per metre
let mapImg = null;
function prerender() {
  const c = document.createElement('canvas'); c.width = WW * MS; c.height = WH * MS;
  const g = c.getContext('2d'); g.scale(MS, MS);
  const r = mulberry(77);
  g.fillStyle = '#7f9a58'; g.fillRect(0, 0, WW, WH);
  // fields
  for (let i = 0; i < 70; i++) {
    const x = r() * WW, y = r() * WH, w = 60 + r() * 140, h = 40 + r() * 110;
    g.fillStyle = ['#86a15d', '#90a764', '#7a9452', '#9aa96a', '#8a9d5a'][(r() * 5) | 0]; g.globalAlpha = 0.55;
    g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.3); g.fillRect(-w / 2, -h / 2, w, h);
    g.globalAlpha = 0.18; g.strokeStyle = '#5e7440'; g.lineWidth = 0.8;
    for (let k = -w / 2 + 6; k < w / 2; k += 7) { g.beginPath(); g.moveTo(k, -h / 2); g.lineTo(k, h / 2); g.stroke(); }
    g.restore();
  }
  g.globalAlpha = 1;
  // ridge shading
  for (let k = 8; k >= 1; k--) {
    g.save(); g.translate(RIDGE.x, RIDGE.y); g.rotate(RIDGE.a);
    g.beginPath(); g.ellipse(0, 0, RIDGE.rx * k / 8, RIDGE.ry * k / 8, 0, 0, TAU);
    g.fillStyle = `rgba(150,130,80,${0.07})`; g.fill();
    if (k % 2 === 0) { g.strokeStyle = 'rgba(90,70,40,0.35)'; g.lineWidth = 0.9; g.stroke(); }
    g.restore();
  }
  // river
  const path = (P) => { g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  path(RIVER); g.strokeStyle = '#4f6b3a'; g.lineWidth = RIVER_W + 8; g.stroke();
  path(RIVER); g.strokeStyle = '#3d6f95'; g.lineWidth = RIVER_W; g.stroke();
  path(RIVER); g.strokeStyle = 'rgba(160,200,230,0.35)'; g.lineWidth = 3; g.setLineDash([12, 18]); g.stroke(); g.setLineDash([]);
  // roads
  for (const R of ROADS) { path(R); g.strokeStyle = '#6d6250'; g.lineWidth = 9; g.stroke(); path(R); g.strokeStyle = '#b8a888'; g.lineWidth = 6.5; g.stroke(); }
  // bridge
  g.fillStyle = '#8c8577'; g.fillRect(BRIDGE.x - 7, BRIDGE.y - 24, 14, 48);
  g.strokeStyle = '#3a352c'; g.lineWidth = 1.6; g.strokeRect(BRIDGE.x - 7, BRIDGE.y - 24, 14, 48);
  // hedges
  for (const [a, b] of HEDGES) {
    const L = hyp(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d < L; d += 3) { const t = d / L; g.fillStyle = r() < 0.5 ? '#3f5a2a' : '#4b6a31'; g.beginPath(); g.arc(lerp(a[0], b[0], t) + (r() - 0.5) * 1.5, lerp(a[1], b[1], t) + (r() - 0.5) * 1.5, 2.2 + r(), 0, TAU); g.fill(); }
  }
  // wood
  g.beginPath(); g.ellipse(WOOD.x, WOOD.y, WOOD.rx, WOOD.ry, 0, 0, TAU); g.fillStyle = '#41592c'; g.fill();
  for (const [x, y, s] of TREES) { g.fillStyle = 'rgba(25,40,18,0.5)'; g.beginPath(); g.arc(x + 1.5, y + 1.5, s, 0, TAU); g.fill(); g.fillStyle = r() < 0.5 ? '#4f6e33' : '#5b7b3a'; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); }
  // buildings
  for (const h of HOUSES) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(h.x + 2, h.y + 2, h.w, h.h);
    g.fillStyle = h.k === 'church' ? '#9c968a' : h.k === 'farm' ? '#8b6a4a' : '#a5533f'; g.fillRect(h.x, h.y, h.w, h.h);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 0.8; g.strokeRect(h.x, h.y, h.w, h.h);
    g.beginPath(); if (h.w > h.h) { g.moveTo(h.x, h.y + h.h / 2); g.lineTo(h.x + h.w, h.y + h.h / 2); } else { g.moveTo(h.x + h.w / 2, h.y); g.lineTo(h.x + h.w / 2, h.y + h.h); } g.stroke();
  }
  const tw = HOUSES.find(h => h.k === 'church' && h.h < 20);
  g.strokeStyle = '#2d2a26'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(tw.x + tw.w / 2, tw.y + 2); g.lineTo(tw.x + tw.w / 2, tw.y + tw.h - 2); g.moveTo(tw.x + 2, tw.y + tw.h / 2 - 1); g.lineTo(tw.x + tw.w - 2, tw.y + tw.h / 2 - 1); g.stroke();
  // start line
  g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(80, 790); g.lineTo(1120, 790); g.stroke(); g.setLineDash([]);
  mapImg = c;
}
const w2s = (x, y) => [(x - cam.x) * cam.z + cam.ox + cam.vw / 2, (y - cam.y) * cam.z + cam.oy + cam.vh / 2];
const s2w = (sx, sy) => [(sx - cam.ox - cam.vw / 2) / cam.z + cam.x, (sy - cam.oy - cam.vh / 2) / cam.z + cam.y];
const FITBOX = { x0: 140, x1: 1110, y0: 250, y1: 885 };
function fitCam() {
  const fz = Math.min(cam.vw / (FITBOX.x1 - FITBOX.x0), cam.vh / (FITBOX.y1 - FITBOX.y0));
  cam.z = Math.max(fz, Math.min(cam.vh / WH * 0.85, cam.vw / 860)); // tall phone screens: fill the height rather than letterbox
  cam.x = (FITBOX.x0 + FITBOX.x1) / 2; cam.y = (FITBOX.y0 + FITBOX.y1) / 2; cam.fit = true; clampCam();
}
function clampCam() {
  const zmin = Math.min(cam.vw / WW, cam.vh / WH) * 0.9; cam.z = clamp(cam.z, zmin, 8);
  const hw = cam.vw / 2 / cam.z, hh = cam.vh / 2 / cam.z;
  cam.x = hw * 2 >= WW ? WW / 2 : clamp(cam.x, hw, WW - hw);
  cam.y = hh * 2 >= WH ? WH / 2 : clamp(cam.y, hh, WH - hh);
}
function centerOn(x, y, z) { cam.x = x; cam.y = y; if (z) cam.z = Math.max(cam.z, z); cam.fit = false; clampCam(); }
const dispSpec = (n) => n.shown || specOf(n);
let alpha = 0;
const ipos = (u) => ({ x: lerp(u.px ?? u.x, u.x, alpha), y: lerp(u.py ?? u.y, u.y, alpha) });
function arrow(x0, y0, x1, y1, col, w, dash, head = true) {
  const [a, b] = w2s(x0, y0), [c, d] = w2s(x1, y1);
  const L = hyp(c - a, d - b); if (L < 4) return;
  cx.strokeStyle = col; cx.lineWidth = w; cx.setLineDash(dash || []);
  cx.beginPath(); cx.moveTo(a, b); cx.lineTo(c, d); cx.stroke(); cx.setLineDash([]);
  if (!head) return;
  const ux = (c - a) / L, uy = (d - b) / L, hs = Math.max(7, w * 3);
  cx.fillStyle = col; cx.beginPath(); cx.moveTo(c, d); cx.lineTo(c - ux * hs - uy * hs * 0.55, d - uy * hs + ux * hs * 0.55); cx.lineTo(c - ux * hs + uy * hs * 0.55, d - uy * hs - ux * hs * 0.55); cx.fill();
}
function ring(x, y, r, col, w, dash) { const [a, b] = w2s(x, y); cx.strokeStyle = col; cx.lineWidth = w; cx.setLineDash(dash || []); cx.beginPath(); cx.arc(a, b, r, 0, TAU); cx.stroke(); cx.setLineDash([]); }
function txt(s, x, y, size, col, align = 'center', bg) {
  cx.font = `600 ${size}px system-ui, sans-serif`; cx.textAlign = align; cx.textBaseline = 'middle';
  if (bg) { const w = cx.measureText(s).width; cx.fillStyle = bg; const x0 = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w; rr(x0 - 4, y - size * 0.7, w + 8, size * 1.4, 4); cx.fill(); }
  cx.fillStyle = col; cx.fillText(s, x, y);
}
function rr(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
function nodePos(n) { if (n.level === 'bn') return centroid(gbSecs().map(u => ({ ...ipos(u), state: u.state }))); if (n.level === 'sec') return ipos(S.U[n.id]); if (n.level === 'pl') return centroid(secsOf(n.id).map(u => ({ ...ipos(u), state: u.state, men: u.men }))); return centroid(coyUnits(n.id).filter(u => u.kind === 'sec').map(u => ({ ...ipos(u), state: u.state }))); }
function selChain() { const out = new Set(); let n = S.sel && S.nodes[S.sel]; while (n) { out.add(n.id); n = n.parent && S.nodes[n.parent]; } return out; }
function drawOrders(now) {
  const chain = selChain(), selN = S.sel && S.nodes[S.sel];
  // battalion objective: big khaki ring; when the battalion is selected, lines to each company's objective
  const bnN = S.nodes.BN;
  if (bnN && bnN.type) {
    const ds = dispSpec(bnN), br = Math.max(24, 78 * cam.z), [bx, by] = w2s(ds.target.x, ds.target.y);
    cx.globalAlpha = selN && selN.level !== 'bn' ? 0.45 : 0.9;
    if (selN && selN.level === 'bn') for (const k of bnN.kids) { const cs = dispSpec(S.nodes[k]); if (cs.type && far(cs.target, ds.target, 30)) arrow(ds.target.x, ds.target.y, cs.target.x, cs.target.y, COYCOL[k], 2, [2, 6], false); }
    ring(ds.target.x, ds.target.y, br, 'rgba(0,0,0,0.4)', 5, [14, 8]); ring(ds.target.x, ds.target.y, br, BN.col, 2.5, [14, 8]);
    txt(`${BN.name} ${T[ds.type][0]} ${T[ds.type][1]}`, bx, by - br - 10, 11, '#111', 'center', BN.col);
    cx.globalAlpha = 1;
  }
  for (const C of COYS) {
    const cn = S.nodes[C.id]; if (!cn.type) continue;
    const ds = dispSpec(cn), col = C.col, dim = selN && selN.level !== 'bn' && !chain.has(C.id) && selN.coy !== C.id;
    cx.globalAlpha = dim ? 0.35 : 1;
    // company: phase line through the FUPs, target circle, main arrow
    const fups = cn.kids.map(k => dispSpec(S.nodes[k])).filter(s => (s.type === 'assault' || s.type === 'clear') && s.pos).map(s => s.pos);
    const from = nodePos(cn);
    if (fups.length && OFFENSIVE.has(ds.type)) {
      const f = fups[0], ad = unitV(ds.target.x - from.x, ds.target.y - from.y), px = -ad.y, py = ad.x;
      const [a, b] = w2s(f.x - px * 110, f.y - py * 110), [c, d] = w2s(f.x + px * 110, f.y + py * 110);
      cx.strokeStyle = col; cx.lineWidth = 1.5; cx.setLineDash([3, 5]); cx.beginPath(); cx.moveTo(a, b); cx.lineTo(c, d); cx.stroke(); cx.setLineDash([]);
      if (cam.z > 0.55) txt(`PL ${['ALPHA', 'BRAVO', 'CHARLIE'][COYS.indexOf(C)]}`, c, d, 10, col, 'left', 'rgba(0,0,0,0.45)');
    }
    const tr = Math.max(14, 40 * cam.z);
    ring(ds.target.x, ds.target.y, tr, col, 3, ds.type === 'withdraw' || ds.type === 'screen' ? [8, 6] : null);
    ring(ds.target.x, ds.target.y, tr, 'rgba(0,0,0,0.35)', 1);
    const [tx, ty] = w2s(ds.target.x, ds.target.y);
    txt(T[ds.type][0], tx, ty - tr - 9, 14, '#fff');
    if (from.x) {
      const [fx, fy] = w2s(from.x, from.y);
      if (hyp(tx - fx, ty - fy) > tr + 30) { const L = hyp(ds.target.x - from.x, ds.target.y - from.y), k = (tr / cam.z + 6) / L; arrow(from.x, from.y, ds.target.x - (ds.target.x - from.x) * k, ds.target.y - (ds.target.y - from.y) * k, col, 4.5, null); }
    }
    // platoons
    for (const pid of cn.kids) {
      const pn = S.nodes[pid], ps = dispSpec(pn); if (!ps.type || !secsOf(pid).some(alive)) continue;
      const pf = nodePos(pn), sel = chain.has(pid) || (selN && selN.parent === pid);
      const goal = ps.pos || ps.target;
      if (pn.status !== 'achieved' || sel) arrow(pf.x, pf.y, goal.x, goal.y, col, sel ? 3 : 2, [7, 5]);
      if (FIRE_T.has(ps.type) && ps.pos) { cx.globalAlpha *= 0.8; arrow(ps.pos.x, ps.pos.y, ps.target.x, ps.target.y, '#ff9b6a', 1.5, [2, 4], false); cx.globalAlpha = dim ? 0.35 : 1; }
      if (cam.z > 0.7 || sel) { const [gx, gy] = w2s(goal.x, goal.y); txt(`${S.U[pid].pn}`, gx, gy, 11, '#fff', 'center', col); }
      // sections only when zoomed in or selected
      if (sel || cam.z > 1.8) for (const sid of pn.kids) {
        const sn = S.nodes[sid], ss = dispSpec(sn), u = S.U[sid]; if (!ss.type || !alive(u)) continue;
        const p = ipos(u), g = (ss.type === 'assault' && u.ph < 2 && ss.pos) ? ss.pos : (ss.pos && ss.type !== 'move' ? ss.pos : ss.target);
        if (sn.status !== 'achieved') arrow(p.x, p.y, g.x, g.y, 'rgba(255,255,255,0.75)', 1.4, [3, 3]);
        if (FIRE_T.has(ss.type)) arrow(g.x, g.y, ss.target.x, ss.target.y, 'rgba(255,140,90,0.7)', 1, [1, 4], false);
      }
    }
    cx.globalAlpha = 1;
  }
  // ghost lines: old target -> new target
  for (const id in S.nodes) {
    const n = S.nodes[id]; if (!n.ghost) continue;
    const a = 1 - (now - n.ghost.t) / 4500; if (a <= 0) { n.ghost = null; continue; }
    cx.globalAlpha = a; const ds = dispSpec(n);
    ring(n.ghost.ox, n.ghost.oy, n.level === 'bn' ? Math.max(24, 78 * cam.z) : n.level === 'coy' ? Math.max(14, 40 * cam.z) : 10, '#ffe14a', 2, [4, 4]);
    arrow(n.ghost.ox, n.ghost.oy, ds.target.x, ds.target.y, '#ffe14a', 2.5, [6, 4]);
    cx.globalAlpha = 1;
  }
  // counter-proposal preview
  const rq = S.reqs.find(r => r.status === 'open' && r.kind === 'counter' && S.tab === 'reqs');
  if (rq) {
    const u = nodePos(S.nodes[rq.node]);
    for (const [sp, col, lab] of [[rq.prop, '#ffffff', 'Yours'], [rq.theirs, COYCOL[S.nodes[rq.node].coy], 'Theirs']]) {
      const g = sp.pos || sp.target; arrow(u.x, u.y, g.x, g.y, col, 3, [8, 5]); ring(sp.target.x, sp.target.y, 14, col, 2.5);
      const [a, b] = w2s(g.x, g.y); txt(lab, a, b - 18, 11, '#111', 'center', col);
    }
  }
  // selected node handles: plain markers; yellow, pulsing and draggable only while ✋ Drag is on
  if (selN && selN.type) {
    const ds = dispSpec(selN), hot = S.dragOn, hc = hot ? '#ffe14a' : '#fff', pulse = 4 * Math.sin(now / 180);
    const [a, b] = w2s(ds.target.x, ds.target.y);
    cx.fillStyle = hot ? 'rgba(255,225,74,0.32)' : 'rgba(255,255,255,0.18)'; cx.beginPath(); cx.arc(a, b, 22, 0, TAU); cx.fill();
    ring(ds.target.x, ds.target.y, 22, hc, hot ? 3.5 : 2.5); txt('◎', a, b, 18, hc);
    if (hot) { ring(ds.target.x, ds.target.y, 29 + pulse, 'rgba(255,225,74,0.8)', 2); txt('drag', a, b + 34, 10, '#111', 'center', '#ffe14a'); }
    if (ds.pos && selN.level !== 'coy' && selN.level !== 'bn') {
      const [c, d] = w2s(ds.pos.x, ds.pos.y);
      cx.fillStyle = hot ? 'rgba(255,225,74,0.32)' : 'rgba(255,255,255,0.18)'; cx.beginPath(); cx.arc(c, d, 20, 0, TAU); cx.fill();
      if (hot) ring(ds.pos.x, ds.pos.y, 27 + pulse, 'rgba(255,225,74,0.8)', 2);
      txt('◇', c, d, 20, hc); txt(ds.type === 'assault' || ds.type === 'clear' ? 'start' : 'pos', c, d + 22, 10, hot ? '#111' : '#fff', 'center', hot ? '#ffe14a' : 'rgba(0,0,0,0.5)');
    }
  }  if (S.dragMark) { const [a, b] = w2s(S.dragMark.x, S.dragMark.y); cx.fillStyle = 'rgba(255,225,74,0.35)'; cx.beginPath(); cx.arc(a, b, 24, 0, TAU); cx.fill(); txt(S.dragMark.m === 'pos' ? '◇' : '◎', a, b, 20, '#ffe14a'); }
}
function drawUnit(u, now) {
  const p = ipos(u), [sx, sy] = w2s(p.x, p.y);
  if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) return;
  const gb = u.side === 'GB', z = cam.z;
  const dead = !alive(u);
  if (dead) { if (u.state === 'surr') txt('🏳', sx, sy, 12, '#fff'); else { cx.fillStyle = 'rgba(40,30,20,0.5)'; cx.beginPath(); cx.arc(sx, sy, 3, 0, TAU); cx.fill(); } return; }
  // men
  if (z >= 1.6 && u.men > 0) {
    const n = u.men, ang = u.a, fx = Math.cos(ang), fy = Math.sin(ang);
    for (let i = 0; i < n; i++) {
      const row = (i % 2) ? 1 : -1, k = Math.floor(i / 2) - (n / 4);
      const spread = u.moving ? 4 : 3.2;
      let ox = -fy * k * spread + fx * row * 2.2, oy = fx * k * spread + fy * row * 2.2;
      ox += Math.sin(i * 7.3 + u.men0) * 0.8; oy += Math.cos(i * 3.1) * 0.8;
      const [mx, my] = w2s(p.x + ox, p.y + oy), rad = Math.max(1.6, 0.55 * z);
      cx.fillStyle = gb ? '#8d8152' : '#5f685a'; cx.beginPath(); cx.arc(mx, my, rad, 0, TAU); cx.fill();
      cx.strokeStyle = 'rgba(0,0,0,0.55)'; cx.lineWidth = 0.8; cx.stroke();
      if (i < u.lmg && z > 2.5) { cx.strokeStyle = '#222'; cx.lineWidth = 1.2; cx.beginPath(); cx.moveTo(mx, my); cx.lineTo(mx + fx * rad * 2.4, my + fy * rad * 2.4); cx.stroke(); }
    }
  }
  // symbol
  const bnhq = u.kind === 'bnhq', hq = u.kind === 'coyhq' || u.kind === 'plhq' || bnhq;
  const w = bnhq ? 22 : hq ? 14 : 18, h = bnhq ? 13 : hq ? 10 : 12, by = z >= 1.6 ? sy - 6 * z - 10 : sy;
  const col = gb ? COYCOL[u.coy] : '#c9443a';
  const n = S.nodes[u.id], sel = S.sel === u.id;
  if (n && n.flash && now - n.flash < 1600) { const t = Math.max(0, (now - n.flash) / 1600); cx.strokeStyle = `rgba(255,225,74,${1 - t})`; cx.lineWidth = 3; cx.beginPath(); cx.arc(sx, by, 14 + 16 * t, 0, TAU); cx.stroke(); }
  if (sel) { cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.beginPath(); cx.arc(sx, by, 15, 0, TAU); cx.stroke(); }
  if (gb) { cx.fillStyle = col; rr(sx - w / 2, by - h / 2, w, h, 2); cx.fill(); cx.strokeStyle = 'rgba(0,0,0,0.7)'; cx.lineWidth = 1; cx.stroke(); }
  else { // hostile: diamond
    const d = 10; cx.fillStyle = '#d2453a'; cx.beginPath(); cx.moveTo(sx, by - d); cx.lineTo(sx + d, by); cx.lineTo(sx, by + d); cx.lineTo(sx - d, by); cx.closePath(); cx.fill();
    cx.strokeStyle = '#1b1b1b'; cx.lineWidth = 1.5; cx.stroke();
    txt(u.kind === 'mg' ? 'MG' : u.role === 'outpost' ? 'OP' : '', sx, by + 0.5, 7, '#fff');
    const f = u.men / u.men0; cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(sx - 8, by + d + 2, 16, 3); cx.fillStyle = f > 0.6 ? '#ffb0a0' : '#ff6a5a'; cx.fillRect(sx - 8, by + d + 2, 16 * f, 3);
    if (u.state === 'pinned') txt('⬇', sx + d + 6, by - 2, 11, '#ffd34a');
    if (u.state === 'broken') txt('✖', sx + d + 6, by - 2, 11, '#ff6a5a');
    return;
  }
  cx.strokeStyle = gb ? 'rgba(0,0,0,0.7)' : '#e8d9c0'; cx.lineWidth = 1.2;
  cx.beginPath();
  if (u.kind === 'mg') { cx.moveTo(sx - w / 2 + 2, by + h / 2 - 2); cx.lineTo(sx + w / 2 - 2, by - h / 2 + 2); cx.moveTo(sx - w / 2 + 2, by - h / 2 + 2); cx.lineTo(sx + w / 2 - 2, by + h / 2 - 2); cx.moveTo(sx - 3, by); cx.arc(sx, by, 3, Math.PI, 0); }
  else if (hq) { cx.moveTo(sx - w / 2, by + h / 2); cx.lineTo(sx - w / 2, by - h / 2 - 6); cx.lineTo(sx - w / 2 + 6, by - h / 2 - 3); cx.lineTo(sx - w / 2, by - h / 2); }
  else { cx.moveTo(sx - w / 2 + 2, by + h / 2 - 2); cx.lineTo(sx + w / 2 - 2, by - h / 2 + 2); cx.moveTo(sx - w / 2 + 2, by - h / 2 + 2); cx.lineTo(sx + w / 2 - 2, by + h / 2 - 2); }
  cx.stroke();
  // strength bar
  const f = u.men / u.men0; cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(sx - w / 2, by + h / 2 + 2, w, 3); cx.fillStyle = f > 0.6 ? '#7fe07a' : f > 0.35 ? '#f0c040' : '#ef5a4a'; cx.fillRect(sx - w / 2, by + h / 2 + 2, w * f, 3);
  if (u.state === 'pinned') txt('⬇', sx + w / 2 + 6, by - 2, 11, '#ffd34a');
  if (u.state === 'broken') txt('✖', sx + w / 2 + 6, by - 2, 11, '#ff6a5a');
  if (z > 1.1 && gb && u.kind === 'sec') txt(`${u.pn}/${u.sn}`, sx, by - h / 2 - 7, 9, '#fff', 'center', 'rgba(0,0,0,0.45)');
  if (gb && hq && (z > 0.8 || bnhq)) txt(bnhq ? 'Bn' : u.kind === 'coyhq' ? u.coy : `${u.pn}`, sx + 4, by, 8, '#000');
}
function drawToasts(now) {
  let k = 0;
  S.toasts = S.toasts.filter(t => now - t.t < 4500);
  for (const t of S.toasts.slice(-4)) {
    const a = Math.min(1, (4500 - (now - t.t)) / 800);
    const [sx, sy] = w2s(t.x, t.y);
    cx.globalAlpha = a;
    const col = t.kind === 'ach' ? '#2f7d3a' : t.kind === 'fail' ? '#8a2b22' : t.kind === 'req' ? '#9a6a10' : t.kind === 'chg' ? '#33507a' : 'rgba(20,20,20,0.85)';
    txt(t.text, clamp(sx, 110, cam.ox + cam.vw - 110), clamp(sy - 30 - (k++ % 2) * 18, cam.oy + 44, cam.oy + cam.vh - 20), 11, '#fff', 'center', col);
    cx.globalAlpha = 1;
  }
}
function draw(now) {
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx.fillStyle = '#2b3324'; cx.fillRect(0, 0, W, H);
  const [x0, y0] = w2s(0, 0);
  cx.imageSmoothingEnabled = true;
  cx.drawImage(mapImg, x0, y0, WW * cam.z, WH * cam.z);
  // feature labels
  for (const f of FEATS) {
    if (f.id === 'start') continue;
    const [a, b] = w2s(f.x, f.y);
    txt(`${f.icon} ${f.name}`, a, b + Math.max(16, f.r * cam.z * 0.6), 11, '#f4efe0', 'center', 'rgba(20,24,16,0.55)');
  }
  // intel: planning-phase enemy estimates
  if (S.phase === 'plan') {
    const seen = new Set();
    for (const u of S.units) if (u.side === 'DE' && intelKnown(u) && !seen.has(u.feat)) { seen.add(u.feat); const f = FEAT[u.feat]; const [a, b] = w2s(f.x + 18, f.y - 18); cx.fillStyle = 'rgba(180,40,30,0.85)'; cx.beginPath(); cx.arc(a, b, 10, 0, TAU); cx.fill(); txt('?', a, b, 13, '#fff'); }
  }
  drawOrders(now);
  // tracers
  for (const t of S.tracers) {
    const age = S.time - t.t; if (age > 1.2) continue;
    const [a, b] = w2s(t.x0, t.y0), [c, d] = w2s(t.x1, t.y1);
    cx.strokeStyle = t.de ? `rgba(255,120,80,${0.8 - age * 0.6})` : `rgba(255,236,150,${0.8 - age * 0.6})`;
    cx.lineWidth = t.mg ? 1.6 : 1; cx.setLineDash([4, 9]); cx.lineDashOffset = -age * 60;
    cx.beginPath(); cx.moveTo(a, b); cx.lineTo(c, d); cx.stroke();
  }
  cx.setLineDash([]); cx.lineDashOffset = 0;
  // units: Germans only when seen (fog of war), ghosts at last-known
  for (const u of S.units) {
    if (u.side === 'DE') {
      if (S.phase === 'plan' || S.reveal) { if (S.reveal) drawUnit(u, now); continue; }
      if (u.vis || !alive(u) && u.spotted) drawUnit(u, now);
      else if (u.last && alive(u) && S.time - u.seenT < 300) { const [a, b] = w2s(u.last.x, u.last.y); cx.globalAlpha = 0.5; cx.strokeStyle = '#ff7a6a'; cx.lineWidth = 1.5; cx.setLineDash([3, 3]); cx.beginPath(); cx.moveTo(a, b - 10); cx.lineTo(a + 10, b); cx.lineTo(a, b + 10); cx.lineTo(a - 10, b); cx.closePath(); cx.stroke(); cx.setLineDash([]); txt('?', a, b, 10, '#ffb0a0'); cx.globalAlpha = 1; }
    }
  }
  for (const u of S.units) if (u.side === 'GB') drawUnit(u, now);
  if (S.U.BN) drawUnit(S.U.BN, now);
  drawToasts(now);
  // clock
  const t = S.time, cl = S.phase === 'plan' ? 'PLANNING' : `H+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  txt(cl + (S.phase === 'battle' && S.paused ? '  ⏸' : ''), cam.ox + 10, cam.oy + 16, 13, '#fff', 'left', 'rgba(0,0,0,0.55)');
  if (S.pickMode) txt('Tap the map to set the target', cam.ox + cam.vw / 2, cam.oy + 72, 13, '#111', 'center', '#ffe14a');
  if (S.dragOn) txt(S.sel ? '✋ Drag on: move the yellow handles' : '✋ Drag on: select a unit first', cam.ox + 10, cam.oy + 40, 12, '#111', 'left', '#ffe14a');
}

// ---------------------------------------------------------------- UI (DOM)
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
S.tab = 'orders'; S.sheet = 'half';
let uiDirty = true, feedDirty = true, lastUI = 0;
const collapsed = new Set();
const fl = { lvl: 'all', kinds: new Set(['ach', 'chg', 'fail', 'req', 'cas', 'info', 'say']) };
function refreshUI() { uiDirty = true; }
const hstr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const grade = (q) => (q >= 80 ? 'A' : q >= 65 ? 'B' : q >= 50 ? 'C' : q >= 35 ? 'D' : 'F');
const gcls = (q) => 'g-' + grade(q).toLowerCase();
function qShow(q, key) {
  const h = hstr(key + ':' + q);
  if (S.hqExp >= 2) return `<span class="qb ${gcls(q)}" title="Plan quality">${grade(q)}·${q}</span>`;
  if (S.hqExp === 1) { const qq = clamp(Math.round((q + (h % 21) - 10) / 5) * 5, 0, 100); return `<span class="qb ${gcls(qq)}" title="Plan quality (estimate)">~${qq}</span>`; }
  const qq = q + (h % 41) - 20; return `<span class="qb ${gcls(qq)}" title="Plan quality (gut feeling)">${qq >= 62 ? '👍' : qq >= 42 ? '🤔' : '👎'}</span>`;
}
const W4 = { obed: ['Stubborn', 'Independent', 'Dutiful', 'Blind follower'], judg: ['Dumb', 'Plodding', 'Sharp', 'Brilliant'], exp: ['Green', 'Trained', 'Seasoned', 'Veteran'], trust: ['Strained', 'Wary', 'Good', 'Strong'] };
const word = (k, v) => W4[k][Math.min(3, Math.floor(v * 4))];
const initials = (c) => (c.first[0] + c.last[0]).toUpperCase();
function personaMini(n) {
  const c = cmdrOf(n), b = (v, cl) => `<i class="${cl}" style="height:${Math.round(4 + v * 14)}px"></i>`;
  return `<button class="pc" data-pc="${n.id}" aria-label="Commander ${esc(cname(c))}"><span class="av" style="background:${COYCOL[n.coy]}">${initials(c)}</span><span class="bars">${b(c.obed, 'bo')}${b(c.judg, 'bj')}${b(c.exp, 'be')}${b(c.trust, 'bt')}</span>${c.quirk ? `<span class="qk">${QUIRKS[c.quirk][0]}</span>` : ''}</button>`;
}
function dispStatus(n) {
  if ((n.flash && performance.now() - n.flash < 2500) || (S.phase === 'battle' && S.time - n.changedT < 6)) return 'changed';
  if (S.phase === 'plan') return 'planned';
  return n.status;
}
const ST_IC = { planned: '·', moving: '➜', engaging: '💥', achieved: '✅', failed: '❌', changed: '🔄' };
function rowHTML(n, depth) {
  const ds = dispSpec(n); if (!ds.type) return '';
  const u = S.U[n.id], st = dispStatus(n), dead = !alive(u) && n.level === 'sec';
  const hasKids = n.kids.length > 0, col = collapsed.has(n.id);
  const marks = (n.locked ? '🔒' : '') + (n.manual ? '✎' : '') + (n.auto ? '⚙' : '') + (n.wait ? '⏳' : '') + (u.state === 'pinned' ? '⬇' : '') + (u.state === 'broken' ? '✖' : '');
  const title = n.level === 'bn' ? BN.name : n.level === 'coy' ? `${n.id} Coy` : n.level === 'pl' ? `${u.pn} Pl` : `${u.sn} Sec`;
  return `<div class="row lv-${n.level}${S.sel === n.id ? ' sel' : ''}${st === 'changed' ? ' fl' : ''}${dead ? ' dead' : ''}" data-id="${n.id}" style="--d:${depth};--cc:${COYCOL[n.coy]}">
    ${hasKids ? `<button class="tg" data-tg="${n.id}" aria-label="Expand">${col ? '▸' : '▾'}</button>` : '<span class="tg0"></span>'}
    <span class="ti">${T[ds.type][0]}</span>
    <div class="main"><div class="l1"><b>${title}</b> ${esc(T[ds.type][1])} <span class="tgt">${esc(tName(ds.target))}</span></div>
      <div class="l2"><span class="pb"><i style="width:${Math.round(n.prog * 100)}%"></i></span>${personaMini(n)}${qShow(n.q, n.id)}<span class="mk">${marks}</span></div></div>
    <span class="chip st-${st}">${ST_IC[st]} ${st}</span></div>`;
}
function treeHTML() {
  let h = '';
  const walk = (id, d) => { const n = S.nodes[id]; h += rowHTML(n, d); if (!collapsed.has(id)) for (const k of n.kids) walk(k, d + 1); };
  walk('BN', 0);
  return h;
}
function editorHTML() {
  const n = S.sel && S.nodes[S.sel]; if (!n || !n.type) return '';
  const ds = dispSpec(n), c = cmdrOf(n), u = S.U[n.id];
  const name = nodeName(n);
  const notes = S.hqExp >= 2 ? n.notes : S.hqExp === 1 ? n.notes.slice(0, 1) : [];
  const types = TYPES[n.level].map(t => `<button class="ch${t === ds.type ? ' on' : ''}" data-ty="${t}">${T[t][0]} ${T[t][1]}</button>`).join('');
  const feats = FEATS.map(f => `<button class="ch${tName(ds.target) === f.name ? ' on' : ''}" data-ft="${f.id}">${f.icon} ${f.name}</button>`).join('');
  const seg = (k, v, labels) => `<div class="seg">${labels.map((l, i) => `<button class="${v === i ? 'on' : ''}" data-${k}="${i}">${l}</button>`).join('')}</div>`;
  return `<div class="ed" style="--cc:${COYCOL[n.coy]}">
    <div class="edh"><span class="ti">${T[ds.type][0]}</span><div class="edn"><b>${esc(name)}</b><small>${esc(cname(c))} · ${word('obed', c.obed)}, ${word('judg', c.judg)}</small></div>${personaMini(n)}${qShow(n.q, n.id)}<button class="x" id="edClose" aria-label="Close">✕</button></div>
    <div class="cur">${esc(label(ds))} · <b>${dispStatus(n)}</b>${u.state !== 'ok' ? ` · ${u.state}` : ''}${n.locked ? ' · 🔒 order' : ''}${notes.length ? `<div class="notes">⚠ ${notes.map(esc).join(' · ')}</div>` : ''}</div>
    <div class="lbl">Objective</div><div class="chips">${types}</div>
    <div class="lbl">Target</div><div class="chips">${feats}<button class="ch${S.pickMode ? ' on' : ''}" id="pickMap">📍 Tap map</button></div>
    <div class="hint">${S.dragOn ? '✋ Drag is on: drag' : 'Turn on ✋ Drag (top right of the map) to drag'} ◎ target${ds.pos && n.level !== 'coy' && n.level !== 'bn' ? ' / ◇ position' : ''} on the map. Edits go to ${esc(c.rank)} ${esc(c.last)} as suggestions${n.locked ? ' — 🔒 now as orders' : ''}.</div>
    <div class="two"><div><div class="lbl">Priority</div>${seg('pr', n.prio, ['Low', 'Norm', 'High'])}</div><div><div class="lbl">Aggression</div>${seg('ag', n.aggr, ['Careful', 'Norm', 'Bold'])}</div></div>
    <div class="acts"><button id="edLock" class="${n.locked ? 'on' : ''}">🔒 ${n.locked ? 'Ordered' : 'Order / lock'}</button>${n.kids.length ? '<button id="edReplan">↻ New plan below</button>' : ''}${n.parent ? '<button id="edUp">↑ Up</button>' : ''}</div>
  </div>`;
}
function renderOrders() {
  $('pOrders').innerHTML = editorHTML() + `<div class="tree">${treeHTML()}</div>`;
}
const KIND_IC = { ach: '✅', chg: '🔄', fail: '❌', req: '❗', cas: '✚', info: 'ℹ', say: '💬' };
const tfmt = (t) => `H+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function renderFeed() {
  const lv = ['all', 'bn', 'coy', 'pl', 'sec'].map(l => `<button class="ch${fl.lvl === l ? ' on' : ''}" data-fl="${l}">${l === 'all' ? 'All' : l === 'bn' ? 'Bn' : l === 'coy' ? 'Coy' : l === 'pl' ? 'Pl' : 'Sec'}</button>`).join('');
  const kd = ['ach', 'chg', 'fail', 'req', 'cas', 'info'].map(k => `<button class="ch${fl.kinds.has(k) ? ' on' : ''}" data-fk="${k}" aria-label="${k}">${KIND_IC[k]}</button>`).join('');
  const items = [];
  for (let i = S.feed.length - 1; i >= 0 && items.length < 250; i--) {
    const e = S.feed[i];
    if (fl.lvl !== 'all' && e.lvl !== fl.lvl) continue;
    if (!fl.kinds.has(e.kind === 'say' ? 'chg' : e.kind)) continue;
    const who = e.who === 'you' ? '<span class="who y">you</span>' : e.who === 'auto' && e.kind === 'chg' ? '<span class="who a">auto</span>' : e.who === 'them' ? '<span class="who t">them</span>' : '';
    items.push(`<div class="fe k-${e.kind}" data-u="${e.unit || ''}" style="--cc:${e.unit && S.U[e.unit] && S.U[e.unit].side === 'GB' ? COYCOL[S.U[e.unit].coy] : '#888'}"><span class="ft">${S.phase === 'plan' && !e.t ? 'PLAN' : tfmt(e.t)}</span><span class="fi">${KIND_IC[e.kind]}</span><span class="fx">${who}${esc(e.text)}</span></div>`);
  }
  $('pFeed').innerHTML = `<div class="filters">${lv}<span class="sp"></span>${kd}</div><div class="list">${items.join('') || '<div class="empty">No messages yet.</div>'}</div>`;
}
function reqCard(r) {
  const n = S.nodes[r.node], c = r.cmdr;
  const head = `<div class="rh">${personaMini(n)}<div><b>${esc(cname(c))}</b> <small>${esc(nodeName(n))}</small><div class="rk">${r.kind === 'counter' ? '↩ Counter-proposal' : '❗ ' + REQ_WHY[r.why]}</div></div><span class="rt">${tfmt(r.t)}</span></div>`;
  if (r.status !== 'open') return `<div class="rq done" data-rq="${r.id}">${head}<div class="rx">${esc(r.text)}</div><div class="res">→ ${esc(r.status)}${r.result ? ' (' + esc(r.result) + ')' : ''}</div></div>`;
  if (r.kind === 'counter') {
    return `<div class="rq counter" data-rq="${r.id}" style="--cc:${COYCOL[n.coy]}">${head}<div class="rx">“${esc(r.reason)}”</div>
      <div class="vs"><div class="opt you"><small>Yours</small><div>${esc(label(r.prop))}</div>${qShow(r.qY, n.id + 'y')}</div><div class="opt th"><small>Theirs</small><div>${esc(label(r.theirs))}</div>${qShow(r.qT, n.id + 't')}</div></div>
      <div class="acts"><button data-ins="${r.id}">✊ Insist</button><button data-the="${r.id}">👍 Accept theirs</button><button data-cmp="${r.id}">🤝 Compromise</button></div></div>`;
  }
  const sugs = r.sugs.map((s, i) => `<div class="sug"><div class="sl"><b>${i === 0 ? '★ ' : ''}${esc(label(s))}</b><small>${esc(s.why)}</small></div>${qShow(s.q, n.id + 's' + i)}<button data-acc="${r.id}:${i}">Accept</button></div>`).join('');
  return `<div class="rq" data-rq="${r.id}" style="--cc:${COYCOL[n.coy]}">${head}<div class="rx">${esc(r.text)}</div>${sugs}<div class="acts"><button data-edr="${r.id}">✎ Edit</button><button data-den="${r.id}">✖ Deny</button></div></div>`;
}
function renderReqs() {
  const open = S.reqs.filter(r => r.status === 'open'), old = S.reqs.filter(r => r.status !== 'open').slice(-6).reverse();
  $('pReqs').innerHTML = (open.length ? open.map(reqCard).join('') : '<div class="empty">No open requests. Commanders will ask when things change.</div>')
    + (old.length ? `<div class="lbl">Earlier</div>${old.map(reqCard).join('')}` : '')
    + `<label class="apt"><input type="checkbox" id="apChk" ${S.autoPause ? 'checked' : ''}> Auto-pause on requests</label>`;
}
function renderTop() {
  const open = S.reqs.filter(r => r.status === 'open').length;
  $('badge').textContent = open || ''; $('badge').hidden = !open;
  $('bPlay').textContent = S.phase === 'plan' ? '▶ Play' : S.paused ? '▶' : '⏸';
  $('bPlay').classList.toggle('wide', S.phase === 'plan');
  $('bStep').disabled = !(S.phase === 'battle' && S.paused);
  renderDrag();
  $('spdL').textContent = (S.speed < 1 ? S.speed.toFixed(1) : S.speed < 10 ? S.speed.toFixed(1).replace('.0', '') : Math.round(S.speed)) + '×';
}
function renderDrag() {
  const b = $('bDrag'); if (!b) return;
  b.classList.toggle('on', S.dragOn); b.setAttribute('aria-pressed', String(S.dragOn));
  b.textContent = S.dragOn ? '✋ Drag: ON' : '✋ Drag: off';
}
function toggleDrag(v) { S.dragOn = v === undefined ? !S.dragOn : !!v; S.dragMark = null; renderAll(); }
function renderAll() {
  renderTop();
  for (const t of ['orders', 'feed', 'reqs']) { $('tab-' + t).classList.toggle('on', S.tab === t); }
  $('pOrders').hidden = S.tab !== 'orders'; $('pFeed').hidden = S.tab !== 'feed'; $('pReqs').hidden = S.tab !== 'reqs';
  if (S.tab === 'orders') renderOrders();
  if (S.tab === 'feed') renderFeed();
  if (S.tab === 'reqs') renderReqs();
  $('sheet').dataset.s = S.sheet;
  uiDirty = false; feedDirty = false; lastUI = performance.now();
}
function setTab(t) { S.tab = t; if (S.sheet === 'min') S.sheet = 'half'; renderAll(); }
function select(id, jump) {
  S.sel = id; S.pickMode = false;
  if (id) { let n = S.nodes[id]; while (n && n.parent) { collapsed.delete(n.parent); n = S.nodes[n.parent]; } }
  if (jump && id) { const p = nodePos(S.nodes[id]); if (p.x) centerOn(p.x, p.y, 1.4); }
  S.tab = 'orders'; if (S.sheet === 'min') S.sheet = 'half';
  renderAll();
  $('pane').scrollTop = 0;
}
const NICE = [0.1, 0.25, 0.5, 1, 2, 4, 8, 16];
function setSpeedV(v) { let s = 0.1 * Math.pow(160, v / 100); for (const n of NICE) if (Math.abs(Math.log(s / n)) < 0.08) s = n; S.speed = s; $('spd').value = v; renderTop(); }
const speedToV = (s) => Math.round(100 * Math.log(s / 0.1) / Math.log(160));
function playPause() {
  if (S.phase === 'plan') { startBattle(); }
  else if (S.endMsg && S.paused) { S.paused = false; }
  else { S.paused = !S.paused; }
  renderAll();
}
function stepOnce() { if (S.phase === 'battle' && S.paused) { tick(); alpha = 1; uiDirty = true; } }
// overlays
function openOv(html, cls = '') { $('ovBox').className = 'box ' + cls; $('ovBox').innerHTML = html; $('ov').hidden = false; }
function closeOv() { $('ov').hidden = true; $('ovBox').innerHTML = ''; S.cardFor = null; }
function cardHTML(id, editing) {
  const n = S.nodes[id], c = cmdrOf(n);
  const bar = (k, lab, lo, hi) => `<div class="tr"><div class="trh"><span>${lab}</span><b>${word(k, c[k])}</b></div>${editing && k !== 'trust' ? `<input type="range" min="0" max="100" value="${Math.round(c[k] * 100)}" data-tr="${k}" aria-label="${lab}">` : `<div class="trb"><i class="b-${k}" style="width:${Math.round(c[k] * 100)}%"></i></div>`}<div class="trl"><small>${lo}</small><small>${hi}</small></div></div>`;
  const q = Object.entries(QUIRKS).map(([k, [ic, nm]]) => `<button class="ch${c.quirk === k ? ' on' : ''}" data-qk="${k}">${ic} ${nm}</button>`).join('') + `<button class="ch${!c.quirk ? ' on' : ''}" data-qk="">— None</button>`;
  return `<div class="cc" style="--cc:${COYCOL[n.coy]}"><div class="ch1"><span class="av big" style="background:${COYCOL[n.coy]}">${initials(c)}</span><div><b>${esc(c.rank)} ${esc(c.first)} ${esc(c.last)}</b><div>${esc(nodeName(n))} · ${esc(label(dispSpec(n)))}</div></div><button class="x" data-close="1" aria-label="Close">✕</button></div>
    ${bar('obed', 'Obedience', 'stubborn', 'blind')}${bar('judg', 'Judgment', 'dumb', 'brilliant')}${bar('exp', 'Experience', 'green', 'veteran')}${bar('trust', 'Trust in you', 'strained', 'strong')}
    <div class="lbl">Quirk</div>${editing ? `<div class="chips">${q}</div>` : `<div class="qline">${c.quirk ? QUIRKS[c.quirk].join(' ') : '— none'}</div>`}
    <div class="say">“${esc(say(c, 'wilco'))}”</div>
    <div class="acts">${editing ? '<button data-rnd="1">🎲 Randomize</button><button data-done="1">✓ Done</button>' : '<button data-edt="1">✎ Edit traits</button><button data-sel="1">📋 Orders</button>'}</div></div>`;
}
function openCard(id, editing) { S.cardFor = id; openOv(cardHTML(id, editing), 'card'); }
function slotInfo(i) { try { const d = JSON.parse(store.get('cl-slot' + i, 'null')); return d ? `#${d.seed} · ${new Date(d.saved).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'empty'; } catch (e) { return 'empty'; } }
function menuHTML() {
  const slots = [1, 2, 3].map(i => `<div class="slot"><span>Slot ${i}<small>${slotInfo(i)}</small></span><button data-sv="${i}">💾 Save</button><button data-ld="${i}" ${slotInfo(i) === 'empty' ? 'disabled' : ''}>📂 Load</button></div>`).join('');
  const hq = ['Green', 'Regular', 'Veteran'].map((l, i) => `<button class="${S.hqExp === i ? 'on' : ''}" data-hq="${i}">${l}</button>`).join('');
  return `<div class="menu"><div class="ch1"><b>Command Layers</b><small>${VERSION} · scenario #${S.seed}</small><button class="x" data-close="1" aria-label="Close">✕</button></div>
    <div class="acts"><button data-m="restart">↺ Restart</button><button data-m="new">🎲 New scenario</button></div>
    <div class="lbl">Save / load plan</div>${slots}
    <div class="lbl">Your HQ staff (how well you judge plans)</div><div class="seg">${hq}</div>
    <label class="apt"><input type="checkbox" id="apChk2" ${S.autoPause ? 'checked' : ''}> Auto-pause on requests</label>
    <div class="lbl">Doctrine (objective maps, drills, scoring)</div>
    <div class="slot"><span>${DOCL.custom ? '✎ Custom doctrine' : 'Default doctrine'}<small>${DOCL.custom ? 'edited in the Objective Editor' : 'as Dev B wrote it'}</small></span><button data-m="editor" id="bEditor">🛠 Editor</button></div>
    <div class="acts"><button data-m="tut">🎓 Tutorial</button><button data-m="help">❓ Help</button></div></div>`;
}
const TUT = [
  ['📋 Orders', 'You command the battalion (1st Bn). Give it an objective and its CO splits it into company tasks for A, B and C; each company splits its task for its platoons, and so on down to sections. Tap a row in Orders, or a unit on the map, to open it.'],
  ['✎ Edit', 'Change the objective type or target at any level (battalion, company, platoon, section). Lower layers re-plan at once (yellow flash, ghost line from old to new). Your edits are suggestions: a commander may agree, grumble, push back or quietly ignore you. 🔒 turns it into an order, and locked tasks survive re-plans from above.'],
  ['✋ Drag', 'Moving things on the map is off by default, so a stray finger only pans. Tap ✋ Drag (top right of the map) to switch it on: the selected task\'s ◎ target and ◇ position light up yellow and can be dragged. It stays on until you tap it again.'],
  ['▶ Play', 'Press Play. Use the slider for 0.1× to 16× speed, ⏸ to pause, ⏭ to step while paused. You can edit at any time.'],
  ['❗ Requests', 'Company commanders ask for changes with 1–3 suggestions. Accept, Edit or Deny. The 📻 Feed logs every change; tap a message to jump to that unit.'],
];
function tutHTML(i) { const [h, b] = TUT[i]; return `<div class="tut"><div class="tn">${i + 1} / ${TUT.length}</div><h3>${h}</h3><p>${b}</p><div class="acts"><button data-tskip="1">Skip</button><button data-tnext="${i + 1}">${i + 1 < TUT.length ? 'Next ›' : 'Got it'}</button></div></div>`; }
function helpHTML() {
  return `<div class="help"><div class="ch1"><b>How it works</b><button class="x" data-close="1" aria-label="Close">✕</button></div>
  <p><b>Layers.</b> Battalion → company → platoon → section. The battalion CO breaks your battalion objective into company tasks (e.g. Seize: main effort on the objective plus the flanking enemy positions, or a fire base + assault + reserve); companies break theirs into platoon tasks (assault, support by fire, cut-off, reserve…); platoons into section tasks (move, suppress, assault, hold, overwatch). You can still edit or 🔒 lock any company, platoon or section task directly; locked tasks are left alone when the level above re-plans.</p>
  <p><b>✋ Drag.</b> Off by default: one finger pans the map and taps select. Turn it on (button at the top right of the map) to drag the selected task's ◎ target or ◇ position; they glow yellow while it's on. It stays on until you tap it again. 📍 Tap map in the order panel also sets a target.</p>
  <p><b>Commanders.</b> Every leader has obedience, judgment, experience, maybe a quirk, and trust in you. Smart ones make good plans (cover, line of sight, flanking, reserves) and push back on bad edits; dumb ones charge across open ground. Insisting works but costs trust and morale. Plans you suggested that work raise trust.</p>
  <p><b>Quality badge.</b> How good a plan is (0–100). How precisely you see it depends on your HQ staff (menu).</p>
  <p><b>Status.</b> · planned, ➜ moving, 💥 engaging, ✅ achieved, ❌ failed, 🔄 changed. Marks: 🔒 order/locked, ✎ your edit, ⚙ automatic change, ⏳ waiting, ⬇ pinned, ✖ broken.</p>
  <p><b>Fog.</b> Enemy only shows when someone can see it; dashed “?” is a last-known position.</p>
  <p><b>Objective Editor.</b> Menu → 🛠 Editor: change which tasks each level can get, how every objective is broken down (the plan variants commanders choose from), the section drills and the plan-scoring weights.</p></div>`;
}
function endHTML() {
  const st = S.stats;
  return `<div class="endb"><h3>🏁 ${esc(S.endMsg)}</h3><p>Time ${tfmt(S.time)} · British casualties ${st.gbCas} · enemy ${st.deCas}</p>
  <p>${BN.name}: ${S.nodes.BN && S.nodes.BN.type ? `${esc(label(S.nodes.BN))} · ${esc(S.nodes.BN.status)}` : '—'}</p>
  <p>Objectives achieved: ${st.ach.coy} coy, ${st.ach.pl} pl, ${st.ach.sec} sec · failed: ${st.fail.coy}/${st.fail.pl}/${st.fail.sec}</p>
  <div class="acts"><button data-close="1">👀 Keep watching</button><button data-m="restart">↺ Restart</button><button data-m="new">🎲 New scenario</button></div></div>`;
}
function onEnd() { openOv(endHTML(), 'end'); renderAll(); }
function onReq(r) {
  if (S.paused && S.pausedBy === 'req') { S.tab = 'reqs'; if (S.sheet === 'min') S.sheet = 'half'; }
  if (r.kind === 'counter') { S.tab = 'reqs'; if (S.sheet === 'min') S.sheet = 'half'; }
  uiDirty = true;
}
// save / load (plan + commanders)
function snapshot() {
  return { v: 2, seed: S.seed, saved: Date.now(), nodes: Object.values(S.nodes).map(n => ({ id: n.id, type: n.type, target: n.target, pos: n.pos, gate: n.gate, prio: n.prio, aggr: n.aggr, locked: n.locked, manual: n.manual, q: n.q, notes: n.notes, vname: n.vname })), cmdrs: S.units.concat(S.U.BN ? [S.U.BN] : []).filter(u => u.cmdr).map(u => ({ id: u.id, ...u.cmdr })) };
}
function savePlan(i) { store.set('cl-slot' + i, JSON.stringify(snapshot())); log('coy', 'info', null, `Plan saved to slot ${i}.`, 'you'); }
function loadPlan(i) {
  let d; try { d = JSON.parse(store.get('cl-slot' + i, 'null')); } catch (e) { d = null; }
  if (!d) return false;
  newScenario(d.seed);
  for (const c of d.cmdrs) if (S.U[c.id]) { const { id, ...rest } = c; Object.assign(S.U[c.id].cmdr, rest); }
  for (const s of d.nodes) if (S.nodes[s.id]) Object.assign(S.nodes[s.id], s, { status: 'planned', flash: 0, ghost: null });
  if (d.v < 2) bnRequal(); // a v1.x save has no battalion: it keeps the default battalion objective, rated against the loaded companies
  log('coy', 'info', null, `Plan loaded from slot ${i}.`, 'you');
  S.sel = null; renderAll(); return true;
}
function restart(seed) { newScenario(seed); S.sel = null; S.pickMode = false; fitCam(); closeOv(); renderAll(); }
function bindUI() {
  $('bPlay').onclick = playPause;
  $('bStep').onclick = () => { stepOnce(); renderAll(); };
  $('spd').oninput = (e) => setSpeedV(+e.target.value);
  $('bMenu').onclick = () => openOv(menuHTML(), 'menuov');
  $('bDrag').onclick = () => toggleDrag();
  for (const t of ['orders', 'feed', 'reqs']) $('tab-' + t).onclick = () => setTab(t);
  // sheet grab: tap cycles, drag sets
  let gy = null, gs = null;
  const g = $('grab');
  g.addEventListener('pointerdown', (e) => { gy = e.clientY; gs = S.sheet; g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointerup', (e) => {
    if (gy === null) return; const dy = e.clientY - gy; gy = null;
    const order = ['min', 'half', 'full'], i = order.indexOf(gs);
    S.sheet = Math.abs(dy) < 8 ? order[(i + 1) % 3] : dy < 0 ? order[Math.min(2, i + 1 + (dy < -200 ? 1 : 0))] : order[Math.max(0, i - 1 - (dy > 200 ? 1 : 0))];
    renderAll();
  });
  // panels (delegation)
  $('pane').addEventListener('click', (e) => {
    const b = e.target.closest('button,[data-id],[data-u],input'); if (!b) return;
    const d = b.dataset;
    if (d.pc) { openCard(d.pc); return; }
    if (d.tg) { collapsed.has(d.tg) ? collapsed.delete(d.tg) : collapsed.add(d.tg); renderAll(); return; }
    if (d.id) { select(d.id, true); return; }
    const n = S.sel && S.nodes[S.sel];
    if (d.ty && n) { proposeEdit(n, { type: d.ty }); renderAll(); return; }
    if (d.ft && n) { const f = FEAT[d.ft]; proposeEdit(n, { target: { x: f.x, y: f.y } }); renderAll(); return; }
    if (d.pr !== undefined && n) { n.prio = +d.pr; for (const u of unitsUnder(n)) { const m = S.nodes[u.id]; if (m && !m.locked) m.prio = n.prio; } log(n.level, 'chg', n.id, `${nodeName(n)}: priority ${['low', 'normal', 'high'][n.prio]}.`, 'you'); renderAll(); return; }
    if (d.ag !== undefined && n) { n.aggr = +d.ag; for (const u of unitsUnder(n)) { const m = S.nodes[u.id]; if (m && !m.locked) m.aggr = n.aggr; } log(n.level, 'chg', n.id, `${nodeName(n)}: ${['careful', 'normal', 'bold'][n.aggr]}.`, 'you'); renderAll(); return; }
    if (b.id === 'edClose') { S.sel = null; S.pickMode = false; renderAll(); return; }
    if (b.id === 'pickMap') { S.pickMode = !S.pickMode; renderAll(); return; }
    if (b.id === 'edLock' && n) { n.locked = !n.locked; log(n.level, 'chg', n.id, n.locked ? `🔒 Order: ${nodeName(n)} will hold to ${label(dispSpec(n))}.` : `🔓 ${nodeName(n)} unlocked.`, 'you'); renderAll(); return; }
    if (b.id === 'edReplan' && n) { if (n.level === 'bn') { const r = decomposeBn(n, 'cmdr'); log('bn', 'chg', n.id, `${cname(cmdrOf(n))} re-plans (${n.vname || 'own plan'}): ${r.coys} company, ${r.pls} platoon, ${r.secs} section tasks changed (quality ${n.q}).`, 'you'); } else if (n.level === 'coy') { const r = decomposeCoy(n, 'cmdr'); log('coy', 'chg', n.id, `${cname(cmdrOf(n))} re-plans: ${r.pls} platoon, ${r.secs} section tasks changed (quality ${n.q}).`, 'you'); } else { const k = decomposePl(n, 'cmdr'); log('pl', 'chg', n.id, `${cname(cmdrOf(n))} re-plans: ${k} section tasks changed.`, 'you'); } renderAll(); return; }
    if (b.id === 'edUp' && n) { select(n.parent, true); return; }
    if (d.fl) { fl.lvl = d.fl; renderAll(); return; }
    if (d.fk) { fl.kinds.has(d.fk) ? fl.kinds.delete(d.fk) : fl.kinds.add(d.fk); renderAll(); return; }
    if (d.u !== undefined && d.u) { const u = S.U[d.u]; if (u && u.side === 'GB' && S.nodes[d.u]) select(d.u, true); else if (u) { centerOn(u.last ? u.last.x : u.x, u.last ? u.last.y : u.y, 1.4); } return; }
    if (d.acc) { const [id, i] = d.acc.split(':').map(Number); const r = S.reqs.find(x => x.id === id); if (r && r.status === 'open') answerReq(r, 'accept', i); renderAll(); return; }
    if (d.den) { const r = S.reqs.find(x => x.id === +d.den); if (r && r.status === 'open') answerReq(r, 'deny'); renderAll(); return; }
    if (d.edr) { const r = S.reqs.find(x => x.id === +d.edr); if (r) { r.status = 'edit'; select(r.node, true); } return; }
    if (d.ins || d.the || d.cmp) { const id = +(d.ins || d.the || d.cmp), r = S.reqs.find(x => x.id === id); if (r && r.status === 'open') answerCounter(r, d.ins ? 'insist' : d.the ? 'theirs' : 'compromise'); renderAll(); return; }
    if (b.id === 'apChk') { S.autoPause = b.checked; store.set('cl-ap', S.autoPause ? '1' : '0'); return; }
  });
  $('ov').addEventListener('click', (e) => {
    if (e.target === $('ov')) { closeOv(); return; }
    const b = e.target.closest('button,input'); if (!b) return;
    const d = b.dataset;
    if (d.close) { closeOv(); renderAll(); return; }
    if (d.edt) { openCard(S.cardFor, true); return; }
    if (d.done) { openCard(S.cardFor, false); renderAll(); return; }
    if (d.sel) { const id = S.cardFor; closeOv(); select(id, true); return; }
    if (d.rnd) { const c = cmdrOf(S.nodes[S.cardFor]), p = mkPersona(S.nodes[S.cardFor].level); Object.assign(c, { obed: p.obed, judg: p.judg, exp: p.exp, quirk: p.quirk }); openCard(S.cardFor, true); return; }
    if (d.qk !== undefined) { cmdrOf(S.nodes[S.cardFor]).quirk = d.qk || null; openCard(S.cardFor, true); return; }
    if (d.m === 'restart') { restart(S.seed); return; }
    if (d.m === 'new') { restart((S.seed * 31 + 7 + ((Math.random() * 1000) | 0)) % 100000 || 1); return; }
    if (d.m === 'tut') { openOv(tutHTML(0), 'tutov'); return; }
    if (d.m === 'help') { openOv(helpHTML(), 'helpov'); return; }
    if (d.m === 'editor') { location.href = 'editor.html'; return; }
    if (d.sv) { savePlan(+d.sv); openOv(menuHTML(), 'menuov'); return; }
    if (d.ld) { if (loadPlan(+d.ld)) { fitCam(); closeOv(); } return; }
    if (d.hq !== undefined) { S.hqExp = +d.hq; store.set('cl-hq', String(S.hqExp)); openOv(menuHTML(), 'menuov'); renderAll(); return; }
    if (d.tskip) { store.set('cl-tut', '1'); closeOv(); return; }
    if (d.tnext) { const i = +d.tnext; if (i >= TUT.length) { store.set('cl-tut', '1'); closeOv(); } else openOv(tutHTML(i), 'tutov'); return; }
    if (b.id === 'apChk2') { S.autoPause = b.checked; store.set('cl-ap', S.autoPause ? '1' : '0'); return; }
  });
  $('ov').addEventListener('input', (e) => { const k = e.target.dataset.tr; if (k && S.cardFor) { cmdrOf(S.nodes[S.cardFor])[k] = +e.target.value / 100; } });
}

// ---------------------------------------------------------------- layout, input, loop
let lastView = '';
function layout() {
  const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (w !== W || h !== H || dpr !== DPR) { W = w; H = h; DPR = dpr; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  const land = w > h && w >= 560;
  if (document.body.classList.contains('land') !== land) document.body.classList.toggle('land', land);
  const top = $('top').getBoundingClientRect().bottom, sh = $('sheet').getBoundingClientRect();
  cam.ox = 0; cam.oy = top; cam.vw = land ? Math.max(100, sh.left) : W; cam.vh = Math.max(100, (land ? H : sh.top) - top);
  const key = `${cam.vw}x${cam.vh}`;
  if (key !== lastView) { lastView = key; if (cam.fit) fitCam(); else clampCam(); }
}
function unitScreen(u) { const p = ipos(u), [sx, sy] = w2s(p.x, p.y); return [sx, cam.z >= 1.6 ? sy - 6 * cam.z - 10 : sy]; }
// which drag handle of the selected task is under (x, y)? Only while ✋ Drag is on, unless any = true
function markerHit(x, y, any) {
  if (!S.dragOn && !any) return null;
  const n = S.sel && S.nodes[S.sel]; if (!n || !n.type) return null;
  const ds = dispSpec(n);
  if (ds.pos && n.level !== 'coy' && n.level !== 'bn') { const [a, b] = w2s(ds.pos.x, ds.pos.y); if (hyp(a - x, b - y) < 26) return 'pos'; }
  const [a, b] = w2s(ds.target.x, ds.target.y); if (hyp(a - x, b - y) < 28) return 'target';
  return null;
}
function tapAt(x, y) {
  const [wx, wy] = s2w(x, y);
  if (S.pickMode && S.sel) { S.pickMode = false; const p = nearestOpen(clamp(wx, 10, WW - 10), clamp(wy, 10, WH - 10)); proposeEdit(S.nodes[S.sel], { target: p }); renderAll(); return; }
  let best = null, bd = 28;
  for (const u of S.U.BN ? S.units.concat([S.U.BN]) : S.units) {
    if (!alive(u)) continue;
    if (u.side === 'DE' && !u.vis && !S.reveal) continue;
    const [a, b] = unitScreen(u), d = hyp(a - x, b - y) + (u.kind === 'sec' ? 0 : 4);
    if (d < bd) { bd = d; best = u; }
  }
  if (best && best.side === 'GB') { select(best.id, false); return; }
  if (!best && S.sel && markerHit(x, y, true)) { // a tap on a handle while dragging is off: say how to move it, keep the selection
    S.toasts.push({ x: wx, y: wy, text: '✋ Turn on Drag (top right) to move this', kind: 'info', t: performance.now() });
    const b = $('bDrag'); if (b) { b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge'); }
    return;
  }
  if (best) { S.toasts.push({ x: best.x, y: best.y, text: `Enemy ${best.name}, ~${Math.max(1, best.men - 1 + ((R() * 3) | 0))} men${best.state !== 'ok' ? ', ' + best.state : ''}`, kind: 'info', t: performance.now() }); return; }
  if (S.sel) { S.sel = null; renderAll(); }
}
function bindCanvas() {
  const P_ = new Map(); let g = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); P_.set(e.pointerId, [x, y]);
    if (P_.size === 1) {
      const m = markerHit(x, y);
      g = m ? { k: 'mark', m, x0: x, y0: y } : { k: 'pan', x0: x, y0: y, cx: cam.x, cy: cam.y, moved: false };
    } else if (P_.size === 2) {
      const [[ax, ay], [bx, by]] = [...P_.values()];
      const [mx, my] = s2w((ax + bx) / 2, (ay + by) / 2);
      g = { k: 'pinch', d0: hyp(ax - bx, ay - by) || 1, z0: cam.z, mx, my }; S.dragMark = null;
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!P_.has(e.pointerId) || !g) return;
    const [x, y] = pos(e); P_.set(e.pointerId, [x, y]);
    if (g.k === 'pan') {
      if (hyp(x - g.x0, y - g.y0) > 8) g.moved = true;
      if (g.moved) { cam.x = g.cx - (x - g.x0) / cam.z; cam.y = g.cy - (y - g.y0) / cam.z; cam.fit = false; clampCam(); }
    } else if (g.k === 'mark') {
      const [wx, wy] = s2w(x, y); S.dragMark = { m: g.m, x: clamp(wx, 10, WW - 10), y: clamp(wy, 10, WH - 10) };
    } else if (g.k === 'pinch' && P_.size >= 2) {
      const [[ax, ay], [bx, by]] = [...P_.values()];
      cam.z = g.z0 * hyp(ax - bx, ay - by) / g.d0; cam.fit = false; clampCam();
      const sx = (ax + bx) / 2, sy = (ay + by) / 2;
      cam.x = g.mx - (sx - cam.ox - cam.vw / 2) / cam.z; cam.y = g.my - (sy - cam.oy - cam.vh / 2) / cam.z; clampCam();
    }
  });
  const up = (e) => {
    if (!P_.has(e.pointerId)) return;
    const [x, y] = pos(e); P_.delete(e.pointerId);
    if (g && g.k === 'pan' && !g.moved && P_.size === 0) tapAt(x, y);
    if (g && g.k === 'mark' && S.dragMark) {
      const n = S.nodes[S.sel], p = nearestOpen(S.dragMark.x, S.dragMark.y); S.dragMark = null;
      if (n) { proposeEdit(n, g.m === 'pos' ? { pos: p } : { target: p }); renderAll(); }
    }
    if (P_.size === 0) g = null;
    else if (P_.size === 1) { const [[px, py]] = [...P_.values()]; g = { k: 'pan', x0: px, y0: py, cx: cam.x, cy: cam.y, moved: true }; }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { P_.delete(e.pointerId); S.dragMark = null; g = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault(); const [x, y] = pos(e), [wx, wy] = s2w(x, y);
    cam.z *= Math.exp(-e.deltaY * 0.0015); cam.fit = false; clampCam();
    cam.x = wx - (x - cam.ox - cam.vw / 2) / cam.z; cam.y = wy - (y - cam.oy - cam.vh / 2) / cam.z; clampCam();
  }, { passive: false });
  // keep the panel from being rebuilt under a finger
  $('pane').addEventListener('pointerdown', () => { paneBusy = performance.now() + 900; });
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); playPause(); }
    else if (e.key === '.') { stepOnce(); renderAll(); }
    else if (e.key === 'd' || e.key === 'D') toggleDrag();
  });
}
let paneBusy = 0, lastT = 0, acc = 0;
S.perf = { frames: 0, ticks: 0 };
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - (lastT || now)) / 1000)); lastT = now;
  layout();
  if (S.phase === 'battle' && !S.paused) {
    acc += dt * S.speed; let k = 0;
    while (acc >= TICK && k < 64) { tick(); acc -= TICK; k++; S.perf.ticks++; if (S.paused) { acc = 0; break; } }
    if (k >= 64) acc = 0;
    alpha = clamp(acc / TICK, 0, 1); uiDirty = true;
  } else alpha = 1;
  draw(now);
  S.perf.frames++;
  if (uiDirty && now > paneBusy && now - lastUI > (S.phase === 'battle' && !S.paused ? 450 : 60)) renderAll();
  requestAnimationFrame(frame);
}
// ---------------------------------------------------------------- boot
prerender(); bindUI(); bindCanvas();
newScenario(1);
setSpeedV(speedToV(4));
layout(); fitCam(); renderAll();
if (DOCL.custom) log('coy', 'info', null, '🛠 Custom doctrine in use (Objective Editor).', 'auto');
if (store.get('cl-tut', '0') !== '1') openOv(tutHTML(0), 'tutov');
// coming back from the editor via the browser's back button: reload if the doctrine changed meanwhile
window.addEventListener('pageshow', (e) => { if (e.persisted && window.CLDoctrine.load().raw !== DOCL.raw) location.reload(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
requestAnimationFrame(frame);
window.CL = {
  S, cam, VERSION, FEAT, COYS, T, TYPES, specOf, label, dispSpec, proposeEdit, decide, decomposeCoy, decomposePl, answerReq, answerCounter, makeReq, tick, startBattle, newScenario,
  qualityOf, mkPersona, choose, coyCandidates, plCandidates, ratePlan, decomposeBn, bnCandidates, rateBn, threatFeats, makeBnReq, checkBnReqs, bnStatus, coyGateOK, markerHit, toggleDrag, BN, withB, tapAt, strength, coyUnits, cmdrOf, unitsUnder, nodePos, unitScreen, w2s, s2w, select, renderAll, setSpeedV, speedToV,
  savePlan, loadPlan, restart, fitCam, centerOn, STATS, DOC, DOCL,
  fast(sec) { for (let i = 0; i < sec / TICK && !S.endMsg; i++) tick(); renderAll(); },
};
})();
