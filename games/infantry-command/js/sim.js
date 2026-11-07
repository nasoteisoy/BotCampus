// Pure infantry sim: no rendering. Deterministic with seed.
export const DEFAULT_CFG = {
  half: 22, perSquad: 4, hp: 100, speed: 3.2, range: 10, aggro: 12, dmg: 14,
  cooldown: 0.9, unitR: 0.45, capRate: 0.18, holdToWin: 60,
};
const DEFAULT_OBST = [
  { x: -7, z: 0, r: 1.6 }, { x: 7, z: 0, r: 1.6 }, { x: 0, z: 9, r: 1.3 },
  { x: 0, z: -9, r: 1.3 }, { x: -12, z: -8, r: 1.4 }, { x: 12, z: 8, r: 1.4 },
];
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const SLOTS = [[0, 0], [1.3, 0.2], [-1.3, 0.2], [0, -1.3], [1.3, -1.3], [-1.3, -1.3]];

export function createSim(opt = {}) {
  const cfg = { ...DEFAULT_CFG, ...(opt.cfg || {}) };
  const s = {
    cfg, rand: rng(opt.seed ?? 7), time: 0, units: [], squads: [], result: null,
    obstacles: (opt.obstacles ?? DEFAULT_OBST).map((o) => ({ ...o })),
    point: { x: 0, z: 0, r: 4, owner: null, progress: 0, contested: false, hold: { player: 0, enemy: 0 } },
    casualties: { player: 0, enemy: 0 }, shotsFired: 0, events: [], noAI: !!opt.noAI, aiT: 0,
  };
  const names = ['Alpha', 'Bravo', 'Charlie'];
  for (const team of ['player', 'enemy']) {
    if (team === 'enemy' && opt.noEnemy) continue;
    const sz = team === 'player' ? 17 : -17;
    for (let i = 0; i < 3; i++) {
      const id = s.squads.length;
      const cx = (i - 1) * 8;
      s.squads.push({ id, team, name: team === 'player' ? names[i] : 'Hostile ' + (i + 1), order: { type: 'idle' } });
      for (let k = 0; k < cfg.perSquad; k++) {
        const [ox, oz] = SLOTS[k];
        const f = team === 'player' ? 1 : -1;
        s.units.push({ id: s.units.length, team, squad: id, slot: k, x: cx + ox, z: sz + oz * -f, vx: 0, vz: 0,
          hp: cfg.hp, maxHp: cfg.hp, alive: true, target: -1, cd: s.rand() * cfg.cooldown, state: 'idle',
          faceYaw: team === 'player' ? Math.PI : 0, passive: false, deadT: 0 });
      }
    }
  }
  return s;
}

export const squadUnits = (s, id) => s.units.filter((u) => u.squad === id && u.alive);
export const squadAlive = (s, id) => squadUnits(s, id).length;
export function squadCenter(s, id) {
  const us = squadUnits(s, id); if (!us.length) return null;
  let x = 0, z = 0; for (const u of us) { x += u.x; z += u.z; } return { x: x / us.length, z: z / us.length };
}
function clampPt(s, x, z) { const h = s.cfg.half - 1; return [Math.max(-h, Math.min(h, x)), Math.max(-h, Math.min(h, z))]; }
export function issueMove(s, id, x, z) { [x, z] = clampPt(s, x, z); s.squads[id].order = { type: 'move', x, z }; for (const u of squadUnits(s, id)) u.target = -1; }
export function issueAttackMove(s, id, x, z) { [x, z] = clampPt(s, x, z); s.squads[id].order = { type: 'amove', x, z }; }
export function issueAttack(s, id, targetSquad) { s.squads[id].order = { type: 'attack', squad: targetSquad }; }

export function hasLOS(s, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
  for (const o of s.obstacles) {
    let t = ((o.x - ax) * dx + (o.z - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - o.x, pz = az + dz * t - o.z;
    if (px * px + pz * pz < o.r * o.r * 0.81) return false;
  }
  return true;
}

function nearestEnemy(s, u, maxD, onlySquad = -1) {
  let best = null, bd = maxD;
  for (const e of s.units) {
    if (!e.alive || e.team === u.team) continue;
    if (onlySquad >= 0 && e.squad !== onlySquad) continue;
    const d = Math.hypot(e.x - u.x, e.z - u.z);
    if (d < bd && hasLOS(s, u.x, u.z, e.x, e.z)) { bd = d; best = e; }
  }
  return best;
}
function closestAny(s, u, squad) {
  let best = null, bd = Infinity;
  for (const e of s.units) { if (!e.alive || e.squad !== squad) continue; const d = Math.hypot(e.x - u.x, e.z - u.z); if (d < bd) { bd = d; best = e; } }
  return best;
}

function steer(s, u, gx, gz, dt) {
  const c = s.cfg; let dx = gx - u.x, dz = gz - u.z; const d = Math.hypot(dx, dz);
  let wx = 0, wz = 0;
  if (d > 0.15) { const sp = Math.min(1, d / 1.2); wx = (dx / d) * sp; wz = (dz / d) * sp; }
  // obstacle avoidance: lateral push when an obstacle sits ahead on the path
  for (const o of s.obstacles) {
    const ox = o.x - u.x, oz = o.z - u.z, od = Math.hypot(ox, oz), clear = o.r + c.unitR + 0.6;
    if (od > clear + 2.5 || d < 0.2) continue;
    const ahead = (ox * dx + oz * dz) / (d || 1);
    if (ahead > 0 && ahead < d + o.r) {
      const lat = (ox * -dz + oz * dx) / (d || 1); // signed lateral offset of obstacle
      if (Math.abs(lat) < clear) { const sgn = lat >= 0 ? -1 : 1; const k = (clear - Math.abs(lat)) / clear * 1.6; wx += (-dz / d) * sgn * k; wz += (dx / d) * sgn * k; }
    }
  }
  for (const o of s.units) { // separation
    if (o === u || !o.alive) continue; const sx = u.x - o.x, sz = u.z - o.z, sd = Math.hypot(sx, sz);
    if (sd < 1.0 && sd > 1e-4) { wx += (sx / sd) * (1 - sd) * 1.2; wz += (sz / sd) * (1 - sd) * 1.2; }
  }
  const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
  const a = 1 - Math.exp(-10 * dt);
  u.vx += (wx * c.speed - u.vx) * a; u.vz += (wz * c.speed - u.vz) * a;
  u.x += u.vx * dt; u.z += u.vz * dt;
  for (const o of s.obstacles) { // hard resolve
    const ox = u.x - o.x, oz = u.z - o.z, od = Math.hypot(ox, oz), m = o.r + c.unitR;
    if (od < m) { const n = od || 1e-4; u.x = o.x + (ox / n) * m; u.z = o.z + (oz / n) * m; }
  }
  [u.x, u.z] = clampPt(s, u.x, u.z);
  const sp = Math.hypot(u.vx, u.vz);
  if (sp > 0.6) u.faceYaw = Math.atan2(u.vx, u.vz);
  return sp;
}

function fire(s, u, e) {
  u.faceYaw = Math.atan2(e.x - u.x, e.z - u.z); u.state = 'shoot'; u.target = e.id;
  if (u.cd > 0) return;
  u.cd = s.cfg.cooldown * (0.85 + s.rand() * 0.3); s.shotsFired++;
  const d = Math.hypot(e.x - u.x, e.z - u.z), hit = s.rand() < 0.85 - d * 0.02;
  s.events.push({ type: 'shot', from: u.id, to: e.id, hit });
  if (hit) { e.hp -= s.cfg.dmg; if (e.hp <= 0 && e.alive) { e.alive = false; e.hp = 0; e.state = 'dead'; s.casualties[e.team]++; s.events.push({ type: 'death', id: e.id }); } }
}

function runAI(s, dt) {
  s.aiT -= dt; if (s.aiT > 0) return; s.aiT = 1.0;
  const p = s.point;
  for (const q of s.squads) {
    if (q.team !== 'enemy' || !squadAlive(s, q.id)) continue;
    const c = squadCenter(s, q.id);
    if (p.owner !== 'enemy' || p.contested || Math.hypot(c.x - p.x, c.z - p.z) > p.r + 2) {
      const ox = (q.id % 3 - 1) * 2.2;
      if (q.order.type !== 'amove' || Math.hypot(q.order.x - p.x - ox, q.order.z - p.z) > 0.5) issueAttackMove(s, q.id, p.x + ox, p.z - 1);
    }
  }
}

export function step(s, dt) {
  if (s.result) return;
  s.time += dt; s.events.length = 0; const c = s.cfg;
  if (!s.noAI) runAI(s, dt);
  for (const u of s.units) {
    if (!u.alive) { u.deadT += dt; continue; }
    u.cd -= dt;
    const q = s.squads[u.squad], o = q.order;
    if (u.passive) { u.state = 'idle'; continue; }
    const [sx, sz] = SLOTS[u.slot];
    if (o.type === 'move') {
      const sp = steer(s, u, o.x + sx, o.z + sz, dt); u.state = sp > 0.4 ? 'run' : 'idle';
      continue;
    }
    if (o.type === 'attack') {
      if (!squadAlive(s, o.squad)) { q.order = { type: 'idle' }; continue; }
      const e = nearestEnemy(s, u, c.range, o.squad);
      if (e) { u.vx *= 0.5; u.vz *= 0.5; fire(s, u, e); continue; }
      const t = closestAny(s, u, o.squad); const sp = steer(s, u, t.x, t.z, dt); u.state = sp > 0.4 ? 'run' : 'idle'; continue;
    }
    const e = nearestEnemy(s, u, o.type === 'amove' ? c.aggro : c.range);
    if (e) {
      if (Math.hypot(e.x - u.x, e.z - u.z) <= c.range) { u.vx *= 0.5; u.vz *= 0.5; fire(s, u, e); }
      else { steer(s, u, e.x, e.z, dt); u.state = 'run'; }
      continue;
    }
    u.target = -1;
    if (o.type === 'amove') { const sp = steer(s, u, o.x + sx, o.z + sz, dt); u.state = sp > 0.4 ? 'run' : 'idle'; }
    else { u.vx = u.vz = 0; u.state = 'idle'; }
  }
  // clear finished move orders
  for (const q of s.squads) {
    if (q.order.type !== 'move' && q.order.type !== 'amove') continue;
    const us = squadUnits(s, q.id);
    if (us.every((u) => Math.hypot(u.x - q.order.x - SLOTS[u.slot][0], u.z - q.order.z - SLOTS[u.slot][1]) < 0.6)) q.order = { type: 'idle' };
  }
  // capture point
  const p = s.point; let np = 0, ne = 0;
  for (const u of s.units) if (u.alive && Math.hypot(u.x - p.x, u.z - p.z) <= p.r) u.team === 'player' ? np++ : ne++;
  p.contested = np > 0 && ne > 0; p.counts = { player: np, enemy: ne };
  if (!p.contested && (np || ne)) {
    const dir = np ? 1 : -1;
    p.progress = Math.max(-1, Math.min(1, p.progress + dir * c.capRate * dt));
    if (p.progress >= 1) p.owner = 'player'; else if (p.progress <= -1) p.owner = 'enemy';
    else if ((p.owner === 'player' && p.progress < 0) || (p.owner === 'enemy' && p.progress > 0)) p.owner = null;
  }
  if (p.owner && !p.contested) p.hold[p.owner] += dt;
  // result
  const alive = (t) => s.units.some((u) => u.alive && u.team === t);
  if (!s.units.some((u) => u.team === 'enemy')) return;
  if (!alive('enemy')) s.result = 'victory';
  else if (!alive('player')) s.result = 'defeat';
  else if (p.hold.player >= c.holdToWin) s.result = 'victory';
  else if (p.hold.enemy >= c.holdToWin) s.result = 'defeat';
}
export function issueStop(s, id) { s.squads[id].order = { type: 'idle' }; for (const u of squadUnits(s, id)) { u.vx = u.vz = 0; u.target = -1; } }
