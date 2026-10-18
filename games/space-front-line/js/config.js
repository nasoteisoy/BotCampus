// Game data: units, buildings, damage table, economy. All tuning lives here.
export const START_MONEY = 1500;
export const HQ_INCOME = 2;      // $/s  (120/min)
export const DEPOT_INCOME = 4.5; // $/s  (270/min)
export const BUILD_RADIUS = 44;  // from HQ / any own finished building
export const VISION_BLD = 40;
export const SOLAR_INCOME = 3;   // $/s per Solar Array (space economy, 180/min)
// ---------- the two layers ----------
// The planet map lives at x in [-HALF, HALF]. Space is the same x/z grid shifted by SPACE_X: a ship at (x + SPACE_X, z)
// is in orbit right above the ground point (x, z). Every distance-based rule (targeting, spotting, splash) therefore
// keeps the two layers apart for free; only orbital strikes and troop drops cross between them.
export const SPACE_X = 1000;
export const ORBIT_R = 60;       // orbital strike / troop drop reach around the point below the ship
// commanders: player 'blue' + ally 'blue2' vs 'red' + 'red2'. side = team for combat & fog; cmd = who owns it (money, AI)
export const SIDE = { blue: 'blue', blue2: 'blue', red: 'red', red2: 'red' };

// ---------- body types & attack levels ----------
// Every unit has a BODY type (what it is when it gets shot) and, per body type, an attack LEVEL 0-5 and an attack RANGE.
// lvl 0 = cannot hit that body at all (never targeted). The damage multiplier comes only from the level (LVL_MULT).
// Bodies map onto the old armor classes: inf, armor, air, gun -> art, light -> truck, bld.
export const BODIES = {
  inf:   { name: 'Infantry', icon: '🪖' },
  armor: { name: 'Armor', icon: '🛡️' },
  air:   { name: 'Craft', icon: '🛸' },
  art:   { name: 'Guns', icon: '💥' },
  truck: { name: 'Light', icon: '🚙' },
  bld:   { name: 'Structure', icon: '🏠' },
};
export const BODY_KEYS = ['inf', 'armor', 'air', 'art', 'truck', 'bld'];
export const ARMOR_BODY = { inf: 'inf', armor: 'armor', air: 'air', gun: 'art', light: 'truck', bld: 'bld' };
// level -> damage multiplier. Seeded so the old weapon x armor table (kept in the comment below) is reproduced closely:
// lvl1 ~ token (old .04/.08), lvl2 ~ poor (.35-.55), lvl3 ~ fair (.7-.8), lvl4 ~ full (1.0-1.1), lvl5 ~ strong (1.2-1.6).
export const LVL_MULT = [0, 0.06, 0.4, 0.75, 1.0, 1.4];
// ---------- accuracy level (vs.<body>.acc, 1-5; 0 = cannot hit). Seeded so the game plays exactly as before ----------
// hit-scan weapons (mg, aamg, flak): chance per burst to hit. acc 4 = 72% (MG vs infantry), 5 = 80% (MG vs vehicles,
//   fighter guns), 2 = 50% (flak). Infantry in cover (forest, town, garrison, ambush) is harder: x CONCEAL_HIT (72% -> 50%).
export const ACC_HIT = [0, 0.35, 0.5, 0.62, 0.72, 0.8];
export const CONCEAL_HIT = 0.5 / 0.72;
// shells & rockets from the ground (cannon, at): sideways wobble = +-(0.6 + 0.05*d) x ACC_SPREAD (acc 3 = x1),
//   x CONCEAL_SPREAD vs any concealed target, x BLD_SPREAD vs buildings (big). Moving targets are led by SHELL_LEAD of their motion.
// howitzer (he): landing spread = +-(2 + 0.045*d) x ACC_SPREAD, no lead.  bomber: stick spacing 2.2 m x ACC_SPREAD (acc 3 = 2.2 m).
// plane rockets: aim offset +-ACC_RKT m (acc 5 = dead-on, as before).
export const ACC_SPREAD = [0, 1.6, 1.25, 1.0, 0.8, 0.62];
export const ACC_RKT = [0, 4, 3, 2, 1, 0];
export const CONCEAL_SPREAD = 1.6, BLD_SPREAD = 0.3, SHELL_LEAD = 0.9;
// old table (weapon x armor), for reference only:
//   mg     inf 1.0  light .8  armor .04 gun 1.5 bld .08 | at     inf .08 light 1.1 armor 1.0 gun .35 bld .4
//   cannon inf 1.25 light 1.0 armor 1.0 gun .35 bld .7  | he     inf 1.3 light 1.0 armor .55 gun 1.3 bld 1.6
//   rocket inf .7   light 1.2 armor 1.3 gun 1.0 bld .8  | bomb   inf 1.0 light 1.0 armor .8  gun 1.2 bld 2.2 | flak/aamg air 1
// Ability damage (satchel charge, mines) is not a unit attack and keeps its own multipliers per armor class:
export const DMG_MULT = {
  satchel:{ inf: 1, light: 1.5, armor: 1.5, gun: 1.5, bld: 2.5, air: 0 },
  orbital:{ inf: 1, light: 1.2, armor: 0.9, gun: 1.2, bld: 0.8, air: 0 },
  mine:   { inf: 0.6, light: 1.2, armor: 1.0, gun: 1.0, bld: 0, air: 0 },
};

export const BRANCHES = {
  inf: { name: 'Infantry', color: '#7fc96b' },
  armor: { name: 'Armor', color: '#5aa0ff' },
  art: { name: 'Artillery', color: '#ffb347' },
  air: { name: 'Air', color: '#c58cff' },
  fleet: { name: 'Fleet', color: '#5ce1c8' },
};
export const SPACE_BRANCHES = ['fleet', 'air'];      // build-bar tabs in each view
export const PLANET_BRANCHES = ['inf', 'armor', 'art'];

// kind: inf (squad of men) | veh | gun | air.  men: squad size, hpm: hp per man.
// r: collision radius, vis: vision, rng: base range (kept for reference/AI), rof: seconds between shots, dmg: base damage per shot
// weapons (visual/ballistics): mg, at, cannon, he, flak, aamg, rocket, bomb. Only mg/flak/aamg (hit-scan) can reach aircraft.
// vs: per body type { lvl 0-5, rng, acc 0-5 } (rng: attack range vs that body; acc: accuracy level, see ACC_*). Aircraft with rockets/bombs: rng = how far from the ordered point they pick a target.
export const UNITS = {
  // infantry (Barracks)
  rifle:    { br: 'inf', name: 'Marines', cost: 100, time: 5, kind: 'inf', men: 8, hpm: 12, speed: 5.2, r: 2.3, vis: 55, rng: 28, rof: 1.0, dmg: 10, wpn: 'mg', armor: 'inf', ability: 'sprint', desc: '8 marines. Cheap all-rounder.',
    vs: { inf:{ lvl:4, rng:28, acc:4 }, armor:{ lvl:1, rng:16, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:26, acc:5 }, truck:{ lvl:3, rng:24, acc:5 }, bld:{ lvl:1, rng:18, acc:5 } } },
  bazooka:  { br: 'inf', name: 'Rocket Troopers', cost: 170, time: 6, kind: 'inf', men: 4, hpm: 15, speed: 4.6, r: 1.9, vis: 50, rng: 32, rof: 3.2, dmg: 36, wpn: 'at', armor: 'inf', ability: 'ambush', desc: '4 men. Anti-tank.',
    vs: { inf:{ lvl:1, rng:18, acc:3 }, armor:{ lvl:4, rng:32, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:26, acc:3 }, truck:{ lvl:4, rng:30, acc:3 }, bld:{ lvl:2, rng:24, acc:3 } } },
  scout:    { br: 'inf', name: 'Scouts', cost: 90, time: 4, kind: 'inf', men: 3, hpm: 12, speed: 6.2, r: 1.7, vis: 105, rng: 24, rof: 1.2, dmg: 3, wpn: 'mg', armor: 'inf', ability: 'binoculars', desc: '3 men. Huge vision.',
    vs: { inf:{ lvl:4, rng:24, acc:4 }, armor:{ lvl:1, rng:12, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:22, acc:5 }, truck:{ lvl:3, rng:20, acc:5 }, bld:{ lvl:1, rng:14, acc:5 } } },
  engineer: { br: 'inf', name: 'Engineers', cost: 150, time: 6, kind: 'inf', men: 5, hpm: 12, speed: 4.8, r: 2, vis: 50, rng: 22, rof: 1.2, dmg: 5, wpn: 'mg', armor: 'inf', ability: 'mine', repair: 9, desc: '5 men. Repair nearby vehicles and buildings, lay mines.',
    vs: { inf:{ lvl:4, rng:22, acc:4 }, armor:{ lvl:1, rng:12, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:20, acc:5 }, truck:{ lvl:3, rng:18, acc:5 }, bld:{ lvl:1, rng:14, acc:5 } } },
  mgteam:   { br: 'inf', name: 'Heavy Gunners', cost: 160, time: 6, kind: 'inf', men: 4, hpm: 14, speed: 4.4, r: 1.9, vis: 52, rng: 34, rof: 0.55, dmg: 7, wpn: 'mg', armor: 'inf', suppress: true, ability: 'deploy', desc: '4 men. Suppresses infantry.',
    vs: { inf:{ lvl:4, rng:34, acc:4 }, armor:{ lvl:1, rng:14, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:30, acc:5 }, truck:{ lvl:3, rng:28, acc:5 }, bld:{ lvl:1, rng:18, acc:5 } } },
  commando: { br: 'inf', name: 'Commandos', cost: 320, time: 9, kind: 'inf', men: 4, hpm: 26, speed: 5.8, r: 1.9, vis: 65, rng: 28, rof: 0.8, dmg: 12, wpn: 'mg', armor: 'inf', ability: 'satchel', desc: '4 elite men. Satchel charge vs tanks and buildings.',
    vs: { inf:{ lvl:4, rng:28, acc:4 }, armor:{ lvl:1, rng:16, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:26, acc:5 }, truck:{ lvl:3, rng:24, acc:5 }, bld:{ lvl:1, rng:18, acc:5 } } },
  jeep:     { br: 'inf', name: 'Hover Scout', cost: 100, time: 5, kind: 'veh', hp: 50, speed: 14, turn: 3.4, r: 1.6, vis: 100, rng: 28, rof: 0.9, dmg: 6, wpn: 'mg', armor: 'light', desc: 'Fast, sees far. Weak.',
    vs: { inf:{ lvl:4, rng:28, acc:4 }, armor:{ lvl:1, rng:14, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:26, acc:5 }, truck:{ lvl:3, rng:26, acc:5 }, bld:{ lvl:1, rng:16, acc:5 } } },
  // armor (Tank factory)
  light:    { br: 'armor', name: 'Hover Tank', cost: 250, time: 8, kind: 'veh', hp: 110, speed: 11, turn: 3.2, r: 1.9, vis: 62, rng: 38, rof: 1.6, dmg: 15, wpn: 'cannon', armor: 'armor', desc: 'Fast, light armor.',
    vs: { inf:{ lvl:5, rng:22, acc:3 }, armor:{ lvl:4, rng:38, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:34, acc:3 }, truck:{ lvl:4, rng:36, acc:3 }, bld:{ lvl:3, rng:30, acc:3 } } },
  medium:   { br: 'armor', name: 'Battle Tank', cost: 400, time: 11, kind: 'veh', hp: 170, speed: 7.5, turn: 2.6, r: 2.1, vis: 66, rng: 44, rof: 2.1, dmg: 23, wpn: 'cannon', armor: 'armor', desc: 'All-round tank.',
    vs: { inf:{ lvl:5, rng:24, acc:3 }, armor:{ lvl:4, rng:44, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:40, acc:3 }, truck:{ lvl:4, rng:40, acc:3 }, bld:{ lvl:3, rng:34, acc:3 } } },
  heavy:    { br: 'armor', name: 'Siege Tank', cost: 650, time: 15, kind: 'veh', hp: 300, speed: 5, turn: 1.8, r: 2.5, vis: 66, rng: 50, rof: 2.8, dmg: 34, wpn: 'cannon', armor: 'armor', front: 0.65, desc: 'Slow. Very strong front armor.',
    vs: { inf:{ lvl:5, rng:26, acc:3 }, armor:{ lvl:4, rng:50, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:44, acc:3 }, truck:{ lvl:4, rng:44, acc:3 }, bld:{ lvl:3, rng:38, acc:3 } } },
  // artillery
  atgun:    { br: 'art', name: 'Rail Gun', cost: 220, time: 8, kind: 'gun', hp: 75, speed: 3.6, turn: 1.4, r: 1.9, vis: 50, rng: 50, rof: 2.4, dmg: 48, wpn: 'at', armor: 'gun', deploy: 1.4, desc: 'Kills tanks. Weak vs infantry. Stops to fire.',
    vs: { inf:{ lvl:1, rng:24, acc:3 }, armor:{ lvl:4, rng:50, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:40, acc:3 }, truck:{ lvl:4, rng:46, acc:3 }, bld:{ lvl:2, rng:32, acc:3 } } },
  howitzer: { br: 'art', name: 'Plasma Artillery', cost: 450, time: 12, kind: 'gun', hp: 70, speed: 3.4, turn: 1.2, r: 2.2, vis: 30, rng: 135, minRng: 24, rof: 6.5, dmg: 46, splash: 6, wpn: 'he', armor: 'gun', deploy: 2.2, indirect: true, desc: 'Long-range shelling. Needs spotting.',
    vs: { inf:{ lvl:5, rng:135, acc:3 }, armor:{ lvl:3, rng:135, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:135, acc:3 }, truck:{ lvl:4, rng:135, acc:3 }, bld:{ lvl:5, rng:135, acc:3 } } },
  // warships (Shipyard). Space layer: fly straight, ignore terrain; hover above the starfield.
  corvette: { br: 'fleet', layer: 's', name: 'Corvette', cost: 200, time: 7, kind: 'veh', hp: 90, speed: 13, turn: 3, r: 2, vis: 75, rng: 34, rof: 0.5, dmg: 6, wpn: 'mg', armor: 'light', hover: 3, desc: 'Fast laser ship. Hunts fighters and drones.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:1, rng:24, acc:5 }, air:{ lvl:4, rng:34, acc:4 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:3, rng:30, acc:5 }, bld:{ lvl:1, rng:20, acc:5 } } },
  frigate:  { br: 'fleet', layer: 's', name: 'Frigate', cost: 380, time: 11, kind: 'veh', hp: 190, speed: 8, turn: 2.2, r: 2.6, vis: 70, rng: 46, rof: 2.0, dmg: 24, wpn: 'cannon', armor: 'armor', hover: 3, ability: 'orbital', orbital: 110, desc: 'All-round warship. Orbital strike on the planet below.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:4, rng:46, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:4, rng:44, acc:3 }, bld:{ lvl:3, rng:36, acc:3 } } },
  cruiser:  { br: 'fleet', layer: 's', name: 'Battleship', cost: 700, time: 16, kind: 'veh', hp: 380, speed: 5, turn: 1.4, r: 3.4, vis: 72, rng: 54, rof: 2.8, dmg: 38, wpn: 'cannon', armor: 'armor', front: 0.7, hover: 3.5, ability: 'orbital', orbital: 170, desc: 'Slow and tough. Big orbital strike.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:4, rng:54, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:4, rng:50, acc:3 }, bld:{ lvl:4, rng:44, acc:3 } } },
  carrier:  { br: 'fleet', layer: 's', name: 'Carrier', cost: 550, time: 14, kind: 'veh', hp: 320, speed: 5.5, turn: 1.4, r: 3.6, vis: 90, rng: 30, rof: 0.6, dmg: 5, wpn: 'mg', armor: 'armor', hover: 3.5, ability: 'launch', desc: 'Launches attack drones. Point-defense lasers.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:1, rng:20, acc:5 }, air:{ lvl:4, rng:30, acc:4 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:2, rng:26, acc:5 }, bld:{ lvl:1, rng:18, acc:5 } } },
  dropship: { br: 'fleet', layer: 's', name: 'Dropship', cost: 350, time: 9, kind: 'veh', hp: 130, speed: 10, turn: 2.6, r: 2.4, vis: 60, rng: 0, armor: 'light', hover: 3, ability: 'drop', cargo: ['rifle', 'bazooka'], seats: 2, desc: 'Carries 2 squads. Drop them on the planet below, or pick troops up.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:0, rng:0, acc:0 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:0, rng:0, acc:0 }, bld:{ lvl:0, rng:0, acc:0 } } },
  drone:    { br: 'fleet', layer: 's', name: 'Attack Drone', cost: 0, time: 1, kind: 'veh', hp: 30, speed: 17, turn: 4, r: 1.2, vis: 50, rng: 26, rof: 0.4, dmg: 5, wpn: 'mg', armor: 'light', hover: 4, life: 45, desc: 'Launched by Carriers. Lives 45 s.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:1, rng:18, acc:5 }, air:{ lvl:4, rng:26, acc:4 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:3, rng:24, acc:5 }, bld:{ lvl:1, rng:16, acc:5 } } },
  // space craft (Hangar Bay): fly from the hangar, strike, come back to rearm. Space layer.
  reconplane:{ br: 'air', name: 'Recon Drone', cost: 200, time: 7, kind: 'air', layer: 's', hp: 60, speed: 30, r: 3, vis: 95, alt: 34, loiter: 30, desc: 'Reveals an area of space. Unarmed.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:0, rng:0, acc:0 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:0, rng:0, acc:0 }, bld:{ lvl:0, rng:0, acc:0 } } },
  fighter:  { br: 'air', name: 'Interceptor', cost: 300, time: 8, kind: 'air', layer: 's', hp: 90, speed: 34, r: 3, vis: 60, rng: 30, rof: 0.35, dmg: 8, wpn: 'aamg', alt: 30, loiter: 40, desc: 'Shoots down fighters, bombers and drones.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:0, rng:0, acc:0 }, air:{ lvl:4, rng:30, acc:5 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:0, rng:0, acc:0 }, bld:{ lvl:0, rng:0, acc:0 } } },
  fbomber:  { br: 'air', name: 'Strike Bomber', cost: 420, time: 11, kind: 'air', layer: 's', hp: 110, speed: 30, r: 3, vis: 55, dmg: 75, wpn: 'rocket', alt: 30, ammo: 2, rocketWin: [14, 38], desc: 'Torpedo run on ships. Good vs warships.',
    vs: { inf:{ lvl:3, rng:35, acc:5 }, armor:{ lvl:5, rng:35, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:4, rng:35, acc:5 }, truck:{ lvl:5, rng:35, acc:5 }, bld:{ lvl:3, rng:35, acc:5 } } },
  bomber:   { br: 'air', name: 'Siege Bomber', cost: 560, time: 14, kind: 'air', layer: 's', hp: 220, speed: 20, r: 4.5, vis: 50, dmg: 70, splash: 9, wpn: 'bomb', alt: 38, ammo: 1, desc: 'Slow. Big area damage, best vs stations.',
    vs: { inf:{ lvl:4, rng:35, acc:3 }, armor:{ lvl:3, rng:35, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:35, acc:3 }, truck:{ lvl:4, rng:35, acc:3 }, bld:{ lvl:5, rng:35, acc:3 } } },
};
for (const u of Object.values(UNITS)) if (u.kind === 'inf') u.hp = u.men * u.hpm;
for (const u of Object.values(UNITS)) if (u.kind === 'air') u.armor = 'air';
for (const u of Object.values(UNITS)) { u.body = ARMOR_BODY[u.armor]; u.layer ||= 'g'; }   // body type: Infantry / Armor / Air / Artillery / Truck/Jeep

export const ABILITIES = {
  sprint:     { key: 'KeyQ', label: 'Q', name: 'Sprint', cd: 20, dur: 6, desc: 'Run 80% faster for 6 s.' },
  ambush:     { key: 'KeyE', label: 'E', name: 'Ambush', cd: 12, desc: 'Hide while still. First shot deals double damage.' },
  binoculars: { key: 'KeyR', label: 'R', name: 'Binoculars', cd: 25, dur: 8, desc: 'Reveal a wide area for 8 s.' },
  mine:       { key: 'KeyF', label: 'F', name: 'Lay Mine', cd: 10, desc: 'Hidden mine; blows up enemy vehicles.' },
  deploy:     { key: 'KeyG', label: 'G', name: 'Deploy MG', cd: 3, desc: 'Set up: much faster fire and longer range, cannot move.' },
  satchel:    { key: 'KeyT', label: 'T', name: 'Satchel Charge', cd: 25, desc: 'Run in and blow up the nearest tank or building.' },
  orbital:    { key: 'KeyO', label: 'O', name: 'Orbital Strike', cd: 30, desc: 'Beam down on the best enemy target within 60 m of the point below the ship.' },
  drop:       { key: 'KeyC', label: 'C', name: 'Troop Drop', cd: 6, desc: 'Drop the squads aboard on the planet below. Empty: beam up your troops below.' },
  launch:     { key: 'KeyL', label: 'L', name: 'Launch Drones', cd: 30, desc: 'Launch 2 attack drones (45 s).' },
};

// hx/hz: half size of footprint; door points toward the enemy. layer: 'g' planet, 's' space. hq: true = a headquarters
// gun: buildings that shoot (turrets) { wpn, dmg, rof, vs } (vs per body: { lvl, rng, acc } like units)
const NOVS = { lvl: 0, rng: 0, acc: 0 };
export const BUILDINGS = {
  hq:        { name: 'Planet Base', cost: 0, time: 0, hp: 1800, hx: 7, hz: 6, h: 7, units: [], hq: true },
  depot:     { br: 'eco', name: 'Mining Rig', cost: 250, time: 7, hp: 450, hx: 4.5, hz: 4.5, h: 4, units: [], desc: 'Place on a $ crystal spot. +$270/min.' },
  barracks:  { br: 'inf', name: 'Barracks', cost: 300, time: 8, hp: 600, hx: 6, hz: 4.5, h: 5, units: ['rifle', 'bazooka', 'scout', 'engineer', 'mgteam', 'commando'], desc: 'All infantry squads.' },
  recon:     { br: 'inf', name: 'Sensor Post', cost: 200, time: 6, hp: 400, hx: 4, hz: 4, h: 9, units: ['jeep'], desc: 'Hover scouts: fast, big vision.' },
  factory:   { br: 'armor', name: 'Mech Factory', cost: 500, time: 11, hp: 800, hx: 7.5, hz: 6, h: 7, units: ['light', 'medium', 'heavy'], desc: 'Hover, battle and siege tanks.' },
  atdepot:   { br: 'art', name: 'Gun Works', cost: 350, time: 8, hp: 550, hx: 5.5, hz: 4.5, h: 4.5, units: ['atgun'], desc: 'Towed rail guns.' },
  artillery: { br: 'art', name: 'Artillery Base', cost: 450, time: 10, hp: 550, hx: 6, hz: 5, h: 4.5, units: ['howitzer'], desc: 'Long-range plasma artillery.' },
  pturret:   { br: 'art', name: 'Defense Turret', cost: 300, time: 8, hp: 520, hx: 3, hz: 3, h: 4, units: [], desc: 'Shoots infantry and tanks near your base.',
    gun: { wpn: 'mg', dmg: 14, rof: 0.9, vs: { inf:{ lvl:4, rng:40, acc:4 }, armor:{ lvl:2, rng:36, acc:5 }, air: NOVS, art:{ lvl:4, rng:38, acc:5 }, truck:{ lvl:4, rng:38, acc:5 }, bld: NOVS } } },
  // ---- space ----
  station:   { name: 'Space Station', cost: 0, time: 0, hp: 1800, hx: 7, hz: 7, h: 6, units: [], hq: true, layer: 's' },
  solar:     { br: 'eco', name: 'Solar Array', cost: 250, time: 7, hp: 400, hx: 5, hz: 3.5, h: 2, units: [], layer: 's', desc: 'Space income: +$180/min. Build anywhere near your station.' },
  shipyard:  { br: 'fleet', name: 'Shipyard', cost: 450, time: 10, hp: 800, hx: 8, hz: 6, h: 5, units: ['corvette', 'frigate', 'cruiser', 'carrier', 'dropship'], layer: 's', desc: 'Warships, carriers and dropships.' },
  hangar:    { br: 'air', name: 'Hangar Bay', cost: 550, time: 12, hp: 700, hx: 12, hz: 6, h: 4, units: ['reconplane', 'fighter', 'fbomber', 'bomber'], layer: 's', desc: 'Interceptors, bombers, recon drones.' },
  sturret:   { br: 'fleet', name: 'Laser Turret', cost: 300, time: 8, hp: 520, hx: 3, hz: 3, h: 3, units: [], layer: 's', desc: 'Shoots ships and fighters near your station.',
    gun: { wpn: 'mg', dmg: 12, rof: 0.75, vs: { inf: NOVS, armor:{ lvl:3, rng:42, acc:5 }, air:{ lvl:4, rng:44, acc:4 }, art: NOVS, truck:{ lvl:4, rng:42, acc:5 }, bld: NOVS } } },
};
for (const b of Object.values(BUILDINGS)) b.layer ||= 'g';
export const BUILD_ORDER = ['depot', 'barracks', 'recon', 'factory', 'atdepot', 'artillery', 'pturret', 'solar', 'shipyard', 'hangar', 'sturret'];
export const ECO_BLD = { g: 'depot', s: 'solar' };
export const HQ_TYPE = { g: 'hq', s: 'station' };

// planet base positions per commander (space stations sit right above them, at x + SPACE_X)
export const HQ_POS = { blue: { x: 16, z: 120 }, red: { x: 4, z: -121 }, blue2: { x: 96, z: 118 }, red2: { x: -78, z: -124 } };
export const SUPPLY = [
  [42, 110], [-2, 100], [26, 80],
  [36, -108], [-20, -104], [26, -80],
  [-32, 22], [44, 24], [116, 34],
  [-30, -26], [40, -18], [112, -30],
];
