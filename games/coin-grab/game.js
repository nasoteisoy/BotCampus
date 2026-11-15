// Coin Grab: 2-4 players, one screen, no reading. Cast = agent-made 3D characters (AI 3D -> Blender clay restyle -> free Blender rigs).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const Q = new URLSearchParams(location.search), AUTOTEST = Q.has('autotest');
const ROUND = Number(Q.get('t')) || 45;
const $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#bfe3ef'); scene.fog = new THREE.Fog('#bfe3ef', 30, 60);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 120);
scene.add(new THREE.HemisphereLight('#fff6e8', '#9cc7c9', 1.6));
const sun = new THREE.DirectionalLight('#fff1dc', 2.2); sun.position.set(6, 14, 6); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 }); sun.shadow.bias = -0.0005; scene.add(sun);
const ramp = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]), 3, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
const toon = (o) => o.traverse((m) => { if (!m.isMesh) return; m.castShadow = m.receiveShadow = true; const s = m.material; m.material = new THREE.MeshToonMaterial({ color: s.color, map: s.map || null, gradientMap: ramp }); });
const tmat = (hex) => new THREE.MeshToonMaterial({ color: hex, gradientMap: ramp });

const R = 8.5;
const grass = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.3, 0.5, 56), tmat('#9fd18f')); grass.position.y = -0.25; grass.receiveShadow = true;
const sand = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.3, R + 2.2, 0.5, 56), tmat('#f6dcb0')); sand.position.y = -0.42; sand.receiveShadow = true;
const water = new THREE.Mesh(new THREE.CircleGeometry(70, 64), new THREE.MeshToonMaterial({ color: '#7cc8d8', gradientMap: ramp })); water.rotation.x = -Math.PI / 2; water.position.y = -0.55;
scene.add(grass, sand, water);
for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, r = 1.5 + Math.random() * (R - 2); const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 5), tmat(i % 2 ? '#6dae6b' : '#86c27a')); t.position.set(Math.cos(a) * r, 0.15, Math.sin(a) * r); scene.add(t); }

const COLORS = ['#e5604d', '#4f8fe0', '#5fbf5a', '#f2a93b'];
const CAST = [
  { id: 'penguin', file: './assets/penguin.glb', h: 2.0 },
  { id: 'girl', file: './assets/girl.glb', h: 2.2 },
  { id: 'axolotl', file: './assets/axolotl.glb', h: 1.5 },
  { id: 'redpanda', file: './assets/redpanda.glb', h: 1.45 },
];
const KEYS = [['KeyW', 'KeyA', 'KeyS', 'KeyD'], ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'], ['KeyI', 'KeyJ', 'KeyK', 'KeyL'], ['Numpad8', 'Numpad4', 'Numpad5', 'Numpad6']];
const keys = {}; addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); }); addEventListener('keyup', (e) => (keys[e.code] = false));
// corners: 2 players sit left/right at the bottom; 3-4 players use all four corners
const CORNERS = (n) => (n <= 2 ? ['bl', 'br'] : ['bl', 'br', 'tl', 'tr']);

const loader = new GLTFLoader();
const [props, ...glbs] = await Promise.all([loader.loadAsync('./assets/props.glb'), ...CAST.map((c) => loader.loadAsync(c.file))]);
const P = {}; props.scene.children.forEach((c) => (P[c.name] = c));
const colliders = [];
function place(name, x, z, s = 1.6, rad = 0.45) { const o = skClone(P[name]); o.position.set(x, 0, z); o.rotation.y = Math.random() * 6.28; o.scale.setScalar(s); toon(o); scene.add(o); if (rad) colliders.push({ x, z, r: rad * s / 1.6 }); }
[[-6.2, -3.2, 2.0], [5.9, -3.8, 2.1], [-6.4, 3.4, 1.9], [6.3, 3.0, 1.8]].forEach(([x, z, s]) => place('tree', x, z, s, 0.5));
place('rocks', 0.2, -5.6, 1.6, 0.6); place('rocks', 0.6, 5.9, 1.3, 0.5); place('mushroom', -2.8, 0.4, 1.6, 0.35); place('mushroom', 3.0, -0.6, 1.5, 0.35); place('barrel', -1.0, -2.6, 1.5, 0.4); place('crate', 1.6, 2.6, 1.5, 0.45);

// coins
const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.09, 24); coinGeo.rotateX(Math.PI / 2);
const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.24 : 0.55; i ? starShape.lineTo(Math.cos(a) * r, -Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, -Math.sin(a) * r); }
const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }); starGeo.center();
const coinMat = tmat('#f2c14e'), starMat = tmat('#ffd23f');
const coins = [];
function freeSpot() {
  for (let k = 0; k < 50; k++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * (R - 1.2), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + 0.7) && coins.every((c) => !c.visible || Math.hypot(c.position.x - x, c.position.z - z) > 1.2)) return [x, z]; }
  return [0, 0];
}
function spawn(big = false) { const c = new THREE.Mesh(big ? starGeo : coinGeo, big ? starMat : coinMat); c.castShadow = true; c.userData.v = big ? 3 : 1; const [x, z] = freeSpot(); c.position.set(x, 0.6, z); c.scale.setScalar(0.01); c.userData.born = 0; scene.add(c); coins.push(c); return c; }
// pickup sparkles
const sparks = [];
function burst(x, z, col) { for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: col })); s.position.set(x, 0.7, z); s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 5, 3 + Math.random() * 3, (Math.random() - 0.5) * 5); s.userData.t = 0.6; scene.add(s); sparks.push(s); } }

// players
let players = [], state = 'menu', n = 0, timeLeft = ROUND, goT = 0;
function makePlayer(i) {
  const c = CAST[i], g = glbs[i], m = skClone(g.scene); toon(m);
  const box = new THREE.Box3().setFromObject(m); m.scale.setScalar(c.h / (box.max.y - box.min.y));
  const grp = new THREE.Group(); grp.add(m); scene.add(grp);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.86, 32), new THREE.MeshBasicMaterial({ color: COLORS[i] })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; grp.add(ring);
  const mx = new THREE.AnimationMixer(m); const clip = (nm) => g.animations.find((a) => a.name === nm);
  const idle = clip('Idle') ? mx.clipAction(clip('Idle')).play() : null, walk = clip('Walk') ? mx.clipAction(clip('Walk')).play() : null; walk?.setEffectiveWeight(0);
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4; grp.position.set(Math.cos(a) * 3, 0, Math.sin(a) * 3); grp.rotation.y = Math.atan2(-grp.position.x, -grp.position.z);
  return { i, id: c.id, grp, m, mx, idle, walk, walkW: 0, score: 0, joy: { x: 0, y: 0 }, anims: g.animations.map((a) => a.name), bump: 0 };
}
function buildHud() {
  $('hud').innerHTML = ''; $('joys').innerHTML = '';
  const cs = CORNERS(n), pos = { bl: 'bottom:10px;left:10px', br: 'bottom:10px;right:10px', tl: 'top:66px;left:10px', tr: 'top:66px;right:10px' };
  const jpos = { bl: 'left:18px;bottom:76px', br: 'right:18px;bottom:76px', tl: 'left:18px;top:124px', tr: 'right:18px;top:124px' };
  const touch = matchMedia('(pointer: coarse)').matches || AUTOTEST || Q.has('touch');
  players.forEach((p, i) => {
    const ch = document.createElement('div'); ch.className = 'chip'; ch.style.cssText = pos[cs[i]] + `;border-color:${COLORS[i]}`;
    ch.innerHTML = `<img src="./assets/icons/${p.id}.webp" alt=""><span>0</span>`; $('hud').appendChild(ch); p.chip = ch;
    const j = document.createElement('div'); j.className = 'joy'; j.style.cssText = jpos[cs[i]] + `;border-color:${COLORS[i]};display:${touch ? 'block' : 'none'}`; j.innerHTML = '<i></i>'; $('joys').appendChild(j); p.joyEl = j;
    const k = j.firstChild; let id = null, cx = 0, cy = 0;
    const mv = (e) => { let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy), mm = 44; if (l > mm) { dx *= mm / l; dy *= mm / l; } p.joy.x = dx / mm; p.joy.y = dy / mm; k.style.transform = `translate(${dx}px,${dy}px)`; };
    j.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; j.setPointerCapture?.(id); const r = j.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; mv(e); });
    j.addEventListener('pointermove', (e) => { if (e.pointerId === id) mv(e); });
    const up = (e) => { if (e.pointerId !== id) return; id = null; p.joy.x = p.joy.y = 0; k.style.transform = ''; };
    j.addEventListener('pointerup', up); j.addEventListener('pointercancel', up);
  });
}
// player-count picker: groups of 2, 3, 4 character faces (no words)
[2, 3, 4].forEach((k) => {
  const b = document.createElement('button'); b.className = 'pc'; b.setAttribute('aria-label', k + ' players'); b.dataset.n = k;
  b.innerHTML = CAST.slice(0, k).map((c, i) => `<img src="./assets/icons/${c.id}.webp" style="border-color:${COLORS[i]}" alt="">`).join('');
  b.onclick = () => start(k); $('counts').appendChild(b);
});
function start(k) {
  players.forEach((p) => scene.remove(p.grp)); coins.forEach((c) => scene.remove(c)); coins.length = 0;
  n = k; players = Array.from({ length: n }, (_, i) => makePlayer(i)); buildHud();
  for (let i = 0; i < 6; i++) spawn().scale.setScalar(1);
  timeLeft = ROUND; goT = 3.0; state = 'go'; $('menu').style.display = 'none'; $('end').style.display = 'none';
}
function finish() {
  state = 'end'; const order = [...players].sort((a, b) => b.score - a.score), top = order[0].score;
  $('podium').innerHTML = order.map((p, r) => `<div><img src="./assets/icons/${p.id}.webp" style="border-color:${COLORS[p.i]}" alt="">${p.score}<b style="height:${[70, 48, 32, 20][r]}px;background:${COLORS[p.i]}"></b></div>`).join('');
  players.forEach((p) => { p.win = p.score === top; }); $('end').style.display = 'grid';
}
$('again').onclick = () => start(n); $('home').onclick = () => { state = 'menu'; $('menu').style.display = 'grid'; $('end').style.display = 'none'; };
$('fs').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
$('load').remove();

const clock = new THREE.Clock(); let t = 0, starT = 6;
const v2 = new THREE.Vector2();
window.__game = { get state() { return state; }, get n() { return n; }, frames: 0, get time() { return timeLeft; }, start,
  get players() { return players.map((p) => ({ id: p.id, pos: p.grp.position.toArray().map((v) => +v.toFixed(2)), score: p.score, anims: p.anims, walk: +p.walkW.toFixed(2) })); } };
function input(p) {
  const k = KEYS[p.i]; let ix = (keys[k[3]] ? 1 : 0) - (keys[k[1]] ? 1 : 0) + p.joy.x, iz = (keys[k[2]] ? 1 : 0) - (keys[k[0]] ? 1 : 0) + p.joy.y;
  if (p.i === 3) iz += keys.Numpad2 ? 1 : 0;
  if (AUTOTEST && !Q.has('human')) { let best = null, bd = 1e9; for (const c of coins) if (c.visible) { const d = Math.hypot(c.position.x - p.grp.position.x, c.position.z - p.grp.position.z) * (c.userData.v > 1 ? 0.5 : 1) + p.i * 0.3; if (d < bd) { bd = d; best = c; } }
    if (best) { ix = best.position.x - p.grp.position.x; iz = best.position.z - p.grp.position.z; } }
  return [ix, iz];
}
// camera fits the whole island in any aspect (phones in portrait get a wider lens + steeper angle)
function fitCam() {
  const portrait = camera.aspect < 1; camera.fov = portrait ? 62 : 42; camera.updateProjectionMatrix();
  const vh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), hh = vh * camera.aspect, rad = portrait ? 8.9 : 9.6;
  const d = Math.max(rad / hh, (rad * 0.85) / vh) * 1.02, el = portrait ? 1.05 : 0.9;   // elevation angle (rad)
  camera.position.set(0, Math.sin(el) * d, Math.cos(el) * d); camera.lookAt(0, 0, portrait ? 0.6 : 0.9);
  scene.fog.near = d + 5; scene.fog.far = d + 40;
}
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05); t += dt;
  if (state === 'go') { goT -= dt; const g = $('go'); g.style.display = goT > 0 ? 'grid' : 'none'; g.textContent = goT > 0.01 ? Math.ceil(goT) : ''; if (goT <= 0) state = 'play'; }
  if (state === 'play') { timeLeft -= dt; starT -= dt; if (starT <= 0) { spawn(true); starT = 7 + Math.random() * 4; } if (timeLeft <= 0) { timeLeft = 0; finish(); } }
  $('pie').setAttribute('stroke-dasharray', `${(62.83 * (state === 'menu' ? 1 : timeLeft / ROUND)).toFixed(2)} 62.83`);
  for (const p of players) {
    let [ix, iz] = state === 'play' ? input(p) : [0, 0]; const l = Math.hypot(ix, iz); if (l > 1) { ix /= l; iz /= l; }
    const mag = Math.min(1, l), sp = 4.2 * mag, pos = p.grp.position;
    if (mag > 0.08) {
      v2.set(pos.x + ix * sp * dt, pos.z + iz * sp * dt);
      for (const c of colliders) { const d = Math.hypot(v2.x - c.x, v2.y - c.z), m = c.r + 0.45; if (d < m) v2.sub({ x: c.x, y: c.z }).setLength(m).add({ x: c.x, y: c.z }); }
      if (v2.length() > R - 0.5) v2.setLength(R - 0.5); pos.x = v2.x; pos.z = v2.y;
      let d = Math.atan2(ix, iz) - p.grp.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); p.grp.rotation.y += d * Math.min(1, dt * 12);
    }
    for (const o of players) if (o !== p) { const dx = pos.x - o.grp.position.x, dz = pos.z - o.grp.position.z, d = Math.hypot(dx, dz); if (d < 1.1 && d > 1e-4) { const push = (1.1 - d) / 2; pos.x += dx / d * push; pos.z += dz / d * push; } }
    p.walkW += ((mag > 0.08 ? 1 : 0) - p.walkW) * Math.min(1, dt * 8);
    p.walk?.setEffectiveWeight(p.walkW); p.idle?.setEffectiveWeight(1 - p.walkW); if (p.walk) p.walk.timeScale = 0.7 + 1.1 * mag; p.mx.update(dt);
    p.m.position.y = (state === 'end' && p.win) ? Math.abs(Math.sin(t * 7)) * 0.5 : Math.abs(Math.sin(t * 11)) * 0.04 * p.walkW;
    if (state === 'play') for (const c of coins) if (c.visible && c.scale.x > 0.6 && Math.hypot(c.position.x - pos.x, c.position.z - pos.z) < 0.85) {
      c.visible = false; p.score += c.userData.v; p.chip.lastChild.textContent = p.score; p.chip.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], 260); burst(c.position.x, c.position.z, COLORS[p.i]);
      if (c.userData.v === 1) setTimeout(() => { const [x, z] = freeSpot(); c.position.set(x, 0.6, z); c.scale.setScalar(0.01); c.visible = true; }, 700);
    }
  }
  if (players.length) { const top = Math.max(...players.map((p) => p.score)); players.forEach((p) => p.chip.classList.toggle('lead', top > 0 && p.score === top)); }
  for (const c of coins) if (c.visible) { c.rotation.y += dt * 3; c.position.y = 0.6 + Math.sin(t * 3 + c.position.x) * 0.08; if (c.scale.x < 1) c.scale.setScalar(Math.min(1, c.scale.x + dt * 3)); }
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.userData.t -= dt; s.userData.v.y -= 12 * dt; s.position.addScaledVector(s.userData.v, dt); if (s.userData.t <= 0) { scene.remove(s); sparks.splice(i, 1); } }
  water.position.y = -0.55 + Math.sin(t * 1.2) * 0.04;
  fitCam();
  renderer.render(scene, camera); window.__game.frames++;
  requestAnimationFrame(tick);
}
tick();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
if (Q.get('n')) start(Number(Q.get('n')));
