// Ship Sandbox data. Attack rules follow Front Line (games/tank-2v2) and Space Defense (games/space-defense):
// every attack has a LEVEL 0-5 against each armor type, and the level maps to a damage multiplier (LVL_MULT).
export const LVL_MULT = [0, 0.06, 0.4, 0.75, 1.0, 1.4];

// armor types of ship parts (+ the shield bubble as its own "armor")
export const ARMOR = {
  shd:   { icon: '🫧', name: 'Shield' },
  plate: { icon: '🧱', name: 'Plate' },
  heavy: { icon: '🛡️', name: 'Heavy' },
  mech:  { icon: '⚙️', name: 'Mech' },
  light: { icon: '📡', name: 'Light' },
  nrg:   { icon: '⚡', name: 'Energy' },
};
export const ARMOR_KEYS = ['shd', 'plate', 'heavy', 'mech', 'light', 'nrg'];

// attacker palette. dmg = per hit, n = hits per attacker, kind = how it is delivered
// splash = radius (m) that also hits nearby parts at half damage
export const ATTACKS = {
  cannon:  { icon: '💥', name: 'Cannon',   kind: 'gun',    dmg: 34, n: 6, gap: 0.35, spd: 70, splash: 0,
             vs: { shd: 3, plate: 3, heavy: 2, mech: 4, light: 4, nrg: 3 } },
  rocket:  { icon: '🚀', name: 'Rockets',  kind: 'rocket', dmg: 48, n: 4, gap: 0.3, spd: 34, splash: 4,
             vs: { shd: 2, plate: 4, heavy: 3, mech: 4, light: 5, nrg: 3 } },
  laser:   { icon: '🔦', name: 'Laser',    kind: 'beam',   dmg: 16, n: 10, gap: 0.12, spd: 0, splash: 0,
             vs: { shd: 2, plate: 2, heavy: 1, mech: 3, light: 5, nrg: 5 } },
  torpedo: { icon: '🐟', name: 'Torpedo',  kind: 'torp',   dmg: 220, n: 1, gap: 1, spd: 16, splash: 7,
             vs: { shd: 1, plate: 5, heavy: 5, mech: 4, light: 3, nrg: 3 } },
  artillery:{ icon: '🎯', name: 'Artillery', kind: 'arty', dmg: 90, n: 3, gap: 0.6, spd: 30, splash: 6,
             vs: { shd: 3, plate: 4, heavy: 4, mech: 3, light: 3, nrg: 2 } },
  bomber:  { icon: '💣', name: 'Bomber',   kind: 'bomber', dmg: 70, n: 5, gap: 0.22, spd: 22, splash: 5, hp: 160,
             vs: { shd: 2, plate: 4, heavy: 3, mech: 5, light: 4, nrg: 3 } },
  fighter: { icon: '✈️', name: 'Fighter',  kind: 'fighter', dmg: 9, n: 30, gap: 0.25, spd: 30, splash: 0, hp: 70,
             vs: { shd: 1, plate: 1, heavy: 1, mech: 3, light: 5, nrg: 4 } },
  emp:     { icon: '🌀', name: 'EMP',      kind: 'emp',    dmg: 80, n: 1, gap: 1, spd: 26, splash: 9,
             vs: { shd: 5, plate: 0, heavy: 1, mech: 2, light: 4, nrg: 5 } },
};
export const ATTACK_KEYS = Object.keys(ATTACKS);

// ship parts: pos = [x along keel (bow +x), y up, z right]; fn = what it does
export const PARTS = [
  { id: 'bow',     icon: '🔺', name: 'Bow hull',    armor: 'plate', hp: 700, pos: [17, 0, 0],    fn: 'hull', desc: 'Front armor. Lose all 3 hull sections = ship lost.' },
  { id: 'mid',     icon: '🟫', name: 'Mid hull',    armor: 'plate', hp: 900, pos: [0, 0, 0],     fn: 'hull', desc: 'Main hull. Holds the reactor, guns and hangar.' },
  { id: 'stern',   icon: '🔻', name: 'Stern hull',  armor: 'plate', hp: 700, pos: [-16, 0, 0],   fn: 'hull', desc: 'Rear hull. Carries bridge, shield gen and engines.' },
  { id: 'bridge',  icon: '🧭', name: 'Bridge',      armor: 'heavy', hp: 380, pos: [-9, 5.2, 0],  fn: 'aim', desc: 'Command deck. Steers the guns: aim and fire rate.' },
  { id: 'sensors', icon: '📡', name: 'Sensors',     armor: 'light', hp: 160, pos: [11, 4.4, 0],  fn: 'aim', desc: 'Radar dish. Aim and weapon range.' },
  { id: 'reactor', icon: '☢️', name: 'Reactor',     armor: 'heavy', hp: 520, pos: [-2, 3.2, 0],  fn: 'power', desc: 'Powers weapons, shield, hangar and full thrust.' },
  { id: 'shield',  icon: '🫧', name: 'Shield gen',  armor: 'nrg',   hp: 260, pos: [-14, 4.2, 0], fn: 'shield', desc: 'Makes the shield bubble that soaks hits first.' },
  { id: 'engL',    icon: '🔥', name: 'Engine L',    armor: 'mech',  hp: 280, pos: [-25, 0, -3.2], fn: 'engine', desc: 'Left thruster. Half of the ship speed.' },
  { id: 'engR',    icon: '🔥', name: 'Engine R',    armor: 'mech',  hp: 280, pos: [-25, 0, 3.2],  fn: 'engine', desc: 'Right thruster. Half of the ship speed.' },
  { id: 'gun1',    icon: '💥', name: 'Cannon 1',    armor: 'mech',  hp: 240, pos: [14, 2.6, 0],  fn: 'weapon', wpn: 'cannon', desc: 'Twin cannon. Shoots attackers when fire-back is on.' },
  { id: 'gun2',    icon: '💥', name: 'Cannon 2',    armor: 'mech',  hp: 240, pos: [5, 3.2, 0],   fn: 'weapon', wpn: 'cannon', desc: 'Twin cannon. Shoots attackers when fire-back is on.' },
  { id: 'launcher',icon: '🚀', name: 'Launcher',    armor: 'mech',  hp: 220, pos: [-5, 1.4, 4.4], fn: 'weapon', wpn: 'rocket', desc: 'Homing rockets vs attackers (fire-back).' },
  { id: 'laser',   icon: '🔦', name: 'Laser',       armor: 'nrg',   hp: 190, pos: [-5, 1.4, -4.4], fn: 'weapon', wpn: 'laser', desc: 'Fast beam vs fighters and bombers (fire-back).' },
  { id: 'hangar',  icon: '🛬', name: 'Hangar',      armor: 'mech',  hp: 320, pos: [3, -1.6, 0],  fn: 'hangar', desc: 'Launches escort fighters every few seconds.' },
];

export const SHIP = {
  shieldHp: 900, shieldRegen: 25, shieldDelay: 3,   // bubble hp, hp/s, s after last hit
  speed: 14,                                        // m/s with both engines + power
  auxPower: 0.25,                                   // engine thrust left after reactor loss
  hangarEvery: 5, hangarMax: 5, hangarStock: 12,    // fighter launch rate / alive cap / total per hangar life
  fireRange: 90,
};
export const COUNTS = [1, 3, 5, 10];
export const SPEEDS = [1, 0.5, 0.25];
