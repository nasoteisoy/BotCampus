// Hand-drawn canvas art: invented flags, fictional commander portraits, unit symbols, KG-style front arrows.
import { rng } from './state.js?v=8g3';
import { UNIT_PATHS } from './icons.js';

const unitPath2D = {};
// company / ship class icon on a canvas, same shapes as the panel's svg icons
export function unitGlyph(g, type, x, y, s, col = '#e9edf1', lw = 2.2) {
  const p = unitPath2D[type] || (unitPath2D[type] = new Path2D(UNIT_PATHS[type]));
  g.save(); g.translate(x - s / 2, y - s / 2); g.scale(s / 24, s / 24);
  g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(p);
  if (type === 'art') { g.fillStyle = col; g.beginPath(); g.arc(12, 12, 2, 0, 7); g.fill(); }
  g.restore();
}

export const SIDE_COL = {
  blue: { fill: '#2c5aa8', dark: '#122a5c', light: '#8fb4ff', arrow: [44, 86, 178], arrowEdge: [14, 32, 84] },
  red: { fill: '#b3201f', dark: '#5a0b0b', light: '#ff9b8f', arrow: [158, 28, 26], arrowEdge: [72, 8, 8] },
};

// Blue nation: deep blue field, white chevron at hoist, gold star. Red nation: crimson field, white hoist band, crimson diamond.
export function drawFlag(g, side, x, y, w, h) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (side === 'blue') {
    g.fillStyle = '#2350a0'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f4f1e6';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.5, y + h / 2); g.lineTo(x, y + h); g.closePath(); g.fill();
    g.fillStyle = '#2350a0';
    g.beginPath(); g.moveTo(x, y + h * 0.18); g.lineTo(x + w * 0.36, y + h / 2); g.lineTo(x, y + h * 0.82); g.closePath(); g.fill();
    star(g, x + w * 0.7, y + h * 0.5, h * 0.3, '#f2c43a');
  } else {
    g.fillStyle = '#b01e22'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f4f1e6'; g.fillRect(x, y, w * 0.3, h);
    g.fillStyle = '#b01e22';
    const cx = x + w * 0.15, cy = y + h / 2, r = Math.min(w * 0.11, h * 0.3);
    g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + w * 0.3, y + h * 0.78, w * 0.7, h * 0.22);
  }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = Math.max(0.6, h * 0.06); g.strokeRect(x, y, w, h);
}

export function star(g, cx, cy, r, col) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

const portraitCache = new Map();
// Painted-photo style fictional officer, muted sepia-ish tones like archive photos.
export function portrait(side, seed, size = 96) {
  const key = `${side}:${seed}:${size}`;
  if (portraitCache.has(key)) return portraitCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const r = rng(seed * 7919 + (side === 'red' ? 13 : 3));
  const S = size / 96;
  g.scale(S, S);
  g.save(); g.beginPath(); g.arc(48, 48, 46, 0, Math.PI * 2); g.clip();
  const bg = g.createRadialGradient(40, 30, 6, 48, 48, 60);
  bg.addColorStop(0, side === 'blue' ? '#8a96a8' : '#a89888'); bg.addColorStop(1, side === 'blue' ? '#2c3646' : '#3e2e28');
  g.fillStyle = bg; g.fillRect(0, 0, 96, 96);
  const skins = ['#d9b08c', '#c99a74', '#e3bf9b', '#b8865f', '#d4a47a'];
  const skin = skins[Math.floor(r() * skins.length)];
  const uni = side === 'blue' ? ['#5e6650', '#4d5a6e', '#6a6248'][Math.floor(r() * 3)] : ['#6b5a3a', '#57583a', '#5d4a34'][Math.floor(r() * 3)];
  // shoulders + collar
  g.fillStyle = uni;
  g.beginPath(); g.moveTo(6, 100); g.quadraticCurveTo(10, 70, 30, 66); g.lineTo(66, 66); g.quadraticCurveTo(88, 70, 92, 100); g.fill();
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(36, 66); g.lineTo(48, 84); g.lineTo(60, 66); g.fill();
  g.fillStyle = side === 'blue' ? '#c8c2ae' : '#d8cdb4';
  g.beginPath(); g.moveTo(40, 66); g.lineTo(48, 78); g.lineTo(56, 66); g.fill();
  // collar tabs
  g.fillStyle = side === 'blue' ? '#c9a646' : '#9b2a22';
  g.fillRect(28, 72, 8, 4); g.fillRect(60, 72, 8, 4);
  // neck
  g.fillStyle = shade(skin, -0.18); g.fillRect(41, 54, 14, 14);
  // head
  const hw = 15 + r() * 3, hh = 19 + r() * 2;
  const hg = g.createRadialGradient(43, 38, 3, 48, 42, 22);
  hg.addColorStop(0, shade(skin, 0.12)); hg.addColorStop(1, shade(skin, -0.25));
  g.fillStyle = hg; g.beginPath(); g.ellipse(48, 42, hw, hh, 0, 0, Math.PI * 2); g.fill();
  g.lineWidth = 1.3; g.strokeStyle = 'rgba(40,26,18,.55)'; g.stroke(); // crisp jaw line
  // ears
  g.fillStyle = shade(skin, -0.15);
  g.beginPath(); g.ellipse(48 - hw, 44, 3, 5, 0, 0, Math.PI * 2); g.ellipse(48 + hw, 44, 3, 5, 0, 0, Math.PI * 2); g.fill();
  // eyes + brows
  g.fillStyle = '#2a211c';
  g.beginPath(); g.ellipse(42, 42, 2, 1.4, 0, 0, Math.PI * 2); g.ellipse(54, 42, 2, 1.4, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(40,30,24,.8)'; g.lineWidth = 1.8;
  g.beginPath(); g.moveTo(38, 38 - r()); g.lineTo(45, 37.5); g.moveTo(51, 37.5); g.lineTo(58, 38 - r()); g.stroke();
  // nose + mouth
  g.strokeStyle = shade(skin, -0.35); g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(48, 43); g.lineTo(46.5, 50); g.lineTo(49, 51); g.stroke();
  if (r() < 0.45) { g.fillStyle = '#3b2e26'; g.beginPath(); g.ellipse(48, 54, 6, 1.8, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(70,40,30,.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(44, 57); g.lineTo(52, 57); g.stroke();
  if (r() < 0.3) { g.strokeStyle = '#1e1a18'; g.lineWidth = 1.1; g.beginPath(); g.arc(42, 42, 4, 0, Math.PI * 2); g.arc(54, 42, 4, 0, Math.PI * 2); g.moveTo(46, 42); g.lineTo(50, 42); g.stroke(); }
  // headgear
  const hat = Math.floor(r() * 3);
  const hatCol = side === 'blue' ? shade(uni, 0.05) : shade(uni, 0.08);
  if (hat === 0) { // peaked cap
    g.fillStyle = hatCol; g.beginPath(); g.ellipse(48, 27, 20, 9, 0, Math.PI, 0); g.fill();
    g.fillRect(29, 26, 38, 6);
    g.fillStyle = side === 'blue' ? '#1c1c1c' : '#8e1f1a'; g.fillRect(29, 29, 38, 3);
    g.fillStyle = '#151515'; g.beginPath(); g.ellipse(48, 33, 18, 3.5, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#d8b54a'; g.beginPath(); g.arc(48, 25, 2.6, 0, Math.PI * 2); g.fill();
  } else if (hat === 1) { // field cap
    g.fillStyle = hatCol; g.beginPath(); g.moveTo(30, 32); g.quadraticCurveTo(48, 12, 66, 30); g.lineTo(66, 33); g.lineTo(30, 33); g.fill();
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(30, 31, 36, 2);
    star(g, 48, 26, 3, side === 'blue' ? '#e0c050' : '#c8302a');
  } else { // bare head, short hair
    g.fillStyle = ['#2b241f', '#4a3a2c', '#77706a', '#1c1a18'][Math.floor(r() * 4)];
    g.beginPath(); g.ellipse(48, 30, hw + 0.5, 10, 0, Math.PI, 0); g.fill();
    g.fillRect(48 - hw, 29, 4, 8); g.fillRect(44 + hw, 29, 4, 8);
  }
  // archive-photo grade: warm wash + grain + vignette
  g.globalCompositeOperation = 'color';
  g.fillStyle = side === 'blue' ? 'rgba(120,124,130,.18)' : 'rgba(140,120,100,.18)'; g.fillRect(0, 0, 96, 96);
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.03})`; g.fillRect(r() * 96, r() * 96, 0.6, 0.6); }
  const vg = g.createRadialGradient(48, 44, 26, 48, 48, 50); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.32)');
  g.fillStyle = vg; g.fillRect(0, 0, 96, 96);
  g.restore();
  // ring
  g.lineWidth = 5; g.strokeStyle = SIDE_COL[side].fill; g.beginPath(); g.arc(48, 48, 45, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(48, 48, 47, 0, Math.PI * 2); g.stroke();
  portraitCache.set(key, c);
  return c;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// Side-view ship silhouette (tags) centered at x,y, length L.
export function shipSide(g, x, y, L, col) {
  g.fillStyle = col; g.beginPath();
  g.moveTo(x - L / 2, y); g.lineTo(x + L / 2, y - L * 0.02); g.lineTo(x + L * 0.38, y + L * 0.12); g.lineTo(x - L * 0.42, y + L * 0.12); g.closePath(); g.fill();
  g.fillRect(x - L * 0.12, y - L * 0.14, L * 0.22, L * 0.15);
  g.fillRect(x - L * 0.04, y - L * 0.26, L * 0.06, L * 0.13);
  g.fillRect(x + L * 0.16, y - L * 0.08, L * 0.12, L * 0.08);
  g.fillRect(x - L * 0.34, y - L * 0.08, L * 0.12, L * 0.08);
}

// NATO-style infantry box with a helmet dome on top.
export function armySymbol(g, x, y, w, col) {
  const h = w * 0.62;
  g.strokeStyle = col; g.lineWidth = w * 0.1;
  g.strokeRect(x - w / 2, y - h / 2, w, h);
  g.beginPath(); g.moveTo(x - w / 2, y - h / 2); g.lineTo(x + w / 2, y + h / 2); g.moveTo(x + w / 2, y - h / 2); g.lineTo(x - w / 2, y + h / 2); g.stroke();
}

// Top-down ship for the combat board, bow pointing +x.
export function shipTop(g, x, y, L, col, carrier = false) {
  g.save(); g.translate(x, y);
  g.fillStyle = col;
  g.beginPath(); g.moveTo(L / 2, 0); g.quadraticCurveTo(L * 0.25, -L * 0.11, -L * 0.45, -L * 0.09); g.lineTo(-L / 2, 0); g.lineTo(-L * 0.45, L * 0.09); g.quadraticCurveTo(L * 0.25, L * 0.11, L / 2, 0); g.fill();
  g.fillStyle = 'rgba(0,0,0,.35)';
  if (carrier) { g.fillRect(-L * 0.42, -L * 0.1, L * 0.8, L * 0.2); g.fillStyle = col; g.fillRect(-L * 0.1, -L * 0.14, L * 0.16, L * 0.05); }
  else { g.fillRect(-L * 0.12, -L * 0.04, L * 0.22, L * 0.08); g.beginPath(); g.arc(L * 0.24, 0, L * 0.04, 0, 7); g.arc(-L * 0.28, 0, L * 0.04, 0, 7); g.fill(); }
  g.restore();
}

// Top-down prop fighter silhouette, nose +x (shape follows the library prop fighter: straight wing, twin tailplane).
export function planeTop(g, x, y, L, col, ang = 0) {
  g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col;
  g.beginPath(); g.ellipse(0, 0, L / 2, L * 0.07, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(L * 0.12, 0); g.lineTo(L * 0.02, -L * 0.5); g.lineTo(-L * 0.1, -L * 0.48); g.lineTo(-L * 0.06, 0); g.lineTo(-L * 0.1, L * 0.48); g.lineTo(L * 0.02, L * 0.5); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-L * 0.36, 0); g.lineTo(-L * 0.44, -L * 0.2); g.lineTo(-L * 0.5, -L * 0.19); g.lineTo(-L * 0.46, 0); g.lineTo(-L * 0.5, L * 0.19); g.lineTo(-L * 0.44, L * 0.2); g.closePath(); g.fill();
  g.restore();
}

export function crateIcon(g, x, y, s, col) {
  g.strokeStyle = col; g.lineWidth = s * 0.12; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x, y - s * 0.45); g.lineTo(x + s * 0.42, y - s * 0.22); g.lineTo(x + s * 0.42, y + s * 0.25); g.lineTo(x, y + s * 0.48); g.lineTo(x - s * 0.42, y + s * 0.25); g.lineTo(x - s * 0.42, y - s * 0.22); g.closePath();
  g.moveTo(x - s * 0.42, y - s * 0.22); g.lineTo(x, y); g.lineTo(x + s * 0.42, y - s * 0.22); g.moveTo(x, y); g.lineTo(x, y + s * 0.48); g.stroke();
}

// ---- KG-style thick front arrow along a gentle curve. t in [0,1] = draw-on progress. ----
export function arrowCurve(a, b, bend = 0.14) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  return { a, b, c: { x: mx - dy * bend, y: my + dx * bend } };
}
export function curvePt(cv, t) {
  const u = 1 - t;
  return { x: u * u * cv.a.x + 2 * u * t * cv.c.x + t * t * cv.b.x, y: u * u * cv.a.y + 2 * u * t * cv.c.y + t * t * cv.b.y };
}
export function drawArrow(g, cv, side, t, { width = 30, alpha = 0.9 } = {}) {
  if (t <= 0.01) return;
  const col = SIDE_COL[side];
  const N = 36;
  const len = Math.hypot(cv.b.x - cv.a.x, cv.b.y - cv.a.y);
  const headLen = Math.min(width * 2.3, len * 0.4);
  const tHeadStart = Math.max(0, t - headLen / Math.max(1, len));
  const pts = [];
  for (let i = 0; i <= N; i++) pts.push(curvePt(cv, (tHeadStart * i) / N));
  const tip = curvePt(cv, t);
  const base = pts[pts.length - 1];
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q.x - o.x, dy = q.y - o.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = width / 2 * (0.75 + 0.25 * (i / N)); // slight taper toward the tail
    left.push({ x: p.x - dy * w, y: p.y + dx * w }); right.push({ x: p.x + dy * w, y: p.y - dx * w });
  }
  let hx = tip.x - base.x, hy = tip.y - base.y; const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
  const hw = width * 1.15;
  g.save(); g.globalAlpha = alpha; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(left[0].x, left[0].y);
  left.forEach((p) => g.lineTo(p.x, p.y));
  g.lineTo(base.x - hy * hw, base.y + hx * hw);
  g.lineTo(tip.x, tip.y);
  g.lineTo(base.x + hy * hw, base.y - hx * hw);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i].x, right[i].y);
  g.closePath();
  const [r, gg, b] = col.arrow, [er, eg, eb] = col.arrowEdge;
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = width * 0.5; g.shadowOffsetY = width * 0.12;
  g.fillStyle = `rgb(${r},${gg},${b})`; g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = Math.max(1.5, width * 0.09); g.strokeStyle = `rgb(${er},${eg},${eb})`; g.stroke();
  // inner light sheen line
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.lineWidth = width * 0.16; g.strokeStyle = `rgba(255,255,255,${side === 'blue' ? 0.16 : 0.12})`; g.lineCap = 'round'; g.stroke();
  g.restore();
}

// ---- r3: section kind icons (no words), infantry, bunker ----
export function secIcon(g, kind, x, y, s, col = '#e6ebf0') {
  g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = s * 0.11;
  if (kind === 'beach') {
    // two waves over a sand line
    for (const dy of [-0.18, 0.08]) {
      g.beginPath();
      for (let i = 0; i <= 12; i++) { const px = x - s * 0.42 + (i / 12) * s * 0.84; const py = y + dy * s + Math.sin(i / 12 * Math.PI * 2) * s * 0.07; i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.stroke();
    }
    g.fillStyle = '#d9c48c'; g.beginPath(); g.ellipse(x, y + s * 0.34, s * 0.38, s * 0.08, 0, 0, 7); g.fill();
  } else if (kind === 'port') {
    g.beginPath(); g.arc(x, y - s * 0.3, s * 0.08, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(x, y - s * 0.22); g.lineTo(x, y + s * 0.38); g.moveTo(x - s * 0.18, y - s * 0.1); g.lineTo(x + s * 0.18, y - s * 0.1); g.stroke();
    g.beginPath(); g.arc(x, y + s * 0.05, s * 0.33, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  } else if (kind === 'air') {
    planeTop(g, x, y, s * 0.95, col, -Math.PI / 2);
  } else if (kind === 'ridge') {
    g.beginPath(); g.moveTo(x - s * 0.45, y + s * 0.3); g.lineTo(x - s * 0.12, y - s * 0.3); g.lineTo(x + s * 0.06, y - s * 0.02); g.lineTo(x + s * 0.2, y - s * 0.18); g.lineTo(x + s * 0.45, y + s * 0.3); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(x - s * 0.12, y - s * 0.3); g.lineTo(x - s * 0.02, y + s * 0.3); g.lineTo(x - s * 0.45, y + s * 0.3); g.closePath(); g.fill();
  } else if (kind === 'jungle') {
    g.lineWidth = s * 0.09; g.beginPath(); g.moveTo(x + s * 0.02, y + s * 0.42); g.quadraticCurveTo(x - s * 0.02, y, x + s * 0.06, y - s * 0.2); g.stroke();
    for (const a of [-2.6, -1.9, -1.2, -0.5, 0.2]) {
      g.beginPath(); g.moveTo(x + s * 0.06, y - s * 0.2);
      g.quadraticCurveTo(x + s * 0.06 + Math.cos(a) * s * 0.3, y - s * 0.2 + Math.sin(a) * s * 0.3 - s * 0.08, x + s * 0.06 + Math.cos(a) * s * 0.42, y - s * 0.2 + Math.sin(a) * s * 0.42 + s * 0.06); g.stroke();
    }
  } else if (kind === 'depot') {
    crateIcon(g, x, y, s * 0.8, col);
  } else if (kind === 'hq') {
    star(g, x, y, s * 0.4, '#f2c43a');
  }
  g.restore();
}

// Infantry figure for the land board, facing +x.
export function soldier(g, x, y, H, col = '#d9dee4', dir = 1) {
  g.save(); g.translate(x, y); g.scale(dir, 1); g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round';
  g.beginPath(); g.ellipse(0, -H * 0.36, H * 0.14, H * 0.09, 0, Math.PI, 0); g.fill(); // helmet
  g.fillRect(-H * 0.17, -H * 0.37, H * 0.34, H * 0.03);
  g.beginPath(); g.arc(0, -H * 0.28, H * 0.08, 0, 7); g.fill(); // head
  g.beginPath(); g.moveTo(-H * 0.12, -H * 0.2); g.lineTo(H * 0.12, -H * 0.2); g.lineTo(H * 0.1, H * 0.08); g.lineTo(-H * 0.1, H * 0.08); g.closePath(); g.fill(); // torso
  g.lineWidth = H * 0.08; g.beginPath(); g.moveTo(-H * 0.06, H * 0.06); g.lineTo(-H * 0.14, H * 0.38); g.moveTo(H * 0.06, H * 0.06); g.lineTo(H * 0.16, H * 0.38); g.stroke(); // legs
  g.lineWidth = H * 0.045; g.beginPath(); g.moveTo(-H * 0.08, -H * 0.06); g.lineTo(H * 0.42, -H * 0.2); g.stroke(); // rifle
  g.restore();
}
export function bunker(g, x, y, W, col = '#c9ced4', band) {
  g.save(); g.translate(x, y);
  g.fillStyle = '#6f6a5c'; // sandbags
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(i * W * 0.2, W * 0.2, W * 0.12, W * 0.07, 0, 0, 7); g.fill(); }
  g.fillStyle = col; g.beginPath(); g.moveTo(-W * 0.42, W * 0.16); g.quadraticCurveTo(-W * 0.4, -W * 0.3, 0, -W * 0.32); g.quadraticCurveTo(W * 0.4, -W * 0.3, W * 0.42, W * 0.16); g.closePath(); g.fill();
  g.fillStyle = '#111418'; g.fillRect(-W * 0.24, -W * 0.08, W * 0.48, W * 0.08); // gun slit
  if (band) { g.fillStyle = band; g.fillRect(-W * 0.3, -W * 0.22, W * 0.6, W * 0.06); }
  g.restore();
}
