import * as G from './state.js';
import { SIDE_COL, drawFlag, portrait, shipSide, armySymbol, planeTop, crateIcon, star, arrowCurve, curvePt, drawArrow } from './art.js';
import { icon } from './icons.js';
import { createSpaceAudio } from './audio.js';
import { computeTerrain } from './terrain.js';
import { playNaval } from './naval.js';

const params = new URLSearchParams(location.search);
let speed = params.has('fast') ? 12 : 1;
const sfx = createSpaceAudio();
const $ = (id) => document.getElementById(id);
const cvs = $('map');
const g = cvs.getContext('2d');
const { w: WW, h: WH } = G.WORLD;
const R = G.CIRCLE_R;
const TAG_W = 84, TAG_H = 26, PR = 16; // unit tag box, portrait radius
const clone = (o) => JSON.parse(JSON.stringify(o));

let S, view, sel = null, busy = false, terrain = null, terrainScale = 0.75;
let fx = { moving: null, stayArrows: null, landing: null, pops: [], pulse: null, focusIsl: null };
const cam = { x: WW / 2, y: WH / 2, z: 0.5 };
let vw = 0, vh = 0, dpr = 1;
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

// ---------- setup ----------
function newGame(seed = Date.now() % 100000) {
  S = G.createGame(seed);
  view = snapshotView();
  sel = null; busy = false;
  fx = { moving: null, stayArrows: null, landing: null, pops: [], pulse: null, focusIsl: null };
  $('end').hidden = true;
  setBanner(S.week, false);
  fitCamera(true);
  updateHud();
}
function snapshotView() { return { islands: clone(S.islands), units: clone(S.units) }; }
const vIsl = (id) => view.islands.find((i) => i.id === id);

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  vw = window.innerWidth; vh = window.innerHeight;
  cvs.width = Math.round(vw * dpr); cvs.height = Math.round(vh * dpr);
  clampCam();
}
const contain = () => Math.min(vw / WW, vh / WH);
const zMin = () => Math.min(contain() * 0.95, 0.3);
const zMax = 2.4;
function fitCamera(home) {
  cam.z = Math.max(contain(), Math.min(vw, vh) < 560 ? 0.46 : 0.36); // phones start closer so unit tags read without zooming
  const k = G.island(S, 'kestra');
  cam.x = home ? k.x + (vw / cam.z) * 0.25 : WW / 2;
  cam.y = WH / 2;
  clampCam();
}
function clampCam() {
  cam.z = Math.max(zMin(), Math.min(zMax, cam.z));
  const hw = vw / cam.z / 2, hh = vh / cam.z / 2, m = 120;
  cam.x = hw * 2 >= WW + 2 * m ? WW / 2 : Math.max(hw - m, Math.min(WW - hw + m, cam.x));
  cam.y = hh * 2 >= WH + 2 * m ? WH / 2 : Math.max(hh - m, Math.min(WH - hh + m, cam.y));
}
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + vw / 2, y: (y - cam.y) * cam.z + vh / 2 });
const toWorld = (x, y) => ({ x: (x - vw / 2) / cam.z + cam.x, y: (y - vh / 2) / cam.z + cam.y });

// ---------- layout ----------
function unitsAtView(islId) {
  return view.units.filter((u) => u.at === islId && !(fx.moving && fx.moving.ids.has(u.id)))
    .sort((a, b) => (a.side === b.side ? (a.kind === b.kind ? a.cmd - b.cmd : a.kind === 'fleet' ? 1 : -1) : a.side === 'blue' ? -1 : 1));
}
// Centre of a tag inside its island circle; tags stack in one column, scaled down when crowded.
function slot(islId, u) {
  const isl = vIsl(islId);
  const list = unitsAtView(islId);
  const n = list.length, k = Math.max(0, list.indexOf(u));
  const sc = fitScale(n, (n > 4 ? 4 / n : 1) * tokenScale());
  const gap = 34 * sc;
  return { x: isl.x + 7 * sc, y: isl.y + 8 + (k - (n - 1) / 2) * gap, s: sc };
}
// largest scale <= want at which every tag corner of an n-stack stays inside the island circle
function fitScale(n, want) {
  const R = G.CIRCLE_R - 6;
  for (let sc = want; sc > 0.3; sc -= 0.02) {
    const b = tagBounds(7 * sc, 0, sc);
    const yMax = Math.max(Math.abs(-((n - 1) / 2) * 34 * sc + 8 + b.y0), Math.abs(((n - 1) / 2) * 34 * sc + 8 + b.y1));
    const xMax = Math.max(Math.abs(b.x0), Math.abs(b.x1));
    if (Math.hypot(xMax, yMax) <= R) return sc;
  }
  return 0.3;
}
// tags grow when zoomed out so they stay readable, but never past what fits inside the circle
const tokenScale = () => Math.max(1, Math.min(2.2, 0.8 / cam.z));
function tagBounds(cx, cy, s) {
  return { x0: cx + (-TAG_W / 2 + 1 - PR) * s, x1: cx + (TAG_W / 2 - 1) * s, y0: cy - PR * s, y1: cy + PR * s };
}

// ---------- render ----------
let tNow = 0;
function frame() {
  tNow = performance.now();
  render();
  requestAnimationFrame(frame);
}
function render() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0f1724'; g.fillRect(0, 0, vw, vh);
  g.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z), dpr * (vh / 2 - cam.y * cam.z));
  if (terrain) { g.imageSmoothingEnabled = true; g.drawImage(terrain, 0, 0, WW, WH); }
  drawGrid();
  if (!busy && S.lastArrows.length) S.lastArrows.forEach((a) => drawArrowBetween(a.from, a.to, a.side, 1, 0.22, a.kind));
  view.islands.forEach(drawIsland);
  if (sel && !busy) drawRange();
  if (!busy) Object.entries(S.orders).forEach(([id, to]) => {
    const u = G.unit(S, id);
    if (u && u.side === 'blue') drawArrowBetween(u.at, to, 'blue', 1, 0.5 + 0.2 * Math.sin(tNow / 260), u.kind);
  });
  if (fx.stayArrows) fx.stayArrows.forEach((m) => drawArrowBetween(m.from, m.to, m.side, 1, 0.85, m.kind));
  if (fx.moving) fx.moving.list.forEach((m) => drawArrowBetween(m.from, m.to, m.side, fx.moving.t, 0.9, m.kind));
  view.islands.forEach((isl) => unitsAtView(isl.id).forEach((u) => { const p = slot(isl.id, u); drawTag(u, p.x, p.y, p.s); }));
  if (fx.moving) fx.moving.list.forEach((m) => {
    const u = view.units.find((x) => x.id === m.unit); if (!u) return;
    const p = curvePt(curveFor(m.from, m.to, m.kind), Math.min(1, ease(fx.moving.t) * 0.98));
    drawTag(u, p.x, p.y, tokenScale());
  });
  if (fx.landing) drawLanding(fx.landing);
  if (fx.pulse) drawPulse(fx.pulse);
  fx.pops = fx.pops.filter((p) => tNow - p.t0 < 1600 / speed);
  fx.pops.forEach(drawPop);
  // screen-space vignette
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
  g.fillStyle = vg; g.fillRect(0, 0, vw, vh);
  if (hintTarget) placeHint();
}
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function drawGrid() {
  const a = toWorld(0, 0), b = toWorld(vw, vh);
  g.lineWidth = 1 / cam.z;
  for (let step of [100, 500]) {
    g.strokeStyle = step === 100 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.07)';
    g.beginPath();
    for (let x = Math.max(0, Math.floor(a.x / step) * step); x <= Math.min(WW, b.x); x += step) { g.moveTo(x, Math.max(0, a.y)); g.lineTo(x, Math.min(WH, b.y)); }
    for (let y = Math.max(0, Math.floor(a.y / step) * step); y <= Math.min(WH, b.y); y += step) { g.moveTo(Math.max(0, a.x), y); g.lineTo(Math.min(WW, b.x), y); }
    g.stroke();
  }
}

function curveFor(fromId, toId, kind) {
  const a = vIsl(fromId), b = vIsl(toId);
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
  const off = kind === 'fleet' ? 26 : -26; // fleet and army arrows on the same lane sit side by side
  const p0 = { x: a.x + ux * R * 0.55 - uy * off, y: a.y + uy * R * 0.55 + ux * off };
  const p1 = { x: b.x - ux * R * 0.72 - uy * off, y: b.y - uy * R * 0.72 + ux * off };
  return arrowCurve(p0, p1, kind === 'fleet' ? -0.12 : 0.12);
}
function drawArrowBetween(fromId, toId, side, t, alpha, kind) {
  drawArrow(g, curveFor(fromId, toId, kind), side, ease(t), { width: (kind === 'fleet' ? 30 : 42) * tokenScale(), alpha });
}

function drawIsland(isl) {
  const own = isl.owner;
  const ringCol = own ? SIDE_COL[own].fill : '#8a8f96';
  g.save();
  g.fillStyle = 'rgba(8,12,16,.22)';
  g.beginPath(); g.arc(isl.x, isl.y, R, 0, Math.PI * 2); g.fill();
  g.lineWidth = 7; g.strokeStyle = ringCol; g.globalAlpha = 0.85; g.stroke();
  g.globalAlpha = 1; g.lineWidth = 2.2; g.strokeStyle = 'rgba(255,255,255,.75)';
  g.beginPath(); g.arc(isl.x, isl.y, R - 5, 0, Math.PI * 2); g.stroke();
  // reach highlight when a unit is selected
  if (sel && !busy) {
    const u = G.unit(S, sel);
    if (u && u.at !== isl.id && G.canOrder(S, u, isl.id)) {
      g.setLineDash([18, 12]); g.lineDashOffset = -tNow / 30; g.lineWidth = 5; g.strokeStyle = 'rgba(245,197,24,.95)';
      g.beginPath(); g.arc(isl.x, isl.y, R + 12, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
  }
  // type badge at the top of the ring
  const bx = isl.x, by = isl.y - R;
  g.fillStyle = '#12161c'; g.beginPath(); g.arc(bx, by, 21, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3; g.strokeStyle = ringCol; g.stroke();
  if (isl.type === 'home') star(g, bx, by, 13, '#f2c43a');
  else if (isl.type === 'supply') crateIcon(g, bx, by, 24, '#e8dcb8');
  else if (isl.type === 'air') planeTop(g, bx, by, 30, '#e6ebf0', -Math.PI / 2);
  else { g.fillStyle = '#c8cdd4'; g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill(); }
  // owner flag
  if (own) drawFlag(g, own, isl.x - R * 0.72 - 16, isl.y - R * 0.72 - 11, 32, 21);
  // garrison forts: small white blocks along the bottom inside the ring
  for (let i = 0; i < isl.gar; i++) {
    const x = isl.x - (isl.gar - 1) * 9 + i * 18, y = isl.y + R - 22;
    g.fillStyle = 'rgba(20,22,26,.9)'; g.fillRect(x - 7, y - 6, 14, 12);
    g.fillStyle = own ? SIDE_COL[own].light : '#d0d4da'; g.fillRect(x - 5, y - 4, 10, 8);
    g.fillRect(x - 5, y - 7, 3, 3); g.fillRect(x + 2, y - 7, 3, 3);
  }
  // name
  g.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(isl.name, isl.x, isl.y + R + 10);
  g.fillStyle = 'rgba(240,242,236,.92)'; g.fillText(isl.name, isl.x, isl.y + R + 10);
  g.restore();
}

function drawRange() {
  const u = G.unit(S, sel); if (!u) return;
  const isl = vIsl(u.at);
  g.save(); g.setLineDash([10, 14]); g.lineWidth = 3 / Math.max(0.6, cam.z); g.strokeStyle = 'rgba(245,197,24,.35)';
  g.beginPath(); g.arc(isl.x, isl.y, G.RANGE[u.kind], 0, Math.PI * 2); g.stroke(); g.restore();
}

function drawTag(u, cx, cy, s = 1, alpha = 1, c = g) {
  c.save(); c.translate(cx, cy); c.scale(s, s); c.globalAlpha = alpha;
  const x0 = -TAG_W / 2 - 7, y0 = -TAG_H / 2;
  const selected = u.id === sel;
  c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  c.fillStyle = 'rgba(16,18,20,.9)'; c.fillRect(x0 + 6, y0, TAG_W, TAG_H);
  c.shadowColor = 'transparent';
  c.lineWidth = selected ? 3 : 1.2; c.strokeStyle = selected ? '#f5c518' : 'rgba(255,255,255,.35)';
  c.strokeRect(x0 + 6, y0, TAG_W, TAG_H);
  c.fillStyle = SIDE_COL[u.side].fill; c.fillRect(x0 + 6, y0 + TAG_H - 3, TAG_W, 3);
  drawFlag(c, u.side, x0 + 26, y0 + 6, 20, 13);
  if (u.kind === 'fleet') shipSide(c, x0 + 60, y0 + 13, 22, '#e9edf1');
  else armySymbol(c, x0 + 60, y0 + 12, 18, '#e9edf1');
  // strength pips (2 rows of 3)
  for (let i = 0; i < u.str; i++) {
    const px = x0 + 77 + (i % 3) * 6, py = y0 + 8 + Math.floor(i / 3) * 7;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, 2.3, 0, 7); c.fill();
  }
  // commander portrait overlapping the left end
  const pic = portrait(u.side, u.cmd, 64);
  c.drawImage(pic, x0 + 6 - PR + 2, -PR, PR * 2, PR * 2);
  if (selected) { c.lineWidth = 3; c.strokeStyle = '#f5c518'; c.beginPath(); c.arc(x0 + 8, 0, PR + 1.5, 0, 7); c.stroke(); }
  c.restore();
}

function drawPop(p) {
  const k = Math.max(0, Math.min(1, (tNow - p.t0) / (1600 / speed)));
  const isl = vIsl(p.island);
  g.save(); g.globalAlpha = 1 - k * k;
  const x = isl.x + 60, y = isl.y - R - 30 - k * 50;
  g.fillStyle = 'rgba(14,18,22,.92)'; g.fillRect(x - 46, y - 20, 92 + (p.ships ? 50 : 0), 40);
  g.strokeStyle = SIDE_COL[p.side].fill; g.lineWidth = 3; g.strokeRect(x - 46, y - 20, 92 + (p.ships ? 50 : 0), 40);
  g.fillStyle = '#fff'; g.font = '900 28px "Barlow Condensed", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(`+${p.troops}`, x - 38, y + 1);
  armySymbol(g, x + 22, y, 22, '#fff');
  if (p.ships) { g.fillText('+1', x + 46, y + 1); shipSide(g, x + 82, y + 2, 22, '#fff'); }
  g.restore();
}

function drawPulse(p) {
  const k = Math.max(0, (tNow - p.t0) / (900 / speed));
  if (k > 1) { fx.pulse = null; return; }
  const isl = vIsl(p.island);
  g.save(); g.globalAlpha = 1 - k; g.lineWidth = 14 * (1 - k) + 2; g.strokeStyle = SIDE_COL[p.side].fill;
  g.beginPath(); g.arc(isl.x, isl.y, R + k * 90, 0, 7); g.stroke(); g.restore();
}

// Landing clash on the island map: troop icons around the circle fade out as hits land; sparks inside.
function drawLanding(L) {
  const isl = vIsl(L.ev.island);
  const col = SIDE_COL[L.ev.side], dcol = L.ev.prevOwner ? SIDE_COL[L.ev.prevOwner] : { fill: '#9aa0a6' };
  const ring = (n, angC, radius, colr, alive, alphaOf) => {
    for (let i = 0; i < n; i++) {
      const a = angC + (i - (n - 1) / 2) * 0.32;
      const x = isl.x + Math.cos(a) * radius, y = isl.y + Math.sin(a) * radius;
      const al = alphaOf(i);
      g.save(); g.globalAlpha = al;
      g.fillStyle = 'rgba(10,12,14,.85)'; g.fillRect(x - 13, y - 10, 26, 20);
      g.lineWidth = 2; g.strokeStyle = colr; g.strokeRect(x - 13, y - 10, 26, 20);
      armySymbol(g, x, y, 15, '#f2f4f6');
      g.restore();
    }
  };
  const ang = L.ang;
  ring(L.ev.atk0 + L.ev.transportLoss, ang, R + 34, col.fill, L.atkAlive, (i) => L.atkAlpha[i]);
  ring(L.ev.def0, ang + Math.PI, R * 0.55, dcol.fill, L.defAlive, (i) => L.defAlpha[i]);
  L.sparks = L.sparks.filter((s) => tNow - s.t0 < 450 / speed);
  for (const s of L.sparks) {
    const k = Math.max(0, Math.min(1, (tNow - s.t0) / (450 / speed)));
    g.save();
    // smoke puff rising
    g.globalAlpha = 0.55 * (1 - k); g.fillStyle = '#2a2a2c';
    g.beginPath(); g.arc(s.x + 4, s.y - 6 - k * 26, 6 + k * 18, 0, 7); g.fill();
    // shell burst: hot core + spiky rays
    g.globalAlpha = 1 - k;
    g.fillStyle = '#ff7a1a'; g.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + s.x, rr = (i % 2 ? 6 : 15) * (0.6 + k * 0.9); g.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(s.x, s.y, 5 * (1 - k) + 1, 0, 7); g.fill();
    g.restore();
  }
}

// ---------- HUD ----------
function setBanner(week, flip) {
  $('wkn').textContent = week;
  const b = $('banner');
  if (flip) { b.classList.remove('flip'); void b.offsetWidth; b.classList.add('flip'); }
}
function updateHud() {
  const nb = S.islands.filter((i) => i.owner === 'blue').length, nr = S.islands.filter((i) => i.owner === 'red').length;
  $('c-blue').querySelector('b').textContent = nb; $('c-red').querySelector('b').textContent = nr;
  const n = Object.keys(S.orders).filter((id) => G.unit(S, id)?.side === 'blue').length;
  $('ordn').hidden = !n; $('ordn').textContent = n;
  $('b-end').disabled = busy || !!S.over;
  const p = $('sel');
  const u = sel && G.unit(S, sel);
  if (!u || busy) { p.hidden = true; return; }
  p.hidden = false;
  const pg = $('sel-portrait').getContext('2d'); pg.clearRect(0, 0, 112, 112); pg.drawImage(portrait(u.side, u.cmd, 112), 0, 0);
  const fg = $('sel-flag').getContext('2d'); drawFlag(fg, u.side, 1, 1, 40, 26);
  const kg = $('sel-kind').getContext('2d'); kg.clearRect(0, 0, 44, 30);
  if (u.kind === 'fleet') shipSide(kg, 22, 17, 38, '#e9edf1'); else armySymbol(kg, 22, 15, 30, '#e9edf1');
  $('sel-pips').innerHTML = Array.from({ length: u.str }, () => '<i></i>').join('');
  $('sel-x').hidden = !S.orders[u.id];
}
function toast(html, ms = 1100) {
  const t = $('toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms / Math.max(1, speed / 3));
}

// first-run hints
let hintStep = localStorage.getItem('pacificweek:hint') === 'done' || params.has('nohint') ? 'done' : 'unit';
let hintTarget = null;
function refreshHint() {
  const h = $('hint');
  if (hintStep === 'done' || busy || S.over || !$('title').hidden) { h.hidden = true; hintTarget = null; return; }
  if (hintStep === 'unit') { hintTarget = { world: G.island(S, 'kestra') }; $('hint-t').textContent = 'TAP YOUR ARMY'; }
  else if (hintStep === 'dest') { hintTarget = { world: G.island(S, 'oska') }; $('hint-t').textContent = 'TAP AN ISLAND'; }
  else { hintTarget = { el: $('b-end') }; $('hint-t').textContent = 'END WEEK'; }
  h.hidden = false;
}
function placeHint() {
  const h = $('hint');
  if (hintTarget.world) {
    const p = toScreen(hintTarget.world.x, hintTarget.world.y - R - 30);
    const hw = h.offsetWidth / 2 + 6;
    h.classList.remove('below'); h.style.left = `${Math.max(hw, Math.min(vw - hw, p.x))}px`; h.style.top = `${Math.max(h.offsetHeight + 70, p.y)}px`;
  } else {
    const r = hintTarget.el.getBoundingClientRect();
    h.classList.remove('below'); h.style.left = `${Math.min(vw - 90, r.left + r.width / 2)}px`; h.style.top = `${r.top - 14}px`;
  }
}
function advanceHint(step) {
  if (hintStep === 'done') return;
  hintStep = step;
  if (step === 'done') localStorage.setItem('pacificweek:hint', 'done');
  refreshHint();
}

// ---------- interaction ----------
function tagAt(wx, wy) {
  for (const isl of view.islands) {
    for (const u of unitsAtView(isl.id)) {
      const p = slot(isl.id, u), b = tagBounds(p.x, p.y, p.s);
      if (wx >= b.x0 && wx <= b.x1 && wy >= b.y0 && wy <= b.y1) return u;
    }
  }
  return null;
}
function islandAt(wx, wy) {
  let best = null, bd = 1e9;
  for (const isl of S.islands) { const d = Math.hypot(isl.x - wx, isl.y - wy); if (d < R * 1.15 && d < bd) { bd = d; best = isl; } }
  return best;
}
function select(id) { sel = id; if (id) advanceHint('dest'); updateHud(); sfx.pew(); }
function tapAt(sx, sy) {
  if (busy || S.over) return;
  const w = toWorld(sx, sy);
  const tag = tagAt(w.x, w.y);
  const isl = islandAt(w.x, w.y);
  const cur = sel && G.unit(S, sel);
  if (tag && tag.side === 'blue' && (!cur || tag.at === cur.at || !isl || isl.id === cur.at)) { select(tag.id === sel ? null : tag.id); return; }
  if (cur && isl && isl.id !== cur.at) {
    if (G.issueOrder(S, cur.id, isl.id)) { sfx.hit(); advanceHint('end'); sel = null; updateHud(); return; }
  }
  if (isl) {
    const mine = G.unitsAt(S, isl.id, 'blue');
    if (mine.length) {
      const i = cur ? mine.findIndex((u) => u.id === cur.id) : -1;
      select(mine[(i + 1) % mine.length].id); return;
    }
    if (cur) { toast(`${icon('x', { size: 28 })}`, 700); return; }
  }
  sel = null; updateHud();
}

const pointers = new Map();
let gesture = null;
cvs.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  cvs.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: cam.z, mid: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2), moved: true };
  }
});
cvs.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gesture) return;
  if (gesture.type === 'pan' && pointers.size === 1) {
    const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
    if (Math.hypot(dx, dy) > 8) { gesture.moved = true; cvs.classList.add('drag'); }
    if (gesture.moved) { cam.x = gesture.cx - dx / cam.z; cam.y = gesture.cy - dy / cam.z; clampCam(); }
  } else if (gesture.type === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    cam.z = gesture.z0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, gesture.d0);
    clampCam();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.x = gesture.mid.x - (mx - vw / 2) / cam.z; cam.y = gesture.mid.y - (my - vh / 2) / cam.z; clampCam();
  }
});
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  cvs.classList.remove('drag');
  if (gesture && gesture.type === 'pan' && !gesture.moved && pointers.size === 0 && e.type === 'pointerup') tapAt(e.clientX, e.clientY);
  if (pointers.size === 0) gesture = null;
  else if (pointers.size === 1) { const [p] = [...pointers.values()]; gesture = { type: 'pan', sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: true }; }
};
cvs.addEventListener('pointerup', endPointer);
cvs.addEventListener('pointercancel', endPointer);
cvs.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
function zoomAt(sx, sy, f) {
  const before = toWorld(sx, sy);
  cam.z *= f; clampCam();
  const after = toWorld(sx, sy);
  cam.x += before.x - after.x; cam.y += before.y - after.y; clampCam();
}
window.addEventListener('keydown', (e) => {
  if (!$('title').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startPlay(); } return; }
  if (e.key === 'Escape') { $('help').hidden = true; sel = null; updateHud(); }
  else if ((e.key === 'Enter' || e.key === ' ') && $('end').hidden && $('help').hidden) { e.preventDefault(); doEndWeek(); }
  else if (e.key === 'Tab') {
    e.preventDefault(); if (busy) return;
    const mine = S.units.filter((u) => u.side === 'blue');
    const i = mine.findIndex((u) => u.id === sel);
    if (mine.length) { const u = mine[(i + 1) % mine.length]; select(u.id); const isl = G.island(S, u.at); cam.x = isl.x; cam.y = isl.y; clampCam(); }
  } else if (e.key === '+' || e.key === '=') zoomAt(vw / 2, vh / 2, 1.25);
  else if (e.key === '-') zoomAt(vw / 2, vh / 2, 0.8);
  else if (e.key.startsWith('Arrow')) {
    const d = 80 / cam.z;
    if (e.key === 'ArrowLeft') cam.x -= d; if (e.key === 'ArrowRight') cam.x += d;
    if (e.key === 'ArrowUp') cam.y -= d; if (e.key === 'ArrowDown') cam.y += d;
    clampCam();
  } else if (/^[1-9]$/.test(e.key) && sel) {
    // number keys order the selected unit to the n-th reachable island (keyboard play)
    const u = G.unit(S, sel); const r = G.reachable(S, u);
    const id = r[+e.key - 1]; if (id && G.issueOrder(S, u.id, id)) { advanceHint('end'); sel = null; updateHud(); }
  }
});

// ---------- week resolution ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed));
function tween(ms, fn) {
  return new Promise((res) => {
    const t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / (ms / speed)); fn(k); if (k < 1) requestAnimationFrame(step); else res(); };
    step();
  });
}
async function focus(isl, z) {
  const c0 = { x: cam.x, y: cam.y, z: cam.z };
  const z1 = Math.max(cam.z, z || cam.z);
  await tween(500, (k) => { const e = ease(k); cam.z = c0.z + (z1 - c0.z) * e; cam.x = c0.x + (isl.x - c0.x) * e; cam.y = c0.y + (isl.y - c0.y) * e; clampCam(); });
}
function syncIsland(islId) {
  const live = G.island(S, islId), v = vIsl(islId);
  // keep units that are still alive; take their live position and strength
  view.units = view.units.filter((u) => G.unit(S, u.id)).map((u) => {
    const l = G.unit(S, u.id);
    return (u.at === islId || l.at === islId) ? { ...u, at: l.at, str: l.str } : u;
  });
  return { live, v };
}
let lastEvents = [];
async function doEndWeek(opts = {}) {
  if (busy || S.over || !$('title').hidden) return;
  busy = true; sel = null; advanceHint('done'); updateHud(); refreshHint();
  const camBefore = { x: cam.x, y: cam.y, z: cam.z };
  view = snapshotView();
  const events = G.endWeek(S, opts);
  lastEvents = events;
  const moves = events.find((e) => e.type === 'moves').moves;
  // 1. orders animate: thick arrows draw on, tags ride along them
  if (moves.length) {
    fx.moving = { list: moves, ids: new Set(moves.map((m) => m.unit)), t: 0 };
    sfx.alarm();
    await tween(1500, (k) => { fx.moving.t = k; });
    moves.forEach((m) => { const u = view.units.find((x) => x.id === m.unit); if (u) u.at = m.to; });
    fx.stayArrows = moves; fx.moving = null;
    await wait(250);
  }
  // 2. fleet clashes cut to the naval / air board
  for (const ev of events.filter((e) => e.type === 'naval')) {
    await focus(vIsl(ev.island), 0.9);
    await playNaval(ev, { speed, sfx });
    syncIsland(ev.island);
    ev.retreats.forEach((r) => { const u = view.units.find((x) => x.id === r.unit); if (u) u.at = r.to; });
  }
  // 3. landings fight on the island map
  for (const ev of events.filter((e) => e.type === 'landing')) {
    const isl = vIsl(ev.island);
    await focus(isl, 1.05);
    const from = moves.filter((m) => ev.attackers.includes(m.unit)).map((m) => vIsl(m.from));
    const ax = from.length ? from.reduce((n, f) => n + f.x, 0) / from.length : isl.x - 1;
    const ay = from.length ? from.reduce((n, f) => n + f.y, 0) / from.length : isl.y;
    const nA = ev.atk0 + ev.transportLoss;
    const L = { ev, ang: Math.atan2(ay - isl.y, ax - isl.x), atkAlpha: Array(nA).fill(1), defAlpha: Array(ev.def0).fill(1), sparks: [] };
    fx.landing = L;
    let atkDead = 0, defDead = 0;
    const fade = (arr, idx) => { const k0 = arr[idx]; return tween(380, (k) => { arr[idx] = Math.max(0.12, k0 * (1 - k)); }); };
    if (ev.transportLoss) {
      await Promise.all(Array.from({ length: ev.transportLoss }, (_, i) => fade(L.atkAlpha, nA - 1 - i)));
      atkDead = ev.transportLoss;
    }
    for (const r of ev.rolls) {
      for (let i = 0; i < 3; i++) L.sparks.push({ x: isl.x + (Math.random() - 0.5) * R * 1.4, y: isl.y + (Math.random() - 0.5) * R * 1.4, t0: performance.now() });
      sfx.hit();
      const jobs = [];
      for (let i = 0; i < r.hitsOnDef; i++) jobs.push(fade(L.defAlpha, ev.def0 - 1 - defDead++));
      for (let i = 0; i < r.hitsOnAtk; i++) jobs.push(fade(L.atkAlpha, nA - 1 - atkDead++));
      await Promise.all(jobs);
      await wait(160);
    }
    v_apply(ev);
    if (ev.won) { fx.pulse = { island: ev.island, side: ev.side, t0: performance.now() }; sfx.boom(); }
    updateHud();
    await wait(650);
    fx.landing = null;
  }
  // 4. camera back to where the player was, reinforcements, then the new week
  if (Math.abs(cam.z - camBefore.z) > 0.01 || Math.hypot(cam.x - camBefore.x, cam.y - camBefore.y) > 4) {
    const c0 = { x: cam.x, y: cam.y, z: cam.z };
    await tween(450, (k) => { const e = ease(k); cam.z = c0.z + (camBefore.z - c0.z) * e; cam.x = c0.x + (camBefore.x - c0.x) * e; cam.y = c0.y + (camBefore.y - c0.y) * e; clampCam(); });
  }
  view = snapshotView();
  fx.stayArrows = null;
  for (const ev of events.filter((e) => e.type === 'reinforce')) fx.pops.push({ ...ev, t0: performance.now() });
  setBanner(S.week, true);
  busy = false;
  updateHud(); refreshHint();
  if (S.over) { await wait(900); showEnd(); }
  return events;
}
function v_apply(ev) {
  const v = vIsl(ev.island);
  v.owner = ev.won ? ev.side : ev.prevOwner;
  v.gar = G.island(S, ev.island).owner === v.owner ? G.island(S, ev.island).gar : 0;
  syncIsland(ev.island);
}

// ---------- end card (adapted from parts-library battle-endcard) ----------
function showEnd() {
  const win = S.over.winner === 'blue';
  const st = S.stats;
  const owned = S.islands.filter((i) => i.owner === 'blue').length;
  const stat = (ic, val, lab) => `<div class="ec-stat">${ic}<b>${val}</b><small>${lab}</small></div>`;
  $('endcard').innerHTML = `
    <h1 class="ec-title ${win ? 'win' : 'lose'}">${win ? 'VICTORY' : 'DEFEAT'}</h1>
    <canvas class="ec-flag" id="ec-flag" width="180" height="120"></canvas>
    <div class="ec-grid">
      ${stat(icon('flag', { size: 24 }), S.over.week, 'WEEKS')}
      ${stat(icon('planet', { size: 24 }), `${owned}/${S.islands.length}`, 'ISLANDS')}
      ${stat(icon('anchor', { size: 24 }), `${st.navalWon}/${st.navalFought}`, 'SEA')}
      ${stat(icon('swords', { size: 24 }), `${st.landWon}/${st.landFought}`, 'LAND')}
      ${stat(icon('users', { size: 24 }), st.lost.blue + st.sunk.blue, 'LOST')}
    </div>
    <button class="btn primary big" id="b-again" aria-label="Play again">${icon('refresh', { size: 26 })}<span class="lb">AGAIN</span></button>`;
  drawFlag($('ec-flag').getContext('2d'), S.over.winner, 2, 2, 176, 116);
  $('end').hidden = false;
  $('b-again').onclick = () => { newGame(); refreshHint(); };
  if (win) sfx.alarm(); else sfx.boom();
}

// ---------- help legend ----------
function buildLegend() {
  const rows = [
    ['army', 'ARMY', 'takes islands'], ['fleet', 'FLEET', 'sea fights'], ['supply', 'SUPPLY', '+ troops each week'],
    ['air', 'AIRFIELD', '+ planes at sea'], ['home', 'HOME', 'take theirs to win'], ['reach', 'REACH', 'one week of travel'],
  ];
  $('legend').innerHTML = rows.map(([k, a, b]) => `<canvas data-k="${k}" width="200" height="80"></canvas><div>${a}<small>${b}</small></div>`).join('');
  $('legend').querySelectorAll('canvas').forEach((c) => {
    const k = c.dataset.k, q = c.getContext('2d');
    q.scale(2, 2);
    if (k === 'army' || k === 'fleet') { q.translate(58, 20); drawTag({ side: 'blue', kind: k, str: 4, cmd: k === 'army' ? 1 : 3, id: 'x' }, 0, 0, 1, 1, q); return; }
    q.fillStyle = '#12161c'; q.beginPath(); q.arc(50, 20, 17, 0, 7); q.fill(); q.lineWidth = 3; q.strokeStyle = SIDE_COL.blue.fill; q.stroke();
    if (k === 'home') star(q, 50, 20, 11, '#f2c43a');
    else if (k === 'supply') crateIcon(q, 50, 20, 20, '#e8dcb8');
    else if (k === 'air') planeTop(q, 50, 20, 26, '#e6ebf0', -Math.PI / 2);
    else { q.clearRect(0, 0, 100, 40); q.setLineDash([5, 4]); q.lineWidth = 3; q.strokeStyle = '#f5c518'; q.beginPath(); q.arc(50, 20, 16, 0, 7); q.stroke(); }
  });
}
// ---------- boot ----------
function startPlay() {
  if (!terrain) return;
  $('title').hidden = true; sfx.unlock(); refreshHint();
}
function icons() {
  $('b-restart').innerHTML = icon('refresh', { size: 24 });
  $('b-help').innerHTML = icon('help', { size: 24 });
  $('b-sound').innerHTML = icon('volume', { size: 24 });
  $('z-in').innerHTML = icon('plus', { size: 24 });
  $('z-out').innerHTML = icon('minus', { size: 24 });
  $('z-fit').innerHTML = icon('fit', { size: 24 });
  $('sel-x').innerHTML = icon('x', { size: 24 });
  $('b-end').querySelector('.i').innerHTML = icon('skip', { size: 26 });
  $('b-play').querySelector('.i').innerHTML = icon('play', { size: 28 });
  $('help-ok').querySelector('.i').innerHTML = icon('check', { size: 24 });
  drawFlag($('c-blue').querySelector('canvas').getContext('2d'), 'blue', 1, 1, 34, 22);
  drawFlag($('c-red').querySelector('canvas').getContext('2d'), 'red', 1, 1, 34, 22);
  drawFlag($('t-fb').getContext('2d'), 'blue', 1, 1, 70, 46);
  drawFlag($('t-fr').getContext('2d'), 'red', 1, 1, 70, 46);
  drawFlag($('nv-fb').getContext('2d'), 'blue', 1, 1, 46, 30);
  drawFlag($('nv-fr').getContext('2d'), 'red', 1, 1, 46, 30);
}
function wire() {
  $('b-play').onclick = startPlay;
  $('b-end').onclick = () => doEndWeek();
  $('b-restart').onclick = () => { if (!busy) { newGame(); refreshHint(); } };
  $('b-help').onclick = () => { $('help').hidden = false; };
  $('help-ok').onclick = () => { $('help').hidden = true; };
  $('help').onclick = (e) => { if (e.target === $('help')) $('help').hidden = true; };
  $('b-sound').onclick = () => { sfx.setMuted(!sfx.muted); $('b-sound').innerHTML = icon(sfx.muted ? 'mute' : 'volume', { size: 24 }); };
  $('z-in').onclick = () => zoomAt(vw / 2, vh / 2, 1.3);
  $('z-out').onclick = () => zoomAt(vw / 2, vh / 2, 1 / 1.3);
  $('z-fit').onclick = () => { cam.z = contain(); cam.x = WW / 2; cam.y = WH / 2; clampCam(); };
  $('sel-x').onclick = () => { if (sel) { G.issueOrder(S, sel, G.unit(S, sel).at); updateHud(); } };
  window.addEventListener('resize', resize);
}
async function loadTerrain() {
  terrainScale = Math.min(vw, vh) < 500 ? 0.6 : 0.75;
  const apply = (t) => {
    const c = document.createElement('canvas'); c.width = t.w; c.height = t.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(t.data), t.w, t.h), 0, 0);
    terrain = c; $('loading').classList.add('done'); $('b-play').disabled = false;
  };
  try {
    const wk = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' });
    await new Promise((res, rej) => {
      wk.onmessage = (e) => { apply(e.data); wk.terminate(); res(); };
      wk.onerror = (e) => { e.preventDefault(); rej(e); };
      wk.postMessage({ islands: G.ISLANDS, W: WW, H: WH, scale: terrainScale });
    });
  } catch (_) {
    apply(computeTerrain(G.ISLANDS, WW, WH, terrainScale));
  }
}

resize();
icons(); wire();
newGame(params.has('seed') ? +params.get('seed') : undefined);
buildLegend();
$('b-play').disabled = true;
requestAnimationFrame(frame);
loadTerrain().then(() => { if (params.has('autostart')) startPlay(); });

// test + QA hooks (read-mostly)
window.__PW__ = {
  get S() { return S; }, get view() { return view; }, get busy() { return busy; }, get sel() { return sel; }, cam, G, errors,
  get terrainReady() { return !!terrain; }, get lastEvents() { return lastEvents; },
  setSpeed(n) { speed = n; }, newGame(seed) { newGame(seed); refreshHint(); },
  select(id) { select(id); }, order(id, to) { const ok = G.issueOrder(S, id, to); updateHud(); return ok; },
  endWeek: (opts) => doEndWeek(opts),
  tokenRect(id) {
    const u = view.units.find((x) => x.id === id); if (!u) return null;
    const p = slot(u.at, u), b = tagBounds(p.x, p.y, p.s), isl = vIsl(u.at);
    return { ...b, cx: isl.x, cy: isl.y, r: R, screen: toScreen(p.x, p.y), islandScreen: toScreen(isl.x, isl.y) };
  },
  islandScreen(id) { const i = G.island(S, id); return toScreen(i.x, i.y); },
  focus(id, z) { const i = G.island(S, id); cam.x = i.x; cam.y = i.y; if (z) cam.z = z; clampCam(); },
  showEnd,
};
