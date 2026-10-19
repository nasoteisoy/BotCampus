// Space-era tank: same RTS rules as the trooper (primitives only, 2 shared materials, nation atlas colors).
import * as THREE from 'three';
import { Builder, M, box, cyl, sph, HALF } from './trooper.js?v=3';

export const TANK_FIELDS = [['hull', 3], ['drive', 2], ['turret', 3], ['gun', 4], ['antenna', 2], ['skirts', 2], ['smoke', 2], ['mg', 2], ['pennant', 2]];
export const TANK_DEFAULT = Object.freeze({ hull: 1, drive: 0, turret: 0, gun: 0, antenna: 1, skirts: 0, smoke: 0, mg: 0, pennant: 1 });
const TZ = -0.15; // turret yaw axis (static so it can be a bone pivot)
export const TANK_PIVOT = { base: [0, 0, 0], hull: [0, 0, 0], turret: [0, 1, TZ] };
export const TANK_PARENT = { base: null, hull: null, turret: 'hull' };

export function buildTankParts(st) {
  const b = new Builder();
  const k = [0.85, 1, 1.15][st.hull], L = 3.0 * k, W = 1.8 * k, H = 0.5 * k;
  const hover = st.drive === 1, tw = 0.42 * k, th = 0.55 * k, tx = W / 2 - tw / 2;
  // ----- drive -----
  b.bone = 'base';
  let y0;
  if (!hover) {
    for (const sx of [1, -1]) {
      b.add(box(tw, th * 0.64, L * 0.84), 'D', M(sx * tx, th / 2 + 0.01, 0));
      for (const sz of [1, -1]) b.add(cyl(th / 2, th / 2, tw, 8), 'D', M(sx * tx, th / 2 + 0.01, sz * L * 0.42, 0, 0, HALF));
      b.add(box(tw * 1.02, 0.03, L * 0.84), 'G', M(sx * tx, th * 0.83 + 0.01, 0));
      if (!st.skirts) for (let i = 0; i < 4; i++) b.add(cyl(th * 0.3, th * 0.3, 0.04, 8), 'G', M(sx * (W / 2 + 0.005), th / 2 + 0.01, (-0.3 + i * 0.2) * L, 0, 0, HALF));
    }
    y0 = th * 0.6;
  } else {
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      b.add(cyl(0.3 * k, 0.36 * k, 0.22 * k, 8), 'G', M(sx * (W / 2 - 0.3 * k), 0.36 * k, sz * L * 0.32));
      b.add(cyl(0.25 * k, 0.25 * k, 0.02, 8), 'V', M(sx * (W / 2 - 0.3 * k), 0.24 * k, sz * L * 0.32));
    }
    y0 = 0.5 * k;
  }
  // ----- hull -----
  b.bone = 'hull';
  const hT = y0 + H, zf = L * 0.41;
  b.add(box(W * 0.92, H, L * 0.82), 'P', M(0, y0 + H / 2, -0.02 * L));
  b.add(box(W * 0.88, 0.1, H * 1.25), 'P', M(0, y0 + H * 0.45, zf + H * 0.28, 0.8));
  b.add(box(W * 0.7, 0.1, L * 0.24), 'D', M(0, hT + 0.05, -0.31 * L));
  for (let i = 0; i < 3; i++) b.add(box(W * 0.6, 0.02, 0.05), 'G', M(0, hT + 0.11, (-0.38 + i * 0.07) * L));
  for (const sx of [1, -1]) {
    b.add(box(0.25 * k, 0.12 * k, 0.03), 'V', M(sx * 0.22 * W, y0 + H * 0.5, -0.43 * L - 0.01));
    b.add(box(0.02, 0.08 * k, L * 0.7), 'S', M(sx * (W * 0.46 + 0.01), y0 + H * 0.62, -0.02 * L));
    b.add(box(0.13 * k, 0.06 * k, 0.04), 'V', M(sx * 0.3 * W, y0 + H * 0.5, zf + H * 0.52));
    if (st.hull === 2) b.add(box(0.08, H * 0.7, L * 0.5), 'P', M(sx * (W * 0.46 + 0.05), y0 + H * 0.45, 0.05 * L));
    if (st.hull === 0) b.add(box(tw * 1.05, 0.04, 0.35 * k), 'S', M(sx * tx, y0 + 0.02, zf + 0.12));
    if (hover) b.add(box(0.06, 0.24 * k, L * 0.5), 'S', M(sx * (W / 2 + 0.02), y0 + 0.05, 0));
    if (st.skirts) {
      const sy = hover ? 0.42 * k : th * 0.55, sh = hover ? 0.3 * k : th * 0.72;
      b.add(box(0.05, sh, L * 0.84), 'P', M(sx * (W / 2 + 0.035), sy, 0));
      b.add(box(0.055, 0.05 * k, L * 0.84), 'S', M(sx * (W / 2 + 0.036), sy - sh / 2 + 0.025 * k, 0));
    }
  }
  if (st.hull === 2) b.add(box(W * 0.86, 0.12, H * 0.9), 'S', M(0, y0 + H * 0.5, zf + H * 0.36, 0.8));
  b.add(cyl(0.55 * k, 0.6 * k, 0.08, 10), 'D', M(0, hT + 0.04, TZ));
  // ----- turret -----
  b.bone = 'turret';
  const tb = hT + 0.08, r = 0.62 * k;
  let ttop, tf, sideX, tilt, patchY;
  if (st.turret === 0) { // round dome
    b.add(sph(r, 10, 5, 0, Math.PI * 2, 0, HALF), 'P', M(0, tb, TZ, 0, 0, 0, 1, 0.62, 1.15));
    b.add(cyl(r, r, 0.06, 10), 'S', M(0, tb + 0.03, TZ, 0, 0, 0, 1, 1, 1.15));
    ttop = tb + 0.62 * r; tf = TZ + 1.1 * r; sideX = r * 0.9; tilt = 0.5; patchY = tb + 0.16 * k;
  } else if (st.turret === 1) { // angular wedge (nose forward)
    b.add(cyl(r * 0.72, r, 0.42 * k, 6), 'P', M(0, tb + 0.21 * k, TZ, 0, 0, 0, 1, 1, 1.3));
    b.add(cyl(0.16 * k, 0.18 * k, 0.06, 8), 'S', M(-0.15 * k, tb + 0.45 * k, TZ - 0.15 * k));
    ttop = tb + 0.42 * k; tf = TZ + 1.1 * r; sideX = 0.86 * r * 0.866 + 0.008; tilt = 0.32; patchY = tb + 0.2 * k;
  } else { // box turret with bustle
    b.add(box(r * 1.7, 0.4 * k, r * 2.0), 'P', M(0, tb + 0.2 * k, TZ));
    b.add(box(r * 1.4, 0.3 * k, 0.42 * k), 'D', M(0, tb + 0.2 * k, TZ - r - 0.2 * k));
    b.add(box(r * 1.74, 0.07 * k, 0.12), 'S', M(0, tb + 0.37 * k, TZ + r - 0.05));
    ttop = tb + 0.4 * k; tf = TZ + r; sideX = 0.85 * r + 0.006; tilt = 0; patchY = tb + 0.2 * k;
  }
  // nation flag on both turret sides
  for (const sx of [1, -1]) b.add(box(0.01, 0.3 * k, 0.3 * k), { flag: [0, 1], base: 'S' }, M(sx * sideX, patchY, TZ - 0.05 * k, 0, 0, tilt * sx));
  // main gun
  const gy = tb + 0.17 * k, G = (z) => tf + z * k;
  if (st.gun === 0) { // cannon
    b.add(box(0.32 * k, 0.24 * k, 0.2 * k), 'D', M(0, gy, tf));
    b.add(cyl(0.065 * k, 0.075 * k, 1.5 * k, 8), 'G', M(0, gy, G(0.75), HALF));
    b.add(cyl(0.1 * k, 0.1 * k, 0.25 * k, 8), 'S', M(0, gy, G(0.8), HALF));
    b.add(box(0.18 * k, 0.12 * k, 0.16 * k), 'D', M(0, gy, G(1.5)));
  } else if (st.gun === 1) { // twin
    b.add(box(0.52 * k, 0.24 * k, 0.2 * k), 'D', M(0, gy, tf));
    for (const sx of [1, -1]) {
      b.add(cyl(0.05 * k, 0.055 * k, 1.25 * k, 6), 'G', M(sx * 0.13 * k, gy, G(0.62), HALF));
      b.add(cyl(0.07 * k, 0.07 * k, 0.12 * k, 6), 'S', M(sx * 0.13 * k, gy, G(1.22), HALF));
    }
  } else if (st.gun === 2) { // railgun
    b.add(box(0.36 * k, 0.26 * k, 0.22 * k), 'D', M(0, gy, tf));
    for (const sx of [1, -1]) b.add(box(0.06 * k, 0.16 * k, 1.7 * k), 'G', M(sx * 0.09 * k, gy, G(0.85)));
    b.add(box(0.05 * k, 0.05 * k, 1.62 * k), 'V', M(0, gy, G(0.86)));
    for (const z of [0.35, 0.85, 1.35]) b.add(box(0.3 * k, 0.22 * k, 0.07 * k), 'S', M(0, gy, G(z)));
  } else { // laser
    b.add(box(0.34 * k, 0.26 * k, 0.22 * k), 'D', M(0, gy, tf));
    b.add(cyl(0.1 * k, 0.1 * k, 1.1 * k, 8), 'G', M(0, gy, G(0.55), HALF));
    for (const z of [0.3, 0.5, 0.7, 0.9]) b.add(cyl(0.14 * k, 0.14 * k, 0.05 * k, 8), 'V', M(0, gy, G(z), HALF));
    b.add(cyl(0.13 * k, 0.07 * k, 0.14 * k, 8), 'S', M(0, gy, G(1.15), HALF));
    b.add(cyl(0.09 * k, 0.09 * k, 0.02, 8), 'V', M(0, gy, G(1.225), HALF));
  }
  // extras
  const mast = [-r * 0.62, TZ - r * 0.62];
  let mastTop = null;
  if (st.antenna) {
    b.add(cyl(0.012, 0.018, 1.4 * k, 4), 'G', M(mast[0], ttop + 0.62 * k, mast[1]));
    mastTop = ttop + 1.32 * k;
    if (!st.pennant) b.add(box(0.05, 0.05, 0.05), 'V', M(mast[0], mastTop, mast[1]));
  }
  if (st.pennant) {
    if (!mastTop) { b.add(cyl(0.012, 0.012, 0.75 * k, 4), 'G', M(mast[0], ttop + 0.3 * k, mast[1])); mastTop = ttop + 0.67 * k; }
    b.add(box(0.008, 0.22 * k, 0.34 * k), { flag: [0, 1], base: 'S' }, M(mast[0], mastTop - 0.11 * k, mast[1] - 0.18 * k));
    b.add(box(0.035, 0.035, 0.035), 'S', M(mast[0], mastTop + 0.01, mast[1]));
  }
  if (st.smoke) for (const sx of [1, -1]) {
    b.add(box(0.12 * k, 0.2 * k, 0.12 * k), 'S', M(sx * r * 0.82, tb + 0.14 * k, tf - 0.3 * k));
    for (let i = 0; i < 3; i++) b.add(cyl(0.04 * k, 0.04 * k, 0.16 * k, 6), 'D', M(sx * (r * 0.82 + 0.05 * k), tb + (0.08 + i * 0.065) * k, tf - 0.24 * k, HALF * 0.75, 0, -0.5 * sx));
  }
  if (st.mg) {
    const mx = r * 0.35, mz = TZ - 0.1 * k;
    b.add(cyl(0.14 * k, 0.16 * k, 0.1 * k, 8), 'D', M(mx, ttop + 0.04 * k, mz));
    b.add(cyl(0.022 * k, 0.022 * k, 0.5 * k, 6), 'G', M(mx, ttop + 0.15 * k, mz + 0.28 * k, HALF));
    b.add(box(0.05 * k, 0.07 * k, 0.16 * k), 'D', M(mx, ttop + 0.14 * k, mz + 0.02 * k));
    b.add(box(0.26 * k, 0.13 * k, 0.025), 'S', M(mx, ttop + 0.15 * k, mz + 0.12 * k));
  }
  return b.parts;
}

export const TANK = {
  id: 'tank', fields: TANK_FIELDS, defaults: TANK_DEFAULT, pivot: TANK_PIVOT, parent: TANK_PARENT, build: buildTankParts,
  animate(B, t, st) {
    B.turret.rotation.y = 0.28 * Math.sin(t * 0.35);
    B.hull.position.y = st && st.drive === 1 ? 0.035 * Math.sin(t * 1.7) : 0;
    B.hull.rotation.x = st && st.drive === 1 ? 0.01 * Math.sin(t * 1.1) : 0;
  },
};
