// Squad FSM battle simulation (pure logic, no DOM). World in metres.
import { LVL_MULT, WEAPONS, STATES, CONDS, ROLES, ENEMIES, enemyFSM } from './data.js';
export const MW = 120, MH = 80, CELL = 2, GW = MW / CELL, GH = MH / CELL;
const THINK = 0.2;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segRect(x1, y1, x2, y2, r, pad = 0) { // r=[x,y,w,h]; does segment cross rect
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - (r[0] - pad), r[0] + r[2] + pad - x1, y1 - (r[1] - pad), r[1] + r[3] + pad - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
const inRect = (x, y, r, pad = 0) => x > r[0] - pad && x < r[0] + r[2] + pad && y > r[1] - pad && y < r[1] + r[3] + pad;

export function fsmFor(game, u) { // squad FSM or role override
  const f = game.fsm; if (!u.player) return u.fsm;
  return (f.roles && f.roles[u.role]) || f;
}

export class Battle {
  constructor(mission, fsm, rng = Math.random) {
    this.m = mission; this.fsm = fsm; this.rand = rng;
    this.t = 0; this.units = []; this.fx = []; this.log = []; this.over = null; this.thinkAcc = 0; this.uid = 0;
    this.walls = mission.walls; this.blocks = mission.blocks;
    this.grid = new Uint8Array(GW * GH);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const x = gx * CELL + 1, y = gy * CELL + 1;
      if ([...this.walls, ...this.blocks].some(r => inRect(x, y, r, 0.9))) this.grid[gy * GW + gx] = 1;
    }
    this.coverPts = [];
    for (const w of this.walls) {
      const horiz = w[2] >= w[3];
      const len = horiz ? w[2] : w[3];
      for (let s = 1; s < len; s += 2.5) for (const side of [-1, 1]) {
        const p = horiz ? { x: w[0] + s, y: side < 0 ? w[1] - 1.3 : w[1] + w[3] + 1.3 } : { x: side < 0 ? w[0] - 1.3 : w[0] + w[2] + 1.3, y: w[1] + s };
        p.wall = w; p.nx = horiz ? 0 : side; p.ny = horiz ? side : 0; // normal pointing away from wall
        if (!this.blocks.some(b => inRect(p.x, p.y, b, 0.5))) this.coverPts.push(p);
      }
    }
    mission.squad.forEach((role, i) => {
      const R = ROLES[role];
      this.add({ player: true, role, kind: role, ...R, x: mission.start[0] - (i % 2) * 3, y: mission.start[1] + (i - (mission.squad.length - 1) / 2) * 3, name: R.name + ' ' + (mission.squad.slice(0, i + 1).filter(r => r === role).length) });
    });
    mission.enemies.forEach(e => this.spawnEnemy(e));
    this.home = { x: mission.start[0], y: mission.start[1] };
    if (mission.vip) { this.vip = this.add({ player: true, vipUnit: true, role: 'rifleman', kind: 'vip', ...ROLES.rifleman, icon: '🆘', name: 'Wounded', x: mission.vip[0], y: mission.vip[1] }); this.vip.hp = 0; this.vip.down = 1; this.vip.bleed = 999; }
    this.waveI = 0; this.zoneT = 0;
    this.knownE = null; this.knownP = null; // squad memory of enemy position
    for (const u of this.units) this.enter(u, fsmFor(this, u).start, null, true);
  }
  spawnEnemy([kind, x, y, path]) {
    const E = ENEMIES[kind];
    const u = this.add({ player: false, kind, role: kind, ...E, x, y, path: path ? path.map(([a, b]) => ({ x: a, y: b })) : null, name: E.name });
    u.fsm = enemyFSM(kind); this.enter(u, u.fsm.start, null, true); return u;
  }
  add(o) {
    const u = { id: ++this.uid, hpMax: o.hp, ammo: o.mag, reload: 0, cd: this.rand() * 0.5, down: 0, dead: false, wp: 0, state: null, stT: 0,
      underT: -99, seen: [], seenT: -99, everSeen: false, lastHit: null, goal: null, path: null, pathT: -9, gren: 2, grenCd: 0, inCover: false, firedT: -99, sup: 0, healT: 0, ...o };
    u.wpPath = o.player ? this.m.path.map(([a, b]) => ({ x: a, y: b })) : (o.path || null);
    this.units.push(u); return u;
  }
  alive(u) { return !u.dead && !u.down; }
  squad(u) { return this.units.filter(o => o.player === u.player && !o.dead && !o.vipUnit); }
  foes(u) { return this.units.filter(o => o.player !== u.player && this.alive(o) && !(o.vipUnit)); }
  los(a, b) { return !this.blocks.some(r => segRect(a.x, a.y, b.x, b.y, r)); }
  coverBetween(sh, tg) { return this.walls.some(w => segRect(sh.x, sh.y, tg.x, tg.y, w, 0.3) && (Math.abs(tg.x - Math.max(w[0], Math.min(tg.x, w[0] + w[2]))) + Math.abs(tg.y - Math.max(w[1], Math.min(tg.y, w[1] + w[3])))) < 3); }

  enter(u, sid, why, silent) {
    const fsm = fsmFor(this, u);
    if (!fsm.states.find(s => s.id === sid)) sid = fsm.start;
    const prev = u.state; u.state = sid; u.stT = 0; u.goal = null; u.path = null; u.coverPt = null; u.healTarget = null; u.thrown = false;
    if (!silent && u.player) {
      const a = fsm.states.find(s => s.id === prev), b = fsm.states.find(s => s.id === sid);
      this.log.push({ t: this.t, who: u.name, role: u.role, from: a ? a.type : '?', to: b.type, why });
      if (this.log.length > 300) this.log.shift();
      this.lastFire = { tid: why && why.tid, t: this.t };
    }
  }
  stateOf(u) { const f = fsmFor(this, u); return f.states.find(s => s.id === u.state) || f.states.find(s => s.id === f.start); }

  cond(u, tr) {
    const c = tr.cond, v = tr.v; let r = false;
    const sq = this.squad(u);
    switch (c) {
      case 'seen': r = u.seen.length > 0; break;
      case 'fire': r = this.t - u.underT < 2; break;
      case 'hp': r = u.hp / u.hpMax * 100 < v; break;
      case 'ammo': r = u.ammo < v; break;
      case 'buddy': r = sq.some(o => o !== u && o.down) || (u.player && this.vip && this.vip.down && dist(u, this.vip) < 40); break;
      case 'squad': { const all = this.units.filter(o => o.player === u.player && !o.vipUnit).length; r = sq.filter(o => !o.down).length / all * 100 < v; break; }
      case 'count': r = u.seen.length > v; break;
      case 'cover': r = this.coverPts.some(p => dist(p, u) < 6); break;
      case 'timer': r = u.stT > v; break;
      case 'lost': r = u.seen.length === 0 && u.everSeen && this.t - u.seenT > 1.5; break;
    }
    return tr.neg ? !r : r;
  }
  think(u) {
    const fsm = fsmFor(this, u);
    const ok = t => t.to !== u.state;
    const list = [...fsm.trans.filter(t => t.from === 'any' && ok(t)), ...fsm.trans.filter(t => t.from === u.state && ok(t))];
    // priority = order in the list for that from-state ('any' rules after own rules unless placed by index)
    for (const tr of list) if (this.cond(u, tr)) { this.enter(u, tr.to, { cond: tr.cond, v: tr.v, neg: tr.neg, tid: tr.id }); return; }
  }

  step(dt) {
    if (this.over) return;
    this.t += dt;
    const m = this.m;
    if (m.waves && this.waveI < m.waves.length && this.t >= m.waves[this.waveI][0]) { for (const e of m.waves[this.waveI][1]) this.spawnEnemy(e); this.waveI++; }
    // vision
    for (const u of this.units) {
      if (!this.alive(u) || u.vipUnit) { u.seen = []; continue; }
      const vis = u.vis || 46;
      u.seen = this.foes(u).filter(o => { const d = dist(u, o); if (d > vis) return false; if (o.hidden && d > o.hidden && this.t - o.firedT > 1.5) return false; return this.los(u, o); });
      if (u.seen.length) { u.seenT = this.t; u.everSeen = true; const k = u.player ? 'knownE' : 'knownP'; this[k] = { x: u.seen[0].x, y: u.seen[0].y, t: this.t }; }
    }
    this.thinkAcc += dt;
    const doThink = this.thinkAcc >= THINK; if (doThink) this.thinkAcc -= THINK;
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.down) { if (!u.vipUnit) { u.bleed -= dt; if (u.bleed <= 0) { u.dead = true; u.down = 0; if (u.player) this.log.push({ t: this.t, who: u.name, role: u.role, from: 'dead' }); } } continue; }
      u.stT += dt; u.cd -= dt; u.grenCd -= dt; u.sup = Math.max(0, u.sup - dt);
      if (u.reload > 0) { u.reload -= dt; if (u.reload <= 0) u.ammo = u.mag; }
      if (doThink) this.think(u);
      this.act(u, dt);
    }
    // fx
    for (const f of this.fx) f.t -= dt;
    this.fx = this.fx.filter(f => f.t > 0);
    for (const g of this.nades || []) { g.t -= dt; if (g.t <= 0) this.boom(g); }
    if (this.nades) this.nades = this.nades.filter(g => g.t > 0);
    this.checkEnd();
  }
  boom(g) {
    this.fx.push({ k: 'boom', x: g.x, y: g.y, t: 0.6, r: 5 });
    for (const o of this.units) if (o.player !== g.player && this.alive(o) && !o.vipUnit) {
      const d = Math.hypot(o.x - g.x, o.y - g.y); if (d < 5.5) { this.hurt(o, 70 * (1 - d / 8) * LVL_MULT[WEAPONS.grenade.vs[o.armor]], g.by); o.sup = 3; o.underT = this.t; }
    }
  }
  hurt(o, dmg, by) {
    o.hp -= dmg; o.underT = this.t; o.lastHit = by ? { x: by.x, y: by.y } : null;
    if (by) { const k = o.player ? 'knownE' : 'knownP'; this[k] = { x: by.x, y: by.y, t: this.t }; }
    if (o.hp <= 0) { o.hp = 0; if (o.player) { o.down = 1; o.bleed = 25; this.log.push({ t: this.t, who: o.name, role: o.role, from: 'down' }); } else { o.dead = true; } }
  }
  pickTarget(u, mode) {
    let c = u.seen; if (!c.length) return null;
    if (mode === 'weakest') return c.reduce((a, b) => a.hp < b.hp ? a : b);
    if (mode === 'threat') return c.reduce((a, b) => (b.dmg / b.rof) > (a.dmg / a.rof) ? b : a);
    return c.reduce((a, b) => dist(u, a) < dist(u, b) ? a : b);
  }
  shoot(u, tg, aimed) {
    if (u.reload > 0 || u.cd > 0 || !tg) return false;
    const d = dist(u, tg); const rng = u.rng * (aimed ? 1.25 : 1); if (d > rng) return false;
    if (u.ammo <= 0) { u.reload = 2; return false; }
    u.ammo--; if (u.ammo <= 0) u.reload = 2;
    u.cd = u.rof * (aimed ? 1.8 : 1) * (0.85 + this.rand() * 0.3); u.firedT = this.t;
    let p = u.acc * (aimed ? 1.45 : 1) * (1 - 0.5 * d / rng);
    if (this.coverBetween(u, tg)) p *= 0.3;
    if (u.sup > 0) p *= 0.45;
    if (u.player && this.units.some(o => o.leader && o.player && this.alive(o) && o !== u)) p *= 1.12;
    tg.underT = this.t; const k = tg.player ? 'knownE' : 'knownP'; this[k] = { x: u.x, y: u.y, t: this.t };
    if (u.suppress) tg.sup = 1.5;
    const hit = this.rand() < p;
    this.fx.push({ k: 'shot', x: u.x, y: u.y, x2: tg.x + (hit ? 0 : (this.rand() - 0.5) * 4), y2: tg.y + (hit ? 0 : (this.rand() - 0.5) * 4), t: 0.12, p: u.player });
    if (hit) this.hurt(tg, u.dmg * LVL_MULT[WEAPONS[u.wpn].vs[tg.armor]], u);
    return true;
  }
  moveTo(u, gx, gy, speed, dt) {
    const g = { x: gx, y: gy }; if (dist(u, g) < 0.6) return true;
    if (!u.path || !u.pgoal || dist(u.pgoal, g) > 1.5 || this.t - u.pathT > 2) { u.path = this.astar(u, g); u.pgoal = g; u.pathT = this.t; }
    let nx = u.path && u.path.length ? u.path[0] : g;
    if (u.path && u.path.length && dist(u, nx) < 0.8) { u.path.shift(); nx = u.path.length ? u.path[0] : g; }
    const d = dist(u, nx) || 1; const s = Math.min(d, speed * dt);
    u.x += (nx.x - u.x) / d * s; u.y += (nx.y - u.y) / d * s; u.face = Math.atan2(nx.y - u.y, nx.x - u.x);
    // separation
    for (const o of this.units) if (o !== u && !o.dead && o.player === u.player) { const dd = dist(u, o); if (dd < 2.8 && dd > 0.01) { const k = (2.8 - dd) * dt * 2; u.x += (u.x - o.x) / dd * k; u.y += (u.y - o.y) / dd * k; } }
    u.x = Math.max(1, Math.min(MW - 1, u.x)); u.y = Math.max(1, Math.min(MH - 1, u.y));
    return false;
  }
  astar(a, b) {
    const c = p => [Math.max(0, Math.min(GW - 1, Math.floor(p.x / CELL))), Math.max(0, Math.min(GH - 1, Math.floor(p.y / CELL)))];
    const [sx, sy] = c(a), [ex, ey] = c(b); const S = sy * GW + sx, E = ey * GW + ex;
    const gS = new Float32Array(GW * GH).fill(1e9), from = new Int32Array(GW * GH).fill(-1), closed = new Uint8Array(GW * GH);
    gS[S] = 0; const open = [S]; const h = i => Math.hypot(i % GW - ex, ((i / GW) | 0) - ey);
    let n = 0;
    while (open.length && n++ < 4000) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (gS[open[i]] + h(open[i]) < gS[open[bi]] + h(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0]; if (cur === E) break; if (closed[cur]) continue; closed[cur] = 1;
      const cx = cur % GW, cy = (cur / GW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        const ni = y * GW + x; if (this.grid[ni] && ni !== E) continue;
        if (dx && dy && (this.grid[cy * GW + x] || this.grid[y * GW + cx])) continue;
        const ng = gS[cur] + (dx && dy ? 1.414 : 1); if (ng < gS[ni]) { gS[ni] = ng; from[ni] = cur; open.push(ni); }
      }
    }
    if (from[E] < 0) return [];
    const out = []; let i = E; while (i !== S && i >= 0) { out.unshift({ x: (i % GW) * CELL + 1, y: ((i / GW) | 0) * CELL + 1 }); i = from[i]; }
    if (out.length) out[out.length - 1] = { x: b.x, y: b.y };
    return out;
  }
  act(u, dt) {
    const st = this.stateOf(u); const P = st.params || {}; const def = STATES[st.type].params;
    const par = k => P[k] || def[k][0];
    const sq = this.squad(u).filter(o => this.alive(o));
    const known = u.player ? this.knownE : this.knownP;
    const sp = u.speed * (u.sup > 0 ? 0.7 : 1);
    u.inCover = false;
    switch (st.type) {
      case 'patrol': {
        const run = par('pace') === 'run';
        const wps = u.wpPath; if (!wps || !wps.length) break;
        if (u.wp >= wps.length) { break; }
        const idx = u.player ? sq.filter(o => !o.vipUnit).indexOf(u) : 0;
        const w = wps[u.wp]; const off = u.player ? { x: -(idx % 2) * 2.5, y: (idx - 1.5) * 2.4 } : { x: 0, y: 0 };
        if (this.moveTo(u, w.x + off.x, w.y + off.y, sp * (run ? 1.5 : 1), dt) || dist(u, w) < 3.5) u.wp++;
        break;
      }
      case 'alert': {
        if (known) { if (dist(u, known) > 6) this.moveTo(u, known.x, known.y, sp * (par('pace') === 'fast' ? 1.4 : 0.6), dt); }
        break;
      }
      case 'attack': {
        const aimed = par('fire') === 'aimed';
        const tg = this.pickTarget(u, par('target'));
        if (tg) { u.face = Math.atan2(tg.y - u.y, tg.x - u.x); const inR = dist(u, tg) <= u.rng * (aimed ? 1.25 : 1) * 0.8;
          if (par('move') === 'advance' && !inR) this.moveTo(u, tg.x, tg.y, sp, dt); else if (!inR && u.player) this.moveTo(u, tg.x, tg.y, sp * 0.6, dt);
          this.shoot(u, tg, aimed); }
        else if (known && par('move') === 'advance') this.moveTo(u, known.x, known.y, sp, dt);
        break;
      }
      case 'cover': {
        const thr = known || u.lastHit;
        if (!u.coverPt) {
          let best = null, bd = 1e9;
          for (const p of this.coverPts) {
            if (this.units.some(o => o !== u && o.coverPt === p && !o.dead)) continue;
            let d = dist(u, p); if (d > 26) continue;
            if (thr) { const facing = (thr.x - p.x) * p.nx + (thr.y - p.y) * p.ny; if (facing > 0) d += 30; }
            if (d < bd) { bd = d; best = p; }
          }
          u.coverPt = best || { x: u.x, y: u.y, none: true };
        }
        const at = this.moveTo(u, u.coverPt.x, u.coverPt.y, sp * 1.4, dt);
        if (at && !u.coverPt.none) u.inCover = true;
        if (par('fire') === 'shoot back' && at) { const tg = this.pickTarget(u, 'nearest'); if (tg) this.shoot(u, tg, false); }
        else if (u.ammo < u.mag && u.reload <= 0 && at) u.reload = 2;
        break;
      }
      case 'retreat': {
        const to = par('to') === 'start' ? (u.player ? this.home : (u.home || (u.home = { x: u.x + 15, y: u.y }))) : this.centre(sq);
        this.moveTo(u, to.x, to.y, sp * 1.5, dt);
        break;
      }
      case 'heal': {
        const pool = this.units.filter(o => o.player === u.player && o !== u && !o.dead && (o.down || o.hp < o.hpMax * 0.8));
        if (!pool.length) break;
        let tg;
        if (par('who') === 'downed') tg = pool.filter(o => o.down).sort((a, b) => dist(u, a) - dist(u, b))[0];
        if (!tg) tg = pool.reduce((a, b) => (a.down ? -1 : a.hp) < (b.down ? -1 : b.hp) ? a : b);
        u.healTarget = tg;
        if (dist(u, tg) > 1.6) { this.moveTo(u, tg.x, tg.y, sp * 1.3, dt); u.healT = 0; break; }
        const rate = u.healer ? 1 : 0.45;
        if (tg.down) { u.healT += dt * rate; if (u.healT >= 2.5) { tg.down = 0; tg.hp = tg.hpMax * 0.4; tg.bleed = 0; u.healT = 0; this.fx.push({ k: 'heal', x: tg.x, y: tg.y, t: 0.8 });
          this.log.push({ t: this.t, who: tg.name, role: tg.role, from: 'up', by: u.name }); if (tg.vipUnit) { tg.rescued = true; tg.wpPath = null; tg.fsm = null; } } }
        else { tg.hp = Math.min(tg.hpMax, tg.hp + 14 * rate * dt); if (this.rand() < dt * 2) this.fx.push({ k: 'heal', x: tg.x, y: tg.y, t: 0.5 }); }
        break;
      }
      case 'regroup': {
        const ld = par('on') === 'leader' ? sq.find(o => o.leader) : null; const c = ld && ld !== u ? ld : this.centre(sq);
        if (dist(u, c) > 3.5) this.moveTo(u, c.x, c.y, sp * 1.3, dt);
        break;
      }
      case 'grenade': {
        const tgt = u.seen.length ? this.centre(u.seen) : (known && this.t - known.t < 8 ? known : null);
        if (!tgt) break;
        u.face = Math.atan2(tgt.y - u.y, tgt.x - u.x);
        if (par('mode') === 'grenade') {
          const d = dist(u, tgt);
          if (d > 26) { this.moveTo(u, tgt.x, tgt.y, sp, dt); break; }
          if (u.gren > 0 && u.grenCd <= 0) { u.gren--; u.grenCd = 3; (this.nades || (this.nades = [])).push({ x: tgt.x + (this.rand() - 0.5) * 3, y: tgt.y + (this.rand() - 0.5) * 3, sx: u.x, sy: u.y, t: 1, T: 1, player: u.player, by: u }); }
        } else {
          // suppress: spray at area: enemies near it lose accuracy, sometimes hit
          if (u.reload <= 0 && u.cd <= 0 && u.ammo > 0) {
            u.ammo--; if (u.ammo <= 0) u.reload = 2; u.cd = u.rof * 0.6;
            this.fx.push({ k: 'shot', x: u.x, y: u.y, x2: tgt.x + (this.rand() - 0.5) * 6, y2: tgt.y + (this.rand() - 0.5) * 6, t: 0.1, p: u.player });
            for (const o of this.foes(u)) if (dist(o, tgt) < 8) { o.sup = 2.5; o.underT = this.t; if (this.rand() < 0.08) this.hurt(o, u.dmg * 0.6 * LVL_MULT[WEAPONS[u.wpn].vs[o.armor]], u); }
          }
        }
        break;
      }
    }
  }
  centre(arr) { if (!arr.length) return { x: 0, y: 0 }; let x = 0, y = 0; for (const o of arr) { x += o.x; y += o.y; } return { x: x / arr.length, y: y / arr.length }; }
  checkEnd() {
    const m = this.m; const mine = this.units.filter(u => u.player && !u.vipUnit);
    const up = mine.filter(u => this.alive(u));
    const foes = this.units.filter(u => !u.player && !u.dead);
    const pending = m.waves && this.waveI < m.waves.length;
    if (!up.length && !mine.some(u => u.down && this.units.some(o => o.player && this.alive(o)))) return this.end(false, 'wiped');
    if (m.goal === 'hold') {
      const inZ = up.filter(u => Math.hypot(u.x - m.zone[0], u.y - m.zone[1]) < m.zone[2]).length;
      if (inZ) this.zoneT += 0; if (this.t >= m.time) return this.end(inZ > 0, inZ ? 'held' : 'zone lost');
      return;
    }
    if (this.t >= m.time) return this.end(false, 'time');
    if (m.goal === 'clear' && !foes.length && !pending) return this.end(true, 'cleared');
    if (m.goal === 'reach' && up.some(u => Math.hypot(u.x - m.zone[0], u.y - m.zone[1]) < m.zone[2])) return this.end(true, 'reached');
    if (m.goal === 'rescue') { if (this.vip.dead) return this.end(false, 'vip lost'); if (this.vip.rescued && !foes.length) return this.end(true, 'rescued'); }
  }
  end(win, why) {
    const mine = this.units.filter(u => u.player && !u.vipUnit);
    const lost = mine.filter(u => u.dead || u.down).length;
    const stars = win ? 1 + (lost === 0 ? 1 : 0) + (this.t <= this.m.par + 0.01 ? 1 : 0) : 0;
    this.over = { win, why, stars, lost, alive: mine.length - lost, t: this.t };
  }
}
