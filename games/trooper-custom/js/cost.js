// v5: thin adapter over the ONE shared stats file (games/shared/army/stats.js). Numbers live there, not here.
// Keeps the old customizer API: unitCost('trooper', indexState), ITEMS.weapon[i] = { n, i, tip }, …
import * as S from '../../shared/army/stats.js?v=8';
export const MEDALS_NEEDED = 64; // kept for old saves; v5 unlocks everything
export const COST = S.COST;
export const STATS = S.STATS;
export const unitCost = (unit, st) => S.unitCost(unit, st);
export const unitStats = (unit, st) => S.unitStats(unit, st);
export const optionCost = (unit, k, v) => (COST[unit] && COST[unit].options[k] ? COST[unit].options[k].cost[v] || 0 : 0);
export const awardCost = (w) => COST.trooper.award.cost[w] || 0;
export const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : n.toLocaleString('en-US');
const AWARD_TIPS = ['⭐ Award blaster: faster fire, gold trim.', '⭐ Award rocket: bigger blast radius.', '⭐ Award sniper: pierces through 2 targets.', '⭐ Award shotgun: tighter spread, more range.', '⭐ Award chaingun: no spin-up delay.', '⭐ Award EMP: longer stun.'];
export const ITEMS = {
  armor: S.ITEMS.trooper.armor, weapon: S.ITEMS.trooper.weapon, side: S.ITEMS.trooper.side, expl: S.ITEMS.trooper.expl, gadget: S.ITEMS.trooper.gadget,
  award: AWARD_TIPS.map((tip) => ({ tip })),
};
