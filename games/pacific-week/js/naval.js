// Dark-blue NAVAL / AIR COMBAT board. Ship and plane icons trade fire; losses fade out (no health bars).
import { shipTop, planeTop, drawFlag, SIDE_COL } from './art.js';

const $ = (id) => document.getElementById(id);
export const navalLog = [];

export function playNaval(ev, { speed = 1, sfx } = {}) {
  const root = $('naval'), cv = $('navalc');
  const hasPlanes = ev.start.blue.includes('plane') || ev.start.red.includes('plane');
  $('nv-title').textContent = hasPlanes ? 'NAVAL / AIR COMBAT' : 'NAVAL COMBAT';
  root.hidden = false;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  const top = 74;
  // portrait phones turn the board: blue fights from the bottom, red from the top
  const portrait = H > W * 1.2;
  const VW = portrait ? H - top : W, VH = portrait ? W : H - top;
  const U = Math.min(VW * 0.12, VH * 0.19, 110);
  // layout: ships in rows on their half, planes above them
  const icons = {};
  for (const side of ['blue', 'red']) {
    const kinds = ev.start[side];
    const ships = kinds.map((k, i) => ({ k, i })).filter((x) => x.k === 'ship');
    const planes = kinds.map((k, i) => ({ k, i })).filter((x) => x.k === 'plane');
    const dir = side === 'blue' ? 1 : -1;
    const x0 = side === 'blue' ? VW * 0.06 : VW * 0.94;
    const span = VW * 0.42;
    const base = { side, dir, alpha: 1, dead: false, hitT: 0 };
    // ships: staggered battle line, up to 4 per column, columns step back from the centre
    const cols = Math.max(1, Math.ceil(ships.length / 4));
    const rows = Math.ceil(ships.length / cols);
    const gapY = Math.min(U * 0.8, (VH * 0.6) / Math.max(1, rows));
    const yc = VH * (planes.length ? 0.62 : 0.52);
    ships.forEach((x, n) => {
      const c = Math.floor(n / rows), r = n % rows;
      const px = x0 + dir * (span * 0.78 - c * U * 1.3 - (r % 2) * U * 0.3);
      const py = yc + (r - (rows - 1) / 2) * gapY;
      icons[`${side}:${x.i}`] = { ...base, kind: 'ship', x: px, y: py, size: U };
    });
    // planes: V formation above their fleet
    const P = U * 0.55;
    planes.forEach((x, n) => {
      const k = Math.ceil(n / 2), sgn = n % 2 ? -1 : 1;
      const px = x0 + dir * (span * 0.85 - k * P * 0.9);
      const py = VH * 0.2 + sgn * k * P * 0.75;
      icons[`${side}:${x.i}`] = { ...base, kind: 'plane', x: px, y: py, size: P };
    });
  }
  const tracers = [], booms = [], splashes = [];
  let done = false, fastFwd = 1;
  const onTap = () => { fastFwd = 5; };
  cv.addEventListener('pointerdown', onTap);
  let banner = null;

  function draw() {
    const t = performance.now();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H * 0.55, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#173a5e'); bg.addColorStop(0.6, '#0e2642'); bg.addColorStop(1, '#060f1e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // faint grid + swell lines
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x < W; x += 48) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = 0; y < H; y += 48) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    g.strokeStyle = 'rgba(160,200,240,.06)'; g.lineWidth = 2;
    for (let y = top + 20; y < H; y += 38) {
      g.beginPath();
      for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x / 70 + y + t / 900) * 4);
      g.stroke();
    }
    g.save();
    if (portrait) { g.translate(0, H); g.rotate(-Math.PI / 2); } else g.translate(0, top);
    // icons with wakes
    for (const ic of Object.values(icons)) {
      const shake = ic.hitT && t - ic.hitT < 260 ? Math.sin(t / 18) * 3 : 0;
      g.save(); g.globalAlpha = ic.alpha;
      const sink = ic.dead ? (1 - ic.alpha) * 0.2 : 0;
      if (ic.kind === 'ship') {
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.beginPath(); g.ellipse(ic.x - ic.dir * ic.size * 0.55, ic.y, ic.size * 0.5, ic.size * 0.06, 0, 0, 7); g.fill();
        g.save(); g.translate(ic.x + shake, ic.y); g.scale(ic.dir * (1 - sink), 1 - sink);
        shipTop(g, 0, 0, ic.size, '#dfe5ec', false);
        g.restore();
        g.fillStyle = SIDE_COL[ic.side].fill; g.fillRect(ic.x - ic.size * 0.18, ic.y + ic.size * 0.16, ic.size * 0.36, 3);
      } else {
        planeTop(g, ic.x + shake, ic.y + Math.sin(t / 300 + ic.x) * 3, ic.size, '#eef2f6', ic.dir === 1 ? 0 : Math.PI);
      }
      g.restore();
    }
    for (const tr of tracers) {
      const k = Math.max(0, Math.min(1, (t - tr.t0) / tr.dur));
      const a = tr.a, b = tr.b;
      const hx = a.x + (b.x - a.x) * k, hy = a.y + (b.y - a.y) * k;
      const tx = a.x + (b.x - a.x) * Math.max(0, k - 0.25), ty = a.y + (b.y - a.y) * Math.max(0, k - 0.25);
      g.strokeStyle = tr.plane ? 'rgba(255,240,180,.95)' : 'rgba(255,214,120,.95)'; g.lineWidth = tr.plane ? 2 : 3;
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
    }
    for (const b of booms) {
      const k = Math.max(0, Math.min(1, (t - b.t0) / b.dur));
      g.save(); g.globalAlpha = 1 - k;
      g.fillStyle = k < 0.25 ? '#fff6d0' : '#ff8a2a'; g.beginPath(); g.arc(b.x, b.y, b.r * (0.4 + k), 0, 7); g.fill();
      g.fillStyle = 'rgba(30,30,34,.7)'; g.beginPath(); g.arc(b.x + 6, b.y - 10 - k * 20, b.r * (0.3 + k * 0.9), 0, 7); g.fill();
      g.restore();
    }
    for (const s of splashes) {
      const k = Math.max(0, Math.min(1, (t - s.t0) / s.dur));
      g.save(); g.globalAlpha = 1 - k; g.strokeStyle = '#d8ecff'; g.lineWidth = 2;
      g.beginPath(); g.arc(s.x, s.y, 4 + k * 16, 0, 7); g.stroke(); g.restore();
    }
    g.restore();
    if (banner) {
      const k = Math.max(0, Math.min(1, (t - banner.t0) / 400));
      g.save(); g.globalAlpha = k;
      const bw = Math.min(W * 0.6, 340), bh = bw * 0.42;
      g.fillStyle = 'rgba(5,12,24,.88)'; g.fillRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
      g.strokeStyle = banner.side ? SIDE_COL[banner.side].fill : '#888'; g.lineWidth = 4; g.strokeRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
      if (banner.side) drawFlag(g, banner.side, W / 2 - bh * 0.6, H / 2 - bh * 0.32, bh * 1.2, bh * 0.64);
      g.restore();
    }
    const now = performance.now();
    for (const arr of [tracers, booms, splashes]) for (let i = arr.length - 1; i >= 0; i--) if (now - arr[i].t0 > arr[i].dur + 50) arr.splice(i, 1);
    if (!done) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms / (speed * fastFwd)));
  const fadeOut = (ic) => new Promise((res) => {
    ic.dead = true; ic.hitT = performance.now();
    const t0 = performance.now(), dur = 650 / (speed * fastFwd);
    const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); ic.alpha = 1 - 0.88 * k; if (k < 1) requestAnimationFrame(step); else res(); };
    step();
  });

  return (async () => {
    await sleep(500);
    let round = 0; const fades = [];
    for (const sh of ev.shots) {
      if (sh.round !== round) { round = sh.round; await Promise.all(fades.splice(0)); await sleep(260); }
      const a = icons[`${sh.from.side}:${sh.from.idx}`], b = icons[`${sh.to.side}:${sh.to.idx}`];
      if (!a || !b) continue;
      const dur = 220 / (speed * fastFwd);
      tracers.push({ a: { x: a.x, y: a.y }, b: { x: b.x + (sh.hit ? 0 : (Math.random() - 0.5) * 50), y: b.y + (sh.hit ? 0 : (Math.random() - 0.5) * 30) }, t0: performance.now(), dur, plane: a.kind === 'plane' });
      sfx && sfx.pew();
      await sleep(90);
      setTimeout(() => {
        if (sh.hit) { booms.push({ x: b.x, y: b.y, r: b.size * 0.4, t0: performance.now(), dur: 600 / speed }); sfx && sfx.hit(); }
        else splashes.push({ x: b.x + (Math.random() - 0.5) * 40, y: b.y + (Math.random() - 0.5) * 24, t0: performance.now(), dur: 500 / speed });
      }, dur);
      if (sh.hit) fades.push(new Promise((r) => setTimeout(r, dur)).then(() => fadeOut(b)));
    }
    await Promise.all(fades);
    await sleep(300);
    banner = { side: ev.winner, t0: performance.now() };
    sfx && sfx.boom();
    await sleep(1300);
    const lost = Object.values(icons).filter((i) => i.dead).length;
    navalLog.push({ island: ev.island, icons: Object.entries(icons).map(([k, v]) => ({ k, kind: v.kind, alpha: +v.alpha.toFixed(2), dead: v.dead })), lost, hits: ev.shots.filter((s) => s.hit).length, winner: ev.winner });
    done = true;
    cv.removeEventListener('pointerdown', onTap);
    root.hidden = true;
  })();
}
window.__NAVAL__ = navalLog;
