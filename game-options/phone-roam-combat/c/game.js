
  function loadImg(src) {
    var im = new Image();
    im.ok = false;
    im.onload = function () { im.ok = true; };
    im.onerror = function () { im.ok = false; };
    im.src = src;
    return im;
  }
  var heroImg = loadImg('./art/player.png');
  var heroImg2 = loadImg('./art/player_f2.png');
  var guardImg = loadImg('./art/guard.png');

(function () {
  "use strict";

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

  // fake iso: screen = ((x-y)*tileW/2, (x+y)*tileH/2)
  const TILE_W = 54;
  const TILE_H = 27;
  const MAP_W = 14;
  const MAP_H = 14;

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
      // map screen stick to iso-ish world axes (screen-up = NW)
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

  function bindTap(btn, onDown) {
    btn.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        btn.classList.add("held");
        btn.setPointerCapture(e.pointerId);
        onDown();
      },
      { passive: false }
    );
    function up() {
      btn.classList.remove("held");
    }
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  }
  bindTap(dashBtn, () => {
    dashPressed = true;
  });
  bindTap(atkBtn, () => {
    atkPressed = true;
  });

  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "ShiftLeft" || e.code === "KeyK") dashPressed = true;
    if (e.code === "KeyJ" || e.code === "KeyZ" || e.code === "Space") atkPressed = true;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
      e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  // cover blocks (world tile coords)
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
    globalAlert: 0, // 0..1 meter
    shake: 0,
    flash: 0,
    camX: 0,
    camY: 0,
    player: null,
    guards: [],
    particles: [],
    takedownFx: null,
  };

  function makePlayer() {
    return {
      x: 1.5,
      y: 1.5,
      facing: 0, // radians in world xz-ish
      speed: 2.6,
      dashCd: 0,
      dashT: 0,
      dashDirX: 0,
      dashDirY: 0,
      atkCd: 0,
      scale: 1,
      hidden: false,
      spotted: false,
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
      x: s.x,
      y: s.y,
      facing: s.facing,
      patrol: s.patrol,
      patrolIdx: 0,
      alert: 0, // 0 calm .. 1 hunting
      state: "patrol", // patrol | suspicious | hunt | dead
      coneLen: 3.2,
      coneHalf: 0.55,
      speed: 1.35,
      huntTimer: 0,
      hitFlash: 0,
      scale: 1,
      alive: true,
    }));
  }

  function resetRun() {
    state.marks = 0;
    state.globalAlert = 0;
    state.shake = 0;
    state.flash = 0;
    state.player = makePlayer();
    placeGuards();
    state.particles.length = 0;
    state.takedownFx = null;
    state.phase = "play";
    overlay.classList.remove("show");
    updateHUD();
  }

  function burst(wx, wy, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3;
      state.particles.push({
        x: wx,
        y: wy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.3,
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
    // WASD in screen-ish: W = decrease both? map to world
    if (keys["KeyW"] || keys["ArrowUp"]) {
      mx -= 0.7;
      my -= 0.7;
    }
    if (keys["KeyS"] || keys["ArrowDown"]) {
      mx += 0.7;
      my += 0.7;
    }
    if (keys["KeyA"] || keys["ArrowLeft"]) {
      mx -= 0.7;
      my += 0.7;
    }
    if (keys["KeyD"] || keys["ArrowRight"]) {
      mx += 0.7;
      my -= 0.7;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    return { x: mx, y: my };
  }

  function tryMove(ent, dx, dy) {
    const nx = ent.x + dx;
    const ny = ent.y + dy;
    const r = 0.28;
    // corner samples
    const samples = [
      [nx - r, ny - r],
      [nx + r, ny - r],
      [nx - r, ny + r],
      [nx + r, ny + r],
    ];
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
    if (!guard.alive) return false;
    const dx = px - guard.x;
    const dy = py - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > guard.coneLen) return false;
    const ang = Math.atan2(dy, dx);
    if (Math.abs(angleDiff(ang, guard.facing)) > guard.coneHalf) return false;
    // crude LOS: step toward player
    const steps = Math.ceil(dist * 4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const lx = guard.x + dx * t;
      const ly = guard.y + dy * t;
      if (isWall(Math.floor(lx), Math.floor(ly))) return false;
    }
    return true;
  }

  function behindGuard(guard, px, py) {
    const dx = px - guard.x;
    const dy = py - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1.15) return false;
    const angToPlayer = Math.atan2(dy, dx);
    // player is behind if opposite to facing
    return Math.abs(angleDiff(angToPlayer, guard.facing + Math.PI)) < 0.9;
  }

  function updateHUD() {
    const p = state.player;
    hudScore.textContent = "Marks " + state.marks + "/" + state.targetMarks;
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
    overlay.classList.add("show");
  }
  ovBtn.addEventListener("click", resetRun);

  function fixedUpdate() {
    if (state.phase !== "play") return;
    const p = state.player;
    const mv = readMove();

    // consume edge presses
    const doDash = dashPressed && !dashLatch;
    const doAtk = atkPressed && !atkLatch;
    dashLatch = dashPressed;
    atkLatch = atkPressed;
    dashPressed = false;
    atkPressed = false;

    if (p.dashCd > 0) p.dashCd -= DT;
    if (p.atkCd > 0) p.atkCd -= DT;
    p.scale += (1 - p.scale) * 0.2;

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
      state.flash = 0.05;
      burst(p.x, p.y, "#a3e635", 6);
    }

    // near cover = slight hide bonus (not in open)
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    p.hidden =
      isWall(tx + 1, ty) ||
      isWall(tx - 1, ty) ||
      isWall(tx, ty + 1) ||
      isWall(tx, ty - 1);

    // takedown
    if (doAtk && p.atkCd <= 0) {
      p.atkCd = 0.35;
      p.scale = 1.2;
      let scored = false;
      for (const g of state.guards) {
        if (!g.alive) continue;
        const dist = Math.hypot(g.x - p.x, g.y - p.y);
        if (dist > 1.55) continue;
        const unseen = g.alert < 0.55 && !canSee(g, p.x, p.y);
        const rear = behindGuard(g, p.x, p.y);
        if ((rear || unseen) && g.state !== "hunt") {
          // success
          g.alive = false;
          g.state = "dead";
          g.hitFlash = 0.2;
          state.marks++;
          state.scoreBoost = true;
          state.shake = 8;
          state.flash = 0.12;
          burst(g.x, g.y, "#1e3a5f", 16);
          state.takedownFx = { x: g.x, y: g.y, life: 0.35 };
          scored = true;
          // calm a bit on clean kill
          state.globalAlert = Math.max(0, state.globalAlert - 0.15);
          break;
        } else if (dist < 1.0) {
          // botched — alert
          g.alert = 1;
          g.state = "hunt";
          g.huntTimer = 4;
          state.globalAlert = Math.min(1, state.globalAlert + 0.45);
          state.shake = 6;
          state.flash = 0.08;
          burst(g.x, g.y, "#f87171", 8);
        }
      }
      if (!scored && state.takedownFx == null) {
        // swing miss juice
        p.scale = 1.1;
      }
    }

    // guards
    let anySee = false;
    for (const g of state.guards) {
      if (!g.alive) continue;
      if (g.hitFlash > 0) g.hitFlash -= DT;
      g.scale += (1 - g.scale) * 0.15;

      const sees = canSee(g, p.x, p.y);
      if (sees) {
        anySee = true;
        g.alert = Math.min(1, g.alert + DT * (p.hidden ? 0.55 : 1.2));
        if (g.alert > 0.35) g.state = "suspicious";
        if (g.alert >= 1) {
          g.state = "hunt";
          g.huntTimer = 5;
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

      if (g.state === "hunt") {
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        const dist = Math.hypot(dx, dy) || 1;
        g.facing = Math.atan2(dy, dx);
        tryMove(g, (dx / dist) * g.speed * 1.35 * DT, (dy / dist) * g.speed * 1.35 * DT);
        if (dist < 0.55) {
          // caught
          state.phase = "dead";
          state.shake = 14;
          state.flash = 0.2;
          showOverlay("Spotted & Caught", "Marks " + state.marks + "/" + state.targetMarks, "Retry");
        }
      } else if (g.state === "suspicious") {
        g.facing = Math.atan2(p.y - g.y, p.x - g.x);
      } else {
        // patrol
        const target = g.patrol[g.patrolIdx];
        const dx = target.x - g.x;
        const dy = target.y - g.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.15) {
          g.patrolIdx = (g.patrolIdx + 1) % g.patrol.length;
        } else {
          g.facing = Math.atan2(dy, dx);
          tryMove(g, (dx / dist) * g.speed * DT, (dy / dist) * g.speed * DT);
        }
      }
    }

    // global alert meter
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

    // camera follow iso center
    const ps = worldToScreen(p.x, p.y);
    state.camX += (ps.x - state.camX) * 0.1;
    state.camY += (ps.y - state.camY) * 0.1;

    if (state.shake > 0) state.shake *= 0.85;
    if (state.shake < 0.2) state.shake = 0;
    if (state.flash > 0) state.flash -= DT;

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
    ctx.beginPath();
    ctx.moveTo(origin.x + ox, origin.y + oy);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = g.facing - g.coneHalf + t * g.coneHalf * 2;
      const ex = g.x + Math.cos(ang) * g.coneLen;
      const ey = g.y + Math.sin(ang) * g.coneLen;
      const s = worldToScreen(ex, ey);
      ctx.lineTo(s.x + ox, s.y + oy);
    }
    ctx.closePath();
    const a = 0.12 + g.alert * 0.2;
    ctx.fillStyle =
      g.state === "hunt"
        ? `rgba(248,113,113,${a + 0.1})`
        : g.state === "suspicious"
          ? `rgba(251,191,36,${a})`
          : `rgba(148,163,184,${a})`;
    ctx.fill();
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

    const ox = viewW / 2 - state.camX + shx;
    const oy = viewH * 0.38 - state.camY + shy;

    // tiles
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const s = worldToScreen(x + 0.5, y + 0.5);
        const wall = isWall(x, y);
        const checker = (x + y) % 2 === 0;
        if (wall) {
          // raised block
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
          drawDiamond(
            s.x + ox,
            s.y + oy,
            checker ? "#14301f" : "#102818",
            "rgba(74,222,128,0.08)"
          );
        }
      }
    }

    // cones under actors
    for (const g of state.guards) {
      if (!g.alive) continue;
      drawCone(g, ox, oy);
    }

    // particles
    for (const pt of state.particles) {
      const s = worldToScreen(pt.x, pt.y);
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(s.x + ox, s.y + oy, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // depth sort entities
    const ents = [];
    if (state.player) ents.push({ kind: "player", e: state.player, d: state.player.x + state.player.y });
    for (const g of state.guards) {
      if (g.alive) ents.push({ kind: "guard", e: g, d: g.x + g.y });
    }
    ents.sort((a, b) => a.d - b.d);

    for (const item of ents) {
      if (item.kind === "guard") {
        const g = item.e;
        const s = worldToScreen(g.x, g.y);
        ctx.save();
        ctx.translate(s.x + ox, s.y + oy);
        ctx.scale(g.scale, g.scale);
        // illustrated guard only
        if (guardImg.ok) {
          const gs = 40;
          if (g.hitFlash > 0) ctx.globalAlpha = 0.9;
          ctx.drawImage(guardImg, -gs / 2, -gs * 0.85, gs, gs);
          ctx.globalAlpha = 1;
        }
        // no diamond shape fallback
        // facing tick
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(Math.cos(g.facing) * 14, -8 + Math.sin(g.facing) * 7);
        ctx.stroke();
        // alert meter
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(-12, -28, 24, 4);
        ctx.fillStyle = g.alert > 0.7 ? "#ef4444" : g.alert > 0.3 ? "#fbbf24" : "#1e3a5f";
        ctx.fillRect(-12, -28, 24 * g.alert, 4);
        ctx.restore();
      } else {
        const p = item.e;
        const s = worldToScreen(p.x, p.y);
        ctx.save();
        ctx.translate(s.x + ox, s.y + oy);
        ctx.scale(p.scale, p.scale);
        {
          const dashing = p.dashT > 0;
          const himg = (dashing && heroImg2.ok) ? heroImg2 : heroImg;
          if (himg.ok) {
            const s = 40 * p.scale;
            ctx.rotate(p.facing * 0.15);
            ctx.drawImage(himg, -s / 2, -s * 0.85, s, s);
          }
          // no ellipse assassin fallback
        }
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
      const a = fx.life / 0.35;
      ctx.globalAlpha = a;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x + ox, s.y + oy - 10, 10 + (1 - a) * 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // alert bar top
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
