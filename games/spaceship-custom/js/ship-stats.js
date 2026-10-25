// SpaceShip stats: ONE pure ES module (no DOM, no three.js). Works in the browser and in Node.
//   import { spaceshipStats, PARTS, cleanShip, newShip } from '../spaceship-custom/js/ship-stats.js?v=1';
//   const s = spaceshipStats(ship);  // { v, hp, shield, shieldRegen, speed, spaceSpeed, dmg, rof, range, splash, dps, firepower, seats, cost, modes }
// A SpaceShip is an air ship a unit rides into battle like armor (ground battles) and also flies in space battles.
export const STATS_VERSION = 1;
export const SLOTS = Object.freeze(['hull', 'wings', 'engines', 'guns', 'shield', 'seats']);
export const SLOT_INFO = Object.freeze({
  hull: { i: '🛸', n: 'Hull' }, wings: { i: '🪽', n: 'Wings' }, engines: { i: '🔥', n: 'Engine' },
  guns: { i: '🔫', n: 'Guns' }, shield: { i: '🛡️', n: 'Shield' }, seats: { i: '🪑', n: 'Seats' },
});
// base ship (all first options): cheap. Numbers are in the same units as the army stats (HP, m/s, metres, seconds).
export const BASE = Object.freeze({ cost: 300, hp: 150, speed: 4.0, spaceMul: 2.5 });
const P = (id, n, i, o = {}) => Object.freeze({ id, n, i, cost: 0, hp: 0, speed: 0, shield: 0, regen: 0, seats: 0, range: 0, ...o });
// every option is unlocked. First option of each slot = the base part (cost 0).
export const PARTS = Object.freeze({
  hull: [
    P('scout', 'Scout', '🛸'),
    P('arrow', 'Arrow', '➤', { cost: 50, hp: 40, speed: 0.4 }),
    P('brick', 'Brick', '🧱', { cost: 110, hp: 150, speed: -0.6 }),
    P('titan', 'Titan', '🏰', { cost: 190, hp: 280, speed: -1.1 }),
  ],
  wings: [
    P('stubs', 'Stubs', '🪽'),
    P('delta', 'Delta', '🔺', { cost: 40, speed: 0.6 }),
    P('swept', 'Swept', '✈️', { cost: 55, speed: 0.4, hp: 30 }),
    P('broad', 'Broad', '🦅', { cost: 70, hp: 60, speed: -0.2, range: 5 }),
  ],
  engines: [
    P('ion', 'Ion', '🔥'),
    P('twin', 'Twin', '🔥', { cost: 60, speed: 1.0 }),
    P('plasma', 'Plasma', '☄️', { cost: 120, speed: 1.8 }),
    P('warp', 'Warp', '🌀', { cost: 200, speed: 2.6, hp: -20 }),
  ],
  guns: [
    P('pulse', 'Pulse', '🔫', { dmg: 10, rof: 0.5, range: 30, splash: 0 }),
    P('twin', 'Twin laser', '🔴', { cost: 60, dmg: 9, rof: 0.25, range: 32, splash: 0, laser: 1 }),
    P('missile', 'Missiles', '🚀', { cost: 90, dmg: 45, rof: 2.0, range: 40, splash: 3, speed: -0.2 }),
    P('rail', 'Rail', '⚡', { cost: 150, dmg: 90, rof: 3.0, range: 60, splash: 0.8, speed: -0.3 }),
  ],
  shield: [
    P('none', 'None', '∅'),
    P('light', 'Light', '🔵', { cost: 40, shield: 40, regen: 4 }),
    P('medium', 'Medium', '🛡️', { cost: 90, shield: 90, regen: 6, speed: -0.1 }),
    P('heavy', 'Heavy', '💠', { cost: 160, shield: 170, regen: 8, speed: -0.4 }),
  ],
  seats: [
    P('2', '2 seats', '🪑', { seats: 2 }),
    P('4', '4 seats', '🪑', { cost: 40, seats: 4, hp: 10, speed: -0.1 }),
    P('6', '6 seats', '🪑', { cost: 80, seats: 6, hp: 20, speed: -0.3 }),
    P('8', '8 seats', '🪑', { cost: 130, seats: 8, hp: 30, speed: -0.5 }),
  ],
});
export const BASE_PARTS = Object.freeze(Object.fromEntries(SLOTS.map((s) => [s, PARTS[s][0].id])));
export const partOf = (slot, id) => PARTS[slot].find((x) => x.id === id) || PARTS[slot][0];
export const LIMITS = Object.freeze({ shipsPerPlayer: 20, name: 16 });
// stat rows for UIs: icon + word + max (for bars). Keys = spaceshipStats() keys.
export const STAT_ROWS = Object.freeze([
  { k: 'hp', i: '❤️', n: 'Hull', max: 550, good: 1 },
  { k: 'shield', i: '🛡️', n: 'Shield', max: 180, good: 1 },
  { k: 'speed', i: '⚡', n: 'Speed', max: 8, good: 1 },
  { k: 'firepower', i: '💥', n: 'Firepower', max: 40, good: 1 },
  { k: 'range', i: '🎯', n: 'Range', max: 70, good: 1 },
  { k: 'seats', i: '🪑', n: 'Seats', max: 8, good: 1 },
  { k: 'cost', i: '💰', n: 'Cost', max: 1200, good: -1 },
].map(Object.freeze));
const r1 = (x) => Math.round(x * 10) / 10;
const cleanParts = (p = {}) => Object.fromEntries(SLOTS.map((s) => [s, partOf(s, p && p[s]).id]));
// spaceshipStats(ship | parts) → derived battle numbers, the same in ground battles (carries troopers like armor) and space battles
export function spaceshipStats(ship) {
  const parts = cleanParts(ship && ship.parts ? ship.parts : ship), L = SLOTS.map((s) => partOf(s, parts[s])), g = partOf('guns', parts.guns);
  const sum = (k) => L.reduce((a, x) => a + (x[k] || 0), 0);
  const speed = Math.max(1, r1(BASE.speed + sum('speed'))), dps = g.dmg / g.rof;
  return {
    v: STATS_VERSION,
    hp: BASE.hp + sum('hp'),                // hull points; shield is hit first
    shield: sum('shield'),                  // absorbs damage first
    shieldRegen: sum('regen'),              // shield points per second, out of combat
    speed,                                  // m/s in ground battles (tank 3.0, trooper 5.0)
    spaceSpeed: r1(speed * BASE.spaceMul),  // m/s in space battles
    dmg: g.dmg, rof: g.rof, splash: g.splash, laser: !!g.laser, weapon: g.id,
    range: sum('range'),                    // gun range + wing bonus (m)
    dps: r1(dps), firepower: Math.round(dps),
    seats: partOf('seats', parts.seats).seats,
    cost: BASE.cost + sum('cost'),
    modes: ['ground', 'space'],
  };
}
// short effect lines of one part vs another (for option cards): [{ i, n, d, good }]
export function partDelta(slot, id, vsId) {
  const base = { ...BASE_PARTS }, a = spaceshipStats({ ...base, [slot]: vsId }), b = spaceshipStats({ ...base, [slot]: id });
  return STAT_ROWS.map((r) => ({ ...r, d: r1(b[r.k] - a[r.k]) })).filter((x) => x.d !== 0).map((x) => ({ i: x.i, n: x.n, k: x.k, d: x.d, good: x.d * x.good > 0 }));
}
export function statDelta(shipA, shipB) { const a = spaceshipStats(shipA), b = spaceshipStats(shipB); return Object.fromEntries(STAT_ROWS.map((r) => [r.k, r1(b[r.k] - a[r.k])])); }
const clean = (x, max = LIMITS.name) => String(x ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
export const newShipId = () => 'sp-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// next free 'SpaceShip N' name for a player
export function nextShipName(ships, playerId) {
  const used = new Set((ships || []).filter((s) => s && s.playerId === playerId).map((s) => s.name));
  let n = 1; while (used.has('SpaceShip ' + n)) n++; return 'SpaceShip ' + n;
}
// one cheap base ship
export function newShip(ships, playerId) {
  const now = new Date().toISOString(), parts = { ...BASE_PARTS };
  return { id: newShipId(), name: nextShipName(ships, playerId), playerId, parts, stats: spaceshipStats(parts), createdAt: now, updatedAt: now };
}
// cleanShip(): never throws. Unknown part ids → base part; stats always recomputed; unknown keys inside a ship are kept.
export function cleanShip(s = {}, playerId) {
  if (!s || typeof s !== 'object') s = {};
  const parts = cleanParts(s.parts);
  return { ...s, id: typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : newShipId(), name: clean(s.name) || 'SpaceShip', playerId: typeof s.playerId === 'string' ? s.playerId : playerId, parts, stats: spaceshipStats(parts) };
}
