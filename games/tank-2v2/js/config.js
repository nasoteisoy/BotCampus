// Game data: units, buildings, damage table, economy. All tuning lives here.
export const START_MONEY = 1500;
export const HQ_INCOME = 2;      // $/s  (120/min)
export const DEPOT_INCOME = 4.5; // $/s  (270/min)
export const BUILD_RADIUS = 44;  // from HQ / any own finished building
export const VISION_BLD = 40;

// ---------- body types & attack levels ----------
// Every unit has a BODY type (what it is when it gets shot) and, per body type, an attack LEVEL 0-5 and an attack RANGE.
// lvl 0 = cannot hit that body at all (never targeted). The damage multiplier comes only from the level (LVL_MULT).
// Bodies map onto the old armor classes: inf, armor, air, gun -> art, light -> truck, bld.
export const BODIES = {
  inf:   { name: 'Infantry', icon: '🪖' },
  armor: { name: 'Armor', icon: '🛡️' },
  air:   { name: 'Air', icon: '✈️' },
  art:   { name: 'Artillery', icon: '💥' },
  truck: { name: 'Truck/Jeep', icon: '🚙' },
  bld:   { name: 'Building', icon: '🏠' },
};
export const BODY_KEYS = ['inf', 'armor', 'air', 'art', 'truck', 'bld'];
export const ARMOR_BODY = { inf: 'inf', armor: 'armor', air: 'air', gun: 'art', light: 'truck', bld: 'bld' };
// level -> damage multiplier. Seeded so the old weapon x armor table (kept in the comment below) is reproduced closely:
// lvl1 ~ token (old .04/.08), lvl2 ~ poor (.35-.55), lvl3 ~ fair (.7-.8), lvl4 ~ full (1.0-1.1), lvl5 ~ strong (1.2-1.6).
export const LVL_MULT = [0, 0.06, 0.4, 0.75, 1.0, 1.4];
// old table (weapon x armor), for reference only:
//   mg     inf 1.0  light .8  armor .04 gun 1.5 bld .08 | at     inf .08 light 1.1 armor 1.0 gun .35 bld .4
//   cannon inf 1.25 light 1.0 armor 1.0 gun .35 bld .7  | he     inf 1.3 light 1.0 armor .55 gun 1.3 bld 1.6
//   rocket inf .7   light 1.2 armor 1.3 gun 1.0 bld .8  | bomb   inf 1.0 light 1.0 armor .8  gun 1.2 bld 2.2 | flak/aamg air 1
// Ability damage (satchel charge, mines) is not a unit attack and keeps its own multipliers per armor class:
export const DMG_MULT = {
  satchel:{ inf: 1, light: 1.5, armor: 1.5, gun: 1.5, bld: 2.5, air: 0 },
  mine:   { inf: 0.6, light: 1.2, armor: 1.0, gun: 1.0, bld: 0, air: 0 },
};

export const BRANCHES = {
  inf: { name: 'Infantry', color: '#7fc96b' },
  armor: { name: 'Armor', color: '#5aa0ff' },
  art: { name: 'Artillery', color: '#ffb347' },
  air: { name: 'Air', color: '#c58cff' },
};

// kind: inf (squad of men) | veh | gun | air.  men: squad size, hpm: hp per man.
// r: collision radius, vis: vision, rng: base range (kept for reference/AI), rof: seconds between shots, dmg: base damage per shot
// weapons (visual/ballistics): mg, at, cannon, he, flak, aamg, rocket, bomb. Only mg/flak/aamg (hit-scan) can reach aircraft.
// vs: per body type { lvl 0-5, rng }. Aircraft with rockets/bombs: rng = how far from the ordered point they pick a target.
export const UNITS = {
  // infantry (Barracks)
  rifle:    { br: 'inf', name: 'Rifle Squad', cost: 100, time: 5, kind: 'inf', men: 8, hpm: 12, speed: 5.2, r: 2.3, vis: 55, rng: 26, rof: 1.0, dmg: 10, wpn: 'mg', armor: 'inf', ability: 'sprint', desc: '8 men. Cheap all-rounder.',
    vs: { inf:{ lvl:4, rng:26 }, armor:{ lvl:1, rng:26 }, air:{ lvl:0, rng:0 }, art:{ lvl:5, rng:26 }, truck:{ lvl:3, rng:26 }, bld:{ lvl:1, rng:26 } } },
  bazooka:  { br: 'inf', name: 'Bazooka Team', cost: 170, time: 6, kind: 'inf', men: 4, hpm: 15, speed: 4.6, r: 1.9, vis: 50, rng: 29, rof: 3.2, dmg: 36, wpn: 'at', armor: 'inf', ability: 'ambush', desc: '4 men. Anti-tank.',
    vs: { inf:{ lvl:1, rng:29 }, armor:{ lvl:4, rng:29 }, air:{ lvl:0, rng:0 }, art:{ lvl:2, rng:29 }, truck:{ lvl:4, rng:29 }, bld:{ lvl:2, rng:29 } } },
  scout:    { br: 'inf', name: 'Scout Team', cost: 90, time: 4, kind: 'inf', men: 3, hpm: 12, speed: 6.2, r: 1.7, vis: 105, rng: 22, rof: 1.2, dmg: 3, wpn: 'mg', armor: 'inf', ability: 'binoculars', desc: '3 men. Huge vision.',
    vs: { inf:{ lvl:4, rng:22 }, armor:{ lvl:1, rng:22 }, air:{ lvl:0, rng:0 }, art:{ lvl:5, rng:22 }, truck:{ lvl:3, rng:22 }, bld:{ lvl:1, rng:22 } } },
  engineer: { br: 'inf', name: 'Engineers', cost: 150, time: 6, kind: 'inf', men: 5, hpm: 12, speed: 4.8, r: 2, vis: 50, rng: 22, rof: 1.2, dmg: 5, wpn: 'mg', armor: 'inf', ability: 'mine', repair: 9, desc: '5 men. Repair nearby vehicles and buildings, lay mines.',
    vs: { inf:{ lvl:4, rng:22 }, armor:{ lvl:1, rng:22 }, air:{ lvl:0, rng:0 }, art:{ lvl:5, rng:22 }, truck:{ lvl:3, rng:22 }, bld:{ lvl:1, rng:22 } } },
  mgteam:   { br: 'inf', name: 'Machine Gun Team', cost: 160, time: 6, kind: 'inf', men: 4, hpm: 14, speed: 4.4, r: 1.9, vis: 52, rng: 30, rof: 0.55, dmg: 7, wpn: 'mg', armor: 'inf', suppress: true, ability: 'deploy', desc: '4 men. Suppresses infantry.',
    vs: { inf:{ lvl:4, rng:30 }, armor:{ lvl:1, rng:30 }, air:{ lvl:0, rng:0 }, art:{ lvl:5, rng:30 }, truck:{ lvl:3, rng:30 }, bld:{ lvl:1, rng:30 } } },
  commando: { br: 'inf', name: 'Commandos', cost: 320, time: 9, kind: 'inf', men: 4, hpm: 26, speed: 5.8, r: 1.9, vis: 65, rng: 26, rof: 0.8, dmg: 12, wpn: 'mg', armor: 'inf', ability: 'satchel', desc: '4 elite men. Satchel charge vs tanks and buildings.',
    vs: { inf:{ lvl:4, rng:26 }, armor:{ lvl:1, rng:26 }, air:{ lvl:0, rng:0 }, art:{ lvl:5, rng:26 }, truck:{ lvl:3, rng:26 }, bld:{ lvl:1, rng:26 } } },
  jeep:     { br: 'inf', name: 'Recon Jeep', cost: 100, time: 5, kind: 'veh', hp: 50, speed: 14, turn: 3.4, r: 1.6, vis: 100, rng: 28, rof: 0.9, dmg: 6, wpn: 'mg', armor: 'light', desc: 'Fast, sees far. Weak.',
    vs: { inf:{ lvl:4, rng:28 }, armor:{ lvl:1, rng:28 }, air:{ lvl:0, rng:0 }, art:{ lvl:5, rng:28 }, truck:{ lvl:3, rng:28 }, bld:{ lvl:1, rng:28 } } },
  // armor (Tank factory)
  light:    { br: 'armor', name: 'Light Tank', cost: 250, time: 8, kind: 'veh', hp: 110, speed: 11, turn: 3.2, r: 1.9, vis: 62, rng: 34, rof: 1.6, dmg: 15, wpn: 'cannon', armor: 'armor', desc: 'Fast, light armor.',
    vs: { inf:{ lvl:5, rng:34 }, armor:{ lvl:4, rng:34 }, air:{ lvl:0, rng:0 }, art:{ lvl:2, rng:34 }, truck:{ lvl:4, rng:34 }, bld:{ lvl:3, rng:34 } } },
  medium:   { br: 'armor', name: 'Medium Tank', cost: 400, time: 11, kind: 'veh', hp: 170, speed: 7.5, turn: 2.6, r: 2.1, vis: 66, rng: 40, rof: 2.1, dmg: 23, wpn: 'cannon', armor: 'armor', desc: 'All-round tank.',
    vs: { inf:{ lvl:5, rng:40 }, armor:{ lvl:4, rng:40 }, air:{ lvl:0, rng:0 }, art:{ lvl:2, rng:40 }, truck:{ lvl:4, rng:40 }, bld:{ lvl:3, rng:40 } } },
  heavy:    { br: 'armor', name: 'Heavy Tank', cost: 650, time: 15, kind: 'veh', hp: 300, speed: 5, turn: 1.8, r: 2.5, vis: 66, rng: 44, rof: 2.8, dmg: 34, wpn: 'cannon', armor: 'armor', front: 0.65, desc: 'Slow. Very strong front armor.',
    vs: { inf:{ lvl:5, rng:44 }, armor:{ lvl:4, rng:44 }, air:{ lvl:0, rng:0 }, art:{ lvl:2, rng:44 }, truck:{ lvl:4, rng:44 }, bld:{ lvl:3, rng:44 } } },
  // artillery
  atgun:    { br: 'art', name: 'AT Gun', cost: 220, time: 8, kind: 'gun', hp: 75, speed: 3.6, turn: 1.4, r: 1.9, vis: 50, rng: 48, rof: 2.4, dmg: 48, wpn: 'at', armor: 'gun', deploy: 1.4, desc: 'Kills tanks. Weak vs infantry. Stops to fire.',
    vs: { inf:{ lvl:1, rng:48 }, armor:{ lvl:4, rng:48 }, air:{ lvl:0, rng:0 }, art:{ lvl:2, rng:48 }, truck:{ lvl:4, rng:48 }, bld:{ lvl:2, rng:48 } } },
  howitzer: { br: 'art', name: 'Howitzer', cost: 450, time: 12, kind: 'gun', hp: 70, speed: 3.4, turn: 1.2, r: 2.2, vis: 30, rng: 135, minRng: 24, rof: 6.5, dmg: 46, splash: 6, wpn: 'he', armor: 'gun', deploy: 2.2, indirect: true, desc: 'Long-range shelling. Needs spotting.',
    vs: { inf:{ lvl:5, rng:135 }, armor:{ lvl:3, rng:135 }, air:{ lvl:0, rng:0 }, art:{ lvl:5, rng:135 }, truck:{ lvl:4, rng:135 }, bld:{ lvl:5, rng:135 } } },
  aagun:    { br: 'art', name: 'AA Gun', cost: 200, time: 7, kind: 'gun', hp: 70, speed: 4, turn: 2.5, r: 1.9, vis: 45, rng: 62, rof: 0.7, dmg: 13, wpn: 'flak', armor: 'gun', antiAir: true, desc: 'Shoots down aircraft. Flak.',
    vs: { inf:{ lvl:0, rng:0 }, armor:{ lvl:0, rng:0 }, air:{ lvl:4, rng:62 }, art:{ lvl:0, rng:0 }, truck:{ lvl:0, rng:0 }, bld:{ lvl:0, rng:0 } } },
  // air (Airfield)
  reconplane:{ br: 'air', name: 'Recon Plane', cost: 200, time: 7, kind: 'air', hp: 60, speed: 30, r: 3, vis: 95, alt: 34, loiter: 30, desc: 'Reveals an area. Unarmed.',
    vs: { inf:{ lvl:0, rng:0 }, armor:{ lvl:0, rng:0 }, air:{ lvl:0, rng:0 }, art:{ lvl:0, rng:0 }, truck:{ lvl:0, rng:0 }, bld:{ lvl:0, rng:0 } } },
  fighter:  { br: 'air', name: 'Fighter', cost: 350, time: 9, kind: 'air', hp: 90, speed: 34, r: 3, vis: 60, rng: 30, rof: 0.35, dmg: 8, wpn: 'aamg', alt: 30, loiter: 40, desc: 'Shoots down aircraft.',
    vs: { inf:{ lvl:0, rng:0 }, armor:{ lvl:0, rng:0 }, air:{ lvl:4, rng:30 }, art:{ lvl:0, rng:0 }, truck:{ lvl:0, rng:0 }, bld:{ lvl:0, rng:0 } } },
  fbomber:  { br: 'air', name: 'Fighter-Bomber', cost: 450, time: 11, kind: 'air', hp: 110, speed: 30, r: 3, vis: 55, dmg: 75, wpn: 'rocket', alt: 30, ammo: 2, rocketWin: [14, 38], desc: 'Dives on ground targets. Good vs tanks.',
    vs: { inf:{ lvl:3, rng:35 }, armor:{ lvl:5, rng:35 }, air:{ lvl:0, rng:0 }, art:{ lvl:4, rng:35 }, truck:{ lvl:5, rng:35 }, bld:{ lvl:3, rng:35 } } },
  bomber:   { br: 'air', name: 'Bomber', cost: 600, time: 14, kind: 'air', hp: 220, speed: 20, r: 4.5, vis: 50, dmg: 70, splash: 9, wpn: 'bomb', alt: 38, ammo: 1, desc: 'Slow. Big area damage, best vs buildings.',
    vs: { inf:{ lvl:4, rng:35 }, armor:{ lvl:3, rng:35 }, air:{ lvl:0, rng:0 }, art:{ lvl:5, rng:35 }, truck:{ lvl:4, rng:35 }, bld:{ lvl:5, rng:35 } } },
};
for (const u of Object.values(UNITS)) if (u.kind === 'inf') u.hp = u.men * u.hpm;
for (const u of Object.values(UNITS)) if (u.kind === 'air') u.armor = 'air';
for (const u of Object.values(UNITS)) u.body = ARMOR_BODY[u.armor];   // body type: Infantry / Armor / Air / Artillery / Truck/Jeep

export const ABILITIES = {
  sprint:     { key: 'KeyQ', label: 'Q', name: 'Sprint', cd: 20, dur: 6, desc: 'Run 80% faster for 6 s.' },
  ambush:     { key: 'KeyE', label: 'E', name: 'Ambush', cd: 12, desc: 'Hide while still. First shot deals double damage.' },
  binoculars: { key: 'KeyR', label: 'R', name: 'Binoculars', cd: 25, dur: 8, desc: 'Reveal a wide area for 8 s.' },
  mine:       { key: 'KeyF', label: 'F', name: 'Lay Mine', cd: 10, desc: 'Hidden mine; blows up enemy vehicles.' },
  deploy:     { key: 'KeyG', label: 'G', name: 'Deploy MG', cd: 3, desc: 'Set up: much faster fire and longer range, cannot move.' },
  satchel:    { key: 'KeyT', label: 'T', name: 'Satchel Charge', cd: 25, desc: 'Run in and blow up the nearest tank or building.' },
};

// hx/hz: half size of footprint; door points toward the enemy
export const BUILDINGS = {
  hq:        { name: 'HQ', cost: 0, time: 0, hp: 1800, hx: 7, hz: 6, h: 7, units: [] },
  depot:     { br: 'eco', name: 'Supply Depot', cost: 250, time: 7, hp: 450, hx: 4.5, hz: 4.5, h: 4, units: [], desc: 'Place on a supply spot. +$270/min.' },
  barracks:  { br: 'inf', name: 'Barracks', cost: 300, time: 8, hp: 600, hx: 6, hz: 4.5, h: 5, units: ['rifle', 'bazooka', 'scout', 'engineer', 'mgteam', 'commando'], desc: 'All infantry squads.' },
  recon:     { br: 'inf', name: 'Recon Post', cost: 200, time: 6, hp: 400, hx: 4, hz: 4, h: 9, units: ['jeep'], desc: 'Recon jeeps: fast, big vision.' },
  factory:   { br: 'armor', name: 'Tank Factory', cost: 500, time: 11, hp: 800, hx: 7.5, hz: 6, h: 7, units: ['light', 'medium', 'heavy'], desc: 'Light, medium and heavy tanks.' },
  atdepot:   { br: 'art', name: 'AT Gun Depot', cost: 350, time: 8, hp: 550, hx: 5.5, hz: 4.5, h: 4.5, units: ['atgun'], desc: 'Towed anti-tank guns.' },
  artillery: { br: 'art', name: 'Artillery Base', cost: 450, time: 10, hp: 550, hx: 6, hz: 5, h: 4.5, units: ['howitzer', 'aagun'], desc: 'Howitzers and AA guns.' },
  airfield:  { br: 'air', name: 'Airfield', cost: 600, time: 12, hp: 700, hx: 14, hz: 6, h: 5, units: ['reconplane', 'fighter', 'fbomber', 'bomber'], desc: 'Planes. Need AA to counter.' },
};
export const BUILD_ORDER = ['depot', 'barracks', 'recon', 'factory', 'atdepot', 'artillery', 'airfield'];

export const HQ_POS = { blue: { x: 16, z: 120 }, red: { x: 4, z: -121 } };
// supply spots [x, z]: own side, contested middle
export const SUPPLY = [
  [42, 110], [-2, 100], [26, 80],
  [36, -108], [-20, -104], [26, -80],
  [-32, 22], [44, 24], [116, 34],
  [-30, -26], [40, -18], [112, -30],
];
