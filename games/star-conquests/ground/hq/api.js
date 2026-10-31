// Stable read-only facade for Dev C boarding demo. Do NOT rename exports before 5:30 PM Phoenix.
import * as THREE from '../../vendor/three.module.min.js';
import { TeamLook } from './trooper.js';
import { RigTemplate, Rig } from './demo-rig.js';
import { arenaPose, FIRE_PROFILES, dropWeapon, OUT_T } from './demo-actions.js';
import { FX } from './demo-fx.js';
import { nationFor, trooperSt, paintState } from './looks.js';

/** Same scale as ground battle (models3d.UNIT_SCALE). */
export const UNIT_SCALE = 1.0;

const TEAM_HEX = { attacker: '#3ab4ff', defender: '#ff5a4a' };
const _tpl = new Map();
const _fxByScene = new WeakMap();

function lookFor(side, skin) {
  const hex = TEAM_HEX[side] || TEAM_HEX.attacker;
  const L = new TeamLook();
  L.paint(paintState(nationFor(hex, side), { skin }));
  return L;
}

function tplFor(st) {
  const key = JSON.stringify(st);
  let t = _tpl.get(key);
  if (!t) { t = new RigTemplate('trooper', st); _tpl.set(key, t); }
  return t;
}

function fxFor(scene) {
  let fx = _fxByScene.get(scene);
  if (!fx) { fx = new FX(scene); _fxByScene.set(scene, fx); }
  return fx;
}

/**
 * Fixed default look per side + class. Returns { root, rig }.
 * @param {{ side?: 'attacker'|'defender', cls?: string }} opts
 */
export function createHqTrooper({ side = 'attacker', cls = 'rifle' } = {}) {
  const type = cls === 'recon' ? 'recon' : (cls || 'rifle');
  const st = trooperSt(type);
  const look = lookFor(side === 'defender' ? 'defender' : 'attacker', st.skin);
  const rig = new Rig(tplFor(st), look);
  const root = rig.root;
  root.scale.setScalar(UNIT_SCALE);
  root.userData.hqRig = rig;
  root.userData.hqApi = true;
  root.userData._walkDist = 0;
  root.userData._lastState = 'idle';
  root.userData._dieWeaponDropped = false;
  for (const m of rig.meshes) m.userData.sharedGeo = true;
  return { root, rig };
}

/**
 * Apply Army HQ arenaPose for a named state.
 * @param {{ root: THREE.Group, rig: import('./demo-rig.js').Rig }} trooper
 * @param {'idle'|'run'|'shoot'|'die'|'crawl'} state
 * @param {number} t seconds into the state
 * @param {number} [dt=0.016]
 */
export function poseTrooper(trooper, state, t, dt = 0.016) {
  const rig = trooper?.rig || trooper?.root?.userData?.hqRig;
  const root = trooper?.root || rig?.root;
  if (!rig || !root) return;
  const ud = root.userData;
  if (ud._lastState !== state) {
    ud._lastState = state;
    if (state === 'run') ud._walkDist = ud._walkDist || 0;
    if (state === 'die') ud._dieWeaponDropped = false;
  }
  let move = 0, dist = ud._walkDist || 0, run = false, aim = 0.12, crouch = 0, shot = null, down = null;
  if (state === 'idle') {
    aim = 0.1; move = 0;
  } else if (state === 'run') {
    move = 1; run = true;
    dist = (ud._walkDist = (ud._walkDist || 0) + Math.max(0, dt) * 3.2);
    aim = 0.25;
  } else if (state === 'shoot') {
    aim = 1; move = 0; shot = Math.min(0.55, Math.max(0, t));
  } else if (state === 'crawl') {
    crouch = 1; move = Math.min(0.45, 0.2 + 0.1 * Math.sin(t * 3));
    dist = (ud._walkDist = (ud._walkDist || 0) + move * Math.max(0, dt) * 1.2);
    aim = 0.4;
  } else if (state === 'die') {
    down = Math.max(0, t);
    move = 0; aim = 0.2;
  }
  const pose = arenaPose({
    t: t || 0,
    aim, crouch, move, dist, run,
    shot, fire: FIRE_PROFILES[0],
    down,
  });
  // Keep world xz/yaw under caller's control — pose only drives bones + bob
  const wx = root.position.x, wz = root.position.z, wyaw = root.rotation.y;
  pose.x = 0; pose.z = 0; pose.yaw = 0;
  rig.apply(pose);
  root.scale.setScalar(UNIT_SCALE);
  root.position.set(wx, (pose.y || 0) * UNIT_SCALE, wz);
  root.rotation.y = wyaw;
  root.visible = state !== 'die' || (pose.fade ?? 1) > 0.01;

  if (state === 'die' && !ud._dieWeaponDropped && down >= (OUT_T.drop || 0.25)) {
    // Caller may not have a scene FX yet; drop only if one was attached via fireFx
    const fx = ud._fx;
    if (fx) {
      try { dropWeapon({ rig, fx }); ud._dieWeaponDropped = true; } catch (_) {}
    }
  }
}

/**
 * Muzzle flash + tracer + hit puff toward targetVec3 (world space).
 * @param {THREE.Scene} scene
 * @param {{ root: THREE.Group, rig }} trooper
 * @param {THREE.Vector3} targetVec3
 */
export function fireFx(scene, trooper, targetVec3) {
  const rig = trooper?.rig || trooper?.root?.userData?.hqRig;
  const root = trooper?.root || rig?.root;
  if (!rig || !scene || !targetVec3) return;
  const fx = fxFor(scene);
  root.userData._fx = fx;
  const muzzle = new THREE.Vector3();
  try { rig.world('muzzle', 0, muzzle); }
  catch (_) { muzzle.set(root.position.x, root.position.y + 1.0 * UNIT_SCALE, root.position.z); }
  const target = targetVec3.isVector3 ? targetVec3 : new THREE.Vector3(targetVec3.x, targetVec3.y, targetVec3.z);
  const dir = target.clone().sub(muzzle).normalize();
  fx.muzzle(muzzle, dir, 0xffd27a, 1);
  fx.tracer(muzzle, target, 0xffe08a, 0.1, 0.03);
  fx.hitPuff(target, 1);
  return fx;
}

/** Dispose fade mats / detach; shared template geos stay cached. */
export function disposeHqTrooper(trooper) {
  const rig = trooper?.rig || trooper?.root?.userData?.hqRig;
  const root = trooper?.root || rig?.root;
  if (!rig) return;
  try { rig.disposeFade?.(); rig.clearProps?.(); } catch (_) {}
  if (root?.parent) root.parent.remove(root);
}
