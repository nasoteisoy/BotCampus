// Space Defense: all game data and tuning. Adapted from Front Line (games/tank-2v2/js/config.js):
// same idea of BODY types + attack LEVEL 0-5 per body, with the same level -> damage multiplier table.
// lvl 0 = cannot hit that body at all (never targeted).
export const LVL_MULT = [0, 0.06, 0.4, 0.75, 1.0, 1.4];

export const BODIES = {
  sml: { name: 'Small craft', icon: '🛩️' },
  cap: { name: 'Capital ship', icon: '🚢' },
  lnd: { name: 'Lander', icon: '📦' },
  inf: { name: 'Infantry', icon: '🪖' },
  arm: { name: 'Armor', icon: '🛞' },
  bld: { name: 'Structure', icon: '🏠' },
};
export const BODY_KEYS = ['sml', 'cap', 'lnd', 'inf', 'arm', 'bld'];

// world: each layer is W x H; enemies enter at u=0, bases sit near u=1000
export const W = 1000, H = 600;
export const START_CREDITS = 700;
export const PASSIVE_INCOME = 2;       // credits / s while a wave is running
export const WAVE_GAP = 22;            // s between waves (auto countdown)
export const UNIT_CAP = 22;            // per layer
export const NUM_WAVES = 12;

export const LAYERS = {
  space: {
    lanes: [
      [[0, 85], [330, 105], [660, 170], [905, 290]],
      [[0, 300], [905, 300]],
      [[0, 515], [330, 495], [660, 430], [905, 310]],
    ],
    base: { x: 945, y: 300, r: 42 },
    planet: { x: 1270, y: 300, r: 600 },   // landers that touch this disc drop troops on the planet
    slots: [[250, 185], [250, 405], [420, 40], [420, 230], [420, 370], [420, 560], [600, 255], [600, 345], [700, 95], [700, 505], [800, 175], [800, 425]],
    holdU: 640,
  },
  planet: {
    lanes: [
      [[60, 150], [380, 125], [690, 190], [905, 292]],
      [[60, 450], [380, 475], [690, 410], [905, 308]],
    ],
    base: { x: 945, y: 300, r: 44 },
    lz: [[110, 150], [110, 450]],
    slots: [[300, 230], [300, 370], [520, 70], [520, 255], [520, 345], [520, 530], [720, 300], [780, 115], [780, 485]],
    holdU: 620,
  },
};

// ---------- player structures (built on slots) ----------
// tiers: [ {dmg, rof, rng, cost} ... ] upgrade multiplies; vs = attack level per body
export const TURRETS = {
  laser:   { layer: 'space', name: 'Laser', cost: 100, hp: 330, rng: 155, rof: 0.45, dmg: 11, wpn: 'beam', col: '#6ff3ff', desc: 'Fast beam. Good vs small craft.',
    vs: { sml: 5, cap: 2, lnd: 4 } },
  missile: { layer: 'space', name: 'Missile', cost: 150, hp: 360, rng: 215, rof: 2.2, dmg: 60, wpn: 'missile', col: '#ffb347', desc: 'Slow homing missiles. Kills big ships.',
    vs: { sml: 1, cap: 5, lnd: 3 } },
  flak:    { layer: 'space', name: 'Flak', cost: 130, hp: 340, rng: 145, rof: 1.1, dmg: 20, splash: 55, wpn: 'flak', col: '#ffe08a', desc: 'Area bursts. Swarms and landers.',
    vs: { sml: 4, cap: 1, lnd: 5 } },
  shield:  { layer: 'space', name: 'Shield', cost: 120, hp: 420, rng: 150, aura: 0.55, col: '#b88cff', desc: 'Allies near it take less damage and heal.',
    vs: {} },
  bunker:  { layer: 'planet', name: 'Bunker', cost: 90, hp: 420, rng: 125, rof: 0.5, dmg: 9, wpn: 'mg', col: '#ffe08a', desc: 'Machine gun. Shreds infantry.',
    vs: { inf: 5, arm: 1 } },
  cannon:  { layer: 'planet', name: 'Cannon', cost: 140, hp: 380, rng: 150, rof: 2.0, dmg: 48, wpn: 'shell', col: '#ffb347', desc: 'Anti-tank gun.',
    vs: { inf: 2, arm: 5 } },
  mortar:  { layer: 'planet', name: 'Mortar', cost: 170, hp: 300, rng: 260, minRng: 50, rof: 3.4, dmg: 40, splash: 55, wpn: 'arc', col: '#ff8a5a', desc: 'Long range area shells.',
    vs: { inf: 5, arm: 3 } },
  ion:     { layer: 'planet', name: 'Ion Cannon', cost: 260, hp: 360, rof: 3.0, dmg: 70, wpn: 'ion', col: '#9ef', desc: 'Shoots landers in orbit before they drop.',
    vs: { lnd: 5, cap: 2, sml: 1 }, orbital: true },
  barracks:{ layer: 'planet', name: 'Barracks', cost: 120, hp: 500, prod: true, col: '#7fc96b', desc: 'Unlocks infantry.' },
  factory: { layer: 'planet', name: 'Factory', cost: 220, hp: 650, prod: true, col: '#5aa0ff', desc: 'Unlocks tanks and artillery.' },
};
export const SPACE_BUILD = ['laser', 'missile', 'flak', 'shield'];
export const PLANET_BUILD = ['bunker', 'cannon', 'mortar', 'ion', 'barracks', 'factory'];
export const TIER_COST = [0, 0.8, 1.3];      // upgrade cost multiplier (x base cost) to reach tier 2, 3
export const TIER_MULT = [1, 1.45, 2.0];     // damage / hp multiplier per tier

// ---------- player units ----------
// ab: ability. bombard = orbital strike on the planet. ferry = carry ground troops. carrier = launches drones.
export const UNITS = {
  fighter:     { layer: 'space', name: 'Fighter', cost: 90, hp: 70, speed: 120, r: 10, rng: 95, rof: 0.5, dmg: 9, wpn: 'bolt', body: 'sml', desc: 'Cheap dogfighter.',
    vs: { sml: 4, cap: 1, lnd: 4 } },
  interceptor: { layer: 'space', name: 'Interceptor', cost: 140, hp: 80, speed: 175, r: 9, rng: 105, rof: 0.35, dmg: 9, wpn: 'bolt', body: 'sml', desc: 'Very fast. Hunts landers.',
    vs: { sml: 5, cap: 1, lnd: 5 } },
  bomber:      { layer: 'space', name: 'Bomber', cost: 200, hp: 150, speed: 80, r: 14, rng: 90, rof: 2.4, dmg: 62, wpn: 'torp', body: 'sml', ab: 'bombard', desc: 'Torpedoes vs big ships. Can bomb the planet.',
    vs: { sml: 0, cap: 5, lnd: 2 } },
  frigate:     { layer: 'space', name: 'Frigate', cost: 260, hp: 340, speed: 60, r: 18, rng: 140, rof: 1.1, dmg: 22, wpn: 'bolt', body: 'cap', ab: 'bombard', desc: 'Tough all-rounder. Orbital strike.',
    vs: { sml: 3, cap: 4, lnd: 4 } },
  carrier:     { layer: 'space', name: 'Carrier', cost: 420, hp: 620, speed: 40, r: 26, rng: 120, rof: 1.6, dmg: 12, wpn: 'bolt', body: 'cap', ab: 'carrier', desc: 'Launches drone fighters.',
    vs: { sml: 3, cap: 2, lnd: 3 } },
  dropship:    { layer: 'space', name: 'Dropship', cost: 110, hp: 140, speed: 110, r: 14, rng: 0, body: 'lnd', ab: 'ferry', desc: 'Carries ground troops on the planet.',
    vs: {} },
  drone:       { layer: 'space', name: 'Drone', cost: 0, hp: 35, speed: 150, r: 7, rng: 80, rof: 0.55, dmg: 6, wpn: 'bolt', body: 'sml', life: 30, hidden: true, desc: 'Carrier drone.',
    vs: { sml: 4, cap: 1, lnd: 4 } },
  rifle:       { layer: 'planet', name: 'Rifle Squad', cost: 60, hp: 90, speed: 42, r: 10, rng: 95, rof: 0.9, dmg: 9, wpn: 'mg', body: 'inf', need: 'barracks', men: 5, desc: 'Cheap. Good vs infantry.',
    vs: { inf: 4, arm: 1, bld: 1 } },
  bazooka:     { layer: 'planet', name: 'Bazooka', cost: 90, hp: 70, speed: 38, r: 9, rng: 105, rof: 2.6, dmg: 40, wpn: 'rocket', body: 'inf', need: 'barracks', men: 3, desc: 'Anti-tank infantry.',
    vs: { inf: 1, arm: 4, bld: 2 } },
  light:       { layer: 'planet', name: 'Light Tank', cost: 150, hp: 180, speed: 70, r: 13, rng: 110, rof: 1.5, dmg: 18, wpn: 'shell', body: 'arm', need: 'factory', desc: 'Fast tank.',
    vs: { inf: 5, arm: 3, bld: 3 } },
  medium:      { layer: 'planet', name: 'Medium Tank', cost: 230, hp: 300, speed: 50, r: 15, rng: 125, rof: 2.0, dmg: 30, wpn: 'shell', body: 'arm', need: 'factory', desc: 'Strong all-round tank.',
    vs: { inf: 5, arm: 4, bld: 3 } },
  howitzer:    { layer: 'planet', name: 'Howitzer', cost: 210, hp: 110, speed: 32, r: 13, rng: 280, minRng: 60, rof: 4.5, dmg: 46, splash: 50, wpn: 'arc', body: 'arm', need: 'factory', desc: 'Long range area shells.',
    vs: { inf: 5, arm: 3, bld: 5 } },
};
export const SPACE_UNITS = ['fighter', 'interceptor', 'bomber', 'frigate', 'carrier', 'dropship'];
export const PLANET_UNITS = ['rifle', 'bazooka', 'light', 'medium', 'howitzer'];

export const ABILITIES = {
  bombard: { name: 'Orbital strike', icon: '☄️', cd: 18, dmg: 150, splash: 75, vs: { inf: 5, arm: 4, bld: 5 } },
  ferry:   { name: 'Ferry troops', icon: '📦', cd: 4, cap: 4 },
  carrier: { name: 'Drones', cd: 7, max: 4 },
};

// ---------- enemies ----------
export const ENEMIES = {
  drone:   { layer: 'space', name: 'Swarm Drone', hp: 34, speed: 95, r: 8, rng: 70, rof: 0.8, dmg: 4, body: 'sml', bounty: 6, wpn: 'bolt', baseDmg: 4, desc: 'Weak, fast, many.',
    vs: { sml: 3, cap: 2, lnd: 3, bld: 2 } },
  raider:  { layer: 'space', name: 'Raider', hp: 80, speed: 80, r: 11, rng: 90, rof: 0.7, dmg: 8, body: 'sml', bounty: 12, wpn: 'bolt', baseDmg: 8, desc: 'Fast fighter.',
    vs: { sml: 4, cap: 2, lnd: 4, bld: 2 } },
  gunship: { layer: 'space', name: 'Gunship', hp: 300, speed: 45, r: 18, rng: 120, rof: 1.4, dmg: 22, body: 'cap', bounty: 34, wpn: 'bolt', baseDmg: 20, desc: 'Armored. Use missiles.',
    vs: { sml: 3, cap: 3, lnd: 3, bld: 4 } },
  cruiser: { layer: 'space', name: 'Cruiser', hp: 720, speed: 30, r: 26, rng: 150, rof: 2.2, dmg: 38, body: 'cap', bounty: 80, wpn: 'torp', baseDmg: 45, desc: 'Heavy. Long range.',
    vs: { sml: 2, cap: 4, lnd: 3, bld: 4 } },
  lander:  { layer: 'space', name: 'Lander', hp: 170, speed: 55, r: 14, rng: 0, body: 'lnd', bounty: 18, desc: 'Drops troops on the planet!',
    vs: {} },
  mother:  { layer: 'space', name: 'Mothership', hp: 7000, speed: 13, r: 52, rng: 190, rof: 1.3, dmg: 42, body: 'cap', bounty: 600, wpn: 'torp', baseDmg: 400, boss: true, desc: 'BOSS. Launches raiders and landers.',
    vs: { sml: 3, cap: 4, lnd: 3, bld: 5 } },
  grunt:   { layer: 'planet', name: 'Grunt', hp: 70, speed: 34, r: 9, rng: 85, rof: 1.0, dmg: 8, body: 'inf', bounty: 8, wpn: 'mg', baseDmg: 6, men: 4, desc: 'Alien infantry.',
    vs: { inf: 4, arm: 1, bld: 2 } },
  crawler: { layer: 'planet', name: 'Crawler', hp: 210, speed: 46, r: 13, rng: 105, rof: 1.6, dmg: 20, body: 'arm', bounty: 20, wpn: 'shell', baseDmg: 18, desc: 'Fast armored bug tank.',
    vs: { inf: 4, arm: 3, bld: 3 } },
  walker:  { layer: 'planet', name: 'Walker', hp: 560, speed: 26, r: 18, rng: 135, rof: 2.4, dmg: 42, body: 'arm', bounty: 45, wpn: 'shell', baseDmg: 40, desc: 'Heavy assault walker.',
    vs: { inf: 4, arm: 4, bld: 4 } },
};

// bases
export const BASES = {
  station: { layer: 'space', name: 'Station', hp: 1800, rng: 140, rof: 0.5, dmg: 14, wpn: 'beam', vs: { sml: 4, cap: 2, lnd: 4 } },
  hq:      { layer: 'planet', name: 'HQ', hp: 1800, rng: 140, rof: 0.5, dmg: 15, wpn: 'mg', vs: { inf: 4, arm: 2 } },
};

export const TECH = {
  sw: { layer: 'space', icon: '⚔️', name: 'Ship weapons', costs: [180, 320, 480], mult: 0.2 },
  sh: { layer: 'space', icon: '🛡️', name: 'Ship hulls', costs: [160, 300, 450], mult: 0.25 },
  gw: { layer: 'planet', icon: '⚔️', name: 'Troop weapons', costs: [150, 280, 420], mult: 0.2 },
  gh: { layer: 'planet', icon: '🛡️', name: 'Troop armor', costs: [140, 260, 400], mult: 0.25 },
};

// ---------- waves ----------
// each group: [delay s from wave start, type, count, lane ('r' random | number), gap s, cargo for landers]
export function makeWaves() {
  return [
    /* 1 */ [[0, 'drone', 6, 1, 1.1], [6, 'raider', 3, 'r', 1.6]],
    /* 2 */ [[0, 'raider', 5, 'r', 1.2], [5, 'lander', 1, 0, 0, ['grunt', 'grunt', 'grunt']], [9, 'drone', 6, 2, .8]],
    /* 3 */ [[0, 'drone', 8, 'r', .7], [4, 'gunship', 1, 1, 0], [8, 'lander', 2, 'r', 3, ['grunt', 'grunt', 'grunt', 'grunt']]],
    /* 4 */ [[0, 'raider', 6, 0, .9], [0, 'raider', 6, 2, .9], [7, 'lander', 2, 'r', 2.5, ['grunt', 'grunt', 'crawler']], [10, 'gunship', 2, 1, 3]],
    /* 5 */ [[0, 'gunship', 3, 'r', 2.5], [3, 'drone', 12, 'r', .5], [9, 'lander', 3, 'r', 2.4, ['grunt', 'grunt', 'crawler', 'crawler']]],
    /* 6 */ [[0, 'cruiser', 1, 1, 0], [2, 'raider', 8, 'r', .8], [8, 'lander', 4, 'r', 2, ['crawler', 'crawler', 'grunt', 'grunt']]],
    /* 7 */ [[0, 'drone', 16, 'r', .4], [5, 'gunship', 4, 'r', 2], [10, 'lander', 4, 'r', 2, ['grunt', 'grunt', 'grunt', 'walker']]],
    /* 8 */ [[0, 'cruiser', 2, 'r', 5], [3, 'raider', 10, 'r', .7], [9, 'lander', 4, 'r', 1.8, ['crawler', 'crawler', 'walker']]],
    /* 9 */ [[0, 'gunship', 6, 'r', 1.4], [4, 'drone', 18, 'r', .35], [8, 'lander', 6, 'r', 1.4, ['grunt', 'grunt', 'crawler', 'walker']]],
    /* 10 */ [[0, 'cruiser', 3, 'r', 4], [2, 'raider', 14, 'r', .55], [6, 'lander', 6, 'r', 1.5, ['crawler', 'crawler', 'walker', 'walker']]],
    /* 11 */ [[0, 'cruiser', 4, 'r', 3], [0, 'gunship', 6, 'r', 1.5], [5, 'drone', 20, 'r', .3], [8, 'lander', 6, 'r', 1.4, ['grunt', 'grunt', 'grunt', 'walker', 'walker']]],
    /* 12 BOSS */ [[0, 'mother', 1, 1, 0], [2, 'raider', 10, 'r', 1], [6, 'gunship', 4, 'r', 3], [10, 'lander', 4, 'r', 3, ['walker', 'crawler', 'crawler', 'grunt']]],
  ].map((w) => w.map(([t, type, n, lane, gap, cargo]) => ({ t, type, n, lane, gap, cargo: cargo || null })));
}
export const waveHpMul = (w) => 1 + 0.09 * (w - 1);
export const waveBonus = (w) => 110 + 30 * w;
