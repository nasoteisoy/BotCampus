// Battle rules for r3: battalions, squadrons and batteries under a command tree (org.js,
// command.js), line / column / square, cavalry charges, artillery that unlimbers, village
// capture, the green field marshal, win/lose. Pure logic with no DOM so it also runs headless;
// all randomness comes from the seeded rng so a seed replays the same battle.
// Source part: none in parts-library covers 2D regiment-block battles; written for map-battle.
import { WORLD, RIVER, VILLAGES, REDOUBTS, HILLS, rng } from './map.js';
import { buildArmies } from './org.js';
import { orderNode, releaseNode, planNode, stepCommand, liveLeaves, nodeCentroid, nodeStrength, ROLE } from './command.js';

export { orderNode, releaseNode, liveLeaves, nodeCentroid, nodeStrength, ROLE };

/** r2 regiment footprint, kept as the outer bound for drawing and hit tests. */
export const BLOCK = { len: 38, depth: 13 };
export const RULES = {
  range: 80,            // musket reach
  reload: 1.7,          // seconds between volleys
  volley: 0.032,        // strength removed by one full-strength infantry volley
  routAt: 0.15,         // a unit breaks below this strength
  sideRoutAt: 0.3,      // a side breaks below this share of its starting strength
  holdSeconds: 40,      // hold all villages, with no enemy inside, this long to win
  captureSeconds: 5,
  timeLimit: 600,
  greenFire: 0.95,      // r3: green volleys a touch softer; tuned with test/sim-r3.mjs so a split plan wins most, a blind push loses most
  aiReact: 200,         // green corps turn on blue units closer than this
  aiSupport: 420,       // a free green corps marches to help a hard-pressed one within this range
  aiRetake: 520,        // a free green corps counterattacks a village blue holds or is taking within this range
  aiMass: 330,          // ...but storms a held village only with another healthy corps this close to it
};
/** Unit kinds. Speeds are world units per second at full strength. */
export const KIND = {
  inf: { speed: 30, range: 80, reload: 1.7, volley: 0.032 },
  cav: { speed: 60, charge: 92, chargeRange: 150, melee: 0.55, recoil: 2.2, rest: 5 },
  art: { speed: 15, range: 230, reload: 3.4, volley: 0.05, deploy: 2.6 },
};
/** Formation effects for infantry: speed, firepower out, damage taken from fire. */
export const FORM = {
  line: { speed: 0.85, fire: 1, hitBy: 1 },
  column: { speed: 1.2, fire: 0.45, hitBy: 1.25 },
  square: { speed: 0.12, fire: 0.55, hitBy: 1.5 },
};

const SIDES = ['b', 'g'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createBattle(seed = 1) {
  const random = rng(seed);
  const state = {
    seed, t: 0, random, units: [], unitById: new Map(),
    villages: VILLAGES.map((v) => ({ ...v, owner: null, prog: 0, contested: false })),
    hold: { side: null, time: 0 },
    contact: false, contactAt: null,
    result: null, events: [], log: [],
    aiClock: 2.5,
  };
  buildArmies(state, (u) => {
    const unit = {
      ...u, tx: u.x, ty: u.y, tang: u.ang, moving: false,
      str: 1, cd: random() * 1.7, routed: false, dead: false, alpha: 1, hitFlash: 0,
      form: u.kind === 'inf' ? 'line' : u.kind, formSet: 'auto', formT: 0,
      limbered: true, deploy: 0, charge: null, rest: 0,
    };
    state.units.push(unit);
    state.unitById.set(unit.id, unit);
  });
  // static leaf lists per node (bottom-up)
  for (const n of [...state.nodes.values()].reverse()) {
    n.leaves = n.level === 'bn' ? [state.unitById.get(n.id)] : n.children.flatMap((c) => state.nodes.get(c).leaves);
  }
  state.applyLeafOrder = (n, o) => applyLeafOrder(state, n, o);
  state.startStrength = { b: state.units.filter((u) => u.side === 'b').length, g: state.units.filter((u) => u.side === 'g').length };
  return state;
}

function applyLeafOrder(state, n, o) {
  const u = state.unitById.get(n.id);
  if (!u || u.dead || u.routed) return;
  u.tx = clamp(o.x, 20, WORLD.w - 20);
  u.ty = clamp(o.y, 20, WORLD.h - 20);
  u.tang = o.ang;
  u.role = o.role;
  u.moving = Math.hypot(u.tx - u.x, u.ty - u.y) > 2;
  if (u.kind === 'cav' && u.charge && o.by === 'player') u.charge = null;
}

export const isActive = (u) => !u.dead && !u.routed;
export const corpsUnits = (state, corpsId) => state.units.filter((u) => u.corps === corpsId && isActive(u));

export function sideStrength(state, side) {
  let s = 0;
  for (const u of state.units) if (u.side === side && isActive(u)) s += u.str;
  return s;
}

/** Average position of a list of units, plus the northmost y (for placing the corps card). */
export function centroid(list) {
  let x = 0, y = 0, top = Infinity;
  for (const u of list) { x += u.x; y += u.y; top = Math.min(top, u.y); }
  return { x: x / list.length, y: y / list.length, top };
}

/**
 * Order any set of units: each smallest command that is wholly in the set gets the order
 * (so a whole corps is ordered as a corps, a stray battalion as a battalion).
 */
export function orderMarch(state, list, tx, ty, by = 'player') {
  for (const n of coveringNodes(state, list)) orderNode(state, n, tx, ty, by);
}
/** Highest commands whose live units are all in the list. */
export function coveringNodes(state, list) {
  const ids = new Set(list.filter(isActive).map((u) => u.id));
  if (!ids.size) return [];
  const full = (n) => { const l = liveLeaves(n); return l.length > 0 && l.every((u) => ids.has(u.id)); };
  const side = list[0].side;
  const out = [];
  const walk = (n) => { if (full(n)) { out.push(n); return; } for (const c of n.children) walk(state.nodes.get(c)); };
  walk(state.armies[side]);
  return out;
}

function distToPath(path, x, y) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
    if (d < best) best = d;
  }
  return best;
}
export const inRiver = (x, y) => distToPath(RIVER, x, y) < 9;
export const onHill = (x, y) => HILLS.some((h) => Math.hypot(x - h.x, y - h.y) < h.r * 0.8);

function coverFactor(state, u) {
  let f = 1;
  for (const v of state.villages) if (Math.hypot(u.x - v.x, u.y - v.y) < v.r * 0.75) f = Math.min(f, 0.7);
  for (const r of REDOUBTS) if (Math.hypot(u.x - r.x, u.y - r.y) < 46) f = Math.min(f, 0.55);
  return f;
}

/** Nearest active enemy, optionally filtered. Grid-free but cheap at this unit count. */
function nearestEnemy(state, u, pred) {
  let best = null, bd = Infinity;
  for (const e of state.units) {
    if (e.side === u.side || e.dead || e.routed) continue;
    if (pred && !pred(e)) continue;
    const d = Math.hypot(e.x - u.x, e.y - u.y);
    if (d < bd) { bd = d; best = e; }
  }
  return { enemy: best, dist: bd };
}

function turnToward(a, target, maxStep) {
  let d = target - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + clamp(d, -maxStep, maxStep);
}
const facingMul = (attacker, target) => {
  const toAttacker = Math.atan2(attacker.y - target.y, attacker.x - target.x);
  const facing = Math.cos(toAttacker - target.ang);
  return facing < -0.3 ? 1.6 : facing < 0.35 ? 1.25 : 1;
};

function markHit(state, target) {
  target.hitFlash = 0.25;
  for (const id of [target.corps, target.div, target.reg]) { const n = state.nodes.get(id); if (n) n.underFire = 1.5; }
}
function firstContact(state) {
  if (!state.contact) { state.contact = true; state.contactAt = state.t; }
}

function fire(state, u, target, dist) {
  const k = KIND[u.kind];
  const falloff = 1.2 - 0.5 * (dist / k.range);
  const formOut = u.kind === 'inf' ? FORM[u.form].fire : 1;
  const formIn = target.kind === 'inf' ? FORM[target.form].hitBy : target.kind === 'art' && !target.limbered ? 1.2 : 1;
  const sideMul = u.side === 'g' ? RULES.greenFire : 1;
  const vsCav = target.kind === 'cav' && u.kind === 'inf' && u.form === 'square' ? 1.8 : 1; // squares shred horse
  const dmg = k.volley * (0.4 + 0.6 * u.str) * coverFactor(state, target) * facingMul(u, target) * falloff * formOut * formIn * sideMul * vsCav * (0.75 + state.random() * 0.5);
  target.str = Math.max(0, target.str - dmg);
  markHit(state, target);
  firstContact(state);
  state.events.push({ kind: u.kind === 'art' ? 'cannon' : 'fire', x: u.x, y: u.y, ang: u.ang, side: u.side, tx: target.x, ty: target.y });
}

function stepInfantryForm(state, u, dt) {
  u.formT = Math.max(0, u.formT - dt);
  if (u.formSet !== 'auto') { u.form = u.formSet; return; }
  if (u.formT > 0) return;
  const cav = nearestEnemy(state, u, (e) => e.kind === 'cav');
  const foot = nearestEnemy(state, u, (e) => e.kind === 'inf');
  // square when horse threatens and enemy foot is not close enough to pin us in line
  const cavThreat = cav.enemy && (cav.dist < 105 || (cav.enemy.charge && cav.enemy.charge.id === u.id && cav.dist < 170));
  let want = 'line';
  if (cavThreat && foot.dist > 70) want = 'square';
  else if (u.moving && Math.hypot(u.tx - u.x, u.ty - u.y) > 160 && foot.dist > 220 && (!cav.enemy || cav.dist > 220)) want = 'column';
  if (want !== u.form) { u.form = want; u.formT = want === 'square' ? 2.5 : 1.2; }
}

function stepCavalry(state, u, dt) {
  const k = KIND.cav;
  u.rest = Math.max(0, u.rest - dt);
  if (u.charge) {
    const t = state.unitById.get(u.charge.id);
    u.charge.t += dt;
    if (!t || !isActive(t) || u.charge.t > 7) { endCharge(u); return; }
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    const a = Math.atan2(t.y - u.y, t.x - u.x);
    u.ang = turnToward(u.ang, a, dt * 4);
    if (d > 18) {
      const sp = k.charge * (0.6 + 0.4 * u.str) * (inRiver(u.x, u.y) ? 0.4 : 1);
      u.x += Math.cos(a) * Math.min(d - 14, sp * dt);
      u.y += Math.sin(a) * Math.min(d - 14, sp * dt);
    } else {
      // melee: horse cuts up foot in line or guns; against a square it bleeds instead
      u.charge.melee += dt;
      firstContact(state);
      const square = t.kind === 'inf' && t.form === 'square';
      const out = k.melee * (0.4 + 0.6 * u.str) * facingMul(u, t) * (square ? 0.06 : t.kind === 'art' ? 1.8 : t.kind === 'cav' ? 0.7 : 1) * (u.side === 'g' ? RULES.greenFire : 1);
      const back = square ? 0.32 : t.kind === 'cav' ? 0.35 : t.kind === 'art' ? 0.05 : 0.12;
      t.str = Math.max(0, t.str - out * dt);
      u.str = Math.max(0, u.str - back * dt);
      markHit(state, t); markHit(state, u);
      if (state.random() < dt * 3) state.events.push({ kind: 'melee', x: (u.x + t.x) / 2, y: (u.y + t.y) / 2, side: u.side });
      if (u.charge.melee > (square ? 1.4 : 2.4)) endCharge(u, t);
    }
    return;
  }
  if (u.recoilT > 0) {
    u.recoilT -= dt;
    u.x += Math.cos(u.recoilA) * 40 * dt;
    u.y += Math.sin(u.recoilA) * 40 * dt;
    return;
  }
  // charge targets of opportunity: guns first, then foot not in square, then horse
  if (u.rest <= 0 && u.formSet !== 'hold') {
    const pick = nearestEnemy(state, u, (e) => !(e.kind === 'inf' && e.form === 'square'));
    if (pick.enemy && pick.dist < k.chargeRange) {
      u.charge = { id: pick.enemy.id, t: 0, melee: 0 };
      state.events.push({ kind: 'charge', x: u.x, y: u.y, side: u.side, id: u.id, target: pick.enemy.id });
      return;
    }
  }
  moveToward(state, u, dt, k.speed, false);
}
function endCharge(u, t) {
  u.charge = null;
  u.rest = KIND.cav.rest;
  u.recoilT = KIND.cav.recoil;
  u.recoilA = t ? Math.atan2(u.y - t.y, u.x - t.x) : u.ang + Math.PI;
}

function moveToward(state, u, dt, speed, engaged) {
  if (!u.moving) { u.ang = turnToward(u.ang, u.tang, dt * 2.4); return; }
  const dx = u.tx - u.x, dy = u.ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) { u.moving = false; return; }
  let want = Math.atan2(dy, dx);
  const sp = speed * (0.7 + 0.3 * u.str) * (engaged ? 0.35 : 1) * (inRiver(u.x, u.y) ? 0.45 : 1);
  const step = Math.min(d, sp * dt);
  u.x += (dx / d) * step;
  u.y += (dy / d) * step;
  if (d < 30) want = u.tang;
  u.ang = turnToward(u.ang, want, dt * 2.4);
}

function stepUnit(state, u, dt) {
  u.hitFlash = Math.max(0, u.hitFlash - dt);
  if (u.dead) return;
  if (u.routed) {
    const homeX = u.side === 'b' ? -60 : WORLD.w + 60;
    const a = Math.atan2(0, homeX - u.x);
    u.ang = turnToward(u.ang, a, dt * 3);
    u.x += Math.cos(u.ang) * 36 * dt;
    u.alpha -= dt * 0.28;
    if (u.alpha <= 0) { u.alpha = 0; u.dead = true; }
    return;
  }
  if (u.kind === 'cav') { stepCavalry(state, u, dt); return; }
  const k = KIND[u.kind];
  const { enemy, dist } = nearestEnemy(state, u);
  if (u.kind === 'art') {
    // guns limber to move and unlimber to fire; a deploy takes KIND.art.deploy seconds
    const wantMove = u.moving && Math.hypot(u.tx - u.x, u.ty - u.y) > 3;
    if (u.deploy > 0) { u.deploy -= dt; if (u.deploy <= 0) u.limbered = !u.limbered; return; }
    if (wantMove && !u.limbered) { u.deploy = k.deploy; return; }
    if (!wantMove && u.limbered && enemy && dist < k.range * 1.1) { u.deploy = k.deploy; u.moving = false; return; }
    if (u.limbered) { moveToward(state, u, dt, k.speed, false); return; }
    if (enemy && dist < k.range) u.ang = turnToward(u.ang, Math.atan2(enemy.y - u.y, enemy.x - u.x), dt * 1.2);
    u.cd -= dt;
    if (enemy && dist < k.range && u.cd <= 0) { u.cd = k.reload * (0.85 + state.random() * 0.35); fire(state, u, enemy, dist); }
    return;
  }
  // infantry
  stepInfantryForm(state, u, dt);
  const engaged = enemy && dist < k.range;
  const f = FORM[u.form];
  moveToward(state, u, dt, k.speed * f.speed, engaged);
  if (engaged && u.moving && dist < k.range * 0.8) {
    // halt to fire when the enemy stands ahead on the line of march; keep going when falling back
    const ahead = Math.cos(Math.atan2(enemy.y - u.y, enemy.x - u.x) - Math.atan2(u.ty - u.y, u.tx - u.x));
    if (ahead > 0.3) { u.moving = false; }
  }
  if (engaged && !u.moving) u.ang = turnToward(u.ang, Math.atan2(enemy.y - u.y, enemy.x - u.x), dt * 2.4);
  u.cd -= dt;
  if (engaged && u.cd <= 0) {
    u.cd = k.reload * (0.85 + state.random() * 0.35);
    fire(state, u, enemy, dist);
  }
}

function separate(state) {
  const live = state.units.filter((u) => !u.dead);
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx > 30 || dx < -30 || dy > 30 || dy < -30) continue;
      const d = Math.hypot(dx, dy);
      let min = a.side === b.side ? 15 : 22;
      if (a.side !== b.side && ((a.charge && a.charge.id === b.id) || (b.charge && b.charge.id === a.id))) min = 14;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const wa = a.kind === 'art' && !a.limbered ? 0.2 : 1, wb = b.kind === 'art' && !b.limbered ? 0.2 : 1;
        a.x -= (dx / d) * push * wa; a.y -= (dy / d) * push * wa;
        b.x += (dx / d) * push * wb; b.y += (dy / d) * push * wb;
      }
    }
  }
}

function checkRouts(state) {
  for (const u of state.units) {
    if (!u.routed && !u.dead && u.str < RULES.routAt) {
      u.routed = true; u.moving = false; u.charge = null;
      state.events.push({ kind: 'rout', x: u.x, y: u.y, side: u.side });
    }
  }
}

function stepVillages(state, dt) {
  for (const v of state.villages) {
    let b = 0, g = 0;
    for (const u of state.units) {
      if (!isActive(u)) continue;
      if (Math.hypot(u.x - v.x, u.y - v.y) < v.r) { if (u.side === 'b') b++; else g++; }
    }
    v.contested = b > 0 && g > 0;
    const rate = dt / RULES.captureSeconds;
    const before = v.owner;
    if (b && !g) v.prog = Math.min(1, v.prog + rate);
    else if (g && !b) v.prog = Math.max(-1, v.prog - rate);
    if (v.prog >= 1) v.owner = 'b';
    else if (v.prog <= -1) v.owner = 'g';
    else if ((v.owner === 'b' && v.prog <= 0) || (v.owner === 'g' && v.prog >= 0)) v.owner = null;
    if (v.owner && v.owner !== before) state.events.push({ kind: 'capture', x: v.x, y: v.y, side: v.owner });
  }
}

/**
 * r3 hold rule: the hold clock only runs after first contact (the first shot or charge of the
 * battle), and a contested village pauses it instead of letting it tick. Losing a village or a
 * change of holder resets it. So no side can win by hold before any fighting has happened.
 */
function stepVictory(state, dt) {
  const owners = state.villages.map((v) => v.owner);
  const allSide = owners.every((o) => o && o === owners[0]) ? owners[0] : null;
  const contested = state.villages.some((v) => v.contested);
  if (!allSide) state.hold = { side: null, time: 0 };
  else if (state.hold.side !== allSide) state.hold = { side: allSide, time: 0 };
  state.hold.paused = !!allSide && (!state.contact || contested);
  if (allSide && !state.hold.paused) state.hold.time += dt;
  const finish = (winner, why) => { state.result = { winner, why, time: state.t }; };
  if (state.hold.side && state.hold.time >= RULES.holdSeconds) return finish(state.hold.side, 'hold');
  for (const side of SIDES) {
    if (sideStrength(state, side) < state.startStrength[side] * RULES.sideRoutAt) return finish(side === 'b' ? 'g' : 'b', 'rout');
  }
  if (state.t >= RULES.timeLimit) {
    const held = (s) => owners.filter((o) => o === s).length;
    const diff = held('b') - held('g');
    const winner = diff !== 0 ? (diff > 0 ? 'b' : 'g') : (sideStrength(state, 'b') >= sideStrength(state, 'g') ? 'b' : 'g');
    finish(winner, 'time');
  }
}

/**
 * Green field marshal: picks an objective for each corps (village, threat, support, retake,
 * fall back) and hands it down; the corps marshals split it with the same plans the player gets.
 */
function stepAI(state, dt) {
  state.aiClock -= dt;
  if (state.aiClock > 0) return;
  state.aiClock = 1.2;
  const blues = state.units.filter((u) => u.side === 'b' && isActive(u));
  const allMine = state.villages.every((v) => v.owner === 'g');
  for (const c of state.corps) {
    if (c.side !== 'g' || c.override) continue;
    const live = liveLeaves(c);
    if (!live.length) continue;
    const at = centroid(live);
    const avg = nodeStrength(c);
    let target = null, role = ROLE.attack;
    let threat = null, td = Infinity;
    for (const b of blues) { const d = Math.hypot(b.x - at.x, b.y - at.y); if (d < td) { td = d; threat = b; } }
    const mine = state.villages.filter((v) => v.owner === 'g');
    const inContact = live.some((u) => nearestEnemy(state, u).dist < RULES.range);
    if (inContact && avg >= 0.35 && c.order) continue;
    const help = avg >= 0.5 ? supportTarget(state, c, at) : null;
    if (avg < 0.35 && mine.length) {
      const v = nearestOf(mine, at); target = { x: v.x + 30, y: v.y }; role = ROLE.hold;
    } else if (help) {
      target = help;
    } else if (threat && td < RULES.aiReact) {
      target = { x: threat.x, y: threat.y };
    } else if (allMine && !state.contact && threat) {
      // r3: holding every village wins nothing before a fight, so go and find one
      target = { x: threat.x, y: threat.y };
    } else {
      let goal = state.villages[c.goal];
      if (goal.owner === 'g') {
        const open = state.villages.filter((v) => v.owner !== 'g');
        if (open.length) { goal = nearestOf(open, at); c.goal = state.villages.indexOf(goal); }
        else role = ROLE.hold;
      }
      target = { x: goal.x, y: goal.y };
    }
    const last = c.lastOrder;
    const newTarget = !last || Math.hypot(last.x - target.x, last.y - target.y) > 40;
    const stalled = !live.some((u) => u.moving) && Math.hypot(at.x - target.x, at.y - target.y) > 60;
    if (newTarget || stalled) {
      orderNode(state, c, target.x, target.y, 'ai', role);
      state.log.push({ t: state.t, corps: c.id, x: Math.round(target.x), y: Math.round(target.y), role, plan: c.plan.map((p) => ({ id: p.id, role: p.role, kind: state.nodes.get(p.id).kind, x: Math.round(p.x), y: Math.round(p.y) })) });
    }
  }
}

/**
 * Where a free, healthy green corps is most needed: a village blue holds or is taking
 * (counterattack, massed with a second corps unless blue's hold clock runs), or a green corps
 * in contact that is losing its fight (support).
 */
function supportTarget(state, c, at) {
  let best = null, bd = Infinity;
  for (const v of state.villages) {
    if (!(v.owner === 'b' || v.prog > 0.15)) continue;
    const d = Math.hypot(v.x - at.x, v.y - at.y);
    if (d < RULES.aiRetake && d < bd) { bd = d; best = v; }
  }
  if (best) {
    const friends = state.corps.filter((k) => {
      if (k.side !== 'g' || k.id === c.id) return false;
      const kc = nodeCentroid(k);
      return kc && nodeStrength(k) >= 0.5 && Math.hypot(kc.x - best.x, kc.y - best.y) < RULES.aiMass;
    }).length;
    if (friends || state.hold.side === 'b' || (best.prog > 0.15 && best.owner !== 'b')) return { x: best.x, y: best.y };
    return { x: best.x + RULES.range * 1.6, y: best.y };
  }
  for (const k of state.corps) {
    if (k.side !== 'g' || k.id === c.id || k.underFire <= 0) continue;
    const kc = nodeCentroid(k);
    if (!kc || nodeStrength(k) > 0.75) continue;
    const d = Math.hypot(kc.x - at.x, kc.y - at.y);
    if (d < RULES.aiSupport && d < bd) { bd = d; best = kc; }
  }
  return best;
}

function nearestOf(list, p) {
  let best = list[0], bd = Infinity;
  for (const v of list) {
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

export function stepBattle(state, dt) {
  if (state.result) return;
  state.t += dt;
  stepAI(state, dt);
  stepCommand(state);
  for (const n of state.nodes.values()) n.underFire = Math.max(0, n.underFire - dt);
  for (const u of state.units) stepUnit(state, u, dt);
  separate(state);
  checkRouts(state);
  stepVillages(state, dt);
  stepVictory(state, dt);
}
