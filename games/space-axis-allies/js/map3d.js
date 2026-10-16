/* Three.js map: Voronoi-painted zone regions on spheres; transparent labels.
   Planets do NOT rotate or orbit. Ships pin above zone centers. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SYSTEMS, ZONES, FACTIONS, UNITS, GLOBE_R } from './data.js';

function uvToSphere(u, v, radius) {
  const theta = u * Math.PI * 2;
  const phi = v * Math.PI;
  const x = -radius * Math.sin(phi) * Math.cos(theta); // matches THREE.SphereGeometry UVs
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

/** Equirectangular UV → unit direction */
function uvToDir(u, v) {
  return uvToSphere(u, v, 1).normalize();
}

/** World hit point on a system sphere → UV [0,1] */
function worldToUV(localPoint) {
  const n = localPoint.clone().normalize();
  const v = Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)) / Math.PI;
  let u = Math.atan2(n.z, -n.x) / (Math.PI * 2);
  if (u < 0) u += 1;
  return [u, v];
}

function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return [
    Math.round(c.r * 255),
    Math.round(c.g * 255),
    Math.round(c.b * 255),
  ];
}

function darken(rgb, f = 0.35) {
  return [
    Math.round(rgb[0] * f),
    Math.round(rgb[1] * f),
    Math.round(rgb[2] * f),
  ];
}

function lighten(rgb, f = 0.25) {
  return [
    Math.min(255, Math.round(rgb[0] + (255 - rgb[0]) * f)),
    Math.min(255, Math.round(rgb[1] + (255 - rgb[1]) * f)),
    Math.min(255, Math.round(rgb[2] + (255 - rgb[2]) * f)),
  ];
}

export class Map3D {
  constructor(container, game) {
    this.container = container;
    this.game = game;
    this.zoneMarkers = {}; // zoneId -> group (IPC/VC/hover label anchor)
    this.systemMeshes = {};
    this.systemSpheres = {}; // systemId -> Mesh (for raycast + texture)
    this.systemTextures = {}; // systemId -> { canvas, ctx, tex, zones, seeds }
    this.shipPins = {};
    this.zoneLabelSprites = {};
    this.ipcBadges = {};
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selected = null;
    this.onSelect = null;
    this._hoverZone = null;
    this._lastOwnerKey = '';

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04060f);
    this.scene.fog = new THREE.FogExp2(0x060814, 0.0015);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
    // Home view fits the ring layout (Pacific in front, Atlantic/Europe behind)
    {
      // Globe: frame the whole inflated Earth from the Pacific side (lon 180, ~22N)
      const vis = this._visibleBand(w);
      const vf = THREE.MathUtils.degToRad(50) / 2, hf = Math.atan(Math.tan(vf) * (vis.w / h));
      const rad = GLOBE_R + 3.8;
      const dist = rad / Math.sin(Math.min(vf, hf)) * 0.9;
      const dir = new THREE.Vector3(0, Math.sin(0.38), Math.cos(0.38));
      this.homeView = { pos: dir.multiplyScalar(dist).toArray(), target: [0, 0, 0] };
    }
    this.camera.position.set(...this.homeView.pos);
    this._applyViewOffset(w, h);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 170;
    this.controls.target.set(...this.homeView.target);
    this.controls.update();

    this.scene.add(new THREE.AmbientLight(0x7a92b8, 0.45));
    // Soft camera headlight so the viewed face of any body is always readable
    const head = new THREE.PointLight(0xfff4e6, 0.9, 0, 0);
    this.camera.add(head);
    this.scene.add(this.camera);
    const hemi = new THREE.HemisphereLight(0xb8d0ff, 0x1a1520, 0.35);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.15);
    sun.position.set(35, 45, 22);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x5577cc, 0.35);
    fill.position.set(-25, -8, -28);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.25);
    rim.position.set(-10, 20, -40);
    this.scene.add(rim);

    this._stars();
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this._buildSystems();

    this.renderer.domElement.addEventListener('pointerdown', (e) => this._onPointer(e));
    this.renderer.domElement.addEventListener('pointermove', (e) => this._onHover(e));
    window.addEventListener('resize', () => this._resize());

    this._running = true;
    const loop = () => {
      if (!this._running) return;
      requestAnimationFrame(loop);
      this.controls.update();
      this._updateZoneLabelVisibility();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  _stars() {
    // Layered starfield + soft nebula sprites
    const addLayer = (n, size, color, spread) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const c = new THREE.Color(color);
      for (let i = 0; i < n; i++) {
        const r = spread * (0.55 + Math.random() * 0.45);
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
        pos[i * 3 + 2] = r * Math.cos(ph);
        const b = 0.55 + Math.random() * 0.45;
        col[i * 3] = c.r * b;
        col[i * 3 + 1] = c.g * b;
        col[i * 3 + 2] = c.b * b;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
        size, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false,
      })));
    };
    addLayer(2800, 0.12, 0xffffff, 180);
    addLayer(900, 0.28, 0xc8d8ff, 170);
    addLayer(200, 0.55, 0xffe8c8, 160);

    // Soft nebula billboards
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      const hues = ['rgba(60,80,160,0.35)', 'rgba(100,50,120,0.28)', 'rgba(40,100,140,0.3)'];
      g.addColorStop(0, hues[i % 3]);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.55, blending: THREE.AdditiveBlending,
      }));
      const ang = (i / 6) * Math.PI * 2;
      spr.position.set(Math.cos(ang) * 70, (i % 3 - 1) * 25, Math.sin(ang) * 70);
      spr.scale.set(48, 48, 1);
      this.scene.add(spr);
    }
  }

  // Horizontal band of the canvas not covered by the side panels
  _visibleBand(w) {
    const cr = this.container.getBoundingClientRect();
    const l = document.getElementById('left')?.getBoundingClientRect();
    const r = document.getElementById('right')?.getBoundingClientRect();
    const L = l && l.width ? Math.max(0, l.right - cr.left) : 0;
    const R = r && r.width ? Math.max(0, cr.right - r.left) : 0;
    return { w: Math.max(200, w - L - R), shift: (L - R) / 2 };
  }

  _applyViewOffset(w, h) {
    const { shift } = this._visibleBand(w);
    if (shift) this.camera.setViewOffset(w, h, -shift, 0, w, h); else this.camera.clearViewOffset();
  }

  _resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this._applyViewOffset(w, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ——— Transparent outlined text sprite (no black box) ———
  _makeTextSprite(text, opts = {}) {
    const fontSize = opts.fontSize || 28;
    const font = `bold ${fontSize}px "Segoe UI", system-ui, sans-serif`;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const pad = opts.pad ?? 10;
    const tw = Math.ceil(metrics.width) + pad * 2;
    const th = fontSize + pad * 2;
    canvas.width = Math.max(4, tw);
    canvas.height = Math.max(4, th);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    // Dark outline / shadow for readability (no filled rect)
    ctx.lineWidth = opts.outline || 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = opts.fill || '#f0f4ff';
    ctx.fillText(text, cx, cy);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const spr = new THREE.Sprite(mat);
    const worldH = opts.worldHeight || 0.55;
    const aspect = canvas.width / canvas.height;
    spr.scale.set(worldH * aspect, worldH, 1);
    if (opts.y != null) spr.position.y = opts.y;
    spr.userData.canvas = canvas;
    return spr;
  }

  _buildSystems() {
    this.ipcBadges = {};
    this.zoneLabelSprites = {};
    this.zoneMarkers = {};
    for (const sys of Object.values(SYSTEMS)) {
      const group = new THREE.Group();
      group.position.set(sys.pos[0], sys.pos[1], sys.pos[2]);
      group.userData = { systemId: sys.id, kind: sys.kind };

      const zones = Object.values(ZONES).filter(z => z.system === sys.id);
      const built = this._buildVoronoiTexture(sys, zones);

      const segs = sys.kind === 'planet' ? 96 : 56;
      const geo = new THREE.SphereGeometry(sys.radius, segs, Math.max(32, (segs / 2) | 0));
      const mat = new THREE.MeshStandardMaterial({
        map: built.tex,
        roughnessMap: built.roughTex,
        metalnessMap: built.metalTex,
        roughness: 1,
        metalness: 1,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.26,
        emissiveMap: built.tex,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.userData = { systemId: sys.id, pick: 'system' };
      group.add(sphere);
      this.systemSpheres[sys.id] = sphere;
      this.systemTextures[sys.id] = { ...built, zones, sys };
      if (sys.kind !== 'planet') {
        // Far-view owner halo: thin camera-facing ring, fades in only when zoomed out
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(sys.radius * 1.18, sys.radius * 1.42, 64),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
        );
        halo.userData.isHalo = true;
        group.add(halo);
        (this.islandHalos ||= {})[sys.id] = halo;
      }

      // Atmosphere rim glow
      group.add(this._makeAtmosphere(sys.radius, sys.kind));

      const nameSpr = this._makeTextSprite(sys.name, {
        fontSize: sys.kind === 'planet' ? 32 : 24,
        worldHeight: sys.kind === 'planet' ? 0.7 : 0.45,
        y: sys.radius + (sys.kind === 'planet' ? 0.85 : 0.45),
        outline: 6,
      });
      group.add(nameSpr);

      for (const z of zones) {
        const marker = this._zoneCenterMarker(z, sys.radius);
        group.add(marker);
        this.zoneMarkers[z.id] = marker;
      }

      this.root.add(group);
      this.systemMeshes[sys.id] = group;
    }
    // Snapshot owners so refreshUnits won't rebuild every texture on first call
    this._lastOwnerSnap = {};
    for (const z of Object.values(this.game.zones)) {
      if (z.terrain !== 'sea') this._lastOwnerSnap[z.id] = z.owner;
    }
    this._texInitialized = true;
  }

  _makeAtmosphere(radius, kind) {
    const scale = kind === 'planet' ? 1.06 : kind === 'moon' ? 1.08 : 1.1;
    const col = kind === 'planet' ? new THREE.Color(0x6aa8ff) : new THREE.Color(0x88bbff);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        glowColor: { value: col },
        coef: { value: kind === 'planet' ? 1.15 : 1.35 },
        power: { value: kind === 'planet' ? 2.8 : 3.2 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 wp = modelViewMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform float coef;
        uniform float power;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 viewDir = normalize(-vWorldPos);
          float fresnel = pow(coef - abs(dot(viewDir, normalize(vNormal))), power);
          fresnel = clamp(fresnel, 0.0, 1.0);
          gl_FragColor = vec4(glowColor, fresnel * 0.55);
        }
      `,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(radius * scale, 48, 32), mat);
  }

  /**
   * High-res equirect Voronoi with soft anti-aliased borders (distance-to-edge blend),
   * land noise + sea sheen encoded into roughness/metalness maps.
   */
  _buildVoronoiTexture(sys, zones) {
    const W = sys.kind === 'planet' ? 1536 : sys.kind === 'moon' ? 1024 : 768;
    const H = W / 2;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(W, H);
    const data = img.data;

    const roughC = document.createElement('canvas');
    roughC.width = W; roughC.height = H;
    const roughCtx = roughC.getContext('2d');
    const roughImg = roughCtx.createImageData(W, H);
    const rdata = roughImg.data;

    const metalC = document.createElement('canvas');
    metalC.width = W; metalC.height = H;
    const metalCtx = metalC.getContext('2d');
    const metalImg = metalCtx.createImageData(W, H);
    const mdata = metalImg.data;

    const SEA_BLUE = [30, 92, 150];
    const SEA_DEEP = [14, 46, 92];
    const SEA_SHALLOW = [58, 140, 186];
    const noise2 = (x, y) => {
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return n - Math.floor(n);
    };

    const seeds = zones.map(z => {
      const hash = [...z.id].reduce((a, c) => a + c.charCodeAt(0), 0);
      const isSea = z.terrain === 'sea' || this.game.zones[z.id]?.terrain === 'sea';
      let shaded, baseRgb;
      if (isSea) {
        const wobble = ((hash % 5) - 2) * 6;
        baseRgb = SEA_BLUE;
        shaded = [
          Math.max(0, Math.min(255, SEA_BLUE[0] + wobble)),
          Math.max(0, Math.min(255, SEA_BLUE[1] + wobble)),
          Math.max(0, Math.min(255, SEA_BLUE[2] + wobble * 0.4)),
        ];
      } else {
        const owner = this.game.zones[z.id]?.owner || z.owner;
        const rgb = hexToRgb(FACTIONS[owner].color);
        const shade = ((hash % 9) - 4) * 7;
        // Readable land albedo: enforce HSL lightness floor so dark factions (Crimson) read clearly
        const cc = new THREE.Color(FACTIONS[owner].color); const hh = {}; cc.getHSL(hh);
        cc.setHSL(hh.h, Math.min(0.66, hh.s), Math.max(0.32, hh.l + 0.03));
        const lit = [Math.round(cc.r * 255), Math.round(cc.g * 255), Math.round(cc.b * 255)];
        shaded = [
          Math.max(0, Math.min(255, lit[0] + shade)),
          Math.max(0, Math.min(255, lit[1] + shade * 0.65)),
          Math.max(0, Math.min(255, lit[2] + shade * 0.45)),
        ];
        baseRgb = rgb;
      }
      // Island bodies: shrink sea to a band so land covers ~65-70%
      const island = sys.kind !== 'planet';
      const bias = island && isSea ? (this.islandSeaBias ?? 0.62) : 0;
      return {
        id: z.id, u: z.uv[0], v: z.uv[1],
        dir: uvToDir(z.uv[0], z.uv[1]),
        rgb: shaded, baseRgb, isSea: !!isSea, bias, island: island && !!isSea,
        warpKey: sys.id,
      };
    });

    // Island seas: land is an organic blob around the land seed(s), sea surrounds it.
    const landSeeds = seeds.filter(s => !s.isSea);
    for (const sea of seeds.filter(s => s.island)) {
      // Elongated, archipelago-like landmass: a short chain of control points along a tilted arc
      sea.landDirs = [];
      for (const ls of landSeeds) {
        const h = [...sys.id].reduce((a, c) => a + c.charCodeAt(0), 0);
        const tilt = ((h % 5) / 5 * 0.5 - 0.25) * Math.PI; // within ±45° of horizontal
        const tA = new THREE.Vector3(0, 1, 0).cross(ls.dir).normalize();
        const tB = ls.dir.clone().cross(tA).normalize();
        const along = tA.multiplyScalar(Math.cos(tilt)).add(tB.multiplyScalar(Math.sin(tilt))).normalize();
        const axis = ls.dir.clone().cross(along).normalize();
        for (const a of [-0.8, 0, 0.72]) sea.landDirs.push(ls.dir.clone().applyAxisAngle(axis, a));
      }
      const pts = [];
      for (let i = 0; i < 900; i++) {
        const z = 2 * ((i + 0.5) / 900) - 1, th = i * 2.39996, r = Math.sqrt(1 - z * z);
        pts.push(new THREE.Vector3(Math.cos(th) * r, z, Math.sin(th) * r));
      }
      const landFrac = () => {
        let land = 0;
        for (const d of pts) {
          let best = null, bd = Infinity;
          for (const s of seeds) { const dd = this._seedDist(d, s); if (dd < bd) { bd = dd; best = s; } }
          if (!best.isSea) land++;
        }
        return land / pts.length;
      };
      let lo = -1.5, hi = 4;
      for (let it = 0; it < 22; it++) {
        sea.bias = (lo + hi) / 2;
        if (landFrac() < (this.islandLandFrac ?? 0.058)) lo = sea.bias; else hi = sea.bias;
      }
      // Fleet anchor: in open water just off the coast, toward the viewer-facing upper side of the land
      const ld = landSeeds[0]?.dir || new THREE.Vector3(0, 0, 1);
      const want = ld.clone().add(new THREE.Vector3(0, 1.1, 0)).normalize();
      let bestPt = null, bestScore = -Infinity;
      for (const d of pts) {
        let landD = Infinity;
        for (const s of landSeeds) landD = Math.min(landD, this._seedDist(d, s));
        const m = landD - this._seedDist(d, sea);
        if (m < 0.12) continue;
        const sc = d.dot(want);
        if (sc > bestScore) { bestScore = sc; bestPt = d; }
      }
      if (bestPt) {
        const uv = worldToUV(bestPt);
        sea.u = uv[0]; sea.v = uv[1];
        if (ZONES[sea.id]) ZONES[sea.id].uv = [uv[0], uv[1]];
      }
    }

    const pxAng = (Math.PI * 2) / W;
    const edgeW = pxAng * 1.1;      // land-land border half-width in gap units (~1-2 px)
    const coastW = pxAng * 1.6;
    const smoothstep = (e0, e1, x) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const dists = new Float64Array(seeds.length);
    const tKey = 'terrain-' + sys.id, dKey = 'detail-' + sys.id;

    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W;
        const dir = uvToDir(u, v);
        let best = 0, bestD = Infinity, second = Infinity, secondIdx = -1, landD = Infinity;
        for (let s = 0; s < seeds.length; s++) {
          const d = this._seedDist(dir, seeds[s]);
          dists[s] = d;
          if (!seeds[s].isSea && d < landD) landD = d;
          if (d < bestD) { second = bestD; secondIdx = best; bestD = d; best = s; }
          else if (d < second) { second = d; secondIdx = s; }
        }
        const seed = seeds[best] || { rgb: [40, 55, 70], baseRgb: [40, 55, 70], isSea: false };
        let col;
        let rough;
        if (seed.isSea) {
          // Depth gradient: shallow/lighter near coasts, deep offshore; smooth, no sparkle
          const margin = landD - bestD;
          const shallow = Number.isFinite(margin) ? Math.exp(-margin / 0.09) : 0;
          const sw = 0.5 + 0.5 * this._sphereNoise(dir, tKey, 0.8);
          col = mix(SEA_DEEP, SEA_BLUE, 0.55 + sw * 0.35);
          col = mix(col, SEA_SHALLOW, shallow * 0.75);
          rough = 0.6;
        } else {
          // Soft terrain: smooth multi-scale shading (highlands/lowlands), subtle grain
          const t1 = this._sphereNoise(dir, tKey, 1.6);
          const t2 = this._sphereNoise(dir, dKey, 4.2);
          const k = 1 + t1 * 0.09 + t2 * 0.05;
          col = [seed.rgb[0] * k, seed.rgb[1] * k, seed.rgb[2] * k];
          // gentle warm/cool tint drift
          col = mix(col, [col[0] * 0.92, col[1] * 1.0, col[2] * 1.06], 0.5 + t1 * 0.5);
          rough = 0.82 + t2 * 0.08;
        }

        // Borders (anti-aliased, 1-2 px)
        if (secondIdx >= 0) {
          const gap = second - bestD;
          const other = seeds[secondIdx];
          if (seed.isSea !== other.isSea) {
            // coastline: thin pale shore line
            const e1 = 1 - smoothstep(0, coastW, gap);
            if (e1 > 0.001) col = mix(col, seed.isSea ? [150, 200, 220] : [235, 225, 200], e1 * 0.75);
          } else if (!seed.isSea) {
            // land-land: thin crisp lighter outline
            const e1 = 1 - smoothstep(0, edgeW, gap);
            if (e1 > 0.001) col = mix(col, lighten(seed.baseRgb, 0.65), e1 * 0.9);
          } else {
            const e1 = 1 - smoothstep(0, edgeW, gap);
            if (e1 > 0.001) col = mix(col, [90, 150, 200], e1 * 0.45);
          }
        }

        const i = (y * W + x) * 4;
        data[i] = Math.max(0, Math.min(255, Math.round(col[0])));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(col[1])));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(col[2])));
        data[i + 3] = 255;
        const rv = Math.round(Math.max(0, Math.min(1, rough)) * 255);
        rdata[i] = rdata[i + 1] = rdata[i + 2] = rv; rdata[i + 3] = 255;
        mdata[i] = mdata[i + 1] = mdata[i + 2] = 0; mdata[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    roughCtx.putImageData(roughImg, 0, 0);
    metalCtx.putImageData(metalImg, 0, 0);

    const mkTex = (c) => {
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
      tex.needsUpdate = true;
      return tex;
    };
    // roughness/metalness maps should be NoColorSpace in newer three — keep default Linear
    const roughTex = new THREE.CanvasTexture(roughC);
    roughTex.needsUpdate = true;
    const metalTex = new THREE.CanvasTexture(metalC);
    metalTex.needsUpdate = true;
    const tex = mkTex(canvas);
    return { tex, canvas, ctx, seeds, roughTex, metalTex, roughC, metalC };
  }

  /** Rebuild textures when ownership changes (conquest). */
  refreshZoneTextures() {
    if (!this._lastOwnerSnap) this._lastOwnerSnap = {};
    const dirtySystems = new Set();
    for (const z of Object.values(this.game.zones)) {
      if (z.terrain === 'sea') continue;
      const prev = this._lastOwnerSnap[z.id];
      if (prev !== z.owner) {
        dirtySystems.add(z.system);
        this._lastOwnerSnap[z.id] = z.owner;
      }
    }
    if (!dirtySystems.size && this._texInitialized) return;
    this._texInitialized = true;

    for (const [sysId, info] of Object.entries(this.systemTextures)) {
      if (this._texInitialized && dirtySystems.size && !dirtySystems.has(sysId)) continue;
      const { zones, sys } = info;
      const rebuilt = this._buildVoronoiTexture(sys, zones);
      // Swap image data onto existing texture to avoid material flicker
      info.ctx = rebuilt.ctx;
      info.canvas = rebuilt.canvas;
      info.seeds = rebuilt.seeds;
      const sphere = this.systemSpheres[sysId];
      if (sphere && sphere.material) {
        if (sphere.material.map) sphere.material.map.dispose();
        if (sphere.material.roughnessMap) sphere.material.roughnessMap.dispose();
        if (sphere.material.metalnessMap) sphere.material.metalnessMap.dispose();
        sphere.material.map = rebuilt.tex;
        sphere.material.emissiveMap = rebuilt.tex;
        sphere.material.roughnessMap = rebuilt.roughTex;
        sphere.material.metalnessMap = rebuilt.metalTex;
        sphere.material.needsUpdate = true;
        info.tex = rebuilt.tex;
        info.roughTex = rebuilt.roughTex;
        info.metalTex = rebuilt.metalTex;
      }
      // Update IPC marker colors
      for (const z of zones) {
        if (z.terrain === 'sea') continue;
        const m = this.zoneMarkers[z.id];
        if (!m) continue;
        const owner = this.game.zones[z.id]?.owner;
        if (!owner) continue;
        const col = new THREE.Color(FACTIONS[owner].color);
        m.traverse(o => {
          if (o.isMesh && o.userData?.ipcDisc && o.material) {
            o.material.color.copy(col);
            o.material.emissive.copy(col);
          }
        });
      }
    }
  }

  _zoneCenterMarker(zone, radius) {
    const g = new THREE.Group();
    const pos = uvToSphere(zone.uv[0], zone.uv[1], radius * 1.01);
    g.position.copy(pos);
    const outward = pos.clone().normalize();
    const isSea = zone.terrain === 'sea';
    g.userData = {
      zoneId: zone.id, pick: 'zoneMarker', isSea,
      outward: outward.clone(), systemId: zone.system,
    };

    // Tiny surface dot only (no IPC number by default — that was the clutter)
    if (isSea) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(0.04, radius * 0.022), 0.008, 5, 16),
        new THREE.MeshStandardMaterial({
          color: 0x4aa0e0, emissive: 0x1a4060, emissiveIntensity: 0.35,
          roughness: 0.4, metalness: 0.3,
        })
      );
      ring.lookAt(pos.clone().add(outward));
      ring.position.copy(outward.clone().multiplyScalar(radius * 0.02));
      g.add(ring);
    } else {
      const owner = this.game.zones[zone.id].owner;
      const col = new THREE.Color(FACTIONS[owner].color);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(Math.max(0.05, radius * 0.028), 12),
        new THREE.MeshStandardMaterial({
          color: col, emissive: col, emissiveIntensity: 0.3,
          roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide,
        })
      );
      disc.userData.ipcDisc = true;
      disc.lookAt(pos.clone().add(outward));
      disc.position.copy(outward.clone().multiplyScalar(radius * 0.018));
      g.add(disc);

      const ipcSpr = this._makeTextSprite(String(zone.ipc ?? 0), {
        fontSize: 18,
        worldHeight: 0.26,
        outline: 4,
        fill: '#d8e8ff',
      });
      ipcSpr.position.copy(outward.clone().multiplyScalar(radius * 0.08));
      ipcSpr.visible = false;
      ipcSpr.userData.ipcBadge = true;
      ipcSpr.userData.baseH = 0.26;
      g.add(ipcSpr);
      if (!this.ipcBadges) this.ipcBadges = {};
      this.ipcBadges[zone.id] = ipcSpr;

      if (zone.vc) {
        const gem = new THREE.Mesh(
          new THREE.OctahedronGeometry(Math.max(0.055, radius * 0.028)),
          new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 0.5 })
        );
        gem.position.copy(outward.clone().multiplyScalar(radius * 0.1));
        gem.userData.vcGem = true;
        g.add(gem);
      }
    }

    const shortName = zone.name.length > 20 ? zone.name.slice(0, 18) + '…' : zone.name;
    const nameSpr = this._makeTextSprite(shortName, {
      fontSize: isSea ? 16 : 18,
      worldHeight: 0.32,
      outline: 4,
      fill: isSea ? '#b8dcff' : '#e8eef8',
    });
    nameSpr.position.copy(outward.clone().multiplyScalar(radius * 0.22 + 0.15));
    nameSpr.visible = false;
    nameSpr.userData.zoneLabel = true;
    nameSpr.userData.baseH = 0.32;
    g.add(nameSpr);
    this.zoneLabelSprites[zone.id] = nameSpr;

    return g;
  }

  /** Distance-aware sprite scale: readable far away, does not balloon up close. */
  _spriteScaleForDist(baseH, dist, aspect) {
    // With sizeAttenuation, screen size ∝ worldScale/dist.
    // Shrink world scale when close so badges don't balloon; grow slightly when far.
    const ref = 16;
    const f = Math.min(1.15, Math.max(0.35, Math.max(dist, 3) / ref));
    const h = baseH * f;
    return [h * aspect, h];
  }

  /** True if a body other than skipSys blocks the line of sight camera→point. */
  // True when the ray camera→point passes through the core of the globe (point is on the far side)
  _occluded(point, skipSys) {
    const cam = this.camera.position;
    const dir = point.clone().sub(cam);
    const len = dir.length(); dir.divideScalar(len);
    for (const [id, sg] of Object.entries(this.systemMeshes)) {
      if (id === skipSys) continue;
      const r = SYSTEMS[id].radius * 1.02;
      const oc = sg.position.clone().sub(cam);
      const tca = oc.dot(dir);
      if (tca < 0 || tca > len) continue;
      const d2 = oc.lengthSq() - tca * tca;
      if (d2 < r * r && tca - Math.sqrt(r * r - d2) < len - 0.05) return true;
    }
    return false;
  }

  _updateZoneLabelVisibility() {
    const cam = this.camera.position;
    if (this.islandHalos) {
      for (const [sid, halo] of Object.entries(this.islandHalos)) {
        const g = this.systemMeshes[sid];
        const land = Object.values(ZONES).find(z => z.system === sid && z.terrain !== 'sea');
        const owner = land ? (this.game.zones[land.id]?.owner || land.owner) : null;
        if (owner) halo.material.color.set(FACTIONS[owner].color);
        const d = cam.distanceTo(g.position);
        const k = THREE.MathUtils.clamp((d - 9) / 10, 0, 1);
        halo.material.opacity = 0.85 * k;
        halo.visible = k > 0.01 && !!owner;
        halo.lookAt(cam);
      }
    }
    const selected = this.selected?.id;
    const hover = this._hoverZone;

    // Zone name: ONLY hover or selected (no crowd of names)
    for (const [zid, spr] of Object.entries(this.zoneLabelSprites)) {
      const z = ZONES[zid];
      if (!z) continue;
      const sys = SYSTEMS[z.system];
      const sg = this.systemMeshes[z.system];
      if (!sg) continue;
      const local = uvToSphere(z.uv[0], z.uv[1], sys.radius);
      const world = sg.position.clone().add(local);
      const outward = local.clone().normalize();
      const toCam = cam.clone().sub(world).normalize();
      const facing = outward.dot(toCam) > 0.05;
      const dist = cam.distanceTo(world);
      const show = (zid === hover || zid === selected) && facing && !this._occluded(world, z.system);
      spr.visible = show;
      if (show && spr.material?.map?.image) {
        const img = spr.material.map.image;
        const a = img.width / img.height;
        const [sx, sy] = this._spriteScaleForDist(spr.userData.baseH || 0.32, dist, a);
        spr.scale.set(sx, sy, 1);
      }
    }

    // IPC badges: land only, hover/selected
    if (this.ipcBadges) {
      for (const [zid, spr] of Object.entries(this.ipcBadges)) {
        const z = ZONES[zid];
        if (!z || z.terrain === 'sea') { spr.visible = false; continue; }
        const sys = SYSTEMS[z.system];
        const sg = this.systemMeshes[z.system];
        if (!sg) continue;
        const local = uvToSphere(z.uv[0], z.uv[1], sys.radius);
        const world = sg.position.clone().add(local);
        const outward = local.clone().normalize();
        const facing = outward.dot(cam.clone().sub(world).normalize()) > 0.05;
        const dist = cam.distanceTo(world);
        const show = (zid === hover || zid === selected) && facing;
        spr.visible = show;
        if (show && spr.material?.map?.image) {
          const img = spr.material.map.image;
          const a = img.width / img.height;
          const [sx, sy] = this._spriteScaleForDist(0.24, dist, a);
          spr.scale.set(sx, sy, 1);
        }
      }
    }

    // Hide back-facing zone center markers (discs/rings/gems)
    for (const [zid, g] of Object.entries(this.zoneMarkers)) {
      const z = ZONES[zid];
      if (!z) continue;
      const sys = SYSTEMS[z.system];
      const sg = this.systemMeshes[z.system];
      if (!sg) continue;
      const local = uvToSphere(z.uv[0], z.uv[1], sys.radius);
      const world = sg.position.clone().add(local);
      const outward = local.clone().normalize();
      const facing = outward.dot(cam.clone().sub(world).normalize()) > -0.05;
      // Keep group active for labels parenting, but hide mesh children when back-facing
      g.traverse(o => {
        if (o === g) return;
        if (o.userData?.zoneLabel || o.userData?.ipcBadge) return; // handled above
        if (o.isMesh) o.visible = facing;
      });
    }

    // Far side of the ghost globe: hide bodies and deep nodes entirely (keep the focused body)
    {
      const fz = this._activeFocus();
      if (this._camDirU) this._camDirU.value.copy(this._camDir());
      // camera-facing rings (free fleets, movement sphere rim)
      const q = this.camera.quaternion;
      for (const p of Object.values(this.shipPins)) for (const c of p.children) if (c.userData.faceCam) c.quaternion.copy(q);
      if (this.moveSphere) for (const c of this.moveSphere.group.children) if (c.userData.faceCam) c.quaternion.copy(q);
      if (this._targetGroup) for (const c of this._targetGroup.children) {
        if (c.userData.faceCam) c.quaternion.copy(q);
        // keep rings/numbers roughly constant on screen (small in close-ups)
        if (!c.userData.base) c.userData.base = c.scale.clone();
        const k = THREE.MathUtils.clamp(this.camera.position.distanceTo(c.position) / 45, 0.22, 1.3);
        c.scale.copy(c.userData.base).multiplyScalar(k);
      }
      // Bodies are ALWAYS visible (no far-side hiding)
      for (const sg of Object.values(this.systemMeshes)) sg.visible = true;
    }

    // Unit stack pins: hide back-facing on planets; scale badges by distance
    const focus = this._activeFocus();
    for (const pin of Object.values(this.shipPins)) {
      const loc = pin.userData.locId;
      const dist = cam.distanceTo(pin.position);
      if (ZONES[loc]) {
        const z = ZONES[loc];
        const sys = SYSTEMS[z.system];
        const sg = this.systemMeshes[z.system];
        const local = uvToSphere(z.uv[0], z.uv[1], sys.radius);
        const outward = local.clone().normalize();
        const world = sg.position.clone().add(local);
        const facing = outward.dot(cam.clone().sub(world).normalize()) > (sys.kind === 'planet' ? 0.3 : -0.02);
        pin.visible = facing && !this._occluded(pin.position, z.system) && (!focus || focus === z.system);
      } else {
        pin.visible = true; // open-space fleet markers are always visible
      }
      // Scale count badge / icon slightly with distance
      pin.traverse(o => {
        if (o.isSprite && o.userData?.isCountBadge) {
          const img = o.material?.map?.image;
          if (!img) return;
          const a = img.width / img.height;
          const base = o.userData.baseH || 0.36;
          const [sx, sy] = this._spriteScaleForDist(base, dist, a);
          o.scale.set(sx, sy, 1);
        }
      });
      // Scale mesh icon group via uniform-ish trick: adjust children mesh scales
      // Keep mesh icons roughly constant on screen
      const f = Math.min(1.1, Math.max(0.45, Math.max(dist, 4) / 14));
      pin.userData.scaleF = f;
      for (const child of pin.children) {
        if (child.isMesh && child.userData?.pick !== 'units') {
          // hit spheres excluded via visible:false; scale visible icons
          if (child.material && child.material.visible === false) continue;
          if (!child.userData.baseScaleSet) {
            child.userData.baseScaleSet = true;
            child.userData.baseScale = child.scale.x || 1;
          }
          child.scale.setScalar(child.userData.baseScale * f);
        }
      }
    }

    // Planet name sprites: shrink when very close so they don't dominate
    for (const [sysId, sg] of Object.entries(this.systemMeshes)) {
      const dist = cam.distanceTo(sg.position);
      sg.traverse(o => {
        if (!o.isSprite) return;
        // planet title sprites are direct children with no zoneLabel flag
        if (o.userData?.zoneLabel || o.userData?.ipcBadge || o.userData?.isCountBadge) return;
        if (o.parent !== sg) return;
        const hideClose = dist < 5.5;
        const wp = new THREE.Vector3(); o.getWorldPosition(wp);
        const fz = this._activeFocus();
        o.visible = !hideClose && !this._occluded(wp, sysId) && (!fz || fz === sysId);
        if (o.material) o.material.opacity = THREE.MathUtils.clamp(1.25 - dist / 140, 0.5, 1); // fade with distance
        if (o.visible && o.material?.map?.image) {
          const img = o.material.map.image;
          const a = img.width / img.height;
          const base = SYSTEMS[sysId]?.kind === 'planet' ? 0.65 : 0.42;
          const [sx, sy] = this._spriteScaleForDist(base, dist, a);
          o.scale.set(sx, sy, 1);
        }
      });
    }
  }

  refreshUnits() {
    for (const p of Object.values(this.shipPins)) {
      p.parent && p.parent.remove(p);
      p.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.shipPins = {};

    for (const [loc, facs] of Object.entries(this.game.units)) {
      for (const [fac, stack] of Object.entries(facs)) {
        const clean = {};
        let total = 0;
        let primary = 'ground';
        for (const [t, n] of Object.entries(stack)) {
          if (n <= 0) continue;
          clean[t] = n;
          total += n;
          const k = UNITS[t].kind;
          if (k === 'ship') primary = 'ship';
          else if (k === 'air' && primary !== 'ship') primary = 'air';
        }
        if (total > 0) this._placeStackPin(loc, fac, clean, total, primary);
      }
    }

    this.refreshZoneTextures();
  }

  /** One marker per zone per faction: row of distinct type icons with counts (top 3 + "+N"). */
  _placeStackPin(loc, fac, stack, total, primary) {
    const key = `${loc}|${fac}`;
    const color = new THREE.Color(FACTIONS[fac].color);
    const group = new THREE.Group();
    group.userData = { locId: loc, fac, pick: 'units', kind: primary };
    const hasShip = Object.keys(stack).some(t => UNITS[t].kind === 'ship');
    const hasAir = Object.keys(stack).some(t => UNITS[t].kind === 'air');

    if (ZONES[loc]) {
      const z = ZONES[loc];
      const sys = SYSTEMS[z.system];
      const sysGroup = this.systemMeshes[z.system];
      const local = uvToSphere(z.uv[0], z.uv[1], sys.radius);
      const outward = local.clone().normalize();
      // Planets: anchor badges just above the surface. Islands: fleets hover a bit higher so they read above the sea.
      const isPlanet = sys.kind === 'planet';
      const hover = isPlanet ? (hasShip ? 0.12 : 0.05) : (hasShip ? sys.radius * 0.4 + 0.15 : hasAir ? sys.radius * 0.3 + 0.1 : sys.radius * 0.17 + 0.08);
      const facIdx = Object.keys(FACTIONS).indexOf(fac);
      const up = Math.abs(outward.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const tangent = new THREE.Vector3().crossVectors(outward, up).normalize();
      const side = tangent.multiplyScalar((facIdx - 2) * (isPlanet ? 0.1 : 0.22));
      group.position.copy(sysGroup.position).add(local).add(outward.clone().multiplyScalar(hover)).add(side);
      group.userData.outward = outward.clone();
      group.userData.systemId = z.system;
    } else if (this.game.isFree(loc)) {
      // Free-space fleet: small glowing hull marker with the unit badge above it
      const p = this.game.freePos[loc];
      const facIdx = Object.keys(FACTIONS).indexOf(fac);
      // Factions sharing one open-space spot (a fight) sit side by side
      const out = new THREE.Vector3(...p).normalize();
      const tan = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), out).normalize();
      const present = Object.keys(this.game.units[loc] || {}).filter(f => this.game.totalAt(loc, f) > 0);
      const k = present.indexOf(fac), off = (k - (present.length - 1) / 2) * 1.5;
      group.position.set(p[0], p[1], p[2]).addScaledVector(tan, present.length > 1 ? off : 0);
      const hull = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
      hull.scale.set(1.6, 0.5, 0.8);
      group.add(hull);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      halo.userData.faceCam = true;
      group.add(halo);
      group.userData.free = true;
    } else return;

    const badge = this._unitRowBadge(stack, color);
    group.add(badge);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.userData = group.userData;
    group.add(hit);
    this.root.add(group);
    this.shipPins[key] = group;
  }

  /** Draw a distinct silhouette for a unit type centered at (0,0), ~28px box. */
  _drawUnitIcon(ctx, type) {
    const R = (x, y, w, h) => ctx.fillRect(x, y, w, h);
    const C = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    const P = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); };
    switch (type) {
      case 'infantry': // soldier with rifle
        C(0, -9, 4); R(-4, -4, 8, 10); R(-5, 6, 3, 8); R(2, 6, 3, 8);
        ctx.save(); ctx.translate(5, -2); ctx.rotate(-0.6); R(0, -1, 12, 2.2); ctx.restore();
        break;
      case 'artillery': // field gun: long barrel + wheel
        ctx.save(); ctx.translate(-2, 2); ctx.rotate(-0.45); R(0, -2, 17, 4); ctx.restore();
        C(-3, 6, 6); ctx.save(); ctx.globalCompositeOperation = 'destination-out'; C(-3, 6, 2.5); ctx.restore();
        P([-12, 9, -3, 3, -3, 7]);
        break;
      case 'tank':
        R(-13, 0, 26, 8); R(-6, -6, 12, 6); R(6, -4, 10, 2.5);
        C(-9, 9, 3); C(-3, 9, 3); C(3, 9, 3); C(9, 9, 3);
        break;
      case 'aa': // base + twin upward barrels
        R(-10, 6, 20, 6); P([-6, 6, 6, 6, 3, 1, -3, 1]);
        ctx.save(); ctx.translate(-3, 1); ctx.rotate(-0.25); R(-1.5, -15, 3, 15); ctx.restore();
        ctx.save(); ctx.translate(3, 1); ctx.rotate(0.25); R(-1.5, -15, 3, 15); ctx.restore();
        break;
      case 'fighter': // swept small jet
        P([14, 0, 4, -2, -2, -12, -5, -12, -2, -2, -12, -2, -14, -6, -16, -6, -14, 0, -16, 6, -14, 6, -12, 2, -2, 2, -5, 12, -2, 12, 4, 2]);
        break;
      case 'bomber': // wide straight wings, 4 engines
        R(-14, -2, 28, 4); P([15, 0, 10, -3, 10, 3]);
        R(-4, -14, 6, 28);
        R(-9, -15, 4, 3); R(-9, 12, 4, 3);
        R(-2, -9, 3, 3); R(-2, 6, 3, 3);
        R(-14, -6, 3, 12);
        break;
      case 'transport': // boxy hull + cargo blocks
        P([-15, 2, 15, 2, 12, 9, -12, 9]); R(-10, -5, 7, 7); R(-2, -5, 7, 7); R(7, -9, 4, 11);
        break;
      case 'submarine': // low cigar + tower
        ctx.beginPath(); ctx.ellipse(0, 4, 15, 4, 0, 0, Math.PI * 2); ctx.fill();
        R(-3, -5, 6, 7); R(-0.8, -10, 1.6, 5);
        break;
      case 'destroyer': // slim, one gun, one stack
        P([-15, 3, 16, 3, 10, 8, -12, 8]); R(-4, -3, 8, 6); R(5, -1, 7, 1.8); R(-9, -6, 3, 9);
        break;
      case 'cruiser': // medium, two turrets
        P([-15, 2, 16, 2, 11, 8, -12, 8]); R(-4, -6, 7, 8); R(-12, -2, 5, 4); R(-14, -1, 4, 1.6); R(6, -2, 5, 4); R(10, -1, 5, 1.6);
        break;
      case 'battleship': // big hull, tall superstructure, 3 turrets
        P([-16, 1, 17, 1, 12, 9, -13, 9]); R(-4, -9, 7, 10); R(-1, -13, 2, 4);
        R(-13, -3, 6, 4); R(-16, -2, 4, 1.8); R(6, -3, 6, 4); R(11, -2, 5, 1.8); R(-9, -6, 4, 3);
        break;
      case 'carrier': // flat deck + island
        P([-16, 0, 16, 0, 13, 7, -13, 7]); R(-17, -3, 33, 3); R(6, -10, 5, 7);
        ctx.save(); ctx.globalCompositeOperation = 'destination-out'; R(-12, -2, 14, 0.9); ctx.restore();
        break;
      default:
        C(0, 0, 6);
    }
  }

  _unitRowBadge(stack, color) {
    const order = ['battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport',
      'bomber', 'fighter', 'tank', 'artillery', 'aa', 'infantry'];
    const entries = order.filter(t => (stack[t] || 0) > 0).map(t => [t, stack[t]]);
    const shown = entries.slice(0, 3);
    const extra = entries.slice(3).reduce((a, [, n]) => a + n, 0);
    const cellW = 54, H = 44;
    const W = 8 + shown.length * cellW + (extra ? 40 : 0) + 4;
    const canvas = document.createElement('canvas');
    const S = 2; // supersample
    canvas.width = W * S; canvas.height = H * S;
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);
    const hex = '#' + color.getHexString();
    const rr = (x, y, w, h, r) => {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };
    rr(1.5, 3, W - 3, H - 6, 10);
    ctx.fillStyle = 'rgba(6,10,18,0.84)'; ctx.fill();
    ctx.strokeStyle = hex; ctx.lineWidth = 2; ctx.stroke();

    // Lighter faction tint for icons so dark factions stay visible
    const c = color.clone(); const hsl = {}; c.getHSL(hsl);
    c.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), Math.max(0.55, hsl.l));
    const iconCol = '#' + c.getHexString();

    let x = 8;
    for (const [type, n] of shown) {
      ctx.save();
      ctx.translate(x + 17, H / 2);
      ctx.scale(0.85, 0.85);
      ctx.fillStyle = iconCol;
      this._drawUnitIcon(ctx, type);
      ctx.restore();
      ctx.font = 'bold 15px "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(String(n), x + 33, H / 2 + 1);
      ctx.fillStyle = '#fff'; ctx.fillText(String(n), x + 33, H / 2 + 1);
      x += cellW;
    }
    if (extra) {
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.fillStyle = '#c8d6ea'; ctx.textBaseline = 'middle';
      ctx.fillText('+' + extra, x + 2, H / 2 + 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: true,
    }));
    spr.renderOrder = 20; // drawn over its own surface; far-side/occluded hiding is done in _updateZoneLabelVisibility
    const baseH = 0.4;
    spr.scale.set(baseH * W / H, baseH, 1);
    spr.userData.isCountBadge = true;
    spr.userData.baseH = baseH;
    spr.userData.types = entries.map(e => e[0]);
    return spr;
  }

  _unitIconBadge(kind, n, color) {
    return this._unitRowBadge({ [kind]: n }, color);
  }

  _countBadge(n, color) {
    return this._unitRowBadge({ infantry: n }, color);
  }

  _pickFromEvent(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Prefer units, then deep, then system spheres → nearest zone seed
    const unitHits = [];
    const deepHits = [];
    const sphereHits = [];
    this.root.traverseVisible(o => {
      if (!o.isMesh || !o.userData?.pick) return;
      if (o.userData.pick === 'units') unitHits.push(o);
      else if (o.userData.pick === 'deep') deepHits.push(o);
      else if (o.userData.pick === 'system') sphereHits.push(o);
    });

    let hits = this.raycaster.intersectObjects(unitHits, false);
    if (hits.length) {
      const ud = hits[0].object.userData;
      return { type: 'units', id: ud.locId, fac: ud.fac, kind: ud.kind };
    }
    hits = this.raycaster.intersectObjects(sphereHits, false);
    if (hits.length) {
      const hit = hits[0];
      const sysId = hit.object.userData.systemId;
      const sg = this.systemMeshes[sysId];
      const local = sg.worldToLocal(hit.point.clone());
      const [u, v] = worldToUV(local);
      const zid = this._nearestZone(sysId, u, v);
      if (zid) return { type: 'zone', id: zid };
    }
    const sp = this._spacePoint();
    if (sp) return { type: 'space', id: null, pos: sp.toArray() };
    return null;
  }

  /** Smooth pseudo-noise on the unit sphere (deterministic per key). */
  _sphereNoise(dir, key, fs = 1) {
    if (!this._noiseCache) this._noiseCache = {};
    let w = this._noiseCache[key];
    if (!w) {
      let h = [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
      const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
      w = [];
      for (let i = 0; i < 9; i++) {
        const th = rnd() * Math.PI * 2, z = rnd() * 2 - 1, s = Math.sqrt(1 - z * z);
        const f = i < 3 ? 2.2 : i < 6 ? 4.5 : 9;
        w.push([Math.cos(th) * s * f, Math.sin(th) * s * f, z * f, rnd() * 6.28, i < 3 ? 1 : i < 6 ? 0.5 : 0.22]);
      }
      this._noiseCache[key] = w;
    }
    let n = 0;
    for (const [a, b, c, p, amp] of w) n += Math.sin((dir.x * a + dir.y * b + dir.z * c) * fs + p) * amp;
    return n / 1.72; // ~[-1,1]
  }

  /** Voronoi distance; island seas get a noise-warped, wrapping coastline. */
  _seedDist(dir, s) {
    if (!s.island) return 1 - dir.dot(s.dir) + (s.bias || 0);
    // Island sea: distance grows toward the land seed(s); 3D noise warps the coast into an organic blob
    let dL = Infinity;
    for (const ld of s.landDirs || []) dL = Math.min(dL, 1 - dir.dot(ld));
    if (!Number.isFinite(dL)) dL = 1 - dir.dot(s.dir);
    if (s.n0 === undefined) s.n0 = s.landDirs?.length ? this._sphereNoise(s.landDirs[0], s.warpKey, 1.15) : 0;
    // noise anchored to 0 at the land seed and tapered near it, so the blob stays centered on its land zone
    const taper = Math.min(1, dL / 0.5);
    return (s.bias || 0) - dL + (this._sphereNoise(dir, s.warpKey, 1.15) - s.n0) * taper * (this.islandWarp ?? 0.3);
  }

  _nearestZone(sysId, u, v) {
    const info = this.systemTextures[sysId];
    if (!info || !info.seeds.length) return null;
    const dir = uvToDir(u, v);
    let best = null, bestD = Infinity;
    for (const s of info.seeds) {
      const d = this._seedDist(dir, s);
      if (d < bestD) { bestD = d; best = s.id; }
    }
    return best;
  }

  _onPointer(e) {
    const sel = this._pickFromEvent(e);
    this.highlight(sel);
    if (this.onSelect) this.onSelect(sel);
  }

  _onHover(e) {
    const sel = this._pickFromEvent(e);
    this._hoverZone = sel && sel.type === 'zone' ? sel.id : (sel && sel.type === 'units' && ZONES[sel.id] ? sel.id : null);
    if (this.moveTargets) this.previewPath(sel && sel.id && this.moveTargets.targets[sel.id] ? sel.id : null);
    if (this.moveSphere) {
      let pt = null;
      if (sel?.type === 'space') pt = new THREE.Vector3(...sel.pos);
      else if (sel?.id && sel.id !== this.moveSphere.from) { const p = this.game.locPos(sel.id); if (p) pt = new THREE.Vector3(...p); }
      if (pt && pt.distanceTo(this.moveSphere.center) > this.moveSphere.radius) pt = null;
      this.previewMove(pt);
    }
  }

  highlight(sel) {
    this.selected = sel;
    if (this._hl) {
      this.root.remove(this._hl);
      this._hl = null;
    }
    if (!sel) return;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.04, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    let pos = null;
    if ((sel.type === 'zone' || sel.type === 'units') && ZONES[sel.id]) {
      const z = ZONES[sel.id];
      const sys = SYSTEMS[z.system];
      const sg = this.systemMeshes[z.system];
      const local = uvToSphere(z.uv[0], z.uv[1], sys.radius * 1.12);
      pos = sg.position.clone().add(local);
      // Orient ring roughly tangent — keep simple horizontal
    } else if (this.game.isFree(sel.id)) {
      pos = new THREE.Vector3(...this.game.freePos[sel.id]);
    }
    if (pos) {
      ring.position.copy(pos);
      this.root.add(ring);
      this._hl = ring;
    }
  }

  focusOn(locId) {
    let sysId = null, target, near = 8, prefer = null;
    if (ZONES[locId]) {
      sysId = ZONES[locId].system;
      const z = ZONES[locId];
      prefer = uvToSphere(z.uv[0], z.uv[1], 1).normalize();
    } else if (SYSTEMS[locId]) sysId = locId;
    if (sysId) {
      const sys = SYSTEMS[sysId];
      target = this.systemMeshes[sysId].position.clone();
      near = sys.kind === 'planet' ? sys.radius * 3.4 + 0.6 : sys.radius * 4.6 + 0.6;
      // For islands, center on the land blob
      if (!prefer) {
        const land = Object.values(ZONES).find(z => z.system === sysId && z.terrain !== 'sea');
        if (land) prefer = uvToSphere(land.uv[0], land.uv[1], 1).normalize();
      }
      // Pick a view direction that faces the zone and keeps every other body out of frame behind/around it
      let best = null, bestS = -Infinity;
      const N = 400;
      for (let i = 0; i < N; i++) {
        const zc = 1 - 2 * (i + 0.5) / N, th = i * 2.39996, r = Math.sqrt(1 - zc * zc);
        const d = new THREE.Vector3(Math.cos(th) * r, zc, Math.sin(th) * r);
        if (d.y < -0.2) continue;
        const isIsland = sys.kind !== 'planet';
        if (isIsland && prefer && d.dot(prefer) < 0.94) continue;
        let sc = prefer ? d.dot(prefer) * (isIsland ? 4 : 1.2) : 0;
        sc += d.y * 0.25;
        const cam = target.clone().addScaledVector(d, near);
        const axis = target.clone().sub(cam).normalize();
        for (const [oid, og] of Object.entries(this.systemMeshes)) {
          if (oid === sysId) continue;
          const to = og.position.clone().sub(cam);
          const dist = to.length();
          if (dist < 0.01) continue;
          const ang = Math.acos(THREE.MathUtils.clamp(to.dot(axis) / dist, -1, 1));
          const appR = Math.asin(Math.min(1, SYSTEMS[oid].radius / dist));
          const clear = ang - appR - 0.45; // 0.45 rad ~ half the 50deg fov
          if (clear < 0) sc -= (-clear) * 3 * Math.min(1, 12 / dist);
        }
        if (sc > bestS) { bestS = sc; best = d; }
      }
      this.controls.target.copy(target);
      this.camera.position.copy(target).addScaledVector(best, near);
      this.focusSystem = sysId;
      this._focusNear = near;
      this.controls.update();
      return;
    }
    if (this.game.isFree(locId)) {
      target = new THREE.Vector3(...this.game.freePos[locId]);
      this.controls.target.copy(target);
      this.camera.position.copy(target).add(new THREE.Vector3(near * 0.7, near * 0.45, near));
      this.focusSystem = null;
    }
  }

  // ——— Legal-move highlights ———
  /** Cached low-res zone-index map per body (same pixel→uv mapping as the Voronoi texture). */
  _zoneIndexMap(sysId) {
    this._zim = this._zim || {};
    if (this._zim[sysId]) return this._zim[sysId];
    const sys = SYSTEMS[sysId];
    const W = sys.kind === 'planet' ? 384 : 160, H = W / 2;
    const info = this.systemTextures[sysId];
    const ids = info.seeds.map(sd => sd.id);
    const idx = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dir = uvToDir((x + 0.5) / W, (y + 0.5) / H);
      let best = 0, bd = Infinity;
      for (let k = 0; k < info.seeds.length; k++) { const d = this._seedDist(dir, info.seeds[k]); if (d < bd) { bd = d; best = k; } }
      idx[y * W + x] = best;
    }
    return (this._zim[sysId] = { W, H, ids, idx });
  }

  _overlayFor(sysId) {
    this._overlays = this._overlays || {};
    if (this._overlays[sysId]) return this._overlays[sysId];
    const { W, H } = this._zoneIndexMap(sysId);
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sphere = this.systemSpheres[sysId];
    const r = SYSTEMS[sysId].radius;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r * 1.006, 64, 48),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.raycast = () => {}; mesh.renderOrder = 3; mesh.visible = false;
    sphere.add(mesh);
    return (this._overlays[sysId] = { canvas, ctx: canvas.getContext('2d'), tex, mesh });
  }

  /** targets: { locId: {type, dist} } from game.legalTargets. */
  setMoveTargets(from, targets) {
    this.clearMoveTargets();
    this.moveTargets = { from, targets };
    const COL = { move: [70, 230, 120, 120], attack: [245, 60, 50, 140], unload: [250, 195, 40, 140], origin: [60, 235, 235, 120], dim: [0, 0, 0, 80] };
    for (const sysId of Object.keys(this.systemMeshes)) {
      const { W, H, ids, idx } = this._zoneIndexMap(sysId);
      const ov = this._overlayFor(sysId);
      const cols = ids.map(id => id === from ? COL.origin : targets[id] ? COL[targets[id].type] : COL.dim);
      const img = ov.ctx.createImageData(W, H);
      for (let i = 0; i < W * H; i++) { const c = cols[idx[i]]; img.data.set(c, i * 4); }
      ov.ctx.putImageData(img, 0, 0);
      ov.tex.needsUpdate = true;
      ov.mesh.visible = true;
    }
    // Rings + range numbers for sea / open-space / air targets
    const g = new THREE.Group();
    const HEX = { move: 0x46e678, attack: 0xf53c32, unload: 0xfac328 };
    for (const [id, t] of Object.entries(targets)) {
      const isLand = this.game.isLandZone(id);
      if (isLand && t.type !== 'attack' && !this.moveSphere) continue; // land moves: tint only
      const p = this.game.locPos(id); if (!p) continue;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 28),
        new THREE.MeshBasicMaterial({ color: HEX[t.type], transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
      ring.position.set(...p); ring.userData.faceCam = true; ring.renderOrder = 21; ring.raycast = () => {};
      g.add(ring);
      if (this.moveSphere && t.dist != null) {
        const spr = this._makeTextSprite(t.dist.toFixed(1), { fontSize: 22, worldHeight: 0.32, pad: 4, outline: 4, fill: t.type === 'attack' ? '#ffb0a8' : '#c8ffd8' });
        spr.position.set(p[0], p[1] + 0.55, p[2]); spr.renderOrder = 22;
        g.add(spr);
      }
    }
    this.root.add(g);
    this._targetGroup = g;
  }

  clearMoveTargets() {
    this.moveTargets = null;
    for (const ov of Object.values(this._overlays || {})) ov.mesh.visible = false;
    if (this._targetGroup) { this.root.remove(this._targetGroup); this._targetGroup.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose?.(); o.material?.dispose?.(); }); this._targetGroup = null; }
    this.previewPath(null);
  }

  /** Path preview from the selected stack to a legal target: arc over the surface on one body, straight otherwise. */
  previewPath(toId) {
    if (this._pathLine) { this.root.remove(this._pathLine); this._pathLine.geometry.dispose(); this._pathLine.material.dispose(); this._pathLine = null; }
    const mt = this.moveTargets;
    if (!toId || !mt || !mt.targets[toId]) return;
    const a = this.game.locPos(mt.from), b = this.game.locPos(toId);
    if (!a || !b) return;
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), pts = [];
    const sa = this.game.zones[mt.from]?.system, sb = this.game.zones[toId]?.system;
    if (sa && sa === sb) {
      const c = this.systemMeshes[sa].position, r = SYSTEMS[sa].radius * 1.06;
      const ua = A.clone().sub(c).normalize(), ub = B.clone().sub(c).normalize();
      for (let i = 0; i <= 32; i++) { const t = i / 32; pts.push(c.clone().add(ua.clone().lerp(ub, t).normalize().multiplyScalar(r + Math.sin(Math.PI * t) * r * 0.08))); }
    } else for (let i = 0; i <= 1; i++) pts.push(A.clone().lerp(B, i));
    const col = { move: 0x9dffc0, attack: 0xff8a80, unload: 0xffe08a }[mt.targets[toId].type];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: col, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
    line.computeLineDistances(); line.renderOrder = 23; line.raycast = () => {};
    this.root.add(line);
    this._pathLine = line;
  }

  // ——— Free movement sphere ———
  showMoveSphere(locId, radius) {
    this.hideMoveSphere();
    const p = this.game.locPos(locId);
    if (!p || !radius) return;
    const c = new THREE.Vector3(...p);
    const g = new THREE.Group();
    g.position.copy(c);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x35d6c0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
    shell.raycast = () => {};
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(radius, 16, 8)),
      new THREE.LineBasicMaterial({ color: 0x5ff5dc, transparent: true, opacity: 0.06, depthWrite: false }));
    wire.raycast = () => {};
    const rim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.985, radius, 96),
      new THREE.MeshBasicMaterial({ color: 0x7ffff0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    rim.raycast = () => {}; rim.userData.faceCam = true;
    g.add(shell, wire, rim);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0xbfffff, dashSize: 0.4, gapSize: 0.25, transparent: true, opacity: 0.85, depthWrite: false }));
    line.visible = false; line.raycast = () => {};
    const ghost = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xbfffff, transparent: true, opacity: 0.7 }));
    ghost.visible = false; ghost.raycast = () => {};
    g.add(line, ghost);
    g.renderOrder = 5;
    this.root.add(g);
    this.moveSphere = { group: g, center: c, radius, line, ghost, from: locId };
  }

  hideMoveSphere() {
    if (!this.moveSphere) return;
    this.root.remove(this.moveSphere.group);
    this.moveSphere.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
    this.moveSphere = null;
  }

  /** Point in open space under the pointer: ray ∩ camera-facing plane through the sphere center, if inside the sphere. */
  _spacePoint() {
    const ms = this.moveSphere;
    if (!ms) return null;
    const n = this.camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, ms.center);
    const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit || hit.distanceTo(ms.center) > ms.radius) return null;
    return hit;
  }

  /** Preview line from the fleet to a destination point (world). */
  previewMove(pt) {
    const ms = this.moveSphere;
    if (!ms) return;
    if (!pt) { ms.line.visible = ms.ghost.visible = false; return; }
    const local = pt.clone().sub(ms.center);
    ms.line.geometry.setFromPoints([new THREE.Vector3(), local]);
    ms.line.computeLineDistances();
    ms.ghost.position.copy(local);
    ms.line.visible = ms.ghost.visible = true;
  }

  /** Focus is active while the camera stays close to the focused body. */
  _activeFocus() {
    if (!this.focusSystem) return null;
    const g = this.systemMeshes[this.focusSystem];
    if (!g || this.camera.position.distanceTo(g.position) > this._focusNear * 1.8) { this.focusSystem = null; return null; }
    return this.focusSystem;
  }

  /** Expose for playtest screenshots */
  get zoneMeshes() { return this.zoneMarkers; }

  dispose() {
    this._running = false;
    this.renderer.dispose();
  }
}
