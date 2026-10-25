// Demo Viewer actions: procedural, keyframed poses for the trooper + tank rigs (demo-rig.js) and their effects (demo-fx.js).
// Every action is a pure pose(t) function (so speed, squad offsets and looping are exact) plus timed events.
import * as THREE from 'three';
import { TROOPER_POSE, TANK_POSE } from './demo-rig.js?v=8';
import * as S from '../../shared/army/stats.js?v=9';

// ---------- stage layout (shared with demo.js) ----------
export const STAGE = { dummy: new THREE.Vector3(0, 0, 10), wall: new THREE.Vector3(3.2, 0, 3.6), wallSize: [3.4, 1.15, 0.35], flag: new THREE.Vector3(-5.5, 0, 6), coverSpot: [3.2, 3.0], tankLoop: [-4, 0, 4] };
export const HIT = () => STAGE.dummy.clone().add(new THREE.Vector3(0, 1.25, 0));

// ---------- math helpers ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sm = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const eOut = (x) => { x = clamp01(x); return 1 - (1 - x) ** 3; };
const eIn = (x) => { x = clamp01(x); return x * x * x; };
const back = (x) => { x = clamp01(x); const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; }; // overshoot
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const frac = (x) => x - Math.floor(x);
const TAU = Math.PI * 2;
const angLerp = (a, b, k) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * k; };
const pulse = (t, at, rise = 0.03, decay = 0.14) => (t < at ? 0 : t < at + rise ? (t - at) / rise : Math.exp(-(t - at - rise) / decay));
const pulses = (t, times, rise, decay) => times.reduce((s, x) => s + pulse(t, x, rise, decay), 0);
const wobble = (t, at, f = 9, d = 0.35) => (t < at ? 0 : Math.sin((t - at) * f * TAU / 2) * Math.exp(-(t - at) / d));

// pose = defaults + partial; mix = lerp of every numeric key (yaw-like keys use angle lerp)
const TP = (o = {}) => ({ ...TROOPER_POSE, lvl: 1, hlv: 0.85, ...o });
const KP = (o = {}) => ({ ...TANK_POSE, ...o });
const ANG = new Set(['yaw', 'ty']);
function mix(a, b, k) { const o = {}; for (const key in a) o[key] = ANG.has(key) ? angLerp(a[key], b[key] ?? a[key], k) : a[key] + ((b[key] ?? a[key]) - a[key]) * k; return o; }
// keyframes: [[time, pose, ease?]] ; feet that change z between keys get a small lift arc (a step, not a slide)
function keys(t, list) {
  if (t <= list[0][0]) return { ...list[0][1] };
  for (let i = 1; i < list.length; i++) {
    const [t1, p1, e = sm] = list[i];
    if (t <= t1) {
      const [t0, p0] = list[i - 1], k = e((t - t0) / Math.max(1e-6, t1 - t0)), o = mix(p0, p1, k);
      if ('fLz' in p0) for (const S of ['L', 'R']) { const dz = Math.abs(p1['f' + S + 'z'] - p0['f' + S + 'z']); if (dz > 0.06 && !p1.fk) o['f' + S + 'y'] += Math.min(0.14, dz * 0.45) * Math.sin(Math.PI * clamp01((t - t0) / (t1 - t0))); }
      return o;
    }
  }
  return { ...list[list.length - 1][1] };
}
// path: legs [[t0, t1, [x0, z0], [x1, z1]]], eased (accelerate + brake). Returns position, distance travelled, speed, heading.
function route(t, legs) {
  let dist = 0;
  for (const [t0, t1, a, b] of legs) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (t >= t1) { dist += L; continue; }
    if (t < t0) { return { x: a[0], z: a[1], dist, v: 0, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) }; }
    const u = (t - t0) / (t1 - t0), k = sm(u), v = L * 6 * u * (1 - u) / (t1 - t0);
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, dist: dist + L * k, v, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }
  const [, , , b] = legs[legs.length - 1], a = legs[legs.length - 1][2];
  return { x: b[0], z: b[1], dist, v: 0, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}
// gaits: S stride (foot travel during stance), d duty, lift, bob, drop (pelvis), lean (torso), run (arm carry)
const WALK = { S: 0.62, d: 0.6, lift: 0.12, bob: 0.025, drop: -0.04, lean: 0.06, run: 0 };
const RUN = { S: 0.86, d: 0.38, lift: 0.24, bob: 0.06, drop: -0.1, lean: 0.24, run: 1 };
const CRAWL = { S: 0.3, d: 0.5 };
function gait(p, dist, g, w = 1) {
  if (w <= 0.001) return p;
  const C = g.S / g.d, ph = dist / C;
  for (const [S, off, bz] of [['L', 0, 0.03], ['R', 0.5, -0.02]]) {
    const u = frac(ph + off); let z, y = 0, fp = 0;
    if (u < g.d) z = g.S / 2 - g.S * (u / g.d);
    else { const s = (u - g.d) / (1 - g.d); z = -g.S / 2 + g.S * sm(s); y = g.lift * Math.sin(Math.PI * s); fp = 0.7 * Math.sin(Math.PI * s) * (1 - s) - 0.25 * Math.sin(Math.PI * s) * s; }
    p['f' + S + 'z'] += (z + bz - p['f' + S + 'z']) * w; p['f' + S + 'y'] += (y - p['f' + S + 'y']) * w; p['fp' + S] += fp * w;
  }
  const c2 = Math.cos(2 * TAU * ph), c1 = Math.cos(TAU * ph), s1 = Math.sin(TAU * ph);
  p.py += w * (g.drop + g.bob * c2); p.px += w * 0.03 * s1; p.prz += w * 0.045 * s1; p.pry += -w * 0.12 * c1;
  p.try += w * 0.14 * c1; p.trx += w * (g.lean + 0.02 * c2); p.hry += -w * 0.04 * c1;
  p.arx += w * (0.04 * c2 + g.run * 0.25); p.ary += w * (0.06 * c1 + g.run * 0.3); p.arz += w * g.run * -0.25;
  p.lrx += w * 0.08 * c1;
  return p;
}
const breathe = (p, t, k = 1) => { p.trx += 0.015 * k * Math.sin(t * 2.2); p.arx += 0.012 * k * Math.sin(t * 2.2 + 0.5); p.py += -0.006 * k * (1 + Math.sin(t * 2.2)); return p; };
const sway = (p, t, k = 1) => { p.arx += 0.008 * k * Math.sin(t * 1.3); p.ary += 0.01 * k * Math.sin(t * 0.9 + 1); return p; };

// ---------- trooper base poses ----------
const READY = TP();
const AIM = TP({ arx: -0.17, ary: -0.06, apy: 0.035, apz: 0.05, hrx: 0.08, hry: -0.07, trx: 0.05, try: 0.06, fLz: 0.2, fRz: -0.14, py: -0.06, px: -0.015 });
const CROUCH = TP({ py: -0.43, prx: 0.32, trx: -0.02, fLz: 0.3, fRz: -0.33, fpR: 0.6, arx: 0.25, hrx: 0.05 });
const CROUCH_AIM = { ...CROUCH, arx: -0.17, ary: -0.06, apy: 0.035, apz: 0.05, hrx: 0.1, hry: -0.07, try: 0.05 };
const PRONE = TP({ fk: 1, py: -0.73, prx: 1.47, pz: -0.25, tL: 0, kL: 0, tR: 0, kR: 0, sL: 0.08, sR: 0.08, fpL: 1.2, fpR: 1.2, trx: 0, arx: -0.12, hrx: 0.12, hlv: 0.85, apy: -0.02 });

// weapon fire profiles (trooper.js weapon order: blaster, rocket, sniper, shotgun, chaingun, EMP)
const FIRE = [
  { shots: [0, 0.13, 0.26], kick: 0.1, back: 0.035, big: 0.8, bolt: 1 },
  { shots: [0], kick: 0.22, back: 0.08, big: 1.6, rocket: 1 },
  { shots: [0], kick: 0.32, back: 0.07, big: 1.4, beam: 1 },
  { shots: [0, 0.6], kick: 0.28, back: 0.08, big: 1.3, pellets: 6, pump: 1 },
  { shots: Array.from({ length: 12 }, (_, i) => i * 0.075), kick: 0.035, back: 0.015, big: 0.8, bolt: 1, spin: 1 },
  { shots: [0, 0.7], kick: 0.18, back: 0.05, big: 1.2, emp: 1 },
];
const recoil = (p, t, times, f, k = 1) => {
  const r = pulses(t, times, 0.025, 0.11) * k;
  p.arx -= f.kick * r; p.apz -= f.back * r; p.trx -= f.kick * 0.25 * r; p.hrx -= f.kick * 0.15 * r; p.py -= 0.01 * r;
  return p;
};
// one shot from a trooper rig (events)
function fireShot(c, f) {
  const fx = c.fx, rig = c.rig, mz = rig.world('muzzle'), ej = rig.world('eject'), hit = HIT().add(fx.rv(0.25, 0.3, 0.1));
  const dir = hit.clone().sub(mz).normalize();
  fx.muzzle(mz, dir, f.emp ? 0x7fd8ff : c.bolt, f.big);
  if (!f.rocket && !f.emp) { const side = new THREE.Vector3(-1, 0, 0).applyQuaternion(rig.root.quaternion); fx.casing(ej, side); }
  if (f.beam) { fx.tracer(mz, hit, c.bolt, 0.22, 0.05); fx.tracer(mz, hit, 0xffffff, 0.12, 0.018); c.stage.dummyHit(c, hit, 1.4); }
  else if (f.pellets) for (let i = 0; i < f.pellets; i++) { const h = hit.clone().add(fx.rv(0.5, 0.45, 0.2)); fx.tracer(mz, h, 0xffe6a0, 0.07, 0.015); if (i < 2) c.stage.dummyHit(c, h, 0.6); }
  else if (f.emp) { const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7fd8ff })); fx.lob(orb, mz, hit, 0.55, 0.4, (p) => { fx.ring(p, 0x7fd8ff, 2.2, 0.5, p.y - 1.1); fx.sparks(p, 20, 0x9fe8ff, 4); c.stage.dummyHit(c, p, 1); orb.geometry.dispose(); orb.material.dispose(); }, 0, 0); }
  else if (f.rocket) fireRocket(c);
  else fx.bolt(mz, hit, c.bolt, 55, 0.55, (p) => c.stage.dummyHit(c, p, 0.7));
}
function fireRocket(c) {
  const fx = c.fx, rig = c.rig, mz = rig.world('muzzle'), hit = HIT().add(new THREE.Vector3(0, -0.2, 0));
  const dir = hit.clone().sub(mz).normalize();
  // back-blast behind the tube
  const bb = mz.clone().addScaledVector(dir, -0.95);
  fx.smoke(bb, 8, 0.8, 0xc9ced4, 0.4, 1.4, 1.6); fx.sprite({ p: bb, tex: 'glow', add: true, color: 0xffb060, life: 0.12, s0: 0.6, s1: 1.1, a: 1, fadeIn: 0 });
  fx.muzzle(mz, dir, 0xffb060, 1.6);
  const m = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 6).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x59606a }));
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffc070 })); flame.position.z = -0.2; m.add(body, flame);
  fx.lob(m, mz, hit, 0.7, 0.15, (p) => { fx.explosion(p.setY(Math.max(0.3, p.y)), 1.2); c.stage.dummyHit(c, p, 2.2); body.geometry.dispose(); body.material.dispose(); flame.geometry.dispose(); flame.material.dispose(); }, 60, 0);
}
const fireEvents = (f, t0) => f.shots.map((s) => [t0 + s, (c) => fireShot(c, f)]);

// ---------- trooper actions ----------
// pose(t, c) -> pose ; ev: [[time, fn(c)]] ; once: stage event runs only for squad leader
const T_ACTIONS = [];
const A = (o) => { T_ACTIONS.push(o); return o; };

A({ id: 'idle', ico: '🧍', name: 'Idle', dur: 6, pose(t) {
  const p = TP(); breathe(p, t, 1.2);
  const look = keys(t, [[0, { v: 0 }], [1.2, { v: 0 }], [1.8, { v: 0.55 }], [2.8, { v: 0.55 }], [3.4, { v: -0.45 }], [4.4, { v: -0.45 }], [5.0, { v: 0 }]]).v;
  p.hry += look; p.try += look * 0.25; p.pry += look * 0.08;
  p.px += 0.02 * Math.sin(t * TAU / 6); p.prz += 0.02 * Math.sin(t * TAU / 6);
  const chk = sm(seg(t, 4.9, 5.2)) * (1 - sm(seg(t, 5.6, 5.95))); p.arz -= 0.35 * chk; p.hrx += 0.25 * chk; p.hry += 0.1 * chk;
  return p;
} });

const walkLoop = (R, v, g) => { const dur = TAU * R / v; return { dur, pose(t) {
  const a = t / dur * TAU, x = -R + R * Math.cos(a), z = R * Math.sin(a);
  const p = TP({ x, z, yaw: Math.atan2(-Math.sin(a), Math.cos(a)) });
  p.prz -= g.run ? 0.08 : 0.03; // lean into the turn
  breathe(p, t, 0.5); return gait(p, v * t, g, 1);
} }; };
A({ id: 'walk', ico: '🚶', name: 'Walk', ...walkLoop(2, 1.35, WALK) });
A({ id: 'run', ico: '🏃', name: 'Run', ...walkLoop(3, 4.4, RUN) });

A({ id: 'crouch', ico: '🧎', name: 'Crouch', dur: 4.4, pose(t) {
  const p = keys(t, [[0, READY], [0.12, { ...READY, py: -0.01, trx: -0.03 }], [0.5, CROUCH, back], [1.6, CROUCH], [2.0, CROUCH_AIM], [3.3, CROUCH_AIM], [3.75, { ...READY, py: 0.0 }, back], [4.4, READY]]);
  breathe(p, t, 1); sway(p, t, 1.5);
  const look = keys(t, [[0.5, { v: 0 }], [0.9, { v: 0.5 }], [1.3, { v: -0.4 }], [1.6, { v: 0 }]]).v; p.hry += look;
  return p;
} });

A({ id: 'prone', ico: '🐛', name: 'Crawl', info: 'Belly-down crawl: elbows and knees pull it forward — still in the fight', dur: 7.6, pose(t) {
  const KNEEL = { ...CROUCH, py: -0.48, prx: 0.6, arx: 0.4, fRz: -0.36 };
  const HANDS = TP({ fk: 0.6, py: -0.62, prx: 1.15, pz: -0.05, tL: -0.5, kL: 1.2, tR: -0.1, kR: 0.5, fpL: 0.4, fpR: 0.6, arx: 0.1, trx: 0.1 });
  const crawlZ = 1.1;
  let p = keys(t, [[0, READY], [0.35, KNEEL], [0.7, HANDS], [1.05, PRONE, eOut], [4.7, PRONE], [5.1, HANDS], [5.45, KNEEL], [5.85, READY]]);
  const cz = crawlZ * sm(seg(t, 1.2, 3.6)); p.z = t < 5.85 ? cz : crawlZ * (1 - sm(seg(t, 5.9, 7.4)));
  if (t > 1.1 && t < 3.7) { // commando crawl: alternate knee + elbow, hips wiggle
    const w = sm(seg(t, 1.1, 1.3)) * (1 - sm(seg(t, 3.5, 3.7))), ph = (t - 1.1) * 1.6 * TAU;
    p.tL += w * (-0.35 - 0.35 * Math.sin(ph)); p.kL += w * (0.6 + 0.6 * Math.sin(ph)); p.sL += w * 0.25 * (0.5 + 0.5 * Math.sin(ph));
    p.tR += w * (-0.35 + 0.35 * Math.sin(ph)); p.kR += w * (0.6 - 0.6 * Math.sin(ph)); p.sR += w * 0.25 * (0.5 - 0.5 * Math.sin(ph));
    p.lrx += w * 0.35 * Math.sin(ph); p.rrx -= w * 0.35 * Math.sin(ph); p.lrz += w * 0.08 * Math.sin(ph); p.rrz += w * 0.08 * Math.sin(ph); // elbow pulls (left elbow with right knee)
    p.pry += w * 0.12 * Math.sin(ph); p.prz += w * 0.08 * Math.sin(ph); p.ary += w * 0.12 * Math.sin(ph); p.arz += w * 0.1 * Math.sin(ph); p.apz += w * 0.04 * Math.sin(ph); p.hry -= w * 0.08 * Math.sin(ph);
  }
  const aim = sm(seg(t, 3.7, 4.0)) * (1 - sm(seg(t, 4.6, 4.8))); p.arx -= 0.12 * aim; p.hrx += 0.08 * aim;
  if (t > 5.85) p = gait(p, crawlZ * sm(seg(t, 5.9, 7.4)), WALK, Math.sin(Math.PI * seg(t, 5.9, 7.4)) * 1.2 > 1 ? 1 : Math.sin(Math.PI * seg(t, 5.9, 7.4)) * 1.2);
  return breathe(p, t, 0.6);
}, ev: [[4.25, (c) => fireShot(c, { ...FIRE[c.st.weapon === 1 ? 0 : c.st.weapon], shots: [0] })],
  ...Array.from({ length: 8 }, (_, i) => [1.25 + i * 0.3125, (c) => c.fx.smoke(c.rig.world(i % 2 ? 'handR' : 'handL').setY(0.05), 1, 0.35, 0xa89c88, 0.15, 0.25, 0.7)])] });

// 💀 taken out: shot → flinch → knocked back in the hit direction → falls onto the back, weapon drops → lies still → fades.
// Clearly not the crawl (face-down, moving forward, weapon kept). Same motion as Conquest (render.js DOWN_T) + Combat/Team.
A({ id: 'out', ico: '💀', name: 'Taken out', info: 'Hit hard: knocked back onto its back, drops its weapon, lies ~3 s, then fades out', dur: 6.2, pose(t) {
  const H = 0.55;
  if (t < H) return breathe(keys(t, [[0, READY], [0.35, AIM, back], [H, AIM]]), t, 0.6);
  const d = t - H;
  if (d < OUT_T.fade) return outPose(d, AIM);
  const p = breathe(TP(), t, 0.6); p.fade = sm(seg(d, OUT_T.fade + 0.35, OUT_T.fade + 1.1)); return p; // back in for the next loop
}, ev: [[0.42, (c) => c.fx.bolt(HIT().setY(1.3), c.rig.world('chest'), 0xff5a3c, 55, 0.6)],
  [0.55, (c) => { c.fx.hitPuff(c.rig.world('chest'), 1.6); c.fx.light(c.rig.world('chest'), 0xff6040, 5, 0.12, 4); }],
  [0.55 + 0.25, (c) => dropWeapon(c)],
  [0.55 + 0.65, (c) => c.fx.smoke(c.rig.root.position.clone(), 5, 0.7, 0xa89c88, 0.2, 0.9, 1.1)]] });

A({ id: 'aim', ico: '🎯', name: 'Aim', dur: 4, pose(t) {
  const p = keys(t, [[0, READY], [0.12, { ...READY, arx: 0.42, py: -0.04 }], [0.42, AIM, back], [3.3, AIM], [3.8, READY]]);
  breathe(p, t, 0.6); sway(p, t, 1);
  const scan = keys(t, [[0.6, { v: 0 }], [1.3, { v: 0.35 }], [2.0, { v: 0.35 }], [2.7, { v: -0.2 }], [3.2, { v: 0 }]]).v;
  p.try += scan * 0.8; p.pry += scan * 0.25; p.hry += scan * 0.1;
  return p;
} });

const shootAct = A({ id: 'shoot', ico: '🔫', name: 'Shoot', dur: 3.6, pose(t, c) {
  const f = FIRE[c.st.weapon] || FIRE[0];
  const p = keys(t, [[0, READY], [0.12, { ...READY, arx: 0.42 }], [0.4, AIM, back], [3.1, AIM], [3.6, READY]]);
  breathe(p, t, 0.4); sway(p, t, 0.6);
  const times = [...f.shots.map((s) => 0.7 + s), ...f.shots.map((s) => 1.9 + s)];
  recoil(p, t, times, f);
  if (f.pump) { const k = pulses(t, times.map((x) => x + 0.25), 0.12, 0.12); p.lrx += 0.25 * k; p.apz -= 0.02 * k; }
  if (f.spin) { p.arx += 0.008 * Math.sin(t * 90) * seg(t, 0.7, 0.8) * (1 - seg(t, 2.9, 3)); }
  return p;
}, ev: [] });
shootAct.evFor = (c) => { const f = FIRE[c.st.weapon] || FIRE[0]; return [...fireEvents(f, 0.7), ...fireEvents(f, 1.9)]; };

A({ id: 'reload', ico: '🔄', name: 'Reload', dur: 3.4, pose(t) {
  const DOWN = { ...READY, arx: 0.5, ary: 0.45, arz: -0.55, apy: 0.02, hrx: 0.38, hry: 0.2, trx: 0.06, try: -0.08 };
  const p = keys(t, [[0, AIM], [0.35, DOWN], [0.55, { ...DOWN, lrx: 0.55, lrz: 0.12 }], [0.95, { ...DOWN, lrx: 0.6, lrz: 0.1 }], [1.25, { ...DOWN, lrx: -0.05 }, eIn], [1.35, { ...DOWN, arx: 0.56 }], [1.7, { ...DOWN, arz: -0.35, ary: 0.3, hrx: 0.3 }], [2.0, { ...DOWN, arz: -0.4, apz: -0.03 }], [2.15, DOWN], [2.6, AIM, back], [3.4, AIM]]);
  return breathe(p, t, 0.7);
}, ev: [[0.45, (c) => { const p = c.rig.world('mag'); const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.05), new THREE.MeshLambertMaterial({ color: 0x2b2f35 })); c.fx.solid(m, p, new THREE.Vector3(0, -0.5, 0), 2.2, 0.25, 0.03, 4); }],
  [1.25, (c) => c.fx.sparks(c.rig.world('mag'), 4, 0xffffff, 1, 0.15)], [1.95, (c) => c.fx.sparks(c.rig.world('eject'), 3, 0xffe0a0, 0.8, 0.12)]] });

const grenadeAct = A({ id: 'grenade', ico: '💣', name: 'Throw: Thermal', dur: 3.6, pose(t) {
  const LOW = { ...READY, arx: 0.75, ary: 0.7, arz: -0.3, try: 0.1, rrx: 0.25, rrz: -0.2, hrx: 0.1 };
  const PIN = { ...LOW, rrx: -0.6, rrz: 0.2, hry: -0.1 };
  const WIND = { ...LOW, fLz: 0.34, fRz: -0.2, pz: -0.08, py: -0.08, trx: -0.2, try: -0.55, pry: -0.2, rrx: -3.55, rrz: 0.25, rry: 0.2, lrx: -0.5, hry: 0.5, hrx: -0.05 };
  const THROW = { ...LOW, fLz: 0.34, fRz: -0.12, pz: 0.12, py: -0.1, trx: 0.32, try: 0.5, pry: 0.25, rrx: -0.75, rrz: 0.35, lrx: 0.3, hry: -0.4, hrx: 0.05 };
  const p = keys(t, [[0, READY], [0.35, LOW], [0.55, PIN], [0.7, LOW], [1.15, WIND, eOut], [1.28, THROW, eIn], [1.55, { ...THROW, trx: 0.4, rrx: -0.4 }], [2.3, READY], [3.6, READY]]);
  return breathe(p, t, 0.8);
}, ev: [[0.56, (c) => c.fx.sparks(c.rig.world('handR'), 4, 0xffffff, 1, 0.15)],
  [1.22, (c) => { const a = c.rig.world('handR'), b = STAGE.dummy.clone().add(new THREE.Vector3(c.rig.off.x * 1.5 - 0.6, 0.06, -1.4 + c.rig.off.z));
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshLambertMaterial({ color: 0x6a7380, emissive: 0x330000 }));
    c.fx.lob(g, a, b, 0.95, 2.8, (p) => { c.fx.explosion(p, 0.9); c.stage.dummyHit(c, p, 1.6); g.geometry.dispose(); g.material.dispose(); }, 0, 14); }]] });

const coverAct = A({ id: 'cover', ico: '🧱', name: 'Cover', dur: 8, pose(t, c) {
  const [cx, cz] = STAGE.coverSpot, H = [0, 0];
  const r = route(t, [[0.25, 1.45, H, [cx, cz]], [6.0, 7.4, [cx, cz], H]]);
  let yaw = keys(t, [[0, { v: 0 }], [0.3, { v: r.yaw }], [1.35, { v: Math.atan2(cx, cz) }], [1.6, { v: 0 }], [5.7, { v: 0 }], [6.05, { v: Math.atan2(-cx, -cz) }], [7.3, { v: Math.atan2(-cx, -cz) }], [7.8, { v: 0 }]]).v;
  const HIDE = { ...CROUCH, py: -0.47, prx: 0.42, arx: 0.55, ary: 0.4, trx: 0.05, hrx: 0.0 };
  const POP = { ...AIM, py: -0.18, prx: 0.08, fLz: 0.3, fRz: -0.3 };
  let p = keys(t, [[0, READY], [1.35, READY], [1.65, HIDE, eOut], [2.6, HIDE], [2.85, POP, back], [3.7, POP], [3.9, HIDE, eOut], [4.6, HIDE], [4.85, POP, back], [5.5, POP], [5.7, HIDE, eOut], [5.95, READY], [8, READY]]);
  p.x = r.x; p.z = r.z; p.yaw = yaw;
  const w = clamp01(r.v / 2.5); gait(p, r.dist, r.v > 2 || (t > 0.25 && t < 1.45) ? RUN : WALK, w);
  const pant = sm(seg(t, 1.6, 2.0)) * (1 - sm(seg(t, 2.5, 2.7))); p.trx += 0.04 * pant * Math.sin(t * 16); p.hry += 0.4 * pant * Math.sin(t * 2.5);
  const f = FIRE[c.st.weapon] || FIRE[0]; recoil(p, t, [...f.shots.map((s) => 3.05 + s), ...f.shots.map((s) => 5.05 + s)], f);
  return breathe(p, t, 1);
} });
coverAct.evFor = (c) => { const f = FIRE[c.st.weapon] || FIRE[0]; return [...fireEvents(f, 3.05), ...fireEvents(f, 5.05), [1.6, (c) => c.fx.smoke(c.rig.root.position.clone(), 3, 0.5, 0xa89c88, 0.2, 0.6, 0.9)]]; };

A({ id: 'hit', ico: '💥', name: 'Get hit', dur: 3.6, pose(t) {
  const HIT1 = { ...READY, trx: -0.5, pz: -0.14, py: -0.05, hrx: -0.45, hrz: 0.15, arx: -0.35, ary: 0.3, fRz: -0.36, prx: -0.12, rrx: -0.3, lrx: -0.4, prz: 0.08 };
  const STAG = { ...READY, trx: -0.25, pz: -0.3, py: -0.12, fLz: -0.18, fRz: -0.4, hrx: -0.15, arx: 0.4, prz: -0.06 };
  const HUNCH = { ...READY, trx: 0.4, prx: 0.1, py: -0.14, pz: -0.3, fLz: -0.14, fRz: -0.44, arx: 0.7, ary: 0.4, lrx: -0.6, lrz: -0.3, hrx: 0.3 };
  const p = keys(t, [[0, READY], [0.55, READY], [0.62, HIT1, eOut], [1.0, STAG], [1.5, HUNCH], [2.4, HUNCH], [3.1, READY, back], [3.6, READY]]);
  p.hry += 0.15 * wobble(t, 0.6, 3, 0.5); p.trz += 0.06 * wobble(t, 0.6, 2, 0.6);
  if (t > 3.0) { p.pz = -0.3 * (1 - sm(seg(t, 3.0, 3.5))); p.fLz = p.fLz; }
  return breathe(p, t, 2);
}, ev: [[0.45, (c) => { const p = c.rig.world('chest'); c.fx.bolt(HIT().setY(1.3).add(c.fx.rv(1, 0, 0)), p, 0xff5a3c, 50, 0.6); }],
  [0.58, (c) => { const p = c.rig.world('chest'); c.fx.hitPuff(p, 1.4); c.fx.emit(() => c.fx.smoke(c.rig.world('chest'), 1, 0.35, 0x8d939a, 0.7, 0.2, 1.4), 9, 2.2); }]] });

A({ id: 'victory', ico: '🏆', name: 'Victory', dur: 4, pose(t) {
  const SQ = { ...READY, py: -0.16, trx: 0.12, arx: 0.5 };
  const UP = { ...READY, y: 0.38, py: 0.0, trx: -0.12, arx: -1.6, ary: 0, apy: 0.12, rrx: -3.0, rrz: 0.15, hrx: -0.25, fLz: 0.0, fRz: 0.0, fLy: 0.0 };
  const LAND = { ...READY, py: -0.17, trx: 0.08, arx: -1.2, ary: 0, apy: 0.08, rrx: -2.7, rrz: 0.15 };
  const PUMP = { ...READY, arx: -0.2, ary: 0.2, rrx: -2.95, rrz: 0.15, trx: -0.1, hrx: -0.2 };
  const SAL = { ...READY, arx: 0.35, ary: 0.25, rrx: -2.25, rrz: 0.95, rry: 0.3, trx: -0.07, hrx: -0.05, py: 0.0, fLz: 0.0, fRz: 0.0 };
  const p = keys(t, [[0, READY], [0.3, SQ], [0.55, UP, eOut], [0.8, LAND, eIn], [1.0, PUMP], [1.18, { ...PUMP, rrx: -2.4 }], [1.36, PUMP], [1.54, { ...PUMP, rrx: -2.4 }], [1.72, PUMP], [2.2, SAL, back], [3.3, SAL], [3.8, READY]]);
  if (t > 0.3 && t < 0.8) { p.fLy = 0.12 * Math.sin(Math.PI * seg(t, 0.3, 0.8)); p.fRy = p.fLy; p.fLz += 0.05; }
  return breathe(p, t, 1.4);
}, ev: [[0.55, (c) => { for (let i = 0; i < 18; i++) c.fx.sprite({ p: c.rig.world('head').add(c.fx.rv(0.3, 0.2, 0.3)), tex: 'spark', add: true, color: i % 2 ? c.nat.p : c.nat.s, v: c.fx.rv(2, 0, 2).add(new THREE.Vector3(0, 3.5, 0)), g: 5, drag: 1, life: 1.4, s0: 0.12, s1: 0.06, a: 1, fadeIn: 0 }); }],
  [0.8, (c) => c.fx.smoke(c.rig.root.position.clone(), 4, 0.5, 0xa89c88, 0.2, 0.9, 0.9)]] });

// ----- class specials -----
const SPECIAL = {
  heavy: { ico: '🚀', name: 'Rocket', dur: 4.2, pose(t) {
    const KN = { ...CROUCH, arx: -0.17, ary: -0.06, apy: 0.04, apz: 0.04, hrx: 0.1, hry: -0.08, py: -0.4 };
    const p = keys(t, [[0, READY], [0.5, KN, back], [3.0, KN], [3.6, READY, back], [4.2, READY]]);
    sway(p, t, 1.4 * (1 - sm(seg(t, 1.2, 1.5)))); recoil(p, t, [1.6], FIRE[1]);
    return breathe(p, t, 1);
  }, ev: [[1.0, (c) => c.fx.sparks(c.rig.world('muzzle'), 3, 0xff6060, 0.3, 0.3)], [1.6, (c) => fireRocket(c)]] },
  sniper: { ico: '🔭', name: 'Scope shot', dur: 5, scope: [1.1, 3.0], pose(t) {
    const KN = { ...CROUCH_AIM, hrx: 0.16, hry: -0.1, apz: 0.07 };
    const p = keys(t, [[0, READY], [0.5, KN, back], [3.3, KN], [3.55, { ...KN, lrx: 0.3, apz: 0.0 }], [3.8, KN], [4.4, READY], [5, READY]]);
    sway(p, t, 0.5); recoil(p, t, [2.35], FIRE[2]); return breathe(p, t, 0.3);
  }, ev: [[0.8, (c) => c.fx.sprite({ p: c.rig.world('scope'), tex: 'glow', add: true, color: 0xbfe8ff, life: 0.5, s0: 0.05, s1: 0.5, a: 1, fadeIn: 0.25 })], [2.35, (c) => fireShot(c, FIRE[2])], [3.6, (c) => { const ej = c.rig.world('eject'); c.fx.casing(ej, new THREE.Vector3(-1, 0, 0).applyQuaternion(c.rig.root.quaternion)); }]] },
  engineer: { ico: '🔧', name: 'Repair', dur: 6.2, pose(t) {
    const [gx, gz] = [-1.6, 1.8];
    const r = route(t, [[0.2, 1.2, [0, 0], [gx + 0.0, gz - 0.75]], [4.6, 5.7, [gx, gz - 0.75], [0, 0]]]);
    const yaw = keys(t, [[0, { v: 0 }], [0.3, { v: r.yaw }], [1.1, { v: r.yaw }], [1.35, { v: 0 }], [4.5, { v: 0 }], [4.75, { v: Math.atan2(-gx, -(gz - 0.75)) }], [5.6, { v: Math.atan2(-gx, -(gz - 0.75)) }], [6.1, { v: 0 }]]).v;
    const WORK = { ...CROUCH, arx: 0.85, ary: 0.6, arz: -0.4, lrx: -1.1, lrz: -0.25, hrx: 0.35, trx: 0.15 };
    let p = keys(t, [[0, READY], [1.25, READY], [1.55, WORK, eOut], [4.2, WORK], [4.55, READY, back], [6.2, READY]]);
    const wk = sm(seg(t, 1.6, 1.8)) * (1 - sm(seg(t, 4.0, 4.2))); p.lrx += wk * 0.12 * Math.sin(t * 22); p.lry += wk * 0.1 * Math.sin(t * 13); p.trz += wk * 0.03 * Math.sin(t * 5);
    p.x = r.x; p.z = r.z; p.yaw = yaw; gait(p, r.dist, WALK, clamp01(r.v / 1.2));
    return breathe(p, t, 1);
  }, ev: [[0, (c) => c.once && c.stage.showProp('gen', true)], [1.7, (c) => { const hand = () => c.rig.world('handL'); c.fx.emit(() => { c.fx.sparks(hand(), 2, Math.random() < 0.5 ? 0x9fe8ff : 0xffffff, 2.2, 0.3); if (Math.random() < 0.3) c.fx.light(hand(), 0x9fe8ff, 3, 0.06, 3); }, 30, 2.3); }],
    [4.0, (c) => c.once && c.stage.repairProp(c)], [6.15, (c) => c.once && c.stage.showProp('gen', false)]] },
  jet: { ico: '🛩️', name: 'Jetpack', dur: 4.6, pose(t) {
    const SQ = { ...READY, py: -0.2, trx: 0.15, arx: 0.5 };
    const AIR = { ...READY, y: 2.2, py: -0.12, fLz: 0.12, fRz: -0.12, fLy: 0.1, fRy: 0.18, trx: 0.12, arx: 0.55 };
    const HOV = { ...AIR, y: 2.35, arx: -0.17 + 0.55, ary: -0.06, apy: 0.035, hrx: 0.4 };
    const p = keys(t, [[0, READY], [0.35, SQ], [1.1, AIR, eOut], [1.5, HOV], [2.9, HOV], [3.7, { ...AIR, y: 0.12 }, eIn], [3.85, { ...SQ, py: -0.24 }], [4.4, READY, back], [4.6, READY]]);
    p.y += 0.05 * Math.sin(t * 5) * seg(t, 1.1, 1.3) * (1 - seg(t, 3.0, 3.3));
    recoil(p, t, [1.9, 2.4], FIRE[0]);
    return breathe(p, t, 0.6);
  }, ev: [[0.35, (c) => { const back = () => c.rig.world('back'); c.fx.emit(() => { const p = back(); c.fx.sprite({ p, tex: 'glow', add: true, color: 0x8fd8ff, v: new THREE.Vector3(0, -3, 0), life: 0.22, s0: 0.25, s1: 0.08, a: 1, drag: 0, fadeIn: 0 }); c.fx.sprite({ p, color: 0xc8ccd2, v: c.fx.rv(0.4, 0, 0.4).add(new THREE.Vector3(0, -1.5, 0)), life: 1, s0: 0.15, s1: 0.7, a: 0.4, drag: 2 }); }, 34, 3.4); c.fx.smoke(c.rig.root.position.clone(), 6, 0.8, 0xb0a898, 0.3, 1.4, 1.2); }],
    [1.9, (c) => fireShot(c, { ...FIRE[0], shots: [0] })], [2.4, (c) => fireShot(c, { ...FIRE[0], shots: [0] })], [3.75, (c) => { c.fx.smoke(c.rig.root.position.clone(), 7, 0.8, 0xb0a898, 0.25, 1.6, 1.2); c.fx.ring(c.rig.root.position, 0xffffff, 1.6, 0.35); }]] },
  commander: { ico: '📣', name: 'Rally', dur: 4.2, pose(t) {
    const CALL = { ...READY, arx: 0.45, ary: 0.4, rrx: -2.6, rrz: 0.05, trx: -0.1, hrx: -0.25, py: -0.05, fLz: 0.22, fRz: -0.16, pz: 0.05 };
    const p = keys(t, [[0, READY], [0.3, { ...READY, py: -0.1, rrx: 0.2 }], [0.6, CALL, back], [2.6, CALL], [3.2, READY], [4.2, READY]]);
    p.rrx += 0.15 * Math.sin(t * 9) * seg(t, 0.6, 0.8) * (1 - seg(t, 2.2, 2.6)); p.hry += 0.25 * Math.sin(t * 2) * seg(t, 1, 1.4);
    return breathe(p, t, 1.4);
  }, ev: [[0.65, (c) => { c.fx.ring(c.rig.root.position, 0xffd65a, 3.2, 0.8); c.fx.emit(() => c.fx.sprite({ p: c.rig.root.position.clone().add(c.fx.rv(0.5, 0, 0.5)).setY(0.2), tex: 'spark', add: true, color: 0xffd65a, v: new THREE.Vector3(0, 1.6, 0), life: 0.9, s0: 0.12, s1: 0.04, a: 1, drag: 0, fadeIn: 0 }), 14, 2); }],
    [1.25, (c) => c.fx.ring(c.rig.root.position, 0xffe9a0, 3.2, 0.8)], [1.85, (c) => c.fx.ring(c.rig.root.position, 0xffd65a, 3.2, 0.8)]] },
  trooper: { ico: '🤸', name: 'Dive roll', dur: 4.8, pose(t) {
    const r = route(t, [[0.1, 0.75, [0, 0], [0, 1.3]], [3.1, 4.6, [0, 3.2], [0, 0]]]);
    let p = TP();
    const roll = sm(seg(t, 0.78, 1.38));
    if (t < 0.78) { p = gait(TP(), r.dist, RUN, clamp01(r.v / 2)); p.z = r.z; p.arx = 0.6; }
    else if (t < 1.38) { // tucked forward roll (pelvis pitches a full turn, travels 1.9 m)
      p = TP({ fk: 1, tL: -1.9, kL: 2.3, tR: -1.7, kR: 2.2, fpL: -0.3, fpR: -0.3, trx: 0.4, hrx: 0.5, hlv: 0, lvl: 0, arx: 0.9 });
      p.prx = roll * TAU; p.py = -0.5 + 0.12 * Math.cos(roll * TAU) ** 2; p.z = 1.3 + 1.9 * roll; p.pz = 0;
      p.py -= 0.0; const k = Math.min(seg(t, 0.78, 0.9), 1 - seg(t, 1.28, 1.38)); p.fk = Math.max(0.0, k > 0 ? 1 : 0.6);
    } else {
      p = keys(t, [[1.38, { ...CROUCH_AIM, z: 3.2 }], [2.6, { ...CROUCH_AIM, z: 3.2 }], [3.0, { ...READY, z: 3.2 }]]);
      if (t > 3.05) { p.z = r.z; p.yaw = keys(t, [[3.05, { v: 0 }], [3.3, { v: Math.PI }], [4.3, { v: Math.PI }], [4.8, { v: 0 }]]).v; gait(p, r.dist, WALK, clamp01(r.v / 1.5)); }
    }
    return breathe(p, t, 1);
  }, ev: [[1.38, (c) => c.fx.smoke(c.rig.root.position.clone(), 5, 0.6, 0xa89c88, 0.2, 1.0, 1)], [1.9, (c) => fireShot(c, { ...FIRE[c.st.weapon === 1 ? 0 : c.st.weapon], shots: [0] })]] },
};

// ----- Conquest Commander traits (traits.js): each shows its battle behaviour in a short loop -----
const TRAITS = {
  rusher: { ico: '🏃', name: 'Rusher', dur: 6.4, pose(t) {
    const F = [STAGE.flag.x + 0.9, STAGE.flag.z - 0.9];
    const r = route(t, [[0.2, 1.8, [0, 0], F], [4.3, 6.0, F, [0, 0]]]);
    const yaw0 = Math.atan2(F[0], F[1]), yawB = Math.atan2(-F[0], -F[1]);
    let p = keys(t, [[0, READY], [1.8, READY], [2.05, { ...READY, py: -0.12, trx: 0.15, arx: 0.6, rrx: -0.6 }], [2.4, { ...READY, rrx: -2.9, rrz: 0.15, trx: -0.1, hrx: -0.3, arx: 0.5, ary: 0.4 }, back], [3.6, { ...READY, rrx: -2.9, rrz: 0.15, arx: 0.5, ary: 0.4, hrx: -0.3 }], [4.1, READY], [6.4, READY]]);
    p.x = r.x; p.z = r.z; p.yaw = keys(t, [[0, { v: 0 }], [0.25, { v: yaw0 }], [1.7, { v: yaw0 }], [2.0, { v: yaw0 - 0.6 }], [4.2, { v: yaw0 - 0.6 }], [4.45, { v: yawB }], [5.9, { v: yawB }], [6.3, { v: 0 }]]).v;
    gait(p, r.dist, r.v > 2.2 || (t > 0.2 && t < 1.8) ? RUN : WALK, clamp01(r.v / 2.2));
    return breathe(p, t, 1.4);
  }, ev: [[0.05, (c) => c.once && c.stage.flagState('neutral', 0)], [2.0, (c) => c.once && c.stage.flagState('ours', 1.4)]] },
  cover: { ico: '🧱', name: 'Cover Fighter', dur: 8, pose: (t, c) => coverAct.pose(t, c), evFor: (c) => coverAct.evFor(c) },
  sniper: { ico: '🔭', name: 'Sniper Spot', dur: 7.6, pose(t, c) { return T_ACTIONS.find((a) => a.id === 'prone').pose(t, c); }, ev: [[4.25, (c) => fireShot(c, { ...FIRE[2], shots: [0] })], [3.9, (c) => c.fx.sprite({ p: c.rig.world('scope'), tex: 'glow', add: true, color: 0xbfe8ff, life: 0.4, s0: 0.05, s1: 0.45, a: 1, fadeIn: 0.2 })]] },
  retaker: { ico: '🔁', name: 'Retaker', dur: 6.4, pose(t, c) { return TRAITS.rusher.pose(t, c); }, ev: [[0.05, (c) => c.once && c.stage.flagState('enemy', 0)], [2.0, (c) => c.once && c.stage.flagState('ours', 1.4)]] },
  supplier: { ico: '➕', name: 'Supplier', dur: 4.6, pose(t) {
    const KN = { ...CROUCH, arx: 0.7, ary: 0.5, rrx: -0.9, rrz: 0.1, trx: 0.25, hrx: 0.35 };
    const p = keys(t, [[0, READY], [0.45, KN], [1.1, KN], [1.5, READY, back], [2.0, { ...READY, rrx: -2.5, hrx: -0.2 }], [3.4, { ...READY, rrx: -2.5 }], [3.9, READY], [4.6, READY]]);
    return breathe(p, t, 1);
  }, ev: [[0.9, (c) => c.once && c.stage.showProp('crate', true, c)], [1.6, (c) => { c.fx.ring(c.rig.root.position, 0x5dff7a, 3, 0.9); c.fx.emit(() => c.fx.sprite({ p: c.rig.root.position.clone().add(c.fx.rv(1.4, 0, 1.4)).setY(0.3), tex: 'spark', add: true, color: 0x5dff7a, v: new THREE.Vector3(0, 1.3, 0), life: 1, s0: 0.14, s1: 0.05, a: 1, drag: 0, fadeIn: 0 }), 16, 1.8); }],
    [4.5, (c) => c.once && c.stage.showProp('crate', false)]] },
  mines: { ico: '⚠️', name: 'Mine Layer', dur: 6.6, pose(t) {
    const pts = [[0, 0.9], [0, 1.9], [0, 2.9]];
    const r = route(t, [[0.1, 0.6, [0, 0], [0, 0.5]], [1.6, 2.1, [0, 0.5], [0, 1.5]], [3.1, 3.6, [0, 1.5], [0, 2.5]], [4.6, 6.2, [0, 2.5], [0, 0]]]);
    const KN = { ...CROUCH, arx: 0.7, ary: 0.5, rrx: -0.7, rrz: 0.15, trx: 0.35, hrx: 0.4 };
    const p = keys(t, [[0, READY], [0.65, READY], [0.9, KN], [1.35, KN], [1.55, READY], [2.15, READY], [2.4, KN], [2.85, KN], [3.05, READY], [3.65, READY], [3.9, KN], [4.35, KN], [4.55, READY], [6.6, READY]]);
    p.x = r.x; p.z = r.z; p.yaw = keys(t, [[4.5, { v: 0 }], [4.75, { v: Math.PI }], [6.0, { v: Math.PI }], [6.5, { v: 0 }]]).v;
    gait(p, r.dist, WALK, clamp01(r.v / 1.2)); void pts;
    return breathe(p, t, 1);
  }, ev: [[0.05, (c) => c.once && c.stage.clearMines()], [1.15, (c) => c.stage.dropMine(c)], [2.65, (c) => c.stage.dropMine(c)], [4.15, (c) => c.stage.dropMine(c)]] },
  guard: { ico: '🛡️', name: 'Guard', dur: 7.2, pose(t) {
    const F = [STAGE.flag.x + 1.2, STAGE.flag.z - 1.2];
    const r = route(t, [[0.2, 2.0, [0, 0], F], [5.2, 7.0, F, [0, 0]]]);
    const y0 = Math.atan2(F[0], F[1]);
    const scan = keys(t, [[2.1, { v: 0 }], [2.6, { v: 0.8 }], [3.1, { v: 0.8 }], [3.6, { v: -0.6 }], [4.1, { v: -0.6 }], [4.5, { v: 0.2 }]]).v;
    let p = keys(t, [[0, READY], [2.0, READY], [2.3, AIM], [4.3, AIM], [4.55, { ...CROUCH_AIM }], [5.0, CROUCH_AIM], [5.25, READY], [7.2, READY]]);
    p.x = r.x; p.z = r.z; p.yaw = keys(t, [[0, { v: 0 }], [0.25, { v: y0 }], [1.9, { v: y0 }], [2.15, { v: 0.4 }], [5.1, { v: 0.4 }], [5.35, { v: y0 + Math.PI }], [6.9, { v: y0 + Math.PI }], [7.2, { v: 0 }]]).v + scan;
    p.try += scan * 0.2;
    gait(p, r.dist, WALK, clamp01(r.v / 1.2));
    return breathe(p, t, 1);
  }, ev: [[0.05, (c) => c.once && c.stage.flagState('ours', 0)]] },
};

// tank fire profiles per gun: cannon, twin, railgun, laser
const TFIRE = [{ kick: 0.32, rock: 0.07 }, { kick: 0.22, rock: 0.05, twin: 1 }, { kick: 0.4, rock: 0.09, rail: 1 }, { kick: 0.08, rock: 0.02, laser: 1 }];
function tankShot(c, i = 0) {
  const fx = c.fx, rig = c.rig, gun = c.st.gun, f = TFIRE[gun] || TFIRE[0], mz = rig.world('muzzles', i), hit = HIT().add(fx.rv(0.3, 0.2, 0.1));
  const dir = hit.clone().sub(mz).normalize();
  if (f.rail) { fx.muzzle(mz, dir, 0x7fd8ff, 2.2); fx.tracer(mz, hit, 0x7fd8ff, 0.35, 0.12); fx.tracer(mz, hit, 0xffffff, 0.18, 0.04); fx.explosion(hit, 0.8, 0x7fd8ff); c.stage.dummyHit(c, hit, 2.5); return; }
  if (f.laser) { fx.muzzle(mz, dir, c.bolt, 1.2); const b = fx.tracer(mz, hit, c.bolt, 0.6, 0.09); void b; fx.emit(() => fx.sparks(hit, 3, c.bolt, 2, 0.25), 30, 0.55); c.stage.dummyHit(c, hit, 1.6); return; }
  fx.muzzle(mz, dir, 0xffc070, 2.4);
  fx.smoke(mz.clone().addScaledVector(dir, 0.3), 6, 0.9, 0xc8ccd2, 0.2, 1.1, 1.8);
  const sh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
  fx.lob(sh, mz, hit, 0.22, 0.05, (p) => { fx.explosion(p, 1.1); c.stage.dummyHit(c, p, 2.4); sh.geometry.dispose(); sh.material.dispose(); }, 40, 0);
}
const tankDust = (c, k = 1) => { for (const m of ['rearL', 'rearR']) c.fx.sprite({ p: c.rig.world(m).add(c.fx.rv(0.2, 0, 0.2)), color: c.st.drive ? 0x9fd8ff : 0xa89c88, v: c.fx.rv(0.4, 0, 0.4).add(new THREE.Vector3(0, 0.5, 0)), life: 1.2, s0: 0.3 * k, s1: 1.3 * k, a: c.st.drive ? 0.3 : 0.5, drag: 1.5 }); };
const hover = (p, t, c) => { if (c.st.drive === 1) { p.hy += 0.05 * Math.sin(t * 2.4); p.hrx += 0.012 * Math.sin(t * 1.7); p.hrz += 0.01 * Math.sin(t * 1.3); } else { p.hy += 0.006 * Math.sin(t * 40); } return p; };

const K_ACTIONS = [
  { id: 'idle', ico: '🅿️', name: 'Idle', dur: 6, pose(t, c) { const p = KP({ ty: 0.35 * Math.sin(t * TAU / 6) }); return hover(p, t, c); } },
  { id: 'drive', ico: '🚜', name: 'Drive', dur: 9, pose(t, c) {
    const [cx, , R] = STAGE.tankLoop, L = TAU * R;
    // accelerate 1.2 s, cruise, brake 1.2 s: distance s(t)
    const T = 9, ta = 1.4, vmax = L / (T - ta - 0.6);
    const s = t < ta ? 0.5 * (vmax / ta) * t * t : t < T - ta - 0.6 ? 0.5 * vmax * ta + vmax * (t - ta) : Math.min(L, L - 0.5 * (vmax / ta) * Math.max(0, T - 0.6 - t) ** 2);
    const a = s / R, acc = t < ta ? 1 : t > T - ta - 0.6 && t < T - 0.6 ? -1 : 0;
    const p = KP({ x: cx - cx * Math.cos(a), z: R * Math.sin(a), yaw: -a }); // circle centred at (cx, 0) through the origin
    p.hrx = -0.035 * acc * (1 - Math.exp(-3 * (t < ta ? t : 1))) + 0.04 * wobble(t, T - 0.6, 1.4, 0.4); p.hrz = 0.025 * (acc === 0 && t > ta ? 1 : 0.5);
    p.ty = 0.15 * Math.sin(t * 0.8);
    return hover(p, t, c);
  }, ev: Array.from({ length: 26 }, (_, i) => [0.3 + i * 0.3, (c) => tankDust(c)]) },
  { id: 'turret', ico: '↔️', name: 'Turn turret', dur: 6, pose(t, c) {
    const p = KP({ ty: keys(t, [[0, { v: 0 }], [0.3, { v: -0.06 }], [1.3, { v: 1.62 }, back], [2.3, { v: 1.57 }], [3.4, { v: -1.62 }, back], [4.4, { v: -1.57 }], [5.4, { v: 0 }, back]]).v });
    p.hrz = 0.02 * (wobble(t, 1.3, 2.2, 0.3) - wobble(t, 3.4, 2.2, 0.3)); return hover(p, t, c);
  } },
  { id: 'fire', ico: '💥', name: 'Fire', dur: 4.4, pose(t, c) {
    const f = TFIRE[c.st.gun] || TFIRE[0], times = f.twin ? [0.9, 1.15, 2.5, 2.75] : f.laser ? [0.9, 2.5] : [0.9, 2.5];
    const p = KP({ ty: 0 });
    for (const x of times) { p.tpz -= f.kick * pulse(t, x, 0.02, 0.18); p.hrx -= f.rock * wobble(t, x, 1.6, 0.45); }
    p.hy -= 0.02 * seg(t, 0.4, 0.8) * (1 - seg(t, 3.5, 4));
    return hover(p, t, c);
  }, evFor(c) { const f = TFIRE[c.st.gun] || TFIRE[0]; const times = f.twin ? [[0.9, 0], [1.15, 1], [2.5, 0], [2.75, 1]] : [[0.9, 0], [2.5, 0]]; return [[0.6, (c) => f.rail && c.fx.sprite({ p: c.rig.world('muzzles'), tex: 'glow', add: true, color: 0x7fd8ff, life: 0.3, s0: 0.1, s1: 0.8, a: 1, fadeIn: 0.25 })], ...times.map(([x, i]) => [x, (c) => tankShot(c, i)])]; } },
  { id: 'reverse', ico: '⏪', name: 'Reverse', dur: 6, pose(t, c) {
    const z = -4.5 * sm(seg(t, 0.3, 2.6)) + 4.5 * sm(seg(t, 3.3, 5.6));
    const p = KP({ z, ty: 0 });
    p.hrx = 0.035 * (wobble(t, 0.3, 1, 0.5) - wobble(t, 2.6, 1.2, 0.4)) - 0.035 * (wobble(t, 3.3, 1, 0.5) - wobble(t, 5.6, 1.2, 0.4));
    return hover(p, t, c);
  }, ev: [...Array.from({ length: 7 }, (_, i) => [0.5 + i * 0.3, (c) => tankDust(c, 0.8)]), ...Array.from({ length: 7 }, (_, i) => [3.5 + i * 0.3, (c) => tankDust(c, 0.8)])] },
  { id: 'damage', ico: '🔥', name: 'Damage', dur: 8, pose(t, c) {
    const p = KP();
    for (const x of [0.6, 2.2, 3.8]) { p.hrz += 0.05 * wobble(t, x, 1.8, 0.4); p.hrx -= 0.03 * wobble(t, x, 1.4, 0.4); }
    const pop = seg(t, 3.8, 4.5);
    p.tpy = t > 3.8 ? Math.max(0, 2.6 * pop - 3.4 * pop * pop) + (pop >= 1 ? 0 : 0) : 0;
    if (t > 3.8) { p.trz = 0.45 * eOut(pop); p.trx = -0.2 * eOut(pop); p.ty = 0.6 * eOut(pop); p.tpy = Math.max(-0.05, p.tpy) - 0.08 * eOut(pop); }
    p.wreck = t > 3.85 ? 1 : 0; p.hy = t > 3.85 ? -0.06 : 0;
    return t < 3.8 ? hover(p, t, c) : p;
  }, ev: [
    [0.45, (c) => c.fx.bolt(HIT().setY(1.2), c.rig.world('hullTop'), 0xff5a3c, 50, 0.8)], [0.6, (c) => { c.fx.hitPuff(c.rig.world('hullTop'), 2); c.fx.emit(() => c.fx.smoke(c.rig.world('deck'), 1, 0.7, 0x8d939a, 1.0, 0.3, 2.2), 7, 8, 'dmg' + c.i); }],
    [2.05, (c) => c.fx.bolt(HIT().setY(1.2), c.rig.world('hullTop'), 0xff5a3c, 50, 0.8)], [2.2, (c) => { c.fx.explosion(c.rig.world('hullTop'), 0.6); c.fx.emit(() => { const p = c.rig.world('deck'); c.fx.sprite({ p: p.add(c.fx.rv(0.3, 0, 0.3)), tex: 'glow', add: true, color: 0xff9a30, c1: 0xff3010, v: new THREE.Vector3(0, 1.6, 0), life: 0.5, s0: 0.5, s1: 0.15, a: 0.95, drag: 0.5, fadeIn: 0 }); if (Math.random() < 0.3) c.fx.light(p, 0xff7a20, 4, 0.12, 6); }, 26, 6, 'fire' + c.i); }],
    [3.65, (c) => c.fx.bolt(HIT().setY(1.2), c.rig.world('hullTop'), 0xff5a3c, 50, 0.8)], [3.8, (c) => { c.fx.explosion(c.rig.world('hullTop'), 1.6); c.fx.stop('dmg' + c.i); c.fx.emit(() => c.fx.smoke(c.rig.world('deck'), 1, 1.0, 0x2a2d31, 1.4, 0.4, 3), 9, 4.2, 'wreck' + c.i); }],
  ] },
];

// ---------- 💀 taken out kit (Action "Taken out", Combat/Team arenaPose; Conquest render.js uses the same timing) ----------
export const OUT_T = Object.freeze({ flinch: 0.12, fall: 0.65, drop: 0.25, lie: 3.65, fade: 4.35, knock: 0.75 });
const eIn2 = (x) => { x = clamp01(x); return x * x; };
const ON_BACK = TP({ fk: 1, lvl: 0, hlv: 0, py: -0.76, prx: -1.52, pz: 0, tL: -0.25, kL: 0.35, tR: 0.12, kR: 0.12, sL: 0.18, sR: 0.12, fpL: -0.6, fpR: -0.4,
  trx: -0.04, hrx: -0.15, hry: 0.5, arx: -0.4, ary: 0.2, apz: 0, lrx: -1.9, lrz: 0.5, rrx: -2.2, rrz: -0.6, wpn: 0 });
// d = seconds since the hit; from = the pose the unit was in. Knockback is along the unit's -z (it faces the shooter).
export function outPose(d, from = READY) {
  const FL = { ...from, trx: -0.55, hrx: -0.5, arx: from.arx - 0.4, prx: -0.15, py: from.py - 0.04, lrx: -0.5, rrx: -0.4 };
  const fk = seg(d, OUT_T.flinch, OUT_T.fall);
  const p = d < OUT_T.flinch ? mix(from, FL, eOut(d / OUT_T.flinch)) : mix(FL, ON_BACK, eIn2(fk));
  p.pz = d < OUT_T.flinch ? -0.1 * eOut(d / OUT_T.flinch) : -(0.1 + (OUT_T.knock - 0.1) * eOut(fk));
  if (d > OUT_T.fall) p.py += 0.035 * Math.max(0, wobble(d, OUT_T.fall, 3, 0.18)); // lands with a small bounce, then lies still
  p.wpn = d < OUT_T.drop ? 1 : 0;
  p.fade = d < OUT_T.lie ? 1 : 1 - sm(seg(d, OUT_T.lie, OUT_T.fade));
  return p;
}
const _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _s3 = new THREE.Vector3();
// the hand-held weapon detaches and tumbles to the ground beside the body (own material copies; fades with the body)
export function dropWeapon(c, life = OUT_T.fade - OUT_T.drop + 0.2) {
  const rig = c.rig, arms = rig.b.arms; if (!arms) return null;
  const parts = rig.meshes.filter((m) => m.name.startsWith('arms:')); if (!parts.length) return null;
  const box = new THREE.Box3(); for (const m of parts) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrix)); }
  const ctr = box.getCenter(new THREE.Vector3()), g = new THREE.Group();
  for (const m of parts) { const k = new THREE.Mesh(m.geometry, (m.userData.mat === 'team' ? rig.look.team : rig.look.visor).clone()); k.position.copy(m.position).sub(ctr); k.quaternion.copy(m.quaternion); k.castShadow = true; g.add(k); }
  arms.updateWorldMatrix(true, false); arms.matrixWorld.decompose(_v3, _q, _s3);
  const p0 = arms.localToWorld(ctr.clone()), yaw = rig.root.rotation.y;
  const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const p1 = rig.root.position.clone().addScaledVector(side, 0.75).addScaledVector(fwd, -0.5); p1.y = Math.max(0.04, (box.max.x - box.min.x) * 0.5 * _s3.x);
  g.scale.copy(_s3);
  const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + 1.1, Math.PI / 2, 'YXZ'));
  return c.fx.tween(g, p0, _q, p1, q1, 0.45, life, 0.25);
}

// ---------- 🎒 gear actions: the chosen sidearm / explosive / gadget doing what it does in Conquest (stats.js numbers) ----------
const GI = (f, i) => S.ITEMS.trooper[f][i] || S.ITEMS.trooper[f][0];
const DUMMY_FWD = () => STAGE.dummy.clone();
function propMat(c, o = {}) { return new THREE.MeshLambertMaterial({ color: c, ...o }); }
export function pistolMesh(id) {
  const g = new THREE.Group(), dark = id === 'commando-pistol' ? 0x3a3f2e : 0x2b2f35;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.05), propMat(dark)).translateY(-0.1));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.045, 0.1), propMat(0x1d2024)).translateY(-0.03).translateZ(-0.05));
  if (id === 'commando-pistol') g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.02), propMat(0xb8963a)).translateY(-0.16).translateZ(0.035));
  const mz = new THREE.Object3D(); mz.position.set(0, -0.21, 0.01); g.add(mz); g.userData.muzzle = mz; return g;
}
function pistolShot(c, s) {
  const gun = c.pistol; if (!gun) return;
  const mz = gun.userData.muzzle.getWorldPosition(new THREE.Vector3()), hit = HIT().add(c.fx.rv(0.25, 0.3, 0.1)), dir = hit.clone().sub(mz).normalize();
  c.fx.muzzle(mz, dir, c.bolt, 0.55); c.fx.bolt(mz, hit, c.bolt, 50, 0.4, (p) => c.stage.dummyHit(c, p, 0.25 + s.dmg / 40));
}
function sideAction(i) {
  const s = S.SIDEARMS[i] || S.SIDEARMS[0], it = GI('side', i), shots = []; for (let x = 1.3; x < 3.2; x += s.rof) shots.push(+x.toFixed(3));
  const EMPTY = { ...AIM, arx: 0.55, ary: 0.5, arz: -0.4, try: -0.06, hrx: 0.15 };             // rifle empty: lowered on the left arm
  const PIST = { ...EMPTY, rrx: -2.05, rrz: 0.18, rry: -0.1, hrx: 0.02, hry: -0.12, try: 0.12, trx: 0.03 };
  return { id: 'side', gear: 'side:' + it.id, ico: it.i, name: 'Pistol: ' + it.n, info: it.n + ': ' + S.GEAR_EFFECT.side(s), dur: 4.4, pose(t) {
    const p = keys(t, [[0, READY], [0.3, AIM, back], [0.55, AIM], [0.8, EMPTY], [1.1, PIST, back], [3.3, PIST], [3.65, EMPTY], [4.05, AIM], [4.4, READY]]);
    p.rrx += 0.22 * pulses(t, shots, 0.02, 0.1); p.hrx -= 0.03 * pulses(t, shots, 0.02, 0.1);
    return breathe(p, t, 0.6);
  }, ev: [[0.6, (c) => c.fx.sparks(c.rig.world('mag'), 3, 0xffffff, 0.6, 0.12)], // click: main weapon is reloading / empty
    [0.95, (c) => { c.rig.clearProps(); c.pistol = c.rig.attach(pistolMesh(it.id), 'handR'); }],
    ...shots.map((x) => [x, (c) => pistolShot(c, s)]),
    [3.6, (c) => { c.rig.clearProps(); c.pistol = null; }]] };
}
// explosives (Action id 'grenade' = the explosive slot)
const KNEEL_WORK = { ...CROUCH, arx: 0.7, ary: 0.5, rrx: -0.8, rrz: 0.15, trx: 0.35, hrx: 0.4 };
export function chargeMesh(color, led) {
  const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), propMat(color)).translateY(0.08));
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: led })); l.position.set(0.08, 0.18, 0); g.add(l); g.userData.led = l; return g;
}
function explAction(i) {
  const e = S.EXPLOSIVES[i] || S.EXPLOSIVES[0], it = GI('expl', i), info = it.n + ': ' + S.GEAR_EFFECT.expl[e.id](e), base = { id: 'grenade', gear: 'expl:' + it.id, ico: it.i, info };
  if (e.id === 'thermal') return { ...grenadeAct, ...base, name: 'Throw: ' + it.n };
  if (e.id === 'mines') return { ...base, name: 'Plant: ' + it.n, dur: 5.6, pose(t) {
    const r = route(t, [[0.1, 0.6, [0, 0], [0, 0.5]], [1.6, 2.1, [0, 0.5], [0, 1.5]], [3.3, 4.9, [0, 1.5], [0, 0]]]);
    const p = keys(t, [[0, READY], [0.65, READY], [0.9, KNEEL_WORK], [1.35, KNEEL_WORK], [1.55, READY], [2.15, READY], [2.4, KNEEL_WORK], [2.85, KNEEL_WORK], [3.05, READY], [5.6, READY]]);
    p.x = r.x; p.z = r.z; p.yaw = keys(t, [[3.2, { v: 0 }], [3.45, { v: Math.PI }], [4.8, { v: Math.PI }], [5.3, { v: 0 }]]).v;
    gait(p, r.dist, WALK, clamp01(r.v / 1.2)); return breathe(p, t, 1);
  }, ev: [[0.05, (c) => c.once && c.stage.clearMines()], [1.15, (c) => c.stage.dropMine(c)], [2.65, (c) => c.stage.dropMine(c)],
    [4.2, (c) => { if (c.once) for (const m of c.stage.mineSpots()) c.fx.ring(m, 0xff5a3c, e.splash * 0.5, 0.9); }]] };
  if (e.id === 'detpack') { const C = [0, STAGE.dummy.z - 0.9]; return { ...base, name: 'Place + set off: ' + it.n, dur: 7.2, pose(t) {
    const r = route(t, [[0.2, 1.7, [0, 0], [0, C[1] - 0.7]], [2.6, 4.2, [0, C[1] - 0.7], [0, 2.6]], [5.9, 6.9, [0, 2.6], [0, 0]]]);
    let p = keys(t, [[0, READY], [1.7, READY], [1.95, KNEEL_WORK], [2.4, KNEEL_WORK], [2.6, READY], [4.5, READY], [4.75, { ...READY, lrx: -1.35, lrz: -0.2, hrx: 0.05 }], [5.4, { ...READY, lrx: -1.35, lrz: -0.2 }], [5.7, READY], [7.2, READY]]);
    p.x = r.x; p.z = r.z; p.yaw = keys(t, [[2.5, { v: 0 }], [2.75, { v: Math.PI }], [4.15, { v: Math.PI }], [4.45, { v: 0 }]]).v;
    gait(p, r.dist, r.v > 2 ? RUN : WALK, clamp01(r.v / 2)); return breathe(p, t, 1);
  }, ev: [[2.15, (c) => { if (!c.once) return; const m = chargeMesh(0x8a5a2b, 0xff3a2a); m.position.set(0, 0, C[1]); c.stage.addProp(m, 4); c.det = m; }],
    [4.95, (c) => c.fx.sparks(c.rig.world('handL'), 4, 0xff6050, 1, 0.2)],
    [5.0, (c) => { if (!c.once) return; const p = new THREE.Vector3(0, 0.3, C[1]); if (c.det) c.stage.removeProp(c.det); c.det = null; c.fx.explosion(p, 1.4); c.stage.dummyHit(c, HIT(), 1 + e.dmg / 50); }]] }; }
  // time bomb: planted at an enemy post, a big blast after e.fuse seconds
  const F = [STAGE.flag.x + 0.7, STAGE.flag.z - 0.7], fuse = e.fuse, T0 = 2.3, dur = T0 + fuse + 1.4;
  return { ...base, name: 'Plant: ' + it.n, dur, pose(t) {
    const r = route(t, [[0.2, 1.9, [0, 0], F], [2.9, 4.6, F, [0, 0]]]);
    const p = keys(t, [[0, READY], [1.9, READY], [2.1, KNEEL_WORK], [2.65, KNEEL_WORK], [2.85, READY], [T0 + fuse - 0.3, READY], [T0 + fuse, { ...CROUCH, arx: 0.8, hrx: 0.2 }], [T0 + fuse + 0.8, { ...CROUCH, arx: 0.8 }], [dur, READY]]);
    p.x = r.x; p.z = r.z; p.yaw = keys(t, [[0, { v: 0 }], [0.25, { v: Math.atan2(F[0], F[1]) }], [2.8, { v: Math.atan2(F[0], F[1]) }], [3.05, { v: Math.atan2(-F[0], -F[1]) }], [4.5, { v: Math.atan2(-F[0], -F[1]) }], [4.9, { v: Math.atan2(F[0], F[1]) }]]).v;
    gait(p, r.dist, r.v > 2 ? RUN : WALK, clamp01(r.v / 2)); return breathe(p, t, 1);
  }, ev: [[0.05, (c) => c.once && c.stage.flagState('enemy', 0)],
    [T0, (c) => { if (!c.once) return; const m = chargeMesh(0x4a5058, 0xffd23a); m.position.set(STAGE.flag.x + 0.35, 0, STAGE.flag.z - 0.35); c.stage.addProp(m, (k) => 1.5 + 10 * k, T0, fuse); c.bomb = m; }],
    [T0 + fuse, (c) => { if (!c.once) return; if (c.bomb) c.stage.removeProp(c.bomb); c.bomb = null; c.fx.explosion(STAGE.flag.clone().setY(0.3), 1.8); c.fx.ring(STAGE.flag, 0xffd28a, e.splash, 0.7); c.stage.flagState('neutral', 0); }]] };
}
// gadgets
export function turretMesh() {
  const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.32, 10), propMat(0x5a6470)).translateY(0.16));
  const head = new THREE.Group(); head.position.y = 0.42; g.add(head);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), propMat(0xe9edf1)));
  head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6).rotateX(Math.PI / 2), propMat(0x2b2f35)).translateZ(0.3));
  const mz = new THREE.Object3D(); mz.position.set(0, 0, 0.52); head.add(mz); g.userData = { head, mz }; return g;
}
export function droidMesh() {
  const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), propMat(0xd7dde4)));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x6ff3ff })); eye.position.z = 0.13; g.add(eye);
  for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.06), propMat(0x5a6470)).translateX(s * 0.2));
  const mz = new THREE.Object3D(); mz.position.z = 0.18; g.add(mz); g.userData = { mz }; return g;
}
function propShot(c, mz, dmg, color) { const a = mz.getWorldPosition(new THREE.Vector3()), b = HIT().add(c.fx.rv(0.25, 0.3, 0.1)); c.fx.muzzle(a, b.clone().sub(a).normalize(), color, 0.5); c.fx.bolt(a, b, color, 50, 0.45, (p) => c.stage.dummyHit(c, p, 0.2 + dmg / 30)); }
function gadgetAction(i) {
  const g = S.GADGETS[i] || S.GADGETS[0], it = GI('gadget', i); if (g.id === 'none') return null;
  const info = it.n + ': ' + S.GEAR_EFFECT.gadget[g.id](g), base = { id: 'gadget', gear: 'gadget:' + it.id, ico: it.i, info, group: 'gear' };
  if (g.id === 'jetpack') return { ...SPECIAL.jet, ...base, name: 'Jetpack', same: 'jet' };
  if (g.id === 'fusion-cutter') return { ...SPECIAL.engineer, ...base, name: 'Fusion cutter: repair', same: 'engineer' };
  if (g.id === 'rally') return { ...SPECIAL.commander, ...base, name: 'Rally call', same: 'commander' };
  if (g.id === 'supply') return { ...TRAITS.supplier, ...base, name: 'Drop: Supply crate' };
  if (g.id === 'turret') { const shots = []; for (let x = 2.0; x < 6.2; x += g.rof) shots.push(+x.toFixed(3)); return { ...base, name: 'Deploy: Turret', dur: 7.2, pose(t) {
    const p = keys(t, [[0, READY], [0.5, KNEEL_WORK], [1.3, KNEEL_WORK], [1.6, READY], [1.9, AIM, back], [6.4, AIM], [6.9, READY], [7.2, READY]]);
    p.hry += 0.25 * sm(seg(t, 1.1, 1.4)) * (1 - sm(seg(t, 1.6, 1.9))); return breathe(p, t, 0.8);
  }, ev: [[0.95, (c) => { if (!c.once) return; const m = turretMesh(), r = c.rig.root; m.position.set(r.position.x + 0.9, 0, r.position.z + 0.8); m.scale.setScalar(0.01); c.stage.addProp(m); c.turret = m;
      const tgt = DUMMY_FWD(); let k = 0; c.fx.emit(() => { k = Math.min(1, k + 1 / 18); m.scale.setScalar(Math.max(0.01, back(k))); m.userData.head.rotation.y = Math.atan2(tgt.x - m.position.x, tgt.z - m.position.z) * sm(seg(k, 0.5, 1)); }, 30, 0.7);
      c.fx.smoke(m.position.clone(), 4, 0.5, 0xa89c88, 0.2, 0.5, 0.8); c.fx.ring(m.position, 0x6ff3ff, 1.2, 0.5); }],
    ...shots.map((x) => [x, (c) => c.once && c.turret && propShot(c, c.turret.userData.mz, g.dmg, 0xffb060)]),
    [7.0, (c) => { if (c.once && c.turret) { c.stage.removeProp(c.turret); c.turret = null; } }]] }; }
  // recon droid: flies along, zaps, and marks the target so the team aims better
  const shots = []; for (let x = 2.0; x < 5.4; x += g.rof) shots.push(+x.toFixed(3));
  return { ...base, name: 'Deploy: Recon droid', dur: 6.4, pose(t) {
    const p = keys(t, [[0, READY], [0.4, { ...READY, rrx: -1.2, rrz: 0.3, hry: 0.4, hrx: -0.2 }], [1.0, { ...READY, rrx: -1.9, rrz: 0.2, hrx: -0.35 }], [1.4, READY], [2.6, AIM, back], [5.6, AIM], [6.1, READY]]);
    recoil(p, t, [3.6], FIRE[0]); return breathe(p, t, 0.8);
  }, ev: [[0.7, (c) => { const m = droidMesh(), r = c.rig.root; c.stage.addProp(m); c.droid = m; const tgt = DUMMY_FWD(); let k = 0;
      c.fx.emit(() => { k += 1 / 30; const off = new THREE.Vector3(0.75, 1.9 + 0.08 * Math.sin(k * 5), 0.35).applyAxisAngle(new THREE.Vector3(0, 1, 0), r.rotation.y);
        const from = c.rig.world('back'), to = r.position.clone().add(off); m.position.lerpVectors(from, to, sm(k / 0.7)); m.lookAt(tgt.x, 1.2, tgt.z); }, 30, 5.6); }],
    ...shots.map((x) => [x, (c) => c.droid && propShot(c, c.droid.userData.mz, g.dmg, 0x6ff3ff)]),
    [2.4, (c) => { c.fx.ring(STAGE.dummy, 0x6ff3ff, 1.4, 0.9); c.fx.sprite({ p: HIT().setY(2.1), tex: 'glow', add: true, color: 0x6ff3ff, life: 0.8, s0: 0.2, s1: 0.6, a: 1, fadeIn: 0.1 }); }], // spotted: +aim for the team
    [3.6, (c) => fireShot(c, { ...FIRE[c.st.weapon === 1 ? 0 : c.st.weapon] || FIRE[0], shots: [0] })],
    [6.2, (c) => { if (c.droid) { c.stage.removeProp(c.droid); c.droid = null; } }]] };
}
export function gearActions(st) {
  const side = { ...sideAction(st.side | 0), group: 'gear' }, expl = { ...explAction(st.expl | 0), group: 'gear' }, gadget = gadgetAction(st.gadget | 0);
  return { side, expl, gadget };
}
export const GEAR_FIELDS_DEMO = ['side', 'expl', 'gadget'];

// ---------- public ----------
// class + trait defaults come from the ONE shared stats file (Conquest rule)
export const classOf = (st) => S.classOf('trooper', st);
export const CLASS_NAME = { trooper: 'Trooper', heavy: 'Heavy', sniper: 'Sniper', engineer: 'Engineer', commander: 'Commander', jet: 'Jet Trooper' };
export const CLASS_ICON = Object.fromEntries(Object.entries(S.CLASS_INFO).map(([k, v]) => [k, v.i]));
// Conquest Commander traits.js: TRAITS ids + CLASS_TRAIT defaults
export const TRAIT_LIST = ['rusher', 'cover', 'sniper', 'retaker', 'supplier', 'mines', 'guard'].map((id) => ({ id, ...TRAITS[id] }));
export const CLASS_TRAIT = S.CLASS_TRAIT;

export function actionsFor(kind, st) {
  if (kind === 'tank') return K_ACTIONS.map((a) => ({ ...a, group: 'act' }));
  const cls = classOf(st), sp = SPECIAL[cls];
  const list = T_ACTIONS.filter((a) => a.id !== 'grenade').map((a) => ({ ...a, group: 'act' }));
  // 🎒 the chosen gear, each with its real effect (stats.js numbers): sidearm, explosive (id 'grenade'), gadget
  const g = gearActions(st), special = { id: 'special', ...sp, group: 'special', cls };
  if (g.gadget && g.gadget.same === cls) { special.gear = g.gadget.gear; special.info = g.gadget.info; g.gadget = null; } // class special = this gadget
  list.push(g.side, g.expl); if (g.gadget) list.push(g.gadget);
  list.push(special);
  return list;
}
export const traitAction = (id) => ({ id: 'trait-' + id, ...TRAITS[id], group: 'trait', trait: id });
export const eventsOf = (a, c) => (a.evFor ? a.evFor(c) : a.ev || []);
export { TP, KP };

// ---------- arena pose kit (combat.html / team.html): one blended pose from a unit's live state ----------
// o: { t, aim 0..1, crouch 0..1, move 0..1, dist (m walked), run, shot (s since shot), fire (FIRE profile), hit (s since hit), reload 0..1, down (s since down), win (s) }
const ACT = (id) => T_ACTIONS.find((a) => a.id === id);
export const FIRE_PROFILES = FIRE;
let SIDE_POSE = null;
export function arenaPose(o) {
  if (o.win != null) return ACT('victory').pose(o.win % 4);
  const aim = o.aim || 0, cr = o.crouch || 0;
  let p = mix(mix(READY, AIM, aim), mix(CROUCH, CROUCH_AIM, aim), cr);
  breathe(p, o.t, 1);
  if (o.reload != null) p = mix(p, ACT('reload').pose(Math.min(3.3, o.reload * 3.4)), 0.9);
  if (o.move > 0.01) gait(p, o.dist, o.run ? RUN : WALK, o.move * (1 - cr * 0.6));
  if (o.shot != null && o.shot < 0.6) recoil(p, o.shot, [0], o.fire || FIRE[0]);
  if (o.hit != null && o.hit < 1.4) { const k = o.hit < 0.7 ? 1 : 1 - sm((o.hit - 0.7) / 0.7); p = mix(p, ACT('hit').pose(Math.min(1.6, 0.55 + o.hit)), k * 0.75); }
  if (o.side != null) p = mix(p, (SIDE_POSE ||= sideAction(0).pose(1.6)), Math.min(1, o.side * 6) * 0.9); // 🔸 sidearm while the main weapon reloads
  if (o.down != null) p = outPose(o.down, p);
  return p;
}
export function arenaTankPose(o) { // o: { t, turret (rad, hull-relative), move 0..1, shot, hit, wreck }
  const p = KP({ ty: o.turret || 0 });
  if (o.shot != null) { const k = pulse(o.shot, 0, 0.02, 0.16); p.tpz = -0.22 * k; p.hrx = -0.05 * k; }
  if (o.move > 0.01) { p.hy = 0.015 * Math.sin(o.t * 22) * o.move; p.hrx += 0.01 * Math.sin(o.t * 9) * o.move; }
  if (o.hit != null) p.hrz = 0.05 * wobble(o.hit, 0, 3, 0.4);
  p.wreck = o.wreck ? 1 : 0; if (o.wreck) { p.trz = 0.3; p.trx = -0.12; p.hy = -0.06; }
  return p;
}
