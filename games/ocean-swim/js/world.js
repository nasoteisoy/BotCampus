// Turtle Bay: one round sandy bay under the sea (surface at y = 0), reef rocks, colourful coral, swaying kelp,
// light rays, fish schools. To find (18): shells on the sand (dive!), bubble rings up high (float up and swim
// through), pearls in open clams (each pearl = a fish friend). Everything is primitives (no assets).
import * as THREE from 'three';
import { mulberry32, makeNoise2D } from './rng.js';

export const WORLD = { R: 120, SOFT: 104, SIZE: 380, SURF: 0, TOP: -1.4, RAY_H: 40 };
export const WATER = new THREE.Color('#3aa6d0'), DEEP = new THREE.Color('#1d6f9e');
export const N_SHELL = 8, N_RING = 6, N_PEARL = 4;

export function createWorld(scene, seed) {
  const rand = mulberry32(seed), rr = (a, b) => a + (b - a) * rand();
  const n1 = makeNoise2D(rand), n2 = makeNoise2D(rand);
  const group = new THREE.Group(); group.name = 'world'; scene.add(group);
  const disposables = []; const keep = (o) => (disposables.push(o), o);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), e3 = new THREE.Euler(), cc = new THREE.Color();
  const uTime = { value: 0 };

  // ---------- sea floor: gentle dunes, deeper in the middle, canyon walls around the edge
  function floor(x, z) {
    const r = Math.hypot(x, z);
    let h = -14 + 1.6 * n1(x / 40 + 2, z / 40 - 3) + 0.6 * n2(x / 11, z / 11);
    if (r > WORLD.SOFT) { const d = r - WORLD.SOFT, k = Math.min(1, d / 40); h += d * 0.12 + k * k * (3 - 2 * k) * 16 * (0.6 + 0.5 * (n1(Math.atan2(x, z) * 4, 7.7) + 0.5)); }
    return Math.min(h, -2.5);
  }
  // ---------- reef rocks (round boulders: swim around or over)
  const rocks = [], items = [], coralSpots = [];
  const clear = (x, z, d) => rocks.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + d) && Math.hypot(x, z) > 8;
  const spot = (rMin, rMax, d) => { for (let k = 0; k < 200; k++) { const a = rand() * Math.PI * 2, r = rr(rMin, rMax), x = Math.cos(a) * r, z = Math.sin(a) * r; if (clear(x, z, d)) return { x, z }; } return { x: rr(-50, 50), z: rr(-50, 50) }; };
  for (let i = 0; i < 22; i++) { const s = spot(14, WORLD.SOFT - 6, 4); const r = rr(1.8, 4); rocks.push({ ...s, r, y: floor(s.x, s.z) + r * 0.35, clam: false }); }
  /** lowest y you can swim at (x, z): the sand, or over the top of a rock */
  function ground(x, z) {
    let h = floor(x, z);
    for (const o of rocks) { const dx = x - o.x, dz = z - o.z, d2 = dx * dx + dz * dz; if (d2 < o.r * o.r) h = Math.max(h, o.y + Math.sqrt(o.r * o.r - d2) * 0.75); }
    return h;
  }

  // ---------- water: surface seen from below, light rays
  const surf = new THREE.Mesh(keep(new THREE.PlaneGeometry(WORLD.SIZE * 1.4, WORLD.SIZE * 1.4, 1, 1)), keep(new THREE.MeshBasicMaterial({ color: '#bfeaf5', side: THREE.DoubleSide, transparent: true, opacity: 0.85, fog: true })));
  surf.rotation.x = Math.PI / 2; surf.position.y = WORLD.SURF; group.add(surf);
  const sunDisc = new THREE.Mesh(keep(new THREE.CircleGeometry(14, 24)), keep(new THREE.MeshBasicMaterial({ color: '#f4fdff', fog: false, transparent: true, opacity: 0.55 })));
  sunDisc.rotation.x = Math.PI / 2; sunDisc.position.set(-30, WORLD.SURF - 0.05, -60); group.add(sunDisc);
  const rayGeo = keep(new THREE.CylinderGeometry(1.2, 4.5, WORLD.RAY_H, 8, 1, true)); rayGeo.translate(0, -WORLD.RAY_H / 2, 0);
  const rayMat = keep(new THREE.MeshBasicMaterial({ color: '#e8fbff', transparent: true, opacity: 0.07, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  const rays = new THREE.InstancedMesh(rayGeo, rayMat, 26);
  for (let i = 0; i < 26; i++) { const a = rand() * 6.283, r = Math.sqrt(rand()) * WORLD.SOFT; m4.compose(p3.set(Math.cos(a) * r, WORLD.SURF, Math.sin(a) * r), q4.setFromEuler(e3.set(0.25, rand() * 3, 0.1)), s3.set(rr(0.6, 1.4), 1, rr(0.6, 1.4))); rays.setMatrixAt(i, m4); }
  rays.renderOrder = 6; group.add(rays);

  // ---------- sand (vertex colours: light sand, darker ripples, rocky walls)
  {
    let g = new THREE.PlaneGeometry(WORLD.SIZE, WORLD.SIZE, 110, 110); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, floor(pos.getX(i), pos.getZ(i)));
    const ng = g.toNonIndexed(); g.dispose(); g = keep(ng); g.computeVertexNormals();
    const p2 = g.attributes.position, col = new Float32Array(p2.count * 3);
    const sand = new THREE.Color('#f1dfae'), sand2 = new THREE.Color('#e2c98f'), wall = new THREE.Color('#8f8aa0'), grass = new THREE.Color('#7fc49a');
    for (let i = 0; i < p2.count; i += 3) {
      const x = (p2.getX(i) + p2.getX(i + 1) + p2.getX(i + 2)) / 3, z = (p2.getZ(i) + p2.getZ(i + 1) + p2.getZ(i + 2)) / 3, r = Math.hypot(x, z);
      const rip = Math.sin(x * 0.6 + n2(x / 20, z / 20) * 4) * 0.5 + 0.5;
      cc.copy(sand).lerp(sand2, rip * 0.5);
      if (n1(x / 14 + 9, z / 14) > 0.35) cc.lerp(grass, 0.45); // sea grass patches
      if (r > WORLD.SOFT + 4) cc.lerp(wall, Math.min(1, (r - WORLD.SOFT - 4) / 22));
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = cc.r; col[(i + k) * 3 + 1] = cc.g; col[(i + k) * 3 + 2] = cc.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))));
  }
  // ---------- rocks
  const rockGeo = keep(new THREE.DodecahedronGeometry(1, 1));
  const rockMats = ['#8d86a8', '#9a8fa0', '#7f8fa8'].map((c) => keep(new THREE.MeshLambertMaterial({ color: c, flatShading: true })));
  for (const [i, o] of rocks.entries()) { const m = new THREE.Mesh(rockGeo, rockMats[i % 3]); m.scale.set(o.r, o.r * 0.75, o.r); m.position.set(o.x, o.y, o.z); m.rotation.y = rand() * 3; group.add(m); }
  // ---------- coral: instanced blobs + branches in bright colours, kelp that sways (vertex shader)
  const CORAL = ['#ff7a8a', '#ffb347', '#ff8fd0', '#b48cff', '#5fd3c3', '#ffd95a'];
  const blobGeo = keep(new THREE.IcosahedronGeometry(1, 1)), branchGeo = keep(new THREE.CylinderGeometry(0.12, 0.22, 1, 6)); branchGeo.translate(0, 0.5, 0);
  const NC = 160;
  const blobs = new THREE.InstancedMesh(blobGeo, keep(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })), NC);
  const branches = new THREE.InstancedMesh(branchGeo, keep(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })), NC * 3);
  let nb = 0;
  for (let i = 0; i < NC; i++) {
    let x, z;
    if (i < rocks.length * 3) { const o = rocks[i % rocks.length], a = rand() * 6.283; x = o.x + Math.cos(a) * o.r * 1.05; z = o.z + Math.sin(a) * o.r * 1.05; } else { const s = spot(9, WORLD.SOFT, 1); x = s.x; z = s.z; }
    const y = floor(x, z), w = rr(0.5, 1.2);
    cc.set(CORAL[i % CORAL.length]);
    m4.compose(p3.set(x, y + w * 0.3, z), q4.identity(), s3.set(w, w * 0.7, w)); blobs.setMatrixAt(i, m4); blobs.setColorAt(i, cc);
    for (let k = 0; k < 3; k++) { m4.compose(p3.set(x + rr(-0.3, 0.3), y + w * 0.4, z + rr(-0.3, 0.3)), q4.setFromEuler(e3.set(rr(-0.5, 0.5), 0, rr(-0.5, 0.5))), s3.set(1, rr(0.8, 1.8), 1)); branches.setMatrixAt(nb, m4); branches.setColorAt(nb, cc.clone().offsetHSL(0.03, 0, 0.06)); nb++; }
    coralSpots.push({ x, z });
  }
  branches.count = nb; group.add(blobs, branches);
  const kelpGeo = keep(new THREE.BoxGeometry(0.35, 1, 0.08, 1, 6, 1)); kelpGeo.translate(0, 0.5, 0);
  const kelpMat = keep(new THREE.MeshLambertMaterial({ color: '#5fae6a', side: THREE.DoubleSide }));
  kelpMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float kp = instanceMatrix[3].x * 0.3 + instanceMatrix[3].z * 0.2;
      transformed.x += sin(uTime * 1.3 + kp + position.y * 2.0) * 0.18 * position.y * position.y;
      transformed.z += cos(uTime * 1.1 + kp) * 0.1 * position.y;`);
  };
  const NK = 140, kelp = new THREE.InstancedMesh(kelpGeo, kelpMat, NK);
  for (let i = 0; i < NK; i++) {
    const c = i % 7 === 0 ? spot(9, WORLD.SOFT, 1) : (() => { const a = rand() * 6.283, r = rr(25, WORLD.SOFT); const b = { x: Math.cos(a) * r, z: Math.sin(a) * r }; return clear(b.x, b.z, 0.5) ? b : spot(9, WORLD.SOFT, 1); })();
    const h = rr(4, 9); m4.compose(p3.set(c.x, floor(c.x, c.z) - 0.2, c.z), q4.setFromEuler(e3.set(0, rand() * 3, 0)), s3.set(rr(0.8, 1.3), h, 1)); kelp.setMatrixAt(i, m4);
    kelp.setColorAt(i, cc.set(['#5fae6a', '#7cc46a', '#4f9a63'][i % 3]));
  }
  group.add(kelp);
  // starfish + pebbles (cheap floor detail)
  const starGeo = keep(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 5));
  const stars = new THREE.InstancedMesh(starGeo, keep(new THREE.MeshLambertMaterial({ color: '#ffffff' })), 60);
  for (let i = 0; i < 60; i++) { const s = spot(9, WORLD.SOFT, 0.5); m4.compose(p3.set(s.x, floor(s.x, s.z) + 0.05, s.z), q4.setFromEuler(e3.set(0, rand() * 3, 0)), s3.set(1, 1, 1)); stars.setMatrixAt(i, m4); stars.setColorAt(i, cc.set(['#ff8a5c', '#ffcc4d', '#ff6fa8'][i % 3])); }
  group.add(stars);

  // ---------- fish schools (decor): instanced little fish circling slowly
  const fishGeo = keep(new THREE.ConeGeometry(0.22, 0.7, 6)); fishGeo.rotateX(-Math.PI / 2);
  const NS = 6, PER = 12, fish = new THREE.InstancedMesh(fishGeo, keep(new THREE.MeshLambertMaterial({ color: '#ffffff' })), NS * PER);
  const schools = [];
  for (let s = 0; s < NS; s++) { const p = spot(15, WORLD.SOFT - 10, 2); schools.push({ x: p.x, z: p.z, y: rr(-11, -4), r: rr(4, 8), w: rr(0.25, 0.45) * (rand() < 0.5 ? -1 : 1), c: ['#ffd84a', '#ff8a5c', '#7fd4ff', '#c39bff', '#ffffff', '#ff9ccb'][s] }); }
  for (let i = 0; i < NS * PER; i++) fish.setColorAt(i, cc.set(schools[Math.floor(i / PER)].c));
  fish.frustumCulled = false; group.add(fish);

  // ---------- collectibles
  // 'shell' (on the sand: dive down), 'ring' (bubble ring up high: swim through), 'pearl' (in an open clam: a fish friend)
  const beamGeo = keep(new THREE.CylinderGeometry(0.7, 0.7, 30, 10, 1, true)); beamGeo.translate(0, 15, 0);
  const beam = (color) => { const m = new THREE.Mesh(beamGeo, keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))); m.renderOrder = 5; return m; };
  const shellGeo = keep(new THREE.ConeGeometry(0.55, 0.3, 9, 1, true)); shellGeo.rotateX(Math.PI);
  const shellRibGeo = keep(new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)); shellRibGeo.scale(1, 0.45, 1);
  const SHELLC = ['#ffb3c7', '#ffd59a', '#fff1d6', '#d9c2ff'];
  const ringGeo = keep(new THREE.TorusGeometry(1.7, 0.18, 8, 28));
  const bubbleGeo = keep(new THREE.SphereGeometry(0.16, 8, 6));
  const pearlGeo = keep(new THREE.SphereGeometry(0.34, 16, 12));
  const clamGeo = keep(new THREE.SphereGeometry(0.75, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)); clamGeo.scale(1, 0.45, 0.9);
  function makeItem(kind, x, y, z, opts = {}) {
    const g = new THREE.Group(); let mesh;
    if (kind === 'shell') {
      const c = SHELLC[items.length % 4];
      mesh = new THREE.Mesh(shellRibGeo, keep(new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, flatShading: true })));
      mesh.scale.setScalar(1.25);
    } else if (kind === 'ring') {
      mesh = new THREE.Group();
      const t = new THREE.Mesh(ringGeo, keep(new THREE.MeshLambertMaterial({ color: '#e8fbff', emissive: '#9be7ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }))); mesh.add(t);
      for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(bubbleGeo, keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }))); const a = (i / 10) * 6.283; b.position.set(Math.cos(a) * 1.7, Math.sin(a) * 1.7, 0.2); mesh.add(b); }
      mesh.rotation.y = opts.yaw || 0;
    } else {
      mesh = new THREE.Group();
      const clamM = keep(new THREE.MeshLambertMaterial({ color: '#a98bd6', flatShading: true }));
      const lo = new THREE.Mesh(clamGeo, clamM); lo.rotation.x = Math.PI; lo.position.y = -0.05; mesh.add(lo);
      const hi = new THREE.Mesh(clamGeo, clamM); hi.position.set(0, 0.05, 0.55); hi.rotation.x = -1.0; hi.position.z = 0.35; mesh.add(hi);
      const pearl = new THREE.Mesh(pearlGeo, keep(new THREE.MeshLambertMaterial({ color: '#fffaf2', emissive: opts.color, emissiveIntensity: 0.35 }))); pearl.position.y = 0.25; mesh.add(pearl);
      mesh.userData.pearl = pearl;
    }
    g.add(mesh);
    const it = { kind, x, y, z, collected: false, g, mesh, phase: rand() * 6, state: 'ready', color: opts.color, beam: kind === 'ring' ? null : beam(kind === 'pearl' ? opts.color : '#fff3c4') };
    if (it.beam) { it.beam.position.set(x, y - 0.3, z); group.add(it.beam); }
    g.position.set(x, y, z); group.add(g);
    it.extra = () => ({ state: it.state });
    items.push(it); return it;
  }
  for (let i = 0; i < N_SHELL; i++) { const s = spot(10 + i * 8, Math.min(WORLD.SOFT - 8, 30 + i * 10), 1.5); makeItem('shell', s.x, floor(s.x, s.z) + 0.35, s.z); }
  for (let i = 0; i < N_RING; i++) { const s = spot(14 + i * 9, Math.min(WORLD.SOFT - 10, 34 + i * 10), 3); makeItem('ring', s.x, rr(-4.5, -2.6), s.z, { yaw: rand() * 3 }); }
  const PEARLC = ['#ffd84a', '#ff8a5c', '#7fd4ff', '#ff9ccb'];
  const clamRocks = rocks.filter((o) => Math.hypot(o.x, o.z) < WORLD.SOFT - 12).sort(() => rand() - 0.5);
  for (let i = 0; i < N_PEARL; i++) {
    const o = clamRocks[i];
    if (o) { o.clam = true; makeItem('pearl', o.x, o.y + o.r * 0.75 + 0.3, o.z, { color: PEARLC[i] }); continue; }
    const s = spot(20, WORLD.SOFT - 10, 2); makeItem('pearl', s.x, floor(s.x, s.z) + 0.4, s.z, { color: PEARLC[i] });
  }
  // ---------- bubble vents (decor: streams of bubbles from the sand)
  const vents = []; for (let i = 0; i < 8; i++) { const s = spot(10, WORLD.SOFT - 5, 1); vents.push({ x: s.x, z: s.z, y: floor(s.x, s.z) }); }

  return {
    group, items, rocks, vents, floor, ground, height: ground, schools,
    update(time, dt) {
      uTime.value = time;
      for (const it of items) {
        if (it.collected) continue;
        if (it.kind === 'shell') { it.g.position.y = it.y + 0.12 + Math.sin(time * 2 + it.phase) * 0.1; it.mesh.rotation.y = time * 1.2 + it.phase; }
        else if (it.kind === 'ring') { it.g.position.y = it.y + Math.sin(time * 1.1 + it.phase) * 0.25; it.mesh.rotation.z = time * 0.6; const s = 1 + Math.sin(time * 2.4 + it.phase) * 0.04; it.mesh.scale.setScalar(s); }
        else { const p = it.mesh.userData.pearl; p.position.y = 0.25 + Math.sin(time * 2 + it.phase) * 0.05; it.mesh.rotation.y = Math.sin(time * 0.5 + it.phase) * 0.4; }
        if (it.beam) it.beam.material.opacity = 0.08 + 0.05 * Math.sin(time * 3 + it.phase);
      }
      for (let s = 0, k = 0; s < NS; s++) {
        const S = schools[s];
        for (let i = 0; i < PER; i++, k++) {
          const a = time * S.w + (i / PER) * 1.6 + s, rr2 = S.r + Math.sin(i * 2.3) * 1.2, x = S.x + Math.cos(a) * rr2, z = S.z + Math.sin(a) * rr2, y = S.y + Math.sin(i * 1.7 + time) * 0.6;
          q4.setFromEuler(e3.set(0, S.w > 0 ? Math.PI - a : -a, 0)); // face along the circle
          m4.compose(p3.set(x, y, z), q4, s3.set(1, 1, 1 + Math.sin(time * 9 + i) * 0.1)); fish.setMatrixAt(k, m4);
        }
      }
      fish.instanceMatrix.needsUpdate = true;
    },
    collect(it) { it.collected = true; it.g.visible = false; if (it.beam) it.beam.visible = false; it.state = 'got'; },
    setView(camPos, q) { stars.visible = !q.lowDetail; rays.visible = true; },
    dispose() { scene.remove(group); for (const d of disposables) d.dispose?.(); blobs.dispose(); branches.dispose(); kelp.dispose(); stars.dispose(); fish.dispose(); rays.dispose(); },
  };
}
