// v2.4: the player's army comes from the shared BotCampus army save (localStorage 'botcampus:army', games/shared/army/).
// Old Trooper Customizer saves ('trooper-custom:db' v3) are converted once by the shared Army.load() → migrate().
// No save → one cheap 'Trooper 1' (basic gear). Nothing about the army is ever put in a URL.
// Conquest only READS the army (edits happen in the customizer via 🪖 Edit army). The one exception is the shared
// schema.js load(): on the first load of an old save it writes the migrated army to 'botcampus:army' (old key untouched).
import * as Army from '../../shared/army/schema.js?v=9';
import { BASIC_GEAR, TRAIT_IDS, NATION_ITEMS, TANK_RULES, toIndex, unitCost } from '../../shared/army/stats.js?v=9';
import { NATION_DEFAULT } from './trooper.js';

export const ARMY_KEY = Army.ARMY_KEY;                    // 'botcampus:army'
export const LEGACY_KEY = Army.LEGACY_KEYS.customizer;    // 'trooper-custom:db' (only read through Army.load → migrate)
export const MAX_LOOKS = 6;                               // the sim uses up to 6 unit types per side

const clean = (x, max = 24) => String(x ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const traitOfUnit = (u) => (Array.isArray(u.traits) ? u.traits : []).find((t) => TRAIT_IDS.includes(t)) || '';

// army unit (sanitized by schema.js) → Conquest look { id, nationId, name, icon, gear, st, armyTrait, brain? }
export function lookOfUnit(u, nationId) {
  const l = { id: String(u.id), unitId: String(u.id), nationId, name: clean(u.name, 16) || 'Trooper', icon: clean(u.icon, 4), gear: { ...u.gear }, st: toIndex('trooper', u.gear), armyTrait: traitOfUnit(u), cost: unitCost(u).cost };
  if (u.brain != null) l.brain = u.brain;   // brains.js (Dev C) reads look.brain when the 🧠 flag is on
  return l;
}
// 🚜 v2.5: a roster tank → a Conquest tank look { id, kind:'tank', nationId, name, gear, st, cost } (max TANK_RULES.maxPerTeam)
export function tankLookOfUnit(u, nationId) {
  return { id: String(u.id), unitId: String(u.id), kind: 'tank', nationId, name: clean(u.name, 16) || 'Tank', gear: { ...u.gear }, st: toIndex('tank', u.gear), cost: unitCost(u).cost };
}
export const tanksOf = (looks, nationId) => looks.filter((l) => l.nationId === nationId).slice(0, TANK_RULES.maxPerTeam);
// army nation → the painter's nation fields (render.js / trooper.js) + names
function nationOfPlayer(p) {
  const st = Army.nationState(p.nation);
  return { id: p.id, nationId: p.nation.id, name: clean(p.nation.name) || 'Nation', player: clean(p.name) || 'Player', ...st };
}
export const defaultUnitLook = (nationId) => ({ id: 'u-default-1', unitId: null, nationId, name: 'Trooper 1', icon: '', gear: { ...BASIC_GEAR.trooper }, st: toIndex('trooper', BASIC_GEAR.trooper), armyTrait: '', cost: unitCost({ kind: 'trooper', gear: BASIC_GEAR.trooper }).cost, isDefault: true });

// Returns { army, source:'army'|'migrated'|'default', player, playerId, nations[], looks[], active, units, version:1 }
//   nations[i].id = the army PLAYER id (one player = one nation). looks = each player's roster troopers by slot.
//   tanks = each player's roster tanks (v2.5: they drive into Conquest; max 2 per side).
export function loadArmy(storage = globalThis.localStorage) {
  let had = null, legacy = null;
  try { had = storage && storage.getItem(ARMY_KEY); legacy = storage && storage.getItem(LEGACY_KEY); } catch (e) { /* private mode */ }
  let army;
  try { army = Army.load(storage); } catch (e) { army = Army.emptyArmy(); }
  let hadValid = false; try { const a = JSON.parse(had || 'null'); hadValid = !!(a && typeof a === 'object' && typeof a.version === 'number'); } catch (e) { hadValid = false; }
  // army = read the shared save · migrated = converted from the old customizer save just now · old = an old save we can't
  // read (customizer v1/v2: open the customizer once to convert it) · default = no save → one 'Trooper 1'
  let oldV = 0; try { oldV = (JSON.parse(legacy || 'null') || {}).v | 0; } catch (e) { oldV = 0; }
  const src = hadValid ? 'army' : army.migratedFrom ? 'migrated' : oldV ? 'old' : 'default';
  const nations = army.players.map(nationOfPlayer), looks = [], tanks = [];
  for (const p of army.players) {
    const mine = Army.playerUnits(army, p.id, { roster: true, kind: 'trooper' });
    looks.push(...mine.map((u) => lookOfUnit(u, p.id)));
    tanks.push(...Army.playerUnits(army, p.id, { roster: true, kind: 'tank' }).slice(0, TANK_RULES.maxPerTeam).map((u) => tankLookOfUnit(u, p.id)));
  }
  const me = Army.activePlayer(army);
  if (!looks.some((l) => l.nationId === me.id)) looks.unshift(defaultUnitLook(me.id));
  const nUnits = looks.filter((l) => l.nationId === me.id && !l.isDefault).length;
  return { army, source: src, player: clean(me.name) || 'Player 1', playerId: me.id, nations, looks, tanks, active: me.id, units: nUnits, version: army.version };
}

// ---------- enemy: another player from the save, or a generated army ----------
// generated = the same number of unit types as you, from cheap to specialist (so 1 basic trooper meets 1 basic trooper)
const ENEMY_KITS = [
  { name: 'Raider', gear: {} },                                                     // 🪖 trooper 💰100
  { name: 'Raider Heavy', gear: { armor: 'heavy', weapon: 'rocket' } },             // 🚀 heavy
  { name: 'Raider Sniper', gear: { helm: 'recon', weapon: 'sniper' } },             // 🎯 sniper
  { name: 'Raider Fixer', gear: { weapon: 'shotgun', gadget: 'fusion-cutter' } },   // 🔧 engineer
  { name: 'Raider Jet', gear: { gadget: 'jetpack' } },                              // 🛩️ jet
  { name: 'Raider Boss', gear: { weapon: 'chaingun', gadget: 'rally' } },           // ⭐ commander
];
const FREE_LOOK = { helm: ['dome', 'angular', 'crest', 'goggles'], pads: ['none', 'round', 'angular'], extra: ['none', 'cape', 'scarf'], banner: ['none', 'flag'], skin: ['skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5'] };
export function generatedLooks(rng, nationId, n = 1) {
  n = Math.max(1, Math.min(MAX_LOOKS, n | 0)); const out = [];
  for (let i = 0; i < n; i++) {
    const k = ENEMY_KITS[i], gear = { ...BASIC_GEAR.trooper };
    for (const [f, ids] of Object.entries(FREE_LOOK)) if (!(f === 'helm' && k.gear.helm)) gear[f] = ids[(rng() * ids.length) | 0];
    Object.assign(gear, k.gear);
    out.push({ id: `gen-${i}`, unitId: null, nationId, name: k.name, icon: '', gear, st: toIndex('trooper', gear), armyTrait: '', cost: unitCost({ kind: 'trooper', gear }).cost });
  }
  return out;
}
// generated enemy tanks: as many as the player fields (so 1 tank meets 1 tank), basic-ish builds
const ENEMY_TANKS = [{ name: 'Raider Tank', gear: {} }, { name: 'Raider Heavy Tank', gear: { hull: 'medium', gun: 'twin' } }];
export function generatedTanks(nationId, n = 0) {
  return ENEMY_TANKS.slice(0, Math.max(0, Math.min(TANK_RULES.maxPerTeam, n | 0))).map((k, i) => { const gear = { ...BASIC_GEAR.tank, ...k.gear }; return { id: `gen-tank-${i}`, unitId: null, kind: 'tank', nationId, name: k.name, gear, st: toIndex('tank', gear), cost: unitCost({ kind: 'tank', gear }).cost }; });
}
// random enemy nation that doesn't clash with the player's primary color
const PALETTE = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#5b7a3a', '#1abc9c', '#6c4bd1', '#d35b9f', '#2e343c', '#e8eef4'];
const SEC = ['#1b1f24', '#ffe14d', '#f4f6f8', '#ff9f1a', '#00d4ff', '#4cd964'];
export function randomNation(rng, avoidHex) {
  const hexDist = (a, b) => { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.abs((x >> 16) - (y >> 16)) + Math.abs(((x >> 8) & 255) - ((y >> 8) & 255)) + Math.abs((x & 255) - (y & 255)); };
  const opts = PALETTE.filter((c) => !avoidHex || hexDist(c, avoidHex) > 180);
  const p = opts[(rng() * opts.length) | 0] || '#c0392b';
  return { ...NATION_DEFAULT, id: 'rnd-enemy', name: 'Raiders', player: 'Raiders', p, s: SEC[(rng() * SEC.length) | 0], suit: (rng() * NATION_ITEMS.suit.length) | 0, sym: (rng() * NATION_ITEMS.sym.length) | 0, sc: 0, vis: (rng() * NATION_ITEMS.vis.length) | 0, glow: 1 + ((rng() * 2) | 0) };
}

// ---------- cost check for the setup screen ----------
// CP income per wave with ~1.5 posts held (CFG: +cpBase +cpPerPost per post every cpEvery s, a wave every waveEvery s)
export function armyBudget(looks, C) {
  const costs = looks.map((l) => l.cost), avg = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
  const perWave = Math.round((C.cpBase + C.cpPerPost * 1.5) * (C.waveEvery / C.cpEvery));
  const perWaveTroops = avg ? perWave / avg : 0;
  // ≈400 CP per wave: too expensive ('bad') = under 1.5 troops per wave on average (avg > ~265) or one type costing more
  // than a whole wave; pricey ('warn') = under 1.9 per wave (avg > ~210); a normal mixed army (avg 100–200) is fine
  const level = !costs.length ? 'ok' : (perWaveTroops < 1.5 || Math.max(...costs) > perWave) ? 'bad' : perWaveTroops < 1.9 ? 'warn' : 'ok';
  return { avg: Math.round(avg), max: costs.length ? Math.max(...costs) : 0, total: costs.reduce((a, b) => a + b, 0), perWave, perWaveTroops, level };
}
