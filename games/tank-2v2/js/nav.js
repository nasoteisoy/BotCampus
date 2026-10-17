// Grid A* with line-of-sight smoothing. Obstacles are inflated by the tank radius.
import { obstacles, sdObs, HALF } from './map.js';

export class NavGrid {
  constructor(cell = 1.5, inflate = 2.6) {
    this.cell = cell; this.n = Math.ceil(HALF * 2 / cell); this.inflate = inflate;
    const N = this.n * this.n;
    this.blocked = new Uint8Array(N);
    this.g = new Float32Array(N); this.f = new Float32Array(N);
    this.parent = new Int32Array(N); this.state = new Uint8Array(N);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      const [x, z] = this.center(i, j);
      let b = Math.abs(x) > HALF - inflate || Math.abs(z) > HALF - inflate;
      if (!b) for (const o of obstacles) if (sdObs(o, x, z) < inflate) { b = true; break; }
      this.blocked[j * this.n + i] = b ? 1 : 0;
    }
  }
  center(i, j) { return [-HALF + (i + .5) * this.cell, -HALF + (j + .5) * this.cell]; }
  cellOf(x, z) {
    const i = Math.min(this.n - 1, Math.max(0, Math.floor((x + HALF) / this.cell)));
    const j = Math.min(this.n - 1, Math.max(0, Math.floor((z + HALF) / this.cell)));
    return [i, j];
  }
  blockedAt(x, z) { const [i, j] = this.cellOf(x, z); return this.blocked[j * this.n + i] === 1; }
  nearestFree(i, j) {
    if (!this.blocked[j * this.n + i]) return [i, j];
    for (let r = 1; r < this.n; r++) {
      let best = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= this.n || b >= this.n || this.blocked[b * this.n + a]) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = [a, b]; }
      }
      if (best) return best;
    }
    return [i, j];
  }
  los(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(len / (this.cell * .4)));
    for (let k = 0; k <= steps; k++) { const t = k / steps; if (this.blockedAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; }
    return true;
  }
  // Snap a world point to the nearest walkable point.
  freePoint(x, z) {
    if (!this.blockedAt(x, z)) return [x, z];
    const [i, j] = this.nearestFree(...this.cellOf(x, z)); return this.center(i, j);
  }
  findPath(sx, sz, gx, gz) {
    [gx, gz] = this.freePoint(gx, gz);
    const startBlocked = this.blockedAt(sx, sz);
    if (!startBlocked && this.los(sx, sz, gx, gz)) return [{ x: gx, z: gz }];
    const n = this.n;
    const [si, sj] = this.nearestFree(...this.cellOf(sx, sz));
    const [ti, tj] = this.nearestFree(...this.cellOf(gx, gz));
    const S = sj * n + si, T = tj * n + ti;
    this.state.fill(0);
    const heap = [S]; this.g[S] = 0; this.f[S] = 0; this.parent[S] = -1; this.state[S] = 1;
    const h = (i, j) => { const dx = Math.abs(i - ti), dy = Math.abs(j - tj); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    const push = (v) => { heap.push(v); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (this.f[heap[p]] <= this.f[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && this.f[heap[l]] < this.f[heap[m]]) m = l; if (r < heap.length && this.f[heap[r]] < this.f[heap[m]]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    let found = false;
    while (heap.length) {
      const cur = pop(); if (this.state[cur] === 2) continue; this.state[cur] = 2;
      if (cur === T) { found = true; break; }
      const ci = cur % n, cj = (cur / n) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const v = b * n + a; if (this.blocked[v] || this.state[v] === 2) continue;
        if (di && dj && (this.blocked[cj * n + a] || this.blocked[b * n + ci])) continue; // no corner cutting
        const ng = this.g[cur] + (di && dj ? Math.SQRT2 : 1);
        if (this.state[v] === 1 && ng >= this.g[v]) continue;
        this.g[v] = ng; this.f[v] = ng + h(a, b); this.parent[v] = cur; this.state[v] = 1; push(v);
      }
    }
    if (!found) return [{ x: gx, z: gz }];
    const cells = []; for (let c = T; c !== -1; c = this.parent[c]) cells.push(this.center(c % n, (c / n) | 0));
    cells.reverse(); cells[cells.length - 1] = [gx, gz];
    // string pulling
    const out = []; let ax = sx, az = sz, k = 0;
    if (startBlocked) { out.push({ x: cells[0][0], z: cells[0][1] }); [ax, az] = cells[0]; }
    while (k < cells.length - 1) {
      let far = k + 1;
      for (let m = cells.length - 1; m > k + 1; m--) if (this.los(ax, az, cells[m][0], cells[m][1])) { far = m; break; }
      out.push({ x: cells[far][0], z: cells[far][1] }); [ax, az] = cells[far]; k = far;
    }
    if (!out.length) out.push({ x: gx, z: gz });
    return out;
  }
}
