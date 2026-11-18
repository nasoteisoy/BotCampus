// Bright toon world: sky dome, scrolling ocean, merged clouds and islands (one draw call each).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function toonRamp() {
  const d = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}
export const RAMP = toonRamp();
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: RAMP, ...extra });

export const ISLANDS = [[-700, -900, 60], [900, -1300, 90], [-1300, 300, 70], [1100, 600, 50], [200, -1750, 110]]; // x, z, radius
export const islandTop = (s) => 4 + s * 0.7;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function oceanTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2aa9e6'; g.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let i = 0; i < 70; i++) {
    const x = r() * 256, y = r() * 256, w = 10 + r() * 26;
    g.strokeStyle = `rgba(255,255,255,${0.18 + r() * 0.25})`; g.lineWidth = 2 + r() * 2; g.lineCap = 'round';
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + w / 2, y + oy - 4, x + ox + w, y + oy); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x7fd3ff);
  scene.fog = new THREE.Fog(0xbfe8ff, 700, 2600);
  // sky dome gradient
  const skyGeo = new THREE.SphereGeometry(3000, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3aa6f0) }, bot: { value: new THREE.Color(0xd8f3ff) } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(0.0, 0.45, h)), 1.); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat); sky.renderOrder = -1; scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xdff4ff, 0x3a7fb0, 1.4));
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
  sun.position.set(-300, 500, 200); scene.add(sun);

  const tex = oceanTexture(); tex.repeat.set(160, 160);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ map: tex }));
  ocean.rotation.x = -Math.PI / 2; scene.add(ocean);

  // clouds: puffs merged into one geometry
  const r = rng(42), puffs = [];
  for (let c = 0; c < 22; c++) {
    const ang = r() * Math.PI * 2, dist = 350 + r() * 1500;
    const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist, cy = 140 + r() * 120;
    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const g = new THREE.IcosahedronGeometry(14 + r() * 16, 1);
      g.scale(1, 0.62, 1);
      g.translate(cx + (i - n / 2) * 18 + r() * 8, cy + r() * 8, cz + r() * 16);
      puffs.push(g);
    }
  }
  const clouds = new THREE.Mesh(mergeGeometries(puffs), toon(0xffffff, { emissive: 0x6a8aa8, emissiveIntensity: 0.25 }));
  scene.add(clouds);

  // islands: sand base + green hill + palms, vertex colored
  const isl = [];
  const addCol = (g, hex) => { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const spots = ISLANDS;
  for (const [x, z, s] of spots) {
    const sand = new THREE.CylinderGeometry(s, s * 1.15, 6, 10, 1); sand.translate(x, 1, z); isl.push(addCol(sand.toNonIndexed(), 0xffe2a0));
    const hill = new THREE.ConeGeometry(s * 0.72, s * 0.7, 9, 1); hill.translate(x + s * 0.1, 4 + s * 0.35, z); isl.push(addCol(hill.toNonIndexed(), 0x46c45a));
    for (let p = 0; p < 3; p++) {
      const a = r() * 6.28, px = x + Math.cos(a) * s * 0.85, pz = z + Math.sin(a) * s * 0.85;
      const trunk = new THREE.CylinderGeometry(0.8, 1.2, 14, 5); trunk.translate(px, 11, pz); isl.push(addCol(trunk.toNonIndexed(), 0x9b6b3d));
      const leaf = new THREE.ConeGeometry(7, 4, 6); leaf.translate(px, 19, pz); isl.push(addCol(leaf.toNonIndexed(), 0x2fae4a));
    }
  }
  const islands = new THREE.Mesh(mergeGeometries(isl), toon(0xffffff, { vertexColors: true }));
  scene.add(islands);

  return {
    sun,
    update(dt, t) { tex.offset.x = t * 0.004; tex.offset.y = t * 0.0025; },
  };
}
