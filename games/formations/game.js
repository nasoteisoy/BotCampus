/* Formations: a WW2 small-unit formation sandbox for phones.
   Original code and art. Plain canvas + vanilla JS, no dependencies. Units are metres. */
(() => {
'use strict';
const VERSION = 'v1.1';
const WW = 640, WH = 560;            // world size (m)
const TAU = Math.PI * 2;
const DT = 1 / 30;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
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

// ---------------------------------------------------------------- terrain (metres)
const ROAD = [[0, 332], [170, 320], [330, 282], [470, 252], [640, 244]], ROAD_W = 7;
const HEDGES = [[[30, 176], [192, 194]], [[206, 195], [338, 170]], [[338, 170], [352, 112]]]; // gate at x≈200
const HEDGE_W = 2.6;
const HOUSES = [[232, 314, 22, 14], [264, 322, 15, 20], [386, 224, 18, 14]];
const WOOD = { x: 480, y: 112, r: 58 };
const TREES = (() => {
  const r = mulberry(7), out = [];
  for (let i = 0; i < 95; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * WOOD.r * (0.75 + 0.25 * Math.cos(a * 3));
    out.push([WOOD.x + Math.cos(a) * d, WOOD.y + Math.sin(a) * d * 0.85, 3 + r() * 3.5]);
  }
  return out;
})();
function polyDist(P, x, y) {
  let best = 1e9, seg = 0;
  for (let i = 0; i < P.length - 1; i++) { const d = segDist(x, y, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]); if (d < best) { best = d; seg = i; } }
  return [best, seg];
}
const inHouse = (x, y, m = 0) => HOUSES.some(([hx, hy, w, h]) => x > hx - m && x < hx + w + m && y > hy - m && y < hy + h + m);
const inWood = (x, y) => hyp(x - WOOD.x, (y - WOOD.y) / 0.85) < WOOD.r * 0.95;
const hedgeDist = (x, y) => Math.min(...HEDGES.map(([a, b]) => segDist(x, y, a[0], a[1], b[0], b[1])));
const roadDist = (x, y) => polyDist(ROAD, x, y)[0];
function terrMul(x, y) {
  if (hedgeDist(x, y) < HEDGE_W * 0.6 + 0.4) return 0.45;
  if (inWood(x, y)) return 0.65;
  if (roadDist(x, y) < ROAD_W / 2 + 0.5) return 1.15;
  return 1;
}
function roadHeading(x, y) {
  const [d, i] = polyDist(ROAD, x, y);
  return { d, a: Math.atan2(ROAD[i + 1][1] - ROAD[i][1], ROAD[i + 1][0] - ROAD[i][0]) };
}

// ---------------------------------------------------------------- units
// weapons: display reach (m, shortened so arcs fit a section-sized view), half-arc (rad), fire weight
const WPN = {
  rifle:  { reach: 60, half: 0.7, w: 1, col: '255,236,170' },
  smg:    { reach: 35, half: 0.8, w: 0.8, col: '255,236,170' },
  lmg:    { reach: 120, half: 0.45, w: 3, col: '255,205,40' },
  bar:    { reach: 100, half: 0.5, w: 2.5, col: '255,205,40' },
  mmg:    { reach: 140, half: 0.45, w: 4, col: '255,190,30' },
  mortar: { reach: 0, half: 0, w: 0, col: '255,150,60' },
};
const MGW = new Set(['lmg', 'bar', 'mmg']);
const ROLE_DOT = { lead: '#ffffff', plead: '#ffd34d', sgt: '#ffffff', '2ic': '#8fd0ff', mg: '#ffd23a', mg2: '#f3e7a0', mg3: '#f3e7a0', ammo: '#f3e7a0', scout: '#a6f08a', mortar: '#ff9a4a', mortar2: '#ffc9a0', runner: '#d0d0d0' };
const R = (n, role = 'rifle', wpn = 'rifle', name = 'Rifleman') => Array.from({ length: n }, () => [role, wpn, name]);
const PARA_SEC = [['lead', 'smg', 'Section commander (Cpl)'], ['mg', 'lmg', 'Bren gunner'], ['mg2', 'rifle', 'Bren No.2'], ['2ic', 'rifle', '2IC (L/Cpl)'], ...R(6)];
const UNITS = {
  para: {
    name: 'Airborne section', short: 'Section', n: 10, badge: 'UK', body: '#8a7c4e', helm: '#4f5536', camo: '#5f6a3a',
    men: PARA_SEC, forms: ['file', 'column', 'line', 'wedge', 'echL', 'echR', 'diamond', 'blob', 'round'],
    names: { file: 'Single file', column: 'Column', line: 'Extended line', wedge: 'Arrowhead', echL: 'Echelon L', echR: 'Echelon R', diamond: 'Diamond', blob: 'Blob', round: 'All-round' },
    def: 'wedge',
  },
  platoon: {
    name: 'Airborne platoon', short: 'Platoon', n: 35, badge: 'UK', body: '#8a7c4e', helm: '#4f5536', camo: '#5f6a3a',
    men: [['plead', 'smg', 'Platoon commander (Lt)'], ['sgt', 'smg', 'Platoon sergeant'], ['runner', 'rifle', 'Runner'], ['mortar', 'mortar', '2" mortar'], ['mortar2', 'rifle', 'Mortar No.2'], ...PARA_SEC, ...PARA_SEC, ...PARA_SEC],
    forms: ['p2up', 'p1up', 'pline', 'pcol', 'pround'],
    names: { p2up: 'Two up', p1up: 'One up', pline: 'Line', pcol: 'Column', pround: 'Harbour' },
    def: 'p2up',
  },
  us: {
    name: 'US rifle squad', short: 'US squad', n: 12, badge: 'US', body: '#7a7448', helm: '#596036', camo: null,
    men: [['lead', 'rifle', 'Squad leader'], ['mg', 'bar', 'BAR man'], ['mg2', 'rifle', 'Asst BAR'], ['2ic', 'rifle', 'Asst squad leader'], ['ammo', 'rifle', 'Ammo bearer'], ['scout', 'rifle', 'Scout'], ['scout', 'rifle', 'Scout'], ...R(5)],
    forms: ['column', 'file', 'line', 'wedge', 'echL', 'echR', 'diamond', 'blob', 'round'],
    names: { column: 'Squad column', file: 'Single file', line: 'Skirmish line', wedge: 'Wedge', echL: 'Echelon L', echR: 'Echelon R', diamond: 'Diamond', blob: 'Loose', round: 'Perimeter' },
    def: 'wedge',
  },
  de: {
    name: 'German Gruppe', short: 'Gruppe', n: 10, badge: 'DE', body: '#6c7366', helm: '#555c55', camo: null,
    men: [['lead', 'smg', 'Gruppenführer'], ['mg', 'mmg', 'MG 1 (MG 42)'], ['mg2', 'rifle', 'MG 2'], ['2ic', 'rifle', 'Stellvertreter'], ['mg3', 'rifle', 'MG 3'], ...R(5, 'rifle', 'rifle', 'Schütze')],
    forms: ['reihe', 'sreihe', 'kette', 'rudel', 'wedge', 'echL', 'echR', 'round'],
    names: { reihe: 'Reihe', sreihe: 'Schützen\u00ADreihe', kette: 'Schützen\u00ADkette', rudel: 'Rudel', wedge: 'Keil', echL: 'Echelon L', echR: 'Echelon R', round: 'Rundum' },
    def: 'reihe',
  },
};
const UNIT_KEYS = ['para', 'platoon', 'us', 'de'];
// info: when used, pros/cons, ratings [control, fire forward, flanks, MG risk, shell risk] (1-3)
const INFO = {
  file:    ['Woods, hedge gaps, night moves, minefield lanes.', '+ easiest to control · − almost no fire forward; one MG down the file hits everyone.', [3, 1, 2, 3, 1]],
  column:  ['Roads and tracks when out of contact.', '+ quick and easy to control · − little fire forward; slow to deploy.', [3, 1, 2, 3, 2]],
  line:    ['The final assault, or sweeping across open ground.', '+ every rifle can fire forward · − hard to control; flanks open; deadly if enfiladed.', [1, 3, 1, 3, 1]],
  wedge:   ['Open country when contact is likely.', '+ fire forward and to both flanks, fair control · − no single strength.', [2, 2, 2, 2, 1]],
  echL:    ['Advancing with the left flank exposed.', '+ fire forward and to the left · − weak on the right.', [2, 2, 2, 2, 1]],
  echR:    ['Advancing with the right flank exposed.', '+ fire forward and to the right · − weak on the left.', [2, 2, 2, 2, 1]],
  diamond: ['Close country or at night, watching all round.', '+ all-round observation · − little fire forward.', [2, 1, 3, 2, 2]],
  blob:    ['Crossing ground under fire in short dashes, cover to cover.', '+ hard to catch with one burst · − hardest to control.', [1, 2, 2, 1, 2]],
  round:   ['Halts, night harbour, holding a point.', '+ every sector covered · − can\'t move like this; bunched under shellfire.', [2, 1, 3, 2, 3]],
  reihe:   ['The Gruppe on the move: leader first, MG team close behind.', '+ easy to steer, MG ready near the front · − tiny frontage.', [3, 1, 1, 3, 1]],
  sreihe:  ['Moving under fire: a loose file behind the MG, using cover.', '+ small target from the front · − weak to the flanks.', [2, 1, 2, 2, 1]],
  kette:   ['The firefight: riflemen spread either side of the MG, which does most of the shooting.', '+ most fire forward · − hard to control.', [1, 3, 1, 3, 1]],
  rudel:   ['Loose cluster to get across ground quickly.', '+ hard to hit with one burst · − little control.', [1, 2, 2, 1, 2]],
  p2up:    ['Two sections forward, one behind in reserve.', '+ wide front plus a reserve · − the reserve can\'t fire at first.', [2, 2, 2, 2, 1]],
  p1up:    ['One section leads to find the enemy; two follow on the flanks.', '+ strong, flexible reserve · − little fire forward.', [3, 1, 3, 2, 1]],
  pline:   ['All three sections forward, abreast.', '+ most firepower · − no reserve; hard to control.', [1, 3, 1, 3, 1]],
  pcol:    ['Approach march on roads or through woods.', '+ fast, easy control · − slow to deploy; bunched.', [3, 1, 1, 3, 2]],
  pround:  ['Platoon halt or night harbour, sections facing out.', '+ all-round defence · − static.', [2, 1, 3, 2, 3]],
  custom:  ['Your own layout. Drag men with ✏️, then 💾 save it.', 'Watch the overlays to judge it.', [2, 2, 2, 2, 2]],
};

// ---------------------------------------------------------------- formation patterns
// slots in the leader's frame: f = metres forward, s = metres right, face = facing offset (rad, + = right)
// men order for sections: 0 leader, 1 MG, 2 MG No.2, 3 2IC, 4.. the rest
const rest = (n, from = 4) => { const a = []; for (let i = from; i < n; i++) a.push(i); return a; };
const PAT = {
  file(n, D) {
    const seq = [0, 4, 5, 1, 2, ...rest(n, 6), 3], out = [];
    seq.forEach((m, k) => (out[m] = { f: -k * D, s: 0, face: k === 0 ? 0 : k === n - 1 ? Math.PI : (k % 2 ? -1 : 1) * 1.0 }));
    return out;
  },
  column(n, D) {
    const others = [4, 5, 1, 2, ...rest(n, 6), 3], out = [{ f: 0, s: 0, face: 0 }];
    const rows = Math.ceil(others.length / 2);
    others.forEach((m, j) => {
      const left = j % 2 === 0, row = Math.floor(j / 2) + 1;
      out[m] = { f: -row * D * 0.9 - (left ? 0 : 0.45 * D), s: (left ? -0.55 : 0.55) * D, face: (left ? -1 : 1) * (row === rows ? 2.3 : 0.9) };
    });
    return out;
  },
  line(n, D) {
    const Rn = Math.ceil((n - 1) / 2), Ln = n - 1 - Rn, out = [{ f: 0, s: 0, face: 0 }];
    const crew = [1, 2, 3], rifles = rest(n);
    for (let k = Rn; k >= 1; k--) out[crew.length ? crew.shift() : rifles.shift()] = { f: 0, s: k * D, face: 0.12 };
    for (let k = 1; k <= Ln; k++) out[rifles.shift()] = { f: 0, s: -k * D, face: -0.12 };
    return out;
  },
  wedge(n, D) {
    const Rn = Math.floor((n - 1) / 2), Ln = n - 1 - Rn, rifles = rest(n), out = [{ f: 0, s: 0, face: 0 }];
    const right = [rifles.shift(), 1, 2];
    while (right.length < Rn - 1) right.push(rifles.shift());
    right.push(3);
    right.forEach((m, j) => (out[m] = { f: -(j + 1) * 0.75 * D, s: (j + 1) * 0.8 * D, face: 0.5 }));
    for (let k = 1; k <= Ln; k++) out[rifles.shift()] = { f: -k * 0.75 * D, s: -k * 0.8 * D, face: -0.5 };
    return out;
  },
  diamond(n, D) {
    const a = Math.max(1.2 * D, n * D / (4 * Math.SQRT2));
    const V = [[0, 0], [-a, a], [-2 * a, 0], [-a, -a], [0, 0]], side = a * Math.SQRT2, step = 4 * side / n;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const dd = k * step, e = Math.min(3, Math.floor(dd / side)), t = (dd - e * side) / side;
      pts.push([V[e][0] + (V[e + 1][0] - V[e][0]) * t, V[e][1] + (V[e + 1][1] - V[e][1]) * t]);
    }
    const free = pts.map((_, i) => i).slice(1), take = (fx, fs) => {
      let bi = 0; free.forEach((p, i) => { if (hyp(pts[p][0] - fx, pts[p][1] - fs) < hyp(pts[free[bi]][0] - fx, pts[free[bi]][1] - fs)) bi = i; });
      return free.splice(bi, 1)[0];
    };
    const out = [], put = (m, p) => (out[m] = { f: pts[p][0], s: pts[p][1], face: Math.atan2(pts[p][1], pts[p][0] + a) });
    put(0, 0); const pm = take(-a, a); put(1, pm); put(2, take(pts[pm][0] - 1, pts[pm][1] + 0.5)); put(3, take(-2 * a, 0));
    rest(n).forEach(m => put(m, free.shift()));
    out[0].face = 0;
    return out;
  },
  blob(n, D, mgFront) {
    const rng = mulberry(n * 13 + 5), pts = [];
    for (let i = 0; i < n; i++) {
      const r = 0.95 * D * Math.sqrt(i + 0.3), th = i * 2.39996 + 0.6;
      pts.push([r * Math.cos(th) + (rng() - 0.5) * 0.7 * D, r * Math.sin(th) + (rng() - 0.5) * 0.7 * D]);
    }
    const [lf, ls] = pts[0];
    const P = pts.map(([f, s]) => [f - lf, s - ls]);
    const idx = P.map((_, i) => i).slice(1), out = [{ f: 0, s: 0, face: 0 }];
    const pick = (score) => { idx.sort((a, b) => score(P[b]) - score(P[a])); return idx.shift(); };
    const mgp = pick(mgFront ? (p) => p[0] * 2 - Math.abs(p[1]) : (p) => p[0] + 0.6 * p[1]);
    const near = (p0) => (p) => -hyp(p[0] - P[p0][0], p[1] - P[p0][1]);
    const place = (m, p) => (out[m] = { f: P[p][0], s: P[p][1], face: 0.6 * Math.atan2(P[p][1], P[p][0] + 0.5 * D) });
    place(1, mgp); place(2, pick(near(mgp))); place(3, pick((p) => -p[0]));
    rest(n).forEach(m => place(m, n > 4 && m === 4 && mgFront ? pick(near(mgp)) : pick(() => 0)));
    return out;
  },
  round(n, D) {
    const m = n - 1, Rr = Math.max(1.4 * D, m * D / TAU), out = [{ f: 0, s: 0, face: 0 }];
    const ks = []; for (let k = 0; k < m; k++) ks.push(k);
    const back = Math.round(m / 2);
    const assign = { 1: 0, 2: 1, 3: back };
    const used = new Set([0, 1, back]);
    const put = (man, k) => (out[man] = { f: Rr * Math.cos(TAU * k / m), s: Rr * Math.sin(TAU * k / m), face: TAU * k / m });
    for (const man of [1, 2, 3]) put(man, assign[man]);
    const freeK = ks.filter(k => !used.has(k));
    rest(n).forEach(man => put(man, freeK.shift()));
    return out;
  },
  reihe(n, D) {
    const seq = [0, 1, 2, ...rest(n), 3], out = [];
    seq.forEach((m, k) => (out[m] = { f: -k * D, s: 0, face: k === 0 ? 0 : k === n - 1 ? Math.PI : (k % 2 ? -1 : 1) * 1.0 }));
    return out;
  },
  sreihe(n, D) {
    const seq = [0, 1, 2, ...rest(n), 3], out = [];
    seq.forEach((m, k) => { const sd = k === 0 ? 0 : (k % 2 ? 1 : -1); out[m] = { f: -k * 1.15 * D, s: sd * 0.45 * D, face: k === 0 ? 0 : sd * 0.9 }; });
    out[1].face = 0;
    return out;
  },
  kette(n, D) {
    const out = [{ f: 0, s: 0, face: 0 }];
    out[1] = { f: 0.25 * D, s: 1.0 * D, face: 0 };           // the MG anchors the line
    out[2] = { f: -0.35 * D, s: 1.45 * D, face: 0.15 };      // No.2 beside the gun
    if (n > 4) out[4] = { f: -0.9 * D, s: 1.0 * D, face: 0.3 }; // No.3 with the ammo, just behind
    let li = 1, ri = 0;
    rest(n, 5).forEach((m, j) => {
      if (j % 2 === 0) { out[m] = { f: 0, s: -li * D, face: -0.12 }; li++; } else { out[m] = { f: 0, s: (2.4 + ri) * D, face: 0.12 }; ri++; }
    });
    out[3] = { f: -0.15 * D, s: -li * D, face: -0.35 };
    return out;
  },
  rudel(n, D) { return PAT.blob(n, D, true); },
};
PAT.echL = (n, D) => ech(n, D, -1);
PAT.echR = (n, D) => ech(n, D, 1);
function ech(n, D, dir) {
  const seq = [0, ...rest(n), 3, 1, 2], out = [];
  seq.forEach((m, k) => (out[m] = { f: -k * 0.7 * D, s: dir * k * 0.75 * D, face: k >= n - 3 ? dir * 0.9 : dir * 0.15 }));
  return out;
}
// platoon: HQ (5 men) + 3 sections, each with its own sub-formation; numbers in units of D
const PL = {
  p2up:   { secs: [[6.5, -7, 0, 'wedge'], [6.5, 7, 0, 'wedge'], [-6.5, 0, 0, 'wedge']], hq: [[0, 0, 0], [-3, 0, Math.PI], [-0.8, -1, -0.6], [-1.5, 1.3, 0], [-2.1, 2.1, 0.5]] },
  p1up:   { secs: [[7, 0, 0, 'wedge'], [-4.5, -8, 0, 'wedge'], [-4.5, 8, 0, 'wedge']], hq: [[0, 0, 0], [-3, 0, Math.PI], [-0.8, -1, -0.6], [-1.5, 1.3, 0], [-2.1, 2.1, 0.5]] },
  pline:  { secs: [[4, -10.5, 0, 'line'], [4, 0, 0, 'line'], [4, 10.5, 0, 'line']], hq: [[0, 0, 0], [-2.5, 0, Math.PI], [-0.8, -1, -0.6], [-1.4, 1.3, 0], [-1.9, 2, 0.5]] },
  pcol:   { secs: [[10, 0, 0, 'column'], [-4.5, 0, 0, 'column'], [-10.5, 0, 0, 'column']], hq: [[0, 0, 0], [-1, -0.55, -0.9], [-1, 0.55, 0.9], [-2, -0.55, -0.9], [-2, 0.55, 0.9]] },
  pround: { secs: [0, 1, 2].map(k => { const r = k * TAU / 3; return [7 * Math.cos(r), 7 * Math.sin(r), r, 'line']; }), hq: [[0, 0, 0], [-1, 0, Math.PI], [0, -1, -1.5], [0.8, 0.6, 0.8], [-0.6, 0.9, 2]] },
};
function platoonSlots(id, D) {
  const P = PL[id], out = P.hq.map(([f, s, face]) => ({ f: f * D, s: s * D, face }));
  for (const [fa, sa, rot, sub] of P.secs) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (const sl of PAT[sub](10, D)) out.push({ f: fa * D + sl.f * c - sl.s * sn, s: sa * D + sl.f * sn + sl.s * c, face: sl.face + rot });
  }
  return out;
}
function slotsFor(unitKey, id, D, custom) {
  const U = UNITS[unitKey];
  if (id === 'custom' && custom) return custom.map(([f, s, face]) => ({ f: f * D, s: s * D, face }));
  if (unitKey === 'platoon') return platoonSlots(PL[id] ? id : 'p2up', D);
  return (PAT[id] || PAT.wedge)(U.n, D);
}

// ---------------------------------------------------------------- state
const S = {
  unit: UNIT_KEYS.includes(store.get('fm-unit', 'para')) ? store.get('fm-unit', 'para') : 'para',
  D: clamp(+store.get('fm-D', '5') || 5, 2, 10),
  rush: store.get('fm-rush', '0') === '1',
  paused: false, edit: false, t: 0,
  layers: Object.assign({ arcs: false, heat: false, mg: false, blast: false, voice: false, slots: true, road: true }, JSON.parse(store.get('fm-layers', '{}') || '{}')),
  saves: (() => { try { const v = JSON.parse(store.get('fm-saves', '[]')); return Array.isArray(v) ? v.concat([null, null, null]).slice(0, 3) : [null, null, null]; } catch (e) { return [null, null, null]; } })(),
  frame: { x: 300, y: 450, h: -Math.PI / 2, th: -Math.PI / 2, path: [] },
  wps: [], men: [], slots: [], form: null, custom: null, onRoad: false, follow: true, heat: null, heatT: 0, fPath: null, stats: { plans: 0, planMs: 0, fail: 0, stuck: 0, alt: 0 },
};
function formKey() { return 'fm-form-' + S.unit; }
function buildMen() {
  const U = UNITS[S.unit], F = S.frame, rng = mulberry(42);
  S.men = U.men.map(([role, wpn, name], i) => ({
    i, role, wpn, name, sec: S.unit === 'platoon' ? (i < 5 ? -1 : Math.floor((i - 5) / 10)) : 0,
    lead: role === 'lead' || role === 'plead', x: F.x, y: F.y, a: F.h, spd: 0.9 + rng() * 0.2, ph: rng() * TAU, vx: 0, vy: 0,
    path: null, pgx: 0, pgy: 0, replan: false, chkT: 0, chkX: F.x, chkY: F.y, stuck: 0, altT: 0, altX: 0, altY: 0,
  }));
  S.form = store.get(formKey(), U.def);
  if (S.form !== 'custom' && !U.forms.includes(S.form)) S.form = U.def;
  S.custom = loadCustom();
  if (S.form === 'custom' && !S.custom) S.form = U.def;
  computeSlots();
  // start already in formation
  for (const m of S.men) { const p = slotWorld(m.i, F.h); m.x = p.x; m.y = p.y; m.a = p.a; }
}
function loadCustom() { try { const v = JSON.parse(store.get('fm-custom-' + S.unit, 'null')); return Array.isArray(v) && v.length === UNITS[S.unit].n ? v : null; } catch (e) { return null; } }
function activeForm() {
  if (S.layers.road && S.onRoad) return S.unit === 'platoon' ? 'pcol' : S.unit === 'de' ? 'reihe' : 'column';
  return S.form;
}
function computeSlots() {
  S.slots = slotsFor(S.unit, activeForm(), S.D, S.custom);
  if (S.layers.road && S.onRoad) for (const sl of S.slots) sl.s = clamp(sl.s, -ROAD_W / 2 + 1, ROAD_W / 2 - 1); // squeeze onto the road
  S.heatT = 0;
  for (const m of S.men) { m.path = null; m.replan = true; m.stuck = 0; m.altT = 0; }
}
function roadPoint(x, y) {
  let best = null;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const [ax, ay] = ROAD[i], [bx, by] = ROAD[i + 1], vx = bx - ax, vy = by - ay;
    const t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1), px = ax + vx * t, py = ay + vy * t, d = hyp(x - px, y - py);
    if (!best || d < best.d) best = { x: px, y: py, d };
  }
  return best;
}
function slotWorld(i, h = S.frame.h) {
  const sl = S.slots[i], F = S.frame, c = Math.cos(h), s = Math.sin(h);
  return { x: F.x + c * sl.f - s * sl.s, y: F.y + s * sl.f + c * sl.s, a: h + sl.face };
}
function formRadius() { return Math.max(4, ...S.slots.map(s => hyp(s.f, s.s))); }

// ---------------------------------------------------------------- navigation (buildings are the only hard obstacles)
// Coarse 1 m grid with buildings inflated by a man's radius, A* with a node budget, string-pull smoothing,
// per-man path cache, slot validation (slots inside buildings move out on the leader's side) and stuck recovery.
const MAN_R = 0.6;            // body radius used for line-of-sight / smoothing clearance
const GRID_INF = MAN_R + 0.35; // grid inflation (a bit more than MAN_R so cell centres keep clear of walls)
const SLOT_M = MAN_R + 0.55;  // slots are kept this far off the walls
const GW = WW, GH = WH, NC = GW * GH;
const blockedG = new Uint8Array(NC);
(function buildGrid() {
  for (let x = 0; x < GW; x++) { blockedG[x] = 1; blockedG[(GH - 1) * GW + x] = 1; }
  for (let y = 0; y < GH; y++) { blockedG[y * GW] = 1; blockedG[y * GW + GW - 1] = 1; }
  for (const [hx, hy, w, h] of HOUSES) {
    for (let gy = Math.floor(hy - GRID_INF - 1); gy <= Math.ceil(hy + h + GRID_INF + 1); gy++) for (let gx = Math.floor(hx - GRID_INF - 1); gx <= Math.ceil(hx + w + GRID_INF + 1); gx++) {
      const cx = gx + 0.5, cy = gy + 0.5;
      if (gx >= 0 && gy >= 0 && gx < GW && gy < GH && cx > hx - GRID_INF && cx < hx + w + GRID_INF && cy > hy - GRID_INF && cy < hy + h + GRID_INF) blockedG[gy * GW + gx] = 1;
    }
  }
})();
const cellFree = (gx, gy) => gx >= 0 && gy >= 0 && gx < GW && gy < GH && !blockedG[gy * GW + gx];
// segment vs inflated rectangles (slab test)
function segClear(ax, ay, bx, by, inf = MAN_R) {
  const dx = bx - ax, dy = by - ay;
  for (const [hx, hy, w, h] of HOUSES) {
    const x0 = hx - inf, x1 = hx + w + inf, y0 = hy - inf, y1 = hy + h + inf;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } } else {
        const r = q / p;
        if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
      }
    }
    if (ok && t0 <= t1) return false;
  }
  return true;
}
function nearestFreeCell(x, y, maxR = 25) {
  const gx = Math.floor(x), gy = Math.floor(y);
  if (cellFree(gx, gy)) return [gx, gy];
  for (let r = 1; r <= maxR; r++) {
    let best = null, bd = 1e9;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) !== r || !cellFree(gx + ox, gy + oy)) continue;
      const d = hyp(gx + ox + 0.5 - x, gy + oy + 0.5 - y); if (d < bd) { bd = d; best = [gx + ox, gy + oy]; }
    }
    if (best) return best;
  }
  return [clamp(gx, 1, GW - 2), clamp(gy, 1, GH - 2)];
}
const gS = new Float32Array(NC), seen = new Uint32Array(NC), shut = new Uint32Array(NC), from = new Int32Array(NC);
const HEAP = 1 << 17, hI = new Int32Array(HEAP), hF = new Float32Array(HEAP);
let gen = 0, hn = 0;
function hPush(i, f) {
  if (hn >= HEAP) return;
  let k = hn++;
  while (k > 0) { const p = (k - 1) >> 1; if (hF[p] <= f) break; hI[k] = hI[p]; hF[k] = hF[p]; k = p; }
  hI[k] = i; hF[k] = f;
}
function hPop() {
  const top = hI[0], li = hI[--hn], lf = hF[hn];
  let k = 0;
  for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && hF[c + 1] < hF[c]) c++; if (hF[c] >= lf) break; hI[k] = hI[c]; hF[k] = hF[c]; k = c; }
  hI[k] = li; hF[k] = lf;
  return top;
}
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
function astar(sx, sy, tx, ty) {
  const [s0, s1] = nearestFreeCell(sx, sy, 4), [g0, g1] = nearestFreeCell(tx, ty);
  const start = s1 * GW + s0, goal = g1 * GW + g0;
  if (start === goal) return [[g0, g1]];
  const bx0 = Math.max(1, Math.min(s0, g0) - 40), bx1 = Math.min(GW - 2, Math.max(s0, g0) + 40);
  const by0 = Math.max(1, Math.min(s1, g1) - 40), by1 = Math.min(GH - 2, Math.max(s1, g1) + 40);
  gen++; hn = 0;
  const hfn = (x, y) => { const dx = Math.abs(x - g0), dy = Math.abs(y - g1); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  gS[start] = 0; seen[start] = gen; from[start] = -1; hPush(start, hfn(s0, s1));
  let budget = Math.min(60000, 12000 + 200 * hfn(s0, s1)); // longer trips may need to flood a pocket in front of a wall
  while (hn > 0 && budget-- > 0) {
    const cur = hPop();
    if (shut[cur] === gen) continue;
    shut[cur] = gen;
    if (cur === goal) {
      const out = []; for (let c = cur; c !== -1; c = from[c]) out.push([c % GW, (c / GW) | 0]);
      return out.reverse();
    }
    const cx = cur % GW, cy = (cur / GW) | 0, g = gS[cur];
    for (const [ox, oy, cost] of NB) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < bx0 || nx > bx1 || ny < by0 || ny > by1) continue;
      const ni = ny * GW + nx;
      if (blockedG[ni] || shut[ni] === gen) continue;
      if (ox && oy && (blockedG[cy * GW + nx] || blockedG[ny * GW + cx])) continue; // no corner cutting
      const ng = g + cost;
      if (seen[ni] === gen && ng >= gS[ni]) continue;
      seen[ni] = gen; gS[ni] = ng; from[ni] = cur; hPush(ni, ng + hfn(nx, ny));
    }
  }
  return null;
}
// path from (sx,sy) to (tx,ty): list of points after the start, last = goal. Direct when the line is clear.
function findPath(sx, sy, tx, ty) {
  if (segClear(sx, sy, tx, ty)) return [{ x: tx, y: ty }];
  const t0 = performance.now();
  const cells = astar(sx, sy, tx, ty);
  S.stats.plans++; S.stats.planMs += performance.now() - t0;
  if (!cells) { S.stats.fail++; if (S.failLog && S.failLog.length < 20) S.failLog.push([+sx.toFixed(1), +sy.toFixed(1), +tx.toFixed(1), +ty.toFixed(1)]); return null; }
  const pts = cells.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));
  pts.push({ x: tx, y: ty });
  // string-pull: keep only the corners we can't see past
  const out = []; let ax = sx, ay = sy, i = 0;
  while (i < pts.length - 1) {
    let j = i + 1;
    while (j + 1 < pts.length && segClear(ax, ay, pts[j + 1].x, pts[j + 1].y)) j++;
    if (j === pts.length - 1) break;
    out.push(pts[j]); ax = pts[j].x; ay = pts[j].y; i = j;
  }
  out.push({ x: tx, y: ty });
  return out;
}
const houseAt = (x, y, m) => HOUSES.find(([hx, hy, w, h]) => x > hx - m && x < hx + w + m && y > hy - m && y < hy + h + m);
// a slot inside (or hugging) a building moves out to a face, preferring the face the leader is on
function validSlot(x, y, lx, ly, anySide) {
  x = clamp(x, 2, WW - 2); y = clamp(y, 2, WH - 2);
  for (let it = 0; it < 4; it++) {
    const H = houseAt(x, y, SLOT_M);
    if (!H) return { x, y, moved: it > 0 };
    const [hx, hy, w, h] = H, e = SLOT_M + 0.05, x0 = hx - e, x1 = hx + w + e, y0 = hy - e, y1 = hy + h + e;
    let best = null, bs = 1e9;
    for (const [ox, oy, side] of [[x0, y, lx < x0], [x1, y, lx > x1], [x, y0, ly < y0], [x, y1, ly > y1]]) {
      const sc = hyp(ox - x, oy - y) + (side || anySide ? 0 : 6);
      if (sc < bs) { bs = sc; best = [ox, oy]; }
    }
    x = clamp(best[0], 2, WW - 2); y = clamp(best[1], 2, WH - 2);
  }
  const [cx, cy] = nearestFreeCell(x, y);
  return { x: cx + 0.5, y: cy + 0.5, moved: true };
}
// a free spot near (x,y) that no mate is using: for men who stay stuck
function freeNear(x, y, me) {
  let best = null, bd = 1e9;
  for (let r = 1.5; r <= 6; r += 1.5) for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU + r, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (px < 2 || py < 2 || px > WW - 2 || py > WH - 2 || houseAt(px, py, SLOT_M)) continue;
    if (S.men.some(o => o !== me && hyp(o.x - px, o.y - py) < 1.2)) continue;
    const d = hyp(px - me.x, py - me.y) * 0.3 + r;
    if (d < bd) { bd = d; best = { x: px, y: py }; }
  }
  return best || { x, y };
}
// where man i should stand right now: his formation slot, moved out of buildings, plus any temporary stuck offset
function slotTarget(i, h = S.frame.h) {
  const p = slotWorld(i, h), F = S.frame;
  if (i === 0) return p;
  const m = S.men[i];
  let v = validSlot(p.x, p.y, F.x, F.y);
  if (m && m.altT > 0) v = validSlot(v.x + m.altX, v.y + m.altY, F.x, F.y);
  p.x = v.x; p.y = v.y;
  return p;
}
const MAX_PLANS = 6; // A* runs per sim step (others keep their cached path / wait a tick)

// ---------------------------------------------------------------- simulation
const WALK = 3.2, RUSH = 7.5; // m/s (time runs a bit fast so moves stay snappy)
function step() {
  S.t += DT;
  const F = S.frame, sp = S.rush ? RUSH : WALK;
  // road column on/off
  const rd = roadHeading(F.x, F.y);
  const moving = F.path.length > 0;
  // auto column only when marching along the road (heading within ~25° and the goal near the road), not when crossing it
  const goal = F.path[F.path.length - 1];
  const onRoad = moving && rd.d < ROAD_W / 2 + 4 && Math.abs(Math.cos(angDiff(F.th, rd.a))) > 0.9 && roadDist(goal.x, goal.y) < 15;
  if (onRoad !== S.onRoad) { S.onRoad = onRoad; computeSlots(); }
  // how far the men lag behind their slots
  let lag = 0;
  for (const m of S.men) { const p = slotTarget(m.i); lag += hyp(p.x - m.x, p.y - m.y); }
  lag /= S.men.length;
  const tgt = F.path[0];
  if (tgt) {
    // final goal may be on a roof — land next to it on the approach side
    if (!S.fGoal || hyp(S.fGoal.x - tgt.x, S.fGoal.y - tgt.y) > 0.1) {
      const g = validSlot(tgt.x, tgt.y, F.x, F.y, true);
      S.fGoal = { x: g.x, y: g.y }; S.fPath = null;
    }
    const gx = S.fGoal.x, gy = S.fGoal.y;
    if (!S.fPath || S.fRep) { S.fPath = findPath(F.x, F.y, gx, gy) || [{ x: gx, y: gy }]; S.fRep = false; }
    if (S.fPath.length) {
      S.fPath[S.fPath.length - 1] = { x: gx, y: gy };
      while (S.fPath.length > 1 && segClear(F.x, F.y, S.fPath[1].x, S.fPath[1].y)) S.fPath.shift();
      if (S.fPath.length > 1 && hyp(S.fPath[0].x - F.x, S.fPath[0].y - F.y) < 0.4) S.fPath.shift();
    }
    const wp = S.fPath[0] || { x: gx, y: gy };
    const dx = wp.x - F.x, dy = wp.y - F.y, d = hyp(dx, dy);
    const toGoal = hyp(gx - F.x, gy - F.y);
    if (toGoal < 0.5) { F.path.shift(); S.fPath = null; S.fGoal = null; if (!F.path.length) updateWpUI(); }
    else {
      if (d > 0.4) F.th = Math.atan2(dy, dx);
      const turn = clamp(1 - Math.abs(angDiff(F.th, F.h)) / 1.6, 0.4, 1);
      const v = sp * clamp(1.35 - lag / 5, 0.2, 1) * turn * terrMul(F.x, F.y);
      const stp = Math.min(d, v * DT);
      if (d > 1e-4) { F.x += dx / d * stp; F.y += dy / d * stp; }
      if (S.onRoad && S.layers.road) {
        const rp = roadPoint(F.x, F.y), tp = roadPoint(gx, gy);
        if (rp.d > 0.05 && tp.d < ROAD_W) { const k = Math.min(rp.d, 2.5 * DT) / rp.d; F.x += (rp.x - F.x) * k; F.y += (rp.y - F.y) * k; }
      }
    }
  } else { S.fPath = null; S.fGoal = null; }
  // wheel: the outer man can only move so fast, so wide formations turn slower
  const rate = clamp(sp * 2.4 / Math.max(6, formRadius()), 0.45, 2.5);
  F.h += clamp(angDiff(F.th, F.h), -rate * DT, rate * DT);
  // men walk to their slots with a little human jitter, around buildings when they have to
  const jit = Math.min(1, S.D / 4) * 0.35;
  let plans = 0;
  for (const m of S.men) {
    const p = slotTarget(m.i);
    let tx = p.x, ty = p.y;
    if (!m.lead || S.unit === 'platoon' && m.role === 'lead') {
      const jx = tx + Math.sin(S.t * 0.6 + m.ph) * jit, jy = ty + Math.cos(S.t * 0.45 + m.ph * 1.7) * jit;
      if (!houseAt(jx, jy, MAN_R + 0.2)) { tx = jx; ty = jy; }
    }
    if (m.i === 0) { tx = F.x; ty = F.y; }
    const dT = hyp(tx - m.x, ty - m.y);
    let ax = tx, ay = ty;
    if (dT > 0.3 && !segClear(m.x, m.y, tx, ty)) {
      if (!m.path || m.replan || hyp(m.pgx - tx, m.pgy - ty) > 2.5) {
        if (plans < MAX_PLANS) { plans++; m.path = findPath(m.x, m.y, tx, ty); m.pgx = tx; m.pgy = ty; m.replan = false; }
      }
      if (m.path && m.path.length) {
        m.path[m.path.length - 1] = { x: tx, y: ty };
        while (m.path.length > 1 && segClear(m.x, m.y, m.path[1].x, m.path[1].y)) m.path.shift();
        if (m.path.length > 1 && hyp(m.path[0].x - m.x, m.path[0].y - m.y) < 0.35) m.path.shift();
        ax = m.path[0].x; ay = m.path[0].y;
      }
    } else m.path = null;
    const dx = ax - m.x, dy = ay - m.y, d = hyp(dx, dy);
    const maxSp = (moving ? sp * 1.5 : sp * 1.6) * m.spd * terrMul(m.x, m.y);
    const v = dT > 0.05 ? Math.min(maxSp, dT * 2.4 + 0.15) : 0;
    const k = d > 0 ? Math.min(d, v * DT) / d : 0;
    m.vx = dx * k / DT; m.vy = dy * k / DT;
    m.x += dx * k; m.y += dy * k;
    const sp2 = hyp(m.vx, m.vy);
    const want = sp2 > 0.8 && dT > 1.2 ? Math.atan2(m.vy, m.vx) : p.a;
    m.a += clamp(angDiff(want, m.a), -5 * DT, 5 * DT);
    // stuck check: barely moved in 1.5 s while still away from the slot -> repath; 3rd time -> a free spot nearby for a while
    if (m.altT > 0) m.altT -= DT;
    m.chkT = (m.chkT || 0) + DT;
    if (m.chkT >= 1.5) {
      const moved = hyp(m.x - m.chkX, m.y - m.chkY);
      if (m.i !== 0 && moved < 0.3 && dT > 1.5) {
        m.stuck = (m.stuck || 0) + 1; S.stats.stuck++; m.replan = true; m.path = null;
        if (m.stuck > 2) { const a = freeNear(tx, ty, m); m.altX = a.x - tx; m.altY = a.y - ty; m.altT = 5; m.stuck = 0; S.stats.alt++; }
      } else if (dT <= 1.5) m.stuck = 0;
      m.chkT = 0; m.chkX = m.x; m.chkY = m.y;
    }
  }
  // elbow room: hard minimum 0.8 m plus a soft push inside 1.3 m so men don't jam in a gap
  const M = S.men;
  for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) {
    const a = M[i], b = M[j], dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
    if (d < 1.3 && d > 1e-4) {
      const p = (d < 0.8 ? (0.8 - d) / 2 : 0) + (1.3 - d) * 0.04, nx = dx / d * p, ny = dy / d * p;
      if (i) { a.x -= nx; a.y -= ny; }
      b.x += nx; b.y += ny;
    }
  }
  // nobody stands inside a wall
  for (const m of M) for (const [hx, hy, w, h] of HOUSES) {
    const mg = MAN_R - 0.1;
    if (m.x > hx - mg && m.x < hx + w + mg && m.y > hy - mg && m.y < hy + h + mg) {
      const o = [[m.x - (hx - mg), -1, 0], [hx + w + mg - m.x, 1, 0], [m.y - (hy - mg), 0, -1], [hy + h + mg - m.y, 0, 1]].sort((a, b) => a[0] - b[0])[0];
      m.x += o[1] * o[0]; m.y += o[2] * o[0];
    }
  }
  for (const m of M) { m.x = clamp(m.x, 1, WW - 1); m.y = clamp(m.y, 1, WH - 1); }
}
function settled() {
  if (S.frame.path.length || Math.abs(angDiff(S.frame.th, S.frame.h)) > 0.02) return false;
  return S.men.every(m => { const p = slotTarget(m.i); return hyp(p.x - m.x, p.y - m.y) < 0.9; });
}

// ---------------------------------------------------------------- analysis overlays
// friendly masking: a mate standing in the line of fire blocks that shot
function blocked(m, ang, reach) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (const o of S.men) {
    if (o === m) continue;
    const dx = o.x - m.x, dy = o.y - m.y, t = dx * c + dy * s;
    if (t < 0.6 || t > reach) continue;
    if (Math.abs(dx * s - dy * c) < 0.7) return true;
  }
  return false;
}
function arcInfo(m) {
  const w = WPN[m.wpn];
  if (!w.reach) return null;
  let open = 0; const N = 9;
  for (let k = 0; k < N; k++) { const a = m.a - w.half + (2 * w.half) * k / (N - 1); if (!blocked(m, a, w.reach)) open++; }
  return { w, open: open / N };
}
function computeHeat() {
  const F = S.frame, ext = 150 + formRadius(), cell = Math.max(3, ext * 2 / 80);
  const n = Math.ceil(ext * 2 / cell), x0 = F.x - ext, y0 = F.y - ext;
  const grid = new Float32Array(n * n);
  const sh = S.men.map(m => ({ m, w: WPN[m.wpn] })).filter(o => o.w.reach);
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    const cx = x0 + (gx + 0.5) * cell, cy = y0 + (gy + 0.5) * cell;
    let v = 0;
    for (const { m, w } of sh) {
      const dx = cx - m.x, dy = cy - m.y, d = hyp(dx, dy);
      if (d > w.reach || d < 0.5) continue;
      const a = Math.atan2(dy, dx);
      if (Math.abs(angDiff(a, m.a)) > w.half) continue;
      if (blocked(m, a, d)) continue;
      v += w.w;
    }
    grid[gy * n + gx] = v;
  }
  // firepower rose: unblocked fire by direction relative to the formation's facing
  const bins = new Float32Array(36);
  for (const { m, w } of sh) for (let k = 0; k < 9; k++) {
    const a = m.a - w.half + 2 * w.half * k / 8;
    if (blocked(m, a, w.reach)) continue;
    const rel = (angDiff(a, F.h) + TAU) % TAU;
    bins[Math.floor(rel / TAU * 36) % 36] += w.w / 9;
  }
  let fr = 0, fl = 0, rr = 0, tot = 0;
  bins.forEach((v, i) => { const a = Math.abs(angDiff(i / 36 * TAU + TAU / 72, 0)); tot += v; if (a < Math.PI / 4) fr += v; else if (a < Math.PI * 3 / 4) fl += v; else rr += v; });
  S.heat = { grid, n, x0, y0, cell, bins, fr: tot ? fr / tot : 0, fl: tot ? fl / tot : 0, rr: tot ? rr / tot : 0, tot };
  if (!heatCv) heatCv = document.createElement('canvas');
  heatCv.width = n; heatCv.height = n;
  const g = heatCv.getContext('2d'), img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const v = grid[i]; if (!v) continue;
    const k = Math.min(1, v / 8);
    img.data[i * 4] = 255; img.data[i * 4 + 1] = Math.round(220 - 170 * k); img.data[i * 4 + 2] = Math.round(70 - 50 * k); img.data[i * 4 + 3] = Math.round(28 + 100 * k);
  }
  g.putImageData(img, 0, 0);
}
let heatCv = null;
// worst-case single MG burst: the line that catches the most men (beaten zone ~1.6 m wide)
function mgBurst() {
  let best = { n: 0 };
  const M = S.men;
  for (let k = 0; k < 72; k++) {
    const a = k / 72 * Math.PI, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    const p = M.map(m => m.x * nx + m.y * ny).sort((x, y) => x - y);
    let j = 0;
    for (let i = 0; i < p.length; i++) {
      while (p[i] - p[j] > 1.6) j++;
      const c = i - j + 1;
      if (c > best.n || (c === best.n && Math.abs(Math.cos(a - S.frame.h)) > Math.abs(Math.cos(best.a - S.frame.h)) + 0.01)) best = { n: c, a, off: (p[i] + p[j]) / 2 };
    }
  }
  const nx = -Math.sin(best.a), ny = Math.cos(best.a);
  best.hit = M.filter(m => Math.abs(m.x * nx + m.y * ny - best.off) <= 0.85);
  return best;
}
const BLAST_R = 10;
function blast() {
  const M = S.men, cand = [];
  for (const m of M) cand.push([m.x, m.y]);
  for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) if (hyp(M[i].x - M[j].x, M[i].y - M[j].y) < BLAST_R * 2) cand.push([(M[i].x + M[j].x) / 2, (M[i].y + M[j].y) / 2]);
  let best = { n: 0, x: S.frame.x, y: S.frame.y };
  for (const [x, y] of cand) { let c = 0; for (const m of M) if (hyp(m.x - x, m.y - y) <= BLAST_R) c++; if (c > best.n) best = { n: c, x, y }; }
  best.hit = M.filter(m => hyp(m.x - best.x, m.y - best.y) <= BLAST_R);
  return best;
}
function voiceLeaders() {
  if (S.unit === 'platoon') return S.men.filter(m => m.lead).map(m => ({ m, r: m.role === 'plead' ? 40 : 25 }));
  return [{ m: S.men[0], r: 30 }];
}

// ---------------------------------------------------------------- rendering
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
const cam = { x: 300, y: 450, z: 6 };
const view = { cx: 0, cy: 0, x0: 0, y0: 0, x1: 0, y1: 0 }; // free (unobstructed) screen area
const MS = 3, mapCv = document.createElement('canvas');
function drawMap() {
  mapCv.width = WW * MS; mapCv.height = WH * MS;
  const c = mapCv.getContext('2d'); c.scale(MS, MS);
  c.fillStyle = '#7b8a4e'; c.fillRect(0, 0, WW, WH);
  const r = mulberry(3);
  for (const [x, y, w, h, col] of [[20, 20, 170, 120, '#86945a'], [230, 30, 160, 110, '#829154'], [60, 360, 200, 80, '#8a9659'], [380, 300, 200, 130, '#7f8e53'], [40, 460, 230, 90, '#839256'], [320, 450, 280, 100, '#88975a'], [420, 190, 170, 50, '#869456']]) {
    c.fillStyle = col; c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(0,0,0,.05)'; c.lineWidth = 0.6;
    for (let yy = y + 3; yy < y + h; yy += 4) { c.beginPath(); c.moveTo(x + 2, yy); c.lineTo(x + w - 2, yy); c.stroke(); }
  }
  for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,220' : '40,60,20'},.06)`; c.beginPath(); c.arc(r() * WW, r() * WH, 1 + r() * 3, 0, TAU); c.fill(); }
  // road
  const road = (w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); ROAD.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };
  road(ROAD_W + 1.6, '#8f8566'); road(ROAD_W, '#bdb18c'); road(0.5, 'rgba(0,0,0,.12)');
  // wood
  for (const [x, y, rr] of TREES) { c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(x + 1.2, y + 1.2, rr, 0, TAU); c.fill(); }
  for (const [x, y, rr] of TREES) { c.fillStyle = '#4b6936'; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); c.fillStyle = '#5a7a41'; c.beginPath(); c.arc(x - rr * 0.25, y - rr * 0.25, rr * 0.55, 0, TAU); c.fill(); }
  // hedgerows
  for (const [a, b] of HEDGES) {
    c.strokeStyle = '#33492a'; c.lineWidth = HEDGE_W + 0.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    const L = hyp(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t <= L; t += 1.6) { const x = a[0] + (b[0] - a[0]) * t / L, y = a[1] + (b[1] - a[1]) * t / L; c.fillStyle = r() < 0.5 ? '#46663a' : '#3d5a32'; c.beginPath(); c.arc(x + (r() - 0.5), y + (r() - 0.5), 1.1 + r() * 0.6, 0, TAU); c.fill(); }
  }
  // buildings
  HOUSES.forEach(([x, y, w, h], i) => {
    c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x + 1.2, y + 1.2, w, h);
    c.fillStyle = ['#9a5a44', '#8a6e5c', '#7b5e52'][i % 3]; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(255,255,255,.1)'; if (w >= h) c.fillRect(x, y, w, h / 2); else c.fillRect(x, y, w / 2, h);
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 0.4; c.beginPath(); if (w >= h) { c.moveTo(x + 1, y + h / 2); c.lineTo(x + w - 1, y + h / 2); } else { c.moveTo(x + w / 2, y + 1); c.lineTo(x + w / 2, y + h - 1); } c.stroke();
    c.strokeStyle = '#3a2a22'; c.lineWidth = 0.5; c.strokeRect(x, y, w, h);
  });
}
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + view.cx, y: (y - cam.y) * cam.z + view.cy });
const toWorld = (sx, sy) => ({ x: cam.x + (sx - view.cx) / cam.z, y: cam.y + (sy - view.cy) / cam.z });
function layout() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  const top = $('top').getBoundingClientRect().bottom;
  const land = VW > VH && VH < 560;
  const fb = $('fbar').getBoundingClientRect(), tl = $('tools').getBoundingClientRect();
  view.x0 = 0; view.y0 = top;
  view.x1 = land ? fb.left : VW;
  view.y1 = land ? tl.top : Math.min(tl.top, fb.top);
  view.cx = (view.x0 + view.x1) / 2; view.cy = (view.y0 + view.y1) / 2;
}
function fit() {
  const r = formRadius() + 5, w = view.x1 - view.x0, h = view.y1 - view.y0;
  cam.z = clamp(Math.min(w, h) / (2 * r), 1.2, 16);
  cam.x = S.frame.x; cam.y = S.frame.y;
}
function man(c, m, k, U) {
  // top-down soldier: shoulders, helmet, weapon pointing where he faces
  c.save(); c.translate(m.x, m.y); c.rotate(m.a);
  const w = WPN[m.wpn];
  c.lineCap = 'round';
  // weapon
  c.strokeStyle = '#1d1a14';
  if (m.wpn === 'mortar') { c.lineWidth = 0.32 * k; c.beginPath(); c.moveTo(0.1 * k, 0.25 * k); c.lineTo(0.8 * k, 0.25 * k); c.stroke(); }
  else {
    const L = m.wpn === 'smg' ? 0.75 : MGW.has(m.wpn) ? 1.35 : 1.1;
    c.lineWidth = (MGW.has(m.wpn) ? 0.22 : 0.13) * k;
    c.beginPath(); c.moveTo(0.05 * k, 0.18 * k); c.lineTo(L * k, 0.12 * k); c.stroke();
    if (MGW.has(m.wpn)) { c.lineWidth = 0.08 * k; c.beginPath(); c.moveTo(1.05 * k, 0.12 * k); c.lineTo(1.2 * k, -0.08 * k); c.moveTo(1.05 * k, 0.12 * k); c.lineTo(1.2 * k, 0.32 * k); c.stroke(); }
  }
  // body
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(0.12 * k, 0.12 * k, 0.32 * k, 0.56 * k, 0, 0, TAU); c.fill();
  c.fillStyle = U.body; c.beginPath(); c.ellipse(0, 0, 0.3 * k, 0.55 * k, 0, 0, TAU); c.fill();
  if (U.camo) { c.fillStyle = U.camo; c.beginPath(); c.ellipse(-0.08 * k, -0.22 * k, 0.12 * k, 0.16 * k, 0.6, 0, TAU); c.ellipse(0.06 * k, 0.28 * k, 0.1 * k, 0.14 * k, -0.4, 0, TAU); c.fill(); }
  c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 0.06 * k; c.beginPath(); c.ellipse(0, 0, 0.3 * k, 0.55 * k, 0, 0, TAU); c.stroke();
  c.fillStyle = U.helm; c.beginPath(); c.arc(0.04 * k, 0, 0.27 * k, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.5)'; c.stroke();
  // role mark on the helmet
  const rc = ROLE_DOT[m.role];
  if (rc) { c.fillStyle = rc; c.beginPath(); c.arc(0.04 * k, 0, 0.12 * k, 0, TAU); c.fill(); }
  c.restore();
  if (m.lead) {
    const r = (m.role === 'plead' ? 0.62 : 0.48) * k;
    c.fillStyle = m.role === 'plead' ? '#ffd34d' : '#fff';
    c.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(m.x + Math.cos(a) * rr, m.y - 1.15 * k + Math.sin(a) * rr); }
    c.closePath(); c.fill(); c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 0.05 * k; c.stroke();
  }
}
function badge(x, y, txt, col) {
  ctx.font = 'bold 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width + 14;
  ctx.fillStyle = 'rgba(14,16,10,.85)'; rr(ctx, x - w / 2, y - 11, w, 22, 11); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + 0.5);
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const handle = { x: 0, y: 0 };
function render() {
  const U = UNITS[S.unit], F = S.frame, z = cam.z;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#4a5532'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (view.cx - cam.x * z), DPR * (view.cy - cam.y * z));
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mapCv, 0, 0, WW, WH);
  const px = 1 / z;                       // one screen pixel in metres
  const k = Math.max(1, 5.5 * px / 0.55); // soldier scale: never smaller than ~11 px across
  const dbg = S.dbg = { arcs: 0, heat: 0, mg: 0, blast: 0, voice: 0 };
  // coverage heatmap
  if (S.layers.heat) {
    if (S.t - S.heatT > 0.35 || !S.heat) { computeHeat(); S.heatT = S.t; }
    const H = S.heat; ctx.globalAlpha = 0.85; ctx.drawImage(heatCv, H.x0, H.y0, H.n * H.cell, H.n * H.cell); ctx.globalAlpha = 1; dbg.heat = 1;
  }
  // fire arcs
  if (S.layers.arcs) {
    const many = S.men.length > 14;
    for (const m of S.men) {
      const A = arcInfo(m); if (!A) continue;
      const mg = MGW.has(m.wpn), w = A.w;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.arc(m.x, m.y, w.reach, m.a - w.half, m.a + w.half); ctx.closePath();
      const al = (mg ? 0.2 : many ? 0.05 : 0.09) * (0.35 + 0.65 * A.open);
      ctx.fillStyle = A.open < 0.4 ? `rgba(230,80,60,${al})` : `rgba(${w.col},${al})`; ctx.fill();
      ctx.strokeStyle = mg ? `rgba(${w.col},.9)` : `rgba(${w.col},${many ? 0.18 : 0.35})`; ctx.lineWidth = (mg ? 2.2 : 1) * px;
      if (A.open < 0.4) ctx.setLineDash([4 * px, 4 * px]);
      ctx.stroke(); ctx.setLineDash([]);
      dbg.arcs++;
    }
  }
  // command radius
  if (S.layers.voice) {
    for (const { m, r } of voiceLeaders()) {
      ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, TAU);
      ctx.fillStyle = m.role === 'plead' ? 'rgba(255,211,77,.07)' : 'rgba(150,210,255,.08)'; ctx.fill();
      ctx.setLineDash([6 * px, 5 * px]); ctx.strokeStyle = m.role === 'plead' ? 'rgba(255,211,77,.85)' : 'rgba(170,220,255,.8)'; ctx.lineWidth = 1.6 * px; ctx.stroke(); ctx.setLineDash([]);
    }
    dbg.voice = 1;
  }
  // path + waypoints
  const pts = [[F.x, F.y], ...(S.fPath && F.path.length ? S.fPath.slice(0, -1).map(p => [p.x, p.y]) : []), ...F.path.map((p, i) => (i === 0 && S.fGoal ? [S.fGoal.x, S.fGoal.y] : [p.x, p.y]))];
  if (pts.length > 1) {
    ctx.setLineDash([7 * px, 6 * px]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2 * px;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
    const e = pts[pts.length - 1]; ctx.beginPath(); ctx.arc(e[0], e[1], 9 * px, 0, TAU); ctx.stroke();
  }
  if (S.wps.length) {
    ctx.setLineDash([3 * px, 5 * px]); ctx.strokeStyle = 'rgba(255,220,120,.9)'; ctx.lineWidth = 2 * px;
    ctx.beginPath(); ctx.moveTo(F.x, F.y); S.wps.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const [list, col] of [[S.wps, '#ffd36a'], [F.path.slice(0, -1).filter(p => p.wp), '#ffffff']]) list.forEach((p, i) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, 8 * px, 0, TAU); ctx.fill();
    ctx.fillStyle = '#222'; ctx.font = `bold ${11 * px}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), p.x, p.y + 0.5 * px);
  });
  // slot ghosts (where each man is heading)
  if (S.layers.slots) for (const m of S.men) {
    const p = slotTarget(m.i), d = hyp(p.x - m.x, p.y - m.y);
    if (d < 0.9) continue;
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.2 * px;
    ctx.beginPath(); ctx.arc(p.x, p.y, 0.45 * k, 0, TAU); ctx.stroke();
    if (d > 3) { ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  }
  // men
  for (const m of S.men) man(ctx, m, k, U);
  if (S.edit && S.dragMan) { const m = S.dragMan; ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(m.x, m.y, 0.95 * k, 0, TAU); ctx.stroke(); }
  // out of voice range marks
  const hud = [];
  if (S.layers.voice) {
    const L = voiceLeaders(); let inR = 0;
    for (const m of S.men) {
      const ok = L.some(({ m: l, r }) => (S.unit !== 'platoon' || l.role === 'plead' || l.sec === m.sec) && hyp(l.x - m.x, l.y - m.y) <= r);
      if (ok) inR++;
      else { ctx.fillStyle = '#ff7a5c'; ctx.font = `bold ${13 * px}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', m.x + 0.7 * k, m.y - 0.8 * k); }
    }
    hud.push([`🗣 ${inR}/${S.men.length} hear`, 'rgb(170,220,255)']); dbg.voice = inR;
  }
  // MG burst danger line
  if (S.layers.mg) {
    const B = mgBurst(), ux = Math.cos(B.a), uy = Math.sin(B.a), nx = -uy, ny = ux;
    const cx = S.men.reduce((a, m) => a + m.x, 0) / S.men.length, cy = S.men.reduce((a, m) => a + m.y, 0) / S.men.length;
    const along = cx * ux + cy * uy, L = formRadius() + 45;
    const ox = nx * B.off + ux * along, oy = ny * B.off + uy * along;
    const ax = ox - ux * L, ay = oy - uy * L, bx = ox + ux * L, by = oy + uy * L;
    ctx.strokeStyle = 'rgba(240,60,40,.25)'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([10 * px, 7 * px]); ctx.lineDashOffset = -S.t * 60 * px; ctx.strokeStyle = 'rgba(255,90,60,.95)'; ctx.lineWidth = 2.2 * px;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.fillStyle = '#e8402f'; ctx.beginPath(); ctx.arc(ax, ay, 9 * px, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(ax - 5 * px, ay); ctx.lineTo(ax + 5 * px, ay); ctx.stroke();
    for (const m of B.hit) { ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 2.4 * px; ctx.beginPath(); ctx.arc(m.x, m.y, 0.8 * k, 0, TAU); ctx.stroke(); }
    hud.push([`⚔ ${B.n}/${S.men.length} in one burst`, 'rgb(255,90,60)']);
    S.lastMg = B.n; dbg.mg = B.n;
  }
  // artillery blast preview
  if (S.layers.blast) {
    const B = blast();
    ctx.beginPath(); ctx.arc(B.x, B.y, BLAST_R, 0, TAU);
    const g = ctx.createRadialGradient(B.x, B.y, 0, B.x, B.y, BLAST_R);
    g.addColorStop(0, 'rgba(255,170,60,.45)'); g.addColorStop(1, 'rgba(230,60,30,.12)'); ctx.fillStyle = g; ctx.fill();
    ctx.setLineDash([5 * px, 4 * px]); ctx.strokeStyle = 'rgba(255,120,60,.95)'; ctx.lineWidth = 2 * px; ctx.stroke(); ctx.setLineDash([]);
    for (const m of B.hit) { ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 2.2 * px; const r = 0.6 * k; ctx.beginPath(); ctx.moveTo(m.x - r, m.y - r); ctx.lineTo(m.x + r, m.y + r); ctx.moveTo(m.x + r, m.y - r); ctx.lineTo(m.x - r, m.y + r); ctx.stroke(); }
    hud.push([`💥 ${B.n}/${S.men.length} in one shell`, 'rgb(255,150,60)']);
    S.lastBlast = B.n; dbg.blast = B.n;
  }
  // rotate handle: an arrow ahead of the leader
  const L0 = S.men[0], hl = 64 * px;
  handle.x = L0.x + Math.cos(F.th) * hl; handle.y = L0.y + Math.sin(F.th) * hl;
  if (!S.edit) {
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5 * px;
    ctx.beginPath(); ctx.moveTo(L0.x + Math.cos(F.th) * 14 * px, L0.y + Math.sin(F.th) * 14 * px); ctx.lineTo(handle.x, handle.y); ctx.stroke();
    ctx.fillStyle = 'rgba(20,24,14,.75)'; ctx.beginPath(); ctx.arc(handle.x, handle.y, 15 * px, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * px; ctx.stroke();
    ctx.save(); ctx.translate(handle.x, handle.y); ctx.rotate(F.th);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(8 * px, 0); ctx.lineTo(-4 * px, -6 * px); ctx.lineTo(-4 * px, 6 * px); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // screen-space HUD
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  hud.forEach(([t, col], i) => { ctx.font = 'bold 12px system-ui,sans-serif'; const w = ctx.measureText(t).width + 14; badge(view.x0 + 8 + w / 2, view.y0 + 20 + i * 27, t, col); });
  // scale bar
  const nice = [2, 5, 10, 20, 50, 100, 200].find(v => v * z >= 60) || 200, bw = nice * z, bx = view.x0 + 12, by = view.y1 - 14;
  ctx.fillStyle = 'rgba(14,16,10,.6)'; rr(ctx, bx - 6, by - 20, bw + 12, 28, 6); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, by - 6); ctx.lineTo(bx, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by - 6); ctx.moveTo(bx + bw / 2, by); ctx.lineTo(bx + bw / 2, by - 3); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(`${nice} m`, bx + bw / 2, by - 8);
  // firepower rose (with the heatmap)
  if (S.layers.heat && S.heat) drawRose(view.x1 - 62, view.y0 + 64, 48);
  if (S.onRoad && S.layers.road) badge(view.cx, view.y1 - 52, '🛣 column on the road', 'rgb(220,210,170)');
}
function drawRose(cx, cy, R) {
  const H = S.heat, max = Math.max(0.5, ...H.bins);
  ctx.fillStyle = 'rgba(14,16,10,.72)'; ctx.beginPath(); ctx.arc(cx, cy, R + 8, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
  H.bins.forEach((v, i) => {
    if (!v) return;
    const a0 = -Math.PI / 2 + i / 36 * TAU, a1 = a0 + TAU / 36, r = 6 + (R - 6) * v / max;
    ctx.fillStyle = `rgba(255,${Math.round(210 - 140 * v / max)},60,.9)`;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath(); ctx.fill();
  });
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx, cy - R - 7); ctx.lineTo(cx - 5, cy - R + 1); ctx.lineTo(cx + 5, cy - R + 1); ctx.fill();
  ctx.font = 'bold 10px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`⬆${Math.round(H.fr * 100)}% ↔${Math.round(H.fl * 100)}% ⬇${Math.round(H.rr * 100)}%`, cx, cy + R + 10);
}

// ---------------------------------------------------------------- input
const ptrs = new Map();
let gest = null;
const LONG_MS = 450;
function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }
function manAt(sx, sy) {
  let best = null, bd = 26;
  for (const m of S.men) { const p = toScreen(m.x, m.y), d = hyp(p.x - sx, p.y - sy); if (d < bd) { bd = d; best = m; } }
  return best;
}
cv.addEventListener('pointerdown', (e) => {
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  closePanels();
  if (ptrs.size === 1) {
    const hp = toScreen(handle.x, handle.y);
    gest = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, mode: 'pending' };
    if (!S.edit && hyp(hp.x - e.clientX, hp.y - e.clientY) < 30) { gest.mode = 'rotate'; return; }
    if (S.edit) { const m = manAt(e.clientX, e.clientY); if (m && m.i !== 0) { gest.mode = 'dragMan'; S.dragMan = m; return; } }
    gest.timer = setTimeout(() => {
      if (gest && gest.mode === 'pending' && !S.edit) {
        gest.mode = 'held';
        const w = toWorld(gest.sx, gest.sy);
        S.wps.push({ x: clamp(w.x, 2, WW - 2), y: clamp(w.y, 2, WH - 2), wp: true }); vib(15); updateWpUI();
      }
    }, LONG_MS);
  } else if (ptrs.size === 2 && gest) {
    clearTimeout(gest.timer);
    const [a, b] = [...ptrs.values()];
    gest.mode = 'pinch'; gest.d0 = hyp(a.x - b.x, a.y - b.y) || 1; gest.z0 = cam.z;
    gest.mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
  }
});
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId) || !gest) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
  switch (gest.mode) {
    case 'pinch': {
      if (ptrs.size < 2) return;
      const [a, b] = [...ptrs.values()], d = hyp(a.x - b.x, a.y - b.y) || 1;
      cam.z = clamp(gest.z0 * d / gest.d0, 1, 30);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.x = gest.mid.x - (mx - view.cx) / cam.z; cam.y = gest.mid.y - (my - view.cy) / cam.z; S.follow = false; paintFollow();
      break;
    }
    case 'pending': if (hyp(dx, dy) > 10) { clearTimeout(gest.timer); gest.mode = 'pan'; S.follow = false; paintFollow(); } break;
    case 'pan': cam.x = gest.cx - dx / cam.z; cam.y = gest.cy - dy / cam.z; clampCam(); break;
    case 'rotate': {
      const w = toWorld(e.clientX, e.clientY), L = S.men[0];
      if (hyp(w.x - L.x, w.y - L.y) > 1) { S.frame.th = Math.atan2(w.y - L.y, w.x - L.x); S.frame.path = []; S.wps = []; updateWpUI(); }
      break;
    }
    case 'dragMan': {
      const w = toWorld(e.clientX, e.clientY), F = S.frame, c = Math.cos(F.h), s = Math.sin(F.h);
      const snap = validSlot(w.x, w.y, F.x, F.y, true);
      const lx = snap.x - F.x, ly = snap.y - F.y;
      if (S.form !== 'custom') { S.custom = S.slots.map(sl => [sl.f / S.D, sl.s / S.D, sl.face]); setForm('custom', true); }
      const f = lx * c + ly * s, sd = -lx * s + ly * c, m = S.dragMan;
      S.custom[m.i] = [f / S.D, sd / S.D, S.custom[m.i][2]];
      computeSlots(); m.x = snap.x; m.y = snap.y;
      break;
    }
  }
});
const endPtr = (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (!gest || ptrs.size) return;
  clearTimeout(gest.timer);
  if (e.type === 'pointerup') {
    if (gest.mode === 'pending' && !S.edit) march(toWorld(e.clientX, e.clientY));
    if (gest.mode === 'dragMan') { saveCustom(); vib(10); }
    if (gest.mode === 'rotate') vib(8);
  }
  S.dragMan = null; gest = null;
};
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const w0 = toWorld(e.clientX, e.clientY);
  cam.z = clamp(cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 1, 30);
  cam.x = w0.x - (e.clientX - view.cx) / cam.z; cam.y = w0.y - (e.clientY - view.cy) / cam.z; S.follow = false; paintFollow();
}, { passive: false });
function clampCam() { cam.x = clamp(cam.x, -50, WW + 50); cam.y = clamp(cam.y, -50, WH + 50); }
function march(w) {
  const p = { x: clamp(w.x, 3, WW - 3), y: clamp(w.y, 3, WH - 3) };
  S.frame.path = [...S.wps, p]; S.wps = []; S.fPath = null; S.fGoal = null; S.fRep = true;
  for (const m of S.men) { m.path = null; m.replan = true; m.stuck = 0; }
  updateWpUI(); vib(10);
}

// ---------------------------------------------------------------- UI
function $(id) { return document.getElementById(id); }
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = '1'; clearTimeout(toastT); toastT = setTimeout(() => (el.style.opacity = '0'), 1600); }
function patternIcon(cvs, unitKey, id, custom) {
  const g = cvs.getContext('2d'), Wc = cvs.width, Hc = cvs.height;
  g.clearRect(0, 0, Wc, Hc);
  const sl = slotsFor(unitKey, id, 1, custom), U = UNITS[unitKey];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const s of sl) { x0 = Math.min(x0, s.s); x1 = Math.max(x1, s.s); y0 = Math.min(y0, -s.f); y1 = Math.max(y1, -s.f); }
  const sc = Math.min((Wc - 12) / Math.max(1, x1 - x0), (Hc - 12) / Math.max(1, y1 - y0), 16);
  const ox = Wc / 2 - (x0 + x1) / 2 * sc, oy = Hc / 2 - (y0 + y1) / 2 * sc;
  const r = unitKey === 'platoon' ? 1.6 : 2.4;
  sl.forEach((s, i) => {
    const role = U.men[i][0], mg = MGW.has(U.men[i][1]);
    g.fillStyle = role === 'lead' || role === 'plead' ? '#fff' : mg ? '#ffd23a' : '#c9d3a3';
    g.beginPath(); g.arc(ox + s.s * sc, oy - s.f * sc, mg || role === 'plead' ? r * 1.3 : r, 0, TAU); g.fill();
  });
}
function buildFormBar() {
  const U = UNITS[S.unit], bar = $('fbar');
  bar.innerHTML = '';
  const ids = [...U.forms, 'custom'];
  for (const id of ids) {
    if (id === 'custom' && !S.custom) continue;
    const b = document.createElement('button');
    b.className = 'fb'; b.dataset.f = id; b.title = id === 'custom' ? 'Custom' : U.names[id];
    const c = document.createElement('canvas'); c.width = 96; c.height = 60;
    patternIcon(c, S.unit, id, S.custom);
    const l = document.createElement('small'); l.textContent = id === 'custom' ? '✏️ Custom' : U.names[id];
    b.append(c, l);
    b.addEventListener('click', () => { setForm(id); });
    bar.append(b);
  }
  paintForm();
}
function paintForm() {
  document.querySelectorAll('.fb').forEach(b => b.classList.toggle('on', b.dataset.f === S.form));
  const U = UNITS[S.unit];
  $('unitLbl').textContent = U.short;
  $('unitBadge').textContent = U.badge;
}
function setForm(id, quiet) {
  S.form = id; store.set(formKey(), id);
  computeSlots();
  if (id === 'custom') buildFormBar(); else paintForm();
  if (!quiet) { const U = UNITS[S.unit]; toast((id === 'custom' ? '✏️ Custom' : U.names[id])); vib(8); }
  if ($('ovInfo') && !$('ovInfo').classList.contains('hidden')) showInfo();
}
function saveCustom() { store.set('fm-custom-' + S.unit, JSON.stringify(S.custom)); }
function setUnit(k) {
  S.unit = k; store.set('fm-unit', k);
  S.frame.path = []; S.wps = []; S.frame.th = S.frame.h; S.onRoad = false;
  buildMen(); buildFormBar(); fit(); S.follow = true; paintFollow(); updateWpUI();
  toast(UNITS[k].name);
}
function setD(v) {
  S.D = clamp(+v, 2, 10); store.set('fm-D', String(S.D));
  $('dLbl').textContent = `${S.D % 1 ? S.D.toFixed(1) : S.D} m`;
  $('spacing').value = S.D;
  computeSlots();
}
function paintLayers() {
  document.querySelectorAll('[data-l]').forEach(b => b.classList.toggle('on', !!S.layers[b.dataset.l]));
  $('bLayers').classList.toggle('on', ['arcs', 'heat', 'mg', 'blast', 'voice'].some(k => S.layers[k]));
}
function paintFollow() { $('bCenter').classList.toggle('on', S.follow); }
function updateWpUI() { const n = S.wps.length; $('wpBar').style.display = n ? 'flex' : 'none'; $('wpN').textContent = `📍 ${n}`; }
function closePanels() { $('layers').classList.add('hidden'); }
function showInfo() {
  const U = UNITS[S.unit], id = S.form, I = INFO[id] || INFO.custom;
  $('iName').textContent = id === 'custom' ? '✏️ Custom' : U.names[id];
  patternIcon($('iIcon'), S.unit, id, S.custom);
  $('iWhen').textContent = I[0];
  $('iPc').textContent = I[1];
  const rows = [['🗣', 'Control', 0, false], ['⬆', 'Fire forward', 1, false], ['↔', 'Flanks', 2, false], ['⚔', 'MG risk', 3, true], ['💥', 'Shell risk', 4, true]];
  $('iRates').innerHTML = rows.map(([ic, nm, k, bad]) => `<div><span>${ic}</span><span>${nm}</span><b class="${bad ? 'bad' : ''}">${'●'.repeat(I[2][k])}<i>${'●'.repeat(3 - I[2][k])}</i></b></div>`).join('');
  $('ovInfo').classList.remove('hidden');
}
function buildUnitPicker() {
  const el = $('units'); el.innerHTML = '';
  for (const k of UNIT_KEYS) {
    const U = UNITS[k], b = document.createElement('button');
    b.className = 'uc' + (k === S.unit ? ' on' : ''); b.dataset.u = k;
    const c = document.createElement('canvas'); c.width = 120; c.height = 72;
    patternIcon(c, k, U.def, null);
    b.innerHTML = `<span class="ub">${U.badge}</span>`;
    b.append(c);
    const t = document.createElement('div'); t.innerHTML = `<b>${U.name}</b><small>👥 ${U.n}</small>`; b.append(t);
    b.addEventListener('click', () => { $('ovUnit').classList.add('hidden'); if (k !== S.unit) setUnit(k); });
    el.append(b);
  }
}
function buildSaves() {
  const el = $('saveRows'); el.innerHTML = '';
  S.saves.forEach((sv, i) => {
    const row = document.createElement('div'); row.className = 'sr';
    const c = document.createElement('canvas'); c.width = 96; c.height = 60;
    if (sv) patternIcon(c, sv.unit, 'custom', sv.slots);
    row.innerHTML = `<b>${i + 1}</b>`;
    row.append(c);
    const lbl = document.createElement('small'); lbl.textContent = sv ? UNITS[sv.unit].short : '—'; row.append(lbl);
    const bs = document.createElement('button'); bs.textContent = '💾'; bs.title = 'Save'; bs.className = 'sv'; bs.dataset.save = i;
    bs.addEventListener('click', () => {
      S.saves[i] = { unit: S.unit, slots: S.slots.map(sl => [+(sl.f / S.D).toFixed(3), +(sl.s / S.D).toFixed(3), +sl.face.toFixed(3)]) };
      store.set('fm-saves', JSON.stringify(S.saves)); buildSaves(); toast(`💾 ${i + 1}`); vib(12);
    });
    const bl = document.createElement('button'); bl.textContent = '📂'; bl.title = 'Load'; bl.className = 'ld'; bl.dataset.load = i; bl.disabled = !sv;
    bl.addEventListener('click', () => {
      const v = S.saves[i]; if (!v) return;
      if (v.unit !== S.unit) setUnit(v.unit);
      S.custom = v.slots.map(a => a.slice()); saveCustom(); setForm('custom', true); buildFormBar();
      $('ovSave').classList.add('hidden'); toast(`📂 ${i + 1}`); vib(12);
    });
    row.append(bs, bl);
    el.append(row);
  });
}
// tutorial
const TUT = [['👥', 'Pick your unit', 'Top-left button. Para section, platoon, US squad or German Gruppe.'], ['▲', 'Tap a formation', 'Bottom buttons. ℹ explains when it was used.'], ['👆', 'Tap the ground to march', 'Drag the ➤ arrow to turn. Hold to drop waypoints first.']];
let tutI = -1;
function openTut() { tutI = 0; paintTut(); $('ovTut').classList.remove('hidden'); }
function paintTut() {
  const [ic, h, t] = TUT[tutI];
  $('tIcon').textContent = ic; $('tHead').textContent = h; $('tText').textContent = t;
  $('tDots').innerHTML = TUT.map((_, i) => `<i class="${i === tutI ? 'on' : ''}"></i>`).join('');
  $('bTutNext').textContent = tutI === TUT.length - 1 ? '✔' : '▶';
}
function closeTut() { tutI = -1; store.set('fm-tut', '1'); $('ovTut').classList.add('hidden'); }

function wire() {
  $('bUnit').addEventListener('click', () => { buildUnitPicker(); $('ovUnit').classList.remove('hidden'); });
  $('bPause').addEventListener('click', () => { S.paused = !S.paused; $('bPause').textContent = S.paused ? '▶' : '⏸'; $('bPause').classList.toggle('on', S.paused); });
  $('bSpeed').addEventListener('click', () => { S.rush = !S.rush; store.set('fm-rush', S.rush ? '1' : '0'); paintSpeed(); toast(S.rush ? '🏃 Rush' : '🚶 Walk'); });
  $('bLayers').addEventListener('click', (e) => { e.stopPropagation(); $('layers').classList.toggle('hidden'); });
  document.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.l; S.layers[k] = !S.layers[k]; store.set('fm-layers', JSON.stringify(S.layers));
    if (k === 'road') computeSlots();
    S.heatT = -1; paintLayers(); vib(6);
  }));
  $('bCenter').addEventListener('click', () => { S.follow = true; fit(); paintFollow(); });
  $('bHelp').addEventListener('click', () => $('ovHelp').classList.remove('hidden'));
  $('bHelpClose').addEventListener('click', () => $('ovHelp').classList.add('hidden'));
  $('bInfo').addEventListener('click', showInfo);
  $('bInfoClose').addEventListener('click', () => $('ovInfo').classList.add('hidden'));
  $('spacing').addEventListener('input', (e) => setD(e.target.value));
  $('bEdit').addEventListener('click', () => {
    S.edit = !S.edit; $('bEdit').classList.toggle('on', S.edit);
    if (S.edit) { S.frame.path = []; S.wps = []; updateWpUI(); toast('✏️ drag your men'); } else toast('✔');
  });
  $('bSaves').addEventListener('click', () => { buildSaves(); $('ovSave').classList.remove('hidden'); });
  $('bSaveClose').addEventListener('click', () => $('ovSave').classList.add('hidden'));
  $('bWpClear').addEventListener('click', () => { S.wps = []; updateWpUI(); });
  $('bTutNext').addEventListener('click', () => { if (tutI >= TUT.length - 1) closeTut(); else { tutI++; paintTut(); } });
  $('bTutSkip').addEventListener('click', closeTut);
  $('bTut').addEventListener('click', () => { $('ovHelp').classList.add('hidden'); openTut(); });
  document.querySelectorAll('.ov').forEach(o => o.addEventListener('click', (e) => { if (e.target === o && o.id !== 'ovTut') o.classList.add('hidden'); }));
  window.addEventListener('resize', () => { layout(); });
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));
}
function paintSpeed() { $('bSpeed').textContent = S.rush ? '🏃' : '🚶'; $('bSpeed').classList.toggle('on', S.rush); }

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!S.paused) { acc += dt; let n = 0; while (acc >= DT && n < 8) { step(); acc -= DT; n++; } if (n >= 8) acc = 0; }
  if (S.follow) {
    const L = S.men[0];
    cam.x += (L.x - cam.x) * Math.min(1, dt * 3); cam.y += (L.y - cam.y) * Math.min(1, dt * 3);
  }
  render();
  requestAnimationFrame(frame);
}

drawMap();
buildMen();
wire();
layout();
buildFormBar();
setD(S.D);
paintLayers(); paintSpeed(); paintFollow(); updateWpUI();
fit();
$('ver').textContent = VERSION;
if (store.get('fm-tut', '0') !== '1') openTut();
requestAnimationFrame(frame);

// test / debug hooks (harmless in normal play)
window.FM = {
  S, cam, view, UNITS, HOUSES, toScreen, toWorld, settled, setForm, setUnit, setD, march, fit, slotWorld, slotTarget,
  findPath, validSlot, segClear, houseAt, nearestFreeCell,
  fast(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) step(); return S.t; },
  until(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { step(); if (settled()) return S.t; } return -1; },
  mgBurst, blast, layout, render, step,
};
})();
