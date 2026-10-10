/* Carrier Traits: UI, rendering, input, port & saves. Rules live in sim.js (CVSim). */
(function () {
'use strict';
const VERSION = 'v1.0';
const Sim = window.CVSim, $ = (id) => document.getElementById(id);
const KEY = 'carrier-save-v1';
const fmt = (n) => (n < 10 ? '0' : '') + n;

// ---------- save ----------
let save = load();
function load() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.prof && o.prof.v === 1) { Sim.normRoster(o.prof); return o; } } catch (e) { /* ignore */ }
  return { prof: Sim.newProfile(), speed: 1, tut: false, zsel: 0, tree: 'deck' };
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage full or blocked */ } }
const prof = () => save.prof;

// ---------- state ----------
let S = null, paused = false, mode = 'course', dragOn = false, follow = true, selU = null;
const cv = $('map'), ctx = cv.getContext('2d');
const cam = { x: 1500, y: 2300, z: 0.3 };
let cw = 0, ch = 0, dpr = 1;
const fogBase = document.createElement('canvas'); fogBase.width = fogBase.height = Sim.FG;
const fogC = document.createElement('canvas'); fogC.width = fogC.height = 150;
const fogMid = document.createElement('canvas'); fogMid.width = fogMid.height = 150;
let fogT = -1;
const wave = mkWave();

function resize() {
  const r = $('mapw').getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = r.width; ch = r.height; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
}
window.addEventListener('resize', resize);

// ---------- mission start / end ----------
function startMission(zone, kind) {
  const seed = (Date.now() % 100000) + Math.floor(Math.random() * 1000);
  S = Sim.create(prof(), zone, kind, seed); paused = false; mode = 'course'; selU = null; follow = true; fogT = -1;
  cam.x = S.cv.x; cam.y = S.cv.y - 250; cam.z = Math.max(0.22, Math.min(0.45, Math.min(cw, ch) / 1300));
  S.capWant = save.cap == null ? 2 : save.cap;
  $('port').classList.remove('show'); $('aar').classList.remove('show');
  lastFeed = -1; updUI(true);
}
function finish() {
  const a = S.aar; Sim.applyAAR(prof(), a); persist(); showAAR(a);
}

// ---------- input ----------
const ptrs = new Map(); let gest = null;
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY, x0: e.offsetX, y0: e.offsetY, t0: performance.now() });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gest = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, pinch: true }; }
});
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.offsetX - p.x, dy = e.offsetY - p.y; p.x = e.offsetX; p.y = e.offsetY;
  if (ptrs.size === 2 && gest && gest.pinch) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); setZoom(gest.z * d / Math.max(10, gest.d)); return; }
  if (dragOn && ptrs.size === 1) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; if (Math.abs(p.x - p.x0) + Math.abs(p.y - p.y0) > 8) { setFollow(false); p.moved = true; } }
});
const up = (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
  if (gest && gest.pinch) { if (!ptrs.size) gest = null; return; }
  const moved = Math.hypot(p.x - p.x0, p.y - p.y0);
  if (moved < 12 && performance.now() - p.t0 < 700 && !p.moved) tap(p.x, p.y);
};
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => ptrs.delete(e.pointerId));
cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(cam.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
const toW = (sx, sy) => ({ x: cam.x + (sx - cw / 2) / cam.z, y: cam.y + (sy - ch / 2) / cam.z });
const toS = (x, y) => ({ x: (x - cam.x) * cam.z + cw / 2, y: (y - cam.y) * cam.z + ch / 2 });
function setZoom(z) { cam.z = Math.max(Math.min(cw, ch) / 3200, Math.min(1.6, z)); }
function setFollow(v) { follow = v; $('bFollow').classList.toggle('on', v); }
function contactAt(sx, sy) {
  let best = null, bd = 34;
  for (const u of S.units) if (u.side === 'E' && !u.sunk && !u.dead && known(u)) { const p = toS(u.lx, u.ly); const d = Math.hypot(p.x - sx, p.y - sy); if (d < bd) { bd = d; best = u; } }
  return best;
}
const ghostLife = () => (S.tr.photo ? 1e9 : 150);
const visNow = (u) => S.t - u.seenT < 0.6;
const known = (u) => u.seenT > -1e8 && S.t - u.seenT < ghostLife();
function tap(sx, sy) {
  if (!S || S.over) return;
  const w = toW(sx, sy);
  if (mode === 'scout') { Sim.orderScout(S, w.x, w.y); setMode('course'); pingAt(w, '🔭'); return; }
  if (mode === 'strike') { const u = contactAt(sx, sy); Sim.orderStrike(S, u, w.x, w.y); setMode('course'); pingAt(u ? { x: u.lx, y: u.ly } : w, '💥'); return; }
  const u = contactAt(sx, sy);
  if (u) { selU = u; updSel(); return; }
  selU = null; updSel(); Sim.setCourse(S, w.x, w.y); pingAt(w, '⚓');
}
const pings = [];
function pingAt(w, s) { pings.push({ x: w.x, y: w.y, s, t: performance.now() }); }
function setMode(m) {
  mode = m; $('bScout').classList.toggle('mode', m === 'scout'); $('bStrike').classList.toggle('mode', m === 'strike');
  $('banner').classList.toggle('show', m !== 'course');
  $('bannerT').textContent = m === 'scout' ? '🔭 👆 sea to search' : '💥 👆 target ( ? or ship )';
}
function updSel() {
  const el = $('sel');
  if (!selU || selU.sunk || selU.dead) { el.classList.remove('show'); selU = null; return; }
  const t = Sim.UT[selU.type], age = Math.round(S.t - selU.seenT);
  el.innerHTML = `<span style="font-size:22px">${t.icon}</span><span>${t.name}${visNow(selU) ? '' : ' <span class="dim">· ' + age + 's ago</span>'}</span><button id="sStrike">💥</button><button id="sScout">🔭</button><button id="sX">✖</button>`;
  el.classList.add('show');
  $('sStrike').onclick = () => { Sim.orderStrike(S, selU); pingAt({ x: selU.lx, y: selU.ly }, '💥'); selU = null; updSel(); };
  $('sScout').onclick = () => { Sim.orderScout(S, selU.lx, selU.ly); pingAt({ x: selU.lx, y: selU.ly }, '🔭'); selU = null; updSel(); };
  $('sX').onclick = () => { selU = null; updSel(); };
}

// ---------- buttons ----------
$('bPause').onclick = () => { paused = !paused; $('bPause').textContent = paused ? '▶' : '⏸'; };
$('bSpeed').onclick = () => { save.speed = save.speed === 1 ? 2 : save.speed === 2 ? 4 : 1; $('bSpeed').textContent = '×' + save.speed; persist(); };
$('bDrag').onclick = () => { dragOn = !dragOn; $('bDrag').classList.toggle('on', dragOn); };
$('bFollow').onclick = () => setFollow(!follow);
$('bFit').onclick = () => { setFollow(false); cam.x = Sim.W / 2; cam.y = Sim.H / 2; cam.z = Math.min(cw, ch) / 3150; };
$('bZin').onclick = () => setZoom(cam.z * 1.35);
$('bZout').onclick = () => setZoom(cam.z / 1.35);
$('bScout').onclick = () => setMode(mode === 'scout' ? 'course' : 'scout');
$('bStrike').onclick = () => setMode(mode === 'strike' ? 'course' : 'strike');
$('bCancel').onclick = () => setMode('course');
$('bCapM').onclick = () => { if (S) { Sim.setCap(S, S.capWant - 1); save.cap = S.capWant; persist(); updUI(true); } };
$('bCapP').onclick = () => { if (S) { Sim.setCap(S, S.capWant + 1); save.cap = S.capWant; persist(); updUI(true); } };
$('bRec').onclick = () => { if (S) Sim.recoverAll(S); };
let wdArm = -1e9;
$('bWd').onclick = () => {
  if (!S || S.over) return;
  if (performance.now() - wdArm < 2500) { wdArm = -1e9; $('bWd').textContent = '⚓'; Sim.withdraw(S); return; }
  wdArm = performance.now(); $('bWd').textContent = '⚓?'; setTimeout(() => { $('bWd').textContent = '⚓'; }, 2500);
};
$('bHelp').onclick = () => { paused = true; $('bPause').textContent = '▶'; showHelp(); };
$('bSpeed').textContent = '×' + save.speed;

// ---------- HUD ----------
let lastFeed = -1, uiT = 0;
function updUI(force) {
  if (!S) return;
  const now = performance.now(); if (!force && now - uiT < 200) return; uiT = now;
  const m = Sim.clockMin(S), hh = Math.floor(m / 60) % 24, mm = Math.floor(m % 60);
  $('clock').textContent = (S.night ? '🌙 ' : hh < 7 ? '🌅 ' : hh >= 17 ? '🌇 ' : '☀ ') + fmt(hh) + ':' + fmt(mm);
  $('pts').textContent = '⭐' + (prof().pts + S.earned);
  const hp = Math.max(0, S.cv.hp); $('hpb').style.width = hp + '%'; $('hpb').style.background = hp > 60 ? '#7bd389' : hp > 30 ? '#ffb74d' : '#ff6b5e';
  $('fireI').textContent = (S.cv.fire > 1 ? '🔥' : '') + (S.cv.flood > 1 ? '💧' : '');
  const dk = S.deck, ph = dk.closed ? ['🔥', 'bad'] : dk.nightBlock && dk.phase !== 'recover' ? ['🌙', 'bad'] : { idle: ['⚓', ''], spot: ['⏫', 'busy'], arm: ['⚙', 'busy'], launch: ['🛫', 'busy'], recover: ['🛬', 'busy'] }[dk.phase];
  const pat = S.flights.filter((f) => f.side === 'P' && f.state === 'pattern').reduce((a, f) => a + f.planes.length, 0);
  $('phase').textContent = ph[0] + (dk.phase !== 'idle' && dk.phase !== 'recover' && dk.tmr > 0 ? Math.ceil(dk.tmr) : '') + (pat ? ' 🛬' + pat : '') + (dk.jobs.length ? ' ⏳' + dk.jobs.length : '');
  $('phase').className = ph[1];
  const g = Sim.groupCounts(S.tr); let h = '';
  for (const k of ['F', 'B', 'T', 'S']) { if (!g[k]) continue; const all = S.planes.filter((p) => p.type === k && p.state !== 'lost').length; const rdy = Sim.ready(S, k).length; h += `<span>${Sim.PT[k].icon}${rdy}<span class="dim">/${all}</span></span>`; }
  $('hang').innerHTML = h;
  let sl = ''; for (let i = 0; i < dk.park; i++) { const p = dk.spotted[i]; sl += p ? `<i class="p${p.armed && (p.type === 'B' || p.type === 'T') ? ' a' : ''}">${Sim.PT[p.type].icon}</i>` : '<i></i>'; }
  $('slots').innerHTML = sl;
  $('capN').textContent = '🛡' + S.capWant + ' ' + '·' + Sim.capCount(S);
  const o = S.obj; $('objc').textContent = (S.done ? '✅ ' : '🎯 ') + o.label + ' ' + Math.min(o.got, o.need) + '/' + o.need + (S.kind === 'convoy' && S.stats.escaped ? ' 🏃' + S.stats.escaped : '');
  if (S.feed.length !== lastFeed) {
    lastFeed = S.feed.length;
    $('feed').innerHTML = S.feed.slice(-40).reverse().map((f, i) => { const m2 = Sim.clockMin({ startHour: S.startHour, t: f.t }); return `<div class="${f.cls}" data-i="${S.feed.length - 1 - i}"><span class="tm">${fmt(Math.floor(m2 / 60) % 24)}:${fmt(Math.floor(m2 % 60))}</span>${f.icon} ${f.txt}</div>`; }).join('');
  }
  if (selU) updSel();
}
$('feed').onclick = (e) => { const d = e.target.closest('div[data-i]'); if (!d || !S) return; const f = S.feed[+d.dataset.i]; if (f && f.x != null) { setFollow(false); cam.x = f.x; cam.y = f.y; pingAt(f, f.icon); } };

// ---------- render ----------
function mkWave() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.strokeStyle = 'rgba(160,210,255,0.07)'; g.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) { const x = (i * 53) % 128, y = (i * 37) % 128; g.beginPath(); g.arc(x, y, 7, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
  return c;
}
function hull(x, y, a, len, wid, fill, stroke) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(len / 2, 0); ctx.quadraticCurveTo(len * 0.3, wid / 2, -len / 2, wid / 2.2); ctx.lineTo(-len / 2, -wid / 2.2); ctx.quadraticCurveTo(len * 0.3, -wid / 2, len / 2, 0); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}
function plane(x, y, a, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, s * 0.18); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.6, -s * 0.18); ctx.closePath(); ctx.fill();
  ctx.fillRect(-s * 0.15, -s * 0.8, s * 0.32, s * 1.6); ctx.fillRect(-s * 0.95, -s * 0.35, s * 0.18, s * 0.7);
  ctx.restore();
}
function drawFog() {
  if (S.t - fogT >= 0.5 || fogT < 0) {
    fogT = S.t; const g = fogBase.getContext('2d'), im = g.createImageData(Sim.FG, Sim.FG);
    for (let i = 0; i < S.fog.length; i++) { im.data[i * 4] = 6; im.data[i * 4 + 1] = 16; im.data[i * 4 + 2] = 30; im.data[i * 4 + 3] = S.fog[i] ? 105 : 215; }
    g.putImageData(im, 0, 0);
    const m = fogMid.getContext('2d'); m.clearRect(0, 0, 150, 150); m.filter = 'blur(2.5px)'; m.imageSmoothingEnabled = true; m.drawImage(fogBase, -4, -4, 158, 158); m.filter = 'none';
  }
  const g = fogC.getContext('2d'), k = fogC.width / Sim.W;
  g.globalCompositeOperation = 'copy'; g.drawImage(fogMid, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  for (const s of S.src || []) if (s.rev) { const r = s.r * k; const gr = g.createRadialGradient(s.x * k, s.y * k, r * 0.6, s.x * k, s.y * k, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(s.x * k, s.y * k, r, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true; ctx.drawImage(fogC, 0, 0, Sim.W, Sim.H);
}
function ring(x, y, r, col, dash, w) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.strokeStyle = col; ctx.lineWidth = (w || 1.2) / cam.z; ctx.setLineDash(dash ? dash.map((d) => d / cam.z) : []); ctx.stroke(); ctx.setLineDash([]); }
function emoji(s, x, y, px) { ctx.font = (px / cam.z) + 'px system-ui,"Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
function draw() {
  const z = cam.z;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#071827'; ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cw / 2 - cam.x * z), dpr * (ch / 2 - cam.y * z));
  // sea
  const gr = ctx.createLinearGradient(0, 0, 0, Sim.H); gr.addColorStop(0, '#0f4569'); gr.addColorStop(1, '#14527a');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, Sim.W, Sim.H);
  ctx.save(); ctx.scale(3, 3); ctx.fillStyle = ctx.createPattern(wave, 'repeat'); ctx.fillRect(0, 0, Sim.W / 3, Sim.H / 3); ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1 / z;
  for (let i = 500; i < Sim.W; i += 500) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, Sim.H); ctx.moveTo(0, i); ctx.lineTo(Sim.W, i); ctx.stroke(); }
  // islands
  for (const s of S.islands) {
    ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = '#d8c48a'; ctx.fill(); ctx.save(); ctx.translate(s.x, s.y); ctx.scale(0.78, 0.78); ctx.translate(-s.x, -s.y);
    ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fillStyle = '#4f8a4a'; ctx.fill(); ctx.restore();
  }
  // wakes
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2 / z;
  for (const u of S.units) if (!u.sunk && u.wake.length > 1 && (u.side === 'P' || visNow(u))) { ctx.beginPath(); u.wake.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.lineTo(u.x, u.y); ctx.stroke(); }
  // bases (always draw island runway; enemy marker only if known)
  for (const u of S.units) if (u.type === 'BASE') {
    ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(0.4); ctx.fillStyle = '#7b7b6a'; ctx.fillRect(-110, -10, 220, 20); ctx.restore();
  }
  drawFog();
  if (S.night) { ctx.fillStyle = 'rgba(0,5,25,0.35)'; ctx.fillRect(0, 0, Sim.W, Sim.H); }
  // rings
  const c = S.cv;
  if (mode === 'strike') { const types = ['B'].concat(S.tr.vt ? ['T'] : []); ring(c.x, c.y, Sim.strikeRadius(S, types), 'rgba(255,138,101,0.8)', [8, 6], 2); }
  if (mode === 'scout') ring(c.x, c.y, Sim.strikeRadius(S, ['S']) * (S.tr.lr ? 1.4 : 1), 'rgba(255,245,157,0.8)', [8, 6], 2);
  if (S.tr.radar) ring(c.x, c.y, 900, 'rgba(120,255,160,0.18)', [3, 7]);
  if (S.intel) { ring(S.intel.x, S.intel.y, S.intel.r, 'rgba(255,120,120,0.6)', [10, 8], 2); ctx.globalAlpha = 0.8; emoji('🗝', S.intel.x, S.intel.y, 18); ctx.globalAlpha = 1; }
  // waypoint
  if (S.wp) { ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([6 / z, 6 / z]); ctx.lineWidth = 1.5 / z; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(S.wp.x, S.wp.y); ctx.stroke(); ctx.setLineDash([]); ring(S.wp.x, S.wp.y, 10 / z, 'rgba(255,255,255,0.7)'); }
  // enemy units
  const minL = 16 / z;
  for (const u of S.units) {
    if (u.side !== 'E' || (u.sunk && !u.escaped && S.t - u.seenT > 20) || u.escaped) continue;
    const t = Sim.UT[u.type];
    if (u.sunk) { if (S.t - u.seenT < 20) { ctx.globalAlpha = 0.5; emoji('🌊', u.x, u.y, 14); ctx.globalAlpha = 1; } continue; }
    if (visNow(u)) {
      if (u.type === 'BASE') { ring(u.x, u.y, 60, u.dead ? '#888' : '#ff6b5e', null, 2.5); emoji(u.dead ? '💀' : '🛩', u.x, u.y - 30, 16); }
      else hull(u.x, u.y, u.hdg, Math.max(t.len, minL * t.len / 30), Math.max(t.wid, minL * t.wid / 30), '#e46a5e', '#ffd0c8');
      if (u.type === 'CVL' || u.type === 'ECV') { ctx.fillStyle = '#5a2620'; ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.hdg); const L = Math.max(t.len, minL * t.len / 30); ctx.fillRect(-L * 0.4, -1.2 / z, L * 0.8, 2.4 / z); ctx.restore(); if (u.air && u.air.phase === 'arm' && S.tr.photo) emoji('⚙', u.x, u.y - 24 / z, 14); }
      if (u.fire > 1) emoji('🔥', u.x + 6 / z, u.y - 8 / z, 12);
      if (u.hp < u.maxHp) { const w = 26 / z; ctx.fillStyle = '#300'; ctx.fillRect(u.x - w / 2, u.y + 12 / z, w, 3 / z); ctx.fillStyle = '#ff8a65'; ctx.fillRect(u.x - w / 2, u.y + 12 / z, w * Math.max(0, u.hp / u.maxHp), 3 / z); }
      if (u === selU) ring(u.x, u.y, 22 / z, '#ffd54f', null, 2);
    } else if (known(u)) {
      const age = S.t - u.seenT, al = S.tr.photo ? 0.75 : Math.max(0.25, 1 - age / ghostLife());
      ctx.globalAlpha = al; ring(u.lx, u.ly, 14 / z, '#ff8a80', [3, 3], 1.5); emoji(u.df && S.t - u.df < 60 ? '📻' : '?', u.lx, u.ly, 13); ctx.globalAlpha = 1;
      if (u === selU) ring(u.lx, u.ly, 22 / z, '#ffd54f', null, 2);
    }
  }
  // player ships
  for (const u of S.units) {
    if (u.side !== 'P' || u.sunk) continue; const t = Sim.UT[u.type];
    const L = Math.max(t.len, (u.type === 'CV' ? 26 : 13) / z), Wd = Math.max(t.wid, (u.type === 'CV' ? 5.5 : 3) / z);
    hull(u.x, u.y, u.hdg, L, Wd, u.type === 'CV' ? '#c9d3da' : '#9fb3c1', '#ffffff');
    if (u.type === 'CV') {
      ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.hdg); ctx.fillStyle = '#6e5a43'; ctx.fillRect(-L * 0.42, -Wd * 0.3, L * 0.8, Wd * 0.6); ctx.fillStyle = '#56636c'; ctx.fillRect(0, Wd * 0.3, L * 0.12, Wd * 0.25);
      const n = S.deck.spotted.length; for (let i = 0; i < n; i++) { const p = S.deck.spotted[i]; ctx.fillStyle = p.armed && (p.type === 'B' || p.type === 'T') ? '#ff7043' : '#e3f2fd'; ctx.fillRect(-L * 0.4 + (i % 6) * L * 0.075, (i < 6 ? -1 : 0.2) * Wd * 0.22, L * 0.05, Wd * 0.18); }
      ctx.restore();
      if (u.fire > 1) emoji('🔥', u.x + 8 / z, u.y - 10 / z, 15); if (u.flood > 1) emoji('💧', u.x - 10 / z, u.y - 10 / z, 12);
    } else if (u.hp < u.maxHp) { const w = 20 / z; ctx.fillStyle = '#123'; ctx.fillRect(u.x - w / 2, u.y + 9 / z, w, 3 / z); ctx.fillStyle = '#7bd389'; ctx.fillRect(u.x - w / 2, u.y + 9 / z, w * Math.max(0, u.hp / u.maxHp), 3 / z); }
    if (u.picket) emoji('📡', u.x, u.y - 12 / z, 11);
  }
  // flights
  for (const f of S.flights) {
    if (!f.planes.length) continue;
    if (f.side === 'E' && S.t - f.seenT > 0.6) continue;
    const col = f.side === 'E' ? '#ff5a4a' : f.kind === 'scout' ? '#fff59d' : f.kind === 'cap' ? '#90caf9' : '#ffffff';
    if (f.side === 'P' && f.kind === 'strike' && (f.state === 'out' || f.state === 'attack')) { ctx.strokeStyle = 'rgba(255,170,140,0.5)'; ctx.setLineDash([4 / z, 5 / z]); ctx.lineWidth = 1.2 / z; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); ctx.setLineDash([]); }
    const n = f.planes.length, s = 6 / z;
    for (let i = 0; i < Math.min(n, 9); i++) { const ox = ((i % 3) - 1) * s * 1.7 - Math.floor(i / 3) * s * 0.9, oy = (Math.floor(i / 3) - (i % 2)) * s * 1.2; const ca = Math.cos(f.hdg), sa = Math.sin(f.hdg); plane(f.x - ca * Math.abs(oy) + -sa * ox * 0.6, f.y - sa * Math.abs(oy) + ca * ox * 0.6, f.hdg, s, col); }
    if (n > 1 || f.side === 'E') { ctx.fillStyle = col; ctx.font = 'bold ' + (11 / z) + 'px system-ui'; ctx.textAlign = 'left'; ctx.fillText(Sim.iconsOf(f.planes), f.x + 10 / z, f.y - 10 / z); }
    if (f.side === 'E' && f.kind === 'strike') ring(f.x, f.y, 26 / z, 'rgba(255,80,60,' + (0.4 + 0.4 * Math.sin(performance.now() / 150)) + ')', null, 2);
  }
  // fx
  for (const e of S.fx) {
    const k = (S.t - e.t) / e.life;
    if (e.k === 'boom') { ctx.globalAlpha = 1 - k; ctx.fillStyle = '#ffab40'; ctx.beginPath(); ctx.arc(e.x, e.y, (6 + 26 * k) * (e.big || 1) / Math.max(1, z * 2.2), 0, 7); ctx.fill(); }
    else if (e.k === 'splash') { ctx.globalAlpha = 1 - k; ring(e.x, e.y, 4 / z + 10 * k / z, '#e3f2fd'); }
    else if (e.k === 'fall') { ctx.globalAlpha = 1 - k; ctx.fillStyle = e.side === 'E' ? '#ff8a65' : '#b0bec5'; ctx.beginPath(); ctx.arc(e.x, e.y + 20 * k / z, 4 / z, 0, 7); ctx.fill(); }
    else if (e.k === 'txt') { ctx.globalAlpha = 1 - k * 0.8; ctx.fillStyle = '#ffd54f'; ctx.font = 'bold ' + (14 / z) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(e.s, e.x, e.y - 20 / z - 30 * k / z); }
    ctx.globalAlpha = 1;
  }
  const now = performance.now();
  for (let i = pings.length - 1; i >= 0; i--) { const p = pings[i], k = (now - p.t) / 900; if (k > 1) { pings.splice(i, 1); continue; } ctx.globalAlpha = 1 - k; ring(p.x, p.y, (8 + 24 * k) / z, '#ffd54f', null, 2); emoji(p.s, p.x, p.y - 20 / z, 16); ctx.globalAlpha = 1; }
  // border
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2 / z; ctx.strokeRect(0, 0, Sim.W, Sim.H);
  // alert vignette
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (S.t - S.alert < 3 && S.alert > 0) { const a = 0.35 * (1 - (S.t - S.alert) / 3); const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.7); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, 'rgba(255,40,30,' + a + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); }
  // off-screen raid arrows
  for (const f of S.flights) if (f.side === 'E' && f.kind === 'strike' && f.planes.length && S.t - f.seenT < 0.6) {
    const p = toS(f.x, f.y); if (p.x > 0 && p.y > 0 && p.x < cw && p.y < ch) continue;
    const a = Math.atan2(p.y - ch / 2, p.x - cw / 2), r = Math.min(cw, ch) / 2 - 22; const x = cw / 2 + Math.cos(a) * r, y = ch / 2 + Math.sin(a) * r;
    ctx.fillStyle = '#ff5a4a'; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, 9); ctx.lineTo(-8, -9); ctx.fill(); ctx.restore();
  }
}

// ---------- loop ----------
let last = performance.now(), acc = 0, fpsN = 0, fpsT = last; const perf = { fps: 0, worst: 0, frames: 0 };
function frame(now) {
  const dtR = Math.min(0.25, (now - last) / 1000);
  if (now - last > perf.worst && perf.frames > 5) perf.worst = now - last;
  last = now; perf.frames++; fpsN++; if (now - fpsT > 1000) { perf.fps = fpsN * 1000 / (now - fpsT); fpsN = 0; fpsT = now; }
  if (S && !S.over && !paused && !document.hidden) {
    acc += dtR * save.speed; let n = 0;
    while (acc >= Sim.TICK && n < 60) { Sim.tick(S); acc -= Sim.TICK; n++; }
  }
  if (S && S.over && S.aar && !S.shown) { S.shown = true; finish(); }
  if (S) {
    if (follow) { cam.x += (S.cv.x - cam.x) * 0.15; cam.y += (S.cv.y - 120 / cam.z * 0.3 - cam.y) * 0.15; }
    cam.x = Math.max(-200, Math.min(Sim.W + 200, cam.x)); cam.y = Math.max(-200, Math.min(Sim.H + 200, cam.y));
    draw(); updUI(false);
  }
  requestAnimationFrame(frame);
}

// ---------- port ----------
function showPort() {
  const P = prof(); paused = true;
  const zs = Math.min(save.zsel || 0, P.zone);
  const Z = Sim.ZONES[zs];
  let h = `<div class="card"><div class="row"><h1>⚓ Port</h1><span class="sp"></span><span class="gold" style="font-size:22px">⭐${P.pts}</span><button id="pHelp">❓</button><button id="pReset">♻</button></div>
  <div class="zones">${Sim.ZONES.map((z, i) => `<button data-z="${i}" class="${i === zs ? 'cur' : ''}" ${i > P.zone ? 'disabled' : ''}>${i > P.zone ? '🔒' : z.icon}<small>${P.gates[i] ? '🏆' : i + 1}</small></button>`).join('')}</div>
  <h2>${Z.icon} ${Z.name}${zs >= 2 ? ' <span class="dim">🌙</span>' : ''}</h2>
  <div class="mis">${Z.kinds.map((k) => `<button data-k="${k}"><span class="big">${Sim.KINDS[k].icon}</span><b>${Sim.KINDS[k].name}</b><small>${'⭐'.repeat(Math.min(3, zs + 1))}</small></button>`).join('')}
  <button data-k="gate" class="gate ${Sim.gateOpen(P, zs) ? 'ok' : ''}" ${Sim.gateOpen(P, zs) ? '' : 'disabled'}><span class="big">${Sim.gateOpen(P, zs) ? '⚔' : '🔒'}</span><b>${Sim.KINDS.gate.name}</b><small class="dots">${Sim.gateOpen(P, zs) ? (P.gates[zs] ? '🏆' : '🏴') : '✅'.repeat(Math.min(Sim.GATE_NEED, P.zw[zs])) + '⬜'.repeat(Math.max(0, Sim.GATE_NEED - P.zw[zs]))}</small></button></div></div>`;
  const g = Sim.groupCounts(P.traits), ros = P.roster, aces = ros.filter((p) => p.ace).length, vets = ros.filter((p) => Sim.stars(p.xp) >= 1).length;
  h += `<div class="card"><h3>🛳 Carrier ❤100% 🔧 · ${VERSION}</h3><div class="air">${['F', 'B', 'T', 'S'].filter((k) => g[k]).map((k) => `<span>${Sim.PT[k].icon}×${g[k]}</span>`).join('')}<span>🅿${P.traits.park ? 12 : 8}</span>${aces ? `<span>⭐ace×${aces}</span>` : ''}${vets ? `<span>🎖×${vets}</span>` : ''}${P.traits.dd ? '<span>🚤×' + (P.traits.dd2 ? 4 : 2) + '</span>' : ''}${P.traits.ca ? '<span>⛴×1</span>' : ''}</div></div>`;
  const tree = save.tree || 'deck';
  h += `<div class="card"><h2>⭐ Traits</h2><div class="tabs">${Sim.TREES.map(([id, ic]) => `<button data-t="${id}" class="${id === tree ? 'cur' : ''}" title="${id}">${ic}</button>`).join('')}</div>
  <h3>${Sim.TREES.find((t) => t[0] === tree)[1]} ${Sim.TREES.find((t) => t[0] === tree)[2]}</h3>
  ${Sim.TRAITS.filter((t) => t.tree === tree).map((t) => { const own = P.traits[t.id], lock = t.req && !P.traits[t.req]; return `<div class="tr ${own ? 'own' : ''} ${lock ? 'lock' : ''}"><span class="ic">${t.icon}</span><div class="sp"><div class="nm">${t.name}</div><div class="fx">${t.fx}${lock ? ' · 🔒' + Sim.TR[t.req].icon : ''}</div></div>${own ? '<span class="grn" style="font-size:22px">✓</span>' : `<button data-b="${t.id}" ${Sim.canBuy(P, t.id) ? '' : 'disabled'}>⭐${t.cost}</button>`}</div>`; }).join('')}</div>`;
  if (P.log && P.log.length) h += `<div class="card"><h3>📜</h3><div class="air">${P.log.slice(-10).reverse().map((l) => `<span>${l.k === 'gate' ? '⚔' : Sim.KINDS[l.k].icon}${l.r === 'win' ? '✅' : l.r === 'lost' ? '🏳' : '⚓'}<span class="gold">+${l.e}</span></span>`).join('')}</div></div>`;
  const el = $('port'); el.innerHTML = h; el.classList.add('show');
  el.querySelectorAll('[data-z]').forEach((b) => (b.onclick = () => { save.zsel = +b.dataset.z; persist(); showPort(); }));
  el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => startMission(zs, b.dataset.k)));
  el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { save.tree = b.dataset.t; persist(); showPort(); }));
  el.querySelectorAll('[data-b]').forEach((b) => (b.onclick = () => { if (Sim.buy(P, b.dataset.b)) { persist(); showPort(); } }));
  $('pHelp').onclick = showHelp;
  $('pReset').onclick = () => { if (confirm('♻ Reset all progress? Traits, ⭐ and pilots are wiped.')) { localStorage.removeItem(KEY); save = load(); persist(); showPort(); } };
}

// ---------- AAR ----------
function showAAR(a) {
  const R = { win: ['🏆', 'Victory'], lost: ['🏳', 'Limped home'], withdraw: ['⚓', 'Withdrew'], time: ['⌛', 'Out of time'], fail: ['🏃', 'They got away'] }[a.result];
  const st = a.stats;
  let h = `<div class="card"><div class="big1">${R[0]}</div><h1 style="text-align:center">${R[1]}</h1>
  <div style="text-align:center;font-size:26px" class="gold">+${a.earned}⭐</div>
  <div class="stat"><span>🌊${st.sunk}</span><span>🎯${st.hits}/${st.drops}</span><span>✈${st.kills}</span><span>💀${st.lost}</span><span>❤${a.hp}%</span><span>⌛${Math.floor(a.time / 60)}:${fmt(Math.floor(a.time % 60))}</span></div></div>`;
  h += `<div class="card"><h2 class="grn">👍 Went well</h2><div class="lst">${a.good.length ? a.good.map(([i, t]) => `<div><span class="i">${i}</span>${t}</div>`).join('') : '<div class="dim">—</div>'}</div></div>`;
  h += `<div class="card"><h2 class="red">⚠ Mistakes</h2><div class="lst">${a.bad.length ? a.bad.map(([i, t]) => `<div><span class="i">${i}</span>${t}</div>`).join('') : '<div class="grn">✨ None!</div>'}</div></div>`;
  h += `<div class="card"><h3>⭐</h3><div class="lst">${Object.entries(a.pts).map(([k, v]) => `<div><span class="gold">${v > 0 ? '+' : ''}${v}</span> ${k}</div>`).join('')}</div></div>`;
  if (a.result === 'lost') h += `<div class="card">🔧 Repaired in port · 🛩 lost planes replaced (🎖 rookies)</div>`;
  if (a.kind === 'gate' && a.result === 'win') h += `<div class="card" style="text-align:center;font-size:18px">🔓 ${a.zone < 4 ? Sim.ZONES[a.zone + 1].icon + ' ' + Sim.ZONES[a.zone + 1].name : '🏆 Campaign won!'}</div>`;
  h += `<div class="card" style="text-align:center"><button id="aPort" style="font-size:22px;padding:10px 30px">⚓ Port</button></div>`;
  const el = $('aar'); el.innerHTML = h; el.classList.add('show'); el.scrollTop = 0;
  $('aPort').onclick = () => { el.classList.remove('show'); if (a.kind === 'gate' && a.result === 'win') save.zsel = Math.min(4, a.zone + 1); persist(); showPort(); };
}

// ---------- help / tutorial ----------
function showHelp() {
  const el = $('help');
  el.innerHTML = `<div class="card help"><div class="row"><h1>❓ How to play</h1><span class="sp"></span><button id="hX">✖</button></div>
  <p><span class="k">👆</span>Tap sea → ⚓ sail there. Tap <b>?</b> or a ship → 💥/🔭.</p>
  <p><span class="k">🔭</span>Scout → tap sea. Scouts stay on what they find.</p>
  <p><span class="k">💥</span>Strike → tap target. Bombers 💣🐟 + spare fighters 🛩 go.</p>
  <p><span class="k">🛡</span>CAP − n + : fighters kept over the carrier (auto relief).</p>
  <p><span class="k">🛬</span>Recall everyone.</p>
  <p><span class="k">⏫⚙🛫🛬</span>Deck: spot → arm → launch → land. One thing at a time!</p>
  <p><span class="k">💥</span>Bombs + armed planes on deck = big explosions.</p>
  <p><span class="k">⛽</span>Planes waiting to land burn fuel. Ring = strike range.</p>
  <p><span class="k">📡</span>Enemy scouts/boats report you → raids come. Shoot scouts fast.</p>
  <p><span class="k">🔥💧</span>Fires & floods hurt; 🔥 closes the deck.</p>
  <p><span class="k">🌙</span>Zone 3+: night falls. Need 🌙 Night Ops.</p>
  <p><span class="k">⭐</span>Earn: sink, find, beat raids, clean landings, missions → buy traits at ⚓ port.</p>
  <p><span class="k">⚔</span>2 wins in a zone open the carrier battle → next zone.</p>
  <p><span class="k">🏳</span>Lose = limp home, repaired. Nothing lost but planes.</p>
  <p><span class="k">✋</span>Drag to pan (off by default). Pinch / ＋－ zoom. 🎯 follow. ⤢ whole map.</p>
  <p class="dim">⏸ ×1 ×2 ×4 · ⚓ (twice) = withdraw · ♻ in port = reset · ${VERSION}</p>
  <div style="text-align:center"><button id="hTut">🎓 Tutorial</button></div></div>`;
  el.classList.add('show');
  $('hX').onclick = () => el.classList.remove('show');
  $('hTut').onclick = () => { el.classList.remove('show'); showTut(0); };
}
const TUT = [
  ['🛳', 'You are the carrier.', '👆 Tap the sea to sail.'],
  ['🔭', 'Find them first.', '🔭 → 👆 sea. A red ? marks what scouts saw.'],
  ['💥', 'Strike!', '💥 → 👆 the ?. 💣 bombers + 🛩 escorts fly out.'],
  ['🛡', 'Keep CAP up.', 'Raids 💣 come for you. 💥 Armed planes on deck explode!'],
  ['⭐', 'Earn & buy traits.', '⚓ Port: 🛫🛩🎖📡🧯🚢🛡 trees.'],
];
function showTut(i) {
  const el = $('tut'); const t = TUT[i];
  el.innerHTML = `<div class="card tut"><div class="big1">${t[0]}</div><h1>${t[1]}</h1><p>${t[2]}</p><div class="dots">${TUT.map((_, k) => (k === i ? '🔵' : '⚪')).join('')}</div><p><button id="tNext" style="font-size:20px;padding:8px 26px">${i < TUT.length - 1 ? '▶' : '✅'}</button> <button id="tSkip">✖</button></p></div>`;
  el.classList.add('show');
  const done = () => { el.classList.remove('show'); save.tut = true; persist(); };
  $('tNext').onclick = () => (i < TUT.length - 1 ? showTut(i + 1) : done());
  $('tSkip').onclick = done;
}

// ---------- boot ----------
resize();
S = Sim.create(prof(), 0, 'sweep', 1); S.over = true; S.shown = true; // backdrop for the port
cam.x = S.cv.x; cam.y = S.cv.y - 300;
showPort();
if (!save.tut) showTut(0);
requestAnimationFrame(frame);
window.CV = { get S() { return S; }, prof, save: () => save, startMission, showPort, showAAR, showHelp, showTut, perf, Sim, cam, setFollow, setMode, tap, get paused() { return paused; }, set paused(v) { paused = v; }, finish, VERSION };
})();
