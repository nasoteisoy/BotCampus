// 🧠 Player brains for Conquest Commander (prototype port, v1). ES module; imports only the shared army schema
// (games/shared/army/schema.js, same instance as army.js) and pickups.js (new). No globals.
// ON in the game (v2.5): a unit with a brain saved in 🧠 Unit Brains follows it. Off switch: ?brains=0 (or localStorage
// 'conquest-commander:brains-flag' = '0'). No page URL (Node tests) = off, so seeded test battles stay identical.
// ❤️/📦 pickups + magazines are ON by default since v2.4 (pickups.js; ?pickups=0 = off), separate from ?brains=1.
// When on, a PLAYER unit (team 0) that has a brain walks where its brain says; everything else falls through to the
// trait AI (TRAIT_AI.decide) unchanged. Enemy units never use brains. With pickups on, units WITHOUT a brain (both teams)
// also go for an 📦 ammo pack when completely dry and a ❤️ health pack when badly hurt and one is close (pickups.need).
// Where brains are read (first hit wins): look.brain (v2.4 army.js copies units[].brain onto the look) → the shared army
// save 'botcampus:army' read through schema.js (units[].brain + squads[]) → the old keys LS_ARMY / LS_BUNDLE (fallback).
//
// Brain = { kind:'cc.unitBrain', v:1, rows:[{ if, do, on }] } — rows run top → bottom, the first enabled row whose IF is
// true AND whose THEN can run fires (Gambit rule). A row that starts firing is kept ≥ minHold s (default 1.0) unless
// the unit took damage since the last think, or the held row's action can no longer run.
// Attach points (BRAIN_FORMAT.md): units[].brain on a saved look, squads[] = { id, name, unitIds[], squadBrain }
// (unitIds = look ids). v2.5: no presets, no tiers — an old preset id string (or tier field) loads as no brain / is ignored
// (schema.js already moved the old preset onto the unit's trait). Every action works: medic / mine / guard included.

import * as Army from '../../shared/army/schema.js?v=9';
import { PICKUPS } from './pickups.js';
import { heightAt } from './map.js';

export const BRAINS_V = 1;
export const MAX_ROWS = 6;
export const MIN_HOLD = 1.0;
export const LS_FLAG = 'conquest-commander:brains-flag';      // '1' = on
export const LS_ARMY = 'conquest-commander:army-brains';      // { v:1, units:[{ id, brain }], squads:[{ id, name, unitIds, squadBrain }] }
export const LS_BUNDLE = 'conquest-commander:brains';         // what the Unit Brains prototype saves ({ kind:'cc.brains', unit, squad })

export const CONDS = ['lowHp', 'enemyNear', 'lowAmmo', 'pointNotOurs', 'allyHurt', 'always'];
export const ACTS = ['heal', 'cover', 'shoot', 'capture', 'ammo', 'follow', 'medic', 'mine', 'guard'];
export const MEDIC = Object.freeze({ seekR: 28, reach: 3, healHp: 5 });   // ➕ medic row: walk to the most hurt ally, heal +5 HP/s in reach
export const PLANS = ['capture', 'hold', 'retake', 'push'];
export const FORMS = ['line', 'wedge', 'blob'];

export const defaultSquad = () => ({ kind: 'cc.squadBrain', v: BRAINS_V, plan: 'capture', formation: 'wedge', follow: true, spacing: 2 });

// ---------- validation (returns a clean copy or null) ----------
export function cleanUnitBrain(b, trait) {
  void trait;
  if (typeof b === 'string') return null;                                          // old preset id: no presets any more (trait AI)
  if (!b || typeof b !== 'object' || b.kind !== 'cc.unitBrain' || typeof b.v !== 'number' || b.v < 1 || b.v > BRAINS_V) return null;
  if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > MAX_ROWS) return null;
  for (const x of b.rows) if (!x || !CONDS.includes(x.if) || !ACTS.includes(x.do) || (x.on !== undefined && typeof x.on !== 'boolean')) return null;
  return { kind: 'cc.unitBrain', v: BRAINS_V, name: typeof b.name === 'string' ? b.name.slice(0, 24) : 'Custom', rows: b.rows.map((x) => ({ if: x.if, do: x.do, on: x.on !== false })) };
}
export function cleanSquadBrain(s) {
  if (!s || typeof s !== 'object' || s.kind !== 'cc.squadBrain' || typeof s.v !== 'number' || s.v < 1 || s.v > BRAINS_V) return null;
  if (!PLANS.includes(s.plan) || !FORMS.includes(s.formation) || typeof s.follow !== 'boolean' || ![1, 2, 3].includes(s.spacing)) return null;
  return { kind: 'cc.squadBrain', v: BRAINS_V, plan: s.plan, formation: s.formation, follow: s.follow, spacing: s.spacing };
}

// ---------- evaluator + hysteresis ----------
export function evaluate(brain, test, can) {
  const rows = (brain && brain.rows) || [];
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i]; if (!x || x.on === false) continue;
    if (x.if !== 'always' && !test(x.if)) continue;
    if (can && !can(x.do)) continue;
    return { row: i, act: x.do };
  }
  return { row: -1, act: null };
}
export const newMem = () => ({ row: -1, act: null, since: -Infinity, hp: null, why: 'start' });
export function evaluateHeld(brain, test, can, mem, now, hp, minHold = MIN_HOLD) {
  const hurt = mem.hp !== null && hp < mem.hp; mem.hp = hp;
  const rows = (brain && brain.rows) || [];
  let why = 'free';
  if (mem.row >= 0 && now - mem.since < minHold) {
    const x = rows[mem.row];
    if (!x || x.on === false || x.do !== mem.act) why = 'off';
    else if (can && !can(x.do)) why = 'cant';
    else if (hurt) why = 'hurt';
    else return { row: mem.row, act: mem.act, held: true, hurt, why: 'held' };
  } else if (mem.row >= 0) why = 'expired';
  const res = evaluate(brain, test, can);
  if (res.row !== mem.row || res.act !== mem.act) { mem.row = res.row; mem.act = res.act; mem.since = now; mem.why = why; }
  return { row: res.row, act: res.act, held: false, hurt, why };
}

// ---------- flag + data ----------
export function readFlag(loc = globalThis.location, storage = globalThis.localStorage) {
  if (!loc) return false;                                                          // Node / headless: off
  try { const q = loc.search ? new URLSearchParams(loc.search).get('brains') : null; if (q === '1' || q === 'on') return true; if (q === '0' || q === 'off') return false; } catch (e) { /* no URL */ }
  try { return !(storage && storage.getItem(LS_FLAG) === '0'); } catch (e) { return true; }
}
// The shared army save → { units:[{ id, ids[], brain }], squads:[{ id, name, unitIds[], squadBrain }] } or null.
// Read-only: only when 'botcampus:army' exists (never migrates / writes; army.js / the customizer do that).
// ids = every look id this army unit can show up as in the game: the unit id (v2.4 looks), the v2.3 roster look id
// r-<nationId>-<k> (k = k-th roster trooper by slot, the same key schema.migrate() used for traits) and ext.legacyLookId.
// squads[].unitIds are expanded the same way so a squad matches its looks.
export function readArmy(storage = globalThis.localStorage, schema = Army) {
  let raw = null; try { raw = storage && storage.getItem(schema.ARMY_KEY); } catch (e) { raw = null; }
  if (!raw) return null;
  let a; try { a = schema.sanitize(JSON.parse(raw)); } catch (e) { return null; }
  const units = [], idsOf = new Map();
  for (const p of a.players) {
    const nid = p.nation && p.nation.id; let k = 0;
    for (const u of schema.playerUnits(a, p.id, { kind: 'trooper' })) {
      const ids = [u.id];
      if (u.roster) { if (nid) ids.push(`r-${nid}-${k}`); k++; }
      if (u.ext && typeof u.ext.legacyLookId === 'string') ids.push(u.ext.legacyLookId);
      idsOf.set(u.id, ids); units.push({ id: u.id, ids, brain: u.brain, trait: schema.unitTrait(u) });
    }
  }
  const squads = a.squads.map((q) => ({ id: q.id, name: q.name, unitIds: q.unitIds.flatMap((x) => idsOf.get(x) || [x]), squadBrain: q.squadBrain }));
  return { units, squads };
}
// old keys: army = { units:[{ id, brain }], squads:[{ id, name, unitIds, squadBrain }] }; bundle = prototype save (team-wide default)
export function readData(storage = globalThis.localStorage, schema = Army) {
  const get = (k) => { try { return JSON.parse(storage.getItem(k) || 'null'); } catch (e) { return null; } };
  const army = storage ? get(LS_ARMY) : null, bundle = storage ? get(LS_BUNDLE) : null;
  let shared = null; try { shared = storage ? readArmy(storage, schema) : null; } catch (e) { shared = null; }
  return {
    army: shared,                                                          // 'botcampus:army' (first)
    units: army && Array.isArray(army.units) ? army.units.filter((x) => x && typeof x.id === 'string') : [],
    squads: army && Array.isArray(army.squads) ? army.squads.filter((s) => s && Array.isArray(s.unitIds)) : [],
    teamBrain: bundle && bundle.kind === 'cc.brains' ? bundle.unit || null : null,
    teamSquad: bundle && bundle.kind === 'cc.brains' ? cleanSquadBrain(bundle.squad) : null,
  };
}

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const FORM_OFF = {   // slot k behind the leader (x = side, z = back), metres per spacing step
  line: (k) => [((k % 2) ? 1 : -1) * Math.ceil(k / 2), 0.4],
  wedge: (k) => [((k % 2) ? 1 : -1) * Math.ceil(k / 2), Math.ceil(k / 2)],
  blob: (k) => [Math.cos(k * 2.4) * 1.2, Math.sin(k * 2.4) * 1.2 + 0.6],
};

export function createBrains(opts = {}) {
  const B = {
    // brainsOn = run brain rows (the 🧠 flag). on = the hook gate in traits.js = brains OR pickups (the needs layer).
    // Setting B.on = x sets brainsOn (kept for the v1 tests / console).
    brainsOn: opts.on !== undefined ? !!opts.on : readFlag(opts.location, opts.storage),
    pk: opts.pickups || PICKUPS,
    get on() { return this.brainsOn || !!this.pk.on; },
    set on(v) { this.brainsOn = !!v; },
    minHold: typeof opts.minHold === 'number' ? opts.minHold : MIN_HOLD,
    team: 0,                      // only the player's side
    data: opts.data || { army: null, units: [], squads: [], teamBrain: null, teamSquad: null },
    loaded: !!opts.data,
    storage: opts.storage,
    reload() { this.data = readData(this.storage || globalThis.localStorage); this.loaded = true; this._cache = new WeakMap(); return this.data; },
    _cache: new WeakMap(),             // per Sim: look index → resolved brain (a new battle = a new Sim = fresh cache)
    // the brain + squad brain for a unit (null brain = no brain → trait AI)
    resolve(sim, u) {
      if (!this.loaded) this.reload();
      const T = sim.teams[u.team], look = T && T.looks[u.look]; if (!look) return { brain: null, squad: null, sq: null };
      let C = this._cache.get(sim); if (!C) this._cache.set(sim, (C = new Map()));
      const key = u.team + ':' + u.look; if (C.has(key)) return C.get(key);
      const D = this.data, AR = D.army, aEntry = AR ? AR.units.find((x) => x.ids.includes(look.id)) : null;
      const entry = D.units.find((x) => x.id === look.id);
      const raw = look.brain != null ? look.brain : aEntry && aEntry.brain != null ? aEntry.brain : entry ? entry.brain : D.teamBrain;
      const brain = raw == null ? null : cleanUnitBrain(raw, look.trait);
      // a saved squad (old saves / console) sets the plan + formation; otherwise the default squad (capture, wedge)
      const sq = (AR && AR.squads.find((s) => s.unitIds.includes(look.id))) || D.squads.find((s) => s.unitIds.includes(look.id)) || null;
      const squad = (sq && cleanSquadBrain(sq.squadBrain)) || D.teamSquad || defaultSquad();
      const out = { brain, squad, sq };
      C.set(key, out); return out;
    },
    // squad-plan target post for this unit (index into sim.posts or -1)
    planPost(sim, u, plan) {
      const t = u.team, P = sim.posts, st = this.track(sim);
      const near = (f) => { let b = -1, bd = Infinity; P.forEach((p, i) => { if (!f(p, i)) return; const d = d2(p, u); if (d < bd) { bd = d; b = i; } }); return b; };
      if (plan === 'hold') return near((p) => p.owner === t);
      if (plan === 'push') { const e = near((p) => p.owner === 1 - t); return e >= 0 ? e : near((p) => p.owner !== t); }
      if (plan === 'retake') { let b = -1, bt = -Infinity; st.lostAt[t].forEach((at, i) => { if (P[i].owner !== t && at > bt) { bt = at; b = i; } }); return b >= 0 ? b : u.post; }
      return u.post;   // capture = the sim's own post pick (marks / nearest unowned)
    },
    // remembers when each post was lost by each side (for the retake plan)
    track(sim) {
      let st = sim.__brainsState;
      if (!st || st.n !== sim.posts.length) st = sim.__brainsState = { n: sim.posts.length, owner: sim.posts.map((p) => p.owner), lostAt: [sim.posts.map(() => -Infinity), sim.posts.map(() => -Infinity)], t: -1 };
      if (st.t !== sim.time) { st.t = sim.time; sim.posts.forEach((p, i) => { const was = st.owner[i]; if (was !== p.owner) { if (was === 0 || was === 1) st.lostAt[was][i] = sim.time; st.owner[i] = p.owner; } }); }
      return st;
    },
    leader(sim, u, info) {
      const T = sim.teams[u.team];
      if (info.sq) { const ids = info.sq.unitIds; const m = sim.units.find((v) => v.alive && v.team === u.team && T.looks[v.look] && ids.includes(T.looks[v.look].id)); if (m) return m; }
      const q = T.squads[u.squad]; return q ? q.members.find((m) => m.alive) || null : null;
    },
    slotOf(sim, u, L, info) {
      const T = sim.teams[u.team];
      const mates = info.sq ? sim.units.filter((v) => v.alive && v.team === u.team && T.looks[v.look] && info.sq.unitIds.includes(T.looks[v.look].id)) : (T.squads[u.squad] ? T.squads[u.squad].members.filter((m) => m.alive) : []);
      const k = Math.max(1, mates.indexOf(u)), sp = info.squad.spacing * 2.5, [ox, oz] = (FORM_OFF[info.squad.formation] || FORM_OFF.wedge)(k);
      const yaw = L.yaw || 0, fx = Math.sin(yaw), fz = Math.cos(yaw);       // leader forward
      let x = L.x + (fz * ox - fx * oz) * sp, z = L.z + (-fx * ox - fz * oz) * sp;
      if (sim.nav && sim.nav.freePoint) [x, z] = sim.nav.freePoint(x, z);
      return { x, z };
    },
    // the hook: returns { x, z, row, act } for TRAIT_AI.decide, or null = fall through to the trait AI
    // postR = capture ring radius (MAP.postR; the hook passes it so this module needs no imports)
    decide(sim, u, now, postR = 9) {
      if (!this.on) return null;
      const pk = this.pk.on ? this.pk : null;
      const out = this.brainsOn && u.team === this.team ? this.decideBrain(sim, u, now, postR, pk) : null;
      if (out) return out;
      if (!pk) return null;
      const n = pk.need(sim, u); u.pkGoal = n ? n.act : null;    // needs layer (no brain / no row fired)
      if (!n) return null;
      if (u.cov && sim.leaveCover) sim.leaveCover(u);
      u.atNest = false; u.mineSpot = null;
      return { x: n.x, z: n.z, row: -1, act: n.act, need: true };
    },
    decideBrain(sim, u, now, postR, pk) {
      const info = this.resolve(sim, u); if (!info.brain) { u.brainAct = null; return null; }
      const fx = u.tr || {}, fighting = now - (u.lastSeen ?? -99) < (fx.hold || 3);
      const plan = info.squad.plan, pi = this.planPost(sim, u, plan), P = pi >= 0 ? sim.posts[pi] : null;
      const tg = u.tgt && u.tgt.alive ? u.tgt : null;
      const scratch = {};
      const supplier = () => scratch.sup !== undefined ? scratch.sup : (scratch.sup = sim.units.filter((a) => a.alive && a !== u && a.team === u.team && a.tr && a.tr.heal).sort((a, b) => d2(a, u) - d2(b, u))[0] || null);
      const pack = (kind) => (pk ? (scratch[kind] !== undefined ? scratch[kind] : (scratch[kind] = pk.nearest(sim, u, kind))) : null);
      // heal target = the nearer of a live ❤️ pack and a live Supplier ({ x, z, pack? } or null)
      const healAt = () => {
        const s = supplier(), H = pack('health');
        if (H && (!s || H.d <= d2(s, u))) return { x: H.pack.x, z: H.pack.z, pack: true };
        if (!s) return null;
        const d = d2(s, u) || 1, k = Math.max(0, d - 2.5) / d; return { x: u.x + (s.x - u.x) * k, z: u.z + (s.z - u.z) * k, pack: false };
      };
      const hurtAlly = () => {   // ➕ medic: the most hurt ally close by (troopers only)
        if (scratch.hurt !== undefined) return scratch.hurt;
        let best = null, bs = Infinity;
        for (const a of sim.units) { if (!a.alive || a === u || a.team !== u.team || a.kind === 'tank' || a.hp > a.hpMax * 0.95) continue; const d = d2(a, u); if (d > MEDIC.seekR) continue; const sc = a.hp / a.hpMax * 30 + d; if (sc < bs) { bs = sc; best = a; } }
        return (scratch.hurt = best);
      };
      const guardSpot = () => {  // 🛡️ guard: stay on the nearest post we own
        if (scratch.guard !== undefined) return scratch.guard;
        const gi = sim.nearestOwn ? sim.nearestOwn(u.team, u.x, u.z) : -1; if (gi < 0) return (scratch.guard = null);
        const G = sim.posts[gi]; if (u.guardAt && u.guardAt.i === gi) return (scratch.guard = u.guardAt);
        const a = (u.slot || 0) * 2.4, rr = postR * 0.5; let x = G.x + Math.cos(a) * rr, z = G.z + Math.sin(a) * rr;
        if (sim.nav && sim.nav.freePoint) [x, z] = sim.nav.freePoint(x, z);
        return (scratch.guard = u.guardAt = { i: gi, x, z });
      };
      const leader = () => scratch.L !== undefined ? scratch.L : (scratch.L = this.leader(sim, u, info));
      const test = (c) => {
        if (c === 'lowHp') return u.hp < u.hpMax * 0.35;
        if (c === 'enemyNear') return !!tg;
        if (c === 'lowAmmo') return !!pk && pk.lowAmmo(sim, u);  // < 1 spare magazine (no magazines without pickups)
        if (c === 'pointNotOurs') return !!P && P.owner !== u.team;
        if (c === 'allyHurt') return sim.units.some((a) => a.alive && a !== u && a.team === u.team && a.hp < a.hpMax * 0.6 && d2(a, u) < 28);
        return false;
      };
      const can = (a) => {
        if (a === 'heal') return u.hp < u.hpMax && !!healAt();
        if (a === 'cover') {
          if (!fighting || !u.threat || u.mode === 'rally') return false;
          if (u.cov) return true;
          if (scratch.cov === undefined) scratch.cov = sim.findCover ? sim.findCover(u) : null;
          return !!scratch.cov;
        }
        if (a === 'shoot') return !!tg;
        if (a === 'capture') return !!P || u.gx !== undefined;
        if (a === 'follow') { const L = leader(); return !!L && L !== u; }
        if (a === 'ammo') return !!pk && (pk.mag(sim, u), u.reserve < u.mag * pk.ammoCfg.reserveMags) && !!pack('ammo');
        if (a === 'medic') return !!hurtAlly();
        if (a === 'mine') {   // 💣 plant a mine at the nearest post we own, on the enemy's way in (sim mine rules)
          if (!(u.mines > 0) || !sim.mineTarget || u.mode === 'rally') return false;
          if (scratch.mine === undefined) { const keep = u.post, own = sim.nearestOwn ? sim.nearestOwn(u.team, u.x, u.z) : -1; if (own >= 0) u.post = own; scratch.mine = own >= 0 ? sim.mineTarget(u) : null; u.post = keep; }
          return !!scratch.mine;
        }
        if (a === 'guard') return !!guardSpot();
        return false;
      };
      if (!u.__bm) u.__bm = newMem();
      const res = evaluateHeld(info.brain, test, can, u.__bm, now, u.hp, this.minHold);
      u.brainRow = res.row; u.brainAct = res.act; u.pkGoal = null;
      if (res.row < 0) return null;                            // nothing fired → the trait AI (squad default)
      if (res.act !== 'cover' && u.cov && sim.leaveCover) sim.leaveCover(u);
      u.atNest = false; if (res.act !== 'mine') u.mineSpot = null;
      let dest = null;
      if (res.act === 'cover') {
        if (!u.cov && scratch.cov) { const sp = scratch.cov; sp.by = u.id; u.cov = sp; u.covAt = now; u.popT = 0.6; }
        dest = u.cov;
      } else if (res.act === 'heal') { dest = healAt(); if (dest && dest.pack) u.pkGoal = 'heal'; }
      else if (res.act === 'ammo') { const A = pack('ammo'); if (A) { dest = { x: A.pack.x, z: A.pack.z }; u.pkGoal = 'ammo'; } }
      else if (res.act === 'shoot') dest = { x: u.x, z: u.z };
      else if (res.act === 'follow') dest = this.slotOf(sim, u, leader(), info);
      else if (res.act === 'medic') {
        const a = hurtAlly(), d = d2(a, u);
        if (d <= MEDIC.reach) { const h = Math.min(a.hpMax - a.hp, MEDIC.healHp * 0.3); a.hp += h; if (sim.teams[u.team]) sim.teams[u.team].healed += h; if (sim.emit) sim.emit({ type: 'heal', team: u.team, x0: u.x, z0: u.z, x1: a.x, z1: a.z, y0: heightAt(u.x, u.z) + 1.2, y1: heightAt(a.x, a.z) + 1.2, medic: true }); }
        const k = Math.max(0, d - 2) / (d || 1); dest = { x: u.x + (a.x - u.x) * k, z: u.z + (a.z - u.z) * k };
      } else if (res.act === 'mine') dest = scratch.mine || u.mineSpot;
      else if (res.act === 'guard') dest = guardSpot();
      else if (res.act === 'capture') {
        const L = info.squad.follow ? leader() : null;
        if (L && L !== u && P && d2(L, P) > postR + 4) dest = this.slotOf(sim, u, L, info);       // travel in formation, then spread on the post
        else if (P && pi !== u.post) { const a = (u.slot || 0) * 2.4, rr = postR * 0.55; dest = { x: P.x + Math.cos(a) * rr, z: P.z + Math.sin(a) * rr }; if (sim.nav && sim.nav.freePoint) { const [x, z] = sim.nav.freePoint(dest.x, dest.z); dest = { x, z }; } }
        else dest = { x: u.gx, z: u.gz };
      }
      if (!dest) return null;
      return { x: dest.x, z: dest.z, row: res.row, act: res.act };
    },
  };
  return B;
}

// the shared instance the game uses (flag read once at load; BRAINS.on can be flipped in tests)
export const BRAINS = createBrains();
