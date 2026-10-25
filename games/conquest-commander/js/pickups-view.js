// Draws the ❤️ / 📦 packs (pickups.js) and the overhead icons (🧠 brain act, ❤️/📦 heading to a pack, 🔄 reloading).
// Called once per frame by View.update (hook2: `if (PICKUPS.on) syncPickups(this, sim);`). Owns its own THREE.Group,
// rebuilt for each new battle (new Sim); hidden in menus (sim = null). Nothing here touches the sim.
// v2.4b: instanced. All packs = 2 draw calls (crates, rings), all overhead icons = 1, pickup flashes = 1 (only while one
// plays). One emoji/crate atlas texture; each instance picks its cell with a per-instance `aSlot`. Taken packs are hidden
// with a zero-scale matrix (no meshes added/removed per frame). A pack whose drawing would sit under a post badge
// (HTML, drawn on top) slides sideways along the ring, on screen only (the pick-up spot in the sim does not move).
import * as THREE from 'three';
import { heightAt } from './map.js';
import { PICKUPS } from './pickups.js';

const COLOR = { health: '#e0413b', ammo: '#d8a21a' };
const ICON = { health: 0, ammo: 1, heal: 0, reload: 2, cover: 3 };     // atlas cell per icon; capture / follow / shoot: no icon
const CRATE = { health: 4, ammo: 5 };                                  // atlas cell per crate kind
const EMOJI = ['❤️', '📦', '🔄', '🧱'], SLOTS = 6, CELL = 64;
const PACK_ICON = { y: 2.25, s: 2.2 }, UNIT_ICON = { y: 4.0, s: 1.9 };   // pack icon sits just above the crate (was 2.6 m up, 2.6 m wide)
const BADGE = { l: 23, r: 35, t: 56, b: 15, pad: 6 };                    // .badge box around its anchor (46 px circle + 🎯/⭐ extras), px

let atlas = null;
function atlasTex() {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = CELL * SLOTS; c.height = CELL;
  const g = c.getContext('2d');
  EMOJI.forEach((e, i) => {
    const x = i * CELL;
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.arc(x + 32, 32, 29, 0, Math.PI * 2); g.fill();
    g.font = '38px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#000'; g.fillText(e, x + 32, 35);
  });
  ['health', 'ammo'].forEach((k, i) => {                                 // crate cells: off-white box with the coloured band
    const x = (4 + i) * CELL;
    g.fillStyle = '#f2f0ea'; g.fillRect(x, 0, CELL, CELL);
    g.fillStyle = COLOR[k]; g.fillRect(x, CELL * 0.34, CELL, CELL * 0.32);
  });
  atlas = new THREE.CanvasTexture(c); atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = false; atlas.minFilter = THREE.LinearFilter;   // no mip bleed between cells
  return atlas;
}
function atlasMaterial(mat, key) {                                        // map uv.x → cell aSlot of the atlas
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSlot;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv.x = (vMapUv.x + aSlot) / ${SLOTS}.0;\n#endif`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
function instanced(geo, mat, n) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; return m;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3(0, 0, 0);

function build(view, sim) {
  const st = PICKUPS.state(sim), root = new THREE.Group(); root.name = 'pickups';
  const n = st.packs.length, tex = atlasTex();
  // crates: one InstancedMesh for both kinds (box uv: sides = crate cell, top/bottom = plain off-white part of it)
  const box = new THREE.BoxGeometry(1.5, 1.0, 1.5); box.translate(0, 0.6, 0);
  const uv = box.attributes.uv; for (let i = 8; i < 16; i++) uv.setXY(i, 0.5, 0.95);
  box.setAttribute('aSlot', new THREE.InstancedBufferAttribute(new Float32Array(st.packs.map((k) => CRATE[k.kind])), 1));
  const crates = instanced(box, atlasMaterial(new THREE.MeshLambertMaterial({ color: '#ffffff', map: tex }), 'pk-crate'), n);
  // rings: one InstancedMesh, colour per instance (dim while the pack respawns)
  const ringGeo = new THREE.RingGeometry(1.35, 1.65, 28); ringGeo.rotateX(-Math.PI / 2); ringGeo.translate(0, 0.08, 0);
  const rings = instanced(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }), n);
  // icons: one InstancedMesh of camera-facing quads (pack icons first, then unit icons); grows if a battle needs more
  const cap = n + Math.max(64, sim.units.length + 16);
  const icons = makeIcons(cap, tex);
  st.packs.forEach((k, i) => { rings.setColorAt(i, _c.set(COLOR[k.kind])); icons.geometry.attributes.aSlot.setX(i, ICON[k.kind]); });
  rings.instanceColor.needsUpdate = true;
  // flashes: a ring that grows and fades for 1 s where a pack was taken (one InstancedMesh, hidden when none plays)
  const fGeo = new THREE.RingGeometry(0.6, 1.0, 24); fGeo.rotateX(-Math.PI / 2);
  const flashes = instanced(fGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }), 16);
  flashes.setColorAt(0, _c.set('#ffffff')); flashes.count = 0; flashes.visible = false;
  root.add(crates, rings, icons, flashes);
  view.scene.add(root);
  return { sim, root, crates, rings, icons, flashes, cap, off: new Float32Array(n), base: st.packs.map((k) => heightAt(k.x, k.z)), fl: [], seen: new WeakSet() };
}
function makeIcons(cap, tex) {
  const q = new THREE.PlaneGeometry(1, 1);
  q.setAttribute('aSlot', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
  const m = instanced(q, atlasMaterial(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }), 'pk-icon'), cap);
  m.renderOrder = 6; return m;
}
function dispose(P) {
  for (const m of [P.crates, P.rings, P.icons, P.flashes]) { m.geometry.dispose(); m.material.dispose(); m.dispose && m.dispose(); }
}

// screen-space nudge: how far (world m, along the camera's right) a pack must slide so it clears every post badge
function badgeNudge(view, sim, x, y, z, rx, rz) {
  const g = view.project(x, y, z); if (g.behind) return 0;
  const r = view.project(x + rx, y, z + rz), ppu = Math.hypot(r.x - g.x, r.y - g.y); if (!(ppu > 0.01)) return 0;
  const half = Math.max(1.1, PACK_ICON.s / 2) * ppu, top = view.project(x, y + PACK_ICON.y + PACK_ICON.s / 2 + 0.3, z).y, bot = g.y + 0.4 * ppu;
  let shift = 0;
  for (const p of sim.posts) {
    const a = view.project(p.x, heightAt(p.x, p.z) + 9.5, p.z); if (a.behind) continue;   // same anchor main.js uses for .badge
    const L = a.x - BADGE.l - BADGE.pad, R = a.x + BADGE.r + BADGE.pad, T = a.y - BADGE.t - BADGE.pad, B = a.y + BADGE.b + BADGE.pad;
    const x0 = g.x + shift * ppu - half, x1 = g.x + shift * ppu + half;
    if (bot < T || top > B || x1 < L || x0 > R) continue;
    shift += (g.x + shift * ppu >= a.x - half * 0.5) ? (R - x0) / ppu : -(x1 - L) / ppu;   // slide to the nearer free side (right by default)
  }
  return shift;
}

export function syncPickups(view, sim) {
  let P = view.__pickups;
  if (P && P.sim !== sim) { view.scene.remove(P.root); dispose(P); P = view.__pickups = null; }
  if (!sim) return;
  if (!P) P = view.__pickups = build(view, sim);
  const t = sim.time, st = PICKUPS.state(sim), cam = view.camera;
  cam.updateMatrixWorld();
  const yaw = view.cam ? view.cam.yaw : 0, rx = Math.cos(yaw), rz = Math.sin(yaw);      // camera right on the ground
  // packs
  st.packs.forEach((k, i) => {
    const y = P.base[i], on = k.active;
    const off = P.off[i] = badgeNudge(view, sim, k.x, y, k.z, rx, rz);
    const x = k.x + rx * off, z = k.z + rz * off;
    _q.setFromAxisAngle(_up, t * 0.6 + k.id);
    P.crates.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, on ? _s.set(1, 1, 1) : ZERO));
    P.rings.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.identity(), _s.set(1, 1, 1)));
    P.rings.setColorAt(i, _c.set(COLOR[k.kind]).multiplyScalar(on ? 1 : 0.35));        // ring stays (dim) while the pack respawns
    const ps = on ? PACK_ICON.s : 0;
    P.icons.setMatrixAt(i, _m.compose(_p.set(x, y + PACK_ICON.y + Math.sin(t * 2 + k.id) * 0.2, z), cam.quaternion, _s.set(ps, ps, 1)));
  });
  P.crates.instanceMatrix.needsUpdate = P.rings.instanceMatrix.needsUpdate = P.rings.instanceColor.needsUpdate = true;
  // overhead icons: any unit heading to a pack (❤️/📦) or reloading (🔄); player brain units also show 🧱 cover
  const np = st.packs.length;
  let n = np;
  for (const u of sim.units) {
    if (!u.alive) continue;
    let e = null;
    if (u.reloadAt >= 0) e = 'reload';
    else if (u.pkGoal) e = u.pkGoal;
    else if (u.team === 0 && u.brainAct) e = u.brainAct;
    if (!e || ICON[e] === undefined) continue;
    if (n >= P.cap) {                                                     // more icons than room: grow once (rare)
      const old = P.icons, cap = P.cap * 2, m = makeIcons(cap, atlasTex());
      for (let i = 0; i < np; i++) { old.getMatrixAt(i, _m); m.setMatrixAt(i, _m); m.geometry.attributes.aSlot.setX(i, old.geometry.attributes.aSlot.getX(i)); }
      P.root.remove(old); old.geometry.dispose(); old.material.dispose(); P.root.add(m); P.icons = m; P.cap = cap;
      return syncPickups(view, sim);
    }
    P.icons.geometry.attributes.aSlot.setX(n, ICON[e]);
    P.icons.setMatrixAt(n, _m.compose(_p.set(u.x, heightAt(u.x, u.z) + UNIT_ICON.y, u.z), cam.quaternion, _s.set(UNIT_ICON.s, UNIT_ICON.s, 1))); n++;
  }
  P.icons.count = n; P.icons.instanceMatrix.needsUpdate = true; P.icons.geometry.attributes.aSlot.needsUpdate = true;
  // pickup flashes
  for (const f of st.flash) {
    if (t - f.t > 1 || P.seen.has(f)) continue;
    P.seen.add(f); P.fl.push(f);
  }
  P.fl = P.fl.filter((f) => { const a = t - f.t; return a >= 0 && a <= 1; }).slice(-16);
  P.fl.forEach((f, i) => {
    const a = t - f.t, sc = 1 + a * 3;
    P.flashes.setMatrixAt(i, _m.compose(_p.set(f.x, heightAt(f.x, f.z) + 0.15, f.z), _q.identity(), _s.set(sc, 1, sc)));
    P.flashes.setColorAt(i, _c.set(COLOR[f.kind]).multiplyScalar(1 - a * 0.75));
  });
  P.flashes.count = P.fl.length; P.flashes.visible = P.fl.length > 0;
  if (P.fl.length) { P.flashes.instanceMatrix.needsUpdate = true; P.flashes.instanceColor.needsUpdate = true; }
}
