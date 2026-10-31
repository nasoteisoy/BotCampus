// Low-poly 3D SpaceShip built from its parts + nation colours. Nose points +Z, up is +Y. ~1-2k triangles.
import * as THREE from './vendor/three.module.min.js';
import { partOf } from './ship-stats.js';

const geoCache = new Map();
const G = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
const shapeGeo = (pts, depth) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, depth / 2, 0); return g; };

// 🛡️ shield bubble: a soft see-through sphere (≈0.08) that only glows at its edges (fresnel rim), no wireframe.
// uRim = edge glow (by shield level), uFlash = 0..1 hit flash. material.opacity maps to the base fill.
function shieldMaterial() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x6ff3ff) }, uOp: { value: 0.08 }, uRim: { value: 0.5 }, uFlash: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOp; uniform float uRim; uniform float uFlash; varying vec3 vN; varying vec3 vV; void main() { float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float rim = pow(f, 3.0); float a = uOp + rim * uRim + uFlash * (0.22 + rim * 0.6); gl_FragColor = vec4(uColor * (1.0 + uFlash * 0.8), clamp(a, 0.0, 1.0)); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  Object.defineProperty(m, 'opacity', { get: () => m.uniforms.uOp.value, set: (v) => { if (m.uniforms) m.uniforms.uOp.value = v; }, configurable: true });
  return m;
}

export class ShipLook {
  constructor() {
    this.prim = new THREE.MeshStandardMaterial({ color: 0x2f80ed, roughness: 0.55, metalness: 0.35, flatShading: true });
    this.sec = new THREE.MeshStandardMaterial({ color: 0xffe14d, roughness: 0.5, metalness: 0.3, flatShading: true });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.7, metalness: 0.4, flatShading: true });
    this.glass = new THREE.MeshStandardMaterial({ color: 0x5ee8ff, emissive: 0x1a8fb0, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.1, flatShading: true });
    this.glow = new THREE.MeshBasicMaterial({ color: 0x7fe8ff });
    this.flame = new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    this.gunGlow = new THREE.MeshBasicMaterial({ color: 0xff6b5a });
    this.shield = shieldMaterial();
  }
  setColors(primary, secondary) { this.prim.color.set(primary); this.sec.color.set(secondary); }
}

const HULL = {
  scout: { len: 2.2, r: 0.36, w: 0.36, top: 0.3 },
  arrow: { len: 2.9, r: 0.3, w: 0.3, top: 0.26 },
  brick: { len: 2.4, r: 0.5, w: 0.55, top: 0.38 },
  titan: { len: 2.8, r: 0.66, w: 0.7, top: 0.5 },
};
export function hullSize(id) { return HULL[id] || HULL.scout; }

// buildShip(parts, look) → { root, shield, flames[], muzzles[], size }
export function buildShip(parts, look) {
  const root = new THREE.Group(), add = (geo, mat, x = 0, y = 0, z = 0, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const hid = partOf('hull', parts.hull).id, H = hullSize(hid), L = H.len;
  // ---- hull ----
  if (hid === 'scout' || hid === 'arrow') {
    const body = add(G('hb-' + hid, () => { const g = new THREE.CylinderGeometry(H.r * 0.22, H.r, L, 6, 1); g.rotateX(Math.PI / 2); return g; }), look.prim);
    body.scale.set(1, 0.8, 1);
    add(G('hn-' + hid, () => { const g = new THREE.ConeGeometry(H.r * 0.22, 0.4, 6); g.rotateX(Math.PI / 2); return g; }), look.sec, 0, 0, L / 2 + 0.2);
    if (hid === 'arrow') { add(G('fin', () => shapeGeo([[0, 0], [0.5, 0], [0.1, 0.55]], 0.06)), look.sec, 0, 0.18, -L / 2 + 0.1).rotation.set(0, Math.PI / 2, Math.PI / 2); }
  } else if (hid === 'brick') {
    add(G('hb-brick', () => new THREE.BoxGeometry(H.w * 2, H.r * 1.2, L * 0.8)), look.prim, 0, 0, -L * 0.08);
    add(G('hn-brick', () => { const g = new THREE.CylinderGeometry(0.08, H.w, L * 0.32, 4, 1); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 4); return g; }), look.prim, 0, 0, L * 0.46).scale.set(1, 0.55, 1);
    add(G('hs-brick', () => new THREE.BoxGeometry(H.w * 2.05, 0.08, L * 0.6)), look.sec, 0, -0.1, -L * 0.1);
  } else {
    add(G('hb-titan', () => { const g = new THREE.CylinderGeometry(H.r * 0.8, H.r, L, 8, 1); g.rotateX(Math.PI / 2); return g; }), look.prim).scale.set(1.15, 0.75, 1);
    add(G('hn-titan', () => { const g = new THREE.ConeGeometry(H.r * 0.8, 0.7, 8); g.rotateX(Math.PI / 2); return g; }), look.sec, 0, 0, L / 2 + 0.35).scale.set(1.15, 0.75, 1);
    add(G('hk-titan', () => new THREE.BoxGeometry(0.5, 0.35, 1.2)), look.dark, 0, H.r * 0.6, -0.5);
    add(G('hr-titan', () => { const g = new THREE.TorusGeometry(H.r * 0.98, 0.06, 4, 8); return g; }), look.sec, 0, 0, -0.2).scale.set(1.15, 0.75, 1);
  }
  // cockpit (pilot) at the front top
  add(G('cock', () => new THREE.SphereGeometry(0.22, 6, 4)), look.glass, 0, H.top * 0.75, L * 0.18).scale.set(1, 0.7, 1.7);
  // ---- seats: windows along both sides (one per seat pair per side) ----
  const seats = partOf('seats', parts.seats).seats, per = Math.ceil(seats / 2);
  for (let i = 0; i < per; i++) {
    const z = -L * 0.32 + (per > 1 ? (i / (per - 1)) * L * 0.42 : L * 0.1);
    for (const sx of [-1, 1]) add(G('win', () => new THREE.BoxGeometry(0.03, 0.09, 0.14)), look.glow, sx * (H.w * (hid === 'brick' ? 1.02 : 0.78)), H.r * 0.12, z);
  }
  if (seats >= 6) add(G('pod-' + hid, () => new THREE.BoxGeometry(H.w * 1.3, H.r * 0.5, L * 0.5)), look.dark, 0, -H.r * 0.65, -L * 0.1);
  // ---- wings ----
  const wid = partOf('wings', parts.wings).id, ww = H.w * 0.75;
  for (const sx of [-1, 1]) {
    let w;
    // Thickness ~0.10–0.13 of chord (~1.2–1.5) so wings read as solid, not flat sheets
    if (wid === 'stubs') w = add(G('w-stubs', () => new THREE.BoxGeometry(0.55, 0.12, 0.55)), look.sec, sx * (ww + 0.25), -0.05, -0.2);
    else if (wid === 'delta') { w = add(G('w-delta', () => shapeGeo([[0, 0.5], [1.25, -0.6], [0, -0.75]], 0.13)), look.sec, sx * ww, -0.05, -0.1); w.scale.x = sx; }
    else if (wid === 'swept') { w = add(G('w-swept', () => shapeGeo([[0, 0.35], [1.1, -0.45], [1.2, -0.75], [0.95, -0.75], [0, -0.3]], 0.12)), look.sec, sx * ww, 0.02, -0.15); w.scale.x = sx; w.rotation.z = sx * 0.12; }
    else {
      w = add(G('w-broad', () => new THREE.BoxGeometry(1.5, 0.12, 0.8)), look.sec, sx * (ww + 0.72), -0.06, -0.25);
      add(G('w-tip', () => { const g = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6); g.rotateX(Math.PI / 2); return g; }), look.dark, sx * (ww + 1.45), -0.06, -0.2);
    }
  }
  // ---- engines (back, -Z) ----
  const eid = partOf('engines', parts.engines).id, eng = { ion: [[0, 0]], twin: [[-0.28, 0], [0.28, 0]], plasma: [[-0.32, 0.05], [0.32, 0.05], [0, -0.12]], warp: [[-0.36, 0], [0.36, 0]] }[eid];
  const er = eid === 'ion' ? 0.17 : eid === 'warp' ? 0.2 : 0.15, scaleW = Math.max(1, H.w / 0.4), flames = [];
  for (const [ex, ey] of eng) {
    const x = ex * scaleW, z = -L / 2 - 0.05;
    add(G('e-' + eid, () => { const g = new THREE.CylinderGeometry(er, er * 1.2, 0.5, 6); g.rotateX(Math.PI / 2); return g; }), look.dark, x, ey, z);
    add(G('en-' + eid, () => new THREE.CircleGeometry(er * 0.9, 6)), look.glow, x, ey, z - 0.26).rotation.y = Math.PI;
    const f = add(G('ef', () => { const g = new THREE.ConeGeometry(1, 1, 6); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.5); return g; }), look.flame, x, ey, z - 0.26);
    f.scale.set(er * 0.8, er * 0.8, eid === 'ion' ? 0.5 : 0.8); f.userData.base = f.scale.z; flames.push(f);
    if (eid === 'warp') add(G('ering', () => new THREE.TorusGeometry(0.3, 0.04, 4, 10)), look.glow, x, ey, z - 0.05);
  }
  // ---- guns ----
  const gid = partOf('guns', parts.guns).id, muzzles = [];
  const barrel = (x, y, z, len, rad, mat = look.dark) => { add(G(`b-${len}-${rad}`, () => { const g = new THREE.CylinderGeometry(rad, rad, len, 6); g.rotateX(Math.PI / 2); return g; }), mat, x, y, z); const m = new THREE.Object3D(); m.position.set(x, y, z + len / 2); root.add(m); muzzles.push(m); };
  if (gid === 'pulse') { for (const sx of [-1, 1]) barrel(sx * H.w * 0.5, -H.r * 0.45, L * 0.25, 0.7, 0.05); }
  else if (gid === 'twin') { const x = wid === 'broad' ? ww + 1.1 : wid === 'stubs' ? ww + 0.4 : ww + 0.55; for (const sx of [-1, 1]) { barrel(sx * x, -0.02, 0.1, 0.8, 0.045); add(G('gtip', () => new THREE.BoxGeometry(0.07, 0.07, 0.07)), look.gunGlow, sx * x, -0.02, 0.52); } }
  else if (gid === 'missile') { for (const sx of [-1, 1]) { add(G('mpod', () => new THREE.BoxGeometry(0.26, 0.2, 0.6)), look.dark, sx * (ww + 0.15), -0.22, 0.05); for (const k of [-1, 1]) barrel(sx * (ww + 0.15) + k * 0.06, -0.22, 0.4, 0.12, 0.045, look.gunGlow); } }
  else { add(G('rbase', () => new THREE.BoxGeometry(0.3, 0.16, 0.5)), look.dark, 0, H.top + 0.05, -L * 0.1); barrel(0, H.top + 0.1, L * 0.25, 1.6, 0.06, look.sec); }
  // ---- shield bubble ----
  const sid = partOf('shield', parts.shield).id, lvl = { none: 0, light: 1, medium: 2, heavy: 3 }[sid];
  const span = { stubs: ww + 0.55, delta: ww + 1.25, swept: ww + 1.2, broad: ww + 1.55 }[wid];
  const sh = new THREE.Group(); root.add(sh);
  const sx = span * 1.12, sy = Math.max(0.75, H.r * 1.6), sz = (L + 0.8) * 0.62;
  const bubble = new THREE.Mesh(G('shs', () => new THREE.SphereGeometry(1, 40, 24)), look.shield);
  sh.add(bubble); sh.scale.set(sx, sy, sz); sh.visible = lvl > 0; sh.userData.lvl = lvl;
  return { root, shield: sh, flames, muzzles, size: { x: sx, y: sy, z: sz, len: L } };
}
// count triangles (tests only)
export function triCount(obj) { let n = 0; obj.traverse((m) => { if (m.isMesh) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return n; }
