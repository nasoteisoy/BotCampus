// Space Campaign rules: pure game state + rules (no DOM, no three.js). Seeded RNG lives in the save so a reload continues the same run.
import { GOODS, GOOD_IDS, NODES, ROUTES, HOME, SHIPS, FLEET_MAX, TECH, TECH_IDS, CARRIER, GOAL_REP, WORLD, SIGHT, OFFICER_MAX, OFFICER_RANKS, OFFICER_SHIPS } from './data.js';

export const SAVE_KEY = 'botcampus-space-campaign-v1';
export const VERSION = 2; // v1 = r2 node-hop saves (migrated on load), v2 = free flight + officers
export const FIELD_ROCKS = 6, WRECK_BITS = 5, RAID_DAYS = 4;

export function rand(S) { // mulberry32, state kept in S.seed
  let t = (S.seed = (S.seed + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const node = (id) => NODES[id];
const ROUTE_NODES = [...new Set(ROUTES.flatMap((r) => r.path))];
export const stations = () => NODES.filter((n) => n.type === 'station');

export function newGame(seed = (Date.now() & 0x7fffffff)) {
  const S = {
    v: VERSION, seed, day: 1, clock: 0, credits: 300, rep: 0, node: HOME, visited: [HOME], seen: [],
    pos: { x: NODES[HOME].x, z: NODES[HOME].z }, prevPos: { x: NODES[HOME].x, z: NODES[HOME].z }, officers: [],
    cargo: Object.fromEntries(GOOD_IDS.map((g) => [g, 0])), fleet: ['fighter', 'fighter'],
    tech: Object.fromEntries(TECH_IDS.map((t) => [t, 0])), prices: {}, trend: {}, fields: {}, nests: {},
    convoys: ROUTES.map((r, i) => ({ route: r.id, i: i % 2 ? r.path.length - 1 : 0, dir: i % 2 ? -1 : 1, raid: null })),
    stats: { saved: 0, lost: 0, mined: 0, salvaged: 0, kills: 0, battles: 0, trades: 0 }, won: false, tutorialRaid: false,
  };
  for (const n of stations()) {
    S.prices[n.id] = {}; S.trend[n.id] = {};
    for (const g of GOOD_IDS) { S.prices[n.id][g] = GOODS[g].base * n.mult[g] * (0.95 + rand(S) * 0.1); S.trend[n.id][g] = 0; }
  }
  for (const n of NODES) {
    if (n.type === 'field') S.fields[n.id] = FIELD_ROCKS;
    if (n.type === 'wreck') S.fields[n.id] = WRECK_BITS;
    if (n.type === 'nest') S.nests[n.id] = { power: n.id === 9 ? 34 : 52, down: 0 };
  }
  markSeen(S, S.pos.x, S.pos.z);
  return S;
}

// ---------- save ----------
export function save(S) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); return true; } catch (_) { return false; } }
export function load() {
  try { const S = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return S ? migrate(S) : null; } catch (_) { return null; }
}
// v1 (r2) saves sat on a node and hopped along lanes: give them a world position, a day clock, a scouting map and an empty officer list.
// Their escorts are kept as the carrier's own fleet.
export function migrate(S) {
  if (!S || typeof S.v !== 'number' || S.v > VERSION) return null;
  if (S.v === 1) {
    const here = NODES[S.node] || NODES[HOME], back = NODES[S.prev] || here;
    S.pos = { x: here.x, z: here.z }; S.prevPos = { x: back.x, z: back.z };
    S.clock = Math.min(0.9, (S.hop || 0) / (1 + (S.tech.warp || 0))); delete S.hop; delete S.prev;
    S.fleet = (S.fleet || []).filter((id) => SHIPS[id]); // escorts become the carrier's own fleet
    S.officers = []; S.seen = [];
    for (const id of S.visited || [HOME]) markSeen(S, NODES[id].x, NODES[id].z);
    S.migratedFrom = 1; S.v = 2;
  }
  return S;
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (_) {} }

// ---------- space: bubbles, sight, flight ----------
const clampX = (x) => clamp(x, WORLD.minX, WORLD.maxX), clampZ = (z) => clamp(z, WORLD.minZ, WORLD.maxZ);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// the location whose bubble holds this point (closest centre wins), or -1 for open space
export function nodeAt(x, z) {
  let best = -1, bd = Infinity;
  for (const n of NODES) { const d = Math.hypot(n.x - x, n.z - z); if (d <= n.r && d < bd) { bd = d; best = n.id; } }
  return best;
}
export const range = (S) => CARRIER.range * (1 + 0.4 * S.tech.warp);
export const sight = (S) => SIGHT + 70 * S.tech.scanner;
export function markSeen(S, x, z) {
  const r = sight(S);
  for (const n of NODES) if (!S.seen.includes(n.id) && Math.hypot(n.x - x, n.z - z) <= r + n.r) S.seen.push(n.id);
}
// Empire charts show the trade lanes; everything else has to be scouted by flying near it
export function visibleSet(S) { return new Set([...ROUTE_NODES, ...S.seen]); }
// where a tap would take the carrier: inside a bubble it parks at the centre, otherwise exactly where you tapped
export function planMove(S, x, z) {
  x = clampX(x); z = clampZ(z);
  const id = nodeAt(x, z);
  if (id >= 0) { x = NODES[id].x; z = NODES[id].z; }
  const d = Math.hypot(x - S.pos.x, z - S.pos.z);
  return { x, z, node: id, dist: d, days: d / range(S) };
}
// fly there: time passes by distance (one day per range units), the day ticks over as many times as the clock fills
export function moveTo(S, x, z) {
  const m = planMove(S, x, z); if (m.dist < 1) return null;
  const from = { ...S.pos };
  for (let k = 1, steps = Math.ceil(m.dist / 25); k <= steps; k++) markSeen(S, from.x + (m.x - from.x) * k / steps, from.z + (m.z - from.z) * k / steps);
  S.prevPos = from; S.pos = { x: m.x, z: m.z }; S.node = m.node;
  if (m.node >= 0 && !S.visited.includes(m.node)) S.visited.push(m.node);
  S.clock += m.days; const ev = [];
  while (S.clock >= 1) { S.clock -= 1; ev.push(...advanceDay(S)); }
  return { ev, ...m };
}
export function wait(S) { S.clock = 0; return advanceDay(S); }

// ---------- economy ----------
export const cargoCap = (S) => CARRIER.cargo + 10 * S.tech.cargo;
export const cargoUsed = (S) => GOOD_IDS.reduce((a, g) => a + S.cargo[g], 0);
// Spread rules (no money loop): Empire stars cut the buy price by at most 5%, the Trade pass lifts the sell price by 2% a level
// (0.88 -> 0.94 of the price), and a sell price is always at least 1 credit under that station's buy price.
// Each unit trades on its own and moves the price one step: a buy pays the price then pushes it up x1.015, a sell is priced one step
// down (/1.015) and then drops the price that step. Every sell lands on the same price step as the buy it undoes, so any buy/sell loop at one station loses money.
const repDiscount = (S) => 1 - Math.min(0.05, S.rep / 2000);
const buyAt = (S, p) => Math.max(2, Math.round(p * repDiscount(S)));
export const buyPrice = (S, st, g) => buyAt(S, S.prices[st][g]);
// what the next unit sells for: priced one step down, i.e. on the step the matching buy was made
export const sellPrice = (S, st, g) => { const p = S.prices[st][g] / 1.015; return Math.max(1, Math.min(buyAt(S, p) - 1, Math.round(p * 0.88 * (1 + 0.02 * S.tech.trade)))); };
export const avgPrice = (g) => { const s = stations(); return s.reduce((a, n) => a + GOODS[g].base * n.mult[g], 0) / s.length; };

export function buy(S, st, g, n = 1) {
  let k = 0;
  while (k < n && cargoUsed(S) < cargoCap(S) && S.credits >= buyPrice(S, st, g)) {
    S.credits -= buyPrice(S, st, g); S.cargo[g]++; S.prices[st][g] *= 1.015; k++;
  }
  if (k) S.stats.trades++;
  return k;
}
export function sell(S, st, g, n = 1) {
  let k = 0;
  while (k < n && S.cargo[g] > 0) {
    S.credits += sellPrice(S, st, g); S.prices[st][g] /= 1.015; S.cargo[g]--; k++;
  }
  if (k) S.stats.trades++;
  return k;
}

// ---------- fleet + tech ----------
// the carrier's own fleet is S.fleet; officers' fleets that are not posted anywhere fly with the carrier too
const shipPower = (S, ids, atk = 0, hull = 0) => {
  for (const id of ids) { atk += SHIPS[id].atk; hull += SHIPS[id].hull; }
  const aM = 1 + 0.2 * S.tech.laser + 0.15 * S.tech.missile, hM = 1 + 0.2 * S.tech.shield;
  return Math.round(atk * aM + hull * hM * 0.6);
};
export const withMe = (S) => [...S.fleet, ...S.officers.filter((o) => !o.post).flatMap((o) => o.ships)];
export const fleetPower = (S) => shipPower(S, withMe(S), CARRIER.atk, CARRIER.hull);
export const wingmen = (S) => { const f = withMe(S); return Math.min(3, f.filter((id) => id === 'fighter' || id === 'bomber').length + f.filter((id) => id === 'carrier').length * 2); };
// to: -1 = the carrier's own fleet, 0.. = that officer's fleet
const groupOf = (S, to) => (to < 0 ? S.fleet : S.officers[to] && S.officers[to].ships);
const groupMax = (to) => (to < 0 ? FLEET_MAX : OFFICER_SHIPS);
export const groupFull = (S, to) => { const g = groupOf(S, to); return !g || g.length >= groupMax(to); };
export function buyShip(S, id, to = -1) {
  const c = SHIPS[id].cost; if (S.credits < c || groupFull(S, to)) return false;
  S.credits -= c; groupOf(S, to).push(id); return true;
}
export function sellShip(S, idx, from = -1) {
  const g = groupOf(S, from), id = g && g[idx]; if (!id) return 0;
  const v = Math.round(SHIPS[id].cost * 0.5); g.splice(idx, 1); S.credits += v; return v;
}
export function moveShip(S, from, idx, to) {
  const a = groupOf(S, from); if (!a || !a[idx] || from === to || groupFull(S, to)) return false;
  groupOf(S, to).push(a.splice(idx, 1)[0]); return true;
}
// ---------- officers ----------
// the officer's own flagship adds a small base (bigger with rank); a fleet with no ships cannot guard
export const officerPower = (S, o) => (o.ships.length ? Math.round(shipPower(S, o.ships, 6 + 3 * o.rank, 8 + 3 * o.rank) * (1 + OFFICER_RANKS[o.rank].bonus)) : 0);
export const officerRadius = (o) => OFFICER_RANKS[o.rank].radius;
export const hireCost = () => OFFICER_RANKS[0].cost;
export function hireOfficer(S) {
  if (S.officers.length >= OFFICER_MAX || S.credits < hireCost()) return null;
  S.credits -= hireCost();
  const o = { id: S.officers.length ? Math.max(...S.officers.map((k) => k.id)) + 1 : 0, rank: 0, ships: [], post: null, wins: 0 };
  S.officers.push(o); return o;
}
export const promoteCost = (o) => (o.rank + 1 < OFFICER_RANKS.length ? OFFICER_RANKS[o.rank + 1].cost : 0);
export function promote(S, i) {
  const o = S.officers[i]; if (!o || !promoteCost(o) || S.credits < promoteCost(o)) return false;
  S.credits -= promoteCost(o); o.rank++; return true;
}
// post a fleet: it guards everything within its radius from now on (and fights any raid already there)
export function postOfficer(S, i, x, z) {
  const o = S.officers[i]; if (!o || !o.ships.length) return null;
  o.post = { x: clampX(x), z: clampZ(z) };
  return guardSweep(S);
}
export function recallOfficer(S, i) { const o = S.officers[i]; if (!o || !o.post) return false; o.post = null; return true; }
const guards = (S, c) => S.officers.filter((o) => o.post && o.ships.length && dist(o.post, NODES[convoyNode(c)]) <= officerRadius(o));
// every posted fleet fights one raid inside its radius: officer fleet strength vs the pirates
export function guardSweep(S) {
  const ev = [];
  for (const [oi, o] of S.officers.entries()) {
    if (!o.post || !o.ships.length) continue;
    const ci = S.convoys.findIndex((c) => c.raid && dist(o.post, NODES[convoyNode(c)]) <= officerRadius(o));
    if (ci < 0) continue;
    const c = S.convoys[ci], P = officerPower(S, o), E = c.raid.power, chance = winChance(P, E);
    S.stats.battles++;
    if (rand(S) < chance) {
      const credits = 40 + E * 5, rep = 5;
      c.raid = null; S.stats.saved++; o.wins++; S.credits += credits; S.rep += rep;
      ev.push({ type: 'guardWin', officer: oi, convoy: ci, credits, rep, P, E });
    } else {
      // pushed back: the pirates are worn down (-20%); the fleet only loses its cheapest ship if the pirates were stronger
      let lost = null;
      if (E > P) { let b = 0; o.ships.forEach((id, k) => { if (SHIPS[id].cost < SHIPS[o.ships[b]].cost) b = k; }); lost = o.ships.splice(b, 1)[0]; }
      c.raid.power = Math.max(6, Math.round(E * 0.8));
      ev.push({ type: 'guardLoss', officer: oi, convoy: ci, lost, P, E });
    }
  }
  if (!S.won && S.rep >= GOAL_REP) { S.won = true; ev.push({ type: 'admiral' }); }
  return ev;
}
export const techCost = (S, t) => TECH[t].cost[S.tech[t]];
export function buyTech(S, t) {
  if (S.tech[t] >= 3) return false; const c = techCost(S, t); if (S.credits < c) return false;
  S.credits -= c; S.tech[t]++; return true;
}

// ---------- gathering ----------
export function mine(S, id) {
  const n = NODES[id]; if (n.type !== 'field' || S.fields[id] <= 0) return null;
  const room = cargoCap(S) - cargoUsed(S); if (room <= 0) return { full: true };
  S.fields[id]--;
  let r = rand(S), g = 'ore';
  for (const k of Object.keys(n.rich)) { if (r < n.rich[k]) { g = k; break; } r -= n.rich[k]; }
  const amt = Math.min(room, g === 'crystal' ? 1 + Math.floor(S.tech.drill / 2) : 1 + S.tech.drill);
  S.cargo[g] += amt; S.stats.mined += amt;
  return { good: g, amt };
}
export function salvage(S, id) {
  if (NODES[id].type !== 'wreck' || S.fields[id] <= 0) return null;
  const room = cargoCap(S) - cargoUsed(S); if (room <= 0) return { full: true };
  S.fields[id]--;
  const g = rand(S) < 0.3 ? 'tech' : 'scrap';
  const amt = Math.min(room, g === 'tech' ? 1 : 1 + S.tech.tractor);
  S.cargo[g] += amt; S.stats.salvaged += amt;
  return { good: g, amt };
}

// ---------- convoys + raids ----------
export const convoyNode = (c) => ROUTES[c.route].path[c.i];
export const raidsAt = (S, id) => S.convoys.filter((c) => c.raid && convoyNode(c) === id);
export function threatAt(S, id) { // what fight waits at this node, if any
  const r = raidsAt(S, id)[0]; if (r) return { kind: 'raid', convoy: S.convoys.indexOf(r), power: r.raid.power };
  const ne = S.nests[id]; if (ne && ne.down <= 0) return { kind: 'nest', node: id, power: ne.power + Math.floor(S.day / 3) };
  return null;
}
function spawnRaid(S, c) {
  c.raid = { power: Math.round(9 + S.day * 0.7 + rand(S) * 6), days: RAID_DAYS + S.tech.scanner, max: RAID_DAYS + S.tech.scanner };
}

export function advanceDay(S) {
  const ev = [];
  S.day++;
  // prices drift: random walk with a pull back to the station's normal price
  for (const n of stations()) for (const g of GOOD_IDS) {
    const target = GOODS[g].base * n.mult[g];
    S.trend[n.id][g] = clamp(S.trend[n.id][g] * 0.6 + (rand(S) - 0.5) * 0.12, -0.12, 0.12);
    const p = S.prices[n.id][g] * (1 + S.trend[n.id][g]);
    S.prices[n.id][g] = clamp(p + (target - p) * 0.25, target * 0.6, target * 1.6);
  }
  // convoys move one hop unless pirates hold them
  for (const [i, c] of S.convoys.entries()) {
    if (c.raid) {
      c.raid.days--;
      if (c.raid.days <= 0) {
        c.raid = null; S.stats.lost++; S.rep = Math.max(0, S.rep - 4);
        const end = ROUTES[c.route].path[c.dir > 0 ? ROUTES[c.route].path.length - 1 : 0];
        S.prices[end].food *= 1.25; S.prices[end].tech *= 1.2; // shortage where it was going
        ev.push({ type: 'lost', convoy: i });
      }
      continue;
    }
    const len = ROUTES[c.route].path.length;
    if (c.i + c.dir < 0 || c.i + c.dir >= len) c.dir *= -1;
    c.i += c.dir;
  }
  // new raids: the first one comes on day 2 near the player so the loop is taught early
  const active = S.convoys.filter((c) => c.raid).length;
  if (!S.tutorialRaid && S.day >= 2) {
    S.tutorialRaid = true;
    const c = S.convoys[0]; if (!c.raid) { spawnRaid(S, c); c.raid.power = Math.min(c.raid.power, 11); ev.push({ type: 'raid', convoy: 0 }); }
  } else if (active < 2) {
    // pirates mostly stay away from convoys inside a guarded area
    for (const [i, c] of S.convoys.entries()) if (!c.raid && rand(S) < (guards(S, c).length ? 0.05 : 0.16)) { spawnRaid(S, c); ev.push({ type: 'raid', convoy: i }); break; }
  }
  for (const id of Object.keys(S.fields)) S.fields[id] = Math.min(NODES[id].type === 'field' ? FIELD_ROCKS : WRECK_BITS, S.fields[id] + 2);
  for (const ne of Object.values(S.nests)) if (ne.down > 0) ne.down--;
  ev.push(...guardSweep(S));
  return ev;
}

// ---------- fights ----------
export function winChance(P, E) { if (E <= 0) return 1; return clamp((P * P) / (P * P + E * E), 0.05, 0.97); }
// threat: from threatAt; flown: optional result of a launched battle {kills, total, landed}
export function resolveFight(S, threat, flown = null) {
  const P = fleetPower(S);
  const frac = flown ? flown.kills / Math.max(1, flown.total) : 0;
  const E = Math.round(threat.power * (1 - frac));
  const chance = winChance(P, E);
  const shotDown = flown && !flown.landed && flown.kills < flown.total; // shields gone before the job was done
  const win = !shotDown && (E <= 0 || rand(S) < chance);
  const out = { win, chance, P, E: threat.power, left: E, losses: [], credits: 0, rep: 0, loot: {}, shotDown: !!shotDown };
  S.stats.battles++; if (flown) S.stats.kills += flown.kills;
  const cheapest = () => { let b = -1; for (let i = 0; i < S.fleet.length; i++) if (b < 0 || SHIPS[S.fleet[i]].cost < SHIPS[S.fleet[b]].cost) b = i; return b; };
  const addLoot = (g, n) => { n = Math.min(n, cargoCap(S) - cargoUsed(S)); if (n > 0) { S.cargo[g] += n; out.loot[g] = (out.loot[g] || 0) + n; } };
  if (win) {
    if (chance < 0.6 && E > 0 && rand(S) < 0.35) { const i = cheapest(); if (i >= 0) out.losses.push(S.fleet.splice(i, 1)[0]); }
    if (threat.kind === 'raid') {
      const c = S.convoys[threat.convoy]; c.raid = null; S.stats.saved++;
      out.credits = 80 + threat.power * 8; out.rep = 8;
    } else {
      S.nests[threat.node].down = 8; out.credits = threat.power * 11; out.rep = 6; addLoot('crystal', 2);
    }
    if (flown && flown.kills >= flown.total) { out.credits += 60; out.rep += 2; }
    addLoot('scrap', 2 + S.tech.tractor * 2);
  } else {
    const i = cheapest(); if (i >= 0) out.losses.push(S.fleet.splice(i, 1)[0]);
    for (const g of GOOD_IDS) S.cargo[g] -= Math.ceil(S.cargo[g] * 0.25);
    if (threat.kind === 'raid') {
      const c = S.convoys[threat.convoy]; c.raid.power = Math.max(6, Math.round(c.raid.power * 0.8)); // pirates got hurt too
    } else { S.pos = { ...S.prevPos }; S.node = nodeAt(S.pos.x, S.pos.z); } // pushed back out of the pirate base
  }
  S.credits += out.credits; S.rep += out.rep;
  if (!S.won && S.rep >= GOAL_REP) { S.won = true; out.admiral = true; }
  return out;
}
