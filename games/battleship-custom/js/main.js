// BattleShip Editor (Army HQ › Customize › BattleShip). Capital ships for space battles.
// Save: army.battleships[] in 'botcampus:army' (see BATTLESHIP_FORMAT.md). Merge-on-write raw patch: only battleships[]
// (+ updatedAt / updatedBy) change. dirty flag + 'storage' listener like the Trooper Customizer.
// Never navigates the page and never opens windows: it runs inside Army HQ's single-URL iframe shell.
import * as THREE from 'three';
import * as Army from '../../shared/army/schema.js?v=8';
import { PARTS, SLOTS, STAT_ROWS, PIPS, battleshipStats, rowValue, pips, part, cleanParts } from './battleship-stats.js?v=1';
import { FIELD, LIMITS, cleanShip, fleetOf, newShip, shipsIn, mergeFleet } from './fleet.js?v=1';
import { buildShip, disposeTree, focusPart, HULL_DIM } from './ship3d.js?v=1';
import { spaceshipsFor } from './spacecraft.js?v=1';
import { createDemo } from './demo.js?v=1';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const RO = { getItem: lsGet, setItem() {}, removeItem() {} };
const LS_UI = 'battleship-custom:ui', LS_HINT = 'battleship-custom:hint';

// ---------- part tabs (grouped), stat names ----------
const SLOT_UI = {
  hull: { ic: '📐', lb: 'Size', what: 'hull size' }, armor: { ic: '🛡️', lb: 'Armor', what: 'armor' }, shield: { ic: '🔵', lb: 'Shield', what: 'shield' },
  guns: { ic: '💥', lb: 'Guns', what: 'turrets & cannons' }, hangar: { ic: '✈️', lb: 'Hangar', what: 'hangar' }, engine: { ic: '🚀', lb: 'Engine', what: 'engines' },
};
const GROUPS = [['Body', ['hull', 'armor', 'shield']], ['Weapons', ['guns', 'hangar']], ['Move', ['engine']]];
const STAT_HELP = { hp: 'how much damage the ship can take', armor: 'cuts the damage of every hit', shield: 'blocks hits first, then recharges', dps: 'damage per second from all guns',
  range: 'how far the guns reach', speed: 'how fast it flies', turn: 'how fast it turns', hangar: 'small SpaceShips + troopers it launches', cost: 'price — lower is better' };

// ---------- state ----------
const q = new URLSearchParams(location.search), SECTION = q.get('section') || '';
const embedded = (() => { try { return window.top !== window; } catch (e) { return true; } })();
document.body.classList.toggle('embed', embedded);
if (SECTION) document.body.classList.add('bssec');
let army = null, ships = [], pid = '';
const changed = new Map(), deleted = new Set(), pending = new Map(); // pending: per player, the auto-made base ship (not saved until touched)
let dirty = false, saveT = 0, step = 1, slot = 'hull', hover = null, swapFx = null, renaming = '', sureDel = '', demoOn = false;
let ui = (() => { try { return JSON.parse(lsGet(LS_UI) || '{}') || {}; } catch (e) { return {}; } })();
if (!ui.sel || typeof ui.sel !== 'object') ui.sel = {};
if (SLOTS.includes(SECTION)) { step = 2; slot = SECTION; }

function readArmy() {
  const has = lsGet(Army.ARMY_KEY) != null;
  if (!has && (lsGet(Army.LEGACY_KEYS.customizer) != null)) { try { Army.load(localStorage); } catch (e) { /* ignore */ } } // legacy-only save: migrate once (same as Army HQ)
  let a = null;
  try { a = lsGet(Army.ARMY_KEY) != null ? Army.load(RO) : null; } catch (e) { a = null; }
  if (!a || !a.players || !a.players.length) a = army && !lsGet(Army.ARMY_KEY) ? army : Army.emptyArmy(); // nothing stored: keep the same in-memory player
  return a;
}
function storedShips() { let raw = null; try { raw = JSON.parse(lsGet(Army.ARMY_KEY) || 'null'); } catch (e) { raw = null; } return shipsIn(raw); }
function load() {
  army = readArmy(); pid = army.activePlayerId;
  const st = storedShips().filter((s) => !deleted.has(s.id)).map((s) => changed.get(s.id) || s);
  for (const [id, s] of changed) if (!st.some((x) => x.id === id)) st.push(s);
  ships = st;
  if (!fleetOf(ships, pid).length) { let p = pending.get(pid); if (!p) { p = newShip(ships, pid); pending.set(pid, p); } ships.push(p); }
}
const myShips = () => fleetOf(ships, pid);
const cur = () => { const m = myShips(); return m.find((s) => s.id === ui.sel[pid]) || m[0]; };
const player = () => Army.activePlayer(army);
const colors = () => player().nation.colors;

// ---------- save ----------
function touch(s) { s.updatedAt = new Date().toISOString(); changed.set(s.id, s); pending.forEach((p, k) => { if (p.id === s.id) pending.delete(k); }); dirty = true; clearTimeout(saveT); saveT = setTimeout(flush, 350); }
function flush(showFlash = true) {
  clearTimeout(saveT); saveT = 0;
  if (!dirty) { if (showFlash === 'force') flashSaved(); return true; }
  const raw = lsGet(Army.ARMY_KEY);
  const base = raw == null ? { ...army } : null; // nothing stored yet: create the army save around this player
  const ok = lsSet(Army.ARMY_KEY, mergeFleet(raw, base, changed, deleted));
  if (ok) { changed.clear(); deleted.clear(); dirty = false; if (showFlash) flashSaved(); }
  else toast('❌ Could not save');
  return ok;
}
let savedT = 0;
function flashSaved() { const el = $('#saved'); el.classList.add('on'); clearTimeout(savedT); savedT = setTimeout(() => el.classList.remove('on'), 1600); window.__bsSaves = (window.__bsSaves || 0) + 1; }
addEventListener('pagehide', () => flush(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(false); });
addEventListener('storage', (e) => {
  if (e.key && e.key !== Army.ARMY_KEY) return;
  load(); renderAll(); rebuild();
  window.__bsStorageEvents = (window.__bsStorageEvents || 0) + 1;
});
const saveUi = () => lsSet(LS_UI, JSON.stringify({ sel: ui.sel }));

// ---------- 3D ----------
const app = $('#app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor(0x000000, 0);
app.append(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
function lights(sc) {
  sc.add(new THREE.HemisphereLight(0xcfe0ff, 0x262a33, 1.8));
  const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(3, 5, 4); sc.add(k);
  const r = new THREE.DirectionalLight(0x8fb4ff, 1.2); r.position.set(-4, 2, -4); sc.add(r);
}
lights(scene);
const pivot = new THREE.Group(); scene.add(pivot);
const demo = createDemo(pivot);
let shipObj = null, yaw = -0.7, pitch = 0.35, zoom = 1, spin = true, fitD = 10;
function rebuild() {
  if (shipObj) { pivot.remove(shipObj); disposeTree(shipObj); shipObj = null; }
  const s = cur(); if (!s) return;
  const parts = hover ? { ...s.parts, [hover.slot]: hover.id } : s.parts;
  shipObj = buildShip(parts, colors()); shipObj.visible = !demoOn; pivot.add(shipObj);
  fitD = 3 + shipObj.userData.L * 1.6;
  if (demoOn) demo.start(s, colors());
}
function resize() { const w = app.clientWidth || 1, h = app.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(app);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!document.hidden) {
    if (spin && !drag) yaw += dt * 0.35;
    pivot.rotation.set(0, 0, 0);
    const d = (demoOn ? 15 + (shipObj ? shipObj.userData.L * 1.4 : 4) : fitD) * zoom * (camera.aspect < 1 ? 1.35 : 1) * (demoOn && innerWidth < 600 ? 0.86 : 1); // phones: a bit closer in the demo
    camera.position.set(Math.cos(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.sin(yaw) * Math.cos(pitch) * d);
    camera.lookAt(0, demoOn ? 0 : 0.15, 0);
    if (demoOn) { demo.tick(dt); $('#dSh').style.width = Math.round(demo.hud.shield * 100) + '%'; $('#dHp').style.width = Math.round(demo.hud.hp * 100) + '%'; }
    else if (shipObj) for (const e of shipObj.userData.engines) e.scale.setScalar(0.85 + Math.random() * 0.25);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
// drag to rotate (mouse + touch), wheel / pinch to zoom
let drag = null; const ptrs = new Map();
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, pinch: ptrs.size === 2 ? pdist() : 0, z: zoom }; spin = false; syncSpin(); });
cv.addEventListener('pointermove', (e) => {
  if (!drag || !ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size >= 2) { if (!drag.pinch) drag.pinch = pdist(), drag.z = zoom; zoom = Math.max(0.5, Math.min(2, drag.z * drag.pinch / Math.max(20, pdist()))); return; }
  yaw += (e.clientX - drag.x) * 0.01; pitch = Math.max(-1.2, Math.min(1.3, pitch + (e.clientY - drag.y) * 0.008)); drag.x = e.clientX; drag.y = e.clientY;
  window.__bsDragged = (window.__bsDragged || 0) + 1;
});
const up = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) drag = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.5, Math.min(2, zoom * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
function pdist() { const [a, b] = [...ptrs.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }

// thumbnails: one small offscreen renderer, cached data URLs
const TW = 192, TH = 120;
const tr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); tr.setSize(TW, TH, false); tr.setClearColor(0x000000, 0);
const tScene = new THREE.Scene(); lights(tScene); const tKey = new THREE.DirectionalLight(0xffffff, 2.2), tRim = new THREE.DirectionalLight(0xbfe8ff, 1.4); tScene.add(tKey, tKey.target, tRim, tRim.target); // follows the camera: close-ups are lit from the front
const tCam = new THREE.PerspectiveCamera(30, TW / TH, 0.1, 200);
const thumbs = new Map();
// thumb(parts, slot): slot null = the whole ship (fleet cards); 'hull' = whole ship at one fixed scale (sizes compare);
// any other slot = a close-up of THAT part, the rest of the ship greyed out (so every option card looks different).
const VIEW = { armor: [0.35, 0.3, 1], shield: [0.55, 0.42, 0.75], guns: [0.75, 0.95, 0.6], engine: [-1, 0.42, 0.62], hangar: [0.3, 0.12, 1] };
const VIEW_ID = { pods: [0.35, -0.85, 0.75], carrier: [0.25, 0.95, -0.7] };
function thumb(parts, slot = null) {
  const c = colors(), key = JSON.stringify([cleanParts(parts), c, slot]);
  if (thumbs.has(key)) return thumbs.get(key);
  const g = buildShip(parts, c, { shield: slot === 'shield' ? 'thumb' : 'editor' }); tScene.add(g);
  if (!slot || slot === 'hull') {
    const L = slot ? HULL_DIM.dreadnought[0] : g.userData.L, d = slot ? 0.6 + L * 1.05 : 1.0 + L * 1.25;
    tCam.position.set(d * 0.55, d * 0.42, d * 0.75); tCam.lookAt(0, 0, 0);
  } else {
    const { box, empty } = focusPart(g, slot), ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const r = Math.max(0.35, sz.length() / 2), dir = new THREE.Vector3(...(VIEW_ID[parts[slot]] || VIEW[slot] || [0.55, 0.42, 0.75])).normalize();
    const d = r / Math.sin(THREE.MathUtils.degToRad(tCam.fov / 2)) * (empty ? 0.95 : 0.82);
    tCam.position.copy(ctr).addScaledVector(dir, d); tCam.lookAt(ctr);
  }
  const close = slot && slot !== 'hull'; tKey.intensity = close ? 2.2 : 0; tRim.intensity = close ? 1.4 : 0;
  if (close) { const c0 = tCam.getWorldDirection(new THREE.Vector3()); tKey.position.copy(tCam.position); tKey.target.position.copy(tCam.position).addScaledVector(c0, 5); tRim.target.position.copy(tKey.target.position); tRim.position.copy(tKey.target.position).addScaledVector(c0, 6).add(new THREE.Vector3(0, 4, 0)); }
  tCam.updateMatrixWorld(); tr.render(tScene, tCam); const url = tr.domElement.toDataURL('image/png');
  tScene.remove(g); disposeTree(g);
  if (thumbs.size > 300) thumbs.clear();
  thumbs.set(key, url); return url;
}

// test helper: the same close-up with ONLY the part drawn (alpha = where the part is), used to check the part is brighter than the ghost hull
function thumbMask(parts, slot) {
  const c = colors(); thumbs.delete(JSON.stringify([cleanParts(parts), c, slot])); thumb(parts, slot); // fresh render leaves the camera + lights where that card had them
  const g = buildShip(parts, c, { shield: slot === 'shield' ? 'thumb' : 'editor' }); focusPart(g, slot); for (const ch of g.children) ch.visible = ch.userData.slot === slot;
  tScene.add(g); tr.render(tScene, tCam); const url = tr.domElement.toDataURL('image/png'); tScene.remove(g); disposeTree(g); return url;
}

// ---------- UI ----------
function head() {
  const s = cur(), n = player().nation;
  $('#hName').textContent = s ? s.name : '—';
  const bits = [esc(n.name), '🚀 BattleShips', esc(s ? s.name : '—')]; // same order as the SpaceShip Editor: Nation › 🚀 BattleShips › Name › Part
  if (demoOn) bits.push('🎬 Demo'); else if (step === 2) bits.push(`${SLOT_UI[slot].ic} ${SLOT_UI[slot].lb}`);
  $('#crumb').innerHTML = bits.map((b, i) => `<span class="c${i}${i === bits.length - 1 ? ' cur' : ''}">${b}</span>`).join('<span class="sep">›</span>');
  document.title = `🚀 ${s ? s.name : 'BattleShip'} · BattleShip Editor`;
  const back = $('#back'); const canBack = step === 2 || demoOn; back.setAttribute('aria-disabled', canBack ? 'false' : 'true');
  back.title = canBack ? (demoOn ? 'Stop the demo' : 'Back to your ships') : 'You are at the start';
  for (const li of document.querySelectorAll('#steps li')) { const k = +li.dataset.step; li.classList.toggle('on', k === step); li.classList.toggle('ok', k < step); }
  document.body.classList.toggle('step1', step === 1); document.body.classList.toggle('step2', step === 2); document.body.classList.toggle('demo', demoOn);
}
function renderStats() {
  const s = cur(); if (!s) return;
  const now = battleshipStats(s);
  let cmp = null, cmpIsOld = false;
  if (hover) cmp = battleshipStats({ ...s.parts, [hover.slot]: hover.id });             // hover preview: what you WOULD get
  else if (swapFx && performance.now() < swapFx.until) { cmp = battleshipStats(swapFx.from); cmpIsOld = true; } // just swapped: what changed
  const el = $('#stats');
  el.innerHTML = STAT_ROWS.map((r) => {
    const v = rowValue(now, r.key), pv = pips(r.key, v);
    let segs = '', badge = '';
    if (cmp) {
      const [a, b] = cmpIsOld ? [rowValue(cmp, r.key), v] : [v, rowValue(cmp, r.key)]; // a = before, b = after
      const pa = pips(r.key, a), pb = pips(r.key, b), dp = pb - pa, better = (b - a) * r.good > 0;
      for (let i = 0; i < PIPS; i++) segs += `<s class="${i < Math.min(pa, pb) ? 'f' : i < Math.max(pa, pb) ? (pb > pa ? (r.good > 0 ? 'up' : 'dn') : (r.good > 0 ? 'dn' : 'up')) : ''}"></s>`;
      if (b !== a) badge = `<span class="d ${better ? 'good' : 'bad'}">${b > a ? '▲' : '▼'}${dp ? Math.abs(dp) : ''}</span>`;
    } else for (let i = 0; i < PIPS; i++) segs += `<s class="${i < pv ? 'f' : ''}"></s>`;
    return `<button type="button" class="stat" data-k="${r.key}" aria-label="${r.label}: ${STAT_HELP[r.key]}"><span class="nm"><span class="ic">${r.icon}</span><span class="lb">${r.label}</span></span><span class="row"><span class="bar" aria-hidden="true">${segs}</span>${badge}</span></button>`;
  }).join('');
}
function renderTabs() {
  $('#tabs').innerHTML = GROUPS.map(([g, sl]) => `<div class="grp" data-n="${sl.length}"><small>${g}</small><div>${sl.map((k) =>
    `<button type="button" class="tab${step === 2 && k === slot ? ' on' : ''}" role="tab" aria-selected="${step === 2 && k === slot}" data-slot="${k}"><span class="ic">${SLOT_UI[k].ic}</span><span class="lb">${SLOT_UI[k].lb}</span></button>`).join('')}</div></div>`).join('');
}
// short "what changes" chips for an option vs the current part (icon + WORD + arrow)
function chips(s, sl, id) {
  const a = battleshipStats(s), b = battleshipStats({ ...s.parts, [sl]: id }), out = [];
  for (const r of STAT_ROWS) {
    const va = rowValue(a, r.key), vb = rowValue(b, r.key); if (va === vb) continue;
    const dp = pips(r.key, vb) - pips(r.key, va), better = (vb - va) * r.good > 0;
    out.push({ w: Math.abs(dp) + (r.key === 'cost' ? -0.5 : 0), html: `<span class="${better ? 'good' : 'bad'}">${r.icon} ${r.label} ${vb > va ? '▲' : '▼'}${dp ? Math.abs(dp) : ''}</span>` });
  }
  out.sort((x, y) => y.w - x.w);
  return out.slice(0, 4).map((x) => x.html).join('') || '<span class="same">🎨 same stats</span>';
}
function renderBody() {
  const s = cur(), b = $('#body');
  if (step === 1) {
    const list = myShips();
    b.innerHTML = `<div class="sh">🚢 Your BattleShips <small>${list.length}/${LIMITS.shipsPerPlayer}</small></div><div class="cards">${list.map((x) => {
      const st = battleshipStats(x), on = x.id === s.id;
      if (renaming === x.id) return `<div class="card on" data-id="${x.id}"><input id="renIn" maxlength="${LIMITS.name}" value="${esc(x.name)}" aria-label="Ship name"><button type="button" class="ob" data-act="renok"><span class="ic">✅</span><span class="lb">OK</span></button></div>`;
      return `<div class="card${on ? ' on' : ''}" data-id="${x.id}"><button type="button" class="pick" data-act="pick"><img alt="" src="${thumb(x.parts)}"><span class="nm"><b>${esc(x.name)}</b><small>${part('hull', x.parts.hull).icon} ${part('hull', x.parts.hull).name} · ${part('guns', x.parts.guns).icon} ${part('guns', x.parts.guns).name}</small>${on ? '<em>✓ Editing</em>' : ''}</span></button>`
        + `<button type="button" class="ob" data-act="ren" aria-label="Rename ${esc(x.name)}"><span class="ic">✏️</span><span class="lb">Name</span></button>`
        + `<button type="button" class="ob${sureDel === x.id ? ' bad' : ''}" data-act="del" aria-label="Delete ${esc(x.name)}"><span class="ic">🗑️</span><span class="lb">${sureDel === x.id ? 'Sure?' : 'Delete'}</span></button></div>`;
    }).join('')}</div><button type="button" id="add" class="ob wide" ${list.length >= LIMITS.shipsPerPlayer ? 'disabled' : ''}><span class="ic">➕</span><span class="lb">New BattleShip</span></button>`;
    const ri = $('#renIn'); if (ri) { ri.focus(); ri.select(); }
  } else {
    const u = SLOT_UI[slot];
    b.innerHTML = `<div class="sh">${u.ic} ${u.lb} <small>tap to put it on</small></div><div class="opts">${PARTS[slot].map((p) => {
      const on = s.parts[slot] === p.id, tp = { ...s.parts, [slot]: p.id };
      return `<button type="button" class="opt${on ? ' on' : ''}" data-id="${p.id}" aria-pressed="${on}"><img alt="" src="${thumb(tp, slot)}" data-thumb="${slot}:${p.id}"><span class="on1">${p.icon} ${p.name}</span><span class="ch">${on ? '' : chips(s, slot, p.id)}</span>${on ? '<span class="tick">✓ On</span>' : ''}</button>`;
    }).join('')}</div>`;
  }
}
function renderAll() { head(); renderStats(); renderTabs(); renderBody(); placeHint(); }

// ---------- actions ----------
function setStep(n) { step = n; hover = null; renaming = ''; sureDel = ''; renderAll(); $('#body').scrollTop = 0; }
function selectShip(id) { ui.sel[pid] = id; saveUi(); rebuild(); }
function stopDemo() { demoOn = false; demo.stop(); if (shipObj) shipObj.visible = true; $('#dhud').hidden = true; $('#demoBtn').classList.remove('on'); $('#demoBtn .ic').textContent = '🎬'; $('#demoBtn .lb').textContent = 'Demo'; head(); }
function rawArmy() { try { return JSON.parse(lsGet(Army.ARMY_KEY) || 'null'); } catch (e) { return null; } }
let craftReq = 0;
function loadCrafts() { // the player's SpaceShips from the SpaceShip Editor (if it is deployed next door), else our own craft
  const n = ++craftReq;
  spaceshipsFor(rawArmy(), pid, colors()).then((k) => { if (n === craftReq) demo.setCrafts(k); }).catch(() => { if (n === craftReq) demo.setCrafts(null); });
}
function startDemo() { loadCrafts(); demoOn = true; zoom = 1; $('#dhud').hidden = false; $('#demoBtn').classList.add('on'); $('#demoBtn .ic').textContent = '⏹️'; $('#demoBtn .lb').textContent = 'Stop'; rebuild(); head(); }
$('#demoBtn').addEventListener('click', () => (demoOn ? stopDemo() : startDemo()));
function syncSpin() { $('#spinBtn').classList.toggle('on', spin); $('#spinBtn').setAttribute('aria-pressed', String(spin)); }
$('#spinBtn').addEventListener('click', () => { spin = !spin; syncSpin(); });
$('#back').addEventListener('click', () => { if (demoOn) { stopDemo(); return; } if (step === 2) setStep(1); });
$('#done').addEventListener('click', () => { if (demoOn) stopDemo(); flush('force'); if (step === 2) setStep(1); else renderAll(); dismissHint(); });
$('#tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (!t) return; slot = t.dataset.slot; if (step !== 2) step = 2; hover = null; swapFx = null; dismissHint(); renderAll(); $('#body').scrollTop = 0; });
$('#body').addEventListener('click', (e) => {
  const s = cur();
  if (step === 2) {
    const o = e.target.closest('.opt'); if (!o || !s) return;
    if (s.parts[slot] === o.dataset.id) return;
    swapFx = { from: { ...s.parts }, until: performance.now() + 2600 };
    s.parts = { ...s.parts, [slot]: o.dataset.id }; hover = null; touch(s);
    rebuild(); renderAll(); clearTimeout(swapFx.t); setTimeout(() => { if (!hover) renderStats(); }, 2700);
    window.__bsSwaps = (window.__bsSwaps || 0) + 1;
    return;
  }
  if (e.target.closest('#add')) {
    const n = newShip(ships, pid); ships.push(n); touch(n); ui.sel[pid] = n.id; saveUi(); rebuild(); renderAll(); toast(`➕ ${n.name}`); return;
  }
  const card = e.target.closest('.card'), act = e.target.closest('[data-act]'); if (!card || !act) return;
  const id = card.dataset.id, x = ships.find((y) => y.id === id); if (!x) return;
  const a = act.dataset.act;
  if (a === 'pick') { selectShip(id); dismissHint(); setStep(2); return; }
  if (a === 'ren') { renaming = id; sureDel = ''; renderBody(); return; }
  if (a === 'renok') { finishRename(); return; }
  if (a === 'del') {
    if (sureDel !== id) { sureDel = id; renderBody(); setTimeout(() => { if (sureDel === id) { sureDel = ''; if (step === 1) renderBody(); } }, 3000); return; }
    sureDel = ''; ships = ships.filter((y) => y.id !== id); changed.delete(id); deleted.add(id); pending.forEach((p, k) => { if (p.id === id) pending.delete(k); });
    dirty = true; flush(); load(); rebuild(); renderAll(); toast(`🗑️ ${x.name}`);
  }
});
function finishRename() {
  const ri = $('#renIn'), x = ships.find((y) => y.id === renaming); renaming = '';
  if (ri && x) { const v = ri.value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, LIMITS.name); if (v && v !== x.name) { x.name = v; touch(x); } }
  renderAll();
}
$('#body').addEventListener('keydown', (e) => { if (e.target.id !== 'renIn') return; if (e.key === 'Enter') { e.preventDefault(); finishRename(); } if (e.key === 'Escape') { renaming = ''; renderBody(); } });
// hover preview (mouse only; touch = tap swaps, and the swap shows the same +/- for 2.6 s)
$('#body').addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse' || step !== 2) return; const o = e.target.closest('.opt'); if (!o) return; const s = cur(); const h = s.parts[slot] === o.dataset.id ? null : { slot, id: o.dataset.id }; if (JSON.stringify(h) === JSON.stringify(hover)) return; hover = h; renderStats(); rebuild(); });
$('#body').addEventListener('pointerout', (e) => { if (e.pointerType !== 'mouse' || !hover) return; const o = e.target.closest('.opt'); if (o && o.contains(e.relatedTarget)) return; hover = null; renderStats(); rebuild(); });
// tap a stat → its name + meaning (works on touch; title= alone would not)
let popT = 0;
$('#stats').addEventListener('click', (e) => {
  const b = e.target.closest('.stat'); if (!b) return; const r = STAT_ROWS.find((x) => x.key === b.dataset.k);
  const pop = $('#pop'); pop.textContent = `${r.icon} ${r.label} — ${STAT_HELP[r.key]}`; pop.hidden = false;
  const q2 = b.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, q2.left + q2.width / 2 - pw / 2)) + 'px';
  pop.style.top = (q2.top - ph - 8 > 4 ? q2.top - ph - 8 : q2.bottom + 8) + 'px';
  clearTimeout(popT); popT = setTimeout(() => { pop.hidden = true; }, 2200);
});
let toastT = 0;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1400); }

// ---------- first-run coach bubble (one, remembered) ----------
const hintSeen = () => lsGet(LS_HINT) === '1';
function dismissHint() { if (!hintSeen()) lsSet(LS_HINT, '1'); $('#hint').hidden = true; }
$('#hintX').addEventListener('click', dismissHint);
function placeHint() {
  const h = $('#hint'); if (hintSeen() || demoOn) { h.hidden = true; return; }
  const tgt = step === 1 ? document.querySelector('.card .pick') : document.querySelector('.opt:not(.on)');
  if (!tgt) { h.hidden = true; return; }
  $('#hintTxt').textContent = step === 1 ? '👆 Tap your ship to change it' : '👆 Tap a part to put it on';
  h.hidden = false;
  const r = tgt.getBoundingClientRect(), hh = h.offsetHeight, hw = h.offsetWidth;
  const below = !(r.top - hh - 12 > ($('#body').getBoundingClientRect().top - 40)) && r.bottom + 12 + hh < innerHeight - 76;
  h.classList.toggle('below', !below);
  h.style.left = Math.max(8, Math.min(innerWidth - hw - 8, r.left + 12)) + 'px';
  h.style.top = (below ? r.bottom + 10 : Math.max(8, r.top - hh - 10)) + 'px';
}
addEventListener('resize', () => { placeHint(); $('#pop').hidden = true; });

// ---------- go ----------
load(); syncSpin(); resize(); rebuild(); renderAll(); requestAnimationFrame(frame);
setTimeout(placeHint, 60);
// test / game hook (read-only helpers + a pixel probe for the 3D view)
window.__bs = {
  get ship() { return cur(); }, get ships() { return myShips(); }, get step() { return step; }, get slot() { return slot; }, get dirty() { return dirty; },
  get demo() { return demo.counts; }, get craftSource() { return demo.craftSource; }, get craftNames() { return demo.craftNames; },
  thumbPair(parts, slot) { return { img: thumb(parts, slot), mask: thumbMask(parts, slot) }; },
  shieldLook() { const m = shipObj && shipObj.userData.shield; return m ? { fill: m.material.opacity, rim: !!m.material.uniforms, demo: demo.shieldOpacity, foe: demo.foeShieldOpacity, foeFlashes: demo.foeFlashes, rest: demo.restShield } : null; }, get demoOn() { return demoOn; }, stats: () => battleshipStats(cur()), flush: () => flush(),
  pixels() { renderer.render(scene, camera); const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let n = 0; for (let i = 3; i < px.length; i += 16) if (px[i] > 0) n++; return { lit: n, total: Math.round(w * h / 4) }; },
  ready: true,
};
