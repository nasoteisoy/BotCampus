import { TILE } from './constants.js';

/**
 * Round 3 layout (mockup_x3_v2): grass-majority meadow, winding 2–3 tile dirt
 * path, one modest ~8×6 clearing near spawn. 4-bit Wang autotile for edges.
 */
export function createMap(cols = 56, rows = 48, seed = 77) {
  const ground = new Array(cols * rows);
  const objects = [];
  const blockers = [];
  const trees = [];

  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  const at = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? null : ground[r * cols + c];
  const set = (c, r, t) => { if (c >= 0 && r >= 0 && c < cols && r < rows) ground[r * cols + c] = t; };
  const isDirt = (c, r) => {
    const t = at(c, r);
    return t && String(t).startsWith('dirt');
  };

  // --- Base grass (majority) ---
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = rnd();
      if (n < 0.08) set(c, r, 'grass_2');
      else if (n < 0.48) set(c, r, 'grass_1');
      else set(c, r, 'grass_0');
    }
  }

  const pathMask = new Array(cols * rows).fill(false);
  function stampPath(c, r, radius) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        // diamond-ish with slight fill for soft edges
        if (Math.abs(dx) + Math.abs(dy) <= radius) {
          const cc = c + dx, rr = r + dy;
          if (cc >= 2 && rr >= 2 && cc < cols - 2 && rr < rows - 2) {
            pathMask[rr * cols + cc] = true;
          }
        }
      }
    }
  }

  // Single winding path (2–3 tiles): horizontal meander, not a plaza cross
  let py = Math.floor(rows * 0.55);
  for (let c = 2; c < cols - 2; c++) {
    py += Math.round(Math.sin(c * 0.22) * 0.85 + Math.sin(c * 0.07) * 0.4);
    py = Math.max(10, Math.min(rows - 11, py));
    // mostly radius 1 (≈3-tile diamond), occasional radius 1 only
    const wide = (c % 11 === 0) ? 1 : 1;
    stampPath(c, py, wide);
    // thicken to 2-tile band on the main walk
    stampPath(c, py + 1, 0);
    if (c % 5 !== 0) stampPath(c, py - 1, 0);
  }

  // Modest round clearing ~8×6 near spawn (center)
  const cc0 = Math.floor(cols / 2), rr0 = Math.floor(rows / 2);
  for (let r = rr0 - 3; r <= rr0 + 2; r++) {
    for (let c = cc0 - 4; c <= cc0 + 3; c++) {
      const dx = (c - cc0) / 4.2, dy = (r - rr0) / 3.2;
      if (dx * dx + dy * dy < 1) pathMask[r * cols + c] = true;
    }
  }

  // Apply dirt_center first
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (pathMask[r * cols + c]) set(c, r, 'dirt_center');
    }
  }

  /**
   * 4-bit Wang mask: N=1 E=2 S=4 W=8 when neighbor is NOT dirt (grass/edge).
   * Corner tile asset = grass in NW, dirt elsewhere → NW outer corner.
   */
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!pathMask[r * cols + c]) continue;
      const N = !isDirt(c, r - 1);
      const E = !isDirt(c + 1, r);
      const S = !isDirt(c, r + 1);
      const W = !isDirt(c - 1, r);
      const mask = (N ? 1 : 0) | (E ? 2 : 0) | (S ? 4 : 0) | (W ? 8 : 0);

      // Also peek diagonals for concave (inner) corners — use center (no inner tile)
      const NE = !isDirt(c + 1, r - 1);
      const NW = !isDirt(c - 1, r - 1);
      const SE = !isDirt(c + 1, r + 1);
      const SW = !isDirt(c - 1, r + 1);

      let tile = 'dirt_center';
      switch (mask) {
        case 0:
          // fully surrounded by dirt — but diagonal grass = concave inner; keep center
          tile = 'dirt_center';
          break;
        case 1: tile = 'dirt_edge_n'; break;
        case 2: tile = 'dirt_edge_e'; break;
        case 4: tile = 'dirt_edge_s'; break;
        case 8: tile = 'dirt_edge_w'; break;
        case 1 | 8: tile = 'dirt_corner_nw'; break; // 9
        case 1 | 2: tile = 'dirt_corner_ne'; break; // 3
        case 4 | 8: tile = 'dirt_corner_sw'; break; // 12
        case 2 | 4: tile = 'dirt_corner_se'; break; // 6
        // opposite edges (thin corridor): prefer the "more open" cardinal
        case 1 | 4: tile = 'dirt_edge_n'; break; // 5
        case 2 | 8: tile = 'dirt_edge_e'; break; // 10
        // three-side: corner toward the two adjacent grass sides
        case 1 | 2 | 8: tile = 'dirt_edge_n'; break; // 11
        case 1 | 2 | 4: tile = 'dirt_edge_e'; break; // 7
        case 2 | 4 | 8: tile = 'dirt_edge_s'; break; // 14
        case 1 | 4 | 8: tile = 'dirt_edge_w'; break; // 13
        case 1 | 2 | 4 | 8: tile = 'dirt_edge_n'; break; // island
        default: tile = 'dirt_center'; break;
      }

      // Concave inner corner: dirt with only a diagonal grass neighbor and mask==0
      // already center. If mask has a single cardinal but the orthogonal-diagonal
      // suggests a hard stair, prefer corner when BOTH adjacent cardinals are grass
      // (handled above). Done.
      set(c, r, tile);
      void NE; void NW; void SE; void SW;
    }
  }

  function nearPath(c, r, d = 2) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (isDirt(c + dx, r + dy)) return true;
      }
    }
    return false;
  }
  function inClearing(c, r) {
    return Math.hypot(c - cc0, r - rr0) < 5.5;
  }

  function placeTree(c, r) {
    if (c < 1 || r < 1 || c >= cols - 2 || r >= rows - 2) return;
    if (isDirt(c, r) || isDirt(c + 1, r)) return;
    if (inClearing(c, r)) return;
    if (trees.some((t) => Math.abs(t.c - c) < 1 && Math.abs(t.r - r) < 1)) return;
    const x = c * TILE;
    const y = r * TILE - 32;
    trees.push({ c, r, x, y });
    blockers.push({ x: c * TILE + 12, y: r * TILE + 28, w: 8, h: 10, kind: 'trunk' });
  }

  // Tree border
  for (let c = 1; c < cols - 2; c += 2) {
    placeTree(c, 1);
    placeTree(c, rows - 3);
  }
  for (let r = 2; r < rows - 3; r += 2) {
    placeTree(1, r);
    placeTree(cols - 3, r);
  }
  for (let c = 2; c < cols - 3; c += 3) {
    placeTree(c, 2 + Math.floor(rnd() * 2));
    placeTree(c, rows - 4 - Math.floor(rnd() * 2));
  }

  // Ring framing clearing (not on dirt)
  for (let ang = 0; ang < Math.PI * 2; ang += 0.35) {
    const c = Math.round(cc0 + Math.cos(ang) * 7.5);
    const r = Math.round(rr0 + Math.sin(ang) * 6.2);
    if (!isDirt(c, r) && !nearPath(c, r, 0)) placeTree(c, r);
  }

  // Clusters in grass
  for (let i = 0; i < 70; i++) {
    const c = 3 + Math.floor(rnd() * (cols - 6));
    const r = 3 + Math.floor(rnd() * (rows - 6));
    if (inClearing(c, r) || nearPath(c, r, 1)) continue;
    placeTree(c, r);
    if (rnd() > 0.4) placeTree(c + 1 + Math.floor(rnd() * 2), r + Math.floor(rnd() * 2) - 1);
    if (rnd() > 0.55) placeTree(c - 1, r + 1);
  }

  // Bushes & rocks (grass only)
  for (let i = 0; i < 65; i++) {
    const c = 2 + Math.floor(rnd() * (cols - 4));
    const r = 2 + Math.floor(rnd() * (rows - 4));
    if (isDirt(c, r) || inClearing(c, r)) continue;
    if (trees.some((t) => t.c === c && t.r === r)) continue;
    objects.push({ kind: 'bush', c, r, x: c * TILE, y: r * TILE });
    blockers.push({ x: c * TILE + 2, y: r * TILE + 8, w: 12, h: 6, kind: 'bush' });
  }
  for (let i = 0; i < 35; i++) {
    const c = 2 + Math.floor(rnd() * (cols - 4));
    const r = 2 + Math.floor(rnd() * (rows - 4));
    if (isDirt(c, r) || inClearing(c, r)) continue;
    objects.push({ kind: 'rock', c, r, x: c * TILE, y: r * TILE });
    blockers.push({ x: c * TILE + 3, y: r * TILE + 6, w: 10, h: 8, kind: 'rock' });
  }

  const worldW = cols * TILE;
  const worldH = rows * TILE;
  const spawn = { x: cc0 * TILE + 8, y: rr0 * TILE + 8 };

  // Dirt fraction for sanity
  let dirtN = 0;
  for (let i = 0; i < pathMask.length; i++) if (pathMask[i]) dirtN++;
  const dirtFrac = dirtN / (cols * rows);

  function resolve(body) {
    for (const b of blockers) {
      if (body.x + body.w <= b.x || body.x >= b.x + b.w) continue;
      if (body.y + body.h <= b.y || body.y >= b.y + b.h) continue;
      const overlapL = (body.x + body.w) - b.x;
      const overlapR = (b.x + b.w) - body.x;
      const overlapT = (body.y + body.h) - b.y;
      const overlapB = (b.y + b.h) - body.y;
      const minX = Math.min(overlapL, overlapR);
      const minY = Math.min(overlapT, overlapB);
      if (minX < minY) {
        if (overlapL < overlapR) body.x -= overlapL;
        else body.x += overlapR;
      } else {
        if (overlapT < overlapB) body.y -= overlapT;
        else body.y += overlapB;
      }
    }
    body.x = Math.max(TILE, Math.min(worldW - TILE - body.w, body.x));
    body.y = Math.max(TILE, Math.min(worldH - TILE - body.h, body.y));
  }

  function drawTile(ctx, tiles, name, dx, dy) {
    if (name.startsWith('dirt_corner_')) {
      const img = tiles.dirt_corner;
      if (!img) return;
      ctx.save();
      ctx.translate(dx + 8, dy + 8);
      // Asset: grass NW. Flip to other outer corners.
      if (name.endsWith('_ne')) ctx.scale(-1, 1);
      else if (name.endsWith('_sw')) ctx.scale(1, -1);
      else if (name.endsWith('_se')) ctx.scale(-1, -1);
      ctx.drawImage(img, -8, -8);
      ctx.restore();
      return;
    }
    const img = tiles[name] || tiles.dirt_center;
    if (img) ctx.drawImage(img, dx, dy);
  }

  return {
    cols, rows, ground, objects, blockers, trees, worldW, worldH, spawn,
    at, resolve, drawTile, TILE, isDirt, dirtFrac,
  };
}
