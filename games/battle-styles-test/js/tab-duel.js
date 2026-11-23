// Tab 5: Advance Wars style. Square grid, every unit is HP 10. Tap your unit, move, then tap a target: a short 1v1
// cut-in plays, damage comes from a unit-vs-unit matchup table (scaled by HP and terrain stars), and the target
// shoots back if it can. Tanks beat AA, AA shreds planes, guns hit from range and take no counter.
import { icon, unitIcon } from './icons.js';
import { hiCanvas, token, hpBadge, unitSide, boom, loop, ptr, drawFloats, clamp, ICO } from './common.js';

const MAP = ['RRFRRR', 'RRRRRR', 'PPPPPP', 'PPPPPP', 'BBBBBB', 'BBBBBB', 'SSSSSS'];
export const STARS = { R: 3, F: 4, P: 1, B: 0, S: 0 };
const TCOL = { R: '#7d8a56', F: '#8f8a76', P: '#8fa266', B: '#d6c08a', S: '#1f4c78' };
// unit: move, cost on ridge, attack range [min,max] (min > 1 = indirect: no counter, cannot move and fire)
export const UNIT = {
  inf: { mv: 3, rng: [1, 1] }, armor: { mv: 5, rng: [1, 1] }, art: { mv: 4, rng: [2, 3] }, ship: { mv: 2, rng: [2, 5], sea: true }, plane: { mv: 6, rng: [1, 1], air: true },
  rinf: { mv: 0, rng: [1, 1] }, aa: { mv: 0, rng: [1, 2] }, fort: { mv: 0, rng: [1, 2] },
};
// base damage % (attacker row vs defender column), like the Advance Wars chart
export const BASE = {
  inf: { inf: 55, armor: 5, art: 15, aa: 5, fort: 12, plane: 0, ship: 0 },
  armor: { inf: 75, armor: 55, art: 70, aa: 70, fort: 45, plane: 0, ship: 1 },
  art: { inf: 90, armor: 70, art: 75, aa: 75, fort: 55, plane: 0, ship: 40 },
  ship: { inf: 60, armor: 55, art: 65, aa: 60, fort: 50, plane: 0, ship: 50 },
  plane: { inf: 110, armor: 105, art: 105, aa: 75, fort: 95, plane: 0, ship: 85 },
  rinf: { inf: 55, armor: 5, art: 15, plane: 0, ship: 0 },
  aa: { inf: 45, armor: 10, art: 30, plane: 120, ship: 0 },
  fort: { inf: 65, armor: 45, art: 55, plane: 0, ship: 40 },
};
export const TURNS = 5;
const COLS = 6, ROWS = MAP.length;
const kindOf = (t) => (t === 'rinf' ? 'inf' : t);
export function newDuel() {
  let id = 0; const u = (side, t, c, r) => ({ id: id++, side, t, c, r, hp: 10, moved: false, done: false });
  return { turn: 1, over: null, units: [u('blue', 'inf', 1, 5), u('blue', 'armor', 2, 5), u('blue', 'inf', 3, 5), u('blue', 'art', 4, 5), u('blue', 'plane', 0, 5), u('blue', 'ship', 2, 6),
    u('red', 'fort', 2, 0), u('red', 'aa', 3, 1), u('red', 'rinf', 1, 1), u('red', 'rinf', 2, 1), u('red', 'rinf', 4, 0)] };
}
export const unitAt = (s, c, r) => s.units.find((u) => u.hp > 0 && u.c === c && u.r === r);
const live = (s, side) => s.units.filter((u) => u.hp > 0 && u.side === side);
const md = (a, b) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
export function moves(s, u) {
  const U = UNIT[u.t]; if (u.moved || u.done || !U.mv) return [];
  const best = new Map([[`${u.c},${u.r}`, U.mv]]), q = [{ c: u.c, r: u.r, m: U.mv }], out = [];
  while (q.length) {
    const h = q.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = h.c + dc, r = h.r + dr; if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      const T = MAP[r][c]; if (!U.air && !!U.sea !== (T === 'S')) continue;
      const o = unitAt(s, c, r); if (o && o.side !== u.side) continue; // cannot pass enemies
      const left = h.m - (U.air || U.sea ? 1 : T === 'R' || T === 'F' ? 2 : 1); if (left < 0) continue;
      const k = `${c},${r}`; if ((best.get(k) ?? -1) >= left) continue; best.set(k, left); q.push({ c, r, m: left });
      if (!o && !out.some((x) => x.c === c && x.r === r)) out.push({ c, r });
    }
  }
  return out;
}
export function canHit(s, a, t) {
  if (!a || !t || a.done || t.hp <= 0 || a.side === t.side) return false;
  const [lo, hi] = UNIT[a.t].rng, d = md(a, t); if (d < lo || d > hi) return false;
  if (lo > 1 && a.moved) return false; // indirect fire: move OR fire
  return (BASE[a.t][kindOf(t.t)] || 0) > 0;
}
// HP damage: base% x attacker HP/10 x (1 - stars x defender HP / 100), luck adds 0-9%
export function dmg(a, t, luck = 0, aHp = a.hp) {
  const b = BASE[a.t][kindOf(t.t)] || 0, stars = t.t === 'plane' ? 0 : STARS[MAP[t.r][t.c]];
  return clamp(Math.floor(((b + luck) * aHp / 10) * (1 - (stars * t.hp) / 100) / 10), 0, t.hp);
}
export function preview(s, a, t) {
  const them = dmg(a, t), left = t.hp - them;
  const back = left > 0 && UNIT[a.t].rng[0] === 1 && UNIT[t.t].rng[0] === 1 && md(a, t) === 1 && (BASE[t.t][kindOf(a.t)] || 0) > 0 ? dmg(t, a, 0, left) : 0;
  return { them, back };
}
export function strike(s, a, t, rnd = Math.random) {
  if (s.over || !canHit(s, a, t)) return null;
  const h0 = { a: a.hp, t: t.hp };
  const them = dmg(a, t, Math.floor(rnd() * 10)); t.hp -= them;
  let back = 0;
  if (t.hp > 0 && UNIT[a.t].rng[0] === 1 && md(a, t) === 1 && UNIT[t.t].rng[0] === 1 && (BASE[t.t][kindOf(a.t)] || 0) > 0) { back = dmg(t, a, Math.floor(rnd() * 10)); a.hp -= back; }
  a.done = true; a.moved = true; check(s);
  return { a: a.id, t: t.id, them, back, h0 };
}
export function moveTo(s, u, c, r) { if (!moves(s, u).some((h) => h.c === c && h.r === r)) return false; u.c = c; u.r = r; u.moved = true; check(s); return true; }
function check(s) {
  if (live(s, 'blue').some((u) => MAP[u.r][u.c] === 'F' && u.t !== 'plane') || !live(s, 'red').some((u) => u.t !== 'aa')) s.over = 'win';
  else if (!live(s, 'blue').some((u) => u.t !== 'ship' && u.t !== 'plane')) s.over = 'lose';
}
export function redTurn(s, rnd = Math.random) {
  const log = [];
  for (const r of live(s, 'red')) {
    if (s.over) break;
    const tg = live(s, 'blue').filter((b) => canHit(s, r, b)).map((b) => ({ b, p: preview(s, r, b) })).sort((x, y) => (y.p.them - y.p.back) - (x.p.them - x.p.back))[0];
    if (tg && tg.p.them > 0) { const res = strike(s, r, tg.b, rnd); if (res) log.push(res); }
  }
  return log;
}
export function endTurn(s, rnd = Math.random) {
  if (s.over) return [];
  for (const u of s.units) { u.moved = false; u.done = false; }
  const log = redTurn(s, rnd);
  for (const u of s.units) { u.moved = false; u.done = false; }
  if (!s.over) { s.turn++; if (s.turn > TURNS) s.over = 'time'; }
  return log;
}

export default {
  id: 'duel', short: 'DUEL', name: 'Advance Wars duel', icon: 'swords',
  decides: 'Matchups decide it: tank beats AA, AA kills planes, guns hit from range. HP 10.',
  mount({ stage, ctrl, end, sfx }) {
    const S = newDuel(), C = hiCanvas(stage);
    let sel = null, floats = [], busy = false, geo = null, cut = null, queue = [], table = false;
    ctrl.innerHTML = `<button class="btn big" id="w-tab" aria-label="Matchup table">${icon('layers', { size: 28 })}</button>
      <button class="btn big" id="w-end" aria-label="End turn">${icon('skip', { size: 28 })}<span id="w-turn">1/${TURNS}</span></button>`;
    const tblEl = document.createElement('div'); tblEl.className = 'mtable'; tblEl.hidden = true; stage.appendChild(tblEl);
    const A_ROWS = ['inf', 'armor', 'art', 'ship', 'plane'], D_COLS = ['inf', 'aa', 'fort'], R_ROWS = ['rinf', 'aa', 'fort'], B_COLS = ['inf', 'armor', 'art', 'plane', 'ship'];
    const cell = (v) => `<td class="${v >= 70 ? 'hi' : v >= 30 ? 'md' : v > 0 ? 'lo' : 'no'}">${v || '-'}</td>`;
    tblEl.innerHTML = `<table><tr><th class="b"></th>${D_COLS.map((d) => `<th class="r">${unitIcon(ICO[d], 22)}</th>`).join('')}</tr>${A_ROWS.map((a) => `<tr><th class="b">${unitIcon(ICO[a], 22)}</th>${D_COLS.map((d) => cell(BASE[a][d] || 0)).join('')}</tr>`).join('')}</table>
      <table><tr><th class="r"></th>${B_COLS.map((d) => `<th class="b">${unitIcon(ICO[d], 22)}</th>`).join('')}</tr>${R_ROWS.map((a) => `<tr><th class="r">${unitIcon(ICO[kindOf(a)], 22)}</th>${B_COLS.map((d) => cell(BASE[a][d] || 0)).join('')}</tr>`).join('')}</table>`;
    const $ = (id) => ctrl.querySelector(`#${id}`);
    function layout() { const pad = 6, top = 32; const s = Math.min((C.W - pad * 2) / COLS, (C.H - top - pad) / ROWS); geo = { s, ox: (C.W - s * COLS) / 2, oy: top + (C.H - top - pad - s * ROWS) / 2 }; }
    const cc = (c, r) => ({ x: geo.ox + (c + 0.5) * geo.s, y: geo.oy + (r + 0.5) * geo.s });
    function ui() {
      $('w-end').disabled = busy || !!S.over; $('w-turn').textContent = `${Math.min(S.turn, TURNS)}/${TURNS}`;
      $('w-tab').classList.toggle('aim', table); tblEl.hidden = !table;
      window.__BS__.state = { tab: 'duel', turn: S.turn, sel: sel && sel.id, busy, over: S.over, cut: !!cut,
        units: S.units.filter((u) => u.hp > 0).map((u) => ({ id: u.id, side: u.side, t: u.t, c: u.c, r: u.r, hp: u.hp, moved: u.moved, done: u.done })) };
    }
    window.__BS__.cellScreen = (c, r) => { const p = cc(c, r), b = C.cv.getBoundingClientRect(); return { x: b.left + p.x, y: b.top + p.y }; };
    function playCut(res, fast) { cut = { ...res, att: S.units[res.a], def: S.units[res.t], t0: performance.now(), dur: fast ? 1300 : 1700 }; busy = true; sfx('shot'); ui(); }
    function nextCut() { const n = queue.shift(); if (n) playCut(n, true); else { busy = false; after(); } }
    function after() { ui(); if (S.over && !S.done && !cut) { S.done = true; setTimeout(() => end(S.over === 'win', S.over === 'win' ? `${unitIcon('fort', 22)}${icon('flag', { size: 22 })}` : S.over === 'time' ? `${icon('clock', { size: 22 })}${TURNS}/${TURNS}` : icon('skull', { size: 22 })), 400); } }
    C.cv.addEventListener('pointerdown', (e) => {
      if (cut) { cut.t0 -= 5000; return; } // tap skips the cut-in
      if (busy || S.over || !geo) return;
      if (table) { table = false; ui(); return; }
      const p = ptr(C.cv, e), c = Math.floor((p.x - geo.ox) / geo.s), r = Math.floor((p.y - geo.oy) / geo.s);
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) { sel = null; ui(); return; }
      const u = unitAt(S, c, r);
      if (u && u.side === 'blue') { sel = sel === u || u.done ? null : u; sfx('tap'); ui(); return; }
      if (u && u.side === 'red' && sel) {
        if (!canHit(S, sel, u)) { floats.push({ x: p.x, y: p.y - 16, txt: '×', col: '#ff9b8f', t0: performance.now() }); sfx('lose'); return; }
        const res = strike(S, sel, u); sel = null; if (res) playCut(res, false); return;
      }
      if (sel && !u && moveTo(S, sel, c, r)) { sfx('tap'); if (!live(S, 'red').some((t) => canHit(S, sel, t))) { sel.done = true; sel = null; } after(); return; }
      sel = null; ui();
    });
    ctrl.addEventListener('click', onCtrl);
    function onCtrl(e) {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.id === 'w-tab') { table = !table; sfx('tap'); ui(); }
      if (b.id === 'w-end') { if (busy || S.over) return; sel = null; table = false; sfx('tap'); queue = endTurn(S); if (queue.length) nextCut(); else after(); }
    }
    const ro = new ResizeObserver(() => { C.fit(); layout(); }); ro.observe(stage); layout();
    const stop = loop((dt, now) => { draw(now); if (cut && now - cut.t0 > cut.dur) { cut = null; nextCut(); } });
    function draw(now) {
      const { g, W, H } = C; if (!geo) return; const s = geo.s;
      g.fillStyle = '#0f1d31'; g.fillRect(0, 0, W, H);
      const mv = sel ? moves(S, sel) : [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const p = cc(c, r), T = MAP[r][c], x = p.x - s / 2, y = p.y - s / 2;
        g.fillStyle = TCOL[T]; g.fillRect(x, y, s, s); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
        if (T === 'R' || T === 'F') { g.fillStyle = 'rgba(70,60,40,.45)'; g.beginPath(); g.moveTo(x + s * 0.15, y + s * 0.8); g.lineTo(x + s * 0.4, y + s * 0.35); g.lineTo(x + s * 0.62, y + s * 0.8); g.fill(); }
        if (T === 'S') { g.strokeStyle = 'rgba(190,225,255,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + s * 0.15, y + s * 0.6); g.quadraticCurveTo(x + s * 0.32, y + s * 0.45, x + s * 0.5, y + s * 0.6); g.quadraticCurveTo(x + s * 0.68, y + s * 0.75, x + s * 0.85, y + s * 0.6); g.stroke(); }
        for (let k = 0; k < STARS[T]; k++) { g.fillStyle = 'rgba(255,240,170,.75)'; g.beginPath(); g.arc(x + s * 0.12 + k * s * 0.12, y + s * 0.1, s * 0.04, 0, 7); g.fill(); }
        if (mv.some((h) => h.c === c && h.r === r)) { g.fillStyle = 'rgba(120,170,255,.35)'; g.fillRect(x + 2, y + 2, s - 4, s - 4); }
      }
      for (const u of S.units) {
        if (u.hp <= 0) continue; const p = cc(u.c, u.r), tr = s * 0.36;
        const tgt = sel && canHit(S, sel, u);
        token(g, kindOf(u.t) === 'ship' ? 'ship' : kindOf(u.t), p.x, p.y, tr, u.side, { dim: u.side === 'blue' && u.done, ring: sel === u ? '#f5c518' : tgt ? '#ff6b5e' : null });
        hpBadge(g, p.x + tr * 0.85, p.y + tr * 0.8, u.hp, u.side, s * 0.15);
        if (tgt) { const pv = preview(S, sel, u); g.fillStyle = 'rgba(8,12,18,.9)'; g.beginPath(); g.roundRect(p.x - s * 0.45, p.y - s * 0.5, s * 0.9, s * 0.3, 6); g.fill(); g.font = `900 ${Math.round(s * 0.24)}px "Barlow Condensed", Arial Narrow, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffb0a8'; g.fillText(`-${pv.them}${pv.back ? ` / -${pv.back}` : ''}`, p.x, p.y - s * 0.35); }
      }
      g.fillStyle = 'rgba(10,14,20,.85)'; g.beginPath(); g.roundRect(6, 4, 108, 24, 9); g.fill();
      g.fillStyle = '#f5c518'; g.font = '900 17px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(`TURN ${Math.min(S.turn, TURNS)}/${TURNS}`, 14, 17);
      if (cut) drawCut(g, W, H, now);
      drawFloats(g, floats, now);
    }
    // the 1v1 cut-in: attacker panel left, defender right; figures = HP (2 HP per soldier), HP numbers tick down
    function drawCut(g, W, H, now) {
      const k = clamp((now - cut.t0) / cut.dur, 0, 1), ph = H * 0.5, py = (H - ph) / 2;
      const slide = Math.min(1, k * 6);
      g.fillStyle = `rgba(0,0,0,${0.55 * slide})`; g.fillRect(0, 0, W, H);
      const aB = cut.att.side === 'blue';
      for (const [side, u, hp0, lost, left] of [[0, cut.att, cut.h0.a, cut.back, true], [1, cut.def, cut.h0.t, cut.them, false]]) {
        const x0 = side ? W / 2 + (1 - slide) * W / 2 : -(1 - slide) * W / 2, pw = W / 2;
        const col = (left ? aB : !aB) ? '#24406e' : '#6e2424';
        const sky = g.createLinearGradient(0, py, 0, py + ph); sky.addColorStop(0, col); sky.addColorStop(1, '#0d1118'); g.fillStyle = sky; g.fillRect(x0 + 2, py, pw - 4, ph);
        g.fillStyle = u.t === 'ship' ? '#1f4c78' : '#6b7b48'; g.fillRect(x0 + 2, py + ph * 0.78, pw - 4, ph * 0.22);
        const hitAt = left ? 0.62 : 0.3, hp = lost && k > hitAt ? Math.max(0, hp0 - Math.round(lost * clamp((k - hitAt) / 0.15, 0, 1))) : hp0;
        const kind = kindOf(u.t), many = kind === 'inf' ? Math.ceil(hp / 2) : hp > 0 ? 1 : 0, L = Math.min(pw, ph) * (kind === 'inf' ? 0.22 : 0.3);
        for (let i = 0; i < many; i++) {
          const fx = x0 + pw * (left ? 0.25 + (i % 3) * 0.2 : 0.75 - (i % 3) * 0.2), fy = py + ph * (0.74 - Math.floor(i / 3) * 0.16);
          unitSide(g, kind === 'plane' ? 'plane' : kind, fx, kind === 'plane' ? py + ph * 0.35 : fy - (kind === 'inf' ? L * 0.38 : 0), L, u.side, left ? 1 : -1);
        }
        // shots
        const fireK = left ? [0.15, 0.3] : [0.45, 0.62];
        if (k > fireK[0] && k < fireK[1] && (left || cut.back)) { g.strokeStyle = 'rgba(255,236,160,.95)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { const yy = py + ph * (0.5 + i * 0.06); g.beginPath(); g.moveTo(x0 + (left ? pw * 0.4 : pw * 0.6), yy); g.lineTo(left ? W * 0.75 : W * 0.25, yy + (Math.random() - 0.5) * 20); g.stroke(); } }
        if (lost && k > (left ? 0.62 : 0.3) && k < (left ? 0.9 : 0.6)) boom(g, x0 + pw / 2, py + ph * 0.6, ph * 0.18, (k - (left ? 0.62 : 0.3)) / 0.28);
        hpBadge(g, x0 + (left ? 30 : pw - 30), py + 26, hp, u.side, 20);
        g.fillStyle = '#fff'; g.font = '900 15px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.fillText('HP', x0 + (left ? 30 : pw - 30), py + 56);
        if (lost && k > hitAt) { g.fillStyle = '#ffb0a8'; g.font = '900 30px "Barlow Condensed", Arial Narrow, sans-serif'; g.fillText(`-${lost}`, x0 + pw / 2, py + 30); }
      }
      g.fillStyle = '#f5c518'; g.fillRect(W / 2 - 2, py, 4, ph);
    }
    ui();
    return () => { stop(); ro.disconnect(); ctrl.removeEventListener('click', onCtrl); delete window.__BS__.cellScreen; };
  },
};
