// Dust Ridge: small 3-post map. 200 x 120 m, x = west(-)..east(+), z = north(-)..south(+).
// Pure data + helpers (no three.js), shared by the sim and the renderer.
export const MAP = {
  name: 'Dust Ridge',
  hx: 100, hz: 60,
  posts: [
    { id: 'A', x: -72, z: 8, owner: 0, value: 1 },    // blue home
    { id: 'B', x: 0, z: 0, owner: -1, value: 2 },     // middle (neutral), worth more bleed
    { id: 'C', x: 72, z: -8, owner: 1, value: 1 },    // red home
  ],
  postR: 9,
  hills: [
    { x: 4, z: -34, r: 30, h: 7 },     // the ridge north of B
    { x: -34, z: 36, r: 18, h: 3 },
    { x: 40, z: 38, r: 16, h: 2.5 },
  ],
  // walls: axis-aligned boxes {x,z,hx,hz,h}
  walls: [
    { x: -3, z: -11, hx: 5, hz: 0.5, h: 1.4 }, { x: 3, z: 11, hx: 5, hz: 0.5, h: 1.4 },
    { x: -12, z: 2, hx: 0.5, hz: 4, h: 1.4 }, { x: 12, z: -2, hx: 0.5, hz: 4, h: 1.4 },
    { x: -38, z: -4, hx: 6, hz: 0.5, h: 1.6 }, { x: 38, z: 4, hx: 6, hz: 0.5, h: 1.6 },
    { x: -60, z: -6, hx: 0.5, hz: 5, h: 1.6 }, { x: 60, z: 6, hx: 0.5, hz: 5, h: 1.6 },
    { x: -82, z: 22, hx: 5, hz: 0.5, h: 1.6 }, { x: 82, z: -22, hx: 5, hz: 0.5, h: 1.6 },
  ],
  rocks: [],
};
// rocks: deterministic scatter, kept away from posts + walls, mirrored for fairness
{
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const far = (x, z) => MAP.posts.every((p) => Math.hypot(p.x - x, p.z - z) > MAP.postR + 5) && MAP.walls.every((w) => Math.abs(w.x - x) > w.hx + 4 || Math.abs(w.z - z) > w.hz + 4);
  let tries = 0;
  while (MAP.rocks.length < 28 && tries++ < 500) {
    const x = (rnd() * 2 - 1) * 90, z = (rnd() * 2 - 1) * 52, r = 1.2 + rnd() * 2.4;
    if (!far(x, z) || !far(-x, -z) || Math.abs(x) < 6) continue;
    if (MAP.rocks.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 5)) continue;
    MAP.rocks.push({ x, z, r }, { x: -x, z: -z, r });
  }
}
// big landmark rocks on the ridge
MAP.rocks.push({ x: -8, z: -30, r: 3.5 }, { x: 16, z: -38, r: 3 }, { x: 2, z: -22, r: 2.2 });

export function heightAt(x, z) {
  let h = 0;
  for (const H of MAP.hills) { const d = Math.hypot(x - H.x, z - H.z) / H.r; if (d < 1) h += H.h * (0.5 + 0.5 * Math.cos(Math.PI * d)); }
  return h + 0.25 * Math.sin(x * 0.11) * Math.cos(z * 0.13);
}

// signed distance to the nearest solid thing (rock or wall); < 0 inside
export function solidDist(x, z) {
  let d = Infinity;
  for (const r of MAP.rocks) d = Math.min(d, Math.hypot(x - r.x, z - r.z) - r.r);
  for (const w of MAP.walls) { const dx = Math.abs(x - w.x) - w.hx, dz = Math.abs(z - w.z) - w.hz; d = Math.min(d, Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0)); }
  return d;
}

// line of fire: blocked by walls and rocks (segment vs circle / box)
export function lineClear(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1e-6;
  for (const r of MAP.rocks) {
    const t = Math.max(0, Math.min(1, ((r.x - x0) * dx + (r.z - z0) * dz) / L2));
    const px = x0 + dx * t - r.x, pz = z0 + dz * t - r.z;
    if (px * px + pz * pz < r.r * r.r * 0.8) return false;
  }
  for (const w of MAP.walls) { // slab test
    let t0 = 0, t1 = 1;
    for (const [o, d, c, h] of [[x0, dx, w.x, w.hx], [z0, dz, w.z, w.hz]]) {
      if (Math.abs(d) < 1e-9) { if (o < c - h || o > c + h) { t0 = 2; break; } continue; }
      let a = (c - h - o) / d, b = (c + h - o) / d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 > 0.02 && t0 < 0.98) return false;
  }
  return true;
}
