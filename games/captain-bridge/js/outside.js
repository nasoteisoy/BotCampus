// Outside view: the whole carrier in bright space, fighter wings flying their sortie loops,
// and the planned routes drawn as glowing tubes with waypoint pins.
import * as THREE from 'three';
import { buildWorld } from './space-world.js';
import { buildSpaceShip } from './ships/ships3d.js';
import { toonify, engineGlow } from './models.js';
import { badgeSprite } from './icontex.js';
import { Particles } from './particles.js';
import { PLANS } from './data.js';

export function buildOutside(models) {
  const scene = new THREE.Scene();
  const world = buildWorld(scene, models.planets);
  const carrier = models.carrier; scene.add(carrier);

  // "You are here": find the top of the bridge tower on the hull and pin a captain badge above it
  const hull = carrier.userData.hull; hull.geometry.computeBoundingBox();
  const pos = hull.geometry.attributes.position, top = new THREE.Vector3(0, -1e9, 0), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (v.y > top.y) top.copy(v); }
  const pin = badgeSprite('user', '#ffd23f', 26, { fg: '#1b2550', ring: '#ffffff' });
  pin.position.set(top.x, top.y + 26, top.z); pin.renderOrder = 5; scene.add(pin);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 14, 6), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  stem.position.set(top.x, top.y + 7, top.z); scene.add(stem);

  // routes + sorties
  const plans = {}, fx = new Particles(scene, 900, true, 1.4);
  const chevGeo = new THREE.ConeGeometry(4.5, 10, 4); chevGeo.rotateX(Math.PI / 2);
  for (const p of PLANS) {
    const g = new THREE.Group(); scene.add(g);
    const col = new THREE.Color(p.color);
    let curve;
    if (p.kind === 'route') {
      curve = new THREE.CatmullRomCurve3(p.pts.map((q) => new THREE.Vector3(...q)), false, 'centripetal');
      p.pts.forEach((q, i) => {
        const last = i === p.pts.length - 1;
        const s = badgeSprite(last ? 'flag' : 'compass', p.color, last ? 34 : 22, { fg: '#10204a' });
        s.position.set(q[0], q[1] + (last ? 26 : 18), q[2]); g.add(s);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(last ? 14 : 9, 1.4, 6, 24), new THREE.MeshBasicMaterial({ color: col }));
        ring.position.set(...q); ring.lookAt(curve.getPointAt(Math.min(1, i / (p.pts.length - 1) + 0.01))); g.add(ring);
      });
    } else {
      const { c, r } = p.loop, pts = [];
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(new THREE.Vector3(c[0] + Math.cos(a) * r, c[1] + Math.sin(a * 2) * 12, c[2] + Math.sin(a) * r)); }
      curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      const s = badgeSprite('plane', p.color, 26, { fg: '#10204a' }); s.position.set(c[0], c[1] + 40, c[2]); g.add(s);
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, p.kind === 'route' ? 2.6 : 1.4, 6, curve.closed),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }));
    tube.renderOrder = 2; g.add(tube);
    const halo = new THREE.Mesh(tube.geometry, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.renderOrder = 1; g.add(halo);
    // moving chevrons show which way the route goes
    const nCh = p.kind === 'route' ? 10 : 0;
    const chev = nCh ? new THREE.InstancedMesh(chevGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), nCh) : null;
    if (chev) { chev.frustumCulled = false; g.add(chev); }
    // fighters on the sortie loop (space-ships3d fighter, toon-restyled, wing colour)
    const ships = [];
    for (let i = 0; i < (p.ships || 0); i++) {
      const sh = toonify(buildSpaceShip('fighter', p.color, '#ffffff'));
      sh.scale.multiplyScalar(5.5);
      const glow = engineGlow(new THREE.Color(p.color).lerp(new THREE.Color(0xffffff), 0.5), 0.9); glow.position.set(0, 0, -0.9); sh.add(glow);
      g.add(sh); ships.push({ m: sh, off: i * 0.045 });
    }
    plans[p.id] = { p, g, curve, tube, halo, chev, ships, col };
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _z = new THREE.Vector3(0, 0, 1);
  return {
    scene, carrier, plans, pin,
    target: new THREE.Vector3(0, 0, 40),
    setFocus(id) {
      for (const k in plans) {
        const on = !id || k === id;
        plans[k].tube.material.opacity = on ? 0.95 : 0.35;
        plans[k].halo.material.opacity = k === id ? 0.45 : 0.18;
      }
    },
    focusCenter(id) {
      const P = plans[id]; if (!P) return null;
      const box = new THREE.Box3().setFromObject(P.tube).union(new THREE.Box3(new THREE.Vector3(-60, -30, -100), new THREE.Vector3(60, 40, 175))); const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3()).length();
      return { c, s };
    },
    update(dt, t) {
      world.update(dt, t);
      pin.position.y = top.y + 26 + Math.sin(t * 2) * 2;
      for (const k in plans) {
        const P = plans[k];
        if (P.chev) for (let i = 0; i < P.chev.count; i++) {
          const u = ((t * 0.05 + i / P.chev.count) % 1);
          P.curve.getPointAt(u, _a); P.curve.getTangentAt(u, _b);
          _q.setFromUnitVectors(_z, _b);
          P.chev.setMatrixAt(i, _m.compose(_a, _q, _s));
        }
        if (P.chev) P.chev.instanceMatrix.needsUpdate = true;
        for (const s of P.ships) {
          const u = ((t * 0.04 + s.off) % 1);
          P.curve.getPointAt(u, _a); P.curve.getPointAt((u + 0.01) % 1, _b);
          s.m.position.copy(_a); s.m.lookAt(_b); s.m.rotateZ(-0.5);
          if (Math.random() < 0.5) fx.spawn(_a.x, _a.y, _a.z, 0, 0, 0, 0.8, 2.2, 0.4, P.col.r, P.col.g, P.col.b, 0.35, 0.5);
        }
      }
      fx.update(dt);
      const cg = carrier.userData.glows; cg.forEach((e, i) => e.scale.setScalar((i < 2 ? 34 : 28) * (0.92 + 0.08 * Math.sin(t * 9 + i))));
    },
  };
}
