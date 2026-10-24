// Pure Freeze Dance logic (no DOM): motion energy meter, freeze check and pose matching.
// Unit-tested in move-play/test/unit-freeze.mjs. Lengths are in torso units so kids & adults match.
import { clamp } from './body.js';

const PTS = ['nose', 'ls', 'rs', 'le', 're', 'lw', 'rw', 'lh', 'rh', 'lk', 'rk', 'la', 'ra'];
const W8 = { lw: 1.4, rw: 1.4, le: 1.1, re: 1.1, la: 1.2, ra: 1.2, lk: 1.1, rk: 1.1 };
// v4 kid-friendly (v3 values in brackets). Standing still stays ~0 energy thanks to the jitter cut, so it never
// counts as dancing; a small kid's sway while "frozen" stays under freezeMax.
export const E = {
  danceOn: 0.36,   // energy (torso/s) that counts as dancing [0.55]
  freezeMax: 0.5,  // energy that still counts as frozen (kids wobble; generous) [0.35]
  rate: 7,         // smoothing (1/s)
  jitter: 0.015,   // per-frame movement under this (torso units) is tracker noise
  jitterAbs: 0.0035, // v4: ...or under this in frame heights (a small far-away kid's torso is short, so the same
                     // camera noise is more torso units - this keeps a still small kid "still")
};
/** Smoothed "how much is this body moving" meter (torso lengths per second). */
export class MotionMeter {
  constructor(opts = {}) { this.o = { ...E, ...opts }; this.reset(); }
  reset() { this.prev = null; this.prevT = null; this.energy = 0; this.raw = 0; }
  update(b, t) {
    const dt = this.prevT == null ? 1 / 30 : clamp(t - this.prevT, 1e-3, 0.5);
    this.prevT = t;
    if (!b) { this.prev = null; this.energy *= Math.exp(-3 * dt); return this.energy; }
    const ar = b.ar || 1, T = b.torso;
    let sum = 0, wsum = 0;
    const jit = Math.max(this.o.jitter, this.o.jitterAbs / Math.max(0.02, T));
    if (this.prev && dt < 0.4) {
      // remove whole-body translation drift? No: stepping counts as dancing. Just per-point motion.
      for (const k of PTS) {
        const a = b.p[k], q = this.prev[k]; if (!a || !q) continue;
        let d = Math.hypot((a.x - q.x) * ar, a.y - q.y) / T;
        d = Math.max(0, d - jit);
        const w = W8[k] || 1; sum += d * w; wsum += w;
      }
    }
    this.raw = wsum ? sum / wsum / dt : 0;
    this.raw = Math.min(this.raw, 6); // a tracker jump shouldn't max the meter
    this.energy += (this.raw - this.energy) * Math.min(1, dt * this.o.rate);
    this.prev = {}; for (const k of PTS) if (b.p[k]) this.prev[k] = b.p[k];
    return this.energy;
  }
  get dancing() { return this.energy > this.o.danceOn; }
  get frozen() { return this.energy < this.o.freezeMax; }
}

/** Pose features: arm angles (deg, 0 = straight out sideways, +90 = straight up, -90 = down), leg spread, raised foot. */
export function features(b) {
  if (!b) return null;
  const P = b.p, ar = b.ar || 1, T = b.torso;
  const arm = (s, e, w, out) => {
    const end = P[w] || P[e]; if (!P[s] || !end) return null;
    return (Math.atan2(P[s].y - end.y, (end.x - P[s].x) * ar * out) * 180) / Math.PI;
  };
  // mirrored view: person's left side is on screen left, so "outward" for the left arm is -x
  const f = { armL: arm('ls', 'le', 'lw', -1), armR: arm('rs', 're', 'rw', 1), spread: null, footUp: null };
  if (P.la && P.ra) f.spread = Math.abs(P.la.x - P.ra.x) * ar / T;
  else if (P.lk && P.rk) f.spread = Math.abs(P.lk.x - P.rk.x) * ar / T * 1.3;
  if (P.la && P.ra) f.footUp = Math.abs(P.la.y - P.ra.y) / T;
  else if (P.lk && P.rk) f.footUp = Math.abs(P.lk.y - P.rk.y) / T * 1.6;
  return f;
}
/** Target poses (shown as silhouettes). Each rule: [feature, min, max]. */
export const POSES = {
  star: { icon: '⭐', rules: [['armL', 10, 80], ['armR', 10, 80], ['spread', 0.6, 9]] },   // v3: 15..80, spread 0.75 (up = 55+ so star stays star)
  up: { icon: '🙌', rules: [['armL', 55, 140], ['armR', 55, 140]] },                       // v3: 55..135
  tpose: { icon: '✈️', rules: [['armL', -30, 32], ['armR', -30, 32]] },                    // v3: -25..28
  oneleg: { icon: '🦩', rules: [['footUp', 0.28, 9]] },                                     // v3: 0.35
};
/** 0..1 how well body matches pose; missing features count as half (so a cropped foot isn't a fail). */
export function poseScore(b, name) {
  const f = features(b), P = POSES[name]; if (!f || !P) return 0;
  let s = 0;
  for (const [k, lo, hi] of P.rules) {
    const v = f[k];
    if (v == null) { s += 0.5; continue; }
    const soft = k.startsWith('arm') ? 20 : 0.2; // soft margin around each range [v3 15 / 0.15]
    if (v >= lo && v <= hi) s += 1; else s += Math.max(0, 1 - (v < lo ? lo - v : v - hi) / soft);
  }
  return s / P.rules.length;
}
export const MATCH = 0.7; // [v3 0.8]
export function starsFor(score, maxScore) {
  const k = maxScore > 0 ? score / maxScore : 0;
  return k >= 0.7 ? 3 : k >= 0.4 ? 2 : score > 0 ? 1 : 0;
}
/** Round script: dance / stop phases. Deterministic for a seed. */
export function makeScript(rng, totalSec) {
  const out = []; let t = 0, i = 0;
  const poses = Object.keys(POSES);
  while (t < totalSec) {
    const dance = 5 + rng() * 4; out.push({ type: 'dance', t, dur: dance }); t += dance;
    if (t >= totalSec) break;
    const isPose = i % 2 === 1;
    const dur = isPose ? 4.5 : 3.5;
    out.push(isPose ? { type: 'pose', t, dur, pose: poses[(i >> 1) % poses.length] } : { type: 'freeze', t, dur });
    t += dur; i++;
  }
  return out;
}
