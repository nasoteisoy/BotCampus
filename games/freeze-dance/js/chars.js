// "Be the character": cute cartoon animals drawn in code (no image assets) that copy each kid's body.
// A rig = joints in screen px: { T, head, sh, hip, armL:[shoulder, elbow, wrist], armR, legL:[hip, knee, ankle], legR }
// (L = screen left; the camera view is mirrored so that is the kid's own left). T = torso length in px.
//  - rigFromBody(body, map): the kid's tracked body, right where they are on the picture
//  - fitRig(rig, x, footY, T): the same pose moved / scaled (feet on footY) e.g. into a Jump & Duck lane
//  - rigFromDemo(move, t, x, footY, T): a canned move (tap mode, idle) from demo.js
//  - drawChar(c, kind, rig, color, {t, mood, alpha}): kind = bunny | octo | kitty; mood = happy | frozen | oops | wow
import { demoFrame } from './demo.js';

export const KINDS = ['bunny', 'octo', 'kitty'];
const P = (x, y) => ({ x, y });
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midp = (a, b) => P((a.x + b.x) / 2, (a.y + b.y) / 2);
const fin = (q) => !!q && Number.isFinite(q.x) && Number.isFinite(q.y);

/** rig from a toBody() body through a view map (map.x / map.y: normalized -> px, map.dh: frame height in px) */
export function rigFromBody(b, map) {
  if (!b) return null;
  const T = Math.max(6, b.torso * map.dh);
  const X = (q) => P(map.x(q.x), map.y(q.y));
  const pt = (k, d) => (b.p[k] && fin(b.p[k]) ? X(b.p[k]) : d);
  const sh = X(b.sh);
  const hip = b.hip ? X(b.hip) : P(sh.x, sh.y + T);
  const head = b.p.nose ? X(b.p.nose) : P(sh.x, sh.y - T * 0.55);
  const ls = pt('ls', P(sh.x - T * 0.35, sh.y)), rs = pt('rs', P(sh.x + T * 0.35, sh.y));
  const arm = (s, ek, wk) => { const e = pt(ek, P(s.x, s.y + T * 0.5)); return [s, e, pt(wk, P(e.x, e.y + T * 0.5))]; };
  const lh = pt('lh', P(hip.x - T * 0.22, hip.y)), rh = pt('rh', P(hip.x + T * 0.22, hip.y));
  const leg = (h, kk, ak) => { const k = pt(kk, P(h.x, h.y + T * 0.6)); return [h, k, pt(ak, P(k.x, k.y + T * 0.6))]; };
  return { T, head, sh, hip, armL: arm(ls, 'le', 'lw'), armR: arm(rs, 're', 'rw'), legL: leg(lh, 'lk', 'la'), legR: leg(rh, 'rk', 'ra') };
}
const mapRig = (r, f) => ({ T: r.T, head: f(r.head), sh: f(r.sh), hip: f(r.hip), armL: r.armL.map(f), armR: r.armR.map(f), legL: r.legL.map(f), legR: r.legR.map(f) });
/** same pose, centred on x (hips), lowest foot on footY, torso = T px */
export function fitRig(r, x, footY, T) {
  if (!r) return null;
  const k = T / r.T, fy = Math.max(r.legL[2].y, r.legR[2].y);
  const out = mapRig(r, (q) => P(x + (q.x - r.hip.x) * k, footY + (q.y - fy) * k));
  out.T = T; return out;
}
/** rig of a demo.js move at time t (hips at 0, torso = 1.6 units) */
export function rigFromDemo(move, t, x, footY, T) {
  const j = demoFrame(move, t), u = T / 1.6, f = (q) => P(x + q.x * u, footY + (q.y - 2) * u);
  return { T, head: f(j.head), sh: f(j.sh), hip: f(j.hip), armL: j.armL.map(f), armR: j.armR.map(f), legL: j.legL.map(f), legR: j.legR.map(f) };
}
/** is the rig sane enough to draw (all finite, not absurdly stretched)? */
export function rigOk(r) {
  if (!r || !(r.T > 0)) return false;
  const all = [r.head, r.sh, r.hip, ...r.armL, ...r.armR, ...r.legL, ...r.legR];
  return all.every(fin) && all.every((q) => d2(q, r.hip) < r.T * 8);
}

// ---- colours
function hex(c) { const m = /^#?([0-9a-f]{6})/i.exec(c || ''); const n = m ? parseInt(m[1], 16) : 0x38c172; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function mix(a, b, k) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); }
const INK = '#2b1d4e';

function limb(c, pts, w, col, lw, wavy, t) {
  const [a, b, e] = pts;
  c.beginPath(); c.moveTo(a.x, a.y);
  if (wavy) {
    // octopus tentacle: a soft S-curve through the joint + a little curl at the tip
    const s = Math.sin(t * 5 + a.x * 0.05) * w * 0.6;
    c.quadraticCurveTo(b.x + s, b.y - s * 0.5, (b.x + e.x) / 2, (b.y + e.y) / 2);
    c.quadraticCurveTo(e.x - s * 0.5, e.y + s * 0.3, e.x, e.y);
  } else c.quadraticCurveTo(b.x, b.y, e.x, e.y), c.lineTo(e.x, e.y);
  c.strokeStyle = INK; c.lineWidth = w + lw * 2; c.stroke();
  c.strokeStyle = col; c.lineWidth = w; c.stroke();
}
function blob(c, x, y, rx, ry, rot, fill, lw) { c.beginPath(); c.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), rot, 0, 7); c.fillStyle = fill; c.fill(); if (lw) { c.strokeStyle = INK; c.lineWidth = lw; c.stroke(); } }

/** draw one character. kind: bunny | octo | kitty */
export function drawChar(c, kind, R, color, o = {}) {
  if (!rigOk(R)) return;
  const T = R.T, t = o.t || 0, mood = o.mood || 'happy';
  const frozen = mood === 'frozen';
  const col = frozen ? mix(color, '#cdefff', 0.6) : color;
  const light = mix(col, '#ffffff', 0.6), dark = mix(col, INK, 0.35);
  const lw = Math.max(2, T * 0.05);
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  if (o.alpha != null) c.globalAlpha = o.alpha;
  const octo = kind === 'octo';
  const limbW = T * (octo ? 0.36 : 0.33);
  const up = P(R.sh.x - R.hip.x, R.sh.y - R.hip.y), upL = Math.hypot(up.x, up.y) || 1;
  const rot = Math.atan2(up.x, -up.y); // torso tilt
  // head: chibi = big, sits a bit above the nose
  const hb = P(R.head.x - R.sh.x, R.head.y - R.sh.y), hbL = Math.hypot(hb.x, hb.y) || 1;
  const hr = T * (octo ? 0.72 : 0.6);
  const hk = octo ? Math.max(hr * 0.55, hbL * 0.8) : Math.max(hr * 0.95, hbL * 1.05);
  const hc = P(R.sh.x + (hb.x / hbL) * hk, R.sh.y + (hb.y / hbL) * hk);
  const hrot = Math.max(-0.6, Math.min(0.6, Math.atan2(hb.x, -hb.y)));
  // --- tail (behind)
  if (kind === 'kitty') {
    const sway = Math.sin(t * 4) * T * 0.35, tx = R.hip.x + T * 0.35, ty = R.hip.y;
    c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + T * 0.7, ty - T * 0.1, tx + T * 0.55 + sway, ty - T * 0.75);
    c.strokeStyle = INK; c.lineWidth = T * 0.16 + lw * 2; c.stroke(); c.strokeStyle = col; c.lineWidth = T * 0.16; c.stroke();
  }
  if (kind === 'bunny') blob(c, R.hip.x + T * 0.3, R.hip.y - T * 0.05, T * 0.18, T * 0.18, 0, '#ffffff', lw);
  // --- legs + feet
  for (const L of [R.legL, R.legR]) {
    limb(c, L, limbW, col, lw, octo, t);
    const f = L[2], k = L[1], ang = Math.atan2(f.y - k.y, f.x - k.x);
    if (kind === 'bunny') blob(c, f.x, f.y + T * 0.04, T * 0.26, T * 0.13, 0, light, lw);
    else if (kind === 'kitty') blob(c, f.x, f.y + T * 0.02, T * 0.17, T * 0.11, 0, light, lw);
    else blob(c, f.x + Math.cos(ang) * T * 0.04, f.y + Math.sin(ang) * T * 0.04, T * 0.1, T * 0.1, 0, light, lw);
  }
  if (octo) {
    // two extra little tentacles between the legs
    for (const s of [-1, 1]) limb(c, [R.hip, P(R.hip.x + s * T * 0.15, R.hip.y + T * 0.45), P(R.hip.x + s * T * 0.3 + Math.sin(t * 4 + s) * T * 0.1, R.hip.y + T * 0.85)], limbW * 0.8, col, lw, true, t + s);
  }
  // --- body
  const bc = midp(R.sh, R.hip), sw = Math.max(d2(R.armL[0], R.armR[0]), T * 0.6);
  if (!octo) {
    blob(c, bc.x, bc.y + T * 0.05, sw * 0.62, Math.max(upL, T * 0.7) * 0.62, rot, col, lw);
    blob(c, bc.x + Math.sin(rot) * T * 0.02, bc.y + T * 0.12, sw * 0.38, Math.max(upL, T * 0.7) * 0.4, rot, light, 0);
  } else blob(c, bc.x, bc.y + T * 0.1, sw * 0.5, Math.max(upL, T * 0.7) * 0.5, rot, col, lw);
  // --- arms + paws (in front of the body)
  for (const A of [R.armL, R.armR]) {
    limb(c, A, limbW * 0.92, col, lw, octo, t + 1);
    const w = A[2], e = A[1], a = Math.atan2(w.y - e.y, w.x - e.x);
    blob(c, w.x + Math.cos(a) * T * 0.06, w.y + Math.sin(a) * T * 0.06, limbW * 0.62, limbW * 0.62, 0, light, lw);
  }
  // --- head
  c.save(); c.translate(hc.x, hc.y); c.rotate(hrot);
  if (kind === 'bunny') {
    const wig = Math.sin(t * 3) * 0.08;
    for (const s of [-1, 1]) {
      c.save(); c.translate(s * hr * 0.42, -hr * 0.7); c.rotate(s * (0.18 + wig) + (frozen ? 0 : s * Math.sin(t * 6) * 0.05));
      blob(c, 0, -hr * 0.75, hr * 0.27, hr * 0.85, 0, col, lw); blob(c, 0, -hr * 0.72, hr * 0.13, hr * 0.62, 0, '#ffb3cf', 0);
      c.restore();
    }
  } else if (kind === 'kitty') {
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * hr * 0.85, -hr * 0.35); c.lineTo(s * hr * 0.7, -hr * 1.2); c.lineTo(s * hr * 0.2, -hr * 0.82); c.closePath();
      c.fillStyle = col; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
      c.beginPath(); c.moveTo(s * hr * 0.7, -hr * 0.5); c.lineTo(s * hr * 0.64, -hr * 0.98); c.lineTo(s * hr * 0.36, -hr * 0.78); c.closePath(); c.fillStyle = '#ffb3cf'; c.fill();
    }
  }
  if (octo) { blob(c, 0, hr * 0.05, hr * 1.0, hr * 1.12, 0, col, lw); blob(c, 0, hr * 0.85, hr * 0.7, hr * 0.28, 0, col, 0); for (const [sx, sy, sr] of [[-0.45, -0.7, 0.13], [0.5, -0.55, 0.1], [0.1, -0.88, 0.08]]) blob(c, sx * hr, sy * hr, sr * hr, sr * hr, 0, dark, 0); }
  else blob(c, 0, 0, hr, hr * 0.92, 0, col, lw);
  if (kind === 'bunny' || kind === 'kitty') blob(c, 0, hr * 0.32, hr * 0.5, hr * 0.38, 0, light, 0); // muzzle
  // eyes
  const ey = octo ? -hr * 0.1 : -hr * 0.08, ex = hr * 0.38;
  for (const s of [-1, 1]) {
    if (frozen) { c.strokeStyle = INK; c.lineWidth = lw * 1.3; c.beginPath(); c.moveTo(s * ex - hr * 0.13, ey); c.lineTo(s * ex + hr * 0.13, ey); c.stroke(); }
    else {
      blob(c, s * ex, ey, hr * 0.15, hr * 0.19, 0, INK, 0);
      blob(c, s * ex + hr * 0.05, ey - hr * 0.07, hr * 0.06, hr * 0.06, 0, '#ffffff', 0);
    }
    blob(c, s * hr * 0.62, hr * 0.22, hr * 0.13, hr * 0.09, 0, '#ff8fb0aa', 0); // cheeks
  }
  // nose + mouth
  if (!octo) blob(c, 0, hr * 0.18, hr * 0.09, hr * 0.07, 0, kind === 'bunny' ? '#ff6f9f' : INK, 0);
  c.strokeStyle = INK; c.lineWidth = lw * 1.1;
  if (mood === 'oops' || mood === 'wow') { blob(c, 0, hr * 0.45, hr * 0.1, hr * 0.13, 0, INK, 0); }
  else if (kind === 'kitty') { c.beginPath(); c.arc(-hr * 0.1, hr * 0.3, hr * 0.1, 0.2, Math.PI - 0.2); c.arc(hr * 0.1, hr * 0.3, hr * 0.1, 0.2, Math.PI - 0.2); c.stroke(); }
  else { c.beginPath(); c.arc(0, hr * (octo ? 0.2 : 0.3), hr * 0.2, 0.3, Math.PI - 0.3); c.stroke(); }
  if (kind === 'bunny' && mood !== 'oops' && mood !== 'wow') { c.fillStyle = '#fff'; c.fillRect(-hr * 0.08, hr * 0.42, hr * 0.16, hr * 0.12); c.strokeRect(-hr * 0.08, hr * 0.42, hr * 0.16, hr * 0.12); }
  if (kind === 'kitty') { c.lineWidth = lw * 0.7; for (const s of [-1, 1]) for (const dy of [-0.05, 0.08]) { c.beginPath(); c.moveTo(s * hr * 0.45, hr * (0.25 + dy)); c.lineTo(s * hr * 1.05, hr * (0.2 + dy * 2)); c.stroke(); } }
  c.restore();
  // frozen = little ice sparkles
  if (frozen) { c.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) { const a = i * 1.3 + t, rr = T * (0.9 + 0.2 * Math.sin(t * 3 + i)); star(c, bc.x + Math.cos(a) * rr, bc.y + Math.sin(a) * rr * 1.2, T * 0.08); } }
  c.restore();
}
function star(c, x, y, r) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, q = i % 2 ? r * 0.35 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); c.fill(); }

/** score bubble in the player's colour (above a character's head) */
export function drawBadge(c, x, y, score, color, size = 40) {
  const w = Math.max(size * 1.3, size * 0.55 * (String(score).length + 1.2));
  c.save();
  c.fillStyle = color; c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, size * 0.09);
  c.beginPath(); c.roundRect ? c.roundRect(x - w / 2, y - size / 2, w, size, size / 2) : c.rect(x - w / 2, y - size / 2, w, size); c.fill(); c.stroke();
  c.fillStyle = '#fff'; c.font = `800 ${Math.round(size * 0.68)}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(score), x, y + size * 0.04);
  c.restore();
}
/** top of a drawn character's head (for badges / feedback icons) */
/** where a kid's score badge goes: above the head, or on the tummy if that would hide under the top bar (minY) */
export function badgeSpot(R, size, minY = 80) {
  const top = headTop(R); if (!top) return null;
  const y = top.y - R.T * 0.45;
  return y - size / 2 >= minY ? P(top.x, y) : P((R.sh.x + R.hip.x) / 2, (R.sh.y + R.hip.y) / 2);
}
export function headTop(R) { const octo = 0; return R ? P(R.head.x, R.head.y - R.T * (1.25 + octo)) : null; }
