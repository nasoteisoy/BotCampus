// Battle numbers for a look: class + weapon + HP/speed/cost/accuracy, all from the ONE shared stats file
// (games/shared/army/stats.js, the same numbers the 🪖 Trooper Customizer shows). v2.4: no local COST/STATS/ITEMS copies.
// The army itself (who you are, your units, the enemy) is loaded in army.js.
import { combatStats, classOf as sharedClassOf, toIndex, ITEMS, WEAPONS, CLASSES as SHARED_CLASSES, CLASS_INFO, BASIC_GEAR } from '../../shared/army/stats.js?v=9';

// ---------- class + stats from gear (SWBF2 classes) ----------
// Class comes from the gear (shared classOf, first match wins):
//   rocket → heavy · sniper → sniper · jetpack or EMP → jet · rally or chaingun → commander · fusion cutter or shotgun → engineer · else trooper
export const CLASSES = [...SHARED_CLASSES];                     // trooper, heavy, engineer, sniper, commander, jet (sim class mix)
export const CLASS_ICON = Object.fromEntries(CLASSES.map((c) => [c, CLASS_INFO[c].i]));
export const SIM_WEAPONS = ['rifle', 'rocket'];                 // weapon kinds sim.fire() knows (rocket = splash)

// gear = item-id object ({ weapon: 'rocket', … }) OR the customizer's index state ({ weapon: 1, … })
const asGear = (g) => (g && Object.values(g).some((v) => typeof v === 'string') ? g : null);
export const gearOf = (x) => (x && x.gear ? x.gear : x || {});
export function classOf(g) { return sharedClassOf('trooper', gearOf(g)); }
// sim stats: { cls, cost, power, hp, speed (battle m/s), acc, weapon:'rifle'|'rocket', weaponId, range, rof, dmg, splash, laser, dps }
export function statsOf(x) {
  const g = gearOf(x), s = asGear(g) ? combatStats({ kind: 'trooper', gear: g }) : combatStats('trooper', g);
  return { cls: s.cls, cost: s.cost, power: s.power, hp: s.hp, speed: s.speed, acc: s.acc, weapon: s.weapon, weaponId: s.id, range: s.range, rof: s.rof, dmg: s.dmg, splash: s.splash, laser: s.laser ? 1 : 0, emp: s.emp ? 1 : 0, dps: s.dps };
}
export const indexOf = (gear) => toIndex('trooper', gear);   // gear ids → index state for the 3D look builders (trooper.js)
export { ITEMS, WEAPONS, BASIC_GEAR };

export function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : n.toLocaleString('en-US'));

// ---------- v2.3 names kept for older test scripts (test/brains, test/pickups). The game itself uses army.js. ----------
// loadArmies(): the shared army (army.js loadArmy) with a 2nd (random) nation when the save has only one.
// defaultLooksFor(): the old built-in 6-type roster (Trooper, Heavy, Sniper, Engineer, Jet, Commander) as looks.
import { loadArmy, randomNation } from './army.js';
import { DEFAULT_ROSTER } from './trooper.js';
import { toGear } from '../../shared/army/stats.js?v=9';
export function loadArmies(storage) {
  const a = loadArmy(storage); if (a.nations.length > 1) return a;
  return { ...a, nations: [...a.nations, randomNation(mulberry32(5), a.nations[0] && a.nations[0].p)] };
}
export const defaultLooksFor = (nid) => DEFAULT_ROSTER.map((r, i) => ({ id: `def-${nid}-${i}`, nationId: nid, name: r.name, icon: r.icon, st: { ...r.t }, gear: toGear('trooper', r.t), armyTrait: '' }));
