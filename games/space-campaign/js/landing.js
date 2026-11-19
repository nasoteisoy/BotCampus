// Landing guide: glide-path rings, deck highlight, and a forgiving auto-assist once the plane is in the funnel.
// From parts-library carrier-landing-assist, retuned for the space carrier: approach runs -Z over the carrier's nose.
import * as THREE from 'three';
import { DECK_Y } from './models.js';
import { toon } from './world.js';

export const GP0 = new THREE.Vector3(0, DECK_Y + 42, 530); // funnel entry (out past the nose)
export const TD = new THREE.Vector3(0, DECK_Y + 0.4, 120); // touchdown point on deck
const RING_Z = [530, 430, 335, 250, 178];
export const glideY = (z) => {
  const t = THREE.MathUtils.clamp((z - TD.z) / (GP0.z - TD.z), 0, 1);
  return TD.y + (GP0.y - TD.y) * t;
};
export const progressAt = (z) => THREE.MathUtils.clamp(1 - (z - TD.z) / (GP0.z - TD.z), 0, 1);

export function inFunnel(p) {
  const z = p.pos.z;
  // near the funnel mouth from any direction: the assist turns the plane onto the path
  if (Math.hypot(p.pos.x - GP0.x, z - GP0.z) < 230 && p.pos.y < GP0.y + 90 && p.pos.y > GP0.y - 130) return true;
  if (z < 200 || z > 620) return false;
  if (Math.abs(p.pos.x) > 85) return false;
  if (Math.abs(p.pos.y - glideY(z)) > 55) return false;
  return -p.fwd.z > Math.cos(THREE.MathUtils.degToRad(65));
}

export function createLanding(scene) {
  const group = new THREE.Group(); scene.add(group);
  const ringGeo = new THREE.TorusGeometry(1, 0.07, 8, 40);
  const rings = RING_Z.map((z, i) => {
    const r = 24 - i * 3.3;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const m = new THREE.Mesh(ringGeo, mat);
    m.position.set(0, glideY(z), z); m.scale.setScalar(r);
    group.add(m);
    return { m, z, r, passed: false };
  });
  // glowing landing box on the deck
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(18, 48), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, depthWrite: false }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, DECK_Y + 0.2, 113); group.add(pad);
  // small mirror-style landing light on the port side: green when on the path
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3ccf7a }));
  light.position.set(-24, DECK_Y + 3, 100); group.add(light);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 6), toon(0x13294b)); post.position.set(-24, DECK_Y + 1.5, 100); group.add(post);

  return {
    group, rings,
    reset() { for (const r of rings) { r.passed = false; r.m.visible = true; } },
    show(v) { group.visible = v; },
    // returns index of a ring passed this frame, or -1
    update(dt, t, p, active) {
      let passed = -1;
      const next = rings.findIndex((r) => !r.passed);
      rings.forEach((r, i) => {
        if (!r.passed && active && p.fwd.z < -0.5 && p.pos.z < r.z) {
          r.passed = true; // rings behind the plane are skipped so the next one ahead lights up
          if (p.pos.z > r.z - 60 && Math.hypot(p.pos.x, p.pos.y - r.m.position.y) < r.r * 1.3) passed = i;
        }
        const mat = r.m.material;
        if (r.passed) { mat.color.set(0x3ccf7a); mat.opacity = Math.max(0, mat.opacity - dt * 1.5); r.m.visible = mat.opacity > 0.02; }
        else if (i === next) { mat.color.set(0xffd23f); mat.opacity = 0.95; r.m.scale.setScalar(r.r * (1 + 0.06 * Math.sin(t * 6))); }
        else { mat.color.set(0xffffff); mat.opacity = 0.7; r.m.scale.setScalar(r.r); }
      });
      pad.material.opacity = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 5));
      const onPath = Math.abs(p.pos.y - glideY(p.pos.z)) < 6 && Math.abs(p.pos.x) < 6;
      light.material.color.set(onPath ? 0x3ccf7a : 0xffd23f);
      return passed;
    },
  };
}

// assisted approach: blends toward the centre line and glide slope. Stick still nudges, less near the deck.
export function approachStep(p, inp, dt) {
  const prog = progressAt(p.pos.z);
  const freedom = 1 - prog;
  const xT = inp.x * 9 * freedom;
  const vxT = THREE.MathUtils.clamp(-(p.pos.x - xT) * 0.7, -18, 18);
  const yawT = -Math.asin(THREE.MathUtils.clamp(vxT / Math.max(10, p.speed), -0.6, 0.6));
  let d = yawT - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  const yawRateT = THREE.MathUtils.clamp(d * 2.2, -1, 1);
  p.yawRate += (yawRateT - p.yawRate) * (1 - Math.exp(-6 * dt));
  p.yaw += p.yawRate * dt;
  const slope = (GP0.y - TD.y) / (GP0.z - TD.z);
  const gy = glideY(p.pos.z) + inp.y * 5 * freedom;
  const vyT = (gy - p.pos.y) * 1.3 - slope * p.speed * Math.max(0, -p.fwd.z);
  p.vy += (vyT - p.vy) * (1 - Math.exp(-4 * dt));
  p.speed += (30 - p.speed) * (1 - Math.exp(-1.2 * dt));
  return { errX: p.pos.x, errY: p.pos.y - glideY(p.pos.z) };
}
