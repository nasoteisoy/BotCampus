import * as THREE from 'three';
import { makeFeltTexture, makeWoodTexture, slotPositions, estimateRadius, horizontalRadius, separateDice, clampDiceToTray } from './dice.js';

const _ray = new THREE.Raycaster();
const _ptr = new THREE.Vector2();

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e3f28);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  camera.position.set(0, 11.5, 3.5);
  camera.lookAt(0, 0.2, 0);

  const hemi = new THREE.HemisphereLight(0xfff3d6, 0x2d6a45, 0.85);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff6e8, 1.28);
  key.position.set(3.8, 10.5, 5.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0007;
  key.shadow.normalBias = 0.03;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xb7d4ff, 0.42);
  fill.position.set(-6, 4, -3);
  scene.add(fill);

  const feltTex = makeFeltTexture();
  const woodTex = makeWoodTexture();

  const table = new THREE.Group();
  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshStandardMaterial({
      map: feltTex,
      roughness: 0.95,
      metalness: 0,
    }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = 0.01;
  felt.receiveShadow = true;
  table.add(felt);

  const wallMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.72,
    metalness: 0.04,
  });
  const inner = 3.7;
  const thick = 0.42;
  const wallH = 0.5;
  const long = (inner + thick) * 2;
  const specs = [
    { x: 0, z: inner + thick / 2, w: long, d: thick },
    { x: 0, z: -(inner + thick / 2), w: long, d: thick },
    { x: inner + thick / 2, z: 0, w: thick, d: long },
    { x: -(inner + thick / 2), z: 0, w: thick, d: long },
  ];
  for (const s of specs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(s.w, wallH, s.d), wallMat);
    wall.position.set(s.x, wallH / 2, s.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    table.add(wall);
  }

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(long + thick + 0.2, 0.28, long + thick + 0.2),
    wallMat,
  );
  plinth.position.y = -0.16;
  plinth.receiveShadow = true;
  table.add(plinth);
  scene.add(table);

  const diceGroup = new THREE.Group();
  scene.add(diceGroup);

  const markers = new THREE.Group();
  scene.add(markers);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xf2c14e,
    roughness: 0.35,
    metalness: 0.25,
    emissive: 0xf2c14e,
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 1,
  });

  const camHome = camera.position.clone();
  const lookHome = new THREE.Vector3(0, 0.2, 0);
  // r9 steeper default (~73°) keeps tall poly silhouettes inside the
  // rails. d4 lies flat, so the r8 shallower pitch (~56°) is restored
  // for that type to keep numerals >=12px and contrast well above 4.5.
  const CAM_DIR_STD = new THREE.Vector3(0, 11.5, 3.5).normalize();
  const CAM_DIR_D4 = new THREE.Vector3(0, 9.6, 6.4).normalize();
  const camDir = CAM_DIR_STD.clone();

  function setCamProfile(kind) {
    const src = kind === 'd4' ? CAM_DIR_D4 : CAM_DIR_STD;
    if (camDir.distanceToSquared(src) < 1e-12) return false;
    camDir.copy(src);
    applyCamera();
    return true;
  }
  let baseDist = 8.2;
  let viewPull = 1;
  let frameCount = 2;
  let layoutOpts = { portrait: false, spacing: 1.78, radius: 0.85 };
  let trauma = 0;
  let shakeT = 0;
  const _fitV = new THREE.Vector3();

  function addTrauma(amount) {
    trauma = Math.min(1, trauma + amount);
  }

  function applyCamera() {
    camHome.copy(camDir).multiplyScalar(baseDist * viewPull);
    camera.position.copy(camHome);
    camera.lookAt(lookHome);
  }

  function updateShake(dt) {
    applyCamera();
    if (trauma <= 0) return;
    trauma = Math.max(0, trauma - 2.4 * dt);
    const shake = trauma * trauma;
    shakeT += dt * 28;
    camera.position.set(
      camHome.x + Math.sin(shakeT * 1.7) * 0.09 * shake,
      camHome.y + Math.sin(shakeT * 2.1) * 0.05 * shake,
      camHome.z + Math.cos(shakeT * 1.3) * 0.07 * shake,
    );
    camera.lookAt(lookHome);
  }

  function setViewPull(p) {
    viewPull = p;
    applyCamera();
  }

  function cornersOfBox(min, max, out) {
    out.length = 0;
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) out.push(new THREE.Vector3(x, y, z));
      }
    }
    return out;
  }

  const _fitCorners = [];

  function distToFitPoints(points, marginX, marginY) {
    let lo = 4;
    let hi = 22;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) * 0.5;
      camHome.copy(camDir).multiplyScalar(mid);
      camera.position.copy(camHome);
      camera.lookAt(lookHome);
      camera.updateMatrixWorld();
      let fits = true;
      for (const p of points) {
        _fitV.copy(p).project(camera);
        if (
          _fitV.z < 0 || _fitV.z > 1
          || _fitV.x < -marginX || _fitV.x > marginX
          || _fitV.y < -marginY || _fitV.y > marginY
        ) {
          fits = false;
          break;
        }
      }
      if (fits) hi = mid;
      else lo = mid;
    }
    return hi * 1.03;
  }

  function applyFit(points) {
    const portrait = camera.aspect <= 1;
    const dist = distToFitPoints(points, 0.88, 0.78);
    const lo = portrait ? 6.4 : 5.2;
    const hi = portrait ? 17.5 : 15.5;
    baseDist = Math.max(lo, Math.min(hi, dist));
    applyCamera();
  }

  function fitToCount(n, opts) {
    frameCount = Math.max(1, n | 0);
    if (opts) layoutOpts = { ...layoutOpts, ...opts };
    layoutOpts.portrait = camera.aspect <= 1;
    const slots = slotPositions(frameCount, { ...layoutOpts, portrait: layoutOpts.portrait });
    const radius = layoutOpts.radius || estimateRadius('d20');
    const min = { x: Infinity, y: 0, z: Infinity };
    const max = { x: -Infinity, y: 1.2, z: -Infinity };
    for (const s of slots) {
      min.x = Math.min(min.x, s.x - radius);
      max.x = Math.max(max.x, s.x + radius);
      min.z = Math.min(min.z, s.z - radius);
      max.z = Math.max(max.z, s.z + radius);
      max.y = Math.max(max.y, radius * 2);
    }
    // Headroom for value chips on the far (top of screen) side.
    min.z -= 0.7;
    max.z += 0.28;
    min.x -= 0.2;
    max.x += 0.2;
    applyFit(cornersOfBox(min, max, _fitCorners));
  }

  function fitToDice(dice) {
    if (!dice || !dice.length) {
      fitToCount(frameCount);
      return;
    }
    const min = { x: Infinity, y: 0, z: Infinity };
    const max = { x: -Infinity, y: 0.4, z: -Infinity };
    const v = _fitV;
    const points = [];
    const up = new THREE.Vector3(0, 1, 0);
    camera.updateMatrixWorld();
    const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    for (const d of dice) {
      for (const p of d.userData.unitVerts) {
        v.copy(p).multiplyScalar(d.userData.scale).applyQuaternion(d.quaternion).add(d.position);
        min.x = Math.min(min.x, v.x);
        max.x = Math.max(max.x, v.x);
        min.z = Math.min(min.z, v.z);
        max.z = Math.max(max.z, v.z);
        max.y = Math.max(max.y, v.y);
        points.push(v.clone());
      }
      // Virtual chip anchors above (and slightly below) each die for headroom.
      const mid = d.position.clone();
      mid.y += d.userData.restY || 0.4;
      points.push(mid.clone().addScaledVector(screenUp, 0.85));
      points.push(d.position.clone().addScaledVector(up, (d.userData.restY || 0.4) + 0.55));
    }
    min.z -= 0.35;
    max.z += 0.2;
    min.x -= 0.16;
    max.x += 0.16;
    cornersOfBox(min, max, _fitCorners);
    applyFit(points.concat(_fitCorners));
    // Pull back if a projected silhouette sits closer than 4px to a
    // far or side rail inner edge. Prefer this over shrinking the dice.
    ensureRailClearance(dice);
  }

  function setFrameCount(n, opts) {
    fitToCount(n, opts);
  }

  function setLayout(opts) {
    layoutOpts = { ...layoutOpts, ...opts };
  }

  function resize() {
    const wrap = canvas.parentElement;
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const portrait = h >= w;
    const wide = w / h > 1.45;
    camera.fov = portrait ? 30 : (wide ? 30 : 28);
    camera.updateProjectionMatrix();
    layoutOpts.portrait = portrait;
    fitToCount(frameCount);
  }

  function towardFrom(pos) {
    return camHome.clone().sub(pos).normalize();
  }

  function screenUp() {
    camera.updateMatrixWorld();
    return new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  }

  function pick(clientX, clientY, meshes) {
    const rect = canvas.getBoundingClientRect();
    _ptr.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ptr.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _ray.setFromCamera(_ptr, camera);
    const hits = _ray.intersectObjects(meshes, true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData?.sides) obj = obj.parent;
    return obj || null;
  }

  const _ringV = new THREE.Vector3();
  const _ringToward = new THREE.Vector3();
  const _ringZ = new THREE.Vector3(0, 0, 1);
  const _ringTmp = new THREE.Vector3();
  const _ringRight = new THREE.Vector3();
  const RING_TUBE = 0.05;
  const RING_FLOOR = 0.22;
  const RING_GAP_PX = 8;
  const RING_DIE_GAP_PX = 4;

  function convexHull2(pts) {
    const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (P.length <= 2) return P;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const pt of P) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
      lower.push(pt);
    }
    const upper = [];
    for (let i = P.length - 1; i >= 0; i--) {
      const pt = P[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
      upper.push(pt);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function pointInPoly(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-12) + xi)) c = !c;
    }
    return c;
  }

  function distPointSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let u = l2 > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
  }

  function dieScreenHull(die, w, h) {
    const pts = [];
    for (const p of die.userData.unitVerts) {
      _ringTmp.copy(p).multiplyScalar(die.userData.scale).applyQuaternion(die.quaternion).add(die.position);
      const s = { x: 0, y: 0 };
      toScreenPx(_ringTmp, w, h, s);
      pts.push([s.x, s.y]);
    }
    return convexHull2(pts);
  }

  function circleHullGap(cx, cy, r, hull) {
    if (!hull || hull.length < 2) return Infinity;
    let min = Infinity;
    for (const pt of hull) min = Math.min(min, Math.hypot(pt[0] - cx, pt[1] - cy) - r);
    for (let i = 0; i < hull.length; i++) {
      const A = hull[i], B = hull[(i + 1) % hull.length];
      min = Math.min(min, distPointSeg(cx, cy, A[0], A[1], B[0], B[1]) - r);
    }
    if (pointInPoly([cx, cy], hull)) {
      // Center is inside the die; treat as overlap.
      return Math.min(min, -Math.abs(min) - r * 0.01);
    }
    return min;
  }


  function ringPlacement(die) {
    const toward = _ringToward.copy(camera.position).sub(die.position);
    if (toward.lengthSq() < 1e-8) toward.set(0, 1, 0);
    toward.normalize();
    const towardDir = toward.clone();
    let sil = 0;
    let towardExt = 0;
    for (const p of die.userData.unitVerts) {
      _ringTmp.copy(p).multiplyScalar(die.userData.scale).applyQuaternion(die.quaternion);
      const along = _ringTmp.dot(towardDir);
      if (along > towardExt) towardExt = along;
      const perp = _ringTmp.lengthSq() - along * along;
      if (perp > sil * sil) sil = Math.sqrt(Math.max(0, perp));
    }
    return { toward: towardDir, towardExt, sil, preferred: sil + 0.1 };
  }

  function ringWorldCenter(die, toward, towardExt, out) {
    return (out || new THREE.Vector3()).copy(die.position).addScaledVector(toward, towardExt + 0.07);
  }

  function toScreenPx(world, w, h, out) {
    _ringV.copy(world).project(camera);
    out.x = (_ringV.x * 0.5 + 0.5) * w;
    out.y = (-_ringV.y * 0.5 + 0.5) * h;
    return out;
  }

  function screenOuterRadiusPx(center, toward, worldRadius, w, h) {
    _ringRight.setFromMatrixColumn(camera.matrixWorld, 0);
    _ringRight.addScaledVector(toward, -_ringRight.dot(toward));
    if (_ringRight.lengthSq() < 1e-8) _ringRight.setFromMatrixColumn(camera.matrixWorld, 1);
    _ringRight.normalize();
    const c = { x: 0, y: 0 };
    const r = { x: 0, y: 0 };
    toScreenPx(center, w, h, c);
    toScreenPx(_ringTmp.copy(center).addScaledVector(_ringRight, worldRadius + RING_TUBE), w, h, r);
    return Math.hypot(r.x - c.x, r.y - c.y);
  }

  function applyRingMesh(die, radius, toward, towardExt) {
    let ring = die.userData.ring;
    const prev = die.userData.ringRadius || 0;
    if (!ring || Math.abs(prev - radius) > 0.008) {
      if (ring) {
        markers.remove(ring);
        ring.geometry.dispose();
      }
      ring = new THREE.Mesh(new THREE.TorusGeometry(radius, RING_TUBE, 12, 48), ringMat);
      ring.renderOrder = 3;
      ring.castShadow = false;
      ring.receiveShadow = false;
      markers.add(ring);
      die.userData.ring = ring;
    }
    die.userData.ringRadius = radius;
    ring.visible = !!die.userData.locked;
    ring.material.opacity = 1;
    ring.position.copy(die.position).addScaledVector(toward, towardExt + 0.07);
    ring.quaternion.setFromUnitVectors(_ringZ, toward);
  }

  function syncRings(diceList) {
    const list = diceList || [...diceGroup.children];
    if (!list.length) return;
    camera.updateMatrixWorld();
    const w = Math.max(1, renderer.domElement.clientWidth || renderer.domElement.width);
    const h = Math.max(1, renderer.domElement.clientHeight || renderer.domElement.height);
    const info = list.map((die) => {
      const p = ringPlacement(die);
      return { die, ...p, radius: p.preferred };
    });
    for (const a of info) {
      let nearest = Infinity;
      for (const b of info) {
        if (a === b) continue;
        const gap = Math.hypot(a.die.position.x - b.die.position.x, a.die.position.z - b.die.position.z);
        if (gap < nearest) nearest = gap;
      }
      if (Number.isFinite(nearest) && nearest < 1e6) {
        a.radius = Math.min(a.radius, Math.max(RING_FLOOR, nearest * 0.5 - RING_TUBE - 0.06));
      }
    }
    const centers = info.map(() => new THREE.Vector3());
    const screenC = info.map(() => ({ x: 0, y: 0 }));
    for (let iter = 0; iter < 12; iter++) {
      let changed = false;
      for (let i = 0; i < info.length; i++) {
        const a = info[i];
        ringWorldCenter(a.die, a.toward, a.towardExt, centers[i]);
        toScreenPx(centers[i], w, h, screenC[i]);
      }
      const rads = info.map((a, i) => screenOuterRadiusPx(centers[i], a.toward, a.radius, w, h));
      for (let i = 0; i < info.length; i++) {
        for (let j = i + 1; j < info.length; j++) {
          const dist = Math.hypot(screenC[i].x - screenC[j].x, screenC[i].y - screenC[j].y);
          const need = rads[i] + rads[j] + RING_GAP_PX;
          if (need <= dist + 0.05) continue;
          const avail = Math.max(2, dist - RING_GAP_PX);
          const scale = avail / Math.max(1e-3, rads[i] + rads[j]);
          const ni = Math.max(RING_FLOOR, info[i].radius * scale);
          const nj = Math.max(RING_FLOOR, info[j].radius * scale);
          if (ni < info[i].radius - 1e-4) { info[i].radius = ni; changed = true; }
          if (nj < info[j].radius - 1e-4) { info[j].radius = nj; changed = true; }
        }
      }
      const hulls = list.map((d) => dieScreenHull(d, w, h));
      for (let i = 0; i < info.length; i++) {
        for (let j = 0; j < list.length; j++) {
          if (info[i].die === list[j]) continue;
          const gap = circleHullGap(screenC[i].x, screenC[i].y, rads[i], hulls[j]);
          if (gap >= RING_DIE_GAP_PX - 0.05) continue;
          const newRpx = Math.max(4, rads[i] + gap - RING_DIE_GAP_PX);
          const scale = newRpx / Math.max(1e-3, rads[i]);
          const ni = Math.max(RING_FLOOR, info[i].radius * scale);
          if (ni < info[i].radius - 1e-4) { info[i].radius = ni; changed = true; }
        }
      }
      if (!changed) break;
    }
    for (const a of info) applyRingMesh(a.die, a.radius, a.toward, a.towardExt);
  }

  function syncRing(die) {
    syncRings(diceGroup.children.length ? [...diceGroup.children] : [die]);
  }

  const RAIL_GAP_MIN = 4;
  const _railA = new THREE.Vector3();
  const _railB = new THREE.Vector3();
  const _railS = { x: 0, y: 0 };
  const _railT = { x: 0, y: 0 };

  function signedDistToLine(px, py, ax, ay, bx, by, cx, cy) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let nx = dy / len;
    let ny = -dx / len;
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5;
    if ((cx - mx) * nx + (cy - my) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return (px - ax) * nx + (py - ay) * ny;
  }

  function railInnerLines(w, h) {
    const wall = inner;
    const lines = { far: [], left: [], right: [] };
    const add = (key, x0, y0, z0, x1, y1, z1) => {
      toScreenPx(_railA.set(x0, y0, z0), w, h, _railS);
      const a = [_railS.x, _railS.y];
      toScreenPx(_railB.set(x1, y1, z1), w, h, _railT);
      lines[key].push({ a, b: [_railT.x, _railT.y] });
    };
    // Sample the inner face at felt, mid, and rail-top so a tall
    // silhouette is tested against the real camera projection, not
    // only the top point or the felt junction.
    // Only the long inner lips of each rail, sampled at felt, mid, and
    // rail-top. Short vertical corner edges must not be treated as
    // infinite lines — their extensions cut across the tray and falsely
    // report huge negative gaps on corner dice.
    for (const y of [0, wallH * 0.5, wallH]) {
      add('far', -wall, y, -wall, wall, y, -wall);
      add('left', -wall, y, -wall, -wall, y, wall);
      add('right', wall, y, -wall, wall, y, wall);
    }
    return lines;
  }

  function railScreenGaps(diceList) {
    const all = diceList || [...diceGroup.children];
    const canvas = renderer.domElement;
    const w = Math.max(1, canvas.clientWidth || canvas.width);
    const h = Math.max(1, canvas.clientHeight || canvas.height);
    camera.updateMatrixWorld();
    const center = { x: 0, y: 0 };
    toScreenPx(_railA.set(0, 0.15, 0), w, h, center);
    const lines = railInnerLines(w, h);
    const minOf = (pt, segs) => {
      let m = Infinity;
      for (const s of segs) {
        m = Math.min(m, signedDistToLine(pt[0], pt[1], s.a[0], s.a[1], s.b[0], s.b[1], center.x, center.y));
      }
      return m;
    };
    const perDie = [];
    let minFar = Infinity;
    let minLeft = Infinity;
    let minRight = Infinity;
    for (const d of all) {
      const hull = dieScreenHull(d, w, h);
      let far = Infinity;
      let left = Infinity;
      let right = Infinity;
      for (const pt of hull) {
        far = Math.min(far, minOf(pt, lines.far));
        left = Math.min(left, minOf(pt, lines.left));
        right = Math.min(right, minOf(pt, lines.right));
      }
      perDie.push({
        index: d.userData.index,
        far,
        left,
        right,
        min: Math.min(far, left, right),
      });
      if (far < minFar) minFar = far;
      if (left < minLeft) minLeft = left;
      if (right < minRight) minRight = right;
    }
    const min = Math.min(minFar, minLeft, minRight);
    return {
      min: min === Infinity ? null : min,
      minFar: minFar === Infinity ? null : minFar,
      minLeft: minLeft === Infinity ? null : minLeft,
      minRight: minRight === Infinity ? null : minRight,
      ok: all.length === 0 || min >= RAIL_GAP_MIN,
      threshold: RAIL_GAP_MIN,
      perDie,
    };
  }

  function ensureRailClearance(diceList, opts = {}) {
    const all = diceList || [...diceGroup.children];
    if (!all.length) return;
    const holdCamera = !!opts.holdCamera;
    // Start from the layout scale so a second fit in the same settle
    // doesn't keep shrinking the dice. Locked dice stay put.
    for (const d of all) {
      if (d.userData.locked) continue;
      const protoS = d.userData.proto?.sizeScale;
      const mul = d.userData.layoutMul;
      if (!(protoS > 0) || !(mul > 0)) continue;
      const target = protoS * mul;
      if (Math.abs(d.userData.scale - target) < 1e-6) continue;
      const k = target / d.userData.scale;
      d.userData.scale = target;
      d.userData.mesh.scale.setScalar(target);
      d.userData.restY *= k;
      d.position.y = d.userData.restY;
    }
    const need = RAIL_GAP_MIN + 0.2;
    const gapOf = () => railScreenGaps(all).min ?? 0;
    camera.updateMatrixWorld();
    if (gapOf() >= need) return;

    // Partial-lock re-rolls must not move the camera (r8 lock freeze).
    if (!holdCamera) {
      const cap = camera.aspect <= 1 ? 18 : 16.8;
      let lo = baseDist;
      let hi = Math.min(cap, Math.max(lo + 0.25, lo * 1.04));
      const gapAtDist = (dist) => {
        baseDist = dist;
        applyCamera();
        camera.updateMatrixWorld();
        return gapOf();
      };
      if (gapAtDist(hi) < need) hi = cap;
      if (gapAtDist(hi) >= need) {
        for (let i = 0; i < 16; i++) {
          const mid = (lo + hi) * 0.5;
          if (gapAtDist(mid) >= need) hi = mid;
          else lo = mid;
        }
        gapAtDist(hi);
        if (gapOf() >= need) return;
      } else {
        gapAtDist(hi);
      }
    }

    // Camera cap isn't enough (tall silhouettes on a packed row), or
    // the camera is frozen under a lock. Scale unlocked dice down just
    // enough, keeping x/z, so numerals stay close.
    const bases = all.map((d) => ({
      d,
      scale: d.userData.scale,
      restY: d.userData.restY,
    }));
    const applyFactor = (f) => {
      for (const b of bases) {
        if (b.d.userData.locked) continue;
        b.d.userData.scale = b.scale * f;
        b.d.userData.mesh.scale.setScalar(b.d.userData.scale);
        b.d.userData.restY = b.restY * f;
        b.d.position.y = b.d.userData.restY;
      }
      camera.updateMatrixWorld();
      return gapOf();
    };
    let sLo = 0.88;
    let sHi = 1;
    const atFloor = applyFactor(sLo) < need;
    if (!atFloor) {
      for (let i = 0; i < 16; i++) {
        const mid = (sLo + sHi) * 0.5;
        if (applyFactor(mid) >= need) sLo = mid;
        else sHi = mid;
      }
      applyFactor(sLo);
    }
    if (gapOf() >= need) return;

    // Still short: nudge unlocked dice away from the tight rail. This
    // is the usual path for a locked re-roll whose unlocked die settled
    // close to a lip while the camera and locked dice must stay put.
    const trayLimit = inner - 0.35;
    for (let iter = 0; iter < 14; iter++) {
      const g = railScreenGaps(all);
      if ((g.min ?? 0) >= need) break;
      let moved = false;
      for (const rec of g.perDie) {
        const d = all.find((x) => x.userData.index === rec.index);
        if (!d || d.userData.locked) continue;
        if (rec.min >= need) continue;
        const step = 0.035;
        if (rec.far < need) { d.position.z += step; moved = true; }
        if (rec.left < need) { d.position.x += step; moved = true; }
        if (rec.right < need) { d.position.x -= step; moved = true; }
        d.position.x = Math.max(-trayLimit, Math.min(trayLimit, d.position.x));
        d.position.z = Math.max(-trayLimit, Math.min(trayLimit, d.position.z));
      }
      if (!moved) break;
      separateDice(all, 0.08);
      clampDiceToTray(all, trayLimit);
    }
  }

  function ringScreenGaps(diceList) {
    const all = diceList || [...diceGroup.children];
    const list = all.filter((d) => d.userData.locked && d.userData.ring?.visible);
    const pairs = [];
    const diePairs = [];
    let minGap = Infinity;
    let dieGapMin = Infinity;
    camera.updateMatrixWorld();
    const w = Math.max(1, renderer.domElement.clientWidth || renderer.domElement.width);
    const h = Math.max(1, renderer.domElement.clientHeight || renderer.domElement.height);
    const recs = list.map((die) => {
      const p = ringPlacement(die);
      const center = ringWorldCenter(die, p.toward, p.towardExt);
      const sc = { x: 0, y: 0 };
      toScreenPx(center, w, h, sc);
      const radius = die.userData.ringRadius || p.preferred;
      const rPx = screenOuterRadiusPx(center, p.toward, radius, w, h);
      return { die, sc, rPx, radius };
    });
    for (let i = 0; i < recs.length; i++) {
      for (let j = i + 1; j < recs.length; j++) {
        const dist = Math.hypot(recs[i].sc.x - recs[j].sc.x, recs[i].sc.y - recs[j].sc.y);
        const gap = dist - recs[i].rPx - recs[j].rPx;
        pairs.push({
          i: recs[i].die.userData.index,
          j: recs[j].die.userData.index,
          gap,
          dist,
          r0: recs[i].rPx,
          r1: recs[j].rPx,
        });
        if (gap < minGap) minGap = gap;
      }
    }
    const hulls = all.map((d) => ({ die: d, hull: dieScreenHull(d, w, h) }));
    for (const r of recs) {
      for (const hRec of hulls) {
        if (hRec.die === r.die) continue;
        const gap = circleHullGap(r.sc.x, r.sc.y, r.rPx, hRec.hull);
        diePairs.push({
          ring: r.die.userData.index,
          die: hRec.die.userData.index,
          gap,
        });
        if (gap < dieGapMin) dieGapMin = gap;
      }
    }
    return {
      ok: list.length < 2 || minGap > 0,
      minGap,
      pairs,
      count: list.length,
      dieGapMin,
      dieGapOk: list.length === 0 || dieGapMin >= 4,
      diePairs,
    };
  }

  function clearRings() {
    for (const child of [...markers.children]) {
      markers.remove(child);
      child.geometry?.dispose?.();
    }
  }

  return {
    renderer,
    scene,
    camera,
    diceGroup,
    markers,
    trayHalf: inner,
    resize,
    pick,
    addTrauma,
    updateShake,
    setViewPull,
    setFrameCount,
    setLayout,
    fitToCount,
    fitToDice,
    setCamProfile,
    railScreenGaps,
    ensureRailClearance,
    towardFrom,
    screenUp,
    syncRing,
    syncRings,
    ringScreenGaps,
    clearRings,
    camHome,
  };
}
