// Conquest simulation (SWBF2-style rules): posts, capture, tickets, bleed, last stand, 20 s hold-all victory,
// class mix (min/max per team), CP + auto waves, bots, combat, commander AI, per-team perks.
// v2.1: Battlefront II bot AI. Every trooper is an individual bot: it picks its own post (commander marks split the
// team by weight like SWBF2 AddAIGoal; no marks = nearest unowned post), retakes a fallen post within 60 m, shoots only
// what it can see, uses cover spots beside rocks + walls (crouch, pop up to shoot), never retreats (no morale).
// A behaviour trait per look (traits.js) changes the numbers and adds jobs (nest, heal, mines, guard).
// Squads are bookkeeping only (spawn slots + the 💀 alert); movement is per unit.
// Pure logic (no three.js, no DOM), fixed time step, so it can be fast-forwarded in tests.
import { MAP, setMap, heightAt, lineClear } from './map.js';
import { Nav } from './nav.js';
import { statsOf, mulberry32, CLASSES } from './data.js';
import { perkMods } from './perks.js';
import { TRAIT_FX, traitOf, normDiff, TRAIT_AI, getCover } from './traits.js';
import { PICKUPS } from './pickups.js';                 // ❤️/📦 packs + magazines (ON by default; ?pickups=0 turns off)

export const CFG = {
  dt: 0.05,
  tickets: 200, live: 20, squadSize: 4,
  startCP: 1500, cpBase: 140, cpPerPost: 40, cpEvery: 5,
  bleedEvery: 5, waveEvery: 10,
  capTime: 10, capMaxMult: 3, regen: 0.05,
  victoryHold: 20, timeLimit: 1200,
  // SWBF2 conquest template: AI class min / max per team
  classes: { trooper: [9, 25], heavy: [1, 4], engineer: [1, 4], sniper: [1, 4], commander: [1, 4], jet: [1, 4] },
  unlockPosts: 2,            // commander + jet join once the team has held this many posts (Elite perk: from the start)
  aiEvery: { normal: 6, elite: 4 },
  // enemy brain (SWBF2 menu: Normal / Elite). Elite = better aim (snipers most) + slightly faster fire.
  diff: { normal: { acc: 1, sniperAcc: 1, rof: 1 }, elite: { acc: 1.15, sniperAcc: 1.4, rof: 0.88 } },
  retakeT: 40,               // a retake order lasts up to 40 s (or until the post is fully yours again)
  mine: { dmg: 70, r: 1.8, splash: 3.2, max: 12, arm: 1, plant: 1.2 },
};
export const MARKS = ['attack', 'defend', 'ignore'];
const LOCKABLE = ['commander', 'jet'];

// v2.2 maps: nav grid + cover spots are built once per map (cached by MAP.id) and picked up on map switch
const NAVS = {};
export const getNav = () => (NAVS[MAP.id] ||= new Nav());
export { getCover };   // cover spots (per map id): traits.js

export class Sim {
  // teams: [{ nation, looks:[look], perks:[ids] }, …]  (team 0 = player / blue, team 1 = enemy / red)
  constructor({ teams, difficulty = 'normal', seed = 1, cfg = {}, map = null }) {
    if (map) setMap(map);                                  // v2.2: optional map id (else the active map)
    this.map = MAP.id;
    this.cfg = { ...CFG, ...(MAP.cfg || {}), ...cfg };     // map overrides (big map: tickets, live, time limit), then the caller's
    const C = this.cfg;
    this.rng = mulberry32(seed);
    this.nav = getNav(); this.cover = getCover(this.nav);
    for (const sp of this.cover.spots) sp.by = 0;
    this.difficulty = normDiff(difficulty);   // old 'easy' → 'normal'
    this.time = 0; this.over = null; this.events = []; this.nextId = 1; this.mines = [];
    this.posts = MAP.posts.map((p) => ({ ...p, value: p.value || 1, ctrl: p.owner === 0 ? 1 : p.owner === 1 ? -1 : 0, n: [0, 0], flipT: -99 }));
    this.units = [];
    this.autoCmd = [false, true];   // team 1 always runs the commander AI; team 0 only when asked (tests / demo)
    this.teams = teams.map((t, i) => {
      const perks = (t.perks || []).slice(), mods = perkMods(perks);
      return {
        idx: i, nation: t.nation, perks, mods, looks: t.looks.map((l) => { const stats = statsOf(l.gear || l.st); return { ...l, stats, trait: traitOf(l.trait, stats.cls), traitPick: l.trait || '' }; }),
        marked: false, healed: 0, minesLaid: 0, mineKills: 0, retakes: 0,
        live: mods.live ? C.live + mods.live - CFG.live : C.live, tickets: C.tickets + mods.tickets, cp: C.startCP + mods.cp, rally: null,   // v2.2: 👥 Bigger Army = +4 over the map's live count (20 → 24, 32 → 36)
        marks: this.posts.map(() => ({ mark: 'attack', stars: 1 })),
        squads: [], slots: [], plan: [], cursor: {}, kills: 0, losses: 0, spawned: 0, cpEarned: 0, bled: 0,
        unlocked: mods.elite, heldMax: 0, holdT: null, lastStand: false,
        cpT: C.cpEvery, bleedT: C.bleedEvery, waveT: C.waveEvery * mods.waveMul, aiT: 0,
      };
    });
    if (this.teams[0].mods.garrison && this.teams[1].mods.garrison) this.teams[1].mods.garrison = false; // only one side can hold B at the start
    for (const T of this.teams) this.teams[1 - T.idx].tickets -= T.mods.sabotage;
    for (const T of this.teams) {
      T.plan = this.makePlan(T);
      T.slots = T.plan.map(() => null);
      const nSq = Math.ceil(T.live / C.squadSize);
      for (let k = 0; k < nSq; k++) T.squads.push({ id: k, team: T.idx, members: [], size: Math.min(C.squadSize, T.live - k * C.squadSize), wiped: false });
    }
    // garrison perk: the middle post starts yours with 4 guards (the first 4 slots) told to hold it
    const mid = this.posts.reduce((a, p) => (p.owner === -1 && (!a || p.value > a.value) ? p : a), null);
    for (const T of this.teams) if (T.mods.garrison && mid) { mid.owner = T.idx; mid.ctrl = T.idx === 0 ? 1 : -1; T.garrison = this.posts.indexOf(mid); }
    for (const T of this.teams) this.defaultMarks(T);
    // opening: every slot filled at the home post (garrison at the middle post), free
    for (const T of this.teams) {
      const home = this.posts.find((p) => p.owner === T.idx && p.home && p !== mid) || this.posts.find((p) => p.owner === T.idx && p !== mid) || this.posts.find((p) => p.owner === T.idx);
      T.slots.forEach((_, i) => { const g = T.garrison != null && i < C.squadSize; const u = this.spawnUnit(T, i, g ? this.posts[T.garrison] : home, true); if (u && g) u.hold = T.garrison; });
      this.assign(T, true);
    }
  }
  r() { return this.rng(); }
  emit(e) { if (this.events.length < 600) this.events.push(e); }
  other(t) { return 1 - t; }
  alive(t) { let n = 0; for (const u of this.units) if (u.alive && u.team === t) n++; return n; }

  // ---------- class mix: fill the minimums, then random up to the live cap, respecting maximums ----------
  classCaps(T) {
    const caps = {}; for (const c of CLASSES) caps[c] = [...this.cfg.classes[c]];
    if (T.mods.elite) for (const c of LOCKABLE) caps[c][1] += 2;
    const have = new Set(T.looks.map((l) => l.stats.cls));
    for (const c of CLASSES) if (c !== 'trooper' && !have.has(c)) { caps.trooper[0] += caps[c][0]; caps[c] = [0, 0]; } // missing class → its slots go to troopers
    return caps;
  }
  makePlan(T) {
    const caps = this.classCaps(T), plan = [], count = {};
    for (const c of CLASSES) { count[c] = 0; for (let k = 0; k < caps[c][0] && plan.length < T.live; k++) { plan.push(c); count[c]++; } }
    while (plan.length < T.live) {
      const open = CLASSES.filter((c) => count[c] < caps[c][1]);
      const bag = open.flatMap((c) => (c === 'trooper' ? [c, c, c] : [c]));
      const c = bag.length ? bag[(this.r() * bag.length) | 0] : 'trooper';
      plan.push(c); count[c]++;
    }
    for (let i = plan.length - 1; i > 0; i--) { const j = (this.r() * (i + 1)) | 0; [plan[i], plan[j]] = [plan[j], plan[i]]; } // spread specialists over squads
    return plan;
  }
  lookFor(T, cls) {
    let list = T.looks.filter((l) => l.stats.cls === cls);
    if (!list.length) list = T.looks.filter((l) => l.stats.cls === 'trooper');
    if (!list.length) list = T.looks;
    const k = T.cursor[cls] = ((T.cursor[cls] ?? -1) + 1) % list.length;
    return list[k];
  }

  // ---------- marks ----------
  defaultMarks(T) {
    this.posts.forEach((p, i) => { T.marks[i] = p.owner === T.idx ? { mark: 'defend', stars: 1 } : { mark: 'attack', stars: 2 }; });
  }
  setMark(t, i, mark, stars) {
    const T = this.teams[t], m = T.marks[i]; if (!m) return;
    if (mark && MARKS.includes(mark)) m.mark = mark;
    if (stars != null) m.stars = Math.max(1, Math.min(3, stars | 0));
    T.marked = true;                                  // from now on the marks split the team (SWBF2 AddAIGoal weights)
    for (const u of this.units) if (u.team === t) u.hold = -1; // the commander's marks override garrison orders
    this.assign(T, true);
  }
  setRally(t, x, z) {
    const T = this.teams[t];
    if (x == null) { T.rally = null; for (const u of this.units) if (u.alive && u.team === t && u.mode === 'rally') { u.mode = 'go'; this.giveSlot(u); } return; }
    const [fx, fz] = this.nav.freePoint(Math.max(-MAP.hx + 3, Math.min(MAP.hx - 3, x)), Math.max(-MAP.hz + 3, Math.min(MAP.hz - 3, z)));
    T.rally = { x: fx, z: fz };
    for (const u of this.units) if (u.alive && u.team === t && u.post < 0 && u.mode !== 'rally') this.giveSlot(u);
  }
  // goal weight of post i. Marked: the commander's marks. Unmarked (auto): nearest unowned post first (for spawns + camera).
  weight(T, i) {
    const p = this.posts[i], own = p.owner === T.idx, threatened = own && p.n[this.other(T.idx)] > 0;
    if (!T.marked) {
      if (own) return threatened ? 1 : 0.3;
      const near = this.autoTargets(T)[0];
      return near === i ? 1 : 0.5;
    }
    const m = T.marks[i];
    if (m.mark === 'ignore') return 0;
    if (m.mark === 'attack') return m.stars * (own && !threatened ? 0.35 : 1);
    return m.stars * (own || threatened ? 1 : 0.6);
  }
  // unowned posts, nearest to the team's own posts (or its map side) first, ties by value
  autoTargets(T) {
    const t = T.idx, ours = this.posts.filter((p) => p.owner === t);
    const dist = (p) => ours.length ? Math.min(...ours.map((q) => Math.hypot(q.x - p.x, q.z - p.z))) : Math.abs(p.x - (t === 0 ? -MAP.hx : MAP.hx));
    return this.posts.map((p, i) => i).filter((i) => this.posts[i].owner !== t).sort((a, b) => (dist(this.posts[a]) - dist(this.posts[b])) || (this.posts[b].value - this.posts[a].value));
  }
  // auto goal for one bot (SWBF2 Conquest goal): the nearest post its team doesn't own; equal distance → higher value
  autoGoal(T, u) {
    const t = T.idx, P = this.posts; let best = -1, bs = Infinity;
    const pick = (f) => { for (let i = 0; i < P.length; i++) if (f(P[i])) { const s = Math.hypot(P[i].x - u.x, P[i].z - u.z) - P[i].value * 3; if (s < bs) { bs = s; best = i; } } };
    pick((p) => p.owner !== t);
    if (best < 0) pick((p) => p.n[1 - t] > 0);   // everything is ours: go where the enemy is
    if (best < 0) pick(() => true);              // …or hold the nearest post
    return best;
  }
  nearestOwn(t, x, z) { let b = -1, bd = Infinity; this.posts.forEach((p, i) => { if (p.owner !== t) return; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = i; } }); return b; }

  // ---------- bots → posts, one by one (no squad movement) ----------
  // Fixed jobs first (retake, garrison hold, 🛡️ Guard), then the rest is split over the marked posts by weight
  // (quota per post = its share of the total weight, largest remainder), nearest bot-post pairs first.
  assign(T, force) {
    const t = T.idx, P = this.posts, free = [];
    const setPost = (u, i) => { const ch = u.post !== i; u.post = i; if ((ch || force) && u.mode !== 'rally') this.giveSlot(u); };
    for (const u of this.units) {
      if (!u.alive || u.team !== t) continue;
      if (u.retake) {
        const p = P[u.retake.i];
        if (this.time > u.retake.until || (p.owner === t && Math.abs(p.ctrl) > 0.999 && !p.n[1 - t])) u.retake = null;
        else { setPost(u, u.retake.i); continue; }
      }
      if (u.hold >= 0) { setPost(u, u.hold); continue; }
      if (u.tr.guard) {
        let g = u.guardPost; if (g == null || g < 0 || P[g].owner !== t) g = u.guardPost = this.nearestOwn(t, u.x, u.z);
        if (g >= 0) { setPost(u, g); continue; }
      }
      free.push(u);
    }
    if (!T.marked) { for (const u of free) setPost(u, this.autoGoal(T, u)); return; }
    const w = P.map((_, i) => this.weight(T, i)), W = w.reduce((a, b) => a + b, 0);
    if (!W) { for (const u of free) setPost(u, -1); return; }
    const n = free.length, q = w.map((x) => x / W * n), quota = q.map(Math.floor);
    let left = n - quota.reduce((a, b) => a + b, 0);
    for (const i of P.map((_, i) => i).sort((a, b) => (q[b] - quota[b]) - (q[a] - quota[a]) || w[b] - w[a])) if (left > 0 && w[i] > 0) { quota[i]++; left--; }
    const out = new Map(), d = (u, i) => Math.hypot(P[i].x - u.x, P[i].z - u.z);
    if (!force) for (const u of free.filter((u) => u.post >= 0 && w[u.post] > 0).sort((a, b) => d(a, a.post) - d(b, b.post))) if (quota[u.post] > 0) { quota[u.post]--; out.set(u, u.post); }
    const pairs = [];
    for (const u of free) if (!out.has(u)) for (let i = 0; i < P.length; i++) if (quota[i] > 0) pairs.push([d(u, i) - P[i].value * 2, u, i]);
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [, u, i] of pairs) if (!out.has(u) && quota[i] > 0) { quota[i]--; out.set(u, i); }
    for (const u of free) setPost(u, out.has(u) ? out.get(u) : -1);
  }
  giveSlot(u) {
    let gx, gz;
    if (u.post >= 0) {
      const p = this.posts[u.post], a = this.r() * Math.PI * 2, d = Math.sqrt(this.r()) * MAP.postR * (u.tr.guard ? 0.6 : 0.7);
      gx = p.x + Math.cos(a) * d; gz = p.z + Math.sin(a) * d;
    } else {
      const R = this.teams[u.team].rally;
      gx = (R ? R.x : u.x) + (this.r() - 0.5) * 6; gz = (R ? R.z : u.z) + (this.r() - 0.5) * 6;
    }
    [u.gx, u.gz] = this.nav.freePoint(gx, gz);
    u.path = null; u.repath = 0;
  }
  // a post fell (neutralized): ex-owners close enough go back to retake it (SWBF2: within 60 m; 🔁 Retaker: 100 m)
  postFell(i, t, hot = false) {
    const p = this.posts[i]; let n = 0;
    for (const u of this.units) {
      if (!u.alive || u.team !== t || (hot && !u.tr.retakeHot)) continue;
      if (Math.hypot(u.x - p.x, u.z - p.z) > u.tr.retakeR) continue;
      if (!u.retake || u.retake.i !== i) n++;
      u.retake = { i, until: this.time + this.cfg.retakeT };
    }
    if (n) { this.teams[t].retakes += n; this.emit({ type: 'retake', team: t, post: p.id, n }); }
    return n;
  }

  // ---------- spawning (owned posts only; a post stays a spawn point until it is neutralized) ----------
  spawnPost(T) {
    const own = this.posts.filter((p) => p.owner === T.idx);
    if (!own.length) return null;
    let tx, tz;
    if (T.rally) { tx = T.rally.x; tz = T.rally.z; }
    else { let bi = -1, bw = 0; this.posts.forEach((p, i) => { const w = this.weight(T, i); if (w > bw) { bw = w; bi = i; } }); const q = bi >= 0 ? this.posts[bi] : own[0]; tx = q.x; tz = q.z; }
    // prefer a quiet post: a post under attack is only used when it is the closest by far
    return own.reduce((a, b) => ((Math.hypot(a.x - tx, a.z - tz) + (a.n[1 - T.idx] ? 60 : 0)) <= (Math.hypot(b.x - tx, b.z - tz) + (b.n[1 - T.idx] ? 60 : 0)) ? a : b));
  }
  spawnUnit(T, slot, post, free = false) {
    const planCls = T.plan[slot];
    const cls = LOCKABLE.includes(planCls) && !T.unlocked ? 'trooper' : planCls;
    const look = this.lookFor(T, cls);
    if (!free) { if (T.cp < look.stats.cost) { T.cursor[cls]--; return null; } T.cp -= look.stats.cost; }
    const a = this.r() * Math.PI * 2, d = 1.5 + this.r() * 4;
    const [x, z] = this.nav.freePoint(post.x + Math.cos(a) * d, post.z + Math.sin(a) * d);
    const sq = T.squads[Math.floor(slot / this.cfg.squadSize)];
    const s = look.stats, hpMax = s.hp * T.mods.hpMul, tr = TRAIT_FX[look.trait], u = {
      id: this.nextId++, team: T.idx, squad: sq.id, slot, look: T.looks.indexOf(look), cls: s.cls, planCls, s, trait: look.trait, tr,
      hp: hpMax, hpMax, x, z, yaw: T.idx === 0 ? Math.PI / 2 : -Math.PI / 2, alive: true, deadT: 0, hurtT: 0,
      gx: x, gz: z, mx: x, mz: z, path: null, pgx: x, pgz: z, repath: 0, think: this.r() * 0.3, fireT: this.r() * s.rof, tgt: null,
      mode: T.rally && !free ? 'rally' : 'go', moving: false, phase: this.r() * 6, kills: 0, firing: 0, born: this.time,
      post: -1, hold: -1, retake: null, guardPost: null, cov: null, inCover: false, duck: false, crouch: false, popT: 0, coverRollT: 0,
      lastSeen: -99, threat: null, nest: null, atNest: false, nestMoves: 0, mines: tr.mines || 0, mineSpot: null, plantT: 0, healT: 0,
      shots: 0, hits: 0, coverT: 0,
    };
    this.units.push(u); T.slots[slot] = u;
    sq.members = sq.members.filter((m) => m.alive); sq.members.push(u); sq.wiped = false; T.spawned++;
    if (u.mode === 'rally') { [u.gx, u.gz] = this.nav.freePoint(T.rally.x + (this.r() - 0.5) * 5, T.rally.z + (this.r() - 0.5) * 5); }
    return u;
  }
  wave(T) {
    if (T.tickets <= 0 || T.lastStand) return 0;
    const post = this.spawnPost(T); if (!post) return 0;
    let n = 0;
    for (let i = 0; i < T.slots.length; i++) {
      if (T.slots[i] && T.slots[i].alive) continue;
      if (this.alive(T.idx) >= T.tickets) break;          // never field more units than tickets left
      if (!this.spawnUnit(T, i, post)) break;
      n++;
    }
    if (n) { this.assign(T, false); this.emit({ type: 'wave', team: T.idx, post: post.id, n }); }
    return n;
  }

  // ---------- commander AI (same marks as the player) ----------
  commander(T) {
    const t = T.idx, o = this.other(t); T.marked = true;
    const owned = this.posts.map((p) => p.owner === t), nOwn = owned.filter(Boolean).length;
    let changed = false;
    const set = (i, mark, stars) => { const m = T.marks[i]; if (m.mark !== mark || m.stars !== stars) { m.mark = mark; m.stars = stars; changed = true; } };
    const targets = this.autoTargets(T), weak = this.alive(t) < T.live * 0.5;   // thin ranks → dig in at home
    this.posts.forEach((p, i) => {
      if (owned[i]) {
        const front = this.posts.some((q, j) => !owned[j] && Math.hypot(q.x - p.x, q.z - p.z) < (MAP.frontR || 90));
        set(i, 'defend', p.n[o] > 0 || nOwn === 1 ? 3 : front ? 2 : 1);
      } else if (i === targets[0]) { if (weak && nOwn) set(i, 'ignore', 1); else set(i, 'attack', nOwn * 2 > this.posts.length ? 2 : 3); }   // bleeding them → don't overreach
      else set(i, nOwn >= 2 ? 'attack' : 'ignore', 1);   // second targets only once we hold 2 posts (no lone runners across the map)
    });
    if (changed) this.assign(T, false);
  }

  // ---------- main step ----------
  step(dt = this.cfg.dt) {
    if (this.over) return;
    this.time += dt;
    const C = this.cfg;
    for (const T of this.teams) if (this.autoCmd[T.idx] && (T.aiT -= dt) <= 0) { T.aiT = C.aiEvery[T.idx === 1 ? this.difficulty : 'normal'] || 6; this.commander(T); }
    if (this.mines.length) this.updateMines();
    this.capture(dt);
    this.updateUnits(dt);
    if (PICKUPS.on) PICKUPS.step(this, dt);
    this.updateShots(dt);
    for (const T of this.teams) {
      // last stand: tickets ≤ units on the field → no more bleed against this side and no more respawns
      const ls = T.tickets <= this.alive(T.idx);
      if (ls && !T.lastStand) this.emit({ type: 'lastStand', team: T.idx });
      if (ls) T.lastStand = true;
    }
    for (const T of this.teams) {
      const owned = this.posts.filter((p) => p.owner === T.idx), O = this.teams[this.other(T.idx)];
      T.heldMax = Math.max(T.heldMax, owned.length);
      if (!T.unlocked && T.heldMax >= C.unlockPosts) { T.unlocked = true; this.emit({ type: 'unlock', team: T.idx }); }
      if ((T.cpT -= dt) <= 0) { T.cpT += C.cpEvery; const g = C.cpBase + C.cpPerPost * owned.length; T.cp += g; T.cpEarned += g; }
      // majority of posts → enemy bleeds (by the value difference of held posts)
      if ((T.bleedT -= dt) <= 0) {
        T.bleedT += C.bleedEvery;
        if (owned.length * 2 > this.posts.length && !O.lastStand && O.tickets > 0) {
          const mine = owned.reduce((a, p) => a + p.value, 0), theirs = this.posts.filter((p) => p.owner === O.idx).reduce((a, p) => a + p.value, 0);
          const b = Math.max(1, mine - theirs); O.tickets = Math.max(0, O.tickets - b); O.bled += b;
        }
      }
      if ((T.waveT -= dt) <= 0) { T.waveT += C.waveEvery * T.mods.waveMul; this.wave(T); }
      // hold every post → victory countdown, cancelled as soon as one is neutralized
      if (owned.length === this.posts.length) {
        if (T.holdT == null) { T.holdT = C.victoryHold; this.emit({ type: 'countdown', team: T.idx }); }
        T.holdT -= dt;
      } else if (T.holdT != null) { T.holdT = null; this.emit({ type: 'countdownStop', team: T.idx }); }
    }
    if (Math.floor(this.time / 2) !== Math.floor((this.time - dt) / 2)) for (const T of this.teams) this.assign(T, false);
    this.units = this.units.filter((u) => u.alive || (u.deadT += dt) < 3.5);
    this.checkWin();
  }
  capture(dt) {
    const C = this.cfg, R2 = MAP.postR * MAP.postR;
    for (const p of this.posts) {
      p.n[0] = p.n[1] = 0;
      for (const u of this.units) if (u.alive && (u.x - p.x) ** 2 + (u.z - p.z) ** 2 < R2) p.n[u.team]++;
      const prevOwner = p.owner;
      if (p.n[0] && p.n[1]) { /* contested: stalls */ }
      else if (p.n[0] || p.n[1]) {
        const t = p.n[0] ? 0 : 1, n = p.n[t];
        p.ctrl += (t === 0 ? 1 : -1) * Math.min(C.capMaxMult, n) * this.teams[t].mods.capMul / C.capTime * dt;
      } else { const home = p.owner === 0 ? 1 : p.owner === 1 ? -1 : 0; p.ctrl += Math.sign(home - p.ctrl) * Math.min(Math.abs(home - p.ctrl), C.regen * dt); }
      p.ctrl = Math.max(-1, Math.min(1, p.ctrl));
      // red → neutral → yours: an enemy post must be neutralized (ctrl crosses 0) before it can be captured
      if (p.owner === -1) { if (p.ctrl >= 1) p.owner = 0; else if (p.ctrl <= -1) p.owner = 1; }
      else if ((p.owner === 0 && p.ctrl <= 0) || (p.owner === 1 && p.ctrl >= 0)) { p.owner = -1; p.ctrl = 0; }
      if (p.owner !== prevOwner) {
        p.flipT = this.time;
        this.emit({ type: p.owner === -1 ? 'neutral' : 'captured', post: p.id, team: p.owner, from: prevOwner });
        if (p.owner === -1 && prevOwner >= 0) this.postFell(this.posts.indexOf(p), prevOwner);
        for (const T of this.teams) this.assign(T, false);
      }
      for (const t of [0, 1]) if (p.owner === t && p.n[1 - t] > 0 && this.time - (p['al' + t] || -99) > 10) {
        p['al' + t] = this.time; this.emit({ type: 'contested', post: p.id, team: t });
        if (this.postFell(this.posts.indexOf(p), t, true)) this.assign(this.teams[t], false);   // 🔁 Retakers also answer an attacked post
      }
    }
  }
  // can u see e? Line of sight is blocked by rocks + walls, except the cover prop of a bot that is popped up over it.
  sees(u, e) { return lineClear(u.x, u.z, e.x, e.z, u.cov ? u.cov.prop : -1, e.cov && e.inCover && !e.duck ? e.cov.prop : -1); }
  updateUnits(dt) {
    const alive = this.units.filter((u) => u.alive), now = this.time;
    this.pending = [];
    for (const u of alive) {
      u.hurtT = Math.max(0, u.hurtT - dt); u.firing = Math.max(0, u.firing - dt);
      const fx = u.tr;
      if ((u.think -= dt) <= 0) {
        u.think = 0.3;
        // target: only what it can see; nearest first, a small bonus for the one it already shoots (no flicker)
        let best = null, bs = u.s.range * u.s.range;
        for (const e of alive) {
          if (e.team === u.team) continue;
          const d = (e.x - u.x) ** 2 + (e.z - u.z) ** 2, sc = e === u.tgt ? d * 0.75 : d;
          if (sc < bs && this.sees(u, e)) { bs = sc; best = e; }
        }
        u.tgt = best;
        if (best) { u.lastSeen = now; u.threat = { x: best.x, z: best.z }; }
        if (u.mode === 'rally') { const R = this.teams[u.team].rally; if (!R || Math.hypot(u.x - R.x, u.z - R.z) < 4) { u.mode = 'go'; this.giveSlot(u); } }
        this.decide(u, now);
      }
      const tg = u.tgt && u.tgt.alive ? u.tgt : null;
      // cover: crouch behind the prop, pop up to shoot (duck ~1.2 s / pop ~1.6 s while there is a target)
      u.inCover = !!u.cov && Math.hypot(u.cov.x - u.x, u.cov.z - u.z) < 1;
      if (u.inCover) {
        u.coverT += dt;
        if (!tg) u.duck = true;
        else if ((u.popT -= dt) <= 0) { u.duck = !u.duck; u.popT = u.duck ? 0.9 + this.r() * 0.6 : 1.3 + this.r() * 0.6; }
      } else u.duck = false;
      u.atNest = !!u.nest && Math.hypot(u.nest.x - u.x, u.nest.z - u.z) < 1.8;
      if (u.atNest && u.nest.until === Infinity) u.nest.until = now + u.nest.dur;   // the nest timer starts on arrival
      u.crouch = u.duck || (u.atNest && !tg);
      if ((u.fireT -= dt) <= 0 && tg && !u.duck && (!PICKUPS.on || PICKUPS.shoot(this, u))) { u.fireT = u.s.rof * this.rofMul(u) * (0.85 + 0.3 * this.r()); this.fire(u, tg); }
      // mine laying: stand still on the spot for a moment
      if (u.mineSpot && Math.hypot(u.mineSpot.x - u.x, u.mineSpot.z - u.z) < 0.9) { if ((u.plantT += dt) >= this.cfg.mine.plant) this.plantMine(u); }
      else u.plantT = 0;
      const limp = u.hp < u.hpMax * 0.35;
      const dg = Math.hypot(u.mx - u.x, u.mz - u.z);
      u.moving = false;
      if (dg > 0.8 && !u.plantT) {
        if (!u.path || (u.repath -= dt) <= 0 || Math.hypot(u.pgx - u.mx, u.pgz - u.mz) > 1.5) { u.path = this.nav.findPath(u.x, u.z, u.mx, u.mz); u.pgx = u.mx; u.pgz = u.mz; u.repath = 4 + this.r() * 2; }
        let wp = u.path[0];
        while (wp && Math.hypot(wp.x - u.x, wp.z - u.z) < 0.6 && u.path.length > 1) { u.path.shift(); wp = u.path[0]; }
        if (wp) {
          const toCover = u.cov && !u.inCover;   // dash for cover
          const sp = u.s.speed * (limp ? 0.55 : 1) * (tg && !toCover ? fx.fight : toCover ? 0.9 : 1);
          const dx = wp.x - u.x, dz = wp.z - u.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, sp * dt);
          if (st > 1e-4) {
            this.tryMove(u, dx / d * st, dz / d * st);
            if (!tg) u.yaw = turn(u.yaw, Math.atan2(dx, dz), dt * 8);
            u.moving = true; u.phase += dt * sp * (limp ? 1.2 : 2.2);
          }
        }
      }
      if (tg) u.yaw = turn(u.yaw, Math.atan2(tg.x - u.x, tg.z - u.z), dt * 10);
      else if (u.atNest && u.post >= 0) { const p = this.posts[u.post]; u.yaw = turn(u.yaw, Math.atan2(p.x - u.x, p.z - u.z), dt * 4); }  // nest: face out over the post
      if (fx.heal) this.supplyAura(u, alive, dt);
    }
    for (const [e, amt, by] of this.pending) this.damage(e, amt, by);
    this.pending = [];
    // separation (spatial hash keeps 20v20+ cheap)
    const CS = 1.2, cells = new Map(), key = (i, j) => i * 1000 + j;
    for (const a of alive) { a._ci = Math.floor(a.x / CS); a._cj = Math.floor(a.z / CS); const k = key(a._ci, a._cj); let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(a); }
    for (const a of alive) for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const list = cells.get(key(a._ci + di, a._cj + dj)); if (!list) continue;
      for (const b of list) {
        if (b.id <= a.id) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 < 1.1 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (1.05 - d) * 0.5; this.tryMove(a, -dx / d * push, -dz / d * push); this.tryMove(b, dx / d * push, dz / d * push); }
      }
    }
  }
  tryMove(u, dx, dz) {
    if (!this.nav.blockedAt(u.x + dx, u.z + dz)) { u.x += dx; u.z += dz; }
    else if (!this.nav.blockedAt(u.x + dx, u.z)) u.x += dx;
    else if (!this.nav.blockedAt(u.x, u.z + dz)) u.z += dz;
  }
  // enemy brain (team 1 only): Elite aims better, snipers most, and fires a bit faster
  diffOf(u) { return u.team === 1 ? (this.cfg.diff[this.difficulty] || this.cfg.diff.normal) : this.cfg.diff.normal; }
  accMul(u) { const D = this.diffOf(u); return (u.cls === 'sniper' ? D.sniperAcc : D.acc); }
  rofMul(u) { return this.diffOf(u).rof; }
  fire(u, tg) {
    const d = Math.hypot(tg.x - u.x, tg.z - u.z), dmg = u.s.dmg * this.teams[u.team].mods.dmgMul;
    u.firing = 0.25;
    const y0 = heightAt(u.x, u.z) + 1.9, y1 = heightAt(tg.x, tg.z) + 1.3;
    if (u.s.weapon === 'rocket') {
      const miss = (1 - u.s.acc * this.accMul(u)) * 3.5 * (d / u.s.range);
      const tx = tg.x + (this.r() - 0.5) * 2 * miss, tz = tg.z + (this.r() - 0.5) * 2 * miss, T = Math.max(0.25, d / 32);
      (this.shots ||= []).push({ tx, tz, ty: heightAt(tx, tz) + 0.5, t: 0, T, team: u.team, owner: u, dmg, splash: u.s.splash });
      this.emit({ type: 'rocket', team: u.team, x0: u.x, z0: u.z, y0, x1: tx, z1: tz, y1: heightAt(tx, tz) + 0.5, T });
      return;
    }
    // partly covered (popped up behind a prop) or crouched in a nest = harder to hit
    const p = u.s.acc * this.accMul(u) * (1 - 0.45 * d / u.s.range) * (tg.moving ? 0.9 : 1) * (tg.inCover ? 0.7 : tg.crouch ? 0.85 : 1);
    const hit = this.r() < p;
    u.shots++; if (hit) u.hits++;
    const ex = hit ? tg.x : tg.x + (this.r() - 0.5) * 3, ez = hit ? tg.z : tg.z + (this.r() - 0.5) * 3;
    this.emit({ type: 'tracer', team: u.team, laser: !!u.s.laser, x0: u.x, z0: u.z, y0, x1: ex, z1: ez, y1 });
    if (hit) this.pending.push([tg, dmg * (0.85 + 0.3 * this.r()), u]); // applied after everyone acted (no first-mover edge)
  }
  updateShots(dt) {
    if (!this.shots) return;
    for (const s of this.shots) {
      if ((s.t += dt) < s.T) continue;
      s.done = true;
      this.emit({ type: 'boom', x: s.tx, z: s.tz, y: s.ty, team: s.team });
      for (const e of this.units) if (e.alive && e.team !== s.team) { const d = Math.hypot(e.x - s.tx, e.z - s.tz); if (d < s.splash) this.damage(e, s.dmg * (1 - 0.6 * d / s.splash) * (e.inCover && e.duck ? 0.5 : 1), s.owner); }
    }
    this.shots = this.shots.filter((s) => !s.done);
  }
  damage(e, amt, by) {
    if (!e.alive) return;
    e.hp -= amt; e.hurtT = 0.2;
    if (e.hp > 0) return;
    e.alive = false; e.deadT = 0; e.hp = 0; this.leaveCover(e); e.crouch = false;
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
    // no posts and nobody left on the field → that side loses
    const dead = [0, 1].map((t) => !this.posts.some((p) => p.owner === t) && this.alive(t) === 0);
    if (dead[0] && dead[1]) return end(-1, 'wiped');
    if (dead[0]) return end(1, 'wiped');
    if (dead[1]) return end(0, 'wiped');
    for (const T of this.teams) if (T.holdT != null && T.holdT <= 0) return end(T.idx, 'posts');
    if (this.time >= this.cfg.timeLimit) return end(A.tickets === B.tickets ? -1 : A.tickets > B.tickets ? 0 : 1, 'time');
  }
  simulate(sec) { const n = Math.round(sec / this.cfg.dt); for (let i = 0; i < n && !this.over; i++) this.step(); }
}
Object.assign(Sim.prototype, TRAIT_AI);   // trait jobs (cover, nest, supply, mines) live in traits.js
function turn(a, b, k) { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * Math.min(1, k); }
