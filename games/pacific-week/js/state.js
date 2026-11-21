// Pure game rules for Island Front (r3). No DOM. Runs in the browser and in node tests.
// r3: islands are split into sections, fog of war + recon, round-by-round battles with retreat.

export const WORLD = { w: 2600, h: 1700 };
export const CIRCLE_R = 130;
export const RANGE = { army: 760, fleet: 900 };
export const AIR_RANGE = 900;      // planes join sea fights within this range of an owned airfield section
export const RECON_RANGE = 1300;   // one recon flight per owned airfield section per week
export const SEE = { adj: 480, fleet: 600, air: 600, contact: 950 };
export const MAX_STR = { army: 6, fleet: 6 };
export const HOME_STACK = 3;
export const BLUE = 'blue';
export const RED = 'red';
export const other = (s) => (s === BLUE ? RED : BLUE);

// Fictional theater. type: home | supply | air | plain. Land shape: ellipse rx, ry, rot (radians).
export const ISLANDS = [
  { id: 'kestra', name: 'KESTRA', x: 330, y: 930, type: 'home', owner: BLUE, rx: 300, ry: 190, rot: -0.5 },
  { id: 'tallow', name: 'TALLOW', x: 640, y: 420, type: 'supply', owner: BLUE, rx: 230, ry: 130, rot: 0.4 },
  { id: 'merren', name: 'MERREN', x: 700, y: 1360, type: 'air', owner: BLUE, rx: 200, ry: 120, rot: -0.2 },
  { id: 'oska', name: 'OSKA', x: 1040, y: 860, type: 'plain', owner: null, rx: 210, ry: 150, rot: 0.9 },
  { id: 'brin', name: 'BRIN', x: 1180, y: 330, type: 'air', owner: null, rx: 180, ry: 110, rot: -0.3 },
  { id: 'halda', name: 'HALDA', x: 1240, y: 1380, type: 'supply', owner: null, rx: 260, ry: 140, rot: 0.25 },
  { id: 'ellin', name: 'ELLIN', x: 1500, y: 780, type: 'supply', owner: null, rx: 240, ry: 160, rot: -0.7 },
  { id: 'pask', name: 'PASK', x: 1660, y: 310, type: 'plain', owner: null, rx: 170, ry: 120, rot: 0.2 },
  { id: 'corve', name: 'CORVE', x: 1800, y: 1250, type: 'air', owner: null, rx: 220, ry: 120, rot: 0.6 },
  { id: 'ruvo', name: 'RUVO', x: 1950, y: 620, type: 'air', owner: RED, rx: 190, ry: 120, rot: -0.4 },
  { id: 'santel', name: 'SANTEL', x: 2000, y: 1530, type: 'supply', owner: RED, rx: 210, ry: 110, rot: 0.1 },
  { id: 'voruna', name: 'VORUNA', x: 2290, y: 960, type: 'home', owner: RED, rx: 300, ry: 200, rot: 0.55 },
];

// Section templates in island-local ellipse units (u along the long axis, v across), with links.
// kinds: beach, port, air, ridge, jungle, depot, hq. gar: [owned non-home, neutral] starting garrison.
const TEMPLATES = {
  home: { secs: [['b1', 'beach', -0.72, 0.15], ['b2', 'beach', 0.72, -0.15], ['port', 'port', 0.1, 0.62], ['air', 'air', -0.25, -0.5], ['hq', 'hq', 0.08, 0]],
    links: [['b1', 'air'], ['b1', 'hq'], ['b2', 'port'], ['b2', 'hq'], ['port', 'hq'], ['air', 'hq']], gar: { hq: 2, port: 1, air: 1 } },
  supply: { secs: [['b1', 'beach', -0.72, 0], ['b2', 'beach', 0.72, 0.1], ['depot', 'depot', 0, 0.12], ['jungle', 'jungle', 0.05, -0.6]],
    links: [['b1', 'depot'], ['b2', 'depot'], ['depot', 'jungle'], ['b1', 'jungle']], gar: { depot: 1, jungle: 1 } },
  air: { secs: [['b1', 'beach', -0.7, 0.1], ['b2', 'beach', 0.7, -0.1], ['air', 'air', 0, 0.3], ['ridge', 'ridge', 0, -0.45]],
    links: [['b1', 'air'], ['b2', 'air'], ['b1', 'ridge'], ['b2', 'ridge'], ['air', 'ridge']], gar: { air: 1, ridge: 1 } },
  plain: { secs: [['b1', 'beach', -0.7, 0], ['b2', 'beach', 0.7, 0], ['jungle', 'jungle', 0, 0.38], ['ridge', 'ridge', 0, -0.38]],
    links: [['b1', 'jungle'], ['b1', 'ridge'], ['b2', 'jungle'], ['b2', 'ridge'], ['jungle', 'ridge']], gar: { ridge: 1, jungle: 1 } },
};

export function buildSections(isl) {
  const t = TEMPLATES[isl.type];
  const c = Math.cos(isl.rot), s = Math.sin(isl.rot);
  return t.secs.map(([id, kind, u, v]) => {
    const lx = u * isl.rx * 0.78, ly = v * isl.ry * 0.78;
    const links = t.links.filter((l) => l.includes(id)).map((l) => (l[0] === id ? l[1] : l[0]));
    const gar = t.gar[id] || 0;
    return { id, kind, x: isl.x + lx * c - ly * s, y: isl.y + lx * s + ly * c, links, owner: isl.owner, gar };
  });
}

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
    islands: ISLANDS.map((i) => ({ ...i, secs: buildSections(i) })),
    units: [], orders: {}, secOrders: {}, landAt: {}, over: null,
    recon: { blue: [], red: [] }, flights: { blue: 0, red: 0 },
    stats: { navalWon: 0, navalFought: 0, landWon: 0, landFought: 0, lost: { blue: 0, red: 0 }, sunk: { blue: 0, red: 0 }, retreats: { blue: 0, red: 0 }, recon: { blue: 0, red: 0 } },
    lastArrows: [],
  };
  addUnit(s, BLUE, 'army', 'kestra', 4, 'b2');
  addUnit(s, BLUE, 'army', 'kestra', 3, 'hq');
  addUnit(s, BLUE, 'fleet', 'kestra', 4);
  addUnit(s, BLUE, 'army', 'tallow', 2, 'depot');
  addUnit(s, RED, 'army', 'voruna', 4, 'b1');
  addUnit(s, RED, 'army', 'voruna', 4, 'hq');
  addUnit(s, RED, 'fleet', 'voruna', 4);
  addUnit(s, RED, 'army', 'ruvo', 2, 'air');
  return s;
}

export function addUnit(s, side, kind, at, str, sec = null) {
  const u = { id: `${side[0]}${kind[0]}${s.nextId++}`, side, kind, at, str, cmd: s.nextCmd++, sec: kind === 'army' ? sec : null };
  s.units.push(u);
  return u;
}

export const island = (s, id) => s.islands.find((i) => i.id === id);
export const unit = (s, id) => s.units.find((u) => u.id === id);
export const section = (isl, id) => isl.secs.find((x) => x.id === id);
export const unitsAt = (s, id, side, kind) =>
  s.units.filter((u) => u.at === id && (!side || u.side === side) && (!kind || u.kind === kind));
export const armiesIn = (s, islId, secId, side) => s.units.filter((u) => u.kind === 'army' && u.at === islId && u.sec === secId && (!side || u.side === side));
export const ownsAny = (isl, side) => isl.secs.some((x) => x.owner === side);
export const contested = (isl) => new Set(isl.secs.map((x) => x.owner)).size > 1;

// effects come from the matching section's owner
export const ownedSecs = (s, side, kind) => s.islands.reduce((n, i) => n + i.secs.filter((x) => x.owner === side && (!kind || x.kind === kind)).length, 0);
export const ownedCount = (s, side, type) => s.islands.filter((i) => i.owner === side && (!type || i.type === type)).length;
export function airfieldsNear(s, side, isl) {
  let n = 0;
  for (const i of s.islands) for (const x of i.secs) if (x.owner === side && x.kind === 'air' && dist(x, isl) <= AIR_RANGE) n += 2;
  for (const i of s.islands) for (const x of i.secs) if (x.owner === side && x.kind === 'hq' && dist(x, isl) <= AIR_RANGE) n += 1;
  return n;
}

// ---- fog of war ----
// Full sight: own units/sections, islands next to own units, fleets as scouts, airfield patrols, recon flights.
export function vision(s, side) {
  const seen = new Set(s.recon[side] || []);
  const mine = s.units.filter((u) => u.side === side);
  for (const i of s.islands) {
    if (ownsAny(i, side) || mine.some((u) => u.at === i.id)) { seen.add(i.id); continue; }
    for (const u of mine) {
      const a = island(s, u.at);
      if (dist(a, i) <= (u.kind === 'fleet' ? SEE.fleet : SEE.adj)) { seen.add(i.id); break; }
    }
    if (seen.has(i.id)) continue;
    for (const j of s.islands) for (const x of j.secs) if (x.owner === side && x.kind === 'air' && dist(x, i) <= SEE.air) seen.add(i.id);
  }
  return seen;
}
// Contact: known that something is there, strength unknown ('?').
export function contact(s, side, islId) {
  const i = island(s, islId);
  return s.units.some((u) => u.side === side && dist(island(s, u.at), i) <= SEE.contact) || s.islands.some((j) => ownsAny(j, side) && dist(j, i) <= SEE.contact);
}
export function reconSources(s, side) {
  const out = [];
  for (const i of s.islands) for (const x of i.secs) if (x.owner === side && x.kind === 'air') out.push({ island: i.id, sec: x.id, x: x.x, y: x.y });
  return out;
}
export const flightsLeft = (s, side) => Math.max(0, reconSources(s, side).length - s.flights[side]);
export function reconTargets(s, side) {
  if (!flightsLeft(s, side)) return [];
  const v = vision(s, side), src = reconSources(s, side);
  return s.islands.filter((i) => !v.has(i.id) && src.some((p) => dist(p, i) <= RECON_RANGE)).map((i) => i.id);
}
export function recon(s, side, islId) {
  if (!reconTargets(s, side).includes(islId)) return null;
  const i = island(s, islId);
  const from = reconSources(s, side).filter((p) => dist(p, i) <= RECON_RANGE).sort((a, b) => dist(a, i) - dist(b, i))[0];
  s.flights[side]++; s.recon[side].push(islId); s.stats.recon[side]++;
  return { from, to: islId };
}

// ---- orders ----
export function canOrder(s, u, toId) {
  if (!u || s.over) return false;
  if (toId === u.at) return true; // cancel
  const a = island(s, u.at), b = island(s, toId);
  return !!b && dist(a, b) <= RANGE[u.kind];
}
export function reachable(s, u) {
  return s.islands.filter((i) => i.id !== u.at && canOrder(s, u, i.id)).map((i) => i.id);
}
// Island-to-island move. Armies land on a beach (or a friendly port); `sec` picks the beach.
export function issueOrder(s, unitId, toId, sec) {
  const u = unit(s, unitId);
  if (!canOrder(s, u, toId)) return false;
  delete s.secOrders[unitId]; delete s.landAt[unitId];
  if (toId === u.at) { delete s.orders[unitId]; return true; }
  s.orders[unitId] = toId;
  if (u.kind === 'army') {
    const isl = island(s, toId);
    const ok = sec && isl.secs.find((x) => x.id === sec && (x.kind === 'beach' || (x.kind === 'port' && x.owner === u.side)));
    s.landAt[unitId] = ok ? sec : landingBeach(s, u, isl);
  }
  return true;
}
export function landingBeach(s, u, isl) {
  const friendly = isl.secs.find((x) => (x.kind === 'beach' || x.kind === 'port') && x.owner === u.side);
  if (friendly) return friendly.id;
  const from = island(s, u.at);
  const v = vision(s, u.side);
  return isl.secs.filter((x) => x.kind === 'beach')
    .sort((a, b) => (v.has(isl.id) ? secDef(s, isl, a, u.side) - secDef(s, isl, b, u.side) : 0) * 3 + (dist(a, from) - dist(b, from)) / 100)[0].id;
}
export function secDef(s, isl, x, side) {
  if (x.owner === side) return 0;
  return x.gar + armiesIn(s, isl.id, x.id, other(side)).reduce((n, u) => n + u.str, 0);
}
export function canSecOrder(s, u, secId) {
  if (!u || u.kind !== 'army' || s.over || !u.sec) return false;
  const isl = island(s, u.at), cur = section(isl, u.sec);
  return secId === u.sec || cur.links.includes(secId);
}
export function issueSecOrder(s, unitId, secId) {
  const u = unit(s, unitId);
  if (!canSecOrder(s, u, secId)) return false;
  delete s.orders[unitId]; delete s.landAt[unitId];
  if (secId === u.sec) delete s.secOrders[unitId]; else s.secOrders[unitId] = secId;
  return true;
}

// ---- AI (any side): recon first, then island attacks, inland pushes, fleets ----
export function aiOrders(s, side = RED) {
  const foe = other(side);
  const homeId = side === RED ? 'voruna' : 'kestra';
  const foeHomeId = side === RED ? 'kestra' : 'voruna';
  const home = island(s, homeId);
  const armyStr = (list) => list.reduce((n, u) => n + u.str, 0);
  // 1. recon: fly at the most valuable unseen targets
  const val = (i) => (i.id === foeHomeId ? 8 : 0) + ({ supply: 3, air: 2.5, home: 6, plain: 1 }[i.type]) + (i.owner === foe ? 1 : 0);
  for (const id of reconTargets(s, side).map((id) => island(s, id)).sort((a, b) => val(b) - val(a)).map((i) => i.id)) {
    if (!flightsLeft(s, side)) break;
    recon(s, side, id);
  }
  const seen = vision(s, side);
  s.aiMemo = s.aiMemo || {};
  const memo = (s.aiMemo[side] = s.aiMemo[side] || {});
  const islDef = (i) => {
    const d = i.secs.reduce((n, x) => n + secDef(s, i, x, side), 0) + (i.type === 'home' ? 1 : 0);
    if (seen.has(i.id)) { memo[i.id] = d; return d; }
    return Math.max(3, memo[i.id] || 0); // unknown: assume a fight
  };
  const threat = armyStr(s.units.filter((u) => u.side === foe && u.kind === 'army' && dist(island(s, u.at), home) <= RANGE.army));
  const free = new Set(s.units.filter((u) => u.side === side && u.kind === 'army').map((u) => u.id));
  // armies already fighting inside a contested island push inland together: weaker enemy groups and key sections first
  const secVal = { hq: 3, depot: 2, air: 2, port: 1.5, beach: 1, ridge: 1, jungle: 1 };
  for (const isl of s.islands.filter((i) => unitsAt(s, i.id, side, 'army').length && i.secs.some((x) => x.owner !== side || armiesIn(s, i.id, x.id, foe).length))) {
    const mine = unitsAt(s, isl.id, side, 'army').filter((u) => u.sec);
    mine.forEach((u) => free.delete(u.id));
    const used = new Set();
    const mySecs = new Set(mine.map((u) => u.sec));
    const targets = isl.secs.filter((x) => (x.owner !== side || armiesIn(s, isl.id, x.id, foe).length) && !mySecs.has(x.id) && x.links.some((l) => mySecs.has(l)))
      .map((x) => ({ x, d: secDef(s, isl, x, side), foeHere: armiesIn(s, isl.id, x.id, foe).length > 0 }))
      .sort((p, q) => ((q.foeHere ? 3 : 0) + secVal[q.x.kind] - q.d * 0.25) - ((p.foeHere ? 3 : 0) + secVal[p.x.kind] - p.d * 0.25));
    let blocked = null;
    for (const t of targets) {
      const avail = mine.filter((u) => !used.has(u.id) && t.x.links.includes(u.sec)).sort((p, q) => q.str - p.str);
      if (!avail.length) continue;
      if (t.d === 0) { const u = avail[avail.length - 1]; s.secOrders[u.id] = t.x.id; used.add(u.id); continue; }
      const need = s.week > 40 ? t.d : Math.ceil(t.d * (s.week > 25 ? 1 : 1.15)) + 1; // grow bolder as the war drags on
      const sum = avail.reduce((n, u) => n + u.str, 0);
      if (sum >= need) {
        let got = 0;
        for (const u of avail) { if (got >= need + 1) break; s.secOrders[u.id] = t.x.id; used.add(u.id); got += u.str; }
      } else if (!blocked) blocked = t;
    }
    // groups with nothing next to them walk one section toward the nearest section still to take
    const goal = new Set(isl.secs.filter((x) => x.owner !== side || armiesIn(s, isl.id, x.id, foe).length).map((x) => x.id));
    if (!targets.length) for (const u of mine) {
      if (used.has(u.id)) continue;
      const prev = { [u.sec]: null }; const q = [u.sec]; let hit = null;
      while (q.length && !hit) { const c = q.shift(); for (const l of section(isl, c).links) if (!(l in prev)) { prev[l] = c; if (goal.has(l)) { hit = l; break; } q.push(l); } }
      if (!hit) continue;
      let st = hit; while (prev[st] !== u.sec) st = prev[st];
      if (!goal.has(st)) { s.secOrders[u.id] = st; used.add(u.id); }
    }
    if (blocked) {
      // gather on the own section next to the blocked target that already holds the most of us
      const stage = blocked.x.links.map((l) => section(isl, l)).filter((x) => mySecs.has(x.id) && !armiesIn(s, isl.id, x.id, foe).length)
        .sort((p, q) => armiesIn(s, isl.id, q.id, side).reduce((n, u) => n + u.str, 0) - armiesIn(s, isl.id, p.id, side).reduce((n, u) => n + u.str, 0))[0];
      if (stage) for (const u of mine) if (!used.has(u.id) && u.sec !== stage.id && section(isl, u.sec).links.includes(stage.id)) { s.secOrders[u.id] = stage.id; used.add(u.id); }
    }
  }
  // home guard
  if (home.owner === side && threat > 0) {
    let guard = home.secs.reduce((n, x) => n + (x.owner === side ? x.gar : 0), 0);
    for (const u of unitsAt(s, homeId, side, 'army').sort((a, b) => b.str - a.str)) {
      if (guard >= Math.ceil(threat * (s.week > 30 ? 0.7 : 1)) + 1) break;
      guard += u.str; free.delete(u.id);
    }
  }
  const targets = s.islands.filter((i) => i.owner !== side && !unitsAt(s, i.id, side, 'army').length).map((i) => {
    const near = Math.min(...s.units.filter((u) => u.side === side && u.kind === 'army').map((u) => dist(island(s, u.at), i)), 1e6);
    const d = islDef(i);
    return { i, d, score: val(i) - d * 0.3 - near / 350 + s.rand() * 0.8 };
  }).sort((a, b) => b.score - a.score);
  for (const t of targets) {
    const cands = [...free].map((id) => unit(s, id)).filter((u) => canOrder(s, u, t.i.id) && u.at !== t.i.id)
      .sort((a, b) => dist(island(s, a.at), t.i) - dist(island(s, b.at), t.i));
    // first beach fight is what matters now; keep enough for it plus a margin
    const beach = section(t.i, landingBeach(s, cands[0] || { at: t.i.id, side }, t.i));
    const bd = seen.has(t.i.id) ? secDef(s, t.i, beach, side) : Math.max(2, Math.round(t.d / 2));
    const need = Math.max(Math.ceil(bd * 1.4) + 1, Math.ceil(t.d * 0.6));
    const pick = []; let sum = 0;
    for (const u of cands) { if (sum >= need) break; pick.push(u); sum += u.str; }
    if (sum < need) continue;
    pick.forEach((u) => { issueOrder(s, u.id, t.i.id, beach.id); free.delete(u.id); });
  }
  // idle armies: reinforce a fight already going on, else stage toward the enemy home
  const foeHome = island(s, foeHomeId);
  for (const id of free) {
    const u = unit(s, id);
    if (u.at === homeId && threat > 0) continue;
    const fight = s.islands.filter((i) => i.id !== u.at && ownsAny(i, side) && i.secs.some((x) => x.owner !== side) && canOrder(s, u, i.id))
      .sort((a, b) => dist(a, island(s, u.at)) - dist(b, island(s, u.at)))[0];
    if (fight) { issueOrder(s, u.id, fight.id); continue; }
    const here = island(s, u.at);
    const step = reachable(s, u).map((x) => island(s, x)).filter((i) => i.owner === side).sort((a, b) => dist(a, foeHome) - dist(b, foeHome))[0];
    if (step && dist(step, foeHome) < dist(here, foeHome) - 60) issueOrder(s, u.id, step.id);
  }
  // fleets: hunt weaker visible fleets, else escort the biggest landing, else go home
  for (const f of s.units.filter((u) => u.side === side && u.kind === 'fleet')) {
    const power = (sd, n, isl) => n + airfieldsNear(s, sd, isl) / 2;
    const targetsF = s.units.filter((e) => e.side === foe && e.kind === 'fleet' && seen.has(e.at) && canOrder(s, f, e.at) && e.at !== f.at)
      .filter((e) => power(foe, e.str, island(s, e.at)) < power(side, f.str, island(s, e.at)));
    if (targetsF.length) { issueOrder(s, f.id, targetsF[0].at); continue; }
    const escort = Object.entries(s.orders).map(([id, to]) => ({ u: unit(s, id), to }))
      .filter((o) => o.u && o.u.side === side && o.u.kind === 'army' && island(s, o.to).owner !== side && canOrder(s, f, o.to))
      .sort((a, b) => b.u.str - a.u.str)[0];
    if (escort) issueOrder(s, f.id, escort.to);
    else if (f.at !== homeId && canOrder(s, f, homeId)) issueOrder(s, f.id, homeId);
  }
}

// AI retreat rule used for Red (and for Blue in AI-vs-AI sims): clearly outgunned after the first exchange.
export function aiWantsRetreat(b, side) {
  if (!b.canRetreat[side] || b.round < 1) return false;
  const mine = alive(b, side), theirs = alive(b, other(side));
  return mine > 0 && mine <= Math.max(1, theirs * 0.45);
}

// ---- battles (round by round) ----
const alive = (b, side) => b.icons[side].filter((i) => i.alive && i.kind !== 'support').length;
export const aliveCount = alive;

function nearestOwnIsland(s, side, from, range) {
  return s.islands.filter((i) => i.id !== from.id && (i.owner === side || i.secs.some((x) => x.owner === side && (x.kind === 'port' || x.kind === 'beach')))).filter((i) => dist(i, from) <= range)
    .sort((a, b) => dist(a, from) - dist(b, from))[0];
}

function makeNaval(s, isl) {
  const blueF = unitsAt(s, isl.id, BLUE, 'fleet'), redF = unitsAt(s, isl.id, RED, 'fleet');
  const icons = {};
  for (const [side, fleets] of [[BLUE, blueF], [RED, redF]]) {
    const arr = [];
    fleets.forEach((f) => { for (let i = 0; i < f.str; i++) arr.push({ side, kind: 'ship', unit: f.id, alive: true, idx: arr.length }); });
    const planes = airfieldsNear(s, side, isl);
    for (let i = 0; i < planes; i++) arr.push({ side, kind: 'plane', alive: true, idx: arr.length });
    icons[side] = arr;
  }
  const b = { kind: 'naval', island: isl.id, icons, round: 0, done: false, winner: null, retreated: null, shotsAll: [], canRetreat: {} };
  for (const side of [BLUE, RED]) b.canRetreat[side] = !!nearestOwnIsland(s, side, isl, RANGE.fleet);
  return b;
}

function makeLand(s, isl, sec, atkSide, blind) {
  const def = sec.owner && sec.owner !== atkSide ? sec.owner : null;
  const defSide = other(atkSide);
  const atkUnits = armiesIn(s, isl.id, sec.id, atkSide);
  const defUnits = armiesIn(s, isl.id, sec.id, defSide);
  const icons = { [atkSide]: [], [defSide]: [] };
  // transports caught by a hostile fleet with no escort lose half before they hit the beach
  let transportLoss = 0;
  if (sec.kind === 'beach' || sec.kind === 'port') {
    const hostile = unitsAt(s, isl.id, defSide, 'fleet').length, own = unitsAt(s, isl.id, atkSide, 'fleet').length;
    if (hostile && !own) atkUnits.filter((u) => u.landed).forEach((u) => { const l = Math.ceil(u.str / 2); transportLoss += l; u.str -= l; s.stats.lost[atkSide] += l; });
  }
  atkUnits.forEach((u) => { for (let i = 0; i < u.str; i++) icons[atkSide].push({ side: atkSide, kind: 'inf', unit: u.id, alive: true, idx: icons[atkSide].length }); });
  for (let i = 0; i < transportLoss; i++) icons[atkSide].push({ side: atkSide, kind: 'inf', unit: null, alive: false, idx: icons[atkSide].length, sunk: true });
  const support = (sec.kind === 'beach' || sec.kind === 'port') && unitsAt(s, isl.id, atkSide, 'fleet').length > 0;
  if (support) icons[atkSide].push({ side: atkSide, kind: 'support', alive: true, idx: icons[atkSide].length });
  const garSide = def || null;
  for (let i = 0; i < (sec.owner === atkSide ? 0 : sec.gar); i++) icons[defSide].push({ side: defSide, kind: 'fort', neutral: !garSide, alive: true, idx: icons[defSide].length });
  defUnits.forEach((u) => { for (let i = 0; i < u.str; i++) icons[defSide].push({ side: defSide, kind: 'inf', unit: u.id, alive: true, idx: icons[defSide].length }); });
  const b = { kind: 'land', island: isl.id, sec: sec.id, secKind: sec.kind, atk: atkSide, def: defSide, defOwner: sec.owner, icons, round: 0, done: false, winner: null,
    retreated: null, blind: !!blind, support, transportLoss, shotsAll: [], canRetreat: {} };
  b.canRetreat[atkSide] = atkUnits.length > 0;
  b.canRetreat[defSide] = defUnits.length > 0 && sec.links.some((id) => section(isl, id).owner === defSide && !armiesIn(s, isl.id, id, atkSide).length);
  b.atk0 = icons[atkSide].filter((i) => i.kind === 'inf').length; b.def0 = icons[defSide].length;
  return b;
}

// One exchange of fire. Returns the shots. Ambush: on a blind landing the defenders get a free opening volley.
export function battleRound(s, b) {
  if (b.done) return [];
  const shots = [];
  const sides = b.kind === 'land' && b.blind && b.round === 0 ? [b.def] : [BLUE, RED];
  b.round++;
  const pending = [];
  for (const side of sides) {
    for (const sh of b.icons[side]) {
      if (!sh.alive) continue;
      const foes = b.icons[other(side)].filter((x) => x.alive && x.kind !== 'support');
      if (!foes.length) break;
      const t = foes[Math.floor(s.rand() * foes.length)];
      let p;
      if (b.kind === 'naval') p = sh.kind === 'plane' ? (t.kind === 'ship' ? 0.5 : 0.35) : (t.kind === 'plane' ? 0.25 : 0.4);
      else p = sh.kind === 'fort' ? 0.5 : sh.kind === 'support' ? 0.45 : side === b.def ? 0.42 : 0.4;
      const hit = s.rand() < p;
      shots.push({ round: b.round, from: { side, idx: sh.idx }, to: { side: t.side, idx: t.idx }, hit });
      if (hit) pending.push(t);
    }
  }
  pending.forEach((t) => { t.alive = false; });
  b.shotsAll.push(...shots);
  const a = alive(b, BLUE), r = alive(b, RED);
  if (!a || !r || b.round >= (b.kind === 'naval' ? 6 : 10)) finishBattle(s, b);
  return shots;
}

export function retreatBattle(s, b, side) {
  if (b.done || !b.canRetreat[side]) return false;
  b.retreated = side;
  finishBattle(s, b);
  return true;
}

function applyIconLosses(s, b, side) {
  // write surviving icon counts back onto the units they came from
  const byUnit = {};
  b.icons[side].forEach((i) => { if (i.unit) byUnit[i.unit] = (byUnit[i.unit] || 0) + (i.alive ? 1 : 0); });
  for (const [id, n] of Object.entries(byUnit)) {
    const u = unit(s, id); if (!u) continue;
    const lost = u.str - n;
    if (b.kind === 'naval') s.stats.sunk[side] += lost; else s.stats.lost[side] += lost;
    u.str = n;
  }
}

function finishBattle(s, b) {
  b.done = true;
  const isl = island(s, b.island);
  applyIconLosses(s, b, BLUE); applyIconLosses(s, b, RED);
  if (b.kind === 'naval') {
    const left = { blue: alive(b, BLUE) && b.icons.blue.some((i) => i.alive && i.kind === 'ship') ? b.icons.blue.filter((i) => i.alive && i.kind === 'ship').length : 0,
      red: b.icons.red.filter((i) => i.alive && i.kind === 'ship').length };
    let winner;
    if (b.retreated) winner = other(b.retreated);
    else if (left.blue && !left.red) winner = BLUE;
    else if (left.red && !left.blue) winner = RED;
    else if (!left.red && !left.blue) winner = isl.owner || null;
    else winner = left.blue === left.red ? (isl.owner || BLUE) : (left.blue > left.red ? BLUE : RED);
    b.winner = winner;
    s.stats.navalFought++; if (winner === BLUE) s.stats.navalWon++;
    const loser = winner ? other(winner) : null;
    b.retreats = [];
    for (const f of s.units.filter((u) => u.kind === 'fleet' && u.at === isl.id)) {
      if (f.str <= 0) { removeUnit(s, f); continue; }
      if (f.side !== loser) continue;
      const back = nearestOwnIsland(s, f.side, isl, RANGE.fleet);
      if (b.retreated === f.side) { f.str -= 1; s.stats.sunk[f.side]++; } // cost of breaking off
      if (back && f.str > 0) { b.retreats.push({ unit: f.id, from: isl.id, to: back.id }); f.at = back.id; }
      else { s.stats.sunk[f.side] += Math.max(0, f.str); removeUnit(s, f); }
    }
    if (b.retreated) s.stats.retreats[b.retreated]++;
    return;
  }
  const sec = section(isl, b.sec);
  const atkLeft = alive(b, b.atk), defLeft = alive(b, b.def);
  const defForts = b.icons[b.def].filter((i) => i.kind === 'fort' && i.alive).length;
  b.retreats = [];
  if (b.retreated === b.atk) {
    // survivors pull back where they came from, each group loses one
    for (const u of armiesIn(s, isl.id, sec.id, b.atk)) {
      u.str -= 1; s.stats.lost[u.side]++;
      const f = u.from || { at: u.at, sec: null };
      if (u.str > 0) { b.retreats.push({ unit: u.id, fromIsl: isl.id, fromSec: sec.id, toIsl: f.at, toSec: f.sec }); u.at = f.at; u.sec = f.sec; u.landed = false; }
    }
    sec.gar = sec.owner === b.atk ? sec.gar : defForts;
    b.winner = b.def;
    s.stats.retreats[b.atk]++;
  } else if (b.retreated === b.def) {
    const back = sec.links.map((id) => section(isl, id)).find((x) => x.owner === b.def && !armiesIn(s, isl.id, x.id, b.atk).length);
    for (const u of armiesIn(s, isl.id, sec.id, b.def)) {
      u.str -= 1; s.stats.lost[u.side]++;
      if (u.str > 0 && back) { b.retreats.push({ unit: u.id, fromIsl: isl.id, fromSec: sec.id, toIsl: isl.id, toSec: back.id }); u.sec = back.id; }
      else u.str = 0;
    }
    sec.owner = b.atk; sec.gar = 0; b.winner = b.atk;
    s.stats.retreats[b.def]++;
  } else if (defLeft === 0 && atkLeft > 0) {
    sec.owner = b.atk; sec.gar = 0; b.winner = b.atk;
  } else {
    b.winner = b.def;
    if (sec.owner !== b.atk) sec.gar = defForts;
    // attackers that did not break through are lost (or repulsed after a long fight)
    for (const u of armiesIn(s, isl.id, sec.id, b.atk)) {
      if (b.round >= 10 && u.str > 0 && u.from) { u.at = u.from.at; u.sec = u.from.sec; b.retreats.push({ unit: u.id, fromIsl: isl.id, fromSec: sec.id, toIsl: u.at, toSec: u.sec }); }
      else { s.stats.lost[u.side] += u.str; u.str = 0; }
    }
  }
  s.stats.landFought += (b.atk === BLUE || b.defOwner === BLUE) ? 1 : 0;
  if ((b.winner === BLUE) && (b.atk === BLUE || b.defOwner === BLUE)) s.stats.landWon++;
  s.units.filter((u) => u.kind === 'army' && u.str <= 0).forEach((u) => removeUnit(s, u));
}

function removeUnit(s, u) {
  s.units = s.units.filter((x) => x !== u);
  delete s.orders[u.id]; delete s.secOrders[u.id]; delete s.landAt[u.id];
}

// empty enemy/neutral sections next to a freshly taken one fall without a fight
function sweep(s, isl, side, fromSec, events) {
  if (unitsAt(s, isl.id, other(side), 'army').length) return; // mop-up only once the foe has no troops left here
  const q = [fromSec]; const taken = [];
  while (q.length) {
    const cur = section(isl, q.shift());
    for (const id of cur.links) {
      const x = section(isl, id);
      if (x.owner !== side && x.gar === 0 && !armiesIn(s, isl.id, x.id, other(side)).length) { x.owner = side; taken.push(x.id); q.push(x.id); }
    }
  }
  if (taken.length) events.push({ type: 'sweep', island: isl.id, side, secs: taken });
}

function findContest(s) {
  for (const isl of s.islands) {
    for (const x of isl.secs) {
      const b = armiesIn(s, isl.id, x.id, BLUE), r = armiesIn(s, isl.id, x.id, RED);
      if (b.length && r.length) {
        // whoever was there first defends; if both just arrived, the section owner (or Red) defends
        const bNew = b.some((u) => u.moved), rNew = r.some((u) => u.moved);
        const atk = bNew && !rNew ? BLUE : rNew && !bNew ? RED : x.owner === BLUE ? RED : BLUE;
        return { isl, x, atk };
      }
      for (const [side, list] of [[BLUE, b], [RED, r]]) {
        if (list.length && x.owner !== side) {
          if (x.gar > 0) return { isl, x, atk: side };
          x.owner = side; // walked in unopposed
          return { isl, x, atk: side, free: true };
        }
      }
    }
  }
  return null;
}

// The week as a generator so the page can animate each round and the player can call a retreat.
// Yields: moves, battle-start, round, battle-end, sweep, capture, reinforce, week, over.
export function* weekSteps(s, { ai = true } = {}) {
  if (s.over) return;
  const seenBefore = { blue: vision(s, BLUE), red: vision(s, RED) };
  if (ai) aiOrders(s, RED);
  const moves = [];
  s.units.forEach((u) => { u.moved = false; u.landed = false; });
  for (const [id, to] of Object.entries(s.orders)) {
    const u = unit(s, id); if (!u) continue;
    const m = { unit: id, side: u.side, kind: u.kind, from: u.at, fromSec: u.sec, to, str: u.str, blind: !seenBefore[u.side].has(to) };
    u.from = { at: u.at, sec: u.sec };
    u.at = to; u.moved = true;
    if (u.kind === 'army') { u.sec = s.landAt[id] || landingBeach(s, { ...u, at: m.from }, island(s, to)); u.landed = true; m.toSec = u.sec; u.blind = m.blind; }
    moves.push(m);
  }
  // two enemy groups trying to swap sections meet head on: the second one holds and is attacked
  for (const [id, secId] of Object.entries(s.secOrders)) {
    const u = unit(s, id); if (!u || !s.secOrders[id]) continue;
    for (const [vid, vSec] of Object.entries(s.secOrders)) {
      const v = unit(s, vid);
      // a group the enemy is marching on is pinned where it stands (no slipping away round the island)
      if (v && v.side !== u.side && v.at === u.at && vSec !== undefined && v.sec === secId && vSec === u.sec) delete s.secOrders[vid];
    }
  }
  for (const [id, secId] of Object.entries(s.secOrders)) {
    const u = unit(s, id); if (!u) continue;
    const v = s.units.find((v) => v.side !== u.side && v.kind === 'army' && v.at === u.at && s.secOrders[v.id] === u.sec && v.sec !== u.sec);
    if (v && s.secOrders[v.id]) {
      delete s.secOrders[id];
    }
  }
  for (const [id, secId] of Object.entries(s.secOrders)) {
    const u = unit(s, id); if (!u || u.moved) continue;
    moves.push({ unit: id, side: u.side, kind: 'army', from: u.at, fromSec: u.sec, to: u.at, toSec: secId, inland: true, str: u.str, blind: false });
    u.from = { at: u.at, sec: u.sec }; u.sec = secId; u.moved = true;
  }
  s.orders = {}; s.secOrders = {}; s.landAt = {};
  s.lastArrows = moves.map((m) => ({ side: m.side, kind: m.kind, from: m.from, to: m.to, fromSec: m.fromSec, toSec: m.toSec, inland: !!m.inland }));
  yield { type: 'moves', moves };
  // sea first
  for (const isl of s.islands) {
    if (!unitsAt(s, isl.id, BLUE, 'fleet').length || !unitsAt(s, isl.id, RED, 'fleet').length) continue;
    const b = makeNaval(s, isl);
    yield { type: 'battle-start', b };
    while (!b.done) { const shots = battleRound(s, b); yield { type: 'round', b, shots }; }
    yield { type: 'battle-end', b };
  }
  // then every contested section, one at a time, until nothing is contested
  for (let guard = 0; guard < 60; guard++) {
    const c = findContest(s);
    if (!c) break;
    if (c.free) { yield { type: 'walk-in', island: c.isl.id, sec: c.x.id, side: c.atk }; const ev = []; sweep(s, c.isl, c.atk, c.x.id, ev); for (const e of ev) yield e; continue; }
    const atkUnits = armiesIn(s, c.isl.id, c.x.id, c.atk);
    const b = makeLand(s, c.isl, c.x, c.atk, atkUnits.some((u) => u.blind));
    yield { type: 'battle-start', b };
    while (!b.done) { const shots = battleRound(s, b); yield { type: 'round', b, shots }; }
    if (b.winner === c.atk && !b.retreated) { const ev = []; sweep(s, c.isl, c.atk, c.x.id, ev); for (const e of ev) yield e; }
    atkUnits.forEach((u) => { u.moved = false; u.blind = false; });
    yield { type: 'battle-end', b };
  }
  // island changes hands only when every section is taken
  for (const isl of s.islands) {
    const owners = new Set(isl.secs.map((x) => x.owner));
    if (owners.size === 1) {
      const o = [...owners][0];
      if (o && isl.owner !== o) { const prev = isl.owner; isl.owner = o; yield { type: 'capture', island: isl.id, side: o, prev }; }
    }
  }
  const kh = island(s, 'kestra'), vh = island(s, 'voruna');
  if (vh.owner === BLUE) s.over = { winner: BLUE, week: s.week };
  else if (kh.owner === RED) s.over = { winner: RED, week: s.week };
  if (!s.over) { for (const e of reinforce(s)) yield e; mergeStacks(s); }
  s.units.forEach((u) => { delete u.moved; delete u.landed; delete u.blind; delete u.from; });
  s.recon = { blue: [], red: [] }; s.flights = { blue: 0, red: 0 };
  s.week++;
  yield { type: 'week', week: s.week };
  if (s.over) yield { type: 'over', winner: s.over.winner };
}

function reinforce(s) {
  const out = [];
  for (const side of [BLUE, RED]) {
    const home = island(s, side === BLUE ? 'kestra' : 'voruna');
    const hq = section(home, 'hq');
    if (hq.owner !== side) continue; // no HQ, no reinforcements
    let troops = 1 + ownedSecs(s, side, 'depot');
    let gained = 0;
    while (troops > 0) {
      const here = armiesIn(s, home.id, 'hq', side);
      let a = here.find((u) => u.str < MAX_STR.army);
      if (!a && here.length >= HOME_STACK) break;
      if (!a) a = addUnit(s, side, 'army', home.id, 0, 'hq');
      const add = Math.min(troops, MAX_STR.army - a.str);
      a.str += add; troops -= add; gained += add;
    }
    let ships = 0;
    if (s.week % 2 === 0 && section(home, 'port').owner === side) {
      let f = unitsAt(s, home.id, side, 'fleet').find((u) => u.str < MAX_STR.fleet);
      if (!f && unitsAt(s, home.id, side, 'fleet').length < 1) f = addUnit(s, side, 'fleet', home.id, 0);
      if (f) { f.str += 1; ships = 1; }
    }
    out.push({ type: 'reinforce', side, island: home.id, troops: gained, ships });
  }
  return out;
}

function mergeStacks(s) {
  for (const isl of s.islands) {
    for (const side of [BLUE, RED]) {
      const groups = {};
      unitsAt(s, isl.id, side).forEach((u) => { const k = `${u.kind}:${u.sec}`; (groups[k] = groups[k] || []).push(u); });
      for (const [k, list] of Object.entries(groups)) {
        if (list.length < 2) continue;
        const kind = k.split(':')[0];
        list.sort((a, b) => b.str - a.str);
        let total = list.reduce((n, u) => n + u.str, 0);
        list.forEach((u) => { const v = Math.min(MAX_STR[kind], total); u.str = v; total -= v; });
        list.filter((u) => u.str <= 0).forEach((u) => removeUnit(s, u));
      }
    }
  }
}

// Synchronous week for node tests and sims. `retreat(b, side)` decides retreats; default is the AI rule for both sides.
export function endWeek(s, { ai = true, retreat } = {}) {
  const events = [];
  const decide = retreat || ((b, side) => aiWantsRetreat(b, side));
  for (const st of weekSteps(s, { ai })) {
    if (st.type === 'round' && !st.b.done) {
      for (const side of [BLUE, RED]) if (decide(st.b, side)) { retreatBattle(s, st.b, side); break; }
    }
    if (st.type === 'battle-end') events.push(battleEvent(st.b));
    else if (st.type !== 'round' && st.type !== 'battle-start') events.push(st);
  }
  return events;
}

// flat summary of a finished battle (kept compatible with r1/r2 event shapes)
export function battleEvent(b) {
  if (b.kind === 'naval') {
    return { type: 'naval', island: b.island, start: { blue: b.icons.blue.map((x) => x.kind), red: b.icons.red.map((x) => x.kind) }, shots: b.shotsAll, rounds: b.round, winner: b.winner, retreats: b.retreats || [], retreated: b.retreated };
  }
  return { type: 'landing', island: b.island, sec: b.sec, secKind: b.secKind, side: b.atk, won: b.winner === b.atk && !b.retreated, retreated: b.retreated, blind: b.blind,
    atk0: b.atk0, def0: b.def0, atkLeft: b.icons[b.atk].filter((i) => i.alive && i.kind === 'inf').length, defLeft: b.icons[b.def].filter((i) => i.alive).length,
    transportLoss: b.transportLoss, support: b.support, retreats: b.retreats || [], prevOwner: b.defOwner };
}
