// Flat grassy test island: a smooth grass top (vertex-colour patches, sandy soft-edge band), earth sides and a rocky underside.
import * as THREE from 'three';

const GRASS = [new THREE.Color(0x4fae3c), new THREE.Color(0x67c24a), new THREE.Color(0x3f9a35)];
const SAND = new THREE.Color(0xe6cf8f);

function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

/** @param {number} R island radius  @param {number} edgeStart radius where the soft edge (sand band) begins */
export function buildIsland(R, edgeStart) {
  const group = new THREE.Group(); group.name = 'island';
  // a ring geometry from radius 0 (not a single-fan circle) so the colour patches have vertices to live on
  const ringGeo = new THREE.RingGeometry(0, R, 160, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const pos = ringGeo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
    const n = 0.65 * noise(x * 0.35, z * 0.35) + 0.35 * noise(x * 1.1 + 9, z * 1.1);
    c.copy(GRASS[1]).lerp(GRASS[0], THREE.MathUtils.smoothstep(n, 0.3, 0.7)).lerp(GRASS[2], 0.4 * THREE.MathUtils.smoothstep(noise(x * 2.3, z * 2.3 + 4), 0.6, 0.9));
    c.lerp(SAND, THREE.MathUtils.smoothstep(r, edgeStart, R - 0.15));
    c.toArray(col, i * 3);
  }
  ringGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const grass = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  grass.receiveShadow = true; grass.name = 'grass';
  const side = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.93, 0.9, 160, 1, true), new THREE.MeshStandardMaterial({ color: 0xb98552, roughness: 1 }));
  side.position.y = -0.45; side.name = 'earth';
  const under = new THREE.Mesh(new THREE.ConeGeometry(R * 0.93, R * 0.7, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x9a8a7c, roughness: 1, flatShading: true }));
  under.rotation.x = Math.PI; under.position.y = -0.9 - R * 0.35; under.name = 'rock';
  group.add(grass, side, under);
  return group;
}
