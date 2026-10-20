import { MAP, heightAt, lineClear, solidDist } from './map.js';

// Behaviour traits (v2.1). The player picks ONE trait per roster look on the setup screen; '' = class default.
// Every trooper runs the same Battlefront II core AI (sim.js); a trait only changes the numbers / extra jobs below.
export const TRAITS = [
  { id: 'rusher', icon: '🏃', name: 'Rusher' },
  { id: 'cover', icon: '🧱', name: 'Cover' },
  { id: 'sniper', icon: '🎯', name: 'Nest' },
  { id: 'retaker', icon: '🔁', name: 'Retaker' },
  { id: 'supplier', icon: '➕', name: 'Supplier' },
  { id: 'mines', icon: '💣', name: 'Mines' },
  { id: 'guard', icon: '🛡️', name: 'Guard' },
];
export const TRAIT = Object.fromEntries(TRAITS.map((t) => [t.id, t]));
export const TRAIT_LONG = { rusher: 'Rusher', cover: 'Cover Fighter', sniper: 'Sniper Nest', retaker: 'Retaker', supplier: 'Supplier', mines: 'Mine Layer', guard: 'Guard' };
// SWBF2 unit types: trooper pushes, assault (heavy) takes cover, scout nests, support/repair supplies
export const CLASS_TRAIT = { trooper: 'rusher', heavy: 'cover', sniper: 'sniper', engineer: 'supplier', commander: 'rusher', jet: 'rusher' };
export const traitOf = (choice, cls) => (TRAIT[choice] ? choice : CLASS_TRAIT[cls] || 'rusher');

// Numbers the sim reads.
//  cover    chance to look for cover when a fight starts (re-rolled every 4 s)
//  coverR   how far (m) it will go for a cover spot
//  hold     seconds it stays in cover / keeps fighting stance after the last enemy sighting
//  fight    move speed multiplier while it has a target (1 = full speed)
//  retakeR  ex-owners this close to a post that falls go back to retake it (SWBF2: 60 m)
const BASE = { cover: 0.5, coverR: 9, hold: 3, fight: 0.5, retakeR: 60 };
export const TRAIT_FX = {
  rusher: { ...BASE, cover: 0.12, coverR: 5, hold: 1.5, fight: 0.85, coverMax: 4 },
  cover: { ...BASE, cover: 1, coverR: 15, hold: 7, fight: 0.25 },
  sniper: { ...BASE, cover: 0.3, coverR: 7, hold: 4, fight: 0.3, nest: true, nestMin: 60, nestMax: 120, nestNear: 14 },
  retaker: { ...BASE, retakeR: 100, retakeHot: true, retakePull: 1 },
  supplier: { ...BASE, heal: true, healR: 6, healHp: 5, seekR: 28 },
  mines: { ...BASE, mines: 3 },
  guard: { ...BASE, cover: 0.7, coverR: 7, hold: 4, fight: 0.4, guard: true },
};

// setup screen save (selection + traits), localStorage 'conquest-commander:setup'
export const LS_SETUP = 'conquest-commander:setup';
// difficulty: SWBF2 menu has Normal + Elite. Old values: easy → normal, normal → normal, hard → elite.
export const DIFFS = ['normal', 'elite'];
export const normDiff = (d) => (d === 'elite' || d === 'hard' ? 'elite' : 'normal');
export function loadSetup(storage = globalThis.localStorage) {
  let d = null; try { d = JSON.parse(storage.getItem(LS_SETUP) || 'null'); } catch (e) { d = null; }
  const out = { v: 1, nation: null, looks: [], enemy: null, diff: 'normal', traits: {}, map: null };   // v2.2: + map (id or null = not picked yet)
  if (!d || typeof d !== 'object') return out;
  if (typeof d.nation === 'string') out.nation = d.nation;
  if (Array.isArray(d.looks)) out.looks = d.looks.filter((x) => typeof x === 'string').slice(0, 6);
  if (typeof d.enemy === 'string') out.enemy = d.enemy;
  out.diff = normDiff(d.diff);
  if (typeof d.map === 'string') out.map = d.map;   // v2.2 map picker (validated by main.js against MAP_LIST)
  if (d.traits && typeof d.traits === 'object') for (const [k, v] of Object.entries(d.traits)) if (TRAIT[v]) out.traits[k] = v;
  return out;
}
export function saveSetup(s, storage = globalThis.localStorage) {
  try { storage.setItem(LS_SETUP, JSON.stringify({ v: 1, nation: s.nation, looks: [...s.looks], enemy: s.enemy, diff: normDiff(s.diff), traits: s.traits, map: s.map || null })); return true; } catch (e) { return false; }
}

// ---------- cover spots ----------
// cover spots beside every rock + wall (SWBF2 cover hint nodes), built once from the map props
// cached per map id so a multi-map build (MAP.id) gets its own spots per map
const COVERS = {};
export function getCover(nav) {
  const key = MAP.id || 'default';
  if (COVERS[key]) return COVERS[key];
  const spots = [], CS = 8, grid = new Map(), cand = [];
  const okAt = (x, z) => Math.abs(x) <= MAP.hx - 3 && Math.abs(z) <= MAP.hz - 3 && !nav.blockedAt(x, z) && solidDist(x, z) <= 2.8;
  // the map is point-mirrored for fairness, so every spot must have a valid twin at (-x, -z)
  const add = (x, z, prop) => { if (!okAt(x, z) || !okAt(-x, -z)) return false; cand.push([x, z, prop]); return true; };
  const keep = (x, z, prop) => {
    if (spots.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < 2.2)) return;
    const sp = { id: spots.length, x, z, prop, by: 0 }; spots.push(sp);
    const k = Math.floor(x / CS) * 1000 + Math.floor(z / CS); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(sp);
  };
  MAP.rocks.forEach((r, i) => { for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; for (const d of [1.3, 1.8, 2.4]) if (add(r.x + Math.cos(a) * (r.r + d), r.z + Math.sin(a) * (r.r + d), i)) break; } });
  MAP.walls.forEach((w, i) => {
    const long = w.hx > w.hz, L = long ? w.hx : w.hz, n = Math.max(2, Math.round(L * 2 / 2.4) + 1);
    for (let k = 0; k < n; k++) { const t = -L + 0.6 + (2 * L - 1.2) * k / (n - 1);
      for (const side of [-1, 1]) for (const d of [1.3, 1.8, 2.4]) { const off = (long ? w.hz : w.hx) + d; if (add(long ? w.x + t : w.x + side * off, long ? w.z + side * off : w.z + t, 1000 + i)) break; } }
  });
  const propAt = (x, z) => { let b = -1, bd = Infinity; MAP.rocks.forEach((r, i) => { const d = Math.hypot(x - r.x, z - r.z) - r.r; if (d < bd) { bd = d; b = i; } }); MAP.walls.forEach((w, i) => { const dx = Math.abs(x - w.x) - w.hx, dz = Math.abs(z - w.z) - w.hz, d = Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0); if (d < bd) { bd = d; b = 1000 + i; } }); return b; };
  for (const [x, z, prop] of cand) { keep(x, z, prop); keep(-x, -z, propAt(-x, -z)); }
  return (COVERS[key] = { spots, grid, CS, mapId: key });
}


// ---------- trait jobs, mixed into Sim.prototype (this = the Sim) ----------
export const TRAIT_AI = {
  // where does this bot walk right now? (every 0.3 s) supply > mines > cover > sniper nest > its post slot
  decide(u, now) {
    const fx = u.tr, fighting = now - u.lastSeen < fx.hold;
    let dest = null;
    if (fx.heal) dest = this.supplyTarget(u);
    if (!dest && u.mines > 0 && u.mode !== 'rally') dest = this.mineTarget(u); else if (u.mines <= 0) u.mineSpot = null;
    if (u.cov) {
      const far = u.post >= 0 && Math.hypot(u.cov.x - this.posts[u.post].x, u.cov.z - this.posts[u.post].z) > Math.max(MAP.postR + 6, fx.coverR + 10);
      const tooLong = now - (u.covAt || now) > (fx.coverMax || Infinity);          // 🏃 Rusher: a short stop, then push on
      if (tooLong) u.coverRollT = now + 6;
      if (!fighting || far || dest || tooLong) this.leaveCover(u); else dest = u.cov;
    } else if (!dest && fighting && u.threat && now >= u.coverRollT && u.mode !== 'rally') {
      u.coverRollT = now + 4;
      if (this.r() < fx.cover) { const sp = this.findCover(u); if (sp) { sp.by = u.id; u.cov = sp; u.covAt = now; u.popT = 0.6; dest = sp; } }
    }
    if (!dest && fx.nest && u.mode !== 'rally') dest = this.nestTarget(u, now);
    else if (!fx.nest || dest) u.atNest = false;
    if (!dest) dest = { x: u.gx, z: u.gz };
    u.mx = dest.x; u.mz = dest.z;
  },
  leaveCover(u) { if (u.cov) { if (u.cov.by === u.id) u.cov.by = 0; u.cov = null; u.inCover = false; u.duck = false; } },
  // a free cover spot near the bot whose prop sits between it and the threat (hidden when crouched, clear shot when up)
  findCover(u) {
    const fx = u.tr, th = u.threat, R = fx.coverR, G = this.cover, P = u.post >= 0 ? this.posts[u.post] : null;
    const lim = P ? (fx.guard ? MAP.postR + 6 : Math.max(Math.hypot(u.x - P.x, u.z - P.z) + 4, MAP.postR + 5)) : Infinity;
    let best = null, bs = Infinity;
    const i0 = Math.floor((u.x - R) / G.CS), i1 = Math.floor((u.x + R) / G.CS), j0 = Math.floor((u.z - R) / G.CS), j1 = Math.floor((u.z + R) / G.CS);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = G.grid.get(i * 1000 + j); if (!list) continue;
      for (const sp of list) {
        if (sp.by && sp.by !== u.id) continue;
        const d = Math.hypot(sp.x - u.x, sp.z - u.z); if (d > R) continue;
        if (P && Math.hypot(sp.x - P.x, sp.z - P.z) > lim) continue;
        const dt = Math.hypot(sp.x - th.x, sp.z - th.z); if (dt > u.s.range * 0.95 || dt < 5) continue;
        const sc = d + this.r() * 2; if (sc >= bs) continue;
        if (lineClear(sp.x, sp.z, th.x, th.z) || !lineClear(sp.x, sp.z, th.x, th.z, sp.prop)) continue;
        bs = sc; best = sp;
      }
    }
    return best;
  },
  // 🎯 Sniper Nest: a long-range spot with a view of its post; held 60-120 s, left early if an enemy gets close
  nestTarget(u, now) {
    const fx = u.tr; if (u.post < 0) { u.nest = null; return null; }
    const P = this.posts[u.post], N = u.nest;
    if (N && N.post === u.post) {
      const close = u.tgt && u.tgt.alive && Math.hypot(u.tgt.x - u.x, u.tgt.z - u.z) < fx.nestNear;
      if (N.until === Infinity && now - N.t0 > 20) N.until = now + N.dur;      // never quite got there: the clock starts anyway
      if (!close && now < N.until) return N;
      if (close && N.until === Infinity && now - N.t0 < 8) return N;           // already on the way to a new nest
      u.nestMoves++;
    }
    const R = Math.max(14, Math.min(36, u.s.range * 0.8)), home = this.nearestOwn(u.team, P.x, P.z), H = home >= 0 && home !== u.post ? this.posts[home] : null;
    let best = null, bs = -Infinity;
    for (let k = 0; k < 18; k++) {
      const a = this.r() * Math.PI * 2, d = R * (0.85 + this.r() * 0.25);
      let x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
      if (Math.abs(x) > MAP.hx - 4 || Math.abs(z) > MAP.hz - 4) continue;
      [x, z] = this.nav.freePoint(x, z);
      if (!lineClear(x, z, P.x, P.z)) continue;
      let sc = heightAt(x, z) * 1.5 - Math.hypot(x - u.x, z - u.z) * 0.12 + this.r() * 3;
      if (H) sc -= Math.hypot(x - H.x, z - H.z) * 0.08;             // stay on our side of the post
      if (N && Math.hypot(x - N.x, z - N.z) < 10) sc -= 30;          // a new spot when moving on
      if (u.tgt && u.tgt.alive && Math.hypot(x - u.tgt.x, z - u.tgt.z) < fx.nestNear + 6) sc -= 30;
      if (sc > bs) { bs = sc; best = { x, z }; }
    }
    if (!best) return null;
    u.nest = { ...best, post: u.post, dur: fx.nestMin + this.r() * (fx.nestMax - fx.nestMin), until: Infinity, t0: now };
    return u.nest;
  },
  // ➕ Supplier: walk to the most hurt ally nearby
  supplyTarget(u) {
    const fx = u.tr; let best = null, bs = Infinity;
    for (const a of this.units) {
      if (!a.alive || a === u || a.team !== u.team || a.hp > a.hpMax * 0.95) continue;
      const d = Math.hypot(a.x - u.x, a.z - u.z); if (d > fx.seekR) continue;
      const sc = a.hp / a.hpMax * 30 + d; if (sc < bs) { bs = sc; best = a; }
    }
    if (!best) return null;
    const d = Math.hypot(best.x - u.x, best.z - u.z) || 1, k = Math.max(0, d - 2.5) / d;
    return { x: u.x + (best.x - u.x) * k, z: u.z + (best.z - u.z) * k };
  },
  // 💣 Mine Layer: at its own post (attacked or defended), plant up to 3 mines on the enemy's way in, 3 m apart
  mineTarget(u) {
    if (u.post < 0) return null;
    const P = this.posts[u.post], t = u.team, T = this.teams[t];
    if (P.owner !== t || Math.hypot(u.x - P.x, u.z - P.z) > 30) { u.mineSpot = null; return null; }
    const attacked = P.n[1 - t] > 0 || this.time - (P['al' + t] || -99) < 30, defended = T.marked ? T.marks[u.post].mark === 'defend' : true;
    if (!attacked && !defended) { u.mineSpot = null; return null; }
    if (u.mineSpot && !this.mines.some((m) => Math.hypot(m.x - u.mineSpot.x, m.z - u.mineSpot.z) < 2.5)) return u.mineSpot;
    if (this.mines.filter((m) => m.team === t && Math.hypot(m.x - P.x, m.z - P.z) < 14).length >= 6) { u.mineSpot = null; return null; }
    // toward the nearest post we don't own (where the enemy comes from)
    let ax = t === 0 ? 1 : -1, az = 0, bd = Infinity;
    for (const q of this.posts) if (q.owner !== t) { const d = Math.hypot(q.x - P.x, q.z - P.z); if (d < bd) { bd = d; ax = (q.x - P.x) / d; az = (q.z - P.z) / d; } }
    for (let k = 0; k < 12; k++) {
      const a = Math.atan2(az, ax) + (this.r() - 0.5) * 2.2, d = 5 + this.r() * 6;
      const [x, z] = this.nav.freePoint(P.x + Math.cos(a) * d, P.z + Math.sin(a) * d);
      if (this.mines.some((m) => Math.hypot(m.x - x, m.z - z) < 3)) continue;
      return (u.mineSpot = { x, z });
    }
    return (u.mineSpot = null);
  },
  plantMine(u) {
    const M = this.cfg.mine, T = this.teams[u.team];
    const own = this.mines.filter((m) => m.team === u.team);
    if (own.length >= M.max) this.mines.splice(this.mines.indexOf(own[0]), 1);   // oldest goes
    this.mines.push({ id: this.nextId++, x: u.mineSpot.x, z: u.mineSpot.z, team: u.team, by: u, t: this.time });
    u.mines--; u.mineSpot = null; u.plantT = 0; T.minesLaid++;
    this.emit({ type: 'mine', team: u.team });
  },
  updateMines() {
    const M = this.cfg.mine;
    for (const m of this.mines) {
      if (this.time - m.t < M.arm) continue;
      let hit = false;
      for (const e of this.units) if (e.alive && e.team !== m.team && (e.x - m.x) ** 2 + (e.z - m.z) ** 2 < M.r * M.r) { hit = true; break; }
      if (!hit) continue;
      m.done = true;
      this.emit({ type: 'boom', x: m.x, z: m.z, y: heightAt(m.x, m.z) + 0.3, team: m.team });
      for (const e of this.units) if (e.alive && e.team !== m.team) { const d = Math.hypot(e.x - m.x, e.z - m.z); if (d < M.splash) { const was = e.alive; this.damage(e, M.dmg * (1 - 0.5 * d / M.splash), m.by); if (was && !e.alive) this.teams[m.team].mineKills++; } }
    }
    this.mines = this.mines.filter((m) => !m.done);
  },
  supplyAura(u, alive, dt) {
    const fx = u.tr;
    // ➕ Supplier: heal-over-time aura for hurt allies close by (+ hands Mine Layers a new mine now and then)
    let healing = null;
    for (const a of alive) {
      if (a === u || a.team !== u.team || (a.x - u.x) ** 2 + (a.z - u.z) ** 2 > fx.healR * fx.healR) continue;
      if (a.hp < a.hpMax) { const h = Math.min(a.hpMax - a.hp, fx.healHp * dt); a.hp += h; this.teams[u.team].healed += h; u.healed = (u.healed || 0) + h; healing ||= a; }
      if (a.tr.mines && a.mines < a.tr.mines && (a.resT = (a.resT || 0) + dt) > 15) { a.resT = 0; a.mines++; }
    }
    if (healing && (u.healT -= dt) <= 0) { u.healT = 0.8; this.emit({ type: 'heal', team: u.team, x0: u.x, z0: u.z, x1: healing.x, z1: healing.z, y0: heightAt(u.x, u.z) + 1.2, y1: heightAt(healing.x, healing.z) + 1.2 }); }
  },
};
