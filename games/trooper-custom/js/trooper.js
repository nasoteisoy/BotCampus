// Trooper Customizer: model + look data. One low-poly space-era rifle trooper built from primitives.
// RTS budget: ~1,000 tris, 2 materials (team atlas + visor). Colors + flag symbol live in one small
// canvas atlas per team, so recoloring never adds materials or draw calls.
import * as THREE from 'three';

// ---------- option data ----------
export const PRIMARY = ['#e8eef4', '#9aa4ae', '#2e343c', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#5b7a3a', '#1abc9c', '#2f80ed', '#6c4bd1', '#d35b9f'];
export const SECONDARY = ['#f4f6f8', '#c9a227', '#1b1f24', '#ff5a3c', '#ff9f1a', '#ffe14d', '#4cd964', '#00d4ff', '#3a5bff', '#a64dff', '#ff4fa0', '#8b5a2b'];
export const SUIT = ['#2a2f36', '#3d4434', '#5e5444', '#25304a', '#cfd4da'];
export const SKIN = ['#f1c9a5', '#d9a37a', '#a8714a', '#7a4b2e', '#4a2e1e'];
export const VISOR = ['#5ee8ff', '#ff4a4a', '#ffb43a', '#5dff7a', '#b779ff', '#f2f6ff'];
export const GLOW = [0, 0.6, 1.4];
export const GUNMETAL = '#3b4047', TRIM = '#d9dee4';
export const SYMBOLS = ['star', 'planet', 'comet', 'skull', 'wing', 'bolt', 'chevron', 'crescent', 'gear', 'atom', 'triangle', 'circle'];

// ----- data model -----
// Nation-level (edited once, shared by every unit of the nation): colors, suit tone, flag symbol, tech glow.
// Unit-level: shape / gear only. Field order = code order; never reorder, only append.
export const NATION_FIELDS = [['suit', 5], ['sym', 12], ['sc', 4], ['vis', 6], ['glow', 3]];
export const NATION_DEFAULT = Object.freeze({ p: '#2f80ed', s: '#ffe14d', suit: 0, sym: 0, sc: 0, vis: 0, glow: 1 });
export const TROOPER_FIELDS = [['helm', 5], ['armor', 3], ['pads', 3], ['pack', 4], ['rifle', 3], ['extra', 3], ['banner', 2], ['skin', 5]];
export const TROOPER_DEFAULT = Object.freeze({ helm: 0, armor: 1, pads: 1, pack: 3, rifle: 0, extra: 0, banner: 1, skin: 1 });
// legacy v1 (TC1) trooper code layout
export const TC1_FIELDS = [
  ['sym', 12], ['sc', 4], ['helm', 5], ['vis', 6], ['glow', 3], ['armor', 3], ['pads', 3],
  ['pack', 4], ['rifle', 3], ['extra', 3], ['banner', 2], ['suit', 5], ['skin', 5],
];

const HEX = /^#?([0-9a-f]{6})$/i;
export function normHex(h, fb) { const m = HEX.exec(String(h || '').trim()); return m ? '#' + m[1].toLowerCase() : fb; }
export function sanitizeFields(o, fields, defaults) {
  const st = { ...defaults };
  if (!o || typeof o !== 'object') return st;
  for (const [k, n] of fields) { const v = Number(o[k]); if (o[k] !== '' && o[k] != null && Number.isInteger(v) && v >= 0 && v < n) st[k] = v; }
  return st;
}
export function sanitizeNation(o) {
  const n = sanitizeFields(o, NATION_FIELDS, NATION_DEFAULT);
  n.p = normHex(o && o.p, NATION_DEFAULT.p); n.s = normHex(o && o.s, NATION_DEFAULT.s);
  return n;
}
export const digits = (st, fields) => fields.map(([k]) => st[k].toString(36)).join('').toUpperCase();
export function undigits(str, fields, defaults) {
  str = String(str || '').toLowerCase();
  if (!/^[0-9a-z]*$/.test(str) || str.length > fields.length) return null;
  const o = { ...defaults };
  for (let i = 0; i < str.length; i++) { const [k, n] = fields[i], v = parseInt(str[i], 36); if (!(v >= 0 && v < n)) return null; o[k] = v; }
  return o;
}
export const nationCode = (n) => (n.p.slice(1) + n.s.slice(1)).toUpperCase() + digits(n, NATION_FIELDS);
export function decodeNation(c) {
  const m = /^([0-9A-F]{6})([0-9A-F]{6})([0-9A-Z]*)$/i.exec(String(c || ''));
  if (!m) return null;
  const o = undigits(m[3], NATION_FIELDS, NATION_DEFAULT); if (!o) return null;
  return { ...o, p: '#' + m[1].toLowerCase(), s: '#' + m[2].toLowerCase() };
}
// legacy TC1 trooper code -> { nation, trooper }
export function encodeTC1(nation, trooper) {
  const st = { ...nation, ...trooper };
  return ('TC1:' + st.p.slice(1) + st.s.slice(1) + TC1_FIELDS.map(([k]) => st[k].toString(36)).join('')).toUpperCase();
}
export function decodeTC1(code) {
  const m = /^TC1:([0-9A-F]{6})([0-9A-F]{6})([0-9A-Z]*)$/i.exec(String(code || '').replace(/\s+/g, ''));
  if (!m) return null;
  const all = { ...NATION_DEFAULT, ...TROOPER_DEFAULT, p: '#' + m[1].toLowerCase(), s: '#' + m[2].toLowerCase() };
  const rest = m[3].toLowerCase();
  if (rest.length > TC1_FIELDS.length) return null;
  for (let i = 0; i < rest.length; i++) { const [k, n] = TC1_FIELDS[i], v = parseInt(rest[i], 36); if (!(v >= 0 && v < n)) return null; all[k] = v; }
  return { nation: sanitizeNation(all), trooper: sanitizeFields(all, TROOPER_FIELDS, TROOPER_DEFAULT) };
}
// TC2 = player + nation + both unit looks; base64url(JSON), UTF-8 safe
const b64e = (str) => { const b = new TextEncoder().encode(str); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64d = (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0))); };
export function encodeTC2({ player, nationName, nation, trooper, tank, unit }, TANK_FIELDS) {
  return 'TC2:' + b64e(JSON.stringify({ pl: String(player || '').slice(0, 24), nn: String(nationName || '').slice(0, 24), n: nationCode(nation), t: digits(trooper, TROOPER_FIELDS), k: digits(tank, TANK_FIELDS), u: unit === 'tank' ? 'k' : 't' }));
}
export function decodeTC2(code, TANK_FIELDS, TANK_DEFAULT) {
  const m = /^TC2:([A-Za-z0-9_-]+)$/.exec(String(code || '').replace(/\s+/g, ''));
  if (!m) return null;
  let o; try { o = JSON.parse(b64d(m[1])); } catch (e) { return null; }
  if (!o || typeof o !== 'object') return null;
  const nation = decodeNation(o.n); if (!nation) return null;
  const trooper = undigits(o.t ?? '', TROOPER_FIELDS, TROOPER_DEFAULT), tank = undigits(o.k ?? '', TANK_FIELDS, TANK_DEFAULT);
  if (!trooper || !tank) return null;
  const clean = (x) => String(x ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);
  return { player: clean(o.pl), nationName: clean(o.nn), nation, trooper, tank, unit: o.u === 'k' ? 'tank' : 'trooper' };
}
export function lum(hex) {
  const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // c is linear
}
export function symbolColor(st) {
  if (st.sc === 1) return '#f4f6f8';
  if (st.sc === 2) return '#14171c';
  if (st.sc === 3) return st.p;
  return lum(st.s) > 0.33 ? '#14171c' : '#f4f6f8';
}

// ---------- flag symbols (vector, drawn on canvas) ----------
export function drawSymbol(ctx, idx, cx, cy, r, col) {
  const name = SYMBOLS[idx] || 'star';
  ctx.save(); ctx.translate(cx, cy); ctx.scale(r / 10, r / 10);
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const P = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };
  switch (name) {
    case 'star': { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 4.2 : 10; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); } P(pts); ctx.fill(); break; }
    case 'planet': ctx.beginPath(); ctx.arc(0, 0, 5.6, 0, 7); ctx.fill();
      ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(0, 0, 10, 3.4, -0.4, 0.15 * Math.PI, 1.0 * Math.PI, true); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 3.4, -0.4, 0, 0.12 * Math.PI); ctx.stroke(); break;
    case 'comet': ctx.beginPath(); ctx.arc(4, -4, 4.6, 0, 7); ctx.fill();
      ctx.lineWidth = 2.4; [[-1, 1.5], [1.5, 4.2], [-4, -1.2]].forEach(([dx, dy], i) => { ctx.beginPath(); ctx.moveTo(4 + dx * .3, -4 + dy * .3); ctx.lineTo(-8 + dx, 8 + dy - (i === 2 ? 0 : 0)); ctx.stroke(); }); break;
    case 'skull': ctx.beginPath(); ctx.arc(0, -2, 8, Math.PI, 0); ctx.lineTo(8, 2); ctx.lineTo(5, 4.5); ctx.lineTo(5, 9); ctx.lineTo(-5, 9); ctx.lineTo(-5, 4.5); ctx.lineTo(-8, 2); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(-3.3, -1.5, 2.4, 0, 7); ctx.arc(3.3, -1.5, 2.4, 0, 7); ctx.fill();
      P([[0, 1.5], [1.4, 4], [-1.4, 4]]); ctx.fill();
      ctx.fillRect(-2.6, 6.2, 1.2, 2.8); ctx.fillRect(1.4, 6.2, 1.2, 2.8); ctx.fillRect(-0.6, 6.2, 1.2, 2.8);
      ctx.globalCompositeOperation = 'source-over'; break;
    case 'wing': for (let i = 0; i < 4; i++) { P([[-9, -6 + i * 0], [9 - i * 3, -6 + i * 4], [7 - i * 3, -3 + i * 4], [-9, -2 + i * 2.5]]); ctx.fill(); } break;
    case 'bolt': P([[2.5, -10], [-6.5, 1.5], [-0.5, 1.5], [-3, 10], [6.5, -2.5], [0.5, -2.5]]); ctx.fill(); break;
    case 'chevron': P([[0, -9], [10, -1], [10, 4], [0, -3.5], [-10, 4], [-10, -1]]); ctx.fill();
      P([[0, 0], [8, 6], [8, 10], [0, 4.5], [-8, 10], [-8, 6]]); ctx.fill(); break;
    case 'crescent': ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(4.2, -2, 8, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; break;
    case 'gear': { const pts = []; for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2, t = i % 4; pts.push([Math.cos(a) * (t < 2 ? 10 : 7.4), Math.sin(a) * (t < 2 ? 10 : 7.4)]); } P(pts); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; break; }
    case 'atom': ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 10, 3.6, i * Math.PI / 3, 0, 7); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 7); ctx.fill(); break;
    case 'triangle': P([[0, -10], [9.5, 8], [-9.5, 8]]); ctx.fill(); ctx.globalCompositeOperation = 'destination-out';
      P([[0, -2.5], [3.8, 4.6], [-3.8, 4.6]]); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; break;
    case 'circle': ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, 7); ctx.fill(); break;
  }
  ctx.restore();
}

// ---------- team look: atlas texture + 2 shared materials ----------
// Atlas 160x64: [0..64) flag tile, then six 16px solid swatches: primary, secondary, skin, suit, gunmetal, trim.
const AW = 160, AH = 64;
const REG = { P: 0, S: 1, K: 2, D: 3, G: 4, L: 5 };
const regU = (k) => (64 + 8 + 16 * REG[k]) / AW;
const FLAG_U0 = 1.5 / AW, FLAG_U1 = 62.5 / AW;

export class TeamLook {
  constructor() {
    this.canvas = document.createElement('canvas'); this.canvas.width = AW; this.canvas.height = AH;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter; this.tex.magFilter = THREE.LinearFilter; this.tex.anisotropy = 1;
    this.team = new THREE.MeshLambertMaterial({ map: this.tex, flatShading: true });
    this.visor = new THREE.MeshLambertMaterial({ color: 0x5ee8ff, flatShading: true });
    this.team.name = 'team-atlas'; this.visor.name = 'visor';
  }
  paint(st) {
    const c = this.ctx, sw = [st.p, st.s, SKIN[st.skin], SUIT[st.suit], GUNMETAL, TRIM];
    sw.forEach((col, i) => { c.fillStyle = col; c.fillRect(64 + 16 * i, 0, 16, AH); });
    c.fillStyle = st.s; c.fillRect(0, 0, 64, 64);
    c.strokeStyle = st.p; c.lineWidth = 4; c.strokeRect(2, 2, 60, 60);
    drawSymbol(c, st.sym, 32, 32, 21, symbolColor(st));
    this.tex.needsUpdate = true;
    const v = new THREE.Color(VISOR[st.vis]), g = GLOW[st.glow];
    this.visor.color.copy(v).multiplyScalar(g ? 0.5 : 0.85);
    this.visor.emissive.copy(v); this.visor.emissiveIntensity = g;
  }
  hash() { // tiny fingerprint for tests
    const d = this.ctx.getImageData(0, 0, AW, AH).data; let h = 0;
    for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) >>> 0;
    return h;
  }
}

// ---------- geometry builder ----------
export const PIVOT = { legs: [0, 0, 0], torso: [0, 0.95, 0], head: [0, 1.46, 0], arms: [0, 1.36, 0] };
export const PARENT = { legs: null, torso: null, head: 'torso', arms: 'torso' };
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n, 1);
export const sph = (r, ws = 8, hs = 6, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl);
export const HALF = Math.PI / 2;

export class Builder {
  constructor() { this.parts = []; this.stack = [new THREE.Matrix4()]; this.bone = 'torso'; }
  get top() { return this.stack[this.stack.length - 1]; }
  push(m) { this.stack.push(this.top.clone().multiply(m)); }
  pop() { this.stack.pop(); }
  // reg: one of P S K D G L (atlas swatch), V (visor material), or {flag:[faceIdx...], base:'S'}
  add(geo, reg, m = null) {
    let flagFaces = null, base = reg;
    if (typeof reg === 'object') { flagFaces = reg.flag; base = reg.base || 'S'; }
    if (flagFaces) { // remap box faces (4 verts each, indexed layout) into the flag tile
      const uv = geo.attributes.uv;
      for (const f of flagFaces) for (let i = f * 4; i < f * 4 + 4; i++) uv.setX(i, FLAG_U0 + uv.getX(i) * (FLAG_U1 - FLAG_U0));
    }
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (base !== 'V') {
      const uv = g.attributes.uv, u = regU(base);
      const keep = flagFaces ? new Set() : null;
      if (flagFaces) for (const f of flagFaces) for (let t = f * 6; t < f * 6 + 6; t++) keep.add(t); // BoxGeometry: 2 tris/face
      for (let i = 0; i < uv.count; i++) if (!keep || !keep.has(i)) uv.setXY(i, u, 0.5);
    }
    g.applyMatrix4(m ? this.top.clone().multiply(m) : this.top);
    this.parts.push({ geo: g, mat: base === 'V' ? 'visor' : 'team', bone: this.bone });
    return g;
  }
  // box stretched between two points (limbs); returns its local matrix for attachments
  seg(a, b, w, d, reg) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1));
    this.add(box(w, len, d), reg, m);
    return { m, len };
  }
}

// rifle grip transform (arms space = world rest pose)
const RIFLE_POS = [-0.085, 1.16, 0.25], RIFLE_PITCH = 0.18, RIFLE_YAW = 0.1;
const FOREGRIP = [0.25, 0.33, 0.13];

export function buildParts(st) {
  const b = new Builder();
  const heavy = st.armor === 2, med = st.armor >= 1;
  // ----- legs -----
  b.bone = 'legs';
  for (const sx of [1, -1]) {
    const dz = sx > 0 ? 0.06 : -0.04; // relaxed stance: left foot forward
    const hip = [0.105 * sx, 0.9, 0], knee = [0.125 * sx, 0.5, 0.03 + dz * 0.6], ank = [0.13 * sx, 0.11, dz];
    b.seg(hip, knee, 0.165, 0.18, 'D');
    b.seg(knee, ank, 0.14, 0.155, 'D');
    b.add(box(0.16, 0.1, 0.27), 'G', M(0.13 * sx, 0.05, dz + 0.035));
    if (med) b.add(box(0.12, 0.09, 0.05), 'S', M(0.125 * sx, 0.5, 0.115 + dz * 0.6, -0.1));
    if (med) b.add(box(heavy ? 0.18 : 0.16, heavy ? 0.2 : 0.16, 0.045), 'P', M(0.115 * sx, 0.72, 0.1 + dz * 0.3, 0.05 - dz));
    if (heavy) b.add(box(0.15, 0.24, 0.045), 'P', M(0.128 * sx, 0.3, 0.09 + dz * 0.8, 0.04));
  }
  b.add(box(0.34, 0.2, 0.21), 'D', M(0, 0.9, 0));
  if (heavy) b.add(box(0.32, 0.12, 0.04), 'P', M(0, 0.86, 0.12, -0.15));
  // ----- torso -----
  b.bone = 'torso';
  b.add(box(0.37, 0.06, 0.23), 'S', M(0, 1.0, 0));
  b.add(box(0.36, 0.4, 0.21), 'D', M(0, 1.21, 0));
  b.add(cyl(0.055, 0.065, 0.1, 6), 'D', M(0, 1.44, 0));
  let bz;
  if (st.armor === 0) {
    b.add(box(0.32, 0.2, 0.05), 'P', M(0, 1.29, 0.11));
    b.add(box(0.3, 0.2, 0.04), 'P', M(0, 1.29, -0.115));
    bz = -0.135;
  } else if (st.armor === 1) {
    b.add(box(0.38, 0.26, 0.08), 'P', M(0, 1.28, 0.11));
    b.add(box(0.3, 0.1, 0.05), 'P', M(0, 1.1, 0.11));
    b.add(box(0.36, 0.28, 0.06), 'P', M(0, 1.27, -0.115));
    b.add(box(0.05, 0.27, 0.01), 'S', M(0.1, 1.28, 0.152));
    bz = -0.145;
  } else {
    b.add(box(0.44, 0.32, 0.13), 'P', M(0, 1.26, 0.1));
    b.add(box(0.34, 0.12, 0.07), 'P', M(0, 1.07, 0.11));
    b.add(box(0.42, 0.32, 0.08), 'P', M(0, 1.26, -0.11));
    b.add(box(0.3, 0.06, 0.25), 'S', M(0, 1.43, 0));
    b.add(box(0.12, 0.04, 0.01), 'S', M(0.1, 1.33, 0.168));
    b.add(box(0.12, 0.04, 0.01), 'S', M(0.1, 1.27, 0.168));
    bz = -0.15;
  }
  // shoulder pads
  for (const sx of [1, -1]) {
    if (st.pads === 1) {
      b.add(sph(0.12, 8, 5), 'P', M(0.265 * sx, 1.4, 0, 0, 0, 0, 0.85, 0.55, 1));
      b.add(cyl(0.06, 0.06, 0.012, 6), 'S', M(0.265 * sx, 1.462, 0, 0, 0, 0, 1, 1, 1.2));
    } else if (st.pads === 2) {
      b.add(box(0.17, 0.06, 0.21), 'P', M(0.27 * sx, 1.41, 0, 0, 0, -0.35 * sx));
      b.add(box(0.15, 0.04, 0.19), 'S', M(0.32 * sx, 1.35, 0, 0, 0, -0.65 * sx));
    }
  }
  // backpack
  let pd = 0, antenna = null;
  if (st.pack === 1) { // jetpack
    for (const sx of [1, -1]) {
      b.add(cyl(0.06, 0.06, 0.3, 8), 'P', M(0.08 * sx, 1.22, bz - 0.07));
      b.add(cyl(0.035, 0.06, 0.03, 6), 'S', M(0.08 * sx, 1.385, bz - 0.07));
      b.add(cyl(0.05, 0.035, 0.07, 6), 'G', M(0.08 * sx, 1.035, bz - 0.07));
      b.add(cyl(0.035, 0.035, 0.012, 6), 'V', M(0.08 * sx, 0.998, bz - 0.07));
    }
    b.add(box(0.1, 0.24, 0.08), 'S', M(0, 1.24, bz - 0.04));
    pd = 0.14;
  } else if (st.pack === 2) { // radio
    b.add(box(0.26, 0.3, 0.11), 'D', M(0, 1.21, bz - 0.055));
    b.add(box(0.18, 0.1, 0.012), 'S', M(0, 1.25, bz - 0.112));
    b.add(box(0.03, 0.03, 0.012), 'V', M(-0.07, 1.13, bz - 0.112));
    antenna = [0.09, bz - 0.08];
    b.add(cyl(0.006, 0.01, 0.64, 4), 'G', M(antenna[0], 1.66, antenna[1]));
    b.add(cyl(0.02, 0.02, 0.04, 6), 'D', M(antenna[0], 1.36, antenna[1]));
    if (!st.banner) b.add(box(0.025, 0.025, 0.025), 'V', M(antenna[0], 1.99, antenna[1]));
    pd = 0.11;
  } else if (st.pack === 3) { // ammo pack
    b.add(box(0.3, 0.22, 0.11), 'S', M(0, 1.22, bz - 0.055));
    for (const sx of [1, -1]) b.add(box(0.12, 0.12, 0.04), 'P', M(0.075 * sx, 1.18, bz - 0.13));
    b.add(cyl(0.05, 0.05, 0.32, 8), 'D', M(0, 1.38, bz - 0.06, 0, 0, HALF));
    pd = 0.15;
  }
  const backZ = bz - pd;
  // banner / antenna flag
  if (st.banner) {
    let px = 0.1, pz = backZ - 0.02, top = 1.97;
    if (antenna) { px = antenna[0]; pz = antenna[1]; }
    else { b.add(cyl(0.008, 0.008, 0.82, 4), 'G', M(px, 1.56, pz)); b.add(cyl(0.02, 0.02, 0.03, 6), 'S', M(px, 1.16, pz)); }
    b.add(box(0.22, 0.15, 0.006), { flag: [4, 5], base: 'S' }, M(px - 0.115, top - 0.09, pz));
    b.add(box(0.026, 0.026, 0.026), 'S', M(px, top + 0.005, pz));
  }
  // cape / scarf
  if (st.extra === 1) {
    b.push(M(0, 1.41, Math.min(backZ, bz) - 0.02, 0.12));
    b.add(box(0.36, 0.74, 0.02), 'P', M(0, -0.37, 0));
    b.add(box(0.37, 0.05, 0.026), 'S', M(0, -0.72, 0));
    b.pop();
    b.add(box(0.4, 0.04, 0.05), 'S', M(0, 1.42, bz + 0.02));
  } else if (st.extra === 2) {
    b.add(new THREE.TorusGeometry(0.095, 0.035, 3, 8), 'S', M(0, 1.42, 0, HALF));
    b.add(box(0.075, 0.24, 0.02), 'S', M(-0.07, 1.3, bz - 0.005, 0.1, 0, -0.15));
  }
  // ----- head -----
  b.bone = 'head';
  const H = [0, 1.6, 0.01];
  const dome = (sy = 1.05) => b.add(sph(0.145, 10, 7), 'P', M(H[0], H[1], H[2], 0, 0, 0, 1, sy, 1.08));
  const band = (t0, tl) => b.add(sph(0.149, 8, 2, HALF - 1.0, 2.0, t0, tl), 'V', M(H[0], H[1], H[2], 0, 0, 0, 1, 1.05, 1.08));
  if (st.helm === 0) { // dome visor
    dome(); band(1.2, 0.55);
    b.add(box(0.15, 0.06, 0.08), 'S', M(0, 1.49, 0.1));
    for (const sx of [1, -1]) b.add(cyl(0.04, 0.04, 0.03, 8), 'S', M(0.148 * sx, 1.58, 0, 0, 0, HALF));
  } else if (st.helm === 1) { // angular
    b.add(cyl(0.12, 0.155, 0.2, 6), 'P', M(0, 1.59, 0, 0, Math.PI / 6));
    b.add(cyl(0.07, 0.12, 0.06, 6), 'P', M(0, 1.72, 0, 0, Math.PI / 6));
    b.add(box(0.22, 0.03, 0.05), 'S', M(0, 1.665, 0.12));
    b.add(box(0.17, 0.035, 0.02), 'V', M(0, 1.625, 0.128));
    b.add(box(0.035, 0.08, 0.02), 'V', M(0, 1.575, 0.128));
    b.add(box(0.14, 0.05, 0.07), 'D', M(0, 1.49, 0.09));
    for (const sx of [1, -1]) b.add(box(0.02, 0.11, 0.1), 'S', M(0.13 * sx, 1.55, 0.05, 0, 0.5 * sx));
  } else if (st.helm === 2) { // crested
    dome(1.0); band(1.35, 0.3);
    b.add(box(0.03, 0.1, 0.3), 'S', M(0, 1.75, -0.02, 0.15));
    b.add(box(0.02, 0.07, 0.12), 'S', M(0, 1.71, -0.17, 0.6));
    for (const sx of [1, -1]) b.add(box(0.03, 0.12, 0.1), 'P', M(0.135 * sx, 1.52, 0.06, 0, 0.35 * sx));
  } else if (st.helm === 3) { // open face + goggles
    b.add(sph(0.12, 8, 6), 'K', M(0, 1.585, 0.015, 0, 0, 0, 0.95, 1.12, 1));
    b.add(sph(0.142, 10, 4, 0, Math.PI * 2, 0, HALF), 'P', M(0, 1.6, 0.0, -0.12, 0, 0, 1, 1.0, 1.07));
    b.add(cyl(0.143, 0.143, 0.025, 10), 'S', M(0, 1.6, 0.0, -0.12, 0, 0, 1, 1, 1.07));
    for (const sx of [1, -1]) b.add(cyl(0.034, 0.034, 0.03, 8), 'V', M(0.045 * sx, 1.635, 0.123, HALF));
    b.add(box(0.03, 0.015, 0.02), 'G', M(0, 1.637, 0.128));
    b.add(box(0.08, 0.04, 0.04), 'G', M(0, 1.505, 0.115));
  } else { // recon mono-eye
    dome(1.0);
    b.add(box(0.19, 0.1, 0.05), 'D', M(0, 1.565, 0.12));
    b.add(cyl(0.05, 0.05, 0.04, 8), 'S', M(0.045, 1.6, 0.15, HALF));
    b.add(cyl(0.036, 0.036, 0.02, 8), 'V', M(0.045, 1.6, 0.172, HALF));
    b.add(box(0.04, 0.1, 0.07), 'S', M(-0.15, 1.6, 0));
    b.add(cyl(0.006, 0.008, 0.3, 4), 'G', M(-0.155, 1.78, -0.02));
  }
  // ----- arms + rifle -----
  b.bone = 'arms';
  const R = M(...RIFLE_POS).multiply(M(0, 0, 0, RIFLE_PITCH, RIFLE_YAW, 0));
  const fz = FOREGRIP[st.rifle];
  const gripW = new THREE.Vector3(0, -0.035, 0).applyMatrix4(R).toArray();
  const foreW = new THREE.Vector3(0, -0.03, fz).applyMatrix4(R).toArray();
  b.push(R);
  const ROT = (x, y, z, w, h, d, reg, rx = 0) => b.add(box(w, h, d), reg, M(x, y, z, rx));
  const BAR = (z, r, len, reg, y = 0.02, n = 8) => b.add(cyl(r, r, len, n), reg, M(0, y, z, HALF));
  if (st.rifle === 0) { // carbine
    ROT(0, 0.01, 0.08, 0.055, 0.085, 0.32, 'G');
    ROT(0, 0.06, 0.1, 0.057, 0.018, 0.2, 'S');
    BAR(0.34, 0.016, 0.2, 'G', 0.02, 6);
    BAR(0.45, 0.022, 0.04, 'D', 0.02, 6);
    ROT(0, -0.005, -0.15, 0.045, 0.075, 0.16, 'D');
    ROT(0, -0.06, -0.005, 0.035, 0.08, 0.04, 'D', 0.3);
    ROT(0, -0.08, 0.13, 0.035, 0.11, 0.05, 'D', 0.2);
    ROT(0, 0.08, 0.03, 0.03, 0.03, 0.07, 'G');
    ROT(0.029, 0.02, 0.18, 0.006, 0.015, 0.06, 'V');
  } else if (st.rifle === 1) { // long laser rifle
    ROT(0, 0.01, 0.1, 0.06, 0.09, 0.4, 'G');
    ROT(0, 0, -0.18, 0.05, 0.085, 0.2, 'D');
    BAR(0.52, 0.022, 0.46, 'G');
    for (const z of [0.38, 0.48, 0.58]) BAR(z, 0.034, 0.025, 'V', 0.02, 6);
    b.add(cyl(0.032, 0.022, 0.06, 8), 'S', M(0, 0.02, 0.77, HALF));
    BAR(0.06, 0.022, 0.18, 'S', 0.09);
    ROT(0, -0.06, -0.005, 0.035, 0.08, 0.04, 'D', 0.3);
    ROT(0, -0.075, 0.13, 0.04, 0.07, 0.09, 'S');
  } else { // bullpup
    ROT(0, 0, -0.08, 0.065, 0.12, 0.46, 'G');
    ROT(0, 0.09, 0.02, 0.03, 0.022, 0.22, 'S');
    for (const z of [-0.07, 0.11]) ROT(0, 0.07, z, 0.02, 0.03, 0.02, 'S');
    BAR(0.22, 0.017, 0.14, 'G', 0.02, 6);
    ROT(0, 0, -0.32, 0.068, 0.125, 0.03, 'D');
    ROT(0, -0.1, -0.17, 0.04, 0.1, 0.06, 'D', 0.15);
    ROT(0, -0.06, -0.005, 0.035, 0.08, 0.04, 'D', 0.3);
    ROT(0.034, 0.02, 0.0, 0.006, 0.02, 0.12, 'V');
  }
  b.pop();
  // right arm -> grip, left arm -> foregrip
  const arm = (sx, hand, elbow) => {
    const sh = [0.225 * sx, 1.37, 0];
    const up = b.seg(sh, elbow, 0.1, 0.11, 'D');
    const fo = b.seg(elbow, hand, 0.09, 0.1, 'D');
    b.add(box(0.075, 0.075, 0.08), 'G', M(...hand));
    if (med) b.add(box(0.105, fo.len * 0.45, 0.115), 'P', fo.m.clone().multiply(M(0, fo.len * 0.12, 0)));
    return up;
  };
  arm(-1, gripW, [-0.285, 1.13, 0.03]);
  const upL = arm(1, foreW, [0.255, 1.12, 0.1]);
  // shoulder patch with the team symbol (outer face of left upper arm, upright)
  b.add(box(0.006, 0.08, 0.08), { flag: [0], base: 'S' }, upL.m.clone().multiply(M(0.053, -upL.len * 0.12, 0, Math.PI)));
  return b.parts;
}

// ---------- merging ----------
export function concat(geos) {
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
export const disposeAll = (parts) => parts.forEach((p) => p.geo.dispose());

// All parts merged per material at rest pose (RTS/squad/thumbnail path): 2 geometries.
export function buildMergedDef(def, st) {
  const parts = def.build(st);
  const out = {};
  for (const mat of ['team', 'visor']) { const g = parts.filter((p) => p.mat === mat).map((p) => p.geo); if (g.length) out[mat] = concat(g); }
  disposeAll(parts);
  return out;
}
export const buildMerged = (st) => buildMergedDef(TROOPER, st);

// Posable unit (single view): merged per (bone, material) so idle animation is just group transforms.
export class Unit {
  constructor(look, def) {
    this.look = look; this.def = def; this.root = new THREE.Group(); this.root.name = def.id;
    this.bones = {};
    for (const k of Object.keys(def.pivot)) { const g = new THREE.Group(); g.name = k; this.bones[k] = g; }
    for (const [k, par] of Object.entries(def.parent)) {
      const p = def.pivot[k], pp = par ? def.pivot[par] : [0, 0, 0];
      this.bones[k].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      (par ? this.bones[par] : this.root).add(this.bones[k]);
    }
    this.meshes = []; this.tris = 0; this.st = null;
  }
  build(st) {
    for (const m of this.meshes) { m.parent.remove(m); m.geometry.dispose(); }
    this.meshes = []; this.tris = 0; this.st = st;
    const parts = this.def.build(st);
    for (const bone of Object.keys(this.def.pivot)) for (const mat of ['team', 'visor']) {
      const sel = parts.filter((p) => p.bone === bone && p.mat === mat);
      if (!sel.length) continue;
      const g = concat(sel.map((p) => p.geo)); const p = this.def.pivot[bone];
      g.translate(-p[0], -p[1], -p[2]); g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat === 'team' ? this.look.team : this.look.visor);
      mesh.name = bone + ':' + mat;
      this.bones[bone].add(mesh); this.meshes.push(mesh); this.tris += g.attributes.position.count / 3;
    }
    disposeAll(parts);
    this.sig = signatureOf(this.meshes.map((m) => m.geometry));
  }
  animate(t) { this.def.animate(this.bones, t, this.st); }
}
export const TROOPER = {
  id: 'trooper', fields: TROOPER_FIELDS, defaults: TROOPER_DEFAULT, pivot: PIVOT, parent: PARENT, build: buildParts,
  animate(B, t) {
    B.torso.scale.set(1 + 0.008 * Math.sin(t * 2.1), 1 + 0.012 * Math.sin(t * 2.1), 1);
    B.arms.rotation.x = 0.025 * Math.sin(t * 2.1 + 0.6);
    B.arms.rotation.y = 0.02 * Math.sin(t * 0.8);
    B.head.rotation.y = 0.18 * Math.sin(t * 0.45);
    B.head.rotation.x = 0.03 * Math.sin(t * 0.7);
  },
};
export function signatureOf(geos) {
  let tris = 0, s = 0;
  for (const g of geos) { const a = g.attributes.position.array; tris += a.length / 9; for (let i = 0; i < a.length; i += 3) s += a[i] * 1.3 + a[i + 1] * 2.1 + a[i + 2] * 3.7; }
  return tris + ':' + s.toFixed(4);
}
