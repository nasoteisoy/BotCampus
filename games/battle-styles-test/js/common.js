// Shared bits for the five battle-style demos: the one fight they all show, unit art on canvas, HiDPI canvas,
// die faces, sounds, floating numbers. Art comes from the Island Front r9 art.js copy (soldier, bunker, ships, planes,
// NATO unit glyphs, flags); the side-view tank / gun / AA / plane below are flat shapes in that same style.
import { SIDE_COL, soldier, bunker, shipSide, shipTop, planeTop, unitGlyph, drawFlag, secIcon, star } from './art.js';
export { SIDE_COL, soldier, bunker, shipSide, shipTop, planeTop, unitGlyph, drawFlag, secIcon, star };

// The same fight in every tab: Blue lands a regiment with ship + plane support on Red's ridge above a beach.
export const FIGHT = {
  blue: ['inf', 'inf', 'armor', 'art', 'ship', 'plane'],
  red: ['inf', 'inf', 'inf', 'aa', 'fort'],
};
export const NAME = { inf: 'Infantry', armor: 'Armor', art: 'Artillery', aa: 'AA gun', fort: 'Fort', ship: 'Battleship', plane: 'Bomber' };
// svg icon type for a unit (icons.js UNIT_PATHS)
export const ICO = { inf: 'inf', armor: 'armor', art: 'art', aa: 'aa', fort: 'fort', ship: 'bb', plane: 'bomber' };

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// canvas that fills its box at device pixel ratio; returns { cv, g, W, H, fit() } (W/H in CSS px)
export function hiCanvas(box) {
  const cv = document.createElement('canvas'); cv.className = 'stage-cv'; box.appendChild(cv);
  const o = { cv, g: cv.getContext('2d'), W: 0, H: 0 };
  o.fit = () => {
    const r = box.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    o.W = Math.max(1, r.width); o.H = Math.max(1, r.height);
    cv.width = Math.round(o.W * d); cv.height = Math.round(o.H * d); cv.style.width = `${o.W}px`; cv.style.height = `${o.H}px`;
    o.g.setTransform(d, 0, 0, d, 0, 0);
  };
  o.fit();
  return o;
}
// pointer position in CSS px inside the canvas
export const ptr = (cv, e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

// ---- side views (face +x when dir = 1) ----
export function tankSide(g, x, y, L, col, dir = 1) {
  g.save(); g.translate(x, y); g.scale(dir, 1);
  g.fillStyle = '#2a2f36'; g.beginPath(); g.roundRect(-L * 0.5, -L * 0.02, L, L * 0.2, L * 0.1); g.fill(); // tracks
  g.fillStyle = '#8a929c'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-L * 0.38 + i * L * 0.19, L * 0.08, L * 0.055, 0, 7); g.fill(); }
  g.fillStyle = col; g.beginPath(); g.moveTo(-L * 0.48, 0); g.lineTo(-L * 0.42, -L * 0.16); g.lineTo(L * 0.44, -L * 0.16); g.lineTo(L * 0.5, 0); g.closePath(); g.fill(); // hull
  g.beginPath(); g.roundRect(-L * 0.2, -L * 0.32, L * 0.38, L * 0.17, L * 0.06); g.fill(); // turret
  g.fillRect(L * 0.16, -L * 0.27, L * 0.46, L * 0.055); // gun
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-L * 0.42, -L * 0.16, L * 0.86, L * 0.03);
  g.restore();
}
export function gunSide(g, x, y, L, col, dir = 1, elev = 0.45) {
  g.save(); g.translate(x, y); g.scale(dir, 1);
  g.fillStyle = col; g.save(); g.translate(0, -L * 0.18); g.rotate(-elev); g.fillRect(-L * 0.1, -L * 0.05, L * 0.62, L * 0.1); g.restore(); // barrel
  g.beginPath(); g.moveTo(-L * 0.46, L * 0.12); g.lineTo(0, -L * 0.16); g.lineTo(L * 0.08, -L * 0.1); g.lineTo(-L * 0.36, L * 0.16); g.closePath(); g.fill(); // trail
  g.fillRect(-L * 0.14, -L * 0.28, L * 0.26, L * 0.2); // shield
  g.fillStyle = '#2a2f36'; g.beginPath(); g.arc(0, L * 0.04, L * 0.15, 0, 7); g.fill(); g.fillStyle = '#8a929c'; g.beginPath(); g.arc(0, L * 0.04, L * 0.05, 0, 7); g.fill();
  g.restore();
}
export function aaSide(g, x, y, L, col, dir = 1) {
  g.save(); g.translate(x, y); g.scale(dir, 1); g.fillStyle = col;
  g.beginPath(); g.moveTo(-L * 0.4, L * 0.15); g.lineTo(L * 0.4, L * 0.15); g.lineTo(L * 0.28, -L * 0.05); g.lineTo(-L * 0.28, -L * 0.05); g.closePath(); g.fill();
  g.save(); g.translate(0, -L * 0.08); g.rotate(-1.05); g.fillRect(0, -L * 0.11, L * 0.55, L * 0.06); g.fillRect(0, L * 0.03, L * 0.55, L * 0.06); g.restore();
  g.beginPath(); g.arc(0, -L * 0.08, L * 0.12, 0, 7); g.fill();
  g.restore();
}
export function planeSide(g, x, y, L, col, dir = 1) {
  g.save(); g.translate(x, y); g.scale(dir, 1); g.fillStyle = col;
  g.beginPath(); g.ellipse(0, 0, L * 0.5, L * 0.09, 0, 0, 7); g.fill(); // body
  g.beginPath(); g.moveTo(-L * 0.36, 0); g.lineTo(-L * 0.5, -L * 0.24); g.lineTo(-L * 0.42, -L * 0.24); g.lineTo(-L * 0.24, -L * 0.02); g.closePath(); g.fill(); // tail fin
  g.beginPath(); g.ellipse(L * 0.04, L * 0.03, L * 0.24, L * 0.045, 0.08, 0, 7); g.fill(); // wing
  g.fillStyle = 'rgba(190,225,255,.85)'; g.beginPath(); g.ellipse(L * 0.16, -L * 0.07, L * 0.1, L * 0.05, 0, Math.PI, 0); g.fill(); // canopy
  g.fillStyle = '#ddd'; g.fillRect(L * 0.5, -L * 0.14, L * 0.02, L * 0.28); // prop
  g.restore();
}
// a unit drawn as a side-view figure (lane / cut-in / HOI frontline)
export function unitSide(g, type, x, y, L, side, dir) {
  const col = side === 'blue' ? '#9fbbe8' : '#e3a39b';
  if (type === 'inf') soldier(g, x, y, L, col, dir);
  else if (type === 'armor') tankSide(g, x, y + L * 0.1, L * 1.1, side === 'blue' ? '#5d79a8' : '#9c4a43', dir);
  else if (type === 'art') gunSide(g, x, y + L * 0.12, L, side === 'blue' ? '#6d84a8' : '#9c5a52', dir);
  else if (type === 'aa') aaSide(g, x, y + L * 0.1, L, side === 'blue' ? '#6d84a8' : '#a05a50', dir);
  else if (type === 'fort') bunker(g, x, y, L * 1.2, '#b9b2a2', SIDE_COL[side].fill);
  else if (type === 'ship') shipSide(g, x, y, L * 1.6, side === 'blue' ? '#7d93b8' : '#a06a62');
  else if (type === 'plane') planeSide(g, x, y, L * 1.2, side === 'blue' ? '#7f9fd6' : '#d08a80', dir);
}
// a map token: side-coloured disc + white NATO glyph (or ship / plane / fort shape)
export function token(g, type, x, y, r, side, { dim = false, ring = null } = {}) {
  g.save(); if (dim) g.globalAlpha = 0.35;
  g.fillStyle = SIDE_COL[side].fill; g.strokeStyle = ring || SIDE_COL[side].light; g.lineWidth = ring ? Math.max(3, r * 0.16) : Math.max(1.5, r * 0.09);
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
  if (type === 'ship') shipTop(g, x, y, r * 1.55, '#eef2f6');
  else if (type === 'plane') planeTop(g, x, y, r * 1.45, '#eef2f6', -Math.PI / 2);
  else if (type === 'fort') bunker(g, x, y + r * 0.1, r * 1.3, '#e6e1d4');
  else unitGlyph(g, type, x, y, r * 1.25, '#fff', 2.4);
  g.restore();
}
export function hpBadge(g, x, y, n, side, s = 11) {
  g.save(); g.fillStyle = '#0d1118'; g.strokeStyle = side === 'blue' ? '#8fb4ff' : '#ff9b8f'; g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = `900 ${Math.round(s * 1.35)}px "Barlow Condensed", Arial Narrow, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), x, y + 1);
  g.restore();
}
// die face as svg (pips), value 1-6
export function dieSvg(v, size = 34, hit = false) {
  const P = { 1: [[12, 12]], 2: [[7, 7], [17, 17]], 3: [[7, 7], [12, 12], [17, 17]], 4: [[7, 7], [17, 7], [7, 17], [17, 17]], 5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]], 6: [[7, 6], [17, 6], [7, 12], [17, 12], [7, 18], [17, 18]] }[v] || [];
  return `<svg class="die${hit ? ' hit' : ''}" width="${size}" height="${size}" viewBox="0 0 24 24"><rect x="1.5" y="1.5" width="21" height="21" rx="4.5"/>${P.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="2.2"/>`).join('')}</svg>`;
}
// floating numbers / words on a canvas: list of {x,y,txt,col,t0}
export function drawFloats(g, list, now) {
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i], k = (now - f.t0) / 1100; if (k >= 1) { list.splice(i, 1); continue; }
    g.save(); g.globalAlpha = 1 - k * k; g.font = `900 ${f.size || 22}px "Barlow Condensed", Arial Narrow, sans-serif`; g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(f.txt, f.x, f.y - k * 34); g.fillStyle = f.col || '#fff'; g.fillText(f.txt, f.x, f.y - k * 34); g.restore();
  }
}
export function boom(g, x, y, r, k) { // k 0..1
  g.save(); g.globalAlpha = 1 - k; g.fillStyle = k < 0.3 ? '#fff3c4' : '#ff9a3c';
  g.beginPath(); g.arc(x, y, r * (0.4 + k), 0, 7); g.fill();
  g.globalAlpha = (1 - k) * 0.6; g.fillStyle = '#555'; g.beginPath(); g.arc(x + r * 0.3 * k, y - r * k, r * 0.6 * (0.5 + k), 0, 7); g.fill(); g.restore();
}

// tiny WebAudio blips (no files); unlocked by the first tap
let ac = null;
export function sfx(kind) {
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), v = ac.createGain(), t = ac.currentTime;
    const P = { tap: [520, 0.05, 'square', 0.04], hit: [140, 0.18, 'sawtooth', 0.09], roll: [300, 0.08, 'triangle', 0.06], win: [660, 0.5, 'triangle', 0.08], lose: [110, 0.6, 'sine', 0.1], shot: [220, 0.07, 'square', 0.05] }[kind] || [400, 0.05, 'sine', 0.04];
    o.type = P[2]; o.frequency.setValueAtTime(P[0], t); if (kind === 'win') o.frequency.linearRampToValueAtTime(990, t + P[1]); if (kind === 'lose' || kind === 'hit') o.frequency.exponentialRampToValueAtTime(P[0] * 0.5, t + P[1]);
    v.gain.setValueAtTime(P[3], t); v.gain.exponentialRampToValueAtTime(0.0001, t + P[1]);
    o.connect(v).connect(ac.destination); o.start(t); o.stop(t + P[1] + 0.02);
  } catch (e) { /* no audio */ }
}
// requestAnimationFrame loop that stops when the tab unmounts
export function loop(fn) {
  let on = true, last = performance.now();
  const step = (now) => { if (!on) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; fn(dt, now); requestAnimationFrame(step); };
  requestAnimationFrame(step);
  return () => { on = false; };
}
