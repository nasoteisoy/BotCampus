// Low-poly models built from primitives. Parts are merged per material "role" and cached per type,
// so every unit is only a handful of draw calls; materials are per unit (damage tint) and team-colored.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TEAM = {
  blue: { main: 0x3d7ee6, trim: 0x1f4f9c, ring: 0x59f0ff, css: '#4aa3ff' },
  red: { main: 0xd9483a, trim: 0x8c2a20, ring: 0xff4d4d, css: '#ff5a4a' },
};
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, flatShading: true, ...o });
export const SHARED = {
  dark: std(0x34373b, { roughness: .9 }), metal: std(0x5b6066, { roughness: .6, metalness: .4 }), wood: std(0x7a5a3a, { roughness: 1 }),
  canvas: std(0x8f8a6a), concrete: std(0xa9a59b, { roughness: .9 }), concreteDark: std(0x77736b, { roughness: .9 }), roof: std(0x5d6168),
  glass: std(0x9fc6dc, { roughness: .2, metalness: .3 }), skin: std(0xe0b48c), olive: std(0x5d6b3e), crate: std(0x8b6a3e), sand: std(0xa89466, { roughness: 1 }),
  white: std(0xeeeeea), red: std(0xc8322a), asphalt: std(0x4c4f52, { roughness: 1 }), yellow: std(0xe8c442),
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function prep(geo, x, y, z, rx, ry, rz, sx, sy, sz) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  return g.applyMatrix4(_m);
}
// Kit: role -> list of transformed geometries; .geos() merges them
class Kit {
  constructor() { this.parts = {}; }
  add(role, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { (this.parts[role] ||= []).push(prep(geo, x, y, z, rx, ry, rz, sx, sy, sz)); return this; }
  geos() { const o = {}; for (const r in this.parts) o[r] = mergeGeometries(this.parts[r]); return o; }
}
function meshes(geos, mats, parent) {
  for (const r in geos) { const me = new THREE.Mesh(geos[r], mats[r] || SHARED[r]); me.castShadow = me.receiveShadow = true; parent.add(me); }
  return parent;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n);
const S = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);

// ---------------- vehicles ----------------
const geoCache = {};
// Each tank type has its own silhouette, not just its own size:
//  light  = wheeled recon tank: low narrow hull on 3 big wheels a side, small round turret, short thin gun, whip antenna
//  medium = classic tank: tracks, sloped glacis, rounded (domed) turret, medium gun with a muzzle brake
//  heavy  = boxy and wide: wide tracks behind side skirts, big square turret with add-on plates, very long thick gun
function tankGeos(type) {
  const body = new Kit(), tur = new Kit(), bar = new Kit();
  if (type === 'light') {
    body.add('main', B(2.0, .55, 3.7), 0, .95, 0);
    body.add('main', B(2.0, .45, 1.0), 0, .86, 2.1, .65);                     // sloped nose
    body.add('main', B(2.0, .4, .8), 0, .9, -2.05, -.55);                     // sloped tail
    body.add('trim', B(2.25, .09, 3.4), 0, 1.24, .05);                         // fender line
    for (const k of [-1, 1]) for (const z of [-1.35, 0, 1.35]) {
      body.add('dark', C(.56, .56, .36, 12), k * 1.1, .56, z, 0, 0, Math.PI / 2);
      body.add('metal', C(.24, .24, .4, 8), k * 1.12, .56, z, 0, 0, Math.PI / 2);
    }
    body.add('dark', B(.55, .25, .5), .55, 1.34, -1.45);                      // stowage box
    body.add('metal', C(.12, .12, .25, 6), -.7, 1.3, 2.05);                    // headlight
    tur.add('main', C(.6, .74, .46, 10), 0, .23, 0);
    tur.add('trim', C(.28, .3, .14, 8), -.22, .53, -.18);
    tur.add('dark', C(.022, .022, 2.6, 4), .42, 1.5, -.42);                    // whip antenna
    bar.add('metal', C(.065, .075, 1.45, 6), 0, 0, .72, Math.PI / 2);
    return { s: .95, bl: 1.45, body: body.geos(), tur: tur.geos(), bar: bar.geos(), turY: 1.22, barY: .25, barZ: .55 };
  }
  if (type === 'medium') {
    for (const k of [-1, 1]) {
      body.add('dark', B(.8, .9, 4.8), k * 1.45, .47, 0);
      body.add('trim', B(.92, .1, 4.9), k * 1.45, .96, 0);
      for (let i = 0; i < 5; i++) body.add('metal', C(.36, .36, .14, 10), k * 1.88, .45, -1.72 + i * .86, 0, 0, Math.PI / 2);
    }
    body.add('main', B(2.2, .62, 3.9), 0, .98, -.2);
    body.add('main', B(2.2, .12, 1.5), 0, 1.02, 2.25, .62);                    // sloped glacis
    body.add('trim', B(1.7, .14, 1.0), 0, 1.36, -1.55);                        // engine deck
    tur.add('main', C(.95, 1.08, .55, 12), 0, .28, 0);
    tur.add('main', S(.97, 12, 6), 0, .5, -.05, 0, 0, 0, 1, .42, 1.05);        // rounded dome
    tur.add('trim', B(.7, .48, .4), 0, .36, .98);                               // mantlet
    tur.add('trim', C(.28, .3, .16, 8), .38, .9, -.3);                          // cupola
    tur.add('dark', C(.022, .022, 1.7, 4), -.6, 1.4, -.75);
    bar.add('metal', C(.11, .13, 2.7, 8), 0, 0, 1.35, Math.PI / 2);
    bar.add('dark', B(.42, .24, .32), 0, 0, 2.75);                              // muzzle brake
    return { s: 1, bl: 2.75, body: body.geos(), tur: tur.geos(), bar: bar.geos(), turY: 1.3, barY: .36, barZ: .95 };
  }
  // heavy
  for (const k of [-1, 1]) {
    body.add('dark', B(1.2, 1.0, 5.5), k * 1.75, .5, 0);                       // wide tracks
    body.add('trim', B(.14, .72, 5.3), k * 2.42, .86, 0);                       // side skirts
    for (const z of [-1.8, 0, 1.8]) body.add('trim', B(.18, .62, 1.6), k * 2.5, .86, z);   // skirt plates
  }
  body.add('main', B(3.1, 1.0, 5.0), 0, 1.15, 0);                               // boxy hull
  body.add('main', B(3.1, .9, .22), 0, 1.1, 2.56);                              // flat front plate
  body.add('dark', B(2.2, .1, 1.3), 0, 1.7, -1.75);                             // engine grille
  body.add('trim', B(3.2, .14, .3), 0, 1.66, 2.35);
  tur.add('main', B(2.5, 1.0, 2.7), 0, .5, -.1);                                // big square turret
  for (const k of [-1, 1]) tur.add('trim', B(.16, .8, 2.3), k * 1.33, .48, 0);  // add-on plates
  tur.add('main', B(2.1, .75, 1.0), 0, .42, -1.8);                              // bustle
  tur.add('trim', B(1.0, .7, .45), 0, .48, 1.32);                               // mantlet
  tur.add('trim', C(.36, .38, .2, 8), .55, 1.1, -.5);
  bar.add('metal', C(.19, .21, 4.3, 8), 0, 0, 2.15, Math.PI / 2);
  bar.add('trim', C(.3, .3, .9, 8), 0, 0, .45, Math.PI / 2);                    // thick sleeve
  bar.add('dark', C(.27, .27, .55, 8), 0, 0, 4.25, Math.PI / 2);                // muzzle
  return { s: 1.08, bl: 4.5, body: body.geos(), tur: tur.geos(), bar: bar.geos(), turY: 1.65, barY: .5, barZ: 1.45 };
}
// jeep: open-top 4x4 with windshield, spare wheel, driver, and a pintle MG
function jeepGeos() {
  const k = new Kit(), t = new Kit(), b = new Kit();
  k.add('main', B(1.8, .55, 3.4), 0, .88, 0); k.add('main', B(1.6, .32, 1.1), 0, 1.28, 1.1);
  for (const x of [-1, 1]) k.add('trim', B(.32, .1, 3.5), x * .98, 1.2, 0);
  k.add('dark', B(1.7, .7, .07), 0, 1.6, .45, -.18); k.add('glass', B(1.45, .48, .05), 0, 1.6, .47, -.18);
  for (const x of [-1, 1]) for (const z of [-1.15, 1.2]) { k.add('dark', C(.48, .48, .34, 12), x * 1.0, .48, z, 0, 0, Math.PI / 2); k.add('metal', C(.2, .2, .38, 6), x * 1.02, .48, z, 0, 0, Math.PI / 2); }
  k.add('dark', C(.42, .42, .22, 12), 0, 1.05, -1.85, Math.PI / 2);             // spare wheel
  k.add('trim', B(.5, .5, .35), -.42, 1.4, -.15); k.add('skin', S(.18, 6, 4), -.42, 1.82, -.15); k.add('olive', S(.22, 6, 3), -.42, 1.88, -.15, 0, 0, 0, 1, .6, 1);   // driver
  t.add('metal', C(.06, .06, 1, 4), 0, .5, 0); t.add('dark', B(.25, .25, .5), 0, 1.05, .15);
  b.add('dark', C(.05, .05, .8, 4), 0, 0, .4, Math.PI / 2);
  return { s: 1, bl: .8, body: k.geos(), tur: t.geos(), bar: b.geos(), turY: 1.1, turZ: -.75 };
}
function crewMan(k, x, z, kneel = true) {
  k.add('trim', B(.45, kneel ? .5 : .8, .35), x, kneel ? .25 : .4, z); k.add('main', B(.55, .65, .35), x, kneel ? .8 : 1.15, z);
  k.add('skin', S(.19, 6, 4), x, kneel ? 1.3 : 1.65, z); k.add('olive', S(.23, 6, 3), x, kneel ? 1.36 : 1.72, z, 0, 0, 0, 1, .6, 1);
}
function gunGeos(type) {
  const k = new Kit(), t = new Kit(), b = new Kit();
  if (type === 'atgun') {
    for (const x of [-1, 1]) { k.add('dark', C(.55, .55, .25, 10), x * 1.05, .55, 0, 0, 0, Math.PI / 2); k.add('trim', B(.18, .18, 2.8), x * .5, .3, -1.5, 0, x * .25); }
    t.add('main', B(2.1, 1.2, .12), 0, 1.05, .35, -.1); t.add('trim', B(.6, .45, .9), 0, .75, 0);
    b.add('metal', C(.09, .11, 3.2, 8), 0, 0, 1.6, Math.PI / 2); b.add('dark', B(.36, .2, .32), 0, 0, 3.25);   // long thin barrel + muzzle brake
    t.add('main', B(2.1, .35, .12), 0, 1.78, .25, -.55);                          // angled shield top
    crewMan(k, -.9, -1.3); crewMan(k, .9, -1.6);
    return { s: 1, bl: 3.2, body: k.geos(), tur: t.geos(), bar: b.geos(), turY: 0, barY: .8, barZ: .3 };
  }
  if (type === 'howitzer') {
    for (const x of [-1, 1]) { k.add('dark', C(.75, .75, .3, 12), x * 1.3, .75, 0, 0, 0, Math.PI / 2); k.add('trim', B(.25, .25, 3.6), x * .6, .35, -1.9, 0, x * .22); }
    t.add('main', B(1.6, .8, 1.6), 0, 1.0, 0); t.add('main', B(2.4, 1.3, .12), 0, 1.4, .8);
    b.add('metal', C(.16, .2, 4.4, 8), 0, 0, 2.0, Math.PI / 2); b.add('dark', C(.25, .25, .5, 8), 0, 0, 4.2, Math.PI / 2);
    b.add('metal', C(.1, .1, 2.4, 6), 0, .3, 1.2, Math.PI / 2);                   // recuperator above the barrel
    for (const x of [-1, 1]) k.add('dark', B(.8, .55, .12), x * 1.4, .28, -3.55, -.3, x * .22);   // trail spades
    crewMan(k, -1.3, -2.2); crewMan(k, 1.2, -2.6); crewMan(k, 0, -3.1, false);
    return { s: 1, bl: 4.4, body: k.geos(), tur: t.geos(), bar: b.geos(), turY: 0, barY: 1.3, barZ: .2 };
  }
  // aa gun: platform on outriggers with twin barrels
  k.add('trim', B(2.4, .35, 2.4), 0, .45, 0); k.add('dark', B(4.2, .15, .3), 0, .3, 0); k.add('dark', B(.3, .15, 4.2), 0, .3, 0);
  for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) k.add('dark', C(.3, .3, .1, 6), x, .2, z);
  t.add('main', C(.9, 1.0, .5, 8), 0, .9, 0); t.add('main', B(.3, 1.0, .9), .7, 1.4, 0); t.add('main', B(.3, 1.0, .9), -.7, 1.4, 0);
  for (const x of [-.25, .25]) { b.add('metal', C(.06, .07, 3.0, 6), x, 0, 1.5, Math.PI / 2); b.add('dark', C(.11, .09, .35, 6), x, 0, 3.0, Math.PI / 2); }   // twin barrels + flash hiders
  t.add('dark', C(.6, .6, .05, 12), 0, 2.15, .2, Math.PI / 2 - .3);            // ring sight
  b.add('dark', B(.7, .5, .7), 0, 0, 0);
  crewMan(k, 1.5, -1.4); crewMan(k, -1.5, -1.4);
  return { s: 1, bl: 3.1, body: k.geos(), tur: t.geos(), bar: b.geos(), turY: 0, barY: 1.5, barZ: 0, aa: true };
}
function planeGeos(type) {
  const k = new Kit(), p = new Kit();
  if (type === 'bomber') {
    k.add('main', C(.9, .6, 9, 10), 0, 0, 0, Math.PI / 2); k.add('glass', S(.9, 8, 6), 0, 0, 4.4, 0, 0, 0, 1, 1, 1.3);
    k.add('main', B(14, .25, 2.4), 0, .1, .6); k.add('trim', B(5, .2, 1.4), 0, .2, -4.1); k.add('trim', B(.2, 2, 1.5), 0, 1, -4.2);
    for (const x of [-3.2, 3.2]) { k.add('trim', C(.45, .45, 2.4, 8), x, -.1, 1.3, Math.PI / 2); p.add('dark', B(.15, 2.6, .1), x, -.1, 2.6); }
    k.add('glass', S(.45, 6, 4), 0, .75, 1.8);
  } else {
    const L = type === 'reconplane' ? 5.6 : 6.4, W = type === 'reconplane' ? 9 : 8;
    k.add('main', C(.55, .35, L, 8), 0, 0, 0, Math.PI / 2); k.add('dark', C(.55, .55, .5, 8), 0, 0, L / 2, Math.PI / 2);
    k.add('main', B(W, .18, 1.6), 0, type === 'reconplane' ? .55 : -.15, .5); k.add('trim', B(3, .15, 1), 0, .1, -L / 2 + .4); k.add('trim', B(.15, 1.3, 1.1), 0, .65, -L / 2 + .4);
    k.add('glass', S(.42, 6, 4), 0, .45, .7, 0, 0, 0, 1, .8, 1.6);
    if (type === 'fbomber') for (const x of [-2.2, 2.2]) k.add('dark', C(.18, .18, 1.6, 6), x, -.45, .6, Math.PI / 2);
    if (type === 'fighter') for (const x of [-1.8, 1.8]) k.add('trim', B(1.2, .1, .5), x, -.1, 1.3);
    p.add('dark', B(.15, 2.4, .08), 0, 0, L / 2 + .3);
  }
  return { body: k.geos(), prop: p.geos() };
}
function selRing(r, color) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + .3, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, depthWrite: false, toneMapped: false }));
  ring.position.y = .08; ring.visible = false; ring.renderOrder = 1; return ring;
}
// Front Line Defense towers: sandbags / concrete base with a turret. Same {body,tur,bar} layout as vehicles.
function towerGeos(type) {
  const k = new Kit(), t = new Kit(), b = new Kit();
  const bags = (r, n, y = .35) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; k.add('sand', B(1.3, .6, .8), Math.sin(a) * r, y, Math.cos(a) * r, 0, a); } };
  if (type === 'mgnest') {
    bags(2.1, 10); bags(2.1, 10, .9); k.add('dark', C(1.6, 1.6, .2, 10), 0, .12, 0);
    t.add('trim', B(.9, .5, 1.2), 0, 0, 0); t.add('main', B(1.4, .6, .14), 0, .35, .7); crewMan(t, -.5, -.9); crewMan(t, .5, -.9);
    b.add('metal', C(.07, .08, 1.9, 6), 0, 0, .95, Math.PI / 2); b.add('dark', B(.25, .3, .5), 0, -.25, .2);
    return { s: 1, bl: 1.9, body: k.geos(), tur: t.geos(), bar: b.geos(), turY: 1.1, barY: .2, barZ: .4 };
  }
  if (type === 'atbunker') {
    k.add('concrete', B(4.4, 1.7, 4.4), 0, .85, 0); k.add('concreteDark', B(4.8, .3, 4.8), 0, 1.75, 0); k.add('dark', B(3, .35, .1), 0, 1.1, 2.21);
    t.add('main', B(2.2, 1.1, 2.2), 0, .55, 0); t.add('trim', B(2.4, .2, 2.4), 0, 1.15, 0);
    b.add('metal', C(.12, .15, 3.4, 8), 0, 0, 1.7, Math.PI / 2); b.add('dark', B(.42, .26, .4), 0, 0, 3.4);
    return { s: 1, bl: 3.4, body: k.geos(), tur: t.geos(), bar: b.geos(), turY: 1.9, barY: .55, barZ: .9 };
  }
  if (type === 'flak') {
    k.add('concrete', C(1.7, 2.1, 3.6, 8), 0, 1.8, 0); k.add('concreteDark', C(2.3, 2.3, .35, 8), 0, 3.7, 0);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.add('concreteDark', B(.5, .5, .3), Math.sin(a) * 2.1, 4.05, Math.cos(a) * 2.1, 0, a); }
    t.add('main', C(.9, 1.0, .5, 8), 0, .25, 0); t.add('main', B(.3, 1.0, .9), .7, .75, 0); t.add('main', B(.3, 1.0, .9), -.7, .75, 0);
    for (const x of [-.25, .25]) { b.add('metal', C(.06, .07, 3.0, 6), x, 0, 1.5, Math.PI / 2); b.add('dark', C(.11, .09, .35, 6), x, 0, 3.0, Math.PI / 2); }
    b.add('dark', B(.7, .5, .7), 0, 0, 0);
    return { s: 1, bl: 3.1, body: k.geos(), tur: t.geos(), bar: b.geos(), turY: 3.9, barY: .9, barZ: 0, aa: true };
  }
  // mortar pit
  bags(2.3, 12); k.add('dark', C(2, 2, .15, 12), 0, .1, 0); for (const [x, z] of [[1.4, -1], [-1.4, -1.1]]) k.add('crate', B(.7, .5, .5), x, .3, z);
  t.add('main', B(1.2, .3, 1.2), 0, .15, 0); crewMan(t, -.9, -.6); crewMan(t, .9, -.7);
  b.add('metal', C(.28, .3, 2.2, 10), 0, 0, 1.1, Math.PI / 2); b.add('dark', C(.34, .34, .2, 10), 0, 0, 2.2, Math.PI / 2);
  return { s: 1, bl: 2.2, body: k.geos(), tur: t.geos(), bar: b.geos(), turY: .45, barY: .35, barZ: 0 };
}
const TOWER_T = { mgnest: 1, atbunker: 1, flak: 1, mortar: 1 };
export function buildVehicle(type, team) {
  const C_ = TEAM[team];
  const main = std(C_.main, { roughness: .6, metalness: .2 }), trim = std(C_.trim, { roughness: .7, metalness: .2 });
  const mats = { main, trim };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const g = geoCache[type] ||= (TOWER_T[type] ? towerGeos(type) : ['light', 'medium', 'heavy'].includes(type) ? tankGeos(type) : type === 'jeep' ? jeepGeos() : gunGeos(type));
  meshes(g.body, mats, body);
  const turret = new THREE.Group(); body.add(turret);
  const barrel = new THREE.Group(); turret.add(barrel);
  turret.position.set(0, g.turY, g.turZ ?? 0); barrel.position.set(0, g.barY ?? 0, g.barZ ?? 0);
  meshes(g.tur, mats, turret); meshes(g.bar, mats, barrel);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, g.bl + .3); barrel.add(muzzle);
  body.scale.setScalar(g.s || 1);
  const R = { light: 2.5, medium: 3, heavy: 3.6, jeep: 2.3, atgun: 2.6, howitzer: 3.2, aagun: 2.8, mgnest: 3, atbunker: 3.4, flak: 3, mortar: 3.2 }[type];
  const ring = selRing(R, C_.ring); root.add(ring);
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 3.4, 10), new THREE.MeshBasicMaterial({ visible: false })); pick.position.y = 1.5; root.add(pick);
  if (type === 'howitzer') barrel.rotation.x = -.35;
  if (type === 'mortar') barrel.rotation.x = -.9;
  if (g.aa) barrel.rotation.x = -.9;
  return { root, body, turret, barrel, muzzle, ring, pick, mats };
}
export function buildPlane(type, team) {
  const C_ = TEAM[team];
  const mats = { main: std(C_.main, { roughness: .5, metalness: .2 }), trim: std(C_.trim, { roughness: .6 }) };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const g = geoCache[type] ||= planeGeos(type);
  meshes(g.body, mats, body);
  const prop = new THREE.Group(); meshes(g.prop, mats, prop); body.add(prop);
  const ring = selRing(type === 'bomber' ? 6 : 4.2, C_.ring); // drawn on the ground under the plane
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(type === 'bomber' ? 4.5 : 3, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .22, depthWrite: false }));
  const pick = new THREE.Mesh(new THREE.SphereGeometry(type === 'bomber' ? 7 : 5, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); body.add(pick);
  for (const m of body.children) if (m.isMesh) m.castShadow = false;
  return { root, body, prop, ring, shadow, pick, mats, muzzle: body };
}

// ---------------- infantry: one InstancedMesh per squad, vertex-colored soldier geometry ----------------
const soldierCache = {};
function colorize(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
// Each squad type has a signature prop, headgear and a small accent on top of the team color:
//  rifle    = helmet, long rifle with wooden stock          bazooka = long tube on the shoulder, rocket pack
//  scout    = lighter build, soft cap, binoculars up, green scarf, radio antenna
//  engineer = yellow helmet, orange vest stripes, big backpack, wrench over the shoulder
//  mgteam   = heavy MG at the hip, tripod on the back, ammo box, brass ammo belt
//  commando = dark team-tinted gear, maroon beret, SMG, knife and satchel (team-colored armband)
export function soldierGeometry(type, team) {
  const key = type + team; if (soldierCache[key]) return soldierCache[key];
  const T = TEAM[team], parts = [];
  const P = (geo, col, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => parts.push(colorize(prep(geo, x, y, z, rx, ry, rz, sx, sy, sz), col));
  const elite = type === 'commando', scout = type === 'scout', W = scout ? .86 : 1;
  const torso = elite ? new THREE.Color(0x2c302a).lerp(new THREE.Color(T.main), .42).getHex() : T.main, legs = elite ? 0x24272a : T.trim, SKIN = 0xe0b48c, GUN = 0x2b2b2b, OLIVE = 0x56603a;
  P(B(.5 * W, .85, .32), legs, 0, .43, 0);
  P(B(.62 * W, .72, .38), torso, 0, 1.2, 0);
  P(B(.66 * W, .14, .4), 0x3a3324, 0, .95, 0);
  P(S(.2, 7, 5), SKIN, 0, 1.75, 0);
  const arm = (x, rx = -.5, y = 1.27, z = .12) => P(B(.15, .58, .17), torso, x, y, z, rx);
  if (type === 'rifle') {
    P(S(.25, 7, 4), OLIVE, 0, 1.82, 0, 0, 0, 0, 1, .62, 1);
    arm(.36); arm(-.3, -.9);
    P(B(.09, .09, 1.15), GUN, .26, 1.3, .38); P(B(.11, .17, .36), 0x6b4a2a, .26, 1.26, -.12);   // rifle + stock
  } else if (type === 'bazooka') {
    P(S(.25, 7, 4), OLIVE, 0, 1.82, 0, 0, 0, 0, 1, .62, 1);
    arm(.36, -.2, 1.4); arm(-.3, -.6);
    P(C(.13, .13, 1.85, 8), 0x4b5a35, .3, 1.66, .15, Math.PI / 2);              // tube on the shoulder
    P(C(.17, .13, .22, 8), 0x2b2b2b, .3, 1.66, -.85, Math.PI / 2);              // rear flare
    P(C(.145, .145, .1, 8), 0xe6e6e0, .3, 1.66, 1.02, Math.PI / 2);             // white band at the muzzle
    P(B(.4, .45, .24), 0x4a4f3a, 0, 1.22, -.3);
    for (const x of [-.11, .11]) P(C(.06, .06, .55, 6), 0x3b3f35, x, 1.62, -.32);   // spare rockets
  } else if (type === 'scout') {
    P(C(.21, .22, .17, 8), 0x6f7a4a, 0, 1.9, 0); P(B(.32, .04, .2), 0x59633e, 0, 1.83, .2);   // soft cap
    P(B(.42, .1, .42), 0x8fd16a, 0, 1.53, 0);                                   // green scarf (accent)
    arm(.24, -1.25, 1.5, .2); arm(-.24, -1.25, 1.5, .2);                        // arms up
    for (const x of [-.08, .08]) P(C(.055, .055, .2, 6), 0x1f1f1f, x, 1.78, .28, Math.PI / 2);   // binoculars
    P(B(.34, .44, .22), 0x4a4f3a, 0, 1.24, -.29); P(C(.018, .018, 1.2, 4), 0x222222, .12, 1.95, -.33);   // radio + antenna
  } else if (type === 'engineer') {
    P(S(.26, 7, 4), 0xe8b520, 0, 1.82, 0, 0, 0, 0, 1, .62, 1);                  // yellow helmet
    for (const y of [1.08, 1.36]) P(B(.64, .07, .4), 0xff8a1f, 0, y, 0);        // orange vest stripes
    arm(.36, -.2); arm(-.36, -2.4, 1.45, -.02);
    P(B(.56, .7, .36), 0x6b5a3a, 0, 1.25, -.37);                                // big backpack
    P(B(.07, .07, 1.0), 0x9aa0a6, -.36, 1.75, -.25, .9); P(B(.26, .08, .13), 0x9aa0a6, -.36, 2.08, .1, .9);   // wrench over the shoulder
  } else if (type === 'mgteam') {
    P(S(.25, 7, 4), OLIVE, 0, 1.82, 0, 0, 0, 0, 1, .62, 1);
    arm(.36, -.7); arm(-.36, 0, 1.15, 0);
    P(C(.1, .1, 1.35, 8), 0x232323, .27, 1.12, .55, Math.PI / 2);               // heavy MG barrel jacket
    P(B(.24, .26, .45), 0x232323, .27, 1.12, -.05);                             // receiver
    P(B(.66, .07, .07), 0xc9a227, 0, 1.25, .2, 0, 0, .7);                        // brass ammo belt (accent)
    P(B(.32, .26, .2), 0x4f5b2e, -.44, .82, .05);                                // ammo box in hand
    for (const r of [-.35, 0, .35]) P(C(.03, .03, 1.1, 4), 0x2b2b2b, 0, 1.35, -.32, 0, 0, r);   // tripod on the back
  } else if (elite) {
    P(C(.25, .25, .09, 8), 0x7a1f1f, .05, 1.92, 0, 0, 0, .3);                   // maroon beret
    P(B(.42, .08, .44), 0x1a1c1e, 0, 1.68, 0);                                  // face mask
    P(B(.18, .14, .2), T.main, .39, 1.38, .05);                                  // team armband
    arm(.36, -.6); arm(-.32, -.8);
    P(B(.08, .1, .62), GUN, .2, 1.28, .38);                                      // SMG
    P(B(.3, .26, .16), 0x7a5a32, -.38, .95, .06); P(B(.06, .85, .05), 0x5a4126, 0, 1.2, .2, 0, 0, -.7);   // satchel + strap
    P(B(.05, .3, .07), 0xcfd3d6, .33, .78, .16); P(B(.07, .12, .09), 0x1a1a1a, .33, .98, .16);   // knife
  }
  const g = mergeGeometries(parts); g.computeBoundingSphere(); g.boundingSphere.radius = 400; // instance spread
  return (soldierCache[key] = g);
}
export const soldierMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, flatShading: true });
export function buildSquad(type, team, men) {
  const im = new THREE.InstancedMesh(soldierGeometry(type, team), soldierMat, men);
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
  const root = new THREE.Group();
  const ring = selRing(3.4, TEAM[team].ring); root.add(ring);
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 2.6, 10), new THREE.MeshBasicMaterial({ visible: false })); pick.position.y = 1.2; root.add(pick);
  return { root, im, ring, pick };
}

// ---------------- buildings ----------------
function bldKit(type) {
  const k = new Kit();
  switch (type) {
    case 'hq': {
      k.add('wall', B(14, 5, 12), 0, 2.5, 0); k.add('roof', B(14.6, .5, 12.6), 0, 5.25, 0); k.add('wall', B(6, 2.6, 5), -2.5, 6.8, -1.5); k.add('roof', B(6.4, .4, 5.4), -2.5, 8.3, -1.5);
      k.add('main', B(4, 3.2, .3), 0, 1.6, 6.05); k.add('trim', B(14.8, .5, 12.8), 0, 4.7, 0);
      for (const x of [-5, -2.5, 2.5, 5]) k.add('glass', B(1.3, 1.1, .1), x, 3.3, 6.03);
      k.add('dark', C(.08, .08, 7, 4), 4, 8.5, -3); k.add('dark', C(.04, .04, 5, 4), -4.5, 10.5, -2.5);
      k.add('main', B(2.4, 1.4, .06), 5.2, 11.2, -3);
      for (let i = 0; i < 9; i++) k.add('sand', B(1.4, .7, .8), -6 + i * 1.5, .35, 8);
      break;
    }
    case 'depot': {
      k.add('canvas', B(5, 2.6, 4), -1, 1.3, -1.6, 0, 0, 0); k.add('canvas', B(5.4, .2, 4.4), -1, 2.8, -1.6, 0, 0, 0);
      for (const [x, z, y] of [[2.6, 1.4, .6], [3.6, 1.4, .6], [2.6, 2.6, .6], [3.1, 2, 1.8], [-2.5, 2.4, .6]]) k.add('crate', B(1.1, 1.1, 1.1), x, y, z);
      for (const x of [-3.5, -2.6, -1.7]) k.add('main', C(.45, .45, 1.3, 8), x, .65, 3.2);
      k.add('trim', B(9, .25, 9), 0, .12, 0); k.add('dark', C(.06, .06, 4, 4), 3.6, 2, -3.5); k.add('main', B(1.4, .8, .05), 4.3, 3.6, -3.5);
      break;
    }
    case 'barracks': {
      const hut = new THREE.CylinderGeometry(3.6, 3.6, 11, 12, 1, false, -Math.PI / 2, Math.PI);
      k.add('roof', hut, 0, 0, 0, 0, 0, Math.PI / 2); k.add('wall', B(.2, 3.4, 7), 5.5, 1.7, 0, 0, 0, 0); k.add('wall', B(.2, 3.4, 7), -5.5, 1.7, 0);
      k.add('wall', B(11, .3, 7.2), 0, .15, 0, 0, 0, 0); k.add('main', B(2, 2.6, .2), 0, 1.3, 3.65); k.add('trim', B(11.2, .4, .4), 0, 3.4, 0);
      for (const x of [-3.5, 3.5]) k.add('glass', B(1, .8, .1), x, 2, 3.4);
      for (let i = 0; i < 6; i++) k.add('sand', B(1.4, .7, .8), -5 + i * 2, .35, 5.6);
      break;
    }
    case 'recon': {
      for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) k.add('wood', B(.35, 7, .35), x, 3.5, z);
      k.add('wood', B(5.2, .3, 5.2), 0, 7, 0); k.add('wood', B(5.2, 1, .15), 0, 7.6, 2.55); k.add('wood', B(5.2, 1, .15), 0, 7.6, -2.55); k.add('wood', B(.15, 1, 5.2), 2.55, 7.6, 0);
      k.add('main', new THREE.ConeGeometry(4, 1.6, 4), 0, 9.3, 0, 0, Math.PI / 4); k.add('dark', C(.05, .05, 3, 4), 1.5, 11, 1.5);
      k.add('trim', B(8, .25, 8), 0, .12, 0); k.add('main', B(1.6, .6, .05), 0, 4, 2.1);
      break;
    }
    case 'factory': {
      k.add('wall', B(15, 6, 11), 0, 3, 0); k.add('concreteDark', B(15.4, .4, 11.4), 0, 6.2, 0);
      for (let i = 0; i < 4; i++) { k.add('roof', B(15, .3, 3.2), 0, 7.1, -4 + i * 2.75, -.55); k.add('glass', B(15, 1.6, .1), 0, 7.1, -4.6 + i * 2.75 + 1.4); }
      k.add('dark', B(6, 4.6, .2), 0, 2.3, 5.55); k.add('main', B(6.6, .6, .3), 0, 4.9, 5.6); k.add('trim', B(15.2, .6, 11.2), 0, 5.6, 0);
      k.add('concreteDark', C(.8, 1, 9, 8), -5.5, 7, -3.5); k.add('dark', C(.85, .85, .5, 8), -5.5, 11.5, -3.5);
      break;
    }
    case 'atdepot': {
      k.add('concrete', B(9, 2.6, 6), 0, 1.3, -1); k.add('concreteDark', B(9.6, .5, 6.6), 0, 2.85, -1);
      k.add('dark', B(4.5, 2, .2), 0, 1.1, 2.05); k.add('main', B(9.8, .4, .4), 0, 2.4, 2.1);
      for (let i = 0; i < 7; i++) k.add('sand', B(1.4, .7, .8), -4.5 + i * 1.5, .35, 4);
      k.add('metal', C(.1, .1, 2.8, 6), 3, 3.4, -1, 0, 0, 1.2);
      break;
    }
    case 'artillery': {
      for (const s of [-1, 1]) k.add('sand', B(1.6, 1.6, 9), s * 5, .8, 0);
      k.add('sand', B(11.6, 1.6, 1.6), 0, .8, -4.2); k.add('canvas', B(6, .2, 5), -1, 3, -1, .12); for (const [x, z] of [[-3.8, -3.3], [1.8, -3.3], [-3.8, 1.3], [1.8, 1.3]]) k.add('wood', B(.2, 3, .2), x, 1.5, z);
      for (const [x, z] of [[2.6, 2], [3.6, 2], [2.6, 3], [3.1, 2.5]]) k.add('crate', B(.9, .9, .9), x, .45, z);
      k.add('main', B(10, .3, 9), 0, .15, 0); k.add('metal', C(.15, .2, 4, 6), -1, 1.6, 0, -1.1);
      break;
    }
    case 'airfield': {
      k.add('asphalt', B(28, .12, 6), 2, .08, 1.8); for (let i = 0; i < 7; i++) k.add('white', B(2, .14, .3), -9 + i * 3.6, .1, 1.8);
      const hg = new THREE.CylinderGeometry(4, 4, 9, 12, 1, false, -Math.PI / 2, Math.PI);
      k.add('roof', hg, -9, 0, -2.6, Math.PI / 2, 0, 0); k.add('wall', B(8, 4, .2), -9, 2, -7.1); k.add('dark', B(6, 3.4, .2), -9, 1.7, 1.9);
      k.add('main', B(8.4, .5, .4), -9, 3.9, 1.95); k.add('dark', C(.06, .06, 4, 4), 12, 2, -4.5); k.add('main', new THREE.ConeGeometry(.5, 1.8, 6), 12.9, 3.7, -4.5, 0, 0, Math.PI / 2);
      k.add('trim', B(10, .2, 3), 6, .1, -3.6);
      break;
    }
  }
  return k.geos();
}
export function buildBuilding(type, team) {
  const C_ = TEAM[team];
  const mats = { main: std(C_.main, { roughness: .6 }), trim: std(C_.trim), wall: std(0xc9bfa6, { roughness: .9 }), roof: std(new THREE.Color(0x5d6168).lerp(new THREE.Color(C_.main), .38).getHex(), { roughness: .85 }), concrete: SHARED.concrete.clone(), concreteDark: SHARED.concreteDark.clone(), sand: SHARED.sand.clone(), canvas: SHARED.canvas.clone(), wood: SHARED.wood.clone(), crate: SHARED.crate.clone() };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  meshes(geoCache['b_' + type] ||= bldKit(type), mats, body);
  return { root, body, mats };
}

// ---------------- props ----------------
export function supplyPadTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,214,90,.95)'; g.lineWidth = 7; g.setLineDash([14, 10]); g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke();
  g.setLineDash([]); g.fillStyle = 'rgba(255,214,90,.9)'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function buildFlag(team) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(C(.06, .06, 4, 5), SHARED.dark); pole.position.y = 2; g.add(pole);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshBasicMaterial({ color: TEAM[team].ring, side: THREE.DoubleSide, toneMapped: false }));
  f.position.set(.9, 3.4, 0); g.add(f);
  const base = new THREE.Mesh(new THREE.RingGeometry(.7, 1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM[team].ring, transparent: true, opacity: .8, depthWrite: false, toneMapped: false })); base.position.y = .1; g.add(base);
  return g;
}
