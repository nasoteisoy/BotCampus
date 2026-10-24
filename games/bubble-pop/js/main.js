// Bubble Pop: pop bubbles with hands & feet in the mirrored camera view (or tap them).
// v4: every kid becomes a cute octopus (chars.js) in their colour right over their body - its tentacles are the
// kid's arms & legs - with their score bubble above the head. 🧸 relaxed (default): no timer, no end storm, bigger
// bubbles that stay longer. Body-size pop pads (EASY_POP) make reaching easier for small kids.
import { run } from './runner.js?v=5';
import { drawChar, drawBadge, rigFromBody, rigFromDemo, badgeSpot } from './chars.js?v=4';
import { touchPoints } from './body.js';
import { drawSkeleton, drawVideo, emoji } from './draw.js';
import { drawDemo } from './demo.js';
import { PLAYER_COLORS } from './multi.js';
import { hitTest, highSpot, lowSpot, starsFor, POINTS, EASY_POP } from './logic.js?v=4';

const HUES = [195, 285, 330, 160, 45];
// pre-rendered bubble sprites (radial gradients are slow to redraw every frame on phones)
const SPR = new Map();
function sprite(hue, r, lw) {
  const R = Math.max(8, Math.ceil(r / 6) * 6), key = hue + ':' + R + ':' + lw;
  let cv = SPR.get(key);
  if (cv) return cv;
  if (SPR.size > 200) SPR.clear();
  const d = Math.min(2, window.devicePixelRatio || 1), size = Math.ceil((R + lw) * 2 * d);
  cv = document.createElement('canvas'); cv.width = cv.height = size; cv.R = R + lw;
  const c = cv.getContext('2d'); c.scale(d, d); const o = R + lw;
  const g = c.createRadialGradient(o - R * 0.35, o - R * 0.35, R * 0.1, o, o, R);
  g.addColorStop(0, `hsla(${hue},100%,95%,0.9)`); g.addColorStop(0.7, `hsla(${hue},90%,70%,0.35)`); g.addColorStop(1, `hsla(${hue},90%,60%,0.8)`);
  c.fillStyle = g; c.beginPath(); c.arc(o, o, R, 0, 7); c.fill();
  c.strokeStyle = `hsla(${hue},100%,85%,0.95)`; c.lineWidth = lw; c.stroke();
  c.fillStyle = '#ffffffcc'; c.beginPath(); c.ellipse(o - R * 0.38, o - R * 0.42, R * 0.22, R * 0.13, -0.6, 0, 7); c.fill();
  SPR.set(key, cv); return cv;
}
const B = {
  roundSec: 60,
  bubbles: [], fx: [], scores: [0, 0, 0, 0], pops: { float: 0, high: 0, low: 0 }, spawned: { float: 0, high: 0, low: 0 },
  spawnT: 0, specialT: 3, touches: [], prevPts: new Map(), players: [], taps: [], rng: Math.random, played: new Set([0]),
  map: null,
  // practice before a camera round: reach up, squat, kick (each turns ✅)
  practice: [{ move: 'reach', icon: '🙌⭐' }, { move: 'squat', icon: '⬇️' }, { move: 'kick', icon: '🦶🐸' }],
  _baseR(S) { const A = this.area(S); return (Math.min(A.w, A.h) * (S.input === 'cam' ? 0.085 : 0.075) + 14) * (S.relaxed ? EASY_POP.relaxSize : 1); },
  lastPop: [-9, -9, -9, -9],
  /** play area in px: with the camera = the part of the screen the (uncropped) video covers, so every
   *  bubble sits on the picture where a hand or foot can reach it; tap mode = the whole screen */
  area(S) { return S.input === 'cam' ? this.getMap(S).rect : { x: 0, y: 0, w: S.W, h: S.H }; },
  onZoom(S) { const A = this.area(S); for (const b of this.bubbles) { b.x = Math.max(A.x + b.r, Math.min(A.x + A.w - b.r, b.x)); if (b.kind !== 'float') b.y = Math.max(A.y + b.r, Math.min(A.y + A.h - b.r, b.y)); } },
  reset(S) {
    this.bubbles = []; this.fx = []; this.scores = [0, 0, 0, 0];
    this.pops = { float: 0, high: 0, low: 0 }; this.spawned = { float: 0, high: 0, low: 0 };
    this.spawnT = 0.2; this.specialT = 3; this.prevPts.clear(); this.camTouches = []; this.taps = []; this.played = new Set([0]);
    S.sound.music(false);
  },
  onPlay(S) { S.sound.music(true); const A = this.area(S); for (let i = 0; i < 4; i++) this.spawn(S, 'float', null, A.y + A.h * (0.45 + i * 0.12)); },
  resize(S) { this.map = null; },
  getMap(S) { return S.view(S.W, S.H); },
  onPose(players, t, S) {
    this.players = players;
    for (const p of players) if (p.body) this.played.add(p.slot);
    if (S.input === 'cam') this.computeCamTouches(S);
  },
  spawn(S, kind = 'float', at = null, y0 = null) {
    const r0 = this._baseR(S), rng = this.rng, A = this.area(S);
    const b = { kind, age: 0, wob: rng() * 6, hue: HUES[(rng() * HUES.length) | 0], r: r0 * (0.85 + rng() * 0.3), dead: false };
    if (kind === 'float') {
      b.x = at ? at.x : A.x + A.w * (0.1 + rng() * 0.8); b.y = y0 ?? A.y + A.h + b.r; b.vy = -(A.h * (0.09 + rng() * 0.07)); b.life = 99;
    } else {
      b.x = at ? at.x : A.x + A.w * (0.15 + rng() * 0.7);
      b.y = at ? at.y : kind === 'high' ? A.y + A.h * (0.14 + rng() * 0.08) : A.y + A.h * (0.84 + rng() * 0.06);
      b.vy = 0; b.life = S.relaxed ? EASY_POP.relaxLife : 6; b.r *= kind === 'high' ? 0.95 : 1.05;
      b.y = Math.max(A.y + b.r * 0.6, Math.min(A.y + A.h - b.r * 0.6, b.y));
    }
    b.x = Math.max(A.x + b.r, Math.min(A.x + A.w - b.r, b.x));
    b.vx = (rng() - 0.5) * 20;
    this.bubbles.push(b); this.spawned[kind]++;
    return b;
  },
  /** hands + feet of every tracked player in screen px, with speed; recomputed on every new pose frame */
  camTouches: [],
  computeCamTouches(S) {
    const out = [], map = this.getMap(S), seen = new Set();
    for (const p of this.players) {
      if (!p.body) continue;
      const pad = p.body.torso * map.dh * EASY_POP.padTorso; // bigger reach for every kid, scaled to their own size
      touchPoints(p.body).forEach((q, j) => {
        const key = p.id + ':' + j, x = map.x(q.x), y = map.y(q.y), prev = this.prevPts.get(key);
        seen.add(key);
        // only sweep from the previous point if it's recent and not a tracker jump
        const ok = prev && S.clock - prev.t < 0.2 && Math.hypot(prev.x - x, prev.y - y) < S.H * 0.35;
        const sp = ok ? Math.hypot(prev.x - x, prev.y - y) / Math.max(1 / 60, S.clock - prev.t) : 0;
        const speed = prev ? prev.speed * 0.4 + sp * 0.6 : 0; // light smoothing
        out.push({ x, y, px: ok ? prev.x : null, py: ok ? prev.y : null, slot: p.slot, kind: q.kind, speed, pad });
        this.prevPts.set(key, { x, y, t: S.clock, speed });
      });
    }
    for (const k of [...this.prevPts.keys()]) if (!seen.has(k) && S.clock - this.prevPts.get(k).t > 0.5) this.prevPts.delete(k);
    this.camTouches = out;
  },
  collectTouches(S) {
    const out = S.input === 'cam' ? this.camTouches.slice() : [];
    for (const t of this.taps) out.push({ x: t.x, y: t.y, slot: 0, kind: 'tap' });
    this.taps = [];
    return out;
  },
  update(dt, S) {
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.dur);
    if (S.mode !== 'play') { this.taps = []; return; }
    const n = Math.max(1, this.players.filter((p) => p.body).length);
    const storm = !S.relaxed && S.left < 10 ? 1.6 : 1;
    // spawn floaters
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1 / ((1.3 + 0.45 * (n - 1)) * storm) * (0.7 + this.rng() * 0.6); this.spawn(S, 'float'); }
    // special bubbles: reach-up ⭐ / squat-kick 🐸, placed for a real player's body when the camera sees them
    this.specialT -= dt;
    if (this.specialT <= 0) {
      this.specialT = 2.4 + this.rng() * 1.6;
      const kind = this.rng() < 0.5 ? 'high' : 'low';
      const live = this.players.filter((p) => p.body);
      let at = null;
      if (S.input === 'cam' && live.length) {
        const p = live[(this.rng() * live.length) | 0], map = this.getMap(S);
        at = kind === 'high' ? highSpot(p.body, map, map.rect) : lowSpot(p.body, map, map.rect);
        at.x += (this.rng() - 0.5) * p.body.sw * map.dw * 2.5;
      }
      if (this.bubbles.filter((b) => b.kind !== 'float').length < 3) this.spawn(S, kind, at);
    }
    // move (bubbles bounce inside the play area)
    const A = this.area(S);
    for (const b of this.bubbles) {
      b.age += dt; b.wob += dt * 2;
      b.y += b.vy * dt; b.x += (b.vx + Math.sin(b.wob) * 18) * dt;
      if (b.x < A.x + b.r) { b.x = A.x + b.r; b.vx = Math.abs(b.vx); } if (b.x > A.x + A.w - b.r) { b.x = A.x + A.w - b.r; b.vx = -Math.abs(b.vx); }
      if (b.kind !== 'float') { b.life -= dt; b.y += Math.sin(b.wob * 1.3) * 6 * dt; }
      if (b.y < A.y - b.r * 2 || b.life <= 0) { b.dead = true; b.gone = true; }
    }
    // pop
    const touches = (this.lastTouches = this.collectTouches(S));
    const hits = hitTest(this.bubbles, touches, Math.min(S.W, S.H) * EASY_POP.padMin, this.getMap(S).dh * EASY_POP.minSpeed);
    hits.forEach((h, j) => {
      const b = this.bubbles[h.i]; b.dead = true;
      const pts = POINTS[b.kind];
      this.scores[h.slot] += pts; this.pops[b.kind]++; this.played.add(h.slot); this.lastPop[h.slot] = S.clock;
      this.fx.push({ kind: 'pop', x: b.x, y: b.y, r: b.r, t: 0, dur: 0.45, col: (PLAYER_COLORS[h.slot] || PLAYER_COLORS[0]).css, pts });
      S.sound.pop(this.scores[h.slot] + j);
      if (b.kind !== 'float') S.sound.good();
    });
    this.bubbles = this.bubbles.filter((b) => !b.dead);
  },
  draw(c, W, H, S) {
    const map = this.getMap(S);
    if (S.cam.hasVideo) {
      drawVideo(c, S.cam.video, W, H, map);
      c.fillStyle = 'rgba(40,10,90,0.18)'; c.fillRect(0, 0, W, H);
    } else {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7fd3ff'); g.addColorStop(1, '#c7a6ff');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff22';
      for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(((i * 0.19 + S.clock * 0.01) % 1) * W, H * (0.2 + (i % 3) * 0.28), 60 + i * 12, 0, 7); c.fill(); }
    }
    // zone hints for special bubbles
    if (S.mode === 'play' || S.mode === 'count') {
      const A = this.area(S);
      c.globalAlpha = 0.18; c.fillStyle = '#ffe14a'; c.fillRect(A.x, A.y, A.w, A.h * 0.06);
      c.fillStyle = '#6fe07a'; c.fillRect(A.x, A.y + A.h * 0.96, A.w, A.h * 0.04); c.globalAlpha = 1;
    }
    // characters: each tracked kid is an octopus right over their body (new people waiting = faint skeleton)
    this.charsDrawn = 0;
    if (S.input === 'cam') {
      for (const q of S.cam.pending) drawSkeleton(c, q.body, map, '#ffffff', { width: 4, glow: 0, alpha: 0.5 });
      for (const p of this.players) {
        if (!p.body) continue;
        const R = rigFromBody(p.body, map), mood = S.clock - this.lastPop[p.slot] < 0.5 ? 'wow' : 'happy';
        drawChar(c, 'octo', R, p.color.css, { t: S.clock + p.slot, mood }); this.charsDrawn++;
        const bs = Math.max(34, R.T * 0.55), at = badgeSpot(R, bs);
        if (at && S.mode === 'play') drawBadge(c, at.x, at.y, this.scores[p.slot], p.color.css, bs);
      }
    } else if (S.mode === 'play' || S.mode === 'count') {
      // tap mode: a little octopus friend cheers in the corner
      const T = Math.min(W, H) * 0.09, mood = S.clock - this.lastPop[0] < 0.5 ? 'wow' : 'happy';
      drawChar(c, 'octo', rigFromDemo(mood === 'wow' ? 'reach' : 'dance', S.clock, W - T * 1.6, H - T * 0.3, T), PLAYER_COLORS[0].css, { t: S.clock, mood }); this.charsDrawn++;
    }
    // bubbles
    for (const b of this.bubbles) {
      const s = Math.min(1, b.age / 0.25), r = b.r * s;
      const blink = b.kind !== 'float' && b.life < 1.5 && Math.sin(b.life * 20) > 0;
      const hue = b.kind === 'high' ? 48 : b.kind === 'low' ? 120 : b.hue;
      const spr = sprite(hue, b.r, b.kind === 'float' ? 3 : 6);
      c.drawImage(spr, b.x - spr.R * s, b.y - spr.R * s, spr.R * 2 * s, spr.R * 2 * s);
      if (blink) { c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.arc(b.x, b.y, r, 0, 7); c.stroke(); }
      // live hint: a little stick figure next to each special bubble shows the move (reach up / kick-squat)
      const side = b.x > W / 2 ? -1 : 1;
      if (b.kind === 'high') { emoji(c, '⭐', b.x, b.y, r * 0.9); emoji(c, '🙌', b.x, b.y + r * 1.25, r * 0.5); drawDemo(c, 'reach', S.clock, b.x + side * r * 1.7, b.y + r * 0.4, r * 0.2, '#ffe14a'); }
      if (b.kind === 'low') { emoji(c, '🐸', b.x, b.y, r * 0.9); emoji(c, '🦶', b.x, b.y - r * 1.25, r * 0.5); drawDemo(c, 'kick', S.clock, b.x + side * r * 1.7, b.y - r * 0.1, r * 0.2, '#6fe07a'); }
    }
    // pop fx
    for (const f of this.fx) {
      const k = f.t / f.dur;
      c.globalAlpha = 1 - k; c.strokeStyle = f.col; c.lineWidth = 8 * (1 - k);
      c.beginPath(); c.arc(f.x, f.y, f.r * (1 + k * 0.8), 0, 7); c.stroke();
      c.fillStyle = f.col;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; c.beginPath(); c.arc(f.x + Math.cos(a) * f.r * (0.6 + k * 1.4), f.y + Math.sin(a) * f.r * (0.6 + k * 1.4), 6 * (1 - k) + 2, 0, 7); c.fill(); }
      c.font = `bold ${Math.round(f.r * 0.8)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 5; c.strokeStyle = '#fff'; c.strokeText('+' + f.pts, f.x, f.y - k * 40); c.fillText('+' + f.pts, f.x, f.y - k * 40);
      c.globalAlpha = 1;
    }
  },
  hud(S) {
    const slots = [...this.played].sort();
    return slots.map((s) => ({ slot: s, score: this.scores[s], icon: '🐙' }));
  },
  results(S) {
    const slots = [...this.played].sort(), n = slots.length;
    return slots.map((s) => ({ slot: s, score: this.scores[s], stars: starsFor(this.scores[s], n) }));
  },
  state(S) {
    return { kind: 'octo', chars: this.charsDrawn || 0, bubbles: this.bubbles.length, scores: this.scores.slice(), pops: { ...this.pops }, spawned: { ...this.spawned }, touches: (this.lastTouches || []).length };
  },
};

const app = run(B);
// tap / click / multi-touch pops (fallback, and also works alongside the camera)
document.getElementById('cv').addEventListener('pointerdown', (e) => {
  if (app.S.mode !== 'play') return;
  B.taps.push({ x: e.clientX, y: e.clientY });
});
Object.assign(window.__game, {
  bubbleList: () => B.bubbles.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.r), kind: b.kind, age: b.age })),
  spawn: (kind, x, y) => { const b = B.spawn(app.S, kind, x != null ? { x, y } : null); b.age = 1; if (kind === 'float' && y != null) b.y = y; b.vy = 0; b.vx = 0; return { x: b.x, y: b.y, r: b.r }; },
  clearBubbles: () => { B.bubbles = []; B.spawnT = 99; B.specialT = 99; },
  resumeSpawning: () => { B.spawnT = 0; B.specialT = 0; },
  tapAt: (x, y) => B.taps.push({ x, y }),
  camTouches: () => B.camTouches.map((t) => ({ x: Math.round(t.x), y: Math.round(t.y), slot: t.slot, kind: t.kind, speed: Math.round(t.speed) })),
});
