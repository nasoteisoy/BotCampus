/**
 * Seraphina Forest — Round 2 (Lead: Art pack).
 * Dense forest, walk/shoot frames, slime anims, arrow trails, pixel score digits.
 */
import {
  TILE, FIXED_DT, MAX_FRAME, HERO_W, HERO_H, HERO_PIVOT_X, HERO_PIVOT_Y,
  HERO_SPEED, HERO_HIT_R, ARROW_SPEED, ARROW_RATE, ARROW_LIFE,
  SLIME_SPEED, SLIME_HIT_R, SLIME_DRAW, SLIME_NATIVE, ARROW_TRAIL_LEN,
  SLIME_IDLE_MS, SLIME_HOP_MS, SLIME_DEATH_MS, WALK_MS, SHOOT_MS,
  MAX_HP, HIT_INVULN, HITSTOP_POP, SHAKE_DECAY, SHAKE_MAX, pickZoom,
} from './constants.js';
import { loadSprites } from './sprites.js';
import { createMap } from './map.js';
import { createParticles } from './particles.js';
import { loadSave, recordBest, saveSettings } from './save.js';
import { drawNumber, numberWidth } from './font.js';

export async function boot({ canvas, input, audio, assetBase = './assets/' }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const sprites = await loadSprites(assetBase);
  const particles = createParticles();
  let save = loadSave();

  let VIEW_W = 320, VIEW_H = 180, ZOOM = 2;
  let mode = 'title';
  let map = createMap();
  let player = null;
  let arrows = [];
  let slimes = [];
  let score = 0;
  let wave = 0;
  let waveTimer = 0;
  let fireCd = 0;
  let hitStop = 0;
  let trauma = 0;
  let animT = 0;
  let facing = 'down';
  let faceAngle = Math.PI / 2;
  let walkFrame = 0;
  let walkAcc = 0;
  let shooting = false;
  let shootFrame = 0;
  let shootAcc = 0;
  let lastMove = { x: 0, y: 1 };
  let lastDrawInts = true;
  let lastHeroScreen = { x: 0, y: 0, w: 0, h: 0 };
  let lastBowOutside = false;
  let lastScoreDrawn = false;
  const cam = { x: 0, y: 0 };

  function setChromeVisible(vis) {
    const p = document.getElementById('btnPause');
    const f = document.getElementById('btnFs');
    if (p) p.style.display = vis ? '' : 'none';
    if (f) f.style.display = vis ? '' : 'none';
  }
  setChromeVisible(false);

  function resetRun() {
    map = createMap(56, 48, 77 + (score % 5));
    player = {
      x: map.spawn.x, // feet x
      y: map.spawn.y, // feet y
      vx: 0, vy: 0,
      hp: MAX_HP,
      invuln: 0,
    };
    arrows = [];
    slimes = [];
    score = 0;
    wave = 0;
    waveTimer = 0.5;
    fireCd = 0;
    hitStop = 0;
    trauma = 0;
    facing = 'down';
    faceAngle = Math.PI / 2;
    walkFrame = 0;
    walkAcc = 0;
    shooting = false;
    lastMove = { x: 0, y: 1 };
  }

  function spawnWave() {
    wave++;
    const n = Math.min(3 + Math.floor(wave * 1.1), 12);
    for (let i = 0; i < n; i++) {
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      if (edge === 0) { x = Math.random() * map.worldW; y = 24; }
      else if (edge === 1) { x = Math.random() * map.worldW; y = map.worldH - 24; }
      else if (edge === 2) { x = 24; y = Math.random() * map.worldH; }
      else { x = map.worldW - 24; y = Math.random() * map.worldH; }
      // Prefer near clearing rim
      if (Math.random() > 0.45 && player) {
        const ang = Math.random() * Math.PI * 2;
        x = player.x + Math.cos(ang) * (80 + Math.random() * 60);
        y = player.y + Math.sin(ang) * (80 + Math.random() * 60);
        x = Math.max(32, Math.min(map.worldW - 32, x));
        y = Math.max(32, Math.min(map.worldH - 32, y));
      }
      slimes.push(makeSlime(x, y));
    }
    waveTimer = Math.max(4.2, 7.5 - wave * 0.2);
  }

  function makeSlime(x, y) {
    return {
      x, y, vx: 0, vy: 0, hp: 1,
      state: 'idle', // idle | hop | death
      frame: 0, acc: 0,
      flash: 0, knock: 0, kvx: 0, kvy: 0,
      alive: true, dying: false,
    };
  }

  function aimDir() {
    const m = input.getMouseAim && input.getMouseAim();
    if (m && player) {
      const wx = (m.x / m.w) * VIEW_W + cam.x;
      const wy = (m.y / m.h) * VIEW_H + cam.y;
      return Math.atan2(wy - player.y + 10, wx - player.x);
    }
    const cx = player.x, cy = player.y - 14;
    let best = null, bestD = 1e9;
    const fx = Math.cos(faceAngle), fy = Math.sin(faceAngle);
    for (const s of slimes) {
      if (!s.alive || s.dying) continue;
      const dx = s.x - cx, dy = s.y - cy;
      if (dx * fx + dy * fy < -20) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = Math.atan2(dy, dx); }
    }
    return best != null ? best : faceAngle;
  }

  function tryFire() {
    if (fireCd > 0 || !player || shooting) return;
    fireCd = ARROW_RATE;
    const ang = aimDir();
    faceAngle = ang;
    // Snap facing for shoot art
    const ax = Math.cos(ang), ay = Math.sin(ang);
    if (Math.abs(ax) > Math.abs(ay)) facing = ax < 0 ? 'left' : 'right';
    else facing = ay < 0 ? 'up' : 'down';
    shooting = true;
    shootFrame = 0;
    shootAcc = 0;
    // Spawn from chest (center of torso on 32x48)
    const cx = player.x;
    const cy = player.y - 12;
    arrows.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * ARROW_SPEED,
      vy: Math.sin(ang) * ARROW_SPEED,
      ang, life: ARROW_LIFE, alive: true,
      trail: [{ x: cx, y: cy }],
    });
    audio.sfx.twang();
  }

  function updateCam() {
    if (!player) return;
    const tx = player.x - VIEW_W / 2;
    const ty = player.y - VIEW_H / 2;
    cam.x = Math.max(0, Math.min(map.worldW - VIEW_W, tx));
    cam.y = Math.max(0, Math.min(map.worldH - VIEW_H, ty));
  }

  function update(dt) {
    animT += dt;
    if (mode === 'title' || mode === 'gameover') return;
    if (mode === 'pause') return;
    if (hitStop > 0) { hitStop -= dt; return; }

    const axis = input.moveAxis();
    let mx = axis.x, my = axis.y;
    const moving = Math.hypot(mx, my) > 0.05 && !shooting;
    if (moving) {
      const len = Math.hypot(mx, my) || 1;
      mx /= len; my /= len;
      lastMove = { x: mx, y: my };
      faceAngle = Math.atan2(my, mx);
      const d = sprites.dirFromAxis(mx, my);
      if (d) facing = d;
      walkAcc += dt * 1000;
      if (walkAcc >= WALK_MS) { walkAcc -= WALK_MS; walkFrame = (walkFrame + 1) % 4; }
    } else if (!shooting) {
      walkFrame = 0;
      walkAcc = 0;
    }

    if (shooting) {
      shootAcc += dt * 1000;
      if (shootAcc >= SHOOT_MS) {
        shootAcc -= SHOOT_MS;
        shootFrame++;
        if (shootFrame >= 3) shooting = false;
      }
      player.vx = 0; player.vy = 0;
    } else {
      player.vx = mx * HERO_SPEED;
      player.vy = my * HERO_SPEED;
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    const body = { x: player.x - 6, y: player.y - 10, w: 12, h: 10 };
    map.resolve(body);
    player.x = body.x + 6;
    player.y = body.y + 10;

    if (player.invuln > 0) player.invuln -= dt;
    if (fireCd > 0) fireCd -= dt;
    if (input.held('fire')) tryFire();

    waveTimer -= dt;
    if (waveTimer <= 0) spawnWave();

    // Slimes
    for (const s of slimes) {
      if (!s.alive && !s.dying) continue;
      if (s.dying) {
        s.acc += dt * 1000;
        if (s.acc >= SLIME_DEATH_MS) {
          s.acc = 0;
          s.frame++;
          if (s.frame >= 3) { s.alive = false; s.dying = false; }
        }
        continue;
      }
      s.acc += dt * 1000;
      // hop toward player periodically
      if (s.state === 'idle') {
        if (s.acc >= SLIME_IDLE_MS) {
          s.acc = 0; s.frame = (s.frame + 1) % 2;
          // chance to hop
          if (Math.random() < 0.35) { s.state = 'hop'; s.frame = 0; s.acc = 0; }
        }
      } else if (s.state === 'hop') {
        if (s.acc >= SLIME_HOP_MS) {
          s.acc = 0; s.frame++;
          if (s.frame >= 3) { s.state = 'idle'; s.frame = 0; }
        }
      }
      if (s.flash > 0) s.flash -= dt;
      if (s.knock > 0) {
        s.knock -= dt;
        s.x += s.kvx * dt;
        s.y += s.kvy * dt;
      } else {
        const dx = player.x - s.x, dy = player.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        const spd = SLIME_SPEED * (0.85 + Math.min(wave, 10) * 0.04);
        s.vx = (dx / d) * spd;
        s.vy = (dy / d) * spd;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      // contact
      if (player.invuln <= 0 && s.alive && !s.dying) {
        const ddx = s.x - player.x, ddy = s.y - (player.y - 8);
        if (ddx * ddx + ddy * ddy < (HERO_HIT_R + SLIME_HIT_R) ** 2) {
          player.hp -= 1;
          player.invuln = HIT_INVULN;
          trauma = Math.min(1, trauma + 0.55);
          particles.spawn('hurt', player.x, player.y - 16, 8);
          audio.sfx.hurt();
          if (player.hp <= 0) {
            mode = 'gameover';
            setChromeVisible(false);
            recordBest(score);
            save = loadSave();
            audio.sfx.gameover();
            audio.stopMusic();
          }
        }
      }
    }

    // Arrows
    for (const a of arrows) {
      if (!a.alive) continue;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;
      a.trail.push({ x: a.x, y: a.y });
      if (a.trail.length > ARROW_TRAIL_LEN) a.trail.shift();
      if (a.life <= 0 || a.x < -40 || a.y < -40 || a.x > map.worldW + 40 || a.y > map.worldH + 40) {
        a.alive = false;
        continue;
      }
      for (const s of slimes) {
        if (!s.alive || s.dying) continue;
        const dx = a.x - s.x, dy = a.y - s.y;
        if (dx * dx + dy * dy < (SLIME_HIT_R + 6) ** 2) {
          a.alive = false;
          s.flash = 0.12;
          s.knock = 0.12;
          s.kvx = Math.cos(a.ang) * 120;
          s.kvy = Math.sin(a.ang) * 120;
          s.hp -= 1;
          audio.sfx.hit();
          if (s.hp <= 0) {
            s.dying = true;
            s.state = 'death';
            s.frame = 0;
            s.acc = 0;
            score += 1;
            hitStop = HITSTOP_POP;
            trauma = Math.min(1, trauma + 0.35);
            particles.spawn('pop', s.x, s.y - 4, 16);
            audio.sfx.pop();
          }
          break;
        }
      }
    }
    arrows = arrows.filter((a) => a.alive);
    slimes = slimes.filter((s) => s.alive || s.dying);

    particles.update(dt);
    trauma = Math.max(0, trauma - SHAKE_DECAY * dt);
    updateCam();
  }

  function shakeOffset() {
    if (save.settings.reduceShake || trauma <= 0) return { x: 0, y: 0 };
    const s = trauma * trauma;
    const t = animT * 30;
    return {
      x: Math.floor(SHAKE_MAX * s * Math.sin(t * 1.7)),
      y: Math.floor(SHAKE_MAX * 0.7 * s * Math.sin(t * 2.3)),
    };
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
    ctx.fillStyle = '#3a6a3a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const sh = shakeOffset();
    const camX = Math.floor(cam.x) + sh.x;
    const camY = Math.floor(cam.y) + sh.y;
    lastDrawInts = Number.isInteger(camX) && Number.isInteger(camY);

    if (mode === 'title') { drawTitle(); return; }

    // Ground tiles
    const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const y0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const x1 = Math.min(map.cols, Math.ceil((camX + VIEW_W) / TILE) + 1);
    const y1 = Math.min(map.rows, Math.ceil((camY + VIEW_H) / TILE) + 1);
    for (let r = y0; r < y1; r++) {
      for (let c = x0; c < x1; c++) {
        const name = map.ground[r * map.cols + c];
        const dx = Math.floor(c * TILE - camX);
        const dy = Math.floor(r * TILE - camY);
        map.drawTile(ctx, sprites.tiles, name, dx, dy);
      }
    }

    // Bushes / rocks (under trees partially)
    for (const o of map.objects) {
      const dx = Math.floor(o.x - camX);
      const dy = Math.floor(o.y - camY);
      if (dx < -20 || dy < -20 || dx > VIEW_W + 20 || dy > VIEW_H + 20) continue;
      const img = sprites.tiles[o.kind];
      if (img) ctx.drawImage(img, dx, dy);
    }

    // Y-sort entities: trees, slimes, arrows, hero
    const drawList = [];
    for (const t of map.trees) {
      drawList.push({ y: t.y + 48, kind: 'tree', t });
    }
    for (const s of slimes) {
      if (s.alive || s.dying) drawList.push({ y: s.y, kind: 'slime', s });
    }
    if (player) drawList.push({ y: player.y, kind: 'hero' });
    drawList.sort((a, b) => a.y - b.y);

    for (const item of drawList) {
      if (item.kind === 'tree') {
        const t = item.t;
        const dx = Math.floor(t.x - camX);
        const dy = Math.floor(t.y - camY);
        if (dx < -40 || dy < -50 || dx > VIEW_W + 40 || dy > VIEW_H + 50) continue;
        ctx.drawImage(sprites.tiles.tree, dx, dy);
      } else if (item.kind === 'slime') {
        drawSlime(item.s, camX, camY);
      } else if (item.kind === 'hero') {
        drawHero(camX, camY);
      }
    }

    // Arrows + 3–4 fading trail frames (rim baked into sprite)
    for (const a of arrows) {
      const trail = a.trail || [];
      const n = trail.length;
      for (let i = 0; i < n - 1; i++) {
        const t = trail[i];
        // fade: oldest ~0.2 → newest ghost ~0.7
        ctx.globalAlpha = 0.35 + 0.5 * (i / Math.max(1, n - 2));
        sprites.arrowDraw(ctx, a.ang, t.x - camX, t.y - camY);
      }
      ctx.globalAlpha = 1;
      sprites.arrowDraw(ctx, a.ang, a.x - camX, a.y - camY);
    }

    particles.draw(ctx, camX, camY);
    drawHud();
    if (mode === 'pause') drawPause();
    if (mode === 'gameover') drawGameOver();
  }

  function drawSlime(s, camX, camY) {
    let img;
    if (s.dying || s.state === 'death') img = sprites.slime.death[Math.min(s.frame, 2)];
    else if (s.state === 'hop') img = sprites.slime.hop[Math.min(s.frame, 2)];
    else img = sprites.slime.idle[s.frame % 2];
    const size = SLIME_NATIVE; // same ZOOM as hero — no per-sprite multiplier
    const dx = Math.floor(s.x - size / 2 - camX);
    const dy = Math.floor(s.y - size - camY);
    if (s.flash > 0) ctx.globalAlpha = 0.45 + 0.55 * Math.sin(animT * 40);
    ctx.drawImage(img, dx, dy, size, size);
    ctx.globalAlpha = 1;
  }

  function drawHero(camX, camY) {
    if (!player) return;
    const moving = Math.hypot(player.vx, player.vy) > 5;
    const bob = (moving && !shooting) ? ((walkFrame % 2 === 0) ? 0 : -1) : 0;
    const fx = player.x - camX;
    const fy = player.y - camY;
    // Invuln: palette flash / alpha 0.5 — never fully hide
    const flashing = player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0;
    if (flashing) ctx.globalAlpha = 0.5;
    const info = sprites.heroDraw(ctx, {
      dir: facing,
      frameIdx: walkFrame,
      shooting,
      shootFrame,
      fx, fy, bob,
    });
    if (flashing) {
      // light rim flash over hero
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#cca774';
      ctx.fillRect(info.dx, info.dy, info.w, 2);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 1;
    }
    lastHeroScreen = {
      x: info.dx * ZOOM, y: info.dy * ZOOM,
      w: HERO_W * ZOOM, h: HERO_H * ZOOM,
    };
    lastBowOutside = false;
    if (!Number.isInteger(info.dx) || !Number.isInteger(info.dy)) lastDrawInts = false;
  }

  function drawHud() {
    // Hearts
    for (let i = 0; i < MAX_HP; i++) {
      const img = (player && i < player.hp) ? sprites.icons.heart : sprites.icons.heartEmpty;
      ctx.drawImage(img, 4 + i * 18, 4);
    }
    // Score: slime icon + big digits top center
    const scale = 2;
    const numW = numberWidth(score, scale);
    const totalW = 16 + 4 + numW;
    const sx = Math.floor(VIEW_W / 2 - totalW / 2);
    ctx.drawImage(sprites.scoreSlime, sx, 3, 16, 16);
    drawNumber(ctx, score, sx + 18, 5, '#f0e6c8', scale);
    lastScoreDrawn = true;
  }

  function drawTitle() {
    // Forest backdrop using map tiles around spawn
    const cx = Math.floor(map.spawn.x / TILE);
    const cy = Math.floor(map.spawn.y / TILE);
    const camTX = (cx * TILE) - VIEW_W / 2;
    const camTY = (cy * TILE) - VIEW_H / 2;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const dx = Math.floor(c * TILE - camTX);
        const dy = Math.floor(r * TILE - camTY);
        if (dx < -16 || dy < -16 || dx > VIEW_W + 16 || dy > VIEW_H + 16) continue;
        map.drawTile(ctx, sprites.tiles, map.ground[r * map.cols + c], dx, dy);
      }
    }
    for (const o of map.objects) {
      const dx = Math.floor(o.x - camTX);
      const dy = Math.floor(o.y - camTY);
      if (dx < -20 || dy < -20 || dx > VIEW_W || dy > VIEW_H) continue;
      const img = sprites.tiles[o.kind];
      if (img) ctx.drawImage(img, dx, dy);
    }
    for (const t of map.trees) {
      const dx = Math.floor(t.x - camTX);
      const dy = Math.floor(t.y - camTY);
      if (dx < -40 || dy < -50 || dx > VIEW_W || dy > VIEW_H) continue;
      ctx.drawImage(sprites.tiles.tree, dx, dy);
    }
    // Hero idle (approved) at center
    const hx = VIEW_W / 2;
    const hy = VIEW_H / 2 + 10;
    sprites.heroDraw(ctx, { dir: 'down', frameIdx: 0, shooting: false, shootFrame: 0, fx: hx, fy: hy, bob: Math.floor(Math.sin(animT * 2)) });
    // Slimes
    const si = Math.floor(animT * 5) % 2;
    ctx.drawImage(sprites.slime.idle[si], Math.floor(hx - 28), Math.floor(hy - 4), 16, 16);
    ctx.drawImage(sprites.slime.idle[(si + 1) % 2], Math.floor(hx + 14), Math.floor(hy + 2), 16, 16);
    // Play + sound
    ctx.drawImage(sprites.icons.play, Math.floor(VIEW_W / 2 - 16), Math.floor(VIEW_H * 0.72));
    const sImg = save.settings.sound ? sprites.icons.soundOn : sprites.icons.soundOff;
    ctx.drawImage(sImg, 6, 6);
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(20,30,18,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.drawImage(sprites.icons.pause, Math.floor(VIEW_W / 2 - 8), Math.floor(VIEW_H / 2 - 24));
    const sImg = save.settings.sound ? sprites.icons.soundOn : sprites.icons.soundOff;
    ctx.drawImage(sImg, Math.floor(VIEW_W / 2 - 8), Math.floor(VIEW_H / 2 + 4));
    ctx.drawImage(sprites.icons.play, Math.floor(VIEW_W / 2 - 16), Math.floor(VIEW_H / 2 + 28));
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(20,24,18,0.62)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.drawImage(sprites.icons.replay, Math.floor(VIEW_W / 2 - 16), Math.floor(VIEW_H / 2 - 28));
    // Score digits
    const sc = 2;
    const sw = numberWidth(score, sc);
    const sx = Math.floor(VIEW_W / 2 - (16 + 4 + sw) / 2);
    ctx.drawImage(sprites.scoreSlime, sx, Math.floor(VIEW_H / 2 + 12), 16, 16);
    drawNumber(ctx, score, sx + 18, Math.floor(VIEW_H / 2 + 14), '#f0e6c8', sc);
    // Best with star
    const best = save.best || 0;
    const bw = numberWidth(best, sc);
    const bx = Math.floor(VIEW_W / 2 - (16 + 4 + bw) / 2);
    ctx.drawImage(sprites.star, bx, Math.floor(VIEW_H / 2 + 34));
    drawNumber(ctx, best, bx + 18, Math.floor(VIEW_H / 2 + 36), '#e6be46', sc);
    lastScoreDrawn = true;
  }

  function viewFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW_W,
      y: ((clientY - rect.top) / rect.height) * VIEW_H,
    };
  }

  function handleUiTap(vx, vy) {
    if (mode === 'title') {
      if (vx < 28 && vy < 28) {
        save.settings.sound = !save.settings.sound;
        audio.setSound(save.settings.sound);
        saveSettings(save.settings);
        audio.sfx.blip();
        return true;
      }
      startGame();
      return true;
    }
    if (mode === 'gameover') {
      const ix = VIEW_W / 2 - 16, iy = VIEW_H / 2 - 28;
      if (vx >= ix - 8 && vx <= ix + 40 && vy >= iy - 8 && vy <= iy + 48) {
        startGame();
        return true;
      }
      return false;
    }
    if (mode === 'pause') {
      const sx = VIEW_W / 2 - 8, sy = VIEW_H / 2 + 4;
      if (vx >= sx && vx <= sx + 16 && vy >= sy && vy <= sy + 16) {
        save.settings.sound = !save.settings.sound;
        audio.setSound(save.settings.sound);
        saveSettings(save.settings);
        audio.sfx.blip();
        return true;
      }
      mode = 'play';
      setChromeVisible(true);
      return true;
    }
    return false;
  }

  function startGame() {
    resetRun();
    mode = 'play';
    setChromeVisible(true);
    audio.unlock();
    audio.sfx.start();
    if (save.settings.music) audio.startMusic();
    updateCam();
  }

  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    const v = viewFromClient(e.clientX, e.clientY);
    if (handleUiTap(v.x, v.y)) { e.preventDefault(); e.stopPropagation(); }
  });

  function onPauseEdge() {
    if (mode === 'play') { mode = 'pause'; }
    else if (mode === 'pause') { mode = 'play'; setChromeVisible(true); }
  }

  function resize() {
    const wrap = canvas.parentElement || document.getElementById('stage') || document.body;
    const ww = Math.max(1, wrap.clientWidth || window.innerWidth);
    const wh = Math.max(1, wrap.clientHeight || window.innerHeight);
    const shortSide = Math.min(ww, wh);
    ZOOM = pickZoom(shortSide);
    VIEW_W = Math.max(160, Math.floor(ww / ZOOM));
    VIEW_H = Math.max(100, Math.floor(wh / ZOOM));
    canvas.width = VIEW_W * ZOOM;
    canvas.height = VIEW_H * ZOOM;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
    updateCam();
  }
  window.addEventListener('resize', resize);
  resize();

  let acc = 0;
  let last = performance.now();
  let frameMs = 0;
  function frame(now) {
    const raw = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    frameMs = raw * 1000;
    input.update(raw);
    if (input.pressed('pause')) onPauseEdge();
    acc += raw;
    while (acc >= FIXED_DT) { update(FIXED_DT); acc -= FIXED_DT; }
    draw();
    input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const testHooks = {
    get mode() { return mode; },
    setMode(m) { mode = m; setChromeVisible(m === 'play'); },
    startGame,
    get score() { return score; },
    get best() { return loadSave().best; },
    get player() { return player; },
    get slimes() { return slimes; },
    get arrows() { return arrows; },
    save: () => loadSave(),
    constants: { HITSTOP_POP, HIT_INVULN, ARROW_RATE, HERO_W, HERO_H, MAX_HP, SLIME_DRAW, ZOOM: () => ZOOM },
    viewInfo() { return { VIEW_W, VIEW_H, ZOOM, camX: cam.x, camY: cam.y }; },
    imageSmoothing() { return ctx.imageSmoothingEnabled; },
    integerDrawPositions() { return lastDrawInts; },
    heroScreenRect() { return { ...lastHeroScreen }; },
    canvasCover() {
      const r = canvas.getBoundingClientRect();
      return { coverW: r.width / window.innerWidth, coverH: r.height / window.innerHeight, cw: r.width, ch: r.height };
    },
    sampleHeroPixels(flipped) {
      const off = document.createElement('canvas');
      off.width = 25; off.height = 48;
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = false;
      if (flipped) {
        octx.translate(25, 0); octx.scale(-1, 1);
        octx.drawImage(sprites.approved, 0, 0);
      } else {
        octx.drawImage(sprites.approved, 0, 0);
      }
      return { w: 25, h: 48, data: Array.from(octx.getImageData(0, 0, 25, 48).data) };
    },
    async approvedHeroPixels() {
      const off = document.createElement('canvas');
      off.width = 25; off.height = 48;
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = false;
      octx.drawImage(sprites.approved, 0, 0);
      return Array.from(octx.getImageData(0, 0, 25, 48).data);
    },
    bowOutsideFlag() { return lastBowOutside; },
    bowFallbackFrames() { return sprites.fallbackList; },
    artPackLoaded() {
      return !!(sprites.artPackLoaded && sprites.tiles.grass_0 && sprites.slime.idle[0] && sprites.arrowH && sprites.walk.down[0]);
    },
    scoreDigitsDrawn() { return lastScoreDrawn; },
    chromeVisible() {
      const p = document.getElementById('btnPause');
      return !!(p && p.style.display !== 'none');
    },
    spawnSlimeAt(x, y) { slimes.push(makeSlime(x, y)); },
    fireAt(ang) {
      if (!player) return;
      arrows.push({
        x: player.x, y: player.y - 22,
        vx: Math.cos(ang) * ARROW_SPEED, vy: Math.sin(ang) * ARROW_SPEED,
        ang, life: ARROW_LIFE, alive: true, trail: [],
      });
    },
    killPlayer() {
      if (!player) return;
      player.hp = 0; mode = 'gameover'; setChromeVisible(false);
      recordBest(score); save = loadSave();
    },
    setScore(n) { score = n; },
    touchRects: () => input.touchRects(),
    frameMs: () => frameMs,
    particles,
    sprites,
    slimeScreenSize() { return SLIME_NATIVE * SLIME_DRAW * ZOOM; },
    /** All sprites share ZOOM; SLIME_DRAW must be 1. */
    uniformSpriteScale() {
      return {
        zoom: ZOOM,
        slimeDraw: SLIME_DRAW,
        slimeNative: SLIME_NATIVE,
        heroH: HERO_H,
        slimeScreen: SLIME_NATIVE * SLIME_DRAW * ZOOM,
        heroScreen: HERO_H * ZOOM,
        ok: SLIME_DRAW === 1,
      };
    },
  };
  window.__SERA__ = testHooks;
  return testHooks;
}
