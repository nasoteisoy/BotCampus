// Demo Viewer rigs. Builds the SAME geometry as the customizer (trooper.js buildParts / tank.js buildTankParts),
// then splits the customizer's 4 trooper bones (legs, torso, head, arms) into a finer skeleton so the unit can
// walk, crouch, throw and salute: pelvis, thigh/shin/foot x2, torso, head, arms (weapon), armL, armR.
// Geometry is built once per look (RigTemplate) and shared by every squad copy (Rig).
import * as THREE from 'three';
import * as T from './trooper.js?v=7';
import { buildTankParts, TANK_PIVOT, TANK_PARENT } from './tank.js?v=7';

const V = (a) => new THREE.Vector3(...a);
// trooper skeleton: name -> [pivot (rest pose, model space), parent]. Pivots come from trooper.js buildParts.
export const TROOPER_BONES = {
  pelvis: [[0, 0.9, 0], null],
  thighL: [[0.105, 0.9, 0], 'pelvis'], shinL: [[0.125, 0.5, 0.066], 'thighL'], footL: [[0.13, 0.11, 0.06], 'shinL'],
  thighR: [[-0.105, 0.9, 0], 'pelvis'], shinR: [[-0.125, 0.5, 0.006], 'thighR'], footR: [[-0.13, 0.11, -0.04], 'shinR'],
  torso: [[0, 0.95, 0], 'pelvis'], head: [[0, 1.46, 0], 'torso'], arms: [[0, 1.36, 0], 'torso'],
  armL: [[0.225, 1.37, 0], 'arms'], armR: [[-0.225, 1.37, 0], 'arms'],
};
const TANK_BONES = Object.fromEntries(Object.keys(TANK_PIVOT).map((k) => [k, [TANK_PIVOT[k], TANK_PARENT[k]]]));
const ARM_PARTS = 4; // trooper.js arm(): upper seg, forearm seg, hand, forearm plate

function centroid(g) { g.computeBoundingBox(); return g.boundingBox.getCenter(new THREE.Vector3()); }
function maxZPoint(geos, filter = () => true) {
  let best = null;
  for (const g of geos) { const a = g.attributes.position.array; for (let i = 0; i < a.length; i += 3) if (filter(a[i], a[i + 1], a[i + 2]) && (!best || a[i + 2] > best.z)) best = new THREE.Vector3(a[i], a[i + 1], a[i + 2]); }
  return best || new THREE.Vector3();
}

// Split the customizer's parts into demo bones. Returns { bone -> [parts] }.
function splitTrooper(parts) {
  const out = {}; const put = (b, p) => (out[b] = out[b] || []).push(p);
  const arms = parts.filter((p) => p.bone === 'arms'), n = arms.length;
  for (const p of parts) {
    if (p.bone === 'legs') {
      const c = centroid(p.geo);
      if (Math.abs(c.x) < 0.05) put('pelvis', p);
      else { const s = c.x > 0 ? 'L' : 'R'; put((c.y < 0.1 ? 'foot' : c.y < 0.52 ? 'shin' : 'thigh') + s, p); }
    } else if (p.bone === 'arms') {
      const i = arms.indexOf(p); // order in buildParts: weapon parts, arm(right) x4, arm(left) x4, left-shoulder flag patch
      put(i >= n - 2 * ARM_PARTS - 1 && i < n - ARM_PARTS - 1 ? 'armR' : i >= n - ARM_PARTS - 1 ? 'armL' : 'arms', p);
    } else put(p.bone, p);
  }
  return out;
}

export class RigTemplate {
  constructor(kind, st) {
    this.kind = kind; this.st = st;
    const parts = kind === 'tank' ? buildTankParts(st) : T.buildParts(st);
    const bones = kind === 'tank' ? TANK_BONES : TROOPER_BONES;
    const groups = kind === 'tank' ? (() => { const o = {}; for (const p of parts) (o[p.bone] = o[p.bone] || []).push(p); return o; })() : splitTrooper(parts);
    this.bones = bones; this.geos = {}; this.tris = 0; this.marks = {};
    if (kind === 'trooper') {
      const weapon = (groups.arms || []).map((p) => p.geo);
      const mz = maxZPoint(weapon);
      const wb = new THREE.Box3(); weapon.forEach((g) => { g.computeBoundingBox(); wb.union(g.boundingBox); });
      this.marks.muzzle = { bone: 'arms', p: mz };
      this.marks.eject = { bone: 'arms', p: new THREE.Vector3(wb.min.x - 0.01, (wb.min.y + wb.max.y) / 2 + 0.02, wb.min.z * 0.4 + wb.max.z * 0.6 - 0.15) };
      this.marks.scope = { bone: 'arms', p: new THREE.Vector3((wb.min.x + wb.max.x) / 2, wb.max.y + 0.02, (wb.min.z + wb.max.z) / 2) };
      this.marks.mag = { bone: 'arms', p: new THREE.Vector3((wb.min.x + wb.max.x) / 2, wb.min.y, wb.min.z * 0.5 + wb.max.z * 0.5) };
      const hand = (b) => groups[b] && groups[b][2] ? centroid(groups[b][2].geo) : V(TROOPER_BONES[b][0]);
      this.marks.handR = { bone: 'armR', p: hand('armR') }; this.marks.handL = { bone: 'armL', p: hand('armL') };
      this.marks.chest = { bone: 'torso', p: new THREE.Vector3(0, 1.25, 0.16) };
      this.marks.back = { bone: 'torso', p: new THREE.Vector3(0, 1.02, -0.24) };
      this.marks.head = { bone: 'head', p: new THREE.Vector3(0, 1.62, 0.12) };
      this.armsSplit = (groups.armR || []).length === ARM_PARTS && (groups.armL || []).length === ARM_PARTS + 1;
    } else {
      const tur = (groups.turret || []).map((p) => p.geo);
      const mz = maxZPoint(tur);
      const near = (x, y, z) => z > mz.z - 0.05;
      const l = maxZPoint(tur, (x, y, z) => near(x, y, z) && x > 0.04), r = maxZPoint(tur, (x, y, z) => near(x, y, z) && x < -0.04);
      this.marks.muzzles = st.gun === 1 && l.z && r.z ? [{ bone: 'turret', p: new THREE.Vector3(0.13 * [0.85, 1, 1.15][st.hull], mz.y, mz.z) }, { bone: 'turret', p: new THREE.Vector3(-0.13 * [0.85, 1, 1.15][st.hull], mz.y, mz.z) }] : [{ bone: 'turret', p: new THREE.Vector3(0, mz.y, mz.z) }];
      const hb = new THREE.Box3(); (groups.hull || []).forEach((p) => { p.geo.computeBoundingBox(); hb.union(p.geo.boundingBox); });
      this.marks.deck = { bone: 'hull', p: new THREE.Vector3(0, hb.max.y, hb.min.z + 0.35) };
      this.marks.hullTop = { bone: 'hull', p: new THREE.Vector3(0, hb.max.y + 0.3, 0) };
      this.marks.rearL = { bone: 'base', p: new THREE.Vector3(hb.max.x * 0.8, 0.15, hb.min.z) };
      this.marks.rearR = { bone: 'base', p: new THREE.Vector3(-hb.max.x * 0.8, 0.15, hb.min.z) };
      this.size = { w: hb.max.x - hb.min.x, l: hb.max.z - hb.min.z, h: hb.max.y };
    }
    for (const [b, list] of Object.entries(groups)) for (const mat of ['team', 'visor']) {
      const sel = list.filter((p) => p.mat === mat); if (!sel.length) continue;
      const g = T.concat(sel.map((p) => p.geo)), pv = bones[b][0];
      g.translate(-pv[0], -pv[1], -pv[2]); g.computeBoundingSphere();
      (this.geos[b] = this.geos[b] || {})[mat] = g; this.tris += g.attributes.position.count / 3;
    }
    T.disposeAll(parts);
    // marks -> bone-local
    const loc = (m) => { const pv = bones[m.bone][0]; return { bone: m.bone, p: m.p.clone().sub(V(pv)) }; };
    for (const k of Object.keys(this.marks)) this.marks[k] = Array.isArray(this.marks[k]) ? this.marks[k].map(loc) : loc(this.marks[k]);
    // leg IK constants (sagittal plane)
    if (kind === 'trooper') {
      this.leg = {};
      for (const s of ['L', 'R']) {
        const hip = V(bones['thigh' + s][0]), knee = V(bones['shin' + s][0]), ank = V(bones['foot' + s][0]);
        this.leg[s] = { L1: Math.hypot(knee.y - hip.y, knee.z - hip.z), L2: Math.hypot(ank.y - knee.y, ank.z - knee.z), a1: Math.atan2(knee.z - hip.z, hip.y - knee.y), a2: Math.atan2(ank.z - knee.z, knee.y - ank.y), ankY: ank.y };
      }
    }
  }
  dispose() { for (const o of Object.values(this.geos)) for (const g of Object.values(o)) g.dispose(); }
}

// default pose (all angles radians). Feet are IK targets in root space: fXz (forward), fXy (lift), fp* foot pitch.
export const TROOPER_POSE = Object.freeze({
  x: 0, y: 0, z: 0, yaw: 0, px: 0, py: -0.03, pz: 0, prx: 0, pry: 0, prz: 0,
  trx: 0, try: 0, trz: 0, hrx: 0, hry: 0, hrz: 0,
  arx: 0.3, ary: 0.1, arz: 0, apx: 0, apy: 0, apz: 0,
  lrx: 0, lry: 0, lrz: 0, rrx: 0, rry: 0, rrz: 0,
  fLz: 0.06, fLy: 0, fRz: -0.04, fRy: 0, fpL: 0, fpR: 0, sL: 0, sR: 0,
  fk: 0, tL: 0, kL: 0, tR: 0, kR: 0, wpn: 1, fade: 1,   // wpn < 0.5 hides the hand-held weapon (it was dropped) · fade 1 → 0 fades the body out
});
export const TANK_POSE = Object.freeze({ x: 0, y: 0, z: 0, yaw: 0, hy: 0, hrx: 0, hrz: 0, ty: 0, tpz: 0, tpy: 0, trx: 0, trz: 0, wreck: 0 });

const ORDER = 'YXZ';
export class Rig {
  constructor(tpl, look) {
    this.tpl = tpl; this.kind = tpl.kind; this.look = look;
    this.root = new THREE.Group(); this.root.name = 'rig-' + tpl.kind;
    this.b = {}; this.meshes = [];
    for (const k of Object.keys(tpl.bones)) { const g = new THREE.Group(); g.name = k; g.rotation.order = ORDER; this.b[k] = g; }
    for (const [k, [p, par]] of Object.entries(tpl.bones)) {
      const pp = par ? tpl.bones[par][0] : [0, 0, 0];
      this.b[k].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]); this.b[k].userData.rest = this.b[k].position.clone();
      (par ? this.b[par] : this.root).add(this.b[k]);
    }
    for (const [b, mats] of Object.entries(tpl.geos)) for (const [mat, g] of Object.entries(mats)) {
      const m = new THREE.Mesh(g, mat === 'team' ? look.team : look.visor); m.castShadow = true; m.name = b + ':' + mat; m.userData.mat = mat;
      this.b[b].add(m); this.meshes.push(m);
    }
    this.marks = {};
    const mk = (m) => { const o = new THREE.Object3D(); o.position.copy(m.p); this.b[m.bone].add(o); return o; };
    for (const [k, m] of Object.entries(tpl.marks)) this.marks[k] = Array.isArray(m) ? m.map(mk) : mk(m);
    this.pose = { ...(this.kind === 'tank' ? TANK_POSE : TROOPER_POSE) };
    this.off = new THREE.Vector3();
  }
  world(name, i = 0, out = new THREE.Vector3()) { const m = this.marks[name]; return (Array.isArray(m) ? m[i % m.length] : m).getWorldPosition(out); }
  setWreck(on, wreckMat) {
    for (const m of this.meshes) m.material = on ? wreckMat : (m.userData.mat === 'team' ? this.look.team : this.look.visor);
  }
  apply(p) {
    this.pose = p; const B = this.b, r = this.root;
    r.position.set(p.x + this.off.x, p.y, p.z + this.off.z); r.rotation.y = p.yaw;
    if (this.kind === 'tank') {
      B.hull.position.y = p.hy; B.hull.rotation.set(p.hrx, 0, p.hrz);
      const t = B.turret, rest = t.userData.rest;
      t.position.set(rest.x, rest.y + p.tpy, rest.z + p.tpz * Math.cos(p.ty)); t.position.x += p.tpz * Math.sin(p.ty);
      t.rotation.set(p.trx, p.ty, p.trz);
      const w = p.wreck > 0.5; if (w !== !!this._wreck) { this._wreck = w; this.setWreck(w, this.wreckMat); }
      return;
    }
    B.pelvis.position.set(p.px, 0.9 + p.py, p.pz); B.pelvis.rotation.set(p.prx, p.pry, p.prz);
    B.torso.rotation.set(p.trx, p.try, p.trz); B.head.rotation.set(p.hrx, p.hry, p.hrz);
    const ar = B.arms.userData.rest; B.arms.position.set(ar.x + p.apx, ar.y + p.apy, ar.z + p.apz); B.arms.rotation.set(p.arx, p.ary, p.arz);
    B.armL.rotation.set(p.lrx, p.lry, p.lrz); B.armR.rotation.set(p.rrx, p.rry, p.rrz);
    // legs: 2-bone IK in the pelvis' sagittal plane, blended with FK by p.fk
    const leg = this.tpl.leg, c = Math.cos(p.prx), s = Math.sin(p.prx);
    for (const S of ['L', 'R']) {
      const L = leg[S];
      const wy = p['f' + S + 'y'] + L.ankY - (0.9 + p.py), wz = p['f' + S + 'z'] - p.pz;
      const y = wy * c + wz * s, z = -wy * s + wz * c;
      let d = Math.hypot(y, z); const dmax = (L.L1 + L.L2) * 0.9995; d = Math.min(Math.max(d, 0.12), dmax);
      const phi = Math.atan2(z, -y);
      const alpha = Math.acos(THREE.MathUtils.clamp((L.L1 * L.L1 + d * d - L.L2 * L.L2) / (2 * L.L1 * d), -1, 1));
      const th1 = phi + alpha, kz = L.L1 * Math.sin(th1), ky = -L.L1 * Math.cos(th1);
      const tz = Math.sin(phi) * d, ty = -Math.cos(phi) * d;
      const th2 = Math.atan2(tz - kz, ky - ty);
      let thigh = -(th1 - L.a1), shin = -((th2 - L.a2) - (th1 - L.a1));
      const f = p.fk; if (f > 0) { thigh = thigh * (1 - f) + p['t' + S] * f; shin = shin * (1 - f) + p['k' + S] * f; }
      B['thigh' + S].rotation.set(thigh, 0, (S === 'L' ? 1 : -1) * p['s' + S]);
      B['shin' + S].rotation.set(shin, 0, 0);
      B['foot' + S].rotation.set(-(p.prx + thigh + shin) * (1 - f) + p['fp' + S], 0, 0);
    }
    const wv = !(p.wpn < 0.5); for (const m of this.meshes) if (m.name.startsWith('arms:')) m.visible = wv;
    this.setFade(p.fade ?? 1);
  }
  // 💀 taken out: fade the whole body (per-rig material copies, so squad mates sharing the look stay solid)
  setFade(a) {
    if (a >= 0.999) { if (this._fading) { this._fading = false; for (const m of this.meshes) m.material = m.userData.mat === 'team' ? this.look.team : this.look.visor; } this.root.visible = true; return; }
    if (!this._fadeMats) this._fadeMats = { team: Object.assign(this.look.team.clone(), { transparent: true }), visor: Object.assign(this.look.visor.clone(), { transparent: true }) };
    if (!this._fading) { this._fading = true; for (const m of this.meshes) m.material = this._fadeMats[m.userData.mat]; }
    this._fadeMats.team.opacity = this._fadeMats.visor.opacity = Math.max(0, a);
    this.root.visible = a > 0.01;
  }
  // props held by the rig for one action (pistol in hand, …): removed when the action changes
  attach(obj, mark) { (this.marks[mark] || this.root).add(obj); (this._props ||= []).push(obj); return obj; }
  clearProps() { for (const o of this._props || []) { o.removeFromParent(); o.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } }); } this._props = []; }
  disposeFade() { if (this._fadeMats) { this._fadeMats.team.dispose(); this._fadeMats.visor.dispose(); this._fadeMats = null; } }
}
