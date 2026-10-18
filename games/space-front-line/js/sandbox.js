// 🧪 Play Sandbox: set up any scenario in a frozen world (all units + buildings, both teams, free and instant),
// then ▶ Play it with the real game code. ⏸ pause / speed / ↺ reset to setup / save, load, export, import.
// Loaded lazily by main.js. The world itself is the scenario: snapshot() turns it into a list of items, rebuild() turns
// items back into a world (Reset, Move, Rotate, Delete, Load and Import all go through these two).
import { UNITS, BUILDINGS, BRANCHES } from './config.js';
import { svg } from './icons.js';
import { ringsApi } from './examiner.js';

const SAVE_KEY = 'frontline.sandbox.saves.v1', PREF_KEY = 'frontline.sandbox.prefs.v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;
const BR_ORDER = ['inf', 'armor', 'art', 'air'];
const BR_ICON = { inf: '🪖', armor: '🛡️', art: '💥', air: '✈️' };
const AI_MODES = [['off', '😴 Off', 'red never fires or moves'], ['hold', '🛡️ Hold', 'red fires at what is in range, never moves'], ['fight', '⚔️ Fight', 'red units attack your units'], ['full', '🤖 Full AI', 'the real AI: also builds and trains (needs a red HQ)']];
const phone = () => innerWidth < 700 || (innerHeight < 520 && innerWidth < 1000);

let A = null, H = null, root = null, selMark = null;
const S = {
  phase: 'setup', team: 'blue', tool: null, sel: null, moveMode: false, speed: 1, tab: 'place', open: true, setup: [], fightT: 0,
  opts: { ai: 'hold', fog: false, hqRules: false, blueBuild: false, money: { blue: 3000, red: 3000 } },
};
try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (p.opts) S.opts = { ...S.opts, ...p.opts, money: { ...S.opts.money, ...(p.opts.money || {}) } }; if (p.team) S.team = p.team; if (p.speed) S.speed = p.speed; } catch { /* ignore */ }
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ opts: S.opts, team: S.team, speed: S.speed })); } catch { /* ignore */ } };
function saves() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch { return {}; } }
const writeSaves = (o) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(o)); } catch { /* ignore */ } };

// ---------- scenario <-> world ----------
function snapshot() {
  const items = [];
  for (const b of A.buildings) if (b.alive) items.push({ k: 'b', t: b.type, team: b.team, x: r1(b.x), z: r1(b.z), flip: !!b.flip, hp: r1(b.hp / b.maxHp * 100) / 100 });
  for (const u of A.units) if (u.alive) { const p = A.pos(u); items.push({ k: 'u', t: u.type, team: u.team, x: r1(p.x), z: r1(p.z), yaw: Math.round((u.yaw || 0) * 100) / 100, hp: r1(u.hp / u.maxHp * 100) / 100 }); }
  return items;
}
function airHome(team, x, z) {
  let best = null, bd = Infinity;
  for (const b of A.buildings) if (b.alive && b.team === team && b.type === 'hangar') { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
  return best || { alive: true, x, z, team, examHome: true };
}
function createItem(it) {
  if (it.k === 'b') { if (!BUILDINGS[it.t]) return null; const b = A.createBuilding(it.t, it.team, it.x, it.z, true, !!it.flip); if (it.hp < 1) A.hurt(b, 1 - it.hp); return b; }
  if (!UNITS[it.t]) return null;
  const u = A.createUnit(it.t, it.team, it.x, it.z, it.yaw ?? (it.team === 'blue' ? Math.PI : 0));
  if (u.kind === 'air') { u.home = airHome(it.team, it.x, it.z); A.pos(u).y = u.def.alt; }
  if (it.yaw !== undefined) u.yaw = it.yaw;
  if (it.hp < 1) A.hurt(u, 1 - it.hp);
  return u;
}
function rebuild(items) {
  A.startSandboxWorld(); S.sel = null; S.moveMode = false;
  // buildings first (craft find their hangar), then units
  const made = [...items.filter((i) => i.k === 'b'), ...items.filter((i) => i.k === 'u')].map((it) => ({ it, e: createItem(it) }));
  applyOpts(true);
  return made;
}
function applyOpts(money) {
  const o = S.opts, g = A.game;
  if (money) { A.teams.blue.money = +o.money.blue || 0; A.teams.red.money = +o.money.red || 0; }
  g.hqRules = !!o.hqRules;
  A.removeReveals();
  if (!o.fog) { A.addReveal('blue'); A.addReveal('red'); for (const e of [...A.units, ...A.buildings]) { e.vis.blue = e.vis.red = true; if (e.everSeen) e.everSeen.blue = e.everSeen.red = true; if (e.seen) e.seen.blue = e.seen.red = g.time + 1.5; } }
  const full = o.ai === 'full' && A.hqOf('red')?.alive;
  if (full) { if (!A.aiState) { A.setAI('normal'); for (const u of A.units) if (u.alive && u.team === 'red') A.aiNewUnit(u); } g.holdAI = false; } else { A.setAI(null); g.holdAI = true; }
  for (const u of A.units) if (u.team === 'red') u.passive = o.ai === 'off';
  document.body.classList.toggle('sbx-build', !!o.blueBuild);
  A.refreshHUD();
}
function fightTick(dt) {
  if (S.opts.ai !== 'fight' || S.phase !== 'running') return;
  S.fightT -= dt; if (S.fightT > 0) return; S.fightT = 1;
  for (const r of A.units) {
    if (!r.alive || r.team !== 'red' || r.passive || !r.def.wpn) continue;
    if (A.isAir(r)) { if (r.airState !== 'idle') continue; const t = nearestFoe(r, true); if (t) A.airOrder(r, t); continue; }
    if (r.order) continue;
    const t = nearestFoe(r, false); if (t) A.orderAttack([r], t);
  }
}
function nearestFoe(r, air) {
  let best = null, bd = Infinity; const p = A.pos(r);
  for (const e of [...A.units, ...A.buildings]) {
    if (!e.alive || e.team === r.team || !e.vis.red || !A.canHurt(r, e)) continue;
    if (!air && A.isAir(e)) continue;
    const q = e.isBld ? e : A.pos(e), d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd) { bd = d; best = e; }
  }
  return bd < 260 ? best : null;
}

// ---------- phases ----------
function play() {
  if (S.phase === 'setup') { S.setup = snapshot(); if (!S.setup.length) { A.toast('Place some units first'); return false; } applyOpts(false); }
  S.phase = 'running'; S.tool = null; S.moveMode = false; S.sel = null;
  A.game.paused = false; A.game.timeScale = S.speed;
  if (S.opts.ai === 'full' && !A.hqOf('red')?.alive) A.toast('🤖 Full AI needs a red HQ: red holds instead');
  render(); return true;
}
function pause() { if (S.phase !== 'running') return false; S.phase = 'paused'; A.game.paused = true; render(); return true; }
function reset() {
  if (!S.setup.length) { A.toast('Nothing to reset yet: press ▶ Play first'); return; }
  rebuild(S.setup); S.phase = 'setup'; A.game.paused = true; render(); A.toast('↺ Back to the setup');
}
function togglePause(on) { if (on === undefined) on = S.phase === 'running'; return on ? pause() : play(); }
// edits while paused mid-run: the current frozen moment is snapshotted, edited and rebuilt (time and AI memory restart)
function edit(fn) {
  const items = snapshot(); const sel = S.sel ? items.findIndex((it) => matches(it, S.sel)) : -1;
  const keep = fn(items, sel); if (keep === false) return;
  const made = rebuild(items);
  if (typeof keep === 'number' && keep >= 0) { const m = made.find((x) => x.it === items[keep]); if (m?.e) select(m.e); }
  if (S.phase === 'paused') A.game.paused = true;
  render();
}
function matches(it, e) { if (!e) return false; const p = e.isBld ? e : A.pos(e); return it.k === (e.isBld ? 'b' : 'u') && it.t === e.type && it.team === e.team && Math.abs(it.x - r1(p.x)) < .11 && Math.abs(it.z - r1(p.z)) < .11; }

// ---------- placing / selecting ----------
function placeAt(x, z) {
  const tl = S.tool; if (!tl) return false;
  if (tl.k === 'b') {
    if (tl.t === 'hq' && A.hqOf(S.team)?.alive) { A.toast(`One HQ per team (${S.team})`); return false; }
    const c = A.canPlace(tl.t, S.team, x, z, true, true);
    if (!c.ok) { A.toast(`✋ ${c.reason}`); return false; }
    x = c.x; z = c.z;
  } else {
    const def = UNITS[tl.t];
    if (def.kind !== 'air' && A.waterClass(x, z) === 1) { A.toast('✋ Deep water'); return false; }
  }
  const it = { k: tl.k, t: tl.t, team: S.team, x: r1(x), z: r1(z) };
  if (tl.k === 'u') it.yaw = S.team === 'blue' ? Math.PI : 0;
  const e = createItem(it); if (!e) return false;
  applyOpts(false);
  select(e); renderSel(); return true;
}
function select(e) {
  S.sel = e || null; S.moveMode = false;
  if (e && e.team === 'blue') { if (e.isBld) A.selectBuilding(e); else A.selectUnits([e]); } else A.clearSelection();
  renderSel();
}
function onClick(cx, cy, right) {
  if (right) { if (S.tool || S.moveMode) { S.tool = null; S.moveMode = false; renderPalette(); renderSel(); return true; } return false; }
  if (S.tool) {
    if (S.phase === 'running') { A.toast('⏸ Pause to place'); return true; }
    const g = A.groundAt(cx, cy); if (!g) return true;
    if (S.phase === 'paused') edit((items) => { items.push({ k: S.tool.k, t: S.tool.t, team: S.team, x: r1(g.x), z: r1(g.z), yaw: S.team === 'blue' ? Math.PI : 0 }); return items.length - 1; });
    else placeAt(g.x, g.z);
    return true;
  }
  if (S.moveMode && S.sel) { const g = A.groundAt(cx, cy); if (g) moveSel(g.x, g.z); return true; }
  if (S.phase === 'running') return false;   // normal game clicks: command blue units
  const e = A.pickEntity(cx, cy);
  select(e && (e.isBld || e.alive) ? e : null);
  return true;
}
function moveSel(x, z) {
  edit((items, i) => {
    if (i < 0) return false;
    const it = items[i];
    if (it.k === 'b') {
      const rest = items.filter((_, j) => j !== i); rebuild(rest);
      const c = A.canPlace(it.t, it.team, x, z, true, true);
      if (!c.ok) { A.toast(`✋ ${c.reason}`); x = it.x; z = it.z; } else { x = c.x; z = c.z; }
    }
    it.x = r1(x); it.z = r1(z); return i;
  });
}
function rotateSel() { edit((items, i) => { if (i < 0) return false; const it = items[i]; if (it.k === 'b') it.flip = !it.flip; else it.yaw = Math.round(((it.yaw || 0) + Math.PI / 4) * 100) / 100; return i; }); }
function deleteSel() { edit((items, i) => { if (i < 0) return false; items.splice(i, 1); return -1; }); }
function clearAll() { if (S.phase === 'running') pause(); rebuild([]); S.phase = 'setup'; S.setup = []; A.game.paused = true; render(); A.toast('🧹 Cleared'); }

// ---------- save / load / export / import ----------
function scenario() { return { v: 1, items: S.phase === 'setup' ? snapshot() : S.setup, opts: JSON.parse(JSON.stringify(S.opts)) }; }
function load(sc) {
  if (!sc || !Array.isArray(sc.items)) throw new Error('not a sandbox scenario');
  if (sc.opts) S.opts = { ...S.opts, ...sc.opts, money: { ...S.opts.money, ...(sc.opts.money || {}) } }; savePrefs();
  const items = sc.items.filter((it) => (it.k === 'u' && UNITS[it.t]) || (it.k === 'b' && BUILDINGS[it.t])).map((it) => ({ ...it, team: it.team === 'red' ? 'red' : 'blue', x: +it.x || 0, z: +it.z || 0, hp: it.hp > 0 && it.hp <= 1 ? it.hp : 1 }));
  rebuild(items); S.phase = 'setup'; S.setup = items; A.game.paused = true; render();
  return items.length;
}
function saveAs(name) { name = String(name || '').trim().slice(0, 40); if (!name) { A.toast('Type a name first'); return false; } const o = saves(); o[name] = { ...scenario(), saved: new Date().toISOString() }; writeSaves(o); A.toast(`💾 Saved “${name}”`); renderSave(); return true; }
function loadSaved(name) { const sc = saves()[name]; if (!sc) return 0; const n = load(sc); A.toast(`📂 Loaded “${name}” (${n} items)`); return n; }
function deleteSaved(name) { const o = saves(); delete o[name]; writeSaves(o); renderSave(); }
function exportCode() { const json = JSON.stringify(scenario()); return 'FL1:' + btoa(unescape(encodeURIComponent(json))); }
function importCode(code) {
  code = String(code || '').trim(); if (code.startsWith('FL1:')) code = code.slice(4);
  const sc = JSON.parse(decodeURIComponent(escape(atob(code.replace(/\s+/g, '')))));
  return load(sc);
}

// ---------- UI ----------
const nameOf = (tl) => (tl.k === 'b' ? BUILDINGS[tl.t].name : UNITS[tl.t].name);
function renderPalette() {
  const el = $('#sbxsec-place'); if (!el) return;
  const btn = (k, t, name, br) => `<button class="sbi ${S.tool?.k === k && S.tool.t === t ? 'on' : ''}" data-tool="${k}:${t}" style="--c:${BRANCHES[br]?.color || '#9fb3c8'}" title="${esc(name)}">${svg(t, S.team)}<span>${esc(name)}</span></button>`;
  const bl = Object.keys(BUILDINGS).map((t) => btn('b', t, BUILDINGS[t].name, BUILDINGS[t].br || 'eco')).join('');
  const groups = BR_ORDER.map((br) => `<div class="sbg" style="--c:${BRANCHES[br].color}"><div class="sbgh">${BR_ICON[br]} ${BRANCHES[br].name}</div><div class="sbgrid">${Object.keys(UNITS).filter((t) => UNITS[t].br === br).map((t) => btn('u', t, UNITS[t].name, br)).join('')}</div></div>`).join('');
  el.innerHTML = `<div class="sbteam" role="group" aria-label="Team"><button data-team="blue" class="${S.team === 'blue' ? 'on' : ''}">🔵 Blue</button><button data-team="red" class="${S.team === 'red' ? 'on' : ''}">🔴 Red</button><button data-tool="" class="sbsel ${!S.tool ? 'on' : ''}" title="Select / move existing pieces">👆 Select</button></div>
    <div class="sbhint">${S.tool ? `Click / tap the map to place <b>${esc(nameOf(S.tool))}</b> (${S.team}) · right-click or 👆 to stop` : S.phase === 'running' ? '⏸ Pause to place or edit' : 'Pick a piece, then click / tap the map. Click a piece to select it.'}</div>
    <div class="sbsel-row" id="sbxselrow"></div>
    <div class="sbg"><div class="sbgh">🏗️ Buildings</div><div class="sbgrid">${bl}</div></div>${groups}
    <button class="sbclear" data-ui="clear">🧹 Clear all</button>`;
  renderSel();
}
function renderSel() {
  const el = $('#sbxselrow'); if (!el) return;
  const e = S.sel && (S.sel.isBld ? S.sel.alive : S.sel.alive) ? S.sel : null;
  if (!e || S.phase === 'running') { el.innerHTML = ''; return; }
  el.innerHTML = `<span class="sbselname">${svg(e.type, e.team)}${esc(e.isBld ? BUILDINGS[e.type].name : e.def.name)} <small>${e.team}</small></span>
    <button data-ui="move" class="${S.moveMode ? 'on' : ''}">✥ Move</button><button data-ui="rotate">↻ Rotate</button><button data-ui="delete">🗑 Delete</button>`;
}
function renderSetup() {
  const el = $('#sbxsec-setup'); if (!el) return; const o = S.opts;
  el.innerHTML = `<div class="sblab">🔴 Red behaviour</div>
    <div class="sbseg" data-opt="ai">${AI_MODES.map(([v, l, d]) => `<button data-v="${v}" class="${o.ai === v ? 'on' : ''}" title="${esc(d)}">${l}</button>`).join('')}</div>
    <div class="sbnote">${esc(AI_MODES.find((m) => m[0] === o.ai)?.[2] || '')}</div>
    <label class="sbchk"><input type="checkbox" id="sbfog" ${o.fog ? 'checked' : ''}> 🌫️ Fog of war <small>(off = both sides see everything)</small></label>
    <label class="sbchk"><input type="checkbox" id="sbhq" ${o.hqRules ? 'checked' : ''}> 🏁 HQ win rules <small>(lose all buildings / HQ = game over)</small></label>
    <label class="sbchk"><input type="checkbox" id="sbbuild" ${o.blueBuild ? 'checked' : ''}> 🏗️ Blue builds with money <small>(shows the build bar)</small></label>
    <div class="sblab">💲 Money <small>(used by Full AI and blue building)</small></div>
    <div class="sbmoney"><label>🔵 <input type="number" id="sbmb" min="0" step="250" value="${o.money.blue}"></label><label>🔴 <input type="number" id="sbmr" min="0" step="250" value="${o.money.red}"></label></div>`;
}
function renderSave() {
  const el = $('#sbxsec-save'); if (!el) return; const o = saves(); const names = Object.keys(o).sort((a, b) => (o[b].saved || '').localeCompare(o[a].saved || ''));
  el.innerHTML = `<div class="sblab">💾 Save this setup</div>
    <div class="sbrow"><input id="sbname" placeholder="Scenario name" maxlength="40"><button data-ui="save">💾 Save</button></div>
    <div class="sblab">📂 Saved <small>${names.length}</small></div>
    <div class="sblist">${names.length ? names.map((n) => `<div class="sbsave"><b>${esc(n)}</b><small>${o[n].items?.length || 0} items</small><button data-load="${esc(n)}">📂 Load</button><button data-del="${esc(n)}" aria-label="Delete">🗑</button></div>`).join('') : '<div class="sbnote">Nothing saved yet.</div>'}</div>
    <div class="sblab">🔗 Share</div>
    <div class="sbrow"><button data-ui="export">📤 Export code</button><button data-ui="import">📥 Import code</button></div>
    <textarea id="sbcode" rows="3" placeholder="Export puts a code here to copy. Paste a code here, then 📥 Import."></textarea>`;
}
function renderTop() {
  const el = $('#sbxctl'); if (!el) return;
  const run = S.phase === 'running', ring = ringsApi.toggles;
  $('#sbxstate').textContent = S.phase === 'setup' ? 'SETUP · paused' : run ? (A.game.paused ? 'PAUSED' : 'RUNNING') : 'PAUSED';
  $('#sbxstate').dataset.phase = S.phase;
  el.innerHTML = `${run ? '<button class="sbbig pause" data-ui="pause">⏸ Pause</button>' : '<button class="sbbig play" data-ui="play">▶ Play</button>'}
    <span class="sbspeed" role="group" aria-label="Speed">${[[.25, '¼×'], [.5, '½×'], [1, '1×'], [2, '2×']].map(([v, l]) => `<button data-speed="${v}" class="${S.speed === v ? 'on' : ''}">${l}</button>`).join('')}</span>
    <button data-ui="reset" ${S.setup.length ? '' : 'disabled'} title="Restore exactly the placed scenario">↺ Reset</button>
    <button data-ui="units" title="Unit Menu">📖</button>
    <button data-ui="rings" class="tg ${ring.rings ? 'on' : ''}" title="Rings for the selected unit">⭕</button><button data-ui="nums" class="tg ${ring.nums ? 'on' : ''}" title="Ring numbers">🔢</button>
    <button class="livetgl tg" title="Live stats (I)">📊</button>`;
  A.refreshLiveBtns?.();
}
function renderTabs() { root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab)); root.dataset.tab = S.tab; }
function render() { if (!root) return; renderTop(); renderTabs(); renderPalette(); renderSetup(); renderSave(); root.classList.toggle('min', !S.open); }
function buildDom() {
  root = document.createElement('div'); root.id = 'sbx';
  root.innerHTML = `<aside id="sbxpanel">
    <div class="sbhead"><button data-ui="menu">◀ Menu</button><b>🧪 Sandbox</b><span id="sbxstate"></span><button class="sbgrab" data-ui="toggle" aria-label="Collapse panel">▾</button></div>
    <div id="sbxctl" class="sbctl"></div>
    <nav class="sbtabs"><button data-tab="place">🧱 Place</button><button data-tab="setup">⚙️ Setup</button><button data-tab="save">💾 Save</button></nav>
    <div class="sbbody"><section id="sbxsec-place" data-sec="place"></section><section id="sbxsec-setup" data-sec="setup"></section><section id="sbxsec-save" data-sec="save"></section></div>
  </aside>`;
  document.body.appendChild(root);
  root.addEventListener('click', onUi);
  root.addEventListener('change', onChange);
  for (const ev of ['wheel', 'pointerdown', 'mousedown', 'touchstart', 'contextmenu', 'dblclick']) root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  root.addEventListener('keydown', (e) => e.stopPropagation());
}
function onUi(e) {
  const el = e.target.closest('button'); if (!el || el.disabled) return;
  if (el.dataset.tab) { S.tab = el.dataset.tab; if (!S.open) S.open = true; render(); return; }
  if (el.dataset.team) { S.team = el.dataset.team; savePrefs(); renderPalette(); return; }
  if (el.dataset.tool !== undefined) { const [k, t] = el.dataset.tool.split(':'); S.tool = t && !(S.tool?.k === k && S.tool.t === t) ? { k, t } : null; S.moveMode = false; if (S.tool && S.phase === 'running') pause(); renderPalette(); return; }
  if (el.dataset.speed) { S.speed = +el.dataset.speed; savePrefs(); if (S.phase === 'running') A.game.timeScale = S.speed; renderTop(); return; }
  if (el.dataset.load) { loadSaved(el.dataset.load); return; }
  if (el.dataset.del) { deleteSaved(el.dataset.del); return; }
  const seg = el.closest('[data-opt]'); if (seg) { S.opts[seg.dataset.opt] = el.dataset.v; savePrefs(); applyOpts(false); renderSetup(); return; }
  const ui = el.dataset.ui;
  if (ui === 'menu') { A.backToMenu(); return; }
  if (ui === 'toggle') { S.open = !S.open; root.classList.toggle('min', !S.open); syncSize(); return; }
  if (ui === 'play') play(); if (ui === 'pause') pause(); if (ui === 'reset') reset();
  if (ui === 'units') A.openGuide({ from: S.phase === 'running' ? 'play' : 'sandbox' });
  if (ui === 'rings') { const t = ringsApi.toggles; ringsApi.setToggles(!t.rings, t.nums); renderTop(); }
  if (ui === 'nums') { const t = ringsApi.toggles; ringsApi.setToggles(t.rings, !t.nums); renderTop(); }
  if (ui === 'clear') clearAll();
  if (ui === 'move') { S.moveMode = !S.moveMode; S.tool = null; renderPalette(); if (S.moveMode) A.toast('Click / tap where it should go'); }
  if (ui === 'rotate') rotateSel(); if (ui === 'delete') deleteSel();
  if (ui === 'save') saveAs($('#sbname').value);
  if (ui === 'export') { const c = exportCode(); const ta = $('#sbcode'); ta.value = c; ta.focus(); ta.select(); try { navigator.clipboard?.writeText(c).then(() => A.toast('📤 Code copied'), () => A.toast('📤 Select the code and copy it')); } catch { A.toast('📤 Select the code and copy it'); } }
  if (ui === 'import') { try { const n = importCode($('#sbcode').value); A.toast(`📥 Imported ${n} items`); } catch (err) { A.toast('📥 That code did not work: ' + err.message); } }
}
function onChange(e) {
  const t = e.target, o = S.opts;
  if (t.id === 'sbfog') o.fog = t.checked; else if (t.id === 'sbhq') o.hqRules = t.checked; else if (t.id === 'sbbuild') o.blueBuild = t.checked;
  else if (t.id === 'sbmb') o.money.blue = Math.max(0, +t.value || 0); else if (t.id === 'sbmr') o.money.red = Math.max(0, +t.value || 0); else return;
  savePrefs(); applyOpts(t.id === 'sbmb' || t.id === 'sbmr' ? S.phase === 'setup' : false);
}
function syncSize() { const p = $('#sbxpanel'); if (!p) return; const r = p.getBoundingClientRect(); document.body.style.setProperty('--sbxh', (phone() && innerWidth < 700 ? Math.round(r.height) : 0) + 'px'); document.body.style.setProperty('--sbxw', (innerHeight < 520 ? Math.round(r.right) : 0) + 'px'); }

// ---------- frame ----------
function onFrame(dt) {
  if (S.phase !== 'running') A.game.paused = true;
  fightTick(dt * (A.game.paused ? 0 : A.game.timeScale || 0));
  // selection marker + rings for the selected / single game-selected unit
  const sel = S.sel?.alive ? S.sel : (A.selUnits.size === 1 ? [...A.selUnits][0] : null);
  if (!selMark) { const T = A.THREE; selMark = new T.Mesh(new T.RingGeometry(2.6, 3.1, 32), new T.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: .9, depthWrite: false, side: T.DoubleSide, toneMapped: false })); selMark.rotation.x = -Math.PI / 2; selMark.renderOrder = 5; A.scene.add(selMark); }
  const se = S.sel && S.phase !== 'running' && (S.sel.isBld ? S.sel.alive : S.sel.alive) ? S.sel : null;
  selMark.visible = !!se;
  if (se) { const p = se.isBld ? { x: se.x, z: se.z } : A.pos(se); const r = se.isBld ? Math.max(se.hx, se.hz) + 2 : (se.def.r || 2) + 1; selMark.scale.setScalar(r / 2.8); selMark.position.set(p.x, A.surfaceY(p.x, p.z) + .4, p.z); }
  ringsApi.update(A, sel);
  S.uiT = (S.uiT || 0) - dt; if (S.uiT <= 0) { S.uiT = .3; const st = $('#sbxstate'); if (st) st.textContent = S.phase === 'setup' ? 'SETUP · paused' : S.phase === 'running' ? (A.game.paused ? 'PAUSED' : `RUNNING ${Math.floor(A.game.time)} s`) : 'PAUSED'; syncSize(); }
}
function onKey(e) {
  if (!root || root.classList.contains('hidden') || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || document.body.classList.contains('guide-open')) return;
  if ((e.code === 'Delete' || e.code === 'Backspace') && S.sel && S.phase !== 'running') { e.preventDefault(); deleteSel(); }
}

// ---------- open / close ----------
export function openSandbox(api, hooks) {
  A = api; H = hooks;
  if (!root) buildDom();
  document.body.classList.add('sandbox'); root.classList.remove('hidden');
  H.onFrame = onFrame; H.onClick = onClick; H.close = closeSandbox; H.togglePause = togglePause;
  S.phase = 'setup'; S.setup = []; S.tool = null; S.sel = null; S.open = !phone() || innerHeight >= 520;
  rebuild([]); A.game.paused = true; A.game.timeScale = S.speed;
  A.focusAt(0, 30, phone() ? 110 : 95);
  if (matchMedia('(pointer: coarse)').matches) A.enableTouchUI();
  window.addEventListener('keydown', onKey);
  render(); syncSize();
  return true;
}
function closeSandbox() {
  if (!A) return;
  H.onFrame = H.onClick = H.close = H.togglePause = null;
  A.game.paused = false; A.game.timeScale = 1; A.removeReveals(); A.setAI(null);
  ringsApi.clear(); if (selMark) { A.scene.remove(selMark); selMark.geometry.dispose(); selMark.material.dispose(); selMark = null; }
  window.removeEventListener('keydown', onKey);
  document.body.classList.remove('sandbox', 'sbx-build'); document.body.style.removeProperty('--sbxh'); document.body.style.removeProperty('--sbxw');
  root?.classList.add('hidden');
}
// test hooks
window.__sandbox = {
  get state() { return { phase: S.phase, team: S.team, tool: S.tool && { ...S.tool }, speed: S.speed, opts: JSON.parse(JSON.stringify(S.opts)), setup: S.setup.length, sel: S.sel?.id || null }; },
  setTeam: (t) => { S.team = t; renderPalette(); }, setTool: (k, t) => { S.tool = t ? { k, t } : null; renderPalette(); },
  place: (k, t, team, x, z) => { const prev = [S.tool, S.team]; S.tool = { k, t }; S.team = team; const ok = placeAt(x, z); [S.tool, S.team] = prev; renderPalette(); return ok; },
  setOpt: (k, v) => { S.opts[k] = v; savePrefs(); applyOpts(false); renderSetup(); },
  play, pause, reset, clearAll, snapshot: () => snapshot(), select: (id) => select(A.entById(id)), rotate: rotateSel, del: deleteSel, move: moveSel,
  saveAs, loadSaved, deleteSaved, saves: () => Object.keys(saves()), exportCode, importCode,
};
