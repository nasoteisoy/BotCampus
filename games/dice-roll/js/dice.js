import * as THREE from 'three';

export const DIE_TYPES = [
  { id: 'd4', sides: 4, label: 'd4' },
  { id: 'd6', sides: 6, label: 'd6' },
  { id: 'd8', sides: 8, label: 'd8' },
  { id: 'd10', sides: 10, label: 'd10' },
  { id: 'd12', sides: 12, label: 'd12' },
  { id: 'd20', sides: 20, label: 'd20' },
];

export const TINTS = {
  d4: '#f3efe4',
  d6: '#f7f4ee',
  d8: '#eef3f8',
  d10: '#f8f1de',
  d12: '#f8ecec',
  d20: '#eee8f6',
};

const INK = '#1b140e';
const GOLD = '#e0a01a';
const GOLD_STROKE = '#5a3a08';
export const ACCENT_INK = INK;
export const ACCENT_GOLD = GOLD;
export const ACCENT_FACE = '#fff4c8';
const EDGE = '#c9c0b4';
const PHI = (1 + Math.sqrt(5)) / 2;
const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();

const protoCache = new Map();

function sidesOf(type) {
  return DIE_TYPES.find((t) => t.id === type)?.sides ?? 6;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const pipCache = new Map();

function pipTexture(n, accent = false) {
  const key = n + (accent ? '-g' : '');
  if (pipCache.has(key)) return pipCache.get(key);
  const s = 256;
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = accent ? '#d7b056' : EDGE;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = accent ? '#fff4c8' : TINTS.d6;
  roundedRect(ctx, 16, 16, s - 32, s - 32, 38);
  ctx.fill();
  if (accent) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 10;
    roundedRect(ctx, 22, 22, s - 44, s - 44, 32);
    ctx.stroke();
  }
  const cx = s / 2;
  const cy = s / 2;
  const m = s * 0.23;
  const r = s * 0.085;
  const layout = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
  };
  for (const [px, py] of layout[n]) {
    const x = cx + px * m;
    const y = cy + py * m;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  pipCache.set(key, tex);
  return tex;
}

function physical(map, color = 0xffffff) {
  return new THREE.MeshPhysicalMaterial({
    map: map || null,
    color,
    roughness: 0.58,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.68,
  });
}

function v3(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

function tetrahedronVertices() {
  return [
    v3(1, 1, 1),
    v3(1, -1, -1),
    v3(-1, 1, -1),
    v3(-1, -1, 1),
  ].map((v) => v.normalize());
}

function octahedronVertices() {
  return [
    v3(1, 0, 0), v3(-1, 0, 0),
    v3(0, 1, 0), v3(0, -1, 0),
    v3(0, 0, 1), v3(0, 0, -1),
  ];
}

function icosahedronVertices() {
  const p = PHI;
  const list = [];
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      list.push(v3(0, s1, s2 * p));
      list.push(v3(s1, s2 * p, 0));
      list.push(v3(s2 * p, 0, s1));
    }
  }
  return list.map((v) => v.normalize());
}

function dodecahedronVertices() {
  const p = PHI;
  const i = 1 / p;
  const list = [];
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      for (const s3 of [-1, 1]) list.push(v3(s1, s2, s3));
    }
  }
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      list.push(v3(0, s1 * i, s2 * p));
      list.push(v3(s1 * i, s2 * p, 0));
      list.push(v3(s1 * p, 0, s2 * i));
    }
  }
  return list.map((v) => v.normalize());
}

function d10Vertices() {
  const list = [];
  const ringY = 0.2;
  const ringR = 1;
  const poleY = 1.18;
  list.push(v3(0, poleY, 0));
  list.push(v3(0, -poleY, 0));
  const N = 5;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    list.push(v3(Math.cos(a) * ringR, ringY, Math.sin(a) * ringR));
  }
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    list.push(v3(Math.cos(a) * ringR, -ringY, Math.sin(a) * ringR));
  }
  let maxR = 0;
  for (const p of list) maxR = Math.max(maxR, p.length());
  return list.map((p) => p.multiplyScalar(1 / maxR));
}

function d10Faces() {
  const faces = [];
  const N = 5;
  const U = (i) => 2 + (i % N);
  const L = (i) => 7 + (i % N);
  for (let i = 0; i < N; i++) {
    faces.push([U(i), 0, U(i + 1), L(i)]);
    faces.push([L(i), 1, L(i + 1), U(i + 1)]);
  }
  return faces;
}

function minEdge(verts) {
  let best = Infinity;
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const d = verts[i].distanceTo(verts[j]);
      if (d > 1e-8 && d < best) best = d;
    }
  }
  return best;
}

function extractFaces(verts) {
  const n = verts.length;
  const edge = minEdge(verts);
  const eps = edge * 0.12;
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (verts[i].distanceTo(verts[j]) <= edge + eps) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const axis = verts[i].clone().normalize();
    const ref = Math.abs(axis.y) > 0.85 ? v3(1, 0, 0) : v3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(ref, axis).normalize();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    adj[i].sort((a, b) => {
      const da = verts[a].clone().sub(verts[i]);
      const db = verts[b].clone().sub(verts[i]);
      return Math.atan2(da.dot(v), da.dot(u)) - Math.atan2(db.dot(v), db.dot(u));
    });
  }
  const used = new Set();
  const faces = [];
  for (let i = 0; i < n; i++) {
    for (const j of adj[i]) {
      if (used.has(`${i}>${j}`)) continue;
      const face = [i];
      let prev = i;
      let cur = j;
      let guard = 0;
      while (guard++ < 20) {
        used.add(`${prev}>${cur}`);
        if (cur === i) break;
        face.push(cur);
        const nb = adj[cur];
        const idx = nb.indexOf(prev);
        if (idx < 0) break;
        const next = nb[(idx + 1) % nb.length];
        prev = cur;
        cur = next;
      }
      if (face.length >= 3) {
        const a = verts[face[0]];
        const b = verts[face[1]];
        const c = verts[face[2]];
        const nrm = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
        const mid = v3(0, 0, 0);
        for (const k of face) mid.add(verts[k]);
        if (nrm.dot(mid) < 0) face.reverse();
        faces.push(face);
      }
    }
  }
  return faces;
}

function assignOppositeValues(verts, faces) {
  const n = faces.length;
  const normals = faces.map((f) => {
    const a = verts[f[0]];
    const b = verts[f[1]];
    const c = verts[f[2]];
    return new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
  });
  const values = new Array(n).fill(0);
  const used = new Array(n).fill(false);
  let next = 1;
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    let best = -1;
    let bestDot = 2;
    for (let j = i + 1; j < n; j++) {
      if (used[j]) continue;
      const d = normals[i].dot(normals[j]);
      if (d < bestDot) {
        bestDot = d;
        best = j;
      }
    }
    values[i] = next;
    if (best >= 0) {
      values[best] = n + 1 - next;
      used[best] = true;
    }
    used[i] = true;
    next += 1;
  }
  return values;
}

function analyzeFace(verts, indices) {
  const pts = indices.map((i) => verts[i].clone());
  const center = v3(0, 0, 0);
  for (const p of pts) center.add(p);
  center.multiplyScalar(1 / pts.length);
  const normal = new THREE.Vector3()
    .crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0]))
    .normalize();
  if (normal.dot(center) < 0) {
    normal.negate();
    pts.reverse();
    indices = indices.slice().reverse();
  }
  let textUp = v3(0, 1, 0);
  if (Math.abs(normal.dot(textUp)) > 0.85) textUp.set(0, 0, -1);
  textUp = textUp.sub(normal.clone().multiplyScalar(textUp.dot(normal))).normalize();
  const vAxis = textUp;
  const uAxis = new THREE.Vector3().crossVectors(vAxis, normal).normalize();
  const uv2 = pts.map((p) => {
    const d = p.clone().sub(center);
    return { u: d.dot(uAxis), v: d.dot(vAxis) };
  });
  let m = 0;
  for (const q of uv2) m = Math.max(m, Math.abs(q.u), Math.abs(q.v));
  const pad = 1.08;
  const local = uv2.map((q) => ({
    u: 0.5 + (0.5 * q.u) / (m * pad),
    v: 0.5 + (0.5 * q.v) / (m * pad),
  }));
  return { pts, center, normal, textUp, local, indices };
}

function atlasGrid(count) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

function drawNumber(ctx, x, y, size, n, bg, sides = 5, accent = false) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, size, size);
  const text = String(n);
  const base = sides <= 3 ? 0.38 : sides === 4 ? 0.34 : 0.32;
  const fontSize = size * (text.length > 1 ? base * 0.84 : base);
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, fontSize * (accent ? 0.98 : 0.82), 0, Math.PI * 2);
  ctx.fillStyle = accent ? GOLD : 'rgba(255,255,255,0.18)';
  ctx.fill();
  if (accent) {
    ctx.lineWidth = size * 0.04;
    ctx.strokeStyle = GOLD_STROKE;
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fontSize}px system-ui, Arial, sans-serif`;
  const ty = cy + size * 0.015;
  ctx.fillStyle = INK;
  ctx.fillText(text, cx, ty);
}

export function d4NumeralFrac(info) {
  const inr = triangleInradius(info?.local);
  const stroke = 0.016;
  const margin = 0.016;
  const radius = Math.min(0.205, Math.max(0.11, inr - stroke * 0.5 - margin));
  return radius * 1.50;
}

function triangleInradius(local) {
  if (!local || local.length < 3) return 0.23;
  const a = Math.hypot(local[1].u - local[2].u, local[1].v - local[2].v);
  const b = Math.hypot(local[0].u - local[2].u, local[0].v - local[2].v);
  const c = Math.hypot(local[0].u - local[1].u, local[0].v - local[1].v);
  const peri = a + b + c;
  const area = Math.abs(
    (local[1].u - local[0].u) * (local[2].v - local[0].v)
    - (local[2].u - local[0].u) * (local[1].v - local[0].v),
  ) * 0.5;
  return peri > 1e-8 ? (2 * area) / peri : 0.23;
}

function drawD4Face(ctx, x, y, tile, info, accentValue = 0, spin = 0) {
  ctx.fillStyle = TINTS.d4;
  ctx.fillRect(x, y, tile, tile);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hasResult = accentValue && info.cornerValues && info.cornerValues.includes(accentValue);
  if (!hasResult) return;
  // One upright centre numeral on a disc that stays inside the inscribed circle.
  const cx = x + tile * 0.5;
  const cy = y + tile * 0.5;
  const inr = triangleInradius(info.local) * tile;
  const stroke = tile * 0.016;
  const margin = tile * 0.016;
  // Stay inside the inscribed circle, but use more of it so crowded desktop
  // d4 numerals still clear 14 CSS px after tray clamping.
  const radius = Math.min(tile * 0.205, Math.max(tile * 0.11, inr - stroke * 0.5 - margin));
  const fontSize = radius * 1.50;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.lineWidth = stroke;
  ctx.strokeStyle = GOLD_STROKE;
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-spin);
  ctx.font = `800 ${fontSize}px system-ui, Arial, sans-serif`;
  ctx.fillStyle = INK;
  ctx.fillText(String(accentValue), 0, tile * 0.008);
  ctx.restore();
}

function buildPolyMesh(verts, faces, values, tint, cornerNumbers) {
  const unit = verts.map((v) => v.clone());
  let maxR = 0;
  for (const p of unit) maxR = Math.max(maxR, p.length());
  for (const p of unit) p.multiplyScalar(1 / maxR);

  const infos = faces.map((f, i) => {
    const info = analyzeFace(unit, f);
    info.value = values[i];
    info.cornerValues = cornerNumbers ? info.indices.map((k) => k + 1) : null;
    return info;
  });

  const { cols, rows } = atlasGrid(faces.length);
  const tile = 256;
  const canvas = makeCanvas(cols * tile, rows * tile);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < infos.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    infos[i].col = col;
    infos[i].row = row;
    const x = col * tile;
    const y = row * tile;
    if (infos[i].cornerValues) drawD4Face(ctx, x, y, tile, infos[i]);
    else drawNumber(ctx, x, y, tile, infos[i].value, tint, infos[i].pts.length);
  }

  const pos = [];
  const nrm = [];
  const uv = [];
  const uScale = 1 / cols;
  const vScale = 1 / rows;
  for (const info of infos) {
    const u0 = info.col * uScale;
    const v0 = 1 - (info.row + 1) * vScale;
    const pack = (li) => [u0 + info.local[li].u * uScale, v0 + info.local[li].v * vScale];
    for (let k = 1; k < info.pts.length - 1; k++) {
      for (const li of [0, k, k + 1]) {
        const p = info.pts[li];
        pos.push(p.x, p.y, p.z);
        nrm.push(info.normal.x, info.normal.y, info.normal.z);
        const [uu, vv] = pack(li);
        uv.push(uu, vv);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, physical(tex));
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return {
    mesh,
    unitVerts: unit,
    atlasCanvas: canvas,
    atlasTile: tile,
    atlasTint: tint,
    atlasInfos: infos.map((info) => ({
      value: info.value,
      col: info.col,
      row: info.row,
      ptsLength: info.pts.length,
      cornerValues: info.cornerValues,
      local: info.local,
      textUp: info.textUp.clone(),
      normal: info.normal.clone(),
      center: info.center.clone(),
    })),
    readFaces: infos.map((info) => ({
      value: info.value,
      localNormal: info.normal.clone(),
      textUp: info.textUp.clone(),
      localCenter: info.center.clone(),
    })),
  };
}

function buildPrototype(type) {
  if (type === 'd6') {
    const size = 1;
    const geo = new THREE.BoxGeometry(size, size, size);
    const values = [3, 4, 1, 6, 2, 5];
    const mats = values.map((n) => physical(pipTexture(n)));
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const unitVerts = [];
    for (const x of [-0.5, 0.5]) {
      for (const y of [-0.5, 0.5]) {
        for (const z of [-0.5, 0.5]) unitVerts.push(v3(x, y, z));
      }
    }
    const readFaces = [
      { value: 3, localNormal: v3(1, 0, 0), textUp: v3(0, 1, 0), localCenter: v3(0.5, 0, 0) },
      { value: 4, localNormal: v3(-1, 0, 0), textUp: v3(0, 1, 0), localCenter: v3(-0.5, 0, 0) },
      { value: 1, localNormal: v3(0, 1, 0), textUp: v3(0, 0, -1), localCenter: v3(0, 0.5, 0) },
      { value: 6, localNormal: v3(0, -1, 0), textUp: v3(0, 0, 1), localCenter: v3(0, -0.5, 0) },
      { value: 2, localNormal: v3(0, 0, 1), textUp: v3(0, 1, 0), localCenter: v3(0, 0, 0.5) },
      { value: 5, localNormal: v3(0, 0, -1), textUp: v3(0, 1, 0), localCenter: v3(0, 0, -0.5) },
    ];
    return { mesh, unitVerts, readFaces, sizeScale: 0.84, d6FaceValues: values };
  }

  let verts;
  let faces;
  if (type === 'd4') verts = tetrahedronVertices();
  else if (type === 'd8') verts = octahedronVertices();
  else if (type === 'd10') verts = d10Vertices();
  else if (type === 'd12') verts = dodecahedronVertices();
  else if (type === 'd20') verts = icosahedronVertices();
  else throw new Error('Unknown die type');

  faces = type === 'd10' ? d10Faces() : extractFaces(verts);
  const expected = { d4: 4, d8: 8, d10: 10, d12: 12, d20: 20 }[type];
  if (faces.length !== expected) {
    throw new Error(`Bad ${type} face count: ${faces.length}`);
  }
  const values = assignOppositeValues(verts, faces);
  const built = buildPolyMesh(verts, faces, values, TINTS[type], type === 'd4');
  if (type === 'd4') {
    built.readFaces = built.unitVerts.map((p, i) => {
      const normal = p.clone().normalize();
      const other = built.unitVerts[(i + 1) % built.unitVerts.length];
      const textUp = other.clone().sub(p);
      textUp.addScaledVector(normal, -textUp.dot(normal));
      if (textUp.lengthSq() < 1e-8) textUp.set(0, 0, -1);
      textUp.normalize();
      return {
        value: i + 1,
        localNormal: normal,
        textUp,
        localCenter: p.clone(),
      };
    });
  }
  const sizeScale = type === 'd4' ? 1.456 : type === 'd10' ? 0.86 : 0.82;
  return { ...built, sizeScale };
}

export function createDie(type) {
  if (!protoCache.has(type)) protoCache.set(type, buildPrototype(type));
  const proto = protoCache.get(type);
  const scale = proto.sizeScale;
  let mesh;
  let atlasCanvas = null;
  let atlasTex = null;
  if (type === 'd6') {
    const mats = proto.mesh.material.map((m) => {
      const c = m.clone();
      c.map = m.map;
      return c;
    });
    mesh = new THREE.Mesh(proto.mesh.geometry, mats);
  } else {
    atlasCanvas = makeCanvas(proto.atlasCanvas.width, proto.atlasCanvas.height);
    atlasCanvas.getContext('2d').drawImage(proto.atlasCanvas, 0, 0);
    atlasTex = new THREE.CanvasTexture(atlasCanvas);
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.anisotropy = 8;
    atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
    atlasTex.magFilter = THREE.LinearFilter;
    atlasTex.generateMipmaps = true;
    atlasTex.needsUpdate = true;
    const mat = proto.mesh.material.clone();
    mat.map = atlasTex;
    mesh = new THREE.Mesh(proto.mesh.geometry, mat);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.scale.setScalar(scale);
  const group = new THREE.Group();
  group.add(mesh);
  group.userData = {
    type,
    sides: sidesOf(type),
    readFaces: proto.readFaces,
    unitVerts: proto.unitVerts,
    scale,
    mesh,
    proto,
    atlasCanvas,
    atlasTex,
    locked: false,
    value: 1,
    restY: 0,
  };
  group.userData.restY = restYFor(group, 1);
  return group;
}

function d4ResultSpin(die, info) {
  if (!info.textUp || !info.normal) return 0;
  const n = info.normal.clone().applyQuaternion(die.quaternion);
  const v = info.textUp.clone().applyQuaternion(die.quaternion);
  v.addScaledVector(n, -v.dot(n));
  if (v.lengthSq() < 1e-8) return 0;
  v.normalize();
  const desired = new THREE.Vector3(0, 1, 0);
  desired.addScaledVector(n, -desired.dot(n));
  if (desired.lengthSq() < 1e-8) return 0;
  desired.normalize();
  const cross = new THREE.Vector3().crossVectors(v, desired).dot(n);
  return Math.atan2(cross, v.dot(desired));
}

function d4FrontFace(die, value, camera) {
  const camDir = new THREE.Vector3();
  if (camera) camDir.subVectors(camera.position, die.position);
  else camDir.set(0, 0.85, 0.55);
  if (camDir.lengthSq() < 1e-8) camDir.set(0, 1, 0);
  else camDir.normalize();
  let bestDot = -Infinity;
  let best = null;
  for (const info of die.userData.proto.atlasInfos) {
    if (!info.cornerValues?.includes(value)) continue;
    _n.copy(info.normal).applyQuaternion(die.quaternion);
    const dot = _n.dot(camDir);
    if (dot > bestDot) {
      bestDot = dot;
      best = info;
    }
  }
  return best;
}

export function accentResult(die, value, camera = null) {
  const type = die.userData.type;
  if (type === 'd6') {
    const values = die.userData.proto.d6FaceValues;
    const mats = die.userData.mesh.material;
    for (let i = 0; i < values.length; i++) {
      mats[i].map = pipTexture(values[i], values[i] === value);
      mats[i].needsUpdate = true;
    }
    return;
  }
  const proto = die.userData.proto;
  const ctx = die.userData.atlasCanvas.getContext('2d');
  const tile = proto.atlasTile;
  ctx.drawImage(proto.atlasCanvas, 0, 0);
  if (type === 'd4') {
    // Paint the result disc only on the camera-facing face so side faces
    // don't show a grazing gold sliver of the same numeral.
    const front = d4FrontFace(die, value, camera);
    if (front) {
      drawD4Face(ctx, front.col * tile, front.row * tile, tile, front, value, d4ResultSpin(die, front));
    }
  } else {
    for (const info of proto.atlasInfos) {
      if (info.value === value) {
        drawNumber(ctx, info.col * tile, info.row * tile, tile, info.value, proto.atlasTint, info.ptsLength, true);
      }
    }
  }
  die.userData.atlasTex.needsUpdate = true;
}

export function restYForQuat(die, quat) {
  const v = new THREE.Vector3();
  let minY = Infinity;
  for (const p of die.userData.unitVerts) {
    v.copy(p).multiplyScalar(die.userData.scale).applyQuaternion(quat);
    if (v.y < minY) minY = v.y;
  }
  return -minY;
}

export function restYFor(die, value, quat = null) {
  if (quat) return restYForQuat(die, quat);
  const face = die.userData.readFaces.find((f) => f.value === value);
  if (!face) return die.userData.scale * 0.5;
  const q = new THREE.Quaternion().setFromUnitVectors(face.localNormal, UP);
  return restYForQuat(die, q);
}

function projectOnPlane(v, n) {
  v.addScaledVector(n, -v.dot(n));
  return v;
}

/** Lean `toward` (usually the camera) no more than `maxDeg` off world up. */
export function limitTilt(toward, maxDeg) {
  const dir = toward.clone().normalize();
  const ang = Math.acos(Math.min(1, Math.max(-1, UP.dot(dir))));
  const maxRad = (maxDeg * Math.PI) / 180;
  if (ang <= maxRad + 1e-5) return dir;
  const axis = new THREE.Vector3().crossVectors(UP, dir);
  if (axis.lengthSq() < 1e-8) return UP.clone();
  axis.normalize();
  return UP.clone().applyAxisAngle(axis, maxRad);
}


export function quatForValue(die, value, extraTwist = 0, toward = null, screenUp = null) {
  let twist = 0;
  let dir = UP;
  let upWanted = new THREE.Vector3(0, 0, -1);
  if (extraTwist && typeof extraTwist === 'object') {
    const opts = extraTwist;
    twist = opts.extraTwist || 0;
    if (opts.toward) dir = opts.toward;
    if (opts.screenUp) upWanted = opts.screenUp;
  } else {
    twist = extraTwist || 0;
    if (toward) dir = toward;
    if (screenUp) upWanted = screenUp;
  }
  dir = dir.clone().normalize();
  upWanted = upWanted.clone();

  const face = die.userData.readFaces.find((f) => f.value === value);
  const q = new THREE.Quaternion().setFromUnitVectors(face.localNormal, dir);

  const textSrc = face.textUp;
  if (textSrc) {
    const upNow = textSrc.clone().applyQuaternion(q);
    projectOnPlane(upNow, dir);
    if (upNow.lengthSq() > 1e-6) {
      upNow.normalize();
      const desired = projectOnPlane(upWanted, dir);
      if (desired.lengthSq() > 1e-6) {
        desired.normalize();
        const d = upNow.dot(desired);
        if (d < -0.999) {
          q.premultiply(_q.setFromAxisAngle(dir, Math.PI));
        } else {
          q.premultiply(_q.setFromUnitVectors(upNow, desired));
        }
      }
    }
  }
  if (twist) q.premultiply(_q.setFromAxisAngle(dir, twist));
  return q;
}

export function readCameraFacingValue(die, camera) {
  const camDir = new THREE.Vector3().subVectors(camera.position, die.position);
  if (camDir.lengthSq() < 1e-8) camDir.set(0, 1, 0);
  else camDir.normalize();
  let best = -Infinity;
  let value = 0;
  for (const f of die.userData.readFaces) {
    _n.copy(f.localNormal).applyQuaternion(die.quaternion);
    const d = _n.dot(camDir);
    if (d > best) {
      best = d;
      value = f.value;
    }
  }
  return value;
}

export function resultAnchor(die) {
  const face = die.userData.readFaces.find((f) => f.value === die.userData.value);
  const out = new THREE.Vector3();
  if (!face) {
    out.copy(die.position);
    out.y += die.userData.restY + 0.4;
    return out;
  }
  const scale = die.userData.scale;
  if (face.localCenter) out.copy(face.localCenter).multiplyScalar(scale);
  else out.copy(face.localNormal).multiplyScalar(scale * 0.5);
  out.applyQuaternion(die.quaternion).add(die.position);
  _n.copy(face.localNormal).applyQuaternion(die.quaternion);
  out.addScaledVector(_n, 0.32);
  return out;
}

export function resultTextUpAngle(die, camera) {
  const face = die.userData.readFaces.find((f) => f.value === die.userData.value);
  if (!face || !face.textUp) return 0;
  const viewDir = new THREE.Vector3();
  camera.getWorldDirection(viewDir);
  const textWorld = face.textUp.clone().applyQuaternion(die.quaternion);
  textWorld.addScaledVector(viewDir, -textWorld.dot(viewDir));
  if (textWorld.lengthSq() < 1e-8) return 0;
  textWorld.normalize();
  const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  camUp.addScaledVector(viewDir, -camUp.dot(viewDir));
  if (camUp.lengthSq() < 1e-8) return 0;
  camUp.normalize();
  const dot = Math.min(1, Math.max(-1, textWorld.dot(camUp)));
  const cross = new THREE.Vector3().crossVectors(textWorld, camUp).dot(viewDir);
  return Math.atan2(cross, dot) * (180 / Math.PI);
}

export function readUpValue(die) {
  let best = -Infinity;
  let value = 0;
  for (const f of die.userData.readFaces) {
    _n.copy(f.localNormal).applyQuaternion(die.quaternion);
    const d = _n.dot(UP);
    if (d > best) {
      best = d;
      value = f.value;
    }
  }
  return value;
}

export function estimateRadius(type) {
  const scale = type === 'd4' ? 1.456 : type === 'd6' ? 0.84 : type === 'd10' ? 0.86 : 0.82;
  if (type === 'd6') return scale * Math.SQRT1_2 + 0.04;
  return scale * 0.98;
}

export function spacingForType(type, mul = 1) {
  return 2 * estimateRadius(type) * mul + 0.12;
}

/** World-space gap reserved at the far (−Z) rail so a chip can sit above the back row. */
export function chipFarLane(count, opts = {}) {
  // Landscape/desktop: leave a large far-rail lane (perspective shrinks it).
  // Portrait already has more vertical pixels, so a smaller lane avoids
  // over-shrinking d4.
  if (opts.portrait) return count >= 6 ? 0.48 : count >= 5 ? 0.36 : 0;
  // Don't reserve a huge far lane — perspective makes it too thin for a
  // 28px chip. Spend that space on the mid-row alley instead.
  // 6-dice back row needs more far-rail world slack so tall silhouettes
  // stay ≥4px inside the far lip after perspective.
  return count >= 6 ? 0.62 : count >= 5 ? 0.50 : count >= 4 ? 0.32 : 0;
}

/** Pull slot coordinates in so |slot| + radius stays inside the tray (axes independent). */
export function clampSlotsToTray(slots, radius, tray, opts = {}) {
  if (!slots || !slots.length || !(tray > 0)) return slots;
  const farLane = opts.farLane != null ? opts.farLane : chipFarLane(slots.length, opts);
  const limX = Math.max(0.05, tray - radius);
  const limZNear = Math.max(0.05, tray - radius);
  const limZFar = Math.max(0.05, tray - radius - farLane);
  for (const s of slots) {
    s.x = Math.max(-limX, Math.min(limX, s.x));
    s.z = Math.max(-limZFar, Math.min(limZNear, s.z));
  }
  // Shift the formation toward the camera so the back row keeps a chip lane
  // even when the span already fitted the symmetric tray.
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of slots) {
    if (s.z < minZ) minZ = s.z;
    if (s.z > maxZ) maxZ = s.z;
  }
  const farLimit = -limZFar;
  let shift = farLimit - minZ;
  if (shift > 1e-6) {
    if (maxZ + shift > limZNear) shift = limZNear - maxZ;
    if (shift > 1e-6) for (const s of slots) s.z += shift;
  }
  return slots;
}

/**
 * Multiplier on proto.sizeScale so the slot grid fits in `tray`
 * without overlap. Desktop 5–6 dice may start at 1.15×.
 */
export function layoutMulFor(type, count, opts = {}) {
  const tray = opts.tray;
  const portrait = !!opts.portrait;
  // Start high for 5–6 dice on wide layouts so leftover tray slack
  // goes into die size (and readable numerals). fits() searches down.
  let mul = 1;
  if (opts.desktopBoost) mul = 1.28;
  else if (opts.landscapeBoost) mul = 1.42;
  if (!(tray > 0) || count < 1) return mul;
  const baseR = estimateRadius(type);
  const minGap = 0.08;
  const fits = (m) => {
    const r = baseR * m;
    const spacing = 2 * r + 0.12;
    const slots = slotPositions(count, { spacing, portrait, radius: r, tray, clamp: true });
    const far = chipFarLane(count, { portrait });
    for (const s of slots) {
      if (Math.abs(s.x) + r > tray + 1e-3) return false;
      if (s.z + r > tray + 1e-3) return false;
      if (-s.z + r + far > tray + 1e-3) return false;
    }
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const d = Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z);
        if (d < 2 * r + minGap - 1e-3) return false;
      }
    }
    return true;
  };
  if (fits(mul)) return mul;
  let lo = 0.5;
  let hi = mul;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) * 0.5;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function maxDieXZ(die) {
  const v = new THREE.Vector3();
  let m = 0;
  for (const p of die.userData.unitVerts) {
    v.copy(p).multiplyScalar(die.userData.scale).applyQuaternion(die.quaternion).add(die.position);
    m = Math.max(m, Math.abs(v.x), Math.abs(v.z));
  }
  return m;
}

export function clampDiceToTray(dice, limit) {
  if (!(limit > 0) || !dice?.length) return;
  const v = new THREE.Vector3();
  for (const d of dice) {
    if (d.userData.locked) continue;
    const r = horizontalRadius(d);
    const maxPos = Math.max(0, limit - r);
    d.position.x = Math.max(-maxPos, Math.min(maxPos, d.position.x));
    d.position.z = Math.max(-maxPos, Math.min(maxPos, d.position.z));
    for (let iter = 0; iter < 8; iter++) {
      let maxXZ = 0;
      for (const p of d.userData.unitVerts) {
        v.copy(p).multiplyScalar(d.userData.scale).applyQuaternion(d.quaternion).add(d.position);
        maxXZ = Math.max(maxXZ, Math.abs(v.x), Math.abs(v.z));
      }
      if (maxXZ <= limit + 1e-4) break;
      const k = limit / maxXZ;
      d.position.x *= k;
      d.position.z *= k;
    }
  }
}


export function pullDiceFromFarWall(dice, tray, farLane) {
  if (!(farLane > 0) || !(tray > 0) || !dice?.length) return;
  const rs = dice.map((d) => horizontalRadius(d));
  let minFar = Infinity;
  let maxNear = -Infinity;
  for (let i = 0; i < dice.length; i++) {
    const z = dice[i].position.z;
    minFar = Math.min(minFar, z - rs[i]);
    maxNear = Math.max(maxNear, z + rs[i]);
  }
  const wantMin = -tray + farLane;
  let shift = wantMin - minFar;
  if (shift <= 1e-6) return;
  const room = tray - maxNear;
  if (shift > room) shift = room;
  if (shift > 1e-6) {
    for (const d of dice) {
      if (d.userData.locked) continue;
      d.position.z += shift;
    }
  }
}

export function horizontalRadius(die) {
  const scale = die.userData.scale;
  const q = die.quaternion;
  const v = new THREE.Vector3();
  let maxR = 0;
  for (const p of die.userData.unitVerts) {
    v.copy(p).multiplyScalar(scale).applyQuaternion(q);
    const r = Math.hypot(v.x, v.z);
    if (r > maxR) maxR = r;
  }
  return maxR;
}

export function separateDice(dice, gap = 0.08) {
  const n = dice.length;
  if (n < 2) return;
  const rs = dice.map((d) => horizontalRadius(d));
  for (let iter = 0; iter < 10; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = dice[j].position.x - dice[i].position.x;
        let dz = dice[j].position.z - dice[i].position.z;
        let dist = Math.hypot(dx, dz);
        const need = rs[i] + rs[j] + gap;
        if (dist < 1e-5) {
          dx = 0.02 * (i + 1);
          dz = 0.02 * (j + 1);
          dist = Math.hypot(dx, dz);
        }
        if (dist >= need) continue;
        const push = need - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        const aLock = dice[i].userData.locked;
        const bLock = dice[j].userData.locked;
        if (aLock && !bLock) {
          dice[j].position.x += nx * push;
          dice[j].position.z += nz * push;
        } else if (bLock && !aLock) {
          dice[i].position.x -= nx * push;
          dice[i].position.z -= nz * push;
        } else if (!aLock && !bLock) {
          dice[i].position.x -= nx * push * 0.5;
          dice[i].position.z -= nz * push * 0.5;
          dice[j].position.x += nx * push * 0.5;
          dice[j].position.z += nz * push * 0.5;
        }
        moved = !(aLock && bLock);
      }
    }
    if (!moved) break;
  }
  for (const d of dice) d.position.y = d.userData.restY || d.position.y;
}

export function overlapDepth(dice) {
  let maxDepth = 0;
  const pair = [0, 0];
  const planes = dice.map(hullPlanes);
  const verts = dice.map(worldUnitVerts);
  for (let i = 0; i < dice.length; i++) {
    for (let j = i + 1; j < dice.length; j++) {
      for (const p of verts[i]) {
        const depth = pointInHullDepth(p, planes[j]);
        if (depth > maxDepth) {
          maxDepth = depth;
          pair[0] = i;
          pair[1] = j;
        }
      }
      for (const p of verts[j]) {
        const depth = pointInHullDepth(p, planes[i]);
        if (depth > maxDepth) {
          maxDepth = depth;
          pair[0] = i;
          pair[1] = j;
        }
      }
    }
  }
  return { maxDepth, pair };
}

function worldUnitVerts(die) {
  const scale = die.userData.scale;
  die.updateWorldMatrix(true, true);
  return die.userData.unitVerts.map((p) => {
    const v = p.clone().multiplyScalar(scale);
    v.applyQuaternion(die.quaternion).add(die.position);
    return v;
  });
}

function hullPlanes(die) {
  die.updateWorldMatrix(true, true);
  const mesh = die.userData.mesh;
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const idx = geo.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const planes = [];
  const tri = (i0, i1, i2) => {
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    mesh.localToWorld(a);
    mesh.localToWorld(b);
    mesh.localToWorld(c);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    if (n.lengthSq() < 1e-12) return;
    n.normalize();
    planes.push({ n: n.clone(), d: n.dot(a) });
  };
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  } else {
    for (let i = 0; i < pos.count; i += 3) tri(i, i + 1, i + 2);
  }
  return planes;
}

function pointInHullDepth(p, planes) {
  if (!planes.length) return 0;
  let depth = Infinity;
  for (const pl of planes) depth = Math.min(depth, pl.d - pl.n.dot(p));
  return depth;
}

export function slotPositions(count, opts = {}) {
  const g = opts.spacing || 1.78;
  const portrait = !!opts.portrait;
  const y = 0;
  let slots;
  if (count === 1) slots = [v3(0, y, 0)];
  else if (count === 2) slots = [v3(-g * 0.5, y, 0), v3(g * 0.5, y, 0)];
  else if (portrait) {
    const col = g * 0.5;
    if (count === 3) {
      slots = [v3(-col, y, -g * 0.5), v3(col, y, -g * 0.5), v3(0, y, g * 0.5)];
    } else if (count === 4) {
      slots = [v3(-col, y, -g * 0.5), v3(col, y, -g * 0.5), v3(-col, y, g * 0.5), v3(col, y, g * 0.5)];
    } else if (count === 5) {
      const row = g * 1.0;
      slots = [
        v3(-col, y, -row), v3(col, y, -row),
        v3(0, y, 0),
        v3(-col, y, row), v3(col, y, row),
      ];
    } else {
      const row = g;
      slots = [
        v3(-col, y, -row), v3(col, y, -row),
        v3(-col, y, 0), v3(col, y, 0),
        v3(-col, y, row), v3(col, y, row),
      ];
    }
  } else if (count === 3) slots = [v3(-g, y, 0), v3(0, y, 0), v3(g, y, 0)];
  else if (count === 4) {
    const s = g * 0.55;
    slots = [v3(-s, y, -s), v3(s, y, -s), v3(-s, y, s), v3(s, y, s)];
  } else if (count === 5) {
    const s = g * 1.0;
    slots = [v3(-s, y, -s), v3(s, y, -s), v3(0, y, 0), v3(-s, y, s), v3(s, y, s)];
  } else {
    slots = [
      v3(-g, y, -g * 0.90), v3(0, y, -g * 0.90), v3(g, y, -g * 0.90),
      v3(-g, y, g * 0.78), v3(0, y, g * 0.78), v3(g, y, g * 0.78),
    ];
  }
  if (opts.clamp && opts.tray > 0 && opts.radius > 0) {
    clampSlotsToTray(slots, opts.radius, opts.tray, {
      farLane: chipFarLane(slots.length, opts),
      portrait: !!opts.portrait,
    });
  }
  return slots;
}

export function makeFeltTexture() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(256, 256, 30, 256, 256, 360);
  g.addColorStop(0, '#1d8f55');
  g.addColorStop(1, '#0c462c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const img = ctx.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 24;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.8));
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}

export function makeWoodTexture() {
  const c = makeCanvas(256, 512);
  const ctx = c.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const t = x / 256;
    const w = 92 + Math.sin(t * 26) * 16 + Math.sin(t * 7.1) * 10;
    const r = Math.round(w + 42);
    const g = Math.round(w * 0.52 + 22);
    const b = Math.round(w * 0.24 + 10);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, 0, 1, 512);
  }
  const img = ctx.getImageData(0, 0, 256, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.7));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.4));
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
