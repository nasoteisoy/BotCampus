import * as THREE from 'three';
import { fairRoll } from './random.js';
import { createDiceAudio } from './audio.js';
import {
  DIE_TYPES,
  createDie,
  quatForValue,
  readUpValue,
  readCameraFacingValue,
  restYForQuat,
  accentResult,
  resultTextUpAngle,
  slotPositions,
  limitTilt,
  spacingForType,
  estimateRadius,
  separateDice,
  overlapDepth,
  horizontalRadius,
  layoutMulFor,
  d4NumeralFrac,
  clampDiceToTray,
  pullDiceFromFarWall,
  chipFarLane,
  maxDieXZ,
  ACCENT_INK,
  ACCENT_GOLD,
  ACCENT_FACE,
} from './dice.js';
import { createWorld } from './scene.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MUTE_KEY = 'botcampus:dice-roll:mute';

const svg = (paths, attrs = '') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" ${attrs}>${paths}</svg>`;

const ICONS = {
  plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  minus: svg('<line x1="5" y1="12" x2="19" y2="12"/>'),
  volume: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.1 5a9 9 0 0 1 0 14M15.5 8.5a5 5 0 0 1 0 7"/>'),
  mute: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'),
  d4: svg('<polygon points="12,3 21,20 3,20"/>'),
  d6: svg('<rect x="5" y="5" width="14" height="14" rx="2"/>'),
  d8: svg('<polygon points="12,2 22,12 12,22 2,12"/>'),
  d10: svg('<polygon points="12,2 21,10 17,22 7,22 3,10"/>'),
  d12: svg('<polygon points="12,2 20,7 20,17 12,22 4,17 4,7"/>'),
  d20: svg('<polygon points="12,1 22,8 18,21 6,21 2,8"/>'),
};

const el = {
  app: document.getElementById('app'),
  history: document.getElementById('history'),
  mute: document.getElementById('btn-mute'),
  total: document.getElementById('total'),
  stage: document.getElementById('stage'),
  hint: document.getElementById('hint'),
  minus: document.getElementById('btn-minus'),
  plus: document.getElementById('btn-plus'),
  count: document.getElementById('count'),
  types: document.getElementById('types'),
  roll: document.getElementById('btn-roll'),
  chips: document.getElementById('die-chips'),
};

el.minus.innerHTML = ICONS.minus;
el.plus.innerHTML = ICONS.plus;

const audio = createDiceAudio();
try {
  if (localStorage.getItem(MUTE_KEY) === '1') audio.setMuted(true);
} catch (_) { /* ignore */ }

const world = createWorld(el.stage);
const GRAVITY = -32;
const RESTITUTION = 0.52;
const TRAY = world.trayHalf - 0.35;

let type = 'd6';
let count = 2;
let dice = [];
let history = [];
let rollId = 0;
let rolling = false;
let hintShown = true;
let shakeArmed = false;
let lastShake = 0;
let lastAcc = { x: 0, y: 0, z: 0, t: 0 };
let anim = null;
let lastFrame = performance.now();

function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (_) { /* ignore */ }
}

function paintMute() {
  el.mute.innerHTML = audio.muted ? ICONS.mute : ICONS.volume;
  el.mute.setAttribute('aria-label', audio.muted ? 'Sound off' : 'Sound on');
  el.mute.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
}

function paintTypes() {
  el.types.innerHTML = '';
  for (const t of DIE_TYPES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'type-chip';
    btn.dataset.type = t.id;
    btn.setAttribute('aria-label', t.label);
    btn.setAttribute('aria-pressed', t.id === type ? 'true' : 'false');
    btn.innerHTML = `${ICONS[t.id]}<span>${t.label}</span>`;
    btn.addEventListener('click', () => setType(t.id));
    el.types.appendChild(btn);
  }
}

function paintCount() {
  el.count.textContent = String(count);
  el.minus.disabled = count <= 1;
  el.plus.disabled = count >= 6;
}

function paintHistory(flashLast) {
  el.history.innerHTML = '';
  for (let i = 0; i < history.length; i++) {
    const pill = document.createElement('span');
    pill.className = 'pill' + (flashLast && i === 0 ? ' new' : '');
    pill.textContent = String(history[i]);
    el.history.appendChild(pill);
  }
}

function currentTotal() {
  return dice.reduce((s, d) => s + d.userData.value, 0);
}

function paintTotal(pop) {
  const total = currentTotal();
  el.total.textContent = String(total);
  if (pop && !reducedMotion) {
    el.total.classList.remove('pop');
    void el.total.offsetWidth;
    el.total.classList.add('pop');
  }
}

function hideHint() {
  if (!hintShown) return;
  hintShown = false;
  el.hint.classList.add('hidden');
}

function settleToward(slot, dieType) {
  const at = new THREE.Vector3(slot.x, 0.4, slot.z);
  const cam = world.towardFrom(at);
  if (dieType === 'd6' || dieType === 'd8' || dieType === 'd4') return new THREE.Vector3(0, 1, 0);
  return limitTilt(cam, 28);
}

function settleOptions(slot, dieType = type) {
  return {
    toward: settleToward(slot, dieType),
    screenUp: world.screenUp(),
  };
}

function isPortrait() {
  const wrap = el.stage.parentElement || el.stage;
  return wrap.clientHeight >= wrap.clientWidth;
}

function isDesktop() {
  return !isPortrait() && (el.stage?.clientWidth || 0) >= 1100;
}

function currentLayoutMul() {
  const portrait = isPortrait();
  const desktop = isDesktop();
  return layoutMulFor(type, count, {
    portrait,
    tray: TRAY,
    desktopBoost: desktop && count >= 5,
    landscapeBoost: !portrait && !desktop && count >= 5,
  });
}

function applyDieScales() {
  const mul = currentLayoutMul();
  for (const d of dice) {
    if (d.userData.locked) continue;
    const base = d.userData.proto.sizeScale;
    d.userData.scale = base * mul;
    d.userData.mesh.scale.setScalar(d.userData.scale);
    d.userData.layoutMul = mul;
    d.userData.restY = restYForQuat(d, d.quaternion);
    d.position.y = d.userData.restY;
  }
  return mul;
}

function layoutOptions() {
  const mul = currentLayoutMul();
  const radius = estimateRadius(type) * mul;
  return {
    portrait: isPortrait(),
    spacing: 2 * radius + 0.12,
    radius,
    tray: TRAY,
    clamp: true,
  };
}

function currentSlots() {
  return slotPositions(count, layoutOptions());
}

function freezeLockedDice() {
  return dice.filter((d) => d.userData.locked).map((d) => ({
    d,
    x: d.position.x,
    y: d.position.y,
    z: d.position.z,
    qx: d.quaternion.x,
    qy: d.quaternion.y,
    qz: d.quaternion.z,
    qw: d.quaternion.w,
    scale: d.userData.scale,
    restY: d.userData.restY,
    layoutMul: d.userData.layoutMul,
  }));
}

function restoreLockedDice(frozen) {
  for (const s of frozen) {
    const d = s.d;
    if (!d.userData.locked) continue;
    if (s.scale > 0) {
      d.userData.scale = s.scale;
      d.userData.mesh.scale.setScalar(s.scale);
    }
    if (s.layoutMul > 0) d.userData.layoutMul = s.layoutMul;
    d.quaternion.set(s.qx, s.qy, s.qz, s.qw);
    d.userData.restY = s.restY ?? restYForQuat(d, d.quaternion);
    d.position.set(s.x, d.userData.restY, s.z);
  }
}

function finishSettle() {
  const frozen = freezeLockedDice();
  const hasLocks = frozen.length > 0;
  applyDieScales();
  restoreLockedDice(frozen);
  separateDice(dice, 0.08);
  clampDiceToTray(dice, TRAY);
  pullDiceFromFarWall(dice, TRAY, chipFarLane(count, { portrait: isPortrait() }));
  restoreLockedDice(frozen);
  // Keep the camera still when a locked die is in the tray so a re-roll
  // of the others cannot nudge it on screen. Still clear unlocked dice
  // of the rails without moving locked poses or the camera.
  if (!hasLocks) world.fitToDice(dice);
  else world.ensureRailClearance(dice, { holdCamera: true });
  for (const d of dice) {
    if (d.userData.locked) continue;
    const slot = { x: d.position.x, z: d.position.z };
    const q = quatForValue(d, d.userData.value, settleOptions(slot, d.userData.type));
    d.userData.restY = restYForQuat(d, q);
    d.quaternion.copy(q);
    d.position.y = d.userData.restY;
  }
  separateDice(dice, 0.08);
  clampDiceToTray(dice, TRAY);
  pullDiceFromFarWall(dice, TRAY, chipFarLane(count, { portrait: isPortrait() }));
  restoreLockedDice(frozen);
  if (!hasLocks) world.fitToDice(dice);
  else world.ensureRailClearance(dice, { holdCamera: true });
  restoreLockedDice(frozen);
  for (const d of dice) {
    if (!d.userData.locked) accentResult(d, d.userData.value, world.camera);
  }
  world.syncRings(dice);
}

function placeDie(d, slot, value) {
  d.userData.value = value;
  const q = quatForValue(d, value, settleOptions(slot, d.userData.type));
  d.userData.restY = restYForQuat(d, q);
  d.quaternion.copy(q);
  d.position.set(slot.x, d.userData.restY, slot.z);
  d.scale.set(1, 1, 1);
  accentResult(d, value, world.camera);
  world.syncRing(d);
}

const _chipProj = new THREE.Vector3();
const LOCK_SVG = '<svg class="lock-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2"/><rect x="5" y="10" width="14" height="11" rx="2"/></svg>';

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
  if (!poly || poly.length < 3) return false;
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

function distPointPoly(px, py, poly) {
  if (!poly || poly.length < 2) return Infinity;
  if (pointInPoly([px, py], poly)) return 0;
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    m = Math.min(m, distPointSeg(px, py, A[0], A[1], B[0], B[1]));
  }
  return m;
}

function rectHullDist(r, hull) {
  const pts = [
    [r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom],
    [(r.left + r.right) * 0.5, r.top], [(r.left + r.right) * 0.5, r.bottom],
    [r.left, (r.top + r.bottom) * 0.5], [r.right, (r.top + r.bottom) * 0.5],
    [(r.left + r.right) * 0.5, (r.top + r.bottom) * 0.5],
  ];
  let best = Infinity;
  for (const p of pts) best = Math.min(best, distPointPoly(p[0], p[1], hull));
  return best;
}

function rectCircleDist(r, cx, cy) {
  const dx = Math.max(r.left - cx, 0, cx - r.right);
  const dy = Math.max(r.top - cy, 0, cy - r.bottom);
  if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return 0;
  return Math.hypot(dx, dy);
}

function projectTrayQuad(rect, y, wall) {
  const pts = [];
  for (const [x, z] of [[-wall, -wall], [wall, -wall], [wall, wall], [-wall, wall]]) {
    _chipProj.set(x, y, z).project(world.camera);
    pts.push([
      (_chipProj.x * 0.5 + 0.5) * rect.width,
      (-_chipProj.y * 0.5 + 0.5) * rect.height,
    ]);
  }
  return pts;
}

function trayScreenBounds(rect) {
  const wall = world.trayHalf - 0.04;
  // Felt-plane corners keep chips off the FAR rail's inner face (visible
  // between y=0 and y=0.5). Rail-top corners keep chips off the NEAR rail
  // (whose top edge sits inward of the felt junction in screen space).
  return {
    felt: projectTrayQuad(rect, 0.02, wall),
    rail: projectTrayQuad(rect, 0.5, wall),
  };
}

function rectInTray(r, bounds, margin = 0) {
  // `margin` is clearance inside the tray: the chip plus this pad must
  // stay inside both the felt-plane and rail-top inner walls.
  const padded = {
    left: r.left - margin,
    right: r.right + margin,
    top: r.top - margin,
    bottom: r.bottom + margin,
  };
  return rectInPoly(padded, bounds.felt, 0) && rectInPoly(padded, bounds.rail, 0);
}

function trayCentroid(bounds) {
  const pts = bounds.felt;
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return { x: x / pts.length, y: y / pts.length };
}

function rectInPoly(r, poly, inset = 0) {
  const corners = [
    [r.left + inset, r.top + inset],
    [r.right - inset, r.top + inset],
    [r.left + inset, r.bottom - inset],
    [r.right - inset, r.bottom - inset],
  ];
  return corners.every((p) => pointInPoly(p, poly));
}

function projectDieBox(d, rect) {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, midZ = 0, n = 0;
  const verts = d.userData.unitVerts || [];
  const pts = [];
  if (verts.length) {
    for (const p of verts) {
      _chipProj.copy(p).multiplyScalar(d.userData.scale).applyQuaternion(d.quaternion).add(d.position);
      _chipProj.project(world.camera);
      const sx = (_chipProj.x * 0.5 + 0.5) * rect.width;
      const sy = (-_chipProj.y * 0.5 + 0.5) * rect.height;
      pts.push([sx, sy]);
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      midZ += _chipProj.z;
      n++;
    }
  } else {
    _chipProj.copy(d.position).project(world.camera);
    const sx = (_chipProj.x * 0.5 + 0.5) * rect.width;
    const sy = (-_chipProj.y * 0.5 + 0.5) * rect.height;
    minX = maxX = sx;
    minY = sy - 40;
    maxY = sy + 40;
    midZ = _chipProj.z;
    n = 1;
    pts.push([sx, minY], [sx, maxY], [sx - 20, sy], [sx + 20, sy]);
  }
  return { minX, maxX, minY, maxY, midZ: midZ / Math.max(1, n), pts, hull: convexHull2(pts) };
}

function rectsOverlap(a, b, slack = 2) {
  return a.left < b.right - slack && a.right > b.left + slack && a.top < b.bottom - slack && a.bottom > b.top + slack;
}

function ringScreen(die, rect) {
  const ring = die?.userData.ring;
  if (!ring || !ring.visible) return null;
  world.camera.updateMatrixWorld();
  _chipProj.copy(ring.position).project(world.camera);
  const x = (_chipProj.x * 0.5 + 0.5) * rect.width;
  const y = (-_chipProj.y * 0.5 + 0.5) * rect.height;
  const wr = (die.userData.ringRadius || 0.35) + 0.05;
  // Measure radius in the ring plane along camera-right so the hoop is not underestimated.
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(ring.quaternion);
  const right = new THREE.Vector3().setFromMatrixColumn(world.camera.matrixWorld, 0);
  right.addScaledVector(normal, -right.dot(normal));
  if (right.lengthSq() < 1e-8) right.setFromMatrixColumn(world.camera.matrixWorld, 1);
  right.normalize();
  _chipProj.copy(ring.position).addScaledVector(right, wr).project(world.camera);
  const sx = (_chipProj.x * 0.5 + 0.5) * rect.width;
  const sy = (-_chipProj.y * 0.5 + 0.5) * rect.height;
  return { x, y, rPx: Math.hypot(sx - x, sy - y) };
}

function paintChips(visible = true) {
  const wrap = el.chips;
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!visible) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  const rect = el.stage.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const PAD = 6;
  const GAP = 12;
  const dieBoxes = dice.map((d) => {
    const b = projectDieBox(d, rect);
    return {
      die: d,
      ...b,
      cx: (b.minX + b.maxX) * 0.5,
      cy: (b.minY + b.maxY) * 0.5,
      hull: b.hull,
      rect: { left: b.minX, right: b.maxX, top: b.minY, bottom: b.maxY },
    };
  });
  const order = dieBoxes.slice().sort((a, b) => {
    const z = a.die.position.z - b.die.position.z;
    if (Math.abs(z) > 0.1) return z;
    // Same row: outer seats first so the mid-alley stays free for the centre die.
    return Math.abs(b.die.position.x) - Math.abs(a.die.position.x);
  });
  const minZ = Math.min(...dieBoxes.map((b) => b.die.position.z));
  const placed = [];
  const padDie = (r, px) => ({
    left: r.left - px, right: r.right + px, top: r.top - px, bottom: r.bottom + px,
  });
  const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leaders.setAttribute('class', 'chip-leaders');
  leaders.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  leaders.setAttribute('width', String(rect.width));
  leaders.setAttribute('height', String(rect.height));
  wrap.appendChild(leaders);
  const trayBounds = trayScreenBounds(rect);

  const footDist = (box, pt) => Math.hypot(
    Math.max(box.left - pt.x, pt.x - box.right, 0),
    Math.max(box.top - pt.y, pt.y - box.bottom, 0),
  );
  const chipPt = (r) => ({ x: (r.left + r.right) * 0.5, y: (r.top + r.bottom) * 0.5 });

  function ownedBy(r, info) {
    const own = rectHullDist(r, info.hull);
    for (const other of dieBoxes) {
      if (other.die === info.die) continue;
      const od = rectHullDist(r, other.hull);
      if (od <= own + 8) return false;
    }
    return true;
  }

  function nearestOther(r, info) {
    let best = Infinity;
    for (const other of dieBoxes) {
      if (other.die === info.die) continue;
      const d = rectHullDist(r, other.hull);
      if (d < best) best = d;
    }
    return best;
  }

  function addLeader(r, info) {
    const c = chipPt(r);
    const own = footDist(info.rect, c);
    const halfW = (info.rect.right - info.rect.left) * 0.5;
    if (own < 8) return;
    if (Math.abs(c.x - info.cx) < halfW * 0.55 && own < 16) return;
    const targetX = Math.min(Math.max(c.x, info.rect.left), info.rect.right);
    const targetY = Math.min(Math.max(c.y, info.rect.top), info.rect.bottom);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(c.x));
    line.setAttribute('y1', String(c.y));
    line.setAttribute('x2', String(targetX));
    line.setAttribute('y2', String(targetY));
    leaders.appendChild(line);
  }

  for (const info of order) {
    const isBack = info.die.position.z <= minZ + 0.1;
    const chip = document.createElement('span');
    chip.className = 'die-chip';
    chip.dataset.index = String(info.die.userData.index);
    if (info.die.userData.locked) {
      chip.classList.add('locked');
      chip.innerHTML = LOCK_SVG;
    }
    if (dice.length >= 5) chip.classList.add('compact');
    const label = document.createElement('span');
    label.textContent = String(info.die.userData.value);
    chip.appendChild(label);
    wrap.appendChild(chip);
    const compact = chip.classList.contains('compact');
    const cw = Math.max(compact ? 26 : 32, chip.offsetWidth);
    const ch = Math.max(compact ? 24 : 28, chip.offsetHeight);
    const cx = info.cx;
    const midY = info.cy;
    const dieH = info.maxY - info.minY;
    const dieW = info.maxX - info.minX;
    const numeralClear = 0.3 * dieH;
    // Sit close to the owned silhouette so the 8px ownership margin is easy to keep.
    const sideShift = dieW * 0.5 + cw * 0.5 + GAP;
    const tightShift = dieW * 0.5 + cw * 0.5 + 6;
    const wideShift = dieW * 0.5 + cw * 0.5 + GAP + 16;
    const above = [
      { x: cx, anchor: info.minY - GAP, below: false },
      { x: cx - tightShift * 0.3, anchor: info.minY - GAP, below: false },
      { x: cx + tightShift * 0.3, anchor: info.minY - GAP, below: false },
    ];
    const belowC = [
      { x: cx, anchor: info.maxY + GAP, below: true },
      { x: cx - tightShift * 0.3, anchor: info.maxY + GAP, below: true },
      { x: cx + tightShift * 0.3, anchor: info.maxY + GAP, below: true },
    ];
    const sideAt = (shift) => [
      { x: cx - shift, anchor: midY - ch * 0.5, below: true },
      { x: cx + shift, anchor: midY - ch * 0.5, below: true },
      { x: cx - shift, anchor: info.minY, below: true },
      { x: cx + shift, anchor: info.minY, below: true },
      { x: cx - shift, anchor: info.maxY - ch, below: true },
      { x: cx + shift, anchor: info.maxY - ch, below: true },
      { x: cx - shift, anchor: info.maxY + GAP, below: true },
      { x: cx + shift, anchor: info.maxY + GAP, below: true },
      { x: cx - shift, anchor: info.minY - GAP, below: false },
      { x: cx + shift, anchor: info.minY - GAP, below: false },
    ];
    const sides = sideAt(tightShift).concat(sideAt(sideShift), sideAt(wideShift));
    const hasFront = dieBoxes.some((o) => o.die !== info.die && o.die.position.z > info.die.position.z + 0.12);
    const hasBack = dieBoxes.some((o) => o.die !== info.die && o.die.position.z < info.die.position.z - 0.12);
    const isMid = hasFront && hasBack;
    let candidates;
    // Mid dice: sides first (below/above collide with front/back neighbours).
    // Back dice: above, then sides — below lands on the next row.
    if (isMid) candidates = sides.concat(above, belowC);
    else if (isBack) candidates = above.concat(sides, belowC);
    else candidates = belowC.concat(sides, above);

    const chipRect = (c) => {
      const left = c.x - cw / 2;
      const top = c.below ? c.anchor : c.anchor - ch;
      return {
        left,
        right: left + cw,
        top,
        bottom: top + ch,
        below: c.below,
        x: c.x,
      };
    };
    const inStage = (r) => (
      r.left >= PAD && r.right <= rect.width - PAD
      && r.top >= PAD && r.bottom <= rect.height - PAD
      && rectInTray(r, trayBounds, 4)
    );
    const hitsDie = (r) => dieBoxes.some((other) => rectHullDist(r, other.hull) < 2);
    const hitsChip = (r) => placed.some((p) => rectsOverlap(r, p, 3));
    const coversNumeral = (r) => rectCircleDist(r, info.cx, info.cy) < numeralClear;
    const hitsRing = (r) => {
      const rs = ringScreen(info.die, rect);
      if (!rs) return false;
      return rectCircleDist(r, rs.x, rs.y) < rs.rPx + 2;
    };

    const clampToTray = (r) => {
      r.left = Math.min(Math.max(r.left, PAD), rect.width - PAD - cw);
      r.right = r.left + cw;
      r.top = Math.min(Math.max(r.top, PAD), rect.height - PAD - ch);
      r.bottom = r.top + ch;
      r.x = (r.left + r.right) * 0.5;
      if (rectInTray(r, trayBounds, 2)) return r;
      const tc = trayCentroid(trayBounds);
      const tcx = tc.x, tcy = tc.y;
      const c = chipPt(r);
      const dx = tcx - c.x, dy = tcy - c.y;
      const len = Math.hypot(dx, dy) || 1;
      for (let i = 1; i <= 24; i++) {
        const nx = c.x + (dx / len) * i * 2;
        const ny = c.y + (dy / len) * i * 2;
        const nr = {
          left: nx - cw / 2, right: nx + cw / 2,
          top: ny - ch / 2, bottom: ny + ch / 2,
          below: r.below, x: nx,
        };
        if (rectInTray(nr, trayBounds, 2)) return nr;
      }
      return r;
    };

    const legal = (r) => (
      inStage(r) && !hitsChip(r) && !hitsDie(r)
      && !coversNumeral(r) && !hitsRing(r) && ownedBy(r, info)
    );
    const scoreOf = (r) => {
      const own = rectHullDist(r, info.hull);
      const other = nearestOther(r, info);
      const ownPen = own < 4 ? (4 - own) * 2 : Math.max(0, own - 16) * 0.6;
      return (other - own) - ownPen;
    };

    let best = null;
    let bestScore = -Infinity;
    const consider = (r) => {
      if (!legal(r)) return;
      const score = scoreOf(r);
      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
    };
    for (const c of candidates) {
      consider(chipRect(c));
      consider(clampToTray(chipRect(c)));
    }
    if (!best) {
      const extras = [];
      for (const g of [4, 6, 8, GAP, GAP + 8, GAP + 16, numeralClear + 4]) {
        extras.push({ x: cx, anchor: info.maxY + g, below: true });
        extras.push({ x: cx, anchor: info.minY - g, below: false });
        for (const sh of [tightShift, sideShift, wideShift]) {
          extras.push({ x: cx - sh, anchor: info.maxY + g, below: true });
          extras.push({ x: cx + sh, anchor: info.maxY + g, below: true });
          extras.push({ x: cx - sh, anchor: info.minY - g, below: false });
          extras.push({ x: cx + sh, anchor: info.minY - g, below: false });
          extras.push({ x: cx - sh - g, anchor: midY - ch * 0.5, below: true });
          extras.push({ x: cx + sh + g, anchor: midY - ch * 0.5, below: true });
        }
      }
      const rad0 = Math.max(dieW, dieH) * 0.5 + Math.max(cw, ch) * 0.5;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        for (const rad of [rad0 + 4, rad0 + 10, rad0 + 18, rad0 + 28, rad0 + 40]) {
          const x = cx + Math.cos(a) * rad;
          const y = midY + Math.sin(a) * rad;
          extras.push({ x, anchor: y - ch * 0.5, below: true });
        }
      }
      for (const c of extras) {
        consider(chipRect(c));
        consider(clampToTray(chipRect(c)));
      }
    }
    if (!best) {
      // Dense annulus around this die — still fully legal, never on a face or rail.
      const rad0 = Math.max(dieW, dieH) * 0.5 + Math.max(cw, ch) * 0.5;
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        for (let rad = rad0 + 2; rad <= rad0 + 70; rad += 5) {
          const x = cx + Math.cos(a) * rad;
          const y = midY + Math.sin(a) * rad;
          consider({
            left: x - cw / 2, right: x + cw / 2,
            top: y - ch / 2, bottom: y + ch / 2,
            below: y >= midY, x,
          });
        }
      }
    }
    if (!best) {
      // Last legal-ish resort: stay in the tray and off every die / numeral / ring.
      // Ownership is preferred but may be dropped only if no other seat exists.
      let fallback = null;
      let fallbackScore = -Infinity;
      const trySoft = (r) => {
        if (!inStage(r) || hitsChip(r) || hitsDie(r) || coversNumeral(r) || hitsRing(r)) return;
        const own = rectHullDist(r, info.hull);
        const other = nearestOther(r, info);
        const score = (other - own) + (ownedBy(r, info) ? 1000 : 0);
        if (score > fallbackScore) { fallback = r; fallbackScore = score; }
      };
      const rad0 = Math.max(dieW, dieH) * 0.5 + Math.max(cw, ch) * 0.5;
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        for (let rad = rad0 + 2; rad <= rad0 + 80; rad += 6) {
          const x = cx + Math.cos(a) * rad;
          const y = midY + Math.sin(a) * rad;
          trySoft({
            left: x - cw / 2, right: x + cw / 2,
            top: y - ch / 2, bottom: y + ch / 2,
            below: y >= midY, x,
          });
        }
      }
      best = fallback;
    }
    if (!best) {
      // Sweep the tray for any fully legal seat (in-tray, off dice, owned).
      const x0 = cw / 2 + PAD, x1 = rect.width - cw / 2 - PAD;
      const y0 = ch / 2 + PAD, y1 = rect.height - ch / 2 - PAD;
      for (let y = y0; y <= y1; y += 8) {
        for (let x = x0; x <= x1; x += 8) {
          consider({
            left: x - cw / 2, right: x + cw / 2,
            top: y - ch / 2, bottom: y + ch / 2,
            below: y >= midY, x,
          });
        }
      }
    }
    if (!best) {
      const last = [
        clampToTray(chipRect({ x: cx - tightShift, anchor: midY - ch * 0.5, below: true })),
        clampToTray(chipRect({ x: cx + tightShift, anchor: midY - ch * 0.5, below: true })),
        clampToTray(chipRect({ x: cx, anchor: info.maxY + GAP, below: true })),
        clampToTray(chipRect({ x: cx, anchor: info.minY - GAP, below: false })),
      ];
      best = last.find((r) => rectInTray(r, trayBounds, 0) && !hitsDie(r) && !coversNumeral(r) && !hitsRing(r))
        || last.find((r) => rectInTray(r, trayBounds, 0) && !hitsDie(r) && !coversNumeral(r))
        || last.find((r) => rectInTray(r, trayBounds, 0));
    }
    // Walk the chosen seat toward its own die to pick up the 8px ownership margin.
    if (best) {
      const ocx = (best.left + best.right) * 0.5;
      const ocy = (best.top + best.bottom) * 0.5;
      const dx = info.cx - ocx, dy = info.cy - ocy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      let nudged = best;
      let bestM = nearestOther(best, info) - rectHullDist(best, info.hull);
      const px = -uy, py = ux;
      for (let s = 1; s <= 28; s++) {
        for (const lat of [0, 4, -4, 8, -8, 12, -12]) {
          const nx = ocx + ux * s + px * lat, ny = ocy + uy * s + py * lat;
          const nr = {
            left: nx - cw / 2, right: nx + cw / 2,
            top: ny - ch / 2, bottom: ny + ch / 2,
            below: ny >= midY, x: nx,
          };
          if (!inStage(nr) || hitsDie(nr) || hitsChip(nr) || coversNumeral(nr) || hitsRing(nr)) continue;
          const m = nearestOther(nr, info) - rectHullDist(nr, info.hull);
          if (m > bestM || (ownedBy(nr, info) && !ownedBy(nudged, info))) {
            nudged = nr;
            bestM = m;
          }
        }
      }
      // Grow the ownership margin toward a 10px cushion (tests require >8px).
      const needMore = nudged && (nearestOther(nudged, info) - rectHullDist(nudged, info.hull) < 10);
      if (needMore) {
        const ocx2 = (nudged.left + nudged.right) * 0.5;
        const ocy2 = (nudged.top + nudged.bottom) * 0.5;
        let ox = ocx2, oy = ocy2, bestOther = Infinity;
        for (const other of dieBoxes) {
          if (other.die === info.die) continue;
          const d = rectHullDist(nudged, other.hull);
          if (d < bestOther) {
            bestOther = d;
            ox = other.cx;
            oy = other.cy;
          }
        }
        const dx2 = ocx2 - ox, dy2 = ocy2 - oy;
        const len2 = Math.hypot(dx2, dy2) || 1;
        const ux2 = dx2 / len2, uy2 = dy2 / len2;
        let bestM2 = nearestOther(nudged, info) - rectHullDist(nudged, info.hull);
        for (const s of [...Array.from({ length: 28 }, (_, i) => i + 1), 0.5, 1.5, 2.5, 3.5]) {
          for (const lat of [0, 2, -2, 4, -4, 6, -6, 8, -8]) {
            const nx = ocx2 + ux2 * s + -uy2 * lat;
            const ny = ocy2 + uy2 * s + ux2 * lat;
            const nr = {
              left: nx - cw / 2, right: nx + cw / 2,
              top: ny - ch / 2, bottom: ny + ch / 2,
              below: ny >= midY, x: nx,
            };
            if (!inStage(nr) || hitsDie(nr) || hitsChip(nr) || coversNumeral(nr) || hitsRing(nr)) continue;
            const m = nearestOther(nr, info) - rectHullDist(nr, info.hull);
            if (m > bestM2 || (ownedBy(nr, info) && !ownedBy(nudged, info))) {
              nudged = nr;
              bestM2 = m;
            }
          }
        }
      }
      best = nudged;
    }
    chip.classList.toggle('below', !!best.below);
    chip.style.left = `${(best.left + best.right) * 0.5}px`;
    chip.style.top = best.below ? `${best.top}px` : `${best.bottom}px`;
    if (info.midZ > 1) chip.classList.add('hidden');
    addLeader(best, info);
    placed.push(best);
  }
}

function rebuildDice(keepLocks = false, presetValues = null) {
  const prevLocks = keepLocks ? dice.map((d) => d.userData.locked) : [];
  const prevValues = keepLocks ? dice.map((d) => d.userData.value) : [];
  for (const d of dice) world.diceGroup.remove(d);
  world.clearRings();
  dice = [];
  const opts = layoutOptions();
  const slots = slotPositions(count, opts);
  world.setFrameCount(count, opts);
  for (let i = 0; i < count; i++) {
    const d = createDie(type);
    d.userData.index = i;
    world.diceGroup.add(d);
    dice.push(d);
    const mul = currentLayoutMul();
    d.userData.scale = d.userData.proto.sizeScale * mul;
    d.userData.mesh.scale.setScalar(d.userData.scale);
    d.userData.layoutMul = mul;
    const value = presetValues?.[i] ?? (prevValues[i] && prevValues[i] <= d.userData.sides ? prevValues[i] : fairRoll(d.userData.sides));
    placeDie(d, slots[i], value);
    if (prevLocks[i]) {
      d.userData.locked = true;
    }
  }
  finishSettle();
  paintTotal(false);
  paintChips(true);
}

function setType(next) {
  if (rolling || next === type) return;
  type = next;
  world.setCamProfile(type === 'd4' ? 'd4' : 'std');
  paintTypes();
  rebuildDice(false);
}

function setCount(next) {
  if (rolling) return;
  const n = Math.max(1, Math.min(6, next | 0));
  if (n === count) return;
  count = n;
  paintCount();
  rebuildDice(true);
}

function snapshot() {
  const values = dice.map((d) => d.userData.value);
  const camFacingValues = dice.map((d) => readCameraFacingValue(d, world.camera));
  const upValues = dice.map((d) => readUpValue(d));
  const readValues = (type === 'd6' || type === 'd8') ? upValues : camFacingValues;
  const total = values.reduce((a, b) => a + b, 0);
  const readTotal = readValues.reduce((a, b) => a + b, 0);
  const displayedTotal = Number.parseInt(el.total.textContent, 10);
  return {
    type,
    count,
    values,
    readValues,
    camFacingValues,
    upValues,
    total,
    readTotal,
    displayedTotal,
    locks: dice.map((d) => !!d.userData.locked),
    history: history.slice(),
    rollId,
    rolling,
    textUpAngles: dice.map((d) => resultTextUpAngle(d, world.camera)),
  };
}

function settleInstant(targets) {
  const slots = currentSlots();
  for (const d of targets) {
    placeDie(d, slots[d.userData.index], d.userData.value);
  }
  finishSettle();
}

function startTumble(pending) {
  const slots = currentSlots();
  for (const d of pending) {
    const slot = slots[d.userData.index];
    const targetQuat = quatForValue(d, d.userData.value, settleOptions(slot, d.userData.type));
    const restY = restYForQuat(d, targetQuat);
    const startPos = new THREE.Vector3(
      slot.x + (Math.random() - 0.5) * 0.6,
      restY + 1.6 + Math.random() * 0.8,
      slot.z + (Math.random() - 0.5) * 0.6,
    );
    d.position.copy(startPos);
    d.quaternion.set(
      Math.random(),
      Math.random(),
      Math.random(),
      Math.random(),
    ).normalize();
    d.userData.phys = {
      pos: startPos.clone(),
      vel: new THREE.Vector3((Math.random() - 0.5) * 5.5, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 5.5),
      ang: new THREE.Vector3(
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 22,
      ),
      quat: d.quaternion.clone(),
      targetQuat,
      slot,
      restY,
      radius: Math.max(0.45, d.userData.scale * 0.95),
    };
  }
}

function stepPhysics(pending, dt) {
  const qInc = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  for (const d of pending) {
    const p = d.userData.phys;
    p.vel.y += GRAVITY * dt;
    p.pos.addScaledVector(p.vel, dt);
    const w = p.ang.length();
    if (w > 1e-4) {
      axis.copy(p.ang).normalize();
      qInc.setFromAxisAngle(axis, w * dt);
      p.quat.premultiply(qInc).normalize();
    }
    const r = p.radius;
    if (p.pos.y < r) {
      p.pos.y = r;
      if (p.vel.y < 0) {
        const impact = Math.min(1, Math.abs(p.vel.y) / 12);
        p.vel.y *= -RESTITUTION;
        p.vel.x *= 0.82;
        p.vel.z *= 0.82;
        if (impact > 0.12) world.addTrauma(0.08 * impact);
      }
      if (Math.abs(p.vel.y) < 1.1) p.vel.y = 0;
    }
    for (const axisName of ['x', 'z']) {
      if (p.pos[axisName] > TRAY - r) {
        p.pos[axisName] = TRAY - r;
        p.vel[axisName] *= -RESTITUTION;
      } else if (p.pos[axisName] < -TRAY + r) {
        p.pos[axisName] = -TRAY + r;
        p.vel[axisName] *= -RESTITUTION;
      }
    }
    p.vel.multiplyScalar(Math.exp(-0.55 * dt));
    p.ang.multiplyScalar(Math.exp(-0.7 * dt));
  }
  // Soft sphere separation
  for (let i = 0; i < pending.length; i++) {
    for (let j = i + 1; j < pending.length; j++) {
      const a = pending[i].userData.phys;
      const b = pending[j].userData.phys;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const min = a.radius + b.radius;
      const dist = Math.hypot(dx, dz) || 0.0001;
      if (dist < min) {
        const push = (min - dist) * 0.5;
        const nx = dx / dist;
        const nz = dz / dist;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
      }
    }
  }
  for (const d of pending) {
    d.position.copy(d.userData.phys.pos);
    d.quaternion.copy(d.userData.phys.quat);
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function animateRoll(pending, duration) {
  startTumble(pending);
  paintChips(false);
  world.setViewPull(1.22);
  const physEnd = duration * 0.62;
  return new Promise((resolve) => {
    let t = 0;
    let squashed = false;
    anim = {
      step(dt) {
        t += dt * 1000;
        if (t < physEnd) {
          stepPhysics(pending, dt);
        } else {
          const u = easeInOut(Math.min(1, (t - physEnd) / (duration - physEnd)));
          world.setViewPull(1.22 - 0.22 * u);
          for (const d of pending) {
            const p = d.userData.phys;
            d.position.lerpVectors(p.pos, new THREE.Vector3(p.slot.x, p.restY, p.slot.z), u);
            d.quaternion.slerpQuaternions(p.quat, p.targetQuat, u);
            if (!reducedMotion) {
              const s = 1 + 0.08 * Math.sin(u * Math.PI);
              const y = 1 - 0.12 * Math.sin(u * Math.PI);
              d.scale.set(s, y, s);
            }
          }
          if (!squashed && u > 0.85) {
            squashed = true;
            world.addTrauma(0.18);
          }
        }
        if (t >= duration) {
          world.setViewPull(1);
          for (const d of pending) {
            const p = d.userData.phys;
            placeDie(d, p.slot, d.userData.value);
            if (!reducedMotion) d.scale.set(1, 1, 1);
          }
          finishSettle();
          anim = null;
          resolve();
        }
      },
    };
  });
}

async function roll({ instant = false, duration } = {}) {
  if (rolling) return snapshot();
  rolling = true;
  hideHint();
  audio.unlock();
  enableShake();

  const pending = dice.filter((d) => !d.userData.locked);
  if (!pending.length) {
    audio.deny();
    vibrate(18);
    rolling = false;
    return snapshot();
  }
  paintChips(false);

  for (const d of pending) d.userData.value = fairRoll(d.userData.sides);

  const ms = duration ?? (instant || reducedMotion ? 0 : 1350);
  if (ms > 0) {
    audio.roll(pending.length);
    vibrate([18, 35, 18, 40, 22, 50, 30]);
    await animateRoll(pending, ms);
  } else {
    settleInstant(pending);
  }

  audio.settle();
  vibrate(28);
  const total = currentTotal();
  history.unshift(total);
  if (history.length > 12) history.pop();
  rollId += 1;
  paintHistory(true);
  paintTotal(true);
  paintChips(true);
  rolling = false;
  return snapshot();
}

function toggleLock(die) {
  if (rolling || !die) return;
  die.userData.locked = !die.userData.locked;
  world.syncRings(dice);
  paintChips(!rolling);
  audio.unlock();
  if (die.userData.locked) vibrate(12);
}

async function enableShake() {
  if (shakeArmed) return;
  shakeArmed = true;
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== 'granted') return;
    }
  } catch (_) {
    return;
  }
  window.addEventListener('devicemotion', onMotion, { passive: true });
}

function onMotion(ev) {
  const a = ev.accelerationIncludingGravity;
  if (!a) return;
  const now = performance.now();
  const dt = (now - lastAcc.t) / 1000;
  const prev = lastAcc;
  lastAcc = { x: a.x || 0, y: a.y || 0, z: a.z || 0, t: now };
  if (!prev.t || dt <= 0 || dt > 0.2) return;
  if (rolling || now - lastShake < 900) return;
  const mag = Math.hypot(lastAcc.x - prev.x, lastAcc.y - prev.y, lastAcc.z - prev.z) / Math.max(dt, 0.016);
  if (mag > 240) {
    lastShake = now;
    roll();
  }
}

function onPointer() {
  let sx = 0;
  let sy = 0;
  let down = false;
  let moved = false;
  const stage = el.stage;

  stage.addEventListener('pointerdown', (e) => {
    down = true;
    moved = false;
    sx = e.clientX;
    sy = e.clientY;
    try { stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  });
  stage.addEventListener('pointermove', (e) => {
    if (down && Math.hypot(e.clientX - sx, e.clientY - sy) > 12) moved = true;
  });
  stage.addEventListener('pointerup', (e) => {
    if (!down) return;
    down = false;
    if (moved || rolling) return;
    const hit = world.pick(e.clientX, e.clientY, dice);
    if (hit) toggleLock(hit);
    else roll();
  });
  stage.addEventListener('pointercancel', () => { down = false; });
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;
  if (anim) anim.step(dt);
  world.updateShake(dt);
  world.renderer.render(world.scene, world.camera);
  if (!rolling && el.chips && !el.chips.classList.contains('hidden')) paintChips(true);
}

function contrastRatio(a, b) {
  const lum = (hex) => {
    const n = hex.replace('#', '');
    const v = [0, 2, 4].map((i) => {
      const c = parseInt(n.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const L1 = lum(a);
  const L2 = lum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function sampleAccentContrast() {
  const samples = [];
  const want = [
    { fill: ACCENT_INK, bg: ACCENT_GOLD, name: 'numeral' },
    { fill: ACCENT_INK, bg: ACCENT_FACE, name: 'pips' },
  ];
  for (const w of want) samples.push({ ...w, ratio: contrastRatio(w.fill, w.bg) });
  // Also probe live atlas / pip canvas pixels for ink-vs-surround.
  let liveMin = Infinity;
  for (const d of dice) {
    let canvas = d.userData.atlasCanvas;
    if (!canvas && d.userData.type === 'd6') {
      const maps = d.userData.mesh.material.map((m) => m.map?.image).filter(Boolean);
      canvas = maps[0];
    }
    if (!canvas) continue;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const ink = hexToRgb(ACCENT_INK);
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 200) continue;
      if (colorDist(r, g, b, ink) < 28) {
        const x = ((i / 4) % width);
        const y = Math.floor((i / 4) / width);
        const around = neighborAvg(data, width, height, x, y, ink);
        if (around) {
          const ratio = contrastRatio(rgbHex(r, g, b), rgbHex(around[0], around[1], around[2]));
          if (ratio < liveMin) liveMin = ratio;
        }
      }
    }
  }
  return { swatches: samples, liveMin: liveMin === Infinity ? null : liveMin };
}

function hexToRgb(hex) {
  const n = hex.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgbHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
}
function colorDist(r, g, b, rgb) {
  return Math.hypot(r - rgb[0], g - rgb[1], b - rgb[2]);
}
function neighborAvg(data, w, h, x, y, ink) {
  let rs = 0, gs = 0, bs = 0, n = 0;
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const i = (yy * w + xx) * 4;
      if (data[i + 3] < 200) continue;
      if (colorDist(data[i], data[i + 1], data[i + 2], ink) < 40) continue;
      const L = 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
      if (L < 0.28) continue; // skip dark stroke / AA / edges
      rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; n++;
    }
  }
  if (n < 6) return null;
  return [rs / n, gs / n, bs / n];
}

function dieScreenBoxes() {
  const rect = el.stage.getBoundingClientRect();
  return dice.map((d, i) => {
    const b = projectDieBox(d, rect);
    return { i, ...b, width: b.maxX - b.minX, height: b.maxY - b.minY };
  });
}

function chipLayout() {
  const stage = el.stage.getBoundingClientRect();
  const wrap = el.chips.getBoundingClientRect();
  const boxes = dieScreenBoxes();
  const chips = [...el.chips.querySelectorAll('.die-chip')].map((c) => {
    const r = c.getBoundingClientRect();
    return {
      index: Number(c.dataset.index),
      left: r.left - stage.left,
      right: r.right - stage.left,
      top: r.top - stage.top,
      bottom: r.bottom - stage.top,
      cx: r.left - stage.left + r.width * 0.5,
      cy: r.top - stage.top + r.height * 0.5,
      hidden: c.classList.contains('hidden'),
    };
  });
  const diceBoxes = boxes.map((b) => ({
    i: b.i,
    left: b.minX, right: b.maxX, top: b.minY, bottom: b.maxY,
    cx: (b.minX + b.maxX) * 0.5,
    cy: (b.minY + b.maxY) * 0.5,
    hull: b.hull,
    height: b.maxY - b.minY,
  }));
  const trayBounds = trayScreenBounds({ width: stage.width, height: stage.height });
  const pad = 1;
  const inFelt = chips.filter((c) => !c.hidden).every((c) => (
    c.left >= -pad && c.right <= stage.width + pad
    && c.top >= -pad && c.bottom <= stage.height + pad
    && rectInTray(c, trayBounds, 1)
  ));
  let overlapDie = 0;
  let overlapOwn = 0;
  let coverNumeral = 0;
  let coverRing = 0;
  for (const c of chips) {
    if (c.hidden) continue;
    for (const d of diceBoxes) {
      const hit = rectHullDist(c, d.hull) < 1;
      if (d.i === c.index) {
        if (hit) overlapOwn += 1;
        if (rectCircleDist(c, d.cx, d.cy) < 0.3 * d.height) coverNumeral += 1;
      } else if (hit) overlapDie += 1;
    }
    const die = dice[c.index];
    const rs = die ? ringScreen(die, { width: stage.width, height: stage.height }) : null;
    if (rs && rectCircleDist(c, rs.x, rs.y) < rs.rPx + 1) coverRing += 1;
  }
  const ownershipIssues = [];
  for (const c of chips) {
    if (c.hidden) continue;
    const foot = (d) => Math.hypot(
      Math.max(d.left - c.cx, c.cx - d.right, 0),
      Math.max(d.top - c.cy, c.cy - d.bottom, 0),
    );
    let nearestI = -1;
    let nearestD = Infinity;
    let ownCenter = Infinity;
    let ownFoot = Infinity;
    for (const d of diceBoxes) {
      const cd = Math.hypot(c.cx - d.cx, c.cy - d.cy);
      const fd = foot(d);
      const dmin = Math.min(cd, fd);
      if (d.i === c.index) {
        ownCenter = cd;
        ownFoot = fd;
      }
      if (dmin < nearestD - 0.01 || (Math.abs(dmin - nearestD) <= 0.01 && d.i !== c.index)) {
        // keep strict nearest; ties go against ownership so we notice them
        if (dmin < nearestD - 0.01) {
          nearestD = dmin;
          nearestI = d.i;
        } else if (d.i !== c.index && dmin <= nearestD) {
          nearestD = dmin;
          nearestI = d.i;
        }
      } else if (nearestI < 0) {
        nearestD = dmin;
        nearestI = d.i;
      }
    }
    // Silhouette / hull distance with an 8px ownership margin.
    nearestI = -1;
    nearestD = Infinity;
    let ownHull = Infinity;
    for (const d of diceBoxes) {
      const dmin = rectHullDist(c, d.hull);
      if (d.i === c.index) ownHull = dmin;
      if (dmin < nearestD) {
        nearestD = dmin;
        nearestI = d.i;
      }
    }
    const others = diceBoxes.filter((d) => d.i !== c.index).map((d) => rectHullDist(c, d.hull));
    const nearestOther = others.length ? Math.min(...others) : Infinity;
    if (nearestI !== c.index || nearestOther <= ownHull + 8) {
      ownershipIssues.push({
        index: c.index,
        nearest: nearestI,
        ownCenter,
        ownFoot,
        ownHull,
        nearestDist: nearestD,
        nearestOther,
        margin: nearestOther - ownHull,
      });
    }
  }
  return {
    chips,
    stage: { w: stage.width, h: stage.height, wrapW: wrap.width },
    inFelt,
    overlapDie,
    overlapOwn,
    coverNumeral,
    coverRing,
    ownershipOk: ownershipIssues.length === 0,
    ownershipIssues,
  };
}

function outOfFrame(margin = 2) {
  const boxes = dieScreenBoxes();
  const rect = el.stage.getBoundingClientRect();
  const cut = [];
  for (const b of boxes) {
    const left = Math.max(0, margin - b.minX);
    const right = Math.max(0, b.maxX - (rect.width - margin));
    const top = Math.max(0, margin - b.minY);
    const bottom = Math.max(0, b.maxY - (rect.height - margin));
    const px = Math.max(left, right, top, bottom);
    if (px > 0.5) cut.push({ i: b.i, px, left, right, top, bottom });
  }
  return cut;
}

function ringVisibility(samples = 72) {
  const results = [];
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3();
  const origin = world.camera.position;
  const meshes = [];
  for (const d of dice) meshes.push(d.userData.mesh);
  for (const d of dice) {
    const ring = d.userData.ring;
    if (!ring || !ring.visible) continue;
    const radius = d.userData.ringRadius || horizontalRadius(d) + 0.12;
    const hits = [];
    let vis = 0;
    ring.updateWorldMatrix(true, false);
    meshes.push(ring);
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
      p.applyMatrix4(ring.matrixWorld);
      dir.copy(p).sub(origin);
      const dist = dir.length();
      dir.multiplyScalar(1 / dist);
      ray.set(origin, dir);
      ray.far = dist + 0.08;
      const hit = ray.intersectObjects(meshes, false);
      const first = hit[0];
      const ok = !first || first.object === ring || first.distance >= dist - 0.05;
      if (ok) vis += 1;
      hits.push(ok);
    }
    meshes.pop();
    results.push({ index: d.userData.index, visible: vis / samples, radius, count: vis, samples });
  }
  return results;
}


function relLum(r, g, b) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function numeralMetrics(die, rect) {
  const type = die.userData.type;
  const value = die.userData.value;
  const scale = die.userData.scale;
  let center;
  let up;
  let frac = 0.32;
  if (type === 'd4') {
    const camDir = world.camera.position.clone().sub(die.position).normalize();
    let bestDot = -2;
    let best = null;
    for (const info of die.userData.proto.atlasInfos) {
      if (!info.cornerValues?.includes(value) || !info.center) continue;
      const n = info.normal.clone().applyQuaternion(die.quaternion);
      const dot = n.dot(camDir);
      if (dot > bestDot) { bestDot = dot; best = info; }
    }
    if (!best) return null;
    center = best.center.clone().multiplyScalar(scale).applyQuaternion(die.quaternion).add(die.position);
    up = best.textUp.clone().applyQuaternion(die.quaternion);
    frac = d4NumeralFrac(best);
  } else {
    const face = die.userData.readFaces.find((f) => f.value === value);
    if (!face) return null;
    center = face.localCenter.clone().multiplyScalar(scale).applyQuaternion(die.quaternion).add(die.position);
    up = face.textUp.clone().applyQuaternion(die.quaternion);
    if (type === 'd6') frac = 0.32;
    else if (type === 'd8') frac = 0.38;
    else if (String(value).length > 1) frac = 0.32 * 0.84;
  }
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0);
  up.normalize();
  const worldH = frac * scale;
  const p0 = center.clone();
  const p1 = center.clone().addScaledVector(up, worldH);
  const to = (p) => {
    _chipProj.copy(p).project(world.camera);
    return {
      x: (_chipProj.x * 0.5 + 0.5) * rect.width,
      y: (-_chipProj.y * 0.5 + 0.5) * rect.height,
    };
  };
  const a = to(p0);
  const b = to(p1);
  const screenPx = Math.hypot(b.x - a.x, b.y - a.y);
  return { cx: a.x, cy: a.y, screenPx, worldH };
}

function sampleRenderedNumerals() {
  const canvas = world.renderer.domElement;
  world.renderer.render(world.scene, world.camera);
  const gl = world.renderer.getContext();
  const w = canvas.width;
  const h = canvas.height;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const cssW = canvas.clientWidth || w;
  const cssH = canvas.clientHeight || h;
  const sx = w / cssW;
  const sy = h / cssH;
  const rect = { width: cssW, height: cssH };
  const samples = [];
  let minRatio = Infinity;
  let minPx = Infinity;
  for (const d of dice) {
    const m = numeralMetrics(d, rect);
    if (!m) continue;
    const half = Math.max(8, m.screenPx * 0.7);
    const x0 = Math.max(0, Math.floor((m.cx - half) * sx));
    const x1 = Math.min(w - 1, Math.ceil((m.cx + half) * sx));
    const yCss0 = m.cy - half;
    const yCss1 = m.cy + half;
    // readPixels origin is bottom-left
    const y0 = Math.max(0, Math.floor(h - yCss1 * sy));
    const y1 = Math.min(h - 1, Math.ceil(h - yCss0 * sy));
    const lums = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * w + x) * 4;
        lums.push(relLum(buf[i], buf[i + 1], buf[i + 2]));
      }
    }
    lums.sort((a, b) => a - b);
    let ratio = null;
    if (lums.length >= 20) {
      const lo = lums[Math.floor(lums.length / 30)] ?? lums[0];
      const hi = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.85))];
      ratio = (hi + 0.05) / (lo + 0.05);
      if (d.userData.type !== 'd6' && ratio < minRatio) minRatio = ratio;
    }
    if (m.screenPx < minPx) minPx = m.screenPx;
    samples.push({
      index: d.userData.index,
      value: d.userData.value,
      ratio,
      screenPx: m.screenPx,
      cx: m.cx,
      cy: m.cy,
    });
  }
  return {
    min: minRatio === Infinity ? null : minRatio,
    minPx: minPx === Infinity ? null : minPx,
    samples,
  };
}

function inspectLayout() {
  const ov = overlapDepth(dice);
  const chips = chipLayout();
  const cut = outOfFrame(2);
  const contrast = sampleAccentContrast();
  const rendered = sampleRenderedNumerals();
  const rings = ringVisibility(72);
  const ringGaps = world.ringScreenGaps(dice);
  const railGaps = world.railScreenGaps(dice);
  const wall = world.trayHalf;
  const trayIssues = [];
  for (const d of dice) {
    const xz = maxDieXZ(d);
    if (xz > wall + 0.01) trayIssues.push({ index: d.userData.index, maxXZ: xz, wall });
  }
  return {
    type,
    count,
    overlap: ov.maxDepth,
    overlapPair: ov.pair,
    outOfFrame: cut,
    chipsInFelt: chips.inFelt,
    chipsOverlapDie: chips.overlapDie,
    chipsOverlapOwn: chips.overlapOwn || 0,
    chipsCoverNumeral: chips.coverNumeral || 0,
    chipsCoverRing: chips.coverRing || 0,
    chipOwnershipOk: chips.ownershipOk,
    chipOwnershipIssues: chips.ownershipIssues,
    chips: chips.chips,
    contrast,
    renderedContrast: rendered,
    numeralMinPx: rendered.minPx,
    diceInTray: trayIssues.length === 0,
    diceTrayIssues: trayIssues,
    layoutMul: currentLayoutMul(),
    rings,
    ringGapMin: ringGaps.minGap,
    ringGapOk: ringGaps.ok,
    ringGapPairs: ringGaps.pairs,
    railGaps,
    ringDieGapMin: ringGaps.dieGapMin,
    ringDieGapOk: ringGaps.dieGapOk !== false,
    ringDiePairs: ringGaps.diePairs,
    values: dice.map((d) => d.userData.value),
    upValues: dice.map((d) => readUpValue(d)),
    camFacingValues: dice.map((d) => readCameraFacingValue(d, world.camera)),
    footprints: dice.map((d) => horizontalRadius(d)),
    positions: dice.map((d) => {
      _chipProj.copy(d.position).project(world.camera);
      const canvas = world.renderer.domElement;
      const br = canvas.getBoundingClientRect();
      return {
        index: d.userData.index,
        locked: !!d.userData.locked,
        x: d.position.x,
        y: d.position.y,
        z: d.position.z,
        qx: d.quaternion.x,
        qy: d.quaternion.y,
        qz: d.quaternion.z,
        qw: d.quaternion.w,
        sx: br.left + (_chipProj.x * 0.5 + 0.5) * br.width,
        sy: br.top + (-_chipProj.y * 0.5 + 0.5) * br.height,
      };
    }),
  };
}


function init() {
  paintMute();
  paintTypes();
  paintCount();
  world.resize();
  rebuildDice(false, [5, 2]);
  paintHistory(false);
  paintChips(true);
  onPointer();

  el.roll.addEventListener('click', () => roll());
  el.minus.addEventListener('click', () => setCount(count - 1));
  el.plus.addEventListener('click', () => setCount(count + 1));
  el.mute.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    try { localStorage.setItem(MUTE_KEY, audio.muted ? '1' : '0'); } catch (_) { /* ignore */ }
    paintMute();
    audio.unlock();
  });

  function onStageResize() {
    const opts = layoutOptions();
    world.setLayout(opts);
    world.resize();
    if (!rolling && dice.length) {
      const slots = slotPositions(count, opts);
      for (const d of dice) placeDie(d, slots[d.userData.index], d.userData.value);
      finishSettle();
      paintChips(true);
    }
  }
  window.addEventListener('resize', onStageResize);
  window.addEventListener('orientationchange', () => setTimeout(onStageResize, 200));

  world.renderer.setAnimationLoop(loop);

  window.__diceApp = {
    ready: true,
    roll,
    setCount,
    setType,
    getState: snapshot,
    toggleLock(index) {
      const d = dice[index];
      if (d) toggleLock(d);
      return snapshot();
    },
    setMuted(v) { audio.setMuted(!!v); paintMute(); },
    readUpValue: () => dice.map((d) => readUpValue(d)),
    readCameraFacingValue: () => dice.map((d) => readCameraFacingValue(d, world.camera)),
    resultTextUpAngle: () => dice.map((d) => resultTextUpAngle(d, world.camera)),
    inspect: inspectLayout,
    accentColors: { ink: ACCENT_INK, gold: ACCENT_GOLD, face: ACCENT_FACE },
  };
}

init();
