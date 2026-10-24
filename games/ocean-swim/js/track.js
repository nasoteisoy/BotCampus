// Locked multi-person tracking (pure, no DOM; unit-tested in move-play/test/unit-track.mjs).
// Chumi's live test: "it keeps thinking that more people are around and it swaps people". Fix set:
//  - checkPerson: strict real-person check (nose + both shoulders, a hip or a plausible laptop framing,
//    plausible body scale, inside the play zone without the outer ~5 % edges)
//  - torsoHist / bhattacharyya: appearance = HSV colour histogram of the shoulders-hips quad
//  - assign: optimal one-to-one assignment (brute-force Hungarian, N <= 4) with a max cost
//  - LockTracker: player count N, roll call (raise a hand ~0.8 s) or auto-by-position lock, per-frame matching
//    by predicted position + body size + histogram, hold-when-close, duplicate merge, 2 s persistence for any
//    new detection, extras beyond N ignored, both-hands swap gesture, debug info for the 🐞 overlay.
//  - face memory (v5): optional 128-d face descriptors (face.js computes them off the main thread, throttled) are an
//    extra identity signal per slot: a kid who comes back is recognised by face (any shirt) -> same slot in ~0.5 s;
//    a face that disagrees with its track after kids cross fixes the swap; siblings need a margin between the best
//    and second-best face. Descriptors live in memory only (never exported / stored / sent), gone on reset / roll call.
// Coordinates: x mirrored like the selfie preview (0 = left of screen), y down, both 0..1 of the frame.
// Sizes (sw = shoulder width, th = torso height) are in frame heights (x distances are scaled by ar = w / h).

export const TRACK = {
  visMin: 0.6,        // nose + both shoulders must be at least this visible
  hipVis: 0.5,        // a hip counts as visible from here
  edge: 0.05,         // play zone: ignore the outer 5 % on the left / right (and top for the nose)
  swMin: 0.025,       // smallest plausible shoulder width (small kid far back ~0.027)
  swMax: 0.6,         // biggest plausible shoulder width (face right at the laptop)
  swNoHip: 0.07,      // hips off-frame (laptop): shoulder width must be at least this (close to the camera)
  ratioMin: 0.6, ratioMax: 3.6, // torso height / shoulder width when a hip is visible
  persistSec: 2.0,    // a new / extra detection must persist this long before it is considered at all
  candGapSec: 0.4,    // a candidate unseen this long is forgotten
  menuSec: 0.3,       // nearest-person cursor (nobody locked yet) needs this much age
  handSec: 0.8,       // roll call: raise a hand this long to take the next slot
  autoSec: 4.0,       // roll call: no progress for this long -> fill the rest by position
  mergeIoU: 0.55,     // two detections overlapping more than this are one person (keep the more visible one)
  maxCost: 2.0,       // assignments above this are rejected (the player shows lost and holds)
  confCost: 0.7,      // histogram EMA only on matches cheaper than this
  wSize: 1.5, wHist: 1.5, // cost weights (position term is ~1 per "expected jump")
  histGate: 0.8,      // shirts this different (Bhattacharyya) are never the same kid (re-acquire after releaseSec instead)
  reacquireSec: 0.5,  // ...and later by a look-alike (shirt + size) seen for this long (strangers still need persistSec)
  quickSec: 1.0,      // a lost player can be re-matched directly (no persistence) within this time
  reacquireCost: 1.1, // persisted candidate -> lost player when appearance cost is below this
  releaseSec: 6.0,    // a player lost this long can be taken by any persisted candidate
  closeGap: 0.15,     // torsos closer than this (x gap / mean torso width; <0 = overlap) -> hold
  sepGap: 0.35,       // clearly separated again (same unit)
  holdSec: 1.0,       // hold the last good pose this long while close
  emaA: 0.06,         // histogram update rate on confident, well-separated frames
  swapSec: 1.0,       // both players raise both hands this long -> swap slots
  bins: 16,
  // face memory (face-api euclidean distances: same kid ~0.3-0.45, other kids ~0.6+)
  faceStrong: 0.5,    // best face match below this = that kid...
  faceMargin: 0.08,   // ...if the second-best enrolled kid is at least this much further (siblings)
  faceEnroll: 0.55,   // a new sample this close to the slot's face is added to its average
  faceNo: 0.68,       // faces this far apart are clearly different kids (veto a shirt look-alike re-acquire)
  faceSamples: 5,     // samples averaged per kid (then a slow EMA on very close samples)
  faceEvery: 0.4,     // at most one face descriptor per this many seconds (all tracks together)
  faceCandSec: 0.1,   // a new person is face-checked from this age...
  faceBackSec: 0.3,   // ...and a strong match restores the absent kid's slot from this age (any shirt)
  faceVerifySec: 3.0, // re-check enrolled players this often while 2+ are playing (swap guard)
  faceMinEye: 8,      // smallest eye distance in source pixels worth a descriptor
};

/** euclidean distance of two face descriptors (Infinity when one is missing) */
export function faceDist(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}
/** a kid's face memory: running mean of up to faceSamples descriptors, then a slow EMA of very close samples */
export function newFace(desc) { return { mean: Float32Array.from(desc), n: 1 }; }
export function addFace(f, desc, o = TRACK) {
  if (!f) return newFace(desc);
  if (f.n < o.faceSamples) { f.n++; for (let i = 0; i < f.mean.length; i++) f.mean[i] += (desc[i] - f.mean[i]) / f.n; }
  else if (faceDist(f.mean, desc) < o.faceStrong * 0.8) for (let i = 0; i < f.mean.length; i++) f.mean[i] += (desc[i] - f.mean[i]) * 0.05;
  return f;
}
const mergeFaces = (a, b, o) => { if (!a) return b ? { mean: Float32Array.from(b.mean), n: b.n } : null; if (b) for (let k = 0; k < Math.min(b.n, 2); k++) addFace(a, b.mean, o); return a; };
/**
 * Square head crop (raw / un-mirrored source pixels) for a face descriptor, from the pose landmarks (nose, eyes,
 * ears): null when the kid is not facing the camera (eyes hidden, nose off-centre) or the face is too small.
 */
export function faceRect(lm, W, H, o = TRACK) {
  if (!lm || !W || !H) return null;
  const n = lm[0], le = lm[2], re = lm[5];
  if (!vis(n, 0.6) || !vis(le, 0.5) || !vis(re, 0.5)) return null;
  const ex = (le.x - re.x) * W, ey = (le.y - re.y) * H, eye = Math.hypot(ex, ey);
  if (eye < o.faceMinEye) return null;
  const mx = ((le.x + re.x) / 2) * W, my = ((le.y + re.y) / 2) * H;
  if (Math.abs(n.x * W - mx) > eye * 0.45) return null; // turned sideways
  const l7 = lm[7], l8 = lm[8], ears = vis(l7, 0.5) && vis(l8, 0.5) ? Math.hypot((l7.x - l8.x) * W, (l7.y - l8.y) * H) : 0;
  const S = Math.max(eye * 4.2, ears * 1.7), cx = (mx + n.x * W) / 2, cy = (my + n.y * H) / 2 - S * 0.04;
  const x = Math.round(cx - S / 2), y = Math.round(cy - S / 2), s = Math.round(S);
  if (x < -s * 0.15 || y < -s * 0.25 || x + s > W + s * 0.15 || y + s > H + s * 0.15) return null; // mostly off-frame
  return { x, y, w: s, h: s };
}
/** rough head box (px) from whatever head landmarks are visible (for "is another face near this crop") */
function headBox(lm, W, H) {
  const pts = (lm || []).slice(0, 11).filter((p) => p && (p.visibility ?? 1) > 0.3);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.x * W), ys = pts.map((p) => p.y * H), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const S = Math.max(x1 - x0, y1 - y0) * 1.6 + 4, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: cx - S / 2, y: cy - S / 2, w: S, h: S };
}
/** gap in px between two rects (negative = overlapping) */
function rectGap(a, b) { return Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h)); }

const vis = (p, m) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility === undefined || p.visibility >= m);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** torso quad in raw image coords (un-mirrored): [ls, rs, rh, lh]; hips estimated from shoulders when hidden */
export function torsoQuad(lm, ar = 1, o = TRACK) {
  const ls = lm[11], rs = lm[12];
  const sw = Math.hypot((ls.x - rs.x) * ar, ls.y - rs.y);
  const est = (s) => ({ x: s.x, y: s.y + sw * 1.45 });
  const lh = vis(lm[23], o.hipVis) ? lm[23] : est(ls), rh = vis(lm[24], o.hipVis) ? lm[24] : est(rs);
  return [ls, rs, rh, lh];
}
const boxOf = (pts, mirror = true) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { const x = mirror ? 1 - p.x : p.x; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
};
export function iou(a, b) {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const I = ix * iy, U = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - I;
  return U > 0 ? I / U : 0;
}
/** horizontal gap between two torso boxes in units of their mean width (negative = overlap); Infinity if no vertical overlap */
export function torsoGap(a, b) {
  if (Math.min(a.y1, b.y1) <= Math.max(a.y0, b.y0)) return Infinity;
  const w = ((a.x1 - a.x0) + (b.x1 - b.x0)) / 2 || 1e-6;
  return (Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)) / w;
}

/**
 * Strict real-person check. Returns { ok, why, det } where det = { x, y, sw, th, box (torso, mirrored),
 * full (all visible points, mirrored), q (quality), hand (one wrist above the shoulders), both (both wrists
 * above the nose), lm }. why: 'face' | 'shoulders' | 'hips' | 'scale' | 'edge' (rejections are still shown in 🐞).
 */
export function checkPerson(lm, ar = 1, o = TRACK) {
  if (!lm || lm.length < 25) return { ok: false, why: 'shoulders', det: null };
  const ls = lm[11], rs = lm[12], nose = lm[0];
  const seen = lm.filter((p) => vis(p, 0.5));
  const full = seen.length ? boxOf(seen) : null;
  const fail = (why) => ({ ok: false, why, det: full ? { box: full, full, x: (full.x0 + full.x1) / 2, y: (full.y0 + full.y1) / 2 } : null });
  if (!vis(ls, o.visMin) || !vis(rs, o.visMin)) return fail('shoulders');
  if (!vis(nose, o.visMin)) return fail('face');
  const sw = Math.hypot((ls.x - rs.x) * ar, ls.y - rs.y);
  const hipL = vis(lm[23], o.hipVis), hipR = vis(lm[24], o.hipVis);
  let th;
  if (hipL || hipR) {
    const hy = hipL && hipR ? (lm[23].y + lm[24].y) / 2 : (hipL ? lm[23] : lm[24]).y, hx = hipL && hipR ? (lm[23].x + lm[24].x) / 2 : (hipL ? lm[23] : lm[24]).x;
    th = Math.hypot(((ls.x + rs.x) / 2 - hx) * ar, (ls.y + rs.y) / 2 - hy);
    if (sw < o.swMin || sw > o.swMax) return fail('scale');
    const r = th / Math.max(sw, 1e-6);
    if (r < o.ratioMin || r > o.ratioMax) return fail('scale');
  } else {
    // laptop framing: hips below the bottom of the frame. Only OK when the person is close (big shoulders)
    // and the shoulders sit low enough that the hips really would be off-frame.
    const shY = (ls.y + rs.y) / 2;
    if (sw < o.swNoHip || sw > o.swMax) return fail('hips');
    if (shY + sw * 1.0 < 0.98) return fail('hips');
    th = sw * 1.45;
  }
  const sx = 1 - (ls.x + rs.x) / 2, nx = 1 - nose.x;
  if (sx < o.edge || sx > 1 - o.edge || nx < o.edge || nx > 1 - o.edge || nose.y < o.edge * 0.5) return fail('edge');
  const quad = torsoQuad(lm, ar, o), box = boxOf(quad);
  box.y1 = Math.min(box.y1, 1);
  const shY = (ls.y + rs.y) / 2;
  const wr = (i) => (vis(lm[i], 0.5) ? lm[i] : null);
  const lw = wr(15), rw = wr(16);
  const hand = !!((lw && lw.y < shY - sw * 0.1) || (rw && rw.y < shY - sw * 0.1));
  const both = !!(lw && rw && lw.y < nose.y && rw.y < nose.y);
  const q = [0, 11, 12, 23, 24].reduce((s, i) => s + (lm[i]?.visibility ?? 1), 0) / 5;
  const cy = (box.y0 + box.y1) / 2;
  return { ok: true, why: '', det: { x: sx, y: cy, sw, th, box, full, q, hand, both, lm, hist: null } };
}

/** pixel RGB (0..255) -> histogram bin: 12 hue bins for coloured pixels, 4 grey bins (by value) for the rest */
export function binOf(r, g, b, bins = TRACK.bins) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  const nh = bins - 4;
  if (s < 0.25 || v < 0.18) return nh + Math.min(3, (v * 4) | 0);
  let h;
  if (mx === r) h = ((g - b) / (mx - mn) + 6) % 6; else if (mx === g) h = (b - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4;
  return Math.min(nh - 1, ((h / 6) * nh) | 0);
}
const inQuad = (q, x, y) => { // convex quad, either winding
  let pos = false, neg = false;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c > 0) pos = true; else if (c < 0) neg = true;
    if (pos && neg) return false;
  }
  return true;
};
/**
 * HSV colour histogram of the torso (shoulders-hips quad, shrunk 15 % toward its centre so arms crossing the
 * edges matter less) from an RGBA image {data, width, height} of the raw (un-mirrored) frame. Normalized; null
 * when the quad has < 12 pixels in the image.
 */
export function torsoHist(img, lm, ar = 1, o = TRACK) {
  if (!img || !lm) return null;
  const Q = torsoQuad(lm, ar, o), cx = Q.reduce((s, p) => s + p.x, 0) / 4, cy = Q.reduce((s, p) => s + p.y, 0) / 4;
  const W = img.width, H = img.height, q = Q.map((p) => ({ x: (cx + (p.x - cx) * 0.85) * W, y: (cy + (p.y - cy) * 0.85) * H }));
  const x0 = clamp(Math.floor(Math.min(...q.map((p) => p.x))), 0, W - 1), x1 = clamp(Math.ceil(Math.max(...q.map((p) => p.x))), 0, W - 1);
  const y0 = clamp(Math.floor(Math.min(...q.map((p) => p.y))), 0, H - 1), y1 = clamp(Math.ceil(Math.max(...q.map((p) => p.y))), 0, H - 1);
  const h = new Float32Array(o.bins), d = img.data;
  let n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 600))); // <= ~600 samples
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    if (!inQuad(q, x + 0.5, y + 0.5)) continue;
    const i = (y * W + x) * 4; h[binOf(d[i], d[i + 1], d[i + 2], o.bins)]++; n++;
  }
  if (n < 12) return null;
  for (let i = 0; i < h.length; i++) h[i] /= n;
  return h;
}
/** Bhattacharyya distance of two normalized histograms: 0 = same, 1 = no overlap */
export function bhattacharyya(a, b) {
  if (!a || !b) return 0;
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.sqrt(a[i] * b[i]);
  return Math.sqrt(Math.max(0, 1 - Math.min(1, s)));
}

/**
 * Optimal one-to-one assignment of rows (players) to columns (detections). C[i][j] = cost (Infinity = not
 * allowed). Leaving a row unassigned costs maxCost, so any pair above maxCost is rejected. Brute force over
 * all injective maps (the Hungarian optimum; N <= 4 players x <= 5 detections = at most a few hundred).
 * @returns { pairs: [[i, j]], cost }
 */
export function assign(C, maxCost = TRACK.maxCost) {
  const n = C.length, m = n ? C[0].length : 0, used = new Array(m).fill(false);
  let best = { cost: Infinity, pairs: [] };
  const cur = [];
  const rec = (i, acc) => {
    if (acc >= best.cost - 1e-12) return;
    if (i === n) { best = { cost: acc, pairs: cur.slice() }; return; }
    for (let j = 0; j < m; j++) {
      if (used[j]) continue; const c = C[i][j];
      if (!(c <= maxCost)) continue;
      used[j] = true; cur.push([i, j]); rec(i + 1, acc + c); cur.pop(); used[j] = false;
    }
    rec(i + 1, acc + maxCost);
  };
  rec(0, 0);
  return best;
}

/** merge duplicate detections (torso IoU over mergeIoU, or near-identical full boxes): keep the more visible one.
 *  Torso boxes, not full-body boxes: two kids side by side overlap a lot in a portrait frame but are two people. */
export function mergeDuplicates(dets, o = TRACK) {
  const s = dets.slice().sort((a, b) => b.q - a.q), out = [];
  for (const d of s) { if (out.some((k) => iou(k.box, d.box) > o.mergeIoU || iou(k.full || k.box, d.full || d.box) > 0.85)) { d.merged = true; continue; } out.push(d); }
  return out;
}

const shiftBox = (b, dx, dy) => ({ x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy });

export class LockTracker {
  constructor(opts = {}) { this.o = { ...TRACK, ...opts }; this.n = 4; this.reset(); }
  /** forget everything (players, candidates, phase -> idle) */
  reset() {
    this.phase = 'idle'; this.slots = new Array(4).fill(null); this.cands = []; this.nextId = 1; this.t = 0;
    this.rollStart = 0; this.lastProgress = 0; this.events = []; this.swapEnabled = true; this.pairs = new Map();
    this.debug = { dets: [], rejected: [] }; this.lastDets = []; this.faceAlias = new Map(); this.faceLog = []; this.pendEvents = [];
  }
  setN(n) { this.n = clamp(n | 0, 1, 4); for (let s = this.n; s < 4; s++) this.slots[s] = null; }
  /** roll call: slots empty, fill 1..N as kids raise a hand (or by position after autoSec without progress) */
  startRoll(n = this.n, t = this.t) { this.setN(n); this.slots = new Array(4).fill(null); this.phase = 'roll'; this.rollStart = this.lastProgress = t; this.pairs.clear(); this.faceAlias.clear(); for (const c of this.cands) c.face = null; }
  /** skip / auto: lock now; free slots fill with persisted people left to right */
  lockAuto(n = this.n, t = this.t, keep = true) {
    this.setN(n); if (!keep) this.slots = new Array(4).fill(null);
    this.phase = 'locked'; this._fillByPosition(t);
  }
  get filled() { return this.slots.slice(0, this.n).filter(Boolean); }
  /** players with a slot, sorted by slot: { slot, id, x, y, sw, state: 'active'|'held'|'lost', lm, cost } */
  players() { return this.filled.map((p) => ({ slot: p.slot, id: p.id, x: p.x, y: p.y, sw: p.sw, state: p.state, lm: p.out, cost: p.cost, held: p.state === 'held', lostFor: p.state === 'lost' ? +(this.t - p.lastSeen).toFixed(3) : 0, face: p.face ? p.face.n : 0, faceD: p.faceD })); }
  /** people seen but not players (white ghosts / nearest-person cursor) */
  candidates() { return this.cands.filter((c) => c.lastSeen === this.t); }
  /** roll call progress: slot -> {filled, p (0..1 hand progress of the best waiting candidate)} */
  rollState() {
    const waiting = this.cands.filter((c) => c.lastSeen === this.t);
    const best = waiting.reduce((m, c) => Math.max(m, Math.min(1, c.handT / this.o.handSec)), 0);
    const auto = this.phase === 'roll' ? clamp((this.t - this.lastProgress) / this.o.autoSec, 0, 1) : 1;
    return { phase: this.phase, n: this.n, slots: Array.from({ length: this.n }, (_, s) => !!this.slots[s]), faces: Array.from({ length: this.n }, (_, s) => !!this.slots[s]?.face), best, auto };
  }
  exportLock() { return { n: this.n, slots: this.filled.map((p) => ({ slot: p.slot, hist: p.hist ? Array.from(p.hist) : null, sw: p.sw, th: p.th })) }; }
  importLock(L, t = 0) {
    if (!L || !L.slots) return false;
    this.setN(L.n || L.slots.length); this.slots = new Array(4).fill(null); this.phase = 'locked';
    for (const s of L.slots) if (s.slot < this.n) this.slots[s.slot] = this._player(s.slot, { x: 0.5, y: 0.5, sw: s.sw, th: s.th, hist: s.hist ? Float32Array.from(s.hist) : null, box: { x0: 0, x1: 0, y0: 0, y1: 0 }, lm: null }, t - 99, 'lost');
    return true;
  }
  _player(slot, d, t, state = 'active') {
    return { slot, id: this.nextId++, x: d.x, y: d.y, vx: 0, vy: 0, sw: d.sw, th: d.th, hist: d.hist ? Float32Array.from(d.hist) : null, box: d.box, lm: d.lm, good: d.lm, out: d.lm,
      lastSeen: t, state, heldSince: -1, cost: 0, bothT: 0, swapArmed: true, face: null, faceD: null, faceAskT: -99, faceNear: -99, faceStale: false };
  }
  _pred(p, t) {
    const dt = clamp(t - p.lastSeen, 0, 1.2), k = 0.7 * (1 - Math.exp(-dt / 0.7)); // damped constant velocity
    return { x: p.x + p.vx * k, y: p.y + p.vy * k };
  }
  /** matching cost player p -> detection d (Infinity outside the gate) */
  cost(p, d, t, ar = 1) {
    const o = this.o, pr = this._pred(p, t), gap = clamp(t - p.lastSeen, 0, 2);
    const dist = Math.hypot((d.x - pr.x) * ar, (d.y - pr.y) * 0.6);
    const scale = Math.max(0.12, 1.2 * p.sw) + 0.5 * gap;
    const cPos = dist / scale;
    if (cPos > 2.5) return Infinity;
    const cSize = Math.abs(Math.log(Math.max(d.sw, 1e-3) / Math.max(p.sw, 1e-3))) * o.wSize;
    const bh = p.hist && d.hist ? bhattacharyya(p.hist, d.hist) : 0;
    if (bh > o.histGate) return Infinity;
    return cPos + cSize + bh * o.wHist;
  }
  /** appearance-only cost (re-acquire after a long loss) */
  lookCost(p, d) {
    return Math.abs(Math.log(Math.max(d.sw, 1e-3) / Math.max(p.sw, 1e-3))) * this.o.wSize * 0.5 + (p.hist && d.hist ? bhattacharyya(p.hist, d.hist) * this.o.wHist : 0.5);
  }
  _take(p, d, t, cost) {
    const gap = Math.max(1e-3, t - p.lastSeen);
    if (gap < 0.5) { p.vx += ((d.x - p.x) / gap - p.vx) * 0.5; p.vy += ((d.y - p.y) / gap - p.vy) * 0.3; } else { p.vx = 0; p.vy = 0; }
    p.x = d.x; p.y = d.y; p.sw = p.sw * 0.8 + d.sw * 0.2; p.th = p.th * 0.8 + d.th * 0.2; p.box = d.box; p.lm = d.lm; p.good = d.lm; p.out = d.lm;
    if (!p.hist && d.hist) p.hist = Float32Array.from(d.hist);
    p.lastSeen = t; p.state = 'active'; p.heldSince = -1; p.cost = cost; p.det = d; d.slot = p.slot; d.cost = cost;
  }
  /**
   * @param raw array of checkPerson() results ({ok, why, det}) or plain dets; @param t seconds; @param ar frame w/h
   * @returns players()
   */
  update(raw, t, ar = 1) {
    const o = this.o; this.t = t; this.events = this.pendEvents || []; this.pendEvents = []; // + async face fixes since the last frame
    const rejected = [], ok = [];
    for (const r of raw || []) { if (!r) continue; if (r.ok === false) { if (r.det) rejected.push({ box: r.det.box, why: r.why }); continue; } ok.push(r.det || r); }
    const all = mergeDuplicates(ok, o);
    for (const d of ok) if (d.merged) rejected.push({ box: d.box, why: 'dup' });
    const dets = all.slice(0, this.n + 1); // numPoses = N + 1: keep only the best N + 1
    for (const d of all.slice(this.n + 1)) rejected.push({ box: d.box, why: 'extra' });
    for (const d of dets) { d.slot = -1; d.cost = null; d.used = false; }
    const players = this.filled;
    // ---- hold when close: pairs of recently seen players whose (predicted) torsos overlap / nearly touch
    const recent = players.filter((p) => t - p.lastSeen < 0.6 || p.state === 'held');
    const pbox = new Map(recent.map((p) => { const pr = this._pred(p, t); return [p, shiftBox(p.box, pr.x - p.x, pr.y - p.y)]; }));
    const groups = [];
    for (let i = 0; i < recent.length; i++) for (let j = i + 1; j < recent.length; j++) {
      const a = recent[i], b = recent[j], key = Math.min(a.slot, b.slot) + ':' + Math.max(a.slot, b.slot);
      const g = torsoGap(pbox.get(a), pbox.get(b));
      if (g < o.sepGap) a.faceNear = b.faceNear = t; // close / crossing: re-check both faces once they separate
      const st = this.pairs.get(key) || { timedOut: false };
      if (g > o.sepGap) st.timedOut = false;
      this.pairs.set(key, st);
      if (g < o.closeGap && !st.timedOut) {
        let G = groups.find((x) => x.has(a) || x.has(b)); if (!G) groups.push((G = new Set()));
        G.add(a); G.add(b);
      }
    }
    const heldNow = new Set();
    for (const G of groups) {
      const arr = [...G], since = Math.min(...arr.map((p) => (p.heldSince >= 0 ? p.heldSince : t)));
      // clearly separated detections around the group -> match the group now (motion + appearance)
      const ex = arr.reduce((b, p) => { const q = pbox.get(p); return { x0: Math.min(b.x0, q.x0), x1: Math.max(b.x1, q.x1), y0: Math.min(b.y0, q.y0), y1: Math.max(b.y1, q.y1) }; }, { x0: 9, x1: -9, y0: 9, y1: -9 });
      const w = (ex.x1 - ex.x0) / arr.length;
      const near = dets.filter((d) => d.x > ex.x0 - w * 1.5 && d.x < ex.x1 + w * 1.5);
      const sep = near.length >= arr.length && near.every((d, i) => near.every((e, k) => k <= i || torsoGap(d.box, e.box) > o.sepGap));
      if (sep) continue; // normal matching below handles them (prediction carries them across)
      if (t - since >= o.holdSec) { // close for too long: stop holding this pair until they separate once
        for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { const k = Math.min(arr[i].slot, arr[j].slot) + ':' + Math.max(arr[i].slot, arr[j].slot); const st = this.pairs.get(k); if (st) st.timedOut = true; }
        for (const p of arr) p.heldSince = -1;
        continue;
      }
      for (const p of arr) { heldNow.add(p); if (p.heldSince < 0) p.heldSince = t; p.state = 'held'; p.out = p.good; }
    }
    // ---- match everyone not held: predicted position + size + histogram, one-to-one, max cost
    const live = players.filter((p) => !heldNow.has(p) && (t - p.lastSeen <= o.quickSec || p.state === 'held' || p.state === 'active'));
    const C = live.map((p) => dets.map((d) => this.cost(p, d, t, ar)));
    const A = assign(C, o.maxCost);
    const matched = new Set();
    for (const [i, j] of A.pairs) { this._take(live[i], dets[j], t, C[i][j]); dets[j].used = true; matched.add(live[i]); }
    for (const d of dets) if (!d.used) for (const h of heldNow) if (torsoGap(d.box, pbox.get(h) || h.box) < o.sepGap) d.nearHeld = true;
    for (const p of players) {
      if (matched.has(p) || heldNow.has(p)) continue;
      p.state = 'lost'; p.out = null; p.heldSince = -1; p.vx *= 0.8; p.vy *= 0.8;
    }
    // ---- histogram EMA: confident + well separated from every other detection
    for (const p of matched) {
      const d = p.det; if (!d.hist || !p.hist || p.cost > o.confCost) continue;
      if (dets.some((e) => e !== d && torsoGap(e.box, d.box) < o.sepGap)) continue;
      for (let i = 0; i < p.hist.length; i++) p.hist[i] = p.hist[i] * (1 - o.emaA) + d.hist[i] * o.emaA;
    }
    // ---- candidates: everything else (must persist persistSec before it is considered)
    const rest = dets.filter((d) => !d.used && !d.nearHeld);
    const cs = this.cands;
    const CC = cs.map((c) => rest.map((d) => { const dd = Math.hypot((d.x - c.x) * ar, d.y - c.y), sc = Math.max(0.1, c.sw * 1.5); return dd > sc * 2 ? Infinity : dd / sc + Math.abs(Math.log(d.sw / c.sw)); }));
    const AC = assign(CC, 2.5), cm = new Set(), dm = new Set();
    for (const [i, j] of AC.pairs) {
      const c = cs[i], d = rest[j], dt = t - c.lastSeen;
      c.x = d.x; c.y = d.y; c.sw = c.sw * 0.7 + d.sw * 0.3; c.th = c.th * 0.7 + d.th * 0.3; c.box = d.box; c.lm = d.lm; c.lastSeen = t; c.det = d;
      if (d.hist) c.hist = c.hist ? c.hist.map((v, k) => v * 0.8 + d.hist[k] * 0.2) : Float32Array.from(d.hist);
      c.handT = d.hand ? c.handT + Math.min(dt, 0.2) : 0;
      cm.add(c); dm.add(d);
    }
    this.cands = cs.filter((c) => cm.has(c) || t - c.lastSeen <= o.candGapSec);
    for (const d of rest) if (!dm.has(d)) this.cands.push({ id: this.nextId++, x: d.x, y: d.y, sw: d.sw, th: d.th, box: d.box, lm: d.lm, hist: d.hist ? Float32Array.from(d.hist) : null, firstSeen: t, lastSeen: t, handT: 0, det: d });
    for (const c of this.cands) { c.persisted = t - c.firstSeen >= o.persistSec - 1e-9; if (c.det && c.lastSeen === t) c.det.cand = c; }
    // ---- roll call / auto fill / re-acquire
    if (this.phase === 'roll') this._roll(t);
    else if (this.phase === 'locked') { this._faceBack(t); this._reacquire(t); this._fillByPosition(t); }
    // ---- swap gesture (two players, both hands up, 1 s)
    this._swap(t);
    // ---- debug info for the 🐞 overlay
    this.lastDets = dets;
    this.debug = {
      rejected,
      dets: dets.map((d) => ({ box: d.box, slot: d.slot, cost: d.cost, held: false, faceD: d.slot >= 0 ? this.slots[d.slot]?.faceD ?? null : d.cand?.faceD ?? null, face: d.slot >= 0 ? !!this.slots[d.slot]?.face : !!d.cand?.face, cand: d.cand ? { age: +(t - d.cand.firstSeen).toFixed(1), persisted: d.cand.persisted } : null, extra: !d.used && this.phase === 'locked' && !this.slots.slice(0, this.n).some((s) => !s || s.state === 'lost') })),
      held: [...heldNow].map((p) => ({ slot: p.slot, box: pbox.get(p) || p.box })),
    };
    return this.players();
  }
  _assignCand(slot, c, t) {
    const d = { x: c.x, y: c.y, sw: c.sw, th: c.th, box: c.box, lm: c.lm, hist: c.hist };
    this.slots[slot] = this._player(slot, d, t);
    if (c.face) { this.slots[slot].face = mergeFaces(null, c.face, this.o); this.slots[slot].faceD = c.faceD ?? null; }
    this.faceAlias.set(c.id, this.slots[slot].id);
    if (c.det) { c.det.slot = slot; c.det.used = true; }
    this.cands = this.cands.filter((k) => k !== c);
    this.events.push({ type: 'lock', slot });
  }
  _free() { const out = []; for (let s = 0; s < this.n; s++) if (!this.slots[s]) out.push(s); return out; }
  _roll(t) {
    const o = this.o;
    // whoever has had a hand up for handSec (and has persisted) takes the next slot, earliest first
    const ready = this.cands.filter((c) => c.lastSeen === t && c.persisted && c.handT >= o.handSec).sort((a, b) => b.handT - a.handT || a.x - b.x);
    for (const c of ready) { const f = this._free(); if (!f.length) break; this._assignCand(f[0], c, t); this.lastProgress = t; }
    if (!this._free().length) { this.phase = 'locked'; this.events.push({ type: 'locked' }); return; }
    // nobody raised a hand for autoSec -> fill the rest by position and lock
    if (t - this.lastProgress >= o.autoSec && this.cands.some((c) => c.lastSeen === t && c.persisted)) {
      this.phase = 'locked'; this._fillByPosition(t); this.events.push({ type: 'locked', auto: true });
    }
  }
  _fillByPosition(t) {
    const f = this._free(); if (!f.length) return;
    const ready = this.cands.filter((c) => c.lastSeen === t && c.persisted).sort((a, b) => a.x - b.x);
    for (const c of ready) { const fr = this._free(); if (!fr.length) break; this._assignCand(fr[0], c, t); }
  }
  _reacquire(t) {
    const o = this.o;
    const lost = this.filled.filter((p) => p.state === 'lost' && t - p.lastSeen > o.quickSec);
    const ready = this.cands.filter((c) => c.lastSeen === t && (c.persisted || t - c.firstSeen >= o.reacquireSec - 1e-9));
    if (!lost.length || !ready.length) return;
    const C = lost.map((p) => ready.map((c) => {
      const k = this.lookCost(p, c), lostFor = t - p.lastSeen;
      if (c.face && p.face && faceDist(c.face.mean, p.face.mean) > o.faceNo && lostFor < o.releaseSec) return Infinity; // clearly another kid's face
      if (lostFor >= o.releaseSec) return c.persisted ? Math.min(k, o.reacquireCost - 0.01) : Infinity; // gone long: any persisted kid
      return c.persisted || k < o.confCost ? k : Infinity; // a short look-alike only when it really looks like them
    }));
    for (const [i, j] of assign(C, o.reacquireCost).pairs) {
      const p = lost[i], c = ready[j], keep = p.hist;
      const d = { x: c.x, y: c.y, sw: c.sw, th: c.th, box: c.box, lm: c.lm, hist: c.hist };
      const lostFor = t - p.lastSeen;
      this._take(p, d, t, C[i][j]); if (keep && lostFor < o.releaseSec) p.hist = keep; else if (c.hist) p.hist = Float32Array.from(c.hist);
      const fd = c.face && p.face ? faceDist(c.face.mean, p.face.mean) : Infinity;
      if (c.face && fd < o.faceEnroll) mergeFaces(p.face, c.face, o);
      else if (c.face && (!p.face || lostFor >= o.releaseSec)) p.face = mergeFaces(null, c.face, o);
      else if (p.face && lostFor >= o.releaseSec) p.faceStale = true; // maybe another kid took the slot: next face sample decides
      this.faceAlias.set(c.id, p.id);
      if (c.det) { c.det.slot = p.slot; c.det.used = true; }
      this.cands = this.cands.filter((k) => k !== c);
      this.events.push({ type: 'back', slot: p.slot });
    }
  }
  // ---------------------------------------------------------------- face memory
  /** best enrolled slot for a descriptor: { p, d1, d2, strong } (strong = below faceStrong with the sibling margin) */
  faceMatch(desc, skip = null) {
    let p = null, d1 = Infinity, d2 = Infinity;
    for (const q of this.filled) {
      if (!q.face || q === skip) continue;
      const d = faceDist(q.face.mean, desc);
      if (d < d1) { d2 = d1; d1 = d; p = q; } else if (d < d2) d2 = d;
    }
    return { p, d1, d2, strong: !!p && d1 < this.o.faceStrong && d2 - d1 >= this.o.faceMargin };
  }
  /**
   * Who needs a face descriptor now (at most one; face.js throttles to faceEvery): new people first (are they an
   * absent kid?), then players right after crossing / being close (swap guard), then players not enrolled yet, then a
   * slow re-check while 2+ kids play. Only well-separated, camera-facing kids (faceRect). W, H = source pixels.
   * @returns { id, lm, rect, why } or null
   */
  faceTarget(t = this.t, W = 640, H = 480) {
    const o = this.o, dets = this.lastDets || [], list = [];
    const alone = (d) => !!d && !dets.some((e) => e !== d && torsoGap(e.box, d.box) < o.sepGap);
    // new people: only the head crops must not touch (a returning kid often walks in right next to a sibling);
    // players: well separated bodies (an enrolment sample must never come from a mixed-up detection)
    const heads = dets.map((e) => ({ e, r: faceRect(e.lm, W, H, o) || headBox(e.lm, W, H) }));
    const headAlone = (d, rect) => !!d && !heads.some(({ e, r }) => e !== d && r && rectGap(r, rect) < 0.25 * rect.w);
    const absent = this.filled.some((p) => p.face && p.state === 'lost');
    for (const c of this.cands) {
      if (c.lastSeen !== t || t - c.firstSeen < o.faceCandSec - 1e-9 || (c.face && c.face.n >= 3) || !c.det) continue;
      list.push({ c, pri: absent ? 5 : 3, ask: c.faceAskT ?? -99, head: true });
    }
    const many = this.filled.filter((p) => p.state !== 'lost').length >= 2;
    for (const p of this.filled) {
      if (p.state !== 'active' || p.lastSeen !== t || !alone(p.det)) continue;
      let pri = 0;
      if (p.faceNear > p.faceAskT && t - p.faceNear > 0.1) pri = 4;
      else if (!p.face || p.face.n < o.faceSamples || p.faceStale) pri = 2;
      else if (many && t - p.faceAskT > o.faceVerifySec) pri = 1;
      if (pri) list.push({ c: p, pri, ask: p.faceAskT });
    }
    list.sort((a, b) => b.pri - a.pri || a.ask - b.ask);
    for (const { c, pri, head } of list) {
      const rect = faceRect(c.lm, W, H, o); if (!rect || (head && !headAlone(c.det, rect))) continue;
      c.faceAskT = t;
      return { id: c.id, lm: c.lm, rect, why: ['', 'verify', 'enroll', 'new', 'cross', 'back'][pri] };
    }
    return null;
  }
  /**
   * A descriptor arrived (async) for track id (player or candidate at the time of the crop). Enrolls, recognises a
   * returning kid, or fixes a swap. desc = null (no face found) is ignored. @returns what happened (for 🐞 / tests)
   */
  faceResult(id, desc, t = this.t) {
    if (!desc) return null;
    const o = this.o; id = this.faceAlias.get(id) ?? id;
    const p = this.filled.find((q) => q.id === id);
    let r = null;
    if (p) r = this._facePlayer(p, desc, t);
    else {
      const c = this.cands.find((k) => k.id === id);
      if (c) { c.face = addFace(c.face, desc, o); const m = this.faceMatch(c.face.mean); c.faceD = Number.isFinite(m.d1) ? m.d1 : null; r = { type: 'cand', slot: m.p ? m.p.slot : -1, d: c.faceD, strong: m.strong }; } // next update: _faceBack
    }
    if (r) { this.faceLog.push({ t: +t.toFixed(2), ...r }); if (this.faceLog.length > 20) this.faceLog.shift(); }
    return r;
  }
  _facePlayer(p, desc, t) {
    const o = this.o;
    if (p.state === 'lost') return null; // the body is gone again
    const own = p.face ? faceDist(p.face.mean, desc) : Infinity, m = this.faceMatch(desc, p);
    p.faceD = Number.isFinite(own) ? own : null;
    // this track shows another enrolled kid's face (two kids crossed, or a look-alike took the wrong slot) -> fix it
    if (m.p && m.d1 < o.faceStrong && own - m.d1 >= o.faceMargin && own > o.faceEnroll && !p.faceStale && m.p.state !== 'held' && p.state !== 'held' && (p.face || m.p.state === 'lost')) {
      const q = m.p, sa = p.slot, sb = q.slot;
      for (const k of ['slot', 'face', 'hist', 'faceStale']) { const v = p[k]; p[k] = q[k]; q[k] = v; }
      this.slots[p.slot] = p; this.slots[q.slot] = q; p.faceD = m.d1; q.faceD = null; q.faceAskT = -99;
      if (q.state === 'lost') q.lastSeen = t; // the kid whose slot was taken: lost from now (full grace period)
      this.pairs.clear();
      (this.pendEvents ||= []).push({ type: 'facefix', slots: [sa, sb] });
      return { type: 'fix', slot: p.slot, from: sa, d: m.d1 };
    }
    if (!p.face) { p.face = newFace(desc); return { type: 'enroll', slot: p.slot, n: 1 }; }
    if (p.faceStale) { if (own >= o.faceEnroll) p.face = newFace(desc); else addFace(p.face, desc, o); p.faceStale = false; return { type: 'enroll', slot: p.slot, n: p.face.n, d: own }; }
    if (own < o.faceEnroll) { addFace(p.face, desc, o); return { type: 'enroll', slot: p.slot, n: p.face.n, d: own }; }
    return { type: 'differs', slot: p.slot, d: own };
  }
  /** new people whose face strongly matches an absent kid get that kid's slot right away (any shirt, no 2 s wait) */
  _faceBack(t) {
    const o = this.o;
    for (const c of this.cands.slice()) {
      if (c.lastSeen !== t || !c.face || t - c.firstSeen < o.faceBackSec - 1e-9) continue;
      const m = this.faceMatch(c.face.mean); c.faceD = Number.isFinite(m.d1) ? m.d1 : null;
      if (!m.strong || m.p.state !== 'lost') continue;
      const p = m.p, sameShirt = p.hist && c.hist && bhattacharyya(p.hist, c.hist) < o.histGate;
      this._take(p, { x: c.x, y: c.y, sw: c.sw, th: c.th, box: c.box, lm: c.lm, hist: c.hist }, t, 0);
      if (!sameShirt && c.hist) p.hist = Float32Array.from(c.hist); // new shirt: shirt matching learns it
      mergeFaces(p.face, c.face, o); p.faceD = m.d1; p.faceStale = false;
      if (c.det) { c.det.slot = p.slot; c.det.used = true; c.det.cost = 0; }
      this.cands = this.cands.filter((k) => k !== c); this.faceAlias.set(c.id, p.id);
      this.events.push({ type: 'back', slot: p.slot, face: true });
      this.faceLog.push({ t: +t.toFixed(2), type: 'back', slot: p.slot, d: m.d1, shirt: sameShirt ? 'same' : 'new' }); if (this.faceLog.length > 20) this.faceLog.shift();
    }
  }
  _swap(t) {
    const o = this.o, ps = this.filled;
    for (const p of ps) {
      const up = p.state === 'active' && p.lastSeen === t && !!p.det?.both;
      if (!up) { p.bothSince = null; p.bothT = 0; p.swapArmed = true; continue; }
      if (!p.swapArmed) continue;          // after a swap: hands down first
      p.bothSince ??= t; p.bothT = t - p.bothSince;
    }
    if (!this.swapEnabled) { for (const p of ps) { p.bothSince = null; p.bothT = 0; } return; }
    const ready = ps.filter((p) => p.swapArmed && p.bothT >= o.swapSec - 1e-9);
    if (ready.length !== 2) return;
    const [a, b] = ready, sa = a.slot, sb = b.slot;
    a.slot = sb; b.slot = sa; this.slots[sa] = b; this.slots[sb] = a;
    for (const p of ready) { p.bothT = 0; p.bothSince = null; p.swapArmed = false; }
    this.pairs.clear();
    this.events.push({ type: 'swap', slots: [sa, sb] });
  }
}

// ---- remembered choices (guarded: storage can be blocked in private modes / iframes)
export const PICK_KEY = 'moveplay.players';
export const LOCK_KEY = 'moveplay.lock';
export function loadPick(def = 2) { try { const v = +localStorage.getItem(PICK_KEY); return v >= 1 && v <= 4 ? v | 0 : def; } catch (e) { return def; } }
export function savePick(n) { try { localStorage.setItem(PICK_KEY, String(n)); } catch (e) { /* ignore */ } }
/** the locked kids' appearance, shared with the hub / the other games in this tab only (sessionStorage) */
export function saveLock(L) { try { sessionStorage.setItem(LOCK_KEY, JSON.stringify({ ...L, at: Date.now() })); } catch (e) { /* ignore */ } }
export function loadLock(maxAgeMs = 30 * 60 * 1000) {
  try { const L = JSON.parse(sessionStorage.getItem(LOCK_KEY) || 'null'); return L && L.slots && Date.now() - (L.at || 0) < maxAgeMs ? L : null; } catch (e) { return null; }
}
export function clearLock() { try { sessionStorage.removeItem(LOCK_KEY); } catch (e) { /* ignore */ } }
