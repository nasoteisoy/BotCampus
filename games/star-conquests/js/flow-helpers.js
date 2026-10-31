// Shell flow helpers: tickets, classes, owned-planet passives (no ground/space edits).
import { PLANETS } from './galaxy.js';
import { PLAYER } from './state.js';

export const BASE_TICKETS = 150;
export const BASE_CLASSES = Object.freeze(['rifle', 'heavy', 'sniper', 'engineer']);

/** Aggregate passive mods from planets the player owns. */
export function ownedPassiveMods(state) {
  let armor = 0;
  let attack = 0;
  let ticketsMul = 1;
  let fleetDiscount = 0;
  const labels = [];
  if (!state) return { armor, attack, ticketsMul, fleetDiscount, labels };
  for (const p of PLANETS) {
    if (state.owners[p.id] !== PLAYER) continue;
    const pas = p.passive;
    if (!pas) continue;
    if (pas.label) labels.push(`${p.name}: ${pas.label}`);
    if (pas.armor) armor += pas.armor | 0;
    if (pas.attack) attack += pas.attack | 0;
    if (pas.ticketsMul) ticketsMul = Math.max(ticketsMul, +pas.ticketsMul || 1);
    if (pas.fleetDiscount) fleetDiscount = Math.max(fleetDiscount, +pas.fleetDiscount || 0);
  }
  return { armor, attack, ticketsMul, fleetDiscount, labels };
}

/**
 * Explicit tickets for both sides. Base 150 each; player side gets owned ticketsMul
 * and shop ticket Bonus (reinforce / sabotage). Never derive from unit count.
 */
export function computeBattleTickets(state, playerIsAttacker = true) {
  const mods = ownedPassiveMods(state);
  let playerTix = Math.round(BASE_TICKETS * mods.ticketsMul);
  let enemyTix = BASE_TICKETS;
  const bonusId = state?.activeBonus?.id;
  if (bonusId === 'reinforce') playerTix = Math.round(playerTix * 1.25);
  if (bonusId === 'sabotage') enemyTix = Math.max(1, Math.round(enemyTix * 0.85));
  // Optional absolute override from save/state.tickets
  if (state?.tickets && typeof state.tickets === 'object') {
    const a = state.tickets.attacker;
    const d = state.tickets.defender;
    if (Number.isFinite(a) || Number.isFinite(d)) {
      return {
        attacker: Number.isFinite(a) ? a : (playerIsAttacker ? playerTix : enemyTix),
        defender: Number.isFinite(d) ? d : (playerIsAttacker ? enemyTix : playerTix),
      };
    }
  }
  return playerIsAttacker
    ? { attacker: playerTix, defender: enemyTix }
    : { attacker: enemyTix, defender: playerTix };
}

/** 4 base classes plus any purchased upgrades (officer / special). */
export function computeGroundClasses(state) {
  const unlocked = Array.isArray(state?.unlockedClasses) ? state.unlockedClasses : [];
  return [...new Set([...BASE_CLASSES, ...unlocked])];
}

const GROUND_STAT_TYPES = new Set([
  'rifle', 'heavy', 'recon', 'sniper', 'engineer', 'officer', 'special', 'tank',
]);

/** Apply owned armor/attack passives onto a side's units (copies). */
export function applyPassiveStatsToUnits(state, units) {
  const { armor, attack } = ownedPassiveMods(state);
  if (!armor && !attack) return units;
  return (units || []).map((u) => {
    if (!GROUND_STAT_TYPES.has(u.type)) return u;
    return {
      ...u,
      stats: {
        ...u.stats,
        armor: (u.stats?.armor | 0) + armor,
        attack: (u.stats?.attack | 0) + attack,
      },
    };
  });
}

/** Freeze last ground opts for Playwright (read-only). */
export function publishLastGroundOpts(classes, tickets) {
  if (typeof window === 'undefined') return;
  try {
    window.__scLastGroundOpts = Object.freeze({
      classes: Array.isArray(classes) ? classes.slice() : [],
      tickets: tickets && typeof tickets === 'object'
        ? Object.freeze({ attacker: tickets.attacker | 0, defender: tickets.defender | 0 })
        : null,
    });
  } catch { /* */ }
}
