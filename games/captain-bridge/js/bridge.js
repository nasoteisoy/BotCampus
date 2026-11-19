// The ship's bridge: a bright room with a big front window onto space, six department stations in a horseshoe,
// the captain's chair and a holo table showing the carrier. Walls and furniture are simple box colliders.
import * as THREE from 'three';
import { buildWorld, toon, RAMP, glowTex } from './space-world.js';
import { badgeTexture } from './icontex.js';
import { DEPTS } from './data.js';

export const ROOM = { x0: -10, x1: 10, z0: -7, z1: 7, h: 4.4 };
// station spots: console centre (x,z) and the yaw the officer faces (toward the console)
const STATIONS = {
  nav: { x: -2.3, z: -5.0, yaw: Math.PI },
  fly: { x: 2.3, z: -5.0, yaw: Math.PI },
  wpn: { x: -6.4, z: -3.6, yaw: Math.PI * 0.78 },
  sci: { x: 6.4, z: -3.6, yaw: -Math.PI * 0.78 },
  eng: { x: -8.3, z: 1.6, yaw: -Math.PI / 2 },
  med: { x: 8.3, z: 1.6, yaw: Math.PI / 2 },
};

function grid(c1, c2, n = 8, line = 3) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, 256, 256); g.strokeStyle = c2; g.lineWidth = line;
  for (let i = 0; i <= n; i++) { const p = i * 256 / n; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.moveTo(0, p); g.lineTo(256, p); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function buildBridge(models) {
  const scene = new THREE.Scene();
  buildWorld(scene, { ring: models.planets.ring.clone(), blue: models.planets.blue.clone() }); // same space outside the window
  
  const key = new THREE.PointLight(0xfff4e0, 18, 30, 1.6); key.position.set(0, 4, 1); scene.add(key);

  const colliders = [], camBlockers = [];
  const room = new THREE.Group(); scene.add(room);
  const add = (geo, mat, x, y, z, { col = false, cam = false, ry = 0 } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; room.add(m);
    if (cam) camBlockers.push(m);
    if (col) { m.updateMatrixWorld(); const b = new THREE.Box3().setFromObject(m); colliders.push({ x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z }); }
    return m;
  };
  const { x0, x1, z0, z1, h } = ROOM, W = x1 - x0, D = z1 - z0;
  const wallM = toon(0xdfe7f6), trimM = toon(0x5d7fd6), goldM = toon(0xffd23f), darkM = toon(0x2b3a6e);
  const glowM = new THREE.MeshBasicMaterial({ color: 0x8ff3ff });

  // floor + ceiling
  const fT = grid('#7f9ee0', '#a9c2f2', 10, 5); fT.repeat.set(W / 2, D / 2);
  const floor = add(new THREE.PlaneGeometry(W, D), new THREE.MeshToonMaterial({ map: fT, gradientMap: RAMP }), 0, 0, 0); floor.rotation.x = -Math.PI / 2;
  const walk = add(new THREE.RingGeometry(2.6, 3.0, 48), new THREE.MeshBasicMaterial({ color: 0x5fd8ff }), 0, 0.01, 0.6); walk.rotation.x = -Math.PI / 2;
  const ceil = add(new THREE.PlaneGeometry(W, D), toon(0x8fa6dc), 0, h, 0); ceil.rotation.x = Math.PI / 2;
  for (const x of [-6, 0, 6]) { const p = add(new THREE.PlaneGeometry(3.2, 9), new THREE.MeshBasicMaterial({ color: 0xfaffff }), x, h - 0.02, 0); p.rotation.x = Math.PI / 2; }

  // back + side walls (solid, camera stops at them)
  add(new THREE.BoxGeometry(W, h, 0.3), wallM, 0, h / 2, z1 + 0.15, { cam: true });
  add(new THREE.BoxGeometry(0.3, h, D), wallM, x0 - 0.15, h / 2, 0, { cam: true });
  add(new THREE.BoxGeometry(0.3, h, D), wallM, x1 + 0.15, h / 2, 0, { cam: true });
  // wall trims + glow strips
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.08, D), glowM, s * (W / 2 - 0.02), 1.1, 0);
    add(new THREE.BoxGeometry(0.1, 0.5, D), trimM, s * (W / 2 - 0.04), 0.25, 0);
  }
  add(new THREE.BoxGeometry(W, 0.08, 0.06), glowM, 0, 1.1, z1 - 0.02);
  // back door (closed) with a gold frame
  add(new THREE.BoxGeometry(2.4, 3.0, 0.12), darkM, 0, 1.5, z1 - 0.06);
  add(new THREE.BoxGeometry(2.8, 0.2, 0.16), goldM, 0, 3.1, z1 - 0.08);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.2, 3.1, 0.16), goldM, s * 1.3, 1.55, z1 - 0.08);
  // front wall: low sill, big window, top header, mullions (only the sill + header are solid)
  add(new THREE.BoxGeometry(W, 0.9, 0.5), trimM, 0, 0.45, z0 - 0.25, { cam: true });
  add(new THREE.BoxGeometry(W, 0.6, 0.5), trimM, 0, h - 0.3, z0 - 0.25, { cam: true });
  for (let i = 0; i <= 6; i++) add(new THREE.BoxGeometry(0.22, h, 0.4), wallM, x0 + 0.1 + i * (W - 0.2) / 6, h / 2, z0 - 0.2, { cam: true });
  const glass = add(new THREE.PlaneGeometry(W, h), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.08, depthWrite: false }), 0, h / 2, z0 - 0.3);
  glass.renderOrder = 4;
  // pillars in the corners
  for (const [x, z] of [[x0 + 0.5, z1 - 0.5], [x1 - 0.5, z1 - 0.5], [x0 + 0.5, z0 + 0.5], [x1 - 0.5, z0 + 0.5]]) {
    add(new THREE.BoxGeometry(1.0, h, 1.0), wallM, x, h / 2, z, { col: true, cam: true });
    add(new THREE.BoxGeometry(1.04, 0.1, 1.04), glowM, x, 2.6, z);
  }

  // captain's chair
  const chair = new THREE.Group(); chair.position.set(0, 0, 0.6); room.add(chair);
  const ch = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); chair.add(o); return o; };
  ch(new THREE.CylinderGeometry(0.5, 0.6, 0.35, 12), trimM, 0, 0.18, 0);
  ch(new THREE.BoxGeometry(0.9, 0.18, 0.85), toon(0x2f6bff), 0, 0.55, 0);
  ch(new THREE.BoxGeometry(0.9, 0.7, 0.16), toon(0x2f6bff), 0, 0.95, 0.42);
  ch(new THREE.BoxGeometry(0.95, 0.08, 0.2), goldM, 0, 1.32, 0.42);
  for (const s of [-1, 1]) ch(new THREE.BoxGeometry(0.14, 0.3, 0.8), goldM, s * 0.5, 0.75, 0);
  colliders.push({ x0: -0.6, x1: 0.6, z0: 0.1, z1: 1.15 });

  // holo table with a turning carrier hologram
  const holo = new THREE.Group(); holo.position.set(0, 0, -2.4); room.add(holo);
  { const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.9, 20), trimM); base.position.y = 0.45; holo.add(base); }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.08, 32), new THREE.MeshBasicMaterial({ color: 0x5fe0ff })); disc.position.y = 0.94; holo.add(disc);
  const hm = models.carrier.userData.hull.clone();
  hm.material = new THREE.MeshToonMaterial({ color: 0xbff6ff, vertexColors: true, gradientMap: RAMP, emissive: 0x1a6a8a, emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
  const hg = new THREE.Group(); hg.add(hm); hm.scale.setScalar(0.0075); hm.position.z = -0.25; hg.position.y = 1.35; holo.add(hg);
  const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(140,240,255,1)'), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.scale.set(2.6, 1.4, 1); beam.position.y = 1.4; holo.add(beam);
  colliders.push({ x0: -1.2, x1: 1.2, z0: -3.6, z1: -1.2 });

  // stations: console desk + angled screen with the department badge + a wall sign
  const stations = {};
  for (const d of DEPTS) {
    const S = STATIONS[d.id], g = new THREE.Group(); g.position.set(S.x, 0, S.z); g.rotation.y = S.yaw + Math.PI; room.add(g);
    const deptM = toon(d.color);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 0.7), wallM); desk.position.y = 0.425; g.add(desk);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.12, 0.72), deptM); band.position.y = 0.8; g.add(band);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: badgeTexture(d.icon, d.color, { square: true, size: 256 }) }));
    scr.position.set(0, 1.25, -0.12); scr.rotation.x = -0.35; g.add(scr);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.85, 0.06), darkM); frame.position.set(0, 1.25, -0.16); frame.rotation.x = -0.35; g.add(frame);
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(desk); colliders.push({ x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z });
    // officer stands 0.85 m in front of the desk, facing it
    const fx = S.x - Math.sin(S.yaw) * 0.85, fz = S.z - Math.cos(S.yaw) * 0.85;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.85, 28), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.55 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(fx, 0.012, fz); room.add(pad);
    stations[d.id] = { x: fx, z: fz, yaw: S.yaw, group: g };
  }
  return { scene, colliders, camBlockers, stations, holo: hg };
}

/** Push a circle (radius r) at p out of the room walls and the box colliders. */
export function collide(p, r, colliders) {
  let hit = false;
  const minX = ROOM.x0 + r, maxX = ROOM.x1 - r, minZ = ROOM.z0 + r, maxZ = ROOM.z1 - r;
  if (p.x < minX) { p.x = minX; hit = true; } if (p.x > maxX) { p.x = maxX; hit = true; }
  if (p.z < minZ) { p.z = minZ; hit = true; } if (p.z > maxZ) { p.z = maxZ; hit = true; }
  for (const b of colliders) {
    const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else { // centre inside the box: leave by the nearest side
        const o = [p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z], m = Math.min(...o), i = o.indexOf(m);
        if (i === 0) p.x = b.x0 - r; else if (i === 1) p.x = b.x1 + r; else if (i === 2) p.z = b.z0 - r; else p.z = b.z1 + r;
      }
    }
  }
  return hit;
}
