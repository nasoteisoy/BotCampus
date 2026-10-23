import * as THREE from 'three';

// Blocky low-poly bird facing -Z. Green body, blue wingtips, red head cap + tail.
export function createBird() {
  const G = new THREE.Color('#6cc26a'), G2 = new THREE.Color('#58ad5a'), B = new THREE.Color('#5aa7e6'), R = new THREE.Color('#e2554a'), O = new THREE.Color('#f2a33a');
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const mG = mat(G), mG2 = mat(G2), mB = mat(B), mR = mat(R), mO = mat(O), mK = mat('#2b2622'), mW = mat('#fff8ea');
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

  const root = new THREE.Group();     // position + yaw
  const body = new THREE.Group();     // pitch + roll
  root.add(body);
  body.add(box(1.0, 0.8, 1.6, mG));
  body.add(box(0.8, 0.3, 1.2, mW, 0, -0.32, -0.05)); // belly
  const head = new THREE.Group(); head.position.set(0, 0.38, -0.95); body.add(head);
  head.add(box(0.78, 0.72, 0.72, mR));
  head.add(box(0.8, 0.25, 0.55, mR, 0, 0.42, 0.05));
  head.add(box(0.3, 0.22, 0.45, mO, 0, -0.05, -0.55));
  head.add(box(0.12, 0.14, 0.08, mK, 0.3, 0.1, -0.36));
  head.add(box(0.12, 0.14, 0.08, mK, -0.3, 0.1, -0.36));
  const tail = new THREE.Group(); tail.position.set(0, 0.18, 0.8); body.add(tail);
  tail.add(box(0.75, 0.14, 0.8, mR, 0, 0, 0.35));
  tail.add(box(0.35, 0.12, 0.4, mB, 0, 0.02, 0.8));
  const mkWing = (side) => {
    const sh = new THREE.Group(); sh.position.set(0.48 * side, 0.18, -0.15);
    sh.add(box(1.4, 0.14, 1.0, side > 0 ? mG : mG2, 0.7 * side, 0, 0));
    const el = new THREE.Group(); el.position.set(1.4 * side, 0, 0); sh.add(el);
    el.add(box(0.9, 0.12, 0.85, mB, 0.45 * side, 0, 0.05));
    el.add(box(0.5, 0.1, 0.5, mB, 1.05 * side, 0, 0.18));
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
