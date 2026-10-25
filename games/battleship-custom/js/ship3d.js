// Low-poly BattleShip builder (three.js). buildShip(parts, colors) → THREE.Group. Nose points +X, up is +Y.
// buildShip(parts, colors, { shield: 'editor' | 'demo' | 'thumb' }): the editor bubble is very faint so the ship reads clearly.
// Every top-level child is tagged child.userData.slot = hull|armor|guns|hangar|engine|shield (used by focusPart for part close-ups).
// group.userData: { L, W, H, turrets:[{ node, head, muzzles:[Object3D] }], engines:[Mesh], hangar: Object3D|null, shield: Mesh|null, glow }
import * as THREE from 'three';
import { part } from './battleship-stats.js?v=1';

export const HULL_DIM = { corvette: [3, 0.9, 0.6], frigate: [4.2, 1.2, 0.75], cruiser: [5.6, 1.6, 0.95], dreadnought: [7.5, 2.2, 1.25] };
const ENGINES_N = { corvette: 2, frigate: 2, cruiser: 3, dreadnought: 4 };
const SHIELD_COL = { basic: 0x4aa8ff, deflector: 0x5cf0ff, aegis: 0xffe14d };
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.62, metalness: 0.25, ...o });
const glowM = (c) => new THREE.MeshBasicMaterial({ color: c });
function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function cyl(rt, rb, h, seg, mat) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); }

export const SHIELD_REST = { editor: 0.03, demo: 0.08 }; // material.opacity at rest (the rim is brighter, the middle almost clear)
// edge-glow shield: alpha = opacity * (0.15 + 5 * fresnel), so the ship inside stays clearly visible
function rimMat(color, op) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(color) }, uOp: { value: op } }, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uOp; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(uC, clamp(uOp * (0.15 + 5.0 * f), 0.0, 1.0)); }',
  });
  m.opacity = op; return m;
}
export function buildShip(parts, colors = {}, opts = {}) {
  const g = new THREE.Group();
  let tagFrom = 0; const tag = (slot) => { for (let i = tagFrom; i < g.children.length; i++) g.children[i].userData.slot = slot; tagFrom = g.children.length; };
  const hullP = part('hull', parts.hull), arm = part('armor', parts.armor), sh = part('shield', parts.shield), gun = part('guns', parts.guns), hg = part('hangar', parts.hangar), en = part('engine', parts.engine);
  const [L, W, H] = HULL_DIM[hullP.id];
  const pri = M(colors.primary || '#2f80ed'), sec = M(colors.secondary || '#ffe14d'), dark = M(0x2a3140), steel = M(0x8a97a8), black = M(0x0d1016, { roughness: 1 });
  const ud = { L, W, H, turrets: [], engines: [], hangar: null, shield: null, glow: en.glow };

  // --- hull: mid block + wedge nose + keel + bridge + fins
  const mid = box(L * 0.62, H, W, pri, -L * 0.07, 0, 0); g.add(mid);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.02, W * 0.72, L * 0.38, 4, 1), pri);
  nose.rotation.z = -Math.PI / 2; nose.rotation.x = Math.PI / 4; nose.scale.set(1, 1, H / W * 1.05);
  nose.position.set(L * 0.24 + L * 0.19 - 0.02, 0, 0); g.add(nose);
  g.add(box(L * 0.7, H * 0.35, W * 0.55, dark, -L * 0.04, -H * 0.62, 0));              // keel
  g.add(box(L * 0.64, H * 0.08, W * 1.02, sec, -L * 0.07, H * 0.18, 0));               // stripe
  const br = box(L * 0.14, H * 0.55, W * 0.4, pri, -L * 0.26, H * 0.75, 0); g.add(br);  // bridge
  g.add(box(L * 0.1, H * 0.16, W * 0.42, glowM(0x8fe8ff), -L * 0.2, H * 0.82, 0));      // bridge windows
  g.add(box(L * 0.05, H * 0.5, 0.04, sec, -L * 0.3, H * 1.25, 0));                      // mast
  for (const s of [-1, 1]) { const fin = box(L * 0.18, H * 0.08, W * 0.45, dark, -L * 0.32, -H * 0.1, s * W * 0.68); g.add(fin); }

  tag('hull');
  // --- armor
  if (arm.id === 'plated') for (const s of [-1, 1]) { g.add(box(L * 0.56, H * 0.62, 0.07, steel, -L * 0.07, -H * 0.05, s * (W / 2 + 0.03))); g.add(box(L * 0.56, 0.04, 0.09, sec, -L * 0.07, H * 0.27, s * (W / 2 + 0.04))); }
  if (arm.id === 'reactive') { const n = Math.round(L * 1.6); for (const s of [-1, 1]) for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { const c = cyl(0.11, 0.11, 0.07, 6, j ? steel : sec); c.rotation.x = Math.PI / 2; c.position.set(-L * 0.36 + (i / Math.max(1, n - 1)) * L * 0.58, -H * 0.2 + j * H * 0.35, s * (W / 2 + 0.035)); g.add(c); } }
  if (arm.id === 'heavy') { for (const s of [-1, 1]) g.add(box(L * 0.66, H * 0.8, 0.16, steel, -L * 0.06, -H * 0.05, s * (W / 2 + 0.07))); const ram = box(L * 0.08, H * 0.9, W * 1.12, steel, L * 0.25, -H * 0.05, 0); g.add(ram); }

  tag('armor');
  // --- turrets on hardpoints (top spine, then sides for 4+)
  const hard = hullP.hard, pts = [];
  const topN = Math.min(hard, hard <= 3 ? hard : Math.ceil(hard / 2));
  for (let i = 0; i < topN; i++) pts.push([L * 0.2 - (i / Math.max(1, topN - 1 || 1)) * L * 0.38 * (topN > 1 ? 1 : 0) - (topN === 1 ? 0 : 0), H / 2, 0, 0]);
  const rest = hard - topN;
  for (let i = 0; i < rest; i++) { const s = i % 2 ? -1 : 1, k = Math.floor(i / 2), nk = Math.ceil(rest / 2); pts.push([L * 0.12 - (k / Math.max(1, nk)) * L * 0.4, H * 0.12, s * (W / 2 + 0.1), s]); }
  const ts = 0.55 + W * 0.12;
  for (const [x, y, z, side] of pts) {
    const node = new THREE.Group(); node.position.set(x, y, z);
    if (side) node.rotation.x = side * -Math.PI / 2.6;
    const base = cyl(0.2 * ts, 0.26 * ts, 0.12 * ts, 6, dark); base.position.y = 0.06 * ts; node.add(base);
    const head = new THREE.Group(); head.position.y = 0.16 * ts; node.add(head);
    head.add(box(0.36 * ts, 0.16 * ts, 0.3 * ts, pri));
    const muzzles = [];
    const barrel = (len, r, zoff, mat = steel) => { const b = cyl(r, r, len, 6, mat); b.rotation.z = -Math.PI / 2; b.position.set(0.16 * ts + len / 2, 0.02 * ts, zoff); head.add(b); const mz = new THREE.Object3D(); mz.position.set(0.16 * ts + len, 0.02 * ts, zoff); head.add(mz); muzzles.push(mz); };
    if (gun.id === 'laser') { barrel(0.38 * ts, 0.025 * ts, 0.07 * ts); barrel(0.38 * ts, 0.025 * ts, -0.07 * ts); }
    if (gun.id === 'pulse') { barrel(0.26 * ts, 0.07 * ts, 0, dark); head.add(box(0.06 * ts, 0.1 * ts, 0.1 * ts, glowM(0xffd84a), 0.44 * ts, 0.02 * ts, 0)); }
    if (gun.id === 'missile') { head.children[0].scale.set(1.1, 1.8, 1.3); for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const t = cyl(0.04 * ts, 0.04 * ts, 0.04 * ts, 6, black); t.rotation.z = -Math.PI / 2; t.position.set(0.19 * ts, (a - 0.5) * 0.12 * ts + 0.02 * ts, (b - 0.5) * 0.14 * ts); head.add(t); const mz = new THREE.Object3D(); mz.position.copy(t.position); head.add(mz); muzzles.push(mz); } }
    if (gun.id === 'rail') { barrel(0.7 * ts, 0.02 * ts, 0.05 * ts); barrel(0.7 * ts, 0.02 * ts, -0.05 * ts); muzzles.length = 1; muzzles[0].position.z = 0; head.add(box(0.1 * ts, 0.04 * ts, 0.04 * ts, glowM(0x7fe6ff), 0.3 * ts, 0.09 * ts, 0)); }
    if (gun.id === 'lance') { barrel(0.5 * ts, 0.045 * ts, 0); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09 * ts, 0.14 * ts, 6), glowM(0xc77dff)); tip.rotation.z = Math.PI / 2; tip.position.set(0.7 * ts, 0.02 * ts, 0); head.add(tip); }
    g.add(node); ud.turrets.push({ node, head, muzzles });
  }

  tag('guns');
  // --- hangar
  if (hg.id === 'bay' || hg.id === 'carrier') {
    const bayL = L * (hg.id === 'carrier' ? 0.34 : 0.22);
    const s = 1; const recess = box(bayL, H * 0.5, 0.05, black, -L * 0.02, -H * 0.12, s * (W / 2 + 0.005)); g.add(recess);
    g.add(box(bayL, 0.035, 0.06, glowM(0x7dffb0), -L * 0.02, H * 0.15, s * (W / 2 + 0.01)));
    const door = new THREE.Object3D(); door.position.set(-L * 0.02, -H * 0.12, s * (W / 2 + 0.2)); g.add(door); ud.hangar = door;
    if (hg.id === 'carrier') { // flight deck sponson on the other side
      const deck = box(L * 0.7, H * 0.12, W * 0.55, dark, -L * 0.05, H * 0.2, -(W / 2 + W * 0.27)); g.add(deck);
      for (let i = 0; i < 6; i++) g.add(box(L * 0.04, 0.02, 0.05, glowM(0xffe14d), -L * 0.38 + i * L * 0.12, H * 0.27, -(W / 2 + W * 0.27)));
      g.add(box(L * 0.4, H * 0.3, W * 0.08, sec, -L * 0.05, 0, -(W / 2 + 0.02)));
    }
  }
  if (hg.id === 'pods') {
    const n = Math.round(L * 1.2);
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) { const p = cyl(0.09, 0.09, 0.22, 6, sec); p.rotation.x = Math.PI / 2; p.position.set(-L * 0.3 + (i / Math.max(1, n - 1)) * L * 0.45, -H * 0.82, s * W * 0.2); g.add(p); }
    const door = new THREE.Object3D(); door.position.set(-L * 0.05, -H * 0.95, 0); g.add(door); ud.hangar = door;
  }

  tag('hangar');
  // --- engines
  const nE = ENGINES_N[hullP.id], er = H * (nE > 2 ? 0.24 : 0.3), gl = glowM(en.glow);
  for (let i = 0; i < nE; i++) {
    const zz = (i - (nE - 1) / 2) * (W * 0.75 / Math.max(1, nE - 1)) * (nE > 1 ? 1 : 0);
    const nz = cyl(er * 0.8, er, L * 0.12, 8, dark); nz.rotation.z = Math.PI / 2; nz.position.set(-L * 0.42, -H * 0.05, zz); g.add(nz);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(er * 0.75, L * 0.14, 8), gl.clone()); fl.material.transparent = true; fl.material.opacity = 0.85;
    fl.rotation.z = Math.PI / 2; fl.position.set(-L * 0.48 - L * 0.06, -H * 0.05, zz); g.add(fl); ud.engines.push(fl);
    if (en.id === 'gravitic') { const r = new THREE.Mesh(new THREE.TorusGeometry(er * 1.15, er * 0.18, 4, 10), gl); r.rotation.y = Math.PI / 2; r.position.set(-L * 0.4, -H * 0.05, zz); g.add(r); }
  }
  if (en.id === 'warp') for (const s of [-1, 1]) {
    const nac = cyl(H * 0.16, H * 0.16, L * 0.5, 6, sec); nac.rotation.z = Math.PI / 2; nac.position.set(-L * 0.22, H * 0.15, s * (W / 2 + H * 0.35)); g.add(nac);
    const st = box(L * 0.12, 0.05, H * 0.35, dark, -L * 0.22, H * 0.15, s * (W / 2 + H * 0.15)); g.add(st);
    const gw = box(L * 0.42, H * 0.06, H * 0.06, gl, -L * 0.22, H * 0.15, s * (W / 2 + H * 0.35 + H * 0.15)); g.add(gw);
  }
  if (en.id === 'fusion') { const ring = box(L * 0.05, H * 1.05, W * 0.9, sec, -L * 0.36, 0, 0); g.add(ring); }

  tag('engine');
  // --- shield bubble: editor + demo = a light edge glow only (fresnel rim, ~0.03 / 0.08 opacity at rest, flashes on hit); card thumbnails = solid wire so the shape reads
  if (sh.id !== 'none') {
    let sm;
    if (opts.shield === 'thumb') {
      const geo = new THREE.IcosahedronGeometry(1, 2);
      sm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: SHIELD_COL[sh.id], transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
      sm.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: SHIELD_COL[sh.id], wireframe: true, transparent: true, opacity: 0.5, depthWrite: false })));
      sm.userData.base = 0.2;
    } else {
      const base = SHIELD_REST[opts.shield] || SHIELD_REST.editor;
      sm = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), rimMat(SHIELD_COL[sh.id], base)); sm.userData.base = base;
      sm.onBeforeRender = () => { const u = sm.material.uniforms; if (u) u.uOp.value = sm.material.opacity; }; // (ghosted in part close-ups = plain material)
    }
    sm.scale.set(L * 0.66, H * 1.6 + 0.3, W * 0.95 + 0.4); g.add(sm); ud.shield = sm;
  }
  tag('shield');
  g.userData = ud;
  return g;
}
// focusPart(group, slot): dark ghost for everything that is not this part, the part itself gets a bright emissive boost; returns its bounding box (for close-up thumbnails).
const ghost = new THREE.MeshStandardMaterial({ color: 0x161b28, flatShading: true, roughness: 1, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false });
export function focusPart(g, slot) {
  const box = new THREE.Box3(), mine = g.children.filter((c) => c.userData.slot === slot), lit = new Map();
  for (const c of g.children) {
    if (c.userData.slot === 'shield' && slot !== 'shield') { c.visible = false; continue; } // a ghosted bubble would cover the part
    if (c.userData.slot !== slot) { c.traverse((m) => { if (m.isMesh) { m.material.dispose(); m.material = ghost; m.renderOrder = 1; } }); continue; }
    c.traverse((m) => {
      if (!m.isMesh || !m.material.isMeshStandardMaterial) return;
      if (!lit.has(m.material)) { const b = m.material.clone(); b.emissive = m.material.color.clone().lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar(0.75); /* dark parts (bay, nozzles) still lift off the ghost */ b.roughness = 0.45; lit.set(m.material, b); }
      m.material = lit.get(m.material);
    });
  }
  for (const o of lit.keys()) o.dispose();
  g.updateMatrixWorld(true);
  if (mine.length) for (const c of mine) box.expandByObject(c); else box.setFromObject(g);
  return { box, empty: !mine.length };
}
export function disposeTree(o) {
  o.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (x !== ghost) x.dispose(); }); });
}
