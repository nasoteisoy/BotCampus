// Procedural dark satellite-style terrain: ridged mountains, hillshade, forest speckle, navy sea depth.
// computeTerrain() is pure (returns RGBA bytes) so node can time it; buildTerrainCanvas() wraps it for the page.

// Perlin-style gradient noise in [0,1], gradient lookup table (no trig per sample)
const GX = new Float32Array(256), GY = new Float32Array(256);
for (let i = 0; i < 256; i++) { const a = (i / 256) * Math.PI * 2 + 0.37; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
function gi(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) & 255;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  let k = gi(xi, yi, seed); const n00 = GX[k] * xf + GY[k] * yf;
  k = gi(xi + 1, yi, seed); const n10 = GX[k] * (xf - 1) + GY[k] * yf;
  k = gi(xi, yi + 1, seed); const n01 = GX[k] * xf + GY[k] * (yf - 1);
  k = gi(xi + 1, yi + 1, seed); const n11 = GX[k] * (xf - 1) + GY[k] * (yf - 1);
  const nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
  return 0.5 + (nx0 + (nx1 - nx0) * v) * 0.9;
}
export function fbm(x, y, oct, seed) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, seed + i * 17); norm += amp; amp *= 0.5; f *= 2.03; }
  return s / norm;
}
function ridged(x, y, oct, seed) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(2 * vnoise(x * f, y * f, seed + i * 31) - 1); s += amp * n * n; norm += amp; amp *= 0.5; f *= 2.1; }
  return s / norm;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function landShapes(islands, seed = 7) {
  const shapes = islands.map((i) => ({ x: i.x, y: i.y, rx: i.rx, ry: i.ry, rot: i.rot }));
  // decorative islets, not playable
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const decor = [[180, 300], [520, 1650], [930, 120], [1430, 1060], [1370, 560], [2470, 340], [2480, 1500], [880, 1080], [1700, 1560], [2150, 180], [140, 1460], [1880, 920]];
  for (const [x, y] of decor) shapes.push({ x, y, rx: 40 + rnd() * 70, ry: 25 + rnd() * 40, rot: rnd() * 3 });
  return shapes;
}

export function computeTerrain(islands, W, H, scale = 1, seed = 7) {
  const w = Math.round(W * scale), h = Math.round(H * scale);
  const L = new Float32Array(w * h).fill(-1);
  const shapes = landShapes(islands, seed).map((sh) => ({ ...sh, c: Math.cos(sh.rot), s: Math.sin(sh.rot), pad: 1.7 * Math.max(sh.rx, sh.ry) }));
  for (let py = 0; py < h; py++) {
    const wy0 = py / scale;
    const rowShapes = shapes.filter((sh) => Math.abs(wy0 - sh.y) < sh.pad + 140);
    if (!rowShapes.length) continue;
    for (let px = 0; px < w; px++) {
      const wx0 = px / scale;
      let near = false;
      for (const sh of rowShapes) if (Math.abs(wx0 - sh.x) < sh.pad + 140) { near = true; break; }
      if (!near) continue;
      const wx = wx0 + (fbm(wx0 * 0.004, wy0 * 0.004, 3, seed + 300) - 0.5) * 260;
      const wy = wy0 + (fbm(wx0 * 0.004, wy0 * 0.004, 3, seed + 400) - 0.5) * 260;
      let best = -1;
      for (const sh of rowShapes) {
        const dx = wx - sh.x, dy = wy - sh.y;
        const u = (dx * sh.c + dy * sh.s) / sh.rx, v = (-dx * sh.s + dy * sh.c) / sh.ry;
        const val = 1 - Math.sqrt(u * u + v * v);
        if (val > best) best = val;
      }
      L[py * w + px] = best;
    }
  }
  const E = new Float32Array(w * h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const k = py * w + px;
      const wx = px / scale, wy = py / scale;
      if (L[k] < -0.6) { E[k] = 0; continue; }
      let l = L[k] + (fbm(wx * 0.007, wy * 0.007, 4, seed) - 0.5) * 0.75 + (vnoise(wx * 0.035, wy * 0.035, seed + 5) - 0.5) * 0.12;
      L[k] = l;
      if (l > 0) {
        const m = ridged(wx * 0.009, wy * 0.009, 5, seed + 101);
        const fine = ridged(wx * 0.045, wy * 0.045, 2, seed + 151);
        E[k] = sstep(0, 0.5, l) * (0.15 + 0.7 * m + 0.15 * fine);
      } else E[k] = 0;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  const lx = -0.6, ly = -0.65, lz = 0.45;
  const relief = 6 * scale * 6;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const k = py * w + px, o = k * 4;
      const l = L[k];
      const wx = px / scale, wy = py / scale;
      let R, G, B;
      if (l > 0) {
        const ex = (E[k + (px < w - 1 ? 1 : 0)] - E[k - (px > 0 ? 1 : 0)]) * relief;
        const ey = (E[k + (py < h - 1 ? w : 0)] - E[k - (py > 0 ? w : 0)]) * relief;
        const nl = Math.hypot(ex, ey, 1);
        let sh = (-ex * lx - ey * ly + lz) / nl;
        sh = 0.55 + Math.max(0, sh) * 0.85;
        const e = E[k];
        // valley olive -> ridge grey-tan, muted
        const t = sstep(0.15, 0.75, e);
        R = 40 + (86 - 40) * t; G = 50 + (82 - 50) * t; B = 36 + (66 - 36) * t;
        // forest speckle (dark dots) in lowlands
        const sp = vnoise(wx * 0.22, wy * 0.22, seed + 44);
        if (sp > 0.62 && e < 0.6) { const d = 1 - (sp - 0.62) * 1.1; R *= d; G *= d; B *= d; }
        const tone = 0.92 + fbm(wx * 0.012, wy * 0.012, 2, seed + 70) * 0.16;
        R *= sh * tone; G *= sh * tone; B *= sh * tone;
        // coast rim
        if (l < 0.025) { R = R * 0.6 + 70; G = G * 0.6 + 72; B = B * 0.6 + 66; }
      } else {
        const d = sstep(0, 0.22, -l);
        const n = fbm(wx * 0.004, wy * 0.004, 3, seed + 200) - 0.5;
        R = 26 + (12 - 26) * d + n * 8; G = 44 + (24 - 44) * d + n * 10; B = 62 + (44 - 62) * d + n * 14;
        if (-l < 0.03) { R += 10; G += 14; B += 14; }
      }
      // desaturate 35%
      const gray = R * 0.3 + G * 0.59 + B * 0.11;
      out[o] = R + (gray - R) * 0.35; out[o + 1] = G + (gray - G) * 0.35; out[o + 2] = B + (gray - B) * 0.35; out[o + 3] = 255;
    }
  }
  return { w, h, data: out };
}
