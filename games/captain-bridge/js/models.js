// Loads the free CC0 models (restyled to the bright palette as vertex colours, from the Space Carrier set)
// and dresses them with the shared toon look. Carrier: "Imperial" from Quaternius' Ultimate Spaceships Pack (CC0).
// Planets: "Planet" x2 by Quaternius (CC0).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RAMP, glowTex } from './space-world.js';

const vcToon = (extra = {}) => new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: RAMP, ...extra });

function deckTexture() {
  const W = 320, Hh = 800, ppm = Hh / 100;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  g.fillStyle = '#4a6cc4'; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#5679d0'; for (let y = 0; y < Hh; y += 32) g.fillRect(0, y, W, 16);
  const Y = (z) => (156 - z) * ppm;
  g.fillStyle = '#ffffff'; for (let z = 60; z < 154; z += 9) g.fillRect(W / 2 - 4, Y(z + 4.5), 8, 4.5 * ppm);
  g.fillStyle = '#7ff0ff'; g.fillRect(8, 0, 6, Hh); g.fillRect(W - 14, 0, 6, Hh);
  g.strokeStyle = '#ffc83d'; g.lineWidth = 8; g.strokeRect(68, Y(137), W - 136, Y(89) - Y(137));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false;
  return t;
}

export function engineGlow(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size); return s;
}

export async function loadModels(base = './models/') {
  const loader = new GLTFLoader();
  const names = ['carrier', 'planet-ring', 'planet-blue'];
  const g = await Promise.all(names.map((n) => loader.loadAsync(base + n + '.glb')));
  const mesh = (gl) => { let m = null; gl.scene.traverse((o) => { if (o.isMesh && !m) m = o; }); return m; };
  const mat = vcToon();
  const carrier = new THREE.Group();
  const hull = mesh(g[0]); hull.material = mat; carrier.add(hull);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(40, 100), new THREE.MeshToonMaterial({ map: deckTexture(), gradientMap: RAMP, emissive: 0x1a2a5a, emissiveIntensity: 0.25 }));
  deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.12, 106); carrier.add(deck);
  const glows = [];
  for (const [x, y, z, s] of [[-38, -14, -96, 34], [38, -14, -96, 34], [0, -10, -98, 28]]) { const e = engineGlow(0x7fe8ff, s); e.position.set(x, y, z); carrier.add(e); glows.push(e); }
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9ff6ff }), 22);
  const lm = new THREE.Matrix4(); let li = 0;
  for (let z = 60; z <= 150; z += 9) for (const x of [-20.5, 20.5]) { lm.makeTranslation(x, 0.5, z); lights.setMatrixAt(li++, lm); }
  lights.count = li; carrier.add(lights);
  carrier.userData = { glows, lights, hull };
  const planetRing = new THREE.Group(); { const m = mesh(g[1]); m.material = mat; planetRing.add(m); }
  const planetBlue = new THREE.Group(); { const m = mesh(g[2]); m.material = mat; planetBlue.add(m); }
  return { carrier, planets: { ring: planetRing, blue: planetBlue } };
}

/** Swap a parts-library ship's standard materials for the shared toon look (keeps colours + glow). */
export function toonify(root) {
  const cache = new Map();
  root.traverse((m) => {
    if (!m.isMesh || !m.material || !m.material.isMeshStandardMaterial) return;
    const src = m.material;
    if (!cache.has(src)) {
      cache.set(src, new THREE.MeshToonMaterial({
        color: src.color.clone().offsetHSL(0, 0.05, 0.12), map: src.map || null, gradientMap: RAMP,
        emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0), emissiveIntensity: src.emissiveIntensity ?? 1,
        transparent: src.transparent, opacity: src.opacity, side: src.side,
      }));
    }
    m.material = cache.get(src);
  });
  return root;
}
