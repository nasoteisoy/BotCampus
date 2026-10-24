// Little sea turtle made of primitives (no assets). createTurtle(color, scale) -> { root, rig, update(dt, st) }.
// Faces -z. st = { speed m/s, stroke 0..1 (1 = just stroked), pitch rad (+ = nose up), turn -1..1, phase }.
import * as THREE from 'three';

const geo = {
  dome: new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), belly: new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  ball: new THREE.SphereGeometry(1, 14, 10), plate: new THREE.CircleGeometry(1, 6), flip: new THREE.SphereGeometry(1, 12, 8), eye: new THREE.SphereGeometry(1, 10, 8),
  rim: new THREE.TorusGeometry(1, 0.08, 6, 28),
};
geo.flip.translate(1, 0, 0); geo.rim.rotateX(Math.PI / 2);
const lamb = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const whiteM = lamb('#ffffff'), blackM = new THREE.MeshBasicMaterial({ color: '#1d1a17' }), cheekM = lamb('#ff9fb4');

export function createTurtle(col, scale = 1) {
  const shell = new THREE.Color(col.body), shell2 = new THREE.Color(col.body2), skin = new THREE.Color(col.skin || '#9fe3a5'), tip = new THREE.Color(col.tip);
  const mShell = lamb(shell), mPlate = lamb(shell2), mSkin = lamb(skin), mBelly = lamb(skin.clone().lerp(new THREE.Color('#fff6dc'), 0.6)), mTip = lamb(tip);
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig); rig.scale.setScalar(scale);
  const mesh = (g, m, parent, s, p, r) => { const o = new THREE.Mesh(g, m); o.scale.set(...s); o.position.set(...p); if (r) o.rotation.set(...r); parent.add(o); return o; };
  const body = new THREE.Group(); rig.add(body);
  mesh(geo.dome, mShell, body, [0.95, 0.55, 1.1], [0, 0, 0]);
  mesh(geo.belly, mBelly, body, [0.9, 0.22, 1.05], [0, 0, 0]);
  mesh(geo.rim, mPlate, body, [0.95, 1, 1.1], [0, 0.02, 0]);
  // shell plates: a hexagon on top + 6 around (lighter colour, facing up/out)
  const plates = [[0, 0.56, 0, 0.3, 0]];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.52; plates.push([Math.sin(a) * 0.55, 0.38, Math.cos(a) * 0.62, 0.22, a]); }
  for (const [x, y, z, s, a] of plates) {
    const m = mesh(geo.plate, mPlate, body, [s, s, s], [x, y, z]);
    m.lookAt(new THREE.Vector3(x * 2.2, y * 3.2 + 0.4, z * 2.2).add(body.position)); m.position.set(x, y, z);
  }
  mesh(geo.ball, mTip, body, [0.08, 0.08, 0.08], [0, 0.6, 0]); // little shine dot
  // head
  const neck = new THREE.Group(); neck.position.set(0, 0.06, -1.0); body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.06, -0.32); neck.add(head);
  mesh(geo.ball, mSkin, neck, [0.24, 0.22, 0.34], [0, 0, -0.08]);
  mesh(geo.ball, mSkin, head, [0.36, 0.32, 0.4], [0, 0, 0]);
  for (const sx of [-1, 1]) {
    mesh(geo.eye, whiteM, head, [0.12, 0.14, 0.1], [sx * 0.2, 0.1, -0.24]);
    mesh(geo.eye, blackM, head, [0.07, 0.085, 0.05], [sx * 0.22, 0.1, -0.32]);
    mesh(geo.eye, whiteM, head, [0.025, 0.025, 0.02], [sx * 0.2, 0.14, -0.36]);
    mesh(geo.eye, cheekM, head, [0.07, 0.04, 0.03], [sx * 0.24, -0.06, -0.28]);
  }
  mesh(geo.eye, blackM, head, [0.12, 0.02, 0.02], [0, -0.1, -0.37]); // smile
  // flippers: front big, back small; pivot at the shell edge
  const flippers = [];
  for (const [sx, z, s, front] of [[-1, -0.55, 0.62, 1], [1, -0.55, 0.62, 1], [-1, 0.7, 0.36, 0], [1, 0.7, 0.36, 0]]) {
    const g = new THREE.Group(); g.position.set(sx * 0.8, -0.02, z); body.add(g);
    const f = mesh(geo.flip, mSkin, g, [s, 0.07, s * 0.42], [0, 0, 0]); f.scale.x *= sx; f.rotation.y = sx * (front ? 0.35 : -0.5);
    flippers.push({ g, sx, front });
  }
  const tail = mesh(geo.spikeless || geo.ball, mSkin, body, [0.1, 0.08, 0.24], [0, -0.02, 1.12]);
  let t = 0, strokeK = 0;
  return {
    root, rig, head, body,
    update(dt, st) {
      t += dt;
      const sp = Math.min(1, st.speed / 6);
      strokeK = Math.max(strokeK - dt * 2.2, st.stroke || 0);
      const paddle = Math.sin(st.phase) * (0.25 + 0.35 * sp);
      for (const F of flippers) {
        if (F.front) { // big sweep on a stroke, gentle paddle otherwise
          const sweep = Math.sin(Math.min(1, 1 - strokeK) * Math.PI) * strokeK;
          F.g.rotation.z = F.sx * (paddle * 0.8 - 0.1 + sweep * 0.8);
          F.g.rotation.y = F.sx * (0.15 - strokeK * 0.5 + 0.1 * Math.sin(st.phase));
        } else { F.g.rotation.z = F.sx * Math.sin(st.phase + 1.5) * 0.3; F.g.rotation.y = -F.sx * 0.2; }
      }
      body.rotation.x = (st.pitch || 0) * 0.9 + Math.sin(t * 1.6) * 0.03;
      body.rotation.z = -(st.turn || 0) * 0.35 * (0.3 + sp);
      body.position.y = Math.sin(t * 1.4) * 0.06;
      head.rotation.y = -(st.turn || 0) * 0.3 + Math.sin(t * 0.7) * 0.1;
      head.rotation.x = -(st.pitch || 0) * 0.3;
      tail.rotation.y = Math.sin(t * 3) * 0.3;
    },
  };
}
