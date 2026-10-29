// STAR CONQUESTS — space battle module (CONTRACT.md v1).
// export startBattle(opts, onDone). Self-contained under space/.
// Banners match Dev B ground: .sc-banner / .sc-ban-card / .sc-ban-big / .sc-ban-pts / .sc-ban-sub
import * as THREE from './vendor/three.module.min.js';
import { SPACE_TYPES, resolveUnit, makeHangarCraft } from './roster.js';
import {
  buildSpaceShip, buildBattleShip, flashShield, tickShield, setShieldVisible, disposeObject,
} from './ships3d.js';

const SPEEDS = [1, 2, 4];
const ARENA = 20;
const PLANET_R = 7.5; // dim backdrop, partly off-screen
const INTRO_S = 1.25;
const OUTRO_S = 1.8;

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
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function cloneUnit(u) {
  return {
    id: u.id, type: u.type, name: u.name, icon: u.icon,
    stats: { ...(u.stats || {}) }, hpNow: u.hpNow,
  };
}

export function startBattle(opts, onDone) {
  loadCss();
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

  const atkIn = (opts.attacker && opts.attacker.units) || [];
  const defIn = (opts.defender && opts.defender.units) || [];
  const passthrough = (list) => list.filter((u) => !SPACE_TYPES.has(u.type)).map(cloneUnit);
  const atkPass = passthrough(atkIn);
  const defPass = passthrough(defIn);

  const seed = (opts.seed | 0) || 1;
  const rand = mulberry32(seed);

  const atkColor = (opts.attacker && opts.attacker.color) || '#2f80ed';
  const defColor = (opts.defender && opts.defender.color) || '#e74c3c';
  const atkSide = (opts.attacker && opts.attacker.side) || 'player';
  const defSide = (opts.defender && opts.defender.side) || 'enemy';
  const planet = opts.planet || { name: 'Planet', icon: '🪐', biome: 'rock', size: 2 };
  const playerIsAttacker = atkSide === 'player';

  const atkSpace = atkIn.filter((u) => SPACE_TYPES.has(u.type));
  const defSpace = defIn.filter((u) => SPACE_TYPES.has(u.type));
  if (!atkSpace.length || !defSpace.length) {
    const winner = atkSpace.length ? 'attacker' : 'defender';
    const survivors = {
      attacker: [...atkSpace.map(cloneUnit), ...atkPass],
      defender: [...defSpace.map(cloneUnit), ...defPass],
    };
    for (const u of survivors.attacker) {
      const src = atkIn.find((x) => x.id === u.id);
      if (src) u.hpNow = src.hpNow ?? src.stats?.hp;
    }
    for (const u of survivors.defender) {
      const src = defIn.find((x) => x.id === u.id);
      if (src) u.hpNow = src.hpNow ?? src.stats?.hp;
    }
    let pointsEarned = 0;
    if ((winner === 'attacker' && atkSide === 'player') || (winner === 'defender' && defSide === 'player')) {
      const enemy = winner === 'attacker' ? defSpace : atkSpace;
      pointsEarned = enemy.length ? 10 + 5 * enemy.length : 10;
    }
    finish({ winner, survivors, pointsEarned, retreated: false });
    return { abort: () => {} };
  }

  // --- DOM ---
  const root = document.createElement('div');
  root.className = 'sc-space-root';
  root.setAttribute('data-sc-space', '1');
  mount.appendChild(root);

  const canvas = document.createElement('canvas');
  root.appendChild(canvas);

  const hud = document.createElement('div');
  hud.className = 'sc-space-hud';
  hud.innerHTML = `
    <div class="sc-space-top">
      <div class="sc-space-pill" data-el="planet"><span>${planet.icon || '🪐'}</span><span class="lab">${planet.name || 'Planet'}</span></div>
      <div class="sc-space-pill" data-el="atk"><span>🔵</span><span class="lab">Atk</span>&nbsp;<b data-el="atkN">0</b></div>
      <div class="sc-space-pill" data-el="def"><span>🔴</span><span class="lab">Def</span>&nbsp;<b data-el="defN">0</b></div>
      <div class="sc-space-legend" data-el="legend"><span>❤️ HP</span><span>🛡️ Shield</span></div>
    </div>
    <div class="sc-space-hint" data-el="hint">👆 Tap ship · Tap move/attack</div>
    <div class="sc-space-bottom">
      <div class="sc-space-sel" data-el="sel"><span>🛸</span> <span class="lab">Tap a ship</span></div>
      <div class="sc-space-controls" style="display:flex;gap:8px;flex-wrap:wrap;pointer-events:auto">
        <button type="button" class="sc-space-btn on" data-act="auto" aria-label="Auto fight"><span>🤖</span><span class="lab">Auto</span></button>
        <button type="button" class="sc-space-btn" data-act="speed" aria-label="Speed"><span>⏩</span><span class="lab">x1</span></button>
        <button type="button" class="sc-space-btn danger" data-act="retreat" aria-label="Retreat"><span>🏳️</span><span class="lab">Retreat</span></button>
      </div>
    </div>`;
  root.appendChild(hud);

  // Dev B–matching banner overlay
  const bannerEl = document.createElement('div');
  bannerEl.className = 'sc-banner';
  bannerEl.setAttribute('data-sc-banner', '');
  bannerEl.hidden = true;
  root.appendChild(bannerEl);

  const $ = (sel) => hud.querySelector(sel);
  const elHint = $('[data-el="hint"]');
  const elSel = $('[data-el="sel"]');
  const elAtkN = $('[data-el="atkN"]');
  const elDefN = $('[data-el="defN"]');
  const btnAuto = $('[data-act="auto"]');
  const btnSpeed = $('[data-act="speed"]');
  const btnRetreat = $('[data-act="retreat"]');

  // --- three.js ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060f);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 500);
  const camTarget = new THREE.Vector3(0, 2, 0);
  const camDesired = new THREE.Vector3(0, 28, 40);
  camera.position.copy(camDesired);
  camera.lookAt(camTarget);

  scene.add(new THREE.HemisphereLight(0xe0f0ff, 0x3a2840, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(25, 55, 18); scene.add(sun);
  const rimL = new THREE.DirectionalLight(0x8ec8ff, 1.2); rimL.position.set(-45, 20, -25); scene.add(rimL);
  const fill = new THREE.DirectionalLight(0xffd8a0, 0.7); fill.position.set(10, 15, 40); scene.add(fill);
  scene.add(new THREE.AmbientLight(0x506080, 0.7));
  // team key lights so attacker blue / defender red always read
  const keyAtk = new THREE.PointLight(atkColor, 1.1, 80, 2); keyAtk.position.set(-20, 12, 0); scene.add(keyAtk);
  const keyDef = new THREE.PointLight(defColor, 1.1, 80, 2); keyDef.position.set(20, 12, 0); scene.add(keyDef);

  {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rand() - 0.5) * 400;
      pos[i * 3 + 1] = (rand() - 0.5) * 200;
      pos[i * 3 + 2] = (rand() - 0.5) * 400;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.0, sizeAttenuation: true })));
  }

  const biomeCol = {
    desert: 0xc4a35a, ice: 0xb8d4e8, jungle: 0x3d8c4e, lava: 0xb33a1a, rock: 0x7a6f66, ocean: 0x2a6db5,
  };
  const pCol = biomeCol[planet.biome] || biomeCol.rock;
  const planetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_R, 28, 20),
    new THREE.MeshStandardMaterial({ color: pCol, roughness: 0.95, metalness: 0.02, emissive: pCol, emissiveIntensity: 0.05 }),
  );
  // dim backdrop — final placement in placePlanetBackdrop()
  planetMesh.position.set(10, -14, 6);
  planetMesh.material.opacity = 1;
  if (planetMesh.material) { /* solid */ }
  scene.add(planetMesh);
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_R * 1.1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x88bbff, transparent: true, opacity: 0.08, side: THREE.BackSide }),
  );
  atmo.position.copy(planetMesh.position);
  scene.add(atmo);

  // target line
  const tLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
  const tLine = new THREE.Line(tLineGeo, new THREE.LineBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.85 }));
  tLine.visible = false;
  tLine.frustumCulled = false;
  scene.add(tLine);

  const entities = [];
  const projectiles = [];
  const floats = [];
  const debris = [];
  const outMarkers = [];
  let selected = null;
  let auto = true;
  let speedI = 0;
  let timeScale = SPEEDS[speedI];
  let ended = false;
  let phase = 'intro'; // intro | fight | outro
  let phaseT = 0;
  let pendingResult = null;
  let raf = 0;
  let lastT = 0;
  let destroyedEnemyShell = 0;
  let shakeT = 0;
  let shakeAmp = 0;
  let fightTime = 0;
  const viewSize = { w: 320, h: 480 };
  const layoutPortrait = (mount.clientHeight || 800) > (mount.clientWidth || 400) * 1.05;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPt = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();

  function makeBars(ent) {
    const el = document.createElement('div');
    el.className = 'sc-space-bars faded';
    el.innerHTML = `
      <div class="bar hp"><i style="width:100%"></i></div>
      <div class="bar sh"><i style="width:100%"></i></div>`;
    root.appendChild(el);
    ent.barsEl = el;
    ent.hpFill = el.querySelector('.hp i');
    ent.shFill = el.querySelector('.sh i');
    ent.barOff = { x: 0, y: -18 }; // screen-space nudge for overlap avoidance
    ent.mergeDmg = 0;
    ent.mergeShield = 0;
    ent.mergeT = 0;
  }

  function usableInsets() {
    // Live HUD chrome: top pills+legend, bottom buttons (+ sel panel when open)
    const rootR = root.getBoundingClientRect();
    const topEl = hud.querySelector('.sc-space-top');
    const botEl = hud.querySelector('.sc-space-bottom');
    let top = 64, bottom = 78;
    if (topEl) {
      const r = topEl.getBoundingClientRect();
      top = Math.max(56, Math.ceil(r.bottom - rootR.top + 6));
    }
    if (botEl) {
      const r = botEl.getBoundingClientRect();
      bottom = Math.max(70, Math.ceil(rootR.bottom - r.top + 6));
    }
    // Selected info panel is inside bottom; measuring botEl already includes it when open.
    // Extra safety: if sel is taller than buttons alone, ensure we reserved it.
    if (selected && elSel) {
      const sr = elSel.getBoundingClientRect();
      const fromSel = Math.ceil(rootR.bottom - sr.top + 8);
      bottom = Math.max(bottom, fromSel);
    }
    return { top, bottom };
  }

  function updateBars(ent) {
    if (!ent.barsEl) return;
    if (!ent.alive) { ent.barsEl.style.display = 'none'; return; }
    const fullHp = ent.hp >= ent.hpMax - 0.5;
    const fullSh = ent.shieldMax <= 0 || ent.shield >= ent.shieldMax - 0.5;
    const hide = fullHp && fullSh;
    ent.barsEl.classList.toggle('faded', hide);
    ent.barsEl.style.display = hide ? 'none' : '';
    if (hide) return;
    const hpPct = Math.max(0, Math.min(100, (ent.hp / ent.hpMax) * 100));
    const shPct = ent.shieldMax > 0 ? Math.max(0, Math.min(100, (ent.shield / ent.shieldMax) * 100)) : 0;
    ent.hpFill.style.width = hpPct + '%';
    ent.shFill.style.width = shPct + '%';
    const rect = canvas.getBoundingClientRect();
    tmpV.copy(ent.mesh.position); tmpV.y += ent.kind === 'battleship' ? 2.8 : 1.5;
    tmpV.project(camera);
    const x = (tmpV.x * 0.5 + 0.5) * rect.width + (ent.barOff?.x || 0);
    const y = (-tmpV.y * 0.5 + 0.5) * rect.height + (ent.barOff?.y || 0);
    ent.barsEl.style.left = x + 'px';
    ent.barsEl.style.top = y + 'px';
    ent._barRect = { x: x - 20, y: y - 12, w: 40, h: 12 };
  }

  function avoidLabelOverlap() {
    const alive = entities.filter((e) => e.alive && e.barsEl && e.barsEl.style.display !== 'none');
    for (const e of alive) { if (e.barOff) { e.barOff.x *= 0.85; e.barOff.y = -18 + (e.barOff.y + 18) * 0.7; } }
    // simple pairwise nudge
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (!a._barRect || !b._barRect) continue;
        const ax = a._barRect.x + a._barRect.w / 2, ay = a._barRect.y + a._barRect.h / 2;
        const bx = b._barRect.x + b._barRect.w / 2, by = b._barRect.y + b._barRect.h / 2;
        const dx = bx - ax, dy = by - ay;
        const overlapX = (a._barRect.w + b._barRect.w) / 2 - Math.abs(dx);
        const overlapY = (a._barRect.h + b._barRect.h) / 2 - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const push = Math.max(overlapY + 4, 14);
          if (!b.barOff) b.barOff = { x: 0, y: -18 };
          if (!a.barOff) a.barOff = { x: 0, y: -18 };
          b.barOff.x += (Math.sign(dx) || 1) * Math.min(22, overlapX + 6);
          a.barOff.x -= (Math.sign(dx) || 1) * Math.min(22, overlapX + 6);
          b.barOff.y += push * 0.7;
          a.barOff.y -= push * 0.35;
        }
      }
    }
    // re-apply positions after nudge
    const rect = canvas.getBoundingClientRect();
    for (const ent of alive) {
      tmpV.copy(ent.mesh.position); tmpV.y += ent.kind === 'battleship' ? 2.8 : 1.5;
      tmpV.project(camera);
      const x = (tmpV.x * 0.5 + 0.5) * rect.width + (ent.barOff?.x || 0);
      const y = (-tmpV.y * 0.5 + 0.5) * rect.height + (ent.barOff?.y || 0);
      ent.barsEl.style.left = x + 'px';
      ent.barsEl.style.top = y + 'px';
      ent._barRect = { x: x - 20, y: y - 12, w: 40, h: 12 };
    }
  }

  function placeSide(units, sideKey, color, axisSign) {
    const n = units.length;
    units.forEach((u, i) => {
      const bp = resolveUnit(u);
      if (!bp) return;
      const mesh = bp.kind === 'battleship' ? buildBattleShip(bp.role, color) : buildSpaceShip(bp.role, color);
      const spread = Math.min(layoutPortrait ? 7.5 : 12, Math.max(3.5, n * 2.5));
      const along = n === 1 ? 0 : ((i / (n - 1)) - 0.5) * spread;
      const depth = axisSign * (layoutPortrait ? 12 : 9) + (i % 2 === 0 ? -0.9 : 0.9) + (rand() - 0.5) * 0.8;
      // Portrait: fight along Z (long screen axis). Landscape/PC: fight along X.
      if (layoutPortrait) {
        mesh.position.set(along, 3.4 + rand() * 0.4, depth);
        // face toward enemy (negative Z for attackers at +Z)
        const yaw = axisSign > 0 ? Math.PI : 0;
        mesh.rotation.y = bp.kind === 'battleship' ? yaw - Math.PI / 2 : yaw;
      } else {
        mesh.position.set(depth, 3.4 + rand() * 0.4, along);
        if (bp.kind === 'battleship') mesh.rotation.y = (axisSign > 0 ? Math.PI : 0) - Math.PI / 2;
        else mesh.rotation.y = axisSign > 0 ? Math.PI : 0;
      }
      scene.add(mesh);
      setShieldVisible(mesh, bp.shieldMax > 0);
      const ringR = bp.kind === 'battleship' ? 2.4 : 1.35;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(ringR, ringR + 0.28, 28),
        new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; ring.visible = false;
      mesh.add(ring);
      const ent = {
        ...bp, side: sideKey, color, mesh, alive: bp.hp > 0,
        target: null, moveTo: null, cooldown: rand() * 0.8,
        launchCd: 1 + rand(), launched: 0, wreckT: 0, selectRing: ring, isShell: true,
      };
      makeBars(ent);
      entities.push(ent);
    });
  }

  // Attackers toward bottom/left, defenders toward top/right of the long axis
  placeSide(atkSpace, 'attacker', atkColor, layoutPortrait ? 1 : -1);
  placeSide(defSpace, 'defender', defColor, layoutPortrait ? -1 : 1);

  function living(side) { return entities.filter((e) => e.alive && e.side === side && e.isShell); }
  function livingAll(side) { return entities.filter((e) => e.alive && e.side === side); }
  function updateCounts() {
    elAtkN.textContent = String(livingAll('attacker').length);
    elDefN.textContent = String(livingAll('defender').length);
  }
  updateCounts();

  function showSel(ent) {
    if (!ent) {
      elSel.innerHTML = '<span>🛸</span> <span class="lab">Tap a ship</span>';
      return;
    }
    elSel.innerHTML = `
      <div><span>${ent.icon || '🛸'}</span> <b>${ent.name}</b></div>
      <div class="row">
        <span class="stat">❤️ <span class="lab">HP</span> ${Math.ceil(ent.hp)}</span>
        <span class="stat">🛡️ <span class="lab">Shield</span> ${Math.ceil(ent.shield)}</span>
        <span class="stat">💥 <span class="lab">Atk</span> ${ent.attack}</span>
        <span class="stat">🎯 <span class="lab">Range</span> ${ent.range}</span>
        <span class="stat">⚡ <span class="lab">Speed</span> ${ent.speed}</span>
      </div>`;
  }

  function showIntroBanner() {
    const name = planet.name || 'Planet';
    bannerEl.hidden = false;
    bannerEl.innerHTML = `<div class="sc-ban-card"><div class="sc-ban-big">⚔️ Battle over ${name}</div><div class="sc-ban-sub">Tap to skip</div></div>`;
  }
  function showOutroBanner(playerWon, pts) {
    bannerEl.hidden = false;
    bannerEl.innerHTML = `<div class="sc-ban-card"><div class="sc-ban-big">${playerWon ? '🏆 Victory' : '💀 Defeat'}</div>
      <div class="sc-ban-pts">⭐ ${pts}</div><div class="sc-ban-sub">Tap to skip</div></div>`;
  }
  function hideBanner() { bannerEl.hidden = true; bannerEl.innerHTML = ''; }

  showIntroBanner();
  phase = 'intro';
  phaseT = 0;

  function floatCountFor(ent) {
    return floats.filter((f) => f.ent === ent).length;
  }

  function flushMerge(ent) {
    if (!ent || (!ent.mergeDmg && !ent.mergeShield)) return;
    const side = (rand() < 0.5 ? -1 : 1) * (1.4 + rand());
    const out = new THREE.Vector3(side, 1.6, (rand() - 0.5) * 0.8);
    if (layoutPortrait) out.set((rand() - 0.5) * 0.8, 1.6, side);
    const base = ent.mesh.position.clone().add(new THREE.Vector3(side * 0.6, 1.1, 0));
    if (ent.mergeShield > 0 && floatCountFor(ent) < 3) {
      floatAt(base, `-${Math.round(ent.mergeShield)}`, '#7fe8ff', out, ent);
    }
    if (ent.mergeDmg > 0 && floatCountFor(ent) < 3) {
      const p2 = base.clone().add(new THREE.Vector3(side * 0.35, 0.35, 0));
      floatAt(p2, `-${Math.round(ent.mergeDmg)}`, '#ff6b5a', out, ent);
    }
    ent.mergeDmg = 0; ent.mergeShield = 0; ent.mergeT = 0;
  }

  function floatAt(pos, text, color, outward, ent) {
    if (ent && floatCountFor(ent) >= 3) return;
    const el = document.createElement('div');
    el.className = 'sc-space-float';
    el.textContent = text;
    el.style.color = color || '#ffe14d';
    root.appendChild(el);
    const dir = outward ? outward.clone() : new THREE.Vector3((rand() - 0.5) * 2, 1, (rand() - 0.5) * 2);
    if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
    dir.normalize();
    // Bias sideways + up
    dir.x += (rand() < 0.5 ? -1 : 1) * 0.55;
    dir.y = Math.max(0.7, dir.y);
    dir.normalize();
    floats.push({ el, pos: pos.clone(), t: 0, life: 1.05, dir, speed: 3.6 + rand(), ent: ent || null, sx: (rand() < 0.5 ? -1 : 1) * (18 + rand() * 16) });
  }

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
    // flash
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(big ? 2.2 : 1.1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.9 }),
    );
    flash.position.copy(pos);
    scene.add(flash);
    debris.push({ mesh: flash, vel: new THREE.Vector3(), life: 0.25, t: 0, flash: true });
  }

  function applyDamage(ent, raw) {
    if (!ent.alive) return;
    const cut = 1 - (ent.armor || 0) / 100;
    let dmg = Math.max(1, raw * cut * 0.72);
    if (ent.shield > 0) {
      const absorb = Math.min(ent.shield, dmg);
      ent.shield -= absorb;
      dmg -= absorb;
      flashShield(ent.mesh, 1);
      ent.mergeShield = (ent.mergeShield || 0) + absorb;
    }
    if (dmg > 0) {
      ent.hp -= dmg;
      ent.mergeDmg = (ent.mergeDmg || 0) + dmg;
    }
    ent.mergeT = 0.18; // merge window
    if (ent.shield <= 0) setShieldVisible(ent.mesh, false);
    if (ent.hp <= 0) {
      flushMerge(ent);
      kill(ent);
    }
  }

  function kill(ent) {
    if (!ent.alive) return;
    ent.alive = false;
    ent.hp = 0;
    ent.shield = 0;
    ent.target = null;
    ent.moveTo = null;
    if (ent.selectRing) ent.selectRing.visible = false;
    if (ent.barsEl) ent.barsEl.style.display = 'none';
    if (selected === ent) { selected = null; showSel(null); updateTargetLine(); }
    ent.mesh.traverse((m) => {
      if (m.isMesh && m.material && m.material.color && m.material.type !== 'ShaderMaterial') {
        m.material = m.material.clone();
        m.material.color.set(0x555555);
        if (m.material.emissive) m.material.emissive.set(0x111111);
        m.material.opacity = 0.5;
        m.material.transparent = true;
      }
    });
    setShieldVisible(ent.mesh, false);
    ent.wreckT = 2.2;
    spawnExplosion(ent.mesh.position.clone(), ent.kind === 'battleship');
    if (ent.kind === 'battleship') { shakeT = 0.45; shakeAmp = 0.55; }

    // Remove bars immediately; one ❌ marker that fades ~1.5s
    if (ent.barsEl) { ent.barsEl.remove(); ent.barsEl = null; }
    // Drop any floats tied to this ship
    for (let i = floats.length - 1; i >= 0; i--) {
      if (floats[i].ent === ent) { floats[i].el.remove(); floats.splice(i, 1); }
    }
    const mark = document.createElement('div');
    mark.className = 'sc-space-out';
    mark.textContent = '❌';
    root.appendChild(mark);
    outMarkers.push({ el: mark, pos: ent.mesh.position.clone(), t: 0, life: 1.5 });

    if (ent.isShell) {
      const playerSide = playerIsAttacker ? 'attacker' : 'defender';
      if (ent.side !== playerSide) destroyedEnemyShell += 1;
    }
    updateCounts();
  }

  function fireAt(from, to) {
    const origin = from.mesh.position.clone();
    origin.y += 0.6;
    const dest = to.mesh.position.clone();
    dest.y += 0.4;
    const dir = dest.clone().sub(origin);
    const dist = dir.length();
    if (dist < 0.1) return;
    dir.normalize();
    const speed = from.kind === 'battleship' ? 70 : 90;
    const col = from.side === 'attacker' ? 0x7fe8ff : 0xff6b5a;
    // laser tracer (elongated)
    const tracer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1, 5),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95 }),
    );
    tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    tracer.scale.y = 1.8;
    tracer.position.copy(origin);
    scene.add(tracer);
    const hitR = to.kind === 'battleship' ? 3.2 : 1.8;
    projectiles.push({
      mesh: tracer, vel: dir.clone().multiplyScalar(speed), life: dist / speed + 0.35,
      dmg: from.attack, side: from.side, target: to, hitR, speed, dir: dir.clone(),
    });
  }

  function nearestEnemy(ent) {
    let best = null, bd = 1e9;
    for (const o of entities) {
      if (!o.alive || o.side === ent.side) continue;
      const d = ent.mesh.position.distanceTo(o.mesh.position);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  function tryLaunch(ent, dt) {
    if (!ent.alive || ent.kind !== 'battleship' || !ent.hangarSlots) return;
    if (ent.launched >= ent.hangarSlots) return;
    if (livingAll(ent.side).length >= 7) return;
    ent.launchCd -= dt;
    if (ent.launchCd > 0) return;
    ent.launchCd = 1 / Math.max(0.05, ent.launchRate || 0.2);
    const craft = makeHangarCraft(ent, ent.launched, rand);
    const mesh = buildSpaceShip(craft.role, ent.color);
    const hangar = ent.mesh.userData.hangar;
    if (hangar) { hangar.getWorldPosition(tmpV); mesh.position.copy(tmpV); }
    else mesh.position.copy(ent.mesh.position).add(new THREE.Vector3(0, -1, 2));
    mesh.rotation.y = ent.mesh.rotation.y;
    scene.add(mesh);
    setShieldVisible(mesh, craft.shieldMax > 0);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.35, 22),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; ring.visible = false; mesh.add(ring);
    const e = {
      ...craft, side: ent.side, color: ent.color, mesh, alive: true,
      target: null, moveTo: null, cooldown: 0.3, launchCd: 0, launched: 0,
      wreckT: 0, selectRing: ring, isShell: false,
    };
    makeBars(e);
    entities.push(e);
    ent.launched += 1;
    updateCounts();
  }

  function aiTick(ent, dt) {
    if (!ent.alive) return;
    if (ent.shield < ent.shieldMax) {
      ent.shield = Math.min(ent.shieldMax, ent.shield + ent.shieldRegen * 0.35 * dt);
      if (ent.shield > 0) setShieldVisible(ent.mesh, true);
    }
    tickShield(ent.mesh, dt);
    for (const f of (ent.mesh.userData.flames || [])) {
      if (f.scale) f.scale.z = (f.userData.base || 0.5) * (0.7 + rand() * 0.6);
    }
    tryLaunch(ent, dt);

    const isPlayerSide = ent.side === (playerIsAttacker ? 'attacker' : 'defender');
    if (auto || !isPlayerSide || (isPlayerSide && !selected)) {
      if (!ent.target || !ent.target.alive) ent.target = nearestEnemy(ent);
    }

    const tgt = ent.target && ent.target.alive ? ent.target : null;
    const pos = ent.mesh.position;

    // Soft arena leash — keeps phone framing possible
    pos.x = Math.max(-ARENA, Math.min(ARENA, pos.x));
    pos.z = Math.max(-ARENA, Math.min(ARENA, pos.z));
    pos.y = Math.max(1.5, Math.min(8, pos.y));

    if (ent.moveTo) {
      tmpV.copy(ent.moveTo).sub(pos); tmpV.y = 0;
      const d = tmpV.length();
      if (d < 0.6) ent.moveTo = null;
      else {
        tmpV.normalize();
        pos.x += tmpV.x * ent.speed * dt;
        pos.z += tmpV.z * ent.speed * dt;
        const yaw = Math.atan2(tmpV.x, tmpV.z);
        ent.mesh.rotation.y = ent.kind === 'battleship' ? yaw - Math.PI / 2 : yaw;
      }
    } else if (tgt) {
      tmpV.copy(tgt.mesh.position).sub(pos); tmpV.y = 0;
      const d = tmpV.length();
      const want = Math.max(6, ent.range * 0.55);
      if (d > ent.range * 0.75) {
        tmpV.normalize();
        pos.x += tmpV.x * ent.speed * dt;
        pos.z += tmpV.z * ent.speed * dt;
      } else if (d < want * 0.5 && ent.kind === 'spaceship') {
        tmpV.normalize();
        pos.x -= tmpV.x * ent.speed * 0.6 * dt;
        pos.z -= tmpV.z * ent.speed * 0.6 * dt;
      }
      if (d > 0.1) {
        const yaw = Math.atan2(tmpV.x, tmpV.z);
        ent.mesh.rotation.y = ent.kind === 'battleship' ? yaw - Math.PI / 2 : yaw;
        for (const t of (ent.mesh.userData.turrets || [])) {
          if (t.head) t.head.lookAt(tgt.mesh.position);
        }
      }
      ent.cooldown -= dt;
      if (ent.cooldown <= 0 && d <= ent.range) {
        ent.cooldown = ent.kind === 'battleship' ? 1.05 : 0.8;
        fireAt(ent, tgt);
      }
    }
    // Separation so ships don't stack
    for (const o of entities) {
      if (o === ent || !o.alive) continue;
      tmpV.copy(pos).sub(o.mesh.position); tmpV.y = 0;
      const d = tmpV.length();
      const minD = (ent.kind === 'battleship' ? 4.0 : 2.5) + (o.kind === 'battleship' ? 4.0 : 2.5);
      if (d > 0.01 && d < minD) {
        tmpV.normalize();
        if (layoutPortrait) {
          // Prefer vertical separation so width stays on screen
          tmpV.x *= 0.35;
          tmpV.z += Math.sign(tmpV.z || (ent.side === 'attacker' ? 1 : -1)) * 0.25;
          tmpV.normalize();
        }
        tmpV.multiplyScalar((minD - d) * 0.8);
        pos.x += tmpV.x; pos.z += tmpV.z;
      }
    }
    // Soft home toward own half so fleets stay vertically/horizontally separated
    if (layoutPortrait) {
      const homeZ = ent.side === 'attacker' ? (selected ? 4.2 : 7) : -7;
      pos.z += (homeZ - pos.z) * Math.min(0.4, dt * 0.32);
      pos.x += (0 - pos.x) * Math.min(0.35, dt * 0.28);
      pos.x = Math.max(-6.5, Math.min(6.5, pos.x));
    } else {
      const homeX = ent.side === 'attacker' ? -7 : 7;
      pos.x += (homeX - pos.x) * Math.min(0.45, dt * 0.35);
      pos.x = Math.max(-ARENA, Math.min(ARENA, pos.x));
    }
    pos.z = Math.max(-ARENA, Math.min(ARENA, pos.z));
    pos.y = 3.2 + Math.sin(performance.now() * 0.001 + pos.x) * 0.25;
  }

  function buildResult(winner, retreated) {
    const pack = (side, pass) => {
      const out = [];
      for (const e of entities) {
        if (!e.isShell || e.side !== side || !e.alive) continue;
        const src = cloneUnit(e._src);
        src.hpNow = Math.max(1, Math.ceil(e.hp));
        out.push(src);
      }
      return out.concat(pass);
    };
    const survivors = { attacker: pack('attacker', atkPass), defender: pack('defender', defPass) };
    let pointsEarned = 0;
    const playerWon = (winner === 'attacker' && playerIsAttacker) || (winner === 'defender' && !playerIsAttacker);
    if (playerWon && !retreated) pointsEarned = 10 + 5 * destroyedEnemyShell;
    return { winner, survivors, pointsEarned, playerWon, retreated: !!retreated };
  }

  function endBattle(winner, retreated) {
    if (ended) return;
    ended = true;
    phase = 'outro';
    phaseT = 0;
    elHint.classList.add('hide');
    tLine.visible = false;
    pendingResult = buildResult(winner, retreated);
    // End banner from player's (attacker) view; retreat = Defeat + 0 pts
    if (retreated) showOutroBanner(false, 0);
    else showOutroBanner(pendingResult.playerWon, pendingResult.pointsEarned);
  }

  function checkEnd() {
    if (ended || phase !== 'fight') return;
    const a = livingAll('attacker').length;
    const d = livingAll('defender').length;
    if (a === 0) endBattle('defender', false);
    else if (d === 0) endBattle('attacker', false);
  }

  function updateTargetLine() {
    if (!selected || !selected.alive || !selected.target || !selected.target.alive) {
      tLine.visible = false;
      return;
    }
    const a = selected.mesh.position;
    const b = selected.target.mesh.position;
    const arr = tLine.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y + 0.5; arr[2] = a.z;
    arr[3] = b.x; arr[4] = b.y + 0.5; arr[5] = b.z;
    tLine.geometry.attributes.position.needsUpdate = true;
    tLine.visible = true;
  }

  function setSelected(ent) {
    if (selected && selected.selectRing) selected.selectRing.visible = false;
    selected = ent && ent.alive ? ent : null;
    if (selected && selected.selectRing) selected.selectRing.visible = true;
    showSel(selected);
    if (selected) elHint.classList.add('hide');
    updateTargetLine();
    // Flush layout so usableInsets sees the open info panel, then snap-fit
    void elSel.offsetHeight;
    fitCamera(1);
  }

  function placePlanetBackdrop() {
    // Low, off-centre crescent — never under fleet cluster; always a visible backdrop
    const alive = entities.filter((e) => e.alive);
    let cx = 0, cz = 0;
    if (alive.length) {
      for (const e of alive) { cx += e.mesh.position.x; cz += e.mesh.position.z; }
      cx /= alive.length; cz /= alive.length;
    }
    if (layoutPortrait) {
      // Dim crescent along the bottom-right edge (visible but ≤35% width)
      planetMesh.position.set(cx + 14, -22, cz + 24);
      planetMesh.scale.setScalar(0.88);
    } else {
      // Landscape/PC: lower-left crescent — mostly below HUD, not under fleets
      // Keep a visible limb in the bottom-left without covering ships
      planetMesh.position.set(cx - 14, -8, cz + 22);
      planetMesh.scale.setScalar(1.55);
    }
    atmo.position.copy(planetMesh.position);
    atmo.scale.copy(planetMesh.scale);
  }

  function shipShieldHalfExtents(ent) {
    // World-ish half-extents of hull+shield (shield mesh local unit-sphere * scale * root scale)
    const mesh = ent.mesh;
    const sh = mesh && mesh.userData && mesh.userData.shield;
    if (sh) {
      // Approximate AABB half-size in world axes (rotation ignored → slight over-estimate, safe for fit)
      const s = mesh.scale.x || 1;
      const sx = Math.abs(sh.scale.x) * s;
      const sy = Math.abs(sh.scale.y) * s;
      const sz = Math.abs(sh.scale.z) * s;
      // After battleship yaw, local X/Z swap in world — take max for safety
      const horiz = Math.max(sx, sz);
      return { rx: horiz, ry: sy, rz: horiz, worldW: Math.max(sx, sz) * 2 };
    }
    const r = ent.kind === 'battleship' ? 3.4 : ent.kind === 'spaceship' ? 1.8 : 1.2;
    return { rx: r, ry: r * 0.7, rz: r, worldW: r * 2 };
  }

  function fitCamera(dt) {
    const alive = entities.filter((e) => e.alive);
    if (!alive.length) return;
    _box.makeEmpty();
    for (const e of alive) {
      const ext = shipShieldHalfExtents(e);
      const padX = layoutPortrait ? 1.6 : 1.2;
      const p = e.mesh.position;
      _box.expandByPoint(new THREE.Vector3(p.x - ext.rx - padX, p.y - ext.ry * 0.4, p.z - ext.rz));
      _box.expandByPoint(new THREE.Vector3(p.x + ext.rx + padX, p.y + ext.ry, p.z + ext.rz));
    }
    _box.getCenter(_center);
    _box.getSize(_size);
    const aspect = Math.max(0.3, camera.aspect || 1);
    const insets = usableInsets();
    const usableH = Math.max(100, viewSize.h - insets.top - insets.bottom);
    const usableW = Math.max(80, viewSize.w - 16);
    const wantFov = layoutPortrait ? 46 : (aspect < 1.2 ? 50 : 44);
    if (Math.abs(camera.fov - wantFov) > 0.4) {
      camera.fov = wantFov;
      camera.updateProjectionMatrix();
    }
    const fov = camera.fov * Math.PI / 180;
    // Portrait: fill ~82% usable. Landscape/PC: fit with ~8% margin → cover 0.84 of usable.
    const cover = layoutPortrait ? 0.82 : 0.84;
    const halfH = Math.max(_size.z, _size.y) * 0.5;
    const halfW = Math.max(_size.x, 1) * 0.5;
    let dist = Math.max(
      halfH / (Math.tan(fov / 2) * cover * (usableH / viewSize.h)),
      halfW / (Math.tan(fov / 2) * aspect * cover * (usableW / viewSize.w)),
      14,
    );

    const panelOpen = !!(selected && elSel && /HP|Shield|Atk/i.test(elSel.textContent || ''));
    if (layoutPortrait) {
      // Min zoom: Scout (~2.8wu) ≥ ~28px on a 390-wide phone — relax when info panel is open
      // so the camera can leave room above the bottom chrome.
      if (!panelOpen) {
        const scoutLen = 2.8;
        const minPx = 28 * (viewSize.w / 390);
        const maxDist = (scoutLen * viewSize.h) / (2 * Math.tan(fov / 2) * minPx);
        dist = Math.min(dist, Math.max(16, maxDist * 1.05));
      }
      dist = Math.max(12, Math.min(dist, panelOpen ? 58 : 48));
      // Bias framing toward the lower fleet so ships sit above the open info panel
      if (panelOpen) {
        _center.z += 3.4; // bias framing so lower fleet clears the info panel
      }
    } else {
      // Max zoom: BattleShip (shield span) never wider than ~30% of screen
      let bsW = 0;
      for (const e of alive) {
        if (e.kind === 'battleship') bsW = Math.max(bsW, shipShieldHalfExtents(e).worldW);
      }
      if (bsW > 0) {
        // Slightly stricter (28%) so projected size stays under 30% after depth variance
        const minDistBs = bsW / (2 * 0.28 * Math.tan(fov / 2) * aspect);
        dist = Math.max(dist, minDistBs * 1.15);
      }
      dist = Math.max(22, Math.min(dist, 95));
    }

    if (layoutPortrait) {
      camDesired.set(_center.x, Math.max(20, dist * 0.92), _center.z + dist * 0.42);
    } else {
      camDesired.set(_center.x, Math.max(18, dist * 0.58), _center.z + dist * 0.88);
    }
    camTarget.set(_center.x, Math.max(1.5, _center.y), _center.z);
    const k = 1 - Math.exp(-(dt || 0.016) * 7);
    camera.position.lerp(camDesired, Math.min(1, Math.max(k, 0.28)));
    if (camera.position.distanceTo(camDesired) > dist * 0.35) camera.position.copy(camDesired);
    tmpV.copy(camTarget);
    if (shakeT > 0) {
      tmpV.x += (rand() - 0.5) * shakeAmp * 2;
      tmpV.y += (rand() - 0.5) * shakeAmp;
    }
    camera.lookAt(tmpV);
    camera.updateMatrixWorld(true);

    if (layoutPortrait) {
      // Pull in if fleet projected height is too small (fill target) — skip when sel panel is open
      // so we don't yank ships under the info card.
      if (!panelOpen) {
        let minY = 1e9, maxY = -1e9;
        for (const e of alive) {
          const b = projectShipBounds(e);
          minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY);
        }
        const fleetH = maxY - minY;
        const targetH = cover * usableH;
        if (fleetH > 4 && fleetH < targetH * 0.9) {
          const pull = Math.min(0.35, (targetH / fleetH - 1) * 0.45);
          camera.position.lerp(camTarget, pull);
          camera.lookAt(tmpV);
          camera.updateMatrixWorld(true);
        }
      }
    }
    // All layouts: push out until every ship+shield sits inside usable rect
    for (let guard = 0; guard < 14; guard++) {
      const check = shipsInsideUsable(6);
      if (check.ok) break;
      const off = camera.position.clone().sub(camTarget);
      if (off.lengthSq() < 1e-4) break;
      off.multiplyScalar(1.14);
      const maxLen = layoutPortrait ? (panelOpen ? 72 : 54) : 100;
      if (off.length() > maxLen) off.setLength(maxLen);
      camera.position.copy(camTarget).add(off);
      camera.lookAt(tmpV);
      camera.updateMatrixWorld(true);
    }
    // Landscape/PC: keep any BattleShip projected width ≤ 30% of screen
    if (!layoutPortrait) {
      for (let guard = 0; guard < 8; guard++) {
        let worst = 0;
        for (const e of alive) {
          if (e.kind !== 'battleship') continue;
          const b = projectShipBounds(e);
          worst = Math.max(worst, (b.maxX - b.minX) / Math.max(1, b.w));
        }
        if (worst <= 0.30) break;
        const off = camera.position.clone().sub(camTarget);
        if (off.lengthSq() < 1e-4) break;
        off.multiplyScalar(1.12);
        if (off.length() > 100) off.setLength(100);
        camera.position.copy(camTarget).add(off);
        camera.lookAt(tmpV);
        camera.updateMatrixWorld(true);
      }
    }
    placePlanetBackdrop();
  }

  function projectShipBounds(ent) {
    // Full hull + shield ellipse projected to screen (select ring ignored)
    const mesh = ent.mesh;
    const sh = mesh && mesh.userData && mesh.userData.shield;
    const rect = canvas.getBoundingClientRect();
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    const corners = [];
    if (sh) {
      sh.updateWorldMatrix(true, false);
      for (const lx of [-1, 1]) for (const ly of [-1, 1]) for (const lz of [-1, 1]) {
        corners.push(new THREE.Vector3(lx, ly, lz).applyMatrix4(sh.matrixWorld));
      }
    } else {
      const ext = shipShieldHalfExtents(ent);
      const p = mesh.position;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        corners.push(new THREE.Vector3(p.x + sx * ext.rx, p.y + sy * ext.ry * 0.6, p.z + sz * ext.rz));
      }
    }
    for (const c of corners) {
      c.project(camera);
      const x = (c.x * 0.5 + 0.5) * rect.width;
      const y = (-c.y * 0.5 + 0.5) * rect.height;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY, w: rect.width, h: rect.height };
  }

  function shipsInsideUsable(padPx = 0) {
    const insets = usableInsets();
    const rect = canvas.getBoundingClientRect();
    const left = padPx;
    const right = rect.width - padPx;
    const top = insets.top + padPx;
    const bottom = rect.height - insets.bottom - padPx;
    const outs = [];
    for (const e of entities) {
      if (!e.alive) continue;
      const b = projectShipBounds(e);
      if (b.minX < left || b.maxX > right || b.minY < top || b.maxY > bottom) {
        outs.push({
          id: e.id, kind: e.kind,
          minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY,
        });
      }
    }
    return {
      ok: outs.length === 0, outs, insets,
      usable: { left, top, right, bottom, w: rect.width, h: rect.height },
    };
  }

  function infoPanelOverlap() {
    if (!selected || !elSel) return { overlaps: false, n: 0, open: false };
    const rootR = root.getBoundingClientRect();
    const sr = elSel.getBoundingClientRect();
    // Only count as open when showing stats (not the "Tap a ship" placeholder)
    const open = !!selected && /HP|Shield|Atk/i.test(elSel.textContent || '');
    if (!open) return { overlaps: false, n: 0, open: false };
    const panel = {
      x: sr.left - rootR.left, y: sr.top - rootR.top,
      w: Math.max(1, sr.width), h: Math.max(1, sr.height),
    };
    let n = 0;
    const hits = [];
    for (const e of entities) {
      if (!e.alive) continue;
      const b = projectShipBounds(e);
      const ix = Math.max(0, Math.min(panel.x + panel.w, b.maxX) - Math.max(panel.x, b.minX));
      const iy = Math.max(0, Math.min(panel.y + panel.h, b.maxY) - Math.max(panel.y, b.minY));
      if (ix > 0 && iy > 0) { n++; hits.push(e.id); }
    }
    return { overlaps: n > 0, n, open: true, panel, hits };
  }

  function planetScreenWidthFrac() {
    const rect = canvas.getBoundingClientRect();
    const r = PLANET_R * planetMesh.scale.x;
    // Sample left/right limbs and clamp to viewport so off-screen mass does not inflate
    const left = planetMesh.position.clone().add(new THREE.Vector3(-r, 0, 0));
    const right = planetMesh.position.clone().add(new THREE.Vector3(r, 0, 0));
    left.project(camera); right.project(camera);
    let lx = (left.x * 0.5 + 0.5) * rect.width;
    let rx = (right.x * 0.5 + 0.5) * rect.width;
    if (lx > rx) { const t = lx; lx = rx; rx = t; }
    const visL = Math.max(0, Math.min(rect.width, lx));
    const visR = Math.max(0, Math.min(rect.width, rx));
    return Math.max(0, visR - visL) / Math.max(1, rect.width);
  }


  function fleetScreenBounds() {
    const alive = entities.filter((e) => e.alive);
    const rect = canvas.getBoundingClientRect();
    if (!alive.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: rect.width, h: rect.height, heightFrac: 0 };
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const e of alive) {
      const b = projectShipBounds(e);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    const insets = usableInsets();
    const usableH = Math.max(1, rect.height - insets.top - insets.bottom);
    const heightFrac = Math.max(0, Math.min(maxY, rect.height - insets.bottom) - Math.max(minY, insets.top)) / usableH;
    return { minX, minY, maxX, maxY, w: rect.width, h: rect.height, heightFrac, usableH };
  }

  function projectShipPxLength(ent) {
    const len = ent.kind === 'battleship' ? 5.2 : ent.kind === 'spaceship' ? 2.8 : 1.6;
    const p = ent.mesh.position;
    const a = new THREE.Vector3(p.x - len / 2, p.y, p.z);
    const b = new THREE.Vector3(p.x + len / 2, p.y, p.z);
    a.project(camera); b.project(camera);
    const rect = canvas.getBoundingClientRect();
    const ax = (a.x * 0.5 + 0.5) * rect.width;
    const bx = (b.x * 0.5 + 0.5) * rect.width;
    const ay = (-a.y * 0.5 + 0.5) * rect.height;
    const by = (-b.y * 0.5 + 0.5) * rect.height;
    return Math.hypot(bx - ax, by - ay);
  }

  function labelOverlapStats() {
    const rects = [];
    for (const e of entities) {
      if (!e.alive || !e.barsEl || e.barsEl.style.display === 'none' || !e._barRect) continue;
      rects.push({ ...e._barRect, id: e.id });
    }
    // Floats are transient; still include out markers briefly
    for (const o of outMarkers) {
      const r = o.el.getBoundingClientRect();
      const rootR = root.getBoundingClientRect();
      rects.push({ x: r.left - rootR.left, y: r.top - rootR.top, w: Math.max(10, r.width), h: Math.max(10, r.height), id: 'out' });
    }
    let worst = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const inter = ix * iy;
        const smaller = Math.min(a.w * a.h, b.w * b.h) || 1;
        worst = Math.max(worst, inter / smaller);
      }
    }
    return { worst, n: rects.length };
  }

  function planetInsideFleetBox() {
    const fleet = fleetScreenBounds();
    const rect = canvas.getBoundingClientRect();
    tmpV.copy(planetMesh.position).project(camera);
    const px = (tmpV.x * 0.5 + 0.5) * rect.width;
    const py = (-tmpV.y * 0.5 + 0.5) * rect.height;
    const inside = px >= fleet.minX && px <= fleet.maxX && py >= fleet.minY && py <= fleet.maxY;
    return { inside, px, py, fleet };
  }

  function pickEntity(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const meshes = entities.filter((e) => e.alive).map((e) => e.mesh);
    const hits = raycaster.intersectObjects(meshes, true);
    let ent = null;
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !entities.find((e) => e.mesh === obj)) obj = obj.parent;
      ent = entities.find((e) => e.mesh === obj) || null;
    }
    let point = null;
    if (raycaster.ray.intersectPlane(groundPlane, hitPt)) point = hitPt.clone();
    return { ent, point };
  }

  function skipBanner() {
    if (phase === 'intro') {
      hideBanner();
      phase = 'fight';
      phaseT = 0;
    } else if (phase === 'outro' && pendingResult) {
      const { winner, survivors, pointsEarned, retreated } = pendingResult;
      pendingResult = null;
      finish({ winner, survivors, pointsEarned, retreated: !!retreated });
    }
  }

  function onPointer(e) {
    if (done) return;
    e.preventDefault();
    if (phase === 'intro' || phase === 'outro') { skipBanner(); return; }
    if (ended) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const { ent, point } = pickEntity(t.clientX, t.clientY);
    const playerSide = playerIsAttacker ? 'attacker' : 'defender';
    if (ent && ent.side === playerSide) { setSelected(ent); return; }
    if (selected && selected.alive && selected.side === playerSide) {
      if (ent && ent.side !== playerSide) {
        selected.target = ent; selected.moveTo = null;
        floatAt(ent.mesh.position, '🎯', '#ffe14d');
        updateTargetLine();
        return;
      }
      if (point) {
        point.x = Math.max(-ARENA, Math.min(ARENA, point.x));
        point.z = Math.max(-ARENA, Math.min(ARENA, point.z));
        selected.moveTo = point; selected.target = null;
        floatAt(point, '➤', '#7fe8ff');
        updateTargetLine();
      }
    }
  }

  function onAuto() { auto = !auto; btnAuto.classList.toggle('on', auto); }
  function onSpeed() {
    speedI = (speedI + 1) % SPEEDS.length;
    timeScale = SPEEDS[speedI];
    btnSpeed.querySelector('.lab').textContent = 'x' + timeScale;
    btnSpeed.classList.toggle('on', speedI > 0);
  }
  function onRetreat() {
    if (ended || phase === 'outro') return;
    if (phase === 'intro') { hideBanner(); phase = 'fight'; }
    endBattle('defender', true);
  }

  canvas.addEventListener('pointerdown', onPointer, { passive: false });
  bannerEl.addEventListener('click', skipBanner);
  btnAuto.addEventListener('click', onAuto);
  btnSpeed.addEventListener('click', onSpeed);
  btnRetreat.addEventListener('click', onRetreat);

  root._sc = {
    get entities() { return entities; },
    get selected() { return selected; },
    get auto() { return auto; },
    get timeScale() { return timeScale; },
    get ended() { return ended; },
    get done() { return done; },
    get phase() { return phase; },
    get fightTime() { return fightTime; },
    get layoutPortrait() { return layoutPortrait; },
    get targetLineVisible() { return tLine.visible; },
    setSelected, onSpeed, onRetreat, onAuto, endBattle, skipBanner,
    projectShipBounds, planetScreenWidthFrac, fleetScreenBounds, projectShipPxLength,
    labelOverlapStats, planetInsideFleetBox, usableInsets, shipsInsideUsable, infoPanelOverlap,
    flashShieldDemo() {
      const bs = entities.find((e) => e.alive && e.kind === 'battleship');
      if (bs) { flashShield(bs.mesh, 1); applyDamage(bs, 8); }
    },
  };

  function resize() {
    const w = Math.max(1, root.clientWidth || mount.clientWidth || 320);
    const h = Math.max(1, root.clientHeight || mount.clientHeight || 480);
    viewSize.w = w; viewSize.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera(1);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  function tickProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      if (p.target && p.target.alive) {
        const before = p.mesh.position.distanceTo(p.target.mesh.position);
        tmpV.copy(p.target.mesh.position).sub(p.mesh.position);
        if (before > 0.001) {
          tmpV2.copy(tmpV).normalize();
          p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmpV2);
          const step = Math.min(p.speed * dt, before);
          p.mesh.position.addScaledVector(tmpV2, step);
        }
        const after = p.mesh.position.distanceTo(p.target.mesh.position);
        if (after <= p.hitR || before <= p.hitR) {
          applyDamage(p.target, p.dmg);
          scene.remove(p.mesh); disposeObject(p.mesh); projectiles.splice(i, 1);
          continue;
        }
      } else {
        p.mesh.position.addScaledVector(p.vel, dt);
      }
      if (p.life <= 0) {
        scene.remove(p.mesh); disposeObject(p.mesh); projectiles.splice(i, 1);
      }
    }
  }

  function tickFloats(dt) {
    const rect = canvas.getBoundingClientRect();
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      f.pos.addScaledVector(f.dir, f.speed * dt);
      f.pos.y += dt * 1.8;
      tmpV.copy(f.pos).project(camera);
      let x = (tmpV.x * 0.5 + 0.5) * rect.width + (f.sx || 0);
      let y = (-tmpV.y * 0.5 + 0.5) * rect.height;
      // Keep floats inside screen with slight side bias
      x = Math.max(18, Math.min(rect.width - 18, x));
      y = Math.max(70, Math.min(rect.height - 90, y));
      f.el.style.left = x + 'px';
      f.el.style.top = y + 'px';
      f.el.style.opacity = String(Math.max(0, 1 - f.t / f.life));
      if (f.t >= f.life) { f.el.remove(); floats.splice(i, 1); }
    }
  }

  function tickOut(dt) {
    const rect = canvas.getBoundingClientRect();
    for (let i = outMarkers.length - 1; i >= 0; i--) {
      const o = outMarkers[i];
      o.t += dt;
      o.pos.y += dt * 0.8;
      tmpV.copy(o.pos).project(camera);
      o.el.style.left = ((tmpV.x * 0.5 + 0.5) * rect.width) + 'px';
      o.el.style.top = ((-tmpV.y * 0.5 + 0.5) * rect.height) + 'px';
      o.el.style.opacity = String(Math.max(0, 1 - o.t / o.life));
      if (o.t >= o.life) { o.el.remove(); outMarkers.splice(i, 1); }
    }
  }

  function tickDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.t += dt;
      if (d.flash) {
        d.mesh.material.opacity = Math.max(0, 1 - d.t / d.life);
        d.mesh.scale.setScalar(1 + d.t * 4);
      } else {
        d.vel.y -= 8 * dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        d.mesh.rotation.x += dt * 4; d.mesh.rotation.y += dt * 3;
      }
      if (d.t >= d.life) {
        scene.remove(d.mesh); disposeObject(d.mesh); debris.splice(i, 1);
      }
    }
  }

  function tickWrecks(dt) {
    for (const e of entities) {
      if (e.alive || e.wreckT <= 0) continue;
      e.wreckT -= dt;
      e.mesh.position.y -= dt * 1.2;
      e.mesh.rotation.z += dt * 0.7;
      if (e.wreckT <= 0) scene.remove(e.mesh);
    }
  }

  function frame(t) {
    if (done) return;
    raf = requestAnimationFrame(frame);
    if (!lastT) lastT = t;
    let dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    const rawDt = dt;
    dt *= timeScale;

    if (phase === 'intro') {
      phaseT += rawDt; // intro uses real time so it isn't skipped instantly at x4
      if (phaseT >= INTRO_S) { hideBanner(); phase = 'fight'; phaseT = 0; }
    } else if (phase === 'outro') {
      phaseT += rawDt;
      if (phaseT >= OUTRO_S && pendingResult) {
        const { winner, survivors, pointsEarned, retreated } = pendingResult;
        pendingResult = null;
        finish({ winner, survivors, pointsEarned, retreated: !!retreated });
        return;
      }
    } else if (!ended) {
      fightTime += rawDt;
      for (const e of entities) if (e.alive) {
        if (e.mergeT > 0) {
          e.mergeT -= dt;
          if (e.mergeT <= 0) flushMerge(e);
        }
        aiTick(e, dt);
      }
      tickProjectiles(dt);
      checkEnd();
    }

    if (shakeT > 0) { shakeT -= rawDt; shakeAmp *= 0.92; }
    fitCamera(rawDt);
    updateTargetLine();
    for (const e of entities) updateBars(e);
    avoidLabelOverlap();
    tickWrecks(dt);
    tickFloats(rawDt);
    tickOut(rawDt);
    tickDebris(rawDt);
    planetMesh.rotation.y += rawDt * 0.04;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  cleanup = function cleanup() {
    cancelAnimationFrame(raf);
    raf = 0;
    try { ro.disconnect(); } catch (_) {}
    canvas.removeEventListener('pointerdown', onPointer);
    bannerEl.removeEventListener('click', skipBanner);
    btnAuto.removeEventListener('click', onAuto);
    btnSpeed.removeEventListener('click', onSpeed);
    btnRetreat.removeEventListener('click', onRetreat);
    for (const f of floats) f.el.remove();
    for (const o of outMarkers) o.el.remove();
    for (const e of entities) if (e.barsEl) e.barsEl.remove();
    floats.length = 0; outMarkers.length = 0;
    for (const p of projectiles) { scene.remove(p.mesh); disposeObject(p.mesh); }
    for (const d of debris) { scene.remove(d.mesh); disposeObject(d.mesh); }
    projectiles.length = 0; debris.length = 0;
    for (const e of entities) { scene.remove(e.mesh); disposeObject(e.mesh); }
    entities.length = 0;
    scene.traverse((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const x of mats) if (x && x.dispose) x.dispose();
      }
    });
    try { renderer.dispose(); } catch (_) {}
    if (root.parentNode) root.parentNode.removeChild(root);
  };

  return {
    abort() {
      if (!ended && !done) endBattle('defender', true);
    },
  };
}

export default startBattle;
