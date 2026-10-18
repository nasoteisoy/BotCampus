// Space Defense: two-layer (space + planet) tower defense on the Front Line control scheme.
// Engine ideas reused from Front Line (games/tank-2v2): body types vs attack levels (LVL_MULT), tap-to-select /
// tap-to-move / hold+drag box select / double-tap = all of type / pinch zoom, Unit Examiner, inline SVG icons.
// Look and feel (starfield, nebula, glowing ships, planet discs) borrowed from Space Battles (games/space-battles).
// Rendering is plain 2D canvas so the game has no CDN or library dependency.
import * as C from './config.js';
import { ICON, svg, lane as laneIcon } from './icons.js';

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const DT = 1 / 30;
const P_COL = '#4aa3ff', E_COL = '#ff4a5a';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- seeded rng ----------
let seed = (+Q.get('seed') || (Math.random() * 1e9)) >>> 0;
function rnd() { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const rr = (a, b) => a + rnd() * (b - a);

// ---------- state ----------
let G = null;
let DIFF = Q.get('diff') === 'easy' ? 'easy' : 'normal';
const AB = C.ABILITIES;
function newGame() {
  G = {
    t: 0, credits: C.START_CREDITS + (DIFF === 'easy' ? 200 : 0), diff: DIFF, wave: 0, phase: 'pre', gapT: 0, queue: [], ents: [], fx: [], shots: [], drops: [], trips: [], strikes: [],
    view: 'space', sel: new Set(), tech: { sw: 0, sh: 0, gw: 0, gh: 0 }, slots: { space: C.LAYERS.space.slots.map(() => null), planet: C.LAYERS.planet.slots.map(() => null) },
    lastHit: { space: -99, planet: -99 }, lastDrop: -99, nextId: 1, speed: 1, paused: false, amove: false, targeting: null, kills: 0, auto: false, autoT: 0,
    tab: 'units', popup: null, over: false,
  };
  addBase('station', 'space'); addBase('hq', 'planet');
  const sb = C.LAYERS.space.base, pb = C.LAYERS.planet.base;
  for (let i = 0; i < 2; i++) spawnUnit('fighter', sb.x - 90, sb.y - 30 + i * 60);
  for (let i = 0; i < 2; i++) spawnUnit('rifle', pb.x - 100, pb.y - 30 + i * 60);
  G.sel.clear(); closePopup(); setView('space'); renderTray(); hudTick(true);
}

function addBase(type, layer) {
  const d = C.BASES[type], b = C.LAYERS[layer].base;
  const e = mk({ side: 'p', cat: 'base', type, def: d, layer, x: b.x, y: b.y, r: b.r, body: 'bld', hp: d.hp });
  G.ents.push(e); return e;
}
function mk(o) { return Object.assign({ id: G.nextId++, ang: Math.PI, cd: rnd() * 0.5, abCd: 0, tier: 0, hitT: -9, mhp: o.hp, order: { type: 'idle' }, post: { x: o.x, y: o.y }, vx: 0, vy: 0 }, o); }
function techMul(layer, kind) { const k = layer === 'space' ? (kind === 'w' ? 'sw' : 'sh') : (kind === 'w' ? 'gw' : 'gh'); return 1 + G.tech[k] * C.TECH[k].mult; }
function spawnUnit(type, x, y) {
  const d = C.UNITS[type];
  const hp = d.hp * techMul(d.layer, 'h');
  const e = mk({ side: 'p', cat: 'unit', type, def: d, layer: d.layer, x, y, r: d.r, body: d.body, hp, ang: Math.PI, life: d.life || 0, cargo: null });
  e.post = { x, y }; G.ents.push(e); return e;
}
function spawnEnemy(type, laneIdx, layer, x, y, cargo) {
  const d = C.ENEMIES[type];
  const hp = (d.boss ? d.hp : d.hp * C.waveHpMul(Math.max(1, G.wave))) * (G.diff === 'easy' ? 0.75 : 1);
  const lanes = C.LAYERS[layer].lanes, path = lanes[laneIdx % lanes.length];
  const e = mk({ side: 'e', cat: 'enemy', type, def: d, layer, x: x ?? path[0][0] - 20, y: y ?? path[0][1] + rr(-14, 14), r: d.r, body: d.body, hp, ang: 0, lane: laneIdx % lanes.length, pi: 1, cargo: cargo || null, spawnT: rr(3, 6) });
  e.off = rr(-16, 16);
  G.ents.push(e); return e;
}

// ---------- layout / camera ----------
let dpr = 1, VW = 0, VH = 0, MR = { x: 0, y: 0, w: 0, h: 0 }, portrait = true, S = 1, OX = 0, OY = 0;
const cam = { z: 1, px: 0, py: 0 };
let M = [1, 0, 0, 1, 0, 0];
function layout() {
  dpr = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight;
  cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
  const top = $('top').getBoundingClientRect(), tray = $('tray').getBoundingClientRect();
  const land = tray.top < 10 && tray.left > 0;
  MR = land ? { x: 0, y: top.bottom, w: tray.left, h: VH - top.bottom } : { x: 0, y: top.bottom, w: VW, h: tray.top - top.bottom };
  portrait = MR.h > MR.w;
  const pad = 8;
  if (portrait) { S = Math.min((MR.h - pad * 2) / C.W, (MR.w - pad * 2) / C.H); OX = MR.x + (MR.w - C.H * S) / 2; OY = MR.y + (MR.h - C.W * S) / 2; }
  else { S = Math.min((MR.w - pad * 2) / C.W, (MR.h - pad * 2) / C.H); OX = MR.x + (MR.w - C.W * S) / 2; OY = MR.y + (MR.h - C.H * S) / 2; }
  clampCam(); calcM(); buildBackdrops();
}
function calcM() {
  const z = cam.z, cx = MR.x + MR.w / 2, cy = MR.y + MR.h / 2;
  const e = cx + (OX - cx) * z + cam.px, f = cy + (OY - cy) * z + cam.py;
  M = portrait ? [0, S * z, S * z, 0, e, f] : [S * z, 0, 0, S * z, e, f];
}
function clampCam() { const lx = (cam.z - 1) * MR.w / 2 + 40, ly = (cam.z - 1) * MR.h / 2 + 40; cam.px = clamp(cam.px, -lx, lx); cam.py = clamp(cam.py, -ly, ly); if (cam.z <= 1.001) { cam.z = 1; cam.px = cam.py = 0; } }
const toS = (u, v) => [M[0] * u + M[2] * v + M[4], M[1] * u + M[3] * v + M[5]];
function toW(x, y) { const [a, b, c, d, e, f] = M, det = a * d - b * c, X = x - e, Y = y - f; return [(d * X - c * Y) / det, (-b * X + a * Y) / det]; }
const pxPerUnit = () => S * cam.z;
function zoomAt(px, py, z1) {
  z1 = clamp(z1, 1, 3); const cx = MR.x + MR.w / 2, cy = MR.y + MR.h / 2;
  const bx = cx + (px - cx - cam.px) / cam.z, by = cy + (py - cy - cam.py) / cam.z;
  cam.z = z1; cam.px = px - cx - (bx - cx) * z1; cam.py = py - cy - (by - cy) * z1; clampCam(); calcM();
}

// ---------- backdrops (starfield / nebula / planet terrain) ----------
let stars = [], nebula = null, terrain = null;
function buildBackdrops() {
  stars = []; const n = Math.round(VW * VH / 1800);
  for (let i = 0; i < n; i++) stars.push({ x: Math.random() * VW, y: Math.random() * VH, r: Math.random() < .08 ? 1.6 : Math.random() * 1.1 + .3, tw: Math.random() * 6, p: Math.random() * .6 + .2, c: ['#fff', '#cfe6ff', '#ffe9c4', '#c4d2ff'][i % 4] });
  nebula = document.createElement('canvas'); nebula.width = Math.max(1, VW / 2 | 0); nebula.height = Math.max(1, VH / 2 | 0);
  const g = nebula.getContext('2d');
  for (const [x, y, r, c] of [[.2, .25, .5, '#4b1d6b'], [.8, .7, .55, '#0f3d6b'], [.55, .15, .35, '#6b1d3a'], [.3, .85, .4, '#13405a']]) {
    const gr = g.createRadialGradient(x * nebula.width, y * nebula.height, 0, x * nebula.width, y * nebula.height, r * Math.max(nebula.width, nebula.height));
    gr.addColorStop(0, c + 'aa'); gr.addColorStop(1, c + '00'); g.fillStyle = gr; g.fillRect(0, 0, nebula.width, nebula.height);
  }
  if (!terrain) terrain = makeTerrain();
}
function makeTerrain() {
  const c = document.createElement('canvas'); c.width = C.W; c.height = C.H; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, C.W, 0); gr.addColorStop(0, '#5a2f2a'); gr.addColorStop(.5, '#6b4a33'); gr.addColorStop(1, '#4a5a3a');
  g.fillStyle = gr; g.fillRect(0, 0, C.W, C.H);
  let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,220,180' : '20,10,10'},${r() * .07})`; g.beginPath(); g.ellipse(r() * C.W, r() * C.H, 10 + r() * 60, 8 + r() * 40, r() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 26; i++) { const x = r() * C.W, y = r() * C.H, rad = 6 + r() * 22; g.fillStyle = '#0003'; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.strokeStyle = '#ffd9b022'; g.lineWidth = 2; g.beginPath(); g.arc(x - 1, y - 1, rad, 3.6, 5.8); g.stroke(); }
  for (let i = 0; i < 70; i++) { g.fillStyle = r() < .5 ? '#3a2a24' : '#7a6650'; g.beginPath(); g.arc(r() * C.W, r() * C.H, 2 + r() * 5, 0, 7); g.fill(); }
  for (const p of C.LAYERS.planet.lanes) { g.strokeStyle = '#2a1d1888'; g.lineWidth = 46; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.strokeStyle = '#c9a07a22'; g.lineWidth = 30; g.stroke(); }
  return c;
}

// ---------- helpers ----------
const layerOf = (e) => e.layer;
const isP = (e) => e.side === 'p';
const alive = (e) => e && e.hp > 0 && !e.gone;
function lvlVs(att, tgt) { const vs = att.def.vs || {}; return vs[tgt.body] || 0; }
function rngOf(e) { return e.def.rng || 0; }
function dmgOf(e) {
  let d = e.def.dmg || 0;
  if (e.cat === 'tur') d *= C.TIER_MULT[e.tier];
  if (e.cat === 'unit') d *= techMul(e.layer, 'w');
  return d;
}
function bestTarget(e, range, needLos) {
  let best = null, bs = -1e9;
  for (const t of G.ents) {
    if (t.side === e.side || t.layer !== e.layer || !alive(t)) continue;
    const l = lvlVs(e, t); if (!l) continue;
    const d = dist(e, t) - t.r; if (d > range) continue;
    if (e.def.minRng && d < e.def.minRng) continue;
    const s = l * 100 - d * 0.4 + (t.cat === 'base' ? -150 : 0) + (t === e.tgt ? 40 : 0);
    if (s > bs) { bs = s; best = t; }
  }
  void needLos; return best;
}
function shieldAt(t) {
  if (!isP(t)) return 1;
  for (const s of G.ents) if (s.cat === 'tur' && s.type === 'shield' && s.layer === t.layer && s !== t && dist(s, t) < s.def.rng * (1 + .15 * s.tier)) return C.TURRETS.shield.aura - .08 * s.tier;
  return 1;
}

// ---------- combat ----------
function fire(e, t) {
  const l = lvlVs(e, t); if (!l) return;
  const dmg = dmgOf(e) * C.LVL_MULT[l];
  const w = e.def.wpn, col = isP(e) ? (e.def.col || '#8ff7ff') : '#ff7a5a';
  e.ang = Math.atan2(t.y - e.y, t.x - e.x);
  const s = { from: e, side: e.side, layer: e.layer, x: e.x, y: e.y, tgt: t, tx: t.x, ty: t.y, dmg, w, col, splash: e.def.splash ? e.def.splash : 0, vs: e.def.vs, t: 0 };
  if (w === 'beam' || w === 'mg' || w === 'ion') { hit(s, t); G.fx.push({ k: w === 'mg' ? 'tracer' : 'beam', layer: e.layer, x: e.x, y: e.y, x2: t.x + rr(-4, 4), y2: t.y + rr(-4, 4), t: 0, d: w === 'mg' ? .07 : .12, col: w === 'ion' ? '#bff' : col, wd: w === 'ion' ? 4 : (e.cat === 'base' ? 2.5 : 2) }); return; }
  s.speed = { bolt: 480, missile: 260, torp: 210, flak: 420, shell: 520, rocket: 300 }[w] || 400;
  s.home = w === 'missile' || w === 'torp' || w === 'rocket' || w === 'bolt' || w === 'shell';
  if (w === 'arc') { s.dur = 1.1; s.sx = e.x; s.sy = e.y; s.tx = t.x + rr(-10, 10); s.ty = t.y + rr(-10, 10); }
  G.shots.push(s);
}
function hit(s, t) {
  if (s.splash) { boom(s.layer, s.tx, s.ty, s.splash * .6, s.col); splash(s, s.tx, s.ty); return; }
  if (!alive(t)) return;
  dmgTo(t, s.dmg, s.side);
  if (s.w !== 'mg' && s.w !== 'beam') spark(s.layer, t.x, t.y, s.col);
}
function splash(s, x, y) {
  for (const t of G.ents) {
    if (t.side === s.side || t.layer !== s.layer || !alive(t)) continue;
    const d = Math.hypot(t.x - x, t.y - y) - t.r; if (d > s.splash) continue;
    const l = (s.vs || {})[t.body] || 0; if (!l) continue;
    dmgTo(t, (s.raw ? s.dmg * C.LVL_MULT[l] : s.dmg) * (1 - .5 * clamp(d / s.splash, 0, 1)), s.side);
  }
}
function dmgTo(t, amt, srcSide) {
  if (!alive(t)) return;
  if (isP(t)) amt *= shieldAt(t);
  if (G.god && isP(t) && t.cat === 'base') amt = 0;
  t.hp -= amt; t.hitT = G.t;
  if (isP(t)) G.lastHit[t.layer] = G.t;
  if (t.hp <= 0) kill(t, srcSide);
}
function kill(t, srcSide) {
  t.hp = 0; t.gone = true;
  boom(t.layer, t.x, t.y, t.r * 1.6, isP(t) ? '#8ff7ff' : '#ffb347');
  if (t.cat === 'enemy' && srcSide === 'p') { G.credits += t.def.bounty; G.kills++; floatText(t.layer, t.x, t.y, '+' + t.def.bounty); }
  if (t.cat === 'tur') { const i = G.slots[t.layer].indexOf(t); if (i >= 0) G.slots[t.layer][i] = null; if (G.popup && G.popup.ent === t) closePopup(); }
  if (G.sel.delete(t)) renderTray();
  if (t.cat === 'base') lose();
}
function boom(layer, x, y, r, col) { G.fx.push({ k: 'boom', layer, x, y, r, t: 0, d: .5, col }); for (let i = 0; i < 6; i++) G.fx.push({ k: 'deb', layer, x, y, vx: rr(-1, 1) * r * 2, vy: rr(-1, 1) * r * 2, t: 0, d: rr(.3, .7), col }); }
function spark(layer, x, y, col) { G.fx.push({ k: 'spark', layer, x, y, t: 0, d: .18, col }); }
function floatText(layer, x, y, txt) { G.fx.push({ k: 'txt', layer, x, y, t: 0, d: .9, txt }); }

// ---------- movement ----------
function moveTo(e, x, y, spdMul = 1) {
  const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
  const tol = Math.max(3, e.r * .5);
  if (d < tol) return true;
  const sp = (e.def.speed || 0) * spdMul * DT;
  const a = Math.atan2(dy, dx); e.ang = turnTo(e.ang, a, 7 * DT);
  const k = Math.min(1, sp / d); e.x += dx * k; e.y += dy * k;
  return d <= sp + tol;
}
function turnTo(a, b, m) { let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + clamp(d, -m, m); }
function keepIn(e) { e.x = clamp(e.x, -40, C.W + 10); e.y = clamp(e.y, 10, C.H - 10); }
function separate() {
  const arr = G.ents.filter((e) => (e.cat === 'unit' || e.cat === 'enemy') && alive(e));
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = arr[i], b = arr[j]; if (a.layer !== b.layer || a.side !== b.side) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || .01, m = (a.r + b.r) * .85;
    if (d < m) { const p = (m - d) / 2 / d; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; }
  }
}

// ---------- unit AI (player) ----------
function tryFire(e, t) {
  if (!t || e.cd > 0) return false;
  const d = dist(e, t) - t.r; if (d > rngOf(e)) return false;
  fire(e, t); e.cd = e.def.rof * (e.cat === 'unit' && e.type === 'drone' ? 1 : 1); return true;
}
function basePos(layer) { const b = C.LAYERS[layer].base; return { x: b.x - 70, y: b.y }; }
function updUnit(e) {
  const d = e.def, o = e.order, rng = rngOf(e);
  if (e.life) { e.life -= DT; if (e.life <= 0) { e.gone = true; e.hp = 0; G.sel.delete(e); return; } }
  if (e.abCd > 0) e.abCd -= DT;
  if (d.ab === 'carrier') {
    e.droneT = (e.droneT || 0) - DT;
    const mine = G.ents.filter((x) => x.owner === e && alive(x)).length;
    if (e.droneT <= 0 && mine < AB.carrier.max) { e.droneT = AB.carrier.cd; const dr = spawnUnit('drone', e.x, e.y); dr.owner = e; dr.order = { type: 'idle' }; dr.post = e; }
  }
  if (e.type === 'drone' && e.owner) { if (!alive(e.owner)) e.owner = null; else e.post = { x: e.owner.x + Math.cos(G.t + e.id) * 40, y: e.owner.y + Math.sin(G.t + e.id) * 40 }; }
  // heal near own base or shield
  const b = C.LAYERS[e.layer].base;
  if (Math.hypot(e.x - b.x, e.y - b.y) < 150) e.hp = Math.min(e.mhp, e.hp + e.mhp * 0.06 * DT);
  else if (shieldAt(e) < 1) e.hp = Math.min(e.mhp, e.hp + e.mhp * 0.02 * DT);
  if (!rng) { // dropship: just moves
    if (o.type === 'move' || o.type === 'amove') { if (moveTo(e, o.x, o.y)) { e.order = { type: 'idle' }; e.post = { x: o.x, y: o.y }; } }
    else if (o.type === 'retreat') { const p = basePos(e.layer); if (moveTo(e, p.x, p.y, 1.5)) { e.order = { type: 'idle' }; e.post = p; } }
    keepIn(e); return;
  }
  let t = null;
  switch (o.type) {
    case 'attack':
      if (!alive(o.tgt)) { e.order = { type: 'idle' }; e.post = { x: e.x, y: e.y }; break; }
      t = o.tgt; if (dist(e, t) - t.r > rng * .92) moveTo(e, t.x, t.y); break;
    case 'move':
      t = bestTarget(e, rng); if (moveTo(e, o.x, o.y)) { e.order = { type: 'idle' }; e.post = { x: o.x, y: o.y }; } break;
    case 'amove': {
      t = bestTarget(e, rng * 1.5);
      if (t) { if (dist(e, t) - t.r > rng * .92) moveTo(e, t.x, t.y); }
      else if (moveTo(e, o.x, o.y)) { e.order = { type: 'idle' }; e.post = { x: o.x, y: o.y }; }
      break; }
    case 'hold': t = bestTarget(e, rng); if (o.x != null && !o.there) { if (moveTo(e, o.x, o.y)) o.there = true; } break;
    case 'retreat': { const p = basePos(e.layer); if (moveTo(e, p.x - (e.id % 3) * 22, p.y + ((e.id % 5) - 2) * 24, 1.6)) { e.order = { type: 'idle' }; e.post = { x: e.x, y: e.y }; } return; }
    default: {
      const post = e.post || e;
      t = bestTarget(e, rng * 1.5);
      if (t && Math.hypot(t.x - post.x, t.y - post.y) < rng + 170) { if (dist(e, t) - t.r > rng * .92) moveTo(e, t.x, t.y); }
      else { t = bestTarget(e, rng); if (Math.hypot(e.x - post.x, e.y - post.y) > 8) moveTo(e, post.x, post.y); }
    }
  }
  e.tgt = t; tryFire(e, t); keepIn(e);
}

// ---------- enemy AI ----------
function updEnemy(e) {
  const d = e.def, L = C.LAYERS[e.layer], path = L.lanes[e.lane], rng = rngOf(e);
  if (e.type === 'lander') {
    const pl = C.LAYERS.space.planet;
    if (Math.hypot(e.x - pl.x, e.y - pl.y) < pl.r) { landTroops(e); return; }
  }
  if (d.boss) {
    e.spawnT -= DT;
    if (e.spawnT <= 0) { e.spawnT = 6.5; for (let i = 0; i < 2; i++) { const r = spawnEnemy('raider', rnd() * 3 | 0, 'space', e.x + rr(-30, 30), e.y + rr(-30, 30)); r.pi = nearestPi(r); } }
    e.landT = (e.landT ?? 9) - DT;
    if (e.landT <= 0) { e.landT = 15; const l = spawnEnemy('lander', rnd() * 3 | 0, 'space', e.x, e.y + rr(-20, 20), ['grunt', 'grunt', 'crawler']); l.pi = nearestPi(l); }
  }
  // target / block
  let t = rng ? bestTarget(e, rng) : null;
  let stop = false;
  if (t && t.cat === 'unit' && dist(e, t) - t.r < rng * .8) stop = true;
  const b = L.base; const db = Math.hypot(e.x - b.x, e.y - b.y);
  if (db < Math.max(rng * .85, 40) + b.r) stop = true;
  if (!stop) {
    if (e.pi < path.length) {
      const [px, py] = path[e.pi]; const nx = px, ny = py + (e.pi < path.length - 1 ? e.off : 0);
      if (moveTo(e, nx, ny) || e.x >= px - 4) e.pi++;
    } else moveTo(e, b.x, b.y);
  } else if (t) e.ang = turnTo(e.ang, Math.atan2(t.y - e.y, t.x - e.x), 6 * DT);
  if (e.type !== 'lander') { e.tgt = t; tryFire(e, t); }
}
function nearestPi(e) { const p = C.LAYERS[e.layer].lanes[e.lane]; let i = 1; while (i < p.length - 1 && p[i][0] < e.x) i++; return i; }
function landTroops(e) {
  e.gone = true; e.hp = 0;
  const lz = e.lane === 1 ? (G.dropAlt = !G.dropAlt) ? 0 : 1 : (e.lane === 0 ? 0 : 1);
  const [x, y] = C.LAYERS.planet.lz[lz];
  G.drops.push({ x: x + rr(-20, 20), y: y + rr(-30, 30), lane: lz, t: 0, d: 1.4, cargo: e.cargo || ['grunt', 'grunt'] });
  G.lastDrop = G.t; G.dropCount = (G.dropCount || 0) + 1;
  boom('space', e.x, e.y, 18, '#ffb347');
  toast('📦 → 🪐 !');
}
function updDrops() {
  for (const dr of G.drops) {
    dr.t += DT;
    if (dr.t >= dr.d && !dr.done) {
      dr.done = true; boom('planet', dr.x, dr.y, 26, '#ffb347');
      dr.cargo.forEach((type, i) => { const en = spawnEnemy(type, dr.lane, 'planet', dr.x + rr(-24, 24), dr.y + (i - dr.cargo.length / 2) * 16); en.pi = 1; });
    }
  }
  G.drops = G.drops.filter((d) => !d.done || d.t < d.d + .5);
}

// ---------- structures ----------
function updStruct(e) {
  const d = e.def;
  if (!d.rof) return;
  if (e.cd > 0) return;
  if (d.orbital) { // ion cannon: shoots enemies in high orbit (space layer, right half)
    let best = null, bs = -1;
    for (const t of G.ents) if (t.side === 'e' && t.layer === 'space' && alive(t) && t.x > 430) { const l = d.vs[t.body] || 0; if (!l) continue; const s = l * 1000 + t.x; if (s > bs) { bs = s; best = t; } }
    if (best) {
      const l = d.vs[best.body]; dmgTo(best, d.dmg * C.TIER_MULT[e.tier] * C.LVL_MULT[l], 'p'); e.cd = d.rof;
      G.fx.push({ k: 'ion', layer: 'planet', x: e.x, y: e.y, t: 0, d: .35 });
      G.fx.push({ k: 'ionS', layer: 'space', x: best.x, y: best.y, t: 0, d: .35 });
      spark('space', best.x, best.y, '#bff');
    }
    return;
  }
  const range = (d.rng || 0) * (e.cat === 'tur' ? 1 + .12 * e.tier : 1);
  const t = bestTarget(e, range);
  if (t) { fire(e, t); e.cd = d.rof / (e.cat === 'tur' ? 1 + .15 * e.tier : 1); e.tgt = t; }
}

// ---------- shots / fx ----------
function updShots() {
  for (const s of G.shots) {
    s.t += DT;
    if (s.w === 'arc') { if (s.t >= s.dur) { s.done = true; hit(s, s.tgt); } continue; }
    if (s.home && alive(s.tgt)) { s.tx = s.tgt.x; s.ty = s.tgt.y; }
    const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), st = s.speed * DT;
    s.ang = Math.atan2(dy, dx);
    if (d <= st + 2) { s.done = true; s.x = s.tx; s.y = s.ty; hit(s, s.tgt); } else { s.x += dx / d * st; s.y += dy / d * st; }
    if (s.w === 'missile' || s.w === 'torp' || s.w === 'rocket') if (rnd() < .5) G.fx.push({ k: 'smoke', layer: s.layer, x: s.x, y: s.y, t: 0, d: .4 });
  }
  G.shots = G.shots.filter((s) => !s.done);
  for (const f of G.fx) { f.t += DT; if (f.vx) { f.x += f.vx * DT; f.y += f.vy * DT; } }
  G.fx = G.fx.filter((f) => f.t < f.d);
  if (G.fx.length > 600) G.fx.splice(0, G.fx.length - 600);
}

// ---------- abilities: orbital strike, dropship ferry ----------
function updStrikes() {
  for (const s of G.strikes) {
    s.t += DT;
    if (s.t >= s.d && !s.done) {
      s.done = true; const a = AB.bombard;
      boom('planet', s.x, s.y, a.splash, '#ffd65a'); for (let i = 0; i < 6; i++) boom('planet', s.x + rr(-40, 40), s.y + rr(-40, 40), 18, '#ff8a3a');
      splash({ side: 'p', layer: 'planet', splash: a.splash, vs: a.vs, dmg: a.dmg * techMul('space', 'w'), raw: true }, s.x, s.y);
    }
  }
  G.strikes = G.strikes.filter((s) => s.t < s.d + .6);
  for (const tr of G.trips) {
    tr.t += DT;
    if (tr.t >= tr.d && !tr.done) {
      tr.done = true;
      tr.units.forEach((u, i) => { u.x = tr.to.x + Math.cos(i * 1.6) * 22; u.y = tr.to.y + Math.sin(i * 1.6) * 22; u.order = { type: 'idle' }; u.post = { x: u.x, y: u.y }; u.gone = false; G.ents.push(u); });
      tr.ship.ferrying = false; boom('planet', tr.to.x, tr.to.y, 14, '#8ff7ff');
    }
  }
  G.trips = G.trips.filter((t) => !t.done);
}
function startBombard(ship, x, y) {
  ship.abCd = AB.bombard.cd; G.strikes.push({ x, y, t: 0, d: 1.0 }); G.strikeCount = (G.strikeCount || 0) + 1;
  G.fx.push({ k: 'beam', layer: 'space', x: ship.x, y: ship.y, x2: C.LAYERS.space.planet.x - C.LAYERS.space.planet.r + 20, y2: ship.y + 30, t: 0, d: .5, col: '#ffd65a', wd: 4 });
}
function ferryPick(x, y) {
  return G.ents.filter((u) => u.cat === 'unit' && u.layer === 'planet' && alive(u) && Math.hypot(u.x - x, u.y - y) < 95)
    .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, AB.ferry.cap);
}
function startFerry(ship, units, to) {
  const from = { x: units.reduce((s, u) => s + u.x, 0) / units.length, y: units.reduce((s, u) => s + u.y, 0) / units.length };
  for (const u of units) { u.gone = true; G.sel.delete(u); }
  G.ents = G.ents.filter((u) => !units.includes(u));
  for (const u of units) u.gone = false;
  ship.abCd = AB.ferry.cd; ship.ferrying = true;
  const d = Math.hypot(to.x - from.x, to.y - from.y) / 260 + 1.4;
  G.trips.push({ ship, units, from, to, t: 0, d }); G.tripCount = (G.tripCount || 0) + 1;
}

// ---------- waves ----------
function startWave() {
  if (G.over || G.phase === 'wave' || G.wave >= C.NUM_WAVES) return;
  if (G.phase === 'gap' && G.gapT > 1) { const b = Math.round(G.gapT * 2); G.credits += b; floatText('space', 880, 300, '+' + b); }
  G.wave++; G.phase = 'wave'; G.waveT = 0;
  const W = C.makeWaves()[G.wave - 1];
  for (const g of W) for (let k = 0; k < g.n; k++) G.queue.push({ at: g.t + g.gap * k, type: g.type, lane: g.lane === 'r' ? (rnd() * 3 | 0) : g.lane, cargo: g.cargo });
  G.queue.sort((a, b) => a.at - b.at);
  toast((G.wave === C.NUM_WAVES ? '👾 BOSS ' : '🌊 ') + G.wave);
  hudTick(true);
}
function updWaves() {
  if (G.phase === 'wave') {
    G.waveT += DT;
    while (G.queue.length && G.queue[0].at <= G.waveT) { const q = G.queue.shift(); spawnEnemy(q.type, q.lane, C.ENEMIES[q.type].layer, undefined, undefined, q.cargo); }
    G.credits += C.PASSIVE_INCOME * DT;
    if (!G.queue.length && !G.drops.length && !G.ents.some((e) => e.cat === 'enemy' && alive(e))) {
      const bonus = C.waveBonus(G.wave); G.credits += bonus; toast('✅ +' + bonus + ' 💰');
      if (G.wave >= C.NUM_WAVES) return win();
      G.phase = 'gap'; G.gapT = C.WAVE_GAP; hudTick(true);
    }
  } else if (G.phase === 'gap') { G.gapT -= DT; if (G.gapT <= 0) startWave(); }
}

// ---------- step ----------
function step() {
  if (G.over) { updShots(); return; }
  G.t += DT;
  for (const e of G.ents) { if (!alive(e)) continue; e.cd -= DT; }
  for (const e of [...G.ents]) {
    if (!alive(e)) continue;
    if (e.cat === 'unit') updUnit(e); else if (e.cat === 'enemy') updEnemy(e); else updStruct(e);
  }
  separate(); updShots(); updDrops(); updStrikes();
  G.ents = G.ents.filter((e) => !e.gone);
  updWaves();
  if (G.auto) autoPlay();
}
function win() { if (G.over) return; G.over = true; G.phase = 'won'; showEnd(true); }
function lose() { if (G.over) return; G.over = true; G.phase = 'lost'; showEnd(false); }
function showEnd(w) {
  $('endicon').textContent = w ? '🏆' : '💥';
  $('endtitle').textContent = w ? 'VICTORY' : 'DEFEAT';
  $('endsub').textContent = (w ? '🌊 ' + C.NUM_WAVES + '/' + C.NUM_WAVES : '🌊 ' + G.wave + '/' + C.NUM_WAVES) + '  ·  👾 ' + G.kills;
  $('end').classList.remove('hidden'); closePopup(); cancelTargeting();
}

// ---------- rendering ----------
function render() {
  const L = G.view, Ld = C.LAYERS[L];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = L === 'space' ? '#05060f' : '#1a0f0c'; ctx.fillRect(0, 0, VW, VH);
  if (L === 'space') {
    ctx.globalAlpha = .9; ctx.drawImage(nebula, 0, 0, VW, VH); ctx.globalAlpha = 1;
    const tm = performance.now() / 1000;
    for (const s of stars) { ctx.globalAlpha = s.p + Math.sin(tm * 1.5 + s.tw) * .2; ctx.fillStyle = s.c; ctx.fillRect(s.x, s.y, s.r, s.r); }
    ctx.globalAlpha = 1;
  }
  wt();
  if (L === 'space') {
    const pl = Ld.planet; // planet disc behind the station
    const g = ctx.createRadialGradient(pl.x - 120, pl.y - 140, 40, pl.x, pl.y, pl.r);
    g.addColorStop(0, '#c98a5a'); g.addColorStop(.6, '#7a3f2a'); g.addColorStop(1, '#2a1410');
    ctx.fillStyle = '#ff9a5a22'; ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r + 26, 0, 7); ctx.fill();
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffb34766'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  } else {
    ctx.drawImage(terrain, 0, 0, C.W, C.H);
    for (const [x, y] of Ld.lz) { ctx.strokeStyle = '#ff5a4a88'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.arc(x, y, 40, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  }
  // lanes
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of Ld.lanes) {
    ctx.strokeStyle = L === 'space' ? '#4cc8ff18' : '#00000022'; ctx.lineWidth = 34; pathLine(p); ctx.stroke();
    ctx.strokeStyle = L === 'space' ? '#8ff7ff40' : '#ffd9b040'; ctx.lineWidth = 2; ctx.setLineDash([12, 12]); ctx.lineDashOffset = -performance.now() / 60; pathLine(p); ctx.stroke(); ctx.setLineDash([]);
  }
  // slots
  const pop = G.popup;
  Ld.slots.forEach(([x, y], i) => {
    if (G.slots[L][i]) return;
    const on = pop && pop.kind === 'slot' && pop.layer === L && pop.i === i;
    hexPath(x, y, 24); ctx.fillStyle = on ? '#8ff7ff33' : '#ffffff0c'; ctx.fill(); ctx.strokeStyle = on ? '#8ff7ff' : '#8ff7ff77'; ctx.lineWidth = on ? 3 : 2; ctx.stroke();
    ctx.strokeStyle = '#8ff7ffaa'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
  });
  // range ring for selected structure
  if (pop && pop.kind === 'ent' && pop.ent.layer === L && pop.ent.def.rng) { const e = pop.ent; ring(e.x, e.y, e.def.rng * (e.cat === 'tur' ? 1 + .12 * e.tier : 1), '#8ff7ff55'); }
  if (pop && pop.kind === 'slot' && pop.layer === L) { const [x, y] = Ld.slots[pop.i]; ring(x, y, 150, '#8ff7ff33'); }
  // order lines
  for (const e of G.sel) if (e.layer === L) {
    const o = e.order; let tx, ty;
    if (o.type === 'attack' && alive(o.tgt)) { tx = o.tgt.x; ty = o.tgt.y; } else if (o.x != null && o.type !== 'idle' && !o.there) { tx = o.x; ty = o.y; }
    if (tx != null) { ctx.strokeStyle = o.type === 'attack' || o.type === 'amove' ? '#ff8f8066' : '#4dff8866'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]); }
  }
  // entities
  const ents = G.ents.filter((e) => e.layer === L && alive(e)).sort((a, b) => (a.cat === 'unit' || a.cat === 'enemy') - (b.cat === 'unit' || b.cat === 'enemy'));
  for (const e of ents) drawEnt(e);
  // drop pods / strikes / ferry trips (planet)
  if (L === 'planet') {
    for (const d of G.drops) if (!d.done) { const k = d.t / d.d; ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(d.x, d.y, 10 + 20 * k, 6 + 12 * k, 0, 0, 7); ctx.fill(); const h = (1 - k) * 160; ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(d.x - h * .6, d.y - h, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(d.x - h * .6, d.y - h); ctx.lineTo(d.x - h * .6 - 30, d.y - h - 50); ctx.stroke(); ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 2; ring(d.x, d.y, 34, '#ff5a4acc'); }
    for (const s of G.strikes) if (!s.done) { const k = s.t / s.d; ring(s.x, s.y, AB.bombard.splash * (1.2 - k * .2), '#ffd65acc'); ctx.strokeStyle = `rgba(255,214,90,${.3 + k * .7})`; ctx.lineWidth = 6 * k + 2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 200, s.y - 400); ctx.stroke(); }
    for (const tr of G.trips) { const k = clamp(tr.t / tr.d, 0, 1), x = tr.from.x + (tr.to.x - tr.from.x) * k, y = tr.from.y + (tr.to.y - tr.from.y) * k; const a = Math.atan2(tr.to.y - tr.from.y, tr.to.x - tr.from.x); ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.ellipse(x + 10, y + 14, 16, 9, 0, 0, 7); ctx.fill(); shipShape({ x, y, ang: a, type: 'dropship', side: 'p', r: 16 }); ring(tr.to.x, tr.to.y, 30, '#8ff7ffaa'); }
  }
  // shots
  for (const s of G.shots) if (s.layer === L) drawShot(s);
  for (const f of G.fx) if (f.layer === L) drawFx(f);
  // targeting overlay hint
  const tg = G.targeting;
  if (tg && L === 'planet' && tg.kind === 'ferry' && tg.step === 2) for (const u of tg.units) ring(u.x, u.y, u.r + 8, '#ffd65a');
  // screen-space: hp bars and float text
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const e of ents) {
    const show = G.sel.has(e) || (G.t - e.hitT < 3 && e.hp < e.mhp) || e.cat === 'base' || e.def.boss;
    if (!show) continue;
    const [x, y] = toS(e.x, e.y), w = e.cat === 'base' || e.def.boss ? 60 : Math.max(22, e.r * pxPerUnit() * 2), r = e.r * pxPerUnit();
    ctx.fillStyle = '#000a'; ctx.fillRect(x - w / 2 - 1, y - r - 11, w + 2, 6);
    const k = e.hp / e.mhp; ctx.fillStyle = isP(e) ? (k < .35 ? '#ff5a4a' : '#4dff88') : '#ff6a5a'; ctx.fillRect(x - w / 2, y - r - 10, w * k, 4);
    if (e.cat === 'tur' && e.tier) { ctx.fillStyle = '#ffd65a'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('★'.repeat(e.tier), x, y + r + 12); }
  }
  for (const f of G.fx) if (f.layer === L && f.k === 'txt') { const [x, y] = toS(f.x, f.y); ctx.globalAlpha = 1 - f.t / f.d; ctx.fillStyle = '#ffe08a'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText(f.txt, x, y - 14 - f.t * 30); ctx.globalAlpha = 1; }
  // base icons (screen space so they don't mirror)
  const b = Ld.base; const [bx, by] = toS(b.x, b.y);
  ctx.font = `${Math.round(22 * Math.min(1.4, cam.z))}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(L === 'space' ? '🛰️' : '🏰', bx, by); ctx.textBaseline = 'alphabetic';
}
function wt() { ctx.setTransform(dpr * M[0], dpr * M[1], dpr * M[2], dpr * M[3], dpr * M[4], dpr * M[5]); }
function pathLine(p) { ctx.beginPath(); p.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); }
function hexPath(x, y, r) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
function ring(x, y, r, col) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); }

function drawEnt(e) {
  const sel = G.sel.has(e);
  if (sel) { ctx.strokeStyle = '#4dff88'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 7, 0, 7); ctx.stroke(); }
  if (e.cat === 'base') return drawBase(e);
  if (e.cat === 'tur') return drawStruct(e);
  if (e.layer === 'space') return shipShape(e);
  return groundShape(e);
}
function hex8(c) { // '#abc' | '#abcd' | '#aabbcc' | '#aabbccdd' -> '#aabbccdd'
  if (c.length === 4 || c.length === 5) c = '#' + [...c.slice(1)].map((h) => h + h).join('');
  return c.length === 7 ? c + 'ff' : c;
}
function glowDot(x, y, r, col) { col = hex8(col); const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, col.slice(0, 7) + '00'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
function drawBase(e) {
  const t = G.t;
  if (e.layer === 'space') {
    glowDot(e.x, e.y, e.r * 2, '#4cc8ff55');
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(t * .3);
    ctx.strokeStyle = '#9fb3c8'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, 7); ctx.stroke();
    ctx.strokeStyle = P_COL; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, 7); ctx.stroke();
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = '#6a7d92'; ctx.fillRect(-3, 8, 6, e.r - 10); ctx.fillStyle = '#2a5a9a'; ctx.fillRect(-12, e.r + 4, 24, 8); }
    ctx.restore(); ctx.fillStyle = '#c9d6e3'; ctx.beginPath(); ctx.arc(e.x, e.y, 14, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = '#0006'; ctx.fillRect(e.x - e.r + 6, e.y - e.r + 6, e.r * 2, e.r * 2);
    ctx.fillStyle = '#9a8a72'; ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    ctx.fillStyle = '#c9bfa6'; ctx.fillRect(e.x - e.r + 8, e.y - e.r + 8, e.r * 2 - 16, e.r * 2 - 16);
    ctx.fillStyle = P_COL; ctx.fillRect(e.x - 10, e.y - 10, 20, 20);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.fillStyle = '#6a604f'; ctx.beginPath(); ctx.arc(e.x + dx * e.r, e.y + dy * e.r, 9, 0, 7); ctx.fill(); }
  }
}
function drawStruct(e) {
  const d = e.def, x = e.x, y = e.y, a = e.tgt && alive(e.tgt) ? Math.atan2(e.tgt.y - y, e.tgt.x - x) : Math.PI;
  e.ang = turnTo(e.ang, a, .2);
  if (e.layer === 'space') { hexPath(x, y, 22); ctx.fillStyle = '#1a2238'; ctx.fill(); ctx.strokeStyle = d.col; ctx.lineWidth = 2 + e.tier; ctx.stroke(); }
  else { ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.arc(x + 4, y + 4, 22, 0, 7); ctx.fill(); ctx.fillStyle = '#6a604f'; ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.fill(); ctx.strokeStyle = d.col; ctx.lineWidth = 2 + e.tier; ctx.stroke(); }
  ctx.save(); ctx.translate(x, y);
  switch (e.type) {
    case 'laser': ctx.rotate(e.ang); ctx.fillStyle = '#6ff3ff'; ctx.fillRect(0, -3, 22, 6); ctx.fillStyle = '#2b3a5a'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill(); glowDot(0, 0, 8, '#6ff3ffcc'); break;
    case 'missile': ctx.rotate(e.ang); ctx.fillStyle = '#3a4258'; ctx.fillRect(-12, -12, 22, 24); ctx.fillStyle = '#ffb347'; for (let i = -1; i <= 1; i++) ctx.fillRect(4, i * 7 - 2, 10, 4); break;
    case 'flak': ctx.rotate(e.ang); ctx.fillStyle = '#ffe08a'; ctx.fillRect(0, -7, 20, 4); ctx.fillRect(0, 3, 20, 4); ctx.fillStyle = '#3a4258'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill(); break;
    case 'shield': { const pr = d.rng * (1 + .15 * e.tier); ctx.strokeStyle = '#b88cff44'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = G.t * 20; ctx.beginPath(); ctx.arc(0, 0, pr, 0, 7); ctx.stroke(); ctx.setLineDash([]); glowDot(0, 0, 18, '#b88cffaa'); ctx.fillStyle = '#e6d9ff'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill(); break; }
    case 'bunker': ctx.fillStyle = '#8a8070'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill(); ctx.rotate(e.ang); ctx.fillStyle = '#222'; ctx.fillRect(4, -2, 16, 4); break;
    case 'cannon': ctx.rotate(e.ang); ctx.fillStyle = P_COL; ctx.fillRect(-11, -11, 22, 22); ctx.fillStyle = '#ccc'; ctx.fillRect(6, -2.5, 22, 5); break;
    case 'mortar': ctx.fillStyle = '#a89466'; ctx.fillRect(-14, -14, 28, 28); ctx.rotate(e.ang); ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(4, 0, 7, 0, 7); ctx.fill(); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(4, 0, 4, 0, 7); ctx.fill(); break;
    case 'ion': ctx.fillStyle = '#4a5468'; ctx.beginPath(); ctx.moveTo(-14, 14); ctx.lineTo(0, -16); ctx.lineTo(14, 14); ctx.fill(); glowDot(0, -6, 10, '#9effffcc'); break;
    case 'barracks': ctx.fillStyle = '#5d6168'; ctx.fillRect(-18, -12, 36, 24); ctx.fillStyle = '#7fc96b'; ctx.fillRect(-6, -4, 12, 8); break;
    case 'factory': ctx.fillStyle = '#c9bfa6'; ctx.fillRect(-19, -14, 38, 28); ctx.fillStyle = '#5d6168'; for (let i = 0; i < 4; i++) ctx.fillRect(-19 + i * 10, -14, 6, 28); ctx.fillStyle = P_COL; ctx.fillRect(-6, -5, 12, 10); break;
  }
  ctx.restore();
}
function shipShape(e) {
  const p = isP(e), col = p ? P_COL : E_COL, eng = p ? '#9ef' : '#ffb347';
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang);
  const r = e.r;
  glowDot(-r * 1.05, 0, r * .7, hex8(eng).slice(0, 7) + 'cc');
  ctx.fillStyle = col; ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1;
  ctx.beginPath();
  switch (e.type) {
    case 'fighter': case 'drone': ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r, -r * .9); ctx.lineTo(-r * .5, 0); ctx.lineTo(-r, r * .9); break;
    case 'interceptor': ctx.moveTo(r * 1.6, 0); ctx.lineTo(-r * .2, -r * .35); ctx.lineTo(-r, -r * 1.1); ctx.lineTo(-r * .6, 0); ctx.lineTo(-r, r * 1.1); ctx.lineTo(-r * .2, r * .35); break;
    case 'bomber': ctx.moveTo(r, 0); ctx.lineTo(0, -r * .4); ctx.lineTo(-r * .3, -r * 1.2); ctx.lineTo(-r, -r * 1.1); ctx.lineTo(-r * .7, 0); ctx.lineTo(-r, r * 1.1); ctx.lineTo(-r * .3, r * 1.2); ctx.lineTo(0, r * .4); break;
    case 'frigate': ctx.moveTo(r * 1.3, 0); ctx.lineTo(r * .6, -r * .45); ctx.lineTo(-r, -r * .45); ctx.lineTo(-r, r * .45); ctx.lineTo(r * .6, r * .45); break;
    case 'carrier': ctx.moveTo(r * 1.1, -r * .2); ctx.lineTo(r * 1.1, r * .2); ctx.lineTo(r * .8, r * .6); ctx.lineTo(-r, r * .6); ctx.lineTo(-r, -r * .6); ctx.lineTo(r * .8, -r * .6); break;
    case 'dropship': ctx.rect(-r * .9, -r * .6, r * 1.6, r * 1.2); ctx.moveTo(r * .7, -r * .5); ctx.lineTo(r * 1.2, 0); ctx.lineTo(r * .7, r * .5); break;
    case 'raider': ctx.moveTo(r * 1.2, 0); ctx.lineTo(-r * .4, -r); ctx.lineTo(-r, -r * .3); ctx.lineTo(-r * .6, 0); ctx.lineTo(-r, r * .3); ctx.lineTo(-r * .4, r); break;
    case 'gunship': for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * (i === 0 ? 1.3 : 1), Math.sin(a) * r * .8); } break;
    case 'cruiser': ctx.moveTo(r * 1.3, 0); ctx.lineTo(r * .9, -r * .5); ctx.lineTo(-r, -r * .6); ctx.lineTo(-r * .8, 0); ctx.lineTo(-r, r * .6); ctx.lineTo(r * .9, r * .5); break;
    case 'lander': ctx.ellipse(0, 0, r, r * .75, 0, 0, 7); break;
    case 'mother': ctx.ellipse(0, 0, r * 1.2, r * .8, 0, 0, 7); break;
    default: ctx.arc(0, 0, r, 0, 7);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // details
  ctx.fillStyle = p ? '#cfe8ff' : '#ffd0a0';
  if (e.type === 'carrier') { ctx.fillStyle = '#223'; ctx.fillRect(-r * .8, -r * .3, r * 1.5, r * .6); ctx.strokeStyle = '#ffd65a'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(-r * .7, 0); ctx.lineTo(r * .6, 0); ctx.stroke(); ctx.setLineDash([]); }
  else if (e.type === 'frigate' || e.type === 'cruiser') { ctx.fillRect(-r * .3, -r * .2, r * .6, r * .4); }
  else if (e.type === 'lander') { ctx.fillStyle = '#ffd65a'; ctx.beginPath(); ctx.arc(0, 0, r * .35, 0, 7); ctx.fill(); }
  else if (e.type === 'mother') { glowDot(0, 0, r * .6, '#ffee55ee'); ctx.strokeStyle = '#ff9a9a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, r * .9, r * .55, 0, 0, 7); ctx.stroke(); }
  else if (e.type === 'dropship' && e.ferrying) { ctx.fillStyle = '#ffd65a'; ctx.fillRect(-r * .4, -r * .3, r * .6, r * .6); }
  else { ctx.beginPath(); ctx.arc(r * .25, 0, r * .18, 0, 7); ctx.fill(); }
  ctx.restore();
  if (e.cat === 'unit' && e.def.ab === 'bombard' && e.abCd <= 0 && e.layer === 'space') { ctx.fillStyle = '#ffd65a'; ctx.beginPath(); ctx.arc(e.x + e.r, e.y - e.r, 4, 0, 7); ctx.fill(); }
}
function groundShape(e) {
  const p = isP(e), col = p ? P_COL : E_COL, r = e.r;
  ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.ellipse(e.x + 3, e.y + 4, r, r * .8, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang);
  const men = e.def.men;
  if (men) {
    const n = Math.max(1, Math.ceil(men * e.hp / e.mhp));
    for (let i = 0; i < n; i++) { const a = i / men * Math.PI * 2, rx = Math.cos(a) * r * .6, ry = Math.sin(a) * r * .6; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(rx, ry, 3.6, 0, 7); ctx.fill(); ctx.fillStyle = p ? '#e0b48c' : '#9f6'; ctx.beginPath(); ctx.arc(rx, ry, 1.8, 0, 7); ctx.fill(); if (e.type === 'bazooka') { ctx.strokeStyle = '#4b5a35'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx - 3, ry); ctx.lineTo(rx + 7, ry); ctx.stroke(); } }
  } else if (e.type === 'crawler') {
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .7, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 5, -r * .6); ctx.lineTo(i * 5 - 3, -r * 1.1 + Math.sin(G.t * 10 + i) * 2); ctx.moveTo(i * 5, r * .6); ctx.lineTo(i * 5 - 3, r * 1.1 - Math.sin(G.t * 10 + i) * 2); ctx.stroke(); }
    ctx.fillStyle = '#ccc'; ctx.fillRect(r * .5, -1.5, r * .8, 3);
  } else if (e.type === 'walker') {
    const s = Math.sin(G.t * 5) * 5; ctx.strokeStyle = '#7a2a2a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(s, -r); ctx.moveTo(0, 6); ctx.lineTo(-s, r); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(-r * .6, -r * .55, r * 1.2, r * 1.1); ctx.fillStyle = '#ccc'; ctx.fillRect(r * .4, -6, r * .9, 3); ctx.fillRect(r * .4, 3, r * .9, 3);
  } else { // tanks / howitzer
    ctx.fillStyle = '#222'; ctx.fillRect(-r, -r * .75, r * 2, r * .35); ctx.fillRect(-r, r * .4, r * 2, r * .35);
    ctx.fillStyle = col; ctx.fillRect(-r * .9, -r * .5, r * 1.8, r);
    const tg = e.tgt && alive(e.tgt) ? Math.atan2(e.tgt.y - e.y, e.tgt.x - e.x) - e.ang : 0;
    ctx.rotate(tg);
    if (e.type === 'howitzer') { ctx.fillStyle = '#ddd'; ctx.fillRect(0, -2.5, r * 1.6, 5); }
    else { ctx.fillStyle = '#ccc'; ctx.fillRect(0, -2, r * (e.type === 'medium' ? 1.4 : 1.1), 4); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * .45, 0, 7); ctx.fill(); ctx.strokeStyle = '#0006'; ctx.stroke(); }
  }
  ctx.restore();
}
function drawShot(s) {
  if (s.w === 'arc') { const k = s.t / s.dur, x = s.sx + (s.tx - s.sx) * k, y = s.sy + (s.ty - s.sy) * k - Math.sin(k * Math.PI) * 60; ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); return; }
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang || 0);
  if (s.w === 'bolt') { ctx.fillStyle = s.col; ctx.fillRect(-7, -1.5, 14, 3); }
  else if (s.w === 'missile' || s.w === 'torp' || s.w === 'rocket') { ctx.fillStyle = '#ddd'; ctx.fillRect(-5, -2, 10, 4); glowDot(-6, 0, 6, s.side === 'p' ? '#ffb347cc' : '#ff5a4acc'); }
  else if (s.w === 'flak') { ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill(); }
  else { ctx.fillStyle = '#ffd'; ctx.fillRect(-4, -1.5, 8, 3); }
  ctx.restore();
}
function drawFx(f) {
  const k = f.t / f.d;
  ctx.globalAlpha = 1 - k;
  switch (f.k) {
    case 'beam': case 'tracer': ctx.strokeStyle = f.col; ctx.lineWidth = f.wd || 1.5; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke(); break;
    case 'boom': glowDot(f.x, f.y, f.r * (.5 + k), hex8(f.col || '#ffb347')); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (.3 + k * 1.2), 0, 7); ctx.stroke(); break;
    case 'deb': ctx.fillStyle = f.col; ctx.fillRect(f.x - 1.5, f.y - 1.5, 3, 3); break;
    case 'spark': glowDot(f.x, f.y, 8, hex8(f.col || '#fff')); break;
    case 'smoke': ctx.fillStyle = '#aaa6'; ctx.beginPath(); ctx.arc(f.x, f.y, 2 + k * 4, 0, 7); ctx.fill(); break;
    case 'ion': ctx.strokeStyle = '#bff'; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.moveTo(f.x, f.y - 10); ctx.lineTo(f.x + 300, f.y - 600); ctx.stroke(); break;
    case 'ionS': { const pl = C.LAYERS.space.planet; ctx.strokeStyle = '#bff'; ctx.lineWidth = 5 * (1 - k) + 1; ctx.beginPath(); ctx.moveTo(pl.x - pl.r + 10, f.y * .5 + 150); ctx.lineTo(f.x, f.y); ctx.stroke(); break; }
  }
  ctx.globalAlpha = 1;
}

// ---------- view toggle / alerts ----------
function threat(layer) {
  if (G.t - G.lastHit[layer] < 2.5) return true;
  if (layer === 'planet' && G.t - G.lastDrop < 5) return true;
  return G.ents.some((e) => e.cat === 'enemy' && e.layer === layer && alive(e) && (layer === 'planet' || e.x > 560));
}
function setView(v) {
  G.view = v; cam.z = 1; cam.px = cam.py = 0; calcM();
  $('viewbtn').querySelector('.vi').textContent = v === 'space' ? '🪐' : '🚀';
  $('layertag').textContent = v === 'space' ? '🚀 SPACE' : '🪐 PLANET';
  for (const e of [...G.sel]) if (e.layer !== v) G.sel.delete(e);
  closePopup(); renderTray();
}

// ---------- HUD ----------
let lastHud = 0;
function hudTick(force) {
  const now = performance.now(); if (!force && now - lastHud < 200) return; lastHud = now;
  $('credits').textContent = Math.floor(G.credits);
  $('wave').textContent = G.wave + '/' + C.NUM_WAVES;
  const st = G.ents.find((e) => e.type === 'station' && e.cat === 'base'), hq = G.ents.find((e) => e.type === 'hq' && e.cat === 'base');
  const ks = st ? st.hp / st.mhp : 0, kp = hq ? hq.hp / hq.mhp : 0;
  $('hpS').style.width = ks * 100 + '%'; $('hpS').classList.toggle('low', ks < .35);
  $('hpP').style.width = kp * 100 + '%'; $('hpP').classList.toggle('low', kp < .35);
  const other = G.view === 'space' ? 'planet' : 'space', al = !G.over && threat(other);
  $('viewbtn').classList.toggle('alert', al); $('viewbtn').querySelector('.badge').classList.toggle('hidden', !al);
  const wb = $('wavebtn'); const showW = !G.over && (G.phase === 'pre' || G.phase === 'gap');
  wb.classList.toggle('hidden', !showW);
  if (showW) { wb.querySelector('b').textContent = (G.wave + 1 === C.NUM_WAVES ? '👾' : '🌊') + (G.wave + 1); wb.querySelector('small').textContent = G.phase === 'gap' ? Math.ceil(G.gapT) + 's' : ''; }
  // refresh affordability
  document.querySelectorAll('#tray [data-cost], #popup [data-cost]').forEach((b) => b.classList.toggle('poor', +b.dataset.cost > G.credits));
  document.querySelectorAll('#tray [data-ab]').forEach((b) => { const ready = [...G.sel].some((e) => e.def.ab === b.dataset.ab && e.abCd <= 0 && !e.ferrying); b.classList.toggle('cd', !ready); });
  if (G.popup && G.popup.kind === 'ent') { const hb = document.querySelector('#popup .hpb > i'); if (hb) hb.style.width = G.popup.ent.hp / G.popup.ent.mhp * 100 + '%'; }
}
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('on'), 1500); }

const unitIcon = (type, side = 'p') => svg(ICON[side === 'e' ? 'e_' + type : type] || '', side === 'e' ? E_COL : P_COL);
function btn(inner, attrs = '', price = '', tag = '') { return `<button class="btn" ${attrs}>${inner}${price !== '' ? `<span class="price">${price}</span>` : ''}${tag ? `<span class="tag">${tag}</span>` : ''}</button>`; }
function renderTray() {
  const tray = $('tray'), L = G.view; let h = '';
  const sel = [...G.sel].filter((e) => e.layer === L);
  if (sel.length) {
    const counts = {}; sel.forEach((e) => counts[e.type] = (counts[e.type] || 0) + 1);
    h += `<div class="selinfo"><span class="n">${sel.length}</span>${Object.entries(counts).map(([t, n]) => unitIcon(t) + (n > 1 ? '×' + n : '')).join(' ')}</div><div class="items">`;
    h += btn(svg(ICON.amove), `data-cmd="amove" class="btn ${G.amove ? 'on' : ''}" aria-label="Attack-move"`, '', '');
    h += btn(svg(ICON.hold), 'data-cmd="hold" aria-label="Hold"');
    h += btn(svg(ICON.retreat), 'data-cmd="retreat" aria-label="Retreat"');
    C.LAYERS[L].lanes.forEach((_, i) => { h += btn(svg(laneIcon(i + 1)), `data-cmd="lane" data-lane="${i}" aria-label="Hold lane ${i + 1}"`); });
    if (sel.some((e) => e.def.ab === 'bombard')) h += btn('<div class="emo">☄️</div>', 'data-ab="bombard" aria-label="Orbital strike"');
    if (sel.some((e) => e.def.ab === 'ferry')) h += btn('<div class="emo">📦</div>', 'data-ab="ferry" aria-label="Ferry troops"');
    h += btn(svg(ICON.all), 'data-cmd="all" aria-label="Select all"');
    h += btn(svg(ICON.x), 'data-cmd="desel" aria-label="Deselect"');
    h += '</div>';
  } else {
    const uIcon = L === 'space' ? '🚀' : '🪖';
    h += `<div class="tabs"><button data-tab="units" class="${G.tab === 'units' ? 'on' : ''}" aria-label="Units">${uIcon}</button><button data-tab="tech" class="${G.tab === 'tech' ? 'on' : ''}" aria-label="Upgrades">🔧</button><span class="sp"></span><button data-cmd="all" aria-label="Select all">${svg(ICON.all).replace('<svg', '<svg style="width:34px;height:28px"')}</button><button data-cmd="exam" aria-label="Unit Examiner">🔍</button></div><div class="items">`;
    if (G.tab === 'units') {
      for (const t of (L === 'space' ? C.SPACE_UNITS : C.PLANET_UNITS)) {
        const d = C.UNITS[t], locked = d.need && !hasBld(d.need);
        h += btn(unitIcon(t), `data-buy="${t}" data-cost="${d.cost}" aria-label="${d.name}" class="btn ${locked ? 'lock' : ''}"`, d.cost, locked ? '🔒' : '');
      }
    } else {
      for (const [k, tch] of Object.entries(C.TECH)) if (tch.layer === L) {
        const lv = G.tech[k], max = lv >= tch.costs.length;
        h += btn(`<div class="emo">${tch.icon}</div>`, `data-tech="${k}" ${max ? '' : `data-cost="${tch.costs[lv]}"`} aria-label="${tch.name}"`, max ? 'MAX' : tch.costs[lv], '★'.repeat(lv) || '');
      }
    }
    h += '</div>';
  }
  tray.innerHTML = h; hudTick(true);
}
function hasBld(t) { return G.ents.some((e) => e.cat === 'tur' && e.type === t && alive(e)); }

// ---------- popups ----------
function openSlot(layer, i) {
  G.popup = { kind: 'slot', layer, i };
  const list = layer === 'space' ? C.SPACE_BUILD : C.PLANET_BUILD;
  $('popup').innerHTML = `<div class="hdr"><span style="font-size:22px">⬡</span><button class="x" data-pop="close" aria-label="Close">✖</button></div><div class="row">${list.map((t) => btn(svg(ICON[t], C.TURRETS[t].col), `data-build="${t}" data-cost="${C.TURRETS[t].cost}" aria-label="${C.TURRETS[t].name}"`, C.TURRETS[t].cost)).join('')}</div>`;
  placePopup(...C.LAYERS[layer].slots[i]); hudTick(true);
}
function openEnt(e) {
  G.popup = { kind: 'ent', ent: e }; const d = e.def;
  let h = `<div class="hdr">${svg(ICON[e.type] || ICON.station, d.col || P_COL)}<span class="stars">${'★'.repeat(e.tier + 1)}</span><i class="bar hpb"><i></i></i><button class="x" data-pop="close" aria-label="Close">✖</button></div><div class="row">`;
  if (e.cat === 'tur') {
    if (e.tier < 2 && !d.prod) { const c = Math.round(d.cost * C.TIER_COST[e.tier + 1]); h += btn(svg(ICON.up), `data-pop="up" data-cost="${c}" aria-label="Upgrade"`, c); }
    h += btn(svg(ICON.sell), 'data-pop="sell" aria-label="Sell"', '+' + Math.round(sellValue(e)));
    if (d.prod) for (const [t, u] of Object.entries(C.UNITS)) if (u.need === e.type) h += btn(unitIcon(t), `data-buy="${t}" data-cost="${u.cost}" aria-label="${u.name}"`, u.cost);
  }
  h += '</div>';
  $('popup').innerHTML = h; placePopup(e.x, e.y); hudTick(true);
}
function sellValue(e) { let v = e.def.cost; for (let i = 1; i <= e.tier; i++) v += e.def.cost * C.TIER_COST[i]; return v * .6 * (e.hp / e.mhp * .5 + .5); }
function placePopup(u, v) {
  const p = $('popup'); p.classList.remove('hidden');
  const [x, y] = toS(u, v), w = p.offsetWidth, h = p.offsetHeight;
  let px = x - w / 2, py = y + 30; if (py + h > MR.y + MR.h) py = y - 30 - h;
  p.style.left = clamp(px, 4, MR.x + MR.w - w - 4) + 'px'; p.style.top = clamp(py, MR.y + 4, VH - h - 4) + 'px';
}
function closePopup() { if (G) G.popup = null; $('popup').classList.add('hidden'); }

// ---------- actions ----------
function buildAt(layer, i, type) {
  const d = C.TURRETS[type]; if (G.slots[layer][i] || G.credits < d.cost) { toast('💰❌'); return false; }
  G.credits -= d.cost; const [x, y] = C.LAYERS[layer].slots[i];
  const e = mk({ side: 'p', cat: 'tur', type, def: d, layer, x, y, r: 20, body: 'bld', hp: d.hp }); e.slot = i;
  G.ents.push(e); G.slots[layer][i] = e; boom(layer, x, y, 16, '#8ff7ff');
  closePopup(); if (d.prod) renderTray(); hudTick(true); return e;
}
function upgrade(e) {
  if (e.tier >= 2) return false; const c = Math.round(e.def.cost * C.TIER_COST[e.tier + 1]); if (G.credits < c) { toast('💰❌'); return false; }
  G.credits -= c; e.tier++; const k = C.TIER_MULT[e.tier] / C.TIER_MULT[e.tier - 1]; e.mhp *= k; e.hp = Math.min(e.mhp, e.hp * k + e.mhp * .2);
  boom(e.layer, e.x, e.y, 20, '#4dff88'); openEnt(e); return true;
}
function sell(e) { G.credits += sellValue(e); e.gone = true; e.hp = 0; G.slots[e.layer][e.slot] = null; G.ents = G.ents.filter((x) => x !== e); closePopup(); renderTray(); }
function buy(type) {
  const d = C.UNITS[type];
  if (d.need && !hasBld(d.need)) { toast('🔒 ' + (d.need === 'barracks' ? '⛺' : '🏭')); return null; }
  if (G.credits < d.cost) { toast('💰❌'); return null; }
  if (G.ents.filter((e) => e.cat === 'unit' && e.layer === d.layer && !e.def.hidden).length >= C.UNIT_CAP) { toast('🚫 max'); return null; }
  G.credits -= d.cost;
  let x, y;
  if (d.layer === 'space') { const b = C.LAYERS.space.base; x = b.x - 60; y = b.y + rr(-40, 40); }
  else { const src = G.ents.find((e) => e.cat === 'tur' && e.type === d.need); x = src.x - 30; y = src.y + rr(-20, 20); }
  const u = spawnUnit(type, x, y);
  const rally = d.layer === 'space' ? { x: 840 + rr(-20, 20), y: 300 + rr(-80, 80) } : { x: 820 + rr(-20, 20), y: 300 + rr(-80, 80) };
  u.order = { type: 'move', x: rally.x, y: rally.y };
  hudTick(true); return u;
}
function buyTech(k) {
  const tch = C.TECH[k], lv = G.tech[k]; if (lv >= tch.costs.length) return false; const c = tch.costs[lv]; if (G.credits < c) { toast('💰❌'); return false; }
  G.credits -= c; G.tech[k]++;
  if (k === 'sh' || k === 'gh') { const layer = tch.layer, f = (1 + G.tech[k] * tch.mult) / (1 + (G.tech[k] - 1) * tch.mult); for (const e of G.ents) if (e.cat === 'unit' && e.layer === layer) { e.mhp *= f; e.hp *= f; } }
  toast(tch.icon + '★'.repeat(G.tech[k])); renderTray(); return true;
}
function selUnits() { return [...G.sel].filter((e) => e.layer === G.view && e.cat === 'unit' && alive(e)); }
function command(type, x, y, tgt) {
  const us = selUnits(); if (!us.length) return;
  const n = us.length, cols = Math.ceil(Math.sqrt(n));
  us.forEach((u, i) => {
    if (type === 'attack') u.order = { type: 'attack', tgt };
    else if (type === 'retreat') u.order = { type: 'retreat' };
    else if (type === 'hold') u.order = { type: 'hold' };
    else { const ox = (i % cols - (cols - 1) / 2) * 30, oy = (Math.floor(i / cols) - (cols - 1) / 2) * 30; u.order = { type, x: clamp(x + ox, 10, C.W - 10), y: clamp(y + oy, 15, C.H - 15) }; }
  });
  if (type !== 'retreat' && type !== 'hold') G.fx.push({ k: 'boom', layer: G.view, x: tgt ? tgt.x : x, y: tgt ? tgt.y : y, r: 14, t: 0, d: .35, col: type === 'move' ? '#4dff88' : '#ff8f80' });
}
function holdLane(i) {
  const L = C.LAYERS[G.view], p = L.lanes[i], u0 = L.holdU; let pt = p[0];
  for (let k = 1; k < p.length; k++) if (p[k][0] >= u0) { const [ax, ay] = p[k - 1], [bx, by] = p[k], f = (u0 - ax) / (bx - ax); pt = [u0, ay + (by - ay) * f]; break; }
  const us = selUnits();
  us.forEach((u, j) => { u.order = { type: 'hold', x: pt[0] + (j % 3) * 26 - 26, y: pt[1] + (Math.floor(j / 3) - 1) * 26 }; });
  toast('✋ ' + (i + 1));
}
function useAbility(ab) {
  const ready = selUnits().filter((e) => e.def.ab === ab && e.abCd <= 0 && !e.ferrying);
  if (!ready.length) { toast('⏳'); return; }
  G.targeting = ab === 'bombard' ? { kind: 'bombard', src: ready[0] } : { kind: 'ferry', step: 1, src: ready[0] };
  setView('planet');
  showPrompt(ab === 'bombard' ? '☄️ 👆' : '📦 👆🪖');
}
function showPrompt(t) { const p = $('prompt'); p.querySelector('.t').textContent = t; p.classList.remove('hidden'); }
function cancelTargeting() { if (G) G.targeting = null; $('prompt').classList.add('hidden'); }
function targetTap(u, v) {
  const tg = G.targeting;
  if (tg.kind === 'bombard') { startBombard(tg.src, u, v); cancelTargeting(); toast('☄️'); return; }
  if (tg.step === 1) {
    const us = ferryPick(u, v); if (!us.length) { toast('🪖 ?'); return; }
    tg.units = us; tg.step = 2; showPrompt('📦 👆📍');
  } else { startFerry(tg.src, tg.units, { x: clamp(u, 20, C.W - 20), y: clamp(v, 20, C.H - 20) }); cancelTargeting(); toast('📦 ✈'); }
}

// ---------- input ----------
const ptrs = new Map(); let gesture = null, lastTap = { t: 0, type: null };
function pickAt(x, y, filter, tol = 26) {
  let best = null, bd = 1e9;
  for (const e of G.ents) {
    if (e.layer !== G.view || !alive(e) || !filter(e)) continue;
    const [sx, sy] = toS(e.x, e.y), d = Math.hypot(sx - x, sy - y) - e.r * pxPerUnit();
    if (d < tol && d < bd) { bd = d; best = e; }
  }
  return best;
}
function slotAt(x, y) {
  const sl = C.LAYERS[G.view].slots; let best = -1, bd = 1e9;
  sl.forEach(([u, v], i) => { if (G.slots[G.view][i]) return; const [sx, sy] = toS(u, v), d = Math.hypot(sx - x, sy - y); if (d < Math.max(28, 24 * pxPerUnit()) && d < bd) { bd = d; best = i; } });
  return best;
}
function inMap(x, y) { return x >= MR.x && x <= MR.x + MR.w && y >= MR.y && y <= MR.y + MR.h; }
function tap(x, y, right = false) {
  if (G.over || !inMap(x, y)) return;
  const [u, v] = toW(x, y);
  if (G.targeting) { if (G.view === 'planet') targetTap(u, v); return; }
  const hasSel = selUnits().length > 0;
  const own = pickAt(x, y, (e) => e.cat === 'unit' && isP(e) && !e.def.hidden);
  if (own && !right) {
    const now = performance.now();
    if (now - lastTap.t < 350 && lastTap.type === own.type) { G.ents.filter((e) => e.cat === 'unit' && e.type === own.type && e.layer === G.view).forEach((e) => G.sel.add(e)); }
    else { G.sel.clear(); G.sel.add(own); }
    lastTap = { t: now, type: own.type }; closePopup(); renderTray(); return;
  }
  const enemy = pickAt(x, y, (e) => e.side === 'e');
  if (hasSel && enemy) { command('attack', 0, 0, enemy); return; }
  if (hasSel) { closePopup(); command(G.amove ? 'amove' : 'move', u, v); return; }
  if (right) return;
  const s = slotAt(x, y); if (s >= 0) { openSlot(G.view, s); return; }
  const st = pickAt(x, y, (e) => e.cat === 'tur', 8); if (st) { openEnt(st); return; }
  closePopup();
}
function boxSelect(x0, y0, x1, y1) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  const hits = G.ents.filter((e) => e.cat === 'unit' && e.layer === G.view && alive(e) && !e.def.hidden && (() => { const [sx, sy] = toS(e.x, e.y); return sx >= ax && sx <= bx && sy >= ay && sy <= by; })());
  if (hits.length) { G.sel.clear(); hits.forEach((e) => G.sel.add(e)); closePopup(); }
  renderTray();
}
function showBox(g) { const b = $('selbox'); if (!g) { b.style.display = 'none'; return; } b.style.display = 'block'; b.style.left = Math.min(g.sx, g.x) + 'px'; b.style.top = Math.min(g.sy, g.y) + 'px'; b.style.width = Math.abs(g.x - g.sx) + 'px'; b.style.height = Math.abs(g.y - g.sy) + 'px'; }
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (ev) => {
  cv.setPointerCapture(ev.pointerId);
  ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; clearTimeout(gesture?.hold); gesture = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; showBox(null); return; }
  if (ptrs.size > 2) return;
  gesture = { mode: 'tap', sx: ev.clientX, sy: ev.clientY, x: ev.clientX, y: ev.clientY, btn: ev.button, touch: ev.pointerType !== 'mouse', t: performance.now() };
  if (gesture.touch) { const g = gesture; g.hold = setTimeout(() => { if (g.mode === 'tap') { g.mode = 'box'; showBox(g); } }, 380); }
});
cv.addEventListener('pointermove', (ev) => {
  if (!ptrs.has(ev.pointerId)) return;
  ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  const g = gesture; if (!g) return;
  if (g.mode === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    zoomAt(mx, my, g.z0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0);
    cam.px += mx - g.mx; cam.py += my - g.my; g.mx = mx; g.my = my; clampCam(); calcM(); return;
  }
  const dx = ev.clientX - g.x, dy = ev.clientY - g.y; g.x = ev.clientX; g.y = ev.clientY;
  if (g.mode === 'tap' && Math.hypot(g.x - g.sx, g.y - g.sy) > 10) {
    clearTimeout(g.hold);
    if (!g.touch) g.mode = g.btn === 0 ? 'box' : 'pan';
    else g.mode = cam.z > 1.01 ? 'pan' : 'box';
  }
  if (g.mode === 'pan') { cam.px += dx; cam.py += dy; clampCam(); calcM(); }
  if (g.mode === 'box') showBox(g);
});
function endPtr(ev) {
  if (!ptrs.has(ev.pointerId)) return;
  ptrs.delete(ev.pointerId);
  const g = gesture; if (!g) return;
  if (g.mode === 'pinch') { if (ptrs.size === 0) gesture = null; return; }
  clearTimeout(g.hold);
  if (g.mode === 'tap' && ev.type === 'pointerup') tap(g.sx, g.sy, g.btn === 2);
  else if (g.mode === 'box') boxSelect(g.sx, g.sy, g.x, g.y);
  showBox(null); gesture = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', (ev) => { ev.preventDefault(); zoomAt(ev.clientX, ev.clientY, cam.z * (ev.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
addEventListener('keydown', (ev) => {
  if (!G || $('hud').classList.contains('hidden')) return;
  const k = ev.key.toLowerCase();
  if (k === ' ') { ev.preventDefault(); toggleView(); }
  else if (k === 'escape') { cancelTargeting(); G.sel.clear(); closePopup(); renderTray(); }
  else if (k === 'a') { G.amove = !G.amove; renderTray(); }
  else if (k === 'h') command('hold');
  else if (k === 'r') command('retreat');
  else if (k === 'n') startWave();
  else if (k === 'b') useAbility('bombard');
  else if (k === 'f') useAbility('ferry');
  else if (k >= '1' && k <= '3' && selUnits().length && +k <= C.LAYERS[G.view].lanes.length) holdLane(+k - 1);
});
function toggleView() { cancelTargeting(); setView(G.view === 'space' ? 'planet' : 'space'); hudTick(true); }

// DOM buttons
$('tray').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.dataset.tab) { G.tab = b.dataset.tab; renderTray(); }
  else if (b.dataset.buy) buy(b.dataset.buy);
  else if (b.dataset.tech) buyTech(b.dataset.tech);
  else if (b.dataset.ab) useAbility(b.dataset.ab);
  else if (b.dataset.cmd) {
    const c = b.dataset.cmd;
    if (c === 'amove') { G.amove = !G.amove; renderTray(); }
    else if (c === 'hold') { command('hold'); toast('✋'); }
    else if (c === 'retreat') { command('retreat'); toast('↩'); }
    else if (c === 'lane') holdLane(+b.dataset.lane);
    else if (c === 'all') { G.sel.clear(); G.ents.filter((e) => e.cat === 'unit' && e.layer === G.view && !e.def.hidden).forEach((e) => G.sel.add(e)); renderTray(); }
    else if (c === 'desel') { G.sel.clear(); renderTray(); }
    else if (c === 'exam') openExam();
  }
});
$('popup').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b || !G.popup) return; const p = G.popup;
  if (b.dataset.pop === 'close') closePopup();
  else if (b.dataset.build) buildAt(p.layer, p.i, b.dataset.build);
  else if (b.dataset.pop === 'up') upgrade(p.ent);
  else if (b.dataset.pop === 'sell') sell(p.ent);
  else if (b.dataset.buy) buy(b.dataset.buy);
});
$('viewbtn').addEventListener('click', toggleView);
$('wavebtn').addEventListener('click', () => startWave());
$('prompt').querySelector('.pcancel').addEventListener('click', cancelTargeting);
$('speed').addEventListener('click', () => { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1; $('speed').querySelector('small').textContent = G.speed + 'x'; });
$('pause').addEventListener('click', () => { G.paused = !G.paused; $('pause').textContent = G.paused ? '▶' : '⏸'; });
const openRules = () => $('rules').classList.remove('hidden');
$('help').addEventListener('click', openRules); $('help2').addEventListener('click', openRules);
document.querySelectorAll('.ovl .close').forEach((b) => b.addEventListener('click', () => b.closest('.ovl').classList.add('hidden')));
$('play').addEventListener('click', start);
$('restart').addEventListener('click', () => { $('end').classList.add('hidden'); newGame(); });
$('exambtn').addEventListener('click', openExam);
const syncDiff = () => document.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === DIFF));
document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => { DIFF = b.dataset.diff; syncDiff(); }));
syncDiff();
function start() { $('start').classList.add('hidden'); $('hud').classList.remove('hidden'); newGame(); layout(); }

// ---------- Unit Examiner (attack matrix) ----------
function openExam() {
  const lv = (n) => `<i class="l${n || 0}"></i>`;
  const row = (key, d, side, label) => `<tr class="u" data-k="${side}:${key}"><td class="nm">${side === 'e' ? svg(ICON['e_' + key] || '', E_COL) : svg(ICON[key] || ICON.station, d.col && side === 't' ? d.col : P_COL)}${d.body ? ' ' + C.BODIES[d.body].icon : ''}</td>${C.BODY_KEYS.map((b) => `<td>${lv((d.vs || {})[b])}</td>`).join('')}</tr>`;
  let h = `<table><tr><th></th>${C.BODY_KEYS.map((b) => `<th title="${C.BODIES[b].name}">${C.BODIES[b].icon}</th>`).join('')}</tr>`;
  h += '<tr class="sec"><td colspan="7">🚀</td></tr>' + C.SPACE_UNITS.map((k) => row(k, C.UNITS[k], 'u')).join('');
  h += '<tr class="sec"><td colspan="7">🛰️ 🔫</td></tr>' + C.SPACE_BUILD.map((k) => row(k, C.TURRETS[k], 't')).join('');
  h += '<tr class="sec"><td colspan="7">🪖</td></tr>' + C.PLANET_UNITS.map((k) => row(k, C.UNITS[k], 'u')).join('');
  h += '<tr class="sec"><td colspan="7">🏰 🔫</td></tr>' + C.PLANET_BUILD.filter((k) => !C.TURRETS[k].prod).map((k) => row(k, C.TURRETS[k], 't')).join('');
  h += '<tr class="sec"><td colspan="7">👾</td></tr>' + Object.keys(C.ENEMIES).map((k) => row(k, C.ENEMIES[k], 'e')).join('');
  h += '</table>';
  $('matrix').innerHTML = h; $('ucard').innerHTML = '👆'; $('exam').classList.remove('hidden');
}
$('matrix').addEventListener('click', (ev) => {
  const tr = ev.target.closest('tr.u'); if (!tr) return;
  document.querySelectorAll('#matrix tr.on').forEach((r) => r.classList.remove('on')); tr.classList.add('on');
  const [side, k] = tr.dataset.k.split(':'), d = side === 'e' ? C.ENEMIES[k] : side === 't' ? C.TURRETS[k] : C.UNITS[k];
  const ab = d.ab ? AB[d.ab] : null;
  $('ucard').innerHTML = `<div>${d.name}${d.body ? ' ' + C.BODIES[d.body].icon : ' 🏠'}</div><div class="st"><span>❤ ${d.hp}</span>${d.dmg ? `<span>💥 ${d.dmg}${d.splash ? '💫' : ''}</span>` : ''}${d.rng ? `<span>🎯 ${d.rng}</span>` : ''}${d.speed ? `<span>⚡ ${d.speed}</span>` : ''}${d.cost ? `<span>💰 ${d.cost}</span>` : ''}${d.bounty ? `<span>💰 +${d.bounty}</span>` : ''}${ab ? `<span>${ab.icon || '🛩️'} ${ab.name}</span>` : ''}</div><div style="font-size:13px;color:#aab;margin-top:4px">${d.desc || ''}</div>`;
});

// ---------- autoplay (debug / test helper) ----------
const AUTO_SPACE = ['laser', 'missile', 'flak', 'laser', 'missile', 'shield', 'flak', 'missile', 'laser', 'missile', 'flak', 'laser'];
const AUTO_PLANET = ['barracks', 'bunker', 'cannon', 'factory', 'mortar', 'ion', 'bunker', 'cannon', 'mortar'];
function autoPlay() {
  G.autoT -= DT; if (G.autoT > 0) return; G.autoT = 0.5;
  if (G.phase === 'pre' || G.phase === 'gap') startWave();
  for (const L of ['space', 'planet']) {
    if (G.autoSkip === L) continue;
    const order = L === 'space' ? AUTO_SPACE : AUTO_PLANET;
    for (let i = 0; i < order.length; i++) {
      const slots = C.LAYERS[L].slots, idx = (L === 'space' ? [6, 7, 10, 11, 3, 4, 8, 9, 0, 1, 2, 5] : [6, 3, 4, 7, 8, 2, 5, 0, 1])[i];
      if (idx == null || idx >= slots.length) continue;
      if (!G.slots[L][idx] && G.credits >= C.TURRETS[order[i]].cost + 20) { buildAt(L, idx, order[i]); break; }
    }
  }
  if (G.credits > 350) { const t = G.ents.filter((e) => e.cat === 'tur' && e.tier < 2 && !e.def.prod).sort((a, b) => a.tier - b.tier)[0]; if (t) { const c = Math.round(t.def.cost * C.TIER_COST[t.tier + 1]); if (G.credits >= c + 100) upgrade(t); } }
  for (const k of ['sw', 'gw', 'sh', 'gh']) if (G.tech[k] < 3 && G.credits > C.TECH[k].costs[G.tech[k]] + 400) buyTech(k);
  const nShips = G.ents.filter((e) => e.cat === 'unit' && e.layer === 'space' && !e.def.hidden).length;
  if (G.wave >= 3 && nShips < 4 + G.wave && G.credits > 260) buy(['frigate', 'fighter', 'bomber', 'interceptor', 'frigate', 'carrier'][(G.t * 2 | 0) % 6]);
  for (const u of G.ents) if (u.cat === 'unit' && alive(u) && u.hp < u.mhp * .3 && u.order.type !== 'retreat') u.order = { type: 'retreat' };
  for (const u of G.ents) if (u.cat === 'unit' && alive(u) && u.hp > u.mhp * .95 && u.order.type === 'idle' && u.layer === 'space' && u.def.rng) u.order = { type: 'hold', x: 700 + rr(-30, 30), y: 300 + rr(-150, 150) };
  if (G.credits > 300 && hasBld('barracks') && G.autoSkip !== 'planet') buy(['rifle', 'bazooka', 'medium', 'howitzer'][(G.t | 0) % 4].replace(/medium|howitzer/, (m) => hasBld('factory') ? m : 'bazooka'));
  for (const s of G.ents.filter((e) => e.cat === 'unit' && e.def.ab === 'bombard' && e.abCd <= 0)) {
    const tg = G.ents.filter((e) => e.cat === 'enemy' && e.layer === 'planet' && alive(e)).sort((a, b) => b.x - a.x)[0];
    if (tg) { startBombard(s, tg.x, tg.y); break; }
  }
  closePopup();
}

// ---------- main loop ----------
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(.1, (now - last) / 1000); last = now;
  if (!G) return;
  if (!G.paused && !$('hud').classList.contains('hidden')) {
    acc += rdt * G.speed * (DEBUG && +Q.get('speed') ? +Q.get('speed') : 1);
    let n = 0; while (acc >= DT && n < 40) { step(); acc -= DT; n++; }
    if (n >= 40) acc = 0;
  }
  if (G.popup && G.popup.kind === 'ent' && !alive(G.popup.ent)) closePopup();
  render(); hudTick();
}
addEventListener('resize', () => { if (G) { layout(); if (G.popup) { if (G.popup.kind === 'slot') placePopup(...C.LAYERS[G.popup.layer].slots[G.popup.i]); else placePopup(G.popup.ent.x, G.popup.ent.y); } } });
newGame(); layout(); requestAnimationFrame(frame);
if (Q.has('autostart')) start();

// ---------- debug API ----------
if (DEBUG) {
  window.SD = {
    get G() { return G; }, C, start, input: () => ({ ptrs: ptrs.size, gesture: gesture && gesture.mode }), toS: (u, v) => toS(u, v), toW, layout: () => ({ MR, portrait, S, z: cam.z }),
    fast(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n && !G.over; i++) step(); render(); hudTick(true); return this.state(); },
    auto(on = true, skip = null) { G.auto = on; G.autoSkip = skip; }, god(on = true) { G.god = on; }, credits(n) { G.credits = n; hudTick(true); }, nextWave: startWave, setView, toggleView,
    killAll() { for (const e of G.ents) if (e.side === 'e') kill(e, 'p'); G.queue = []; },
    state() { const b = (t) => { const e = G.ents.find((x) => x.cat === 'base' && x.type === t); return e ? Math.round(e.hp) : 0; }; return { t: +G.t.toFixed(1), wave: G.wave, phase: G.phase, credits: Math.floor(G.credits), station: b('station'), hq: b('hq'), enemies: G.ents.filter((e) => e.cat === 'enemy').length, enemiesPlanet: G.ents.filter((e) => e.cat === 'enemy' && e.layer === 'planet').length, units: G.ents.filter((e) => e.cat === 'unit').map((e) => e.type), turrets: G.ents.filter((e) => e.cat === 'tur').map((e) => e.type + e.tier), kills: G.kills, view: G.view, sel: [...G.sel].map((e) => e.type), drops: G.drops.length, trips: G.trips.length, strikes: G.strikes.length, landed: G.dropCount || 0, strikesTotal: G.strikeCount || 0, tripsTotal: G.tripCount || 0, over: G.over, targeting: G.targeting && G.targeting.kind }; },
  };
}
