/*! Game STANDARDS kind: Juice / feedback — mute-safe, proportional, synced to sim events */
(function () {
  'use strict';
  var FIXED = 1 / 60, MAX_F = 0.25, MAX_S = 5;
  var canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
  var hitsEl = document.getElementById('hits'), missEl = document.getElementById('miss'), evtEl = document.getElementById('evt');
  var w = 720, h = 1100, acc = 0, last = 0, hits = 0, misses = 0;
  var targets = [], fx = [], shake = 0;

  function resize() {
    var dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    w = innerWidth; h = innerHeight;
  }

  function spawn() {
    targets = [];
    for (var i = 0; i < 4; i++) {
      targets.push({
        x: 80 + Math.random() * (w - 160),
        y: 120 + Math.random() * (h - 220),
        r: 34 + Math.random() * 10,
        pop: 0,
        alive: true
      });
    }
  }

  function onHit(t) {
    t.alive = false;
    t.pop = 1;
    hits++;
    hitsEl.textContent = String(hits);
    evtEl.textContent = 'HIT';
    shake = 10;
    // mute-safe juice from sim event
    fx.push({ kind: 'ring', x: t.x, y: t.y, life: 0.35, c: '#38bdf8' });
    fx.push({ kind: 'flash', x: t.x, y: t.y, life: 0.18, c: '#f8fafc' });
  }

  function onMiss(x, y) {
    misses++;
    missEl.textContent = String(misses);
    evtEl.textContent = 'MISS';
    fx.push({ kind: 'x', x: x, y: y, life: 0.28, c: '#f43f5e' });
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    var hit = null;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t.alive) continue;
      if (Math.hypot(x - t.x, y - t.y) <= t.r) { hit = t; break; }
    }
    if (hit) onHit(hit);
    else onMiss(x, y);
    if (targets.every(function (t) { return !t.alive; })) spawn();
  }, { passive: false });

  function update(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt * 40);
    for (var i = fx.length - 1; i >= 0; i--) {
      fx[i].life -= dt;
      if (fx[i].life <= 0) fx.splice(i, 1);
    }
    targets.forEach(function (t) {
      if (t.pop > 0) t.pop = Math.max(0, t.pop - dt * 4);
    });
  }

  function render() {
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    ctx.clearRect(-20, -20, w + 40, h + 40);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);

    targets.forEach(function (t) {
      if (!t.alive && t.pop <= 0) return;
      var s = t.alive ? 1 : (0.3 + t.pop);
      ctx.beginPath();
      ctx.fillStyle = t.alive ? '#22d3ee' : '#38bdf866';
      ctx.arc(t.x, t.y, t.r * s, 0, Math.PI * 2);
      ctx.fill();
      if (t.alive) {
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });

    fx.forEach(function (f) {
      var a = Math.max(0, f.life);
      if (f.kind === 'ring') {
        ctx.beginPath();
        ctx.strokeStyle = f.c;
        ctx.globalAlpha = a / 0.35;
        ctx.lineWidth = 4;
        ctx.arc(f.x, f.y, 20 + (1 - a / 0.35) * 50, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'flash') {
        ctx.fillStyle = f.c;
        ctx.globalAlpha = a / 0.18;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'x') {
        ctx.strokeStyle = f.c;
        ctx.globalAlpha = a / 0.28;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(f.x - 12, f.y - 12); ctx.lineTo(f.x + 12, f.y + 12);
        ctx.moveTo(f.x + 12, f.y - 12); ctx.lineTo(f.x - 12, f.y + 12);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
    ctx.restore();
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    var ft = Math.min(MAX_F, (ts - last) / 1000);
    last = ts;
    acc += ft;
    var steps = 0;
    while (acc >= FIXED && steps < MAX_S) { update(FIXED); acc -= FIXED; steps++; }
    if (steps === MAX_S) acc = 0;
    render();
  }

  addEventListener('resize', function () { resize(); spawn(); });
  resize(); spawn();
  requestAnimationFrame(frame);
})();
