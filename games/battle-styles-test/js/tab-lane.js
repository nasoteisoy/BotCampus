// Tab 3: Warfare 1917 / 1944 style. Real-time side-view lane: supply ticks up, send units, call in fire, take their trench.
import { icon, unitIcon } from './icons.js';
import { hiCanvas, unitSide, boom, loop, ptr, drawFloats, clamp, rand } from './common.js';

export const LANE = {
  len: 1000, blueTrench: 70, redTrench: 860, fortX: 915, aaX: 950, time: 90,
  supply: { start: 30, rate: 5.5, max: 100 },
  unit: {
    inf: { hp: 10, spd: 26, rng: 150, dmg: 2.4, rof: 1.0, cost: 10 },
    armor: { hp: 55, spd: 15, rng: 210, dmg: 7, rof: 1.8, cost: 40, armor: 0.3 },
    rinf: { hp: 10, spd: 22, rng: 150, dmg: 2.4, rof: 1.0 },
    fort: { hp: 100, spd: 0, rng: 260, dmg: 3.2, rof: 0.55, armor: 0.5 },
    aa: { hp: 30, spd: 0, rng: 0, dmg: 0, rof: 1 },
  },
  call: { art: { cd: 9, dmg: 22, r: 55, n: 3 }, plane: { cd: 15, dmg: 14 }, ship: { cd: 20, dmg: 55, r: 65, max: 760 } },
  redEvery: 4.2,
};
const ground = (x) => (x < 520 ? 0 : x < 820 ? (x - 520) / 300 : 1); // 0 = beach, 1 = ridge top
export function newLane() {
  const s = { t: 0, sup: LANE.supply.start, units: [], cd: { art: 0, plane: 0, ship: 0 }, redT: 1.5, over: null, fx: [], plane: null, id: 0 };
  add(s, 'red', 'fort', LANE.fortX); add(s, 'red', 'aa', LANE.aaX); add(s, 'red', 'rinf', 880); add(s, 'red', 'rinf', 895);
  return s;
}
function add(s, side, t, x) { const U = LANE.unit[t]; const u = { id: s.id++, side, t, x, hp: U.hp, cd: rand(0, U.rof), shoot: 0 }; s.units.push(u); return u; }
export function send(s, t) { const U = LANE.unit[t]; if (s.over || s.sup < U.cost) return false; s.sup -= U.cost; add(s, 'blue', t, LANE.blueTrench - 20); return true; }
function hurt(s, u, d) { const U = LANE.unit[u.t]; let k = 1 - (U.armor || 0); if (u.t === 'rinf' && u.x >= LANE.redTrench - 10) k *= 0.5; if (u.t === 'inf' && u.shoot > 0) k *= 0.7; u.hp -= d * k; }
export function callIn(s, kind, x) {
  const C = LANE.call[kind]; if (s.over || s.cd[kind] > 0) return false;
  if (kind === 'ship' && x > C.max) x = C.max;
  s.cd[kind] = C.cd;
  if (kind === 'plane') { s.plane = { x: -60, hitAA: s.units.some((u) => u.t === 'aa' && u.hp > 0) && Math.random() < 0.45 ? rand(600, 850) : null, down: false, done: new Set() }; return true; }
  const n = kind === 'art' ? C.n : 1;
  for (let i = 0; i < n; i++) s.fx.push({ k: 'shell', x: x + (n > 1 ? (i - 1) * 40 + rand(-10, 10) : 0), t: 0.6 + i * 0.25, dmg: C.dmg, r: C.r, big: kind === 'ship' });
  return true;
}
export function laneStep(s, dt) {
  if (s.over) return;
  s.t += dt; s.sup = Math.min(LANE.supply.max, s.sup + LANE.supply.rate * dt);
  for (const k in s.cd) s.cd[k] = Math.max(0, s.cd[k] - dt);
  // red sends infantry from its trench
  s.redT -= dt; if (s.redT <= 0) { s.redT = LANE.redEvery * rand(0.8, 1.2); add(s, 'red', 'rinf', 900); }
  const alive = s.units.filter((u) => u.hp > 0);
  for (const u of alive) {
    const U = LANE.unit[u.t]; u.cd -= dt; u.shoot = Math.max(0, u.shoot - dt);
    const foes = alive.filter((f) => f.side !== u.side && f.t !== 'aa' && Math.abs(f.x - u.x) <= U.rng);
    const holdTrench = u.t === 'rinf' && u.x >= LANE.redTrench - 5 && u.x <= LANE.redTrench + 40 && s.units.filter((q) => q.t === 'rinf' && q.hp > 0 && q.x >= LANE.redTrench - 5).length <= 2;
    if (foes.length && U.rng) {
      if (u.cd <= 0) { u.cd = U.rof; const f = foes.sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x))[0]; hurt(s, f, U.dmg * rand(0.7, 1.3)); u.shoot = 0.5; s.fx.push({ k: 'tr', a: u.x, b: f.x, side: u.side, t: 0.15, h: u.t }); }
    } else if (U.spd && !holdTrench) u.x += (u.side === 'blue' ? 1 : -1) * U.spd * dt * (u.side === 'blue' && ground(u.x) > 0 && ground(u.x) < 1 ? 0.75 : 1);
    // aa gun: also an AA target for nothing; it just guards the sky
  }
  // shells land
  for (const f of s.fx) if (f.k === 'shell') { f.t -= dt; if (f.t <= 0 && !f.hit) { f.hit = true; for (const u of alive) if (u.side === 'red' && Math.abs(u.x - f.x) <= f.r) hurt(s, u, f.dmg); s.fx.push({ k: 'boom', x: f.x, t: 0.6, big: f.big }); } }
  // plane strafes left to right; may be shot down over the AA gun
  if (s.plane) {
    const p = s.plane; p.x += 420 * dt;
    if (p.hitAA != null && !p.down && p.x >= p.hitAA) { p.down = true; s.fx.push({ k: 'boom', x: p.x, t: 0.8, air: true }); }
    if (!p.down) for (const u of alive) if (u.side === 'red' && !p.done.has(u.id) && Math.abs(u.x - p.x) < 30) { p.done.add(u.id); hurt(s, u, LANE.call.plane.dmg * (u.t === 'fort' ? 2 : 1)); }
    if (p.x > LANE.len + 80 || p.down) s.plane = p.down ? null : (p.x > LANE.len + 80 ? null : p);
  }
  s.fx = s.fx.filter((f) => (f.k === 'shell' ? !f.hit : (f.t -= f.k === 'shell' ? 0 : dt) > 0));
  s.units = s.units.filter((u) => u.hp > 0 || (u.dead = (u.dead || 0) + dt) < 0.6);
  const live = s.units.filter((u) => u.hp > 0);
  if (live.some((u) => u.side === 'blue' && u.x >= LANE.redTrench)) s.over = 'win';
  else if (live.some((u) => u.side === 'red' && u.x <= LANE.blueTrench)) s.over = 'lose';
  else if (s.t >= LANE.time) s.over = 'time';
}

export default {
  id: 'lane', short: 'LANE', name: 'Warfare 1917 lane', icon: 'lane',
  decides: 'Supply in, send troops, call fire. First into the other trench wins.',
  mount({ stage, ctrl, end, sfx }) {
    const S = newLane(); const C = hiCanvas(stage);
    let aim = null, floats = [];
    ctrl.innerHTML = `
      <button class="btn lb" data-send="inf" aria-label="Send infantry">${unitIcon('inf', 30)}<span class="cost">${LANE.unit.inf.cost}</span></button>
      <button class="btn lb" data-send="armor" aria-label="Send armor">${unitIcon('armor', 30)}<span class="cost">${LANE.unit.armor.cost}</span></button>
      <button class="btn lb" data-call="art" aria-label="Artillery">${unitIcon('art', 30)}<i class="cd"></i></button>
      <button class="btn lb" data-call="plane" aria-label="Plane">${unitIcon('bomber', 30)}<i class="cd"></i></button>
      <button class="btn lb" data-call="ship" aria-label="Ship">${unitIcon('bb', 30)}<i class="cd"></i></button>`;
    ctrl.classList.add('lane-ctrl');
    ctrl.addEventListener('click', onCtrl);
    function onCtrl(e) {
      const b = e.target.closest('button'); if (!b || S.over) return;
      if (b.dataset.send) { if (send(S, b.dataset.send)) sfx('tap'); else sfx('lose'); }
      if (b.dataset.call) {
        const k = b.dataset.call; if (S.cd[k] > 0) return;
        if (k === 'plane') { callIn(S, 'plane'); sfx('shot'); aim = null; } else { aim = aim === k ? null : k; sfx('tap'); }
      }
      ui();
    }
    const W2X = (x) => 8 + (x / LANE.len) * (C.W - 16);
    const X2W = (sx) => ((sx - 8) / (C.W - 16)) * LANE.len;
    const gy = (x) => C.H * (0.8 - 0.26 * ground(x));
    C.cv.addEventListener('pointerdown', (e) => {
      if (!aim || S.over) return; const p = ptr(C.cv, e); const x = clamp(X2W(p.x), 0, LANE.len);
      if (callIn(S, aim, x)) { sfx('shot'); floats.push({ x: p.x, y: p.y, txt: '!', col: '#f5c518', t0: performance.now() }); }
      aim = null; ui();
    });
    function ui() {
      ctrl.querySelectorAll('[data-send]').forEach((b) => { b.disabled = S.sup < LANE.unit[b.dataset.send].cost || !!S.over; });
      ctrl.querySelectorAll('[data-call]').forEach((b) => { const k = b.dataset.call, cd = S.cd[k] / LANE.call[k].cd; b.disabled = cd > 0 || !!S.over; b.classList.toggle('aim', aim === k); b.querySelector('.cd').style.transform = `scaleX(${1 - cd})`; });
      window.__BS__.state = { tab: 'lane', t: +S.t.toFixed(1), sup: Math.floor(S.sup), blue: S.units.filter((u) => u.side === 'blue' && u.hp > 0).map((u) => [u.t, Math.round(u.x)]), red: S.units.filter((u) => u.side === 'red' && u.hp > 0).map((u) => [u.t, Math.round(u.x)]), aim, over: S.over };
    }
    const ro = new ResizeObserver(() => C.fit()); ro.observe(stage);
    let uiT = 0;
    const stop = loop((dt, now) => {
      laneStep(S, dt);
      uiT += dt; if (uiT > 0.1) { uiT = 0; ui(); }
      if (S.over && !S.ended) { S.ended = true; ui(); end(S.over === 'win', S.over === 'win' ? `${unitIcon('inf', 22)}${icon('flag', { size: 22 })}` : S.over === 'time' ? `${icon('clock', { size: 22 })}0` : `${icon('flag', { size: 22 })}${icon('x', { size: 22 })}`); }
      draw(now);
    });
    function draw(now) {
      const { g, W, H } = C, L = clamp(Math.min(W, H) * 0.075, 18, 46);
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#2a4a72'); sky.addColorStop(1, '#7d97ae'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // ground: beach -> slope -> ridge
      g.fillStyle = '#6b7b48'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= LANE.len; x += 10) g.lineTo(W2X(x), gy(x)); g.lineTo(W, H); g.closePath(); g.fill();
      g.fillStyle = '#d6c08a'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= 520; x += 10) g.lineTo(W2X(x), gy(x)); g.lineTo(W2X(520), H); g.closePath(); g.fill();
      g.fillStyle = '#1f4c78'; g.fillRect(0, H * 0.9, W2X(260), H * 0.1);
      // trenches
      for (const [x, col] of [[LANE.blueTrench, '#2c5aa8'], [LANE.redTrench, '#b3201f']]) { g.fillStyle = '#3b3326'; g.fillRect(W2X(x) - 16, gy(x) - 2, 32, 12); g.fillStyle = col; g.fillRect(W2X(x) - 1, gy(x) - L * 1.6, 3, L * 1.6); g.fillRect(W2X(x) + 2, gy(x) - L * 1.6, L * 0.7, L * 0.45); }
      // units
      for (const u of S.units) {
        const x = W2X(u.x), y = gy(u.x), dead = u.hp <= 0;
        g.globalAlpha = dead ? Math.max(0, 1 - (u.dead || 0) / 0.6) : 1;
        const t = u.t === 'rinf' ? 'inf' : u.t, prone = (u.t === 'inf' || u.t === 'rinf') && u.shoot > 0;
        if (prone) { g.save(); g.translate(x, y); g.scale(1, 0.75); g.translate(-x, -y); }
        unitSide(g, t, x, y - (t === 'inf' ? L * 0.38 : t === 'fort' ? L * 0.15 : L * 0.12), L, u.side, u.side === 'blue' ? 1 : -1);
        if (prone) g.restore();
        if (!dead && (u.t === 'armor' || u.t === 'fort' || u.t === 'aa')) { const m = LANE.unit[u.t].hp; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - L * 0.5, y - L * 1.25, L, 4); g.fillStyle = u.side === 'blue' ? '#8fb4ff' : '#ff9b8f'; g.fillRect(x - L * 0.5, y - L * 1.25, L * clamp(u.hp / m, 0, 1), 4); }
        g.globalAlpha = 1;
      }
      // tracers, shells, booms
      for (const f of S.fx) {
        if (f.k === 'tr') { g.strokeStyle = f.side === 'blue' ? 'rgba(255,236,160,.95)' : 'rgba(255,160,130,.95)'; g.lineWidth = f.h === 'armor' ? 3 : 1.6; g.beginPath(); g.moveTo(W2X(f.a), gy(f.a) - L * 0.5); g.lineTo(W2X(f.b), gy(f.b) - L * 0.4); g.stroke(); }
        if (f.k === 'shell') { const k = clamp(1 - f.t / 0.6, 0, 1); g.fillStyle = '#222'; g.beginPath(); g.arc(W2X(f.x), gy(f.x) - (1 - k) * H * 0.6, f.big ? 5 : 3.5, 0, 7); g.fill(); g.strokeStyle = 'rgba(245,197,24,.7)'; g.setLineDash([4, 4]); g.beginPath(); g.arc(W2X(f.x), gy(f.x), (f.r / LANE.len) * W, 0, 7); g.stroke(); g.setLineDash([]); }
        if (f.k === 'boom') boom(g, W2X(f.x), f.air ? H * 0.22 : gy(f.x) - 6, (f.big ? 34 : 22) * (W / 600 + 0.4), 1 - f.t / (f.air ? 0.8 : 0.6));
      }
      if (S.plane) unitSide(g, 'plane', W2X(S.plane.x), H * 0.22, L, 'blue', 1);
      // supply + clock
      g.fillStyle = 'rgba(10,14,20,.82)'; g.beginPath(); g.roundRect(6, 6, 150, 30, 10); g.fill();
      g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(40, 16, 70, 10); g.fillStyle = '#f5c518'; g.fillRect(40, 16, 70 * S.sup / LANE.supply.max, 10);
      g.fillStyle = '#f5c518'; g.beginPath(); g.arc(22, 21, 8, 0, 7); g.fill(); g.fillStyle = '#1a1400'; g.font = '900 12px Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 22, 21);
      g.fillStyle = '#fff'; g.font = '900 18px "Barlow Condensed", Arial Narrow, sans-serif'; g.fillText(String(Math.floor(S.sup)), 132, 22);
      g.fillStyle = 'rgba(10,14,20,.82)'; g.beginPath(); g.roundRect(W - 72, 6, 66, 30, 10); g.fill(); g.fillStyle = S.t > LANE.time - 15 ? '#ff9b8f' : '#f5c518'; g.fillText(`${Math.max(0, Math.ceil(LANE.time - S.t))}s`, W - 39, 22);
      if (aim) { g.fillStyle = 'rgba(245,197,24,.12)'; g.fillRect(0, 0, W, H); g.fillStyle = '#f5c518'; g.font = '900 22px "Barlow Condensed", Arial Narrow, sans-serif'; g.fillText('TAP TARGET', W / 2, H * 0.14); }
      drawFloats(g, floats, now);
    }
    ui();
    return () => { stop(); ro.disconnect(); ctrl.removeEventListener('click', onCtrl); ctrl.classList.remove('lane-ctrl'); };
  },
};
