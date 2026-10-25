// BotCampus army save — shared by every game. Pure ES module (no DOM): works in the browser and in Node tests.
// Spec: ARMY_SCHEMA.md.   import * as Army from '../../shared/army/schema.js?v=8' (from games/<game>/js/);
//   const army = Army.load();            // reads 'botcampus:army' (migrates 'trooper-custom:db' v3 on first load)
//   Army.save(army);                     // sanitizes + writes
//   Army.playerUnits(army, army.activePlayerId, { roster: true })
import { ITEMS, NATION_ITEMS, GEAR_FIELDS, BASIC_GEAR, TRAIT_IDS, toIndex, toGear, classOf, combatStats, traitOf } from './stats.js?v=8';

export const ARMY_KEY = 'botcampus:army';
export const ARMY_VERSION = 1;
export const LEGACY_KEYS = Object.freeze({ customizer: 'trooper-custom:db', conquestSetup: 'conquest-commander:setup' });
export const LIMITS = Object.freeze({ players: 12, unitsPerPlayer: 60, rosterTroopers: 6, name: 24, unitName: 16 });
export const NATION_DEFAULT = Object.freeze({ primary: '#2f80ed', secondary: '#ffe14d', suit: 'charcoal', symbol: 'star', symbolColor: 'auto', visor: 'cyan', glow: 'soft' });

const HEX = /^#[0-9a-f]{6}$/i;
const clean = (x, max = LIMITS.name) => String(x ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const pickId = (list, v, def) => (list.includes(v) ? v : def);
export const newId = (prefix = 'u') => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const store = (s) => s || (typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
const rd = (s, k) => { try { return s ? s.getItem(k) : null; } catch (e) { return null; } };
const json = (raw) => { try { return JSON.parse(raw || 'null'); } catch (e) { return null; } };

// ---------- nation ----------
export function cleanNation(n = {}, fallbackName = 'Nation 1') {
  const c = n.colors || {}, f = n.flag || {};
  return {
    id: typeof n.id === 'string' && n.id ? n.id.slice(0, 40) : newId('n'),
    name: clean(n.name) || fallbackName,
    colors: { primary: HEX.test(c.primary) ? c.primary.toLowerCase() : NATION_DEFAULT.primary, secondary: HEX.test(c.secondary) ? c.secondary.toLowerCase() : NATION_DEFAULT.secondary },
    flag: { symbol: pickId(NATION_ITEMS.sym, f.symbol, 'star'), symbolColor: pickId(NATION_ITEMS.sc, f.symbolColor, 'auto') },
    suit: pickId(NATION_ITEMS.suit, n.suit, NATION_DEFAULT.suit),
    visor: pickId(NATION_ITEMS.vis, n.visor, NATION_DEFAULT.visor),
    glow: pickId(NATION_ITEMS.glow, n.glow, NATION_DEFAULT.glow),
  };
}
// army nation → 3D painter fields { p, s, suit, sym, sc, vis, glow } (indexes) used by trooper.js / tank.js
export function nationState(n) {
  const x = cleanNation(n);
  return { p: x.colors.primary, s: x.colors.secondary, suit: NATION_ITEMS.suit.indexOf(x.suit), sym: NATION_ITEMS.sym.indexOf(x.flag.symbol), sc: NATION_ITEMS.sc.indexOf(x.flag.symbolColor), vis: NATION_ITEMS.vis.indexOf(x.visor), glow: NATION_ITEMS.glow.indexOf(x.glow) };
}
export function nationFromState(st = {}, id, name) {
  const at = (list, i, d) => (Number.isInteger(i) && list[i] ? list[i] : d);
  return cleanNation({ id, name, colors: { primary: st.p, secondary: st.s }, flag: { symbol: at(NATION_ITEMS.sym, st.sym, 'star'), symbolColor: at(NATION_ITEMS.sc, st.sc, 'auto') }, suit: at(NATION_ITEMS.suit, st.suit, 'charcoal'), visor: at(NATION_ITEMS.vis, st.vis, 'cyan'), glow: at(NATION_ITEMS.glow, st.glow, 'soft') });
}

// ---------- brains (Dev C, unit-brains BRAIN_FORMAT.md v1; same rules as brain.js validateUnitBrain / validateSquadBrain) ----------
export const BRAIN = Object.freeze({
  v: 1, maxRows: 6,
  conds: Object.freeze(['lowHp', 'enemyNear', 'lowAmmo', 'pointNotOurs', 'allyHurt', 'always']),
  acts: Object.freeze({ heal: 1, cover: 1, shoot: 1, capture: 1, ammo: 1, follow: 1, medic: 2, mine: 2, guard: 2 }), // action → tier
  presets: TRAIT_IDS, // a string brain = preset id (same ids as Conquest traits)
  plans: Object.freeze(['capture', 'hold', 'retake', 'push']), formations: Object.freeze(['line', 'wedge', 'blob']), spacings: Object.freeze([1, 2, 3]),
});
// unit brain: null | preset id string | {kind:'cc.unitBrain', v:1, ...}. Returns { ok, errors, brain } (brain normalized; unknown fields dropped).
export function checkUnitBrain(b) {
  if (b == null) return { ok: true, errors: [], brain: null };
  if (typeof b === 'string') return BRAIN.presets.includes(b) ? { ok: true, errors: [], brain: b } : { ok: false, errors: ['unknown preset ' + b] };
  const errors = [], E = (m) => errors.push(m);
  if (typeof b !== 'object' || Array.isArray(b)) return { ok: false, errors: ['brain must be null, a preset id or a cc.unitBrain object'] };
  if (b.kind !== 'cc.unitBrain') E('kind must be cc.unitBrain');
  if (typeof b.v !== 'number' || b.v < 1 || b.v > BRAIN.v) E('v must be 1..' + BRAIN.v);
  const tier = b.tier === undefined ? 1 : b.tier; if (tier !== 1 && tier !== 2) E('tier must be 1 or 2');
  if (!Array.isArray(b.rows)) E('rows must be an array');
  else {
    if (b.rows.length < 1) E('need at least 1 row'); if (b.rows.length > BRAIN.maxRows) E('max ' + BRAIN.maxRows + ' rows');
    b.rows.forEach((r, i) => {
      if (!r || typeof r !== 'object') return E(`row ${i + 1} bad`);
      if (!BRAIN.conds.includes(r.if)) E(`row ${i + 1}: unknown IF ${r.if}`);
      if (!BRAIN.acts[r.do]) E(`row ${i + 1}: unknown THEN ${r.do}`); else if (BRAIN.acts[r.do] > tier) E(`row ${i + 1}: ${r.do} is locked (tier ${BRAIN.acts[r.do]})`);
      if (r.on !== undefined && typeof r.on !== 'boolean') E(`row ${i + 1}: on must be true/false`);
    });
  }
  if (b.name !== undefined && (typeof b.name !== 'string' || b.name.length > 24)) E('name: text ≤ 24');
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors, brain: { kind: 'cc.unitBrain', v: BRAIN.v, name: b.name || 'Custom', icon: typeof b.icon === 'string' ? b.icon.slice(0, 8) : '🧠', preset: BRAIN.presets.includes(b.preset) ? b.preset : null, tier, rows: b.rows.map((r) => ({ if: r.if, do: r.do, on: r.on !== false })) } };
}
export function checkSquadBrain(sb) {
  if (sb == null) return { ok: true, errors: [], squadBrain: null };
  const errors = [], E = (m) => errors.push(m);
  if (typeof sb !== 'object' || Array.isArray(sb)) return { ok: false, errors: ['squadBrain must be null or a cc.squadBrain object'] };
  if (sb.kind !== 'cc.squadBrain') E('kind must be cc.squadBrain');
  if (typeof sb.v !== 'number' || sb.v < 1 || sb.v > BRAIN.v) E('v must be 1..' + BRAIN.v);
  if (!BRAIN.plans.includes(sb.plan)) E('unknown plan ' + sb.plan);
  if (!BRAIN.formations.includes(sb.formation)) E('unknown formation ' + sb.formation);
  if (typeof sb.follow !== 'boolean') E('follow must be true/false');
  if (!BRAIN.spacings.includes(sb.spacing)) E('spacing must be 1, 2 or 3');
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors, squadBrain: { kind: 'cc.squadBrain', v: BRAIN.v, plan: sb.plan, formation: sb.formation, follow: sb.follow, spacing: sb.spacing } };
}
export const cleanUnitBrain = (b) => { const r = checkUnitBrain(b); return r.ok ? r.brain : null; };   // invalid → null
export const cleanSquadBrain = (sb) => { const r = checkSquadBrain(sb); return r.ok ? r.squadBrain : null; };
// squad: {id, name, playerId, unitIds[], squadBrain}. unitIds keep only units of that player (each unit in one squad per player).
export function cleanSquad(sq = {}, i = 0, unitOwner = null) {
  const playerId = typeof sq.playerId === 'string' ? sq.playerId : '';
  const ids = (Array.isArray(sq.unitIds) ? sq.unitIds : []).filter((x) => typeof x === 'string' && (!unitOwner || unitOwner.get(x) === playerId)).filter((x, k, a) => a.indexOf(x) === k).slice(0, LIMITS.unitsPerPlayer);
  return { id: typeof sq.id === 'string' && sq.id ? sq.id.slice(0, 40) : newId('s'), name: clean(sq.name, 24) || 'Squad ' + (i + 1), playerId, unitIds: ids, squadBrain: cleanSquadBrain(sq.squadBrain) };
}

// ---------- units ----------
export function cleanGear(kind, g = {}) { const out = {}; for (const f of GEAR_FIELDS[kind]) out[f] = ITEMS[kind][f].some((x) => x.id === g[f]) ? g[f] : BASIC_GEAR[kind][f]; return out; }
export function cleanUnit(u = {}, playerId) {
  const kind = u.kind === 'tank' ? 'tank' : 'trooper', gear = cleanGear(kind, u.gear);
  const out = {
    id: typeof u.id === 'string' && u.id ? u.id.slice(0, 40) : newId(kind === 'tank' ? 'k' : 'u'),
    name: clean(u.name, LIMITS.unitName) || (kind === 'tank' ? 'Tank' : 'Trooper'),
    playerId: typeof u.playerId === 'string' ? u.playerId : playerId,
    kind, class: classOf(kind, gear), gear,
    traits: (Array.isArray(u.traits) ? u.traits : []).filter((t) => TRAIT_IDS.includes(t)).filter((t, i, a) => a.indexOf(t) === i).slice(0, 3),
    brain: cleanUnitBrain(u.brain),
    roster: u.roster !== false,
    slot: Number.isInteger(u.slot) && u.slot >= 0 && u.slot < 64 ? u.slot : null,
    icon: clean(u.icon, 4),
  };
  if (typeof u.thumb === 'string' && u.thumb.startsWith('data:image/') && u.thumb.length < 60000) out.thumb = u.thumb;
  if (u.ext && typeof u.ext === 'object') out.ext = u.ext;
  return out;
}
export const unitState = (u) => toIndex(u.kind === 'tank' ? 'tank' : 'trooper', u.gear);  // gear ids → index state for the 3D builders
export const unitGearFromState = (kind, st) => toGear(kind, st);
export const unitTrait = (u) => traitOf(u.traits, u.class || classOf(u.kind, u.gear)); // the trait a game should run
export const unitCombat = (u) => combatStats(u);
// "Trooper 1", "Trooper 2", … lowest free number for that player + kind
export function nextUnitName(army, playerId, kind = 'trooper') {
  const base = kind === 'tank' ? 'Tank' : 'Trooper', used = new Set(army.units.filter((u) => u.playerId === playerId).map((u) => u.name));
  for (let n = 1; ; n++) if (!used.has(base + ' ' + n)) return base + ' ' + n;
}
export function newUnit(army, playerId, kind = 'trooper', o = {}) {
  return cleanUnit({ kind, gear: BASIC_GEAR[kind], name: nextUnitName(army, playerId, kind), playerId, roster: true, ...o }, playerId);
}
export const playerUnits = (army, pid = army.activePlayerId, o = {}) => army.units.filter((u) => u.playerId === pid && (o.kind == null || u.kind === o.kind) && (o.roster == null || u.roster === o.roster)).sort((a, b) => (a.slot ?? 999) - (b.slot ?? 999));

// ---------- players ----------
export function cleanPlayer(p = {}, i = 0) {
  return { id: typeof p.id === 'string' && p.id ? p.id.slice(0, 40) : newId('p'), name: clean(p.name) || 'Player ' + (i + 1), nation: cleanNation(p.nation, 'Nation ' + (i + 1)), ...(p.ext && typeof p.ext === 'object' ? { ext: p.ext } : {}) };
}
export function newPlayer(army, name, nation) {
  const i = army.players.length; return cleanPlayer({ name: name || 'Player ' + (i + 1), nation: nation || { name: 'Nation ' + (i + 1) } }, i);
}
export const activePlayer = (army) => army.players.find((p) => p.id === army.activePlayerId) || army.players[0];

// ---------- whole save ----------
export function emptyArmy() {
  const p = cleanPlayer({ name: 'Player 1', nation: { name: 'Nation 1' } }, 0);
  return { kind: 'botcampus-army', version: ARMY_VERSION, updatedAt: new Date(0).toISOString(), updatedBy: '', activePlayerId: p.id, players: [p], units: [], squads: [], ships: [], ext: {} };
}
// sanitize(): never throws; unknown top-level keys are kept (forward compatible), unknown unit/player fields dropped
// except `ext` objects. Invalid gear ids fall back to the basic item.
export function sanitize(a) {
  if (!a || typeof a !== 'object') return emptyArmy();
  const out = { ...a, kind: 'botcampus-army', version: ARMY_VERSION };
  out.players = (Array.isArray(a.players) ? a.players : []).filter((p) => p && typeof p === 'object').slice(0, LIMITS.players).map(cleanPlayer);
  const seenP = new Set(); out.players = out.players.filter((p) => !seenP.has(p.id) && seenP.add(p.id));
  if (!out.players.length) out.players = emptyArmy().players;
  const pids = new Set(out.players.map((p) => p.id));
  out.activePlayerId = pids.has(a.activePlayerId) ? a.activePlayerId : out.players[0].id;
  const seenU = new Set(), per = {};
  out.units = (Array.isArray(a.units) ? a.units : []).filter((u) => u && typeof u === 'object').map((u) => cleanUnit(u))
    .filter((u) => pids.has(u.playerId) && !seenU.has(u.id) && seenU.add(u.id) && (per[u.playerId] = (per[u.playerId] || 0) + 1) <= LIMITS.unitsPerPlayer);
  const owner = new Map(out.units.map((u) => [u.id, u.playerId])), seenS = new Set(), inSquad = new Set();
  out.squads = (Array.isArray(a.squads) ? a.squads : []).filter((q) => q && typeof q === 'object').map((q, i) => cleanSquad(q, i, owner))
    .filter((q) => pids.has(q.playerId) && !seenS.has(q.id) && seenS.add(q.id)).slice(0, LIMITS.players * 8)
    .map((q) => ({ ...q, unitIds: q.unitIds.filter((x) => !inSquad.has(x) && inSquad.add(x)) }));
  out.ships = Array.isArray(a.ships) ? a.ships : [];
  out.ext = a.ext && typeof a.ext === 'object' ? a.ext : {};
  out.updatedAt = typeof a.updatedAt === 'string' ? a.updatedAt : new Date().toISOString();
  out.updatedBy = clean(a.updatedBy, 40);
  return out;
}
export function validate(a) {
  const errors = [], E = (m) => errors.push(m);
  if (!a || typeof a !== 'object') return { ok: false, errors: ['not an object'] };
  if (a.version !== ARMY_VERSION) E('version must be ' + ARMY_VERSION);
  if (!Array.isArray(a.players) || !a.players.length) E('players[] must be a non-empty array');
  const pids = new Set((a.players || []).map((p) => p && p.id));
  (a.players || []).forEach((p, i) => { if (!p || typeof p.id !== 'string') E(`players[${i}].id missing`); if (!p || !p.nation || typeof p.nation.id !== 'string') E(`players[${i}].nation.id missing`); else if (!HEX.test(p.nation.colors && p.nation.colors.primary)) E(`players[${i}].nation.colors.primary not #rrggbb`); });
  if (!pids.has(a.activePlayerId)) E('activePlayerId does not match a player');
  if (!Array.isArray(a.units)) E('units[] missing');
  const uids = new Set();
  (a.units || []).forEach((u, i) => {
    if (!u || typeof u.id !== 'string') return E(`units[${i}].id missing`);
    if (uids.has(u.id)) E(`units[${i}].id duplicate`); uids.add(u.id);
    if (!pids.has(u.playerId)) E(`units[${i}].playerId unknown`);
    if (u.kind !== 'trooper' && u.kind !== 'tank') E(`units[${i}].kind must be trooper|tank`);
    const kind = u.kind === 'tank' ? 'tank' : 'trooper';
    for (const f of GEAR_FIELDS[kind]) if (!ITEMS[kind][f].some((x) => x.id === (u.gear || {})[f])) E(`units[${i}].gear.${f} unknown id ${JSON.stringify((u.gear || {})[f])}`);
    if (!Array.isArray(u.traits) || u.traits.some((t) => !TRAIT_IDS.includes(t))) E(`units[${i}].traits must be trait ids`);
    if (u.class !== classOf(kind, u.gear || {})) E(`units[${i}].class should be ${classOf(kind, u.gear || {})}`);
    if (!('brain' in u)) E(`units[${i}].brain missing (use null)`);
    else { const r = checkUnitBrain(u.brain); if (!r.ok) E(`units[${i}].brain: ${r.errors.join('; ')}`); }
  });
  if (a.squads != null && !Array.isArray(a.squads)) E('squads must be an array');
  const sids = new Set(), owner = new Map((a.units || []).filter(Boolean).map((u) => [u.id, u.playerId])), inSq = new Set();
  (Array.isArray(a.squads) ? a.squads : []).forEach((q, i) => {
    if (!q || typeof q.id !== 'string' || !q.id) return E(`squads[${i}].id missing`);
    if (sids.has(q.id)) E(`squads[${i}].id duplicate`); sids.add(q.id);
    if (typeof q.name !== 'string') E(`squads[${i}].name missing`);
    if (!pids.has(q.playerId)) E(`squads[${i}].playerId unknown`);
    if (!Array.isArray(q.unitIds)) E(`squads[${i}].unitIds must be an array`);
    else q.unitIds.forEach((x, k) => { if (!owner.has(x)) E(`squads[${i}].unitIds[${k}] unknown unit`); else if (owner.get(x) !== q.playerId) E(`squads[${i}].unitIds[${k}] belongs to another player`); if (inSq.has(x)) E(`squads[${i}].unitIds[${k}] already in another squad`); inSq.add(x); });
    if (!('squadBrain' in q)) E(`squads[${i}].squadBrain missing (use null)`); else { const r = checkSquadBrain(q.squadBrain); if (!r.ok) E(`squads[${i}].squadBrain: ${r.errors.join('; ')}`); }
  });
  if (a.ships != null && !Array.isArray(a.ships)) E('ships must be an array');
  return { ok: !errors.length, errors };
}

// ---------- migration: Trooper Customizer 'trooper-custom:db' v3 (+ Conquest traits) → army v1 ----------
// Each old nation becomes one player (that player's nation). Non-blank roster slots → roster units (slot kept).
// Saved looks → bench units (roster:false). The old shared tank → one roster tank per player.
// Conquest traits ('conquest-commander:setup'.traits, keyed r-<nationId>-<k> / look id) → unit.traits.
export function migrate(old, setup) {
  if (!old || old.v !== 3 || !Array.isArray(old.nations)) return null;
  const traits = setup && setup.traits && typeof setup.traits === 'object' ? setup.traits : {};
  const tr = (key) => (TRAIT_IDS.includes(traits[key]) ? [traits[key]] : []);
  const army = { kind: 'botcampus-army', version: ARMY_VERSION, players: [], units: [], squads: [], ships: [], ext: {}, migratedFrom: 'trooper-custom:db v3', updatedBy: 'migrate' };
  const pname = clean(old.player && old.player.name);
  const nats = old.nations.filter((n) => n && typeof n.id === 'string').slice(0, LIMITS.players);
  const act = nats.find((n) => n.id === old.active) || nats[0];
  nats.forEach((n, i) => {
    const name = n.playerName ? clean(n.playerName) : (n === act ? (pname && pname !== 'Player' ? pname : 'Player 1') : `Player ${i + 1}`);
    const pid = typeof n.pid === 'string' ? n.pid : 'p-' + n.id;
    army.players.push(cleanPlayer({ id: pid, name, nation: nationFromState(n, n.id, n.name) }, i));
    let k = 0;
    (Array.isArray(n.roster) ? n.roster : []).forEach((r, slot) => {
      if (!r || r.blank) return;
      const st = { ...r.t };
      army.units.push(cleanUnit({ id: typeof r.id === 'string' ? r.id : `u-${n.id}-${slot}`, name: r.name || `Trooper ${slot + 1}`, icon: r.ia ? '' : r.icon, playerId: pid, kind: 'trooper', gear: toGear('trooper', st), traits: Array.isArray(r.traits) ? r.traits : tr(`r-${n.id}-${k}`), roster: true, slot }, pid));
      k++;
    });
    const tank = n.tank || old.tank;
    if (tank) army.units.push(cleanUnit({ id: `k-${n.id}`, name: 'Tank 1', playerId: pid, kind: 'tank', gear: toGear('tank', tank), roster: true, slot: 0 }, pid));
  });
  const byNation = Object.fromEntries(nats.map((n, i) => [n.id, army.players[i].id]));
  for (const l of Array.isArray(old.looks) ? old.looks : []) {
    if (!l || !byNation[l.nationId] || (l.unit !== 'trooper' && l.unit !== 'tank') || typeof l.u !== 'string') continue;
    const kind = l.unit, fields = GEAR_FIELDS[kind], st = {};
    fields.forEach((f, i) => { const d = l.u.charCodeAt(i) - 48; st[f] = d >= 0 && d < ITEMS[kind][f].length ? d : undefined; });
    army.units.push(cleanUnit({ id: typeof l.id === 'string' ? 'l-' + l.id : undefined, name: l.name, playerId: byNation[l.nationId], kind, gear: toGear(kind, st), traits: tr(String(l.id)), roster: false, thumb: l.thumb, ext: { legacyLookId: String(l.id) } }));
  }
  army.activePlayerId = byNation[act && act.id] || (army.players[0] && army.players[0].id);
  army.updatedAt = new Date().toISOString();
  return sanitize(army);
}

// ---------- storage ----------
// load(): army from 'botcampus:army'; if missing, migrate the customizer v3 save (and write the result) ; else empty army.
export function load(storage) {
  const s = store(storage); let a = json(rd(s, ARMY_KEY));
  if (a && typeof a === 'object' && a.version === ARMY_VERSION) return sanitize(a);
  if (a && typeof a === 'object' && a.version > ARMY_VERSION) return sanitize({ ...a, version: ARMY_VERSION, newerVersion: a.version }); // read-only best effort
  const m = migrate(json(rd(s, LEGACY_KEYS.customizer)), json(rd(s, LEGACY_KEYS.conquestSetup)));
  if (m) { save(m, s, 'migrate'); return m; }
  return emptyArmy();
}
export function save(army, storage, by) {
  const s = store(storage); if (!s) return false;
  const a = sanitize(army); a.updatedAt = new Date().toISOString(); if (by) a.updatedBy = String(by).slice(0, 40);
  try { s.setItem(ARMY_KEY, JSON.stringify(a)); return true; } catch (e) { return false; }
}
