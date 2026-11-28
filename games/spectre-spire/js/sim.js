// The authoritative game: ghosts, loot physics, quota, timer, hearts, abilities, bots and the shop.
// Runs on the host's browser (or alone in solo). Guests only send their pose and button presses.
import { HUNTERS, GHOSTS, LOOT, SHOP, T, floorTypeFor, shopPrice } from './config.js';
import { buildFloor, collideCircle, lineClear, inElevator, flowField, flowDir } from './tower.js';
import { makeRng, hashSeed } from './rng.js';

export const GHOST_KINDS = Object.keys(GHOSTS);
export const LOOT_KINDS = Object.keys(LOOT);
const r2 = (v) => Math.round(v * 100) / 100;

export function aimVector(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export class Sim {
  constructor({ runSeed, tower, roster }) {
    this.runSeed = runSeed;
    this.tower = tower;
    this.rng = makeRng(hashSeed(runSeed, 'sim'));
    this.hunters = new Map();
    roster.forEach((p, i) => this.hunters.set(p.pid, this.newHunter(p, i)));
    this.up = Object.fromEntries(SHOP.map((s) => [s.id, 0]));
    this.gold = 0;
    this.n = 0;
    this.prevType = null;
    this.events = [];
    this.eid = 0;
    this.phase = 'play';
    this.result = null;
    this.flowCache = new Map();
    this.startFloor(1);
  }

  newHunter(p, i) {
    return { pid: p.pid, name: p.name, h: p.h, ctrl: p.ctrl, slot: i, x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
      suck: false, want: -1, hold: -1, hp: T.maxHearts, down: false, revive: 0, cd: 0, turbo: 0, dash: 0, inv: 0,
      abSeq: 0, lastAb: 0, buySeq: 0, lastBuy: 0, ready: 0, bot: p.ctrl === 'bot' ? { think: 0, goal: null } : null,
      stats: { caught: 0, hauled: 0, broken: 0, saves: 0 } };
  }

  emit(e) { e.id = ++this.eid; this.events.push(e); if (this.events.length > 40) this.events.shift(); }

  get standing() { let n = 0; for (const h of this.hunters.values()) if (!h.down) n++; return n; }
  get mul() {
    return { tank: 1 + 0.25 * this.up.tank, beam: this.up.beam * 2, speed: 1 + 0.1 * this.up.shoes, pad: Math.pow(0.7, this.up.pad), cool: Math.pow(0.8, this.up.cool) };
  }

  startFloor(n) {
    this.n = n;
    const rng = makeRng(hashSeed(this.runSeed, 'type', n));
    this.type = floorTypeFor(n, this.tower, rng, this.prevType);
    this.prevType = this.type;
    this.floor = buildFloor({ runSeed: this.runSeed, n, type: this.type, extraTime: this.up.clock, players: this.hunters.size });
    const f = this.floor;
    this.timeLeft = f.time;
    this.bounty = 0;
    this.saved = 0;
    this.depart = 0;
    this.revealT = 0;
    this.bossDone = this.type !== 'boss';
    this.quotaMetOnce = false;
    this.flowCache.clear();
    this.elevFlow = flowField(f, f.elevator.x, f.elevator.z);
    this.ghosts = f.ghosts.map((g) => this.newGhost(g.kind, g.x, g.z, g.id));
    this.nextGhostId = this.ghosts.length;
    this.loot = f.loot.map((l) => ({ ...l, base: l.value, vx: 0, vy: 0, vz: 0, ry: this.rng.range(0, 6.28), holders: [], gone: false, inZone: false, bumpT: 0, last: null }));
    this.cages = f.cages.map((c) => ({ ...c, prog: 0, freed: false }));
    this.guests = [];
    this.wards = [];
    let i = 0;
    for (const h of this.hunters.values()) {
      const s = f.spawns[i++ % f.spawns.length];
      Object.assign(h, { x: s.x, y: 0, z: s.z, yaw: s.yaw, pitch: 0, hold: -1, want: -1, suck: false, turbo: 0, dash: 0, inv: 2 });
      if (h.down) { h.down = false; h.hp = 1; }
      if (h.bot) h.bot.goal = null;
    }
    this.phase = 'play';
    this.emit({ k: 'floor', n, type: this.type });
  }

  newGhost(kind, x, z, id) {
    const def = GHOSTS[kind];
    return { id, kind, def, x, y: 1.5, z, vx: 0, vz: 0, face: 0, mode: 'idle', t: this.rng.range(0, 2), wx: x, wz: z,
      stunAcc: 0, stunT: 0, immune: 0, cap: 0, hp: kind === 'boss' ? def.hp : 1, target: null, suckers: 0, power: 0, sx: 0, sy: 0, sz: 0, gone: false, summon: 6 };
  }

  get collected() { let v = this.bounty + this.saved; for (const l of this.loot) if (!l.gone && l.inZone) v += l.value; return v; }

  // ---------- inputs
  setInput(pid, inp) {
    const h = this.hunters.get(pid);
    if (!h || h.ctrl === 'bot') return;
    if (inp.x !== undefined && !h.down) { h.x = inp.x; h.y = inp.y; h.z = inp.z; }
    else if (inp.x !== undefined && h.down) { h.x = inp.x; h.z = inp.z; } // crawling
    if (inp.yw !== undefined) { h.yaw = inp.yw; h.pitch = inp.pt; }
    h.suck = !!inp.s;
    h.want = inp.g ?? -1;
    if (inp.ab > h.abSeq) h.abSeq = inp.ab;
    if (inp.bs > h.buySeq) { h.buySeq = inp.bs; h.buyItem = inp.bi; }
    if (inp.rd !== undefined) h.ready = inp.rd;
  }
  addHunter(p) { if (!this.hunters.has(p.pid)) { const h = this.newHunter(p, this.hunters.size); const s = this.floor.spawns[h.slot % 6]; h.x = s.x; h.z = s.z; this.hunters.set(p.pid, h); } }
  removeHunter(pid) {
    const h = this.hunters.get(pid); if (!h) return;
    for (const l of this.loot) l.holders = l.holders.filter((x) => x !== pid);
    this.hunters.delete(pid);
    this.emit({ k: 'left', name: h.name });
  }

  // ---------- main step
  step(dt) {
    if (this.phase === 'win' || this.phase === 'lose') return;
    if (this.phase === 'lift') { this.liftT -= dt; if (this.liftT <= 0) this.afterLift(); return; }
    if (this.phase === 'shop') { this.stepShop(dt); return; }
    const f = this.floor;
    this.timeLeft -= dt;
    this.revealT = Math.max(0, this.revealT - dt);
    for (const w of this.wards) w.t -= dt;
    this.wards = this.wards.filter((w) => w.t > 0);
    for (const h of this.hunters.values()) this.stepHunter(h, dt);
    this.stepLight(dt);
    for (const g of this.ghosts) if (!g.gone) this.stepGhost(g, dt);
    this.ghosts = this.ghosts.filter((g) => !g.gone);
    this.stepLoot(dt);
    this.stepCages(dt);

    const col = this.collected;
    const met = col >= f.quota && this.bossDone;
    if (met && !this.quotaMetOnce) { this.quotaMetOnce = true; this.emit({ k: 'quota' }); }
    if (!met && this.quotaMetOnce && col < f.quota) this.quotaMetOnce = false;
    if (this.standing === 0) return this.lose('down');
    if (met) {
      let all = true;
      for (const h of this.hunters.values()) if (!h.down && !inElevator(f, h.x, h.z)) all = false;
      if (all) { if (this.depart <= 0) this.emit({ k: 'depart' }); this.depart += dt; if (this.depart >= 3) return this.leaveFloor(); }
      else this.depart = 0;
    } else this.depart = 0;
    if (this.timeLeft <= 0) {
      if (met) return this.leaveFloor();
      return this.lose(this.bossDone ? 'quota' : 'boss');
    }
  }

  stepHunter(h, dt) {
    h.cd = Math.max(0, h.cd - dt); h.turbo = Math.max(0, h.turbo - dt); h.dash = Math.max(0, h.dash - dt); h.inv = Math.max(0, h.inv - dt);
    if (h.bot) this.stepBot(h, dt);
    // abilities
    if (h.abSeq > h.lastAb) { h.lastAb = h.abSeq; if (!h.down && h.cd <= 0) this.useAbility(h); }
    // grabbing
    if (h.down) h.want = -1;
    if (h.want !== h.hold) {
      if (h.hold >= 0) { const l = this.loot.find((x) => x.id === h.hold); if (l) l.holders = l.holders.filter((x) => x !== h.pid); h.hold = -1; }
      if (h.want >= 0) {
        const l = this.loot.find((x) => x.id === h.want && !x.gone);
        if (l && Math.hypot(l.x - h.x, l.y - (h.y + T.eye), l.z - h.z) < T.grabRange + 1.2) { h.hold = l.id; l.holders.push(h.pid); l.last = h.pid; }
      }
    }
    // revive downed hunters with friends standing close
    if (h.down) {
      let near = 0;
      for (const o of this.hunters.values()) if (o !== h && !o.down && Math.hypot(o.x - h.x, o.z - h.z) < T.reviveRange) near++;
      h.revive = near ? h.revive + dt * near : Math.max(0, h.revive - dt * 0.5);
      if (h.revive >= T.reviveTime) { h.down = false; h.hp = 1; h.revive = 0; h.inv = 2; this.emit({ k: 'rev', pid: h.pid }); }
    }
  }

  useAbility(h) {
    const def = HUNTERS[h.h];
    h.cd = def.cd * this.mul.cool;
    const a = def.ability;
    this.emit({ k: 'ab', pid: h.pid, a, x: r2(h.x), z: r2(h.z) });
    if (a === 'strobe') {
      for (const g of this.ghosts) if (Math.hypot(g.x - h.x, g.z - h.z) < 10 && g.immune <= 0) this.stunGhost(g, h.pid);
    } else if (a === 'turbo') h.turbo = 6;
    else if (a === 'ward') this.wards.push({ x: h.x, z: h.z, t: 8, r: 2.8 });
    else if (a === 'mend') {
      for (const o of this.hunters.values()) if (Math.hypot(o.x - h.x, o.z - h.z) < 6) {
        if (o.down) { o.down = false; o.revive = 0; this.emit({ k: 'rev', pid: o.pid }); }
        o.hp = T.maxHearts; o.inv = 1.5;
      }
    } else if (a === 'lantern') this.revealT = 8;
    else if (a === 'dash') h.dash = 5;
  }

  stunGhost(g, by) {
    if (g.stunT > 0) return;
    g.stunT = g.kind === 'boss' ? T.stunTime * 0.8 : T.stunTime; g.stunAcc = 0; g.mode = 'idle';
    this.emit({ k: 'stun', gid: g.id, by });
  }

  // flashlights stun, vacuums pull
  stepLight(dt) {
    const m = this.mul, standing = this.standing;
    for (const g of this.ghosts) { g.suckers = 0; g.power = 0; g.sx = 0; g.sy = 0; g.sz = 0; g.lit = false; }
    for (const h of this.hunters.values()) {
      if (h.down) continue;
      const ex = h.x, ey = h.y + T.eye, ez = h.z, a = aimVector(h.yaw, h.pitch);
      for (const g of this.ghosts) {
        const dx = g.x - ex, dy = g.y - ey, dz = g.z - ez, d = Math.hypot(dx, dy, dz);
        if (d < 0.01) continue;
        const dot = (dx * a.x + dy * a.y + dz * a.z) / d, ang = Math.acos(Math.min(1, dot));
        const sizeSlack = Math.atan2(g.def.size * 0.5, d);
        if (d < T.lightRange + m.beam && ang < T.lightCone + sizeSlack && g.immune <= 0 && lineClear(this.floor, ex, ez, g.x, g.z)) {
          g.lit = true;
          if (g.stunT <= 0) {
            g.stunAcc += dt * T.stunRate * (1 + m.beam * 0.12) * (g.kind === 'boss' ? 0.45 : 1);
            if (g.stunAcc >= 1) this.stunGhost(g, h.pid);
          }
        }
        if (h.suck && h.hold < 0 && g.stunT > 0 && d < T.suckRange && ang < T.suckCone + sizeSlack) {
          const turbo = h.turbo > 0;
          g.suckers += turbo ? 2 : 1;
          g.power += T.suckPower * m.tank * (turbo ? 2.5 : 1);
          g.sx += ex + a.x * 0.8; g.sy += ey + a.y * 0.8 - 0.25; g.sz += ez + a.z * 0.8;
          g.firstBy = g.firstBy || h.pid;
          (g.byList || (g.byList = new Set())).add(h.pid);
        }
      }
    }
    for (const g of this.ghosts) {
      if (g.stunAcc > 0 && !g.lit) g.stunAcc = Math.max(0, g.stunAcc - dt * 0.6);
      if (!g.suckers) { g.cap = Math.max(0, g.cap - dt * 0.25); g.firstBy = null; g.byList = null; continue; }
      const need = Math.min(g.def.need, Math.max(1, standing));
      const n = g.byList.size;
      const sx = g.sx / n, sy = g.sy / n, sz = g.sz / n;
      if (g.suckers >= need) {
        g.cap += dt * g.power / g.def.hp;
        const k = Math.min(1, dt * (1.2 + g.cap * 3));
        g.x += (sx - g.x) * k * 0.6; g.y += (sy - g.y) * k * 0.6; g.z += (sz - g.z) * k * 0.6;
        if (g.cap >= 1) this.captureGhost(g);
      } else {
        g.needMore = need;
        if (!g.needT || g.needT <= 0) { this.emit({ k: 'need', gid: g.id, n: need, by: [...g.byList] }); g.needT = 2.5; }
      }
    }
  }

  captureGhost(g) {
    const by = [...(g.byList || [])];
    if (g.kind === 'boss' && g.hp > 1) {
      g.hp -= 1; g.cap = 0; g.stunT = 0; g.stunAcc = 0; g.immune = 2.5; g.mode = 'recover'; g.t = 1.5;
      this.emit({ k: 'roar', gid: g.id, hp: g.hp, x: r2(g.x), y: r2(g.y), z: r2(g.z) });
      for (let i = 0; i < 2; i++) this.spawnGhost('wisp', g.x + this.rng.range(-2, 2), g.z + this.rng.range(-2, 2));
      return;
    }
    g.gone = true;
    this.bounty += g.def.bounty;
    if (g.kind === 'boss') this.bossDone = true;
    for (const pid of by) { const h = this.hunters.get(pid); if (h) h.stats.caught += 1 / by.length; }
    this.emit({ k: 'cap', gid: g.id, kind: g.kind, v: g.def.bounty, by, x: r2(g.x), y: r2(g.y), z: r2(g.z) });
  }

  spawnGhost(kind, x, z) {
    if (this.ghosts.length >= 14) return;
    const f = this.floor;
    x = Math.max(0.5, Math.min(f.worldW - 0.5, x)); z = Math.max(0.5, Math.min(f.worldD - 0.5, z));
    this.ghosts.push(this.newGhost(kind, x, z, this.nextGhostId++));
  }

  stepGhost(g, dt) {
    const f = this.floor, def = g.def;
    g.t -= dt; g.immune = Math.max(0, g.immune - dt); g.needT = (g.needT || 0) - dt;
    const bob = Math.sin(performance.now() / 600 + g.id) * 0.15;
    if (g.stunT > 0) {
      g.stunT -= dt;
      if (g.stunT <= 0) {
        if (g.suckers) { g.cap *= 0.5; this.emit({ k: 'free', gid: g.id }); }
        g.immune = 1.2; g.mode = 'recover'; g.t = 0.8;
      }
      if (!g.suckers) { g.vx *= 0.9; g.vz *= 0.9; g.x += g.vx * dt * 0.3; g.z += g.vz * dt * 0.3; g.y += (1.3 + bob * 0.3 - g.y) * dt * 2; }
      return;
    }
    // pick a target: the nearest standing hunter (the gold ghost runs away instead)
    let best = null, bd = def === GHOSTS.boss ? 18 : 11;
    for (const h of this.hunters.values()) {
      if (h.down) continue;
      const d = Math.hypot(h.x - g.x, h.z - g.z);
      if (d < bd) { bd = d; best = h; }
    }
    let tx = g.wx, tz = g.wz, speed = def.speed * 0.4;
    if (g.kind === 'gold') {
      if (best && bd < 8) { const dx = g.x - best.x, dz = g.z - best.z, l = Math.hypot(dx, dz) || 1; tx = g.x + (dx / l) * 4; tz = g.z + (dz / l) * 4; speed = def.speed; }
      else if (g.t <= 0) { g.wx = this.rng.range(1, f.worldW - 1); g.wz = this.rng.range(1, f.worldD - 1); g.t = 3; }
    } else if (g.mode === 'wind') {
      speed = 0; if (g.t <= 0) { g.mode = 'swoop'; g.t = 0.4; }
    } else if (g.mode === 'swoop') {
      g.x += g.vx * dt; g.z += g.vz * dt; g.y += (1.1 - g.y) * dt * 6;
      for (const h of this.hunters.values()) {
        if (h.down || h.inv > 0 || this.inWard(h.x, h.z)) continue;
        if (Math.hypot(h.x - g.x, h.z - g.z) < 0.6 + def.size * 0.45 && def.dmg) this.hitHunter(h, g);
      }
      if (g.t <= 0) { g.mode = 'recover'; g.t = 1.1; }
      this.keepInside(g); return;
    } else if (g.mode === 'recover') {
      speed = def.speed * 0.3; if (best) { tx = g.x + (g.x - best.x); tz = g.z + (g.z - best.z); }
      if (g.t <= 0) g.mode = 'idle';
    } else if (best && def.dmg) {
      tx = best.x; tz = best.z; speed = def.speed;
      if (bd < 2.4 + def.size * 0.5 && !this.inWard(best.x, best.z)) {
        g.mode = 'wind'; g.t = g.kind === 'boss' ? 0.9 : 0.65;
        const dx = best.x - g.x, dz = best.z - g.z, l = Math.hypot(dx, dz) || 1;
        g.vx = (dx / l) * 8.5; g.vz = (dz / l) * 8.5; g.face = Math.atan2(-dx, -dz);
        this.emit({ k: 'wind', gid: g.id });
      }
    } else if (g.t <= 0) {
      g.wx = Math.max(1, Math.min(f.worldW - 1, g.x + this.rng.range(-5, 5))); g.wz = Math.max(1, Math.min(f.worldD - 1, g.z + this.rng.range(-5, 5))); g.t = this.rng.range(2, 4);
    }
    if (g.kind === 'boss') { g.summon -= dt; if (g.summon <= 0) { g.summon = 10; this.spawnGhost('wisp', g.x, g.z); this.emit({ k: 'summon', gid: g.id }); } }
    const dx = tx - g.x, dz = tz - g.z, l = Math.hypot(dx, dz);
    if (l > 0.1 && speed > 0) {
      g.vx += ((dx / l) * speed - g.vx) * Math.min(1, dt * 3); g.vz += ((dz / l) * speed - g.vz) * Math.min(1, dt * 3);
      g.face = Math.atan2(-g.vx, -g.vz);
    } else { g.vx *= 0.9; g.vz *= 0.9; }
    g.x += g.vx * dt; g.z += g.vz * dt;
    g.y += (1.45 + bob + (g.kind === 'boss' ? 0.5 : 0) - g.y) * dt * 3;
    // wards push ghosts out
    for (const w of this.wards) {
      const wx = g.x - w.x, wz = g.z - w.z, wd = Math.hypot(wx, wz);
      if (wd < w.r + def.size * 0.4 && wd > 0.01) { g.x = w.x + (wx / wd) * (w.r + def.size * 0.4); g.z = w.z + (wz / wd) * (w.r + def.size * 0.4); if (g.mode === 'wind') g.mode = 'recover'; }
    }
    // keep ghosts from stacking
    for (const o of this.ghosts) {
      if (o === g || o.gone) continue;
      const ox = g.x - o.x, oz = g.z - o.z, od = Math.hypot(ox, oz), min = (g.def.size + o.def.size) * 0.45;
      if (od < min && od > 0.01) { g.x += (ox / od) * (min - od) * 0.5; g.z += (oz / od) * (min - od) * 0.5; }
    }
    this.keepInside(g);
  }

  keepInside(g) { const f = this.floor; g.x = Math.max(0.4, Math.min(f.worldW - 0.4, g.x)); g.z = Math.max(0.4, Math.min(f.worldD - 0.4, g.z)); }
  inWard(x, z) { return this.wards.some((w) => Math.hypot(x - w.x, z - w.z) < w.r); }

  hitHunter(h, g) {
    h.hp -= g.def.dmg; h.inv = 1.2;
    const dx = h.x - g.x, dz = h.z - g.z, l = Math.hypot(dx, dz) || 1;
    if (h.hold >= 0) { const it = this.loot.find((x) => x.id === h.hold); if (it) { it.holders = it.holders.filter((x) => x !== h.pid); it.vy = 3; } h.hold = -1; }
    this.emit({ k: 'hit', pid: h.pid, dx: r2(dx / l), dz: r2(dz / l), gid: g.id });
    if (h.bot) { h.x += (dx / l) * 1.2; h.z += (dz / l) * 1.2; [h.x, h.z] = collideCircle(this.floor, h.x, h.z, T.playerR); }
    if (h.hp <= 0) { h.hp = 0; h.down = true; h.revive = 0; h.suck = false; this.emit({ k: 'down', pid: h.pid }); }
    g.mode = 'recover'; g.t = 1.2;
  }

  // ---------- valuables: spring to the holders, gravity otherwise, lose value on hard bumps
  stepLoot(dt) {
    const f = this.floor, m = this.mul;
    for (const l of this.loot) {
      if (l.gone) continue;
      const def = LOOT[l.kind];
      l.bumpT = Math.max(0, l.bumpT - dt);
      l.holders = l.holders.filter((pid) => { const h = this.hunters.get(pid); return h && !h.down && h.hold === l.id && Math.hypot(h.x - l.x, h.z - l.z) < T.grabRange + 2.5; });
      for (const h of this.hunters.values()) if (h.hold === l.id && !l.holders.includes(h.pid)) h.hold = -1;
      const n = l.holders.length;
      if (n) {
        let tx = 0, ty = 0, tz = 0;
        const dist = def.weight >= 3 ? 1.9 : T.holdDist;
        for (const pid of l.holders) {
          const h = this.hunters.get(pid), a = aimVector(h.yaw, Math.max(-0.7, Math.min(0.6, h.pitch)));
          tx += h.x + a.x * dist; ty += h.y + T.eye - 0.25 + a.y * dist; tz += h.z + a.z * dist;
        }
        tx /= n; ty /= n; tz /= n;
        const drag = def.weight >= 3 && n < 2;
        if (drag) ty = def.r;
        ty = Math.max(def.r, ty);
        const max = drag ? 1.7 : def.weight > 1 ? 8 : 12;
        let vx = (tx - l.x) * 12, vy = (ty - l.y) * 12, vz = (tz - l.z) * 12;
        const sp = Math.hypot(vx, vy, vz); if (sp > max) { vx *= max / sp; vy *= max / sp; vz *= max / sp; }
        l.vx += (vx - l.vx) * Math.min(1, dt * 10); l.vy += (vy - l.vy) * Math.min(1, dt * 10); l.vz += (vz - l.vz) * Math.min(1, dt * 10);
        const h0 = this.hunters.get(l.holders[0]);
        let dr = h0.yaw - l.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); l.ry += dr * Math.min(1, dt * 4);
      } else {
        l.vy -= T.lootGravity * dt;
      }
      l.x += l.vx * dt; l.y += l.vy * dt; l.z += l.vz * dt;
      let impact = 0;
      if (l.y < def.r) { if (l.vy < -0.5) impact = Math.max(impact, -l.vy); l.y = def.r; l.vy = Math.abs(l.vy) > 1.5 && !n ? -l.vy * 0.25 : 0; if (!n) { l.vx *= 0.82; l.vz *= 0.82; } }
      for (const s of f.solids) {
        const cx = Math.max(s.minx, Math.min(l.x, s.maxx)), cy = Math.max(s.miny, Math.min(l.y, s.maxy)), cz = Math.max(s.minz, Math.min(l.z, s.maxz));
        const dx = l.x - cx, dy = l.y - cy, dz = l.z - cz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= def.r * def.r) continue;
        const d = Math.sqrt(d2) || 1e-4;
        let nx = dx / d, ny = dy / d, nz = dz / d;
        if (d2 < 1e-8) { nx = 0; ny = 1; nz = 0; }
        l.x += nx * (def.r - d); l.y += ny * (def.r - d); l.z += nz * (def.r - d);
        const vn = l.vx * nx + l.vy * ny + l.vz * nz;
        if (vn < 0) {
          impact = Math.max(impact, -vn);
          const bounce = n ? 1.0 : 1.3;
          l.vx -= vn * nx * bounce; l.vy -= vn * ny * bounce; l.vz -= vn * nz * bounce;
          if (ny > 0.7 && !n) { l.vx *= 0.85; l.vz *= 0.85; }
        }
      }
      l.x = Math.max(0.3, Math.min(f.worldW - 0.3, l.x));
      l.z = Math.max(0.3, Math.min(f.worldD + f.cab.d - 0.3, l.z));
      if (impact > T.breakSpeed && l.bumpT <= 0) this.damageLoot(l, impact, m.pad);
      if (impact > 2 && l.bumpT <= 0 && impact <= T.breakSpeed) { this.emit({ k: 'bump', lid: l.id, x: r2(l.x), y: r2(l.y), z: r2(l.z) }); l.bumpT = 0.3; }
      const wasIn = l.inZone;
      l.inZone = inElevator(f, l.x, l.z) && l.y < 2.6;
      if (l.inZone && !wasIn) { this.emit({ k: 'in', lid: l.id, v: l.value, x: r2(l.x), y: r2(l.y), z: r2(l.z) }); if (l.last) { const h = this.hunters.get(l.last); if (h) h.stats.hauled += l.value; } }
      if (!l.inZone && wasIn) { const h = l.last && this.hunters.get(l.last); if (h) h.stats.hauled -= l.value; this.emit({ k: 'out', lid: l.id }); }
    }
  }

  damageLoot(l, speed, padMul) {
    const def = LOOT[l.kind];
    const loss = Math.max(5, Math.round(l.base * def.fragile * (speed - T.breakSpeed) * 0.08 * padMul / 5) * 5);
    l.value -= loss; l.bumpT = 0.35;
    const h = l.last && this.hunters.get(l.last); if (h) h.stats.broken += Math.min(loss, l.value + loss);
    if (l.value < l.base * 0.12) {
      l.gone = true;
      for (const pid of l.holders) { const hh = this.hunters.get(pid); if (hh) hh.hold = -1; }
      l.holders = [];
      this.emit({ k: 'smash', lid: l.id, x: r2(l.x), y: r2(l.y), z: r2(l.z), loss: loss + l.value });
    } else this.emit({ k: 'dmg', lid: l.id, loss, x: r2(l.x), y: r2(l.y), z: r2(l.z) });
  }

  stepCages(dt) {
    for (const c of this.cages) {
      if (c.freed) continue;
      let near = 0;
      for (const h of this.hunters.values()) if (!h.down && Math.hypot(h.x - c.x, h.z - c.z) < 1.9) near++;
      c.prog = near ? Math.min(1, c.prog + dt * near / 3) : Math.max(0, c.prog - dt * 0.2);
      if (c.prog >= 1) { c.freed = true; this.guests.push({ id: c.id, x: c.x, z: c.z + 0.9, safe: false }); this.emit({ k: 'freed', cid: c.id, x: c.x, z: c.z }); }
    }
    for (const g of this.guests) {
      if (g.safe) continue;
      const d = flowDir(this.floor, this.elevFlow, g.x, g.z);
      if (d) { g.x += d.x * 2.4 * dt; g.z += d.z * 2.4 * dt; }
      if (inElevator(this.floor, g.x, g.z) && Math.hypot(g.x - this.floor.elevator.x, g.z - this.floor.elevator.z) < 1.6) {
        g.safe = true; this.saved += 90; this.emit({ k: 'saved', x: r2(g.x), z: r2(g.z), v: 90 });
        let near = null, nd = 1e9; for (const h of this.hunters.values()) { const dd = Math.hypot(h.x - g.x, h.z - g.z); if (dd < nd) { nd = dd; near = h; } }
        if (near) near.stats.saves++;
      }
    }
  }

  // ---------- simple helper hunters for solo play and chumiboy's "friends"
  flowTo(x, z) {
    const { cell } = this.floor.grid;
    const k = Math.floor(x / cell) + ',' + Math.floor(z / cell);
    let ff = this.flowCache.get(k);
    if (!ff) { if (this.flowCache.size > 40) this.flowCache.clear(); ff = flowField(this.floor, x, z); this.flowCache.set(k, ff); }
    return ff;
  }

  stepBot(h, dt) {
    if (h.down) { h.suck = false; h.want = -1; return; }
    const f = this.floor, b = h.bot;
    b.think -= dt;
    if (b.think <= 0) {
      b.think = 0.5 + this.rng.next() * 0.3;
      b.goal = this.botDecide(h);
    }
    const goal = b.goal || { kind: 'idle' };
    let mx = 0, mz = 0, look = null;
    h.suck = false;
    const go = (x, z, near) => {
      if (Math.hypot(x - h.x, z - h.z) < near) return true;
      const d = flowDir(f, this.flowTo(x, z), h.x, h.z);
      if (d) { mx = d.x; mz = d.z; } else { const l = Math.hypot(x - h.x, z - h.z) || 1; mx = (x - h.x) / l; mz = (z - h.z) / l; }
      return false;
    };
    if (goal.kind === 'ghost') {
      const g = this.ghosts.find((x) => x.id === goal.gid);
      if (g) {
        const d = Math.hypot(g.x - h.x, g.z - h.z);
        look = g;
        if (d > 5.5 || !lineClear(f, h.x, h.z, g.x, g.z)) go(g.x, g.z, 3);
        else if (d < 2.5) { mx = (h.x - g.x) / d; mz = (h.z - g.z) / d; }
        h.suck = g.stunT > 0 && d < T.suckRange - 0.5;
      }
      if (h.hold >= 0) h.want = -1;
    } else if (goal.kind === 'loot') {
      const l = this.loot.find((x) => x.id === goal.lid && !x.gone);
      if (l) {
        if (h.hold === l.id) {
          look = { x: f.elevator.x, y: 1.2, z: f.elevator.z };
          if (go(f.elevator.x, f.elevator.z + 0.4, 0.8) || (l.inZone && Math.hypot(l.x - f.elevator.x, l.z - f.elevator.z) < 1.3)) { h.want = -1; b.goal = null; b.think = 0.6; }
          else { look = null; }
        } else {
          look = l;
          if (go(l.x, l.z, 1.4)) h.want = l.id;
        }
      }
    } else if (goal.kind === 'revive') {
      const o = this.hunters.get(goal.pid);
      if (o) go(o.x, o.z, 1.0);
    } else if (goal.kind === 'cage') {
      const c = this.cages.find((x) => x.id === goal.cid); if (c) go(c.x, c.z + 1.2, 0.9);
    } else if (goal.kind === 'follow') {
      const o = this.hunters.get(goal.pid); if (o) go(o.x, o.z, 3);
    } else if (goal.kind === 'elevator') {
      go(f.elevator.x, f.elevator.z, 0.9);
    }
    const sp = T.walk * this.mul.speed * 0.75 * (h.dash > 0 ? 1.4 : 1) * (h.hold >= 0 ? this.carrySlow(h) : 1);
    if (mx || mz) {
      h.x += mx * sp * dt; h.z += mz * sp * dt;
      [h.x, h.z] = collideCircle(f, h.x, h.z, T.playerR);
    }
    // look at the goal, else where we walk
    let tyaw = h.yaw, tpitch = 0;
    if (look) {
      const dx = look.x - h.x, dz = look.z - h.z, dy = (look.y ?? 1) - (h.y + T.eye);
      tyaw = Math.atan2(-dx, -dz); tpitch = Math.atan2(dy, Math.hypot(dx, dz));
    } else if (mx || mz) tyaw = Math.atan2(-mx, -mz);
    let dyaw = tyaw - h.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    h.yaw += dyaw * Math.min(1, dt * 6); h.pitch += (tpitch - h.pitch) * Math.min(1, dt * 6);
    // bots use their ability when it clearly helps
    if (h.cd <= 0 && this.rng.next() < dt * 0.5) {
      const a = HUNTERS[h.h].ability;
      const ghostNear = this.ghosts.some((g) => Math.hypot(g.x - h.x, g.z - h.z) < 6);
      const friendDown = [...this.hunters.values()].some((o) => o.down && Math.hypot(o.x - h.x, o.z - h.z) < 5);
      if ((a === 'strobe' || a === 'ward' || a === 'turbo') && ghostNear) h.abSeq++;
      else if (a === 'mend' && (friendDown || h.hp < 2)) h.abSeq++;
      else if (a === 'lantern' && this.timeLeft < this.floor.time - 20 && this.rng.next() < 0.1) h.abSeq++;
      else if (a === 'dash' && h.hold >= 0) h.abSeq++;
    }
  }

  carrySlow(h) { const l = this.loot.find((x) => x.id === h.hold); if (!l) return 1; const w = LOOT[l.kind].weight; return w >= 3 ? (l.holders.length >= 2 ? 0.7 : 0.4) : w > 1 ? 0.8 : 0.95; }

  botDecide(h) {
    const f = this.floor;
    if (h.hold >= 0) return { kind: 'loot', lid: h.hold };
    for (const o of this.hunters.values()) if (o.down && Math.hypot(o.x - h.x, o.z - h.z) < 22) return { kind: 'revive', pid: o.pid };
    const met = this.collected >= f.quota && this.bossDone;
    if (met) return { kind: 'elevator' };
    let gBest = null, gd = 9;
    for (const g of this.ghosts) {
      const d = Math.hypot(g.x - h.x, g.z - h.z);
      const bonus = g.stunT > 0 ? -3 : 0;
      if (d + bonus < gd && (d < 4 || lineClear(f, h.x, h.z, g.x, g.z))) { gd = d + bonus; gBest = g; }
    }
    if (gBest) return { kind: 'ghost', gid: gBest.id };
    const cage = this.cages.find((c) => !c.freed);
    if (cage && h.slot % 2 === 1) return { kind: 'cage', cid: cage.id };
    let lBest = null, ld = 1e9;
    for (const l of this.loot) {
      if (l.gone || l.inZone) continue;
      const w = LOOT[l.kind].weight;
      if (w >= 3 && l.holders.length === 0 && this.rng.next() < 0.6) continue;
      if (w < 3 && l.holders.length) continue;
      const d = Math.hypot(l.x - h.x, l.z - h.z) + (l.y > 1.2 ? 4 : 0);
      if (d < ld) { ld = d; lBest = l; }
    }
    if (lBest) return { kind: 'loot', lid: lBest.id };
    if (cage) return { kind: 'cage', cid: cage.id };
    if (this.ghosts.length) { const g = this.ghosts[h.slot % this.ghosts.length]; return { kind: 'ghost', gid: g.id }; }
    const lead = [...this.hunters.values()].find((o) => o.ctrl !== 'bot');
    return lead ? { kind: 'follow', pid: lead.pid } : { kind: 'idle' };
  }

  // ---------- floor transitions and shop
  leaveFloor() {
    const col = this.collected;
    this.gold += col;
    this.lastFloor = { n: this.n, type: this.type, collected: col, quota: this.floor.quota };
    this.emit({ k: 'lift', col });
    this.phase = 'lift'; this.liftT = T.liftTime;
  }
  afterLift() {
    if (this.n >= this.tower) return this.finish(true, 'top');
    this.phase = 'shop'; this.shopT = T.shopTime;
    for (const h of this.hunters.values()) { h.ready = 0; h.hold = -1; h.want = -1; }
  }
  stepShop(dt) {
    this.shopT -= dt;
    for (const h of this.hunters.values()) {
      if (h.buySeq > h.lastBuy) { h.lastBuy = h.buySeq; this.buy(h, h.buyItem); }
    }
    const humans = [...this.hunters.values()].filter((h) => h.ctrl !== 'bot');
    const allReady = humans.length > 0 && humans.every((h) => h.ready === this.n + 1);
    if (allReady || this.shopT <= 0) this.startFloor(this.n + 1);
  }
  buy(h, id) {
    const item = SHOP.find((s) => s.id === id);
    if (!item) return;
    const owned = this.up[id] || 0, price = shopPrice(item, id === 'heal' ? 0 : owned);
    if (this.gold < price || owned >= item.max) return;
    this.gold -= price; this.up[id] = owned + 1;
    if (id === 'heal') for (const o of this.hunters.values()) { o.hp = T.maxHearts; o.down = false; }
    this.emit({ k: 'buy', pid: h.pid, item: id });
  }
  lose(reason) { this.finish(false, reason); }
  finish(win, reason) {
    this.phase = win ? 'win' : 'lose';
    this.result = { win, reason, n: this.n, gold: this.gold, stats: [...this.hunters.values()].map((h) => ({ name: h.name, h: h.h, ...h.stats, caught: Math.round(h.stats.caught * 10) / 10 })) };
    this.emit({ k: win ? 'win' : 'lose', reason });
  }

  // ---------- the snapshot sent to guests (and read by the host's own renderer)
  // hunter rows in the snapshot are arrays; HI names each slot (see the export below)
  snapshot() {
    const hs = {};
    for (const h of this.hunters.values()) hs[h.pid] = [h.name, h.h, h.ctrl === 'bot' ? 1 : 0, h.hp, h.down ? 1 : 0, r2(h.cd), h.turbo > 0 ? 1 : 0, r2(h.revive), h.hold, h.slot,
      r2(h.x), r2(h.y), r2(h.z), r2(h.yaw), r2(h.pitch), h.suck ? 1 : 0, h.ready, h.dash > 0 ? 1 : 0];
    return {
      ph: this.phase, n: this.n, tot: this.tower, ty: this.type, seed: this.runSeed, np: this.hunters.size,
      tl: Math.round(this.timeLeft * 10) / 10, col: this.collected, gold: this.gold, up: this.up, rv: r2(this.revealT), dep: r2(this.depart), boss: this.bossDone ? 1 : 0,
      shopT: this.phase === 'shop' ? Math.round(this.shopT) : 0, lf: this.lastFloor || null, res: this.result,
      h: hs,
      g: this.ghosts.map((g) => [g.id, GHOST_KINDS.indexOf(g.kind), r2(g.x), r2(g.y), r2(g.z), r2(g.face), (g.stunT > 0 ? 1 : 0) | (g.suckers ? 2 : 0) | (g.mode === 'wind' ? 4 : 0) | (g.mode === 'swoop' ? 8 : 0) | (g.needMore && g.suckers && g.suckers < g.needMore ? 16 : 0), Math.round(g.cap * 100), g.hp, Math.round(Math.min(1, g.stunAcc) * 100)]),
      l: this.loot.filter((l) => !l.gone).map((l) => [l.id, r2(l.x), r2(l.y), r2(l.z), r2(l.ry), l.value, l.holders.length, l.inZone ? 1 : 0]),
      c: this.cages.map((c) => [c.id, Math.round(c.prog * 100), c.freed ? 1 : 0]),
      gu: this.guests.map((g) => [g.id, r2(g.x), r2(g.z), g.safe ? 1 : 0]),
      w: this.wards.map((w) => [r2(w.x), r2(w.z), r2(w.t), w.r]),
      e: this.events.slice(-30),
    };
  }
}

// slot names for a hunter row in snapshot().h
export const HI = { name: 0, h: 1, bot: 2, hp: 3, down: 4, cd: 5, turbo: 6, revive: 7, hold: 8, slot: 9, x: 10, y: 11, z: 12, yaw: 13, pitch: 14, suck: 15, ready: 16, dash: 17 };
