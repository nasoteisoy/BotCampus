// Conquest Commander v1: start screen, game loop, commander input (marks, stars, rally), HUD, pings, end screen.
import { View, flagCanvas, lookThumb, disposeThumbs, TEAM_COLOR } from './render.js';
import { Sim, CFG } from './sim.js';
import { MAP, heightAt } from './map.js';
import { loadArmies, defaultLooksFor, randomNation, randomLooks, statsOf, mulberry32 } from './data.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); for (const k of [].concat(kids)) if (k != null) e.append(k); return e; };
const MARK_ICON = { attack: '⚔️', defend: '🛡️', ignore: '🚫' };

// ---------- device profile ----------
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
if (IS_TOUCH) document.body.classList.add('touch');
const view = new View($('#app'), { low: IS_TOUCH });
addEventListener('resize', () => view.resize());

// ---------- state ----------
const G = { state: 'start', sim: null, paused: false, speed: 1, sel: -1, rallyMode: false, opts: null, pings: [], frames: [], longFrames: 0 };
const armies = loadArmies();
const pick = { nation: armies.active, looks: new Set(), enemy: null, diff: 'normal' };

// ---------- start screen ----------
const looksOf = (nid) => { const l = armies.looks.filter((x) => x.nationId === nid); return l.length ? l : defaultLooksFor(nid); };
const thumbCache = new Map();
function thumbOf(nation, look) {
  const k = nation.id + '|' + JSON.stringify(look.st);
  if (!thumbCache.has(k)) thumbCache.set(k, lookThumb(nation, look.st) || look.thumb || '');
  return thumbCache.get(k);
}
function nationChip(n, on, onClick) {
  const c = flagCanvas(n, 60), b = h('button', { className: 'chip' + (on ? ' on' : ''), title: n.name }, [c, h('span', { textContent: n.name })]);
  b.dataset.id = n.id; b.addEventListener('click', onClick); return b;
}
function renderStart() {
  const my = $('#myNations'); my.replaceChildren(...armies.nations.map((n) => nationChip(n, n.id === pick.nation, () => { pick.nation = n.id; pick.looks.clear(); if (pick.enemy === n.id) pick.enemy = null; renderStart(); })));
  const nat = armies.nations.find((n) => n.id === pick.nation) || armies.nations[0];
  const looks = looksOf(nat.id);
  if (!pick.looks.size) looks.slice(0, 6).forEach((l) => pick.looks.add(l.id));
  $('#myLooks').replaceChildren(...looks.map((l) => {
    const s = statsOf(l.st), url = thumbOf(nat, l);
    const b = h('button', { className: 'look' + (pick.looks.has(l.id) ? ' on' : ''), title: `${l.name} · ${s.cls === 'heavy' ? 'Heavy' : 'Trooper'} · 💰${s.cost} ⚡${s.power}` }, [
      url ? h('img', { src: url, alt: '' }) : h('div', { className: 'noimg', textContent: '🪖' }),
      h('b', { className: 'cls', textContent: s.cls === 'heavy' ? '🚀' : '🔫', title: s.cls === 'heavy' ? 'Heavy' : 'Trooper' }),
      l.icon ? h('b', { className: 'ico', textContent: l.icon }) : null,
      h('span', { textContent: l.name }), h('em', { textContent: `💰${s.cost}` })]);
    b.dataset.id = l.id;
    b.addEventListener('click', () => {
      if (pick.looks.has(l.id)) { if (pick.looks.size > 1) pick.looks.delete(l.id); }
      else if (pick.looks.size < 6) pick.looks.add(l.id); else toast('6 max');
      renderStart();
    });
    return b;
  }));
  $('#lookCount').textContent = `${pick.looks.size}/6`;
  const others = armies.nations.filter((n) => n.id !== nat.id);
  if (pick.enemy && pick.enemy !== 'random' && !others.some((n) => n.id === pick.enemy)) pick.enemy = null;
  if (!pick.enemy) pick.enemy = others[0] ? others[0].id : 'random';
  const rnd = h('button', { className: 'chip' + (pick.enemy === 'random' ? ' on' : ''), title: 'Random' }, [h('span', { textContent: '🎲 Random' })]);
  rnd.dataset.id = 'random'; rnd.addEventListener('click', () => { pick.enemy = 'random'; renderStart(); });
  $('#enemyNations').replaceChildren(...others.map((n) => nationChip(n, n.id === pick.enemy, () => { pick.enemy = n.id; renderStart(); })), rnd);
  $$('#diff [data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === pick.diff));
  $('#src').innerHTML = armies.source === 'customizer'
    ? `📥 ${escapeHTML(armies.player)} · army from <a href="../trooper-custom/">🪖 Trooper Customizer</a>`
    : `No saved army yet → default armies. Make your own in <a href="../trooper-custom/">🪖 Trooper Customizer</a>`;
}
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
$$('#diff [data-diff]').forEach((b) => b.addEventListener('click', () => { pick.diff = b.dataset.diff; renderStart(); }));
$('#play').addEventListener('click', () => startMatch());

function buildTeams(o) {
  const rng = mulberry32(o.seed || 1);
  const nat = armies.nations.find((n) => n.id === o.nation) || armies.nations[0];
  const all = looksOf(nat.id); let mine = all.filter((l) => o.looks.includes(l.id)).slice(0, 6); if (!mine.length) mine = all.slice(0, 6);
  let enemyNat, enemyLooks;
  const en = o.enemy !== 'random' && armies.nations.find((n) => n.id === o.enemy && n.id !== nat.id);
  if (en) { enemyNat = en; enemyLooks = looksOf(en.id).slice(0, 6); }
  else { enemyNat = randomNation(rng, nat.p); enemyLooks = armies.source === 'default' ? defaultLooksFor(enemyNat.id) : randomLooks(rng, enemyNat.id); }
  return [{ nation: nat, looks: mine }, { nation: enemyNat, looks: enemyLooks }];
}

// ---------- match ----------
function startMatch(o = {}) {
  o = { nation: pick.nation, looks: [...pick.looks], enemy: pick.enemy, difficulty: pick.diff, seed: (Math.random() * 1e9) | 0, ...o };
  G.opts = o;
  const teams = buildTeams(o);
  G.sim = new Sim({ teams, difficulty: o.difficulty, seed: o.seed, cfg: o.cfg || {} });
  view.buildArmies(G.sim.teams, G.sim.cfg.botsPerTeam + 12);
  view.clearFx();
  disposeThumbs();
  G.state = 'playing'; G.paused = false; G.sel = -1; G.rallyMode = false; G.pings.forEach((p) => p.el.remove()); G.pings = [];
  ['#start', '#end', '#pause', '#help'].forEach((s) => $(s).classList.add('hidden'));
  $('#hud').classList.remove('hidden');
  const home = G.sim.posts[0];
  view.cam.yaw = 0; view.cam.dist = view.w < view.h ? 105 : 80; view.cam.x = home.x + 32; view.cam.z = home.z; view.cam.want = null;
  [0, 1].forEach((t) => { const c = $(`.tix.t${t} canvas`); c.getContext('2d').drawImage(flagCanvas(G.sim.teams[t].nation, 32), 0, 0); });
  buildBadges(); closeRadial(); updateHUD(true);
}
function toMenu() {
  G.state = 'start'; G.sim = null; view.disposeArmies(); view.clearFx();
  $('#hud').classList.add('hidden'); $('#badges').replaceChildren(); G.pings.forEach((p) => p.el.remove()); G.pings = [];
  ['#end', '#pause', '#help'].forEach((s) => $(s).classList.add('hidden')); $('#start').classList.remove('hidden');
  renderStart();
}
function endMatch() {
  const S = G.sim, o = S.over; G.state = 'over'; closeRadial();
  const win = o.winner === 0, draw = o.winner === -1;
  $('#endTitle').textContent = draw ? '🤝' : win ? '🏆' : '💀';
  $('#endWhy').textContent = (draw ? 'Draw' : win ? 'Victory' : 'Defeat') + ' · ' + ({ tickets: '🎟️ 0', posts: '🚩 all posts', time: '⏱️ time' }[o.reason] || '');
  const m = Math.floor(S.time / 60), s = Math.floor(S.time % 60);
  const [A, B] = S.teams, owned = (t) => S.posts.filter((p) => p.owner === t).length;
  $('#endStats').innerHTML = `<span></span><span class="h c0">🔵</span><span class="h c1">🔴</span>
    <span>🎟️</span><span class="c0">${A.tickets}</span><span class="c1">${B.tickets}</span>
    <span>🚩</span><span class="c0">${owned(0)}</span><span class="c1">${owned(1)}</span>
    <span>💥</span><span class="c0">${A.kills}</span><span class="c1">${B.kills}</span>
    <span>💀</span><span class="c0">${A.losses}</span><span class="c1">${B.losses}</span>
    <span>⏱️</span><span>${m}:${String(s).padStart(2, '0')}</span><span></span>`;
  $('#end').classList.remove('hidden');
}
$('#again').addEventListener('click', () => startMatch(G.opts ? { ...G.opts, seed: (Math.random() * 1e9) | 0 } : {}));
$('#endMenu').addEventListener('click', toMenu);
function setPause(on) { if (G.state !== 'playing') return; G.paused = on; $('#pause').classList.toggle('hidden', !on); }
$('#pauseBtn').addEventListener('click', () => setPause(true));
$('#resume').addEventListener('click', () => setPause(false));
$('#restart').addEventListener('click', () => { setPause(false); startMatch({ ...G.opts, seed: (Math.random() * 1e9) | 0 }); });
$('#toMenu').addEventListener('click', toMenu);
$('#helpBtn').addEventListener('click', () => { G.paused = true; $('#help').classList.remove('hidden'); });
$('#helpClose').addEventListener('click', () => { $('#help').classList.add('hidden'); G.paused = !$('#pause').classList.contains('hidden'); });
$('#camBtn').addEventListener('click', () => centerOnFight());
$('#rallyBtn').addEventListener('click', () => toggleRally());

function centerOnFight() {
  const S = G.sim; if (!S) return;
  // the post you care most about (highest weight); else your units' center
  let bi = -1, bw = 0; S.posts.forEach((p, i) => { const w = S.weight(S.teams[0], i); if (w > bw) { bw = w; bi = i; } });
  if (bi >= 0) view.focus(S.posts[bi].x, S.posts[bi].z);
}
function toggleRally() {
  const S = G.sim; if (!S) return;
  if (S.teams[0].rally) { S.setRally(0, null); G.rallyMode = false; toast('🚩 ✖'); }
  else { G.rallyMode = !G.rallyMode; if (G.rallyMode) { closeRadial(); toast('🚩 👇'); } }
  updateHUD(true);
}
let toastT = 0;
function toast(s) { const t = $('#toast'); t.textContent = s; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1400); }

// ---------- post badges + radial ----------
function buildBadges() {
  $('#badges').replaceChildren(...G.sim.posts.map((p, i) => {
    const b = h('button', { className: 'badge', 'aria-label': 'Post ' + p.id }, [h('span', { textContent: p.id }), h('i'), h('u')]);
    b.dataset.post = i;
    b.addEventListener('click', (e) => { e.stopPropagation(); openRadial(i); });
    return b;
  }));
  $('#postIcons').replaceChildren(...G.sim.posts.map((p, i) => {
    const b = h('button', { className: 'pi', 'aria-label': 'Post ' + p.id }, [h('span', { textContent: p.id }), h('i')]);
    b.dataset.post = i; b.addEventListener('click', () => { view.focus(p.x, p.z); openRadial(i); });
    return b;
  }));
}
function openRadial(i) {
  if (!G.sim || G.state !== 'playing') return;
  G.rallyMode = false; G.sel = i; $('#radial').classList.remove('hidden'); syncRadial(); updateHUD(true);
}
function closeRadial() { G.sel = -1; $('#radial').classList.add('hidden'); $$('.badge').forEach((b) => b.classList.remove('sel')); }
function syncRadial() {
  if (G.sel < 0) return;
  const m = G.sim.teams[0].marks[G.sel];
  $$('#radial .mk').forEach((b) => b.classList.toggle('on', b.dataset.mark === m.mark));
  $$('#radial .st').forEach((b) => b.classList.toggle('on', +b.dataset.stars === m.stars));
  $$('.badge').forEach((b) => b.classList.toggle('sel', +b.dataset.post === G.sel));
}
function setMark(i, mark, stars) {
  if (!G.sim) return;
  G.sim.setMark(0, i, mark, stars);
  syncRadial(); updateHUD(true);
}
$$('#radial .mk').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setMark(G.sel, b.dataset.mark); }));
$$('#radial .st').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setMark(G.sel, null, +b.dataset.stars); }));
$('#radial .ctr').addEventListener('click', (e) => { e.stopPropagation(); closeRadial(); });
const RADIAL = [['attack', -150], ['defend', -90], ['ignore', -30], [1, 150], [2, 90], [3, 30]];
function placeOverlays() {
  const S = G.sim; if (!S) return;
  const badges = $('#badges').children;
  S.posts.forEach((p, i) => {
    const s = view.project(p.x, heightAt(p.x, p.z) + 9.5, p.z), b = badges[i]; if (!b) return;
    b.style.translate = `${s.x.toFixed(1)}px ${s.y.toFixed(1)}px`;
    b.style.visibility = s.behind ? 'hidden' : '';
    b._sx = s.x; b._sy = s.y;
  });
  if (G.sel >= 0) {
    const b = badges[G.sel], R = Math.min(78, Math.max(66, Math.min(view.w, view.h) * 0.16));
    const cx = Math.max(R + 30, Math.min(view.w - R - 30, b._sx)), cy = Math.max(R + 64, Math.min(view.h - R - 30, b._sy - 23));
    const rad = $('#radial'); rad.style.transform = `translate(${cx}px, ${cy}px)`;
    $$('.rd', rad).forEach((el) => {
      const key = el.dataset.mark || +el.dataset.stars; const ent = RADIAL.find((r) => r[0] === key);
      if (!ent) { el.style.transform = ''; return; }
      const a = ent[1] * Math.PI / 180; el.style.transform = `translate(${(Math.cos(a) * R).toFixed(1)}px, ${(Math.sin(a) * R).toFixed(1)}px)`;
    });
  }
  // pings follow their world spot; offscreen ones stick to the screen edge
  const now = performance.now();
  G.pings = G.pings.filter((p) => { if (now > p.end) { p.el.remove(); return false; } return true; });
  for (const p of G.pings) {
    const s = view.project(p.x, heightAt(p.x, p.z) + 3, p.z), ml = 30, mr = 80, top = 84, bot = 92;  // keep clear of the HUD
    let x = s.x, y = s.y, edge = false;
    if (s.behind) { x = view.w - x; y = view.h - bot; edge = true; }
    if (x < ml || x > view.w - mr || y < top || y > view.h - bot) edge = true;
    x = Math.max(ml, Math.min(view.w - mr, x)); y = Math.max(top, Math.min(view.h - bot, y));
    p.el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`; p.el.classList.toggle('edge', edge);
  }
}
function ping(icon, x, z, color, label = '') {
  if (G.pings.length > 8) { G.pings[0].el.remove(); G.pings.shift(); }
  const el = h('div', { className: 'ping' }, [h('span', { textContent: icon }), label ? h('b', { textContent: label }) : null]);
  el.style.setProperty('--c', color); $('#pings').append(el);
  G.pings.push({ el, x, z, end: performance.now() + 3200, icon });
}
function handleEvents(evs) {
  const S = G.sim;
  for (const e of evs) {
    const post = e.post && S.posts.find((p) => p.id === e.post);
    if (e.type === 'contested' && e.team === 0) ping('⚠️', post.x, post.z, '#ffd65a', post.id);
    else if (e.type === 'captured' && e.team === 0) ping('✅', post.x, post.z, TEAM_COLOR[0], post.id);
    else if ((e.type === 'captured' && e.team === 1) || (e.type === 'neutral' && e.from === 0)) ping('❌', post.x, post.z, TEAM_COLOR[1], post.id);
    else if (e.type === 'squadLost' && e.team === 0) ping('💀', e.x, e.z, TEAM_COLOR[1]);
  }
}

// ---------- HUD ----------
let hudT = 0, lastHud = '';
function updateHUD(force) {
  const S = G.sim; if (!S) return;
  const [A, B] = S.teams;
  const sig = [A.tickets, B.tickets, Math.floor(A.cp), Math.ceil(A.waveT), S.posts.map((p) => p.owner + ':' + p.ctrl.toFixed(2) + ':' + p.n.join()).join(), A.marks.map((m) => m.mark + m.stars).join(), !!A.rally, G.rallyMode].join('|');
  if (!force && sig === lastHud) return; lastHud = sig;
  $('.tix.t0 b').textContent = A.tickets; $('.tix.t1 b').textContent = B.tickets;
  $('.tix.t0').classList.toggle('low', A.tickets <= 20); $('.tix.t1').classList.toggle('low', B.tickets <= 20);
  $('#cpChip b').textContent = Math.floor(A.cp); $('#wave').textContent = '⏱' + Math.max(0, Math.ceil(A.waveT));
  const pis = $('#postIcons').children, badges = $('#badges').children;
  S.posts.forEach((p, i) => {
    const m = A.marks[i], oc = p.owner >= 0 ? TEAM_COLOR[p.owner] : '#6b7077';
    const el = pis[i]; el.style.setProperty('--p', Math.round(Math.abs(p.ctrl) * 100)); el.style.setProperty('--c', TEAM_COLOR[p.ctrl > 0 ? 0 : 1]); el.style.setProperty('--o', oc);
    el.querySelector('i').textContent = MARK_ICON[m.mark];
    const b = badges[i]; b.style.setProperty('--o', oc); b.querySelector('i').textContent = MARK_ICON[m.mark];
    b.querySelector('u').textContent = m.mark === 'ignore' ? '' : '★'.repeat(m.stars);
    b.classList.toggle('hot', p.n[0] > 0 && p.n[1] > 0);
  });
  $('#rallyBtn').classList.toggle('on', G.rallyMode || !!A.rally);
  $('#rallyBtn').textContent = A.rally ? '🚩✖' : '🚩';
  $('#rallyBtn').style.fontSize = A.rally ? '15px' : '';
}

// ---------- input: mouse + touch + keys ----------
const cv = view.renderer.domElement;
const ptrs = new Map(); let gest = null;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture?.(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) gest = { mode: e.pointerType === 'mouse' && e.button !== 0 ? 'rotate' : 'tap', x0: e.clientX, y0: e.clientY, t0: performance.now(), lx: e.clientX, ly: e.clientY };
  else if (ptrs.size === 2) { const f = two(); gest = { mode: 'pinch', d0: f.d, a0: f.a, dist0: view.cam.dist, yaw0: view.cam.yaw, mx: f.mx, my: f.my }; }
});
function two() { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p || !gest) return;
  p.x = e.clientX; p.y = e.clientY;
  if (gest.mode === 'tap' && Math.hypot(p.x - gest.x0, p.y - gest.y0) > 8) gest.mode = 'pan';
  if (gest.mode === 'pan') { view.pan(p.x - gest.lx, p.y - gest.ly); gest.lx = p.x; gest.ly = p.y; }
  else if (gest.mode === 'rotate') { view.cam.yaw += (p.x - gest.lx) * 0.006; gest.lx = p.x; gest.ly = p.y; }
  else if (gest.mode === 'pinch' && ptrs.size === 2) {
    const f = two(); view.cam.dist = gest.dist0 * gest.d0 / f.d; view.cam.yaw = gest.yaw0 - (f.a - gest.a0);
    view.pan(f.mx - gest.mx, f.my - gest.my); gest.mx = f.mx; gest.my = f.my;
  }
});
function ptrEnd(e) {
  if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
  if (gest && gest.mode === 'tap' && e.type === 'pointerup' && performance.now() - gest.t0 < 600) tap(e.clientX, e.clientY);
  if (!ptrs.size) gest = null; else if (gest && gest.mode === 'pinch') { const [q] = [...ptrs.values()]; gest = { mode: 'pan', lx: q.x, ly: q.y, x0: q.x, y0: q.y }; }
}
cv.addEventListener('pointerup', ptrEnd); cv.addEventListener('pointercancel', ptrEnd);
cv.addEventListener('wheel', (e) => { e.preventDefault(); view.cam.dist *= 1 + Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0012); }, { passive: false });
function tap(x, y) {
  const S = G.sim; if (!S || G.state !== 'playing') return;
  const g = view.pick(x, y); if (!g) return;
  if (G.rallyMode) { S.setRally(0, g.x, g.z); G.rallyMode = false; toast('🚩 ✔'); updateHUD(true); return; }
  let bi = -1, bd = MAP.postR + 3; S.posts.forEach((p, i) => { const d = Math.hypot(p.x - g.x, p.z - g.z); if (d < bd) { bd = d; bi = i; } });
  if (bi >= 0) openRadial(bi); else closeRadial();
}
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (G.state !== 'playing') return;
  if (k === 'escape') { if (G.sel >= 0 || G.rallyMode) { closeRadial(); G.rallyMode = false; updateHUD(true); } else setPause(!G.paused); return; }
  if (G.paused) return;
  if (k === 'tab') { e.preventDefault(); openRadial((G.sel + 1) % G.sim.posts.length); return; }
  if (k === 'r') return toggleRally();
  if (k === ' ') { e.preventDefault(); return centerOnFight(); }
  if (k === 'h') return $('#helpBtn').click();
  if (G.sel >= 0) {
    const m = G.sim.teams[0].marks[G.sel];
    if (k === '1') setMark(G.sel, 'attack'); else if (k === '2') setMark(G.sel, 'defend'); else if (k === '3') setMark(G.sel, 'ignore');
    else if (k === '+' || k === '=') setMark(G.sel, null, m.stars + 1); else if (k === '-' || k === '_') setMark(G.sel, null, m.stars - 1);
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
function keyPan(dt) {
  const sp = view.cam.dist * 0.9 * dt; let dx = 0, dz = 0;
  if (keys.has('w') || keys.has('arrowup')) dz -= sp; if (keys.has('s') || keys.has('arrowdown')) dz += sp;
  if (keys.has('a') || keys.has('arrowleft')) dx -= sp; if (keys.has('d') || keys.has('arrowright')) dx += sp;
  if (dx || dz) view.panWorld(dx, dz);
  if (keys.has('q')) view.cam.yaw -= dt * 1.6; if (keys.has('e')) view.cam.yaw += dt * 1.6;
}

// ---------- loop ----------
let last = performance.now(), acc = 0, idleT = 0;
function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.1, raw); last = now;
  if (G.state === 'playing') { G.frames.push(raw * 1000); if (G.frames.length > 600) G.frames.shift(); if (raw > 0.25) G.longFrames++; }
  const S = G.sim;
  if (S && G.state === 'playing' && !G.paused) {
    acc += dt * G.speed; let n = 0;
    while (acc >= CFG.dt && n < 40) { S.step(); acc -= CFG.dt; n++; }
    if (n >= 40) acc = 0;
  }
  if (S) { const evs = S.events; S.events = []; view.consume(evs); handleEvents(evs); }
  if (G.state === 'start') { idleT += dt; view.cam.yaw = Math.sin(idleT * 0.05) * 0.5; view.cam.x = Math.sin(idleT * 0.03) * 30; view.cam.z = 0; view.cam.dist = 120; }
  else keyPan(dt);
  view.update(S, G.paused ? 0 : dt, now);
  placeOverlays();
  if ((hudT -= dt) <= 0) { hudT = 0.12; updateHUD(false); }
  if (S && S.over && G.state === 'playing') endMatch();
  requestAnimationFrame(frame);
}
renderStart();
requestAnimationFrame(frame);

// ---------- debug / test hooks ----------
window.__game = {
  ready: true,
  get state() { return G.state; }, get sim() { return G.sim; }, G, view, armies, pick,
  lowProfile: view.low, pixelRatio: () => view.pixelRatio,
  start: (o) => startMatch(o),
  menu: () => toMenu(),
  setMark: (i, mark, stars) => setMark(i, mark, stars),
  openMenu: (i) => openRadial(i), closeMenu: () => closeRadial(),
  setRally: (x, z) => { G.sim.setRally(0, x, z); updateHUD(true); },
  autoCommand: (on) => { G.sim.autoCmd[0] = !!on; },
  simulate: (sec) => { const S = G.sim; S.simulate(sec); const evs = S.events; S.events = []; handleEvents(evs.slice(-20)); view.clearFx(); updateHUD(true); return { time: S.time, over: S.over }; },
  setSpeed: (n) => { G.speed = n; },
  pause: (on) => setPause(on),
  focus: (x, z, d) => { view.cam.x = x; view.cam.z = z; if (d) view.cam.dist = d; view.cam.want = null; },
  screenOfPost: (i) => { const p = G.sim.posts[i]; return view.project(p.x, heightAt(p.x, p.z), p.z); },
  posts: () => G.sim.posts.map((p) => ({ id: p.id, owner: p.owner, ctrl: +p.ctrl.toFixed(3), n: [...p.n] })),
  teams: () => G.sim.teams.map((T) => ({ tickets: T.tickets, cp: Math.floor(T.cp), kills: T.kills, losses: T.losses, bled: T.bled || 0, rally: T.rally, marks: T.marks.map((m) => ({ ...m })), squads: T.squads.map((s) => s.post), nation: T.nation.name, p: T.nation.p, s: T.nation.s, looks: T.looks.map((l) => ({ name: l.name, cls: l.stats.cls, cost: l.stats.cost })) })),
  units: (t) => G.sim.units.filter((u) => u.alive && (t == null || u.team === t)).map((u) => ({ id: u.id, team: u.team, squad: u.squad, cls: u.cls, x: u.x, z: u.z, gx: u.gx, gz: u.gz, hp: u.hp, look: u.look })),
  frameStats: () => { const f = [...G.frames].sort((a, b) => a - b); return { n: f.length, avg: f.reduce((a, b) => a + b, 0) / (f.length || 1), p95: f[Math.floor(f.length * 0.95)] || 0, max: f[f.length - 1] || 0, long: G.longFrames }; },
  resetFrames: () => { G.frames = []; G.longFrames = 0; },
  renderStats: () => view.stats(),
  atlasHash: (t) => view.armies && view.armies[t].look.hash(),
  pings: () => G.pings.map((p) => p.icon),
};
