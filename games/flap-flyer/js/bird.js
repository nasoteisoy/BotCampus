import * as THREE from 'three';

// Blocky low-poly bird facing -Z. Default: green body, blue wingtips, red head cap + tail (v1 bird).
// `col` = { body, body2, tip, head } lets each player get their own colors.
// v2: the boxes of each moving part are merged into one vertex-colored mesh (6 draw calls per bird instead of 15),
// so 4 birds x 4 split-screen views stay cheap.
const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
function merged(parts) {
  // parts: [w, h, d, color, x, y, z]
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  for (const [w, h, d, color, x = 0, y = 0, z = 0] of parts) {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    c.set(color);
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return new THREE.Mesh(g, mat);
}
export function createBird(col = {}) {
  const G = col.body || '#6cc26a', G2 = col.body2 || '#58ad5a', B = col.tip || '#5aa7e6', R = col.head || '#e2554a', O = '#f2a33a', K = '#2b2622', W = '#fff8ea';
  const root = new THREE.Group();     // position + yaw
  const body = new THREE.Group();     // pitch + roll
  root.add(body);
  // body + belly + head (head group sits at 0, 0.38, -0.95)
  const hx = 0, hy = 0.38, hz = -0.95;
  body.add(merged([
    [1.0, 0.8, 1.6, G], [0.8, 0.3, 1.2, W, 0, -0.32, -0.05],
    [0.78, 0.72, 0.72, R, hx, hy, hz], [0.8, 0.25, 0.55, R, hx, hy + 0.42, hz + 0.05], [0.3, 0.22, 0.45, O, hx, hy - 0.05, hz - 0.55],
    [0.12, 0.14, 0.08, K, hx + 0.3, hy + 0.1, hz - 0.36], [0.12, 0.14, 0.08, K, hx - 0.3, hy + 0.1, hz - 0.36],
  ]));
  const tail = new THREE.Group(); tail.position.set(0, 0.18, 0.8); body.add(tail);
  tail.add(merged([[0.75, 0.14, 0.8, R, 0, 0, 0.35], [0.35, 0.12, 0.4, B, 0, 0.02, 0.8]]));
  const mkWing = (side) => {
    const sh = new THREE.Group(); sh.position.set(0.48 * side, 0.18, -0.15);
    sh.add(merged([[1.4, 0.14, 1.0, side > 0 ? G : G2, 0.7 * side, 0, 0]]));
    const el = new THREE.Group(); el.position.set(1.4 * side, 0, 0); sh.add(el);
    el.add(merged([[0.9, 0.12, 0.85, B, 0.45 * side, 0, 0.05], [0.5, 0.1, 0.5, B, 1.05 * side, 0, 0.18]]));
    const tip = new THREE.Object3D(); tip.position.set(1.3 * side, 0, 0.2); el.add(tip);
    body.add(sh);
    return { sh, el, tip, side };
  };
  const wL = mkWing(-1), wR = mkWing(1);
  root.scale.setScalar(1.35);

  let flapT = 1; // 0..1 progress of a flap stroke
  let t = 0;
  const stroke = (k) => {
    // quick downstroke, slower recovery up
    if (k < 0.3) return THREE.MathUtils.lerp(0.25, -0.85, k / 0.3);
    if (k < 0.75) return THREE.MathUtils.lerp(-0.85, 0.75, (k - 0.3) / 0.45);
    return THREE.MathUtils.lerp(0.75, 0.25, (k - 0.75) / 0.25);
  };
  return {
    root, body, tips: [wL.tip, wR.tip],
    flap() { flapT = flapT < 0.5 ? 0.15 : 0; },
    get flapping() { return flapT < 1; },
    update(dt, roll, pitch) {
      t += dt;
      flapT = Math.min(1, flapT + dt / 0.55);
      const a = flapT < 1 ? stroke(flapT) : 0.18 + Math.sin(t * 1.7) * 0.04; // glide = slight dihedral
      const bend = flapT < 1 ? -a * 0.45 : 0.06;
      for (const w of [wL, wR]) {
        w.sh.rotation.z = a * w.side;
        w.el.rotation.z = bend * w.side;
      }
      tail.rotation.x = -pitch * 0.6 + Math.sin(t * 2.1) * 0.04;
      body.rotation.set(pitch, 0, -roll, 'YXZ');
    },
  };
}
