// Voxel Sphere: a 10x10x10 grid of see-through unit cubes coloured by how they sit against a sphere.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { classifyGrid, N, CENTER, R } from './classify.js';

const COLORS = { brown: 0x9a5a22, green: 0x2fbf4f, black: 0x111111 };
const EDGE = { brown: 0x5a3415, green: 0x16702b, black: 0x000000 };
const FILL_OPACITY = { brown: 0.35, green: 0.28, black: 0.25 };
const GAP = 0.92;   // each cube drawn slightly smaller than its cell so neighbours' edges stay separate
// draw order: outer layers first, inner last (blending is order-dependent with depthWrite off, so the brown core stays readable)
const ORDER = { black: 1, sphere: 3, green: 5, brown: 7 };

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef2f7);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
const center = new THREE.Vector3(N / 2, N / 2, N / 2);

// ---- classification (exact, see js/classify.js + test/)
const { cells, counts } = classifyGrid();
console.info('voxel-sphere counts', JSON.stringify(counts), 'total', counts.brown + counts.green + counts.black);
document.getElementById('nBrown').textContent = counts.brown;
document.getElementById('nGreen').textContent = counts.green;
document.getElementById('nBlack').textContent = counts.black;

// ---- cubes: one InstancedMesh (fill) + one merged LineSegments (edges) per class
const box = new THREE.BoxGeometry(GAP, GAP, GAP);
const edgeUnit = new THREE.EdgesGeometry(box).attributes.position.array;   // 12 edges, 24 points
const m4 = new THREE.Matrix4();
for (const cls of ['black', 'green', 'brown']) {
  const list = cells.filter((c) => c.cls === cls);
  if (!list.length) continue;
  const fill = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: COLORS[cls], transparent: true, opacity: FILL_OPACITY[cls], depthWrite: false }), list.length);
  const pos = new Float32Array(list.length * edgeUnit.length);
  list.forEach((c, n) => {
    const x = c.i + 0.5, y = c.j + 0.5, z = c.k + 0.5;
    fill.setMatrixAt(n, m4.makeTranslation(x, y, z));
    for (let p = 0; p < edgeUnit.length; p += 3) pos.set([edgeUnit[p] + x, edgeUnit[p + 1] + y, edgeUnit[p + 2] + z], n * edgeUnit.length + p);
  });
  fill.renderOrder = ORDER[cls]; scene.add(fill);
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: EDGE[cls], transparent: true, opacity: cls === 'black' ? 0.5 : cls === 'brown' ? 0.95 : 0.75, depthWrite: false }));
  lines.renderOrder = ORDER[cls] + 1; scene.add(lines);
}

// ---- the sphere, see-through with a light wireframe
const sc = new THREE.Vector3(...CENTER);
const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshBasicMaterial({ color: 0x5096ff, transparent: true, opacity: 0.1, depthWrite: false }));
sphere.position.copy(sc); sphere.renderOrder = ORDER.sphere; scene.add(sphere);
const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(R, 24, 16)), new THREE.LineBasicMaterial({ color: 0x2f6fe0, transparent: true, opacity: 0.35, depthWrite: false }));
wire.position.copy(sc); wire.renderOrder = 9; scene.add(wire); // wireframe drawn last so the sphere always reads

// ---- controls: mouse rotate / wheel zoom, touch rotate / pinch zoom (pan off so the grid stays centred)
const controls = new OrbitControls(camera, canvas);
controls.target.copy(center);
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.enablePan = false;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
// no page zoom/scroll gestures from the canvas (iOS gesture events, double-tap zoom, wheel)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
canvas.addEventListener('dblclick', (e) => e.preventDefault());

// ---- auto-fit: the grid's bounding sphere fills the smaller field of view (keeps the current view direction)
const GRID_RADIUS = Math.sqrt(3) * N / 2;
const dir = new THREE.Vector3(1.0, 0.75, 1.25).normalize();     // first view: a three-quarter look from above
function fit() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const dist = (GRID_RADIUS * 1.08) / Math.sin(Math.min(vf, hf) / 2);
  if (camera.position.lengthSq() > 0) dir.copy(camera.position).sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  camera.far = dist * 3 + GRID_RADIUS * 2;   // near stays 0.1 so zooming in never clips the grid
  controls.minDistance = GRID_RADIUS * 0.6; controls.maxDistance = dist * 3;
  camera.updateProjectionMatrix(); controls.update();
}
addEventListener('resize', fit);
screen.orientation?.addEventListener?.('change', () => setTimeout(fit, 120));
fit();

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// read-only probe for automated QA (?test=1)
if (new URLSearchParams(location.search).get('test') === '1') {
  const v = new THREE.Vector3();
  window.__vs = {
    state() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let m = 0; m < 8; m++) {
        v.set(m & 1 ? N : 0, m & 2 ? N : 0, m & 4 ? N : 0).project(camera);
        const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
        x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
      }
      const off = camera.position.clone().sub(controls.target);
      return { counts, dist: off.length(), azimuth: Math.atan2(off.x, off.z), polar: Math.acos(off.y / off.length()), gridBox: [x0, y0, x1, y1], vw: innerWidth, vh: innerHeight };
    },
  };
}
