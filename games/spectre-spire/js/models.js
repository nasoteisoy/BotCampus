// Toy-style models assembled from simple primitives (no deformed meshes).
import * as THREE from 'three';

const geoCache = new Map();
const geo = (k, make) => { if (!geoCache.has(k)) geoCache.set(k, make()); return geoCache.get(k); };
const matCache = new Map();
export const mat = (color, opts = {}) => {
  const k = color + JSON.stringify(opts);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return matCache.get(k);
};
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
const BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const box = (sx, sy, sz, m, x, y, z) => { const o = mesh(BOX(), m, x, y, z); o.scale.set(sx, sy, sz); return o; };

// ---- hunter: a chunky toy figure with a vacuum pack, in the hunter's colour
export function makeHunter(color) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const c = mat(color), dark = mat(0x2b2235), skin = mat(0xf6d2b0), white = mat(0xf7f2ea), metal = mat(0xb8c0cc);
  body.add(box(0.2, 0.5, 0.24, dark, -0.13, 0.25, 0), box(0.2, 0.5, 0.24, dark, 0.13, 0.25, 0)); // legs
  body.add(box(0.26, 0.12, 0.34, mat(0x3a2a20), -0.13, 0.06, 0.04), box(0.26, 0.12, 0.34, mat(0x3a2a20), 0.13, 0.06, 0.04));
  const torso = mesh(geo('torso', () => new THREE.CylinderGeometry(0.3, 0.34, 0.62, 8)), c, 0, 0.82, 0); body.add(torso);
  body.add(box(0.62, 0.1, 0.5, white, 0, 0.62, 0)); // belt
  const head = mesh(geo('head', () => new THREE.SphereGeometry(0.27, 10, 8)), skin, 0, 1.36, 0); body.add(head);
  body.add(mesh(geo('cap', () => new THREE.SphereGeometry(0.29, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), c, 0, 1.42, 0));
  body.add(box(0.36, 0.05, 0.24, c, 0, 1.43, -0.22)); // cap brim (faces -z = forward)
  body.add(mesh(geo('eye', () => new THREE.SphereGeometry(0.045, 6, 4)), dark, -0.1, 1.38, -0.24), mesh(geo('eye'), dark, 0.1, 1.38, -0.24));
  const pack = new THREE.Group(); pack.position.set(0, 0.9, 0.3); body.add(pack);
  pack.add(mesh(geo('tank', () => new THREE.CylinderGeometry(0.17, 0.17, 0.62, 8)), metal, -0.1, 0, 0));
  pack.add(mesh(geo('tank'), metal, 0.12, 0, 0));
  pack.add(box(0.5, 0.12, 0.3, c, 0, 0.32, 0));
  const glass = mesh(geo('tankglass', () => new THREE.SphereGeometry(0.12, 8, 6)), mat(0x9ff7e0, { emissive: 0x3fbf9f }), 0, 0.42, 0); pack.add(glass);
  const armL = box(0.16, 0.5, 0.16, c, -0.4, 0.86, 0); const armR = box(0.16, 0.5, 0.16, c, 0.4, 0.86, -0.1); armR.rotation.x = -1.1;
  body.add(armL, armR);
  const gun = new THREE.Group(); gun.position.set(0.32, 0.95, -0.42); body.add(gun);
  gun.add(box(0.18, 0.18, 0.5, white, 0, 0, 0), box(0.2, 0.06, 0.52, c, 0, 0.1, 0));
  gun.add(mesh(geo('nozzle', () => new THREE.CylinderGeometry(0.1, 0.06, 0.25, 8).rotateX(Math.PI / 2)), metal, 0, 0, -0.35));
  const ring = mesh(geo('ring', () => new THREE.RingGeometry(0.55, 0.72, 24).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }), 0, 0.03, 0);
  g.add(ring);
  g.userData = { body, head, armL, ring, glass };
  return g;
}

// ---- ghosts: soft glowing blobs with a wavy skirt; horned and boss variants
export function makeGhost(kind, def) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const s = def.size;
  const m = new THREE.MeshLambertMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.35, transparent: true, opacity: 0.9, flatShading: true });
  const head = mesh(geo('ghead', () => new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)), m, 0, 0.1, 0); head.scale.setScalar(s * 1.1); inner.add(head);
  const skirt = mesh(geo('gskirt', () => {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector2(0.43 + 0.08 * Math.sin(t * Math.PI) + t * 0.08, 0.2 - t * 0.75)); }
    return new THREE.LatheGeometry(pts, 10);
  }), m, 0, 0, 0); skirt.scale.setScalar(s * 1.1); inner.add(skirt);
  const eyeM = mat(0x1d1028);
  const eyeG = geo('geye', () => new THREE.SphereGeometry(0.12, 8, 6));
  const eL = mesh(eyeG, eyeM, -0.16 * s, 0.18 * s, -0.4 * s), eR = mesh(eyeG, eyeM, 0.16 * s, 0.18 * s, -0.4 * s);
  eL.scale.set(s, s * 1.3, s * 0.6); eR.scale.copy(eL.scale); inner.add(eL, eR);
  const shine = mat(0xffffff, { emissive: 0xffffff });
  const shG = geo('gshine', () => new THREE.SphereGeometry(0.035, 6, 4));
  eL.add(mesh(shG, shine, 0.04, 0.05, -0.08)); eR.add(mesh(shG, shine, 0.04, 0.05, -0.08));
  const blushM = mat(0xff7aa8, { emissive: 0x802040 });
  const blG = geo('gblush', () => new THREE.SphereGeometry(0.06, 6, 4));
  for (const sx of [-1, 1]) { const b = mesh(blG, blushM, sx * 0.27 * s, 0.05 * s, -0.36 * s); b.scale.set(s * 1.2, s * 0.6, s * 0.4); inner.add(b); }
  const mouth = mesh(geo('gmouth', () => new THREE.SphereGeometry(0.07, 8, 4)), eyeM, 0, -0.02 * s, -0.42 * s); mouth.scale.set(s * 1.2, s * 0.8, s * 0.5); inner.add(mouth);
  if (kind === 'horn' || kind === 'boss') {
    const hm = mat(kind === 'boss' ? 0x6b2fa0 : 0xff6f91);
    const hg = geo('ghorn', () => new THREE.ConeGeometry(0.1, 0.35, 6));
    const hL = mesh(hg, hm, -0.25 * s, 0.55 * s, 0), hR = mesh(hg, hm, 0.25 * s, 0.55 * s, 0);
    hL.scale.setScalar(s); hR.scale.setScalar(s); hL.rotation.z = 0.4; hR.rotation.z = -0.4; inner.add(hL, hR);
  }
  if (kind === 'boss') {
    const hat = new THREE.Group(); hat.position.set(0, 0.62 * s, 0); inner.add(hat);
    hat.add(box(0.8 * s, 0.05 * s, 0.8 * s, mat(0x22182c), 0, 0, 0), box(0.5 * s, 0.45 * s, 0.5 * s, mat(0x22182c), 0, 0.22 * s, 0), box(0.52 * s, 0.08 * s, 0.52 * s, mat(0xc0304f), 0, 0.08 * s, 0));
    inner.add(box(0.25 * s, 0.12 * s, 0.05 * s, mat(0xc0304f), 0, -0.12 * s, -0.43 * s)); // bow tie
  }
  if (kind === 'gold') inner.add(mesh(geo('gcoin', () => new THREE.CylinderGeometry(0.15, 0.15, 0.04, 10).rotateX(Math.PI / 2)), mat(0xffe27a, { emissive: 0x7a5a00 }), 0, 0.2 * s, -0.46 * s));
  const stars = new THREE.Group(); stars.position.y = 0.55 * s; stars.visible = false; inner.add(stars);
  const starG = geo('star', () => new THREE.OctahedronGeometry(0.08, 0));
  for (let i = 0; i < 3; i++) { const st = mesh(starG, mat(0xfff27a, { emissive: 0xaa9900 }), Math.cos(i * 2.1) * 0.4 * s, 0, Math.sin(i * 2.1) * 0.4 * s); stars.add(st); }
  g.userData = { inner, m, stars, eL, eR, mouth, baseColor: new THREE.Color(def.color) };
  return g;
}

// ---- valuables
export function makeLoot(kind) {
  const g = new THREE.Group();
  const gold = mat(0xf2c94c, { emissive: 0x3a2a00 });
  switch (kind) {
    case 'vase': {
      const pts = [[0.0, -0.26], [0.16, -0.26], [0.22, -0.1], [0.2, 0.05], [0.1, 0.16], [0.12, 0.26], [0.0, 0.26]].map(([x, y]) => new THREE.Vector2(x, y));
      g.add(mesh(geo('vase', () => new THREE.LatheGeometry(pts, 10)), mat(0x5ab0d8)));
      g.add(mesh(geo('vaseband', () => new THREE.CylinderGeometry(0.215, 0.215, 0.05, 10)), mat(0xf7f2ea), 0, -0.06, 0));
      break; }
    case 'orb':
      g.add(mesh(geo('orb', () => new THREE.IcosahedronGeometry(0.2, 1)), new THREE.MeshLambertMaterial({ color: 0xc8a6ff, emissive: 0x6a3fbf, transparent: true, opacity: 0.85, flatShading: true }), 0, 0.04, 0));
      g.add(mesh(geo('orbbase', () => new THREE.CylinderGeometry(0.12, 0.16, 0.08, 8)), gold, 0, -0.2, 0));
      break;
    case 'frame':
      g.add(box(0.6, 0.48, 0.06, gold, 0, 0, 0), box(0.5, 0.38, 0.07, mat(0x3f7f6a), 0, 0, 0), box(0.18, 0.18, 0.08, mat(0xf6d2b0), 0, 0.03, 0));
      break;
    case 'trophy':
      g.add(mesh(geo('cup', () => new THREE.CylinderGeometry(0.16, 0.06, 0.22, 8)), gold, 0, 0.08, 0));
      g.add(box(0.06, 0.1, 0.06, gold, 0, -0.08, 0), box(0.22, 0.08, 0.22, mat(0x6b3b26), 0, -0.18, 0));
      break;
    case 'musicbox':
      g.add(box(0.36, 0.2, 0.26, mat(0xe56f61), 0, -0.04, 0), box(0.38, 0.06, 0.28, gold, 0, 0.08, 0), box(0.06, 0.12, 0.06, mat(0xf7f2ea), 0, 0.16, 0));
      break;
    case 'bars':
      g.add(box(0.34, 0.12, 0.18, gold, -0.1, -0.12, 0), box(0.34, 0.12, 0.18, gold, 0.1, -0.12, 0.05), box(0.34, 0.12, 0.18, gold, 0, 0.0, 0.02));
      break;
    case 'clock':
      g.add(box(0.55, 1.5, 0.4, mat(0x6b3b26), 0, 0.25, 0), box(0.45, 0.45, 0.06, mat(0xf3e3c3), 0, 0.7, -0.21), box(0.04, 0.16, 0.02, mat(0x2a2230), 0, 0.74, -0.25));
      g.add(mesh(geo('pend', () => new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10).rotateX(Math.PI / 2)), gold, 0, 0.0, -0.21));
      break;
    case 'throne': {
      const bowl = mesh(geo('bowl', () => new THREE.CylinderGeometry(0.3, 0.2, 0.42, 10)), gold, 0, -0.27, -0.05); g.add(bowl);
      g.add(mesh(geo('seat', () => new THREE.TorusGeometry(0.24, 0.06, 6, 12).rotateX(Math.PI / 2)), mat(0xfff3c4), 0, -0.04, -0.05));
      g.add(box(0.5, 0.5, 0.2, gold, 0, 0.18, 0.28), box(0.56, 0.06, 0.24, mat(0xfff3c4), 0, 0.45, 0.28), box(0.1, 0.06, 0.06, mat(0xfff3c4), 0.18, 0.3, 0.16));
      break; }
  }
  return g;
}

// ---- trapped guest (a tiny bellhop toy) and the purple cage
export function makeGuest() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.42, 0.24, mat(0xc0304f), 0, 0.42, 0), box(0.12, 0.25, 0.14, mat(0x2b2235), -0.07, 0.12, 0), box(0.12, 0.25, 0.14, mat(0x2b2235), 0.07, 0.12, 0));
  g.add(mesh(geo('ghead2', () => new THREE.SphereGeometry(0.17, 8, 6)), mat(0xf6d2b0), 0, 0.78, 0));
  g.add(mesh(geo('bellcap', () => new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8)), mat(0xc0304f), 0, 0.95, 0));
  return g;
}

export function makeCage() {
  const g = new THREE.Group();
  const pm = mat(0x9b4dff, { emissive: 0x3a1066 });
  g.add(box(1.3, 0.12, 1.3, pm, 0, 0.06, 0), box(1.3, 0.12, 1.3, pm, 0, 1.95, 0));
  const bar = geo('bar', () => new THREE.CylinderGeometry(0.035, 0.035, 1.85, 5));
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
    const t = -0.6 + (k / 3) * 1.2;
    const pos = [[t, -0.6], [0.6, t], [-t, 0.6], [-0.6, -t]][i];
    g.add(mesh(bar, pm, pos[0], 1.0, pos[1]));
  }
  return g;
}

// ---- first-person vacuum gun
export function makeViewGun(color) {
  const g = new THREE.Group();
  const c = mat(color), white = mat(0xf7f2ea), metal = mat(0xb8c0cc), dark = mat(0x2b2235);
  g.add(box(0.16, 0.16, 0.5, white, 0, 0, 0), box(0.17, 0.05, 0.5, c, 0, 0.09, 0), box(0.08, 0.16, 0.1, dark, 0, -0.13, 0.12));
  const noz = mesh(geo('vnoz', () => new THREE.CylinderGeometry(0.11, 0.06, 0.26, 10).rotateX(Math.PI / 2)), metal, 0, 0, -0.36); g.add(noz);
  const lens = mesh(geo('vlens', () => new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10).rotateX(Math.PI / 2)), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }), 0.0, 0.14, -0.2);
  g.add(box(0.08, 0.08, 0.2, dark, 0, 0.14, -0.12), lens);
  const tank = mesh(geo('vtank', () => new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8).rotateZ(Math.PI / 2)), new THREE.MeshLambertMaterial({ color: 0x9ff7e0, emissive: 0x2a8f75, transparent: true, opacity: 0.9 }), 0.11, 0.02, 0.05);
  g.add(tank);
  g.userData = { noz, tank };
  return g;
}

// flashlight cone shown for other hunters (soft additive)
export function makeBeamCone(color = 0xfff3c0) {
  const g = geo('cone', () => { const c = new THREE.ConeGeometry(1.8, 9, 16, 1, true); c.translate(0, -4.5, 0); c.rotateX(Math.PI / 2); return c; });
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  return new THREE.Mesh(g, m);
}
