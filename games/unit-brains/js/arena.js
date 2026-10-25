// Live arena: tiny top-down Conquest sim. Each unit runs its unit brain; each team's squad brain sets goal + formation.
(function (root) {
  'use strict';
  const B = root.Brain;
  const W = 100, H = 60, DT = 1 / 30;
  const SPEED = 8, SIGHT = 26, RANGE = 20, CP_R = 6, MAX_AMMO = 24, MAX_HP = 100;
  const SPACE = { 1: 2.5, 2: 4, 3: 6 };

  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mirrorRect = (r) => ({ x: W - r.x - r.w, y: H - r.y - r.h, w: r.w, h: r.h });
  const mirrorPt = (p) => ({ x: W - p.x, y: H - p.y });

  const HALF_BLOCKS = [{ x: 42, y: 19.5, w: 7, h: 2.5 }, { x: 24, y: 9, w: 3, h: 7 }, { x: 24, y: 43, w: 3, h: 7 }, { x: 33, y: 27, w: 3, h: 6 }];
  const BLOCKS = [...HALF_BLOCKS, ...HALF_BLOCKS.map(mirrorRect)];
  const PACKS = [{ x: 50, y: 30 }, { x: 32, y: 52 }, mirrorPt({ x: 32, y: 52 })];
  const CRATES = [{ x: 12, y: 16 }, mirrorPt({ x: 12, y: 16 })];
  const BASES = { 1: { x: 4, y: 30 }, 2: { x: 96, y: 30 } };

  // segment vs rect (slab test)
  function segHitsRect(ax, ay, bx, by, r, pad = 0) {
    let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
    const p = [-dx, dx, -dy, dy], q = [ax - (r.x - pad), r.x + r.w + pad - ax, ay - (r.y - pad), r.y + r.h + pad - ay];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  const losClear = (a, b) => !BLOCKS.some((r) => segHitsRect(a.x, a.y, b.x, b.y, r));

  // cover spots: just outside the middle of each side of each block
  const COVER = [];
  BLOCKS.forEach((r, bi) => {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, g = 1.3;
    COVER.push({ x: r.x - g, y: cy, nx: -1, ny: 0, b: bi }, { x: r.x + r.w + g, y: cy, nx: 1, ny: 0, b: bi }, { x: cx, y: r.y - g, nx: 0, ny: -1, b: bi }, { x: cx, y: r.y + r.h + g, nx: 0, ny: 1, b: bi });
  });

  class Sim {
    constructor(opts = {}) { this.opts = opts; this.reset(opts); }
    reset(opts = this.opts) {
      this.opts = opts;
      this.rand = rng(opts.seed || 1234);
      this.t = 0; this.tracers = []; this.mines = [];
      this.cps = [
        { id: 'A', x: 18, y: 30, owner: 1, prog: 1, lostAt: {} },
        { id: 'B', x: 50, y: 13, owner: 0, prog: 0, lostAt: {} },
        { id: 'C', x: 50, y: 47, owner: 0, prog: 0, lostAt: {} },
        { id: 'D', x: 82, y: 30, owner: 2, prog: -1, lostAt: {} },
      ];
      this.packs = PACKS.map((p) => ({ ...p, cd: 0 }));
      this.crates = CRATES.map((p) => ({ ...p }));
      this.minHold = typeof opts.minHold === 'number' ? opts.minHold : B.MIN_HOLD;
      this.brains = { 1: opts.blueBrain || B.newBrain(), 2: opts.redBrain || B.enemyBrain() };
      this.squads = { 1: opts.blueSquad || B.defaultSquad(), 2: opts.redSquad || B.defaultSquad() };
      this.goal = { 1: null, 2: null }; this.goalT = 0;
      this.units = [];
      const n = opts.perTeam || 5;
      for (const team of [1, 2]) {
        if (team === 2 && opts.redOff) continue;
        for (let i = 0; i < n; i++) this.units.push(this.spawnUnit(team, i));
      }
      this.updateGoals();
    }
    spawnUnit(team, i, old) {
      const b = BASES[team], u = old || { id: (team === 1 ? 'b' : 'r') + i, team, idx: i };
      Object.assign(u, { x: b.x + (team === 1 ? 1 : -1) * (i % 2) * 2, y: b.y + (i - 2) * 3, hp: MAX_HP, ammo: MAX_AMMO, alive: true, dead: 0, row: -1, act: null, mem: B.newMem(), think: (i * 0.05) % 0.25, fire: 0, cov: null, inCover: false, mines: 2, hx: team === 1 ? 1 : -1, hy: 0, mx: null, my: null, heal: false });
      return u;
    }
    setBrains(team, brain, squad) { if (brain) this.brains[team] = brain; if (squad) this.squads[team] = squad; this.goalT = 0; this.updateGoals(); this.units.forEach((u) => { if (u.team === team && u.alive) { u.think = 0.25; u.mem = B.newMem(); this.think(u); } }); }
    teamUnits(team) { return this.units.filter((u) => u.team === team); }
    leader(team) { return this.units.find((u) => u.team === team && u.alive) || null; }
    centroid(team) {
      const a = this.units.filter((u) => u.team === team && u.alive); if (!a.length) return BASES[team];
      return { x: a.reduce((s, u) => s + u.x, 0) / a.length, y: a.reduce((s, u) => s + u.y, 0) / a.length };
    }
    // ---- squad brain: pick a goal point
    pickGoal(team) {
      const sq = this.squads[team], c = this.leader(team) || this.centroid(team), foe = 3 - team;
      const notOurs = this.cps.filter((p) => p.owner !== team), ours = this.cps.filter((p) => p.owner === team);
      const near = (list, from) => list.slice().sort((a, b) => dist(a, from) - dist(b, from))[0] || null;
      let g = null;
      if (sq.plan === 'capture') g = near(notOurs, c) || near(ours, c);
      else if (sq.plan === 'hold') g = near(ours, c) || near(notOurs, c);
      else if (sq.plan === 'retake') {
        const lost = notOurs.filter((p) => p.lostAt[team] !== undefined).sort((a, b) => b.lostAt[team] - a.lostAt[team])[0];
        g = lost || near(ours, c) || near(notOurs, c);
      } else if (sq.plan === 'push') g = near(notOurs, BASES[foe]) || near(ours, BASES[foe]);
      return g;
    }
    updateGoals() { for (const t of [1, 2]) this.goal[t] = this.pickGoal(t); }
    // ---- formation slot for unit u (k-th follower)
    slot(u) {
      const team = u.team, sq = this.squads[team], L = this.leader(team), g = this.goal[team] || BASES[team];
      const alive = this.units.filter((v) => v.team === team && v.alive), k = alive.indexOf(u);
      const s = SPACE[sq.spacing] || 4;
      const anchor = sq.follow && L ? L : g;
      let fx = g.x - (sq.follow && L ? L.x : BASES[team].x), fy = g.y - (sq.follow && L ? L.y : BASES[team].y);
      let fl = Math.hypot(fx, fy);
      if (fl < 2) { fx = g.x - BASES[team].x; fy = g.y - BASES[team].y; fl = Math.hypot(fx, fy) || 1; }
      fx /= fl; fy /= fl;
      const px = -fy, py = fx; // side vector
      if (sq.follow && L && u === L) return { x: g.x, y: g.y };
      const j = sq.follow ? k : k + 1; // followers start at 1; with no leader-follow everyone gets a slot around the goal
      let side = 0, back = 0;
      if (sq.formation === 'line') { side = (j % 2 ? 1 : -1) * Math.ceil(j / 2) * s; back = 0; }
      else if (sq.formation === 'wedge') { side = (j % 2 ? 1 : -1) * Math.ceil(j / 2) * s * 0.8; back = Math.ceil(j / 2) * s * 0.9; }
      else { const a = j * 2.4; side = Math.cos(a) * s * 0.9; back = Math.sin(a) * s * 0.9; }
      if (!sq.follow) back *= 0.5;
      return { x: anchor.x + px * side - fx * back, y: anchor.y + py * side - fy * back };
    }
    enemiesOf(u) { return this.units.filter((v) => v.alive && v.team !== u.team); }
    nearestVisibleEnemy(u, R) {
      let best = null, bd = R;
      for (const v of this.enemiesOf(u)) { const d = dist(u, v); if (d < bd && losClear(u, v)) { bd = d; best = v; } }
      return best;
    }
    hurtAlly(u) {
      let best = null, bd = 22;
      for (const v of this.units) if (v.alive && v.team === u.team && v !== u && v.hp < 50) { const d = dist(u, v); if (d < bd) { bd = d; best = v; } }
      return best;
    }
    nearestCP(u) { return this.cps.slice().sort((a, b) => dist(a, u) - dist(b, u))[0]; }
    findCover(u, th) {
      let best = null, bs = Infinity;
      for (const sp of COVER) {
        const d = Math.hypot(sp.x - u.x, sp.y - u.y); if (d > 16) continue;
        if (this.units.some((v) => v !== u && v.alive && v.cov === sp)) continue;
        // block must sit between spot and threat: threat on the opposite side of the normal
        const tx = th.x - sp.x, ty = th.y - sp.y; if (tx * sp.nx + ty * sp.ny > -1) continue;
        const dt = Math.hypot(tx, ty); if (dt > RANGE * 1.1 || dt < 4) continue;
        if (d < bs) { bs = d; best = sp; }
      }
      return best;
    }
    // ---- unit brain
    condTest(u) {
      const s = this;
      return (c) => {
        if (c === 'lowHp') return u.hp < 40;
        if (c === 'enemyNear') return !!s.nearestVisibleEnemy(u, SIGHT);
        if (c === 'lowAmmo') return u.ammo < 8;
        if (c === 'pointNotOurs') return s.nearestCP(u).owner !== u.team;
        if (c === 'allyHurt') return !!s.hurtAlly(u);
        return false;
      };
    }
    canDo(u) {
      const s = this;
      return (a) => {
        if (a === 'heal') return s.packs.some((p) => p.cd <= 0);
        if (a === 'ammo') return u.ammo < MAX_AMMO;
        if (a === 'shoot') return u.ammo > 0 && !!s.nearestVisibleEnemy(u, SIGHT);
        if (a === 'cover') { const th = s.nearestVisibleEnemy(u, SIGHT); return !!th && !!(u.cov && u.covTh === th ? u.cov : s.findCover(u, th)); }
        if (a === 'capture' || a === 'guard') return !!s.goal[u.team];
        if (a === 'follow') { const L = s.leader(u.team); return !!L && L !== u; }
        if (a === 'medic') return !!s.hurtAlly(u);
        if (a === 'mine') return u.mines > 0 && !!s.goal[u.team];
        return false;
      };
    }
    think(u) {
      if (!u.mem) u.mem = B.newMem();
      const res = B.evaluateHeld(this.brains[u.team], this.condTest(u), this.canDo(u), u.mem, this.t, u.hp, this.minHold);
      u.row = res.row; u.act = res.act;
      if (u.act === 'cover') { const th = this.nearestVisibleEnemy(u, SIGHT); if (!(u.cov && u.covTh === th)) { u.cov = this.findCover(u, th); u.covTh = th; } }
      else { u.cov = null; u.covTh = null; }
    }
    // where does the unit walk this frame?
    dest(u) {
      const a = u.act, g = this.goal[u.team];
      if (a === 'heal') { const p = this.packs.filter((p) => p.cd <= 0).sort((a, b) => dist(a, u) - dist(b, u))[0]; if (p) return p; }
      if (a === 'ammo') return this.crates.slice().sort((a, b) => dist(a, u) - dist(b, u))[0];
      if (a === 'cover' && u.cov) return u.cov;
      if (a === 'shoot') { const e = this.nearestVisibleEnemy(u, SIGHT); if (e) return dist(u, e) > RANGE * 0.75 ? e : u; }
      if (a === 'medic') { const v = this.hurtAlly(u); if (v) return dist(u, v) > 2.5 ? v : u; }
      if (a === 'follow') return this.slot(u);
      if (a === 'capture' || a === 'mine' || a === 'guard') {
        if (!g) return u;
        // 🏳️ capture: travel in formation (leader-follow on) until the squad is near the point, then spread ON the point
        const L = this.leader(u.team);
        if (a === 'capture' && this.squads[u.team].follow && L && L !== u && dist(L, g) > CP_R + 4) return this.slot(u);
        const k = this.units.filter((v) => v.team === u.team && v.alive).indexOf(u), ang = k * 2.4, rr = a === 'guard' ? 3.5 : 2.5;
        return { x: g.x + Math.cos(ang) * rr, y: g.y + Math.sin(ang) * rr };
      }
      // nothing fired: default = squad behaviour
      return this.slot(u);
    }
    step(dt = DT) {
      this.t += dt;
      this.goalT -= dt; if (this.goalT <= 0) { this.goalT = 1; this.updateGoals(); }
      for (const p of this.packs) if (p.cd > 0) p.cd -= dt;
      for (const u of this.units) {
        if (!u.alive) { u.dead -= dt; if (u.dead <= 0) this.spawnUnit(u.team, u.idx, u); continue; }
        u.think -= dt; if (u.think <= 0) { u.think = 0.25; this.think(u); }
        const d = this.dest(u) || u;
        u.mx = d.x; u.my = d.y;
        let dx = d.x - u.x, dy = d.y - u.y; const L = Math.hypot(dx, dy);
        const sp = SPEED * (u.act === 'shoot' || u.act === 'cover' ? 0.8 : 1);
        if (L > 0.4) {
          dx /= L; dy /= L;
          // if a block is straight ahead, steer along it
          const ahead = { x: u.x + dx * 3, y: u.y + dy * 3 };
          const blk = BLOCKS.find((r) => segHitsRect(u.x, u.y, ahead.x, ahead.y, r, 0.6));
          if (blk && L > 2) { const cx = blk.x + blk.w / 2, cy = blk.y + blk.h / 2; const sx = -dy, sy = dx; const sgn = ((u.x - cx) * sx + (u.y - cy) * sy) >= 0 ? 1 : -1; dx = dx * 0.3 + sx * sgn; dy = dy * 0.3 + sy * sgn; const l2 = Math.hypot(dx, dy); dx /= l2; dy /= l2; }
          const m = Math.min(L, sp * dt); u.x += dx * m; u.y += dy * m; u.hx = dx; u.hy = dy;
        }
        // separation
        for (const v of this.units) if (v !== u && v.alive) { const ox = u.x - v.x, oy = u.y - v.y, o = Math.hypot(ox, oy); if (o > 0 && o < 1.4) { u.x += ox / o * (1.4 - o) * 0.5; u.y += oy / o * (1.4 - o) * 0.5; } }
        // collide with blocks + world edge
        for (const r of BLOCKS) {
          const pad = 0.8, x0 = r.x - pad, x1 = r.x + r.w + pad, y0 = r.y - pad, y1 = r.y + r.h + pad;
          if (u.x > x0 && u.x < x1 && u.y > y0 && u.y < y1) {
            const pen = [u.x - x0, x1 - u.x, u.y - y0, y1 - u.y], k = pen.indexOf(Math.min(...pen));
            if (k === 0) u.x = x0; else if (k === 1) u.x = x1; else if (k === 2) u.y = y0; else u.y = y1;
          }
        }
        u.x = Math.max(1, Math.min(W - 1, u.x)); u.y = Math.max(1, Math.min(H - 1, u.y));
        u.inCover = !!(u.cov && Math.hypot(u.cov.x - u.x, u.cov.y - u.y) < 1.5);
        // pickups
        for (const p of this.packs) if (p.cd <= 0 && dist(p, u) < 1.8 && u.hp < MAX_HP) { u.hp = MAX_HP; p.cd = 12; }
        for (const c of this.crates) if (dist(c, u) < 2) u.ammo = MAX_AMMO;
        if (u.act === 'medic') { const v = this.hurtAlly(u); if (v && dist(u, v) < 3) v.hp = Math.min(MAX_HP, v.hp + 20 * dt); }
        if (u.act === 'mine' && u.mines > 0) { const g = this.goal[u.team]; if (g && dist(u, g) < 7 && !this.mines.some((m) => dist(m, u) < 4)) { this.mines.push({ x: u.x, y: u.y, team: u.team }); u.mines--; } }
        // auto-fire at nearest visible enemy in range (everyone shoots back; 🎯 shoot = chase + engage)
        u.fire -= dt;
        if (u.fire <= 0 && u.ammo > 0 && u.act !== 'heal') {
          const e = this.nearestVisibleEnemy(u, RANGE);
          if (e) {
            u.fire = 0.45; u.ammo--;
            const hit = this.rand() < (e.inCover ? 0.22 : 0.55);
            this.tracers.push({ x0: u.x, y0: u.y, x1: e.x, y1: e.y, team: u.team, life: 0.12 });
            if (hit) { e.hp -= 10; if (e.hp <= 0) this.kill(e); }
          }
        }
      }
      // mines
      this.mines = this.mines.filter((m) => {
        const v = this.units.find((v) => v.alive && v.team !== m.team && dist(v, m) < 2.5);
        if (!v) return true;
        this.units.forEach((w) => { if (w.alive && w.team !== m.team && dist(w, m) < 3.5) { w.hp -= 60; if (w.hp <= 0) this.kill(w); } });
        this.tracers.push({ boom: true, x0: m.x, y0: m.y, life: 0.4 });
        return false;
      });
      // capture
      for (const p of this.cps) {
        let b = 0, r = 0;
        for (const u of this.units) if (u.alive && dist(u, p) < CP_R) { if (u.team === 1) b++; else r++; }
        if (b && r) continue;
        const n = Math.min(3, b || r), dir = b ? 1 : r ? -1 : 0; if (!dir) continue;
        const before = p.owner;
        p.prog = Math.max(-1, Math.min(1, p.prog + dir * n * 0.2 * dt));
        if (p.owner === 1 && p.prog <= 0) p.owner = 0;
        if (p.owner === 2 && p.prog >= 0) p.owner = 0;
        if (p.prog >= 1) p.owner = 1;
        if (p.prog <= -1) p.owner = 2;
        if (before && p.owner !== before) p.lostAt[before] = this.t;
        if (p.owner !== before) this.goalT = 0;
      }
      this.tracers = this.tracers.filter((t) => (t.life -= dt) > 0);
    }
    kill(u) { u.alive = false; u.dead = 4; u.hp = 0; u.cov = null; u.row = -1; u.act = null; }
    score() { return { 1: this.cps.filter((p) => p.owner === 1).length, 2: this.cps.filter((p) => p.owner === 2).length }; }
  }

  // ---------- renderer ----------
  const COL = { 1: '#3b8cff', 2: '#ff4d4d', 0: '#9aa3ad' };
  function draw(ctx, sim, view, sel, now) {
    const { s, ox, oy } = view;
    const X = (x) => ox + x * s, Y = (y) => oy + y * s;
    ctx.save();
    ctx.fillStyle = '#1b2a1f'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#26402c'; ctx.fillRect(X(0), Y(0), W * s, H * s);
    // bases
    for (const t of [1, 2]) { ctx.fillStyle = t === 1 ? 'rgba(59,140,255,.18)' : 'rgba(255,77,77,.18)'; ctx.fillRect(X(t === 1 ? 0 : W - 8), Y(20), 8 * s, 20 * s); }
    // command posts
    for (const p of sim.cps) {
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), CP_R * s, 0, Math.PI * 2); ctx.fillStyle = p.owner ? (p.owner === 1 ? 'rgba(59,140,255,.22)' : 'rgba(255,77,77,.22)') : 'rgba(255,255,255,.08)'; ctx.fill();
      ctx.lineWidth = Math.max(2, s * 0.4); ctx.strokeStyle = COL[p.owner]; ctx.stroke();
      if (Math.abs(p.prog) < 1) { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), CP_R * s + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.abs(p.prog)); ctx.strokeStyle = p.prog > 0 ? COL[1] : COL[2]; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(10, s * 2.6)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.id, X(p.x), Y(p.y));
    }
    // goal markers
    for (const t of [1, 2]) { const g = sim.goal[t]; if (!g) continue; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(X(g.x), Y(g.y), (CP_R + 1.6) * s + (t === 2 ? 3 : 0), 0, Math.PI * 2); ctx.strokeStyle = COL[t]; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
    // blocks
    for (const r of BLOCKS) { ctx.fillStyle = '#8a7a5c'; ctx.fillRect(X(r.x), Y(r.y), r.w * s, r.h * s); ctx.strokeStyle = '#5d523d'; ctx.lineWidth = 2; ctx.strokeRect(X(r.x), Y(r.y), r.w * s, r.h * s); }
    const emo = (t, x, y, px) => { ctx.font = `${px}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); };
    const ip = Math.max(12, s * 3.2);
    for (const p of sim.packs) { ctx.globalAlpha = p.cd > 0 ? 0.25 : 1; emo('💊', X(p.x), Y(p.y), ip); }
    ctx.globalAlpha = 1;
    for (const c of sim.crates) emo('📦', X(c.x), Y(c.y), ip);
    for (const m of sim.mines) { ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), Math.max(3, s * 0.8), 0, Math.PI * 2); ctx.fillStyle = COL[m.team]; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); }
    // tracers
    for (const t of sim.tracers) {
      if (t.boom) { ctx.beginPath(); ctx.arc(X(t.x0), Y(t.y0), (1 - t.life / 0.4) * 4 * s + 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,180,60,.6)'; ctx.fill(); continue; }
      ctx.beginPath(); ctx.moveTo(X(t.x0), Y(t.y0)); ctx.lineTo(X(t.x1), Y(t.y1)); ctx.strokeStyle = t.team === 1 ? 'rgba(140,200,255,.8)' : 'rgba(255,160,140,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // units
    const ur = Math.max(5, s * 1.2);
    for (const u of sim.units) {
      if (!u.alive) { ctx.globalAlpha = 0.35; ctx.fillStyle = COL[u.team]; ctx.font = `${ur * 1.6}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('✕', X(u.x), Y(u.y)); ctx.globalAlpha = 1; continue; }
      const isSel = sel && sel === u.id;
      if (isSel) { const pulse = 0.5 + 0.5 * Math.sin(now / 160); ctx.beginPath(); ctx.arc(X(u.x), Y(u.y), ur + 5 + pulse * 4, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,230,80,${0.25 + pulse * 0.25})`; ctx.fill(); ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(X(u.x), Y(u.y), ur, 0, Math.PI * 2); ctx.fillStyle = COL[u.team]; ctx.fill();
      ctx.lineWidth = u.inCover ? 3 : 1.5; ctx.strokeStyle = u.inCover ? '#d9c38a' : '#0b1210'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(u.x), Y(u.y)); ctx.lineTo(X(u.x + u.hx * 1.8), Y(u.y + u.hy * 1.8)); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      if (sim.leader(u.team) === u) { ctx.fillStyle = '#ffe14d'; ctx.font = `bold ${ur * 1.1}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', X(u.x), Y(u.y) + 1); }
      // hp bar
      const bw = ur * 2.4; ctx.fillStyle = '#000'; ctx.fillRect(X(u.x) - bw / 2, Y(u.y) + ur + 2, bw, 3); ctx.fillStyle = u.hp < 40 ? '#ff5050' : '#5be35b'; ctx.fillRect(X(u.x) - bw / 2, Y(u.y) + ur + 2, bw * Math.max(0, u.hp) / MAX_HP, 3);
      // action icon
      const icon = u.act ? B.ACT[u.act].icon : (sim.squads[u.team].follow ? '🧭' : '🏳️');
      ctx.globalAlpha = u.act ? 1 : 0.55; emo(icon, X(u.x), Y(u.y) - ur - ip * 0.55, ip * (isSel ? 1.15 : 0.9)); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  root.Arena = { Sim, draw, W, H, DT, BLOCKS, COVER, segHitsRect, losClear };
})(typeof window !== 'undefined' ? window : globalThis);
