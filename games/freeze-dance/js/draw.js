// Canvas drawing helpers shared by the games.
import { BONES } from './body.js';
/** Draw a glowing stick figure. map = viewMap(...) / coverMap(...) */
export function drawSkeleton(c, body, map, color, { width = 8, glow = 18, alpha = 0.95 } = {}) {
  if (!body) return;
  const P = body.p, X = (q) => map.x(q.x), Y = (q) => map.y(q.y);
  c.save();
  c.globalAlpha = alpha; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  for (const [a, b] of BONES) { const A = P[a], B = P[b]; if (!A || !B) continue; c.moveTo(X(A), Y(A)); c.lineTo(X(B), Y(B)); }
  // glow = wide translucent strokes (much cheaper than shadowBlur on phones / CPU raster)
  if (glow > 0) { c.strokeStyle = color; c.globalAlpha = alpha * 0.22; c.lineWidth = width + glow * 1.2; c.stroke(); c.globalAlpha = alpha * 0.4; c.lineWidth = width + glow * 0.5; c.stroke(); c.globalAlpha = alpha; }
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
  c.strokeStyle = '#ffffffcc'; c.lineWidth = Math.max(2, width * 0.3); c.stroke();
  // head
  const h = body.head, r = Math.max(10, body.sw * map.dh * 0.45);
  if (glow > 0) { c.fillStyle = color; c.globalAlpha = alpha * 0.3; c.beginPath(); c.arc(X(h), Y(h), r + glow * 0.5, 0, 7); c.fill(); c.globalAlpha = alpha; }
  c.fillStyle = color; c.beginPath(); c.arc(X(h), Y(h), r, 0, 7); c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
  // hands / feet
  c.fillStyle = '#ffffffaa';
  for (const k of ['lw', 'rw', 'la', 'ra']) { const q = P[k]; if (q) { c.beginPath(); c.arc(X(q), Y(q), width * 1.1, 0, 7); c.fill(); } }
  c.restore();
}
/** Mirrored live video drawn with `map` (view.js viewMap: whole frame, contain). Where the frame doesn't
 *  reach the screen edges (letterbox) a blurred, darkened copy of the same video fills the gap, so there are
 *  no hard black bars. fill = colour for the bars instead of the blur. */
let tiny = null;
export function drawVideo(c, video, W, H, map, { fill = null, dim = 0.45 } = {}) {
  const gap = map.ox > 0.5 || map.oy > 0.5 || map.ox + map.dw < W - 0.5 || map.oy + map.dh < H - 0.5;
  c.save(); c.translate(W, 0); c.scale(-1, 1);
  if (gap) {
    if (fill) { c.fillStyle = fill; c.fillRect(0, 0, W, H); }
    else {
      // cheap blur: shrink the frame to 32 px wide, scale it back up (smoothing does the blur)
      const vw = video.videoWidth || 4, vh = video.videoHeight || 3;
      if (!tiny) tiny = document.createElement('canvas');
      const tw = 32, th = Math.max(8, Math.round((32 * vh) / vw));
      if (tiny.width !== tw || tiny.height !== th) { tiny.width = tw; tiny.height = th; }
      const tc = tiny.getContext('2d'); tc.drawImage(video, 0, 0, tw, th);
      const s = Math.max(W / tw, H / th), dw = tw * s, dh = th * s;
      c.imageSmoothingEnabled = true; c.drawImage(tiny, (W - dw) / 2, (H - dh) / 2, dw, dh);
      c.fillStyle = `rgba(10,8,30,${dim})`; c.fillRect(0, 0, W, H);
    }
  }
  c.drawImage(video, W - map.ox - map.dw, map.oy, map.dw, map.dh);
  c.restore();
}
export function emoji(c, ch, x, y, size) {
  c.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, x, y);
}
export function rrect(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
