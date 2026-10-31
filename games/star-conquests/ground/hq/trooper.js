// Trooper Customizer: model + look data. One low-poly space-era rifle trooper built from primitives.
// RTS budget: ~1,000 tris, 2 materials (team atlas + visor). Colors + flag symbol live in one small
// canvas atlas per team, so recoloring never adds materials or draw calls.
import * as THREE from '../../vendor/three.module.min.js';

// ---------- option data ----------
export const PRIMARY = ['#e8eef4', '#9aa4ae', '#2e343c', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#5b7a3a', '#1abc9c', '#2f80ed', '#6c4bd1', '#d35b9f'];
export const SECONDARY = ['#f4f6f8', '#c9a227', '#1b1f24', '#ff5a3c', '#ff9f1a', '#ffe14d', '#4cd964', '#00d4ff', '#3a5bff', '#a64dff', '#ff4fa0', '#8b5a2b'];
export const SUIT = ['#2a2f36', '#3d4434', '#5e5444', '#25304a', '#cfd4da'];
export const SKIN = ['#f1c9a5', '#d9a37a', '#a8714a', '#7a4b2e', '#4a2e1e'];
export const VISOR = ['#5ee8ff', '#ff4a4a', '#ffb43a', '#5dff7a', '#b779ff', '#f2f6ff'];
export const GLOW = [0, 0.6, 1.4];
export const GUNMETAL = '#3b4047', TRIM = '#e9edf1', GOLD = '#e3b341';
export const SYMBOLS = ['star', 'planet', 'comet', 'skull', 'wing', 'bolt', 'chevron', 'crescent', 'gear', 'atom', 'triangle', 'circle'];

// ----- data model -----
// Nation-level (edited once, shared by every unit of the nation): colors, suit tone, flag symbol, tech glow.
// Unit-level: shape / gear only. Field order = code order; never reorder, only append.
export const NATION_FIELDS = [['suit', 5], ['sym', 12], ['sc', 4], ['vis', 6], ['glow', 3]];
export const NATION_DEFAULT = Object.freeze({ p: '#2f80ed', s: '#ffe14d', suit: 0, sym: 0, sc: 0, vis: 0, glow: 1 });
// v4 trooper kit: armor (standard/heavy) + loadout (main weapon, sidearm, explosive, gadget) + cosmetics.
// 'award' is a retired slot kept only so old look digits / share codes still line up: always written as 0, never drawn.
export const TROOPER_FIELDS = [['helm', 5], ['armor', 2], ['pads', 3], ['weapon', 6], ['award', 2], ['side', 2], ['expl', 4], ['gadget', 7], ['extra', 3], ['banner', 2], ['skin', 5]];
export const TROOPER_DEFAULT = Object.freeze({ helm: 0, armor: 0, pads: 0, weapon: 0, award: 0, side: 0, expl: 0, gadget: 0, extra: 0, banner: 0, skin: 1 }); // = stats.js BASIC_GEAR (one default source)
// v2/v3 trooper layout (TC1/TC2 codes, v2/v3 saves) and its mapping into the v4 kit
export const TROOPER_FIELDS_V2 = [['helm', 5], ['armor', 3], ['pads', 3], ['pack', 4], ['rifle', 3], ['extra', 3], ['banner', 2], ['skin', 5]];
export const TROOPER_DEFAULT_V2 = Object.freeze({ helm: 0, armor: 1, pads: 1, pack: 3, rifle: 0, extra: 0, banner: 1, skin: 1 });
export function mapV2Trooper(o) {
  return {
    ...TROOPER_DEFAULT, helm: o.helm, pads: o.pads, extra: o.extra, banner: o.banner, skin: o.skin,
    armor: o.armor === 2 ? 1 : 0,          // light/medium -> Standard, heavy -> Heavy
    weapon: [0, 2, 3][o.rifle] ?? 0,       // carbine -> Rifle, laser -> Sniper rifle, bullpup -> Shotgun
    gadget: [0, 3, 6, 5][o.pack] ?? 0,     // none, jetpack -> Jetpack, radio -> Rally, ammo pack -> Health & ammo drop
  };
}
export function undigitsV2Trooper(str) { const o = undigits(str, TROOPER_FIELDS_V2, TROOPER_DEFAULT_V2); return o && mapV2Trooper(o); }
export const ROSTER_SIZE = 6;
const RT = (o) => Object.freeze({ ...TROOPER_DEFAULT, ...o });
export const DEFAULT_ROSTER = Object.freeze([
  { name: 'Trooper', icon: 'T', t: RT({ weapon: 0, expl: 0 }) },
  { name: 'Heavy', icon: 'H', t: RT({ helm: 1, armor: 1, pads: 2, weapon: 1, expl: 1, side: 1 }) },
  { name: 'Sniper', icon: 'S', t: RT({ helm: 4, pads: 0, weapon: 2, expl: 3, gadget: 2, extra: 2, banner: 0 }) },
  { name: 'Engineer', icon: 'E', t: RT({ helm: 3, weapon: 3, expl: 2, gadget: 4, banner: 0 }) },
  { name: 'Jet Trooper', icon: 'J', t: RT({ helm: 2, pads: 2, weapon: 5, gadget: 3, banner: 0 }) },
  { name: 'Commander', icon: 'C', t: RT({ helm: 2, pads: 2, weapon: 4, side: 1, gadget: 6, extra: 1 }) },
].map(Object.freeze));
export const defaultRoster = () => DEFAULT_ROSTER.map((r) => ({ name: r.name, icon: r.icon, t: { ...r.t } }));

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
  if ('award' in st) st.award = 0; // retired slot (old codes may say 1)
  return st;
}
export function sanitizeNation(o) {
  const n = sanitizeFields(o, NATION_FIELDS, NATION_DEFAULT);
  n.p = normHex(o && o.p, NATION_DEFAULT.p); n.s = normHex(o && o.s, NATION_DEFAULT.s);
  return n;
}
export const digits = (st, fields) => fields.map(([k]) => (k === 'award' ? 0 : st[k] | 0).toString(36)).join('').toUpperCase();
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
  const all = { ...NATION_DEFAULT, ...TROOPER_DEFAULT_V2, p: '#' + m[1].toLowerCase(), s: '#' + m[2].toLowerCase() };
  const rest = m[3].toLowerCase();
  if (rest.length > TC1_FIELDS.length) return null;
  for (let i = 0; i < rest.length; i++) { const [k, n] = TC1_FIELDS[i], v = parseInt(rest[i], 36); if (!(v >= 0 && v < n)) return null; all[k] = v; }
  return { nation: sanitizeNation(all), trooper: mapV2Trooper(sanitizeFields(all, TROOPER_FIELDS_V2, TROOPER_DEFAULT_V2)) };
}
// legacy encoders above/below take v2/v3 trooper objects (TROOPER_FIELDS_V2); kept for migration tests
// TC2 = player + nation + both unit looks; base64url(JSON), UTF-8 safe
const b64e = (str) => { const b = new TextEncoder().encode(str); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64d = (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0))); };
export function encodeTC2({ player, nationName, nation, trooper, tank, unit }, TANK_FIELDS) {
  return 'TC2:' + b64e(JSON.stringify({ pl: String(player || '').slice(0, 24), nn: String(nationName || '').slice(0, 24), n: nationCode(nation), t: digits(trooper, TROOPER_FIELDS_V2), k: digits(tank, TANK_FIELDS), u: unit === 'tank' ? 'k' : 't' }));
}
export function decodeTC2(code, TANK_FIELDS, TANK_DEFAULT) {
  const m = /^TC2:([A-Za-z0-9_-]+)$/.exec(String(code || '').replace(/\s+/g, ''));
  if (!m) return null;
  let o; try { o = JSON.parse(b64d(m[1])); } catch (e) { return null; }
  if (!o || typeof o !== 'object') return null;
  const nation = decodeNation(o.n); if (!nation) return null;
  const trooper = undigitsV2Trooper(o.t ?? ''), tank = undigits(o.k ?? '', TANK_FIELDS, TANK_DEFAULT);
  if (!trooper || !tank) return null;
  const clean = (x) => String(x ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);
  return { player: clean(o.pl), nationName: clean(o.nn), nation, trooper, tank, unit: o.u === 'k' ? 'tank' : 'trooper' };
}
// TC3 = player + nation + (6-slot roster | single trooper look) in the v4 kit + tank + active unit/slot
export function encodeTC3({ player, nationName, nation, roster, slot, trooper, tank, unit }, TANK_FIELDS) {
  const o = { pl: String(player || '').slice(0, 24), nn: String(nationName || '').slice(0, 24), n: nationCode(nation), k: digits(tank, TANK_FIELDS), u: unit === 'tank' ? 'k' : 't' };
  if (roster) { o.r = roster.map((r) => [String(r.name).slice(0, 16), r.icon, digits(r.t, TROOPER_FIELDS)]); o.sl = slot | 0; }
  else o.t = digits(trooper, TROOPER_FIELDS);
  return 'TC3:' + b64e(JSON.stringify(o));
}
export function decodeTC3(code, TANK_FIELDS, TANK_DEFAULT) {
  const m = /^TC3:([A-Za-z0-9_-]+)$/.exec(String(code || '').replace(/\s+/g, ''));
  if (!m) return null;
  let o; try { o = JSON.parse(b64d(m[1])); } catch (e) { return null; }
  if (!o || typeof o !== 'object') return null;
  const nation = decodeNation(o.n); if (!nation) return null;
  const tank = undigits(o.k ?? '', TANK_FIELDS, TANK_DEFAULT); if (!tank) return null;
  const clean = (x, n = 24) => String(x ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
  let roster = null, slot = 0, trooper;
  if (o.r !== undefined) {
    if (!Array.isArray(o.r) || o.r.length !== ROSTER_SIZE) return null;
    roster = [];
    for (let i = 0; i < ROSTER_SIZE; i++) {
      const r = o.r[i]; if (!Array.isArray(r)) return null;
      const t = undigits(r[2] ?? '', TROOPER_FIELDS, TROOPER_DEFAULT); if (!t) return null;
      roster.push({ name: clean(r[0], 16) || DEFAULT_ROSTER[i].name, icon: clean(r[1], 4) || DEFAULT_ROSTER[i].icon, t });
    }
    slot = Number.isInteger(o.sl) && o.sl >= 0 && o.sl < ROSTER_SIZE ? o.sl : 0;
    trooper = roster[slot].t;
  } else { trooper = undigits(o.t ?? '', TROOPER_FIELDS, TROOPER_DEFAULT); if (!trooper) return null; }
  return { player: clean(o.pl), nationName: clean(o.nn), nation, roster, slot, trooper, tank, unit: o.u === 'k' ? 'tank' : 'trooper' };
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
const AW = 176, AH = 64;
const REG = { P: 0, S: 1, K: 2, D: 3, G: 4, L: 5, A: 6 };
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
    const c = this.ctx, sw = [st.p, st.s, SKIN[st.skin], SUIT[st.suit], GUNMETAL, TRIM, GOLD];
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
  constructor() { this.parts = []; this.stack = [new THREE.Matrix4()]; this.bone = 'torso'; this.tag = ''; } // tag: which loadout item a part belongs to (item-only thumbnails)
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
    this.parts.push({ geo: g, mat: base === 'V' ? 'visor' : 'team', bone: this.bone, tag: this.tag });
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

// weapon grip transform (arms space = world rest pose)
const RIFLE_POS = [-0.085, 1.16, 0.25], RIFLE_PITCH = 0.18, RIFLE_YAW = 0.1;
//                rifle rocket sniper shotgun chaingun emp
const FOREGRIP = [0.25, 0.3, 0.33, 0.22, 0.2, 0.24];
const MUZZLE = [0.46, 0.6, 0.8, 0.5, 0.57, 0.47], TOPY = [0.07, 0.14, 0.11, 0.09, 0.1, 0.07], MUZZLE_R = [0.022, 0.07, 0.024, 0.03, 0.06, 0.09];

function buildWeapon(b, st) {
  const R = (x, y, z, w, h, d, reg, rx = 0) => b.add(box(w, h, d), reg, M(x, y, z, rx));
  const BAR = (z, r, len, reg, y = 0.02, n = 8, x = 0) => b.add(cyl(r, r, len, n), reg, M(x, y, z, HALF));
  const grip = () => R(0, -0.06, -0.005, 0.035, 0.08, 0.04, 'D', 0.3);
  switch (st.weapon) {
    case 0: // rifle rifle (v1 carbine)
      R(0, 0.01, 0.08, 0.055, 0.085, 0.32, 'G'); R(0, 0.06, 0.1, 0.057, 0.018, 0.2, 'S');
      BAR(0.34, 0.016, 0.2, 'G', 0.02, 6); BAR(0.45, 0.022, 0.04, 'D', 0.02, 6);
      R(0, -0.005, -0.15, 0.045, 0.075, 0.16, 'D'); grip(); R(0, -0.08, 0.13, 0.035, 0.11, 0.05, 'D', 0.2);
      R(0, 0.08, 0.03, 0.03, 0.03, 0.07, 'G'); R(0.029, 0.02, 0.18, 0.006, 0.015, 0.06, 'V');
      break;
    case 1: // rocket launcher (tube rides high on the arm)
      BAR(0.1, 0.065, 0.9, 'G', 0.07);
      for (const z of [-0.2, 0.38]) BAR(z, 0.071, 0.04, 'S', 0.07);
      b.add(cyl(0.065, 0.085, 0.08, 8), 'D', M(0, 0.07, -0.37, HALF));
      b.add(cyl(0.012, 0.055, 0.1, 8), 'S', M(0, 0.07, 0.6, HALF));
      R(0.075, 0.1, 0.06, 0.04, 0.05, 0.1, 'G'); R(0.097, 0.1, 0.06, 0.004, 0.03, 0.03, 'V');
      grip(); R(0, -0.02, 0.24, 0.035, 0.07, 0.04, 'D');
      break;
    case 2: // sniper rifle (v1 long laser rifle)
      R(0, 0.01, 0.06, 0.05, 0.08, 0.34, 'G'); R(0, 0, -0.2, 0.045, 0.09, 0.24, 'D');
      BAR(0.5, 0.016, 0.56, 'G', 0.02, 6); BAR(0.79, 0.024, 0.06, 'D', 0.02, 6);
      BAR(0.06, 0.026, 0.2, 'S', 0.085); BAR(0.165, 0.021, 0.012, 'V', 0.085);
      for (const sx of [1, -1]) b.add(box(0.012, 0.12, 0.012), 'G', M(0.02 * sx, -0.04, 0.45, 0.3, 0, 0.3 * sx));
      grip(); R(0, -0.07, 0.11, 0.032, 0.07, 0.05, 'D', 0.2);
      break;
    case 3: // shotgun (v1 bullpup slot)
      R(0, 0.01, 0.04, 0.065, 0.1, 0.26, 'G'); BAR(0.33, 0.028, 0.34, 'G', 0.03);
      BAR(0.3, 0.02, 0.28, 'D', -0.025, 6); R(0, -0.025, 0.22, 0.06, 0.05, 0.12, 'S');
      R(0, -0.005, -0.17, 0.05, 0.09, 0.2, 'D'); grip(); R(0.034, 0.03, 0.05, 0.006, 0.02, 0.1, 'V');
      break;
    case 4: // chaingun
      R(0, 0.01, 0.02, 0.1, 0.12, 0.24, 'G');
      for (let i = 0; i < 3; i++) { const a = i * 2.094; BAR(0.36, 0.016, 0.42, 'G', 0.02 + Math.sin(a) * 0.035, 6, Math.cos(a) * 0.035); }
      BAR(0.57, 0.06, 0.02, 'D', 0.02, 6); BAR(0.2, 0.06, 0.02, 'D', 0.02, 6);
      b.add(cyl(0.075, 0.075, 0.07, 8), 'S', M(0, -0.1, 0.05, 0, 0, HALF));
      R(0, 0.1, 0.0, 0.025, 0.04, 0.16, 'D'); grip(); R(0.052, 0.02, 0.06, 0.006, 0.02, 0.12, 'V');
      break;
    default: // EMP launcher
      R(0, 0.01, 0.04, 0.07, 0.1, 0.3, 'G'); BAR(0.3, 0.045, 0.24, 'G');
      for (const z of [0.24, 0.34]) BAR(z, 0.06, 0.025, 'V');
      b.add(cyl(0.09, 0.05, 0.05, 8), 'S', M(0, 0.02, 0.445, HALF)); BAR(0.472, 0.03, 0.012, 'V');
      R(0, -0.08, 0.1, 0.05, 0.08, 0.1, 'S'); R(0, 0, -0.16, 0.05, 0.08, 0.18, 'D'); grip();
  }
}

export function buildParts(st) {
  const b = new Builder();
  const heavy = st.armor === 1, W = 'L'; // trooper-white plates, nation-tinted trim
  // ----- legs -----
  b.bone = 'legs';
  for (const sx of [1, -1]) {
    const dz = sx > 0 ? 0.06 : -0.04; // relaxed stance: left foot forward
    const hip = [0.105 * sx, 0.9, 0], knee = [0.125 * sx, 0.5, 0.03 + dz * 0.6], ank = [0.13 * sx, 0.11, dz];
    b.seg(hip, knee, heavy ? 0.18 : 0.165, 0.18, 'D');
    b.seg(knee, ank, heavy ? 0.15 : 0.14, 0.155, 'D');
    b.add(box(heavy ? 0.18 : 0.16, 0.1, 0.27), 'G', M(0.13 * sx, 0.05, dz + 0.035));
    b.add(box(0.12, 0.09, 0.05), 'S', M(0.125 * sx, 0.5, 0.115 + dz * 0.6, -0.1));
    b.add(box(heavy ? 0.19 : 0.16, heavy ? 0.22 : 0.16, 0.045), W, M(0.115 * sx, 0.72, 0.1 + dz * 0.3, 0.05 - dz));
    b.add(box(heavy ? 0.16 : 0.13, heavy ? 0.26 : 0.2, 0.045), W, M(0.128 * sx, 0.3, 0.09 + dz * 0.8, 0.04));
  }
  b.add(box(0.34, 0.2, 0.21), 'D', M(0, 0.9, 0));
  if (heavy) b.add(box(0.34, 0.13, 0.045), W, M(0, 0.86, 0.12, -0.15));
  // sidearm in a holster on the right thigh
  b.tag = 'side';
  b.add(box(0.05, st.side ? 0.17 : 0.13, st.side ? 0.09 : 0.08), 'D', M(-0.215, 0.76, 0.0));
  b.add(box(0.035, 0.07, 0.05), st.side ? 'S' : 'G', M(-0.215, 0.87, -0.02, 0.3));
  if (st.side) b.add(box(0.012, 0.02, 0.02), 'V', M(-0.215, 0.91, -0.005));
  b.tag = '';
  // ----- torso -----
  b.bone = 'torso';
  b.add(box(0.37, 0.06, 0.23), 'S', M(0, 1.0, 0));
  b.add(box(0.36, 0.4, 0.21), 'D', M(0, 1.21, 0));
  b.add(cyl(0.055, 0.065, 0.1, 6), 'D', M(0, 1.44, 0));
  let bz;
  if (!heavy) { // Standard
    b.add(box(0.38, 0.26, 0.08), W, M(0, 1.28, 0.11));
    b.add(box(0.3, 0.1, 0.05), W, M(0, 1.1, 0.11));
    b.add(box(0.36, 0.28, 0.06), W, M(0, 1.27, -0.115));
    b.add(box(0.05, 0.27, 0.01), 'P', M(0.1, 1.28, 0.152));
    bz = -0.145;
  } else { // Heavy: bulkier plates + side armor
    b.add(box(0.46, 0.34, 0.14), W, M(0, 1.26, 0.1));
    b.add(box(0.36, 0.12, 0.08), W, M(0, 1.07, 0.11));
    b.add(box(0.44, 0.34, 0.09), W, M(0, 1.26, -0.115));
    b.add(box(0.3, 0.06, 0.25), 'S', M(0, 1.43, 0));
    b.add(box(0.12, 0.045, 0.01), 'P', M(0.1, 1.34, 0.172));
    b.add(box(0.12, 0.045, 0.01), 'P', M(0.1, 1.27, 0.172));
    for (const sx of [1, -1]) b.add(box(0.05, 0.22, 0.2), 'P', M(0.235 * sx, 1.21, 0));
    bz = -0.16;
  }
  // shoulder pads (nation colored)
  const pk = heavy ? 1.18 : 1;
  for (const sx of [1, -1]) {
    if (st.pads === 1) {
      b.add(sph(0.12 * pk, 7, 4), 'P', M(0.265 * sx * pk, 1.4, 0, 0, 0, 0, 0.85, 0.55, 1));
      b.add(cyl(0.06, 0.06, 0.012, 6), 'S', M(0.265 * sx * pk, 1.462 + (pk - 1) * 0.07, 0, 0, 0, 0, 1, 1, 1.2));
    } else if (st.pads === 2) {
      b.add(box(0.17 * pk, 0.06, 0.21 * pk), 'P', M(0.27 * sx * pk, 1.41, 0, 0, 0, -0.35 * sx));
      b.add(box(0.15 * pk, 0.04, 0.19 * pk), 'S', M(0.32 * sx * pk, 1.35, 0, 0, 0, -0.65 * sx));
    }
  }
  // explosive on the belt
  b.tag = 'expl';
  if (st.expl === 0) { // thermal detonator
    b.add(sph(0.048, 6, 4), 'S', M(0.15, 0.965, 0.125));
    b.add(box(0.02, 0.012, 0.012), 'V', M(0.15, 0.985, 0.155));
  } else if (st.expl === 1) { // two mines clipped to the left hip
    for (const z of [0.07, -0.07]) {
      b.add(cyl(0.06, 0.06, 0.025, 6), 'D', M(0.205, 0.95, z, 0, 0, HALF));
      b.add(box(0.008, 0.025, 0.025), 'V', M(0.22, 0.95, z));
    }
  } else if (st.expl === 2) { // detpacks on the front of the belt
    for (const sx of [1, -1]) {
      b.add(box(0.07, 0.06, 0.035), 'L', M(0.075 * sx, 0.99, 0.13));
      b.add(box(0.015, 0.015, 0.008), 'V', M(0.075 * sx, 1.0, 0.15));
    }
  } else { // time bombs on the left hip
    for (const z of [0.035, -0.045]) {
      b.add(cyl(0.028, 0.028, 0.11, 6), 'D', M(0.2, 0.97, z));
      b.add(box(0.008, 0.02, 0.025), 'V', M(0.228, 0.99, z));
    }
  }
  // gadget / special (back slot)
  b.tag = 'gadget';
  let pd = 0, antenna = null;
  const g = st.gadget;
  if (g === 1) { // deployable auto turret, folded
    b.add(box(0.24, 0.16, 0.12), 'G', M(0, 1.22, bz - 0.06));
    b.add(sph(0.08, 6, 4), 'P', M(0, 1.31, bz - 0.06, 0, 0, 0, 1, 0.7, 1));
    b.add(cyl(0.015, 0.015, 0.2, 6), 'D', M(0.03, 1.42, bz - 0.06));
    b.add(box(0.02, 0.02, 0.02), 'V', M(0, 1.33, bz - 0.135));
    for (const sx of [1, -1]) b.add(box(0.03, 0.24, 0.03), 'D', M(0.135 * sx, 1.18, bz - 0.06, 0, 0, 0.12 * sx));
    pd = 0.13;
  } else if (g === 2) { // remote recon bot hovering over the left shoulder + dock
    b.add(box(0.14, 0.1, 0.06), 'G', M(0, 1.25, bz - 0.03));
    b.add(sph(0.07, 8, 5), W, M(0.33, 1.68, -0.12));
    b.add(cyl(0.026, 0.026, 0.02, 8), 'V', M(0.33, 1.68, -0.05, HALF));
    b.add(box(0.2, 0.012, 0.04), 'P', M(0.33, 1.68, -0.13));
    pd = 0.06;
  } else if (g === 3) { // jetpack
    for (const sx of [1, -1]) {
      b.add(cyl(0.06, 0.06, 0.3, 6), 'P', M(0.08 * sx, 1.22, bz - 0.07));
      b.add(box(0.07, 0.03, 0.07), 'S', M(0.08 * sx, 1.385, bz - 0.07));
      b.add(cyl(0.05, 0.035, 0.07, 6), 'G', M(0.08 * sx, 1.035, bz - 0.07));
      b.add(box(0.05, 0.012, 0.05), 'V', M(0.08 * sx, 0.997, bz - 0.07));
    }
    b.add(box(0.1, 0.24, 0.08), 'S', M(0, 1.24, bz - 0.04));
    pd = 0.14;
  } else if (g === 4) { // fusion cutter: fuel cell + cutter tool
    b.add(cyl(0.045, 0.045, 0.24, 8), 'S', M(0.07, 1.24, bz - 0.045));
    b.push(M(-0.07, 1.2, bz - 0.04, 0, 0, 0.5));
    b.add(cyl(0.02, 0.02, 0.22, 6), 'G');
    b.add(cyl(0.012, 0.026, 0.05, 6), 'V', M(0, 0.135, 0));
    b.pop();
    pd = 0.09;
  } else if (g === 5) { // health & ammo drop crate
    b.add(box(0.28, 0.22, 0.13), W, M(0, 1.22, bz - 0.065));
    b.add(box(0.12, 0.035, 0.01), 'S', M(0, 1.24, bz - 0.132));
    b.add(box(0.035, 0.12, 0.01), 'S', M(0, 1.24, bz - 0.132));
    b.add(box(0.29, 0.03, 0.135), 'G', M(0, 1.13, bz - 0.065));
    pd = 0.13;
  } else if (g === 6) { // rally: command radio + tall antenna beacon
    b.add(box(0.26, 0.3, 0.11), 'D', M(0, 1.21, bz - 0.055));
    b.add(box(0.18, 0.1, 0.012), 'S', M(0, 1.25, bz - 0.112));
    antenna = [0.09, bz - 0.08];
    b.add(cyl(0.006, 0.01, 0.64, 4), 'G', M(antenna[0], 1.66, antenna[1]));
    if (!st.banner) b.add(box(0.03, 0.03, 0.03), 'V', M(antenna[0], 1.99, antenna[1]));
    pd = 0.11;
  }
  b.tag = '';
  const backZ = bz - pd;
  if (st.banner) {
    let px = 0.1, pz = backZ - 0.02; const top = 1.97;
    if (antenna) { px = antenna[0]; pz = antenna[1]; }
    else { b.add(cyl(0.008, 0.008, 0.82, 4), 'G', M(px, 1.56, pz)); b.add(cyl(0.02, 0.02, 0.03, 6), 'S', M(px, 1.16, pz)); }
    b.add(box(0.22, 0.15, 0.006), { flag: [4, 5], base: 'S' }, M(px - 0.115, top - 0.09, pz));
    b.add(box(0.026, 0.026, 0.026), 'S', M(px, top + 0.005, pz));
  }
  if (st.extra === 1) { // cape
    b.push(M(0, 1.41, Math.min(backZ, bz) - 0.02, 0.12));
    b.add(box(0.36, 0.74, 0.02), 'P', M(0, -0.37, 0));
    b.add(box(0.37, 0.05, 0.026), 'S', M(0, -0.72, 0));
    b.pop();
    b.add(box(0.4, 0.04, 0.05), 'S', M(0, 1.42, bz + 0.02));
  } else if (st.extra === 2) { // scarf
    b.add(new THREE.TorusGeometry(0.095, 0.035, 3, 8), 'S', M(0, 1.42, 0, HALF));
    b.add(box(0.075, 0.24, 0.02), 'S', M(-0.07, 1.3, bz - 0.005, 0.1, 0, -0.15));
  }
  // ----- head (trooper-white shells, nation stripe) -----
  b.bone = 'head';
  const H = [0, 1.6, 0.01];
  const dome = (sy = 1.05) => b.add(sph(0.145, 10, 7), W, M(H[0], H[1], H[2], 0, 0, 0, 1, sy, 1.08));
  const stripe = (sy = 1.05) => b.add(sph(0.149, 3, 3, HALF - 0.16, 0.32, 0.05, 1.05), 'P', M(H[0], H[1], H[2], 0, 0, 0, 1, sy, 1.08));
  const band = (t0, tl) => b.add(sph(0.149, 8, 2, HALF - 1.0, 2.0, t0, tl), 'V', M(H[0], H[1], H[2], 0, 0, 0, 1, 1.05, 1.08));
  if (st.helm === 0) { // dome visor
    dome(); stripe(); band(1.2, 0.55);
    b.add(box(0.15, 0.06, 0.08), 'S', M(0, 1.49, 0.1));
    for (const sx of [1, -1]) b.add(cyl(0.04, 0.04, 0.03, 8), 'P', M(0.148 * sx, 1.58, 0, 0, 0, HALF));
  } else if (st.helm === 1) { // angular
    b.add(cyl(0.12, 0.155, 0.2, 6), W, M(0, 1.59, 0, 0, Math.PI / 6));
    b.add(cyl(0.07, 0.12, 0.06, 6), 'P', M(0, 1.72, 0, 0, Math.PI / 6));
    b.add(box(0.22, 0.03, 0.05), 'S', M(0, 1.665, 0.12));
    b.add(box(0.17, 0.035, 0.02), 'V', M(0, 1.625, 0.128));
    b.add(box(0.035, 0.08, 0.02), 'V', M(0, 1.575, 0.128));
    b.add(box(0.14, 0.05, 0.07), 'D', M(0, 1.49, 0.09));
    for (const sx of [1, -1]) b.add(box(0.02, 0.11, 0.1), 'P', M(0.13 * sx, 1.55, 0.05, 0, 0.5 * sx));
  } else if (st.helm === 2) { // crested
    dome(1.0); band(1.35, 0.3);
    b.add(box(0.03, 0.1, 0.3), 'P', M(0, 1.75, -0.02, 0.15));
    b.add(box(0.02, 0.07, 0.12), 'S', M(0, 1.71, -0.17, 0.6));
    for (const sx of [1, -1]) b.add(box(0.03, 0.12, 0.1), 'P', M(0.135 * sx, 1.52, 0.06, 0, 0.35 * sx));
  } else if (st.helm === 3) { // open face + goggles
    b.add(sph(0.12, 8, 6), 'K', M(0, 1.585, 0.015, 0, 0, 0, 0.95, 1.12, 1));
    b.add(sph(0.142, 10, 4, 0, Math.PI * 2, 0, HALF), W, M(0, 1.6, 0.0, -0.12, 0, 0, 1, 1.0, 1.07));
    b.add(cyl(0.143, 0.143, 0.025, 10), 'P', M(0, 1.6, 0.0, -0.12, 0, 0, 1, 1, 1.07));
    for (const sx of [1, -1]) b.add(cyl(0.034, 0.034, 0.03, 8), 'V', M(0.045 * sx, 1.635, 0.123, HALF));
    b.add(box(0.03, 0.015, 0.02), 'G', M(0, 1.637, 0.128));
    b.add(box(0.08, 0.04, 0.04), 'G', M(0, 1.505, 0.115));
  } else { // recon mono-eye
    dome(1.0); stripe(1.0);
    b.add(box(0.19, 0.1, 0.05), 'D', M(0, 1.565, 0.12));
    b.add(cyl(0.05, 0.05, 0.04, 8), 'S', M(0.045, 1.6, 0.15, HALF));
    b.add(cyl(0.036, 0.036, 0.02, 8), 'V', M(0.045, 1.6, 0.172, HALF));
    b.add(box(0.04, 0.1, 0.07), 'P', M(-0.15, 1.6, 0));
    b.add(cyl(0.006, 0.008, 0.3, 4), 'G', M(-0.155, 1.78, -0.02));
  }
  // ----- arms + main weapon -----
  b.bone = 'arms';
  const R = M(...RIFLE_POS).multiply(M(0, 0, 0, RIFLE_PITCH, RIFLE_YAW, 0));
  const fz = FOREGRIP[st.weapon] ?? 0.25;
  const gripW = new THREE.Vector3(0, -0.035, 0).applyMatrix4(R).toArray();
  const foreW = new THREE.Vector3(0, st.weapon === 1 ? 0.0 : -0.03, fz).applyMatrix4(R).toArray();
  b.push(R); b.tag = 'weapon'; buildWeapon(b, st); b.tag = ''; b.pop();
  const arm = (sx, hand, elbow) => {
    const sh = [0.225 * sx, 1.37, 0];
    const up = b.seg(sh, elbow, heavy ? 0.115 : 0.1, 0.11, 'D');
    const fo = b.seg(elbow, hand, heavy ? 0.1 : 0.09, 0.1, 'D');
    b.add(box(0.075, 0.075, 0.08), 'G', M(...hand));
    b.add(box(heavy ? 0.125 : 0.105, fo.len * 0.45, heavy ? 0.13 : 0.115), W, fo.m.clone().multiply(M(0, fo.len * 0.12, 0)));
    return up;
  };
  arm(-1, gripW, [-0.285, 1.13, 0.03]);
  const upL = arm(1, foreW, [0.255, 1.12, 0.1]);
  b.add(box(0.006, 0.08, 0.08), { flag: [0], base: 'S' }, upL.m.clone().multiply(M(heavy ? 0.06 : 0.053, -upL.len * 0.12, 0, Math.PI)));
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
export function buildMergedDef(def, st, only = null) {
  const all = def.build(st), parts = only ? all.filter((p) => p.tag === only) : all;
  if (only) disposeAll(all.filter((p) => p.tag !== only));
  const out = {};
  for (const mat of ['team', 'visor']) { const g = parts.filter((p) => p.mat === mat).map((p) => p.geo); if (g.length) out[mat] = concat(g); }
  disposeAll(parts);
  return out;
}
export const buildMerged = (st) => buildMergedDef(TROOPER, st);
// v2.5 (Conquest): split one build into [parts matching pred, the rest], each merged per material
// (troopers: the weapon apart so it can drop when taken out · tanks: the turret apart so it can aim)
export function buildSplitDef(def, st, pred) {
  const all = def.build(st), out = [{}, {}];
  [all.filter(pred), all.filter((p) => !pred(p))].forEach((set, i) => { for (const mat of ['team', 'visor']) { const g = set.filter((p) => p.mat === mat).map((p) => p.geo); if (g.length) out[i][mat] = concat(g); } });
  disposeAll(all);
  return out;
}

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
