// Loads every restyled model once and hands out cheap clones (shared geometry + one toon material).
// Battle models (carrier with deck, fighter, rocks, planets) come from models.js (the Space Carrier loader).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RAMP } from './world.js';
import { loadModels } from './models.js';

const EXTRA = ['bomber', 'destroyer', 'lightcruiser', 'cruiser', 'heavycruiser', 'escortcarrier', 'pirate', 'pirateboss', 'wreck', 'freighter', 'station'];
export const vcToon = (extra = {}) => new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: RAMP, ...extra });

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  let done = 0; const total = EXTRA.length + 1;
  const tick = () => { done++; onProgress && onProgress(done / total); };
  const base = loadModels().then((m) => { tick(); return m; });
  const geos = {};
  await Promise.all(EXTRA.map((n) => loader.loadAsync('./models/' + n + '.glb').then((g) => {
    g.scene.traverse((o) => { if (o.isMesh && !geos[n]) geos[n] = o.geometry; }); tick();
  })));
  const m = await base;
  const mat = vcToon();
  // fighter geometry (for small tokens) pulled out of the battle fighter group
  m.fighter.traverse((o) => { if (o.isMesh && !geos.fighter) geos.fighter = o.geometry; });
  m.carrier.traverse((o) => { if (o.isMesh && !geos.carrier) geos.carrier = o.geometry; });
  for (const g of Object.values(geos)) { g.computeBoundingBox(); }
  // all new GLBs are normalised to 10 units long (nose +Z); fighter nose is -Z in its file, so it is turned to match
  const make = (name, len = 10) => {
    const mesh = new THREE.Mesh(geos[name], mat);
    const bb = geos[name].boundingBox, ext = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    mesh.scale.setScalar(len / ext);
    if (name === 'fighter') mesh.rotation.y = Math.PI;
    const g = new THREE.Group(); g.add(mesh); return g;
  };
  return { battle: m, geos, mat, make };
}

// renders one model to a small transparent picture for the shipyard cards
export function thumbnail(renderer, obj, size = 192) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe6f0ff, 0x6a64c8, 1.8));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.position.set(-3, 5, 4); scene.add(sun);
  const o = obj.clone(); scene.add(o);
  const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() * 0.5;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
  cam.position.copy(c).add(new THREE.Vector3(r * 1.9, r * 1.35, r * 2.2)); cam.lookAt(c);
  const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const prevBg = scene.background; scene.background = null;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); rt.dispose(); scene.background = prevBg;
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d');
  const id = g.createImageData(size, size);
  for (let y = 0; y < size; y++) id.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  g.putImageData(id, 0, 0);
  return cv.toDataURL('image/png');
}
