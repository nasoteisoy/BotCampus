/* Trainer Quest phone UI: map canvas (fit, ✋ pan/zoom, activity bubbles, on-map battles), goal tracker, Now strip, pops, tutorial, trainer cards, tabs. */
(function () {
'use strict';
const D = TRDoctrine, Q = TQ, $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const art = (id) => TRArt(id);
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } } };
const UI_KEY = 'trainer-quest-ui-v1';
const ui = Object.assign({ speed: 1, flag: 0, drag: false, tab: 'map', pt: 0, tut: 0 }, (() => { try { return JSON.parse(store.get(UI_KEY)) || {}; } catch (e) { return {}; } })());
const saveUi = () => store.set(UI_KEY, JSON.stringify({ speed: ui.speed, flag: ui.flag, pt: ui.pt, tut: ui.tut }));
let W = null, paused = false, acc = 0, lastT = 0, lastSave = 0, bvTi = -1, dirty = true, lastRender = 0;
const fx = [];
function landscape() { return matchMedia('(orientation: landscape) and (min-width: 600px)').matches; }
const fmt = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(x).padStart(2, '0')}`; };
const hpCls = (f) => f > 0.5 ? '' : f > 0.2 ? 'mid' : 'low';
const hpBar = (h, m) => `<div class="hp"><i class="${hpCls(h / m)}" style="width:${Math.max(0, Math.min(100, h / m * 100))}%"></i></div>`;
function toast(t, ms = 1800) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('on'), ms); }

// ---------------------------------------------------------------- save / load / offline catch-up
function save() { if (!W) return; store.set(Q.SAVE_KEY, Q.serialize(W)); lastSave = performance.now(); }
function awaySummary(sum) {
  const R = [['⚔', sum.wins], ['🎯', sum.catches], ['🎁', sum.finds], ['⬆', sum.lv], ['✨', '+' + sum.tp + (sum.tpLost ? ' −' + sum.tpLost : '')], ['😵', sum.faints != null ? sum.faints : sum.losses], ['🌉', sum.bridgeTries]];
  $('awayBox').innerHTML = `<b>🌙 ${fmt(sum.secs)}${sum.capped ? ' (max 2h)' : ''}${sum.areaUp ? ` · 🎉 ${Q.AREAS[sum.area].icon}` : ''}</b>${R.map(([i, v]) => `<span>${i}${v}</span>`).join('')}`;
  $('away').hidden = false; clearTimeout(awaySummary.h); awaySummary.h = setTimeout(() => { $('away').hidden = true; }, 30000);
}
$('awayOk').onclick = () => { $('away').hidden = true; };
function catchUp(secs) { if (!W || secs < 30) return; const s = Q.catchUp(W, secs); W.sink = []; save(); if (s.wins + s.catches + s.finds + s.lv + s.losses + s.bridgeTries > 0 || s.secs >= 60) awaySummary(s); dirty = true; }
function boot() {
  const raw = store.get(Q.SAVE_KEY);
  if (raw) { try { W = Q.deserialize(raw); } catch (e) { W = null; } }
  if (!W) { startScreen(); return; }
  W.sink = []; catchUp((Date.now() - (W.saved || Date.now())) / 1000);
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); hiddenAt = Date.now(); }
  else if (hiddenAt && W) { catchUp((Date.now() - hiddenAt) / 1000); hiddenAt = 0; lastT = performance.now(); }
});
addEventListener('pagehide', save);

// ---------------------------------------------------------------- start screen (pick starters)
function startScreen() {
  const pick = [Q.STARTERS[0], Q.STARTERS[1]]; let diff = 'hard';
  const names = [['🧢', 'Kai'], ['🎀', 'Mia']];
  const draw = () => {
    $('startBox').innerHTML = `<h2>🗺 Trainer Quest</h2><div class="diffSeg">${['hard', 'normal'].map(d => `<button id="diff_${d}" data-diff="${d}" class="${diff === d ? 'on' : ''}">${Q.DIFF[d].icon} ${Q.DIFF[d].name}</button>`).join('')}</div>` + [0, 1].map(i => `<h3>${names[i][0]} ${names[i][1]}</h3><div class="starters">${Q.STARTERS.map(id => `<button data-i="${i}" data-m="${id}" class="${pick[i] === id ? 'on' : ''}" aria-label="${D.DEX[id].name}"><img src="${art(id)}" alt="">${D.TYPES[D.DEX[id].type].icon}</button>`).join('')}<button data-i="${i}" data-m="?" aria-label="Random">🎲</button></div>`).join('') + `<button class="big" id="go">▶ Start</button>`;
    $('startBox').querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { diff = b.dataset.diff; draw(); });
    $('startBox').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const i = +b.dataset.i; pick[i] = b.dataset.m === '?' ? Q.STARTERS[Math.floor(Math.random() * Q.STARTERS.length)] : b.dataset.m; draw(); });
    $('go').onclick = () => { W = Q.newWorld({ starters: pick, diff }); W.sink = []; $('start').hidden = true; save(); dirty = true; toast(`${Q.DIFF[diff].icon} ${D.DEX[pick[0]].name} & ${D.DEX[pick[1]].name}!`); if (!ui.tut) tutStart(); };
  };
  draw(); $('start').hidden = false;
}

// ---------------------------------------------------------------- map rendering
const cv = $('map'), g = cv.getContext('2d'), wrap = $('mapWrap');
let view = { s: 20, ox: 0, oy: 0, w: 0, h: 0, z: 1, panX: 0, panY: 0 }, bg = null, bgKey = '';
const CROP = { x0: 1, y0: 1, w: Q.MW - 2, h: Q.MH - 2 };   // the outer ring is always trees: not drawn, so tiles get bigger
const imgs = {}; const img = (id) => { if (!imgs[id]) { const i = new Image(); i.src = art(id); imgs[id] = i; } return imgs[id]; };
function layout() {
  const r = wrap.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  view.w = r.width; view.h = r.height; view.dpr = dpr;
  view.s0 = Math.max(6, Math.min(r.width / CROP.w, r.height / CROP.h));
  place(); bgKey = ''; dirty = true;
}
// zoom z (1 = whole map fits) and pan, clamped so the map never leaves the screen
function place() {
  const s = view.s0 * view.z, mw = CROP.w * s, mh = CROP.h * s;
  const lx = Math.max(0, (mw - view.w) / 2), ly = Math.max(0, (mh - view.h) / 2);
  view.panX = Math.max(-lx, Math.min(lx, view.panX)); view.panY = Math.max(-ly, Math.min(ly, view.panY));
  view.s = s; view.ox = view.w / 2 + view.panX - (CROP.x0 + CROP.w / 2) * s; view.oy = view.h / 2 + view.panY - (CROP.y0 + CROP.h / 2) * s;
}
addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 200));
function drawBg() {
  const M = Q.mapOf(W), A = Q.AREAS[W.area], P = A.pal, s = view.s, key = W.seed + ':' + W.area + ':' + s + ':' + view.dpr;
  if (bgKey === key) return; bgKey = key;
  bg = document.createElement('canvas'); bg.width = Math.ceil(Q.MW * s * view.dpr); bg.height = Math.ceil(Q.MH * s * view.dpr);
  const b = bg.getContext('2d'); b.scale(view.dpr, view.dpr);
  const r = TR.mulberry(W.seed + W.area);
  for (let y = 0; y < Q.MH; y++) for (let x = 0; x < Q.MW; x++) {
    const c = M.g[y][x], X = x * s, Y = y * s;
    b.fillStyle = { '.': P.g, '"': P.tg, '~': P.w, c: P.c, R: P.r, T: P.g, '=': P.p, W: '#24508f', B: '#8a6a3a', H: '#e9e4d8', G: P.p }[c] || P.g;
    b.fillRect(X, Y, s + 0.5, s + 0.5);
    if (c === '"') { b.strokeStyle = 'rgba(20,60,10,.55)'; b.lineWidth = Math.max(1, s / 14); for (let k = 0; k < 3; k++) { const bx = X + s * (0.2 + k * 0.3); b.beginPath(); b.moveTo(bx, Y + s * 0.85); b.lineTo(bx + s * 0.08, Y + s * 0.35); b.stroke(); } }
    else if (c === '~' || c === 'W') { b.strokeStyle = 'rgba(255,255,255,.35)'; b.lineWidth = Math.max(1, s / 16); b.beginPath(); b.moveTo(X + s * 0.15, Y + s * 0.5); b.quadraticCurveTo(X + s * 0.35, Y + s * 0.3, X + s * 0.55, Y + s * 0.5); b.stroke(); }
    else if (c === 'T') { b.fillStyle = P.t; b.beginPath(); b.arc(X + s / 2, Y + s / 2, s * 0.45, 0, 7); b.fill(); b.fillStyle = 'rgba(255,255,255,.12)'; b.beginPath(); b.arc(X + s * 0.4, Y + s * 0.4, s * 0.18, 0, 7); b.fill(); }
    else if (c === 'R') { b.fillStyle = 'rgba(0,0,0,.3)'; b.fillRect(X + s * 0.15, Y + s * 0.2, s * 0.7, s * 0.6); }
    else if (c === 'c' && r() < 0.3) { b.fillStyle = 'rgba(0,0,0,.18)'; b.fillRect(X + s * r(), Y + s * r(), s * 0.15, s * 0.15); }
    else if (c === 'B') { b.strokeStyle = 'rgba(0,0,0,.35)'; b.lineWidth = 1; for (let k = 1; k < 4; k++) { b.beginPath(); b.moveTo(X, Y + k * s / 4); b.lineTo(X + s, Y + k * s / 4); b.stroke(); } }
  }
  b.fillStyle = '#d64545'; b.fillRect(8 * s, 24 * s, 3 * s, s * 0.7);
  b.font = `${Math.round(s * 1.3)}px system-ui`; b.textAlign = 'center'; b.textBaseline = 'middle'; b.fillText('🏥', 9.5 * s, 25.1 * s);
  b.font = `${Math.round(s * 0.9)}px system-ui`; b.fillText('⛩', 9.5 * s, 0.5 * s);
}
const tileAt = (cx, cy) => ({ x: Math.floor((cx - view.ox) / view.s), y: Math.floor((cy - view.oy) / view.s) });
const px = (x) => view.ox + (x + 0.5) * view.s, py = (y) => view.oy + (y + 0.5) * view.s;
function emoji(t, x, y, size) { g.font = `${Math.round(size)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); }
function render(now) {
  if (!W) return;
  drawBg();
  const s = view.s, AR = W.areas[W.area], M = Q.mapOf(W);
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  g.fillStyle = '#141a0e'; g.fillRect(0, 0, view.w, view.h);
  g.drawImage(bg, view.ox, view.oy, Q.MW * s, Q.MH * s);
  // items
  const hiddenSight = W.trainers.some(T => Q.has(T, 's2'));
  for (const p of AR.spots) if (p.next <= W.t && AR.rev[p.y * Q.MW + p.x]) { if (!p.h) emoji('✨', px(p.x), py(p.y), s * 0.8); else if (hiddenSight) { g.globalAlpha = 0.65; emoji('❔', px(p.x), py(p.y), s * 0.7); g.globalAlpha = 1; } }
  // bridge trainers
  const bt = W.trainers.find(T => T.bridge), ic = ['🥉', '🥈', '🥇', '🎖', '👑'];
  for (let k = 0; k < 5; k++) { const beaten = AR.cleared || (bt && bt.bridge.idx > k) || (bt && bt.bridge.idx === k && bt.battle && bt.battle.win && W.t > bt.battle.start + bt.battle.dur - Q.OUTRO_T); if (!beaten) emoji(ic[k], px(9), py(6 - k), s * 0.85); }
  if (AR.cleared) emoji('✔', px(9), py(4), s);
  // npcs
  for (const n of AR.npcs) { emoji(n.look, px(n.x), py(n.y), s * 0.9); if (n.rest > W.t) emoji('💤', px(n.x) + s * 0.4, py(n.y) - s * 0.45, s * 0.5); }
  // the rival (red ring; ❗ when chasing one of yours)
  const rv = AR.rival; if (rv) { const x = px(rv.x), y = py(rv.y); g.strokeStyle = '#ef3a3a'; g.lineWidth = Math.max(2, s / 9); g.beginPath(); g.arc(x, y, s * 0.46, 0, 7); g.stroke(); emoji(rv.look, x, y, s * 0.8); if (rv.rest > W.t) emoji('💤', x + s * 0.4, y - s * 0.45, s * 0.5); else if (rv.chase >= 0) emoji('❗', x + s * 0.4, y - s * 0.5, s * 0.55); }
  // fog
  g.fillStyle = 'rgba(10,14,8,.62)';
  for (let y = 7; y < Q.MH; y++) for (let x = 0; x < Q.MW; x++) if (!AR.rev[y * Q.MW + x]) g.fillRect(view.ox + x * s, view.oy + y * s, s + 0.5, s + 0.5);
  // planned paths + flags
  W.trainers.forEach(T => {
    if (T.path.length && T.state !== 'battle') {   // dotted line to where they are going + a ring on the target tile
      g.strokeStyle = T.col; g.globalAlpha = 0.75; g.setLineDash([s * 0.2, s * 0.2]); g.lineWidth = Math.max(1.5, s / 9); g.beginPath(); g.moveTo(px(T.x), py(T.y)); for (const p of T.path) g.lineTo(px(p.x), py(p.y)); g.stroke(); g.setLineDash([]);
      const e = T.path[T.path.length - 1]; g.lineWidth = Math.max(2, s / 8); g.beginPath(); g.arc(px(e.x), py(e.y), s * 0.36, 0, 7); g.stroke(); g.globalAlpha = 1;
    }
    const f = W.flags[T.i]; if (f) { g.fillStyle = T.col; g.beginPath(); g.arc(px(f.x), py(f.y) + s * 0.3, s * 0.32, 0, 7); g.fill(); emoji('🚩', px(f.x) + (T.i ? s * 0.12 : -s * 0.12), py(f.y), s * 0.85); }
  });
  // trainers: an activity bubble over each one; a battle shows as a small face-off next to them (HP bars, damage numbers, result)
  drawn.bubbles = []; drawn.boxes = [];
  W.trainers.forEach(T => {
    const x = px(T.x), y = py(T.y), r = T.battle && replay(T);
    g.globalAlpha = T.fainted ? 0.5 : 1;
    g.fillStyle = T.col; g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, s * 0.48, 0, 7); g.fill(); g.stroke();
    emoji(T.icon, x, y, s * 0.7); g.globalAlpha = 1;
    if (r) { faceoff(T, r, x, y, now); return; }
    const l = T.party.find(m => m.hp > 0) || T.party[0]; if (l && !T.fainted) { const im = img(l.id); if (im.complete) g.drawImage(im, x + s * 0.2, y - s * 0.15, s * 0.62, s * 0.62); }
    bubble(T, activity(T, null), x, y);
  });
  // floating icons + damage numbers
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], a = (now - f.t0) / (f.num ? 900 : 1400); if (a >= 1) { fx.splice(i, 1); continue; } const T = W.trainers[f.ti];
    g.globalAlpha = 1 - a * a;
    if (f.num) { const P = foPos[f.ti]; if (P) { const X = f.side === 0 ? P.mx : P.fx, Y = P.y - a * s * 0.9; g.font = `900 ${Math.round(s * 0.62)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(f.num, X, Y); g.fillStyle = f.col; g.fillText(f.num, X, Y); } }
    else if (!T.battle) emoji(f.icon, px(T.x) - s * 0.75, py(T.y) - s * (0.3 + a * 1.2), s * (f.big ? 0.9 : 0.7));
    g.globalAlpha = 1;
  }
}
// what each trainer is doing, as 1-2 icons
const ACT = { flag: ['🚶', '🚩'], fight: ['🌿'], heal: ['🏥'], bridge: ['🌉'], item: ['🎁'], explore: ['🗺'], wander: ['🚶'] };
function activity(T, r) {
  if (r) return r.ev && r.ev.t === 'throw' ? { k: 'throw', ic: [Q.QITEMS[r.ev.ball].icon] } : { k: 'fight', ic: ['⚔'] };
  if (T.fainted || T.state === 'ko') return { k: 'faint', ic: ['😵', '🏥'] };
  if (T.state === 'heal') return { k: 'rest', ic: ['😴'] };
  if (T.state === 'dig') return { k: 'dig', ic: ['⛏'] };
  if (T.found != null && W.t - T.found < 2.5) return { k: 'found', ic: ['🎁'] };
  if (!T.goal) return { k: 'rest', ic: ['😴'] };
  return { k: T.goal.k, ic: ACT[T.goal.k] || ['🚶'] };
}
const FX_IC = new Set(['🎁', '⛏', '⬆', '🌉', '🏅', '🏆', '⭐']);
const drawn = { bubbles: [], boxes: [] }, foPos = {}, lastEv = {};
function rr(x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function bubble(T, a, x, y) {
  const s = view.s, n = a.ic.length, w = s * (0.3 + 0.62 * n), h = s * 0.78, bx = x - w / 2 - s * 0.15, by = y - s * 0.55 - h;
  g.fillStyle = 'rgba(255,255,255,.93)'; g.strokeStyle = T.col; g.lineWidth = Math.max(1.5, s / 12); rr(bx, by, w, h, h / 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - s * 0.12, by + h - 1); g.lineTo(x, by + h + s * 0.2); g.lineTo(x + s * 0.1, by + h - 1); g.fillStyle = 'rgba(255,255,255,.93)'; g.fill();
  a.ic.forEach((ic, k) => emoji(ic, bx + s * 0.15 + s * 0.62 * (k + 0.5), by + h / 2 + 1, s * 0.52));
  drawn.bubbles.push({ ti: T.i, k: a.k, ic: a.ic.join(''), x: bx, y: by, w, h });
}
function faceoff(T, r, x, y, now) {
  const s = view.s, b = r.b, me = sideView(b, r.snap, 0), fo = sideView(b, r.snap, 1), sz = s * 0.95, bw = sz * 2 + s * 0.55, bh = sz + s * 0.42;
  const minX = view.ox + CROP.x0 * s + 2, maxX = view.ox + (CROP.x0 + CROP.w) * s - bw - 2;
  const bx = Math.max(minX, Math.min(maxX, x - bw / 2)), by = Math.max(view.oy + CROP.y0 * s + 2, y - s * 0.55 - bh);
  g.fillStyle = 'rgba(16,20,12,.86)'; g.strokeStyle = { wild: '#5fd35f', npc: '#f2a033', rival: '#ef3a3a', bridge: '#f2c933' }[b.kind] || '#fff'; g.lineWidth = Math.max(1.5, s / 10);
  rr(bx, by, bw, bh, s * 0.25); g.fill(); g.stroke();
  const mx = bx + s * 0.12, fxp = bx + bw - s * 0.12 - sz, sy = by + s * 0.08, im1 = img(me.m.id), im2 = img(fo.m.id);
  const outro = r.el >= Q.INTRO_T + b.turns.length * Q.TURN_T, thr = r.ev && r.ev.t === 'throw', gone = b.caught && outro;
  g.globalAlpha = me.hp > 0 ? 1 : 0.3; if (im1.complete) { g.save(); g.translate(mx + sz, sy); g.scale(-1, 1); g.drawImage(im1, 0, 0, sz, sz); g.restore(); }
  g.globalAlpha = gone ? 0 : thr ? 0.25 : fo.hp > 0 ? 1 : 0.3; if (im2.complete) g.drawImage(im2, fxp, sy, sz, sz); g.globalAlpha = 1;
  const bar = (X, h, m) => { const f = Math.max(0, h / m); g.fillStyle = '#000a'; g.fillRect(X, by + bh - s * 0.24, sz, s * 0.15); g.fillStyle = f > 0.5 ? '#5fd35f' : f > 0.2 ? '#f2c933' : '#ef5a3a'; g.fillRect(X, by + bh - s * 0.24, sz * f, s * 0.15); };
  bar(mx, me.hp, me.m.max); bar(fxp, fo.hp, fo.m.max);
  emoji(thr ? Q.QITEMS[r.ev.ball].icon : '⚔', bx + bw / 2, sy + sz * 0.45, s * (thr ? 0.6 : 0.42));
  if (thr) { const sh = Math.sin(now / 70) * 0.35; g.save(); g.translate(fxp + sz / 2, sy + sz * 0.6); g.rotate(sh); emoji(Q.QITEMS[r.ev.ball].icon, 0, 0, s * 0.6); g.restore(); }
  foPos[T.i] = { mx: mx + sz / 2, fx: fxp + sz / 2, y: sy + sz * 0.3 };
  // damage numbers: one per new hit
  const key = b.start + ':' + (r.ev ? b.turns.findIndex(l => l.includes(r.ev)) + ':' + r.ev.t + (r.ev.amt || '') + (r.ev.side != null ? r.ev.side : '') : '');
  if (r.ev && lastEv[T.i] !== key) { lastEv[T.i] = key; if (r.ev.t === 'dmg' || r.ev.t === 'dot' || r.ev.t === 'self') fx.push({ ti: T.i, num: '−' + r.ev.amt, side: r.ev.side != null ? r.ev.side : 0, col: r.ev.eff > 1 ? '#ffd23a' : '#fff', t0: now }); else if (r.ev.t === 'heal' || (r.ev.t === 'item' && r.ev.amt)) fx.push({ ti: T.i, num: '+' + r.ev.amt, side: r.ev.side != null ? r.ev.side : 0, col: '#7dff7d', t0: now }); }
  const res = outro ? (b.caught ? Q.QITEMS[b.ball || 'net'].icon : b.win ? '✅' : '❌') : null;
  if (res) { g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(bx + bw / 2, by - s * 0.05, s * 0.45, 0, 7); g.fill(); emoji(res, bx + bw / 2, by - s * 0.03, s * 0.62); }
  drawn.boxes.push({ ti: T.i, kind: b.kind, res, foe: fo.m.id, x: bx, y: by, w: bw, h: bh });
}

// ---------------------------------------------------------------- battle replay (trainer cards, map mini-banner, big view)
const ST_IC = TR.STAT_IC;
function replay(T) {
  const b = T.battle; if (!b) return null;
  const el = W.t - b.start; let snap = b.snap0, ev = null;
  if (el >= Q.INTRO_T) {
    const k = Math.min(b.turns.length - 1, Math.floor((el - Q.INTRO_T) / Q.TURN_T)), list = b.turns[k] || [];
    const frac = Math.min(0.999, ((el - Q.INTRO_T) - k * Q.TURN_T) / Q.TURN_T);
    const prev = k > 0 ? b.turns[k - 1] : null; if (prev && prev.length && prev[prev.length - 1].snap) snap = prev[prev.length - 1].snap;
    if (list.length) { const j = Math.min(list.length - 1, Math.floor(frac * list.length)); ev = list[j]; if (ev.snap) snap = ev.snap; }
    if (el - Q.INTRO_T >= b.turns.length * Q.TURN_T) { const last = b.turns[b.turns.length - 1] || []; ev = last[last.length - 1] || ev; if (ev && ev.snap) snap = ev.snap; }
  }
  return { b, snap, ev, el };
}
function evText(e, b) {
  if (!e) return '⚔ ' + esc(b.foeIcon + ' ' + (b.kind === 'wild' ? b.foe[0].name + ' Lv' + b.foe[0].lv : b.foeName));
  const who = (x) => esc(x.mon || '');
  switch (e.t) {
    case 'use': return `${who(e)} ➜ ${esc(e.move)}`;
    case 'dmg': return `💥 ${who(e)} −${e.amt}${e.eff > 1 ? ' ×' + e.eff + '!' : e.eff < 1 ? ' ×' + e.eff : ''}${e.crit ? ' crit!' : ''}`;
    case 'miss': return `${who(e)} miss`;
    case 'faint': return `💀 ${who(e)}`;
    case 'status': return `${ST_IC[e.s]} ${who(e)}`;
    case 'switch': return `🔁 ${who(e)}`;
    case 'item': return `${(Q.QITEMS[e.item] || {}).icon || '🎒'} ${who(e)}${e.amt ? ' +' + e.amt : ''}`;
    case 'heal': return `💚 ${who(e)} +${e.amt}`;
    case 'skip': return `${ST_IC[e.why] || '…'} ${who(e)}`;
    case 'wake': return `☀ ${who(e)}`;
    case 'boost': return `${e.d > 0 ? '📈' : '📉'} ${who(e)} ${e.k}`;
    case 'dot': return `${ST_IC[e.s]} ${who(e)} −${e.amt}`;
    case 'throw': return `${Q.QITEMS[e.ball].icon} ${'•'.repeat(e.shakes)} ${e.ok ? '✔ ' + who(e) + '!' : '✖'}`;
    case 'end': return b.caught ? '🎯 caught!' : e.winner === 0 ? '🏆' : e.winner === 1 ? '💀' : '💨';
    case 'self': return `💫 ${who(e)} −${e.amt}`;
    default: return '…';
  }
}
function sideView(b, snap, si) {
  const S = snap[si], list = si ? b.foe : b.me, i = S.act, m = list[i] || list[0];
  return { m, hp: S.hp[i], st: S.st[i] };
}
function openBv(ti) { bvTi = ti; $('bv').hidden = false; renderBv(); }
$('bvX').onclick = () => { bvTi = -1; $('bv').hidden = true; };
function renderBv() {
  if (bvTi < 0) return; const T = W.trainers[bvTi];
  if (!T.battle) { $('bvTitle').textContent = `${T.icon} ${T.name}`; $('bvCap').textContent = { ko: '😵', heal: '💗 🏥', dig: '⛏' }[T.state] || '🚶 …'; $('bvBall').className = 'ball'; return; }
  const r = replay(T), me = sideView(r.b, r.snap, 0), fo = sideView(r.b, r.snap, 1);
  $('bvTitle').textContent = `${T.icon} ${T.name}  ${r.b.kind === 'bridge' ? '🌉 ' + (r.b.idx + 1) + '/5' : r.b.kind === 'npc' ? '🏅' : '🌿'}  vs ${r.b.foeIcon}`;
  const setImg = (el, id) => { const src = art(id); if (el.dataset.id !== id) { el.src = src; el.dataset.id = id; } };
  setImg($('bvM'), me.m.id); setImg($('bvF'), fo.m.id);
  $('bvM').style.opacity = me.hp > 0 ? 1 : 0.25; $('bvF').style.opacity = fo.hp > 0 ? (r.ev && r.ev.t === 'throw' ? 0.15 : r.b.caught && r.ev && r.ev.t === 'end' ? 0 : 1) : 0.25;
  $('bvMT').innerHTML = `<b>${esc(me.m.name)}</b> Lv${me.m.lv} ${me.st ? ST_IC[me.st] : ''}${hpBar(me.hp, me.m.max)}<span class="sub">${me.hp}/${me.m.max}</span>`;
  $('bvFT').innerHTML = `<b>${esc(fo.m.name)}</b> Lv${fo.m.lv} ${fo.st ? ST_IC[fo.st] : ''}${hpBar(fo.hp, fo.m.max)}`;
  const ball = $('bvBall'); if (r.ev && r.ev.t === 'throw') { ball.textContent = Q.QITEMS[r.ev.ball].icon; ball.className = 'ball on'; } else if (r.b.caught && r.ev && r.ev.t === 'end') { ball.textContent = Q.QITEMS[r.b.ball || 'net'].icon; ball.className = 'ball'; ball.style.display = 'block'; } else { ball.className = 'ball'; ball.style.display = ''; }
  $('bvCap').innerHTML = evText(r.ev, r.b);
}

// ---------------------------------------------------------------- top bar + cards
function renderTop() {
  const A = Q.AREAS[W.area], AR = W.areas[W.area];
  const h = `${A.icon} <span>${W.area + 1}</span> <small>${Q.DIFF[W.diff].icon}</small>${W.champion ? ' 🏆' : ''}`;
  if ($('areaChip').innerHTML !== h) $('areaChip').innerHTML = h;
  $('pause').textContent = paused ? '▶' : '⏸'; $('pause').classList.toggle('on', paused);
  if ($('spd').textContent !== '×' + ui.speed) $('spd').textContent = '×' + ui.speed; $('spd').classList.toggle('on', ui.speed > 1);
  const mini = (id, h, m, cls = '') => `<span class="mini ${cls}"><img src="${art(id)}" alt="">${hpBar(h, m)}</span>`;
  const html = W.trainers.map(T => {
    if (T.battle) { const r = replay(T), me = sideView(r.b, r.snap, 0), fo = sideView(r.b, r.snap, 1);
      return `<button class="tcard fight" data-card="${T.i}" data-bv="${T.i}" aria-label="Watch ${esc(T.name)}'s battle"><span class="ic">${T.icon}</span><span class="vs">${mini(me.m.id, me.hp, me.m.max, 'me')}<span>${r.b.kind === 'bridge' ? '🌉' : r.b.kind === 'npc' ? '🏅' : '⚔'}</span>${mini(fo.m.id, fo.hp, fo.m.max)}</span><span class="tp">⤢</span></button>`; }
    const st = T.bridge ? '🌉' : T.fainted ? '😵' : ({ ko: '😵', heal: '😴', dig: '⛏' }[T.state] || '');
    return `<button class="tcard" data-card="${T.i}" aria-label="${esc(T.name)}"><span class="ic">${T.icon}</span><span class="tp">✨${T.tp}</span><span class="minis">${T.party.map(m => mini(m.id, m.hp, m.max)).join('')}</span>${st ? `<span class="ic">${st}</span>` : ''}</button>`;
  }).join('');
  if (renderTop.last !== html) { $('cards').innerHTML = html; renderTop.last = html; }
  renderGoal(); renderNow();
  const canBuy = W.trainers.some(T => Q.TREES.some(tr => tr.tiers.some(x => Q.canBuy(T, x.id))));
  const tb = document.querySelector('#nav [data-tab="traits"]'); const dot = canBuy ? '<span class="dot">!</span>' : ''; if (tb.innerHTML !== '🧬' + dot) tb.innerHTML = '🧬' + dot;
}
// ---------------------------------------------------------------- goal tracker: the next Bridge step, levels, honest readiness (simulated) and when each trainer will try
const BIC = ['🥉', '🥈', '🥇', '🎖', '👑'];
let rdAt = 0; const rdLast = {};
function ready(T) {   // simulated clear chance (12 full Bridge runs, cached in core); throttled so a level-up never stalls a frame twice
  const now = performance.now(); if (rdLast[T.i] && now - rdAt < 1200) return rdLast[T.i];
  rdAt = now; return (rdLast[T.i] = Q.readiness(W, T));
}
function intentTxt(it) { return it.k === 'smart' ? '🎯50%' : it.k === 'blind' ? `🎲Lv${it.need}` : it.k === 'team' ? `🚫${it.need}🐾` : it.k === 'cool' ? '⏳' + fmt(it.left) : it.k === 'on' ? '🌉!' : '✔'; }
function goalInfo() {
  const AR = W.areas[W.area], on = W.trainers.find(T => T.bridge), k = AR.cleared ? 5 : on ? on.bridge.idx : 0;
  const top = Math.max(...W.trainers.map(T => Q.avgLv(T)));
  return { AR, k, best: AR.best || 0, team: Math.round(top), need: Math.round(Q.bridgeLv(W.area, W)),
    tr: W.trainers.map(T => { const r = AR.cleared ? { p: 1 } : ready(T), it = Q.bridgeIntent(W, T); return { i: T.i, icon: T.icon, p: r.p, stage: r.stage, it, when: intentTxt(it) }; }) };
}
function renderGoal() {
  const G = goalInfo(); let h;
  if (G.AR.cleared) h = W.champion ? '<span class="g0">🏆 Champion!</span>' : `<span class="g0">🌉✔ → ${Q.AREAS[Math.min(Q.AREAS.length - 1, W.area + 1)].icon}</span>`;
  else h = `<span class="g0">🌉${BIC[Math.min(4, G.k)]}<b>${G.k}/5</b></span><span class="lv">⬆${G.team}→${G.need}</span>` + G.tr.map(t => { const p = Math.round(t.p * 100); return `<span class="rd" data-rd="${t.i}" data-p="${p}">${t.icon}<span class="bar"><i class="${p >= 50 ? 'ok' : p >= 25 ? 'mid' : ''}" style="width:${Math.max(3, p)}%"></i><u style="left:50%"></u></span>${p}%<span class="w">${t.when}</span></span>`; }).join('');
  if (renderGoal.h !== h) { $('goal').innerHTML = h; renderGoal.h = h; }
}
$('goal').addEventListener('click', () => setTab(ui.tab === 'goal' ? 'map' : 'goal'));
function panelGoal() {
  const G = goalInfo(), specs = Q.bridgeTeams(W, W.area), AIC = { ace: '🎖', status: '🌀', setup: '📈', gambler: '🎲', healer: '💚', bugkid: '🐛' };
  return `<h2>🌉 ${Q.AREAS[W.area].icon} ${G.AR.cleared ? '✔' : G.k + '/5'} <small style="font-size:12px;color:var(--dim)">${Q.DIFF[W.diff].icon} ${Q.DIFF[W.diff].bridgeMin > 1 ? '2+ 🐾 · ' : ''}no 🏥 between</small></h2>` +
    G.tr.map(t => `<div class="row"><span style="font-size:24px">${t.icon}</span><div class="grow"><b>🎯 ${Math.round(t.p * 100)}%</b> <span class="sub">(${12} 🎲 sims · reaches ${BIC[Math.min(4, Math.floor(t.stage || 0))]})</span><div class="hp"><i class="${t.p >= 0.5 ? '' : t.p >= 0.25 ? 'mid' : 'low'}" style="width:${Math.max(2, t.p * 100)}%"></i></div></div><b style="font-size:15px">${t.when}</b></div>`).join('') +
    specs.map((sp, k) => `<div class="row ${G.AR.cleared || k < G.best ? 'own' : ''}"><span style="font-size:24px">${BIC[k]}</span><span title="${sp.ai}">${AIC[sp.ai] || ''}</span><div class="grow chips">${sp.team.map(m => `<span style="display:inline-flex;align-items:center" data-wiki="monster/${m.id}"><img src="${art(m.id)}" alt="" style="width:36px;height:36px">${D.TYPES[D.DEX[m.id].type].icon}${m.lv}</span>`).join('')}</div></div>`).join('') +
    `<div class="sub" style="padding:4px 8px">🎯 = sims · 🎲Lv = tries blindly at that level · 🎯50% = 👁 Read the foe waits for 50% · ⏳ = cooldown after a loss</div>`;
}
// ---------------------------------------------------------------- Now strip: the last 3 big events
function renderNow() {
  const L = W.feed.filter(f => f.now).slice(-3).reverse();
  const h = L.length ? L.map(f => `<div class="ev" data-ti="${f.ti}">${(W.trainers[f.ti] || {}).icon || ''}<span class="bi">${f.icon}</span>${f.mon ? `<img src="${art(f.mon)}" alt="">` : ''}<span class="t">${esc(f.text.replace(/ Lv\d+$/, ''))}</span></div>`).join('') : '<div class="ev"><span class="bi">🚶</span><span class="bi">🌿</span><span class="bi">…</span></div>';
  if (renderNow.h !== h) { $('now').innerHTML = h; renderNow.h = h; }
}
$('now').addEventListener('click', () => setTab('feed'));
// ---------------------------------------------------------------- pops: small celebrations in the map's top-left corner
const POP_IC = { lv: '⬆', move: '📖', trait: '🧬' };
function pop(e) {
  const d = document.createElement('div'); d.className = 'pop ' + e.pop;
  d.innerHTML = `<span>${(W.trainers[e.ti] || {}).icon || ''}</span><span class="bi">${e.pop === 'catch' ? e.icon : POP_IC[e.pop] || e.icon}</span>${e.mon ? `<img src="${art(e.mon)}" alt="">` : ''}<span>${esc(e.text || '')}</span>`;
  const P = $('pops'); P.prepend(d); while (P.children.length > 3) P.lastChild.remove();
  setTimeout(() => d.remove(), 2800);
}
// ---------------------------------------------------------------- tutorial: 5 short steps, skippable, replayable from ⚙
const TUT = [
  { ic: '🚩', t: 'Tap the map → 🧢 walks there', hl: '#flagT' },
  { ic: '⚔', t: 'Fights show next to them: ❤ bars, −dmg, ✅ ❌ 🟣', hl: '#cards' },
  { ic: '✨', t: 'Spend ✨ in 🧬 traits', hl: '#nav [data-tab="traits"]' },
  { ic: '🎯', t: 'This bar = simulated 🌉 win chance', hl: '#goal' },
  { ic: '🌉', t: 'Ready? Tap the 🌉 Bridge on the map', hl: null },
];
const tut = { i: -1 };
function tutStart() { tut.i = 0; showTut(); }
function tutEnd() { tut.i = -1; ui.tut = 1; saveUi(); showTut(); }
function showTut() {
  document.querySelectorAll('.hl').forEach(e => e.classList.remove('hl'));
  if (tut.i < 0) { $('tut').hidden = true; return; }
  const st = TUT[tut.i];
  $('tut').innerHTML = `<div class="tb"><span class="bi">${st.ic}</span><span class="tx">${st.t}</span><button id="tutSkip" aria-label="Skip tutorial">✕</button></div><div class="tn">${tut.i ? '<button id="tutBack" aria-label="Back">◀</button>' : ''}<span class="dots">${TUT.map((_, k) => k === tut.i ? '●' : '○').join('')}</span><button id="tutNext" class="on" aria-label="Next">${tut.i === TUT.length - 1 ? '✔' : '▶'}</button></div>`;
  $('tut').hidden = false; if (st.hl) { const e = document.querySelector(st.hl); if (e) e.classList.add('hl'); }
}
$('tut').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.id === 'tutSkip') tutEnd(); else if (b.id === 'tutBack') { tut.i = Math.max(0, tut.i - 1); showTut(); } else if (b.id === 'tutNext') { if (tut.i >= TUT.length - 1) tutEnd(); else { tut.i++; showTut(); } } });
$('cards').addEventListener('click', (e) => { const c = e.target.closest('[data-card]'); if (!c) return; ui.pt = +c.dataset.card; const T = W.trainers[ui.pt]; if (T.battle) openBv(ui.pt); else setTab('party'); });

// ---------------------------------------------------------------- tabs
function setTab(t) {
  ui.tab = t; document.querySelectorAll('#nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.body.classList.toggle('sheet', t !== 'map'); document.body.classList.toggle('half', t === 'feed' || t === 'why' || t === 'goal');
  $('panel').scrollTop = 0; renderPanel(true);
}
$('nav').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab === ui.tab && b.dataset.tab !== 'map' ? 'map' : b.dataset.tab); });
const trSeg = () => `<div class="seg">${W.trainers.map(T => `<button data-pt="${T.i}" class="${ui.pt === T.i ? 'on' : ''}">${T.icon} ${esc(T.name)} ✨${T.tp}</button>`).join('')}</div>`;
function doctrineBars(T) {
  const d = Q.doctrineOf(T), S = d.score;
  const items = [['⚔', 'dmg', S.dmg], ['🎯', 'KO', S.ko], ['🔺', 'type', S.type], ['🌀', 'status', S.status], ['📈', 'setup', S.setup], ['🛡', 'risk', S.risk], ['✨', 'crit', S.crit], ['🔁', d.sw.never ? 'no switch' : 'switch', ''], ['🧪', `heal@${Math.round(d.items.healAt * 100)}%×${d.items.maxPerBattle}`, ''], ['🎲', 'noise', d.pers.temp]];
  return `<div class="bars">${items.map(([i, k, v]) => `<span>${i} ${k}${v !== '' ? ' ' + Math.round(v * 10) / 10 : ''}</span>`).join('')}<span>👥 cap ${Q.capOf(T)}</span><span>👁 ${Q.sightOf(T)}</span></div>`;
}
function panelTraits() {
  const T = W.trainers[ui.pt];
  return `<h2>🧬 Traits</h2>${trSeg()}${doctrineBars(T)}` + Q.TREES.map(tr => `<h3>${tr.icon} ${tr.name}</h3>` + tr.tiers.map(x => {
    const own = Q.has(T, x.id), can = Q.canBuy(T, x.id), prev = x.tier === 0 || Q.has(T, tr.tiers[x.tier - 1].id), blk = Q.blockedBy(T, x.id), ex = x.ex && Q.TRAIT[x.ex];
    return `<div class="row ${own ? 'own' : prev && !blk ? '' : 'lock'}"><span style="font-size:24px">${x.icon}</span><div class="grow"><b>${esc(x.name)}</b><div class="sub">${esc(x.tip)}${x.down ? ` <span class="down">⚠ ${esc(x.down)}</span>` : ''}${ex ? ` <span class="exb">✕ ${ex.icon} ${esc(ex.name)}</span>` : ''}</div></div>${own ? '<span style="font-size:22px">✔</span>' : `<button data-buy="${x.id}" ${can ? '' : 'disabled'} aria-label="Buy ${esc(x.name)}">${blk ? '✕' : prev ? '' : '🔒'}✨${x.cost}</button>`}</div>`;
  }).join('')).join('');
}
function monRow(T, m, inParty, idx) {
  const lvBase = Q.expFor(m.lv), nxt = Q.expFor(m.lv + 1), xp = Math.max(0, Math.min(100, (m.exp - lvBase) / (nxt - lvBase) * 100));
  const btns = [];
  if (inParty) {
    if (idx > 0) btns.push(`<button class="chip" data-lead="${T.i}:${m.uid}" aria-label="Lead">⬆</button>`);
    if (T.party.length > 1) btns.push(`<button class="chip" data-tobox="${T.i}:${m.uid}" aria-label="To box">📦</button>`);
    if (W.bag.candy > 0) btns.push(`<button class="chip" data-candy="${T.i}:${m.uid}" aria-label="Level candy">🍬</button>`);
  } else W.trainers.forEach(o => { if (o.party.length < Q.capOf(o)) btns.push(`<button class="chip" data-take="${o.i}:${m.uid}" aria-label="To ${esc(o.name)}">→${o.icon}</button>`); });
  return `<div class="row"><img class="sp" src="${art(m.id)}" alt="" data-wiki="monster/${m.id}"><div class="grow"><b data-wiki="monster/${m.id}">${esc(m.name)}</b> Lv${m.lv} ${D.TYPES[m.type].icon} ${m.status ? TR.STAT_IC[m.status] : ''} ${inParty ? '' : (W.trainers[m.ot] || {}).icon || ''}${hpBar(m.hp, m.max)}<div class="xp"><i style="width:${xp}%"></i></div><div class="chips">${m.moves.map(id => `<button class="chip" data-wiki="move/${id}">${D.MOVES[id].type ? D.TYPES[D.MOVES[id].type].icon : '⭘'} ${esc(D.MOVES[id].name)}</button>`).join('')}${btns.join('')}</div></div></div>`;
}
function panelParty() {
  const T = W.trainers[ui.pt];
  return `<h2>🐾 Party</h2>${trSeg()}<h3>${T.icon} ${T.party.length}/${Q.capOf(T)}</h3>${T.party.map((m, i) => monRow(T, m, true, i)).join('')}<h3>📦 Box ${W.box.length}</h3>${W.box.length ? W.box.map(m => monRow(T, m, false)).join('') : '<div class="row sub">—</div>'}`;
}
function panelBag() {
  const keys = Object.keys(Q.QITEMS);
  const use = { potion: '+60', super: '+140', full: 'cure', revive: '50%', net: '×1', star: '×1.6', moon: '×2.4', candy: '+1 Lv' };
  return `<h2>🎒 Bag</h2>` + keys.map(k => { const it = Q.QITEMS[k], heal = k === 'potion' || k === 'super' || k === 'full' || k === 'revive';
    return `<div class="row"><span style="font-size:26px">${it.icon}</span><div class="grow"><b>${esc(it.name)}</b> <span class="sub">${use[k]}</span></div><b style="font-size:18px">×${W.bag[k] || 0}</b>${heal ? W.trainers.map(T => `<button data-use="${k}:${T.i}" ${W.bag[k] > 0 ? '' : 'disabled'} aria-label="Use on ${esc(T.name)}">${T.icon}</button>`).join('') : ''}</div>`; }).join('') + `<div class="sub" style="padding:4px 8px">🧪💊💖 = <span data-wiki="rules" style="text-decoration:underline">📖 rules</span></div>`;
}
function panelDex() {
  const ids = D.MON_IDS, c = ids.filter(id => W.dex[id] && W.dex[id].caught).length, s = ids.filter(id => W.dex[id]).length;
  return `<h2>📕 ${c}/${ids.length} 🎯 · ${s} 👁</h2><div class="dex">${ids.map(id => { const e = W.dex[id]; return `<button data-wiki="monster/${id}" class="${e && e.caught ? '' : 'unseen'}" aria-label="${e ? esc(D.DEX[id].name) : 'Unknown'}">${e ? `<img src="${art(id)}" alt=""><span>${e.caught ? '🎯' + e.caught : '👁'} ${esc(D.DEX[id].name)}</span>` : '<span class="none">❔</span>'}</button>`; }).join('')}</div>`;
}
function panelFeed(n = 80) {
  const tr = (i) => (W.trainers[i] || {}).icon || '';
  return '<h2>📜 Feed</h2>' + (W.feed.length ? '' : '<div class="feedRow"><span class="ic">🚶</span><span class="ic">🌿</span><span class="ic">…</span></div>') + W.feed.slice(-n).reverse().map(f => `<div class="feedRow"><span class="tm">${fmt(f.t)}</span><span>${tr(f.ti)}</span><span class="ic">${f.icon}</span>${f.mon ? `<img src="${art(f.mon)}" alt="" data-wiki="monster/${f.mon}">` : ''}<span class="grow">${esc(f.text)}</span></div>`).join('');
}
function panelWhy() {
  const tr = (i) => (W.trainers[i] || {}).icon || '';
  return `<h2>🧠 Why</h2>` + W.why.slice(-60).reverse().map(w => {
    if (w.bw) { const b = w.bw; return `<div class="why"><b>${tr(w.ti)} ⚔ T${b.turn} ${esc(b.mon)}${b.random ? ' 🎲' : ''}</b><br>${b.top.map(o => `<button class="wk ${o.label === b.pick.label ? 'on' : ''}" data-wiki="${TRWiki.wikiFor(o.label)}">${esc(o.label)} ${Math.round(o.s)}</button>`).join('')}${b.pick.why.length ? `<div class="sub">${esc(b.pick.why.join(', '))}</div>` : ''}</div>`; }
    return `<div class="why"><b>${tr(w.ti)} ${fmt(w.t)} ${esc(w.head)}</b><br>${w.top.map((o, i) => `<span class="opt ${i === 0 ? 'pk' : ''}">${esc(o.label)} ${o.s}</span>`).join(' ')}<div class="sub">→ ${esc(w.note || '')}</div></div>`;
  }).join('');
}
function panelMenu() {
  const S = W.stats;
  return `<h2>⚙ Menu</h2><div class="sum"><div>⏱ ${fmt(W.t)}</div><div>⚔ ${S.wins}</div><div>🎯 ${S.catches}</div><div>🎁 ${S.finds}</div><div>😵 ${S.faints != null ? S.faints : S.losses}</div><div>✨ −${S.tpLost || 0}</div><div>${(W.areas[W.area].rival || {}).look || '😈'} ${S.rivalWins || 0}/${(S.rivalWins || 0) + (S.rivalLosses || 0)}</div><div>🌉 ${S.bridgeWins}/${S.bridgeTries}</div></div>
  <div class="row" style="margin-top:8px"><span style="font-size:24px">${Q.DIFF[W.diff].icon}</span><div class="grow diffSeg">${['hard', 'normal'].map(d => `<button data-diff="${d}" class="${W.diff === d ? 'on' : ''}">${Q.DIFF[d].icon} ${Q.DIFF[d].name}</button>`).join('')}</div></div>
  <div class="row"><span style="font-size:24px">🎓</span><div class="grow">Tutorial</div><button id="tutAgain" aria-label="Replay tutorial">↻</button></div>
  <div class="row"><span style="font-size:24px">💾</span><div class="grow">Save<div class="sub" id="savedAt">${lastSave ? '✔ ' + Math.round((performance.now() - lastSave) / 1000) + 's' : ''}</div></div><button id="saveNow">💾</button></div>
  <div class="row"><span style="font-size:24px">📖</span><div class="grow">Wiki</div><button data-wiki="monsters">📖</button></div>
  <div class="row"><span style="font-size:24px">⚔</span><div class="grow">Trainers</div><a href="../trainers/"><button tabindex="-1">↗</button></a></div>
  <div class="row"><span style="font-size:24px">🗑</span><div class="grow">Reset run</div><button id="reset">${resetArm ? '⚠ ✔?' : '🗑'}</button></div>`;
}
let resetArm = false;
function renderPanel(force) {
  if (!W) return;
  const t = ui.tab, show = t !== 'map' || landscape();
  if (!show) return;
  const key = t === 'map' ? 'feedmini' : t;
  const now = performance.now();
  if (!force && now - (renderPanel.t || 0) < 700) return;
  if (!force && (t === 'traits' || t === 'party' || t === 'bag' || t === 'menu' || t === 'dex' || t === 'goal') && renderPanel.k === key && !dirty) return;
  renderPanel.t = now; renderPanel.k = key;
  let html = t === 'goal' ? panelGoal() : t === 'traits' ? panelTraits() : t === 'party' ? panelParty() : t === 'bag' ? panelBag() : t === 'dex' ? panelDex() : t === 'why' ? panelWhy() : t === 'menu' ? panelMenu() : panelFeed(t === 'map' ? 30 : 80);
  if (t !== 'map' && !landscape()) html = '<button class="pclose" data-close="1" aria-label="Close">✕</button>' + html;
  if (renderPanel.html !== html) { const p = $('panel'), st = p.scrollTop; p.innerHTML = html; p.scrollTop = st; renderPanel.html = html; }
  dirty = false;
}
const uidFind = (uid) => { for (const T of W.trainers) { const m = T.party.find(x => x.uid === uid); if (m) return { m, T, where: 'party' }; } const m = W.box.find(x => x.uid === uid); return m ? { m, where: 'box' } : null; };
$('panel').addEventListener('click', (e) => {
  const b = e.target.closest('button, [data-wiki]'); if (!b) return;
  const d = b.dataset;
  if (d.close) { setTab('map'); return; }
  if (d.wiki) { openWiki(d.wiki); return; }
  if (d.pt != null) { ui.pt = +d.pt; saveUi(); renderPanel(true); return; }
  if (d.buy) { const x = Q.TRAIT[d.buy]; if (Q.buy(W, ui.pt, d.buy)) { save(); } else if (Q.blockedBy(W.trainers[ui.pt], d.buy)) toast(`✕ ${Q.TRAIT[Q.blockedBy(W.trainers[ui.pt], d.buy)].icon}`); dirty = true; renderPanel(true); return; }
  if (d.lead) { const [ti, uid] = d.lead.split(':').map(Number), T = W.trainers[ti], i = T.party.findIndex(m => m.uid === uid); if (i > 0) { const [m] = T.party.splice(i, 1); T.party.unshift(m); } dirty = true; renderPanel(true); return; }
  if (d.tobox) { const [ti, uid] = d.tobox.split(':').map(Number), T = W.trainers[ti]; if (T.state === 'battle') { toast('⚔ …'); return; } const i = T.party.findIndex(m => m.uid === uid); if (i >= 0 && T.party.length > 1) { const [m] = T.party.splice(i, 1); W.box.push(m); } dirty = true; renderPanel(true); return; }
  if (d.take) { const [ti, uid] = d.take.split(':').map(Number), T = W.trainers[ti]; if (T.state === 'battle') { toast('⚔ …'); return; } const i = W.box.findIndex(m => m.uid === uid); if (i >= 0 && T.party.length < Q.capOf(T)) { const [m] = W.box.splice(i, 1); m.ot = ti; T.party.push(m); } dirty = true; renderPanel(true); return; }
  if (d.candy) { const [ti, uid] = d.candy.split(':').map(Number), r = uidFind(uid); if (r && W.bag.candy > 0 && r.m.lv < 50) { W.bag.candy--; Q.feed(W, ti, '🍬', r.m.name); const T = W.trainers[ti]; r.m.exp = Math.max(r.m.exp, Q.expFor(r.m.lv + 1)); Q.gainExp(W, T, r.m, 0); } dirty = true; renderPanel(true); return; }
  if (d.use) { const [k, ti] = d.use.split(':'), T = W.trainers[+ti]; useItem(T, k); dirty = true; renderPanel(true); return; }
  if (d.diff) { W.diff = d.diff; save(); toast(`${Q.DIFF[d.diff].icon} ${Q.DIFF[d.diff].name}`); dirty = true; renderPanel(true); return; }
  if (b.id === 'tutAgain') { setTab('map'); tutStart(); return; }
  if (b.id === 'saveNow') { save(); toast('💾 ✔'); renderPanel(true); return; }
  if (b.id === 'reset') { if (!resetArm) { resetArm = true; renderPanel(true); setTimeout(() => { resetArm = false; }, 4000); return; } resetArm = false; store.del(Q.SAVE_KEY); W = null; fx.length = 0; setTab('map'); startScreen(); return; }
});
function useItem(T, k) {
  if (!(W.bag[k] > 0) || T.state === 'battle') { toast(T.state === 'battle' ? '⚔ …' : '✖'); return; }
  const herb = Q.has(T, 'm4') ? 1.5 : 1;
  let m = null;
  if (k === 'revive') m = T.party.find(x => x.hp <= 0);
  else if (k === 'full') m = T.party.find(x => x.status);
  else m = T.party.filter(x => x.hp > 0 && x.hp < x.max).sort((a, b) => a.hp / a.max - b.hp / b.max)[0];
  if (!m) { toast('✖'); return; }
  W.bag[k]--;
  if (k === 'revive') m.hp = Math.floor(m.max / 2); else if (k === 'full') { m.status = null; m.slp = 0; } else m.hp = Math.min(m.max, m.hp + Math.floor(D.ITEMS[k].heal * herb));
  Q.feed(W, T.i, Q.QITEMS[k].icon, `${m.name}`, { mon: m.id }); toast(`${Q.QITEMS[k].icon} ${m.name}`);
}

// ---------------------------------------------------------------- wiki sheet (the Trainers wiki is the single source of truth)
function openWiki(h) { $('wkF').src = '../trainers/wiki.html?embed=1#' + h; $('wkFull').href = '../trainers/wiki.html#' + h; $('wiki').hidden = false; }
$('wkX').onclick = () => { $('wiki').hidden = true; $('wkF').src = 'about:blank'; };

// ---------------------------------------------------------------- controls: pause, speed, flags (tap), drag (behind ✋)
$('pause').onclick = () => { paused = !paused; toast(paused ? '⏸' : '▶', 700); };
$('spd').onclick = () => { ui.speed = ui.speed === 1 ? 2 : ui.speed === 2 ? 4 : 1; saveUi(); toast('×' + ui.speed, 700); };
const FLAG_IC = ['🚩🧢', '🚩🎀', '🚩👥'];
function syncFlagBar() { $('flagT').textContent = FLAG_IC[ui.flag]; $('flagT').dataset.f = ui.flag; $('drag').classList.toggle('on', ui.drag); document.body.classList.toggle('dragon', ui.drag); }
// map controls fire on pointerup too: a tap right after a swipe on the map can lose its click on some phones
let fbLast = 0;
const fbTap = (e) => {
  const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
  if (e.type === 'click' && performance.now() - fbLast < 600) return; if (e.type === 'pointerup') fbLast = performance.now();
  if (b.id === 'flagT') { ui.flag = (ui.flag + 1) % 3; saveUi(); toast(FLAG_IC[ui.flag], 700); }
  else if (b.id === 'flagX') { Q.setFlag(W, 0, null); Q.setFlag(W, 1, null); toast('🚩✕', 700); }
  else if (b.id === 'drag') { ui.drag = !ui.drag; if (!ui.drag) { view.z = 1; view.panX = view.panY = 0; place(); bgKey = ''; } toast(ui.drag ? '✋ pinch / drag' : '✋ off · whole map', 900); }
  syncFlagBar();
};
$('flagBar').addEventListener('pointerup', fbTap); $('flagBar').addEventListener('click', fbTap);
function snapWalk(p) {
  const M = Q.mapOf(W);
  if (p.y <= 7 && Math.abs(p.x - 9) <= 2 && p.y >= 1) return { x: 9, y: 7 };           // tap the Bridge = go try it
  if (Q.walk(M, p.x, p.y)) return p;
  let best = null, bd = 1e9; for (let y = 7; y < Q.MH; y++) for (let x = 0; x < Q.MW; x++) if (Q.walk(M, x, y)) { const d = Math.abs(x - p.x) + Math.abs(y - p.y); if (d < bd) { bd = d; best = { x, y }; } }
  return bd <= 3 ? best : null;
}
let drag = null, downAt = null, pan = null;
const ptrs = new Map();
const local = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
function zoomAt(z, cx, cy) {
  const old = view.s, nz = Math.max(1, Math.min(3, z));
  // keep the point under the fingers fixed
  const wx = (cx - view.ox) / old, wy = (cy - view.oy) / old;
  view.z = nz; place(); view.panX += cx - (view.ox + wx * view.s); view.panY += cy - (view.oy + wy * view.s); place(); bgKey = '';
}
cv.addEventListener('pointerdown', (e) => {
  if (!W) return; const l = local(e), t = tileAt(l.x, l.y);
  ptrs.set(e.pointerId, l);
  if (ptrs.size === 1) downAt = { x: e.clientX, y: e.clientY, t };
  if (!ui.drag) return;
  cv.setPointerCapture(e.pointerId);
  if (ptrs.size === 2) { drag = null; const [a, b] = [...ptrs.values()]; pan = { pinch: Math.hypot(a.x - b.x, a.y - b.y), z: view.z }; downAt = null; return; }
  let i = -1, bd = 99; W.flags.forEach((f, k) => { if (!f) return; const d = Math.abs(f.x - t.x) + Math.abs(f.y - t.y) - (k === ui.flag ? 0.5 : 0); if (d <= 1.5 && d < bd) { bd = d; i = k; } });
  if (i >= 0) drag = i; else pan = { x: l.x, y: l.y, px: view.panX, py: view.panY };
});
cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return; const l = local(e); ptrs.set(e.pointerId, l);
  if (!ui.drag) return;
  if (drag != null) { const p = snapWalk(tileAt(l.x, l.y)); if (p) W.flags[drag] = p; return; }
  if (pan && pan.pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; zoomAt(pan.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(10, pan.pinch), (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
  if (pan && !pan.pinch) { view.panX = pan.px + l.x - pan.x; view.panY = pan.py + l.y - pan.y; place(); }
});
const ptrEnd = (e) => {
  const had = ptrs.delete(e.pointerId); if (!W || !had) return;
  if (ptrs.size) return;
  const wasPan = pan; pan = null;
  if (drag != null) { const p = W.flags[drag]; Q.setFlag(W, drag, p); drag = null; downAt = null; return; }
  if (e.type === 'pointercancel' || !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12 || (wasPan && wasPan.pinch)) { downAt = null; return; }   // a move without ✋ is ignored
  const t = downAt.t; downAt = null;
  const bt = W.trainers.find(T => T.battle && Math.abs(T.x - t.x) <= 0 && Math.abs(T.y - t.y) <= 1);   // the trainer or its mini-banner
  if (bt) { openBv(bt.i); return; }
  const p = snapWalk(t); if (!p) return;
  const who = ui.flag === 2 ? [0, 1] : [ui.flag];
  for (const i of who) { const f = W.flags[i]; if (f && f.x === p.x && f.y === p.y && who.length === 1) Q.setFlag(W, i, null); else Q.setFlag(W, i, p); }
  fx.push({ ti: who[0], icon: p.y === 7 && p.x === 9 ? '🌉' : '🚩', t0: performance.now() });
  if (tut.i === 0) { tut.i = 1; showTut(); }
};
cv.addEventListener('pointerup', ptrEnd); cv.addEventListener('pointercancel', ptrEnd);
cv.addEventListener('wheel', (e) => { if (!ui.drag) return; e.preventDefault(); const l = local(e); zoomAt(view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), l.x, l.y); }, { passive: false });

// ---------------------------------------------------------------- main loop
function frame(now) {
  const dt = Math.min(0.25, (now - (lastT || now)) / 1000); lastT = now;
  if (W && !paused && $('start').hidden) {
    acc += dt * ui.speed; let n = 0;
    while (acc >= Q.TICK && n++ < 40) { acc -= Q.TICK; const area = W.area; Q.step(W); if (W.area !== area) { toast(`🎉 ${Q.AREAS[W.area].icon} ${Q.AREAS[W.area].name}`, 3000); bgKey = ''; } }
    if (W.sink && W.sink.length) { for (const s of W.sink) { if (FX_IC.has(s.icon)) fx.push({ ti: s.ti, icon: s.icon, big: s.big, t0: now }); if (s.pop && s.pop !== 'faint') pop(s); } W.sink.length = 0; dirty = true; }
    if (now - lastSave > 5000) save();
  }
  if (W) { render(now); renderTop(); renderBv(); renderPanel(false); }
  requestAnimationFrame(frame);
}
// test / debug hooks
window.TQG = { get W() { return W; }, set W(v) { W = v; }, save, boot, catchUp, setTab, openWiki, get paused() { return paused; }, get speed() { return ui.speed; }, get flagMode() { return ui.flag; }, get drag() { return ui.drag; }, get tut() { return tut.i; }, drawn, fxNums: () => fx.filter(f => f.num), activity: (i) => activity(W.trainers[i], W.trainers[i].battle && replay(W.trainers[i])), goalInfo, tutStart, pop, view: () => view, crop: CROP, px: (x, y) => { const r = cv.getBoundingClientRect(); return { x: r.left + px(x), y: r.top + py(y) }; } };
syncFlagBar(); layout(); boot(); requestAnimationFrame(frame);
})();
