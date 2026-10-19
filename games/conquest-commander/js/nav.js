// Grid A* over the map (2 m cells), obstacles inflated by unit radius. Paths are LOS-smoothed.
import { MAP, solidDist } from './map.js';

export class Nav {
  constructor(cell = 2, inflate = 1.1) {
    this.cell = cell; this.nx = Math.ceil(MAP.hx * 2 / cell); this.nz = Math.ceil(MAP.hz * 2 / cell);
    const N = this.nx * this.nz;
    this.blocked = new Uint8Array(N); this.g = new Float32Array(N); this.f = new Float32Array(N);
    this.parent = new Int32Array(N); this.state = new Uint8Array(N);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const [x, z] = this.center(i, j);
      this.blocked[j * this.nx + i] = (Math.abs(x) > MAP.hx - 2 || Math.abs(z) > MAP.hz - 2 || solidDist(x, z) < inflate) ? 1 : 0;
    }
  }
  center(i, j) { return [-MAP.hx + (i + 0.5) * this.cell, -MAP.hz + (j + 0.5) * this.cell]; }
  cellOf(x, z) { return [Math.min(this.nx - 1, Math.max(0, Math.floor((x + MAP.hx) / this.cell))), Math.min(this.nz - 1, Math.max(0, Math.floor((z + MAP.hz) / this.cell)))]; }
  blockedAt(x, z) { const [i, j] = this.cellOf(x, z); return this.blocked[j * this.nx + i] === 1; }
  nearestFree(i, j) {
    if (!this.blocked[j * this.nx + i]) return [i, j];
    for (let r = 1; r < 30; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < this.nx && b < this.nz && !this.blocked[b * this.nx + a]) return [a, b];
    }
    return [i, j];
  }
  freePoint(x, z) { if (!this.blockedAt(x, z)) return [x, z]; const [i, j] = this.nearestFree(...this.cellOf(x, z)); return this.center(i, j); }
  los(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(len / (this.cell * 0.45)));
    for (let k = 0; k <= steps; k++) { const t = k / steps; if (this.blockedAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; }
    return true;
  }
  findPath(sx, sz, gx, gz) {
    [gx, gz] = this.freePoint(gx, gz);
    if (!this.blockedAt(sx, sz) && this.los(sx, sz, gx, gz)) return [{ x: gx, z: gz }];
    const nx = this.nx, [si, sj] = this.nearestFree(...this.cellOf(sx, sz)), [ti, tj] = this.nearestFree(...this.cellOf(gx, gz));
    const S = sj * nx + si, T = tj * nx + ti, f = this.f, g = this.g;
    this.state.fill(0);
    const heap = [S]; g[S] = 0; f[S] = 0; this.parent[S] = -1; this.state[S] = 1;
    const h = (i, j) => { const dx = Math.abs(i - ti), dy = Math.abs(j - tj); return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    const push = (v) => { heap.push(v); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (f[heap[p]] <= f[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    let found = false;
    while (heap.length) {
      const cur = pop(); if (this.state[cur] === 2) continue; this.state[cur] = 2;
      if (cur === T) { found = true; break; }
      const ci = cur % nx, cj = (cur / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= nx || b >= this.nz) continue;
        const v = b * nx + a; if (this.blocked[v] || this.state[v] === 2) continue;
        if (di && dj && (this.blocked[cj * nx + a] || this.blocked[b * nx + ci])) continue;
        const ng = g[cur] + (di && dj ? Math.SQRT2 : 1);
        if (this.state[v] === 1 && ng >= g[v]) continue;
        g[v] = ng; f[v] = ng + h(a, b); this.parent[v] = cur; this.state[v] = 1; push(v);
      }
    }
    if (!found) return [{ x: gx, z: gz }];
    const cells = []; for (let c = T; c !== -1; c = this.parent[c]) cells.push(this.center(c % nx, (c / nx) | 0));
    cells.reverse(); cells[cells.length - 1] = [gx, gz];
    const out = []; let ax = sx, az = sz, k = -1;
    while (k < cells.length - 1) {
      let far = k + 1;
      for (let m = Math.min(cells.length - 1, k + 50); m > k + 1; m--) if (this.los(ax, az, cells[m][0], cells[m][1])) { far = m; break; }
      out.push({ x: cells[far][0], z: cells[far][1] }); [ax, az] = cells[far]; k = far;
    }
    return out;
  }
}
