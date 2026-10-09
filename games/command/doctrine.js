/* Command Layers doctrine: every "objective map" the commanders plan with, as one data object.
   Shared by game.js (reads it) and editor.html (reads + writes it). Plain data, no dependencies.
   Stored in localStorage under 'command-doctrine-v1'; anything missing or invalid falls back per field
   to DEFAULT_DOCTRINE, so a bad edit can't break the game.
   Units: metres, seconds, angles in radians (the editor shows degrees). */
(function (root) {
'use strict';
const KEY = 'command-doctrine-v1';
const TYPE_IDS = ['seize', 'hold', 'clear', 'screen', 'recon', 'sbf', 'reserve', 'withdraw', 'assault', 'cutoff', 'move', 'suppress', 'overwatch'];
const SEC_SM = ['move', 'hold', 'suppress', 'overwatch', 'assault']; // section tasks with a drill (state machine)
const SCORE_KINDS = ['seize', 'clear', 'assault', 'hold', 'reserve', 'cutoff', 'screen', 'recon', 'sbf', 'withdraw', 'other'];
const TAGS = ['book', 'allIn', 'bunched', 'reserve', 'cutoff'];
const COY_PLACES = ['fup', 'fire', 'offset', 'behind', 'objective'];
const PLACE_DEF = {
  fup: { off: 0, dist: 130, sweep: true },          // jump-off point on the flank of the approach, then attack the objective
  fire: { site: ['sweep'] },                         // fire position (chain of site choices, first that exists)
  offset: { fwd: 0, side: 0, aim: 'spot', mirror: false }, // a spot relative to the objective (forward / side)
  behind: { dist: 280, side: 40, mirror: false },    // a spot behind the objective, back toward the start
  objective: {},                                     // the objective itself
};
const GATES = ['', 'sbf', 'rear'];
const SITE_RE = /^(sweep|blind|last|random|rank:[0-9]|apart:\d{1,3}|seeApart:\d{1,3}|role:[0-5])$/;
const LOOKS = ['obj', 'none', 'ahead'];

// ---------------------------------------------------------------- defaults (reproduce v1.0 behaviour exactly)
const fup = (off = 0, dist = 130, sweep = true) => ({ kind: 'fup', off, dist, sweep });
const fire = (...site) => ({ kind: 'fire', site });
const ofs = (fwd, side, aim = 'spot', mirror = false) => ({ kind: 'offset', fwd, side, aim, mirror });
const behind = (dist = 280, side = 40) => ({ kind: 'behind', dist, side, mirror: false });
const role = (type, place, imp = 1, gate = '', mistake = false) => ({ type, place, imp, gate, mistake });
const V = (id, name, tags, roles) => ({ id, name, tags, roles });
const NOSWEEP = { sites: [], angles: [], wrongChance: 0, styleTags: false };
function attackCoy(t) {
  const a = t === 'clear' ? 'clear' : 'assault';
  return {
    scoreAs: t,
    search: { sites: ['rank:0', 'rank:1', 'rank:2', 'blind', 'random'], angles: [-1.2, -0.8, 0, 0.8, 1.2], wrongChance: 0.08, styleTags: true },
    variants: [
      V('book', 'Textbook: assault, fire support, reserve', ['reserve'], [role(a, fup(), 3, 'sbf', true), role('sbf', fire('sweep'), 2), role('reserve', behind(), 1)]),
      V('cutoff', 'Assault, fire support, cut-off beyond', ['cutoff'], [role(a, fup(), 3, 'sbf', true), role('sbf', fire('sweep'), 2), role('cutoff', ofs(130, 110, 'obj', true), 1)]),
      V('allIn', 'All in: two assaults + fire support, no reserve', ['allIn'], [role(a, fup(), 3, 'sbf', true), role('sbf', fire('sweep'), 2), role(a, fup(0.45), 1)]),
    ],
  };
}
const offs = (type, list, t2) => list.map(([f, s], i) => role(t2 && t2[i] ? t2[i] : type, ofs(f, s), 1));
const pt = (base, side = 0, fwd = 0, pick = 0, look = 'none', lookFwd = 200) => ({ base, side, fwd, pick, look, lookFwd });
const sr = (type, pos, target) => ({ type, pos, target });
const OBJ = pt('obj');
function holdPl(type, sp, screen) {
  const roles = [[-sp, 0], [sp, 0], [0, -30]].map(([s, f], i) => (screen && i < 2
    ? sr('overwatch', pt('pos', s, f, 30, 'ahead', 200), pt('pos', s, 200))
    : sr(type, null, pt('pos', s, f, 28, 'none'))));
  const clone = () => JSON.parse(JSON.stringify(roles));
  return { scoreAs: type === 'move' ? 'hold' : 'hold', variants: [V('book', 'Textbook', ['book'], clone()), V('alt', 'Second look (new spots)', [], clone())] };
}
function assaultPl() {
  return {
    scoreAs: 'assault',
    variants: [
      V('book', 'Textbook: two sections assault, one overwatches', ['book'], [sr('assault', pt('pos', -18), pt('obj', -14)), sr('assault', pt('pos', 18), pt('obj', 14)), sr('overwatch', pt('pos', 0, -15, 35, 'obj'), OBJ)]),
      V('allIn', 'All in: three sections assault', ['allIn'], [sr('assault', pt('pos', -25), pt('obj', -20)), sr('assault', pt('pos', 0), OBJ), sr('assault', pt('pos', 25), pt('obj', 20))]),
      V('one', 'One assaults, two overwatch', [], [sr('assault', pt('pos', 0), OBJ), sr('overwatch', pt('pos', -30, 0, 35, 'obj'), OBJ), sr('overwatch', pt('pos', 30, 0, 35, 'obj'), OBJ)]),
    ],
  };
}
const sbfRoles = () => [-30, 0, 30].map(s => sr('suppress', pt('pos', s, 0, 30, 'obj'), OBJ));
const DEFAULT_DOCTRINE = {
  version: 1,
  types: {
    seize: { icon: '⚔', label: 'Seize' }, hold: { icon: '🛡', label: 'Hold' }, clear: { icon: '🧹', label: 'Clear' }, screen: { icon: '👁', label: 'Screen' },
    recon: { icon: '🔭', label: 'Recon' }, sbf: { icon: '🔥', label: 'Support by fire' }, reserve: { icon: '⏸', label: 'Reserve' }, withdraw: { icon: '↩', label: 'Withdraw to' },
    assault: { icon: '⚔', label: 'Assault' }, cutoff: { icon: '✂', label: 'Cut-off' }, move: { icon: '➜', label: 'Move to' }, suppress: { icon: '🔥', label: 'Suppress' }, overwatch: { icon: '👁', label: 'Overwatch' },
  },
  levels: {
    coy: ['seize', 'hold', 'clear', 'screen', 'recon', 'sbf', 'reserve', 'withdraw'],
    pl: ['assault', 'sbf', 'cutoff', 'reserve', 'hold', 'clear', 'screen', 'recon', 'withdraw'],
    sec: ['move', 'suppress', 'assault', 'hold', 'overwatch'],
  },
  // company objective -> 3 platoon roles
  coy: {
    seize: attackCoy('seize'),
    clear: attackCoy('clear'),
    hold: { scoreAs: 'hold', search: NOSWEEP, variants: [
      V('book', 'Textbook: two forward, one in reserve', ['book'], offs('hold', [[10, -70], [10, 70], [-110, 0]], [0, 0, 'reserve'])),
      V('line', 'Line abreast, wide', [], offs('hold', [[15, -110], [15, 0], [15, 110]])),
      V('bunched', 'Bunched on the objective', ['bunched'], offs('hold', [[0, -12], [0, 0], [0, 12]])),
      V('stagger', 'Staggered in depth', [], offs('hold', [[20, -60], [-40, 60], [-120, -20]])),
    ] },
    reserve: { scoreAs: 'reserve', search: NOSWEEP, variants: [
      V('book', 'Textbook: triangle', ['book'], offs('reserve', [[0, -60], [0, 60], [-60, 0]])),
      V('line', 'Line abreast, wide', [], offs('reserve', [[15, -110], [15, 0], [15, 110]])),
      V('bunched', 'Bunched', ['bunched'], offs('reserve', [[0, -12], [0, 0], [0, 12]])),
      V('stagger', 'Staggered in depth', [], offs('reserve', [[20, -60], [-40, 60], [-120, -20]])),
    ] },
    screen: { scoreAs: 'screen', search: NOSWEEP, variants: [
      V('book', 'Textbook: wide screen', ['book'], offs('screen', [[0, -160], [0, 0], [0, 160]])),
      V('bunched', 'Narrow screen', ['bunched'], offs('screen', [[0, -40], [0, 0], [0, 40]])),
      V('depth', 'Two screen, one reserve behind', [], offs('screen', [[0, -110], [-80, 0], [0, 110]], [0, 'reserve', 0])),
    ] },
    recon: { scoreAs: 'recon', search: { sites: ['rank:0', 'rank:2', 'blind'], angles: [], wrongChance: 0, styleTags: false }, variants: [
      V('book', 'Textbook: observe, cover by fire, reserve', ['book'], [role('recon', fire('seeApart:80', 'rank:1', 'sweep'), 3), role('sbf', fire('sweep'), 2), role('reserve', behind(), 1)]),
      V('allIn', 'All in: three recon patrols', ['allIn'], [role('recon', fire('seeApart:80', 'rank:1', 'sweep'), 3), role('recon', fire('sweep'), 2), role('recon', fup(0, 100, false), 1)]),
    ] },
    sbf: { scoreAs: 'sbf', search: NOSWEEP, variants: [
      V('book', 'Textbook: two fire positions + reserve', ['book'], [role('sbf', fire('rank:0'), 2), role('sbf', fire('apart:70', 'rank:1'), 2), role('reserve', behind(168), 1)]),
      V('allIn', 'All in: three fire positions', ['allIn'], [role('sbf', fire('random'), 2), role('sbf', fire('blind', 'last'), 2), role('sbf', fire('rank:3', 'role:0'), 1)]),
    ] },
    withdraw: { scoreAs: 'withdraw', search: NOSWEEP, variants: [
      V('book', 'Textbook: two back, rearguard covers', ['book'], [role('withdraw', ofs(0, -60), 2), role('withdraw', ofs(0, 60), 2), role('withdraw', ofs(0, 0), 1, 'rear')]),
      V('all', 'Everyone back at once', [], [role('withdraw', ofs(0, -60), 2), role('withdraw', ofs(0, 60), 2), role('withdraw', ofs(0, 0), 1)]),
    ] },
  },
  // platoon task -> 3 section roles. base 'obj' = the platoon's target, 'pos' = the platoon's position (jump-off / fire position), or its target if it has none
  pl: {
    assault: assaultPl(),
    clear: assaultPl(),
    sbf: { scoreAs: 'sbf', variants: [V('book', 'Textbook: three sections in line', ['book'], sbfRoles()), V('alt', 'Second look (new spots)', [], sbfRoles())] },
    recon: { scoreAs: 'recon', variants: [
      V('book', 'Textbook: two watch, one holds back', ['book'], [sr('overwatch', pt('pos', 0, 0, 40, 'obj'), OBJ), sr('overwatch', pt('pos', 40, 0, 40, 'obj'), OBJ), sr('hold', null, pt('pos', 0, -60, 30, 'none'))]),
      V('allIn', 'All in: two patrol forward, one watches', ['allIn'], [sr('move', null, pt('obj', -20)), sr('move', null, pt('obj', 20)), sr('overwatch', pt('pos', 0, 0, 40, 'obj'), OBJ)]),
    ] },
    cutoff: { scoreAs: 'cutoff', variants: [
      V('book', 'Textbook: two block, one watches', ['book'], [sr('hold', null, pt('pos', -25, 0, 30, 'none')), sr('hold', null, pt('pos', 25, 0, 30, 'none')), sr('overwatch', pt('pos', 0, -20, 30, 'obj'), OBJ)]),
    ] },
    hold: holdPl('hold', 32), reserve: holdPl('hold', 32), withdraw: holdPl('move', 32), screen: holdPl('hold', 45, true),
  },
  // section drills (state machines), plus the platoon gates and pinned / broken states
  sm: {
    common: { speed: 1.3, aggr: [0.75, 1, 1.25] },
    move: { speed: 1, arrive: 3 },
    hold: { speed: 1, arrive: 3 },
    suppress: { speed: 1, arrive: 3, engaged: 6, focus: 90, range: 560, areaRange: 520 },
    overwatch: { speed: 1, arrive: 3, focus: 90, range: 560 },
    assault: {
      jumpoff: { on: true, speed: 1, arrive: 3 },
      wait: { on: true, sync: true, syncMax: 90, gate: true, maxWait: 600 },
      charge: { far: 1.1, close: 1.8, closeDist: 120, shock: 35, shockSupp: 45, shockBase: 2.5, shockAggr: 1.5, take: 35 },
      consolidate: { on: true, radius: 65, clearRadius: 100, hunt: 160, memory: 60, closeIn: 14, huntSpeed: 1.4, sweepSpeed: 0.8, ring: 0.6, back: 30 },
    },
    gates: { sbfWait: 420, sbfEngaged: 25, rearHold: 90, aggrScale: [1.4, 1, 0.5] },
    pinned: { at: 66, expBonus: 18, recover: 35, returnFire: 28, expFaster: 16, resume: 15 },
    broken: { morale: 25, strength: 0.3, speed: 1.8, rallySupp: 15, rallyMorale: 40, rallyDelay: 20 },
  },
  // plan scoring weights (points out of 100)
  score: {
    attack: { supLos: 25, supCover: 10, supRange: 10, supMin: 120, supMax: 380, clearNoSup: 15, flank: 20, flankAngle: 0.75, approach: 15, onTarget: 15, onTargetDist: 70, reserve: 15, base: 5 },
    defend: { cover: 40, depth: 20, depthDist: 50, spacing: 20, minGap: 25, maxGap: 320, fields: 20, fieldRange: 150 },
    screen: { spread: 40, minSpread: 120, view: 40, viewRange: 200, cover: 20 },
    recon: { observer: 50, coveringFire: 25, reserve: 25 },
    sbf: { seeing: 60, cover: 20, reserve: 20 },
    withdraw: { rearguard: 40, near: 60, nearDist: 160 },
    other: { base: 60 },
    sec: { fireLos: 45, fireCover: 30, fireRange: 25, rangeMin: 70, rangeMax: 360, assaultBase: 25, fupCover: 20, approach: 30, runIn: 25, runInMax: 220, holdCover: 50, holdField: 30, holdBase: 20, moveBase: 50, moveApproach: 30, moveCover: 20 },
    prefs: { noise: 45, dumbBelow: 0.45, dumbScale: 90, frontal: 1, noLos: 0.7, allIn: 0.6, bunched: 0.8, wrong: 0.5, aggressive: 14, cautious: 12, glory: 10, book: 12 },
  },
};

// canonical key order (catalog order), so a saved copy compares equal to the defaults
for (const k of ['coy', 'pl']) { const o = DEFAULT_DOCTRINE[k], r = {}; for (const t of TYPE_IDS) if (o[t]) r[t] = o[t]; DEFAULT_DOCTRINE[k] = r; }

// ---------------------------------------------------------------- validation: per-field fallback
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const fin = (v) => typeof v === 'number' && isFinite(v);
// numeric ranges by field name (anything else: generous bounds by sign of the default)
const RANGE = {
  off: [-Math.PI, Math.PI], dist: [0, 800], fwd: [-800, 800], side: [-800, 800], imp: [1, 5], pick: [0, 200], lookFwd: [-800, 800],
  wrongChance: [0, 1], speed: [0.05, 10], far: [0.05, 10], close: [0.05, 10], huntSpeed: [0.05, 10], sweepSpeed: [0.05, 10], ring: [0, 2],
  arrive: [0.5, 100], strength: [0, 1], flankAngle: [0, Math.PI], dumbBelow: [0, 1], frontal: [-10, 10], noLos: [-10, 10], allIn: [-10, 10], bunched: [-10, 10], wrong: [-10, 10],
};
function num(v, d, key, warn, path) {
  if (!fin(v)) { if (v !== undefined) warn.push(path); return d; }
  const r = RANGE[key] || (d >= 0 ? [0, Math.max(1000, d * 10)] : [-1000, 1000]);
  if (v < r[0] || v > r[1]) { warn.push(path); return Math.min(r[1], Math.max(r[0], v)); }
  return v;
}
// merge a fixed-shape object (types, sm, score) against its default
function shape(inp, def, warn, path) {
  if (!isObj(inp)) { if (inp !== undefined) warn.push(path); return clone(def); }
  const out = {};
  for (const k of Object.keys(def)) {
    const d = def[k], v = inp[k], p = path + '.' + k;
    if (typeof d === 'number') out[k] = num(v, d, k, warn, p);
    else if (typeof d === 'boolean') { out[k] = typeof v === 'boolean' ? v : d; if (v !== undefined && typeof v !== 'boolean') warn.push(p); }
    else if (typeof d === 'string') { out[k] = typeof v === 'string' && v.trim() && v.length <= 40 ? v : d; if (v !== undefined && out[k] !== v) warn.push(p); }
    else if (Array.isArray(d)) { out[k] = Array.isArray(v) && v.length === d.length && v.every(fin) ? v.map((x, i) => num(x, d[i], k, warn, p)) : clone(d); if (v !== undefined && out[k] === undefined) warn.push(p); }
    else out[k] = shape(v, d, warn, p);
  }
  return out;
}
function sanTags(t) { return Array.isArray(t) ? [...new Set(t.filter(x => TAGS.includes(x)))] : []; }
function sanPlace(p, warn, path) {
  if (!isObj(p) || !COY_PLACES.includes(p.kind)) { warn.push(path); return null; }
  const d = PLACE_DEF[p.kind], out = { kind: p.kind };
  for (const k of Object.keys(d)) {
    const dv = d[k], v = p[k], pp = path + '.' + k;
    if (k === 'site') {
      const s = Array.isArray(v) ? v.filter(x => typeof x === 'string' && SITE_RE.test(x)).slice(0, 4) : [];
      if (!s.length) warn.push(pp);
      out.site = s.length ? s : clone(dv);
    } else if (k === 'aim') { out.aim = v === 'obj' || v === 'spot' ? v : dv; if (v !== undefined && out.aim !== v) warn.push(pp); }
    else if (typeof dv === 'boolean') out[k] = typeof v === 'boolean' ? v : dv;
    else out[k] = num(v, dv, k, warn, pp);
  }
  return out;
}
function sanCoyRole(r, warn, path) {
  if (!isObj(r) || !TYPE_IDS.includes(r.type)) { warn.push(path); return null; }
  const place = sanPlace(r.place, warn, path + '.place'); if (!place) return null;
  return { type: r.type, place, imp: Math.round(num(r.imp, 1, 'imp', warn, path + '.imp')), gate: GATES.includes(r.gate) ? r.gate : (r.gate == null ? '' : (warn.push(path + '.gate'), '')), mistake: r.mistake === true };
}
function sanPoint(p, def, warn, path) {
  if (!isObj(p) || (p.base !== 'obj' && p.base !== 'pos')) { if (p !== undefined) warn.push(path); return def ? clone(def) : null; }
  return {
    base: p.base, side: num(p.side, 0, 'side', warn, path + '.side'), fwd: num(p.fwd, 0, 'fwd', warn, path + '.fwd'),
    pick: num(p.pick, 0, 'pick', warn, path + '.pick'), look: LOOKS.includes(p.look) ? p.look : 'none', lookFwd: num(p.lookFwd, 200, 'lookFwd', warn, path + '.lookFwd'),
  };
}
function sanSecRole(r, warn, path) {
  if (!isObj(r) || !SEC_SM.includes(r.type)) { warn.push(path); return null; }
  return { type: r.type, pos: r.pos == null ? null : sanPoint(r.pos, null, warn, path + '.pos'), target: sanPoint(r.target, OBJ, warn, path + '.target') };
}
function sanVariants(list, roleFn, warn, path) {
  if (!Array.isArray(list)) return null;
  const out = [];
  list.slice(0, 24).forEach((v, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(v) || !Array.isArray(v.roles)) { warn.push(p); return; }
    const roles = v.roles.slice(0, 6).map((r, j) => roleFn(r, warn, `${p}.roles[${j}]`)).filter(Boolean);
    if (!roles.length) { warn.push(p); return; }
    out.push({ id: typeof v.id === 'string' && v.id ? v.id.slice(0, 24) : 'v' + i, name: typeof v.name === 'string' && v.name.trim() ? v.name.slice(0, 80) : `Variant ${i + 1}`, tags: sanTags(v.tags), roles });
  });
  return out.length ? out : null;
}
function sanSearch(s, def, warn, path) {
  if (!isObj(s)) { if (s !== undefined) warn.push(path); return clone(def); }
  return {
    sites: Array.isArray(s.sites) ? s.sites.filter(x => typeof x === 'string' && SITE_RE.test(x) && !/^(sweep|apart|seeApart|role)/.test(x)).slice(0, 8) : clone(def.sites),
    angles: Array.isArray(s.angles) ? s.angles.filter(fin).map(a => Math.max(-Math.PI, Math.min(Math.PI, a))).slice(0, 9) : clone(def.angles),
    wrongChance: num(s.wrongChance, def.wrongChance, 'wrongChance', warn, path + '.wrongChance'),
    styleTags: typeof s.styleTags === 'boolean' ? s.styleTags : def.styleTags,
  };
}
function sanitize(inp) {
  const warn = [], D = DEFAULT_DOCTRINE;
  if (!isObj(inp)) return { doc: clone(D), warnings: ['not an object'], ok: false };
  const doc = { version: 1 };
  doc.types = shape(inp.types, D.types, warn, 'types');
  doc.levels = {};
  for (const lv of ['coy', 'pl', 'sec']) {
    const v = inp.levels && inp.levels[lv];
    const ok = Array.isArray(v) ? [...new Set(v.filter(t => TYPE_IDS.includes(t) && (lv !== 'sec' || SEC_SM.includes(t))))] : [];
    if (v !== undefined && (!Array.isArray(v) || ok.length !== v.length)) warn.push('levels.' + lv);
    doc.levels[lv] = ok.length ? ok : clone(D.levels[lv]);
  }
  doc.coy = {};
  const ic = isObj(inp.coy) ? inp.coy : {};
  for (const t of TYPE_IDS) {
    const d = D.coy[t], v = ic[t];
    if (!v && !d) continue;
    if (!isObj(v)) { if (v !== undefined) warn.push('coy.' + t); if (d) doc.coy[t] = clone(d); continue; }
    const tmpl = d || D.coy.hold;
    const variants = sanVariants(v.variants, sanCoyRole, warn, `coy.${t}.variants`);
    if (!variants) warn.push(`coy.${t}.variants`);
    doc.coy[t] = { scoreAs: SCORE_KINDS.includes(v.scoreAs) ? v.scoreAs : tmpl.scoreAs, search: sanSearch(v.search, tmpl.search, warn, `coy.${t}.search`), variants: variants || clone(tmpl.variants) };
  }
  doc.pl = {};
  const ip = isObj(inp.pl) ? inp.pl : {};
  for (const t of TYPE_IDS) {
    const d = D.pl[t], v = ip[t];
    if (!v && !d) continue;
    if (!isObj(v)) { if (v !== undefined) warn.push('pl.' + t); if (d) doc.pl[t] = clone(d); continue; }
    const tmpl = d || D.pl.hold;
    const variants = sanVariants(v.variants, sanSecRole, warn, `pl.${t}.variants`);
    if (!variants) warn.push(`pl.${t}.variants`);
    doc.pl[t] = { scoreAs: SCORE_KINDS.includes(v.scoreAs) ? v.scoreAs : tmpl.scoreAs, variants: variants || clone(tmpl.variants) };
  }
  doc.sm = shape(inp.sm, D.sm, warn, 'sm');
  doc.score = shape(inp.score, D.score, warn, 'score');
  const known = ['types', 'levels', 'coy', 'pl', 'sm', 'score'].filter(k => inp[k] !== undefined).length;
  return { doc, warnings: warn, ok: known > 0 };
}
// parse text from Import: rejects garbage outright, otherwise returns the cleaned doctrine + what was fixed
function parse(text) {
  let o;
  try { o = JSON.parse(String(text)); } catch (e) { return { ok: false, error: 'Not valid JSON: ' + e.message }; }
  if (!isObj(o)) return { ok: false, error: 'Expected a JSON object { … }.' };
  const r = sanitize(o);
  if (!r.ok) return { ok: false, error: 'No doctrine sections found (types, levels, coy, pl, sm, score).' };
  return { ok: true, doc: r.doc, warnings: r.warnings };
}
const store = {
  get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); return true; } catch (e) { return false; } },
  del() { try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ } },
};
function load() {
  const raw = store.get();
  if (!raw) return { doc: clone(DEFAULT_DOCTRINE), custom: false, raw: null, warnings: [] };
  const r = parse(raw);
  if (!r.ok) return { doc: clone(DEFAULT_DOCTRINE), custom: false, raw, warnings: [r.error] };
  return { doc: r.doc, custom: true, raw, warnings: r.warnings };
}
function save(doc) { const r = sanitize(doc); return store.set(JSON.stringify(r.doc)) ? r : null; }
function reset() { store.del(); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

root.CLDoctrine = { KEY, DEFAULT_DOCTRINE, TYPE_IDS, SEC_SM, SCORE_KINDS, TAGS, COY_PLACES, PLACE_DEF, GATES, SITE_RE, LOOKS, defaults: () => clone(DEFAULT_DOCTRINE), sanitize, parse, load, save, reset, same, clone };
})(typeof window !== 'undefined' ? window : globalThis);
