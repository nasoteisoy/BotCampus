// Drawn commander portrait cards: generic painted busts (no real people), one per corps.
// Source part: none in parts-library has 2D portraits; frame colours follow gold-dark-panels.
import { rng } from './map.js';

const SKIN = ['#e2b892', '#d4a37c', '#c98f68', '#e8c4a2'];
const HAIR = ['#3b2a1e', '#6b5440', '#9a9a92', '#2a2420', '#b8b4a8'];

export function drawPortrait(seed, side, w = 72, h = 90) {
  const r = rng(seed * 7919 + (side === 'b' ? 1 : 2));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.scale(w / 72, h / 90);
  const bg = g.createRadialGradient(36, 36, 6, 36, 46, 60);
  bg.addColorStop(0, side === 'b' ? '#8a8c84' : '#8c8a6a');
  bg.addColorStop(1, side === 'b' ? '#2e3238' : '#34321e');
  g.fillStyle = bg;
  g.fillRect(0, 0, 72, 90);
  const coat = side === 'b' ? '#22306a' : '#2d5a2a';
  const facing = side === 'b' ? '#b0262a' : '#c9b04a';
  // shoulders and coat
  g.fillStyle = coat;
  g.beginPath();
  g.moveTo(2, 90); g.quadraticCurveTo(4, 62, 22, 58); g.lineTo(50, 58); g.quadraticCurveTo(68, 62, 70, 90);
  g.closePath(); g.fill();
  // lapels and collar
  g.fillStyle = facing;
  g.beginPath(); g.moveTo(28, 58); g.lineTo(36, 80); g.lineTo(44, 58); g.closePath(); g.fill();
  g.fillStyle = '#f1ead8';
  g.beginPath(); g.moveTo(31, 58); g.lineTo(36, 70); g.lineTo(41, 58); g.closePath(); g.fill();
  // epaulettes
  g.fillStyle = '#d8b04a';
  g.beginPath(); g.ellipse(13, 63, 10, 4.5, -0.25, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(59, 63, 10, 4.5, 0.25, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#8a6a22'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    g.beginPath(); g.moveTo(5 + i * 3.5, 66); g.lineTo(4 + i * 3.5, 72); g.stroke();
    g.beginPath(); g.moveTo(53 + i * 3.5, 66); g.lineTo(54 + i * 3.5, 72); g.stroke();
  }
  // neck and head
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  g.fillStyle = skin;
  g.fillRect(31, 48, 10, 11);
  g.beginPath(); g.ellipse(36, 38, 12.5, 15.5, 0, 0, Math.PI * 2); g.fill();
  // shading on one side of the face
  g.fillStyle = 'rgba(80,40,20,0.18)';
  g.beginPath(); g.ellipse(41, 40, 7, 13, 0, -Math.PI / 2, Math.PI / 2); g.fill();
  // hair and side whiskers
  g.fillStyle = hair;
  g.beginPath(); g.ellipse(36, 26, 13, 7, 0, Math.PI, 0); g.fill();
  if (r() < 0.7) { g.fillRect(23.5, 28, 3.5, 14); g.fillRect(45, 28, 3.5, 14); }
  // eyes, brows, nose, mouth
  g.fillStyle = '#2a1c14';
  g.fillRect(30, 36, 3, 2); g.fillRect(39, 36, 3, 2);
  g.strokeStyle = hair; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(28.5, 33.5); g.lineTo(33.5, 33); g.moveTo(38.5, 33); g.lineTo(43.5, 33.5); g.stroke();
  g.strokeStyle = 'rgba(90,50,30,0.7)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(36, 37); g.lineTo(35, 43); g.lineTo(37.5, 43.5); g.stroke();
  if (r() < 0.45) {
    g.fillStyle = hair;
    g.beginPath(); g.ellipse(36, 46, 5.5, 1.8, 0, 0, Math.PI * 2); g.fill();
  } else {
    g.strokeStyle = '#8a4a3a'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(32.5, 47); g.quadraticCurveTo(36, 48.5, 39.5, 47); g.stroke();
  }
  // hat: bicorne or bare head
  if (r() < 0.75) {
    g.fillStyle = '#16140f';
    g.beginPath();
    g.moveTo(14, 26); g.quadraticCurveTo(36, 2, 58, 26); g.quadraticCurveTo(36, 18, 14, 26);
    g.fill();
    g.fillStyle = side === 'b' ? '#d0d6e8' : '#d8c060';
    g.beginPath(); g.arc(44, 17, 2.6, 0, Math.PI * 2); g.fill();
  }
  // gold frame
  g.strokeStyle = '#d4af37'; g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 69, 87);
  g.strokeStyle = 'rgba(40,28,8,0.8)'; g.lineWidth = 1;
  g.strokeRect(4, 4, 64, 82);
  return c;
}
