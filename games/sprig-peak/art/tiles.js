/**
 * Tile map helpers.
 * API:
 *   parseLevel(rows) -> { w, h, solids, entities, spawn, goal, checkpoint }
 *   solidAt(level, x, y)  world-pixel probe
 */
import { TILE } from '../js/constants.js';

const SOLID = new Set(['#', '=', 'M', 'H']);

export function parseLevel(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const solids = [];
  const entities = [];
  let spawn = { x: TILE * 2, y: TILE * 2 };
  let goal = null;
  let checkpoint = null;

  for (let ty = 0; ty < h; ty++) {
    solids[ty] = [];
    const row = rows[ty].padEnd(w, '.');
    for (let tx = 0; tx < w; tx++) {
      const ch = row[tx];
      solids[ty][tx] = SOLID.has(ch) ? ch : '.';
      // H = stone block (drawn as stone tile)
      const x = tx * TILE;
      const y = ty * TILE;
      switch (ch) {
        case 'P': spawn = { x, y: y - 8 }; break;
        case 'E': goal = { x, y }; break;
        case 'K': checkpoint = { x, y }; entities.push({ type: 'checkpoint', x, y }); break;
        case '^': entities.push({ type: 'spike', x, y }); break;
        case 'S': entities.push({ type: 'spring', x, y }); break;
        case 'M': entities.push({ type: 'moving', x, y, ox: x, oy: y, phase: tx * 0.4 }); solids[ty][tx] = '.'; break;
        case 'c': entities.push({ type: 'coin', x, y }); break;
        case '1': entities.push({ type: 'walker', x, y }); break;
        case '2': entities.push({ type: 'flyer', x, y, ox: x, oy: y }); break;
        case '3': entities.push({ type: 'shooter', x, y }); break;
        case 'f': entities.push({ type: 'frog', x, y }); break;
        case 'y': entities.push({ type: 'butterfly', x, y, ox: x, oy: y }); break;
        case 'd': entities.push({ type: 'decor', variant: 'grass', x, y }); break;
        case 'u': entities.push({ type: 'decor', variant: 'bush', x, y }); break;
        case '*': entities.push({ type: 'decor', variant: 'flower', x, y }); break;
        case 'r': entities.push({ type: 'decor', variant: 'rock', x, y }); break;
        case 'n': entities.push({ type: 'decor', variant: 'sign', x, y }); break;
        case '|': entities.push({ type: 'decor', variant: 'fence', x, y }); break;
        default: break;
      }
    }
  }
  // Snap decor so bottom sits on a solid top (within the tile below).
  for (const e of entities) {
    if (e.type !== 'decor') continue;
    const tx = Math.floor(e.x / TILE);
    let ty = Math.floor(e.y / TILE);
    let found = -1;
    for (let dy = 0; dy <= 4 && ty + dy < h; dy++) {
      const ch = solids[ty + dy][tx];
      if (ch === '#' || ch === '=') { found = ty + dy; break; }
    }
    if (found >= 0) e.y = found * TILE - TILE;
  }
  return { w, h, solids, entities, spawn, goal, checkpoint, rows };
}

export function tileAt(level, px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (ty < 0 || ty >= level.h || tx < 0 || tx >= level.w) return '#';
  return level.solids[ty][tx];
}

export function isSolid(ch) {
  return ch === '#' || ch === '=' || ch === 'M' || ch === 'H';
}
