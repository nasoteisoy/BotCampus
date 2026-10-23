// Squad FSM: all game data. Damage rule reused from Front Line (games/tank-2v2/js/config.js):
// each weapon has a LEVEL 0-5 vs each armor; the level maps to a damage multiplier.
export const LVL_MULT = [0, 0.06, 0.4, 0.75, 1.0, 1.4];
export const ARMOR = { inf: { icon: '🪖', name: 'Infantry' }, heavy: { icon: '🦺', name: 'Heavy armor' } };
export const WEAPONS = {
  rifle:   { icon: '🔫', name: 'Rifle',   vs: { inf: 4, heavy: 2 } },
  mg:      { icon: '🔩', name: 'MG',      vs: { inf: 4, heavy: 1 } },
  sniper:  { icon: '🎯', name: 'Sniper',  vs: { inf: 5, heavy: 3 } },
  grenade: { icon: '💣', name: 'Grenade', vs: { inf: 5, heavy: 4 } },
};

// ---------- FSM building blocks ----------
// params: key -> list of options; first is default
export const STATES = {
  patrol:  { icon: '🚶', name: 'Patrol',     col: '#5aa9ff', params: { pace: ['walk', 'run'] } },
  alert:   { icon: '👀', name: 'Alert',      col: '#ffd65a', params: { pace: ['careful', 'fast'] } },
  attack:  { icon: '🔫', name: 'Attack',     col: '#ff6a5a', params: { target: ['nearest', 'weakest', 'threat'], fire: ['burst', 'aimed'], move: ['hold', 'advance'] } },
  cover:   { icon: '🛡', name: 'Take cover', col: '#8fd18a', params: { fire: ['shoot back', 'hide'] } },
  retreat: { icon: '🏃', name: 'Retreat',    col: '#c58cff', params: { to: ['start', 'squad'] } },
  heal:    { icon: '🩹', name: 'Heal buddy', col: '#ff9ad5', params: { who: ['downed', 'lowest hp'] } },
  regroup: { icon: '📣', name: 'Regroup',    col: '#7ff0e0', params: { on: ['leader', 'centre'] } },
  grenade: { icon: '💣', name: 'Grenade',    col: '#ffa84a', params: { mode: ['grenade', 'suppress'] } },
};
export const STATE_KEYS = Object.keys(STATES);
export const PARAM_ICON = { walk: '🚶', run: '🏃', careful: '🐢', fast: '⚡', nearest: '📍', weakest: '💔', threat: '☠️', burst: '💥', aimed: '🎯', hold: '⚓', advance: '⏩',
  'shoot back': '🔫', hide: '🙈', start: '🏁', squad: '👥', downed: '🆘', 'lowest hp': '💔', leader: '⭐', centre: '🎯', grenade: '💣', suppress: '🌪' };

// v: default value; unit / step / min / max for the value stepper; null = no value
export const CONDS = {
  seen:     { icon: '👁', name: 'Enemy seen' },
  fire:     { icon: '💥', name: 'Under fire' },
  hp:       { icon: '❤️', name: 'HP <', v: 40, unit: '%', step: 10, min: 10, max: 90 },
  ammo:     { icon: '🔋', name: 'Ammo <', v: 5, unit: '', step: 1, min: 1, max: 30 },
  buddy:    { icon: '🆘', name: 'Buddy down' },
  squad:    { icon: '👥', name: 'Squad <', v: 50, unit: '%', step: 10, min: 10, max: 90 },
  count:    { icon: '🔢', name: 'Enemies >', v: 2, unit: '', step: 1, min: 0, max: 8 },
  cover:    { icon: '🧱', name: 'Near cover' },
  timer:    { icon: '⏱', name: 'Time in state >', v: 5, unit: 's', step: 1, min: 1, max: 30 },
  lost:     { icon: '🌫', name: 'Lost sight' },
};
export const COND_KEYS = Object.keys(CONDS);

export const ROLES = {
  rifleman: { icon: '🔫', name: 'Rifleman', hp: 100, wpn: 'rifle', dmg: 14, rof: 0.55, rng: 34, acc: 0.55, mag: 24, armor: 'inf', speed: 4.2 },
  mg:       { icon: '🔩', name: 'MG',       hp: 110, wpn: 'mg', dmg: 8, rof: 0.16, rng: 38, acc: 0.38, mag: 80, armor: 'inf', speed: 3.6, suppress: true },
  medic:    { icon: '🩹', name: 'Medic',    hp: 90, wpn: 'rifle', dmg: 10, rof: 0.7, rng: 30, acc: 0.5, mag: 20, armor: 'inf', speed: 4.4, healer: true },
  leader:   { icon: '⭐', name: 'Leader',   hp: 110, wpn: 'rifle', dmg: 14, rof: 0.55, rng: 34, acc: 0.6, mag: 24, armor: 'inf', speed: 4.2, leader: true },
};
export const ROLE_KEYS = Object.keys(ROLES);
export const ENEMIES = {
  grunt:  { icon: '🪖', name: 'Grunt',  hp: 80, wpn: 'rifle', dmg: 11, rof: 0.8, rng: 32, acc: 0.42, mag: 20, armor: 'inf', speed: 3.8 },
  sniper: { icon: '🎯', name: 'Sniper', hp: 70, wpn: 'sniper', dmg: 55, rof: 3.2, rng: 85, acc: 0.6, mag: 5, armor: 'inf', speed: 3.2, vis: 90 },
  heavy:  { icon: '🦺', name: 'Heavy',  hp: 230, wpn: 'mg', dmg: 9, rof: 0.25, rng: 34, acc: 0.38, mag: 60, armor: 'heavy', speed: 2.8 },
  ambush: { icon: '🥷', name: 'Ambusher', hp: 80, wpn: 'rifle', dmg: 12, rof: 0.6, rng: 30, acc: 0.45, mag: 20, armor: 'inf', speed: 4.4, hidden: 14 },
};

// ---------- preset FSMs ----------
let _id = 0;
const S = (type, x, y, params = {}) => ({ id: 's' + (++_id), type, x, y, params });
function mk(states, trans, start) {
  const fsm = { states, trans: [], start: states[start].id, roles: {} };
  for (const [f, t, cond, v, neg] of trans) fsm.trans.push({ id: 't' + (++_id), from: f === 'any' ? 'any' : states[f].id, to: states[t].id, cond, v: v ?? CONDS[cond].v ?? null, neg: !!neg });
  return fsm;
}
// tutorial: they never shoot (wrong condition on Patrol -> Attack) and drop out of Attack too fast
export function tutorialFSM() {
  const s = [S('patrol', 80, 200), S('attack', 280, 120), S('cover', 280, 290)];
  return mk(s, [[0, 1, 'lost'], [1, 0, 'timer', 2]], 0);
}
export function starterFSM() {
  const s = [S('patrol', 60, 200), S('alert', 150, 70), S('attack', 300, 90), S('cover', 300, 230),
    S('retreat', 340, 350), S('heal', 170, 340), S('regroup', 60, 330), S('grenade', 200, 200)];
  return mk(s, [
    [0, 2, 'seen'], [0, 3, 'fire'], [1, 2, 'seen'], [1, 0, 'timer', 8],
    [2, 3, 'fire'], [2, 1, 'lost'], [3, 2, 'timer', 3], [3, 1, 'lost'],
    [4, 6, 'timer', 6], [5, 6, 'timer', 6], [6, 0, 'timer', 3], [7, 3, 'timer', 2],
  ], 0);
}
export function blankFSM() { const s = [S('patrol', 200, 200)]; return mk(s, [], 0); }
// enemy brains run on the same FSM engine
export function enemyFSM(kind) {
  const s = [S('patrol', 0, 0), S('attack', 0, 0, { fire: kind === 'sniper' ? 'aimed' : 'burst', move: kind === 'heavy' ? 'advance' : 'hold', target: 'nearest' }), S('cover', 0, 0), S('alert', 0, 0, { pace: 'fast' })];
  const t = [[0, 1, 'seen'], [0, 3, 'fire'], [3, 1, 'seen'], [3, 0, 'timer', 10], [1, 3, 'lost']];
  if (kind === 'grunt' || kind === 'ambush') t.push([1, 2, 'hp', 50], [2, 1, 'timer', 4]);
  return mk(s, t, 0);
}

// ---------- missions ----------
// map in metres (120 x 80). walls = low cover (block moving, not sight); blocks = buildings (block both)
// squad: roles; path: patrol waypoints; enemies: [kind, x, y, path?]; goal: clear | reach | hold | rescue
export const MISSIONS = [
  { id: 'm1', icon: '🎓', name: 'Bad orders', teach: '👁 → 🔫', tip: 'Your squad never shoots back. Fix the 🚶→🔫 arrow: use 👁 Enemy seen.',
    goal: 'clear', time: 150, par: 70, squad: ['leader', 'rifleman', 'rifleman', 'medic'], start: [12, 40],
    path: [[30, 40], [60, 40], [95, 40]],
    walls: [[50, 30, 2, 8], [50, 44, 2, 8], [80, 34, 8, 2], [80, 46, 8, 2]], blocks: [[30, 10, 14, 12], [30, 58, 14, 12], [96, 8, 12, 14]],
    enemies: [['grunt', 88, 36], ['grunt', 90, 46], ['grunt', 100, 41]], tutorial: true },
  { id: 'm2', icon: '🛡', name: 'Ambush', teach: '💥 → 🛡', tip: 'Hidden enemies open fire up close. 💥 Under fire → 🛡 Take cover.',
    goal: 'reach', zone: [104, 40, 9], time: 150, par: 80, squad: ['leader', 'rifleman', 'mg', 'medic'], start: [10, 40],
    path: [[35, 40], [70, 40], [104, 40]],
    walls: [[30, 30, 10, 2], [30, 48, 10, 2], [62, 30, 10, 2], [62, 48, 10, 2], [88, 34, 2, 12]], blocks: [[44, 6, 14, 18], [44, 56, 14, 18], [80, 60, 16, 12]],
    enemies: [['ambush', 52, 30], ['ambush', 52, 51], ['ambush', 70, 26], ['ambush', 72, 55], ['grunt', 100, 32]] },
  { id: 'm3', icon: '🎯', name: 'Sniper alley', teach: '🌫 + 💣', tip: 'A sniper hits hard from far. Hide, then 🌪 suppress or 🏃 rush it.',
    goal: 'clear', time: 180, par: 100, squad: ['leader', 'rifleman', 'mg', 'medic'], start: [10, 20],
    path: [[30, 22], [55, 30], [80, 50], [104, 62]],
    walls: [[22, 28, 8, 2], [40, 20, 2, 8], [52, 38, 8, 2], [66, 44, 2, 8], [78, 58, 8, 2], [92, 52, 2, 8]], blocks: [[28, 50, 16, 20], [62, 8, 18, 14], [100, 20, 12, 14]],
    enemies: [['sniper', 108, 66], ['grunt', 96, 64], ['grunt', 100, 56]] },
  { id: 'm4', icon: '🦺', name: 'Heavy squad', teach: '🔢 → 💣', tip: 'Heavies shrug off bullets. Grenades 💣 hurt them. Pull back when ❤️ low.',
    goal: 'clear', time: 200, par: 120, squad: ['leader', 'rifleman', 'rifleman', 'mg', 'medic'], start: [12, 40],
    path: [[35, 40], [60, 40]],
    walls: [[40, 30, 2, 8], [40, 44, 2, 8], [26, 36, 2, 8], [70, 28, 8, 2], [70, 50, 8, 2]], blocks: [[50, 4, 16, 14], [50, 62, 16, 14]],
    enemies: [['heavy', 100, 34, [[75, 38], [45, 40]]], ['heavy', 102, 46, [[75, 44], [45, 40]]], ['grunt', 108, 40, [[80, 40]]]] },
  { id: 'm5', icon: '🆘', name: 'Rescue', teach: '🆘 → 🩹', tip: 'A wounded soldier waits in the street. Get him up 🩹 and clear the area.',
    goal: 'rescue', vip: [62, 40], time: 200, par: 110, squad: ['leader', 'rifleman', 'mg', 'medic'], start: [10, 40],
    path: [[35, 40], [62, 40], [85, 40]],
    walls: [[56, 33, 2, 6], [56, 43, 2, 6], [70, 36, 2, 8], [30, 30, 8, 2], [30, 50, 8, 2]], blocks: [[44, 8, 12, 18], [44, 56, 12, 18], [84, 10, 14, 14], [84, 58, 14, 14]],
    enemies: [['grunt', 92, 34], ['grunt', 94, 46], ['grunt', 104, 40], ['ambush', 68, 24]] },
  { id: 'm6', icon: '🚩', name: 'Hold the point', teach: '📣 + 🛡', tip: 'Hold the 🚩 zone for 90 s. Waves come. Regroup 📣 and use cover.',
    goal: 'hold', zone: [60, 40, 11], time: 90, par: 90, squad: ['leader', 'rifleman', 'rifleman', 'mg', 'medic'], start: [20, 40],
    path: [[60, 40]],
    walls: [[52, 32, 2, 16], [66, 32, 2, 16], [55, 30, 10, 2], [55, 48, 10, 2]], blocks: [[20, 6, 14, 14], [20, 60, 14, 14], [96, 30, 10, 20]],
    enemies: [['grunt', 112, 20, [[64, 36]]], ['grunt', 112, 60, [[64, 44]]], ['grunt', 116, 40, [[62, 40]]]],
    waves: [[25, [['grunt', 112, 10, [[62, 34]]], ['grunt', 112, 70, [[62, 46]]], ['heavy', 116, 40, [[64, 40]]]]], [50, [['grunt', 60, 4, [[60, 36]]], ['grunt', 60, 76, [[60, 44]]], ['ambush', 116, 30, [[62, 40]]], ['grunt', 116, 50, [[62, 40]]]]]] },
  { id: 'm7', icon: '↪️', name: 'Flanked', teach: '🔢 + 🏃', tip: 'One squad pins you, another comes round the side. Count them 🔢.',
    goal: 'clear', time: 220, par: 130, squad: ['leader', 'rifleman', 'rifleman', 'mg', 'medic'], start: [14, 40],
    path: [[40, 40], [70, 40]],
    walls: [[36, 32, 2, 16], [60, 26, 8, 2], [60, 52, 8, 2], [84, 36, 2, 8]], blocks: [[44, 2, 30, 14], [44, 64, 30, 14], [96, 56, 12, 14]],
    enemies: [['grunt', 92, 36], ['grunt', 92, 44], ['heavy', 100, 40], ['grunt', 110, 12, [[80, 12], [30, 22], [24, 36]]], ['grunt', 112, 16, [[82, 16], [32, 24], [22, 40]]], ['ambush', 108, 8, [[78, 10], [34, 20], [22, 32]]]] },
];
