// STAR CONQUESTS — BF2-2005 style space battle (CONTRACT.md v1.1).
// Points win + capital/subsystem destruction. Lead | Command. Lucide. Gold #ffd23f on #070a1c.
// No Star Wars names/assets. ships3d exports stable for galaxy map.
import * as THREE from './vendor/three.module.min.js';
import { SPACE_TYPES, resolveUnit } from './roster.js';
import {
  buildSpaceShip, buildBattleShip, flashShield, tickShield, setShieldVisible, disposeObject,
} from './ships3d.js';
import { createSpaceAudio } from './audio.js';
import { iconHtml } from './icons.js';
import { attachVehicleFeel, createFighterFeel, createCapitalFeel } from './vehicle-feel.js';

const SPEEDS = [1, 2, 4];
const OUTRO_BANNER_S = 0.7;
const OUTRO_FADE_S = 0.6;
const OUTRO_S = OUTRO_BANNER_S + OUTRO_FADE_S;
const HINT_S = 4.0;
const RESPAWN_S = 3.0;
const CLASS_AUTO_S = 3.0;
const ARENA_Z = 150;
const FIGHTER_LEN = 6.0; // approx fighter length in world units
const FIGHTER_SEP = FIGHTER_LEN * 2.4; // keep ~2 ship-lengths apart
const FORMATION_HALF = 320; // packs behind huge capitals; sides still 400–600+ apart
const WEDGE_SPACING = 32; // 25–40 between ships in the wedge
const CAP_SCALE = 3.0; // BF2 feel: capital ~25–40× fighter length
const POINTS_GOAL = 100;
const PTS_FIGHTER = 5;
const PTS_SUBSYSTEM = 20;

const CLASSES = {
  fighter: { id: 'fighter', label: 'Fighter', role: 'fighter', hp: 180, shield: 50, attack: 18, speed: 8, armor: 10, subMul: 1, figMul: 1 },
  bomber: { id: 'bomber', label: 'Bomber', role: 'fighter', hp: 220, shield: 40, attack: 28, speed: 5.5, armor: 15, subMul: 1.85, figMul: 0.7 },
  interceptor: { id: 'interceptor', label: 'Interceptor', role: 'interceptor', hp: 110, shield: 25, attack: 16, speed: 12, armor: 0, subMul: 0.55, figMul: 1.45 },
};
const CLASS_ORDER = ['fighter', 'bomber', 'interceptor'];
const BONUS_ICONS = { reinforce: 'rocket', medical: 'heart', shield: 'shield', sabotage: 'swords', hero: 'gauge' };
const BONUS_LABS = { reinforce: 'Reinforce', medical: 'Medical', shield: 'Shield', sabotage: 'Sabotage', hero: 'Hero' };

const SUB_DEFS = [
  { id: 'shield', name: 'Shield', kind: 'shield', icon: 'shield' },
  { id: 'engines', name: 'Engines', kind: 'engines', icon: 'gauge' },
  { id: 'life', name: 'Life', kind: 'life', icon: 'heart' },
  { id: 'comms', name: 'Comms', kind: 'comms', icon: 'flag' },
  { id: 'hangar', name: 'Hangar', kind: 'hangar', icon: 'rocket' },
];

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function loadCss() {
  const href = new URL('./style.css', import.meta.url).href;
  if ([...document.styleSheets].some((s) => s.href === href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = href; document.head.appendChild(link);
}
function cloneUnit(u) {
  return { id: u.id, type: u.type, name: u.name, icon: u.icon, stats: { ...(u.stats || {}) }, hpNow: u.hpNow };
}
/** @deprecated tickets HUD replaced by points; kept for callers that still import it. */
export function ticketsFor(units) {
  const ships = (units || []).filter((u) => u.type === 'spaceship').length;
  return 20 + ships * 5;
}
export function pointsGoal() { return POINTS_GOAL; }

export function startBattle(opts, onDone) {
  const mount = opts && opts.mount;
  if (!mount) throw new Error('space battle: mount required');

  let done = false;
  let cleanup = () => {};
  const finish = (result) => {
    if (done) return;
    done = true;
    try { cleanup(); } catch (_) {}
    try { onDone && onDone(result); } catch (_) {}
  };
  const finishAsync = (result) => { queueMicrotask(() => finish(result)); };

  const atkIn = (opts.attacker && opts.attacker.units) || [];
  const defIn = (opts.defender && opts.defender.units) || [];
  const passthrough = (list) => list.filter((u) => !SPACE_TYPES.has(u.type));
  const atkPass = passthrough(atkIn);
  const defPass = passthrough(defIn);
  const seed = (opts.seed | 0) || 1;
  const rand = mulberry32(seed);
  const atkColor = (opts.attacker && opts.attacker.color) || '#2f80ed';
  const defColor = (opts.defender && opts.defender.color) || '#e74c3c';
  const atkSide = (opts.attacker && opts.attacker.side) || 'player';
  const defSide = (opts.defender && opts.defender.side) || 'enemy';
  const planet = opts.planet || { name: 'Planet', icon: 'P', biome: 'rock', size: 2 };
  const playerIsAttacker = atkSide === 'player';
  const atkSpace = atkIn.filter((u) => u.type === 'spaceship');
  const defSpace = defIn.filter((u) => u.type === 'spaceship');
  const atkCaps = atkIn.filter((u) => u.type === 'battleship');
  const defCaps = defIn.filter((u) => u.type === 'battleship');
  const atkHasSpace = atkSpace.length + atkCaps.length > 0;
  const defHasSpace = defSpace.length + defCaps.length > 0;

  // (a) 0 space units on either side → instant, no 3D. Both 0 / 0 atk → defender; 0 def → attacker.
  if (!atkHasSpace || !defHasSpace) {
    const winner = atkHasSpace ? 'attacker' : 'defender';
    finishAsync({
      winner,
      survivors: { attacker: atkIn.slice(), defender: defIn.slice() },
      pointsEarned: 0,
      retreated: false,
      kills: { attacker: 0, defender: 0 },
      subsystemsDestroyed: 0,
      stats: { attacker: emptyStats(), defender: emptyStats() },
    });
    return { abort() {} };
  }

  const bonus = (opts && opts.bonus && BONUS_LABS[opts.bonus.id || opts.bonus]) ? (opts.bonus.id || opts.bonus) : null;
  const ticketPoolOn = typeof (opts && opts.tickets) === 'number' && opts.tickets >= 0;
  let ticketsAtk = ticketPoolOn ? (opts.tickets | 0) : Infinity;
  let ticketsDef = ticketPoolOn ? (opts.tickets | 0) : Infinity;

  loadCss();

  function emptyStats() {
    return { kills: 0, deaths: 0, subsystemsDestroyed: 0, points: 0, shots: 0, hits: 0, accuracy: 0, bestClass: 'fighter' };
  }

  // --- DOM ---
  const root = document.createElement('div');
  root.className = 'sc-space-root';
  root.setAttribute('data-sc-space', '1');
  mount.appendChild(root);
  const canvas = document.createElement('canvas');
  root.appendChild(canvas);
  const isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);

  const hud = document.createElement('div');
  hud.className = 'sc-space-hud';
  hud.innerHTML = `
    <div class="sc-space-top">
      <div class="sc-space-tickets" data-el="tickets" aria-label="Points">
        <div class="sc-pts-main">
          <div class="sc-tic atk" data-el="ticAtk"><i data-el="ticAtkDot"></i><span data-el="ticAtkN">0</span></div>
          <span class="sc-pts-dot" aria-hidden="true">·</span>
          <div class="sc-tic def" data-el="ticDef"><span data-el="ticDefN">0</span><i data-el="ticDefDot"></i></div>
        </div>
        <div class="sc-pts-goal"><span class="lab">goal</span> <b data-el="ptsGoal">${POINTS_GOAL}</b></div>
      </div>
      <div class="sc-space-mode" data-el="modeWrap">
        <button type="button" class="sc-space-btn sc-mode" data-act="mode-lead" aria-label="Lead">${iconHtml('lead')}<span class="lab">Lead</span></button>
        <button type="button" class="sc-space-btn sc-mode on" data-act="mode-command" aria-label="Command">${iconHtml('command')}<span class="lab">Command</span></button>
      </div>
    </div>
    <div class="sc-space-bonus" data-el="bonus" ${bonus ? '' : 'hidden'}>${bonus ? iconHtml(BONUS_ICONS[bonus]) : ''}<span class="lab" data-el="bonusLab">${bonus ? BONUS_LABS[bonus] : ''}</span></div>
    <div class="sc-hero-charge" data-el="hero" ${bonus === 'hero' ? '' : 'hidden'}><i data-el="heroFill"></i></div>
    <div class="sc-space-sel" data-el="selChip" hidden>${iconHtml('target')}<span class="lab">Selected <b data-el="selN">0</b></span></div>
    <div class="sc-space-box" data-el="boxSel" hidden></div>
    <div class="sc-group-ring" data-el="groupRing" hidden></div>
    <div class="sc-space-hint" data-el="hint" data-sc-hint="1" role="status"></div>
    <div class="sc-space-player" data-el="playerHud">
      <div class="sc-ph-row">${iconHtml('hp')}<span class="lab">HP</span><span class="bar hp"><i data-el="pHp"></i></span><b data-el="pHpN">0</b></div>
      <div class="sc-ph-row">${iconHtml('shield')}<span class="lab">Shield</span><span class="bar sh"><i data-el="pSh"></i></span><b data-el="pShN">0</b></div>
      <div class="sc-ph-row">${iconHtml('speed')}<span class="lab">Speed</span><span class="bar sp"><i data-el="pSp"></i></span><b data-el="pSpN">0</b></div>
    </div>
    <div class="sc-space-subs" data-el="subs"></div>
    <div class="sc-space-reticle" data-el="reticle" hidden></div>
    <div class="sc-space-bracket" data-el="bracket" hidden></div>
    <div class="sc-space-respawn" data-el="respawn" hidden>${iconHtml('rocket')}<span data-el="respawnN">3</span></div>
    <div class="sc-class-pick" data-el="classPick" hidden>
      <button type="button" class="sc-space-btn sc-class-btn on" data-class="fighter" aria-label="Fighter">${iconHtml('gamepad')}<span class="lab">Fighter</span></button>
      <button type="button" class="sc-space-btn sc-class-btn" data-class="bomber" aria-label="Bomber">${iconHtml('bomb')}<span class="lab">Bomber</span></button>
      <button type="button" class="sc-space-btn sc-class-btn" data-class="interceptor" aria-label="Interceptor">${iconHtml('fast-forward')}<span class="lab">Interceptor</span></button>
    </div>
    <div class="sc-class-timer" data-el="classTimer" hidden></div>
    <div class="sc-space-touch" data-el="touch" ${isTouch ? '' : 'hidden'}>
      <div class="sc-joy" data-el="joy"><div class="sc-joy-knob" data-el="joyKnob"></div></div>
      <div class="sc-touch-actions">
        <button type="button" class="sc-space-btn sc-boost" data-act="boost" aria-label="Boost">${iconHtml('boost')}<span class="lab">Boost</span></button>
        <button type="button" class="sc-space-btn sc-fire" data-act="fire" aria-label="Fire">${iconHtml('fire')}<span class="lab">Fire</span></button>
      </div>
    </div>
    <div class="sc-space-bottom">
      <div class="sc-space-controls">
        <button type="button" class="sc-space-btn" data-act="speed" aria-label="Speed">${iconHtml('speed-toggle')}<span class="lab">x1</span></button>
        <button type="button" class="sc-space-btn sc-space-mute" data-act="mute" aria-label="Sound"><span data-el="muteIcon">${iconHtml('sound')}</span><span class="lab" data-el="muteLab">Sound</span></button>
        <button type="button" class="sc-space-btn danger" data-act="retreat" aria-label="Retreat">${iconHtml('retreat')}<span class="lab">Retreat</span></button>
      </div>
    </div>`;
  root.appendChild(hud);

  const bannerEl = document.createElement('div');
  bannerEl.className = 'sc-banner';
  bannerEl.setAttribute('data-sc-banner', '');
  bannerEl.hidden = true;
  root.appendChild(bannerEl);

  const $ = (sel) => hud.querySelector(sel);
  const elHint = $('[data-el="hint"]');
  const elSubs = $('[data-el="subs"]');
  const elReticle = $('[data-el="reticle"]');
  const elBracket = $('[data-el="bracket"]');
  const elRespawn = $('[data-el="respawn"]');
  const elRespawnN = $('[data-el="respawnN"]');
  const elClassPick = $('[data-el="classPick"]');
  const elClassTimer = $('[data-el="classTimer"]');
  const elTicAtkN = $('[data-el="ticAtkN"]');
  const elTicDefN = $('[data-el="ticDefN"]');
  const elPHp = $('[data-el="pHp"]'); const elPHpN = $('[data-el="pHpN"]');
  const elPSh = $('[data-el="pSh"]'); const elPShN = $('[data-el="pShN"]');
  const elPSp = $('[data-el="pSp"]'); const elPSpN = $('[data-el="pSpN"]');
  const elHeroFill = $('[data-el="heroFill"]');
  const elSelChip = $('[data-el="selChip"]');
  const elSelN = $('[data-el="selN"]');
  const elBoxSel = $('[data-el="boxSel"]');
  const elGroupRing = $('[data-el="groupRing"]');
  const btnSpeed = $('[data-act="speed"]');
  const btnMute = $('[data-act="mute"]');
  const btnRetreat = $('[data-act="retreat"]');
  const btnLead = $('[data-act="mode-lead"]');
  const btnCommand = $('[data-act="mode-command"]');
  const btnFire = $('[data-act="fire"]');
  const btnBoost = $('[data-act="boost"]');
  const joyEl = $('[data-el="joy"]');
  const joyKnob = $('[data-el="joyKnob"]');
  const elMuteIcon = $('[data-el="muteIcon"]');
  $('[data-el="ticAtkDot"]').style.background = atkColor;
  $('[data-el="ticDefDot"]').style.background = defColor;

  const audio = createSpaceAudio();
  let paused = (mount.dataset && mount.dataset.paused === '1');
  let mode = 'command';
  let hintT = 0;
  let softLock = null; // nearest enemy for aim assist
  let hoverSub = null; // { cap, idx } under cursor
  let playerFramed = true;
  let braking = false;
  let selected = []; // Command selection (player-side fighters)
  let cmdPointers = new Map(); // pointerId -> {x,y,button,mode}
  let cmdBox = null; // {x0,y0,x1,y1} screen box select
  let moveMarker = null;
  let attackMarker = null;
  let selRings = new Map(); // fighter -> mesh
  let groupSelRing = null; // one ring around squad when >3 selected
  let selDots = new Map(); // fighter -> small gold dot when group-selected
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let fadingOut = false;
  let speedI = 0;
  let timeScale = 1;
  let phase = 'fight';
  let phaseT = 0;
  let ended = false;
  let pendingResult = null;
  let deathCamLock = false;
  let holdDeathCapture = false;
  let fightTime = 0;
  let lastT = 0;
  let raf = 0;
  let shakeT = 0, shakeAmp = 0;
  let respawnT = 0;
  let playerDead = false;
  let classPickT = 0;
  let pendingClass = 'fighter';
  let pickingClass = false;

  let ptsAtk = 0, ptsDef = 0;
  const sideStats = { attacker: emptyStats(), defender: emptyStats() };
  const classKills = { attacker: { fighter: 0, bomber: 0, interceptor: 0 }, defender: { fighter: 0, bomber: 0, interceptor: 0 } };
  let heroCharge = 0;
  let heroReady = false;

  const keys = Object.create(null);
  const joy = { x: 0, y: 0, active: false };
  let fireHeld = false;
  let boostHeld = false;
  let keysMouseDown = false;
  let mouseAim = { x: 0, y: 0 };
  let cmdOrbit = { theta: 1.15, phi: 0.70, dist: 160 }; // fitCommandToCapitals sets dist
  let commandFocus = new THREE.Vector3(0, 0, 0);
  let cmdDrag = null; // orbit drag (RMB / 2-finger)

  function setHint() {
    if (!elHint) return;
    // Lead: brief icons-only tip. Command: NEVER show eye/crosshair/swords placeholder —
    // selection panel (updateSelectionPanel) shows real bars only when something is selected.
    if (mode === 'lead') {
      elHint.hidden = false;
      elHint.innerHTML = isTouch
        ? `${iconHtml('joystick')}<span class="sc-hint-sep"></span>${iconHtml('fire')}<span class="sc-hint-sep"></span>${iconHtml('boost')}`
        : `${iconHtml('gamepad')}<span class="sc-hint-sep"></span>${iconHtml('target')}<span class="sc-hint-sep"></span>${iconHtml('fire')}<span class="sc-hint-sep"></span>${iconHtml('boost')}`;
      elHint.classList.remove('hide');
      hintT = 0;
    } else {
      updateSelectionPanel();
    }
  }
  function dismissHint() { if (elHint) elHint.classList.add('hide'); }
  function updateSelectionPanel() {
    if (!elHint) return;
    if (mode !== 'command') return;
    const alive = selected.filter((f) => f && f.alive);
    if (!alive.length) {
      elHint.innerHTML = '';
      elHint.classList.add('hide');
      elHint.hidden = true;
      return;
    }
    let hp = 0, hpMax = 0, sh = 0, shMax = 0;
    for (const f of alive) {
      hp += f.hp; hpMax += f.hpMax;
      sh += f.shield; shMax += Math.max(1, f.shieldMax);
    }
    const hpPct = Math.max(0, Math.min(100, (hp / Math.max(1, hpMax)) * 100));
    const shPct = Math.max(0, Math.min(100, (sh / Math.max(1, shMax)) * 100));
    // Real bars only — no "--" / blank placeholders (Chumi no-placeholder)
    elHint.hidden = false;
    elHint.classList.remove('hide');
    elHint.innerHTML =
      `${iconHtml('target')}<span class="sc-sel-stat">${iconHtml('hp')}<span class="bar hp"><i style="width:${hpPct}%"></i></span></span>` +
      `<span class="sc-sel-stat">${iconHtml('shield')}<span class="bar sh"><i style="width:${shPct}%"></i></span></span>`;
    hintT = 0; // keep visible while selection held
  }
  setHint();

  // --- three.js ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const feelFX = attachVehicleFeel(scene, { renderer });
  const _feelYawPrev = new WeakMap();
  scene.background = new THREE.Color(0x070a1c);
  const camera = new THREE.PerspectiveCamera(55, 1, 1.2, 2000);
  camera.position.set(0, 18, 40);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x201828, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(40, 60, 30); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6fa8ff, 0.85); rim.position.set(-40, -10, -40); scene.add(rim);
  {
    const N = 1200, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rand() - 0.5) * 500;
      pos[i * 3 + 1] = (rand() - 0.5) * 300;
      pos[i * 3 + 2] = (rand() - 0.5) * 500;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, depthWrite: false })));
  }
  {
    const g = new THREE.SphereGeometry(400, 24, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float a=pow(max(0.0,dot(vP,normalize(vec3(-0.6,0.3,-0.7)))),3.0); float b=pow(max(0.0,dot(vP,normalize(vec3(0.7,-0.2,0.5)))),4.0); gl_FragColor=vec4(vec3(0.16,0.06,0.28)*a+vec3(0.03,0.12,0.2)*b+vec3(0.01,0.012,0.03),1.0); }',
    });
    scene.add(new THREE.Mesh(g, m));
  }
  const planetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(14, 24, 18),
    new THREE.MeshStandardMaterial({ color: 0x3a6b4a, roughness: 0.9, metalness: 0.05, flatShading: true }),
  );
  planetMesh.position.set(28, -18, -20);
  scene.add(planetMesh);

  const fighters = [];
  const capitals = [];
  const projectiles = [];
  const debris = [];
  const floats = [];
  let player = null;
  const aiRespawnTimers = [];

  function makeBars(parent) {
    const el = document.createElement('div');
    el.className = 'sc-space-bars';
    // ONE combined bar (hp+shield pool), offset above model via CSS translate(-50%,-100%)
    el.innerHTML = '<div class="bar combined"><i></i></div>';
    el.style.display = 'none';
    root.appendChild(el);
    const fill = el.querySelector('.combined > i');
    return { el, fill, hp: fill, sh: fill };
  }

  function buildSubPart(kind, accent) {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a97a8, flatShading: true, roughness: 0.55, metalness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3140, flatShading: true, roughness: 0.7, metalness: 0.2 });
    const glow = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9 });
    let highlight = null;
    if (kind === 'shield') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
      dome.position.y = 0.05; g.add(dome);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 6, 20), glow);
      rim.rotation.x = Math.PI / 2; g.add(rim); highlight = rim;
    } else if (kind === 'engines') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.7), dark));
      for (const z of [-0.28, 0.28]) {
        const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.55, 8), dark);
        nz.rotation.z = Math.PI / 2; nz.position.set(-0.55, 0, z); g.add(nz);
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 8), glow);
        fl.rotation.z = Math.PI / 2; fl.position.set(-0.95, 0, z); g.add(fl);
        if (!highlight) highlight = fl;
      }
    } else if (kind === 'comms') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.4, 6), dark);
      mast.position.y = 0.5; g.add(mast);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
      dish.scale.set(1, 0.35, 1); dish.position.set(0.15, 1.15, 0); dish.rotation.z = -0.4; g.add(dish);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow);
      tip.position.set(0, 1.35, 0); g.add(tip); highlight = tip;
    } else if (kind === 'hangar') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.18), dark));
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.65, 0.06), steel);
      door.position.z = 0.08; g.add(door);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.08), glow);
      strip.position.set(0, 0.28, 0.12); g.add(strip); highlight = strip;
    } else {
      const pod = new THREE.Mesh(THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.35, 0.55, 4, 8) : new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8), steel);
      g.add(pod);
      const window = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), glow);
      window.position.set(0.28, 0.15, 0); g.add(window); highlight = window;
    }
    // Emissive rim outline (solid, not wireframe sphere) — only shown when targeted
    const outline = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.045, 6, 20),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false }),
    );
    outline.rotation.x = Math.PI / 2;
    outline.visible = false;
    g.add(outline);
    g.userData.highlight = highlight;
    g.userData.outline = outline;
    g.userData.accent = accent;
    g.userData.kind = kind;
    g.userData.baseMats = [];
    g.traverse((m) => {
      if (m.isMesh && m.material && m.material.isMeshStandardMaterial) {
        g.userData.baseMats.push({ mesh: m, color: m.material.color.clone(), emissive: m.material.emissive ? m.material.emissive.clone() : new THREE.Color(0) });
      }
    });
    return g;
  }


  const _capBox = new THREE.Box3();
  const _capCenter = new THREE.Vector3();
  const _capSize = new THREE.Vector3();
  const _push = new THREE.Vector3();

  /** Hull-only world AABB from userData L/W/H (ignores floating marker children). */
  function capitalHullBox(cap, out, expand = 0) {
    const box = out || new THREE.Box3();
    const L = cap.mesh.userData.L || 5.6;
    const W = cap.mesh.userData.W || 1.6;
    const H = cap.mesh.userData.H || 0.95;
    box.min.set(-L * 0.52, -H * 0.55, -W * 0.55);
    box.max.set(L * 0.55, H * 0.65, W * 0.55);
    cap.mesh.updateMatrixWorld(true);
    box.applyMatrix4(cap.mesh.matrixWorld);
    if (expand) box.expandByScalar(expand);
    return box;
  }

  function pushPointOutOfCapitals(p, margin = 5) {
    for (const cap of capitals) {
      if (!cap.alive || !cap.mesh) continue;
      capitalHullBox(cap, _capBox, margin);
      if (!_capBox.containsPoint(p)) continue;
      _capBox.getCenter(_capCenter);
      _capBox.getSize(_capSize).multiplyScalar(0.5);
      _push.copy(p).sub(_capCenter);
      if (_push.lengthSq() < 1e-4) {
        // Prefer midfield (+ toward origin on Z) and up
        const zs = cap.zSign != null ? cap.zSign : (cap.mesh.position.z >= 0 ? 1 : -1);
        _push.set(0, 0.6, -zs);
      }
      const ax = _capSize.x > 1e-3 ? Math.abs(_push.x) / _capSize.x : 0;
      const ay = _capSize.y > 1e-3 ? Math.abs(_push.y) / _capSize.y : 0;
      const az = _capSize.z > 1e-3 ? Math.abs(_push.z) / _capSize.z : 0;
      const t = Math.max(ax, ay, az, 0.01);
      p.copy(_capCenter).addScaledVector(_push, (1 / t) * 1.2);
      // Extra clearance beyond the surface so chase never skims the hull
      p.addScaledVector(_push.normalize(), Math.max(8, margin * 0.8));
      p.y = Math.max(p.y, _capBox.max.y + 6);
    }
    return p;
  }


  function spawnCapital(side, color, units, zSign) {
    const role = units.some((u) => /dread|carrier/i.test(u.name || '')) ? 'dreadnought'
      : units.some((u) => /cruiser/i.test(u.name || '')) ? 'cruiser'
      : (units.length ? 'default' : 'default');
    const hullHex = side === 'defender' ? '#6a4a4e' : '#4a5a7a';
    const trimHex = side === 'defender' ? '#ff4d4d' : '#ffd23f';
    const mesh = buildBattleShip(role, color, trimHex, { side, hull: hullHex, trim: trimHex });
    if (CAP_SCALE !== 1) mesh.scale.multiplyScalar(CAP_SCALE);
    mesh.position.set(0, 14, zSign * ARENA_Z);
    // Nose +X → attacker faces +Z (midfield), defender faces -Z
    mesh.rotation.y = zSign > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(mesh);
    const bsCount = Math.max(1, units.length);
    const subHp = 160 + bsCount * 100;
    let hullMax = 400 + bsCount * 200;
    let shieldMax = 180 + bsCount * 80;
    if (bonus === 'shield' && side === 'attacker') shieldMax = Math.round(shieldMax * 1.45);
    const subs = SUB_DEFS.map((d) => ({
      id: d.id, name: d.name, kind: d.kind, icon: d.icon,
      hp: d.kind === 'shield' ? subHp * 1.1 : subHp, hpMax: d.kind === 'shield' ? subHp * 1.1 : subHp,
    }));
    // LOCAL hull dims (children inherit mesh.scale — do NOT pre-multiply scale or parts float away)
    const L = mesh.userData.L || 5.6;
    const W = mesh.userData.W || 1.6;
    const H = mesh.userData.H || 0.95;
    const accentOf = (k) => (k === 'shield' ? 0xb88cff : k === 'engines' ? 0x4ab8ff : k === 'hangar' ? 0xffd23f : k === 'life' ? 0x4dff88 : 0xff8a3d);
    // Anchors ON the hull in local space: dome top, engines stern (-X), dish mast, bay side, pod mid
    const localOf = {
      shield:  new THREE.Vector3(L * 0.05, H * 0.52, 0),
      engines: new THREE.Vector3(-L * 0.48, 0.02, 0),
      life:    new THREE.Vector3(L * 0.08, -H * 0.12, W * 0.52),
      comms:   new THREE.Vector3(-L * 0.12, H * 0.62, 0),
      hangar:  new THREE.Vector3(-L * 0.02, -H * 0.02, W * 0.52),
    };
    setShieldVisible(mesh, true);
    // Hangar spawn: midfield side of capital, clearance ∝ world half-length
    const halfLenW = L * (mesh.scale.x || 1) * 0.5;
    // Hangar just outside midfield face — keep dogfight close to both capitals
    const hangarClear = Math.max(14, halfLenW * 0.28);
    const hangarLocal = new THREE.Vector3(0, H * 0.15, 0);
    const hangar = mesh.position.clone();
    hangar.y = Math.max(6, mesh.position.y + 2);
    hangar.z += -zSign * (halfLenW + hangarClear);
    // Clamp toward midfield so spawn is never empty void
    if (zSign < 0) hangar.z = Math.min(hangar.z, -6);
    else hangar.z = Math.max(hangar.z, 6);
    // Turret hardpoints along the spine for capital feel / broadside (before feel so they reparent under feelRoot)
    {
      const turrets = [];
      const nTur = 6;
      for (let i = 0; i < nTur; i++) {
        const u = (i + 0.5) / nTur - 0.5;
        const head = new THREE.Object3D();
        head.position.set(u * L * 0.7, H * 0.55, 0);
        mesh.add(head);
        turrets.push({ head });
      }
      mesh.userData.turrets = turrets;
    }
    // World hull length for feel FX (NOT local userData.L=7.5 — pea-sized blasts otherwise).
    // Prefer design length × world scale; refine with Box3 after temporarily detaching the shield ellipse
    // (setFromObject still includes invisible shield meshes, which inflate to 200+).
    let worldHullL = (mesh.userData.L || L) * Math.abs(mesh.scale.x || 1);
    {
      const sh = mesh.userData.shield;
      const shParent = sh && sh.parent;
      if (sh && shParent) shParent.remove(sh);
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      if (sh && shParent) shParent.add(sh);
      const sz = new THREE.Vector3();
      box.getSize(sz);
      const fromBox = Math.max(sz.x, sz.y, sz.z);
      // Use box if sane (within 0.5×–1.5× design length); else design length
      if (fromBox > worldHullL * 0.45 && fromBox < worldHullL * 1.55) worldHullL = fromBox;
      mesh.userData.worldHullL = worldHullL;
    }
    const feel = createCapitalFeel(mesh, {
      fx: feelFX,
      flames: mesh.userData.flames || [],
      turrets: mesh.userData.turrets || [],
      L: worldHullL,
      // Intact burn/fade only (Lead HOLD breakup) — never cpuClipBreakup
    });
    // Subsystem markers AFTER feel so they stay on sim root (sibling of feelRoot) and do not bob out of hull AABB
    const markers = [];
    const partScale = Math.max(0.14, Math.min(0.32, L * 0.038));
    for (let i = 0; i < 5; i++) {
      const s = subs[i];
      const part = buildSubPart(s.kind, accentOf(s.kind));
      const loc = localOf[s.kind] || new THREE.Vector3(0, H * 0.4, 0);
      part.position.copy(loc);
      part.scale.setScalar(partScale);
      mesh.add(part);
      markers.push({ sub: s, node: part, bars: makeBars(), glow: part.userData.highlight, outline: part.userData.outline, kind: s.kind });
    }
    const cap = {
      side, mesh, color, alive: true, subs, markers, zSign,
      shieldGenAlive: true, enginesAlive: true, hangarAlive: true,
      lifeAlive: true, commsAlive: true,
      hull: hullMax, hullMax, shield: shieldMax, shieldMax,
      fireCd: 1.2, hangar, hangarLocal, hangarClear, yaw: mesh.rotation.y, turnRate: 0.15,
      srcUnits: units.map(cloneUnit),
      aiRespawnCap: (bonus === 'reinforce' && side === 'attacker') ? 8 : 5,
      aiAliveCount: 0,
      respawnDelayMul: (bonus === 'sabotage' && side === 'defender') ? 2.2 : 1,
      _dying: false, feel, wreckT: 0,
    };
    capitals.push(cap);
    return cap;
  }

  function pickAiClass() {
    const r = rand();
    if (r < 0.45) return 'fighter';
    if (r < 0.7) return 'bomber';
    return 'interceptor';
  }

  function applyClass(f, classId) {
    const c = CLASSES[classId] || CLASSES.fighter;
    f.classId = c.id;
    f.hpMax = c.hp; f.hp = c.hp;
    f.shieldMax = c.shield; f.shield = c.shield;
    f.attack = c.attack; f.speed = c.speed; f.armor = c.armor;
    f.subMul = c.subMul; f.figMul = c.figMul;
    f.role = c.role;
  }

  function spawnFighter(side, color, classId, isPlayer, src) {
    const c = CLASSES[classId] || CLASSES.fighter;
    const mesh = buildSpaceShip(c.role, color);
    const cap = capitals.find((x) => x.side === side);
    const hangar = cap ? cap.hangar.clone() : new THREE.Vector3(0, 10, side === 'attacker' ? -ARENA_Z + 55 : ARENA_Z - 55);
    mesh.position.copy(hangar);
    pushPointOutOfCapitals(mesh.position, 14);
    mesh.position.y = Math.max(5, mesh.position.y);
    mesh.position.x += (rand() - 0.5) * 5;
    mesh.position.y += rand() * 1.5;
    mesh.rotation.y = side === 'attacker' ? 0 : Math.PI;
    scene.add(mesh);
    // Fighter shield bubble stays hidden at rest (ships3d shieldRestHidden); flash on hit
    if (mesh.userData && !mesh.userData.shieldRestHidden) setShieldVisible(mesh, c.shield > 0);
    const f = {
      side, mesh, color, alive: true, isPlayer: !!isPlayer, isShell: true,
      classId: c.id, role: c.role,
      hp: c.hp, hpMax: c.hp, shield: c.shield, shieldMax: c.shield, shieldRegen: 3,
      attack: c.attack, range: 30, speed: c.speed, armor: c.armor,
      subMul: c.subMul, figMul: c.figMul,
      vel: new THREE.Vector3(), yaw: mesh.rotation.y, pitch: 0, throttle: 0.35,
      fireCd: 0, aiTarget: null, aiState: 'pursue', aiT: 0, src: src || null,
      order: null, // { type:'move'|'attack', pos?, targetFighter?, targetCap?, subIdx? }
      id: (src && src.id) || (side + '-' + classId + '-' + ((rand() * 1e5) | 0)),
      bars: makeBars(),
      _dying: false, _feelDone: false, feel: null, _yawRate: 0, _throttlePrev: 0.35,
    };
    f.feel = createFighterFeel(mesh, {
      fx: feelFX,
      flames: mesh.userData.flames || [],
      muzzles: mesh.userData.muzzles || [],
    });
    fighters.push(f);
    if (cap) cap.aiAliveCount = fighters.filter((x) => x.alive && x.side === side && !x.isPlayer).length;
    if (isPlayer) player = f;
    return f;
  }

  const atkCap = spawnCapital('attacker', atkColor, atkCaps.length ? atkCaps : [{ name: 'Corvette', type: 'battleship' }], -1);
  const defCap = spawnCapital('defender', defColor, defCaps.length ? defCaps : [{ name: 'Cruiser', type: 'battleship' }], 1);

  function spawnSideFighters(side, color, units) {
    const TARGET = 8; // 6–10 fighters per side at start
    const list = units.slice(0, TARGET);
    const playerSide = playerIsAttacker ? 'attacker' : 'defender';
    let spawned = 0;
    list.forEach((u, i) => {
      const isPl = side === playerSide && i === 0;
      const cls = isPl ? 'fighter' : pickAiClass();
      const f = spawnFighter(side, color, cls, isPl, cloneUnit(u));
      const bp = resolveUnit(u);
      if (bp && isPl) {
        f.hp = bp.hp; f.hpMax = bp.hpMax; f.attack = bp.attack; f.speed = bp.speed; f.armor = bp.armor;
        f.shield = bp.shield; f.shieldMax = bp.shieldMax;
      }
      spawned += 1;
    });
    while (spawned < TARGET) {
      spawnFighter(side, color, pickAiClass(), false, null);
      spawned += 1;
    }
  }
  spawnSideFighters('attacker', atkColor, atkSpace);
  spawnSideFighters('defender', defColor, defSpace);
  if (!player) {
    spawnFighter(playerIsAttacker ? 'attacker' : 'defender', playerIsAttacker ? atkColor : defColor, 'fighter', true, null);
  }
  // Loose wedge formations: sides ~400–600 apart, ≥25–40u between ships
  {
    // Wedge slots (row, lane): tip first — spacing WEDGE_SPACING on a triangular lattice
    const slots = [
      [0, 0],
      [1, -0.5], [1, 0.5],
      [2, -1], [2, 0], [2, 1],
      [3, -1.5], [3, 1.5],
    ];
    function placeWedge(side, list) {
      const toward = side === 'attacker' ? 1 : -1; // nose toward midfield
      // Pack centroid ~FORMATION FORMATION_HALF so sides sit 400–600 apart; tip flights push ahead for readable Lead
      const baseZ = -toward * FORMATION_HALF;
      const faceYaw = side === 'attacker' ? 0 : Math.PI;
      list.forEach((f, i) => {
        const [row, lane] = slots[i % slots.length];
        let x = lane * WEDGE_SPACING + (rand() - 0.5) * 4;
        let y = 6 + row * 4 + (rand() - 0.5) * 2.5;
        // Trail rows stay with the far pack; first 5 slots = tip flight in a tight midfield corridor
        // (narrow phone H-FOV ~±9u at 40m — keep tips near centerline)
        let z = baseZ - toward * (row * WEDGE_SPACING) + (rand() - 0.5) * 6;
        if (i < 5) {
          // Midfield tip: WEDGE_SPACING lattice — never a clumped ball on the crosshair
          const tipX = [0, -WEDGE_SPACING * 0.85, WEDGE_SPACING * 0.85, -WEDGE_SPACING * 1.7, WEDGE_SPACING * 1.7][i];
          const tipZ = [26, 40, 40, 58, 58][i];
          x = tipX + (rand() - 0.5) * 2.5;
          y = 10 + (i % 3) * 3.5 + (rand() - 0.5) * 1.5;
          z = -toward * tipZ + (rand() - 0.5) * 2.5;
        }
        f.mesh.position.set(x, y, z);
        f.mesh.rotation.y = faceYaw + (rand() - 0.5) * 0.12;
        f.yaw = f.mesh.rotation.y;
        f.pitch = 0;
        f.throttle = f.isPlayer ? 0.55 : (i < 5 ? 0.78 : 0.65);
        pushPointOutOfCapitals(f.mesh.position, 4);
      });
    }
    const atkList = fighters.filter((f) => f.alive && f.side === 'attacker');
    const defList = fighters.filter((f) => f.alive && f.side === 'defender');
    // Player at tip of own wedge
    const playerSide = playerIsAttacker ? 'attacker' : 'defender';
    const own = playerSide === 'attacker' ? atkList : defList;
    if (player && player.alive) {
      const tip = own.indexOf(player);
      if (tip > 0) { own.splice(tip, 1); own.unshift(player); }
    }
    placeWedge('attacker', atkList);
    placeWedge('defender', defList);
    // Enemy tip flights hold midfield corridor for Lead readability; friendlies pursue
    const defAlive = defList.slice();
    const atkAlive = atkList.slice();
    const tipEnemySide = playerIsAttacker ? 'defender' : 'attacker';
    atkAlive.forEach((f, i) => {
      if (f.isPlayer) return;
      const isEnemyTip = tipEnemySide === 'attacker' && i < 5;
      if (isEnemyTip) {
        const tipX = [0, -WEDGE_SPACING * 0.85, WEDGE_SPACING * 0.85, -WEDGE_SPACING * 1.7, WEDGE_SPACING * 1.7][i];
        const tipZ = [26, 40, 40, 58, 58][i];
        f.order = { type: 'move', pos: new THREE.Vector3(tipX, f.mesh.position.y, -tipZ), _tip: true };
        f.aiState = 'move';
        f._tipHold = 90;
        return;
      }
      const tgt = defAlive[i % Math.max(1, defAlive.length)];
      if (!tgt) return;
      f.order = { type: 'attack', targetFighter: tgt, pos: tgt.mesh.position.clone() };
      f.aiTarget = tgt;
      f.aiState = 'pursue';
    });
    defAlive.forEach((f, i) => {
      const isEnemyTip = tipEnemySide === 'defender' && i < 5;
      if (isEnemyTip) {
        const tipX = [0, -WEDGE_SPACING * 0.85, WEDGE_SPACING * 0.85, -WEDGE_SPACING * 1.7, WEDGE_SPACING * 1.7][i];
        const tipZ = [26, 40, 40, 58, 58][i];
        f.order = { type: 'move', pos: new THREE.Vector3(tipX, f.mesh.position.y, tipZ), _tip: true };
        f.aiState = 'move';
        f._tipHold = 90;
        return;
      }
      const tgt = atkAlive[i % Math.max(1, atkAlive.length)];
      if (!tgt) return;
      f.order = { type: 'attack', targetFighter: tgt, pos: tgt.mesh.position.clone() };
      f.aiTarget = tgt;
      f.aiState = 'pursue';
    });
  }

  function unlockAudio() { audio.unlock(); }
  function updatePointsHud() {
    elTicAtkN.textContent = String(ptsAtk);
    elTicDefN.textContent = String(ptsDef);
    sideStats.attacker.points = ptsAtk;
    sideStats.defender.points = ptsDef;
  }
  updatePointsHud();

  function updateSubsHud() {
    const bits = ['<div class="sc-subs-merge">'];
    for (const cap of capitals) {
      const label = cap.side === 'attacker' ? 'Atk' : 'Def';
      const col = cap.side === 'attacker' ? atkColor : defColor;
      bits.push(`<div class="sc-sub-side" data-side="${cap.side}" style="border-color:${col}">`);
      bits.push('<div class="sc-sub-icons">');
      for (const s of cap.subs) {
        const pct = Math.max(0, Math.min(100, (s.hp / Math.max(1, s.hpMax)) * 100));
        const dead = s.hp <= 0 ? 'dead' : '';
        bits.push(
          `<div class="sc-sub-row ${dead}" title="${s.name}" data-sub="${s.id}" data-pct="${pct.toFixed(0)}">` +
          `${iconHtml(s.icon || 'shield')}` +
          `<span class="bar" aria-hidden="true"><i style="width:${pct}%"></i></span>` +
          `</div>`
        );
      }
      bits.push('</div></div>');
    }
    bits.push('</div>');
    elSubs.innerHTML = bits.join('');
  }
  updateSubsHud();

  function floatAt(pos, text, color) {
    // Chumi: no numeric damage text — sparks/hit-flash only
    if (text != null && /\d/.test(String(text))) {
      spawnSparks(pos, 10, 0xffaa66);
      return;
    }
    const el = document.createElement('div');
    el.className = 'sc-space-float';
    el.textContent = text;
    el.style.color = color || '#ffd23f';
    root.appendChild(el);
    floats.push({ el, pos: pos.clone(), t: 0, life: 1.0 });
  }
  function spawnSparks(pos, n, color) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), new THREE.MeshBasicMaterial({ color: color || 0xffcc66 }));
      mesh.position.copy(pos);
      scene.add(mesh);
      debris.push({ mesh, vel: new THREE.Vector3((rand() - 0.5) * 16, rand() * 8, (rand() - 0.5) * 16), life: 0.35 + rand() * 0.2, t: 0 });
    }
  }
  // Capital-death explosion aligned to 0694fdb (live hub); audio/shake kept from tonight's battle shell
  function spawnExplosion(pos, big) {
    const n = big ? 28 : 14;
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.25, 0.25),
        new THREE.MeshBasicMaterial({ color: big ? 0xffaa44 : 0xff6644 }),
      );
      mesh.position.copy(pos);
      scene.add(mesh);
      debris.push({
        mesh,
        vel: new THREE.Vector3((rand() - 0.5) * 18, rand() * 10 + 2, (rand() - 0.5) * 18),
        life: 0.6 + rand() * 0.5,
        t: 0,
      });
    }
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 2.2 : 1.1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.9 }),
    );
    flash.position.copy(pos);
    scene.add(flash);
    debris.push({ mesh: flash, vel: new THREE.Vector3(), life: 0.25, t: 0, flash: true });
    audio.boom();
    shakeT = Math.max(shakeT, big ? 0.45 : 0.2);
    shakeAmp = Math.max(shakeAmp, big ? 0.55 : 0.22);
  }

  function noseDir(f) {
    return new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(f.pitch, f.yaw, 0, 'YXZ'));
  }

  function addPoints(side, amount, why) {
    if (side === 'attacker') ptsAtk += amount;
    else ptsDef += amount;
    updatePointsHud();
    checkWin();
  }

  function fireBolt(f) {
    if (!f.alive || f.fireCd > 0) return;
    f.fireCd = f.isPlayer ? 0.18 : 0.28;
    sideStats[f.side].shots += 1;
    let dmg = f.attack;
    if (f.isPlayer && bonus === 'hero' && heroReady) {
      dmg *= 1.75;
      heroCharge = 0; heroReady = false;
      if (elHeroFill) elHeroFill.style.width = '0%';
    }
    const dir = noseDir(f);
    const origin = f.mesh.position.clone().add(dir.clone().multiplyScalar(1.2));
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.2, 5),
      new THREE.MeshBasicMaterial({ color: f.side === 'attacker' ? 0x6cf0ff : 0xff6b5a }),
    );
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.position.copy(origin);
    scene.add(mesh);
    const mz = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.95 }));
    mz.position.copy(origin);
    scene.add(mz);
    debris.push({ mesh: mz, vel: new THREE.Vector3(), life: 0.06, t: 0, flash: true });
    projectiles.push({
      mesh, vel: dir.multiplyScalar(55), life: 1.6, t: 0,
      dmg, side: f.side, from: f, figMul: f.figMul || 1, subMul: f.subMul || 1,
    });
    audio.pew();
    if (f.feel) f.feel.onFire(dir.clone().normalize());
  }

  function applyDamageFighter(f, dmg, hitPos, fromSide) {
    if (!f.alive) return;
    let left = dmg * (1 - (f.armor || 0) / 100);
    if (f.shield > 0) {
      const a = Math.min(f.shield, left);
      f.shield -= a; left -= a;
      flashShield(f.mesh, 1);
      spawnSparks(hitPos || f.mesh.position, 8, 0xb88cff);
    }
    if (left > 0) {
      f.hp -= left;
      spawnSparks(hitPos || f.mesh.position, 10, 0xffaa44);
      spawnSparks(hitPos || f.mesh.position, 14, 0xff6b5a);
      shakeT = Math.max(shakeT, 0.1); shakeAmp = Math.max(shakeAmp, 0.12);
      f.mesh.traverse((m) => {
        if (m.isMesh && m.material && m.material.emissive) {
          if (!m.userData._baseE) m.userData._baseE = m.material.emissive.clone();
          m.material.emissive.setHex(0xff4422);
          m.userData._hitFlash = 0.22;
        }
      });
    }
    audio.hit();
    if (f.feel) {
      f.feel.onHit({ kind: left > 0 ? 'hull' : 'shield', point: hitPos || f.mesh.position.clone() });
    }
    if (f.shield <= 0) setShieldVisible(f.mesh, false);
    if (f.hp <= 0) killFighter(f, fromSide);
  }

  function killFighter(f, killerSide) {
    if (!f.alive) return;
    f.alive = false;
    f._dying = true;
    f._feelDone = false;
    spawnExplosion(f.mesh.position.clone(), false);
    // Feel death cascade owns visibility; hide immediately only if no feel
    if (f.feel) {
      f.feel.kill();
    } else {
      f.mesh.visible = false;
      f._feelDone = true;
    }
    if (f.bars) f.bars.el.style.display = 'none';
    sideStats[f.side].deaths += 1;
    const ks = killerSide || (f.side === 'attacker' ? 'defender' : 'attacker');
    sideStats[ks].kills += 1;
    classKills[ks][f.classId || 'fighter'] = (classKills[ks][f.classId || 'fighter'] || 0) + 1;
    addPoints(ks, PTS_FIGHTER, 'fighter');

    if (ticketPoolOn) {
      if (f.side === 'attacker') ticketsAtk = Math.max(0, ticketsAtk - 1);
      else ticketsDef = Math.max(0, ticketsDef - 1);
    }

    const cap = capitals.find((c) => c.side === f.side);
    if (cap) cap.aiAliveCount = fighters.filter((x) => x.alive && x.side === f.side && !x.isPlayer).length;

    if (f.isPlayer) {
      playerDead = true;
      const canRespawn = !ticketPoolOn || ticketsAtk > 0; // player is always attacker side in practice; check player side tickets
      const pool = f.side === 'attacker' ? ticketsAtk : ticketsDef;
      if (!ticketPoolOn || pool > 0) {
        respawnT = RESPAWN_S;
        pickingClass = true;
        pendingClass = 'fighter';
        classPickT = CLASS_AUTO_S;
        elRespawn.hidden = false;
        elClassPick.hidden = false;
        elClassTimer.hidden = false;
        elClassPick.querySelectorAll('[data-class]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-class') === 'fighter'));
        audio.alarm();
      }
    } else {
      scheduleAiRespawn(f);
    }
    checkWin();
  }

  function scheduleAiRespawn(f) {
    const cap = capitals.find((c) => c.side === f.side);
    if (!cap || !cap.alive || !cap.hangarAlive) return;
    const pool = f.side === 'attacker' ? ticketsAtk : ticketsDef;
    if (ticketPoolOn && pool <= 0) return;
    const aliveAi = fighters.filter((x) => x.alive && x.side === f.side && !x.isPlayer).length;
    if (aliveAi >= cap.aiRespawnCap) return;
    const delay = (2200 + rand() * 800) * (cap.respawnDelayMul || 1);
    const t = { side: f.side, color: f.color, at: performance.now() + delay, done: false };
    aiRespawnTimers.push(t);
  }

  function tickAiRespawns() {
    const now = performance.now();
    for (const t of aiRespawnTimers) {
      if (t.done || now < t.at) continue;
      t.done = true;
      if (ended || done) continue;
      const cap = capitals.find((c) => c.side === t.side);
      if (!cap || !cap.alive || !cap.hangarAlive) continue;
      const pool = t.side === 'attacker' ? ticketsAtk : ticketsDef;
      if (ticketPoolOn && pool <= 0) continue;
      const aliveAi = fighters.filter((x) => x.alive && x.side === t.side && !x.isPlayer).length;
      if (aliveAi >= cap.aiRespawnCap) continue;
      // reuse a dead fighter slot or spawn new
      let f = fighters.find((x) => !x.alive && x.side === t.side && !x.isPlayer);
      if (f) {
        applyClass(f, pickAiClass());
        f.alive = true;
        f._dying = false;
        f._feelDone = false;
        f.mesh.position.copy(cap.hangar);
        f.mesh.visible = true;
        f.throttle = 0.5;
        if (f.bars) f.bars.el.style.display = 'none';
        setShieldVisible(f.mesh, f.shieldMax > 0);
        if (!f.feel || (f.feel.isDone && f.feel.isDone())) {
          f.feel = createFighterFeel(f.mesh, {
            fx: feelFX,
            flames: f.mesh.userData.flames || [],
            muzzles: f.mesh.userData.muzzles || [],
          });
        }
        if (f.feel && f.feel.feelRoot) f.feel.feelRoot.visible = true;
      } else {
        spawnFighter(t.side, t.color, pickAiClass(), false, null);
      }
    }
  }

  function damageSub(cap, sub, dmg, pos, fromSide) {
    if (!cap.alive || sub.hp <= 0) return;
    if (sub.kind !== 'shield' && cap.shieldGenAlive) dmg *= 0.45;
    // bombers hit harder on subs
    sub.hp -= dmg;
    spawnSparks(pos || cap.mesh.position, 12, 0xb88cff);
    spawnSparks(pos || cap.mesh.position, 16, 0xffd23f);
    audio.hit();
    if (cap.feel) cap.feel.onHit({ kind: cap.shield > 0 && cap.shieldGenAlive ? 'shield' : 'hull', point: pos || null });
    if (sub.hp <= 0) {
      sub.hp = 0;
      const wp = pos || cap.mesh.position.clone().add(new THREE.Vector3(0, 3, 0));
      spawnExplosion(wp, true);
      const killer = fromSide || (cap.side === 'attacker' ? 'defender' : 'attacker');
      sideStats[killer].subsystemsDestroyed += 1;
      addPoints(killer, PTS_SUBSYSTEM, 'sub');
      applySubDeath(cap, sub);
      updateSubsHud();
      if (cap.subs.every((s) => s.hp <= 0)) destroyCapital(cap);
      else checkWin();
    } else updateSubsHud();
  }

  function applySubDeath(cap, sub) {
    if (sub.kind === 'shield') {
      cap.shieldGenAlive = false;
      cap.shield = 0;
      setShieldVisible(cap.mesh, false);
    } else if (sub.kind === 'engines') {
      cap.enginesAlive = false;
      cap.turnRate = 0;
    } else if (sub.kind === 'hangar') {
      cap.hangarAlive = false;
    } else if (sub.kind === 'life') {
      cap.lifeAlive = false;
    } else if (sub.kind === 'comms') {
      cap.commsAlive = false;
    }
    const mk = cap.markers.find((m) => m.sub === sub || m.kind === sub.kind);
    if (mk) {
      const wp = new THREE.Vector3();
      mk.node.getWorldPosition(wp);
      spawnSparks(wp, 18, 0xff6633);
      spawnExplosion(wp, true);
      mk.node.traverse((m) => {
        if (m.isMesh && m.material && m.material.color) m.material.color.setHex(0x222833);
      });
      if (mk.glow) mk.glow.visible = false;
      if (mk.outline) mk.outline.visible = false;
      mk._wrecked = true;
      mk.node.scale.multiplyScalar(0.72);
    }
  }


  /** Tag/hide battle-owned trim + marker clutter so wreck clones match feel-demo (3 scorched pieces). */
  function hideCapitalBattleExtras(cap) {
    if (!cap || !cap.mesh) return;
    // Subsystem markers (engine glow cones, dishes, etc.) — battle.js only, not in feel-demo
    for (const m of (cap.markers || [])) {
      if (m.node) m.node.visible = false;
      if (m.glow) m.glow.visible = false;
      if (m.outline) m.outline.visible = false;
      if (m.bars && m.bars.el) m.bars.el.style.display = 'none';
    }
    if (cap.mesh.userData && cap.mesh.userData.shield) {
      cap.mesh.userData.shield.visible = false;
    }
    // Hide ONLY battle/ships3d team-trim extras under feelRoot (MeshBasic stripe rails + engine cones).
    // Do NOT hide MeshStandard/Lambert hull panels — feel clones those as the 3 wreck pieces.
    const fr = cap.mesh.getObjectByName && cap.mesh.getObjectByName('feelRoot');
    const roots = fr ? [fr] : [cap.mesh];
    for (const root of roots) {
      root.traverse((ch) => {
        if (!ch.isMesh || !ch.geometry) return;
        const mat = Array.isArray(ch.material) ? ch.material[0] : ch.material;
        if (!mat) return;
        const geoType = (ch.geometry.type || '');
        const isCone = /ConeGeometry/i.test(geoType);
        // ships3d explicit trim rails/spine/keel are MeshBasic BoxGeometry stripes
        const isBasicTrim = !!(mat.isMeshBasicMaterial && /BoxGeometry/i.test(geoType));
        // Skinny MeshStandard team-trim (defender #ff4d4d / attacker yellow) from ships3d recolor
        let isStdTrim = false;
        if (mat.isMeshStandardMaterial && mat.color && ch.geometry) {
          if (!ch.geometry.boundingBox) { try { ch.geometry.computeBoundingBox(); } catch (_) {} }
          const bb = ch.geometry.boundingBox;
          if (bb) {
            const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
            const maxE = Math.max(sx, sy, sz), minE = Math.min(sx, sy, sz);
            const skinny = minE < 0.22 || (maxE / Math.max(minE, 1e-3) > 6);
            const c = mat.color;
            const warm = (c.r > 0.7 && c.g < 0.5) || (c.r > 0.7 && c.g > 0.4 && c.b < 0.4);
            isStdTrim = skinny && warm;
          }
        }
        if (isCone || isBasicTrim || isStdTrim) {
          ch.visible = false;
          ch.userData._battleTrimHidden = true;
        } else {
          // Thin hull/armor/hangar plates read as bare dark boxes once materials go transparent
          if (!ch.geometry.boundingBox) { try { ch.geometry.computeBoundingBox(); } catch (_) {} }
          const bb2 = ch.geometry.boundingBox;
          if (bb2) {
            const sx = bb2.max.x - bb2.min.x, sy = bb2.max.y - bb2.min.y, sz = bb2.max.z - bb2.min.z;
            const maxE = Math.max(sx, sy, sz) || 1;
            const minE = Math.min(sx, sy, sz);
            if ((minE / maxE) < 0.10) {
              ch.visible = false;
              ch.userData._battleTrimHidden = true;
            }
          }
        }
      });
    }
  }

  /** No-op under 0694fdb capital-death restore — battle owns wreck look; do not spawn feelFX plates. */
  function sanitizeCapitalWreck(cap) {
    if (!cap) return { sections: 0, hidden: 0 };
    return { sections: 0, hidden: 0 };
  }

  /** Retint death sprites: warm core, half haze opacity. Safe every frame while dying. */
  function polishDeathFx(force) {
    if (!feelFX) return;
    const dying = capitals.some((c) => c._dying || (c.feel && c.feel.state && (c.feel.state.breakup || c.feel.state.intactBurn || c.feel.state.coreBlast)));
    if (!dying && !force && !feelFX._deathWarmCore) return;
    for (const s of (feelFX.sprites || [])) {
      if (!s || !s.material) continue;
      const mat = s.material;
      const isSmoke = mat.blending === THREE.NormalBlending;
      if (isSmoke) {
        if (!s.userData._hazeCut) {
          s.userData._hazeCut = true;
          if (s.userData.a != null) s.userData.a *= 0.5;
          if (mat.opacity != null) mat.opacity *= 0.5;
        }
        // Neutral warm-grey smoke (no green cast)
        mat.color.setRGB(0.42, 0.40, 0.38);
      } else {
        // Additive glow → warm white / yellow / orange; strip green dominance
        const c = mat.color;
        if (c.g > c.r) {
          c.setRGB(Math.max(c.r, 0.95), Math.min(c.g, c.r * 0.75), Math.min(c.b, c.r * 0.35));
        } else if (c.b > c.r * 0.6) {
          c.setRGB(Math.max(c.r, 1), Math.max(c.g, 0.85), Math.min(c.b, 0.45));
        }
        if (!s.userData._warmCore) {
          s.userData._warmCore = true;
          const lum = c.r + c.g + c.b;
          if (lum > 2.4) c.setHex(0xfff4c8);
          else if (lum > 1.6) c.setHex(0xffc050);
          else c.setHex(0xff8018);
        }
        // After peak+1.2s: shrink/fade additive glow so fireball ≤10% frame
        if (feelFX._deathPeakAt != null) {
          const age = (performance.now() / 1000) - feelFX._deathPeakAt;
          if (age >= 1.2) {
            const fade = Math.max(0.02, 1 - (age - 1.2) / 0.35);
            if (s.userData.a != null) s.userData.a *= Math.min(1, fade * 0.35);
            if (mat.opacity != null) mat.opacity = Math.min(mat.opacity, 0.12 * fade);
            const sc = (s.scale && s.scale.x) || 1;
            if (sc > 1) s.scale.setScalar(Math.max(0.4, sc * 0.55 * fade));
          }
        }
      }
    }
  }

  /** Capital death — EXACT 0694fdb live path (grey wreck + spawnExplosion + wreckT).
   * Feel cascade / intact-burn / breakup are NOT used. Living feel (bob/flames) stays until kill.
   * Tonight's other work (results/HUD/Lead·Command/near-cam/score) is untouched. */
  function destroyCapital(cap) {
    if (!cap.alive) return;
    cap.alive = false;
    cap.hp = 0;
    cap.shield = 0;
    cap._dying = true;
    // Hide subsystem HUD/markers (0694fdb hid barsEl)
    for (const m of (cap.markers || [])) {
      if (m.bars && m.bars.el) m.bars.el.style.display = 'none';
      if (m.node) m.node.visible = false;
      if (m.glow) m.glow.visible = false;
      if (m.outline) m.outline.visible = false;
    }
    // 0694fdb kill(): grey 0x555555 @ 0.5 opacity wreck (also covers multi-material meshes)
    cap.mesh.traverse((m) => {
      if (!m.isMesh || !m.material) return;
      if (m.material.type === 'ShaderMaterial') return;
      const wasArr = Array.isArray(m.material);
      const mats = wasArr ? m.material : [m.material];
      if (!mats.some((mat) => mat && mat.color && mat.type !== 'ShaderMaterial')) return;
      const next = mats.map((mat) => {
        if (!mat || !mat.color || mat.type === 'ShaderMaterial') return mat;
        const c = mat.clone();
        c.color.set(0x555555);
        if (c.emissive) c.emissive.set(0x111111);
        c.opacity = 0.5;
        c.transparent = true;
        return c;
      });
      m.material = wasArr ? next : next[0];
    });
    setShieldVisible(cap.mesh, false);
    cap.wreckT = 2.2;
    spawnExplosion(cap.mesh.position.clone(), true);
    shakeT = Math.max(shakeT, 0.45);
    shakeAmp = Math.max(shakeAmp, 0.55);
    // Instant-done feel — battle owns capital death look (no cascade/intact/breakup FX plates)
    if (cap.feel && cap.feel.state) {
      const st = cap.feel.state;
      st.dead = true;
      st.done = true;
      st.breakup = false;
      st.intactBurn = false;
      st.coreBlast = false;
      st.sections = [];
      st._fadeMats = [];
      st.activeFireballs = 0;
    } else if (!cap.feel) {
      // no feel attached — wreck still drifts via wreckT
    }
    checkWin();
  }

  /** 0694fdb tickWrecks — capital wreck drifts down then hides */
  function tickCapitalWrecks(dt) {
    for (const c of capitals) {
      if (c.alive || !(c.wreckT > 0)) continue;
      c.wreckT -= dt;
      c.mesh.position.y -= dt * 1.2;
      c.mesh.rotation.z += dt * 0.7;
      if (c.wreckT <= 0) c.mesh.visible = false;
    }
  }

  function checkWin() {
    if (ended || done) return;
    const atkCapAlive = capitals.some((c) => c.side === 'attacker' && c.alive);
    const defCapAlive = capitals.some((c) => c.side === 'defender' && c.alive);
    // Capital death
    if (!defCapAlive) { endBattle('attacker', false); return; }
    if (!atkCapAlive) { endBattle('defender', false); return; }
    // All 5 enemy subsystems destroyed (even if capital still "alive" briefly)
    const defSubsDead = defCap.subs.filter((s) => s.hp <= 0).length >= 5;
    const atkSubsDead = atkCap.subs.filter((s) => s.hp <= 0).length >= 5;
    if (defSubsDead) { endBattle('attacker', false); return; }
    if (atkSubsDead) { endBattle('defender', false); return; }
    // Points goal
    if (ptsAtk >= POINTS_GOAL) { endBattle('attacker', false); return; }
    if (ptsDef >= POINTS_GOAL) { endBattle('defender', false); return; }
  }

  function bestClassFor(side) {
    const ck = classKills[side];
    let best = 'fighter', n = -1;
    for (const id of CLASS_ORDER) {
      if ((ck[id] || 0) > n) { n = ck[id] || 0; best = id; }
    }
    return best;
  }

  function buildResult(winner, retreated) {
    const scaleSide = (side, pass, cap) => {
      const spaceSrc = side === 'attacker' ? atkSpace : defSpace;
      const capsSrc = side === 'attacker' ? atkCaps : defCaps;
      const ratio = retreated ? 0 : Math.max(0.15, Math.min(1, (side === 'attacker' ? ptsAtk : ptsDef) / POINTS_GOAL));
      // keep some survivors based on capital health
      const space = spaceSrc.map((u) => {
        const c = cloneUnit(u);
        const mx = c.stats?.hp || c.hpNow || 100;
        c.hpNow = Math.max(1, Math.ceil(mx * (cap && cap.alive ? 0.5 + 0.5 * (cap.hull / cap.hullMax) : 0.15)));
        return c;
      });
      const caps = capsSrc.map((u) => {
        const c = cloneUnit(u);
        if (!cap || !cap.alive) { c.hpNow = 0; return null; }
        const subRatio = cap.subs.reduce((a, s) => a + Math.max(0, s.hp), 0) / Math.max(1, cap.subs.reduce((a, s) => a + s.hpMax, 0));
        const mx = c.stats?.hp || c.hpNow || 500;
        c.hpNow = Math.max(1, Math.ceil(mx * subRatio));
        return c;
      }).filter(Boolean);
      return [...space, ...caps, ...pass];
    };
    const survivors = {
      attacker: scaleSide('attacker', atkPass, capitals.find((c) => c.side === 'attacker')),
      defender: scaleSide('defender', defPass, capitals.find((c) => c.side === 'defender')),
    };
    if (!survivors.attacker.find((u) => u.id === 'a9') && atkPass.find((u) => u.id === 'a9')) {
      survivors.attacker.push(atkPass.find((u) => u.id === 'a9'));
    }
    let pointsEarned = 0;
    const playerWon = (winner === 'attacker' && playerIsAttacker) || (winner === 'defender' && !playerIsAttacker);
    if (playerWon && !retreated) {
      pointsEarned = 10 + ptsAtk; // shell currency-ish
    }
    for (const side of ['attacker', 'defender']) {
      const st = sideStats[side];
      st.accuracy = st.shots ? Math.round((st.hits / st.shots) * 100) / 100 : 0;
      st.bestClass = bestClassFor(side);
      st.points = side === 'attacker' ? ptsAtk : ptsDef;
    }
    // subsystemsDestroyed = count destroyed by the player's side (attacker per Dev A)
    const subsystemsDestroyed = sideStats.attacker.subsystemsDestroyed;
    return {
      winner, survivors, pointsEarned, retreated: !!retreated,
      kills: { attacker: sideStats.attacker.kills, defender: sideStats.defender.kills },
      subsystemsDestroyed,
      stats: { attacker: { ...sideStats.attacker }, defender: { ...sideStats.defender } },
    };
  }

  function showOutroBanner(playerWon, pts) {
    bannerEl.hidden = false;
    bannerEl.innerHTML = `<div class="sc-ban-card"><div class="sc-ban-big">${playerWon ? 'Victory' : 'Defeat'}</div>
      <div class="sc-ban-pts">${pts}</div><div class="sc-ban-sub">Tap to skip</div></div>`;
  }
  function hideBanner() { bannerEl.hidden = true; bannerEl.innerHTML = ''; }

  function endBattle(winner, retreated, endOpts) {
    if (ended && !(endOpts && endOpts.forceQuit)) return;
    if (done) return;
    ended = true;
    phase = 'outro';
    phaseT = 0;
    fadingOut = false;
    dismissHint();
    elClassPick.hidden = true;
    elClassTimer.hidden = true;
    elRespawn.hidden = true;
    pendingResult = buildResult(winner, retreated);
    if (endOpts && endOpts.skipBanner) {
      hideBanner();
      fadingOut = true;
      phaseT = OUTRO_BANNER_S;
      root.style.transition = `opacity ${OUTRO_FADE_S}s ease`;
      root.style.opacity = '0';
      return;
    }
    const pr = pendingResult;
    const playerWon = (pr.winner === 'attacker' && playerIsAttacker) || (pr.winner === 'defender' && !playerIsAttacker);
    const capCascading = capitals.some((c) => c._dying && c.feel && !c.feel.isDone());
    if (retreated) showOutroBanner(false, 0);
    else if (capCascading) {
      // Let the breakup play with battle HUD; show Victory after cascade (~8s)
      hideBanner();
      pendingResult._deferBanner = true;
      pendingResult._playerWon = playerWon;
    } else {
      showOutroBanner(playerWon, pr.pointsEarned);
    }
  }

  function finishPending() {
    if (!pendingResult || done) return;
    const r = pendingResult; pendingResult = null;
    finish(r);
  }

  function respawnPlayer() {
    if (!player || done || ended) return;
    applyClass(player, pendingClass || 'fighter');
    if (bonus === 'hero') { heroCharge = 0; heroReady = false; if (elHeroFill) elHeroFill.style.width = '0%'; }
    player.alive = true;
    player._dying = false;
    player._feelDone = false;
    player.mesh.visible = true;
    // Fresh feel after death cascade completed / interrupted
    player.feel = createFighterFeel(player.mesh, {
      fx: feelFX,
      flames: player.mesh.userData.flames || [],
      muzzles: player.mesh.userData.muzzles || [],
    });
    if (player.feel.feelRoot) player.feel.feelRoot.visible = true;
    const pcap = capitals.find((c) => c.side === player.side && c.alive);
    if (pcap) {
      const Lc = pcap.mesh.userData.L || 5.6;
      const half = Lc * (pcap.mesh.scale.x || 1) * 0.5;
      const clear = pcap.hangarClear != null ? pcap.hangarClear : Math.max(16, half * 0.45);
      const zs = pcap.zSign != null ? pcap.zSign : (pcap.mesh.position.z >= 0 ? 1 : -1);
      pcap.hangar.set(pcap.mesh.position.x, Math.max(6, pcap.mesh.position.y + 2), pcap.mesh.position.z - zs * (half + clear));
      player.mesh.position.copy(pcap.hangar);
      pushPointOutOfCapitals(player.mesh.position, 14);
      player.mesh.position.y = Math.max(5, player.mesh.position.y);
    }
    // rebuild mesh role if interceptor vs fighter visual
    // keep mesh; stats already applied
    player.mesh.visible = true;
    player.throttle = 0.5;
    playerDead = false;
    pickingClass = false;
    elRespawn.hidden = true;
    elClassPick.hidden = true;
    elClassTimer.hidden = true;
    if (player.bars) player.bars.el.style.display = 'none';
    setShieldVisible(player.mesh, player.shieldMax > 0);
  }

  function steerToward(f, targetPos, dt, shootRange) {
    const to = targetPos.clone().sub(f.mesh.position);
    const wantYaw = Math.atan2(to.x, to.z);
    let dy = wantYaw - f.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    f.yaw += THREE.MathUtils.clamp(dy, -2.4 * dt, 2.4 * dt);
    const dist = to.length();
    const wantPitch = Math.atan2(to.y, Math.sqrt(to.x * to.x + to.z * to.z));
    f.pitch = THREE.MathUtils.damp(f.pitch, THREE.MathUtils.clamp(wantPitch, -0.55, 0.55), 4, dt);
    f.throttle = dist > 18 ? 0.9 : (dist > 6 ? 0.45 : 0.15);
    const toN = to.clone().normalize();
    const canShoot = noseDir(f).dot(toN) > 0.82 && dist < (shootRange || f.range);
    return { dist, canShoot };
  }

  function aiTick(f, dt) {
    if (!f.alive) return;
    // In Lead, player is manual; in Command, player follows orders like AI
    if (f.isPlayer && mode === 'lead') return;

    // Persist player-issued orders (survive Lead/Command toggle for AI; player only while Command)
    if (f.order) {
      if (f.order.type === 'move' && f.order.pos) {
        if (f.order._tip && f._tipHold != null && f._tipHold > 0) f._tipHold -= dt;
        const r = steerToward(f, f.order.pos, dt, 0);
        if (r.dist < 4) {
          if (f.order._tip && f._tipHold != null && f._tipHold > 0) {
            const sideZ = f.side === 'attacker' ? -1 : 1;
            f.order.pos.set((rand() - 0.5) * 14, 12 + rand() * 4, sideZ * (28 + rand() * 12));
            f.order._tip = true;
          } else {
            f.order = null;
          }
        }
        return;
      }
      if (f.order.type === 'attack') {
        let targetPos = null;
        if (f.order.targetFighter && f.order.targetFighter.alive) {
          targetPos = f.order.targetFighter.mesh.position.clone();
        } else if (f.order.targetCap && f.order.targetCap.alive) {
          const cap = f.order.targetCap;
          const idx = Math.max(0, f.order.subIdx | 0);
          if (cap.subs[idx] && cap.subs[idx].hp > 0 && cap.markers[idx]) {
            targetPos = new THREE.Vector3();
            cap.markers[idx].node.getWorldPosition(targetPos);
          } else {
            const sub = cap.subs.find((s) => s.hp > 0);
            if (sub) {
              f.order.subIdx = cap.subs.indexOf(sub);
              targetPos = new THREE.Vector3();
              cap.markers[f.order.subIdx].node.getWorldPosition(targetPos);
            }
          }
        }
        if (!targetPos) { f.order = null; return; }
        const r = steerToward(f, targetPos, dt, f.range * 1.15);
        if (r.canShoot) fireBolt(f);
        return;
      }
    }

    if (f.isPlayer) return; // idle in Command without order

    f.aiT -= dt;
    const enemies = fighters.filter((o) => o.alive && o.side !== f.side);
    const enemyCap = capitals.find((c) => c.side !== f.side && c.alive);
    let targetPos = null;
    let shoot = false;
    const preferCap = f.classId === 'bomber' || f.aiState === 'cap';
    if (!preferCap && enemies.length) {
      let best = null, bd = 1e9;
      for (const e of enemies) {
        const d = e.mesh.position.distanceToSquared(f.mesh.position);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        targetPos = best.mesh.position.clone();
        const to = targetPos.clone().sub(f.mesh.position).normalize();
        if (noseDir(f).dot(to) > 0.85 && Math.sqrt(bd) < f.range) shoot = true;
      }
    } else if (enemyCap) {
      f.aiState = 'cap';
      const sub = enemyCap.subs.find((s) => s.hp > 0) || enemyCap.subs[0];
      const mk = enemyCap.markers[enemyCap.subs.indexOf(sub)];
      targetPos = new THREE.Vector3();
      mk.node.getWorldPosition(targetPos);
      const to = targetPos.clone().sub(f.mesh.position).normalize();
      if (noseDir(f).dot(to) > 0.8 && f.mesh.position.distanceTo(targetPos) < f.range * 1.2) shoot = true;
    }
    if (f.aiT <= 0) {
      f.aiT = 1.5 + rand() * 2;
      // Keep the opening dogfight dense in midfield for the first ~10s
      if (fightTime < 45) f.aiState = rand() < 0.12 ? 'evade' : 'pursue';
      else f.aiState = (f.classId === 'bomber' || rand() < 0.35) ? 'cap' : (rand() < 0.2 ? 'evade' : 'pursue');
    }
    if (f.aiState === 'evade') {
      f.yaw += (rand() - 0.5) * 2.5 * dt;
      f.pitch = THREE.MathUtils.clamp(f.pitch + (rand() - 0.5) * dt, -0.5, 0.5);
      f.throttle = 0.9;
    } else if (targetPos) {
      const r = steerToward(f, targetPos, dt, f.range);
      shoot = shoot || r.canShoot;
    }
    if (shoot) fireBolt(f);
  }

  function integrateFighter(f, dt) {
    if (!f.alive) return;
    f.fireCd = Math.max(0, f.fireCd - dt);
    if (f.shield < f.shieldMax) {
      f.shield = Math.min(f.shieldMax, f.shield + f.shieldRegen * 0.25 * dt);
      if (f.shield > 0) setShieldVisible(f.mesh, true);
    }
    if (bonus === 'medical' && f.isPlayer && f.side === 'attacker' && f.hp < f.hpMax) {
      f.hp = Math.min(f.hpMax, f.hp + 6 * dt);
    }
    tickShield(f.mesh, dt);
    f.mesh.traverse((m) => {
      if (m.userData && m.userData._hitFlash > 0) {
        m.userData._hitFlash -= dt;
        if (m.userData._hitFlash <= 0 && m.material && m.material.emissive && m.userData._baseE) {
          m.material.emissive.copy(m.userData._baseE);
        }
      }
    });
    const boostMul = (f.isPlayer && boostHeld && !braking) ? 1.55 : 1;
    const dir = noseDir(f);
    if (f.isPlayer && (braking || f.throttle < 0.04)) {
      // Space-brake / dampener: kill momentum toward stop
      f.vel.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-3.5 * dt));
    } else {
      const spd = f.speed * (0.35 + f.throttle * 0.9) * boostMul;
      f.vel.lerp(dir.multiplyScalar(spd), 1 - Math.exp(-4 * dt));
    }
    f.mesh.position.addScaledVector(f.vel, dt);
    // Large engagement volume so pursuits can spread
    f.mesh.position.x = THREE.MathUtils.clamp(f.mesh.position.x, -120, 120);
    f.mesh.position.y = THREE.MathUtils.clamp(f.mesh.position.y, -8, 40);
    f.mesh.position.z = THREE.MathUtils.clamp(f.mesh.position.z, -FORMATION_HALF - 80, FORMATION_HALF + 80);
    // Separation steering: keep ~2 ship-lengths apart (allow brief passes)
    {
      const sep = new THREE.Vector3();
      let nearCount = 0;
      for (const o of fighters) {
        if (o === f || !o.alive || !o.mesh) continue;
        const delta = f.mesh.position.clone().sub(o.mesh.position);
        const d = delta.length();
        if (d > 0.05 && d < FIGHTER_SEP) {
          // Stronger when closer; skip if closing fast head-on pass (dot ~ -1 and d decreasing handled softly)
          const w = (FIGHTER_SEP - d) / FIGHTER_SEP;
          sep.addScaledVector(delta.normalize(), w * w);
          nearCount += 1;
        }
      }
      if (nearCount) {
        sep.multiplyScalar(1 / nearCount);
        let sepMul = 1.8;
        // Extra push for enemies clumped near the player (Lead crosshair clump bug)
        if (!f.isPlayer && player && player.alive && player.mesh && f.side !== player.side) {
          const toP = f.mesh.position.distanceTo(player.mesh.position);
          if (toP < FIGHTER_SEP * 2.8) sepMul = 3.4;
        }
        // Wingmen: keep clear of player's nose / crosshair
        if (!f.isPlayer && player && player.alive && player.mesh && f.side === player.side) {
          const toP = f.mesh.position.distanceTo(player.mesh.position);
          if (toP < FIGHTER_SEP * 2.2) sepMul = Math.max(sepMul, 3.0);
        }
        f.mesh.position.addScaledVector(sep, FIGHTER_SEP * sepMul * dt * 8);
        // Nudge yaw away so they break into pursuits instead of stacking
        if (!f.isPlayer && sep.lengthSq() > 1e-6) {
          const awayYaw = Math.atan2(sep.x, sep.z);
          let dy = awayYaw - f.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          f.yaw += THREE.MathUtils.clamp(dy, -1.2, 1.2) * dt * (sepMul > 2 ? 4.2 : 2.5);
        }
      }
    }
    pushPointOutOfCapitals(f.mesh.position, f.isPlayer ? 8 : 3);
    f.mesh.position.y = Math.max(2, f.mesh.position.y);
    f.mesh.rotation.set(f.pitch, f.yaw, 0, 'YXZ');
    {
      const prev = _feelYawPrev.has(f) ? _feelYawPrev.get(f) : f.yaw;
      let dy = f.yaw - prev;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      f._yawRate = dt > 1e-6 ? dy / dt : 0;
      _feelYawPrev.set(f, f.yaw);
      const thPrev = f._throttlePrev != null ? f._throttlePrev : f.throttle;
      f._throttleDelta = f.throttle - thPrev;
      f._throttlePrev = f.throttle;
    }
    if (f.bars) {
      if (f.isPlayer) { f.bars.el.style.display = 'none'; }
      else {
      const show = shouldShowFighterBars(f);
      if (!show) { f.bars.el.style.display = 'none'; }
      else {
        const r = canvas.getBoundingClientRect();
        // Offset ABOVE the model (not on it)
        const v = f.mesh.position.clone(); v.y += 2.8; v.project(camera);
        f.bars.el.style.left = ((v.x * 0.5 + 0.5) * r.width) + 'px';
        f.bars.el.style.top = ((-v.y * 0.5 + 0.5) * r.height) + 'px';
        const pool = (f.hp / Math.max(1, f.hpMax)) * 0.55 + (f.shield / Math.max(1, f.shieldMax)) * 0.45;
        if (f.bars.fill) f.bars.fill.style.width = Math.max(0, pool * 100) + '%';
        f.bars.el.style.display = (v.z > 1 || !f.alive) ? 'none' : '';
      }
      }
    }
  }

  function shouldShowFighterBars(f) {
    // Never world-bars on the player's own fighter (HUD covers it)
    if (!f || !f.alive || f.isPlayer) return false;
    // Selected friendlies share ONE squad group bar (no stacking)
    if (selected.includes(f)) return false;
    // Player-owned attack orders only (not every AI dogfight / soft-lock)
    for (const o of fighters) {
      if (!o.alive || !o.isPlayer) continue;
      if (o.order && o.order.type === 'attack' && o.order.targetFighter === f) return true;
    }
    return false;
  }

  let squadBar = null;
  function ensureSquadBar() {
    if (squadBar) return squadBar;
    const el = document.createElement('div');
    el.className = 'sc-space-bars sc-squad-bar';
    el.innerHTML = '<div class="bar combined"><i></i></div>';
    el.style.display = 'none';
    root.appendChild(el);
    squadBar = { el, fill: el.querySelector('.combined > i') };
    return squadBar;
  }
  function updateSquadBar() {
    const sb = ensureSquadBar();
    const alive = selected.filter((f) => f && f.alive && f.mesh);
    if (mode !== 'command' || !alive.length) {
      sb.el.style.display = 'none';
      return;
    }
    const c = new THREE.Vector3();
    let hp = 0, hpMax = 0, sh = 0, shMax = 0;
    for (const f of alive) {
      c.add(f.mesh.position);
      hp += f.hp; hpMax += f.hpMax;
      sh += f.shield; shMax += Math.max(1, f.shieldMax);
    }
    c.multiplyScalar(1 / alive.length);
    c.y += 3.2;
    const v = c.clone().project(camera);
    const r = canvas.getBoundingClientRect();
    sb.el.style.left = ((v.x * 0.5 + 0.5) * r.width) + 'px';
    sb.el.style.top = ((-v.y * 0.5 + 0.5) * r.height) + 'px';
    const pool = (hp / Math.max(1, hpMax)) * 0.55 + (sh / Math.max(1, shMax)) * 0.45;
    if (sb.fill) sb.fill.style.width = Math.max(0, pool * 100) + '%';
    sb.el.style.display = (v.z > 1) ? 'none' : '';
  }

  function findSoftLockTarget() {
    if (!player || !player.alive) return null;
    const nose = noseDir(player);
    let best = null, bestScore = -1e9;
    const consider = (pos, ent, extra = {}) => {
      const to = pos.clone().sub(player.mesh.position);
      const dist = to.length();
      if (dist < 2 || dist > 90) return;
      to.multiplyScalar(1 / dist);
      const align = nose.dot(to);
      if (align < 0.55) return;
      const score = align * 2 - dist * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = { pos: pos.clone(), ent, align, dist, ...extra };
        if (extra.cap) { best.cap = extra.cap; best.subIdx = extra.subIdx; }
      }
    };
    for (const f of fighters) {
      if (!f.alive || f.side === player.side) continue;
      consider(f.mesh.position, f);
    }
    for (const cap of capitals) {
      if (!cap.alive || cap.side === player.side) continue;
      for (let i = 0; i < cap.markers.length; i++) {
        if (cap.subs[i].hp <= 0) continue;
        const wp = new THREE.Vector3();
        cap.markers[i].node.getWorldPosition(wp);
        consider(wp, cap, { cap, subIdx: i });
      }
    }
    return best;
  }

  function playerInput(dt) {
    if (!player || !player.alive || mode !== 'lead' || pickingClass) return;
    let yawCmd = 0, pitchCmd = 0, thr = player.throttle;
    braking = false;
    if (isTouch) {
      yawCmd = joy.x * 2.4;
      pitchCmd = -joy.y * 1.8;
      // Pull-back (positive joy.y) = space-brake toward stop; forward = thrust
      if (joy.y > 0.2) {
        braking = true;
        thr = Math.max(0, thr - joy.y * 2.4 * dt);
      } else {
        const forward = Math.max(0, -joy.y);
        thr = THREE.MathUtils.clamp(0.25 + forward * 0.85 + Math.abs(joy.x) * 0.25, 0, 1);
      }
    } else {
      if (keys.KeyA || keys.ArrowLeft) yawCmd -= 2.2;
      if (keys.KeyD || keys.ArrowRight) yawCmd += 2.2;
      if (keys.KeyW || keys.ArrowUp) pitchCmd -= 1.6;
      yawCmd += mouseAim.x * 1.4;
      pitchCmd += mouseAim.y * 1.1;
      if (keys.KeyW) thr = Math.min(1, thr + dt * 1.2);
      // S = brake (kills throttle to 0); slight pitch only when not braking hard
      if (keys.KeyS || keys.ArrowDown) {
        braking = true;
        thr = Math.max(0, thr - dt * 2.2);
        pitchCmd += 0.35;
      }
      boostHeld = !!keys.Space;
    }
    // Soft lock-on / aim assist toward nearest enemy in reticle cone
    softLock = findSoftLockTarget();
    if (softLock && softLock.align > 0.6) {
      const to = softLock.pos.clone().sub(player.mesh.position).normalize();
      // desired yaw/pitch from direction
      const wantYaw = Math.atan2(to.x, to.z);
      const wantPitch = Math.asin(THREE.MathUtils.clamp(to.y, -0.99, 0.99));
      let dy = wantYaw - player.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const assist = 1.6 * softLock.align; // stronger when centered
      yawCmd += dy * assist;
      pitchCmd += (wantPitch - player.pitch) * assist;
    }
    player.yaw += yawCmd * dt;
    player.pitch = THREE.MathUtils.clamp(player.pitch + pitchCmd * dt, -0.7, 0.7);
    player.throttle = thr;
    if (fireHeld || (!isTouch && keysMouseDown)) fireBolt(player);
    if (bonus === 'hero' && player.side === 'attacker') {
      heroCharge = Math.min(1, heroCharge + dt * 0.12);
      if (heroCharge >= 1) heroReady = true;
      if (elHeroFill) elHeroFill.style.width = (heroCharge * 100) + '%';
    }
  }

  function capitalSystems(dt) {
    for (const cap of capitals) {
      if (!cap.alive) continue;
      // DoT from life/comms down
      if (!cap.lifeAlive || !cap.commsAlive) {
        const dot = ((!cap.lifeAlive ? 8 : 0) + (!cap.commsAlive ? 5 : 0)) * dt;
        cap.hull -= dot;
        if (cap.hull <= 0) { destroyCapital(cap); continue; }
      }
      if (bonus === 'medical' && cap.side === 'attacker' && cap.hull < cap.hullMax) {
        cap.hull = Math.min(cap.hullMax, cap.hull + 4 * dt);
      }
      // hangar world pos: midfield face of capital + clearance (outside hull)
      {
        const Lc = cap.mesh.userData.L || 5.6;
        const half = Lc * (cap.mesh.scale.x || 1) * 0.5;
        const clear = cap.hangarClear != null ? cap.hangarClear : Math.max(16, half * 0.45);
        const zs = cap.zSign != null ? cap.zSign : (cap.mesh.position.z >= 0 ? 1 : -1);
        cap.hangar.set(cap.mesh.position.x, Math.max(6, cap.mesh.position.y + 2), cap.mesh.position.z - zs * (half + clear));
      }

      cap.fireCd -= dt;
      if (cap.fireCd > 0) continue;
      const foes = fighters.filter((f) => f.alive && f.side !== cap.side);
      let best = null, bd = 1e9;
      for (const f of foes) {
        const d = f.mesh.position.distanceToSquared(cap.mesh.position);
        if (d < bd && d < 55 * 55) { bd = d; best = f; }
      }
      if (!best) continue;
      cap.fireCd = 0.9;
      const origin = cap.mesh.position.clone().add(new THREE.Vector3(0, 3, 0));
      const dir = best.mesh.position.clone().sub(origin).normalize();
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 2.2, 5),
        new THREE.MeshBasicMaterial({ color: 0xff8a3d }),
      );
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      mesh.position.copy(origin);
      scene.add(mesh);
      projectiles.push({ mesh, vel: dir.multiplyScalar(40), life: 2, t: 0, dmg: 22, side: cap.side, from: null, beam: true, figMul: 1, subMul: 1 });
      audio.pew();
      if (cap.feel) {
        const turs = (cap.mesh.userData.turrets || []);
        for (let ti = 0; ti < Math.min(3, turs.length); ti++) {
          cap.feel.onFire(dir.clone(), { turretIndex: ti });
        }
      }
    }
  }

  function tickProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.t += dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.t >= p.life) {
        scene.remove(p.mesh); disposeObject(p.mesh); projectiles.splice(i, 1); continue;
      }
      let hit = false;
      for (const f of fighters) {
        if (!f.alive || f.side === p.side) continue;
        if (f.mesh.position.distanceToSquared(p.mesh.position) < 1.6) {
          const dmg = p.dmg * (p.figMul || 1);
          if (p.from) sideStats[p.side].hits += 1;
          applyDamageFighter(f, dmg, p.mesh.position.clone(), p.side);
          hit = true; break;
        }
      }
      if (!hit) {
        for (const cap of capitals) {
          if (!cap.alive || cap.side === p.side) continue;
          for (let si = 0; si < cap.markers.length; si++) {
            const mk = cap.markers[si];
            if (cap.subs[si].hp <= 0) continue;
            const wp = new THREE.Vector3();
            mk.node.getWorldPosition(wp);
            if (wp.distanceToSquared(p.mesh.position) < 2.8) {
              if (p.from) sideStats[p.side].hits += 1;
              damageSub(cap, cap.subs[si], p.dmg * 0.85 * (p.subMul || 1), wp, p.side);
              hit = true; break;
            }
          }
          if (hit) break;
          if (cap.mesh.position.distanceToSquared(p.mesh.position) < 36) {
            const sub = cap.subs.find((s) => s.hp > 0);
            if (sub) {
              if (p.from) sideStats[p.side].hits += 1;
              damageSub(cap, sub, p.dmg * 0.35 * (p.subMul || 1), p.mesh.position.clone(), p.side);
            }
            hit = true;
          }
        }
      }
      if (hit) {
        scene.remove(p.mesh); disposeObject(p.mesh); projectiles.splice(i, 1);
      }
    }
  }

  function tickDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.t += dt;
      if (d.flash) {
        d.mesh.material.opacity = Math.max(0, 1 - d.t / d.life);
        d.mesh.scale.setScalar(1 + d.t * 5);
      } else {
        d.vel.y -= 6 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        d.mesh.rotation.x += dt * 4;
      }
      if (d.t >= d.life) {
        scene.remove(d.mesh); disposeObject(d.mesh); debris.splice(i, 1);
      }
    }
  }
  function tickFloats(dt) {
    const r = canvas.getBoundingClientRect();
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      f.pos.y += dt * 2.5;
      const v = f.pos.clone().project(camera);
      f.el.style.left = ((v.x * 0.5 + 0.5) * r.width) + 'px';
      f.el.style.top = ((-v.y * 0.5 + 0.5) * r.height) + 'px';
      f.el.style.opacity = String(Math.max(0, 1 - f.t / f.life));
      if (f.t >= f.life) { f.el.remove(); floats.splice(i, 1); }
    }
  }
  function updatePlayerHud() {
    if (!player) return;
    elPHp.style.width = Math.max(0, (player.hp / player.hpMax) * 100) + '%';
    elPSh.style.width = Math.max(0, (player.shield / Math.max(1, player.shieldMax)) * 100) + '%';
    elPSp.style.width = Math.max(0, player.throttle * 100) + '%';
    elPHpN.textContent = String(Math.ceil(player.hp));
    elPShN.textContent = String(Math.ceil(player.shield));
    elPSpN.textContent = String(Math.round(player.throttle * 100));
  }
  function updateTargeting() {
    if (mode !== 'lead' || !player || !player.alive) {
      elReticle.hidden = true; elBracket.hidden = true; return;
    }
    elReticle.hidden = false;
    // Bracket ONLY when a real soft-lock target is locked AND projected on-screen
    // (no stray yellow square when nothing is locked)
    const r = canvas.getBoundingClientRect();
    const locked = softLock && softLock.align > 0.85 && softLock.pos;
    if (locked) {
      const v = softLock.pos.clone().project(camera);
      // Near reticle (center band) — hide stray edge brackets
      const onScreen = v.z < 1 && Math.abs(v.x) < 0.45 && Math.abs(v.y) < 0.45;
      if (onScreen) {
        elBracket.hidden = false;
        elBracket.style.left = ((v.x * 0.5 + 0.5) * r.width) + 'px';
        elBracket.style.top = ((-v.y * 0.5 + 0.5) * r.height) + 'px';
      } else elBracket.hidden = true;
    } else elBracket.hidden = true;
  }
  function isSubTargeted(cap, idx) {
    for (const f of fighters) {
      if (!f.alive || !f.order || f.order.type !== 'attack') continue;
      if (f.order.targetCap === cap && (f.order.subIdx | 0) === idx) return true;
    }
    if (softLock && softLock.cap === cap && softLock.subIdx === idx) return true;
    if (hoverSub && hoverSub.cap === cap && hoverSub.idx === idx) return true;
    return false;
  }

  function updateSubVisual(mk, s) {
    const ratio = s.hpMax > 0 ? s.hp / s.hpMax : 0;
    const dead = s.hp <= 0;
    if (mk.outline) {
      mk.outline.visible = !!mk._lit;
      mk.outline.material.opacity = mk._lit ? 0.95 : 0;
      if (mk.outline.material.emissive != null) mk.outline.material.color.setHex(mk.node.userData.accent || 0xffd23f);
    }
    if (mk.glow && mk.glow.material) mk.glow.material.opacity = dead ? 0.15 : (mk._lit ? 1 : 0.75);
    if (mk.node && mk.node.userData && mk.node.userData.baseMats) {
      for (const bm of mk.node.userData.baseMats) {
        if (!bm.mesh.material) continue;
        if (dead) {
          bm.mesh.material.color.setHex(0x1a1e28);
          if (bm.mesh.material.emissive) bm.mesh.material.emissive.setHex(0x000000);
        } else if (ratio < 0.35) {
          bm.mesh.material.color.copy(bm.color).multiplyScalar(0.45);
          if (bm.mesh.material.emissive) bm.mesh.material.emissive.setHex(0x331100);
        } else {
          bm.mesh.material.color.copy(bm.color);
          if (bm.mesh.material.emissive && bm.emissive) bm.mesh.material.emissive.copy(bm.emissive);
        }
      }
    }
    if (!dead && ratio < 0.35 && mk.node) {
      mk._sparkCd = (mk._sparkCd || 0) - 0.016;
      if (mk._sparkCd <= 0) {
        mk._sparkCd = 0.35 + Math.random() * 0.4;
        const wp = new THREE.Vector3();
        mk.node.getWorldPosition(wp);
        spawnSparks(wp.clone().add(new THREE.Vector3((Math.random()-0.5)*0.6, 0.4, (Math.random()-0.5)*0.6)), 3, 0xff8844);
      }
    }
  }

  function updateCapBars() {
    const r = canvas.getBoundingClientRect();
    for (const cap of capitals) {
      for (let i = 0; i < cap.markers.length; i++) {
        const mk = cap.markers[i];
        const s = cap.subs[i];
        const lit = !!(cap.alive && s.hp > 0 && isSubTargeted(cap, i));
        mk._lit = lit;
        updateSubVisual(mk, s);
        if (!cap.alive || s.hp <= 0 || !lit) { mk.bars.el.style.display = 'none'; continue; }
        const wp = new THREE.Vector3();
        mk.node.getWorldPosition(wp);
        wp.y += 2.2; // offset above subsystem model
        const v = wp.project(camera);
        mk.bars.el.style.left = ((v.x * 0.5 + 0.5) * r.width) + 'px';
        mk.bars.el.style.top = ((-v.y * 0.5 + 0.5) * r.height) + 'px';
        const fill = mk.bars.fill || mk.bars.hp;
        if (fill) fill.style.width = Math.max(0, (s.hp / s.hpMax) * 100) + '%';
        mk.bars.el.style.display = v.z > 1 ? 'none' : '';
      }
    }
  }


  function playerSideId() {
    return player ? player.side : (playerIsAttacker ? 'attacker' : 'defender');
  }

  const teamRings = new Map(); // fighter -> chevron group (screen-constant)
  function screenWorldPerPx(worldPos) {
    const dist = Math.max(1, camera.position.distanceTo(worldPos));
    const vFov = (camera.fov * Math.PI) / 180;
    const h = Math.max(1, canvas.clientHeight || 720);
    return (2 * Math.tan(vFov * 0.5) * dist) / h;
  }
  function makeChevronGeo() {
    // Flat screen-space chevron bars (≃ ∧) — reads as HUD mark, not a 3D cone
    const shape = new THREE.Shape();
    // left arm
    shape.moveTo(-0.05, 0.1);
    shape.lineTo(-0.78, -0.55);
    shape.lineTo(-0.55, -0.55);
    shape.lineTo(0, -0.05);
    shape.lineTo(0.55, -0.55);
    shape.lineTo(0.78, -0.55);
    shape.lineTo(0.05, 0.1);
    shape.lineTo(0.05, 0.35);
    shape.lineTo(-0.05, 0.35);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }
  function makeChevronSpriteMat(hex) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = hex;
    ctx.fillStyle = hex;
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // flat ∧ chevron
    ctx.beginPath();
    ctx.moveTo(10, 44);
    ctx.lineTo(32, 14);
    ctx.lineTo(54, 44);
    ctx.stroke();
    // slight fill notch for readability
    ctx.beginPath();
    ctx.moveTo(18, 42);
    ctx.lineTo(32, 22);
    ctx.lineTo(46, 42);
    ctx.lineTo(40, 42);
    ctx.lineTo(32, 30);
    ctx.lineTo(24, 42);
    ctx.closePath();
    ctx.globalAlpha = 0.85;
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0.95 });
  }
  function ensureTeamRing(f) {
    let m = teamRings.get(f);
    if (m) return m;
    const hex = f.color || (f.side === 'defender' ? '#e74c3c' : '#2f80ed');
    const g = new THREE.Group();
    const chev = new THREE.Sprite(makeChevronSpriteMat(hex));
    chev.center.set(0.5, 0.35);
    chev.renderOrder = 30;
    g.add(chev);
    g.userData.chev = chev;
    g.userData.targetPx = 20; // flat ~20px screen-space
    g.renderOrder = 30;
    scene.add(g);
    teamRings.set(f, g);
    return g;
  }
  function ensureSelRing(f) {
    let m = selRings.get(f);
    if (m) return m;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.05, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }),
    );
    ring.renderOrder = 31;
    g.add(ring);
    g.userData.ring = ring;
    g.userData.targetPx = 26;
    g.renderOrder = 31;
    scene.add(g);
    selRings.set(f, g);
    return g;
  }

  function clearSelRings() {
    for (const [, m] of selRings) { scene.remove(m); disposeObject(m); }
    selRings.clear();
    for (const [, m] of teamRings) { scene.remove(m); disposeObject(m); }
    teamRings.clear();
    if (groupSelRing) { scene.remove(groupSelRing); disposeObject(groupSelRing); groupSelRing = null; }
    for (const [, m] of selDots) { scene.remove(m); disposeObject(m); }
    selDots.clear();
  }

  function setSelection(list) {
    selected = (list || []).filter((f) => f && f.alive && f.side === playerSideId());
    updateSelChip();
  }

  function updateSelChip() {
    if (!elSelChip) return;
    const n = selected.filter((f) => f.alive).length;
    // Selected chip is Command-only — never cover Lead hint
    if (mode !== 'command' || n <= 0) { elSelChip.hidden = true; }
    else {
      elSelChip.hidden = false;
      if (elSelN) elSelN.textContent = String(n);
    }
    if (mode === 'command') updateSelectionPanel();
    updateSquadBar();
  }

  function ensureMoveMarker() {
    if (moveMarker) return moveMarker;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.7, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x5cff9a, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8),
      new THREE.MeshBasicMaterial({ color: 0x5cff9a, transparent: true, opacity: 0.85 }),
    );
    pole.position.y = 1.6;
    g.add(ring); g.add(pole);
    g.visible = false;
    scene.add(g);
    moveMarker = g;
    return g;
  }

  function ensureAttackMarker() {
    if (attackMarker) return attackMarker;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 2.0, 4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff4d6a, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    const cross1 = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.12, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xff4d6a }),
    );
    const cross2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 2.6),
      new THREE.MeshBasicMaterial({ color: 0xff4d6a }),
    );
    cross1.position.y = 0.2; cross2.position.y = 0.2;
    g.add(ring); g.add(cross1); g.add(cross2);
    g.visible = false;
    scene.add(g);
    attackMarker = g;
    return g;
  }

  function showMoveMarker(pos) {
    const m = ensureMoveMarker();
    m.position.set(pos.x, 0.05, pos.z);
    m.visible = true;
    if (attackMarker) attackMarker.visible = false;
  }

  function showAttackMarker(pos) {
    const m = ensureAttackMarker();
    m.position.copy(pos);
    m.position.y = Math.max(0.2, pos.y);
    m.visible = true;
    if (moveMarker) moveMarker.visible = false;
  }

  function updateCommandOverlays() {
    if (mode !== 'command') {
      for (const [, m] of selRings) m.visible = false;
      for (const [, m] of teamRings) m.visible = false;
      if (groupSelRing) groupSelRing.visible = false;
      if (elGroupRing) { elGroupRing.hidden = true; elGroupRing.classList.remove('on'); }
      for (const [, m] of selDots) m.visible = false;
      updateSelChip();
      if (moveMarker) moveMarker.visible = false;
      if (attackMarker) attackMarker.visible = false;
      return;
    }
    const side = playerSideId();
    const aliveSet = new Set(fighters.filter((f) => f.alive && f.mesh));
    for (const [f, m] of [...teamRings]) {
      if (!aliveSet.has(f)) { scene.remove(m); disposeObject(m); teamRings.delete(f); }
    }
    for (const f of aliveSet) {
      const m = ensureTeamRing(f);
      m.visible = true;
      m.position.copy(f.mesh.position);
      m.position.y = f.mesh.position.y + 2.2;
      // Billboard + constant screen size (~20px)
      m.quaternion.copy(camera.quaternion);
      const wpp = screenWorldPerPx(m.position);
      const px = m.userData.targetPx || 20;
      const s = wpp * px;
      m.scale.setScalar(s);
      m.userData.screenPx = px;
    }
    const aliveSelList = selected.filter((f) => f.alive && f.mesh);
    const aliveSel = new Set(aliveSelList);
    for (const [f, m] of [...selRings]) {
      if (!aliveSel.has(f)) { scene.remove(m); disposeObject(m); selRings.delete(f); }
    }
    // >3 selected: ONE thin screen-space ring from SELECTED units only (not capital / cam target)
    if (aliveSelList.length > 3) {
      for (const [, m] of selRings) m.visible = false;
      if (groupSelRing) groupSelRing.visible = false; // legacy 3D ring unused
      const canvasR = canvas.getBoundingClientRect();
      const hudR = hud.getBoundingClientRect();
      const pts = [];
      camera.updateMatrixWorld(true);
      const _wp = new THREE.Vector3();
      const _cen = new THREE.Vector3();
      for (const f of aliveSelList) {
        f.mesh.getWorldPosition(_wp); // world, not local/leader-offset
        _cen.add(_wp);
        const v = _wp.clone().project(camera);
        if (v.z > 1) continue;
        // HUD-local coords (ring is a child of hud)
        const sx = (v.x * 0.5 + 0.5) * canvasR.width + (canvasR.left - hudR.left);
        const sy = (-v.y * 0.5 + 0.5) * canvasR.height + (canvasR.top - hudR.top);
        pts.push({ x: sx, y: sy });
      }
      if (elGroupRing) {
        if (!pts.length) { elGroupRing.hidden = true; elGroupRing.classList.remove('on'); }
        else {
          const pad = 16;
          // Centroid of SELECTED screen positions only (never capital / cam target)
          let cx = 0, cy = 0;
          for (const p of pts) { cx += p.x; cy += p.y; }
          cx /= pts.length; cy /= pts.length;
          let maxR = 0;
          for (const p of pts) maxR = Math.max(maxR, Math.hypot(p.x - cx, p.y - cy));
          // Circle around selected projected positions + 16px pad (no % cap)
          let d = Math.max((maxR + pad) * 2, 36);
          const fitD = Math.min(hudR.width, hudR.height) - 8;
          _cen.multiplyScalar(1 / Math.max(1, aliveSelList.length));
          // Any selected off-screen or span too wide → frame squad world AABB to ~70% of view
          let off = false;
          for (const p of pts) {
            if (p.x < 8 || p.y < 8 || p.x > hudR.width - 8 || p.y > hudR.height - 8) off = true;
          }
          if (d > fitD || off || cx - d * 0.5 < 0 || cy - d * 0.5 < 0 || cx + d * 0.5 > hudR.width || cy + d * 0.5 > hudR.height) {
            const box = new THREE.Box3();
            for (const f of aliveSelList) { if (f.mesh) box.expandByObject(f.mesh); }
            const size = new THREE.Vector3(); box.getSize(size);
            const span = Math.max(size.x, size.y, size.z, 24);
            const vFov = THREE.MathUtils.degToRad(camera.fov);
            const tall = (camera.aspect || 1) < 0.75;
            // Phone is tall: prefer top-down so the wide formation fits the vertical FOV
            if (tall) cmdOrbit.phi = Math.max(cmdOrbit.phi, 1.05);
            const useFov = tall ? vFov : Math.min(vFov, 2 * Math.atan(Math.tan(vFov * 0.5) * Math.max(0.2, camera.aspect)));
            const needDist = (span * 0.5) / Math.tan(useFov * 0.5) / (tall ? 0.5 : 0.62);
            commandFocus.lerp(_cen, 0.95);
            cmdOrbit.dist = THREE.MathUtils.clamp(Math.max(cmdOrbit.dist, needDist), 80, tall ? 920 : 560);
            // Iterate: pull back until selected projected radius fits on-screen circle
            for (let iter = 0; iter < 10; iter++) {
              const phi = THREE.MathUtils.clamp(cmdOrbit.phi, 0.35, 1.35);
              const ox = commandFocus.x + Math.sin(cmdOrbit.theta) * Math.cos(phi) * cmdOrbit.dist;
              const oy = commandFocus.y + Math.sin(phi) * cmdOrbit.dist + 8;
              const oz = commandFocus.z + Math.cos(cmdOrbit.theta) * Math.cos(phi) * cmdOrbit.dist;
              camera.position.set(ox, oy, oz);
              camera.lookAt(commandFocus);
              camera.updateMatrixWorld(true);
              pts.length = 0;
              for (const f of aliveSelList) {
                f.mesh.getWorldPosition(_wp);
                const v2 = _wp.clone().project(camera);
                if (v2.z > 1) continue;
                const sx2 = (v2.x * 0.5 + 0.5) * canvasR.width + (canvasR.left - hudR.left);
                const sy2 = (-v2.y * 0.5 + 0.5) * canvasR.height + (canvasR.top - hudR.top);
                pts.push({ x: sx2, y: sy2 });
              }
              if (!pts.length) break;
              cx = 0; cy = 0;
              for (const p of pts) { cx += p.x; cy += p.y; }
              cx /= pts.length; cy /= pts.length;
              maxR = 0;
              for (const p of pts) maxR = Math.max(maxR, Math.hypot(p.x - cx, p.y - cy));
              d = Math.max((maxR + pad) * 2, 36);
              if (d <= fitD + 0.5) { d = Math.min(d, fitD); break; }
              cmdOrbit.dist = Math.min(tall ? 920 : 560, cmdOrbit.dist * 1.18);
              if (tall) cmdOrbit.phi = Math.min(1.25, cmdOrbit.phi + 0.04);
            }
            d = Math.min(d, fitD);
          }
          d = Math.min(d, fitD);
          // Clamp ring fully on screen
          let left = cx - d * 0.5;
          let top = cy - d * 0.5;
          left = Math.max(0, Math.min(left, Math.max(0, hudR.width - d)));
          top = Math.max(0, Math.min(top, Math.max(0, hudR.height - d)));
          elGroupRing.hidden = false;
          elGroupRing.classList.add('on');
          elGroupRing.style.width = d + 'px';
          elGroupRing.style.height = d + 'px';
          elGroupRing.style.left = left + 'px';
          elGroupRing.style.top = top + 'px';
          elGroupRing.dataset.w = String(Math.round(d));
          elGroupRing.dataset.pad = '16';
          elGroupRing.dataset.stroke = '2.5';
          elGroupRing.dataset.cx = String(Math.round(left + d * 0.5));
          elGroupRing.dataset.cy = String(Math.round(top + d * 0.5));
        }
      }
      // Small gold DOT per unit
      for (const f of aliveSelList) {
        let m = selDots.get(f);
        if (!m) {
          m = new THREE.Mesh(
            new THREE.SphereGeometry(0.45, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }),
          );
          m.renderOrder = 32;
          scene.add(m);
          selDots.set(f, m);
        }
        m.visible = true;
        m.position.copy(f.mesh.position);
        m.position.y = f.mesh.position.y + 2.0;
        const dWpp = screenWorldPerPx(m.position);
        m.scale.setScalar(dWpp * 9);
        m.userData.screenPx = 9;
      }
      for (const [f, m] of [...selDots]) {
        if (!aliveSel.has(f)) { scene.remove(m); disposeObject(m); selDots.delete(f); }
      }
    } else {
      if (groupSelRing) groupSelRing.visible = false;
      if (elGroupRing) { elGroupRing.hidden = true; elGroupRing.classList.remove('on'); }
      for (const [, m] of selDots) m.visible = false;
      for (const f of aliveSel) {
        const m = ensureSelRing(f);
        m.visible = true;
        m.position.copy(f.mesh.position);
        m.position.y = f.mesh.position.y + 2.2;
        m.quaternion.copy(camera.quaternion);
        const wpp = screenWorldPerPx(m.position);
        const px = m.userData.targetPx || 26;
        const pulse = 1 + 0.08 * Math.sin(performance.now() * 0.006);
        m.scale.setScalar(wpp * px * pulse);
        m.userData.screenPx = px;
      }
    }
    updateSelChip();
    // hide markers when no orders remain on selected
    if (moveMarker && moveMarker.visible) {
      const still = selected.some((f) => f.alive && f.order && f.order.type === 'move');
      if (!still) moveMarker.visible = false;
    }
    if (attackMarker && attackMarker.visible) {
      const still = selected.some((f) => f.alive && f.order && f.order.type === 'attack');
      if (!still) attackMarker.visible = false;
    }
  }

  function canvasNdc(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    return ndc;
  }

  function rayFromClient(clientX, clientY) {
    canvasNdc(clientX, clientY);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  }

  function groundHit(clientX, clientY) {
    const ray = rayFromClient(clientX, clientY);
    const hit = new THREE.Vector3();
    const ok = ray.intersectPlane(groundPlane, hit);
    return ok ? hit : null;
  }

  function pickFriendly(clientX, clientY) {
    const ray = rayFromClient(clientX, clientY);
    let best = null, bd = 3.8;
    for (const f of fighters) {
      if (!f.alive || f.side !== playerSideId()) continue;
      const d = ray.distanceToPoint(f.mesh.position);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  function pickEnemyOrSub(clientX, clientY) {
    const ray = rayFromClient(clientX, clientY);
    let bestF = null, bd = 3.8;
    for (const f of fighters) {
      if (!f.alive || f.side === playerSideId()) continue;
      const d = ray.distanceToPoint(f.mesh.position);
      if (d < bd) { bd = d; bestF = f; }
    }
    if (bestF) return { kind: 'fighter', fighter: bestF, pos: bestF.mesh.position.clone() };

    let bestSub = null, bs = 5.5;
    for (const cap of capitals) {
      if (!cap.alive || cap.side === playerSideId()) continue;
      for (let i = 0; i < cap.markers.length; i++) {
        if (cap.subs[i].hp <= 0) continue;
        const wp = new THREE.Vector3();
        cap.markers[i].node.getWorldPosition(wp);
        const d = ray.distanceToPoint(wp);
        if (d < bs) { bs = d; bestSub = { kind: 'sub', cap, subIdx: i, pos: wp }; }
      }
    }
    return bestSub;
  }

  function fightersInScreenBox(box) {
    const r = canvas.getBoundingClientRect();
    const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
    const out = [];
    for (const f of fighters) {
      if (!f.alive || f.side !== playerSideId()) continue;
      const v = f.mesh.position.clone().project(camera);
      if (v.z > 1) continue;
      const sx = r.left + (v.x * 0.5 + 0.5) * r.width;
      const sy = r.top + (-v.y * 0.5 + 0.5) * r.height;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) out.push(f);
    }
    return out;
  }

  function issueMove(pos) {
    if (!selected.length) return;
    for (const f of selected) {
      if (!f.alive) continue;
      f._tipHold = 0;
      f.order = { type: 'move', pos: pos.clone() };
    }
    showMoveMarker(pos);
  }

  function issueAttack(info) {
    if (!selected.length || !info) return;
    for (const f of selected) {
      if (!f.alive) continue;
      f._tipHold = 0;
      if (info.kind === 'fighter') {
        f.order = { type: 'attack', targetFighter: info.fighter, targetCap: null, subIdx: 0 };
      } else {
        f.order = { type: 'attack', targetFighter: null, targetCap: info.cap, subIdx: info.subIdx };
      }
    }
    showAttackMarker(info.pos);
  }

  function commandTap(clientX, clientY) {
    const friend = pickFriendly(clientX, clientY);
    if (friend) {
      setSelection([friend]);
      return;
    }
    if (selected.length) {
      const enemy = pickEnemyOrSub(clientX, clientY);
      if (enemy) { issueAttack(enemy); return; }
      const g = groundHit(clientX, clientY);
      if (g) { issueMove(g); return; }
    } else {
      setSelection([]);
    }
  }

  function updateBoxDom() {
    if (!elBoxSel) return;
    if (!cmdBox) { elBoxSel.hidden = true; return; }
    const r = canvas.getBoundingClientRect();
    const x0 = Math.min(cmdBox.x0, cmdBox.x1), x1 = Math.max(cmdBox.x0, cmdBox.x1);
    const y0 = Math.min(cmdBox.y0, cmdBox.y1), y1 = Math.max(cmdBox.y0, cmdBox.y1);
    elBoxSel.hidden = false;
    elBoxSel.style.left = (x0 - r.left) + 'px';
    elBoxSel.style.top = (y0 - r.top) + 'px';
    elBoxSel.style.width = Math.max(1, x1 - x0) + 'px';
    elBoxSel.style.height = Math.max(1, y1 - y0) + 'px';
  }

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();

  function fadeCapitalShields() {
    for (const cap of capitals) {
      if (!cap.alive || !cap.mesh || !cap.mesh.userData) continue;
      const sh = cap.mesh.userData.shield;
      const mat = cap.mesh.userData.shMat;
      if (!sh || !mat) continue;
      const wp = new THREE.Vector3();
      sh.getWorldPosition(wp);
      const dist = camera.position.distanceTo(wp);
      // Approximate shield radius from scale
      const sx = (cap.mesh.scale.x || 1), sy = (cap.mesh.scale.y || 1), sz = (cap.mesh.scale.z || 1);
      const rad = Math.max(sh.scale.x * sx, sh.scale.y * sy, sh.scale.z * sz) * 0.55;
      const base = mat.userData.baseOp != null ? mat.userData.baseOp : 0.12;
      const flash = mat.userData.flash || 0;
      // Soft fade: start at 3.2*rad, gone by 1.15*rad — kills flat polygon fill when cam close
      let fade = 1;
      if (dist < rad * 3.2) {
        fade = Math.max(0, Math.min(1, (dist - rad * 1.15) / (rad * 2.05)));
      }
      // Extra: if camera is clearly inside the ellipsoid AABB, force hide
      const local = sh.worldToLocal(camera.position.clone());
      const inside = (local.x * local.x) / ((sh.scale.x || 1) ** 2) + (local.y * local.y) / ((sh.scale.y || 1) ** 2) + (local.z * local.z) / ((sh.scale.z || 1) ** 2) < 1.15;
      if (inside) fade = 0;
      // Hide translucent shield oval unless being hit (flash) — kills idle purple haze discs
      const hitting = flash > 0.02;
      const op = hitting ? (base + flash * 0.35) * fade : 0;
      if (mat.uniforms && mat.uniforms.uOp) mat.uniforms.uOp.value = op;
      sh.visible = hitting && fade > 0.04 && cap.shieldGenAlive && cap.shield > 0;
    }
  }



  // --- Near-cam fade + camera-corridor soft avoidance (Lead) ---
  const _camToPlayer = new THREE.Vector3();
  const _camToShip = new THREE.Vector3();
  const _latPush = new THREE.Vector3();
  function restoreNearFade(f) {
    if (!f) return;
    if (f._nearHidden) {
      if (f.alive && f.mesh) f.mesh.visible = true;
      f._nearHidden = false;
    }
    if (f._nearFaded && f._fadeMats) {
      for (const m of f._fadeMats) {
        const base = m.userData._fadeBaseOp != null ? m.userData._fadeBaseOp : 1;
        m.opacity = base;
        m.transparent = base < 0.99;
        m.depthWrite = base >= 0.99;
        m.needsUpdate = true;
      }
      f._nearFaded = false;
    }
  }
  function ensureFighterFadeMats(f) {
    if (!f || !f.mesh || f._fadeMats) return;
    f._fadeMats = [];
    f.mesh.traverse((m) => {
      if (!m.isMesh || !m.material) return;
      const srcMats = Array.isArray(m.material) ? m.material : [m.material];
      const out = srcMats.map((mat) => {
        const c = mat.clone();
        const base = c.opacity != null ? c.opacity : 1;
        c.userData = Object.assign({}, c.userData || {}, { _fadeBaseOp: base, _nearFadeClone: true });
        c.transparent = true;
        return c;
      });
      m.material = Array.isArray(m.material) ? out : out[0];
      for (const c of out) f._fadeMats.push(c);
    });
  }
  function projectedBboxAreaFrac(obj3d) {
    if (!obj3d) return 0;
    camera.updateMatrixWorld(true);
    obj3d.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj3d);
    if (box.isEmpty()) return 0;
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, any = false;
    for (const c of corners) {
      c.project(camera);
      if (c.z > 1) continue;
      any = true;
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    if (!any) return 0;
    // Clamp to NDC visible [-1,1]²
    minX = Math.max(-1, minX); maxX = Math.min(1, maxX);
    minY = Math.max(-1, minY); maxY = Math.min(1, maxY);
    const w = Math.max(0, maxX - minX);
    const h = Math.max(0, maxY - minY);
    return (w * h) / 4; // full screen NDC area = 2*2 = 4
  }

  function applyNearCamFade(dt) {
    if (mode !== 'lead' || !player || !player.mesh || !player.alive) {
      for (const f of fighters) restoreNearFade(f);
      return;
    }
    const back = chaseBackDist();
    const nearLim = back * 1.5;
    const cam = camera.position;
    _camToPlayer.copy(player.mesh.position).sub(cam);
    const corridorLen = _camToPlayer.length();
    if (corridorLen < 0.5) return;
    const dirX = _camToPlayer.x / corridorLen;
    const dirY = _camToPlayer.y / corridorLen;
    const dirZ = _camToPlayer.z / corridorLen;
    const nose = noseDir(player);
    camera.updateMatrixWorld(true);
    const crossRad12 = 0.12 * 1.414; // ~12% screen radius in NDC
    for (const f of fighters) {
      if (!f.alive || !f.mesh || f.isPlayer) { restoreNearFade(f); continue; }
      _camToShip.copy(f.mesh.position).sub(cam);
      const dist = _camToShip.length();
      const along = _camToShip.x * dirX + _camToShip.y * dirY + _camToShip.z * dirZ;
      const lx = _camToShip.x - dirX * along;
      const ly = _camToShip.y - dirY * along;
      const lz = _camToShip.z - dirZ * along;
      const lateral = Math.sqrt(lx * lx + ly * ly + lz * lz);
      const between = along > 0.4 && along < corridorLen + 3;
      // Soft avoidance: push AI off the camera→player corridor
      if (!f.isPlayer && between && lateral < 10 && along > 1.2 && dist < nearLim * 1.35) {
        if (lateral < 0.05) {
          _latPush.set(-dirZ, 0, dirX);
        } else {
          _latPush.set(lx, ly * 0.15, lz).normalize();
        }
        const pushStr = (dist < 6 ? 28 : dist < nearLim ? 16 : 8) * (dt || 0.016);
        f.mesh.position.addScaledVector(_latPush, pushStr);
        if (_latPush.lengthSq() > 1e-6) {
          const awayYaw = Math.atan2(_latPush.x, _latPush.z);
          let dy = awayYaw - f.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          f.yaw += Math.max(-1.5, Math.min(1.5, dy)) * (dt || 0.016) * 2.2;
        }
      }
      // Crosshair cone ahead of player: push wingmen (and fade) out of 12% radius
      const ndc = f.mesh.position.clone().project(camera);
      const aheadOfPlayer = f.mesh.position.clone().sub(player.mesh.position).dot(nose) > 0.8;
      const ndcDist = (ndc.z <= 1) ? Math.hypot(ndc.x, ndc.y) : 99;
      const inCross12 = aheadOfPlayer && ndc.z <= 1 && ndcDist <= crossRad12;
      if (inCross12) {
        // Screen-space radial push away from crosshair center
        let px = ndc.x, py = ndc.y;
        const plen = Math.hypot(px, py) || 1e-4;
        px /= plen; py /= plen;
        // World-ish lateral using camera right/up
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        _latPush.copy(right).multiplyScalar(px).addScaledVector(up, py).normalize();
        // Enemies on reticle get a hard shove so Lead never shows a tip clump
        const pushStr = (f.side === player.side ? 34 : 42) * (dt || 0.016);
        f.mesh.position.addScaledVector(_latPush, pushStr);
        if (_latPush.lengthSq() > 1e-6) {
          const awayYaw = Math.atan2(_latPush.x, _latPush.z);
          let dy = awayYaw - f.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          f.yaw += Math.max(-1.8, Math.min(1.8, dy)) * (dt || 0.016) * 2.6;
        }
      }
      // Fade / hide: corridor, crosshair cone, OR projected bbox area >10% of frame
      const areaFrac = projectedBboxAreaFrac(f.mesh);
      // Left/right edge wedges: any fighter whose NDC AABB straddles the frame edge
      // with meaningful cover (thin shards often <4% area but dominate the edge).
      let edgeWedge = false;
      if (areaFrac > 0.015) {
        const box = new THREE.Box3().setFromObject(f.mesh);
        let minX = 1e9, maxX = -1e9, any = false;
        const corners = [
          new THREE.Vector3(box.min.x, box.min.y, box.min.z),
          new THREE.Vector3(box.min.x, box.min.y, box.max.z),
          new THREE.Vector3(box.min.x, box.max.y, box.min.z),
          new THREE.Vector3(box.min.x, box.max.y, box.max.z),
          new THREE.Vector3(box.max.x, box.min.y, box.min.z),
          new THREE.Vector3(box.max.x, box.min.y, box.max.z),
          new THREE.Vector3(box.max.x, box.max.y, box.min.z),
          new THREE.Vector3(box.max.x, box.max.y, box.max.z),
        ];
        for (const c of corners) {
          c.project(camera);
          if (c.z > 1) continue;
          any = true;
          minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
        }
        if (any) {
          // Straddles left or right edge of the frame
          if (minX < -0.88 && maxX > -0.95) edgeWedge = true;
          if (maxX > 0.88 && minX < 0.95) edgeWedge = true;
        }
      }
      const tooBig = areaFrac > 0.10 || edgeWedge;
      const corridorFade = between && dist < nearLim;
      const crossFade = inCross12;
      if (corridorFade || crossFade || tooBig) {
        ensureFighterFadeMats(f);
        if (dist < 6 || (crossFade && f.side === player.side) || tooBig) {
          // Hide near cam, friendlies on reticle, or any fighter covering >10% frame area
          if (f.mesh.visible) f.mesh.visible = false;
          f._nearHidden = true;
          f._nearFaded = true;
        } else {
          if (f._nearHidden) { f.mesh.visible = true; f._nearHidden = false; }
          const t = corridorFade ? (dist - 6) / Math.max(0.01, nearLim - 6) : 0.2;
          const op = 0.15 + 0.10 * Math.max(0, Math.min(1, t));
          for (const m of f._fadeMats) {
            const base = m.userData._fadeBaseOp != null ? m.userData._fadeBaseOp : 1;
            m.transparent = true;
            m.opacity = op * base;
            m.depthWrite = false;
            m.needsUpdate = true;
          }
          f._nearFaded = true;
        }
      } else {
        restoreNearFade(f);
      }
    }
    // Capital engine flames: hide when capital within 2 hull-lengths of camera
    // (friendly stern cones were reading as big blue triangles ~15% left edge).
    for (const c of capitals) {
      if (!c.mesh) continue;
      const L = (c.mesh.userData && c.mesh.userData.worldHullL) || 40;
      const dist = camera.position.distanceTo(c.mesh.position);
      const flames = (c.mesh.userData && c.mesh.userData.flames) || [];
      const near = dist < L * 2;
      for (const fl of flames) {
        if (!fl) continue;
        if (near) {
          if (fl.visible !== false) fl.userData._nearFlameWas = fl.visible !== false;
          fl.visible = false;
          fl.userData._nearFlameHidden = true;
        } else if (fl.userData && fl.userData._nearFlameHidden) {
          fl.visible = true;
          fl.userData._nearFlameHidden = false;
        }
      }
      // Also hide if the flame group alone covers >10% of the frame
      if (flames.length && !near) {
        // Measure combined bbox of visible flames
        const box = new THREE.Box3();
        let any = false;
        for (const fl of flames) {
          if (!fl || fl.visible === false) continue;
          fl.updateWorldMatrix(true, true);
          box.expandByObject(fl);
          any = true;
        }
        if (any && !box.isEmpty()) {
          // Temporary object for projected area: use first flame's parent or measure via corners
          const dummy = flames.find((f) => f && f.visible !== false);
          if (dummy) {
            // Project flame group via box corners
            const corners = [
              new THREE.Vector3(box.min.x, box.min.y, box.min.z),
              new THREE.Vector3(box.min.x, box.min.y, box.max.z),
              new THREE.Vector3(box.min.x, box.max.y, box.min.z),
              new THREE.Vector3(box.min.x, box.max.y, box.max.z),
              new THREE.Vector3(box.max.x, box.min.y, box.min.z),
              new THREE.Vector3(box.max.x, box.min.y, box.max.z),
              new THREE.Vector3(box.max.x, box.max.y, box.min.z),
              new THREE.Vector3(box.max.x, box.max.y, box.max.z),
            ];
            let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, ok = false;
            for (const pt of corners) {
              pt.project(camera);
              if (pt.z > 1) continue;
              ok = true;
              minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
              minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
            }
            if (ok) {
              minX = Math.max(-1, minX); maxX = Math.min(1, maxX);
              minY = Math.max(-1, minY); maxY = Math.min(1, maxY);
              const frac = (Math.max(0, maxX - minX) * Math.max(0, maxY - minY)) / 4;
              if (frac > 0.10) {
                for (const fl of flames) {
                  if (!fl) continue;
                  fl.visible = false;
                  fl.userData._nearFlameHidden = true;
                }
              }
            }
          }
        }
      }
    }
  }

  function chaseBackDist() {
    // Phone (tall): pull back so player bbox width ~20% of viewport (was ~40%)
    const tall = (camera.aspect || 1) < 0.75;
    return tall ? 34 : 15.5;
  }

  function updateCamera(dt) {
    if (deathCamLock) {
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      return;
    }
    if (mode === 'lead' && player && player.mesh) {
      // Chase distance grows when near a capital so hull never fills the frame
      // Player clearly visible, centered low, 12–20% screen height (from spawn)
      // Near a capital: keep backDist so the HUGE hull fills the frame (BF2); only lift Y
      let backDist = chaseBackDist(), upDist = 3.2, lookAhead = 10;
      let nearCap = null, nearDist = 1e9;
      for (const cap of capitals) {
        if (!cap.alive || !cap.mesh) continue;
        const d = player.mesh.position.distanceTo(cap.mesh.position);
        if (d < nearDist) { nearDist = d; nearCap = cap; }
      }
      if (nearCap) {
        const Lc = nearCap.mesh.userData.L || 5.6;
        const half = Lc * (nearCap.mesh.scale.x || 1) * 0.5;
        const surface = nearDist - half;
        if (surface < 18) {
          const prox = Math.max(0, 1 - surface / 18);
          upDist = 3.2 + prox * 10; // lift over the hull, don't zoom out
          lookAhead = 10 - prox * 2;
        }
      }
      const nose = noseDir(player);
      let bd = Math.min(backDist, backDist > 20 ? 40 : 24);
      let want = player.mesh.position.clone().addScaledVector(nose, -bd).add(new THREE.Vector3(0, upDist, 0));
      // If chase point sits inside a capital, lift up rather than zooming way out
      for (let i = 0; i < 6; i++) {
        let hit = false;
        for (const cap of capitals) {
          if (!cap.alive || !cap.mesh) continue;
          capitalHullBox(cap, _capBox, 3);
          if (_capBox.containsPoint(want)) { hit = true; break; }
        }
        if (!hit) break;
        want.y += 3.5;
        if (i >= 2) { bd = Math.min(40, bd + 3); want.copy(player.mesh.position).addScaledVector(nose, -bd).add(new THREE.Vector3(0, upDist + 4 + i, 0)); }
      }
      camPos.lerp(want, 1 - Math.exp(-5.2 * dt));
      const look = player.mesh.position.clone().addScaledVector(nose, lookAhead).add(new THREE.Vector3(0, 0.35, 0));
      camLook.lerp(look, 1 - Math.exp(-6.0 * dt));
    } else {
      // Command: top-down RTS view (high phi) looking at battle plane origin
      const phi = THREE.MathUtils.clamp(cmdOrbit.phi, 0.35, 1.35);
      const cx = commandFocus.x + Math.sin(cmdOrbit.theta) * Math.cos(phi) * cmdOrbit.dist;
      const cy = commandFocus.y + Math.sin(phi) * cmdOrbit.dist + 8;
      const cz = commandFocus.z + Math.cos(cmdOrbit.theta) * Math.cos(phi) * cmdOrbit.dist;
      camPos.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.exp(-5 * dt));
      camLook.lerp(commandFocus, 1 - Math.exp(-5 * dt));
    }
    if (shakeT > 0) {
      camera.position.copy(camPos).add(new THREE.Vector3((rand() - 0.5) * shakeAmp, (rand() - 0.5) * shakeAmp, (rand() - 0.5) * shakeAmp));
    } else camera.position.copy(camPos);
    camera.lookAt(camLook);
    // Frame check: player projected into central band
    if (mode === 'lead' && player && player.mesh && player.alive) {
      const v = player.mesh.position.clone().project(camera);
      playerFramed = v.z < 1 && Math.abs(v.x) < 0.72 && v.y > -0.85 && v.y < 0.55;
    } else {
      playerFramed = true;
    }
  }

  function resize() {
    const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Tall phone: widen V-FOV so Lead chase keeps tip-corridor enemies in frame
    camera.fov = (w / h) < 0.75 ? 62 : 55;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(mount);



  function ensureLeadCorridor() {
    if (!player || !player.mesh) return;
    const enemySide = player.side === 'attacker' ? 'defender' : 'attacker';
    const toward = player.side === 'attacker' ? 1 : -1;
    const enemies = fighters.filter((f) => f.alive && f.side === enemySide && f.mesh);
    const tipX = [0, -4, 4, -7, 7];
    const tipZ = [20, 28, 28, 36, 36];
    enemies.slice(0, 5).forEach((f, i) => {
      // Never rewrite player-issued orders (Command attack/move must survive Lead toggle)
      if (f.order && !f.order._tip) return;
      const x = tipX[i] + (rand() - 0.5) * 1.2;
      const y = 12 + (i % 3) * 2.2;
      const z = player.mesh.position.z + toward * tipZ[i];
      f.mesh.position.set(x, y, z);
      f.yaw = toward > 0 ? Math.PI : 0;
      f.mesh.rotation.y = f.yaw;
      f.pitch = 0;
      f.throttle = 0.55;
      f._tipHold = 8;
      f.order = { type: 'move', pos: new THREE.Vector3(x, y, z + toward * 10), _tip: true };
      f.aiState = 'move';
      pushPointOutOfCapitals(f.mesh.position, 6);
    });
  }

  function fitCommandToCapitals() {
    // Opening Command: side-on so both capitals sit across ~70% of screen width
    const alive = capitals.filter((c) => c.alive && c.mesh);
    const box = new THREE.Box3();
    for (const c of alive) {
      c.mesh.updateMatrixWorld(true);
      box.union(new THREE.Box3().setFromObject(c.mesh));
    }
    if (box.isEmpty()) {
      commandFocus.set(0, 4, 0);
      cmdOrbit.dist = 160;
      cmdOrbit.phi = 0.70;
      cmdOrbit.theta = 1.15;
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    commandFocus.copy(center);
    commandFocus.y = Math.max(4, center.y);
    // ~66° from +Z → look across the battle line (Z span = horizontal)
    cmdOrbit.theta = 1.15;
    cmdOrbit.phi = 0.70;
    const span = Math.max(size.z, size.x) * 1.08;
    const aspect = Math.max(0.35, camera.aspect || 1);
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * aspect);
    // Phone (tall): slightly lower fill so capitals aren't edge-to-edge
    const fill = aspect < 0.75 ? 0.55 : 0.70;
    let dist = (span * 0.5) / (Math.tan(hFov * 0.5) * fill);
    dist *= 1.08;
    const minD = aspect < 0.75 ? 280 : 140;
    const maxD = aspect < 0.75 ? 600 : 420;
    cmdOrbit.dist = THREE.MathUtils.clamp(dist, minD, maxD);
  }

  function snapCommandCamera() {
    const phi = THREE.MathUtils.clamp(cmdOrbit.phi, 0.35, 1.35);
    const cx = commandFocus.x + Math.sin(cmdOrbit.theta) * Math.cos(phi) * cmdOrbit.dist;
    const cy = commandFocus.y + Math.sin(phi) * cmdOrbit.dist + 8;
    const cz = commandFocus.z + Math.cos(cmdOrbit.theta) * Math.cos(phi) * cmdOrbit.dist;
    camPos.set(cx, cy, cz);
    camLook.copy(commandFocus);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  function setMode(m) {
    mode = m;
    btnLead.classList.toggle('on', m === 'lead');
    btnCommand.classList.toggle('on', m === 'command');
    hud.dataset.mode = m;
    const touch = $('[data-el="touch"]');
    if (touch) touch.hidden = !(isTouch && m === 'lead');
    if (m === 'command') {
      fitCommandToCapitals();
      snapCommandCamera();
    } else if (m === 'lead' && player && player.mesh) {
      ensureLeadCorridor();
      let backDist = chaseBackDist(), upDist = 3.2;
      for (const cap of capitals) {
        if (!cap.alive || !cap.mesh) continue;
        const Lc = cap.mesh.userData.L || 5.6;
        const half = Lc * (cap.mesh.scale.x || 1) * 0.5;
        const d = player.mesh.position.distanceTo(cap.mesh.position);
        const surface = d - half;
        if (surface < 18) {
          const prox = 1 - surface / 18;
          upDist = Math.max(upDist, 3.2 + prox * 10);
        }
      }
      {
        const nose = noseDir(player);
        let bd = Math.min(backDist, backDist > 20 ? 40 : 24);
        camPos.copy(player.mesh.position).addScaledVector(nose, -bd).add(new THREE.Vector3(0, upDist, 0));
        for (let i = 0; i < 6; i++) {
          let hit = false;
          for (const cap of capitals) {
            if (!cap.alive || !cap.mesh) continue;
            capitalHullBox(cap, _capBox, 3);
            if (_capBox.containsPoint(camPos)) { hit = true; break; }
          }
          if (!hit) break;
          camPos.y += 3.5;
          if (i >= 2) {
            bd = Math.min(40, bd + 3);
            camPos.copy(player.mesh.position).addScaledVector(nose, -bd).add(new THREE.Vector3(0, upDist + 4 + i, 0));
          }
        }
        camLook.copy(player.mesh.position).addScaledVector(nose, 14).add(new THREE.Vector3(0, 0.35, 0));
        camera.position.copy(camPos);
        camera.lookAt(camLook);
      }
    }
    setHint();
    updateSelChip();
  }

  function onSpeed() {
    if (paused) return;
    unlockAudio();
    speedI = (speedI + 1) % SPEEDS.length;
    timeScale = SPEEDS[speedI];
    btnSpeed.querySelector('.lab').textContent = 'x' + timeScale;
    btnSpeed.classList.toggle('on', speedI > 0);
  }
  function onMute() {
    unlockAudio();
    audio.setMuted(!audio.muted);
    elMuteIcon.innerHTML = iconHtml(audio.muted ? 'mute' : 'sound');
    const muteLab = $('[data-el="muteLab"]');
    if (muteLab) muteLab.textContent = audio.muted ? 'Muted' : 'Sound';
    btnMute.classList.toggle('on', audio.muted);
  }
  function onRetreat() {
    if (paused || ended) return;
    unlockAudio();
    endBattle('defender', true);
  }
  function onScPause() { paused = true; lastT = 0; audio.suspend(); }
  function onScResume() { paused = false; lastT = 0; if (!audio.muted) audio.resume(); }
  function onScQuit() {
    if (done) return;
    if (phase === 'outro' && pendingResult) {
      pendingResult.retreated = true; pendingResult.winner = 'defender';
      pendingResult.pointsEarned = 0; finishPending(); return;
    }
    endBattle('defender', true, { skipBanner: true, forceQuit: true });
    finishPending();
  }

  btnSpeed.addEventListener('click', onSpeed);
  btnMute.addEventListener('click', onMute);
  btnRetreat.addEventListener('click', onRetreat);
  btnLead.addEventListener('click', () => { unlockAudio(); setMode('lead'); });
  btnCommand.addEventListener('click', () => { unlockAudio(); setMode('command'); });
  bannerEl.addEventListener('click', () => { if (!paused && phase === 'outro' && pendingResult) finishPending(); });
  mount.addEventListener('sc-pause', onScPause);
  mount.addEventListener('sc-resume', onScResume);
  mount.addEventListener('sc-quit', onScQuit);

  elClassPick.querySelectorAll('[data-class]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingClass = btn.getAttribute('data-class') || 'fighter';
      elClassPick.querySelectorAll('[data-class]').forEach((b) => b.classList.toggle('on', b === btn));
      // confirm early
      classPickT = 0;
      respawnT = Math.min(respawnT, 0.35);
    });
  });

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    unlockAudio();
    dismissHint();
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio(); dismissHint();
    if (mode === 'command') {
      const btn = e.button;
      const count = cmdPointers.size + 1;
      // PC: RMB/MMB = orbit; LMB = select/box/order
      // Touch: 2nd finger starts orbit; 1 finger = box/tap
      const wantOrbit = (!isTouch && (btn === 1 || btn === 2)) || (isTouch && count >= 2);
      if (wantOrbit) {
        // cancel any box
        cmdBox = null; updateBoxDom();
        cmdDrag = { x: e.clientX, y: e.clientY, t0: cmdOrbit.theta, p0: cmdOrbit.phi, id: e.pointerId };
        cmdPointers.set(e.pointerId, { kind: 'orbit', x: e.clientX, y: e.clientY, button: btn });
      } else {
        cmdPointers.set(e.pointerId, { kind: 'box', x: e.clientX, y: e.clientY, button: btn });
        cmdBox = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
        updateBoxDom();
      }
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
      return;
    }
    if (!isTouch) { keysMouseDown = true; fireHeld = true; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseAim.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouseAim.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    {
      const ndc = new THREE.Vector2(mouseAim.x, -mouseAim.y);
      raycaster.setFromCamera(ndc, camera);
      let best = null, bestD = 1e9;
      for (const cap of capitals) {
        if (!cap.alive) continue;
        for (let i = 0; i < cap.markers.length; i++) {
          if (cap.subs[i].hp <= 0) continue;
          const wp = new THREE.Vector3();
          cap.markers[i].node.getWorldPosition(wp);
          const d = raycaster.ray.distanceSqToPoint(wp);
          const along = raycaster.ray.direction.dot(wp.clone().sub(raycaster.ray.origin));
          if (along > 0 && d < 12 && d < bestD) { bestD = d; best = { cap, idx: i }; }
        }
      }
      hoverSub = best;
    }
    if (mode === 'command') {
      const p = cmdPointers.get(e.pointerId);
      if (cmdDrag && e.pointerId === cmdDrag.id) {
        cmdOrbit.theta = cmdDrag.t0 + (e.clientX - cmdDrag.x) * 0.005;
        cmdOrbit.phi = THREE.MathUtils.clamp(cmdDrag.p0 + (e.clientY - cmdDrag.y) * 0.0035, 0.55, 1.35);
      } else if (p && p.kind === 'box' && cmdBox) {
        cmdBox.x1 = e.clientX; cmdBox.y1 = e.clientY;
        updateBoxDom();
      }
      // If a second touch appears while boxing, promote to orbit
      if (isTouch && cmdPointers.size >= 2 && cmdBox) {
        cmdBox = null; updateBoxDom();
        for (const [id, info] of cmdPointers) {
          if (info.kind === 'box') {
            info.kind = 'orbit';
            cmdDrag = { x: info.x, y: info.y, t0: cmdOrbit.theta, p0: cmdOrbit.phi, id };
          }
        }
      }
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    keysMouseDown = false; fireHeld = false;
    if (mode === 'command') {
      const p = cmdPointers.get(e.pointerId);
      cmdPointers.delete(e.pointerId);
      if (cmdDrag && e.pointerId === cmdDrag.id) cmdDrag = null;
      if (p && p.kind === 'box' && cmdBox) {
        const dx = Math.abs(cmdBox.x1 - cmdBox.x0);
        const dy = Math.abs(cmdBox.y1 - cmdBox.y0);
        if (dx < 8 && dy < 8) {
          commandTap(e.clientX, e.clientY);
        } else {
          const picked = fightersInScreenBox(cmdBox);
          setSelection(picked);
        }
        cmdBox = null; updateBoxDom();
      }
      return;
    }
  });
  canvas.addEventListener('pointercancel', (e) => {
    cmdPointers.delete(e.pointerId);
    if (cmdDrag && e.pointerId === cmdDrag.id) cmdDrag = null;
    cmdBox = null; updateBoxDom();
  });
  canvas.addEventListener('contextmenu', (e) => { if (mode === 'command') e.preventDefault(); });
  canvas.addEventListener('wheel', (e) => {
    if (mode !== 'command') return;
    cmdOrbit.dist = THREE.MathUtils.clamp(cmdOrbit.dist + e.deltaY * 0.08, 120, 920);
  }, { passive: true });

  function joyAt(clientX, clientY) {
    const r = joyEl.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let x = (clientX - cx) / (r.width * 0.5);
    let y = (clientY - cy) / (r.height * 0.5);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    joy.x = x; joy.y = y;
    joyKnob.style.transform = `translate(${x * 28}px,${y * 28}px)`;
  }
  if (joyEl) {
    const onJoy = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      joy.active = true; joyAt(t.clientX, t.clientY); unlockAudio(); dismissHint();
      e.preventDefault();
    };
    joyEl.addEventListener('pointerdown', onJoy);
    joyEl.addEventListener('pointermove', (e) => { if (joy.active) onJoy(e); });
    const endJoy = () => { joy.active = false; joy.x = 0; joy.y = 0; joyKnob.style.transform = ''; };
    joyEl.addEventListener('pointerup', endJoy);
    joyEl.addEventListener('pointercancel', endJoy);
  }
  if (btnFire) {
    btnFire.addEventListener('pointerdown', (e) => { fireHeld = true; unlockAudio(); e.preventDefault(); });
    btnFire.addEventListener('pointerup', () => { fireHeld = false; });
    btnFire.addEventListener('pointercancel', () => { fireHeld = false; });
  }
  if (btnBoost) {
    btnBoost.addEventListener('pointerdown', (e) => { boostHeld = true; e.preventDefault(); });
    btnBoost.addEventListener('pointerup', () => { boostHeld = false; });
    btnBoost.addEventListener('pointercancel', () => { boostHeld = false; });
  }

  function frame(t) {
    if (done) return;
    raf = requestAnimationFrame(frame);
    if (mount.dataset && mount.dataset.paused === '1') paused = true;
    if (paused) { lastT = 0; renderer.render(scene, camera); return; }
    if (!lastT) lastT = t;
    let dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    const rawDt = dt;
    dt *= timeScale;

    if (phase === 'outro') {
      phaseT += rawDt;
      // Keep updating capital death feel during outro; banner waits for cascade
      for (const c of capitals) {
        if (c.feel && (c._dying || !c.alive)) {
          c.feel.update(rawDt, { throttle: 0, target: null });
          if (c.feel.state && c.feel.state.breakup && !c._wreckSanitized) {
            c._wreckSanitized = true;
            sanitizeCapitalWreck(c);
            // Same framing as feel-demo frameSections — lock cam ≥1.5 L from wreck
            if (!deathCamLock && root._sc && root._sc.poseCapitalThreeQuarter) {
              root._sc.poseCapitalThreeQuarter(c.side);
            }
          }
          // 0694fdb: keep grey wreck visible while wreckT > 0
          if (c.feel.isDone() && !(c.wreckT > 0)) { c.mesh.visible = false; }
        }
      }
      for (const f of fighters) {
        if (f._dying && f.feel && !f._feelDone) {
          f.feel.update(rawDt, { yawRate: 0, throttle: 0 });
          if (f.feel.isDone()) { f.mesh.visible = false; f._feelDone = true; }
        }
      }
      if (feelFX) feelFX.update(rawDt, camera);
      tickCapitalWrecks(rawDt);
      const capCascade = capitals.some((c) => c._dying && c.feel && !c.feel.isDone());
      // Capture hold: freeze outro before Victory/results so death stills/mp4 stay in-battle
      if (holdDeathCapture) {
        phaseT = Math.min(phaseT, 6.2);
        hideBanner();
        fadingOut = false;
        root.style.opacity = '1';
        root.style.transition = '';
        const res = document.querySelector('[data-sc-results="1"], #result, .sc-results');
        if (res) { res.hidden = true; res.classList.remove('show'); res.style.display = 'none'; }
      }
      const bannerWait = capCascade ? 8.0 : OUTRO_BANNER_S;
      // Deferred Victory: show briefly once cascade finished (or just before fade)
      if (!holdDeathCapture && pendingResult && pendingResult._deferBanner && (!capCascade || phaseT >= 7.95)) {
        showOutroBanner(!!pendingResult._playerWon, pendingResult.pointsEarned || 0);
        pendingResult._deferBanner = false;
      }
      if (!holdDeathCapture && !fadingOut && phaseT >= bannerWait) {
        fadingOut = true; hideBanner();
        root.style.transition = `opacity ${OUTRO_FADE_S}s ease`;
        root.style.opacity = '0';
      }
      const outroDone = !capCascade && phaseT >= (capCascade ? 8.0 : OUTRO_S);
      // Wait until capital feel done AND minimum outro elapsed
      if (!holdDeathCapture && !capCascade && phaseT >= Math.max(OUTRO_S, bannerWait + OUTRO_FADE_S) && pendingResult) {
        finishPending(); return;
      }
    } else if (!ended) {
      fightTime += rawDt;
      hintT += rawDt;
      // Lead tip fades; Command selection panel stays while units are selected
      if (mode === 'lead' && hintT >= HINT_S) dismissHint();
      else if (mode === 'command') updateSelectionPanel();
      if (playerDead) {
        respawnT -= rawDt;
        classPickT -= rawDt;
        elRespawnN.textContent = String(Math.max(1, Math.ceil(respawnT)));
        if (elClassTimer) elClassTimer.textContent = pickingClass ? (`Auto ${Math.max(1, Math.ceil(classPickT))}s`) : '';
        if (pickingClass && classPickT <= 0) {
          pendingClass = pendingClass || 'fighter';
          pickingClass = false;
        }
        if (respawnT <= 0) respawnPlayer();
      }
      playerInput(dt);
      for (const f of fighters) {
        aiTick(f, dt); // player skipped inside when Lead
        integrateFighter(f, dt);
      }
      updateCommandOverlays();
      capitalSystems(dt);
      tickProjectiles(dt);
      tickAiRespawns();
      checkWin();
      // Vehicle feel (visual only) — skip while paused (frame returns early above)
      for (const f of fighters) {
        if (!f.feel) continue;
        if (f._dying) {
          f.feel.update(dt, { yawRate: 0, throttle: 0 });
          if (f.feel.isDone()) { f.mesh.visible = false; f._feelDone = true; }
          continue;
        }
        if (!f.alive) continue;
        const spd = f.speed > 0 ? Math.min(1, f.vel.length() / Math.max(0.1, f.speed)) : 0;
        f.feel.update(dt, {
          yawRate: f._yawRate || 0,
          throttle: f.throttle || 0,
          boost: !!(f.isPlayer && boostHeld),
          climb: f.pitch || 0,
          lateral: 0,
          speedFrac: spd,
          throttleDelta: f._throttleDelta || 0,
        });
      }
      for (const c of capitals) {
        if (!c.feel) continue;
        if (c._dying || !c.alive) {
          c.feel.update(dt, { throttle: 0, target: null });
          if (c.feel.state && c.feel.state.breakup && !c._wreckSanitized) {
            c._wreckSanitized = true;
            sanitizeCapitalWreck(c);
          }
          if (c.feel.isDone() && !(c.wreckT > 0)) c.mesh.visible = false;
          continue;
        }
        const foe = capitals.find((x) => x.alive && x.side !== c.side);
        c.feel.update(dt, {
          throttle: c.enginesAlive ? 0.55 : 0.1,
          target: foe ? foe.mesh.position : null,
        });
      }
      if (feelFX) feelFX.update(dt, camera);
      // Stamp fireball peak time once coreBlast starts (for ≤1.2s fade)
      if (feelFX && feelFX._deathPeakAt == null) {
        for (const c of capitals) {
          const st = c.feel && c.feel.state;
          if (st && st.coreBlast) { feelFX._deathPeakAt = performance.now() / 1000; break; }
        }
      }
      polishDeathFx(false);
    }
    if (shakeT > 0) { shakeT -= rawDt; shakeAmp *= 0.9; }
    tickDebris(rawDt);
    tickCapitalWrecks(rawDt);
    tickFloats(rawDt);
    updateCamera(rawDt);
    applyNearCamFade(rawDt);
    fadeCapitalShields();
    updatePlayerHud();
    updateTargeting();
    updateCapBars();
    updateSquadBar();
    planetMesh.rotation.y += rawDt * 0.03;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  setMode('command');

  root._sc = {
    get entities() { return fighters; },
    get fighters() { return fighters; },
    get capitals() { return capitals; },
    get player() { return player; },
    get camera() { return camera; },
    get scene() { return scene; },
    get renderer() { return renderer; },
    get feelFX() { return feelFX; },
    get mode() { return mode; },
    get phase() { return phase; },
    get ended() { return ended; },
    get done() { return done; },
    get fightTime() { return fightTime; },
    get timeScale() { return timeScale; },
    get paused() { return paused; },
    get muted() { return audio.muted; },
    get points() { return { attacker: ptsAtk, defender: ptsDef, goal: POINTS_GOAL }; },
    get softLock() { return softLock ? { align: softLock.align, dist: softLock.dist } : null; },
    get playerFramed() { return playerFramed; },
    get braking() { return braking; },
    get tickets() { return { attacker: ticketPoolOn ? ticketsAtk : null, defender: ticketPoolOn ? ticketsDef : null }; },
    get bonus() { return bonus; },
    get pickingClass() { return pickingClass; },
    get pendingClass() { return pendingClass; },
    get selected() { return selected.slice(); },
    get selectionCount() { return selected.filter((f) => f.alive).length; },
    projectPlayerScreen() {
      if (!player || !player.mesh) return null;
      const v = player.mesh.position.clone().project(camera);
      const r = canvas.getBoundingClientRect();
      return {
        x: r.left + (v.x * 0.5 + 0.5) * r.width,
        y: r.top + (-v.y * 0.5 + 0.5) * r.height,
        behind: v.z > 1,
      };
    },
    playerScreenHeightRatio() {
      if (!player || !player.mesh || !player.alive) return 0;
      camera.updateMatrixWorld(true);
      // Characteristic fighter height vs chase distance (stable under bank/pitch)
      const dist = Math.max(1, camera.position.distanceTo(player.mesh.position));
      const vFov = (camera.fov * Math.PI) / 180;
      const charH = FIGHTER_LEN * 0.42; // matches chase silhouette at backDist~15.5
      return charH / (2 * dist * Math.tan(vFov * 0.5));
    },
    playerScreenWidthRatio() {
      if (!player || !player.mesh || !player.alive) return 0;
      camera.updateMatrixWorld(true);
      // Characteristic wingspan vs chase distance — AABB inflates under feel bank/pitch
      const dist = Math.max(1, camera.position.distanceTo(player.mesh.position));
      const vFov = (camera.fov * Math.PI) / 180;
      const aspect = Math.max(0.2, camera.aspect || 1);
      const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * aspect);
      const charW = FIGHTER_LEN * 0.58;
      return charW / (2 * dist * Math.tan(hFov * 0.5));
    },
    get bracketVisible() { return !!(elBracket && !elBracket.hidden); },
    get softLockAlign() { return softLock ? softLock.align : 0; },
    commandMarkerPixelSizes() {
      const out = [];
      for (const f of fighters) {
        if (!f.alive) continue;
        const m = teamRings.get(f);
        out.push({ id: f.id, px: m && m.visible ? (m.userData.screenPx || 0) : 0 });
      }
      return out;
    },
    minCommandMarkerPx() {
      let mn = 1e9;
      for (const f of fighters) {
        if (!f.alive) continue;
        const m = teamRings.get(f);
        const px = m && m.visible ? (m.userData.screenPx || 0) : 0;
        if (px < mn) mn = px;
      }
      return mn === 1e9 ? 0 : mn;
    },
    fighterFeelBank(f) {
      const x = f || player;
      return x && x.feel && x.feel.state ? x.feel.state.bank : 0;
    },
    capitalFeelDone(side) {
      const c = capitals.find((x) => x.side === side) || capitals[0];
      return !!(c && c.feel && c.feel.isDone());
    },
    capitalDying(side) {
      const c = capitals.find((x) => x.side === side) || capitals[0];
      return !!(c && c._dying);
    },
    forceKillCapital(side, killOpts) {
      const c = capitals.find((x) => x.side === side) || capitals[0];
      if (!c) return false;
      // Intact-death only (Lead HOLD breakup). killOpts.cpuClipBreakup ignored.
      destroyCapital(c);
      return true;
    },
    feelFxSpriteCount() {
      return feelFX && feelFX.sprites ? feelFX.sprites.length : 0;
    },
    setHoldDeathCapture(v) { holdDeathCapture = !!v; if (v) { hideBanner(); fadingOut = false; root.style.opacity = '1'; } },
    getHoldDeathCapture() { return !!holdDeathCapture; },
    poseCapitalThreeQuarter(side) {
      const cap = capitals.find((c) => c.side === side) || capitals[0];
      if (!cap || !cap.mesh) return false;
      // Lock BEFORE mode switch so command overview cannot stick between frames
      deathCamLock = true;
      setMode('command');
      for (const [, m] of teamRings) m.visible = false;
      for (const [, m] of selRings) m.visible = false;
      if (groupSelRing) groupSelRing.visible = false;
      // 0694fdb grey wreck: keep full hull silhouette for ≥40% width (no thin-plate strip)
      const _st0 = cap.feel && cap.feel.state;
      const _0694 = !cap.alive && (!!(_st0 && _st0.done) || (cap.wreckT > 0))
        && !(_st0 && (_st0.breakup || _st0.intactBurn || ((_st0.sections || []).length > 0)));
      if (!_0694) hideCapitalBattleExtras(cap);
      else {
        // still hide subsystem markers/shield HUD clutter
        for (const m of (cap.markers || [])) {
          if (m.node) m.node.visible = false;
          if (m.glow) m.glow.visible = false;
          if (m.outline) m.outline.visible = false;
          if (m.bars && m.bars.el) m.bars.el.style.display = 'none';
        }
      }
      sanitizeCapitalWreck(cap);
      // Ensure wreck mesh stays visible for framing while wreckT active
      if (cap.wreckT > 0) cap.mesh.visible = true;
      // Hide ALL capital shields for a clean death still
      for (const c of capitals) {
        const sh = c.mesh && c.mesh.userData && c.mesh.userData.shield;
        if (sh) { sh.visible = false; sh.userData._battleHidden = true; }
      }
      // Hide other capitals so none sit between cam and wreck (far-side + clear LOS)
      for (const c of capitals) {
        if (c === cap || !c.mesh) continue;
        if (c.mesh.userData._deathCamHidden == null) c.mesh.userData._deathCamHidden = c.mesh.visible;
        c.mesh.visible = false;
      }
      if (typeof planetMesh !== 'undefined' && planetMesh) {
        if (planetMesh.userData._deathCamHidden == null) planetMesh.userData._deathCamHidden = planetMesh.visible;
        planetMesh.visible = false;
      }
      const st = cap.feel && cap.feel.state;
      const secs = (st && st.sections) || [];
      const L = (cap.mesh.userData && cap.mesh.userData.worldHullL)
        || (cap.feel && cap.feel.worldL) || 40;
      // Centroid = average of section world positions (stable; not inflated AABB)
      const center = new THREE.Vector3();
      const secCenters = [];
      let pieceSpan = 0;
      if (secs.length) {
        for (const s of secs) {
          if (!s) continue;
          s.updateWorldMatrix(true, true);
          const wp = new THREE.Vector3();
          s.getWorldPosition(wp);
          secCenters.push(wp.clone());
          center.add(wp);
          const sb = new THREE.Box3();
          let anyM = false;
          s.traverse((ch) => {
            if (!ch.isMesh || !ch.visible || !ch.geometry) return;
            const mat = Array.isArray(ch.material) ? ch.material[0] : ch.material;
            if (mat && mat.blending === THREE.AdditiveBlending) return;
            if (ch.userData && ch.userData._feelCutFx) return;
            sb.expandByObject(ch); anyM = true;
          });
          if (anyM) {
            const sz = new THREE.Vector3(); sb.getSize(sz);
            pieceSpan = Math.max(pieceSpan, sz.x, sz.y, sz.z);
          }
        }
        center.multiplyScalar(1 / Math.max(1, secCenters.length));
      } else {
        cap.mesh.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(cap.mesh);
        box.getCenter(center);
        const sz = new THREE.Vector3(); box.getSize(sz);
        pieceSpan = Math.max(sz.x, sz.y, sz.z);
      }
      // Content span: 3 big pieces + modest gaps (not empty AABB of drifted debris)
      let outer = 0;
      if (secCenters.length >= 2) {
        for (let i = 0; i < secCenters.length; i++) {
          for (let j = i + 1; j < secCenters.length; j++) {
            outer = Math.max(outer, secCenters[i].distanceTo(secCenters[j]));
          }
        }
      }
      const span = Math.max(L * 0.85, pieceSpan * 2.4, outer + pieceSpan * 0.9, L * 0.9);
      camera.fov = 38;
      camera.updateProjectionMatrix();
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      // Aim wreck ≥40% width → fill≈0.48; clamp cam to 1.6–2.0 capital-lengths
      let fill = 0.48;
      let dist = (span * 0.5) / Math.tan(hFov * 0.5) / fill;
      dist = THREE.MathUtils.clamp(dist, L * 1.6, L * 2.0);
      // Outboard / far-side candidates: away from other capitals, slight three-quarter
      const zSign = (cap.zSign != null) ? cap.zSign : (cap.mesh.position.z >= 0 ? 1 : -1);
      const others = capitals.filter((c) => c !== cap && c.mesh);
      const mid = new THREE.Vector3(0, center.y, 0);
      const away = center.clone().sub(mid);
      if (away.lengthSq() < 1) away.set(0, 0, zSign);
      away.y = 0; away.normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const sideV = new THREE.Vector3().crossVectors(up, away).normalize();
      const candidates = [
        away.clone().multiplyScalar(0.92).addScaledVector(up, 0.28).addScaledVector(sideV, 0.22).normalize(),
        away.clone().multiplyScalar(0.92).addScaledVector(up, 0.28).addScaledVector(sideV, -0.22).normalize(),
        away.clone().multiplyScalar(0.85).addScaledVector(up, 0.40).normalize(),
        away.clone().multiplyScalar(0.75).addScaledVector(up, 0.25).addScaledVector(sideV, 0.55).normalize(),
        away.clone().multiplyScalar(0.75).addScaledVector(up, 0.25).addScaledVector(sideV, -0.55).normalize(),
        new THREE.Vector3(0.15, 0.35, zSign).normalize(),
        new THREE.Vector3(-0.15, 0.35, zSign).normalize(),
      ];
      function losBlocked(from, to) {
        const dir = to.clone().sub(from);
        const len = dir.length();
        if (len < 1e-3) return true;
        dir.multiplyScalar(1 / len);
        const ray = new THREE.Ray(from, dir);
        for (const o of others) {
          // Test against hull box even if we hid the mesh (restore temporarily for box)
          const was = o.mesh.visible;
          o.mesh.visible = true;
          o.mesh.updateWorldMatrix(true, true);
          const hb = capitalHullBox(o, new THREE.Box3(), 2);
          o.mesh.visible = was;
          if (hb.isEmpty()) continue;
          const hit = new THREE.Vector3();
          if (ray.intersectBox(hb, hit)) {
            const t = from.distanceTo(hit);
            if (t > 0.5 && t < len - 1) return true;
          }
        }
        return false;
      }
      let bestDir = candidates[0];
      let placed = false;
      for (const d of candidates) {
        const trial = center.clone().addScaledVector(d, dist);
        if (!losBlocked(trial, center)) { bestDir = d; placed = true; break; }
      }
      if (!placed) {
        // Fallback: push further outboard along away
        bestDir = away.clone().addScaledVector(up, 0.3).normalize();
      }
      // Keep each section in 1.6–2.0L band (nudge dist inside clamp)
      for (let guard = 0; guard < 10; guard++) {
        camPos.copy(center).addScaledVector(bestDir, dist);
        let minL = Infinity, maxL = 0;
        for (const wp of secCenters) {
          const dL = camPos.distanceTo(wp) / L;
          minL = Math.min(minL, dL); maxL = Math.max(maxL, dL);
        }
        if (!secCenters.length) break;
        if (minL < 1.6) { dist = Math.min(L * 2.0, dist * 1.06); continue; }
        if (minL > 2.0) { dist = Math.max(L * 1.6, dist * 0.94); continue; }
        break;
      }
      // If projected fill still shy of 40%, ease toward 1.6L
      {
        const projFill = (span * 0.5) / (dist * Math.tan(hFov * 0.5));
        if (projFill < 0.42) dist = Math.max(L * 1.6, dist * (projFill / 0.45));
      }
      camPos.copy(center).addScaledVector(bestDir, dist);
      // Final LOS retry at settled dist
      if (losBlocked(camPos, center)) {
        for (const d of candidates) {
          const trial = center.clone().addScaledVector(d, dist);
          if (!losBlocked(trial, center)) { camPos.copy(trial); bestDir = d; break; }
        }
      }
      commandFocus.copy(center);
      camLook.copy(center);
      camera.position.copy(camPos);
      camera.near = Math.max(0.5, dist * 0.02);
      camera.far = Math.max(dist * 12, L * 20);
      camera.updateProjectionMatrix();
      camera.lookAt(camLook);
      // Pull FOV until wreck spans ≥42% width (PC wide aspect needs tighter FOV than phone)
      for (let i = 0; i < 12; i++) {
        const wf = root._sc && root._sc.wreckScreenWidthFrac
          ? root._sc.wreckScreenWidthFrac(side)
          : { ok: false, frac: 0 };
        if (wf && wf.ok && wf.frac >= 0.42) break;
        camera.fov = Math.max(12, camera.fov * 0.86);
        camera.updateProjectionMatrix();
        camera.lookAt(camLook);
      }
      cmdOrbit.dist = dist;
      cmdOrbit.phi = 0.28;
      cmdOrbit.theta = Math.atan2(bestDir.x, bestDir.z);
      polishDeathFx(true);
      return true;
    },
    /** Projected horizontal span of wreck sections as fraction of viewport width. */
    wreckScreenWidthFrac(side) {
      const cap = capitals.find((c) => c.side === side) || capitals[0];
      if (!cap) return { ok: false, frac: 0 };
      const st = cap.feel && cap.feel.state;
      const secs = (st && st.sections) || [];
      camera.updateMatrixWorld(true);
      const canvasR = canvas.getBoundingClientRect();
      const vw = Math.max(1, canvasR.width);
      let minX = Infinity, maxX = -Infinity, n = 0;
      const corners = [
        new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
        new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
      ];
      function expandMesh(ch) {
        if (!ch.isMesh || !ch.visible || !ch.geometry) return;
        const mat = Array.isArray(ch.material) ? ch.material[0] : ch.material;
        if (mat && mat.blending === THREE.AdditiveBlending) return;
        if (ch.userData && ch.userData._feelCutFx) return;
        if (!ch.geometry.boundingBox) {
          try { ch.geometry.computeBoundingBox(); } catch (_) { return; }
        }
        const bb = ch.geometry.boundingBox;
        if (!bb) return;
        const min = bb.min, max = bb.max;
        corners[0].set(min.x, min.y, min.z);
        corners[1].set(min.x, min.y, max.z);
        corners[2].set(min.x, max.y, min.z);
        corners[3].set(min.x, max.y, max.z);
        corners[4].set(max.x, min.y, min.z);
        corners[5].set(max.x, min.y, max.z);
        corners[6].set(max.x, max.y, min.z);
        corners[7].set(max.x, max.y, max.z);
        ch.updateWorldMatrix(true, false);
        for (const c of corners) {
          c.applyMatrix4(ch.matrixWorld);
          c.project(camera);
          if (c.z < -1 || c.z > 1) continue;
          const sx = (c.x * 0.5 + 0.5) * vw;
          minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); n++;
        }
      }
      const roots = secs.length ? secs : [cap.feel && cap.feel.feelRoot, cap.mesh].filter(Boolean);
      for (const s of roots) {
        if (!s) continue;
        s.traverse(expandMesh);
      }
      if (!n || !Number.isFinite(minX)) return { ok: false, frac: 0, sections: secs.length };
      const frac = Math.max(0, (maxX - minX) / vw);
      return { ok: true, frac, sections: secs.length, px: maxX - minX, vw };
    },
    /** True when no other capital hull intersects the segment camera→wreck centroid. */
    deathCamClearOfOtherCapitals(side) {
      const cap = capitals.find((c) => c.side === side) || capitals[0];
      if (!cap) return { ok: false, clear: false };
      const st = cap.feel && cap.feel.state;
      const secs = (st && st.sections) || [];
      const center = new THREE.Vector3();
      let n = 0;
      for (const s of secs) {
        if (!s) continue;
        const wp = new THREE.Vector3();
        s.getWorldPosition(wp);
        center.add(wp); n++;
      }
      if (n) center.multiplyScalar(1 / n);
      else center.copy(cap.mesh.position);
      const from = camera.position.clone();
      const dir = center.clone().sub(from);
      const len = dir.length();
      if (len < 1e-3) return { ok: true, clear: false, reason: 'degenerate' };
      dir.multiplyScalar(1 / len);
      const ray = new THREE.Ray(from, dir);
      const blockers = [];
      for (const o of capitals) {
        if (o === cap || !o.mesh) continue;
        const was = o.mesh.visible;
        o.mesh.visible = true;
        o.mesh.updateWorldMatrix(true, true);
        const hb = capitalHullBox(o, new THREE.Box3(), 2);
        o.mesh.visible = was;
        if (hb.isEmpty()) continue;
        const hit = new THREE.Vector3();
        if (ray.intersectBox(hb, hit)) {
          const t = from.distanceTo(hit);
          if (t > 0.5 && t < len - 1) blockers.push({ side: o.side, t: +t.toFixed(1), len: +len.toFixed(1) });
        }
      }
      return { ok: true, clear: blockers.length === 0, blockers, dist: +len.toFixed(1) };
    },
    groupRingScreenMetrics() {
      if (!elGroupRing || elGroupRing.hidden || !elGroupRing.classList.contains('on')) {
        return { visible: false, w: 0, h: 0, frac: 0, stroke: 0, pad: 0 };
      }
      const r = elGroupRing.getBoundingClientRect();
      const rootR = root.getBoundingClientRect();
      const w = r.width, h = r.height;
      return {
        visible: true,
        w: Math.round(w),
        h: Math.round(h),
        frac: w / Math.max(1, rootR.width),
        stroke: parseFloat(elGroupRing.dataset.stroke || '2.5'),
        pad: parseFloat(elGroupRing.dataset.pad || '16'),
      };
    },
    /** Every selected unit's screen pos must lie inside the group ring (test helper). */
    groupRingContainsSelected() {
      if (!elGroupRing || elGroupRing.hidden || !elGroupRing.classList.contains('on')) {
        return { ok: false, reason: 'ring-hidden', inside: 0, total: 0, outside: [] };
      }
      const ring = elGroupRing.getBoundingClientRect();
      const cx = ring.left + ring.width * 0.5;
      const cy = ring.top + ring.height * 0.5;
      const rad = Math.min(ring.width, ring.height) * 0.5;
      camera.updateMatrixWorld(true);
      const canvasR = canvas.getBoundingClientRect();
      const outside = [];
      let inside = 0;
      const aliveSel = selected.filter((f) => f.alive && f.mesh);
      for (const f of aliveSel) {
        const v = f.mesh.position.clone().project(camera);
        if (v.z > 1) { outside.push({ id: f.id, reason: 'behind' }); continue; }
        const sx = canvasR.left + (v.x * 0.5 + 0.5) * canvasR.width;
        const sy = canvasR.top + (-v.y * 0.5 + 0.5) * canvasR.height;
        const d = Math.hypot(sx - cx, sy - cy);
        if (d <= rad + 1.5) inside += 1;
        else outside.push({ id: f.id, d: Math.round(d), rad: Math.round(rad), sx: Math.round(sx), sy: Math.round(sy) });
      }
      return { ok: outside.length === 0 && aliveSel.length > 0, inside, total: aliveSel.length, outside };
    },
    /** Shove non-player enemies outside a screen-radius cone (Lead capture / anti-clump). */
    clearEnemiesNearCrosshair(frac = 0.28) {
      if (!player || !player.mesh) return 0;
      camera.updateMatrixWorld(true);
      const side = player.side;
      const lim = frac * 1.414;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      let n = 0;
      for (const f of fighters) {
        if (!f.alive || !f.mesh || f.side === side || f.isPlayer) continue;
        const v = f.mesh.position.clone().project(camera);
        if (v.z > 1) continue;
        const d = Math.hypot(v.x, v.y);
        if (d > lim) continue;
        n += 1;
        // Push radially outward in screen space to just past lim
        let px = v.x, py = v.y;
        const plen = Math.hypot(px, py) || 1e-4;
        px /= plen; py /= plen;
        const worldPush = right.clone().multiplyScalar(px).addScaledVector(up, py).normalize();
        const need = (lim + 0.08 - d) * 40; // world units per NDC
        f.mesh.position.addScaledVector(worldPush, Math.max(8, need * 18));
        // Prefer slightly up+side so they leave the tip
        f.mesh.position.y += 4;
      }
      return n;
    },
    countEnemiesNearCrosshair(frac = 0.15) {
      if (!player || !player.mesh) return 0;
      camera.updateMatrixWorld(true);
      const side = player.side;
      let n = 0;
      for (const f of fighters) {
        if (!f.alive || !f.mesh || f.side === side || f.isPlayer) continue;
        const v = f.mesh.position.clone().project(camera);
        if (v.z > 1) continue;
        const dist = Math.hypot(v.x, v.y);
        if (dist <= frac * 1.414) n += 1;
      }
      return n;
    },
    countFriendliesNearCrosshair(frac = 0.08) {
      if (!player || !player.mesh) return 0;
      camera.updateMatrixWorld(true);
      const side = player.side;
      const nose = noseDir(player);
      let n = 0;
      for (const f of fighters) {
        if (!f.alive || !f.mesh || f.isPlayer || f.side !== side) continue;
        if (f._nearHidden || (f.mesh && f.mesh.visible === false)) continue;
        const ahead = f.mesh.position.clone().sub(player.mesh.position).dot(nose) > 0.5;
        if (!ahead) continue;
        const v = f.mesh.position.clone().project(camera);
        if (v.z > 1) continue;
        if (Math.hypot(v.x, v.y) <= frac * 1.414) n += 1;
      }
      return n;
    },
    /** Max projected bbox area frac of any non-player mesh group (fighters, capital flames, capital hull). */
    maxNonPlayerScreenCover() {
      camera.updateMatrixWorld(true);
      let best = { frac: 0, id: null, kind: null };
      for (const f of fighters) {
        if (!f.alive || !f.mesh || f.isPlayer) continue;
        if (f._nearHidden || f.mesh.visible === false) continue;
        const frac = projectedBboxAreaFrac(f.mesh);
        if (frac > best.frac) best = { frac, id: f.id, kind: 'fighter' };
      }
      for (const c of capitals) {
        if (!c.mesh) continue;
        // Flame group (engine cones) — often the left-edge blue triangles
        const flames = (c.mesh.userData && c.mesh.userData.flames) || [];
        const visFlames = flames.filter((fl) => fl && fl.visible !== false);
        if (visFlames.length) {
          const box = new THREE.Box3();
          for (const fl of visFlames) { fl.updateWorldMatrix(true, true); box.expandByObject(fl); }
          if (!box.isEmpty()) {
            const corners = [
              new THREE.Vector3(box.min.x, box.min.y, box.min.z),
              new THREE.Vector3(box.min.x, box.min.y, box.max.z),
              new THREE.Vector3(box.min.x, box.max.y, box.min.z),
              new THREE.Vector3(box.min.x, box.max.y, box.max.z),
              new THREE.Vector3(box.max.x, box.min.y, box.min.z),
              new THREE.Vector3(box.max.x, box.min.y, box.max.z),
              new THREE.Vector3(box.max.x, box.max.y, box.min.z),
              new THREE.Vector3(box.max.x, box.max.y, box.max.z),
            ];
            let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, ok = false;
            for (const pt of corners) {
              pt.project(camera);
              if (pt.z > 1) continue;
              ok = true;
              minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
              minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
            }
            if (ok) {
              minX = Math.max(-1, minX); maxX = Math.min(1, maxX);
              minY = Math.max(-1, minY); maxY = Math.min(1, maxY);
              const frac = (Math.max(0, maxX - minX) * Math.max(0, maxY - minY)) / 4;
              if (frac > best.frac) best = { frac, id: c.side + '-flames', kind: 'flames' };
            }
          }
        }
        // Capital hull itself stays exempt when distant; near-cam rule targets flames (above).
      }
      return best;
    },
    /** Tighten selection to densest cluster so group ring can stay ≤35% and still contain all selected. */
    selectFriendlyCluster(maxN = 6, maxSep = 55) {
      const side = playerSideId();
      const pool = fighters.filter((f) => f.alive && f.mesh && f.side === side);
      if (!pool.length) { setSelection([]); return 0; }
      // Seed = fighter with most neighbors within maxSep
      let best = pool[0], bestN = -1;
      for (const f of pool) {
        let n = 0;
        for (const o of pool) {
          if (o === f) continue;
          if (f.mesh.position.distanceTo(o.mesh.position) <= maxSep) n += 1;
        }
        if (n > bestN) { bestN = n; best = f; }
      }
      const cluster = pool
        .map((f) => ({ f, d: f.mesh.position.distanceTo(best.mesh.position) }))
        .filter((x) => x.d <= maxSep)
        .sort((a, b) => a.d - b.d)
        .slice(0, maxN)
        .map((x) => x.f);
      setSelection(cluster);
      return cluster.length;
    },
    wreckMinDistInLengths(side) {
      const cap = capitals.find((c) => c.side === side) || capitals[0];
      if (!cap || !cap.mesh) return { ok: false };
      const L = (cap.mesh.userData && cap.mesh.userData.worldHullL) || 40;
      const st = cap.feel && cap.feel.state;
      const secs = (st && st.sections) || [];
      camera.updateMatrixWorld(true);
      let minDist = 1e9;
      if (secs.length) {
        const wp = new THREE.Vector3();
        for (const s of secs) {
          if (!s) continue;
          s.updateWorldMatrix(true, true);
          s.getWorldPosition(wp);
          minDist = Math.min(minDist, camera.position.distanceTo(wp));
        }
      } else {
        minDist = camera.position.distanceTo(cap.mesh.position);
      }
      return { ok: true, minDist, L, minL: minDist / L, sections: secs.length, breakup: !!(st && st.breakup) };
    },
    listLargeWreckMeshes(fracLimit = 0.2) {
      camera.updateMatrixWorld(true);
      const fov = (camera.fov * Math.PI) / 180;
      const out = [];
      for (const c of capitals) {
        const st = c.feel && c.feel.state;
        const secs = (st && st.sections) || [];
        for (const sec of secs) {
          if (!sec) continue;
          sec.traverse((ch) => {
            if (!ch.isMesh || !ch.visible || !ch.geometry) return;
            const box = new THREE.Box3().setFromObject(ch);
            const size = new THREE.Vector3(); box.getSize(size);
            const center = new THREE.Vector3(); box.getCenter(center);
            const dist = Math.max(0.5, camera.position.distanceTo(center));
            const world = Math.max(size.x, size.y, size.z);
            const frac = (world / dist) / (2 * Math.tan(fov * 0.5));
            if (frac >= fracLimit) {
              out.push({
                name: ch.name || '(unnamed)',
                geo: (ch.geometry.type || ''),
                parent: (sec.name || sec.uuid || '').toString().slice(0, 24),
                side: c.side,
                frac: +frac.toFixed(3),
                world: +world.toFixed(2),
              });
            }
          });
        }
      }
      out.sort((a, b) => b.frac - a.frac);
      return out;
    },
    sanitizeWreck(side) {
      const cap = capitals.find((c) => c.side === side) || capitals[0];
      return sanitizeCapitalWreck(cap);
    },
    resetCommandFocus() { commandFocus.set(0, 0, 0); return true; },

    subsystemsOnHull(expandFrac = 0.1) {
      const report = [];
      const _c = new THREE.Vector3(), _s = new THREE.Vector3();
      for (const cap of capitals) {
        if (!cap.alive || !cap.mesh) continue;
        const box = capitalHullBox(cap, new THREE.Box3(), 0);
        box.getCenter(_c);
        box.getSize(_s);
        _s.multiplyScalar(1 + expandFrac);
        box.setFromCenterAndSize(_c, _s);
        for (const mk of cap.markers) {
          const wp = new THREE.Vector3();
          mk.node.getWorldPosition(wp);
          report.push({ side: cap.side, kind: mk.kind, inside: box.containsPoint(wp), x: +wp.x.toFixed(2), y: +wp.y.toFixed(2), z: +wp.z.toFixed(2) });
        }
      }
      return report;
    },
    cameraInsideAnyCapital() {
      for (const cap of capitals) {
        if (!cap.alive || !cap.mesh) continue;
        if (capitalHullBox(cap, new THREE.Box3(), 0).containsPoint(camera.position)) return true;
      }
      return false;
    },
    playerProjectedInViewport() {
      if (!player || !player.mesh) return false;
      camera.updateMatrixWorld(true);
      const v = player.mesh.position.clone().project(camera);
      return v.z < 1 && v.x > -0.98 && v.x < 0.98 && v.y > -0.98 && v.y < 0.98;
    },
    capitalScreenWidthRatio(side) {
      const cap = capitals.find((c) => c.side === side && c.alive);
      if (!cap) return 0;
      const box = new THREE.Box3().setFromObject(cap.mesh);
      const pts = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ];
      const r = canvas.getBoundingClientRect();
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, any = false;
      for (const p of pts) {
        const v = p.project(camera);
        if (v.z > 1) continue;
        any = true;
        const x = (v.x * 0.5 + 0.5) * r.width;
        const y = (-v.y * 0.5 + 0.5) * r.height;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      if (!any) return 0;
      const w = (maxX - minX) / Math.max(1, r.width);
      const h = (maxY - minY) / Math.max(1, r.height);
      return Math.max(w, h);
    },
    countVisibleFighterBars() {
      return fighters.filter((f) => f.bars && f.bars.el && f.bars.el.style.display !== 'none').length;
    },
    countEnemyFightersOnScreen() {
      if (!player) return 0;
      camera.updateMatrixWorld(true);
      const enemySide = player.side === 'attacker' ? 'defender' : 'attacker';
      let n = 0;
      for (const f of fighters) {
        if (!f.alive || f.side !== enemySide || !f.mesh) continue;
        f.mesh.updateMatrixWorld(true);
        const v = f.mesh.position.clone().project(camera);
        if (v.z > 1) continue;
        if (Math.abs(v.x) <= 1.25 && Math.abs(v.y) <= 1.25) n += 1;
      }
      return n;
    },
    fighterPairwiseStats() {
      const alive = fighters.filter((f) => f.alive && f.mesh);
      const dists = [];
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          dists.push(alive[i].mesh.position.distanceTo(alive[j].mesh.position));
        }
      }
      dists.sort((a, b) => a - b);
      const minSep = FIGHTER_LEN * 1.5;
      const ok = dists.length ? dists.filter((d) => d >= minSep).length / dists.length : 1;
      return { pairs: dists.length, min: dists[0] || 0, p05: dists[Math.floor(dists.length * 0.05)] || 0, fracAbove15Len: ok, shipLen: FIGHTER_LEN };
    },
    capitalFighterLengthRatio() {
      const cap = capitals.find((c) => c.alive && c.mesh);
      if (!cap) return 0;
      const worldLen = (cap.mesh.userData.L || 5.6) * Math.abs(cap.mesh.scale.x || 1);
      return worldLen / FIGHTER_LEN;
    },
    capitalsCombinedScreenWidthRatio() {
      camera.updateMatrixWorld(true);
      const r = canvas.getBoundingClientRect();
      let minX = 1e9, maxX = -1e9, any = false;
      for (const cap of capitals) {
        if (!cap.alive || !cap.mesh) continue;
        cap.mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(cap.mesh);
        if (box.isEmpty()) continue;
        const corners = [
          new THREE.Vector3(box.min.x, box.min.y, box.min.z),
          new THREE.Vector3(box.min.x, box.min.y, box.max.z),
          new THREE.Vector3(box.min.x, box.max.y, box.min.z),
          new THREE.Vector3(box.min.x, box.max.y, box.max.z),
          new THREE.Vector3(box.max.x, box.min.y, box.min.z),
          new THREE.Vector3(box.max.x, box.min.y, box.max.z),
          new THREE.Vector3(box.max.x, box.max.y, box.min.z),
          new THREE.Vector3(box.max.x, box.max.y, box.max.z),
        ];
        for (const c of corners) {
          const v = c.project(camera);
          if (v.z > 1) continue;
          any = true;
          const x = (v.x * 0.5 + 0.5) * r.width;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        }
      }
      if (!any) return 0;
      minX = Math.max(0, minX); maxX = Math.min(r.width, maxX);
      return Math.max(0, maxX - minX) / Math.max(1, r.width);
    },
    maxNonPlayerScreenAreaRatio(opts) {
      if (!player) return 0;
      camera.updateMatrixWorld(true);
      const r = canvas.getBoundingClientRect();
      const viewArea = Math.max(1, r.width * r.height);
      const onlyNear = opts && opts.withinDist != null ? opts.withinDist : null;
      let maxA = 0;
      for (const f of fighters) {
        if (!f.alive || !f.mesh || f.isPlayer) continue;
        // Near-fade hide: contributes 0 screen area
        if (f._nearHidden || !f.mesh.visible) continue;
        f.mesh.updateMatrixWorld(true);
        const dist = f.mesh.position.distanceTo(camera.position);
        if (onlyNear != null && dist > onlyNear) continue;
        const ctr = f.mesh.position.clone().project(camera);
        if (ctr.z > 1 || Math.abs(ctr.x) > 1.2 || Math.abs(ctr.y) > 1.2) continue;
        // Characteristic wingspan (AABB inflates under bank); use FIGHTER_LEN for near ships
        let area;
        if (dist < 16) {
          const vFov = (camera.fov * Math.PI) / 180;
          const aspect = Math.max(0.2, camera.aspect || 1);
          const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * aspect);
          const charW = FIGHTER_LEN * 0.7;
          const charH = FIGHTER_LEN * 0.45;
          const w = charW / (2 * dist * Math.tan(hFov * 0.5));
          const h = charH / (2 * dist * Math.tan(vFov * 0.5));
          area = Math.max(0, Math.min(1, w)) * Math.max(0, Math.min(1, h));
        } else {
          const box = new THREE.Box3().setFromObject(f.mesh);
          if (box.isEmpty()) continue;
          const corners = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z),
          ];
          let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, any = false;
          for (const c of corners) {
            const v = c.project(camera);
            if (v.z > 1) continue;
            any = true;
            const x = (v.x * 0.5 + 0.5) * r.width;
            const y = (-v.y * 0.5 + 0.5) * r.height;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
          if (!any) continue;
          minX = Math.max(0, minX); maxX = Math.min(r.width, maxX);
          minY = Math.max(0, minY); maxY = Math.min(r.height, maxY);
          area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY) / viewArea;
        }
        // If faded, scale area by opacity so 20% opacity ≈ 0.2 contribution visually
        if (f._nearFaded && f._fadeMats && f._fadeMats.length) {
          const op = f._fadeMats[0].opacity != null ? f._fadeMats[0].opacity : 0.2;
          area *= Math.max(0.05, Math.min(1, op));
        }
        if (area > maxA) maxA = area;
      }
      return maxA;
    },
    sampleNearCamCoverage(frames = 20, withinDist = 6) {
      // Caller samples across animation frames; this returns current snapshot helpers
      return {
        maxAny: this.maxNonPlayerScreenAreaRatio(),
        maxNear: this.maxNonPlayerScreenAreaRatio({ withinDist }),
        nearHidden: fighters.filter((f) => f._nearHidden).length,
        nearFaded: fighters.filter((f) => f._nearFaded && !f._nearHidden).length,
      };
    },
    countVisibleSquadBars() {
      return (squadBar && squadBar.el && squadBar.el.style.display !== 'none') ? 1 : 0;
    },
    selectionPanelVisible() {
      return !!(elHint && !elHint.hidden && !elHint.classList.contains('hide') && mode === 'command');
    },
    selectionPanelHasPlaceholder() {
      if (!elHint) return false;
      const t = elHint.textContent || '';
      return /--|placeholder|N\/A/i.test(t) || /--|placeholder/i.test(elHint.innerHTML || '');
    },
    hasNumericDamageText() {
      const nodes = root.querySelectorAll('.sc-space-float');
      for (const el of nodes) {
        if (/\d/.test(el.textContent || '')) return true;
      }
      return false;
    },
    selectFighters(list) { setSelection(list); },
    selectAllFriendly() { setSelection(fighters.filter((f) => f.alive && f.side === playerSideId())); },
    issueMoveAt(x, y, z) { issueMove(new THREE.Vector3(x, y || 0, z)); },
    issueAttackFighter(f) { if (f) issueAttack({ kind: 'fighter', fighter: f, pos: f.mesh.position.clone() }); },
    issueAttackSub(side, idx) {
      const cap = capitals.find((c) => c.side === side);
      if (!cap || !cap.markers[idx]) return;
      const wp = new THREE.Vector3();
      cap.markers[idx].node.getWorldPosition(wp);
      issueAttack({ kind: 'sub', cap, subIdx: idx, pos: wp });
    },
    setMode, onSpeed, onRetreat, onMute, endBattle,
    damageSub(side, idx, dmg) {
      const cap = capitals.find((c) => c.side === side);
      if (cap) damageSub(cap, cap.subs[idx], dmg, cap.mesh.position.clone(), side === 'attacker' ? 'defender' : 'attacker');
    },
    addPoints(side, n) { addPoints(side, n); },
    setPoints(a, d) { ptsAtk = a; ptsDef = d; updatePointsHud(); checkWin(); },
    destroyAllSubs(side) {
      const cap = capitals.find((c) => c.side === side);
      if (!cap) return;
      for (let i = 0; i < cap.subs.length; i++) {
        if (cap.subs[i].hp > 0) damageSub(cap, cap.subs[i], 9999, cap.mesh.position.clone(), side === 'attacker' ? 'defender' : 'attacker');
      }
    },
    forcePlayerDeath() {
      if (player && player.alive) {
        player.shield = 0; player.hp = 0;
        killFighter(player, player.side === 'attacker' ? 'defender' : 'attacker');
      }
    },
  };

  cleanup = function () {
    cancelAnimationFrame(raf); raf = 0;
    try { ro.disconnect(); } catch (_) {}
    mount.removeEventListener('sc-pause', onScPause);
    mount.removeEventListener('sc-resume', onScResume);
    mount.removeEventListener('sc-quit', onScQuit);
    try { audio.dispose(); } catch (_) {}
    for (const f of floats) f.el.remove();
    for (const f of fighters) if (f.bars) f.bars.el.remove();
    if (squadBar && squadBar.el) squadBar.el.remove();
    squadBar = null;
    for (const c of capitals) for (const m of c.markers) m.bars.el.remove();
    clearSelRings();
    if (moveMarker) { scene.remove(moveMarker); disposeObject(moveMarker); moveMarker = null; }
    if (attackMarker) { scene.remove(attackMarker); disposeObject(attackMarker); attackMarker = null; }
    for (const p of projectiles) { scene.remove(p.mesh); disposeObject(p.mesh); }
    for (const d of debris) { scene.remove(d.mesh); disposeObject(d.mesh); }
    for (const f of fighters) {
      if (f.feel) f.feel = null;
      scene.remove(f.mesh); disposeObject(f.mesh);
    }
    for (const c of capitals) {
      if (c.feel) c.feel = null;
      scene.remove(c.mesh); disposeObject(c.mesh);
    }
    try { if (feelFX && feelFX.clear) feelFX.clear(); } catch (_) {}
    try { renderer.dispose(); } catch (_) {}
    if (root.parentNode) root.parentNode.removeChild(root);
  };

  return { abort() { if (!ended && !done) endBattle('defender', true); } };
}

export default startBattle;
