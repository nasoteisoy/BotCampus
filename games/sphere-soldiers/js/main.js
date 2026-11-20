// Sphere Soldiers: tap the planet to drop an HQ trooper; every trooper keeps walking around the planet.
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPlanet } from './planet.js';
import { Army } from './army.js';
import { watchTaps } from './tap.js';
import { icon } from './shell-icons.js';

const R = 10;                    // planet radius; soldiers are ~1.7 tall
const MIN_GAP = 2.4;             // closest the camera gets to the ground (a 1.7 tall soldier stays past the 0.25 near plane)
const MAX_DT = 1 / 20;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.25, 400);

// ---- light: bright sky fill + a sun that follows the view (up-right of the camera) so the side you look at is always lit
scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x5f8f3a, 1.5));
const sun = new THREE.DirectionalLight(0xfff6e0, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
Object.assign(sun.shadow.camera, { left: -R * 1.1, right: R * 1.1, top: R * 1.1, bottom: -R * 1.1, near: R, far: R * 6 });
scene.add(sun, sun.target);
const sunDir = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
function followSun() {
  camera.matrixWorld.extractBasis(camRight, camUp, sunDir);   // sunDir = camera's backward axis (toward the viewer)
  sunDir.addScaledVector(camUp, 0.7).addScaledVector(camRight, 0.45).normalize();
  sun.position.copy(sunDir).multiplyScalar(R * 3.5);
}

const planet = buildPlanet(R);
scene.add(planet);
const army = new Army(scene, R);

// ---- orbit: drag rotate, wheel / pinch zoom, never inside the planet (pan off keeps the planet centred)
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.12; controls.enablePan = false;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.minDistance = R + MIN_GAP;
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '0'].includes(e.key)) e.preventDefault(); });

// ---- auto-fit: the planet fills the smaller field of view; a resize keeps the user's zoom relative to the fit
let fitDist = 0;
function fit() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const next = (R * 1.12) / Math.sin(Math.min(vf, hf) / 2);
  const dist = fitDist ? camera.position.length() * (next / fitDist) : next;
  fitDist = next;
  if (camera.position.lengthSq() === 0) camera.position.set(0.35, 0.55, 1);
  controls.maxDistance = next * 2.5;
  camera.position.setLength(THREE.MathUtils.clamp(dist, controls.minDistance, controls.maxDistance));
  camera.far = controls.maxDistance + R * 2;
  camera.updateProjectionMatrix(); controls.update();
}
addEventListener('resize', fit);
screen.orientation?.addEventListener?.('change', () => setTimeout(fit, 120));
fit();

// ---- HUD
for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon, { size: 26 });
const countEl = document.getElementById('n'), clearBtn = document.getElementById('clear'), hint = document.getElementById('hint');
function refreshHud() {
  countEl.textContent = army.count;
  clearBtn.disabled = army.count === 0;
  hint.classList.toggle('off', army.count > 0);
}
clearBtn.addEventListener('click', () => { army.clear(); refreshHud(); });

// ---- tap the surface: exact ray / sphere hit, so the soldier lands on the point under the finger
const planetSphere = new THREE.Sphere(new THREE.Vector3(), R), ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
watchTaps(canvas, (x, y) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectSphere(planetSphere, hit)) return;
  army.spawn(hit);
  refreshHud();
});
refreshHud();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), MAX_DT);
  controls.update();
  army.update(dt);
  followSun();
  renderer.render(scene, camera);
});

// QA handles, only with ?test=1 (the page itself never reads window.__ss)
if (new URLSearchParams(location.search).get('test') === '1') window.__ss = { R, camera, controls, renderer, army };
