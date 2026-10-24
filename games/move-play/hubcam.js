// Move & Play hub, camera-first: the webcam starts on load, the room shows (mirrored, whole frame) behind
// the cards with glowing skeletons, and a raised hand becomes a cursor: hold it on a game card ~1.2 s to open
// it. Mouse / touch / keys keep working. Video never leaves the device.
import { Camera } from './js/cam.js';
import { BodyMenu } from './js/menu.js';
import { startDemos } from './js/demo.js';
import { drawVideo, drawSkeleton } from './js/draw.js';
import { viewMap, loadZoom } from './js/view.js';
import { PLAYER_COLORS } from './js/multi.js';
import { LockUI } from './js/lockui.js';
// v3 tracking: the hand cursor follows only the locked players (lock saved by a game's roll call in this tab,
// re-found by shirt colour + size), or the single nearest person when nobody is locked. 🐞 = debug boxes.

const $ = (id) => document.getElementById(id);
const cv = $('bg'), c = cv.getContext('2d'), video = $('vid'), msg = $('camMsg');
const params = new URLSearchParams(location.search);
const cam = new Camera({ video, onStatus: (s) => { document.body.dataset.cam = s; msg.textContent = { loading: '⏳', tap: '👆', denied: '🚫 👆', nocam: '🚫 👆', nomodel: '⚠️ 👆', none: '🙋', track: '🙋' }[s] || '📷'; } });
const menu = new BodyMenu({ enabled: () => cam.active, selector: 'a.card, button:not(.hidden):not(#mpBug)' });
let W = 0, H = 0, d = 1;
const zoom = loadZoom(); // same 🔍 level the games use
function resize() { W = innerWidth; H = innerHeight; d = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
addEventListener('resize', resize); resize();
startDemos(document);
const mapNow = () => { const f = cam.frameSize || { w: W, h: H }; return viewMap(f.w, f.h, W, H, zoom); };
const lock = new LockUI({ cam, getMap: mapNow });

async function go() {
  const ok = await cam.start();
  if (!ok && cam.status === 'tap') { const again = () => { removeEventListener('pointerdown', again); cam.start(); }; addEventListener('pointerdown', again); }
}
if (params.get('autocam') !== '0') go();

const cards = [...document.querySelectorAll('.card')];
function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000;
  cam.tick(t);
  document.body.classList.toggle('camlive', !!cam.hasVideo);
  c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, W, H);
  if (cam.hasVideo) {
    const f = cam.frameSize, map = viewMap(f.w, f.h, W, H, zoom);
    c.globalAlpha = 0.5; drawVideo(c, video, W, H, map); c.globalAlpha = 1;
    c.fillStyle = 'rgba(75, 42, 214, 0.35)'; c.fillRect(0, 0, W, H); // keep the hub colours + white text readable
    for (const p of cam.players) if (p.body) drawSkeleton(c, p.body, map, (PLAYER_COLORS[p.slot] || PLAYER_COLORS[0]).css, { width: 8, glow: 22, alpha: 0.8 });
    for (const q of cam.pending) drawSkeleton(c, q.body, map, '#ffffff', { width: 5, glow: 0, alpha: 0.35 });
  }
  const mp = cam.menuPlayers;
  menu.update(mp, t);
  lock.update(1 / 60);
  // hover / hand-hover / focus -> that card's stick figures start moving
  for (const k of cards) { const on = k.matches(':hover') || k.classList.contains('hand-hover') || k.matches(':focus-visible'); for (const x of k.querySelectorAll('canvas[data-demo]')) x.dataset.paused = on ? '0' : '1'; }
}
requestAnimationFrame(frame);
window.__hub = { get menu() { return menu.state; }, camInfo: () => ({ ...cam.info, status: cam.status, active: cam.active }), get players() { return cam.players.map((p) => ({ slot: p.slot, body: !!p.body, state: p.state })); },
  /** who the cursor follows right now: locked slots, or 'nearest' */
  get following() { return mp0().map((p) => (p.slot >= 0 ? p.slot : 'nearest')); },
  get lock() { const tr = cam.tracker; return { phase: tr.phase, n: tr.n, numPoses: cam.numPoses, cands: tr.cands.length }; },
  debug: (on = true) => lock.setDebug(on) };
function mp0() { return cam.menuPlayers; }
