// Battle rules: regiments, formation marching, volley losses, village capture, green AI, win/lose.
// Pure logic with no DOM so it can also run headless. Source part: none in parts-library covers
// 2D regiment-block battles; formation and objective-hold ideas follow the genre checklists.
import { WORLD, RIVER, VILLAGES, REDOUBTS, START, REGIMENTS_PER_CORPS, rng } from './map.js';

export const BLOCK = { len: 38, depth: 13 };
export const RULES = {
  speed: 30,            // world units per second at full strength
  range: 80,            // volley reach
  reload: 1.7,          // seconds between volleys
  volley: 0.032,        // strength removed by one full-strength volley
  routAt: 0.15,         // a regiment breaks below this strength
  sideRoutAt: 0.3,      // a side breaks below this share of its starting strength
  holdSeconds: 40,      // hold all villages, with no enemy inside, this long to win
  captureSeconds: 5,
  timeLimit: 600,
  greenFire: 0.9,       // r2: was 0.8; green volleys still a touch softer so a thought-out attack can win
  aiReact: 200,         // green corps turn on blue regiments closer than this
  aiSupport: 420,       // r2: a free green corps marches to help a hard-pressed one within this range
  aiRetake: 520,        // r2: a free green corps counterattacks a village blue holds or is taking within this range
  aiMass: 330,          // r2: ...but storms a held village only with another healthy corps this close to it
};

const SIDES = ['b', 'g'];
const ROMAN = ['I', 'II', 'III'];

export function createBattle(seed = 1) {
  const random = rng(seed);
  const units = [];
  const corps = [];
  for (const side of SIDES) {
    START[side].forEach((spot, ci) => {
      const id = `${side}${ci}`;
      const c = { id, side, index: ci, label: ROMAN[ci], goal: ci, lastOrder: null, underFire: 0 };
      corps.push(c);
      for (let k = 0; k < REGIMENTS_PER_CORPS; k++) {
        const row = Math.floor(k / 3);
        const col = (k % 3) - 1;
        const fx = Math.cos(spot.face);
        const fy = Math.sin(spot.face);
        const x = spot.x - fx * row * 30 - fy * col * 50;
        const y = spot.y - fy * row * 30 + fx * col * 50;
        units.push({
          id: `${id}-${k}`, side, corps: id, x, y, ang: spot.face,
          tx: x, ty: y, tang: spot.face, moving: false,
          str: 1, cd: random() * RULES.reload, routed: false, dead: false, alpha: 1, hitFlash: 0,
        });
      }
    });
  }
  return {
    t: 0, random, units, corps,
    villages: VILLAGES.map((v) => ({ ...v, owner: null, prog: 0 })),
    hold: { side: null, time: 0 },
    result: null,
    events: [],
    aiClock: 2.5,
    startStrength: { b: REGIMENTS_PER_CORPS * START.b.length, g: REGIMENTS_PER_CORPS * START.g.length },
  };
}

export const isActive = (u) => !u.dead && !u.routed;
export const corpsUnits = (state, corpsId) => state.units.filter((u) => u.corps === corpsId && isActive(u));

export function sideStrength(state, side) {
  let s = 0;
  for (const u of state.units) if (u.side === side && isActive(u)) s += u.str;
  return s;
}

/** Average position of a list of regiments, plus the northmost y (for placing the corps card). */
export function centroid(list) {
  let x = 0, y = 0, top = Infinity;
  for (const u of list) { x += u.x; y += u.y; top = Math.min(top, u.y); }
  return { x: x / list.length, y: y / list.length, top };
}

/** Order units to march to (tx,ty) in line formation facing the direction of travel. */
export function orderMarch(state, list, tx, ty) {
  const live = list.filter(isActive);
  if (!live.length) return;
  const c = centroid(live);
  let ang = Math.atan2(ty - c.y, tx - c.x);
  if (Math.hypot(tx - c.x, ty - c.y) < 4) ang = live[0].ang;
  const fx = Math.cos(ang), fy = Math.sin(ang);
  const lx = -fy, ly = fx;
  const rows = Math.ceil(live.length / 6);
  const perRow = Math.ceil(live.length / rows);
  const gap = BLOCK.len + 6;
  const sorted = live.slice().sort((a, b) => (a.x * lx + a.y * ly) - (b.x * lx + b.y * ly));
  // Fill the front row first so the strongest line meets the enemy.
  sorted.forEach((u, i) => {
    const row = i % rows;
    const slot = Math.floor(i / rows);
    const inRow = row === rows - 1 ? live.length - perRow * (rows - 1) : perRow;
    const lat = (slot - (Math.min(perRow, inRow) - 1) / 2) * gap;
    const dep = -row * 30;
    u.tx = clamp(tx + lx * lat + fx * dep, 20, WORLD.w - 20);
    u.ty = clamp(ty + ly * lat + fy * dep, 20, WORLD.h - 20);
    u.tang = ang;
    u.moving = true;
  });
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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

function coverFactor(state, u) {
  let f = 1;
  for (const v of state.villages) if (Math.hypot(u.x - v.x, u.y - v.y) < v.r * 0.75) f = Math.min(f, 0.7);
  for (const r of REDOUBTS) if (Math.hypot(u.x - r.x, u.y - r.y) < 46) f = Math.min(f, 0.55);
  return f;
}

function nearestEnemy(state, u) {
  let best = null, bd = Infinity;
  for (const e of state.units) {
    if (e.side === u.side || !isActive(e)) continue;
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

function fireVolley(state, u, target, dist) {
  const toAttacker = Math.atan2(u.y - target.y, u.x - target.x);
  const facing = Math.cos(toAttacker - target.ang);
  const flank = facing < -0.3 ? 1.6 : facing < 0.35 ? 1.25 : 1;
  const falloff = 1.2 - 0.5 * (dist / RULES.range);
  const dmg = RULES.volley * (0.4 + 0.6 * u.str) * coverFactor(state, target) * flank * falloff * (u.side === 'g' ? RULES.greenFire : 1) * (0.75 + state.random() * 0.5);
  target.str = Math.max(0, target.str - dmg);
  target.hitFlash = 0.25;
  const c = state.corps.find((k) => k.id === target.corps);
  if (c) c.underFire = 1.5;
  state.events.push({ kind: 'fire', x: u.x, y: u.y, ang: u.ang, side: u.side });
}

function stepUnit(state, u, dt) {
  u.hitFlash = Math.max(0, u.hitFlash - dt);
  if (u.dead) return;
  if (u.routed) {
    const homeX = u.side === 'b' ? -60 : WORLD.w + 60;
    const a = Math.atan2(0, homeX - u.x);
    u.ang = turnToward(u.ang, a, dt * 3);
    u.x += Math.cos(u.ang) * RULES.speed * 1.2 * dt;
    u.alpha -= dt * 0.28;
    if (u.alpha <= 0) { u.alpha = 0; u.dead = true; }
    return;
  }
  const { enemy, dist } = nearestEnemy(state, u);
  const engaged = enemy && dist < RULES.range;
  let want = u.tang;
  if (u.moving) {
    const dx = u.tx - u.x, dy = u.ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) {
      u.moving = false;
    } else {
      want = Math.atan2(dy, dx);
      const sp = RULES.speed * (0.7 + 0.3 * u.str) * (engaged ? 0.35 : 1) * (inRiver(u.x, u.y) ? 0.45 : 1);
      const step = Math.min(d, sp * dt);
      u.x += (dx / d) * step;
      u.y += (dy / d) * step;
      if (d < 30) want = u.tang;
    }
  }
  if (engaged && u.moving && dist < RULES.range * 0.8) {
    // Halt to fire when the enemy stands ahead on the line of march; keep going when falling back.
    const ahead = Math.cos(Math.atan2(enemy.y - u.y, enemy.x - u.x) - Math.atan2(u.ty - u.y, u.tx - u.x));
    if (ahead > 0.3) { u.moving = false; u.tang = Math.atan2(enemy.y - u.y, enemy.x - u.x); }
  }
  if (engaged && !u.moving) want = Math.atan2(enemy.y - u.y, enemy.x - u.x);
  u.ang = turnToward(u.ang, want, dt * 2.4);
  u.cd -= dt;
  if (engaged && u.cd <= 0) {
    u.cd = RULES.reload * (0.85 + state.random() * 0.35);
    fireVolley(state, u, enemy, dist);
  }
}

function separate(state) {
  const live = state.units.filter((u) => !u.dead);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.side === b.side ? 18 : 26;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
  }
}

function checkRouts(state) {
  for (const u of state.units) {
    if (!u.routed && !u.dead && u.str < RULES.routAt) {
      u.routed = true;
      u.moving = false;
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

function stepVictory(state, dt) {
  const owners = state.villages.map((v) => v.owner);
  let allSide = owners.every((o) => o && o === owners[0]) ? owners[0] : null;
  if (allSide && state.villages.some((v) => v.contested)) allSide = null;
  if (allSide && state.hold.side === allSide) state.hold.time += dt;
  else state.hold = { side: allSide, time: 0 };
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

/** Green commander AI: march on a village, answer nearby threats, fall back when weak. */
function stepAI(state, dt) {
  state.aiClock -= dt;
  if (state.aiClock > 0) return;
  state.aiClock = 1.2;
  const blues = state.units.filter((u) => u.side === 'b' && isActive(u));
  for (const c of state.corps) {
    if (c.side !== 'g') continue;
    const live = corpsUnits(state, c.id);
    if (!live.length) continue;
    const at = centroid(live);
    const avg = live.reduce((s, u) => s + u.str, 0) / live.length;
    let target = null;
    let threat = null, td = Infinity;
    for (const b of blues) {
      const d = Math.hypot(b.x - at.x, b.y - at.y);
      if (d < td) { td = d; threat = b; }
    }
    const mine = state.villages.filter((v) => v.owner === 'g');
    // A corps already trading volleys stands and fires instead of creeping closer.
    const inContact = live.some((u) => nearestEnemy(state, u).dist < RULES.range);
    if (inContact && avg >= 0.35) continue;
    const help = avg >= 0.5 ? supportTarget(state, c, at) : null;
    if (avg < 0.35 && mine.length) {
      const v = nearestOf(mine, at);
      target = { x: v.x + 30, y: v.y };
    } else if (help) {
      target = help;
    } else if (threat && td < RULES.aiReact) {
      target = { x: threat.x, y: threat.y };
    } else {
      let goal = state.villages[c.goal];
      if (goal.owner === 'g') {
        const open = state.villages.filter((v) => v.owner !== 'g');
        if (open.length) { goal = nearestOf(open, at); c.goal = state.villages.indexOf(goal); }
      }
      target = { x: goal.x, y: goal.y };
    }
    const last = c.lastOrder;
    const newTarget = !last || Math.hypot(last.x - target.x, last.y - target.y) > 40;
    const stalled = !live.some((u) => u.moving) && Math.hypot(at.x - target.x, at.y - target.y) > 30;
    if (newTarget || stalled) {
      orderMarch(state, live, target.x, target.y);
      c.lastOrder = target;
    }
  }
}

/**
 * r2: where a free, healthy green corps is most needed. First a village blue holds or is
 * taking (counterattack), then a green corps in contact that is losing its fight (support).
 */
function supportTarget(state, c, at) {
  let best = null, bd = Infinity;
  for (const v of state.villages) {
    if (!(v.owner === 'b' || v.prog > 0.15)) continue;
    const d = Math.hypot(v.x - at.x, v.y - at.y);
    if (d < RULES.aiRetake && d < bd) { bd = d; best = v; }
  }
  if (best) {
    // Concentrate: storm a held village only with a second healthy corps close by; until then
    // form up just out of musket range on the green side and wait for it.
    const friends = state.corps.filter((k) => {
      if (k.side !== 'g' || k.id === c.id) return false;
      const live = corpsUnits(state, k.id);
      if (!live.length || live.reduce((s, u) => s + u.str, 0) / live.length < 0.5) return false;
      const kc = centroid(live);
      return Math.hypot(kc.x - best.x, kc.y - best.y) < RULES.aiMass;
    }).length;
    if (friends || state.hold.side === 'b' || (best.prog > 0.15 && best.owner !== 'b')) return { x: best.x, y: best.y };
    return { x: best.x + RULES.range * 1.6, y: best.y };
  }
  for (const k of state.corps) {
    if (k.side !== 'g' || k.id === c.id) continue;
    const live = corpsUnits(state, k.id);
    if (!live.length || k.underFire <= 0) continue;
    const avg = live.reduce((s, u) => s + u.str, 0) / live.length;
    if (avg > 0.75) continue;
    const kc = centroid(live);
    const d = Math.hypot(kc.x - at.x, kc.y - at.y);
    if (d < RULES.aiSupport && d < bd) { bd = d; best = { x: kc.x, y: kc.y }; }
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
  for (const c of state.corps) c.underFire = Math.max(0, c.underFire - dt);
  for (const u of state.units) stepUnit(state, u, dt);
  separate(state);
  checkRouts(state);
  stepVillages(state, dt);
  stepVictory(state, dt);
}
