import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const BG = 0x0c3d4e;
const ISLAND_RADIUS = 2.7;
const PLAYER_RADIUS = 0.28;
const WALK_SPEED = 2.15;
const INTERACT_RANGE = 1.5;
const CHEST = { x: 0.5, z: -0.25 };
const SPAWN = { x: -1.45, z: 0.35 };
const FACE_OFFSET = 0; // tuned after first visual if needed
const CAM_HEIGHT = 5.2;
const CAM_BACK = 9.6;
const CAM_LOOK_Y = 0.7;
const CAM_SMOOTH = 6.5;
const MIN_CAM_DIST = 1.6;

// One lookup table drives color, chime pitch, camera shake, and item name.
export const RARITY = {
  common:    { key: 'common',    label: 'Common',    item: 'Worn Coin',      color: 0xcfd2d6, css: '#cfd2d6', pitch: 1.00, shake: 0.10, notes: 2, weight: 50 },
  rare:      { key: 'rare',      label: 'Rare',      item: 'Azure Charm',    color: 0x3d8dff, css: '#3d8dff', pitch: 1.25, shake: 0.20, notes: 3, weight: 30 },
  epic:      { key: 'epic',      label: 'Epic',      item: 'Void Relic',     color: 0xa855ff, css: '#a855ff', pitch: 1.55, shake: 0.34, notes: 4, weight: 15 },
  legendary: { key: 'legendary', label: 'Legendary', item: 'Sunforged Idol', color: 0xffc21a, css: '#ffc21a', pitch: 1.90, shake: 0.50, notes: 5, weight: 5  },
};
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
const WEIGHT_SUM = RARITY_ORDER.reduce((s, k) => s + RARITY[k].weight, 0);

const TEST = new URLSearchParams(location.search).has('test');
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const canvas = document.getElementById('c');
const overlay = document.getElementById('overlay');
const input = createInput(document.getElementById('ui'));
const audio = createAudio();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setClearColor(BG, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
const clock = new THREE.Clock();

const hemi = new THREE.HemisphereLight(0x8ed4e2, 0x1a2a22, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e6, 2.2);
sun.position.set(6.5, 10, 7.5);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x4aa0b8, 0.35);
fill.position.set(-4, 3, -6);
scene.add(fill);

addStars();

const raycaster = new THREE.Raycaster();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _fwd = new THREE.Vector3();

let explorerRig = null;
let chestMixer = null;
let chestAction = null;
let bones = {};
let boneRest = {};
let colliders = [];
let occluders = [];
let fxNodes = [];
let sparklePoints = null;
let opened = false;
let currentRarity = null;
let forcedRarity = null;
let walkPhase = 0;
let facing = -0.61; // start yaw ≈ -35°
let trauma = 0;
let camPos = new THREE.Vector3(SPAWN.x, CAM_HEIGHT, SPAWN.z + CAM_BACK);
let lookTarget = new THREE.Vector3(SPAWN.x, CAM_LOOK_Y, SPAWN.z);
let fps = 0;
let fpsFrames = 0;
let fpsAcc = 0;
let closeup = false;
let ready = false;
let lastNear = false;

const testMove = { x: 0, y: 0, until: 0 };

function addStars() {
  const n = 500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const v = Math.random();
    const r = 40 + Math.random() * 50;
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xe8f4ff, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false });
  scene.add(new THREE.Points(g, m));
}

function rollRarity() {
  if (forcedRarity && RARITY[forcedRarity]) {
    const t = RARITY[forcedRarity];
    forcedRarity = null;
    return t;
  }
  let r = Math.random() * WEIGHT_SUM;
  for (const k of RARITY_ORDER) {
    r -= RARITY[k].weight;
    if (r <= 0) return RARITY[k];
  }
  return RARITY.common;
}

function flattenMats(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.flatShading = true;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.needsUpdate = true;
    }
  });
}

function collectColliders(root) {
  const solid = /^(Pillar_|Torch_Left$|Torch_Right$|Chest_Base|FallenColumn|StoneBlock|Rock_)/;
  const skipTiny = 0.12;
  root.traverse((o) => {
    if (!o.isMesh || !solid.test(o.name)) return;
    const box = new THREE.Box3().setFromObject(o);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const radius = Math.max(size.x, size.z) * 0.48;
    if (radius < skipTiny && !/^Torch_|Chest_Base/.test(o.name)) return;
    const r = Math.max(radius, /^Torch_/.test(o.name) ? 0.14 : 0.16);
    colliders.push({ name: o.name, x: center.x, z: center.z, r, obj: o });
    occluders.push(o);
  });
}

function collectFX(root) {
  const names = ['FX_Beam', 'FX_BeamCore', 'FX_GroundRing', 'FX_GroundGlow', 'FX_Sparkles'];
  for (const n of names) {
    const obj = root.getObjectByName(n);
    if (!obj) continue;
    obj.visible = false;
    fxNodes.push(obj);
  }
  const cone = root.getObjectByName('Cone');
  if (cone) cone.visible = false;
}

function tintFX(hex) {
  const c = new THREE.Color(hex);
  for (const obj of fxNodes) {
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        mat.color.copy(c);
        if (mat.emissive) mat.emissive.copy(c);
        mat.transparent = true;
        mat.depthWrite = false;
        mat.needsUpdate = true;
      }
    });
    obj.visible = true;
  }
}

function hideFX() {
  for (const obj of fxNodes) obj.visible = false;
  if (sparklePoints) sparklePoints.visible = false;
}

function buildSparkles() {
  const n = 48;
  const pos = new Float32Array(n * 3);
  const seeds = [];
  for (let i = 0; i < n; i++) {
    seeds.push({
      a: Math.random() * Math.PI * 2,
      r: 0.2 + Math.random() * 0.85,
      y: Math.random() * 2.4,
      s: 0.4 + Math.random() * 1.2,
    });
    pos[i * 3] = CHEST.x;
    pos[i * 3 + 1] = 0.2;
    pos[i * 3 + 2] = CHEST.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.08,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
  });
  sparklePoints = new THREE.Points(g, m);
  sparklePoints.visible = false;
  sparklePoints.userData.seeds = seeds;
  scene.add(sparklePoints);
}

function updateSparkles(elapsed, hex) {
  if (!sparklePoints || !sparklePoints.visible) return;
  sparklePoints.material.color.setHex(hex);
  const pos = sparklePoints.geometry.attributes.position;
  const seeds = sparklePoints.userData.seeds;
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const y = (s.y + elapsed * s.s) % 2.8;
    const a = s.a + elapsed * 0.8;
    pos.setXYZ(i, CHEST.x + Math.cos(a) * s.r * (0.6 + y * 0.15), 0.15 + y, CHEST.z + Math.sin(a) * s.r * (0.6 + y * 0.15));
  }
  pos.needsUpdate = true;
}

function cacheBones(root) {
  const names = ['root', 'spine', 'neck', 'head', 'arm_L', 'arm_R', 'hand_L', 'hand_R', 'leg_L', 'leg_R', 'foot_L', 'foot_R'];
  root.traverse((o) => {
    if (names.includes(o.name)) {
      bones[o.name] = o;
      boneRest[o.name] = o.quaternion.clone();
    }
  });
}

function applyWaddle(moving, speed, dt) {
  const ease = reducedMotion ? 0.25 : 1;
  if (moving) {
    walkPhase += dt * 7.2 * Math.max(0.6, speed);
  } else {
    // decay phase contribution
    walkPhase += dt * 0.5;
  }
  const amt = moving ? ease : Math.max(0, (bones._idle ?? 1) * 0.0);
  const targetAmt = moving ? 1 : 0;
  bones._amt = THREE.MathUtils.damp(bones._amt ?? 0, targetAmt, 10, dt);
  const a = (bones._amt || 0) * ease;
  const swing = Math.sin(walkPhase) * 0.42 * a;
  const swing2 = Math.sin(walkPhase + Math.PI) * 0.42 * a;
  const bob = Math.abs(Math.sin(walkPhase)) * 0.035 * a;

  function addSwing(name, angle, axis) {
    const b = bones[name];
    const rest = boneRest[name];
    if (!b || !rest) return;
    _q.setFromAxisAngle(axis, angle);
    b.quaternion.copy(rest).multiply(_q);
  }
  const ax = _fwd.set(1, 0, 0);
  const az = _v2.set(0, 0, 1);
  addSwing('leg_L', swing, ax);
  addSwing('leg_R', swing2, ax);
  addSwing('foot_L', -swing * 0.45, ax);
  addSwing('foot_R', -swing2 * 0.45, ax);
  addSwing('arm_L', swing2 * 0.7, ax);
  addSwing('arm_R', swing * 0.7, ax);
  addSwing('spine', Math.sin(walkPhase) * 0.06 * a, az);
  addSwing('root', 0, ax);
  if (explorerRig) explorerRig.position.y = bob;
}

function resolveMove(px, pz, dx, dz) {
  let nx = px + dx;
  let nz = pz + dz;
  // Axis-separated circle vs circle so a blocked axis can still slide
  function hitX(x, z) {
    for (const c of colliders) {
      const need = c.r + PLAYER_RADIUS;
      const hx = x - c.x;
      const hz = z - c.z;
      const d2 = hx * hx + hz * hz;
      if (d2 < need * need && d2 > 1e-8) return true;
    }
    return false;
  }
  if (hitX(nx, pz)) nx = px;
  if (hitX(nx, nz)) nz = pz;
  // Push out if still overlapping (spawn / corner cases)
  for (let i = 0; i < 4; i++) {
    let pushed = false;
    for (const c of colliders) {
      const need = c.r + PLAYER_RADIUS;
      const hx = nx - c.x;
      const hz = nz - c.z;
      const d = Math.hypot(hx, hz);
      if (d < need && d > 1e-6) {
        const k = need / d;
        nx = c.x + hx * k;
        nz = c.z + hz * k;
        pushed = true;
      } else if (d <= 1e-6) {
        nx = c.x + need;
        nz = c.z;
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  const dist = Math.hypot(nx, nz);
  if (dist > ISLAND_RADIUS) {
    const k = ISLAND_RADIUS / dist;
    nx *= k;
    nz *= k;
  }
  return { x: nx, z: nz };
}

function nearChest(x, z) {
  return Math.hypot(x - CHEST.x, z - CHEST.z) <= INTERACT_RANGE;
}

function openChest(tierKey) {
  if (opened) return currentRarity;
  if (tierKey && RARITY[tierKey]) forcedRarity = tierKey;
  const tier = rollRarity();
  opened = true;
  currentRarity = tier;
  if (chestAction) {
    chestAction.reset();
    chestAction.setLoop(THREE.LoopOnce, 1);
    chestAction.clampWhenFinished = true;
    chestAction.paused = false;
    chestAction.play();
  }
  tintFX(tier.color);
  if (sparklePoints) {
    sparklePoints.visible = !reducedMotion;
    sparklePoints.userData.t0 = clock.elapsedTime;
  }
  // Beam pop
  for (const obj of fxNodes) {
    if (obj.name === 'FX_Beam' || obj.name === 'FX_BeamCore') {
      obj.scale.set(1, 0.05, 1);
    } else if (obj.name === 'FX_GroundRing' || obj.name === 'FX_GroundGlow') {
      obj.scale.set(0.2, 1, 0.2);
    }
  }
  trauma = reducedMotion ? 0 : tier.shake;
  input.slamItem(tier.key, tier.label, tier.item, tier.css);
  audio.chime(tier.pitch, tier.notes);
  return tier;
}

function resetChest() {
  opened = false;
  currentRarity = null;
  if (chestAction) {
    chestAction.stop();
    chestAction.reset();
    chestAction.time = 0;
    chestAction.paused = true;
    chestAction.play();
    chestAction.paused = true;
    chestMixer?.setTime(0);
  }
  hideFX();
  input.hideItem();
  trauma = 0;
}

function updateFX(dt, elapsed) {
  if (!opened || !currentRarity) return;
  for (const obj of fxNodes) {
    if (!obj.visible) continue;
    if (obj.name === 'FX_Beam' || obj.name === 'FX_BeamCore') {
      const y = THREE.MathUtils.damp(obj.scale.y, 1, 5, dt);
      obj.scale.set(1, y, 1);
    } else if (obj.name === 'FX_GroundRing') {
      const s = 0.85 + Math.sin(elapsed * 3) * 0.12;
      obj.scale.set(s, 1, s);
      obj.rotation.y += dt * 0.6;
    } else if (obj.name === 'FX_GroundGlow') {
      const s = 1 + Math.sin(elapsed * 2.2) * 0.08;
      obj.scale.set(s, 1, s);
    } else if (obj.name === 'FX_Sparkles') {
      obj.rotation.y += dt * 0.8;
    }
  }
  const t0 = sparklePoints?.userData.t0 ?? elapsed;
  updateSparkles(elapsed - t0, currentRarity.color);
}

function updateCamera(dt, px, pz) {
  const desired = _v.set(px * 0.35, CAM_HEIGHT, CAM_BACK + pz * 0.22);
  if (closeup) {
    const yaw = facing + FACE_OFFSET;
    // stand in front of the raccoon, chest height
    desired.set(
      px + Math.sin(yaw) * 2.4,
      1.15,
      pz + Math.cos(yaw) * 2.4,
    );
  }
  const look = _v2.set(closeup ? px : px * 0.55, closeup ? 0.72 : CAM_LOOK_Y, closeup ? pz : pz * 0.4);
  if (!closeup) {
    const origin = look.clone();
    const dir = desired.clone().sub(origin);
    const dist = dir.length();
    if (dist > 0.001) {
      dir.multiplyScalar(1 / dist);
      raycaster.far = dist;
      raycaster.near = 0.2;
      raycaster.set(origin, dir);
      const hits = raycaster.intersectObjects(occluders, true);
      if (hits.length) {
        const d = Math.max(MIN_CAM_DIST, hits[0].distance - 0.28);
        desired.copy(origin).addScaledVector(dir, d);
      }
    }
  }
  const k = 1 - Math.exp(-CAM_SMOOTH * dt);
  camPos.lerp(desired, closeup ? 1 : k);
  lookTarget.lerp(look, closeup ? 1 : k);

  // Trauma^2 shake as additive offset (does not drive the follow target)
  trauma = Math.max(0, trauma - dt * 1.35);
  const shake = trauma * trauma;
  let ox = 0, oy = 0, oz = 0;
  if (shake > 0.0001 && !reducedMotion) {
    ox = (Math.random() * 2 - 1) * shake * 0.55;
    oy = (Math.random() * 2 - 1) * shake * 0.4;
    oz = (Math.random() * 2 - 1) * shake * 0.55;
  }
  camera.position.set(camPos.x + ox, camPos.y + oy, camPos.z + oz);
  camera.lookAt(lookTarget);
}

function flickerTorches(t) {
  scene.traverse((o) => {
    if (o.name && /Flame$/.test(o.name)) {
      const s = 0.92 + Math.sin(t * 11 + o.id) * 0.08;
      o.scale.setScalar(s);
    }
  });
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // portrait: slightly wider / pulled framing so HUD doesn't cover the raccoon
  camera.fov = h > w ? 44 : 40;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

function onFirstGesture() {
  audio.unlock();
}
window.addEventListener('pointerdown', onFirstGesture, { once: false });
window.addEventListener('keydown', onFirstGesture, { once: false });

function hookApi() {
  if (!TEST) return;
  window.__loot = {
    ready: () => ready,
    getState: () => ({
      x: explorerRig ? explorerRig.position.x : 0,
      z: explorerRig ? explorerRig.position.z : 0,
      y: explorerRig ? explorerRig.position.y : 0,
      facing,
      near: explorerRig ? nearChest(explorerRig.position.x, explorerRig.position.z) : false,
      opened,
      rarity: currentRarity ? currentRarity.key : null,
      islandRadius: ISLAND_RADIUS,
      fps,
      closeup,
    }),
    setPos: (x, z) => {
      if (!explorerRig) return;
      const p = resolveMove(x, z, 0, 0);
      explorerRig.position.x = p.x;
      explorerRig.position.z = p.z;
    },
    setMove: (x, y, seconds = 0.4) => {
      testMove.x = x;
      testMove.y = y;
      testMove.until = clock.elapsedTime + seconds;
    },
    open: (tier) => openChest(tier),
    reset: () => resetChest(),
    forceRarity: (tier) => { forcedRarity = tier; },
    setCloseup: (v) => { closeup = !!v; },
    setFacing: (y) => {
      facing = y;
      if (explorerRig) explorerRig.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing + FACE_OFFSET);
    },
    rarityTable: RARITY,
    colliders: () => colliders.map((c) => ({ name: c.name, x: c.x, z: c.z, r: c.r })),
  };
}

async function boot() {
  hookApi();
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('./glb/loot_scene_full.glb');
  const root = gltf.scene;
  flattenMats(root);
  scene.add(root);

  explorerRig = root.getObjectByName('ExplorerRig');
  if (!explorerRig) throw new Error('ExplorerRig missing');
  explorerRig.position.set(SPAWN.x, 0, SPAWN.z);
  facing = -0.61;
  explorerRig.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing + FACE_OFFSET);

  cacheBones(explorerRig);
  collectColliders(root);
  collectFX(root);
  buildSparkles();

  if (gltf.animations && gltf.animations.length) {
    chestMixer = new THREE.AnimationMixer(root);
    const clip = THREE.AnimationClip.findByName(gltf.animations, 'Chest_Open') || gltf.animations[0];
    chestAction = chestMixer.clipAction(clip);
    chestAction.setLoop(THREE.LoopOnce, 1);
    chestAction.clampWhenFinished = true;
    chestAction.play();
    chestAction.paused = true;
    chestAction.time = 0;
    chestMixer.setTime(0);
  }

  // Warm torch glow
  const tL = root.getObjectByName('Torch_Left');
  const tR = root.getObjectByName('Torch_Right');
  if (tL) {
    const p = new THREE.PointLight(0xff9a3a, 1.4, 5);
    p.position.set(0, 1.55, 0);
    tL.add(p);
  }
  if (tR) {
    const p = new THREE.PointLight(0xff9a3a, 1.4, 5);
    p.position.set(0, 1.45, 0);
    tR.add(p);
  }

  ready = true;
  if (overlay) overlay.classList.add('gone');
  if (TEST && window.__loot) window.__loot.ready = () => true;

  renderer.setAnimationLoop(tick);
}

function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;
  const st = input.sample();

  let mx = st.moveX;
  let my = st.moveY;
  if (TEST && clock.elapsedTime < testMove.until) {
    mx = testMove.x;
    my = testMove.y;
  }

  if (explorerRig) {
    // Screen basis matches the hero camera (sits on +Z): W / stick up = -Z, D = +X.
    // Use a fixed basis so closeup / collision pull-in cannot invert controls.
    const wishX = mx;
    const wishZ = -my;
    const mag = Math.hypot(wishX, wishZ);
    const moving = mag > 0.05;
    if (moving) {
      const inv = 1 / mag;
      const dx = wishX * inv * WALK_SPEED * dt;
      const dz = wishZ * inv * WALK_SPEED * dt;
      const p = resolveMove(explorerRig.position.x, explorerRig.position.z, dx, dz);
      explorerRig.position.x = p.x;
      explorerRig.position.z = p.z;
      const yaw = Math.atan2(wishX, wishZ);
      const tau = 1 - Math.exp(-10 * dt);
      // shortest angle lerp
      let d = yaw - facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      facing += d * tau;
      facing = Math.atan2(Math.sin(facing), Math.cos(facing));
      explorerRig.quaternion.setFromAxisAngle(_v.set(0, 1, 0), facing + FACE_OFFSET);
    }
    applyWaddle(moving, mag, dt);

    const near = nearChest(explorerRig.position.x, explorerRig.position.z);
    input.setPrompt(near && !opened);
    if (near && !opened && st.interactPressed) openChest();
    if (st.resetPressed) resetChest();
    lastNear = near;

    updateCamera(dt, explorerRig.position.x, explorerRig.position.z);
  }

  if (chestMixer) chestMixer.update(dt);
  updateFX(dt, elapsed);
  flickerTorches(elapsed);

  renderer.render(scene, camera);
  canvas.__scene = scene;
  canvas.__camera = camera;

  fpsFrames += 1;
  fpsAcc += dt;
  if (fpsAcc >= 0.5) {
    fps = fpsFrames / fpsAcc;
    fpsFrames = 0;
    fpsAcc = 0;
    const el = document.getElementById('fps');
    if (el && TEST) {
      el.hidden = false;
      el.textContent = `${fps.toFixed(0)} fps`;
    }
  }
}

boot().catch((err) => {
  console.error(err);
  if (overlay) overlay.textContent = 'Failed to load scene';
});
