// Tab 2: Hearts of Iron IV style. No shots to control: Strength + Organization drain every hour; modifiers decide it.
import { icon, unitIcon } from './icons.js';
import { hiCanvas, unitSide, SIDE_COL, secIcon, boom, loop, rand, clamp, drawFloats } from './common.js';

// ---- the model (pure; one call = one hour) ----
export const HOI = {
  blue: { str: 100, org: 60, soft: 34, hard: 10, brk: 30, def: 22, pierce: 60 },
  red: { str: 70, org: 60, soft: 22, hard: 4, brk: 8, def: 40, armor: 45, hard_: 0.4 },
  ridge: -0.25, // attacker on a ridge
  beach: -0.2, // amphibious, first 24 hours
  air: 0.25, // full air superiority
  ship: 0.15, // shore bombardment, first 36 hours
  reserve: { org: 13, str: 18, n: 2 },
};
export function newHoi() {
  return { h: 0, b: { ...HOI.blue, orgMax: HOI.blue.org, strMax: HOI.blue.str }, r: { ...HOI.red, orgMax: HOI.red.org, strMax: HOI.red.str }, airSup: 1, plane: true, aa: true, reserves: HOI.reserve.n, redRes: 1, over: null, log: [] };
}
export function mods(s) {
  const m = [];
  m.push({ k: 'ridge', v: HOI.ridge });
  if (s.h < 24) m.push({ k: 'beach', v: HOI.beach });
  if (s.plane) m.push({ k: 'air', v: +(HOI.air * s.airSup).toFixed(2) });
  if (s.h < 36) m.push({ k: 'ship', v: HOI.ship });
  m.push({ k: 'pierce', v: s.b.pierce >= s.r.armor ? 0 : -0.5, ok: s.b.pierce >= s.r.armor });
  return m;
}
export function hoiStep(s, rnd = Math.random) {
  if (s.over) return s;
  s.h++;
  const M = mods(s), mul = 1 + M.filter((x) => x.k !== 'pierce').reduce((n, x) => n + x.v, 0);
  const pierced = M.find((x) => x.k === 'pierce').ok;
  // blue attacks: soft vs infantry, hard (armor) vs the fort and AA (hardness 40%); not pierced = hard attack halved
  const bAtk = (s.b.soft * (1 - s.r.hard_) + s.b.hard * (pierced ? 1 : 0.5) * s.r.hard_ + s.b.hard * 0.6) * mul * (s.b.str / s.b.strMax * 0.5 + 0.5);
  const rAtk = (s.r.soft + s.r.hard) * (s.r.str / s.r.strMax * 0.5 + 0.5);
  // attacks above the other side's defence (for Red: Blue's breakthrough) hit 4x as hard
  const hits = (atk, guard) => { const over = Math.max(0, atk - guard); return (Math.min(atk, guard) * 0.1 + over * 0.4) * (0.85 + rnd() * 0.3); };
  const toRed = hits(bAtk, s.r.def), toBlue = hits(rAtk, s.b.brk);
  s.r.org = Math.max(0, s.r.org - toRed * 0.16); s.r.str = Math.max(0, s.r.str - toRed * 0.05);
  s.b.org = Math.max(0, s.b.org - toBlue * 0.16); s.b.str = Math.max(0, s.b.str - toBlue * 0.05);
  // the AA gun wears down air superiority while it lives; armour slowly knocks the AA out once the fort line cracks
  if (s.plane && s.aa) s.airSup = Math.max(0, s.airSup - 0.008);
  if (s.aa && s.r.org < s.r.orgMax * 0.5 && rnd() < 0.04) s.aa = false;
  // Red brings its one reserve when it starts to break
  if (s.redRes > 0 && s.r.org < s.r.orgMax * 0.35) { s.redRes--; s.r.org = Math.min(s.r.orgMax, s.r.org + 16); s.r.str = Math.min(s.r.strMax, s.r.str + 10); s.log.push({ h: s.h, k: 'redres' }); }
  s.last = { toRed, toBlue, bAtk, rAtk };
  if (s.r.org <= 0) s.over = 'win'; else if (s.b.org <= 0) s.over = 'lose';
  return s;
}
export function addReserve(s) {
  if (s.over || s.reserves <= 0) return false;
  s.reserves--; s.b.org = Math.min(s.b.orgMax, s.b.org + HOI.reserve.org); s.b.str = Math.min(s.b.strMax, s.b.str + HOI.reserve.str); return true;
}

const MOD_ICO = { ridge: () => sec('ridge'), beach: () => sec('beach'), air: () => unitIcon('bomber', 18), ship: () => unitIcon('bb', 18), pierce: () => icon('pierce', { size: 18 }) };
let secCache = {};
function sec(k) { if (secCache[k]) return secCache[k]; const c = document.createElement('canvas'); c.width = c.height = 36; secIcon(c.getContext('2d'), k, 18, 18, 30, '#fff'); return (secCache[k] = `<img src="${c.toDataURL()}" width="18" height="18" alt="">`); }

export default {
  id: 'clock', short: 'CLOCK', name: 'Hearts of Iron clock battle', icon: 'clock',
  decides: 'Bars drain each hour. Bonuses decide it. Add reserves before you break.',
  mount({ stage, ctrl, end, sfx }) {
    const S = newHoi();
    const C = hiCanvas(stage);
    const panel = document.createElement('div'); panel.className = 'hoi-top'; stage.appendChild(panel);
    const modsEl = document.createElement('div'); modsEl.className = 'mods'; stage.appendChild(modsEl);
    ctrl.innerHTML = `<button class="btn big primary" id="h-res" aria-label="Add reserve">${icon('plus', { size: 24 })}${unitIcon('inf', 30)}<b id="h-resn"></b></button>
      <button class="btn big" id="h-pause" aria-label="Pause">${icon('pause', { size: 26 })}</button>
      <button class="btn big red" id="h-ret" aria-label="Retreat">${icon('retreat', { size: 28 })}</button>`;
    const q = (id) => ctrl.querySelector(`#${id}`);
    let paused = false, acc = 0, flashes = [], floats = [], resFx = 0;
    const HOUR = 0.25; // seconds per hour
    const bar = (v, m, col) => `<span class="bar"><i style="width:${clamp(v / m * 100, 0, 100)}%;background:${col}"></i></span>`;
    function hud() {
      panel.innerHTML = `<div class="hside blue"><span class="hl">${icon('heart', { size: 16 })}</span>${bar(S.b.str, S.b.strMax, '#6fd07a')}<span class="hl">${icon('shield', { size: 16 })}</span>${bar(S.b.org, S.b.orgMax, '#f5c518')}</div>
        <div class="hclock">${icon('clock', { size: 18 })}<b>${S.h}h</b></div>
        <div class="hside red"><span class="hl">${icon('heart', { size: 16 })}</span>${bar(S.r.str, S.r.strMax, '#6fd07a')}<span class="hl">${icon('shield', { size: 16 })}</span>${bar(S.r.org, S.r.orgMax, '#f5c518')}</div>`;
      modsEl.innerHTML = mods(S).map((m) => `<span class="mod ${m.k === 'pierce' ? (m.ok ? 'up' : 'dn') : m.v >= 0 ? 'up' : 'dn'}">${MOD_ICO[m.k]()}${m.k === 'pierce' ? (m.ok ? icon('check', { size: 16 }) : icon('x', { size: 16 })) : `${m.v >= 0 ? '+' : ''}${Math.round(m.v * 100)}%`}</span>`).join('')
        + `<span class="mod ${S.last && S.last.bAtk > S.r.def ? 'up' : 'dn'}">${icon('sword', { size: 16 })}${S.last ? Math.round(S.last.bAtk) : '-'}<span style="opacity:.7">/</span>${icon('shield', { size: 16 })}${S.r.def}</span>`;
      q('h-resn').textContent = S.reserves; q('h-res').disabled = S.reserves <= 0 || !!S.over;
      q('h-pause').innerHTML = icon(paused ? 'play' : 'pause', { size: 26 });
      window.__BS__.state = { tab: 'clock', h: S.h, b: [Math.round(S.b.str), Math.round(S.b.org)], r: [Math.round(S.r.str), Math.round(S.r.org)], reserves: S.reserves, airSup: +S.airSup.toFixed(2), over: S.over };
    }
    q('h-res').addEventListener('click', () => { if (addReserve(S)) { sfx('tap'); resFx = 1; floats.push({ x: C.W * 0.22, y: C.H * 0.55, txt: '+', col: '#f5c518', t0: performance.now(), size: 40 }); hud(); } });
    q('h-pause').addEventListener('click', () => { paused = !paused; sfx('tap'); hud(); });
    q('h-ret').addEventListener('click', () => { if (S.over) return; S.over = 'lose'; hud(); end(false, icon('retreat', { size: 22 })); });
    const ro = new ResizeObserver(() => C.fit()); ro.observe(stage);
    // fixed unit spots (fractions of the stage)
    const blueU = [['inf', 0.12, 0.74], ['inf', 0.2, 0.8], ['armor', 0.3, 0.76], ['art', 0.06, 0.82], ['inf', 0.24, 0.7]];
    const redU = [['inf', 0.62, 0.6], ['inf', 0.7, 0.55], ['inf', 0.78, 0.5], ['aa', 0.86, 0.47], ['fort', 0.68, 0.64]];
    const stop = loop((dt, now) => {
      if (!paused && !S.over) { acc += dt; while (acc >= HOUR && !S.over) { acc -= HOUR; hoiStep(S); if (Math.random() < 0.5) flashes.push({ side: Math.random() < 0.6 ? 'r' : 'b', t0: now, x: rand(0, 1), y: rand(0, 1) }); hud(); } }
      if (S.over && !S.done) { S.done = true; hud(); end(S.over === 'win', S.over === 'win' ? `${unitIcon('inf', 22)}${icon('retreat', { size: 22 })}<span style="color:#ff9b8f">RED</span>` : `${icon('shield', { size: 22 })}0`); }
      draw(now);
    });
    function draw(now) {
      const { g, W, H } = C;
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#24456e'); sky.addColorStop(1, '#5f7f9c'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // sea, beach, ridge
      g.fillStyle = '#1f4c78'; g.fillRect(0, H * 0.86, W, H * 0.14);
      g.fillStyle = '#d9c48c'; g.beginPath(); g.moveTo(0, H * 0.86); g.lineTo(W * 0.45, H * 0.86); g.lineTo(W * 0.5, H * 0.78); g.lineTo(0, H * 0.84); g.closePath(); g.fill();
      g.fillStyle = '#6e7f4a'; g.beginPath(); g.moveTo(W * 0.4, H * 0.9); g.lineTo(W * 0.55, H * 0.66); g.lineTo(W * 0.75, H * 0.5); g.lineTo(W * 0.92, H * 0.46); g.lineTo(W, H * 0.47); g.lineTo(W, H * 0.9); g.closePath(); g.fill();
      g.fillStyle = '#58683a'; g.beginPath(); g.moveTo(W * 0.55, H * 0.66); g.lineTo(W * 0.75, H * 0.5); g.lineTo(W * 0.8, H * 0.62); g.closePath(); g.fill();
      const L = Math.min(W, H) * 0.09;
      // ship offshore while it still bombards
      if (S.h < 36) unitSide(g, 'ship', W * 0.12, H * 0.92, L, 'blue', 1);
      // tracers both ways, more when that side hits harder
      const tN = S.last ? Math.min(6, Math.round(S.last.toRed)) : 2;
      g.lineWidth = 2;
      for (let i = 0; i < tN; i++) { const k = ((now / 400) + i / tN) % 1, a = blueU[i % blueU.length], b = redU[i % redU.length]; g.strokeStyle = 'rgba(255,230,150,.8)'; g.beginPath(); const x = (a[1] + (b[1] - a[1]) * k) * W, y = (a[2] + (b[2] - a[2]) * k) * H - L * 0.3; g.moveTo(x, y); g.lineTo(x + 10, y - 3); g.stroke(); }
      for (let i = 0; i < Math.max(1, tN - 2); i++) { const k = ((now / 450) + i / 4) % 1, a = redU[i % redU.length], b = blueU[(i + 1) % blueU.length]; g.strokeStyle = 'rgba(255,170,140,.8)'; g.beginPath(); const x = (a[1] + (b[1] - a[1]) * k) * W, y = (a[2] + (b[2] - a[2]) * k) * H - L * 0.3; g.moveTo(x, y); g.lineTo(x - 10, y + 3); g.stroke(); }
      // units fade as Strength drops; they shake while Organization is low
      const bF = S.b.str / S.b.strMax, rF = S.r.str / S.r.strMax;
      blueU.forEach(([t, x, y], i) => { if (i === 4 && S.reserves === HOI.reserve.n && !resFx) return; g.globalAlpha = i / blueU.length < bF + 0.15 ? 1 : 0.25; unitSide(g, t, x * W + (S.b.org < 15 ? Math.sin(now / 50 + i) * 2 : 0), y * H, L, 'blue', 1); });
      redU.forEach(([t, x, y], i) => { if (t === 'aa' && !S.aa) { g.globalAlpha = 0.25; } else g.globalAlpha = i / redU.length < rF + 0.15 ? 1 : 0.25; unitSide(g, t, x * W + (S.r.org < 12 ? Math.sin(now / 50 + i) * 2 : 0), y * H, L, 'red', -1); });
      g.globalAlpha = 1;
      // the plane circles while it has air superiority; AA flak around it
      if (S.plane && S.airSup > 0.02) {
        const px = W * (0.5 + Math.cos(now / 1400) * 0.3), py = H * 0.32 + Math.sin(now / 700) * 10;
        g.globalAlpha = 0.4 + S.airSup * 0.6; unitSide(g, 'plane', px, py, L, 'blue', Math.sin(now / 1400) < 0 ? 1 : -1); g.globalAlpha = 1;
        if (S.aa) for (let i = 0; i < 3; i++) { const k = ((now / 600) + i / 3) % 1; boom(g, px + Math.sin(i * 7 + Math.floor(now / 600)) * 40, py + Math.cos(i * 5 + Math.floor(now / 600)) * 24, 8, k); }
      }
      flashes = flashes.filter((f) => now - f.t0 < 500);
      flashes.forEach((f) => { const k = (now - f.t0) / 500; boom(g, f.side === 'r' ? W * (0.6 + f.x * 0.3) : W * (0.05 + f.x * 0.3), f.side === 'r' ? H * (0.5 + f.y * 0.12) : H * (0.7 + f.y * 0.12), 10, k); });
      if (resFx > 0) resFx = Math.max(0, resFx - 0.01);
      drawFloats(g, floats, now);
      // frontline width: slots across the middle
      g.strokeStyle = 'rgba(245,197,24,.6)'; g.setLineDash([6, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(W * 0.47, H * 0.4); g.lineTo(W * 0.47, H * 0.95); g.stroke(); g.setLineDash([]);
    }
    hud();
    return () => { stop(); ro.disconnect(); };
  },
};
