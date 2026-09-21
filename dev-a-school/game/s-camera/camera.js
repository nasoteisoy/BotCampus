/*! Dev A — Game STANDARDS kind: Camera / UI feel
 * World ≠ screen; pan; pinch-to-midpoint; clamps; zoom buttons.
 * rAF loop only drives camera/render — not a website form.
 */
(function () {
  'use strict';
  var world = { w: 1600, h: 2200 };
  var cam = { x: 0, y: 0, scale: 1, min: 0.35, max: 2.8 };
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var stage = document.getElementById('stage');
  var zEl = document.getElementById('z');
  var modeEl = document.getElementById('mode');

  var markers = [
    { x: 280, y: 400, label: 'A', c: '#38bdf8' },
    { x: 900, y: 700, label: 'B', c: '#f472b6' },
    { x: 1200, y: 1500, label: 'C', c: '#a3e635' },
    { x: 500, y: 1700, label: 'D', c: '#fbbf24' }
  ];

  var pointers = new Map();
  var gesture = null; // null | pan | pinch
  var panLast = null;
  var pinch = null; // {dist, scale, mid}

  function resize() {
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var w = innerWidth, h = innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clampCam();
  }

  function softClampZoom(s) {
    return Math.min(cam.max, Math.max(cam.min, s));
  }

  function zoomMinFit() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    return Math.min(w / world.w, h / world.h) * 0.94;
  }

  function clampCam() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    var ww = world.w * cam.scale, wh = world.h * cam.scale;
    if (ww <= w) cam.x = (w - ww) / 2;
    else cam.x = Math.min(0, Math.max(w - ww, cam.x));
    if (wh <= h) cam.y = (h - wh) / 2;
    else cam.y = Math.min(0, Math.max(h - wh, cam.y));
  }

  function fitWorld() {
    cam.scale = softClampZoom(zoomMinFit());
    cam.x = (canvas.clientWidth - world.w * cam.scale) / 2;
    cam.y = (canvas.clientHeight - world.h * cam.scale) / 2;
    clampCam();
    syncHud();
  }

  function zoomAt(clientX, clientY, newScale) {
    var r = canvas.getBoundingClientRect();
    var fx = clientX - r.left, fy = clientY - r.top;
    var wx = (fx - cam.x) / cam.scale;
    var wy = (fy - cam.y) / cam.scale;
    cam.scale = softClampZoom(newScale);
    cam.x = fx - wx * cam.scale;
    cam.y = fy - wy * cam.scale;
    clampCam();
    syncHud();
  }

  function syncHud() {
    zEl.textContent = cam.scale.toFixed(2);
  }

  function pts() {
    return Array.from(pointers.values());
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  stage.addEventListener('pointerdown', function (e) {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    var p = pts();
    if (p.length === 1) {
      gesture = null;
      panLast = { x: p[0].x, y: p[0].y };
      modeEl.textContent = 'pan-ready';
    } else if (p.length >= 2) {
      gesture = 'pinch';
      var a = p[0], b = p[1];
      pinch = {
        dist: dist(a, b) || 1,
        scale: cam.scale,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      };
      modeEl.textContent = 'pinch';
    }
  });

  stage.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    var p = pts();
    if (p.length >= 2 && pinch) {
      gesture = 'pinch';
      var a = p[0], b = p[1];
      var d = dist(a, b) || 1;
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      var next = pinch.scale * (d / pinch.dist);
      zoomAt(mid.x, mid.y, next);
      // keep pinch anchor updated lightly
      pinch.mid = mid;
      modeEl.textContent = 'pinch';
      return;
    }
    if (p.length === 1 && panLast) {
      var dx = p[0].x - panLast.x;
      var dy = p[0].y - panLast.y;
      if (!gesture && Math.hypot(dx, dy) > 6) {
        gesture = 'pan';
        stage.classList.add('dragging');
      }
      if (gesture === 'pan') {
        cam.x += dx;
        cam.y += dy;
        panLast = { x: p[0].x, y: p[0].y };
        clampCam();
        modeEl.textContent = 'pan';
      }
    }
  });

  function endPtr(e) {
    pointers.delete(e.pointerId);
    var p = pts();
    if (p.length < 2) pinch = null;
    if (p.length === 0) {
      gesture = null;
      panLast = null;
      stage.classList.remove('dragging');
      modeEl.textContent = 'idle';
    } else if (p.length === 1) {
      gesture = null;
      panLast = { x: p[0].x, y: p[0].y };
      modeEl.textContent = 'pan-ready';
    }
  }
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);

  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(e.clientX, e.clientY, cam.scale * f);
  }, { passive: false });

  document.getElementById('zin').onclick = function () {
    var r = canvas.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, cam.scale * 1.2);
  };
  document.getElementById('zout').onclick = function () {
    var r = canvas.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, cam.scale / 1.2);
  };
  document.getElementById('zfit').onclick = fitWorld;

  function render() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.scale, cam.scale);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, world.w, world.h);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, world.w - 16, world.h - 16);

    // grid in world space
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    for (var x = 0; x <= world.w; x += 100) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, world.h); ctx.stroke();
    }
    for (var y = 0; y <= world.h; y += 100) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(world.w, y); ctx.stroke();
    }

    markers.forEach(function (m) {
      ctx.beginPath();
      ctx.fillStyle = m.c;
      ctx.arc(m.x, m.y, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.label, m.x, m.y);
    });

    ctx.restore();
  }

  function frame() {
    requestAnimationFrame(frame);
    render();
  }

  addEventListener('resize', function () { resize(); clampCam(); });
  resize();
  fitWorld();
  requestAnimationFrame(frame);
})();
