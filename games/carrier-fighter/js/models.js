// Loads the two free models and restyles them into the game's bright toon look.
// Carrier: "early French aircraft carrier Bearn" by Captain_Ahab_62 (OpenGameArt, CC0) - trimmed/merged in Blender.
// Fighter: "Aeroplane" by Gilang Romadhan (Poly Pizza, CC BY 3.0) - texture repainted.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toon, RAMP } from './world.js';

export const DECK_Y = 11.0;          // flight deck height above the sea (m)
export const DECK = { halfW: 13, bow: -88, stern: 86 };
const KEEL_TO_DECK = 16.6;

const CARRIER_COLORS = {
  Gray: 0xa9bdd2, DarkGray: 0x62778f, Black: 0x2c3c55, Woodish: 0xd9b27a,
  DarkRed: 0xef6a5a, Yellowish: 0xffd23f, White: 0xffffff,
};

function deckTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1664; // 26m x 170m at ~9.8px/m
  const g = c.getContext('2d'), ppm = c.height / 170;
  g.fillStyle = '#d2a868'; g.fillRect(0, 0, c.width, c.height);
  for (let x = 0; x < c.width; x += 9) { g.fillStyle = (x / 9) % 2 ? '#c99d5e' : '#d8b073'; g.fillRect(x, 0, 8, c.height); }
  g.fillStyle = 'rgba(120,80,40,.25)';
  for (let y = 0; y < c.height; y += 37) for (let x = 0; x < c.width; x += 9) if (((x + y) / 9) % 5 < 1) g.fillRect(x, y, 8, 2);
  const Z = (z) => (z + 85) * ppm; // world z (-85 bow .. +85 stern) -> canvas y
  // centre line dashes
  g.fillStyle = '#ffffff';
  for (let z = -80; z < 80; z += 10) g.fillRect(124, Z(z), 8, 5 * ppm);
  // edge lines
  g.fillRect(6, 0, 5, c.height); g.fillRect(c.width - 11, 0, 5, c.height);
  // landing box near the stern (yellow)
  g.strokeStyle = '#ffd23f'; g.lineWidth = 8; g.strokeRect(40, Z(28), c.width - 80, Z(78) - Z(28));
  // arrester wires
  g.fillStyle = '#25324a';
  for (const z of [44, 52, 60, 68]) g.fillRect(20, Z(z), c.width - 40, 4);
  // take-off chevrons near the bow
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 3; i++) {
    const y = Z(-50 - i * 9);
    g.beginPath(); g.moveTo(128, y - 30); g.lineTo(200, y + 20); g.lineTo(180, y + 30); g.lineTo(128, y - 6); g.lineTo(76, y + 30); g.lineTo(56, y + 20); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function foamRing() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.62, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.scale.set(46, 205, 1); m.position.y = 0.15;
  return m;
}

export async function loadModels(base = './models/') {
  const loader = new GLTFLoader();
  const [cg, fg] = await Promise.all([loader.loadAsync(base + 'carrier.glb'), loader.loadAsync(base + 'fighter.glb')]);

  // ---- carrier
  const carrier = new THREE.Group();
  const hull = cg.scene;
  const mats = {};
  hull.traverse((o) => {
    if (!o.isMesh) return;
    const name = (o.material && o.material.name) || 'Gray';
    mats[name] ||= toon(CARRIER_COLORS[name] ?? 0xa9bdd2);
    o.material = mats[name];
  });
  hull.rotation.y = Math.PI / 2;            // bow -> -Z, island -> starboard (+X)
  hull.position.y = DECK_Y - KEEL_TO_DECK;
  carrier.add(hull);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(26, 170), toon(0xffffff, { map: deckTexture() }));
  deck.rotation.x = -Math.PI / 2; deck.position.y = DECK_Y + 0.08;
  carrier.add(deck);
  carrier.add(foamRing());

  // ---- fighter
  const fighter = new THREE.Group();
  const body = fg.scene;
  let src = null;
  body.traverse((o) => { if (o.isMesh) { src = o; } });
  const map = src.material.map; if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
  src.material = new THREE.MeshToonMaterial({ map, gradientMap: RAMP, color: 0xffffff });
  // find the nose hub (glTF +Z end) for the prop disc before re-orienting
  const pos = src.geometry.attributes.position, hub = new THREE.Vector3(); let n = 0, maxZ = -1e9, minY = 1e9;
  for (let i = 0; i < pos.count; i++) { maxZ = Math.max(maxZ, pos.getZ(i)); minY = Math.min(minY, pos.getY(i)); }
  for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > maxZ - 0.35) { hub.x += pos.getX(i); hub.y += pos.getY(i); n++; }
  hub.x /= n; hub.y /= n; hub.z = maxZ;
  const S = 1.25;
  const model = new THREE.Group();
  model.add(body);
  model.rotation.y = Math.PI;               // nose -> -Z
  model.scale.setScalar(S);
  model.position.y = -minY * S;             // wheels on y=0
  fighter.add(model);
  // spinning prop disc + blades (toon)
  const prop = new THREE.Group();
  prop.position.set(-hub.x * S, (hub.y - minY) * S, -(hub.z * S + 0.06));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  prop.add(disc);
  const bladeMat = toon(0x22324d);
  const blades = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.6, 0.06), bladeMat);
    b.position.y = 0.8; const p = new THREE.Group(); p.rotation.z = (i * Math.PI * 2) / 3; p.add(b); blades.add(p);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 10), toon(0xef4b55)); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.2;
  prop.add(blades, tip);
  fighter.add(prop);
  fighter.userData = { prop, blades, disc, muzzles: [new THREE.Vector3(-2.3, 1.0, -1.2), new THREE.Vector3(2.3, 1.0, -1.2)], wingTips: [new THREE.Vector3(-4.8, 1.1, 0.4), new THREE.Vector3(4.8, 1.1, 0.4)] };

  return { carrier, fighter };
}
