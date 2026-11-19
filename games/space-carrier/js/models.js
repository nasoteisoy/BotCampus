// Loads the free CC0 models (already restyled to the bright palette as vertex colours by src-models/build_models.py)
// and dresses them for the game: toon materials, a painted flight deck, engine glows and muzzle points.
// Fighter: "Spaceship" by Quaternius (Poly Pizza, CC0). Carrier: "Imperial" from Quaternius' Ultimate Spaceships Pack (CC0).
// Asteroids: "Rock Large" x2 by Quaternius (CC0). Planets: "Planet" x2 by Quaternius (CC0).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RAMP, glowTex } from './world.js';

export const DECK_Y = 11.0;                         // carrier flight-deck height in world units (m)
export const DECK = { bow: 166 };                    // the carrier's nose points +Z; launch ends past it
// keep-out box around the hull (fighter is pushed over or under it when not landing)
export const HULL = { halfW: 58, zMin: -98, zMax: 172, top: DECK_Y + 12, bottom: DECK_Y - 40 };

const vcToon = (extra = {}) => new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: RAMP, ...extra });

function deckTexture() {
  // 40 m x 100 m strip from z=56 (dome end) to z=156 (nose), ~8 px/m
  const W = 320, Hh = 800, ppm = Hh / 100;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  g.fillStyle = '#3c5aa8'; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#4766b8'; for (let y = 0; y < Hh; y += 32) g.fillRect(0, y, W, 16);
  const Y = (z) => (156 - z) * ppm;                  // world z -> canvas y (nose at top)
  g.fillStyle = '#ffffff';
  for (let z = 60; z < 154; z += 9) g.fillRect(W / 2 - 4, Y(z + 4.5), 8, 4.5 * ppm); // centre dashes
  g.fillStyle = '#7ff0ff'; g.fillRect(8, 0, 6, Hh); g.fillRect(W - 14, 0, 6, Hh);       // glow edges
  g.strokeStyle = '#ffc83d'; g.lineWidth = 8; g.strokeRect(68, Y(137), W - 136, Y(89) - Y(137)); // landing box
  g.fillStyle = '#ffc83d';                           // launch chevrons pointing at the nose (+Z)
  for (let i = 0; i < 3; i++) {
    const y = Y(68 + i * 9);
    g.beginPath(); g.moveTo(W / 2, y - 26); g.lineTo(W / 2 + 70, y + 22); g.lineTo(W / 2 + 52, y + 32); g.lineTo(W / 2, y - 2); g.lineTo(W / 2 - 52, y + 32); g.lineTo(W / 2 - 70, y + 22); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.flipY = false;                                   // canvas top = nose (+Z) once the plane is laid flat
  return t;
}

function engineGlow(color, size) {
  const m = new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
}

export async function loadModels(base = './models/') {
  const loader = new GLTFLoader();
  const names = ['carrier', 'fighter', 'rock1', 'rock2', 'planet-ring', 'planet-blue'];
  const g = await Promise.all(names.map((n) => loader.loadAsync(base + n + '.glb')));
  const mesh = (gl) => { let m = null; gl.scene.traverse((o) => { if (o.isMesh && !m) m = o; }); return m; };
  const mat = vcToon();

  // ---- carrier (deck top already at y=0 in the file, nose at +Z)
  const carrier = new THREE.Group();
  const hull = mesh(g[0]); hull.material = mat; carrier.add(hull);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(40, 100), new THREE.MeshToonMaterial({ map: deckTexture(), gradientMap: RAMP, emissive: 0x1a2a5a, emissiveIntensity: 0.25 }));
  deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.12, 106); carrier.add(deck);
  const glows = [];
  for (const [x, y, z, s] of [[-38, -14, -96, 34], [38, -14, -96, 34], [0, -10, -98, 28]]) { const e = engineGlow(0x7fe8ff, s); e.position.set(x, y, z); carrier.add(e); glows.push(e); }
  // running lights along the deck edges
  const lightGeo = new THREE.SphereGeometry(0.35, 8, 6), lights = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x9ff6ff }), 22);
  const lm = new THREE.Matrix4(); let li = 0;
  for (let z = 60; z <= 150; z += 9) for (const x of [-20.5, 20.5]) { lm.makeTranslation(x, 0.5, z); lights.setMatrixAt(li++, lm); }
  lights.count = li; carrier.add(lights);
  carrier.position.y = DECK_Y;
  carrier.userData = { glows, lights };

  // ---- fighter (nose -Z, belly at y=0)
  const fighter = new THREE.Group();
  const body = mesh(g[1]); body.material = mat;
  const model = new THREE.Group(); model.add(body); fighter.add(model);
  const flames = [];
  for (const x of [-1.15, 1.15]) { const e = engineGlow(0xff8a3a, 3.0); e.position.set(x, 1.0, 2.5); fighter.add(e); flames.push(e); }
  const core = engineGlow(0xffc070, 1.0); core.position.set(0, 1.0, 2.4); fighter.add(core); flames.push(core);
  fighter.userData = {
    model, flames,
    muzzles: [new THREE.Vector3(-2.6, 0.9, -1.6), new THREE.Vector3(2.6, 0.9, -1.6)],
    wingTips: [new THREE.Vector3(-4.6, 1.6, 1.0), new THREE.Vector3(4.6, 1.6, 1.0)],
    engines: [new THREE.Vector3(-1.15, 1.0, 2.6), new THREE.Vector3(1.15, 1.0, 2.6)],
  };

  const rocks = [mesh(g[2]), mesh(g[3])].map((m) => { m.material = mat; return m.geometry; });
  const planetRing = new THREE.Group(); { const m = mesh(g[4]); m.material = mat; planetRing.add(m); }
  const planetBlue = new THREE.Group(); { const m = mesh(g[5]); m.material = mat; planetBlue.add(m); }
  return { carrier, fighter, rocks, rockMat: mat, planets: { ring: planetRing, blue: planetBlue } };
}
