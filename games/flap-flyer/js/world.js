import * as THREE from 'three';
import { mulberry32, makeNoise2D } from './rng.js';

export const WORLD = { HALF: 600, SOFT: 520, CHUNK: 200, CHUNKS: 10, APPLES: 16, BEAM_H: 150 };
export const SKY = new THREE.Color('#f6efdc');

// Fog that thins with altitude so far mountains stay softly visible.
function softFog(mat, strength = 0.6) {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 wpF = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wpF = instanceMatrix * wpF;
      #endif
      vWY = (modelMatrix * wpF).y;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
        float fogF = smoothstep(fogNear, fogFar, vFogDepth) * mix(1.0, ${strength.toFixed(2)}, clamp((vWY - 40.0) / 160.0, 0.0, 1.0));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogF);
      #endif`);
  };
  return mat;
}

export function createWorld(scene, seed) {
  const rand = mulberry32(seed);
  const n1 = makeNoise2D(rand), n2 = makeNoise2D(rand), n3 = makeNoise2D(rand);
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);
  const disposables = [];
  const keep = (o) => (disposables.push(o), o);

  function height(x, z) {
    let h = 26 * n1(x / 280 + 11.3, z / 280 - 7.1) + 10 * n2(x / 110, z / 110) + 3 * n3(x / 38 + 3.2, z / 38 + 5.7);
    h += 16;
    const r = Math.hypot(x, z);
    if (r > 560) { const d = r - 560; h += d * 0.08 + d * d * 0.0001; }
    return h;
  }
  // ---------- terrain chunks (flat-shaded low poly, vertex colors)
  const terrainMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const cA = new THREE.Color('#b7cf98'), cB = new THREE.Color('#d2e0a6'), cC = new THREE.Color('#a8c48e'), cD = new THREE.Color('#e3dcb0');
  const tmpC = new THREE.Color();
  const C = WORLD.CHUNK, NC = WORLD.CHUNKS;
  for (let cx = 0; cx < NC; cx++) for (let cz = 0; cz < NC; cz++) {
    const ox = (cx - NC / 2 + 0.5) * C, oz = (cz - NC / 2 + 0.5) * C;
    const far = Math.max(Math.abs(ox), Math.abs(oz)) > 650;
    const seg = far ? 8 : 20;
    let g = new THREE.PlaneGeometry(C, C, seg, seg);
    g.rotateX(-Math.PI / 2);
    g.translate(ox, 0, oz);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
    const ng = g.toNonIndexed(); g.dispose(); g = ng;
    const p2 = g.attributes.position;
    const col = new Float32Array(p2.count * 3);
    for (let f = 0; f < p2.count; f += 3) {
      const fx = (p2.getX(f) + p2.getX(f + 1) + p2.getX(f + 2)) / 3, fz = (p2.getZ(f) + p2.getZ(f + 1) + p2.getZ(f + 2)) / 3;
      const fy = (p2.getY(f) + p2.getY(f + 1) + p2.getY(f + 2)) / 3;
      const t = THREE.MathUtils.clamp((fy - 5) / 45, 0, 1);
      tmpC.copy(cC).lerp(cA, t).lerp(cB, THREE.MathUtils.clamp(n2(fx / 60, fz / 60) * 1.4 + 0.3, 0, 1) * 0.6);
      const patch = n3(fx / 90 + 40, fz / 90);
      if (patch > 0.32) tmpC.lerp(cD, 0.45);
      const j = (Math.sin(fx * 12.9898 + fz * 78.233) * 43758.5453) % 1;
      tmpC.offsetHSL(0, 0, j * 0.025);
      for (let k = 0; k < 3; k++) { col[(f + k) * 3] = tmpC.r; col[(f + k) * 3 + 1] = tmpC.g; col[(f + k) * 3 + 2] = tmpC.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    keep(g);
    const m = new THREE.Mesh(g, terrainMat);
    m.matrixAutoUpdate = false;
    group.add(m);
  }

  // ---------- apples: hilltops, spread out
  const apples = [];
  {
    const cands = [];
    for (let x = -480; x <= 480; x += 16) for (let z = -480; z <= 480; z += 16) {
      if (Math.hypot(x, z) > 500 || Math.hypot(x, z) < 70) continue;
      const jx = x + (rand() - 0.5) * 12, jz = z + (rand() - 0.5) * 12;
      const h = height(jx, jz);
      const avg = (height(jx + 30, jz) + height(jx - 30, jz) + height(jx, jz + 30) + height(jx, jz - 30)) / 4;
      cands.push({ x: jx, z: jz, s: (h - avg) + h * 0.15 + rand() * 3 });
    }
    cands.sort((a, b) => b.s - a.s);
    let minD = 190;
    while (apples.length < WORLD.APPLES && minD > 20) {
      for (const c of cands) {
        if (apples.length >= WORLD.APPLES) break;
        if (apples.every((a) => Math.hypot(a.x - c.x, a.z - c.z) >= minD)) apples.push({ x: c.x, z: c.z });
      }
      minD *= 0.85;
    }
  }
  // apple meshes
  const appleGeo = keep(new THREE.IcosahedronGeometry(1.15, 1));
  const appleMat = keep(new THREE.MeshLambertMaterial({ color: '#e0473f', flatShading: true, emissive: '#5a0f0a' }));
  const stemGeo = keep(new THREE.CylinderGeometry(0.08, 0.1, 0.6, 5));
  const stemMat = keep(new THREE.MeshLambertMaterial({ color: '#7a5233' }));
  const leafGeo = keep(new THREE.BoxGeometry(0.55, 0.08, 0.3));
  const leafMat = keep(new THREE.MeshLambertMaterial({ color: '#6cc26a', flatShading: true }));
  const beamGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0));
  const beamMat = (col, a) => keep(new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(col) }, uA: { value: a }, uT: { value: 0 } },
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uCol; uniform float uA; uniform float uT; varying float vY; void main(){ float a = pow(1.0 - vY, 1.4) * uA * (0.85 + 0.15 * sin(uT * 2.0 + vY * 9.0)); a *= smoothstep(0.0, 0.03, vY); gl_FragColor = vec4(uCol, a); }',
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: false,
  }));
  const beamIn = beamMat('#ff5c80', 0.8), beamOut = beamMat('#ff9ab4', 0.24);
  for (const a of apples) {
    a.y = height(a.x, a.z) + 1.9;
    a.collected = false;
    const g = new THREE.Group();
    g.position.set(a.x, a.y, a.z);
    const body = new THREE.Mesh(appleGeo, appleMat); body.scale.set(1, 0.9, 1); g.add(body);
    const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.y = 1.2; g.add(stem);
    const leaf = new THREE.Mesh(leafGeo, leafMat); leaf.position.set(0.3, 1.35, 0); leaf.rotation.z = 0.5; g.add(leaf);
    a.spin = g;
    const bi = new THREE.Mesh(beamGeo, beamIn); bi.scale.set(0.9, WORLD.BEAM_H, 0.9); bi.position.set(a.x, a.y - 1.9, a.z);
    const bo = new THREE.Mesh(beamGeo, beamOut); bo.scale.set(2.8, WORLD.BEAM_H, 2.8); bo.position.copy(bi.position);
    bi.renderOrder = bo.renderOrder = 5;
    a.beams = [bi, bo];
    group.add(g, bi, bo);
  }
  const beamMats = [beamIn, beamOut];

  // ---------- trees (instanced)
  const trunkGeo = keep(new THREE.CylinderGeometry(0.16, 0.3, 1, 5).translate(0, 0.5, 0));
  const leafBallGeo = keep(new THREE.IcosahedronGeometry(1, 1));
  const trunkMat = keep(new THREE.MeshLambertMaterial({ color: '#8a6446', flatShading: true }));
  const folMat = keep(new THREE.MeshLambertMaterial({ flatShading: true }));
  const palette = ['#a9cfe3', '#a8e0c2', '#f2c39a', '#bfe3d0', '#9fc6e0', '#f5d1a8'].map((c) => new THREE.Color(c));
  const trunks = [], balls = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const TREES = 1300;
  let tries = 0;
  while (trunks.length < TREES && tries++ < 20000) {
    const x = (rand() - 0.5) * 1500, z = (rand() - 0.5) * 1500;
    const dens = n2(x / 160 + 50, z / 160 - 20);
    if (dens < -0.1 && rand() < 0.75) continue; // groves & meadows
    if (apples.some((a) => Math.hypot(a.x - x, a.z - z) < 11)) continue;
    if (Math.hypot(x, z) < 22) continue;
    const y = height(x, z) - 0.3;
    const th = 2.8 + rand() * 3.5;
    const col = palette[Math.floor(rand() * palette.length)];
    trunks.push(m4.clone().compose(p.set(x, y, z), q.identity(), s.set(1, th, 1)));
    const type = rand();
    const r0 = 1.8 + rand() * 1.6;
    const addBall = (dx, dy, dz, r) => {
      q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3));
      balls.push({ m: m4.clone().compose(p.set(x + dx, y + th + dy, z + dz), q, s.set(r, r * (0.9 + rand() * 0.25), r)), c: col.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.06) });
    };
    if (type < 0.5) addBall(0, r0 * 0.6, 0, r0);
    else if (type < 0.8) { addBall(0, r0 * 0.5, 0, r0 * 0.85); addBall(r0 * 0.6, r0 * 0.15, 0.2, r0 * 0.6); addBall(-r0 * 0.5, r0 * 0.25, -0.3, r0 * 0.62); }
    else { addBall(0, r0 * 0.4, 0, r0 * 0.8); addBall(0, r0 * 1.3, 0, r0 * 0.6); }
  }
  const trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, trunks.length);
  trunks.forEach((m, i) => trunkIM.setMatrixAt(i, m));
  const ballIM = new THREE.InstancedMesh(leafBallGeo, folMat, balls.length);
  balls.forEach((b, i) => { ballIM.setMatrixAt(i, b.m); ballIM.setColorAt(i, b.c); });
  trunkIM.frustumCulled = ballIM.frustumCulled = false;
  group.add(trunkIM, ballIM);
  disposables.push(trunkIM, ballIM);

  // ---------- mountains ring (instanced jagged cones, soft fog)
  const mtGeo = keep(new THREE.ConeGeometry(1, 1, 6, 3).translate(0, 0.5, 0));
  {
    const mp = mtGeo.attributes.position; // jag the cone a bit
    for (let i = 0; i < mp.count; i++) {
      const y = mp.getY(i);
      if (y > 0.05 && y < 0.95) { // hash of position so duplicated seam vertices move together (no cracks)
        const hsh = Math.abs(Math.sin(Math.round(mp.getX(i) * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(mp.getZ(i) * 1000) * 37.719) * 43758.5453) % 1;
        const k = 0.82 + hsh * 0.36; mp.setX(i, mp.getX(i) * k); mp.setZ(i, mp.getZ(i) * k); mp.setY(i, y + (hsh - 0.5) * 0.07);
      }
    }
    mtGeo.computeVertexNormals();
  }
  const mtMat = keep(softFog(new THREE.MeshLambertMaterial({ flatShading: true }), 0.62));
  const mtCols = ['#c8b8dc', '#e3c3c6', '#b9cde3', '#d7c9e6', '#e8d2bc'].map((c) => new THREE.Color(c));
  const MT = 90;
  const mtIM = new THREE.InstancedMesh(mtGeo, mtMat, MT);
  for (let i = 0; i < MT; i++) {
    const ang = (i / MT) * Math.PI * 2 + rand() * 0.05;
    const r = 1020 + rand() * 220 + (i % 2) * 140;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const h = 80 + rand() * 120 + (i % 2) * 40, w = 130 + rand() * 110;
    q.setFromEuler(e.set(0, rand() * 6.28, 0));
    mtIM.setMatrixAt(i, m4.compose(p.set(x, height(x, z) - 30, z), q, s.set(w, h, w * (0.8 + rand() * 0.4))));
    mtIM.setColorAt(i, mtCols[i % mtCols.length].clone().lerp(SKY, 0.15));
  }
  mtIM.frustumCulled = false;
  group.add(mtIM);
  disposables.push(mtIM);

  return {
    group, height, apples, seed,
    trees: trunks.length, foliage: balls.length,
    update(t, dt) {
      for (const m of beamMats) m.uniforms.uT.value = t;
      for (const a of apples) if (!a.collected) { a.spin.rotation.y = t * 0.9; a.spin.position.y = a.y + Math.sin(t * 1.6 + a.x) * 0.35; }
    },
    collect(a) {
      a.collected = true;
      a.spin.visible = false; a.beams.forEach((b) => (b.visible = false));
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose?.();
    },
  };
}
