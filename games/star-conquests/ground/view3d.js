// BF2-style 3D ground view — Army HQ look, Command + Lead (TPS).
import * as THREE from '../vendor/three.module.min.js';
import { makeTrooper, makeTank, makeWreck, disposeObject3D, UNIT_SCALE } from './models3d.js';
import { createHqTrooper, poseTrooper, disposeHqTrooper } from './hq/api.js';
import { typeLabel, DEFAULT_STATS } from './sim.js';
import { arenaPose, arenaTankPose, FIRE_PROFILES, dropWeapon, OUT_T } from './hq/demo-actions.js';
import { FX } from './hq/demo-fx.js';
import { createTankFeel } from './tankfx.js';

const ACC = '#ffd23f';
const BG = '#070a1c';
const INK = '#f2f5ff';
const DIM = '#9fb0d9';
const DESERT_FOG = 0xb9a888; // Army HQ sky/sand fog

const SVG = {
  flag: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>',
  tickets: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9z"/></svg>',
  speed: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>',
  retreat: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22V4"/><path d="M4 4h10l-1.5 3L14 10H4"/></svg>',
  mute: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
  muted: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
  help: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  command: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  lead: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5L18 22l-6-4-6 4 1.5-8.5L2 9h7z"/></svg>',
  fire: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>',
  tank: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="10" width="18" height="7" rx="1"/><path d="M6 10V8h4v2M14 13h6"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  pinch: '<svg viewBox="0 0 48 32" width="36" height="24" fill="none" stroke="#ffd23f" stroke-width="2"><path d="M14 22c0-6 4-10 10-10s10 4 10 10"/><path d="M20 14l-4-4M28 14l4-4"/></svg>',
  drag: '<svg viewBox="0 0 48 32" width="36" height="24" fill="none" stroke="#ffd23f" stroke-width="2"><rect x="10" y="8" width="20" height="14" rx="3"/><path d="M34 15h8M38 11v8"/></svg>',
  aimRight: '<svg viewBox="0 0 48 32" width="36" height="24" fill="none" stroke="#ffd23f" stroke-width="2"><rect x="26" y="4" width="18" height="24" rx="2" stroke-dasharray="3 2"/><circle cx="16" cy="18" r="5"/><path d="M16 13v-4M21 16l4-2"/></svg>',
  tap: '<svg viewBox="0 0 48 32" width="36" height="24" fill="none" stroke="#ffd23f" stroke-width="2"><circle cx="22" cy="16" r="6"/><path d="M22 4v4M22 24v4"/></svg>',
};

function canWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch (_) { return false; }
}
export { canWebGL };

export class GroundView3D {
  constructor(mount, sim, hooks) {
    this.mount = mount;
    this.sim = sim;
    this.hooks = hooks || {};
    this.disposed = false;
    this.muted = false;
    this._audio = null;
    this._audioReady = false;
    this.frameTimes = [];
    this.hintShown = true;
    this._hintUntil = 0; // set on first draw
    this._hintMode = null;
    this.howtoOpen = false;
    this._meshes = new Map();
    this._propMeshes = [];
    this._postMeshes = new Map();
    this._tracerGroup = new THREE.Group();
    this._pointers = new Map();
    this._joy = { active: false, dx: 0, dy: 0 };
    this._aim = { yaw: 0, pitch: 0.22 };
    this._firePulseUntil = 0;
    this._fireFxEdge = false;
    this._fireHeld = false;
    this._hitFlash = 0;
    this._kick = 0;
    this._cam = { x: sim.W / 2, z: sim.H / 2, tx: sim.W / 2, tz: sim.H / 2, dist: 15 };
    this._leadSmooth = new THREE.Vector3(sim.W / 2, 2.2, sim.H / 2);
    this._pointerLocked = false;
    this._keys = new Set();
    this._fxHeard = 0;
    this._goldRing = null;
    this._lastDt = 0.016;
    this._tankTrauma = 0;

    mount.innerHTML = '';
    {
      const pos = getComputedStyle(mount).position;
      if (pos === 'static') mount.style.position = 'relative';
    }
    Object.assign(mount.style, { overflow: 'hidden', background: '#2a2318', touchAction: 'none', userSelect: 'none' });

    this.root = document.createElement('div');
    this.root.className = 'sc-ground sc-ground-3d sc-ground-loading';
    this.root.setAttribute('data-sc-ground', '1');
    this.root.setAttribute('data-sc-ground-loading', '1');
    Object.assign(this.root.style, {
      position: 'absolute', inset: '0', overflow: 'hidden',
      fontFamily: 'system-ui,Segoe UI,sans-serif', color: INK, touchAction: 'none',
      background: '#2a2318',
    });
    // Mount marker FIRST so waitForSelector('[data-sc-ground]') passes before heavy WebGL/terrain work
    // (parallel headless/swiftshader can otherwise block the constructor >25s).
    this.style = document.createElement('style');
    this.style.textContent = CSS3D;
    mount.append(this.style, this.root);

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-sc-canvas', '1');
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none' });

    const __ctorT0 = performance.now();
    const __ctorSteps = {};
    const __mark = (k) => { __ctorSteps[k] = +(performance.now() - __ctorT0).toFixed(1); };
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(DESERT_FOG, 1);
    this.renderer.shadowMap.enabled = false;
    __mark('webgl');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(DESERT_FOG);
    this.scene.fog = new THREE.Fog(DESERT_FOG, 42, 95);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220);
    this.scene.add(this._tracerGroup);
    this._hqFx = new FX(this.scene);

    // Army HQ lighting (render.js): warm hemi + bright sun
    const hemi = new THREE.HemisphereLight(0xfff6e6, 0x6b5a43, 1.6);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(40, 80, 28);
    this.scene.add(sun);
    __mark('scene');

    this._buildTerrain(); __mark('terrain');
    this._buildProps(); __mark('props');
    this._buildPosts(); __mark('posts');
    this._buildGoldRing(); __mark('goldRing');

    this.hud = document.createElement('div');
    this.hud.className = 'sc-ground-hud';
    this.hud.innerHTML = this._hudHtml();
    this.root.append(this.canvas, this.hud);
    this.root.classList.remove('sc-ground-loading');
    this.root.removeAttribute('data-sc-ground-loading');
    __mark('hud');
    __ctorSteps.total = +(performance.now() - __ctorT0).toFixed(1);
    try { window.__scCtorMs = __ctorSteps; } catch (_) {}
    this._ctorMs = __ctorSteps;

    this._bind();
    this._paintStatic();
    this._syncModeToggle();
    this.resize();
    if (this.sim.phase === 'spawn') this._paintSpawn();
  }

  _hudHtml() {
    return `
      <div class="sc-topstack">
        <div class="sc-tickets-row">
          <div class="sc-tick-col sc-tick-col-L">
            <div class="sc-tickets sc-tickets-L" data-sc-tick-L>
              <span class="sc-ticon">${SVG.tickets}</span>
              <span class="sc-tlab">Tickets</span>
              <b data-sc-tick-a>0</b>
            </div>
            <div class="sc-bonus" data-sc-bonus hidden></div>
          </div>
          <div class="sc-tickets sc-tickets-R" data-sc-tick-R>
            <b data-sc-tick-d>0</b>
            <span class="sc-tlab">Tickets</span>
            <span class="sc-ticon">${SVG.tickets}</span>
          </div>
        </div>
        <div class="sc-posts" data-sc-posts></div>
      </div>
      <button type="button" class="sc-btn sc-mode-toggle" data-sc-mode-toggle>${SVG.command}<span data-sc-mode-lab>Command</span></button>
      <button type="button" class="sc-btn sc-hero" data-sc-hero hidden><span>Hero</span></button>
      <div class="sc-hint" data-sc-hint></div>
      <div class="sc-leadstat" data-sc-leadstat hidden>
        <div class="sc-leadhp"><i data-sc-leadhp style="width:100%"></i></div>
        <span data-sc-leadhp-lab>HP —</span>
      </div>
      <div class="sc-bottom" data-sc-bottom>
        <button type="button" class="sc-btn" data-sc-speed>${SVG.speed}<span>Speed</span> <b data-sc-speed-val>2×</b></button>
        <button type="button" class="sc-btn" data-sc-mute>${SVG.mute}<span>Sound</span></button>
        <button type="button" class="sc-btn sc-retreat" data-sc-retreat>${SVG.retreat}<span>Retreat</span></button>
        <button type="button" class="sc-btn" data-sc-help>${SVG.help}<span>Help</span></button>
      </div>
      <div class="sc-sel" data-sc-sel hidden></div>
      <div class="sc-boxsel" data-sc-boxsel hidden></div>
      <div class="sc-holdwin" data-sc-holdwin hidden></div>
      <div class="sc-banner" data-sc-banner hidden></div>
      <div class="sc-spawn" data-sc-spawn hidden></div>
      <div class="sc-howto" data-sc-howto hidden></div>
      <div class="sc-cross" data-sc-cross hidden><span>+</span><i data-sc-hitmark hidden></i></div>
      <div class="sc-joy" data-sc-joy hidden>
        <div class="sc-joy-base"><div class="sc-joy-knob" data-sc-joy-knob></div></div>
      </div>
      <button type="button" class="sc-fire" data-sc-fire hidden>${SVG.fire}<span>Fire</span></button>
      <button type="button" class="sc-btn sc-enter" data-sc-enter hidden>${SVG.tank}<span>Enter</span></button>
      <div class="sc-tip" data-sc-tip hidden></div>
      <div class="sc-hpbars" data-sc-hpbars></div>
    `;
  }

  /** Touch chrome: coarse pointer, maxTouchPoints, or narrow mount (phone layout). */
  _isTouch() {
    try {
      if (matchMedia('(pointer: coarse)').matches) return true;
      if (navigator.maxTouchPoints > 0) return true;
      if ('ontouchstart' in window) return true;
    } catch (_) {}
    const w = this.mount?.clientWidth || this._w || 800;
    return w <= 520;
  }

  _paused() { return !!(this.hooks.isPaused && this.hooks.isPaused()); }

  _buildTerrain() {
    // Soft textured sand like Army HQ (vertex colors + gentle undulation)
    const pad = 48;
    const W = this.sim.W + pad * 2, H = this.sim.H + pad * 2;
    const segX = 64, segZ = 48;
    const geo = new THREE.PlaneGeometry(W, H, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const lo = new THREE.Color('#c9b48a'), hi = new THREE.Color('#a8906a'), edge = new THREE.Color('#8c7a5c');
    const c = new THREE.Color();
    const cx = this.sim.W / 2, cz = this.sim.H / 2;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), z = pos.getZ(i);
      // plane is centered at origin before we shift — rebuild centered on map
      const wx = x + cx, wz = z + cz;
      const n = 0.5 + 0.5 * Math.sin(wx * 0.37 + wz * 0.21) * Math.cos(wz * 0.29 - wx * 0.13);
      const h = 0.15 * Math.sin(wx * 0.21) * Math.cos(wz * 0.17);
      pos.setY(i, h);
      c.copy(lo).lerp(hi, Math.min(1, Math.abs(h) * 2 + n * 0.25));
      if (wx < -2 || wz < -2 || wx > this.sim.W + 2 || wz > this.sim.H + 2) c.lerp(edge, 0.55);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.position.set(cx, 0, cz);
    this.scene.add(mesh);
    // Border rocks (HQ rock tone) — tracked so Lead occluder hide/fade can catch foreground ones
    const rockMat = new THREE.MeshLambertMaterial({ color: '#7d6f5e', flatShading: true, transparent: true, opacity: 1 });
    const rg = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 36; i++) {
      const ang = (i / 36) * Math.PI * 2;
      const rx = cx + Math.cos(ang) * (Math.max(this.sim.W, this.sim.H) * 0.72 + 6 + (i % 3));
      const rz = cz + Math.sin(ang) * (Math.max(this.sim.W, this.sim.H) * 0.72 + 6 + (i % 4));
      const h = 1.2 + (i % 5) * 0.7;
      const hill = new THREE.Mesh(rg, rockMat.clone());
      hill.position.set(rx, h * 0.25, rz);
      hill.scale.set(1.4 + (i % 3) * 0.4, h * 0.8, 1.4 + (i % 2) * 0.3);
      hill.rotation.set(i * 0.3, i * 0.7, 0);
      hill.userData.isProp = true;
      hill.userData.radius = Math.max(1.6, h * 0.55);
      this.scene.add(hill);
      this._propMeshes.push(hill);
    }
  }

  _buildProps() {
    const rock = this.sim.biome.rock || '#6b5330';
    for (const p of this.sim.props) {
      let mesh;
      if (p.kind === 'wall' || p.kind === 'sandbag') {
        const mat = new THREE.MeshLambertMaterial({
          color: p.kind === 'sandbag' ? '#8a7a55' : '#6a6e74',
          flatShading: true, transparent: true, opacity: 1,
        });
        mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w || 1.4, p.kind === 'wall' ? 0.9 : 0.45, p.h || 0.35), mat);
        mesh.position.set(p.x, mesh.geometry.parameters.height / 2, p.y);
        if (p.rot) mesh.rotation.y = p.rot;
      } else {
        const mat = new THREE.MeshLambertMaterial({ color: rock, flatShading: true, transparent: true, opacity: 1 });
        mesh = new THREE.Mesh(new THREE.DodecahedronGeometry((p.r || 0.5) * 0.9, 0), mat);
        mesh.position.set(p.x, (p.r || 0.5) * 0.5, p.y);
        mesh.rotation.set(this.sim.rng() * 1, this.sim.rng() * 2, this.sim.rng());
      }
      mesh.userData.isProp = true;
      mesh.userData.radius = (p.kind === 'wall' || p.kind === 'cover') ? 1.35 : (p.r || 1.05);
      this.scene.add(mesh);
      this._propMeshes.push(mesh);
    }
  }

  _buildPosts() {
    for (const p of this.sim.posts) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6),
        new THREE.MeshLambertMaterial({ color: '#c8ccd2', flatShading: true, transparent: true, opacity: 1 }),
      );
      pole.position.y = 1.1;
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.5),
        new THREE.MeshBasicMaterial({ color: '#888', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      flag.position.set(0.42, 2.05, 0);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.28, 16),
        new THREE.MeshBasicMaterial({ color: '#888', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
      );
      halo.position.set(0, 2.35, 0);
      halo.rotation.x = -Math.PI / 2;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(p.r * 0.85, p.r, 48),
        new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(p.r * 0.82, 48),
        new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.15, side: THREE.DoubleSide }),
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.04;
      g.add(pole, flag, halo, ring, fill);
      g.position.set(p.x, 0, p.y);
      this.scene.add(g);
      this._postMeshes.set(p.id, { group: g, pole, flag, halo, ring, fill, flagMat: flag.material, haloMat: halo.material, ringMat: ring.material, fillMat: fill.material });
    }
  }

  _buildGoldRing() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.72, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.visible = false;
    this.scene.add(ring);
    this._goldRing = ring;
  }

  _bind() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (window.visualViewport) visualViewport.addEventListener('resize', this._onResize);

    this._onPointerDown = (e) => {
      if (this._paused()) return;
      if (e.target.closest && e.target.closest('.sc-btn, .sc-spawn, .sc-howto, .sc-fire, .sc-joy, .sc-enter, .sc-mode-toggle, .sc-spawn-map')) return;
      this._ensureAudio();
      if (this.sim.mode === 'lead' && !this._isTouch()) {
        try { this.canvas.requestPointerLock(); } catch (_) {}
        if (e.button === 0) this._fireHeld = true;
      }
      const rec = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, rightAim: false, btn: e.button, box: false, pan: false };
      this._pointers.set(e.pointerId, rec);
      this._moved = false;
      // Command: LMB starts potential box-select; RMB starts potential order/pan
      if (this.sim.mode === 'command' && e.button === 0) {
        rec.box = true;
      }
      if (this.sim.mode === 'command' && e.button === 1) {
        rec.pan = true; // middle = pan
      }
      // Touch Lead: right half = aim
      if (this.sim.mode === 'lead' && this._isTouch() && e.clientX > (this.mount.clientWidth || 0) * 0.48) {
        rec.rightAim = true;
      }
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      if (e.button === 2) e.preventDefault();
    };
    this._onPointerMove = (e) => {
      if (this._paused()) return;
      if (this.sim.mode === 'lead' && this._pointerLocked) {
        this._aim.yaw -= (e.movementX || 0) * 0.0045;
        this._aim.pitch = Math.max(-0.2, Math.min(0.55, this._aim.pitch + (e.movementY || 0) * 0.0035));
        return;
      }
      if (!this._pointers.has(e.pointerId)) return;
      const prev = this._pointers.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (this.sim.mode === 'lead' && (prev.rightAim || (this._isTouch() && e.clientX > (this.mount.clientWidth || 0) * 0.48))) {
        this._aim.yaw -= dx * 0.006;
        this._aim.pitch = Math.max(-0.2, Math.min(0.55, this._aim.pitch + dy * 0.005));
        prev.x = e.clientX; prev.y = e.clientY;
        return;
      }
      const dist = Math.hypot(e.clientX - prev.sx, e.clientY - prev.sy);
      if (this.sim.mode === 'command' && prev.box && dist > 8) {
        this._moved = true;
        this._boxDrag = { x0: prev.sx, y0: prev.sy, x1: e.clientX, y1: e.clientY };
        this._paintBoxSel();
        prev.x = e.clientX; prev.y = e.clientY;
        return;
      }
      // Middle-drag or Shift+drag pans
      if (this.sim.mode === 'command' && (prev.pan || (prev.btn === 0 && e.shiftKey)) && dist > 6) {
        this._moved = true;
        this._cam.tx -= dx * 0.04;
        this._cam.tz -= dy * 0.04;
        this._clampCmdCam();
        this.hintShown = false;
      }
      // Touch command: single finger drag pans when no box intent yet; after move treat as pan
      if (this.sim.mode === 'command' && this._isTouch() && prev.btn === 0 && !this._boxDrag && dist > 14) {
        this._moved = true;
        prev.pan = true; prev.box = false;
        this._cam.tx -= dx * 0.04;
        this._cam.tz -= dy * 0.04;
        this._clampCmdCam();
      }
      prev.x = e.clientX; prev.y = e.clientY;
    };
    this._onPointerUp = (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      const p = this._pointers.get(e.pointerId);
      this._pointers.delete(e.pointerId);
      if (this.sim.mode === 'lead' && !this._isTouch()) {
        this._fireHeld = false;
        // Real mouse click is down+up in one frame — pulse so the next sim tick still sees fire.
        if (p.btn === 0) this._firePulseUntil = performance.now() + 200;
      }
      if (this.sim.mode === 'command') {
        if (this.sim.phase === 'outro') { this.sim.skipBanner(); this._moved = false; return; }
        // Finish box-select
        if (p.box && this._boxDrag) {
          const b = this._boxDrag;
          this._boxDrag = null;
          this._paintBoxSel();
          const w0 = this.screenToWorld(b.x0, b.y0);
          const w1 = this.screenToWorld(b.x1, b.y1);
          if (w0 && w1) this.sim.boxSelect(w0.x, w0.y, w1.x, w1.y);
          this._moved = false;
          return;
        }
        // RMB (or long-tap order): move / attack
        if (p.btn === 2 || (this._isTouch() && this.sim.selectedUnits().length && !this._moved && !p.pan)) {
          const w = this.screenToWorld(e.clientX, e.clientY);
          if (w && this.sim.selectedUnits().length) this.sim.orderSelected(w.x, w.y);
          this._moved = false;
          return;
        }
        // LMB tap: select unit / order if already selected (phone flow: tap unit then tap dest)
        if (!this._moved && p.btn === 0) {
          const w = this.screenToWorld(e.clientX, e.clientY);
          if (w) this.sim.tap(w.x, w.y);
        }
      }
      this._moved = false;
      this._boxDrag = null;
      this._paintBoxSel();
    };
    this._onContextMenu = (e) => { e.preventDefault(); };
    this._onWheel = (e) => {
      if (this._paused() || this.sim.mode !== 'command') return;
      e.preventDefault();
      this._cam.dist = Math.max(10, Math.min(26, this._cam.dist * (e.deltaY > 0 ? 1.08 : 0.92)));
    };
    this._onKey = (e) => {
      if (this._paused() || this.disposed) return;
      if (e.key === 'Escape') { try { document.exitPointerLock(); } catch (_) {} return; }
      if (e.type === 'keydown') this._keys.add(e.key.toLowerCase());
      else this._keys.delete(e.key.toLowerCase());
      if (e.type === 'keydown' && e.key.toLowerCase() === 'e') {
        if (this.sim.player) this.sim.setPlayerInput({ ...(this.sim.player.input || {}), interact: true, mx: 0, my: 0, aim: this._aim.yaw });
      }
    };
    this._onLock = () => { this._pointerLocked = document.pointerLockElement === this.canvas; };

    this._boxDrag = null;
    this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: false });
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);
    this.canvas.addEventListener('contextmenu', this._onContextMenu);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKey);
    document.addEventListener('pointerlockchange', this._onLock);

    this.hud.querySelector('[data-sc-speed]').onclick = (e) => {
      e.stopPropagation();
      if (this._paused()) return;
      const s = this.sim.cycleSpeed();
      this.hud.querySelector('[data-sc-speed-val]').textContent = s + '×';
      this.playSound('ui');
    };
    this.hud.querySelector('[data-sc-retreat]').onclick = (e) => {
      e.stopPropagation();
      if (this._paused()) return;
      this.hooks.onRetreat?.();
    };
    this.hud.querySelector('[data-sc-mute]').onclick = (e) => {
      e.stopPropagation();
      this.muted = !this.muted;
      const btn = this.hud.querySelector('[data-sc-mute]');
      btn.innerHTML = (this.muted ? SVG.muted : SVG.mute) + `<span>${this.muted ? 'Muted' : 'Sound'}</span>`;
    };
    this.hud.querySelector('[data-sc-help]').onclick = (e) => {
      e.stopPropagation();
      this.howtoOpen = !this.howtoOpen;
      this._paintHowto();
    };
    this.hud.querySelector('[data-sc-mode-toggle]').onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (this._paused()) return;
      const next = this.sim.mode === 'command' ? 'lead' : 'command';
      this.sim.setMode(next);
      if (next === 'lead') this._snapLeadCam();
      this._hintMode = null;
      this._syncModeToggle();
      this._updateLeadChrome();
      this.hintShown = true;
      this._hintUntil = performance.now() + 4000;
      this._paintHint();
    };

    const fire = this.hud.querySelector('[data-sc-fire]');
    fire.onpointerdown = (e) => { e.preventDefault(); e.stopPropagation(); this._fireHeld = true; };
    fire.onpointerup = fire.onpointerleave = fire.onpointercancel = (e) => {
      e?.stopPropagation?.();
      this._fireHeld = false;
      // Touch tap on Fire is down+up in one frame — pulse so sim still sees fire.
      this._firePulseUntil = performance.now() + 200;
    };

    const enter = this.hud.querySelector('[data-sc-enter]');
    enter.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!this.sim.player || this._paused()) return;
      const r = this.sim._tryEnterTank(this.sim.player);
      this.sim.setPlayerInput({ mx: 0, my: 0, aim: this._aim.yaw, interact: false });
      this._updateLeadChrome();
      if (r) this.playSound('ui');
    };

    const joy = this.hud.querySelector('[data-sc-joy]');
    const knob = this.hud.querySelector('[data-sc-joy-knob]');
    joy.onpointerdown = (e) => {
      e.preventDefault(); e.stopPropagation();
      joy.setPointerCapture(e.pointerId);
      this._joy.active = true;
      this._joyAt(e, joy, knob);
    };
    joy.onpointermove = (e) => { if (this._joy.active) this._joyAt(e, joy, knob); };
    joy.onpointerup = joy.onpointercancel = () => {
      this._joy.active = false; this._joy.dx = 0; this._joy.dy = 0;
      knob.style.transform = 'translate(0,0)';
    };

    this.hud.querySelector('[data-sc-banner]').onclick = () => { if (!this._paused()) this.sim.skipBanner(); };
    const heroBtn = this.hud.querySelector('[data-sc-hero]');
    if (heroBtn) heroBtn.onclick = (e) => {
      e.stopPropagation();
      if (this._paused()) return;
      if (this.sim.triggerHero()) this.playSound('ui');
      this._paintBonus();
    };
  }

  _joyAt(e, joy, knob) {
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    if (len > 1) { dx /= len; dy /= len; }
    this._joy.dx = dx; this._joy.dy = dy;
    knob.style.transform = `translate(${dx * 30}px,${dy * 30}px)`;
  }


  _layoutChrome() {
    const w = this.mount?.clientWidth || this._w || 800;
    const vh = this.mount?.clientHeight || this._h || 600;
    const land = w > vh;
    const phone = w <= 520 || this._isTouch();
    this.root?.classList.toggle('sc-land', land);
    this.root?.classList.toggle('sc-phone', phone);
    const btn = this.hud.querySelector('[data-sc-mode-toggle]');
    const stack = this.hud.querySelector('.sc-topstack');
    const hint = this.hud.querySelector('[data-sc-hint]');
    const fire = this.hud.querySelector('[data-sc-fire]');
    const joy = this.hud.querySelector('[data-sc-joy]');
    const hp = this.hud.querySelector('[data-sc-leadstat]');
    if (!btn) return;
    // Prefer right tickets pill bottom, else topstack
    const tickR = this.hud.querySelector('.sc-tickets-R');
    const tickRow = this.hud.querySelector('.sc-tickets-row');
    const tickBox = tickR || tickRow || stack;
    let top;
    if (tickBox) {
      const br = tickBox.getBoundingClientRect();
      const rootR = this.root.getBoundingClientRect();
      top = Math.max(8, Math.round(br.bottom - rootR.top + 6));
    } else {
      const h = stack ? (stack.offsetHeight || 0) : 0;
      top = 8 + h + 8;
    }
    // Never sit on the CP strip: if it reaches into the toggle column, drop below it
    const cp = this.hud.querySelector('[data-sc-posts]');
    if (cp && cp.offsetParent) {
      const cr = cp.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
      const bw = Math.max(btn.offsetWidth || 0, 120);
      const colL = rr.right - 10 - bw;
      if (cr.right > colL - 4 && (cr.top - rr.top) < top + 52) top = Math.max(top, Math.round(cr.bottom - rr.top + 6));
    }
    // Landscape phone Lead: keep toggle under tickets, never over Fire
    if (land && phone && this.sim?.mode === 'lead') {
      top = Math.min(top, Math.max(36, Math.round(vh * 0.18)));
      btn.style.minWidth = '120px';
    }
    btn.style.top = top + 'px';
    btn.style.right = '10px';
    btn.style.left = 'auto';
    btn.style.bottom = 'auto';
    btn.style.transform = 'none';
    btn.style.zIndex = '20';
    if (hint) hint.style.top = (top + 52) + 'px';
    // Clear inline overrides that fight CSS on fire/joy/hp when not lead-land
    if (!(land && phone && this.sim?.mode === 'lead')) {
      if (fire) { fire.style.top = ''; fire.style.bottom = ''; }
      if (joy) { joy.style.top = ''; joy.style.bottom = ''; }
      if (hp) { hp.style.top = ''; hp.style.bottom = ''; hp.style.left = ''; }
    }
  }

  _syncModeToggle() {
    const btn = this.hud.querySelector('[data-sc-mode-toggle]');
    if (!btn) return;
    const lead = this.sim.mode === 'lead';
    btn.classList.toggle('lead', lead);
    btn.innerHTML = (lead ? SVG.lead : SVG.command) + `<span data-sc-mode-lab>${lead ? 'Lead' : 'Command'}</span>`;
    if (this._hintMode !== this.sim.mode) {
      this._hintMode = this.sim.mode;
      // fresh mode-specific hint, auto-dismiss in ~4s
      if (!this.sim.hintDismissed) {
        this.hintShown = true;
        this._hintUntil = performance.now() + 4000;
      }
      this._paintHint();
    }
  }

  _paintStatic() {
    const sv = this.hud.querySelector('[data-sc-speed-val]');
    if (sv) sv.textContent = (this.sim.speed || 2) + '×';
    this._paintHint();
  }

  _paintHint() {
    const el = this.hud.querySelector('[data-sc-hint]');
    if (!el) return;
    if (!this.hintShown || this.sim.hintDismissed) { el.hidden = true; return; }
    if (this._hintUntil && performance.now() > this._hintUntil) {
      this.hintShown = false; el.hidden = true; return;
    }
    el.hidden = false;
    const touch = this._isTouch();
    const lead = this.sim.mode === 'lead';
    if (lead) {
      el.innerHTML = touch
        ? `<div class="sc-hint-row">${SVG.drag}<span>Stick move</span>${SVG.fire}<span>Fire</span>${SVG.aimRight}<span>Drag right side to aim</span></div>`
        : `<div class="sc-hint-row"><span>WASD move · Mouse aim · Click fire · Esc unlock</span></div>`;
    } else {
      el.innerHTML = touch
        ? `<div class="sc-hint-row">${SVG.tap}<span>Tap post</span>${SVG.drag}<span>Drag pan</span>${SVG.pinch}<span>Pinch zoom</span></div>`
        : `<div class="sc-hint-row">${SVG.tap}<span>Click post / unit</span>${SVG.drag}<span>Drag pan</span>${SVG.pinch}<span>Scroll zoom</span></div>`;
    }
  }

  _paintHowto() {
    const el = this.hud.querySelector('[data-sc-howto]');
    if (!this.howtoOpen) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `
      <div class="sc-howto-card">
        <h2>How to play</h2>
        <div class="sc-cards">
          <div class="sc-card"><div class="sc-card-ic">${SVG.flag}</div><b>Capture posts</b><span>Stand in a ring. Allies speed it up. Enemies contest.</span></div>
          <div class="sc-card"><div class="sc-card-ic">${SVG.tickets}</div><b>Tickets</b><span>Deaths and fewer posts drain tickets. Hit 0 and you lose.</span></div>
          <div class="sc-card"><div class="sc-card-ic">${SVG.command}</div><b>Command</b><span>Overhead view. Tap a post to send troopers.</span></div>
          <div class="sc-card"><div class="sc-card-ic">${SVG.lead}</div><b>Lead</b><span>Third-person. Spawn a class and fight yourself.</span></div>
        </div>
        <button type="button" class="sc-btn sc-howto-close" data-sc-howto-close>Got it</button>
      </div>`;
    el.querySelector('[data-sc-howto-close]').onclick = (e) => {
      e.stopPropagation();
      this.howtoOpen = false;
      this.sim.hintDismissed = true;
      el.hidden = true;
    };
  }

  _spawnStatBars(typ, maxes) {
    const st = DEFAULT_STATS[typ] || DEFAULT_STATS.rifle;
    const rows = [
      { key: 'hp', val: st.hp, max: maxes.hp, fill: '#3dce6a',
        ico: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/>' },
      { key: 'attack', val: st.attack, max: maxes.attack, fill: '#ff7a45',
        ico: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1l2.1-2.1M17 7l2.1-2.1"/>' },
      { key: 'range', val: st.range, max: maxes.range, fill: '#3ab4ff',
        ico: '<path d="M4 12h10"/><path d="M12 8l4 4-4 4"/><path d="M4 7h6"/><path d="M8 5l2 2-2 2"/>' },
    ];
    return `<div class="sc-statbars">${rows.map((r) => {
      const pct = Math.max(8, Math.round((r.val / (r.max || 1)) * 100));
      return `<div class="sc-statbar" title="">
        <svg class="sc-stat-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${r.ico}</svg>
        <span class="sc-stat-track"><i style="width:${pct}%;background:${r.fill}"></i></span>
      </div>`;
    }).join('')}</div>`;
  }

  /** While Deploy is open: hide Speed/Sound/Help/Retreat bar, mode toggle, and top CP chips (chips live in the panel). */
  _setDeployChrome(open) {
    const hide = !!open;
    const bottom = this.hud.querySelector('[data-sc-bottom]');
    const toggle = this.hud.querySelector('[data-sc-mode-toggle]');
    const posts = this.hud.querySelector('[data-sc-posts]');
    const hint = this.hud.querySelector('[data-sc-hint]');
    if (bottom) bottom.hidden = hide;
    if (toggle) toggle.hidden = hide;
    if (posts) posts.hidden = hide;
    if (hide && hint) hint.hidden = true;
    this.root?.classList.toggle('sc-deploy-open', hide);
  }

  _paintSpawn() {
    const el = this.hud.querySelector('[data-sc-spawn]');
    if (!(this.sim.phase === 'spawn' || this.sim.needSpawn)) {
      el.hidden = true; el.innerHTML = ''; el.dataset.built = '';
      this._spawnMapSnap = null;
      this._setDeployChrome(false);
      return;
    }
    // Rebuild only when first shown — map snap is one-shot
    if (!el.hidden && el.dataset.built === '1' && el.querySelector('[data-sc-spawn-map]')) {
      this._paintSpawnMap(el, el.dataset.pickPost);
      return;
    }
    el.hidden = false;
    el.dataset.built = '1';
    const posts = this.sim.ownedPosts(this.sim.playerSide);
    const unlocked = this.sim.unlockedClasses || ['rifle'];
    const maxes = { hp: 1, attack: 1, range: 1 };
    for (const typ of unlocked) {
      const st = DEFAULT_STATS[typ] || DEFAULT_STATS.rifle;
      if (st.hp > maxes.hp) maxes.hp = st.hp;
      if (st.attack > maxes.attack) maxes.attack = st.attack;
      if (st.range > maxes.range) maxes.range = st.range;
    }
    const classes = unlocked.map((typ) => {
      return `<button type="button" class="sc-spawn-class" data-class="${typ}">
        <canvas class="sc-thumb" data-thumb="${typ}" width="144" height="144"></canvas>
        <b>${typeLabel(typ)}</b>
        ${this._spawnStatBars(typ, maxes)}
      </button>`;
    }).join('');
    const postChips = this.sim.posts.map((p) => {
      const owned = p.owner === this.sim.playerSide;
      const col = this._ownerColor(p.owner);
      return `<button type="button" class="sc-spawn-postchip${owned ? '' : ' locked'}" data-post="${p.id}" ${owned ? '' : 'disabled'} aria-label="Post ${p.label}"><i style="background:${col}"></i><b>${p.label}</b></button>`;
    }).join('');
    el.innerHTML = `
      <div class="sc-spawn-panel">
        <h2>Deploy</h2>
        <p class="sc-muted">Pick a class · pick a post</p>
        <div class="sc-spawn-posts" data-sc-spawn-posts>${postChips || '<span class="sc-muted">No owned posts</span>'}</div>
        <div class="sc-spawn-body">
          <div class="sc-spawn-classes">${classes}</div>
          <div class="sc-spawn-side">
            <div class="sc-spawn-mapwrap">
              <canvas class="sc-spawn-map" data-sc-spawn-map width="320" height="200"></canvas>
              <div class="sc-spawn-maplab" data-sc-spawn-maplab>Select a post</div>
            </div>
            <div class="sc-spawn-actions">
              <button type="button" class="sc-btn sc-spawn-go" data-sc-spawn-go disabled>Deploy</button>
              <button type="button" class="sc-btn sc-spawn-cmd" data-sc-spawn-cmd>Start Command</button>
            </div>
          </div>
        </div>
      </div>`;
    this._setDeployChrome(true);
    let pickClass = 'rifle', pickPost = posts[0]?.id;
    const go = el.querySelector('[data-sc-spawn-go]');
    const lab = el.querySelector('[data-sc-spawn-maplab]');
    const syncGo = () => {
      go.disabled = !(pickClass && pickPost);
      if (lab) {
        const p = this.sim.posts.find((x) => x.id === pickPost);
        lab.textContent = p ? `Post ${p.label} selected` : 'Select a post';
      }
    };
    el.querySelectorAll('[data-class]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        pickClass = b.getAttribute('data-class');
        el.querySelectorAll('[data-class]').forEach((x) => x.classList.toggle('on', x === b));
        syncGo();
      };
    });
    el.querySelector('[data-class]')?.classList.add('on');
    const syncPostChips = () => {
      el.querySelectorAll('[data-post]').forEach((x) => x.classList.toggle('on', x.getAttribute('data-post') === pickPost));
    };
    el.querySelectorAll('[data-post]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        pickPost = b.getAttribute('data-post');
        el.dataset.pickPost = pickPost;
        syncPostChips();
        syncGo();
        this._paintSpawnMap(el, pickPost);
      };
    });
    syncPostChips();
    const map = el.querySelector('[data-sc-spawn-map]');
    map.onpointerdown = (e) => {
      e.stopPropagation(); e.preventDefault();
      const rect = map.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (map.width / rect.width);
      const my = (e.clientY - rect.top) * (map.height / rect.height);
      const hit = this._spawnMapHit(mx, my, map.width, map.height);
      // Owned only tappable
      if (hit && hit.owner === this.sim.playerSide) {
        pickPost = hit.id;
        el.dataset.pickPost = pickPost;
        syncPostChips();
        syncGo();
        this._paintSpawnMap(el, pickPost);
      }
    };
    if (pickPost) el.dataset.pickPost = pickPost;
    syncGo();
    go.onclick = (e) => {
      e.stopPropagation();
      if (this.sim.spawnPlayer(pickClass, pickPost)) {
        el.hidden = true; el.dataset.built = '';
        this._spawnMapSnap = null;
        this._setDeployChrome(false);
        this.hintShown = true;
        this._paintHint();
        this._syncModeToggle();
        this._updateLeadChrome();
      }
    };
    el.querySelector('[data-sc-spawn-cmd]').onclick = (e) => {
      e.stopPropagation();
      this.sim.setMode('command');
      this.sim.autoStartCommand();
      el.hidden = true; el.dataset.built = '';
      this._spawnMapSnap = null;
      this._setDeployChrome(false);
      this._syncModeToggle();
      this._updateLeadChrome();
    };
    this._drawThumbs(el);
    this._spawnMapSnap = null; // force fresh battlefield capture
    this._captureSpawnBattlefield(map.width, map.height);
    this._paintSpawnMap(el, pickPost);
  }

  _spawnMapProject(wx, wy, mapW, mapH) {
    const W = this.sim.W, H = this.sim.H;
    const pad = 2.5;
    const spanX = W + pad * 2, spanY = H + pad * 2;
    return {
      x: ((wx - W / 2) / spanX + 0.5) * mapW,
      y: ((wy - H / 2) / spanY + 0.5) * mapH,
    };
  }

  _spawnMapHit(mx, my, mapW = 320, mapH = 200) {
    let best = null, bestD = 26 * 26;
    for (const p of this.sim.posts) {
      const { x: px, y: py } = this._spawnMapProject(p.x, p.y, mapW, mapH);
      const d = (px - mx) ** 2 + (py - my) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /** One-shot top-down ortho of the live scene → cached canvas (sand/rocks/walls/CP rings). */
  _captureSpawnBattlefield(mapW, mapH) {
    if (this._spawnMapSnap && this._spawnMapSnap.width === mapW) return;
    try {
      const W = this.sim.W, H = this.sim.H;
      const pad = 2.5;
      const cam = new THREE.OrthographicCamera(
        -(W / 2 + pad), (W / 2 + pad),
        (H / 2 + pad), -(H / 2 + pad),
        0.5, 220,
      );
      cam.position.set(W / 2, 95, H / 2);
      cam.up.set(0, 0, -1);
      cam.lookAt(W / 2, 0, H / 2);
      cam.updateProjectionMatrix();

      // Hide moving units + selection rings for a clean tactical map (keep terrain/props/CP)
      const hidden = [];
      for (const [, entry] of this._meshes) {
        if (entry.root?.visible) { entry.root.visible = false; hidden.push(entry.root); }
        if (entry.sel?.visible) { entry.sel.visible = false; hidden.push(entry.sel); }
      }
      if (this._goldRing) { this._goldRing.visible = false; }
      if (this._tracerGroup) this._tracerGroup.visible = false;
      const prevFog = this.scene.fog;
      this.scene.fog = null;

      const rt = new THREE.WebGLRenderTarget(mapW, mapH, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      });
      const prev = {
        xr: this.renderer.getRenderTarget(),
      };
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
      this.renderer.render(this.scene, cam);
      const buf = new Uint8Array(mapW * mapH * 4);
      this.renderer.readRenderTargetPixels(rt, 0, 0, mapW, mapH, buf);
      this.renderer.setRenderTarget(prev.xr);

      // restore
      this.scene.fog = prevFog;
      for (const o of hidden) o.visible = true;
      if (this._tracerGroup) this._tracerGroup.visible = true;
      rt.dispose();

      // Flip Y (WebGL) into a canvas
      const snap = document.createElement('canvas');
      snap.width = mapW; snap.height = mapH;
      const ctx = snap.getContext('2d');
      const img = ctx.createImageData(mapW, mapH);
      for (let y = 0; y < mapH; y++) {
        const src = (mapH - 1 - y) * mapW * 4;
        const dst = y * mapW * 4;
        img.data.set(buf.subarray(src, src + mapW * 4), dst);
      }
      ctx.putImageData(img, 0, 0);
      this._spawnMapSnap = snap;
    } catch (err) {
      this._spawnMapSnap = null;
    }
  }

  _paintSpawnMap(el, pickPost) {
    const map = el.querySelector('[data-sc-spawn-map]');
    if (!map) return;
    const ctx = map.getContext('2d');
    if (!ctx) return;
    const mapW = map.width, mapH = map.height;
    if (!this._spawnMapSnap) this._captureSpawnBattlefield(mapW, mapH);

    if (this._spawnMapSnap) {
      ctx.drawImage(this._spawnMapSnap, 0, 0, mapW, mapH);
    } else {
      // fallback sand if capture failed
      ctx.fillStyle = '#c9b48a';
      ctx.fillRect(0, 0, mapW, mapH);
    }

    // Overlay tappable flag markers at projected CP positions
    for (const p of this.sim.posts) {
      const { x: px, y: py } = this._spawnMapProject(p.x, p.y, mapW, mapH);
      const owned = p.owner === this.sim.playerSide;
      const col = this._ownerColor(p.owner);
      const sel = pickPost ? p.id === pickPost : false;
      // soft ring matching CP color
      ctx.beginPath();
      ctx.arc(px, py, sel ? 16 : 13, 0, Math.PI * 2);
      ctx.fillStyle = col + (owned ? '55' : '33');
      try { ctx.fill(); } catch (_) { ctx.fillStyle = col; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
      // flag diamond
      ctx.beginPath();
      ctx.moveTo(px, py - 9); ctx.lineTo(px + 8, py); ctx.lineTo(px, py + 9); ctx.lineTo(px - 8, py);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = sel ? '#ffd23f' : (owned ? '#ffffff' : '#00000088');
      ctx.lineWidth = sel ? 2.5 : (owned ? 1.6 : 1);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000a';
      ctx.strokeText(p.label, px, py + 12);
      ctx.fillText(p.label, px, py + 12);
      if (owned) {
        ctx.fillStyle = '#ffd23f';
        ctx.font = 'bold 9px sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.strokeText('OWNED', px, py - 12);
        ctx.fillText('OWNED', px, py - 12);
      }
    }
  }

  _drawThumbs(el) {
    // Offscreen HQ trooper render → canvas (createHqTrooper only; no outside imports)
    if (!this._thumbCache) this._thumbCache = new Map();
    const side = this.sim.playerSide === 'defender' ? 'defender' : 'attacker';
    const size = 144;
    el.querySelectorAll('[data-thumb]').forEach((c) => {
      const typ = c.getAttribute('data-thumb');
      const key = side + ':' + typ + ':' + size;
      const blit = (src) => {
        const ctx = c.getContext('2d');
        if (!ctx || !src) return;
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(src, 0, 0, c.width, c.height);
      };
      if (this._thumbCache.has(key)) { blit(this._thumbCache.get(key)); return; }
      try {
        const { root, rig } = createHqTrooper({ side, cls: typ });
        poseTrooper({ root, rig }, 'idle', 0.4, 0.016);
        const sc = new THREE.Scene();
        sc.background = new THREE.Color(BG);
        sc.add(new THREE.AmbientLight(0xffffff, 0.85));
        const dl = new THREE.DirectionalLight(0xffe6c0, 0.9);
        dl.position.set(2, 4, 2); sc.add(dl);
        sc.add(root);
        root.position.set(0, 0, 0);
        root.rotation.y = Math.PI * 0.15;
        const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
        cam.position.set(0.55, 1.55, 3.2);
        cam.lookAt(0, 1.05, 0);
        const r = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: false, preserveDrawingBuffer: true });
        r.setSize(size, size, false);
        r.setPixelRatio(1);
        r.render(sc, cam);
        const tmp = document.createElement('canvas');
        tmp.width = size; tmp.height = size;
        tmp.getContext('2d').drawImage(r.domElement, 0, 0);
        this._thumbCache.set(key, tmp);
        blit(tmp);
        disposeHqTrooper({ root, rig });
        r.dispose();
      } catch (err) {
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = BG; ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = this.sim.attColor;
        ctx.fillRect(size * 0.4, size * 0.4, size * 0.18, size * 0.3);
        ctx.beginPath(); ctx.arc(size * 0.5, size * 0.32, size * 0.1, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  _paintBoxSel() {
    const el = this.hud.querySelector('[data-sc-boxsel]');
    if (!el) return;
    const b = this._boxDrag;
    if (!b) { el.hidden = true; return; }
    const rect = this.mount.getBoundingClientRect();
    const x = Math.min(b.x0, b.x1) - rect.left;
    const y = Math.min(b.y0, b.y1) - rect.top;
    const w = Math.abs(b.x1 - b.x0);
    const h = Math.abs(b.y1 - b.y0);
    el.hidden = false;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
  }

  _paintHoldWin() {
    const el = this.hud.querySelector('[data-sc-holdwin]');
    if (!el) return;
    const hw = this.sim.holdWin;
    if (!hw || this.sim.phase !== 'fight') { el.hidden = true; return; }
    const ours = (hw.side === 'attacker' && this.sim.playerSide === 'attacker')
      || (hw.side === 'defender' && this.sim.playerSide === 'defender');
    el.hidden = false;
    const sec = Math.max(0, Math.ceil(hw.t));
    el.className = 'sc-holdwin' + (ours ? ' ours' : ' theirs');
    el.innerHTML = ours
      ? `<b>Victory in ${sec}s</b><span>Hold all control points</span>`
      : `<b>Defeat in ${sec}s</b><span>Enemy holds all posts</span>`;
  }

  _ownerColor(owner) {
    if (owner === 'attacker') return this.sim.attColor;
    if (owner === 'defender') return this.sim.defColor;
    return '#888888';
  }


  _paintBonus() {
    const el = this.hud.querySelector('[data-sc-bonus]');
    const heroBtn = this.hud.querySelector('[data-sc-hero]');
    const id = this.sim.bonus?.id;
    if (!id) {
      if (el) el.hidden = true;
      if (heroBtn) heroBtn.hidden = true;
      return;
    }
    const labels = {
      reinforce: 'Reinforce', medical: 'Medical', shield: 'Shield',
      sabotage: 'Sabotage', hero: 'Hero',
    };
    if (el) {
      el.hidden = false;
      el.innerHTML = `<span class="sc-bonus-ic">${SVG.flag}</span><span>${labels[id] || id}</span>`;
    }
    if (heroBtn) {
      const show = id === 'hero' && this.sim.mode === 'lead' && this.sim.phase === 'fight';
      heroBtn.hidden = !show;
      heroBtn.disabled = !(this.sim.heroReady && this.sim.heroT <= 0);
      heroBtn.classList.toggle('on', this.sim.heroT > 0);
      const span = heroBtn.querySelector('span');
      if (span) {
        span.textContent = this.sim.heroT > 0
          ? `Hero ${Math.ceil(this.sim.heroT)}`
          : (this.sim.heroReady ? 'Hero' : 'Used');
      }
    }
  }

  _updateLeadChrome() {
    const lead = this.sim.mode === 'lead' && this.sim.phase === 'fight';
    const touch = this._isTouch();
    this.root.classList.toggle('sc-lead', lead);
    this.root.classList.toggle('sc-touch', touch);
    this.hud.querySelector('[data-sc-cross]').hidden = !lead;
    this.hud.querySelector('[data-sc-fire]').hidden = !(lead && touch);
    this.hud.querySelector('[data-sc-joy]').hidden = !(lead && touch);
    // Enter / Exit tank
    const enterBtn = this.hud.querySelector('[data-sc-enter]');
    let near = false;
    let boarded = false;
    if (lead && this.sim.player && this.sim.alive(this.sim.player)) {
      const pl = this.sim.player;
      boarded = !!pl.inTank;
      if (boarded) near = true;
      else {
        for (const tk of this.sim.units) {
          if (tk.type === 'tank' && tk.side === pl.side && this.sim.alive(tk) && !tk.driver
              && Math.hypot(tk.x - pl.x, tk.y - pl.y) < 2.8) {
            near = true; break;
          }
        }
      }
    }
    if (enterBtn) {
      enterBtn.hidden = !(lead && near);
      const lab = boarded ? 'Exit' : 'Enter';
      enterBtn.innerHTML = `${SVG.tank}<span>${lab}</span>`;
    }
    this._syncModeToggle();
    this._layoutChrome();
    this._paintBonus();
    this._paintLeadStat(lead);
  }

  _paintLeadStat(lead) {
    const el = this.hud.querySelector('[data-sc-leadstat]');
    if (!el) return;
    const pl = this.sim.player;
    const show = !!(lead && pl && this.sim.alive(pl));
    el.hidden = !show;
    if (!show) return;
    const max = pl.stats?.hp || 100;
    const hp = Math.max(0, pl.hpNow | 0);
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    const bar = el.querySelector('[data-sc-leadhp]');
    const lab = el.querySelector('[data-sc-leadhp-lab]');
    if (bar) {
      bar.style.width = pct.toFixed(0) + '%';
      bar.style.background = pct < 25 ? '#e74c3c' : (pct < 50 ? '#f0a020' : '#3dce6a');
    }
    if (lab) lab.textContent = `HP ${hp}`;
    // Ammo: no magazine count in sim — skip (reloadT/coolT only).
  }

  _paintTickets() {
    this.hud.querySelector('[data-sc-tick-a]').textContent = this.sim.tickets.attacker | 0;
    this.hud.querySelector('[data-sc-tick-d]').textContent = this.sim.tickets.defender | 0;
    this.hud.querySelector('[data-sc-tick-L]').style.color = this.sim.attColor;
    this.hud.querySelector('[data-sc-tick-R]').style.color = this.sim.defColor;
  }

  _paintPostsHud() {
    const el = this.hud.querySelector('[data-sc-posts]');
    el.innerHTML = this.sim.posts.map((p) => {
      const col = this._ownerColor(p.owner);
      const pct = Math.round((p.progress || 0) * 100);
      return `<div class="sc-post-chip"><i style="background:${col}"></i><b>${p.label}</b>${p.contested ? '<em>vs</em>' : (pct < 100 && pct > 0 ? `<em>${pct}%</em>` : '')}</div>`;
    }).join('');
  }

  _paintBanner() {
    const el = this.hud.querySelector('[data-sc-banner]');
    if (this.sim.phase === 'outro') {
      el.hidden = false;
      const win = this.sim.playerWon();
      const pts = (this.sim._pendingResult || this.sim.result()).pointsEarned | 0;
      el.innerHTML = `<div class="sc-ban-card"><div class="sc-ban-big">${win ? 'Victory' : 'Defeat'}</div>
        <div class="sc-ban-pts">Points ${pts}</div><div class="sc-ban-sub">Tap to continue</div></div>`;
    } else el.hidden = true;
    this._paintHoldWin();
  }

  _syncMeshes() {
    const live = new Set();
    const tNow = this.sim.time || 0;
    for (const u of this.sim.units) {
      live.add(u.id);
      let entry = this._meshes.get(u.id);
      if (!entry) {
        const team = u.side === 'attacker' ? this.sim.attColor : this.sim.defColor;
        const root = u.type === 'tank' ? makeTank(team) : makeTrooper(u.type === 'recon' ? 'recon' : u.type, team);
        this.scene.add(root);
        // Army HQ selection ring (blue for attacker, red for defender)
        const ringCol = u.side === 'attacker' ? 0x3ab4ff : 0xff5a4a;
        const sel = new THREE.Mesh(
          new THREE.RingGeometry(0.38, 0.52, 24).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0.85, depthWrite: false }),
        );
        sel.position.y = 0.04;
        sel.visible = false;
        this.scene.add(sel);
        entry = { root, wreck: null, unit: u, sel, dropped: false };
        this._meshes.set(u.id, entry);
      }
      entry.unit = u;
      const root = entry.root;
      const rig = root.userData?.hqRig;
      const yaw = -(u.aim || 0) + Math.PI / 2;
      const moving = Math.min(1, (u.moving || 0) / Math.max(0.5, (u.stats?.speed || 3)));
      const isOut = u.status === 'out';
      const isCrawl = u.status === 'crawl';

      if (rig && u.type === 'tank') {
        // Sim owns world pose; tankfx owns visual child/bones only
        root.position.set(u.x, 0, u.y);
        root.rotation.y = yaw;
        root.scale.setScalar(UNIT_SCALE);
        root.visible = true;
        if (!entry.feel && this._hqFx) {
          try {
            entry.feel = createTankFeel(root, { fx: this._hqFx, scene: this.scene, isTracked: true, id: String(u.id), reduceMotion: this._reduceMotion() });
            entry._prevSpeed = 0;
            entry._prevYaw = yaw;
          } catch (err) { console.warn('tankfx create', err); }
        }
        const pose = { x: 0, z: 0, yaw: 0 }; // placeholder for hook signature
        this._tankFxOnPose?.(u, entry, pose, tNow);
        if (isOut && !entry._tankFxDead) {
          entry._tankFxDead = true;
          this._tankFxOnDeath?.(u, entry);
        }
      } else if (rig) {
        const fireIdx = ({ rifle: 0, heavy: 1, sniper: 2, recon: 2, engineer: 3, officer: 4, special: 5 })[u.type] || 0;
        const pose = arenaPose({
          t: tNow,
          aim: (u.coolT > 0 || (u.shotT != null && u.shotT < 0.8)) ? 1 : (moving > 0.15 ? 0.35 : 0.15),
          crouch: isCrawl ? 1 : 0,
          move: isOut ? 0 : moving,
          dist: u.walkDist || 0,
          run: moving > 0.75,
          shot: u.shotT != null && u.shotT < 0.6 ? u.shotT : null,
          fire: FIRE_PROFILES[fireIdx] || FIRE_PROFILES[0],
          hit: u.hitT != null && u.hitT < 1.4 ? u.hitT : null,
          down: isOut ? (u.outT || 0) : null,
        });
        pose.x = 0; pose.z = 0; pose.yaw = 0;
        // Living units must stay upright (only out may go flat; crawl stays crouched not belly-flat).
        if (!isOut && !isCrawl) {
          if (pose.fk) pose.fk = 0;
          if (pose.prx != null && Math.abs(pose.prx) > 0.85) pose.prx *= 0.2;
          pose.wpn = 1;
        } else if (isCrawl && pose.prx != null && pose.prx > 1.1) {
          pose.prx = 0.5;
        }
        rig.apply(pose);
        // world placement (pose.y carries bob / fall height in model units)
        const sc = UNIT_SCALE;
        root.scale.setScalar(sc);
        let yOff = (pose.y || 0) * sc;
        if (isOut) {
          // Sink + fade after ~1.5s on the ground; sim removes at 3s
          const ot = u.outT || 0;
          const sink = ot > 1.5 ? Math.min(1, (ot - 1.5) / 1.5) : 0;
          yOff -= sink * 0.85 * sc;
          if (sink > 0 && pose.fade != null) pose.fade = Math.min(pose.fade ?? 1, 1 - sink);
          if (sink > 0) rig.setFade?.(Math.max(0.02, 1 - sink));
        }
        root.position.set(u.x, yOff, u.y);
        root.rotation.y = yaw;
        const boarded = !!(u.playerControlled && u.inTank);
        root.visible = !boarded && (!isOut || ((pose.fade ?? 1) > 0.01 && (u.outT || 0) < 3.05));
        // drop weapon once when taken out
        if (isOut && !entry.dropped && (u.outT || 0) >= (OUT_T.drop || 0.25) && this._hqFx) {
          entry.dropped = true;
          try {
            const fx = this._hqFx;
            if (fx.tweens && fx.tweens.length > 6) {
              const n = fx.tweens.length - 6;
              for (let i = 0; i < n; i++) {
                const tw = fx.tweens[i];
                if (tw?.m) {
                  try { fx.scene.remove(tw.m); tw.m.traverse?.(o => { try { o.material?.dispose?.(); } catch(_){} }); } catch(_){}
                }
              }
              fx.tweens.splice(0, n);
            }
            dropWeapon({ rig, fx }, 2.0);
          } catch (_) {}
        }
      } else {
        // fallback (wreck mesh)
        root.position.set(u.x, 0, u.y);
        root.rotation.y = yaw;
        root.visible = true;
      }

      if (entry.sel) {
        entry.sel.visible = !!u.selected && !isOut;
        entry.sel.position.set(u.x, 0.04, u.y);
      }
    }
    for (const [id, entry] of this._meshes) {
      if (!live.has(id)) {
        // Let tank wreck finish (~4.5s) before disposing the mesh
        if (entry.feel && entry._tankFxDead && !entry._tankFxHold) {
          entry._tankFxHold = performance.now();
        }
        if (entry._tankFxHold && performance.now() - entry._tankFxHold < 5200) {
          try { entry.feel?.update?.(this._lastDt || 0.016, { speed: 0, accel: 0, yawRate: 0, aimYaw: 0 }); } catch (_) {}
          continue;
        }
        try { entry.feel?.dispose?.(); } catch (_) {}
        entry.feel = null;
        disposeObject3D(entry.root);
        this.scene.remove(entry.root);
        if (entry.sel) { this.scene.remove(entry.sel); entry.sel.geometry?.dispose?.(); entry.sel.material?.dispose?.(); }
        this._meshes.delete(id);
      }
    }
    for (const p of this.sim.posts) {
      const m = this._postMeshes.get(p.id);
      if (!m) continue;
      const col = new THREE.Color(this._ownerColor(p.owner));
      m.flagMat.color.copy(col);
      if (m.haloMat) m.haloMat.color.copy(col);
      m.ringMat.color.copy(col);
      m.fillMat.color.copy(col);
      // soft holo pulse on flag + halo
      const pulse = 0.72 + 0.18 * Math.sin((performance.now() * 0.004) + p.id.length);
      m.flagMat.opacity = pulse;
      if (m.haloMat) m.haloMat.opacity = 0.35 + 0.25 * Math.sin((performance.now() * 0.005) + 1.7);
      // billboard flag toward camera on Y
      if (m.flag && this.camera) {
        const dx = this.camera.position.x - m.group.position.x;
        const dz = this.camera.position.z - m.group.position.z;
        m.flag.rotation.y = Math.atan2(dx, dz);
      }
      m.fillMat.opacity = 0.12 + 0.25 * (p.progress || 0);
      // Lead: never show CP flag/pole/fill/ring/halo (washes OTS + pierces tanks)
      if (this.sim.mode === 'lead') {
        if (m.fill) m.fill.visible = false;
        if (m.ring) m.ring.visible = false;
        if (m.halo) m.halo.visible = false;
        if (m.flag) m.flag.visible = false;
        if (m.pole) m.pole.visible = false;
      } else {
        // Command: hide pole/flag when any tank (incl wreck) is near the post
        let tankNear = false;
        for (const u of this.sim.units) {
          if (u.type === 'tank' && Math.hypot(u.x - p.x, u.y - p.y) < 2.8) { tankNear = true; break; }
        }
        if (m.pole) m.pole.visible = !tankNear;
        if (m.flag) m.flag.visible = !tankNear;
      }
    }
    // gold ring on player
    if (this._goldRing) {
      const pl = this.sim.player;
      if (this.sim.mode === 'lead' && pl && this.sim.alive(pl)) {
        this._goldRing.visible = true;
        this._goldRing.position.x = pl.x;
        this._goldRing.position.z = pl.y;
        this._goldRing.rotation.z = this.sim.time * 1.5;
      } else {
        this._goldRing.visible = false;
      }
    }
  }

  _spawnTracerFx() {
    // Army HQ demo-fx: muzzle flash, tracers, hit puffs
    const fx = this.sim.fx;
    const H = this._hqFx;
    for (let i = this._fxHeard; i < fx.length; i++) {
      const f = fx[i];
      if (!H) break;
      if (f.kind === 'tracer') {
        const a = new THREE.Vector3(f.x0, 1.05, f.y0);
        const b = new THREE.Vector3(f.x1, 1.05, f.y1);
        const col = new THREE.Color(f.color || '#ffe08a');
        H.tracer(a, b, col.getHex(), 0.1, 0.03);
      } else if (f.kind === 'muzzle') {
        const p = new THREE.Vector3(f.x, 1.1, f.y);
        const dir = new THREE.Vector3(Math.cos(f.ang || 0), 0, Math.sin(f.ang || 0));
        if (f.tank) {
          // tankfx owns muzzle+shell — skip old HQ muzzle to avoid double FX
          this._tankFxOnFire?.(f, p, dir);
        } else {
          H.muzzle(p, dir, 0xffd27a, 1);
        }
        if (this.sim.player && this.sim.player.playerControlled) {
          const pl = this.sim.player;
          if (Math.hypot(f.x - pl.x, f.y - pl.y) < 1.5) this._kick = 0.18;
        }
      } else if (f.kind === 'spark' || f.kind === 'hitflash') {
        if (f.tankHit) {
          this._tankFxOnHit?.(f);
        } else {
          H.hitPuff(new THREE.Vector3(f.x, 1.0, f.y), 1);
        }
        if (this.sim.mode === 'lead' && this.sim.player?.playerControlled) this._hitFlash = 0.35;
      } else if (f.kind === 'out') {
        // Tank death: tankfx.destroy owns the wreck FX — skip grey puff double
        if (!f.tank) H.smoke(new THREE.Vector3(f.x, 0.4, f.y), 5, 0.5, 0x6a6e74, 0.4, 0.5, 1.4);
      }
    }
  }

  _tickTracers(dt) {
    const dead = [];
    for (const c of this._tracerGroup.children) {
      c.userData.age = (c.userData.age || 0) + dt;
      const a = 1 - c.userData.age / (c.userData.life || 0.12);
      if (c.material) c.material.opacity = Math.max(0, a);
      if (c.userData.age >= c.userData.life) dead.push(c);
    }
    for (const c of dead) {
      this._tracerGroup.remove(c);
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    }
  }


  /** tankfx.js — pose / fire / hit / death. Visual only; sim stays authoritative. */
  _tankFxOnPose(u, entry, _pose, _tNow) {
    const feel = entry?.feel;
    if (!feel) return;
    const dt = this._lastDt || 0.016;
    const speed = Math.min(1.5, (u.moving || 0) / Math.max(0.5, (u.stats?.speed || 2.4)));
    const prev = entry._prevSpeed || 0;
    const accel = (speed - prev) / Math.max(1e-3, dt);
    entry._prevSpeed = speed;
    const yaw = -(u.aim || 0) + Math.PI / 2;
    let yawRate = 0;
    if (entry._prevYaw != null) {
      let d = yaw - entry._prevYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      yawRate = d / Math.max(1e-3, dt);
    }
    entry._prevYaw = yaw;
    const aimYaw = 0; // turret follows hull aim in conquest; feel adds idle scan
    try {
      feel.update(dt, { speed, accel, yawRate, aimYaw, reduceMotion: this._reduceMotion() });
    } catch (_) {}
  }
  _tankFxOnFire(f, pos, dir) {
    // Find firing tank near muzzle
    let entry = null;
    let best = 2.5;
    for (const [, e] of this._meshes) {
      if (e.unit?.type !== 'tank' || !e.feel) continue;
      const d = Math.hypot(e.unit.x - f.x, e.unit.y - f.y);
      if (d < best) { best = d; entry = e; }
    }
    if (!entry?.feel) return;
    const range = entry.unit?.stats?.range || 14;
    const ang = f.ang != null ? f.ang : Math.atan2(dir.z, dir.x);
    const target = new THREE.Vector3(
      f.x + Math.cos(ang) * range * 0.85,
      0.6,
      f.y + Math.sin(ang) * range * 0.85,
    );
    // Visual wind-up only — sim damage already applied
    try { entry.feel.fire(target); } catch (_) {}
  }
  _tankFxOnHit(f) {
    let entry = null;
    let best = 2.5;
    for (const [, e] of this._meshes) {
      if (e.unit?.type !== 'tank' || !e.feel) continue;
      const d = Math.hypot(e.unit.x - f.x, e.unit.y - f.y);
      if (d < best) { best = d; entry = e; }
    }
    if (!entry?.feel) return;
    const dir = new THREE.Vector3(1, 0, 0);
    try { entry.feel.hit(dir, f.dmg || 20); } catch (_) {}
  }
  _tankFxOnDeath(u, entry) {
    if (!entry?.feel) return;
    try { entry.feel.destroy(); } catch (_) {}
  }
  _maxTankTrauma() {
    let m = 0;
    for (const [, e] of this._meshes) {
      const t = e.feel?.trauma || 0;
      if (t > m) m = t;
    }
    return m;
  }

  _fadeOccluders() {
    const clearMat = (mat) => {
      if (!mat) return;
      mat.userData = mat.userData || {};
      if (mat.userData._occFade) {
        mat.opacity = 1;
        mat.transparent = !!mat.userData._wasTransparent;
        mat.depthWrite = true;
        mat.userData._occFade = false;
      }
      // Undo any stuck hit-flash on cloned mats (shared TeamLook must never stay white)
      if (mat.userData._occEmissive && mat.emissive) {
        mat.emissive.copy(mat.userData._occEmissive);
        if (mat.userData._occEmissiveI != null) mat.emissiveIntensity = mat.userData._occEmissiveI;
      }
      if (mat.userData._occColor && mat.color) mat.color.copy(mat.userData._occColor);
    };
    const hardFadeMat = (mat) => {
      if (!mat) return;
      mat.userData = mat.userData || {};
      if (mat.userData._wasTransparent == null) mat.userData._wasTransparent = !!mat.transparent;
      mat.transparent = true;
      mat.opacity = 0.1;
      mat.depthWrite = false;
      mat.userData._occFade = true;
    };
    const ensureOccClone = (o) => {
      if (!o.isMesh || !o.material || o.userData._occMatCloned) return;
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => m.clone())
        : o.material.clone();
      o.userData._occMatCloned = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        mat.userData = mat.userData || {};
        if (mat.emissive && !mat.userData._occEmissive) {
          mat.userData._occEmissive = mat.emissive.clone();
          mat.userData._occEmissiveI = mat.emissiveIntensity ?? 0;
        }
        if (mat.color && !mat.userData._occColor) mat.userData._occColor = mat.color.clone();
      }
    };
    const restoreRoot = (root) => {
      if (!root) return;
      if (root.userData?._occHidden) {
        root.visible = root.userData._occWasVisible !== false;
        root.userData._occHidden = false;
      }
      root.traverse?.((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) clearMat(mat);
      });
      if (root.material) {
        const mats = Array.isArray(root.material) ? root.material : [root.material];
        for (const mat of mats) clearMat(mat);
      }
    };

    if (this.sim.mode !== 'lead' || !this.sim.player || !this.sim.alive(this.sim.player)) {
      for (const m of this._propMeshes) restoreRoot(m);
      for (const [, e] of this._meshes) restoreRoot(e.root);
      // Lead: ALWAYS keep CP pole/flag/fill/ring/halo hidden — even if player died or
      // exited the tank. The old tankNear path re-showed poles and left a grey CP mast
      // under the crosshair (post-* CylinderGeometry #c8ccd2).
      const leadKeep = this.sim.mode === 'lead';
      for (const [postId, pm] of this._postMeshes) {
        restoreRoot(pm.group);
        if (pm.pole?.material) clearMat(pm.pole.material);
        if (pm.flag?.material) clearMat(pm.flag.material);
        if (pm.fillMat) clearMat(pm.fillMat);
        if (pm.ringMat) clearMat(pm.ringMat);
        if (pm.haloMat) clearMat(pm.haloMat);
        if (leadKeep) {
          if (pm.fill) pm.fill.visible = false;
          if (pm.ring) pm.ring.visible = false;
          if (pm.halo) pm.halo.visible = false;
          if (pm.flag) pm.flag.visible = false;
          if (pm.pole) pm.pole.visible = false;
          continue;
        }
        if (pm.fill) pm.fill.visible = true;
        if (pm.ring) pm.ring.visible = true;
        if (pm.halo) pm.halo.visible = true;
        // Command: hide pole/flag when a tank overlaps the CP (avoids black pole through hull)
        const post = this.sim.posts.find((p) => p.id === postId) || null;
        let tankNear = false;
        if (post) {
          for (const u of this.sim.units) {
            if (u.type === 'tank' && Math.hypot(u.x - post.x, u.y - post.y) < 2.8) {
              tankNear = true; break;
            }
          }
        }
        if (pm.pole) pm.pole.visible = !tankNear;
        if (pm.flag) pm.flag.visible = !tankNear;
      }
      return;
    }

    const pl = this.sim.player;
    const cam = this.camera.position;
    const target = new THREE.Vector3(pl.x, 1.15, pl.y);
    const toPlayer = target.clone().sub(cam);
    const dist = toPlayer.length();
    const dir = toPlayer.clone().normalize();
    const tmpProj = new THREE.Vector3();

    /** 'hide' | 'fade' | null */
    const classify = (pos, radius = 0.6) => {
      const to = pos.clone().sub(cam);
      const camDist = to.length();
      const t = to.dot(dir);
      // Fully hide: within ~2.2m of camera
      if (camDist < 2.2 && t > -0.35) return 'hide';
      // Fully hide: covers lower third / near-camera foreground (brown rocks, walls)
      tmpProj.copy(pos).project(this.camera);
      if (tmpProj.z > -1 && tmpProj.z < 1 && tmpProj.y < 0.12 && Math.abs(tmpProj.x) < 1.6) {
        if (camDist < dist + 4.0) return 'hide';
      }
      if (t < 0.1 || t > dist - 0.15) return null;
      const closest = cam.clone().add(dir.clone().multiplyScalar(t));
      if (closest.distanceTo(pos) < radius) return 'fade';
      if (camDist < 2.6 && t < dist * 0.9 && camDist < radius + 1.2) return 'fade';
      return null;
    };

    const applyRoot = (root, mode) => {
      if (!root) return;
      if (mode === 'hide') {
        if (!root.userData._occHidden) {
          root.userData._occWasVisible = root.visible;
          root.userData._occHidden = true;
        }
        root.visible = false;
        return;
      }
      if (root.userData?._occHidden) {
        root.visible = root.userData._occWasVisible !== false;
        root.userData._occHidden = false;
      }
      const fade = mode === 'fade';
      const visit = (o) => {
        if (!o.isMesh || !o.material) return;
        ensureOccClone(o);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
          if (fade) hardFadeMat(mat);
          else clearMat(mat);
        }
      };
      if (root.isMesh) visit(root);
      root.traverse?.(visit);
    };

    for (const m of this._propMeshes) {
      const pos = m.position.clone();
      const rad = m.userData?.radius || 1.35;
      pos.y = Math.max(0.4, rad * 0.45);
      let mode = classify(pos, rad);
      const camDist = pos.distanceTo(cam);
      tmpProj.copy(pos).project(this.camera);
      // Big walls/rocks near the lens or lower third: hide (catches bottom-right boulders)
      if (mode === 'fade' && (camDist < 5.5 || rad >= 1.0)) mode = 'hide';
      if (!mode && camDist < 4.2 && rad >= 0.55) mode = 'hide';
      if (!mode && tmpProj.z > -1 && tmpProj.z < 1 && tmpProj.y < -0.05 && Math.abs(tmpProj.x) < 1.5 && camDist < 8) {
        mode = 'hide';
      }
      applyRoot(m, mode);
    }

    const plId = this.sim.player?.id;
    for (const [, e] of this._meshes) {
      const u = e.unit;
      const isLead = !!(u && (u.isPlayer || u.id === plId || u.playerControlled));
      const isRide = !!(this.sim.player?.inTank && u && u.id === this.sim.player.inTank);
      if (!u || isLead || isRide) {
        // Ride/player: never clone/fade mats (clobber TeamLook atlas / fight tankfx flash).
        if (e.root?.userData?._occHidden) {
          e.root.visible = e.root.userData._occWasVisible !== false;
          e.root.userData._occHidden = false;
        }
        // Ride tank: force TeamLook rebind if feel leaked wreckMat / NaN clone onto the live hull.
        if (isRide && e.feel && !e.feel.wrecked) {
          try {
            const rig = e.root?.userData?.hqRig;
            const wmat = e.feel?.wreckMat || rig?.wreckMat;
            if (rig?.setWreck) rig.setWreck(false, wmat);
          } catch (_) {}
        }
        continue;
      }
      const pos = new THREE.Vector3(u.x, u.type === 'tank' ? 1.0 : 0.85, u.y);
      const rad = u.type === 'tank' ? 2.8 : 1.2;
      let mode = classify(pos, rad);
      const camDist = pos.distanceTo(cam);
      tmpProj.copy(pos).project(this.camera);
      // Vehicles (enemy/friendly tanks + wrecks): while the player drives a tank, hide
      // any vehicle within ~6m of the camera, or projected into the lower third / over
      // HUD buttons (Fire/Exit). Prefer hide over fade so TeamLook atlas mats are never
      // orphan-cloned (NaN/black hull lesson).
      const driving = !!this.sim.player?.inTank;
      if (u.type === 'tank') {
        if (driving) {
          // Phone tank cam sits ~9m up — 3D camDist never drops below ~8 for ground
          // units, so use horizontal (XZ) range for the ~6m rule.
          const horiz = Math.hypot(u.x - cam.x, u.y - cam.z);
          if (horiz < 6.0 || camDist < 11.0) mode = 'hide';
          else if (tmpProj.z > -1 && tmpProj.z < 1) {
            const lowerThird = tmpProj.y < -0.33;
            const hudRight = tmpProj.x > 0.28 && tmpProj.y < 0.35; // Fire / Exit column
            const hudLeft = tmpProj.x < -0.55 && tmpProj.y < 0.15; // joystick / HP
            const nearLower = tmpProj.y < -0.1 && (horiz < 10.0 || camDist < 14.0);
            if (lowerThird || hudRight || hudLeft || nearLower) mode = 'hide';
          }
          if (mode === 'fade') mode = 'hide';
        } else {
          if (camDist < 3.2) mode = 'hide';
          else if (mode === 'fade') mode = 'hide';
          else if (tmpProj.z > -1 && tmpProj.z < 1 && Math.abs(tmpProj.x) < 0.85 && tmpProj.y < 0.55 && camDist < 5.5) mode = 'hide';
        }
      } else if (mode === 'fade' && camDist < 2.4) {
        mode = 'hide';
      }
      // Tanks: hide-only path — never leave opacity clones on TeamLook materials
      if (u.type === 'tank' && mode === 'fade') mode = 'hide';
      applyRoot(e.root, mode);
      // After un-hide, rebind live TeamLook if feel left a wreck/flash clone on the hull
      if (u.type === 'tank' && mode !== 'hide' && e.feel && !e.feel.wrecked) {
        try {
          const rig = e.root?.userData?.hqRig;
          const wmat = e.feel?.wreckMat || rig?.wreckMat;
          if (rig?.setWreck) rig.setWreck(false, wmat);
        } catch (_) {}
      }
      if (e.sel) {
        if (mode === 'hide') e.sel.visible = false;
      }
    }

    for (const [, pm] of this._postMeshes) {
      // Lead: fill/ring/halo AND flag banner planes wash the frame — always hide
      if (pm.fill) pm.fill.visible = false;
      if (pm.ring) pm.ring.visible = false;
      if (pm.halo) pm.halo.visible = false;
      if (pm.flag) pm.flag.visible = false;
      if (pm.pole) pm.pole.visible = false;
    }
  }

  _applyPlayerInput() {
    if (this.sim.mode !== 'lead' || !this.sim.player) return;
    let mx = 0, my = 0;
    if (this._isTouch()) {
      const jx = this._joy.dx, jy = -this._joy.dy;
      const c = Math.cos(this._aim.yaw), s = Math.sin(this._aim.yaw);
      mx = jx * c + jy * s;
      my = -jx * s + jy * c;
    } else {
      const k = this._keys || new Set();
      const f = (k.has('w') ? 1 : 0) + (k.has('s') ? -1 : 0);
      const r = (k.has('d') ? 1 : 0) + (k.has('a') ? -1 : 0);
      const c = Math.cos(this._aim.yaw), s = Math.sin(this._aim.yaw);
      mx = r * c + f * s;
      my = -r * s + f * c;
    }
    const fire = this._fireHeld || (!this._isTouch() && this._pointerLocked && this._fireHeld);
        const firingNow = !!(this._fireHeld || (this._firePulseUntil && performance.now() < this._firePulseUntil));
    if (firingNow && !this._fireFxEdge && this.sim.player?.inTank) {
      const tid = this.sim.player.inTank;
      const e = this._meshes.get(tid);
      const tank = this.sim.units.find((u) => u.id === tid);
      if (e?.feel && tank && !e.feel.wrecked) {
        const yaw = this._aim.yaw;
        try {
          e.feel.fire(new THREE.Vector3(
            tank.x + Math.sin(yaw) * 12, 0.6, tank.y + Math.cos(yaw) * 12,
          ));
        } catch (_) {}
      }
    }
    this._fireFxEdge = firingNow;
    this.sim.setPlayerInput({
      mx, my, aim: this._aim.yaw, fire: firingNow,
      reload: this._keys?.has('r'),
      interact: false,
    });
  }

  _clampCmdCam() {
    const m = 1.5;
    this._cam.tx = Math.max(m, Math.min(this.sim.W - m, this._cam.tx));
    this._cam.tz = Math.max(m, Math.min(this.sim.H - m, this._cam.tz));
  }

  /** Portrait phone → 3.4m / taller; PC → 2.8m. Blockers fade/hide, never pull cam in. */
  _leadIdeal() {
    const w = this.mount?.clientWidth || this._w || 800;
    const h = this.mount?.clientHeight || this._h || 600;
    const phone = this._isTouch() || w <= 520 || h > w * 1.05;
    // phone: trooper ~35% width, feet above joystick — lookAhead short keeps body high in frame
    if (phone) return { dist: 4.2, height: 2.85, lookY: 0.7, side: -0.55, lookAhead: 0.55 };
    return { dist: 2.8, height: 1.48, lookY: 1.15, side: 0.38, lookAhead: 4.5 };
  }

  _leadCamDist(_u, _yaw, ideal) {
    return ideal != null ? ideal : this._leadIdeal().dist;
  }

  /** Instant TPS place so Lead never flashes the overhead Command cam. */
  _snapLeadCam() {
    const u = this.sim.player;
    if (!u || !this.sim.alive(u)) return;
    const yaw = this._aim.yaw;
    const ideal = this._leadIdeal();
    const dist = ideal.dist;
    const height = ideal.height + this._aim.pitch * 0.7;
    const side = ideal.side != null ? ideal.side : 0.38;
    const backX = u.x - Math.sin(yaw) * dist + Math.cos(yaw) * side;
    const backZ = u.y - Math.cos(yaw) * dist - Math.sin(yaw) * side;
    this._leadSmooth.set(backX, height, backZ);
    this.camera.position.copy(this._leadSmooth);
    const la = ideal.lookAhead != null ? ideal.lookAhead : 4.5;
    this.camera.lookAt(u.x + Math.sin(yaw) * la + Math.cos(yaw) * side * 0.35, ideal.lookY - this._aim.pitch * 0.5, u.y + Math.cos(yaw) * la - Math.sin(yaw) * side * 0.35);
  }

  _updateCamera(dt) {
    if (this.sim.mode === 'lead' && this.sim.player && this.sim.alive(this.sim.player)) {
      const u = this.sim.player;
      const yaw = this._aim.yaw;
      const ideal = this._leadIdeal();
      let dist = ideal.dist;
      let height = ideal.height + this._aim.pitch * 0.7;
      // PC ~2.8m / phone portrait ~4.0m; phone side offset puts trooper ~35% width
      const side = ideal.side != null ? ideal.side : 0.38;
      // Near vehicles (close / boarding): pull cam back + up so hull never fills the lens
      const phone = this._isTouch() || (this.mount?.clientWidth || 800) <= 520;
      let nearTankD = 1e9;
      for (const ou of this.sim.units) {
        if (ou.type !== 'tank' || !this.sim.alive(ou)) continue;
        if (ou.id === u.inTank) continue;
        const d = Math.hypot(ou.x - u.x, ou.y - u.y);
        if (d < nearTankD) nearTankD = d;
      }
      if (u.inTank) {
        // Drive cam: phone ≈30% width; PC ≈22-28% width (was 8.2/4.2 → only 19%)
        dist = phone ? Math.max(dist, 18.5) : Math.max(dist, 7.55);
        height = phone ? Math.max(height, 9.0) : Math.max(height, 3.85);
      } else if (nearTankD < 2.8) {
        dist = phone ? Math.max(dist, 5.2) : Math.max(dist, 3.5);
        height = phone ? Math.max(height, 2.45) : Math.max(height, 1.8);
      } else if (nearTankD < 4.0 && phone) {
        dist = Math.max(dist, 4.5);
        height = Math.max(height, 2.2);
      }
      const backX = u.x - Math.sin(yaw) * dist + Math.cos(yaw) * side;
      const backZ = u.y - Math.cos(yaw) * dist - Math.sin(yaw) * side;
      const want = new THREE.Vector3(backX, height, backZ);
      if (this._kick > 0) {
        want.y += this._kick * 0.35;
        this._kick = Math.max(0, this._kick - dt * 2.5);
      }
      const k = Math.min(1, dt * 14);
      this._leadSmooth.lerp(want, k);
      this.camera.position.copy(this._leadSmooth);
      const la = u.inTank ? 12.0 : (ideal.lookAhead != null ? ideal.lookAhead : 4.5);
      const look = new THREE.Vector3(
        u.x + Math.sin(yaw) * la + Math.cos(yaw) * side * 0.35,
        (u.inTank ? 1.05 : ideal.lookY) - this._aim.pitch * 0.5,
        u.y + Math.cos(yaw) * la - Math.sin(yaw) * side * 0.35,
      );
      this.camera.lookAt(look);
      this._applyTraumaShake(1.0);
    } else {
      const c = this._cam;
      this._clampCmdCam();
      c.x += (c.tx - c.x) * Math.min(1, dt * 5);
      c.z += (c.tz - c.z) * Math.min(1, dt * 5);
      const dist = Math.max(10, Math.min(26, c.dist));
      // shallower than pure overhead so upright troopers read clearly (HQ-like isometric)
      this.camera.position.set(c.x, dist * 0.52, c.z + dist * 0.85);
      this.camera.lookAt(c.x, 0.45, c.z);
      this._applyTraumaShake(0.35);
    }
  }

  /** Prefers opts.reduceMotion OR matchMedia('(prefers-reduced-motion: reduce)'). */
  _reduceMotion() {
    if (this.hooks?.reduceMotion) return true;
    try {
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (_) {}
    return !!this._forceReduceMotion;
  }

  /** Visual-only camera shake from tank feel trauma (trauma²). Skipped under reduceMotion. */
  _applyTraumaShake(scale = 1) {
    if (this._reduceMotion()) return;
    const trauma = this._maxTankTrauma();
    if (trauma <= 0.001) return;
    const mag = trauma * trauma * 0.22 * scale;
    const t = performance.now() * 0.001;
    this.camera.position.x += Math.sin(t * 47.1) * mag;
    this.camera.position.y += Math.cos(t * 53.7) * mag * 0.65;
    this.camera.position.z += Math.sin(t * 41.3 + 1.7) * mag;
  }

  screenToWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 2 - 1;
    const y = -(((clientY - r.top) / r.height) * 2 - 1);
    const v = new THREE.Vector3(x, y, 0.5).unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    if (Math.abs(dir.y) < 1e-4) return null;
    const t = -this.camera.position.y / dir.y;
    if (!isFinite(t) || t < 0) return null;
    const p = this.camera.position.clone().add(dir.multiplyScalar(t));
    return { x: p.x, y: p.z };
  }

  resize() {
    const w = this.mount.clientWidth || 320;
    const h = this.mount.clientHeight || 480;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this._w = w; this._h = h;
    this.root.classList.toggle('sc-phone', w <= 520);
    this.root.classList.toggle('sc-land', w > h);
    this._layoutChrome();
    this._updateLeadChrome();
  }

  _paintHpBars() {
    const el = this.hud.querySelector('[data-sc-hpbars]');
    if (!el || !this._w) return;
    const parts = [];
    const v = new THREE.Vector3();
    for (const u of this.sim.units) {
      if (u.status === 'out' || (!this.sim.alive(u) && u.status !== 'crawl')) continue;
      // Clutter fix: HP only on selected friendlies + the possessed Lead unit
      const isLead = this.sim.mode === 'lead' && this.sim.player === u && u.playerControlled;
      if (!u.selected && !isLead) continue;
      v.set(u.x, u.type === 'tank' ? 1.2 * UNIT_SCALE : 1.85 * UNIT_SCALE, u.y);
      v.project(this.camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * this._w;
      const sy = (-v.y * 0.5 + 0.5) * this._h;
      if (sx < -40 || sy < -40 || sx > this._w + 40 || sy > this._h + 40) continue;
      const pct = Math.max(0, Math.min(100, (u.hpNow / u.stats.hp) * 100));
      const crawl = u.status === 'crawl' ? ' crawl' : '';
      parts.push(`<div class="sc-hpbar3${crawl}" style="left:${sx}px;top:${sy}px"><i style="width:${pct}%"></i></div>`);
    }
    el.innerHTML = parts.join('');
  }

  _paintHitmark(dt) {
    const mark = this.hud.querySelector('[data-sc-hitmark]');
    if (!mark) return;
    if (this._hitFlash > 0) {
      this._hitFlash -= dt;
      mark.hidden = false;
    } else mark.hidden = true;
  }

  draw(dt, opts = {}) {
    if (this.disposed) return;
    const paused = !!opts.paused || this._paused();
    const t0 = performance.now();
    const d = dt || 0.016;
    this._lastDt = d;
    if (!paused) this._applyPlayerInput();
    // Sync first so tank feel exists before muzzle/hit hooks run
    this._syncMeshes();
    if (!paused) {
      this._spawnTracerFx();
      this._tickTracers(d);
      if (this._hqFx) this._hqFx.update(d, this.camera);
      this._fxHeard = this.sim.fx.length;
      this._updateCamera(d);
    }
    this._fadeOccluders();
    this._paintTickets();
    this._paintPostsHud();
    this._paintBanner();
    this._paintHitmark(paused ? 0 : d);
    if (this.sim.phase === 'spawn' || this.sim.needSpawn) this._paintSpawn();
    else {
      const sp = this.hud.querySelector('[data-sc-spawn]');
      if (sp) sp.hidden = true;
    }
    this._updateLeadChrome();
    this._paintBonus();
    if (this.hintShown) {
      if (!this._hintUntil) this._hintUntil = performance.now() + 4000;
      if (performance.now() > this._hintUntil || this.sim.time > 4.2) {
        this.hintShown = false; this._paintHint();
      } else {
        this._paintHint();
      }
    }
    this._paintHpBars();
    this._hearFx();
    this.renderer.render(this.scene, this.camera);
    const ms = performance.now() - t0;
    this.frameTimes.push(ms);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
  }

  _hearFx() {
    // sounds already triggered via _spawnTracerFx window; keep light
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

  playSound(kind) {
    if (this.muted || this.disposed) return;
    this._ensureAudio();
    const ac = this._audio;
    if (!ac) return;
    try {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      const t0 = ac.currentTime;
      let f = 440, dur = 0.06;
      if (kind === 'shot') { f = 220; dur = 0.05; o.type = 'square'; }
      else if (kind === 'hit') { f = 180; dur = 0.07; o.type = 'sawtooth'; }
      else if (kind === 'out') { f = 90; dur = 0.2; o.type = 'triangle'; }
      else { f = 520; dur = 0.05; o.type = 'sine'; }
      o.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.04, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (_) {}
  }

  touchTargetPx() { return 48; }
  unitPixelSize() { return 36; }
  fieldFillRatio() { return 0.9; }
  labelOverlapReport() { return { overlaps: 0 }; }
  avgFrameMs() {
    if (!this.frameTimes.length) return 0;
    return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try { document.exitPointerLock(); } catch (_) {}
    window.removeEventListener('resize', this._onResize);
    if (window.visualViewport) visualViewport.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKey);
    document.removeEventListener('pointerlockchange', this._onLock);
    for (const [, e] of this._meshes) {
      try { e.feel?.dispose?.(); } catch (_) {}
      e.feel = null;
      try { disposeObject3D(e.root); this.scene.remove(e.root); } catch (_) {}
    }
    this._meshes.clear();
    try { this._hqFx?.dispose?.(); } catch (_) {}
    try { this.renderer.dispose(); } catch (_) {}
    try { if (this._audio) this._audio.close(); } catch (_) {}
    try { this.mount.innerHTML = ''; } catch (_) {}
  }
}

const CSS3D = `
.sc-ground-3d { --acc:#ffd23f; --bg:#070a1c; --ink:#f2f5ff; --dim:#9fb0d9; }
.sc-ground-hud { position:absolute; inset:0; pointer-events:none; z-index:2; overflow:hidden; }
.sc-topstack { position:absolute; top:8px; left:0; right:0; display:flex; flex-direction:column; gap:8px; pointer-events:none; z-index:4; }
.sc-tickets-row { display:flex; justify-content:space-between; align-items:flex-start; padding:0 10px 0 64px; gap:8px; box-sizing:border-box; }
.sc-tick-col { display:flex; flex-direction:row; flex-wrap:wrap; align-items:center; gap:6px; }
.sc-tick-col-L { max-width:58%; }
.sc-tickets { display:flex; align-items:center; gap:5px; background:rgba(7,10,28,.9);
  border:2px solid var(--acc); border-radius:999px; padding:6px 10px; min-height:40px; font-weight:800; }
.sc-tickets b { font-size:18px; }
.sc-tlab { font-size:10px; color:var(--dim); font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
.sc-ticon { display:flex; color:var(--acc); }
.sc-posts { align-self:center; display:flex; gap:5px; background:rgba(7,10,28,.9);
  border:1px solid #ffd23f55; border-radius:999px; padding:5px 10px; margin-top:2px; position:relative; z-index:2; }
.sc-post-chip { display:flex; align-items:center; gap:4px; min-width:28px; justify-content:center; font-weight:800; font-size:13px; }
.sc-post-chip i { width:10px; height:10px; border-radius:50%; display:inline-block; border:1px solid #fff8; }
.sc-post-chip em { font-style:normal; font-size:10px; color:var(--acc); }
.sc-bonus { align-self:flex-start; display:inline-flex; align-items:center; gap:5px; background:rgba(7,10,28,.9); border:1px solid #ffd23f66;
  border-radius:999px; padding:4px 10px; font-size:11px; font-weight:700; color:var(--acc); pointer-events:none; position:static; transform:none; top:auto; left:auto; }
.sc-bonus-ic { display:flex; }
.sc-hero { position:absolute; right:14px; top:42%; z-index:6; pointer-events:auto; border-color:#ffd23f; min-width:72px; }
.sc-hero.on { background:rgba(255,210,63,.25); }
.sc-hero:disabled { opacity:.45; }
/* In topstack flow on desktop — never overlaps posts */
.sc-mode-toggle { position:absolute; top:96px; right:10px; left:auto; transform:none; pointer-events:auto; z-index:20;
  min-width:48px; min-height:48px;
  min-width:140px; border-color:var(--acc); box-shadow:0 0 0 1px var(--acc); }
.sc-mode-toggle.lead { background:rgba(255,210,63,.12); }
.sc-hint { position:absolute; top:188px; left:50%; transform:translateX(-50%); background:rgba(7,10,28,.9); border:1px solid #ffd23f66;
  border-radius:14px; padding:8px 12px; max-width:min(400px,92vw); pointer-events:none; z-index:3; }
.sc-hint-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:center; font-size:12px; }
.sc-leadstat { position:absolute; left:14px; bottom:18px; z-index:6; pointer-events:none;
  display:flex; flex-direction:column; gap:4px; min-width:120px; padding:6px 10px; border-radius:12px;
  background:rgba(7,10,28,.88); border:1px solid #ffd23f55; }
.sc-leadhp { height:8px; width:100%; background:#111c; border-radius:4px; overflow:hidden; border:1px solid #0008; }
.sc-leadhp i { display:block; height:100%; background:#3dce6a; }
.sc-leadstat span { font-size:11px; font-weight:700; color:var(--ink); }
.sc-bottom { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:center; flex-wrap:wrap;
  padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px)); gap:6px; pointer-events:none; z-index:5; }
.sc-btn { pointer-events:auto; min-width:48px; min-height:48px; padding:8px 10px; border-radius:14px; border:2px solid #ffd23f66;
  background:rgba(7,10,28,.92); color:var(--ink); font-size:12px; font-weight:700; display:inline-flex; align-items:center; gap:5px;
  cursor:pointer; -webkit-tap-highlight-color:transparent; }
.sc-btn:active { transform:scale(.96); }
.sc-retreat { border-color:#e74c3c88; }
.sc-banner { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:auto;
  background:rgba(5,10,20,.55); z-index:8; }
.sc-banner[hidden], .sc-spawn[hidden], .sc-howto[hidden], .sc-sel[hidden], .sc-hint[hidden],
.sc-cross[hidden], .sc-joy[hidden], .sc-fire[hidden], .sc-enter[hidden], .sc-tip[hidden],
.sc-bonus[hidden], .sc-hero[hidden], .sc-leadstat[hidden] { display:none !important; }
.sc-ban-card { background:rgba(7,10,28,.95); border:2px solid var(--acc); border-radius:18px; padding:22px 28px; text-align:center; min-width:min(280px,80vw); }
.sc-ban-big { font-size:26px; font-weight:800; color:var(--acc); }
.sc-ban-pts { font-size:18px; margin:8px 0; }
.sc-ban-sub { font-size:12px; color:var(--dim); }
.sc-spawn { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(7,10,28,.72); z-index:40; pointer-events:auto; }
.sc-spawn-panel { background:rgba(7,10,28,.96); border:2px solid var(--acc); border-radius:20px; padding:14px 16px 16px; width:min(720px,94vw); max-height:min(760px,92vh); overflow:auto; box-sizing:border-box; display:flex; flex-direction:column; }
.sc-spawn-panel h2 { margin:0 0 2px; color:var(--acc); }
.sc-muted { color:var(--dim); font-size:12px; margin:0 0 8px; }
.sc-spawn-posts { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 10px; align-items:center; }
.sc-spawn-postchip { pointer-events:auto; min-width:48px; min-height:48px; padding:8px 12px; border-radius:12px; border:2px solid #ffd23f44;
  background:rgba(12,16,36,.95); color:#e8ecff; font-weight:800; display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
.sc-spawn-postchip i { width:10px; height:10px; border-radius:50%; background:#3dce6a; border:1px solid #fff8; display:inline-block; }
.sc-spawn-postchip.on { border-color:var(--acc); box-shadow:0 0 0 1px var(--acc); }
.sc-spawn-postchip.locked { opacity:.45; cursor:not-allowed; filter:grayscale(.3); }
.sc-spawn-body { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:stretch; }
.sc-deploy-open .sc-mode-toggle,
.sc-deploy-open [data-sc-bottom],
.sc-deploy-open [data-sc-posts] { visibility:hidden !important; pointer-events:none !important; }
.sc-spawn-side { display:flex; flex-direction:column; gap:10px; min-width:0; justify-content:flex-start; }
.sc-spawn-classes { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin:0; }
.sc-spawn-class, .sc-spawn-post { pointer-events:auto; min-height:48px; border-radius:14px; border:2px solid #ffd23f44;
  background:#0e1528; color:var(--ink); padding:8px 6px; display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; overflow:visible; }
.sc-spawn-class { min-height:156px; justify-content:flex-start; box-sizing:border-box; padding-bottom:10px; }
.sc-spawn-class.on, .sc-spawn-post.on { border-color:var(--acc); }
.sc-spawn-class small { color:var(--dim); font-size:10px; }
.sc-spawn-class b { font-size:13px; }
.sc-spawn-post { flex-direction:row; padding:10px 14px; }
.sc-post-dot { width:12px; height:12px; border-radius:50%; display:inline-block; }
.sc-spawn-actions { display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:flex-end; margin:0; padding-bottom:2px; }
.sc-spawn-go {
  background:#ffd23f !important; color:#1a1408 !important; border-color:#ffd23f !important;
  font-size:15px !important; font-weight:800 !important; padding:12px 22px !important; min-height:52px !important;
  box-shadow:0 2px 0 #c9a020;
}
.sc-spawn-go:disabled { opacity:.4; filter:grayscale(.2); }
.sc-spawn-cmd { background:transparent !important; border:2px solid #ffd23f88 !important; color:var(--ink) !important; }
.sc-statbars { width:100%; display:flex; flex-direction:column; gap:5px; margin-top:4px; }
.sc-statbar { display:flex; align-items:center; gap:7px; width:100%; }
.sc-stat-ico { color:var(--dim); flex:0 0 auto; width:20px !important; height:20px !important; min-width:20px; }
.sc-stat-track { flex:1; height:8px; background:#111c; border-radius:4px; overflow:hidden; border:1px solid #0006; }
.sc-stat-track i { display:block; height:100%; border-radius:3px; }
.sc-howto { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(7,10,28,.75); z-index:10; pointer-events:auto; }
.sc-howto-card { background:rgba(7,10,28,.96); border:2px solid var(--acc); border-radius:20px; padding:16px; width:min(560px,94vw); }
.sc-howto-card h2 { margin:0 0 12px; color:var(--acc); }
.sc-cards { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:12px; }
.sc-card { background:#0e1528; border:1px solid #ffd23f33; border-radius:14px; padding:12px; display:flex; flex-direction:column; gap:4px; min-height:96px; }
.sc-card-ic { color:var(--acc); }
.sc-card b { font-size:14px; }
.sc-card span { font-size:12px; color:var(--dim); }
.sc-cross { position:absolute; left:50%; top:46%; transform:translate(-50%,-50%); width:28px; height:28px;
  color:#ffd23f; text-shadow:0 0 4px #000; pointer-events:none; z-index:3; display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:300; }
.sc-cross i { position:absolute; width:18px; height:18px; border:2px solid #ff4d4d; border-radius:2px; transform:rotate(45deg); box-shadow:0 0 6px #ff4d4d; }
.sc-joy { position:absolute; left:12px; bottom:calc(88px + env(safe-area-inset-bottom,0px)); width:120px; height:120px; pointer-events:auto; z-index:6; }
.sc-joy-base { width:100%; height:100%; border-radius:50%; background:rgba(7,10,28,.5); border:2px solid #ffd23f66; position:relative; }
.sc-joy-knob { width:52px; height:52px; border-radius:50%; background:rgba(255,210,63,.9); position:absolute; left:50%; top:50%; margin:-26px 0 0 -26px; }
.sc-fire { position:absolute; right:14px; bottom:calc(96px + env(safe-area-inset-bottom,0px)); min-width:76px; min-height:76px; border-radius:50%;
  border:3px solid var(--acc); background:rgba(7,10,28,.88); color:var(--acc); pointer-events:auto; z-index:6;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; font-weight:800; font-size:12px; }
.sc-enter { position:absolute; right:14px; bottom:calc(182px + env(safe-area-inset-bottom,0px)); z-index:6; pointer-events:auto; min-width:72px; }
.sc-hpbars{position:absolute;inset:0;pointer-events:none;z-index:1}
.sc-hpbar3{position:absolute;width:36px;height:5px;margin-left:-18px;background:#111c;border:1px solid #0008;border-radius:2px;overflow:hidden}
.sc-hpbar3 i{display:block;height:100%;background:#3dce6a}
.sc-hpbar3.crawl i{background:#f0a020}
.sc-boxsel{position:absolute;border:1px solid #3ab4ff;background:rgba(58,180,255,.12);pointer-events:none;z-index:6}
.sc-holdwin{position:absolute;top:56px;left:50%;transform:translateX(-50%);z-index:8;pointer-events:none;
  background:rgba(7,10,28,.88);border:2px solid var(--acc);border-radius:12px;padding:8px 16px;text-align:center;min-width:180px}
.sc-holdwin.ours{border-color:#3dce6a}.sc-holdwin.theirs{border-color:#e74c3c}
.sc-holdwin b{display:block;color:var(--acc);font-size:16px}.sc-holdwin.ours b{color:#3dce6a}.sc-holdwin.theirs b{color:#e74c3c}
.sc-holdwin span{font-size:11px;color:var(--dim)}
.sc-spawn-mapwrap{margin:0;text-align:center;display:flex;flex-direction:column}
.sc-spawn-map{width:100%;max-width:100%;height:auto;border-radius:12px;border:2px solid #ffd23f66;cursor:pointer;touch-action:none;background:#c9b48a;display:block}
.sc-spawn-maplab{font-size:11px;color:var(--dim);margin-top:4px}
.sc-thumb{width:110px;height:110px;border-radius:12px;display:block;margin:0 auto 2px;background:#070a1c}
.sc-phone .sc-spawn-body{grid-template-columns:1fr;gap:10px}
/* Landscape phone Deploy: map left, classes + Deploy right */
.sc-phone.sc-land .sc-spawn-panel{width:min(960px,96vw);max-height:min(340px,88vh);padding:8px 10px;overflow:hidden}
.sc-phone.sc-land .sc-spawn-body{grid-template-columns:minmax(160px,0.85fr) minmax(200px,1.15fr);gap:8px;align-items:start;min-height:0}
.sc-phone.sc-land .sc-spawn-side{order:-1;min-height:0}
.sc-phone.sc-land .sc-spawn-classes{grid-template-columns:repeat(2,1fr);gap:4px;max-height:min(220px,58vh);overflow:auto}
.sc-phone.sc-land .sc-spawn-class{min-height:112px;padding:4px 4px 8px;box-sizing:border-box}
.sc-phone.sc-land .sc-spawn-map{width:100%;height:auto;max-height:min(120px,32vh)}
.sc-phone.sc-land .sc-spawn-posts{margin-bottom:4px}
.sc-phone.sc-land .sc-thumb{width:36px;height:36px}
.sc-phone.sc-land .sc-statbars{gap:2px;margin-top:1px}
.sc-phone.sc-land .sc-stat-track{height:5px}
.sc-phone.sc-land .sc-spawn-go{min-height:44px !important;padding:8px 14px !important}

.sc-phone .sc-spawn-side{gap:6px}
.sc-phone .sc-spawn-actions{justify-content:stretch; flex-shrink:0}
.sc-phone .sc-spawn-actions .sc-btn{flex:1}
.sc-phone .sc-stat-ico{width:14px !important;height:14px !important;min-width:14px}
.sc-phone .sc-thumb{width:44px;height:44px;border-radius:8px}
.sc-phone .sc-spawn-panel{width:min(380px,94vw);padding:10px 12px;max-height:min(760px,90vh);overflow:auto;display:flex;flex-direction:column}
.sc-phone .sc-spawn-body{flex:1 1 auto;min-height:0}
.sc-phone .sc-spawn-go{font-size:14px !important;padding:10px 16px !important;min-height:48px !important}
.sc-phone .sc-spawn-map{max-width:100%;max-height:min(140px,22vh);object-fit:contain}
.sc-phone .sc-spawn-classes{gap:6px;max-height:none;overflow:visible}
.sc-phone .sc-spawn-class{min-height:148px;padding:6px 5px 10px;gap:3px;box-sizing:border-box}
.sc-phone .sc-spawn-class b{font-size:12px}
.sc-phone .sc-statbars{gap:3px;margin-top:2px}
.sc-phone .sc-statbar{gap:5px}
.sc-phone .sc-stat-track{height:6px}
.sc-phone .sc-spawn-postchip{min-width:44px;min-height:44px;padding:6px 10px}
.sc-phone .sc-spawn-panel h2{font-size:20px}
.sc-phone .sc-muted{font-size:11px;margin:0 0 6px}
/* Phone: mode toggle SAME spot Command+Lead — above bottom bar */
.sc-phone .sc-tickets { min-height:36px; padding:4px 8px; }
.sc-phone .sc-tickets b { font-size:15px; }
.sc-phone .sc-tlab { font-size:9px; }
.sc-phone .sc-tickets-row { padding-left:10px; padding-right:10px; }
.sc-phone .sc-topstack { gap:8px; }
.sc-phone .sc-bonus { font-size:10px; padding:3px 8px; max-width:100%; }
.sc-phone .sc-mode-toggle { position:absolute; top:96px; right:8px; left:auto; bottom:auto; transform:none; margin:0; z-index:20; min-width:48px; min-height:48px; }
.sc-phone .sc-hint { top:64px; max-width:min(340px,88vw); }
.sc-phone .sc-bottom { gap:6px; padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px)); background:transparent !important; box-shadow:none; }
.sc-phone .sc-bottom .sc-btn { min-width:48px; min-height:48px; padding:10px 10px; font-size:11px; }
.sc-phone .sc-bottom .sc-btn > span { display:inline !important; }
.sc-phone.sc-lead .sc-mode-toggle { position:absolute; top:96px; right:8px; left:auto; bottom:auto; transform:none; margin:0; z-index:20; }
.sc-phone.sc-lead .sc-bottom { gap:6px; padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px)); background:transparent !important; box-shadow:none; }
.sc-phone.sc-lead .sc-bottom .sc-btn { min-width:48px; min-height:48px; padding:10px 10px; font-size:11px; }
.sc-phone.sc-lead .sc-bottom .sc-btn > span { display:inline !important; }
.sc-phone.sc-lead .sc-joy { bottom:calc(118px + env(safe-area-inset-bottom,0px)); left:8px; width:108px; height:108px; }
.sc-phone.sc-lead .sc-fire { bottom:calc(126px + env(safe-area-inset-bottom,0px)); right:10px; }
.sc-phone.sc-lead .sc-enter { bottom:calc(214px + env(safe-area-inset-bottom,0px)); right:10px; }
.sc-phone.sc-lead .sc-hero { top:auto; bottom:calc(214px + env(safe-area-inset-bottom,0px)); right:94px; }
.sc-phone.sc-lead .sc-leadstat { left:8px; bottom:calc(230px + env(safe-area-inset-bottom,0px)); min-width:100px; }
/* Landscape phone Lead: compact HUD — toggle under tickets, Fire BR, HP TL, joy BL */
.sc-phone.sc-land.sc-lead .sc-mode-toggle {
  top:52px !important; right:8px; left:auto; bottom:auto; z-index:22;
  min-width:110px; min-height:44px; padding:6px 10px; font-size:12px;
}
.sc-phone.sc-land.sc-lead .sc-fire {
  top:auto; bottom:calc(56px + env(safe-area-inset-bottom,0px)); right:10px;
  min-width:64px; min-height:64px; z-index:12;
}
.sc-phone.sc-land.sc-lead .sc-enter {
  top:auto; bottom:calc(128px + env(safe-area-inset-bottom,0px)); right:10px;
}
.sc-phone.sc-land.sc-lead .sc-hero {
  top:auto; bottom:calc(128px + env(safe-area-inset-bottom,0px)); right:84px;
}
.sc-phone.sc-land.sc-lead .sc-joy {
  top:auto; bottom:calc(52px + env(safe-area-inset-bottom,0px)); left:8px;
  width:88px; height:88px; z-index:12;
}
.sc-phone.sc-land.sc-lead .sc-joy-knob { width:40px; height:40px; margin:-20px 0 0 -20px; }
.sc-phone.sc-land.sc-lead .sc-leadstat {
  left:8px; top:52px; bottom:auto; min-width:96px; padding:4px 8px; z-index:12;
}
.sc-phone.sc-land.sc-lead .sc-bottom {
  padding:4px 8px calc(4px + env(safe-area-inset-bottom,0px)); gap:4px;
}
.sc-phone.sc-land.sc-lead .sc-bottom .sc-btn { min-height:40px; min-width:44px; padding:6px 8px; font-size:10px; }
.sc-phone.sc-land .sc-topstack { gap:4px; }
.sc-phone.sc-land .sc-tickets { min-height:30px; padding:2px 6px; }
.sc-phone.sc-land .sc-tickets b { font-size:13px; }
.sc-phone.sc-land .sc-posts { transform:scale(0.92); transform-origin:center top; }
@media (max-width:500px) { .sc-cards { grid-template-columns:1fr; } }
`;
