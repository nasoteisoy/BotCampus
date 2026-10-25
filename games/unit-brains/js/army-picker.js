// 🪖 Army picker for the Unit Brains editor. Reads + writes the shared BotCampus army (localStorage 'botcampus:army')
// ONLY through the shared schema (games/shared/army/schema.js → load / save / checkUnitBrain / cleanSquadBrain).
//   pick a unit → its brain opens in the 🧠 editor → every edit saves it to units[].brain (a cc.unitBrain; ✓ Saved)
//   every write re-reads the save first (fresh()), then applies only this page's change: other tabs' edits are never wiped
//   👥 squads stay in the save untouched (the Squad UI is hidden until Conquest runs squad plans).
//   Old saves: a preset id string (old brain) loads as "no brain" (the trooper keeps its trait AI).
// Old keys stay as a fallback / migration: 'conquest-commander:army-brains' (old per-look brains) is shown for a unit
// that has no army brain yet (saving moves it into the army); 'conquest-commander:brains' (💾 Save tab) is unchanged.
// Loaded as a module only over http(s) (index.html skips it on file: pages).
import * as Army from '../../shared/army/schema.js?v=9';

const UB = window.__ub, B = UB.B, $ = (id) => document.getElementById(id);
const OLD_ARMY = 'conquest-commander:army-brains';
const st = { army: null, sel: null, old: new Map(), savedKey: '' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CLASS_ICON = { trooper: '🪖', heavy: '🚀', engineer: '🔧', sniper: '🔭', commander: '⭐', jet: '🛩️' };

function readOld() {
  const m = new Map();
  try { const o = JSON.parse(localStorage.getItem(OLD_ARMY) || 'null'); if (o && Array.isArray(o.units)) for (const x of o.units) if (x && typeof x.id === 'string') m.set(x.id, x.brain); } catch (e) { /* ignore */ }
  return m;
}
function load() { st.army = Army.load(localStorage); st.old = readOld(); if (st.sel && !unitById(st.sel)) st.sel = null; render(); return st.army; }
const units = () => Army.playerUnits(st.army, st.army.activePlayerId, { kind: 'trooper' });
const unitById = (id) => st.army && st.army.units.find((u) => u.id === id);
const squadOf = (id) => st.army.squads.find((q) => q.playerId === st.army.activePlayerId && q.unitIds.includes(id)) || null;
const mySquads = () => st.army.squads.filter((q) => q.playerId === st.army.activePlayerId);
const oldBrainOf = (u) => st.old.get(u.id) ?? (u.ext && st.old.get(u.ext.legacyLookId)) ?? null;

function label(b) {
  if (b == null || typeof b === 'string') return { icon: '∅', text: 'No brain (battle trait)' };
  return { icon: b.icon || '🧠', text: (b.name || 'My brain') + ' · ' + (b.rows || []).length + ' rows' };
}
// army brain → editor brain. No brain (or an old preset id string) opens a new one-row brain; nothing is saved
// until the player edits a row.
function toEditor(u) {
  const raw = u.brain != null ? u.brain : oldBrainOf(u);
  if (raw && typeof raw === 'object') { const v = B.validateUnitBrain(raw); if (v.ok) return v.brain; }
  return B.newBrain(u.name + ' brain');
}
// editor brain → what goes in units[].brain (always a cc.unitBrain object)
function fromEditor(b) {
  return { kind: 'cc.unitBrain', v: 1, name: (b.name || 'My brain').slice(0, 24), icon: b.icon || '🧠', rows: b.rows.map((r) => ({ if: r.if, do: r.do, on: r.on !== false })) };
}
function msg(ok, t) { const m = $('armyMsg'); m.className = 'msg ' + (ok ? 'ok' : 'bad'); m.textContent = (ok ? '✅ ' : '❌ ') + t; }
// re-read the save right before every write, so an edit made in another tab / page since our last load is kept
// (we may have missed its storage event, e.g. a frozen background tab); only this page's change is applied on top
function fresh() { try { const a = Army.load(localStorage); if (a && a.players && a.players.length) st.army = a; } catch (e) { /* keep ours */ } }
function persist(what) {
  const ok = Army.save(st.army, localStorage, 'unit-brains');
  if (!ok) { msg(false, 'No storage'); UB.flashSaved(false, 'No storage'); return false; }
  load(); msg(true, what); UB.flashSaved(true); return true;
}

function render() {
  if (!st.army) return;
  const list = units(), me = Army.activePlayer(st.army);
  $('armyHead').innerHTML = list.length ? `🪖 ${esc(me.name)}'s troopers <span class="muted">${list.length}</span>${st.sel ? '' : '<span class="firstrun">👆 Pick a trooper to give it a brain</span>'}` : `🪖 No troopers yet · <a href="../trooper-custom/">Make one in the Customizer</a>`;
  const el = $('armyUnits'); el.innerHTML = '';
  for (const u of list) {
    const lb = label(u.brain != null ? u.brain : oldBrainOf(u)), q = squadOf(u.id), old = u.brain == null && oldBrainOf(u) != null;
    const b = document.createElement('button');
    b.className = 'ucard' + (u.id === st.sel ? ' on' : ''); b.dataset.id = u.id; b.title = u.name;
    b.innerHTML = `<span class="ui">${esc(u.icon || CLASS_ICON[u.class] || '🪖')}</span><span class="ut"><b>${esc(u.name)}</b><small>${lb.icon} ${esc(lb.text)}${old ? ' (old)' : ''}${q ? ' · 👥' + esc(q.name) : ''}</small></span>`;
    b.onclick = () => pick(u.id);
    el.appendChild(b);
  }
  const sq = $('armySquads'); sq.innerHTML = '';
  for (const q of mySquads()) {
    const b = document.createElement('button');
    b.className = 'opt sq' + (st.sel && q.unitIds.includes(st.sel) ? ' on has' : ''); b.dataset.squad = q.id; b.title = q.name;
    b.innerHTML = `👥<span>${esc(q.name)} · ${q.unitIds.length}</span>`;
    b.onclick = () => toggleSquad(q.id);
    sq.appendChild(b);
  }
  const add = document.createElement('button'); add.className = 'opt'; add.id = 'btnNewSquad'; add.title = 'New squad with the picked unit'; add.innerHTML = '➕<span>Squad</span>';
  add.disabled = !st.sel; add.onclick = newSquad; sq.appendChild(add);
  bars();
}
function bars() {
  const u = st.sel && unitById(st.sel);
  $('unitBar').classList.toggle('hide', !u); $('squadBar').classList.toggle('hide', !u);
  if (!u) return;
  const dirty = JSON.stringify(fromEditor(UB.unit())) !== st.savedKey;
  $('unitBarName').innerHTML = `🪖 ${esc(u.name)}${dirty ? ' <span class="dirty">•</span>' : ''}`;
  const q = squadOf(u.id); $('squadBarName').textContent = q ? `👥 ${q.name}` : '👥 —';
}
function pick(id) {
  const u = unitById(id); if (!u) return;
  st.sel = id; UB.setUnit(toEditor(u));
  st.savedKey = JSON.stringify(u.brain != null ? fromEditor(UB.unit()) : null);
  const q = squadOf(id); if (q && q.squadBrain) UB.setSquad(q.squadBrain);
  render(); msg(true, `${u.name} → 🧠 Brain`); UB.showTab('unit');
  return u;
}
function saveUnit() {
  fresh();
  const u = st.sel && unitById(st.sel); if (!u) { msg(false, 'Pick a unit'); return false; }
  const b = fromEditor(UB.unit()), chk = Army.checkUnitBrain(b);
  if (!chk.ok) { msg(false, chk.errors.slice(0, 2).join(' · ')); return false; }
  u.brain = chk.brain; st.savedKey = JSON.stringify(b);
  return persist(`${u.name}: brain saved`);
}
function clearBrain() {
  fresh();
  const u = st.sel && unitById(st.sel); if (!u) return false;
  u.brain = null; st.savedKey = 'null'; UB.setUnit(B.newBrain(u.name + ' brain')); return persist(`${u.name}: no brain (uses its battle trait)`);
}
function saveSquad() {
  fresh();
  const u = st.sel && unitById(st.sel); if (!u) { msg(false, 'Pick a unit'); return false; }
  const sb = Army.cleanSquadBrain(UB.squad()); if (!sb) { msg(false, 'Bad squad brain'); return false; }
  let q = squadOf(u.id);
  if (!q) { q = { id: Army.newId('s'), name: 'Squad ' + (mySquads().length + 1), playerId: st.army.activePlayerId, unitIds: [u.id], squadBrain: null }; st.army.squads.push(q); }
  q.squadBrain = sb;
  return persist(`👥 ${q.name} saved`);
}
function toggleSquad(qid) {
  fresh();
  const u = st.sel && unitById(st.sel); if (!u) { msg(false, 'Pick a unit'); return false; }
  const q = st.army.squads.find((s) => s.id === qid); if (!q) return false;
  if (q.unitIds.includes(u.id)) q.unitIds = q.unitIds.filter((x) => x !== u.id);
  else { for (const s of mySquads()) s.unitIds = s.unitIds.filter((x) => x !== u.id); q.unitIds.push(u.id); }
  return persist(`👥 ${q.name} · ${q.unitIds.length}`);
}
function newSquad() {
  fresh();
  const u = st.sel && unitById(st.sel); if (!u) return false;
  for (const s of mySquads()) s.unitIds = s.unitIds.filter((x) => x !== u.id);
  const q = { id: Army.newId('s'), name: 'Squad ' + (mySquads().length + 1), playerId: st.army.activePlayerId, unitIds: [u.id], squadBrain: Army.cleanSquadBrain(UB.squad()) };
  st.army.squads.push(q); return persist(`👥 ${q.name}`);
}

$('btnClearBrain').onclick = clearBrain;
// every row edit saves onto the picked trooper (debounced in ui.js) → ✓ Saved
UB.onEdit = () => { if (st.sel && unitById(st.sel)) saveUnit(); else { try { localStorage.setItem('conquest-commander:brains', UB.bundleText()); UB.flashSaved(true); } catch (e) { UB.flashSaved(false, 'No storage'); } } };
window.addEventListener('storage', (e) => { if (e.key === Army.ARMY_KEY || e.key === OLD_ARMY) load(); });
setInterval(bars, 400);
load();
$('tabArmy').classList.remove('hide');
if (units().length) UB.showTab('army');
window.__army = { load, pick, saveUnit, saveSquad, clearBrain, toggleSquad, newSquad, units: () => units().map((u) => ({ id: u.id, name: u.name, brain: u.brain })), get sel() { return st.sel; }, get army() { return st.army; }, fromEditor, toEditor };
