// Star Conquests — shell integrator (title, menu, howto, map, shop, pause, battles, result, win/lose).
import { PLANETS, LINKS, BIOME_COLOR, neighbors, planetById, planetPos } from './galaxy.js';
import { CATALOG, STAT_LABELS, BAR_STATS, GROUND_TYPES, SPACE_TYPES, unitIconHtml, unitThumbHtml, warmUnitThumbs } from './shop.js';
import { hasSave, loadSave, clearSave, loadSettings, writeSettings } from './save.js';
import {
  newGame, restoreGame, autosave, buyUnit, moveUnits, prepareAttack,
  applyStageResult, resolveAttackEnd, enemyPlan, applyEnemyMove,
  prepareEnemyAttack, endPlayerTurn, endEnemyTurn, checkEnd,
  fleetAlreadyMoved, markFleetMoved, planetHasFleet, fleetShipType,
  turnIncome,
  PLAYER, ENEMY, COLORS,
} from './state.js';
import { runFullAttack } from './battle-runner.js';
import { renderEndCard } from './endcard.js';
import { icon, iconBtn } from './icons.js';
import {
  tipSeen, markTipSeen, guideSeen, markGuideSeen,
  guideStripHtml, biomeOrbHtml,
} from './map-view.js';
import { createGalaxy3d } from './galaxy3d.js';
import {
  computeBattleTickets, computeGroundClasses, applyPassiveStatsToUnits,
  publishLastGroundOpts, ownedPassiveMods, BASE_CLASSES,
} from './flow-helpers.js';

const app = document.getElementById('app');
let state = null;
let selectedUnits = new Set();
let mode = 'title';
let toastTimer = 0;
let settings = loadSettings();
let howtoPage = 0;
let howtoReturn = 'title'; // title | map | pause
let lastResult = null; // { points, retreated, survivors, lost, planet, winnerLabel }
let audioCtx = null;
let battlePaused = false;
let guideStep = 'idle'; // idle | select | target
let targetPlanet = null;
let panZoom = null;
let pendingConfirm = null; // { act, from, to, unitIds }
let galaxy3d = null;
let sheetOpen = false;
let shopTab = 'fleets'; // fleets | classes | bonuses

/* ---------- sound (WebAudio blip; respects mute) ---------- */
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* */ }
  }
  return audioCtx;
}
function blip(kind = 'tap') {
  if (!settings.soundOn) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime;
    if (kind === 'ok') { o.frequency.value = 660; g.gain.setValueAtTime(0.08, now); }
    else if (kind === 'bad') { o.frequency.value = 180; g.gain.setValueAtTime(0.07, now); }
    else if (kind === 'win') { o.frequency.value = 880; g.gain.setValueAtTime(0.09, now); }
    else { o.frequency.value = 440; g.gain.setValueAtTime(0.06, now); }
    o.type = 'square';
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    o.start(now); o.stop(now + 0.09);
  } catch { /* */ }
}
function press(btn) {
  if (!btn) return;
  btn.classList.add('pressed');
  setTimeout(() => btn.classList.remove('pressed'), 120);
  blip('tap');
}

function clearToast() {
  const el = document.getElementById('toast');
  if (el) el.classList.remove('show');
  clearTimeout(toastTimer);
}
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 800);
}

function show(screen) {
  mode = screen;
  for (const el of app.querySelectorAll('.screen')) {
    if (!el.classList.contains('hidden')) {
      el.classList.add('leaving');
      el.classList.add('hidden');
      el.classList.remove('leaving');
    } else {
      el.classList.add('hidden');
    }
  }
  const s = app.querySelector(`#scr-${screen}`);
  if (s) {
    s.classList.remove('hidden');
    s.classList.add('entering');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => s.classList.remove('entering'));
    });
  }
}

/* ---------- Title / Menu ---------- */

/* ---------- Menu 3D backdrop (planet + fleet + BattleShip) ---------- */
let menu3dApi = null;
async function ensureMenu3d() {
  const canvas = document.getElementById('menu3d');
  if (!canvas) return menu3dApi;
  if (menu3dApi?.ready) {
    // nudge resize if we were created before layout
    try { window.dispatchEvent(new Event('resize')); } catch {}
    return menu3dApi;
  }
  try {
    const THREE = await import('../vendor/three.module.min.js');
    const ships = await import('../space/ships3d.js');
    // Wait a frame so absolute-fill CSS has laid out the canvas
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let w = canvas.clientWidth || window.innerWidth;
    let h = canvas.clientHeight || window.innerHeight;
    if (w < 64 || h < 64) { w = window.innerWidth; h = window.innerHeight; }
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
    cam.position.set(0.3, 1.0, 6.2);
    scene.add(new THREE.AmbientLight(0x6a7ab0, 0.85));
    const key = new THREE.DirectionalLight(0xffe6b0, 1.1);
    key.position.set(4, 6, 3); scene.add(key);
    // Planet
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 128, 64);
    grd.addColorStop(0, '#1a3a6a'); grd.addColorStop(0.45, '#2f8f5a'); grd.addColorStop(1, '#c9a24a');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 48, 32),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 })
    );
    planet.position.set(-1.4, 0.1, -0.6);
    scene.add(planet);
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.72, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x4fd1ff, transparent: true, opacity: 0.12, side: THREE.BackSide })
    );
    planet.add(atmo);
    // Fleet SpaceShip
    const fleet = ships.buildSpaceShip('default', '#4fd1ff');
    fleet.scale.setScalar(0.55);
    fleet.scale.setScalar(0.85);
    fleet.position.set(1.1, 0.9, 1.4);
    scene.add(fleet);
    // BattleShip
    const bs = ships.buildBattleShip('default', '#ffd23f');
    bs.scale.setScalar(1.05);
    bs.position.set(2.4, -0.15, 0.8);
    scene.add(bs);
    let raf = 0; let alive = true;
    const tick = (t) => {
      if (!alive) return;
      const sec = t * 0.001;
      planet.rotation.y = sec * 0.18;
      fleet.position.y = 0.6 + Math.sin(sec * 1.4) * 0.15;
      fleet.rotation.y = sec * 0.6;
      bs.position.y = -0.4 + Math.sin(sec * 1.1 + 1) * 0.12;
      bs.rotation.y = -sec * 0.35;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onResize = () => {
      const ww = canvas.clientWidth || window.innerWidth;
      const hh = canvas.clientHeight || window.innerHeight;
      cam.aspect = ww / Math.max(1, hh);
      cam.updateProjectionMatrix();
      renderer.setSize(ww, hh, false);
    };
    window.addEventListener('resize', onResize);
    menu3dApi = {
      ready: true,
      dispose() {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
        menu3dApi = null;
      },
    };
    return menu3dApi;
  } catch (err) {
    console.warn('menu3d fail', err);
    menu3dApi = { ready: false, error: err };
    return menu3dApi;
  }
}

function renderTitle() {
  show('title');
  ensureMenu3d();
  const has = hasSave();
  const cont = app.querySelector('#btn-continue');
  const neu = app.querySelector('#btn-new');
  cont.classList.toggle('hidden', !has);
  cont.hidden = !has;
  neu.innerHTML = has
    ? `${icon('play', { size: 36 })}<span class="lb">New game</span>`
    : `${icon('play', { size: 36 })}<span class="lb">Play</span>`;
  if (cont) cont.innerHTML = `${icon('play', { size: 28 })}<span class="lb">Continue</span>`;
  const ht = app.querySelector('#btn-howto');
  if (ht) ht.innerHTML = `${icon('help', { size: 28 })}<span class="lb">How to Play</span>`;
  const st = app.querySelector('#btn-settings');
  if (st) st.innerHTML = `${icon('settings', { size: 28 })}<span class="lb">Settings</span>`;
  refreshSoundButtons();
}

function startNew() {
  clearSave();
  state = newGame();
  selectedUnits = new Set();
  guideStep = 'idle';
  targetPlanet = null;
  pendingConfirm = null;
  sheetOpen = false;
  autosave(state);
  try { warmUnitThumbs(96); } catch { /* */ }
  renderMap();
}

function continueGame() {
  const data = loadSave();
  if (!data) { startNew(); return; }
  state = restoreGame(data);
  selectedUnits = new Set();
  if (state.result === 'win' || state.result === 'lose') renderEnd();
  else renderMap();
  toast('Loaded');
}

/* ---------- How to Play (picture-led, no emoji art) ---------- */
const HOWTO_PAGES = [
  {
    pic: 'goal',
    title: 'Goal',
    body: `<p>Conquer every planet. Win battles to earn <b>credits</b>, buy units, push outward.</p>
      <p>Hold all worlds to win. Lose your last world and you fall.</p>`,
  },
  {
    pic: 'battle',
    title: 'Battles',
    body: `<p>Each attack is Galactic Conquest style: <b>space first</b> (if ships), then <b>ground</b>.</p>
      <p>Tickets drain when units fall. Capture the world to claim its command post and a credit bonus.</p>`,
  },
  {
    pic: 'map',
    title: 'Map',
    body: `<p>Tap a world you own to pick its <b>fleet</b>. Then tap a linked world to move or attack.</p>
      <p>One fleet move per turn. Drag to pan · pinch (or wheel) to zoom.</p>`,
  },
  {
    pic: 'units',
    title: 'Units',
    body: '', // filled from catalog
  },
];

function howtoPicHtml(kind) {
  const shots = {
    goal: 'img/howto-goal.png',
    battle: 'img/howto-battle.png',
    map: 'img/howto-map.png',
    units: 'img/howto-fleet.png',
  };
  const src = shots[kind];
  if (src) {
    return `<div class="ht-pic ht-shot"><img src="${src}" alt="" loading="lazy" /></div>`;
  }
  return `<div class="ht-pic">${icon('users', { size: 48 })}</div>`;
}

function howtoUnitsHtml() {
  return `<div class="ht-units">${CATALOG.map((c) => {
    const stats = STAT_LABELS.map((s) =>
      `<span class="stat"><small>${s.word}</small><b>${c.stats[s.key]}</b></span>`).join('');
    return `<div class="ht-unit">
      ${unitThumbHtml(c.type, 48)}
      <div class="ht-uinfo">
        <b>${c.name}</b>
        <small>${c.cost} credits · ${c.role === 'ground' ? 'Ground' : 'Space'}</small>
        <div class="sc-stats">${stats}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function renderHowto(returnTo) {
  if (returnTo) howtoReturn = returnTo;
  show('howto');
  paintHowto();
}

function paintHowto() {
  const pages = HOWTO_PAGES;
  if (howtoPage < 0) howtoPage = 0;
  if (howtoPage >= pages.length) howtoPage = pages.length - 1;
  const p = pages[howtoPage];
  const pic = app.querySelector('#ht-pic');
  if (pic) pic.innerHTML = howtoPicHtml(p.pic);
  app.querySelector('#ht-title').textContent = p.title;
  app.querySelector('#ht-body').innerHTML = howtoPage === 3 ? howtoUnitsHtml() : p.body;
  app.querySelector('#ht-dots').innerHTML = pages.map((_, i) =>
    `<button type="button" class="ht-dot${i === howtoPage ? ' on' : ''}" data-p="${i}" aria-label="Page ${i + 1}"></button>`).join('');
  app.querySelector('#ht-prev').disabled = howtoPage === 0;
  app.querySelector('#ht-next').disabled = howtoPage === pages.length - 1;
  app.querySelector('#ht-page').textContent = `${howtoPage + 1}/${pages.length}`;
  app.querySelectorAll('#ht-dots .ht-dot').forEach((b) => {
    b.addEventListener('click', () => { howtoPage = +b.dataset.p; paintHowto(); blip(); });
  });
}

function closeHowto() {
  if (howtoReturn === 'pause') {
    show('battle');
    openPauseMenu(false);
  } else if (howtoReturn === 'map' && state) {
    renderMap();
  } else {
    renderTitle();
  }
}

/* ---------- Settings ---------- */
function soundLabelHtml() {
  const on = settings.soundOn;
  return `${icon(on ? 'volume' : 'mute', { size: 22 })}<span class="lb">Sound</span><span class="${on ? 'on-chip' : 'off-chip'}">${on ? 'ON' : 'OFF'}</span>`;
}
function refreshSoundButtons() {
  const html = soundLabelHtml();
  for (const id of ['btn-settings-sound', 'set-sound', 'pause-sound']) {
    const el = app.querySelector('#' + id);
    if (el) el.innerHTML = html;
  }
}
function toggleSound() {
  settings.soundOn = !settings.soundOn;
  writeSettings(settings);
  refreshSoundButtons();
  blip(settings.soundOn ? 'ok' : 'bad');
}

function renderSettings() {
  show('settings');
  refreshSoundButtons();
}

/* ---------- Map (3D galaxy + fleet fly) ---------- */
function ensureGalaxy3d() {
  const stage = app.querySelector('#map-stage');
  if (!stage) return;
  if (galaxy3d?.ready) return;
  if (galaxy3d && !galaxy3d.ready && !galaxy3d.error) return; // booting
  galaxy3d = createGalaxy3d(stage, {
    onSelect: (id) => onPlanetTap(id),
    onEmpty: () => {
      if (guideStep === 'target' || guideStep === 'select') {
        guideStep = guideStep === 'target' ? 'select' : 'idle';
        if (guideStep === 'idle') { targetPlanet = null; pendingConfirm = null; closeSheet(); }
        else { targetPlanet = null; pendingConfirm = null; }
        renderMap();
      } else {
        closeSheet();
        state.selected = null;
        renderMap();
      }
    },
    onReady: () => { if (state && mode === 'map') renderMap(); },
  });
}

function dismissMapTip() {
  markTipSeen();
  app.querySelector('#map-tip')?.remove();
}
function dismissFirstTip() {
  markGuideSeen();
  app.querySelector('#first-tip')?.remove();
}

function closeSheet() {
  sheetOpen = false;
  const panel = app.querySelector('#panel');
  if (panel) {
    panel.classList.add('hidden');
    panel.classList.remove('sheet-slim');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = '';
  }
  syncFloatVisibility();
}

function openSheet() {
  sheetOpen = true;
  const panel = app.querySelector('#panel');
  if (panel) { panel.classList.remove('hidden'); panel.setAttribute('aria-hidden', 'false'); }
  syncFloatVisibility();
}

function syncFloatVisibility() {
  const fa = app.querySelector('.float-actions');
  if (!fa) return;
  const confirmOpen = !!app.querySelector('#confirm-host:not(.hidden) .confirm-sheet');
  const hide = sheetOpen || confirmOpen || !!document.getElementById('battle-intro');
  fa.classList.toggle('is-hidden', hide);
  fa.setAttribute('aria-hidden', hide ? 'true' : 'false');
}

function renderMap() {
  show('map');
  ensureGalaxy3d();
  const st = state;
  if (!st.movedFleets) st.movedFleets = [];

  const setTxt = (id, v) => { const el = app.querySelector('#' + id); if (el) el.textContent = v; };
  setTxt('pts', st.points);
  setTxt('turn-n', st.turn);
  setTxt('phase-l', st.phase === 'enemy' ? 'Enemy' : 'You');
  const mineN = PLANETS.filter((p) => st.owners[p.id] === PLAYER).length;
  setTxt('worlds-n', `${mineN}/${PLANETS.length}`);

  const fromP = planetById(st.selected);
  const toP = planetById(targetPlanet);
  const noFleet = st.selected && st.owners[st.selected] === PLAYER && !planetHasFleet(st, st.selected);
  const gEl = app.querySelector('#guide-host');
  if (gEl) gEl.innerHTML = guideStripHtml(guideStep, { fromName: fromP?.name, toName: toP?.name, noFleet });

  const hl = [];
  if ((guideStep === 'select' || guideStep === 'target') && st.selected) {
    hl.push(...neighbors(st.selected));
  }
  const dim = guideStep === 'target' || guideStep === 'select';

  if (galaxy3d?.ready) {
    galaxy3d.setSelection(st.selected, hl, dim);
    galaxy3d.refresh(st);
    if ((guideStep === 'select' || guideStep === 'target') && st.selected) {
      const ids = [st.selected, ...neighbors(st.selected)];
      galaxy3d.fitSelection?.(ids);
      // Slim sheet paints after this; refit once chrome insets include it
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (galaxy3d?.ready) galaxy3d.fitSelection?.(ids);
        });
      });
    } else if (guideStep === 'idle' && !st.selected) {
      galaxy3d.fitAll?.();
    }
  }

  if (sheetOpen && st.selected) renderPanel();
  else if (!sheetOpen) closeSheet();

  renderConfirmSheet();

  // Short orbit tip — never over Shop/End turn
  if (!tipSeen() && !app.querySelector('#map-tip') && !sheetOpen) {
    const stage = app.querySelector('#map-stage');
    if (stage) {
      const tip = document.createElement('div');
      tip.id = 'map-tip'; tip.className = 'map-tip map-tip-safe';
      const zoomHint = (window.matchMedia && window.matchMedia('(hover: none)').matches)
        ? 'pinch to zoom' : 'scroll to zoom';
      tip.innerHTML = `<p>Drag to orbit · ${zoomHint}</p>
        <button type="button" class="btn primary" id="map-tip-ok">Got it</button>`;
      stage.appendChild(tip);
      tip.querySelector('#map-tip-ok').addEventListener('click', (e) => { press(e.currentTarget); dismissMapTip(); });
    }
  }
  syncFloatVisibility();
}

function onPlanetTap(id) {
  if (!state || state.phase !== 'player') return;
  if (guideStep === 'fly' || guideStep === 'battle') return;
  dismissMapTip(); dismissFirstTip();
  const owner = state.owners[id];

  if (guideStep === 'idle') {
    state.selected = id;
    selectedUnits = new Set((state.garrisons[id] || []).map((u) => u.id));
    targetPlanet = null; pendingConfirm = null;
    openSheet();
    if (owner === PLAYER && planetHasFleet(state, id) && !fleetAlreadyMoved(state, id)) {
      guideStep = 'select';
    } else {
      guideStep = 'idle';
    }
    renderMap();
    return;
  }

  if (guideStep === 'select') {
    if (owner === PLAYER && id !== state.selected) {
      // switch fleet
      state.selected = id;
      selectedUnits = new Set((state.garrisons[id] || []).map((u) => u.id));
      targetPlanet = null; pendingConfirm = null;
      openSheet();
      if (planetHasFleet(state, id) && !fleetAlreadyMoved(state, id)) guideStep = 'select';
      else guideStep = 'idle';
      renderMap();
      return;
    }
    if (state.selected && neighbors(state.selected).includes(id)) {
      if (!planetHasFleet(state, state.selected)) {
        toast('Buy a SpaceShip to move this army'); blip('bad'); return;
      }
      targetPlanet = id;
      guideStep = 'target';
      const unitIds = [...selectedUnits];
      // always take whole fleet cargo + ships
      const all = (state.garrisons[state.selected] || []).map((u) => u.id);
      pendingConfirm = {
        act: owner === PLAYER ? 'move' : 'attack',
        from: state.selected, to: id,
        unitIds: all.length ? all : unitIds,
      };
      closeSheet();
      renderMap();
      return;
    }
    // tap same / empty
    return;
  }

  if (guideStep === 'target') {
    if (id === state.selected) {
      guideStep = 'select'; targetPlanet = null; pendingConfirm = null; renderMap(); return;
    }
    if (state.selected && neighbors(state.selected).includes(id)) {
      targetPlanet = id;
      const all = (state.garrisons[state.selected] || []).map((u) => u.id);
      pendingConfirm = {
        act: owner === PLAYER ? 'move' : 'attack',
        from: state.selected, to: id, unitIds: all,
      };
      closeSheet();
      renderMap();
    }
  }
}

function renderConfirmSheet() {
  const host = app.querySelector('#confirm-host');
  if (!host) return;
  if (guideStep !== 'target' || !pendingConfirm) {
    host.innerHTML = ''; host.classList.add('hidden'); return;
  }
  host.classList.remove('hidden');
  const from = planetById(pendingConfirm.from);
  const to = planetById(pendingConfirm.to);
  const isAtk = pendingConfirm.act === 'attack';
  const fromOrb = biomeOrbHtml(from.biome, 48);
  const toOrb = biomeOrbHtml(to.biome, 48);
  host.innerHTML = `
    <div class="confirm-sheet">
      <h3>${isAtk ? 'Attack' : 'Move fleet'}</h3>
      <div class="cfm-vs">
        <div class="cfm-side">${fromOrb}<b>You</b><small>${from.name}</small></div>
        <span class="cfm-arrow">${icon('rocket', { size: 28 })}</span>
        <div class="cfm-side">${toOrb}<b>${isAtk ? 'Them' : 'Ally'}</b><small>${to.name}</small></div>
      </div>
      <div class="row">
        <button type="button" class="btn secondary" id="cfm-cancel">${icon('x', { size: 20 })}<span class="lb">Cancel</span></button>
        <button type="button" class="btn primary" id="cfm-go">${icon(isAtk ? 'sword' : 'move', { size: 20 })}<span class="lb">Go</span></button>
      </div>
    </div>`;
  host.querySelector('#cfm-cancel').addEventListener('click', (e) => {
    press(e.currentTarget);
    guideStep = 'select'; targetPlanet = null; pendingConfirm = null; renderMap();
  });
  host.querySelector('#cfm-go').addEventListener('click', async (e) => {
    press(e.currentTarget);
    const pc = pendingConfirm;
    pendingConfirm = null;
    if (!pc) return;
    host.classList.add('hidden'); host.innerHTML = '';
    closeSheet();
    guideStep = 'fly';
    renderMap();
    try { await galaxy3d?.flyFleet(pc.from, pc.to); } catch { /* */ }
    if (pc.act === 'move') {
      const r = moveUnits(state, pc.from, pc.to, pc.unitIds);
      guideStep = 'idle'; targetPlanet = null;
      if (!r.ok) { toast(r.reason === 'nofleet' ? 'Need a fleet' : 'Cannot move'); blip('bad'); renderMap(); return; }
      selectedUnits = new Set();
      state.selected = pc.to;
      toast('Fleet arrived'); blip('ok');
      renderMap();
      return;
    }
    guideStep = 'battle';
    renderMap();
    beginAttack(pc.from, pc.to, pc.unitIds);
  });
}

function selectPlanet(id) { onPlanetTap(id); }

function renderPanel() {
  const panel = app.querySelector('#panel');
  if (!panel || !sheetOpen) return;
  const id = state.selected;
  const p = planetById(id);
  if (!p) { closeSheet(); return; }
  openSheet();
  const owner = state.owners[id];
  const g = state.garrisons[id] || [];
  const mine = owner === PLAYER;
  const moved = fleetAlreadyMoved(state, id);
  const hasFleet = planetHasFleet(state, id);
  const slim = mine && (guideStep === 'select' || guideStep === 'target') && hasFleet && !moved;
  panel.classList.toggle('sheet-slim', !!slim);

  const passive = p.passive;
  const passiveLine = passive ? `<div class="sheet-passive"><b>${passive.label}</b></div>` : '';

  if (slim) {
    let html = `${passiveLine}<div class="sheet-slim-row">
      <button type="button" class="icon-lbl" id="sheet-close">${icon('x', { size: 18 })}<span class="lb">Close</span></button>
      <div class="sheet-slim-thumbs">`;
    for (const u of g) {
      html += `<span class="slim-thumb" title="${u.name}">${unitThumbHtml(u.type, 40)}</span>`;
    }
    html += `</div>
      <span class="sheet-slim-hint">${guideStep === 'target' ? 'Confirm above' : 'Tap a linked world'}</span>
    </div>`;
    panel.innerHTML = html;
    panel.querySelector('#sheet-close')?.addEventListener('click', (e) => {
      press(e.currentTarget); closeSheet(); guideStep = 'idle'; targetPlanet = null; pendingConfirm = null; renderMap();
    });
    syncFloatVisibility();
    return;
  }

  let html = `
    <div class="sheet-head">
      <button type="button" class="icon-lbl" id="sheet-close">${icon('x', { size: 18 })}<span class="lb">Close</span></button>
      ${biomeOrbHtml(p.biome, 36)}
      <div class="sheet-title"><b>${p.name}</b><small>${p.biome} · ${mine ? 'Yours' : 'Enemy'}${hasFleet ? ' · Fleet' : ''}</small></div>
    </div>
    ${passiveLine}
    <div class="pan-units" role="list">`;
  if (!g.length) html += `<p class="empty">No units</p>`;
  for (const u of g) {
    const canPick = mine && state.phase === 'player' && !moved;
    const on = selectedUnits.has(u.id);
    html += `<button type="button" class="unit ${on ? 'on' : ''}" data-uid="${u.id}" ${canPick ? '' : 'disabled'}
      aria-pressed="${on}" aria-label="${u.name}">
      ${unitThumbHtml(u.type, 72)}
      <span class="u-nm">${u.name}</span>
      <span class="u-hp"><small>HP</small> ${Math.ceil(u.hpNow)}/${u.stats.hp}</span>
    </button>`;
  }
  html += `</div><div class="pan-actions sticky-actions">`;
  if (mine && state.phase === 'player') {
    html += `<button type="button" class="btn secondary" id="sheet-selectall">${icon('users', { size: 18 })}<span class="lb">Select all</span></button>`;
    if (!hasFleet) {
      html += `<button type="button" class="btn primary" id="sheet-shop">${icon('shop', { size: 18 })}<span class="lb">Buy fleet</span></button>`;
    } else if (moved) {
      html += `<p class="tip">Fleet already acted this turn.</p>`;
    } else {
      html += `<button type="button" class="btn primary" id="sheet-pick">${icon('target', { size: 18 })}<span class="lb">Pick target</span></button>`;
    }
  }
  html += `</div>`;
  panel.innerHTML = html;
  panel.querySelector('#sheet-close')?.addEventListener('click', (e) => {
    press(e.currentTarget); closeSheet(); guideStep = 'idle'; targetPlanet = null; pendingConfirm = null; renderMap();
  });
  panel.querySelector('#sheet-selectall')?.addEventListener('click', (e) => {
    press(e.currentTarget);
    selectedUnits = new Set((state.garrisons[id] || []).map((u) => u.id));
    if (hasFleet && !moved) guideStep = 'select';
    renderPanel(); renderMap();
  });
  panel.querySelector('#sheet-shop')?.addEventListener('click', (e) => { press(e.currentTarget); renderShop(); });
  panel.querySelector('#sheet-pick')?.addEventListener('click', (e) => {
    press(e.currentTarget);
    if (hasFleet && !moved) { guideStep = 'select'; renderMap(); }
  });
  panel.querySelectorAll('.unit').forEach((btn) => {
    btn.addEventListener('click', () => {
      press(btn);
      const uid = btn.dataset.uid;
      if (selectedUnits.has(uid)) selectedUnits.delete(uid); else selectedUnits.add(uid);
      if (hasFleet && !moved) guideStep = 'select';
      renderPanel(); renderMap();
    });
  });
  syncFloatVisibility();
}

function onPanelAct() { /* unused — guided map */ }

/* ---------- Pause ---------- */
function openPauseMenu(dispatchPause = true) {
  battlePaused = true;
  const mount = app.querySelector('#battle-mount');
  const overlay = app.querySelector('#pause-overlay');
  const battleScr = app.querySelector('#scr-battle');
  if (overlay) overlay.classList.remove('hidden');
  if (battleScr) battleScr.classList.add('paused');
  refreshSoundButtons();
  // Always mark mount paused so shell CSS can hide ground HUD under the overlay
  if (mount) {
    mount.dataset.paused = '1';
    try { mount.setAttribute('inert', ''); } catch { /* */ }
    if (dispatchPause) mount.dispatchEvent(new CustomEvent('sc-pause'));
  }
}

function closePauseMenu(resume = true) {
  battlePaused = false;
  const overlay = app.querySelector('#pause-overlay');
  if (overlay) overlay.classList.add('hidden');
  const battleScr = app.querySelector('#scr-battle');
  if (battleScr && resume) battleScr.classList.remove('paused');
  const mount = app.querySelector('#battle-mount');
  if (mount) {
    try { mount.removeAttribute('inert'); } catch { /* */ }
    if (resume) {
      try { delete mount.dataset.paused; } catch { /* */ }
      if (battleScr) battleScr.classList.remove('paused');
      mount.dispatchEvent(new CustomEvent('sc-resume'));
    }
  }
}

function quitBattleToMap() {
  const mount = app.querySelector('#battle-mount');
  closePauseMenu(false);
  // Drop shell pause chrome so result/map can show buttons; keep mount frozen for runner teardown
  const battleScr = app.querySelector('#scr-battle');
  if (battleScr) battleScr.classList.remove('paused');
  if (mount) {
    mount.dataset.paused = '1'; // keep frozen while quitting
    try { mount.removeAttribute('inert'); } catch { /* */ }
    mount.dispatchEvent(new CustomEvent('sc-quit'));
  }
  // battle-runner / fallback resolve onDone; beginAttack awaits and shows result
}


function recordBattleStats({ won, retreated }) {
  if (!state) return;
  state.battlesFought = (state.battlesFought | 0) + 1;
  if (retreated) state.battlesRetreated = (state.battlesRetreated | 0) + 1;
  else if (won) state.battlesWon = (state.battlesWon | 0) + 1;
}

/* ---------- Battle + Result ---------- */
async function beginAttack(fromId, toId, unitIds) {
  const ctx = prepareAttack(state, fromId, toId, unitIds);
  if (!ctx.ok) {
    toast(ctx.reason === 'moved' ? 'Fleet already moved' : ctx.reason === 'nofleet' ? 'Need a fleet (SpaceShip)' : 'Cannot attack');
    blip('bad');
    return;
  }
  markFleetMoved(state, fromId, toId);
  guideStep = 'idle';
  targetPlanet = null;
  state.phase = 'battle';
  battlePaused = false;
  clearToast();
  show('battle');
  const mount = app.querySelector('#battle-mount');
  const label = app.querySelector('#battle-label');
  closePauseMenu(false);
  try { delete mount.dataset.paused; } catch { /* */ }

  const pointsBefore = state.points;
  // Apply owned-planet armor/attack passives to the player's attacking ground units
  ctx.attackers = applyPassiveStatsToUnits(state, ctx.attackers);
  const committedBefore = ctx.attackers.map((u) => ({ ...u, stats: { ...u.stats } }));

  const applyStage = (result, stage) => {
    const w = applyStageResult(state, ctx, result, stage);
    return w;
  };

  const groundClasses = computeGroundClasses(state);
  const groundTickets = computeBattleTickets(state, true);
  publishLastGroundOpts(groundClasses, groundTickets);

  await showBattleIntro({
    planetName: ctx.planet?.name,
    kind: 'space',
    attackerName: 'Your fleet',
    defenderName: 'Enemy',
    tickets: groundTickets,
  });

  const attackOut = await runFullAttack({
    ctx,
    playerIsAttacker: true,
    mount,
    onStage: (t) => { label.textContent = t === 'space' ? 'Space' : 'Ground'; },
    applyStage,
    classes: groundClasses,
    bonus: state.activeBonus || undefined,
    tickets: groundTickets,
  });
  const finalWinner = attackOut.finalWinner;
  const retreated = attackOut.retreated;

  // Retreat: no capture (finalWinner already defender from runner)
  const end = resolveAttackEnd(state, ctx, retreated ? 'defender' : finalWinner);
  selectedUnits = new Set();
  state.phase = 'player';

  const pointsGained = Math.max(0, state.points - pointsBefore);
  const liveAtt = (ctx.attackers || []).filter((u) => u.hpNow > 0);
  const lostAtt = committedBefore.filter((u) => !liveAtt.find((s) => s.id === u.id));
  const won = finalWinner === 'attacker' && !retreated;
  recordBattleStats({ won, retreated: !!retreated });

  lastResult = {
    points: pointsGained,
    retreated: !!retreated,
    survivors: liveAtt,
    lost: lostAtt,
    planet: ctx.planet,
    won,
    stageResult: attackOut.lastResult || null,
    stages: attackOut.stages || [],
    kills: attackOut.lastResult?.kills || null,
    cpsTaken: attackOut.lastResult?.cpsTaken || null,
    ticketsLeft: attackOut.lastResult?.ticketsLeft || groundTickets,
    battlesRetreated: state.battlesRetreated | 0,
  };
  consumeBonusAfterBattle();
  guideStep = 'idle';

  if (end === 'win' || end === 'lose') {
    renderResult(() => renderEnd());
    return;
  }
  renderResult(() => renderMap());
}

function renderResult(after) {
  show('result');
  const r = lastResult || { points: 0, retreated: false, survivors: [], lost: [], planet: null, won: false };
  const outcome = r.retreated ? 'retreat' : (r.won ? 'victory' : 'defeat');
  const body = app.querySelector('#res-body');
  const mine = state ? PLANETS.filter((p) => state.owners[p.id] === PLAYER).length : 0;
  const kills = r.kills;
  let enemyDestroyed = (kills && typeof kills === 'object')
    ? Math.max(0, kills.defender | 0)
    : ((r.lostEnemy | 0) || 0);
  if (!enemyDestroyed && (r.lostEnemy | 0)) enemyDestroyed = r.lostEnemy | 0;
  // Ensure AI-defense / thin summaries still show planet + tickets + kills
  const ticketsLeft = r.ticketsLeft || null;
  const killsForCard = kills || (enemyDestroyed || (r.lost || []).length
    ? { attacker: (r.lost || []).length, defender: enemyDestroyed }
    : null);
  renderEndCard(body, {
    kind: 'battle',
    outcome,
    planet: r.planet,
    pointsEarned: r.points | 0,
    totalPoints: state ? state.points : 0,
    survivors: r.survivors || [],
    lost: r.lost || [],
    enemyDestroyed,
    planetsOwned: mine,
    planetsTotal: PLANETS.length,
    battlesWon: state?.battlesWon | 0,
    battlesFought: state?.battlesFought | 0,
    kills: killsForCard,
    cpsTaken: r.cpsTaken,
    ticketsLeft,
  });
  // Dual-leg strip (space then ground) when both ran
  const stages = r.stages || [];
  if (stages.length) {
    const strip = document.createElement('div');
    strip.className = 'stage-strip';
    strip.innerHTML = stages.map((s) => {
      const won = s.result?.winner === 'attacker';
      const lab = s.type === 'space' ? 'Space' : (s.autoCapture ? 'Capture' : 'Ground');
      const tix = s.result?.ticketsLeft;
      const tixHtml = tix ? ` · tickets ${tix.attacker}/${tix.defender}` : '';
      return `<div class="stage-pill ${won ? 'win' : 'lose'}"><b>${lab}</b> ${won ? 'Won' : 'Lost'}${tixHtml}</div>`;
    }).join('');
    body.appendChild(strip);
  }
  if (r.retreated || (state?.battlesRetreated | 0) > 0) {
    const tip = document.createElement('p');
    tip.className = 'ec-foot retreat-stat';
    tip.innerHTML = `<small>Retreats</small> <b>${state?.battlesRetreated | 0}</b>`;
    body.appendChild(tip);
  }

  blip(outcome === 'victory' ? 'win' : 'bad');
  const cont = app.querySelector('#res-continue');
  cont.onclick = () => { press(cont); after && after(); };
}

/* ---------- Shop ---------- */
function renderShop() {
  show('shop');
  const planetId = state.selected;
  const p = planetById(planetId);
  if (!p || state.owners[planetId] !== PLAYER) {
    const own = PLANETS.find((x) => state.owners[x.id] === PLAYER);
    if (own) state.selected = own.id;
  }
  const dest = planetById(state.selected);
  app.querySelector('#shop-pts').textContent = state.points;
  app.querySelector('#shop-dest').textContent = dest.name;

  const pick = app.querySelector('#shop-planets');
  pick.innerHTML = '';
  for (const pl of PLANETS.filter((x) => state.owners[x.id] === PLAYER)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (pl.id === state.selected ? ' on' : '');
    b.textContent = pl.name;
    b.addEventListener('click', () => { press(b); state.selected = pl.id; renderShop(); });
    pick.appendChild(b);
  }

  // Tabs
  let tabs = app.querySelector('#shop-tabs');
  if (!tabs) {
    tabs = document.createElement('div');
    tabs.id = 'shop-tabs';
    tabs.className = 'shop-tabs';
    pick.after(tabs);
  }
  const tabDefs = [
    { id: 'fleets', lab: 'Fleets' },
    { id: 'classes', lab: 'Classes' },
    { id: 'bonuses', lab: 'Bonuses' },
  ];
  tabs.innerHTML = tabDefs.map((d) =>
    `<button type="button" class="shop-tab${shopTab === d.id ? ' on' : ''}" data-tab="${d.id}">${d.lab}</button>`
  ).join('');
  tabs.querySelectorAll('.shop-tab').forEach((b) => {
    b.addEventListener('click', () => { press(b); shopTab = b.dataset.tab; renderShop(); });
  });

  const grid = app.querySelector('#shop-grid');
  grid.className = 'shop-grid compact';
  grid.innerHTML = '';

  if (shopTab === 'fleets') {
    // Apply fleet discount from owned passives
    let disc = 0;
    for (const pl of PLANETS) {
      if (state.owners[pl.id] === PLAYER && pl.passive?.fleetDiscount) {
        disc = Math.max(disc, pl.passive.fleetDiscount);
      }
    }
    for (const c of CATALOG) {
      const cost = Math.max(1, Math.round(c.cost * (1 - (c.role === 'space' ? disc : 0))));
      const need = Math.max(0, cost - state.points);
      const can = need === 0;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'shop-card' + (can ? '' : ' cant');
      card.setAttribute('aria-disabled', can ? 'false' : 'true');
      const bars = BAR_STATS.map((s) => {
        const v = c.stats[s.key] || 0;
        const pct = Math.max(6, Math.min(100, Math.round((v / s.max) * 100)));
        return `<div class="sc-bar" title="${s.key === 'hp' ? 'Health' : s.key === 'attack' ? 'Attack' : s.key === 'speed' ? 'Speed' : s.key === 'armor' ? 'Armor' : s.key}"><span class="sc-bi">${icon(s.icon, { size: 11 })}</span>`
          + `<span class="sc-bt"><i style="width:${pct}%;background:${s.color}"></i></span></div>`;
      }).join('');
      const foot = can
        ? `<span class="sc-buy">${icon('shop', { size: 14 })} Buy</span>`
        : `<span class="sc-need"><small>need</small> ${need}</span>`;
      card.innerHTML = `
        <span class="sc-ic">${unitThumbHtml(c.type, 72)}</span>
        <span class="sc-nm">${c.name}</span>
        <span class="sc-cost">${cost} cr${disc && c.role === 'space' ? ' (−%)' : ''}</span>
        <div class="sc-bars">${bars}</div>
        ${foot}`;
      card.addEventListener('click', () => {
        press(card);
        if (!can) return;
        // Temporarily adjust cost via buy — if discount, grant points back after or custom buy
        const before = state.points;
        const r = buyUnit(state, c.type, state.selected);
        if (!r.ok) { toast(r.reason === 'points' ? 'Need more credits' : 'Cannot buy'); blip('bad'); return; }
        if (disc && c.role === 'space' && c.cost !== cost) {
          state.points += (c.cost - cost); // refund discount
          autosave(state);
        }
        toast(`Bought ${r.unit.name}`);
        blip('ok');
        renderShop();
      });
      grid.appendChild(card);
    }
  } else if (shopTab === 'classes') {
    // Thumb type → makeTrooper arg (ground models only; no ground/ edits)
    const BASE_CLASSES = ['rifle', 'heavy', 'sniper', 'engineer'];
    const CLASS_SHOP = [
      { id: 'rifle', name: 'Rifle', cost: 0, thumb: 'rifle',
        stats: { hp: 100, attack: 12, speed: 4, armor: 1 } },
      { id: 'heavy', name: 'Heavy', cost: 0, thumb: 'heavy',
        stats: { hp: 160, attack: 22, speed: 2, armor: 3 } },
      { id: 'sniper', name: 'Sniper', cost: 0, thumb: 'recon',
        stats: { hp: 80, attack: 18, speed: 3, armor: 0 } },
      { id: 'engineer', name: 'Engineer', cost: 0, thumb: 'rifle',
        stats: { hp: 110, attack: 10, speed: 4, armor: 2 } },
      { id: 'officer', name: 'Officer', cost: 160, thumb: 'rifle',
        stats: { hp: 120, attack: 14, speed: 4, armor: 2 } },
      { id: 'special', name: 'Special', cost: 180, thumb: 'heavy',
        stats: { hp: 140, attack: 20, speed: 3, armor: 3 } },
    ];
    if (!Array.isArray(state.unlockedClasses) || !state.unlockedClasses.length) {
      state.unlockedClasses = BASE_CLASSES.slice();
    }
    for (const id of BASE_CLASSES) {
      if (!state.unlockedClasses.includes(id)) state.unlockedClasses.push(id);
    }
    for (const c of CLASS_SHOP) {
      const owned = BASE_CLASSES.includes(c.id) || state.unlockedClasses.includes(c.id);
      const need = Math.max(0, c.cost - state.points);
      const can = !owned && need === 0 && c.cost > 0;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'shop-card' + (owned ? ' owned' : (can ? '' : ' cant'));
      card.disabled = owned;
      const bars = BAR_STATS.map((s) => {
        const v = c.stats[s.key] || 0;
        const pct = Math.max(6, Math.min(100, Math.round((v / s.max) * 100)));
        return `<div class="sc-bar" title="${s.key === 'hp' ? 'Health' : s.key === 'attack' ? 'Attack' : s.key === 'speed' ? 'Speed' : s.key === 'armor' ? 'Armor' : s.key}"><span class="sc-bi">${icon(s.icon, { size: 11 })}</span>`
          + `<span class="sc-bt"><i style="width:${pct}%;background:${s.color}"></i></span></div>`;
      }).join('');
      card.innerHTML = `
        <span class="sc-ic">${unitThumbHtml(c.thumb, 72)}</span>
        <span class="sc-nm">${c.name}</span>
        <span class="sc-cost">${owned ? 'Owned' : c.cost + ' cr'}</span>
        <div class="sc-bars">${bars}</div>
        ${owned
          ? `<span class="sc-buy owned-check">${icon('check', { size: 16 })} Owned</span>`
          : (can ? `<span class="sc-buy">${icon('shop', { size: 14 })} Buy</span>`
                 : `<span class="sc-need"><small>need</small> ${need}</span>`)}`;
      if (!owned) {
        card.addEventListener('click', () => {
          press(card);
          if (!can) return;
          state.points -= c.cost;
          state.unlockedClasses.push(c.id);
          autosave(state);
          toast(`${c.name} unlocked`);
          blip('ok');
          renderShop();
        });
      }
      grid.appendChild(card);
    }
  } else {
    const BONUS_SHOP = [
      { id: 'reinforce', name: 'Reinforcement', cost: 100, desc: '+25% tickets next battle' },
      { id: 'medical', name: 'Medical', cost: 90, desc: 'Heal over time next battle' },
      { id: 'shield', name: 'Energy shield', cost: 110, desc: 'Shield burst next battle' },
      { id: 'sabotage', name: 'Sabotage', cost: 100, desc: 'Enemy tickets −15%' },
      { id: 'hero', name: 'Hero', cost: 150, desc: 'One hero spawn next battle' },
    ];
    for (const b of BONUS_SHOP) {
      const armed = state.activeBonus?.id === b.id;
      const need = Math.max(0, b.cost - state.points);
      const can = !state.activeBonus && need === 0;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'shop-card' + (armed ? ' owned' : (can ? '' : ' cant'));
      card.innerHTML = `
        <span class="sc-nm">${b.name}</span>
        <span class="sc-cost">${armed ? 'Armed' : b.cost + ' cr'}</span>
        <small class="sc-desc">${b.desc}</small>
        ${armed
          ? `<span class="sc-buy owned-check">${icon('check', { size: 16 })} Ready</span>`
          : (can ? `<span class="sc-buy">${icon('shop', { size: 14 })} Buy</span>`
                 : `<span class="sc-need">${state.activeBonus ? 'Bonus armed' : 'need ' + need}</span>`)}`;
      if (!armed && !state.activeBonus) {
        card.addEventListener('click', () => {
          press(card);
          if (!can) return;
          state.points -= b.cost;
          state.activeBonus = { id: b.id };
          autosave(state);
          toast(`${b.name} armed for next battle`);
          blip('ok');
          renderShop();
        });
      }
      grid.appendChild(card);
    }
  }
}

/* ---------- End ---------- */
function renderEnd() {
  show('end');
  const win = state.result === 'win';
  const mine = PLANETS.filter((p) => state.owners[p.id] === PLAYER);
  let units = [];
  for (const p of PLANETS) {
    if (state.owners[p.id] === PLAYER) units = units.concat(state.garrisons[p.id] || []);
  }
  const body = app.querySelector('#end-body');
  renderEndCard(body, {
    kind: 'campaign',
    outcome: win ? 'win' : 'lose',
    pointsEarned: 0,
    totalPoints: state.points,
    survivors: units,
    lost: [],
    enemyDestroyed: 0,
    planetsOwned: mine.length,
    planetsTotal: PLANETS.length,
    battlesWon: state.battlesWon | 0,
    battlesFought: state.battlesFought | 0,
  });
  blip(win ? 'win' : 'bad');
}


function showAiBanner(text) {
  let el = document.getElementById('ai-fly-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ai-fly-banner';
    el.className = 'ai-fly-banner';
    el.setAttribute('role', 'status');
    (app.querySelector('#map-stage') || app).appendChild(el);
  }
  el.textContent = text;
  el.classList.remove('hidden');
}
function hideAiBanner() {
  document.getElementById('ai-fly-banner')?.classList.add('hidden');
}

function showBattleIntro({ planetName, kind, attackerName, defenderName, tickets }) {
  // Skip only when Playwright sets __scTest.skipIntro
  if (typeof window !== 'undefined' && window.__scTest?.skipIntro) return Promise.resolve();
  return new Promise((resolve) => {
    const existing = document.getElementById('battle-intro');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'battle-intro';
    el.className = 'battle-intro';
    const atk = attackerName || 'Attacker';
    const def = defenderName || 'Defender';
    const tix = tickets && (tickets.attacker != null || tickets.defender != null)
      ? `<p class="bi-tix">Tickets ${tickets.attacker ?? '—'} vs ${tickets.defender ?? '—'}</p>`
      : '';
    el.innerHTML = `<div class="bi-card" role="dialog" aria-label="Battle intro">
      <small>${kind === 'space' ? 'Space battle' : 'Ground battle'}</small>
      <b>${planetName || 'World'}</b>
      <p class="bi-vs">${atk} vs ${def}</p>
      ${tix}
      <p class="bi-hint">Tap to skip</p>
    </div>`;
    document.body.appendChild(el);
    syncFloatVisibility();
    let doneOnce = false;
    const done = () => {
      if (doneOnce) return;
      doneOnce = true;
      el.remove();
      syncFloatVisibility();
      resolve();
    };
    el.addEventListener('click', done);
    setTimeout(done, 2500);
  });
}

function consumeBonusAfterBattle() {
  if (state?.activeBonus) {
    state.activeBonus = null;
    autosave(state);
  }
}

async function doEndTurn() {
  if (!state || state.phase !== 'player') return;
  const incNow = endPlayerTurn(state);
  toast(incNow?.total ? `+${incNow.total} credits` : 'Enemy turn');
  renderMap();
  app.querySelector('#endturn').disabled = true;

  const plan = enemyPlan(state);
  for (const m of plan.moves) {
    const fromN = planetById(m.fromId)?.name || m.fromId || '?';
    const toN = planetById(m.toId)?.name || m.toId || '?';
    showAiBanner(`Enemy fleet: ${fromN} → ${toN}`);
    applyEnemyMove(state, m);
    await wait(550);
    renderMap();
  }
  hideAiBanner();

  if (plan.attack) {
    const ctx = prepareEnemyAttack(state, plan.attack);
    state.phase = 'battle';
    battlePaused = false;
    clearToast();
    show('battle');
    const mount = app.querySelector('#battle-mount');
    const label = app.querySelector('#battle-label');
    closePauseMenu(false);
    try { delete mount.dataset.paused; } catch { /* */ }

    const pointsBefore = state.points;
    // Player is defending — apply passives to defender units
    ctx.defenders = applyPassiveStatsToUnits(state, ctx.defenders);
    const defBefore = ctx.defenders.map((u) => ({ ...u, stats: { ...u.stats } }));
    const attBefore = ctx.attackers.map((u) => ({ ...u, stats: { ...u.stats } }));

    const fromN = planetById(ctx.fromId)?.name || ctx.fromId || '?';
    const toN = planetById(ctx.toId)?.name || ctx.planet?.name || ctx.toId || '?';
    showAiBanner(`Enemy fleet: ${fromN} → ${toN}`);

    const groundClasses = computeGroundClasses(state);
    const groundTickets = computeBattleTickets(state, false);
    publishLastGroundOpts(groundClasses, groundTickets);

    await showBattleIntro({
      planetName: ctx.planet?.name,
      kind: 'space',
      attackerName: 'Enemy',
      defenderName: 'Your fleet',
      tickets: groundTickets,
    });
    hideAiBanner();

    const applyStage = (result, stage) => applyStageResult(state, ctx, result, stage);

    const attackOut = await runFullAttack({
      ctx,
      playerIsAttacker: false,
      mount,
      onStage: (t) => { label.textContent = t === 'space' ? 'Enemy Space' : 'Enemy Ground'; },
      applyStage,
      classes: groundClasses,
      bonus: state.activeBonus || undefined,
      tickets: groundTickets,
    });
    const finalWinner = attackOut.finalWinner;
    const retreated = attackOut.retreated;
    const end = resolveAttackEnd(state, ctx, retreated ? 'defender' : finalWinner);

    const liveDef = (ctx.defenders || []).filter((u) => u.hpNow > 0);
    const lostDef = defBefore.filter((u) => !liveDef.find((s) => s.id === u.id));
    const liveAtt = (ctx.attackers || []).filter((u) => u.hpNow > 0);
    const lostAtt = attBefore.filter((u) => !liveAtt.find((s) => s.id === u.id));
    const kills = attackOut.lastResult?.kills || { attacker: lostDef.length, defender: lostAtt.length };
    const won = finalWinner === 'defender' && !retreated;
    recordBattleStats({ won, retreated: !!retreated });
    lastResult = {
      points: Math.max(0, state.points - pointsBefore),
      retreated: !!retreated,
      survivors: liveDef,
      lost: lostDef,
      lostEnemy: lostAtt.length,
      planet: ctx.planet,
      won,
      stageResult: attackOut.lastResult || null,
      stages: attackOut.stages || [],
      kills,
      cpsTaken: attackOut.lastResult?.cpsTaken ?? 0,
      ticketsLeft: attackOut.lastResult?.ticketsLeft || groundTickets,
      battlesRetreated: state.battlesRetreated | 0,
    };

    consumeBonusAfterBattle();
    if (end === 'win' || end === 'lose') {
      app.querySelector('#endturn').disabled = false;
      renderResult(() => renderEnd());
      return;
    }
    app.querySelector('#endturn').disabled = false;
    renderResult(() => {
      endEnemyTurn(state);
      const ended = checkEnd(state);
      if (ended) { renderEnd(); return; }
      toast('Your turn');
      renderMap();
    });
    return;
  }

  endEnemyTurn(state);
  const ended = checkEnd(state);
  app.querySelector('#endturn').disabled = false;
  if (ended) { renderEnd(); return; }
  toast('Your turn');
  renderMap();
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function isLandscape() {
  return window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches
    || (window.innerWidth > window.innerHeight && window.innerHeight <= 500);
}


/* ---------- Shell DOM ---------- */
function buildShell() {
  // Army HQ CSS backdrop (ONE world skin)
  if (!document.getElementById('sc-bg')) {
    const bg = document.createElement('div');
    bg.id = 'sc-bg';
    bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = `<div class="sky"></div><div class="stars s1"></div><div class="stars s2"></div>
      <div class="beam b1"></div><div class="beam b2"></div>
      <div class="floor"><div class="grid"></div></div><div class="vignette"></div>`;
    document.body.prepend(bg);
  }

  app.innerHTML = `
  <section id="scr-title" class="screen">
    <canvas id="menu3d" aria-hidden="true"></canvas>
    <div class="here">${icon('flag', { size: 18 })} <span>STAR CONQUESTS</span> · Menu</div>
    <div class="card title-card menu-card">
      <h1 class="glow-title">STAR <span class="t-cyan">CONQUESTS</span></h1>
      <p class="sub">Galactic Conquest · credits · fleets · win the galaxy</p>
      <div class="menu-btns">
        <button type="button" id="btn-continue" class="btn primary big menu-btn hidden" hidden></button>
        <button type="button" id="btn-new" class="btn primary big menu-btn"></button>
        <button type="button" id="btn-howto" class="btn secondary big menu-btn"></button>
        <button type="button" id="btn-settings" class="btn secondary big menu-btn"></button>
        <button type="button" id="btn-settings-sound" class="btn secondary big menu-btn"></button>
      </div>
    </div>
  </section>

  <section id="scr-howto" class="screen hidden">
    <header class="bar">
      <button type="button" id="ht-back" class="icon-lbl" aria-label="Back">${icon('back', { size: 20 })}<span class="lb">Back</span></button>
      <div class="crumb">How to Play</div>
      <div class="meta"><span class="pill" id="ht-page">1/4</span></div>
    </header>
    <div class="ht-wrap" id="ht-wrap">
      <div class="ht-card-main">
        <div id="ht-pic"></div>
        <h2 id="ht-title">Goal</h2>
        <div id="ht-body" class="ht-body"></div>
      </div>
      <div class="ht-nav">
        <button type="button" id="ht-prev" class="btn secondary" aria-label="Previous">${icon('back', { size: 20 })}<span class="lb">Prev</span></button>
        <div id="ht-dots" class="ht-dots"></div>
        <button type="button" id="ht-next" class="btn secondary" aria-label="Next"><span class="lb">Next</span>${icon('play', { size: 20 })}</button>
      </div>
    </div>
  </section>

  <section id="scr-settings" class="screen hidden">
    <header class="bar">
      <button type="button" id="set-back" class="icon-lbl" aria-label="Back">${icon('back', { size: 20 })}<span class="lb">Back</span></button>
      <div class="crumb">Settings</div>
    </header>
    <div class="card settings-card">
      <button type="button" id="set-sound" class="btn primary big"></button>
      <p class="sub">Mutes shell blips · saved on this device</p>
    </div>
  </section>

  <section id="scr-map" class="screen hidden">
    <header class="bar map-bar">
      <button type="button" id="btn-home" class="icon-lbl" aria-label="Menu">${icon('home', { size: 20 })}<span class="lb">Menu</span></button>
      <div id="guide-host" class="guide-host"></div>
      <div class="meta map-meta">
        <span class="stat-chip" title="Credits"><span class="sc-l">Credits</span><span class="sc-v" id="pts">0</span></span>
        <span class="stat-chip" title="Turn"><span class="sc-l">Turn</span><span class="sc-v" id="turn-n">1</span></span>
        <span class="stat-chip" title="Phase"><span class="sc-l">Phase</span><span class="sc-v" id="phase-l">You</span></span>
        <span class="stat-chip" title="Worlds owned"><span class="sc-l">Worlds</span><span class="sc-v" id="worlds-n">1/10</span></span>
      </div>
    </header>
    <div id="map-stage" class="map-stage-fill">
      <div id="confirm-host" class="hidden"></div>
    </div>
    <aside id="panel" class="sheet hidden" aria-hidden="true"></aside>
    <div class="float-actions">
      <button type="button" id="btn-shop" class="btn secondary float-btn">${icon('shop', { size: 18 })}<span class="lb">Shop</span></button>
      <button type="button" id="endturn" class="btn primary float-btn">${icon('skip', { size: 18 })}<span class="lb">End turn</span></button>
    </div>
  </section>

  <section id="scr-shop" class="screen hidden">
    <header class="bar">
      <button type="button" id="shop-back" class="icon-lbl" aria-label="Back">${icon('back', { size: 20 })}<span class="lb">Back</span></button>
      <div class="crumb">Shop</div>
      <div class="meta">
        <span class="stat-chip" title="Credits"><span class="sc-l">Credits</span><span class="sc-v" id="shop-pts">0</span></span>
        <span class="stat-chip"><span class="sc-l">Deploy to</span><span class="sc-v" id="shop-dest"></span></span>
      </div>
    </header>
    <p class="tip" style="padding:6px 12px;margin:0">Credits buy units. Deploy onto a world you own.</p>
    <div id="shop-planets" class="chips"></div>
    <div id="shop-grid" class="shop-grid"></div>
  </section>

  <section id="scr-battle" class="screen hidden">
    <header class="bar battle-bar">
      <div class="crumb" id="battle-label">Battle</div>
      <button type="button" id="btn-pause" class="icon-lbl pause-btn" aria-label="Pause">${icon('pause', { size: 20 })}<span class="lb">Pause</span></button>
    </header>
    <div id="battle-mount"></div>
    <div id="pause-overlay" class="pause-overlay hidden" role="dialog" aria-label="Paused">
      <div class="card pause-card">
        <h2>Paused</h2>
        <div class="pause-sound-row">
          <span>Sound</span>
          <button type="button" id="pause-sound" class="btn secondary"></button>
        </div>
        <button type="button" id="pause-resume" class="btn primary big">${icon('play', { size: 22 })}<span class="lb">Resume</span></button>
        <button type="button" id="pause-howto" class="btn secondary big">${icon('help', { size: 22 })}<span class="lb">How to Play</span></button>
        <button type="button" id="pause-settings" class="btn secondary big">${icon('settings', { size: 22 })}<span class="lb">Settings</span></button>
        <button type="button" id="pause-quit" class="btn danger big">${icon('flag', { size: 22 })}<span class="lb">Quit to map</span></button>
      </div>
    </div>
  </section>

  <section id="scr-result" class="screen hidden">
    <div class="card title-card result-card">
      <div id="res-body" class="ec-body"></div>
      <button type="button" id="res-continue" class="btn primary big">${icon('play', { size: 22 })}<span class="lb">Continue</span></button>
    </div>
  </section>

  <section id="scr-end" class="screen hidden">
    <div class="card title-card">
      <div id="end-body" class="ec-body"></div>
      <button type="button" id="btn-again" class="btn primary big">${icon('refresh', { size: 22 })}<span class="lb">Play again</span></button>
      <button type="button" id="btn-end-title" class="btn secondary big">${icon('home', { size: 22 })}<span class="lb">Menu</span></button>
    </div>
  </section>`;

  // Title
  app.querySelector('#btn-new').addEventListener('click', (e) => { press(e.currentTarget); startNew(); });
  app.querySelector('#btn-continue').addEventListener('click', (e) => { press(e.currentTarget); continueGame(); });
  app.querySelector('#btn-howto').addEventListener('click', (e) => { press(e.currentTarget); howtoPage = 0; renderHowto('title'); });
  app.querySelector('#btn-settings').addEventListener('click', (e) => { press(e.currentTarget); renderSettings(); });
  app.querySelector('#btn-settings-sound').addEventListener('click', (e) => { press(e.currentTarget); toggleSound(); });

  // Howto
  app.querySelector('#ht-back').addEventListener('click', (e) => { press(e.currentTarget); closeHowto(); });
  app.querySelector('#ht-prev').addEventListener('click', (e) => { press(e.currentTarget); howtoPage -= 1; paintHowto(); });
  app.querySelector('#ht-next').addEventListener('click', (e) => { press(e.currentTarget); howtoPage += 1; paintHowto(); });
  const htWrap = app.querySelector('#ht-wrap');
  let touchX = 0;
  htWrap.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  htWrap.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && howtoPage < HOWTO_PAGES.length - 1) { howtoPage += 1; paintHowto(); blip(); }
    if (dx > 0 && howtoPage > 0) { howtoPage -= 1; paintHowto(); blip(); }
  }, { passive: true });

  // Settings
  app.querySelector('#set-back').addEventListener('click', (e) => { press(e.currentTarget); renderTitle(); });
  app.querySelector('#set-sound').addEventListener('click', (e) => { press(e.currentTarget); toggleSound(); });

  // Map
  app.querySelector('#btn-home').addEventListener('click', (e) => { press(e.currentTarget); autosave(state); renderTitle(); });
  // Help lives in pause + title How to Play
  app.querySelector('#btn-shop').addEventListener('click', (e) => {
    press(e.currentTarget);
    if (state.owners[state.selected] !== PLAYER) {
      const own = PLANETS.find((x) => state.owners[x.id] === PLAYER);
      if (own) state.selected = own.id;
    }
    renderShop();
  });
  app.querySelector('#endturn').addEventListener('click', (e) => { press(e.currentTarget); doEndTurn(); });
  app.querySelector('#shop-back').addEventListener('click', (e) => { press(e.currentTarget); renderMap(); });

  // Pause (help + settings live here)
  app.querySelector('#btn-pause').addEventListener('click', (e) => {
    press(e.currentTarget);
    if (mode !== 'battle') return;
    if (battlePaused) closePauseMenu(true);
    else openPauseMenu(true);
  });
  app.querySelector('#pause-resume').addEventListener('click', (e) => { press(e.currentTarget); closePauseMenu(true); });
  app.querySelector('#pause-sound').addEventListener('click', (e) => { press(e.currentTarget); toggleSound(); });
  app.querySelector('#pause-howto').addEventListener('click', (e) => {
    press(e.currentTarget);
    const overlay = app.querySelector('#pause-overlay');
    if (overlay) overlay.classList.add('hidden');
    howtoPage = 0;
    renderHowto('pause');
  });
  app.querySelector('#pause-settings').addEventListener('click', (e) => {
    press(e.currentTarget);
    const overlay = app.querySelector('#pause-overlay');
    if (overlay) overlay.classList.add('hidden');
    // settings from pause → return via howtoReturn hack: use map-like close to battle+pause
    howtoReturn = 'pause';
    renderSettings();
    // rewire set-back temporarily
    const sb = app.querySelector('#set-back');
    const once = () => {
      sb.removeEventListener('click', once);
      show('battle');
      openPauseMenu(false);
    };
    // replace default: clone node
    const neu = sb.cloneNode(true);
    sb.parentNode.replaceChild(neu, sb);
    neu.addEventListener('click', (ev) => { press(ev.currentTarget); once(); });
  });
  app.querySelector('#pause-quit').addEventListener('click', (e) => { press(e.currentTarget); quitBattleToMap(); });

  // End
  app.querySelector('#btn-again').addEventListener('click', (e) => { press(e.currentTarget); startNew(); });
  app.querySelector('#btn-end-title').addEventListener('click', (e) => { press(e.currentTarget); renderTitle(); });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (mode === 'howto' && howtoReturn === 'pause') { closeHowto(); return; }
    if (mode !== 'battle') return;
    e.preventDefault();
    if (battlePaused) closePauseMenu(true);
    else openPauseMenu(true);
  });
}


buildShell();
renderTitle();
document.addEventListener('sc-thumbs-ready', () => {
  if (mode === 'shop' && state) renderShop();
  if (mode === 'map' && state) renderPanel();
});
try { warmUnitThumbs(96); } catch { /* */ }

window.addEventListener('resize', () => {
  if (mode === 'map' && state) renderMap();
  if (mode === 'shop' && state) renderShop();
});


// Expose for Playwright win/lose forcing
window.__scTest = {
  // Harness may set skipIntro=true; default false so real players see intro
  skipIntro: false,
  forceWin() {
    if (!state) state = newGame();
    for (const p of PLANETS) {
      state.owners[p.id] = PLAYER;
      if (!state.garrisons[p.id]?.length) {
        state.garrisons[p.id] = [];
      }
    }
    state.result = 'win';
    state.phase = 'over';
    autosave(state);
    renderEnd();
  },
  forceLose() {
    if (!state) state = newGame();
    for (const p of PLANETS) {
      state.owners[p.id] = ENEMY;
    }
    state.result = 'lose';
    state.phase = 'over';
    autosave(state);
    renderEnd();
  },
  /** Assert after select: every linked planet projects inside free rect ± margin. */
  assertSelectFraming(margin = 24) {
    if (!galaxy3d?.ready || !state?.selected) return { ok: false, reason: 'no selection' };
    const ids = neighbors(state.selected);
    return galaxy3d.assertLinkedInView(ids, margin);
  },
  /** Idle: every planet inside free rect (phone390 + pc). */
  assertIdleFraming(margin = 8) {
    if (!galaxy3d?.ready) return { ok: false, reason: 'no galaxy' };
    galaxy3d.fitAll?.();
    return galaxy3d.assertIdleFraming(margin);
  },
  assertPlanetMinPx(minPx = 44) {
    if (!galaxy3d?.ready) return { ok: false, reason: 'no galaxy' };
    return galaxy3d.assertPlanetMinPx?.(minPx) || { ok: false, misses: ['no api'] };
  },
  assertLabelGap(minGap = 8) {
    if (!galaxy3d?.ready) return { ok: false, reason: 'no galaxy' };
    return galaxy3d.assertLabelGap?.(minGap) || { ok: false, overlaps: ['no api'] };
  },
  assertIdleFill(minFill = 0.85) {
    if (!galaxy3d?.ready) return { ok: false, reason: 'no galaxy' };
    return galaxy3d.assertIdleFill?.(minFill) || { ok: false, fx: 0, fy: 0 };
  },
  /** Show a WIN battle result card with real summary numbers (kills/CPs/tickets). */
  showBattleWinResult() {
    if (!state) state = newGame();
    lastResult = {
      points: 120,
      retreated: false,
      won: true,
      survivors: (state.garrisons[state.selected] || []).slice(0, 3),
      lost: [],
      planet: planetById(state.selected || 'solara') || PLANETS[0],
      kills: { attacker: 7, defender: 11 },
      cpsTaken: 3,
      ticketsLeft: { attacker: 42, defender: 0 },
      stages: [
        { type: 'space', result: { winner: 'attacker', ticketsLeft: { attacker: 55, defender: 12 } } },
        { type: 'ground', result: { winner: 'attacker', ticketsLeft: { attacker: 42, defender: 0 } } },
      ],
    };
    state.battlesWon = (state.battlesWon | 0) + 1;
    state.battlesFought = (state.battlesFought | 0) + 1;
    state.points = (state.points | 0) + 120;
    renderResult(() => renderMap());
  },
  getState: () => state,
  getSettings: () => ({ ...settings }),
  getMode: () => mode,
};
