/* Trainers doctrine + dex. Plain data shared by game.js (reads) and editor.html (reads + writes).
   All monsters, types, moves and names are original. Stored in localStorage under 'trainers-doctrine-v1';
   every field is checked on load and anything missing or invalid falls back to the preset it came from,
   so a bad edit can't break the game. */
(function (root) {
'use strict';
const KEY = 'trainers-doctrine-v1';
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);

// ---------------------------------------------------------------- types (attacker -> defender multiplier; missing = 1)
const TYPES = {
  flame: { name: 'Flame', icon: '🔥', col: '#ef6a3a' },
  tide: { name: 'Tide', icon: '💧', col: '#3f8fe4' },
  leaf: { name: 'Leaf', icon: '🌿', col: '#5fbf4a' },
  volt: { name: 'Volt', icon: '⚡', col: '#f2c933' },
  stone: { name: 'Stone', icon: '🪨', col: '#a8895a' },
  gale: { name: 'Gale', icon: '🌪', col: '#8fc6e8' },
  shade: { name: 'Shade', icon: '🌙', col: '#7a5ca8' },
  toxin: { name: 'Toxin', icon: '☠', col: '#b04fc0' },
};
const CHART = {
  flame: { leaf: 2, toxin: 2, tide: 0.5, stone: 0.5, flame: 0.5 },
  tide: { flame: 2, stone: 2, leaf: 0.5, tide: 0.5, volt: 0.5 },
  leaf: { tide: 2, stone: 2, flame: 0.5, gale: 0.5, toxin: 0.5, leaf: 0.5 },
  volt: { tide: 2, gale: 2, stone: 0, leaf: 0.5, volt: 0.5 },
  stone: { flame: 2, gale: 2, volt: 2, leaf: 0.5, stone: 0.5 },
  gale: { leaf: 2, toxin: 2, volt: 0.5, stone: 0.5 },
  shade: { shade: 2, gale: 2, toxin: 0.5, stone: 0.5 },
  toxin: { leaf: 2, shade: 2, toxin: 0.5, stone: 0.5 },
};
const eff = (at, dt) => (at && CHART[at] && CHART[at][dt] !== undefined ? CHART[at][dt] : 1);

// ---------------------------------------------------------------- moves
// cat: phys | spec | stat. pow, acc (null = never misses), pri (priority), crit (crit stage), st: [status, chance] (slp par psn brn cnf),
// boost: own stage changes, drop: foe stage changes, heal: share of max HP, cure: clears own status, rest: full heal + sleep 2, hex: x2 vs a statused foe
const M = (name, type, cat, pow, acc, o = {}) => Object.assign({ name, type, cat, pow, acc, pri: 0, crit: 0 }, o);
const MOVES = {
  cinder: M('Cinder Spit', 'flame', 'spec', 60, 100, { st: ['brn', 0.1] }),
  blazerush: M('Blaze Rush', 'flame', 'phys', 80, 95, { st: ['brn', 0.1] }),
  inferno: M('Inferno Burst', 'flame', 'spec', 110, 80, { st: ['brn', 0.3] }),
  scorch: M('Scorch Glare', 'flame', 'stat', 0, 85, { st: ['brn', 1] }),
  ripple: M('Ripple Jab', 'tide', 'phys', 40, 100, { pri: 1 }),
  tidelash: M('Tide Lash', 'tide', 'spec', 80, 100),
  riptide: M('Riptide Crush', 'tide', 'phys', 90, 90),
  brine: M('Brine Cannon', 'tide', 'spec', 110, 80),
  vinelash: M('Vine Lash', 'leaf', 'phys', 65, 100),
  petalstorm: M('Petal Storm', 'leaf', 'spec', 90, 95),
  spores: M('Drowse Spores', 'leaf', 'stat', 0, 75, { st: ['slp', 1] }),
  regrow: M('Regrow', 'leaf', 'stat', 0, null, { heal: 0.5 }),
  zap: M('Static Zap', 'volt', 'spec', 65, 100, { st: ['par', 0.1] }),
  boltfang: M('Bolt Fang', 'volt', 'phys', 75, 95, { st: ['par', 0.1], crit: 1 }),
  stormbolt: M('Storm Bolt', 'volt', 'spec', 110, 70, { st: ['par', 0.3] }),
  numb: M('Numbing Jolt', 'volt', 'stat', 0, 90, { st: ['par', 1] }),
  pebble: M('Pebble Toss', 'stone', 'phys', 50, 100),
  rockslam: M('Rock Slam', 'stone', 'phys', 100, 80, { crit: 1 }),
  quake: M('Ground Quake', 'stone', 'phys', 90, 100),
  harden: M('Harden', 'stone', 'stat', 0, null, { boost: { def: 2 } }),
  gust: M('Gust', 'gale', 'spec', 60, 100),
  dive: M('Dive Strike', 'gale', 'phys', 90, 95, { crit: 1 }),
  cyclone: M('Cyclone', 'gale', 'spec', 95, 85, { st: ['cnf', 0.2] }),
  tailwind: M('Tailwind', 'gale', 'stat', 0, null, { boost: { spe: 2 } }),
  nightclaw: M('Night Claw', 'shade', 'phys', 70, 100, { crit: 1 }),
  hexwave: M('Hex Wave', 'shade', 'spec', 65, 100, { hex: true }),
  lullaby: M('Dusk Lullaby', 'shade', 'stat', 0, 60, { st: ['slp', 1] }),
  dread: M('Dread Gaze', 'shade', 'stat', 0, 100, { st: ['cnf', 1] }),
  venomfang: M('Venom Fang', 'toxin', 'phys', 60, 100, { st: ['psn', 0.3] }),
  sludge: M('Sludge Burst', 'toxin', 'spec', 90, 100, { st: ['psn', 0.3] }),
  toxmist: M('Toxic Mist', 'toxin', 'stat', 0, 90, { st: ['psn', 1] }),
  purify: M('Purify', 'toxin', 'stat', 0, null, { cure: true, heal: 0.25 }),
  slam: M('Body Slam', null, 'phys', 60, 100),
  quick: M('Quick Strike', null, 'phys', 40, 100, { pri: 1 }),
  lucky: M('Lucky Strike', null, 'phys', 70, 90, { crit: 2 }),
  warcry: M('War Cry', null, 'stat', 0, null, { boost: { atk: 2 } }),
  calm: M('Calm Focus', null, 'stat', 0, null, { boost: { spa: 1, spd: 1 } }),
  focus: M('Sharpen', null, 'stat', 0, null, { boost: { crit: 2 } }),
  blur: M('Blur', null, 'stat', 0, null, { boost: { eva: 1 } }),
  smoke: M('Smoke Puff', null, 'stat', 0, 100, { drop: { acc: -1 } }),
  mend: M('Mend', null, 'stat', 0, null, { heal: 0.5 }),
  rest: M('Deep Rest', null, 'stat', 0, null, { rest: true }),
};
// ---------------------------------------------------------------- monsters: base stats hp atk def spa spd spe, pool = moves it can learn, moves = default set
const D_ = (name, type, b, moves, extra = [], look = {}) => ({ name, type, base: { hp: b[0], atk: b[1], def: b[2], spa: b[3], spd: b[4], spe: b[5] }, moves, pool: [...new Set([...moves, ...extra])], look });
const DEX = {
  flarelynx: D_('Flarelynx', 'flame', [65, 70, 60, 110, 70, 115], ['cinder', 'inferno', 'calm', 'quick'], ['scorch', 'gust', 'blur'], { ears: 1, tail: 1 }),
  cindermole: D_('Cindermole', 'flame', [95, 105, 90, 50, 70, 50], ['blazerush', 'quake', 'harden', 'warcry'], ['slam', 'rest', 'scorch'], { horn: 1 }),
  emberpup: D_('Emberpup', 'flame', [70, 90, 65, 70, 65, 90], ['blazerush', 'nightclaw', 'quick', 'scorch'], ['lucky', 'warcry', 'cinder'], { ears: 1 }),
  tidebolt: D_('Tidebolt', 'tide', [75, 65, 70, 105, 80, 95], ['tidelash', 'brine', 'zap', 'calm'], ['numb', 'mend', 'ripple'], { fin: 1, tail: 1 }),
  shellguard: D_('Shellguard', 'tide', [110, 80, 120, 60, 100, 35], ['riptide', 'mend', 'harden', 'ripple'], ['rest', 'smoke', 'slam'], { shell: 1 }),
  brinemaw: D_('Brinemaw', 'tide', [90, 115, 80, 55, 70, 75], ['riptide', 'ripple', 'warcry', 'nightclaw'], ['quake', 'lucky', 'slam'], { fin: 1, teeth: 1 }),
  thornback: D_('Thornback', 'leaf', [85, 100, 95, 50, 70, 60], ['vinelash', 'pebble', 'warcry', 'regrow'], ['quake', 'spores', 'slam'], { spikes: 1 }),
  mossling: D_('Mossling', 'leaf', [100, 50, 80, 85, 110, 55], ['petalstorm', 'spores', 'regrow', 'toxmist'], ['calm', 'mend', 'smoke'], { leaf: 1 }),
  sparkit: D_('Sparkit', 'volt', [60, 60, 55, 105, 65, 125], ['zap', 'stormbolt', 'numb', 'quick'], ['calm', 'blur', 'gust'], { ears: 1, tail: 1 }),
  voltusk: D_('Voltusk', 'volt', [85, 110, 80, 60, 70, 80], ['boltfang', 'rockslam', 'warcry', 'quick'], ['lucky', 'slam', 'focus'], { horn: 1, teeth: 1 }),
  bouldrake: D_('Bouldrake', 'stone', [100, 120, 120, 45, 65, 40], ['rockslam', 'quake', 'harden', 'slam'], ['rest', 'warcry', 'pebble'], { spikes: 1, horn: 1 }),
  pebblin: D_('Pebblin', 'stone', [70, 90, 100, 50, 60, 70], ['pebble', 'quake', 'focus', 'lucky'], ['rockslam', 'harden', 'smoke'], {}),
  gustling: D_('Gustling', 'gale', [65, 75, 60, 85, 60, 115], ['gust', 'cyclone', 'tailwind', 'quick'], ['blur', 'smoke', 'dive'], { wings: 1 }),
  skyreaver: D_('Skyreaver', 'gale', [80, 115, 70, 60, 70, 100], ['dive', 'nightclaw', 'warcry', 'lucky'], ['quick', 'focus', 'tailwind'], { wings: 1, teeth: 1 }),
  duskmaw: D_('Duskmaw', 'shade', [85, 105, 75, 70, 75, 85], ['nightclaw', 'hexwave', 'dread', 'quick'], ['warcry', 'lucky', 'venomfang'], { teeth: 1, ears: 1 }),
  gloomoth: D_('Gloomoth', 'shade', [70, 50, 70, 100, 95, 90], ['hexwave', 'lullaby', 'sludge', 'blur'], ['dread', 'calm', 'gust'], { wings: 1 }),
  vilefang: D_('Vilefang', 'toxin', [75, 100, 70, 60, 70, 95], ['venomfang', 'nightclaw', 'toxmist', 'warcry'], ['quick', 'lucky', 'focus'], { teeth: 1, tail: 1 }),
  sporeshroom: D_('Sporeshroom', 'toxin', [105, 60, 90, 90, 100, 40], ['sludge', 'spores', 'purify', 'mend'], ['toxmist', 'rest', 'petalstorm'], { cap: 1 }),
};
const MON_IDS = Object.keys(DEX), MOVE_IDS = Object.keys(MOVES);
const ITEMS = {
  potion: { name: 'Potion', icon: '🧪', heal: 60 },
  super: { name: 'Super Potion', icon: '⚗', heal: 140 },
  full: { name: 'Full Heal', icon: '💊' },
  revive: { name: 'Revive', icon: '💖' },
};
// ---------------------------------------------------------------- AI doctrine (one per trainer)
// score of an action = sum of (feature × weight) + move-kind bias + rule bonuses, then personality noise (temperature)
const FEATURES = ['dmg', 'ko', 'type', 'status', 'setup', 'heal', 'risk', 'match', 'item', 'crit', 'prio', 'acc'];
const BASE = {
  movePri: { attack: 0, status: 0, setup: 0, heal: 0, priority: 0, strongest: 0 },
  sw: { never: false, hp: 0.25, bad: 1.5, bonus: 20, penalty: 25, keepBoosted: true },
  items: { healAt: 0.35, superAt: 0.25, reviveAt: 2, fullHealSleep: true, fullHealOther: false, maxPerBattle: 4 },
  bag: { potion: 2, super: 1, full: 1, revive: 1 },
  pers: { temp: 2, aggr: 1, risk: 0.5 },
  score: { dmg: 0.6, ko: 45, type: 12, status: 30, setup: 22, heal: 30, risk: 30, match: 18, item: 35, crit: 6, prio: 25, acc: 0.25 },
};
const T_ = (id, name, icon, preset, team, o = {}) => {
  const t = Object.assign({ id, preset, name, icon, team: team.map(m => ({ mon: m, moves: DEX[m].moves.slice() })) }, clone(BASE));
  for (const k of Object.keys(o)) Object.assign(t[k], o[k]);
  return t;
};
const PRESETS = {
  bugkid: T_('bugkid', 'Twig the Bug-kid', '🪲', 'bugkid', ['gloomoth', 'gustling', 'mossling', 'pebblin', 'sparkit', 'vilefang'], {
    movePri: { attack: 10, status: 0, setup: 0, heal: 0, priority: 0, strongest: 0 },
    sw: { never: true }, items: { healAt: 0.12, superAt: 0.08, reviveAt: 0, fullHealSleep: false, maxPerBattle: 2 },
    pers: { temp: 30, aggr: 1, risk: 0 },
    score: { dmg: 0.3, ko: 5, type: 0, status: 8, setup: 8, heal: 5, risk: 0, match: 0, item: 15, crit: 0, prio: 0, acc: 0 } }),
  ace: T_('ace', 'Ace Mara', '🎖', 'ace', ['flarelynx', 'tidebolt', 'thornback', 'voltusk', 'bouldrake', 'duskmaw'], {
    movePri: { attack: 0, status: -2, setup: 6, heal: 0, priority: 0, strongest: 0 },
    sw: { bad: 1, bonus: 23, penalty: 35 }, items: { healAt: 0.4 }, pers: { temp: 2, aggr: 1, risk: 0.5 },
    score: { dmg: 0.6, ko: 55, type: 8, status: 12, setup: 50, heal: 36, risk: 34, match: 6, item: 36, crit: 5, prio: 20, acc: 0.25 } }),
  gambler: T_('gambler', 'Lucky Jax', '🎲', 'gambler', ['skyreaver', 'voltusk', 'pebblin', 'emberpup', 'brinemaw', 'duskmaw'], {
    movePri: { attack: 5, status: -10, setup: 0, heal: -10, priority: 0, strongest: 12 },
    sw: { never: false, hp: 0.1, bad: 3, bonus: 5, penalty: 40 }, items: { healAt: 0.15, superAt: 0.1 },
    pers: { temp: 6, aggr: 1.4, risk: 0.1 },
    score: { dmg: 0.5, ko: 90, crit: 30, acc: 0, risk: 8, type: 10, setup: 10 } }),
  healer: T_('healer', 'Nurse Ola', '🩹', 'healer', ['shellguard', 'mossling', 'sporeshroom', 'thornback', 'tidebolt', 'bouldrake'], {
    movePri: { attack: 0, status: 8, setup: 0, heal: 15, priority: 0, strongest: 0 },
    sw: { hp: 0.3, bad: 1.2 }, items: { healAt: 0.55, superAt: 0.4, reviveAt: 1, fullHealOther: true, maxPerBattle: 6 },
    bag: { potion: 3, super: 2, full: 2, revive: 1 }, pers: { temp: 3, aggr: 0.8, risk: 0.8 },
    score: { heal: 60, status: 40, risk: 45, item: 50 } }),
  setup: T_('setup', 'Sweep Rhea', '📈', 'setup', ['skyreaver', 'brinemaw', 'flarelynx', 'cindermole', 'gustling', 'voltusk'], {
    movePri: { attack: 0, status: 0, setup: 18, heal: 0, priority: 5, strongest: 0 },
    pers: { temp: 3, aggr: 1.1, risk: 0.4 }, score: { setup: 55, ko: 50 } }),
  status: T_('status', 'Hex Dorn', '🌀', 'status', ['gloomoth', 'sporeshroom', 'mossling', 'sparkit', 'duskmaw', 'vilefang'], {
    movePri: { attack: -5, status: 20, setup: 0, heal: 5, priority: 0, strongest: 0 },
    pers: { temp: 4, aggr: 0.9, risk: 0.5 }, score: { status: 75 } }),
};
const PRESET_IDS = Object.keys(PRESETS);
const DEFAULT_DOCTRINE = { version: 1, order: PRESET_IDS.slice(), trainers: clone(PRESETS) };

// ---------------------------------------------------------------- validation (field by field, falls back to the trainer's preset)
function num(v, d, mn, mx) { return typeof v === 'number' && isFinite(v) ? Math.min(mx, Math.max(mn, v)) : d; }
function shape(inp, def, warn, path, lim) {
  const out = {};
  for (const k of Object.keys(def)) {
    const d = def[k], v = isObj(inp) ? inp[k] : undefined;
    if (typeof d === 'number') { const L = (lim && lim[k]) || [-1000, 1000]; const x = num(v, d, L[0], L[1]); if (v !== undefined && x !== v) warn.push(`${path}.${k}`); out[k] = x; }
    else if (typeof d === 'boolean') { if (v !== undefined && typeof v !== 'boolean') warn.push(`${path}.${k}`); out[k] = typeof v === 'boolean' ? v : d; }
    else if (typeof d === 'string') { if (v !== undefined && typeof v !== 'string') warn.push(`${path}.${k}`); out[k] = typeof v === 'string' && v.length < 40 ? v : d; }
    else out[k] = clone(d);
  }
  return out;
}
const LIMS = {
  sw: { hp: [0, 1], bad: [0, 5], bonus: [-200, 200], penalty: [-200, 200] },
  items: { healAt: [0, 1], superAt: [0, 1], reviveAt: [0, 6], maxPerBattle: [0, 20] },
  bag: { potion: [0, 9], super: [0, 9], full: [0, 9], revive: [0, 9] },
  pers: { temp: [0, 100], aggr: [0, 5], risk: [0, 1] },
};
function sanTeam(v, def, warn, path) {
  if (!Array.isArray(v)) { if (v !== undefined) warn.push(path); return clone(def); }
  const out = [];
  for (const s of v.slice(0, 6)) {
    if (!isObj(s) || !DEX[s.mon]) { warn.push(path); continue; }
    const pool = DEX[s.mon].pool;
    let mv = Array.isArray(s.moves) ? [...new Set(s.moves.filter(m => pool.includes(m)))].slice(0, 4) : [];
    if (mv.length !== (Array.isArray(s.moves) ? s.moves.length : -1)) warn.push(path + '.moves');
    for (const m of DEX[s.mon].moves) if (mv.length < 4 && !mv.includes(m)) mv.push(m);
    out.push({ mon: s.mon, moves: mv });
  }
  if (out.length < 3) { warn.push(path + ' (needs 3+)'); return clone(def); }
  return out;
}
function sanTrainer(inp, warn, idHint) {
  const preset = isObj(inp) && PRESETS[inp.preset] ? inp.preset : 'ace';
  const P = PRESETS[preset], path = 'trainers.' + (idHint || (isObj(inp) && inp.id) || '?');
  if (!isObj(inp)) { warn.push(path); return clone(P); }
  const t = { id: typeof inp.id === 'string' && /^[\w-]{1,40}$/.test(inp.id) ? inp.id : (idHint || P.id), preset };
  t.name = typeof inp.name === 'string' && inp.name.trim() ? inp.name.slice(0, 40) : P.name;
  t.icon = typeof inp.icon === 'string' && inp.icon.length <= 8 && inp.icon ? inp.icon : P.icon;
  t.team = sanTeam(inp.team, P.team, warn, path + '.team');
  for (const k of ['movePri', 'sw', 'items', 'bag', 'pers', 'score']) t[k] = shape(inp[k], P[k], warn, `${path}.${k}`, LIMS[k]);
  return t;
}
function sanitize(inp) {
  const warn = [];
  if (!isObj(inp)) return { ok: false, doc: clone(DEFAULT_DOCTRINE), warnings: ['not an object'] };
  // a single trainer object can be imported too
  if (inp.team && inp.score) { const t = sanTrainer(inp, warn); return { ok: true, single: true, trainer: t, warnings: warn }; }
  if (!isObj(inp.trainers)) return { ok: false, doc: clone(DEFAULT_DOCTRINE), warnings: ['no trainers'] };
  const doc = { version: 1, order: [], trainers: {} };
  for (const [id, t] of Object.entries(inp.trainers)) { const s = sanTrainer(t, warn, id); s.id = id; doc.trainers[id] = s; }
  for (const id of PRESET_IDS) if (!doc.trainers[id]) doc.trainers[id] = clone(PRESETS[id]);
  const ord = Array.isArray(inp.order) ? inp.order.filter(id => doc.trainers[id]) : [];
  doc.order = [...new Set([...ord, ...Object.keys(doc.trainers)])];
  return { ok: true, doc, warnings: warn };
}
function parse(text) {
  let o; try { o = JSON.parse(String(text)); } catch (e) { return { ok: false, error: 'Not valid JSON: ' + e.message }; }
  const r = sanitize(o);
  if (!r.ok) return { ok: false, error: 'No trainers found (expected { "trainers": { … } } or one trainer with "team" and "score").' };
  return r;
}
const store = {
  get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); return true; } catch (e) { return false; } },
  del() { try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ } },
};
function load() {
  const raw = store.get();
  if (!raw) return { doc: clone(DEFAULT_DOCTRINE), custom: false, warnings: [] };
  const r = parse(raw);
  if (!r.ok || r.single) return { doc: clone(DEFAULT_DOCTRINE), custom: false, warnings: [r.error || 'bad save'] };
  return { doc: r.doc, custom: true, warnings: r.warnings };
}
function save(doc) { const r = sanitize(doc); return r.ok && store.set(JSON.stringify(r.doc)) ? r : null; }
function reset() { store.del(); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
root.TRDoctrine = { KEY, TYPES, CHART, eff, MOVES, MOVE_IDS, DEX, MON_IDS, ITEMS, FEATURES, PRESETS, PRESET_IDS, DEFAULT_DOCTRINE, sanitize, sanTrainer, parse, load, save, reset, same, clone, defaults: () => clone(DEFAULT_DOCTRINE) };
})(typeof window !== 'undefined' ? window : globalThis);
