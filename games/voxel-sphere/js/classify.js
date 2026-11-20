// Voxel-sphere classification (pure math, no three.js; unit-tested in node: test/classify.test.mjs).
// Grid: N x N x N unit cubes, cube (i,j,k) spans [i,i+1] x [j,j+1] x [k,k+1].
// BROWN: all 8 corners inside the sphere (dist <= R).
// GREEN: not brown, but the closest point of the cube to the centre is within R (dist_min <= R; touching counts).
// BLACK: dist_min > R.
// Exact: every coordinate is doubled so a whole or half-integer centre and radius become integers,
// and all comparisons are on integer squared distances (no float epsilon).

export const N = 10;                 // cubes per side, grid spans [0, N]^3
export const CENTER = [5, 5, 5];     // sphere centre
export const R = 4;                  // sphere radius (the one constant to change)

const twice = (v, name) => {
  const t = v * 2;
  if (!Number.isInteger(t)) throw new Error(`${name} must be a whole or half-integer for exact math, got ${v}`);
  return t;
};

/** Classify one cube. Returns 'brown' | 'green' | 'black'. */
export function classify(i, j, k, center = CENTER, r = R) {
  const c = center.map((v, a) => twice(v, 'center[' + a + ']'));
  const r2 = twice(r, 'R') ** 2;      // (2R)^2
  const lo = [2 * i, 2 * j, 2 * k], hi = [2 * i + 2, 2 * j + 2, 2 * k + 2];
  // all 8 corners
  let allIn = true;
  for (let m = 0; m < 8 && allIn; m++) {
    let d2 = 0;
    for (let a = 0; a < 3; a++) { const p = (m >> a) & 1 ? hi[a] : lo[a]; d2 += (p - c[a]) ** 2; }
    if (d2 > r2) allIn = false;
  }
  if (allIn) return 'brown';
  // closest point of the box to the centre: clamp the centre into the box per axis
  let dmin2 = 0;
  for (let a = 0; a < 3; a++) { const q = Math.min(Math.max(c[a], lo[a]), hi[a]); dmin2 += (q - c[a]) ** 2; }
  return dmin2 <= r2 ? 'green' : 'black';
}

/** Classify the whole grid: { cells: [{i,j,k,cls}], counts: {brown, green, black} }. */
export function classifyGrid(n = N, center = CENTER, r = R) {
  const cells = [], counts = { brown: 0, green: 0, black: 0 };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const cls = classify(i, j, k, center, r); cells.push({ i, j, k, cls }); counts[cls]++;
  }
  return { cells, counts };
}
