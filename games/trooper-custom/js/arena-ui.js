// Shared page chrome for combat.html + team.html: back link, player header, camera + play buttons, toasts.
import * as T from './trooper.js?v=6';
export const $ = (s, r = document) => r.querySelector(s);
export const h = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else if (k in e) e[k] = v; else e.setAttribute(k, v); }
  for (const c of [].concat(kids)) if (c != null) e.append(c);
  return e;
};
export const params = new URLSearchParams(location.search);
export function drawFlag(c, n) { const x = c.getContext('2d'); x.fillStyle = n.s; x.fillRect(0, 0, 32, 32); x.strokeStyle = n.p; x.lineWidth = 4; x.strokeRect(2, 2, 28, 28); T.drawSymbol(x, n.sym, 16, 16, 10, T.symbolColor(n)); }
export function backLink() { // back goes to the customizer, keeping a ?from= chain
  const a = $('#backBtn'), from = params.get('from'); a.href = from ? './?from=' + encodeURIComponent(from) : './';
}
export function playControls(arena, onRestart) {
  const pb = $('#playBtn'), sb = $('#speedBtn');
  pb.addEventListener('click', () => { arena.paused = !arena.paused; pb.textContent = arena.paused ? '▶️' : '⏸️'; pb.classList.toggle('on', arena.paused); });
  sb.addEventListener('click', () => { arena.speed = arena.speed === 1 ? 0.25 : 1; sb.querySelector('span').textContent = arena.speed === 1 ? '🐇' : '🐢'; sb.querySelector('i').textContent = arena.speed === 1 ? '1x' : '¼x'; sb.classList.toggle('on', arena.speed !== 1); });
  $('#restartBtn').addEventListener('click', onRestart);
  for (const b of document.querySelectorAll('#cambar button')) b.addEventListener('click', () => { arena.setCam(b.dataset.cam); markCam(arena); });
  arena.controls.addEventListener('start', () => { if (arena.cam !== 'follow') { arena.cam = 'orbit'; markCam(arena); } });
}
export function markCam(arena) { for (const b of document.querySelectorAll('#cambar button')) b.classList.toggle('on', b.dataset.cam === arena.cam); }
let toastT = 0;
export function toast(txt) {
  const t = $('#toast'); t.textContent = txt; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1400);
}
