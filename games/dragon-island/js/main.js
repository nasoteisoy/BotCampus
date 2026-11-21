// Dragon Island: one realistic Tripo island. One dragon is yours (switchable); the others wander.
// All dragon poses are the GLBs' own animation clips.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SLOTS, MANIFEST } from './slots.js';
import { loadWorld } from './world.js';
import { FireFx } from './fire.js';
import { FollowCam } from './follow-cam.js';
import { createJoystick } from './joystick.js';
import { createKeys } from './keys.js';
import { icon } from './shell-icons.js';
import { iconX } from './icons-extra.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe8ff);
scene.fog = new THREE.Fog(0xbfe8ff, 25, 60);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
pmrem.dispose();
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 150);
camera.position.set(0, 2.3, 5.2);

// ---- light: sky fill + a sun whose shadow box follows your dragon
scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x6a9a48, 1.0));
const sun = new THREE.DirectionalLight(0xfff3dd, 2.4);
const SUN_OFFSET = new THREE.Vector3(3, 7, 4);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
scene.add(sun, sun.target);
const fire = new FireFx(scene);

// ---- camera: drag orbits, wheel / pinch zooms, follows your dragon with lag
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.1; controls.enablePan = false;
controls.minDistance = 1.4; controls.maxDistance = 12; controls.maxPolarAngle = THREE.MathUtils.degToRad(84);
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
const follow = new FollowCam(camera, controls, { lag: 2.6, lookHeight: 0.55 });
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w / h < 0.75 ? 55 : 45; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- HUD
for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon, { size: 24 });
for (const el of document.querySelectorAll('[data-x]')) el.innerHTML = iconX(el.dataset.x);
const ui = {
  swap: document.getElementById('swap'), fly: document.getElementById('fly'), fire: document.getElementById('fire'), hint: document.getElementById('hint'),
};
const keys = createKeys();
const joy = createJoystick(document.getElementById('joy'), document.getElementById('knob'));
document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
let run = false, movedFor = 0;

// ---- world state: one realistic Tripo island, loaded up front
let world = null;
let playerSlot = 'red';
const island = () => world;
const player = () => island()?.player || null;

function choosePlayer(slotId) {
  const isl = island(); if (!isl) return;
  const a = isl.actors.find((x) => x.slot.id === slotId) || isl.actors[0];
  if (!a) return;
  playerSlot = a.slot.id; isl.setPlayer(a); fire.clear();
  follow.snap({ x: a.mover.x, y: a.flight.alt, z: a.mover.z });
}
function swap() {
  const list = island()?.actors; if (!list || list.length < 2) return;
  const i = list.indexOf(player());
  choosePlayer(list[(i + 1) % list.length].slot.id); refreshButtons();
}
function refreshButtons() {
  const p = player(), list = island()?.actors || [];
  ui.swap.hidden = list.length < 2;
  ui.swap.querySelector('.dots').innerHTML = list.map((a) => `<i class="${a === p ? 'cur' : ''}" style="background:${a.slot.color}"></i>`).join('');
  ui.fly.hidden = !p || !p.canFly();
  ui.fire.hidden = !p || !p.canFire();
  const up = p && (p.state === 'fly' || p.state === 'takeoff') && !p.wantLand;
  ui.fly.querySelector('.lb').textContent = up ? 'Land' : 'Fly';
  ui.fly.querySelector('.ico').innerHTML = iconX(up ? 'land' : 'feather');
  ui.fly.classList.toggle('on', !!up);
}
const press = (fn) => (e) => { e.preventDefault(); fn(); refreshButtons(); };
ui.swap.addEventListener('click', press(swap));
ui.fly.addEventListener('click', press(() => player()?.toggleFly()));
ui.fire.addEventListener('click', press(() => player()?.fire()));
addEventListener('keydown', (e) => {
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') run = true;
  if (!world || e.repeat) return;
  const act = {
    Space: () => player()?.toggleFly(),
    KeyF: () => player()?.fire(),
    KeyQ: swap,
  }[e.code];
  if (act) { e.preventDefault(); act(); refreshButtons(); }
});
addEventListener('keyup', (e) => { if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') run = false; });
addEventListener('blur', () => { run = false; });

// input relative to the camera; the stick runs when pushed far
const fwd = new THREE.Vector3();
function moveInput() {
  const k = keys.vector(), x = joy.active ? joy.x : k.x, y = joy.active ? joy.y : k.y;
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const fast = joy.active ? Math.hypot(joy.x, joy.y) > 0.85 : run;
  return { x: -fwd.z * x + fwd.x * y, z: fwd.x * x + fwd.z * y, run: fast };
}

loadWorld(MANIFEST, SLOTS).then((w) => {
  world = w;
  scene.add(w.group);
  document.body.classList.add('ready');
  choosePlayer(playerSlot);
  refreshButtons();
}).catch((err) => console.error('dragon island failed to load', err));

const timer = new THREE.Clock();
const kick = new THREE.Vector3();
let lastState = '';
renderer.setAnimationLoop(() => {
  const dt = Math.min(timer.getDelta(), 0.1);
  const isl = island();
  if (isl) {
    const m = moveInput(), p = player();
    isl.update(dt, m);
    fire.emit(dt, p?.dragon);
    if (p) {
      follow.update(dt, { x: p.mover.x, y: p.flight.alt, z: p.mover.z }, { x: p.mover.vx, z: p.mover.vz });
      sun.target.position.set(p.mover.x, 0, p.mover.z); sun.position.copy(sun.target.position).add(SUN_OFFSET);
      if (p.state !== lastState) { lastState = p.state; refreshButtons(); }
    }
    if (Math.hypot(m.x, m.z) > 0.1 && (movedFor += dt) > 4) ui.hint.classList.add('off');
  }
  fire.update(dt);
  controls.update();
  fire.shake(kick, dt); camera.position.add(kick);   // fire kick: applied for this render only
  renderer.render(scene, camera);
  camera.position.sub(kick);
});

// QA handles, only with ?test=1 (the page itself never reads window.__dr)
if (new URLSearchParams(location.search).get('test') === '1') window.__dr = {
  get island() { return world; },
  player, fire, kick, camera, controls, renderer, SLOTS,
  isLoaded: () => !!world,
  pairGaps() {
    const isl = world; if (!isl) return [];
    const a = isl.actors, pairs = [];
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      const A = a[i], B = a[j], d = Math.hypot(A.mover.x - B.mover.x, A.mover.z - B.mover.z), need = A.mover.bodyR + B.mover.bodyR;
      pairs.push({ a: A.slot.id, b: B.slot.id, d, need, ok: d + 1e-6 >= need, ra: A.mover.bodyR, rb: B.mover.bodyR, footA: A.dragon.footprint, footB: B.dragon.footprint });
    }
    return pairs;
  },
};
