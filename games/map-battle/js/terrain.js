// Painted campaign-map terrain baked once into an offscreen canvas: olive/khaki ground, stippled
// forests, hill shading, field plots, streams, river, dirt roads, village roofs and earthworks.
// Source part: none in parts-library (2D painted map is new); palette sampled from Lead: Dev's ref still.
import { WORLD, RIVER, STREAMS, ROADS, VILLAGES, HAMLETS, HILLS, REDOUBTS, rng } from './map.js';

function hash(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x, y, seed, oct) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += valueNoise(x * f, y * f, seed + i * 17) * amp;
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

const ALL_VILLAGES = [...VILLAGES, ...HAMLETS];

/** Ground, forest and relief at half resolution, then scaled up so it reads like brushwork. */
function paintGround() {
  const W = WORLD.w / 2, H = WORLD.h / 2;
  const height = new Float32Array(W * H);
  const forestMask = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wx = x * 2, wy = y * 2;
      let h = fbm(wx * 0.003, wy * 0.003, 91, 3) * 0.5;
      for (const hill of HILLS) {
        const d2 = ((wx - hill.x) ** 2 + (wy - hill.y) ** 2) / (hill.r * hill.r);
        h += hill.h * Math.exp(-d2 * 1.6);
      }
      height[y * W + x] = h;
    }
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wx = x * 2, wy = y * 2;
      const tone = smooth(0.3, 0.75, fbm(wx * 0.0042, wy * 0.0042, 3, 4));
      const warm = fbm(wx * 0.011, wy * 0.011, 5, 3);
      const grass = fbm(wx * 0.05, wy * 0.05, 23, 2) - 0.5;
      let r = mix(122, 164, tone), gr = mix(118, 152, tone), b = mix(54, 82, tone);
      r += (warm - 0.5) * 24 + grass * 22; gr += (warm - 0.5) * 12 + grass * 20; b += grass * 8;
      let clear = 0;
      for (const v of ALL_VILLAGES) {
        const d = Math.hypot(wx - v.x, wy - v.y);
        if (d < 190) clear = Math.max(clear, 1 - d / 190);
      }
      const forest = smooth(0.5, 0.6, fbm(wx * 0.0058, wy * 0.0058, 11, 4) - clear * 0.25);
      const i = y * W + x;
      forestMask[i] = forest;
      if (forest > 0) {
        r = mix(r, 98, forest * 0.6);
        gr = mix(gr, 100, forest * 0.6);
        b = mix(b, 48, forest * 0.6);
      }
      const hx = height[Math.min(W * H - 1, i + W + 1)] - height[Math.max(0, i - W - 1)];
      const shade = Math.max(0.7, Math.min(1.28, 1 - hx * 3.2));
      const hgt = height[i];
      r = mix(r, 122, Math.min(0.35, hgt * 0.3)) * shade;
      gr = mix(gr, 102, Math.min(0.35, hgt * 0.3)) * shade;
      b = mix(b, 58, Math.min(0.35, hgt * 0.3)) * shade;
      const grain = (hash(x, y, 13) - 0.5) * 14;
      const edge = Math.min(wx, wy, WORLD.w - wx, WORLD.h - wy);
      const vig = 0.82 + 0.18 * smooth(0, 160, edge);
      const o = i * 4;
      px[o] = (r + grain) * vig; px[o + 1] = (gr + grain) * vig; px[o + 2] = (b + grain * 0.6) * vig; px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, forestMask, W, H };
}

/** Full-resolution pass: stippled tree crowns inside forests and fine grass grain everywhere. */
function stippleForests(g, ground) {
  const { forestMask, W } = ground;
  const img = g.getImageData(0, 0, WORLD.w, WORLD.h);
  const px = img.data;
  for (let y = 0; y < WORLD.h; y++) {
    for (let x = 0; x < WORLD.w; x++) {
      const o = (y * WORLD.w + x) * 4;
      const f = forestMask[(y >> 1) * W + (x >> 1)];
      let k = 1 + (hash(x, y, 31) - 0.5) * 0.1;
      if (f > 0.02) {
        const crown = valueNoise(x * 0.42, y * 0.42, 41);
        const lit = valueNoise(x * 0.42 + 0.35, y * 0.42 - 0.35, 41);
        k *= 1 - f * (0.38 - 0.42 * crown) + f * Math.max(0, lit - crown) * 0.25;
      }
      px[o] *= k; px[o + 1] *= k; px[o + 2] *= k;
    }
  }
  g.putImageData(img, 0, 0);
}

function strokePath(g, path, width, color, alpha = 1) {
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  g.globalAlpha = 1;
}

/** Wobble a path a little so roads look hand drawn. */
function wobble(path, amount, seed) {
  const r = rng(seed);
  return path.map(([x, y], i) => (i === 0 || i === path.length - 1 ? [x, y] : [x + (r() - 0.5) * amount, y + (r() - 0.5) * amount]));
}

function nearestRoadAngle(x, y) {
  let best = 0, bd = Infinity;
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const d = Math.hypot(road[i][0] - x, road[i][1] - y);
      if (d < bd) { bd = d; best = Math.atan2(road[i + 1][1] - road[i][1], road[i + 1][0] - road[i][0]); }
    }
  }
  return best;
}

function paintFields(g, v, r) {
  const n = 7 + Math.floor(r() * 5);
  const base = nearestRoadAngle(v.x, v.y);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = 60 + r() * 80;
    g.save();
    g.translate(v.x + Math.cos(a) * d, v.y + Math.sin(a) * d);
    g.rotate(base + (r() - 0.5) * 0.3);
    const w = 30 + r() * 46, h = 18 + r() * 28;
    const tones = ['rgba(190,170,96,0.45)', 'rgba(120,96,56,0.35)', 'rgba(150,150,70,0.4)', 'rgba(96,70,46,0.3)'];
    g.fillStyle = tones[Math.floor(r() * tones.length)];
    g.fillRect(-w / 2, -h / 2, w, h);
    g.strokeStyle = 'rgba(70,56,32,0.35)';
    g.lineWidth = 1;
    for (let s = -w / 2 + 4; s < w / 2; s += 5) { g.beginPath(); g.moveTo(s, -h / 2); g.lineTo(s, h / 2); g.stroke(); }
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.restore();
  }
}

function paintVillage(g, v, r, big) {
  const base = nearestRoadAngle(v.x, v.y);
  const n = big ? 20 : 12;
  const roofs = ['#5b4430', '#74402c', '#4e3d2e', '#865a3a', '#6a3a2a'];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * (big ? 52 : 36);
    const x = v.x + Math.cos(a) * d, y = v.y + Math.sin(a) * d;
    const w = 7 + r() * 7, h = 5 + r() * 4;
    g.save();
    g.translate(x, y);
    g.rotate(base + (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.25);
    g.fillStyle = 'rgba(30,24,12,0.45)';
    g.fillRect(-w / 2 + 2, -h / 2 + 2, w, h);
    g.fillStyle = roofs[Math.floor(r() * roofs.length)];
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = 'rgba(255,230,190,0.18)';
    g.fillRect(-w / 2, -h / 2, w, h / 2);
    g.strokeStyle = 'rgba(30,20,12,0.7)';
    g.lineWidth = 0.8;
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.restore();
  }
  // a church or manor block in the bigger villages
  if (big) {
    g.fillStyle = 'rgba(30,24,12,0.45)';
    g.fillRect(v.x - 6, v.y - 4, 15, 12);
    g.fillStyle = '#d9d0b4';
    g.fillRect(v.x - 8, v.y - 6, 14, 11);
    g.strokeStyle = 'rgba(40,30,20,0.8)';
    g.strokeRect(v.x - 8, v.y - 6, 14, 11);
  }
}

function paintRedoubt(g, rd) {
  const back = rd.ang + Math.PI;
  const arc = (w, color) => {
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath();
    g.arc(rd.x, rd.y, 24, back + 0.9, back + Math.PI * 2 - 0.9);
    g.stroke();
  };
  g.save();
  g.translate(2, 3);
  arc(11, 'rgba(30,20,10,0.45)');
  g.restore();
  arc(11, '#4a2c16');
  arc(7.5, '#8a5428');
  arc(2.5, '#b8783e');
}

export function paintTerrain() {
  const ground = paintGround();
  const c = document.createElement('canvas');
  c.width = WORLD.w; c.height = WORLD.h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(ground.canvas, 0, 0, WORLD.w, WORLD.h);
  stippleForests(g, ground);
  const r = rng(2026);
  for (const v of ALL_VILLAGES) paintFields(g, v, r);
  for (const s of STREAMS) { strokePath(g, s, 6, '#3a4f44', 0.55); strokePath(g, s, 3, '#4f7090', 0.9); }
  strokePath(g, RIVER, 20, '#33483f', 0.7);
  strokePath(g, RIVER, 14, '#3f6283');
  strokePath(g, RIVER, 9, '#4f78a0');
  strokePath(g, RIVER, 3, '#8fb0c8', 0.55);
  ROADS.forEach((road, i) => {
    const w = wobble(road, 5, 40 + i);
    strokePath(g, w, 7, '#4e3a24', 0.85);
    strokePath(g, w, 3.5, '#93724a', 0.9);
  });
  VILLAGES.forEach((v) => paintVillage(g, v, r, true));
  HAMLETS.forEach((v) => paintVillage(g, v, r, false));
  REDOUBTS.forEach((rd) => paintRedoubt(g, rd));
  // fine paper grain over everything
  const tile = document.createElement('canvas');
  tile.width = tile.height = 96;
  const tg = tile.getContext('2d');
  const ti = tg.createImageData(96, 96);
  for (let i = 0; i < 96 * 96; i++) {
    const v = hash(i % 96, Math.floor(i / 96), 29) * 255;
    ti.data[i * 4] = v; ti.data[i * 4 + 1] = v; ti.data[i * 4 + 2] = v * 0.8; ti.data[i * 4 + 3] = 255;
  }
  tg.putImageData(ti, 0, 0);
  g.globalAlpha = 0.07;
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = g.createPattern(tile, 'repeat');
  g.fillRect(0, 0, WORLD.w, WORLD.h);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return c;
}

export function shrinkTerrain(terrain, w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = Math.round((w * WORLD.h) / WORLD.w);
  c.getContext('2d').drawImage(terrain, 0, 0, c.width, c.height);
  return c;
}
