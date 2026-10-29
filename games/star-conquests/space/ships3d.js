// Low-poly SpaceShip + BattleShip meshes for STAR CONQUESTS space battles.
// Adapted from spaceship-custom/ship3d.js and battleship-custom/ship3d.js (fixed roster models, no editor).
import * as THREE from './vendor/three.module.min.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.55, metalness: 0.3, ...o });
const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m;
};
const cyl = (rt, rb, h, seg, mat) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);

/** Edge-glow shield (fresnel rim). Flashes via material.userData.flash (0..1). */
function makeShieldMat(color) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uC: { value: new THREE.Color(color) },
      uOp: { value: 0.08 },
      uFlash: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uOp; uniform float uFlash; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.4); float a=uOp+f*0.55+uFlash*(0.25+f*0.7); gl_FragColor=vec4(uC*(1.0+uFlash*0.9), clamp(a,0.0,1.0)); }',
  });
  m.userData.flash = 0;
  return m;
}

function applyTeamMats(priHex, secHex) {
  const priCol = new THREE.Color(priHex);
  const secCol = new THREE.Color(secHex);
  // Emissive team fill so hull colour reads on phone (dark attacker fix)
  return {
    pri: M(priHex, { emissive: priCol.clone().multiplyScalar(0.55).getHex(), emissiveIntensity: 0.85, roughness: 0.45, metalness: 0.25 }),
    sec: M(secHex, { emissive: secCol.clone().multiplyScalar(0.4).getHex(), emissiveIntensity: 0.7, roughness: 0.4 }),
    dark: M(0x2a3140, { emissive: 0x101820, emissiveIntensity: 0.25 }),
    steel: M(0x8a97a8, { emissive: 0x222830, emissiveIntensity: 0.2 }),
    glass: M(0x5ee8ff, { emissive: 0x1a8fb0, emissiveIntensity: 0.9, roughness: 0.2 }),
    trim: new THREE.MeshBasicMaterial({ color: priCol }),
    flame: new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
    gun: glow(0xff6b5a),
  };
}

/** SpaceShip: nose +Z. role = scout|fighter|interceptor */
export function buildSpaceShip(role, colorHex, secondary = '#ffe14d') {
  const look = applyTeamMats(colorHex, secondary);
  const root = new THREE.Group();
  const add = (mesh, parent = root) => { parent.add(mesh); return mesh; };
  const scale = role === 'interceptor' ? 1.15 : role === 'scout' ? 1.25 : 1.4;
  const L = role === 'interceptor' ? 2.0 : role === 'scout' ? 2.2 : 2.6;
  const R = role === 'fighter' ? 0.42 : 0.34;

  // hull
  const body = cyl(R * 0.25, R, L, 6, look.pri);
  body.rotation.x = Math.PI / 2; body.scale.set(1, 0.8, 1); add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(R * 0.25, 0.45, 6), look.sec);
  nose.rotation.x = Math.PI / 2; nose.position.z = L / 2 + 0.22; add(nose);
  add(box(0.03, 0.1, 0.16, look.glass, 0, R * 0.55, L * 0.15)).scale.set(1, 0.7, 1.4);
  // emissive team trim so colour pops
  add(box(R * 1.6, 0.06, L * 0.55, look.trim, 0, R * 0.15, 0));

  // wings
  for (const sx of [-1, 1]) {
    if (role === 'interceptor') {
      const w = box(1.0, 0.05, 0.35, look.sec, sx * (R + 0.45), -0.04, -0.1);
      w.rotation.z = sx * 0.2; add(w);
    } else if (role === 'scout') {
      add(box(0.55, 0.05, 0.5, look.sec, sx * (R + 0.3), -0.04, -0.15));
    } else {
      add(box(1.3, 0.06, 0.7, look.sec, sx * (R + 0.7), -0.05, -0.2));
    }
  }

  // engines + flames
  const flames = [];
  const engPts = role === 'fighter' ? [[-0.28, 0], [0.28, 0]] : [[0, 0]];
  for (const [ex, ey] of engPts) {
    const e = cyl(0.14, 0.18, 0.4, 6, look.dark); e.rotation.x = Math.PI / 2; e.position.set(ex, ey, -L / 2); add(e);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), look.flame);
    f.rotation.x = -Math.PI / 2; f.position.set(ex, ey, -L / 2 - 0.35); f.userData.base = 0.5; add(f); flames.push(f);
  }

  // guns / muzzles
  const muzzles = [];
  for (const sx of [-1, 1]) {
    const g = cyl(0.04, 0.04, 0.55, 6, look.dark); g.rotation.x = Math.PI / 2;
    g.position.set(sx * R * 0.7, -R * 0.35, L * 0.2); add(g);
    const mz = new THREE.Object3D(); mz.position.set(sx * R * 0.7, -R * 0.35, L * 0.2 + 0.3); root.add(mz); muzzles.push(mz);
  }

  // shield bubble
  const shMat = makeShieldMat(0x6ff3ff);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), shMat);
  shield.scale.set(L * 0.55, R * 2.2, L * 0.55); root.add(shield);

  root.scale.setScalar(scale);
  root.userData = { kind: 'spaceship', flames, muzzles, shield, shMat, look };
  return root;
}

/** BattleShip: nose +X (rotated to +Z in battle). role = corvette|cruiser */
export function buildBattleShip(role, colorHex, secondary = '#ffe14d') {
  const look = applyTeamMats(colorHex, secondary);
  const root = new THREE.Group();
  const isCruiser = role === 'cruiser';
  const L = isCruiser ? 6.4 : 4.2;
  const W = isCruiser ? 1.7 : 1.15;
  const H = isCruiser ? 1.1 : 0.85;
  const turretsN = isCruiser ? 4 : 2;

  root.add(box(L * 0.62, H, W, look.pri, -L * 0.07, 0, 0));
  const nose = cyl(0.02, W * 0.7, L * 0.36, 4, look.pri);
  nose.rotation.z = -Math.PI / 2; nose.rotation.x = Math.PI / 4;
  nose.scale.set(1, 1, H / W * 1.05); nose.position.set(L * 0.4, 0, 0); root.add(nose);
  root.add(box(L * 0.7, H * 0.3, W * 0.55, look.dark, -L * 0.04, -H * 0.6, 0));
  root.add(box(L * 0.64, H * 0.08, W * 1.02, look.sec, -L * 0.07, H * 0.18, 0));
  root.add(box(L * 0.14, H * 0.55, W * 0.4, look.pri, -L * 0.26, H * 0.75, 0));
  root.add(box(L * 0.1, H * 0.16, W * 0.42, glow(0x8fe8ff), -L * 0.2, H * 0.82, 0));

  // hangar bay glow
  root.add(box(L * 0.22, H * 0.45, 0.05, M(0x0d1016, { roughness: 1 }), -L * 0.02, -H * 0.1, W / 2 + 0.01));
  root.add(box(L * 0.22, 0.03, 0.05, glow(0x7dffb0), -L * 0.02, H * 0.12, W / 2 + 0.02));
  const hangar = new THREE.Object3D(); hangar.position.set(-L * 0.02, -H * 0.1, W / 2 + 0.3); root.add(hangar);

  // turrets
  const turrets = [];
  const pts = [];
  for (let i = 0; i < turretsN; i++) {
    if (i < Math.ceil(turretsN / 2)) {
      pts.push([L * 0.15 - i * L * 0.22, H / 2 + 0.05, 0]);
    } else {
      const s = i % 2 ? -1 : 1;
      pts.push([L * 0.05 - (i - 2) * L * 0.2, H * 0.1, s * (W / 2 + 0.08)]);
    }
  }
  for (const [x, y, z] of pts) {
    const node = new THREE.Group(); node.position.set(x, y, z);
    node.add(box(0.28, 0.12, 0.22, look.pri, 0, 0.08, 0));
    const head = new THREE.Group(); head.position.y = 0.14; node.add(head);
    head.add(box(0.22, 0.1, 0.18, look.steel));
    const b = cyl(0.03, 0.03, 0.4, 6, look.steel); b.rotation.z = -Math.PI / 2; b.position.set(0.28, 0.02, 0); head.add(b);
    const mz = new THREE.Object3D(); mz.position.set(0.48, 0.02, 0); head.add(mz);
    root.add(node); turrets.push({ node, head, muzzles: [mz] });
  }

  // engines
  const flames = [];
  const nE = isCruiser ? 3 : 2;
  for (let i = 0; i < nE; i++) {
    const zz = (i - (nE - 1) / 2) * (W * 0.55);
    const nz = cyl(H * 0.25, H * 0.3, L * 0.1, 8, look.dark); nz.rotation.z = Math.PI / 2; nz.position.set(-L * 0.42, 0, zz); root.add(nz);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(H * 0.22, L * 0.12, 8), glow(0x4ab8ff));
    fl.material.transparent = true; fl.material.opacity = 0.85;
    fl.rotation.z = Math.PI / 2; fl.position.set(-L * 0.52, 0, zz); root.add(fl); flames.push(fl);
  }

  // shield
  const shMat = makeShieldMat(isCruiser ? 0x5cf0ff : 0x4aa8ff);
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), shMat);
  shield.scale.set(L * 0.66, H * 1.7 + 0.3, W * 1.0 + 0.35); root.add(shield);

  root.scale.setScalar(1.35);
  // Rotate so nose points +Z (same as SpaceShip) for battle math
  root.rotation.y = -Math.PI / 2;

  root.userData = { kind: 'battleship', flames, turrets, hangar, shield, shMat, look, L, W, H };
  return root;
}

export function flashShield(mesh, amount = 1) {
  if (!mesh || !mesh.userData || !mesh.userData.shMat) return;
  const m = mesh.userData.shMat;
  m.userData.flash = Math.min(1, (m.userData.flash || 0) + amount);
  if (m.uniforms) m.uniforms.uFlash.value = m.userData.flash;
}

export function tickShield(mesh, dt) {
  if (!mesh || !mesh.userData || !mesh.userData.shMat) return;
  const m = mesh.userData.shMat;
  m.userData.flash = Math.max(0, (m.userData.flash || 0) - dt * 2.5);
  if (m.uniforms) m.uniforms.uFlash.value = m.userData.flash;
}

export function setShieldVisible(mesh, on) {
  if (!mesh || !mesh.userData || !mesh.userData.shield) return;
  mesh.userData.shield.visible = !!on;
}

export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((m) => {
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const x of mats) {
        if (x && x.dispose) x.dispose();
      }
    }
  });
}
