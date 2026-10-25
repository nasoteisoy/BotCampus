// three.js view: terrain, rocks, walls, command posts, instanced armies (crouch in cover), tracers/rockets/booms/heal beams, mines, rally flag, RTS camera.
// v2.5: 🚜 tanks (hull + aiming turret, dark tilted wreck), 💀 taken-out fall (flinch → knocked back onto the back → weapon drops →
// ~3 s down → dither fade; nothing like a crawl), 🎒 gear in battle (turrets, recon droids, supply crates, rally rings, time bombs).
// v2.2: the map scene lives in one group and is rebuilt by setMap() when the active map (map.js MAP) changes;
// camera limits, far plane and fog follow MAP.view (the big map zooms out to see the whole valley).
import * as THREE from 'three';
import { TeamLook, buildMergedDef, buildSplitDef, concat, TROOPER, drawSymbol, symbolColor } from './trooper.js';
import { TANK, TANK_PIVOT } from './tank.js';
import { MAP, heightAt } from './map.js';
import { PICKUPS } from './pickups.js';
import { syncPickups } from './pickups-view.js';     // ❤️/📦 packs + overhead icons (only while PICKUPS.on)

export const TEAM_COLOR = ['#3ab4ff', '#ff5a4a'];   // your side / enemy side (rings, tracers, HUD)
const UNIT_SCALE = 1.8;
const NEUTRAL = '#9aa1a8';
const TANK_SCALE = 1.8;
// 💀 taken out (s): flinch → fall onto the back with knockback → lie still → fade (the sim keeps the body 4.4 s)
export const DOWN_T = Object.freeze({ flinch: 0.12, fall: 0.65, lie: 3.65, fade: 4.35, knock: 1.4 });
// per-instance alpha via screen-door dither (instanced meshes can't blend per instance); attribute iAlpha (1 = solid)
function fadeable(mat) {
  if (mat.userData.fadeable) return mat; mat.userData.fadeable = true;
  mat.onBeforeCompile = (sh) => {
    // iPart (per instance) 0 = whole unit, 1 = body without its weapon, 2 = only the weapon (wpn = 1 on weapon vertices): hidden parts collapse to a point
    sh.vertexShader = 'attribute float iAlpha;\nattribute float iPart;\nattribute float wpn;\nvarying float vIA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vIA = iAlpha;\n  if ((iPart > 0.5 && iPart < 1.5 && wpn > 0.5) || (iPart > 1.5 && wpn < 0.5)) transformed = vec3(0.0);');
    sh.fragmentShader = 'varying float vIA;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (vIA < 0.999 && fract(dot(floor(gl_FragCoord.xy), vec2(0.7548776662, 0.56984029))) > vIA) discard;');
  };
  mat.customProgramCacheKey = () => 'cc-fade-2'; mat.needsUpdate = true;
  return mat;
}

export function flagCanvas(nation, size = 64, letter = '') {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  if (!nation) { g.fillStyle = NEUTRAL; g.fillRect(0, 0, size, size); g.fillStyle = '#e9edf1'; g.font = `bold ${size * 0.55}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter || '?', size / 2, size / 2 + 2); return c; }
  g.fillStyle = nation.s; g.fillRect(0, 0, size, size);
  g.strokeStyle = nation.p; g.lineWidth = size / 16; g.strokeRect(size / 32, size / 32, size - size / 16, size - size / 16);
  drawSymbol(g, nation.sym, size / 2, size / 2, size * 0.33, symbolColor(nation));
  return c;
}

export class View {
  constructor(container, { low = false } = {}) {
    this.low = low;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(devicePixelRatio || 1, low ? 1.25 : 2);
    r.setPixelRatio(this.pixelRatio);
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color('#b9a888');
    sc.fog = new THREE.Fog('#b9a888', 160, 330);
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 600);
    this.cam = { x: -40, z: 6, dist: 95, yaw: 0, pitch: 0.95, want: null };
    this.mapGroup = null; this.mapId = null;
    sc.add(new THREE.HemisphereLight('#fff6e6', '#6b5a43', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.9); sun.position.set(60, 120, 40); sc.add(sun);
    this.buildMap();
    this.fx = { tracers: [], rockets: [], booms: [] };
    this.buildFx();
    this.armies = null;
    this.resize();
  }
  // ---------- map ----------
  // rebuild the map scene if the active map changed (returns true if it did)
  setMap() {
    if (this.mapId === MAP.id) return false;
    if (this.mapGroup) {
      this.scene.remove(this.mapGroup);
      this.mapGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } if (o.isInstancedMesh) o.dispose(); });
    }
    this.buildMap();
    return true;
  }
  buildMap() {
    this.mapId = MAP.id;
    const root = this.mapGroup = new THREE.Group(); this.scene.add(root);
    const add = (o) => root.add(o);
    // terrain resolution: ~2.5 m (desktop) / ~4 m (phone) per segment on Dust Ridge; coarser on the big map (~3.4 / ~5.5 m)
    const big = MAP.hx > 150, segX = big ? (this.low ? 116 : 190) : (this.low ? 80 : 130), segZ = big ? (this.low ? 72 : 118) : (this.low ? 48 : 78);
    const geo = new THREE.PlaneGeometry(MAP.hx * 2 + 40, MAP.hz * 2 + 40, segX, segZ); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), V = MAP.view || {}, lo = new THREE.Color(V.lo || '#c9b48a'), hi = new THREE.Color(V.hi || '#a8906a'), edge = new THREE.Color(V.edge || '#8c7a5c');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z); pos.setY(i, h);
      const n = 0.5 + 0.5 * Math.sin(x * 0.37 + z * 0.21) * Math.cos(z * 0.29 - x * 0.13);
      c.copy(lo).lerp(hi, Math.min(1, h / (big ? 16 : 7) * 0.8 + n * 0.25));
      if (Math.abs(x) > MAP.hx || Math.abs(z) > MAP.hz) c.lerp(edge, 0.6);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    this.ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    add(this.ground);
    // rocks
    const rg = new THREE.IcosahedronGeometry(1, 0), rm = new THREE.MeshLambertMaterial({ color: V.rock || '#7d6f5e', flatShading: true });
    const rocks = new THREE.InstancedMesh(rg, rm, MAP.rocks.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    MAP.rocks.forEach((o, i) => { e.set(o.x * 0.3, o.z * 0.7, 0); m.compose(new THREE.Vector3(o.x, heightAt(o.x, o.z) + o.r * 0.25, o.z), q.setFromEuler(e), new THREE.Vector3(o.r, o.r * 0.8, o.r)); rocks.setMatrixAt(i, m); });
    add(rocks);
    // walls (one instanced box)
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: V.wall || '#a59d90' }), MAP.walls.length);
    MAP.walls.forEach((w, i) => { const y = heightAt(w.x, w.z); m.compose(new THREE.Vector3(w.x, y + w.h / 2 - 0.2, w.z), q.identity(), new THREE.Vector3(w.hx * 2, w.h + 0.4, w.hz * 2)); walls.setMatrixAt(i, m); });
    add(walls);
    // posts
    this.posts = MAP.posts.map((p) => {
      const g = new THREE.Group(), y = heightAt(p.x, p.z); g.position.set(p.x, 0, p.z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 0.6, 10), new THREE.MeshLambertMaterial({ color: '#6f6a62' })); base.position.y = y + 0.2; g.add(base);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 6), new THREE.MeshLambertMaterial({ color: '#d9dee4' })); pole.position.y = y + 4; g.add(pole);
      const canvas = flagCanvas(null, 64, p.id), tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })); flag.position.set(1.7, y + 6.8, 0); g.add(flag);
      const ring = (r0, r1, segs, color, opacity) => {
        const rg2 = new THREE.RingGeometry(r0, r1, segs, 1); rg2.rotateX(-Math.PI / 2);
        const a = rg2.attributes.position; for (let i = 0; i < a.count; i++) a.setY(i, heightAt(p.x + a.getX(i), p.z + a.getZ(i)) + 0.18);
        const mesh = new THREE.Mesh(rg2, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); mesh.renderOrder = 2; g.add(mesh); return mesh;
      };
      const back = ring(MAP.postR - 0.7, MAP.postR, 64, '#2a2a2a', 0.35);
      const prog = ring(MAP.postR - 0.9, MAP.postR + 0.15, 64, NEUTRAL, 0.95);
      const fill = ring(0.1, MAP.postR - 0.7, 48, NEUTRAL, 0.12);
      add(g);
      return { g, flag, tex, canvas, prog, fill, back, owner: 'x', key: '' };
    });
    // rally flag
    const rally = new THREE.Group();
    const rp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 5), new THREE.MeshBasicMaterial({ color: '#ffffff' })); rp.position.y = 1.8; rally.add(rp);
    const rf = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[0], side: THREE.DoubleSide })); rf.position.set(0.8, 3.1, 0); rally.add(rf);
    const rr = new THREE.Mesh(new THREE.RingGeometry(1.6, 2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[0], transparent: true, opacity: 0.8, depthWrite: false })); rr.position.y = 0.2; rally.add(rr);
    rally.visible = false; this.rally = rally; add(rally);
    this.applyView();
  }
  // per-map camera limits + fog
  applyView() {
    const V = MAP.view || {};
    this.camMax = V.camMax || 170; this.fogNear = V.fogNear || 160; this.fogFar = V.fogFar || 330;
    this.scene.fog.near = this.fogNear; this.scene.fog.far = this.fogFar;
    const sky = V.sky || '#b9a888'; this.scene.background.set(sky); this.scene.fog.color.set(sky);
  }
  // ---------- armies ----------
  buildArmies(teams, cap) {
    this.cap = cap;
    this.disposeArmies();
    this.armies = teams.map((T, ti) => {
      const look = new TeamLook(); look._nat = T.nation; look.paint({ ...T.nation, skin: 1 });
      const meshes = T.looks.map((l) => {
        // one mesh per material (same draw calls as before); weapon vertices are tagged (wpn = 1) so a taken-out trooper
        // is drawn as 'body only' + a second 'weapon only' instance lying beside it (see fadeable / iPart)
        const [wpn, body] = buildSplitDef(TROOPER, l.st, (p) => p.tag === 'weapon'), out = {}, mat = (l.mat ||= this.lookMat(look, l));
        const wb = (wpn.team || wpn.visor) && (wpn.team || wpn.visor).boundingBox, wc = out.wc = new THREE.Vector3();
        if (wb) wb.getCenter(wc); out.hasW = !!wb;
        for (const k of ['team', 'visor']) {
          const parts = [body[k], wpn[k]].filter(Boolean); if (!parts.length) continue;
          const g = parts.length === 1 ? parts[0] : concat(parts), flag = new Float32Array(g.attributes.position.count);
          if (wpn[k]) flag.fill(1, body[k] ? body[k].attributes.position.count : 0);
          g.setAttribute('wpn', new THREE.BufferAttribute(flag, 1));
          if (parts.length > 1) for (const x of parts) x.dispose();
          out[k] = this.inst(g, k === 'team' ? mat : look.visor, cap * 2);   // ×2: a corpse uses a 2nd instance for its dropped weapon
        }
        return out;
      });
      // 🚜 tanks: hull + turret (aims at its target); ≤2 per side, a wreck can share the slot for a moment
      const tanks = (T.tankLooks || []).map((l) => {
        const [tur, hull] = buildSplitDef(TANK, l.st, (p) => p.bone === 'turret'), out = { hull: {}, tur: {} };
        for (const k of ['team', 'visor']) { if (hull[k]) out.hull[k] = this.inst(hull[k], k === 'team' ? look.team : look.visor, 4); if (tur[k]) out.tur[k] = this.inst(tur[k], k === 'team' ? look.team : look.visor, 4); }
        return out;
      });
      const mk = new THREE.InstancedMesh(new THREE.RingGeometry(0.55, 0.85, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAM_COLOR[ti], transparent: true, opacity: 0.85, depthWrite: false }), cap * T.looks.length + 8);
      mk.count = 0; mk.frustumCulled = false; mk.renderOrder = 3; this.scene.add(mk);
      return { look, meshes, tanks, mk };
    });
    try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* optional warm-up */ }
  }
  // one instanced, fadeable mesh (iAlpha per instance, white instance colors)
  inst(geo, mat, cap) {
    fadeable(mat);
    geo.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iPart', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
    if (!geo.attributes.wpn) geo.setAttribute('wpn', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const w = new THREE.Color(1, 1, 1); for (let i = 0; i < cap; i++) im.setColorAt(i, w);
    this.scene.add(im); return im;
  }
  // each look shares the team atlas texture, but skin tone is per look → one material per distinct skin
  lookMat(look, l) {
    // Atlas holds one skin swatch; looks with another skin get their own atlas copy (≤6 per team, rare).
    const key = l.st.skin;
    look._skins ||= {};
    if (look._skins[key]) return look._skins[key];
    const t = new TeamLook(); t.paint({ ...look._nat, skin: key }); t.visor.dispose();
    look._skins[key] = t.team; return t.team;
  }
  disposeArmies() {
    if (!this.armies) return;
    for (const a of this.armies) {
      const drop = (im) => { this.scene.remove(im); im.geometry.dispose(); im.dispose(); };
      for (const m of a.meshes) { for (const k of ['team', 'visor']) if (m[k]) drop(m[k]); }
      for (const t of a.tanks) for (const part of [t.hull, t.tur]) for (const im of Object.values(part)) drop(im);
      this.scene.remove(a.mk); a.mk.geometry.dispose(); a.mk.dispose();
    }
    this.armies = null;
  }
  // ---------- fx ----------
  buildFx() {
    const N = 256, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracerLines.frustumCulled = false; this.scene.add(this.tracerLines); this.tracerN = N;
    const rg = new THREE.SphereGeometry(0.35, 6, 4);
    this.rocketMesh = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: '#ffd27a' }), 48); this.rocketMesh.count = 0; this.rocketMesh.frustumCulled = false; this.scene.add(this.rocketMesh);
    this.boomMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicMaterial({ color: '#ff9a3c', transparent: true, opacity: 0.75, depthWrite: false }), 32);
    this.boomMesh.count = 0; this.boomMesh.frustumCulled = false; this.scene.add(this.boomMesh);
    // 💣 mines: small team-colored discs
    this.mineMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 32);
    this.mineMesh.count = 0; this.mineMesh.frustumCulled = false; this.scene.add(this.mineMesh);
    for (let i = 0; i < 32; i++) this.mineMesh.setColorAt(i, new THREE.Color(1, 1, 1));
    // 🎒 gear in battle: one small instanced mesh per kind, team-colored
    const gm = (geo, n = 24, opts = {}) => { const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#ffffff', ...opts }), n); im.count = 0; im.frustumCulled = false; for (let i = 0; i < n; i++) im.setColorAt(i, new THREE.Color(1, 1, 1)); this.scene.add(im); return im; };
    const tg = new THREE.CylinderGeometry(0.55, 0.75, 0.9, 8); tg.translate(0, 0.45, 0);
    const bg = new THREE.BoxGeometry(0.22, 0.22, 1.3); bg.translate(0, 1.05, 0.45);
    this.gearMesh = {
      turretBase: gm(tg), turretGun: gm(bg),
      droid: gm(new THREE.IcosahedronGeometry(0.38, 0)),
      crate: gm(new THREE.BoxGeometry(0.9, 0.7, 0.9).translate(0, 0.35, 0)),
      rally: gm(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), 12, { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
      bomb: gm(new THREE.BoxGeometry(0.5, 0.3, 0.5).translate(0, 0.15, 0), 16, { emissive: '#330000' }),
    };
  }
  syncGear(sim) {
    const S = sim.__gear, G = this.gearMesh, m = this._gm ||= new THREE.Matrix4(), q = this._gq ||= new THREE.Quaternion(), v = this._gv ||= new THREE.Vector3(), sc = this._gs ||= new THREE.Vector3(), c = this._gc ||= new THREE.Color(), Y = this._Y ||= new THREE.Vector3(0, 1, 0);
    const now = performance.now() / 1000, put = (im, i, x, y, z, yaw, s, col) => { q.setFromAxisAngle(Y, yaw); m.compose(v.set(x, y, z), q, sc.set(s, s, s)); im.setMatrixAt(i, m); im.setColorAt(i, col); };
    const done = (im, n) => { im.count = n; im.visible = n > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; };
    if (!S) { for (const im of Object.values(G)) done(im, 0); return; }
    let n = 0; for (const t of S.turrets) { if (t.done || n >= 24) continue; const y = heightAt(t.x, t.z); c.set(TEAM_COLOR[t.team]); put(G.turretBase, n, t.x, y, t.z, 0, 1, c); put(G.turretGun, n, t.x, y, t.z, t.yaw || 0, 1, c.multiplyScalar(0.7)); n++; }
    done(G.turretBase, n); done(G.turretGun, n);
    n = 0; for (const d of S.droids) { if (d.done || n >= 24) continue; put(G.droid, n++, d.x, heightAt(d.x, d.z) + 2.6 + Math.sin(now * 3 + d.x) * 0.15, d.z, now, 1, c.set(TEAM_COLOR[d.team])); } done(G.droid, n);
    n = 0; for (const k of S.crates) { if (k.done || n >= 24) continue; put(G.crate, n++, k.x, heightAt(k.x, k.z), k.z, 0.4, 1, c.set(k.ammo ? '#d9b44a' : '#e8eef4')); } done(G.crate, n);
    n = 0; for (const r of S.rallies) { if (r.done || n >= 12) continue; put(G.rally, n++, r.x, heightAt(r.x, r.z) + 0.25, r.z, 0, r.r || 6, c.set(TEAM_COLOR[r.team])); } done(G.rally, n);
    n = 0; for (const b of S.bombs) { if (b.done || n >= 16) continue; const blink = Math.sin(now * (6 + 10 * Math.min(1, (sim.time - b.t) / (b.T || 8)))) > 0; put(G.bomb, n++, b.x, heightAt(b.x, b.z), b.z, 0, 1, c.set(blink ? '#ff3b30' : '#3a2a22')); } done(G.bomb, n);
  }
  consume(events, nations) {
    for (const e of events) {
      if (e.type === 'tracer') { if (this.fx.tracers.length < this.tracerN) this.fx.tracers.push({ ...e, t: 0, T: e.laser ? 0.16 : 0.09 }); }
      else if (e.type === 'heal') { if (this.fx.tracers.length < this.tracerN) this.fx.tracers.push({ ...e, t: 0, T: 0.35 }); }
      else if (e.type === 'rocket') { if (this.fx.rockets.length < 48) this.fx.rockets.push({ ...e, t: 0 }); }
      else if (e.type === 'boom') { if (this.fx.booms.length < 32) this.fx.booms.push({ ...e, t: 0 }); }
      else if (e.type === 'death' && e.tank) { if (this.fx.booms.length < 32) this.fx.booms.push({ type: 'boom', x: e.x, z: e.z, y: heightAt(e.x, e.z) + 1, team: e.team, t: 0, big: true }); }
    }
    void nations;
  }
  // ---------- per frame ----------
  update(sim, dt, now) {
    this.updateCamera(dt);
    if (sim) { this.syncPosts(sim); this.syncUnits(sim); this.syncRally(sim); this.syncMines(sim); this.syncGear(sim); }
    if (PICKUPS.on) syncPickups(this, sim);
    this.syncFx(dt);
    this.renderer.render(this.scene, this.camera);
  }
  syncPosts(sim) {
    sim.posts.forEach((p, i) => {
      const P = this.posts[i];
      if (P.owner !== p.owner) {
        P.owner = p.owner;
        const c = flagCanvas(p.owner >= 0 ? sim.teams[p.owner].nation : null, 64, p.id);
        P.canvas.getContext('2d').drawImage(c, 0, 0); P.tex.needsUpdate = true;
      }
      // progress ring: amount of control toward whoever leads, in that team's color
      const frac = Math.abs(p.ctrl), segs = Math.round(frac * 64);
      P.prog.geometry.setDrawRange(0, segs * 6);
      const lead = p.ctrl > 0 ? 0 : 1, col = segs ? TEAM_COLOR[lead] : NEUTRAL;
      P.prog.material.color.set(col);
      P.fill.material.color.set(p.owner >= 0 ? TEAM_COLOR[p.owner] : NEUTRAL);
      const contested = p.n[0] > 0 && p.n[1] > 0;
      P.fill.material.opacity = contested ? 0.18 + 0.12 * Math.sin(performance.now() / 120) : 0.12;
      P.flag.rotation.y = Math.sin(performance.now() / 700 + i) * 0.25;
    });
  }
  syncUnits(sim) {
    if (!this.armies) return;
    const m = this._m ||= new THREE.Matrix4(), m2 = this._m2 ||= new THREE.Matrix4(), q = this._q ||= new THREE.Quaternion(), q2 = this._q2 ||= new THREE.Quaternion(), q3 = this._q3 ||= new THREE.Quaternion(), v = this._v ||= new THREE.Vector3(), v2 = this._v2 ||= new THREE.Vector3(), s = this._s ||= new THREE.Vector3(UNIT_SCALE, UNIT_SCALE, UNIT_SCALE);
    const Y = this._Y ||= new THREE.Vector3(0, 1, 0), X = this._X ||= new THREE.Vector3(1, 0, 0), Z = this._Z ||= new THREE.Vector3(0, 0, 1);
    const white = this._w ||= new THREE.Color(1, 1, 1), red = this._r ||= new THREE.Color(1, 0.25, 0.2), wreck = this._wk ||= new THREE.Color(0.22, 0.2, 0.18), sc = this._sc ||= new THREE.Vector3(), D = DOWN_T;
    const counts = this.armies.map((a) => a.meshes.map(() => 0)), tcounts = this.armies.map((a) => a.tanks.map(() => 0)), mks = [0, 0];
    const set = (M, k, mat, col, alpha, part = 0) => { for (const im of Object.values(M)) { im.setMatrixAt(k, mat); if (im.instanceColor) im.setColorAt(k, col); im.geometry.attributes.iAlpha.setX(k, alpha); im.geometry.attributes.iPart.setX(k, part); } };
    const alphaOf = (d) => (d < D.lie ? 1 : Math.max(0, 1 - (d - D.lie) / (D.fade - D.lie)));
    for (const pass of [true, false]) for (const u of sim.units) {  // living first, so corpses never steal a living unit's instance
      if (u.alive !== pass) continue;
      const A = this.armies[u.team];
      if (u.kind === 'tank') { this.syncTank(sim, u, A, tcounts[u.team], mks); continue; }
      const M = A.meshes[u.look]; if (!M) continue;
      let y = heightAt(u.x, u.z), px = u.x, pz = u.z, alpha = 1, col = white;
      if (u.alive) {
        const limp = u.hp < (u.hpMax || u.s.hp) * 0.35;
        q.setFromAxisAngle(Y, u.yaw);
        if (u.moving) {
          y += Math.abs(Math.sin(u.phase)) * (limp ? 0.05 : 0.1);
          q2.setFromAxisAngle(Z, Math.sin(u.phase) * (limp ? 0.16 : 0.05)); q.multiply(q2);
        }
        if (limp) { q2.setFromAxisAngle(X, 0.18); q.multiply(q2); }
        if (u.crouch) { q2.setFromAxisAngle(X, 0.22); q.multiply(q2); }   // crouched behind cover / in a sniper nest
        if (u.hurtT > 0) col = red;
      } else {
        // 💀 taken out: face the shooter, flinch back, get knocked back along fallYaw and land flat on the back
        const d = u.deadT, fy = u.fallYaw ?? u.yaw; let tilt, kb;
        if (d < D.flinch) { const f = d / D.flinch; tilt = 0.28 * f; kb = 0.12 * f; col = red; }
        else { const f = Math.min(1, (d - D.flinch) / (D.fall - D.flinch)); tilt = 0.28 + (Math.PI / 2 - 0.28) * f * f; kb = 0.12 + (D.knock - 0.12) * (1 - (1 - f) * (1 - f)); }
        px += Math.sin(fy) * kb; pz += Math.cos(fy) * kb; y = heightAt(px, pz) + 0.1 * Math.min(1, d / D.fall);
        q.setFromAxisAngle(Y, fy + Math.PI); q2.setFromAxisAngle(X, -tilt); q.multiply(q2);
        alpha = alphaOf(d);
      }
      m.compose(v.set(px, y, pz), q, u.alive && u.crouch ? sc.set(UNIT_SCALE, UNIT_SCALE * 0.62, UNIT_SCALE) : s);
      const dropped = !u.alive && u.deadT > 0.2 && M.hasW;
      if (counts[u.team][u.look] + (dropped ? 2 : 1) > this.cap * 2) continue;  // more bodies than instances: skip the extra corpses
      const MM = { team: M.team, visor: M.visor }, wc = M.wc;
      set(MM, counts[u.team][u.look]++, m, col, alpha, dropped ? 1 : 0);   // alive: whole unit, weapon in hand
      // taken out → the weapon flies off and lands flat beside the body (its own 'weapon only' instance)
      if (dropped) {
        {
          v2.copy(wc).applyMatrix4(m);
          const d = u.deadT, f = Math.min(1, (d - 0.2) / 0.45), fy = u.fallYaw ?? u.yaw, sx = Math.cos(fy), sz = -Math.sin(fy);
          const gx = u.x + sx * 0.9 + Math.sin(fy) * 0.5, gz = u.z + sz * 0.9 + Math.cos(fy) * 0.5;
          v2.lerp(v.set(gx, heightAt(gx, gz) + 0.12, gz), f); v2.y += Math.sin(f * Math.PI) * 0.6;
          q3.setFromAxisAngle(Y, fy + 2.2); q2.setFromAxisAngle(Z, Math.PI / 2); q3.multiply(q2);
          m2.compose(v2, q2.copy(q).slerp(q3, f), s).multiply((this._mt ||= new THREE.Matrix4()).makeTranslation(-wc.x, -wc.y, -wc.z));
        }
        set(MM, counts[u.team][u.look]++, m2, col, alpha, 2);
      }
      if (u.alive) { m.compose(v.set(u.x, heightAt(u.x, u.z) + 0.12, u.z), q.identity(), s); A.mk.setMatrixAt(mks[u.team]++, m); }
    }
    this.armies.forEach((A, t) => {
      A.meshes.forEach((M, i) => {
        for (const im of [M.team, M.visor]) if (im) { im.count = counts[t][i]; this.dirty(im); }
      });
      A.tanks.forEach((T, i) => { for (const part of [T.hull, T.tur]) for (const im of Object.values(part)) { im.count = tcounts[t][i]; this.dirty(im); } });
      A.mk.count = mks[t]; A.mk.instanceMatrix.needsUpdate = true;
    });
  }
  dirty(im) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.geometry.attributes.iAlpha.needsUpdate = true; im.geometry.attributes.iPart.needsUpdate = true; im.visible = im.count > 0; }
  // 🚜 one tank: hull follows the drive, the turret turns to its target; destroyed → dark tilted wreck, then fades
  syncTank(sim, u, A, tcounts, mks) {
    const T = A.tanks[u.tk]; if (!T || tcounts[u.tk] >= 4) return;
    const m = this._tm ||= new THREE.Matrix4(), mt = this._tm2 ||= new THREE.Matrix4(), mr = this._tm3 ||= new THREE.Matrix4(), q = this._tq ||= new THREE.Quaternion(), q2 = this._tq2 ||= new THREE.Quaternion(), v = this._tv ||= new THREE.Vector3(), s = this._ts ||= new THREE.Vector3(TANK_SCALE, TANK_SCALE, TANK_SCALE);
    const Y = this._Y, X = this._X, Z = this._Z, red = this._r, white = this._w, wreck = this._wk, D = DOWN_T;
    let y = heightAt(u.x, u.z), col = white, alpha = 1;
    q.setFromAxisAngle(Y, u.yaw);
    if (u.alive) { if (u.moving) y += Math.sin(u.phase * 2) * 0.03; if (u.hurtT > 0) col = red; if (u.stunT > 0 && Math.sin(performance.now() / 60) > 0) col = this._stun ||= new THREE.Color(0.6, 0.85, 1.4); }
    else { q2.setFromAxisAngle(X, 0.1); q.multiply(q2); q2.setFromAxisAngle(Z, 0.14); q.multiply(q2); y -= 0.15; col = wreck; alpha = u.deadT < D.lie ? 1 : Math.max(0, 1 - (u.deadT - D.lie) / (D.fade - D.lie)); }
    m.compose(v.set(u.x, y, u.z), q, s);
    // turret yaw (local): toward the target, eased; a wreck keeps its last angle
    const want = u.alive && u.tgt && u.tgt.alive ? Math.atan2(u.tgt.x - u.x, u.tgt.z - u.z) - u.yaw : 0;
    if (u.alive) { let d = want - (u._ty || 0); d = Math.atan2(Math.sin(d), Math.cos(d)); u._ty = (u._ty || 0) + d * 0.15; }
    const P = TANK_PIVOT.turret, back = (this._tm4 ||= new THREE.Matrix4()).makeTranslation(-P[0], -P[1], -P[2]);
    mt.makeTranslation(P[0], P[1], P[2]).multiply(mr.makeRotationY(u._ty || 0)).multiply(back);
    const k = tcounts[u.tk]++;
    for (const im of Object.values(T.hull)) { im.setMatrixAt(k, m); im.setColorAt(k, col); im.geometry.attributes.iAlpha.setX(k, alpha); }
    mr.copy(m).multiply(mt);
    for (const im of Object.values(T.tur)) { im.setMatrixAt(k, mr); im.setColorAt(k, col); im.geometry.attributes.iAlpha.setX(k, alpha); }
    if (u.alive) { const s3 = this._ts3 ||= new THREE.Vector3(3.4, 3.4, 3.4); m.compose(v.set(u.x, heightAt(u.x, u.z) + 0.12, u.z), q.identity(), s3); A.mk.setMatrixAt(mks[u.team]++, m); }
  }
  syncMines(sim) {
    const M = this.mineMesh, list = sim.mines || [], m = this._mm ||= new THREE.Matrix4(), c = this._mc ||= new THREE.Color(), blink = Math.sin(performance.now() / 180) > 0;
    let n = 0;
    for (const mi of list) { if (n >= 32) break; m.makeTranslation(mi.x, heightAt(mi.x, mi.z) + 0.1, mi.z); M.setMatrixAt(n, m); M.setColorAt(n, c.set(TEAM_COLOR[mi.team]).multiplyScalar(blink ? 1 : 0.55)); n++; }
    M.count = n; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
  }
  syncRally(sim) {
    const R = sim.teams[0].rally;
    this.rally.visible = !!R;
    if (R) { this.rally.position.set(R.x, heightAt(R.x, R.z), R.z); this.rally.children[1].rotation.y = Math.sin(performance.now() / 500) * 0.4; }
  }
  syncFx(dt) {
    const F = this.fx, pos = this.tracerLines.geometry.attributes.position, col = this.tracerLines.geometry.attributes.color, c = this._c ||= new THREE.Color();
    F.tracers = F.tracers.filter((t) => (t.t += dt) < t.T);
    let n = 0;
    for (const t of F.tracers) {
      const a = 1 - t.t / t.T; c.set(t.type === 'heal' ? '#7dff8a' : t.laser ? (t.team ? '#ff6a5a' : '#6ad8ff') : (t.team ? '#ffb27a' : '#bff0ff')).multiplyScalar(a);
      pos.setXYZ(n * 2, t.x0, t.y0, t.z0); pos.setXYZ(n * 2 + 1, t.x1, t.y1, t.z1); col.setXYZ(n * 2, c.r * 0.4, c.g * 0.4, c.b * 0.4); col.setXYZ(n * 2 + 1, c.r, c.g, c.b); n++;
    }
    this.tracerLines.geometry.setDrawRange(0, n * 2); pos.needsUpdate = col.needsUpdate = true;
    const m = this._fm ||= new THREE.Matrix4(), v = this._fv ||= new THREE.Vector3(), q = this._fq ||= new THREE.Quaternion(), s = this._fs ||= new THREE.Vector3();
    F.rockets = F.rockets.filter((r) => (r.t += dt) < r.T);
    F.rockets.forEach((r, i) => { const f = r.t / r.T; v.set(r.x0 + (r.x1 - r.x0) * f, r.y0 + (r.y1 - r.y0) * f + Math.sin(f * Math.PI) * 2.5, r.z0 + (r.z1 - r.z0) * f); m.compose(v, q, s.set(1, 1, 1)); this.rocketMesh.setMatrixAt(i, m); });
    this.rocketMesh.count = F.rockets.length; this.rocketMesh.instanceMatrix.needsUpdate = true;
    F.booms = F.booms.filter((b) => (b.t += dt) < 0.55);
    F.booms.forEach((b, i) => { const f = b.t / 0.55, r = (0.8 + f * 3.4) * (b.big ? 1.8 : b.small ? 0.6 : 1); m.compose(v.set(b.x, b.y + r * 0.3, b.z), q, s.set(r, r * 0.8, r)); this.boomMesh.setMatrixAt(i, m); });
    this.boomMesh.count = F.booms.length; this.boomMesh.instanceMatrix.needsUpdate = true;
    this.boomMesh.material.opacity = 0.7;
  }
  clearFx() { this.fx.tracers = []; this.fx.rockets = []; this.fx.booms = []; }
  // ---------- camera ----------
  updateCamera(dt) {
    const C = this.cam;
    if (C.want) { const k = Math.min(1, dt * 5); C.x += (C.want.x - C.x) * k; C.z += (C.want.z - C.z) * k; if (Math.hypot(C.want.x - C.x, C.want.z - C.z) < 0.3) C.want = null; }
    C.x = Math.max(-MAP.hx, Math.min(MAP.hx, C.x)); C.z = Math.max(-MAP.hz - 10, Math.min(MAP.hz + 10, C.z));
    C.dist = Math.max(28, Math.min(this.camMax || 170, C.dist));
    // fog + far plane follow the zoom so a zoomed-out overview still shows the ground (Dust Ridge at normal zoom: 160-330 m as before)
    const F = this.scene.fog, near = Math.max(this.fogNear, C.dist * 1.2), far = Math.max(this.fogFar, near + this.fogFar - this.fogNear);
    if (F.near !== near || F.far !== far) { F.near = near; F.far = far; }
    const cf = Math.max(600, far + 60); if (this.camera.far !== cf) { this.camera.far = cf; this.camera.updateProjectionMatrix(); }
    const h = Math.sin(C.pitch) * C.dist, b = Math.cos(C.pitch) * C.dist;
    this.camera.position.set(C.x - Math.sin(C.yaw) * b, h + 2, C.z + Math.cos(C.yaw) * b);
    this.camera.lookAt(C.x, 1, C.z);
  }
  pan(dxPx, dyPx) { // screen drag → ground move
    const C = this.cam, k = C.dist * 0.0021 * (900 / Math.max(500, this.h));
    const cx = Math.cos(C.yaw), sx = Math.sin(C.yaw);
    C.x -= (dxPx * cx - dyPx * sx * 1) * k; C.z -= (dxPx * sx + dyPx * cx) * k; C.want = null;
  }
  panWorld(dx, dz) { const C = this.cam, cx = Math.cos(C.yaw), sx = Math.sin(C.yaw); C.x += dx * cx - dz * sx; C.z += dx * sx + dz * cx; C.want = null; }
  focus(x, z, dist) { this.cam.want = { x, z }; if (dist) this.cam.dist = dist; }
  pick(clientX, clientY) {
    const rc = this._rc ||= new THREE.Raycaster(), rect = this.renderer.domElement.getBoundingClientRect();
    rc.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const hit = rc.intersectObject(this.ground, false)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }
  // ground footprint of the view (4 screen corners → y = 0 plane), for the minimap
  footprint() {
    const rc = this._rc ||= new THREE.Raycaster(), pl = this._pl ||= new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out = [], v = this._fp ||= new THREE.Vector3();
    for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      rc.setFromCamera(new THREE.Vector2(sx, sy), this.camera);
      const hit = rc.ray.intersectPlane(pl, v);
      if (hit) out.push({ x: hit.x, z: hit.z }); else { const d = rc.ray.direction; out.push({ x: this.camera.position.x + d.x * 2000, z: this.camera.position.z + d.z * 2000 }); }
    }
    return out;
  }
  project(x, y, z) {
    const v = (this._pv ||= new THREE.Vector3()).set(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, behind: v.z > 1 };
  }
  resize() {
    const el = this.renderer.domElement.parentElement, w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight;
    this.w = w; this.h = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    this.camera.fov = w < h ? 58 : 42; this.camera.updateProjectionMatrix();
  }
  stats() { const i = this.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; }
}

// small offscreen thumbnail renderer for the start screen
let thumbR = null;
export function lookThumb(nation, st, size = 96) {
  try {
    if (!thumbR) {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setSize(size, size, false); r.outputColorSpace = THREE.SRGBColorSpace;
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight('#ffffff', '#555555', 1.8)); const d = new THREE.DirectionalLight('#fff', 1.6); d.position.set(2, 4, 3); sc.add(d);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); cam.position.set(1.6, 1.5, 3.4); cam.lookAt(0, 0.95, 0);
      thumbR = { r, sc, cam, looks: new Map() };
    }
    const key = JSON.stringify(nation);
    let look = thumbR.looks.get(key);
    if (!look) { look = new TeamLook(); look.paint({ ...nation, skin: st.skin }); thumbR.looks.set(key, look); }
    look.paint({ ...nation, skin: st.skin });
    const geo = buildMergedDef(TROOPER, st), meshes = [];
    if (geo.team) meshes.push(new THREE.Mesh(geo.team, look.team));
    if (geo.visor) meshes.push(new THREE.Mesh(geo.visor, look.visor));
    meshes.forEach((m) => { m.rotation.y = 0.5; thumbR.sc.add(m); });
    thumbR.r.render(thumbR.sc, thumbR.cam);
    const url = thumbR.r.domElement.toDataURL('image/png');
    meshes.forEach((m) => { thumbR.sc.remove(m); m.geometry.dispose(); });
    return url;
  } catch (e) { return ''; }
}
export function disposeThumbs() { if (thumbR) { thumbR.r.dispose(); thumbR.r.forceContextLoss?.(); thumbR = null; } }
