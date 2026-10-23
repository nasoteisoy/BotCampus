// Pure Bubble Pop logic (no DOM). Unit-tested in move-play/test/unit.mjs.
/** distance from point (px,py) to segment a-b */
export function segDist(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}
/**
 * Which bubbles get popped this frame?
 * @param bubbles [{x,y,r,dead?}] screen px
 * @param touches [{x,y,px?,py?,slot}] screen px; (px,py) = previous position, so a fast swipe through a bubble still counts
 * @param pad extra forgiving radius in px (kids' hands are fast and the tracker lags)
 * @param minSpeed touches with .speed (px/s) below this can't pop 'float' bubbles, below 35 % can't pop specials (taps have no speed)
 * @returns [{i, slot}] one entry per popped bubble (first toucher wins, nearest if several)
 */
export function hitTest(bubbles, touches, pad = 0, minSpeed = 0) {
  const out = [];
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i]; if (b.dead || b.age < 0.25) continue; // brand-new bubbles can't pop instantly
    let best = null, bd = Infinity;
    for (const t of touches) {
      // bubbles need a moving hand/foot (no points for standing still); special ⭐/🐸 bubbles appear right
      // next to you, so they only need a gentle move (35 % of the float speed)
      const need = b.kind === 'float' ? minSpeed : minSpeed * 0.35;
      if (need && t.speed != null && t.speed < need) continue;
      const d = t.px != null ? segDist(t.px, t.py, t.x, t.y, b.x, b.y) : Math.hypot(t.x - b.x, t.y - b.y);
      if (d <= b.r + pad && d < bd) { bd = d; best = t; }
    }
    if (best) out.push({ i, slot: best.slot });
  }
  return out;
}
/** Where to put a "reach up" bubble for a player: above their head (needs arms up) */
export function highSpot(body, map, H) {
  const y = map.y(body.head.y) - body.torso * map.dh * 0.75;
  return { x: map.x(body.sh.x), y: Math.max(H * 0.1, y) };
}
/** Where to put a "squat / kick" bubble: about knee height (hands need a squat, feet can kick) */
export function lowSpot(body, map, H) {
  const k = body.p.lk && body.p.rk ? (body.p.lk.y + body.p.rk.y) / 2 : body.hip ? body.hip.y + body.torso * 0.55 : body.sh.y + body.torso * 1.5;
  return { x: map.x(body.hip ? body.hip.x : body.sh.x), y: Math.min(H * 0.93, map.y(k)) };
}
/** stars for a score: thresholds shrink with more players (they share the bubbles) */
export function starsFor(score, nPlayers = 1) {
  const k = nPlayers <= 1 ? 1 : nPlayers === 2 ? 0.6 : 0.45;
  return score >= 75 * k ? 3 : score >= 30 * k ? 2 : score >= 1 ? 1 : 0; // playtest: waving on the spot ≈ 50 solo → 2⭐, chasing bubbles ≈ 125 → 3⭐
}
export const POINTS = { float: 1, high: 3, low: 2 };
