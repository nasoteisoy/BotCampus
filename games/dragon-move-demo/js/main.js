// Dragon move demo: the optimized Meshy dragon hops around a small grass island (art review).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildIsland } from './island.js';
import { Hopper } from './hopper.js';
import { FollowCam } from './follow-cam.js';
import { createJoystick } from './joystick.js';
import { createKeys } from './keys.js';
import { icon } from './shell-icons.js';

const ISLAND_R = 8, EDGE_INNER = 5.6, EDGE_OUTER = 7.0;   // soft edge: slows from 5.6 m, stops at 7 m
const MODEL_URL = 'models/dragon.glb';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe8ff);
scene.fog = new THREE.Fog(0xbfe8ff, 30, 70);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
pmrem.dispose();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(0, 3.6, 7.4);

// ---- light: sky fill + a sun whose shadow box follows the dragon (crisp shadow on a small area)
scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x6a9a48, 1.0));
const sun = new THREE.DirectionalLight(0xfff3dd, 2.4);
const SUN_OFFSET = new THREE.Vector3(4, 9, 5);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 25 });
scene.add(sun, sun.target);
scene.add(buildIsland(ISLAND_R, EDGE_INNER));

// ---- the dragon: root (position + turn) > body (hop height + squash, pivot at the feet) > model
const root = new THREE.Group(), body = new THREE.Group();
root.add(body); scene.add(root);
const hopper = new Hopper({ inner: EDGE_INNER, outer: EDGE_OUTER, reduceMotion });
let loaded = false;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.load(MODEL_URL, (gltf) => {
  const model = gltf.scene;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);   // feet on the ground, centred over the pivot
  body.add(model);
  loaded = true;
  document.body.classList.add('ready');
}, undefined, (err) => { console.error('dragon model failed to load', err); });

// ---- camera: drag orbits, wheel / pinch zooms, follows with lag; never under the island
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.1; controls.enablePan = false;
controls.minDistance = 2.4; controls.maxDistance = 16; controls.maxPolarAngle = THREE.MathUtils.degToRad(84);
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
const follow = new FollowCam(camera, controls, { lag: reduceMotion ? 8 : 3.5 });
follow.snap(root.position);
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.75 ? 55 : 45;   // portrait phones: a little wider so the dragon and island read
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- input: WASD / arrows, or the left stick on touch screens; both move relative to the camera
const keys = createKeys();
const joy = createJoystick(document.getElementById('joy'), document.getElementById('knob'));
const touchUI = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', touchUI);
addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon, { size: 24 });
const hint = document.getElementById('hint');
let movedFor = 0;

const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function moveInput() {
  const k = keys.vector(), x = joy.active ? joy.x : k.x, y = joy.active ? joy.y : k.y;
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  right.set(-fwd.z, 0, fwd.x);
  return { x: right.x * x + fwd.x * y, z: right.z * x + fwd.z * y };
}

const timer = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(timer.getDelta(), 0.1);
  if (loaded) {
    const m = moveInput();
    hopper.update(dt, m.x, m.z);
    root.position.set(hopper.x, 0, hopper.z); root.rotation.y = hopper.yaw;
    body.position.y = hopper.y; body.scale.set(hopper.sxz, hopper.sy, hopper.sxz);
    if (Math.hypot(m.x, m.z) > 0.1 && (movedFor += dt) > 4) hint.classList.add('off');
  }
  follow.update(dt, { x: hopper.x, y: hopper.y, z: hopper.z });
  controls.update();
  sun.target.position.copy(root.position); sun.position.copy(root.position).add(SUN_OFFSET);
  renderer.render(scene, camera);
});

// QA handles, only with ?test=1 (the page itself never reads window.__dm)
if (new URLSearchParams(location.search).get('test') === '1') window.__dm = { hopper, root, body, camera, controls, renderer, isLoaded: () => loaded, edge: { inner: EDGE_INNER, outer: EDGE_OUTER, island: ISLAND_R } };
