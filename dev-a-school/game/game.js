/*! Dev A Game Dev School — G0 Loop & time + G1 State & entities
 * Fixed dt accumulator (Fiedler), non-blocking rAF, intent→verb stub.
 * Android Chrome + Windows. Sim is authority; HUD reads snapshot.
 */
(function () {
  'use strict';

  var FIXED_DT = 1 / 60;
  var MAX_FRAME = 0.25; // clamp resume spike
  var MAX_STEPS = 5;    // avoid spiral of death
  var ACCEL = 900;
  var FRICTION = 12;
  var MAX_SPEED = 220;
  var ARRIVE = 10;

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var fsmEl = document.getElementById('fsm');
  var verbEl = document.getElementById('verb');
  var fpsEl = document.getElementById('fps');
  var stepsEl = document.getElementById('steps');

  // --- World / camera (screen ≠ world) ---
  var world = { w: 900, h: 1400 };
  var cam = { x: 0, y: 0, scale: 1 };

  // --- Explicit entity state (G1) ---
  var bot = {
    x: world.w * 0.5,
    y: world.h * 0.55,
    px: world.w * 0.5,
    py: world.h * 0.55,
    vx: 0,
    vy: 0,
    fsm: 'idle', // idle | walk
    facing: 1,
    phase: 0
  };

  // Intent (player want) vs verb (sim accepted action)
  var intent = { moveTo: null }; // {x,y} or null
  var lastVerb = '—';
  var paused = false;

  var accumulator = 0;
  var lastTs = 0;
  var fpsSmooth = 60;
  var stepsLast = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fit world into view with margin
    cam.scale = Math.min(w / world.w, h / world.h) * 0.92;
    cam.x = (w - world.w * cam.scale) / 2;
    cam.y = (h - world.h * cam.scale) / 2;
  }

  function screenToWorld(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    var sx = clientX - r.left;
    var sy = clientY - r.top;
    return {
      x: (sx - cam.x) / cam.scale,
      y: (sy - cam.y) / cam.scale
    };
  }

  function setMoveIntent(wx, wy) {
    wx = Math.max(40, Math.min(world.w - 40, wx));
    wy = Math.max(80, Math.min(world.h - 40, wy));
    intent.moveTo = { x: wx, y: wy };
    lastVerb = 'move'; // edge intent → verb stub (accepted this press)
  }

  // Non-blocking input (Nystrom) — never wait on events to advance loop
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var p = screenToWorld(e.clientX, e.clientY);
    setMoveIntent(p.x, p.y);
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
      e.preventDefault();
      paused = !paused;
      lastVerb = paused ? 'pause' : 'resume';
    }
  });

  function fixedUpdate(dt) {
    // G1: intent → verb → state transition
    var target = intent.moveTo;
    if (!target) {
      // friction to stop
      bot.vx *= Math.max(0, 1 - FRICTION * dt);
      bot.vy *= Math.max(0, 1 - FRICTION * dt);
      if (Math.hypot(bot.vx, bot.vy) < 8) {
        bot.vx = bot.vy = 0;
        bot.fsm = 'idle';
      }
      return;
    }

    var dx = target.x - bot.x;
    var dy = target.y - bot.y;
    var dist = Math.hypot(dx, dy);
    if (dist <= ARRIVE) {
      bot.x = target.x;
      bot.y = target.y;
      bot.vx = bot.vy = 0;
      bot.fsm = 'idle';
      intent.moveTo = null; // consume arrive
      lastVerb = 'arrive';
      return;
    }

    // Organic accel toward target (not binary teleport)
    var ux = dx / dist;
    var uy = dy / dist;
    bot.vx += ux * ACCEL * dt;
    bot.vy += uy * ACCEL * dt;
    var sp = Math.hypot(bot.vx, bot.vy);
    if (sp > MAX_SPEED) {
      bot.vx = (bot.vx / sp) * MAX_SPEED;
      bot.vy = (bot.vy / sp) * MAX_SPEED;
      sp = MAX_SPEED;
    }
    bot.x += bot.vx * dt;
    bot.y += bot.vy * dt;
    if (dx !== 0) bot.facing = dx < 0 ? -1 : 1;
    bot.fsm = sp > 12 ? 'walk' : 'idle';
    if (bot.fsm === 'walk') bot.phase += dt * (sp / MAX_SPEED) * 10;
  }

  function render(alpha) {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // interpolate for smooth draw (Fiedler alpha)
    var rx = bot.px + (bot.x - bot.px) * alpha;
    var ry = bot.py + (bot.y - bot.py) * alpha;

    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.scale, cam.scale);

    // ground
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(20, 20, world.w - 40, world.h - 40);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, world.w - 40, world.h - 40);

    // target marker
    if (intent.moveTo) {
      ctx.beginPath();
      ctx.arc(intent.moveTo.x, intent.moveTo.y, 14, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8aa';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // stubby bot — walk bob tied to velocity phase
    var bob = bot.fsm === 'walk' ? Math.sin(bot.phase) * 5 : 0;
    ctx.save();
    ctx.translate(rx, ry + bob);
    ctx.scale(bot.facing, 1);
    ctx.fillStyle = bot.fsm === 'walk' ? '#38bdf8' : '#94a3b8';
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(6, -8, 12, 8); // eye
    ctx.restore();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 18px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Stub', rx, ry - 42);

    ctx.restore();

    // HUD snapshot (view reads sim — F9)
    fsmEl.textContent = bot.fsm;
    fsmEl.className = 'pill ' + bot.fsm;
    verbEl.textContent = lastVerb;
    fpsEl.textContent = String(Math.round(fpsSmooth));
    stepsEl.textContent = String(stepsLast);
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var frameTime = (ts - lastTs) / 1000;
    lastTs = ts;
    if (frameTime > 0) fpsSmooth = fpsSmooth * 0.9 + (1 / frameTime) * 0.1;

    if (paused) {
      render(1);
      return;
    }

    // G0: fixed dt accumulator
    frameTime = Math.min(frameTime, MAX_FRAME);
    accumulator += frameTime;
    var steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      bot.px = bot.x;
      bot.py = bot.y;
      fixedUpdate(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) accumulator = 0; // drop remainder under load
    stepsLast = steps;
    var alpha = accumulator / FIXED_DT;
    render(alpha);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
