/**
 * Sprite atlas loader for Sprig Peak.
 * Sheets from tools/make-sprites.py use 1px padding, no rotation.
 * Draw positions use Math.floor (float sim → integer pixels).
 */
const PLAYER_POSES = [
  'idle0', 'idle1', 'idle2', 'idle3',
  'run0', 'run1', 'run2', 'run3', 'run4', 'run5', 'run6', 'run7',
  'jump', 'apex', 'fall0', 'fall1', 'land', 'hurt',
];
const ENEMY_FRAMES = ['move0', 'move1', 'move2', 'move3', 'move4', 'move5', 'idle0', 'hit', 'death'];
const SHEET_PAD = 1;

const CACHE_BUST = 'r4fix5';
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src + (src.includes('?') ? '&' : '?') + 'v=' + CACHE_BUST;
  });
}

function makeSheet(img, frameW, frameH, names, pad = SHEET_PAD) {
  const map = {};
  const cols = Math.max(1, Math.floor((img.width - pad) / (frameW + pad)));
  names.forEach((name, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    map[name] = {
      x: pad + c * (frameW + pad),
      y: pad + r * (frameH + pad),
      w: frameW,
      h: frameH,
    };
  });
  if (map.idle0 && !map.idle) map.idle = map.idle0;
  return {
    img,
    frameW,
    frameH,
    map,
    draw(ctx, name, x, y, opts = {}) {
      let f = map[name];
      if (!f && typeof name === 'string') {
        if (name === 'idle') f = map.idle0 || map.idle1;
        else if (/^run\d+$/.test(name) && !map[name]) {
          f = map['run' + (parseInt(name.slice(3), 10) % 8)];
        } else if (name === 'fall') {
          f = map.fall0 || map.fall1;
        }
      }
      if (!f) f = map[names[0]];
      if (!f) return;
      const s = opts.scale || 1;
      const dx = Math.floor(x);
      const dy = Math.floor(y);
      const dw = Math.floor(f.w * s);
      const dh = Math.floor(f.h * s);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (opts.flip) {
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, dw, dh);
      } else {
        ctx.drawImage(img, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
      }
      ctx.restore();
    },
  };
}

function makeTilesSheet(img, nameToIndex, pad = SHEET_PAD) {
  const aliases = {
    ground: 'ground_center',
    platform: 'platform_center',
    flower: 'flower_a',
    grass: 'grass',
    bush: 'bush',
    rock: 'rock',
    sign: 'sign',
    fence: 'fence',
    mushroom: 'mushroom',
    roots: 'roots',
  };
  const cols = Math.max(1, Math.floor((img.width - pad) / (16 + pad)));
  return {
    img,
    map: nameToIndex,
    draw(ctx, name, x, y, s = 1) {
      let key = name;
      if (nameToIndex[key] == null) key = aliases[name] || name;
      let i = nameToIndex[key];
      if (i == null) i = nameToIndex.grass ?? nameToIndex.ground_center ?? 0;
      const c = i % cols;
      const r = Math.floor(i / cols);
      const sx = pad + c * (16 + pad);
      const sy = pad + r * (16 + pad);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img, sx, sy, 16, 16,
        Math.floor(x), Math.floor(y),
        Math.floor(16 * s), Math.floor(16 * s),
      );
    },
    drawAutotile(ctx, kind, tx, ty, leftSolid, rightSolid) {
      let variant = 'center';
      if (!leftSolid && !rightSolid) variant = 'single';
      else if (!leftSolid) variant = 'left';
      else if (!rightSolid) variant = 'right';
      this.draw(ctx, `${kind}_${variant}`, tx * 16, ty * 16);
    },
  };
}

export async function loadSheets(base = './assets/') {
  const [
    player, walker, flyer, shooter, tiles, hazards, pickups, ui, logo, particles, critters, proj, goal,
  ] = await Promise.all([
    loadImage(base + 'player.png'),
    loadImage(base + 'enemy-walker.png'),
    loadImage(base + 'enemy-flyer.png'),
    loadImage(base + 'enemy-shooter.png'),
    loadImage(base + 'tiles-forest.png'),
    loadImage(base + 'hazards.png'),
    loadImage(base + 'pickups.png'),
    loadImage(base + 'ui-icons.png'),
    loadImage(base + 'logo.png'),
    loadImage(base + 'particles.png'),
    loadImage(base + 'critters.png'),
    loadImage(base + 'projectile.png'),
    loadImage(base + 'goal.png'),
  ]);

  let tileMap = {};
  try { tileMap = await (await fetch(base + 'tiles-forest.json')).json(); } catch (_) {}
  const tilesSheet = makeTilesSheet(tiles, tileMap);

  const hazNames = [
    'spike0', 'spike1', 'spring0', 'spring1', 'spring2', 'spring3',
    'moving0', 'moving1', 'moving2', 'moving3',
  ];
  while (hazNames.length < 20) hazNames.push('moving' + (hazNames.length % 4));

  const pickNames = [
    'coin0', 'coin1', 'coin2', 'coin3', 'coin4', 'coin5',
    'spark0', 'spark1', 'spark2', 'spark3',
    'checkpoint_off0', 'checkpoint_on0', 'checkpoint_on1', 'checkpoint_on2',
  ];

  let uiMap = {};
  try { uiMap = await (await fetch(base + 'ui-icons.json')).json(); } catch (_) {}
  const uiNames = Object.keys(uiMap).sort((a, b) => uiMap[a] - uiMap[b]);

  return {
    player: makeSheet(player, 28, 28, PLAYER_POSES),
    walker: makeSheet(walker, 24, 24, ENEMY_FRAMES),
    flyer: makeSheet(flyer, 24, 24, ['move0', 'move1', 'move2', 'move3', 'idle0', 'idle1', 'hit', 'death']),
    shooter: makeSheet(shooter, 24, 24, [
      'idle0', 'idle1', 'windup', 'fire', 'idle2', 'windup2', 'fire2', 'death',
    ]),
    tiles: tilesSheet,
    hazards: makeSheet(hazards, 16, 16, hazNames),
    pickups: makeSheet(pickups, 16, 16, pickNames),
    ui: makeSheet(ui, 16, 16, uiNames.length ? uiNames : ['pause']),
    logo,
    particles: makeSheet(particles, 8, 8, ['dust', 'spark', 'leaf', 'bubble']),
    critters: makeSheet(critters, 16, 16, ['frog0', 'frog1', 'butterfly0', 'butterfly1', 'villager0', 'villager1']),
    projectile: proj,
    goal: makeSheet(goal, 16, 28, ['goal0', 'goal1', 'goal2', 'goal3']),
    PLAYER_POSES,
  };
}
