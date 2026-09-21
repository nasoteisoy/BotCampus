(function () {
  "use strict";

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
  const WORLD_W = 720;
  const WORLD_H = 720;
  const ARENA = 280;

  // --- input ---
  const keys = Object.create(null);
  const moveVec = { x: 0, y: 0 };
  const aimVec = { x: 0, y: 0 };
  let fireHeld = false;
  let pointerAim = null; // desktop mouse aim world dir

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
    zone.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        zone.setPointerCapture(e.pointerId);
        active = e.pointerId;
        setFrom(e.clientX, e.clientY);
      },
      { passive: false }
    );
    zone.addEventListener(
      "pointermove",
      (e) => {
        if (active !== e.pointerId) return;
        e.preventDefault();
        setFrom(e.clientX, e.clientY);
      },
      { passive: false }
    );
    function up(e) {
      if (active !== e.pointerId) return;
      reset();
    }
    zone.addEventListener("pointerup", up);
    zone.addEventListener("pointercancel", up);
  }

  bindStick("moveStick", "moveKnob", moveVec);
  bindStick("aimStick", "aimKnob", aimVec);

  fireBtn.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      fireHeld = true;
      fireBtn.classList.add("held");
      fireBtn.setPointerCapture(e.pointerId);
    },
    { passive: false }
  );
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
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  canvas.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      const rect = canvas.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const sy = ((e.clientY - rect.top) / rect.height) * canvas.height;
      pointerAim = { sx, sy };
    },
    { passive: true }
  );
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return;
    if (e.button === 0) fireHeld = true;
  });
  window.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") return;
    if (e.button === 0) fireHeld = false;
  });

  // --- sim state ---
  const state = {
    phase: "title", // title | play | win | dead
    score: 0,
    wave: 1,
    shake: 0,
    flash: 0,
    camX: 0,
    camY: 0,
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
    spawnTimer: 0,
    toSpawn: 0,
    cleared: false,
  };

  function makePlayer() {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 14,
      hp: 5,
      maxHp: 5,
      facing: 0,
      fireCd: 0,
      invuln: 0,
      hitFlash: 0,
      scale: 1,
    };
  }

  function resetRun() {
    state.score = 0;
    state.wave = 1;
    state.shake = 0;
    state.flash = 0;
    state.player = makePlayer();
    state.bullets.length = 0;
    state.enemies.length = 0;
    state.particles.length = 0;
    state.cleared = false;
    startWave(1);
    state.phase = "play";
    overlay.classList.remove("show");
  }

  function startWave(n) {
    state.wave = n;
    state.toSpawn = 4 + n * 2;
    state.spawnTimer = 0.4;
    state.cleared = false;
  }

  function spawnEnemy() {
    const ang = Math.random() * Math.PI * 2;
    const dist = ARENA * 0.85 + Math.random() * 30;
    state.enemies.push({
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist,
      vx: 0,
      vy: 0,
      r: 12 + Math.random() * 4,
      hp: Math.min(5, 1 + Math.floor(state.wave / 3)), // Researcher A: 1–5 hits max
      hitFlash: 0,
      scale: 1,
      speed: 55 + state.wave * 6 + Math.random() * 20,
    });
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
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

  function readMove() {
    let mx = moveVec.x;
    let my = moveVec.y;
    if (keys["KeyW"] || keys["ArrowUp"]) my -= 1;
    if (keys["KeyS"] || keys["ArrowDown"]) my += 1;
    if (keys["KeyA"] || keys["ArrowLeft"]) mx -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    return { x: mx, y: my };
  }

  function readAim(p) {
    let ax = aimVec.x;
    let ay = aimVec.y;
    if (Math.hypot(ax, ay) > 0.25) return { x: ax, y: ay, active: true };

    // mouse aim relative to player screen pos
    if (pointerAim && (keys["Space"] || fireHeld || keys["KeyJ"])) {
      const viewW = canvas.clientWidth;
      const viewH = canvas.clientHeight;
      const cam = getCam();
      const px = p.x - cam.x + viewW / 2;
      const py = p.y - cam.y + viewH / 2;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sx = pointerAim.sx / dpr;
      const sy = pointerAim.sy / dpr;
      let dx = sx - px;
      let dy = sy - py;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len, active: true };
    }

    // keyboard aim fallback: face move dir
    const mv = readMove();
    if (Math.hypot(mv.x, mv.y) > 0.1 && (keys["Space"] || fireHeld || keys["KeyJ"])) {
      return { x: mv.x, y: mv.y, active: true };
    }
    if (keys["Space"] || fireHeld || keys["KeyJ"]) {
      return { x: Math.cos(p.facing), y: Math.sin(p.facing), active: true };
    }
    return { x: 0, y: 0, active: false };
  }

  function getCam() {
    const p = state.player;
    return {
      x: state.camX,
      y: state.camY,
      follow: p ? { x: p.x * 0.15, y: p.y * 0.15 } : { x: 0, y: 0 },
    };
  }

  function updateHUD() {
    const p = state.player;
    hudScore.textContent = "Score " + state.score;
    hudWave.textContent = "Wave " + state.wave;
    hudHp.textContent = "HP " + (p ? p.hp : 0);
  }

  function showOverlay(title, body, btn) {
    ovTitle.textContent = title;
    ovBody.textContent = body;
    ovBtn.textContent = btn || "Again";
    overlay.classList.add("show");
  }

  ovBtn.addEventListener("click", () => {
    resetRun();
  });

  function fixedUpdate() {
    if (state.phase !== "play") return;
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
    if (Math.hypot(mv.x, mv.y) > 0.1) p.facing = Math.atan2(mv.y, mv.x);

    // light camera follow
    const targetCamX = p.x * 0.22;
    const targetCamY = p.y * 0.22;
    state.camX += (targetCamX - state.camX) * 0.08;
    state.camY += (targetCamY - state.camY) * 0.08;

    if (p.fireCd > 0) p.fireCd -= DT;
    if (p.invuln > 0) p.invuln -= DT;
    if (p.hitFlash > 0) p.hitFlash -= DT;
    p.scale += (1 - p.scale) * 0.2;

    const aim = readAim(p);
    if (aim.active && Math.hypot(aim.x, aim.y) > 0.05) {
      p.facing = Math.atan2(aim.y, aim.x);
      if (p.fireCd <= 0) {
        const len = Math.hypot(aim.x, aim.y) || 1;
        const dx = aim.x / len;
        const dy = aim.y / len;
        state.bullets.push({
          x: p.x + dx * (p.r + 4),
          y: p.y + dy * (p.r + 4),
          vx: dx * 420,
          vy: dy * 420,
          life: 0.9,
          r: 4,
        });
        p.fireCd = 0.14;
        p.scale = 1.12;
        state.flash = Math.max(state.flash, 0.04);
      }
    }

    // spawn
    if (state.toSpawn > 0) {
      state.spawnTimer -= DT;
      if (state.spawnTimer <= 0) {
        spawnEnemy();
        state.toSpawn--;
        state.spawnTimer = Math.max(0.25, 0.55 - state.wave * 0.03);
      }
    }

    // bullets
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
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
          e.hp--;
          e.hitFlash = 0.12;
          e.scale = 1.35;
          state.bullets.splice(i, 1);
          burst(e.x, e.y, "#fbbf24", 5);
          state.shake = Math.max(state.shake, 3);
          if (e.hp <= 0) {
            state.score += 10 + state.wave * 2;
            burst(e.x, e.y, "#f97316", 12);
            state.enemies.splice(j, 1);
            state.shake = Math.max(state.shake, 6);
            state.flash = 0.08;
          }
          break;
        }
      }
    }

    // enemies
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      e.vx = (dx / dist) * e.speed;
      e.vy = (dy / dist) * e.speed;
      e.x += e.vx * DT;
      e.y += e.vy * DT;
      if (e.hitFlash > 0) e.hitFlash -= DT;
      e.scale += (1 - e.scale) * 0.15;

      if (p.invuln <= 0 && dist < p.r + e.r - 2) {
        p.hp--;
        p.invuln = 0.7;
        p.hitFlash = 0.2;
        p.scale = 1.4;
        state.shake = 10;
        state.flash = 0.12;
        burst(p.x, p.y, "#ef4444", 8);
        if (p.hp <= 0) {
          state.phase = "dead";
          showOverlay("Downed", "Score " + state.score + " · Wave " + state.wave, "Retry");
        }
      }
    }

    // wave clear
    if (
      state.toSpawn <= 0 &&
      state.enemies.length === 0 &&
      !state.cleared &&
      state.phase === "play"
    ) {
      state.cleared = true;
      state.score += 50 * state.wave;
      state.flash = 0.2;
      state.shake = 8;
      // brief pause then next wave
      setTimeout(() => {
        if (state.phase === "play") startWave(state.wave + 1);
      }, 700);
    }

    // particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.x += pt.vx * DT;
      pt.y += pt.vy * DT;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
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

    ctx.save();
    ctx.translate(viewW / 2 + shx - state.camX, viewH / 2 + shy - state.camY);

    // arena floor
    ctx.beginPath();
    ctx.arc(0, 0, ARENA, 0, Math.PI * 2);
    ctx.fillStyle = "#161c2a";
    ctx.fill();
    ctx.strokeStyle = "#2a3548";
    ctx.lineWidth = 3;
    ctx.stroke();

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
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

    // particles
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // enemies
    for (const e of state.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(e.scale, e.scale);
      ctx.fillStyle = e.hitFlash > 0 ? "#fff" : "#e11d48";
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7f1d1d";
      ctx.beginPath();
      ctx.arc(e.r * 0.25, -e.r * 0.2, e.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // bullets
    for (const b of state.bullets) {
      ctx.fillStyle = "#fbbf24";
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // player
    const p = state.player;
    if (p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(p.scale, p.scale);
      ctx.rotate(p.facing);
      const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
      ctx.fillStyle = blink ? "rgba(96,165,250,0.4)" : p.hitFlash > 0 ? "#fff" : "#60a5fa";
      ctx.beginPath();
      ctx.moveTo(p.r + 4, 0);
      ctx.lineTo(-p.r * 0.7, p.r * 0.75);
      ctx.lineTo(-p.r * 0.4, 0);
      ctx.lineTo(-p.r * 0.7, -p.r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1e3a8a";
      ctx.beginPath();
      ctx.arc(2, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.35, state.flash * 2)})`;
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

  showOverlay("Arena Clear", "Twin-stick roam & clear waves. Score for clears.", "Play");
  updateHUD();
  requestAnimationFrame(frame);
})();
