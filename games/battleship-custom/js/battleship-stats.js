// BattleShip stats: ONE source of truth for the BattleShip Editor and any future space-battle game.
// Pure ES module (no DOM, no three.js): works in the browser and in Node.  Spec: BATTLESHIP_FORMAT.md
//   import { battleshipStats, PARTS, SLOTS } from '../battleship-custom/js/battleship-stats.js?v=1';
//   const s = battleshipStats(ship);  // { hp, armor, shield, shieldRegen, speed, turn, dps, range, hangarSlots, troopers, launchRate, cost, ... }
export const FORMAT_VERSION = 1;
const F = (o) => Object.freeze(o);
const list = (a) => F(a.map((x) => F(x)));

// Every slot's FIRST option is the cheap base. Nothing is locked.
// hull:   hp, mass (t×1000), hard = turret hardpoints, bay = hangar size multiplier, shieldMul, cost
// armor:  armor = % damage cut, hpMul, mass, cost
// shield: shield = shield points (× hull shieldMul), regen = points/s (× shieldMul), mass, cost
// guns:   per turret: dmg per shot, rof shots/s, range (m), splash (m), cost per turret, bolt = demo color
// hangar: slots = small SpaceShips carried, troops = troopers carried (both × hull bay), rate = launches/s, mass, cost
// engine: thrust, turnK (turn multiplier), boost (sprint multiplier), cost, glow = demo color
export const PARTS = F({
  hull: list([
    { id: 'corvette', name: 'Corvette', icon: '🔹', hp: 400, mass: 1.0, hard: 2, bay: 1, shieldMul: 1.0, cost: 100 },
    { id: 'frigate', name: 'Frigate', icon: '🔷', hp: 700, mass: 1.6, hard: 3, bay: 1, shieldMul: 1.3, cost: 180 },
    { id: 'cruiser', name: 'Cruiser', icon: '🟦', hp: 1200, mass: 2.6, hard: 4, bay: 2, shieldMul: 1.7, cost: 320 },
    { id: 'dreadnought', name: 'Dreadnought', icon: '⬛', hp: 2000, mass: 4.0, hard: 6, bay: 3, shieldMul: 2.2, cost: 560 },
  ]),
  armor: list([
    { id: 'light', name: 'Light', icon: '▫️', armor: 10, hpMul: 1.0, mass: 0, cost: 0 },
    { id: 'plated', name: 'Plated', icon: '🧱', armor: 25, hpMul: 1.1, mass: 0.3, cost: 60 },
    { id: 'reactive', name: 'Reactive', icon: '💠', armor: 30, hpMul: 1.1, mass: 0.4, cost: 120 },
    { id: 'heavy', name: 'Heavy', icon: '🪨', armor: 40, hpMul: 1.25, mass: 0.8, cost: 140 },
  ]),
  shield: list([
    { id: 'none', name: 'None', icon: '⭕', shield: 0, regen: 0, mass: 0, cost: 0 },
    { id: 'basic', name: 'Basic', icon: '🔵', shield: 200, regen: 10, mass: 0.1, cost: 60 },
    { id: 'deflector', name: 'Deflector', icon: '🌀', shield: 400, regen: 20, mass: 0.2, cost: 140 },
    { id: 'aegis', name: 'Aegis', icon: '🛡️', shield: 700, regen: 35, mass: 0.3, cost: 260 },
  ]),
  guns: list([
    { id: 'laser', name: 'Laser', icon: '🔫', dmg: 12, rof: 2, range: 300, splash: 0, cost: 20, bolt: '#ff4a4a' },
    { id: 'pulse', name: 'Pulse', icon: '💥', dmg: 30, rof: 1, range: 260, splash: 0, cost: 35, bolt: '#ffd84a' },
    { id: 'missile', name: 'Missiles', icon: '🚀', dmg: 60, rof: 0.5, range: 420, splash: 30, cost: 45, bolt: '#ff9a3c' },
    { id: 'rail', name: 'Railgun', icon: '⚡', dmg: 120, rof: 0.25, range: 500, splash: 0, cost: 60, bolt: '#7fe6ff' },
    { id: 'lance', name: 'Lance', icon: '🔆', dmg: 50, rof: 1, range: 350, splash: 0, cost: 80, bolt: '#c77dff' },
  ]),
  hangar: list([
    { id: 'none', name: 'None', icon: '⭕', slots: 0, troops: 0, rate: 0, mass: 0, cost: 0 },
    { id: 'bay', name: 'Bay', icon: '🛸', slots: 2, troops: 0, rate: 0.2, mass: 0.2, cost: 80 },
    { id: 'pods', name: 'Drop pods', icon: '🪖', slots: 0, troops: 12, rate: 0.5, mass: 0.2, cost: 120 },
    { id: 'carrier', name: 'Carrier', icon: '✈️', slots: 4, troops: 6, rate: 0.33, mass: 0.5, cost: 200 },
  ]),
  engine: list([
    { id: 'ion', name: 'Ion', icon: '🔥', thrust: 100, turnK: 1, boost: 1, cost: 0, glow: '#4ab8ff' },
    { id: 'fusion', name: 'Fusion', icon: '☀️', thrust: 170, turnK: 1, boost: 1, cost: 90, glow: '#ffb340' },
    { id: 'gravitic', name: 'Gravitic', icon: '🌀', thrust: 120, turnK: 2, boost: 1, cost: 110, glow: '#b06bff' },
    { id: 'warp', name: 'Warp', icon: '💫', thrust: 140, turnK: 1, boost: 2.5, cost: 120, glow: '#7dffb0' },
  ]),
});
export const SLOTS = F(['hull', 'armor', 'shield', 'guns', 'hangar', 'engine']);
export const BASE_PARTS = F(Object.fromEntries(SLOTS.map((s) => [s, PARTS[s][0].id])));
export const part = (slot, id) => PARTS[slot].find((p) => p.id === id) || PARTS[slot][0];
// any ship-ish object → valid parts map (unknown ids → base part)
export const cleanParts = (p = {}) => Object.fromEntries(SLOTS.map((s) => [s, part(s, p && p[s]).id]));

const r1 = (x) => Math.round(x * 10) / 10;
// battleshipStats(ship) → numbers a space-battle game can use directly. ship = { parts: {...} } (or a bare parts map).
//   hp           hull points (armor hpMul applied)
//   armor        % damage cut from each hit (0..90)
//   shield       shield points, absorbs damage first;  shieldRegen = points / s
//   speed        m/s (thrust / mass);  boost = sprint multiplier;  turn = deg / s
//   dps          damage / s from all turrets;  turrets, gunDmg (per shot), gunRof (shots/s per turret), range (m), splash (m)
//   hangarSlots  small SpaceShips carried;  troopers carried;  launchRate = launches / s (0 = no hangar)
//   mass         t×1000;  cost 💰;  power = one-number strength for match-making
export function battleshipStats(ship) {
  const ps = cleanParts(ship && ship.parts ? ship.parts : ship);
  const h = part('hull', ps.hull), a = part('armor', ps.armor), s = part('shield', ps.shield), g = part('guns', ps.guns), hg = part('hangar', ps.hangar), e = part('engine', ps.engine);
  const mass = r1(h.mass + a.mass + s.mass + hg.mass);
  const hp = Math.round(h.hp * a.hpMul), turrets = h.hard;
  const dps = r1(turrets * g.dmg * g.rof);
  const out = {
    hp, armor: a.armor, shield: Math.round(s.shield * h.shieldMul), shieldRegen: r1(s.regen * h.shieldMul),
    speed: r1(e.thrust / mass), boost: e.boost, turn: Math.round((60 * e.turnK) / mass),
    dps, turrets, gunDmg: g.dmg, gunRof: g.rof, range: g.range, splash: g.splash, weapon: g.id,
    hangarSlots: hg.slots * h.bay, troopers: hg.troops * h.bay, launchRate: hg.rate,
    mass, cost: h.cost + a.cost + s.cost + turrets * g.cost + hg.cost + e.cost,
  };
  const ehp = (out.hp + out.shield) / (1 - out.armor / 100);
  out.power = Math.round(Math.sqrt(ehp * Math.max(1, out.dps)) + out.hangarSlots * 15 + out.troopers * 3);
  return Object.freeze(out);
}

// ---------- UI helpers (bars): stat rows with word labels, 10-pip bars, delta in pips ----------
// good: +1 = more is better, -1 = more is worse (cost). key = battleshipStats field (hangar = slots + troopers/3)
export const STAT_ROWS = list([
  { key: 'hp', icon: '❤️', label: 'Hull', good: 1 },
  { key: 'armor', icon: '🛡️', label: 'Armor', good: 1 },
  { key: 'shield', icon: '🔵', label: 'Shield', good: 1 },
  { key: 'dps', icon: '💥', label: 'Firepower', good: 1 },
  { key: 'range', icon: '🎯', label: 'Range', good: 1 },
  { key: 'speed', icon: '🚀', label: 'Speed', good: 1 },
  { key: 'turn', icon: '🔄', label: 'Turn', good: 1 },
  { key: 'hangar', icon: '✈️', label: 'Hangar', good: 1 },
  { key: 'cost', icon: '💰', label: 'Cost', good: -1 },
]);
export const rowValue = (st, key) => (key === 'hangar' ? st.hangarSlots + st.troopers / 3 : st[key]);
// max of every row over every part combo (5120 ships) → bar scale
export const STAT_MAX = (() => {
  const mx = Object.fromEntries(STAT_ROWS.map((r) => [r.key, 0]));
  const walk = (i, acc) => {
    if (i === SLOTS.length) { const st = battleshipStats(acc); for (const r of STAT_ROWS) mx[r.key] = Math.max(mx[r.key], rowValue(st, r.key)); return; }
    for (const p of PARTS[SLOTS[i]]) walk(i + 1, { ...acc, [SLOTS[i]]: p.id });
  };
  walk(0, {});
  return F(mx);
})();
export const PIPS = 10;
export const pips = (key, v) => (v <= 0 ? 0 : Math.max(1, Math.min(PIPS, Math.round((PIPS * v) / STAT_MAX[key]))));
