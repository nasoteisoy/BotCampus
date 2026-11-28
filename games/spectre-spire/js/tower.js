// Builds one haunted hotel floor from a seed: rooms, doors, walls, furniture, loot, ghosts,
// cages, the elevator, colliders and a walk grid. Pure data, so host and guests match exactly.
import { makeRng, hashSeed } from './rng.js';
import { T, LOOT, quotaFor, timeFor } from './config.js';
import { FURNITURE, THEMES } from './furniture.js';

const PAL = { floorA: 0x3d2249, floorB: 0x452853, wall: 0xdcbc8c, wainscot: 0x8c5a3c, trim: 0x5a3626,
  ceiling: 0x5a3a70, cabFloor: 0xb8893a, cabWall: 0x7a4a34, gold: 0xf2c94c };
export const FLOOR_PAL = PAL;

export function gridSizeFor(n) {
  if (n <= 2) return [3, 3];
  if (n <= 5) return [4, 3];
  if (n <= 9) return [4, 4];
  return [5, 4];
}

export function buildFloor({ runSeed, n, type, extraTime = 0, players = 1 }) {
  const seed = hashSeed(runSeed, 'floor', n);
  const r = makeRng(seed);
  const S = T.roomSize, H = T.wallH, WT = T.wallT;
  const [cols, rows] = gridSizeFor(n);
  const boxes = [];   // static visual boxes: {x,y,z,sx,sy,sz,c}
  const solids = [];  // colliders: {minx,maxx,miny,maxy,minz,maxz,top}
  const glows = [];   // lamp glow points
  const box = (x, y, z, sx, sy, sz, c, solid = false, top = 0) => {
    boxes.push({ x, y, z, sx, sy, sz, c });
    if (solid) solids.push({ minx: x - sx / 2, maxx: x + sx / 2, miny: y - sy / 2, maxy: y + sy / 2, minz: z - sz / 2, maxz: z + sz / 2, top });
  };

  // ---- room graph: random spanning tree plus a few loops
  const id = (c, rr) => rr * cols + c;
  const links = new Set();
  const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const c = cur % cols, rr = Math.floor(cur / cols);
    const nb = [[c + 1, rr], [c - 1, rr], [c, rr + 1], [c, rr - 1]].filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows && !seen.has(id(x, y)));
    if (!nb.length) { stack.pop(); continue; }
    const [x, y] = r.pick(nb);
    links.add(key(cur, id(x, y))); seen.add(id(x, y)); stack.push(id(x, y));
  }
  for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
    if (c + 1 < cols && r.chance(0.3)) links.add(key(id(c, rr), id(c + 1, rr)));
    if (rr + 1 < rows && r.chance(0.3)) links.add(key(id(c, rr), id(c, rr + 1)));
  }
  const linked = (a, b) => links.has(key(a, b));

  // ---- start room and elevator cab (outside the south wall of a bottom-row room)
  const startC = r.int(0, cols - 1), startR = rows - 1, startId = id(startC, startR);
  const cabW = 3.8, cabD = 3.2;
  const cabX = startC * S + S / 2, cabZ0 = rows * S;
  const elevator = { minx: cabX - cabW / 2 + 0.1, maxx: cabX + cabW / 2 - 0.1, minz: cabZ0 - 0.6, maxz: cabZ0 + cabD - 0.1, x: cabX, z: cabZ0 + cabD / 2 };

  // ---- floors, ceiling, rugs
  const themeNames = Object.keys(THEMES);
  const rooms = [];
  for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
    const rid = id(c, rr);
    const theme = rid === startId ? 'lounge' : r.pick(themeNames);
    rooms.push({ id: rid, c, r: rr, x0: c * S, z0: rr * S, theme, start: rid === startId });
    box(c * S + S / 2, -0.1, rr * S + S / 2, S, 0.2, S, (c + rr) % 2 ? PAL.floorA : PAL.floorB);
  }
  const worldW = cols * S, worldD = rows * S;
  box(worldW / 2, H + 0.1, worldD / 2 + cabD / 2, worldW + 1, 0.2, worldD + cabD + 1, PAL.ceiling);

  // ---- walls with door gaps
  const wallSeg = (x0, z0, x1, z1) => { // axis-aligned segment
    const horiz = z0 === z1;
    const len = horiz ? x1 - x0 : z1 - z0;
    if (len <= 0.01) return;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (horiz) { box(cx, H / 2, cz, len, H, WT, PAL.wall, true); box(cx, 0.45, cz, len, 0.9, WT + 0.06, PAL.wainscot); box(cx, 0.06, cz, len, 0.12, WT + 0.1, PAL.trim); }
    else { box(cx, H / 2, cz, WT, H, len, PAL.wall, true); box(cx, 0.45, cz, WT + 0.06, 0.9, len, PAL.wainscot); box(cx, 0.06, cz, WT + 0.1, 0.12, len, PAL.trim); }
  };
  const wallWithGap = (x0, z0, x1, z1, gap) => {
    const horiz = z0 === z1;
    if (!gap) { wallSeg(x0, z0, x1, z1); return; }
    const mid = horiz ? (x0 + x1) / 2 : (z0 + z1) / 2;
    const a = mid - gap / 2, b = mid + gap / 2;
    if (horiz) { wallSeg(x0, z0, a, z0); wallSeg(b, z0, x1, z0); box(mid, (T.doorH + H) / 2, z0, gap, H - T.doorH, WT, PAL.wall);
      box(a, T.doorH / 2, z0, 0.16, T.doorH, WT + 0.12, PAL.trim); box(b, T.doorH / 2, z0, 0.16, T.doorH, WT + 0.12, PAL.trim); box(mid, T.doorH, z0, gap + 0.3, 0.16, WT + 0.12, PAL.trim); }
    else { wallSeg(x0, z0, x0, a); wallSeg(x0, b, x0, z1); box(x0, (T.doorH + H) / 2, mid, WT, H - T.doorH, gap, PAL.wall);
      box(x0, T.doorH / 2, a, WT + 0.12, T.doorH, 0.16, PAL.trim); box(x0, T.doorH / 2, b, WT + 0.12, T.doorH, 0.16, PAL.trim); box(x0, T.doorH, mid, WT + 0.12, 0.16, gap + 0.3, PAL.trim); }
  };
  for (let rr = 0; rr <= rows; rr++) for (let c = 0; c < cols; c++) { // horizontal walls (z = rr*S)
    const z = rr * S, x0 = c * S, x1 = x0 + S;
    let gap = 0;
    if (rr > 0 && rr < rows && linked(id(c, rr - 1), id(c, rr))) gap = T.doorW;
    if (rr === rows && c === startC) gap = cabW;
    wallWithGap(x0, z, x1, z, gap);
  }
  for (let c = 0; c <= cols; c++) for (let rr = 0; rr < rows; rr++) { // vertical walls (x = c*S)
    const x = c * S, z0 = rr * S, z1 = z0 + S;
    const gap = c > 0 && c < cols && linked(id(c - 1, rr), id(c, rr)) ? T.doorW : 0;
    wallWithGap(x, z0, x, z1, gap);
  }
  // elevator cab
  box(cabX, -0.08, cabZ0 + cabD / 2, cabW, 0.2, cabD, PAL.cabFloor);
  box(cabX - cabW / 2 - WT / 2, H / 2, cabZ0 + cabD / 2, WT, H, cabD, PAL.cabWall, true);
  box(cabX + cabW / 2 + WT / 2, H / 2, cabZ0 + cabD / 2, WT, H, cabD, PAL.cabWall, true);
  box(cabX, H / 2, cabZ0 + cabD + WT / 2, cabW + WT * 2, H, WT, PAL.cabWall, true);
  box(cabX - cabW / 2, H / 2, cabZ0, 0.22, H, WT + 0.2, PAL.gold); box(cabX + cabW / 2, H / 2, cabZ0, 0.22, H, WT + 0.2, PAL.gold);
  box(cabX, H - 0.1, cabZ0, cabW + 0.4, 0.22, WT + 0.2, PAL.gold);
  box(cabX, 0.02, cabZ0 + cabD / 2, cabW - 0.5, 0.04, cabD - 0.5, 0xe8c45a);

  // ---- furniture
  const occupied = [];
  const free = (minx, maxx, minz, maxz) => occupied.every((o) => maxx < o.minx || minx > o.maxx || maxz < o.minz || minz > o.maxz);
  const surfaces = []; // places loot can sit: {x,z,y,hw,hd,room}
  const place = (room, name, side, u) => {
    const f = FURNITURE[name](r);
    const rot = { N: 0, S: 2, W: 1, E: 3 }[side] || 0;
    const fw = rot % 2 ? f.d : f.w, fd = rot % 2 ? f.w : f.d;
    let cx, cz;
    const m = 0.2;
    if (side === 'N') { cx = u; cz = m + f.d / 2; }
    else if (side === 'S') { cx = u; cz = S - m - f.d / 2; }
    else if (side === 'W') { cx = m + f.d / 2; cz = u; }
    else if (side === 'E') { cx = S - m - f.d / 2; cz = u; }
    else { cx = S / 2; cz = S / 2; }
    const wx = room.x0 + cx, wz = room.z0 + cz;
    const pad = 0.1;
    if (!free(wx - fw / 2 - pad, wx + fw / 2 + pad, wz - fd / 2 - pad, wz + fd / 2 + pad)) return false;
    occupied.push({ minx: wx - fw / 2, maxx: wx + fw / 2, minz: wz - fd / 2, maxz: wz + fd / 2 });
    const tf = (lx, lz) => [[lx, lz], [lz, -lx], [-lx, -lz], [-lz, lx]][rot];
    for (const [x, y, z, sx, sy, sz, col] of f.parts) {
      const [ox, oz] = tf(x, z);
      box(wx + ox, y, wz + oz, rot % 2 ? sz : sx, sy, rot % 2 ? sx : sz, col);
    }
    solids.push({ minx: wx - fw / 2, maxx: wx + fw / 2, miny: 0, maxy: f.h, minz: wz - fd / 2, maxz: wz + fd / 2, top: f.top || f.h });
    if (f.top) surfaces.push({ x: wx, z: wz, y: f.top, hw: fw / 2 - 0.25, hd: fd / 2 - 0.25, room: room.id });
    if (f.glow) { const [gx, gz] = tf(f.glow[0], f.glow[2]); glows.push({ x: wx + gx, y: f.glow[1], z: wz + gz }); }
    return true;
  };
  const cages = [];
  const cageRooms = [];
  if (type === 'rescue') {
    const cand = r.shuffle(rooms.filter((rm) => !rm.start));
    cageRooms.push(...cand.slice(0, Math.min(cand.length, 3 + (n > 6 ? 1 : 0))).map((rm) => rm.id));
  }
  for (const room of rooms) {
    const th = THEMES[room.theme];
    const c = room.c, rr = room.r;
    const doorOn = {
      N: rr > 0 && linked(room.id, id(c, rr - 1)), S: (rr < rows - 1 && linked(room.id, id(c, rr + 1))) || room.start,
      W: c > 0 && linked(room.id, id(c - 1, rr)), E: c < cols - 1 && linked(room.id, id(c + 1, rr)),
    };
    if (th.rug && !room.start) box(room.x0 + S / 2, 0.015, room.z0 + S / 2, S * 0.55, 0.03, S * 0.55, th.rug);
    if (room.start) box(room.x0 + S / 2, 0.015, room.z0 + S / 2 - 0.6, S * 0.5, 0.03, S * 0.4, 0xb23a48);
    const isCage = cageRooms.includes(room.id);
    if (!room.start && !isCage) { const cp = r.pick(th.center); if (cp) place(room, cp, 'C', 0); }
    if (isCage) {
      const cx = room.x0 + S / 2, cz = room.z0 + S / 2;
      cages.push({ id: cages.length, x: cx, z: cz });
      solids.push({ minx: cx - 0.6, maxx: cx + 0.6, miny: 0, maxy: 2.0, minz: cz - 0.6, maxz: cz + 0.6, top: 2.0 });
      occupied.push({ minx: cx - 1.2, maxx: cx + 1.2, minz: cz - 1.2, maxz: cz + 1.2 });
    }
    for (const side of r.shuffle(['N', 'S', 'W', 'E'])) {
      if (room.start && side === 'S') continue;
      if (!doorOn[side] && r.chance(0.8)) place(room, r.pick(th.mid), side, S / 2);
      for (const end of [0, 1]) {
        if (room.start && end === 1 && side !== 'N') continue; // keep the spawn area by the cab clear
        if (!r.chance(room.start ? 0.35 : 0.6)) continue;
        const name = r.pick(th.wall);
        const f = FURNITURE[name](makeRng(1));
        const u = end === 0 ? 0.35 + f.w / 2 : S - 0.35 - f.w / 2;
        place(room, name, side, u);
      }
    }
  }

  // ---- walk grid (0.5 m cells) for bots and guests
  const cell = 0.5;
  const gx = Math.ceil(worldW / cell), gz = Math.ceil((worldD + cabD) / cell);
  const walk = new Uint8Array(gx * gz);
  for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) {
    const x = (i + 0.5) * cell, z = (j + 0.5) * cell;
    let ok = z < worldD || (x > elevator.minx && x < elevator.maxx && z < cabZ0 + cabD);
    if (ok) for (const s of solids) { if (s.miny < 1.2 && x > s.minx - 0.35 && x < s.maxx + 0.35 && z > s.minz - 0.35 && z < s.maxz + 0.35) { ok = false; break; } }
    walk[j * gx + i] = ok ? 1 : 0;
  }
  const grid = { cell, gx, gz, walk };
  const openSpot = (room, tries = 30) => {
    for (let k = 0; k < tries; k++) {
      const x = room.x0 + r.range(1.0, S - 1.0), z = room.z0 + r.range(1.0, S - 1.0);
      const i = Math.floor(x / cell), j = Math.floor(z / cell);
      if (walk[j * gx + i]) return { x, z };
    }
    return { x: room.x0 + S / 2, z: room.z0 + S / 2 };
  };

  // ---- loot
  const others = rooms.filter((rm) => !rm.start);
  const loot = [];
  const lightKinds = ['vase', 'orb', 'frame', 'trophy', 'musicbox', 'bars'];
  const quota = quotaFor(n, type);
  const lootTarget = quota * (type === 'treasure' ? 1.9 : 1.25) - (type === 'rescue' ? 80 * cages.length : 0);
  const minLight = 6 + Math.floor(n / 2) + (type === 'treasure' ? 4 : 0);
  let total = 0, lid = 0;
  const heavyCount = Math.min(1 + Math.floor(n / 3), 3) + (type === 'treasure' ? 1 : 0);
  for (let k = 0; k < heavyCount; k++) {
    const room = r.pick(others); const p = openSpot(room);
    const kind = r.chance(0.5) ? 'clock' : 'throne';
    const def = LOOT[kind]; const v = Math.round(r.range(def.value[0], def.value[1]) / 5) * 5;
    loot.push({ id: lid++, kind, x: p.x, y: def.r, z: p.z, value: v });
  }
  r.shuffle(surfaces);
  let si = 0, guard = 0, light = 0;
  while ((total < lootTarget || light < minLight) && guard++ < 80) {
    light++;
    const kind = r.pick(lightKinds); const def = LOOT[kind];
    let x, y, z;
    const s = surfaces[si++];
    if (s && rooms[s.room] && !rooms[s.room].start) { x = s.x + r.range(-1, 1) * Math.max(0, s.hw); z = s.z + r.range(-1, 1) * Math.max(0, s.hd); y = s.y + def.r; }
    else { const p = openSpot(r.pick(others)); x = p.x; z = p.z; y = def.r; }
    const v = Math.round(r.range(def.value[0], def.value[1]) / 5) * 5;
    loot.push({ id: lid++, kind, x, y, z, value: v }); total += v;
  }

  // ---- ghosts
  const ghosts = [];
  let gid = 0;
  const addGhost = (kind, room) => { const p = openSpot(room); ghosts.push({ id: gid++, kind, x: p.x, y: 1.5, z: p.z }); };
  const extra = Math.max(0, players - 2);
  if (type === 'boss') {
    const far = others.reduce((a, b) => (Math.hypot(b.c - startC, b.r - startR) > Math.hypot(a.c - startC, a.r - startR) ? b : a), others[0]);
    addGhost('boss', far);
    for (let k = 0; k < 2 + Math.floor(n / 5); k++) addGhost('wisp', r.pick(others));
  } else {
    const count = 3 + Math.floor(n * 0.7) + extra;
    for (let k = 0; k < count; k++) {
      const roll = r.next();
      const kind = n >= 2 && roll < 0.18 + n * 0.02 ? 'horn' : roll < 0.6 ? 'puff' : 'wisp';
      addGhost(kind, r.pick(others));
    }
    if (type === 'treasure') addGhost('gold', r.pick(others));
    if (type === 'rescue') for (const cg of cages) ghosts.push({ id: gid++, kind: 'puff', x: cg.x + 2, y: 1.5, z: cg.z });
  }

  // ---- spawn points in front of the cab
  const spawns = [];
  const walkable = (x, z) => walk[Math.floor(z / cell) * gx + Math.floor(x / cell)] === 1;
  for (let k = 0; k < 6; k++) {
    let x = cabX - 2.9 + k * 1.16, z = cabZ0 - 1.5; // one row facing into the hotel, nobody blocks the view
    for (let t = 0; t < 40 && !walkable(x, z); t++) { x = cabX + r.range(-1.6, 1.6); z = cabZ0 + r.range(-3, 1.5); }
    spawns.push({ x, z, yaw: 0 });
  }

  total += loot.filter((l) => LOOT[l.kind].weight >= 3).reduce((a, l) => a + l.value, 0);
  return { seed, n, type, cols, rows, S, worldW, worldD, cab: { x: cabX, z0: cabZ0, w: cabW, d: cabD }, boxes, solids, glows,
    rooms, elevator, grid, loot, ghosts, cages, spawns, quota, time: timeFor(n, type, extraTime), lootTotal: total };
}

// ---- shared collision helpers
export function collideCircle(floor, x, z, rad, feetY = 0, headY = 1.7) {
  for (let pass = 0; pass < 2; pass++) {
    for (const s of floor.solids) {
      if (s.maxy <= feetY + 0.3 || s.miny >= headY) continue;
      const cx = Math.max(s.minx, Math.min(x, s.maxx)), cz = Math.max(s.minz, Math.min(z, s.maxz));
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < rad * rad) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), push = rad - d; x += (dx / d) * push; z += (dz / d) * push; }
        else { // centre inside the box: push out along the smallest axis
          const l = x - s.minx, rr = s.maxx - x, b = z - s.minz, f = s.maxz - z, m = Math.min(l, rr, b, f);
          if (m === l) x = s.minx - rad; else if (m === rr) x = s.maxx + rad; else if (m === b) z = s.minz - rad; else z = s.maxz + rad;
        }
      }
    }
  }
  return [x, z];
}

// height of the highest surface under a point (for standing on furniture after a jump)
export function groundAt(floor, x, z, rad, feetY) {
  let g = 0;
  for (const s of floor.solids) {
    if (s.top <= g || s.top > feetY + 0.05) continue;
    if (x > s.minx - rad * 0.5 && x < s.maxx + rad * 0.5 && z > s.minz - rad * 0.5 && z < s.maxz + rad * 0.5) g = s.top;
  }
  return g;
}

// true when a straight line between two points at eye/ghost height crosses no wall
export function lineClear(floor, ax, az, bx, bz, y = 1.4) {
  for (const s of floor.solids) {
    if (s.maxy < y || s.miny > y) continue;
    if (s.maxy - s.miny < 2.0) continue; // only tall stuff (walls, wardrobes) blocks light
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    for (const [p, d, lo, hi] of [[ax, dx, s.minx, s.maxx], [az, dz, s.minz, s.maxz]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < 1 && t1 > 0) return false;
  }
  return true;
}

export function inElevator(floor, x, z) {
  const e = floor.elevator;
  return x > e.minx && x < e.maxx && z > e.minz && z < e.maxz;
}

// Breadth-first distance field toward a goal cell; bots walk downhill on it.
export function flowField(floor, gxw, gzw) {
  const { gx, gz, walk, cell } = floor.grid;
  const dist = new Int16Array(gx * gz).fill(-1);
  let gi = Math.min(gx - 1, Math.max(0, Math.floor(gxw / cell))), gj = Math.min(gz - 1, Math.max(0, Math.floor(gzw / cell)));
  if (!walk[gj * gx + gi]) { // snap the goal to the nearest walkable cell
    let best = -1, bd = 1e9;
    for (let j = Math.max(0, gj - 4); j <= Math.min(gz - 1, gj + 4); j++) for (let i = Math.max(0, gi - 4); i <= Math.min(gx - 1, gi + 4); i++) {
      if (walk[j * gx + i]) { const d = (i - gi) ** 2 + (j - gj) ** 2; if (d < bd) { bd = d; best = j * gx + i; } }
    }
    if (best < 0) return dist;
    gi = best % gx; gj = Math.floor(best / gx);
  }
  const q = new Int32Array(gx * gz); let h = 0, t = 0;
  q[t++] = gj * gx + gi; dist[gj * gx + gi] = 0;
  while (h < t) {
    const k = q[h++], i = k % gx, j = (k - i) / gx, d = dist[k] + 1;
    if (i > 0 && walk[k - 1] && dist[k - 1] < 0) { dist[k - 1] = d; q[t++] = k - 1; }
    if (i < gx - 1 && walk[k + 1] && dist[k + 1] < 0) { dist[k + 1] = d; q[t++] = k + 1; }
    if (j > 0 && walk[k - gx] && dist[k - gx] < 0) { dist[k - gx] = d; q[t++] = k - gx; }
    if (j < gz - 1 && walk[k + gx] && dist[k + gx] < 0) { dist[k + gx] = d; q[t++] = k + gx; }
  }
  return dist;
}

// direction to walk from (x,z) following a flow field; null when unreachable
export function flowDir(floor, dist, x, z) {
  const { gx, gz, cell } = floor.grid;
  const i = Math.floor(x / cell), j = Math.floor(z / cell);
  if (i < 0 || j < 0 || i >= gx || j >= gz) return null;
  let best = dist[j * gx + i], bi = i, bj = j;
  if (best < 0) best = 1e9;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= gx || nj >= gz) continue;
    const d = dist[nj * gx + ni];
    if (d >= 0 && d < best) {
      if (di && dj && (dist[j * gx + ni] < 0 || dist[nj * gx + i] < 0)) continue; // no corner cutting
      best = d; bi = ni; bj = nj;
    }
  }
  if (bi === i && bj === j) return dist[j * gx + i] === 0 ? { x: 0, z: 0, at: true } : null;
  const tx = (bi + 0.5) * cell - x, tz = (bj + 0.5) * cell - z, l = Math.hypot(tx, tz) || 1;
  return { x: tx / l, z: tz / l, at: false };
}
