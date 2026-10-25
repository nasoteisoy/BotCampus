// 🧠 Player brains for Conquest Commander (prototype port, v1). ES module; imports only the shared army schema
// (games/shared/army/schema.js, same instance as army.js) and pickups.js (new). No globals.
// OFF by default. Turn on with ?brains=1 (or localStorage 'conquest-commander:brains-flag' = '1'); ?brains=0 forces off.
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
// Attach points (BRAIN_FORMAT.md): units[].brain on a saved look (object or preset id string), squads[] =
// { id, name, unitIds[], squadBrain } (unitIds = look ids). ⭐ actions (medic / mine / guard) are cut for v1.

import * as Army from '../../shared/army/schema.js?v=8';
import { PICKUPS } from './pickups.js';

export const BRAINS_V = 1;
export const MAX_ROWS = 6;
export const MIN_HOLD = 1.0;
export const LS_FLAG = 'conquest-commander:brains-flag';      // '1' = on
export const LS_ARMY = 'conquest-commander:army-brains';      // { v:1, units:[{ id, brain }], squads:[{ id, name, unitIds, squadBrain }] }
export const LS_BUNDLE = 'conquest-commander:brains';         // what the Unit Brains prototype saves ({ kind:'cc.brains', unit, squad })

export const CONDS = ['lowHp', 'enemyNear', 'lowAmmo', 'pointNotOurs', 'allyHurt', 'always'];
export const ACTS = ['heal', 'cover', 'shoot', 'capture', 'ammo', 'follow'];
export const CUT_ACTS = ['medic', 'mine', 'guard'];
export const PLANS = ['capture', 'hold', 'retake', 'push'];
export const FORMS = ['line', 'wedge', 'blob'];

const r = (c, a) => ({ if: c, do: a, on: true });
// v2.3 traits (traits.js TRAITS ids) → brain rows. supplier / mines / guard need ⭐ actions (cut) → null = keep the trait AI.
export const TRAIT_PRESETS = {
  rusher: { name: 'Rusher', icon: '🏃', rows: [r('lowHp', 'heal'), r('lowAmmo', 'ammo'), r('enemyNear', 'shoot'), r('always', 'capture')] },
  cover: { name: 'Cover Fighter', icon: '🧱', rows: [r('lowHp', 'heal'), r('lowAmmo', 'ammo'), r('enemyNear', 'cover'), r('always', 'capture')] },
  sniper: { name: 'Sniper Nest', icon: '🎯', rows: [r('enemyNear', 'cover'), r('lowHp', 'heal'), r('lowAmmo', 'ammo'), r('always', 'follow')] },
  retaker: { name: 'Retaker', icon: '🔁', squadPlan: 'retake', rows: [r('lowHp', 'heal'), r('pointNotOurs', 'capture'), r('enemyNear', 'shoot'), r('always', 'follow')] },
  supplier: null, mines: null, guard: null,
};
export function presetBrain(id) {
  const p = TRAIT_PRESETS[id]; if (!p) return null;
  return { kind: 'cc.unitBrain', v: BRAINS_V, name: p.name, icon: p.icon, preset: id, tier: 1, rows: p.rows.map((x) => ({ ...x })) };
}
export const defaultSquad = () => ({ kind: 'cc.squadBrain', v: BRAINS_V, plan: 'capture', formation: 'wedge', follow: true, spacing: 2 });

// ---------- validation (returns a clean copy or null) ----------
export function cleanUnitBrain(b, trait) {
  if (typeof b === 'string') return presetBrain(b === 'auto' ? trait : b);       // preset id shorthand ('auto' = the look's trait)
  if (!b || typeof b !== 'object' || b.kind !== 'cc.unitBrain' || typeof b.v !== 'number' || b.v < 1 || b.v > BRAINS_V) return null;
  if (b.tier !== undefined && b.tier !== 1) return null;                          // ⭐ tier 2 is cut
  if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > MAX_ROWS) return null;
  for (const x of b.rows) if (!x || !CONDS.includes(x.if) || !ACTS.includes(x.do) || (x.on !== undefined && typeof x.on !== 'boolean')) return null;
  return { kind: 'cc.unitBrain', v: BRAINS_V, name: typeof b.name === 'string' ? b.name.slice(0, 24) : 'Custom', preset: typeof b.preset === 'string' ? b.preset : null, tier: 1, rows: b.rows.map((x) => ({ if: x.if, do: x.do, on: x.on !== false })) };
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
  try { const q = loc && loc.search ? new URLSearchParams(loc.search).get('brains') : null; if (q === '1' || q === 'on') return true; if (q === '0' || q === 'off') return false; } catch (e) { /* no URL */ }
  try { return !!storage && storage.getItem(LS_FLAG) === '1'; } catch (e) { return false; }
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
      // NOT WIRED YET: squads / squadBrain are read here but only used behind the ?brains=1 flag; no squad plan drives units in v2.4.
      const sq = (AR && AR.squads.find((s) => s.unitIds.includes(look.id))) || D.squads.find((s) => s.unitIds.includes(look.id)) || null;
      const squad = (sq && cleanSquadBrain(sq.squadBrain)) || D.teamSquad || (brain && brain.preset && TRAIT_PRESETS[brain.preset] && TRAIT_PRESETS[brain.preset].squadPlan ? { ...defaultSquad(), plan: TRAIT_PRESETS[brain.preset].squadPlan } : defaultSquad());
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
        return false;                                          // cut ⭐ actions
      };
      if (!u.__bm) u.__bm = newMem();
      const res = evaluateHeld(info.brain, test, can, u.__bm, now, u.hp, this.minHold);
      u.brainRow = res.row; u.brainAct = res.act; u.pkGoal = null;
      if (res.row < 0) return null;                            // nothing fired → the trait AI (squad default)
      if (res.act !== 'cover' && u.cov && sim.leaveCover) sim.leaveCover(u);
      u.atNest = false; u.mineSpot = null;
      let dest = null;
      if (res.act === 'cover') {
        if (!u.cov && scratch.cov) { const sp = scratch.cov; sp.by = u.id; u.cov = sp; u.covAt = now; u.popT = 0.6; }
        dest = u.cov;
      } else if (res.act === 'heal') { dest = healAt(); if (dest && dest.pack) u.pkGoal = 'heal'; }
      else if (res.act === 'ammo') { const A = pack('ammo'); if (A) { dest = { x: A.pack.x, z: A.pack.z }; u.pkGoal = 'ammo'; } }
      else if (res.act === 'shoot') dest = { x: u.x, z: u.z };
      else if (res.act === 'follow') dest = this.slotOf(sim, u, leader(), info);
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
