// Canvas 2D view — camera, juice, WebAudio, touch/mouse, HUD clear of shell pause.
const HINT_MOUSE = 'click unit → point ground → aim enemy · drag pan · scroll zoom';
const HINT_TOUCH = 'tap unit → point ground → aim enemy · drag pan · pinch zoom';

export class GroundView {
  constructor(mount, sim, hooks) {
    this.mount = mount;
    this.sim = sim;
    this.hooks = hooks || {};
    this.disposed = false;
    this.hintShown = true;
    this.hintT = 0;
    this.frameTimes = [];
    this._lastFrame = 0;
    this.muted = false;
    this._audio = null;
    this._audioReady = false;

    // Camera (world units / zoom)
    this.camX = sim.W / 2;
    this.camY = sim.H / 2;
    this.camZ = 1;
    this.camTX = this.camX;
    this.camTY = this.camY;
    this.camTZ = 1;
    this._pointers = new Map();
    this._pinchStartDist = 0;
    this._pinchStartZ = 1;
    this._panning = false;
    this._moved = false;

    mount.innerHTML = '';
    {
      const pos = getComputedStyle(mount).position;
      if (pos === 'static') mount.style.position = 'relative';
    }
    mount.style.overflow = 'hidden';
    mount.style.background = '#0a0e18';
    mount.style.touchAction = 'none';
    mount.style.userSelect = 'none';
    mount.style.webkitUserSelect = 'none';
    if (!mount.style.width && !mount.clientWidth) {
      mount.style.inset = mount.style.inset || '0';
      mount.style.width = '100%';
      mount.style.height = '100%';
    }

    this.root = document.createElement('div');
    this.root.className = 'sc-ground';
    this.root.setAttribute('data-sc-ground', '1');
    Object.assign(this.root.style, {
      position: 'absolute', inset: '0', overflow: 'hidden',
      fontFamily: 'system-ui,Segoe UI,sans-serif', color: '#e8eef8',
      touchAction: 'none',
    });

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-sc-canvas', '1');
    Object.assign(this.canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block',
      touchAction: 'none',
    });
    this.ctx = this.canvas.getContext('2d');

    const touch = this._isTouch();
    const hint = touch ? HINT_TOUCH : HINT_MOUSE;

    this.hud = document.createElement('div');
    this.hud.className = 'sc-ground-hud';
    this.hud.innerHTML = `
      <div class="sc-top" data-sc-top>
        <div class="sc-planet" data-sc-planet></div>
        <div class="sc-hint" data-sc-hint>${hint}</div>
        <button type="button" class="sc-btn sc-mute" data-sc-mute aria-label="Mute"><span>Sound</span></button>
      </div>
      <div class="sc-bottom" data-sc-bottom>
        <button type="button" class="sc-btn" data-sc-speed aria-label="Speed"><span data-sc-speed-label>Speed</span> <b data-sc-speed-val>1×</b></button>
        <button type="button" class="sc-btn sc-retreat" data-sc-retreat aria-label="Retreat"><span>Retreat</span></button>
      </div>
      <div class="sc-sel" data-sc-sel hidden></div>
      <div class="sc-banner" data-sc-banner hidden></div>
    `;
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    this.root.append(this.canvas, this.hud);
    mount.append(this.style, this.root);

    this._bind();
    this._paintHudStatic();
    const sv = this.hud.querySelector('[data-sc-speed-val]');
    if (sv) sv.textContent = (this.sim.speed || 2) + '×';
    this.resize();
  }

  _isTouch() {
    try {
      return matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    } catch (_) { return false; }
  }

  _paused() {
    return !!(this.hooks.isPaused && this.hooks.isPaused());
  }

  _ensureAudio() {
    if (this._audioReady || this.muted) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this._audio) this._audio = new AC();
      if (this._audio.state === 'suspended') this._audio.resume();
      this._audioReady = true;
    } catch (_) {}
  }

  /** Modest WebAudio blips — no files. */
  playSound(kind) {
    if (this.muted || this.disposed) return;
    this._ensureAudio();
    const ac = this._audio;
    if (!ac) return;
    try {
      const t0 = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      let freq = 440, dur = 0.08, type = 'square', vol = 0.04;
      if (kind === 'shoot') { freq = 520; dur = 0.06; type = 'square'; vol = 0.035; }
      else if (kind === 'tank') { freq = 120; dur = 0.14; type = 'sawtooth'; vol = 0.05; }
      else if (kind === 'hit') { freq = 180; dur = 0.09; type = 'triangle'; vol = 0.045; }
      else if (kind === 'kill') { freq = 90; dur = 0.22; type = 'sawtooth'; vol = 0.055; }
      else if (kind === 'ui') { freq = 660; dur = 0.05; type = 'sine'; vol = 0.03; }
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (kind === 'kill') o.frequency.exponentialRampToValueAtTime(40, t0 + dur);
      if (kind === 'hit') o.frequency.exponentialRampToValueAtTime(90, t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (_) {}
  }

  _bind() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (window.visualViewport) visualViewport.addEventListener('resize', this._onResize);

    this._onPointerDown = (e) => {
      if (this._paused()) return;
      if (e.target.closest && e.target.closest('.sc-btn, .sc-banner')) return;
      e.preventDefault();
      this._ensureAudio();
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      this._moved = false;
      this._panning = false;
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      if (this._pointers.size === 2) {
        const pts = [...this._pointers.values()];
        this._pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        this._pinchStartZ = this.camTZ;
        this._panning = true;
      }
    };

    this._onPointerMove = (e) => {
      if (this._paused()) return;
      if (!this._pointers.has(e.pointerId)) return;
      e.preventDefault();
      const prev = this._pointers.get(e.pointerId);
      const nx = e.clientX, ny = e.clientY;
      const dx = nx - prev.x, dy = ny - prev.y;
      prev.x = nx; prev.y = ny;
      this._pointers.set(e.pointerId, prev);

      if (this._pointers.size === 2) {
        const pts = [...this._pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const ratio = dist / this._pinchStartDist;
        this.camTZ = this._clampZ(this._pinchStartZ * ratio);
        // pan by average movement
        const inv = 1 / (this.scale * this.camZ);
        // use last mid delta via storing
        if (this._lastMid) {
          this.camTX -= (midX - this._lastMid.x) * inv;
          this.camTY -= (midY - this._lastMid.y) * inv;
          this._clampCam();
        }
        this._lastMid = { x: midX, y: midY };
        this._panning = true;
        this._moved = true;
        this.hintShown = false;
        return;
      }

      if (this._pointers.size === 1) {
        const dist = Math.hypot(nx - prev.sx, ny - prev.sy);
        if (dist > 10) {
          this._panning = true;
          this._moved = true;
          const inv = 1 / (this.scale * this.camZ);
          this.camTX -= dx * inv;
          this.camTY -= dy * inv;
          this._clampCam();
          this.hintShown = false;
        }
      }
    };

    this._onPointerUp = (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      const p = this._pointers.get(e.pointerId);
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._lastMid = null;
      if (this._pointers.size === 0) {
        const wasPan = this._panning || this._moved;
        const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
        this._panning = false;
        this._moved = false;
        if (wasPan || Math.hypot(dx, dy) > 14) return;
        if (this._paused()) return;
        if (this.sim.phase === 'intro' || this.sim.phase === 'spawn' || this.sim.phase === 'outro') {
          this.sim.skipBanner();
          return;
        }
        if (this.sim.phase === 'drop') {
          this.sim.skipDrop();
          this.hintShown = false;
          return;
        }
        const w = this.screenToWorld(e.clientX, e.clientY);
        if (!w) return;
        const act = this.sim.tap(w.x, w.y);
        if (act !== 'busy' && act !== 'none') this.hintShown = false;
        this._paintSel();
      }
    };

    this._onWheel = (e) => {
      if (this._paused()) return;
      e.preventDefault();
      this._ensureAudio();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const before = this.screenToWorld(e.clientX, e.clientY);
      this.camTZ = this._clampZ(this.camTZ * factor);
      // keep point under cursor stable
      if (before) {
        const after = this.screenToWorld(e.clientX, e.clientY);
        if (after) {
          this.camTX += before.x - after.x;
          this.camTY += before.y - after.y;
          this._clampCam();
        }
      }
      this.hintShown = false;
    };

    this._onKey = (e) => {
      if (this._paused() || this.disposed) return;
      const step = 0.55 / Math.max(0.5, this.camZ);
      let used = true;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.camTX -= step;
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.camTX += step;
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.camTY -= step;
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.camTY += step;
      else if (e.key === '=' || e.key === '+') this.camTZ = this._clampZ(this.camTZ * 1.08);
      else if (e.key === '-' || e.key === '_') this.camTZ = this._clampZ(this.camTZ * 0.92);
      else if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        if (this.sim.phase === 'drop') this.sim.skipDrop();
        else if (this.sim.phase === 'intro' || this.sim.phase === 'spawn' || this.sim.phase === 'outro') this.sim.skipBanner();
        else used = false;
      } else used = false;
      if (used) { e.preventDefault(); this._clampCam(); this.hintShown = false; }
    };

    this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: false });
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('keydown', this._onKey);

    this.hud.querySelector('[data-sc-banner]').addEventListener('click', () => {
      if (!this._paused()) this.sim.skipBanner();
    });

    this.hud.querySelector('[data-sc-speed]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._paused()) return;
      this._ensureAudio();
      this.playSound('ui');
      const s = this.sim.cycleSpeed();
      this.hud.querySelector('[data-sc-speed-val]').textContent = s + '×';
      this.hooks.onSpeed?.(s);
    });
    this.hud.querySelector('[data-sc-retreat]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._paused()) return;
      this._ensureAudio();
      this.playSound('ui');
      this.hooks.onRetreat?.();
    });
    this.hud.querySelector('[data-sc-mute]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.muted = !this.muted;
      const btn = this.hud.querySelector('[data-sc-mute]');
      btn.innerHTML = this.muted ? '<span>Muted</span>' : '<span>Sound</span>';
      if (!this.muted) { this._ensureAudio(); this.playSound('ui'); }
    });

    // Track fx for sound triggers
    this._fxHeard = 0;
  }

  _clampZ(z) { return Math.max(0.7, Math.min(2.2, z)); }

  _clampCam() {
    const margin = 1.5;
    this.camTX = Math.max(margin, Math.min(this.sim.W - margin, this.camTX));
    this.camTY = Math.max(margin, Math.min(this.sim.H - margin, this.camTY));
  }

  _paintHudStatic() {
    const p = this.sim.planet || {};
    this.hud.querySelector('[data-sc-planet]').innerHTML =
      `<span class="sc-lab">${p.name || 'Planet'}</span>`;
  }

  _paintSel() {
    const box = this.hud.querySelector('[data-sc-sel]');
    const u = this.sim.selected;
    if (!u || !this.sim.alive(u) || this.sim.phase !== 'fight') { box.hidden = true; return; }
    box.hidden = false;
    const pct = Math.round((u.hpNow / u.stats.hp) * 100);
    const st = u.status === 'crawl' ? 'Crawl' : (u.covered ? 'Cover' : 'Ready');
    box.innerHTML = `
      <span class="sc-lab">${u.name}</span>
      <span class="sc-stat">HP ${Math.round(u.hpNow)}/${u.stats.hp}</span>
      <span class="sc-stat">Atk ${u.stats.attack}</span>
      <span class="sc-stat">Rng ${u.stats.range}</span>
      <span class="sc-stat">${st}</span>
      <div class="sc-hpbar"><i style="width:${pct}%;background:${u.status === 'crawl' ? '#f0a020' : '#3dce6a'}"></i></div>
    `;
  }

  _paintBanner() {
    const el = this.hud.querySelector('[data-sc-banner]');
    const ph = this.sim.phase;
    if (ph === 'intro' || ph === 'spawn') {
      el.hidden = false;
      const name = this.sim.planet?.name || 'Planet';
      el.innerHTML = `<div class="sc-ban-card"><div class="sc-ban-big">Battle for ${name}</div><div class="sc-ban-sub">Tap to skip</div></div>`;
    } else if (ph === 'outro') {
      el.hidden = false;
      const win = this.sim.playerWon();
      const pts = (this.sim._pendingResult || this.sim.result()).pointsEarned | 0;
      el.innerHTML = `<div class="sc-ban-card"><div class="sc-ban-big">${win ? 'Victory' : 'Defeat'}</div>
        <div class="sc-ban-pts">Points ${pts}</div><div class="sc-ban-sub">Tap to skip</div></div>`;
    } else {
      el.hidden = true;
    }
  }

  resize() {
    const w = this.mount.clientWidth || 320;
    const h = this.mount.clientHeight || 480;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
    this.cssW = w; this.cssH = h;
    const portrait = h > w * 1.05;
    const padT = portrait ? 40 : 36;
    const padB = portrait ? Math.max(88, Math.min(118, h * 0.15)) : Math.max(64, Math.min(84, h * 0.2));
    this.padT = padT; this.padB = padB;
    const aw = w, ah = Math.max(80, h - padT - padB);
    const sx = aw / this.sim.W, sy = ah / this.sim.H;
    this.baseScale = Math.min(sx, sy) * 0.995;
    const need = (0.72 * h) / this.sim.H;
    if (this.baseScale < need) this.baseScale = Math.min(sy * 0.998, Math.max(this.baseScale, need * 0.98));
    this.scale = this.baseScale;
    this._updateCamOffsets();
  }

  _updateCamOffsets() {
    const z = this.camZ;
    this.scale = this.baseScale * z;
    // Center camera on camX/camY within field area
    const aw = this.cssW;
    const ah = Math.max(80, this.cssH - this.padT - this.padB);
    this.offX = aw / 2 - this.camX * this.scale;
    this.offY = this.padT + ah / 2 - this.camY * this.scale;
  }

  fieldFillRatio() {
    return (this.sim.H * this.baseScale) / Math.max(1, this.cssH);
  }

  screenToWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top;
    const wx = (sx - this.offX) / this.scale;
    const wy = (sy - this.offY) / this.scale;
    if (wx < -2 || wy < -2 || wx > this.sim.W + 2 || wy > this.sim.H + 2) return null;
    return { x: wx, y: wy };
  }

  worldToScreen(wx, wy) {
    return { x: this.offX + wx * this.scale, y: this.offY + wy * this.scale };
  }

  unitPixelSize() {
    return 0.9 * 2 * this.scale;
  }

  touchTargetPx() {
    return Math.max(48, this.unitPixelSize() * 0.85);
  }

  avgFrameMs() {
    if (!this.frameTimes.length) return 0;
    let s = 0;
    for (const t of this.frameTimes) s += t;
    return s / this.frameTimes.length;
  }

  draw(dt, opts = {}) {
    if (this.disposed) return;
    if (this.sim.phase === 'spawn' && !this._autoStarted) { this._autoStarted = true; try { this.sim.autoStartCommand(); } catch(_){} }
    const paused = !!opts.paused || this._paused();
    const now = performance.now();
    if (this._lastFrame) {
      this.frameTimes.push(now - this._lastFrame);
      if (this.frameTimes.length > 60) this.frameTimes.shift();
    }
    this._lastFrame = now;

    // Smooth camera lerp (skip advance while paused)
    if (!paused && dt > 0) {
      const k = 1 - Math.exp(-10 * dt);
      this.camX += (this.camTX - this.camX) * k;
      this.camY += (this.camTY - this.camY) * k;
      this.camZ += (this.camTZ - this.camZ) * k;
      this._updateCamOffsets();
    } else {
      this._updateCamOffsets();
    }

    // Audio from new fx
    if (!paused) this._hearFx();

    const ctx = this.ctx;
    const dpr = this.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = this.cssW, H = this.cssH;
    ctx.clearRect(0, 0, W, H);

    let shx = 0, shy = 0;
    if (this.sim.shake > 0) {
      const a = this.sim.shake;
      shx = (Math.random() - 0.5) * 8 * a;
      shy = (Math.random() - 0.5) * 8 * a;
    }
    ctx.save();
    ctx.translate(shx, shy);

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1224'); g.addColorStop(1, '#152038');
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);

    const bio = this.sim.biome;
    const tl = this.worldToScreen(0, 0);
    const br = this.worldToScreen(this.sim.W, this.sim.H);
    ctx.fillStyle = bio.ground;
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.fillStyle = bio.accent;
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 6; i++) {
      const yy = tl.y + ((i + 0.5) / 6) * (br.y - tl.y);
      ctx.fillRect(tl.x, yy, br.x - tl.x, 3);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    for (const s of this.sim.scorch) {
      const p = this.worldToScreen(s.x, s.y);
      const r = s.r * this.scale;
      ctx.fillStyle = `rgba(18,10,6,${s.a})`;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.45, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
    }

    for (const pr of this.sim.props) this._drawProp(ctx, pr);
    if (!this.sim.ship.done && this.sim.phase !== 'intro') this._drawShip(ctx);

    const order = this.sim.units.slice().sort((a, b) => {
      const rank = (u) => u.status === 'out' ? 0 : u.status === 'crawl' ? 1 : 2;
      return rank(a) - rank(b) || a.y - b.y;
    });
    for (const u of order) this._drawUnit(ctx, u);
    for (const f of this.sim.fx) this._drawFx(ctx, f);

    ctx.restore();

    if (this.sim.phase === 'drop') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(W / 2 - 88, 8, 176, 34);
      ctx.strokeStyle = '#6ff3ff66';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W / 2 - 88, 8, 176, 34);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Drop · Skip', W / 2, 30);
    }

    if (!paused) this.hintT += dt;
    const hint = this.hud.querySelector('[data-sc-hint]');
    if (this.hintShown && this.sim.phase === 'fight' && this.hintT < 7) {
      hint.style.opacity = String(Math.max(0, 1 - Math.max(0, this.hintT - 4) / 3));
      hint.style.display = '';
    } else {
      hint.style.display = 'none';
      if (this.hintT >= 7) this.hintShown = false;
    }

    this._paintSel();
    this._paintBanner();
  }

  _hearFx() {
    const fx = this.sim.fx;
    // Detect newly-added short-lived fx by counting recent kinds
    for (const f of fx) {
      if (f._heard) continue;
      f._heard = true;
      if (f.kind === 'muzzle') this.playSound(f.tank ? 'tank' : 'shoot');
      else if (f.kind === 'spark' && f.n >= 8) this.playSound('hit');
      else if (f.kind === 'hitflash') this.playSound('hit');
      else if (f.kind === 'out') this.playSound('kill');
    }
  }

  _drawProp(ctx, p) {
    const c = this.worldToScreen(p.x, p.y);
    const sc = this.scale;
    const bio = this.sim.biome;
    ctx.save();
    ctx.translate(c.x, c.y);
    if (p.kind === 'wall') {
      const w = p.w * sc, h = p.h * sc;
      ctx.fillStyle = '#5a5348';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#7a7368';
      ctx.fillRect(-w / 2, -h / 2, w, Math.min(6, h * 0.2));
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    } else if (p.kind === 'tree') {
      const tr = Math.min(p.r, 0.6) * sc;
      ctx.fillStyle = '#2a4a28';
      ctx.beginPath(); ctx.arc(0, 0, tr * 1.05, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d7a3a';
      ctx.beginPath(); ctx.arc(0, -tr * 0.15, tr * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3a20';
      ctx.fillRect(-tr * 0.15, tr * 0.15, tr * 0.3, tr * 0.55);
    } else if (p.kind === 'dune') {
      ctx.fillStyle = '#a88840';
      ctx.beginPath(); ctx.ellipse(0, 0, p.w * sc * 0.55, p.h * sc * 0.42, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d4b86a';
      ctx.beginPath(); ctx.ellipse(-p.w * sc * 0.12, -p.h * sc * 0.12, p.w * sc * 0.3, p.h * sc * 0.22, -0.2, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'ice') {
      ctx.fillStyle = '#d8eef8';
      ctx.beginPath(); ctx.ellipse(0, 0, p.w * sc * 0.5, p.h * sc * 0.5, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#9bb8c8'; ctx.stroke();
    } else if (p.kind === 'coral') {
      ctx.fillStyle = '#c06070';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(Math.cos(i * 2.1) * p.r * sc * 0.4, Math.sin(i * 2.1) * p.r * sc * 0.3, p.r * sc * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.kind === 'basalt') {
      ctx.fillStyle = '#2a1a18';
      ctx.beginPath(); ctx.ellipse(0, 0, p.w * sc * 0.5, p.h * sc * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a03018';
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r * sc * 0.35, p.r * sc * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'crater') {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(0, 0, p.r * sc * 1.2, p.r * sc * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = bio.rock;
      ctx.beginPath(); ctx.ellipse(0, 0, p.w * sc * 0.5, p.h * sc * 0.45, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = bio.accent;
      ctx.beginPath(); ctx.ellipse(-p.r * sc * 0.2, -p.r * sc * 0.2, p.r * sc * 0.4, p.r * sc * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  _drawShip(ctx) {
    const s = this.sim.ship;
    if (s.done) return;
    const sy = Math.min(this.sim.H + 2, Math.max(-2, s.y));
    const p = this.worldToScreen(s.x, sy);
    // Smaller ship + fade as drop progresses (jank #4)
    const fade = Math.max(0, 1 - Math.max(0, (this.sim.dropT - 0.35) / 0.7));
    if (fade <= 0.05) return;
    const sc = this.scale * 0.55; // was full scale — shrink so units stay visible
    const alt = Math.max(0.4, s.alt);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.4 * fade;
    const shR = (1.8 + alt * 0.55) * sc;
    ctx.fillStyle = `rgba(0,0,0,${0.18 + Math.min(0.25, alt * 0.06)})`;
    ctx.beginPath();
    ctx.ellipse(p.x + alt * 2, p.y + alt * 3, shR * 1.1, shR * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(p.x, p.y - alt * sc * 0.35);
    const shipAng = Math.atan2(s.vy || 0, s.vx || 1);
    ctx.rotate(shipAng);
    ctx.fillStyle = '#b8c4d4';
    ctx.beginPath();
    ctx.moveTo(2.6 * sc, 0);
    ctx.lineTo(1.2 * sc, -0.55 * sc);
    ctx.lineTo(-1.8 * sc, -0.7 * sc);
    ctx.lineTo(-2.5 * sc, 0);
    ctx.lineTo(-1.8 * sc, 0.7 * sc);
    ctx.lineTo(1.2 * sc, 0.55 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a96a8';
    ctx.beginPath();
    ctx.moveTo(-0.2 * sc, -0.55 * sc);
    ctx.lineTo(-1.1 * sc, -1.55 * sc);
    ctx.lineTo(0.6 * sc, -0.4 * sc);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.2 * sc, 0.55 * sc);
    ctx.lineTo(-1.1 * sc, 1.55 * sc);
    ctx.lineTo(0.6 * sc, 0.4 * sc);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6ff3ff';
    ctx.beginPath(); ctx.ellipse(1.3 * sc, 0, 0.55 * sc, 0.32 * sc, 0, 0, Math.PI * 2); ctx.fill();
    const glow = 0.5 + 0.5 * Math.sin(this.sim.time * 14);
    ctx.fillStyle = `rgba(255,140,40,${0.55 + glow * 0.4})`;
    ctx.beginPath();
    ctx.moveTo(-2.5 * sc, -0.25 * sc);
    ctx.lineTo(-3.4 * sc - glow * 8, 0);
    ctx.lineTo(-2.5 * sc, 0.25 * sc);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(10, 0.55 * sc)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('Rocket', 0, -1.6 * sc);
    ctx.restore(); // rotate/translate
    ctx.restore(); // globalAlpha
  }

  _drawUnit(ctx, u) {
    const drawY = u.landed ? u.y : u.dropY;
    const p = this.worldToScreen(u.x, drawY);
    const sc = this.scale;
    const r = u.radius * sc;
    const isOut = u.status === 'out';
    const isCrawl = u.status === 'crawl';
    const color = u.side === 'attacker' ? this.sim.attColor : this.sim.defColor;
    const bob = (u.bob || 0) * sc;
    const recoil = (u.recoil || 0);

    ctx.save();
    ctx.translate(p.x, p.y + (isCrawl || isOut ? 0 : -bob));

    if (!u.landed) {
      ctx.strokeStyle = 'rgba(220,230,240,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -r * 1.6); ctx.lineTo(-r * 0.7, 0); ctx.moveTo(0, -r * 1.6); ctx.lineTo(r * 0.7, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(180,210,255,0.75)';
      ctx.beginPath(); ctx.ellipse(0, -r * 2.0, r * 1.1, r * 0.55, 0, Math.PI, 0); ctx.fill();
    }

    if (isOut) {
      const fade = u.outT != null ? Math.max(0.3, 1 - u.outT / 3.5) : 0.7;
      ctx.globalAlpha = fade;
      ctx.rotate(0.5);
      ctx.fillStyle = '#3a3e46';
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.0, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      if (u.type === 'tank') {
        ctx.fillStyle = '#2e3238';
        ctx.fillRect(-r * 0.85, -r * 0.3, r * 1.7, r * 0.6);
      }
      // poof ring while fresh
      if (u.outT != null && u.outT < 0.45) {
        ctx.strokeStyle = `rgba(255,200,120,${1 - u.outT / 0.45})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r * (1.2 + u.outT * 3), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.font = `${Math.max(10, r * 0.42)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Down', 0, 0);
      ctx.restore();
      const lx = this.offX + (u.x + (u.labelOffX || 0)) * this.scale;
      const ly = this.offY + (u.y + (u.labelOffY || 0)) * this.scale;
      ctx.save();
      ctx.translate(lx, ly);
      const chipW = Math.max(44, r * 1.9), chipH = Math.max(16, r * 0.65);
      ctx.fillStyle = '#4a1010';
      ctx.fillRect(-chipW / 2, -chipH / 2, chipW, chipH);
      ctx.strokeStyle = '#ff4455';
      ctx.lineWidth = 2;
      ctx.strokeRect(-chipW / 2, -chipH / 2, chipW, chipH);
      ctx.fillStyle = '#ff9aa0';
      ctx.font = `bold ${Math.max(10, r * 0.48)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Out', 0, 0);
      ctx.restore();
      return;
    }

    if (u.selected) {
      ctx.strokeStyle = '#ffe66d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(22, r * 1.35), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Recoil nudge opposite facing
    if (recoil > 0) {
      const ang = u.turret || u.facing || 0;
      ctx.translate(-Math.cos(ang) * recoil * r * 0.25, -Math.sin(ang) * recoil * r * 0.25);
    }

    if (isCrawl) {
      this._drawSoldier(ctx, u, color, r, true);
    } else if (u.type === 'tank') {
      this._drawTank(ctx, u, color, r);
    } else {
      this._drawSoldier(ctx, u, color, r, false);
    }

    // Hit flash overlay
    if (u.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, u.hitFlash) * 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r * (isCrawl ? 1.1 : 0.95), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const barW = Math.max(28, r * 1.7);
    const barH = Math.max(4, r * 0.16);
    const pct = Math.max(0, u.hpNow / u.stats.hp);
    let by = r * 0.95;
    if (isCrawl) {
      ctx.fillStyle = '#ffcc66';
      ctx.font = `bold ${Math.max(9, r * 0.36)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('Crawl', 0, by);
      by += Math.max(10, r * 0.38);
      // Blinking red cross (clearly distinct from Out)
      const blink = Math.sin(this.sim.time * 9) > 0;
      if (blink) {
        const cx = r * 1.05, cy = -r * 0.2, s = Math.max(5, r * 0.28);
        ctx.strokeStyle = '#ff2233';
        ctx.lineWidth = Math.max(2.5, r * 0.12);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s); ctx.stroke();
        ctx.fillStyle = 'rgba(255,40,50,0.25)';
        ctx.beginPath(); ctx.arc(cx, cy, s * 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Skip type-icon stack during drop so bodies stay readable (jank #4)
    if (u.landed) {
      const ico = Math.max(10, r * 0.42);
      ctx.font = `${ico}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mark = '';
      ctx.fillText(mark, -barW / 2 - ico * 0.7, by + barH / 2);
      if (u.covered) {
        /* no emoji */
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-barW / 2, by, barW, barH);
    ctx.fillStyle = isCrawl ? '#f0a020' : (pct < 0.35 ? '#e74c3c' : '#3dce6a');
    ctx.fillRect(-barW / 2, by, barW * pct, barH);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-barW / 2, by, barW, barH);

    ctx.restore();
  }

  _drawSoldier(ctx, u, color, r, prone) {
    const ang = u.turret || u.facing || 0;
    ctx.save();
    if (prone) {
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(2, 3, r * 1.0, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r * 0.48, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this._shade(color, -0.2);
      ctx.fillRect(-r * 0.9, -r * 0.35, r * 0.55, r * 0.7);
      ctx.fillStyle = this._shade(color, -0.35);
      ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0c1424';
      ctx.fillRect(r * 0.45, -r * 0.16, r * 0.38, r * 0.32);
      ctx.fillStyle = '#1a1e26';
      ctx.fillRect(r * 0.3, r * 0.12, r * 1.25, r * 0.16);
      ctx.restore();
      return;
    }
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath(); ctx.ellipse(4, 5, r * 0.8, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this._shade(color, -0.35);
    ctx.fillRect(-r * 0.45, r * 0.15, r * 0.28, r * 0.55);
    ctx.fillRect(r * 0.05, r * 0.2, r * 0.28, r * 0.5);
    ctx.fillStyle = color;
    const tw = u.type === 'heavy' ? r * 1.15 : (u.type === 'recon' ? r * 0.85 : r * 1.0);
    const th = u.type === 'recon' ? r * 1.15 : r * 1.05;
    ctx.beginPath();
    const x0 = -tw / 2, y0 = -th / 2, rr = r * 0.22;
    ctx.moveTo(x0 + rr, y0);
    ctx.arcTo(x0 + tw, y0, x0 + tw, y0 + th, rr);
    ctx.arcTo(x0 + tw, y0 + th, x0, y0 + th, rr);
    ctx.arcTo(x0, y0 + th, x0, y0, rr);
    ctx.arcTo(x0, y0, x0 + tw, y0, rr);
    ctx.closePath(); ctx.fill();
    if (u.type === 'heavy') {
      ctx.fillStyle = this._shade(color, -0.25);
      ctx.fillRect(-r * 0.85, -r * 0.55, r * 0.4, r * 1.0);
      ctx.fillRect(r * 0.45, -r * 0.55, r * 0.4, r * 1.0);
      ctx.fillStyle = '#2a3038';
      ctx.fillRect(-r * 0.35, -r * 0.7, r * 0.7, r * 0.35);
      ctx.fillStyle = '#1a1e26';
      ctx.fillRect(r * 0.2, -r * 0.22, r * 1.35, r * 0.44);
      ctx.fillStyle = '#444a55';
      ctx.fillRect(r * 1.2, -r * 0.3, r * 0.4, r * 0.6);
    } else if (u.type === 'recon') {
      ctx.fillStyle = this._shade(color, 0.12);
      ctx.fillRect(-r * 0.2, -r * 0.65, r * 0.4, r * 0.25);
      ctx.strokeStyle = '#6ff3ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.65); ctx.lineTo(0, -r * 1.05); ctx.stroke();
      ctx.fillStyle = '#1a1e26';
      ctx.fillRect(r * 0.15, -r * 0.12, r * 1.5, r * 0.18);
      ctx.fillStyle = '#6ff3ff';
      ctx.fillRect(r * 1.35, -r * 0.26, r * 0.4, r * 0.16);
    } else {
      ctx.fillStyle = '#1a1e26';
      ctx.fillRect(r * 0.2, -r * 0.12, r * 1.25, r * 0.22);
      ctx.fillRect(r * 0.55, -r * 0.28, r * 0.2, r * 0.5);
      ctx.fillStyle = this._shade(color, -0.15);
      ctx.fillRect(-r * 0.55, -r * 0.35, r * 0.25, r * 0.55);
    }
    ctx.fillStyle = this._shade(color, -0.32);
    ctx.beginPath(); ctx.arc(0, -r * 0.15, r * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = this._shade(color, -0.5);
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath(); ctx.arc(0, -r * 0.08, r * 0.5, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.fillStyle = '#071018';
    ctx.beginPath(); ctx.ellipse(r * 0.18, -r * 0.12, r * 0.28, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = u.type === 'recon' ? '#6ff3ff' : '#3af0ff88';
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.ellipse(r * 0.22, -r * 0.12, r * 0.16, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawTank(ctx, u, color, r) {
    const hull = u.facing || 0;
    const tur = u.turret || hull;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(4, 5, r * 1.15, r * 0.55, hull, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.rotate(hull);
    ctx.fillStyle = this._shade(color, -0.15);
    ctx.fillRect(-r * 1.05, -r * 0.7, r * 2.1, r * 1.4);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.strokeRect(-r * 1.05, -r * 0.7, r * 2.1, r * 1.4);
    ctx.fillStyle = '#1a1e24';
    ctx.fillRect(-r * 1.15, -r * 0.85, r * 2.3, r * 0.28);
    ctx.fillRect(-r * 1.15, r * 0.57, r * 2.3, r * 0.28);
    ctx.fillStyle = '#333';
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(i * r * 0.28 - 2, -r * 0.85, 4, r * 0.28);
      ctx.fillRect(i * r * 0.28 - 2, r * 0.57, 4, r * 0.28);
    }
    ctx.restore();
    ctx.save();
    ctx.rotate(tur);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.stroke();
    ctx.fillStyle = '#2a2e36';
    ctx.fillRect(0, -r * 0.14, r * 1.45, r * 0.28);
    ctx.fillStyle = '#444';
    ctx.fillRect(r * 0.9, -r * 0.2, r * 0.35, r * 0.4);
    ctx.restore();
  }

  _shade(hex, amt) {
    const n = (hex || '#888').replace('#', '');
    if (n.length < 6) return hex;
    const r = parseInt(n.slice(0, 2), 16);
    const g = parseInt(n.slice(2, 4), 16);
    const b = parseInt(n.slice(4, 6), 16);
    const f = (c) => Math.max(0, Math.min(255, (c + amt * 255) | 0));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  _drawFx(ctx, f) {
    const a = Math.max(0, 1 - f.t / f.life);
    if (f.kind === 'tracer') {
      const a0 = this.worldToScreen(f.x0, f.y0);
      const a1 = this.worldToScreen(f.x1, f.y1);
      ctx.globalAlpha = Math.min(1, a * 1.2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = f.tank ? 9 : 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke();
      ctx.strokeStyle = f.color || '#ffe66d';
      ctx.lineWidth = f.tank ? 4.5 : 3;
      ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'muzzle') {
      const p = this.worldToScreen(f.x, f.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(f.ang || 0);
      ctx.globalAlpha = a;
      const big = f.tank ? 22 : 15;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, big * a + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath(); ctx.arc(0, 0, big * 0.7 * a + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(big * 1.6, -big * 0.55); ctx.lineTo(big * 1.6, big * 0.55); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'spark') {
      const p = this.worldToScreen(f.x, f.y);
      ctx.globalAlpha = a;
      const n = f.n || 6;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + f.t * 8;
        const rad = 8 + f.t * 40;
        ctx.fillStyle = i % 2 ? '#ffe66d' : '#ff4422';
        ctx.fillRect(p.x + Math.cos(ang) * rad - 2, p.y + Math.sin(ang) * rad - 2, 5, 5);
      }
      ctx.globalAlpha = 1;
    } else if (f.kind === 'hitflash') {
      const p = this.worldToScreen(f.x, f.y);
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y, (f.r || 0.9) * this.scale * (1.1 + f.t * 2), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'dmg') {
      const p = this.worldToScreen(f.x, f.y);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.covered ? '#9ad0ff' : '#ff5533';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3;
      ctx.font = `bold ${16 + 6 * a}px system-ui`;
      ctx.textAlign = 'center';
      const txt = '-' + (f.dmg || '');
      ctx.strokeText(txt, p.x, p.y - 20 - f.t * 32);
      ctx.fillText(txt, p.x, p.y - 20 - f.t * 32);
      ctx.globalAlpha = 1;
    } else if (f.kind === 'out') {
      const p = this.worldToScreen(f.x, f.y);
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = 'rgba(255,200,120,0.8)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 6 + f.t * 10, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'dust') {
      const p = this.worldToScreen(f.x, f.y);
      const rad = (0.4 + f.t * 2.2) * this.scale * (f.r || 1);
      ctx.strokeStyle = `rgba(210,190,140,${0.55 * a})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(180,160,120,${0.2 * a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  labelOverlapReport() {
    const live = [];
    const chips = [];
    for (const u of this.sim.units) {
      if (this.sim.alive(u) && u.landed) {
        const p = this.worldToScreen(u.x, u.y);
        live.push({ x: p.x, y: p.y, r: u.radius * this.scale });
      }
      if (u.status === 'out') {
        const lx = this.offX + (u.x + (u.labelOffX || 0)) * this.scale;
        const ly = this.offY + (u.y + (u.labelOffY || 0)) * this.scale;
        chips.push({ x: lx, y: ly, w: 48, h: 18 });
      }
    }
    let overlaps = 0;
    for (const c of chips) {
      for (const L of live) {
        const dx = Math.max(Math.abs(c.x - L.x) - c.w / 2, 0);
        const dy = Math.max(Math.abs(c.y - L.y) - c.h / 2, 0);
        if (Math.hypot(dx, dy) < L.r * 0.85) overlaps++;
      }
    }
    return { overlaps, live: live.length, chips: chips.length };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this._onResize);
    if (window.visualViewport) visualViewport.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    try { if (this._audio && this._audio.state !== 'closed') this._audio.close(); } catch (_) {}
    this._audio = null;
    if (this.root?.parentNode) this.root.remove();
    if (this.style?.parentNode) this.style.remove();
    while (this.mount.firstChild) this.mount.removeChild(this.mount.firstChild);
  }
}

const CSS = `
.sc-ground { position:absolute; inset:0; touch-action:none; }
.sc-ground-hud { position:absolute; inset:0; pointer-events:none; z-index:2; overflow:hidden; }
/* Clear shell ⏸️ top-left 56×56 — pad left on top row */
.sc-top { position:absolute; top:0; left:0; right:0; display:flex; justify-content:flex-end; align-items:flex-start;
  padding:8px 10px 8px 60px; gap:8px; pointer-events:none; flex-wrap:wrap; }
.sc-planet { background:rgba(0,0,0,.45); border-radius:12px; padding:6px 10px; font-size:14px; display:flex; align-items:center; gap:6px;
  margin-right:auto; max-width:min(160px,40vw); }
.sc-hint { background:rgba(20,30,50,.8); border:1px solid #6ff3ff55; border-radius:12px; padding:8px 12px; font-size:12px;
  max-width:min(280px,72vw); text-align:center; }
.sc-mute { margin-left:4px; }
.sc-bottom { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:space-between; align-items:center;
  padding:10px 12px calc(10px + env(safe-area-inset-bottom, 0px)); gap:10px; pointer-events:none; z-index:5; box-sizing:border-box; }
.sc-btn { pointer-events:auto; min-width:48px; min-height:48px; padding:10px 14px; border-radius:14px; border:2px solid #6ff3ff66;
  background:rgba(15,22,40,.88); color:#e8eef8; font-size:15px; font-weight:700; display:inline-flex; align-items:center; gap:6px;
  cursor:pointer; -webkit-tap-highlight-color:transparent; }
.sc-btn:active { transform:scale(.96); background:#1a2744; }
.sc-retreat { border-color:#e74c3c88; }
.sc-sel { position:absolute; left:50%; transform:translateX(-50%); bottom:calc(58px + env(safe-area-inset-bottom, 0px)); background:rgba(0,0,0,.78); border-radius:14px;
  padding:6px 10px; display:flex; flex-wrap:wrap; gap:6px; align-items:center; max-width:min(420px,92vw); font-size:12px;
  pointer-events:none; border:1px solid #ffffff22; z-index:4; }
.sc-sel .sc-hpbar { width:100%; height:6px; background:#222; border-radius:3px; overflow:hidden; }
.sc-sel .sc-hpbar i { display:block; height:100%; }
.sc-stat { white-space:nowrap; opacity:.95; }
.sc-ico { font-size:18px; }
.sc-lab { font-weight:700; }
.sc-banner { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  pointer-events:auto; background:rgba(5,10,20,.55); z-index:8; }
.sc-banner[hidden] { display:none !important; }
.sc-ban-card { background:rgba(12,18,32,.92); border:2px solid #6ff3ff66; border-radius:18px;
  padding:22px 28px; text-align:center; min-width:min(280px,80vw); box-shadow:0 12px 40px rgba(0,0,0,.45); }
.sc-ban-big { font-size:26px; font-weight:800; margin-bottom:8px; }
.sc-ban-pts { font-size:20px; font-weight:700; margin:6px 0 10px; color:#ffe66d; }
.sc-ban-sub { font-size:12px; opacity:.7; }
`;
