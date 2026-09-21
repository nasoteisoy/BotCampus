
  var heroImg = new Image();
  var heroReady = false;
  heroImg.onload = function () { heroReady = true; };
  heroImg.onerror = function () {
    heroImg.onerror = null;
    heroImg.src = './art/hero_silhouette.png';
  };
  heroImg.src = './art/player.png';

  var blobImg = new Image(); var blobOk = false;
  blobImg.onload = function () { blobOk = true; };
  blobImg.src = './art/enemy_blob.png';
  var blobAlt = new Image(); var blobAltOk = false;
  blobAlt.onload = function () { blobAltOk = true; };
  blobAlt.src = './art/enemy_blob_alt.png';

(function () {
  "use strict";

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const hudScore = document.getElementById("hudScore");
  const hudCombo = document.getElementById("hudCombo");
  const hudHp = document.getElementById("hudHp");
  const overlay = document.getElementById("overlay");
  const ovTitle = document.getElementById("ovTitle");
  const ovBody = document.getElementById("ovBody");
  const ovBtn = document.getElementById("ovBtn");

  const DT = 1 / 60;
  const MAX_FRAME = 0.05;
  const MAX_STEPS = 5;
  const GRAV = 2200;
  const WORLD_W = 2600;
  const GROUND = 0; // world y of floor (feet); +y is up
  const WIN_WAVES = 6;
  const COYOTE = 0.08;
  const JUMP_BUF = 0.1;
  const SLASH_ACTIVE = 0.25;
  const SLASH_CD = 0.35;
  const GUN_CD = 0.4;

  // Platforms: {x, y, w, h} — top surface at y (feet land here)
  const PLATFORMS = [
    { x: 420, y: 90, w: 140, h: 14 },
    { x: 780, y: 140, w: 120, h: 14 },
    { x: 1100, y: 90, w: 160, h: 14 },
    { x: 1480, y: 160, w: 110, h: 14 },
    { x: 1780, y: 100, w: 150, h: 14 },
    { x: 2100, y: 140, w: 130, h: 14 },
  ];

  const keys = Object.create(null);
  const pad = { left: false, right: false, jump: false, slash: false, gun: false };
  let jumpPressed = false;
  let slashPressed = false;
  let gunPressed = false;

  function bindHold(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        pad[key] = true;
        el.classList.add("held");
        try {
          el.setPointerCapture(e.pointerId);
        } catch (_) {}
        if (key === "jump") jumpPressed = true;
        if (key === "slash") slashPressed = true;
        if (key === "gun") gunPressed = true;
      },
      { passive: false }
    );
    function up() {
      pad[key] = false;
      el.classList.remove("held");
    }
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
  }
  bindHold("left", "left");
  bindHold("right", "right");
  bindHold("jump", "jump");
  bindHold("slash", "slash");
  bindHold("gun", "gun");

  window.addEventListener("keydown", (e) => {
    if (!keys[e.code]) {
      if (e.code === "Space" || e.code === "KeyW" || e.code === "ArrowUp") jumpPressed = true;
      if (e.code === "KeyJ" || e.code === "KeyK" || e.code === "KeyZ") slashPressed = true;
      if (e.code === "KeyL" || e.code === "KeyX" || e.code === "KeyF") gunPressed = true;
    }
    keys[e.code] = true;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  const state = {
    phase: "title", // title | play | win | dead
    score: 0,
    combo: 1,
    comboTimer: 0,
    wave: 1,
    shake: 0,
    flash: 0,
    camX: 0,
    player: null,
    enemies: [],
    bullets: [],
    particles: [],
    slash: null, // active slash hitbox
    spawnQueue: 0,
    spawnTimer: 0,
    wavePause: 0,
    cleared: false,
  };

  function makePlayer() {
    return {
      x: 120,
      y: GROUND,
      vx: 0,
      vy: 0,
      w: 26,
      h: 38,
      facing: 1,
      onGround: true,
      coyote: 0,
      jumpBuf: 0,
      hp: 4,
      maxHp: 4,
      ammo: 10,
      invuln: 0,
      hitFlash: 0,
      scale: 1,
      slashCd: 0,
      gunCd: 0,
      anim: 0,
    };
  }

  function resetRun() {
    state.score = 0;
    state.combo = 1;
    state.comboTimer = 0;
    state.wave = 1;
    state.shake = 0;
    state.flash = 0;
    state.camX = 0;
    state.player = makePlayer();
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.particles.length = 0;
    state.slash = null;
    state.wavePause = 0;
    state.cleared = false;
    startWave(1);
    state.phase = "play";
    overlay.classList.remove("show");
    updateHUD();
  }

  function startWave(n) {
    state.wave = n;
    state.spawnQueue = 3 + n * 2;
    state.spawnTimer = 0.35;
    state.cleared = false;
    state.wavePause = 0;
    if (state.player) {
      state.player.ammo = Math.min(16, state.player.ammo + 3);
    }
  }

  function spawnEnemy() {
    const p = state.player;
    const viewW = canvas.clientWidth || 360;
    const fromLeft = Math.random() < 0.5;
    const margin = 40 + Math.random() * 60;
    let x;
    if (fromLeft) {
      x = Math.max(20, state.camX - margin);
    } else {
      x = Math.min(WORLD_W - 20, state.camX + viewW + margin);
    }
    // Prefer near player band so fights stay on-screen
    if (Math.abs(x - p.x) > viewW * 0.9) {
      x = p.x + (fromLeft ? -1 : 1) * (viewW * 0.55 + Math.random() * 80);
      x = Math.max(20, Math.min(WORLD_W - 20, x));
    }
    const kind = Math.random() < 0.22 + state.wave * 0.03 ? "brute" : "runner";
    const onPlat = Math.random() < 0.25 && PLATFORMS.length;
    let y = GROUND;
    if (onPlat) {
      const pl = PLATFORMS[(Math.random() * PLATFORMS.length) | 0];
      y = pl.y;
      x = pl.x + 20 + Math.random() * Math.max(10, pl.w - 40);
    }
    state.enemies.push({
      x,
      y,
      vx: 0,
      vy: 0,
      w: kind === "brute" ? 34 : 24,
      h: kind === "brute" ? 46 : 34,
      hp: kind === "brute" ? 2 + Math.floor(state.wave / 3) : 1,
      kind,
      speed: (kind === "brute" ? 55 : 95) + state.wave * 4,
      hitFlash: 0,
      scale: 1,
      hurtCd: 0,
      onGround: true,
    });
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 160;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.25 + Math.random() * 0.35,
        max: 0.6,
        color,
        r: 2 + Math.random() * 3,
      });
    }
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

  function wantLeft() {
    return pad.left || keys["KeyA"] || keys["ArrowLeft"];
  }
  function wantRight() {
    return pad.right || keys["KeyD"] || keys["ArrowRight"];
  }
  function wantJump() {
    return pad.jump || keys["KeyW"] || keys["ArrowUp"] || keys["Space"];
  }
  function wantSlash() {
    return pad.slash || keys["KeyJ"] || keys["KeyK"] || keys["KeyZ"];
  }
  function wantGun() {
    return pad.gun || keys["KeyL"] || keys["KeyX"] || keys["KeyF"];
  }

  function floorScreenY(viewH) {
    // Keep floor above the on-screen pad
    return viewH * 0.58;
  }

  function worldToScreen(wx, wy, viewH) {
    const floorY = floorScreenY(viewH);
    return { x: wx - state.camX, y: floorY - wy };
  }

  function updateHUD() {
    const p = state.player;
    hudScore.textContent = "Score " + state.score + " · W" + state.wave;
    hudCombo.textContent =
      "Combo x" + state.combo + (p ? " · Ammo " + p.ammo : "");
    hudHp.textContent = "HP " + (p ? p.hp : 0);
  }

  function showOverlay(title, body, btn) {
    ovTitle.textContent = title;
    ovBody.textContent = body;
    ovBtn.textContent = btn || "Again";
    overlay.classList.add("show");
  }
  ovBtn.addEventListener("click", resetRun);

  function solidAt(feetX, feetY, w) {
    // Ground
    if (feetY <= GROUND + 0.5) return { y: GROUND, kind: "ground" };
    // Platforms (land on top only)
    const half = w * 0.45;
    for (const pl of PLATFORMS) {
      if (feetX + half > pl.x && feetX - half < pl.x + pl.w) {
        if (feetY >= pl.y - 6 && feetY <= pl.y + 10) {
          return { y: pl.y, kind: "plat" };
        }
      }
    }
    return null;
  }

  function damageEnemy(e, dmg, melee) {
    e.hp -= dmg;
    e.hitFlash = 0.12;
    e.scale = 1.35;
    e.hurtCd = 0.18;
    const knock = (state.player.facing || 1) * (melee ? 140 : 60);
    e.vx = knock;
    burst(e.x, e.y + e.h * 0.5, melee ? "#e9d5ff" : "#67e8f9", 6);
    state.shake = Math.max(state.shake, melee ? 5 : 3);
    if (e.hp <= 0) {
      const pts = (e.kind === "brute" ? 28 : 12) * state.combo;
      state.score += pts;
      state.combo = Math.min(12, state.combo + 1);
      state.comboTimer = 2.4;
      burst(e.x, e.y + e.h * 0.5, "#f472b6", 14);
      state.flash = 0.1;
      state.shake = Math.max(state.shake, 8);
      const idx = state.enemies.indexOf(e);
      if (idx >= 0) state.enemies.splice(idx, 1);
    }
  }

  function hurtPlayer(n) {
    const p = state.player;
    if (p.invuln > 0) return;
    p.hp -= n;
    p.invuln = 0.85;
    p.hitFlash = 0.2;
    p.scale = 1.35;
    p.vx = -p.facing * 200;
    p.vy = 280;
    state.shake = 12;
    state.flash = 0.15;
    burst(p.x, p.y + p.h * 0.5, "#ef4444", 10);
    state.combo = 1;
    state.comboTimer = 0;
    if (p.hp <= 0) {
      state.phase = "dead";
      showOverlay("Cut Down", "Score " + state.score + " · Wave " + state.wave, "Retry");
    }
  }

  function applySlashHits(p) {
    const s = state.slash;
    if (!s) return;
    const reach = 54;
    const hx = p.x + s.facing * (p.w * 0.2 + reach * 0.5);
    const hy = p.y + p.h * 0.45;
    const hw = reach;
    const hh = 44;
    for (const e of state.enemies) {
      if (s.hitSet.has(e)) continue;
      const ex = e.x;
      const ey = e.y + e.h * 0.5;
      if (Math.abs(ex - hx) < hw * 0.5 + e.w * 0.4 && Math.abs(ey - hy) < hh * 0.5 + e.h * 0.4) {
        if ((ex - p.x) * s.facing >= -8) {
          s.hitSet.add(e);
          damageEnemy(e, 1, true);
        }
      }
    }
  }

  function fixedUpdate() {
    if (state.phase !== "play") {
      jumpPressed = false;
      slashPressed = false;
      gunPressed = false;
      return;
    }
    const p = state.player;
    const viewW = canvas.clientWidth;

    // --- move ---
    let ax = 0;
    if (wantLeft()) ax -= 1;
    if (wantRight()) ax += 1;
    const maxSp = 220;
    const accel = p.onGround ? 1800 : 1000;
    if (ax !== 0) {
      p.vx += ax * accel * DT;
      p.facing = ax > 0 ? 1 : -1;
      p.anim += DT * 12;
    } else {
      p.vx *= p.onGround ? 0.72 : 0.94;
      if (Math.abs(p.vx) < 10) p.vx = 0;
    }
    if (p.vx > maxSp) p.vx = maxSp;
    if (p.vx < -maxSp) p.vx = -maxSp;

    // jump buffer / coyote
    if (jumpPressed || wantJump()) {
      if (jumpPressed) p.jumpBuf = JUMP_BUF;
    }
    jumpPressed = false;
    if (!wantJump()) {
      // allow cut jump
      if (p.vy > 120) p.vy *= 0.96;
    }
    p.jumpBuf = Math.max(0, p.jumpBuf - DT);
    if (p.onGround) p.coyote = COYOTE;
    else p.coyote = Math.max(0, p.coyote - DT);

    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = 520;
      p.onGround = false;
      p.coyote = 0;
      p.jumpBuf = 0;
      p.scale = 1.12;
    }

    p.vy -= GRAV * DT;
    p.x += p.vx * DT;
    p.y += p.vy * DT;

    if (p.x < 30) {
      p.x = 30;
      p.vx = 0;
    }
    if (p.x > WORLD_W - 30) {
      p.x = WORLD_W - 30;
      p.vx = 0;
    }

    // ground / platform resolve (feet)
    p.onGround = false;
    if (p.vy <= 0) {
      const hit = solidAt(p.x, p.y, p.w);
      if (hit) {
        p.y = hit.y;
        p.vy = 0;
        p.onGround = true;
      }
    }
    if (p.y < GROUND) {
      p.y = GROUND;
      p.vy = 0;
      p.onGround = true;
    }

    if (p.slashCd > 0) p.slashCd -= DT;
    if (p.gunCd > 0) p.gunCd -= DT;
    if (p.invuln > 0) p.invuln -= DT;
    if (p.hitFlash > 0) p.hitFlash -= DT;
    p.scale += (1 - p.scale) * 0.2;

    // --- slash (primary) ---
    const slashEdge = slashPressed || (wantSlash() && !state.slash && p.slashCd <= 0);
    slashPressed = false;
    if (slashEdge && p.slashCd <= 0 && !state.slash) {
      p.slashCd = SLASH_CD;
      p.scale = 1.22;
      state.shake = Math.max(state.shake, 4);
      state.flash = 0.05;
      state.slash = {
        life: SLASH_ACTIVE,
        max: SLASH_ACTIVE,
        facing: p.facing,
        hitSet: new Set(),
      };
      applySlashHits(p);
    }
    if (state.slash) {
      applySlashHits(p);
      state.slash.life -= DT;
      if (state.slash.life <= 0) state.slash = null;
    }

    // --- gun (alt) ---
    const gunEdge = gunPressed || wantGun();
    gunPressed = false;
    if (gunEdge && p.gunCd <= 0 && p.ammo > 0) {
      p.gunCd = GUN_CD;
      p.ammo--;
      p.scale = 1.08;
      state.flash = 0.04;
      state.bullets.push({
        x: p.x + p.facing * (p.w * 0.5 + 6),
        y: p.y + p.h * 0.55,
        vx: p.facing * 540,
        life: 0.75,
        r: 4,
      });
      burst(p.x + p.facing * 18, p.y + p.h * 0.55, "#67e8f9", 3);
    }

    // bullets
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.x += b.vx * DT;
      b.life -= DT;
      if (b.life <= 0 || b.x < state.camX - 40 || b.x > state.camX + viewW + 40) {
        state.bullets.splice(i, 1);
        continue;
      }
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        if (
          Math.abs(b.x - e.x) < e.w * 0.5 + b.r &&
          Math.abs(b.y - (e.y + e.h * 0.5)) < e.h * 0.5 + b.r
        ) {
          damageEnemy(e, 1, false);
          state.bullets.splice(i, 1);
          break;
        }
      }
    }

    // enemies
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      if (e.hurtCd > 0) e.hurtCd -= DT;
      if (e.hitFlash > 0) e.hitFlash -= DT;
      e.scale += (1 - e.scale) * 0.15;

      const dir = p.x < e.x ? -1 : 1;
      if (e.hurtCd <= 0) {
        e.vx = dir * e.speed;
      } else {
        e.vx *= 0.9;
      }
      e.x += e.vx * DT;
      e.vy -= GRAV * DT;
      e.y += e.vy * DT;

      e.onGround = false;
      if (e.vy <= 0) {
        const hit = solidAt(e.x, e.y, e.w);
        if (hit) {
          e.y = hit.y;
          e.vy = 0;
          e.onGround = true;
        }
      }
      if (e.y < GROUND) {
        e.y = GROUND;
        e.vy = 0;
        e.onGround = true;
      }

      // contact damage
      if (
        p.invuln <= 0 &&
        Math.abs(p.x - e.x) < (p.w + e.w) * 0.38 &&
        Math.abs(p.y + p.h * 0.5 - (e.y + e.h * 0.5)) < (p.h + e.h) * 0.38
      ) {
        hurtPlayer(1);
      }

      // cull far
      if (e.x < state.camX - 280 || e.x > state.camX + viewW + 280) {
        // keep if still in spawn queue era — only cull if wave settled
        if (state.spawnQueue <= 0) {
          // soft cull behind camera a lot
          if (e.x < state.camX - 320) state.enemies.splice(i, 1);
        }
      }
    }

    // wave spawn
    if (state.wavePause > 0) {
      state.wavePause -= DT;
      if (state.wavePause <= 0 && state.phase === "play") {
        if (state.wave >= WIN_WAVES) {
          state.phase = "win";
          showOverlay(
            "Corridor Cleared!",
            "Score " + state.score + " · " + WIN_WAVES + " waves",
            "Again"
          );
        } else {
          startWave(state.wave + 1);
        }
      }
    } else if (state.spawnQueue > 0) {
      state.spawnTimer -= DT;
      if (state.spawnTimer <= 0) {
        spawnEnemy();
        state.spawnQueue--;
        state.spawnTimer = Math.max(0.28, 0.7 - state.wave * 0.05);
      }
    } else if (
      state.enemies.length === 0 &&
      !state.cleared &&
      state.phase === "play"
    ) {
      state.cleared = true;
      state.score += 40 * state.wave;
      state.flash = 0.18;
      state.shake = 7;
      state.wavePause = 1.1;
    }

    // combo decay
    if (state.comboTimer > 0) {
      state.comboTimer -= DT;
      if (state.comboTimer <= 0) state.combo = 1;
    }

    // camera follow X with clamps
    const target = p.x - viewW * 0.38;
    state.camX += (target - state.camX) * 0.14;
    const maxCam = Math.max(0, WORLD_W - viewW);
    if (state.camX < 0) state.camX = 0;
    if (state.camX > maxCam) state.camX = maxCam;

    // particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.x += pt.vx * DT;
      pt.y += pt.vy * DT;
      pt.vy -= 500 * DT;
      pt.life -= DT;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }

    if (state.shake > 0) state.shake *= 0.85;
    if (state.shake < 0.2) state.shake = 0;
    if (state.flash > 0) state.flash -= DT;

    updateHUD();
  }

  function draw() {
    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    ctx.clearRect(0, 0, viewW, viewH);

    let shx = 0,
      shy = 0;
    if (state.shake > 0) {
      shx = (Math.random() - 0.5) * state.shake;
      shy = (Math.random() - 0.5) * state.shake;
    }

    const floorY = floorScreenY(viewH);

    // sky / bg
    ctx.fillStyle = "#e9d5ff";
    ctx.fillRect(0, 0, viewW, viewH);
    // parallax silhouettes
    ctx.fillStyle = "#ddd6fe";
    for (let i = 0; i < 10; i++) {
      const bw = 60 + (i % 3) * 20;
      const bh = 100 + (i % 4) * 40;
      const bx =
        ((i * 200 - state.camX * 0.25) % (viewW + 220)) - 60 + shx * 0.25;
      ctx.fillRect(bx, floorY - bh, bw, bh);
    }

    ctx.save();
    ctx.translate(shx, shy);

    // ground fill (screen-space strip)
    ctx.fillStyle = "#c4b5a0";
    ctx.fillRect(0, floorY, viewW, viewH - floorY + 20);
    ctx.fillStyle = "#a8a29e";
    ctx.fillRect(0, floorY, viewW, 5);

    // world-space marks / platforms / entities
    ctx.save();
    ctx.translate(-state.camX, 0);

    // floor tick marks
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < WORLD_W; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, floorY);
      ctx.lineTo(x, floorY + 28);
      ctx.stroke();
    }

    // platforms
    for (const pl of PLATFORMS) {
      const top = floorY - pl.y;
      ctx.fillStyle = "#fda4af";
      ctx.fillRect(pl.x, top, pl.w, pl.h);
      ctx.fillStyle = "#f9a8d4";
      ctx.fillRect(pl.x, top, pl.w, 3);
    }

    // wave banner hint
    ctx.fillStyle = "rgba(192,132,252,0.15)";
    ctx.font = "bold 14px system-ui,sans-serif";
    ctx.fillText("Wave " + state.wave + " / " + WIN_WAVES, state.camX + 12, floorY - 200);

    // particles
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, floorY - pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // enemies
    for (const e of state.enemies) {
      const ey = floorY - e.y;
      const face = e.x < (state.player ? state.player.x : e.x) ? 1 : -1;
      ctx.save();
      ctx.translate(e.x, ey);
      ctx.scale(face * e.scale, e.scale);
      ctx.fillStyle = e.hitFlash > 0 ? "#fff" : e.kind === "brute" ? "#78350f" : "#ec4899";
      const bimg = (e.kind === "brute" || (e.id|0) % 2) ? blobAlt : blobImg;
      const bok = (e.kind === "brute" || (e.id|0) % 2) ? blobAltOk : blobOk;
      if (bok) {
        const s = Math.max(e.w, e.h) * 1.35;
        if (e.hitFlash > 0) ctx.globalAlpha = 0.9;
        ctx.drawImage(bimg, -s/2, -s*0.95, s, s);
        ctx.globalAlpha = 1;
      } else {
        ctx.beginPath(); ctx.ellipse(0, -e.h/2, e.w/2, e.h/2, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "#450a0a";
        ctx.fillRect(-e.w * 0.15, -e.h * 0.75, e.w * 0.35, e.h * 0.2);
        ctx.fillStyle = e.kind === "brute" ? "#7f1d1d" : "#881337";
        ctx.fillRect(-e.w * 0.35, -4, e.w * 0.25, 8);
        ctx.fillRect(e.w * 0.1, -4, e.w * 0.25, 8);
      }
      ctx.restore();
    }

    // bullets
    for (const b of state.bullets) {
      ctx.fillStyle = "#67e8f9";
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(b.x, floorY - b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // slash arc
    if (state.slash && state.player) {
      const p = state.player;
      const a = state.slash.life / state.slash.max;
      const sx = p.x + state.slash.facing * (p.w * 0.3 + 20);
      const sy = floorY - (p.y + p.h * 0.5);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(state.slash.facing, 1);
      ctx.globalAlpha = Math.min(1, a * 1.4);
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 26 + (1 - a) * 18, -1.15, 1.15);
      ctx.stroke();
      ctx.strokeStyle = "rgba(254,240,138,0.55)";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + (1 - a) * 12, -0.9, 0.9);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // player — whimsy stubby hero stamp (STYLE_LOCK B)
    const p = state.player;
    if (p) {
      const py = floorY - p.y;
      ctx.save();
      ctx.translate(p.x, py);
      ctx.scale(p.facing * p.scale, p.scale);
      const blink = p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0;
      if (blink) ctx.globalAlpha = 0.4;
      if (typeof heroReady !== "undefined" && heroReady) {
        const s = Math.max(p.w, p.h) * 2.2;
        ctx.drawImage(heroImg, -s * 0.42, -s * 0.98, s, s);
      } else {
        ctx.fillStyle = p.hitFlash > 0 ? "#fff" : "#166534";
        ctx.beginPath();
        ctx.roundRect(-p.w / 2, -p.h, p.w, p.h, 8);
        ctx.fill();
        ctx.fillStyle = "#fde68a";
        ctx.beginPath();
        ctx.arc(0, -p.h * 0.72, p.w * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }


    if (state.combo > 1 && state.player) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, state.comboTimer / 2);
      ctx.fillStyle = "#e9d5ff";
      ctx.font = "bold 22px system-ui,sans-serif";
      ctx.textAlign = "center";
      const scr = worldToScreen(state.player.x, state.player.y + state.player.h + 20, viewH);
      ctx.fillText("x" + state.combo, scr.x + shx, scr.y + shy);
      ctx.restore();
    }
  }

  // fixed-dt loop
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

  showOverlay(
    "Corridor Slash",
    "Run, jump, slash (primary) & gun. Clear " + WIN_WAVES + " waves.",
    "Play"
  );
  updateHUD();
  requestAnimationFrame(frame);
})();
