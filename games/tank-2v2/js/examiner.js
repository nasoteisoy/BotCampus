// Unit Examiner: a sandbox on the real map that spawns one blue unit (and an optional red opponent) and lets you
// drive it with the real game code (movement, combat, abilities, models all come from main.js through the API).
// Loaded lazily by main.js only when the examiner is opened; normal Play never imports this file.
import { UNITS, BUILDINGS, ABILITIES, BRANCHES, BODIES, BODY_KEYS, LVL_MULT } from './config.js';
import { svg } from './icons.js';
import { buildFlag } from './models.js';

const NOTES_KEY = 'frontline.examiner.notes.v1', PREF_KEY = 'frontline.examiner.prefs.v1', TUNE_KEY = 'frontline.examiner.tuning.v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1), f0 = (n) => String(Math.round(n));
const BR_ORDER = ['inf', 'armor', 'art', 'air'];
const BR_ICON = { inf: '🪖', armor: '🛡️', art: '💥', air: '✈️' };
const BODY_COLOR = { inf: '#7ddc5a', armor: '#ff8a3d', air: '#4fd6ff', art: '#ff5ab4', truck: '#ffd23f', bld: '#b48cff' };
const CLASSES = BODY_KEYS.map((k) => ({ k, label: BODIES[k].name, icon: BODIES[k].icon, color: BODY_COLOR[k] }));   // the 6 body types
const HITSCAN = { mg: true, flak: true, aamg: true };
const EXTRA = {
  vis: { label: 'Vision', icon: '👁', color: '#f2f6ff' },
  min: { label: 'Min range', icon: '⛔', color: '#ff3b3b' },
  dive: { label: 'Rocket window', icon: '🚀', color: '#ffffff' },
  drop: { label: 'Bomb release', icon: '💣', color: '#ffffff' },
  deploy: { label: 'Deployed range', icon: '⚙️', color: '#ffffff' },
  satchel: { label: 'Satchel reach', icon: '💣', color: '#ff6060' },
  repair: { label: 'Repair radius', icon: '🔧', color: '#8ff7ff' },
};
// arenas on the real map: open ground with forest, a road and/or houses close by. home = where planes rearm.
const ARENAS = {
  forest: { name: 'Forest edge', icon: '🌲', blue: { x: -12, z: -22 }, red: { x: -16, z: -60 }, home: { x: 30, z: -18 }, desc: 'Forest to the SW, road between the sides' },
  town: { name: 'Town & road', icon: '🏘️', blue: { x: -6, z: 80 }, red: { x: -6, z: 44 }, home: { x: 34, z: 92 }, desc: 'Houses to the W (garrison), road under red' },
  open: { name: 'Open field', icon: '🌾', blue: { x: 104, z: -90 }, red: { x: 104, z: -126 }, home: { x: 72, z: -100 }, desc: 'Flat, no cover' },
};
// suggested sparring partner per unit (red side)
const SUGGEST = { rifle: 'u:rifle', bazooka: 'u:medium', scout: 'u:rifle', engineer: 'u:light', mgteam: 'u:rifle', commando: 'u:medium', jeep: 'u:rifle', light: 'u:rifle', medium: 'u:light', heavy: 'u:medium', atgun: 'u:medium', howitzer: 'b:barracks', aagun: 'u:fbomber', reconplane: 'none', fighter: 'u:fighter', fbomber: 'u:medium', bomber: 'b:barracks' };
const QUICK = ['too slow', 'too fast', 'does not fire', 'too strong', 'too weak', 'range too short', 'gets stuck', 'looks wrong', 'ability broken', 'good as is'];

let A = null, H = null, root = null, labelsEl = null;
const S = {
  type: 'rifle', opp: 'auto', redMode: 'hold', arena: 'forest', speed: 1, follow: true, reveal: true, rings: true,
  ringOn: { vis: true, inf: true, armor: true, air: true, art: true, truck: true, bld: true, min: true, dive: true, drop: true, deploy: true, satchel: true, repair: true }, tuning: false,
  tab: 'pick', open: true, mode: null, blue: null, red: null, home: null, homeFlag: null, extra: [], fightT: 0, uiT: 0, lastReport: '',
};
let notes = {}, tune = {};
try { tune = JSON.parse(localStorage.getItem(TUNE_KEY) || '{}') || {}; } catch { tune = {}; }
const saveTune = () => { try { localStorage.setItem(TUNE_KEY, JSON.stringify(tune)); } catch { /* ignore */ } };
// tuning: per unit type, a full copy of { vs, vis }. Applies only to units spawned in the examiner (never to config.js).
const defVs = (t) => UNITS[t].vs;
function effVs(t) { const d = defVs(t), o = tune[t]?.vs || {}; const v = {}; for (const b of BODY_KEYS) v[b] = { lvl: o[b]?.lvl ?? d[b].lvl, rng: o[b]?.rng ?? d[b].rng }; return v; }
const effVis = (t) => tune[t]?.vis ?? UNITS[t].vis;
function tuneDiff(t) {
  const d = defVs(t), e = effVs(t), out = [];
  for (const b of BODY_KEYS) { const a = d[b], n = e[b]; if (a.lvl !== n.lvl || a.rng !== n.rng) out.push({ b, from: a, to: n }); }
  const vis = effVis(t) !== UNITS[t].vis ? { from: UNITS[t].vis, to: effVis(t) } : null;
  return { list: out, vis, any: out.length > 0 || !!vis };
}
function cleanTune(t) { if (tune[t] && !tuneDiff(t).any) delete tune[t]; }
function applyTune(u) { if (!u || u.isBld) return; u.vs = effVs(u.type); const v = effVis(u.type); u.visR = v !== u.def.vis ? v : undefined; }
function setTune(t, b, field, val) {
  const T = (tune[t] ||= {});
  if (b === 'vis') T.vis = Math.max(0, Math.min(200, Math.round(val)));
  else { T.vs ||= {}; const cur = effVs(t)[b]; T.vs[b] = { ...cur, [field]: field === 'lvl' ? Math.max(0, Math.min(5, Math.round(val))) : Math.max(0, Math.min(150, Math.round(val))) }; }
  cleanTune(t); saveTune();
  for (const u of [S.blue, S.red, ...S.extra]) if (u && !u.isBld && u.type === t) applyTune(u);
}
try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') || {}; } catch { notes = {}; }
try { Object.assign(S, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch { /* ignore */ }
S.mode = null; S.blue = S.red = S.home = S.homeFlag = null; S.extra = []; S.tab = 'pick'; S.open = true;
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ type: S.type, opp: S.opp, redMode: S.redMode, arena: S.arena, speed: S.speed === 0 ? 1 : S.speed, follow: S.follow, reveal: S.reveal, rings: S.rings, ringOn: S.ringOn })); } catch { /* ignore */ } };
const saveNotes = () => { try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch { /* ignore */ } };
const phone = () => innerWidth < 700 || (innerHeight < 520 && innerWidth < 1000);

// =====================================================================================
// range model: effective attack range per target class, worked out from main.js rules
// =====================================================================================
// ground units: rangeOf() = rng (+8 deployed, +5 garrisoned), x(1 + up to .35) when higher than a ground target
// (not for indirect fire, not vs air). validTarget(): AA weapons (flak, aamg) can only target air, everything else only
// ground; the class must have a damage multiplier > 0; minRng blocks close targets; buildings measure to the wall.
// aircraft use their own attack-run rules in updatePlane()/attackRun().
export function rangeModel(u) {
  const def = u.def, w = def.wpn, vs = u.vs || def.vs;
  const rows = [], extras = [];
  extras.push({ k: 'vis', r: u.visR ?? def.vis, note: 'spotting radius (forest/ambush/cover hide targets closer in)' });
  const air = u.kind === 'air';
  const bonus = air ? 0 : (u.deployed ? 8 : 0) + (u.garrison ? 5 : 0);
  for (const c of CLASSES) {
    const v = vs[c.k], mult = LVL_MULT[v.lvl] || 0;
    const row = { ...c, lvl: v.lvl, rng: v.rng, mult, r: 0, can: false, note: '' };
    if (!w) row.note = 'unarmed';
    else if (v.lvl <= 0) row.note = "lvl 0: can't hit";
    else if (c.k === 'air' && !HITSCAN[w]) row.note = `${w} shells can't reach aircraft`;
    else if (v.rng <= 0) row.note = 'range 0';
    else {
      row.can = true; row.r = v.rng + bonus;
      if (air && (w === 'rocket' || w === 'bomb')) row.note = `picks ${c.label} targets within ${v.rng} of the ordered point`;
      else if (air) row.note = 'gun range while loitering (chases planes within 70 of the patrol point)';
      else if (c.k === 'air') row.note = 'no height bonus vs air';
      else row.note = (def.indirect ? 'indirect: no line of sight, needs spotting' : 'needs line of sight; up to +35% from high ground') + (c.k === 'bld' ? ' · measured to the wall' : '') + (bonus ? ` · +${bonus} (${u.deployed ? 'deployed' : 'garrison'})` : '');
      if (def.minRng) row.min = def.minRng;
    }
    rows.push(row);
  }
  if (def.minRng) extras.push({ k: 'min', r: def.minRng, note: 'cannot fire at targets closer than this' });
  if (w === 'rocket') { extras.push({ k: 'min', r: 14, note: 'rockets fire only when the target is more than 14 ahead' }); extras.push({ k: 'dive', r: 38, note: 'dives within 70, fires 2 rocket pairs when the target is 14–38 ahead (splash 4)' }); }
  if (w === 'bomb') { const lead = def.speed * Math.sqrt(2 * Math.max(4, A.pos(u).y) / (14 * 1.4)); extras.push({ k: 'drop', r: lead + 4, note: `drops 6 bombs ~${f0(lead + 4)} before the target (lead for speed/altitude), splash ${def.splash}` }); }
  if (def.ability === 'deploy' && !u.deployed) extras.push({ k: 'deploy', r: maxR(vs) + 8, note: 'range once deployed (+8)' });
  if (def.ability === 'satchel') extras.push({ k: 'satchel', r: 45, note: 'finds the nearest tank/gun/building within 45' });
  if (def.repair) extras.push({ k: 'repair', r: 10, note: 'repairs damaged friendly vehicles within 10 (buildings within 6 of the wall) while idle' });
  return { rows, extras };
}
const maxR = (vs) => Math.max(0, ...BODY_KEYS.map((b) => (vs[b].lvl > 0 ? vs[b].rng : 0)));

// =====================================================================================
// ground rings: terrain-following ribbons + HTML labels
// =====================================================================================
const SEG = 144;
class Ribbon {
  constructor(THREE, scene, color, dashed) {
    this.THREE = THREE;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < SEG; i++) { if (dashed && i % 4 >= 2) continue; const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    g.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; scene.add(this.mesh);
    this.key = '';
  }
  update(cx, cz, r, w) {
    const key = `${cx.toFixed(1)},${cz.toFixed(1)},${r.toFixed(2)}`; if (key === this.key) return; this.key = key;
    const a = this.mesh.geometry.attributes.position;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG * Math.PI * 2, s = Math.sin(t), c = Math.cos(t);
      for (let j = 0; j < 2; j++) { const rr = Math.max(.1, r - (j ? w : 0)), x = cx + s * rr, z = cz + c * rr; a.setXYZ(i * 2 + j, x, A.surfaceY(x, z) + .35, z); }
    }
    a.needsUpdate = true;
  }
  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
const ringPool = new Map();   // key -> { ribbon, label }
function ringFor(key, color, dashed) {
  let r = ringPool.get(key);
  if (!r) { r = { ribbon: new Ribbon(A.THREE, A.scene, color, dashed), label: document.createElement('div') }; r.label.className = 'exlbl'; labelsEl.appendChild(r.label); ringPool.set(key, r); }
  return r;
}
function clearRings() { for (const r of ringPool.values()) { r.ribbon.dispose(A.scene); r.label.remove(); } ringPool.clear(); }
let ringList = [];   // last drawn rings, for tests
const labelList = () => [...(labelsEl?.children || [])].filter((l) => l.style.display !== 'none').map((l) => l.textContent);
function updateRings() {
  const u = S.blue;
  const want = [];
  if (u?.alive && S.rings) {
    const m = rangeModel(u);
    for (const e of m.extras) if (S.ringOn[e.k] !== false && !want.some((w) => w.key === e.k)) want.push({ key: e.k, r: e.r, color: EXTRA[e.k].color, dashed: e.k !== 'vis' && e.k !== 'repair', text: `${EXTRA[e.k].icon} ${EXTRA[e.k].label} ${f0(e.r)}` });
    for (const c of m.rows) if (c.can && S.ringOn[c.k] !== false) want.push({ key: c.k, r: c.r, color: c.color, dashed: false, text: `${c.icon} vs ${c.label} ${f0(c.r)} · L${c.lvl} ×${c.mult}` });
  }
  ringList = want.map((w) => ({ key: w.key, r: w.r, text: w.text }));
  const used = new Set(want.map((w) => w.key));
  for (const [k, r] of ringPool) if (!used.has(k)) { r.ribbon.mesh.visible = false; r.label.style.display = 'none'; }
  if (!want.length) return;
  const p = A.pos(u), cx = p.x, cz = p.z;
  // equal radii: stack the bands inward so every class stays visible
  want.sort((a, b) => b.r - a.r);
  let prevR = Infinity, stack = 0, group = -1;
  const yaw = A.cameraYaw(), W = innerWidth, Hh = innerHeight;
  const groups = [];
  want.forEach((w) => {
    if (Math.abs(w.r - prevR) < .8) stack++; else { stack = 0; group++; groups.push([]); } prevR = w.r;
    w.rr = w.r - stack * .85; groups[group].push(w);
    const R = ringFor(w.key, w.color, w.dashed);
    R.ribbon.mesh.visible = true; R.ribbon.update(cx, cz, w.rr, .6);
  });
  // labels: one anchor per radius group (near side of the ring, groups fanned out), lines stacked below it;
  // fall back to the far / side positions when the anchor is off-screen or under the panel
  const LH = 17;
  groups.forEach((g, gi) => {
    let anchor = null;
    for (const base of [yaw, yaw + Math.PI, yaw + Math.PI / 2, yaw - Math.PI / 2]) {
      const a = base + (gi - (groups.length - 1) / 2) * .32, x = cx + Math.sin(a) * g[0].r, z = cz + Math.cos(a) * g[0].r;
      const s = A.toScreen(new A.THREE.Vector3(x, A.surfaceY(x, z) + .4, z));
      const y0 = s.y - (g.length - 1) * LH / 2;
      if (s.z < 1 && s.x > 60 && s.x < W - 60 && y0 > 30 && y0 + g.length * LH < Hh - 10 && !underPanel(s.x, y0) && !underPanel(s.x, y0 + g.length * LH)) { anchor = { x: s.x, y: y0 }; break; }
    }
    g.forEach((w, i) => {
      const R = ringPool.get(w.key);
      if (!anchor) { R.label.style.display = 'none'; return; }
      R.label.style.display = ''; R.label.style.transform = `translate(${anchor.x | 0}px, ${(anchor.y + i * LH) | 0}px) translate(-50%, -50%)`;
      R.label.style.borderColor = w.color; R.label.textContent = w.text;
    });
  });
}
let panelRect = null;
function underPanel(x, y) { const r = panelRect; return r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

// =====================================================================================
// arena
// =====================================================================================
const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
function oppSpec() { const o = S.opp === 'auto' ? SUGGEST[S.type] : S.opp; return o || 'none'; }
function oppName(spec = oppSpec()) { if (spec === 'none') return 'None'; const [k, t] = spec.split(':'); return k === 'u' ? UNITS[t].name : BUILDINGS[t].name; }
function resetArena() {
  A.startWorld(); S.extra = []; S.mode = null; S.fightT = 0;
  if (S.homeFlag) { A.scene.remove(S.homeFlag); S.homeFlag = null; }
  const ar = ARENAS[S.arena] || ARENAS.forest;
  if (S.reveal) { A.addReveal('blue'); A.addReveal('red'); }
  S.home = { alive: true, x: ar.home.x, z: ar.home.z, team: 'blue', examHome: true };
  const hf = buildFlag('blue'); hf.position.set(ar.home.x, A.surfaceY(ar.home.x, ar.home.z), ar.home.z); hf.scale.setScalar(1.6); A.scene.add(hf); S.homeFlag = hf;
  const def = UNITS[S.type];
  const u = A.createUnit(S.type, 'blue', ar.blue.x, ar.blue.z, yawTo(ar.blue, ar.red)); applyTune(u);
  if (def.kind === 'air') { u.home = S.home; A.pos(u).y = def.alt; u.yaw = Math.PI / 2; }
  S.blue = u;
  const spec = oppSpec(); S.red = null;
  if (spec !== 'none') {
    const [k, t] = spec.split(':');
    if (k === 'u') {
      const r = A.createUnit(t, 'red', ar.red.x, ar.red.z, yawTo(ar.red, ar.blue)); applyTune(r);
      if (r.kind === 'air') { r.home = { alive: true, x: ar.red.x, z: ar.red.z, team: 'red', examHome: true }; A.pos(r).y = r.def.alt; }
      S.red = r;
    } else S.red = A.createBuilding(t, 'red', ar.red.x, ar.red.z, true);
  }
  // aircraft start further out (95 m from the red spot) so attack runs have room to line up:
  // a rocket plane ordered onto a target closer than ~2 turn radii (27 m at 30 speed / 1.1 rad/s) can orbit it forever
  if (A.isAir(u)) { const dx = ar.blue.x - ar.red.x, dz = ar.blue.z - ar.red.z, L = Math.hypot(dx, dz) || 1, p = A.pos(u); p.x = ar.red.x + dx / L * 95; p.z = ar.red.z + dz / L * 95; u.yaw = Math.atan2(-dx, -dz); }
  // with "see everything" on, both sides are spotted right away (instead of after the first 0.25 s spotting tick)
  if (S.reveal) for (const e of [u, S.red]) if (e) { e.vis.blue = e.vis.red = true; if (e.seen) e.seen.blue = e.seen.red = A.game.time + 1.5; if (e.everSeen) e.everSeen.blue = e.everSeen.red = true; }
  applyRedMode();
  A.selectUnits([u]);
  const mx = (ar.blue.x + ar.red.x) / 2, mz = (ar.blue.z + ar.red.z) / 2;
  A.focusAt(mx, mz, phone() ? 100 : 82);
  if (phone()) camOffset(mx, mz, 1);
  A.game.timeScale = S.speed;
  clearRings();
  renderAll();
}
function applyRedMode() {
  const r = S.red; if (!r || r.isBld) return;
  r.passive = S.redMode === 'dummy';
  if (S.redMode !== 'fight') { if (!A.isAir(r)) { r.order = null; A.stop(r); } }
  S.fightT = 0;
}
function fightTick(dt) {
  const r = S.red, b = S.blue;
  if (S.redMode !== 'fight' || !r?.alive || r.isBld || !b?.alive) return;
  S.fightT -= dt; if (S.fightT > 0) return; S.fightT = 1;
  if (A.isAir(r)) {
    const aa = r.def.wpn === 'aamg';
    if (r.airState === 'idle' && r.def.wpn && aa === A.isAir(b) && A.canHurt(r, b)) A.airOrder(r, b);
  } else if (!A.isAir(b) && A.canHurt(r, b) && r.order?.type !== 'attack') A.orderAttack([r], b);
}
// camera: keep the unit clear of the panel (desktop: left of the side panel; phone: above the bottom sheet)
function camOffset(x, z, k) {
  const a = A.cameraYaw(), d = A.cam.dist;
  let tx = x, tz = z;
  if (phone()) { tx += Math.sin(a) * d * .28; tz += Math.cos(a) * d * .28; }
  else { tx += Math.cos(a) * d * .2; tz -= Math.sin(a) * d * .2; }
  A.panTo(tx, tz, k);
}

// =====================================================================================
// actions
// =====================================================================================
function act(name, arg) {
  const u = S.blue, r = S.red;
  const alive = u?.alive;
  switch (name) {
    case 'move': if (!alive) return A.toast('Unit is destroyed: Reset'); S.mode = S.mode === 'move' ? null : 'move'; if (S.mode) A.toast(A.TOUCH.on ? 'Tap the ground to move there' : 'Click the ground to move there'); break;
    case 'attack':
      if (!alive) return A.toast('Unit is destroyed: Reset');
      if (!r?.alive) return A.toast('No red target: pick an opponent');
      if (!r.vis.blue && !r.isBld) return A.toast('Red is not spotted yet (fog of war): move closer or turn on "see everything"');
      if (!u.def.wpn) { A.toast(`${u.def.name} is unarmed: it will fly/move to the target`); }
      else if (!A.canHurt(u, r)) A.toast(`${u.def.name} cannot damage ${r.def.name} (×0): it will just move there`);
      if (A.isAir(u)) A.airOrder(u, r); else A.orderAttack([u], r);
      S.mode = null; break;
    case 'stop': if (alive) A.stopUnit(u); S.mode = null; break;
    case 'ability': {
      if (!alive) return A.toast('Unit is destroyed: Reset');
      if (!arg || u.def.ability !== arg) return;
      const used = A.useAbility([u], arg);
      if (!used) A.toast(u.cd > 0 ? `${ABILITIES[arg].name}: cooling down ${f1(u.cd)} s` : `${ABILITIES[arg].name} not possible right now`);
      break;
    }
    case 'garrison': {
      if (!alive || !A.isInf(u)) return;
      const p = A.pos(u); const h = A.houses.filter((o) => !o.garrison || o.garrison === u).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!h) return A.toast('No free house');
      A.orderGarrison([u], h); A.toast(`Garrisoning the house ${f0(Math.hypot(h.x - p.x, h.z - p.z))} m away`); break;
    }
    case 'repairtest': {
      if (!alive) return; const p = A.pos(u);
      const t = A.createUnit('medium', 'blue', p.x + 6, p.z + 2); A.hurt(t, .6); S.extra.push(t); A.selectUnits([u]); A.toast('Damaged friendly tank placed: keep the engineers still to repair it'); break;
    }
    case 'hurt': if (alive) A.hurt(u, .25); break;
    case 'kill': if (alive) A.kill(u); break;
    case 'redhurt': if (r?.alive) A.hurt(r, .25); break;
    case 'redkill': if (r?.alive) A.kill(r); break;
    case 'reset': resetArena(); break;
  }
  renderActions();
}
function setSpeed(v) { S.speed = v; A.game.timeScale = v; savePrefs(); renderHead(); }

// =====================================================================================
// live readout
// =====================================================================================
function nameOf(e) { return e ? (e.isBld ? BUILDINGS[e.type].name : e.def.name) + (e.team === 'red' ? ' (red)' : '') : '—'; }
const AIR_STATE = { idle: 'circling home', out: 'flying out', loiter: 'loitering', return: 'returning to rearm', rearm: 'rearming' };
function stateOf(u) {
  const t = A.game.time;
  if (!u.alive) return ['💀', 'destroyed'];
  if (A.isAir(u)) {
    let s = AIR_STATE[u.airState] || u.airState;
    if (u.airState === 'rearm') s += ` ${f1(Math.max(0, u.rearmT))} s`;
    if (u.diving) s = 'diving · ' + s; if (u.runT > 0) s = 'attack run · ' + s;
    if (t - (u.firedAt ?? -99) < .5) s = 'firing · ' + s;
    return ['✈️', s];
  }
  if (u.garrison) return ['🏠', 'garrisoned in a house'];
  if (u.satchel) return ['💣', u.satchel.fuse !== undefined ? `satchel planted, fuse ${f1(Math.max(0, u.satchel.fuse))} s` : 'running to plant satchel'];
  if (u.wantDeploy) return ['⚙️', 'deploying (stop to set up)'];
  const moving = u.speed > .4 || u.path.length;
  if (moving) return ['🏃', (t < u.sprintUntil ? 'sprinting' : 'moving') + (u.order?.type === 'attack' ? ' (closing in on target)' : '')];
  const pre = u.deployed ? 'deployed · ' : u.ambush ? 'ambush (hidden) · ' : '';
  if (u.fireTarget) {
    if (u.def.deploy && u.deployT < u.def.deploy) return ['⚙️', pre + `setting up gun ${f1(u.def.deploy - u.deployT)} s`];
    if (t - u.firedAt < .35) return ['🔥', pre + 'firing'];
    if (u.reload > 0) return ['⏳', pre + `reloading ${f1(u.reload)} s`];
    return ['🎯', pre + 'aiming'];
  }
  if (u.order?.type === 'attack') return ['🎯', pre + 'attack order: no shot (range/LOS/visibility)'];
  if (u.repairing?.alive) return ['🔧', pre + 'repairing'];
  if (u.deployed) return ['⚙️', 'deployed'];
  if (u.ambush) return ['🌿', 'ambush (hidden)'];
  return ['💤', 'idle'];
}
function effRof(u) { let r = u.def.rof || 0; if (u.deployed) r *= .4; if (A.game.time < u.suppressedUntil) r *= 2; if (A.isInf(u) && u.speed > .5) r *= 1.6; return r; }
export function readout(u = S.blue) {
  if (!u) return null;
  const def = u.def, t = A.game.time;
  const tgt = u.fireTarget || (u.order?.type === 'attack' ? u.order.target : null) || u.airTarget || null;
  const st = stateOf(u);
  const flags = [];
  if (t < u.sprintUntil) flags.push('🏃 sprint ' + f1(u.sprintUntil - t) + ' s');
  if (t < u.suppressedUntil) flags.push('😵 suppressed');
  if (u.deployed) flags.push('⚙️ deployed');
  if (u.ambush) flags.push('🌿 ambush');
  if (!A.isAir(u) && u.alive) { const p = A.pos(u); if (A.inForest(p.x, p.z)) flags.push('🌲 in forest'); else if (A.inCity(p.x, p.z)) flags.push('🏘️ in town'); if (A.onRoad(p.x, p.z)) flags.push('🛣️ on road'); const c = A.concealed(u); if (c) flags.push('🙈 concealed ' + c); }
  const ab = def.ability ? { key: def.ability, name: ABILITIES[def.ability].name, cd: Math.max(0, u.cd), max: ABILITIES[def.ability].cd } : null;
  return {
    name: def.name, type: u.type, body: def.body, alive: u.alive, hp: u.hp, maxHp: u.maxHp, men: A.isInf(u) ? A.menAlive(u) : null, maxMen: def.men || null,
    dmgState: ['clean', 'smoking', 'burning'][u.dmg] || 'clean', state: st[1], stateIcon: st[0], flags,
    target: tgt ? nameOf(tgt) : null, targetDist: tgt && u.alive ? A.distTo(u, tgt) : null, targetRange: tgt && u.alive && !A.isAir(u) ? A.rangeOf(u, tgt) : null,
    range: u.alive && !A.isAir(u) ? A.rangeOf(u, null) : def.rng || 0, minRng: def.minRng || 0,
    reload: Math.max(0, u.reload), rof: effRof(u), speed: u.speed || 0, maxSpeed: A.isAir(u) ? def.speed : (u.alive ? A.speedOf(u) : 0),
    ability: ab, dealt: u.dealt || 0, shots: u.shots || 0, hits: u.hits || 0, kills: 0,
    alt: A.isAir(u) ? A.pos(u).y : null, ammo: A.isAir(u) ? u.ammo : null, airState: u.airState || null,
    x: A.pos(u).x, z: A.pos(u).z, order: u.order?.type || null,
  };
}

// =====================================================================================
// UI
// =====================================================================================
const unitBtn = (t) => { const U = UNITS[t]; return `<button class="exu ${t === S.type ? 'on' : ''}" data-pick="${t}" style="--c:${BRANCHES[U.br].color}" title="${esc(U.name + ': ' + U.desc)}">${svg(t, 'blue')}<span>${esc(U.name)}</span>${notes[t]?.trim() ? '<i class="nd">📝</i>' : ''}${tuneDiff(t).any ? '<i class="td">🎛</i>' : ''}</button>`; };
function renderPick() {
  const groups = BR_ORDER.map((br) => {
    const list = Object.keys(UNITS).filter((t) => UNITS[t].br === br);
    return `<div class="exg" style="--c:${BRANCHES[br].color}"><div class="exgh">${BR_ICON[br]} ${BRANCHES[br].name} <small>${list.length}</small></div><div class="exgrid">${list.map(unitBtn).join('')}</div></div>`;
  }).join('');
  const optU = BR_ORDER.map((br) => `<optgroup label="${BR_ICON[br]} ${BRANCHES[br].name}">${Object.keys(UNITS).filter((t) => UNITS[t].br === br).map((t) => `<option value="u:${t}">${esc(UNITS[t].name)}</option>`).join('')}</optgroup>`).join('');
  const optB = `<optgroup label="🏠 Building target">${Object.keys(BUILDINGS).map((t) => `<option value="b:${t}">${esc(BUILDINGS[t].name)}</option>`).join('')}</optgroup>`;
  $('#exsec-pick').innerHTML = `
    <div class="exlab">🔵 Your unit <small>tap to spawn</small></div>${groups}
    <div class="exlab">🔴 Opponent</div>
    <div class="exrow"><select id="exopp" aria-label="Opponent"><option value="auto">★ Suggested: ${esc(oppName(SUGGEST[S.type]))}</option><option value="none">🚫 None</option>${optU}${optB}</select></div>
    <div class="exseg" data-seg="redMode">${[['dummy', '😴 Dummy', 'never fires'], ['hold', '🛡️ Hold', 'fires, never moves'], ['fight', '⚔️ Fight back', 'attacks your unit']].map(([v, l, d]) => `<button data-v="${v}" class="${S.redMode === v ? 'on' : ''}" title="${d}">${l}</button>`).join('')}</div>
    <div class="exlab">🗺️ Arena</div>
    <div class="exseg" data-seg="arena">${Object.entries(ARENAS).map(([k, a]) => `<button data-v="${k}" class="${S.arena === k ? 'on' : ''}" title="${esc(a.desc)}">${a.icon} ${a.name}</button>`).join('')}</div>
    <label class="exchk"><input type="checkbox" id="exreveal" ${S.reveal ? 'checked' : ''}> 👁 Both sides see everything <small>(off = real spotting / fog of war)</small></label>`;
  $('#exopp').value = S.opp;
}
function renderActions() {
  const el = $('#exsec-test .exacts'); if (!el || !S.blue) return;
  const u = S.blue, def = u.def, alive = u.alive;
  const b = (a, icon, label, extra = '', cls = '') => `<button class="exa ${cls}" data-act="${a}" ${extra}>${icon}<span>${label}</span></button>`;
  let h = b('move', '📍', 'Move here', '', S.mode === 'move' ? 'on' : '') + b('attack', '🎯', 'Attack') + b('stop', '⏹️', 'Stop');
  if (def.ability) { const AB = ABILITIES[def.ability]; h += `<button class="exa ab" data-act="ability" data-arg="${def.ability}" title="${esc(AB.desc)}">${svg(def.ability)}<span>${AB.name}</span><i class="cdr"></i></button>`; }
  if (A.isInf(u)) h += b('garrison', '🏠', 'Garrison');
  if (def.repair) h += b('repairtest', '🔧', 'Repair test');
  h += b('hurt', '💥', '−25% HP') + b('kill', '☠️', 'Kill') + b('reset', '↻', 'Reset', '', 'reset');
  el.innerHTML = h; el.classList.toggle('dead', !alive);
  const r = S.red;
  $('#exsec-test .exred').innerHTML = r ? `<span class="rn">🔴 ${esc(nameOf(r).replace(' (red)', ''))} <small>${S.redMode === 'dummy' ? '😴' : S.redMode === 'hold' ? '🛡️' : '⚔️'}</small></span><b class="rhp"></b><button data-act="redhurt">💥 −25%</button><button data-act="redkill">☠️</button>` : '<span class="rn">🔴 No opponent <small>(Pick tab)</small></span>';
}
const pips = (l) => `<span class="pips" aria-label="level ${l}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}</span>`;
function matrixHtml(m) {
  const u = S.blue, t = u.type, tuned = tuneDiff(t), ed = S.tuning, d = defVs(t);
  const ring = (k, color, on, dashed, can = true) => can ? `<label class="exm-cb"><input type="checkbox" data-ring="${k}" ${on !== false ? 'checked' : ''} aria-label="ring"><i class="sw ${dashed ? 'dash' : ''}" style="--c:${color}"></i></label>` : '<span class="exm-cb"></span>';
  const vis = m.extras.find((e) => e.k === 'vis');
  const rowsHtml = m.rows.map((c) => {
    const chg = (d[c.k].lvl !== c.lvl || d[c.k].rng !== c.rng);
    return `<div class="exm-row ${c.can ? '' : 'cant'} ${chg ? 'chg' : ''}" data-b="${c.k}" style="--c:${c.color}" title="${esc(c.note)}">
      ${ring(c.k, c.color, S.ringOn[c.k], false, c.can)}
      <span class="exm-name">${c.icon} ${c.label}</span>
      ${c.lvl > 0 ? pips(c.lvl) : '<span class="exm-no">can\'t hit</span>'}
      <span class="exm-rng">${c.lvl > 0 ? f0(c.r || c.rng) : '—'}</span>
      <span class="exm-mult">${c.lvl > 0 ? '×' + c.mult : ''}</span>
      ${c.lvl > 0 && !c.can ? `<span class="exm-warn">⚠ ${esc(c.note)}</span>` : ''}
      ${ed ? `<div class="exm-edit"><span class="lv"><button data-tune="lvl" data-b="${c.k}" data-d="-1" aria-label="level down">−</button><b>L${c.lvl}</b><button data-tune="lvl" data-b="${c.k}" data-d="1" aria-label="level up">+</button></span>
        <span class="rg"><button data-tune="rng" data-b="${c.k}" data-d="-2" aria-label="range down">−</button><input type="range" min="0" max="150" step="1" value="${c.rng}" data-slide="rng" data-b="${c.k}" aria-label="range"><button data-tune="rng" data-b="${c.k}" data-d="2" aria-label="range up">+</button><b class="rv">${c.rng}</b></span></div>` : ''}
    </div>`;
  }).join('');
  const visRow = `<div class="exm-row vis ${tuned.vis ? 'chg' : ''}" data-b="vis" style="--c:${EXTRA.vis.color}">${ring('vis', EXTRA.vis.color, S.ringOn.vis, false)}<span class="exm-name">👁 Vision</span><span></span><span class="exm-rng">${f0(vis.r)}</span><span class="exm-mult"></span>
    ${ed ? `<div class="exm-edit"><span class="lv"></span><span class="rg"><button data-tune="vis" data-b="vis" data-d="-5" aria-label="vision down">−</button><input type="range" min="0" max="200" step="1" value="${vis.r}" data-slide="vis" data-b="vis" aria-label="vision"><button data-tune="vis" data-b="vis" data-d="5" aria-label="vision up">+</button><b class="rv">${vis.r}</b></span></div>` : ''}</div>`;
  const extra = m.extras.filter((e) => e.k !== 'vis').map((e) => `<div class="exm-row xtra" style="--c:${EXTRA[e.k].color}" title="${esc(e.note)}">${ring(e.k, EXTRA[e.k].color, S.ringOn[e.k], true)}<span class="exm-name">${EXTRA[e.k].icon} ${EXTRA[e.k].label}</span><span></span><span class="exm-rng">${f0(e.r)}</span><span class="exm-mult"></span></div>`).join('');
  const cant = m.rows.filter((c) => !c.can).map((c) => `${c.icon} ${c.label}`);
  return `<div class="exm ${S.rings ? '' : 'off'} ${ed ? 'editing' : ''}">
    <div class="exm-head"><span></span><span>Body</span><span>Level</span><span>Rng</span><span>Dmg</span></div>
    ${rowsHtml}${visRow}${extra}</div>
    ${cant.length ? `<div class="excant">🚫 Can't hit: ${cant.join(' · ')}</div>` : ''}
    <div class="exm-tools"><button class="exm-tune ${ed ? 'on' : ''}" data-ui="tune">✏️ ${ed ? 'Done tuning' : 'Tune levels & ranges'}</button>${tuned.any ? `<button class="exm-reset" data-ui="tunereset">↺ Reset to default</button><span class="exm-tuned">🎛 tuned (this browser only)</span>` : ''}</div>`;
}
function renderTest() {
  const u = S.blue; if (!u) return;
  const def = u.def;
  const cfg = [['💲', 'cost', def.cost], ['❤️', def.men ? 'men×hp' : 'hp', def.men ? `${def.men}×${def.hpm}` : def.hp], ['🎯', 'rng', def.rng ?? '—'], ['⏱️', 'rof', def.rof ? def.rof + ' s' : '—'], ['💥', 'dmg', def.dmg ?? '—'], ['🔫', 'weapon', def.wpn || 'none'], ['🧍', 'body', BODIES[def.body].icon + ' ' + BODIES[def.body].name], ['👁', 'vis', def.vis], ['🏃', 'speed', def.speed]];
  if (def.minRng) cfg.push(['⛔', 'minRng', def.minRng]); if (def.splash) cfg.push(['💢', 'splash', def.splash]); if (def.turn) cfg.push(['↻', 'turn', def.turn]); if (def.deploy) cfg.push(['⚙️', 'setup', def.deploy + ' s']);
  if (def.front) cfg.push(['🛡️', 'front', '×' + def.front]); if (def.ammo) cfg.push(['🚀', 'ammo', def.ammo]); if (def.alt) cfg.push(['☁️', 'alt', def.alt]); if (def.ability) cfg.push(['✨', 'ability', ABILITIES[def.ability].name]);
  const m = rangeModel(u);
  $('#exsec-test').innerHTML = `
    <div class="exacts"></div>
    <div class="exred"></div>
    <div class="exlab">📊 Live</div>
    <div class="exlive" id="exlive"></div>
    <div class="exlab">🎯 Attack matrix &amp; rings <label class="exchk inline"><input type="checkbox" id="exrings" ${S.rings ? 'checked' : ''}> rings</label></div>
    <div id="exlegend">${matrixHtml(m)}</div>
    <div class="exlab">⚙️ Config <small>config.js</small></div>
    <div class="excfg">${cfg.map(([i, k, v]) => `<span><i>${i}</i>${k}<b>${esc(v)}</b></span>`).join('')}</div>
    <div class="exdesc">${esc(def.desc)}${def.ability ? ` · <b>${ABILITIES[def.ability].name}</b>: ${esc(ABILITIES[def.ability].desc)}` : ''}</div>`;
  renderActions();
  S.legendSig = legendSig(m);
  updateLive(true);
}
const legendSig = (m) => m.rows.map((r) => r.can + ':' + r.lvl + ':' + f0(r.r)).join() + m.extras.map((e) => e.k + f0(e.r)).join() + S.tuning;
function bar(f, cls = '') { return `<i class="exbar ${cls}"><i style="width:${Math.max(0, Math.min(1, f)) * 100}%"></i></i>`; }
function updateLive() {
  const el = $('#exlive'); if (!el || !S.blue) return;
  const r = readout(); const u = S.blue;
  const hpTxt = r.men !== null ? `${r.men}/${r.maxMen} men · ${f0(r.hp)}/${r.maxHp} hp` : `${f0(r.hp)}/${r.maxHp} hp`;
  const rows = [
    ['❤️', 'Health', `${bar(r.hp / r.maxHp, r.dmgState)}${hpTxt} <em class="ds ${r.dmgState}">${r.dmgState === 'clean' ? '✔ clean' : r.dmgState === 'smoking' ? '💨 smoking' : '🔥 burning'}</em>`],
    [r.stateIcon, 'State', `<b>${esc(r.state)}</b>${r.flags.length ? `<div class="flags">${r.flags.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}`],
    ['🎯', 'Target', r.target ? `${esc(r.target)} · ${f0(r.targetDist)} m${r.targetRange ? ` / range ${f0(r.targetRange)} ${r.targetDist <= r.targetRange ? '<em class="ok">in range</em>' : '<em class="no">out of range</em>'}` : ''}` : '—'],
    ['📏', 'Range', r.range ? `${f0(r.range)}${r.minRng ? ` (min ${r.minRng})` : ''}${u.deployed ? ' <em>deployed +8</em>' : ''}${u.garrison ? ' <em>garrison +5</em>' : ''}` : '—'],
    ['⏳', 'Reload', u.def.rof ? `${bar(1 - r.reload / Math.max(.01, r.rof))}${f1(r.reload)} / ${f1(r.rof)} s` : (u.def.ammo ? `ammo ${r.ammo}/${u.def.ammo}` : '—')],
    ['🏃', 'Speed', `${f1(r.speed)} / ${f1(r.maxSpeed)}${A.isAir(u) ? ` · alt ${f0(r.alt)}` : ''}`],
  ];
  if (r.ability) rows.push(['✨', r.ability.name, r.ability.cd > 0 ? `${bar(1 - r.ability.cd / r.ability.max, 'cd')}cooldown ${f1(r.ability.cd)} / ${r.ability.max} s` : '<em class="ok">ready</em>']);
  if (A.isAir(u) && u.def.ammo) rows.push(['🚀', 'Ammo', `${r.ammo}/${u.def.ammo}`]);
  rows.push(['💥', 'Dealt', `<b>${f0(r.dealt)}</b> dmg · ${r.shots} shots · ${r.hits} hits`]);
  if (S.red && S.red.maxHp) rows.push(['🔴', 'Red', `${bar(S.red.hp / S.red.maxHp, 'red')}${f0(S.red.hp)}/${S.red.maxHp}${S.red.alive ? '' : ' 💀'}${S.red.dealt ? ` · dealt ${f0(S.red.dealt)}` : ''}`]);
  el.innerHTML = rows.map(([i, k, v]) => `<div class="exr"><i>${i}</i><span>${esc(k)}</span><div>${v}</div></div>`).join('');
  // ability button cooldown ring + active state
  const ab = $('#exsec-test [data-act="ability"]');
  if (ab && r.ability) { ab.querySelector('.cdr').style.background = r.ability.cd > 0 ? `conic-gradient(rgba(0,0,0,.6) ${(r.ability.cd / r.ability.max * 100).toFixed(1)}%, transparent 0)` : 'none'; ab.classList.toggle('active', !!(u.deployed || u.wantDeploy || u.ambush || u.satchel || A.game.time < u.sprintUntil)); }
  const rhp = $('#exsec-test .rhp'); if (rhp && S.red) rhp.textContent = S.red.alive ? `${Math.round(S.red.hp / S.red.maxHp * 100)}%` : '💀';
  $('#exsec-test .exacts')?.classList.toggle('dead', !u.alive);
  const m = rangeModel(u), sig = legendSig(m);
  if (sig !== S.legendSig && !S.dragging) { S.legendSig = sig; $('#exlegend').innerHTML = matrixHtml(m); }
}
function renderNotes() {
  const t = S.type, U = UNITS[t];
  const listed = Object.keys(UNITS).filter((k) => notes[k]?.trim() || tuneDiff(k).any);
  $('#exsec-notes').innerHTML = `
    <div class="exnh">${svg(t, 'blue')}<div><b>${esc(U.name)}</b><small>What is wrong with it? Saved on this device.</small></div></div>
    <textarea id="exnote" rows="5" placeholder="e.g. turns too slowly, the bazooka misses moving tanks, ambush button does nothing…">${esc(notes[t] || '')}</textarea>
    <div class="exquick">${QUICK.map((q) => `<button data-q="${esc(q)}">+ ${esc(q)}</button>`).join('')}</div>
    <div class="exrow"><button class="exbig" id="excopy">📋 Copy all notes</button><span class="exsaved" id="exsaved"></span></div>
    <textarea id="exreport" class="hidden" readonly rows="6"></textarea>
    <div class="exlab">📝 Units with notes <small>${listed.length}/${Object.keys(UNITS).length}</small></div>
    <div class="exnlist">${listed.length ? listed.map((k) => `<button data-pick-note="${k}">${svg(k, 'blue')}<b>${esc(UNITS[k].name)}</b><span>${tuneDiff(k).any ? '🎛 tuned · ' : ''}${esc((notes[k] || '').trim().split('\n')[0].slice(0, 60))}</span></button>`).join('') : '<div class="exempty">No notes yet. Pick a unit, watch it, write what needs fixing.</div>'}</div>`;
}
const lvlTxt = (v) => (v.lvl > 0 ? `lvl ${v.lvl} (×${LVL_MULT[v.lvl]}), rng ${v.rng}` : `lvl 0 (can't hit)${v.rng ? `, rng ${v.rng}` : ''}`);
function tuneLines(t) {
  const d = tuneDiff(t); if (!d.any) return '';
  const l = d.list.map(({ b, from, to }) => `  vs ${BODIES[b].name}: ${lvlTxt(from)}  ->  ${lvlTxt(to)}`);
  if (d.vis) l.push(`  Vision: ${d.vis.from}  ->  ${d.vis.to}`);
  return `Tuning (default -> mine):\n${l.join('\n')}\n`;
}
export function buildReport() {
  const list = Object.keys(UNITS).filter((k) => notes[k]?.trim() || tuneDiff(k).any);
  const d = new Date();
  const head = `Front Line: Unit Examiner notes (${d.toISOString().slice(0, 10)})\n`;
  if (!list.length) return head + '\n(no notes yet)\n';
  return head + list.map((k) => `\n== ${UNITS[k].name} [${k}] (${BODIES[UNITS[k].body].name}) ==\n${notes[k]?.trim() ? notes[k].trim() + '\n' : ''}${tuneLines(k)}`).join('');
}
async function copyReport() {
  const txt = buildReport(); S.lastReport = txt;
  let ok = false;
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(txt); ok = true; } } catch { ok = false; }
  const ta = $('#exreport'); ta.value = txt; ta.classList.remove('hidden');
  if (!ok) { try { ta.focus(); ta.select(); ok = document.execCommand('copy'); } catch { ok = false; } }
  A.toast(ok ? `📋 Copied notes/tuning for ${Object.keys(UNITS).filter((k) => notes[k]?.trim() || tuneDiff(k).any).length} unit(s)` : 'Select the text below and copy it');
  return ok;
}
function renderHead() {
  const U = UNITS[S.type];
  $('#exhead').innerHTML = `
    <button class="exgrab" data-ui="toggle" aria-label="Collapse panel"><i></i></button>
    <div class="excur">${svg(S.type, 'blue')}<div><b>${esc(U.name)}</b><small><span class="bd">${BODIES[U.body].icon} ${BODIES[U.body].name}</span> · vs ${esc(oppName())}${tuneDiff(S.type).any ? ' · 🎛' : ''}</small></div></div>
    <div class="exspeed" role="group" aria-label="Speed">${[[0, '⏸'], [.25, '¼×'], [.5, '½×'], [1, '1×'], [2, '2×']].map(([v, l]) => `<button data-speed="${v}" class="${S.speed === v ? 'on' : ''}" aria-label="${v ? v + 'x' : 'Pause'}">${l}</button>`).join('')}</div>
    <button class="exfollow ${S.follow ? 'on' : ''}" data-ui="follow" title="Camera follows the unit">🎥</button>`;
}
function renderTabs() {
  $('#extabs').innerHTML = [['pick', '🧩', 'Pick'], ['test', '🕹️', 'Test'], ['notes', '📝', 'Notes']].map(([k, i, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${i} ${l}${k === 'notes' && Object.values(notes).some((n) => n?.trim()) ? ` <small>${Object.values(notes).filter((n) => n?.trim()).length}</small>` : ''}</button>`).join('');
  root.dataset.tab = S.tab;
}
// note markers updated in place (re-rendering the tabs/buttons while the textarea blurs would swallow the click)
function markNotes() {
  const n = Object.values(notes).filter((v) => v?.trim()).length, tb = $('#extabs [data-tab="notes"]');
  if (tb) { let sm = tb.querySelector('small'); if (!n) sm?.remove(); else { if (!sm) { tb.append(' '); sm = document.createElement('small'); tb.append(sm); } sm.textContent = n; } }
  const b = $(`#exsec-pick [data-pick="${S.type}"]`);
  if (b) { const has = !!notes[S.type]?.trim(), nd = b.querySelector('.nd'); if (has && !nd) b.querySelector('span').insertAdjacentHTML('afterend', '<i class="nd">📝</i>'); else if (!has) nd?.remove(); }
}
function renderAll() { renderHead(); renderTabs(); renderPick(); renderTest(); renderNotes(); root.classList.toggle('min', !S.open); }

function buildDom() {
  root = document.createElement('div'); root.id = 'ex';
  root.innerHTML = `
    <div id="extop"><button data-ui="menu" aria-label="Back to menu">◀ Menu</button><b>🔍 Unit Examiner</b><span class="hint">${'ontouchstart' in window ? 'tap ground: move · tap red: attack' : 'click ground: move · click red: attack · wheel: zoom · right-drag: rotate'}</span></div>
    <aside id="expanel">
      <div id="exhead"></div>
      <nav id="extabs"></nav>
      <div id="exbody">
        <section id="exsec-pick" class="exsec" data-sec="pick"></section>
        <section id="exsec-test" class="exsec" data-sec="test"></section>
        <section id="exsec-notes" class="exsec" data-sec="notes"></section>
      </div>
    </aside>`;
  document.body.appendChild(root);
  labelsEl = document.createElement('div'); labelsEl.id = 'exlabels'; document.body.appendChild(labelsEl);
  root.addEventListener('click', onUiClick);
  root.addEventListener('change', onUiChange);
  root.addEventListener('input', (e) => {
    if (e.target.dataset.slide) {   // live while dragging: update the unit + the row text, re-render on 'change'
      const el = e.target, b = el.dataset.b; S.dragging = true;
      setTune(S.type, b, b === 'vis' ? 'vis' : 'rng', +el.value);
      const rv = el.parentElement.querySelector('.rv'); if (rv) rv.textContent = el.value;
      const row = el.closest('.exm-row'); const rr = row?.querySelector('.exm-rng'); if (rr && (b === 'vis' || effVs(S.type)[b].lvl > 0)) rr.textContent = el.value;
      return;
    }
    if (e.target.id === 'exnote') { notes[S.type] = e.target.value; if (!e.target.value.trim()) delete notes[S.type]; saveNotes(); markNotes(); const s = $('#exsaved'); if (s) { s.textContent = '✔ saved'; clearTimeout(s._t); s._t = setTimeout(() => { s.textContent = ''; }, 1200); } }
  });
  // notes list / unit buttons are re-rendered on blur so the badge & list stay current
  root.addEventListener('mousedown', (e) => { if (e.target.closest?.('[data-q]')) e.preventDefault(); });   // quick chips keep the textarea focused
  // wheel / touch on the panel must not reach the map
  root.addEventListener('wheel', (e) => e.stopPropagation());
}
function onUiClick(e) {
  const el = e.target.closest('button'); if (!el || !root.contains(el)) return;
  if (el.dataset.pick) { S.type = el.dataset.pick; savePrefs(); resetArena(); S.tab = 'test'; renderTabs(); return; }
  if (el.dataset.pickNote) { S.type = el.dataset.pickNote; savePrefs(); resetArena(); S.tab = 'notes'; renderTabs(); return; }
  if (el.dataset.tab) { S.tab = el.dataset.tab; if (!S.open) { S.open = true; root.classList.remove('min'); } renderTabs(); return; }
  if (el.dataset.speed !== undefined) { setSpeed(+el.dataset.speed); return; }
  if (el.dataset.act) { act(el.dataset.act, el.dataset.arg); return; }
  if (el.dataset.q) { const ta = $('#exnote'); const v = ta.value.trim(); ta.value = (v ? v + '\n' : '') + '- ' + el.dataset.q + ': '; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return; }
  if (el.id === 'excopy') { copyReport(); return; }
  const seg = el.closest('[data-seg]');
  if (seg) { S[seg.dataset.seg] = el.dataset.v; savePrefs(); if (seg.dataset.seg === 'redMode') { applyRedMode(); renderPick(); renderActions(); } else resetArena(); return; }
  const ui = el.dataset.ui;
  if (ui === 'menu') { A.backToMenu(); return; }
  if (ui === 'tune') { S.tuning = !S.tuning; refreshMatrix(); return; }
  if (ui === 'tunereset') { delete tune[S.type]; saveTune(); for (const u of [S.blue, S.red, ...S.extra]) if (u && !u.isBld && u.type === S.type) applyTune(u); refreshMatrix(); renderHead(); renderPick(); A.toast(`↺ ${UNITS[S.type].name}: back to config.js defaults`); return; }
  if (el.dataset.tune) { const b = el.dataset.b, f = el.dataset.tune, cur = b === 'vis' ? effVis(S.type) : effVs(S.type)[b][f]; setTune(S.type, b, f === 'vis' ? 'vis' : f, cur + +el.dataset.d); refreshMatrix(); renderHead(); return; }
  if (ui === 'toggle') { S.open = !S.open; root.classList.toggle('min', !S.open); return; }
  if (ui === 'follow') { S.follow = !S.follow; savePrefs(); renderHead(); A.toast(S.follow ? '🎥 Camera follows the unit' : '🎥 Free camera'); return; }
}
function refreshMatrix() { if (!S.blue) return; const m = rangeModel(S.blue); S.legendSig = legendSig(m); $('#exlegend').innerHTML = matrixHtml(m); }
function onUiChange(e) {
  const t = e.target;
  if (t.dataset.slide) { S.dragging = false; refreshMatrix(); renderHead(); renderPick(); return; }
  if (t.id === 'exopp') { S.opp = t.value; savePrefs(); resetArena(); return; }
  if (t.id === 'exreveal') { S.reveal = t.checked; savePrefs(); resetArena(); return; }
  if (t.id === 'exrings') { S.rings = t.checked; savePrefs(); $('#exlegend .exm')?.classList.toggle('off', !S.rings); return; }
  if (t.dataset.ring) { S.ringOn[t.dataset.ring] = t.checked; savePrefs(); return; }
}

// map clicks while the examiner is open (main.js handleClick hook): returning true consumes the click
function onClick(cx, cy, right) {
  const u = S.blue;
  if (S.mode === 'move' && u?.alive && !right) {
    const g = A.groundAt(cx, cy); if (g) { A.orderMove([u], g.x, g.z); }
    S.mode = null; renderActions(); return true;
  }
  if (u?.alive && !A.selUnits.has(u)) A.selectUnits([u]);
  const e = A.pickEntity(cx, cy);
  if (e && e.team === 'blue' && e !== u) return true;   // helper units (repair test) never steal the selection
  return false;   // the normal game click: ground = move, red = attack, house = garrison
}
function onFrame(dt) {
  if (!S.blue) return;
  const u = S.blue;
  if (u.alive && !A.selUnits.has(u)) A.selectUnits([u]);
  fightTick(dt * (A.game.timeScale || 0));
  if (S.follow && u.alive) { const p = A.pos(u); camOffset(p.x, p.z, Math.min(1, dt * 3)); }
  panelRect = $('#expanel')?.getBoundingClientRect() || null;
  updateRings();
  S.uiT -= dt; if (S.uiT <= 0) { S.uiT = .2; if (S.tab === 'test' || !phone()) updateLive(); }
}

// =====================================================================================
// open / close
// =====================================================================================
export function openExaminer(api, hooks) {
  A = api; H = hooks;
  if (!root) buildDom();
  document.body.classList.add('examiner');
  root.classList.remove('hidden'); labelsEl.classList.remove('hidden');
  if (!UNITS[S.type]) S.type = 'rifle';
  H.onFrame = onFrame; H.onClick = onClick; H.close = closeExaminer;
  resetArena();
  if (matchMedia('(pointer: coarse)').matches) A.enableTouchUI();
  return true;
}
function closeExaminer() {
  if (!A) return;
  H.onFrame = H.onClick = H.close = null;
  A.game.timeScale = 1; A.removeReveals();
  if (S.homeFlag) { A.scene.remove(S.homeFlag); S.homeFlag = null; }
  clearRings(); S.blue = S.red = null;
  document.body.classList.remove('examiner'); root?.classList.add('hidden'); labelsEl?.classList.add('hidden');
}

// test hooks
window.__examiner = {
  get state() { return { type: S.type, opp: oppSpec(), redMode: S.redMode, arena: S.arena, speed: S.speed, follow: S.follow, tab: S.tab, open: S.open, rings: S.rings }; },
  pick: (t) => { S.type = t; resetArena(); S.tab = 'test'; renderTabs(); },
  setOpp: (v) => { S.opp = v; resetArena(); }, setRedMode: (v) => { S.redMode = v; applyRedMode(); renderPick(); }, setArena: (v) => { S.arena = v; resetArena(); },
  act, setSpeed, readout: () => readout(), redInfo: () => S.red && { alive: S.red.alive, hp: S.red.hp, maxHp: S.red.maxHp, dealt: S.red.dealt || 0, type: S.red.type },
  blueId: () => S.blue?.id, redId: () => S.red?.id,
  rangeModel: () => S.blue && rangeModel(S.blue), rings: () => { updateRings(); return ringList.map((r) => ({ ...r })); },
  ringLabels: () => { updateRings(); return labelList(); },

  setRing: (k, on) => { S.ringOn[k] = on; }, notes: () => ({ ...notes }), report: buildReport, copy: copyReport, get lastReport() { return S.lastReport; },
  tuning: () => JSON.parse(JSON.stringify(tune)), blueVs: () => S.blue && JSON.parse(JSON.stringify(S.blue.vs)), blueVis: () => S.blue && (S.blue.visR ?? S.blue.def.vis),
  setTune: (t, b, f, v) => { setTune(t, b, f, v); refreshMatrix(); }, resetTune: (t) => { delete tune[t]; saveTune(); },
  minesCount: () => A.mines.length, reveals: () => A.reveals.length,
};
