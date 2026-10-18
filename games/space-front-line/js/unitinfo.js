// Shared unit read-outs used by the Unit Examiner, the Unit Guide and the in-game live-stats card:
//  - unitModel(): the 6-row attack matrix + extra rings (vision, min range, deploy, rocket window, bomb drop, satchel, repair)
//  - readout(): live state of one unit (HP/men, state, target, reload, cooldowns, damage dealt)
// Pure functions: everything game-specific comes in through the `A` API object from main.js (EXAPI).
import { UNITS, BUILDINGS, ABILITIES, BODIES, BODY_KEYS, LVL_MULT, ACC_HIT, CONCEAL_HIT, ACC_SPREAD, ACC_RKT, CONCEAL_SPREAD, BLD_SPREAD, SHELL_LEAD } from './config.js';

export const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1), f0 = (n) => String(Math.round(n));
export const BODY_COLOR = { inf: '#7ddc5a', armor: '#ff8a3d', air: '#4fd6ff', art: '#ff5ab4', truck: '#ffd23f', bld: '#b48cff' };
export const CLASSES = BODY_KEYS.map((k) => ({ k, label: BODIES[k].name, icon: BODIES[k].icon, color: BODY_COLOR[k] }));   // the 6 body types
export const HITSCAN = { mg: true, flak: true, aamg: true };
export const EXTRA = {
  vis: { label: 'Vision', icon: '👁', color: '#f2f6ff' },
  min: { label: 'Min range', icon: '⛔', color: '#ff3b3b' },
  dive: { label: 'Rocket window', icon: '🚀', color: '#ffffff' },
  drop: { label: 'Bomb release', icon: '💣', color: '#ffffff' },
  deploy: { label: 'Deployed range', icon: '⚙️', color: '#ffffff' },
  satchel: { label: 'Satchel reach', icon: '💣', color: '#ff6060' },
  repair: { label: 'Repair radius', icon: '🔧', color: '#8ff7ff' },
};
export const maxR = (vs) => Math.max(0, ...BODY_KEYS.map((b) => (vs[b].lvl > 0 ? vs[b].rng : 0)));

// ground units: rangeOf() = rng (+8 deployed, +5 garrisoned), x(1 + up to .35) when higher than a ground target
// (not for indirect fire, not vs air). validTarget(): AA weapons (flak, aamg) can only target air, everything else only
// ground; the level must be > 0; minRng blocks close targets; buildings measure to the wall.
// aircraft use their own attack-run rules in updatePlane()/attackRun().
// o: { vs, vis, deployed, garrison, bombThrow(speed, fallTime), bombFall(h) }
export function unitModel(def, o = {}) {
  const w = def.wpn, vs = o.vs || def.vs;
  const rows = [], extras = [];
  extras.push({ k: 'vis', r: o.vis ?? def.vis, note: 'spotting radius (forest/ambush/cover hide targets closer in)' });
  const air = def.kind === 'air';
  const bonus = air ? 0 : (o.deployed ? 8 : 0) + (o.garrison ? 5 : 0);
  for (const c of CLASSES) {
    const v = vs[c.k], mult = LVL_MULT[v.lvl] || 0;
    const row = { ...c, lvl: v.lvl, rng: v.rng, acc: v.acc ?? 3, mult, r: 0, can: false, note: '' };
    if (!w) row.note = 'unarmed';
    else if (v.lvl <= 0) row.note = "lvl 0: can't hit";
    else if (c.k === 'air' && !HITSCAN[w]) row.note = `${w} shells can't reach aircraft`;
    else if (v.rng <= 0) row.note = 'range 0';
    else {
      row.can = true; row.r = v.rng + bonus;
      if (air && (w === 'rocket' || w === 'bomb')) row.note = `picks ${c.label} targets within ${v.rng} of the ordered point`;
      else if (air) row.note = 'gun range while loitering (chases planes within 70 of the patrol point)';
      else if (c.k === 'air') row.note = 'no height bonus vs air';
      else row.note = (def.indirect ? 'indirect: no line of sight, needs spotting' : 'needs line of sight; up to +35% from high ground') + (c.k === 'bld' ? ' · measured to the wall' : '') + (bonus ? ` · +${bonus} (${o.deployed ? 'deployed' : 'garrison'})` : '');
      if (def.minRng) row.min = def.minRng;
    }
    row.accInfo = accInfo(def, c.k, v);
    rows.push(row);
  }
  if (def.minRng) extras.push({ k: 'min', r: def.minRng, note: 'cannot fire at targets closer than this' });
  if (w === 'rocket') { const [wn, wx] = def.rocketWin || [14, 38]; extras.push({ k: 'min', r: wn, note: `rockets fire only when the target is more than ${wn} ahead; closer passes extend out and come back around` }); extras.push({ k: 'dive', r: wx, note: `dives within 70, fires 2 rocket pairs when the target is ${wn}–${wx} ahead (splash 4)` }); }
  if (w === 'bomb' && o.bombThrow) { const thr = o.bombThrow(def.speed, o.bombFall(def.alt - 1)); extras.push({ k: 'drop', r: thr, note: `releases ${f0(thr)} before the (predicted) target position: a stick of 6 bombs 2.2 apart centred on it, splash ${def.splash}; closer starts extend out and come back around` }); }
  if (def.ability === 'deploy' && !o.deployed) extras.push({ k: 'deploy', r: maxR(vs) + 8, note: 'range once deployed (+8)' });
  if (def.ability === 'satchel') extras.push({ k: 'satchel', r: 45, note: 'finds the nearest tank/gun/building within 45' });
  if (def.repair) extras.push({ k: 'repair', r: 10, note: 'repairs damaged friendly vehicles within 10 (buildings within 6 of the wall) while idle' });
  return { rows, extras };
}

// ---------- live readout ----------
export function nameOf(e) { return e ? (e.isBld ? BUILDINGS[e.type].name : e.def.name) + (e.team === 'red' ? ' (red)' : '') : '—'; }
const AIR_STATE = { idle: 'circling home', out: 'flying out', loiter: 'loitering', return: 'returning to rearm', rearm: 'rearming' };
export function stateOf(A, u) {
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
export function effRof(A, u) { let r = u.def.rof || 0; if (u.deployed) r *= .4; if (A.game.time < u.suppressedUntil) r *= 2; if (A.isInf(u) && u.speed > .5) r *= 1.6; return r; }
export function readout(A, u) {
  if (!u) return null;
  const def = u.def, t = A.game.time;
  const tgt = u.fireTarget || (u.order?.type === 'attack' ? u.order.target : null) || u.airTarget || null;
  const st = stateOf(A, u);
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
    reload: Math.max(0, u.reload), rof: effRof(A, u), speed: u.speed || 0, maxSpeed: A.isAir(u) ? def.speed : (u.alive ? A.speedOf(u) : 0),
    ability: ab, dealt: u.dealt || 0, shots: u.shots || 0, hits: u.hits || 0, kills: 0,
    alt: A.isAir(u) ? A.pos(u).y : null, ammo: A.isAir(u) ? u.ammo : null, airState: u.airState || null,
    x: A.pos(u).x, z: A.pos(u).z, order: u.order?.type || null,
  };
}
export const bar = (f, cls = '') => `<i class="exbar ${cls}"><i style="width:${Math.max(0, Math.min(1, f)) * 100}%"></i></i>`;

// ---------- accuracy: what the acc level means for this weapon vs this body, in plain numbers ----------
// hit: chance per burst (mg, aamg, flak). spread: sideways wobble of a direct-fire shell (typical +-, the max is 2x).
// he: landing spread of a howitzer shell (+-, uniform). rocket: plane rocket aim offset. bomb: stick spacing.
const pct = (x) => Math.round(x * 100) + '%';
export function accInfo(def, body, v) {
  const w = def.wpn, acc = v?.acc ?? 3;
  if (!w || !v || v.lvl <= 0) return { acc: 0, kind: 'none', text: '' };
  if (HITSCAN[w]) {
    const h = ACC_HIT[acc] ?? .72;
    return { acc, kind: 'hit', hit: h, text: body === 'inf' ? `hit ${pct(h)} · ${pct(h * CONCEAL_HIT)} in cover` : `hit ${pct(h)} per burst` };
  }
  const m = ACC_SPREAD[acc] ?? 1, R = v.rng || def.rng || 30;
  if (w === 'he') {
    const ds = [def.minRng || Math.round(R * .25), Math.round(R * .5), R];
    const at = ds.map((d) => ({ d, s: (2 + d * .045) * m }));
    return { acc, kind: 'he', at, text: 'spread ' + at.map((a, i) => `±${f1(a.s)}${i ? '' : ' m'} @${a.d}`).join(' · ') + ' m' };
  }
  if (w === 'rocket' && def.kind === 'air') { const o = ACC_RKT[acc] || 0; return { acc, kind: 'rocket', off: o, text: o ? `rocket aim ±${o} m` : 'rockets aim dead-on' }; }
  if (w === 'bomb') { const sp = 2.2 * m; return { acc, kind: 'bomb', spacing: sp, text: `stick ±${f1(sp * 2.5)} m (6 bombs ${f1(sp)} m apart)` }; }
  const k = body === 'bld' ? BLD_SPREAD : 1;
  const ds = [Math.max(5, Math.round(R * .3)), Math.round(R * .6), R];
  const at = ds.map((d) => ({ d, s: (.6 + d * .05) * m * k }));
  return { acc, kind: 'spread', at, text: 'wobble ' + at.map((a, i) => `±${f1(a.s)}${i ? '' : ' m'} @${a.d}`).join(' · ') + ' m' + (body === 'bld' ? ' (big target)' : '') };
}
export const ACC_LEGEND = [
  ['🎯', 'Accuracy level', 'acc 1–5 per body. 3 = the normal shell spread; MG/flak levels are hit chances.'],
  ['🔫', 'MG, flak, fighter guns', `roll a hit per burst: acc 1–5 = ${ACC_HIT.slice(1).map(pct).join(' / ')}.`],
  ['🌲', 'Concealment', `infantry in forest, town, a house or on ambush: MG hit chance ×${CONCEAL_HIT.toFixed(2)} (72% → 50%). Any concealed target: shell wobble ×${CONCEAL_SPREAD}.`],
  ['💥', 'Shells & bazookas', `sideways wobble ±(0.6 + 0.05 × distance) × acc factor (acc 1–5 = ×${ACC_SPREAD.slice(1).join(' / ×')}); the worst shot is 2× that. Buildings are big: ×${BLD_SPREAD}.`],
  ['🏃', 'Moving targets', `direct-fire shells lead ${Math.round(SHELL_LEAD * 100)}% of the target's motion, so fast movers get missed more. Howitzer shells do not lead. Bombers lead exactly; plane rockets aim at the current spot.`],
  ['💣', 'Howitzer & bomber', 'howitzer: landing spread ±(2 + 0.045 × distance) × acc factor. Bomber: 6 bombs, 2.2 m apart × acc factor, centred on the aim point.'],
];
