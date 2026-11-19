// Constant-size bullseye / home marker textures from Space Carrier, so kids can spot targets far away.
import * as THREE from 'three';

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
