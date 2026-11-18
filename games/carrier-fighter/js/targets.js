// Target balloons (striped, bobbing) with constant-size marker sprites so kids can spot them far away.
import * as THREE from 'three';
import { toon } from './world.js';

export const TARGET_R = 6;           // balloon radius (m)
export const TARGET_SPOTS = [        // ahead of the bow (-Z), in a loop so the arrow leads from one to the next
  [-120, 48, -560], [140, 62, -760], [-60, 78, -1000], [260, 55, -1120], [380, 70, -880],
];

function stripeTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ef4b55'; g.fillRect(i * 32, 0, 32, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function markerTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.lineWidth = 12; g.strokeStyle = '#13294b';
  if (kind === 'target') {
    for (const [r, col] of [[52, '#ef4b55'], [34, '#ffffff'], [16, '#ef4b55']]) { g.beginPath(); g.arc(64, 64, r, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = 6; g.stroke(); }
  } else {
    g.beginPath(); g.arc(64, 64, 54, 0, 7); g.fillStyle = '#3ccf7a'; g.fill(); g.lineWidth = 8; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.lineCap = 'round'; // anchor
    g.beginPath(); g.arc(64, 40, 9, 0, 7); g.moveTo(64, 49); g.lineTo(64, 96); g.moveTo(46, 62); g.lineTo(82, 62);
    g.moveTo(36, 76); g.quadraticCurveTo(40, 98, 64, 98); g.quadraticCurveTo(88, 98, 92, 76); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createTargets(scene) {
  const balloonGeo = new THREE.SphereGeometry(TARGET_R, 20, 14); balloonGeo.scale(1, 1.15, 1);
  const balloonMat = toon(0xffffff, { map: stripeTex() });
  const basketGeo = new THREE.BoxGeometry(2.4, 1.8, 2.4); const basketMat = toon(0x9b6b3d);
  const ropeGeo = new THREE.CylinderGeometry(0.08, 0.08, 4.5, 4); const ropeMat = toon(0x13294b);
  const spriteMat = new THREE.SpriteMaterial({ map: markerTex('target'), sizeAttenuation: false, depthTest: false, transparent: true });
  const list = TARGET_SPOTS.map(([x, y, z], i) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const b = new THREE.Mesh(balloonGeo, balloonMat); g.add(b);
    const r = new THREE.Mesh(ropeGeo, ropeMat); r.position.y = -TARGET_R * 1.15 - 2; g.add(r);
    const k = new THREE.Mesh(basketGeo, basketMat); k.position.y = -TARGET_R * 1.15 - 5; g.add(k);
    const s = new THREE.Sprite(spriteMat); s.scale.set(0.045, 0.045, 1); s.position.y = TARGET_R * 1.15 + 6; s.renderOrder = 10; g.add(s);
    scene.add(g);
    return { i, g, sprite: s, home: new THREE.Vector3(x, y, z), alive: true, popT: 0, phase: i * 1.7 };
  });
  return {
    list,
    alive() { return list.filter((t) => t.alive); },
    reset() { for (const t of list) { t.alive = true; t.popT = 0; t.g.visible = true; t.g.scale.setScalar(1); t.g.position.copy(t.home); } },
    update(dt, time, scaleMul) {
      for (const t of list) {
        if (t.alive) {
          t.g.position.y = t.home.y + Math.sin(time * 0.9 + t.phase) * 1.5;
          t.g.rotation.y += dt * 0.3;
          t.sprite.scale.set(0.045 * scaleMul, 0.045 * scaleMul, 1);
        } else if (t.popT > 0) {
          t.popT -= dt;
          const k = Math.max(0, t.popT / 0.18);
          t.g.scale.setScalar(1 + (1 - k) * 0.5);
          if (t.popT <= 0) t.g.visible = false;
        }
      }
    },
    pop(t) { t.alive = false; t.popT = 0.18; t.sprite.visible = false; },
    restoreSprites() { for (const t of list) t.sprite.visible = true; },
  };
}
