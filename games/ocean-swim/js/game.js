// Ocean Swim: the game (tuning, swimming physics, turtles, fish friends). main.js is the shared 3D shell.
//   arm strokes = swim forward, lean = turn, both arms up (held) = float up, squat = dive down
//   find 18: shells on the sand, bubble rings up high (swim through), pearls in clams (each = a fish friend).
//   Gentle: no enemies, no air meter, no fail; the bay's walls just turn you around.
import * as THREE from 'three';
import { createWorld, WORLD, WATER } from './world.js';
import { createTurtle } from './hero.js';
import { PLAYER_COLORS } from './multi.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const isTouch = typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

export const T = {
  swim: 5.2,          // m/s cruising at full stroking (fwd = 1)
  strokeKick: 2.0,    // m/s added by each stroke (max T.max)
  max: 8,
  glide: 1.6,         // speed follows the target at this rate (slow = glides)
  turn: 1.6, turnStill: 1.6,
  vert: 3.4,          // m/s up / down
  collectR: 1.8, ringR: 2.0,
  bodyR: 0.8,
};
export const META = {
  id: 'ocean-swim', icon: '🐚', muteKey: 'oceanswim_muted', underwater: true, gapColor: '#d6f2ff',
  cam: { dist: 7, height: 2.2, distP: 8.4, heightP: 2.8, fov: 60, fovP: 72, lookUp: 0.6, lookAhead: 4, posLerp: 3, lookLerp: 5 },
  viewq: {
    1: { fogNear: 8, fogFar: 95, lowDetail: false, dprCap: 2 },
    2: { fogNear: 8, fogFar: 85, lowDetail: isTouch, dprCap: 2 },
    3: { fogNear: 6, fogFar: 75, lowDetail: true, dprCap: 1.5 },
    4: { fogNear: 6, fogFar: 75, lowDetail: true, dprCap: 1.5 },
  },
  guideMin: 12, guideY: 2.2,
  tapAct: 'stroke',
  practice: [
    { move: 'swim', icon: '🏊', hold: 0.3, check: (e) => e.out.fwd > 0.25 },
    { move: 'leanL', icon: '⬅️', hold: 0.25, check: (e) => e.out.turn < -0.45 },
    { move: 'leanR', icon: '➡️', hold: 0.25, check: (e) => e.out.turn > 0.45 },
    { move: 'rise', icon: '⬆️', hold: 0.2, check: (e) => e.out.vert > 0.5 },
    { move: 'sink', icon: '⬇️', hold: 0.2, check: (e) => e.out.vert < -0.5 },
  ],
  keys: {
    KeyW: ['fwd', 0], KeyA: ['left', 0], KeyD: ['right', 0], Space: ['up', 0], KeyS: ['down', 0], ShiftLeft: ['down', 0], KeyE: ['stroke', 0], KeyQ: ['stroke', 0],
    ArrowUp: ['fwd', 1], ArrowLeft: ['left', 1], ArrowRight: ['right', 1], Enter: ['up', 1], ArrowDown: ['down', 1], ShiftRight: ['down', 1], Slash: ['stroke', 1],
  },
  hintKeys: '<b class="key">W</b><span>🏊</span><b class="key">A</b><b class="key">D</b><span>↩️↪️</span><b class="key">␣</b><span>⬆️</span><b class="key">S</b><span>⬇️</span>',
  hintDuo: '<b class="dot" style="--c:#4fb35a"></b><b class="key">W</b><b class="key">A</b><b class="key">D</b><b class="key">␣</b><b class="key">S</b><span class="gap"></span><b class="dot" style="--c:#3f8fe0"></b><b class="key">↑</b><b class="key">←</b><b class="key">→</b><b class="key">⏎</b><b class="key">↓</b>',
  hintTouch: '<span>👆</span><span>🏊</span><span>👆↔️</span><span>↩️↪️</span><span>⬆️⬇️</span>',
  need: { rise: { icon: '⬆️', key: '<b class="key">␣</b>⬆️', touch: '⬆️👇' }, sink: { icon: '⬇️', key: '<b class="key">S</b>⬇️', touch: '⬇️👇' } },
  howTouch: '<span>👆 = 🏊</span><span>👆↔️ = ↩️↪️</span><span>⬆️ ⬇️</span>',
};
const SHELLS = { 0: { body: '#5fbf7a', body2: '#9be0a5', tip: '#fff6c8', skin: '#a8e6b4' }, 1: { body: '#4f9fe0', body2: '#9fd0ff', tip: '#fff6c8', skin: '#a9e3c9' }, 2: { body: '#ff9a3d', body2: '#ffd08f', tip: '#fff6c8', skin: '#b5e8b0' }, 3: { body: '#a070e0', body2: '#d2b6ff', tip: '#fff6c8', skin: '#b0e6c0' } };

export function createGame(env, seed) {
  const { scene, sound, dust, spark } = env;
  const world = createWorld(scene, seed);
  scene.background = WATER.clone();
  scene.fog = new THREE.Fog(WATER.clone(), 8, 95);
  const lights = new THREE.Group(); scene.add(lights);
  lights.add(new THREE.HemisphereLight('#e6fbff', '#3f86a8', 1.9));
  const sun = new THREE.DirectionalLight('#f4fdff', 1.3); sun.position.set(-0.3, 1, 0.4); lights.add(sun);
  const heroes = new Map(), friends = [];
  const fishGeo = new THREE.ConeGeometry(0.3, 0.9, 7); fishGeo.rotateX(-Math.PI / 2);
  const tailGeo = new THREE.ConeGeometry(0.22, 0.35, 4); tailGeo.rotateX(Math.PI / 2); tailGeo.translate(0, 0, 0.55);
  const eyeGeo = new THREE.SphereGeometry(0.07, 6, 4);

  function initPlayer(p) {
    const old = heroes.get(p.slot); if (old) scene.remove(old.root);
    const h = createTurtle(SHELLS[p.slot] || SHELLS[0], 1); scene.add(h.root); h.root.visible = p.on;
    heroes.set(p.slot, h); p.hero = h;
    Object.assign(p.S, { x: 0, y: -7, z: 0, vy: 0, yaw: 0, speed: 0, pitch: 0, phase: 0, strokeK: 0, still: 0, strokes: 0, dist: 0, climb: 0, autoT: 0, edge: false, bubT: 0 });
  }
  function nearestItem(S) {
    let best = null, bd = 1e9;
    for (const a of world.items) if (!a.collected) { const d = Math.hypot(a.x - S.x, a.z - S.z); if (d < bd) { bd = d; best = a; } }
    return best ? { x: best.x, z: best.z, y: best.y, d: bd, kind: best.kind, state: best.state } : null;
  }
  function reset(p, k = 0, n = 1) {
    const S = p.S; S.x = 0; S.z = 0;
    const nb = nearestItem(S); S.yaw = nb ? Math.atan2(-nb.x, -nb.z) : 0;
    const off = (k - (n - 1) / 2) * 2.8;
    S.x = Math.cos(S.yaw) * off; S.z = -Math.sin(S.yaw) * off; S.y = -7; S.vy = 0; S.speed = 0; S.still = 0;
  }
  function spawnNear(p, L, side) {
    const S = p.S, LS = L.S; S.yaw = LS.yaw;
    S.x = LS.x + Math.cos(LS.yaw) * side + Math.sin(LS.yaw) * 1; S.z = LS.z - Math.sin(LS.yaw) * side + Math.cos(LS.yaw) * 1;
    S.y = clamp(LS.y, world.ground(S.x, S.z) + 1.2, WORLD.TOP); S.vy = 0; S.speed = 0;
  }
  function place(p, o) { Object.assign(p.S, o); if (o.y == null) p.S.y = Math.max(-7, world.ground(p.S.x, p.S.z) + 2); p.S.vy = 0; }
  function bubbles(x, y, z, n = 6, spread = 0.4) {
    for (let i = 0; i < n; i++) dust.emit({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread, vx: (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 0.6, drag: 0.6, grav: -0.8, size: 0.18 + Math.random() * 0.22, grow: 0.3, r: 0.92, g: 0.98, b: 1, a: 0.75, max: 1.4 + Math.random() * 1.2 });
  }
  function sparkle(a, col) {
    const pc = new THREE.Color(col), cols = [[1, 0.6, 0.75], [1, 0.9, 0.4], [1, 1, 1], [pc.r, pc.g, pc.b], [0.6, 0.95, 1]];
    for (let i = 0; i < 46; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * 6.283, r = Math.sqrt(1 - u * u), s = 1.5 + Math.random() * 3.5, c = cols[i % 5];
      spark.emit({ x: a.x, y: a.y, z: a.z, vx: r * Math.cos(th) * s, vy: u * s + 1, vz: r * Math.sin(th) * s, drag: 2.2, grav: -0.4, size: 0.28 + Math.random() * 0.28, r: c[0], g: c[1], b: c[2], max: 0.9 + Math.random() * 0.8 });
    }
    bubbles(a.x, a.y, a.z, 14, 1.2);
  }
  function addFriend(it, p) {
    const g = new THREE.Group(), col = new THREE.Color(it.color || '#ffd84a');
    const m = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.15 });
    const body = new THREE.Mesh(fishGeo, m); body.scale.set(0.8, 1.15, 1); g.add(body);
    const tail = new THREE.Mesh(tailGeo, m); tail.scale.set(0.4, 1.6, 1); g.add(tail);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: '#1d1a17' })); e.position.set(sx * 0.2, 0.08, -0.2); g.add(e); }
    scene.add(g);
    const S = { x: it.x, y: it.y, z: it.z, yaw: p.S.yaw, t: Math.random() * 6 };
    friends.push({ g, tail, owner: p, S, idx: friends.filter((f) => f.owner === p).length });
  }
  function collect(it, p) {
    world.collect(it);
    sparkle({ x: it.x, y: it.y + 0.2, z: it.z }, p.col.css);
    if (it.kind === 'pearl') { addFriend(it, p); sound.hatch(); }
    else if (it.kind === 'ring') sound.bubble(6);
    env.onCollect(it, p);
  }
  function collide(S) {
    for (const o of world.rocks) {
      const dx = S.x - o.x, dy = (S.y - o.y) / 0.75, dz = S.z - o.z, d = Math.hypot(dx, dy, dz), R = o.r + T.bodyR * 0.7;
      if (d < R && d > 1e-3) { const k = (R - d) / d; S.x += dx * k; S.z += dz * k; S.y += dy * k * 0.75; S.speed *= 0.85; }
    }
  }
  function step(p, dt, playing, c) {
    const S = p.S, hero = p.hero;
    if (c.auto) { S.autoT += dt; c = { ...c, fwd: 0.4 + 0.15 * Math.sin(S.autoT * 0.3), turn: 0.22 + 0.2 * Math.sin(S.autoT * 0.17), vert: Math.sin(S.autoT * 0.23) * 0.5, stroke: Math.random() < 0.006 }; }
    const tr = S.speed > 0.8 ? T.turn : T.turnStill;
    S.yaw = wrap(S.yaw - c.turn * tr * dt);
    const r = Math.hypot(S.x, S.z); S.edge = r > WORLD.SOFT - 6;
    if (S.edge) { const k = clamp((r - WORLD.SOFT + 6) / 18, 0, 1) * 2.4; S.yaw = wrap(S.yaw + wrap(Math.atan2(S.x, S.z) - S.yaw) * (1 - Math.exp(-k * dt))); }
    if (c.stroke) { S.speed = Math.min(T.max, S.speed + T.strokeKick); S.strokeK = 1; S.strokes++; if (playing) sound.swim(); bubbles(S.x + Math.sin(S.yaw) * 0.8, S.y, S.z + Math.cos(S.yaw) * 0.8, 6, 0.6); }
    const want = c.fwd * T.swim;
    S.speed += (want - S.speed) * (1 - Math.exp(-(want > S.speed ? 2.4 : T.glide) * dt));
    if (S.speed < 0.25 && want === 0) S.speed = 0; // come to a clean stop (standing still = no drift)
    S.strokeK = Math.max(0, S.strokeK - dt * 1.6);
    const dx = -Math.sin(S.yaw) * S.speed * dt, dz = -Math.cos(S.yaw) * S.speed * dt;
    S.x += dx; S.z += dz; S.dist += Math.hypot(dx, dz);
    S.vy += (c.vert * T.vert - S.vy) * (1 - Math.exp(-3 * dt));
    S.y += S.vy * dt; S.climb += Math.abs(S.vy * dt);
    collide(S);
    const gy = world.ground(S.x, S.z) + 0.9;
    if (S.y < gy) { S.y += (gy - S.y) * (1 - Math.exp(-12 * dt)); if (S.vy < 0) S.vy *= 0.8; }
    if (S.y > WORLD.TOP) { S.y = WORLD.TOP; if (S.vy > 0) S.vy = 0; }
    const r2 = Math.hypot(S.x, S.z); if (r2 > WORLD.SOFT + 8) { S.x *= (WORLD.SOFT + 8) / r2; S.z *= (WORLD.SOFT + 8) / r2; }
    S.phase += dt * (1.6 + S.speed * 0.9);
    S.pitch += (clamp(Math.atan2(S.vy, S.speed + 2), -0.6, 0.6) - S.pitch) * (1 - Math.exp(-5 * dt));
    S.still = c.fwd > 0.05 || c.stroke || Math.abs(c.vert) > 0.2 || Math.abs(c.turn) > 0.2 ? 0 : S.still + dt;
    S.bubT -= dt; if (S.bubT < 0) { S.bubT = 1.2 + Math.random() * 1.5; bubbles(S.x - Math.sin(S.yaw) * 1.3, S.y + 0.2, S.z - Math.cos(S.yaw) * 1.3, 2, 0.1); }
    if (playing) for (const it of world.items) {
      if (it.collected) continue;
      const ddx = it.x - S.x, ddz = it.z - S.z, ddy = it.y - S.y;
      const R = it.kind === 'ring' ? T.ringR : T.collectR;
      if (ddx * ddx + ddz * ddz + ddy * ddy * (it.kind === 'ring' ? 1 : 0.6) < R * R) collect(it, p);
    }
    hero.root.position.set(S.x, S.y, S.z); hero.root.rotation.y = S.yaw;
    hero.update(dt, { speed: S.speed, stroke: S.strokeK, pitch: S.pitch, turn: c.turn, phase: S.phase });
  }
  function idle(p, dt) { const S = p.S; S.phase += dt * 1.6; p.hero.update(dt, { speed: 0, stroke: 0, pitch: 0, turn: 0, phase: S.phase }); }
  function stepFriends(dt) {
    for (const f of friends) {
      const O = f.owner.S, S = f.S; S.t += dt;
      const back = 2.2 + f.idx * 1.2, side = (f.idx % 2 ? 1 : -1) * (1 + Math.sin(S.t * 1.3) * 0.3);
      const tx = O.x + Math.sin(O.yaw) * back + Math.cos(O.yaw) * side, tz = O.z + Math.cos(O.yaw) * back - Math.sin(O.yaw) * side, ty = O.y + 0.4 + Math.sin(S.t * 1.7 + f.idx) * 0.4;
      const dx = tx - S.x, dy = ty - S.y, dz = tz - S.z, d = Math.hypot(dx, dy, dz);
      if (d > 30) { S.x = tx; S.y = ty; S.z = tz; }
      const sp = Math.min(10, d * 2.4);
      if (d > 0.05) { S.x += (dx / d) * sp * dt; S.y += (dy / d) * sp * dt; S.z += (dz / d) * sp * dt; }
      for (const o of world.rocks) { // swim around rocks, not through them
        const rx = S.x - o.x, ry = (S.y - o.y) / 0.75, rz = S.z - o.z, rd = Math.hypot(rx, ry, rz), R = o.r + 0.5;
        if (rd < R && rd > 1e-3) { const k = (R - rd) / rd; S.x += rx * k; S.y += ry * k * 0.75; S.z += rz * k; }
      }
      S.y = Math.max(S.y, world.floor(S.x, S.z) + 0.5);
      if (Math.hypot(dx, dz) > 0.2) S.yaw = wrap(S.yaw + wrap(Math.atan2(-dx, -dz) - S.yaw) * (1 - Math.exp(-6 * dt)));
      f.g.position.set(S.x, S.y, S.z); f.g.rotation.y = S.yaw; f.tail.rotation.y = Math.sin(S.t * (8 + sp)) * 0.5;
    }
  }
  return {
    world, get items() { return world.items; },
    initPlayer, reset, spawnNear, place, step, idle,
    setVisible(p, v) { p.hero.root.visible = v; for (const f of friends) if (f.owner === p) f.g.visible = v; },
    heroPos(p) { return p.hero.root.position; },
    camTarget(p) { const S = p.S; return { x: S.x, y: S.y, z: S.z, yaw: S.yaw }; },
    camClamp(v) { const g = world.floor(v.x, v.z) + 1.2; if (v.y < g) v.y = g; if (v.y > WORLD.SURF - 0.6) v.y = WORLD.SURF - 0.6; },
    nearest(p) { return nearestItem(p.S); },
    height: (x, z) => world.ground(x, z),
    stillFor: (p) => p.S.still,
    ambient: (p) => (p ? Math.min(1, p.S.speed / T.swim) : 0),
    update(time, dt) { world.update(time, dt); stepFriends(dt); },
    setQuality(q) { scene.fog.near = q.fogNear; scene.fog.far = q.fogFar; this._q = q; },
    setView(camera) { world.setView(camera.position, this._q || META.viewq[1]); },
    _q: null,
    state(p) {
      const S = p.S, nb = nearestItem(S);
      return { x: S.x, y: S.y, z: S.z, yaw: S.yaw, speed: S.speed, vy: S.vy, strokes: S.strokes, dist: S.dist, climb: S.climb, depth: -S.y,
        friends: friends.filter((f) => f.owner === p).length, nearest: nb ? { kind: nb.kind, d: +nb.d.toFixed(1), dy: +(nb.y - S.y).toFixed(1) } : null };
    },
    hintFor(p) { // float up to a ring above you, dive to a shell below you
      const S = p.S; let best = null, bd = 1e9;
      for (const it of world.items) { if (it.collected) continue; const d = Math.hypot(it.x - S.x, it.z - S.z); if (d < bd) { bd = d; best = it; } }
      if (!best || bd > 9) return null;
      const dy = best.y - S.y;
      return dy > 2.2 ? 'rise' : dy < -2.2 ? 'sink' : null;
    },
    dispose() {
      world.dispose(); scene.remove(lights);
      for (const h of heroes.values()) scene.remove(h.root);
      for (const f of friends) scene.remove(f.g);
      heroes.clear(); friends.length = 0;
    },
    get friends() { return friends.length; },
    T,
  };
}
