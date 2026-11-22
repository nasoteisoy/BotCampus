// r8b: strong / weak icons for the cards, from the real fight rules in state.js only (no new bonuses).
// Company types (inf/armor/art/eng/aa) and ship classes (bb/dd/cv) have no hit bonus in battleRound, so the
// card-level keys are what the rules actually tell apart: army, fleet (any ship card), fort (garrison) and
// the four plane roles. Sources (state.js): battleRound hit chances, makeLand support / landing under fire,
// airfieldsNear (fighter + torpedo planes join sea fights), resolveStrikes (bomber / torpedo / interceptors),
// canStrike (recon never strikes). tests/rules.test.mjs checks this table against those rules.
export const HIT = { naval: { plane: { ship: 0.5, plane: 0.35 }, ship: { ship: 0.4, plane: 0.25 } }, land: { fort: 0.5, support: 0.45, defender: 0.42, attacker: 0.4 } };
export const STRONG = {
  army: [], // fights as plain infantry icons (0.40 / 0.42): no edge over anything
  fleet: ['army'], // offshore support 0.45 and cannot be shot; a stronger hostile fleet halves a landing army
  fort: ['army'], // forts hit 0.5 against 0.40 attackers
  recon: [], // never strikes
  fighter: ['bomber', 'torpedo', 'fleet'], // interceptors down unescorted strikers; air cover hits ships 0.5 vs 0.25 back
  bomber: ['army', 'fort'], // strike: -1 strength from the strongest army, else -1 fort
  torpedo: ['fleet'], // strike: sinks one ship; air cover hits ships 0.5 vs 0.25 back
};
export const KEYS = Object.keys(STRONG);
// weak = whatever lists you as strong
export const WEAK = Object.fromEntries(KEYS.map((k) => [k, KEYS.filter((o) => STRONG[o].includes(k))]));
export const cardKey = (c) => (c.kind === 'fleet' || c.ship ? 'fleet' : c.kind === 'army' ? 'army' : c.fort ? 'fort' : c.type);
