/**
 * Art-pack loader. Seraphina frames from Lead: Art; idle = approved F on 32×48.
 * Bow-fallback frames use approved + flip + bob (see BOW_FALLBACK_FRAMES).
 */
import {
  HERO_W, HERO_H, HERO_PIVOT_X, HERO_PIVOT_Y, SLIME_DRAW, SLIME_NATIVE, ARROW_RIM,
  BOW_FALLBACK_FRAMES, WALK_MS, SHOOT_MS, SLIME_IDLE_MS, SLIME_HOP_MS, SLIME_DEATH_MS,
} from './constants.js';

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('fail ' + src));
    im.src = src;
  });
}

/** Place approved 25×48 onto 32×48 bottom-center (matches walk_down_0). */
function placeApprovedOnCanvas(approvedImg) {
  const c = document.createElement('canvas');
  c.width = HERO_W; c.height = HERO_H;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const ox = Math.floor((HERO_W - approvedImg.width) / 2); // 3
  const oy = HERO_H - approvedImg.height; // 0
  ctx.drawImage(approvedImg, ox, oy);
  return c;
}

export async function loadSprites(base = './assets/') {
  const approved = await loadImg(base + 'seraphina.png');
  const idleCanvas = placeApprovedOnCanvas(approved);

  const fallbackSet = new Set(BOW_FALLBACK_FRAMES);

  async function loadHeroFrame(name) {
    try {
      return await loadImg(base + 'seraphina/' + name);
    } catch {
      return idleCanvas;
    }
  }

  // Walk cycles
  const walk = {
    down: [], up: [], left: [], right: [],
  };
  for (let i = 0; i < 4; i++) {
    walk.down.push({ name: `walk_down_${i}.png`, img: await loadHeroFrame(`walk_down_${i}.png`), fallback: fallbackSet.has(`walk_down_${i}.png`) });
    walk.up.push({ name: `walk_up_${i}.png`, img: await loadHeroFrame(`walk_up_${i}.png`), fallback: fallbackSet.has(`walk_up_${i}.png`) });
    walk.left.push({ name: `walk_left_${i}.png`, img: await loadHeroFrame(`walk_left_${i}.png`), fallback: fallbackSet.has(`walk_left_${i}.png`) });
    walk.right.push({ name: `walk_right_${i}.png`, img: await loadHeroFrame(`walk_right_${i}.png`), fallback: fallbackSet.has(`walk_right_${i}.png`) });
  }

  const shoot = {
    down: [],
    right: [],
  };
  for (let i = 0; i < 3; i++) {
    shoot.down.push({ name: `shoot_down_${i}.png`, img: await loadHeroFrame(`shoot_down_${i}.png`), fallback: fallbackSet.has(`shoot_down_${i}.png`) });
    shoot.right.push({ name: `shoot_right_${i}.png`, img: await loadHeroFrame(`shoot_right_${i}.png`), fallback: fallbackSet.has(`shoot_right_${i}.png`) });
  }

  // Slimes
  const slime = {
    idle: [await loadImg(base + 'slime/idle_0.png'), await loadImg(base + 'slime/idle_1.png')],
    hop: [await loadImg(base + 'slime/hop_0.png'), await loadImg(base + 'slime/hop_1.png'), await loadImg(base + 'slime/hop_2.png')],
    death: [await loadImg(base + 'slime/death_0.png'), await loadImg(base + 'slime/death_1.png'), await loadImg(base + 'slime/death_2.png')],
  };

  const arrowHRaw = await loadImg(base + 'arrow/arrow_h.png');
  const arrowVRaw = await loadImg(base + 'arrow/arrow_v.png');

  /** Bake a 1px light rim (palette lightest) on the shaft for still readability. */
  function rimArrow(src, horizontal) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    // Find opaque shaft pixels; paint rim on north (h) or west (v) edge of shaft
    const rim = [0xcc, 0xa7, 0x74, 255]; // ARROW_RIM
    const copy = new Uint8ClampedArray(d);
    for (let y = 0; y < c.height; y++) {
      for (let x0 = 0; x0 < c.width; x0++) {
        const i = (y * c.width + x0) * 4;
        if (copy[i + 3] < 200) continue;
        // rim neighbor: above for horizontal, left for vertical
        const nx = horizontal ? x0 : x0 - 1;
        const ny = horizontal ? y - 1 : y;
        if (nx < 0 || ny < 0 || nx >= c.width || ny >= c.height) continue;
        const ni = (ny * c.width + nx) * 4;
        if (copy[ni + 3] < 40) {
          d[ni] = rim[0]; d[ni + 1] = rim[1]; d[ni + 2] = rim[2]; d[ni + 3] = 255;
        }
      }
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  const arrowH = rimArrow(arrowHRaw, true);
  const arrowV = rimArrow(arrowVRaw, false);

  const tileNames = [
    'grass_0', 'grass_1', 'grass_2',
    'dirt_center', 'dirt_edge_n', 'dirt_edge_e', 'dirt_edge_s', 'dirt_edge_w', 'dirt_corner',
    'bush', 'rock', 'tree',
  ];
  const tiles = {};
  await Promise.all(tileNames.map(async (n) => {
    tiles[n] = await loadImg(base + 'tiles_v2/' + n + '.png');
  }));

  // UI icons we still generate / keep
  const icons = {
    heart: await loadImg(base + 'icon_heart.png'),
    heartEmpty: await loadImg(base + 'icon_heart_empty.png'),
    pause: await loadImg(base + 'icon_pause.png'),
    soundOn: await loadImg(base + 'icon_sound_on.png'),
    soundOff: await loadImg(base + 'icon_sound_off.png'),
    replay: await loadImg(base + 'icon_replay.png'),
    play: await loadImg(base + 'icon_play.png'),
  };

  // Tiny slime icon for score (idle_0 at 1x)
  const scoreSlime = slime.idle[0];

  // Star icon for best (code-drawn into canvas)
  const star = document.createElement('canvas');
  star.width = 16; star.height = 16;
  {
    const sctx = star.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = '#e6be46';
    // simple 5-point pixel star
    const pts = [[8,1],[9,6],[14,6],[10,9],[12,14],[8,11],[4,14],[6,9],[2,6],[7,6]];
    sctx.beginPath();
    sctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) sctx.lineTo(x, y);
    sctx.closePath();
    sctx.fill();
    // fill rect fallback for crisp pixels
    sctx.clearRect(0, 0, 16, 16);
    sctx.fillStyle = "#e6be46";
    const on = [
      [7,1],[8,1],
      [6,2],[7,2],[8,2],[9,2],
      [2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],[13,3],
      [4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],
      [5,5],[6,5],[7,5],[8,5],[9,5],[10,5],
      [6,6],[7,6],[8,6],[9,6],
      [5,7],[6,7],[7,7],[8,7],[9,7],[10,7],
      [4,8],[5,8],[10,8],[11,8],
      [3,9],[4,9],[11,9],[12,9],
      [3,10],[4,10],[11,10],[12,10],
      [4,11],[5,11],[10,11],[11,11],
      [5,12],[6,12],[9,12],[10,12],
      [6,13],[9,13],
    ];
    for (const [x, y] of on) sctx.fillRect(x, y, 1, 1);
  }

  /**
   * Draw hero. feet at (fx, fy) world→screen already. Uses pivot bottom-center.
   * If frame.fallback, draw idleCanvas (optionally flipped) + bob.
   */
  function heroDraw(ctx, { dir, frameIdx, shooting, shootFrame, fx, fy, bob = 0, flipX = false }) {
    let img = idleCanvas;
    let doFlip = flipX;
    let useFallback = false;

    if (shooting) {
      if (dir === 'down') {
        const fr = shoot.down[shootFrame % shoot.down.length];
        if (fr.fallback) useFallback = true;
        else img = fr.img;
      } else if (dir === 'up') {
        // Art: use walk_up_0 for shoot up
        const fr = walk.up[0];
        if (fr.fallback) useFallback = true;
        else img = fr.img;
      } else if (dir === 'left') {
        const fr = shoot.right[shootFrame % shoot.right.length];
        if (fr.fallback) useFallback = true;
        else { img = fr.img; doFlip = true; }
      } else {
        const fr = shoot.right[shootFrame % shoot.right.length];
        if (fr.fallback) useFallback = true;
        else img = fr.img;
      }
    } else {
      const cycle = walk[dir] || walk.down;
      const fr = cycle[frameIdx % cycle.length];
      if (fr.fallback) useFallback = true;
      else img = fr.img;
      if (dir === 'left' && !fr.fallback) {
        // left frames are authored; no extra flip unless we fell back
      }
    }

    if (useFallback) {
      img = idleCanvas;
      doFlip = (dir === 'left');
    }

    const dx = Math.floor(fx - HERO_PIVOT_X);
    const dy = Math.floor(fy - HERO_PIVOT_Y + bob);
    ctx.save();
    if (doFlip) {
      ctx.translate(dx + HERO_W, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.drawImage(img, dx, dy);
    }
    ctx.restore();
    return { dx, dy, w: HERO_W, h: HERO_H, fallback: useFallback };
  }

  /** Arrow: cardinal/nearest. h/v with flips. No rotate smoothing. */
  function arrowDraw(ctx, ang, x, y) {
    // Snap to nearest cardinal (or use diagonal as nearest cardinal per brief)
    let a = ang;
    while (a < 0) a += Math.PI * 2;
    while (a >= Math.PI * 2) a -= Math.PI * 2;
    // 0=E, 1=S, 2=W, 3=N  (nearest of 4)
    const oct = Math.round(a / (Math.PI / 2)) % 4;
    const dx = Math.floor(x);
    const dy = Math.floor(y);
    ctx.save();
    if (oct === 0) {
      // East — arrow_h as-is, pivot ~ (6,1)
      ctx.drawImage(arrowH, dx - 6, dy - 1);
    } else if (oct === 2) {
      // West — flip H
      ctx.translate(dx + 6, dy - 1);
      ctx.scale(-1, 1);
      ctx.drawImage(arrowH, 0, 0);
    } else if (oct === 1) {
      // South — arrow_v as-is, pivot (1,6)
      ctx.drawImage(arrowV, dx - 1, dy - 6);
    } else {
      // North — flip V
      ctx.translate(dx - 1, dy + 6);
      ctx.scale(1, -1);
      ctx.drawImage(arrowV, 0, 0);
    }
    ctx.restore();
  }

  function dirFromAxis(x, y) {
    if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01) return null;
    if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
    return y < 0 ? 'up' : 'down';
  }

  return {
    approved,
    idleCanvas,
    walk, shoot, slime,
    arrowH, arrowV,
    tiles, icons, scoreSlime, star,
    heroDraw, arrowDraw, dirFromAxis,
    fallbackSet,
    fallbackList: [...fallbackSet],
    artPackLoaded: true,
    timings: { WALK_MS, SHOOT_MS, SLIME_IDLE_MS, SLIME_HOP_MS, SLIME_DEATH_MS },
    HERO_W, HERO_H, HERO_PIVOT_X, HERO_PIVOT_Y, SLIME_DRAW, SLIME_NATIVE,
  };
}
