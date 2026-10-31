/**
 * Map planet layer: one THREE canvas, procedural biome textures,
 * atmosphere glow, slow spin. Positions synced to DOM % coords.
 */
import { PLANETS, BIOME_TEX, planetPos } from './galaxy.js';

let THREE = null;
let renderer = null, scene = null, camera = null;
let stageEl = null, canvas = null;
let meshes = new Map(); // id -> { root, planet, atmo }
let raf = 0;
let running = false;
let layout = 'portrait';
let owners = {};

function makeTex(biome) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const t = BIOME_TEX[biome] || BIOME_TEX.rock;
  const grd = g.createLinearGradient(0, 0, 256, 128);
  grd.addColorStop(0, t.c); grd.addColorStop(0.45, t.b); grd.addColorStop(1, t.a);
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  // noise bands / continents
  for (let i = 0; i < 40; i++) {
    g.fillStyle = i % 2 ? t.a : t.c;
    g.globalAlpha = 0.22 + Math.random() * 0.25;
    const x = Math.random() * 256, y = Math.random() * 128;
    const rw = 20 + Math.random() * 60, rh = 8 + Math.random() * 30;
    g.beginPath();
    g.ellipse(x, y, rw, rh, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // polar caps for ice/ocean
  if (biome === 'ice' || biome === 'ocean') {
    g.fillStyle = '#f2fbff'; g.globalAlpha = 0.55;
    g.fillRect(0, 0, 256, 14); g.fillRect(0, 114, 256, 14);
    g.globalAlpha = 1;
  }
  if (biome === 'lava') {
    g.strokeStyle = '#ffea80'; g.globalAlpha = 0.5; g.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.moveTo(Math.random() * 256, Math.random() * 128);
      g.quadraticCurveTo(Math.random() * 256, Math.random() * 128, Math.random() * 256, Math.random() * 128);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
  tex.needsUpdate = true;
  return tex;
}

async function ensureThree() {
  if (THREE) return THREE;
  const mod = await import('../vendor/three.module.min.js');
  THREE = mod.default || mod;
  return THREE;
}

function buildPlanet(p) {
  const root = new THREE.Group();
  const tex = makeTex(p.biome);
  const geo = new THREE.SphereGeometry(1, 32, 24);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.85, metalness: 0.05,
  });
  const planet = new THREE.Mesh(geo, mat);
  root.add(planet);

  const atmoGeo = new THREE.SphereGeometry(1.12, 24, 16);
  const col = new THREE.Color(BIOME_TEX[p.biome]?.a || '#88a');
  const atmoMat = new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity: 0.22,
    side: THREE.BackSide, depthWrite: false,
  });
  const atmo = new THREE.Mesh(atmoGeo, atmoMat);
  root.add(atmo);

  // soft halo sprite via second shell
  const haloGeo = new THREE.SphereGeometry(1.22, 16, 12);
  const haloMat = new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity: 0.1,
    side: THREE.BackSide, depthWrite: false,
  });
  root.add(new THREE.Mesh(haloGeo, haloMat));

  return { root, planet, atmo, size: p.size };
}

function syncPositions() {
  if (!stageEl || !camera) return;
  const w = stageEl.clientWidth || 1;
  const h = stageEl.clientHeight || 1;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  // Orthographic-like framing: map % → NDC-ish world units
  // Camera looks at z, planets at z=0. World x in [-aspect*vh, …], y in [-vh, vh]
  const viewH = 10;
  const viewW = viewH * (w / h);
  for (const p of PLANETS) {
    const m = meshes.get(p.id);
    if (!m) continue;
    const pos = planetPos(p, layout);
    const x = ((pos.x / 100) - 0.5) * 2 * viewW * 0.92;
    const y = (0.5 - (pos.y / 100)) * 2 * viewH * 0.92;
    const base = 0.55 + p.size * 0.18;
    // scale relative to view so spheres ~ match DOM orb size (~56-72px)
    const targetPx = 28 + p.size * 10;
    const worldPerPxY = (2 * viewH) / h;
    const s = (targetPx * worldPerPxY) / 2;
    m.root.position.set(x, y, 0);
    m.root.scale.setScalar(Math.max(s, base * 0.35));
  }
  camera.left = -viewW; camera.right = viewW;
  camera.top = viewH; camera.bottom = -viewH;
  camera.updateProjectionMatrix();
}

function tick() {
  if (!running) return;
  raf = requestAnimationFrame(tick);
  const t = performance.now() * 0.001;
  for (const [, m] of meshes) {
    m.planet.rotation.y = t * 0.25;
    m.atmo.rotation.y = t * 0.12;
  }
  renderer.render(scene, camera);
}

export async function mountPlanets3d(stage, { layout: lay = 'portrait', owners: own = {} } = {}) {
  stageEl = stage;
  layout = lay;
  owners = own || {};
  await ensureThree();

  let c = stage.querySelector('#planets3d');
  if (!c) {
    c = document.createElement('canvas');
    c.id = 'planets3d';
    c.className = 'planets3d';
    c.setAttribute('aria-hidden', 'true');
    stage.insertBefore(c, stage.firstChild);
  }
  canvas = c;

  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 50);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d = new THREE.DirectionalLight(0xffffff, 1.05);
    d.position.set(4, 6, 8); scene.add(d);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
    fill.position.set(-5, -2, 4); scene.add(fill);

    for (const p of PLANETS) {
      const m = buildPlanet(p);
      meshes.set(p.id, m);
      scene.add(m.root);
    }
  }

  syncPositions();
  if (!running) { running = true; tick(); }
  return { sync: syncPositions, setLayout(l) { layout = l; syncPositions(); }, stop };
}

export function setPlanetOwners(own) {
  owners = own || {};
  // tint atmosphere slightly by owner (optional ring handled in DOM)
}

export function stopPlanets3d() {
  running = false;
  cancelAnimationFrame(raf);
}

export function resizePlanets3d() {
  syncPositions();
}
