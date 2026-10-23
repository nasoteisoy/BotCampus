// Freeze Dance / Copy Me: dance while the music plays, freeze or copy the pose when it stops.
import { run } from './runner.js';
import { coverMap } from './body.js';
import { drawSkeleton, drawVideo, emoji, rrect } from './draw.js';
import { PLAYER_COLORS } from './multi.js';
import { MotionMeter, poseScore, POSES, MATCH, starsFor, makeScript } from './moves.js';
import { mulberry32 } from './rng.js';

const FREEZE_GRACE = 0.7, POSE_HOLD = 0.4, WOBBLE_OK = 0.45;
const F = {
  roundSec: 90, script: [], phase: null, pi: -1, P: new Map(), players: [], taps: 0, wiggle: 0, tapE: 0, choices: null,
  reset(S) {
    const seed = +(S.params.get('seed') || 0) || ((Math.random() * 1e9) | 0);
    this.seed = seed; this.rng = mulberry32(seed);
    this.script = makeScript(this.rng, this.roundSec); this.pi = -1; this.phase = null;
    this.P = new Map(); this.tapE = 0; this.choices = null;
    if (S.input === 'tap') this.pl(0);
    S.sound.music(false);
  },
  pl(slot) {
    if (!this.P.has(slot)) this.P.set(slot, { slot, meter: new MotionMeter(), energy: 0, score: 0, max: 0, danceT: 0, wobble: 0, matchT: 0, matched: false, ok: null, match: 0, seen: false, res: [] });
    return this.P.get(slot);
  },
  onPlay(S) { this.pi = -1; this.nextPhase(S, 0); },
  onPose(players, t, S) {
    this.players = players;
    if (S.input !== 'cam' || S.mode === 'title' || S.mode === 'end') return;
    for (const p of players) {
      if (p.slot < 0) continue;
      const q = this.pl(p.slot);
      q.energy = q.meter.update(p.body, t); q.seen = !!p.body; q.body = p.body;
      if (this.phase?.type === 'pose' && p.body) q.match = poseScore(p.body, this.phase.pose);
    }
  },
  elapsed(S) { return this.roundSec - S.left; },
  nextPhase(S, k) {
    // score the phase that just ended
    if (this.phase) for (const q of this.P.values()) this.scorePhase(q, this.phase, S);
    this.pi = k; this.phase = this.script[k] || null;
    if (!this.phase) return;
    const ph = this.phase;
    for (const q of this.P.values()) { q.danceT = 0; q.wobble = 0; q.matchT = 0; q.matched = false; q.ok = null; q.match = 0; q.picked = null; }
    if (ph.type === 'dance') { S.sound.music(true, true); S.sound.tempo = 112 + ((k * 7) % 30); }
    else { S.sound.music(false); S.sound.tone(300, 0.25, 0.3, 'sawtooth', 0, 0.3); }
    if (ph.type === 'pose') {
      // tap mode: three picture choices, one is right
      const names = Object.keys(POSES).filter((n) => n !== ph.pose);
      const wrong = names.sort(() => this.rng() - 0.5).slice(0, 2);
      this.choices = [ph.pose, ...wrong].sort(() => this.rng() - 0.5);
    } else this.choices = null;
  },
  scorePhase(q, ph, S) {
    if (S.input === 'cam' && !q.everSeen) return;
    let pts = 0;
    if (ph.type === 'dance') { const k = q.danceT / ph.dur; pts = k >= 0.7 ? 3 : k >= 0.45 ? 2 : k >= 0.2 ? 1 : 0; }
    // a freeze only counts if you were dancing before it (standing still all game earns nothing)
    else if (ph.type === 'freeze') pts = !q.lastDance ? 0 : q.wobble <= WOBBLE_OK ? 3 : q.wobble <= 1.2 ? 1 : 0;
    else if (ph.type === 'pose') pts = q.matched ? 3 : q.match > 0.6 ? 1 : 0;
    if (ph.type === 'dance') q.lastDance = pts;
    q.score += pts; q.max += 3; q.res.push({ type: ph.type, pts });
  },
  update(dt, S) {
    if (S.mode !== 'play' || !this.phase) return;
    const ph = this.phase, el = this.elapsed(S), inPh = el - ph.t;
    if (inPh >= ph.dur && this.pi + 1 < this.script.length) { this.nextPhase(S, this.pi + 1); return; }
    if (S.input === 'tap') {
      // tap energy: each tap adds a burst, decays fast
      this.tapE = this.tapE * Math.exp(-3.5 * dt) + this.taps * 0.6 + this.wiggle; this.taps = 0; this.wiggle = 0;
      const q = this.pl(0); q.energy = Math.min(3, this.tapE); q.seen = true;
    }
    for (const q of this.P.values()) {
      if (S.input === 'cam' && !q.seen) continue;
      q.everSeen = true;
      if (ph.type === 'dance') { if (q.energy > q.meter.o.danceOn) q.danceT += dt; }
      else if (ph.type === 'freeze') {
        if (inPh > FREEZE_GRACE && q.energy > q.meter.o.freezeMax) { q.wobble += dt; q.ok = false; }
        else if (inPh > FREEZE_GRACE) q.ok = q.wobble <= WOBBLE_OK;
      } else if (ph.type === 'pose' && S.input === 'cam') {
        if (q.match >= MATCH) { q.matchT += dt; if (q.matchT >= POSE_HOLD && !q.matched) { q.matched = true; q.ok = true; S.sound.good(); } }
        else q.matchT = Math.max(0, q.matchT - dt * 0.5);
      }
    }
  },
  /** tap mode: user picked a silhouette */
  pick(name, S) {
    if (S.mode !== 'play' || this.phase?.type !== 'pose') return;
    const q = this.pl(0); if (q.matched) return;
    if (name === this.phase.pose) { q.matched = true; q.ok = true; S.sound.good(); }
    else { q.ok = false; q.match = 0.7; S.sound.oops(); }
  },
  draw(c, W, H, S) {
    const f = S.cam.frameSize || { w: W, h: H }, map = coverMap(f.w, f.h, W, H);
    const ph = S.mode === 'play' ? this.phase : null;
    if (S.cam.hasVideo) { drawVideo(c, S.cam.video, W, H, map); c.fillStyle = ph && ph.type !== 'dance' ? 'rgba(80,160,255,0.28)' : 'rgba(120,20,140,0.18)'; c.fillRect(0, 0, W, H); }
    else {
      const dance = !ph || ph.type === 'dance';
      const g = c.createLinearGradient(0, 0, W, H);
      if (dance) { const hh = (S.clock * 40) % 360; g.addColorStop(0, `hsl(${hh},80%,55%)`); g.addColorStop(1, `hsl(${(hh + 80) % 360},80%,45%)`); }
      else { g.addColorStop(0, '#9fdcff'); g.addColorStop(1, '#4f7fe0'); }
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (dance) for (let i = 0; i < 10; i++) { c.fillStyle = `hsla(${i * 36},90%,70%,0.25)`; const r = 30 + 20 * Math.sin(S.clock * 4 + i); c.beginPath(); c.arc(((i * 0.13 + S.clock * 0.03) % 1) * W, H * (0.3 + 0.4 * ((i * 0.37) % 1)), r, 0, 7); c.fill(); }
    }
    // skeletons (glow green when doing it right, red when wobbling)
    if (S.input === 'cam') {
      for (const q of S.cam.pending) drawSkeleton(c, q.body, map, '#ffffff', { width: 4, glow: 0, alpha: 0.5 });
      for (const p of this.players) {
        if (!p.body) continue; const q = this.P.get(p.slot);
        const glowCol = q?.ok === true ? '#7dff8a' : q?.ok === false && ph && ph.type !== 'dance' ? '#ff4d6d' : p.color.css;
        drawSkeleton(c, p.body, map, p.color.css, { width: Math.max(6, W * 0.008), glow: q?.ok != null ? 34 : 18 });
        if (q?.ok != null && ph && ph.type !== 'dance') emoji(c, q.ok ? '✅' : '🫨', map.x(p.body.head.x), map.y(p.body.head.y) - 60, 44);
        if (glowCol !== p.color.css) { c.save(); c.globalAlpha = 0.35; drawSkeleton(c, p.body, map, glowCol, { width: Math.max(10, W * 0.014), glow: 30 }); c.restore(); }
      }
    }
    // banner
    if (ph) {
      const left = Math.max(0, ph.dur - (this.elapsed(S) - ph.t));
      const cy = Math.max(110, H * 0.2), sz = Math.min(W, H) * 0.16;
      if (ph.type === 'dance') {
        const b = 1 + Math.sin(S.clock * 10) * 0.08;
        emoji(c, '💃', W / 2 - sz * 0.9, cy, sz * b); emoji(c, '🎵', W / 2, cy - sz * 0.2, sz * 0.7 * b); emoji(c, '🕺', W / 2 + sz * 0.9, cy, sz * (2 - b));
      } else if (ph.type === 'freeze') {
        emoji(c, '🧊', W / 2, cy, sz * 1.2);
        this.ring(c, W / 2, cy, sz * 0.85, left / ph.dur, '#bfe9ff');
      } else {
        const R = sz * 1.1;
        c.fillStyle = '#ffffffd9'; c.beginPath(); c.arc(W / 2, cy + sz * 0.15, R, 0, 7); c.fill();
        this.ring(c, W / 2, cy + sz * 0.15, R, left / ph.dur, '#ffb13b');
        drawPose(c, ph.pose, W / 2, cy + sz * 0.2, R * 1.5, '#3a2a7a');
      }
    }
    // tap-mode choice buttons
    this.btns = [];
    if (ph && S.input === 'tap') {
      if (ph.type === 'pose' && this.choices) {
        const n = this.choices.length, s = Math.min(130, (W - 40) / n - 12), y = H - s - 30;
        this.choices.forEach((name, i) => {
          const x = W / 2 - (n * (s + 12) - 12) / 2 + i * (s + 12), q = this.pl(0);
          c.fillStyle = q.matched && name === ph.pose ? '#7dff8a' : '#ffffffe6'; rrect(c, x, y, s, s, 24); c.fill();
          drawPose(c, name, x + s / 2, y + s / 2, s * 0.85, '#3a2a7a');
          this.btns.push({ name, x, y, w: s, h: s });
        });
      } else if (ph.type === 'dance') {
        emoji(c, '👆', W / 2, H - 120 + Math.sin(S.clock * 12) * 10, 70);
      } else emoji(c, '🤚', W / 2, H - 120, 70);
    }
    // energy meters, one per player
    const qs = [...this.P.values()].filter((q) => S.input === 'tap' || q.seen || q.everSeen);
    const bw = 22, bh = Math.min(200, H * 0.3);
    qs.forEach((q, i) => {
      const x = 14 + i * (bw + 12), y = H - bh - 16, col = (PLAYER_COLORS[q.slot] || PLAYER_COLORS[0]).css;
      c.fillStyle = '#0006'; rrect(c, x, y, bw, bh, 11); c.fill();
      const k = Math.min(1, q.energy / 2);
      c.fillStyle = col; rrect(c, x, y + bh * (1 - k), bw, bh * k, 11); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 3; rrect(c, x, y, bw, bh, 11); c.stroke();
      const lineY = (e) => y + bh * (1 - Math.min(1, e / 2));
      c.fillStyle = '#fff'; c.fillRect(x - 4, lineY(q.meter.o.danceOn), bw + 8, 3);
    });
  },
  ring(c, x, y, r, k, col) { c.lineWidth = 10; c.strokeStyle = col; c.lineCap = 'round'; c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + 6.283 * k); c.stroke(); },
  hud(S) { return [...this.P.values()].filter((q) => S.input === 'tap' || q.everSeen || q.seen).map((q) => ({ slot: q.slot, score: q.score, icon: '⭐' })); },
  results(S) {
    if (this.phase) { for (const q of this.P.values()) this.scorePhase(q, this.phase, S); this.phase = null; }
    return [...this.P.values()].filter((q) => S.input === 'tap' || q.everSeen).map((q) => ({ slot: q.slot, score: q.score, stars: starsFor(q.score, q.max) }));
  },
  state(S) {
    const ph = this.phase;
    return { phase: ph ? ph.type : null, pose: ph?.pose || null, pi: this.pi, phases: this.script.length, choices: this.choices,
      players: [...this.P.values()].map((q) => ({ slot: q.slot, score: q.score, max: q.max, energy: +q.energy.toFixed(2), danceT: +q.danceT.toFixed(2), wobble: +q.wobble.toFixed(2), matched: q.matched, match: +q.match.toFixed(2), res: q.res.slice() })) };
  },
};

/** stick-figure silhouette of a target pose */
export function drawPose(c, name, x, y, size, col) {
  const u = size / 4;
  const A = { star: [[-1.5, -1.1], [1.5, -1.1]], up: [[-0.5, -2.1], [0.5, -2.1]], tpose: [[-1.7, -0.6], [1.7, -0.6]], oneleg: [[-1.3, -0.2], [1.3, -0.2]] }[name];
  const Lg = { star: [[-1.1, 1.9], [1.1, 1.9]], up: [[-0.35, 1.9], [0.35, 1.9]], tpose: [[-0.35, 1.9], [0.35, 1.9]], oneleg: [[-0.2, 1.9], [0.8, 0.9]] }[name];
  c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = u * 0.42;
  const sh = [0, -0.6], hip = [0, 0.6];
  c.beginPath(); c.moveTo(sh[0] * u, sh[1] * u); c.lineTo(hip[0] * u, hip[1] * u);
  for (const a of A) { c.moveTo(sh[0] * u, sh[1] * u); c.lineTo(a[0] * u, a[1] * u); }
  for (const l of Lg) { c.moveTo(hip[0] * u, hip[1] * u); c.lineTo(l[0] * u, l[1] * u); }
  c.stroke();
  c.beginPath(); c.arc(0, -1.15 * u, u * 0.45, 0, 7); c.fill();
  c.restore();
}

const app = run(F);
const S = app.S;
const cv = document.getElementById('cv');
cv.addEventListener('pointerdown', (e) => {
  if (S.mode !== 'play' || S.input !== 'tap') return;
  const b = (F.btns || []).find((b) => e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h);
  if (b) return F.pick(b.name, S);
  F.taps++;
});
// wiggling a finger / the mouse also counts as dancing in tap mode
let lastMove = null;
cv.addEventListener('pointermove', (e) => {
  if (S.mode !== 'play' || S.input !== 'tap') return;
  if (lastMove && (e.buttons || e.pointerType !== 'mouse')) F.wiggle += Math.min(0.3, Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / 400);
  lastMove = { x: e.clientX, y: e.clientY };
});
window.addEventListener('keydown', (e) => { if (S.mode === 'play' && S.input === 'tap' && !e.repeat && e.key !== 'm' && e.key !== 'M') { F.taps++; const k = '1234'.indexOf(e.key); if (k >= 0 && F.choices) F.pick(F.choices[k], S); } });
Object.assign(window.__game, {
  tap: (n = 1) => { F.taps += n; },
  pick: (name) => F.pick(name, S),
  choiceButtons: () => (F.btns || []).map((b) => ({ name: b.name, x: b.x + b.w / 2, y: b.y + b.h / 2 })),
  script: () => F.script.map((p) => ({ type: p.type, t: +p.t.toFixed(2), dur: +p.dur.toFixed(2), pose: p.pose })),
  jumpToPhase(type) { const k = F.script.findIndex((p, i) => i > F.pi && p.type === type); if (k < 0) return false; S.left = F.roundSec - F.script[k].t; F.nextPhase(S, k); return true; },
});
