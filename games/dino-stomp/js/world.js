// Dino Valley: one open round valley (no chunks: small enough for one mesh), rim mountains, a smoking volcano,
// trees (some with big golden fruit that drops when you ROAR nearby), flat-top rocks to jump onto, logs to hop,
// ground fruit and dino eggs (on rocks / in nests). Everything is primitives + vertex colours (no assets).
import * as THREE from 'three';
import { mulberry32, makeNoise2D } from './rng.js';

export const WORLD = { R: 150, SOFT: 132, RIM: 175, SIZE: 460, ROAR_R: 22, BEAM_H: 26 };
export const SKY_TOP = new THREE.Color('#7cc4f0'), SKY_LOW = new THREE.Color('#fdf1d2');
export const N_GROUND = 8, N_TREE = 6, N_EGG = 4;

export function createWorld(scene, seed) {
  const rand = mulberry32(seed), rr = (a, b) => a + (b - a) * rand();
  const n1 = makeNoise2D(rand), n2 = makeNoise2D(rand);
  const group = new THREE.Group(); group.name = 'world'; scene.add(group);
  const disposables = []; const keep = (o) => (disposables.push(o), o);

  // ---------- terrain height: gentle hills, flat middle, mountains around the rim
  function terrain(x, z) {
    const r = Math.hypot(x, z);
    let h = 2.2 * n1(x / 55 + 3.1, z / 55 - 1.7) + 0.8 * n2(x / 19, z / 19);
    h *= Math.min(1, Math.max(0.25, (r - 12) / 40));
    if (r > WORLD.SOFT) { // a ring of mountains (capped, so the sky shows above them)
      const d = r - WORLD.SOFT, k = Math.min(1, d / 50), sm = k * k * (3 - 2 * k);
      h += d * 0.08 + sm * 42 * (0.55 + 0.6 * (n1(Math.atan2(x, z) * 4, 9.5) + 0.5)) + sm * 6 * n2(x / 13, z / 13);
    }
    return h;
  }
  // ---------- rocks (flat tops you can stand on) + logs (hop over) as obstacles
  const rocks = [], logs = [], trees = [], items = [];
  const clear = (x, z, d) => rocks.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + d) && trees.every((o) => Math.hypot(o.x - x, o.z - z) > d + 1.5) && logs.every((o) => Math.hypot(o.x - x, o.z - z) > o.len / 2 + d) && Math.hypot(x, z) > 9;
  const spot = (rMin, rMax, d) => { for (let k = 0; k < 200; k++) { const a = rand() * Math.PI * 2, r = rr(rMin, rMax), x = Math.cos(a) * r, z = Math.sin(a) * r; if (clear(x, z, d)) return { x, z }; } return { x: rr(-60, 60), z: rr(-60, 60) }; };
  for (let i = 0; i < 16; i++) { const s = spot(16, WORLD.SOFT - 10, 5); const r = rr(1.6, 3.2); rocks.push({ ...s, r, top: terrain(s.x, s.z) + rr(1.1, 1.6), egg: false }); }
  function ground(x, z) { // terrain + standing surfaces (rock tops)
    let h = terrain(x, z);
    for (const o of rocks) { const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < o.r * o.r) h = Math.max(h, o.top); }
    return h;
  }
  for (let i = 0; i < 12; i++) { const s = spot(14, WORLD.SOFT - 8, 4); logs.push({ ...s, a: rand() * Math.PI, len: rr(3.5, 5.5), r: 0.42 }); }

  // ---------- sky dome (vertical gradient) + sun + clouds
  const skyMat = keep(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY_TOP }, low: { value: SKY_LOW } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 low; varying vec3 vP; void main(){ float k = smoothstep(-0.05, 0.55, vP.y); gl_FragColor = vec4(mix(low, top, k), 1.0); }',
  }));
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(600, 24, 12)), skyMat); sky.renderOrder = -1; group.add(sky);
  const sun = new THREE.Mesh(keep(new THREE.CircleGeometry(28, 24)), keep(new THREE.MeshBasicMaterial({ color: '#fff6c8', fog: false })));
  sun.position.set(-260, 300, -380); sun.lookAt(0, 0, 0); group.add(sun);
  const cloudMat = keep(new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.45, flatShading: true }));
  const puff = keep(new THREE.IcosahedronGeometry(1, 1));
  const clouds = new THREE.InstancedMesh(puff, cloudMat, 60); const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), e3 = new THREE.Euler();
  for (let c = 0, k = 0; c < 12; c++) {
    const a = rand() * Math.PI * 2, r = rr(80, 260), cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = rr(55, 85);
    for (let j = 0; j < 5; j++, k++) { const s = rr(5, 10); p3.set(cx + rr(-12, 12), cy + rr(-2, 3), cz + rr(-6, 6)); s3.set(s * 1.4, s * 0.8, s); m4.compose(p3, q4.identity(), s3); clouds.setMatrixAt(k, m4); }
  }
  group.add(clouds);

  // ---------- ground mesh (flat-shaded, vertex colours: grass, darker patches, sand by the rocks, rock on the rim)
  {
    let g = new THREE.PlaneGeometry(WORLD.SIZE, WORLD.SIZE, 130, 130); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrain(pos.getX(i), pos.getZ(i)));
    const ng = g.toNonIndexed(); g.dispose(); g = keep(ng); g.computeVertexNormals();
    const p2 = g.attributes.position, col = new Float32Array(p2.count * 3), c = new THREE.Color();
    const grass = new THREE.Color('#8fcf6a'), grass2 = new THREE.Color('#a9da74'), dark = new THREE.Color('#74b85c'), sand = new THREE.Color('#e9d9a0'), rockC = new THREE.Color('#b9a58f'), snow = new THREE.Color('#fbf7ee');
    for (let i = 0; i < p2.count; i += 3) {
      const x = (p2.getX(i) + p2.getX(i + 1) + p2.getX(i + 2)) / 3, z = (p2.getZ(i) + p2.getZ(i + 1) + p2.getZ(i + 2)) / 3, y = (p2.getY(i) + p2.getY(i + 1) + p2.getY(i + 2)) / 3;
      const r = Math.hypot(x, z), nz = n2(x / 9 + 7, z / 9);
      c.copy(grass).lerp(grass2, Math.max(0, nz + 0.3)).lerp(dark, Math.max(0, -nz - 0.15) * 1.5);
      const path = Math.abs(Math.sin(Math.atan2(z, x) * 3 + r * 0.035)) < 0.06 && r < WORLD.SOFT ? 0.55 : 0; // three sandy paths out from the middle
      if (path) c.lerp(sand, path);
      if (r < 9) c.lerp(sand, 0.5);
      if (r > WORLD.SOFT + 6) c.lerp(rockC, Math.min(1, (r - WORLD.SOFT - 6) / 25));
      if (y > 55) c.lerp(snow, Math.min(1, (y - 55) / 12));
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(new THREE.Mesh(g, keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))));
  }
  // ---------- volcano (decor, on the rim) + smoke puffs (animated in update)
  const volc = { x: 0, z: 0, top: 0 };
  {
    const a = rand() * Math.PI * 2; volc.x = Math.cos(a) * (WORLD.SOFT + 42); volc.z = Math.sin(a) * (WORLD.SOFT + 42);
    const base = terrain(volc.x, volc.z) - 4; volc.top = base + 46;
    const vg = keep(new THREE.CylinderGeometry(7, 34, 50, 14, 4, true)); const vp = vg.attributes.position;
    for (let i = 0; i < vp.count; i++) { const y = vp.getY(i); if (y > -24 && y < 24) { vp.setX(i, vp.getX(i) * (1 + 0.08 * Math.sin(i * 7.3))); vp.setZ(i, vp.getZ(i) * (1 + 0.08 * Math.cos(i * 3.1))); } }
    vg.computeVertexNormals();
    const v = new THREE.Mesh(vg, keep(new THREE.MeshLambertMaterial({ color: '#9b7d6a', flatShading: true }))); v.position.set(volc.x, base + 25, volc.z); group.add(v);
    const lava = new THREE.Mesh(keep(new THREE.CircleGeometry(7, 14)), keep(new THREE.MeshBasicMaterial({ color: '#ff7a2e', fog: false }))); lava.rotation.x = -Math.PI / 2; lava.position.set(volc.x, base + 48.5, volc.z); group.add(lava);
    for (let i = 0; i < 9; i++) { const d = new THREE.Mesh(puff, keep(new THREE.MeshLambertMaterial({ color: '#d9d2cc', transparent: true, opacity: 0.8, flatShading: true }))); d.userData.k = i / 9; group.add(d); volc[i] = d; }
  }
  // ---------- rocks (each a squashed dodecahedron, top flattened)
  const rockMat = keep(new THREE.MeshLambertMaterial({ color: '#bfb3a6', flatShading: true }));
  const rockGeo = keep(new THREE.DodecahedronGeometry(1, 0));
  for (const o of rocks) {
    const gy = terrain(o.x, o.z), h = o.top - gy;
    const m = new THREE.Mesh(rockGeo, rockMat); m.scale.set(o.r * 1.08, h * 1.3, o.r * 1.08); m.position.set(o.x, gy + h * 0.2, o.z); m.rotation.y = rand() * 3; group.add(m);
    const cap = new THREE.Mesh(keep(new THREE.CylinderGeometry(o.r * 0.92, o.r * 1.0, 0.25, 9)), keep(new THREE.MeshLambertMaterial({ color: '#cfc5b8', flatShading: true })));
    cap.position.set(o.x, o.top - 0.12, o.z); group.add(cap);
    const moss = new THREE.Mesh(keep(new THREE.CircleGeometry(o.r * 0.6, 8)), keep(new THREE.MeshLambertMaterial({ color: '#95c96f' }))); moss.rotation.x = -Math.PI / 2; moss.position.set(o.x + 0.2, o.top + 0.02, o.z - 0.1); group.add(moss);
  }
  // ---------- logs
  const logMat = keep(new THREE.MeshLambertMaterial({ color: '#a8754b', flatShading: true })), endMat = keep(new THREE.MeshLambertMaterial({ color: '#e8c48f' }));
  for (const o of logs) {
    const gy = terrain(o.x, o.z); o.top = gy + o.r * 2;
    const g = new THREE.Group(); g.position.set(o.x, gy + o.r * 0.9, o.z); g.rotation.y = o.a;
    const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(o.r, o.r, o.len, 9)), [logMat, endMat, endMat]); m.rotation.z = Math.PI / 2; g.add(m);
    const leaf = new THREE.Mesh(keep(new THREE.SphereGeometry(0.25, 6, 4)), keep(new THREE.MeshLambertMaterial({ color: '#6db35a', flatShading: true }))); leaf.position.set(o.len * 0.2, o.r, 0); g.add(leaf);
    group.add(g);
  }
  // ---------- trees: instanced (trunks + 2 canopy blobs); fruit trees are their own groups so they can shake
  const trunkGeo = keep(new THREE.CylinderGeometry(0.28, 0.42, 1, 7)); trunkGeo.translate(0, 0.5, 0);
  const canGeo = keep(new THREE.IcosahedronGeometry(1, 1));
  const trunkMat = keep(new THREE.MeshLambertMaterial({ color: '#9a6b45', flatShading: true }));
  const canMats = ['#5fae55', '#73bf5a', '#4f9d57', '#86c75e'].map((c) => keep(new THREE.MeshLambertMaterial({ color: c, flatShading: true })));
  const palmGeo = keep(new THREE.ConeGeometry(1, 1, 6));
  const NT = 150;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, NT), cans = new THREE.InstancedMesh(canGeo, canMats[0], NT * 2);
  cans.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NT * 2 * 3), 3);
  const cc = new THREE.Color();
  let nt = 0;
  const treeList = [];
  for (let i = 0; i < NT; i++) {
    const s = spot(10, WORLD.SOFT + 18, 2.5); const gy = terrain(s.x, s.z), h = rr(3, 5.5), w = rr(1.8, 2.8);
    trees.push({ x: s.x, z: s.z, r: 0.6 }); treeList.push({ x: s.x, z: s.z, gy, h, w, inst: nt });
    m4.compose(p3.set(s.x, gy - 0.2, s.z), q4.identity(), s3.set(1, h, 1)); trunks.setMatrixAt(nt, m4);
    m4.compose(p3.set(s.x, gy + h + w * 0.4, s.z), q4.setFromEuler(e3.set(0, rand() * 3, 0)), s3.set(w, w * 0.85, w)); cans.setMatrixAt(nt * 2, m4);
    m4.compose(p3.set(s.x + rr(-0.6, 0.6), gy + h + w * 1.05, s.z + rr(-0.6, 0.6)), q4, s3.set(w * 0.7, w * 0.62, w * 0.7)); cans.setMatrixAt(nt * 2 + 1, m4);
    cc.set(['#5fae55', '#73bf5a', '#4f9d57', '#86c75e'][i % 4]).multiplyScalar(1 / 0.37 * 0.37); cans.setColorAt(nt * 2, cc); cans.setColorAt(nt * 2 + 1, cc.offsetHSL(0, 0, 0.05));
    nt++;
  }
  trunks.count = nt; cans.count = nt * 2; cans.material = keep(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }));
  group.add(trunks, cans);
  // bushes + flowers (cheap ground detail)
  const bush = new THREE.InstancedMesh(canGeo, keep(new THREE.MeshLambertMaterial({ color: '#6cb85a', flatShading: true })), 90);
  for (let i = 0; i < 90; i++) { const s = spot(8, WORLD.SOFT, 1); const w = rr(0.6, 1.2); m4.compose(p3.set(s.x, terrain(s.x, s.z) + w * 0.3, s.z), q4.identity(), s3.set(w * 1.3, w, w * 1.3)); bush.setMatrixAt(i, m4); }
  group.add(bush);
  const flowerGeo = keep(new THREE.SphereGeometry(0.16, 5, 3));
  const flowers = new THREE.InstancedMesh(flowerGeo, keep(new THREE.MeshBasicMaterial({ color: '#ffffff' })), 400);
  for (let i = 0; i < 400; i++) { const a = rand() * 6.283, r = Math.sqrt(rand()) * WORLD.SOFT; const x = Math.cos(a) * r, z = Math.sin(a) * r; m4.compose(p3.set(x, terrain(x, z) + 0.12, z), q4.identity(), s3.set(1, 1, 1)); flowers.setMatrixAt(i, m4); flowers.setColorAt(i, cc.set(['#ffffff', '#ffd84a', '#ff8fb1', '#b7a4ff'][i % 4])); }
  group.add(flowers);

  // ---------- collectibles. kinds: 'fruit' (on the ground), 'tree' (golden fruit up in a tree: ROAR to drop it), 'egg' (on a rock / in a nest)
  const fruitGeo = keep(new THREE.SphereGeometry(0.5, 14, 10)), leafGeo = keep(new THREE.ConeGeometry(0.16, 0.4, 5));
  const eggGeo = keep(new THREE.SphereGeometry(0.5, 14, 12)); eggGeo.scale(0.8, 1.05, 0.8);
  const beamGeo = keep(new THREE.CylinderGeometry(0.9, 0.9, WORLD.BEAM_H, 12, 1, true)); beamGeo.translate(0, WORLD.BEAM_H / 2, 0);
  const FRUIT = ['#ff5a4e', '#ff9b2e', '#b65cf0', '#ff5aa0'];
  function beam(color) { const m = new THREE.Mesh(beamGeo, keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))); m.renderOrder = 5; return m; }
  function makeItem(kind, x, z, opts = {}) {
    const g = new THREE.Group(); let mesh;
    if (kind === 'egg') {
      const col = opts.color;
      mesh = new THREE.Mesh(eggGeo, keep(new THREE.MeshLambertMaterial({ color: '#fff6e4', emissive: col, emissiveIntensity: 0.12 })));
      for (let i = 0; i < 5; i++) { const dot = new THREE.Mesh(flowerGeo, keep(new THREE.MeshBasicMaterial({ color: col }))); const a = i * 1.3, y = -0.2 + (i % 3) * 0.22; dot.position.set(Math.cos(a) * 0.38, y, Math.sin(a) * 0.38); dot.scale.setScalar(1.1); mesh.add(dot); }
    } else {
      const c = kind === 'tree' ? '#ffcf3a' : FRUIT[items.length % 4];
      mesh = new THREE.Mesh(fruitGeo, keep(new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: kind === 'tree' ? 0.45 : 0.18 })));
      const lf = new THREE.Mesh(leafGeo, canMats[1]); lf.position.set(0.1, 0.5, 0); lf.rotation.z = -0.6; mesh.add(lf);
      if (kind === 'tree') mesh.scale.setScalar(1.25);
    }
    g.add(mesh);
    const it = { kind, x, z, y: opts.y ?? terrain(x, z) + 0.7, collected: false, g, mesh, beam: beam(kind === 'egg' ? opts.color : kind === 'tree' ? '#ffe27a' : '#ffffff'), phase: rand() * 6, state: kind === 'tree' ? 'up' : 'ready', vy: 0, tree: opts.tree, color: opts.color };
    it.beam.position.set(x, kind === 'tree' ? it.y + 1 : terrain(x, z), z);
    g.position.set(x, it.y, z); group.add(g); group.add(it.beam);
    it.extra = () => ({ state: it.state });
    items.push(it); return it;
  }
  // golden fruit trees: pick big trees spread around the valley, rebuild them as shakable groups
  const fruitTrees = [];
  {
    const cand = treeList.filter((t) => Math.hypot(t.x, t.z) < WORLD.SOFT - 15 && Math.hypot(t.x, t.z) > 18);
    for (let k = 0; k < N_TREE && cand.length; k++) {
      // farthest from the ones already picked
      let best = 0, bd = -1;
      cand.forEach((t, i) => { const d = Math.min(...fruitTrees.map((f) => Math.hypot(f.x - t.x, f.z - t.z)), 1e9) + rand() * 10; if (d > bd) { bd = d; best = i; } });
      const t = cand.splice(best, 1)[0];
      // hide the instanced copy, add a group
      m4.makeScale(0, 0, 0); trunks.setMatrixAt(t.inst, m4); cans.setMatrixAt(t.inst * 2, m4); cans.setMatrixAt(t.inst * 2 + 1, m4);
      const h = Math.max(4.2, t.h), w = Math.max(2.4, t.w);
      const tg = new THREE.Group(); tg.position.set(t.x, t.gy - 0.2, t.z); group.add(tg);
      const tr = new THREE.Mesh(trunkGeo, trunkMat); tr.scale.set(1.15, h, 1.15); tg.add(tr);
      const top = new THREE.Group(); top.position.y = h; tg.add(top);
      const c1 = new THREE.Mesh(canGeo, canMats[3]); c1.scale.set(w * 1.1, w * 0.85, w * 1.1); c1.position.y = w * 0.45; top.add(c1);
      const c2 = new THREE.Mesh(canGeo, canMats[1]); c2.scale.set(w * 0.75, w * 0.65, w * 0.75); c2.position.set(0.4, w * 1.1, -0.2); top.add(c2);
      const ft = { x: t.x, z: t.z, g: tg, top, shake: 0, h, w };
      fruitTrees.push(ft);
      // the fruit hangs on the camera-facing side of the canopy, low enough to see
      const a = rand() * 6.283, fx = t.x + Math.cos(a) * w * 0.9, fz = t.z + Math.sin(a) * w * 0.9;
      ft.item = makeItem('tree', fx, fz, { y: t.gy + h + 0.1, tree: ft });
    }
  }
  // ground fruit: spread out (some behind logs)
  for (let i = 0; i < N_GROUND; i++) {
    let s;
    if (i < 3 && logs[i]) { const o = logs[i], d = 2.2; s = { x: o.x + Math.sin(o.a) * d, z: o.z + Math.cos(o.a) * d }; } else s = spot(14 + i * 9, Math.min(WORLD.SOFT - 10, 40 + i * 12), 2);
    makeItem('fruit', s.x, s.z);
  }
  // eggs: two on rocks (jump up!), two in nests
  const EGGC = ['#4fb3ff', '#ff7ab8', '#ffb43a', '#7ad66b'];
  const eggRocks = rocks.filter((o) => Math.hypot(o.x, o.z) < WORLD.SOFT - 12).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const nestMat = keep(new THREE.MeshLambertMaterial({ color: '#c99a5e', flatShading: true }));
  for (let i = 0; i < N_EGG; i++) {
    const o = i < 2 ? eggRocks[i * 3] || eggRocks[0] : null;
    if (o) { o.egg = true; makeItem('egg', o.x, o.z, { y: o.top + 0.55, color: EGGC[i] }); continue; }
    const s = spot(30, WORLD.SOFT - 10, 3), gy = terrain(s.x, s.z);
    const nest = new THREE.Mesh(keep(new THREE.TorusGeometry(0.75, 0.3, 6, 12)), nestMat); nest.rotation.x = -Math.PI / 2; nest.position.set(s.x, gy + 0.2, s.z); group.add(nest);
    makeItem('egg', s.x, s.z, { y: gy + 0.6, color: EGGC[i] });
  }

  // ---------- roar shockwave rings (pool)
  const ringGeo = keep(new THREE.RingGeometry(0.85, 1, 40)); ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(ringGeo, keep(new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }))); m.visible = false; m.renderOrder = 4; group.add(m); rings.push({ m, t: 9 }); }

  return {
    group, items, rocks, logs, fruitTrees, volc, terrain, ground, trees: nt,
    height: ground,
    /** a roar at (x, z): ring + shakes trees nearby; golden fruit within ROAR_R falls. Returns the fruit that fell. */
    roar(x, y, z, color) {
      const r = rings.find((q) => q.t > 1) || rings[0]; r.t = 0; r.m.visible = true; r.m.position.set(x, y + 0.3, z); r.m.material.color.set(color || '#fff3b0');
      const fell = [];
      for (const t of fruitTrees) {
        const d = Math.hypot(t.x - x, t.z - z);
        if (d < WORLD.ROAR_R * 1.4) t.shake = Math.max(t.shake, 1 - d / (WORLD.ROAR_R * 1.4));
        if (d < WORLD.ROAR_R && t.item.state === 'up') { t.item.state = 'fall'; t.item.vy = 2; fell.push(t.item); }
      }
      return fell;
    },
    update(time, dt) {
      for (const it of items) {
        if (it.collected) continue;
        if (it.state === 'fall') { // drop to the ground with a bounce
          it.vy -= 18 * dt; it.y += it.vy * dt; const gy = terrain(it.x, it.z) + 0.7;
          if (it.y < gy) { it.y = gy; if (Math.abs(it.vy) > 2.5) it.vy = -it.vy * 0.35; else { it.vy = 0; it.state = 'ready'; } }
          it.beam.position.y = terrain(it.x, it.z);
        }
        const bob = it.state === 'up' ? Math.sin(time * 1.5 + it.phase) * 0.06 : it.state === 'ready' ? 0.25 + Math.sin(time * 2.4 + it.phase) * 0.22 : 0;
        it.g.position.set(it.x, it.y + bob, it.z);
        it.mesh.rotation.y = time * (it.kind === 'egg' ? 0.8 : 1.4) + it.phase;
        if (it.kind === 'egg') it.mesh.rotation.z = Math.sin(time * 5 + it.phase) * 0.12 * (Math.sin(time * 0.9 + it.phase) > 0.6 ? 1 : 0.2); // wobble: something inside!
        it.beam.material.opacity = 0.11 + 0.06 * Math.sin(time * 3 + it.phase);
        it.beam.scale.set(1, 1, 1);
      }
      for (const t of fruitTrees) {
        if (t.shake > 0) { t.shake = Math.max(0, t.shake - dt * 0.9); }
        const s = t.shake * t.shake;
        t.top.rotation.z = Math.sin(time * 26) * 0.12 * s; t.top.rotation.x = Math.cos(time * 21) * 0.09 * s;
        if (t.item.state === 'up') t.item.g.position.x = t.item.x + Math.sin(time * 26) * 0.25 * s;
      }
      for (const r of rings) {
        if (r.t > 1) { r.m.visible = false; continue; }
        r.t += dt * 1.1; const k = Math.min(1, r.t);
        r.m.scale.setScalar(1 + k * WORLD.ROAR_R); r.m.material.opacity = 0.85 * (1 - k) * (1 - k);
      }
      for (let i = 0; i < 9; i++) { // volcano smoke
        const d = volc[i], k = ((time * 0.05 + i / 9) % 1);
        d.position.set(volc.x + Math.sin(i * 2.1 + time * 0.2) * 3 * k + k * 14, volc.top + 4 + k * 40, volc.z + Math.cos(i * 1.7) * 3 * k);
        d.scale.setScalar(3 + k * 9); d.material.opacity = 0.75 * (1 - k);
      }
    },
    collect(it) { it.collected = true; it.g.visible = false; it.beam.visible = false; it.state = 'got'; },
    setView(camPos, q) { sky.position.copy(camPos); flowers.visible = !q.lowDetail; bush.visible = true; },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose?.();
      clouds.dispose(); trunks.dispose(); cans.dispose(); bush.dispose(); flowers.dispose();
    },
  };
}
