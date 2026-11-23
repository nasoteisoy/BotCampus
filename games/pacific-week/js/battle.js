// Combat board for sea and land fights, driven round by round by the week generator.
// Losses fade out (no health bars). A RETREAT button pulls Blue survivors out at a cost.
// Grown from the r1/r2 naval board (js/naval.js), same dark KG look.
import { shipTop, planeTop, drawFlag, SIDE_COL, soldier, bunker, secIcon } from './art.js?v=9e';
import { icon } from './icons.js?v=9e';
import { registerCanvasTip, unregisterCanvasTip } from './tips.js?v=9e';

const $ = (id) => document.getElementById(id);
export const navalLog = [];
export const battleLog = [];
window.__NAVAL__ = navalLog;
window.__BATTLE__ = battleLog;

// b: battle object from state.js; opts: { speed, sfx, terrain, world, at:{x,y}, blue:boolean, onRetreat }
export function openBoard(b, opts) {
  const { sfx, terrain, world, at } = opts;
  const speed = () => (opts.speedRef ? opts.speedRef() : opts.speed || 1);
  const root = $('naval'), cv = $('navalc'), rb = $('b-retreat');
  const land = b.kind === 'land';
  const hasPlanes = !land && (b.icons.blue.some((i) => i.kind === 'plane') || b.icons.red.some((i) => i.kind === 'plane'));
  $('nv-title').textContent = land ? 'LAND COMBAT' : hasPlanes ? 'NAVAL / AIR COMBAT' : 'NAVAL COMBAT';
  const sc = $('nv-sec'); const sg = sc.getContext('2d'); sg.clearRect(0, 0, sc.width, sc.height);
  sc.hidden = !land;
  if (land) secIcon(sg, b.secKind, sc.width / 2, sc.height / 2, sc.width * 0.8, '#e6ebf0');
  $('nv-amb').hidden = !(land && b.blind);
  root.classList.toggle('land', land);
  root.hidden = false;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  const top = 74, bottomPad = 80;
  // portrait phones turn the board: blue fights from the bottom, red from the top
  const portrait = H > W * 1.2;
  const VW = portrait ? H - top - bottomPad : W, VH = portrait ? W : H - top - bottomPad;
  const U = Math.min(VW * 0.12, VH * 0.19, 110);
  const icons = {};
  const key = (side, idx) => `${side}:${idx}`;
  for (const side of ['blue', 'red']) {
    const list = b.icons[side];
    const dir = side === 'blue' ? 1 : -1;
    const x0 = side === 'blue' ? VW * 0.05 : VW * 0.95;
    const span = VW * 0.42;
    const base = { side, dir, alpha: 1, dead: false, hitT: 0, ox: 0, oy: 0 };
    if (!land) {
      const ships = list.filter((x) => x.kind === 'ship'), planes = list.filter((x) => x.kind === 'plane');
      const cols = Math.max(1, Math.ceil(ships.length / 4)), rows = Math.ceil(ships.length / cols);
      const gapY = Math.min(U * 0.8, (VH * 0.6) / Math.max(1, rows));
      const yc = VH * (planes.length ? 0.62 : 0.52);
      ships.forEach((x, n) => {
        const c = Math.floor(n / rows), r = n % rows;
        icons[key(side, x.idx)] = { ...base, kind: 'ship', ship: x.ship, x: x0 + dir * (span * 0.78 - c * U * 1.3 - (r % 2) * U * 0.3), y: yc + (r - (rows - 1) / 2) * gapY, size: U };
      });
      const P = U * 0.55;
      planes.forEach((x, n) => {
        const k = Math.ceil(n / 2), sgn = n % 2 ? -1 : 1;
        icons[key(side, x.idx)] = { ...base, kind: 'plane', x: x0 + dir * (span * 0.85 - k * P * 0.9), y: VH * 0.2 + sgn * k * P * 0.75, size: P };
      });
    } else {
      // infantry in a loose skirmish block, forts in the front line, a support ship off the attacker's flank
      const inf = list.filter((x) => x.kind === 'inf'), forts = list.filter((x) => x.kind === 'fort'), sup = list.filter((x) => x.kind === 'support');
      const S = U * 0.78;
      const cols = Math.max(1, Math.ceil(inf.length / 4)), rows = Math.max(1, Math.min(4, inf.length));
      const gapY = Math.min(S * 0.95, (VH * 0.66) / rows);
      inf.forEach((x, n) => {
        const c = Math.floor(n / rows), r = n % rows;
        const front = forts.length ? 0.66 : 0.62; // infantry behind its bunkers when it has any
        icons[key(side, x.idx)] = { ...base, kind: 'inf', x: x0 + dir * (span * front - c * S * 0.95 - (r % 2) * S * 0.25), y: VH * 0.52 + (r - (rows - 1) / 2) * gapY, size: S, sunk: x.sunk };
      });
      forts.forEach((x, n) => {
        icons[key(side, x.idx)] = { ...base, kind: 'fort', neutral: x.neutral, x: x0 + dir * span * 0.93, y: VH * 0.52 + (n - (forts.length - 1) / 2) * Math.min(U * 1.05, VH * 0.7 / Math.max(1, forts.length)), size: U * 0.95 };
      });
      sup.forEach((x) => { icons[key(side, x.idx)] = { ...base, kind: 'support', x: x0 + dir * U * 0.2, y: VH * 0.9, size: U * 1.1 }; });
    }
    // icons lost before the fight (transports sunk) start faded
    list.forEach((x) => { const ic = icons[key(side, x.idx)]; if (ic && !x.alive) { ic.dead = true; ic.alpha = 0.12; } });
  }
  const tracers = [], booms = [], splashes = [];
  let done = false, fastFwd = 1, banner = null, retreatAnim = null;
  const onTap = () => { fastFwd = 5; };
  cv.addEventListener('click', onTap); // r9e: click (not pointerdown) so a long-press for a unit's name does not fast-forward
  // r9e: hover / long-press names the unit under the pointer (board coords: portrait boards are turned -90deg)
  const SHIP_TIP = { dd: 'Destroyer', bb: 'Battleship', cv: 'Carrier' };
  registerCanvasTip(cv, (sx, sy) => {
    const bx = portrait ? H - bottomPad - sy : sx, by = portrait ? sx : sy - top;
    let best = null, bd = 1e9;
    for (const ic of Object.values(icons)) { const d = Math.hypot(ic.x - bx, ic.y - by); if (d < ic.size * 0.6 && d < bd) { bd = d; best = ic; } }
    if (!best) return null;
    const nm = best.kind === 'ship' ? SHIP_TIP[best.ship] || 'Ship' : best.kind === 'plane' ? 'Plane' : best.kind === 'inf' ? 'Troops (1 company)' : best.kind === 'fort' ? 'Fort' : 'Ship support';
    return `<b>${nm}</b>${best.dead ? ' (lost)' : ''}`;
  });
  const board = { wantRetreat: false, icons };
  const showRetreat = (on) => { rb.hidden = !on; };
  rb.onclick = (e) => { e.stopPropagation(); board.wantRetreat = true; rb.classList.add('armed'); };
  rb.classList.remove('armed');
  board.setRetreat = showRetreat;
  showRetreat(opts.blue && b.canRetreat.blue);

  // background: for land, a darkened, desaturated crop of the real island terrain under the section
  let bgImg = null;
  if (land && terrain && at) {
    bgImg = document.createElement('canvas'); bgImg.width = Math.round(W / 2); bgImg.height = Math.round(H / 2);
    const q = bgImg.getContext('2d');
    const span = 520, sx = terrain.width / world.w, sy = terrain.height / world.h;
    const aspect = W / H; const ww = aspect >= 1 ? span * aspect : span, hh = aspect >= 1 ? span : span / aspect;
    q.filter = 'saturate(.55) brightness(.62) contrast(1.05)';
    q.drawImage(terrain, (at.x - ww / 2) * sx, (at.y - hh / 2) * sy, ww * sx, hh * sy, 0, 0, bgImg.width, bgImg.height);
    q.filter = 'none';
  }
  function draw() {
    const t = performance.now();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bgImg) {
      g.drawImage(bgImg, 0, 0, W, H);
      g.fillStyle = 'rgba(8,12,18,.38)'; g.fillRect(0, 0, W, H);
    } else {
      const bg = g.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H * 0.55, Math.max(W, H) * 0.75);
      bg.addColorStop(0, '#173a5e'); bg.addColorStop(0.6, '#0e2642'); bg.addColorStop(1, '#060f1e');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
    }
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x < W; x += 48) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = 0; y < H; y += 48) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    if (!land) {
      g.strokeStyle = 'rgba(160,200,240,.06)'; g.lineWidth = 2;
      for (let y = top + 20; y < H; y += 38) { g.beginPath(); for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x / 70 + y + t / 900) * 4); g.stroke(); }
    }
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.save();
    if (portrait) { g.translate(0, H - bottomPad); g.rotate(-Math.PI / 2); } else g.translate(0, top);
    if (land) {
      // front line smoke band
      g.fillStyle = 'rgba(200,200,190,.05)'; g.fillRect(VW * 0.46, 0, VW * 0.08, VH);
    }
    const rk = retreatAnim ? Math.min(1, (t - retreatAnim.t0) / (900 / speed())) : 0;
    for (const ic of Object.values(icons)) {
      const shake = ic.hitT && t - ic.hitT < 260 ? Math.sin(t / 18) * 3 : 0;
      const slide = retreatAnim && ic.side === retreatAnim.side && !ic.dead ? -ic.dir * rk * rk * VW * 0.5 : 0;
      g.save(); g.globalAlpha = ic.alpha * (retreatAnim && ic.side === retreatAnim.side && !ic.dead ? 1 - rk * 0.25 : 1);
      const x = ic.x + slide + shake, y = ic.y;
      const col = SIDE_COL[ic.side];
      if (ic.kind === 'ship' || ic.kind === 'support') {
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.beginPath(); g.ellipse(x - ic.dir * ic.size * 0.55, y, ic.size * 0.5, ic.size * 0.06, 0, 0, 7); g.fill();
        const L = ic.ship === 'dd' ? ic.size * 0.72 : ic.size; // destroyers small, carriers flat-decked
        g.save(); g.translate(x, y); g.scale(ic.dir, 1); shipTop(g, 0, 0, L, '#dfe5ec', ic.ship === 'cv'); g.restore();
        g.fillStyle = col.fill; g.fillRect(x - ic.size * 0.18, y + ic.size * 0.16, ic.size * 0.36, 3);
      } else if (ic.kind === 'plane') {
        planeTop(g, x, y + Math.sin(t / 300 + ic.x) * 3, ic.size, '#eef2f6', ic.dir === 1 ? 0 : Math.PI);
      } else if (ic.kind === 'inf') {
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, y + ic.size * 0.4, ic.size * 0.24, ic.size * 0.06, 0, 0, 7); g.fill();
        const bob = retreatAnim ? 0 : Math.sin(t / 220 + ic.y) * 1.2;
        if (portrait) { g.save(); g.translate(x, y + bob); g.rotate(Math.PI / 2); soldier(g, 0, 0, ic.size, '#dfe4ea', ic.dir); g.restore(); }
        else soldier(g, x, y + bob, ic.size, '#dfe4ea', ic.dir);
        g.fillStyle = col.fill; g.fillRect(x - ic.size * 0.2, y + ic.size * 0.46, ic.size * 0.4, 4);
      } else if (ic.kind === 'fort') {
        if (portrait) { g.save(); g.translate(x, y); g.rotate(Math.PI / 2); bunker(g, 0, 0, ic.size, '#bfc4c9', ic.neutral ? '#8a8f96' : col.fill); g.restore(); }
        else bunker(g, x, y, ic.size, '#bfc4c9', ic.neutral ? '#8a8f96' : col.fill);
      }
      g.restore();
    }
    for (const tr of tracers) {
      const k = Math.max(0, Math.min(1, (t - tr.t0) / tr.dur));
      const a = tr.a, bb = tr.b;
      const hx = a.x + (bb.x - a.x) * k, hy = a.y + (bb.y - a.y) * k;
      const tx = a.x + (bb.x - a.x) * Math.max(0, k - 0.25), ty = a.y + (bb.y - a.y) * Math.max(0, k - 0.25);
      g.strokeStyle = tr.plane ? 'rgba(255,240,180,.95)' : 'rgba(255,214,120,.95)'; g.lineWidth = tr.plane ? 2 : land ? 2 : 3;
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
    }
    for (const bm of booms) {
      const k = Math.max(0, Math.min(1, (t - bm.t0) / bm.dur));
      g.save(); g.globalAlpha = 1 - k;
      g.fillStyle = k < 0.25 ? '#fff6d0' : '#ff8a2a'; g.beginPath(); g.arc(bm.x, bm.y, bm.r * (0.4 + k), 0, 7); g.fill();
      g.fillStyle = 'rgba(30,30,34,.7)'; g.beginPath(); g.arc(bm.x + 6, bm.y - 10 - k * 20, bm.r * (0.3 + k * 0.9), 0, 7); g.fill();
      g.restore();
    }
    for (const s of splashes) {
      const k = Math.max(0, Math.min(1, (t - s.t0) / s.dur));
      g.save(); g.globalAlpha = 1 - k;
      if (land) { g.fillStyle = 'rgba(150,140,120,.8)'; g.beginPath(); g.arc(s.x, s.y, 3 + k * 12, 0, 7); g.fill(); }
      else { g.strokeStyle = '#d8ecff'; g.lineWidth = 2; g.beginPath(); g.arc(s.x, s.y, 4 + k * 16, 0, 7); g.stroke(); }
      g.restore();
    }
    g.restore();
    if (retreatAnim) {
      // retreat chevrons sweeping back toward the retreating side's edge
      const side = retreatAnim.side; g.save(); g.globalAlpha = 0.85 * (1 - rk * 0.5);
      const col = SIDE_COL[side].fill; g.fillStyle = col;
      for (let i = 0; i < 3; i++) {
        const k = (rk * 2 + i * 0.33) % 1;
        let cx, cy, ang;
        if (portrait) { cx = W / 2; cy = side === 'blue' ? H * 0.5 + k * H * 0.3 : H * 0.5 - k * H * 0.3; ang = side === 'blue' ? Math.PI / 2 : -Math.PI / 2; }
        else { cy = H / 2; cx = side === 'blue' ? W * 0.5 - k * W * 0.3 : W * 0.5 + k * W * 0.3; ang = side === 'blue' ? Math.PI : 0; }
        g.save(); g.translate(cx, cy); g.rotate(ang); g.beginPath(); g.moveTo(26, 0); g.lineTo(-6, -26); g.lineTo(-6, -12); g.lineTo(-30, -12); g.lineTo(-30, 12); g.lineTo(-6, 12); g.lineTo(-6, 26); g.closePath(); g.fill(); g.restore();
      }
      g.restore();
    }
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms / (speed() * fastFwd)));
  const fadeOut = (ic) => new Promise((res) => {
    ic.dead = true; ic.hitT = performance.now();
    const t0 = performance.now(), dur = 650 / (speed() * fastFwd);
    const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); ic.alpha = 1 - 0.88 * k; if (k < 1) requestAnimationFrame(step); else res(); };
    step();
  });
  board.intro = () => sleep(land && b.blind ? 700 : 450);
  const advance = () => new Promise((res) => {
    // infantry pushes toward the front line a little each round
    const movers = Object.values(icons).filter((i) => i.kind === 'inf' && !i.dead);
    const from = movers.map((i) => i.x);
    const step = (i) => { const front = i.side === 'blue' ? VW * 0.4 : VW * 0.6; const nx = i.x + i.dir * U * 0.16; return i.dir > 0 ? Math.min(front, nx) : Math.max(front, nx); };
    const to = movers.map(step);
    const t0 = performance.now(), dur = 260 / (speed() * fastFwd);
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / dur); movers.forEach((m, n) => { m.x = from[n] + (to[n] - from[n]) * k; }); if (k < 1) requestAnimationFrame(tick); else res(); };
    tick();
  });
  board.round = async (shots) => {
    if (land) await advance();
    const fades = [];
    for (const sh of shots) {
      const a = icons[key(sh.from.side, sh.from.idx)], t = icons[key(sh.to.side, sh.to.idx)];
      if (!a || !t) continue;
      const dur = 220 / (speed() * fastFwd);
      const jx = sh.hit ? 0 : (Math.random() - 0.5) * 50, jy = sh.hit ? 0 : (Math.random() - 0.5) * 30;
      tracers.push({ a: { x: a.x, y: a.y }, b: { x: t.x + jx, y: t.y + jy }, t0: performance.now(), dur, plane: a.kind === 'plane' });
      sfx && sfx.pew();
      await sleep(land ? 70 : 90);
      setTimeout(() => {
        if (sh.hit) { booms.push({ x: t.x, y: t.y, r: t.size * 0.4, t0: performance.now(), dur: 600 / speed() }); sfx && sfx.hit(); }
        else splashes.push({ x: t.x + jx, y: t.y + jy, t0: performance.now(), dur: 500 / speed() });
      }, dur);
      if (sh.hit) fades.push(new Promise((r) => setTimeout(r, dur)).then(() => fadeOut(t)));
    }
    await Promise.all(fades);
    await sleep(260);
    showRetreat(opts.blue && !b.done && b.canRetreat.blue);
  };
  // survivors pull back; `cost` of them are lost on the way out
  board.retreat = async (side, cost) => {
    showRetreat(false);
    const alive = Object.values(icons).filter((i) => i.side === side && !i.dead && (i.kind === 'inf' || i.kind === 'ship'));
    const lost = alive.slice(-Math.max(0, Math.min(alive.length, cost)));
    await Promise.all(lost.map(fadeOut));
    retreatAnim = { side, t0: performance.now() };
    sfx && sfx.alarm();
    board.retreatShown = true;
    await sleep(1000);
  };
  board.finish = async () => {
    showRetreat(false);
    await sleep(250);
    banner = { side: b.winner, t0: performance.now() };
    sfx && sfx.boom();
    await sleep(1200);
    const rec = { kind: b.kind, island: b.island, sec: b.sec || null, icons: Object.entries(icons).map(([k, v]) => ({ k, kind: v.kind, alpha: +v.alpha.toFixed(2), dead: v.dead })),
      lost: Object.values(icons).filter((i) => i.dead).length, hits: b.shotsAll.filter((s) => s.hit).length, winner: b.winner, retreated: b.retreated || null, rounds: b.round, blind: !!b.blind };
    battleLog.push(rec);
    if (!land) navalLog.push(rec);
    done = true;
    cv.removeEventListener('click', onTap); unregisterCanvasTip(cv);
    root.hidden = true; root.classList.remove('land');
  };
  return board;
}
