// Pixel Alive — a 16-layer pixel film. Every pixel and every sound is made in code (no images, no audio files, no AI video).
// World + screen are a 135x240 framebuffer (scaled x8 with nearest-neighbour to 1080x1920).
(function (G) {
'use strict';
const W = 135, H = 240, GY = 150, CX = 74, TOTAL = 33;
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const P = {
  ink: '#0c0d14', line: '#3a3c4c', tick: '#5a5d72', grey: '#a7a9b0', greyD: '#85878f', greyL: '#c6c8ce', eye: '#15151c',
  body: '#3d4250', bodyD: '#23252e', bodyL: '#596075', belly: '#f1e9da', bellyD: '#d6cab6', beak: '#f2963f', feet: '#e8873e',
  scarf: '#ecb648', scarfD: '#b98426', pack: '#4f8fe0', packD: '#2d5fae',
  yel: '#ffd23f', cream: '#f4ecd8', cool: '#8fc4ff', shadow: '#05060a',
  sky0: '#0d1230', sky1: '#18205a', sky2: '#2a2a72', sky3: '#45388a',
  moon: '#f3ebc0', moonD: '#cdbf88', star: '#e9e6ff', starD: '#8c89c0',
  mtnF: '#4a4b92', mtnFL: '#6b6ab4', pine: '#1e2850', pineL: '#2c3a6c',
  grd: '#121a26', grdTop: '#2b4c3c', grdTop2: '#3e6c49', speck: '#1d2a38', pebble: '#2a3646',
  pool1: '#4f7f3e', pool2: '#8fb050', pool3: '#d9cf74',
  grass: '#3a7444', grassD: '#24502f', grassL: '#9fd060',
  trunk: '#5c3c2a', trunkD: '#3a2519', leaf: '#2c5a52', leafD: '#1b3a3a', leafL: '#46846c',
  house: '#4c4060', houseD: '#362c46', roof: '#7c3a3e', roofD: '#5a272c', win: '#ffd77a', winOff: '#1c1a28',
  lamp: '#ffc94d', lampHot: '#fff4bf', frame: '#2a2230', string: '#7a7288', fly: '#dcff7a', dust: '#a2a2b2',
};
for (const k in P) P[k] = hex(P[k]);

// ---------- timeline ----------
const INTRO = 3;
const STEPS = [
  ['LINE OF ACTION', 'CURVE = *ALIVE*', 2.5, 'curve'], ['ANTICIPATION', 'WIND *UP* FIRST', 2.5, 'arc'],
  ['FOLLOW-THROUGH', 'PARTS *LAG*', 2.5, 'tuft'], ['ONE WARM LIGHT', 'LOOK *HERE*', 2.5, 'lantern'],
  ['SKY', 'NOW THE *WORLD*', 0.7, 'sky'], ['MOON', 'NOW THE *WORLD*', 0.7, 'moon'], ['STARS', 'NOW THE *WORLD*', 0.7, 'star'],
  ['GROUND', 'NOW THE *WORLD*', 0.7, 'ground'], ['MID LAYER', '*PARALLAX*', 0.7, 'tree'], ['MOUNTAINS', '*PARALLAX*', 0.7, 'mtn'],
  ['LAMPLIGHT', '*WARM* VS ~COOL~', 0.7, 'glow'], ['TWINKLE', '*SMALL* LIFE', 0.7, 'sparkle'], ['GRASS', '*SMALL* LIFE', 0.7, 'grass'],
  ['LEAVES', '*SECONDARY* MOTION', 0.7, 'leaf'], ['FIREFLIES', '*SMALL* LIFE', 0.7, 'fly'], ['SOUND ON STEP', 'THUMP ON *EVERY* STEP', 3, 'sound'],
].map((s, i) => ({ i, name: s[0], cap: s[1], dur: s[2], icon: s[3] }));
{ let t = INTRO; for (const s of STEPS) { s.t0 = t; t += s.dur; s.t1 = t; } }
const T_ALIVE = STEPS[15].t1, T_TITLE = 28;          // 23.7 .. 28 'NOW IT'S ALIVE', 28 .. 33 title card
const HOP0 = STEPS[1].t0, HP = 1.5, T_LAND1 = HOP0 + 0.8 * HP;
const T_PENG = HOP0 + 0.8 * HP + HP;                    // first landing inside step 03 (8.2 s): parts pop up after it
const TYPE = 0.02;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const backOut = (k) => { const c = 2.2; k = clamp(k); return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const hr = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dith = (x, y) => BAY[((y & 3) << 2) | (x & 3)];

function maskAt(t, scene, user) {
  const m = [];
  for (let i = 0; i < 16; i++) m.push((scene || t >= STEPS[i].t0) && (!user || user[i]));
  return m;
}
function stepAt(t) { for (const s of STEPS) if (t >= s.t0 && t < s.t1) return s; return null; }

// ---------- framebuffer ----------
function FB() { return { d: new Uint8ClampedArray(W * H * 4), m: new Uint8Array(W * H) }; }
function set(fb, x, y, c) {
  x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4; fb.d[i] = c[0]; fb.d[i + 1] = c[1]; fb.d[i + 2] = c[2]; fb.d[i + 3] = 255;
}
function mix(fb, x, y, c, a) {
  x = Math.floor(x); y = Math.floor(y); if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4, d = fb.d; d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a;
}
function rect(fb, x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(fb, x + i, y + j, c); }
function fill(fb, c) { for (let i = 0; i < W * H; i++) { fb.d[i * 4] = c[0]; fb.d[i * 4 + 1] = c[1]; fb.d[i * 4 + 2] = c[2]; fb.d[i * 4 + 3] = 255; } fb.m.fill(0); }

// ---------- 5x7 pixel font ----------
const FONT = {};
(`A 01110100011000111111100011000110001|B 11110100011000111110100011000111110|C 01110100011000010000100001000101110|` +
 `D 11110100011000110001100011000111110|E 11111100001000011110100001000011111|F 11111100001000011110100001000010000|` +
 `G 01110100011000010111100011000101111|H 10001100011000111111100011000110001|I 01110001000010000100001000010001110|` +
 `J 00111000100001000010000101001001100|K 10001100101010011000101001001010001|L 10000100001000010000100001000011111|` +
 `M 10001110111010110101100011000110001|N 10001100011100110101100111000110001|O 01110100011000110001100011000101110|` +
 `P 11110100011000111110100001000010000|Q 01110100011000110001101011001001101|R 11110100011000111110101001001010001|` +
 `S 01111100001000001110000010000111110|T 11111001000010000100001000010000100|U 10001100011000110001100011000101110|` +
 `V 10001100011000110001100010101000100|W 10001100011000110101101011010101010|X 10001100010101000100010101000110001|` +
 `Y 10001100010101000100001000010000100|Z 11111000010001000100010001000011111|0 01110100011001110101110011000101110|` +
 `1 00100011000010000100001000010001110|2 01110100010000100010001000100011111|3 11111000100010000010000011000101110|` +
 `4 00010001100101010010111110001000010|5 11111100001111000001000011000101110|6 00110010001000011110100011000101110|` +
 `7 11111000010001000100010000100001000|8 01110100011000101110100011000101110|9 01110100011000101111000010001001100|` +
 `. 00000000000000000000000000110001100|! 00100001000010000100001000000000100|+ 00000001000010011111001000010000000|` +
 `- 00000000000000011111000000000000000|= 00000000001111100000111110000000000|' 00100001000100000000000000000000000|` +
 `? 01110100010000100010001000000000100|, 00000000000000000000001100010001000`).split('|').forEach((e) => { FONT[e[0]] = e.slice(2); });
function textW(s, sc = 1) { const n = s.replace(/[*~]/g, '').length; return n ? (n * 6 - 1) * sc : 0; }
function text(fb, s, x, y, sc = 1, col = P.cream, maxChars = 1e9, shadow = true) {
  let cx = Math.round(x), c = col, shown = 0;
  for (const ch of s) {
    if (ch === '*') { c = c === P.yel ? col : P.yel; continue; }
    if (ch === '~') { c = c === P.cool ? col : P.cool; continue; }
    if (shown++ >= maxChars) break;
    const g = FONT[ch];
    if (g) for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r * 5 + q] === '1') {
      if (shadow) rect(fb, cx + q * sc + sc, y + r * sc + sc, sc, sc, P.shadow);
      rect(fb, cx + q * sc, y + r * sc, sc, sc, c);
    }
    cx += 6 * sc;
  }
}
const textC = (fb, s, y, sc, col, n) => text(fb, s, Math.round((W - textW(s, sc)) / 2), y, sc, col, n);

// ---------- 9x9 icons (shared by film labels and the toggle buttons) ----------
const IPAL = { y: P.yel, w: P.cream, g: P.grey, k: P.bodyD, b: P.pack, n: P.sky1, p: P.mtnF, q: P.sky3, P: P.mtnFL, G: P.grassL, d: P.grass,
  o: P.lamp, r: P.trunk, m: P.moon, c: P.moonD, f: P.fly, h: P.lampHot, s: P.scarf, e: P.belly, R: P.roof };
const ICONS = {
  curve: ['......yy.', '.....yyyy', '.......y.', '......y..', '.....y...', '....y....', '...y.....', '..y......', '.yy......'],
  arc: ['...y.y...', '..y...y..', '.y.....y.', '.........', '..ggggg..', '.ggggggg.', '.ggggggg.', '.........', '.........'],
  tuft: ['..k.k.k..', '...kkk...', '..kkkkk..', '.kkeeeek.', '.kkekeeo.', '.kkeeeek.', '.ssssssk.', '..keeek..', '..o...o..'],
  lantern: ['....k....', '....k....', '...kkk...', '..koook..', '..kohok..', '..kohok..', '..koook..', '...kkk...', '.........'],
  sky: ['nnnnnnnnn', 'nnnnnnnnn', 'nqnnnqnnn', 'qnqnqnqnq', 'qqqqqqqqq', 'qPqqqPqqq', 'PqPqPqPqP', 'PPPPPPPPP', 'PPPPPPPPP'],
  moon: ['.........', '...mmm...', '..mmmmm..', '.mmcmmmm.', '.mmmmmcm.', '.mmmmmmm.', '..mmcmm..', '...mmm...', '.........'],
  star: ['....w....', '....w....', '...www...', '.wwwwwww.', '..wwwww..', '..ww.ww..', '.ww...ww.', '.........', '.........'],
  ground: ['.........', '.........', '.........', '.G..G..G.', 'GGGGGGGGG', 'ddddddddd', 'dkdddkddd', 'ddddddddd', 'dddkddkdd'],
  tree: ['.ddd.....', 'dGGGd....', 'dGGGd..R.', 'dGGGd.RRR', '.dGd..www', '..r...wow', '..r...www', '..r......', 'ddddddddd'],
  mtn: ['.........', '.........', '....w....', '...pPp...', '..ppppp.w', '.pppppppP', 'ppppppppp', 'ppppppppp', '.........'],
  glow: ['y...y...y', '.y..y..y.', '..yyyyy..', '..yhhhy..', 'yyyhhhyyy', '..yhhhy..', '..yyyyy..', '.y..y..y.', 'y...y...y'],
  sparkle: ['....w....', '....w....', '...www...', 'wwww.wwww', '...www...', '....w..w.', '....w.www', '.......w.', '.........'],
  grass: ['.........', '.G.....G.', '.G..G..G.', 'GG..G.GG.', '.GG.GG.G.', '.GGGGGGG.', 'ddddddddd', 'ddddddddd', '.........'],
  leaf: ['......GG.', '....GGGG.', '...GGGGG.', '..GGGdGG.', '..GGdGG..', '..GdGG...', '.dGG.....', 'd........', '.........'],
  fly: ['.........', '..f...f..', '...f.f...', '....f....', '...fff...', '..fffff..', '...fff...', '....f....', '.........'],
  sound: ['...w.....', '..ww..w..', 'wwww...w.', 'wwww.w.w.', 'wwww.w.w.', 'wwww...w.', '..ww..w..', '...w.....', '.........'],
  penguin: ['...k.k...', '...kkk...', '..kkkkk..', '.kkeeeek.', 'bkkekeeo.', 'bkkeeeek.', 'bssssssk.', '.kkeeeek.', '..o...o..'],
};
function icon(fb, name, x, y, sc = 1, alpha = 1) {
  const rows = ICONS[name]; if (!rows) return;
  for (let r = 0; r < 9; r++) for (let q = 0; q < 9; q++) { const c = IPAL[rows[r][q]]; if (c) for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) alpha >= 1 ? set(fb, x + q * sc + b, y + r * sc + a, c) : mix(fb, x + q * sc + b, y + r * sc + a, c, alpha); }
}

// ---------- the character ----------
function hopState(t, antic, hopping) {
  const s = { lift: 0, sx: 1, sy: 1, crouch: 0, air: 0, vy: 0, p: -1 };
  if (!hopping || t < HOP0) { s.sy = 1 + 0.025 * Math.sin(t * 3); s.sx = 1 / s.sy; return s; }
  const p = ((t - HOP0) / HP) % 1; s.p = p;
  if (p < 0.35) { const k = ease(p / 0.35); if (antic) { s.crouch = k; s.sy = 1 - 0.3 * k; s.sx = 1 + 0.24 * k; } }
  else if (p < 0.8) {
    const a = (p - 0.35) / 0.45; s.air = 1; s.lift = 18 * 4 * a * (1 - a); s.vy = 1 - 2 * a;
    if (antic) { s.sy = 1 + 0.2 * Math.abs(s.vy) * (a < 0.15 ? a / 0.15 : 1); s.sx = 1 / Math.sqrt(s.sy); }
  } else {
    const k = (p - 0.8) / 0.2;
    if (antic) { s.sy = 1 - 0.24 * Math.exp(-7 * k) * Math.cos(k * 9); s.sx = 1 / Math.sqrt(Math.max(0.5, s.sy)); }
  }
  return s;
}
function lastLanding(t) { if (t < T_LAND1) return -99; return T_LAND1 + Math.floor((t - T_LAND1) / HP) * HP; }
function charState(t, L, scene) {
  const s = hopState(t, L[1], scene || t >= HOP0);
  const ba = L[0] ? (scene ? 1 : clamp((t - STEPS[0].t0 - 0.3) / 0.9)) : 0;
  s.bulge = 0.11 * ba + 0.07 * s.crouch * ba; s.lean = 0.24 * ba - 0.34 * s.crouch * ba + 0.1 * s.air * s.vy * ba;
  s.peng = L[2] ? (scene ? 1 : clamp((t - T_PENG) / 0.4)) : 0;
  const tl = lastLanding(t), dt = t - tl;
  s.wob = (L[2] && (scene || tl >= T_PENG - 0.01)) ? Math.exp(-4 * dt) * Math.sin(15 * dt) : 0;
  if (!L[2]) s.wob = 0;
  s.t = t; s.scarfFlutter = L[13];
  return s;
}
function drawChar(fb, x0, gy, s, light) {
  const BW = 19, BH = 19, peng = s.peng, pop = backOut(peng);
  const hh = Math.max(6, Math.round(BH * s.sy * (1 + 0.14 * peng)));
  const base = Math.round(gy - s.lift);
  const cut = peng * 1.5 - 0.25;                                     // colour wipes bottom->top as the block becomes a penguin
  const geo = (v) => { const off = BW * (s.bulge * 4 * v * (1 - v) + s.lean * v * v); const hw = (BW / 2) * s.sx * (1 + 0.1 * peng * (1 - v) - 0.2 * peng * v * v); return [x0 + off, hw]; };
  const rowY = (v) => base - 1 - Math.floor(v * hh);
  const put = (x, y, c) => { set(fb, x, y, c); x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < W && y < H) fb.m[y * W + x] = 1; };
  // backpack (behind the body)
  if (peng > 0) {
    const [c4, h4] = geo(0.42), bx = Math.round(c4 - h4) - Math.round(3 * pop) + 1, y1 = rowY(0.66), y2 = rowY(0.16);
    for (let y = y1; y <= y2; y++) for (let x = bx; x < bx + 6; x++) put(x, y, (x === bx || y === y2) ? P.packD : (y === y1 ? P.pack : (x === bx + 1 ? P.packD : P.pack)));
    // scarf tail flutters behind (secondary motion when layer 14 is on)
    const [cs, hs] = geo(0.6), sxp = Math.round(cs - hs), syp = rowY(0.6);
    for (let k = 1; k <= Math.round(5 * pop); k++) {
      const flap = s.scarfFlutter ? 0.55 * Math.sin(s.t * 11 - k * 0.9) + 0.35 * s.air : 0.1 * s.wob;
      const ang = 1.15 - 0.5 * s.air - flap * (k / 5);
      put(sxp - Math.round(Math.sin(ang) * k * 0.9) - 1, syp + Math.round(Math.cos(ang) * k), k % 2 ? P.scarf : P.scarfD);
    }
  }
  // body
  const n = 10 - 7.6 * peng;
  for (let r = 0; r < hh; r++) {
    const v = (r + 0.5) / hh, y = base - 1 - r, [cx, hw] = geo(v), vv = 2 * v - 1;
    for (let x = Math.floor(cx - hw - 1); x <= Math.ceil(cx + hw + 1); x++) {
      const u = (x + 0.5 - cx) / hw;
      if (Math.pow(Math.abs(u), n) + Math.pow(Math.abs(vv), n) > 1) continue;
      let c;
      if (v < cut) {
        const bu = (u - 0.33) / 0.62, bv = (v - 0.44) / 0.46;
        if (r === 0 && ((u > 0.1 && u < 0.55) || (u < -0.15 && u > -0.6))) c = P.feet;
        else if (v > 0.53 && v < 0.65) c = v < 0.59 ? P.scarfD : P.scarf;
        else if (bu * bu + bv * bv < 1) c = (u > 0.86 ? P.bellyD : P.belly);
        else c = u < -0.72 ? P.bodyD : (vv > 0.82 && u < 0.4 ? P.bodyL : P.body);
      } else c = u < -0.72 ? P.greyD : (vv > 0.8 ? P.greyL : P.grey);
      put(x, y, c);
    }
  }
  // eye (+ beak once coloured)
  const ve = 0.74, [ce, he] = geo(ve), ey = rowY(ve);
  const ex = Math.round(ce + he * lerp(0.42, 0.5, peng));
  rect(fb, ex - 1, ey - 1, 2, 2, P.eye);
  if (ve < cut) {
    const vb = 0.66, [cb, hb] = geo(vb), by = rowY(vb), fx = Math.floor(cb + hb * 0.97);
    put(fx + 1, by, P.beak); put(fx + 2, by, P.beak); put(fx + 1, by + 1, P.feet);
  }
  // follow-through parts: flipper + head tuft lag behind and wobble after each landing
  if (peng > 0) {
    const vf = 0.55, [cf, hf] = geo(vf), px = cf - 0.15 * hf, py = rowY(vf);
    const a = 0.35 + 1.25 * s.air * (0.6 + 0.4 * s.vy) + 0.9 * s.wob + 0.5 * s.crouch;
    const len = Math.round(6 * pop);
    for (let k = 0; k <= len; k++) { const x = px - Math.sin(a) * k, y = py + Math.cos(a) * k; put(x, y, P.bodyD); if (k < len - 1) put(x + Math.cos(a), y + Math.sin(a), k === 0 ? P.bodyD : P.bodyL); }
    const [ct, htp] = geo(1), tx = ct + 0.05 * htp, ty = rowY(1) - 1;
    const tilt = -s.lean * 1.6 + 1.1 * s.wob - 0.7 * s.air * s.vy;
    [[-0.55, 2], [0, 3], [0.5, 2]].forEach(([da, l]) => { const L2 = Math.round(l * pop); for (let k = 0; k < L2; k++) put(tx + Math.sin(da + tilt) * k, ty - Math.cos(da + tilt) * k, P.bodyD); });
  }
  return { top: rowY(1) - 3, bot: base - 1, left: Math.floor(geo(0.5)[0] - 10), right: Math.ceil(geo(0.5)[0] + 10), base, hh, geo };
}

// ---------- world layers ----------
const camAt = (t, L, scene) => { if (!L[8]) return 0; const a = scene ? 1 : clamp((t - STEPS[8].t0) / 0.6); return 5 * a * Math.sin(0.8 * (t - STEPS[8].t0)); };
function noise1(x, seed) { const i = Math.floor(x), f = x - i; return lerp(hr(i * 7.3 + seed), hr((i + 1) * 7.3 + seed), f); }
function lanternPos(t, L, scene, cam) {
  let y = 112, x = 64;
  if (!scene) { const t4 = STEPS[3].t0 + 0.15, dt = t - t4; if (dt < 0.4) y = 112 - 120 * Math.pow(1 - clamp(dt / 0.4), 2); else y = 112 + 3 * Math.exp(-6 * (dt - 0.4)) * Math.sin(16 * (dt - 0.4)); }
  x += 1.2 * Math.sin(t * 1.6);
  if (L[8]) x += cam;
  return [x, y];
}
function drawWorld(fb, t, L, scene, ov) {
  const cam = camAt(t, L, scene);
  // 05 sky
  if (L[4]) { const st = [P.sky0, P.sky1, P.sky2, P.sky3]; for (let y = 0; y < GY; y++) { const k = clamp((y - 20) / (GY - 20)) * 3; const b = Math.min(2, Math.floor(k)), f = k - b; for (let x = 0; x < W; x++) set(fb, x, y, st[f > dith(x, y) ? b + 1 : b]); } for (let y = GY; y < H; y++) for (let x = 0; x < W; x++) set(fb, x, y, P.sky0); }
  else fill(fb, P.ink);
  // 07 stars (+12 twinkle)
  if (L[6]) for (let i = 0; i < 46; i++) {
    const x = ((hr(i) * 170 - cam * 0.05) % 170 + 170) % 170 - 15, y = 4 + hr(i + 99) * (GY - 40), big = hr(i + 7) > 0.8;
    let b = 0.65 + 0.35 * hr(i + 3);
    if (L[11]) b = clamp(0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * (2 + 3 * hr(i + 5)) + i * 2.1)));
    mix(fb, x, y, P.star, b);
    if (big && (!L[11] || b > 0.7)) { const a = L[11] ? (b - 0.7) / 0.3 : 0.55; mix(fb, x - 1, y, P.star, a * 0.6); mix(fb, x + 1, y, P.star, a * 0.6); mix(fb, x, y - 1, P.star, a * 0.6); mix(fb, x, y + 1, P.star, a * 0.6); }
  }
  // 06 moon
  if (L[5]) { const mx = 106 - cam * 0.1, my = 60, R = 8;
    for (let y = -R - 4; y <= R + 4; y++) for (let x = -R - 4; x <= R + 4; x++) { const d = Math.hypot(x + 0.5, y + 0.5);
      if (d < R) { let c = P.moon; if ((x + y) > 5 && dith(x + 64, y + 64) < ((x + y) - 5) / 8) c = P.moonD; set(fb, mx + x, my + y, c); }
      else if (d < R + 4 && dith(x + 64, y + 64) < 0.5 * (1 - (d - R) / 4)) mix(fb, mx + x, my + y, P.moon, 0.18); }
    [[-3, -2, 2], [2, 3, 1], [3, -3, 1]].forEach(([a, b, r]) => { for (let y = -r; y < r; y++) for (let x = -r; x < r; x++) set(fb, mx + a + x, my + b + y, P.moonD); });
  }
  // 10 mountains: far ridge + near pine line, slower than the mid layer
  if (L[9]) {
    for (let x = 0; x < W; x++) { const wx = x + cam * 0.25 + 400, h = 22 + 34 * noise1(wx / 15, 3), top = Math.round(GY - h), hp = 22 + 34 * noise1((wx - 1) / 15, 3);
      for (let y = top; y < GY; y++) set(fb, x, y, (y < top + 2 && h >= hp) ? P.mtnFL : P.mtnF); }
    for (let x = 0; x < W; x++) { const wx = x + cam * 0.5 + 900, cell = Math.floor(wx / 5), f = (wx / 5) - cell, h = 6 + 10 * hr(cell + 50), top = Math.round(GY - h * (1 - Math.abs(f - 0.5) * 1.6));
      for (let y = top; y < GY; y++) set(fb, x, y, f < 0.5 && y < top + 3 ? P.pineL : P.pine); }
  }
  // 09 mid layer: tree on the left (holds the lantern), tiny house on the right
  if (L[8]) {
    const hx = Math.round(110 + cam);
    rect(fb, hx - 6, GY - 9, 12, 9, P.house); rect(fb, hx - 6, GY - 9, 2, 9, P.houseD);
    for (let r = 0; r < 6; r++) rect(fb, hx - 7 + r, GY - 10 - r, 14 - 2 * r, 1, r < 1 ? P.roofD : P.roof);
    rect(fb, hx + 3, GY - 16, 2, 4, P.roofD); rect(fb, hx - 3, GY - 5, 2, 5, P.houseD);
    rect(fb, hx + 1, GY - 7, 3, 3, L[10] ? P.win : P.winOff);
    const tx = Math.round(20 + cam);
    for (let y = 88; y < GY; y++) { const bend = Math.round(2 * Math.sin((y - 88) / 20)); rect(fb, tx - 2 + bend, y, 5, 1, P.trunk); set(fb, tx - 2 + bend, y, P.trunkD); }
    for (let x = tx + 2; x <= 64 + cam; x++) { const y = Math.round(101 + Math.pow((x - tx) / 44, 2) * 3 - 3 * Math.sin((x - tx) / 14)); set(fb, x, y, P.trunk); set(fb, x, y + 1, P.trunkD); }
    const blobs = [[6, 76, 16], [26, 66, 15], [42, 80, 11], [12, 94, 11], [33, 90, 12], [-4, 90, 12], [50, 93, 7]];
    blobs.forEach(([bx, by, r], i) => { const sw = L[13] ? Math.round(1.6 * Math.sin(t * 2.2 + i * 1.3)) : 0, sv = L[13] ? Math.round(0.8 * Math.sin(t * 1.7 + i)) : 0;
      const cx = bx + cam + sw, cy = by + sv;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y) + 2.2 * noise1((Math.atan2(y, x) + 4) * 3, i * 9); if (d > r) continue;
        const lit = (-x - y) / (r * 1.4); set(fb, cx + x, cy + y, d > r - 1.5 ? P.leafD : (lit > 0.35 + 0.25 * dith(x + 99, y + 99) ? P.leafL : (lit < -0.3 ? P.leafD : P.leaf))); } });
    if (L[13]) for (let i = 0; i < 4; i++) { const ph = ((t * 0.28 + hr(i + 40)) % 1); const lx = 14 + 40 * hr(i + 41) + cam + 6 * Math.sin(ph * 12 + i) + ph * 10, ly = 92 + ph * (GY - 92); set(fb, lx, ly, P.leafL); set(fb, lx + (Math.sin(ph * 12 + i) > 0 ? 1 : -1), ly, P.leaf); }
  }
  // 08 ground (dark mass with a textured top edge) -- or just a horizon line before it arrives
  if (L[7]) {
    for (let x = 0; x < W; x++) { const wx = Math.floor(x + cam), bump = hr(wx * 3.1 + 2) > 0.7 ? -1 : 0;
      for (let y = GY + bump; y < H; y++) { let c = P.grd; if (y <= GY + 1) c = y === GY + bump ? P.grdTop2 : P.grdTop; else if (y === GY + 2 && hr(wx + 5) > 0.5) c = P.grdTop;
        else if (hr(wx * 13.7 + y * 7.1) > 0.93) c = P.speck; else if (hr(wx * 3.3 + y * 1.7) > 0.985) c = P.pebble; set(fb, x, y, c); } }
  } else { for (let x = 0; x < W; x++) set(fb, x, GY, (x % 8 === 0) ? P.tick : P.line); if (L[4]) for (let y = GY + 1; y < H; y++) for (let x = 0; x < W; x++) set(fb, x, y, P.ink); }
  // 04 warm pool of light on the ground
  const cx = CX + (L[8] ? cam : 0);
  if (L[3]) { const on = scene ? 1 : clamp((t - STEPS[3].t0 - 0.55) / 0.3), cols = [P.grdTop, P.pool1, P.pool2, P.pool3];
    if (on > 0) for (let y = GY; y < GY + 16; y++) for (let x = 0; x < W; x++) { const d = Math.pow((x - cx) / (36 * on + 1), 2) + Math.pow((y - GY + 3) / (10 * on + 1), 2); if (d >= 1) continue;
      const lv = Math.floor((1 - d) * 3.6 + dith(x, y) * 0.9); if (lv > 0) set(fb, x, y, cols[Math.min(3, lv)]); } }
  // contact shadow
  const hs0 = hopState(t, L[1], scene || t >= HOP0), sw = Math.round(9 * (1 - hs0.lift / 30));
  for (let x = -sw; x <= sw; x++) mix(fb, cx + x, GY, P.shadow, 0.55);
  // 13 grass blades (bend with wind, pushed out on each landing)
  const tl = lastLanding(t), rust = (t - tl < 0.6 && (scene || t >= HOP0)) ? Math.exp(-6 * (t - tl)) : 0;
  const grass = (front) => { if (!L[12]) return; for (let x = 0; x < W; x++) { const wx = Math.floor(x + cam); if (hr(wx * 1.7 + 11) < (front ? 0.82 : 0.35)) continue;
      const h = front ? 2 : 2 + Math.floor(hr(wx * 2.3) * 4), near = clamp(1 - Math.abs(x - cx) / 14), bend = 0.8 * Math.sin(t * 2.3 + wx * 0.25) + Math.sign(x - cx) * near * rust * 3;
      const inPool = L[3] && Math.abs(x - cx) < 30; for (let k = 0; k < h; k++) { const f = k / Math.max(1, h - 1); set(fb, x + Math.round(bend * f * f), GY - k - (front ? -1 : 0), k === h - 1 ? (inPool ? P.grassL : P.grass) : P.grassD); } } };
  grass(false);
  // 04 lantern on its string (from the sky, then from the tree branch once layer 09 is on)
  const [lx, ly] = lanternPos(t, L, scene, cam);
  if (L[3]) { const ax = L[8] ? 64 + cam : lx, ay = L[8] ? 102 : -60;
    for (let y = Math.max(0, ay); y < ly; y++) set(fb, lerp(ax, lx, (y - ay) / (ly - ay)), y, P.string);
    const X = Math.round(lx) - 2, Y = Math.round(ly);
    rect(fb, X + 1, Y, 3, 1, P.frame); rect(fb, X, Y + 1, 5, 5, P.frame); rect(fb, X + 1, Y + 1, 3, 5, P.lamp); rect(fb, X + 2, Y + 2, 1, 3, P.lampHot); rect(fb, X + 1, Y + 6, 3, 1, P.frame);
    if (!L[10]) for (let y = -9; y <= 15; y++) for (let x = -11; x <= 11; x++) { const d = Math.hypot(x, y - 3); if (d > 4 && d < 11 && dith(x + 40, y + 40) < 0.35 * (1 - d / 11)) mix(fb, lx + x, ly + y, P.lamp, 0.5); }
  }
  // the character
  const cs = charState(t, L, scene), box = drawChar(fb, cx, GY, cs);
  grass(true);
  // 11 lamplight: warm vs cool grade, glow rings, window glow, rim light on the character
  if (L[10]) {
    const gx = lx, gy = ly + 3, d = fb.d;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, k = clamp(1 - Math.hypot(x - gx, (y - gy) * 1.15) / 62) * (fb.m[y * W + x] ? 0.55 : 1), kq = Math.floor(k * 4 + dith(x, y) * 0.999) / 4;
      if (kq > 0) { const a = kq * kq * 0.75; d[i] = d[i] * (1 + 0.9 * a) + 70 * a; d[i + 1] = d[i + 1] * (1 + 0.6 * a) + 42 * a; d[i + 2] = d[i + 2] * (1 + 0.1 * a) + 4 * a; }
      else { d[i] = d[i] * 0.82; d[i + 1] = d[i + 1] * 0.9; d[i + 2] = Math.min(255, d[i + 2] * 1.08 + 8); } }
    const hx = Math.round(110 + cam); for (let y = -4; y <= 4; y++) for (let x = -5; x <= 5; x++) if (dith(x + 50, y + 50) < 0.5 * (1 - Math.hypot(x, y) / 5)) mix(fb, hx + 2 + x, GY - 6 + y, P.win, 0.5);
    rect(fb, hx + 1, GY - 7, 3, 3, P.win);
    const m = fb.m, isC = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) {
      const sxn = Math.sign(gx - x) || -1;
      if (!isC(x, y - 1) || !isC(x + sxn, y)) mix(fb, x, y, P.lampHot, 0.45);
      else if (!isC(x - sxn, y) || !isC(x, y + 1)) mix(fb, x, y, P.cool, 0.35);
    }
  }
  // 15 fireflies
  if (L[14]) for (let i = 0; i < 8; i++) { const x = 10 + 115 * hr(i + 60) + 9 * Math.sin(t * 0.6 + i) + 4 * Math.sin(t * 1.7 + 2 * i) + cam * 1.2, y = GY - 8 - 34 * hr(i + 70) + 5 * Math.sin(t * 0.9 + i * 3);
    const b = clamp(0.5 + 0.6 * Math.sin(t * 2.6 + i * 1.9)); mix(fb, x, y, P.fly, b); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, c]) => mix(fb, x + a, y + c, P.fly, b * 0.35)); }
  // 16 sound on the step: a dust puff + little 'thump' marks on every landing
  if (L[15] && (scene || t >= HOP0)) { const dt = t - tl; if (dt >= 0 && dt < 0.4) { const a = 1 - dt / 0.4;
    for (let k = 0; k < 3; k++) { const dx = 5 + dt * 28 + k * 2, dy = 1 + dt * 8 * (k + 1) - dt * dt * 30; mix(fb, cx - dx - 2, GY - dy, P.dust, a); mix(fb, cx + dx + 2, GY - dy, P.dust, a); }
    if (dt < 0.25) for (const sg of [-1, 1]) for (let k = 0; k < 3; k++) mix(fb, cx + sg * (13 + Math.round(dt * 12)) + sg * (k === 1 ? 1 : 0), GY - 4 - k * 2, P.cream, a * 0.9); } }
  // overlays that teach the current step (film only)
  if (ov && !scene) {
    const st = stepAt(t);
    if (st && st.i === 0 && t > st.t0 + 0.35) { // yellow line-of-action arrow through the body
      let px = null, py = null; for (let v = -0.05; v <= 1.25; v += 0.02) { const [c] = box.geo(Math.min(1, v)); const x = c + (v > 1 ? (v - 1) * 18 * cs.lean : 0), y = box.base - 1 - v * box.hh; set(fb, x, y, P.yel); px = x; py = y; }
      set(fb, px - 1, py + 1, P.yel); set(fb, px + 1, py + 1, P.yel); set(fb, px - 2, py + 2, P.yel); set(fb, px + 2, py + 2, P.yel);
    }
    if (st && st.i === 1 && t > st.t0 + 0.3) { // dotted jump arcs
      for (let j = 0; j < 2; j++) for (let k = -10; k <= 10; k += 2) { const blink = (Math.floor(t * 6) + k / 2) % 2 === 0; if (!blink) continue;
        const r = 9 + j * 6, x = cx + k * (r / 10), y = GY - 18 - 6 - j * 4 - (r * 0.9) * (1 - Math.pow(k / 10, 2)); set(fb, x, y, P.yel); }
    }
    if (st && st.i === 3 && t > st.t0 + 0.95) { // focus brackets: 'your eye goes here'
      const pad = 3 + Math.round(Math.sin(t * 6)), L0 = box.left - pad + 2, R0 = box.right + pad - 2, T0 = box.top - pad, B0 = GY + 2;
      for (let k = 0; k < 4; k++) { set(fb, L0 + k, T0, P.yel); set(fb, L0, T0 + k, P.yel); set(fb, R0 - k, T0, P.yel); set(fb, R0, T0 + k, P.yel); set(fb, L0 + k, B0, P.yel); set(fb, L0, B0 - k, P.yel); set(fb, R0 - k, B0, P.yel); set(fb, R0, B0 - k, P.yel); }
    }
  }
  return { cam, cx, box };
}

// ---------- screen composition ----------
function zoomAt(t, scene) { if (scene) return 1; const a = STEPS[4].t0 - 0.1, b = STEPS[5].t0 + 0.2; if (t < a) return 2; if (t > b) return 1; return 2 - ease((t - a) / (b - a)); }
const WORLD = FB(), OUT = FB();
function render(t, opt = {}) {
  const scene = !!opt.scene, L = maskAt(t, scene, opt.user);
  if (t >= T_ALIVE && !scene) for (let i = 0; i < 16; i++) L[i] = !opt.user || opt.user[i];
  drawWorld(WORLD, t, L, scene || t >= T_ALIVE, !opt.noOverlay);
  const z = zoomAt(t, scene), k = z - 1, Fx = lerp(W / 2, CX - 1, k), Fy = lerp(120, GY - 16, k);
  const sd = WORLD.d, od = OUT.d;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = Math.floor(Fx + (x + 0.5 - W / 2) / z), wy = Math.floor(Fy + (y + 0.5 - 120) / z), o = (y * W + x) * 4;
    OUT.m[y * W + x] = 0;
    if (wx < 0 || wy < 0 || wx >= W || wy >= H) { od[o] = P.ink[0]; od[o + 1] = P.ink[1]; od[o + 2] = P.ink[2]; od[o + 3] = 255; continue; }
    const i = (wy * W + wx) * 4; od[o] = sd[i]; od[o + 1] = sd[i + 1]; od[o + 2] = sd[i + 2]; od[o + 3] = 255; OUT.m[y * W + x] = WORLD.m[wy * W + wx];
  }
  WORLD.m.fill(0);
  if (!opt.noHud && !scene) hud(OUT, t);
  return OUT;
}
function hud(fb, t) {
  if (t < INTRO) {
    textC(fb, 'JUST A BLOCK.', 40, 1, P.cream, Math.floor((t - 0.2) / 0.06));
    if (t > 1.6) textC(fb, 'FOR *NOW*.', 172, 1, P.cream, Math.floor((t - 1.6) / 0.06));
    return;
  }
  const st = stepAt(t);
  if (st) {
    const lab = String(st.i + 1).padStart(2, '0') + ' ' + st.name, n = Math.floor((t - st.t0) / TYPE);
    icon(fb, st.icon, Math.round(W / 2 - 9), 5, 2);
    const w = textW(lab), x0 = Math.round((W - w) / 2);
    text(fb, '*' + lab.slice(0, 2) + '*' + lab.slice(2), x0, 26, 1, P.cream, n);
    for (let i = 0; i < 16; i++) rect(fb, Math.round(W / 2 - 31) + i * 4, 38, 2, 2, i <= st.i ? P.yel : P.line);
    const prev = st.i > 0 ? STEPS[st.i - 1].cap : '', capDelay = st.dur > 2 ? 0.8 : 0.12;
    if (st.cap === prev || t > st.t0 + capDelay) textC(fb, st.cap, 172, 1, P.cream);
    return;
  }
  if (t < T_TITLE) {
    const a = t - T_ALIVE;
    textC(fb, "NOW IT'S", 26, 2, P.cream, Math.floor(a / 0.05));
    if (a > 0.5) textC(fb, '*ALIVE!*', 46, 2, P.cream, Math.floor((a - 0.5) / 0.07));
    return;
  }
  // our own title card (no stats, no comment bait)
  const a = t - T_TITLE, d = fb.d, m = fb.m, dim = clamp(a / 0.5) * 0.6;
  for (let i = 0; i < W * H; i++) if (!m[i]) { d[i * 4] *= 1 - dim; d[i * 4 + 1] *= 1 - dim; d[i * 4 + 2] *= 1 - dim; }
  if (a > 0.3) textC(fb, 'PIXEL', 26, 3, P.cream, Math.floor((a - 0.3) / 0.08));
  if (a > 0.8) textC(fb, '*ALIVE*', 52, 3, P.cream, Math.floor((a - 0.8) / 0.08));
  if (a > 1.4) { const shown = Math.floor((a - 1.4) / 0.06); STEPS.forEach((s, i) => { if (i < shown) icon(fb, s.icon, 12 + (i % 8) * 14, 84 + Math.floor(i / 8) * 13, 1); }); }
  if (a > 2.5) textC(fb, '16 LAYERS', 116, 1, P.yel);
  if (a > 2.9) textC(fb, 'ALL CODE', 126, 1, P.cream);
  if (a > 3.2) textC(fb, 'BOTCAMPUS', 222, 1, P.tick);
  const f = clamp((a - 4.5) / 0.5); if (f > 0) for (let i = 0; i < W * H; i++) { d[i * 4] *= 1 - f; d[i * 4 + 1] *= 1 - f; d[i * 4 + 2] *= 1 - f; }
}

// ---------- sound: everything synthesised with WebAudio ----------
const NOISE = new WeakMap();
function noiseBuf(ac) { let b = NOISE.get(ac); if (!b) { b = ac.createBuffer(1, ac.sampleRate * 1, ac.sampleRate); const d = b.getChannelData(0); let s = 7; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; } NOISE.set(ac, b); } return b; }
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function env(ac, dest, when, a, peak, dur) { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(peak, when + a); g.gain.exponentialRampToValueAtTime(0.0001, when + dur); g.connect(dest); return g; }
function osc(ac, type, f, when, dur, dest) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, when); o.connect(dest); o.start(when); o.stop(when + dur + 0.05); return o; }
function noise(ac, when, dur, dest, filt, f, q) { const s = ac.createBufferSource(); s.buffer = noiseBuf(ac); const fl = ac.createBiquadFilter(); fl.type = filt; fl.frequency.value = f; fl.Q.value = q || 0.7; s.connect(fl); fl.connect(dest); s.start(when, Math.random() * 0.5, dur + 0.05); return fl; }
const SFX = {
  tick(ac, d, w) { osc(ac, 'square', 1900, w, 0.02, env(ac, d, w, 0.002, 0.05, 0.025)); },
  thump(ac, d, w, v = 1) { const o = osc(ac, 'sine', 150, w, 0.22, env(ac, d, w, 0.004, 0.75 * v, 0.22)); o.frequency.exponentialRampToValueAtTime(42, w + 0.18); noise(ac, w, 0.07, env(ac, d, w, 0.003, 0.25 * v, 0.08), 'lowpass', 500); },
  rustle(ac, d, w, v = 1) { noise(ac, w, 0.32, env(ac, d, w, 0.03, 0.13 * v, 0.32), 'bandpass', 4200, 0.9); noise(ac, w + 0.08, 0.22, env(ac, d, w + 0.08, 0.02, 0.07 * v, 0.22), 'bandpass', 6500, 1.2); },
  ding(ac, d, w) { [72, 79].forEach((m, i) => osc(ac, 'sine', mtof(m), w + i * 0.05, 0.9, env(ac, d, w + i * 0.05, 0.005, 0.08, 0.9))); },
  pad(ac, d, w, m, v) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, w); g.gain.linearRampToValueAtTime(0.035 * v, w + 0.5); g.gain.linearRampToValueAtTime(0.0001, w + 2.95); lp.connect(g); g.connect(d); osc(ac, 'triangle', mtof(m), w, 3, lp); const o2 = osc(ac, 'sine', mtof(m), w, 3, lp); o2.detune.value = 7; },
  bass(ac, d, w, m, v) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.connect(env(ac, d, w, 0.01, 0.14 * v, 0.7)); osc(ac, 'triangle', mtof(m), w, 0.7, lp); },
  pluck(ac, d, w, m, v) { osc(ac, 'sine', mtof(m), w, 0.5, env(ac, d, w, 0.004, 0.05 * v, 0.45)); osc(ac, 'triangle', mtof(m + 12), w, 0.2, env(ac, d, w, 0.002, 0.01 * v, 0.15)); },
  kick(ac, d, w, v) { const o = osc(ac, 'sine', 110, w, 0.2, env(ac, d, w, 0.003, 0.32 * v, 0.2)); o.frequency.exponentialRampToValueAtTime(40, w + 0.15); },
  snare(ac, d, w, v) { noise(ac, w, 0.14, env(ac, d, w, 0.003, 0.07 * v, 0.14), 'bandpass', 1800, 0.8); },
  hat(ac, d, w, v) { noise(ac, w, 0.04, env(ac, d, w, 0.002, 0.03 * v, 0.04), 'highpass', 7500); },
};
const CHORDS = [[53, 57, 60, 64, 41], [52, 55, 59, 62, 40], [50, 53, 57, 60, 38], [48, 52, 55, 59, 36]];
const MEL = [72, 74, 76, 79, 81, 76, 74];
function audioEvents(a, b, opt = {}) {
  const ev = [], scene = !!opt.scene, L = (t) => maskAt(t, scene || t >= T_ALIVE, opt.user);
  if (!scene) {
    const typed = (str, t0, dt) => { let k = 0; for (const ch of str.replace(/[*~]/g, '')) { const tt = t0 + dt * k++; if (ch !== ' ' && tt >= a && tt < b) ev.push([tt, 'tick']); } };
    typed('JUST A BLOCK.', 0.2, 0.06); typed('FOR NOW.', 1.6, 0.06);
    for (const s of STEPS) typed(String(s.i + 1).padStart(2, '0') + ' ' + s.name, s.t0, TYPE);
    typed("NOW IT'S", T_ALIVE, 0.05); typed('ALIVE!', T_ALIVE + 0.5, 0.07); typed('PIXEL', T_TITLE + 0.3, 0.08); typed('ALIVE', T_TITLE + 0.8, 0.08);
    const td = STEPS[3].t0 + 0.55; if (td >= a && td < b && L(td)[3]) ev.push([td, 'ding']);
  }
  for (let k = Math.max(0, Math.ceil((a - T_LAND1) / HP)); ; k++) { const tt = T_LAND1 + k * HP; if (tt >= b) break; if (tt >= a && L(tt)[15]) { ev.push([tt, 'thump', 1]); ev.push([tt + 0.01, 'rustle', 1]); } }
  const E = 0.375;
  for (let k = Math.max(0, Math.ceil(a / E)); k * E < b; k++) {
    const tt = k * E, bar = Math.floor(k / 8), pos = k % 8, ch = CHORDS[bar % 4];
    let v = clamp(0.35 + tt / 3, 0, 1); if (!scene && tt > TOTAL - 1.6) v *= clamp((TOTAL - tt) / 1.6);
    if (v <= 0.01) continue;
    if (pos === 0) { for (let i = 0; i < 4; i++) ev.push([tt, 'pad', ch[i], v]); ev.push([tt, 'bass', ch[4], v]); }
    if (pos === 5) ev.push([tt, 'bass', ch[4] + 7, v * 0.8]);
    const drums = scene || tt >= STEPS[4].t0;
    if (drums) { if (pos === 0 || pos === 4 || pos === 7) ev.push([tt, 'kick', pos === 7 ? v * 0.5 : v]); if (pos === 2 || pos === 6) ev.push([tt, 'snare', v]); ev.push([tt + (k % 2 ? 0.04 : 0), 'hat', v * (k % 2 ? 0.6 : 1)]); }
    if ((scene || tt >= STEPS[3].t0) && hr(k * 3.7) > 0.55) ev.push([tt, 'pluck', MEL[Math.floor(hr(k * 5.1) * MEL.length)], v]);
  }
  return ev;
}
function playEvent(ac, dest, when, e) { const f = SFX[e[1]]; if (f) f(ac, dest, when, e[2], e[3]); }
function masterChain(ac, dest) { const g = ac.createGain(); g.gain.value = 0.9; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500; const c = ac.createDynamicsCompressor(); g.connect(lp); lp.connect(c); c.connect(dest); return g; }
async function renderWav(user) {
  const sr = 44100, ac = new OfflineAudioContext(2, Math.ceil(sr * TOTAL), sr), m = masterChain(ac, ac.destination);
  for (const e of audioEvents(0, TOTAL, { user })) playEvent(ac, m, e[0], e);
  const buf = await ac.startRendering(), n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
  const out = new DataView(new ArrayBuffer(44 + n * 4)); const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); ws(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, clamp(L[i], -1, 1) * 32767, true); out.setInt16(46 + i * 4, clamp(R[i], -1, 1) * 32767, true); }
  return new Uint8Array(out.buffer);
}

G.PixelAlive = { W, H, TOTAL, STEPS, ICONS, INTRO, T_ALIVE, T_TITLE, render, renderWav, audioEvents, playEvent, masterChain, maskAt, stepAt,
  drawIcon(ctx, name, sc) { const fb = { d: new Uint8ClampedArray(81 * 4), m: new Uint8Array(81) }; const rows = ICONS[name]; for (let r = 0; r < 9; r++) for (let q = 0; q < 9; q++) { const c = IPAL[rows[r][q]]; if (c) { const i = (r * 9 + q) * 4; fb.d[i] = c[0]; fb.d[i + 1] = c[1]; fb.d[i + 2] = c[2]; fb.d[i + 3] = 255; } } ctx.putImageData(new ImageData(fb.d, 9, 9), 0, 0); } };
})(typeof window !== 'undefined' ? window : globalThis);
