import {
  TILE, FIXED_DT, MAX_FRAME, COYOTE_TIME, JUMP_BUFFER, JUMP_VY, JUMP_CUT,
  GRAVITY, HOLD_GRAVITY, MAX_FALL, RUN_ACCEL, RUN_DECEL, RUN_MAX, AIR_ACCEL,
  HIT_INVULN, SHAKE_DECAY, SHAKE_MAX, GAME_NAME,
} from './constants.js';
import { parseLevel, tileAt, isSolid } from '../art/tiles.js';
import { loadSheets } from '../art/sprites.js';
import { PALETTE } from '../art/palette.js';
import { createParticles } from './particles.js';
import { LEVEL1 } from './level1.js';
import { loadSave, recordBest, saveSettings } from './save.js';

export async function boot(opts) {
  const canvas = opts.canvas;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const input = opts.input;
  const audio = opts.audio;
  const sheets = await loadSheets(opts.assetBase || './assets/');
  const particles = createParticles();

  let save = loadSave();
  let mode = 'title'; // title | play | pause | win | dead
  let level = null;
  let player = null;
  let ents = [];
  let platforms = [];
  let projectiles = [];
  let cam = { x: 0, y: 0, trauma: 0 };
  let lastDraw = { camX: 0, camY: 0, heroX: 0, heroY: 0, sprites: [] };
  let time = 0;
  let coins = 0;
  let animT = 0;
  let hitstop = 0;
  let reduceShake = save.settings.reduceShake;
  let frameMs = 0;
  let lastPerf = performance.now();
  let attractT = 0;
  let landSquash = 0;
  let jumpStretch = 0;
  let checkpointOn = false;
  let spawnPoint = null;
  let goalReached = false;
  let winTime = 0;
  let testHooks = {};

  let VIEW_W = 320;
  let VIEW_H = 180;
  let ZOOM = 2;
  let HUD_SCALE = 2; // screen-space icon scale (px per source pixel roughly via draw scale)


  function resetLevel() {
    level = parseLevel(LEVEL1.rows);
    spawnPoint = { ...level.spawn };
    player = {
      x: spawnPoint.x, y: spawnPoint.y, w: 12, h: 16,
      vx: 0, vy: 0, facing: 1, grounded: false,
      coyote: 0, jumpBuf: 0, holdingJump: false,
      invuln: 0, alive: true, pose: 'idle', frame: 0,
      hp: 3, maxHp: 3,
    };
    ents = level.entities.map((e) => ({ ...e, alive: true, vx: e.type === 'walker' || e.type === 'shooter' ? -30 : 0, t: 0, hp: e.type === 'shooter' ? 2 : 1, flash: 0 }));
    platforms = ents.filter((e) => e.type === 'moving').map((e) => {
      e.w = TILE * 3; e.h = 6; return e;
    });
    projectiles = [];
    coins = 0;
    time = 0;
    checkpointOn = false;
    goalReached = false;
    cam.x = 0; cam.y = 0; cam.trauma = 0;
    particles.pool.forEach((p) => { p.alive = false; });
    // frame hero immediately (avoid empty sky / missing ground on first shots)
    player.grounded = true;
    snapCam();
  }

  function startGame() {
    audio.unlock();
    if (save.settings.music) audio.startMusic();
    if (testHooks) testHooks._freeze = false;
    resetLevel();
    mode = 'play';
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function addShake(amount) {
    if (reduceShake) return;
    cam.trauma = Math.min(1, cam.trauma + amount);
  }

  function killPlayer() {
    if (player.invuln > 0) return;
    player.hp -= 1;
    audio.sfx.hit();
    addShake(0.45);
    player.invuln = HIT_INVULN;
    player.vy = -180;
    player.vx = -player.facing * 80;
    player.pose = 'hurt';
    if (player.hp <= 0) {
      audio.sfx.death();
      mode = 'dead';
      setTimeout(() => {
        if (mode === 'dead') {
          resetLevel();
          player.x = spawnPoint.x; player.y = spawnPoint.y;
          mode = 'play';
        }
      }, 800);
    }
  }

  function stompEnemy(e) {
    e.hp -= 1;
    e.flash = 0.15;
    audio.sfx.stomp();
    particles.spawn('spark', e.x + 8, e.y + 8, 5);
    player.vy = JUMP_VY * 0.55;
    player.jumpBuf = 0;
    if (e.hp <= 0) {
      e.alive = false;
      e.deathT = 0.25;
      particles.spawn('dust', e.x + 8, e.y + 12, 8);
    }
  }

  // Cleaner physics step
  function physicsPlayer(dt) {
    const p = player;
    const axis = input.axis();
    p.holdingJump = input.held('jump');
    if (input.pressed('jump') || input.hasJumpBuffer()) p.jumpBuf = JUMP_BUFFER;
    p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    if (p.grounded) p.coyote = COYOTE_TIME;
    else p.coyote = Math.max(0, p.coyote - dt);

    const accel = p.grounded ? RUN_ACCEL : AIR_ACCEL;
    if (axis !== 0) {
      p.vx += axis * accel * dt;
      p.facing = axis > 0 ? 1 : -1;
      p.vx = Math.max(-RUN_MAX, Math.min(RUN_MAX, p.vx));
    } else {
      const dec = (p.grounded ? RUN_DECEL : RUN_DECEL * 0.45) * dt;
      if (Math.abs(p.vx) <= dec) p.vx = 0;
      else p.vx -= Math.sign(p.vx) * dec;
    }

    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = JUMP_VY;
      p.jumpBuf = 0; p.coyote = 0; p.grounded = false;
      jumpStretch = 0.16;
      audio.sfx.jump();
      particles.spawn('dust', p.x + p.w / 2, p.y + p.h, 5);
      input.consumeJumpBuffer();
    }
    if (input.released('jump') && p.vy < 0) p.vy *= JUMP_CUT;

    let g = GRAVITY;
    if (p.holdingJump && p.vy < 0 && p.vy > JUMP_VY * 0.4) g = HOLD_GRAVITY;
    p.vy = Math.min(MAX_FALL, p.vy + g * dt);

    // move X
    p.x += p.vx * dt;
    resolveX(p);
    // move Y
    const beforeY = p.y;
    p.grounded = false;
    p.y += p.vy * dt;
    resolveY(p);
    if (p.grounded && p.vy >= 0 && beforeY + p.h <= p.y + p.h) {
      /* landed */
    }
    if (p.grounded && !wasGroundedFlag && p.vy >= 0) {
      // handled via flag below
    }

    p.invuln = Math.max(0, p.invuln - dt);
    landSquash = Math.max(0, landSquash - dt);
    jumpStretch = Math.max(0, jumpStretch - dt);

    if (p.invuln > HIT_INVULN * 0.7) p.pose = 'hurt';
    else if (!p.grounded) {
      if (p.vy < -40) p.pose = 'jump';
      else if (p.vy > 60) p.pose = 'fall' + (Math.floor(animT * 10) % 2);
      else if (Math.abs(p.vy) < 40) p.pose = 'apex';
      else p.pose = p.vy < 0 ? 'jump' : ('fall' + (Math.floor(animT * 10) % 2));
    } else if (landSquash > 0) p.pose = 'land';
    else if (Math.abs(p.vx) > 20) {
      p.frame += Math.abs(p.vx) * dt * 0.14;
      p.pose = 'run' + (Math.floor(p.frame) % 8);
    } else {
      p.frame += dt * 4;
      p.pose = 'idle' + (Math.floor(p.frame) % 4);
    }
  }

  let wasGroundedFlag = false;

  function resolveX(p) {
    const corners = [
      [p.x, p.y + 2], [p.x + p.w, p.y + 2],
      [p.x, p.y + p.h - 2], [p.x + p.w, p.y + p.h - 2],
    ];
    for (const [cx, cy] of corners) {
      if (isSolid(tileAt(level, cx, cy))) {
        if (p.vx > 0) p.x = Math.floor(cx / TILE) * TILE - p.w - 0.01;
        else if (p.vx < 0) p.x = Math.floor(cx / TILE) * TILE + TILE + 0.01;
        p.vx = 0;
        break;
      }
    }
  }

  function resolveY(p) {
    // head
    if (p.vy < 0) {
      if (isSolid(tileAt(level, p.x + 2, p.y)) || isSolid(tileAt(level, p.x + p.w - 2, p.y))) {
        p.y = Math.floor(p.y / TILE) * TILE + TILE;
        p.vy = 0;
      }
    }
    // feet
    const footL = tileAt(level, p.x + 2, p.y + p.h);
    const footR = tileAt(level, p.x + p.w - 2, p.y + p.h);
    if (p.vy >= 0 && (isSolid(footL) || isSolid(footR))) {
      const ty = Math.floor((p.y + p.h) / TILE) * TILE;
      if (!wasGroundedFlag) {
        landSquash = 0.12;
        audio.sfx.land();
        particles.spawn('dust', p.x + p.w / 2, ty, 6);
      }
      p.y = ty - p.h;
      p.vy = 0;
      p.grounded = true;
    }
    // moving platforms
    for (const plat of platforms) {
      if (!plat.alive && plat.alive !== undefined) continue;
      const prevBottom = p.y + p.h - p.vy * FIXED_DT;
      if (p.vy >= -10 && prevBottom <= plat.y + 3 && p.x + p.w > plat.x && p.x < plat.x + plat.w && p.y + p.h >= plat.y && p.y + p.h <= plat.y + 10) {
        if (!wasGroundedFlag) {
          landSquash = 0.1;
          audio.sfx.land();
          particles.spawn('dust', p.x + p.w / 2, plat.y, 4);
        }
        p.y = plat.y - p.h;
        p.vy = 0;
        p.grounded = true;
        p.x += (plat._dx || 0);
      }
    }
  }

  function updateEntities(dt) {
    animT += dt;
    for (const e of ents) {
      if (!e.alive && e.type !== 'moving') continue;
      e.t = (e.t || 0) + dt;
      e.flash = Math.max(0, (e.flash || 0) - dt);
      if (e.type === 'walker') {
        e.x += e.vx * dt;
        // turn at edges / walls
        const dir = Math.sign(e.vx) || -1;
        const frontX = e.x + (dir > 0 ? 20 : 4);
        const groundAhead = isSolid(tileAt(level, frontX, e.y + 28));
        const wall = isSolid(tileAt(level, frontX, e.y + 12));
        if (!groundAhead || wall) e.vx *= -1;
        // collide player
        if (e.alive && player.invuln <= 0 && aabb(player, { x: e.x + 4, y: e.y + 8, w: 16, h: 14 })) {
          if (player.vy > 40 && player.y + player.h - 4 <= e.y + 16) stompEnemy(e);
          else killPlayer();
        }
      } else if (e.type === 'flyer') {
        e.x = e.ox + Math.sin(e.t * 1.2) * 28;
        e.y = e.oy + Math.sin(e.t * 2.4) * 12;
        if (e.alive && player.invuln <= 0 && aabb(player, { x: e.x + 4, y: e.y + 8, w: 16, h: 12 })) {
          if (player.vy > 40 && player.y + player.h - 4 <= e.y + 14) stompEnemy(e);
          else killPlayer();
        }
      } else if (e.type === 'shooter') {
        // face player
        const face = player.x > e.x ? 1 : -1;
        e.facing = face;
        // telegraph then shoot every 2s
        const cycle = e.t % 2.2;
        e.telegraph = cycle > 1.6 && cycle < 1.85;
        if (cycle > 1.85 && cycle < 1.85 + dt) {
          projectiles.push({
            x: e.x + (face > 0 ? 20 : 0), y: e.y + 12,
            vx: face * 70, vy: 0, life: 3, w: 6, h: 6,
          });
          audio.sfx.blip();
        }
        if (e.alive && player.invuln <= 0 && aabb(player, { x: e.x + 4, y: e.y + 8, w: 16, h: 16 })) {
          if (player.vy > 40 && player.y + player.h - 4 <= e.y + 14) stompEnemy(e);
          else killPlayer();
        }
      } else if (e.type === 'moving') {
        const prev = e.x;
        e.x = e.ox + Math.sin(e.t * 0.9 + (e.phase || 0)) * 40;
        e._dx = e.x - prev;
        e.w = TILE * 3; e.h = 6;
        e.alive = true;
      } else if (e.type === 'spike') {
        if (player.invuln <= 0 && aabb(player, { x: e.x + 2, y: e.y + 8, w: 12, h: 8 })) killPlayer();
      } else if (e.type === 'spring') {
        if (aabb(player, { x: e.x + 2, y: e.y + 6, w: 12, h: 10 }) && player.vy >= 0) {
          player.vy = -420;
          player.grounded = false;
          jumpStretch = 0.2;
          audio.sfx.spring();
          particles.spawn('spark', e.x + 8, e.y + 4, 4);
        }
      } else if (e.type === 'coin' && e.alive) {
        if (aabb(player, { x: e.x + 2, y: e.y + 2, w: 12, h: 12 })) {
          e.alive = false;
          coins++;
          audio.sfx.coin();
          particles.spawn('spark', e.x + 8, e.y + 8, 6);
        }
      } else if (e.type === 'checkpoint') {
        if (!checkpointOn && aabb(player, { x: e.x, y: e.y, w: 16, h: 24 })) {
          checkpointOn = true;
          spawnPoint = { x: e.x, y: e.y - 8 };
          audio.sfx.checkpoint();
          particles.spawn('spark', e.x + 8, e.y + 8, 10);
        }
      } else if (e.type === 'butterfly') {
        e.x = e.ox + Math.sin(e.t * 1.5) * 20;
        e.y = e.oy + Math.cos(e.t * 2) * 10;
      } else if (e.type === 'frog') {
        // idle hop in place visually via frame
      }
    }

    // projectiles
    for (const pr of projectiles) {
      pr.x += pr.vx * dt;
      pr.life -= dt;
      if (player.invuln <= 0 && aabb(player, pr)) {
        killPlayer();
        pr.life = 0;
      }
    }
    projectiles = projectiles.filter((pr) => pr.life > 0);

    // goal
    if (level.goal && aabb(player, { x: level.goal.x, y: level.goal.y - 16, w: 16, h: 32 })) {
      if (!goalReached) {
        goalReached = true;
        winTime = time;
        recordBest(0, time);
        save = loadSave();
        audio.sfx.gem();
        mode = 'win';
      }
    }

    // fall death
    if (player.y > level.h * TILE + 40) {
      player.hp = 0;
      killPlayer();
      player.x = spawnPoint.x; player.y = spawnPoint.y;
      player.vx = 0; player.vy = 0; player.hp = 3; player.invuln = 0.5;
      if (mode === 'dead') mode = 'play';
    }
  }

  function clampCam() {
    const maxX = Math.max(0, level.w * TILE - VIEW_W);
    const maxY = Math.max(0, level.h * TILE - VIEW_H);
    cam.x = Math.max(0, Math.min(cam.x, maxX));
    cam.y = Math.max(0, Math.min(cam.y, maxY));
  }

  function snapCam() {
    // Instant framing: hero ~25% into view, clear of left touch pad at phone sizes
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const touchL = Math.ceil(140 / Math.max(1, ZOOM));
    const prefer = Math.max(VIEW_W * 0.25, touchL + 20);
    cam.x = px - prefer;
    if (player.grounded || player.coyote > 0) {
      cam.y = player.y + player.h - VIEW_H * 0.78;
    } else {
      // Keep hero around mid-upper third but don't lose the floor if jump is modest
      cam.y = py - VIEW_H * 0.40;
      const floorY = 13 * TILE; // main ground row
      const maxCamForFloor = floorY + TILE - VIEW_H * 0.92;
      if (player.y + player.h > floorY - 80) cam.y = Math.max(cam.y, maxCamForFloor);
    }
    clampCam();
  }

  function updateCam(dt) {
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    // Look-ahead on X (facing + speed)
    const look = player.facing * (28 + Math.min(24, Math.abs(player.vx) * 0.12));
    // Horizontal deadzone — keep clear of phone touch pads (CSS ~136 left / ~158 right)
    const touchL = Math.ceil(140 / Math.max(1, ZOOM));
    const touchR = Math.ceil(160 / Math.max(1, ZOOM));
    let targetX = cam.x;
    const sx = px - cam.x;
    const dzL = Math.max(VIEW_W * 0.30, touchL + 12);
    const dzR = Math.min(VIEW_W * 0.70, VIEW_W - touchR - 12);
    if (sx < dzL) targetX = px - dzL;
    else if (sx > dzR) targetX = px - dzR;
    // Blend toward look-ahead center, then re-assert touch-safe margins
    const lookTarget = px + look - VIEW_W / 2;
    targetX = targetX * 0.55 + lookTarget * 0.45;
    if (px - targetX < dzL) targetX = px - dzL;
    if (px - targetX > dzR) targetX = px - dzR;

    // Vertical deadzone — stay below top HUD / pause-fs row (~56px CSS)
    let targetY = cam.y;
    const sy = py - cam.y;
    const hudClear = Math.ceil(56 / Math.max(1, ZOOM));
    const dzT = Math.max(VIEW_H * 0.28, hudClear + player.h);
    const dzB = VIEW_H * 0.72;
    if (sy < dzT) targetY = py - dzT;
    else if (sy > dzB) targetY = py - dzB;

    // Near ground: keep floor visible (feet ~78% down the view)
    if (player.grounded || player.coyote > 0) {
      const floorTarget = player.y + player.h - VIEW_H * 0.78;
      targetY = floorTarget;
    }

    const k = Math.min(1, 10 * dt);
    cam.x += (targetX - cam.x) * k;
    cam.y += (targetY - cam.y) * Math.min(1, 8 * dt);
    clampCam();
    cam.trauma = Math.max(0, cam.trauma - SHAKE_DECAY * dt);
  }

  function shakeOffset() {
    if (reduceShake || cam.trauma <= 0) return { x: 0, y: 0 };
    const s = cam.trauma * cam.trauma;
    const t = performance.now() / 1000 * 30;
    return {
      x: Math.floor(SHAKE_MAX * s * Math.sin(t * 1.7)),
      y: Math.floor(SHAKE_MAX * 0.7 * s * Math.sin(t * 2.3)),
    };
  }

  function drawParallax(sh) {
    // Solid palette sky bands (no canvas gradient AA mush, no dotted dither)
    // NO dotted full-width bands. Soft sky is the gradient above only.
    // Discrete 3-stop solid haze bands (no dither rows, no checker rectangles).
    const h0 = Math.floor(VIEW_H * 0.22);
    const h1 = Math.floor(VIEW_H * 0.40);
    ctx.fillStyle = PALETTE.skyDeep || '#3a6ea5';
    ctx.fillRect(0, 0, VIEW_W, h0);
    ctx.fillStyle = PALETTE.skyMid || '#5a9fd4';
    ctx.fillRect(0, h0, VIEW_W, h1 - h0);
    ctx.fillStyle = PALETTE.sky || '#7ec8f0';
    ctx.fillRect(0, h1, VIEW_W, VIEW_H - h1);

    // Solid 2–3 tone puffy pixel clouds (no checkerboard bodies)
    const cloudCam = Math.floor(cam.x * 0.08);
    for (let i = -1; i < 5; i++) {
      const cx = Math.floor(((i * 100 - cloudCam) % (VIEW_W + 100) + (VIEW_W + 100)) % (VIEW_W + 100));
      const cy = 8 + (i % 3) * 10;
      // shadow base
      ctx.fillStyle = PALETTE.mtFar || '#6a8fb0';
      ctx.fillRect(cx + 6, cy + 5, 22, 3);
      ctx.fillRect(cx + 10, cy + 7, 14, 2);
      // mid
      ctx.fillStyle = PALETTE.skyPale || '#c5e8fa';
      ctx.fillRect(cx + 4, cy + 3, 26, 3);
      ctx.fillRect(cx + 8, cy + 1, 10, 3);
      ctx.fillRect(cx + 16, cy + 2, 12, 3);
      // bright puffy tops
      ctx.fillStyle = PALETTE.cloud || '#e8f4fc';
      ctx.fillRect(cx + 8, cy, 8, 2);
      ctx.fillRect(cx + 14, cy + 1, 6, 2);
      ctx.fillRect(cx + 18, cy, 5, 2);
    }

    // FAR: pale mountains + snow caps (no slope dither rectangles)
    const far = Math.floor(cam.x * 0.15);
    const mtBase = VIEW_H - 36;
    for (let i = -1; i < 7; i++) {
      const hx = Math.floor(((i * 100 - far) % (VIEW_W + 100) + (VIEW_W + 100)) % (VIEW_W + 100));
      const peak = 28 + (i % 4) * 8;
      ctx.fillStyle = PALETTE.mtFar || PALETTE.bgForestFar;
      ctx.beginPath();
      ctx.moveTo(hx, mtBase + 20);
      ctx.lineTo(hx + 18, mtBase - peak);
      ctx.lineTo(hx + 40, mtBase - peak * 0.5);
      ctx.lineTo(hx + 62, mtBase - peak * 0.85);
      ctx.lineTo(hx + 95, mtBase + 20);
      ctx.fill();
      // snow caps — solid pixels
      ctx.fillStyle = PALETTE.cloud || '#e8f4fc';
      ctx.fillRect(hx + 16, mtBase - peak, 6, 3);
      ctx.fillRect(hx + 14, mtBase - peak + 3, 10, 2);
      ctx.fillStyle = PALETTE.skyPale || '#c5e8fa';
      ctx.fillRect(hx + 20, mtBase - peak + 2, 4, 2);
    }

    // MID: rolling hills + varied tree silhouettes
    const mid = Math.floor(cam.x * 0.35);
    ctx.fillStyle = PALETTE.mtMid || PALETTE.bgForestMid;
    for (let i = -1; i < 8; i++) {
      const hx = Math.floor(((i * 80 - mid) % (VIEW_W + 80) + (VIEW_W + 80)) % (VIEW_W + 80));
      const peak = 22 + (i % 3) * 6;
      // stepped mound — integer rects, no curve AA
      ctx.fillRect(hx + 8, VIEW_H - peak, 40, peak);
      ctx.fillRect(hx + 18, VIEW_H - peak - 6, 22, 6);
      ctx.fillRect(hx + 24, VIEW_H - peak - 10, 12, 4);
      ctx.fillRect(hx + 48, VIEW_H - 14, 28, 14);
      ctx.fillRect(hx + 56, VIEW_H - 20, 14, 6);
    }
    for (let i = -1; i < 14; i++) {
      const tx = Math.floor(((i * 48 - mid) % (VIEW_W + 48) + (VIEW_W + 48)) % (VIEW_W + 48));
      const kind = i % 5;
      const baseY = VIEW_H - 22;
      ctx.fillStyle = PALETTE.mtNearDk || '#1e3226';
      if (kind === 0) {
        ctx.fillRect(tx + 10, baseY - 18, 3, 18);
        ctx.beginPath();
        ctx.moveTo(tx + 4, baseY - 12); ctx.lineTo(tx + 11, baseY - 28); ctx.lineTo(tx + 19, baseY - 12); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tx + 5, baseY - 6); ctx.lineTo(tx + 11, baseY - 20); ctx.lineTo(tx + 18, baseY - 6); ctx.fill();
      } else if (kind === 1) {
        ctx.fillRect(tx + 11, baseY - 10, 3, 10);
        // irregular canopy (not a circle)
        ctx.beginPath();
        ctx.moveTo(tx + 3, baseY - 10);
        ctx.lineTo(tx + 6, baseY - 18); ctx.lineTo(tx + 10, baseY - 22);
        ctx.lineTo(tx + 14, baseY - 16); ctx.lineTo(tx + 18, baseY - 20);
        ctx.lineTo(tx + 22, baseY - 12); ctx.lineTo(tx + 20, baseY - 8);
        ctx.closePath(); ctx.fill();
      } else if (kind === 2) {
        ctx.beginPath();
        ctx.moveTo(tx + 2, baseY - 2); ctx.lineTo(tx + 5, baseY - 10); ctx.lineTo(tx + 12, baseY - 8);
        ctx.lineTo(tx + 16, baseY - 12); ctx.lineTo(tx + 22, baseY - 4); ctx.lineTo(tx + 18, baseY);
        ctx.closePath(); ctx.fill();
      } else if (kind === 3) {
        ctx.fillRect(tx + 10, baseY - 8, 4, 8);
        ctx.beginPath();
        ctx.moveTo(tx + 2, baseY - 8); ctx.lineTo(tx + 8, baseY - 20); ctx.lineTo(tx + 12, baseY - 14);
        ctx.lineTo(tx + 16, baseY - 22); ctx.lineTo(tx + 22, baseY - 10); ctx.lineTo(tx + 20, baseY - 4);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillRect(tx + 12, baseY - 16, 2, 16);
        ctx.beginPath();
        ctx.moveTo(tx + 6, baseY - 10); ctx.lineTo(tx + 13, baseY - 22); ctx.lineTo(tx + 19, baseY - 10); ctx.fill();
      }
    }

    // NEAR: 2 overlapping sub-layers (darker back, brighter front). Snap after factor.
    // Variety: broadleaf / pine / birch / bush. Trunks with bark shading; 3-tone leaves + rim.
    function drawNearTree(bx, ground, kind, darker) {
      const leafLo = darker ? (PALETTE.mtNearDk || '#1e3226') : (PALETTE.mtNear || '#2f4a38');
      const leafMid = darker ? (PALETTE.mtNear || '#2f4a38') : (PALETTE.grassSh || '#2a6a28');
      const leafHi = darker ? (PALETTE.grassSh || '#2a6a28') : (PALETTE.grassHi || '#78d058');
      const barkSh = PALETTE.woodSh || '#4a3018';
      const bark = darker ? (PALETTE.woodSh || '#4a3018') : (PALETTE.wood || '#8a5a30');
      const barkHi = darker ? (PALETTE.wood || '#8a5a30') : (PALETTE.woodHi || '#c49058');
      const trunkH = 14 + (kind % 5) * 4 + (darker ? 4 : 0);
      const trunkX = bx + 10 + (kind % 3);
      // bark: 3-tone trunk
      ctx.fillStyle = barkSh;
      ctx.fillRect(trunkX, ground - trunkH, 4, trunkH);
      ctx.fillStyle = bark;
      ctx.fillRect(trunkX + 1, ground - trunkH, 2, trunkH);
      ctx.fillStyle = barkHi;
      ctx.fillRect(trunkX + 1, ground - trunkH, 1, trunkH);
      // bark notches
      ctx.fillStyle = barkSh;
      ctx.fillRect(trunkX, ground - trunkH + 4, 1, 2);
      ctx.fillRect(trunkX + 3, ground - trunkH + 9, 1, 2);
      const top = ground - trunkH - 4;
      const k = kind % 4;
      if (k === 1) {
        // pine — stacked triangles
        for (let tier = 0; tier < 3; tier++) {
          const tw = 18 - tier * 4;
          const ty = top + 2 + tier * 6;
          ctx.fillStyle = tier === 0 ? leafHi : (tier === 1 ? leafMid : leafLo);
          ctx.beginPath();
          ctx.moveTo(bx + 12, ty - 8);
          ctx.lineTo(bx + 12 - tw / 2, ty + 4);
          ctx.lineTo(bx + 12 + tw / 2, ty + 4);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = leafHi;
        ctx.fillRect(bx + 11, top - 6, 2, 2);
      } else if (k === 2) {
        // birch — pale thin trunk already; oval canopy with notch
        ctx.fillStyle = PALETTE.cloud || '#e8f4fc';
        ctx.fillRect(trunkX, ground - trunkH, 3, trunkH);
        ctx.fillStyle = barkSh;
        ctx.fillRect(trunkX + 1, ground - trunkH + 3, 1, 2);
        ctx.fillRect(trunkX + 1, ground - trunkH + 8, 1, 2);
        ctx.fillStyle = leafMid;
        ctx.beginPath();
        ctx.moveTo(bx + 4, top + 10);
        ctx.lineTo(bx + 8, top + 0); ctx.lineTo(bx + 14, top - 4);
        ctx.lineTo(bx + 20, top + 2); ctx.lineTo(bx + 22, top + 12);
        ctx.lineTo(bx + 16, top + 16); ctx.lineTo(bx + 8, top + 14);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = leafHi;
        ctx.fillRect(bx + 9, top - 2, 3, 2);
        ctx.fillStyle = leafLo;
        ctx.fillRect(bx + 17, top + 6, 3, 3); // notch
      } else if (k === 3) {
        // bush — low wide irregular
        ctx.fillStyle = leafLo;
        ctx.beginPath();
        ctx.moveTo(bx + 2, ground - 4);
        ctx.lineTo(bx + 6, ground - 14); ctx.lineTo(bx + 12, ground - 18);
        ctx.lineTo(bx + 18, ground - 12); ctx.lineTo(bx + 22, ground - 16);
        ctx.lineTo(bx + 26, ground - 6); ctx.lineTo(bx + 20, ground - 2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = leafMid;
        ctx.fillRect(bx + 8, ground - 16, 6, 4);
        ctx.fillStyle = leafHi;
        ctx.fillRect(bx + 10, ground - 18, 3, 2);
        ctx.fillRect(bx + 16, ground - 14, 2, 2);
      } else {
        // broadleaf irregular masses, 3 tones + rim
        const shapes = [
          [[0, 8], [4, 0], [10, -2], [14, 2], [18, -1], [22, 4], [24, 10], [20, 14], [12, 16], [4, 14]],
          [[-4, 12], [0, 6], [6, 8], [8, 14], [2, 18], [-2, 16]],
          [[6, -2], [10, -8], [16, -6], [18, 0], [14, 4], [8, 2]],
        ];
        const cols = [leafLo, leafMid, leafHi];
        for (let s = 0; s < shapes.length; s++) {
          const pts = shapes[s];
          ctx.fillStyle = cols[s];
          ctx.beginPath();
          ctx.moveTo(bx + pts[0][0] + 6, top + pts[0][1]);
          for (let p = 1; p < pts.length; p++) ctx.lineTo(bx + pts[p][0] + 6, top + pts[p][1]);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = leafHi;
        ctx.fillRect(bx + 10, top - 6, 3, 2);
        ctx.fillRect(bx + 8, top - 3, 2, 2);
        ctx.fillStyle = leafLo;
        if (kind % 2 === 0) {
          ctx.fillRect(bx + 18, top + 2, 4, 3);
          ctx.fillRect(bx + 16, top + 4, 3, 2);
        }
      }
    }
    // Ground line ≈ where grass sits under play camera (~feet at 0.78 VIEW_H).
    // Trunks extend into that band so tiles drawn later hide lower trunk.
    const grassLine = Math.floor(VIEW_H * 0.82);
    // back row (darker, slower) — denser, full width
    const nearBack = Math.floor(cam.x * 0.48);
    for (let i = -2; i < 14; i++) {
      const bx = Math.floor(((i * 48 - nearBack) % (VIEW_W + 48) + (VIEW_W + 48)) % (VIEW_W + 48));
      drawNearTree(bx, grassLine + 2, i + 1, true);
    }
    // front row (brighter, faster) — snap after its own factor
    const nearFront = Math.floor(cam.x * 0.62);
    for (let i = -2; i < 12; i++) {
      const bx = Math.floor(((i * 42 + 18 - nearFront) % (VIEW_W + 42) + (VIEW_W + 42)) % (VIEW_W + 42));
      drawNearTree(bx, grassLine, i + 3, false);
    }


    // falling leaves (sparse)
    ctx.fillStyle = PALETTE.leaf;
    const leafCam = Math.floor(cam.x * 0.4);
    for (let i = 0; i < 6; i++) {
      const lx = Math.floor(((i * 53 + animT * 20 * (i % 3 + 1) - leafCam) % VIEW_W + VIEW_W) % VIEW_W);
      const ly = Math.floor(((i * 37 + animT * 30) % (VIEW_H * 0.7)));
      ctx.fillRect(lx, ly, 2, 2);
    }
    // birds
    ctx.fillStyle = PALETTE.outline;
    const birdCam = Math.floor(cam.x * 0.2);
    for (let i = 0; i < 3; i++) {
      const bx = Math.floor(((animT * 25 + i * 140) - birdCam) % (VIEW_W + 40));
      const by = Math.floor(22 + i * 14 + Math.sin(animT * 3 + i) * 3);
      const wing = Math.sin(animT * 8 + i) > 0 ? 1 : -1;
      ctx.fillRect(bx, by, 3, 1);
      ctx.fillRect(bx - 2, by + wing, 2, 1);
      ctx.fillRect(bx + 3, by + wing, 2, 1);
    }
  }

  function drawWorld() {
    const sh = shakeOffset();
    ctx.save();
    const camDrawX = Math.floor(cam.x);
    const camDrawY = Math.floor(cam.y);
    lastDraw.camX = camDrawX;
    lastDraw.camY = camDrawY;
    ctx.translate(-camDrawX + sh.x, -camDrawY + sh.y);

    // tiles
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const x1 = Math.min(level.w, Math.ceil((cam.x + VIEW_W) / TILE) + 1);
    const y1 = Math.min(level.h, Math.ceil((cam.y + VIEW_H) / TILE) + 1);
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const ch = level.solids[ty][tx];
        if (ch === '#') {
          const above = ty > 0 ? level.solids[ty - 1][tx] : '.';
          if (isSolid(above)) {
            sheets.tiles.draw(ctx, 'fill', tx * TILE, ty * TILE);
          } else {
            const left = tx > 0 && isSolid(level.solids[ty][tx - 1]);
            const right = tx < level.w - 1 && isSolid(level.solids[ty][tx + 1]);
            sheets.tiles.drawAutotile(ctx, 'ground', tx, ty, left, right);
          }
        } else if (ch === '=') {
          const left = tx > 0 && isSolid(level.solids[ty][tx - 1]);
          const right = tx < level.w - 1 && isSolid(level.solids[ty][tx + 1]);
          sheets.tiles.drawAutotile(ctx, 'platform', tx, ty, left, right);
        } else if (ch === 'H') {
          sheets.tiles.draw(ctx, 'stone', tx * TILE, ty * TILE);
        }
      }
    }

    // entities
    const bob = Math.floor(animT * 4) % 2;
    const coinSpinBase = Math.floor(animT * 5);
    const coinLut = [0, 0, 1, 2, 3, 4, 4, 5, 1, 3];
    lastDraw.sprites = [];
    for (const e of ents) {
      // cull
      if (e.x < cam.x - 40 || e.x > cam.x + VIEW_W + 40) continue;
      if (e.type === 'coin' && e.alive) {
        const dx = Math.floor(e.x), dy = Math.floor(e.y - bob);
        // Stable per-coin phase from world position (avoids all edge-on together)
        const phase = (Math.floor(e.x) * 7 + Math.floor(e.y) * 13) % 10;
        const coinFrame = coinLut[(coinSpinBase + phase + 10) % 10];
        lastDraw.sprites.push({ kind: 'coin', x: dx, y: dy, frame: coinFrame, phase });
        sheets.pickups.draw(ctx, 'coin' + coinFrame, dx, dy);
      } else if (e.type === 'spike') {
        sheets.hazards.draw(ctx, 'spike' + bob, e.x, e.y);
      } else if (e.type === 'spring') {
        sheets.hazards.draw(ctx, 'spring' + bob, e.x, e.y);
      } else if (e.type === 'moving') {
        for (let i = 0; i < 3; i++) sheets.hazards.draw(ctx, 'moving0', e.x + i * TILE, e.y - 4);
      } else if (e.type === 'checkpoint') {
        sheets.pickups.draw(ctx, checkpointOn ? 'checkpoint_on0' : 'checkpoint_off0', e.x, e.y);
      } else if (e.type === 'decor') {
        sheets.tiles.draw(ctx, e.variant || 'grass', e.x, e.y);
      } else if (e.type === 'frog') {
        sheets.critters.draw(ctx, 'frog' + bob, e.x, e.y);
      } else if (e.type === 'butterfly') {
        sheets.critters.draw(ctx, 'butterfly' + bob, e.x, e.y);
      } else if ((e.type === 'walker' || e.type === 'flyer' || e.type === 'shooter') && (e.alive || e.deathT > 0)) {
        const sheet = sheets[e.type];
        let pose = 'move' + (Math.floor(e.t * 10) % (e.type === 'walker' ? 6 : 4));
        if (e.type === 'shooter') {
          pose = e.telegraph ? 'windup' : (e.flash > 0 ? 'fire' : 'idle0');
        }
        if (e.flash > 0 && e.type !== 'shooter') pose = 'hit';
        if (!e.alive) pose = 'death';
        if (e.telegraph && e.type !== 'shooter') pose = 'idle1';
        if (e.flash > 0) ctx.globalAlpha = 0.7;
        const ex = Math.floor(e.x), ey = Math.floor(e.y);
        lastDraw.sprites.push({ kind: e.type, x: ex, y: ey });
        sheet.draw(ctx, pose, ex, ey, { flip: e.type === 'flyer' ? false : (e.vx > 0 || e.facing > 0) });
        ctx.globalAlpha = 1;
      }
    }

    // goal flag (sheet)
    if (level.goal) {
      const gf = Math.floor(animT * 6) % 4;
      sheets.goal.draw(ctx, 'goal' + gf, Math.floor(level.goal.x), Math.floor(level.goal.y - 12));
    }

    // projectiles
    for (const pr of projectiles) {
      ctx.drawImage(sheets.projectile, 1, 1, 10, 8, Math.floor(pr.x), Math.floor(pr.y), 10, 8);
    }

    // player
    if (player.invuln > 0 && Math.floor(player.invuln * 20) % 2 === 0) {
      /* blink off */
    } else {
      let sx = 1, sy = 1;
      if (jumpStretch > 0) { sx = 0.85; sy = 1.2; }
      if (landSquash > 0) { sx = 1.25; sy = 0.75; }
      ctx.save();
      const px = Math.floor(player.x + player.w / 2);
      const py = Math.floor(player.y + player.h);
      lastDraw.heroX = px;
      lastDraw.heroY = py;
      lastDraw.sprites.push({ kind: 'hero', x: px, y: py });
      ctx.translate(px, py);
      ctx.scale(sx * (player.facing < 0 ? -1 : 1), sy);
      // Draw hero; optional 1-frame white flash via offscreen tint (not baked)
      const flash = player.pose === 'hurt' || (player.invuln > HIT_INVULN * 0.85);
      if (flash) {
        if (!testHooks._heroTint) {
          testHooks._heroTint = document.createElement('canvas');
          testHooks._heroTint.width = 28; testHooks._heroTint.height = 28;
        }
        const tc = testHooks._heroTint;
        const tctx = tc.getContext('2d');
        tctx.imageSmoothingEnabled = false;
        tctx.clearRect(0, 0, 28, 28);
        sheets.player.draw(tctx, player.pose, 0, 0, { flip: false });
        tctx.globalCompositeOperation = 'source-atop';
        tctx.fillStyle = '#fff8f0';
        tctx.globalAlpha = 0.65;
        tctx.fillRect(0, 0, 28, 28);
        tctx.globalAlpha = 1;
        tctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(tc, -14, -26);
      } else {
        sheets.player.draw(ctx, player.pose, -14, -26, { flip: false });
      }
      ctx.restore();
    }

    particles.draw(ctx, sheets, { x: 0, y: 0 }); // already in world space via translate
    // fix: particles stored in world space; draw relative
    ctx.restore();

    // redraw particles correctly (reuse snapped cam)
    ctx.save();
    ctx.translate(-camDrawX + sh.x, -camDrawY + sh.y);
    for (const p of particles.pool) {
      if (!p.alive) continue;
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      sheets.particles.draw(ctx, p.kind, Math.floor(p.x), Math.floor(p.y), { scale: p.s });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawHud() {
    // Screen-space HUD (not multiplied by ZOOM)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const icon = canvas.height >= 700 ? 32 : 24;
    const pad = 10;
    const gap = 6;
    for (let i = 0; i < player.maxHp; i++) {
      const x = pad + i * (icon + gap);
      sheets.ui.draw(ctx, 'heart', x, pad, { scale: icon / 16 });
      if (i >= player.hp) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x, pad, icon, icon);
      }
    }
    // leave room for HTML pause/fs (~130px)
    const rx = canvas.width - pad - 130 - icon - 48;
    sheets.ui.draw(ctx, 'coin', rx, pad, { scale: icon / 16 });
    drawNumScreen(rx + icon + 6, pad + 4, coins, icon);
    sheets.ui.draw(ctx, 'clock', rx, pad + icon + gap, { scale: icon / 16 });
    drawNumScreen(rx + icon + 6, pad + icon + gap + 4, Math.floor(time), icon);
    // restore world zoom for any later draws in same frame (none expected)
    ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
  }

  function drawNumScreen(x, y, n, iconPx) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(14, Math.round(iconPx * 0.85))}px monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(String(n), x, y);
  }

  function drawNum(x, y, n, hs = HUD_SCALE) {
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.round(10 * hs)}px monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(String(n), x, y);
  }

  function drawTitle() {
    attractT += FIXED_DT;
    drawParallax();
    ctx.fillStyle = PALETTE.bgForestNear;
    ctx.fillRect(0, VIEW_H - 40, VIEW_W, 40);
    for (let i = 0; i < Math.ceil(VIEW_W / 16) + 1; i++) sheets.tiles.draw(ctx, 'ground', i * 16, VIEW_H - 32);
    const ax = ((attractT * 40) % (VIEW_W + 40)) - 20;
    const pose = 'run' + (Math.floor(attractT * 10) % 8);
    sheets.player.draw(ctx, pose, Math.floor(ax), Math.floor(VIEW_H - 56));
    sheets.critters.draw(ctx, 'butterfly' + (Math.floor(attractT * 6) % 2), ax - 30, VIEW_H - 80);
    // Logo + play + best time in SCREEN space (readable, large)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const lw = sheets.logo.width;
    const lh = sheets.logo.height;
    const targetW = canvas.width * 0.72;
    const ls = Math.max(2, targetW / lw);
    const logoW = Math.floor(lw * ls);
    const logoH = Math.floor(lh * ls);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sheets.logo, 0, 0, lw, lh,
      Math.floor((canvas.width - logoW) / 2), Math.floor(canvas.height * 0.10),
      logoW, logoH,
    );
    const playS = canvas.height >= 700 ? 5 : 4;
    sheets.ui.draw(ctx, 'play', canvas.width / 2 - 16 * playS / 2, canvas.height * 0.52, { scale: playS });
    const best = save.best[0];
    const icon = canvas.height >= 700 ? 48 : 36;
    sheets.ui.draw(ctx, 'clock', canvas.width / 2 - icon - 60, canvas.height * 0.70, { scale: icon / 16 });
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(icon * 0.95)}px monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(best != null ? (Math.round(best * 10) / 10).toFixed(1) : '--', canvas.width / 2 - 36, canvas.height * 0.70 + 8);
    ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
  }

  function drawPanelIcons(kind) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(10,14,28,0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const s = canvas.height >= 700 ? 3 : 2.5;
    if (kind === 'pause') {
      sheets.ui.draw(ctx, 'pause', cx - 16 * s, cy - 70, { scale: s });
      sheets.ui.draw(ctx, save.settings.sound ? 'sound_on' : 'sound_off', cx - 56 * s / 2 - 40, cy, { scale: s });
      sheets.ui.draw(ctx, save.settings.music ? 'music_on' : 'music_off', cx - 16 * s / 2, cy, { scale: s });
      sheets.ui.draw(ctx, save.settings.reduceShake ? 'shake_off' : 'shake_on', cx + 40, cy, { scale: s });
      sheets.ui.draw(ctx, 'play', cx - 16 * s / 2, cy + 60, { scale: s });
    } else if (kind === 'win') {
      sheets.ui.draw(ctx, 'coin', cx - 50, cy - 30, { scale: s });
      drawNumScreen(cx - 10, cy - 24, coins, 28);
      sheets.ui.draw(ctx, 'clock', cx - 50, cy + 20, { scale: s });
      drawNumScreen(cx - 10, cy + 26, Math.round(winTime * 100) / 100, 28);
      sheets.ui.draw(ctx, 'play', cx - 16 * s / 2, cy + 70, { scale: s });
    }
    ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
  }

  function resize() {
    const wrap = canvas.parentElement;
    const ww = Math.max(1, wrap.clientWidth || window.innerWidth);
    const wh = Math.max(1, wrap.clientHeight || window.innerHeight);
    // Integer ZOOM: hero sprite frame 24px → ~1/8–1/10 of screen height.
    // Phone landscapes force ZOOM>=3 so the visible body (~16px) lands ~48px.
    // Phone: ZOOM 3 → ~50px visible body on 390p. PC: ZOOM 5 → ~85px body on 800p.
    if (wh <= 500) ZOOM = 3;
    else ZOOM = 5;
    ZOOM = Math.floor(ZOOM);
    VIEW_H = Math.max(100, Math.floor(wh / ZOOM));
    VIEW_W = Math.max(160, Math.floor(ww / ZOOM));
    HUD_SCALE = wh >= 700 ? 2.5 : 2;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.width = ww;
    canvas.height = wh;
    ctx.imageSmoothingEnabled = false;
  }

  function onTap(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((clientY - rect.top) / rect.height) * VIEW_H;
    if (mode === 'title') {
      startGame();
      return;
    }
    if (mode === 'pause') {
      // x,y are VIEW-space; convert to screen for hit tests against screen-space panel
      const sx = x * ZOOM, sy = y * ZOOM;
      const cx = canvas.width / 2, cy = canvas.height / 2;
      if (Math.hypot(sx - (cx - 60), sy - cy) < 40) {
        save.settings.sound = !save.settings.sound;
        audio.setSound(save.settings.sound);
        saveSettings(save.settings);
        audio.sfx.blip();
      } else if (Math.hypot(sx - cx, sy - cy) < 40) {
        save.settings.music = !save.settings.music;
        audio.setMusic(save.settings.music);
        saveSettings(save.settings);
        audio.sfx.blip();
      } else if (Math.hypot(sx - (cx + 60), sy - cy) < 40) {
        save.settings.reduceShake = !save.settings.reduceShake;
        reduceShake = save.settings.reduceShake;
        saveSettings(save.settings);
        audio.sfx.blip();
      } else {
        mode = 'play';
        audio.sfx.blip();
      }
      return;
    }
    if (mode === 'win') {
      resetLevel();
      mode = 'title';
      return;
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('#touch')) return;
    onTap(e.clientX, e.clientY);
  });

  // pause key
  function checkPause() {
    if (input.pressed('pause')) {
      if (mode === 'play') { mode = 'pause'; audio.sfx.blip(); }
      else if (mode === 'pause') { mode = 'play'; audio.sfx.blip(); }
      else if (mode === 'title') startGame();
    }
  }

  let acc = 0;
  let last = performance.now();

  function frame(now) {
    const raw = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    acc += raw;
    const t0 = performance.now();

    input.update(FIXED_DT);
    checkPause();

    while (acc >= FIXED_DT) {
      if (mode === 'title') {
        attractT += FIXED_DT;
      } else if (mode === 'play') {
        if (!testHooks._freeze) {
          if (testHooks._botJumpEvery != null && testHooks._botUntil != null && time < testHooks._botUntil) {
            if (time >= (testHooks._botJumpNext || 0)) {
              player.jumpBuf = JUMP_BUFFER;
              testHooks._botJumpNext = time + testHooks._botJumpEvery;
            }
          }
          wasGroundedFlag = player.grounded;
          physicsPlayer(FIXED_DT);
          updateEntities(FIXED_DT);
          particles.update(FIXED_DT);
          updateCam(FIXED_DT);
          time += FIXED_DT;
        } else {
          updateCam(FIXED_DT);
        }
      } else if (mode === 'pause') {
        // frozen
      }
      input.endFrame();
      acc -= FIXED_DT;
    }

    // render — integer nearest-neighbor zoom, canvas fills viewport
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0);
    if (mode === 'title') drawTitle();
    else {
      drawParallax();
      drawWorld();
      drawHud();
      if (mode === 'pause') drawPanelIcons('pause');
      if (mode === 'win') drawPanelIcons('win');
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    frameMs = performance.now() - t0;
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  resetLevel();
  requestAnimationFrame(frame);

  // Test hooks
  testHooks = {
    get mode() { return mode; },
    get time() { return time; },
    get coins() { return coins; },
    get player() { return player; },
    get frameMs() { return frameMs; },
    get constants() {
      return { COYOTE_TIME, JUMP_BUFFER, JUMP_VY, JUMP_CUT, GRAVITY, HOLD_GRAVITY };
    },
    startGame,
    resetLevel,
    setMode(m) { mode = m; },
    tap: onTap,
    save: () => loadSave(),
    completeLevel() {
      time = time || 12.34;
      recordBest(0, time);
      goalReached = true;
      winTime = time;
      mode = 'win';
    },
    teleportToGoal() {
      if (!level.goal) return;
      player.x = level.goal.x - 8;
      player.y = level.goal.y - 16;
    },
    teleportToCheckpoint() {
      if (!level.checkpoint) return;
      player.x = level.checkpoint.x;
      player.y = level.checkpoint.y - 8;
    },
    forceJump() {
      player.jumpBuf = JUMP_BUFFER;
      player.coyote = COYOTE_TIME;
      player.grounded = true;
    },
    simulateCoyote() {
      player.grounded = false;
      player.coyote = COYOTE_TIME;
      player.vy = 10;
    },
    getCoyote() { return player.coyote; },
    getJumpBuf() { return player.jumpBuf; },
    pressJumpBuffer() { player.jumpBuf = JUMP_BUFFER; },
    setReduceShake(v) { reduceShake = v; save.settings.reduceShake = v; saveSettings(save.settings); },
    countEntities(type) { return ents.filter((e) => e.type === type && (e.alive !== false || type === 'moving')).length; },
    scriptMove(dir, seconds) {
      testHooks._botAxis = dir;
      testHooks._botUntil = time + seconds;
    },
    scriptRunJump(seconds, jumpEvery = 0.55) {
      testHooks._botAxis = 1;
      testHooks._botUntil = time + seconds;
      testHooks._botJumpEvery = jumpEvery;
      testHooks._botJumpNext = time;
    },
    snapCam,
    spawnEnemyNearHero(type = 'flyer', ox = 40, oy = -16) {
      ents.push({
        type, x: player.x + ox, y: player.y + oy, w: 16, h: 16,
        alive: true, vx: type === 'walker' ? -30 : 0, t: 0, hp: 1, flash: 0,
      });
    },
    freeze(v) { testHooks._freeze = !!v; },
    heroScreen() {
      return {
        x: (player.x + player.w / 2 - cam.x) / VIEW_W,
        y: (player.y + player.h / 2 - cam.y) / VIEW_H,
        coins,
        time,
        projectiles: projectiles.length,
      };
    },
    viewInfo() { return { VIEW_W, VIEW_H, ZOOM, camX: cam.x, camY: cam.y, spawn: { ...spawnPoint } }; },
    heroCssRect() {
      // Sprite 28x28 anchored feet at (px,py); CSS px = view * ZOOM (canvas fills stage)
      const px = player.x + player.w / 2;
      const py = player.y + player.h;
      const left = (px - 14 - cam.x) * ZOOM;
      const top = (py - 26 - cam.y) * ZOOM;
      return { x: left, y: top, w: 28 * ZOOM, h: 28 * ZOOM, cx: (px - cam.x) * ZOOM, cy: (py - cam.y) * ZOOM };
    },
    forceCheckpoint() {
      const cp = ents.find((e) => e.type === 'checkpoint');
      if (!cp) return false;
      checkpointOn = true;
      spawnPoint = { x: cp.x, y: cp.y - 8 };
      return true;
    },
    respawnAtSpawn() {
      player.x = spawnPoint.x;
      player.y = spawnPoint.y;
      player.vx = 0; player.vy = 0;
      player.grounded = true;
      player.invuln = 0.5;
      player.pose = 'idle';
      if (mode === 'dead') mode = 'play';
      snapCam();
    },
    lastDraw() { return { ...lastDraw, sprites: lastDraw.sprites.slice() }; },
    integerDrawPositions() {
      const d = lastDraw;
      const bad = [];
      if (!Number.isInteger(d.camX) || !Number.isInteger(d.camY)) bad.push('cam');
      if (!Number.isInteger(d.heroX) || !Number.isInteger(d.heroY)) bad.push('hero');
      for (const s of d.sprites) {
        if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) bad.push(s.kind);
      }
      return { ok: bad.length === 0, bad, camX: d.camX, camY: d.camY, heroX: d.heroX, heroY: d.heroY, count: d.sprites.length };
    },
    decorGrounded() {
      const bad = [];
      for (const e of ents) {
        if (e.type !== 'decor') continue;
        const foot = e.y + TILE;
        let ok = false;
        for (let dy = 0; dy <= 1; dy++) {
          const ch = tileAt(level, e.x + TILE / 2, foot + dy);
          if (isSolid(ch)) { ok = true; break; }
        }
        if (!ok) {
          for (const p of platforms) {
            if (Math.abs(p.y - foot) <= 1 && e.x + 8 >= p.x && e.x + 8 <= p.x + p.w) { ok = true; break; }
          }
        }
        if (!ok) bad.push({ variant: e.variant, x: e.x, y: e.y, foot });
      }
      return { ok: bad.length === 0, bad, total: ents.filter((e) => e.type === 'decor').length };
    },
  };

  // bot axis override
  const origAxis = input.axis.bind(input);
  input.axis = () => {
    if (testHooks._botUntil != null && time < testHooks._botUntil) return testHooks._botAxis || 0;
    return origAxis();
  };

  testHooks.spawnSpark = (x, y, n = 10) => particles.spawn('spark', x, y, n);
  testHooks.spawnDust = (x, y, n = 8) => particles.spawn('dust', x, y, n);
  testHooks.spawnProjectile = (x, y, vx = 70) => {
    projectiles.push({ x, y, vx, vy: 0, life: 3, w: 6, h: 6 });
  };
  testHooks.addShake = (a) => addShake(a);

  Object.defineProperties(testHooks, {
    VIEW_W: { get: () => VIEW_W },
    VIEW_H: { get: () => VIEW_H },
    ZOOM: { get: () => ZOOM },
    canvasCover: {
      get: () => {
        const r = canvas.getBoundingClientRect();
        const wrap = canvas.parentElement.getBoundingClientRect();
        return {
          canvasW: r.width, canvasH: r.height,
          wrapW: wrap.width, wrapH: wrap.height,
          coverW: r.width / Math.max(1, wrap.width),
          coverH: r.height / Math.max(1, wrap.height),
        };
      },
    },
  });

  window.__SPRIG__ = testHooks;
  return testHooks;
}
