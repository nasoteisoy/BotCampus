// Dino Stomp: the game (tuning, physics, heroes, friends). main.js is the shared 3D shell.
//   march in place = walk (faster = faster), lean = turn, jump = stomp jump, arms up high = ROAR
//   find 18: fruit on the ground, golden fruit up in trees (ROAR nearby and it falls), eggs (on rocks: jump up!).
//   Eggs hatch baby dinos that follow you. Gentle: no enemies, no falling off, no fail.
import * as THREE from 'three';
import { createWorld, WORLD } from './world.js';
import { createDino } from './hero.js';
import { PLAYER_COLORS } from './multi.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const isTouch = typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

export const T = {
  walk: 6.5,        // m/s at full march (fwd = 1)
  accel: 4, decel: 5,
  turn: 1.9,        // rad/s at full lean (while walking)
  turnStill: 1.3,   // rad/s turning on the spot
  jumpVy: 8.2, grav: 17,  // ~2 m high: enough to get onto a rock (1.1-1.6 m)
  roarCool: 0.9,
  collectR: 1.9, collectDy: 1.8,
  bodyR: 0.55,
};
export const META = {
  id: 'dino-stomp', icon: '🍎', muteKey: 'dinostomp_muted', underwater: false, gapColor: '#fff3da',
  cam: { dist: 7.2, height: 3.4, distP: 8.6, heightP: 4.2, fov: 58, fovP: 70, lookUp: 1.3, lookAhead: 4, posLerp: 3.2, lookLerp: 6 },
  viewq: {
    1: { fogNear: 60, fogFar: 300, lowDetail: false, dprCap: 2 },
    2: { fogNear: 50, fogFar: 240, lowDetail: isTouch, dprCap: 2 },
    3: { fogNear: 40, fogFar: 190, lowDetail: true, dprCap: 1.5 },
    4: { fogNear: 40, fogFar: 190, lowDetail: true, dprCap: 1.5 },
  },
  guideMin: 14, guideY: 2.9,
  tapAct: 'jump',
  practice: [
    { move: 'march', icon: '🚶', hold: 0.3, check: (e) => e.out.fwd > 0.25 },
    { move: 'leanL', icon: '⬅️', hold: 0.25, check: (e) => e.out.turn < -0.45 },
    { move: 'leanR', icon: '➡️', hold: 0.25, check: (e) => e.out.turn > 0.45 },
    { move: 'jump', icon: '⬆️', hold: 0, check: (e) => e.out.jump },
    { move: 'roar', icon: '🦖', hold: 0, check: (e) => e.out.roar },
  ],
  // code -> [act, player in 👥 duo mode]
  keys: {
    KeyW: ['fwd', 0], KeyA: ['left', 0], KeyD: ['right', 0], Space: ['jump', 0], KeyE: ['roar', 0], KeyR: ['roar', 0], KeyQ: ['roar', 0],
    ArrowUp: ['fwd', 1], ArrowLeft: ['left', 1], ArrowRight: ['right', 1], ArrowDown: ['jump', 1], ShiftRight: ['roar', 1], Slash: ['roar', 1], Enter: ['jump', 1],
  },
  hintKeys: '<b class="key">W</b><span>🚶</span><b class="key">A</b><b class="key">D</b><span>↩️↪️</span><b class="key">␣</b><span>⬆️</span><b class="key">E</b><span>🦖</span>',
  hintDuo: '<b class="dot" style="--c:#4fb35a"></b><b class="key">W</b><b class="key">A</b><b class="key">D</b><b class="key">␣</b><b class="key">E</b><span class="gap"></span><b class="dot" style="--c:#3f8fe0"></b><b class="key">↑</b><b class="key">←</b><b class="key">→</b><b class="key">↓</b><b class="key">/</b>',
  hintTouch: '<span>👆</span><span>🚶</span><span>👆↔️</span><span>↩️↪️</span><span>👆💨</span><span>⬆️</span>',
  need: { roar: { icon: '🦖', key: '<b class="key">E</b>🦖', touch: '🦖👇' }, jump: { icon: '⬆️', key: '<b class="key">␣</b>⬆️', touch: '👆💨⬆️' } },
  howTouch: '<span>👆 = 🚶</span><span>👆↔️ = ↩️↪️</span><span>👆💨 = ⬆️</span><span>🦖 = 💥</span>',
};

const FRIEND_COLORS = { '#4fb3ff': { body: '#7cc6ff', body2: '#5aaee8', tip: '#ffe066' }, '#ff7ab8': { body: '#ff9ccb', body2: '#ef7fb2', tip: '#8fd6ff' }, '#ffb43a': { body: '#ffc766', body2: '#efac45', tip: '#ff7a7a' }, '#7ad66b': { body: '#98e08a', body2: '#77c96a', tip: '#ffb0e0' } };

export function createGame(env, seed) {
  const { scene, sound, dust, spark } = env;
  const world = createWorld(scene, seed);
  scene.background = null;
  scene.fog = new THREE.Fog('#f6eed8', 60, 300);
  const lights = new THREE.Group(); scene.add(lights);
  lights.add(new THREE.HemisphereLight('#fff6e2', '#8fb37a', 1.75));
  const sun = new THREE.DirectionalLight('#fff0d4', 1.5); sun.position.set(-0.5, 1, 0.35); lights.add(sun);
  const heroes = new Map(); // slot -> dino
  const friends = [];       // { dino, owner (player), S }
  const tmp = new THREE.Vector3();

  function initPlayer(p) {
    const old = heroes.get(p.slot); if (old) scene.remove(old.root);
    const d = createDino(PLAYER_COLORS[p.slot], 1); scene.add(d.root); d.root.visible = p.on;
    heroes.set(p.slot, d); p.hero = d;
    Object.assign(p.S, { x: 0, y: 0, z: 0, vy: 0, yaw: 0, speed: 0, ground: true, air: 0, phase: 0, roarT: 0, roarCool: 0, land: 0, still: 0, steps: 0, jumps: 0, roars: 0, stomps: 0, dist: 0, autoT: 0, edge: false, onRock: false });
  }
  function nearestItem(S) {
    let best = null, bd = 1e9;
    for (const a of world.items) if (!a.collected) { const d = Math.hypot(a.x - S.x, a.z - S.z); if (d < bd) { bd = d; best = a; } }
    return best ? { x: best.x, z: best.z, d: bd, kind: best.kind, state: best.state } : null;
  }
  function reset(p, k = 0, n = 1) {
    const S = p.S; S.x = 0; S.z = 0;
    const nb = nearestItem(S); S.yaw = nb ? Math.atan2(-(nb.x), -(nb.z)) : 0;
    const off = (k - (n - 1) / 2) * 2.6;
    S.x = Math.cos(S.yaw) * off; S.z = -Math.sin(S.yaw) * off;
    S.y = world.ground(S.x, S.z); S.vy = 0; S.speed = 0; S.ground = true; S.roarT = 0; S.land = 0; S.still = 0;
  }
  function spawnNear(p, L, side) {
    const S = p.S, LS = L.S; S.yaw = LS.yaw;
    S.x = LS.x + Math.cos(LS.yaw) * side + Math.sin(LS.yaw) * 1; S.z = LS.z - Math.sin(LS.yaw) * side + Math.cos(LS.yaw) * 1;
    S.y = world.ground(S.x, S.z) + 2; S.vy = 0; S.ground = false; S.speed = 0;
  }
  function place(p, o) { Object.assign(p.S, o); if (o.y == null) p.S.y = world.ground(p.S.x, p.S.z); p.S.vy = 0; }
  function puff(x, y, z, n = 16, s0 = 2, s1 = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = s0 + Math.random() * s1;
      dust.emit({ x: x + Math.cos(a) * 0.5, y: y + 0.15, z: z + Math.sin(a) * 0.5, vx: Math.cos(a) * s, vy: 0.8 + Math.random() * 2, vz: Math.sin(a) * s, drag: 2.6, grav: 0.6, size: 0.7 + Math.random() * 0.7, grow: 1.4, r: 0.86, g: 0.78, b: 0.62, a: 0.7, max: 0.9 + Math.random() * 0.6 });
    }
  }
  function sparkle(a, col) {
    const pc = new THREE.Color(col), cols = [[1, 0.42, 0.55], [1, 0.82, 0.25], [1, 0.97, 0.75], [pc.r, pc.g, pc.b], [0.55, 0.85, 1]];
    for (let i = 0; i < 50; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * 6.283, r = Math.sqrt(1 - u * u), s = 2 + Math.random() * 4, c = cols[i % 5];
      spark.emit({ x: a.x, y: a.y, z: a.z, vx: r * Math.cos(th) * s, vy: u * s + 2, vz: r * Math.sin(th) * s, drag: 1.8, grav: 2.5, size: 0.3 + Math.random() * 0.3, r: c[0], g: c[1], b: c[2], max: 0.8 + Math.random() * 0.8 });
    }
  }
  function hatch(it, p) {
    const fc = FRIEND_COLORS[it.color] || FRIEND_COLORS['#4fb3ff'];
    const d = createDino({ ...fc, css: it.color }, 0.5); scene.add(d.root);
    const S = { x: it.x, y: it.y - 0.5, z: it.z, yaw: p.S.yaw, speed: 0, phase: 0, vy: 5, air: 0.5, hop: 0 };
    friends.push({ dino: d, owner: p, S, idx: friends.filter((f) => f.owner === p).length });
    sound.hatch();
    // egg shell bits
    for (let i = 0; i < 18; i++) { const a = Math.random() * 6.283; spark.emit({ x: it.x, y: it.y, z: it.z, vx: Math.cos(a) * 3, vy: 3 + Math.random() * 3, vz: Math.sin(a) * 3, drag: 1, grav: 9, size: 0.25, r: 1, g: 0.97, b: 0.9, max: 1 }); }
  }
  function collect(it, p) {
    world.collect(it);
    sparkle({ x: it.x, y: it.y + 0.3, z: it.z }, p.col.css);
    if (it.kind === 'egg') hatch(it, p);
    env.onCollect(it, p);
  }
  function doRoar(p) {
    const S = p.S;
    if (S.roarCool > 0) return false;
    S.roarCool = T.roarCool; S.roarT = 1.1; S.roars++;
    sound.roar();
    const fell = world.roar(S.x, S.y, S.z, p.col.css);
    for (const f of fell) puff(f.x, world.terrain(f.x, f.z) + 2, f.z, 8, 1, 2);
    for (const f of friends) if (f.owner === p) f.S.hop = 0.6; // babies hop + squeak along
    return true;
  }
  // push the dino out of rocks it is not standing on and out of logs it is not above
  function collide(S) {
    for (const o of world.rocks) {
      const dx = S.x - o.x, dz = S.z - o.z, d = Math.hypot(dx, dz), R = o.r + T.bodyR * 0.6;
      if (d < R && S.y < o.top - 0.35) { const k = (R - d) / Math.max(d, 1e-3); S.x += dx * k; S.z += dz * k; S.speed *= 0.6; }
    }
    for (const o of world.logs) {
      const ca = Math.cos(o.a), sa = Math.sin(o.a); // log axis in xz: rotation.y = a -> x axis turned
      const lx = (S.x - o.x) * ca - (S.z - o.z) * sa, lz = (S.x - o.x) * sa + (S.z - o.z) * ca;
      if (Math.abs(lx) < o.len / 2 + 0.2 && Math.abs(lz) < o.r + T.bodyR && S.y < o.top - 0.3) {
        const push = (o.r + T.bodyR - Math.abs(lz)) * Math.sign(lz || 1);
        S.x += sa * push; S.z += ca * push; S.speed *= 0.5; S.bump = 0.3;
      }
    }
    // trees: soft trunk collision
  }
  function step(p, dt, playing, c) {
    const S = p.S, hero = p.hero;
    S.roarCool -= dt; S.roarT = Math.max(0, S.roarT - dt); S.bump = Math.max(0, (S.bump || 0) - dt);
    if (c.auto) { // title / win: wander slowly in big circles
      S.autoT += dt; c = { ...c, fwd: 0.35 + 0.15 * Math.sin(S.autoT * 0.3), turn: 0.25 + 0.2 * Math.sin(S.autoT * 0.17) };
      if (Math.random() < 0.003 && S.ground) c.jump = true;
    }
    // turn: lean (keys / drag) — slower on the spot
    const tr = S.speed > 0.8 ? T.turn : T.turnStill;
    S.yaw = wrap(S.yaw - c.turn * tr * dt);
    // soft edge of the valley: steer back toward the middle
    const r = Math.hypot(S.x, S.z); S.edge = r > WORLD.SOFT - 6;
    if (S.edge) { const k = clamp((r - WORLD.SOFT + 6) / 20, 0, 1) * 2.4; S.yaw = wrap(S.yaw + wrap(Math.atan2(S.x, S.z) - S.yaw) * (1 - Math.exp(-k * dt))); }
    const want = c.fwd * T.walk;
    S.speed += (want - S.speed) * (1 - Math.exp(-(want > S.speed ? T.accel : T.decel) * dt));
    if (S.speed < 0.02) S.speed = 0;
    if (c.step && playing) { S.steps++; if (S.ground) sound.step(S.steps); }
    const dx = -Math.sin(S.yaw) * S.speed * dt, dz = -Math.cos(S.yaw) * S.speed * dt;
    S.x += dx; S.z += dz; S.dist += Math.hypot(dx, dz);
    S.phase += S.speed * dt * 2.2;
    collide(S);
    const r2 = Math.hypot(S.x, S.z); if (r2 > WORLD.SOFT + 8) { S.x *= (WORLD.SOFT + 8) / r2; S.z *= (WORLD.SOFT + 8) / r2; }
    // jump + gravity
    if (c.jump && S.ground) { S.vy = T.jumpVy; S.ground = false; S.jumps++; sound.jump(); puff(S.x, S.y, S.z, 8, 1, 2); }
    if (c.roar) doRoar(p);
    const gy = world.ground(S.x, S.z);
    if (!S.ground) {
      S.vy -= T.grav * dt; S.y += S.vy * dt;
      if (S.y <= gy && S.vy <= 0) { // STOMP
        S.y = gy; S.ground = true; const hard = Math.min(1, -S.vy / 9); S.vy = 0; S.land = 0.5 + hard * 0.5;
        if (playing) { S.stomps++; sound.stomp(); }
        puff(S.x, gy, S.z, 12 + Math.round(hard * 14), 2, 4 + hard * 3);
      }
    } else {
      // walking: follow the ground; walking off a rock = small fall
      if (gy < S.y - 0.4) { S.ground = false; S.vy = 0; }
      else S.y += (gy - S.y) * (1 - Math.exp(-18 * dt));
    }
    S.onRock = S.ground && gy > world.terrain(S.x, S.z) + 0.5;
    S.land = Math.max(0, S.land - dt * 3.5);
    S.air = Math.max(0, S.y - gy);
    S.still = c.fwd > 0.05 || c.jump || c.roar || Math.abs(c.turn) > 0.2 ? 0 : S.still + dt;
    // collect
    if (playing) for (const it of world.items) {
      if (it.collected || it.state === 'up') continue;
      const ddx = it.x - S.x, ddz = it.z - S.z;
      if (ddx * ddx + ddz * ddz < T.collectR * T.collectR && Math.abs(it.y - (S.y + 0.8)) < T.collectDy) collect(it, p);
    }
    // visuals
    hero.root.position.set(S.x, S.y, S.z); hero.root.rotation.y = S.yaw;
    hero.update(dt, { speed: S.speed, air: S.air, vy: S.vy, roar: S.roarT, land: S.land, phase: S.phase });
  }
  function idle(p, dt) { p.hero.update(dt, { speed: 0, air: p.S.air, vy: 0, roar: 0, land: 0, phase: p.S.phase }); }
  // baby dinos follow their owner in a little line
  function stepFriends(dt, playing) {
    for (const f of friends) {
      const O = f.owner.S, S = f.S;
      const back = 2.2 + f.idx * 1.5, side = (f.idx % 2 ? 1 : -1) * 0.9;
      const tx = O.x + Math.sin(O.yaw) * back + Math.cos(O.yaw) * side, tz = O.z + Math.cos(O.yaw) * back - Math.sin(O.yaw) * side;
      const dx = tx - S.x, dz = tz - S.z, d = Math.hypot(dx, dz);
      const sp = d > 0.4 ? Math.min(9, d * 2.2) : 0;
      if (d > 0.4) S.yaw = wrap(S.yaw + wrap(Math.atan2(-dx, -dz) - S.yaw) * (1 - Math.exp(-6 * dt)));
      if (d > 30) { S.x = tx; S.z = tz; }
      S.x += (d > 1e-3 ? dx / d : 0) * sp * dt; S.z += (d > 1e-3 ? dz / d : 0) * sp * dt;
      S.speed = sp; S.phase += sp * dt * 4;
      const gy = world.ground(S.x, S.z);
      if (S.hop > 0 && S.air < 0.05) { S.vy = 4; S.hop = 0; }
      S.vy -= 16 * dt; S.y += S.vy * dt; if (S.y < gy) { S.y = gy; S.vy = 0; }
      S.air = S.y - gy;
      f.dino.root.position.set(S.x, S.y, S.z); f.dino.root.rotation.y = S.yaw;
      f.dino.update(dt, { speed: sp, air: S.air, vy: S.vy, roar: f.owner.S.roarT > 0.3 ? 1 : 0, land: 0, phase: S.phase });
    }
  }
  return {
    world, get items() { return world.items; },
    initPlayer, reset, spawnNear, place, step, idle,
    setVisible(p, v) { p.hero.root.visible = v; for (const f of friends) if (f.owner === p) f.dino.root.visible = v; },
    heroPos(p) { return p.hero.root.position; },
    camTarget(p) { const S = p.S; return { x: S.x, y: Math.min(S.y, world.ground(S.x, S.z) + 0.6) + 0.2 + (S.air > 0 ? S.air * 0.5 : 0), z: S.z, yaw: S.yaw }; },
    camClamp(v) { // keep the camera above the ground and out of rocks
      let g = world.terrain(v.x, v.z) + 1.4;
      for (const o of world.rocks) { const d = Math.hypot(v.x - o.x, v.z - o.z); if (d < o.r + 1.6) g = Math.max(g, o.top + 1.2); }
      if (v.y < g) v.y = g;
    },
    nearest(p) { return nearestItem(p.S); },
    height: (x, z) => world.ground(x, z),
    stillFor: (p) => p.S.still,
    ambient: (p) => (p ? p.S.speed / T.walk : 0),
    update(time, dt, players, playing) { world.update(time, dt); stepFriends(dt, playing); },
    setQuality(q) { scene.fog.near = q.fogNear; scene.fog.far = q.fogFar; this._q = q; },
    setView(camera) { world.setView(camera.position, this._q || META.viewq[1]); },
    _q: null,
    state(p) {
      const S = p.S, nb = nearestItem(S);
      return { x: S.x, y: S.y, z: S.z, yaw: S.yaw, speed: S.speed, ground: S.ground, air: S.air, onRock: S.onRock, steps: S.steps, jumps: S.jumps, roars: S.roars, stomps: S.stomps, dist: S.dist,
        friends: friends.filter((f) => f.owner === p).length, nearest: nb ? { kind: nb.kind, d: +nb.d.toFixed(1), state: nb.state } : null };
    },
    hintFor(p) { // what the kid should do now: ROAR under a golden-fruit tree, jump at an egg on a rock
      const S = p.S;
      for (const t of world.fruitTrees) if (t.item.state === 'up' && Math.hypot(t.x - S.x, t.z - S.z) < WORLD.ROAR_R * 0.8) return 'roar';
      for (const it of world.items) if (!it.collected && it.kind === 'egg' && it.y - S.y > 1.2 && Math.hypot(it.x - S.x, it.z - S.z) < 6) return 'jump';
      return null;
    },
    dispose() {
      world.dispose(); scene.remove(lights);
      for (const d of heroes.values()) scene.remove(d.root);
      for (const f of friends) scene.remove(f.dino.root);
      heroes.clear(); friends.length = 0;
    },
    get friends() { return friends.length; },
    T,
  };
}
