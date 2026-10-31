/**
 * Star Conquests — end / result card body (CONTRACT v1.1 hook).
 *
 * Owner: Dev B. Shell owns overlay, transitions, and action buttons.
 *
 * API:
 *   import { renderEndCard } from './endcard.js';
 *   renderEndCard(el, summary);
 *
 * Fills ONLY the body (icon, title, stats). No Continue / Play again / Menu.
 * Army HQ palette: gold #ffd23f on dark #070a1c. Army HQ trooper render for
 * victory/defeat icons (SVG fallback until the dataURL is ready).
 */
import { unitIconHtml } from './shop.js';
import * as THREE from '../vendor/three.module.min.js';
import { createHqTrooper, poseTrooper, disposeHqTrooper } from '../ground/hq/api.js';

let _thumbFn = null;
try {
  // Dev A may export unitThumbHtml — prefer when present
  // dynamic keep: static import of missing export would break; probe on first render
} catch (_) {}

async function resolveThumb() {
  if (_thumbFn) return _thumbFn;
  try {
    const mod = await import('./shop.js');
    if (typeof mod.unitThumbHtml === 'function') _thumbFn = mod.unitThumbHtml;
  } catch (_) {}
  return _thumbFn;
}

function unitHtml(u, dead) {
  // Sync path: prefer unitThumbHtml if already on module namespace via prior resolve
  let inner;
  try {
    // eslint-disable-next-line no-undef
    if (typeof unitThumbHtml === 'function') inner = unitThumbHtml(u);
  } catch (_) {}
  if (!inner && _thumbFn) inner = _thumbFn(u);
  if (!inner) inner = unitIconHtml(u);
  const hp = u?.hpNow != null ? Math.ceil(u.hpNow) : '';
  return `<span class="ec-u${dead ? ' dead' : ''}" title="${u?.name || ''}">${inner}${(!dead && hp !== '') ? `<small>HP ${hp}</small>` : ''}</span>`;
}

/** Chevron + laurel SVG (gold on transparent) — shown until trooper dataURL is ready. */
const SVG_LAUREL = `<svg class="ec-svg" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
  <path fill="none" stroke="#ffd23f" stroke-width="2.5" stroke-linecap="round" d="M18 48c-6-10-6-22 2-30 4 8 8 14 12 18"/>
  <path fill="none" stroke="#ffd23f" stroke-width="2.5" stroke-linecap="round" d="M46 48c6-10 6-22-2-30-4 8-8 14-12 18"/>
  <path fill="#ffd23f" d="M32 12l6 10H26z"/>
  <path fill="none" stroke="#e08a00" stroke-width="2" d="M26 44h12"/>
</svg>`;
const SVG_FLAG = `<svg class="ec-svg" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><path stroke="#f2f5ff" stroke-width="3" d="M16 8v48"/><path fill="#ffd23f" d="M18 10h28l-6 10 6 10H18z"/></svg>`;
const SVG_DEFEAT = `<svg class="ec-svg" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><circle cx="32" cy="28" r="16" fill="#c5d0e0"/><circle cx="26" cy="26" r="3" fill="#070a1c"/><circle cx="38" cy="26" r="3" fill="#070a1c"/><path d="M28 34h8v4h-8z" fill="#070a1c"/><path d="M22 44h20l-4 8H26z" fill="#9fb0d9"/></svg>`;

/** Cached trooper portrait dataURLs: attacker (victory) and defender (defeat). */
let _trooperWinUrl = null;
let _trooperLoseUrl = null;
let _trooperRenderStarted = false;
const _trooperWaiters = [];

function notifyTrooperReady() {
  const waiters = _trooperWaiters.splice(0);
  for (const fn of waiters) {
    try { fn(); } catch (_) {}
  }
}

function makeGoldGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,210,63,0.55)');
  grd.addColorStop(0.35, 'rgba(255,210,63,0.22)');
  grd.addColorStop(1, 'rgba(255,210,63,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Render an Army HQ trooper once offscreen (2x, 256x256).
 * Full body fills ~85% of canvas height. Soft gold glow behind.
 * Caches dataURL; disposes renderer + trooper afterward.
 */
function renderTrooperDataURL(side) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
  } catch (_) {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const light = new THREE.DirectionalLight(0xffffff, 1.4);
  light.position.set(2.2, 4.5, 3.2);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const fill2 = new THREE.DirectionalLight(0x9fb0d9, 0.45);
  fill2.position.set(-2, 1.5, -1);
  scene.add(fill2);

  let trooper;
  try {
    trooper = createHqTrooper({ side, cls: 'rifle' });
  } catch (_) {
    try { renderer.dispose(); } catch (_) {}
    return null;
  }
  scene.add(trooper.root);
  try { poseTrooper(trooper, 'idle', 0.4, 0.016); } catch (_) {}
  // Face slightly toward camera (3/4 front)
  trooper.root.rotation.y = Math.PI * 0.22;

  // Frame full body tightly — ~85% of canvas height
  const box = new THREE.Box3().setFromObject(trooper.root);
  const center = box.getCenter(new THREE.Vector3());
  const sizeV = box.getSize(new THREE.Vector3());
  const height = Math.max(sizeV.y, 0.01);
  const fill = 0.85;
  const fov = 28;
  const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 50);
  const fovRad = (fov * Math.PI) / 180;
  // distance so body height fills `fill` of the vertical FOV
  const dist = height / (2 * fill * Math.tan(fovRad / 2));
  // 3/4 offset: mostly in front, slight side
  const sideAmt = dist * 0.28;
  const frontAmt = dist * 0.96;
  cam.position.set(center.x + sideAmt, center.y + height * 0.02, center.z + frontAmt);
  cam.lookAt(center.x, center.y, center.z);
  cam.updateProjectionMatrix();

  // Soft gold radial glow behind the trooper
  let glowMat = null;
  let glowTex = null;
  try {
    glowTex = makeGoldGlowTexture();
    glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMat);
    const glowScale = Math.max(sizeV.x, sizeV.z, height) * 1.85;
    glow.scale.set(glowScale, glowScale * 1.15, 1);
    glow.position.set(center.x, center.y + height * 0.05, center.z - 0.15);
    scene.add(glow);
  } catch (_) {}

  renderer.render(scene, cam);
  let url = null;
  try { url = canvas.toDataURL('image/png'); } catch (_) { url = null; }

  try { disposeHqTrooper(trooper); } catch (_) {}
  try { glowMat?.dispose(); glowTex?.dispose(); } catch (_) {}
  try {
    renderer.dispose();
    renderer.forceContextLoss?.();
  } catch (_) {}
  return url;
}

function ensureTrooperPortraits() {
  if (_trooperRenderStarted) return;
  _trooperRenderStarted = true;
  // Defer so first paint stays sync; run ASAP on next tick
  const run = () => {
    try {
      if (!_trooperWinUrl) _trooperWinUrl = renderTrooperDataURL('attacker');
      if (!_trooperLoseUrl) _trooperLoseUrl = renderTrooperDataURL('defender') || _trooperWinUrl;
    } catch (_) {
      /* keep SVG */
    }
    notifyTrooperReady();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(run, 0));
  else setTimeout(run, 0);
}

function whenTrooperReady(fn) {
  if (_trooperWinUrl || _trooperLoseUrl) { fn(); return; }
  _trooperWaiters.push(fn);
  ensureTrooperPortraits();
  // If WebGL already failed synchronously, waiters still fire via notify after run()
}

function outcomeMeta(outcome) {
  switch (outcome) {
    case 'victory':
    case 'win':
      return { kind: 'win', title: outcome === 'win' ? 'Star Conquest!' : 'Victory', svg: SVG_LAUREL };
    case 'retreat':
      return { kind: 'retreat', title: 'Retreat', svg: SVG_FLAG };
    case 'defeat':
    case 'lose':
    default:
      return { kind: 'lose', title: outcome === 'lose' ? 'Defeated' : 'Defeat', svg: SVG_DEFEAT };
  }
}

function iconHtml(meta) {
  if (meta.kind === 'retreat') return meta.svg;
  const url = meta.kind === 'win' ? _trooperWinUrl : (_trooperLoseUrl || _trooperWinUrl);
  const grey = meta.kind === 'lose' && !_trooperLoseUrl && _trooperWinUrl
    ? 'filter:grayscale(1) brightness(0.85)'
    : (meta.kind === 'lose' ? 'filter:grayscale(0.35) brightness(0.9)' : '');
  if (url) {
    return `<img class="ec-troop" data-ec-troop="${meta.kind}" src="${url}" width="140" height="140" alt="" style="${grey}"/>`;
  }
  // Placeholder SVG; img may swap in later
  return `<span class="ec-icon-slot" data-ec-troop="${meta.kind}">${meta.svg}</span>`;
}

function swapTrooperIcons(root) {
  if (!root) return;
  const winUrl = _trooperWinUrl;
  const loseUrl = _trooperLoseUrl || _trooperWinUrl;
  root.querySelectorAll('[data-ec-troop]').forEach((node) => {
    const kind = node.getAttribute('data-ec-troop');
    const url = kind === 'win' ? winUrl : loseUrl;
    if (!url) return;
    const grey = kind === 'lose'
      ? (!_trooperLoseUrl && _trooperWinUrl ? 'filter:grayscale(1) brightness(0.85)' : 'filter:grayscale(0.35) brightness(0.9)')
      : '';
    if (node.tagName === 'IMG') {
      node.src = url;
      if (kind === 'lose') node.style.filter = 'grayscale(0.35) brightness(0.9)';
      else node.style.filter = '';
    } else {
      const img = document.createElement('img');
      img.className = 'ec-troop';
      img.setAttribute('data-ec-troop', kind);
      img.width = 140;
      img.height = 140;
      img.alt = '';
      img.src = url;
      if (grey) img.style.cssText = grey;
      node.replaceWith(img);
    }
  });
}

/**
 * @param {HTMLElement} el
 * @param {object} summary
 */
export function renderEndCard(el, summary) {
  if (!el) return;
  // Kick thumb resolve for next call (non-blocking)
  resolveThumb();
  ensureTrooperPortraits();

  const s = summary || {};
  const kind = s.kind === 'campaign' ? 'campaign' : 'battle';
  const meta = outcomeMeta(s.outcome || 'defeat');
  const ptsEarned = Math.max(0, s.pointsEarned | 0);
  const totalPts = Math.max(0, s.totalPoints | 0);
  const survivors = Array.isArray(s.survivors) ? s.survivors : [];
  const lost = Array.isArray(s.lost) ? s.lost : [];
  const enemyDestroyed = Math.max(0, s.enemyDestroyed | 0);
  const owned = Math.max(0, s.planetsOwned | 0);
  const total = Math.max(0, s.planetsTotal | 0);
  const won = Math.max(0, s.battlesWon | 0);
  const fought = Math.max(0, s.battlesFought | 0);
  const planet = s.planet || null;
  const kills = (s.kills && typeof s.kills === 'object') ? s.kills : null;
  const cpsTaken = (s.cpsTaken != null) ? Math.max(0, s.cpsTaken | 0) : null;
  const ticketsLeft = (s.ticketsLeft && typeof s.ticketsLeft === 'object') ? s.ticketsLeft : null;
  const extraBits = [];
  if (kills) extraBits.push(`<div class="ec-stat" role="listitem"><b>${kills.attacker | 0}/${kills.defender | 0}</b><small>Kills A/D</small></div>`);
  if (cpsTaken != null) extraBits.push(`<div class="ec-stat" role="listitem"><b>${cpsTaken}</b><small>CPs taken</small></div>`);
  if (ticketsLeft) extraBits.push(`<div class="ec-stat" role="listitem"><b>${ticketsLeft.attacker | 0}/${ticketsLeft.defender | 0}</b><small>Tickets</small></div>`);
  const extraStats = extraBits.length
    ? `<div class="ec-grid" role="list" style="grid-template-columns:repeat(${Math.min(3, extraBits.length)},1fr);margin-top:8px">${extraBits.join('')}</div>`
    : '';

  const unitRow = (arr, dead) => {
    if (!arr.length) return `<span class="ec-muted">—</span>`;
    return arr.map((u) => unitHtml(u, dead)).join('');
  };

  const style = `<style>
    .ec-body{text-align:center;color:#f2f5ff;font-family:system-ui,Segoe UI,sans-serif;background:#070a1c}
    .ec-icon{margin:0 auto 10px;display:flex;justify-content:center;align-items:center;
      min-height:140px;position:relative}
    .ec-icon-slot{display:flex;align-items:center;justify-content:center;min-height:110px}
    .ec-troop{width:140px;height:140px;object-fit:contain;image-rendering:auto;display:block}
    @media (max-width:520px){
      .ec-icon{min-height:110px}
      .ec-troop{width:110px;height:110px}
    }
    .ec-title{margin:0 0 6px;font-size:clamp(24px,6vw,32px);letter-spacing:.06em;
      background:linear-gradient(180deg,#fff7c9 0%,#ffd23f 45%,#e08a00 100%);
      -webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900}
    .ec-sub{margin:0 0 12px;color:#9fb0d9;font-size:14px}
    .ec-pts{display:inline-flex;align-items:center;gap:8px;background:rgba(20,28,60,.9);border:1px solid #ffd23f66;
      border-radius:999px;padding:8px 14px;margin:0 auto 12px;font-weight:800}
    .ec-pts b{color:#ffd23f;font-size:20px}
    .ec-pts small{color:#9fb0d9;font-size:11px}
    .ec-muted{color:#9fb0d9;font-size:12px;font-weight:600}
    .ec-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:left;margin-bottom:10px}
    .ec-lab{font-size:12px;color:#9fb0d9;font-weight:800;margin-bottom:6px}
    .ec-row{display:flex;flex-wrap:wrap;gap:6px;min-height:44px;align-items:center}
    .ec-u{display:inline-flex;flex-direction:column;align-items:center;gap:2px;min-width:44px;min-height:44px;
      padding:4px;background:#0e1528;border-radius:10px;border:1px solid #ffd23f33}
    .ec-u small{font-size:10px;color:#9fb0d9}
    .ec-u.dead{opacity:.45;filter:grayscale(1)}
    .ec-foot{margin:0 0 8px;font-size:13px;color:#9fb0d9}
    .ec-foot b{color:#f2f5ff}
    .ec-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 14px}
    .ec-stat{background:#0e1528;border:1px solid #ffd23f33;border-radius:12px;padding:10px 6px;
      display:flex;flex-direction:column;align-items:center;gap:2px;min-height:72px;justify-content:center}
    .ec-stat b{font-size:16px;color:#ffd23f}
    .ec-stat small{font-size:10px;color:#9fb0d9;font-weight:700}
  </style>`;

  const icon = iconHtml(meta);

  if (kind === 'campaign') {
    el.innerHTML = `${style}<div class="ec-body">
      <div class="ec-icon">${icon}</div>
      <h1 class="ec-title">${meta.title}</h1>
      <p class="ec-sub">${s.outcome === 'win' || s.outcome === 'victory' ? 'Every planet is yours' : 'No planets left'}</p>
      <div class="ec-grid" role="list">
        <div class="ec-stat" role="listitem"><b>${owned}/${total || owned}</b><small>Planets</small></div>
        <div class="ec-stat" role="listitem"><b>${won}/${fought || won}</b><small>Battles</small></div>
        <div class="ec-stat" role="listitem"><b>${totalPts}</b><small>Credits</small></div>
        <div class="ec-stat" role="listitem"><b>${survivors.length}</b><small>Units</small></div>
      </div></div>`;
    whenTrooperReady(() => swapTrooperIcons(el));
    return;
  }

  const planetLine = planet ? `${planet.name || planet || ''}`.trim() : '';
  el.innerHTML = `${style}<div class="ec-body">
    <div class="ec-icon">${icon}</div>
    <h1 class="ec-title">${meta.title}</h1>
    ${planetLine ? `<p class="ec-sub">${planetLine}</p>` : ''}
    <div class="ec-pts"><small>Credits</small> <b>+${ptsEarned}</b> <span class="ec-muted">· total ${totalPts}</span></div>
    <div class="ec-cols">
      <div>
        <div class="ec-lab">Survived</div>
        <div class="ec-row">${unitRow(survivors, false)}</div>
      </div>
      <div>
        <div class="ec-lab">Lost</div>
        <div class="ec-row">${unitRow(lost, true)}</div>
      </div>
    </div>
    <p class="ec-foot"><small>Enemy out</small> <b>${enemyDestroyed}</b></p>
    ${extraStats}
  </div>`;
  whenTrooperReady(() => swapTrooperIcons(el));
}
