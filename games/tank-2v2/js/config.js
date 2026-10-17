// Game data: units, buildings, damage table, economy. All tuning lives here.
export const START_MONEY = 1500;
export const HQ_INCOME = 2;      // $/s  (120/min)
export const DEPOT_INCOME = 4.5; // $/s  (270/min)
export const BUILD_RADIUS = 44;  // from HQ / any own finished building
export const VISION_BLD = 40;

// armor classes: inf, light, armor, gun, bld, air.  weapons: mg, at, cannon, he, flak, aamg, rocket, bomb
export const DMG_MULT = {
  mg:     { inf: 1.0, light: 0.8, armor: 0.04, gun: 1.5, bld: 0.08, air: 0 },
  at:     { inf: 0.08, light: 1.1, armor: 1.0, gun: 0.35, bld: 0.4, air: 0 },
  cannon: { inf: 1.25, light: 1.0, armor: 1.0, gun: 0.35, bld: 0.7, air: 0 },
  he:     { inf: 1.3, light: 1.0, armor: 0.55, gun: 1.3, bld: 1.6, air: 0 },
  flak:   { inf: 0, light: 0, armor: 0, gun: 0, bld: 0, air: 1 },
  aamg:   { inf: 0, light: 0, armor: 0, gun: 0, bld: 0, air: 1 },
  rocket: { inf: 0.7, light: 1.2, armor: 1.3, gun: 1.0, bld: 0.8, air: 0 },
  bomb:   { inf: 1.0, light: 1.0, armor: 0.8, gun: 1.2, bld: 2.2, air: 0 },
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
// r: collision radius, vis: vision, rng: range, rof: seconds between shots, dmg: base damage per shot
export const UNITS = {
  // infantry (Barracks)
  rifle:    { br: 'inf', name: 'Rifle Squad', cost: 100, time: 5, kind: 'inf', men: 8, hpm: 12, speed: 5.2, r: 2.3, vis: 55, rng: 26, rof: 1.0, dmg: 10, wpn: 'mg', armor: 'inf', ability: 'sprint', desc: '8 men. Cheap all-rounder.' },
  bazooka:  { br: 'inf', name: 'Bazooka Team', cost: 170, time: 6, kind: 'inf', men: 4, hpm: 15, speed: 4.6, r: 1.9, vis: 50, rng: 29, rof: 3.2, dmg: 36, wpn: 'at', armor: 'inf', ability: 'ambush', desc: '4 men. Anti-tank.' },
  scout:    { br: 'inf', name: 'Scout Team', cost: 90, time: 4, kind: 'inf', men: 3, hpm: 12, speed: 6.2, r: 1.7, vis: 105, rng: 22, rof: 1.2, dmg: 3, wpn: 'mg', armor: 'inf', ability: 'binoculars', desc: '3 men. Huge vision.' },
  engineer: { br: 'inf', name: 'Engineers', cost: 150, time: 6, kind: 'inf', men: 5, hpm: 12, speed: 4.8, r: 2, vis: 50, rng: 22, rof: 1.2, dmg: 5, wpn: 'mg', armor: 'inf', ability: 'mine', repair: 9, desc: '5 men. Repair nearby vehicles and buildings, lay mines.' },
  mgteam:   { br: 'inf', name: 'Machine Gun Team', cost: 160, time: 6, kind: 'inf', men: 4, hpm: 14, speed: 4.4, r: 1.9, vis: 52, rng: 30, rof: 0.55, dmg: 7, wpn: 'mg', armor: 'inf', suppress: true, ability: 'deploy', desc: '4 men. Suppresses infantry.' },
  commando: { br: 'inf', name: 'Commandos', cost: 320, time: 9, kind: 'inf', men: 4, hpm: 26, speed: 5.8, r: 1.9, vis: 65, rng: 26, rof: 0.8, dmg: 12, wpn: 'mg', armor: 'inf', ability: 'satchel', desc: '4 elite men. Satchel charge vs tanks and buildings.' },
  jeep:     { br: 'inf', name: 'Recon Jeep', cost: 100, time: 5, kind: 'veh', hp: 50, speed: 14, turn: 3.4, r: 1.6, vis: 100, rng: 28, rof: 0.9, dmg: 6, wpn: 'mg', armor: 'light', desc: 'Fast, sees far. Weak.' },
  // armor (Tank factory)
  light:    { br: 'armor', name: 'Light Tank', cost: 250, time: 8, kind: 'veh', hp: 110, speed: 11, turn: 3.2, r: 1.9, vis: 62, rng: 34, rof: 1.6, dmg: 15, wpn: 'cannon', armor: 'armor', desc: 'Fast, light armor.' },
  medium:   { br: 'armor', name: 'Medium Tank', cost: 400, time: 11, kind: 'veh', hp: 170, speed: 7.5, turn: 2.6, r: 2.1, vis: 66, rng: 40, rof: 2.1, dmg: 23, wpn: 'cannon', armor: 'armor', desc: 'All-round tank.' },
  heavy:    { br: 'armor', name: 'Heavy Tank', cost: 650, time: 15, kind: 'veh', hp: 300, speed: 5, turn: 1.8, r: 2.5, vis: 66, rng: 44, rof: 2.8, dmg: 34, wpn: 'cannon', armor: 'armor', front: 0.65, desc: 'Slow. Very strong front armor.' },
  // artillery
  atgun:    { br: 'art', name: 'AT Gun', cost: 220, time: 8, kind: 'gun', hp: 75, speed: 3.6, turn: 1.4, r: 1.9, vis: 50, rng: 48, rof: 2.4, dmg: 48, wpn: 'at', armor: 'gun', deploy: 1.4, desc: 'Kills tanks. Weak vs infantry. Stops to fire.' },
  howitzer: { br: 'art', name: 'Howitzer', cost: 450, time: 12, kind: 'gun', hp: 70, speed: 3.4, turn: 1.2, r: 2.2, vis: 30, rng: 135, minRng: 24, rof: 6.5, dmg: 46, splash: 6, wpn: 'he', armor: 'gun', deploy: 2.2, indirect: true, desc: 'Long-range shelling. Needs spotting.' },
  aagun:    { br: 'art', name: 'AA Gun', cost: 200, time: 7, kind: 'gun', hp: 70, speed: 4, turn: 2.5, r: 1.9, vis: 45, rng: 62, rof: 0.7, dmg: 13, wpn: 'flak', armor: 'gun', antiAir: true, desc: 'Shoots down aircraft. Flak.' },
  // air (Airfield)
  reconplane:{ br: 'air', name: 'Recon Plane', cost: 200, time: 7, kind: 'air', hp: 60, speed: 30, r: 3, vis: 95, alt: 34, loiter: 30, desc: 'Reveals an area. Unarmed.' },
  fighter:  { br: 'air', name: 'Fighter', cost: 350, time: 9, kind: 'air', hp: 90, speed: 34, r: 3, vis: 60, rng: 30, rof: 0.35, dmg: 8, wpn: 'aamg', alt: 30, loiter: 40, desc: 'Shoots down aircraft.' },
  fbomber:  { br: 'air', name: 'Fighter-Bomber', cost: 450, time: 11, kind: 'air', hp: 110, speed: 30, r: 3, vis: 55, dmg: 75, wpn: 'rocket', alt: 30, ammo: 2, desc: 'Dives on ground targets. Good vs tanks.' },
  bomber:   { br: 'air', name: 'Bomber', cost: 600, time: 14, kind: 'air', hp: 220, speed: 20, r: 4.5, vis: 50, dmg: 70, splash: 9, wpn: 'bomb', alt: 38, ammo: 1, desc: 'Slow. Big area damage, best vs buildings.' },
};
for (const u of Object.values(UNITS)) if (u.kind === 'inf') u.hp = u.men * u.hpm;
for (const u of Object.values(UNITS)) if (u.kind === 'air') u.armor = 'air';

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
