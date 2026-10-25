// Trooper Customizer · 🎬 Demo Viewer: watch a saved look (trooper or tank) perform actions on a small stage.
// Reads the shared army save ('botcampus:army', games/shared/army/) — unit traits + real stats come from there.
// Models come from the customizer's own builders (trooper.js / tank.js) through demo-rig.js, so they look identical.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/addons/controls/OrbitControls.js?v=6';
import * as T from './trooper.js?v=7';
import { TANK_FIELDS, TANK_DEFAULT } from './tank.js?v=7';
import { RigTemplate, Rig } from './demo-rig.js?v=8';
import { FX } from './demo-fx.js?v=8';
import { loadArmyData, pickEntry, ARMY_KEY, S as Stats } from './army-data.js?v=8';
import { pageChrome, setBtn } from './page-chrome.js?v=1';
import { STAGE, actionsFor, traitAction, TRAIT_LIST, CLASS_TRAIT, classOf, CLASS_NAME, CLASS_ICON, eventsOf } from './demo-actions.js?v=8';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'style') e.style.cssText = v; else if (k in e) e[k] = v; else e.setAttribute(k, v); }
  for (const c of [].concat(kids)) if (c != null) e.append(c);
  return e;
};
const clean = (x, max = 24) => String(x ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const params = new URLSearchParams(location.search);

// ---------- data: the army save (botcampus:army) ----------
let data = loadArmyData();
const pickStart = () => pickEntry(data, params);

// ---------- renderer + scene ----------
const app = $('#app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1029); scene.fog = new THREE.Fog(0x0b1029, 22, 48);
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x30343c, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(5, 9, 6); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 40 }); key.shadow.bias = -0.0008; key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x8fb4ff, 1.0); rim.position.set(-4, 3, -5); scene.add(rim);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 120);
const scopeCam = new THREE.PerspectiveCamera(9, 1, 0.05, 120);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.1; controls.enablePan = false; controls.minDistance = 1.6; controls.maxDistance = 40; controls.maxPolarAngle = Math.PI * 0.495; controls.target.set(0, 0.95, 0);

// ---------- stage: ground, cover wall, target dummy, flag (+ props for some actions) ----------
function canvasTex(w, hgt, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = hgt; draw(c.getContext('2d'), w, hgt); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; } return t; }
const stage = new THREE.Group(); scene.add(stage);
{
  const tex = canvasTex(128, 128, (x, w) => { x.fillStyle = '#2a313d'; x.fillRect(0, 0, w, w); x.fillStyle = '#323a48'; x.fillRect(3, 3, 60, 60); x.fillRect(67, 67, 58, 58); x.fillStyle = '#2e3542'; x.fillRect(67, 3, 58, 60); x.fillRect(3, 67, 60, 58); x.strokeStyle = 'rgba(120,170,255,.18)'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, w - 2); }, 30);
  const g = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex })); g.receiveShadow = true; g.name = 'ground'; stage.add(g);
  const pad = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6ff3ff, transparent: true, opacity: 0.35 })); pad.position.y = 0.01; stage.add(pad);
}
const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
const wall = new THREE.Group(); wall.name = 'wall';
{
  const [w, hh, d] = STAGE.wallSize;
  const concrete = mat(0x7d828a), dark = mat(0x5a5f67), stripe = mat(0xf1c40f);
  wall.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, hh - 0.12, d), concrete)).translateY((hh - 0.12) / 2));
  wall.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.12, d + 0.08), dark)).translateY(hh - 0.06));
  for (let i = 0; i < 5; i++) wall.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.01), stripe).translateX(-w / 2 + 0.4 + i * 0.65).translateY(hh * 0.5).translateZ(d / 2 + 0.006));
  wall.position.copy(STAGE.wall); stage.add(wall);
}
const dummy = new THREE.Group(); dummy.name = 'dummy';
const dummyBody = new THREE.Group(); dummy.add(dummyBody);
{
  const wood = mat(0x8a6a48), tgt = canvasTex(64, 64, (x) => { for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#f4f6f8' : '#d43c2c'; x.beginPath(); x.arc(32, 32, 30 - i * 7.5, 0, 7); x.fill(); } });
  dummy.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.12, 12), mat(0x4a4f57))).translateY(0.06));
  dummyBody.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), wood)).translateY(0.5));
  dummyBody.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.62, 8), mat(0xc9b48a))).translateY(1.2));
  dummyBody.add(shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(0xc9b48a))).translateY(1.68));
  dummyBody.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), wood)).translateY(1.38));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), new THREE.MeshLambertMaterial({ map: tgt })); disc.position.set(0, 1.24, -0.245); disc.rotation.y = Math.PI; dummyBody.add(disc);
  dummy.position.copy(STAGE.dummy); stage.add(dummy);
}
const flag = new THREE.Group(); flag.name = 'flag';
let flagTex, flagCloth, flagMode = 'ours', flagRaise = { from: 2.3, to: 2.3, t: 1, dur: 1 };
{
  flag.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 3.0, 6), mat(0xb8c0c8))).translateY(1.5));
  flag.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.12, 10), mat(0x4a4f57))).translateY(0.06));
  flag.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xffd65a)).translateY(3.02));
  const c = document.createElement('canvas'); c.width = 128; c.height = 84; flagTex = new THREE.CanvasTexture(c); flagTex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.PlaneGeometry(1.1, 0.72, 12, 4); g.translate(0.55 + 0.04, 0, 0);
  flagCloth = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide })); flagCloth.castShadow = true; flagCloth.position.y = 2.3; flagCloth.userData.base = g.attributes.position.array.slice();
  flag.add(flagCloth); flag.position.copy(STAGE.flag); flag.rotation.y = -0.6; stage.add(flag);
}
function paintFlag(mode) {
  const c = flagTex.image, x = c.getContext('2d'), n = cur ? cur.nat : T.NATION_DEFAULT;
  if (mode === 'ours') { x.fillStyle = n.s; x.fillRect(0, 0, 128, 84); x.strokeStyle = n.p; x.lineWidth = 8; x.strokeRect(4, 4, 120, 76); T.drawSymbol(x, n.sym, 64, 42, 28, T.symbolColor(n)); }
  else if (mode === 'enemy') { x.fillStyle = '#7a1d16'; x.fillRect(0, 0, 128, 84); x.strokeStyle = '#1b1f24'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 76); T.drawSymbol(x, 3, 64, 42, 28, '#f4f6f8'); }
  else { x.fillStyle = '#8b939c'; x.fillRect(0, 0, 128, 84); x.fillStyle = '#e8edf2'; x.font = 'bold 50px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 64, 45); }
  flagTex.needsUpdate = true; flagMode = mode;
}
// props: generator (engineer repair), supply crate, mines
const gen = new THREE.Group(); gen.visible = false; gen.position.set(-1.6, 0, 1.8); stage.add(gen);
const genLight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.02), new THREE.MeshBasicMaterial({ color: 0xff4a3a }));
{
  gen.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), mat(0x5a6470))).translateY(0.3));
  gen.add(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), mat(0x3b4047))).translateY(0.85).translateX(0.25));
  genLight.position.set(-0.2, 0.45, -0.31); gen.add(genLight); gen.rotation.y = Math.PI;
}
const crate = new THREE.Group(); crate.visible = false; stage.add(crate);
{
  crate.add(shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.4), mat(0xe9edf1))).translateY(0.17));
  crate.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.41), new THREE.MeshBasicMaterial({ color: 0x27ae60 })).translateY(0.2));
  crate.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.41), new THREE.MeshBasicMaterial({ color: 0x27ae60 })).translateY(0.2));
}
let mines = [], props = [];
const mineGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.06, 10), mineMat = mat(0x3b4047), mineLed = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
let dummySpring = { a: 0, v: 0, b: 0, w: 0 }, genSmoke = null;
const stageApi = {
  dummyHit(c, p, k = 1) { if (!c.once && c.squad && Math.random() < 0.5) k *= 0.5; dummySpring.v += 2.2 * k; dummySpring.w += (Math.random() - 0.5) * 3 * k; fx.hitPuff(p, Math.min(2, k)); },
  showProp(name, on, c) {
    if (name === 'gen') { gen.visible = on; genLight.material.color.set(0xff4a3a); fx.stop('gen'); if (on) fx.emit(() => { fx.smoke(new THREE.Vector3(-1.45, 1.0, 1.8), 1, 0.4, 0x6d7278, 0.6, 0.15, 1.6); if (Math.random() < 0.3) fx.sparks(new THREE.Vector3(-1.75, 0.6, 1.5), 3, 0xffd27a, 1.5, 0.3); }, 6, 99, 'gen'); }
    if (name === 'crate') { crate.visible = on; if (on && c) { const p = c.rig.world('handR'); crate.position.set(p.x, 0, p.z); crate.rotation.y = c.rig.root.rotation.y; fx.smoke(crate.position.clone(), 3, 0.4, 0xa89c88, 0.2, 0.5, 0.8); } }
  },
  repairProp() { fx.stop('gen'); genLight.material.color.set(0x5dff7a); fx.ring(gen.position, 0x5dff7a, 1.8, 0.6); fx.sparks(new THREE.Vector3(-1.6, 0.8, 1.8), 14, 0x5dff7a, 2.5, 0.6); },
  flagState(mode, raise) {
    paintFlag(mode === 'ours' && raise ? flagMode : mode);
    if (raise) { flagRaise = { from: 0.7, to: 2.3, t: 0, dur: raise, mode }; } else { flagRaise = { from: 2.3, to: 2.3, t: 1, dur: 1 }; flagCloth.position.y = 2.3; }
  },
  clearMines() { for (const m of mines) stage.remove(m); mines = []; },
  dropMine(c) {
    const p = c.rig.world('handR'); const m = new THREE.Group();
    m.add(shadowy(new THREE.Mesh(mineGeo, mineMat)).translateY(0.03)); const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), mineLed); led.position.y = 0.07; m.add(led);
    m.position.set(p.x, 0, p.z); stage.add(m); mines.push(m); fx.sparks(m.position.clone().setY(0.1), 4, 0xff6050, 1, 0.2);
  },
  mineSpots() { return mines.map((m) => m.position.clone()); },
  // action props (turret, droid, charges): blink = Hz or fn(k of fuse) → Hz for the red/yellow LED
  addProp(obj, blink = 0, t0 = 0, fuse = 1) { obj.traverse((m) => { if (m.isMesh) m.castShadow = true; }); obj.userData.blink = blink; obj.userData.age = 0; obj.userData.fuse = fuse; stage.add(obj); props.push(obj); return obj; },
  removeProp(obj) { const i = props.indexOf(obj); if (i < 0) return; props.splice(i, 1); stage.remove(obj); obj.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } }); },
  clearProps() { for (const o of [...props]) this.removeProp(o); },
  reset() { this.clearMines(); this.clearProps(); gen.visible = false; crate.visible = false; fx.stop('gen'); paintFlag('ours'); flagRaise = { from: 2.3, to: 2.3, t: 1, dur: 1 }; flagCloth.position.y = 2.3; },
};
function updateStage(dt, time) {
  // dummy: damped spring wobble (no health bars)
  const s = dummySpring; s.v += (-60 * s.a - 5 * s.v) * dt; s.a += s.v * dt; s.w += (-60 * s.b - 5 * s.w) * dt; s.b += s.w * dt;
  s.a = Math.max(-0.6, Math.min(0.6, s.a)); dummyBody.rotation.set(s.a * 0.8, 0, s.b * 0.5);
  // flag wave + raise
  const pos = flagCloth.geometry.attributes.position, b = flagCloth.userData.base;
  for (let i = 0; i < pos.count; i++) { const x = b[i * 3]; pos.array[i * 3 + 2] = Math.sin(x * 4.5 - time * 5) * 0.07 * x + Math.sin(x * 2 - time * 3) * 0.03 * x; }
  pos.needsUpdate = true; flagCloth.geometry.computeVertexNormals();
  if (flagRaise.t < 1) { flagRaise.t = Math.min(1, flagRaise.t + dt / flagRaise.dur); const k = flagRaise.t;
    if (k < 0.5) flagCloth.position.y = 2.3 + (flagRaise.from - 2.3) * (k * 2); else { if (flagMode !== flagRaise.mode) paintFlag(flagRaise.mode); flagCloth.position.y = flagRaise.from + (2.3 - flagRaise.from) * ((k - 0.5) * 2); } }
  for (const m of mines) m.children[1].visible = (time * 2 % 1) < 0.5;
  for (const o of props) { const u = o.userData; u.age += dt; if (!u.blink || !u.led) continue; const hz = typeof u.blink === 'function' ? u.blink(Math.min(1, u.age / u.fuse)) : u.blink; u.ph = (u.ph || 0) + dt * hz; u.led.visible = u.ph % 1 < 0.5; }
}

// ---------- unit + squad ----------
const fx = new FX(scene);
const wreckMat = new THREE.MeshLambertMaterial({ color: 0x2a2c30, flatShading: true });
let cur = null, tpl = null, look = null, rigs = [], actions = [], act = null, sel = { trait: '' };
const S = { t: 0, speed: 1, playing: true, mode: 'loop', squad: false, cam: 'front', seqIdx: 0, seqDone: false };
const SQUAD = { trooper: [[0, 0], [-0.85, -0.8], [0.85, -0.8], [0, -1.6]], tank: [[0, 0], [-3.4, -3.6], [3.4, -3.6], [0, -7.2]] };
const OFFS = { trooper: 0.12, tank: 0.2 };

function stateFor(e) { return { ...T.NATION_DEFAULT, ...e.nat, skin: e.kind === 'trooper' ? e.st.skin : 1, ...e.st }; }
function selectUnit(e) {
  if (!e) return;
  for (const r of rigs) { r.clearProps(); r.disposeFade(); scene.remove(r.root); }
  if (tpl) tpl.dispose(); if (look) { look.tex.dispose(); look.team.dispose(); look.visor.dispose(); }
  cur = e; look = new T.TeamLook(); look.paint(stateFor(e)); tpl = new RigTemplate(e.kind, e.st);
  actions = actionsFor(e.kind, e.st);
  rigs = [];
  buildRigs(); paintFlag('ours');
  renderUnits(); renderActions(); renderWho();
  const keep = act && actions.find((a) => a.id === act.id);
  play(keep ? keep.id : 'idle', true);
  setCam(S.cam, true);
  const u = new URL(location.href); const from = u.searchParams.get('from'); u.search = ''; u.searchParams.set('unit', e.id); if (from) u.searchParams.set('from', from);
  history.replaceState(null, '', u);
}
function buildRigs() {
  for (const r of rigs) { r.clearProps(); r.disposeFade(); scene.remove(r.root); }
  rigs = []; const n = S.squad ? 4 : 1;
  for (let i = 0; i < n; i++) {
    const r = new Rig(tpl, look); r.wreckMat = wreckMat; const o = SQUAD[cur.kind][i]; r.off.set(o[0], 0, o[1]);
    r.ctx = { rig: r, i, once: i === 0, squad: n > 1, st: cur.st, nat: cur.nat, fx, stage: stageApi, bolt: new THREE.Color(T.VISOR[cur.nat.vis] || '#5ee8ff').getHex(), t: 0 };
    r.lt = 0; r.cyc = -1; r.blend = null; r.raw = null; scene.add(r.root); rigs.push(r);
  }
}
function finish(p, kind) {
  if (kind !== 'trooper') return p;
  const o = { ...p }, lean = p.prx + p.trx; o.arx = p.arx - lean * (p.lvl ?? 1); o.hrx = p.hrx - lean * (p.hlv ?? 0.85); return o;
}
function mixPose(a, b, k) { const o = {}; for (const key in b) { const x = a[key] ?? b[key]; if (key === 'yaw' || key === 'ty') { let d = (b[key] - x) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; o[key] = x + d * k; } else o[key] = x + (b[key] - x) * k; } return o; }
function play(id, quiet) {
  const a = id.startsWith('trait-') ? traitAction(id.slice(6)) : actions.find((x) => x.id === id);
  if (!a) return false;
  act = a; S.t = 0; fx.emitters = []; stageApi.reset(); scopeOn(false);
  for (const r of rigs) { r.clearProps(); r.blend = r.raw ? { from: r.raw, t: 0 } : null; r.cyc = -1; r.lt = 0; r.events = eventsOf(a, r.ctx).slice().sort((x, y) => x[0] - y[0]); if (r.kind === 'tank') r.setWreck(false, wreckMat), r._wreck = 0; }
  for (const b of document.querySelectorAll('#acts button, #traits button')) b.classList.toggle('on', b.dataset.id === id);
  $('#nowIco').textContent = a.ico; $('#nowName').textContent = a.name; $('#nowInfo').textContent = a.info || '';
  if (!quiet) { const nb = $('#nowbar'); nb.classList.remove('pop'); void nb.offsetWidth; nb.classList.add('pop'); }
  return true;
}
const SEQ = () => [...actions.map((a) => a.id), ...(cur.kind === 'trooper' ? TRAIT_LIST.map((t) => 'trait-' + t.id) : [])];
// stats show in motion: walk / run / crawl / drive / reverse play at the unit's real speed (vs the basic unit)
const MOVE_IDS = new Set(['walk', 'run', 'prone', 'drive', 'reverse', 'trait-rusher', 'trait-retaker']);
const moveRate = () => (cur && MOVE_IDS.has(act.id) ? Math.max(0.45, Math.min(1.6, cur.stats.speed / (cur.kind === 'tank' ? 2.7 : 4.5))) : 1);
function tick(dt) {
  if (!act) return;
  const sdt = S.playing ? dt * S.speed * moveRate() : 0; S.t += sdt;
  const off = OFFS[cur.kind], dur = act.dur, lastEnd = dur + off * (rigs.length - 1) + 0.5;
  if (S.mode === 'all' && S.t > lastEnd) { const q = SEQ(); S.seqIdx = (q.indexOf(act.id) + 1) % q.length; play(q[S.seqIdx]); return; }
  for (const r of rigs) {
    const lt = Math.max(0, S.t - r.ctx.i * off);
    const cyc = S.mode === 'loop' ? Math.floor(lt / dur) : 0, local = S.mode === 'loop' ? lt - cyc * dur : Math.min(lt, dur);
    r.ctx.t = local;
    let raw = act.pose(local, r.ctx);
    if (r.blend) { r.blend.t += sdt; const k = Math.min(1, r.blend.t / 0.3); raw = mixPose(r.blend.from, raw, k * k * (3 - 2 * k)); if (k >= 1) r.blend = null; }
    r.raw = raw; r.apply(finish(raw, cur.kind)); r.root.updateMatrixWorld(true);
    // events (fire once per cycle, also when a frame jumps past them)
    if (S.playing && lt > 0) {
      if (cyc !== r.cyc) { if (r.cyc >= 0) { for (const [et, fn] of r.events) if (et > r.lt) fn(r.ctx); if (r.ctx.once) stageApi.reset(); r.clearProps(); if (cur.kind === 'tank') { fx.stop('fire' + r.ctx.i); fx.stop('wreck' + r.ctx.i); } r.blend = { from: r.raw, t: 0 }; } r.cyc = cyc; r.lt = -1e-6; }
      for (const [et, fn] of r.events) if (et > r.lt && et <= local) fn(r.ctx);
      r.lt = local;
    }
  }
  const prog = Math.min(1, (S.mode === 'loop' ? (S.t % dur) : S.t) / dur); $('#nowProg').style.transform = `scaleX(${prog})`;
  // sniper scope view
  const L = rigs[0];
  if (act.scope && L) scopeOn(L.ctx.t >= act.scope[0] && L.ctx.t <= act.scope[1]);
}
// ---------- camera ----------
const CAMS = { front: [0.62, 0.3, 1], side: [1, 0.22, 0.12], top: [0.02, 1, 0.42], follow: [0.55, 0.45, -1] };
const camTarget = new THREE.Vector3(0, 0.95, 0), _c = new THREE.Vector3();
function unitFocus(out) {
  if (!rigs.length) return out.set(0, 0.95, 0);
  out.set(0, 0, 0); for (const r of rigs) out.add(r.root.position); out.multiplyScalar(1 / rigs.length);
  out.y = cur.kind === 'tank' ? 1.0 : 0.85 + rigs[0].root.position.y * 0.6; return out;
}
function setCam(name, snap) {
  S.cam = name; const big = cur && cur.kind === 'tank' ? 2.1 : 1, dist = (name === 'top' ? 9 : name === 'follow' ? 4.2 : 5.6) * big * (S.squad ? 1.35 : 1);
  unitFocus(camTarget); const d = new THREE.Vector3(...CAMS[name]).normalize();
  if (cur && cur.kind === 'tank' && name !== 'follow') d.x *= -1; // tanks drive a loop on the left; view from the open side
  if (name === 'follow' && rigs[0]) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), rigs[0].root.rotation.y);
  camGoal = { pos: camTarget.clone().addScaledVector(d, dist), t: snap ? 1 : 0 };
  if (snap) { controls.target.copy(camTarget); camera.position.copy(camGoal.pos); }
  for (const b of document.querySelectorAll('#cambar button')) b.classList.toggle('on', b.dataset.cam === name);
}
let camGoal = null;
function updateCam(dt) {
  unitFocus(_c);
  const k = 1 - Math.exp(-dt * (S.cam === 'follow' ? 5 : 2.5)), delta = _c.clone().sub(controls.target).multiplyScalar(k);
  if (S.cam !== 'top' || cur.kind === 'tank' || true) { controls.target.add(delta); camera.position.add(delta); }
  if (S.cam === 'follow' && rigs[0] && !dragging) { // chase cam: swing behind the unit's heading
    const big = cur.kind === 'tank' ? 2.1 : 1, d = new THREE.Vector3(...CAMS.follow).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), rigs[0].root.rotation.y);
    const want = controls.target.clone().addScaledVector(d, 4.2 * big * (S.squad ? 1.35 : 1)); camera.position.lerp(want, 1 - Math.exp(-dt * 2.5));
  }
  if (camGoal && camGoal.t < 1) { camGoal.t = Math.min(1, camGoal.t + dt * 2.2); const g = camGoal.pos.clone().add(controls.target).sub(camTarget); camera.position.lerp(g, camGoal.t < 1 ? 0.18 : 1); }
}
let dragging = false;
controls.addEventListener('start', () => { dragging = true; if (camGoal) camGoal.t = 1; });
controls.addEventListener('end', () => { dragging = false; });
function scopeOn(on) {
  if (S.scope === on) return; S.scope = on; $('#scope').classList.toggle('hidden', !on);
}
function updateScope() {
  const L = rigs[0]; if (!L) return;
  const eye = L.world('scope').add(new THREE.Vector3(0, 0.05, -0.25).applyQuaternion(L.root.quaternion));
  scopeCam.position.copy(eye); scopeCam.lookAt(STAGE.dummy.x + Math.sin(S.t * 1.3) * 0.05, 1.25 + Math.sin(S.t * 0.9) * 0.04, STAGE.dummy.z);
}

// ---------- UI ----------
const SVG = {
  front: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="3"/><path d="M7 10h10l-1 7h-2l-.5 5h-3l-.5-5H8z"/></svg>',
  side: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="3"/><path d="M10 10h4.5l.5 7h-1.5l-.5 5h-3l.3-5H9z"/><path d="M14 12h7v2h-7z"/></svg>',
};
function renderWho() {
  const cls = cur.kind === 'trooper' ? classOf(cur.st) : null;
  $('#whoIco').textContent = cur.icon; $('#whoName').textContent = cur.name;
  $('#whoTag').textContent = cur.kind === 'tank' ? '🚜' : CLASS_ICON[cls];
  $('#whoTag').title = cur.kind === 'tank' ? 'Tank' : CLASS_NAME[cls];
  const fl = $('#whoFlag'); drawFlagMini(fl, cur.nat);
  const c = cur.stats, sp = (c.speed).toFixed(1);
  // labelled battle stats (same numbers as Conquest): icon + value + word, so a phone needs no hover
  const stat = (i, v, w) => h('span', { className: 'st' }, [h('b', { textContent: i + v }), h('i', { textContent: w })]);
  $('#statline').replaceChildren(stat('❤️', Math.round(c.hp), 'Health'), stat('🏃', sp, 'Speed'), stat('💥', +c.dmg.toFixed(1), 'Damage'), stat('📏', c.range + ' m', 'Range'), stat('⏱️', c.rof + ' s', 'Reload'), ...(c.splash ? [stat('💫', c.splash + ' m', 'Blast')] : []));
  $('#statline').title = `Battle stats · 👤 ${cur.nat.player} · 🏳️ ${cur.nat.name}`;
  $('#whoName').title = `${cur.name} · 👤 ${cur.nat.player} · 🏳️ ${cur.nat.name}`;
}
function drawFlagMini(c, n) { const x = c.getContext('2d'); x.fillStyle = n.s; x.fillRect(0, 0, 32, 32); x.strokeStyle = n.p; x.lineWidth = 4; x.strokeRect(2, 2, 28, 28); T.drawSymbol(x, n.sym, 16, 16, 10, T.symbolColor(n)); }
function renderUnits() {
  const box = $('#units'); box.replaceChildren();
  let lastNat = null;
  for (const e of data.entries) {
    if (e.nat.id !== lastNat && data.players.length > 1) { const c = h('canvas', { width: 32, height: 32, className: 'nflag', title: e.nat.name }); drawFlagMini(c, e.nat); box.append(c); }
    lastNat = e.nat.id;
    const vis = e.thumb ? h('img', { src: e.thumb, alt: '' }) : h('span', { className: 'ico', textContent: e.icon });
    const tag = e.kind === 'tank' ? '🚜' : CLASS_ICON[classOf(e.st)];
    const b = h('button', { type: 'button', className: 'unit' + (cur && e.key === cur.key ? ' on' : ''), title: e.name, 'aria-label': e.name, 'data-key': e.key }, [vis, h('i', { textContent: e.name }), h('em', { textContent: tag })]);
    b.addEventListener('click', () => selectUnit(e));
    box.append(b);
  }
  const on = box.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function actBtn(a, extra = '') {
  const b = h('button', { type: 'button', className: 'act ' + extra, title: a.info || a.name, 'aria-label': a.name, 'data-id': a.id, ...(a.gear ? { 'data-gear': a.gear } : {}) }, [h('span', { className: 'ico', textContent: a.ico }), h('i', { textContent: a.name })]);
  b.addEventListener('click', () => { if (S.mode === 'all') setMode('loop'); play(a.id); });
  return b;
}
function renderActions() {
  const box = $('#acts'); box.replaceChildren(...actions.map((a) => actBtn(a, a.group === 'special' ? 'special' : a.group === 'gear' ? 'gear' : '')));
  const tb = $('#traits'), tl = $('#traitLab');
  if (cur.kind !== 'trooper') { tb.replaceChildren(); tb.classList.add('hidden'); tl.classList.add('hidden'); return; }
  tb.classList.remove('hidden'); tl.classList.remove('hidden');
  const mine = cur.trait || CLASS_TRAIT[classOf(cur.st)];
  tb.replaceChildren(...TRAIT_LIST.map((t) => { const b = actBtn({ ...t, id: 'trait-' + t.id }, t.id === mine ? 'mine' : ''); if (t.id === mine) b.append(h('b', { className: 'star', textContent: cur.trait ? '⭐' : '☆', title: cur.trait ? 'Trait picked in Conquest Commander' : 'Class default trait' })); return b; }));
}
function setMode(m) { S.mode = m; const b = $('#modeBtn'); setBtn(b, m === 'loop' ? '🔁' : '⏭️', m === 'loop' ? 'Loop' : 'Play all'); b.title = m === 'loop' ? 'Loop this action' : 'Play all actions'; b.classList.toggle('on', m === 'all'); if (m === 'all') { S.t = 0; play(SEQ()[0]); } }
function setSpeed(v) { S.speed = v; const b = $('#speedBtn'); b.querySelector('i').textContent = v === 1 ? 'Speed 1x' : 'Speed ¼x'; b.querySelector('span').textContent = v === 1 ? '🐇' : '🐢'; b.classList.toggle('on', v !== 1); }
function setSquad(on) { S.squad = on; $('#squadBtn').classList.toggle('on', on); if (cur) { const id = act && act.id; buildRigs(); play(id || 'idle', true); setCam(S.cam); } }
function setPlaying(on) { S.playing = on; setBtn($('#playBtn'), on ? '⏸️' : '▶️', on ? 'Pause' : 'Play'); }
$('#playBtn').addEventListener('click', () => setPlaying(!S.playing));
$('#modeBtn').addEventListener('click', () => setMode(S.mode === 'loop' ? 'all' : 'loop'));
$('#speedBtn').addEventListener('click', () => setSpeed(S.speed === 1 ? 0.25 : 1));
$('#squadBtn').addEventListener('click', () => setSquad(!S.squad));
for (const b of document.querySelectorAll('#cambar button')) { if (SVG[b.dataset.cam]) b.innerHTML = SVG[b.dataset.cam]; b.addEventListener('click', () => setCam(b.dataset.cam)); }
setBtn($('#playBtn'), '⏸️', 'Pause'); setBtn($('#modeBtn'), '🔁', 'Loop'); setBtn($('#squadBtn'), '👥', 'Squad'); $('#speedBtn i').textContent = 'Speed 1x';
pageChrome('🎬 Actions');

// ---------- loop ----------
function resize() {
  const r = app.getBoundingClientRect(), w = Math.max(1, r.width), hh = Math.max(1, r.height);
  renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); scopeCam.aspect = w / hh; scopeCam.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(app); addEventListener('resize', resize);
const clock = new THREE.Clock(); let time = 0, fps = 0, fpsN = 0, fpsT = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta()); time += dt;
  tick(dt);
  const sdt = S.playing ? dt * S.speed : 0;
  fx.update(sdt, camera); updateStage(sdt, time * (S.playing ? S.speed : 0) + 0);
  updateCam(dt); controls.update();
  if (S.scope) { updateScope(); renderer.render(scene, scopeCam); } else renderer.render(scene, camera);
  fpsN++; fpsT += dt; if (fpsT > 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
});

selectUnit(pickStart());
resize();
// localStorage changes from the customizer in another tab
addEventListener('storage', (e) => { if (e.key === ARMY_KEY) { const k = cur && cur.key; data = loadArmyData(); selectUnit(data.entries.find((x) => x.key === k) || pickStart()); } });

// ---------- test hooks ----------
window.__demo = {
  get state() { return { unit: cur && cur.key, kind: cur && cur.kind, action: act && act.id, t: S.t, speed: S.speed, squad: S.squad, mode: S.mode, cam: S.cam, playing: S.playing, rigs: rigs.length, scope: !!S.scope, fx: fx.count, fps, tris: tpl ? tpl.tris : 0, armsSplit: tpl ? tpl.armsSplit : null, dur: act && act.dur, evs: rigs[0] && rigs[0].events ? rigs[0].events.map((e) => e[0]) : [], wreck: !!(rigs[0] && rigs[0]._wreck), flag: flagMode } },
  units: () => data.entries.map((e) => ({ key: e.key, kind: e.kind, name: e.name, cls: e.kind === 'trooper' ? classOf(e.st) : 'tank', trait: e.trait })),
  actions: () => actions.map((a) => ({ id: a.id, ico: a.ico, name: a.name, dur: a.dur, group: a.group, gear: a.gear || null, info: a.info || '' })),
  traits: () => (cur && cur.kind === 'trooper' ? TRAIT_LIST.map((t) => ({ id: 'trait-' + t.id, name: t.name, dur: t.dur })) : []),
  select: (k) => { const e = data.entries.find((x) => x.key === k); if (e) selectUnit(e); return !!e; },
  moveRate: () => moveRate(), stats: () => cur && { ...cur.stats }, // stat-driven playback (heavy armor walks slower)
  play, setSpeed, setSquad, setMode, setPlaying, cam: setCam,
  seek: (t) => { S.t = t; for (const r of rigs) { const lt = Math.max(0, t - r.ctx.i * OFFS[cur.kind]); r.cyc = S.mode === 'loop' ? Math.floor(lt / act.dur) : 0; r.lt = lt - r.cyc * act.dur; } },
  finite: () => rigs.every((r) => { let ok = true; r.root.traverse((o) => { for (const v of [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()]) if (!Number.isFinite(v)) ok = false; }); return ok; }),
  pose: (i = 0) => rigs[i] && { ...rigs[i].pose },
  bonesWorld: () => { const r = rigs[0], o = {}; if (!r) return o; for (const [k, b] of Object.entries(r.b)) { const v = b.getWorldPosition(new THREE.Vector3()); o[k] = [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; } return o; },
  ready: true,
};
