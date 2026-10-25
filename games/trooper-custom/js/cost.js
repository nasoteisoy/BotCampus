// v5: thin adapter over the ONE shared stats file (games/shared/army/stats.js). Numbers live there, not here.
// Keeps the old customizer API: unitCost('trooper', indexState), ITEMS.weapon[i] = { n, i, tip }, …
import * as S from '../../shared/army/stats.js?v=9';
export const COST = S.COST;
export const STATS = S.STATS;
export const unitCost = (unit, st) => S.unitCost(unit, st);
export const unitStats = (unit, st) => S.unitStats(unit, st);
export const optionCost = (unit, k, v) => (COST[unit] && COST[unit].options[k] ? COST[unit].options[k].cost[v] || 0 : 0);
export const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : n.toLocaleString('en-US');
export const ITEMS = {
  armor: S.ITEMS.trooper.armor, weapon: S.ITEMS.trooper.weapon, side: S.ITEMS.trooper.side, expl: S.ITEMS.trooper.expl, gadget: S.ITEMS.trooper.gadget,
};
