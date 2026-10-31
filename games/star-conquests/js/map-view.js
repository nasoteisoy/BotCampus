/**
 * Guided Galactic Conquest map (BF2-inspired).
 * States: idle → select → target → confirm
 * Pan/zoom with dismissible first-view hint. Biome orbs (no emoji art).
 */
import { PLANETS, LINKS, BIOME_COLOR, planetById, planetPos, neighbors } from './galaxy.js';
import { GROUND_TYPES, SPACE_TYPES } from './shop.js';
import { PLAYER, ENEMY } from './state.js';
import { icon } from './icons.js';

const TIP_KEY = 'star-conquests:map-tip-v1';
const GUIDE_KEY = 'star-conquests:guide-v1';

export function tipSeen() {
  try { return localStorage.getItem(TIP_KEY) === '1'; } catch { return false; }
}
export function markTipSeen() {
  try { localStorage.setItem(TIP_KEY, '1'); } catch { /* */ }
}
export function guideSeen() {
  try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return false; }
}
export function markGuideSeen() {
  try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* */ }
}

/** CSS biome orb (3D-looking sphere, no emoji). */
export function biomeOrbHtml(biome, size = 44) {
  const c = BIOME_COLOR[biome] || '#888';
  return `<span class="biome-orb" style="--bc:${c};width:${size}px;height:${size}px" aria-hidden="true"></span>`;
}

export function fleetChipHtml({ owner, ground, space, moved }) {
  const side = owner === PLAYER ? 'mine' : 'foe';
  return `<span class="fleet-chip ${side}${moved ? ' moved' : ''}" title="Fleet">
    <span class="fc-g">${icon('users', { size: 12 })} ${ground}</span>
    <span class="fc-s">${icon('rocket', { size: 12 })} ${space}</span>
  </span>`;
}

/**
 * Attach pan/zoom to #map-stage. Returns controller { reset, destroy }.
 */
export function attachPanZoom(stageEl, { onHintDismiss } = {}) {
  const world = stageEl.querySelector('#map-world');
  if (!world) return { reset() {}, destroy() {} };
  let scale = 1, tx = 0, ty = 0;
  let dragging = false, lastX = 0, lastY = 0, moved = false;
  const pointers = new Map();
  let pinch0 = 0, scale0 = 1;

  function apply() {
    world.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
  }
  function reset() { scale = 1; tx = 0; ty = 0; apply(); }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(e) {
    // Let planet / UI buttons receive real clicks — don't capture or drag from them
    const t = e.target;
    if (t && (t.closest?.('.planet') || t.closest?.('button') || t.closest?.('.map-tip') || t.closest?.('.confirm-sheet'))) {
      return;
    }
    stageEl.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true; lastX = e.clientX; lastY = e.clientY; moved = false;
    } else if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch0 = dist(p1, p2); scale0 = scale; dragging = false;
    }
  }
  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      const d = dist(p1, p2);
      if (pinch0 > 0) {
        scale = Math.min(2.4, Math.max(0.7, scale0 * (d / pinch0)));
        apply();
      }
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    lastX = e.clientX; lastY = e.clientY;
    tx += dx; ty += dy;
    apply();
  }
  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
    if (pointers.size === 0) dragging = false;
  }
  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    scale = Math.min(2.4, Math.max(0.7, scale * delta));
    apply();
  }

  stageEl.addEventListener('pointerdown', onPointerDown);
  stageEl.addEventListener('pointermove', onPointerMove);
  stageEl.addEventListener('pointerup', onPointerUp);
  stageEl.addEventListener('pointercancel', onPointerUp);
  stageEl.addEventListener('wheel', onWheel, { passive: false });

  return {
    reset,
    didDrag: () => moved,
    destroy() {
      stageEl.removeEventListener('pointerdown', onPointerDown);
      stageEl.removeEventListener('pointermove', onPointerMove);
      stageEl.removeEventListener('pointerup', onPointerUp);
      stageEl.removeEventListener('pointercancel', onPointerUp);
      stageEl.removeEventListener('wheel', onWheel);
    },
  };
}

/**
 * Paint planets + links into map-world. opts:
 *  state, landscape, guideStep ('idle'|'select'|'target'|'confirm'),
 *  selectedId, targetId, fleetIds, movedFleets Set,
 *  onSelectPlanet(id)
 */
export function paintMapWorld(root, opts) {
  const {
    state, landscape, selectedId, targetId, highlightIds = [],
    movedFleets = new Set(), onSelectPlanet,
  } = opts;
  const svg = root.querySelector('#map-svg');
  const nodes = root.querySelector('#planets');
  if (!svg || !nodes) return;

  let lines = '';
  for (const [a, b] of LINKS) {
    const A = planetPos(planetById(a), landscape);
    const B = planetPos(planetById(b), landscape);
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const inset = Math.min(3.5, len * 0.22);
    const x1 = A.x + (dx / len) * inset;
    const y1 = A.y + (dy / len) * inset;
    const x2 = B.x - (dx / len) * inset;
    const y2 = B.y - (dy / len) * inset;
    const hot = (selectedId && ((a === selectedId && highlightIds.includes(b)) || (b === selectedId && highlightIds.includes(a))));
    lines += `<line x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%" class="link${hot ? ' hot' : ''}"/>`;
  }
  svg.innerHTML = lines;

  nodes.innerHTML = '';
  for (const p of PLANETS) {
    const owner = state.owners[p.id];
    const g = state.garrisons[p.id] || [];
    const pos = planetPos(p, landscape);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'planet'
      + (selectedId === p.id ? ' on' : '')
      + (targetId === p.id ? ' target' : '')
      + (highlightIds.includes(p.id) ? ' hl' : '')
      + (owner === PLAYER ? ' mine' : ' foe');
    btn.style.left = pos.x + '%';
    btn.style.top = pos.y + '%';
    btn.style.setProperty('--biome', BIOME_COLOR[p.biome] || '#888');
    btn.dataset.id = p.id;
    btn.setAttribute('aria-label', `${p.name}, ${owner === PLAYER ? 'yours' : 'enemy'}`);
    const nG = g.filter((u) => GROUND_TYPES.has(u.type)).length;
    const nS = g.filter((u) => SPACE_TYPES.has(u.type)).length;
    const orbSize = 28 + p.size * 8;
    btn.innerHTML = `
      ${biomeOrbHtml(p.biome, orbSize)}
      <span class="p-name">${p.name}</span>
      <span class="p-own-dot" title="${owner === PLAYER ? 'Yours' : 'Enemy'}"></span>
      ${fleetChipHtml({ owner, ground: nG, space: nS, moved: movedFleets.has(p.id) })}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelectPlanet?.(p.id);
    });
    nodes.appendChild(btn);
  }
}

/** Step guide strip HTML. */
export function guideStripHtml(step, { fromName, toName, noFleet } = {}) {
  const steps = [
    { id: 'idle', n: '1', ico: 'flag', label: 'Pick fleet' },
    { id: 'select', n: '2', ico: 'planet', label: 'Linked' },
    { id: 'fly', n: '3', ico: 'rocket', label: 'Fly' },
    { id: 'battle', n: '4', ico: 'swords', label: 'Battle' },
  ];
  const idx = { idle: 0, select: 1, target: 1, fly: 2, confirm: 2, battle: 3 }[step] ?? 0;
  const pills = steps.map((s, i) => {
    const on = i === idx;
    const lab = on ? `<span class="gs-lab">${s.label}</span>` : '';
    return `<span class="guide-step${on ? ' on' : ''}${i < idx ? ' done' : ''}" title="${s.label}">`
      + `<span class="gs-n">${s.n}</span>${icon(s.ico, { size: 13 })}${lab}</span>`;
  }).join('');
  let detail = 'Tap your fleet (a planet with a ship).';
  if (noFleet) detail = 'No fleet here — buy a SpaceShip in the Shop.';
  if (step === 'select') detail = `<b>${fromName || 'Fleet'}</b> ready — tap a linked planet.`;
  if (step === 'target' || step === 'confirm') detail = `<b>You</b> → <b>${toName || '…'}</b> — confirm to fly.`;
  if (step === 'fly') detail = 'Fleet en route…';
  if (step === 'battle') detail = 'Battle!';
  return `<div class="guide-strip" id="guide-strip">${pills}<p class="guide-detail">${detail}</p></div>`;
}
