// Space Campaign data: sector map, goods, ship classes, weapons and perk tech. All numbers here, no logic.

// goods: base price in credits; icon names live in icons.js
export const GOODS = {
  ore:     { base: 12, icon: 'ore',     label: 'Ore' },
  ice:     { base: 16, icon: 'ice',     label: 'Ice' },
  food:    { base: 20, icon: 'food',    label: 'Food' },
  scrap:   { base: 14, icon: 'scrap',   label: 'Scrap' },
  tech:    { base: 42, icon: 'chip',    label: 'Tech' },
  crystal: { base: 70, icon: 'crystal', label: 'Crystal' },
};
export const GOOD_IDS = Object.keys(GOODS);

// node types: station, field (asteroids), wreck, beacon (empty jump point), nest (pirate base)
// x/z in r2 board units; SPREAD below stretches them into r3 world units (the carrier now flies freely between them). mult = station price multipliers (<1 = makes it, cheap; >1 = needs it, pays well)
const BOARD = [
  { id: 0,  type: 'station', name: 'Aurora',     x: -95, z: 30,  color: 0x7ff0ff, planet: 'blue',
    mult: { food: 0.55, ore: 1.0, ice: 1.45, scrap: 1.1, tech: 1.25, crystal: 1.1 }, yard: ['fighter', 'bomber', 'destroyer'], tech: ['laser', 'shield', 'cargo', 'drill'] },
  { id: 1,  type: 'beacon',  x: -62, z: 8 },
  { id: 2,  type: 'field',   x: -70, z: -32, rich: { ore: 0.7, ice: 0.3 } },
  { id: 3,  type: 'station', name: 'Brightdock', x: -22, z: -12, color: 0xffc83d,
    mult: { food: 1.65, ore: 1.45, ice: 1.0, scrap: 0.8, tech: 0.7, crystal: 1.2 }, yard: ['fighter', 'bomber', 'destroyer', 'lightcruiser'], tech: ['laser', 'missile', 'tractor', 'scanner'] },
  { id: 4,  type: 'beacon',  x: 10, z: 26 },
  { id: 5,  type: 'wreck',   x: -45, z: 55 },
  { id: 6,  type: 'field',   x: 28, z: -42, rich: { ore: 0.55, ice: 0.45 } },
  { id: 7,  type: 'station', name: 'Cobalt',     x: 52, z: 8,   color: 0x3d7dff, planet: 'ring',
    mult: { food: 1.15, ore: 0.95, ice: 1.2, scrap: 1.3, tech: 1.5, crystal: 1.45 }, yard: ['fighter', 'bomber', 'destroyer', 'lightcruiser', 'cruiser', 'heavycruiser', 'carrier'], tech: ['laser', 'missile', 'shield', 'cargo', 'drill', 'tractor', 'scanner', 'warp', 'trade'] },
  { id: 8,  type: 'beacon',  x: 88, z: 42 },
  { id: 9,  type: 'nest',    x: 18, z: 70 },
  { id: 10, type: 'station', name: 'Dawnport',   x: 118, z: -18, color: 0xff9440,
    mult: { food: 1.3, ore: 1.55, ice: 0.6, scrap: 1.6, tech: 1.1, crystal: 0.85 }, yard: ['destroyer', 'cruiser', 'heavycruiser', 'carrier'], tech: ['missile', 'shield', 'warp', 'trade'] },
  { id: 11, type: 'wreck',   x: 88, z: -62 },
  { id: 12, type: 'field',   x: 140, z: 38, rich: { ore: 0.4, ice: 0.3, crystal: 0.3 } },
  { id: 13, type: 'nest',    x: 162, z: -58 },
  { id: 14, type: 'beacon',  x: 82, z: -22 },
];
export const SPREAD = 3;
// every location is a bubble; arriving anywhere inside it parks the carrier at its centre (room for the carrier and its escorts)
export const BUBBLE = { station: 40, nest: 38, field: 36, wreck: 34, beacon: 28 };
export const NODES = BOARD.map((n) => ({ ...n, x: n.x * SPREAD, z: n.z * SPREAD, r: BUBBLE[n.type] }));
export const WORLD = { minX: -330, maxX: 530, minZ: -250, maxZ: 270 }; // where the carrier may fly
// empire trade routes (node paths, station to station); one convoy shuttles each
export const ROUTES = [
  { id: 0, path: [0, 1, 3], color: 0xffd23f },
  { id: 1, path: [3, 4, 7], color: 0xffd23f },
  { id: 2, path: [7, 14, 10], color: 0xffd23f },
  { id: 3, path: [10, 12, 8, 7], color: 0xffd23f },
];
export const HOME = 0;
export const NODE_ICON = { station: 'station', field: 'asteroid', wreck: 'wreck', nest: 'skull', beacon: 'pin' };

// escort ships for the shipyard. atk / hull / speed on a 1..10 scale for the bars
export const SHIPS = {
  fighter:      { model: 'fighter',      cost: 120,  atk: 2,  hull: 2,  speed: 9, size: 1.2, label: 'Fighter' },
  bomber:       { model: 'bomber',       cost: 240,  atk: 4,  hull: 3,  speed: 7, size: 1.5, label: 'Bomber' },
  destroyer:    { model: 'destroyer',    cost: 480,  atk: 5,  hull: 5,  speed: 7, size: 2.0, label: 'Light destroyer' },
  lightcruiser: { model: 'lightcruiser', cost: 820,  atk: 7,  hull: 6,  speed: 6, size: 2.4, label: 'Light cruiser' },
  cruiser:      { model: 'cruiser',      cost: 1350, atk: 9,  hull: 9,  speed: 5, size: 2.9, label: 'Cruiser' },
  heavycruiser: { model: 'heavycruiser', cost: 2200, atk: 12, hull: 12, speed: 4, size: 3.4, label: 'Heavy cruiser' },
  carrier:      { model: 'escortcarrier', cost: 3200, atk: 8,  hull: 14, speed: 3, size: 3.9, label: 'Carrier', wing: 2 },
};
export const SHIP_IDS = Object.keys(SHIPS);
export const FLEET_MAX = 8;

// weapons + helpful perk tech; 3 levels each; cost per level
export const TECH = {
  laser:   { kind: 'weapon', icon: 'zap',     cost: [180, 420, 900],  label: 'Lasers' },     // fleet attack +20%/lvl, faster guns in battle
  missile: { kind: 'weapon', icon: 'missile', cost: [260, 560, 1100], label: 'Missiles' },   // fleet attack +15%/lvl, homing missiles in battle
  shield:  { kind: 'perk',   icon: 'shield',  cost: [200, 450, 950],  label: 'Shields' },    // fleet hull +20%/lvl, +1 shield in battle
  cargo:   { kind: 'perk',   icon: 'cargo',   cost: [150, 380, 800],  label: 'Cargo pods' }, // +10 cargo/lvl
  drill:   { kind: 'perk',   icon: 'drill',   cost: [140, 340, 700],  label: 'Mining drill' }, // +1 per rock/lvl
  tractor: { kind: 'perk',   icon: 'magnet',  cost: [160, 380, 760],  label: 'Tractor beam' }, // +1 salvage/lvl, loot after fights
  scanner: { kind: 'perk',   icon: 'radar',   cost: [120, 300, 650],  label: 'Scanner' },    // see farther, raids last longer
  warp:    { kind: 'perk',   icon: 'warp',    cost: [400, 900, 1600], label: 'Warp drive' }, // +40% distance per day each level
  trade:   { kind: 'perk',   icon: 'handshake', cost: [220, 520, 1000], label: 'Trade pass' }, // sell +2%/lvl (always under the buy price)
};
export const TECH_IDS = Object.keys(TECH);
export const CARRIER = { atk: 6, hull: 10, cargo: 20, range: 150 }; // range: map units flown per day (warp adds 40% a level)
export const SIGHT = 150; // how far the carrier sees (scanner adds 70 a level)

// officers: hire one, give it ships, post its fleet somewhere and it guards that area by itself
export const OFFICER_MAX = 3;
export const OFFICER_RANKS = [ // rank badge chevrons = index + 1
  { cost: 300, radius: 70, bonus: 0.25 }, // bonus = guarding home ground
  { cost: 650, radius: 85, bonus: 0.4 },
  { cost: 1100, radius: 100, bonus: 0.6 },
];
export const OFFICER_SHIPS = 4; // ships per officer fleet
export const OFFICER_COLORS = ['#ff9440', '#b07dff', '#3ccf7a'];
export const GOAL_REP = 100; // reputation to become Empire Admiral
