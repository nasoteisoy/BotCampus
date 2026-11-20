// Pure game rules for Pacific Week. No DOM. Runs in the browser and in node tests.

export const WORLD = { w: 2600, h: 1700 };
export const CIRCLE_R = 130;
export const RANGE = { army: 760, fleet: 900 };
export const AIR_RANGE = 900;
export const MAX_STR = { army: 6, fleet: 6 };
export const HOME_STACK = 2;
export const BLUE = 'blue';
export const RED = 'red';
export const other = (s) => (s === BLUE ? RED : BLUE);

// Fictional theater. type: home | supply | air | plain. Land shape: ellipse rx, ry, rot (radians).
export const ISLANDS = [
  { id: 'kestra', name: 'KESTRA', x: 330, y: 930, type: 'home', owner: BLUE, gar: 2, rx: 300, ry: 190, rot: -0.5 },
  { id: 'tallow', name: 'TALLOW', x: 640, y: 420, type: 'supply', owner: BLUE, gar: 0, rx: 230, ry: 130, rot: 0.4 },
  { id: 'merren', name: 'MERREN', x: 700, y: 1360, type: 'air', owner: BLUE, gar: 0, rx: 200, ry: 120, rot: -0.2 },
  { id: 'oska', name: 'OSKA', x: 1040, y: 860, type: 'plain', owner: null, gar: 1, rx: 210, ry: 150, rot: 0.9 },
  { id: 'brin', name: 'BRIN', x: 1180, y: 330, type: 'air', owner: null, gar: 1, rx: 180, ry: 110, rot: -0.3 },
  { id: 'halda', name: 'HALDA', x: 1240, y: 1380, type: 'supply', owner: null, gar: 2, rx: 260, ry: 140, rot: 0.25 },
  { id: 'ellin', name: 'ELLIN', x: 1500, y: 780, type: 'supply', owner: null, gar: 2, rx: 240, ry: 160, rot: -0.7 },
  { id: 'pask', name: 'PASK', x: 1660, y: 310, type: 'plain', owner: null, gar: 1, rx: 170, ry: 120, rot: 0.2 },
  { id: 'corve', name: 'CORVE', x: 1800, y: 1250, type: 'air', owner: null, gar: 1, rx: 220, ry: 120, rot: 0.6 },
  { id: 'ruvo', name: 'RUVO', x: 1950, y: 620, type: 'air', owner: RED, gar: 0, rx: 190, ry: 120, rot: -0.4 },
  { id: 'santel', name: 'SANTEL', x: 2000, y: 1530, type: 'supply', owner: RED, gar: 0, rx: 210, ry: 110, rot: 0.1 },
  { id: 'voruna', name: 'VORUNA', x: 2290, y: 960, type: 'home', owner: RED, gar: 2, rx: 300, ry: 200, rot: 0.55 },
];

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createGame(seed = 1) {
  const s = {
    seed, week: 1, rand: rng(seed), nextId: 1, nextCmd: 1,
    islands: ISLANDS.map((i) => ({ ...i })),
    units: [], orders: {}, over: null, log: [],
    stats: { navalWon: 0, navalFought: 0, landWon: 0, landFought: 0, lost: { blue: 0, red: 0 }, sunk: { blue: 0, red: 0 } },
    lastArrows: [],
  };
  addUnit(s, BLUE, 'army', 'kestra', 4);
  addUnit(s, BLUE, 'army', 'kestra', 3);
  addUnit(s, BLUE, 'fleet', 'kestra', 4);
  addUnit(s, BLUE, 'army', 'tallow', 2);
  addUnit(s, RED, 'army', 'voruna', 4);
  addUnit(s, RED, 'army', 'voruna', 4);
  addUnit(s, RED, 'fleet', 'voruna', 4);
  addUnit(s, RED, 'army', 'ruvo', 2);
  return s;
}

export function addUnit(s, side, kind, at, str) {
  const u = { id: `${side[0]}${kind[0]}${s.nextId++}`, side, kind, at, str, cmd: s.nextCmd++ };
  s.units.push(u);
  return u;
}

export const island = (s, id) => s.islands.find((i) => i.id === id);
export const unit = (s, id) => s.units.find((u) => u.id === id);
export const unitsAt = (s, id, side, kind) =>
  s.units.filter((u) => u.at === id && (!side || u.side === side) && (!kind || u.kind === kind));

export function canOrder(s, u, toId) {
  if (!u || s.over) return false;
  if (toId === u.at) return true; // cancel
  const a = island(s, u.at), b = island(s, toId);
  return !!b && dist(a, b) <= RANGE[u.kind];
}

export function reachable(s, u) {
  return s.islands.filter((i) => i.id !== u.at && canOrder(s, u, i.id)).map((i) => i.id);
}

export function issueOrder(s, unitId, toId) {
  const u = unit(s, unitId);
  if (!canOrder(s, u, toId)) return false;
  if (toId === u.at) delete s.orders[unitId];
  else s.orders[unitId] = toId;
  return true;
}

export function airfieldsNear(s, side, isl) {
  return s.islands.filter((i) => i.owner === side && (i.type === 'air' || i.type === 'home') && dist(i, isl) <= AIR_RANGE)
    .reduce((n, i) => n + (i.type === 'air' ? 2 : 1), 0);
}

export const ownedCount = (s, side, type) => s.islands.filter((i) => i.owner === side && (!type || i.type === type)).length;

// ---- Red AI: scores targets, gathers enough armies in range, keeps home covered. ----
export function aiOrders(s, side = RED) {
  const foe = other(side);
  const homeId = side === RED ? 'voruna' : 'kestra';
  const foeHomeId = side === RED ? 'kestra' : 'voruna';
  const home = island(s, homeId);
  const armyStr = (list) => list.reduce((n, u) => n + u.str, 0);
  const defOf = (i) => (i.owner === side ? 0 : i.gar + armyStr(unitsAt(s, i.id, foe, 'army')) + (i.type === 'home' ? 1 : 0));
  const threat = armyStr(s.units.filter((u) => u.side === foe && u.kind === 'army' && dist(island(s, u.at), home) <= RANGE.army));
  const free = new Set(s.units.filter((u) => u.side === side && u.kind === 'army').map((u) => u.id));
  // home guard: keep the strongest home armies until they cover the threat
  if (home.owner === side && threat > 0) {
    let guard = home.gar;
    for (const u of unitsAt(s, homeId, side, 'army').sort((a, b) => b.str - a.str)) {
      if (guard >= threat + 1) break;
      guard += u.str; free.delete(u.id);
    }
  }
  const targets = s.islands.filter((i) => i.owner !== side).map((i) => {
    const value = (i.id === foeHomeId ? 8 : 0) + (i.type === 'supply' ? 3 : i.type === 'air' ? 2.5 : i.type === 'home' ? 6 : 1) + (i.owner === foe ? 1 : 0);
    const near = Math.min(...s.units.filter((u) => u.side === side && u.kind === 'army').map((u) => dist(island(s, u.at), i)), 1e6);
    return { i, d: defOf(i), score: value - defOf(i) * 0.35 - near / 350 + s.rand() * 0.8 };
  }).sort((a, b) => b.score - a.score);
  for (const t of targets) {
    const cands = [...free].map((id) => unit(s, id)).filter((u) => canOrder(s, u, t.i.id) && u.at !== t.i.id)
      .sort((a, b) => dist(island(s, a.at), t.i) - dist(island(s, b.at), t.i));
    const need = Math.ceil(t.d * 1.3) + 1;
    const pick = [];
    let sum = 0;
    for (const u of cands) { if (sum >= need) break; pick.push(u); sum += u.str; }
    if (sum < need) continue;
    pick.forEach((u) => { s.orders[u.id] = t.i.id; free.delete(u.id); });
  }
  // idle armies away from the front drift toward the nearest enemy-held island's neighbour that we own
  for (const id of free) {
    const u = unit(s, id);
    if (u.at === homeId && threat > 0) continue;
    const enemyIsl = s.islands.filter((i) => i.owner !== side);
    const here = island(s, u.at);
    const nearFoe = (i) => Math.min(...enemyIsl.map((e) => dist(e, i)), 1e6);
    const step = reachable(s, u).map((x) => island(s, x)).filter((i) => i.owner === side)
      .sort((a, b) => nearFoe(a) - nearFoe(b))[0];
    if (step && nearFoe(step) < nearFoe(here) - 60) s.orders[u.id] = step.id;
  }
  // Fleets: hunt a weaker enemy fleet in range, else escort the biggest landing, else sit home.
  for (const f of s.units.filter((u) => u.side === side && u.kind === 'fleet')) {
    const power = (sd, f2, isl) => f2 + airfieldsNear(s, sd, isl) / 2;
    const targetsF = s.units.filter((e) => e.side === foe && e.kind === 'fleet' && canOrder(s, f, e.at) && e.at !== f.at)
      .filter((e) => power(foe, e.str, island(s, e.at)) < power(side, f.str, island(s, e.at)));
    if (targetsF.length) { s.orders[f.id] = targetsF[0].at; continue; }
    const escort = Object.entries(s.orders).map(([id, to]) => ({ u: unit(s, id), to }))
      .filter((o) => o.u && o.u.side === side && o.u.kind === 'army' && canOrder(s, f, o.to))
      .sort((a, b) => b.u.str - a.u.str)[0];
    if (escort) s.orders[f.id] = escort.to;
    else if (f.at !== homeId && canOrder(s, f, homeId)) s.orders[f.id] = homeId;
  }
}

// ---- Resolution ----
function naval(s, isl, events) {
  const blueF = unitsAt(s, isl.id, BLUE, 'fleet'), redF = unitsAt(s, isl.id, RED, 'fleet');
  if (!blueF.length || !redF.length) return;
  const mk = (side, fleets) => {
    const ships = [];
    fleets.forEach((f) => { for (let i = 0; i < f.str; i++) ships.push({ side, kind: 'ship', fleet: f.id, alive: true, idx: ships.length }); });
    const planes = airfieldsNear(s, side, isl);
    for (let i = 0; i < planes; i++) ships.push({ side, kind: 'plane', alive: true, idx: ships.length });
    return ships;
  };
  const sides = { blue: mk(BLUE, blueF), red: mk(RED, redF) };
  const start = { blue: sides.blue.map((x) => x.kind), red: sides.red.map((x) => x.kind) };
  const shots = [];
  const shipsAlive = (side) => sides[side].filter((x) => x.alive && x.kind === 'ship').length;
  let round = 0;
  while (round < 6 && shipsAlive(BLUE) && shipsAlive(RED)) {
    round++;
    const pending = [];
    for (const side of [BLUE, RED]) {
      for (const sh of sides[side]) {
        if (!sh.alive) continue;
        const foes = sides[other(side)].filter((x) => x.alive);
        if (!foes.length) break;
        const t = foes[Math.floor(s.rand() * foes.length)];
        const p = sh.kind === 'plane' ? (t.kind === 'ship' ? 0.5 : 0.35) : (t.kind === 'plane' ? 0.25 : 0.4);
        const hit = s.rand() < p;
        shots.push({ round, from: { side, idx: sh.idx }, to: { side: t.side, idx: t.idx }, hit });
        if (hit) pending.push(t);
      }
    }
    pending.forEach((t) => { t.alive = false; });
  }
  const left = { blue: shipsAlive(BLUE), red: shipsAlive(RED) };
  let winner;
  if (left.blue && !left.red) winner = BLUE;
  else if (left.red && !left.blue) winner = RED;
  else if (!left.red && !left.blue) winner = isl.owner || null;
  else winner = left.blue === left.red ? (isl.owner || BLUE) : (left.blue > left.red ? BLUE : RED);
  // apply losses to fleets
  for (const side of [BLUE, RED]) {
    const fleets = side === BLUE ? blueF : redF;
    for (const f of fleets) {
      const alive = sides[side].filter((x) => x.fleet === f.id && x.alive).length;
      s.stats.sunk[side] += f.str - alive;
      f.str = alive;
    }
  }
  s.stats.navalFought++;
  if (winner === BLUE) s.stats.navalWon++;
  // loser retreats to nearest own island, or is lost
  const loser = winner ? other(winner) : null;
  const retreats = [];
  for (const f of [...blueF, ...redF]) {
    if (f.str <= 0) { removeUnit(s, f); continue; }
    if (f.side === loser) {
      const back = s.islands.filter((i) => i.owner === f.side && i.id !== isl.id).sort((a, b) => dist(a, isl) - dist(b, isl))[0];
      if (back && dist(back, isl) <= RANGE.fleet) { retreats.push({ unit: f.id, from: isl.id, to: back.id }); f.at = back.id; }
      else { s.stats.sunk[f.side] += f.str; removeUnit(s, f); }
    }
  }
  events.push({ type: 'naval', island: isl.id, start, shots, rounds: round, winner, retreats });
}

function removeUnit(s, u) {
  s.units = s.units.filter((x) => x !== u);
  delete s.orders[u.id];
}

function landing(s, isl, side, events, movedIn) {
  const attackers = unitsAt(s, isl.id, side, 'army').filter((u) => movedIn.has(u.id));
  if (!attackers.length || isl.owner === side) return;
  const foe = other(side);
  const defArmies = unitsAt(s, isl.id, foe, 'army');
  // transports caught by a hostile fleet lose half
  const hostileFleet = unitsAt(s, isl.id, foe, 'fleet').reduce((n, f) => n + f.str, 0);
  const ownFleet = unitsAt(s, isl.id, side, 'fleet').reduce((n, f) => n + f.str, 0);
  let transportLoss = 0;
  if (hostileFleet > 0 && ownFleet === 0) {
    attackers.forEach((u) => { const l = Math.ceil(u.str / 2); transportLoss += l; u.str -= l; });
  }
  let atk = attackers.reduce((n, u) => n + u.str, 0);
  const defGar = isl.owner === foe || isl.owner === null ? isl.gar : 0;
  let def = defGar + defArmies.reduce((n, u) => n + u.str, 0);
  const atk0 = atk, def0 = def;
  const support = ownFleet > 0 ? 1 : 0;
  const homeBonus = isl.type === 'home' ? 0.1 : 0;
  const rolls = [];
  let round = 0;
  while (atk > 0 && def > 0 && round < 20) {
    round++;
    let hitsOnDef = 0, hitsOnAtk = 0;
    for (let i = 0; i < atk + support; i++) if (s.rand() < 0.4) hitsOnDef++;
    for (let i = 0; i < def; i++) if (s.rand() < 0.42 + homeBonus) hitsOnAtk++;
    hitsOnDef = Math.min(hitsOnDef, def); hitsOnAtk = Math.min(hitsOnAtk, atk);
    def -= hitsOnDef; atk -= hitsOnAtk;
    rolls.push({ round, hitsOnDef, hitsOnAtk });
  }
  const won = def <= 0 && atk > 0;
  s.stats.landFought += side === BLUE || defArmies.some((u) => u.side === BLUE) || isl.owner === BLUE ? 1 : 0;
  if (won && side === BLUE) s.stats.landWon++;
  if (!won && side === RED && (isl.owner === BLUE || defArmies.length)) s.stats.landWon++;
  // apply losses: attackers share remaining atk in order
  const spread = (list, total) => {
    let left = total;
    list.forEach((u) => { const keep = Math.min(u.str, left); s.stats.lost[u.side] += u.str - keep; u.str = keep; left -= keep; });
  };
  spread(attackers, Math.max(0, atk));
  let remDef = Math.max(0, def);
  const garKeep = Math.min(defGar, remDef); remDef -= garKeep;
  spread(defArmies, remDef);
  const prevOwner = isl.owner;
  if (won) { isl.owner = side; isl.gar = 0; }
  else if (prevOwner === foe || prevOwner === null) isl.gar = garKeep;
  s.units.filter((u) => u.kind === 'army' && u.str <= 0).forEach((u) => removeUnit(s, u));
  events.push({ type: 'landing', island: isl.id, side, atk0, def0, atkLeft: Math.max(0, atk), defLeft: Math.max(0, def), transportLoss, support: !!support, rolls, won, prevOwner, attackers: attackers.map((u) => u.id) });
}

function reinforce(s, events) {
  for (const side of [BLUE, RED]) {
    const home = s.islands.find((i) => i.type === 'home' && i.owner === side);
    if (!home) continue;
    let troops = 1 + ownedCount(s, side, 'supply');
    let gained = 0;
    while (troops > 0) {
      const here = unitsAt(s, home.id, side, 'army');
      let a = here.find((u) => u.str < MAX_STR.army);
      if (!a && here.length >= HOME_STACK) break;
      if (!a) a = addUnit(s, side, 'army', home.id, 0);
      const add = Math.min(troops, MAX_STR.army - a.str);
      a.str += add; troops -= add; gained += add;
    }
    let ships = 0;
    if (s.week % 2 === 0) {
      let f = unitsAt(s, home.id, side, 'fleet').find((u) => u.str < MAX_STR.fleet);
      if (!f && unitsAt(s, home.id, side, 'fleet').length < 1) f = addUnit(s, side, 'fleet', home.id, 0);
      if (f) { f.str += 1; ships = 1; }
    }
    events.push({ type: 'reinforce', side, island: home.id, troops: gained, ships });
  }
}

// Same side + kind on one island fold into as few groups as the cap allows.
function mergeStacks(s) {
  for (const isl of s.islands) {
    for (const side of [BLUE, RED]) {
      for (const kind of ['army', 'fleet']) {
        const list = unitsAt(s, isl.id, side, kind).sort((a, b) => b.str - a.str);
        if (list.length < 2) continue;
        let total = list.reduce((n, u) => n + u.str, 0);
        list.forEach((u) => { const v = Math.min(MAX_STR[kind], total); u.str = v; total -= v; });
        list.filter((u) => u.str <= 0).forEach((u) => removeUnit(s, u));
      }
    }
  }
}

// Ends the week: AI orders, simultaneous moves, naval fights, landings, reinforcements, week+1.
export function endWeek(s, { ai = true } = {}) {
  if (s.over) return [];
  if (ai) aiOrders(s, RED);
  const events = [];
  const moves = [];
  const movedIn = new Set();
  for (const [id, to] of Object.entries(s.orders)) {
    const u = unit(s, id);
    if (!u) continue;
    moves.push({ unit: id, side: u.side, kind: u.kind, from: u.at, to, str: u.str });
    u.at = to; movedIn.add(id);
  }
  s.orders = {};
  events.push({ type: 'moves', moves });
  s.lastArrows = moves.map((m) => ({ side: m.side, kind: m.kind, from: m.from, to: m.to }));
  // naval clashes first
  for (const isl of s.islands) naval(s, isl, events);
  // landings: blue then red, defenders are whoever holds it at that moment
  for (const isl of s.islands) {
    for (const side of [BLUE, RED]) landing(s, isl, side, events, movedIn);
    // both sides left armies on a neutral island with no fight: resolve as red attacking blue holder
  }
  // if armies of both sides still share an island (e.g. both landed on neutral), the later lander attacks
  for (const isl of s.islands) {
    const b = unitsAt(s, isl.id, BLUE, 'army'), r = unitsAt(s, isl.id, RED, 'army');
    if (b.length && r.length) {
      const atkSide = isl.owner === BLUE ? RED : BLUE;
      const ids = new Set((atkSide === BLUE ? b : r).map((u) => u.id));
      landing(s, isl, atkSide, events, ids);
      // a failed attacker has str 0 and was removed; a successful one owns it
    }
  }
  // win check
  const blueHome = island(s, 'kestra'), redHome = island(s, 'voruna');
  if (redHome.owner === BLUE) s.over = { winner: BLUE, week: s.week };
  else if (blueHome.owner === RED) s.over = { winner: RED, week: s.week };
  if (!s.over) { reinforce(s, events); mergeStacks(s); }
  s.week++;
  events.push({ type: 'week', week: s.week });
  if (s.over) events.push({ type: 'over', winner: s.over.winner });
  return events;
}

export function snapshot(s) {
  return {
    week: s.week, over: s.over,
    islands: s.islands.map((i) => ({ id: i.id, owner: i.owner, gar: i.gar })),
    units: s.units.map((u) => ({ ...u })), orders: { ...s.orders },
  };
}
