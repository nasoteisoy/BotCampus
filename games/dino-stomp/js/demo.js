// Copied from move-play/shared/js/demo.js (Move & Play v2). Keep in sync.
// Animated stick-figure demos of each move (canvas, no words). demoFrame() is pure; drawDemo() draws one
// frame anywhere (how-to cards, practice, in-game hints); startDemos() animates every <canvas data-demo="move">.
// Figure units: hips at (0, 0), y down, standing height ~4.2 (head top at about -3.1, feet at +2).
export const MOVES = {
  flap: '🪽', bank: '↩️↪️', reach: '🙌', squat: '⬇️', kick: '🦶', jump: '⬆️', lean: '⬅️➡️',
  dance: '💃', freeze: '🧊', star: '⭐', up: '🙌', tpose: '✈️', oneleg: '🦩', point: '✋', bankL: '↩️', bankR: '↪️',
  // 3D games
  march: '🚶', roar: '🦖', swim: '🏊', leanL: '⬅️', leanR: '➡️', rise: '⬆️', sink: '⬇️',
};
const D = Math.PI / 180;
const tri = (t) => 1 - Math.abs(((t % 2) + 2) % 2 - 1); // 0..1..0 over 2 units
const ease = (k) => k * k * (3 - 2 * k);
/** joints for a move at time t (s) */
export function demoFrame(move, t = 0) {
  let lift = 0, drop = 0, lean = 0, shift = 0, aL = -70, aR = -70, kneeL = 0, kneeR = 0, footL = [-0.35, 2], footR = [0.35, 2], bendL = 0, bendR = 0;
  const k = ease(tri(t * 1.2));
  switch (move) {
    case 'flap': { const f = ease(tri(t * 1.6)); aL = aR = -45 + 95 * f; lift = 0.15 * f; break; }
    case 'bank': { aL = aR = 0; const s = Math.sin(t * 2.2) * 28; aL = s; aR = -s; lean = Math.sin(t * 2.2) * 0.12; break; }
    case 'reach': case 'up': { const kk = move === 'up' ? 1 : k; aL = aR = -70 + 155 * kk; lift = 0.2 * kk; break; }
    case 'squat': { drop = 0.9 * k; aL = aR = -70 + 70 * k; bendL = bendR = k; break; }
    case 'kick': { const kk = ease(tri(t * 1.5)); footR = [0.35 + 1.3 * kk, 2 - 1.2 * kk]; aL = -40; aR = -60; lean = -0.15 * kk; break; }
    case 'jump': { const ph = (t * 0.9) % 1; const air = ph > 0.3 && ph < 0.75 ? Math.sin(((ph - 0.3) / 0.45) * Math.PI) : 0; const pre = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) * 0.5 : 0;
      lift = air * 0.6; drop = pre * 0.5; bendL = bendR = pre + air * 0.4; aL = aR = -70 + air * 110; footL = [-0.35, 2 - lift]; footR = [0.35, 2 - lift]; break; }
    case 'lean': { const s = Math.sin(t * 1.8); shift = s * 0.9; lean = s * 0.35; aL = -60 + s * 20; aR = -60 - s * 20; footL = [-0.35 + shift, 2]; footR = [0.35 + shift, 2]; break; }
    case 'dance': { aL = 40 * Math.sin(t * 6) + 20; aR = 40 * Math.sin(t * 6 + 2.5) + 20; shift = Math.sin(t * 3) * 0.25; lift = Math.abs(Math.sin(t * 6)) * 0.12; break; }
    case 'freeze': { const ph = t % 2.4; if (ph < 1.2) { aL = 40 * Math.sin(t * 6) + 20; aR = 40 * Math.sin(t * 6 + 2.5) + 20; shift = Math.sin(t * 3) * 0.25; } else { aL = 50; aR = -20; shift = Math.sin(1.2 * 3) * 0.25; } break; }
    case 'star': aL = aR = 45; footL = [-1.1, 2]; footR = [1.1, 2]; break;
    case 'tpose': aL = aR = 0; break;
    case 'bankL': case 'bankR': { const dir = move === 'bankR' ? 1 : -1, s = (22 + 8 * Math.sin(t * 3)) * dir; aL = s; aR = -s; lean = 0.1 * dir; break; } // the wing on that side goes down
    case 'oneleg': aL = aR = -40; footR = [0.6, 0.9]; kneeR = 1; break;
    case 'march': { const s = Math.sin(t * 7); const a = Math.max(0, s), b = Math.max(0, -s); footL = [-0.35, 2 - 1.1 * a]; footR = [0.35, 2 - 1.1 * b]; bendL = a * 0.5; bendR = b * 0.5; aL = -70 + 45 * b; aR = -70 + 45 * a; lift = 0.05 * Math.abs(s); break; }
    case 'roar': { const kk = ease(tri(t * 1.1)); aL = aR = -70 + 145 * kk; footL = [-0.6, 2]; footR = [0.6, 2]; lift = 0.1 * kk; break; }
    case 'swim': { aL = 10 + 95 * Math.sin(t * 4.2); aR = 10 + 95 * Math.sin(t * 4.2 + Math.PI); break; }
    case 'leanL': case 'leanR': { const dir = move === 'leanR' ? 1 : -1, s = dir * (0.6 + 0.3 * ease(tri(t * 1.4))); shift = s * 0.5; lean = s * 0.4; aL = -60 + dir * 15; aR = -60 - dir * 15; footL = [-0.35 + shift * 0.6, 2]; footR = [0.35 + shift * 0.6, 2]; break; }
    case 'rise': { aL = aR = 90 + 10 * Math.sin(t * 3); lift = 0.1 * ease(tri(t)); break; }
    case 'sink': { drop = 0.9 * k; aL = aR = -40 + 40 * k; bendL = bendR = k; break; }
    case 'point': { aL = -70; aR = 30 + 35 * Math.sin(t * 2); break; }
    default: break;
  }
  const hip = { x: shift, y: -lift + drop };
  const sh = { x: shift + lean * 1.5, y: hip.y - 1.6 };
  const head = { x: sh.x + lean * 0.4, y: sh.y - 0.75 };
  const arm = (side, a) => { const r = a * D, s = { x: sh.x + side * 0.45, y: sh.y };
    const e = { x: s.x + side * Math.cos(r) * 0.75, y: s.y - Math.sin(r) * 0.75 }; const w = { x: s.x + side * Math.cos(r) * 1.5, y: s.y - Math.sin(r) * 1.5 }; return [s, e, w]; };
  const leg = (side, foot, bend, kneeUp) => { const h = { x: hip.x + side * 0.3, y: hip.y }; const f = { x: foot[0] + (move === 'lean' || move === 'dance' ? 0 : shift * 0.3), y: foot[1] - (move === 'jump' ? 0 : 0) };
    const m = { x: (h.x + f.x) / 2 + side * bend * 0.55 + (kneeUp ? side * 0.4 : 0), y: (h.y + f.y) / 2 - (kneeUp ? 0.2 : 0) }; return [h, m, f]; };
  return { head, sh, hip, armL: arm(-1, aL), armR: arm(1, aR), legL: leg(-1, footL, bendL, kneeL), legR: leg(1, footR, bendR, kneeR) };
}
/** draw a demo figure: (cx, cy) = hip point, size = px per unit */
export function drawDemo(c, move, t, cx, cy, size, color = '#fff', { glow = true, alpha = 1 } = {}) {
  const j = demoFrame(move, t), X = (p) => cx + p.x * size, Y = (p) => cy + p.y * size;
  c.save(); c.globalAlpha = alpha; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(X(j.sh), Y(j.sh)); c.lineTo(X(j.hip), Y(j.hip));
  for (const limb of [j.armL, j.armR, j.legL, j.legR]) { c.moveTo(X(limb[0]), Y(limb[0])); c.lineTo(X(limb[1]), Y(limb[1])); c.lineTo(X(limb[2]), Y(limb[2])); }
  c.moveTo(X(j.armL[0]), Y(j.armL[0])); c.lineTo(X(j.armR[0]), Y(j.armR[0]));
  if (glow) { c.strokeStyle = color; c.globalAlpha = alpha * 0.25; c.lineWidth = size * 0.75; c.stroke(); c.globalAlpha = alpha; }
  c.strokeStyle = color; c.lineWidth = Math.max(2, size * 0.32); c.stroke();
  c.fillStyle = color; c.beginPath(); c.arc(X(j.head), Y(j.head), size * 0.48, 0, 7); c.fill();
  c.restore();
}
/** Animate every canvas[data-demo] under root (one rAF loop; paused ones = canvas.dataset.paused === '1'). */
export function startDemos(root = document, color) {
  const t0 = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    for (const cv of root.querySelectorAll('canvas[data-demo]')) {
      // hidden (display none / visibility hidden / faded out to opacity 0): don't spend frames on it
      if (cv.checkVisibility ? !cv.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !cv.offsetParent && cv.style.position !== 'fixed') continue;
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) continue;
      const d = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(w * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
      const paused = cv.dataset.paused === '1';
      const t = paused ? 0.6 : (now - t0) / 1000;
      const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, w, h);
      const size = Math.min(w / 4.2, h / 6.4);
      drawDemo(c, cv.dataset.demo, t, w / 2, h * 0.6, size, cv.dataset.color || color || getComputedStyle(cv).color || '#fff');
    }
  }
  requestAnimationFrame(frame);
}
