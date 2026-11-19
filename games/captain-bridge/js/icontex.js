// Draws the local SVG icons into canvas textures (for 3D badges, console screens and map pins).
import * as THREE from 'three';
import { PATHS } from './icons.js';

/** Round badge: coloured disc, white ring, icon in white (or `fg`). Texture fills in once the SVG image loads. */
export function badgeTexture(name, bg = '#2f80ed', { fg = '#ffffff', ring = '#ffffff', size = 128, square = false } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  g.fillStyle = bg;
  if (square) { g.fillRect(0, 0, size, size); }
  else { g.beginPath(); g.arc(r, r, r - 4, 0, Math.PI * 2); g.fill(); g.lineWidth = size * 0.06; g.strokeStyle = ring; g.stroke(); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${fg}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || PATHS.help}</svg>`;
  const img = new Image();
  img.onload = () => { const s = square ? size * 0.7 : size * 0.56; g.drawImage(img, r - s / 2, r - s / 2, s, s); t.needsUpdate = true; };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return t;
}

export function badgeSprite(name, bg, scale = 1, opts) {
  const m = new THREE.SpriteMaterial({ map: badgeTexture(name, bg, opts), transparent: true, depthWrite: false, depthTest: opts?.depthTest ?? true });
  const s = new THREE.Sprite(m); s.scale.setScalar(scale); return s;
}
