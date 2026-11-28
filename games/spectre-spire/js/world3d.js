// Three.js view: renderer, the merged static floor, and everything that moves (drawn from snapshots).
import * as THREE from 'three';
import { HUNTERS, GHOSTS, T } from './config.js';
import { GHOST_KINDS } from './sim.js';
import { makeHunter, makeGhost, makeLoot, makeGuest, makeCage, makeViewGun, makeBeamCone } from './models.js';
import { flowField, flowDir } from './tower.js';

export class View {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // keeps flashlight hot spots from blowing out
    this.renderer.toneMappingExposure = 1.25;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x150b1f);
    this.scene.fog = new THREE.Fog(0x150b1f, 9, 30);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xd9c4ff, 0x7a5a90, 1.9); this.scene.add(this.hemi);
    const dir = new THREE.DirectionalLight(0xffe2c0, 0.7); dir.position.set(0.4, 1, 0.25); this.scene.add(dir);
    // the player's own flashlight
    this.flash = new THREE.SpotLight(0xfff1c8, 15, 20, 0.46, 0.6, 1.4);
    this.flash.position.set(0, -0.05, -0.75); this.camera.add(this.flash); // in front of the gun so it does not light it
    this.flash.target.position.set(0, -0.1, -6); this.camera.add(this.flash.target);
    // two shared spotlights follow the nearest teammates' flashlights
    this.mateLights = [0, 1].map(() => { const l = new THREE.SpotLight(0xfff1c8, 14, 14, 0.42, 0.6, 1.6); this.scene.add(l, l.target); l.visible = false; return l; });
    this.cabLight = new THREE.PointLight(0xffd9a0, 6, 8, 1.6); this.scene.add(this.cabLight);
    this.gun = null;
    this.static = null;
    this.ghosts = new Map(); this.loot = new Map(); this.hunters = new Map(); this.cages = new Map(); this.guests = new Map(); this.wards = [];
    this.tmp = new THREE.Vector3();
    this.path = null; this.pathT = 0;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  setGun(color) {
    if (this.gun) this.camera.remove(this.gun);
    this.gun = makeViewGun(color);
    this.gun.scale.setScalar(0.45);
    this.gun.position.set(0.26, -0.25, -0.55);
    this.camera.add(this.gun);
  }

  // ---------- static floor merged into one vertex-coloured mesh
  buildFloor(floor) {
    this.clearFloor();
    this.floor = floor;
    const tpl = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const tp = tpl.attributes.position.array, tn = tpl.attributes.normal.array, nv = tp.length / 3;
    const count = floor.boxes.length;
    const pos = new Float32Array(count * nv * 3), nor = new Float32Array(count * nv * 3), col = new Float32Array(count * nv * 3);
    const c = new THREE.Color();
    floor.boxes.forEach((b, k) => {
      c.set(b.c);
      // tiny per-box tint keeps big flat walls from looking plastic
      const jitter = 1 + (((k * 7919) % 13) / 13 - 0.5) * 0.06;
      for (let i = 0; i < nv; i++) {
        const o = (k * nv + i) * 3;
        pos[o] = b.x + tp[i * 3] * b.sx; pos[o + 1] = b.y + tp[i * 3 + 1] * b.sy; pos[o + 2] = b.z + tp[i * 3 + 2] * b.sz;
        nor[o] = tn[i * 3]; nor[o + 1] = tn[i * 3 + 1]; nor[o + 2] = tn[i * 3 + 2];
        col[o] = c.r * jitter; col[o + 1] = c.g * jitter; col[o + 2] = c.b * jitter;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    this.static = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.static);
    // lamp glows: small unlit blobs, no extra lights (phone friendly)
    const gg = new THREE.SphereGeometry(0.13, 8, 6), gm = new THREE.MeshBasicMaterial({ color: 0xffd98a });
    this.glows = new THREE.InstancedMesh(gg, gm, Math.max(1, floor.glows.length));
    const m = new THREE.Matrix4();
    floor.glows.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); this.glows.setMatrixAt(i, m); });
    this.glows.count = floor.glows.length;
    this.scene.add(this.glows);
    // elevator sign and light
    const e = floor.elevator, cab = floor.cab;
    this.cabLight.position.set(cab.x, T.wallH - 0.5, cab.z0 + cab.d / 2);
    this.sign = makeSign('ELEVATOR');
    this.sign.position.set(cab.x, T.wallH - 0.45, cab.z0 - 0.25);
    this.scene.add(this.sign);
    this.zoneRing = new THREE.Mesh(new THREE.PlaneGeometry(e.maxx - e.minx, e.maxz - e.minz).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.18, depthWrite: false }));
    this.zoneRing.position.set((e.minx + e.maxx) / 2, 0.05, (e.minz + e.maxz) / 2);
    this.scene.add(this.zoneRing);
    for (const cg of floor.cages) {
      const m3 = makeCage(); m3.position.set(cg.x, 0, cg.z); this.scene.add(m3);
      const guest = makeGuest(); guest.position.set(cg.x, 0.12, cg.z); this.scene.add(guest);
      this.cages.set(cg.id, { mesh: m3, guest, x: cg.x, z: cg.z });
    }
  }

  clearFloor() {
    const rm = (o) => { if (o) { this.scene.remove(o); } };
    rm(this.static); rm(this.glows); rm(this.sign); rm(this.zoneRing);
    if (this.static) this.static.geometry.dispose();
    for (const m of [this.ghosts, this.loot, this.cages, this.guests]) { for (const v of m.values()) { rm(v.mesh); rm(v.guest); } m.clear(); }
    this.wards.forEach((w) => rm(w)); this.wards = [];
    if (this.path) { rm(this.path); this.path = null; }
  }

  // ---------- dynamic things from a (possibly interpolated) snapshot
  sync(snap, me, dt, t, opts) {
    const reveal = snap.rv > 0;
    // ghosts
    const seen = new Set();
    for (const g of snap.g) {
      const [id, ki, x, y, z, face, st, cap, hp, acc] = g;
      seen.add(id);
      let o = this.ghosts.get(id);
      const kind = GHOST_KINDS[ki];
      if (!o) { const mesh = makeGhost(kind, GHOSTS[kind]); this.scene.add(mesh); o = { mesh, kind, wob: Math.random() * 6 }; this.ghosts.set(id, o); }
      o.wob += dt;
      const m = o.mesh, u = m.userData;
      m.position.set(x, y, z);
      let df = face - m.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); m.rotation.y += df * Math.min(1, dt * 8);
      const stunned = st & 1, sucked = st & 2, wind = st & 4, swoop = st & 8;
      let sx = 1 + Math.sin(o.wob * 3) * 0.05, sy = 1 - Math.sin(o.wob * 3) * 0.05, sz = 1;
      if (wind) { sx = 1.2; sy = 0.8; m.position.x += Math.sin(t * 60) * 0.06; }
      if (swoop) { sz = 1.5; sx = 0.8; sy = 0.85; }
      if (sucked) { const k = cap / 100; sx = sy = 1 - k * 0.55; sz = 1 + 0.6 + k; m.position.x += Math.sin(t * 50) * 0.05 * (1 - k); }
      u.inner.scale.set(sx, sy, sz);
      u.stars.visible = !!stunned; u.stars.rotation.y += dt * 5;
      const glow = stunned ? 0.15 : wind ? 1.0 : 0.35 + (acc / 100) * 0.8;
      u.m.emissiveIntensity = glow;
      u.m.color.copy(u.baseColor); if (wind) u.m.color.lerp(new THREE.Color(0xff5070), 0.6); if (stunned) u.m.color.lerp(new THREE.Color(0xffffff), 0.4);
      u.eL.scale.y = u.eR.scale.y = (stunned ? 0.35 : 1.3) * GHOSTS[kind].size;
      u.m.depthTest = !reveal; m.renderOrder = reveal ? 10 : 0;
      o.st = st; o.cap = cap; o.hp = hp;
    }
    for (const [id, o] of this.ghosts) if (!seen.has(id)) { this.scene.remove(o.mesh); this.ghosts.delete(id); }

    // loot
    seen.clear();
    for (const l of snap.l) {
      const [id, x, y, z, ry, value, holders, inZone] = l;
      seen.add(id);
      let o = this.loot.get(id);
      const kind = this.floor.loot[id] ? this.floor.loot[id].kind : 'vase';
      if (!o) { const mesh = makeLoot(kind); this.scene.add(mesh); o = { mesh, kind }; this.loot.set(id, o); }
      const pred = opts.heldPred && opts.heldPred.id === id ? opts.heldPred : null;
      if (pred) { o.mesh.position.lerp(this.tmp.set(pred.x, pred.y, pred.z), Math.min(1, dt * 18)); }
      else o.mesh.position.set(x, y, z);
      o.mesh.rotation.y = ry;
      o.value = value; o.holders = holders; o.inZone = inZone;
      o.mesh.traverse((c) => { if (c.isMesh) { c.renderOrder = reveal ? 9 : 0; } });
    }
    for (const [id, o] of this.loot) if (!seen.has(id)) { this.scene.remove(o.mesh); this.loot.delete(id); }

    // other hunters (not me) as toy figures
    seen.clear();
    let mates = [];
    for (const pid of Object.keys(snap.h)) {
      if (pid === me) continue;
      const h = snap.h[pid];
      const [, hi, , hp, down, , turbo, , , , x, y, z, yaw, pitch, suck] = h;
      seen.add(pid);
      let o = this.hunters.get(pid);
      if (!o) {
        const mesh = makeHunter(HUNTERS[hi].color); this.scene.add(mesh);
        const cone = makeBeamCone(); cone.position.set(0, 1.5, 0); mesh.add(cone);
        o = { mesh, cone, hi, walk: 0, lx: x, lz: z }; this.hunters.set(pid, o);
      }
      const moved = Math.hypot(x - o.lx, z - o.lz); o.lx = x; o.lz = z;
      o.walk += moved * 4;
      const m = o.mesh, u = m.userData;
      m.position.set(x, y, z); m.rotation.y = yaw;
      u.body.rotation.x = down ? -Math.PI / 2 * 0.95 : 0;
      u.body.position.y = down ? 0.25 : Math.abs(Math.sin(o.walk)) * 0.08;
      u.body.position.z = down ? 0.6 : 0;
      u.armL.rotation.x = Math.sin(o.walk) * 0.6;
      o.cone.visible = !down; o.cone.rotation.x = pitch;
      o.cone.material.opacity = suck ? 0.09 : 0.04;
      u.ring.material.opacity = down ? 0.35 : 0.85;
      o.suck = suck && !down; o.down = down; o.hp = hp; o.turbo = turbo;
      if (!down) mates.push({ x, y, z, yaw, pitch, d: 0 });
    }
    for (const [pid, o] of this.hunters) if (!seen.has(pid)) { this.scene.remove(o.mesh); this.hunters.delete(pid); }
    // nearest teammates get a real spotlight
    const cp = this.camera.position;
    mates.forEach((m2) => { m2.d = Math.hypot(m2.x - cp.x, m2.z - cp.z); });
    mates.sort((a, b) => a.d - b.d);
    this.mateLights.forEach((l, i) => {
      const m2 = mates[i]; l.visible = !!m2 && m2.d < 22;
      if (!l.visible) return;
      const cpch = Math.cos(m2.pitch);
      l.position.set(m2.x, m2.y + 1.45, m2.z);
      l.target.position.set(m2.x - Math.sin(m2.yaw) * cpch * 5, m2.y + 1.45 + Math.sin(m2.pitch) * 5, m2.z - Math.cos(m2.yaw) * cpch * 5);
    });

    // cages and guests
    for (const [id, prog, freed] of snap.c || []) {
      const c = this.cages.get(id); if (!c) continue;
      c.prog = prog; c.freed = freed;
      if (freed) { c.mesh.position.y = Math.max(-2.2, c.mesh.position.y - dt * 3); c.guest.visible = false; }
      else { c.guest.position.y = 0.12 + Math.abs(Math.sin(t * 4 + id)) * 0.12; c.guest.rotation.y = Math.sin(t * 2 + id) * 0.5; }
    }
    seen.clear();
    for (const [id, x, z, safe] of snap.gu || []) {
      seen.add(id);
      let o = this.guests.get(id);
      if (!o) { const mesh = makeGuest(); this.scene.add(mesh); o = { mesh, lx: x, lz: z }; this.guests.set(id, o); }
      const dx = x - o.lx, dz = z - o.lz; if (Math.hypot(dx, dz) > 0.001) o.mesh.rotation.y = Math.atan2(dx, dz);
      o.lx = x; o.lz = z;
      o.mesh.position.set(x, safe ? Math.abs(Math.sin(t * 6 + id)) * 0.3 : Math.abs(Math.sin(t * 10)) * 0.06, z);
    }
    for (const [id, o] of this.guests) if (!seen.has(id)) { this.scene.remove(o.mesh); this.guests.delete(id); }

    // wards
    const wl = snap.w || [];
    while (this.wards.length < wl.length) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0x66b8ff, transparent: true, opacity: 0.45, depthWrite: false, wireframe: true }));
      this.scene.add(m); this.wards.push(m);
    }
    while (this.wards.length > wl.length) this.scene.remove(this.wards.pop());
    wl.forEach(([x, z, tl, r], i) => { const m = this.wards[i]; m.position.set(x, 0.2, z); const s = r * (1 + Math.sin(t * 6) * 0.03) * Math.min(1, tl * 2); m.scale.set(s, s * 0.85, s); });

    // elevator: purple until the quota is met, then green
    const ready = snap.col >= opts.quota && snap.boss;
    this.cabLight.color.set(ready ? 0x7dffa8 : 0xffd9a0);
    this.cabLight.intensity = ready ? 9 + Math.sin(t * 6) * 3 : 6;
    this.zoneRing.material.color.set(ready ? 0x7dffa8 : 0xffd34d);
    this.zoneRing.material.opacity = 0.14 + Math.sin(t * 3) * 0.06;
  }

  // breadcrumb trail from the player to the elevator (guide button and Lantern)
  showPath(fromX, fromZ, seconds) {
    const f = this.floor; if (!f) return;
    if (!this.elevFlow) this.elevFlow = flowField(f, f.elevator.x, f.elevator.z);
    const pts = []; let x = fromX, z = fromZ;
    for (let i = 0; i < 400; i++) {
      const d = flowDir(f, this.elevFlow, x, z); if (!d || d.at) break;
      x += d.x * 0.25; z += d.z * 0.25; if (i % 4 === 0) pts.push(x, 0.12, z);
    }
    if (this.path) this.scene.remove(this.path);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.path = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffe066, size: 0.22, transparent: true, depthTest: false, opacity: 0.95 }));
    this.path.renderOrder = 11;
    this.scene.add(this.path); this.pathT = seconds;
  }
  updatePath(dt) { if (this.path) { this.pathT -= dt; this.path.material.opacity = Math.min(1, this.pathT) * (0.7 + Math.sin(performance.now() / 150) * 0.3); if (this.pathT <= 0) { this.scene.remove(this.path); this.path = null; } } }

  render() { this.renderer.render(this.scene, this.camera); }
}

function makeSign(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2b1238'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#f2c94c'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#ffe48a'; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({ map: tex }));
  m.rotation.y = Math.PI; // faces into the start room (-z side)
  return m;
}
