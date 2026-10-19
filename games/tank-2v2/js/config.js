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
// Gadget damage (grenade, AT mine, time bomb, detpack) uses the gadget's own matrix (UNITS[t].gadgets[].vs), see GADGET_WPN.
export const DMG_MULT = {};

export const BRANCHES = {
  inf: { name: 'Infantry', color: '#7fc96b' },
  armor: { name: 'Armor', color: '#5aa0ff' },
  art: { name: 'Artillery', color: '#ffb347' },
  air: { name: 'Air', color: '#c58cff' },
};

// kind: inf (squad of men) | veh | gun | air.  men: squad size, hpm: hp per man.
// r: collision radius, vis: vision, rng: base range (kept for reference/AI), rof: seconds between shots, dmg: base damage per shot
// weapons (visual/ballistics): mg, snipe, shotgun, at, emp, cannon, he, flak, aamg, rocket, bomb. Only hit-scan weapons can reach aircraft.
// vs: per body type { lvl 0-5, rng, acc 0-5 } (rng: attack range vs that body; acc: accuracy level, see ACC_*). Aircraft with rockets/bombs: rng = how far from the ordered point they pick a target.
export const UNITS = {
  // infantry (Barracks): exactly 6 classes, modelled on the classic Battlefront II Republic classes.
  // Each has a main weapon (vs) plus gadget(s) with their own 6-body matrix (gadgets[].vs: lvl / rng / acc; rng = use range).
  rifle:    { br: 'inf', name: 'Rifle Trooper', base: 80, time: 5, kind: 'inf', men: 8, hpm: 12, speed: 5.2, r: 2.3, vis: 55, rng: 28, rof: 1.0, dmg: 10, wpn: 'mg', armor: 'inf', ability: 'grenade', desc: '8 men. Cheap all-rounder with a blaster rifle. Throws grenades at groups of infantry.',
    vs: { inf:{ lvl:4, rng:28, acc:4 }, armor:{ lvl:1, rng:16, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:26, acc:5 }, truck:{ lvl:3, rng:24, acc:5 }, bld:{ lvl:1, rng:18, acc:5 } },
    gadgets: [{ id: 'grenade', ability: 'grenade', name: 'Grenade', icon: '💣', wpn: 'grenade', dmg: 36, splash: 5, note: 'arcs over cover, 5 m splash; auto-thrown at infantry, guns and trucks in reach',
      vs: { inf:{ lvl:5, rng:22, acc:3 }, armor:{ lvl:1, rng:18, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:4, rng:22, acc:3 }, truck:{ lvl:4, rng:22, acc:3 }, bld:{ lvl:2, rng:18, acc:3 } } }] },
  bazooka:  { br: 'inf', name: 'Rocket Trooper', base: 125, time: 6, kind: 'inf', men: 4, hpm: 15, speed: 4.6, r: 1.9, vis: 50, rng: 32, rof: 3.2, dmg: 36, wpn: 'at', armor: 'inf', ability: 'atmine', desc: '4 men. Rocket launchers vs tanks. Lays hidden AT mines.',
    vs: { inf:{ lvl:1, rng:18, acc:3 }, armor:{ lvl:4, rng:32, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:26, acc:3 }, truck:{ lvl:4, rng:30, acc:3 }, bld:{ lvl:2, rng:24, acc:3 } },
    gadgets: [{ id: 'atmine', ability: 'atmine', name: 'AT Mine', icon: '🟤', wpn: 'atmine', dmg: 95, splash: 3, note: 'hidden from the enemy until it goes off; only vehicles and guns set it off (rng = trigger radius); 3 per squad',
      vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:4, rng:3, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:4, rng:3, acc:5 }, truck:{ lvl:5, rng:3, acc:5 }, bld:{ lvl:0, rng:0, acc:0 } } }] },
  sniper:   { br: 'inf', name: 'Sniper', base: 110, time: 7, kind: 'inf', men: 2, hpm: 12, speed: 5.0, r: 1.5, vis: 95, rng: 72, rof: 3.0, dmg: 10, wpn: 'snipe', armor: 'inf', ability: 'timebomb', camo: true, desc: '2 men. Very long range vs infantry only, hits 4 shots in 5. Hidden when still. Plants time bombs.',
    vs: { inf:{ lvl:5, rng:72, acc:5 }, armor:{ lvl:0, rng:0, acc:0 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:0, rng:0, acc:0 }, bld:{ lvl:0, rng:0, acc:0 } },
    gadgets: [{ id: 'timebomb', ability: 'timebomb', name: 'Time Bomb', icon: '⏱️', wpn: 'timebomb', dmg: 150, splash: 6, fuse: 8, note: 'walks to the nearest enemy building / gun / vehicle within reach and plants it; blows up after 8 s (6 m splash); no target: planted here',
      vs: { inf:{ lvl:1, rng:0, acc:5 }, armor:{ lvl:2, rng:20, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:35, acc:5 }, truck:{ lvl:3, rng:25, acc:5 }, bld:{ lvl:5, rng:40, acc:5 } } }] },
  engineer: { br: 'inf', name: 'Engineer', base: 85, time: 6, kind: 'inf', men: 4, hpm: 13, speed: 4.8, r: 2, vis: 50, rng: 14, rof: 1.5, dmg: 15, wpn: 'shotgun', armor: 'inf', ability: 'detpack', repair: 9, desc: '4 men. Shotgun (deadly up close), repair tool for vehicles, guns and buildings, detpacks.',
    vs: { inf:{ lvl:5, rng:14, acc:4 }, armor:{ lvl:1, rng:8, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:4, rng:12, acc:5 }, truck:{ lvl:3, rng:12, acc:5 }, bld:{ lvl:1, rng:10, acc:5 } },
    gadgets: [{ id: 'repair', name: 'Repair Tool', icon: '🔧', passive: true, friendly: true, note: 'repairs damaged FRIENDLY vehicles, guns and buildings nearby while idle (level = repair speed)',
      vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:4, rng:10, acc:0 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:4, rng:10, acc:0 }, truck:{ lvl:4, rng:10, acc:0 }, bld:{ lvl:3, rng:6, acc:0 } } },
      { id: 'detpack', ability: 'detpack', name: 'Detpack', icon: '🧨', wpn: 'detpack', dmg: 150, splash: 3, fuse: 2.5, note: 'runs in and sticks a charge on a tank / gun / building in reach; blows after 2.5 s or press again to blow it now',
      vs: { inf:{ lvl:1, rng:0, acc:5 }, armor:{ lvl:5, rng:40, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:4, rng:40, acc:5 }, truck:{ lvl:4, rng:40, acc:5 }, bld:{ lvl:5, rng:40, acc:5 } } }] },
  jettrooper:{ br: 'inf', name: 'Jet Trooper', base: 150, time: 8, kind: 'inf', men: 3, hpm: 14, speed: 5.4, r: 1.8, vis: 60, rng: 34, rof: 2.6, dmg: 22, splash: 2.5, wpn: 'emp', armor: 'inf', ability: 'jetpack', hop: 42, desc: '3 men. EMP launcher stuns and hurts vehicles and guns (weak vs infantry). Jetpack hops over rivers, walls and slopes.',
    vs: { inf:{ lvl:1, rng:20, acc:3 }, armor:{ lvl:5, rng:34, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:32, acc:3 }, truck:{ lvl:5, rng:34, acc:3 }, bld:{ lvl:2, rng:24, acc:3 } },
    gadgets: [{ id: 'jetpack', ability: 'jetpack', name: 'Jet Hop', icon: '🚀', note: 'flies up to 42 m toward the move target in 1.6 s, over water, walls and slopes; auto-used on long detours' }] },
  mgteam:   { br: 'inf', name: 'Heavy Gunner', base: 130, time: 7, kind: 'inf', men: 3, hpm: 20, speed: 4.2, r: 1.9, vis: 55, rng: 34, rof: 0.4, dmg: 5, wpn: 'mg', armor: 'inf', suppress: true, ability: 'turret', desc: '3 tough men with chainguns: suppress infantry. Deploy auto-turrets.',
    vs: { inf:{ lvl:5, rng:34, acc:4 }, armor:{ lvl:1, rng:14, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:4, rng:30, acc:5 }, truck:{ lvl:3, rng:28, acc:5 }, bld:{ lvl:1, rng:18, acc:5 } },
    gadgets: [{ id: 'turret', ability: 'turret', name: 'Auto-Turret', icon: '🛰️', summon: 'turret', note: 'deploys a small auto-turret (Artillery body, 90 hp) that shoots infantry by itself; 2 per squad, 1 at a time; matrix = the turret gun' }] },
  // summoned, not built: the Heavy Gunner's auto-turret
  turret:   { br: 'inf', name: 'Auto-Turret', summon: 'mgteam', cost: 0, time: 0, kind: 'gun', hp: 90, speed: 0, turn: 4, r: 1.3, vis: 50, rng: 32, rof: 0.45, dmg: 5, wpn: 'mg', armor: 'gun', deploy: 1.5, fullTraverse: true, desc: 'Deployed by a Heavy Gunner. Auto-targets infantry. Cannot move.',
    vs: { inf:{ lvl:4, rng:32, acc:4 }, armor:{ lvl:0, rng:0, acc:0 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:24, acc:4 }, truck:{ lvl:2, rng:26, acc:4 }, bld:{ lvl:0, rng:0, acc:0 } } },
  jeep:     { br: 'inf', name: 'Recon Jeep', cost: 100, time: 5, kind: 'veh', hp: 50, speed: 14, turn: 3.4, r: 1.6, vis: 100, rng: 28, rof: 0.9, dmg: 6, wpn: 'mg', armor: 'light', desc: 'Fast, sees far. Weak.',
    vs: { inf:{ lvl:4, rng:28, acc:4 }, armor:{ lvl:1, rng:14, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:26, acc:5 }, truck:{ lvl:3, rng:26, acc:5 }, bld:{ lvl:1, rng:16, acc:5 } } },
  // armor (Tank factory)
  light:    { br: 'armor', name: 'Light Tank', cost: 250, time: 8, kind: 'veh', hp: 110, speed: 11, turn: 3.2, r: 1.9, vis: 62, rng: 38, rof: 1.6, dmg: 15, wpn: 'cannon', armor: 'armor', desc: 'Fast, light armor.',
    vs: { inf:{ lvl:5, rng:22, acc:3 }, armor:{ lvl:4, rng:38, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:34, acc:3 }, truck:{ lvl:4, rng:36, acc:3 }, bld:{ lvl:3, rng:30, acc:3 } } },
  medium:   { br: 'armor', name: 'Medium Tank', cost: 400, time: 11, kind: 'veh', hp: 170, speed: 7.5, turn: 2.6, r: 2.1, vis: 66, rng: 44, rof: 2.1, dmg: 23, wpn: 'cannon', armor: 'armor', desc: 'All-round tank.',
    vs: { inf:{ lvl:5, rng:24, acc:3 }, armor:{ lvl:4, rng:44, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:40, acc:3 }, truck:{ lvl:4, rng:40, acc:3 }, bld:{ lvl:3, rng:34, acc:3 } } },
  heavy:    { br: 'armor', name: 'Heavy Tank', cost: 650, time: 15, kind: 'veh', hp: 300, speed: 5, turn: 1.8, r: 2.5, vis: 66, rng: 50, rof: 2.8, dmg: 34, wpn: 'cannon', armor: 'armor', front: 0.65, desc: 'Slow. Very strong front armor.',
    vs: { inf:{ lvl:5, rng:26, acc:3 }, armor:{ lvl:4, rng:50, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:44, acc:3 }, truck:{ lvl:4, rng:44, acc:3 }, bld:{ lvl:3, rng:38, acc:3 } } },
  // artillery
  atgun:    { br: 'art', name: 'AT Gun', cost: 220, time: 8, kind: 'gun', hp: 75, speed: 3.6, turn: 1.4, r: 1.9, vis: 50, rng: 50, rof: 2.4, dmg: 48, wpn: 'at', armor: 'gun', deploy: 1.4, desc: 'Kills tanks. Weak vs infantry. Stops to fire.',
    vs: { inf:{ lvl:1, rng:24, acc:3 }, armor:{ lvl:4, rng:50, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:2, rng:40, acc:3 }, truck:{ lvl:4, rng:46, acc:3 }, bld:{ lvl:2, rng:32, acc:3 } } },
  howitzer: { br: 'art', name: 'Howitzer', cost: 450, time: 12, kind: 'gun', hp: 70, speed: 3.4, turn: 1.2, r: 2.2, vis: 30, rng: 135, minRng: 24, rof: 6.5, dmg: 46, splash: 6, wpn: 'he', armor: 'gun', deploy: 2.2, indirect: true, desc: 'Long-range shelling. Needs spotting.',
    vs: { inf:{ lvl:5, rng:135, acc:3 }, armor:{ lvl:3, rng:135, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:135, acc:3 }, truck:{ lvl:4, rng:135, acc:3 }, bld:{ lvl:5, rng:135, acc:3 } } },
  aagun:    { br: 'art', name: 'AA Gun', cost: 200, time: 7, kind: 'gun', hp: 70, speed: 4, turn: 2.5, r: 1.9, vis: 45, rng: 62, rof: 0.7, dmg: 13, wpn: 'flak', armor: 'gun', antiAir: true, desc: 'Shoots down aircraft. Flak.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:0, rng:0, acc:0 }, air:{ lvl:4, rng:62, acc:2 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:0, rng:0, acc:0 }, bld:{ lvl:0, rng:0, acc:0 } } },
  // air (Airfield)
  reconplane:{ br: 'air', name: 'Recon Plane', cost: 200, time: 7, kind: 'air', hp: 60, speed: 30, r: 3, vis: 95, alt: 34, loiter: 30, desc: 'Reveals an area. Unarmed.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:0, rng:0, acc:0 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:0, rng:0, acc:0 }, bld:{ lvl:0, rng:0, acc:0 } } },
  fighter:  { br: 'air', name: 'Fighter', cost: 350, time: 9, kind: 'air', hp: 90, speed: 34, r: 3, vis: 60, rng: 30, rof: 0.35, dmg: 8, wpn: 'aamg', alt: 30, loiter: 40, desc: 'Shoots down aircraft.',
    vs: { inf:{ lvl:0, rng:0, acc:0 }, armor:{ lvl:0, rng:0, acc:0 }, air:{ lvl:4, rng:30, acc:5 }, art:{ lvl:0, rng:0, acc:0 }, truck:{ lvl:0, rng:0, acc:0 }, bld:{ lvl:0, rng:0, acc:0 } } },
  fbomber:  { br: 'air', name: 'Fighter-Bomber', cost: 450, time: 11, kind: 'air', hp: 110, speed: 30, r: 3, vis: 55, dmg: 75, wpn: 'rocket', alt: 30, ammo: 2, rocketWin: [14, 38], desc: 'Dives on ground targets. Good vs tanks.',
    vs: { inf:{ lvl:3, rng:35, acc:5 }, armor:{ lvl:5, rng:35, acc:5 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:4, rng:35, acc:5 }, truck:{ lvl:5, rng:35, acc:5 }, bld:{ lvl:3, rng:35, acc:5 } } },
  bomber:   { br: 'air', name: 'Bomber', cost: 600, time: 14, kind: 'air', hp: 220, speed: 20, r: 4.5, vis: 50, dmg: 70, splash: 9, wpn: 'bomb', alt: 38, ammo: 1, desc: 'Slow. Big area damage, best vs buildings.',
    vs: { inf:{ lvl:4, rng:35, acc:3 }, armor:{ lvl:3, rng:35, acc:3 }, air:{ lvl:0, rng:0, acc:0 }, art:{ lvl:5, rng:35, acc:3 }, truck:{ lvl:4, rng:35, acc:3 }, bld:{ lvl:5, rng:35, acc:3 } } },
};
for (const u of Object.values(UNITS)) if (u.kind === 'inf') u.hp = u.men * u.hpm;
UNITS.mgteam.gadgets[0].vs = UNITS.turret.vs;
// buildable types (the auto-turret is summoned, never built or listed)
// COST RULE (infantry): the more / better gear a class carries, the more it costs.
//   cost = base (men + main weapon) + GEAR_COST of every gadget it carries.
// A stronger secondary item = a higher GEAR_COST, so a squad with a better gadget is always dearer than the same
// squad with a weaker one. Change a gadget's strength -> change its GEAR_COST here; the cost follows automatically.
export const GEAR_COST = { grenade: 20, timebomb: 40, atmine: 45, detpack: 45, repair: 30, jetpack: 50, turret: 60 };
for (const U of Object.values(UNITS)) if (U.base !== undefined) {
  U.gear = (U.gadgets || []).map((g) => ({ id: g.id, icon: g.icon, name: g.name, cost: GEAR_COST[g.id] ?? 0 }));
  U.cost = U.base + U.gear.reduce((a, g) => a + g.cost, 0);
}
export const UNIT_TYPES = Object.keys(UNITS).filter((t) => !UNITS[t].summon);
// gadget damage: weapon id -> gadget (its matrix sets the multiplier per body)
export const GADGET_WPN = {};
for (const u of Object.values(UNITS)) for (const g of u.gadgets || []) if (g.wpn) GADGET_WPN[g.wpn] = g;
// old saved scenarios / share codes used these type ids
export const TYPE_ALIAS = { scout: 'sniper', commando: 'jettrooper' };
for (const u of Object.values(UNITS)) if (u.kind === 'air') u.armor = 'air';
for (const u of Object.values(UNITS)) u.body = ARMOR_BODY[u.armor];   // body type: Infantry / Armor / Air / Artillery / Truck/Jeep

export const ABILITIES = {
  grenade:  { key: 'KeyQ', label: 'Q', name: 'Grenade', cd: 14, desc: 'Throw a grenade at the best enemy group in reach (arc, 5 m splash). Auto-thrown at infantry.' },
  atmine:   { key: 'KeyE', label: 'E', name: 'AT Mine', cd: 5, charges: 3, desc: 'Lay a hidden anti-tank mine here (3 per squad). Only vehicles and guns set it off.' },
  timebomb: { key: 'KeyR', label: 'R', name: 'Time Bomb', cd: 30, desc: 'Sneak to the nearest enemy building or gun and plant a bomb; it blows up after 8 s.' },
  detpack:  { key: 'KeyF', label: 'F', name: 'Detpack', cd: 22, desc: 'Run in and stick a charge on the nearest tank, gun or building. Press again to blow it now.' },
  jetpack:  { key: 'KeyG', label: 'G', name: 'Jet Hop', cd: 12, desc: 'Fly up to 42 m toward the move target: over rivers, walls and slopes.' },
  turret:   { key: 'KeyT', label: 'T', name: 'Auto-Turret', cd: 20, charges: 2, desc: 'Deploy an auto-turret here (2 per squad, 1 at a time). It shoots infantry by itself.' },
};

// hx/hz: half size of footprint; door points toward the enemy
export const BUILDINGS = {
  hq:        { name: 'HQ', cost: 0, time: 0, hp: 1800, hx: 7, hz: 6, h: 7, units: [] },
  depot:     { br: 'eco', name: 'Supply Depot', cost: 250, time: 7, hp: 450, hx: 4.5, hz: 4.5, h: 4, units: [], desc: 'Place on a supply spot. +$270/min.' },
  barracks:  { br: 'inf', name: 'Barracks', cost: 300, time: 8, hp: 600, hx: 6, hz: 4.5, h: 5, units: ['rifle', 'bazooka', 'sniper', 'engineer', 'jettrooper', 'mgteam'], desc: 'All 6 infantry classes.' },
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
