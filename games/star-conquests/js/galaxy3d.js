/**
 * Full 3D Galactic Conquest map.
 * Textured biome spheres, additive lanes, OrbitControls,
 * 3D fleet ships orbiting planets, fly-along-lane tween, HTML labels, raycast pick.
 */
import { PLANETS, LINKS, BIOME_TEX, BIOME_COLOR, planetById, neighbors } from './galaxy.js';
import { PLAYER, ENEMY, COLORS, planetHasFleet, fleetShipType } from './state.js';

const TMP_V = { x: 0, y: 0, z: 0 };

function biomeTexture(THREE, biome) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const t = BIOME_TEX[biome] || BIOME_TEX.rock;
  const grd = g.createLinearGradient(0, 0, 256, 128);
  grd.addColorStop(0, t.c); grd.addColorStop(0.4, t.b); grd.addColorStop(1, t.a);
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 48; i++) {
    g.globalAlpha = 0.2 + Math.random() * 0.3;
    g.fillStyle = i % 2 ? t.a : t.c;
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 128, 15 + Math.random() * 50, 6 + Math.random() * 24, Math.random() * 3, 0, 6.28);
    g.fill();
  }
  g.globalAlpha = 1;
  if (biome === 'ice' || biome === 'ocean') {
    g.fillStyle = '#eef8ff'; g.globalAlpha = 0.5;
    g.fillRect(0, 0, 256, 12); g.fillRect(0, 116, 256, 12); g.globalAlpha = 1;
  }
  if (biome === 'lava') {
    g.strokeStyle = '#ffd080'; g.lineWidth = 2; g.globalAlpha = 0.55;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      g.moveTo(Math.random() * 256, Math.random() * 128);
      g.quadraticCurveTo(Math.random() * 256, Math.random() * 128, Math.random() * 256, Math.random() * 128);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Spread planets on a gentle 3D arc so spheres + labels don't pile up. */
function layout3d() {
  const out = {};
  const n = PLANETS.length;
  for (let i = 0; i < n; i++) {
    const p = PLANETS[i];
    // two-row spiral in XZ with Y variance
    const row = i < 5 ? 0 : 1;
    const col = i % 5;
    const x = (col - 2) * 3.6 + (row ? 1.2 : 0);
    const z = row * 4.2 - 2.0;
    const y = Math.sin(i * 1.3) * 0.9 + (p.size - 2) * 0.15;
    out[p.id] = { x, y, z, r: 0.55 + p.size * 0.22 };
  }
  // Override with hand-tuned non-overlap positions
  // Compact span so portrait phone frames all 10 without pan
  Object.assign(out, {
    // Wide oval — rings never intersect (min center dist > rA+rB+0.9)
    solara:  { x: -7.2, y: 0.4, z:  1.2, r: 0.95 },
    frost:   { x: -3.8, y: 1.6, z: -3.6, r: 0.72 },
    verdant: { x: -5.4, y: -1.2, z:  5.0, r: 0.88 },
    ember:   { x: -0.6, y: 0.8, z: -0.4, r: 0.88 },
    basin:   { x:  1.4, y: -1.4, z:  4.6, r: 1.05 },
    granite: { x:  2.2, y: 1.8, z: -4.0, r: 0.68 },
    tide:    { x:  4.0, y: 0.2, z:  1.0, r: 0.72 },
    cinder:  { x:  6.2, y: -1.2, z:  4.8, r: 0.88 },
    glacier: { x:  5.8, y: 1.6, z: -3.2, r: 0.88 },
    nexus:   { x:  8.4, y: 0.1, z:  0.8, r: 1.15 },
  });
  return out;
}

export function createGalaxy3d(stageEl, hooks = {}) {
  const api = {
    ready: false,
    error: null,
    select: null,
    destroy() {},
    refresh() {},
    flyTo() {},
    flyFleet() { return Promise.resolve(); },
    setDim() {},
    projectLabels() {},
  };

  let THREE, OrbitControls;
  let renderer, scene, camera, controls;
  let planetMeshes = new Map(); // id -> { mesh, atmo, glow, pos, r }
  let fleetMeshes = new Map(); // planetId -> { root, ring, angle, shipType, owner }
  let laneLines = [];
  const basePositions = layout3d();
  let positions = {};
  for (const id of Object.keys(basePositions)) {
    const b = basePositions[id];
    positions[id] = { x: b.x, y: b.y, z: b.z, r: b.r };
  }
  let layoutPortrait = null; // null = unset; true/false after first sync
  let landFleetFitted = false;
  let raf = 0, running = false;
  let raycaster, pointer;
  let labelRoot, labels = new Map();
  let stateRef = null;
  let highlight = new Set();
  let dimOthers = false;
  let selectedId = null;
  let fitted = false;
  let idleDist = 18;
  let labelScale = 1;
  let landResolveTick = 0;
  let flyAnimToken = 0;
  let flying = null; // { mesh, from, to, t, dur, resolve }

  const fail = (msg) => {
    api.error = msg;
    api.ready = false;
    stageEl.innerHTML = `<div class="webgl-fail"><b>3D map unavailable</b><p>${msg}</p></div>`;
    hooks.onError?.(msg);
  };

  async function init() {
    try {
      const mod = await import('../vendor/three.module.min.js');
      THREE = mod.default || mod;
      const oc = await import('../vendor/addons/controls/OrbitControls.js');
      OrbitControls = oc.OrbitControls;
    } catch (e) {
      fail('Could not load WebGL libraries.');
      return api;
    }

    // Clear 2D leftovers
    stageEl.querySelectorAll('#map-world,#map-svg,#planets,#planets3d').forEach((n) => n.remove());

    let canvas = stageEl.querySelector('#galaxy3d-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'galaxy3d-canvas';
      canvas.className = 'galaxy3d-canvas';
      stageEl.prepend(canvas);
    }
    labelRoot = stageEl.querySelector('#galaxy-labels');
    if (!labelRoot) {
      labelRoot = document.createElement('div');
      labelRoot.id = 'galaxy-labels';
      labelRoot.className = 'galaxy-labels';
      stageEl.appendChild(labelRoot);
    }

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      fail('WebGL context failed. Try another browser.');
      return api;
    }
    renderer.setClearColor(0x05071a, 1);
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05071a, 0.018);

    camera = new THREE.PerspectiveCamera(46, 1, 0.1, 220);
    // ~35° tilt from horizontal (polar ≈ 55° from +Y)
    camera.position.set(0.6, 10.5, 15.0);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 64;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minPolarAngle = Math.PI * 0.18;
    controls.target.set(0.5, 0, 0.4);
    controls.update();

    scene.add(new THREE.AmbientLight(0x8899bb, 0.55));
    const sun = new THREE.DirectionalLight(0xfff0dd, 1.15);
    sun.position.set(8, 14, 6); scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6688ff, 0.35);
    fill.position.set(-10, -4, -6); scene.add(fill);

    // Starfield
    {
      const g = new THREE.BufferGeometry();
      const n = 800; const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = (Math.random() - 0.5) * 80;
        arr[i * 3 + 1] = (Math.random() - 0.5) * 40;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 80;
      }
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.7 })));
    }

    // Planets
    for (const p of PLANETS) {
      const pos = positions[p.id];
      const tex = biomeTexture(THREE, p.biome);
      const geo = new THREE.SphereGeometry(pos.r, 36, 28);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.08 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData.planetId = p.id;
      scene.add(mesh);

      const col = new THREE.Color(BIOME_COLOR[p.biome] || '#888');
      const atmo = new THREE.Mesh(
        new THREE.SphereGeometry(pos.r * 1.12, 24, 16),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.2, side: THREE.BackSide, depthWrite: false }),
      );
      atmo.position.copy(mesh.position);
      scene.add(atmo);

      // Owner ring (updated in refresh)
      const glow = new THREE.Mesh(
        new THREE.TorusGeometry(pos.r * 1.35, 0.04, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 }),
      );
      glow.rotation.x = Math.PI / 2;
      glow.position.copy(mesh.position);
      scene.add(glow);

      planetMeshes.set(p.id, { mesh, atmo, glow, pos, r: pos.r, mat });
    }

    // Lanes
    for (const [a, b] of LINKS) {
      const A = positions[a], B = positions[b];
      const pts = [
        new THREE.Vector3(A.x, A.y, A.z),
        new THREE.Vector3((A.x + B.x) / 2, (A.y + B.y) / 2 + 0.6, (A.z + B.z) / 2),
        new THREE.Vector3(B.x, B.y, B.z),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.03, 6, false),
        new THREE.MeshBasicMaterial({
          color: 0x4fd1ff, transparent: true, opacity: 0.35,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      tube.userData = { a, b, curve, baseOpacity: 0.35 };
      scene.add(tube);
      laneLines.push(tube);
    }

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    // Labels
    for (const p of PLANETS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'g3-label';
      el.dataset.id = p.id;
      el.innerHTML = `<span class="g3-name">${p.name}</span><span class="g3-badge hidden">0</span><span class="g3-fleet-tag hidden">Your fleet</span><span class="g3-tap hidden">Tap</span>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        hooks.onSelect?.(p.id);
      });
      labelRoot.appendChild(el);
      labels.set(p.id, el);
    }

    const onPointer = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
      const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
      pointer.x = (x / rect.width) * 2 - 1;
      pointer.y = -(y / rect.height) * 2 + 1;
    };
    let downX = 0, downY = 0, downT = 0;
    canvas.addEventListener('pointerdown', (e) => {
      downX = e.clientX; downY = e.clientY; downT = performance.now();
      onPointer(e);
    });
    canvas.addEventListener('pointerup', (e) => {
      const dt = performance.now() - downT;
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dt > 450 || dist > 8) return; // drag / orbit
      onPointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...planetMeshes.values()].map((m) => m.mesh), false);
      if (hits.length) {
        hooks.onSelect?.(hits[0].object.userData.planetId);
      } else {
        hooks.onEmpty?.();
      }
    });

    const ro = new ResizeObserver(() => resize());
    ro.observe(stageEl);
    resize();

    running = true;
    api.ready = true;
    if (typeof window !== 'undefined') {
      window.__scGalaxy = api;
      if (window.__scTest) {
        window.__scTest.assertMapArtClearOfButtons = () => api.assertMapArtClearOfButtons?.();
        window.__scTest.safeBox = () => api.safeBox?.();
      }
    }
    tick();
    hooks.onReady?.();
    return api;
  }


  function chromeInsets() {
    const canvas = renderer?.domElement;
    if (!canvas) return { top: 0, bottom: 0, left: 0, right: 0, freeW: 1, freeH: 1, cw: 1, ch: 1 };
    const cr = canvas.getBoundingClientRect();
    let top = 0, bottom = 0, left = 0, right = 0;
    const guide = document.getElementById('guide-strip');
    if (guide) {
      const gr = guide.getBoundingClientRect();
      // guide sits above canvas usually; if it overlaps, count inset
      if (gr.bottom > cr.top && gr.top < cr.bottom) {
        top = Math.max(top, Math.min(gr.bottom, cr.bottom) - cr.top);
      }
    }
    const panel = document.getElementById('panel');
    if (panel && !panel.classList.contains('hidden')) {
      const pr = panel.getBoundingClientRect();
      if (pr.height > 0 && pr.top < cr.bottom && pr.bottom > cr.top) {
        bottom = Math.max(bottom, cr.bottom - Math.max(pr.top, cr.top));
      }
    }
    const floats = document.querySelector('.float-actions');
    if (floats && !floats.classList.contains('is-hidden') && !floats.classList.contains('hidden')) {
      const fr = floats.getBoundingClientRect();
      if (fr.height > 0 && fr.top < cr.bottom && fr.bottom > cr.top) {
        // Shop/End bar — free area ends at its top
        bottom = Math.max(bottom, cr.bottom - Math.max(fr.top, cr.top));
      }
    }
    const cw = Math.max(1, cr.width);
    const ch = Math.max(1, cr.height);
    const freeW = Math.max(40, cw - left - right);
    const freeH = Math.max(40, ch - top - bottom);
    return { top, bottom, left, right, freeW, freeH, cw, ch };
  }

  function freeFovs() {
    const ins = chromeInsets();
    const vFull = (camera.fov * Math.PI) / 180;
    // Angular size of free rect inside the full canvas frustum
    const vFov = 2 * Math.atan(Math.tan(vFull / 2) * (ins.freeH / ins.ch));
    const hFov = 2 * Math.atan(Math.tan(vFull / 2) * (ins.freeW / ins.ch));
    return { vFov, hFov, ins };
  }

  function collectPoints(ids) {
    const list = (ids && ids.length) ? ids : Object.keys(positions);
    const pts = [];
    for (const id of list) {
      const p = positions[id];
      if (!p) continue;
      pts.push({ x: p.x, y: p.y, z: p.z, pad: p.r });
      // orbit ship ring extent
      const orb = p.r * 1.65;
      pts.push({ x: p.x + orb, y: p.y + 0.15, z: p.z, pad: 0.25 });
      pts.push({ x: p.x - orb, y: p.y + 0.15, z: p.z, pad: 0.25 });
      pts.push({ x: p.x, y: p.y + 0.15, z: p.z + orb, pad: 0.25 });
      pts.push({ x: p.x, y: p.y + 0.15, z: p.z - orb, pad: 0.25 });
      const fl = fleetMeshes.get(id);
      if (fl?.root) {
        const wp = fl.root.position;
        pts.push({ x: wp.x, y: wp.y, z: wp.z, pad: 0.35 });
      }
    }
    return pts;
  }

  function aabbOf(pts) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x - p.pad); maxX = Math.max(maxX, p.x + p.pad);
      minY = Math.min(minY, p.y - p.pad); maxY = Math.max(maxY, p.y + p.pad);
      minZ = Math.min(minZ, p.z - p.pad); maxZ = Math.max(maxZ, p.z + p.pad);
    }
    if (!Number.isFinite(minX)) {
      return { cx: 0, cy: 0, cz: 0, spanX: 8, spanY: 4, spanZ: 8, radius: 6 };
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    let radius = 0.5;
    for (const p of pts) {
      const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz) + p.pad;
      if (d > radius) radius = d;
    }
    return {
      cx, cy, cz,
      spanX: Math.max(1, maxX - minX),
      spanY: Math.max(1, maxY - minY),
      spanZ: Math.max(1, maxZ - minZ),
      radius,
    };
  }

  function isPortrait() {
    const a = camera?.aspect;
    if (a != null && a > 0) return a < 1;
    const w = stageEl?.clientWidth || 1;
    const h = stageEl?.clientHeight || 1;
    return w < h;
  }

  /** Short landscape phones (844x390 / 800x360). Not PC. */
  function isLandPhone() {
    if (isPortrait()) return false;
    const h = stageEl?.clientHeight || window.innerHeight || 999;
    return h <= 420;
  }

  /** Portrait: long axis (base X) → world Y (screen vertical). Landscape: unchanged. */
  function rebuildPositions() {
    const port = isPortrait();
    const land = !port && isLandPhone();
    for (const id of Object.keys(basePositions)) {
      const b = basePositions[id];
      if (port) {
        // (x,y,z) → (z, x*1.15, y): long axis top-to-bottom, slightly stretched for ~80% freeH
        positions[id] = { x: b.z * 0.75, y: b.x * 1.45, z: b.y * 0.5, r: Math.max(b.r * 1.35, 1.05) };
      } else if (land) {
        // Land phone: stretch for fill>=85% inside safe box (24px free inset + Shop/End exclusion)
        positions[id] = {
          x: b.x * 2.15,
          y: b.y * 0.72 + 0.35,
          z: b.z * 2.05,
          r: Math.max(b.r * 1.60, 1.15),
        };
      } else {
        // PC / wide landscape — identity (do not regress shot 16)
        positions[id] = { x: b.x, y: b.y, z: b.z, r: b.r };
      }
    }
    layoutPortrait = port;
  }

  function applyPositionsToScene() {
    if (!THREE || !planetMeshes.size) return;
    for (const [id, pm] of planetMeshes) {
      const p = positions[id];
      if (!p) continue;
      pm.pos = p;
      pm.r = p.r;
      pm.mesh.position.set(p.x, p.y, p.z);
      pm.mesh.scale.setScalar(1);
      pm.atmo.position.copy(pm.mesh.position);
      pm.atmo.scale.setScalar(1);
      pm.glow.position.copy(pm.mesh.position);
      pm.glow.scale.setScalar(1);
    }
    // Rebuild lanes so fly/pick use rotated endpoints
    for (const tube of laneLines) {
      scene.remove(tube);
      try { tube.geometry?.dispose(); } catch { /* */ }
      try { tube.material?.dispose(); } catch { /* */ }
    }
    laneLines.length = 0;
    for (const [a, b] of LINKS) {
      const A = positions[a], B = positions[b];
      if (!A || !B) continue;
      const pts = [
        new THREE.Vector3(A.x, A.y, A.z),
        new THREE.Vector3((A.x + B.x) / 2, (A.y + B.y) / 2 + 0.6, (A.z + B.z) / 2),
        new THREE.Vector3(B.x, B.y, B.z),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.03, 6, false),
        new THREE.MeshBasicMaterial({
          color: 0x4fd1ff, transparent: true, opacity: 0.35,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      tube.userData = { a, b, curve, baseOpacity: 0.35 };
      scene.add(tube);
      laneLines.push(tube);
    }
  }

  /** Projected planet diameter in CSS px (canvas space). */
  function planetDiamPx(id) {
    const p = positions[id];
    if (!p || !THREE) return 0;
    const r = (planetMeshes.get(id)?.r) || p.r;
    const a = projectWorld(p.x - r, p.y, p.z);
    const b = projectWorld(p.x + r, p.y, p.z);
    if (!a.ok || !b.ok) {
      const c = projectWorld(p.x, p.y, p.z);
      const d = projectWorld(p.x, p.y + r, p.z);
      if (!c.ok || !d.ok) return 0;
      return Math.hypot(d.x - c.x, d.y - c.y) * 2;
    }
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  /** Scale meshes so every planet projects >= minPx diameter (portrait or landscape). */
  function ensurePortraitPlanetSize(minPx = 44) {
    if (!planetMeshes.size) return;
    for (const [id, pm] of planetMeshes) {
      const diam = planetDiamPx(id);
      if (diam < 1) continue;
      if (diam + 0.05 < minPx) {
        const s = (pm.mesh.scale.x || 1) * ((minPx + 1) / diam);
        pm.mesh.scale.setScalar(s);
        pm.atmo.scale.setScalar(s);
        pm.glow.scale.setScalar(s);
        const base = positions[id]?.r || pm.r;
        pm.r = base * s;
      }
    }
  }

  function assertPlanetMinPx(minPx = 44) {
    const misses = [];
    for (const id of Object.keys(positions)) {
      const d = planetDiamPx(id);
      if (d + 0.05 < minPx) misses.push({ id, diam: Math.round(d * 10) / 10 });
    }
    return { ok: misses.length === 0, misses, minPx };
  }

  function assertLabelGap(minGap = 8) {
    const rects = [];
    for (const [id, el] of labels) {
      if (!el || el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      rects.push({ id, L: r.left, R: r.right, T: r.top, B: r.bottom });
    }
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        // Expand by minGap/2 each side ⇒ require >= minGap clear gap
        const hit = !(a.R + minGap <= b.L || b.R + minGap <= a.L
          || a.B + minGap <= b.T || b.B + minGap <= a.T);
        if (hit) {
          const sepX = a.R < b.L ? b.L - a.R : (b.R < a.L ? a.L - b.R : 0);
          const sepY = a.B < b.T ? b.T - a.B : (b.B < a.T ? a.T - b.B : 0);
          overlaps.push({ a: a.id, b: b.id, sepX: Math.round(sepX), sepY: Math.round(sepY) });
        }
      }
    }
    return { ok: overlaps.length === 0, overlaps, minGap };
  }

  function placeCam(cx, cy, cz, dist, elevRad, yPan = 0, xPan = 0) {
    // ~35° default; no yaw/x bias — bbox must stay centered in free rect
    let elev = elevRad != null ? elevRad : Math.PI / 5.2;
    const ins = chromeInsets();
    if (elevRad == null && isLandPhone()) {
      // Landscape phone: flatter elev so X/Z stretch fills free WIDTH
      elev = ins.cw / Math.max(1, ins.freeH) > 2.4 ? Math.PI / 9 : Math.PI / 7; // ~20° / ~26°
    }
    // Portrait: flatter elev so world-Y (long galaxy axis) fills screen height
    if (elevRad == null && isPortrait()) elev = Math.PI / 7.5; // ~24°
    controls.target.set(cx, cy * 0.12, cz);
    camera.position.set(
      cx,
      cy + Math.sin(elev) * dist,
      cz + Math.cos(elev) * dist
    );
    // Equal world pan: +yPan moves content UP; +xPan moves content RIGHT on screen
    if (yPan) {
      camera.position.y -= yPan;
      controls.target.y -= yPan;
    }
    if (xPan) {
      camera.position.x -= xPan;
      controls.target.x -= xPan;
    }
    controls.update();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  function projectWorld(x, y, z) {
    const v = new THREE.Vector3(x, y, z);
    v.project(camera);
    const canvas = renderer.domElement;
    const cr = canvas.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * cr.width,
      y: (-v.y * 0.5 + 0.5) * cr.height,
      ndcZ: v.z,
      ok: v.z > -1 && v.z < 1,
    };
  }

  function visibleRect() {
    const ins = chromeInsets();
    return {
      left: ins.left,
      top: ins.top,
      right: ins.cw - ins.right,
      bottom: ins.ch - ins.bottom,
      width: ins.freeW,
      height: ins.freeH,
    };
  }

  function projectedSpan(pts) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      const s = projectWorld(p.x, p.y, p.z);
      if (!s.ok) continue;
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    if (!Number.isFinite(minX)) return { w: 1, h: 1 };
    return { w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }

  /** Idle free rect margins: ~10% bottom (clear Shop/End), small side/top. */
  function idleMargins(ins) {
    if (isLandPhone()) {
      // Lead: safe box = 24px in from every free edge
      return { left: 24, right: 24, top: 24, bottom: 24 };
    }
    const botFrac = isPortrait() ? 0.06 : 0.10;
    return {
      left: 12,
      right: 12,
      top: 10,
      bottom: Math.max(24, Math.round(ins.freeH * botFrac)),
    };
  }

  /** Free rect inset 24px; land also excludes Shop/End (.float-actions) + 12px. Canvas space. */
  function safeBox() {
    const ins = chromeInsets();
    const pad = isLandPhone() ? 24 : 12;
    let left = ins.left + pad;
    let top = ins.top + pad;
    let right = ins.cw - ins.right - pad;
    let bottom = ins.ch - ins.bottom - pad;
    if (isLandPhone()) {
      const floats = document.querySelector('.float-actions');
      if (floats && !floats.classList.contains('is-hidden') && !floats.classList.contains('hidden')) {
        const fr = floats.getBoundingClientRect();
        const cr = renderer?.domElement?.getBoundingClientRect?.() || { left: 0, top: 0 };
        const fL = fr.left - cr.left - 12;
        const fT = fr.top - cr.top - 12;
        // Shop/End sits bottom-right: shrink RIGHT always; shrink BOTTOM only if floats invade free rect
        if (fr.width > 0 && fr.height > 0) {
          right = Math.min(right, fL);
          if (fT < bottom) bottom = fT;
        }
      }
    }
    return {
      left, top, right, bottom,
      width: Math.max(40, right - left),
      height: Math.max(40, bottom - top),
      ins,
    };
  }

  function idleInnerRect() {
    if (isLandPhone()) return safeBox();
    const ins = chromeInsets();
    const m = idleMargins(ins);
    return {
      left: ins.left + m.left,
      top: ins.top + m.top,
      right: ins.cw - ins.right - m.right,
      bottom: ins.ch - ins.bottom - m.bottom,
      width: Math.max(40, ins.freeW - m.left - m.right),
      height: Math.max(40, ins.freeH - m.top - m.bottom),
      ins,
    };
  }

  /** Screen-space AABB of one fleet root (canvas coords). */
  function fleetScreenAabb(root) {
    if (!root || !THREE || !camera) return null;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return null;
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      const s = projectWorld(c.x, c.y, c.z);
      if (!s.ok) continue;
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, maxX, minY, maxY };
  }

  /** Union screen AABB of planets (with radius), fleet ships, and labels. Canvas space. */
  function mapArtScreenAabb() {
    const cr = renderer?.domElement?.getBoundingClientRect?.() || { left: 0, top: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const bump = (a, b, c, d) => {
      minX = Math.min(minX, a); maxX = Math.max(maxX, b);
      minY = Math.min(minY, c); maxY = Math.max(maxY, d);
    };
    for (const id of Object.keys(positions)) {
      const p = positions[id];
      if (!p) continue;
      const s = projectWorld(p.x, p.y, p.z);
      if (!s.ok) continue;
      const rad = Math.max(6, planetDiamPx(id) / 2);
      bump(s.x - rad, s.x + rad, s.y - rad, s.y + rad);
      const fl = fleetMeshes.get(id);
      if (fl?.root) {
        const fa = fleetScreenAabb(fl.root);
        if (fa) bump(fa.minX, fa.maxX, fa.minY, fa.maxY);
      }
    }
    for (const [, el] of labels) {
      if (!el || el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      bump(r.left - cr.left, r.right - cr.left, r.top - cr.top, r.bottom - cr.top);
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
  }

  /** Idle: all planets + rings/labels fill ~80% of free rect; nothing clipped. */
  function fitAll() {
    if (!camera || !controls || !THREE) return;
    flyAnimToken++;
    // Keep layout orientation in sync with aspect (portrait rotates long axis to Y)
    const portNow = isPortrait();
    // Rebuild on orientation flip, or every land-phone fit (stretch must stick)
    if (layoutPortrait !== portNow || isLandPhone()) {
      rebuildPositions();
      applyPositionsToScene();
    }
    const list = Object.keys(positions);
    const pts = [];
    for (const id of list) {
      const p = positions[id];
      if (!p) continue;
      // planet + owner ring (~1.35r) + label room above
      pts.push({ x: p.x, y: p.y, z: p.z, pad: p.r * 1.4 });
      pts.push({ x: p.x, y: p.y + p.r * 1.35, z: p.z, pad: 0.35 });
    }
    const box = aabbOf(pts);
    const vFull = (camera.fov * Math.PI) / 180;
    const aspect = Math.max(0.35, camera.aspect || 1);
    const hFull = 2 * Math.atan(Math.tan(vFull / 2) * aspect);
    const fill = 0.80;
    const portSeed = isPortrait();
    // Portrait: seed from vertical span so the tall galaxy fills ~80% free height
    let dist;
    if (portSeed) {
      const spanY = Math.max(box.spanY, box.spanZ * 0.5, 8);
      dist = (spanY / fill) / (2 * Math.tan(vFull / 2)) * 1.05;
      dist = Math.max(8, Math.min(40, dist));
    } else {
      const span = Math.max(box.spanX, box.spanZ, box.spanY * 1.15);
      let distV = (span / fill) / (2 * Math.tan(vFull / 2));
      let distH = (span / fill) / (2 * Math.tan(hFull / 2));
      dist = Math.max(distV, distH) * 1.1;
      dist = Math.max(9, Math.min(56, dist));
    }
    let cx = box.cx, cy = box.cy, cz = box.cz;
    placeCam(cx, cy, cz, dist);

    // Fill ~80% of inner free rect; portrait targets HEIGHT (~80% freeH)
    const port = isPortrait();
    if (!port) {
      // Seed only: pull closer on the WEAKER axis (dedicated landscape block finishes to 0.85)
      for (let i = 0; i < 8; i++) {
        const inner = idleInnerRect();
        const span2 = projectedSpan(pts);
        const fx = span2.w / Math.max(1, inner.width);
        const fy = span2.h / Math.max(1, inner.height);
        const fMin = Math.min(fx, fy);
        if (fMin >= 0.82) break;
        dist = Math.max(6.5, dist * Math.pow(Math.max(0.12, fMin) / 0.88, 0.9));
        placeCam(cx, cy, cz, dist);
      }
    } else {
      // Portrait: only pull closer toward ~82% freeH (never zoom out here)
      for (let i = 0; i < 8; i++) {
        const inner = idleInnerRect();
        const span2 = projectedSpan(pts);
        const fy = span2.h / Math.max(1, inner.height);
        if (fy >= 0.78) break;
        dist = Math.max(7, dist * Math.pow(Math.max(0.2, fy) / 0.82, 0.9));
        placeCam(cx, cy, cz, dist);
      }
    }

    // Containment: zoom out until planet centers sit in inner free rect (10% bottom margin).
    // No lateral pan — placeCam has zero yaw so bbox center == screen center.
    for (let i = 0; i < 12; i++) {
      const inner = idleInnerRect();
      let maxOut = 0;
      for (const id of list) {
        const p = positions[id];
        if (!p) continue;
        const s = projectWorld(p.x, p.y, p.z);
        if (!s.ok) { maxOut = Math.max(maxOut, 80); continue; }
        maxOut = Math.max(
          maxOut,
          inner.left - s.x,
          s.x - inner.right,
          inner.top - s.y,
          s.y - inner.bottom,
        );
      }
      if (maxOut <= 0) break;
      const cap = isPortrait() ? 40 : 58;
      dist = Math.min(cap, dist * (1 + Math.max(0.04, maxOut / Math.max(50, Math.min(inner.width, inner.height)))));
      placeCam(cx, cy, cz, dist);
    }
    // Labels reproject on next tick; force one now then ensure label rects fit horizontally
    projectLabels();
    for (let i = 0; i < 6; i++) {
      const inner = idleInnerRect();
      const canvas = renderer.domElement;
      const cr = canvas.getBoundingClientRect();
      let maxOut = 0;
      for (const [, el] of labels) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1) continue;
        const L = r.left - cr.left, R = r.right - cr.left;
        const B = r.bottom - cr.top;
        maxOut = Math.max(maxOut, inner.left - L, R - inner.right, B - inner.bottom);
      }
      if (maxOut <= 0) break;
      dist = Math.min(isPortrait() ? 40 : 58, dist * (1 + Math.max(0.03, maxOut / Math.max(60, inner.width))));
      placeCam(cx, cy, cz, dist);
      projectLabels();
    }

    // Landscape phone ONLY: safe box (24px free inset + Shop/End exclusion),
    // planet+ship+label fill >=85%, label gap >=16, larger fleets.
    projectLabels();
    if (isLandPhone()) {
      labelScale = 1;
      for (const [, el] of labels) {
        if (el) el.style.setProperty('--g3s', '1');
      }
      let yPan = 0;
      let xPan = 0;
      const seatInSafe = () => {
        for (let i = 0; i < 16; i++) {
          const sb = safeBox();
          const art = mapArtScreenAabb();
          if (!art) break;
          const outL = sb.left - art.minX;
          const outR = art.maxX - sb.right;
          const outT = sb.top - art.minY;
          const outB = art.maxY - sb.bottom;
          const maxOut = Math.max(0, outL, outR, outT, outB);
          if (maxOut <= 1.5 && assertMapArtClearOfButtons().ok) break;
          if (outB > 0) yPan += Math.max(0.3, outB * 0.07);
          if (outT > 0) yPan -= Math.max(0.3, outT * 0.07);
          if (outR > 0) xPan -= Math.max(0.3, outR * 0.07);
          if (outL > 0) xPan += Math.max(0.3, outL * 0.07);
          if (art.w > sb.width - 2 || art.h > sb.height - 2) {
            dist = Math.min(64, dist * (1 + Math.max(0.02, maxOut / Math.max(80, Math.min(sb.width, sb.height)))));
          }
          placeCam(cx, cy, cz, dist, undefined, yPan, xPan);
          ensurePortraitPlanetSize(36);
          resolveLabelOverlaps(16);
          rescaleAllFleetShips();
        }
      };
      // Seed: pull closer toward ~0.90 of safe box on weaker axis
      for (let i = 0; i < 14; i++) {
        const sb = safeBox();
        const art = mapArtScreenAabb() || { w: 1, h: 1, minX: 0, maxX: 1, minY: 0, maxY: 1 };
        const fx = art.w / Math.max(1, sb.width);
        const fy = art.h / Math.max(1, sb.height);
        if (fx >= 0.90 && fy >= 0.90 && fx <= 0.98 && fy <= 0.98) break;
        if (fx > 1.0 || fy > 1.0) dist = Math.min(64, dist * 1.04);
        else dist = Math.max(6.5, dist * Math.pow(Math.max(0.15, Math.min(fx, fy)) / 0.93, 0.8));
        placeCam(cx, cy, cz, dist, undefined, yPan, xPan);
        ensurePortraitPlanetSize(38);
      }
      ensurePortraitPlanetSize(36);
      rescaleAllFleetShips();
      resolveLabelOverlaps(16);
      seatInSafe();
      // Grow into safe slack until fill >= 0.88 both axes (margin over 0.85 bar)
      for (let i = 0; i < 16; i++) {
        const fill = assertIdleFill(0.88);
        if (fill.ok && assertLabelGap(16).ok) break;
        const sb = safeBox();
        const art = mapArtScreenAabb();
        if (!art) break;
        const leftSlack = art.minX - sb.left;
        const rightSlack = sb.right - art.maxX;
        const topSlack = art.minY - sb.top;
        const botSlack = sb.bottom - art.maxY;
        // Recenter into slack
        // +xPan moves content RIGHT; +yPan moves content UP — pan toward the larger slack
        if (leftSlack - rightSlack > 6) xPan -= (leftSlack - rightSlack) * 0.03;
        if (rightSlack - leftSlack > 6) xPan += (rightSlack - leftSlack) * 0.03;
        if (topSlack - botSlack > 6) yPan += (topSlack - botSlack) * 0.03;
        if (botSlack - topSlack > 6) yPan -= (botSlack - topSlack) * 0.03;
        placeCam(cx, cy, cz, dist, undefined, yPan, xPan);
        if (fill.fx < 0.88) {
          const side = Math.min(leftSlack, rightSlack);
          if (side > 4 || leftSlack + rightSlack > 20) {
            for (const id of Object.keys(positions)) {
              const p = positions[id];
              if (p) { p.x *= 1.06; p.z *= 1.04; }
            }
            applyPositionsToScene();
          } else {
            dist = Math.max(6.5, dist * 0.96);
          }
        }
        if (fill.fy < 0.88) {
          const vert = Math.min(topSlack, botSlack);
          if (topSlack > 12 && botSlack < 5) {
            yPan += Math.min(1.5, topSlack * 0.05);
            placeCam(cx, cy, cz, dist, undefined, yPan, xPan);
            for (const id of Object.keys(positions)) {
              const p = positions[id];
              if (p) p.y = (p.y - 0.4) * 1.07 + 0.4;
            }
            applyPositionsToScene();
          } else if (vert > 5) {
            for (const id of Object.keys(positions)) {
              const p = positions[id];
              if (p) p.y = (p.y - 0.4) * 1.05 + 0.4;
            }
            applyPositionsToScene();
          } else {
            dist = Math.max(6.5, dist * 0.97);
          }
        }
        placeCam(cx, cy, cz, dist, undefined, yPan, xPan);
        ensurePortraitPlanetSize(36);
        resolveLabelOverlaps(16);
        rescaleAllFleetShips();
        seatInSafe();
      }
      // Gaps via label scale + 18px resolve (badges inflate btn-overlap rects)
      for (let i = 0; i < 10; i++) {
        resolveLabelOverlaps(18);
        if (assertLabelGap(16).ok) break;
        labelScale = Math.max(0.65, labelScale * 0.88);
        for (const [, el] of labels) if (el) el.style.setProperty('--g3s', String(labelScale));
      }
      resolveLabelOverlaps(18);
      seatInSafe();
      // Final fill push: grow axis that is short without leaving safe box
      for (let i = 0; i < 12; i++) {
        const fill = assertIdleFill(0.88);
        if (fill.ok) break;
        const sb = safeBox();
        const art = mapArtScreenAabb();
        if (!art) break;
        const leftSlack = art.minX - sb.left;
        const rightSlack = sb.right - art.maxX;
        const topSlack = art.minY - sb.top;
        const botSlack = sb.bottom - art.maxY;
        if (leftSlack - rightSlack > 4) xPan -= (leftSlack - rightSlack) * 0.04;
        if (rightSlack - leftSlack > 4) xPan += (rightSlack - leftSlack) * 0.04;
        if (topSlack - botSlack > 4) yPan += (topSlack - botSlack) * 0.04;
        if (botSlack - topSlack > 4) yPan -= (botSlack - topSlack) * 0.04;
        if (fill.fy < 0.88) {
          const vert = Math.min(topSlack, botSlack);
          if (vert > 4) {
            for (const id of Object.keys(positions)) {
              const p = positions[id];
              if (p) p.y = (p.y - 0.4) * 1.06 + 0.4;
            }
            applyPositionsToScene();
          } else {
            dist = Math.max(6.5, dist * 0.96);
          }
        }
        if (fill.fx < 0.88) {
          const side = Math.min(leftSlack, rightSlack);
          if (side > 4) {
            for (const id of Object.keys(positions)) {
              const p = positions[id];
              if (p) { p.x *= 1.04; p.z *= 1.03; }
            }
            applyPositionsToScene();
          } else {
            dist = Math.max(6.5, dist * 0.96);
          }
        }
        placeCam(cx, cy, cz, dist, undefined, yPan, xPan);
        ensurePortraitPlanetSize(36);
        resolveLabelOverlaps(18);
        rescaleAllFleetShips();
        seatInSafe();
      }
      resolveLabelOverlaps(18);
      rescaleAllFleetShips();
    }

    if (isPortrait()) {
      ensurePortraitPlanetSize(44);
      resolveLabelOverlaps(8);
      // Pull closer so vertical span fills ~80% of inner free height
      for (let i = 0; i < 8; i++) {
        const inner = idleInnerRect();
        const span2 = projectedSpan(pts);
        const fy = span2.h / Math.max(1, inner.height);
        if (fy >= 0.76 && fy <= 0.90) break;
        if (fy < 0.76) {
          dist = Math.max(7, dist * Math.pow(Math.max(0.15, fy) / 0.82, 0.95));
        } else {
          dist = Math.min(58, dist * Math.pow(fy / 0.82, 0.95));
        }
        placeCam(cx, cy, cz, dist);
        ensurePortraitPlanetSize(44);
        resolveLabelOverlaps(8);
      }
      // Final containment after zoom-in
      for (let i = 0; i < 6; i++) {
        const inner = idleInnerRect();
        let maxOut = 0;
        for (const id of list) {
          const p = positions[id];
          if (!p) continue;
          const s = projectWorld(p.x, p.y, p.z);
          if (!s.ok) { maxOut = Math.max(maxOut, 80); continue; }
          maxOut = Math.max(maxOut, inner.left - s.x, s.x - inner.right, inner.top - s.y, s.y - inner.bottom);
        }
        for (const [, el] of labels) {
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1) continue;
          const cr = renderer.domElement.getBoundingClientRect();
          const L = r.left - cr.left, R = r.right - cr.left;
          const T = r.top - cr.top;
          maxOut = Math.max(maxOut, inner.left - L, R - inner.right, inner.top - T - 8);
        }
        if (maxOut <= 0) break;
        dist = Math.min(40, dist * (1 + Math.max(0.03, maxOut / Math.max(60, inner.height))));
        placeCam(cx, cy, cz, dist);
        ensurePortraitPlanetSize(44);
        resolveLabelOverlaps(8);
      }
    }

    idleDist = dist;
    fitted = true;
  }

  /**
   * Selection: bounding sphere of selected + ALL linked (incl. orbit ships).
   * dist = R / sin(fov/2) * 1.25 using free-area v+h FOV (portrait: h binds).
   * Never closer than idle framing.
   */
  function fitSelection(ids) {
    if (!camera || !controls || !THREE) return;
    flyAnimToken++;
    const list = (ids && ids.length) ? ids : Object.keys(positions);
    const pts = collectPoints(list);
    const box = aabbOf(pts);
    const R = Math.max(1.2, box.radius);
    // Use free-area v+h FOV; portrait aspect<1 → horizontal FOV binds
    const { vFov, hFov } = freeFovs();
    const distV = (R / Math.sin(Math.max(0.05, vFov / 2))) * 1.25;
    const distH = (R / Math.sin(Math.max(0.05, hFov / 2))) * 1.25;
    let dist = Math.max(distV, distH);
    // Never zoom closer than idle framing
    dist = Math.max(dist, idleDist);
    dist = Math.max(10, Math.min(56, dist));
    placeCam(box.cx, box.cy, box.cz, dist);
    // Refine until linked planets (+pads) sit in free rect with 24px margin
    for (let i = 0; i < 6; i++) {
      const vr = visibleRect();
      let maxOut = 0;
      for (const p of pts) {
        const s = projectWorld(p.x, p.y, p.z);
        if (!s.ok) { maxOut = Math.max(maxOut, 120); continue; }
        const mx = Math.max(0, vr.left + 24 - s.x, s.x - (vr.right - 24));
        const my = Math.max(0, vr.top + 24 - s.y, s.y - (vr.bottom - 24));
        maxOut = Math.max(maxOut, mx, my);
      }
      if (maxOut <= 1) break;
      dist = Math.min(56, dist * (1 + 0.9 * maxOut / Math.max(40, Math.min(vr.width, vr.height))));
      dist = Math.max(dist, idleDist);
      placeCam(box.cx, box.cy, box.cz, dist);
    }
    projectLabels();
    if (isLandPhone()) {
      labelScale = 1;
      for (const [, el] of labels) if (el) el.style.setProperty('--g3s', '1');
      resolveLabelOverlaps(18);
      for (let i = 0; i < 10; i++) {
        const gap = assertLabelGap(16);
        if (gap.ok) break;
        labelScale = Math.max(0.62, labelScale * 0.88);
        for (const [, el] of labels) if (el) el.style.setProperty('--g3s', String(labelScale));
        resolveLabelOverlaps(18);
      }
      resolveLabelOverlaps(18);
    } else if (isPortrait()) {
      resolveLabelOverlaps(8);
    }
  }

  function fitIds(ids) {
    if (ids && ids.length) fitSelection(ids);
    else fitAll();
  }

  function scaleFleetShip(root, planetId) {
    const pm = planetMeshes.get(planetId);
    const diameter = pm ? pm.r * 2 : 1.6;
    // Land phone: bigger fleets so "Your fleet" reads at a glance
    const mult = isLandPhone() ? 1.15 : (isPortrait() ? 0.6 : 0.7);
    const target = diameter * mult;
    // Measure hull only (skip translucent shields if present)
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    let has = false;
    root.traverse((m) => {
      if (!m.isMesh) return;
      const name = (m.name || '') + (m.material?.name || '');
      const mat = m.material;
      const translucent = mat && mat.transparent && (mat.opacity ?? 1) < 0.85;
      if (/shield|aura|glow/i.test(name) || translucent) return;
      const b = new THREE.Box3().setFromObject(m);
      if (!b.isEmpty()) { box.union(b); has = true; }
    });
    if (!has) box.setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const longest = Math.max(size.x, size.y, size.z, 0.001);
    // root may already be scaled; bake into a uniform scale from identity
    const cur = root.scale.x || 1;
    const worldLong = longest; // already includes cur scale via setFromObject
    const next = cur * (target / worldLong);
    root.scale.setScalar(Math.max(0.08, Math.min(isLandPhone() ? 2.8 : (isPortrait() ? 1.2 : 1.6), next)));
  }

  function rescaleAllFleetShips() {
    for (const [pid, fl] of fleetMeshes) {
      if (fl?.root) scaleFleetShip(fl.root, pid);
    }
  }

  /** Landscape fill: planet+ship+label bbox vs safe box, both axes >= minFill. */
  function assertIdleFill(minFill = 0.85) {
    const inner = isLandPhone() ? safeBox() : idleInnerRect();
    const art = mapArtScreenAabb();
    if (!art) return { ok: false, fx: 0, fy: 0, minFill };
    const fx = art.w / Math.max(1, inner.width);
    const fy = art.h / Math.max(1, inner.height);
    const clear = assertMapArtClearOfButtons();
    return {
      ok: fx + 1e-6 >= minFill && fy + 1e-6 >= minFill && !!clear.ok,
      fx: Math.round(fx * 1000) / 1000,
      fy: Math.round(fy * 1000) / 1000,
      minFill,
      bbox: { minX: Math.round(art.minX), maxX: Math.round(art.maxX), minY: Math.round(art.minY), maxY: Math.round(art.maxY) },
      free: { w: Math.round(inner.width), h: Math.round(inner.height) },
      safe: { L: Math.round(inner.left), R: Math.round(inner.right), T: Math.round(inner.top), B: Math.round(inner.bottom) },
      artClear: clear.ok,
    };
  }

  /** No planet / ship / label intersects Shop·End (.float-actions) or other map chrome buttons. */
  function assertMapArtClearOfButtons() {
    const cr = renderer?.domElement?.getBoundingClientRect?.() || { left: 0, top: 0 };
    const blockers = [];
    const floats = document.querySelector('.float-actions');
    if (floats && !floats.classList.contains('is-hidden') && !floats.classList.contains('hidden')) {
      const fr = floats.getBoundingClientRect();
      if (fr.width > 0 && fr.height > 0) {
        blockers.push({
          id: 'float-actions',
          L: fr.left - cr.left - 12, R: fr.right - cr.left + 12,
          T: fr.top - cr.top - 12, B: fr.bottom - cr.top + 12,
        });
      }
    }
    const hits = [];
    const hitBlock = (L, R, T, B, kind, id) => {
      for (const b of blockers) {
        const overlap = !(R <= b.L || L >= b.R || B <= b.T || T >= b.B);
        if (overlap) hits.push({ kind, id, blocker: b.id });
      }
    };
    for (const id of Object.keys(positions)) {
      const p = positions[id];
      if (!p) continue;
      const s = projectWorld(p.x, p.y, p.z);
      if (!s.ok) continue;
      const rad = Math.max(6, planetDiamPx(id) / 2);
      hitBlock(s.x - rad, s.x + rad, s.y - rad, s.y + rad, 'planet', id);
      const fl = fleetMeshes.get(id);
      if (fl?.root) {
        const fa = fleetScreenAabb(fl.root);
        if (fa) hitBlock(fa.minX, fa.maxX, fa.minY, fa.maxY, 'ship', id);
      }
    }
    for (const [id, el] of labels) {
      if (!el || el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      hitBlock(r.left - cr.left, r.right - cr.left, r.top - cr.top, r.bottom - cr.top, 'label', id);
    }
    // Also require land map art inside safe box
    if (isLandPhone()) {
      const sb = safeBox();
      const art = mapArtScreenAabb();
      if (art) {
        const tol = 2.5; // sub-pixel / raster slack
        const padMiss = art.minX < sb.left - tol || art.maxX > sb.right + tol
          || art.minY < sb.top - tol || art.maxY > sb.bottom + tol;
        if (padMiss) hits.push({
          kind: 'safeBox', id: 'art',
          art: { minX: Math.round(art.minX), maxX: Math.round(art.maxX), minY: Math.round(art.minY), maxY: Math.round(art.maxY) },
          safe: { L: Math.round(sb.left), R: Math.round(sb.right), T: Math.round(sb.top), B: Math.round(sb.bottom) },
        });
      }
    }
    return { ok: hits.length === 0, hits };
  }

  function assertLinkedInView(ids, margin = 24) {
    const vr = visibleRect();
    const misses = [];
    for (const id of ids || []) {
      const p = positions[id];
      if (!p) continue;
      const s = projectWorld(p.x, p.y, p.z);
      const inside = s.ok
        && s.x >= vr.left + margin && s.x <= vr.right - margin
        && s.y >= vr.top + margin && s.y <= vr.bottom - margin;
      if (!inside) misses.push({ id, x: s.x, y: s.y, ok: s.ok });
    }
    return { ok: misses.length === 0, misses, visibleRect: vr, idleDist };
  }

  /** Idle: every planet + every .g3-label DOM rect inside free/viewport with margin. */
  function assertIdleFraming(margin = 8) {
    const vr = visibleRect();
    const bottomPad = isPortrait() ? Math.max(margin, Math.round(vr.height * 0.06)) : margin;
    const misses = [];
    for (const id of Object.keys(positions)) {
      const p = positions[id];
      const s = projectWorld(p.x, p.y, p.z);
      const inside = s.ok
        && s.x >= vr.left + margin && s.x <= vr.right - margin
        && s.y >= vr.top + margin && s.y <= vr.bottom - bottomPad;
      if (!inside) misses.push({ id, kind: 'planet', x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, ok: s.ok });
    }
    const canvas = renderer?.domElement;
    const cr = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    for (const [id, el] of labels) {
      if (!el || el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) continue;
      // Viewport: fully on screen
      const inVp = r.left >= margin && r.right <= vw - margin
        && r.top >= margin && r.bottom <= vh - margin;
      // Free rect in canvas space (labels live over the stage/canvas)
      const L = r.left - cr.left, R = r.right - cr.left, T = r.top - cr.top, B = r.bottom - cr.top;
      // Portrait: keep labels in free rect. Landscape short freeH: viewport is enough (chrome overlap OK).
      const inFree = isPortrait()
        ? (L >= vr.left + margin && R <= vr.right - margin && T >= -2 && B <= (window.innerHeight || vr.bottom) - margin)
        : (L >= vr.left + margin && R <= vr.right - margin && T >= -2 && B <= (window.innerHeight || vr.bottom) - margin);
      if (!inVp || !inFree) {
        misses.push({
          id, kind: 'label', inVp, inFree,
          left: Math.round(r.left), right: Math.round(r.right),
          top: Math.round(r.top), bottom: Math.round(r.bottom),
        });
      }
    }
    return { ok: misses.length === 0, misses, visibleRect: vr, idleDist, bottomPad };
  }

  function resize() {
    if (!renderer || !stageEl) return;
    const w = stageEl.clientWidth || 1;
    const h = stageEl.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    const port = w < h;
    const flipped = layoutPortrait !== port;
    if (flipped) {
      rebuildPositions();
      applyPositionsToScene();
      fitted = false;
      landFleetFitted = false;
    }
    if ((!fitted || flipped) && w > 40 && h > 40) {
      fitAll();
      fitted = true;
    }
  }

  async function ensureFleetMesh(planetId, owner, shipType) {
    const color = COLORS[owner] || '#888';
    let entry = fleetMeshes.get(planetId);
    if (entry && entry.shipType === shipType && entry.owner === owner) return entry;
    if (entry) {
      scene.remove(entry.root);
      if (entry.ring) scene.remove(entry.ring);
      fleetMeshes.delete(planetId);
    }
    let root = null;
    try {
      const ships = await import('../space/ships3d.js');
      root = shipType === 'battleship'
        ? ships.buildBattleShip('default', color)
        : ships.buildSpaceShip('default', color);
    } catch {
      // Simple fallback wedge
      const g = new THREE.ConeGeometry(0.15, 0.45, 5);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
      m.rotation.x = Math.PI / 2;
      root = new THREE.Group(); root.add(m);
    }
    // Cap on-screen size to ~0.6× planet diameter (ships3d roots are large)
    root.scale.setScalar(1);
    scaleFleetShip(root, planetId);
    // Boost emissive on player fleet
    if (owner === PLAYER) {
      root.traverse((m) => {
        if (m.isMesh && m.material && m.material.emissive) {
          m.material.emissiveIntensity = Math.max(m.material.emissiveIntensity || 0, 1.1);
        }
      });
    }
    scene.add(root);

    let ring = null;
    if (owner === PLAYER) {
      const pmR = planetMeshes.get(planetId)?.r || 0.8;
      ring = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(0.35, pmR * 0.55), 0.03, 10, 48),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
    }
    entry = { root, ring, angle: Math.random() * Math.PI * 2, shipType, owner, planetId };
    fleetMeshes.set(planetId, entry);
    return entry;
  }

  function clearFleet(planetId) {
    const e = fleetMeshes.get(planetId);
    if (!e) return;
    scene.remove(e.root);
    if (e.ring) scene.remove(e.ring);
    fleetMeshes.delete(planetId);
  }

  api.refresh = async (state) => {
    stateRef = state;
    if (!api.ready) return;
    for (const p of PLANETS) {
      const owner = state.owners[p.id];
      const pm = planetMeshes.get(p.id);
      if (!pm) continue;
      const hot = highlight.has(p.id);
      const dim = dimOthers && !hot && selectedId !== p.id;
      const col = hot ? 0xffd23f : (owner === PLAYER ? 0x4fd1ff : 0xe04848);
      pm.glow.material.color.setHex(col);
      pm.glow.material.opacity = hot ? 0.95 : (selectedId === p.id ? 0.9 : 0.5);
      // Enlarge gold ring for tap targets
      const ringScale = hot ? 1.25 : 1.0;
      pm.glow.scale.set(ringScale, ringScale, ringScale);
      pm.mat.opacity = dim ? 0.35 : 1;
      pm.mat.transparent = dim;
      pm.atmo.material.opacity = dim ? 0.06 : 0.2;
      if (pm.mat.emissive) {
        pm.mat.emissive.setHex(hot ? 0xffd23f : 0x000000);
        pm.mat.emissiveIntensity = hot ? 0.35 : 0;
      }

      const lab = labels.get(p.id);
      if (lab) {
        lab.classList.toggle('mine', owner === PLAYER);
        lab.classList.toggle('foe', owner !== PLAYER);
        lab.classList.toggle('on', selectedId === p.id);
        lab.classList.toggle('hl', hot);
        lab.classList.toggle('dim', dim);
        const tag = lab.querySelector('.g3-fleet-tag');
        const badge = lab.querySelector('.g3-badge');
        const tap = lab.querySelector('.g3-tap');
        const has = planetHasFleet(state, p.id);
        const fleetN = has ? (state.garrisons[p.id] || []).filter((u) => u.type === 'spaceship' || u.type === 'battleship').length : 0;
        if (tag) tag.classList.toggle('hidden', !(has && owner === PLAYER));
        if (badge) {
          badge.textContent = String(fleetN);
          badge.classList.toggle('hidden', !has || fleetN < 1);
        }
        if (tap) tap.classList.toggle('hidden', !hot);
      }

      if (planetHasFleet(state, p.id)) {
        await ensureFleetMesh(p.id, owner, fleetShipType(state, p.id) || 'spaceship');
      } else {
        clearFleet(p.id);
      }
    }
    // Land: fleets load async — one refit after first meshes so ships count in safe/fill
    if (isLandPhone() && fleetMeshes.size && !landFleetFitted) {
      landFleetFitted = true;
      rescaleAllFleetShips();
      fitAll();
    }
    // Lane highlight
    for (const tube of laneLines) {
      const hot = selectedId && (
        (tube.userData.a === selectedId && highlight.has(tube.userData.b)) ||
        (tube.userData.b === selectedId && highlight.has(tube.userData.a))
      );
      tube.material.opacity = hot ? 0.85 : tube.userData.baseOpacity;
      tube.material.color.setHex(hot ? 0xffd23f : 0x4fd1ff);
    }
  };

  api.fitAll = () => fitAll();
  api.fitSelection = (ids) => fitSelection(ids);
  api.chromeInsets = () => chromeInsets();
  api.visibleRect = () => visibleRect();
  api.projectPlanet = (id) => {
    const p = positions[id];
    if (!p) return null;
    return projectWorld(p.x, p.y, p.z);
  };
  api.assertLinkedInView = (ids, margin) => assertLinkedInView(ids, margin);
  api.assertIdleFraming = (margin) => assertIdleFraming(margin);
  api.assertPlanetMinPx = (minPx) => assertPlanetMinPx(minPx);
  api.assertLabelGap = (minGap) => assertLabelGap(minGap);
  api.assertIdleFill = (minFill) => assertIdleFill(minFill);
  api.assertMapArtClearOfButtons = () => assertMapArtClearOfButtons();
  api.safeBox = () => safeBox();
  // Patch harness without editing main.js
  if (typeof window !== 'undefined' && window.__scTest) {
    window.__scTest.assertMapArtClearOfButtons = () => assertMapArtClearOfButtons();
    window.__scTest.safeBox = () => safeBox();
  }
  api.getIdleDist = () => idleDist;
  api.setSelection = (id, hlIds = [], dim = false) => {
    selectedId = id;
    highlight = new Set(hlIds);
    dimOthers = dim;
    if (stateRef) api.refresh(stateRef);
  };

  // Soft fly — never closer than idle; cancelled by fitSelection/fitAll
  api.flyTo = (planetId) => {
    const pm = planetMeshes.get(planetId);
    if (!pm || !controls) return;
    const token = ++flyAnimToken;
    const target = pm.mesh.position.clone();
    const dist = Math.max(idleDist, 14);
    const elev = Math.PI / 5.2;
    const endCam = new THREE.Vector3(
      target.x,
      target.y + Math.sin(elev) * dist,
      target.z + Math.cos(elev) * dist
    );
    const startCam = camera.position.clone();
    const startT = controls.target.clone();
    const t0 = performance.now();
    const dur = 500;
    function step(now) {
      if (token !== flyAnimToken) return;
      const u = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - u, 3);
      camera.position.lerpVectors(startCam, endCam, e);
      controls.target.lerpVectors(startT, target, e);
      controls.update();
      if (u < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };

  api.flyFleet = (fromId, toId) => new Promise((resolve) => {
    const entry = fleetMeshes.get(fromId);
    const tube = laneLines.find((l) =>
      (l.userData.a === fromId && l.userData.b === toId) ||
      (l.userData.b === fromId && l.userData.a === toId));
    if (!entry || !tube) { resolve(); return; }
    flying = {
      mesh: entry.root,
      ring: entry.ring,
      curve: tube.userData.curve,
      t: 0,
      dur: 1.05,
      reverse: tube.userData.a !== fromId,
      resolve,
      fromId,
      toId,
      entry,
    };
  });

  /**
   * Place labels with candidate offsets (above/below/left/right) so rects stay
   * >= minGap apart. Uses DOM getBoundingClientRect after each try.
   */
  function resolveLabelOverlaps(minGap = 8) {
    if (!labelRoot) return;
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    const order = [...PLANETS];
    // Measure natural anchor (planet screen pos)
    const anchors = new Map();
    for (const p of order) {
      const pm = planetMeshes.get(p.id);
      if (!pm) continue;
      const v = pm.mesh.position.clone().project(camera);
      if (v.z > 1) continue;
      anchors.set(p.id, {
        ax: (v.x * 0.5 + 0.5) * w,
        ay: (-v.y * 0.5 + 0.5) * h,
      });
    }
    // Offsets relative to planet: above (default), below, left, right, and diagonals
    const shortH = h < 420;
    const CANDS = shortH ? [
      { ox: 0, oy: -14, tx: '-50%', ty: '-100%' },
      { ox: 0, oy: 16, tx: '-50%', ty: '0%' },
      { ox: -44, oy: -4, tx: '-100%', ty: '-50%' },
      { ox: 44, oy: -4, tx: '0%', ty: '-50%' },
      { ox: -36, oy: -18, tx: '-100%', ty: '-100%' },
      { ox: 36, oy: -18, tx: '0%', ty: '-100%' },
      { ox: -36, oy: 14, tx: '-100%', ty: '0%' },
      { ox: 36, oy: 14, tx: '0%', ty: '0%' },
      { ox: 0, oy: -30, tx: '-50%', ty: '-100%' },
      { ox: 0, oy: 32, tx: '-50%', ty: '0%' },
      { ox: -60, oy: 8, tx: '-100%', ty: '-50%' },
      { ox: 60, oy: 8, tx: '0%', ty: '-50%' },
      { ox: -80, oy: -10, tx: '-100%', ty: '-50%' },
      { ox: 80, oy: -10, tx: '0%', ty: '-50%' },
      { ox: -70, oy: 22, tx: '-100%', ty: '0%' },
      { ox: 70, oy: 22, tx: '0%', ty: '0%' },
      { ox: 0, oy: -48, tx: '-50%', ty: '-100%' },
      { ox: 0, oy: 48, tx: '-50%', ty: '0%' },
      { ox: -100, oy: 0, tx: '-100%', ty: '-50%' },
      { ox: 100, oy: 0, tx: '0%', ty: '-50%' },
    ] : [
      { ox: 0, oy: -20, tx: '-50%', ty: '-100%' },
      { ox: 0, oy: 28, tx: '-50%', ty: '0%' },
      { ox: -52, oy: -6, tx: '-100%', ty: '-50%' },
      { ox: 52, oy: -6, tx: '0%', ty: '-50%' },
      { ox: -40, oy: -28, tx: '-100%', ty: '-100%' },
      { ox: 40, oy: -28, tx: '0%', ty: '-100%' },
      { ox: -40, oy: 24, tx: '-100%', ty: '0%' },
      { ox: 40, oy: 24, tx: '0%', ty: '0%' },
      { ox: 0, oy: -44, tx: '-50%', ty: '-100%' },
      { ox: 0, oy: 48, tx: '-50%', ty: '0%' },
    ];
    const chosen = [];
    for (const p of order) {
      const el = labels.get(p.id);
      const an = anchors.get(p.id);
      if (!el || !an) continue;
      el.style.display = 'block';
      el.style.opacity = el.classList.contains('dim') ? '0.35' : '1';
      let best = null;
      let bestOverflow = null;
      const stage = stageEl.getBoundingClientRect();
      let mEdge = shortH ? 24 : 2;
      let clampL = stage.left + mEdge, clampR = stage.right - mEdge;
      let clampT = stage.top + mEdge, clampB = stage.bottom - mEdge;
      if (shortH) {
        try {
          const sb = safeBox();
          const cr = renderer?.domElement?.getBoundingClientRect?.() || stage;
          clampL = cr.left + sb.left;
          clampR = cr.left + sb.right;
          clampT = cr.top + sb.top;
          clampB = cr.top + sb.bottom;
          mEdge = 0;
        } catch { /* safeBox may run before renderer */ }
      }
      const floats = shortH ? document.querySelector('.float-actions') : null;
      const fRect = (floats && !floats.classList.contains('is-hidden') && !floats.classList.contains('hidden'))
        ? floats.getBoundingClientRect() : null;
      for (const c of CANDS) {
        const x = an.ax + c.ox;
        const y = an.ay + c.oy;
        el.style.transform = `translate(${c.tx}, ${c.ty}) translate(${x}px, ${y}px) scale(${labelScale})`;
        const r = el.getBoundingClientRect();
        let overflow = Math.max(0,
          clampL - r.left,
          r.right - clampR,
          clampT - r.top,
          r.bottom - clampB);
        if (fRect) {
          const pad = 12;
          const overlapF = !(r.right <= fRect.left - pad || r.left >= fRect.right + pad
            || r.bottom <= fRect.top - pad || r.top >= fRect.bottom + pad);
          if (overlapF) overflow = Math.max(overflow, 40);
        }
        let hit = false;
        for (const q of chosen) {
          const qr = q.r;
          if (!(r.right + minGap <= qr.left || qr.right + minGap <= r.left
            || r.bottom + minGap <= qr.top || qr.bottom + minGap <= r.top)) {
            hit = true; break;
          }
        }
        const cand = { c, x, y, r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, overflow };
        if (!hit && overflow <= 0) {
          best = cand;
          break;
        }
        if (!hit && (!bestOverflow || overflow < bestOverflow.overflow)) bestOverflow = cand;
      }
      if (!best) {
        // Fallback: nudge toward stage center from least-overflow candidate
        const seed = bestOverflow || { c: CANDS[0], x: an.ax, y: an.ay - 14, overflow: 99 };
        let x = seed.x, y = seed.y;
        const c = seed.c;
        for (let k = 0; k < 16; k++) {
          el.style.transform = `translate(${c.tx}, ${c.ty}) translate(${x}px, ${y}px) scale(${labelScale})`;
          const r = el.getBoundingClientRect();
          const overflow = Math.max(0,
            clampL - r.left,
            r.right - clampR,
            clampT - r.top,
            r.bottom - clampB);
          let hit = false;
          for (const q of chosen) {
            const qr = q.r;
            if (!(r.right + minGap <= qr.left || qr.right + minGap <= r.left
              || r.bottom + minGap <= qr.top || qr.bottom + minGap <= r.top)) {
              hit = true; break;
            }
          }
          if (!hit && overflow <= 0) {
            best = { c, x, y, r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
            break;
          }
          // Pull toward stage center
          const cx = (stage.left + stage.right) / 2;
          const cy = (stage.top + stage.bottom) / 2;
          const mx = (r.left + r.right) / 2;
          const my = (r.top + r.bottom) / 2;
          x += (cx - mx) * 0.35;
          y += (cy - my) * 0.35;
        }
        if (!best) {
          // Last resort: clamp into stage (may overlap slightly — gap pass/zoom handles rest)
          el.style.transform = `translate(${c.tx}, ${c.ty}) translate(${x}px, ${y}px) scale(${labelScale})`;
          let r = el.getBoundingClientRect();
          let dx = 0, dy = 0;
          if (r.left < clampL) dx = clampL - r.left;
          if (r.right > clampR) dx = clampR - r.right;
          if (r.top < clampT) dy = clampT - r.top;
          if (r.bottom > clampB) dy = clampB - r.bottom;
          x += dx; y += dy;
          el.style.transform = `translate(${c.tx}, ${c.ty}) translate(${x}px, ${y}px) scale(${labelScale})`;
          r = el.getBoundingClientRect();
          best = { c, x, y, r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } };
        }
      } else {
        el.style.transform = `translate(${best.c.tx}, ${best.c.ty}) translate(${best.x}px, ${best.y}px) scale(${labelScale})`;
      }
      chosen.push({ id: p.id, r: best.r });
    }
  }

  function projectLabels() {
    if (!camera || !labelRoot) return;
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    const placed = [];
    for (const p of PLANETS) {
      const pm = planetMeshes.get(p.id);
      const el = labels.get(p.id);
      if (!pm || !el) continue;
      const v = pm.mesh.position.clone().project(camera);
      if (v.z > 1) { el.style.display = 'none'; continue; }
      let x = (v.x * 0.5 + 0.5) * w;
      let y = (-v.y * 0.5 + 0.5) * h - 18;
      // coarse pre-pass; resolveLabelOverlaps refines after fit
      for (let k = 0; k < 8; k++) {
        let hit = false;
        for (const q of placed) {
          if (Math.abs(q.x - x) < 78 && Math.abs(q.y - y) < 26) {
            y = q.y + 26; hit = true;
          }
        }
        if (!hit) break;
      }
      if (y < 8 || y > h - 24 || x < 8 || x > w - 8) {
        el.style.opacity = '0.25';
      } else {
        el.style.opacity = el.classList.contains('dim') ? '0.35' : '1';
      }
      el.style.display = 'block';
      el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      placed.push({ x, y });
    }
  }

  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const t = performance.now() * 0.001;
    controls?.update();

    for (const [, pm] of planetMeshes) {
      pm.mesh.rotation.y = t * 0.22;
      pm.atmo.rotation.y = t * 0.1;
      if (highlight.has(pm.mesh.userData.planetId)) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        pm.glow.material.opacity = 0.55 + pulse * 0.4;
        pm.glow.scale.setScalar(1 + pulse * 0.08);
      }
    }

    // Orbit fleets
    for (const [pid, fl] of fleetMeshes) {
      if (flying && flying.fromId === pid) continue;
      const pm = planetMeshes.get(pid);
      if (!pm) continue;
      fl.angle += 0.55 * 0.016;
      const r = pm.r * 1.65;
      const x = pm.pos.x + Math.cos(fl.angle) * r;
      const z = pm.pos.z + Math.sin(fl.angle) * r;
      const y = pm.pos.y + 0.15;
      fl.root.position.set(x, y, z);
      fl.root.lookAt(pm.pos.x, pm.pos.y, pm.pos.z);
      if (fl.ring) {
        fl.ring.position.set(x, y, z);
        fl.ring.rotation.z = t * 2;
        fl.ring.material.opacity = 0.55 + 0.4 * Math.sin(t * 5);
      }
    }

    // Fly tween
    if (flying) {
      flying.t += 0.016;
      const u = Math.min(1, flying.t / flying.dur);
      const e = u * u * (3 - 2 * u);
      const uu = flying.reverse ? 1 - e : e;
      const pt = flying.curve.getPoint(uu);
      flying.mesh.position.copy(pt);
      const look = flying.curve.getPoint(Math.min(1, uu + 0.02));
      flying.mesh.lookAt(look);
      if (flying.ring) flying.ring.position.copy(pt);
      if (u >= 1) {
        const done = flying;
        flying = null;
        // move fleet mesh registry to destination
        fleetMeshes.delete(done.fromId);
        done.entry.planetId = done.toId;
        fleetMeshes.set(done.toId, done.entry);
        done.resolve();
      }
    }

    // Portrait: resolve every frame. Landscape: every 6th frame (fitAll owns first pass)
    if (isPortrait()) resolveLabelOverlaps(8);
    else if (isLandPhone()) {
      if ((++landResolveTick % 3) === 0) resolveLabelOverlaps(18);
    } else if ((++landResolveTick % 6) === 0) resolveLabelOverlaps(16);
    renderer.render(scene, camera);
  }

  api.destroy = () => {
    running = false;
    cancelAnimationFrame(raf);
    try { controls?.dispose(); } catch { /* */ }
    try { renderer?.dispose(); } catch { /* */ }
  };

  // kick async init
  const boot = init();
  api.whenReady = () => boot;
  return api;
}
