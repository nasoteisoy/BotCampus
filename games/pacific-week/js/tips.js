// r9e: one shared tooltip (#ztip) for unit-type names.
// PC: hover any element with data-tip (every unitIcon has one) or a card with data-t="<type>" shows the name.
// Phone: a ~400ms long-press shows the same tip and the tap that would follow is swallowed (no action).
// Canvases register a resolver: registerCanvasTip(canvas, (clientX, clientY) => html | null).
import { TYPE_TIP } from './icons.js?v=9e';

const LONG_MS = 400, MOVE_PX = 10;
const canvases = new Map();
let tipEl = null, longT = null, longAt = null, swallowUntil = 0, hideT = null;
export const typeTip = (t) => TYPE_TIP[t] || null;
export function registerCanvasTip(cv, fn) { canvases.set(cv, fn); }
export function unregisterCanvasTip(cv) { canvases.delete(cv); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function domTip(target) {
  if (!(target instanceof Element)) return null;
  const a = target.closest('[data-tip]'); if (a && a.getAttribute('data-tip')) return `<b>${esc(a.getAttribute('data-tip'))}</b>`;
  const b = target.closest('[data-t]'); if (b && TYPE_TIP[b.dataset.t]) return `<b>${esc(TYPE_TIP[b.dataset.t])}</b>`;
  return null;
}
export function tipAt(target, x, y) {
  if (canvases.has(target)) return canvases.get(target)(x, y);
  return domTip(target);
}
export function showTip(html, x, y, above = false) {
  if (!tipEl) return;
  tipEl.innerHTML = html; tipEl.hidden = false;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight, vw = window.innerWidth;
  let l = above ? x - w / 2 : x + 14, t = above ? y - h - 46 : y - 34;
  l = Math.max(4, Math.min(vw - w - 4, l)); if (t < 4) t = y + 24;
  tipEl.style.left = `${l}px`; tipEl.style.top = `${t}px`;
}
export function hideTip() { if (tipEl) tipEl.hidden = true; }
// true once right after a long-press fired: the caller skips its tap (map / battle canvas)
export function tookLongPress() { return performance.now() < swallowUntil; }
export function initTips(el) {
  tipEl = el;
  // hover (mouse only): DOM icons; canvases with a resolver handle their own area
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    if (e.target.id === 'map') return; // the map canvas: main.js zoneTip does hover there (same tip element)
    const html = tipAt(e.target, e.clientX, e.clientY);
    if (html) showTip(html, e.clientX, e.clientY); else hideTip();
  }, { passive: true });
  // long-press (touch / pen)
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    swallowUntil = 0; clearTimeout(longT); longAt = { x: e.clientX, y: e.clientY, target: e.target };
    longT = setTimeout(() => {
      const html = longAt && tipAt(longAt.target, longAt.x, longAt.y);
      if (!html) return;
      swallowUntil = performance.now() + 1500;
      showTip(html, longAt.x, longAt.y, true);
      try { navigator.vibrate && navigator.vibrate(15); } catch (_) { /* no vibrate */ }
    }, LONG_MS);
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', (e) => { if (longAt && Math.hypot(e.clientX - longAt.x, e.clientY - longAt.y) > MOVE_PX) { clearTimeout(longT); longAt = null; } }, { capture: true, passive: true });
  const up = () => { clearTimeout(longT); longAt = null; if (tookLongPress()) { clearTimeout(hideT); hideT = setTimeout(hideTip, 1400); } };
  document.addEventListener('pointerup', up, { capture: true, passive: true });
  document.addEventListener('pointercancel', up, { capture: true, passive: true });
  // the click that a long-press would make is swallowed before any handler sees it
  document.addEventListener('click', (e) => { if (tookLongPress()) { e.preventDefault(); e.stopPropagation(); swallowUntil = 0; } }, true);
  document.addEventListener('contextmenu', (e) => { if (longAt || tookLongPress()) e.preventDefault(); }, true);
}
