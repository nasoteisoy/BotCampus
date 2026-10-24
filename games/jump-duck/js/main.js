// Jump & Duck: a 3-lane runner per player. Jump over logs, duck under bars, lean/step to dodge rocks.
// v4: every kid is a bunny (chars.js) in their colour that copies their arms / squat live; 🧸 relaxed (default) =
// no timer, endless course, a missed obstacle just makes the bunny hop over it (no bump, no 💥); ⏱️ = v3 rules.
import { run } from './runner.js?v=5';
import { drawChar, rigFromBody, fitRig, rigFromDemo, rigOk } from './chars.js?v=4';
import { drawSkeleton, drawVideo, emoji, rrect } from './draw.js';
import { drawDemo } from './demo.js';
import { viewMap } from './view.js';
import { PLAYER_COLORS, layoutViewports, screenOrder } from './multi.js';
import { MoveDetector, makeCourse, collides, starsFor } from './moves.js?v=4';

const ANIMALS = ['🐰', '🐰', '🐰', '🐰']; // every kid is a bunny; the colour says who is who
// late grace (s) [v3 0.22], seconds airborne [0.75], tap-duck time, bump stun (challenge only), meters visible
export const GRACE = 0.4, AIR = 0.85, DUCK_TAP = 0.85, BUMP = 0.9, VIEW = 42;
export const RELAX_SPEED = 5; // m/s in 🧸 relaxed (challenge: 6 -> 8.2 over the round)
const J = {
  // practice before a camera round: jump, squat (duck), lean / step sideways
  practice: [{ move: 'jump', icon: '⬆️🪵', hold: 0.05 }, { move: 'squat', icon: '⬇️🚧' }, { move: 'lean', icon: '⬅️🪨➡️' }],
  roundSec: 75, runners: [], course: [], rows: [], fx: [], nextRow: 0, d: 0, speed: 6, seed: 1, layout: null, order: [], cal: new Map(),
  reset(S) {
    this.seed = +(S.params.get('seed') || 0) || ((Math.random() * 1e9) | 0);
    this.course = makeCourse(this.seed, 700, { start: 22, gap: 12 });
    // group by distance -> rows (one decision each)
    const m = new Map();
    for (const o of this.course) { if (!m.has(o.d)) m.set(o.d, []); m.get(o.d).push(o); }
    this.rows = [...m.entries()].map(([d, list]) => ({ d, list })).sort((a, b) => a.d - b.d);
    this.d = 0; this.speed = 6; this.nextRow = 0; this.runners = []; this.fx = []; this.ext = 0;
    if (S.input === 'tap') for (let i = 0; i < S.nTap; i++) this.addRunner(i, true);
    else { this.cal.clear(); for (const p of S.cam.players) if (p.slot >= 0) this.addRunner(p.slot, false); }
    S.sound.music(false);
  },
  addRunner(slot, calibrated) {
    if (this.runners.find((r) => r.slot === slot)) return;
    this.runners.push({ slot, lane: 0, x: 0, air: 0, duck: false, duckT: 0, bump: 0, score: 0, max: 0, cleared: 0, hits: 0, coins: [],
      det: new MoveDetector(), calibrated, last: { jump: false }, flash: null, x0: 0, pending: [], jumps: 0, ducks: 0, laneMoves: 0 });
    this.runners.sort((a, b) => a.slot - b.slot);
  },
  runner(slot) { return this.runners.find((r) => r.slot === slot); },
  onPlay(S) { S.sound.music(true); },
  ready(S) {
    if (S.input !== 'cam') return true;
    const live = this.runners.filter((r) => S.cam.players.find((p) => p.slot === r.slot && p.body));
    return live.length > 0 && live.every((r) => r.calibrated);
  },
  countMsg(S) {
    if (S.input !== 'cam') return '';
    if (!this.runners.length) return '🙈 ➡️ 🧍';
    const waiting = this.runners.filter((r) => !r.calibrated);
    return waiting.length ? '🧍 ' + waiting.map((r) => PLAYER_COLORS[r.slot].dot).join('') + ' ✋⏳' : '✅';
  },
  onPose(players, t, S) {
    if (S.input !== 'cam' || S.mode === 'title' || S.mode === 'end') return;
    for (const p of players) {
      if (p.slot < 0) continue;
      if (!this.runner(p.slot)) this.addRunner(p.slot, false);
      const r = this.runner(p.slot);
      const out = r.det.update(p.body, t);
      r.calibrated = out.calibrated; r.calibP = r.det.calibProgress; r.seen = !!p.body;
      if (!out.calibrated || S.mode !== 'play') continue;
      if (out.jump) this.jump(r, S);
      if (out.duck !== r.duck) { r.duck = out.duck; if (r.duck) { r.ducks++; S.sound.whoosh(); } }
      if (out.lane !== r.lane) { r.lane = out.lane; r.laneMoves++; }
      r.sig = out;
    }
  },
  jump(r, S) { if (r.air > 0.15) return; r.air = AIR; r.jumps++; r.duck = false; r.duckT = 0; S.sound.jump(); },
  tapDuck(r, S) { if (r.air > 0) return; r.duck = true; r.duckT = DUCK_TAP; r.ducks++; S.sound.whoosh(); },
  tapLane(r, dir, S) { const n = Math.max(-1, Math.min(1, r.lane + dir)); if (n !== r.lane) { r.lane = n; r.laneMoves++; S.sound.whoosh(); } },
  update(dt, S) {
    for (const r of this.runners) r.x += (r.lane - r.x) * Math.min(1, dt * 12);
    for (const f of this.fx) f.t += dt; this.fx = this.fx.filter((f) => f.t < 0.8);
    if (S.mode !== 'play') return;
    const prog = Math.min(1, S.playT / this.roundSec);
    this.speed = S.relaxed ? RELAX_SPEED : 6 + prog * 2.2;
    if (this.rows.length - this.nextRow < 6) this.extend(); // relaxed rounds never run out of track
    this.d += this.speed * dt;
    for (const r of this.runners) {
      if (r.air > 0) r.air = Math.max(0, r.air - dt);
      if (r.duckT > 0) { r.duckT -= dt; if (r.duckT <= 0) r.duck = false; }
      if (r.bump > 0) r.bump -= dt;
    }
    // resolve rows the runners just reached
    while (this.nextRow < this.rows.length && this.rows[this.nextRow].d <= this.d) {
      const row = this.rows[this.nextRow++];
      for (const r of this.runners) {
        if (S.input === 'cam' && !r.calibrated) continue; // still calibrating: no score, no bumps
        const obstacles = row.list.filter((o) => o.type !== 'star');
        const star = row.list.find((o) => o.type === 'star');
        if (obstacles.length) { r.max++; r.pending.push({ obstacles, until: S.clock + GRACE }); }
        if (star) { r.max++; r.coins.push({ lane: star.lane, until: S.clock + GRACE }); }
      }
    }
    // kid-friendly timing: an obstacle that would hit waits GRACE s for a late jump / duck / lean
    for (const r of this.runners) {
      // stars get the same late window, so a slightly late lean still grabs the coin
      r.coins = r.coins.filter((st) => {
        if (st.lane === r.lane || Math.abs(st.lane - r.x) < 0.5) { r.score++; S.sound.coin(); this.fx.push({ slot: r.slot, t: 0 }); return false; }
        return S.clock < st.until;
      });
      r.pending = r.pending.filter((pe) => {
        const st = { lane: r.lane, air: r.air > 0.05, duck: r.duck };
        const hit = pe.obstacles.some((o) => collides(o, st));
        if (!hit || r.bump > 0) { if (r.bump <= 0) { r.score++; r.cleared++; r.flash = { t: S.clock, ok: true }; S.sound.good(); } return false; }
        if (S.clock >= pe.until) {
          // 🧸 relaxed: no losing - the bunny hops over by itself (no points, no bump); ⏱️ challenge: bump + stun
          if (S.relaxed) { r.air = Math.max(r.air, AIR * 0.6); r.autoHops = (r.autoHops || 0) + 1; r.flash = { t: S.clock, ok: null }; S.sound.whoosh(); return false; }
          r.hits++; r.bump = BUMP; S.sound.bump(); r.flash = { t: S.clock, ok: false, type: pe.obstacles[0].type }; return false;
        }
        return true;
      });
    }
  },
  draw(c, W, H, S) {
    const rs = this.runners.length ? this.runners : [{ slot: 0, x: 0, lane: 0, air: 0, duck: false, placeholder: true }];
    const ord = screenOrder(rs.map((r) => ({ ...r, x: S.input === 'cam' ? (S.cam.players.find((p) => p.slot === r.slot)?.x ?? r.slot) : r.slot }))).map((q) => rs.find((r) => r.slot === q.slot));
    const L = (this.layout = layoutViewports(ord.length, W, H, 6));
    c.fillStyle = '#1d1640'; c.fillRect(0, 0, W, H);
    ord.forEach((r, i) => { r.view = L.views[i]; this.drawLane(c, r, L.views[i], S); });
    if (L.extra) { c.fillStyle = '#2b2260'; c.fillRect(L.extra.x, L.extra.y, L.extra.w, L.extra.h); emoji(c, '🏃', L.extra.x + L.extra.w / 2, L.extra.y + L.extra.h / 2, Math.min(L.extra.w, L.extra.h) * 0.4); }
    if (S.input === 'cam') this.drawPip(c, W, H, S);
  },
  drawLane(c, r, v, S) {
    const col = PLAYER_COLORS[r.slot] || PLAYER_COLORS[0];
    c.save(); c.beginPath(); c.rect(v.x, v.y, v.w, v.h); c.clip(); c.translate(v.x, v.y);
    const w = v.w, h = v.h, hy = h * 0.34, cx = w / 2;
    // sky + hills
    const g = c.createLinearGradient(0, 0, 0, hy); g.addColorStop(0, '#6ec8ff'); g.addColorStop(1, '#d6f2ff');
    c.fillStyle = g; c.fillRect(0, 0, w, hy);
    c.fillStyle = '#7ad36b'; c.fillRect(0, hy, w, h - hy);
    c.fillStyle = '#5fbf57'; c.beginPath(); c.ellipse(w * 0.2, hy, w * 0.35, h * 0.08, 0, Math.PI, 0); c.ellipse(w * 0.8, hy, w * 0.4, h * 0.1, 0, Math.PI, 0); c.fill();
    // projection: z meters ahead -> screen y, scale
    const F = 4.5, ZC = 3;
    const sc = (z) => F / (z + ZC);
    const Y = (z) => hy + (h - hy) * sc(z) / sc(0) * 0.92;
    const half = w * 0.34;
    const X = (lane, z) => cx + lane * half * 0.66 * sc(z) / sc(0);
    // road
    c.fillStyle = '#c9a36b';
    c.beginPath(); c.moveTo(cx - half * sc(VIEW) / sc(0), Y(VIEW)); c.lineTo(cx + half * sc(VIEW) / sc(0), Y(VIEW)); c.lineTo(cx + half * 1.15, h); c.lineTo(cx - half * 1.15, h); c.fill();
    c.strokeStyle = '#ffffffaa'; c.lineWidth = 3; c.setLineDash([14, 16]); c.lineDashOffset = (this.d * 30) % 30;
    for (const s of [-0.5, 0.5]) { c.beginPath(); c.moveTo(X(s, VIEW), Y(VIEW)); c.lineTo(X(s * 1.08, -1.2), h); c.stroke(); }
    c.setLineDash([]);
    // side trees
    for (let k = 0; k < 8; k++) {
      const z = ((k * 6 - this.d) % 48 + 48) % 48;
      const s = sc(z) / sc(0), y = Y(z);
      emoji(c, k % 2 ? '🌳' : '🌲', cx - half * s * 1.5 - 20 * s, y - 30 * s, 70 * s);
      emoji(c, k % 3 ? '🌲' : '🌻', cx + half * s * 1.5 + 20 * s, y - 30 * s, 70 * s);
    }
    // obstacles, far to near
    const vis = this.course.filter((o) => o.d - this.d > -1 && o.d - this.d < VIEW).sort((a, b) => b.d - a.d);
    for (const o of vis) {
      const z = o.d - this.d, s = sc(z) / sc(0), y = Y(z), u = w * 0.11 * s;
      if (o.type === 'log') {
        c.fillStyle = '#8b5a2b'; rrect(c, cx - half * s * 1.05, y - u * 0.9, half * s * 2.1, u * 0.9, u * 0.45); c.fill();
        c.fillStyle = '#c48a4a'; c.beginPath(); c.ellipse(cx - half * s * 1.05, y - u * 0.45, u * 0.3, u * 0.45, 0, 0, 7); c.ellipse(cx + half * s * 1.05, y - u * 0.45, u * 0.3, u * 0.45, 0, 0, 7); c.fill();
        if (z > 4) emoji(c, '⬆️', cx, y - u * 2, u * 1.1);
      } else if (o.type === 'bar') {
        const top = y - u * 3.2;
        c.fillStyle = '#555'; c.fillRect(cx - half * s * 1.08, top, u * 0.25, y - top); c.fillRect(cx + half * s * 1.08 - u * 0.25, top, u * 0.25, y - top);
        for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#fff' : '#ff3b5c'; c.fillRect(cx - half * s * 1.08 + (k * half * s * 2.16) / 8, top, half * s * 2.16 / 8 + 1, u * 0.6); }
        if (z > 4) emoji(c, '⬇️', cx, top - u * 0.8, u * 1.1);
      } else if (o.type === 'rock') {
        emoji(c, '🪨', X(o.lane, z), y - u * 0.8, u * 2.2);
      } else if (o.type === 'star') {
        emoji(c, '⭐', X(o.lane, z), y - u * 1.6 - Math.sin(this.d + o.d) * u * 0.2, u * 1.6);
      }
    }
    // live hint: the next obstacle coming up for this runner -> a looping stick figure doing the move
    if (S.mode === 'play' || S.mode === 'count') this.drawHint(c, r, w, hy, S);
    // runner
    const u0 = Math.min(w * 0.11, h * 0.12), ry = Y(0);
    const jumpH = r.air > 0 ? Math.sin((1 - r.air / AIR) * Math.PI) * h * 0.22 : 0;
    const rx = cx + r.x * half * 0.66;
    c.fillStyle = '#0003'; c.beginPath(); c.ellipse(rx, ry, u0 * 0.7 * (1 - jumpH / h), u0 * 0.2, 0, 0, 7); c.fill();
    c.save(); c.translate(rx, ry - jumpH);
    if (r.duck) c.scale(1.12, 0.78);
    if (r.bump > 0 && Math.sin(S.clock * 30) > 0) c.globalAlpha = 0.4;
    // the kid's bunny (copies their arms / squat when the camera sees them), drawn in their colour
    drawChar(c, 'bunny', this.rigFor(r, S, u0 * 0.8), col.css, { t: S.clock, mood: r.bump > 0 ? 'oops' : r.flash?.ok && S.clock - r.flash.t < 0.5 ? 'wow' : 'happy' });
    c.restore();
    // feedback
    if (r.flash && S.clock - r.flash.t < 0.7) emoji(c, r.flash.ok ? '👍' : r.flash.ok === null ? '🌈' : '💥', rx + u0 * 1.6, ry - u0 * 3.2 - jumpH, u0 * 0.9);
    for (const f of this.fx) if (f.slot === r.slot) emoji(c, '✨', rx, ry - u0 * 2.8 - f.t * 60, u0 * (1 - f.t));
    // lane score badge
    if (this.runners.length > 1) {
      const by = v.y < 40 ? 74 : 10;
      c.fillStyle = col.css; rrect(c, 10, by, 100, 44, 22); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
      emoji(c, ANIMALS[r.slot % 4], 34, by + 22, 26);
      c.fillStyle = '#fff'; c.font = 'bold 26px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(r.score || 0), 76, by + 23);
    }
    // calibration overlay
    if (S.input === 'cam' && !r.placeholder && !r.calibrated) {
      c.fillStyle = '#000a'; c.fillRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.18;
      c.lineWidth = 12; c.strokeStyle = '#ffffff44'; c.beginPath(); c.arc(cx, h / 2, R, 0, 7); c.stroke();
      c.strokeStyle = col.css; c.beginPath(); c.arc(cx, h / 2, R, -Math.PI / 2, -Math.PI / 2 + 6.283 * (r.calibP || 0)); c.stroke();
      emoji(c, r.seen === false ? '🙈' : '🧍', cx, h / 2, R * 1.1);
    }
    if (r.placeholder && S.input === 'cam') { c.fillStyle = '#0008'; c.fillRect(0, 0, w, h); emoji(c, '🙈', cx, h / 2, Math.min(w, h) * 0.25); }
    // tap-mode buttons
    if (S.input === 'tap' && !r.placeholder) {
      r.btns = this.buttons(w, h).map((b) => ({ ...b, x: b.x + v.x, y: b.y + v.y }));
      for (const b of this.buttons(w, h)) { c.fillStyle = '#ffffffd9'; rrect(c, b.x, b.y, b.w, b.h, 16); c.fill(); emoji(c, b.icon, b.x + b.w / 2, b.y + b.h / 2, b.h * 0.6); }
    }
    c.restore();
  },
  /** append more (seeded) track after the last row */
  extend() {
    const last = this.rows.length ? this.rows[this.rows.length - 1].d : 0;
    const more = makeCourse(this.seed + 7919 * ++this.ext, 400, { start: 12, gap: 12 }).map((o) => ({ ...o, d: o.d + last }));
    this.course.push(...more);
    const m = new Map(); for (const o of more) { if (!m.has(o.d)) m.set(o.d, []); m.get(o.d).push(o); }
    this.rows.push(...[...m.entries()].map(([d, list]) => ({ d, list })).sort((a, b) => a.d - b.d));
    this.course = this.course.filter((o) => o.d > this.d - 5);
  },
  /** the bunny's pose: the kid's own body (camera; normalized -> 1000 px units, rigFromBody has a 6 px floor) or a canned move (tap / not seen) */
  rigFor(r, S, T) {
    const p = S.input === 'cam' ? S.cam.players.find((q) => q.slot === r.slot && q.body) : null;
    if (p) { const b = p.body, raw = rigFromBody(b, { x: (v) => v * (b.ar || 1) * 1000, y: (v) => v * 1000, dh: 1000 }); const R = fitRig(raw, 0, 0, T); if (rigOk(R)) return R; }
    if (r.duck) return rigFromDemo('squat', 0.83, 0, 0, T);
    if (r.air > 0) return rigFromDemo('reach', 0.83, 0, 0, T);
    const R = rigFromDemo('none', 0, 0, 0, T), sw = Math.sin(S.clock * 9) * T * 0.25; // little run: arms + feet swing
    R.armL[2].y -= sw; R.armR[2].y += sw; R.legL[2].y -= Math.max(0, sw) * 0.5; R.legR[2].y -= Math.max(0, -sw) * 0.5;
    return R;
  },
  /** what this runner should do for the next row (pure-ish, used by the hint + tests) */
  nextHint(r) {
    for (const row of this.rows) {
      const z = row.d - this.d; if (z < 0.5) continue; if (z > 16) break;
      const obs = row.list.filter((o) => o.type !== 'star');
      if (obs.some((o) => o.type === 'log')) return { move: 'jump', icon: '⬆️', z };
      if (obs.some((o) => o.type === 'bar')) return { move: 'squat', icon: '⬇️', z };
      const rock = obs.find((o) => o.type === 'rock' && o.lane === r.lane);
      if (rock) { const free = [-1, 0, 1].filter((l) => !obs.some((o) => o.lane === l)); const to = free.sort((a, b) => Math.abs(a - r.lane) - Math.abs(b - r.lane))[0] ?? 0; return { move: 'lean', icon: to < r.lane ? '⬅️' : '➡️', z }; }
      if (obs.length) continue;
    }
    return null;
  },
  drawHint(c, r, w, hy, S) {
    const hint = this.nextHint(r); if (!hint) return;
    const bh = Math.min(hy * 0.82, 120), bw = bh * 1.7, x = w / 2 - bw / 2, y = Math.max(hy * 0.08, (S.input === 'tap' ? 0 : 0) + (this.runners.length > 1 ? 4 : 66));
    if (y + bh > hy + bh * 0.4) return;
    const urgent = hint.z < 7;
    c.globalAlpha = urgent ? 1 : 0.75;
    c.fillStyle = urgent ? '#ffe14aee' : '#ffffffcc'; rrect(c, x, y, bw, bh, bh * 0.25); c.fill();
    drawDemo(c, hint.move, S.clock * 1.4, x + bw * 0.32, y + bh * 0.62, bh / 5.8, '#222', { glow: false });
    emoji(c, hint.icon, x + bw * 0.74, y + bh / 2, bh * 0.5);
    c.globalAlpha = 1;
  },
  buttons(w, h) {
    const s = Math.min(70, w * 0.2, h * 0.16), y = h - s - 10, gap = 8;
    const left = [{ a: 'L', icon: '⬅️' }, { a: 'R', icon: '➡️' }], right = [{ a: 'D', icon: '⬇️' }, { a: 'U', icon: '⬆️' }];
    return [
      ...left.map((b, i) => ({ ...b, x: 10 + i * (s + gap), y, w: s, h: s })),
      ...right.map((b, i) => ({ ...b, x: w - 10 - (2 - i) * s - (1 - i) * gap, y, w: s, h: s })),
    ];
  },
  drawPip(c, W, H, S) {
    // the PiP box takes the camera frame's own shape (portrait phone = tall box) and shows the WHOLE frame
    const f = S.cam.frameSize || { w: 4, h: 3 }, ar = f.w / f.h;
    let pw = Math.min(W * 0.3, 220), ph = pw / ar;
    if (ph > H * 0.36) { ph = H * 0.36; pw = ph * ar; }
    const x = W - pw - 10, y = H - ph - 10;
    c.save(); rrect(c, x, y, pw, ph, 14); c.clip();
    c.fillStyle = '#222'; c.fillRect(x, y, pw, ph);
    const map = viewMap(f.w, f.h, pw, ph, S.zoom);
    this.pip = { x, y, w: pw, h: ph, map: { ox: map.ox, oy: map.oy, dw: map.dw, dh: map.dh } };
    c.translate(x, y);
    if (S.cam.hasVideo) drawVideo(c, S.cam.video, pw, ph, map);
    for (const p of S.cam.players) if (p.body) drawSkeleton(c, p.body, map, p.color.css, { width: 4, glow: 8 });
    c.restore();
    c.strokeStyle = '#fff'; c.lineWidth = 3; rrect(c, x, y, pw, ph, 14); c.stroke();
  },
  hud(S) { if (this.runners.length > 1) return []; // each lane shows its own badge
    return this.runners.map((r) => ({ slot: r.slot, score: r.score, icon: ANIMALS[r.slot % 4] })); },
  results(S) { return this.runners.map((r) => ({ slot: r.slot, score: r.score, stars: starsFor(r.score, r.max) })); },
  state(S) {
    return { d: +this.d.toFixed(2), seed: this.seed, nextRow: this.nextRow, rows: this.rows.length,
      speed: +this.speed.toFixed(2), chars: this.runners.length, kind: 'bunny',
      runners: this.runners.map((r) => ({ slot: r.slot, lane: r.lane, air: +r.air.toFixed(2), duck: r.duck, score: r.score, max: r.max, hits: r.hits, autoHops: r.autoHops || 0, cleared: r.cleared, calibrated: r.calibrated, jumps: r.jumps, ducks: r.ducks, laneMoves: r.laneMoves })),
      views: layoutViewports(Math.max(1, this.runners.length), S.W, S.H, 6).views.length, drawnViews: this.layout ? this.layout.views.length : 0 };
  },
};

const app = run(J);
const S = app.S;
// ---- keys: 1 player = arrows or WASD/space; 2 players = P1 WASD, P2 arrows
const KEYS = { w: [0, 'U'], ' ': [0, 'U'], s: [0, 'D'], a: [0, 'L'], d: [0, 'R'], ArrowUp: [1, 'U'], ArrowDown: [1, 'D'], ArrowLeft: [1, 'L'], ArrowRight: [1, 'R'] };
function act(r, a) {
  if (!r || S.mode !== 'play') return;
  if (a === 'U') J.jump(r, S); else if (a === 'D') J.tapDuck(r, S); else J.tapLane(r, a === 'L' ? -1 : 1, S);
}
window.addEventListener('keydown', (e) => {
  const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (!k || e.repeat) return;
  e.preventDefault();
  const slot = J.runners.length > 1 ? k[0] : 0;
  act(J.runner(slot) || J.runners[0], k[1]);
});
// ---- touch: on-screen buttons, or swipe / tap inside your own lane tile
const ptr = new Map();
const cv = document.getElementById('cv');
const tileAt = (x, y) => J.runners.find((r) => r.view && x >= r.view.x && x < r.view.x + r.view.w && y >= r.view.y && y < r.view.y + r.view.h);
cv.addEventListener('pointerdown', (e) => {
  const r = tileAt(e.clientX, e.clientY); if (!r) return;
  const b = (r.btns || []).find((b) => e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h);
  if (b) { act(r, b.a); return; }
  ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, r });
});
cv.addEventListener('pointerup', (e) => {
  const p = ptr.get(e.pointerId); if (!p) return; ptr.delete(e.pointerId);
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (Math.hypot(dx, dy) < 25) return act(p.r, 'U');
  act(p.r, Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'L' : 'R') : dy < 0 ? 'U' : 'D');
});
Object.assign(window.__game, {
  act: (slot, a) => act(J.runner(slot), a),
  course: () => J.rows.map((r) => ({ d: r.d, list: r.list.map((o) => o.type + (o.type === 'rock' || o.type === 'star' ? o.lane : '')) })),
  pip: () => J.pip || null,
  hint: (slot) => { const r = J.runner(slot); return r ? J.nextHint(r) : null; },
  buttons: (slot) => (J.runner(slot)?.btns || []).map((b) => ({ a: b.a, x: b.x + b.w / 2, y: b.y + b.h / 2 })),
});
