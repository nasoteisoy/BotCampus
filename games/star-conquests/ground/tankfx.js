/**
 * Star Conquests — Tank Feel (self-contained module).
 * Spec: qa/VEHICLE-FEEL-SPEC.md §2 (+ §0.1–0.3).
 * Visual-only: does not move the sim body. Wire from battle/view3d.
 *
 * API:
 *   import { createTankFeel } from './tankfx.js';
 *   const feel = createTankFeel(tankRoot, { fx, scene, isTracked: true });
 *   feel.update(dt, { speed, accel, yawRate, aimYaw });
 *   const landMs = feel.fire(targetVec3);
 *   feel.hit(dirVec3, amount);
 *   feel.destroy();
 *   cameraShake = feel.trauma;
 *   feel.dispose();
 */
import * as THREE from '../vendor/three.module.min.js';
import { TANK_POSE } from './hq/demo-rig.js';
import { arenaTankPose } from './hq/demo-actions.js';

// ----- HQ helpers (verbatim formulas; not exported from demo-actions) -----
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sm = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const eOut = (x) => { x = clamp01(x); return 1 - (1 - x) ** 3; };
const eIn = (x) => { x = clamp01(x); return x * x * x; };
const back = (x) => { x = clamp01(x); const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const TAU = Math.PI * 2;
const pulse = (t, at, rise = 0.03, decay = 0.14) => (t < at ? 0 : t < at + rise ? (t - at) / rise : Math.exp(-(t - at - rise) / decay));
const wobble = (t, at, f = 9, d = 0.35) => (t < at ? 0 : Math.sin((t - at) * f * TAU / 2) * Math.exp(-(t - at) / d));
const seg = (t, a, b) => clamp01((t - a) / Math.max(1e-6, b - a));

const WRECK_HEX = 0x2a2c30;
const TRAUMA_DECAY = 1.2; // /s
const DUST_INTERVAL = 0.3;
const WINDUP = 0.4; // barrel dip before muzzle
const SHELL_DUR = 0.22;
const CASING_DELAY = 0.04;
const DESTROY_DUR = 4.5;

const FEEL = Object.freeze({
  TRAUMA_FIRE: 0.68,
  TRAUMA_HIT: 0.35,
  TRAUMA_WRECK: 0.85,
  RECOIL_K: 1,
});

function KP(o = {}) { return { ...TANK_POSE, ...o }; }

/**
 * @param {THREE.Object3D} tankRoot  root from makeTank / hq Rig.root
 * @param {{ fx: import('./hq/demo-fx.js').FX, scene?: THREE.Scene, isTracked?: boolean, id?: string }} opts
 */
export function createTankFeel(tankRoot, opts = {}) {
  const fx = opts.fx;
  const scene = opts.scene || fx?.scene;
  const isTracked = opts.isTracked !== false;
  const id = opts.id != null ? String(opts.id) : `t${Math.random().toString(36).slice(2, 7)}`;
  let reduceMotion = !!opts.reduceMotion;
  try {
    if (!reduceMotion && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reduceMotion = true;
    }
  } catch (_) {}
  const rig = tankRoot?.userData?.hqRig || null;
  if (!tankRoot) throw new Error('createTankFeel: tankRoot required');
  if (!fx) throw new Error('createTankFeel: fx required');

  // Visual child for squash (scale only). Bones stay on rig; we overlay pose via applyPose.
  const feelRoot = new THREE.Group();
  feelRoot.name = 'tankFeelRoot';
  tankRoot.add(feelRoot);

  let t = 0;
  let trauma = 0;
  let disposed = false;
  let wrecked = false;
  let destroyT = null; // seconds into destroy sequence, or null
  let dustAcc = 0;
  let padGlowAcc = 0;
  let fireT = null; // seconds since fire() started (wind-up clock)
  let fireTarget = null;
  let fired = false; // muzzle already popped this fire
  let shotAge = null; // seconds since muzzle for recoil pulse
  let hitAge = null;
  let hitDir = new THREE.Vector3(1, 0, 0);
  let lean = 0;
  let squashT = 999;
  let flashT = 999;
  let emissiveSaved = [];
  const wreckMat = new THREE.MeshLambertMaterial({ color: WRECK_HEX, flatShading: true });
  if (rig) rig.wreckMat = wreckMat;
  const debris = [];
  const timers = []; // { at, fn } scheduled in local time
  let aimYaw = 0;
  let lastSpeed = 0;

  function schedule(delay, fn) {
    timers.push({ at: t + delay, fn });
  }

  function addTrauma(v) {
    if (reduceMotion) { trauma = 0; return; }
    trauma = Math.min(1, trauma + v);
  }

  function worldMark(name, i = 0) {
    if (rig?.world) return rig.world(name, i);
    const v = new THREE.Vector3();
    tankRoot.getWorldPosition(v);
    if (name === 'hullTop') v.y += 1.1;
    if (name === 'muzzles') { v.y += 1.0; v.z += 1.4; }
    if (name === 'deck') v.y += 0.7;
    return v;
  }

  function applyPose(p) {
    if (!rig) {
      // Fallback: nudge hull/turret children by name
      const hull = tankRoot.getObjectByName('hull');
      const turret = tankRoot.getObjectByName('turret');
      if (hull) { hull.position.y = p.hy; hull.rotation.set(p.hrx, 0, p.hrz); }
      if (turret) {
        const rz = turret.userData.restZ ?? 0;
        const ry = turret.userData.restY ?? turret.position.y;
        const rx = turret.userData.restX ?? 0;
        if (turret.userData.restZ == null) {
          turret.userData.restX = turret.position.x;
          turret.userData.restY = turret.position.y;
          turret.userData.restZ = turret.position.z;
        }
        turret.rotation.set(p.trx, p.ty, p.trz);
        turret.position.set(rx + (p.tpz || 0) * Math.sin(p.ty || 0), ry + (p.tpy || 0), rz + (p.tpz || 0) * Math.cos(p.ty || 0));
      }
      return;
    }
    const r = rig.root;
    const px = r.position.x, py = r.position.y, pz = r.position.z, yaw = r.rotation.y;
    const ox = rig.off?.x || 0, oz = rig.off?.z || 0;
    rig.apply({
      ...TANK_POSE,
      ...p,
      x: px - ox,
      y: py,
      z: pz - oz,
      yaw,
    });
  }

  /** Rebind TeamLook + repair NaN colors. Undoes wreckMat / flash / occ clones on a LIVE tank. */
  function ensureLiveMats() {
    if (wrecked || disposed || !rig) return;
    try { rig.setWreck(false, wreckMat); } catch (_) {}
    const team = rig.look?.team;
    const visor = rig.look?.visor;
    const fixCol = (c, hex) => {
      if (!c) return;
      if (![c.r, c.g, c.b].every(Number.isFinite)) c.setHex(hex);
    };
    if (team) {
      fixCol(team.color, 0xffffff);
      fixCol(team.emissive, 0x000000);
      if (team.emissiveIntensity != null && !Number.isFinite(team.emissiveIntensity)) team.emissiveIntensity = 0;
    }
    if (visor) {
      fixCol(visor.color, 0x43aabc);
      fixCol(visor.emissive, 0x5ee8ff);
      if (visor.emissiveIntensity != null && !Number.isFinite(visor.emissiveIntensity)) visor.emissiveIntensity = 0.6;
    }
    tankRoot.traverse((o) => {
      if (!o.isMesh) return;
      o.userData._feelMatCloned = false;
      o.userData._occMatCloned = false;
      const kind = o.userData.mat;
      if (kind === 'team' && team) o.material = team;
      else if (kind === 'visor' && visor) o.material = visor;
    });
  }

  function beginEmissiveFlash() {
    // End any in-flight flash first so restore data is never dropped (multi-hit race).
    if (emissiveSaved.length) endEmissiveFlash();
    emissiveSaved = [];
    if (reduceMotion || wrecked) { flashT = 999; return; } // skip muzzle white core
    // Start from clean TeamLook so we never flash wreckMat / occ orphans (those restore to black).
    ensureLiveMats();
    const mats = new Set();
    tankRoot.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      // Always fresh-clone from TeamLook — never mutate shared (would bleach friendlies).
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      o.userData._feelMatCloned = true;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (!m || mats.has(m)) continue;
        mats.add(m);
        // Emissive-only flash (MeshLambert always has emissive). Avoid color.lerp — it can NaN atlas tints.
        if (m.emissive) {
          const saved = m.emissive.clone();
          const ei = Number.isFinite(m.emissiveIntensity) ? m.emissiveIntensity : 1;
          emissiveSaved.push({ m, c: saved, i: ei });
          m.emissive.setHex(0xffffff);
          m.emissiveIntensity = 1.2;
        }
      }
    });
    flashT = 0;
  }

  function endEmissiveFlash() {
    for (const s of emissiveSaved) {
      try {
        if (s.m?.emissive && s.c) s.m.emissive.copy(s.c);
        if (s.i != null && s.m) s.m.emissiveIntensity = s.i;
      } catch (_) {}
    }
    emissiveSaved = [];
    flashT = 999;
    // Always rebind shared TeamLook after flash (live tank only)
    ensureLiveMats();
  }

  function spawnDust(k = 1) {
    const color = isTracked ? 0xa89c88 : 0x9fd8ff;
    for (const m of ['rearL', 'rearR']) {
      const p = worldMark(m);
      if (fx.sprite) {
        fx.sprite({
          p: p.clone().add(fx.rv ? fx.rv(0.2, 0, 0.2) : new THREE.Vector3()),
          color,
          v: (fx.rv ? fx.rv(0.4, 0, 0.4) : new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0)),
          life: 1.2, s0: 0.3 * k, s1: 1.3 * k, a: isTracked ? 0.5 : 0.3, drag: 1.5,
        });
      } else {
        fx.smoke?.(p, 2, 0.5 * k, color, 0.5, 0.3, 1.2);
      }
    }
  }

  function doMuzzleShot(target) {
    const mz = worldMark('muzzles', 0);
    const hit = target.clone();
    const dir = hit.clone().sub(mz).normalize();
    if (reduceMotion) {
      // Acceptance 9: skip muzzle white core; tracers at half life
      fx.muzzle?.(mz, dir, 0xffc070, 0.9);
      fx.smoke?.(mz.clone().addScaledVector(dir, 0.3), 3, 0.45, 0xc8ccd2, 0.15, 0.55, 0.9);
    } else {
      fx.muzzle(mz, dir, 0xffc070, 2.4);
      fx.smoke(mz.clone().addScaledVector(dir, 0.3), 6, 0.9, 0xc8ccd2, 0.2, 1.1, 1.8);
    }
    const sh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe2a0 }),
    );
    fx.lob(sh, mz, hit, SHELL_DUR, 0.05, (p) => {
      fx.explosion(p, 1.1);
      try { sh.geometry.dispose(); sh.material.dispose(); } catch (_) {}
    }, 40, 0);
    // casing +40 ms at breech, 2.5× scale
    schedule(CASING_DELAY, () => {
      const breech = worldMark('muzzles', 0).addScaledVector(dir, -0.55);
      breech.y += 0.05;
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(tankRoot.quaternion);
      const before = fx.solids?.length || 0;
      fx.casing(breech, side);
      // scale last casing mesh
      if (fx.solids && fx.solids.length > before) {
        const o = fx.solids[fx.solids.length - 1];
        o.m.scale.setScalar(2.5);
        o.max = 2.8;
        o.bounce = 0.25;
      }
    });
    shotAge = 0;
  }

  function spawnDebrisBurst(at) {
    const n = 8 + Math.floor(Math.random() * 5); // 8–12
    const geo = fx.debrisGeo || new THREE.BoxGeometry(0.12, 0.08, 0.16);
    const mat = wreckMat;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(0.7 + Math.random() * 1.1);
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        3 + Math.random() * 4,
        (Math.random() - 0.5) * 5,
      );
      const w = 8 + Math.random() * 10;
      fx.solid(m, at.clone().add(new THREE.Vector3(0, 0.3, 0)), v, 3.2, 0.25, 0.06, w);
      debris.push(m);
    }
    fx.sparks(at, 24, 0xffc060, 8, 0.7);
  }

  function paintWreck() {
    if (rig?.setWreck) rig.setWreck(true, wreckMat);
    else {
      tankRoot.traverse((o) => {
        if (o.isMesh) o.material = wreckMat;
      });
    }
  }


  /**
   * Spec §2.2 idle hover/breathe (acceptance 1).
   * Tracked: hy = 0.006·sin(t·40) engine vibration + turret scan.
   * Hover drive: hy = 0.05·sin(t·2.4), hrx/hrz rock, pad glow every 800ms.
   */
  function idleBreathe(pose, move = 0) {
    if (wrecked || reduceMotion || !pose) return pose;
    const scan = 0.35 * Math.sin(t * TAU / 6);
    if (move < 0.15) pose.ty = aimYaw + scan;
    else pose.ty = (pose.ty || aimYaw) + scan * 0.05;
    if (isTracked) {
      pose.hy = (pose.hy || 0) + 0.006 * Math.sin(t * 40);
    } else {
      pose.hy = (pose.hy || 0) + 0.05 * Math.sin(t * 2.4);
      pose.hrx = (pose.hrx || 0) + 0.012 * Math.sin(t * 1.7);
      pose.hrz = (pose.hrz || 0) + 0.01 * Math.sin(t * 1.3);
    }
    return pose;
  }

  function tickPadGlow(d) {
    if (isTracked || reduceMotion || wrecked || !fx?.sprite) return;
    padGlowAcc += d;
    if (padGlowAcc < 0.8) return;
    padGlowAcc = 0;
    for (const name of ['rearL', 'rearR']) {
      let p;
      try { p = worldMark(name); } catch (_) { continue; }
      if (!p) continue;
      fx.sprite({
        p: p.clone(), color: 0x9fd8ff, v: new THREE.Vector3(0, 0.12, 0),
        life: 0.55, s0: 0.22, s1: 0.65, a: 0.25, drag: 1.2,
      });
    }
  }

  let lastPose = null;
  const api = {
    feelRoot,
    wreckMat,
    /** Last applied pose (wreck=1 once wrecked). */
    get pose() { return lastPose || (wrecked ? { wreck: 1 } : null); },
    get wrecked() { return wrecked; },
    idleBreathe, // acceptance 1 — named for source checks
    get reduceMotion() { return reduceMotion; },
    get trauma() { return trauma; },
    set trauma(v) { trauma = Math.min(1, Math.max(0, v)); },

    /**
     * @param {number} dt
     * @param {{ speed?: number, accel?: number, yawRate?: number, aimYaw?: number }} state
     */
    update(dt, state = {}) {
      if (disposed) return;
      if (state.reduceMotion != null) reduceMotion = !!state.reduceMotion;
      const d = Math.max(0, dt || 0);
      t += d;
      if (reduceMotion) trauma = 0;
      else trauma = Math.max(0, trauma - TRAUMA_DECAY * d);

      // flush timers
      for (let i = timers.length - 1; i >= 0; i--) {
        if (t >= timers[i].at) {
          const fn = timers[i].fn;
          timers.splice(i, 1);
          try { fn(); } catch (_) {}
        }
      }

      const speed = state.speed || 0;
      const accel = state.accel != null ? state.accel : (speed - lastSpeed) / Math.max(1e-3, d);
      lastSpeed = speed;
      const yawRate = state.yawRate || 0;
      if (state.aimYaw != null) aimYaw = state.aimYaw;

      if (flashT < 0.08) {
        flashT += d;
        if (flashT >= 0.08) endEmissiveFlash();
      }

      if (shotAge != null) { shotAge += d; if (shotAge > 0.8) shotAge = null; }
      if (hitAge != null) { hitAge += d; if (hitAge > 1.2) hitAge = null; }

      // Fire wind-up → muzzle
      if (fireT != null && !wrecked) {
        fireT += d;
        if (!fired && fireT >= WINDUP) {
          fired = true;
          if (fireTarget) doMuzzleShot(fireTarget);
        }
        if (fireT > WINDUP + 1.2) { fireT = null; fireTarget = null; }
      }

      // Destroy sequence
      if (destroyT != null) {
        destroyT += d;
        const td = destroyT;
        // pose wreck beats handled below in pose build
        if (td >= DESTROY_DUR) {
          // stay wrecked; sequence done (smoke continues via emitter)
        }
      }

      // Dust while moving
      const moving = Math.abs(speed) > 0.2 && !wrecked;
      if (moving) {
        dustAcc += d;
        if (dustAcc >= DUST_INTERVAL) { dustAcc = 0; spawnDust(1); }
      } else dustAcc = 0;

      // Turn lean ease
      const wantLean = THREE.MathUtils.clamp(yawRate, -1, 1) * 0.08;
      const leanK = 1 - Math.exp(-d / 0.12);
      lean += (wantLean - lean) * leanK;

      // Accel squash trigger
      if (!wrecked && Math.abs(accel) > 1.5 && squashT > 0.2) squashT = 0;
      squashT += d;
      let sx = 1, sy = 1, sz = 1;
      if (squashT < 0.18) {
        const k = back(squashT / 0.18);
        const peak = accel >= 0 ? { x: 1.04, y: 0.96, z: 1.02 } : { x: 0.98, y: 1.03, z: 0.97 };
        sx = 1 + (peak.x - 1) * (1 - k);
        sy = 1 + (peak.y - 1) * (1 - k);
        sz = 1 + (peak.z - 1) * (1 - k);
      }
      if (reduceMotion) { sx = 1; sy = 1; sz = 1; }
      feelRoot.scale.set(sx, sy, sz);
      // Squash the hull bone (feelRoot itself is empty; hierarchy stays on the rig)
      if (rig?.b?.hull) rig.b.hull.scale.set(sx, sy, sz);

      // Build pose
      let p;
      if (destroyT != null) {
        p = KP({ ty: aimYaw });
        const td = destroyT;
        // Crit rocks at 0 / 1.6 / 3.2
        for (const x of [0, 1.6, 3.2]) {
          p.hrz += 0.05 * wobble(td, x, 1.8, 0.4);
          p.hrx -= 0.03 * wobble(td, x, 1.4, 0.4);
        }
        const pop = seg(td, 3.8, 4.5);
        if (td > 3.8) {
          // Arc up then settle askew OFF the hull (not back on the ring)
          const lift = Math.max(0, 2.8 * pop - 2.2 * pop * pop); // peaks ~0.9 mid, ends ~0.6
          const settle = eOut(pop);
          p.trz = 0.55 * settle;          // clearly rolled
          p.trx = -0.45 * settle;         // pitched forward/back
          p.ty = aimYaw + 1.1 * settle;   // yawed off-axis
          p.tpy = 0.55 * settle + lift * 0.35; // stays elevated on hull edge
          p.tpz = -0.55 * settle;         // offset aft of ring
          p.wreck = 1;
          p.hy = -0.06;
        } else if (td < 3.8) {
          // keep idle-ish until pop
          if (isTracked) p.hy += 0.006 * Math.sin(t * 40);
          else {
            p.hy += 0.05 * Math.sin(t * 2.4);
            p.hrx += 0.012 * Math.sin(t * 1.7);
            p.hrz += 0.01 * Math.sin(t * 1.3);
          }
        }
      } else {
        const move = THREE.MathUtils.clamp(Math.abs(speed), 0, 1);
        // Base from arenaTankPose (shot/hit/move bob)
        p = arenaTankPose({
          t,
          turret: aimYaw + (move > 0.2 ? 0.02 * Math.sin(t * 0.8) : 0),
          move,
          shot: shotAge,
          hit: hitAge,
          wreck: wrecked ? 1 : 0,
        });

        // Spec §2.2 — idleBreathe (tracked vibration / hover bob + turret scan)
        idleBreathe(p, move);
        tickPadGlow(d);

        // Accel squat / brake nose-up (§2.3)
        const accSign = THREE.MathUtils.clamp(accel / 3, -1, 1);
        if (Math.abs(accSign) > 0.05) {
          p.hrx += -0.035 * accSign * (1 - Math.exp(-3 * Math.min(1.4, Math.abs(accel) * 0.2 + 0.2)));
        }
        // Cruise bank + turn lean
        p.hrz += (move > 0.2 ? 0.025 * (Math.abs(accSign) < 0.3 ? 1 : 0.5) : 0) + lean;

        // Barrel dip wind-up
        if (fireT != null && fireT < WINDUP) {
          p.tpy -= 0.02 * eIn(fireT / WINDUP);
        } else if (fireT != null && fireT < WINDUP + 0.25) {
          p.tpy -= 0.02 * (1 - sm((fireT - WINDUP) / 0.25));
        }

        // Extra cannon recoil rock (demo style) on top of arenaTankPose pulse
        if (shotAge != null) {
          p.tpz += -0.05 * FEEL.RECOIL_K * pulse(shotAge, 0, 0.02, 0.18);
          p.hrx += -0.07 * FEEL.RECOIL_K * wobble(shotAge, 0, 1.6, 0.45);
        }
      }

      if (wrecked) p.wreck = 1;
      lastPose = p;
      applyPose(p);
      // Live tanks: heal flash/occ/wreckMat leaks when not mid-flash (black-hull guard).
      if (!wrecked && flashT >= 0.08) ensureLiveMats();
    },

    /**
     * Start wind-up then fire at target. Returns ms until shell lands (wind-up + lob).
     * @param {THREE.Vector3} targetVec3
     * @returns {number}
     */
    fire(targetVec3) {
      if (disposed || wrecked) return 0;
      fireTarget = targetVec3?.isVector3
        ? targetVec3.clone()
        : new THREE.Vector3(targetVec3.x, targetVec3.y, targetVec3.z);
      fireT = 0;
      fired = false;
      // Cannon trauma lands on the trigger frame (0.4) so camera kick is never sampled as 0
      addTrauma(FEEL.TRAUMA_FIRE);
      return Math.round((WINDUP + SHELL_DUR) * 1000);
    },

    /**
     * @param {THREE.Vector3} dirVec3 impact direction (from attacker toward tank)
     * @param {number} amount damage
     */
    hit(dirVec3, amount = 20) {
      if (disposed || wrecked) return;
      hitDir = dirVec3?.isVector3
        ? dirVec3.clone().normalize()
        : new THREE.Vector3(dirVec3?.x || 1, 0, dirVec3?.z || 0).normalize();
      if (!reduceMotion) hitAge = 0; // acceptance 9: no hit-stop
      beginEmissiveFlash();
      const top = worldMark('hullTop');
      fx.hitPuff(top, amount > 30 ? 2 : 1);
      schedule(0.15, () => {
        fx.emit(
          () => fx.smoke(worldMark('deck'), 1, 0.7, 0x8d939a, 1.0, 0.3, reduceMotion ? 1.1 : 2.2),
          reduceMotion ? 3 : 7, reduceMotion ? 4 : 8, 'dmg' + id,
        );
      });
      addTrauma(FEEL.TRAUMA_HIT);
    },

    /** Start the ~4.5 s wreck sequence. */
    destroy() {
      if (disposed || destroyT != null) return;
      destroyT = 0;
      wrecked = false; // flips at turret blow
      // Acceptance 9: reduceMotion → one readable death explosion, no multi-crit shake
      if (reduceMotion) {
        schedule(0, () => {
          const top = worldMark('hullTop');
          fx.explosion(top, 1.4);
          paintWreck();
          wrecked = true;
          fx.emit(
            () => fx.smoke(worldMark('deck'), 1, 1.0, 0x2a2d31, 1.0, 0.4, 2.5),
            6, 2.5, 'wreck' + id,
          );
        });
        return;
      }
      // Crit hits 0 / 1.6 / 3.2
      const crit = (delay) => {
        schedule(delay, () => {
          const top = worldMark('hullTop');
          const from = top.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 6, 1.5 + Math.random(), (Math.random() - 0.5) * 6,
          ));
          fx.bolt?.(from, top, 0xff5a3c, 50, 0.8);
          fx.hitPuff(top, 2);
          hitAge = 0;
        });
      };
      crit(0);
      crit(1.6);
      crit(3.2);

      // Onboard fire @ 2.2 s
      schedule(2.2, () => {
        fx.explosion(worldMark('hullTop'), 0.6);
        fx.emit(() => {
          const p = worldMark('deck');
          fx.sprite?.({
            p: p.clone().add(fx.rv ? fx.rv(0.3, 0, 0.3) : new THREE.Vector3()),
            tex: 'glow', add: true, color: 0xff9a30, c1: 0xff3010,
            v: new THREE.Vector3(0, 1.6, 0), life: 0.5, s0: 0.5, s1: 0.15, a: 0.95, drag: 0.5, fadeIn: 0,
          });
          if (Math.random() < 0.3) fx.light?.(p, 0xff7a20, 4, 0.12, 6);
        }, 26, 6, 'fire' + id);
      });

      // Turret blow @ 3.8 s
      schedule(3.8, () => {
        wrecked = true;
        const top = worldMark('hullTop');
        fx.explosion(top, 1.6);
        fx.stop?.('dmg' + id);
        fx.stop?.('fire' + id);
        fx.emit(
          () => fx.smoke(worldMark('deck'), 1, 1.0, 0x2a2d31, 1.4, 0.4, 3),
          9, 4.2, 'wreck' + id,
        );
        spawnDebrisBurst(top);
        paintWreck();
        addTrauma(FEEL.TRAUMA_WRECK);
      });

      // Shock ring @ 3.85 s
      schedule(3.85, () => {
        const p = worldMark('hullTop');
        fx.ring(p, 0xffd28a, 4.5, 0.6);
      });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      endEmissiveFlash();
      fx.stop?.('dmg' + id);
      fx.stop?.('fire' + id);
      fx.stop?.('wreck' + id);
      timers.length = 0;
      try { feelRoot.removeFromParent(); } catch (_) {}
      try { wreckMat.dispose(); } catch (_) {}
      // debris meshes owned by FX solids — leave FX to clear on its dispose
    },
  };

  return api;
}

export { FEEL as TANK_FEEL };
