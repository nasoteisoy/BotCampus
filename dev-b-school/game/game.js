/**
 * Dev B Game Drill — fixed timestep + FSM idle|walk|busy
 * Walk class/anim ONLY while velocity > epsilon (no walk-in-place).
 */
(function () {
  "use strict";

  const FIXED_DT = 1 / 60;
  const MAX_FRAME_TIME = 0.25;
  const MAX_STEPS = 5;
  const EPSILON = 8; // px/s — below this = not walking
  const MOVE_SPEED = 110; // px/s
  const ARRIVE_DIST = 10;

  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d");
  const stateLabel = document.getElementById("state-label");
  const speedLabel = document.getElementById("speed-label");
  const stateChip = document.getElementById("state-chip");
  const btnAssign = document.getElementById("btn-assign");
  const btnHome = document.getElementById("btn-home");

  /** World landmarks (canvas space) */
  const home = { x: 88, y: 230, r: 28, label: "Home desk" };
  const station = { x: 380, y: 90, r: 34, label: "Work station" };

  /** Entity: stubby circle bot */
  const bot = {
    x: home.x,
    y: home.y,
    prevX: home.x,
    prevY: home.y,
    vx: 0,
    vy: 0,
    r: 18,
    name: "Pip",
    /** @type {"idle"|"walk"|"busy"} */
    state: "idle",
    target: null, // {x,y} or null
    busyT: 0,
    walkPhase: 0,
    sparkles: [],
  };

  let autoAssigned = false;
  let autoTimer = 0;
  let hudFlash = 0;

  function setState(next) {
    if (bot.state === next) return;
    bot.state = next;
    stateLabel.textContent = next;
    stateChip.dataset.state = next;
  }

  function speed() {
    return Math.hypot(bot.vx, bot.vy);
  }

  function assignTask() {
    bot.target = { x: station.x, y: station.y };
    bot.busyT = 0;
    bot.sparkles.length = 0;
    hudFlash = 0.25;
    // cancel idle immediately; walk will engage when velocity rises
    if (bot.state === "idle" || bot.state === "busy") {
      setState("walk"); // intent; may drop to idle-feel only if somehow stuck
    }
  }

  function recallHome() {
    bot.target = { x: home.x, y: home.y };
    bot.busyT = 0;
    bot.sparkles.length = 0;
    hudFlash = 0.2;
    setState("walk");
  }

  btnAssign.addEventListener("click", assignTask);
  btnHome.addEventListener("click", recallHome);

  function spawnSparkles() {
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
      bot.sparkles.push({
        x: station.x,
        y: station.y,
        vx: Math.cos(a) * (40 + Math.random() * 60),
        vy: Math.sin(a) * (40 + Math.random() * 60) - 20,
        life: 0.6 + Math.random() * 0.5,
        age: 0,
      });
    }
  }

  function update(dt) {
    // Auto-assign once so the drill demos itself
    if (!autoAssigned) {
      autoTimer += dt;
      if (autoTimer >= 2.5) {
        autoAssigned = true;
        assignTask();
      }
    }

    if (hudFlash > 0) hudFlash = Math.max(0, hudFlash - dt);

    bot.prevX = bot.x;
    bot.prevY = bot.y;

    if (bot.state === "busy") {
      bot.vx = 0;
      bot.vy = 0;
      bot.busyT += dt;
      // refresh sparkles periodically (visual busy prop)
      if (bot.sparkles.length < 3 && Math.random() < 0.08) {
        spawnSparkles();
      }
    } else if (bot.target) {
      const dx = bot.target.x - bot.x;
      const dy = bot.target.y - bot.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= ARRIVE_DIST) {
        bot.x = bot.target.x;
        bot.y = bot.target.y;
        bot.vx = 0;
        bot.vy = 0;
        const atStation =
          Math.hypot(bot.x - station.x, bot.y - station.y) < ARRIVE_DIST + 2;
        bot.target = null;
        if (atStation) {
          setState("busy");
          spawnSparkles();
        } else {
          setState("idle");
        }
      } else {
        // simple seek with soft accel toward MOVE_SPEED
        const nx = dx / dist;
        const ny = dy / dist;
        const desiredVx = nx * MOVE_SPEED;
        const desiredVy = ny * MOVE_SPEED;
        const accel = 480;
        bot.vx += Math.max(-accel * dt, Math.min(accel * dt, desiredVx - bot.vx));
        bot.vy += Math.max(-accel * dt, Math.min(accel * dt, desiredVy - bot.vy));
        bot.x += bot.vx * dt;
        bot.y += bot.vy * dt;
        setState("walk");
      }
    } else if (bot.state !== "busy") {
      // friction stop → idle at home desk vibe
      bot.vx *= Math.max(0, 1 - 8 * dt);
      bot.vy *= Math.max(0, 1 - 8 * dt);
      if (speed() < EPSILON) {
        bot.vx = 0;
        bot.vy = 0;
        setState("idle");
      }
    }

    // Walk phase advances ONLY while moving (velocity-tied)
    const spd = speed();
    if (spd > EPSILON) {
      bot.walkPhase += dt * (spd / 28);
    }

    // Sparkle sim
    for (let i = bot.sparkles.length - 1; i >= 0; i--) {
      const s = bot.sparkles[i];
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 90 * dt;
      if (s.age >= s.life) bot.sparkles.splice(i, 1);
    }

    speedLabel.textContent = "· speed " + Math.round(spd);
  }

  function drawRoundedRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawProp(landmark, color, icon) {
    ctx.save();
    ctx.translate(landmark.x, landmark.y);
    drawRoundedRect(-36, -28, 72, 56, 12, color, "rgba(0,0,0,0.35)");
    ctx.fillStyle = "#1a1428";
    ctx.font = "bold 11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(landmark.label, 0, 42);
    ctx.font = "22px Segoe UI Emoji, sans-serif";
    ctx.fillText(icon, 0, 8);
    ctx.restore();
  }

  function drawBot(alpha) {
    // interpolate for smooth render between fixed ticks
    const x = bot.prevX + (bot.x - bot.prevX) * alpha;
    const y = bot.prevY + (bot.y - bot.prevY) * alpha;
    const spd = speed();
    const walking = spd > EPSILON;

    ctx.save();
    ctx.translate(x, y);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, bot.r + 4, bot.r * 0.9, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // stubby legs — ONLY animate when walking (velocity-tied)
    if (walking) {
      const swing = Math.sin(bot.walkPhase * Math.PI * 2) * 7;
      ctx.strokeStyle = "#5a8fc4";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-6, bot.r - 4);
      ctx.lineTo(-6 + swing, bot.r + 10);
      ctx.moveTo(6, bot.r - 4);
      ctx.lineTo(6 - swing, bot.r + 10);
      ctx.stroke();
    } else {
      // idle feet planted
      ctx.strokeStyle = "#5a8fc4";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-6, bot.r - 2);
      ctx.lineTo(-6, bot.r + 6);
      ctx.moveTo(6, bot.r - 2);
      ctx.lineTo(6, bot.r + 6);
      ctx.stroke();
    }

    // body bob only while walking
    const bob = walking ? Math.abs(Math.sin(bot.walkPhase * Math.PI * 2)) * 3 : 0;
    ctx.translate(0, -bob);

    // circle body
    const grad = ctx.createRadialGradient(-4, -6, 4, 0, 0, bot.r);
    grad.addColorStop(0, "#c8e4ff");
    grad.addColorStop(1, "#6aa8e8");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, bot.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3d6a9a";
    ctx.lineWidth = 2;
    ctx.stroke();

    // face
    ctx.fillStyle = "#1a1428";
    ctx.beginPath();
    ctx.arc(-5, -2, 2.5, 0, Math.PI * 2);
    ctx.arc(5, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    if (bot.state === "busy") {
      ctx.arc(0, 5, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (walking) {
      ctx.arc(0, 4, 4, 0.1 * Math.PI, 0.9 * Math.PI);
    } else {
      ctx.moveTo(-4, 5);
      ctx.quadraticCurveTo(0, 8, 4, 5);
    }
    ctx.strokeStyle = "#1a1428";
    ctx.lineWidth = 2;
    ctx.stroke();

    // name tag (circle-style name OK)
    ctx.fillStyle = "rgba(26,20,40,0.85)";
    drawRoundedRect(-22, -bot.r - 22, 44, 16, 8, "rgba(26,20,40,0.85)", null);
    ctx.fillStyle = "#ffd6f0";
    ctx.font = "bold 11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(bot.name, 0, -bot.r - 10);

    // busy badge
    if (bot.state === "busy") {
      ctx.fillStyle = "#7dffb3";
      ctx.font = "bold 10px Segoe UI, system-ui, sans-serif";
      ctx.fillText("BUSY ✦", 0, bot.r + 22);
    }

    ctx.restore();
  }

  function render(alpha) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // floor vignette
    const g = ctx.createRadialGradient(240, 160, 40, 240, 160, 280);
    g.addColorStop(0, "rgba(255,140,200,0.06)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawProp(home, "#ffd36e", "🪑");
    drawProp(station, "#7dffb3", "🛠️");

    // station busy prop ring
    if (bot.state === "busy") {
      ctx.save();
      ctx.translate(station.x, station.y);
      ctx.strokeStyle = "rgba(125,255,179,0.7)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 42 + Math.sin(bot.busyT * 6) * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // sparkles (mute-safe VFX)
    for (const s of bot.sparkles) {
      const t = 1 - s.age / s.life;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = "#ffe566";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3 + 2 * t, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawBot(alpha);

    if (hudFlash > 0) {
      ctx.fillStyle = "rgba(255,139,209," + hudFlash * 0.25 + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // --- Fixed timestep loop (rAF + accumulator) — NOT setInterval ---
  let last = performance.now() / 1000;
  let accumulator = 0;
  let running = true;

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      // avoid huge catch-up teleport after Android Chrome background
      last = performance.now() / 1000;
      accumulator = 0;
    }
  });

  function frame(nowMs) {
    if (!running) return;
    const now = nowMs / 1000;
    let frameTime = now - last;
    last = now;
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

    accumulator += frameTime;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) {
      // prefer slow-mo over melt — drop leftover
      accumulator = 0;
    }

    const alpha = accumulator / FIXED_DT;
    render(alpha);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
