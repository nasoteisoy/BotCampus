  function loadImg(src) {
    var im = new Image();
    im.ok = false;
    im.onload = function () { im.ok = true; };
    im.onerror = function () { im.ok = false; };
    im.src = src;
    return im;
  }
  var heroImg = loadImg('./art/player.png?v=opt8');
  var heroImg2 = loadImg('./art/player_f2.png?v=opt8');
  var blobImg = loadImg('./art/enemy_blob.png?v=opt8');
  var blobAlt = loadImg('./art/enemy_blob_alt.png?v=opt8');

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
  // Slash phases (fixed-dt): windup → active → recovery
  const SLASH_WIND = 0.06;   // ~3.6 frames
  const SLASH_ACTIVE = 0.12; // ~7 frames contact window
  const SLASH_RECOV = 0.14;
  const SLASH_TOTAL = SLASH_WIND + SLASH_ACTIVE + SLASH_RECOV;
  const SLASH_CD = 0.32;
  const GUN_CD = 0.4;
  const MAX_PARTICLES = 80;
  const HITSTOP_FRAMES = 3; // ~50ms at 60fps

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
    camPunch: 0, // brief X offset toward impact; decays
    hitstop: 0, // fixed frames remaining
    player: null,
    enemies: [],
    bullets: [],
    particles: [],
    floats: [], // rising damage / combo pops
    slash: null, // active slash hitbox / phases
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
      sx: 1, // squash/stretch X
      sy: 1,
      slashCd: 0,
      gunCd: 0,
      anim: 0,
      landDust: false,
      wasOnGround: true,
      windFlash: 0,
      bob: 0,
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
    state.camPunch = 0;
    state.hitstop = 0;
    state.player = makePlayer();
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.particles.length = 0;
    state.floats.length = 0;
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
      sx: 1,
      sy: 1,
      hurtCd: 0,
      stun: 0,
      onGround: true,
      dying: 0, // >0 = death poof/flatten in progress
      dead: false,
    });
  }

  function trimParticles() {
    while (state.particles.length > MAX_PARTICLES) {
      state.particles.shift();
    }
  }

  function burst(x, y, color, n, opts) {
    opts = opts || {};
    const grav = opts.grav != null ? opts.grav : 500;
    const spread = opts.spread != null ? opts.spread : Math.PI * 2;
    const baseA = opts.angle != null ? opts.angle : 0;
    const spMin = opts.spMin != null ? opts.spMin : 50;
    const spMax = opts.spMax != null ? opts.spMax : 210;
    const lifeMin = opts.lifeMin != null ? opts.lifeMin : 0.22;
    const lifeMax = opts.lifeMax != null ? opts.lifeMax : 0.55;
    const rMin = opts.rMin != null ? opts.rMin : 2;
    const rMax = opts.rMax != null ? opts.rMax : 4.5;
    const kind = opts.kind || "dot";
    for (let i = 0; i < n; i++) {
      const a = baseA + (Math.random() - 0.5) * spread;
      const sp = spMin + Math.random() * (spMax - spMin);
      const life = lifeMin + Math.random() * (lifeMax - lifeMin);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        color,
        r: rMin + Math.random() * (rMax - rMin),
        grav,
        kind,
      });
    }
    trimParticles();
  }

  function sparks(x, y, facing) {
    burst(x, y, "#fef08a", 7, {
      angle: facing > 0 ? 0 : Math.PI,
      spread: 1.4,
      spMin: 120,
      spMax: 280,
      grav: 200,
      lifeMin: 0.12,
      lifeMax: 0.28,
      rMin: 1.5,
      rMax: 3,
      kind: "spark",
    });
    burst(x, y, "#fff", 4, {
      angle: facing > 0 ? 0 : Math.PI,
      spread: 1.0,
      spMin: 80,
      spMax: 180,
      grav: 100,
      lifeMin: 0.08,
      lifeMax: 0.18,
      rMin: 1,
      rMax: 2,
      kind: "spark",
    });
  }

  function icingCrumb(x, y) {
    const colors = ["#f9a8d4", "#fda4af", "#fbcfe8", "#fef3c7", "#fff"];
    for (let i = 0; i < 12; i++) {
      const c = colors[(Math.random() * colors.length) | 0];
      burst(x, y, c, 1, {
        angle: -Math.PI / 2,
        spread: Math.PI,
        spMin: 40,
        spMax: 180,
        grav: 700,
        lifeMin: 0.35,
        lifeMax: 0.7,
        rMin: 2,
        rMax: 5,
        kind: Math.random() < 0.5 ? "crumb" : "icing",
      });
    }
    burst(x, y, "#f472b6", 6, {
      angle: -Math.PI / 2,
      spread: Math.PI * 1.6,
      spMin: 60,
      spMax: 160,
      grav: 400,
      lifeMin: 0.2,
      lifeMax: 0.4,
      kind: "poof",
    });
  }

  function muzzlePuff(x, y, facing) {
    burst(x, y, "#a5f3fc", 5, {
      angle: facing > 0 ? 0 : Math.PI,
      spread: 0.9,
      spMin: 40,
      spMax: 120,
      grav: -40,
      lifeMin: 0.1,
      lifeMax: 0.22,
      rMin: 2,
      rMax: 5,
      kind: "puff",
    });
    burst(x, y, "#67e8f9", 3, {
      angle: facing > 0 ? 0 : Math.PI,
      spread: 0.5,
      spMin: 100,
      spMax: 200,
      grav: 0,
      lifeMin: 0.06,
      lifeMax: 0.12,
      rMin: 1,
      rMax: 2.5,
      kind: "spark",
    });
  }

  function landDust(x, y) {
    burst(x, y + 2, "#d6d3d1", 6, {
      angle: -Math.PI / 2,
      spread: Math.PI * 0.9,
      spMin: 30,
      spMax: 90,
      grav: 200,
      lifeMin: 0.15,
      lifeMax: 0.35,
      rMin: 2,
      rMax: 4,
      kind: "dust",
    });
  }

  function slashTrail(p, facing) {
    const baseX = p.x + facing * (p.w * 0.3 + 18);
    const baseY = p.y + p.h * 0.5;
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * 1.1 - 0.55;
      const ox = facing * (8 + i * 7);
      const oy = Math.sin(t) * 18;
      state.particles.push({
        x: baseX + ox,
        y: baseY + oy,
        vx: facing * (20 + Math.random() * 40),
        vy: (Math.random() - 0.5) * 40,
        life: 0.12 + Math.random() * 0.1,
        max: 0.22,
        color: i % 2 ? "#facc15" : "#fef9c3",
        r: 2 + Math.random() * 2,
        grav: 80,
        kind: "trail",
      });
    }
    trimParticles();
  }

  function addFloat(x, y, text, color) {
    state.floats.push({
      x,
      y,
      vy: 60 + Math.random() * 30,
      life: 0.7,
      max: 0.7,
      text,
      color: color || "#fef08a",
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
    return viewH * 0.58;
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
    if (feetY <= GROUND + 0.5) return { y: GROUND, kind: "ground" };
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

  function shapedShake(amt) {
    // Light/short — only call on hit/kill. Peak then falloff via *=0.78 each frame.
    state.shake = Math.max(state.shake, amt);
  }

  function punchCam(dir, amt) {
    state.camPunch += dir * amt;
    if (state.camPunch > 18) state.camPunch = 18;
    if (state.camPunch < -18) state.camPunch = -18;
  }

  function damageEnemy(e, dmg, melee) {
    if (e.dying > 0 || e.dead) return;
    e.hp -= dmg;
    // SAME FRAME flash + particles as damage
    e.hitFlash = 0.14;
    e.sx = melee ? 1.45 : 1.25;
    e.sy = melee ? 0.7 : 0.82;
    e.scale = 1.2;
    e.hurtCd = 0.22;
    e.stun = melee ? 0.18 : 0.1;
    const face = state.player ? state.player.facing || 1 : 1;
    const knock = face * (melee ? 220 : 110);
    e.vx = knock;
    e.vy = Math.max(e.vy, melee ? 160 : 80);

    if (melee) {
      sparks(e.x, e.y + e.h * 0.55, face);
      burst(e.x, e.y + e.h * 0.5, "#e9d5ff", 5, {
        angle: face > 0 ? 0 : Math.PI,
        spread: 1.2,
        spMin: 60,
        spMax: 160,
      });
      state.hitstop = Math.max(state.hitstop, HITSTOP_FRAMES);
      shapedShake(4.5);
      punchCam(face, 7);
    } else {
      burst(e.x, e.y + e.h * 0.5, "#67e8f9", 5, {
        angle: face > 0 ? 0 : Math.PI,
        spread: 1.0,
        spMin: 50,
        spMax: 140,
      });
      shapedShake(2.5);
      punchCam(face, 3);
    }

    addFloat(e.x, e.y + e.h + 8, "-" + dmg, melee ? "#fef08a" : "#a5f3fc");

    if (e.hp <= 0) {
      const pts = (e.kind === "brute" ? 28 : 12) * state.combo;
      state.score += pts;
      state.combo = Math.min(12, state.combo + 1);
      state.comboTimer = 2.4;
      // Death poof/flatten — do NOT invisible-remove
      e.dying = 0.28;
      e.sx = 1.6;
      e.sy = 0.35;
      e.vx *= 0.4;
      e.vy = 40;
      icingCrumb(e.x, e.y + e.h * 0.4);
      state.flash = Math.max(state.flash, 0.08);
      shapedShake(6);
      punchCam(face, 10);
      addFloat(e.x, e.y + e.h + 18, "+" + pts, "#f9a8d4");
      if (state.combo > 1) {
        addFloat(e.x + 10, e.y + e.h + 34, "x" + state.combo, "#e9d5ff");
      }
    }
  }

  function hurtPlayer(n) {
    const p = state.player;
    if (p.invuln > 0) return;
    p.hp -= n;
    p.invuln = 0.85;
    p.hitFlash = 0.2;
    p.sx = 1.35;
    p.sy = 0.75;
    p.vx = -p.facing * 200;
    p.vy = 280;
    shapedShake(8);
    state.flash = 0.12;
    burst(p.x, p.y + p.h * 0.5, "#ef4444", 10);
    state.combo = 1;
    state.comboTimer = 0;
    if (p.hp <= 0) {
      state.phase = "dead";
      showOverlay("Cut Down", "Score " + state.score + " · Wave " + state.wave, "Retry");
    }
  }

  function slashPhase(s) {
    const elapsed = s.max - s.life;
    if (elapsed < SLASH_WIND) return "wind";
    if (elapsed < SLASH_WIND + SLASH_ACTIVE) return "active";
    return "recov";
  }

  function applySlashHits(p) {
    const s = state.slash;
    if (!s) return;
    if (slashPhase(s) !== "active") return;
    const reach = 62;
    const hx = p.x + s.facing * (p.w * 0.2 + reach * 0.5);
    const hy = p.y + p.h * 0.45;
    const hw = reach;
    const hh = 48;
    let any = false;
    for (const e of state.enemies) {
      if (e.dying > 0 || e.dead) continue;
      if (s.hitSet.has(e)) continue;
      const ex = e.x;
      const ey = e.y + e.h * 0.5;
      if (Math.abs(ex - hx) < hw * 0.5 + e.w * 0.4 && Math.abs(ey - hy) < hh * 0.5 + e.h * 0.4) {
        if ((ex - p.x) * s.facing >= -8) {
          s.hitSet.add(e);
          // impact on contact frame — flash/particles inside damageEnemy same frame
          damageEnemy(e, 1, true);
          any = true;
        }
      }
    }
    if (any && !s.trailed) {
      slashTrail(p, s.facing);
      s.trailed = true;
    }
  }

  function fixedUpdate() {
    if (state.phase !== "play") {
      jumpPressed = false;
      slashPressed = false;
      gunPressed = false;
      return;
    }

    // Hitstop: freeze sim for 2–4 fixed frames on solid hit (mute-safe)
    if (state.hitstop > 0) {
      state.hitstop--;
      // Still decay visual flash timers lightly so UI stays alive
      if (state.player && state.player.hitFlash > 0) state.player.hitFlash -= DT;
      for (const e of state.enemies) {
        if (e.hitFlash > 0) e.hitFlash -= DT;
      }
      jumpPressed = false;
      slashPressed = false;
      gunPressed = false;
      return;
    }

    const p = state.player;
    const viewW = canvas.clientWidth;

    // --- move (accel/friction — anti sticker-slide) ---
    let ax = 0;
    if (wantLeft()) ax -= 1;
    if (wantRight()) ax += 1;
    const maxSp = 220;
    const accel = p.onGround ? 2000 : 1100;
    const friction = p.onGround ? 0.78 : 0.94;
    // During slash recovery, slight move lock for grounded feel
    const inSlash = !!state.slash;
    const phase = inSlash ? slashPhase(state.slash) : null;
    if (phase === "wind" || phase === "active") {
      // keep facing; damp horizontal a bit during swing
      p.vx *= 0.92;
    } else if (ax !== 0) {
      p.vx += ax * accel * DT;
      p.facing = ax > 0 ? 1 : -1;
      // Walk anim ONLY while |vx| meaningful
      if (Math.abs(p.vx) > 35) p.anim += DT * 12;
    } else {
      p.vx *= friction;
      if (Math.abs(p.vx) < 12) p.vx = 0;
    }
    if (p.vx > maxSp) p.vx = maxSp;
    if (p.vx < -maxSp) p.vx = -maxSp;

    // Walk bob only while moving on ground
    if (p.onGround && Math.abs(p.vx) > 40) {
      p.bob += DT * 14;
    } else {
      p.bob *= 0.85;
    }

    // jump buffer / coyote
    if (jumpPressed || wantJump()) {
      if (jumpPressed) p.jumpBuf = JUMP_BUF;
    }
    jumpPressed = false;
    if (!wantJump()) {
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
      p.sx = 0.82;
      p.sy = 1.18;
    }

    p.vy -= GRAV * DT;
    p.x += p.vx * DT;
    p.x = Math.max(40, Math.min(WORLD_W - 40, p.x));
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
    p.wasOnGround = p.onGround;
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

    // Landing dust + squash
    if (p.onGround && !p.wasOnGround) {
      p.sx = 1.28;
      p.sy = 0.72;
      landDust(p.x, p.y);
    }

    if (p.slashCd > 0) p.slashCd -= DT;
    if (p.gunCd > 0) p.gunCd -= DT;
    if (p.invuln > 0) p.invuln -= DT;
    if (p.hitFlash > 0) p.hitFlash -= DT;
    if (p.windFlash > 0) p.windFlash -= DT;
    p.scale += (1 - p.scale) * 0.22;
    p.sx += (1 - p.sx) * 0.22;
    p.sy += (1 - p.sy) * 0.22;

    // --- slash: windup → active (impact) → recovery ---
    const slashEdge = slashPressed || (wantSlash() && !state.slash && p.slashCd <= 0);
    slashPressed = false;
    if (slashEdge && p.slashCd <= 0 && !state.slash) {
      p.slashCd = SLASH_CD;
      p.windFlash = SLASH_WIND;
      p.sx = 0.88;
      p.sy = 1.12;
      // brief lunge impulse (not teleport) — damps via friction
      p.vx += p.facing * 160;
      if (p.vx > maxSp + 40) p.vx = maxSp + 40;
      if (p.vx < -(maxSp + 40)) p.vx = -(maxSp + 40);
      state.slash = {
        life: SLASH_TOTAL,
        max: SLASH_TOTAL,
        facing: p.facing,
        hitSet: new Set(),
        trailed: false,
        impactFlash: false,
      };
    }
    if (state.slash) {
      const ph = slashPhase(state.slash);
      if (ph === "active") {
        if (!state.slash.impactFlash) {
          state.slash.impactFlash = true;
          state.flash = Math.max(state.flash, 0.035);
          p.sx = 1.15;
          p.sy = 0.9;
          slashTrail(p, state.slash.facing);
        }
        applySlashHits(p);
      }
      state.slash.life -= DT;
      if (state.slash.life <= 0) state.slash = null;
    }

    // --- gun (alt) ---
    const gunEdge = gunPressed || wantGun();
    gunPressed = false;
    if (gunEdge && p.gunCd <= 0 && p.ammo > 0 && !state.slash) {
      p.gunCd = GUN_CD;
      p.ammo--;
      p.sx = 1.1;
      p.sy = 0.92;
      state.flash = Math.max(state.flash, 0.03);
      const mx = p.x + p.facing * (p.w * 0.5 + 6);
      const my = p.y + p.h * 0.55;
      state.bullets.push({
        x: mx,
        y: my,
        vx: p.facing * 540,
        life: 0.75,
        r: 4,
      });
      muzzlePuff(mx, my, p.facing);
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
        if (e.dying > 0 || e.dead) continue;
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

    // enemies — accel + friction (no ice-skate)
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];

      if (e.dying > 0) {
        e.dying -= DT;
        e.sx += (1.7 - e.sx) * 0.15;
        e.sy += (0.25 - e.sy) * 0.2;
        e.vx *= 0.85;
        e.x += e.vx * DT;
        if (e.dying <= 0) {
          state.enemies.splice(i, 1);
        }
        continue;
      }

      if (e.hurtCd > 0) e.hurtCd -= DT;
      if (e.stun > 0) e.stun -= DT;
      if (e.hitFlash > 0) e.hitFlash -= DT;
      e.scale += (1 - e.scale) * 0.18;
      e.sx += (1 - e.sx) * 0.18;
      e.sy += (1 - e.sy) * 0.18;

      const dir = p.x < e.x ? -1 : 1;
      const eAccel = e.kind === "brute" ? 420 : 680;
      if (e.stun <= 0 && e.hurtCd <= 0) {
        const targetVx = dir * e.speed;
        if (e.vx < targetVx) e.vx = Math.min(targetVx, e.vx + eAccel * DT);
        else if (e.vx > targetVx) e.vx = Math.max(targetVx, e.vx - eAccel * DT);
      } else {
        e.vx *= e.onGround ? 0.82 : 0.92;
      }
      // friction when near target speed overshoot
      if (Math.abs(e.vx) > e.speed * 1.4) e.vx *= 0.95;

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

      if (e.x < state.camX - 280 || e.x > state.camX + viewW + 280) {
        if (state.spawnQueue <= 0) {
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
      state.flash = 0.14;
      shapedShake(5);
      state.wavePause = 1.1;
    }

    // combo decay
    if (state.comboTimer > 0) {
      state.comboTimer -= DT;
      if (state.comboTimer <= 0) state.combo = 1;
    }

    // camera follow X + punch offset; keep clamps
    const target = p.x - viewW * 0.38;
    state.camX += (target - state.camX) * 0.14;
    state.camX += state.camPunch * 0.35;
    state.camPunch *= 0.78;
    if (Math.abs(state.camPunch) < 0.15) state.camPunch = 0;
    const maxCam = Math.max(0, WORLD_W - viewW);
    if (state.camX < 0) state.camX = 0;
    if (state.camX > maxCam) state.camX = maxCam;
    const edge = 36;
    p.x = Math.max(state.camX + edge, Math.min(state.camX + viewW - edge, p.x));

    // particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.x += pt.vx * DT;
      pt.y += pt.vy * DT;
      pt.vy -= (pt.grav != null ? pt.grav : 500) * DT;
      pt.life -= DT;
      if (pt.kind === "puff" || pt.kind === "dust") {
        pt.r += 8 * DT;
        pt.vx *= 0.96;
      }
      if (pt.life <= 0) state.particles.splice(i, 1);
    }

    // floating damage / combo pops
    for (let i = state.floats.length - 1; i >= 0; i--) {
      const f = state.floats[i];
      f.y += f.vy * DT;
      f.vy *= 0.96;
      f.life -= DT;
      if (f.life <= 0) state.floats.splice(i, 1);
    }

    // Shaped shake falloff (high then drop) — only nonzero when hit/kill set it
    if (state.shake > 0) {
      state.shake *= 0.78;
      if (state.shake < 0.25) state.shake = 0;
    }
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
      // shaped: more X on punchy hits, soft Y
      const mag = state.shake;
      shx = (Math.random() - 0.5) * mag * 1.4;
      shy = (Math.random() - 0.5) * mag * 0.7;
    }

    const floorY = floorScreenY(viewH);

    // sky / bg — candy corridor palette (distinct)
    ctx.fillStyle = "#e9d5ff";
    ctx.fillRect(0, 0, viewW, viewH);
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

    // ground fill
    ctx.fillStyle = "#c4b5a0";
    ctx.fillRect(0, floorY, viewW, viewH - floorY + 20);
    ctx.fillStyle = "#a8a29e";
    ctx.fillRect(0, floorY, viewW, 5);

    // world-space
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

    // wave banner
    ctx.fillStyle = "rgba(192,132,252,0.15)";
    ctx.font = "bold 14px system-ui,sans-serif";
    ctx.fillText("Wave " + state.wave + " / " + WIN_WAVES, state.camX + 12, floorY - 200);

    // particles
    for (const pt of state.particles) {
      const a = Math.max(0, pt.life / pt.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      const py = floorY - pt.y;
      if (pt.kind === "spark") {
        ctx.save();
        ctx.translate(pt.x, py);
        ctx.rotate(Math.atan2(-pt.vy, pt.vx));
        ctx.fillRect(-pt.r * 1.8, -pt.r * 0.4, pt.r * 3.6, pt.r * 0.8);
        ctx.restore();
      } else if (pt.kind === "crumb" || pt.kind === "icing") {
        ctx.fillRect(pt.x - pt.r * 0.6, py - pt.r * 0.6, pt.r * 1.2, pt.r * 1.2);
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, py, pt.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // enemies
    for (const e of state.enemies) {
      const ey = floorY - e.y;
      const face = e.x < (state.player ? state.player.x : e.x) ? 1 : -1;
      const scx = e.sx * e.scale;
      const scy = e.sy * e.scale;
      ctx.save();
      ctx.translate(e.x, ey);
      ctx.scale(face * scx, scy);
      if (e.dying > 0) {
        ctx.globalAlpha = Math.max(0, e.dying / 0.28);
      }
      const bimg = (e.kind === "brute" || (e.id | 0) % 2) ? blobAlt : blobImg;
      if (bimg.ok) {
        const s = Math.max(e.w, e.h) * 1.55;
        if (e.hitFlash > 0) {
          ctx.globalAlpha = (e.dying > 0 ? Math.max(0, e.dying / 0.28) : 1) * 0.95;
          // white flash tint via brighter redraw
          ctx.drawImage(bimg, -s / 2, -s * 0.95, s, s);
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fillRect(-s / 2, -s * 0.95, s, s);
          ctx.globalCompositeOperation = "source-over";
        } else {
          ctx.drawImage(bimg, -s / 2, -s * 0.95, s, s);
        }
      }
      ctx.globalAlpha = 1;
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

    // slash visual — multi-frame: wind flash, active arc, recovery fade
    if (state.slash && state.player) {
      const pl = state.player;
      const s = state.slash;
      const ph = slashPhase(s);
      const elapsed = s.max - s.life;
      const sx = pl.x + s.facing * (pl.w * 0.3 + 20);
      const sy = floorY - (pl.y + pl.h * 0.5);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(s.facing, 1);
      if (ph === "wind") {
        const t = elapsed / SLASH_WIND;
        ctx.globalAlpha = 0.35 + t * 0.4;
        ctx.strokeStyle = "#fef9c3";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 14 + t * 10, -0.6, 0.6);
        ctx.stroke();
        // hero windup flash ring
        ctx.globalAlpha = 0.25 + t * 0.35;
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.arc(-12, 0, 6 + t * 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (ph === "active") {
        const t = (elapsed - SLASH_WIND) / SLASH_ACTIVE;
        ctx.globalAlpha = Math.min(1, 0.9 + (1 - t) * 0.3);
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(0, 0, 30 + t * 16, -1.25, 1.25);
        ctx.stroke();
        ctx.strokeStyle = "rgba(254,240,138,0.7)";
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(0, 0, 22 + t * 12, -1.0, 1.0);
        ctx.stroke();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7 * (1 - t);
        ctx.beginPath();
        ctx.arc(0, 0, 36 + t * 10, -1.1, 1.1);
        ctx.stroke();
      } else {
        const t = (elapsed - SLASH_WIND - SLASH_ACTIVE) / SLASH_RECOV;
        ctx.globalAlpha = Math.max(0, 0.45 * (1 - t));
        ctx.strokeStyle = "#fde68a";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 40 + t * 8, -0.7, 0.7);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // player — whimsy stubby hero stamp (STYLE_LOCK B)
    const p = state.player;
    if (p) {
      const bobY = p.onGround && Math.abs(p.vx) > 40 ? Math.sin(p.bob) * 2.2 : 0;
      const py = floorY - p.y + bobY;
      ctx.save();
      ctx.translate(p.x, py);
      ctx.scale(p.facing * p.sx * p.scale, p.sy * p.scale);
      const blink = p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0;
      if (blink) ctx.globalAlpha = 0.4;
      if (p.windFlash > 0) {
        ctx.shadowColor = "#facc15";
        ctx.shadowBlur = 12;
      }
      {
        // Walk anim ONLY while moving; clean idle (no skate)
        const moving = Math.abs(p.vx) > 35 && p.onGround;
        const himg =
          moving && heroImg2.ok && (((p.anim * 0.5) | 0) % 2)
            ? heroImg2
            : heroImg;
        if (himg.ok) {
          const s = Math.max(p.w, p.h) * 2.2;
          ctx.drawImage(himg, -s * 0.42, -s * 0.98, s, s);
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // floating pops (world space)
    for (const f of state.floats) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = f.color;
      ctx.font = "bold 16px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, floorY - f.y);
      ctx.restore();
    }

    if (state.combo > 1 && state.player) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, state.comboTimer / 2);
      ctx.fillStyle = "#e9d5ff";
      ctx.font = "bold 22px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "x" + state.combo,
        state.player.x,
        floorY - (state.player.y + state.player.h + 20)
      );
      ctx.restore();
    }

    // pop world translate + shake (do not regress — two restores)
    ctx.restore();
    ctx.restore();

    if (state.flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + Math.min(0.45, state.flash).toFixed(3) + ")";
      ctx.fillRect(0, 0, viewW, viewH);
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
