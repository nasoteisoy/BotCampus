// Space Campaign rules: pure game state + rules (no DOM, no three.js). Seeded RNG lives in the save so a reload continues the same run.
import { GOODS, GOOD_IDS, NODES, LINKS, ROUTES, HOME, SHIPS, FLEET_MAX, TECH, TECH_IDS, CARRIER, GOAL_REP } from './data.js';

export const SAVE_KEY = 'botcampus-space-campaign-v1';
const VERSION = 1;
export const FIELD_ROCKS = 6, WRECK_BITS = 5, RAID_DAYS = 4;

export function rand(S) { // mulberry32, state kept in S.seed
  let t = (S.seed = (S.seed + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const node = (id) => NODES[id];
const ADJ = NODES.map(() => []);
for (const [a, b] of LINKS) { ADJ[a].push(b); ADJ[b].push(a); }
export const neighbors = (id) => ADJ[id];
const ROUTE_NODES = [...new Set(ROUTES.flatMap((r) => r.path))];
export const stations = () => NODES.filter((n) => n.type === 'station');

export function newGame(seed = (Date.now() & 0x7fffffff)) {
  const S = {
    v: VERSION, seed, day: 1, hop: 0, credits: 300, rep: 0, node: HOME, prev: HOME, visited: [HOME],
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
  return S;
}

// ---------- save ----------
export function save(S) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); return true; } catch (_) { return false; } }
export function load() {
  try { const S = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return S && S.v === VERSION ? S : null; } catch (_) { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (_) {} }

// ---------- visibility (fog of war) ----------
export function visibleSet(S) {
  const vis = new Set([...S.visited, ...ROUTE_NODES]); // Empire charts show the trade lanes; the rest is scouted
  for (const v of S.visited) for (const n of ADJ[v]) vis.add(n);
  if (S.tech.scanner > 0) { // scanner: see further from where the carrier is now
    let ring = [S.node];
    for (let d = 0; d < 1 + S.tech.scanner; d++) { const nx = []; for (const a of ring) for (const b of ADJ[a]) if (!vis.has(b) || d < 2) { vis.add(b); nx.push(b); } ring = nx; }
  }
  return vis;
}
// shortest hop path through visible nodes
export function findPath(S, to) {
  const vis = visibleSet(S); if (!vis.has(to)) return null;
  const prev = new Map([[S.node, -1]]), q = [S.node];
  while (q.length) {
    const a = q.shift(); if (a === to) break;
    for (const b of ADJ[a]) if (vis.has(b) && !prev.has(b)) { prev.set(b, a); q.push(b); }
  }
  if (!prev.has(to)) return null;
  const p = []; for (let c = to; c !== -1; c = prev.get(c)) p.unshift(c);
  return p.slice(1);
}

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
export function fleetPower(S) {
  let atk = CARRIER.atk, hull = CARRIER.hull;
  for (const id of S.fleet) { atk += SHIPS[id].atk; hull += SHIPS[id].hull; }
  const aM = 1 + 0.2 * S.tech.laser + 0.15 * S.tech.missile, hM = 1 + 0.2 * S.tech.shield;
  return Math.round(atk * aM + hull * hM * 0.6);
}
export const wingmen = (S) => Math.min(3, S.fleet.filter((id) => id === 'fighter' || id === 'bomber').length + S.fleet.filter((id) => id === 'carrier').length * 2);
export function buyShip(S, id) {
  const c = SHIPS[id].cost; if (S.credits < c || S.fleet.length >= FLEET_MAX) return false;
  S.credits -= c; S.fleet.push(id); return true;
}
export function sellShip(S, idx) {
  const id = S.fleet[idx]; if (!id) return 0;
  const v = Math.round(SHIPS[id].cost * 0.5); S.fleet.splice(idx, 1); S.credits += v; return v;
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
    for (const [i, c] of S.convoys.entries()) if (!c.raid && rand(S) < 0.16) { spawnRaid(S, c); ev.push({ type: 'raid', convoy: i }); break; }
  }
  for (const id of Object.keys(S.fields)) S.fields[id] = Math.min(NODES[id].type === 'field' ? FIELD_ROCKS : WRECK_BITS, S.fields[id] + 2);
  for (const ne of Object.values(S.nests)) if (ne.down > 0) ne.down--;
  return ev;
}

// one hop; warp drive gives extra hops per day
export function travel(S, to) {
  if (!ADJ[S.node].includes(to)) return null;
  S.prev = S.node; S.node = to;
  if (!S.visited.includes(to)) S.visited.push(to);
  S.hop++;
  let ev = [];
  if (S.hop >= 1 + S.tech.warp) { S.hop = 0; ev = advanceDay(S); }
  return ev;
}
export function wait(S) { S.hop = 0; return advanceDay(S); }

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
    } else { S.node = S.prev; } // pushed back out of the pirate base
  }
  S.credits += out.credits; S.rep += out.rep;
  if (!S.won && S.rep >= GOAL_REP) { S.won = true; out.admiral = true; }
  return out;
}
