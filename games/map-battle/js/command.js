// Delegated command for Battle of Kerovo r3. Each level has one plan function that splits its
// order among its children; the same functions serve the player's orders and the green AI.
//   army  -> corps:     main effort, flank corps, reserve corps
//   corps -> divisions: pin, flank, reserve (infantry); cavalry screens the far flank;
//                       artillery takes the best high ground in range of the objective
//   div   -> regiments: line abreast to pin, lead + echelon to attack, column in reserve
//   reg   -> battalions: abreast; battalions then pick line, column or square themselves
// A node the player ordered directly is "overridden": its parent's plan skips it until released.
// Source part: none in parts-library covers command trees; written new for map-battle r3.
import { WORLD, HILLS, VILLAGES } from './map.js';
import { parentOf } from './org.js';

export const ROLE = {
  attack: 'attack', pin: 'pin', flank: 'flank', reserve: 'reserve', bombard: 'bombard', screen: 'screen',
  hold: 'hold', move: 'move', support: 'support',
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cw = (x) => clamp(x, 24, WORLD.w - 24);
const ch = (y) => clamp(y, 24, WORLD.h - 24);

export function liveLeaves(n) { return n.leaves.filter((u) => !u.dead && !u.routed); }
export function nodeCentroid(n) {
  const l = liveLeaves(n);
  if (!l.length) return null;
  let x = 0, y = 0;
  for (const u of l) { x += u.x; y += u.y; }
  return { x: x / l.length, y: y / l.length };
}
export function nodeStrength(n) {
  const l = liveLeaves(n);
  return l.length ? l.reduce((s, u) => s + u.str, 0) / l.length : 0;
}

/**
 * Give a node an order. by = 'player' | 'ai' | 'parent'. A player order on anything below the
 * army overrides that node's parent until released.
 */
export function orderNode(state, n, x, y, by = 'player', role = null) {
  const c = nodeCentroid(n);
  if (!c) return;
  const ang = Math.hypot(x - c.x, y - c.y) > 6 ? Math.atan2(y - c.y, x - c.x) : (n.order ? n.order.ang : liveLeaves(n)[0].ang);
  // reach = how far the order sends the command; reserves never march back further than half of it
  n.order = { x: cw(x), y: ch(y), ang, role: role || (n.level === 'bn' ? ROLE.move : ROLE.attack), by, t0: state.t, phase: 0, reach: Math.hypot(x - c.x, y - c.y) };
  if (by === 'player') {
    // a player order re-asserts the chain below it: every sub-command rejoins this node's plan
    const clear = (k) => { for (const id of k.children) { const c = state.nodes.get(id); c.override = false; clear(c); } };
    clear(n);
    if (n.level !== 'army') n.override = true;
  }
  if (n.level === 'corps') n.lastOrder = { x: n.order.x, y: n.order.y };
  planNode(state, n);
}

/** Release a player override: the node rejoins its parent's plan at once. */
export function releaseNode(state, n) {
  n.override = false;
  const p = parentOf(state, n);
  if (p && p.order) planNode(state, p);
}

/** Children that take part in this node's plan (alive and not overridden). */
const freeKids = (state, n) => n.children.map((id) => state.nodes.get(id)).filter((k) => !k.override && liveLeaves(k).length);

function assign(state, n, kid, x, y, face, role) {
  n.plan.push({ id: kid.id, x: cw(x), y: ch(y), role });
  const o = kid.order;
  // keep a child's current order when the plan barely moved, so battalions do not jitter
  if (o && o.by === 'parent' && o.role === role && Math.hypot(o.x - x, o.y - y) < 25) return;
  kid.order = { x: cw(x), y: ch(y), ang: face, role, by: 'parent', t0: state.t, phase: 0 };
  planNode(state, kid);
}

/** Re-split a node's order among its children (also called on a slow clock as things change). */
export function planNode(state, n) {
  n.plan = [];
  n.replanAt = state.t + 2.5;
  const o = n.order;
  if (!o) return;
  if (n.level === 'bn') { state.applyLeafOrder(n, o); return; }
  const kids = freeKids(state, n);
  if (!kids.length) return;
  const fx = Math.cos(o.ang), fy = Math.sin(o.ang);
  const px = -fy, py = fx;
  const T = { x: o.x, y: o.y };
  const at = (l, f, base = T) => ({ x: base.x + px * l + fx * f, y: base.y + py * l + fy * f });
  ({ army: planArmy, corps: planCorps, div: planDiv, reg: planReg }[n.level])(state, n, kids, o, T, at, { fx, fy, px, py });
}

/** Lateral position of a child relative to the order axis (negative = left of the line of advance). */
function lateral(k, T, ax) {
  const c = nodeCentroid(k);
  return (c.x - T.x) * ax.px + (c.y - T.y) * ax.py;
}

/** Which flank to turn: the side with fewer enemies near it, ties broken toward the map interior. */
export function flankSide(state, n, T, ax, reach = 170) {
  let best = 1, bs = Infinity;
  for (const s of [1, -1]) {
    const p = { x: T.x + ax.px * reach * s, y: T.y + ax.py * reach * s };
    let foes = 0;
    for (const u of state.units) if (u.side !== n.side && !u.dead && !u.routed && Math.hypot(u.x - p.x, u.y - p.y) < 200) foes++;
    const edge = (p.x < 60 || p.x > WORLD.w - 60 || p.y < 60 || p.y > WORLD.h - 60) ? 50 : 0;
    const score = foes * 10 + edge + Math.hypot(p.x - WORLD.w / 2, p.y - WORLD.h / 2) * 0.001;
    if (score < bs) { bs = score; best = s; }
  }
  return best;
}

/** Best gun position: a hill on our side of the objective, within range, else a stand-off point. */
export function gunSite(T, ang, range) {
  const fx = Math.cos(ang), fy = Math.sin(ang);
  const ideal = { x: T.x - fx * range * 0.7, y: T.y - fy * range * 0.7 };
  let best = null, bs = Infinity;
  for (const h of HILLS) {
    const d = Math.hypot(h.x - T.x, h.y - T.y);
    const behind = (h.x - T.x) * fx + (h.y - T.y) * fy; // negative = our side
    if (behind > 40) continue;
    // stand on the crest point of the hill that lies within range of the objective
    const k = d > range * 0.92 ? (d - range * 0.92) / d : 0;
    const p = { x: h.x + (T.x - h.x) * k, y: h.y + (T.y - h.y) * k };
    if (Math.hypot(p.x - h.x, p.y - h.y) > h.r * 0.9) continue;
    const score = Math.hypot(p.x - ideal.x, p.y - ideal.y) - h.h * 40;
    if (score < bs) { bs = score; best = { ...p, hill: h }; }
  }
  return best || { ...ideal, hill: null };
}

function planArmy(state, n, kids, o, T, at, ax) {
  // main effort = the corps closest to the objective; one corps turns the flank; one in reserve
  const sorted = kids.slice().sort((a, b) => dist(a, T) - dist(b, T));
  const s = flankSide(state, n, T, ax, 300);
  sorted.forEach((k, i) => {
    if (i === 0) { const p = at(0, 0); assign(state, n, k, p.x, p.y, o.ang, ROLE.attack); }
    else if (i === 1) { const p = at(s * 260, -40); assign(state, n, k, p.x, p.y, o.ang, ROLE.flank); }
    else { const p = at(-s * 120, -backOf(o, 260)); assign(state, n, k, p.x, p.y, o.ang, ROLE.reserve); }
  });
}
/** Depth of a reserve behind the objective: full depth on a long order, never behind the start line on a short one. */
const backOf = (o, d) => Math.min(d, Math.max(40, (o.reach ?? d * 2) * 0.5));
const dist = (k, p) => { const c = nodeCentroid(k); return Math.hypot(c.x - p.x, c.y - p.y); };

function planCorps(state, n, kids, o, T, at, ax) {
  const inf = kids.filter((k) => k.kind === 'inf');
  const cav = kids.filter((k) => k.kind === 'cav');
  const art = kids.filter((k) => k.kind === 'art');
  const hold = o.role === ROLE.hold || o.role === ROLE.reserve;
  const s = o.flankSide || (o.flankSide = flankSide(state, n, T, ax));
  if (hold) {
    // defend: infantry abreast on the objective, guns behind, horse on the open flank
    inf.sort((a, b) => lateral(a, T, ax) - lateral(b, T, ax)).forEach((k, i) => { const p = at((i - (inf.length - 1) / 2) * 110, 0); assign(state, n, k, p.x, p.y, o.ang, ROLE.hold); });
    for (const k of cav) { const p = at(s * 200, -60); assign(state, n, k, p.x, p.y, o.ang, ROLE.screen); }
    for (const k of art) { const g = gunSite(T, o.ang, 180); assign(state, n, k, g.x, g.y, o.ang, ROLE.bombard); }
    return;
  }
  // attack: pin with the centre division, flank with the one on the chosen side, reserve the other
  const byLat = inf.slice().sort((a, b) => (lateral(a, T, ax) - lateral(b, T, ax)) * s);
  let pin = null, flank = null, reserve = null;
  if (byLat.length >= 3) { reserve = byLat[0]; pin = byLat[1]; flank = byLat[2]; }
  else if (byLat.length === 2) { pin = byLat[0]; flank = byLat[1]; }
  else pin = byLat[0] || null;
  const pinStr = pin ? nodeStrength(pin) : 0;
  const flankStr = flank ? nodeStrength(flank) : 0;
  // flank: march wide first, then turn in on the objective once there (or once the pin is hot)
  if (flank) {
    const wp = at(s * 175, -20);
    const fc = nodeCentroid(flank);
    if (o.phase === 0 && (Math.hypot(fc.x - wp.x, fc.y - wp.y) < 60 || state.t - o.t0 > 50)) o.phase = 1;
    const p = o.phase === 0 ? wp : at(s * 40, 10);
    assign(state, n, flank, p.x, p.y, o.phase === 0 ? o.ang : o.ang - s * Math.PI / 2, ROLE.flank);
  }
  if (pin) { const p = at(0, -62); assign(state, n, pin, p.x, p.y, o.ang, ROLE.pin); }
  if (reserve) {
    // the reserve commits when a front division is worn down, or after a long fight
    if (!o.committed && ((pin && pinStr < 0.6) || (flank && flankStr < 0.6) || state.t - o.t0 > 70)) o.committed = true;
    const p = o.committed ? at(0, 0) : at(-s * 30, -backOf(o, 230));
    assign(state, n, reserve, p.x, p.y, o.ang, o.committed ? ROLE.attack : ROLE.reserve);
  }
  for (const k of cav) { const p = at(-s * 210, -40); assign(state, n, k, p.x, p.y, o.ang, ROLE.screen); }
  for (const k of art) { const g = gunSite(T, o.ang, 200); assign(state, n, k, g.x, g.y, Math.atan2(T.y - g.y, T.x - g.x), ROLE.bombard); }
}

function planDiv(state, n, kids, o, T, at) {
  const role = o.role;
  if (n.kind === 'art' || n.kind === 'cav') {
    kids.forEach((k, i) => { const p = at((i - (kids.length - 1) / 2) * (n.kind === 'art' ? 60 : 40), 0); assign(state, n, k, p.x, p.y, o.ang, role); });
    return;
  }
  if (role === ROLE.reserve) {
    kids.forEach((k, i) => { const p = at(0, -i * 46); assign(state, n, k, p.x, p.y, o.ang, ROLE.reserve); });
  } else if (role === ROLE.pin || role === ROLE.hold) {
    kids.forEach((k, i) => { const p = at((i - (kids.length - 1) / 2) * 52, 0); assign(state, n, k, p.x, p.y, o.ang, role); });
  } else {
    // lead regiment on the objective, the second in echelon behind its outer shoulder
    kids.forEach((k, i) => { const p = i === 0 ? at(0, 0) : at(-34, -40); assign(state, n, k, p.x, p.y, o.ang, i === 0 ? role : ROLE.support); });
  }
}

function planReg(state, n, kids, o, T, at) {
  const gap = n.kind === 'art' ? 30 : n.kind === 'cav' ? 18 : 24;
  kids.forEach((k, i) => { const p = at((i - (kids.length - 1) / 2) * gap, 0); assign(state, n, k, p.x, p.y, o.ang, o.role); });
}

/** Slow re-planning: phases advance, reserves commit and losses are re-balanced. */
export function stepCommand(state) {
  for (const n of state.nodes.values()) {
    if (n.level === 'bn' || !n.order || state.t < n.replanAt) continue;
    planNode(state, n);
  }
}

/** Mean x of the villages, used to know which way is "forward" for a side. */
export const VILLAGE_LINE = VILLAGES.reduce((s, v) => s + v.x, 0) / VILLAGES.length;
