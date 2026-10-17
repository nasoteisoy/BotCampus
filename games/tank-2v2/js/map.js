// Arena, obstacles and 2D collision helpers (XZ plane).
import * as THREE from 'three';

export const HALF = 60;           // arena is 120 x 120
export const obstacles = [];      // {type:'circle'|'box', x,z, r | hx,hz, h, border?}

// Signed distance from point to obstacle footprint.
export function sdObs(o, x, z) {
  if (o.type === 'circle') return Math.hypot(x - o.x, z - o.z) - o.r;
  const dx = Math.abs(x - o.x) - o.hx, dz = Math.abs(z - o.z) - o.hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}

export function minObsDist(x, z, list = obstacles) {
  let m = Infinity;
  for (const o of list) { const d = sdObs(o, x, z); if (d < m) m = d; }
  return m;
}

// First hit fraction t in [0,1] along segment (sampled), or -1. y0/y1 optional for height test.
export function segmentHitT(x0, z0, x1, z1, pad = 0, extra = null, y0 = 0, y1 = 0) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(len / 0.3));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t;
    for (const o of obstacles) if (y < o.h && sdObs(o, x, z) < pad) return t;
    if (extra) for (const o of extra) if (y < o.h && sdObs(o, x, z) < pad) return t;
  }
  return -1;
}

// Push a circle (radius R) out of all obstacles. Returns [x,z].
export function pushOut(x, z, R) {
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      if (o.type === 'circle') {
        const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz) || 1e-4, min = o.r + R;
        if (d < min) { x = o.x + dx / d * min; z = o.z + dz / d * min; }
      } else {
        const cx = Math.max(o.x - o.hx, Math.min(x, o.x + o.hx));
        const cz = Math.max(o.z - o.hz, Math.min(z, o.z + o.hz));
        let dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
        if (d === 0) { // centre inside box: push along shallowest axis
          const px = o.hx - Math.abs(x - o.x), pz = o.hz - Math.abs(z - o.z);
          if (px < pz) x = o.x + Math.sign(x - o.x || 1) * (o.hx + R); else z = o.z + Math.sign(z - o.z || 1) * (o.hz + R);
        } else if (d < R) { x = cx + dx / d * R; z = cz + dz / d * R; }
      }
    }
  }
  return [x, z];
}

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

export function buildMap(scene) {
  const rand = rng(7);
  // --- ground
  const groundTex = canvasTex(512, (g, s) => {
    g.fillStyle = '#b9a77c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = rand();
      g.fillStyle = v < .5 ? 'rgba(120,100,60,0.10)' : 'rgba(240,225,180,0.10)';
      const r = 1 + rand() * 3; g.fillRect(rand() * s, rand() * s, r, r);
    }
    for (let i = 0; i < 40; i++) { // soft patches
      const x = rand() * s, y = rand() * s, r = 20 + rand() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rand() < .5 ? 'rgba(120,130,70,0.22)' : 'rgba(150,120,80,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(70,60,40,0.18)'; g.lineWidth = 2; // grid every 20 units (texture covers 40)
    g.beginPath(); g.moveTo(0, 1); g.lineTo(s, 1); g.moveTo(1, 0); g.lineTo(1, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
  }, 3);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'ground';
  scene.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x6f8a4a, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; outer.receiveShadow = true; scene.add(outer);

  const concrete = new THREE.MeshStandardMaterial({ color: 0xa9a59b, roughness: .9, flatShading: true });
  const concreteDark = new THREE.MeshStandardMaterial({ color: 0x7d7a72, roughness: .9, flatShading: true });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8378, roughness: 1, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a4b3a, roughness: .85, flatShading: true });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: .9, flatShading: true });
  const winMat = new THREE.MeshStandardMaterial({ color: 0x2c3540, roughness: .4 });
  const sand = new THREE.MeshStandardMaterial({ color: 0xa89466, roughness: 1, flatShading: true });

  const add = (mesh) => { mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh; };

  function wall(x, z, w, d, h = 3.4) {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), concrete)); m.position.set(x, h / 2, z);
    const cap = add(new THREE.Mesh(new THREE.BoxGeometry(w + .3, .3, d + .3), concreteDark)); cap.position.set(x, h + .15, z);
    obstacles.push({ type: 'box', x, z, hx: w / 2, hz: d / 2, h: h + .3 });
  }
  const bagGeo = new THREE.IcosahedronGeometry(1, 1); bagGeo.scale(0.78, 0.36, 0.42);
  function sandbags(x, z, w, d) { // stacked rounded bags; blocks shells
    const h = 2.6, along = w > d, L = Math.max(w, d), n = Math.max(2, Math.round(L / 1.45));
    for (let row = 0; row < 4; row++) {
      const cnt = row % 2 ? n - 1 : n;
      for (let i = 0; i < cnt; i++) {
        const t = (i + (row % 2 ? 1 : .5)) / n - .5;
        const b = add(new THREE.Mesh(bagGeo, sand));
        b.position.set(x + (along ? t * L : rand() * .1), .34 + row * .6, z + (along ? rand() * .1 : t * L));
        b.rotation.y = (along ? 0 : Math.PI / 2) + (rand() - .5) * .25;
        b.scale.set(1, 1, Math.min(w, d) / 0.84 * .5 + .5);
      }
    }
    obstacles.push({ type: 'box', x, z, hx: w / 2, hz: d / 2, h });
  }
  function rock(x, z, r) {
    const geo = new THREE.DodecahedronGeometry(r, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = .82 + rand() * .3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    geo.computeVertexNormals();
    const m = add(new THREE.Mesh(geo, rockMat)); m.position.set(x, r * .45, z); m.scale.y = 1.15; m.rotation.y = rand() * 6;
    const g2 = new THREE.DodecahedronGeometry(r * .55, 0);
    const m2 = add(new THREE.Mesh(g2, rockMat)); m2.position.set(x + r * .7, r * .2, z - r * .4);
    obstacles.push({ type: 'circle', x, z, r: r * .92, h: r * 1.5 });
  }
  function building(x, z, w, d, h) {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)); m.position.set(x, h / 2, z);
    const roof = add(new THREE.Mesh(new THREE.BoxGeometry(w + .6, .5, d + .6), roofMat)); roof.position.set(x, h + .25, z);
    const parapet = add(new THREE.Mesh(new THREE.BoxGeometry(w * .4, .8, d * .4), concreteDark)); parapet.position.set(x + w * .15, h + .9, z - d * .1);
    // windows
    const floors = Math.floor(h / 3);
    for (let f = 0; f < floors; f++) {
      const y = 1.9 + f * 3;
      for (let i = 0; i < Math.floor(w / 2.6); i++) {
        const wx = x - w / 2 + 1.6 + i * 2.6; if (wx > x + w / 2 - 1) break;
        for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, .1), winMat); win.position.set(wx, y, z + s * (d / 2 + .03)); scene.add(win); }
      }
      for (let i = 0; i < Math.floor(d / 2.6); i++) {
        const wz = z - d / 2 + 1.6 + i * 2.6; if (wz > z + d / 2 - 1) break;
        for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.3, 1.1), winMat); win.position.set(x + s * (w / 2 + .03), y, wz); scene.add(win); }
      }
    }
    obstacles.push({ type: 'box', x, z, hx: w / 2, hz: d / 2, h: h + .5 });
  }

  // Layout is point-symmetric so both sides are fair. Player south (+z), enemy north (-z).
  const sym = (fn, x, z, ...a) => { fn(x, z, ...a); fn(-x, -z, ...a); };
  building(0, 0, 10, 8, 6.5);
  sym(wall, -20, 14, 14, 1.6);
  sym(wall, -32, -18, 1.6, 12);
  sym(sandbags, 12, 26, 8, 1.4);
  sym(sandbags, -44, 26, 1.4, 7);
  sym(rock, 14, 12, 2.8);
  sym(rock, -42, 4, 3.6);
  sym(rock, 6, -30, 2.4);
  sym(rock, 46, 40, 3.0);
  sym(rock, 28, 2, 2.2);
  sym(building, 36, -34, 9, 7, 6);
  sym(wall, 18, -46, 1.6, 9);

  // Border walls (block shells; nav grid keeps tanks inside)
  const bh = 2.2, bt = 1.2;
  for (const [x, z, w, d] of [[0, -HALF - bt / 2, HALF * 2 + bt * 2, bt], [0, HALF + bt / 2, HALF * 2 + bt * 2, bt], [-HALF - bt / 2, 0, bt, HALF * 2], [HALF + bt / 2, 0, bt, HALF * 2]]) {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, bh, d), concreteDark)); m.position.set(x, bh / 2, z);
    obstacles.push({ type: 'box', x, z, hx: w / 2, hz: d / 2, h: bh + 30, border: true });
  }

  // Decorative trees outside the arena (instanced, cheap)
  const trunkGeo = new THREE.CylinderGeometry(.25, .35, 2, 5); trunkGeo.translate(0, 1, 0);
  const crownGeo = new THREE.ConeGeometry(2, 5, 6); crownGeo.translate(0, 4.2, 0);
  const N = 160;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4030, flatShading: true }), N);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x3f6b35, flatShading: true }), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    let x, z; do { x = (rand() - .5) * 240; z = (rand() - .5) * 240; } while (Math.abs(x) < HALF + 5 && Math.abs(z) < HALF + 5);
    const s = .8 + rand() * .8; sc.set(s, s * (.8 + rand() * .5), s); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6);
    pos.set(x, 0, z); m4.compose(pos, q, sc); trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
    crowns.setColorAt(i, new THREE.Color().setHSL(.27 + rand() * .06, .35, .28 + rand() * .1));
  }
  crowns.castShadow = trunks.castShadow = true;
  scene.add(trunks, crowns);
  return ground;
}
