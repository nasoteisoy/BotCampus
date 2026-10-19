// Conquest simulation: posts, capture, tickets, bleed, CP, auto waves, squads, bots, combat, commander AI.
// Pure logic (no three.js, no DOM), fixed time step, so it can be fast-forwarded in tests.
import { MAP, heightAt, lineClear } from './map.js';
import { Nav } from './nav.js';
import { statsOf, mulberry32 } from './data.js';

export const CFG = {
  dt: 0.05,
  tickets: 150, botsPerTeam: 12, squadSize: 4,
  startCP: 1500, cpBase: 70, cpPerPost: 20, cpEvery: 5,
  bleedEvery: 5, waveEvery: 10,
  capTime: 10, capMaxMult: 3, regen: 0.05,
  timeLimit: 900,
  aiEvery: { easy: 25, normal: 6 },
  enemyAcc: { easy: 0.72, normal: 1 },
};
export const MARKS = ['attack', 'defend', 'ignore'];

let NAV = null; // shared, built once (static map)
export const getNav = () => (NAV ||= new Nav());

export class Sim {
  // teams: [{ nation, looks:[look] }, { nation, looks }]  (team 0 = player / blue, team 1 = enemy / red)
  constructor({ teams, difficulty = 'normal', seed = 1, cfg = {} }) {
    this.cfg = { ...CFG, ...cfg };
    this.rng = mulberry32(seed);
    this.nav = getNav();
    this.difficulty = difficulty;
    this.time = 0; this.over = null; this.events = []; this.nextId = 1;
    this.posts = MAP.posts.map((p) => ({ ...p, ctrl: p.owner === 0 ? 1 : p.owner === 1 ? -1 : 0, n: [0, 0], contestT: -99, flipT: -99 }));
    this.units = [];
    this.autoCmd = [false, true];   // team 1 always runs the commander AI; team 0 only when asked (tests / demo)
    this.teams = teams.map((t, i) => ({
      idx: i, nation: t.nation, looks: t.looks.map((l) => ({ ...l, stats: statsOf(l.st) })),
      tickets: this.cfg.tickets, cp: this.cfg.startCP, rally: null,
      marks: this.posts.map(() => ({ mark: 'attack', stars: 1 })),
      squads: [], lookCursor: 0, kills: 0, losses: 0, spawned: 0, cpEarned: 0,
      cpT: this.cfg.cpEvery, bleedT: this.cfg.bleedEvery, waveT: this.cfg.waveEvery, aiT: 0,
    }));
    const nSq = Math.ceil(this.cfg.botsPerTeam / this.cfg.squadSize);
    for (const T of this.teams) {
      for (let k = 0; k < nSq; k++) T.squads.push({ id: k, team: T.idx, post: -1, members: [], size: Math.min(this.cfg.squadSize, this.cfg.botsPerTeam - k * this.cfg.squadSize), wiped: false });
      this.defaultMarks(T);
    }
    // opening: full squads at the home post, free
    for (const T of this.teams) {
      const home = this.posts.find((p) => p.owner === T.idx);
      for (const sq of T.squads) for (let m = 0; m < sq.size; m++) this.spawnUnit(T, sq, home, true);
      this.assign(T, true);
    }
  }
  r() { return this.rng(); }
  emit(e) { if (this.events.length < 600) this.events.push(e); }
  other(t) { return 1 - t; }

  // ---------- marks ----------
  defaultMarks(T) {
    const enemyHome = this.posts.findIndex((p) => p.owner === this.other(T.idx));
    this.posts.forEach((p, i) => {
      if (p.owner === T.idx) T.marks[i] = { mark: 'defend', stars: 1 };
      else T.marks[i] = { mark: 'attack', stars: i === enemyHome ? 1 : 3 };
    });
  }
  setMark(t, i, mark, stars) {
    const T = this.teams[t], m = T.marks[i]; if (!m) return;
    if (mark && MARKS.includes(mark)) m.mark = mark;
    if (stars != null) m.stars = Math.max(1, Math.min(3, stars | 0));
    this.assign(T, true);
  }
  setRally(t, x, z) {
    const T = this.teams[t];
    if (x == null) { T.rally = null; for (const u of this.units) if (u.alive && u.team === t && u.mode === 'rally') { u.mode = 'go'; this.giveSlot(u); } return; }
    const [fx, fz] = this.nav.freePoint(Math.max(-MAP.hx + 3, Math.min(MAP.hx - 3, x)), Math.max(-MAP.hz + 3, Math.min(MAP.hz - 3, z)));
    T.rally = { x: fx, z: fz };
    for (const sq of T.squads) if (sq.post < 0) for (const u of sq.members) if (u.alive && u.mode !== 'rally') this.giveSlot(u);
  }
  weight(T, i) {
    const m = T.marks[i], p = this.posts[i];
    if (m.mark === 'ignore') return 0;
    const own = p.owner === T.idx, threatened = own && p.n[this.other(T.idx)] > 0;
    if (m.mark === 'attack') return m.stars * (own && !threatened ? 0.35 : 1);
    return m.stars * (own || threatened ? 1 : 0.6);
  }

  // ---------- squads → posts ----------
  centroid(sq) {
    let x = 0, z = 0, n = 0;
    for (const u of sq.members) if (u.alive) { x += u.x; z += u.z; n++; }
    if (!n) { const T = this.teams[sq.team], h = this.spawnPost(T) || this.posts[0]; return [h.x, h.z]; }
    return [x / n, z / n];
  }
  assign(T, force) {
    const count = this.posts.map(() => 0);
    const w = this.posts.map((_, i) => this.weight(T, i));
    for (const sq of T.squads) {
      const [cx, cz] = this.centroid(sq);
      let best = -1, bs = 0; const score = (i) => w[i] / (1 + count[i]) / (1 + Math.hypot(this.posts[i].x - cx, this.posts[i].z - cz) / 160);
      for (let i = 0; i < this.posts.length; i++) if (w[i] > 0) { const s = score(i); if (s > bs) { bs = s; best = i; } }
      if (!force && sq.post >= 0 && w[sq.post] > 0 && score(sq.post) >= bs * 0.8) best = sq.post;
      if (best >= 0) count[best]++;
      if (best !== sq.post || force) this.setSquadPost(sq, best, best !== sq.post);
    }
  }
  setSquadPost(sq, i, changed) {
    sq.post = i;
    if (changed) for (const u of sq.members) if (u.alive) this.giveSlot(u);
  }
  giveSlot(u) {
    const sq = this.teams[u.team].squads[u.squad];
    let gx, gz;
    if (sq.post >= 0) {
      const p = this.posts[sq.post], a = this.r() * Math.PI * 2, d = Math.sqrt(this.r()) * MAP.postR * 0.7;
      gx = p.x + Math.cos(a) * d; gz = p.z + Math.sin(a) * d;
    } else { // no target: hold at rally point, else where we stand
      const R = this.teams[u.team].rally;
      gx = (R ? R.x : u.x) + (this.r() - 0.5) * 6; gz = (R ? R.z : u.z) + (this.r() - 0.5) * 6;
    }
    [u.gx, u.gz] = this.nav.freePoint(gx, gz);
    u.path = null; u.repath = 0;
  }

  // ---------- spawning ----------
  enemyIn(p, t) { return p.n[this.other(t)] > 0; }
  spawnPost(T) {
    const own = this.posts.filter((p) => p.owner === T.idx && !this.enemyIn(p, T.idx));
    if (!own.length) return null;
    let tx, tz;
    if (T.rally) { tx = T.rally.x; tz = T.rally.z; }
    else { // toward the most wanted post
      let bi = -1, bw = 0; this.posts.forEach((p, i) => { const w = this.weight(T, i); if (w > bw) { bw = w; bi = i; } });
      const q = bi >= 0 ? this.posts[bi] : own[0]; tx = q.x; tz = q.z;
    }
    return own.reduce((a, b) => (Math.hypot(a.x - tx, a.z - tz) <= Math.hypot(b.x - tx, b.z - tz) ? a : b));
  }
  spawnUnit(T, sq, post, free = false) {
    const look = T.looks[T.lookCursor++ % T.looks.length];
    if (!free) { if (T.cp < look.stats.cost) { T.lookCursor--; return null; } T.cp -= look.stats.cost; }
    const a = this.r() * Math.PI * 2, d = 1.5 + this.r() * 4;
    const [x, z] = this.nav.freePoint(post.x + Math.cos(a) * d, post.z + Math.sin(a) * d);
    const s = look.stats, u = {
      id: this.nextId++, team: T.idx, squad: sq.id, look: T.looks.indexOf(look), cls: s.cls, s,
      hp: s.hp, x, z, yaw: T.idx === 0 ? Math.PI / 2 : -Math.PI / 2, alive: true, deadT: 0, hurtT: 0,
      gx: x, gz: z, path: null, repath: 0, think: this.r() * 0.3, fireT: this.r() * s.rof, tgt: null,
      mode: T.rally && !free ? 'rally' : 'go', moving: false, phase: this.r() * 6, kills: 0, firing: 0, born: this.time,
    };
    this.units.push(u); sq.members.push(u); sq.wiped = false; T.spawned++;
    this.giveSlot(u);
    if (u.mode === 'rally') { [u.gx, u.gz] = [T.rally.x + (this.r() - 0.5) * 5, T.rally.z + (this.r() - 0.5) * 5]; [u.gx, u.gz] = this.nav.freePoint(u.gx, u.gz); }
    return u;
  }
  wave(T) {
    if (T.tickets <= 0) return 0;
    const post = this.spawnPost(T); if (!post) return 0;
    let n = 0;
    for (const sq of T.squads) {
      sq.members = sq.members.filter((u) => u.alive);
      while (sq.members.length < sq.size) { if (!this.spawnUnit(T, sq, post)) return n; n++; }
    }
    if (n) this.emit({ type: 'wave', team: T.idx, post: post.id, n });
    return n;
  }

  // ---------- commander AI (same marks as the player) ----------
  commander(T) {
    const t = T.idx, o = this.other(t), easy = this.difficulty === 'easy' && t === 1;
    const owned = this.posts.map((p) => p.owner === t);
    let changed = false;
    const set = (i, mark, stars) => { const m = T.marks[i]; if (m.mark !== mark || m.stars !== stars) { m.mark = mark; m.stars = stars; changed = true; } };
    // distance from our territory (owned posts, else our units) to each post
    const ours = this.posts.filter((p, i) => owned[i]);
    const dist = (p) => ours.length ? Math.min(...ours.map((q) => Math.hypot(q.x - p.x, q.z - p.z) || 999)) : Math.abs(p.x - (t === 0 ? -MAP.hx : MAP.hx));
    const targets = this.posts.map((p, i) => i).filter((i) => !owned[i]).sort((a, b) => dist(this.posts[a]) - dist(this.posts[b]));
    this.posts.forEach((p, i) => {
      if (owned[i]) {
        const front = this.posts.some((q, j) => !owned[j] && Math.hypot(q.x - p.x, q.z - p.z) < 90);
        set(i, 'defend', p.n[o] > 0 ? (easy ? 2 : 3) : front ? (easy ? 1 : 2) : 1);
      } else set(i, 'attack', i === targets[0] ? (easy ? 2 : 3) : 1);
    });
    if (changed) this.assign(T, false);
  }

  // ---------- main step ----------
  step(dt = this.cfg.dt) {
    if (this.over) return;
    this.time += dt;
    const C = this.cfg;
    // commander AIs
    for (const T of this.teams) if (this.autoCmd[T.idx] && (T.aiT -= dt) <= 0) { T.aiT = C.aiEvery[T.idx === 1 ? this.difficulty : 'normal'] || 6; this.commander(T); }
    this.capture(dt);
    this.updateUnits(dt);
    this.updateShots(dt);
    // economy + bleed + waves
    for (const T of this.teams) {
      const owned = this.posts.filter((p) => p.owner === T.idx).length;
      if ((T.cpT -= dt) <= 0) { T.cpT += C.cpEvery; const g = C.cpBase + C.cpPerPost * owned; T.cp += g; T.cpEarned += g; }
      if ((T.bleedT -= dt) <= 0) { T.bleedT += C.bleedEvery; if (owned * 2 > this.posts.length) { const O = this.teams[this.other(T.idx)]; O.tickets = Math.max(0, O.tickets - 1); O.bled = (O.bled || 0) + 1; } }
      if ((T.waveT -= dt) <= 0) { T.waveT += C.waveEvery; this.wave(T); }
    }
    // periodic re-balance of squads (keeps them on useful posts as ownership changes)
    if (Math.floor(this.time / 2) !== Math.floor((this.time - dt) / 2)) for (const T of this.teams) this.assign(T, false);
    // corpses fade out
    this.units = this.units.filter((u) => u.alive || (u.deadT += dt) < 3.5);
    this.checkWin();
  }
  capture(dt) {
    const C = this.cfg, R2 = MAP.postR * MAP.postR;
    for (const p of this.posts) {
      p.n[0] = p.n[1] = 0;
      for (const u of this.units) if (u.alive && (u.x - p.x) ** 2 + (u.z - p.z) ** 2 < R2) p.n[u.team]++;
      const diff = p.n[0] - p.n[1], prevOwner = p.owner;
      if (diff !== 0) p.ctrl += Math.sign(diff) * Math.min(C.capMaxMult, Math.abs(diff)) / C.capTime * dt;
      else if (!p.n[0] && !p.n[1]) { const home = p.owner === 0 ? 1 : p.owner === 1 ? -1 : 0; p.ctrl += Math.sign(home - p.ctrl) * Math.min(Math.abs(home - p.ctrl), C.regen * dt); }
      p.ctrl = Math.max(-1, Math.min(1, p.ctrl));
      if (p.ctrl >= 1) p.owner = 0; else if (p.ctrl <= -1) p.owner = 1;
      else if ((p.owner === 0 && p.ctrl <= 0) || (p.owner === 1 && p.ctrl >= 0)) p.owner = -1;
      if (p.owner !== prevOwner) {
        p.flipT = this.time;
        this.emit({ type: p.owner === -1 ? 'neutral' : 'captured', post: p.id, team: p.owner, from: prevOwner });
        for (const T of this.teams) this.assign(T, false);
      }
      // alert: enemies stepping onto a post you own
      for (const t of [0, 1]) if (p.owner === t && p.n[1 - t] > 0 && this.time - (p['al' + t] || -99) > 10) { p['al' + t] = this.time; this.emit({ type: 'contested', post: p.id, team: t }); }
    }
  }
  updateUnits(dt) {
    const alive = this.units.filter((u) => u.alive);
    for (const u of alive) {
      u.hurtT = Math.max(0, u.hurtT - dt); u.firing = Math.max(0, u.firing - dt);
      // targeting
      if ((u.think -= dt) <= 0) {
        u.think = 0.3;
        let best = null, bd = u.s.range * u.s.range;
        for (const e of alive) {
          if (e.team === u.team || !e.alive) continue;
          const d = (e.x - u.x) ** 2 + (e.z - u.z) ** 2;
          if (d < bd && lineClear(u.x, u.z, e.x, e.z)) { bd = d; best = e; }
        }
        u.tgt = best;
        if (u.mode === 'rally') { const R = this.teams[u.team].rally; if (!R || Math.hypot(u.x - R.x, u.z - R.z) < 4) { u.mode = 'go'; this.giveSlot(u); } }
      }
      const tg = u.tgt && u.tgt.alive ? u.tgt : null;
      // fire
      if ((u.fireT -= dt) <= 0 && tg) { u.fireT = u.s.rof * (0.85 + 0.3 * this.r()); this.fire(u, tg); }
      // move
      const limp = u.hp < u.s.hp * 0.35;
      const dg = Math.hypot(u.gx - u.x, u.gz - u.z);
      u.moving = false;
      if (dg > 0.8) {
        if (!u.path || (u.repath -= dt) <= 0) { u.path = this.nav.findPath(u.x, u.z, u.gx, u.gz); u.repath = 4 + this.r() * 2; }
        let wp = u.path[0];
        while (wp && Math.hypot(wp.x - u.x, wp.z - u.z) < 0.6 && u.path.length > 1) { u.path.shift(); wp = u.path[0]; }
        if (wp) {
          const sp = u.s.speed * (limp ? 0.55 : 1) * (tg ? 0.5 : 1);
          const dx = wp.x - u.x, dz = wp.z - u.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, sp * dt);
          this.tryMove(u, dx / d * st, dz / d * st);
          if (!tg) u.yaw = turn(u.yaw, Math.atan2(dx, dz), dt * 8);
          u.moving = true; u.phase += dt * sp * (limp ? 1.2 : 2.2);
        }
      }
      if (tg) u.yaw = turn(u.yaw, Math.atan2(tg.x - u.x, tg.z - u.z), dt * 10);
    }
    // separation
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j], dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.1 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (1.05 - d) * 0.5; this.tryMove(a, -dx / d * push, -dz / d * push); this.tryMove(b, dx / d * push, dz / d * push); }
    }
  }
  tryMove(u, dx, dz) {
    if (!this.nav.blockedAt(u.x + dx, u.z + dz)) { u.x += dx; u.z += dz; }
    else if (!this.nav.blockedAt(u.x + dx, u.z)) u.x += dx;
    else if (!this.nav.blockedAt(u.x, u.z + dz)) u.z += dz;
  }
  accMul(u) { return u.team === 1 ? (this.cfg.enemyAcc[this.difficulty] || 1) : 1; }
  fire(u, tg) {
    const d = Math.hypot(tg.x - u.x, tg.z - u.z);
    u.firing = 0.25;
    const y0 = heightAt(u.x, u.z) + 1.9, y1 = heightAt(tg.x, tg.z) + 1.3;
    if (u.s.weapon === 'rocket') {
      const miss = (1 - u.s.acc * this.accMul(u)) * 3.5 * (d / u.s.range);
      const tx = tg.x + (this.r() - 0.5) * 2 * miss, tz = tg.z + (this.r() - 0.5) * 2 * miss;
      (this.shots ||= []).push({ x: u.x, z: u.z, y: y0, x0: u.x, z0: u.z, y0, tx, tz, ty: heightAt(tx, tz) + 0.5, t: 0, T: Math.max(0.25, d / 32), team: u.team, owner: u, dmg: u.s.dmg, splash: u.s.splash });
      this.emit({ type: 'rocket', team: u.team, x0: u.x, z0: u.z, y0, x1: tx, z1: tz, y1: heightAt(tx, tz) + 0.5, T: Math.max(0.25, d / 32) });
      return;
    }
    const p = u.s.acc * this.accMul(u) * (1 - 0.45 * d / u.s.range) * (tg.moving ? 0.9 : 1);
    const hit = this.r() < p;
    const ex = hit ? tg.x : tg.x + (this.r() - 0.5) * 3, ez = hit ? tg.z : tg.z + (this.r() - 0.5) * 3;
    this.emit({ type: 'tracer', team: u.team, laser: !!u.s.laser, x0: u.x, z0: u.z, y0, x1: ex, z1: ez, y1 });
    if (hit) this.damage(tg, u.s.dmg * (0.85 + 0.3 * this.r()), u);
  }
  updateShots(dt) {
    if (!this.shots) return;
    for (const s of this.shots) {
      s.t += dt;
      if (s.t >= s.T) {
        s.done = true;
        this.emit({ type: 'boom', x: s.tx, z: s.tz, y: s.ty, team: s.team });
        for (const e of this.units) if (e.alive && e.team !== s.team) { const d = Math.hypot(e.x - s.tx, e.z - s.tz); if (d < s.splash) this.damage(e, s.dmg * (1 - 0.6 * d / s.splash), s.owner); }
      }
    }
    this.shots = this.shots.filter((s) => !s.done);
  }
  damage(e, amt, by) {
    if (!e.alive) return;
    e.hp -= amt; e.hurtT = 0.2;
    if (e.hp > 0) return;
    e.alive = false; e.deadT = 0; e.hp = 0;
    e.fallYaw = by ? Math.atan2(e.x - by.x, e.z - by.z) : e.yaw;
    const T = this.teams[e.team]; T.tickets = Math.max(0, T.tickets - 1); T.losses++;
    if (by) { by.kills++; this.teams[by.team].kills++; }
    this.emit({ type: 'death', team: e.team, x: e.x, z: e.z });
    const sq = T.squads[e.squad];
    if (sq && !sq.members.some((m) => m.alive) && !sq.wiped) { sq.wiped = true; this.emit({ type: 'squadLost', team: e.team, x: e.x, z: e.z }); }
  }
  checkWin() {
    const [A, B] = this.teams;
    const end = (winner, reason) => { this.over = { winner, reason, time: this.time }; this.emit({ type: 'over', winner, reason }); };
    if (A.tickets <= 0 && B.tickets <= 0) return end(-1, 'tickets');
    if (A.tickets <= 0) return end(1, 'tickets');
    if (B.tickets <= 0) return end(0, 'tickets');
    for (const t of [0, 1]) if (this.posts.every((p) => p.owner === t) && !this.units.some((u) => u.alive && u.team !== t)) return end(t, 'posts');
    if (this.time >= this.cfg.timeLimit) return end(A.tickets === B.tickets ? -1 : A.tickets > B.tickets ? 0 : 1, 'time');
  }
  // fast-forward (tests)
  simulate(sec) { const n = Math.round(sec / this.cfg.dt); for (let i = 0; i < n && !this.over; i++) this.step(); }
}
function turn(a, b, k) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * Math.min(1, k); }
