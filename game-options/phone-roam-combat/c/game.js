(function () {
  "use strict";

  // STYLE_LOCK — sheet cells (ANIM_SHEETS.md). Never _old_shape_* fallbacks.
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

  const guardIdle = loadImg("./art/guard_idle_sheet.png" + V);
  const guardWalk = loadImg("./art/guard_walk_sheet.png" + V);
  const guardSheet = loadImg("./art/guard_sheet.png" + V);
  const guardHitDeath = loadImg("./art/guard_hitdeath_sheet.png" + V);
  const guardFb = loadImg("./art/guard.png" + V);

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const hudScore = document.getElementById("hudScore");
  const hudAlert = document.getElementById("hudAlert");
  const hudDash = document.getElementById("hudDash");
  const overlay = document.getElementById("overlay");
  const ovTitle = document.getElementById("ovTitle");
  const ovBody = document.getElementById("ovBody");
  const ovBtn = document.getElementById("ovBtn");
  const dashBtn = document.getElementById("dashBtn");
  const atkBtn = document.getElementById("atkBtn");

  const DT = 1 / 60;
  const MAX_FRAME = 0.05;
  const MAX_STEPS = 5;
  const TILE_W = 54;
  const TILE_H = 27;
  const MAP_W = 14;
  const MAP_H = 14;

  const IDLE_FPS = 6;
  const WALK_FPS = 10;
  const ATK_FPS = 12;
  const GUARD_FPS = 7;

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

  const keys = Object.create(null);
  const moveVec = { x: 0, y: 0 };
  let dashPressed = false;
  let atkPressed = false;
  let dashLatch = false;
  let atkLatch = false;

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
      out.x = (dx / max + dy / max) * 0.707;
      out.y = (-dx / max + dy / max) * 0.707;
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

  function bindTap(btn, onDown) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.classList.add("held");
      btn.setPointerCapture(e.pointerId);
      onDown();
    }, { passive: false });
    function up() { btn.classList.remove("held"); }
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  }
  bindTap(dashBtn, () => { dashPressed = true; });
  bindTap(atkBtn, () => { atkPressed = true; });

  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "ShiftLeft" || e.code === "KeyK") dashPressed = true;
    if (e.code === "KeyJ" || e.code === "KeyZ" || e.code === "Space") atkPressed = true;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
      e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  const walls = new Set([
    "3,3","3,4","4,3",
    "9,2","10,2","10,3",
    "2,9","2,10","3,10",
    "8,8","8,9","9,8","9,9",
    "6,5","7,11","11,7","5,12","12,5",
  ]);

  function isWall(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    return walls.has(tx + "," + ty);
  }

  function worldToScreen(wx, wy) {
    return {
      x: (wx - wy) * (TILE_W / 2),
      y: (wx + wy) * (TILE_H / 2),
    };
  }

  const state = {
    phase: "title",
    marks: 0,
    targetMarks: 3,
    globalAlert: 0,
    shake: 0,
    flash: 0,
    hitStop: 0,
    camX: 0,
    camY: 0,
    player: null,
    guards: [],
    particles: [],
    floatTexts: [],
    takedownFx: null,
    marksPop: 0,
  };

  function makePlayer() {
    return {
      x: 1.5, y: 1.5, facing: 0, speed: 2.6,
      dashCd: 0, dashT: 0, dashDirX: 0, dashDirY: 0,
      atkCd: 0, atkWind: 0, scale: 1,
      moving: false, hidden: false,
      anim: "idle", frame: 0, animT: 0, atkPlaying: false,
    };
  }

  function placeGuards() {
    const spots = [
      { x: 6.5, y: 3.5, facing: Math.PI * 0.25, patrol: [{ x: 6.5, y: 3.5 }, { x: 11, y: 4 }] },
      { x: 4, y: 7, facing: Math.PI, patrol: [{ x: 4, y: 7 }, { x: 4, y: 11 }] },
      { x: 10, y: 9, facing: -Math.PI * 0.5, patrol: [{ x: 10, y: 9 }, { x: 7, y: 12 }] },
      { x: 8, y: 5, facing: Math.PI * 0.75, patrol: [{ x: 8, y: 5 }, { x: 12, y: 6 }, { x: 11, y: 10 }] },
      { x: 2.5, y: 5.5, facing: 0, patrol: [{ x: 2.5, y: 5.5 }, { x: 5, y: 5.5 }] },
      { x: 12, y: 2.5, facing: Math.PI, patrol: [{ x: 12, y: 2.5 }, { x: 12, y: 5 }] },
    ];
    state.guards = spots.map((s) => ({
      x: s.x, y: s.y, facing: s.facing,
      patrol: s.patrol, patrolIdx: 0,
      alert: 0, state: "patrol",
      coneLen: 3.2, coneHalf: 0.55, speed: 1.35,
      huntTimer: 0, hitFlash: 0, scale: 1, squash: 1,
      kbX: 0, kbY: 0, alive: true, dying: false,
      deathT: 0, deathMax: 0.45, deathFrame: 0, alpha: 1,
      conePulse: 0, animT: Math.random() * 4, frame: 0,
      moving: false, hitPose: 0,
    }));
  }

  function hideOverlay() {
    overlay.classList.remove("show");
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
  }

  function resetRun() {
    state.marks = 0;
    state.globalAlert = 0;
    state.shake = 0;
    state.flash = 0;
    state.hitStop = 0;
    state.marksPop = 0;
    state.player = makePlayer();
    placeGuards();
    state.particles.length = 0;
    state.floatTexts.length = 0;
    state.takedownFx = null;
    state.phase = "play";
    hideOverlay();
    updateHUD();
  }

  function burst(wx, wy, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3;
      state.particles.push({
        x: wx, y: wy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.3, max: 0.6,
        color, r: 2 + Math.random() * 3,
      });
    }
  }

  function floatText(wx, wy, text, color) {
    state.floatTexts.push({
      x: wx, y: wy, text, color: color || "#fbbf24",
      life: 0.75, max: 0.75, vy: -1.2,
    });
  }

  function resize() {
    const stage = document.getElementById("stage");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(stage.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(stage.clientHeight * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function readMove() {
    let mx = moveVec.x;
    let my = moveVec.y;
    if (keys["KeyW"] || keys["ArrowUp"]) { mx -= 0.7; my -= 0.7; }
    if (keys["KeyS"] || keys["ArrowDown"]) { mx += 0.7; my += 0.7; }
    if (keys["KeyA"] || keys["ArrowLeft"]) { mx -= 0.7; my += 0.7; }
    if (keys["KeyD"] || keys["ArrowRight"]) { mx += 0.7; my -= 0.7; }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    return { x: mx, y: my };
  }

  function tryMove(ent, dx, dy) {
    const nx = ent.x + dx;
    const ny = ent.y + dy;
    const r = 0.28;
    const samples = [[nx - r, ny - r], [nx + r, ny - r], [nx - r, ny + r], [nx + r, ny + r]];
    for (const [sx, sy] of samples) {
      if (isWall(Math.floor(sx), Math.floor(sy))) return false;
    }
    ent.x = nx;
    ent.y = ny;
    return true;
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function canSee(guard, px, py) {
    if (!guard.alive || guard.dying) return false;
    const dx = px - guard.x;
    const dy = py - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > guard.coneLen) return false;
    const ang = Math.atan2(dy, dx);
    if (Math.abs(angleDiff(ang, guard.facing)) > guard.coneHalf) return false;
    const steps = Math.ceil(dist * 4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (isWall(Math.floor(guard.x + dx * t), Math.floor(guard.y + dy * t))) return false;
    }
    return true;
  }

  function behindGuard(guard, px, py) {
    const dx = px - guard.x;
    const dy = py - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1.75) return false;
    return Math.abs(angleDiff(Math.atan2(dy, dx), guard.facing + Math.PI)) < 1.25;
  }

  function canTakedown(g, p) {
    if (!g.alive || g.dying) return false;
    const dist = Math.hypot(g.x - p.x, g.y - p.y);
    if (dist > 1.9) return false;
    const rear = behindGuard(g, p.x, p.y);
    const unseen = g.alert < 0.7 && !canSee(g, p.x, p.y);
    if (rear && g.state !== "hunt") return true;
    if (rear && g.state === "hunt" && g.alert < 0.95 && dist < 1.2) return true;
    if (unseen && g.state !== "hunt") return true;
    if (dist < 1.35 && !canSee(g, p.x, p.y) && g.alert < 0.85) return true;
    return false;
  }

  function updateHUD() {
    const p = state.player;
    const pop = state.marksPop > 0 ? 1 + state.marksPop * 0.4 : 1;
    hudScore.textContent = "Marks " + state.marks + "/" + state.targetMarks;
    hudScore.style.transform = "scale(" + pop.toFixed(3) + ")";
    let alertLabel = "Calm";
    if (state.globalAlert > 0.75) alertLabel = "HUNT";
    else if (state.globalAlert > 0.35) alertLabel = "Suspicious";
    else if (state.globalAlert > 0.05) alertLabel = "Uneasy";
    hudAlert.textContent = "Alert " + alertLabel;
    if (p) {
      hudDash.textContent = p.dashCd > 0 ? "Dash " + p.dashCd.toFixed(1) + "s" : "Dash Ready";
    }
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
    if (p.moving || p.dashT > 0) {
      if (p.anim !== "walk") { p.anim = "walk"; p.frame = 0; p.animT = 0; }
      p.animT += dt;
      p.frame = Math.floor(p.animT * WALK_FPS) % 4;
    } else {
      if (p.anim !== "idle") { p.anim = "idle"; p.frame = 0; p.animT = 0; }
      p.animT += dt;
      p.frame = Math.floor(p.animT * IDLE_FPS) % 4;
    }
  }

  function startGuardDeath(g, fromX, fromY) {
    g.dying = true;
    g.alive = false;
    g.state = "dead";
    g.deathT = g.deathMax;
    g.deathFrame = 1;
    g.hitFlash = 0.22;
    g.hitPose = 0.15;
    g.squash = 0.4;
    g.scale = 1.3;
    const dx = g.x - fromX;
    const dy = g.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    g.kbX = (dx / len) * 2.8;
    g.kbY = (dy / len) * 2.8;
    burst(g.x, g.y, "#1e3a5f", 18);
    burst(g.x, g.y, "#fbbf24", 8);
  }

  function fixedUpdate() {
    if (state.phase !== "play") return;

    if (state.hitStop > 0) {
      state.hitStop -= 1;
      updateHUD();
      return;
    }

    const p = state.player;
    const mv = readMove();

    const doDash = dashPressed && !dashLatch;
    const doAtk = atkPressed && !atkLatch;
    dashLatch = dashPressed;
    atkLatch = atkPressed;
    dashPressed = false;
    atkPressed = false;

    if (p.dashCd > 0) p.dashCd -= DT;
    if (p.atkCd > 0) p.atkCd -= DT;
    p.scale += (1 - p.scale) * 0.2;

    const movingNow = Math.hypot(mv.x, mv.y) > 0.15 && p.dashT <= 0;
    p.moving = movingNow;

    if (p.dashT > 0) {
      p.dashT -= DT;
      tryMove(p, p.dashDirX * 9 * DT, p.dashDirY * 9 * DT);
    } else {
      const sp = p.speed * (state.globalAlert > 0.5 ? 1.05 : 1);
      if (Math.hypot(mv.x, mv.y) > 0.15) {
        p.facing = Math.atan2(mv.y, mv.x);
        tryMove(p, mv.x * sp * DT, mv.y * sp * DT);
      }
    }

    advancePlayerAnim(p, DT);

    if (doDash && p.dashCd <= 0) {
      let dx = mv.x;
      let dy = mv.y;
      if (Math.hypot(dx, dy) < 0.2) {
        dx = Math.cos(p.facing);
        dy = Math.sin(p.facing);
      }
      const len = Math.hypot(dx, dy) || 1;
      p.dashDirX = dx / len;
      p.dashDirY = dy / len;
      p.dashT = 0.14;
      p.dashCd = 1.1;
      p.scale = 1.3;
      startPlayerAttack(p); // dash uses attack sheet for juice pose
      state.flash = 0.05;
      burst(p.x, p.y, "#a3e635", 6);
    }

    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    p.hidden =
      isWall(tx + 1, ty) || isWall(tx - 1, ty) ||
      isWall(tx, ty + 1) || isWall(tx, ty - 1);

    if (doAtk && p.atkCd <= 0 && p.atkWind <= 0) {
      p.atkCd = 0.35;
      p.atkWind = 0.07;
      p.scale = 1.28;
      startPlayerAttack(p);
    }

    if (p.atkWind > 0) {
      p.atkWind -= DT;
      if (p.atkWind <= 0) {
        p.atkWind = 0;
        let scored = false;
        for (const g of state.guards) {
          if (!g.alive || g.dying) continue;
          const dist = Math.hypot(g.x - p.x, g.y - p.y);
          if (canTakedown(g, p)) {
            startGuardDeath(g, p.x, p.y);
            state.marks++;
            state.marksPop = 0.55;
            state.shake = 7;
            state.flash = 0.14;
            state.hitStop = 4;
            state.takedownFx = { x: g.x, y: g.y, life: 0.4 };
            floatText(g.x, g.y - 0.4, "MARK +" + state.marks, "#fbbf24");
            scored = true;
            state.globalAlert = Math.max(0, state.globalAlert - 0.15);
            updateHUD();
            break;
          } else if (dist < 1.15) {
            g.alert = 1;
            g.state = "hunt";
            g.huntTimer = 4;
            g.conePulse = 0.5;
            state.globalAlert = Math.min(1, state.globalAlert + 0.45);
            state.shake = 5;
            state.flash = 0.08;
            burst(g.x, g.y, "#f87171", 8);
            floatText(g.x, g.y - 0.3, "!", "#f87171");
          }
        }
        if (!scored) p.scale = 1.1;
      }
    }

    let anySee = false;
    for (const g of state.guards) {
      if (g.dying) {
        g.deathT -= DT;
        const t = 1 - g.deathT / g.deathMax;
        g.deathFrame = Math.min(5, 1 + Math.floor(t * 5));
        g.alpha = Math.max(0, 1 - Math.max(0, t - 0.55) / 0.45);
        g.scale = 1.3 * (1 - t * 0.9);
        g.squash = 0.4 + t * 1.1;
        g.x += g.kbX * DT;
        g.y += g.kbY * DT;
        g.kbX *= 0.88;
        g.kbY *= 0.88;
        if (g.hitFlash > 0) g.hitFlash -= DT;
        if (g.deathT <= 0) { g.dying = false; g.alpha = 0; }
        continue;
      }
      if (!g.alive) continue;
      if (g.hitFlash > 0) g.hitFlash -= DT;
      if (g.hitPose > 0) g.hitPose -= DT;
      if (g.conePulse > 0) g.conePulse -= DT;
      g.scale += (1 - g.scale) * 0.15;
      g.squash += (1 - g.squash) * 0.18;

      const sees = canSee(g, p.x, p.y);
      if (sees) {
        anySee = true;
        const prev = g.alert;
        g.alert = Math.min(1, g.alert + DT * (p.hidden ? 0.55 : 1.2));
        if (prev < 0.35 && g.alert >= 0.35) {
          g.conePulse = 0.55;
          state.shake = Math.max(state.shake, 2.5);
          state.flash = Math.max(state.flash, 0.04);
        }
        if (g.alert > 0.35) g.state = "suspicious";
        if (g.alert >= 1) {
          g.state = "hunt";
          g.huntTimer = 5;
          g.conePulse = Math.max(g.conePulse, 0.4);
        }
      } else {
        if (g.state === "hunt") {
          g.huntTimer -= DT;
          if (g.huntTimer <= 0) {
            g.state = "patrol";
            g.alert = Math.max(0, g.alert - 0.4);
          }
        } else {
          g.alert = Math.max(0, g.alert - DT * 0.25);
          if (g.alert < 0.2) g.state = "patrol";
        }
      }

      let gMoving = false;
      if (g.state === "hunt") {
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        const dist = Math.hypot(dx, dy) || 1;
        g.facing = Math.atan2(dy, dx);
        tryMove(g, (dx / dist) * g.speed * 1.35 * DT, (dy / dist) * g.speed * 1.35 * DT);
        gMoving = true;
        if (dist < 0.55) {
          state.phase = "dead";
          state.shake = 12;
          state.flash = 0.2;
          showOverlay("Spotted & Caught", "Marks " + state.marks + "/" + state.targetMarks, "Retry");
        }
      } else if (g.state === "suspicious") {
        g.facing = Math.atan2(p.y - g.y, p.x - g.x);
      } else {
        const target = g.patrol[g.patrolIdx];
        const dx = target.x - g.x;
        const dy = target.y - g.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.15) {
          g.patrolIdx = (g.patrolIdx + 1) % g.patrol.length;
        } else {
          g.facing = Math.atan2(dy, dx);
          tryMove(g, (dx / dist) * g.speed * DT, (dy / dist) * g.speed * DT);
          gMoving = true;
        }
      }
      g.moving = gMoving;
      g.animT += DT;
      g.frame = Math.floor(g.animT * (gMoving ? WALK_FPS : IDLE_FPS)) % 4;
    }

    if (anySee) state.globalAlert = Math.min(1, state.globalAlert + DT * 0.35);
    else state.globalAlert = Math.max(0, state.globalAlert - DT * 0.08);

    if (state.takedownFx) {
      state.takedownFx.life -= DT;
      if (state.takedownFx.life <= 0) state.takedownFx = null;
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.x += pt.vx * DT;
      pt.y += pt.vy * DT;
      pt.vx *= 0.9;
      pt.vy *= 0.9;
      pt.life -= DT;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floatTexts.length - 1; i >= 0; i--) {
      const ft = state.floatTexts[i];
      ft.y += ft.vy * DT;
      ft.life -= DT;
      if (ft.life <= 0) state.floatTexts.splice(i, 1);
    }

    const ps = worldToScreen(p.x, p.y);
    state.camX += (ps.x - state.camX) * 0.1;
    state.camY += (ps.y - state.camY) * 0.1;

    if (state.shake > 0) state.shake *= 0.82;
    if (state.shake < 0.3) state.shake = 0;
    if (state.flash > 0) state.flash -= DT;
    if (state.marksPop > 0) state.marksPop -= DT;

    if (state.marks >= state.targetMarks) {
      state.phase = "win";
      state.flash = 0.25;
      showOverlay("Silent Clear", "All marks down. Ghost protocol.", "Again");
    }

    updateHUD();
  }

  function drawDiamond(sx, sy, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(sx, sy - TILE_H / 2);
    ctx.lineTo(sx + TILE_W / 2, sy);
    ctx.lineTo(sx, sy + TILE_H / 2);
    ctx.lineTo(sx - TILE_W / 2, sy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawCone(g, ox, oy) {
    const origin = worldToScreen(g.x, g.y);
    const steps = 10;
    const pulse = g.conePulse > 0 ? 1 + Math.sin(g.conePulse * 40) * 0.12 : 1;
    const len = g.coneLen * pulse;
    ctx.beginPath();
    ctx.moveTo(origin.x + ox, origin.y + oy);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = g.facing - g.coneHalf + t * g.coneHalf * 2;
      const s = worldToScreen(g.x + Math.cos(ang) * len, g.y + Math.sin(ang) * len);
      ctx.lineTo(s.x + ox, s.y + oy);
    }
    ctx.closePath();
    let a = 0.14 + g.alert * 0.22;
    if (g.conePulse > 0) a += 0.12;
    ctx.fillStyle =
      g.state === "hunt" ? `rgba(248,113,113,${a + 0.12})`
        : g.state === "suspicious" ? `rgba(251,191,36,${a})`
          : `rgba(148,163,184,${a})`;
    ctx.fill();
    ctx.strokeStyle =
      g.state === "hunt" ? "rgba(248,113,113,0.45)"
        : g.state === "suspicious" ? "rgba(251,191,36,0.4)"
          : "rgba(148,163,184,0.28)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawPlayerSprite(p) {
    const drawScale = 40 / CELL;
    const dx = -CELL * drawScale / 2;
    const dy = -CELL * drawScale * 0.85;
    let sheet = playerIdle;
    if (p.anim === "attack" && playerAtk.ok) sheet = playerAtk;
    else if ((p.anim === "walk" || p.dashT > 0) && playerWalk.ok) sheet = playerWalk;
    else if (playerIdle.ok) sheet = playerIdle;
    else {
      drawFallback(playerFb, dx, dy, 40);
      return;
    }
    if (!drawFrame(sheet, p.frame, dx, dy, drawScale)) {
      drawFallback(playerFb, dx, dy, 40);
    }
  }

  function drawGuardSprite(g) {
    const drawScale = 40 / CELL;
    const dx = -CELL * drawScale / 2;
    const dy = -CELL * drawScale * 0.85;

    if (g.dying || g.hitPose > 0) {
      const fr = g.dying ? g.deathFrame : 1;
      if (guardHitDeath.ok && drawFrame(guardHitDeath, fr, dx, dy, drawScale)) return;
    }

    let sheet = guardIdle;
    if (g.moving && guardWalk.ok) sheet = guardWalk;
    else if (guardIdle.ok) sheet = guardIdle;
    else if (guardSheet.ok) sheet = guardSheet;
    else {
      drawFallback(guardFb, dx, dy, 40);
      return;
    }
    if (!drawFrame(sheet, g.frame, dx, dy, drawScale)) {
      drawFallback(guardFb, dx, dy, 40);
    }
  }

  function draw() {
    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    ctx.clearRect(0, 0, viewW, viewH);

    let shx = 0, shy = 0;
    if (state.shake > 0) {
      shx = (Math.random() - 0.5) * state.shake;
      shy = (Math.random() - 0.5) * state.shake;
    }

    const ox = viewW / 2 - state.camX + shx;
    const oy = viewH * 0.38 - state.camY + shy;

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const s = worldToScreen(x + 0.5, y + 0.5);
        const wall = isWall(x, y);
        const checker = (x + y) % 2 === 0;
        if (wall) {
          drawDiamond(s.x + ox, s.y + oy - 8, "#1e1b4b", "#312e81");
          ctx.fillStyle = "#3b3f6b";
          ctx.beginPath();
          ctx.moveTo(s.x + ox - TILE_W / 2, s.y + oy);
          ctx.lineTo(s.x + ox, s.y + oy + TILE_H / 2);
          ctx.lineTo(s.x + ox, s.y + oy + TILE_H / 2 + 10);
          ctx.lineTo(s.x + ox - TILE_W / 2, s.y + oy + 10);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#0f172a";
          ctx.beginPath();
          ctx.moveTo(s.x + ox + TILE_W / 2, s.y + oy);
          ctx.lineTo(s.x + ox, s.y + oy + TILE_H / 2);
          ctx.lineTo(s.x + ox, s.y + oy + TILE_H / 2 + 10);
          ctx.lineTo(s.x + ox + TILE_W / 2, s.y + oy + 10);
          ctx.closePath();
          ctx.fill();
        } else {
          drawDiamond(s.x + ox, s.y + oy, checker ? "#14301f" : "#102818", "rgba(74,222,128,0.08)");
        }
      }
    }

    for (const g of state.guards) {
      if (!g.alive && !g.dying) continue;
      if (g.dying && g.alpha < 0.05) continue;
      if (g.alive) drawCone(g, ox, oy);
    }

    for (const pt of state.particles) {
      const s = worldToScreen(pt.x, pt.y);
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(s.x + ox, s.y + oy, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const ents = [];
    if (state.player) ents.push({ kind: "player", e: state.player, d: state.player.x + state.player.y });
    for (const g of state.guards) {
      if (g.alive || g.dying) ents.push({ kind: "guard", e: g, d: g.x + g.y });
    }
    ents.sort((a, b) => a.d - b.d);

    for (const item of ents) {
      if (item.kind === "guard") {
        const g = item.e;
        const s = worldToScreen(g.x, g.y);
        ctx.save();
        ctx.translate(s.x + ox, s.y + oy);
        ctx.scale(g.scale * (2 - g.squash), g.scale * g.squash);
        ctx.globalAlpha = g.dying ? g.alpha : (g.hitFlash > 0 ? 0.55 + 0.45 * Math.sin(g.hitFlash * 70) : 1);
        if (g.hitFlash > 0) {
          ctx.shadowColor = "#fbbf24";
          ctx.shadowBlur = 14;
        }
        drawGuardSprite(g);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        if (!g.dying) {
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -8);
          ctx.lineTo(Math.cos(g.facing) * 14, -8 + Math.sin(g.facing) * 7);
          ctx.stroke();
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(-12, -28, 24, 4);
          ctx.fillStyle = g.alert > 0.7 ? "#ef4444" : g.alert > 0.3 ? "#fbbf24" : "#1e3a5f";
          ctx.fillRect(-12, -28, 24 * g.alert, 4);
        }
        ctx.restore();
      } else {
        const p = item.e;
        const s = worldToScreen(p.x, p.y);
        ctx.save();
        ctx.translate(s.x + ox, s.y + oy);
        ctx.scale(p.scale * (p.atkPlaying ? 1.08 : 1), p.scale * (p.atkPlaying ? 0.92 : 1));
        ctx.rotate(p.facing * 0.15);
        drawPlayerSprite(p);
        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset after rotate for tick — re-apply
        // redraw facing tick in screen space relative
        ctx.restore();
        ctx.save();
        ctx.translate(s.x + ox, s.y + oy);
        ctx.strokeStyle = "#f87171";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(Math.cos(p.facing) * 12, -4 + Math.sin(p.facing) * 6);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (state.takedownFx) {
      const fx = state.takedownFx;
      const s = worldToScreen(fx.x, fx.y);
      const a = fx.life / 0.4;
      ctx.globalAlpha = a;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x + ox, s.y + oy - 10, 10 + (1 - a) * 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const ft of state.floatTexts) {
      const s = worldToScreen(ft.x, ft.y);
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life / ft.max);
      ctx.fillStyle = ft.color;
      ctx.font = "bold 13px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 4;
      ctx.fillText(ft.text, s.x + ox, s.y + oy);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(viewW * 0.2, 4, viewW * 0.6, 6);
    ctx.fillStyle =
      state.globalAlert > 0.7 ? "#ef4444" : state.globalAlert > 0.35 ? "#fbbf24" : "#1e3a5f";
    ctx.fillRect(viewW * 0.2, 4, viewW * 0.6 * state.globalAlert, 6);

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(251,191,36,${Math.min(0.35, state.flash * 2)})`;
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

  showOverlay(
    "Shadow Takedown",
    "Iso stealth. Avoid vision cones. Dash + takedown from behind.",
    "Play"
  );
  updateHUD();
  requestAnimationFrame(frame);
})();
