/* Trainer Quest core: world sim (map, trainers, traits, wild/trainer battles, catching, EXP, Bridge, save).
   No DOM; runs in node for balance sims. Battles use the Trainers engine (../trainers/game.js TR) and data
   (../trainers/doctrine.js TRDoctrine) directly; nothing about monsters, moves, types or damage is copied here. */
(function (root) {
'use strict';
const D = root.TRDoctrine, TR = root.TR, clone = D.clone;
const MW = 18, MH = 28;                       // map size in tiles
const TICK = 0.25, STEP_T = 0.5, TURN_T = 1.1, INTRO_T = 1.2, OUTRO_T = 1.2, HEAL_T = 3, DIG_T = 2, KO_T = 6;
const DOOR = { x: 9, y: 23 }, SPAWN = { x: 9, y: 22 }, BRIDGE_IN = { x: 9, y: 7 };
const OFFLINE_CAP = 2 * 3600, MAX_LV = 50;

// ---------------------------------------------------------------- areas (spawns, levels, Bridge line-up)
const AREAS = [
  { name: 'Mossy Meadow', icon: '🌲', pal: { g: '#5f9a3c', tg: '#3f7a2a', t: '#2c5a22', w: '#3f8fe4', c: '#6b5a48', r: '#4a3f33', p: '#c9b27a' },
    wild: { grass: [['gustling', 5], ['sparkit', 3], ['mossling', 4], ['pebblin', 4], ['emberpup', 2], ['vilefang', 2]], water: [['tidebolt', 4], ['shellguard', 2], ['sparkit', 1]], cave: [['pebblin', 4], ['gloomoth', 3], ['vilefang', 2], ['cindermole', 1]] },
    lv: [3, 6], npcLv: [5, 8], npcs: ['bugkid', 'bugkid', 'status'],
    bridge: { lv: [7, 8, 9, 10, 12], size: [1, 2, 2, 3, 3], ai: ['bugkid', 'bugkid', 'status', 'gambler', 'ace'] } },
  { name: 'Ember Dunes', icon: '🏜', pal: { g: '#b59a52', tg: '#8a7a2a', t: '#6a5a2a', w: '#2f7fc4', c: '#7a4a38', r: '#5a3426', p: '#e0c890' },
    wild: { grass: [['flarelynx', 3], ['thornback', 4], ['vilefang', 3], ['sporeshroom', 3], ['voltusk', 2], ['emberpup', 3]], water: [['brinemaw', 3], ['tidebolt', 3], ['shellguard', 2]], cave: [['bouldrake', 3], ['duskmaw', 3], ['cindermole', 3], ['gloomoth', 2]] },
    lv: [11, 16], npcLv: [13, 17], npcs: ['status', 'gambler', 'healer'],
    bridge: { lv: [16, 17, 18, 19, 21], size: [2, 2, 3, 3, 4], ai: ['status', 'gambler', 'healer', 'setup', 'ace'] } },
  { name: 'Frost Peak', icon: '🏔', pal: { g: '#9fb8c8', tg: '#6f94a8', t: '#3f5f72', w: '#5aa0e8', c: '#5a6270', r: '#3a404a', p: '#e8eef2' },
    wild: { grass: [['skyreaver', 3], ['voltusk', 3], ['flarelynx', 2], ['thornback', 2], ['gustling', 2], ['sparkit', 2]], water: [['brinemaw', 3], ['shellguard', 3], ['tidebolt', 2]], cave: [['cindermole', 3], ['bouldrake', 3], ['duskmaw', 3], ['sporeshroom', 2], ['gloomoth', 2]] },
    lv: [21, 27], npcLv: [23, 28], npcs: ['setup', 'ace', 'healer'],
    bridge: { lv: [27, 28, 29, 30, 32], size: [3, 3, 4, 4, 5], ai: ['gambler', 'healer', 'setup', 'status', 'ace'] } },
];
const NPC_LOOK = ['🧑‍🌾', '🧒', '🧑‍🎤', '🧙', '🥷', '🧑‍🚀'];

// ---------------------------------------------------------------- items (heal items are the Trainers ITEMS; orbs and candy are Quest-only)
const QITEMS = {
  potion: { icon: D.ITEMS.potion.icon, name: D.ITEMS.potion.name }, super: { icon: D.ITEMS.super.icon, name: D.ITEMS.super.name },
  full: { icon: D.ITEMS.full.icon, name: D.ITEMS.full.name }, revive: { icon: D.ITEMS.revive.icon, name: D.ITEMS.revive.name },
  net: { icon: '⚪', name: 'Net Orb', ball: 1 }, star: { icon: '🔵', name: 'Star Orb', ball: 1.6 }, moon: { icon: '🟣', name: 'Moon Orb', ball: 2.4 },
  candy: { icon: '🍬', name: 'Level Candy' },
};
const BALLS = ['net', 'star', 'moon'];
const FIND = { open: [['potion', 30], ['net', 30], ['star', 10], ['super', 8], ['full', 8], ['revive', 5], ['candy', 3]],
  hidden: [['star', 22], ['super', 20], ['revive', 14], ['candy', 14], ['moon', 12], ['full', 12], ['potion', 6]] };

// ---------------------------------------------------------------- traits: each one edits the trainer's doctrine (Trainers scored-planner weights) or a Quest rule
const TREES = [
  { id: 'battler', icon: '⚔', name: 'Battler', tiers: [
    { id: 'b1', icon: '🔺', name: 'Type sense', cost: 4, tip: '+type & damage weights', fn: (t) => { Object.assign(t.score, { type: 10, dmg: 0.6, ko: 25 }); t.pers.temp = 10; t.movePri.attack = 4; } },
    { id: 'b2', icon: '👁', name: 'Read the foe', cost: 8, tip: '+KO, risk, priority · knows when the Bridge is beatable', fn: (t) => { Object.assign(t.score, { ko: 50, risk: 28, prio: 18, acc: 0.25 }); t.pers.risk = 0.5; t.pers.temp = 4; } },
    { id: 'b3', icon: '🔁', name: 'Switch timing', cost: 16, tip: 'switches out of bad matchups / low HP', fn: (t) => { Object.assign(t.sw, { never: false, hp: 0.25, bad: 1, bonus: 23, penalty: 35 }); t.score.match = 10; } },
    { id: 'b4', icon: '✨', name: 'Crit focus', cost: 28, tip: '+crit, +setup', fn: (t) => { Object.assign(t.score, { crit: 10, setup: 45, status: 25 }); t.movePri.setup = 6; t.pers.temp = 2; } },
  ] },
  { id: 'catcher', icon: '🎯', name: 'Catcher', tiers: [
    { id: 'c1', icon: '🤲', name: 'Steady throw', cost: 4, tip: 'catch ×1.3 · throws when the foe is weak' },
    { id: 'c2', icon: '🪶', name: 'Weaken first', cost: 8, tip: 'avoids KOs, puts targets to sleep before throwing' },
    { id: 'c3', icon: '💎', name: 'Collector', cost: 16, tip: 'catch ×1.25 · hunts missing species & types' },
    { id: 'c4', icon: '🔮', name: 'Orb sense', cost: 28, tip: 'picks the right orb for the odds' },
  ] },
  { id: 'scout', icon: '🧭', name: 'Scout', tiers: [
    { id: 's1', icon: '👀', name: 'Keen eye', cost: 4, tip: 'walks to items it can see' },
    { id: 's2', icon: '⛏', name: 'Hidden finds', cost: 8, tip: 'spots & digs hidden items' },
    { id: 's3', icon: '🔭', name: 'Wide view', cost: 16, tip: 'sight 2→4 · explores the map' },
    { id: 's4', icon: '🦊', name: 'Fight sense', cost: 28, tip: 'avoids fights when weak, seeks them when strong' },
  ] },
  { id: 'medic', icon: '⛑', name: 'Medic', tiers: [
    { id: 'm1', icon: '🧪', name: 'First aid', cost: 4, tip: 'potions in battle at 35% HP (3/battle)', fn: (t) => { Object.assign(t.items, { healAt: 0.35, superAt: 0.25, maxPerBattle: 3 }); t.score.item = 35; } },
    { id: 'm2', icon: '🏥', name: 'Field care', cost: 8, tip: 'heals at the center early · potions after fights' },
    { id: 'm3', icon: '💊', name: 'Full care', cost: 16, tip: 'cures status, revives in battle', fn: (t) => { Object.assign(t.items, { fullHealSleep: true, fullHealOther: true, reviveAt: 1, healAt: 0.4, superAt: 0.3, maxPerBattle: 5 }); t.score.heal = 36; } },
    { id: 'm4', icon: '🌱', name: 'Herbalist', cost: 28, tip: 'party regenerates while walking · potions +50%' },
  ] },
  { id: 'coach', icon: '📣', name: 'Coach', tiers: [
    { id: 'k1', icon: '🤝', name: 'EXP share', cost: 4, tip: 'bench gets 50% EXP' },
    { id: 'k2', icon: '📚', name: 'Smart moves', cost: 8, tip: 'keeps the best 4 moves (power, coverage, utility)' },
    { id: 'k3', icon: '🎓', name: 'Tutor', cost: 16, tip: 'learns moves 3 levels early' },
    { id: 'k4', icon: '🏋', name: 'Hard training', cost: 28, tip: '+30% EXP' },
  ] },
  { id: 'leader', icon: '👑', name: 'Leader', tiers: [
    { id: 'l1', icon: '2️⃣', name: 'Duo', cost: 4, tip: 'party cap 1→2' },
    { id: 'l2', icon: '3️⃣', name: 'Trio', cost: 8, tip: 'party cap 3' },
    { id: 'l3', icon: '🔄', name: 'Rotation', cost: 16, tip: 'cap 4 · picks the best party at the center, leads with the best matchup' },
    { id: 'l4', icon: '6️⃣', name: 'Full party', cost: 28, tip: 'party cap 6' },
  ] },
];
const TRAIT = {}; for (const tr of TREES) tr.tiers.forEach((x, i) => { TRAIT[x.id] = Object.assign(x, { tree: tr.id, tier: i }); });
const has = (T, id) => !!T.traits[id];
const capOf = (T) => has(T, 'l4') ? 6 : has(T, 'l3') ? 4 : has(T, 'l2') ? 3 : has(T, 'l1') ? 2 : 1;
const sightOf = (T) => has(T, 's3') ? 4 : 2;

// untrained = Bug-kid weights (high noise, never switches, barely uses items)
function baseDoctrine() {
  const t = clone(D.PRESETS.bugkid);
  t.items = { healAt: 0.15, superAt: 0.1, reviveAt: 0, fullHealSleep: false, fullHealOther: false, maxPerBattle: 1 };
  t.pers.temp = 25; t.team = []; return t;
}
function doctrineOf(T) {
  const t = baseDoctrine();
  for (const tr of TREES) for (const x of tr.tiers) if (has(T, x.id) && x.fn) x.fn(t);
  t.id = 'tq' + T.i; t.name = T.name; t.icon = T.icon;
  return t;
}
function canBuy(T, id) { const x = TRAIT[id]; if (!x || has(T, id)) return false; const tree = TREES.find(t => t.id === x.tree); return (x.tier === 0 || has(T, tree.tiers[x.tier - 1].id)) && T.tp >= x.cost; }
function buy(W, ti, id) {
  const T = W.trainers[ti]; if (!canBuy(T, id)) return false;
  T.tp -= TRAIT[id].cost; T.traits[id] = Math.round(W.t);
  feed(W, ti, '🧬', `${TRAIT[id].icon} ${TRAIT[id].name}`);
  if (id === 'l1' || id === 'l2' || id === 'l3' || id === 'l4') fillParty(W, T);
  return true;
}

// ---------------------------------------------------------------- RNG (serializable mulberry32)
function rnd(W) { let a = W.rs = (W.rs + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const ri = (W, a, b) => a + Math.floor(rnd(W) * (b - a + 1));
const pickW = (W, list) => { let s = 0; for (const [, w] of list) s += w; let x = rnd(W) * s; for (const [k, w] of list) { if ((x -= w) < 0) return k; } return list[0][0]; };

// ---------------------------------------------------------------- learnsets: derived from each monster's movepool (default moves first, weakest attack at Lv1)
const LEARN = {};
for (const id of D.MON_IDS) {
  const d = D.DEX[id], pw = (m) => D.MOVES[m].pow;
  const atk = d.moves.filter(pw).sort((a, b) => pw(a) - pw(b)), sta = d.moves.filter(m => !pw(m));
  const def = [atk[0], ...(sta.length ? [sta[0]] : []), ...atk.slice(1), ...sta.slice(1)].slice(0, 4);
  const extra = d.pool.filter(m => !def.includes(m)).sort((a, b) => pw(a) - pw(b));
  LEARN[id] = [...def.map((m, i) => [[1, 1, 8, 13][i], m]), ...extra.map((m, i) => [[17, 22, 27][i], m])];
}
const movesAt = (id, lv) => LEARN[id].filter(([l]) => l <= lv).map(([, m]) => m).slice(-4);
const expFor = (lv) => lv * lv * lv;                  // total EXP to reach lv
const bst = (id) => Object.values(D.DEX[id].base).reduce((a, b) => a + b, 0);
let EXP_K = 40, EXP_POW = 3.5;

// ---------------------------------------------------------------- monsters (persistent; the same objects are engine battlers)
function hydrate(m) {
  const d = D.DEX[m.id], st = {};
  for (const k of Object.keys(d.base)) st[k] = TR.calcStat(d.base[k], k === 'hp', m.lv);
  m.name = d.name; m.type = d.type; m.st = st; m.max = st.hp;
  if (m.hp == null || m.hp > m.max) m.hp = m.max;
  m.status = m.status || null; m.slp = m.slp || 0; m.cnf = 0;
  m.stg = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0, crit: 0 };
  return m;
}
function newMon(W, id, lv) { return hydrate({ uid: ++W.uid, id, lv, exp: expFor(lv), moves: movesAt(id, lv), hp: null }); }
const strip = (m) => ({ uid: m.uid, id: m.id, lv: m.lv, exp: m.exp, moves: m.moves, hp: m.hp, status: m.status, slp: m.slp, ot: m.ot });

// move-set value, used by Coach II (Smart moves) to choose the 4 to keep
function moveVal(m, id) {
  const mv = D.MOVES[id];
  if (mv.pow) return mv.pow * (mv.acc || 100) / 100 * (mv.type === m.type ? 1.5 : 1) + (mv.pri ? 12 : 0) + (mv.st ? 25 * mv.st[1] : 0) + (mv.crit ? 6 : 0);
  return mv.st ? (mv.st[0] === 'slp' ? 55 : 40) * (mv.acc || 100) / 100 : mv.heal || mv.rest ? 42 : mv.boost ? 38 : 20;
}
function setVal(m, set) {
  let v = 0; const types = new Set(); let atk = 0, util = 0;
  for (const id of set) { const mv = D.MOVES[id]; if (mv.pow) { atk++; types.add(mv.type || 'n'); v += moveVal(m, id); } else if (util++ < 2) v += moveVal(m, id); }
  return v + types.size * 20 - (atk ? 0 : 400) - (atk === 1 ? 40 : 0);
}
function learn(W, T, m, mv) {
  if (m.moves.includes(mv)) return;
  const nm = D.MOVES[mv].name;
  if (m.moves.length < 4) { m.moves.push(mv); feed(W, T.i, '📖', `${m.name} +${nm}`, { mon: m.id }); return; }
  let drop;
  if (has(T, 'k2')) {
    let best = -1e9; for (let i = -1; i < 4; i++) { const s = i < 0 ? m.moves : m.moves.map((x, j) => j === i ? mv : x); const v = setVal(m, s); if (v > best) { best = v; drop = i; } }
    why(W, T, `📚 ${m.name}`, [{ label: drop < 0 ? 'skip ' + nm : nm, s: best }, { label: 'keep set', s: setVal(m, m.moves) }], drop < 0 ? 'set already best' : `drops ${D.MOVES[m.moves[drop]].name}`);
  } else drop = rnd(W) < 0.5 ? -1 : ri(W, 0, 3);
  if (drop < 0) { feed(W, T.i, '🚫', `${m.name} ✗${nm}`, { mon: m.id }); return; }
  const old = D.MOVES[m.moves[drop]].name; m.moves[drop] = mv;
  feed(W, T.i, '📖', `${m.name} ${old}→${nm}`, { mon: m.id });
}
function gainExp(W, T, m, amt) {
  if (m.lv >= MAX_LV) return;
  m.exp += amt; W.stats.exp += amt;
  while (m.lv < MAX_LV && m.exp >= expFor(m.lv + 1)) {
    const oldMax = m.max; m.lv++; hydrate(m); m.hp = Math.min(m.max, m.hp + (m.max - oldMax));
    W.stats.lv++; feed(W, T.i, '⬆', `${m.name} Lv${m.lv}`, { mon: m.id });
    const early = has(T, 'k3') ? 3 : 0;
    for (const [l, mv] of LEARN[m.id]) if (l === m.lv + early || (early && l <= m.lv + early && !m.moves.includes(mv) && l > m.lv - 1 + early)) learn(W, T, m, mv);
  }
}

// ---------------------------------------------------------------- map generation (per area, from the run seed)
const WALK = new Set(['.', '"', '~', 'c', '=']);
const ENC = { '"': 'grass', '~': 'water', 'c': 'cave' };
function genMap(seed, area) {
  for (let tries = 0; tries < 50; tries++) {
    const r = TR.mulberry(seed * 31 + area * 7919 + tries * 104729);
    const g = []; for (let y = 0; y < MH; y++) g.push(new Array(MW).fill('.'));
    const set = (x, y, c, only) => { if (x > 0 && y > 0 && x < MW - 1 && y < MH - 1 && (!only || only.includes(g[y][x]))) g[y][x] = c; };
    for (let y = 0; y < MH; y++) { g[y][0] = g[y][MW - 1] = 'T'; } for (let x = 0; x < MW; x++) { g[0][x] = 'T'; g[MH - 1][x] = 'T'; }
    for (let y = 2; y <= 6; y++) for (let x = 1; x < MW - 1; x++) g[y][x] = 'W';
    for (let y = 2; y <= 6; y++) g[y][9] = 'B';
    g[0][9] = 'G'; g[1][9] = '=';
    for (let y = 24; y <= 25; y++) for (let x = 8; x <= 10; x++) g[y][x] = 'H';
    // blobs
    const blob = (cx, cy, rad, c, only) => { for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 4; x <= cx + 4; x++) if (Math.hypot((x - cx) * 0.9, y - cy) <= rad + r() * 0.6) set(x, y, c, only); };
    const side = r() < 0.5 ? 0 : 1, cx0 = side ? MW - 7 : 1;
    for (let y = 9; y <= 15; y++) for (let x = cx0; x < cx0 + 6; x++) set(x, y, (y === 9 || y === 15 || x === cx0 || x === cx0 + 5) ? 'R' : 'c');
    set(side ? cx0 : cx0 + 5, 12, 'c'); set(side ? cx0 : cx0 + 5, 13, 'c');
    for (let i = 0; i < 4; i++) { const x = cx0 + 1 + Math.floor(r() * 4), y = 10 + Math.floor(r() * 5); if (!(y === 12 || y === 13)) set(x, y, 'R'); }
    blob(side ? 4 : MW - 5, 18 + Math.floor(r() * 3), 1.6, '~', ['.']);
    for (let i = 0; i < 6; i++) blob(2 + Math.floor(r() * (MW - 4)), 8 + Math.floor(r() * 14), 1.2 + r() * 1.3, '"', ['.']);
    blob(side ? 13 : 4, 25, 1.4, '"', ['.']);
    // path center -> bridge
    let x = 9; for (let y = 23; y >= 7; y--) { g[y][x] = '='; if (y < 22 && y > 8 && r() < 0.3) { const nx = Math.max(6, Math.min(12, x + (r() < 0.5 ? -1 : 1))); g[y][nx] = '='; x = nx; } }
    g[7][9] = '='; g[8][9] = '=';
    for (let y = 1; y < MH - 1; y++) for (let x2 = 1; x2 < MW - 1; x2++) if (g[y][x2] === '.' && r() < 0.08 && Math.abs(x2 - 9) > 1) g[y][x2] = 'T';
    for (let x2 = 1; x2 < MW - 1; x2++) if (g[1][x2] === '.' && r() < 0.5) g[1][x2] = 'T';
    // connectivity: every walkable tile below the water must be reachable from the spawn
    const m = { g, seed, area }; const d = bfs(m, SPAWN);
    let ok = d[BRIDGE_IN.y * MW + BRIDGE_IN.x] >= 0, bad = 0;
    for (let y = 7; y < MH; y++) for (let x2 = 0; x2 < MW; x2++) if (WALK.has(g[y][x2]) && d[y * MW + x2] < 0) bad++;
    if (!ok || bad > 6) continue;
    for (let y = 7; y < MH; y++) for (let x2 = 0; x2 < MW; x2++) if (WALK.has(g[y][x2]) && d[y * MW + x2] < 0) g[y][x2] = 'T';
    return m;
  }
  throw new Error('map gen failed');
}
const walk = (M, x, y) => x >= 0 && y >= 0 && x < MW && y < MH && WALK.has(M.g[y][x]) && y >= 7;
function bfs(M, from) {
  const d = new Int16Array(MW * MH).fill(-1), q = [from.y * MW + from.x]; d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % MW, y = (i / MW) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (walk(M, nx, ny) && d[ny * MW + nx] < 0) { d[ny * MW + nx] = d[i] + 1; q.push(ny * MW + nx); } } }
  return d;
}
// cheapest path; cost per tile (Scout IV avoids encounter tiles/trainers when weak)
function path(M, from, to, costFn) {
  const N = MW * MH, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const s = from.y * MW + from.x, t = to.y * MW + to.x; dist[s] = 0;
  for (;;) {
    let i = -1, b = Infinity; for (let k = 0; k < N; k++) if (!done[k] && dist[k] < b) { b = dist[k]; i = k; }
    if (i < 0 || i === t) break; done[i] = 1;
    const x = i % MW, y = (i / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!walk(M, nx, ny)) continue; const j = ny * MW + nx, c = b + (costFn ? costFn(nx, ny) : 1); if (c < dist[j]) { dist[j] = c; prev[j] = i; } }
  }
  if (!isFinite(dist[t])) return null;
  const out = []; for (let i = t; i !== s; i = prev[i]) out.unshift({ x: i % MW, y: (i / MW) | 0 });
  return out;
}

// ---------------------------------------------------------------- world
const maps = {};
function mapOf(W, a = W.area) { const k = W.seed + ':' + a; return maps[k] || (maps[k] = genMap(W.seed, a)); }
const STARTERS = ['emberpup', 'tidebolt', 'mossling', 'sparkit', 'pebblin', 'gustling'];
function newWorld(o = {}) {
  const seed = o.seed == null ? (Math.random() * 1e9) | 0 : o.seed;
  const W = { v: 1, seed, rs: seed ^ 0x5bd1e995, t: 0, area: 0, best: 0, uid: 0, nb: 0, champion: false, box: [], dex: {}, feed: [], why: [], flags: [null, null],
    bag: { potion: 3, super: 0, full: 0, revive: 0, net: 5, star: 0, moon: 0, candy: 0 },
    stats: { wins: 0, losses: 0, catches: 0, throws: 0, finds: 0, lv: 0, exp: 0, tp: 0, bridgeTries: 0, bridgeWins: 0, npcWins: 0, wild: 0 },
    trainers: [], areas: [], log: [] };
  const st = o.starters || [];
  [['Kai', '🧢', '#ff7a45'], ['Mia', '🎀', '#4fc3f7']].forEach(([name, icon, col], i) => {
    const sid = STARTERS.includes(st[i]) ? st[i] : STARTERS[ri(W, 0, STARTERS.length - 1)];
    const T = { i, name, icon, col, x: SPAWN.x + (i ? 1 : -1), y: SPAWN.y, path: [], state: 'idle', busy: 0, tp: 4, tpAll: 0, traits: {}, party: [], goal: null, cool: 0, steps: 0, battle: null, bridge: null };
    const m = newMon(W, sid, 5); m.ot = i; T.party.push(m); seen(W, sid, true);
    W.trainers.push(T);
  });
  initArea(W, 0);
  return W;
}
function initArea(W, a) {
  const M = mapOf(W, a), r = TR.mulberry(W.seed + a * 77), A = AREAS[a];
  const tiles = []; for (let y = 8; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) if (walk(M, x, y) && M.g[y][x] !== '=' && Math.abs(x - SPAWN.x) + Math.abs(y - SPAWN.y) > 3) tiles.push({ x, y });
  const take = () => tiles.splice(Math.floor(r() * tiles.length), 1)[0];
  const spots = [];
  for (let i = 0; i < 8; i++) spots.push(Object.assign(take(), { h: 0, next: 0 }));
  const cave = tiles.filter(p => M.g[p.y][p.x] === 'c' || M.g[p.y][p.x] === '"');
  for (let i = 0; i < 6; i++) { const p = (cave.length && r() < 0.6) ? cave.splice(Math.floor(r() * cave.length), 1)[0] : take(); const k = tiles.indexOf(p); if (k >= 0) tiles.splice(k, 1); spots.push(Object.assign({ x: p.x, y: p.y }, { h: 1, next: 0 })); }
  const npcs = A.npcs.map((ai, i) => { let p; do { p = take(); } while (p.y > 19 && tiles.length > 10); return { i, ai, look: NPC_LOOK[(a * 3 + i) % NPC_LOOK.length], x: p.x, y: p.y, hx: p.x, hy: p.y, rest: 0, mv: 0, wins: 0 }; });
  W.areas[a] = { rev: new Array(MW * MH).fill(0), spots, npcs, cleared: false, tries: 0 };
  for (const T of W.trainers) { T.x = SPAWN.x + (T.i ? 1 : -1); T.y = SPAWN.y; T.path = []; T.goal = null; reveal(W, T); }
}
function reveal(W, T) { const R = W.areas[W.area].rev, s = sightOf(T); for (let y = T.y - s; y <= T.y + s; y++) for (let x = T.x - s; x <= T.x + s; x++) if (x >= 0 && y >= 0 && x < MW && y < MH && Math.abs(x - T.x) + Math.abs(y - T.y) <= s + 1) R[y * MW + x] = 1; }
function seen(W, id, caught) { const e = W.dex[id] || (W.dex[id] = { seen: 0, caught: 0 }); e.seen++; if (caught) e.caught++; }
function feed(W, ti, icon, text, o = {}) { W.feed.push(Object.assign({ t: W.t, ti, icon, text }, o)); if (W.feed.length > 150) W.feed.splice(0, W.feed.length - 150); if (W.sink) W.sink.push(Object.assign({ ti, icon }, o)); }
function why(W, T, head, top, note) { W.why.push({ t: W.t, ti: T.i, head, top: top.map(o => ({ label: o.label, s: Math.round(o.s) })), note }); if (W.why.length > 120) W.why.splice(0, W.why.length - 120); }
function addTp(W, T, n, icon) { T.tp += n; T.tpAll += n; W.stats.tp += n; if (icon) feed(W, T.i, '✨', `+${n} TP ${icon}`); }

const partyHp = (T) => { let h = 0, m = 0; for (const x of T.party) { h += x.hp; m += x.max; } return m ? h / m : 0; };
const avgLv = (T) => T.party.reduce((a, m) => a + m.lv, 0) / Math.max(1, T.party.length);
const lead = (T) => T.party.find(m => m.hp > 0);
const owned = (W, id) => (W.dex[id] && W.dex[id].caught) > 0;
function fillParty(W, T) {
  const cap = capOf(T);
  while (T.party.length < cap) {
    const mine = W.box.filter(m => m.ot === T.i).sort((a, b) => b.lv - a.lv)[0];
    if (!mine) break; W.box.splice(W.box.indexOf(mine), 1); T.party.push(mine); feed(W, T.i, '🐾', `${mine.name} joins`, { mon: mine.id });
  }
}
// Leader III: at the center, rebuild the party from party + own box (levels, type coverage)
function rotate(W, T) {
  const pool = [...T.party, ...W.box.filter(m => m.ot === T.i)], cap = capOf(T), out = [];
  pool.sort((a, b) => b.lv - a.lv);
  while (out.length < cap && pool.length) {
    const types = new Set(out.map(m => m.type));
    pool.sort((a, b) => (b.lv + (types.has(b.type) ? 0 : 3)) - (a.lv + (types.has(a.type) ? 0 : 3)));
    out.push(pool.shift());
  }
  const changed = out.some(m => !T.party.includes(m));
  W.box = W.box.filter(m => !out.includes(m)); for (const m of T.party) if (!out.includes(m)) W.box.push(m);
  T.party = out;
  if (changed) feed(W, T.i, '🔄', out.map(m => m.name).join(' · '));
}

// ---------------------------------------------------------------- battles (resolved at once, then replayed by the UI over their duration)
function wildTr() { const t = baseDoctrine(); t.items.maxPerBattle = 0; t.name = 'Wild'; t.icon = '🌿'; return t; }
function npcTeam(W, A, n, lvs) { const all = [...A.wild.grass, ...A.wild.water, ...A.wild.cave].map(([k]) => k); const out = []; for (let i = 0; i < n; i++) { const id = all[ri(W, 0, all.length - 1)]; out.push(newMon(W, id, Array.isArray(lvs) ? ri(W, lvs[0], lvs[1]) : lvs)); } return out; }
function npcTr(ai, name, icon, bag) { const t = clone(D.PRESETS[ai]); t.name = name; t.icon = icon; t.bag = bag || { potion: 0, super: 0, full: 0, revive: 0 }; return t; }
function catchChance(W, T, f, ball) {
  const hpF = f.hp / f.max, lvl = lead(T) ? lead(T).lv : 1;
  let p = Math.min(1.2, 360 / bst(f.id)) * 0.42 * (3 - 2 * hpF) / 3;
  p *= f.status === 'slp' ? 2 : f.status ? 1.5 : 1;
  p *= QITEMS[ball].ball;
  if (has(T, 'c1')) p *= 1.3; if (has(T, 'c3')) p *= 1.25;
  p *= Math.max(0.4, 1 - 0.04 * Math.max(0, f.lv - lvl));
  return Math.max(0.02, Math.min(0.97, p));
}
function wantsCatch(W, T, f) {
  if (!BALLS.some(b => W.bag[b] > 0)) return 0;
  if (!owned(W, f.id)) return 1;
  if (T.party.length < capOf(T) && !T.party.some(m => m.id === f.id)) return has(T, 'c1') ? 0.8 : 0.4;
  if (has(T, 'c3')) { const types = new Set([...T.party, ...W.box].map(m => m.type)); return types.has(f.type) ? (W.box.length < 30 && f.lv > avgLv(T) ? 0.3 : 0) : 0.8; }
  return has(T, 'c1') ? 0 : 0.15;
}
function pickBall(W, T, f) {
  const have = BALLS.filter(b => W.bag[b] > 0);
  if (!has(T, 'c4')) return have[0];
  for (const b of have) if (catchChance(W, T, f, b) >= 0.5) return b;
  return have[have.length - 1];
}
function runFight(W, T, foe, kind, o = {}) {
  const B = { n: 6, seed: (W.seed + (++W.nb) * 7919) | 0, turn: 0, over: false, winner: -1, why: [], ev: [], fast: !!W.fast, noWhy: false };
  B.rng = TR.mulberry(B.seed);
  const me = { tr: doctrineOf(T), team: T.party, act: Math.max(0, T.party.findIndex(m => m.hp > 0)), bag: W.bag, used: 0 };
  B.sides = [me, { tr: foe.tr, team: foe.team, act: 0, bag: foe.tr.bag || {}, used: 0 }];
  // Leader III leads with the best matchup
  if (has(T, 'l3')) { let b = me.act, bs = -1e9; T.party.forEach((m, i) => { if (m.hp > 0) { const s = TR.matchup(m, foe.team[0]) + m.hp / m.max; if (s > bs) { bs = s; b = i; } } }); me.act = b; }
  const turns = [], parts = new Set([me.act]), wild = kind === 'wild', f0 = foe.team[0];
  const catchMode = wild && has(T, 'c2') && wantsCatch(W, T, f0) >= 0.5 && rnd(W) < 0.9;
  if (catchMode) { const t = me.tr; t.score.ko = -70; t.score.dmg = 0.25; t.score.status = 45; t.score.risk = 10; t.movePri.status = 12; }
  let caught = null, thrown = 0;
  const snap0 = TR.snap(B);
  while (!B.over && B.turn < 40) {
    let pre = [], myCh = null;
    if (wild && !caught && BALLS.some(b => W.bag[b] > 0) && TR.act(me).hp > 0) {
      const w = wantsCatch(W, T, f0), hpF = f0.hp / f0.max;
      let go = false;
      if (w > 0) {
        const ball = pickBall(W, T, f0), p = catchChance(W, T, f0, ball);
        const willKo = TR.bestThreat(TR.act(me), f0).ko > 0.6;   // next hit would KO: throw now or lose the chance
        if (has(T, 'c2')) go = p >= 0.45 || (hpF <= 0.3 && f0.status) || hpF <= 0.15 || (willKo && !catchMode);
        else if (has(T, 'c1')) go = p >= 0.4 || hpF <= 0.5 || willKo;
        else go = rnd(W) < 0.3 * w;
        if (go && rnd(W) < w) {
          W.bag[ball]--; thrown++; W.stats.throws++;
          const ok = rnd(W) < p, shakes = ok ? 3 : Math.min(2, Math.floor(rnd(W) * 3 * (0.4 + p)));
          pre.push({ t: 'throw', side: 0, ball, p, shakes, ok, mon: f0.name });
          if (B.turn < 30) why(W, T, `🎯 ${f0.name} ${Math.round(hpF * 100)}%`, [{ label: QITEMS[ball].name, s: p * 100 }, { label: 'attack', s: (1 - p) * 60 }], `${Math.round(p * 100)}% catch`);
          if (ok) caught = f0;
          myCh = { kind: 'item', item: '__throw' };
        }
      }
    }
    if (caught) { B.turn++; B.ev = pre; B.over = true; B.winner = 0; pre.push({ t: 'end', winner: 0, caught: 1 }); if (!B.fast) for (const e of pre) e.snap = TR.snap(B); turns.push(pre); break; }
    if (!B.fast) for (const e of pre) e.snap = TR.snap(B);
    TR.turn(B, [myCh, null]);
    for (const si of [0, 1]) if (TR.needsReplace(B, si)) TR.replace(B, si);
    parts.add(me.act);
    turns.push(pre.concat(B.ev));
  }
  if (!B.over) { B.over = true; B.winner = -1; turns[turns.length - 1].push({ t: 'end', winner: -1 }); }
  // my side's battle Why rows (Trainers format)
  for (const w of B.why) if (w.side === 0) W.why.push({ t: W.t, ti: T.i, bw: w, line: TR.whyLine(w) });
  if (W.why.length > 120) W.why.splice(0, W.why.length - 120);
  for (const m of T.party) { m.stg = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0, crit: 0 }; m.cnf = 0; if (m.status === 'slp') { m.status = null; m.slp = 0; } }
  return { B, turns, parts, caught, thrown, snap0, win: B.winner === 0 };
}
function award(W, T, res, foeTeam, mult) {
  const { parts } = res; let total = 0;
  for (const f of foeTeam) if (f.hp <= 0 || res.caught === f) total += Math.floor(bst(f.id) * f.lv / EXP_K * mult);
  if (has(T, 'k4')) total = Math.floor(total * 1.3);
  const n = [...parts].filter(i => T.party[i] && T.party[i].hp > 0).length || 1;
  const fl = foeTeam.reduce((x, f) => Math.max(x, f.lv), 1);
  // level scaling: farming far weaker foes gives little EXP
  T.party.forEach((m, i) => { if (m.hp <= 0) return; const share = parts.has(i) ? 1 / n : has(T, 'k1') ? 0.5 : 0; const sc = Math.pow((2 * fl + 10) / (fl + m.lv + 10), EXP_POW); if (share) gainExp(W, T, m, Math.max(1, Math.floor(total * share * sc))); });
}
function startBattle(W, T, kind, foe, extra = {}) {
  const res = runFight(W, T, foe, kind);
  const dur = INTRO_T + res.turns.length * TURN_T + OUTRO_T;
  T.state = 'battle'; T.busy = W.t + dur; T.path = [];
  T.battle = { kind, start: W.t, dur, turns: res.turns, snap0: res.snap0, me: T.party.map(m => ({ id: m.id, name: m.name, lv: m.lv, max: m.max })), foe: foe.team.map(m => ({ id: m.id, name: m.name, lv: m.lv, max: m.max })), foeName: foe.tr.name, foeIcon: foe.tr.icon, win: res.win, caught: !!res.caught, ball: (res.turns.flat().filter(e => e.t === 'throw').pop() || {}).ball, idx: extra.idx };
  return res;
}
function partyDown(W, T) { return !T.party.some(m => m.hp > 0); }
function whiteout(W, T, why_) {
  W.stats.losses++;
  for (const m of T.party) { m.hp = m.max; m.status = null; m.slp = 0; }
  feed(W, T.i, '😵', why_ || 'blacked out → 🏥');
  T.pendingTp = 0; T.x = DOOR.x + (T.i ? 1 : -1); T.y = DOOR.y - 1; T.path = []; T.goal = null;
  T.state = 'ko'; T.busy = Math.max(T.busy, W.t) + KO_T;
}
function afterFight(W, T) {
  // Medic II: potions on hurt party members after the fight
  if (has(T, 'm2')) for (const m of T.party) if (m.hp > 0 && m.hp / m.max < 0.4) {
    const k = W.bag.super > 0 && m.max - m.hp > 90 ? 'super' : W.bag.potion > 0 ? 'potion' : W.bag.super > 0 ? 'super' : null; if (!k) break;
    W.bag[k]--; const h = Math.min(m.max - m.hp, Math.floor(D.ITEMS[k].heal * (has(T, 'm4') ? 1.5 : 1))); m.hp += h; feed(W, T.i, QITEMS[k].icon, `${m.name} +${h}`, { mon: m.id });
  }
}
function wildBattle(W, T, terrain) {
  const A = AREAS[W.area], id = pickW(W, A.wild[terrain]), lv = ri(W, A.lv[0], A.lv[1]);
  const f = newMon(W, id, lv); seen(W, id, false); W.stats.wild++;
  const res = startBattle(W, T, 'wild', { tr: wildTr(), team: [f] });
  T.after = () => {
    if (res.caught) {
      f.ot = T.i; f.status = f.status === 'slp' ? null : f.status; f.stg = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0, crit: 0 };
      W.dex[id].caught++; W.stats.catches++;
      if (T.party.length < capOf(T)) T.party.push(f); else W.box.push(f);
      feed(W, T.i, '🎯', `${f.name} Lv${f.lv}${T.party.includes(f) ? '' : ' → 📦'}`, { mon: id, big: 1 });
      award(W, T, res, [f], 0.6); addTp(W, T, 2);
    } else if (res.win) { W.stats.wins++; feed(W, T.i, '⚔', `${f.name} Lv${f.lv} ✔`, { mon: id }); award(W, T, res, [f], 1); if (f.lv >= avgLv(T) - 2) addTp(W, T, 1); }   // no TP for farming far weaker monsters
    else if (partyDown(W, T)) whiteout(W, T);
    else feed(W, T.i, '💨', `${f.name} fled`, { mon: id });
    afterFight(W, T);
  };
}
function npcBattle(W, T, n) {
  const A = AREAS[W.area], lvl = A.npcLv[0] + Math.min(A.npcLv[1] - A.npcLv[0], n.wins);
  const team = npcTeam(W, A, 1 + (n.i % 2) + (W.area ? 1 : 0), [lvl - 1, lvl]);
  const res = startBattle(W, T, 'npc', { tr: npcTr(n.ai, 'Trainer', n.look, { potion: 1, super: 0, full: 0, revive: 0 }), team });
  n.rest = W.t + 150; T.after = () => {
    if (res.win) { W.stats.wins++; W.stats.npcWins++; n.wins++; feed(W, T.i, '🏅', `${n.look} beaten`, { big: 1 }); award(W, T, res, team, 1.5); addTp(W, T, 3); W.bag.potion += rnd(W) < 0.5 ? 1 : 0; }
    else if (partyDown(W, T)) whiteout(W, T, `${n.look} won → 🏥`); else feed(W, T.i, '🤝', `${n.look} draw`);
    afterFight(W, T);
  };
}
// the Bridge: 5 trainers in a row, no healing between (items allowed)
function bridgeTeams(W, a) { const A = AREAS[a], r = TR.mulberry(W.seed * 3 + a * 101); const all = [...A.wild.grass, ...A.wild.water, ...A.wild.cave].map(([k]) => k);
  return A.bridge.lv.map((lv, k) => ({ ai: A.bridge.ai[k], team: Array.from({ length: A.bridge.size[k] }, () => all[Math.floor(r() * all.length)]).map((id, j) => ({ id, lv: lv - (j < A.bridge.size[k] - 1 ? 1 : 0) })) })); }
const bridgeLv = (a) => AREAS[a].bridge.lv.reduce((x, y) => x + y, 0) / 5;
function bridgeStep(W, T) {
  const k = T.bridge.idx, spec = bridgeTeams(W, W.area)[k], A = AREAS[W.area];
  const team = spec.team.map(s => newMon(W, s.id, s.lv));
  T.x = 9; T.y = 6 - k + 1; // stands just south of the next bridge trainer
  const res = startBattle(W, T, 'bridge', { tr: npcTr(spec.ai, `Bridge ${k + 1}/5`, ['🥉', '🥈', '🥇', '🎖', '👑'][k], k === 4 ? { potion: 2, super: 1, full: 0, revive: 0 } : { potion: k > 1 ? 1 : 0, super: 0, full: 0, revive: 0 }), team }, { idx: k });
  T.after = () => {
    if (res.win) {
      award(W, T, res, team, 1.5); addTp(W, T, 2); W.areas[W.area].best = Math.max(W.areas[W.area].best || 0, k + 1);
      feed(W, T.i, '🌉', `${k + 1}/5 ✔`, { big: 1 });
      if (k === 4) {
        W.stats.bridgeWins++; addTp(W, T, 10, '🌉'); W.areas[W.area].cleared = true; W.log.push({ t: W.t, ev: 'bridge', area: W.area, ti: T.i });
        T.bridge = null;
        if (W.area < AREAS.length - 1) { W.unlock = { at: W.t + 1.5, to: W.area + 1 }; feed(W, T.i, '🎉', `${AREAS[W.area + 1].icon} ${AREAS[W.area + 1].name} unlocked`, { big: 1 }); }
        else { W.champion = true; feed(W, T.i, '🏆', 'Champion!', { big: 1 }); }
        for (const m of T.party) { m.hp = m.max; m.status = null; }
      } else T.bridge.idx++;
    } else {
      T.bridge = null; T.cool = W.t + 90; W.log.push({ t: W.t, ev: 'bridgefail', area: W.area, ti: T.i, k });
      whiteout(W, T, `🌉 ${k + 1}/5 ✖ → 🏥`);
    }
  };
}

// ---------------------------------------------------------------- trainer decisions (a scored planner like the battle AI; rows go to the Why log)
function decide(W, T) {
  const M = mapOf(W), AR = W.areas[W.area], A = AREAS[W.area], hp = partyHp(T), down = T.party.filter(m => m.hp <= 0).length, sight = sightOf(T);
  const opts = [], dist = bfs(M, T);
  const d = (p) => dist[p.y * MW + p.x];
  const strong = hp > 0.6 && avgLv(T) >= A.lv[1] - 1;
  // heal
  let hs = has(T, 'm2') ? 150 * (1 - hp) + 35 * down + (hp < 0.5 ? 30 : 0) : (hp < 0.2 || (lead(T) && lead(T) !== T.party[0] && hp < 0.4) ? 90 : 0) + 25 * (1 - hp);
  if (hp >= 0.999) hs = -100;
  opts.push({ label: '🏥 heal', s: hs, k: 'heal', why: `HP ${Math.round(hp * 100)}%` });
  // the Bridge
  if (!AR.cleared && !(W.unlock) && W.t >= T.cool && !W.trainers.some(o => o !== T && o.bridge)) {
    const gap = avgLv(T) - bridgeLv(W.area) + (T.party.length - 2) * 1.2;
    let s = has(T, 'b2') ? (gap >= 0 && hp > 0.9 ? 95 + 8 * gap : -40) : (hp > 0.7 ? 18 + 7 * gap + 12 * rnd(W) : -20);
    const fl = W.flags[T.i]; if (fl && fl.y <= 7 && Math.abs(fl.x - 9) <= 2) s += 250;
    opts.push({ label: '🌉 bridge', s, k: 'bridge', why: `Lv ${avgLv(T).toFixed(1)} vs ${bridgeLv(W.area).toFixed(1)}` });
  }
  // items (Scout I: open items in sight; Scout II: hidden spots in sight)
  if (has(T, 's1') || has(T, 's2')) {
    let best = null;
    for (const p of AR.spots) { if (p.next > W.t || d(p) < 0) continue; if (p.h ? !has(T, 's2') : !has(T, 's1')) continue; if (Math.abs(p.x - T.x) + Math.abs(p.y - T.y) > sight + 3) continue; if (W.trainers.some(o => o !== T && o.goal && o.goal.x === p.x && o.goal.y === p.y)) continue; const s = (p.h ? 62 : 68) - 3 * d(p); if (!best || s > best.s) best = { s, p }; }
    if (best) opts.push({ label: best.p.h ? '⛏ dig' : '🎁 item', s: best.s, k: 'item', spot: best.p, why: `${d(best.p)} tiles` });
  }
  // the player's flag
  const fl = W.flags[T.i]; if (fl) opts.push({ label: '🚩 flag', s: 80 - (hp < 0.3 ? 40 : 0), k: 'flag', why: 'you asked' });
  // fight / explore / wander
  let fs = 40; if (has(T, 's4')) fs += strong ? 20 : hp < 0.5 ? -50 : 0;
  if (has(T, 'c3')) { const miss = Object.values(A.wild).flat().some(([id]) => !owned(W, id)); if (miss) fs += 10; }
  opts.push({ label: '🌿 fight', s: fs, k: 'fight', why: strong ? 'strong' : `HP ${Math.round(hp * 100)}%` });
  const unrev = AR.rev.filter((v, i) => !v && walk(M, i % MW, (i / MW) | 0)).length;
  if (unrev) opts.push({ label: '🗺 explore', s: 28 + (has(T, 's3') ? 22 : 0), k: 'explore', why: `${unrev} unseen` });
  opts.push({ label: '🚶 wander', s: 22, k: 'wander', why: '' });
  const temp = has(T, 's1') ? 4 : 12;
  for (const o of opts) o.p = o.s + temp * -Math.log(-Math.log(Math.max(1e-9, rnd(W))));
  const pick = opts.slice().sort((a, b) => b.p - a.p)[0];
  why(W, T, `🧭 ${T.name}`, opts.slice().sort((a, b) => b.s - a.s).slice(0, 3), (pick !== opts.slice().sort((a, b) => b.s - a.s)[0] ? '🎲 ' : '') + pick.label + (pick.why ? ` (${pick.why})` : ''));
  // turn the pick into a target tile
  const walkables = []; for (let y = 7; y < MH; y++) for (let x = 0; x < MW; x++) if (walk(M, x, y) && d({ x, y }) >= 0) walkables.push({ x, y });
  const near = (c, r, pref) => { let c2 = walkables.filter(p => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) <= r); const pf = pref ? c2.filter(pref) : []; if (pf.length) c2 = pf; return c2.length ? c2[ri(W, 0, c2.length - 1)] : null; };
  const encT = (p) => !!ENC[M.g[p.y][p.x]];
  let goal = null;
  if (pick.k === 'heal') goal = { x: DOOR.x, y: DOOR.y, k: 'heal' };
  else if (pick.k === 'bridge') goal = { x: BRIDGE_IN.x, y: BRIDGE_IN.y, k: 'bridge' };
  else if (pick.k === 'item') goal = { x: pick.spot.x, y: pick.spot.y, k: 'item' };
  else if (pick.k === 'flag') goal = near(fl, 2, has(T, 's4') ? (strong ? encT : (p) => !encT(p)) : null) || { x: T.x, y: T.y };
  else if (pick.k === 'fight') {
    let pref = encT;
    if (has(T, 'c3')) { const missT = Object.keys(A.wild).filter(k => A.wild[k].some(([id]) => !owned(W, id))); if (missT.length) { const tk = missT[ri(W, 0, missT.length - 1)]; pref = (p) => ENC[M.g[p.y][p.x]] === tk; } }
    const c = walkables.filter(pref); goal = c.length ? c[ri(W, 0, c.length - 1)] : null;
  } else if (pick.k === 'explore') { const c = walkables.filter(p => { for (let y = p.y - 1; y <= p.y + 1; y++) for (let x = p.x - 1; x <= p.x + 1; x++) if (x >= 0 && y >= 0 && x < MW && y < MH && !AR.rev[y * MW + x]) return true; return false; }); c.sort((a, b) => d(a) - d(b)); goal = c.length ? c[Math.min(c.length - 1, ri(W, 0, 4))] : null; }
  if (!goal) goal = near(T, 5) || { x: T.x, y: T.y };
  if (!goal.k) goal.k = pick.k;
  setGoal(W, T, goal);
}
function setGoal(W, T, goal) {
  const M = mapOf(W), weak = has(T, 's4') && partyHp(T) < 0.5;
  const npcAt = new Set(W.areas[W.area].npcs.filter(n => n.rest <= W.t).map(n => n.y * MW + n.x));
  const cost = weak ? (x, y) => 1 + (ENC[M.g[y][x]] ? 6 : 0) + (npcAt.has(y * MW + x) ? 20 : 0) : null;
  T.goal = goal; T.path = path(M, T, goal, cost) || [];
  if (!T.path.length && (T.x !== goal.x || T.y !== goal.y)) T.goal = null;
}
function arrive(W, T) {
  const g = T.goal; T.goal = null; if (!g) return;
  if (g.k === 'heal' && T.x === DOOR.x && T.y === DOOR.y) {
    for (const m of T.party) { m.hp = m.max; m.status = null; m.slp = 0; }
    if (has(T, 'l3')) rotate(W, T);
    T.state = 'heal'; T.busy = W.t + HEAL_T; feed(W, T.i, '🏥', 'healed');
  } else if (g.k === 'bridge' && T.x === BRIDGE_IN.x && T.y === BRIDGE_IN.y && !W.areas[W.area].cleared && !W.trainers.some(o => o !== T && o.bridge)) {
    W.stats.bridgeTries++; W.areas[W.area].tries++; T.bridge = { idx: 0 }; feed(W, T.i, '🌉', 'Bridge!', { big: 1 }); W.log.push({ t: W.t, ev: 'bridgetry', area: W.area, ti: T.i, lv: T.party.map(m => m.lv), hp: Math.round(partyHp(T) * 100) });
    if (W.flags[T.i] && W.flags[T.i].y <= 7) W.flags[T.i] = null;
    bridgeStep(W, T);
  }
}
function pickup(W, T) {
  const AR = W.areas[W.area];
  for (const p of AR.spots) {
    if (p.next > W.t || p.x !== T.x || p.y !== T.y) continue;
    if (p.h && !has(T, 's2')) continue;
    const k = pickW(W, FIND[p.h ? 'hidden' : 'open']); W.bag[k]++; W.stats.finds++;
    p.next = W.t + (p.h ? 300 : 150);
    feed(W, T.i, p.h ? '⛏' : '🎁', `${QITEMS[k].icon} ${QITEMS[k].name}`, { big: p.h }); addTp(W, T, p.h ? 2 : 1);
    if (p.h) { T.state = 'dig'; T.busy = W.t + DIG_T; }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- main loop
function stepTrainer(W, T) {
  const M = mapOf(W);
  if (T.busy > W.t) return;
  if (T.state === 'battle' || T.state === 'heal' || T.state === 'dig' || T.state === 'ko') {
    const was = T.state; T.state = 'idle';
    if (was === 'battle') { const f = T.after; T.after = null; T.battle = null; if (f) f(); if (T.bridge && T.state !== 'ko') { bridgeStep(W, T); return; } }
    if (T.busy > W.t) return;
  }
  if (T.state === 'walk') T.state = 'idle';
  if (W.unlock) return;
  if (!T.path.length) { if (T.goal) arrive(W, T); if (T.busy > W.t || T.state !== 'idle') return; if (pickup(W, T)) return; decide(W, T); if (!T.path.length) { T.busy = W.t + 1; return; } }
  // walk one tile
  const n = T.path.shift(); if (!walk(M, n.x, n.y)) { T.path = []; return; }
  T.x = n.x; T.y = n.y; T.steps++; T.state = 'walk'; T.busy = W.t + STEP_T; reveal(W, T);
  if (has(T, 'm4') && T.steps % 3 === 0) for (const m of T.party) if (m.hp > 0 && m.hp < m.max) m.hp = Math.min(m.max, m.hp + Math.max(1, Math.round(m.max * 0.02)));
  pickup(W, T);
  if (T.state === 'dig') return;
  // trainers nearby challenge
  for (const nn of W.areas[W.area].npcs) if (nn.rest <= W.t && Math.abs(nn.x - T.x) + Math.abs(nn.y - T.y) <= 1 && T.party.some(m => m.hp > 0)) { npcBattle(W, T, nn); return; }
  const ter = ENC[M.g[T.y][T.x]];
  if (ter) {
    let rate = ter === 'cave' ? 0.13 : 0.12;
    if (has(T, 's4')) rate *= partyHp(T) < 0.5 ? 0.35 : 1.25;
    if (rnd(W) < rate && lead(T)) wildBattle(W, T, ter);
  }
}
function stepNpcs(W) {
  const M = mapOf(W);
  for (const n of W.areas[W.area].npcs) {
    if (n.mv > W.t) continue; n.mv = W.t + 1.5 + rnd(W) * 1.5;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], [dx, dy] = dirs[ri(W, 0, 3)], nx = n.x + dx, ny = n.y + dy;
    if (walk(M, nx, ny) && Math.abs(nx - n.hx) + Math.abs(ny - n.hy) <= 3 && M.g[ny][nx] !== '=' && !W.trainers.some(T => T.x === nx && T.y === ny)) { n.x = nx; n.y = ny; }
  }
}
function step(W) {
  W.t += TICK;
  if (W.unlock && W.t >= W.unlock.at && !W.trainers.some(T => T.state === 'battle' && T.busy > W.t)) {
    W.area = W.unlock.to; W.best = Math.max(W.best, W.area); W.unlock = null; W.flags = [null, null];
    for (const T of W.trainers) { T.bridge = null; T.battle = null; T.after = null; T.state = 'idle'; T.busy = W.t + 1; for (const m of T.party) { m.hp = m.max; m.status = null; } }
    if (!W.areas[W.area]) initArea(W, W.area); else for (const T of W.trainers) { T.x = SPAWN.x + (T.i ? 1 : -1); T.y = SPAWN.y; T.path = []; T.goal = null; }
    W.log.push({ t: W.t, ev: 'area', area: W.area });
  }
  stepNpcs(W);
  for (const T of W.trainers) stepTrainer(W, T);
}
function run(W, secs, o = {}) { const end = W.t + secs; const was = W.fast; W.fast = !!o.fast; while (W.t < end) { step(W); if (o.until && o.until(W)) break; if (o.each) o.each(W); } W.fast = was; }
function setFlag(W, ti, p) {
  W.flags[ti] = p ? { x: p.x, y: p.y } : null;
  const T = W.trainers[ti]; if (T.state === 'walk' || T.state === 'idle') { T.path = []; T.goal = null; }
}
// offline catch-up: run the sim fast for the time away (capped), return a summary
function catchUp(W, secs) {
  const s = Math.min(OFFLINE_CAP, Math.max(0, secs)), before = JSON.parse(JSON.stringify({ st: W.stats, area: W.area, best: W.areas.map(a => a ? a.best || 0 : 0), lv: W.trainers.map(T => T.party.map(m => m.lv)) }));
  for (const T of W.trainers) if (T.state === 'battle') { T.busy = W.t; }
  run(W, s, { fast: true });
  const S = W.stats, B = before.st;
  return { secs: s, capped: secs > OFFLINE_CAP, wins: S.wins - B.wins, catches: S.catches - B.catches, finds: S.finds - B.finds, lv: S.lv - B.lv, tp: S.tp - B.tp, losses: S.losses - B.losses, bridgeTries: S.bridgeTries - B.bridgeTries, area: W.area, areaUp: W.area - before.area };
}
// ---------------------------------------------------------------- save / load
const SAVE_KEY = 'trainer-quest-v1';
function serialize(W) {
  const T = W.trainers.map(t => ({ i: t.i, name: t.name, icon: t.icon, col: t.col, x: t.x, y: t.y, tp: t.tp, tpAll: t.tpAll, traits: t.traits, party: t.party.map(strip), cool: t.cool, steps: t.steps, bridge: null }));
  return JSON.stringify({ v: 1, seed: W.seed, rs: W.rs, t: W.t, area: W.area, best: W.best, uid: W.uid, nb: W.nb, champion: W.champion, box: W.box.map(strip), dex: W.dex, feed: W.feed.slice(-80), why: W.why.slice(-60), flags: W.flags, bag: W.bag, stats: W.stats, trainers: T, areas: W.areas, log: W.log.slice(-200), saved: Date.now() });
}
function deserialize(s) {
  const o = JSON.parse(s); if (!o || o.v !== 1) throw new Error('bad save');
  const W = Object.assign(newWorld({ seed: o.seed }), { rs: o.rs, t: o.t, area: o.area, best: o.best, uid: o.uid, nb: o.nb, champion: o.champion, dex: o.dex, feed: o.feed || [], why: o.why || [], flags: o.flags || [null, null], bag: o.bag, stats: o.stats, areas: o.areas, log: o.log || [], saved: o.saved });
  W.box = (o.box || []).map(hydrate);
  W.trainers = o.trainers.map(t => Object.assign({ path: [], state: 'idle', busy: o.t, goal: null, battle: null, bridge: null }, t, { party: t.party.map(hydrate) }));
  return W;
}
root.TQ = { gainExp, path, decide, bfs, tune: (k, p) => { EXP_K = k; EXP_POW = p; }, MW, MH, TICK, STEP_T, TURN_T, INTRO_T, OUTRO_T, DOOR, SPAWN, BRIDGE_IN, AREAS, QITEMS, BALLS, TREES, TRAIT, LEARN, STARTERS, OFFLINE_CAP, SAVE_KEY, ENC,
  newWorld, mapOf, step, run, buy, canBuy, has, capOf, sightOf, doctrineOf, baseDoctrine, setFlag, catchUp, serialize, deserialize, hydrate, expFor, movesAt, partyHp, avgLv, bridgeLv, bridgeTeams, walk, catchChance, fillParty, rotate, feed, setVal };
})(typeof window !== 'undefined' ? window : globalThis);
