// Army HQ trooper/tank wrappers. Geometry + materials come from copied hq/* (no outside imports).
import * as THREE from '../vendor/three.module.min.js';
import { TeamLook } from './hq/trooper.js';
import { RigTemplate, Rig } from './hq/demo-rig.js';
import { nationFor, trooperSt, TANK_ST, paintState } from './hq/looks.js';

/** Match Army HQ on-screen size vs our smaller map (HQ uses UNIT_SCALE 1.8 on a huge map). */
export const UNIT_SCALE = 1.0;
export const TANK_SCALE = 1.0;

const _tpl = new Map();   // key → RigTemplate
const _look = new Map();  // hex|skin → TeamLook
const _sharedGeos = new Set();

function lookFor(teamHex, skin = 1) {
  const key = `${String(teamHex || '#3ab4ff').toLowerCase()}|${skin}`;
  let L = _look.get(key);
  if (!L) {
    L = new TeamLook();
    const nat = nationFor(teamHex);
    L.paint(paintState(nat, { skin }));
    _look.set(key, L);
  }
  return L;
}

function tplFor(kind, st) {
  const key = kind + ':' + JSON.stringify(st);
  let t = _tpl.get(key);
  if (!t) {
    t = new RigTemplate(kind, st);
    for (const mats of Object.values(t.geos)) for (const g of Object.values(mats)) _sharedGeos.add(g);
    _tpl.set(key, t);
  }
  return t;
}

function finish(rig, scale, height) {
  const root = rig.root;
  root.scale.setScalar(scale);
  root.userData.hqRig = rig;
  root.userData.mats = [rig.look.team, rig.look.visor];
  root.userData.height = height;
  root.userData.sharedGeos = true;
  // Tag meshes so disposeObject3D skips shared template geos
  for (const m of rig.meshes) m.userData.sharedGeo = true;
  return root;
}

/** Rifle / heavy / recon / … trooper. teamHex = nation primary. */
export function makeTrooper(type, teamHex) {
  const st = trooperSt(type === 'recon' ? 'recon' : type);
  const look = lookFor(teamHex, st.skin);
  // Re-paint in case TeamLook was created with different skin key already matching
  look.paint(paintState(nationFor(teamHex), st));
  const tpl = tplFor('trooper', st);
  const rig = new Rig(tpl, look);
  return finish(rig, UNIT_SCALE, 1.0);
}

/** Tank from buildTankParts via RigTemplate. */
export function makeTank(teamHex) {
  // Lead OTS: mast/pennant reads like a CP flag through the crosshair — disable (trooper banner:0 equivalent).
  const st = { ...TANK_ST, antenna: 0, pennant: 0 };
  const look = lookFor(teamHex, 1);
  look.paint(paintState(nationFor(teamHex), { skin: 1 }));
  const tpl = tplFor('tank', st);
  const rig = new Rig(tpl, look);
  const wreckMat = new THREE.MeshLambertMaterial({ color: 0x2a2d31, flatShading: true });
  rig.wreckMat = wreckMat;
  rig.root.userData.wreckMat = wreckMat;
  return finish(rig, TANK_SCALE, 0.9);
}

/** Gray wreck for taken-out (fallback / tanks). */
export function makeWreck(isTank) {
  const g = new THREE.Group();
  const gray = new THREE.MeshLambertMaterial({ color: '#4a4e56', flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: '#2e3238', flatShading: true });
  if (isTank) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), gray);
    h.scale.set(1.0, 0.25, 0.55); h.position.set(0, 0.12, 0); h.rotation.z = 0.35; g.add(h);
  } else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), gray);
    b.scale.set(0.5, 0.12, 0.3); b.position.set(0, 0.06, 0); b.rotation.z = 0.5; g.add(b);
  }
  g.userData.mats = [gray, dark];
  return g;
}

export function disposeObject3D(root) {
  const rig = root?.userData?.hqRig;
  if (rig) {
    try { rig.disposeFade?.(); rig.clearProps?.(); } catch (_) {}
  }
  root.traverse((o) => {
    if (o.geometry && !o.userData?.sharedGeo && !_sharedGeos.has(o.geometry)) {
      try { o.geometry.dispose(); } catch (_) {}
    }
    // Do not dispose shared TeamLook materials
    if (o.material && o.userData?.mat == null && !root.userData?.sharedGeos) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        try { if (m.map && !m.map.image) {/* keep */} if (!root.userData?.hqRig) m.dispose(); } catch (_) {}
      }
    }
  });
  if (root.userData?.wreckMat) {
    try { root.userData.wreckMat.dispose(); } catch (_) {}
  }
}

export function disposeSharedGeos() {
  for (const [, t] of _tpl) { try { t.dispose(); } catch (_) {} }
  _tpl.clear();
  _sharedGeos.clear();
  for (const [, L] of _look) {
    try { L.team?.map?.dispose(); L.team?.dispose(); L.visor?.dispose(); } catch (_) {}
  }
  _look.clear();
}
