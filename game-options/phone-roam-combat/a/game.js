(function () {
  "use strict";

  // STYLE_LOCK — sheet cells only (ANIM_SHEETS.md). Never _old_shape_* / geometry fallbacks.
  const CELL = 256;
  const V = "?v=opt8b";

  function loadImg(src) {
    const im = new Image();
    im.ok = false;
    im.onload = () => { im.ok = true; };
    im.onerror = () => { im.ok = false; };
    im.src = src;
    return im;
  }

  const playerIdle = loadImg("./art/player_idle_sheet.png" + V);
  const playerWalk = loadImg("./art/player_walk_sheet.png" + V);
  const playerAtk = loadImg("./art/player_attack_sheet.png" + V);
  const playerFb = loadImg("./art/player.png" + V);

  const enemySheets = {
    tri: loadImg("./art/enemy_tri_sheet.png" + V),
    pod: loadImg("./art/enemy_pod_sheet.png" + V),
    rock: loadImg("./art/enemy_rock_sheet.png" + V),
    orb: loadImg("./art/enemy_pod_sheet.png" + V),
  };
  const enemyHitDeath = {
    tri: loadImg("./art/enemy_tri_hitdeath_sheet.png" + V),
    pod: loadImg("./art/enemy_pod_hitdeath_sheet.png" + V),
    rock: loadImg("./art/enemy_rock_hitdeath_sheet.png" + V),
    orb: loadImg("./art/enemy_pod_hitdeath_sheet.png" + V),
  };
  const enemyFb = {
    tri: loadImg("./art/enemy_tri.png" + V),
    pod: loadImg("./art/enemy_pod.png" + V),
    rock: loadImg("./art/enemy_rock.png" + V),
    orb: loadImg("./art/enemy_pod.png" + V),
  };

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const hudScore = document.getElementById("hudScore");
  const hudWave = document.getElementById("hudWave");
  const hudHp = document.getElementById("hudHp");
  const overlay = document.getElementById("overlay");
  const ovTitle = document.getElementById("ovTitle");
  const ovBody = document.getElementById("ovBody");
  const ovBtn = document.getElementById("ovBtn");
  const fireBtn = document.getElementById("fireBtn");

  const DT = 1 / 60;
  const MAX_FRAME = 0.05;
  const MAX_STEPS = 5;
  const ARENA = 280;

  // FPS from ANIM_SHEETS
  const IDLE_FPS = 6;
  const WALK_FPS = 10;
  const ATK_FPS = 12;
  const ENEMY_FPS = 8;
  const DEATH_FPS = 10; // 4 death cells after hit

  function drawFrame(img, frameIndex, dx, dy, scale) {
    if (!img || !img.ok || !img.width) return false;
    const n = Math.max(1, Math.floor(img.width / CELL));
    const f = ((frameIndex % n) + n) % n;
    const s = CELL * scale;
    ctx.drawImage(img, f * CELL, 0, CELL, CELL, dx, dy, s, s);
    return true;
  }

  function drawFallback(img, dx, dy, size) {
    if (!img || !img.ok) return false;
    ctx.drawImage(img, dx, dy, size, size);
    return true;
  }

  // --- input ---
  const keys = Object.create(null);
  const moveVec = { x: 0, y: 0 };
  const aimVec = { x: 0, y: 0 };
  let fireHeld = false;
  let pointerAim = null;

  function bindStick(zoneId, knobId, out) {
    const zone = document.getElementById(zoneId);
    const knob = document.getElementById(knobId);
    let active = null;
    function setFrom(clientX, clientY) {
      const r = zone.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const max = Math.min(r.width, r.height) * 0.28;
      const len = Math.hypot(dx, dy) || 1;
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      out.x = dx / max;
      out.y = dy / max;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    }
    function reset() {
      out.x = 0;
      out.y = 0;
      knob.style.transform = "translate(0,0)";
      active = null;
    }
    zone.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      active = e.pointerId;
      setFrom(e.clientX, e.clientY);
    }, { passive: false });
    zone.addEventListener("pointermove", (e) => {
      if (active !== e.pointerId) return;
      e.preventDefault();
      setFrom(e.clientX, e.clientY);
    }, { passive: false });
    function up(e) {
      if (active !== e.pointerId) return;
      reset();
    }
    zone.addEventListener("pointerup", up);
    zone.addEventListener("pointercancel", up);
  }

  bindStick("moveStick", "moveKnob", moveVec);
  bindStick("aimStick", "aimKnob", aimVec);

  fireBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    fireHeld = true;
    fireBtn.classList.add("held");
    fireBtn.setPointerCapture(e.pointerId);
  }, { passive: false });
  function fireUp() {
    fireHeld = false;
    fireBtn.classList.remove("held");
  }
  fireBtn.addEventListener("pointerup", fireUp);
  fireBtn.addEventListener("pointercancel", fireUp);
  fireBtn.addEventListener("pointerleave", fireUp);

  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
      e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const rect = canvas.getBoundingClientRect();
    pointerAim = {
      sx: ((e.clientX - rect.left) / rect.width) * canvas.width,
      sy: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }, { passive: true });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return;
    if (e.button === 0) fireHeld = true;
  });
  window.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") return;
    if (e.button === 0) fireHeld = false;
  });

  const state = {
    phase: "title",
    score: 0,
    wave: 1,
    shake: 0,
    flash: 0,
    hitStop: 0,
    camX: 0,
    camY: 0,
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
    floatTexts: [],
    scorePop: 0,
    wavePop: 0,
    spawnTimer: 0,
    toSpawn: 0,
    cleared: false,
    waveTimeout: null,
  };

  function makePlayer() {
    return {
      x: 0, y: 0, vx: 0, vy: 0,
      r: 14, hp: 5, maxHp: 5,
      facing: 0, fireCd: 0, invuln: 0, hitFlash: 0,
      scale: 1, recoil: 0, moving: false,
      anim: "idle", // idle | walk | attack
      frame: 0,
      animT: 0,
      atkPlaying: false,
    };
  }

  function hideOverlay() {
    overlay.classList.remove("show");
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
  }

  function resetRun() {
    if (state.waveTimeout) {
      clearTimeout(state.waveTimeout);
      state.waveTimeout = null;
    }
    state.score = 0;
    state.wave = 1;
    state.shake = 0;
    state.flash = 0;
    state.hitStop = 0;
    state.scorePop = 0;
    state.wavePop = 0;
    state.player = makePlayer();
    state.bullets.length = 0;
    state.enemies.length = 0;
    state.particles.length = 0;
    state.floatTexts.length = 0;
    state.cleared = false;
    hideOverlay();
    startWave(1);
    state.phase = "play";
    updateHUD();
  }

  function startWave(n) {
    state.wave = n;
    state.toSpawn = 4 + n * 2;
    state.spawnTimer = 0.4;
    state.cleared = false;
    state.wavePop = 0.55;
  }

  function spawnEnemy() {
    const ang = Math.random() * Math.PI * 2;
    const dist = ARENA * 0.85 + Math.random() * 30;
    const kinds = ["tri", "pod", "rock", "orb"];
    const kind = kinds[(Math.random() * kinds.length) | 0];
    state.enemies.push({
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist,
      vx: 0, vy: 0, kbX: 0, kbY: 0,
      r: kind === "rock" ? 16 + Math.random() * 4 : 11 + Math.random() * 4,
      hp: Math.min(5, 1 + Math.floor(state.wave / 3)),
      hitFlash: 0, scale: 1, squash: 1,
      speed: 55 + state.wave * 6 + Math.random() * 20,
      kind,
      animT: Math.random() * 4,
      frame: 0,
      dying: false,
      deathT: 0,
      deathMax: 0.45,
      deathFrame: 0, // 0..5 on hitdeath sheet
      alpha: 1,
      hitPose: 0,
    });
  }

  function burst(x, y, color, n, speedMul) {
    const sm = speedMul == null ? 1 : speedMul;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (40 + Math.random() * 120) * sm;
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.25 + Math.random() * 0.35,
        max: 0.6,
        color,
        r: 2 + Math.random() * 3,
      });
    }
  }

  function muzzleFlash(x, y, dx, dy) {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < 6; i++) {
      const spread = (Math.random() - 0.5) * 0.55;
      const c = Math.cos(base + spread);
      const s = Math.sin(base + spread);
      const sp = 80 + Math.random() * 140;
      state.particles.push({
        x: x + c * 6, y: y + s * 6,
        vx: c * sp, vy: s * sp,
        life: 0.08 + Math.random() * 0.1,
        max: 0.18,
        color: i % 2 ? "#67e8f9" : "#f0abfc",
        r: 2 + Math.random() * 2.5,
      });
    }
  }

  function floatText(x, y, text, color) {
    state.floatTexts.push({
      x, y, text, color: color || "#67e8f9",
      life: 0.7, max: 0.7, vy: -36,
    });
  }

  function resize() {
    const stage = document.getElementById("stage");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function readMove() {
    let mx = moveVec.x;
    let my = moveVec.y;
    if (keys["KeyW"] || keys["ArrowUp"]) my -= 1;
    if (keys["KeyS"] || keys["ArrowDown"]) my += 1;
    if (keys["KeyA"] || keys["ArrowLeft"]) mx -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    return { x: mx, y: my };
  }

  function readAim(p) {
    let ax = aimVec.x;
    let ay = aimVec.y;
    if (Math.hypot(ax, ay) > 0.25) return { x: ax, y: ay, active: true };
    if (pointerAim && (keys["Space"] || fireHeld || keys["KeyJ"])) {
      const viewW = canvas.clientWidth;
      const viewH = canvas.clientHeight;
      const px = p.x - state.camX + viewW / 2;
      const py = p.y - state.camY + viewH / 2;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let dx = pointerAim.sx / dpr - px;
      let dy = pointerAim.sy / dpr - py;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len, active: true };
    }
    const mv = readMove();
    if (Math.hypot(mv.x, mv.y) > 0.1 && (keys["Space"] || fireHeld || keys["KeyJ"])) {
      return { x: mv.x, y: mv.y, active: true };
    }
    if (keys["Space"] || fireHeld || keys["KeyJ"]) {
      return { x: Math.cos(p.facing), y: Math.sin(p.facing), active: true };
    }
    return { x: 0, y: 0, active: false };
  }

  function updateHUD() {
    const p = state.player;
    const scoreScale = state.scorePop > 0 ? 1 + state.scorePop * 0.35 : 1;
    const waveScale = state.wavePop > 0 ? 1 + state.wavePop * 0.25 : 1;
    hudScore.textContent = "Score " + state.score;
    hudScore.style.transform = "scale(" + scoreScale.toFixed(3) + ")";
    hudWave.textContent = "Wave " + state.wave;
    hudWave.style.transform = "scale(" + waveScale.toFixed(3) + ")";
    hudHp.textContent = "HP " + (p ? p.hp : 0);
  }

  function showOverlay(title, body, btn) {
    ovTitle.textContent = title;
    ovBody.textContent = body;
    ovBtn.textContent = btn || "Again";
    overlay.style.opacity = "";
    overlay.style.pointerEvents = "";
    overlay.classList.add("show");
  }

  ovBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideOverlay();
    resetRun();
  });

  function startPlayerAttack(p) {
    p.anim = "attack";
    p.frame = 0;
    p.animT = 0;
    p.atkPlaying = true;
  }

  function advancePlayerAnim(p, dt) {
    if (p.atkPlaying) {
      p.animT += dt;
      const f = Math.floor(p.animT * ATK_FPS);
      if (f >= 4) {
        p.atkPlaying = false;
        p.anim = p.moving ? "walk" : "idle";
        p.frame = 0;
        p.animT = 0;
      } else {
        p.frame = f;
        p.anim = "attack";
      }
      return;
    }
    if (p.moving) {
      if (p.anim !== "walk") { p.anim = "walk"; p.frame = 0; p.animT = 0; }
      p.animT += dt;
      p.frame = Math.floor(p.animT * WALK_FPS) % 4;
    } else {
      if (p.anim !== "idle") { p.anim = "idle"; p.frame = 0; p.animT = 0; }
      p.animT += dt;
      p.frame = Math.floor(p.animT * IDLE_FPS) % 4;
    }
  }

  function killEnemy(e) {
    e.dying = true;
    e.deathT = e.deathMax;
    e.hp = 0;
    e.deathFrame = 1; // hit cell first (same-frame feedback)
    e.hitFlash = 0.12;
    e.squash = 0.5;
    e.scale = 1.2;
    e.kbX *= 0.4;
    e.kbY *= 0.4;
    burst(e.x, e.y, "#e879f9", 14, 1.1);
    burst(e.x, e.y, "#67e8f9", 8, 0.7);
    state.shake = Math.max(state.shake, 7);
    state.flash = Math.max(state.flash, 0.1);
    state.hitStop = Math.max(state.hitStop, 3);
    const pts = 10 + state.wave * 2;
    state.score += pts;
    state.scorePop = 0.45;
    floatText(e.x, e.y - 10, "+" + pts, "#f0abfc");
  }

  function fixedUpdate() {
    if (state.phase !== "play") return;

    if (state.hitStop > 0) {
      state.hitStop -= 1;
      const pF = state.player;
      if (pF && pF.hitFlash > 0) pF.hitFlash -= DT * 0.35;
      for (const e of state.enemies) {
        if (e.hitFlash > 0) e.hitFlash -= DT * 0.35;
      }
      updateHUD();
      return;
    }

    const p = state.player;
    const mv = readMove();
    const speed = 165;
    p.vx = mv.x * speed;
    p.vy = mv.y * speed;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    const lim = ARENA - p.r;
    const d = Math.hypot(p.x, p.y);
    if (d > lim) {
      p.x = (p.x / d) * lim;
      p.y = (p.y / d) * lim;
    }

    const moving = Math.hypot(mv.x, mv.y) > 0.12;
    p.moving = moving;
    if (moving) p.facing = Math.atan2(mv.y, mv.x);
    advancePlayerAnim(p, DT);

    state.camX += (p.x * 0.22 - state.camX) * 0.08;
    state.camY += (p.y * 0.22 - state.camY) * 0.08;

    if (p.fireCd > 0) p.fireCd -= DT;
    if (p.invuln > 0) p.invuln -= DT;
    if (p.hitFlash > 0) p.hitFlash -= DT;
    if (p.recoil > 0) p.recoil -= DT * 4;
    else p.recoil = 0;
    p.scale += (1 - p.scale) * 0.22;

    const aim = readAim(p);
    if (aim.active && Math.hypot(aim.x, aim.y) > 0.05) {
      p.facing = Math.atan2(aim.y, aim.x);
      if (p.fireCd <= 0) {
        const len = Math.hypot(aim.x, aim.y) || 1;
        const dx = aim.x / len;
        const dy = aim.y / len;
        startPlayerAttack(p);
        p.recoil = 1;
        p.scale = 1.16;
        const muzzleX = p.x + dx * (p.r + 6);
        const muzzleY = p.y + dy * (p.r + 6);
        muzzleFlash(muzzleX, muzzleY, dx, dy);
        state.bullets.push({
          x: muzzleX, y: muzzleY,
          vx: dx * 420, vy: dy * 420,
          life: 0.9, r: 4,
        });
        p.fireCd = 0.14;
        state.shake = Math.max(state.shake, 1.6);
        state.flash = Math.max(state.flash, 0.035);
      }
    }

    if (state.toSpawn > 0) {
      state.spawnTimer -= DT;
      if (state.spawnTimer <= 0) {
        spawnEnemy();
        state.toSpawn--;
        state.spawnTimer = Math.max(0.25, 0.55 - state.wave * 0.03);
      }
    }

    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      b.life -= DT;
      if (b.life <= 0 || Math.hypot(b.x, b.y) > ARENA + 40) {
        state.bullets.splice(i, 1);
        continue;
      }
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        if (e.dying) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
          e.hp--;
          e.hitFlash = 0.14;
          e.hitPose = 0.12;
          e.deathFrame = 1; // hit cell
          e.squash = 0.55;
          e.scale = 1.35;
          const kblen = Math.hypot(b.vx, b.vy) || 1;
          e.kbX += (b.vx / kblen) * 160;
          e.kbY += (b.vy / kblen) * 160;
          state.bullets.splice(i, 1);
          burst(e.x, e.y, "#67e8f9", 7, 1);
          state.shake = Math.max(state.shake, 3.5);
          state.hitStop = Math.max(state.hitStop, 2);
          if (e.hp <= 0) killEnemy(e);
          break;
        }
      }
    }

    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];

      if (e.dying) {
        e.deathT -= DT;
        const t = 1 - e.deathT / e.deathMax;
        // hitdeath: 1=hit, 2..4=death, 5=poof
        e.deathFrame = Math.min(5, 1 + Math.floor(t * 5));
        e.alpha = Math.max(0, 1 - Math.max(0, t - 0.55) / 0.45);
        e.scale = 1.2 * (1 - t * 0.7);
        e.squash = 0.5 + t * 0.7;
        e.x += e.kbX * DT;
        e.y += e.kbY * DT;
        e.kbX *= 0.9;
        e.kbY *= 0.9;
        if (e.hitFlash > 0) e.hitFlash -= DT;
        if (e.deathT <= 0) state.enemies.splice(i, 1);
        continue;
      }

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      e.vx = (dx / dist) * e.speed;
      e.vy = (dy / dist) * e.speed;
      e.x += (e.vx + e.kbX) * DT;
      e.y += (e.vy + e.kbY) * DT;
      e.kbX *= 0.86;
      e.kbY *= 0.86;
      if (e.hitFlash > 0) e.hitFlash -= DT;
      if (e.hitPose > 0) e.hitPose -= DT;
      e.scale += (1 - e.scale) * 0.15;
      e.squash += (1 - e.squash) * 0.18;
      e.animT += DT;
      e.frame = Math.floor(e.animT * ENEMY_FPS) % 4;

      if (p.invuln <= 0 && dist < p.r + e.r - 2) {
        p.hp--;
        p.invuln = 0.7;
        p.hitFlash = 0.22;
        p.scale = 1.4;
        state.shake = 9;
        state.flash = 0.12;
        state.hitStop = Math.max(state.hitStop, 3);
        burst(p.x, p.y, "#d946ef", 10);
        p.x -= (dx / dist) * 10;
        p.y -= (dy / dist) * 10;
        if (p.hp <= 0) {
          state.phase = "dead";
          showOverlay("Downed", "Score " + state.score + " · Wave " + state.wave, "Retry");
        }
      }
    }

    if (
      state.toSpawn <= 0 &&
      state.enemies.length === 0 &&
      !state.cleared &&
      state.phase === "play"
    ) {
      state.cleared = true;
      state.score += 50 * state.wave;
      state.scorePop = 0.6;
      state.flash = 0.2;
      state.shake = 6;
      floatText(p.x, p.y - 24, "WAVE CLEAR", "#22d3ee");
      if (state.waveTimeout) clearTimeout(state.waveTimeout);
      state.waveTimeout = setTimeout(() => {
        state.waveTimeout = null;
        if (state.phase === "play") startWave(state.wave + 1);
      }, 700);
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.x += pt.vx * DT;
      pt.y += pt.vy * DT;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= DT;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floatTexts.length - 1; i >= 0; i--) {
      const ft = state.floatTexts[i];
      ft.y += ft.vy * DT;
      ft.life -= DT;
      if (ft.life <= 0) state.floatTexts.splice(i, 1);
    }

    if (state.shake > 0) state.shake *= 0.82;
    if (state.shake < 0.35) state.shake = 0;
    if (state.flash > 0) state.flash -= DT;
    if (state.scorePop > 0) state.scorePop -= DT;
    if (state.wavePop > 0) state.wavePop -= DT;

    updateHUD();
  }

  function drawPlayerSprite(p) {
    const drawScale = (p.r * 3.6) / CELL;
    const dx = -CELL * drawScale / 2;
    const dy = -CELL * drawScale / 2;
    let sheet = playerIdle;
    let frame = p.frame;
    if (p.anim === "attack" && playerAtk.ok) sheet = playerAtk;
    else if (p.anim === "walk" && playerWalk.ok) sheet = playerWalk;
    else if (playerIdle.ok) sheet = playerIdle;
    else {
      drawFallback(playerFb, dx, dy, CELL * drawScale);
      return;
    }
    if (!drawFrame(sheet, frame, dx, dy, drawScale)) {
      drawFallback(playerFb, dx, dy, CELL * drawScale);
    }
  }

  function drawEnemySprite(e) {
    const drawScale = (e.r * 2.8) / CELL;
    const dx = -CELL * drawScale / 2;
    const dy = -CELL * drawScale / 2;
    const kind = e.kind === "orb" ? "pod" : e.kind;

    if (e.dying || e.hitPose > 0) {
      const hd = enemyHitDeath[kind];
      const fr = e.dying ? e.deathFrame : 1;
      if (hd && hd.ok && drawFrame(hd, fr, dx, dy, drawScale)) return;
    }

    const sheet = enemySheets[kind];
    if (sheet && sheet.ok && drawFrame(sheet, e.frame, dx, dy, drawScale)) return;
    drawFallback(enemyFb[kind], dx, dy, CELL * drawScale);
  }

  function draw() {
    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = "#050510";
    ctx.fillRect(0, 0, viewW, viewH);

    let shx = 0, shy = 0;
    if (state.shake > 0) {
      shx = (Math.random() - 0.5) * state.shake;
      shy = (Math.random() - 0.5) * state.shake;
    }

    ctx.save();
    ctx.translate(viewW / 2 + shx - state.camX, viewH / 2 + shy - state.camY);

    ctx.beginPath();
    ctx.arc(0, 0, ARENA, 0, Math.PI * 2);
    ctx.fillStyle = "#0a0a20";
    ctx.fill();
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(34,211,238,0.14)";
    ctx.lineWidth = 1;
    for (let g = -ARENA; g <= ARENA; g += 40) {
      ctx.beginPath();
      ctx.moveTo(g, -ARENA);
      ctx.lineTo(g, ARENA);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-ARENA, g);
      ctx.lineTo(ARENA, g);
      ctx.stroke();
    }

    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const e of state.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const sx = e.scale * (2 - e.squash);
      const sy = e.scale * e.squash;
      ctx.scale(sx, sy);
      ctx.globalAlpha = e.dying ? e.alpha : (e.hitFlash > 0 ? 0.6 + 0.4 * Math.sin(e.hitFlash * 80) : 1);
      if (e.hitFlash > 0 && !e.dying) {
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 18;
      }
      drawEnemySprite(e);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    for (const b of state.bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy || 0, b.vx || 1));
      ctx.fillStyle = "#22d3ee";
      ctx.shadowColor = "#67e8f9";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.r * 2.4, b.r * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    const p = state.player;
    if (p) {
      ctx.save();
      const rcx = -Math.cos(p.facing) * p.recoil * 5;
      const rcy = -Math.sin(p.facing) * p.recoil * 5;
      ctx.translate(p.x + rcx, p.y + rcy);
      ctx.scale(p.scale, p.scale * (p.atkPlaying ? 0.94 : 1));
      ctx.rotate(p.facing);
      const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
      if (blink) ctx.globalAlpha = 0.35;
      if (p.hitFlash > 0) {
        ctx.shadowColor = "#e879f9";
        ctx.shadowBlur = 16;
      }
      drawPlayerSprite(p);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    for (const ft of state.floatTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life / ft.max);
      ctx.fillStyle = ft.color;
      ctx.font = "bold 14px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 4;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(34,211,238,${Math.min(0.28, state.flash * 2)})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  let acc = 0;
  let last = performance.now() / 1000;
  function frame(nowMs) {
    const now = nowMs / 1000;
    let frameTime = now - last;
    last = now;
    if (frameTime > MAX_FRAME) frameTime = MAX_FRAME;
    acc += frameTime;
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS) {
      fixedUpdate();
      acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;
    draw();
    requestAnimationFrame(frame);
  }

  showOverlay("Arena Clear", "Twin-stick roam & clear waves. Score for clears.", "Play");
  updateHUD();
  requestAnimationFrame(frame);
})();
