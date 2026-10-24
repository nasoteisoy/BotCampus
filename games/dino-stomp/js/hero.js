// Baby dinosaur made of primitives (no assets). createDino(color, scale) -> { root, update(dt, st) }.
// The dino faces -z (forward). st = { speed, air, roar 0..1, land 0..1, phase }.
import * as THREE from 'three';

const geo = {
  body: new THREE.SphereGeometry(1, 18, 14), head: new THREE.SphereGeometry(1, 16, 12), eye: new THREE.SphereGeometry(1, 10, 8),
  leg: new THREE.CylinderGeometry(1, 0.85, 1, 10), foot: new THREE.SphereGeometry(1, 10, 6), spike: new THREE.ConeGeometry(1, 1, 5),
  tail: new THREE.ConeGeometry(1, 1, 10), arm: new THREE.CapsuleGeometry(1, 1.4, 3, 6), jaw: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
};
geo.leg.translate(0, -0.5, 0); geo.tail.rotateX(Math.PI / 2); geo.tail.translate(0, 0, 0.5); geo.arm.translate(0, -0.9, 0);
const lamb = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const whiteM = lamb('#ffffff'), blackM = new THREE.MeshBasicMaterial({ color: '#1d1a17' }), mouthM = lamb('#c4475a');

export function createDino(col, scale = 1) {
  const main = new THREE.Color(col.body), dark = new THREE.Color(col.body2), belly = main.clone().lerp(new THREE.Color('#fff3d6'), 0.6);
  const spikeC = new THREE.Color(col.tip);
  const mBody = lamb(main), mDark = lamb(dark), mBelly = lamb(belly), mSpike = lamb(spikeC, { flatShading: true });
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig); rig.scale.setScalar(scale);
  const mesh = (g, m, parent, s, p, r) => { const o = new THREE.Mesh(g, m); o.scale.set(...s); o.position.set(...p); if (r) o.rotation.set(...r); parent.add(o); return o; };
  const hips = new THREE.Group(); hips.position.set(0, 0.95, 0); rig.add(hips);
  const body = mesh(geo.body, mBody, hips, [0.62, 0.6, 0.78], [0, 0.15, 0.05]);
  mesh(geo.body, mBelly, hips, [0.5, 0.48, 0.62], [0, 0.05, -0.18]);
  // neck + head (head group pivots for the roar)
  const neck = new THREE.Group(); neck.position.set(0, 0.55, -0.45); hips.add(neck);
  mesh(geo.body, mBody, neck, [0.3, 0.36, 0.3], [0, 0.12, -0.05]);
  const head = new THREE.Group(); head.position.set(0, 0.45, -0.18); neck.add(head);
  mesh(geo.head, mBody, head, [0.46, 0.4, 0.5], [0, 0.05, 0]);
  mesh(geo.head, mBody, head, [0.36, 0.26, 0.36], [0, -0.04, -0.4]); // snout
  for (const sx of [-1, 1]) { // eyes: big + friendly
    mesh(geo.eye, whiteM, head, [0.15, 0.17, 0.12], [sx * 0.24, 0.2, -0.3]);
    mesh(geo.eye, blackM, head, [0.08, 0.1, 0.06], [sx * 0.26, 0.21, -0.4]);
    mesh(geo.eye, whiteM, head, [0.03, 0.03, 0.02], [sx * 0.24, 0.26, -0.45]);
    mesh(geo.eye, mDark, head, [0.03, 0.03, 0.03], [sx * 0.1, 0.04, -0.75]); // nostrils
  }
  const jaw = new THREE.Group(); jaw.position.set(0, -0.12, -0.08); head.add(jaw);
  mesh(geo.jaw, mBody, jaw, [0.33, 0.2, 0.42], [0, 0.02, -0.32]);
  mesh(geo.eye, mouthM, jaw, [0.22, 0.04, 0.3], [0, 0.02, -0.34]);
  for (const sx of [-1, 1]) for (const zz of [-0.55, -0.4]) mesh(geo.spike, whiteM, head, [0.03, 0.06, 0.03], [sx * 0.16, -0.16, zz], [Math.PI, 0, 0]);
  // back spikes
  const spikes = [];
  for (let i = 0; i < 6; i++) { const z = -0.45 + i * 0.25, s = 0.16 - Math.abs(i - 2) * 0.02; spikes.push(mesh(geo.spike, mSpike, hips, [s * 0.8, s * 1.7, s * 0.5], [0, 0.72 - Math.abs(z - 0.05) * 0.35, z], [-0.25, 0, 0])); }
  // tail: 3 segments that sway
  const tail = []; let par = hips, pz = 0.7;
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); g.position.set(0, i === 0 ? 0.08 : 0, i === 0 ? pz : 0.55 - i * 0.08); par.add(g);
    const r = 0.36 - i * 0.1; mesh(geo.tail, i % 2 ? mDark : mBody, g, [r, r * 0.9, 0.62 - i * 0.06], [0, 0, 0], [-0.08, 0, 0]);
    if (i < 2) mesh(geo.spike, mSpike, g, [0.08, 0.17, 0.06], [0, r * 0.85, 0.25], [-0.4, 0, 0]);
    tail.push(g); par = g;
  }
  // legs (hip pivots) + tiny arms
  const legs = [-1, 1].map((sx) => {
    const g = new THREE.Group(); g.position.set(sx * 0.36, 0.02, 0.12); hips.add(g);
    mesh(geo.body, mBody, g, [0.24, 0.32, 0.3], [0, -0.12, 0]); // thigh
    const shin = mesh(geo.leg, mDark, g, [0.14, 0.62, 0.14], [0, -0.25, 0]);
    mesh(geo.foot, mDark, g, [0.2, 0.1, 0.3], [0, -0.85, -0.08]);
    return { g, shin };
  });
  const arms = [-1, 1].map((sx) => { const g = new THREE.Group(); g.position.set(sx * 0.42, 0.35, -0.42); hips.add(g); mesh(geo.arm, mBody, g, [0.07, 0.11, 0.07], [0, 0, 0]); return g; });
  // soft round shadow
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 1; root.add(shadow);
  let t = 0, roarK = 0;
  return {
    root, rig, shadow, head, body,
    /** st: { speed m/s, air m above ground (shadow), vy, roar 0..1 (1 = just roared), land 0..1 squash, phase (walk cycle) } */
    update(dt, st) {
      t += dt;
      const walk = Math.min(1, st.speed / 6), ph = st.phase;
      const sw = Math.sin(ph) * 0.65 * walk;
      legs[0].g.rotation.x = st.air > 0.05 ? -0.5 : sw; legs[1].g.rotation.x = st.air > 0.05 ? -0.2 : -sw;
      arms[0].rotation.x = -0.6 + Math.sin(ph + 1) * 0.3 * walk; arms[1].rotation.x = -0.6 - Math.sin(ph + 1) * 0.3 * walk;
      const bob = Math.abs(Math.cos(ph)) * 0.08 * walk + Math.sin(t * 2.2) * 0.012;
      hips.position.y = 0.95 + bob - (st.land || 0) * 0.18;
      hips.rotation.z = Math.sin(ph) * 0.06 * walk;
      hips.rotation.x = -0.05 * walk + (st.vy || 0) * -0.02;
      rig.scale.set(scale * (1 + (st.land || 0) * 0.12), scale * (1 - (st.land || 0) * 0.14), scale * (1 + (st.land || 0) * 0.12));
      tail.forEach((g, i) => { g.rotation.y = Math.sin(t * 3 + ph * 0.5 - i * 0.7) * (0.12 + 0.1 * walk); g.rotation.x = 0.05 + i * 0.04; });
      // roar: head up, jaw open, arms up, body leans back
      roarK += ((st.roar > 0 ? 1 : 0) - roarK) * (1 - Math.exp(-(st.roar > 0 ? 14 : 5) * dt));
      head.rotation.x = 0.1 - roarK * 0.55 + Math.sin(t * 1.7) * 0.03;
      jaw.rotation.x = roarK * 0.65 + (st.roar > 0 ? Math.sin(t * 40) * 0.05 : 0);
      neck.rotation.x = -roarK * 0.3;
      if (roarK > 0.05) { arms[0].rotation.x = -0.6 - roarK * 1.2; arms[1].rotation.x = -0.6 - roarK * 1.2; }
      hips.rotation.x -= roarK * 0.12;
      for (const s of spikes) s.scale.y = (0.16 * 1.7) * (1 + roarK * 0.25) * (s.userData.k ??= s.scale.y / 0.272);
      shadow.position.y = -(st.air || 0) + 0.03;
      const sh = 1 / (1 + (st.air || 0) * 0.35); shadow.scale.setScalar(sh * scale); shadow.material.opacity = 0.22 * sh;
    },
  };
}
