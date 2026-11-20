// Clean, bright grass planet: a smooth sphere (no vertex deformation) with soft grass/ground colour patches in vertex colours.
import * as THREE from '../vendor/three.module.min.js';

const GRASS = [new THREE.Color(0x58c544), new THREE.Color(0x7bd958), new THREE.Color(0x46b13c)];
const GROUND = new THREE.Color(0xd2b071);

// small 3D value noise (hash lattice + smooth blend), seamless on the sphere
function hash(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
const fade = (t) => t * t * (3 - 2 * t);
function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm = (x, y, z) => 0.6 * noise(x, y, z) + 0.3 * noise(x * 2.1, y * 2.1, z * 2.1) + 0.1 * noise(x * 4.3, y * 4.3, z * 4.3);

export function buildPlanet(R) {
  const geo = new THREE.SphereGeometry(R, 160, 120);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / R, y = pos.getY(i) / R, z = pos.getZ(i) / R;
    const g = fbm(x * 2.2 + 5, y * 2.2, z * 2.2);
    c.copy(GRASS[1]).lerp(GRASS[0], THREE.MathUtils.smoothstep(g, 0.35, 0.7)).lerp(GRASS[2], 0.5 * THREE.MathUtils.smoothstep(fbm(x * 6, y * 6 + 3, z * 6), 0.55, 0.8));
    c.lerp(GROUND, 0.85 * THREE.MathUtils.smoothstep(fbm(x * 1.6 - 7, y * 1.6, z * 1.6 + 2), 0.66, 0.74));
    c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.name = 'planet';
  return mesh;
}
