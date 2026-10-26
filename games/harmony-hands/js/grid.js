// Hand point -> quadrant with anti-flicker: a centre "hold" circle, a border margin and a dwell time.
// Coordinates are normalised display coords (already mirrored): x 0..1 left->right, y 0..1 top->bottom.
export const QUAD = { TL: 0, TR: 1, BL: 2, BR: 3 };
export const rawQuad = (x, y) => (x >= 0.5 ? 1 : 0) + (y >= 0.5 ? 2 : 0);

export class QuadTracker {
  constructor({ margin = 0.04, dwellMs = 110, holdR = 0.11, aspect = 16 / 9 } = {}) {
    Object.assign(this, { margin, dwellMs, holdR, aspect });
    this.current = -1; this.cand = -1; this.candT = 0;
  }
  /** true when the point is inside the centre hold circle (circle in screen space, radius as fraction of height) */
  inHold(x, y) {
    const dx = (x - 0.5) * this.aspect, dy = y - 0.5;
    return Math.hypot(dx, dy) < this.holdR;
  }
  /** returns the active quadrant (or -1 before the first one). p = {x,y} or null (no hand: keep chord). */
  update(p, t) {
    if (!p || this.inHold(p.x, p.y)) { this.cand = -1; return this.current; }
    const q = rawQuad(p.x, p.y);
    if (q === this.current) { this.cand = -1; return this.current; }
    if (this.current >= 0) {
      const colChanged = (q & 1) !== (this.current & 1), rowChanged = (q & 2) !== (this.current & 2);
      if (colChanged && Math.abs(p.x - 0.5) < this.margin) return this.current;
      if (rowChanged && Math.abs(p.y - 0.5) < this.margin) return this.current;
    }
    if (q !== this.cand) { this.cand = q; this.candT = t; }
    if (t - this.candT >= this.dwellMs) { this.current = q; this.cand = -1; }
    return this.current;
  }
  set(q) { this.current = q; this.cand = -1; }
}
