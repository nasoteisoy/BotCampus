// Battle of Kerovo: camera, real mouse/touch/keyboard input, HUD and game loop.
// Source parts: parts-library svg-icon-set (icons.js), space-sfx (audio.js), gold-dark-panels
// (css colours), battle-endcard (results layout idea: outcome banner + icon stat tiles).
import { WORLD, VILLAGES, HAMLETS } from './map.js';
import { paintTerrain, shrinkTerrain } from './terrain.js';
import { drawPortrait } from './portraits.js';
import { createBattle, stepBattle, orderMarch, isActive, sideStrength, centroid, corpsUnits, RULES } from './sim.js';
import { createFx, addVolleyFx, addOrderMark, stepFx, drawScene, drawMinimap, corpsCardRect, corpsCentroid, villageLabelBox, hamletLabelBox } from './render.js';
import { icon } from './icons.js';
import { createBattleAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const g = canvas.getContext('2d');
const miniEl = $('mini');
const mg = miniEl.getContext('2d');
const sfx = createBattleAudio();

const view = { s: 0.5, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
const ui = { selected: new Set(), selectedCorps: new Set(), box: null, time: 0, mode: 'pan', speed: 1, hint: 0 };
const art = { terrain: null, portraits: {} };
const mini = { base: null, width: 0, height: 0, dpr: 1 };
let state = null;
let fx = createFx();
let phase = 'start'; // start | play | menu | end
let endTimer = 0;
let lastVolleySound = 0;

/* ---------- camera ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const minScale = () => Math.min(view.w / WORLD.w, view.h / WORLD.h) * 0.95;
const maxScale = () => Math.max(2.6, minScale() * 6);
function clampView() {
  view.s = clamp(view.s, minScale(), maxScale());
  const pad = 70;
  const mw = WORLD.w * view.s, mh = WORLD.h * view.s;
  view.ox = mw + pad * 2 <= view.w ? (view.w - mw) / 2 : clamp(view.ox, view.w - mw - pad, pad);
  view.oy = mh + pad * 2 <= view.h ? (view.h - mh) / 2 : clamp(view.oy, view.h - mh - pad, pad);
}
function centerOn(wx, wy) {
  view.ox = view.w / 2 - wx * view.s;
  view.oy = view.h / 2 - wy * view.s;
  clampView();
}
function zoomAt(px, py, f) {
  const wx = (px - view.ox) / view.s, wy = (py - view.oy) / view.s;
  view.s = clamp(view.s * f, minScale(), maxScale());
  view.ox = px - wx * view.s;
  view.oy = py - wy * view.s;
  clampView();
}
const toWorld = (x, y) => ({ x: (x - view.ox) / view.s, y: (y - view.oy) / view.s });
const toScreen = (x, y) => ({ x: x * view.s + view.ox, y: y * view.s + view.oy });
/** On-screen HUD boxes that can hide the map (bars' own children, rail cards, minimap). */
function hudRects() {
  return [...document.querySelectorAll('#top > *, #objs .obj, #rail > *, #cards .card, #mini')]
    .filter((e) => e.id !== 'objs' && e.id !== 'cards' && !e.hidden)
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width && r.height);
}
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** True when every objective village label is fully on screen and clear of the HUD. */
function villageLabelsClear() {
  const hud = hudRects();
  return VILLAGES.every((v) => {
    const b = villageLabelBox(g, view, v);
    return b.left >= 4 && b.top >= 4 && b.right <= view.w - 4 && b.bottom <= view.h - 4 && !hud.some((r) => overlaps(b, r));
  });
}
/**
 * Start camera: as close as possible, as far west as the labels allow (so the blue army shows),
 * with all three village labels on screen between the top bar and the commander rail.
 */
const HINT_ROOM = 56;
/** Leftmost screen x of the blue start army (with flag tags) and the west-bank hamlet labels. */
function westEdge() {
  const blue = state.units.filter((u) => u.side === 'b').map((u) => u.x * view.s + view.ox - 18);
  const ham = HAMLETS.filter((h) => h.x < 800).map((h) => hamletLabelBox(g, view, h).left);
  return Math.min(...blue, ...ham);
}
const isShortScreen = () => view.h < 430;
function startView() {
  const hud = hudRects();
  const top = Math.max(0, ...hud.filter((r) => r.top < view.h / 2 && r.width < view.w / 2 && r.height < 70).map((r) => r.bottom));
  // leave room above the rail for the first-run "Tap" hint bubble (beside the rail on short screens)
  const bottom = Math.min(view.h, ...hud.filter((r) => r.top > view.h / 2).map((r) => r.top)) - (isShortScreen() ? 0 : HINT_ROOM);
  let s = Math.max(minScale(), Math.min(0.42, Math.max(0.3, (view.h / WORLD.h) * 0.85)));
  for (; ; s *= 0.95) {
    view.s = Math.max(minScale(), s);
    view.ox = 0; view.oy = 0;
    const boxes = VILLAGES.map((v) => villageLabelBox(g, view, v));
    const right = Math.max(...boxes.map((b) => b.right));
    const spanTop = Math.min(...boxes.map((b) => b.top));
    const spanBottom = Math.max(...boxes.map((b) => b.bottom));
    // r2: west edge = the blue army (plus its flags) and the west-bank hamlet labels, so the
    // portrait camera no longer cuts the blue corps or "Pesnaya"/"Brasino" mid-word.
    const left = westEdge();
    view.ox = right - left + 24 <= view.w ? (view.w - left - right) / 2 : view.w - 12 - right;
    view.oy = (top + bottom) / 2 - (spanTop + spanBottom) / 2;
    clampView();
    if ((villageLabelsClear() && westEdge() >= 8) || view.s <= minScale()) break;
  }
}
function resize() {
  const keep = view.w ? toWorld(view.w / 2, view.h / 2) : null;
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.w = window.innerWidth; view.h = window.innerHeight;
  canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
  const r = miniEl.getBoundingClientRect();
  mini.dpr = view.dpr;
  mini.width = miniEl.width = Math.round(r.width * view.dpr);
  mini.height = miniEl.height = Math.round(r.height * view.dpr);
  if (keep) centerOn(keep.x, keep.y); else startView();
}

/* ---------- selection and orders ---------- */
const blueUnits = () => state.units.filter((u) => u.side === 'b' && isActive(u));
function setSelection(list) {
  ui.selected = new Set(list.map((u) => u.id));
  if (list.length) sfx.tap();
  if (list.length && ui.hint === 0) ui.hint = 1;
  tickHud();
}
function refreshSelectedCorps() {
  for (const id of ui.selected) {
    const u = state.units.find((k) => k.id === id);
    if (!u || !isActive(u)) ui.selected.delete(id);
  }
  ui.selectedCorps = new Set(state.corps.filter((c) => {
    const live = corpsUnits(state, c.id);
    return c.side === 'b' && live.length && live.every((u) => ui.selected.has(u.id));
  }).map((c) => c.id));
}
const selectCorps = (id) => setSelection(corpsUnits(state, id));
function orderTo(wx, wy) {
  const list = state.units.filter((u) => ui.selected.has(u.id) && isActive(u));
  if (!list.length) return false;
  orderMarch(state, list, clamp(wx, 20, WORLD.w - 20), clamp(wy, 20, WORLD.h - 20));
  addOrderMark(fx, wx, wy);
  sfx.tap();
  if (ui.hint < 2) { ui.hint = 2; tickHud(); }
  return true;
}
function unitAt(sx, sy, side) {
  const p = toWorld(sx, sy);
  const tol = Math.max(20, 22 / view.s);
  let best = null, bd = tol;
  for (const u of state.units) {
    if (u.side !== side || !isActive(u)) continue;
    const d = Math.hypot(u.x - p.x, u.y - p.y);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
function corpsCardAt(sx, sy) {
  for (const c of state.corps) {
    if (c.side !== 'b') continue;
    const at = corpsCentroid(state, c.id);
    if (!at) continue;
    const r = corpsCardRect(view, at);
    if (sx >= r.x - 4 && sx <= r.x + r.w + 4 && sy >= r.y - 4 && sy <= r.y + r.h + 4) return c;
  }
  return null;
}
let lastTap = { id: null, t: 0 };
function onTap(sx, sy, button) {
  if (phase !== 'play') return;
  const p = toWorld(sx, sy);
  if (button === 2) { orderTo(p.x, p.y); return; }
  const card = corpsCardAt(sx, sy);
  if (card) { selectCorps(card.id); return; }
  const mine = unitAt(sx, sy, 'b');
  if (mine) {
    const now = performance.now();
    if (lastTap.id === mine.id && now - lastTap.t < 380) selectCorps(mine.corps);
    else setSelection([mine]);
    lastTap = { id: mine.id, t: now };
    return;
  }
  const foe = unitAt(sx, sy, 'g');
  if (foe && orderTo(foe.x, foe.y)) return;
  orderTo(p.x, p.y);
}
function boxSelect(b) {
  const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
  const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
  const hits = blueUnits().filter((u) => {
    const s = toScreen(u.x, u.y);
    return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
  });
  if (hits.length) setSelection(hits);
}

/* ---------- pointer input (mouse and touch share one path) ---------- */
const pointers = new Map();
let gesture = null;
let pinch = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  sfx.unlock();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, button: e.button });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = 'pinch';
    ui.box = null;
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (gesture === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    view.ox += mx - pinch.mx; view.oy += my - pinch.my;
    if (pinch.d > 0) zoomAt(mx, my, d / pinch.d);
    clampView();
    pinch = { d, mx, my };
    return;
  }
  if (!gesture && Math.hypot(p.x - p.x0, p.y - p.y0) > 8) {
    gesture = p.button === 0 && ui.mode === 'box' && phase === 'play' ? 'box' : 'pan';
  }
  if (gesture === 'pan') { view.ox += dx; view.oy += dy; clampView(); }
  if (gesture === 'box') ui.box = { x0: p.x0, y0: p.y0, x1: p.x, y1: p.y };
});
function endPointer(e) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (e.type === 'pointerup' && !gesture) onTap(p.x, p.y, p.button);
  if (gesture === 'box' && ui.box) { boxSelect(ui.box); ui.box = null; }
  if (pointers.size === 0) { gesture = null; pinch = null; }
  else if (gesture === 'pinch' && pointers.size === 1) gesture = 'pinch-end';
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

function miniJump(e) {
  const r = miniEl.getBoundingClientRect();
  centerOn(((e.clientX - r.left) / r.width) * WORLD.w, ((e.clientY - r.top) / r.height) * WORLD.h);
}
miniEl.addEventListener('pointerdown', (e) => { miniEl.setPointerCapture(e.pointerId); miniJump(e); });
miniEl.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') miniJump(e); });

const held = new Set();
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) { held.add(k); e.preventDefault(); return; }
  if (phase === 'start' && (k === 'enter' || k === ' ')) { e.preventDefault(); startGame(); return; }
  if (phase === 'end' && (k === 'enter' || k === ' ')) { e.preventDefault(); restart(); return; }
  if (k === 'escape' || k === 'p') {
    e.preventDefault();
    if (phase === 'menu') closeMenu();
    else if (phase === 'play' && k === 'escape' && ui.selected.size) setSelection([]);
    else if (phase === 'play') openMenu();
    return;
  }
  if (phase !== 'play') return;
  if (k === '1' || k === '2' || k === '3') selectCorps(`b${Number(k) - 1}`);
  else if (k === '4') setSelection(blueUnits());
  else if (k === 'f') cycleSpeed();
  else if (k === 'b') toggleMode();
  else if (k === '=' || k === '+') zoomAt(view.w / 2, view.h / 2, 1.2);
  else if (k === '-') zoomAt(view.w / 2, view.h / 2, 1 / 1.2);
});
window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => held.clear());
function panKeys(dt) {
  const v = 600 * dt;
  if (held.has('a') || held.has('arrowleft')) view.ox += v;
  if (held.has('d') || held.has('arrowright')) view.ox -= v;
  if (held.has('w') || held.has('arrowup')) view.oy += v;
  if (held.has('s') || held.has('arrowdown')) view.oy -= v;
  if (held.size) clampView();
}

/* ---------- HUD ---------- */
const btn = (name, label, key) => `${icon(name, { size: 24 })}<span class="lb">${label}${key ? `<span class="kb">${key}</span>` : ''}</span>`;
function toggleMode() {
  ui.mode = ui.mode === 'pan' ? 'box' : 'pan';
  renderMode();
}
function renderMode() {
  $('bMode').innerHTML = ui.mode === 'pan' ? btn('hand', 'Pan', 'B') : btn('box', 'Box', 'B');
  $('bMode').setAttribute('aria-pressed', String(ui.mode === 'box'));
}
function cycleSpeed() {
  ui.speed = ui.speed === 3 ? 1 : ui.speed + 1;
  renderSpeed();
}
function renderSpeed() {
  $('bSpeed').innerHTML = btn('ff', `x${ui.speed}`, 'F');
  $('bSpeed').setAttribute('aria-pressed', String(ui.speed > 1));
}
function soundLabel() { $('bSound').innerHTML = btn(sfx.muted ? 'mute' : 'volume', sfx.muted ? 'Off' : 'Sound'); }

function buildHud() {
  $('bMenu').innerHTML = btn('pause', 'Menu', 'P');
  // Mouse players drag to box-select (right-drag pans); touch players drag to pan by default.
  ui.mode = matchMedia('(pointer:fine)').matches ? 'box' : 'pan';
  renderMode();
  renderSpeed();
  $('bAll').innerHTML = btn('users', 'All', '4');
  $('bClear').innerHTML = btn('x', 'Clear', 'Esc');
  $('bPlay').innerHTML = `${icon('play', { size: 24 })}Play`;
  $('bResume').innerHTML = `${icon('play', { size: 24 })}Go`;
  $('bAgain').innerHTML = `${icon('refresh', { size: 24 })}Again`;
  $('bRestart').innerHTML = btn('refresh', 'Restart');
  $('menuTitle').textContent = 'Paused';
  soundLabel();
  const tile = (cls, ic, text) => `<div class="${cls}">${ic}<span>${text}</span></div>`;
  const blocks = (s) => `<div class="chip"><i class="blk ${s}"></i><i class="blk ${s}"></i><i class="blk ${s}"></i></div>`;
  $('startSteps').innerHTML = [
    tile('step', blocks('b'), 'You'),
    tile('step', blocks('g'), 'Enemy'),
    tile('step', icon('hand', { size: 28 }), 'Tap = pick'),
    tile('step', icon('move', { size: 28 }), 'Tap map = march'),
    tile('step', icon('flag', { size: 28 }), 'Hold 3 villages'),
    tile('step', icon('swords', { size: 28 }), 'Or break them'),
  ].join('');
  $('legend').innerHTML = [
    tile('lg', icon('hand', { size: 26 }), 'Tap = pick'),
    tile('lg', icon('move', { size: 26 }), 'Tap map = march'),
    tile('lg', icon('box', { size: 26 }), 'Box = drag pick'),
    tile('lg', icon('zoom', { size: 26 }), 'Pinch / wheel'),
    tile('lg', icon('flag', { size: 26 }), 'Hold 3 villages'),
    tile('lg', icon('shield', { size: 26 }), 'Villages + forts = cover'),
  ].join('');
  $('objs').innerHTML = state.villages.map((v, i) => `<button class="obj" type="button" data-i="${i}" aria-label="${v.name}">${icon('flag', { size: 24 })}<span class="nm">${v.name}</span></button>`).join('');
  $('cards').innerHTML = state.corps.filter((c) => c.side === 'b').map((c) => `<button class="card" type="button" data-corps="${c.id}" aria-label="Corps ${c.label}"><img alt="" src="${art.portraits[c.id].toDataURL()}"><b>${c.label}</b></button>`).join('');
}

function bindHud() {
  $('bMenu').onclick = () => (phase === 'play' ? openMenu() : null);
  $('bMode').onclick = toggleMode;
  $('bSpeed').onclick = cycleSpeed;
  $('bAll').onclick = () => setSelection(blueUnits());
  $('bClear').onclick = () => setSelection([]);
  $('bPlay').onclick = startGame;
  $('bResume').onclick = closeMenu;
  $('bRestart').onclick = restart;
  $('bAgain').onclick = restart;
  $('bSound').onclick = () => { sfx.setMuted(!sfx.muted); soundLabel(); };
  $('objs').onclick = (e) => {
    const b = e.target.closest('.obj');
    if (b) { const v = state.villages[Number(b.dataset.i)]; centerOn(v.x, v.y); }
  };
  $('cards').onclick = (e) => {
    const b = e.target.closest('.card');
    if (b && phase === 'play') { selectCorps(b.dataset.corps); centerOnSelection(); }
  };
  for (const id of ['bAll', 'bClear', 'bMode', 'bSpeed', 'bMenu', 'bPlay', 'bAgain']) $(id).addEventListener('pointerdown', () => sfx.unlock());
}
function centerOnSelection() {
  const list = state.units.filter((u) => ui.selected.has(u.id));
  if (!list.length) return;
  const at = centroid(list);
  const s0 = toScreen(at.x, at.y);
  if (s0.x < 60 || s0.x > view.w - 60 || s0.y < 90 || s0.y > view.h - 110) centerOn(at.x, at.y);
}

function placeHint() {
  const el = $('hint');
  if (phase !== 'play' || ui.hint >= 2) { el.hidden = true; return; }
  el.hidden = false;
  if (ui.hint === 0) {
    const card = document.querySelector('.card:not([hidden])');
    if (!card) { el.hidden = true; return; }
    el.innerHTML = `${icon('hand', { size: 24 })}Tap`;
    const r = card.getBoundingClientRect();
    if (isShortScreen()) {
      // Short landscape: sit beside the rail so the bubble never covers the map above it.
      const rail = $('rail').lastElementChild.getBoundingClientRect();
      el.className = 'side';
      el.style.left = `${rail.right + 14}px`;
      el.style.top = `${r.top + r.height / 2 - el.offsetHeight / 2}px`;
    } else {
      el.className = '';
      el.style.left = `${r.left + r.width / 2 - el.offsetWidth / 2}px`;
      el.style.top = `${r.top - el.offsetHeight - 14}px`;
    }
  } else {
    el.innerHTML = `${icon('move', { size: 24 })}Tap map`;
    const v = state.villages[1];
    const sp = toScreen(v.x, v.y);
    el.className = '';
    el.style.left = `${clamp(sp.x, 70, view.w - 70) - el.offsetWidth / 2}px`;
    el.style.top = `${clamp(sp.y, 130, view.h - 150) - el.offsetHeight - 14}px`;
  }
}

function tickHud() {
  refreshSelectedCorps();
  document.querySelectorAll('.obj').forEach((b, i) => {
    const v = state.villages[i];
    b.classList.toggle('b', v.owner === 'b');
    b.classList.toggle('g', v.owner === 'g');
    b.classList.toggle('fight', !!v.contested);
  });
  document.querySelectorAll('.card').forEach((b) => {
    const c = state.corps.find((k) => k.id === b.dataset.corps);
    const live = corpsUnits(state, c.id);
    b.hidden = !live.length;
    b.classList.toggle('sel', ui.selectedCorps.has(c.id));
    b.classList.toggle('hit', c.underFire > 0);
    const avg = live.reduce((s, u) => s + u.str, 0) / Math.max(1, live.length);
    b.querySelector('img').style.opacity = String(0.45 + 0.55 * avg);
  });
  $('bClear').style.visibility = ui.selected.size ? 'visible' : 'hidden';
  const tag = $('holdTag');
  if (state.hold.side && !state.result) {
    tag.hidden = false;
    tag.className = state.hold.side;
    tag.innerHTML = `${icon('flag', { size: 18 })}${Math.ceil(RULES.holdSeconds - state.hold.time)}`;
  } else tag.hidden = true;
  placeHint();
}

/* ---------- phases ---------- */
function startGame() {
  sfx.unlock();
  $('ovStart').hidden = true;
  phase = 'play';
  tickHud();
  sfx.bugle(true);
}
function openMenu() { phase = 'menu'; $('ovMenu').hidden = false; $('bResume').focus(); }
function closeMenu() { $('ovMenu').hidden = true; phase = 'play'; }
function restart() {
  state = createBattle(1 + Math.floor(Math.random() * 1e6));
  fx = createFx();
  ui.selected.clear();
  ui.hint = 2;
  endTimer = 0;
  $('ovMenu').hidden = true;
  $('ovEnd').hidden = true;
  startView();
  phase = 'play';
  tickHud();
}
function showEnd() {
  const r = state.result;
  const win = r.winner === 'b';
  const why = {
    hold: ['flag', win ? 'Villages held' : 'Villages lost'],
    rout: ['swords', win ? 'Enemy broken' : 'Army broken'],
    time: ['clock', 'Time up'],
  }[r.why];
  $('endBanner').className = win ? 'win' : 'lose';
  $('endBanner').innerHTML = `<div class="big">${win ? 'Victory' : 'Defeat'}</div><div class="why">${icon(why[0], { size: 24 })}${why[1]}</div>`;
  const held = state.villages.filter((v) => v.owner === 'b').length;
  const losses = (side) => `${Math.round(100 * (1 - sideStrength(state, side) / state.startStrength[side]))}%`;
  const mm = Math.floor(r.time / 60), ss = String(Math.floor(r.time % 60)).padStart(2, '0');
  const st = (ic, val, text) => `<div class="st">${ic}<b>${val}</b><span>${text}</span></div>`;
  $('endStats').innerHTML = [
    st(icon('flag', { size: 24 }), `${held}/3`, 'Villages'),
    st('<i class="blk g"></i>', losses('g'), 'Enemy losses'),
    st('<i class="blk b"></i>', losses('b'), 'Your losses'),
    st(icon('clock', { size: 24 }), `${mm}:${ss}`, 'Time'),
  ].join('');
  $('ovEnd').hidden = false;
  phase = 'end';
  sfx.bugle(win);
  $('bAgain').focus();
}

/* ---------- loop ---------- */
let acc = 0, last = performance.now(), hudClock = 0, frame = 0;
function handleEvents(now) {
  for (const e of state.events) {
    if (e.kind === 'fire') {
      addVolleyFx(fx, e);
      if (now - lastVolleySound > 110) { sfx.volley(); lastVolleySound = now; }
    } else if (e.kind === 'rout') sfx.rout();
    else if (e.kind === 'capture') sfx.bugle(e.side === 'b');
  }
  state.events.length = 0;
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ui.time += dt;
  panKeys(dt);
  if (phase === 'play') {
    acc += dt * ui.speed;
    const step = 1 / 30;
    while (acc >= step) { stepBattle(state, step); acc -= step; }
    handleEvents(now);
    stepFx(fx, dt * ui.speed);
    if (state.result) { endTimer += dt; if (endTimer > 1.2) showEnd(); }
  } else acc = 0;
  drawScene(g, view, state, art, fx, ui);
  if (frame++ % 3 === 0) drawMinimap(mg, mini, state, view);
  hudClock -= dt;
  if (hudClock <= 0) { hudClock = 0.2; tickHud(); }
  requestAnimationFrame(loop);
}

function boot() {
  art.terrain = paintTerrain();
  mini.base = shrinkTerrain(art.terrain, 264);
  state = createBattle(1 + Math.floor(Math.random() * 1e6));
  for (const c of state.corps) art.portraits[c.id] = drawPortrait(c.index + 3, c.side, 96, 120);
  resize();
  window.addEventListener('resize', resize);
  buildHud();
  bindHud();
  tickHud();
  startView();
  $('loading').hidden = true;
  $('bPlay').focus();
  if (new URLSearchParams(location.search).get('dev') === '1') {
    // Read-only peek for QA scripts; input still goes through real pointer and key events.
    window.mapBattle = { get state() { return state; }, get view() { return { ...view }; }, get phase() { return phase; }, toScreen, villageLabelsClear, westEdge, labelBoxes: () => VILLAGES.map((v) => ({ name: v.name, ...villageLabelBox(g, view, v) })) };
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(() => setTimeout(boot, 30));
