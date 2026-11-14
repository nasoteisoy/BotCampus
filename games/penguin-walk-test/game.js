// Penguin Walk Test: agent-made character (TRELLIS -> Blender clay restyle -> procedural rig) on a toon island.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const Q = new URLSearchParams(location.search), AUTOTEST = Q.has('autotest');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: AUTOTEST });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#bfe3ef'); scene.fog = new THREE.Fog('#bfe3ef', 22, 48);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
scene.add(new THREE.HemisphereLight('#fff6e8', '#9cc7c9', 1.6));
const sun = new THREE.DirectionalLight('#fff1dc', 2.2); sun.position.set(6, 12, 5); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 }); sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// toon ramp (3 soft steps): clay-toy look, no outlines (parts-library RULES.md)
const ramp = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]), 3, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
const toon = (o) => o.traverse((m) => {
  if (!m.isMesh) return; m.castShadow = m.receiveShadow = true;
  const src = m.material; m.material = new THREE.MeshToonMaterial({ color: src.color, map: src.map || null, gradientMap: ramp });
});
const tmat = (hex) => new THREE.MeshToonMaterial({ color: hex, gradientMap: ramp });

// island: grass top, sand rim, water with bobbing
const R = 9;
const grass = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.3, 0.5, 48), tmat('#9fd18f')); grass.position.y = -0.25; grass.receiveShadow = true;
const sand = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.3, R + 2.2, 0.5, 48), tmat('#f6dcb0')); sand.position.y = -0.42; sand.receiveShadow = true;
const water = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshToonMaterial({ color: '#7cc8d8', gradientMap: ramp, transparent: true, opacity: 0.92 }));
water.rotation.x = -Math.PI / 2; water.position.y = -0.55; scene.add(grass, sand, water);
for (let i = 0; i < 26; i++) { // grass tufts
  const a = Math.random() * 6.28, r = 2 + Math.random() * (R - 2.5);
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), tmat(i % 2 ? '#6dae6b' : '#86c27a')); t.position.set(Math.cos(a) * r, 0.15, Math.sin(a) * r); scene.add(t);
}

const colliders = []; // {x,z,r}
const coins = []; let score = 0;
const $ = (id) => document.getElementById(id);
const keys = {}; addEventListener('keydown', (e) => { keys[e.code] = true; hideHint(); }); addEventListener('keyup', (e) => keys[e.code] = false);
let hintT = setTimeout(hideHint, 6000); function hideHint() { $('hint').style.opacity = 0; clearTimeout(hintT); }

// touch joystick
const stick = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
if (matchMedia('(pointer: coarse)').matches || AUTOTEST) $('stick').style.display = 'block';
const knob = $('knob');
addEventListener('pointerdown', (e) => {
  if (e.target.closest('.ib')) return; if (e.pointerType === 'mouse' && !AUTOTEST) return;
  $('stick').style.display = 'block'; hideHint(); stick.id = e.pointerId; const r = $('stick').getBoundingClientRect();
  const inStick = e.clientX < innerWidth / 2; stick.cx = inStick && e.clientY > innerHeight / 2 ? r.left + 65 : e.clientX; stick.cy = inStick && e.clientY > innerHeight / 2 ? r.top + 65 : e.clientY; move(e);
});
addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) move(e); });
const end = (e) => { if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; } };
addEventListener('pointerup', end); addEventListener('pointercancel', end);
function move(e) { let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy; const l = Math.hypot(dx, dy), m = 45; if (l > m) { dx *= m / l; dy *= m / l; } stick.x = dx / m; stick.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`; }
$('fs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());

const loader = new GLTFLoader();
const [peng, props] = await Promise.all([loader.loadAsync('./assets/penguin.glb'), loader.loadAsync('./assets/props.glb')]);
const player = new THREE.Group(); const model = peng.scene; toon(model); model.scale.setScalar(1.7); player.add(model); scene.add(player);
const mixer = new THREE.AnimationMixer(model);
const clip = (n) => peng.animations.find((a) => a.name === n) || peng.animations[0];
const idle = mixer.clipAction(clip('Idle')).play(), walk = mixer.clipAction(clip('Walk')).play();
walk.setEffectiveWeight(0); let walkW = 0;
const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }));
shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.y = 0.01; player.add(shadowBlob);

// props from the Blender prop set (same clay palette)
const P = {}; props.scene.children.forEach((c) => (P[c.name] = c));
function place(name, x, z, s = 1.6, ry = Math.random() * 6.28, rad = 0.45) {
  const o = skClone(P[name]); o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s); toon(o); scene.add(o);
  if (rad) colliders.push({ x, z, r: rad * s / 1.6 }); return o;
}
[[-5.5, -3.5, 2.2], [-3.2, -6.2, 1.9], [5.8, -4.2, 2.3], [6.6, 1.6, 1.8], [-6.8, 2.4, 2.0], [1.2, -7.3, 1.7]].forEach(([x, z, s]) => place('tree', x, z, s, undefined, 0.5));
place('rocks', 3.5, 4.8, 1.8, 0.4, 0.6); place('rocks', -2.6, 6.3, 1.4, 2, 0.5);
place('crate', -3.2, 1.1, 1.6, 0.3); place('barrel', -2.3, 2.1, 1.6, 0, 0.4); place('mushroom', 2.4, -2.6, 1.8, 0, 0.35);
place('mushroom', -7.2, -1.0, 1.4, 1, 0.3); place('lantern', 1.6, 2.4, 1.7, 0, 0.25); place('signpost', 0.4, -1.6, 1.7, -0.5, 0.25);
const coinSpots = [[4.2, 0.2], [-1.0, -4.2], [-5.6, 0.0], [2.6, 6.8], [7.0, -1.4], [-4.5, 4.8], [3.4, -5.6], [-0.6, 3.6]];
const coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 24); coinGeo.rotateX(Math.PI / 2);
const coinMat = tmat('#f2c14e');
for (const [x, z] of coinSpots) { const c = new THREE.Mesh(coinGeo, coinMat); c.position.set(x, 0.55, z); c.castShadow = true; scene.add(c); coins.push(c); }
$('total').textContent = coins.length;
function reset() { player.position.set(0, 0, 2.2); player.rotation.y = 0; score = 0; $('score').textContent = 0; coins.forEach((c) => (c.visible = true)); $('win').style.display = 'none'; }
$('reset').onclick = reset; reset();
$('load').remove();

const camOff = new THREE.Vector3(0, 4.4, 6.6), camPos = new THREE.Vector3(), look = new THREE.Vector3();
camera.position.copy(player.position).addScaledVector(camOff, camera.aspect < 1 ? 1.55 : 1);
const clock = new THREE.Clock(); let t = 0, autoT = 0;
window.__game = { get pos() { return player.position.toArray(); }, get score() { return score; }, get walk() { return walkW; }, anims: peng.animations.map((a) => a.name), frames: 0 };
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05); t += dt;
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.x;
  let iz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + stick.y;
  if (AUTOTEST) { autoT += dt; ix = Math.cos(autoT * 0.6); iz = -Math.sin(autoT * 0.6) * 0.8; }
  const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
  const mag = Math.min(1, l), speed = 3.2 * mag;
  if (mag > 0.05) {
    const nx = player.position.x + ix * speed * dt, nz = player.position.z + iz * speed * dt;
    const p = new THREE.Vector2(nx, nz);
    for (const c of colliders) { const d = p.distanceTo(new THREE.Vector2(c.x, c.z)), m = c.r + 0.45; if (d < m) p.sub(new THREE.Vector2(c.x, c.z)).setLength(m).add(new THREE.Vector2(c.x, c.z)); }
    if (p.length() > R - 0.5) p.setLength(R - 0.5);
    player.position.x = p.x; player.position.z = p.y;
    const target = Math.atan2(ix, iz); let d = target - player.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); player.rotation.y += d * Math.min(1, dt * 12);
  }
  walkW += ((mag > 0.05 ? 1 : 0) - walkW) * Math.min(1, dt * 8);
  walk.setEffectiveWeight(walkW); idle.setEffectiveWeight(1 - walkW); walk.timeScale = 0.6 + 1.2 * mag;
  mixer.update(dt);
  for (const c of coins) if (c.visible) {
    c.rotation.y += dt * 3; c.position.y = 0.55 + Math.sin(t * 3 + c.position.x) * 0.08;
    if (Math.hypot(c.position.x - player.position.x, c.position.z - player.position.z) < 0.7) {
      c.visible = false; score++; $('score').textContent = score; $('hud').animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], 250);
      if (score === coins.length) $('win').style.display = 'grid';
    }
  }
  water.position.y = -0.55 + Math.sin(t * 1.2) * 0.04;
  camPos.copy(player.position).addScaledVector(camOff, camera.aspect < 1 ? 1.55 : 1); camera.position.lerp(camPos, Math.min(1, dt * 4));
  look.copy(player.position).setY(0.6); camera.lookAt(look);
  sun.position.set(player.position.x + 6, 12, player.position.z + 5); sun.target.position.copy(player.position);
  renderer.render(scene, camera); window.__game.frames++;
  requestAnimationFrame(tick);
}
tick();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
