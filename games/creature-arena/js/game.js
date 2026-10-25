// Creature Arena — original top-down creature battler. Vanilla JS + canvas, no libraries.
const $ = (s) => document.querySelector(s);
const cv = $('#cv'), g = cv.getContext('2d');
const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let W = 0, H = 0, DPR = 1, Z = 1;

// ---------- types (icon-only): 🔥▶🍃 🍃▶💧 💧▶🔥, 🪨 resists 🔥 ----------
const EL = { fire: { ic: '🔥', col: '#ff7a2e', glow: '#ffd15a' }, water: { ic: '💧', col: '#3fa9ff', glow: '#bfe9ff' }, leaf: { ic: '🍃', col: '#5cc94f', glow: '#e3ff9a' }, rock: { ic: '🪨', col: '#a39b8e', glow: '#fff' } };
const BEATS = { fire: 'leaf', leaf: 'water', water: 'fire' };
export function mult(a, d) {
  if (d === 'rock' && a === 'fire') return 0.5;
  if (d === 'rock' && (a === 'water' || a === 'leaf')) return 1.5;
  if (BEATS[a] === d) return 1.5;
  if (BEATS[d] === a) return 0.67;
  return 1;
}

// ---------- creatures (all original) ----------
const SPECIES = {
  drake: { name: 'Emberling', el: 'fire', hp: 160, spd: 215, r: 22, body: '#e8432e', dark: '#a8261a', belly: '#ffc15a' },
  pup: { name: 'Tidepup', el: 'water', hp: 175, spd: 200, r: 23, body: '#3c8fe0', dark: '#20589c', belly: '#d2eeff' },
  kit: { name: 'Leafkit', el: 'leaf', hp: 150, spd: 230, r: 21, body: '#4caf50', dark: '#2c7a30', belly: '#ecf7b8' },
  turtle: { name: 'Boulderback', el: 'rock', hp: 130, spd: 80, r: 30, body: '#8d8a84', dark: '#5b5852', belly: '#c9c2b4', ai: 'tank' },
  fin: { name: 'Splashfin', el: 'water', hp: 95, spd: 125, r: 22, body: '#2fb6c9', dark: '#17707e', belly: '#c9f6ff', ai: 'kiter' },
  thorn: { name: 'Thornling', el: 'leaf', hp: 85, spd: 150, r: 20, body: '#6fae2a', dark: '#3d6b12', belly: '#d6f08a', ai: 'rusher' },
};
const STARTERS = ['drake', 'pup', 'kit'];
const MOVES = {
  fire: [{ k: 'light', name: 'Spark', ic: '✨', cost: 5, cd: 0.28 }, { k: 'stream', name: 'Blaze Hose', ic: '🔥', cost: 30, cd: 1.4 }, { k: 'big', name: 'Sun Bomb', ic: '☄️', cost: 0, cd: 6 }, { k: 'claw', name: 'Drake Swipe', ic: '🐾', cost: 16, cd: 0.5 }],
  water: [{ k: 'light', name: 'Bubble', ic: '🫧', cost: 5, cd: 0.28 }, { k: 'stream', name: 'Tide Jet', ic: '🌊', cost: 30, cd: 1.4 }, { k: 'big', name: 'Wave Bomb', ic: '💥', cost: 0, cd: 6 }, { k: 'claw', name: 'Fin Slash', ic: '🦈', cost: 16, cd: 0.5 }],
  leaf: [{ k: 'light', name: 'Seed Shot', ic: '🌰', cost: 5, cd: 0.28 }, { k: 'stream', name: 'Petal Storm', ic: '🌸', cost: 30, cd: 1.4 }, { k: 'big', name: 'Thorn Bomb', ic: '🌵', cost: 0, cd: 6 }, { k: 'claw', name: 'Vine Whip', ic: '🌿', cost: 16, cd: 0.5 }],
};
const ULT = { fire: { name: 'Inferno Nova', ic: '🌋' }, water: { name: 'Tsunami Ring', ic: '🌀' }, leaf: { name: 'Bloom Burst', ic: '🌻' } };
const WAVES = [['turtle'], ['thorn', 'fin'], ['turtle', 'thorn'], ['fin', 'fin', 'thorn'], ['boss', 'thorn']];
const R = 500; // arena radius (world units)
const PILLARS = Array.from({ length: 14 }, (_, i) => ({ x: Math.cos(i / 14 * TAU) * (R + 6), y: Math.sin(i / 14 * TAU) * (R + 6), r: 34 }));

// ---------- save ----------
const SAVE_KEY = 'creature-arena:save';
let save = { wins: 0, best: 0, pick: 'drake', sound: true };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
const unlocked = (id) => STARTERS.indexOf(id) <= save.wins;

// ---------- audio (WebAudio synth, no files) ----------
let AC = null, master = null;
function audioOn() { if (AC) { if (AC.state === 'suspended') AC.resume(); return; } try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.35; master.connect(AC.destination); } catch (e) {} }
function tone(f0, f1, dur, type = 'square', vol = 0.3, delay = 0) {
  if (!AC || !save.sound) return; const t = AC.currentTime + delay, o = AC.createOscillator(), v = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(v); v.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
let noiseBuf = null;
function noise(dur, vol = 0.3, freq = 900) {
  if (!AC || !save.sound) return; if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), v = AC.createGain(); s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
  v.gain.setValueAtTime(vol, t); v.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(v); v.connect(master); s.start(t); s.stop(t + dur);
}
const SFX = {
  light: () => tone(900, 400, 0.09, 'square', 0.12), stream: () => noise(0.35, 0.22, 1800), big: () => { tone(220, 60, 0.4, 'sawtooth', 0.22); noise(0.3, 0.2, 600); },
  claw: () => { noise(0.12, 0.3, 3000); tone(500, 200, 0.1, 'triangle', 0.15); }, hit: () => { noise(0.08, 0.25, 2400); tone(300, 120, 0.08, 'square', 0.12); },
  hurt: () => { tone(200, 80, 0.2, 'sawtooth', 0.25); noise(0.15, 0.25, 900); }, dodge: () => tone(300, 900, 0.15, 'sine', 0.18), boom: () => { noise(0.6, 0.45, 500); tone(120, 40, 0.5, 'sine', 0.4); },
  ult: () => { tone(200, 1200, 0.5, 'sawtooth', 0.2); noise(0.9, 0.4, 700); tone(80, 30, 0.9, 'sine', 0.45, 0.1); }, warn: () => tone(660, 660, 0.07, 'square', 0.07),
  ko: () => { tone(600, 100, 0.5, 'triangle', 0.25); }, win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.18, 'square', 0.15, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.97, 0.25, 'triangle', 0.2, i * 0.18)), wave: () => [440, 660].forEach((f, i) => tone(f, f, 0.12, 'square', 0.12, i * 0.1)),
};
const sfx = (k) => { try { SFX[k] && SFX[k](); } catch (e) {} };

// ---------- state ----------
const S = { mode: 'pick', t: 0, wave: 0, score: 0, shake: 0, flash: 0, player: null, foes: [], shots: [], fx: [], nums: [], teles: [], bannerT: 0, waveT: 0, stats: { telegraphs: 0, enemyHits: 0, dodged: 0, ults: 0, moves: {} } };
const input = { jx: 0, jy: 0, keys: {}, queue: [] };

function mk(id, x, y, foe, boss) {
  const sp = SPECIES[id], hpMul = foe ? (1 + 0.12 * S.wave) * (boss ? 2.2 : 1) : 1;
  return { id, sp, el: sp.el, x, y, vx: 0, vy: 0, r: sp.r * (boss ? 1.35 : 1), hp: sp.hp * hpMul, max: sp.hp * hpMul, face: 1, ang: 0, flash: 0, iframe: 0, foe, boss,
    en: 100, ult: 0, cds: [0, 0, 0, 0], dodgeCd: 0, roll: 0, rollX: 0, rollY: 0, chan: 0, chanAng: 0, walk: 0,
    st: 'chase', stT: 0, atkCd: rnd(1.2, 2), dodgeT: 0, aiCd: 1, strafe: Math.random() < 0.5 ? 1 : -1, tele: null };
}

function startRun() {
  S.wave = 0; S.score = 0; S.shots = []; S.fx = []; S.nums = []; S.teles = []; S.foes = [];
  S.player = mk(save.pick, 0, 160, false); S.mode = 'play'; buildPad(); showScr(null); nextWave();
}
function nextWave() {
  S.wave++; S.teles = []; const list = WAVES[S.wave - 1];
  S.foes = list.map((id, i) => { const a = -Math.PI / 2 + (i - (list.length - 1) / 2) * 0.7, boss = id === 'boss'; return mk(boss ? 'turtle' : id, Math.cos(a) * 330, Math.sin(a) * 330, true, boss); });
  banner(`🌊 ${S.wave}/${WAVES.length}`); sfx('wave'); $('#wave').textContent = '🌊' + S.wave;
}
function banner(txt, sec = 1.4) { const b = $('#banner'); b.textContent = txt; b.classList.add('show'); S.bannerT = sec; }

// ---------- combat helpers ----------
function aimAt(p) {
  let best = null, bd = 1e9; for (const f of S.foes) { const d = dist(p, f); if (d < bd) { bd = d; best = f; } }
  if (best && bd < 700) return Math.atan2(best.y - p.y, best.x - p.x);
  return Math.hypot(p.vx, p.vy) > 5 ? Math.atan2(p.vy, p.vx) : (p.face > 0 ? 0 : Math.PI);
}
function shoot(o, ang, spd, r, dmg, kind, life, extra = {}) { S.shots.push({ x: o.x + Math.cos(ang) * o.r, y: o.y + Math.sin(ang) * o.r, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r, dmg, el: o.el, foe: o.foe, kind, life, t: 0, ...extra }); }
function damage(t, dmg, el, src) {
  if (t.hp <= 0) return 0;
  if (!t.foe && t.iframe > 0) { S.stats.dodged++; num(t.x, t.y - t.r - 10, '💨', '#cfe'); return 0; }
  const m = mult(el, t.el), d = Math.max(1, Math.round(dmg * m));
  t.hp -= d; t.flash = 0.12;
  num(t.x + rnd(-8, 8), t.y - t.r - 8, d + (m > 1 ? '▲' : m < 1 ? '▼' : ''), t.foe ? (m > 1 ? '#ffe14a' : m < 1 ? '#bbb' : '#fff') : '#ff5a5a', m > 1 ? 1.35 : 1);
  if (t.foe) { S.score += d; if (src !== 'ult') S.player.ult = Math.min(100, S.player.ult + d * 0.55); sfx('hit'); S.shake = Math.max(S.shake, 3); }
  else { S.player.ult = Math.min(100, S.player.ult + d * 0.5); S.stats.enemyHits++; sfx('hurt'); S.shake = Math.max(S.shake, 9); S.flash = 0.18; }
  burst(t.x, t.y, EL[el].col, 8, 120);
  if (t.hp <= 0) { t.hp = 0; if (t.foe) { S.score += t.boss ? 400 : 100; sfx('ko'); burst(t.x, t.y, '#fff', 24, 260); S.shake = 12; } }
  return d;
}
function num(x, y, txt, col, sc = 1) { S.nums.push({ x, y, txt, col, t: 0, sc }); }
function burst(x, y, col, n, sp) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(0.3, 1) * sp; S.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(0.25, 0.55), r: rnd(2, 5), col }); } }
function dust(x, y) { S.fx.push({ x: x + rnd(-8, 8), y: y + rnd(-3, 3), vx: rnd(-20, 20), vy: rnd(-25, -5), t: 0, life: rnd(0.35, 0.6), r: rnd(4, 8), col: '#d8bd8a', dust: 1 }); }
function ring(x, y, col, rad, life = 0.4) { S.fx.push({ x, y, vx: 0, vy: 0, t: 0, life, r: rad, col, ring: 1 }); }

// ---------- player actions ----------
export function act(name) {
  const p = S.player; if (S.mode !== 'play' || !p || p.hp <= 0) return false;
  if (name === 'dodge') {
    if (p.dodgeCd > 0) return false;
    let dx = input.jx, dy = input.jy; if (Math.hypot(dx, dy) < 0.2) { dx = p.face; dy = 0; } const l = Math.hypot(dx, dy);
    p.roll = 0.3; p.rollX = dx / l; p.rollY = dy / l; p.iframe = 0.4; p.dodgeCd = 0.9; sfx('dodge'); for (let i = 0; i < 6; i++) dust(p.x, p.y + p.r * 0.6); return true;
  }
  if (name === 'ult') {
    if (p.ult < 100) return false;
    p.ult = 0; p.iframe = Math.max(p.iframe, 0.6); S.stats.ults++; sfx('ult'); S.shake = 18; S.flash = 0.3;
    for (const f of S.foes) if (dist(p, f) < 300) damage(f, 70, p.el, 'ult');
    for (let i = 0; i < 4; i++) ring(p.x, p.y, i % 2 ? EL[p.el].glow : EL[p.el].col, 300, 0.45 + i * 0.12);
    burst(p.x, p.y, EL[p.el].col, 60, 420); S.shots = S.shots.filter((s) => !s.foe); return true;
  }
  const i = +name, mv = MOVES[p.el][i]; if (!mv) return false;
  if (p.cds[i] > 0 || p.en < mv.cost || p.chan > 0) return false;
  p.en -= mv.cost; p.cds[i] = mv.cd; S.stats.moves[mv.k] = (S.stats.moves[mv.k] || 0) + 1;
  const a = aimAt(p); p.face = Math.cos(a) >= 0 ? 1 : -1; sfx(mv.k);
  if (mv.k === 'light') shoot(p, a, 620, 9, 8, 'light', 0.9);
  else if (mv.k === 'stream') { p.chan = 1.1; p.chanAng = a; }
  else if (mv.k === 'big') shoot(p, a, 430, 18, 38, 'big', 1.4, { aoe: 80 });
  else if (mv.k === 'claw') {
    const hx = p.x + Math.cos(a) * (p.r + 22), hy = p.y + Math.sin(a) * (p.r + 22);
    S.fx.push({ x: hx, y: hy, t: 0, life: 0.2, r: 40, col: EL[p.el].glow, claw: 1, ang: a, vx: 0, vy: 0 });
    for (const f of S.foes) if (Math.hypot(f.x - hx, f.y - hy) < 46 + f.r) { damage(f, 22, p.el, p); f.vx += Math.cos(a) * 260; f.vy += Math.sin(a) * 260; }
  }
  return true;
}

// ---------- enemy AI: FSM (chase → kite → windup[telegraph] → attack → recover, + dodge) ----------
const AI = {
  tank: { pref: 240, atks: ['beam', 'slam'] },
  kiter: { pref: 320, atks: ['volley', 'volley', 'geyser'] },
  rusher: { pref: 90, atks: ['lunge', 'spikes'] },
};
function pickAtk(f, d) {
  const a = AI[f.sp.ai].atks;
  if (f.sp.ai === 'tank') return d < 130 ? 'slam' : 'beam';
  if (f.sp.ai === 'rusher') return d < 240 ? 'lunge' : 'spikes';
  return a[Math.floor(Math.random() * a.length)];
}
const WIND = { beam: 0.95, slam: 0.8, volley: 0.65, geyser: 0.9, lunge: 0.6, spikes: 0.9 };
function telegraph(f, kind, p) {
  const a = Math.atan2(p.y - f.y, p.x - f.x), t = { kind, f, ang: a, x: p.x, y: p.y, t: 0, dur: WIND[kind] * (f.boss ? 0.85 : 1) };
  if (kind === 'beam') t.len = 640, t.w = f.boss ? 34 : 26;
  if (kind === 'lunge') t.len = 300, t.w = 30;
  if (kind === 'slam') { t.x = f.x; t.y = f.y; t.rad = f.boss ? 130 : 105; }
  if (kind === 'spikes' || kind === 'geyser') t.rad = kind === 'geyser' ? 80 : 70;
  if (kind === 'volley') t.len = 180, t.w = 6;
  f.tele = t; S.teles.push(t); S.stats.telegraphs++; sfx('warn'); return t;
}
function release(f, t, p) {
  const inBeam = (len, w) => { const dx = p.x - f.x, dy = p.y - f.y, u = dx * Math.cos(t.ang) + dy * Math.sin(t.ang), v = -dx * Math.sin(t.ang) + dy * Math.cos(t.ang); return u > 0 && u < len && Math.abs(v) < w / 2 + p.r * 0.6; };
  const dm = f.boss ? 1.3 : 1;
  if (t.kind === 'beam') { if (inBeam(t.len, t.w)) damage(p, 22 * dm, f.el, f); S.fx.push({ beam: 1, x: f.x, y: f.y, ang: t.ang, len: t.len, w: t.w, t: 0, life: 0.25, col: '#ffe9a8', vx: 0, vy: 0 }); S.shake = Math.max(S.shake, 6); sfx('big'); }
  else if (t.kind === 'slam' || t.kind === 'spikes' || t.kind === 'geyser') { if (Math.hypot(p.x - t.x, p.y - t.y) < t.rad + p.r * 0.5) damage(p, (t.kind === 'slam' ? 20 : 17) * dm, f.el, f); ring(t.x, t.y, EL[f.el].col, t.rad, 0.35); burst(t.x, t.y, t.kind === 'slam' ? '#cbb68c' : EL[f.el].col, 18, 200); S.shake = Math.max(S.shake, 5); sfx('boom'); }
  else if (t.kind === 'volley') { for (let k = -1; k <= 1; k++) shoot(f, t.ang + k * 0.22, 360, 10, 11 * dm, 'orb', 1.6); sfx('light'); }
  else if (t.kind === 'lunge') { f.dash = 0.32; f.dashA = t.ang; f.dashHit = false; sfx('claw'); }
}
function updFoe(f, p, dt) {
  f.flash = Math.max(0, f.flash - dt); f.atkCd -= dt; f.aiCd -= dt; f.stT += dt;
  const d = dist(f, p), a = Math.atan2(p.y - f.y, p.x - f.x), ai = AI[f.sp.ai]; let mx = 0, my = 0, spd = f.sp.spd * (f.boss ? 0.85 : 1);
  f.face = Math.cos(a) >= 0 ? 1 : -1;
  // dodge incoming player shots
  if (f.st !== 'windup' && f.st !== 'dodge' && f.aiCd <= 0) {
    for (const s of S.shots) { if (s.foe) continue; const rx = f.x - s.x, ry = f.y - s.y, sp = Math.hypot(s.vx, s.vy), along = (rx * s.vx + ry * s.vy) / sp, side = Math.abs(rx * s.vy - ry * s.vx) / sp;
      if (along > 0 && along < 170 && side < f.r + s.r + 10) { f.aiCd = 1.6; if (Math.random() < (s.kind === 'big' ? 0.7 : 0.3)) { f.st = 'dodge'; f.stT = 0; const sa = Math.atan2(s.vy, s.vx) + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); f.dvx = Math.cos(sa); f.dvy = Math.sin(sa); } break; } }
  }
  if (f.dash > 0) { f.dash -= dt; mx = Math.cos(f.dashA) * 3.2; my = Math.sin(f.dashA) * 3.2; if (!f.dashHit && d < f.r + p.r + 6) { f.dashHit = true; damage(p, 16 * (f.boss ? 1.3 : 1), f.el, f); } }
  else if (f.st === 'chase' || f.st === 'kite') {
    if (d > ai.pref + 60) { f.st = 'chase'; mx = Math.cos(a); my = Math.sin(a); }
    else { f.st = 'kite'; const away = d < ai.pref - 50 ? -1 : 0; mx = Math.cos(a) * away + Math.cos(a + Math.PI / 2) * f.strafe * 0.7; my = Math.sin(a) * away + Math.sin(a + Math.PI / 2) * f.strafe * 0.7; if (Math.random() < dt * 0.4) f.strafe *= -1; }
    if (f.atkCd <= 0 && d < 560) { f.st = 'windup'; f.stT = 0; telegraph(f, pickAtk(f, d), p); }
  } else if (f.st === 'windup') {
    const t = f.tele; if (t.kind === 'beam' || t.kind === 'lunge' || t.kind === 'volley') t.ang += clamp(((a - t.ang + Math.PI * 3) % TAU) - Math.PI, -dt * 0.5, dt * 0.5); // slow tracking: dodgeable
    if (t.kind === 'slam') { t.x = f.x; t.y = f.y; }
    if (f.stT >= t.dur) { release(f, t, p); S.teles = S.teles.filter((x) => x !== t); f.tele = null; f.st = 'recover'; f.stT = 0; f.atkCd = rnd(1.4, 2.4) * (f.boss ? 0.75 : 1); }
  } else if (f.st === 'recover') { if (f.stT > 0.5) f.st = 'chase'; }
  else if (f.st === 'dodge') { mx = f.dvx * 2.6; my = f.dvy * 2.6; if (f.stT > 0.28) { f.st = 'chase'; } }
  f.vx += (mx * spd - f.vx) * Math.min(1, dt * 8); f.vy += (my * spd - f.vy) * Math.min(1, dt * 8);
  f.x += f.vx * dt; f.y += f.vy * dt; if (Math.hypot(f.vx, f.vy) > 40) { f.walk += dt; if (Math.random() < dt * 8) dust(f.x, f.y + f.r * 0.6); }
}

// ---------- update ----------
function keep(o) {
  const d = Math.hypot(o.x, o.y), lim = R - o.r - 8; if (d > lim) { o.x *= lim / d; o.y *= lim / d; }
}
export function step(dt) {
  S.t += dt;
  if (S.bannerT > 0 && (S.bannerT -= dt) <= 0) $('#banner').classList.remove('show');
  S.shake = Math.max(0, S.shake - dt * 30); S.flash = Math.max(0, S.flash - dt);
  for (const e of S.fx) { e.t += dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.92; e.vy *= 0.92; }
  S.fx = S.fx.filter((e) => e.t < e.life);
  for (const n of S.nums) { n.t += dt; n.y -= 40 * dt; } S.nums = S.nums.filter((n) => n.t < 0.9);
  if (S.mode !== 'play') return;
  const p = S.player;
  // input → move
  let jx = input.jx, jy = input.jy; const k = input.keys;
  if (k.KeyA || k.ArrowLeft) jx -= 1; if (k.KeyD || k.ArrowRight) jx += 1; if (k.KeyW || k.ArrowUp) jy -= 1; if (k.KeyS || k.ArrowDown) jy += 1;
  const jl = Math.hypot(jx, jy); if (jl > 1) { jx /= jl; jy /= jl; }
  while (input.queue.length) act(input.queue.shift());
  p.en = Math.min(100, p.en + dt * 9); p.dodgeCd -= dt; p.iframe -= dt; p.flash = Math.max(0, p.flash - dt); for (let i = 0; i < 4; i++) p.cds[i] = Math.max(0, p.cds[i] - dt);
  if (p.roll > 0) { p.roll -= dt; p.vx = p.rollX * 560; p.vy = p.rollY * 560; }
  else { const sp = p.sp.spd * (p.chan > 0 ? 0.45 : 1); p.vx += (jx * sp - p.vx) * Math.min(1, dt * 12); p.vy += (jy * sp - p.vy) * Math.min(1, dt * 12); }
  if (Math.abs(jx) > 0.15 && p.chan <= 0) p.face = jx > 0 ? 1 : -1;
  p.x += p.vx * dt; p.y += p.vy * dt;
  const mv = Math.hypot(p.vx, p.vy); if (mv > 40) { p.walk += dt * mv / 120; if (Math.random() < dt * 14) dust(p.x, p.y + p.r * 0.6); }
  if (p.chan > 0) { p.chan -= dt; const a = aimAt(p); p.chanAng += clamp(((a - p.chanAng + Math.PI * 3) % TAU) - Math.PI, -dt * 4, dt * 4); p.face = Math.cos(p.chanAng) >= 0 ? 1 : -1;
    p.chanAcc = (p.chanAcc || 0) + dt; while (p.chanAcc > 1 / 40) { p.chanAcc -= 1 / 40; shoot(p, p.chanAng + rnd(-0.16, 0.16), rnd(420, 520), 11, 1.1, 'stream', 0.42); } }
  // foes
  for (const f of S.foes) updFoe(f, p, dt);
  // separation + arena + pillars
  const all = [p, ...S.foes];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { const a = all[i], b = all[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, o = a.r + b.r - d; if (o > 0) { a.x -= dx / d * o / 2; a.y -= dy / d * o / 2; b.x += dx / d * o / 2; b.y += dy / d * o / 2; } }
  all.forEach(keep);
  // shots
  for (const s of S.shots) {
    s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; if (s.kind === 'stream') { s.r += dt * 30; } if (s.kind !== 'stream' && Math.random() < 0.5) S.fx.push({ x: s.x, y: s.y, vx: 0, vy: 0, t: 0, life: 0.22, r: s.r * 0.6, col: EL[s.el].col });
    if (Math.hypot(s.x, s.y) > R - 4) { s.life = 0; if (s.aoe) explode(s); continue; }
    if (s.foe) { if (Math.hypot(p.x - s.x, p.y - s.y) < p.r + s.r) { damage(p, s.dmg, s.el, null); s.life = 0; } }
    else for (const f of S.foes) { if (f.hp > 0 && Math.hypot(f.x - s.x, f.y - s.y) < f.r + s.r) { if (s.aoe) explode(s); else damage(f, s.dmg, s.el, p); s.life = 0; break; } }
  }
  S.shots = S.shots.filter((s) => s.life > 0 && s.t < s.life);
  S.foes = S.foes.filter((f) => f.hp > 0 || (S.teles = S.teles.filter((t) => t.f !== f), false));
  // wave flow
  if (p.hp <= 0) { end(false); return; }
  if (!S.foes.length) {
    if (S.waveT <= 0) { S.waveT = 1.6; S.score += 150 * S.wave; banner(S.wave >= WAVES.length ? '🏆' : '✅ +' + 150 * S.wave); p.hp = Math.min(p.max, p.hp + 30); }
    else if ((S.waveT -= dt) <= 0) { S.waveT = 0; if (S.wave >= WAVES.length) end(true); else nextWave(); }
  }
}
function explode(s) { for (const f of S.foes) { const d = Math.hypot(f.x - s.x, f.y - s.y); if (d < s.aoe + f.r) damage(f, s.dmg * (d < f.r + s.r ? 1 : 0.6), s.el, S.player); } ring(s.x, s.y, EL[s.el].col, s.aoe, 0.35); burst(s.x, s.y, EL[s.el].glow, 26, 300); S.shake = Math.max(S.shake, 10); sfx('boom'); }
function end(won) {
  S.mode = won ? 'win' : 'lose'; S.teles = [];
  const unlockedNew = won && save.wins < STARTERS.length - 1 ? STARTERS[save.wins + 1] : null;
  if (won) save.wins++; save.best = Math.max(save.best, S.score); persist();
  $('#endT').textContent = won ? '🏆' : '💀'; $('#endScore').textContent = pad6(S.score);
  $('#endMsg').innerHTML = (won ? '⭐'.repeat(Math.min(3, 1 + Math.floor(S.player.hp / S.player.max * 3))) : '🌊 ' + S.wave + '/' + WAVES.length) + (unlockedNew ? ` · 🔓 <canvas id="unl" width="72" height="72" style="width:48px;height:48px;vertical-align:middle"></canvas>` : '') + `<div style="font-size:14px;opacity:.75">🏅 ${pad6(save.best)}</div>`;
  showScr('#end'); if (unlockedNew) drawPortrait($('#unl').getContext('2d'), unlockedNew, 72, true);
  sfx(won ? 'win' : 'lose');
}
const pad6 = (n) => String(Math.floor(n)).padStart(6, '0');

// ---------- drawing ----------
let arenaImg = null;
function buildArena() {
  const sz = (R + 80) * 2, c = document.createElement('canvas'); c.width = c.height = sz; const a = c.getContext('2d'), m = sz / 2;
  a.fillStyle = '#8a6a43'; a.fillRect(0, 0, sz, sz);
  const gr = a.createRadialGradient(m, m, 50, m, m, R); gr.addColorStop(0, '#f0d6a2'); gr.addColorStop(0.8, '#e2c48c'); gr.addColorStop(1, '#c9a46c');
  a.fillStyle = gr; a.beginPath(); a.arc(m, m, R, 0, TAU); a.fill();
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) { const ang = r() * TAU, d = Math.sqrt(r()) * R, x = m + Math.cos(ang) * d, y = m + Math.sin(ang) * d; a.fillStyle = r() < 0.5 ? '#c9a66e55' : '#fff0d044'; a.fillRect(x, y, 2 + r() * 3, 2 + r() * 2); }
  for (let i = 0; i < 160; i++) { const ang = r() * TAU, d = Math.sqrt(r()) * (R - 20), x = m + Math.cos(ang) * d, y = m + Math.sin(ang) * d, s = 2 + r() * 6;
    a.fillStyle = '#0002'; a.beginPath(); a.ellipse(x + 1.5, y + 2, s, s * 0.7, 0, 0, TAU); a.fill(); a.fillStyle = ['#b39b7a', '#a08868', '#cbb592', '#8f7a5f'][i % 4]; a.beginPath(); a.ellipse(x, y, s, s * 0.75, r() * 3, 0, TAU); a.fill(); }
  for (let i = 0; i < 40; i++) { const ang = r() * TAU, d = Math.sqrt(r()) * (R - 60), x = m + Math.cos(ang) * d, y = m + Math.sin(ang) * d; a.strokeStyle = '#a9875655'; a.lineWidth = 1.5; a.beginPath(); a.moveTo(x, y); for (let k = 0; k < 3; k++) a.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40); a.stroke(); }
  a.strokeStyle = '#fff8e4aa'; a.lineWidth = 7; a.beginPath(); a.arc(m, m, R * 0.62, 0, TAU); a.stroke();
  a.strokeStyle = '#fff8e466'; a.lineWidth = 4; a.beginPath(); a.arc(m, m, 70, 0, TAU); a.stroke(); a.beginPath(); a.moveTo(m - R * 0.62, m); a.lineTo(m + R * 0.62, m); a.stroke();
  a.strokeStyle = '#6e5230'; a.lineWidth = 22; a.beginPath(); a.arc(m, m, R + 10, 0, TAU); a.stroke(); a.strokeStyle = '#a5845a'; a.lineWidth = 8; a.beginPath(); a.arc(m, m, R + 4, 0, TAU); a.stroke();
  arenaImg = c;
}
function drawPillar(p) {
  g.fillStyle = '#0004'; g.beginPath(); g.ellipse(p.x + 6, p.y + 10, p.r, p.r * 0.6, 0, 0, TAU); g.fill();
  g.fillStyle = '#7b7268'; g.beginPath(); g.ellipse(p.x, p.y + 6, p.r, p.r * 0.62, 0, 0, TAU); g.fill();
  g.fillStyle = '#8e857a'; g.fillRect(p.x - p.r, p.y - 30, p.r * 2, 36);
  g.fillStyle = '#b4ab9e'; g.beginPath(); g.ellipse(p.x, p.y - 30, p.r, p.r * 0.62, 0, 0, TAU); g.fill();
  g.strokeStyle = '#6a6158'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x - 12, p.y - 34); g.lineTo(p.x + 4, p.y - 26); g.lineTo(p.x + 14, p.y - 32); g.stroke();
}
// creature art: cute 3/4 top-down, drawn upright, mirrored by facing
function drawCreature(c, id, x, y, sc, face, t, flash, boss) {
  const sp = SPECIES[id], r = sp.r * (boss ? 1.35 : 1) * sc, bob = Math.sin(t * 10) * r * 0.05;
  c.save(); c.translate(x, y); c.fillStyle = '#0003'; c.beginPath(); c.ellipse(0, r * 0.75, r * 1.05, r * 0.42, 0, 0, TAU); c.fill();
  c.translate(0, bob); c.scale(face, 1);
  const B = flash ? '#fff' : sp.body, D = flash ? '#fff' : sp.dark, L = flash ? '#fff' : sp.belly;
  const eye = (ex, ey, s) => { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, ey, s, s * 1.15, 0, 0, TAU); c.fill(); c.fillStyle = '#1b1b2a'; c.beginPath(); c.arc(ex + s * 0.25, ey + s * 0.1, s * 0.62, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + s * 0.45, ey - s * 0.25, s * 0.25, 0, TAU); c.fill(); };
  c.lineWidth = Math.max(1.5, r * 0.08); c.strokeStyle = '#2a1a12';
  if (id === 'drake') {
    // tail with flame tip
    c.fillStyle = B; c.beginPath(); c.moveTo(-r * 0.5, r * 0.2); c.quadraticCurveTo(-r * 1.3, r * 0.4, -r * 1.35, -r * 0.2); c.lineTo(-r * 1.15, -r * 0.1); c.quadraticCurveTo(-r * 1.0, r * 0.1, -r * 0.4, -r * 0.1); c.fill(); c.stroke();
    const fl = 1 + Math.sin(t * 22) * 0.15; c.fillStyle = '#ffb12e'; c.beginPath(); c.ellipse(-r * 1.3, -r * 0.4, r * 0.22 * fl, r * 0.38 * fl, -0.3, 0, TAU); c.fill(); c.fillStyle = '#fff36a'; c.beginPath(); c.ellipse(-r * 1.3, -r * 0.33, r * 0.1, r * 0.2, -0.3, 0, TAU); c.fill();
    // wings
    c.fillStyle = D; c.beginPath(); c.moveTo(-r * 0.2, -r * 0.3); c.lineTo(-r * 0.95, -r * 1.05); c.lineTo(-r * 0.75, -r * 0.5); c.lineTo(-r * 1.0, -r * 0.45); c.lineTo(-r * 0.35, r * 0.05); c.fill(); c.stroke();
    c.fillStyle = B; c.beginPath(); c.ellipse(0, r * 0.1, r * 0.72, r * 0.62, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = L; c.beginPath(); c.ellipse(r * 0.12, r * 0.22, r * 0.42, r * 0.38, 0, 0, TAU); c.fill();
    c.fillStyle = B; c.beginPath(); c.ellipse(r * 0.42, -r * 0.5, r * 0.55, r * 0.48, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#ffe1a0'; c.beginPath(); c.moveTo(r * 0.1, -r * 0.85); c.lineTo(r * 0.0, -r * 1.2); c.lineTo(r * 0.3, -r * 0.92); c.fill(); c.beginPath(); c.moveTo(r * 0.45, -r * 0.95); c.lineTo(r * 0.5, -r * 1.28); c.lineTo(r * 0.68, -r * 0.92); c.fill();
    eye(r * 0.6, -r * 0.55, r * 0.17); c.fillStyle = '#7a1a10'; c.beginPath(); c.arc(r * 0.88, -r * 0.35, r * 0.05, 0, TAU); c.fill();
    c.fillStyle = D; for (const fx of [-0.3, 0.35]) { c.beginPath(); c.ellipse(r * fx, r * 0.68, r * 0.2, r * 0.13, 0, 0, TAU); c.fill(); }
  } else if (id === 'pup') {
    c.fillStyle = D; c.beginPath(); c.moveTo(-r * 0.6, r * 0.2); c.quadraticCurveTo(-r * 1.3, r * 0.1, -r * 1.25, -r * 0.45); c.quadraticCurveTo(-r * 0.95, -r * 0.1, -r * 0.5, -r * 0.1); c.fill(); c.stroke();
    c.fillStyle = B; c.beginPath(); c.ellipse(0, r * 0.12, r * 0.78, r * 0.62, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = L; c.beginPath(); c.ellipse(r * 0.15, r * 0.25, r * 0.45, r * 0.36, 0, 0, TAU); c.fill();
    c.fillStyle = B; c.beginPath(); c.arc(r * 0.38, -r * 0.45, r * 0.55, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = D; c.beginPath(); c.moveTo(r * 0.0, -r * 0.85); c.quadraticCurveTo(r * 0.2, -r * 1.45, r * 0.5, -r * 0.95); c.fill();
    c.fillStyle = L; c.beginPath(); c.ellipse(r * 0.72, -r * 0.3, r * 0.22, r * 0.17, 0, 0, TAU); c.fill(); eye(r * 0.48, -r * 0.58, r * 0.16);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(-r * 0.2, -r * 0.05, r * 0.08, 0, TAU); c.arc(-r * 0.35, r * 0.15, r * 0.06, 0, TAU); c.fill();
  } else if (id === 'kit') {
    c.fillStyle = D; c.beginPath(); c.ellipse(-r * 0.85, -r * 0.1, r * 0.55, r * 0.25, -0.7, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = B; c.beginPath(); c.ellipse(0, r * 0.12, r * 0.7, r * 0.6, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = L; c.beginPath(); c.ellipse(r * 0.12, r * 0.25, r * 0.4, r * 0.33, 0, 0, TAU); c.fill();
    c.fillStyle = B; c.beginPath(); c.arc(r * 0.35, -r * 0.45, r * 0.55, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = B; c.beginPath(); c.moveTo(r * 0.0, -r * 0.7); c.lineTo(r * 0.05, -r * 1.2); c.lineTo(r * 0.3, -r * 0.92); c.fill(); c.stroke();
    c.fillStyle = '#9be35a'; c.beginPath(); c.ellipse(r * 0.55, -r * 1.12, r * 0.18, r * 0.42, 0.7, 0, TAU); c.fill(); c.stroke(); c.strokeStyle = '#2c7a30'; c.beginPath(); c.moveTo(r * 0.4, -r * 0.92); c.lineTo(r * 0.72, -r * 1.3); c.stroke();
    eye(r * 0.52, -r * 0.5, r * 0.16); c.fillStyle = '#ff9ab0aa'; c.beginPath(); c.arc(r * 0.78, -r * 0.28, r * 0.09, 0, TAU); c.fill();
  } else if (id === 'turtle') {
    c.fillStyle = D; for (const lx of [-0.55, 0.45]) { c.beginPath(); c.ellipse(r * lx, r * 0.62, r * 0.24, r * 0.17, 0, 0, TAU); c.fill(); c.stroke(); }
    c.fillStyle = '#a59f95'; c.beginPath(); c.ellipse(r * 0.92, -r * 0.05, r * 0.36, r * 0.32, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = flash ? '#fff' : '#ffb03a'; c.beginPath(); c.moveTo(r * 0.95, -r * 0.18); c.lineTo(r * 1.18, -r * 0.12); c.lineTo(r * 0.95, -r * 0.05); c.fill();
    c.fillStyle = '#1b1b2a'; c.beginPath(); c.arc(r * 1.0, -r * 0.12, r * 0.06, 0, TAU); c.fill();
    c.fillStyle = B; c.beginPath(); c.ellipse(0, 0, r * 0.95, r * 0.72, 0, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = D; c.lineWidth = r * 0.06; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.22 - r * 0.1); c.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.62); c.stroke(); }
    c.fillStyle = L; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.lineTo(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.24 - r * 0.1); } c.fill();
    // back cannon
    c.fillStyle = flash ? '#fff' : '#4a4640'; c.fillRect(-r * 0.15, -r * 0.6, r * 0.75, r * 0.26); c.fillStyle = flash ? '#fff' : '#2e2b27'; c.beginPath(); c.arc(r * 0.62, -r * 0.47, r * 0.16, 0, TAU); c.fill();
    c.fillStyle = '#ff6a3a'; c.beginPath(); c.arc(r * 0.62, -r * 0.47, r * 0.07, 0, TAU); c.fill();
  } else if (id === 'fin') {
    c.fillStyle = D; c.beginPath(); c.moveTo(-r * 0.6, 0); c.lineTo(-r * 1.3, -r * 0.45); c.lineTo(-r * 1.15, 0); c.lineTo(-r * 1.3, r * 0.45); c.fill(); c.stroke();
    c.fillStyle = B; c.beginPath(); c.ellipse(0, 0, r * 0.9, r * 0.6, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = D; c.beginPath(); c.moveTo(-r * 0.3, -r * 0.5); c.quadraticCurveTo(-r * 0.1, -r * 1.2, r * 0.3, -r * 0.55); c.fill(); c.stroke();
    c.fillStyle = L; c.beginPath(); c.ellipse(r * 0.15, r * 0.22, r * 0.55, r * 0.28, 0, 0, TAU); c.fill(); eye(r * 0.45, -r * 0.15, r * 0.17);
    c.strokeStyle = '#17707e'; c.beginPath(); c.arc(r * 0.72, r * 0.08, r * 0.12, 0.2, 2.2); c.stroke();
  } else if (id === 'thorn') {
    c.fillStyle = D; for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.95 + i / 6 * Math.PI * 0.9; c.beginPath(); c.moveTo(Math.cos(a - 0.2) * r * 0.6, Math.sin(a - 0.2) * r * 0.6); c.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15); c.lineTo(Math.cos(a + 0.2) * r * 0.6, Math.sin(a + 0.2) * r * 0.6); c.fill(); }
    c.fillStyle = B; c.beginPath(); c.arc(0, 0, r * 0.78, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = L; c.beginPath(); c.ellipse(r * 0.15, r * 0.25, r * 0.42, r * 0.32, 0, 0, TAU); c.fill();
    eye(r * 0.2, -r * 0.2, r * 0.17); eye(r * 0.58, -r * 0.2, r * 0.14);
    c.strokeStyle = '#2a1a12'; c.beginPath(); c.moveTo(r * 0.1, -r * 0.45); c.lineTo(r * 0.35, -r * 0.38); c.moveTo(r * 0.5, -r * 0.4); c.lineTo(r * 0.72, -r * 0.47); c.stroke();
  }
  c.restore();
}
function drawPortrait(c, id, sz, clear = true) { if (clear) c.clearRect(0, 0, sz, sz); const sp = SPECIES[id]; drawCreature(c, id, sz * 0.52, sz * 0.58, sz * 0.32 / sp.r, 1, 0, false, false); }

function draw() {
  const p = S.player;
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = '#5a4128'; g.fillRect(0, 0, W, H);
  let camX = 0, camY = 0; if (p) { camX = p.x; camY = p.y; } else { camX = Math.sin(S.t * 0.2) * 120; camY = Math.cos(S.t * 0.17) * 80; }
  const sh = S.shake; g.setTransform(DPR * Z, 0, 0, DPR * Z, DPR * (W / 2 - camX * Z + rnd(-sh, sh)), DPR * (H / 2 - camY * Z + rnd(-sh, sh)));
  if (!arenaImg) buildArena(); g.drawImage(arenaImg, -R - 80, -R - 80);
  // pillars behind (top half)
  for (const pl of PILLARS) if (pl.y < 0) drawPillar(pl);
  // telegraphs (red warnings)
  for (const t of S.teles) {
    const k = clamp(t.f.stT / t.dur, 0, 1), pulse = 0.35 + 0.35 * Math.abs(Math.sin(S.t * 18));
    g.save();
    if (t.len) { g.translate(t.f.x, t.f.y); g.rotate(t.ang); g.fillStyle = `rgba(255,40,40,${0.18 + pulse * 0.3})`; g.fillRect(0, -t.w / 2, t.len, t.w); g.fillStyle = 'rgba(255,40,40,.55)'; g.fillRect(0, -t.w / 2, t.len * k, t.w); g.strokeStyle = '#ff2a2a'; g.lineWidth = 2; g.strokeRect(0, -t.w / 2, t.len, t.w); }
    else { g.translate(t.x, t.y); g.fillStyle = `rgba(255,40,40,${0.15 + pulse * 0.25})`; g.beginPath(); g.arc(0, 0, t.rad, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,40,40,.45)'; g.beginPath(); g.arc(0, 0, t.rad * k, 0, TAU); g.fill(); g.strokeStyle = '#ff2a2a'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, t.rad, 0, TAU); g.stroke(); }
    g.restore();
    g.font = '18px system-ui'; g.textAlign = 'center'; g.fillText('❗', t.f.x, t.f.y - t.f.r * 1.6);
  }
  // fx under
  for (const e of S.fx) if (e.dust) { const k = e.t / e.life; g.fillStyle = `rgba(216,189,138,${0.55 * (1 - k)})`; g.beginPath(); g.arc(e.x, e.y, e.r * (1 + k), 0, TAU); g.fill(); }
  // creatures sorted by y
  const bodies = [...S.foes, ...(p ? [p] : [])].sort((a, b) => a.y - b.y);
  for (const b of bodies) {
    if (!b.foe && b.iframe > 0 && b.roll > 0) { g.globalAlpha = 0.35; drawCreature(g, b.id, b.x - b.vx * 0.04, b.y - b.vy * 0.04, 1, b.face, S.t, false, false); g.globalAlpha = 1; }
    const blink = !b.foe && b.iframe > 0 && Math.floor(S.t * 30) % 2;
    if (blink) g.globalAlpha = 0.55;
    drawCreature(g, b.id, b.x, b.y, 1, b.face, b.walk, b.flash > 0, b.boss); g.globalAlpha = 1;
    if (b.foe) { const w = b.r * 2.2; g.fillStyle = '#000a'; g.fillRect(b.x - w / 2, b.y - b.r * 1.45, w, 6); g.fillStyle = '#ff4b3a'; g.fillRect(b.x - w / 2 + 1, b.y - b.r * 1.45 + 1, (w - 2) * b.hp / b.max, 4); g.font = '13px system-ui'; g.textAlign = 'center'; g.fillText(EL[b.el].ic, b.x - w / 2 - 9, b.y - b.r * 1.45 + 6); }
    else { g.strokeStyle = EL[b.el].col; g.lineWidth = 2.5; g.beginPath(); g.ellipse(b.x, b.y + b.r * 0.75, b.r * 1.1, b.r * 0.45, 0, 0, TAU); g.stroke(); }
  }
  for (const pl of PILLARS) if (pl.y >= 0) drawPillar(pl);
  // shots
  for (const s of S.shots) {
    const col = EL[s.el].col, glow = EL[s.el].glow;
    if (s.kind === 'stream') { const k = s.t / s.life; g.fillStyle = k < 0.4 ? glow : col; g.globalAlpha = 0.8 * (1 - k); g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill(); g.globalAlpha = 1; continue; }
    const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 1.8); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, glow); gr.addColorStop(0.7, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, s.r * 1.8, 0, TAU); g.fill();
  }
  // fx over
  for (const e of S.fx) {
    if (e.dust) continue; const k = e.t / e.life;
    if (e.ring) { g.strokeStyle = e.col; g.globalAlpha = 1 - k; g.lineWidth = 10 * (1 - k) + 2; g.beginPath(); g.arc(e.x, e.y, e.r * (0.3 + 0.7 * k), 0, TAU); g.stroke(); g.globalAlpha = 1; }
    else if (e.beam) { g.save(); g.translate(e.x, e.y); g.rotate(e.ang); g.globalAlpha = 1 - k; g.fillStyle = '#ffb347'; g.fillRect(0, -e.w / 2, e.len, e.w); g.fillStyle = '#fff'; g.fillRect(0, -e.w / 5, e.len, e.w / 2.5); g.restore(); g.globalAlpha = 1; }
    else if (e.claw) { g.save(); g.translate(e.x, e.y); g.rotate(e.ang); g.strokeStyle = '#fff'; g.globalAlpha = 1 - k; g.lineWidth = 4; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(-20, i * 10, e.r * 0.8, -0.7, 0.7); g.stroke(); } g.restore(); g.globalAlpha = 1; }
    else { g.fillStyle = e.col; g.globalAlpha = 1 - k; g.beginPath(); g.arc(e.x, e.y, e.r, 0, TAU); g.fill(); g.globalAlpha = 1; }
  }
  // damage numbers
  g.textAlign = 'center';
  for (const n of S.nums) { const k = n.t / 0.9, s = n.sc * (1 + Math.max(0, 0.25 - n.t) * 2); g.font = `800 ${Math.round(18 * s)}px system-ui`; g.globalAlpha = 1 - k * k; g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(n.txt, n.x, n.y); g.fillStyle = n.col; g.fillText(n.txt, n.x, n.y); g.globalAlpha = 1; }
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (S.flash > 0) { g.fillStyle = `rgba(255,60,40,${S.flash * 1.2})`; if (S.player && S.player.ult === 0 && S.stats.ults) g.fillStyle = `rgba(255,240,200,${S.flash})`; g.fillRect(0, 0, W, H); }
  if (S.mode === 'play' || S.mode === 'pause') hud();
}

// ---------- HUD (DOM, corners only) ----------
let padBtns = [];
function buildPad() {
  const p = S.player, grid = $('#grid'); grid.innerHTML = '';
  padBtns = MOVES[p.el].map((m, i) => { const b = document.createElement('button'); b.className = 'act'; b.dataset.mv = i; b.title = m.name + ' (' + 'JKUI'[i] + ')';
    b.innerHTML = `<span class="ic">${m.ic}</span><small>${m.name}</small>${m.cost ? `<span class="cost">⚡${m.cost}</span>` : ''}<i class="cd"></i><em></em>`; grid.appendChild(b); bindBtn(b, String(i)); return b; });
  $('#bUlt .ic').textContent = ULT[p.el].ic; $('#bUlt').title = ULT[p.el].name + ' (L)';
  drawPortrait($('#face').getContext('2d'), p.id, 96);
  $('#hud').classList.remove('hide'); joyHome();
}
let hudCache = {};
function setTxt(el, v) { if (hudCache[el.id || el.dataset.mv] !== v) { hudCache[el.id || el.dataset.mv] = v; el.textContent = v; } }
function hud() {
  const p = S.player; if (!p) return;
  $('.bar.hp i').style.transform = `scaleX(${p.hp / p.max})`; setTxt($('#hpT'), `${Math.ceil(p.hp)}/${p.max}`);
  $('.bar.en i').style.transform = `scaleX(${p.en / 100})`; setTxt($('#enT'), String(Math.floor(p.en)));
  $('.bar.ul i').style.transform = `scaleX(${p.ult / 100})`;
  setTxt($('#score'), pad6(S.score));
  MOVES[p.el].forEach((m, i) => { const b = padBtns[i], cd = p.cds[i]; b.querySelector('.cd').style.setProperty('--p', (cd / m.cd * 100).toFixed(1) + '%'); const t = cd > 0.35 ? cd.toFixed(1) + 's' : ''; const em = b.querySelector('em'); if (em.textContent !== t) em.textContent = t; b.classList.toggle('low', p.en < m.cost); });
  const dc = Math.max(0, p.dodgeCd); $('#bDodge .cd').style.setProperty('--p', (dc / 0.9 * 100).toFixed(1) + '%');
  $('#bUlt').style.setProperty('--u', p.ult.toFixed(1) + '%'); $('#bUlt').classList.toggle('ready', p.ult >= 100);
  // minimap
  const m = $('#mini').getContext('2d'), s = 120 / (R * 2.2); m.clearRect(0, 0, 120, 120); m.save(); m.translate(60, 60);
  m.fillStyle = '#e2c48c55'; m.strokeStyle = '#fff8'; m.lineWidth = 3; m.beginPath(); m.arc(0, 0, R * s, 0, TAU); m.fill(); m.stroke();
  for (const f of S.foes) { m.fillStyle = '#ff4b3a'; m.beginPath(); m.arc(f.x * s, f.y * s, f.boss ? 9 : 6, 0, TAU); m.fill(); }
  m.fillStyle = '#fff'; m.beginPath(); m.arc(p.x * s, p.y * s, 7, 0, TAU); m.fill(); m.fillStyle = EL[p.el].col; m.beginPath(); m.arc(p.x * s, p.y * s, 4.5, 0, TAU); m.fill(); m.restore();
}

// ---------- input: multi-touch (pointer events), keyboard ----------
function bindBtn(b, name) {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); audioOn(); b.classList.add('on'); input.queue.push(name); setTimeout(() => b.classList.remove('on'), 120); });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
bindBtn($('#bDodge'), 'dodge'); bindBtn($('#bUlt'), 'ult');
const joy = $('#joy'), base = $('#joyBase'), knob = $('#joyKnob'), lbl = $('#joyLbl'); let joyId = null, jcx = 0, jcy = 0;
function joyHome() { const r = joy.getBoundingClientRect(); if (!r.width) return; jcx = r.left + Math.min(110, r.width * 0.42); jcy = r.bottom - Math.min(100, r.height * 0.4); place(); }
function place() { const r = joy.getBoundingClientRect(); base.style.left = (jcx - r.left) + 'px'; base.style.top = (jcy - r.top) + 'px'; lbl.style.left = (jcx - r.left) + 'px'; lbl.style.top = (jcy - r.top) + 'px'; }
function joyMove(e) { const dx = e.clientX - jcx, dy = e.clientY - jcy, l = Math.hypot(dx, dy), m = 46, k = Math.min(1, l / m); input.jx = l ? dx / l * k : 0; input.jy = l ? dy / l * k : 0; knob.style.transform = `translate(${input.jx * m}px,${input.jy * m}px)`; }
joy.addEventListener('pointerdown', (e) => { e.preventDefault(); audioOn(); if (joyId !== null) return; joyId = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (_) {} jcx = e.clientX; jcy = e.clientY; place(); joyMove(e); });
joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
const joyUp = (e) => { if (e.pointerId !== joyId) return; joyId = null; input.jx = input.jy = 0; knob.style.transform = ''; joyHome(); };
joy.addEventListener('pointerup', joyUp); joy.addEventListener('pointercancel', joyUp);
const KEYMV = { KeyJ: '0', KeyK: '1', KeyU: '2', KeyI: '3', Space: 'dodge', KeyL: 'ult' };
addEventListener('keydown', (e) => {
  audioOn(); if (e.code === 'Escape') { togglePause(); return; }
  if (S.mode === 'play' && KEYMV[e.code] && !e.repeat) { input.queue.push(KEYMV[e.code]); e.preventDefault(); }
  if ((e.code === 'Enter' || e.code === 'Space') && S.mode === 'pick') { startRun(); e.preventDefault(); }
  input.keys[e.code] = true;
});
addEventListener('keyup', (e) => { input.keys[e.code] = false; });
addEventListener('blur', () => { input.keys = {}; });

// ---------- screens ----------
function showScr(id) { ['#pick', '#menu', '#end'].forEach((s) => $(s).classList.toggle('hide', s !== id)); if (id === '#pick' || id === '#end') $('#hud').classList.add('hide'); }
function togglePause() { if (S.mode === 'play') { S.mode = 'pause'; showScr('#menu'); } else if (S.mode === 'pause') { S.mode = 'play'; showScr(null); } }
function buildPick() {
  const cards = $('#cards'); cards.innerHTML = '';
  for (const id of STARTERS) { const sp = SPECIES[id], c = document.createElement('button'); c.className = 'card' + (unlocked(id) ? '' : ' lock') + (save.pick === id ? ' sel' : ''); c.dataset.id = id;
    c.innerHTML = `<canvas width="144" height="144"></canvas><b>${sp.name}</b><span class="el">${EL[sp.el].ic} ${MOVES[sp.el].map((m) => m.ic).join('')}</span>`;
    c.addEventListener('pointerdown', (e) => { e.preventDefault(); audioOn(); if (!unlocked(id)) { sfx('warn'); return; } save.pick = id; persist(); buildPick(); sfx('light'); });
    cards.appendChild(c); drawPortrait(c.querySelector('canvas').getContext('2d'), id, 144); }
}
const tap = (sel, fn) => $(sel).addEventListener('pointerdown', (e) => { e.preventDefault(); audioOn(); fn(); });
tap('#bGo', startRun); tap('#bMenu', togglePause); tap('#mResume', togglePause); tap('#mRestart', startRun);
tap('#mHome', () => { S.mode = 'pick'; S.player = null; S.foes = []; S.shots = []; S.teles = []; buildPick(); showScr('#pick'); });
tap('#mSound', () => { save.sound = !save.sound; persist(); $('#mSound').textContent = save.sound ? '🔊' : '🔇'; });
tap('#eAgain', startRun); tap('#eHome', () => { S.mode = 'pick'; S.player = null; S.foes = []; S.shots = []; buildPick(); showScr('#pick'); });
$('#mSound').textContent = save.sound ? '🔊' : '🔇';

// ---------- loop ----------
function resize() { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px'; Z = Math.min(Math.min(W, H) / 430, Math.max(W, H) / 820); joyHome(); }
addEventListener('resize', resize); resize();
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!window.__caHold) { acc += dt; while (acc >= 1 / 60) { acc -= 1 / 60; step(1 / 60); } }
  draw(); requestAnimationFrame(frame);
}
buildPick(); requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'play') togglePause(); });

// ---------- test hooks (harmless in play) ----------
window.__ca = { S, input, act, step, run: (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) step(1 / 60); draw(); }, start: (id) => { if (id) save.pick = id; startRun(); }, mult, WAVES, MOVES, save,
  icon: (sz) => { const c = document.createElement('canvas'); c.width = c.height = sz; const a = c.getContext('2d'); const gr = a.createRadialGradient(sz / 2, sz / 2, sz * 0.1, sz / 2, sz / 2, sz * 0.7); gr.addColorStop(0, '#f6dca8'); gr.addColorStop(1, '#b8874a'); a.fillStyle = gr; a.fillRect(0, 0, sz, sz); a.strokeStyle = '#fff8e4'; a.lineWidth = sz * 0.035; a.beginPath(); a.arc(sz / 2, sz / 2, sz * 0.36, 0, TAU); a.stroke(); drawCreature(a, 'drake', sz * 0.52, sz * 0.58, sz * 0.36 / 22, 1, 0, false, false); return c.toDataURL('image/png'); } };
