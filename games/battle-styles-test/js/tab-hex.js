// Tab 4: Hex of Steel style. Turns on a small hex map: move (enemy zones of control stop you), tap an enemy to see the
// predicted losses ("you -2 / them -4") before you attack, artillery adds support fire, the bomber strikes anywhere
// (the AA gun shoots at it), the battleship fires from the sea. Take the fort hex in 6 turns.
import { icon, unitIcon } from './icons.js';
import { hiCanvas, token, hpBadge, boom, loop, ptr, drawFloats, clamp } from './common.js';

// map: row 0 = ridge top (Red), row 5 = sea (Blue lands from it). R ridge, F fort, J jungle, P plain, B beach, S sea
const MAP = ['RRFRRR', 'RRRJRR', 'PPJPPP', 'PPPPJP', 'BBBBBB', 'SSSSSS'];
export const TER = { R: { def: 2, mv: 2, col: '#7d8a56' }, F: { def: 3, mv: 2, col: '#8f8a76' }, J: { def: 1, mv: 2, col: '#3f6b3a' }, P: { def: 0, mv: 1, col: '#8fa266' }, B: { def: -1, mv: 1, col: '#d6c08a' }, S: { def: 0, mv: 1, col: '#1f4c78' } };
export const UNIT = {
  inf: { atk: 5, def: 5, mv: 2, rng: 1 },
  armor: { atk: 8, def: 5, mv: 3, rng: 1 },
  art: { atk: 6, def: 2, mv: 1, rng: 2, sup: 4 }, // fires 2 hexes away, no counter; adds support fire to attacks next to it
  ship: { atk: 6, def: 6, mv: 1, rng: 4, sea: true }, // big guns reach the ridge from the sea
  rinf: { atk: 5, def: 5, mv: 0, rng: 1 },
  aa: { atk: 2, def: 3, mv: 0, rng: 1, flak: 3 },
  fort: { atk: 6, def: 6, mv: 0, rng: 1 },
};
export const TURNS = 6, PLANE = { atk: 7, hp: 10 };
const COLS = 6, ROWS = MAP.length;
export const ter = (c, r) => TER[MAP[r][c]];
const toCube = (c, r) => { const x = c, z = r - (c - (c & 1)) / 2; return { x, z, y: -x - z }; };
export const hexDist = (a, b) => { const p = toCube(a.c, a.r), q = toCube(b.c, b.r); return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z)); };
const inMap = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
function nbrs(c, r) {
  const odd = c & 1, d = odd ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  return d.map(([dc, dr]) => ({ c: c + dc, r: r + dr })).filter((h) => inMap(h.c, h.r));
}

export function newHex() {
  let id = 0;
  const u = (side, t, c, r) => ({ id: id++, side, t, c, r, hp: 10, moved: false, fired: false });
  return {
    turn: 1, over: null, plane: { hp: PLANE.hp, used: false },
    units: [u('blue', 'inf', 1, 4), u('blue', 'armor', 2, 4), u('blue', 'inf', 3, 4), u('blue', 'art', 4, 4), u('blue', 'ship', 2, 5),
      u('red', 'fort', 2, 0), u('red', 'aa', 3, 0), u('red', 'rinf', 1, 1), u('red', 'rinf', 2, 1), u('red', 'rinf', 4, 1)],
  };
}
export const at = (s, c, r) => s.units.find((u) => u.hp > 0 && u.c === c && u.r === r);
const live = (s, side) => s.units.filter((u) => u.hp > 0 && u.side === side);
const zoc = (s, side, h) => nbrs(h.c, h.r).some((n) => { const o = at(s, n.c, n.r); return o && o.side !== side; });
// hexes a unit can move to this turn (cost by terrain, stop on entering an enemy zone of control)
export function moves(s, u) {
  const U = UNIT[u.t]; if (u.moved || u.fired || !U.mv) return [];
  const best = new Map([[`${u.c},${u.r}`, U.mv]]), q = [{ c: u.c, r: u.r, m: U.mv }], out = [];
  while (q.length) {
    const h = q.shift();
    if ((h.c !== u.c || h.r !== u.r) && zoc(s, u.side, h)) continue; // in an enemy zone: stop here
    for (const n of nbrs(h.c, h.r)) {
      const T = MAP[n.r][n.c]; if (!!U.sea !== (T === 'S')) continue;
      const left = h.m - (U.sea ? 1 : TER[T].mv); if (left < 0 || at(s, n.c, n.r)) continue;
      const k = `${n.c},${n.r}`; if ((best.get(k) ?? -1) >= left) continue;
      best.set(k, left); q.push({ c: n.c, r: n.r, m: left }); if (!out.some((o) => o.c === n.c && o.r === n.r)) out.push({ c: n.c, r: n.r });
    }
  }
  return out;
}
export const canHit = (s, u, t) => !u.fired && t && t.hp > 0 && t.side !== u.side && hexDist(u, t) <= UNIT[u.t].rng;
// support fire: a Blue gun 2 hexes from the target that has not fired yet joins any attack on it
const supporters = (s, att, t) => live(s, att.side).filter((a) => a !== att && UNIT[a.t].sup && !a.fired && hexDist(a, t) <= UNIT[a.t].rng);
// predicted losses (what Hex of Steel shows before you commit): attacker loses `you`, defender loses `them`
export function predict(s, att, t, { plane = false } = {}) {
  const A = (plane ? PLANE.atk : UNIT[att.t].atk) * (plane ? s.plane.hp : att.hp) / 10;
  const D = (UNIT[t.t].def + ter(t.c, t.r).def) * t.hp / 10;
  const sup = plane ? [] : supporters(s, att, t), S = sup.reduce((n, a) => n + UNIT[a.t].sup * a.hp / 10, 0);
  const them = clamp(Math.round((A + S) * 0.75 - D * 0.3), 0, t.hp);
  const counter = !plane && hexDist(att, t) === 1 && UNIT[t.t].rng >= 1;
  const left = t.hp - them, C = UNIT[t.t].atk * left / 10 + Math.max(0, ter(t.c, t.r).def);
  const you = counter ? clamp(Math.round(C * 0.55 - A * 0.12), 0, att.hp) : 0;
  const flakers = plane ? live(s, t.side === 'blue' ? 'blue' : 'red').filter((a) => UNIT[a.t].flak && hexDist(a, t) <= 1) : [];
  const flak = flakers.reduce((n, a) => n + Math.round(UNIT[a.t].flak * a.hp / 10), 0);
  return { you: plane ? flak : you, them, sup: sup.map((a) => a.id), counter, flak: flakers.length > 0 };
}
// resolve: predicted numbers, sometimes off by one (shown as "~" in the bubble)
const jitter = (n, max, rnd) => clamp(n + (rnd() < 0.2 ? (rnd() < 0.5 ? -1 : 1) : 0), 0, max);
export function attack(s, att, t, rnd = Math.random, { plane = false } = {}) {
  if (s.over) return null;
  if (plane ? s.plane.used || s.plane.hp <= 0 : !canHit(s, att, t)) return null;
  const p = predict(s, att, t, { plane });
  const them = jitter(p.them, t.hp, rnd), you = p.you ? jitter(p.you, plane ? s.plane.hp : att.hp, rnd) : 0;
  t.hp -= them;
  if (plane) { s.plane.hp -= you; s.plane.used = true; } else { att.hp -= you; att.fired = true; att.moved = true; for (const id of p.sup) s.units[id].fired = true; }
  check(s);
  return { them, you, sup: p.sup };
}
export function move(s, u, c, r) { if (!moves(s, u).some((h) => h.c === c && h.r === r)) return false; u.c = c; u.r = r; u.moved = true; check(s); return true; }
function check(s) {
  const fort = s.units.find((u) => u.t === 'fort');
  const onFort = live(s, 'blue').some((u) => MAP[u.r][u.c] === 'F');
  if (onFort || live(s, 'red').filter((u) => u.t !== 'aa').length === 0) s.over = 'win';
  else if (live(s, 'blue').filter((u) => u.t !== 'ship').length === 0) s.over = 'lose';
  void fort;
}
// Red's turn: every Red unit hits the adjacent Blue unit it hurts most (they hold their ground, dug in)
export function redTurn(s, rnd = Math.random) {
  const log = [];
  for (const r of live(s, 'red')) {
    if (s.over) break;
    const tg = live(s, 'blue').filter((b) => canHit(s, r, b));
    if (!tg.length) continue;
    const best = tg.map((b) => ({ b, p: predict(s, r, b) })).sort((x, y) => (y.p.them - y.p.you) - (x.p.them - x.p.you))[0];
    if (best.p.them <= 0) continue;
    const res = attack(s, r, best.b, rnd); if (res) log.push({ from: r.id, to: best.b.id, ...res });
  }
  return log;
}
export function endTurn(s, rnd = Math.random) {
  if (s.over) return [];
  for (const u of s.units) { u.fired = false; u.moved = false; }
  const log = redTurn(s, rnd);
  for (const u of s.units) { u.fired = false; u.moved = false; }
  if (!s.over) { s.turn++; s.plane.used = false; if (s.turn > TURNS) s.over = 'time'; }
  return log;
}

export default {
  id: 'hex', short: 'HEX', name: 'Hex of Steel', icon: 'hex',
  decides: 'See losses before you hit. Ridge and fort defend. Guns support. Take the fort in 6 turns.',
  mount({ stage, ctrl, end, sfx }) {
    const S = newHex(), C = hiCanvas(stage);
    let sel = null, aimPlane = false, pick = null, floats = [], booms = [], busy = false, geo = null;
    ctrl.innerHTML = `
      <button class="btn big" id="h-plane" aria-label="Bomber strike">${unitIcon('bomber', 32)}<span class="cost" id="h-php">10</span></button>
      <button class="btn big primary" id="h-fire" aria-label="Attack" disabled>${icon('crosshair', { size: 30 })}</button>
      <button class="btn big" id="h-end" aria-label="End turn">${icon('skip', { size: 28 })}<span id="h-turn">1/${TURNS}</span></button>`;
    const $ = (id) => ctrl.querySelector(`#${id}`);
    function layout() {
      const pad = 8, top = 34, W = C.W - pad * 2, H = C.H - top - pad;
      const s = Math.min(W / (1.5 * (COLS - 1) + 2), H / (Math.sqrt(3) * (ROWS + 0.5)));
      const gw = s * (1.5 * (COLS - 1) + 2), gh = s * Math.sqrt(3) * (ROWS + 0.5);
      geo = { s, ox: pad + (W - gw) / 2 + s, oy: top + (H - gh) / 2 + s * Math.sqrt(3) / 2 };
    }
    const hp2 = (c, r) => ({ x: geo.ox + c * geo.s * 1.5, y: geo.oy + geo.s * Math.sqrt(3) * (r + 0.5 * (c & 1)) });
    function hexAt(x, y) { let best = null, bd = 1e9; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const p = hp2(c, r), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = { c, r }; } } return bd <= geo.s ? best : null; }
    function ui() {
      $('h-fire').disabled = !pick || busy || !!S.over;
      $('h-plane').disabled = S.plane.used || S.plane.hp <= 0 || busy || !!S.over; $('h-plane').classList.toggle('aim', aimPlane);
      $('h-php').textContent = Math.max(0, S.plane.hp);
      $('h-end').disabled = busy || !!S.over; $('h-turn').textContent = `${Math.min(S.turn, TURNS)}/${TURNS}`;
      window.__BS__.state = { tab: 'hex', turn: S.turn, sel: sel && sel.id, aimPlane, pick: pick && { t: pick.t.id, ...pick.p }, over: S.over,
        units: S.units.filter((u) => u.hp > 0).map((u) => ({ id: u.id, side: u.side, t: u.t, c: u.c, r: u.r, hp: u.hp, moved: u.moved, fired: u.fired })) };
    }
    function screenOf(u) { const p = hp2(u.c, u.r), r = C.cv.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }
    window.__BS__.hexScreen = (c, r) => { const p = hp2(c, r), b = C.cv.getBoundingClientRect(); return { x: b.left + p.x, y: b.top + p.y }; };
    void screenOf;
    function fire() {
      if (!pick || busy || S.over) return;
      const { a, t, plane } = pick, from = plane ? { c: t.c, r: 5 } : a;
      const res = attack(S, a, t, Math.random, { plane }); pick = null; sel = null; aimPlane = false;
      if (!res) { ui(); return; }
      sfx('hit'); const pt = hp2(t.c, t.r), now = performance.now();
      booms.push({ x: pt.x, y: pt.y, t0: now, big: plane || (a && a.t === 'ship') });
      floats.push({ x: pt.x, y: pt.y - geo.s * 0.6, txt: `-${res.them}`, col: '#ffb0a8', t0: now, size: 26 });
      if (res.you) { const q = plane ? { x: pt.x, y: pt.y - geo.s * 1.4 } : hp2(from.c, from.r); floats.push({ x: q.x, y: q.y - geo.s * 0.6, txt: `-${res.you}`, col: '#9fc3ff', t0: now + 150, size: 24 }); }
      for (const id of res.sup) { const g = S.units[id], q = hp2(g.c, g.r); booms.push({ x: pt.x + geo.s * 0.3, y: pt.y - geo.s * 0.2, t0: now + 120, small: true }); floats.push({ x: q.x, y: q.y - geo.s * 0.5, txt: '+', col: '#f5c518', t0: now }); }
      planeAnim = plane ? { x0: -40, y: pt.y, x1: pt.x, t0: now } : null;
      after();
    }
    let planeAnim = null;
    function after() { ui(); if (S.over && !S.done) { S.done = true; setTimeout(() => end(S.over === 'win', S.over === 'win' ? `${unitIcon('fort', 22)}${icon('flag', { size: 22 })}` : S.over === 'time' ? `${icon('clock', { size: 22 })}${TURNS}/${TURNS}` : `${icon('skull', { size: 22 })}`), 600); } }
    function endT() {
      if (busy || S.over) return; busy = true; sel = null; pick = null; aimPlane = false; sfx('tap'); ui();
      const log = endTurn(S);
      let k = 0; const now = performance.now();
      for (const e of log) { const t = S.units[e.to], pt = hp2(t.c, t.r); booms.push({ x: pt.x, y: pt.y, t0: now + k * 350 }); floats.push({ x: pt.x, y: pt.y - geo.s * 0.6, txt: `-${e.them}`, col: '#9fc3ff', t0: now + k * 350, size: 26 }); k++; }
      setTimeout(() => { busy = false; after(); }, 350 * k + 250);
    }
    C.cv.addEventListener('pointerdown', (e) => {
      if (busy || S.over || !geo) return;
      const p = ptr(C.cv, e), h = hexAt(p.x, p.y); if (!h) { sel = null; pick = null; aimPlane = false; ui(); return; }
      const u = at(S, h.c, h.r);
      if (aimPlane) {
        if (u && u.side === 'red') { if (pick && pick.t === u) { fire(); return; } pick = { a: null, t: u, plane: true, p: predict(S, null, u, { plane: true }) }; sfx('tap'); } else { aimPlane = false; pick = null; }
        ui(); return;
      }
      if (u && u.side === 'blue') { sel = sel === u ? null : u; pick = null; sfx('tap'); ui(); return; }
      if (u && u.side === 'red' && sel) {
        if (!canHit(S, sel, u)) { floats.push({ x: p.x, y: p.y - 20, txt: '×', col: '#ff9b8f', t0: performance.now() }); sfx('lose'); return; }
        if (pick && pick.t === u) { fire(); return; }
        pick = { a: sel, t: u, plane: false, p: predict(S, sel, u) }; sfx('tap'); ui(); return;
      }
      if (sel && !u && move(S, sel, h.c, h.r)) { sfx('tap'); pick = null; after(); return; }
      sel = null; pick = null; ui();
    });
    ctrl.addEventListener('click', onCtrl);
    function onCtrl(e) {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.id === 'h-fire') fire();
      else if (b.id === 'h-end') endT();
      else if (b.id === 'h-plane') { aimPlane = !aimPlane; sel = null; pick = null; sfx('tap'); ui(); }
    }
    const ro = new ResizeObserver(() => { C.fit(); layout(); }); ro.observe(stage); layout();
    const stop = loop((dt, now) => draw(now));
    function hexPath(g, x, y, s) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; g.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)); } g.closePath(); }
    function draw(now) {
      const { g, W, H } = C; if (!geo) return; const s = geo.s;
      g.fillStyle = '#0f1d31'; g.fillRect(0, 0, W, H);
      const mv = sel ? moves(S, sel) : [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const p = hp2(c, r), T = MAP[r][c];
        hexPath(g, p.x, p.y, s * 0.97); g.fillStyle = TER[T].col; g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5; g.stroke();
        if (T === 'R') { g.strokeStyle = 'rgba(60,50,30,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x - s * 0.5, p.y + s * 0.35); g.lineTo(p.x - s * 0.15, p.y - s * 0.1); g.lineTo(p.x + s * 0.2, p.y + s * 0.3); g.stroke(); }
        if (T === 'J') { g.fillStyle = 'rgba(20,50,20,.55)'; for (const [dx, dy] of [[-0.35, 0.3], [0.3, 0.35], [0, -0.4]]) { g.beginPath(); g.arc(p.x + dx * s, p.y + dy * s, s * 0.16, 0, 7); g.fill(); } }
        if (T === 'S') { g.strokeStyle = 'rgba(190,225,255,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x - s * 0.4, p.y + s * 0.45); g.quadraticCurveTo(p.x - s * 0.2, p.y + s * 0.3, p.x, p.y + s * 0.45); g.quadraticCurveTo(p.x + s * 0.2, p.y + s * 0.6, p.x + s * 0.4, p.y + s * 0.45); g.stroke(); }
        const dv = TER[T].def; if (T !== 'S' && dv) { g.fillStyle = dv > 0 ? '#e6f5d0' : '#ffd0c8'; g.font = `900 ${Math.round(s * 0.3)}px "Barlow Condensed", Arial Narrow, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${dv > 0 ? '+' : ''}${dv}`, p.x + s * 0.55, p.y - s * 0.55); }
        if (mv.some((h) => h.c === c && h.r === r)) { hexPath(g, p.x, p.y, s * 0.8); g.fillStyle = 'rgba(245,197,24,.22)'; g.fill(); g.strokeStyle = 'rgba(245,197,24,.85)'; g.setLineDash([5, 4]); g.lineWidth = 2; g.stroke(); g.setLineDash([]); }
      }
      // zones of control of the selected unit's foes (thin red rim)
      if (sel) for (const r of live(S, 'red')) for (const n of nbrs(r.c, r.r)) { const p = hp2(n.c, n.r); hexPath(g, p.x, p.y, s * 0.9); g.strokeStyle = 'rgba(255,110,100,.35)'; g.lineWidth = 2; g.stroke(); }
      for (const u of S.units) {
        if (u.hp <= 0) continue; const p = hp2(u.c, u.r), tr = s * 0.58;
        const ring = sel === u ? '#f5c518' : (pick && pick.t === u) ? '#ffffff' : (sel && canHit(S, sel, u)) || (aimPlane && u.side === 'red') ? '#ffb347' : null;
        token(g, u.t === 'rinf' ? 'inf' : u.t, p.x, p.y, tr, u.side, { dim: u.side === 'blue' && u.fired, ring });
        hpBadge(g, p.x + tr * 0.85, p.y + tr * 0.75, u.hp, u.side, s * 0.22);
      }
      // predicted losses bubble: "you -2 / them -4"
      if (pick) {
        const p = hp2(pick.t.c, pick.t.r), bw = s * 3.3, bh = s * 0.95, bx = clamp(p.x - bw / 2, 4, W - bw - 4), by = p.y + s * 0.75 + bh > H - 4 ? p.y - s * 0.8 - bh : p.y + s * 0.75;
        g.fillStyle = 'rgba(8,12,18,.94)'; g.strokeStyle = '#f5c518'; g.lineWidth = 2; g.beginPath(); g.roundRect(bx, by, bw, bh, 10); g.fill(); g.stroke();
        const y = by + bh / 2, f = `900 ${Math.round(s * 0.5)}px "Barlow Condensed", Arial Narrow, sans-serif`;
        token(g, pick.plane ? 'plane' : pick.a.t === 'ship' ? 'ship' : pick.a.t, bx + s * 0.42, y, s * 0.28, 'blue');
        g.font = f; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#9fc3ff'; g.fillText(`-${pick.p.you}`, bx + s * 0.78, y);
        token(g, pick.t.t === 'rinf' ? 'inf' : pick.t.t, bx + s * 1.85, y, s * 0.28, 'red');
        g.fillStyle = '#ffb0a8'; g.fillText(`-${pick.p.them}`, bx + s * 2.2, y);
        if (pick.p.sup.length) { g.fillStyle = '#f5c518'; g.font = `900 ${Math.round(s * 0.32)}px "Barlow Condensed", Arial Narrow, sans-serif`; g.fillText(`+${pick.p.sup.length}`, bx + bw - s * 0.45, by + s * 0.25); }
      }
      // turn chip
      g.fillStyle = 'rgba(10,14,20,.85)'; g.beginPath(); g.roundRect(6, 4, 108, 26, 9); g.fill();
      g.fillStyle = '#f5c518'; g.font = '900 18px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(`TURN ${Math.min(S.turn, TURNS)}/${TURNS}`, 14, 18);
      if (aimPlane) { g.fillStyle = '#f5c518'; g.textAlign = 'right'; g.fillText('TAP TARGET', W - 10, 18); }
      if (planeAnim) { const k = (now - planeAnim.t0) / 600; if (k > 1) planeAnim = null; else token(g, 'plane', planeAnim.x0 + (planeAnim.x1 - planeAnim.x0) * k, planeAnim.y - s * 0.9, s * 0.35, 'blue'); }
      for (let i = booms.length - 1; i >= 0; i--) { const b = booms[i], k = (now - b.t0) / 600; if (k < 0) continue; if (k > 1) { booms.splice(i, 1); continue; } boom(g, b.x, b.y, s * (b.big ? 0.7 : b.small ? 0.3 : 0.5), k); }
      drawFloats(g, floats, now);
    }
    ui();
    return () => { stop(); ro.disconnect(); ctrl.removeEventListener('click', onCtrl); delete window.__BS__.hexScreen; };
  },
};
