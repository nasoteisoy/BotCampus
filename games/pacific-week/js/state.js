// Pure game rules for Island Front (r3). No DOM. Runs in the browser and in node tests.
// r3: islands are split into sections, fog of war + recon, round-by-round battles with retreat.

export const WORLD = { w: 2600, h: 1700 };
export const CIRCLE_R = 130;
export const RANGE = { army: 760, fleet: 900 };
export const AIR_RANGE = 900;      // strike / air-cover radius of a plane from its base (airfield section or carrier)
export const RECON_RANGE = 1300;   // a recon plane scouts one island this far from its base, once a week
// r7: troops cross water only on ships. A fleet lifts up to FLEET_LIFT army groups (embark from a beach, land on a beach).
export const FLEET_LIFT = 2;
// r7: planes. Four types, each based on an owned airfield section or a carrier (a fleet with a CV ship).
export const PLANE_TYPES = ['recon', 'fighter', 'bomber', 'torpedo'];
export const AIR_CAP = 4;          // planes per airfield section
export const CV_CAP = 2;           // planes per carrier ship
export const SEE = { adj: 480, fleet: 600, air: 600, contact: 950 };
export const MAX_STR = { army: 6, fleet: 6 };
export const HOME_STACK = 3;
export const BLUE = 'blue';
export const RED = 'red';
export const other = (s) => (s === BLUE ? RED : BLUE);

// ---- order of battle (r6) ----
// Every army is a regiment: 3 battalions of 3-4 companies (10 in all). Each company has 0-3 strength pips;
// a company at 0 has been wiped out and drops out of its battalion. Engine strength `u.str` stays the battle
// number (one fighter per point); the regiment always carries PIPS_PER_STR pips per point, so a full regiment
// (str 6) is 30 pips = 10 full companies. Losses take pips from the weakest company first, so companies wipe
// and battalions shrink; reinforcements fill the weakest (and re-form wiped companies). No randomness here.
export const CO_TYPES = ['inf', 'armor', 'art', 'eng', 'aa'];
export const CO_MAX = 3;
export const PIPS_PER_STR = 5;
const BN_SETS = [
  [['inf', 'inf', 'armor', 'eng'], ['inf', 'art', 'aa'], ['inf', 'inf', 'art']],
  [['inf', 'armor', 'armor', 'art'], ['inf', 'inf', 'eng'], ['inf', 'aa', 'art']],
];
// fleets: one ship per strength point, two-plus classes
export const SHIP_TYPES = ['bb', 'dd', 'cv'];
const SHIP_ORDER = ['bb', 'dd', 'dd', 'cv', 'dd', 'bb'];

function makeOob(u) {
  const set = BN_SETS[u.cmd % 2], rot = u.cmd % 3;
  const bns = [0, 1, 2].map((i) => {
    const types = set[(i + rot) % 3];
    return { n: i + 1, cmd: u.cmd * 10 + i + 1, w: COH_START, cos: types.map((type, j) => ({ id: `${i + 1}${'abcd'[j]}`, type, pips: 0, w: COH_START })) };
  });
  return { bns };
}
const allCos = (o) => o.bns.flatMap((b) => b.cos.map((c) => ({ c, b })));
const sumPips = (u) => allCos(u.oob).reduce((n, x) => n + x.c.pips, 0);
export const regPips = (u) => (u && u.kind === 'army' ? sumPips(syncOob(u)) : 0);
// bring the companies (or ships) in line with u.str; returns the unit for chaining
export function syncOob(u) {
  if (!u) return u;
  if (u.kind === 'fleet') {
    u.ships = u.ships || [];
    const n = Math.max(0, u.str);
    while (u.ships.length > n) u.ships.pop();
    while (u.ships.length < n) u.ships.push(SHIP_ORDER[u.ships.length % SHIP_ORDER.length]);
    return u;
  }
  if (!u.oob) u.oob = makeOob(u);
  const target = Math.max(0, Math.min(u.str, 10 * CO_MAX / PIPS_PER_STR)) * PIPS_PER_STR;
  let have = sumPips(u);
  const list = allCos(u.oob);
  const bnPips = (b) => b.cos.reduce((n, c) => n + c.pips, 0);
  while (have > target) {
    // weakest living company; ties go to the strongest battalion so damage spreads, then the rear company
    let pick = null;
    for (const x of list) {
      if (x.c.pips <= 0) continue;
      if (!pick || x.c.pips < pick.c.pips || (x.c.pips === pick.c.pips && bnPips(x.b) >= bnPips(pick.b))) pick = x;
    }
    pick.c.pips--; have--;
  }
  while (have < target) {
    let pick = null;
    for (const x of list) if (x.c.pips < CO_MAX && (!pick || x.c.pips < pick.c.pips)) pick = x;
    if (!pick) break;
    pick.c.pips++; have++;
  }
  return u;
}
// living companies (pips > 0) as a flat list, for the panel, tags and battle reports
export function companies(u) {
  syncOob(u);
  return u.oob ? allCos(u.oob).filter((x) => x.c.pips > 0).map((x) => ({ id: x.c.id, type: x.c.type, pips: x.c.pips, bn: x.b.n, w: x.c.w || 0 })) : [];
}
// battalions with their living companies (a battalion with none left drops out)
export function battalions(u) {
  syncOob(u);
  if (!u.oob) return [];
  return u.oob.bns.map((b) => ({ n: b.n, cmd: b.cmd, w: b.w || 0, cos: b.cos.filter((c) => c.pips > 0).map((c) => ({ ...c })) })).filter((b) => b.cos.length);
}
// what each unit had before a fight, so the week report can say which companies or ships were lost
function oobSnapshot(units) {
  const snap = {};
  for (const u of units) {
    syncOob(u);
    snap[u.id] = { side: u.side, kind: u.kind, cos: u.kind === 'fleet' ? u.ships.map((t, i) => ({ id: `s${i}`, type: t })) : companies(u).map((c) => ({ id: c.id, type: c.type, bn: c.bn })) };
  }
  return snap;
}
function oobLosses(s, snap) {
  const lost = { blue: [], red: [] };
  for (const [id, was] of Object.entries(snap)) {
    const u = unit(s, id);
    if (was.kind === 'fleet') {
      const left = u ? syncOob(u).ships.slice() : [];
      for (const c of was.cos) { const k = left.indexOf(c.type); if (k >= 0) left.splice(k, 1); else lost[was.side].push({ unit: id, type: c.type, ship: true }); }
      continue;
    }
    const alive = new Set(u ? companies(u).map((c) => c.id) : []);
    for (const c of was.cos) if (!alive.has(c.id)) lost[was.side].push({ unit: id, type: c.type, bn: c.bn });
  }
  if (s.stats.coLost) for (const side of [BLUE, RED]) s.stats.coLost[side] += lost[side].length; // companies + ships lost, for the end card
  return lost;
}

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
    planes: [], nextPid: 1, embark: {}, landOrd: {}, strikes: {}, strikeZ: {}, spotOrd: {}, flyOrd: {}, landPl: {}, zseen: { blue: [], red: [] },
    known: { blue: [], red: [] }, reconOrd: {}, // r8g3: known = zones a side has discovered for good (recon, or a unit that went there); reconOrd = queued recon flights
    stats: { navalWon: 0, navalFought: 0, landWon: 0, landFought: 0, lost: { blue: 0, red: 0 }, sunk: { blue: 0, red: 0 }, retreats: { blue: 0, red: 0 }, recon: { blue: 0, red: 0 }, coLost: { blue: 0, red: 0 } },
    lastArrows: [],
    supply: { blue: START_SUPPLY, red: START_SUPPLY }, lastIncome: { blue: 0, red: 0 }, // r9: supply points
  };
  addUnit(s, BLUE, 'army', 'kestra', 4, 'b2');
  addUnit(s, BLUE, 'army', 'kestra', 3, 'hq');
  addUnit(s, BLUE, 'fleet', 'kestra', 4);
  addUnit(s, BLUE, 'army', 'tallow', 2, 'depot');
  addUnit(s, RED, 'army', 'voruna', 4, 'b1');
  addUnit(s, RED, 'army', 'voruna', 4, 'hq');
  addUnit(s, RED, 'fleet', 'voruna', 4);
  addUnit(s, RED, 'army', 'ruvo', 2, 'air');
  // r7 air wings: home airfield fighter + bomber + recon, second airfield a recon plane, the carrier a fighter + torpedo plane
  const bf = s.units.find((u) => u.side === BLUE && u.kind === 'fleet'), rf = s.units.find((u) => u.side === RED && u.kind === 'fleet');
  for (const t of ['fighter', 'bomber', 'recon']) addPlane(s, BLUE, t, { isl: 'kestra', sec: 'air' });
  addPlane(s, BLUE, 'recon', { isl: 'merren', sec: 'air' });
  for (const t of ['fighter', 'torpedo']) addPlane(s, BLUE, t, { fleet: bf.id });
  for (const t of ['fighter', 'bomber', 'recon']) addPlane(s, RED, t, { isl: 'voruna', sec: 'air' });
  addPlane(s, RED, 'recon', { isl: 'ruvo', sec: 'air' });
  for (const t of ['fighter', 'torpedo']) addPlane(s, RED, t, { fleet: rf.id });
  return s;
}

export function addUnit(s, side, kind, at, str, sec = null) {
  const u = { id: `${side[0]}${kind[0]}${s.nextId++}`, side, kind, at, str, cmd: s.nextCmd++, sec: kind === 'army' ? sec : null };
  s.units.push(syncOob(u));
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
// r7: air cover over a sea fight = the side's fighters and torpedo planes whose base is in range (carrier or owned airfield)
// r8g: a fighter joins only when it is already in the air over that island (CAP); a torpedo plane joins when it is in the
// air over that island or still on a base in range.
export function airfieldsNear(s, side, isl) {
  return (s.planes || []).filter((p) => p.side === side && (p.type === 'fighter' || p.type === 'torpedo')).filter((p) => {
    if (p.air) return p.air.isl === isl.id;
    if (p.type === 'fighter') return false;
    const b = planeBase(s, p); return b && dist(b, isl) <= AIR_RANGE;
  }).length;
}

// ---- planes (r7) ----
// A plane always has a base: an owned airfield section { isl, sec } or a carrier { fleet } (a fleet holding a CV ship).
// planeBase returns where it flies from, or null when the base is gone (airfield lost, carrier sunk): then it cannot launch.
export function planeBase(s, p) {
  if (!p || !p.base) return null;
  if (p.base.fleet) {
    const f = unit(s, p.base.fleet);
    if (!f || f.kind !== 'fleet' || f.side !== p.side || !syncOob(f).ships.includes('cv')) return null;
    const i = island(s, f.at);
    return { x: i.x, y: i.y, isl: i.id, fleet: f.id };
  }
  const i = island(s, p.base.isl), x = i && section(i, p.base.sec);
  if (!x || (x.kind !== 'air' && !x.field) || x.owner !== p.side) return null; // r9: a built airfield (x.field) is a base too
  return { x: x.x, y: x.y, isl: i.id, sec: x.id };
}
const baseKey = (b) => (b.fleet ? `f:${b.fleet}` : `a:${b.isl}:${b.sec}`);
export function baseCap(s, base) {
  if (base.fleet) { const f = unit(s, base.fleet); return f && f.kind === 'fleet' ? syncOob(f).ships.filter((t) => t === 'cv').length * CV_CAP : 0; }
  return AIR_CAP;
}
export const planesAt = (s, base) => (s.planes || []).filter((p) => baseKey(p.base) === baseKey(base));
export const baseRoom = (s, base) => baseCap(s, base) - planesAt(s, base).length;
export function validBase(s, side, base) {
  if (!base || (!base.fleet && !(base.isl && base.sec))) return false;
  return !!planeBase(s, { side, base });
}
export function addPlane(s, side, type, base) {
  if (!PLANE_TYPES.includes(type) || !validBase(s, side, base) || baseRoom(s, base) <= 0) return null;
  const p = { id: `${side[0]}p${s.nextPid++}`, side, type, base: base.fleet ? { fleet: base.fleet } : { isl: base.isl, sec: base.sec }, used: false };
  s.planes.push(p);
  return p;
}
export const plane = (s, id) => (s.planes || []).find((p) => p.id === id);
// bombers hit land, torpedo planes hit ships, fighters escort a strike (they cancel interceptors); recon flies recon()
export function canStrike(s, pid, toId, sec = null) {
  const p = plane(s, pid);
  if (!p || s.over || p.used || p.type === 'recon' || p.air || (s.flyOrd && s.flyOrd[pid])) return false; // r8g: not while airborne / ordered up
  const b = planeBase(s, p), t = island(s, toId);
  if (!b || !t) return false;
  if (b.fleet && s.orders[b.fleet]) return false; // a carrier that sails this week cannot launch
  if (dist(b, t) > AIR_RANGE) return false;
  // r8g ask 9: a fogged target is fine (scouting first is optional). A strike goes to one zone: a bomber to a section,
  // a torpedo plane to the sea. Where that zone is seen it must hold something to hit; a fogged zone is a blind strike.
  if (sec != null && (!section(t, sec) || p.type !== 'bomber')) return false;
  const zone = p.type === 'bomber' ? sec : null;
  const zv = zoneVision(s, p.side);
  if (p.type === 'bomber' && zone == null && !vision(s, p.side, zv).has(t.id)) return false; // whole-island bomb run only where every zone is seen
  const zSeen = zone == null ? vision(s, p.side, zv).has(t.id) || (p.type === 'torpedo' && zv.has(zkey(t.id))) : zv.has(zkey(t.id, zone));
  if (zSeen && p.type !== 'fighter') {
    const fortIn = (x) => x.owner !== p.side && x.gar > 0;
    const ok = zone != null ? fortIn(section(t, zone)) || s.units.some((u) => u.side !== p.side && u.kind === 'army' && u.at === t.id && u.sec === zone)
      : t.secs.some(fortIn) || s.units.some((u) => u.side !== p.side && u.at === t.id);
    if (!ok) return false;
  }
  // fighters fly escort: only over an island your bombers / torpedo planes are already ordered to hit
  if (p.type === 'fighter') return Object.entries(s.strikes).some(([id, to]) => { const q = plane(s, id); return to === toId && q && q.side === p.side && q.type !== 'fighter'; });
  return true;
}
export function issueStrike(s, pid, toId, sec = null) {
  if (!s.strikeZ) s.strikeZ = {};
  if (!toId) { delete s.strikes[pid]; delete s.strikeZ[pid]; return true; }
  if (!canStrike(s, pid, toId, sec)) return false;
  s.strikes[pid] = toId;
  if (sec) s.strikeZ[pid] = sec; else delete s.strikeZ[pid];
  if (s.flyOrd) delete s.flyOrd[pid];
  return true;
}
export const strikeTargets = (s, pid) => s.islands.filter((i) => canStrike(s, pid, i.id)).map((i) => i.id);

// ---- r8g: planes in the air (asks 5, 6, 7) ----
// A plane is on its base (an owned airfield zone or a carrier) or in the air over one island (p.air = { isl, sec, wk }).
// - Fly: a plane on its base takes off to any island within AIR_RANGE of the base (over its own airfield / carrier = CAP).
//   It goes up at the start of the next End Week, before strikes and battles, and stays up for that whole week.
// - Land: it may only come down on an owned airfield zone or a carrier (never a beach / land / HQ zone), within AIR_RANGE
//   of the island it is over, with room. It comes down at the start of the following End Week (one turn in the air).
// - Must land: a plane never stays up two weeks. With no landing order it returns to its own base if that is still
//   valid and in range, else the nearest own airfield / carrier in range with room. Nowhere to land: the plane is lost.
// - CAP: only a fighter that is already in the air over an island joins a sea fight there or intercepts a strike there.
export const isAirborne = (p) => !!(p && p.air);
function landSpots(s, side) {
  const out = [];
  for (const i of s.islands) for (const x of i.secs) if (x.kind === 'air' && x.owner === side) out.push({ base: { isl: i.id, sec: x.id }, x: x.x, y: x.y });
  for (const f of s.units) if (f.kind === 'fleet' && f.side === side && syncOob(f).ships.includes('cv')) { const i = island(s, f.at); out.push({ base: { fleet: f.id }, x: i.x, y: i.y }); }
  return out;
}
const normBase = (b) => (b.fleet ? { fleet: b.fleet } : { isl: b.isl, sec: b.sec });
export function canFly(s, pid, islId, sec = null) {
  const p = plane(s, pid);
  if (!p || s.over || p.air || p.used) return false;
  const b = planeBase(s, p), t = island(s, islId);
  if (!b || !t) return false;
  if (b.fleet && s.orders[b.fleet]) return false; // a carrier that sails this week launches nothing
  if (sec != null && !section(t, sec)) return false;
  return dist(b, t) <= AIR_RANGE;
}
export function issueFly(s, pid, islId, sec = null) {
  if (!s.flyOrd) s.flyOrd = {};
  if (!islId) { delete s.flyOrd[pid]; return true; }
  if (!canFly(s, pid, islId, sec)) return false;
  delete s.strikes[pid];
  s.flyOrd[pid] = { isl: islId, sec: sec || null };
  return true;
}
// is `base` a place this plane may come down on (from the island it is over)? pending = other planes already told to land there
function landOk(s, p, base, overId, pending = 0) {
  if (!base || !validBase(s, p.side, base)) return false;
  const at = planeBase(s, { side: p.side, base }), over = island(s, overId);
  if (!at || !over || dist(at, over) > AIR_RANGE) return false;
  return baseKey(base) === baseKey(p.base) || baseRoom(s, base) - pending > 0;
}
export function canLandPlane(s, pid, base) {
  const p = plane(s, pid);
  if (!p || s.over || !p.air) return false;
  const pending = Object.entries(s.landPl || {}).filter(([id, b]) => id !== pid && b && baseKey(b) === baseKey(base) && baseKey(plane(s, id) ? plane(s, id).base : b) !== baseKey(b)).length;
  return landOk(s, p, base, p.air.isl, pending);
}
export function issuePlaneLand(s, pid, base) {
  if (!s.landPl) s.landPl = {};
  if (!base) { delete s.landPl[pid]; return true; }
  if (!canLandPlane(s, pid, base)) return false;
  s.landPl[pid] = normBase(base);
  return true;
}
// every place this airborne plane could land now, nearest first
export function landTargets(s, pid) {
  const p = plane(s, pid); if (!p || !p.air) return [];
  const over = island(s, p.air.isl);
  return landSpots(s, p.side).filter((c) => canLandPlane(s, pid, c.base)).sort((a, b) => dist(a, over) - dist(b, over)).map((c) => c.base);
}
// start of End Week: planes in the air come down (ordered spot, else home, else nearest; else lost), then ordered planes go up
function airPhase(s, flyOrd, landPl) {
  const landed = [], lost = [], up = [];
  for (const p of [...s.planes].filter((q) => q.air).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const overId = p.air.isl, over = island(s, overId);
    let to = landOk(s, p, landPl[p.id], overId) ? landPl[p.id] : landOk(s, p, p.base, overId) ? p.base : null;
    if (!to) { const c = landSpots(s, p.side).filter((q) => landOk(s, p, q.base, overId)).sort((a, b) => dist(a, over) - dist(b, over))[0]; to = c ? c.base : null; }
    const from = { isl: overId, sec: p.air.sec || null };
    if (to) { p.base = normBase(to); delete p.air; p.used = true; landed.push({ plane: p.id, side: p.side, type: p.type, from, to: normBase(to) }); }
    else { s.planes = s.planes.filter((q) => q !== p); lost.push({ plane: p.id, side: p.side, type: p.type, from }); }
  }
  for (const [pid, o] of Object.entries(flyOrd || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const p = plane(s, pid); if (!p || p.air || p.used || !o) continue;
    const b = planeBase(s, p), t = island(s, o.isl);
    if (!b || !t || dist(b, t) > AIR_RANGE) continue;
    p.air = { isl: o.isl, sec: o.sec || null, wk: s.week };
    up.push({ plane: p.id, side: p.side, type: p.type, from: { x: b.x, y: b.y }, to: o.isl, sec: o.sec || null });
  }
  return { landed, lost, up };
}

// ---- r8g (ask 8): land units cross water only aboard a fleet ----
// An army never changes island by itself: canOrder refuses armies, canSecOrder only follows links inside its own island.
// It boards a friendly fleet from an owned beach (room for FLEET_LIFT groups per fleet), sails with it, and lands on a
// beach of the island the fleet is at. transportRoom is the room left on a fleet this week.
export function transportRoom(s, f) {
  if (!f || f.kind !== 'fleet') return 0;
  return Math.max(0, FLEET_LIFT - carried(s, f).length - Object.values(s.embark || {}).filter((id) => id === f.id).length);
}

// ---- fog of war (r8g ask 9: by zone) ----
// r8g3: s.known[side] is the lasting store (a recon flight, or an army / fleet that went into a zone). s.recon (this week's
// flights) and s.zseen (strike peeks) still fade at End Week; they never remove anything from s.known.
// The AI plans on the sight it always had (this week's flights + what it stands on), so r8g3 does not retune it.
let aiPlanning = false;
export function learn(s, side, keys) { if (!s.known) s.known = { blue: [], red: [] }; if (!s.known[side]) s.known[side] = []; for (const k of keys) if (!s.known[side].includes(k)) s.known[side].push(k); }
export function learnUnits(s) {
  for (const u of s.units) {
    if (u.str <= 0 || u.aboard) continue;
    if (u.kind === 'army' && u.sec) learn(s, u.side, [zkey(u.at, u.sec)]);
    if (u.kind === 'fleet') { const sp = fleetSpot(s, u); learn(s, u.side, sp ? [zkey(u.at), zkey(u.at, sp)] : [zkey(u.at)]); }
  }
}
// Sight is per zone: every section of an island is a zone, plus the island's sea ('isl:sea').
// A side sees: the zones it owns (an owned beach or dock also sees the sea there); the zone each of its armies stands in;
// the sea where each of its fleets is (and the beach / dock it is docked at); the zone a plane of its is in the air over;
// a zone one of its strikes flew to this week (s.zseen). Only a recon flight sees every zone of an island.
// Any unit may move into / attack a fogged zone; it then sees only that zone. vision() = islands seen in every zone.
export const zkey = (isl, sec) => `${isl}:${sec || 'sea'}`;
export function zoneVision(s, side) {
  const z = new Set();
  for (const id of s.recon[side] || []) { const i = island(s, id); if (!i) continue; z.add(zkey(id)); for (const x of i.secs) z.add(zkey(id, x.id)); }
  for (const k of (s.zseen && s.zseen[side]) || []) z.add(k);
  if (!aiPlanning) for (const k of (s.known && s.known[side]) || []) z.add(k); // r8g3: discoveries stay after End Week
  for (const i of s.islands) for (const x of i.secs) if (x.owner === side) { z.add(zkey(i.id, x.id)); if (x.kind === 'beach' || x.kind === 'port') z.add(zkey(i.id)); }
  for (const u of s.units) {
    if (u.side !== side) continue;
    if (u.kind === 'army' && u.sec) z.add(zkey(u.at, u.sec));
    if (u.kind === 'fleet') { z.add(zkey(u.at)); const sp = fleetSpot(s, u); if (sp) z.add(zkey(u.at, sp)); }
    if (perkOf(u) === 'scout' && !u.aboard) scoutZones(s, u).forEach((k) => z.add(k)); // r9: a 'scout' commander sees the next zones too
  }
  for (const p of s.planes || []) if (p.side === side && p.air) z.add(zkey(p.air.isl, p.air.sec));
  return z;
}
export function vision(s, side, z = zoneVision(s, side)) {
  return new Set(s.islands.filter((i) => i.secs.every((x) => z.has(zkey(i.id, x.id)))).map((i) => i.id));
}
export const zoneSeen = (s, side, isl, sec) => zoneVision(s, side).has(zkey(isl, sec));
// Contact: known that something is there, strength unknown ('?').
export function contact(s, side, islId) {
  const i = island(s, islId);
  return s.units.some((u) => u.side === side && dist(island(s, u.at), i) <= SEE.contact) || s.islands.some((j) => ownsAny(j, side) && dist(j, i) <= SEE.contact);
}
// r7: recon is flown by recon planes (one flight each per week) from their airfield or carrier
const reconPlanes = (s, side) => (s.planes || []).filter((p) => p.side === side && p.type === 'recon' && !p.used && !p.air && !(s.flyOrd && s.flyOrd[p.id]) && !(s.reconOrd && s.reconOrd[p.id]) && planeBase(s, p));
export function reconSources(s, side) {
  return reconPlanes(s, side).map((p) => { const b = planeBase(s, p); return { island: b.isl, sec: b.sec || null, fleet: b.fleet || null, x: b.x, y: b.y, plane: p.id }; });
}
export const flightsLeft = (s, side) => reconPlanes(s, side).length;
export function reconTargets(s, side) {
  if (!flightsLeft(s, side)) return [];
  const v = vision(s, side), src = reconSources(s, side);
  return s.islands.filter((i) => !v.has(i.id) && src.some((p) => dist(p, i) <= RECON_RANGE)).map((i) => i.id);
}
export function recon(s, side, islId, planeId) {
  if (!reconTargets(s, side).includes(islId)) return null;
  const i = island(s, islId);
  const from = reconSources(s, side).filter((p) => dist(p, i) <= RECON_RANGE && (!planeId || p.plane === planeId)).sort((a, b) => dist(a, i) - dist(b, i))[0];
  if (!from) return null;
  plane(s, from.plane).used = true;
  s.flights[side]++; s.recon[side].push(islId); s.stats.recon[side]++;
  learn(s, side, [zkey(islId), ...i.secs.map((x) => zkey(islId, x.id))]); // r8g3: a scouted island stays scouted
  return { from, to: islId, plane: from.plane };
}
// r8g3: the player's recon is an End Week order (like the other air orders). It flies first thing at End Week (before any
// move), then recon() above reveals the island for good. Out of range / already seen / plane busy = refused, nothing spent.
export function canRecon(s, pid, islId) {
  const p = plane(s, pid), i = island(s, islId);
  if (!p || !i || s.over || p.type !== 'recon') return false;
  if (!reconPlanes(s, p.side).some((q) => q.id === pid)) return false;
  const b = planeBase(s, p); if (!b || (b.fleet && s.orders[b.fleet])) return false;
  if (vision(s, p.side).has(islId)) return false;
  if (Object.entries(s.reconOrd || {}).some(([q, t]) => t === islId && plane(s, q) && plane(s, q).side === p.side)) return false;
  return dist(b, i) <= RECON_RANGE;
}
export function issueRecon(s, pid, islId) {
  if (!s.reconOrd) s.reconOrd = {};
  if (!islId) { delete s.reconOrd[pid]; return true; }
  if (!canRecon(s, pid, islId)) return false;
  s.reconOrd[pid] = islId;
  return true;
}

// ---- orders ----
// Island-to-island orders are for fleets only (r7). Armies cross water by embarking on a fleet (canEmbark / canLand).
export function canOrder(s, u, toId) {
  if (!u || s.over) return false;
  if (toId === u.at) return true; // cancel
  if (u.kind !== 'fleet') return false;
  return inReach(s, u, toId);
}
// plain distance reach (fleets sail this far in a week; the AI also uses it to pick army targets)
export function inReach(s, u, toId) {
  const a = island(s, u.at), b = island(s, toId);
  return !!a && !!b && toId !== u.at && dist(a, b) <= RANGE[u.kind] + (perkOf(u) === 'move' ? MOVE_PERK : 0); // r9: a 'move' commander sails further
}
export function reachable(s, u) {
  return s.islands.filter((i) => i.id !== u.at && canOrder(s, u, i.id)).map((i) => i.id);
}
// Island-to-island move. Armies land on a beach (or a friendly port); `sec` picks the beach.
export function issueOrder(s, unitId, toId, sec) {
  const u = unit(s, unitId);
  if (!canOrder(s, u, toId)) return false;
  delete s.secOrders[unitId]; delete s.landAt[unitId]; delete s.embark[unitId]; delete s.landOrd[unitId];
  if (s.spotOrd) delete s.spotOrd[unitId]; // r8e: a plain island order sails to open sea there
  if (toId === u.at) { delete s.orders[unitId]; return true; }
  s.orders[unitId] = toId;
  if (u.kind === 'fleet') {
    // troops aboard can only land where the fleet ends up; a sailing carrier launches nothing this week
    for (const a of carried(s, u)) if (s.landOrd[a.id] && s.landOrd[a.id].isl !== toId) delete s.landOrd[a.id];
    for (const p of s.planes) if (p.base.fleet === u.id) { delete s.strikes[p.id]; if (s.flyOrd) delete s.flyOrd[p.id]; }
  }
  return true;
}

// ---- sealift (r7): beach -> ship -> sail -> beach ----
export const carried = (s, f) => s.units.filter((u) => u.kind === 'army' && u.aboard === f.id);
const boarding = (s, f) => Object.entries(s.embark).filter(([, fid]) => fid === f.id).map(([id]) => id);
// an army standing on a friendly beach may board a friendly fleet in that island's waters (room for FLEET_LIFT groups)
export function canEmbark(s, u, fleetId) {
  if (!u || s.over || u.kind !== 'army' || u.aboard || !u.sec) return false;
  const f = unit(s, fleetId), isl = island(s, u.at), x = section(isl, u.sec);
  if (!f || f.kind !== 'fleet' || f.side !== u.side || f.at !== u.at) return false;
  if (!x || x.kind !== 'beach' || x.owner !== u.side) return false;
  const load = carried(s, f).length + boarding(s, f).filter((id) => id !== u.id).length;
  return load < FLEET_LIFT;
}
export function issueEmbark(s, unitId, fleetId) {
  const u = unit(s, unitId);
  if (!canEmbark(s, u, fleetId)) return false;
  delete s.secOrders[unitId]; delete s.orders[unitId]; delete s.landAt[unitId];
  s.embark[unitId] = fleetId;
  return true;
}
// where an army aboard can land: a beach of the island its fleet is at (or sails to this week)
export function landIsland(s, u) {
  const f = u && u.aboard && unit(s, u.aboard);
  return f ? s.orders[f.id] || f.at : null;
}
export function canLand(s, u, secId) {
  if (!u || s.over || u.kind !== 'army' || !u.aboard) return false;
  const to = landIsland(s, u), x = to && section(island(s, to), secId);
  return !!x && x.kind === 'beach';
}
export function issueLand(s, unitId, secId) {
  const u = unit(s, unitId);
  if (!secId) { delete s.landOrd[unitId]; return true; }
  if (!canLand(s, u, secId)) return false;
  s.landOrd[unitId] = { isl: landIsland(s, u), sec: secId };
  return true;
}
// ---- r8e: where a fleet sits in an island's waters (position only; no combat effect) ----
// A fleet is either out at sea in the waters of island `at` (spot null) or docked at one of that island's beaches
// (spot { isl, sec }). Every rule still reads `at` only; a stale spot (fleet moved by retreat / merge) reads as sea.
// r8g (ask 4): ships go only where there is water: open sea, a beach or a dock (port). Never a land, airfield or HQ zone.
export const SHIP_ZONES = ['beach', 'port'];
export const shipZone = (x) => !!x && SHIP_ZONES.includes(x.kind);
export function fleetSpot(s, f) {
  if (!f || f.kind !== 'fleet' || !f.spot || f.spot.isl !== f.at) return null;
  const x = section(island(s, f.at), f.spot.sec);
  return shipZone(x) ? x.id : null;
}
export function canFleetMove(s, fid, toId, sec = null) {
  const f = unit(s, fid);
  if (!f || f.kind !== 'fleet' || s.over) return false;
  if (toId !== f.at && !canOrder(s, f, toId)) return false; // same reach rule as any fleet order
  if (sec == null) return true;
  return shipZone(section(island(s, toId), sec));
}
// toId === at: reposition in its own waters now (sea <-> beach; no move order, nothing else changes).
// toId !== at: the normal fleet order to toId, arriving at sea or docked at beach `sec`.
export function issueFleetMove(s, fid, toId, sec = null) {
  if (!canFleetMove(s, fid, toId, sec)) return false;
  const f = unit(s, fid);
  if (!s.spotOrd) s.spotOrd = {};
  if (toId === f.at) {
    if (s.orders[fid]) issueOrder(s, fid, f.at); // cancels a planned sail
    f.spot = sec ? { isl: toId, sec } : null; delete s.spotOrd[fid];
    return true;
  }
  if (!issueOrder(s, fid, toId)) return false;
  s.spotOrd[fid] = sec ? { isl: toId, sec } : null;
  return true;
}
// r7b: would a landing at islId this week go in under the guns of a stronger enemy fleet (as far as `side` can see)?
// own = friendly fleets there now or ordered there; foe = visible enemy fleets there now. Unscouted: unknown.
export function landingRisk(s, side, islId) {
  const seen = vision(s, side).has(islId);
  const own = s.units.filter((u) => u.side === side && u.kind === 'fleet' && (s.orders[u.id] ? s.orders[u.id] === islId : u.at === islId)).reduce((n, u) => n + u.str, 0);
  const foe = seen ? s.units.filter((u) => u.side !== side && u.kind === 'fleet' && u.at === islId).reduce((n, u) => n + u.str, 0) : 0;
  return { own, foe, seen, risk: seen && foe > own };
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
  if (!u || u.kind !== 'army' || s.over || !u.sec || u.aboard) return false;
  const isl = island(s, u.at), cur = section(isl, u.sec);
  return secId === u.sec || cur.links.includes(secId);
}
export function issueSecOrder(s, unitId, secId) {
  const u = unit(s, unitId);
  if (!canSecOrder(s, u, secId)) return false;
  delete s.orders[unitId]; delete s.landAt[unitId]; delete s.embark[unitId];
  if (secId === u.sec) delete s.secOrders[unitId]; else s.secOrders[unitId] = secId;
  return true;
}

// ---- AI (any side): recon first, then island attacks, inland pushes, fleets ----
export function aiOrders(s, side = RED) {
  aiPlanning = true;
  try { return aiOrders0(s, side); } finally { aiPlanning = false; }
}
function aiOrders0(s, side) {
  const foe = other(side);
  const homeId = side === RED ? 'voruna' : 'kestra';
  const foeHomeId = side === RED ? 'kestra' : 'voruna';
  const home = island(s, homeId);
  const armyStr = (list) => list.reduce((n, u) => n + u.str, 0);
  // 1. recon: fly at the most valuable unseen targets
  const val = (i) => (i.id === foeHomeId ? 8 : 0) + ({ supply: 3, air: 2.5, home: 6, plain: 1 }[i.type]) + (i.owner === foe ? 1 : 0);
  // r8g ask 9: every landing on a fogged beach is an ambush, so scout where our troops are headed first
  const goals = new Set(s.units.filter((u) => u.side === side && u.goal).map((u) => u.goal.to));
  const rv = (i) => val(i) + (goals.has(i.id) ? 10 : 0);
  for (const id of reconTargets(s, side).map((id) => island(s, id)).sort((a, b) => rv(b) - rv(a)).map((i) => i.id)) {
    if (!flightsLeft(s, side)) break;
    recon(s, side, id);
  }
  const seen = vision(s, side);
  s.aiMemo = s.aiMemo || {};
  const memo = (s.aiMemo[side] = s.aiMemo[side] || {});
  // r8g ask 9: sight is per zone, so is the AI's memory. A seen zone counts what is there (and is remembered); a fogged
  // zone counts what was last seen there, else a guess (2, an enemy home zone 4).
  const zvA = zoneVision(s, side);
  const islDef = (i) => {
    let d = i.type === 'home' ? 1 : 0;
    for (const x of i.secs) {
      const k = 'z:' + zkey(i.id, x.id);
      if (zvA.has(zkey(i.id, x.id))) { memo[k] = secDef(s, i, x, side); d += memo[k]; }
      else d += k in memo ? memo[k] : x.owner === side ? 0 : i.id === foeHomeId ? 4 : 2;
    }
    if (seen.has(i.id)) memo[i.id] = d;
    return seen.has(i.id) ? d : Math.max(3, d); // unknown: assume a fight
  };
  // r8g (ask 8): armies cross water only on ships, so the threat to home is what enemy fleets near home can lift
  // (FLEET_LIFT groups each) plus enemy troops already on the home island; troops with no ship are no threat.
  const foeNear = s.units.filter((u) => u.side === foe && u.kind === 'army' && dist(island(s, u.at), home) <= RANGE.army);
  const lift = FLEET_LIFT * s.units.filter((u) => u.side === foe && u.kind === 'fleet' && dist(island(s, u.at), home) <= RANGE.fleet * 1.5).length;
  const threat = armyStr(foeNear.filter((u) => u.at === homeId)) + armyStr(foeNear.filter((u) => u.at !== homeId).sort((p, q) => (q.aboard ? 1 : 0) - (p.aboard ? 1 : 0) || q.str - p.str).slice(0, lift));
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
      if (t.d === 0) {
        // r8g: an empty beach / dock under enemy ships is where their troops land next: hold it with the strongest two
        const hot = (t.x.kind === 'beach' || t.x.kind === 'port') && unitsAt(s, isl.id, foe, 'fleet').length;
        for (const u of hot ? avail.slice(0, 2) : [avail[avail.length - 1]]) { s.secOrders[u.id] = t.x.id; used.add(u.id); }
        continue;
      }
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
  // r7: armies travel by sea. Each free army gets a goal (island + beach) that it keeps across weeks; a transport pass
  // below walks it to a beach, boards a fleet, sails and lands.
  const intents = new Map();
  for (const id of [...free]) {
    const u = unit(s, id), gl = u.goal;
    if (gl && (gl.to !== u.at || u.aboard) && island(s, gl.to).secs.some((x) => x.owner !== side)) { intents.set(id, gl); free.delete(id); continue; }
    delete u.goal;
  }
  const armyNear = (u, i) => dist(island(s, u.at), i) <= RANGE.army * 1.5; // a sea trip may take more than one week
  const targets = s.islands.filter((i) => i.owner !== side && !unitsAt(s, i.id, side, 'army').some((u) => u.sec)).map((i) => {
    const near = Math.min(...s.units.filter((u) => u.side === side && u.kind === 'army').map((u) => dist(island(s, u.at), i)), 1e6);
    const d = islDef(i);
    const late = s.week > 30 && i.id === foeHomeId ? 6 + (s.week - 30) / 3 : 0; // a long war turns on the enemy home
    return { i, d, score: val(i) + late - d * 0.3 - near / 350 + s.rand() * 0.8 };
  }).sort((a, b) => b.score - a.score);
  for (const t of targets) {
    const reach = s.week > 30 && t.i.id === foeHomeId ? 2400 : RANGE.army * 1.5;
    const have = [...intents.entries()].filter(([, g]) => g.to === t.i.id).reduce((n, [id]) => n + unit(s, id).str, 0);
    const cands = [...free].map((id) => unit(s, id)).filter((u) => dist(island(s, u.at), t.i) <= reach && u.at !== t.i.id)
      .sort((a, b) => dist(island(s, a.at), t.i) - dist(island(s, b.at), t.i));
    // first beach fight is what matters now; keep enough for it plus a margin
    const beach = section(t.i, landingBeach(s, cands[0] || { at: t.i.id, side }, t.i));
    const bd = seen.has(t.i.id) ? secDef(s, t.i, beach, side) : Math.max(2, Math.round(t.d / 2));
    const need = Math.max(Math.ceil(bd * 1.4) + 1, Math.ceil(t.d * 0.6));
    const pick = []; let sum = have;
    for (const u of cands) { if (sum >= need) break; pick.push(u); sum += u.str; }
    if (sum < need) continue;
    pick.forEach((u) => { intents.set(u.id, { to: t.i.id, sec: beach.id }); free.delete(u.id); });
  }
  // idle armies: reinforce a fight already going on, else stage toward the enemy home
  const foeHome = island(s, foeHomeId);
  for (const id of free) {
    const u = unit(s, id);
    if (u.at === homeId && threat > 0 && !u.aboard && unitsAt(s, homeId, side, 'army').length <= HOME_STACK * 2) continue; // r8g: a crowded home sends its spare troops out
    const fight = s.islands.filter((i) => i.id !== u.at && ownsAny(i, side) && i.secs.some((x) => x.owner !== side) && armyNear(u, i))
      .sort((a, b) => dist(a, island(s, u.at)) - dist(b, island(s, u.at)))[0];
    if (fight) { intents.set(id, { to: fight.id, sec: landingBeach(s, u, fight) }); continue; }
    const here = island(s, u.at);
    const step = s.islands.filter((i) => i.owner === side && armyNear(u, i) && i.id !== u.at).sort((a, b) => dist(a, foeHome) - dist(b, foeHome))[0];
    if (step && dist(step, foeHome) < dist(here, foeHome) - 60) intents.set(id, { to: step.id, sec: landingBeach(s, u, step) });
    else if (u.aboard) intents.set(id, { to: u.at, sec: landingBeach(s, u, here) }); // nowhere to go: get off the ship
  }
  // ---- transport pass ----
  const fleets = s.units.filter((u) => u.side === side && u.kind === 'fleet');
  const fleetDest = new Map(), pickups = new Map();
  const sailToward = (f, to) => {
    if (to === f.at) return f.at;
    if (inReach(s, f, to)) return to;
    const t = island(s, to);
    const best = s.islands.filter((i) => inReach(s, f, i.id)).sort((a, b) => dist(a, t) - dist(b, t))[0];
    return best && dist(best, t) < dist(island(s, f.at), t) ? best.id : f.at;
  };
  const stepToBeach = (isl, u) => {
    const ok = (x) => x.owner === side && !armiesIn(s, isl.id, x.id, foe).length;
    const prev = { [u.sec]: null }, q = [u.sec];
    while (q.length) {
      const c = q.shift();
      if (c !== u.sec && section(isl, c).kind === 'beach') { let st = c; while (prev[st] !== u.sec) st = prev[st]; return st; }
      for (const l of section(isl, c).links) if (!(l in prev) && ok(section(isl, l))) { prev[l] = c; q.push(l); }
    }
    return null;
  };
  for (const [id, gl] of intents) {
    const u = unit(s, id); u.goal = gl;
    if (u.aboard) {
      const f = unit(s, u.aboard);
      if (!fleetDest.has(f.id)) fleetDest.set(f.id, sailToward(f, gl.to));
      continue;
    }
    if (u.at === gl.to) { delete u.goal; continue; }
    const isl = island(s, u.at), x = section(isl, u.sec);
    if (x.kind === 'beach' && x.owner === side) {
      const f = fleets.find((f) => f.at === u.at && canEmbark(s, u, f.id) && (!fleetDest.has(f.id) || fleetDest.get(f.id) === sailToward(f, gl.to)));
      if (f && issueEmbark(s, id, f.id)) { if (!fleetDest.has(f.id)) fleetDest.set(f.id, sailToward(f, gl.to)); continue; }
    } else {
      const st = stepToBeach(isl, u);
      if (st) issueSecOrder(s, id, st);
    }
    pickups.set(u.at, (pickups.get(u.at) || 0) + u.str);
  }
  // never sail troops into a known enemy fleet without a clear edge: wait, call the other fleets, then go together
  memo.fl = memo.fl || {};
  const zv = zoneVision(s, side); // r8g ask 9: a sea is known where its zone is seen
  for (const i of s.islands) if (seen.has(i.id) || zv.has(zkey(i.id))) memo.fl[i.id] = unitsAt(s, i.id, foe, 'fleet').reduce((n, f) => n + f.str, 0);
  // r8g: with no proximity sight, an unseen enemy home sea is assumed to hold a full home fleet (do not feed ships in one by one)
  if (!zv.has(zkey(foeHomeId)) && !(foeHomeId in memo.fl)) memo.fl[foeHomeId] = MAX_STR.fleet;
  const foePow = (id) => { const n = memo.fl[id] || 0; return n ? n + airfieldsNear(s, foe, island(s, id)) / 2 : 0; };
  const myPowAt = (id) => fleets.filter((f) => f.at === id).reduce((n, f) => n + f.str, 0) + airfieldsNear(s, side, island(s, id)) / 2;
  const rally = new Set();
  for (const [fid, to] of [...fleetDest]) {
    const f = unit(s, fid), need = foePow(to);
    // r8g: a convoy does not leave home with fewer than 3 ships (the home fleet grows a ship every 2 weeks while it waits)
    if (to !== f.at && f.at === homeId && f.str < 3 && (carried(s, f).length || Object.values(s.embark).includes(fid))) { fleetDest.set(fid, f.at); for (const a of carried(s, f)) delete s.landOrd[a.id]; continue; }
    if (to === f.at || !need) continue;
    const edge = s.week > 35 ? 0.6 : 1.1; // bolder as the war drags on (r8g: never 0 - with blind landings and strikes, lone ships just feed the enemy)
    if (myPowAt(f.at) >= need * edge + 1) { for (const g of fleets) if (g.at === f.at && !fleetDest.has(g.id)) fleetDest.set(g.id, to); }
    else { fleetDest.set(fid, f.at); rally.add(f.at); for (const a of carried(s, f)) delete s.landOrd[a.id]; }
  }
  // fleets: carry troops first, rally to a held-up convoy, fetch waiting troops, hunt weaker visible fleets, else go home
  for (const f of fleets) {
    if (fleetDest.has(f.id)) { const to = fleetDest.get(f.id); if (to !== f.at) issueOrder(s, f.id, to); continue; }
    if (carried(s, f).length) continue;
    const rp = [...rally].filter((id) => id !== f.at).sort((a, b) => dist(island(s, a), island(s, f.at)) - dist(island(s, b), island(s, f.at)))[0];
    if (rally.has(f.at)) continue;
    if (rp) { const to = sailToward(f, rp); if (to !== f.at) { issueOrder(s, f.id, to); continue; } }
    const wait = [...pickups.entries()].filter(([id]) => !fleets.some((g) => g !== f && (g.at === id || s.orders[g.id] === id)))
      .sort((a, b) => dist(island(s, a[0]), island(s, f.at)) - dist(island(s, b[0]), island(s, f.at)))[0];
    if (wait && wait[0] !== f.at) { const to = sailToward(f, wait[0]); if (to !== f.at) { issueOrder(s, f.id, to); continue; } }
    if (wait && wait[0] === f.at) continue;
    const power = (sd, n, isl) => n + airfieldsNear(s, sd, isl) / 2;
    const targetsF = s.units.filter((e) => e.side === foe && e.kind === 'fleet' && seen.has(e.at) && canOrder(s, f, e.at) && e.at !== f.at)
      .filter((e) => power(foe, e.str, island(s, e.at)) < power(side, f.str, island(s, e.at)));
    if (targetsF.length) { issueOrder(s, f.id, targetsF[0].at); continue; }
    if (f.at !== homeId && canOrder(s, f, homeId)) issueOrder(s, f.id, homeId);
  }
  // troops aboard land on the goal beach when their fleet is there (or arrives there) this week
  for (const [id, gl] of intents) {
    const u = unit(s, id);
    if (!u || !u.aboard || landIsland(s, u) !== gl.to) continue;
    const isl = island(s, gl.to);
    const sec = section(isl, gl.sec) && section(isl, gl.sec).kind === 'beach' ? gl.sec : landingBeach(s, u, isl);
    issueLand(s, id, sec);
  }
  // ---- planes: torpedo planes at seen enemy fleets, bombers where we land or fight, fighters escort the biggest strike ----
  const mine = s.planes.filter((p) => p.side === side && !p.used && planeBase(s, p));
  const fleetsSeen = s.units.filter((e) => e.side === foe && e.kind === 'fleet' && seen.has(e.at)).map((e) => e.at);
  for (const p of mine.filter((p) => p.type === 'torpedo')) { const t = fleetsSeen.find((id) => canStrike(s, p.id, id)); if (t) issueStrike(s, p.id, t); }
  const landT = [...new Set(Object.values(s.landOrd).map((o) => o.isl))];
  const fightT = s.islands.filter((i) => seen.has(i.id) && s.units.some((e) => e.side === foe && e.kind === 'army' && e.at === i.id && e.sec)).map((i) => i.id);
  for (const p of mine.filter((p) => p.type === 'bomber')) { const t = [...landT, ...fightT].find((id) => canStrike(s, p.id, id)); if (t) issueStrike(s, p.id, t); }
  const byT = {}; for (const [pid, to] of Object.entries(s.strikes)) if (plane(s, pid).side === side) byT[to] = (byT[to] || 0) + 1;
  const order = Object.entries(byT).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  for (const p of mine.filter((p) => p.type === 'fighter')) { const t = order.find((id) => canStrike(s, p.id, id)); if (t) issueStrike(s, p.id, t); }
  // r8g: fighters not escorting fly CAP (a fighter on the ground joins no fight): over our landing if in range, else over home base
  for (const p of mine.filter((p) => p.type === 'fighter' && !s.strikes[p.id] && !p.air)) {
    const b = planeBase(s, p); if (!b) continue;
    const t = landT.find((id) => canFly(s, p.id, id)) || (canFly(s, p.id, b.isl) ? b.isl : null);
    if (t) issueFly(s, p.id, t);
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
  const snap = oobSnapshot([...blueF, ...redF]);
  const icons = {};
  for (const [side, fleets] of [[BLUE, blueF], [RED, redF]]) {
    const arr = [];
    fleets.forEach((f) => { syncOob(f); for (let i = 0; i < f.str; i++) arr.push({ side, kind: 'ship', ship: f.ships[i], unit: f.id, alive: true, idx: arr.length }); });
    const planes = airfieldsNear(s, side, isl);
    for (let i = 0; i < planes; i++) arr.push({ side, kind: 'plane', alive: true, idx: arr.length });
    icons[side] = arr;
  }
  const b = { kind: 'naval', island: isl.id, icons, round: 0, done: false, winner: null, retreated: null, shotsAll: [], canRetreat: {}, snap, bon: bonusMap([...blueF, ...redF]) };
  for (const side of [BLUE, RED]) b.canRetreat[side] = !!nearestOwnIsland(s, side, isl, RANGE.fleet);
  return b;
}

function makeLand(s, isl, sec, atkSide, blind) {
  const def = sec.owner && sec.owner !== atkSide ? sec.owner : null;
  const defSide = other(atkSide);
  const atkUnits = armiesIn(s, isl.id, sec.id, atkSide);
  const defUnits = armiesIn(s, isl.id, sec.id, defSide);
  const snap = oobSnapshot([...atkUnits, ...defUnits]);
  const icons = { [atkSide]: [], [defSide]: [] };
  // transports caught by a hostile fleet with no escort lose half before they hit the beach
  let transportLoss = 0;
  if (sec.kind === 'beach' || sec.kind === 'port') {
    const hostile = unitsAt(s, isl.id, defSide, 'fleet').length, own = unitsAt(s, isl.id, atkSide, 'fleet').length;
    if (hostile && !own) atkUnits.filter((u) => u.landed).forEach((u) => { u.underFire = true; });
    atkUnits.filter((u) => u.landed && u.underFire).forEach((u) => { u.underFire = false; const l = Math.ceil(u.str / 2); transportLoss += l; u.str -= l; s.stats.lost[atkSide] += l; });
  }
  atkUnits.forEach((u) => { for (let i = 0; i < u.str; i++) icons[atkSide].push({ side: atkSide, kind: 'inf', unit: u.id, alive: true, idx: icons[atkSide].length }); });
  for (let i = 0; i < transportLoss; i++) icons[atkSide].push({ side: atkSide, kind: 'inf', unit: null, alive: false, idx: icons[atkSide].length, sunk: true });
  const support = (sec.kind === 'beach' || sec.kind === 'port') && unitsAt(s, isl.id, atkSide, 'fleet').length > 0;
  if (support) icons[atkSide].push({ side: atkSide, kind: 'support', alive: true, idx: icons[atkSide].length });
  const garSide = def || null;
  for (let i = 0; i < (sec.owner === atkSide ? 0 : sec.gar); i++) icons[defSide].push({ side: defSide, kind: 'fort', neutral: !garSide, alive: true, idx: icons[defSide].length });
  defUnits.forEach((u) => { for (let i = 0; i < u.str; i++) icons[defSide].push({ side: defSide, kind: 'inf', unit: u.id, alive: true, idx: icons[defSide].length }); });
  const b = { kind: 'land', island: isl.id, sec: sec.id, secKind: sec.kind, atk: atkSide, def: defSide, defOwner: sec.owner, icons, round: 0, done: false, winner: null,
    retreated: null, blind: !!blind, support, transportLoss, shotsAll: [], canRetreat: {}, snap, bon: bonusMap([...atkUnits, ...defUnits]) };
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
      if (b.bon) { const ba = sh.unit && b.bon[sh.unit], bt = t.unit && b.bon[t.unit]; p += (ba ? ba.atk : 0) - (bt ? bt.def : 0); } // r9: commander perk + cohesion
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
    if (u.kind === 'fleet') { syncOob(u); b.icons[side].filter((i) => i.unit === id && !i.alive && i.ship).forEach((i) => { const k = u.ships.lastIndexOf(i.ship); if (k >= 0) u.ships.splice(k, 1); }); }
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
      if (back && f.str > 0) { b.retreats.push({ unit: f.id, from: isl.id, to: back.id }); f.at = back.id; carried(s, f).forEach((a) => { a.at = back.id; }); }
      else { s.stats.sunk[f.side] += Math.max(0, f.str); removeUnit(s, f); }
    }
    if (b.retreated) s.stats.retreats[b.retreated]++;
    b.coLost = oobLosses(s, b.snap);
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
      if (u.str > 0 && pullBack(s, u)) b.retreats.push({ unit: u.id, fromIsl: isl.id, fromSec: sec.id, toIsl: u.at, toSec: u.sec, aboard: u.aboard || null });
      else if (u.str > 0) { s.stats.lost[u.side] += u.str; u.str = 0; }
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
      if (b.round >= 10 && u.str > 0 && u.from && pullBack(s, u)) b.retreats.push({ unit: u.id, fromIsl: isl.id, fromSec: sec.id, toIsl: u.at, toSec: u.sec, aboard: u.aboard || null });
      else { s.stats.lost[u.side] += u.str; u.str = 0; }
    }
  }
  s.stats.landFought += (b.atk === BLUE || b.defOwner === BLUE) ? 1 : 0;
  if ((b.winner === BLUE) && (b.atk === BLUE || b.defOwner === BLUE)) s.stats.landWon++;
  s.units.filter((u) => u.kind === 'army' && u.str <= 0).forEach((u) => removeUnit(s, u));
  b.coLost = oobLosses(s, b.snap);
}

// back where the group came from: the previous section, or back aboard its fleet if it landed from the sea (fleet still here)
function pullBack(s, u) {
  const f = u.from; if (!f) return false;
  if (f.aboard) {
    const fl = unit(s, f.aboard);
    if (!fl || fl.at !== u.at) return false;
    u.aboard = fl.id; u.sec = null; u.landed = false; return true;
  }
  u.at = f.at; u.sec = f.sec; u.landed = false; return true;
}
function removeUnit(s, u) {
  s.units = s.units.filter((x) => x !== u);
  delete s.orders[u.id]; delete s.secOrders[u.id]; delete s.landAt[u.id];
  if (s.embark) { delete s.embark[u.id]; delete s.landOrd[u.id]; }
  // a fleet that goes down takes the troops aboard with it
  if (u.kind === 'fleet') for (const a of carried(s, u)) { s.stats.lost[a.side] += Math.max(0, a.str); a.str = 0; removeUnit(s, a); }
}

// empty enemy/neutral sections next to a freshly taken one fall without a fight
function sweep(s, isl, side, fromSec, events) {
  if (unitsAt(s, isl.id, other(side), 'army').some((u) => u.sec)) return; // mop-up only once the foe has no troops left here
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
  // r8g3: queued recon flights go first, so what they find is known before anyone moves (and before the AI plans)
  const rOrd = s.reconOrd || {}; s.reconOrd = {};
  const recs = [];
  for (const [pid, to] of Object.entries(rOrd)) { const p = plane(s, pid); if (!p) continue; const f = recon(s, p.side, to, pid); if (f) recs.push({ ...f, side: p.side }); }
  const seenBefore = { blue: vision(s, BLUE), red: vision(s, RED) };
  const zBefore = { blue: zoneVision(s, BLUE), red: zoneVision(s, RED) }; // r8g: a landing is blind when its beach zone was fogged
  if (ai) aiOrders(s, RED);
  if (recs.length) yield { type: 'recon', flights: recs };
  const moves = [];
  s.units.forEach((u) => { u.moved = false; u.landed = false; });
  for (const p of s.planes) { const b = planeBase(s, p); if (b) p.last = { x: b.x, y: b.y }; }
  // r7b: remember which enemy fleets each strike was aimed at, so a strike can follow a fleet that sails away
  const watch = {};
  for (const [pid, to] of Object.entries(s.strikes)) { const p = plane(s, pid); if (p) watch[pid] = s.units.filter((u) => u.kind === 'fleet' && u.side !== p.side && u.at === to).map((u) => u.id); }
  // 1. troops on a beach board their ship
  for (const [id, fid] of Object.entries(s.embark)) {
    const u = unit(s, id), f = unit(s, fid);
    if (!u || !f || u.aboard || f.at !== u.at || carried(s, f).length >= FLEET_LIFT) continue;
    moves.push({ unit: id, side: u.side, kind: 'army', from: u.at, fromSec: u.sec, to: u.at, embark: true, fleet: fid, str: u.str, blind: false });
    u.aboard = fid; u.sec = null; u.moved = true;
  }
  // 2. fleets sail; the troops aboard go with them
  for (const [id, to] of Object.entries(s.orders)) {
    const u = unit(s, id); if (!u || u.kind !== 'fleet') continue;
    const load = carried(s, u);
    const m = { unit: id, side: u.side, kind: u.kind, from: u.at, to, str: u.str, blind: !seenBefore[u.side].has(to), carry: load.map((a) => a.id) };
    u.from = { at: u.at, sec: null };
    u.at = to; u.moved = true;
    const sp = s.spotOrd && s.spotOrd[id]; u.spot = sp && sp.isl === to ? { ...sp } : null; // r8e: arrive at sea or docked at the ordered beach
    load.forEach((a) => { a.at = to; });
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
    const u = unit(s, id); if (!u || u.moved || u.aboard) continue;
    moves.push({ unit: id, side: u.side, kind: 'army', from: u.at, fromSec: u.sec, to: u.at, toSec: secId, inland: true, str: u.str, blind: false });
    u.from = { at: u.at, sec: u.sec }; u.sec = secId; u.moved = true;
  }
  const landOrd = s.landOrd, strikes = s.strikes, strikeZ = s.strikeZ || {}, flyOrd = s.flyOrd || {}, landPl = s.landPl || {};
  s.orders = {}; s.secOrders = {}; s.landAt = {}; s.embark = {}; s.landOrd = {}; s.strikes = {}; s.strikeZ = {}; s.spotOrd = {}; s.flyOrd = {}; s.landPl = {};
  s.zseen = { blue: [], red: [] }; // r8g: last week's strike sightings fade; this week's strikes add new ones
  const arrow = (m) => ({ side: m.side, kind: m.kind, from: m.from, to: m.to, fromSec: m.fromSec, toSec: m.toSec, inland: !!m.inland, embark: !!m.embark, land: !!m.land });
  s.lastArrows = moves.map(arrow);
  yield { type: 'moves', moves };
  // r8g: planes up last week come down, planes ordered up go up (before strikes, so a fighter on CAP is in the air for them)
  const air = airPhase(s, flyOrd, landPl);
  if (air.landed.length || air.lost.length || air.up.length) yield { type: 'air', ...air };
  // air strikes go in before the fleets meet
  for (const e of resolveStrikes(s, strikes, watch, strikeZ)) yield e;
  // 3. troops land from their fleet onto a beach where the fleet now is (before the fleets fight: a landing under the guns
  //    of a stronger hostile fleet loses half on the way in, see makeLand)
  const lands = [];
  for (const [id, o] of Object.entries(landOrd)) {
    const u = unit(s, id), f = u && u.aboard && unit(s, u.aboard);
    if (!f || f.at !== o.isl) continue;
    const x = section(island(s, o.isl), o.sec); if (!x || x.kind !== 'beach') continue;
    u.from = { aboard: f.id, at: f.at, sec: null }; u.aboard = null; u.at = o.isl; u.sec = o.sec; u.moved = true; u.landed = true;
    u.blind = !zBefore[u.side].has(zkey(o.isl, o.sec));
    const foeF = unitsAt(s, o.isl, other(u.side), 'fleet').reduce((n, q) => n + q.str, 0), ownF = unitsAt(s, o.isl, u.side, 'fleet').reduce((n, q) => n + q.str, 0);
    u.underFire = foeF > ownF;
    lands.push({ unit: id, side: u.side, kind: 'army', from: o.isl, to: o.isl, toSec: o.sec, land: true, fleet: f.id, str: u.str, blind: u.blind });
  }
  if (lands.length) { s.lastArrows.push(...lands.map(arrow)); learnUnits(s); yield { type: 'moves', moves: lands }; }
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
  if (!s.over) { collectIncome(s); for (const e of reinforce(s)) yield e; mergeStacks(s); }
  tickCohesion(s); // r9: a week more under the same command
  s.units.forEach((u) => { delete u.moved; delete u.landed; delete u.blind; delete u.from; delete u.underFire; syncOob(u); });
  // planes whose airfield fell or whose carrier sank fly to the nearest free base in range, else they are lost
  const rb = rebase(s); if (rb.moved.length || rb.lost.length) yield { type: 'rebase', ...rb };
  learnUnits(s); // r8g3: every zone an army / fleet of yours went into this week stays known
  s.planes.forEach((p) => { p.used = false; });
  s.recon = { blue: [], red: [] }; s.flights = { blue: 0, red: 0 }; // this week's flights are done; what they saw is in s.known
  s.week++;
  yield { type: 'week', week: s.week };
  if (s.over) yield { type: 'over', winner: s.over.winner };
}

// ---- air strikes (r7) ----
// Per target island: enemy fighters based within range intercept; each escorting fighter cancels one interceptor,
// each interceptor left shoots down one bomber / torpedo plane. Survivors hit: a bomber takes 1 strength from the
// strongest enemy army there (or 1 fort from a garrisoned enemy section); a torpedo plane sinks 1 enemy ship there.
const SINK_FIRST = ['bb', 'cv', 'dd'];
// r7b: a strike is never wasted on a target that left. A torpedo plane whose fleet sailed away follows it if the fleet
// is still in range (retarget); otherwise it turns back unharmed and unspent (refund), and so does a bomber with nothing
// left to hit. Escorts go where their strike goes, or turn back with it.
const hasShips = (s, side, islId) => s.units.some((u) => u.side !== side && u.kind === 'fleet' && u.at === islId && u.str > 0);
const hasLandTarget = (s, side, isl, sec = null) => s.units.some((u) => u.side !== side && u.kind === 'army' && u.at === isl.id && u.sec && (!sec || u.sec === sec) && u.str > 0) || isl.secs.some((x) => (!sec || x.id === sec) && x.owner !== side && x.gar > 0);
// r8g ask 9: a strike sees the one zone it flew to (a bomber: its section, a torpedo plane: the sea) until the next End Week
function seeZone(s, side, islId, sec) { if (!s.zseen) s.zseen = { blue: [], red: [] }; const k = zkey(islId, sec); if (!s.zseen[side].includes(k)) s.zseen[side].push(k); }
function redirectStrikes(s, strikes, watch, zones = {}) {
  const plan = {}, retargeted = {}, aborted = [];
  const entries = Object.entries(strikes || {}).map(([pid, to]) => ({ p: plane(s, pid), to })).filter((x) => x.p && !x.p.used);
  for (const x of entries.filter((e) => e.p.type !== 'fighter')) {
    const b = planeBase(s, x.p); if (!b) continue;
    let to = x.to;
    if (x.p.type === 'torpedo' && !hasShips(s, x.p.side, to)) {
      const f = (watch[x.p.id] || []).map((id) => unit(s, id)).find((u) => u && u.str > 0 && dist(b, island(s, u.at)) <= AIR_RANGE);
      if (f) { retargeted[x.p.id] = { from: to, to: f.at }; to = f.at; } else to = null;
    } else if (x.p.type === 'bomber' && !hasLandTarget(s, x.p.side, island(s, to), zones[x.p.id])) { seeZone(s, x.p.side, to, zones[x.p.id]); to = null; } // r8g: it flew there and saw the zone
    if (to) plan[x.p.id] = to; else aborted.push({ plane: x.p.id, side: x.p.side, type: x.p.type, from: { x: b.x, y: b.y }, to: x.to });
  }
  for (const x of entries.filter((e) => e.p.type === 'fighter')) {
    const b = planeBase(s, x.p); if (!b) continue;
    const mates = entries.filter((e) => e.p.type !== 'fighter' && e.p.side === x.p.side && e.to === x.to);
    const live = mates.map((e) => plan[e.p.id]).filter(Boolean);
    const to = live.includes(x.to) ? x.to : live.find((t) => dist(b, island(s, t)) <= AIR_RANGE);
    if (to) { plan[x.p.id] = to; if (to !== x.to) retargeted[x.p.id] = { from: x.to, to }; } else aborted.push({ plane: x.p.id, side: x.p.side, type: 'fighter', from: { x: b.x, y: b.y }, to: x.to });
  }
  return { plan, retargeted, aborted };
}
function resolveStrikes(s, strikes, watch = {}, zones = {}) {
  const out = [];
  const groups = {};
  const { plan, retargeted, aborted } = redirectStrikes(s, strikes, watch, zones);
  for (const side of [BLUE, RED]) { const list = aborted.filter((a) => a.side === side); if (list.length) out.push({ type: 'strike-abort', side, planes: list }); }
  for (const [pid, to] of Object.entries(plan)) {
    const p = plane(s, pid); if (!p || p.used) continue;
    const b = planeBase(s, p), t = island(s, to);
    if (!b || !t || dist(b, t) > AIR_RANGE) continue;
    // a bomber strikes its zone; an escort flies with the first bomber group over the same island (else the torpedo group)
    const mate = p.type === 'fighter' ? Object.entries(plan).find(([id, t]) => t === to && plane(s, id) && plane(s, id).side === p.side && plane(s, id).type === 'bomber') : null;
    const zs = p.type === 'bomber' ? zones[pid] || null : mate ? zones[mate[0]] || null : null;
    const k = `${p.side}:${to}:${zs || ''}`;
    (groups[k] = groups[k] || { side: p.side, to, sec: zs, list: [] }).list.push({ p, b });
  }
  for (const grp of Object.values(groups)) {
    const foe = other(grp.side), isl = island(s, grp.to);
    if (grp.list.some((x) => x.p.type !== 'fighter')) seeZone(s, grp.side, grp.to, grp.list.some((x) => x.p.type === 'bomber') ? grp.sec : null);
    const strikers = grp.list.filter((x) => x.p.type === 'bomber' || x.p.type === 'torpedo').sort((a, b) => (a.p.id < b.p.id ? -1 : 1));
    const escorts = grp.list.filter((x) => x.p.type === 'fighter');
    grp.list.forEach((x) => { x.p.used = true; });
    if (!strikers.length) continue;
    const interceptors = s.planes.filter((q) => q.side === foe && q.type === 'fighter' && !q.used && q.air && q.air.isl === isl.id); // r8g: only fighters already up over the target (CAP)
    const free = Math.max(0, interceptors.length - escorts.length);
    const flights = [], hits = [];
    const targetsArmy = () => s.units.filter((u) => u.side === foe && u.kind === 'army' && u.at === isl.id && u.sec && (!grp.sec || u.sec === grp.sec) && u.str > 0).sort((a, b) => b.str - a.str);
    const snapUnits = [...targetsArmy(), ...s.units.filter((u) => u.side === foe && u.kind === 'fleet' && u.at === isl.id)];
    const snap = oobSnapshot(snapUnits);
    strikers.forEach((x, i) => {
      const shot = i < free;
      flights.push({ plane: x.p.id, type: x.p.type, from: { x: x.b.x, y: x.b.y }, lost: shot });
      if (shot) { s.planes = s.planes.filter((q) => q !== x.p); return; }
      if (x.p.type === 'bomber') {
        const a = targetsArmy()[0];
        if (a) { a.str -= 1; s.stats.lost[foe]++; hits.push({ kind: 'army', unit: a.id, sec: a.sec }); syncOob(a); if (a.str <= 0) removeUnit(s, a); return; }
        const x2 = isl.secs.filter((q) => (!grp.sec || q.id === grp.sec) && q.owner !== grp.side && q.gar > 0).sort((p, q) => q.gar - p.gar)[0]; // enemy or neutral forts
        if (x2) { x2.gar -= 1; hits.push({ kind: 'fort', sec: x2.id }); return; }
        hits.push({ kind: 'miss' }); return;
      }
      const f = s.units.filter((u) => u.side === foe && u.kind === 'fleet' && u.at === isl.id && u.str > 0).sort((a, b) => b.str - a.str)[0];
      if (!f) { hits.push({ kind: 'miss' }); return; }
      syncOob(f);
      const t = SINK_FIRST.find((k) => f.ships.includes(k)) || f.ships[0];
      f.ships.splice(f.ships.lastIndexOf(t), 1); f.str -= 1; s.stats.sunk[foe]++;
      hits.push({ kind: 'ship', unit: f.id, ship: t });
      if (f.str <= 0) removeUnit(s, f);
    });
    out.push({ type: 'strike', side: grp.side, to: grp.to, sec: grp.sec, retargeted: grp.list.filter((x) => retargeted[x.p.id]).map((x) => ({ plane: x.p.id, from: retargeted[x.p.id].from })), flights, escorts: escorts.map((x) => ({ plane: x.p.id, from: { x: x.b.x, y: x.b.y } })), intercepted: Math.min(free, strikers.length), interceptors: interceptors.length, hits, lost: oobLosses(s, snap) });
  }
  return out;
}
// planes without a base (airfield taken, carrier sunk or lost its CV) fly to the nearest own base with room in range
function rebase(s) {
  const moved = [], lost = [];
  for (const p of [...s.planes]) {
    if (p.air || planeBase(s, p)) continue; // r8g: a plane in the air comes down in airPhase
    const fx = p.base.isl && island(s, p.base.isl) && section(island(s, p.base.isl), p.base.sec);
    const from = fx ? { x: fx.x, y: fx.y } : p.last;
    const cands = [];
    for (const i of s.islands) for (const x of i.secs) if (x.kind === 'air' && x.owner === p.side) cands.push({ base: { isl: i.id, sec: x.id }, x: x.x, y: x.y });
    for (const f of s.units) if (f.kind === 'fleet' && f.side === p.side && syncOob(f).ships.includes('cv')) { const i = island(s, f.at); cands.push({ base: { fleet: f.id }, x: i.x, y: i.y }); }
    const to = from && cands.filter((c) => baseRoom(s, c.base) > 0 && dist(c, from) <= AIR_RANGE).sort((a, b) => dist(a, from) - dist(b, from))[0];
    if (to) { p.base = to.base; moved.push({ plane: p.id, side: p.side, type: p.type, to: to.base }); }
    else { s.planes = s.planes.filter((q) => q !== p); lost.push({ plane: p.id, side: p.side, type: p.type }); }
  }
  return { moved, lost };
}

// r9: reinforcements are paid from supply (both sides, the AI too): each troop point COST.troop, the ship its class
// cost, the plane its type cost. What a side cannot pay for does not arrive (cheapest first: troops, then ship, then plane).
function reinforce(s) {
  const out = [];
  ensureSupply(s);
  for (const side of [BLUE, RED]) {
    const home = island(s, side === BLUE ? 'kestra' : 'voruna');
    const hq = section(home, 'hq');
    if (hq.owner !== side) continue; // no HQ, no reinforcements
    let spent = 0;
    let troops = Math.min(1 + ownedSecs(s, side, 'depot'), Math.floor(s.supply[side] / COST.troop));
    let gained = 0;
    while (troops > 0) {
      const here = armiesIn(s, home.id, 'hq', side);
      let a = here.find((u) => u.str < MAX_STR.army && !u.org);
      if (!a && here.length >= HOME_STACK) break;
      if (!a) a = addUnit(s, side, 'army', home.id, 0, 'hq');
      const add = Math.min(troops, MAX_STR.army - a.str);
      a.str += add; troops -= add; gained += add;
    }
    s.supply[side] -= gained * COST.troop; spent += gained * COST.troop;
    let ships = 0;
    if (s.week % 2 === 0 && section(home, 'port').owner === side) {
      let f = unitsAt(s, home.id, side, 'fleet').find((u) => u.str < MAX_STR.fleet);
      const type = f ? SHIP_ORDER[syncOob(f).ships.length % SHIP_ORDER.length] : SHIP_ORDER[0];
      if (s.supply[side] >= COST[type]) {
        if (!f && unitsAt(s, home.id, side, 'fleet').length < 1) f = addUnit(s, side, 'fleet', home.id, 0);
        if (f) { f.str += 1; ships = 1; s.supply[side] -= COST[type]; spent += COST[type]; }
      }
    }
    // a new plane every third week at the home airfield (the type the side has fewest of)
    let planes = 0, planeType = null;
    const hb = { isl: home.id, sec: 'air' };
    if (s.week % 3 === 0 && validBase(s, side, hb) && baseRoom(s, hb) > 0) {
      const order = ['fighter', 'bomber', 'torpedo', 'recon'];
      planeType = order.map((t) => [t, s.planes.filter((p) => p.side === side && p.type === t).length]).sort((a, b) => a[1] - b[1])[0][0];
      if (s.supply[side] >= COST[planeType] && addPlane(s, side, planeType, hb)) { planes = 1; s.supply[side] -= COST[planeType]; spent += COST[planeType]; }
    }
    out.push({ type: 'reinforce', side, island: home.id, troops: gained, ships, planes, planeType, spent });
  }
  return out;
}

function mergeStacks(s) {
  for (const isl of s.islands) {
    for (const side of [BLUE, RED]) {
      const groups = {};
      unitsAt(s, isl.id, side).forEach((u) => { const k = `${u.kind}:${u.sec}:${u.aboard || ''}${u.org ? `:${u.id}` : ''}`; (groups[k] = groups[k] || []).push(u); }); // r9: a reorganized regiment keeps its own make-up
      for (const [k, list] of Object.entries(groups)) {
        if (list.length < 2) continue;
        const kind = k.split(':')[0];
        list.sort((a, b) => b.str - a.str);
        let total = list.reduce((n, u) => n + u.str, 0);
        list.forEach((u) => { const v = Math.min(MAX_STR[kind], total); u.str = v; total -= v; });
        if (kind === 'fleet') {
          list.forEach((u) => syncOob(u));
          const keep = list.find((u) => u.str > 0);
          for (const u of list.filter((x) => x.str <= 0)) {
            carried(s, u).forEach((a) => { a.aboard = keep.id; });
            s.planes.filter((p) => p.base.fleet === u.id).forEach((p) => { p.base = { fleet: keep.id }; });
          }
        }
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
    return { type: 'naval', island: b.island, start: { blue: b.icons.blue.map((x) => x.kind), red: b.icons.red.map((x) => x.kind) }, shots: b.shotsAll, rounds: b.round, winner: b.winner, retreats: b.retreats || [], retreated: b.retreated, lost: b.coLost };
  }
  return { type: 'landing', island: b.island, sec: b.sec, secKind: b.secKind, side: b.atk, won: b.winner === b.atk && !b.retreated, retreated: b.retreated, blind: b.blind,
    atk0: b.atk0, def0: b.def0, atkLeft: b.icons[b.atk].filter((i) => i.alive && i.kind === 'inf').length, defLeft: b.icons[b.def].filter((i) => i.alive).length,
    transportLoss: b.transportLoss, support: b.support, retreats: b.retreats || [], prevOwner: b.defOwner, lost: b.coLost };
}

// ---- r8b (additive: no rule changes) ----
// Next-week reinforcements, previewed exactly: reinforce() run on a copy of the state as it stands now.
// Exact when the holdings it reads (HQ, port, airfield, depots, the HQ stack) do not change before the week ends.
export function previewReinforce(s) {
  const c = JSON.parse(JSON.stringify({ ...s, rand: null }));
  collectIncome(c);
  const before = new Map(c.units.map((u) => [u.id, u.str]));
  return reinforce(c).map((e) => {
    const armies = c.units.filter((u) => u.side === e.side && u.kind === 'army' && u.at === e.island && u.sec === 'hq')
      .map((u) => ({ id: before.has(u.id) ? u.id : null, cmd: u.cmd, add: u.str - (before.get(u.id) || 0), fresh: !before.has(u.id) })).filter((x) => x.add > 0);
    let shipType = null, fleet = null;
    if (e.ships) {
      const f = c.units.find((u) => u.side === e.side && u.kind === 'fleet' && u.at === e.island && u.str !== before.get(u.id));
      if (f) { syncOob(f); shipType = f.ships[f.ships.length - 1]; fleet = before.has(f.id) ? f.id : null; }
    }
    return { ...e, armies, shipType, fleet };
  });
}
// Put an army under another friendly commander (the commander portrait it shows). Its companies stay as they are.
export function reassignCmd(s, unitId, toUnitId) {
  const u = unit(s, unitId), t = unit(s, toUnitId);
  if (!u || !t || u === t || u.side !== t.side || u.kind !== 'army' || t.kind !== 'army' || u.cmd === t.cmd) return false;
  syncOob(u); // the OOB is built once from the first commander; keep it
  u.cmd = t.cmd;
  return true;
}

// ======================= r9: supply + costs, cohesion, commanders, reorganize, cancel =======================
// Supply points: every held island pays its type's income at End Week (before reinforcements, which now cost).
export const START_SUPPLY = 15;
export const INCOME = { home: 8, supply: 5, air: 4, plain: 3 };
// Every unit type and every building has its own price (different types cost different amounts).
export const COST = {
  troop: 3, // one strength point of the free-of-choice HQ reinforcement
  inf: 2, eng: 3, aa: 3, art: 4, armor: 5, // a company you buy for a regiment
  dd: 5, bb: 9, cv: 10, // a ship
  recon: 3, fighter: 5, torpedo: 6, bomber: 7, // a plane
  fort: 4, dock: 6, airfield: 8, // buildings on a zone you hold
  cmd: 4, // a new commander (a new battalion or a new regiment needs one)
};
export const BUILDINGS = ['fort', 'dock', 'airfield'];
export const FORT_MAX = 3;
export const BUY_ZONES = ['hq', 'depot', 'port']; // where a regiment can take on a bought company
export function ensureSupply(s) { if (!s.supply) s.supply = { blue: START_SUPPLY, red: START_SUPPLY }; if (!s.lastIncome) s.lastIncome = { blue: 0, red: 0 }; return s.supply; }
export const income = (s, side) => s.islands.filter((i) => i.owner === side).reduce((n, i) => n + (INCOME[i.type] || 0), 0);
export function collectIncome(s) {
  ensureSupply(s);
  for (const side of [BLUE, RED]) { const n = income(s, side); s.supply[side] += n; s.lastIncome[side] = n; }
}
function pay(s, side, n) { ensureSupply(s); if (s.supply[side] < n) return false; s.supply[side] -= n; return true; }
export const canPay = (s, side, n) => (ensureSupply(s)[side] || 0) >= n;

// ---- cohesion: weeks under the same command; +1 star every COH_WEEKS weeks, capped at COH_MAX. A move resets it. ----
export const COH_WEEKS = 2;
export const COH_MAX = 3;
export const COH_START = 2; // the starting regiments have served together a little (1 star)
export const COH_HIT = 0.02; // per average battalion star: a better hit chance in land battles
export const cohStars = (w) => Math.max(0, Math.min(COH_MAX, Math.floor((w || 0) / COH_WEEKS)));
export function regCohesion(u) {
  if (!u || u.kind !== 'army') return 0;
  const bns = battalions(u); if (!bns.length) return 0;
  return bns.reduce((n, b) => n + cohStars(b.w), 0) / bns.length;
}
function tickCohesion(s) {
  for (const u of s.units) if (u.kind === 'army' && u.oob) for (const b of u.oob.bns) { b.w = (b.w || 0) + 1; for (const c of b.cos) c.w = (c.w || 0) + 1; }
}

// ---- commander perks: a regiment's / fleet's commander has one (fixed by who they are) ----
export const PERKS = { atk: 0.05, def: 0.05, move: 150, scout: 1 };
export const MOVE_PERK = 150;
const ARMY_PERKS = ['atk', 'def', 'scout'];
const FLEET_PERKS = ['atk', 'def', 'move', 'scout'];
export function perkOf(u) {
  if (!u || u.cmd == null || (u.kind !== 'army' && u.kind !== 'fleet')) return null;
  const list = u.kind === 'fleet' ? FLEET_PERKS : ARMY_PERKS;
  return list[(u.cmd * 7 + 3) % list.length];
}
function scoutZones(s, u) {
  const isl = island(s, u.at); if (!isl) return [];
  if (u.kind === 'army') { const x = u.sec && section(isl, u.sec); return x ? x.links.map((id) => zkey(u.at, id)) : []; }
  return isl.secs.filter((x) => shipZone(x)).map((x) => zkey(u.at, x.id));
}
// per-unit battle modifiers: attack perk + cohesion add to its hit chance; defence perk takes from shots at it
function bonusMap(units) {
  const m = {};
  for (const u of units) {
    const k = perkOf(u);
    m[u.id] = { atk: (k === 'atk' ? PERKS.atk : 0) + (u.kind === 'army' ? COH_HIT * regCohesion(u) : 0), def: k === 'def' ? PERKS.def : 0 };
  }
  return m;
}
export const unitBonus = (u) => bonusMap([u])[u.id];

// ---- echelon: regiment III, battalion II, company I (and the rank of each one's commander) ----
export const ECHELON = { regiment: 3, battalion: 2, company: 1 };
export const RANK = { regiment: 'col', battalion: 'maj', company: 'capt' };

// ---- buying (player) ----
export function canBuyCo(s, unitId, type) {
  const u = unit(s, unitId);
  if (!u || s.over || u.kind !== 'army' || u.aboard || !u.sec || !CO_TYPES.includes(type)) return false;
  const x = section(island(s, u.at), u.sec);
  if (!x || x.owner !== u.side || !BUY_ZONES.includes(x.kind)) return false;
  return u.str < MAX_STR.army && canPay(s, u.side, COST[type]);
}
// a new full company of that type joins the battalion with the fewest companies; the regiment gains one strength point
export function buyCo(s, unitId, type) {
  if (!canBuyCo(s, unitId, type)) return null;
  const u = unit(s, unitId); syncOob(u);
  const live = (b) => b.cos.filter((c) => c.pips > 0).length;
  const bn = u.oob.bns.filter((b) => live(b) > 0).sort((a, b) => live(a) - live(b))[0] || u.oob.bns[0];
  const c = { id: newCoId(u, bn), type, pips: CO_MAX, w: 0 };
  bn.cos.push(c);
  pay(s, u.side, COST[type]);
  u.str += 1; syncOob(u);
  return c;
}
const shipYard = (s, side, isl) => isl.secs.some((x) => x.owner === side && (x.kind === 'port' || x.dock));
export function canBuyShip(s, side, islId, type) {
  const isl = island(s, islId);
  if (!isl || s.over || !SHIP_TYPES.includes(type) || !shipYard(s, side, isl)) return false;
  return canPay(s, side, COST[type]);
}
export function buyShip(s, side, islId, type) {
  if (!canBuyShip(s, side, islId, type)) return null;
  let f = unitsAt(s, islId, side, 'fleet').filter((u) => u.str < MAX_STR.fleet && !s.orders[u.id]).sort((a, b) => b.str - a.str)[0];
  if (!f) f = addUnit(s, side, 'fleet', islId, 0);
  syncOob(f); f.ships.push(type); f.str += 1;
  pay(s, side, COST[type]);
  return f;
}
export function canBuyPlane(s, side, islId, secId, type) {
  if (s.over || !PLANE_TYPES.includes(type)) return false;
  const base = { isl: islId, sec: secId };
  return validBase(s, side, base) && baseRoom(s, base) > 0 && canPay(s, side, COST[type]);
}
export function buyPlane(s, side, islId, secId, type) {
  if (!canBuyPlane(s, side, islId, secId, type)) return null;
  const p = addPlane(s, side, type, { isl: islId, sec: secId });
  if (p) { pay(s, side, COST[type]); p.used = true; } // a new plane is ready next week
  return p;
}
// buildings: fort (+1 garrison, up to FORT_MAX), dock (a beach where ships can be bought), airfield (a land zone planes can base at)
export function canBuild(s, side, islId, secId, what) {
  const isl = island(s, islId), x = isl && section(isl, secId);
  if (!x || s.over || x.owner !== side || !BUILDINGS.includes(what) || !canPay(s, side, COST[what])) return false;
  if (what === 'fort') return x.gar < FORT_MAX;
  if (what === 'dock') return x.kind === 'beach' && !x.dock;
  return ['ridge', 'jungle', 'depot'].includes(x.kind) && !x.field;
}
export function build(s, side, islId, secId, what) {
  if (!canBuild(s, side, islId, secId, what)) return false;
  const x = section(island(s, islId), secId);
  if (what === 'fort') x.gar += 1; else if (what === 'dock') x.dock = true; else x.field = true;
  pay(s, side, COST[what]);
  return true;
}

// ---- reorganize (same island only) ----
function newCoId(u, bn) {
  const used = new Set(u.oob.bns.flatMap((b) => b.cos.map((c) => c.id)));
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') { const id = `${bn.n}${ch}`; if (!used.has(id)) return id; }
  return `${bn.n}z${used.size}`;
}
const livePips = (u) => allCos(u.oob).reduce((n, x) => n + x.c.pips, 0);
// after pips moved between two regiments: split their total strength so it matches the pips (no strength made or lost)
function resplit(a, b, total) {
  const pa = livePips(a), pb = livePips(b);
  let sa = Math.floor(pa / PIPS_PER_STR), sb = Math.floor(pb / PIPS_PER_STR);
  if (sa + sb < total) { if (pa % PIPS_PER_STR >= pb % PIPS_PER_STR) sa++; else sb++; }
  return [sa, sb];
}
const sameGround = (u, t) => u && t && u.side === t.side && u.kind === 'army' && t.kind === 'army' && u.at === t.at && !u.aboard && !t.aboard && u.sec && t.sec;
const bnOf = (u, n) => u.oob.bns.find((b) => b.n === n);
// move one company to another battalion (of this or another regiment on the same island) or to a new battalion ('new')
export function canMoveCo(s, unitId, coId, toUnitId, toBn) {
  const u = unit(s, unitId), t = unit(s, toUnitId);
  if (s.over || !sameGround(u, t)) return false;
  syncOob(u); syncOob(t);
  const src = u.oob.bns.find((b) => b.cos.some((c) => c.id === coId && c.pips > 0)); if (!src) return false;
  const c = src.cos.find((q) => q.id === coId);
  if (toBn === 'new') return t.oob.bns.length < 5 && canPay(s, u.side, COST.cmd) && (u !== t || src.cos.filter((q) => q.pips > 0).length > 1);
  const dst = bnOf(t, toBn); if (!dst || dst.cos.filter((q) => q.pips > 0).length === 0) return false;
  if (u === t) return dst !== src;
  if (companies(u).length < 2) return false; // a regiment keeps at least one company
  const tot = u.str + t.str;
  const pa = livePips(u) - c.pips, pb = livePips(t) + c.pips;
  let sa = Math.floor(pa / PIPS_PER_STR), sb = Math.floor(pb / PIPS_PER_STR);
  if (sa + sb < tot) { if (pa % PIPS_PER_STR >= pb % PIPS_PER_STR) sa++; else sb++; }
  return sa >= 1 && sb <= MAX_STR.army;
}
export function moveCo(s, unitId, coId, toUnitId, toBn) {
  if (!canMoveCo(s, unitId, coId, toUnitId, toBn)) return false;
  const u = unit(s, unitId), t = unit(s, toUnitId);
  const src = u.oob.bns.find((b) => b.cos.some((c) => c.id === coId && c.pips > 0));
  const c = src.cos.find((q) => q.id === coId);
  src.cos.splice(src.cos.indexOf(c), 1);
  let dst;
  if (toBn === 'new') {
    pay(s, u.side, COST.cmd);
    const n = Math.max(0, ...t.oob.bns.map((b) => b.n)) + 1;
    dst = { n, cmd: s.nextCmd++, w: 0, cos: [] }; t.oob.bns.push(dst);
  } else dst = bnOf(t, toBn);
  c.id = newCoId(t, dst); c.w = 0; // a new command: its cohesion starts again
  dst.cos.push(c);
  if (u !== t) { const [sa, sb] = resplit(u, t, u.str + t.str); u.str = sa; t.str = sb; syncOob(u); syncOob(t); }
  u.org = true; t.org = true;
  return true;
}
// move a whole battalion to another regiment on the same island, or make it a new regiment ('new', needs a new commander)
export function canMoveBn(s, unitId, bnN, toUnitId) {
  const u = unit(s, unitId); if (!u || s.over) return false;
  syncOob(u);
  const b = bnOf(u, bnN); if (!b || !b.cos.some((c) => c.pips > 0)) return false;
  if (battalions(u).length < 2) return false; // a regiment keeps at least one battalion
  const bp = b.cos.reduce((n, c) => n + c.pips, 0), pa = livePips(u) - bp;
  if (toUnitId === 'new') {
    if (!u.sec || u.aboard || !canPay(s, u.side, COST.cmd)) return false;
    let sa = Math.floor(pa / PIPS_PER_STR), sb = Math.floor(bp / PIPS_PER_STR);
    if (sa + sb < u.str) { if (pa % PIPS_PER_STR >= bp % PIPS_PER_STR) sa++; else sb++; }
    return sa >= 1 && sb >= 1;
  }
  const t = unit(s, toUnitId); if (!sameGround(u, t) || t === u) return false;
  syncOob(t);
  if (t.oob.bns.filter((q) => q.cos.some((c) => c.pips > 0)).length >= 5) return false;
  const pb = livePips(t) + bp, tot = u.str + t.str;
  let sa = Math.floor(pa / PIPS_PER_STR), sb = Math.floor(pb / PIPS_PER_STR);
  if (sa + sb < tot) { if (pa % PIPS_PER_STR >= pb % PIPS_PER_STR) sa++; else sb++; }
  return sa >= 1 && sb <= MAX_STR.army;
}
export function moveBn(s, unitId, bnN, toUnitId) {
  if (!canMoveBn(s, unitId, bnN, toUnitId)) return null;
  const u = unit(s, unitId), b = bnOf(u, bnN);
  u.oob.bns.splice(u.oob.bns.indexOf(b), 1);
  b.cos = b.cos.filter((c) => c.pips > 0);
  let t;
  if (toUnitId === 'new') {
    pay(s, u.side, COST.cmd);
    t = addUnit(s, u.side, 'army', u.at, 0, u.sec); // a new regiment commander (s.nextCmd)
    t.oob = { bns: [] };
  } else t = unit(s, toUnitId);
  const ids = new Set(t.oob.bns.flatMap((q) => q.cos.map((c) => c.id)));
  b.n = Math.max(0, ...t.oob.bns.map((q) => q.n)) + 1; b.w = 0; // under a new regiment: cohesion starts again
  b.cos.forEach((c, j) => { c.id = `${b.n}${'abcdefghijklmnop'[j]}`; if (ids.has(c.id)) c.id += 'x'; });
  t.oob.bns.push(b);
  const [sa, sb] = resplit(u, t, u.str + t.str); u.str = sa; t.str = sb; syncOob(u); syncOob(t);
  u.org = true; t.org = true;
  return t;
}

// ---- cancel: one call clears every order a unit or plane has this week ----
const UNIT_ORD = ['orders', 'secOrders', 'landAt', 'embark', 'landOrd', 'spotOrd'];
const PLANE_ORD = ['strikes', 'strikeZ', 'flyOrd', 'landPl', 'reconOrd'];
export function hasOrder(s, id) {
  if (unit(s, id)) return UNIT_ORD.some((k) => s[k] && s[k][id] !== undefined);
  return PLANE_ORD.some((k) => s[k] && s[k][id] !== undefined);
}
export function cancelOrder(s, id) {
  const u = unit(s, id);
  const keys = u ? UNIT_ORD : plane(s, id) ? PLANE_ORD : null;
  if (!keys || !hasOrder(s, id)) return false;
  for (const k of keys) if (s[k]) delete s[k][id];
  if (u && u.kind === 'fleet') for (const a of carried(s, u)) if (s.landOrd[a.id] && s.landOrd[a.id].isl !== u.at) delete s.landOrd[a.id]; // it stays: landings elsewhere go too
  return true;
}
