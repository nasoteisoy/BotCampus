// Target asteroids (restyled CC0 Quaternius rocks), tumbling, with constant-size bullseye markers so kids can spot them far away.
import * as THREE from 'three';

export const TARGET_R = 17;          // hit radius of an asteroid (m)
export const TARGET_SPOTS = [        // out past the carrier's nose (+Z), spread in 3D so the arrow leads from one to the next
  [110, 40, 640], [-170, -25, 830], [40, 95, 1060], [-300, 30, 1160], [-380, -10, 900],
];

export function markerTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#13294b';
  if (kind === 'target') {
    for (const [r, col] of [[52, '#ff5a64'], [34, '#ffffff'], [16, '#ff5a64']]) { g.beginPath(); g.arc(64, 64, r, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = 6; g.stroke(); }
  } else { // home: green disc with a carrier/landing chevron
    g.beginPath(); g.arc(64, 64, 54, 0, 7); g.fillStyle = '#3ccf7a'; g.fill(); g.lineWidth = 8; g.stroke();
    g.fillStyle = '#ffffff'; g.strokeStyle = '#13294b'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(64, 92); g.lineTo(96, 52); g.lineTo(78, 52); g.lineTo(78, 32); g.lineTo(50, 32); g.lineTo(50, 52); g.lineTo(32, 52); g.closePath(); g.fill(); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createTargets(scene, rockGeos, rockMat) {
  const spriteMat = new THREE.SpriteMaterial({ map: markerTex('target'), sizeAttenuation: false, depthTest: false, transparent: true });
  const list = TARGET_SPOTS.map(([x, y, z], i) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const rock = new THREE.Mesh(rockGeos[i % rockGeos.length], rockMat);
    rock.scale.setScalar(i % 2 ? 4.6 : 4.0); g.add(rock);
    const s = new THREE.Sprite(spriteMat); s.scale.set(0.045, 0.045, 1); s.position.y = 0; s.renderOrder = 10; g.add(s);
    scene.add(g);
    return { i, g, rock, sprite: s, home: new THREE.Vector3(x, y, z), alive: true, popT: 0, phase: i * 1.7,
      spin: new THREE.Vector3(0.3 + (i % 3) * 0.12, 0.2 + (i % 2) * 0.25, 0.15) };
  });
  return {
    list,
    alive() { return list.filter((t) => t.alive); },
    reset() { for (const t of list) { t.alive = true; t.popT = 0; t.g.visible = true; t.g.scale.setScalar(1); t.g.position.copy(t.home); } },
    update(dt, time, scaleMul) {
      for (const t of list) {
        if (t.alive) {
          t.g.position.y = t.home.y + Math.sin(time * 0.6 + t.phase) * 2.5;
          t.rock.rotation.x += dt * t.spin.x; t.rock.rotation.y += dt * t.spin.y; t.rock.rotation.z += dt * t.spin.z;
          // marker sits just above the rock on screen
          t.sprite.position.y = 24; t.sprite.scale.set(0.045 * scaleMul, 0.045 * scaleMul, 1);
        } else if (t.popT > 0) {
          t.popT -= dt;
          const k = Math.max(0, t.popT / 0.2);
          t.g.scale.setScalar(0.2 + k * 1.1);
          if (t.popT <= 0) t.g.visible = false;
        }
      }
    },
    pop(t) { t.alive = false; t.popT = 0.2; t.sprite.visible = false; },
    restoreSprites() { for (const t of list) t.sprite.visible = true; },
  };
}
