// Trooper Customizer v5: Player + Nation (colors + flag + 6-slot trooper roster + tank) -> saved looks.
// v5: saves to the shared BotCampus army ('botcampus:army', games/shared/army/schema.js) and mirrors the legacy
// 'trooper-custom:db' v3 so Conquest v2.3 keeps working. Stats/costs come from games/shared/army/stats.js.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/addons/controls/OrbitControls.js?v=6';
import * as T from './trooper.js?v=6';
import { TANK, TANK_FIELDS, TANK_DEFAULT } from './tank.js?v=6';
import { SLOT_ICONS, WEAPON_ICONS, NAME_MAX, templateById } from './templates.js?v=6'; // templates: only to read old saves (v5 has no preset units)
import { COST, ITEMS, STATS, MEDALS_NEEDED, unitCost, unitStats, optionCost, awardCost, fmt } from './cost.js?v=7';
import * as S from '../../shared/army/stats.js?v=8';
import * as Army from '../../shared/army/schema.js?v=8';

const UNITS = { trooper: T.TROOPER, tank: TANK };
const NATION_KEYS = new Set(['p', 's', ...T.NATION_FIELDS.map(([k]) => k)]);
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v); }
  for (const c of [].concat(kids)) if (c != null) e.append(c);
  return e;
};
const clean = (x, max = 24) => String(x ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pick = (a) => a[(Math.random() * a.length) | 0];

// ---------- storage + data model ----------
// db v3: player -> nations (colors, flag, 6-slot trooper roster) ; shared tank look ; looks ; award medals
const LS_DB = 'trooper-custom:db', LS_DB_V2 = 'trooper-custom:db-v2', LS_CUR_V1 = 'trooper-custom:current', LS_LOOKS_V1 = 'trooper-custom:looks', MAX_LOOKS = 60, MAX_NATIONS = 12;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
// roster slot: { blank, name, icon, ia (auto icon), tpl (template id | null), t (v4 kit) }. New nations start with 6 blanks.
const weaponIcon = (t) => WEAPON_ICONS[t.weapon] || '🔫';
const BASIC_T = Object.freeze(S.toIndex('trooper', S.BASIC_GEAR.trooper)), BASIC_TANK = Object.freeze(S.toIndex('tank', S.BASIC_GEAR.tank));
const blankSlot = () => ({ blank: true, name: '', icon: '', ia: true, tpl: null, t: { ...BASIC_T } });
const blankRoster = () => Array.from({ length: T.ROSTER_SIZE }, blankSlot);
function cleanSlot(x, i) {
  if (!x || typeof x !== 'object' || x.blank === true) return blankSlot();
  const t = T.sanitizeFields(x.t, T.TROOPER_FIELDS, T.TROOPER_DEFAULT);
  const tpl = 'tpl' in x ? (templateById(x.tpl) ? x.tpl : null) : (['trooper', 'heavy', 'sniper', 'engineer', 'jet', 'commander'][i] || null); // v4 (pre-4.2) slots were the 6 starter types
  const ia = x.ia === true, tp = templateById(tpl);
  const traits = (Array.isArray(x.traits) ? x.traits : []).filter((k) => S.TRAIT_IDS.includes(k)).slice(0, 3);
  return { blank: false, id: typeof x.id === 'string' && x.id ? x.id : Army.newId('u'), name: clean(x.name, NAME_MAX) || (tp ? tp.name : 'Trooper ' + (i + 1)), icon: ia ? weaponIcon(t) : clean(x.icon, 4) || (tp ? tp.icon : weaponIcon(t)), ia, tpl, t, traits, brain: Army.cleanUnitBrain(x.brain) };
}
function cleanRoster(r) { return Array.isArray(r) ? Array.from({ length: T.ROSTER_SIZE }, (_, i) => cleanSlot(r[i], i)) : blankRoster(); }
const newNation = (name, colors, roster, playerName) => { const id = newId(); return { id, pid: 'p-' + id, playerName: clean(playerName) || '', name, ...T.sanitizeNation(colors), roster: cleanRoster(roster), tank: { ...BASIC_TANK }, tankId: 'k-' + id }; };
function cleanDB(d) {
  const db = { v: 3, player: { name: clean(d.player && d.player.name) || 'Player 1' }, nations: [], active: null, slot: 0, unit: d.unit === 'tank' ? 'tank' : 'trooper', tank: null, looks: [], medals: [], debugAward: d.debugAward === true };
  if (d.migratedFrom) db.migratedFrom = String(d.migratedFrom);
  if (d.upgradedFrom) db.upgradedFrom = String(d.upgradedFrom);
  const tank0 = T.sanitizeFields(d.tank || BASIC_TANK, TANK_FIELDS, TANK_DEFAULT);
  for (const n of d.nations || []) if (n && typeof n.id === 'string') db.nations.push({ id: n.id, pid: typeof n.pid === 'string' && n.pid ? n.pid : 'p-' + n.id, playerName: clean(n.playerName), name: clean(n.name) || 'Nation', ...T.sanitizeNation(n), roster: cleanRoster(n.roster), tank: n.tank ? T.sanitizeFields(n.tank, TANK_FIELDS, TANK_DEFAULT) : { ...tank0 }, tankId: typeof n.tankId === 'string' && n.tankId ? n.tankId : 'k-' + n.id, tankName: clean(n.tankName, NAME_MAX) || 'Tank 1', tankBrain: Army.cleanUnitBrain(n.tankBrain) });
  if (!db.nations.length) db.nations.push(newNation('Nation 1', T.NATION_DEFAULT));
  db.active = db.nations.some((n) => n.id === d.active) ? d.active : db.nations[0].id;
  // every nation = one player: the old single player name goes to the active nation, the others become 'Player N'
  db.nations.forEach((n, i) => { if (!n.playerName) n.playerName = n.id === db.active ? (db.player.name === 'Player' ? 'Player ' + (i + 1) : db.player.name) : 'Player ' + (i + 1); });
  // db.player.name = the active nation's player (kept for share codes + the legacy v3 mirror)
  const actN = () => db.nations.find((n) => n.id === db.active) || db.nations[0];
  Object.defineProperty(db.player, 'name', { enumerable: true, get: () => actN().playerName, set: (v) => { actN().playerName = clean(v) || actN().playerName; } });
  if (Array.isArray(d._extra)) db._extra = d._extra;
  if (d._base && typeof d._base === 'object') db._base = d._base;
  db.slot = Number.isInteger(d.slot) && d.slot >= 0 && d.slot < T.ROSTER_SIZE ? d.slot : 0;
  db.tank = db.nations.find((n) => n.id === db.active).tank;
  db.medals = Array.from({ length: 6 }, (_, i) => { const m = d.medals && d.medals[i]; return Number.isInteger(m) && m > 0 ? Math.min(m, 99999) : 0; });
  const ids = new Set(db.nations.map((n) => n.id));
  for (const l of d.looks || []) {
    if (!l || typeof l.id !== 'string' || !ids.has(l.nationId) || !UNITS[l.unit]) continue;
    const u = T.undigits(l.u, UNITS[l.unit].fields, UNITS[l.unit].defaults); if (!u) continue;
    db.looks.push({ id: l.id, nationId: l.nationId, unit: l.unit, name: clean(l.name) || 'Look', u: T.digits(u, UNITS[l.unit].fields), thumb: typeof l.thumb === 'string' ? l.thumb : '', tk: typeof l.tk === 'string' ? l.tk : '', traits: Array.isArray(l.traits) ? l.traits.filter((k) => S.TRAIT_IDS.includes(k)) : [], brain: Army.cleanUnitBrain(l.brain) });
  }
  return db;
}
// v2/v3 save -> v4 (db v3): every nation gets the 6 default roster types; the old current trooper goes
// into slot 0 of the active nation; saved trooper looks are converted to the v4 kit (see T.mapV2Trooper)
function upgradeV2(d) {
  const t2 = d.cur && d.cur.trooper ? T.mapV2Trooper(T.sanitizeFields(d.cur.trooper, T.TROOPER_FIELDS_V2, T.TROOPER_DEFAULT_V2)) : null;
  const nations = (Array.isArray(d.nations) ? d.nations : []).filter((n) => n && typeof n === 'object').map((n) => ({ ...n, roster: blankRoster() }));
  const act = nations.find((n) => n.id === d.active) || nations[0];
  if (act && t2) act.roster[0] = { blank: false, name: 'Trooper 1', icon: '', ia: true, tpl: null, t: t2 }; // v5: no preset units
  const looks = (Array.isArray(d.looks) ? d.looks : []).map((l) => {
    if (!l || l.unit !== 'trooper') return l;
    const u = T.undigitsV2Trooper(l.u); return u ? { ...l, u: T.digits(u, T.TROOPER_FIELDS), tk: '' } : null;
  });
  return { ...d, v: 3, nations, looks, tank: d.cur && d.cur.tank, slot: 0, upgradedFrom: 'v2' };
}
// v1 -> v4: one nation per distinct color/flag combo found in the v1 current look + saved looks
function migrateV1() {
  const d = { player: { name: 'Player' }, nations: [], looks: [], unit: 'trooper' };
  const combos = new Map();
  const nationFor = (nat) => { const key = T.nationCode(nat); if (!combos.has(key)) { const n = newNation('Nation ' + (combos.size + 1), nat); combos.set(key, n); d.nations.push(n); } return combos.get(key); };
  const cur = T.decodeTC1(lsGet(LS_CUR_V1)); // TC1 decode already maps into the v4 kit
  if (cur) { const n = nationFor(cur.nation); d.active = n.id; n.roster[0] = { blank: false, name: 'Trooper 1', icon: '', ia: true, tpl: null, t: cur.trooper }; }
  let old = []; try { old = JSON.parse(lsGet(LS_LOOKS_V1) || '[]'); } catch (e) { old = []; }
  if (Array.isArray(old)) for (const l of old) {
    const dec = l && T.decodeTC1(l.code); if (!dec) continue;
    const n = nationFor(dec.nation);
    d.looks.push({ id: typeof l.id === 'string' ? l.id : newId(), nationId: n.id, unit: 'trooper', name: clean(l.name) || 'Trooper', u: T.digits(dec.trooper, T.TROOPER_FIELDS) });
  }
  if (cur || d.looks.length) d.migratedFrom = 'v1';
  return cleanDB(d);
}
// ---------- army save (botcampus:army) <-> in-memory db ----------
// The editor keeps its v3-shaped db in memory (nations = players). It loads from / saves to the shared army save.
function armyToDb(a) {
  const nations = [], looks = [], extra = [];
  for (const p of a.players) {
    const st = Army.nationState(p.nation), roster = blankRoster(), mine = Army.playerUnits(a, p.id);
    const n = { id: p.nation.id, pid: p.id, playerName: p.name, name: p.nation.name, ...st, roster, tank: null, tankId: '', tankName: '' };
    for (const u of mine.filter((x) => x.roster && x.kind === 'trooper')) {
      let i = Number.isInteger(u.slot) && u.slot < T.ROSTER_SIZE && roster[u.slot].blank ? u.slot : roster.findIndex((r) => r.blank);
      if (i < 0) { extra.push(u); continue; }
      roster[i] = { blank: false, id: u.id, name: u.name, icon: u.icon, ia: !u.icon, tpl: null, t: Army.unitState(u), traits: u.traits, brain: u.brain };
    }
    for (const u of mine.filter((x) => x.roster && x.kind === 'tank')) {
      if (n.tank) { extra.push(u); continue; }
      Object.assign(n, { tank: Army.unitState(u), tankId: u.id, tankName: u.name, tankBrain: u.brain ?? null });
    }
    if (!n.tank) Object.assign(n, { tank: { ...BASIC_TANK }, tankId: 'k-' + n.id, tankName: 'Tank 1' });
    for (const u of mine.filter((x) => !x.roster)) looks.push({ id: u.id, nationId: n.id, unit: u.kind, name: u.name, u: T.digits(Army.unitState(u), UNITS[u.kind].fields), thumb: u.thumb || '', tk: '', traits: u.traits, brain: u.brain ?? null });
    nations.push(n);
  }
  const act = a.players.find((p) => p.id === a.activePlayerId) || a.players[0], cu = a.ext && a.ext['trooper-custom'] || {};
  const base = { ...a }; delete base.players; delete base.units; // squads[], ships[], ext + unknown keys ride along untouched
  const d = cleanDB({ v: 3, player: { name: act.name }, nations, active: act.nation.id, slot: cu.slot, unit: cu.unit, looks, medals: cu.medals, _extra: extra, _base: base });
  if (a.migratedFrom) d.migratedFrom = a.migratedFrom;
  return d;
}
function dbToArmy(d) {
  const units = [], pidOf = {};
  const players = d.nations.map((n) => { pidOf[n.id] = n.pid; return { id: n.pid, name: n.playerName, nation: Army.nationFromState(n, n.id, n.name) }; });
  for (const n of d.nations) {
    n.roster.forEach((r, i) => { if (!r.blank) units.push({ id: r.id, name: r.name, playerId: n.pid, kind: 'trooper', gear: S.toGear('trooper', r.t), traits: r.traits || [], brain: r.brain ?? null, roster: true, slot: i, icon: r.ia ? '' : r.icon }); });
    units.push({ id: n.tankId, name: n.tankName || 'Tank 1', playerId: n.pid, kind: 'tank', gear: S.toGear('tank', n.tank), traits: [], brain: n.tankBrain ?? null, roster: true, slot: 0 });
  }
  for (const l of d.looks) {
    const def = UNITS[l.unit], u = T.undigits(l.u, def.fields, def.defaults); if (!u || !pidOf[l.nationId]) continue;
    units.push({ id: l.id, name: l.name, playerId: pidOf[l.nationId], kind: l.unit, gear: S.toGear(l.unit, u), traits: l.traits || [], brain: l.brain ?? null, roster: false, thumb: l.thumb });
  }
  const pids = new Set(Object.values(pidOf));
  for (const u of d._extra || []) if (pids.has(u.playerId) && !units.some((x) => x.id === u.id)) units.push(u);
  const base = d._base || {}, act = d.nations.find((n) => n.id === d.active) || d.nations[0];
  return { ...base, version: Army.ARMY_VERSION, activePlayerId: act.pid, players, units, ships: base.ships || [], ext: { ...(base.ext || {}), 'trooper-custom': { slot: d.slot, unit: d.unit, medals: d.medals } } };
}
// legacy mirror for Conquest v2.3 ('trooper-custom:db' v3): same shape as before, tank = active nation's tank
function legacyDb(d) {
  const o = { ...d, tank: (d.nations.find((n) => n.id === d.active) || d.nations[0]).tank };
  delete o._extra; delete o._base; return o;
}
function loadDB() {
  const rawArmy = lsGet(Army.ARMY_KEY);
  if (rawArmy) { const a = Army.load(); if (a && a.players && a.players.length) return armyToDb(a); }
  const raw = lsGet(LS_DB); let d = null;
  try { d = JSON.parse(raw || 'null'); } catch (e) { d = null; }
  if (d && d.v === 3) { // Army.load() migrates v3 + Conquest traits; keep the editor's active slot / unit
    const m = armyToDb(Army.load());
    if (Number.isInteger(d.slot) && d.slot >= 0 && d.slot < T.ROSTER_SIZE) m.slot = d.slot;
    if (d.unit === 'tank' || d.unit === 'trooper') m.unit = d.unit;
    return m;
  }
  if (d && d.v === 2) { lsSet(LS_DB_V2, raw); return cleanDB(upgradeV2(d)); } // keep a copy of the old save
  const m = migrateV1(); justMigrated = !!m.migratedFrom;
  if (!justMigrated) { const t = { ...BASIC_T }; m.nations[0].roster[0] = { blank: false, id: Army.newId('u'), name: 'Trooper 1', icon: weaponIcon(t), ia: true, tpl: null, t, traits: [], brain: null }; } // fresh start: one basic trooper
  return m;
}
let justMigrated = false;
let db = loadDB();
let saveT = 0;
let wiped = false;
// dirty = this tab has user edits not yet written. Only then does flushDB() touch 'botcampus:army', so edits made in
// another tab (Conquest units[].brain, squads, ...) are not overwritten when this tab hides / closes.
let dirty = !lsGet(Army.ARMY_KEY); // no army save yet (fresh start / legacy migration) -> write it once at startup
// merge on write: start from the stored army and replace only what this page owns (players, units' look fields,
// activePlayerId, ext['trooper-custom']); keep units[].brain / ext / unknown unit keys, squads, ships, other ext + top-level keys.
function mergeArmy(mine) {
  let st = null; try { st = JSON.parse(lsGet(Army.ARMY_KEY) || 'null'); } catch (e) { st = null; }
  if (!st || typeof st !== 'object' || !Array.isArray(st.units)) return mine;
  const old = new Map(st.units.filter((u) => u && typeof u.id === 'string').map((u) => [u.id, u]));
  const units = mine.units.map((u) => { const o = old.get(u.id); if (!o) return u; const m = { ...o, ...u, brain: o.brain ?? null }; if ('ext' in o) m.ext = o.ext; else delete m.ext; return m; });
  const ext = { ...(st.ext && typeof st.ext === 'object' ? st.ext : {}), 'trooper-custom': mine.ext['trooper-custom'] };
  return { ...st, version: mine.version, activePlayerId: mine.activePlayerId, players: mine.players, units, squads: Array.isArray(st.squads) ? st.squads : [], ships: Array.isArray(st.ships) ? st.ships : [], ext };
}
const flushDB = () => {
  clearTimeout(saveT); saveT = 0; if (wiped || !dirty) return true;
  const ok = Army.save(mergeArmy(dbToArmy(db)), undefined, 'trooper-custom');
  const r = lsSet(LS_DB, JSON.stringify(legacyDb(db))) && ok;
  dirty = false; return r;
};
const saveDB = () => { dirty = true; clearTimeout(saveT); saveT = setTimeout(flushDB, 60); };
addEventListener('pagehide', flushDB);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDB(); });
flushDB();

const nation = (id = db.active) => db.nations.find((n) => n.id === id) || db.nations[0];
// current unit looks: trooper = active roster slot of the active nation, tank = shared
const cur = {
  get trooper() { return nation().roster[db.slot].t; },
  set trooper(v) { // editing a blank slot turns it into a (base) trooper named 'Slot N'
    const s = nation().roster[db.slot];
    if (s.blank) Object.assign(s, { blank: false, id: Army.newId('u'), name: nextTrooperName(), ia: true, tpl: null, traits: [], brain: null });
    s.t = v; if (s.ia) s.icon = weaponIcon(v);
  },
  get tank() { return nation().tank; }, set tank(v) { nation().tank = v; db.tank = v; },
};
// v5: everything is unlocked (cost is still shown). Medal counters are kept in the save for later.
const unlocked = () => true;
// 'Trooper 1', 'Trooper 2', … : lowest number not used by this nation's roster
function nextTrooperName(n = nation()) { const used = new Set(n.roster.filter((r) => !r.blank).map((r) => r.name)); for (let k = 1; ; k++) if (!used.has('Trooper ' + k)) return 'Trooper ' + k; }
const fullState = (unit = db.unit, us = cur[unit], nat = nation()) => {
  const st = { ...nat, skin: unit === 'trooper' ? us.skin : cur.trooper.skin, ...us };
  delete st.roster;
  if (unit === 'trooper') st.award = us.award && unlocked(us.weapon) ? 1 : 0; // ⭐ only shows/costs once unlocked
  return st;
};

// ---------- renderer / scene ----------
const view = $('#view'), app = $('#app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
function addLights(sc) {
  sc.add(new THREE.HemisphereLight(0xcfe0ff, 0x262a33, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(2.5, 4, 3.5); sc.add(key);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 1.2); rim.position.set(-3, 2.5, -3.5); sc.add(rim);
}
addLights(scene);

const stage = new THREE.Group(); scene.add(stage);
const padGroup = new THREE.Group(); stage.add(padGroup);
{
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshLambertMaterial({ color: 0x1a2232 }));
  pad.rotation.x = -Math.PI / 2; padGroup.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.06, 1.1, 40), new THREE.MeshBasicMaterial({ color: 0x6ff3ff, transparent: true, opacity: 0.45 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; padGroup.add(ring);
}
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
const blobGeo = new THREE.PlaneGeometry(0.9, 0.9);
const blob = new THREE.Mesh(blobGeo, blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.004; stage.add(blob);

const field = new THREE.Group(); field.visible = false; scene.add(field);
{
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshLambertMaterial({ color: 0x151b28 }));
  gnd.rotation.x = -Math.PI / 2; field.add(gnd);
  const grid = new THREE.GridHelper(160, 64, 0x2c3a55, 0x1f2840); grid.position.y = 0.003; field.add(grid);
}

// one shared look (atlas + 2 materials) per nation on screen; both units use it
const look = new T.TeamLook();
const units = { trooper: new T.Unit(look, T.TROOPER), tank: new T.Unit(look, TANK) };
for (const u of Object.values(units)) stage.add(u.root);

// ---------- camera / controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.12; controls.enablePan = false; controls.rotateSpeed = 0.8;
controls.autoRotateSpeed = 2.5;
const FIT = { trooper: { hh: 1.25, hw: 0.8, ty: 1.0, pol: 1.38, min: 1.3, max: 9 }, tank: { hh: 1.6, hw: 3.1, ty: 0.8, pol: 1.2, min: 3, max: 18 } };
let squadOn = false, squadN = 100, squadMix = false;
const SQUAD_SIZES = [50, 100, 200];
function fitDistance() {
  const f = FIT[db.unit], t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.max(f.hh / t, f.hw / (t * camera.aspect)) * 1.12;
}
function setOrbit(target, r, polar, az) {
  controls.target.set(...target);
  camera.position.setFromSpherical(new THREE.Spherical(r, polar, az)).add(controls.target);
  camera.lookAt(controls.target); controls.update();
}
function camHome() {
  if (squadOn && squad) {
    controls.minDistance = 4; controls.maxDistance = 200;
    setOrbit([0, 0, 0], squad.extent * 1.6 / Math.min(1, camera.aspect) + 8, 0.85, 0.2);
  } else {
    const f = FIT[db.unit]; controls.minDistance = f.min; controls.maxDistance = f.max;
    setOrbit([0, f.ty, 0], fitDistance(), f.pol, 0.5);
  }
}
let tween = null;
function viewTo(name) {
  const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const az = { front: 0, side: -Math.PI / 2, back: Math.PI }[name] ?? 0;
  let d = az - s.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
  tween = { t0: performance.now(), dur: 450, from: s.theta, d, phiFrom: s.phi, phiTo: squadOn ? 0.85 : FIT[db.unit].pol + 0.04, r: s.radius };
}
function resize() {
  const w = Math.max(1, view.clientWidth), hh = Math.max(1, view.clientHeight);
  renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix();
  if (!squadOn) { const off = camera.position.clone().sub(controls.target); off.setLength(fitDistance()); camera.position.copy(controls.target).add(off); controls.update(); }
}
new ResizeObserver(resize).observe(view);

// ---------- squad (instanced: 2 draw calls per unit type) ----------
let squad = null;
function disposeSquad() {
  if (!squad) return;
  for (const g of squad.groups) for (const m of g.meshes) { field.remove(m); m.geometry.dispose(); m.dispose?.(); }
  field.remove(squad.blobs); squad.blobs.dispose?.(); squad = null;
}
function squadPlan() {
  if (!squadMix) return [{ unit: db.unit, count: squadN, state: fullState(db.unit), slot: db.unit === 'trooper' && !nation().roster[db.slot].blank ? db.slot : -1 }];
  // mixed: ~10% tanks + the nation's 6 roster types split evenly
  const tanks = Math.max(1, Math.round(squadN / 10)), tr = squadN - tanks, plan = [{ unit: 'tank', count: tanks, state: fullState('tank'), slot: -1 }];
  // blank slots are skipped; with no filled slot the troopers use the base kit
  const filled = nation().roster.map((r, i) => ({ r, i })).filter((x) => !x.r.blank), types = filled.length ? filled : [{ r: { t: T.TROOPER_DEFAULT }, i: -1 }];
  types.forEach(({ r, i }, k) => { const count = Math.floor(tr / types.length) + (k < tr % types.length ? 1 : 0); if (count) plan.push({ unit: 'trooper', count, state: fullState('trooper', r.t), slot: i }); });
  return plan;
}
function buildSquad() {
  disposeSquad();
  const groups = [], slots = [], grids = [];
  for (const it of squadPlan()) { const g = grids.at(-1); if (g && g.unit === it.unit) g.items.push(it); else grids.push({ unit: it.unit, items: [it] }); }
  let zCursor = 0, extent = 0;
  for (const grid of grids) { // roster types share one formation, in bands
    const tank = grid.unit === 'tank', sx = tank ? 3.6 : 1.25, sz = tank ? 4.8 : 1.35;
    const total = grid.items.reduce((a, it) => a + it.count, 0);
    const cols = Math.ceil(Math.sqrt(total * (tank && squadMix ? 2 : 1))), rows = Math.ceil(total / cols);
    let j = 0;
    for (const it of grid.items) {
      const geos = T.buildMergedDef(UNITS[it.unit], it.state), meshes = [];
      let perTris = 0;
      for (const [mat, g] of Object.entries(geos)) {
        const im = new THREE.InstancedMesh(g, mat === 'team' ? look.team : look.visor, it.count);
        im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.name = `squad:${it.unit}:${it.slot}:${mat}`;
        field.add(im); meshes.push(im); perTris += g.attributes.position.count / 3;
      }
      const offs = [];
      for (let i = 0; i < it.count; i++, j++) {
        const c = j % cols, r = (j / cols) | 0;
        const x = (c - (cols - 1) / 2) * sx + (tank ? 0 : (r % 2) * 0.3), z = zCursor - r * sz;
        offs.push({ x, z, ph: (j * 2.399) % 6.283, yaw: Math.sin(j * 12.9898) * (tank ? 0.12 : 0.25), hover: tank && it.state.drive === 1 });
        slots.push({ x, z, sx: tank ? 2.6 : 1, sz: tank ? 4.2 : 1 });
      }
      groups.push({ unit: it.unit, slot: it.slot, state: it.state, count: it.count, meshes, offs, perTris });
    }
    extent = Math.max(extent, cols * sx, rows * sz + Math.abs(zCursor));
    zCursor -= rows * sz + (tank ? 1.5 : 0);
  }
  // recenter on z
  const zMid = zCursor / 2;
  for (const g of groups) for (const o of g.offs) o.z -= zMid;
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, slots.length); blobs.frustumCulled = false; field.add(blobs);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  slots.forEach((s, i) => blobs.setMatrixAt(i, m4.compose(new THREE.Vector3(s.x, 0.004, s.z - zMid), q, new THREE.Vector3(s.sx, s.sz, 1))));
  blobs.instanceMatrix.needsUpdate = true;
  squad = { groups, blobs, extent };
  animateSquad(0);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _sc = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);
function animateSquad(t) {
  if (!squad) return;
  for (const g of squad.groups) {
    const tank = g.unit === 'tank';
    for (let i = 0; i < g.offs.length; i++) {
      const o = g.offs[i];
      _p.set(o.x, o.hover ? 0.035 * Math.sin(t * 1.7 + o.ph) : 0, o.z);
      _q.setFromAxisAngle(_y, o.yaw + (tank ? 0 : 0.04 * Math.sin(t * 0.7 + o.ph)));
      _sc.set(1, tank ? 1 : 1 + 0.01 * Math.sin(t * 2.1 + o.ph), 1);
      _m.compose(_p, _q, _sc);
      for (const im of g.meshes) im.setMatrixAt(i, _m);
    }
    for (const im of g.meshes) im.instanceMatrix.needsUpdate = true;
  }
}
function setSquad(on) {
  squadOn = !!on;
  stage.visible = !squadOn; field.visible = squadOn;
  if (squadOn) buildSquad(); else disposeSquad();
  $('#squadBtn').classList.toggle('on', squadOn); $('#costchip').classList.toggle('sq', squadOn); $('#squadbar').classList.toggle('hidden', !squadOn);
  $('#squadN b').textContent = squadN; $('#squadMix').classList.toggle('on', squadMix);
  camHome(); updateStatsText();
}

// ---------- thumbnails (offscreen render target, shared renderer) ----------
const TS = 144;
const thumbRT = new THREE.WebGLRenderTarget(TS, TS);
const thumbScene = new THREE.Scene(); addLights(thumbScene);
const thumbLook = new T.TeamLook();
const thumbCam = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
const thumbPix = new Uint8Array(TS * TS * 4);
const LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LUT[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
const FRAMES = {
  full: { t: [0, 1.0, 0], r: 4.4, az: 0.45, pol: 1.4 },
  tpl: { t: [-0.02, 1.08, 0.08], r: 3.1, az: 0.55, pol: 1.4 },
  head: { t: [0, 1.65, 0.02], r: 0.85, az: 0.55, pol: 1.4 },
  torso: { t: [0, 1.12, 0], r: 2.0, az: 0.5, pol: 1.35 },
  arm: { t: [0.2, 1.28, 0], r: 1.35, az: 0.95, pol: 1.3 },
  back: { t: [0, 1.4, -0.1], r: 2.2, az: Math.PI - 0.55, pol: 1.3 },
  weapon: { t: [-0.08, 1.1, 0.38], r: 1.8, az: -1.52, pol: 1.45 },
  holster: { t: [-0.2, 0.82, 0.0], r: 1.15, az: -1.05, pol: 1.5 },
  belt: { t: [0.1, 0.96, 0.04], r: 1.2, az: 0.85, pol: 1.5 },
  tank: { t: [0, 0.8, 0.3], r: 8.6, az: 0.7, pol: 1.15 },
  tturret: { t: [0, 1.25, 0.1], r: 5.2, az: 0.75, pol: 1.1 },
  tgun: { t: [0, 1.15, 0.8], r: 6.2, az: 1.15, pol: 1.2 },
  tback: { t: [0, 1.25, -0.3], r: 7.0, az: 2.45, pol: 1.15 },
};
function renderThumb(unit, state, frame) {
  thumbLook.paint(state);
  const geos = T.buildMergedDef(UNITS[unit], state), meshes = [];
  for (const [mat, g] of Object.entries(geos)) { const m = new THREE.Mesh(g, mat === 'team' ? thumbLook.team : thumbLook.visor); thumbScene.add(m); meshes.push(m); }
  const f = FRAMES[frame] || FRAMES.full, tgt = new THREE.Vector3(...f.t);
  thumbCam.position.setFromSpherical(new THREE.Spherical(f.r, f.pol, f.az)).add(tgt); thumbCam.lookAt(tgt);
  renderer.setRenderTarget(thumbRT); renderer.clear(); renderer.render(thumbScene, thumbCam);
  renderer.readRenderTargetPixels(thumbRT, 0, 0, TS, TS, thumbPix);
  renderer.setRenderTarget(null);
  for (const m of meshes) { thumbScene.remove(m); m.geometry.dispose(); }
  const img = new ImageData(TS, TS), d = img.data;
  for (let y = 0; y < TS; y++) {
    const src = (TS - 1 - y) * TS * 4, dst = y * TS * 4;
    for (let x = 0; x < TS * 4; x += 4) { d[dst + x] = LUT[thumbPix[src + x]]; d[dst + x + 1] = LUT[thumbPix[src + x + 1]]; d[dst + x + 2] = LUT[thumbPix[src + x + 2]]; d[dst + x + 3] = thumbPix[src + x + 3]; }
  }
  return img;
}
const thumbCache = new Map();
let thumbQueue = [];
const stateKey = (unit, st) => unit + '|' + T.nationCode(st) + st.skin + '|' + T.digits(st, UNITS[unit].fields);
function cachedThumb(unit, state, frame) {
  const key = frame + '|' + stateKey(unit, state);
  let img = thumbCache.get(key);
  if (!img) { img = renderThumb(unit, state, frame); thumbCache.set(key, img); if (thumbCache.size > 300) thumbCache.delete(thumbCache.keys().next().value); }
  return img;
}
function thumbDataURL(unit, state) {
  const img = cachedThumb(unit, state, unit === 'tank' ? 'tank' : 'full');
  const c = h('canvas', { width: TS, height: TS }); c.getContext('2d').putImageData(img, 0, 0);
  const s = h('canvas', { width: 96, height: 96 }); s.getContext('2d').drawImage(c, 0, 0, 96, 96);
  return s.toDataURL('image/png');
}
function pumpThumbs() {
  let n = 0;
  while ((thumbQueue.length || sheetThumbs.length) && n < 4) {
    const job = thumbQueue.length ? thumbQueue.shift() : sheetThumbs.shift();
    if (!job.canvas.isConnected) continue;
    job.canvas.getContext('2d').putImageData(cachedThumb(job.unit, job.state, job.frame), 0, 0); n++;
  }
}
function drawFlag(c, nat) {
  const g = c.getContext('2d'), W = c.width;
  g.clearRect(0, 0, W, W); g.fillStyle = nat.s; g.beginPath(); g.roundRect(W * 0.05, W * 0.05, W * 0.9, W * 0.9, W * 0.14); g.fill();
  g.strokeStyle = nat.p; g.lineWidth = Math.max(2, W * 0.06); g.stroke();
  T.drawSymbol(g, nat.sym, W / 2, W / 2, W * 0.31, T.symbolColor(nat));
}

// ---------- panel ----------
// name = label shown on the active tab + section header; sub = what's in the section
const TAB_DEF = {
  nation: { ico: '🏳️', name: 'Nation', sub: 'player, colors, flag' },
  head: { ico: '🪖', name: 'Helmet', sub: 'helmet, skin' }, armor: { ico: '🛡️', name: 'Armor', sub: 'armor, pads, ❤️ HP · 🏃 speed' },
  weapon: { ico: '🔫', name: 'Weapons', sub: 'main weapon, ⭐ award' }, kit: { ico: '💣', name: 'Kit', sub: 'sidearm, explosive' },
  gear: { ico: '🎒', name: 'Gear', sub: 'gadget, back flag, cape' },
  hull: { ico: '⛓️', name: 'Hull', sub: 'hull, drive' }, turret: { ico: '🎯', name: 'Turret', sub: 'turret, main gun' }, tx: { ico: '📡', name: 'Extras', sub: 'antenna, skirts, smoke, MG' },
  looks: { ico: '💾', name: 'Saved', sub: 'save, load, share code' },
};
const tabLabel = (id) => TAB_DEF[id].ico + ' ' + TAB_DEF[id].name;
const tabTitle = (id) => tabLabel(id) + ' · ' + TAB_DEF[id].sub;
const UNIT_LABEL = { trooper: '🪖 Trooper', tank: '🚜 Tank' };

// brief label next to whatever was tapped (tabs, roster slots, unit switch, view buttons)
const tapEl = h('div', { id: 'taplabel', role: 'status', 'aria-live': 'polite' }); document.body.append(tapEl);
let tapT = 0;
function tapLabel(el, text) {
  if (!el || !el.isConnected) return;
  tapEl.textContent = text; tapEl.classList.add('on');
  const r = el.getBoundingClientRect(), w = tapEl.offsetWidth, hh = tapEl.offsetHeight;
  let top = r.top - hh - 6; if (top < 4) top = r.bottom + 6;
  tapEl.style.left = Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2)) + 'px';
  tapEl.style.top = Math.min(innerHeight - hh - 4, top) + 'px';
  clearTimeout(tapT); tapT = setTimeout(() => tapEl.classList.remove('on'), 1200);
}
const UNIT_TABS = { trooper: ['nation', 'head', 'armor', 'weapon', 'kit', 'gear', 'looks'], tank: ['nation', 'hull', 'turret', 'tx', 'looks'] };
const PARTS = {
  helm: { unit: 'trooper', frame: 'head', names: ['Dome', 'Angular', 'Crest', 'Goggles', 'Recon'] },
  armor: { unit: 'trooper', frame: 'torso', items: ITEMS.armor },
  pads: { unit: 'trooper', frame: 'arm', names: ['None', 'Round', 'Angular'] },
  weapon: { unit: 'trooper', frame: 'weapon', items: ITEMS.weapon },
  side: { unit: 'trooper', frame: 'holster', items: ITEMS.side },
  expl: { unit: 'trooper', frame: 'belt', items: ITEMS.expl },
  gadget: { unit: 'trooper', frame: 'back', items: ITEMS.gadget },
  extra: { unit: 'trooper', frame: 'back', names: ['None', 'Cape', 'Scarf'] },
  banner: { unit: 'trooper', frame: 'back', names: ['Off', 'On'] },
  hull: { unit: 'tank', frame: 'tank', names: ['Light', 'Medium', 'Heavy'] },
  drive: { unit: 'tank', frame: 'tank', names: ['Treads', 'Hover'] },
  turret: { unit: 'tank', frame: 'tturret', names: ['Dome', 'Wedge', 'Box'] },
  gun: { unit: 'tank', frame: 'tgun', names: ['Cannon', 'Twin', 'Rail', 'Laser'] },
};
const TOGGLES = [['antenna', 'tback', 'Antenna'], ['pennant', 'tback', 'Pennant'], ['skirts', 'tank', 'Skirts'], ['smoke', 'tturret', 'Smoke'], ['mg', 'tturret', 'Roof MG']];
let tab = 'nation';
const DEBUG = /[?&]debug=1\b/.test(location.search);
const tabsEl = $('#tabs'), body = $('#pbody');
tabsEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { if (sheet) closeSheet(); setTab(b.dataset.tab); tapLabel(b, tabLabel(b.dataset.tab)); } });

const lab = (ico, txt) => h('div', { className: 'lab' }, [ico, txt ? h('small', { textContent: txt }) : null]);
function swatchRow(key, palette, custom, glow = false) {
  const row = h('div', { className: 'sw', 'data-key': key });
  palette.forEach((c, i) => row.append(h('button', { type: 'button', title: c, 'aria-label': key + ' ' + c, 'data-k': key, 'data-v': custom ? c : String(i), style: `--c:${c}`, className: glow ? 'glow' : '' })));
  if (custom) {
    const inp = h('input', { type: 'color', 'aria-label': 'Custom color' });
    inp.addEventListener('input', () => setValues({ [key]: inp.value }));
    row.append(h('label', { title: 'Custom color', 'data-custom': key }, [h('span', { textContent: '🎨' }), inp]));
  }
  return row;
}
function partTiles(key) {
  const p = PARTS[key], row = h('div', { className: 'tiles', 'data-key': key });
  row.classList.add('stat');
  (p.items ? p.items.map((it) => it.n) : p.names).forEach((n, i) => { const gl = gearLine(p.unit, key, i); row.append(h('button', { type: 'button', title: (p.items ? `${p.items[i].i} ${n}: ${p.items[i].tip}` : n) + ' · ' + gl, 'aria-label': key + ' ' + n, 'data-k': key, 'data-v': String(i), 'data-frame': p.frame, 'data-unit': p.unit },
    [h('canvas', { width: TS, height: TS }), h('i', { textContent: n }), costBadge(p.unit, key, i), h('em', { className: 'gl', textContent: gl })])); });
  return row;
}
// one short icon line with the REAL battle numbers (games/shared/army/stats.js); cost is the badge, so drop 💰 here
const gearLine = (unit, k, i) => S.gearLines(unit, k, i).filter((x) => !x.startsWith('💰')).join(' ') || '🎨 look only';
// ⭐ award versions: one tile per main weapon (v5: all unlocked)
function awardTiles() {
  const row = h('div', { className: 'tiles award', 'data-key': 'award' });
  ITEMS.weapon.forEach((it, w) => row.append(h('button', { type: 'button', title: `${ITEMS.award[w].tip} 🎖️×${MEDALS_NEEDED}`, 'aria-label': 'award ' + it.n, 'data-award': String(w), 'data-frame': 'weapon', 'data-unit': 'trooper' },
    [h('canvas', { width: TS, height: TS }), h('i', { textContent: '⭐' + it.n }), h('b', { className: 'cb', textContent: '+' + awardCost(w) }), h('em', { className: 'gl', textContent: '💥 ' + S.fmt(S.WEAPONS[w].dmg * S.BATTLE.awardDmg) + ' (+10%)' })])));
  row.classList.add('stat');
  return row;
}
function costBadge(unit, k, v) { const c = optionCost(unit, k, v); return h('b', { className: 'cb' + (c ? '' : ' free'), textContent: c ? '+' + c : '' }); }
function toggleTiles() {
  const row = h('div', { className: 'tiles', 'data-key': 'toggles' });
  row.classList.add('stat');
  for (const [k, frame, n] of TOGGLES) { const gl = gearLine('tank', k, 1); row.append(h('button', { type: 'button', title: n + ' · ' + gl, 'aria-label': 'toggle ' + n, 'data-toggle': k, 'data-frame': frame, 'data-unit': 'tank' }, [h('canvas', { width: TS, height: TS }), h('i', { textContent: n }), costBadge('tank', k, 1), h('em', { className: 'gl', textContent: gl })])); }
  return row;
}
function symTiles() {
  const row = h('div', { className: 'tiles sym', 'data-key': 'sym' });
  T.SYMBOLS.forEach((n, i) => row.append(h('button', { type: 'button', title: n, 'aria-label': 'symbol ' + n, 'data-k': 'sym', 'data-v': String(i) }, [h('canvas', { width: 88, height: 88, 'data-sym': String(i) })])));
  return row;
}
function scTiles() {
  const row = h('div', { className: 'tiles sym', 'data-key': 'sc' });
  ['Auto', 'Light', 'Dark', 'Primary'].forEach((n, i) => row.append(h('button', { type: 'button', title: n, 'aria-label': 'symbol color ' + n, 'data-k': 'sc', 'data-v': String(i) }, [h('canvas', { width: 88, height: 88, 'data-sc': String(i) }), h('i', { textContent: ['A', '☀', '☾', '1'][i] })])));
  return row;
}
function iconTiles(key, icons, titles) {
  const row = h('div', { className: 'tiles small', 'data-key': key });
  icons.forEach((ic, i) => row.append(h('button', { type: 'button', title: titles[i], 'aria-label': key + ' ' + titles[i], 'data-k': key, 'data-v': String(i) }, [h('span', { className: 'ico', textContent: ic })])));
  return row;
}
const SECS = {
  nation: () => [
    lab('👤', 'player name (this nation)'),
    h('div', { className: 'saverow' }, [h('input', { id: 'playerName', type: 'text', maxLength: 24, placeholder: '👤', 'aria-label': 'Player name', autocomplete: 'off' })]),
    lab('🏳️', 'players · nations (tap to switch)'), h('div', { id: 'nations', className: 'rows' }),
    h('button', { id: 'addNation', type: 'button', className: 'btn go wide', title: 'New player + nation', textContent: '➕ 👤 🏳️' }),
    lab('🎨 1', 'main'), swatchRow('p', T.PRIMARY, true), lab('🎨 2', 'trim'), swatchRow('s', T.SECONDARY, true),
    lab('🧥', 'suit'), swatchRow('suit', T.SUIT, false),
    lab('🏳️', 'symbol'), symTiles(), lab('◐', 'symbol color'), scTiles(),
    lab('👁️', 'glow color'), swatchRow('vis', T.VISOR, false, true), lab('✨', 'glow'), iconTiles('glow', ['🌑', '🌓', '🌕'], ['Off', 'Soft', 'Bright']),
  ],
  head: () => [lab('🪖', 'helmet'), partTiles('helm'), lab('✋', 'skin (goggles)'), swatchRow('skin', T.SKIN, false)],
  armor: () => [lab('🛡️', 'armor'), partTiles('armor'), h('div', { id: 'statPrev', className: 'statprev' }), lab('🔰', 'shoulders'), partTiles('pads')],
  weapon: () => [lab('🔫', 'main weapon · 💥 damage 🎯 range ⏱️ reload'), partTiles('weapon'), lab('⭐', 'award weapons · all unlocked'), awardTiles()],
  kit: () => [lab('🔫', 'sidearm'), partTiles('side'), lab('💣', 'explosive'), partTiles('expl')],
  gear: () => [lab('🎒', 'gadget'), partTiles('gadget'), lab('🚩', 'back flag'), partTiles('banner'), lab('🧣', 'extra'), partTiles('extra')],
  hull: () => [lab('⛓️', 'hull'), partTiles('hull'), lab('🛞', 'drive'), partTiles('drive')],
  turret: () => [lab('🎯', 'turret'), partTiles('turret'), lab('💥', 'main gun'), partTiles('gun')],
  tx: () => [lab('📡', 'extras'), toggleTiles()],
  looks: () => [
    lab('💾', 'save this look → active nation'),
    h('div', { className: 'saverow' }, [h('input', { id: 'lookName', type: 'text', maxLength: 24, placeholder: '🏷️ name', 'aria-label': 'Look name', autocomplete: 'off' }), h('button', { id: 'saveLook', type: 'button', className: 'btn go', title: 'Save as new look', textContent: '💾 +' })]),
    h('div', { id: 'looks', className: 'rows' }),
    lab('🔗', 'share code'),
    h('div', { className: 'coderow' }, [h('input', { id: 'codeIn', type: 'text', spellcheck: false, autocomplete: 'off', 'aria-label': 'Share code' }), h('button', { id: 'copyCode', type: 'button', className: 'btn', title: 'Copy code', textContent: '📋' }), h('button', { id: 'loadCode', type: 'button', className: 'btn go', title: 'Load pasted code', textContent: '⤵' })]),
  ],
};
for (const id of Object.keys(TAB_DEF)) body.append(h('div', { className: 'sec', 'data-sec': id }, SECS[id]()));
$('#playerName').addEventListener('input', (e) => { const v = clean(e.target.value); if (v) { nation().playerName = v; saveDB(); renderWho(); } });
$('#playerName').addEventListener('change', (e) => { e.target.value = db.player.name; refreshCode(); });

body.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (b) {
    const k = b.dataset.k, v = b.dataset.v;
    setValues(k === 'weapon' ? { weapon: Number(v), award: 0 } : { [k]: k === 'p' || k === 's' ? v : Number(v) });
    const it = PARTS[k] && PARTS[k].items && PARTS[k].items[Number(v)]; if (it) toast(`${it.i} ${it.n} · ${gearLine(PARTS[k].unit, k, Number(v))}`, false, 2600);
    return;
  }
  const a = e.target.closest('button[data-award]'); if (a) { awardPick(Number(a.dataset.award)); return; }
  if (e.target.closest('#debugAward')) { debugUnlock(!db.debugAward); return; }
  const t = e.target.closest('button[data-toggle]');
  if (t) { const k = t.dataset.toggle; setValues({ [k]: cur.tank[k] ? 0 : 1 }); }
});

function buildTabs() {
  tabsEl.replaceChildren(...UNIT_TABS[db.unit].map((id) => h('button', { type: 'button', title: tabTitle(id), 'aria-label': TAB_DEF[id].name, role: 'tab', 'data-tab': id },
    [h('span', { className: 'ti', textContent: TAB_DEF[id].ico }), h('span', { className: 'tl', textContent: TAB_DEF[id].name })])));
  for (const b of document.querySelectorAll('#unitbar [data-unit]')) b.classList.toggle('on', b.dataset.unit === db.unit);
}
function setTab(id) {
  if (!UNIT_TABS[db.unit].includes(id)) id = UNIT_TABS[db.unit][1];
  tab = id;
  for (const b of tabsEl.children) { b.classList.toggle('on', b.dataset.tab === id); b.setAttribute('aria-selected', String(b.dataset.tab === id)); }
  renderSecHead();
  for (const s of body.children) s.classList.toggle('on', s.dataset.sec === id);
  body.scrollTop = 0;
  refreshPanel();
}

let thumbTimer = 0;
function refreshPanel() {
  const sec = body.querySelector(`.sec[data-sec="${tab}"]`), nat = nation();
  for (const b of sec.querySelectorAll('button[data-k]')) {
    const k = b.dataset.k, v = b.dataset.v, src = NATION_KEYS.has(k) ? nat : cur[PARTS[k]?.unit || 'trooper'];
    b.classList.toggle('on', k === 'p' || k === 's' ? src[k] === v : src[k] === Number(v) && !(k === 'weapon' && fullState('trooper').award));
  }
  const effAward = fullState('trooper').award;
  for (const b of sec.querySelectorAll('button[data-award]')) {
    const w = Number(b.dataset.award), un = unlocked(w);
    b.classList.toggle('locked', !un); b.classList.toggle('on', !!effAward && cur.trooper.weapon === w);
  }
  const dbg = sec.querySelector('#debugAward'); if (dbg) dbg.classList.toggle('on', db.debugAward);
  const sp = sec.querySelector('#statPrev');
  if (sp) {
    const st = unitStats('trooper', fullState('trooper')), bar = (ico, val, max, txt, cls) => h('div', { className: 'sp ' + cls }, [h('span', { textContent: ico }), h('i', {}, [h('u', { style: `width:${Math.max(4, Math.min(100, (val / max) * 100)).toFixed(0)}%` })]), h('b', { textContent: txt })]);
    sp.replaceChildren(bar('❤️', st.hp, 180, String(st.hp), 'hp'), bar('🏃', st.speed, 7, st.speed.toFixed(1), 'spd'));
  }
  for (const b of sec.querySelectorAll('button[data-toggle]')) b.classList.toggle('on', !!cur.tank[b.dataset.toggle]);
  for (const l of sec.querySelectorAll('label[data-custom]')) {
    const k = l.dataset.custom, pal = k === 'p' ? T.PRIMARY : T.SECONDARY, custom = !pal.includes(nat[k]);
    l.classList.toggle('on', custom); l.style.background = custom ? nat[k] : '';
    const inp = l.querySelector('input'); if (document.activeElement !== inp) inp.value = nat[k];
  }
  for (const c of sec.querySelectorAll('canvas[data-sym],canvas[data-sc]')) {
    const s2 = { ...nat }; if (c.dataset.sym) s2.sym = +c.dataset.sym; if (c.dataset.sc) s2.sc = +c.dataset.sc;
    drawFlag(c, s2);
  }
  if (tab === 'nation') { const pn = $('#playerName'); if (document.activeElement !== pn) pn.value = db.player.name; renderNations(); }
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    thumbQueue = [];
    for (const b of sec.querySelectorAll('button[data-frame]')) {
      const unit = b.dataset.unit, aw = b.dataset.award != null;
      const patch = aw ? { weapon: Number(b.dataset.award), award: 1 } : b.dataset.k ? { [b.dataset.k]: Number(b.dataset.v) } : { [b.dataset.toggle]: 1 };
      if (b.dataset.k === 'weapon') patch.award = 0;
      const s2 = fullState(unit, { ...cur[unit], ...patch }); if (aw) s2.award = 1; // locked ⭐ tiles still preview the award model
      const c = b.querySelector('canvas'), key = b.dataset.frame + '|' + stateKey(unit, s2);
      if (c.dataset.key === key) continue;
      c.dataset.key = key; thumbQueue.push({ canvas: c, unit, state: s2, frame: b.dataset.frame });
    }
  }, 60);
  if (tab === 'looks') { renderLooks(); refreshCode(); }
}
function refreshCode() { const ci = $('#codeIn'); if (ci && document.activeElement !== ci) ci.value = currentCode(); }

// ---------- nations ----------
let nEdit = null, nDel = null;
function renderNations() {
  const box = $('#nations'); box.replaceChildren();
  for (const n of db.nations) {
    const row = h('div', { className: 'look' + (n.id === db.active ? ' on' : ''), 'data-nid': n.id });
    const flag = h('canvas', { width: 96, height: 96, className: 'flag' }); drawFlag(flag, n);
    const cnt = db.looks.filter((l) => l.nationId === n.id).length;
    if (nEdit === n.id) {
      const inp = h('input', { type: 'text', value: n.name, maxLength: 24, 'aria-label': 'Nation name', className: 'rn' });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') nationAct('renok', n.id); if (e.key === 'Escape') nationAct('cancel', n.id); });
      row.append(flag, inp, h('button', { type: 'button', className: 'ib', 'data-nact': 'renok', title: 'Save name', textContent: '✔️' }), h('button', { type: 'button', className: 'ib', 'data-nact': 'cancel', title: 'Cancel', textContent: '✖️' }));
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    } else if (nDel === n.id) {
      row.append(flag, h('span', { className: 'q', textContent: `🗑️ ?${cnt ? ' +' + cnt + '💾' : ''}` }), h('button', { type: 'button', className: 'ib btn bad', 'data-nact': 'delok', title: 'Delete nation and its looks', textContent: '✔️' }), h('button', { type: 'button', className: 'ib', 'data-nact': 'cancel', title: 'Keep', textContent: '✖️' }));
    } else {
      row.append(...[h('button', { type: 'button', className: 'ld', 'data-nact': 'activate', title: 'Use ' + n.playerName + ' · ' + n.name }, [flag, h('span', { className: 'nm' }, [n.name, h('small', { className: 'pl', textContent: '👤 ' + n.playerName + ' · 🪖' + n.roster.filter((r) => !r.blank).length })]), cnt ? h('small', { className: 'cnt', textContent: '💾' + cnt }) : null]),
        h('button', { type: 'button', className: 'ib', 'data-nact': 'rename', title: 'Rename nation', textContent: '✏️' }),
        db.nations.length > 1 ? h('button', { type: 'button', className: 'ib', 'data-nact': 'del', title: 'Delete nation', textContent: '🗑️' }) : null].filter(Boolean));
    }
    box.append(row);
  }
  $('#addNation').disabled = db.nations.length >= MAX_NATIONS;
}
function createNation(name, colors) {
  if (db.nations.length >= MAX_NATIONS) { toast('🏳️ ' + MAX_NATIONS + ' max', true); return null; }
  if (!colors) { // fresh random colors + symbol, distinct from the active nation
    const cur = nation(); let p, s;
    do { p = pick(T.PRIMARY); } while (p === cur.p);
    do { s = pick(T.SECONDARY); } while (s === p);
    colors = { p, s, suit: (Math.random() * 5) | 0, sym: (Math.random() * 12) | 0, sc: 0, vis: (Math.random() * 6) | 0, glow: 1 };
  }
  const names = new Set(db.nations.map((x) => x.playerName)); let k = db.nations.length + 1; while (names.has('Player ' + k)) k++;
  const n = newNation(clean(name) || 'Nation ' + (db.nations.length + 1), colors, null, 'Player ' + k);
  db.nations.push(n); db.active = n.id; nEdit = nDel = null;
  applyState(); toast('👤 ' + n.playerName + ' · 🏳️ ' + n.name); return n.id;
}
function nationAct(act, id, arg) {
  const n = db.nations.find((x) => x.id === id); if (!n) return false;
  if (act === 'activate') { db.active = id; nEdit = nDel = null; sheet = null; applyState(); toast('👤 ' + n.playerName + ' · 🏳️ ' + n.name); return true; }
  if (act === 'rename') { nEdit = id; nDel = null; }
  else if (act === 'renok') { const v = clean(arg ?? $(`[data-nid="${id}"] input.rn`)?.value); if (v) n.name = v; nEdit = null; saveDB(); refreshCode(); }
  else if (act === 'del') { if (db.nations.length < 2) return false; nDel = id; nEdit = null; }
  else if (act === 'delok') {
    if (db.nations.length < 2) return false;
    db.nations = db.nations.filter((x) => x.id !== id); db.looks = db.looks.filter((l) => l.nationId !== id);
    if (db.active === id) db.active = db.nations[0].id;
    nDel = null; applyState(); toast('🗑️ ' + n.name); return true;
  }
  else if (act === 'cancel') { nEdit = nDel = null; }
  if (tab === 'nation') renderNations();
  return true;
}
body.addEventListener('click', (e) => {
  const b = e.target.closest('[data-nact]'); if (b) { const row = b.closest('[data-nid]'); if (row) nationAct(b.dataset.nact, row.dataset.nid); return; }
  if (e.target.closest('#addNation')) createNation();
});

// ---------- saved looks (grouped by nation, thumbnails in nation colors) ----------
let editId = null, delId = null;
const lookState = (l) => { const def = UNITS[l.unit], u = T.undigits(l.u, def.fields, def.defaults); return fullState(l.unit, u, nation(l.nationId)); };
function ensureThumb(l) {
  const st = lookState(l), tk = stateKey(l.unit, st);
  if (l.tk !== tk || !l.thumb) { l.thumb = thumbDataURL(l.unit, st); l.tk = tk; saveDB(); }
  return l.thumb;
}
function renderLooks() {
  const box = $('#looks'), curU = T.digits(cur[db.unit], UNITS[db.unit].fields);
  box.replaceChildren();
  if (!db.looks.length) { box.append(h('div', { className: 'empty', textContent: '💾 → 🏷️ 📋' })); return; }
  const order = [nation(), ...db.nations.filter((n) => n.id !== db.active)];
  for (const n of order) {
    const mine = db.looks.filter((l) => l.nationId === n.id); if (!mine.length) continue;
    const flag = h('canvas', { width: 64, height: 64, className: 'flag sm' }); drawFlag(flag, n);
    box.append(h('div', { className: 'grp' + (n.id === db.active ? ' on' : ''), 'data-gid': n.id }, [flag, h('b', { textContent: n.name }), h('small', { textContent: '💾' + mine.length })]));
    for (const l of mine) {
      const active = l.nationId === db.active && l.unit === db.unit && l.u === curU;
      const row = h('div', { className: 'look' + (active ? ' on' : ''), 'data-id': l.id, 'data-unit': l.unit });
      const img = h('img', { src: ensureThumb(l), alt: '' });
      const lc = unitCost(l.unit, lookState(l));
      const badge = h('span', { className: 'ub', textContent: l.unit === 'tank' ? '🚜' : '🪖' });
      if (editId === l.id) {
        const inp = h('input', { type: 'text', value: l.name, maxLength: 24, 'aria-label': 'New name', className: 'rn' });
        row.append(img, inp, h('button', { type: 'button', className: 'ib', 'data-act': 'renok', title: 'Save name', textContent: '✔️' }), h('button', { type: 'button', className: 'ib', 'data-act': 'cancel', title: 'Cancel', textContent: '✖️' }));
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookAct('renok', l.id); if (e.key === 'Escape') lookAct('cancel', l.id); });
        setTimeout(() => { inp.focus(); inp.select(); }, 0);
      } else if (delId === l.id) {
        row.append(img, h('span', { className: 'q', textContent: '🗑️ ?' }), h('button', { type: 'button', className: 'ib btn bad', 'data-act': 'delok', title: 'Delete', textContent: '✔️' }), h('button', { type: 'button', className: 'ib', 'data-act': 'cancel', title: 'Keep', textContent: '✖️' }));
      } else {
        row.append(h('button', { type: 'button', className: 'ld', 'data-act': 'load', title: 'Load ' + l.name }, [h('span', { className: 'tw' }, [img, badge]), h('span', { className: 'nm' }, [l.name, h('small', { className: 'lc' }, ['💰' + fmt(lc.cost), h('i', { textContent: '⚡' + lc.power })])])]),
          h('button', { type: 'button', className: 'ib', 'data-act': 'demo', title: '🎬 Demo', 'aria-label': 'Demo', textContent: '🎬' }),
          h('button', { type: 'button', className: 'ib', 'data-act': 'copy', title: 'Copy share code', textContent: '🔗' }),
          h('button', { type: 'button', className: 'ib', 'data-act': 'update', title: 'Overwrite with current look', textContent: '🔁' }),
          h('button', { type: 'button', className: 'ib', 'data-act': 'rename', title: 'Rename', textContent: '✏️' }),
          h('button', { type: 'button', className: 'ib', 'data-act': 'del', title: 'Delete', textContent: '🗑️' }));
      }
      box.append(row);
    }
  }
}
function saveLook(name) {
  if (db.looks.length >= MAX_LOOKS) { toast('📦 ' + MAX_LOOKS + ' max', true); return null; }
  const unit = db.unit, n = nation();
  name = clean(name) || (unit === 'tank' ? 'Tank ' : n.roster[db.slot].name + ' ') + (db.looks.filter((l) => l.unit === unit && l.nationId === n.id).length + 1);
  const l = { id: newId(), nationId: n.id, unit, name, u: T.digits(cur[unit], UNITS[unit].fields), thumb: '', tk: '' };
  ensureThumb(l);
  db.looks.unshift(l);
  dirty = true;
  if (!flushDB()) { db.looks.shift(); toast('⚠️ storage full', true); return null; }
  toast('💾 ' + name); return l.id;
}
function lookCode(l) {
  const def = UNITS[l.unit], u = T.undigits(l.u, def.fields, def.defaults), n = nation(l.nationId);
  return T.encodeTC3({ player: db.player.name, nationName: n.name, nation: n, trooper: l.unit === 'trooper' ? u : cur.trooper, tank: l.unit === 'tank' ? u : cur.tank, unit: l.unit }, TANK_FIELDS);
}
function lookAct(act, id, arg) {
  const l = db.looks.find((x) => x.id === id); if (!l) return false;
  if (act === 'load') {
    const def = UNITS[l.unit], u = T.undigits(l.u, def.fields, def.defaults);
    db.active = l.nationId; const wasBlank = l.unit === 'trooper' && nation().roster[db.slot].blank; cur[l.unit] = u;
    if (wasBlank) nation().roster[db.slot].name = clean(l.name, NAME_MAX) || nation().roster[db.slot].name;
    switchUnit(l.unit, false); applyState(); toast('✅ ' + l.name); return true;
  }
  if (act === 'demo') { flushDB(); location.href = 'demo.html?unit=' + encodeURIComponent(l.id); return true; }
  if (act === 'copy') copyText(lookCode(l));
  else if (act === 'update') { l.u = T.digits(cur[l.unit], UNITS[l.unit].fields); ensureThumb(l); saveDB(); toast('🔁 ' + l.name); }
  else if (act === 'rename') { editId = id; delId = null; }
  else if (act === 'renok') { const n = clean(arg ?? $(`.look[data-id="${id}"] input.rn`)?.value); if (n) { l.name = n; saveDB(); } editId = null; }
  else if (act === 'del') { delId = id; editId = null; }
  else if (act === 'delok') { db.looks = db.looks.filter((x) => x.id !== id); delId = null; saveDB(); toast('🗑️'); }
  else if (act === 'cancel') { editId = null; delId = null; }
  if (tab === 'looks') renderLooks();
  return true;
}
body.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (b) { const row = b.closest('.look'); if (row) lookAct(b.dataset.act, row.dataset.id); return; }
  if (e.target.closest('#saveLook')) { const inp = $('#lookName'); if (saveLook(inp.value)) { inp.value = ''; renderLooks(); } }
  else if (e.target.closest('#copyCode')) copyText(currentCode());
  else if (e.target.closest('#loadCode')) loadCodeFromField();
});
body.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'lookName') $('#saveLook').click();
  if (e.target.id === 'codeIn') loadCodeFromField();
  if (e.target.id === 'playerName') e.target.blur();
});

// ---------- share codes ----------
// TC3 = player + nation + full 6-slot roster + tank. Older TC2/TC1 codes still load (into the active roster slot).
// v4.2 TC3 = the v4 TC3 JSON (r: [name, icon, digits] per slot) + rb (blank flags), rt (template ids), ri (auto-icon flags).
// v4 TC3 codes (no rb/rt/ri) still load: all slots filled, templates = the 6 starters.
const b64e = (str) => { let s = ''; for (const x of new TextEncoder().encode(str)) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64d = (str) => new TextDecoder().decode(Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
function encodeRosterTC3() {
  const n = nation(), R = n.roster;
  return 'TC3:' + b64e(JSON.stringify({
    pl: String(db.player.name || '').slice(0, 24), nn: String(n.name || '').slice(0, 24), n: T.nationCode(n), k: T.digits(cur.tank, TANK_FIELDS), u: db.unit === 'tank' ? 'k' : 't',
    r: R.map((s) => [s.blank ? '' : s.name, s.blank ? '' : s.icon, T.digits(s.t, T.TROOPER_FIELDS)]), sl: db.slot,
    rb: R.map((s) => (s.blank ? 1 : 0)), rt: R.map((s) => s.tpl || ''), ri: R.map((s) => (s.ia ? 1 : 0)),
  }));
}
const currentCode = () => encodeRosterTC3();
function parseCode(c) {
  const s = String(c || '').replace(/\s+/g, '');
  if (/^TC3:/i.test(s)) {
    const d = T.decodeTC3('TC3:' + s.slice(4), TANK_FIELDS, TANK_DEFAULT); if (!d) return null;
    if (d.roster) { // overlay the v4.2 blank / template / auto-icon info
      let o = {}; try { o = JSON.parse(b64d(s.slice(4))) || {}; } catch (e) { o = {}; }
      const arr = (a) => (Array.isArray(a) && a.length === T.ROSTER_SIZE ? a : null), rb = arr(o.rb), rt = arr(o.rt), ri = arr(o.ri);
      d.roster = d.roster.map((r, i) => {
        if (rb && rb[i] === 1) return blankSlot();
        const x = { name: clean(o.r[i][0], NAME_MAX) || r.name, icon: r.icon, t: r.t, ia: !!(ri && ri[i] === 1) };
        if (rt) x.tpl = rt[i] || null;
        return cleanSlot(x, i);
      });
    }
    return { kind: 'TC3', ...d };
  }
  if (/^TC2:/i.test(s)) { const d = T.decodeTC2('TC2:' + s.slice(4), TANK_FIELDS, TANK_DEFAULT); return d && { kind: 'TC2', ...d }; }
  const d1 = T.decodeTC1(s); return d1 && { kind: 'TC1', nation: d1.nation, trooper: d1.trooper, unit: 'trooper', nationName: '', player: '' };
}
// import: reuse a nation with the same colors/flag (prefer same name), else create one
function importNation(nat, name) {
  const code = T.nationCode(nat);
  const same = db.nations.filter((n) => T.nationCode(n) === code);
  let n = same.find((x) => name && x.name === name) || same[0];
  if (!n) {
    if (db.nations.length >= MAX_NATIONS) { n = nation(); Object.assign(n, T.sanitizeNation(nat)); }
    else { n = newNation(clean(name) || 'Nation ' + (db.nations.length + 1), nat); db.nations.push(n); }
  }
  db.active = n.id; return n;
}
function loadCode(c) {
  const d = parseCode(c); if (!d) return false;
  const n = importNation(d.nation, d.nationName);
  if (d.player) n.playerName = clean(d.player) || n.playerName; // shared code carries the player of that nation
  if (!n.playerName) n.playerName = 'Player ' + (db.nations.indexOf(n) + 1);
  if (d.roster) { nation().roster = d.roster.map((r) => ({ ...r, t: { ...r.t } })); db.slot = d.slot; sheet = null; }
  else cur.trooper = d.trooper;
  if (d.tank) cur.tank = d.tank;
  switchUnit(d.unit, false); applyState();
  return d;
}
function loadCodeFromField() {
  const ci = $('#codeIn'), d = loadCode(ci.value);
  if (!d) { toast('❌ code', true); ci.classList.remove('shake'); void ci.offsetWidth; ci.classList.add('shake'); return false; }
  ci.blur(); refreshCode(); toast('✅ ' + (d.player ? '👤 ' + d.player + ' · ' : '') + '🏳️ ' + nation().name); return true;
}
async function copyText(t) {
  let ok = false;
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); ok = true; } } catch (e) { ok = false; }
  if (!ok) { try { const ta = h('textarea', { value: t, style: 'position:fixed;left:-999px;top:0;opacity:0' }); document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (e) { ok = false; } }
  toast(ok ? '📋 ' + t.slice(0, 22) + '…' : '📋 ✖', !ok);
  return ok;
}

// ---------- state ----------
function setValues(patch) {
  const nat = nation(), np = {}, up = {};
  for (const [k, v] of Object.entries(patch)) {
    if (NATION_KEYS.has(k)) np[k] = v;
    else if (UNITS[db.unit].fields.some(([f]) => f === k)) up[k] = v;
    else if (k === 'skin') cur.trooper = T.sanitizeFields({ ...cur.trooper, skin: v }, T.TROOPER_FIELDS, T.TROOPER_DEFAULT);
    else { const owner = Object.values(UNITS).find((d) => d.fields.some(([f]) => f === k)); if (owner) cur[owner.id] = T.sanitizeFields({ ...cur[owner.id], [k]: v }, owner.fields, owner.defaults); }
  }
  if (Object.keys(np).length) Object.assign(nat, T.sanitizeNation({ ...nat, ...np }));
  if (Object.keys(up).length) { const d = UNITS[db.unit]; cur[db.unit] = T.sanitizeFields({ ...cur[db.unit], ...up }, d.fields, d.defaults); }
  applyState();
}
function applyState(save = true) {
  look.paint(fullState('trooper'));
  renderRoster();
  for (const [id, u] of Object.entries(units)) { u.build(fullState(id)); u.root.visible = id === db.unit; }
  const tank = db.unit === 'tank';
  padGroup.scale.setScalar(tank ? 2.6 : 1); blob.scale.set(tank ? 2.4 : 1, tank ? 4.0 : 1, 1);
  if (squadOn) buildSquad();
  if (save) saveDB();
  refreshPanel(); updateStatsText();
}
function switchUnit(u, apply = true) {
  if (!UNITS[u]) return;
  const changed = u !== db.unit; db.unit = u; if (changed) sheet = null; buildTabs(); setTab(tab);
  if (apply) applyState();
  if (changed) { if (squadOn) setSquad(true); else camHome(); }
}
function randomize() {
  if (tab === 'nation') { // nation colors + flag
    let p = Math.random() < 0.85 ? pick(T.PRIMARY) : '#' + ((Math.random() * 0xffffff) | 0).toString(16).padStart(6, '0'), s;
    do { s = pick(T.SECONDARY); } while (s === p);
    const o = { p, s }; for (const [k, n] of T.NATION_FIELDS) o[k] = (Math.random() * n) | 0;
    o.sc = Math.random() < 0.7 ? 0 : o.sc; o.glow = Math.max(1, o.glow);
    setValues(o); return;
  }
  const d = UNITS[db.unit], o = {};
  for (const [k, n] of d.fields) o[k] = (Math.random() * n) | 0;
  if (db.unit === 'trooper') { o.extra = Math.random() < 0.65 ? 0 : 1 + ((Math.random() * 2) | 0); o.banner = Math.random() < 0.7 ? 1 : 0; o.award = unlocked(o.weapon) && Math.random() < 0.5 ? 1 : 0; }
  setValues(o);
}
// ---------- roster (6 trooper slots per nation) ----------
// slot shape (db v3, v4.2): { blank, name, icon, ia, tpl, t }
//   blank: true = empty slot (name '' icon '' , t = base kit, not a unit) · ia: auto icon from the main weapon
//   tpl: template id the slot came from (↺ resets to it) or null (blank trooper: ↺ resets to the base kit)
const rosterEl = $('#roster'), sheetEl = $('#sheet'), panelEl = $('#panel');
let sheet = null; // { mode: 'blank' | 'edit', tpl: bool, clear: bool, focus: bool }
// section header: '🔫 Weapons · main weapon, ⭐ award' + the roster slot being edited (tap to rename / edit)
function renderSecHead() {
  const d = TAB_DEF[tab], r = db.unit === 'trooper' ? nation().roster[db.slot] : null;
  const chip = r ? h('button', { type: 'button', className: 'slotchip', id: 'slotChip', title: r.blank ? 'Fill this slot' : 'Rename / edit this slot' }, [h('em', { textContent: slotLabel(db.slot) }), h('i', { textContent: r.blank ? '' : '✏️' })]) : h('em', { textContent: UNIT_LABEL.tank });
  $('#sechead').replaceChildren(h('b', { textContent: tabLabel(tab) }), h('span', { textContent: '· ' + d.sub }), chip);
}
$('#sechead').addEventListener('click', (e) => { if (e.target.closest('#slotChip')) openSheet(db.slot, true); });
function renderRoster() { renderWho(); renderSecHead(); renderSheet(); renderStrip(); }
// ---------- header: who is being edited, for which player + nation; switching; links to the other games ----------
const unitName = () => { if (db.unit === 'tank') return '🚜 ' + (nation().tankName || 'Tank 1'); const r = nation().roster[db.slot]; return r.blank ? `➕ Slot ${db.slot + 1} (empty)` : r.icon + ' ' + r.name; };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function renderWho() {
  const n = nation(), who = $('#who');
  $('#whoUnit').textContent = '✏️ ' + unitName();
  $('#whoFor').textContent = `for 👤 ${n.playerName} · 🏳️ ${n.name}`;
  who.title = `Editing ${unitName()} for ${n.playerName}, ${n.name} · tap to switch`;
  who.style.borderColor = n.p; who.style.background = `linear-gradient(90deg, ${rgba(n.p, 0.5)}, ${rgba(n.s, 0.12)})`;
  drawFlag($('#whoFlag'), n);
  const sel = $('#whoSel');
  sel.replaceChildren(...db.nations.map((x) => h('option', { value: x.id, textContent: `👤 ${x.playerName} · 🏳️ ${x.name}`, selected: x.id === db.active })),
    h('option', { value: '+', textContent: '➕ New player + nation' }));
  sel.value = n.id;
}
$('#whoSel').addEventListener('change', (e) => {
  const v = e.target.value;
  if (v === '+') createNation(); else nationAct('activate', v);
  renderWho();
});
// ?from=<game> → back button to that game. Our own links pass ?from=custom.
const FROM = new URLSearchParams(location.search).get('from');
const FROM_PATH = { conquest: '../conquest-commander/', 'conquest-commander': '../conquest-commander/', ships: '../ship-sandbox/', 'ship-sandbox': '../ship-sandbox/', hub: '../', campus: '../../' };
if (FROM) {
  const b = $('#backBtn'); b.classList.remove('hidden');
  b.href = FROM_PATH[FROM] || (/^[a-z0-9-]{1,40}$/.test(FROM) && FROM !== 'custom' ? '../' + FROM + '/' : 'javascript:history.back()');
  b.title = '⬅️ Back' + (FROM_PATH[FROM] ? ' to ' + FROM : ''); b.addEventListener('click', () => flushDB());
}
const goGame = (url) => { flushDB(); location.href = url; };
$('#ccBtn').addEventListener('click', () => goGame('../conquest-commander/?from=custom'));
$('#shipBtn').addEventListener('click', () => goGame('../ship-sandbox/?from=custom'));
$('#demoBtn').addEventListener('click', (e) => { const m = $('#demomenu'), open = m.classList.toggle('hidden') === false; e.currentTarget.classList.toggle('on', open); e.currentTarget.setAttribute('aria-expanded', String(open)); });
// demos take the unit being edited (army unit id); a blank slot falls back to the first filled one
function demoUrl(kind) {
  const n = nation(); let id = db.unit === 'tank' ? n.tankId : (n.roster[db.slot].blank ? (n.roster.find((r) => !r.blank) || {}).id : n.roster[db.slot].id);
  const q = id ? '?unit=' + encodeURIComponent(id) : '?player=' + encodeURIComponent(n.pid);
  return { moves: 'demo.html', combat: 'combat.html', team: 'team.html' }[kind] + (kind === 'team' ? '?player=' + encodeURIComponent(n.pid) : q);
}
for (const b of document.querySelectorAll('#demomenu [data-demo]')) b.addEventListener('click', () => goGame(demoUrl(b.dataset.demo)));
function renderStrip() {
  const show = db.unit === 'trooper'; rosterEl.classList.toggle('hidden', !show); if (!show) return;
  rosterEl.replaceChildren(...nation().roster.map((r, i) => {
    const on = i === db.slot ? 'on' : '';
    if (r.blank) return h('button', { type: 'button', role: 'tab', 'data-slot': String(i), className: 'blank ' + on, title: `➕ Slot ${i + 1} · empty: tap to fill`, 'aria-label': `Roster slot ${i + 1}: empty` }, [h('span', { className: 'ri', textContent: '+' }), h('small', { textContent: 'Slot ' + (i + 1) })]);
    const c = fmt(unitCost('trooper', fullState('trooper', r.t)).cost);
    return h('button', { type: 'button', role: 'tab', 'data-slot': String(i), className: on, title: r.icon + ' ' + r.name + ' · 💰' + c, 'aria-label': 'Roster: ' + r.name }, [h('span', { className: 'ri', textContent: r.icon }), h('small', { textContent: '💰' + c })]);
  }));
}
function setSlot(i) {
  if (!(i >= 0 && i < T.ROSTER_SIZE)) return false;
  db.slot = i; if (db.unit !== 'trooper') switchUnit('trooper', false);
  applyState(); return true;
}
const slotLabel = (i) => { const r = nation().roster[i]; return r.blank ? `➕ Slot ${i + 1}` : r.icon + ' ' + r.name; };
rosterEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-slot]'); if (!b) return;
  const i = Number(b.dataset.slot), s = nation().roster[i], again = i === db.slot && db.unit === 'trooper';
  if (s.blank || again) openSheet(i, again && !s.blank); else { sheet = null; setSlot(i); }
  tapLabel(rosterEl.querySelector(`[data-slot="${i}"]`), slotLabel(i));
});
function openSheet(i = db.slot, focus = false) {
  if (db.slot !== i || db.unit !== 'trooper') { db.slot = i; if (db.unit !== 'trooper') switchUnit('trooper', false); }
  const s = nation().roster[i];
  sheet = { mode: s.blank ? 'blank' : 'edit', tpl: s.blank, clear: false, focus };
  applyState(); return sheet.mode;
}
function closeSheet() { sheet = null; renderSheet(); }
// slot edits
const slotAt = (i = db.slot) => nation().roster[i];
// v5: every new unit is the same cheap basic trooper, auto-named 'Trooper N' (name editable)
function makeBlankTrooper(name, i = db.slot) {
  const t = { ...BASIC_T };
  nation().roster[i] = { blank: false, id: Army.newId('u'), name: clean(name, NAME_MAX) || nextTrooperName(), icon: weaponIcon(t), ia: true, tpl: null, t, traits: [], brain: null };
  db.slot = i; sheet = null; applyState(); toast('➕ ' + slotLabel(i)); return true;
}
function renameSlot(name, i = db.slot) {
  const s = slotAt(i), v = clean(name, NAME_MAX); if (s.blank || !v) return false;
  s.name = v; saveDB(); renderWho(); renderSecHead(); renderStrip(); return true; // keeps the sheet (and its input focus) as is
}
function setSlotIcon(icon, i = db.slot) {
  const s = slotAt(i); if (s.blank) return false;
  if (icon) { s.icon = clean(icon, 4); s.ia = false; } else { s.ia = true; s.icon = weaponIcon(s.t); }
  applyState(); return true;
}
function clearSlot(i = db.slot) { nation().roster[i] = blankSlot(); if (sheet) sheet = { mode: 'blank', tpl: true, clear: false }; applyState(); toast('🗑️ Slot ' + (i + 1)); return true; }
// fill every empty slot with a basic trooper (test hook; no presets)
function fillStarter() { const n = nation(); n.roster.forEach((r, i) => { if (r.blank) { const t = { ...BASIC_T }; n.roster[i] = { blank: false, id: Army.newId('u'), name: nextTrooperName(n), icon: weaponIcon(t), ia: true, tpl: null, t, traits: [], brain: null }; } }); applyState(); toast('➕ ' + n.roster.length + ' 🪖'); return true; }
function setTraits(list, i = db.slot) { const s = slotAt(i); if (s.blank) return false; s.traits = (list || []).filter((k) => S.TRAIT_IDS.includes(k)).slice(0, 3); applyState(); return true; }
// ↺ back to the basic kit (v5: no templates)
function resetUnit() {
  if (db.unit === 'tank') cur.tank = { ...BASIC_TANK };
  else { const s = slotAt(); if (!s.blank) { s.t = { ...BASIC_T }; s.tpl = null; if (s.ia) s.icon = weaponIcon(s.t); } }
  applyState();
}
let sheetThumbs = [];
// trait picker: auto (= class default) + the 7 Conquest traits
function traitTiles(s) {
  const def = S.CLASS_TRAIT[S.classOf('trooper', s.t)] || 'rusher', cur0 = (s.traits || [])[0] || '';
  const ti = (id) => S.TRAITS.find((x) => x.id === id);
  return h('div', { className: 'tiles small traits', 'data-key': 'trait' }, [
    h('button', { type: 'button', 'data-trait': '', className: cur0 ? '' : 'on', title: 'Auto: class default · ' + ti(def).long, 'aria-label': 'Auto trait' }, [h('span', { className: 'ico', textContent: ti(def).icon }), h('i', { textContent: 'auto' })]),
    ...S.TRAITS.map((x) => h('button', { type: 'button', 'data-trait': x.id, className: cur0 === x.id ? 'on' : '', title: x.long, 'aria-label': 'Trait ' + x.long }, [h('span', { className: 'ico', textContent: x.icon }), h('i', { textContent: x.name })]))]);
}
function renderSheet() {
  const open = !!sheet && db.unit === 'trooper';
  panelEl.classList.toggle('sheet', open); sheetEl.classList.toggle('hidden', !open);
  sheetThumbs = [];
  if (!open) { sheetEl.replaceChildren(); return; }
  const i = db.slot, s = slotAt(i);
  if (s.blank && sheet.mode !== 'blank') sheet = { mode: 'blank', tpl: true, clear: false };
  const cls = s.blank ? null : S.classOf('trooper', s.t), ci = cls && S.CLASS_INFO[cls];
  const head = h('div', { className: 'shhead' }, [h('b', { textContent: s.blank ? `➕ Slot ${i + 1}` : `${s.icon} ${s.name}` }),
    h('small', { textContent: s.blank ? 'empty' : (ci ? ci.i + ' ' + ci.n : '') + ' · 💰' + fmt(unitCost('trooper', fullState('trooper', s.t)).cost) }), h('button', { type: 'button', id: 'shClose', className: 'ib', title: 'Close', 'aria-label': 'Close', textContent: '✖️' })]);
  const kids = [head];
  if (sheet.mode === 'blank') {
    kids.push(lab('➕', 'new trooper · basic kit 💰' + S.unitCost({ kind: 'trooper', gear: S.BASIC_GEAR.trooper }).cost),
      h('div', { className: 'saverow' }, [h('input', { id: 'newSlotName', type: 'text', maxLength: NAME_MAX, placeholder: '🏷️ ' + nextTrooperName(), 'aria-label': 'New trooper name', autocomplete: 'off', enterKeyHint: 'done' }),
        h('button', { id: 'mkBlank', type: 'button', className: 'btn go', title: 'Add a basic trooper', textContent: '➕' })]));
  } else {
    const icons = h('div', { className: 'tiles small icons', 'data-key': 'icon' }, [h('button', { type: 'button', 'data-icon': '', className: s.ia ? 'on' : '', title: 'Auto: main weapon icon', 'aria-label': 'Auto icon' }, [h('span', { className: 'ico', textContent: weaponIcon(s.t) }), h('i', { textContent: 'auto' })]),
      ...SLOT_ICONS.map((ic) => h('button', { type: 'button', 'data-icon': ic, className: !s.ia && s.icon === ic ? 'on' : '', title: ic, 'aria-label': 'Icon ' + ic }, [h('span', { className: 'ico', textContent: ic })]))]);
    const acts = sheet.clear
      ? h('div', { className: 'acts' }, [h('span', { className: 'q', textContent: '🗑️ Clear slot?' }), h('button', { type: 'button', id: 'clearOk', className: 'btn bad', title: 'Clear to blank', textContent: '✔️' }), h('button', { type: 'button', id: 'clearNo', className: 'btn', title: 'Keep', textContent: '✖️' })])
      : h('div', { className: 'acts' }, [
        h('button', { type: 'button', id: 'shReset', className: 'btn', title: 'Reset to the basic kit', textContent: '↺ Reset' }),
        h('button', { type: 'button', id: 'shClear', className: 'btn', title: 'Clear back to blank', textContent: '🗑️ Clear' })]);
    kids.push(lab('🏷️', 'name'),
      h('div', { className: 'saverow' }, [h('input', { id: 'slotName', type: 'text', value: s.name, maxLength: NAME_MAX, 'aria-label': 'Slot name', autocomplete: 'off', enterKeyHint: 'done' }),
        h('button', { id: 'nameOk', type: 'button', className: 'btn go', title: 'Done', textContent: '✔️' })]),
      lab('🙂', 'icon'), icons, lab('🧠', 'trait in battle (Conquest + 👥 team demo)'), traitTiles(s), acts);
  }
  sheetEl.replaceChildren(...kids);
  if (sheet.focus) { sheet.focus = false; const inp = $('#slotName') || $('#newSlotName'); setTimeout(() => { inp.focus(); inp.select(); }, 0); }
}
sheetEl.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.trait != null) return setTraits(t.dataset.trait ? [t.dataset.trait] : []);
  if (t.dataset.icon != null) return setSlotIcon(t.dataset.icon);
  switch (t.id) {
    case 'shClose': case 'nameOk': { const v = $('#slotName'); if (v) renameSlot(v.value); closeSheet(); break; }
    case 'mkBlank': makeBlankTrooper($('#newSlotName').value); break;
    case 'shReset': resetUnit(); toast('↺ ' + slotLabel(db.slot)); break;
    case 'shClear': sheet.clear = true; renderSheet(); break;
    case 'clearOk': clearSlot(); break;
    case 'clearNo': sheet.clear = false; renderSheet(); break;
  }
});
sheetEl.addEventListener('input', (e) => { if (e.target.id === 'slotName') renameSlot(e.target.value); });
sheetEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  if (e.key !== 'Enter') return;
  if (e.target.id === 'slotName') { renameSlot(e.target.value); closeSheet(); }
  if (e.target.id === 'newSlotName') makeBlankTrooper(e.target.value);
});

// ---------- ⭐ award weapons ----------
function awardPick(w) {
  const it = ITEMS.weapon[w];
  const on = cur.trooper.weapon === w && fullState('trooper').award;
  setValues({ weapon: w, award: on ? 0 : 1 });
  toast(on ? `${it.i} ${it.n}` : ITEMS.award[w].tip, false, 2600); return true;
}
function debugUnlock(on) { db.debugAward = !!on; applyState(); toast(db.debugAward ? '🧪 ⭐🔓' : '🧪 ⭐🔒'); return db.debugAward; }

// ---------- HUD ----------
let fps = 0, frames = 0, fpsT = performance.now(), lastInfo = { calls: 0, triangles: 0 };
function modelStats() {
  if (squadOn && squad) {
    let tris = 0, calls = 0, count = 0, cost = 0, power = 0; const per = {}, types = [];
    for (const g of squad.groups) {
      const c = unitCost(g.unit, g.state); tris += g.perTris * g.count; calls += g.meshes.length; count += g.count; cost += c.cost * g.count; power += c.power * g.count;
      const p = per[g.unit] || (per[g.unit] = { count: 0, tris: 0, cost: 0 }); p.count += g.count; p.tris = Math.max(p.tris, g.perTris); p.cost += c.cost * g.count;
      types.push({ unit: g.unit, slot: g.slot, count: g.count, cost: c.cost, power: c.power, tris: g.perTris });
    }
    return { mode: 'squad', mix: squadMix, count, tris, calls, per, types, cost, power };
  }
  const u = units[db.unit], c = unitCost(db.unit, fullState());
  return { mode: 'single', unit: db.unit, count: 1, tris: u.tris, perTris: u.tris, calls: u.meshes.length, cost: c.cost, power: c.power, ...unitStats(db.unit, fullState()) };
}
function updateStatsText() {
  const m = modelStats();
  $('#sMode').textContent = m.mode === 'squad' ? '👥' + m.count : db.unit === 'tank' ? '🚜' : '🧍';
  $('#sTri').textContent = m.tris >= 10000 ? (m.tris / 1000).toFixed(1) + 'k' : String(m.tris);
  $('#sCalls').textContent = String(m.calls);
  const c = unitCost(db.unit, fullState()), cc = $('#cCost'), prev = cc.textContent;
  cc.textContent = fmt(c.cost); $('#cPow').textContent = String(c.power);
  const us = unitStats(db.unit, fullState()); $('#cHp').textContent = String(us.hp); $('#cSpd').textContent = us.speed.toFixed(1);
  if (prev !== cc.textContent && prev !== '0') { const chip = $('#costchip'); chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
  $('#squadCost').textContent = m.mode === 'squad' ? '💰' + fmt(m.cost) + ' ⚡' + fmt(m.power) : '';
}
let toastT = 0;
function toast(msg, bad = false, ms = 1400) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', bad); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
const VIEW_LABEL = { front: '📷 Front view', side: '📷 Side view', back: '📷 Back view' };
for (const b of document.querySelectorAll('#viewbar [data-view]')) b.addEventListener('click', () => { controls.autoRotate = false; $('#spinBtn').classList.remove('on'); viewTo(b.dataset.view); tapLabel(b, VIEW_LABEL[b.dataset.view]); });
for (const b of document.querySelectorAll('#unitbar [data-unit]')) b.addEventListener('click', () => { switchUnit(b.dataset.unit); tapLabel(b, UNIT_LABEL[b.dataset.unit]); });
$('#spinBtn').addEventListener('click', (e) => { controls.autoRotate = !controls.autoRotate; $('#spinBtn').classList.toggle('on', controls.autoRotate); tapLabel(e.currentTarget, controls.autoRotate ? '🔄 Auto spin on' : '🔄 Auto spin off'); });
$('#squadBtn').addEventListener('click', (e) => { setSquad(!squadOn); tapLabel(e.currentTarget, squadOn ? '👥 Squad preview' : (db.unit === 'tank' ? '🚜' : '🧍') + ' Single unit'); });
$('#squadN').addEventListener('click', (e) => { squadN = SQUAD_SIZES[(SQUAD_SIZES.indexOf(squadN) + 1) % SQUAD_SIZES.length]; setSquad(true); tapLabel(e.currentTarget, '👥 ' + squadN + ' units'); });
$('#squadMix').addEventListener('click', (e) => { squadMix = !squadMix; setSquad(true); tapLabel(e.currentTarget, squadMix ? '🔀 Mixed: 6 types + tanks' : '🔀 One type'); });
$('#randBtn').addEventListener('click', (e) => { randomize(); tapLabel(e.currentTarget, tab === 'nation' ? '🎲 Random nation' : '🎲 Randomize'); });
$('#resetBtn').addEventListener('click', (e) => { resetUnit(); tapLabel(e.currentTarget, db.unit === 'trooper' ? '↺ Reset to ' + slotLabel(db.slot) : '↺ Reset tank'); });

// ---------- loop ----------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const t = clock.getElapsedTime();
  if (tween) {
    const k = Math.min(1, (performance.now() - tween.t0) / tween.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    camera.position.setFromSpherical(new THREE.Spherical(tween.r, tween.phiFrom + (tween.phiTo - tween.phiFrom) * e, tween.from + tween.d * e)).add(controls.target);
    if (k >= 1) tween = null;
  }
  controls.update();
  if (squadOn) animateSquad(t); else units[db.unit].animate(t);
  pumpThumbs();
  renderer.render(scene, camera);
  lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  frames++;
  const now = performance.now();
  if (now - fpsT >= 500) {
    fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
    $('#sFps').textContent = fps.toFixed(0);
    $('#stats').classList.toggle('slow', fps < 30); $('#stats').classList.toggle('ok', fps >= 50);
  }
}

// ---------- boot ----------
resize();
buildTabs();
applyState(false); // boot render only: not a user edit
// another tab changed the army save: when clean, reload + re-render keeping this tab's selection; when dirty, mergeArmy() merges on write
addEventListener('storage', (e) => {
  if (e.key !== Army.ARMY_KEY || dirty || wiped || e.newValue == null) return;
  const keep = { active: db.active, slot: db.slot, unit: db.unit };
  const next = loadDB(); if (!next || !next.nations.length) return;
  db = next;
  if (db.nations.some((n) => n.id === keep.active)) { db.active = keep.active; db.slot = keep.slot; db.tank = nation().tank; }
  if (keep.unit !== db.unit) switchUnit(keep.unit, false);
  sheet = null; applyState(false); setTab(tab);
});
setTab(justMigrated && db.looks.length ? 'looks' : UNIT_TABS[db.unit][1]);
camHome();
loop();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- test / debug hooks ----------
const sigOf = (u) => ({ geo: units[u].sig, atlas: look.hash(), visor: look.visor.color.getHexString() + '/' + look.visor.emissiveIntensity });
window.__tc = {
  get state() { return fullState(); },
  get unit() { return db.unit; },
  get db() { return JSON.parse(JSON.stringify(db)); },
  setUnit: (u) => switchUnit(u),
  fields: (u = db.unit) => UNITS[u].fields.map(([k, n]) => ({ k, n })),
  nationFields: T.NATION_FIELDS.map(([k, n]) => ({ k, n })),
  palettes: { p: T.PRIMARY, s: T.SECONDARY },
  set: (k, v) => setValues({ [k]: v }),
  setState: (o) => setValues(o),
  code: currentCode, loadCode, parse: parseCode,
  legacy: { // build v1/v2-era codes for migration tests (v2 trooper fields: pack/rifle/3 armors)
    tc1: (t2 = {}, nat = nation()) => T.encodeTC1(nat, { ...T.TROOPER_DEFAULT_V2, ...t2 }),
    tc2: (t2 = {}, tank = cur.tank, unit = 'trooper') => T.encodeTC2({ player: db.player.name, nationName: nation().name, nation: nation(), trooper: { ...T.TROOPER_DEFAULT_V2, ...t2 }, tank, unit }, TANK_FIELDS),
    map: T.mapV2Trooper, fieldsV2: T.TROOPER_FIELDS_V2,
    tc3v4: () => T.encodeTC3({ player: db.player.name, nationName: nation().name, nation: nation(), roster: nation().roster.map((r, i) => ({ name: r.name || 'Old ' + (i + 1), icon: r.icon || '🪖', t: r.t })), slot: db.slot, tank: cur.tank, unit: db.unit }, TANK_FIELDS),
  },
  roster: () => nation().roster.map((r, i) => ({ ...r, t: { ...r.t }, slot: i, active: i === db.slot, ...unitCost('trooper', fullState('trooper', r.t)), ...unitStats('trooper', fullState('trooper', r.t)) })),
  fillStarter, setTraits, nextName: () => nextTrooperName(), army: () => dbToArmy(db), makeBlankTrooper, renameSlot, setSlotIcon, clearSlot, openSheet, closeSheet, get sheet() { return sheet && { ...sheet }; },
  defaultRoster: T.DEFAULT_ROSTER,
  get slot() { return db.slot; }, setSlot,
  items: ITEMS, statsTable: STATS, unitStats: (u = db.unit, o) => unitStats(u, o ? { ...fullState(u), ...o } : fullState(u)),
  medals: (w, n) => { if (w != null && n != null) { db.medals[w] = Math.max(0, n | 0); applyState(); } return db.medals.slice(); },
  unlocked, debugUnlock, awardPick, medalsNeeded: MEDALS_NEEDED,
  thumb: (frame, o = {}, unit = 'trooper') => { const st = { ...fullState(unit, { ...cur[unit], ...o }), ...o }, c = h('canvas', { width: TS, height: TS }); c.getContext('2d').putImageData(renderThumb(unit, st, frame), 0, 0); return c.toDataURL('image/png'); },
  randomize, reset: resetUnit,
  resetNation: () => { Object.assign(nation(), T.sanitizeNation(T.NATION_DEFAULT)); applyState(); },
  signature: (u = db.unit) => sigOf(u),
  cost: (u = db.unit, o) => unitCost(u, o ? { ...fullState(u), ...o } : fullState(u)),
  costTable: COST,
  atlasColor: (x = 72) => { const d = look.ctx.getImageData(x, 32, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); },
  trisFor: (u, o) => { const d = UNITS[u], g = T.buildMergedDef(d, { ...T.NATION_DEFAULT, skin: 1, ...T.sanitizeFields(o, d.fields, d.defaults) }); let n = 0; for (const x of Object.values(g)) { n += x.attributes.position.count / 3; x.dispose(); } return n; },
  stats: () => ({ ...modelStats(), fps, frame: { ...lastInfo }, materials: new Set(units[db.unit].meshes.map((m) => m.material.uuid)).size, sharedMaterials: units.trooper.meshes[0].material === units.tank.meshes[0].material }),
  squad: (on, n, mix) => { if (n) squadN = n; if (mix != null) squadMix = !!mix; setSquad(on); return modelStats(); },
  tab: setTab, view: viewTo, flush: flushDB,
  wipe: () => { wiped = true; clearTimeout(saveT); try { localStorage.clear(); } catch (e) { /* ignore */ } },
  player: (name) => { if (name != null) { db.player.name = clean(name) || 'Player'; saveDB(); refreshPanel(); } return db.player.name; },
  nations: {
    list: () => db.nations.map((n) => ({ ...n, active: n.id === db.active, looks: db.looks.filter((l) => l.nationId === n.id).length })),
    create: (name, colors) => createNation(name, colors),
    act: nationAct,
  },
  looks: {
    list: () => db.looks.map((l) => ({ id: l.id, nationId: l.nationId, unit: l.unit, name: l.name, u: l.u, hasThumb: l.thumb.startsWith('data:image/') })),
    save: (name) => { const id = saveLook(name); if (tab === 'looks') renderLooks(); return id; },
    act: lookAct,
  },
  ready: true,
};
