/* Carrier Traits: simulation (no DOM). Browser: window.CVSim. Node: module.exports. */
(function (root) {
'use strict';
const W = 3000, H = 3000, TICK = 0.1, FG = 60, FC = W / FG;
const rng32 = (seed) => { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const D = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------- data ----------
const PT = {
  F: { icon: '🛩', name: 'Fighter', spd: 70, end: 48 },
  B: { icon: '💣', name: 'Dive bomber', spd: 57, end: 48 },
  T: { icon: '🐟', name: 'Torpedo plane', spd: 51, end: 51 },
  S: { icon: '🔭', name: 'Scout', spd: 60, end: 71 },
};
const UT = {
  CV: { icon: '🛳', name: 'Carrier', hp: 100, spd: 7.5, eye: 320, aa: 1, len: 46, wid: 9, ev: 0.9 },
  DD: { icon: '🚤', name: 'Destroyer', hp: 60, spd: 9.75, eye: 290, aa: 0.9, len: 22, wid: 4, ev: 0.62, pts: 3 },
  CA: { icon: '⛴', name: 'Cruiser', hp: 120, spd: 9.0, eye: 320, aa: 2, len: 32, wid: 6, ev: 0.8, pts: 5 },
  PB: { icon: '🚤', name: 'Patrol boat', hp: 24, spd: 5.25, eye: 330, aa: 0.35, len: 14, wid: 3, ev: 0.62, pts: 2 },
  AK: { icon: '🚢', name: 'Cargo ship', hp: 55, spd: 3.3, eye: 250, aa: 0.25, len: 24, wid: 5, ev: 1.1, pts: 3 },
  CVL: { icon: '🛳', name: 'Light carrier', hp: 100, spd: 6.75, eye: 330, aa: 0.9, len: 36, wid: 8, ev: 0.85, pts: 10 },
  ECV: { icon: '🛳', name: 'Fleet carrier', hp: 150, spd: 6.75, eye: 330, aa: 1.2, len: 44, wid: 9, ev: 0.9, pts: 12 },
  BASE: { icon: '🏝', name: 'Air base', hp: 220, spd: 0.0, eye: 360, aa: 2.2, len: 0, wid: 0, ev: 1.35, pts: 8 },
};
const TREES = [['deck', '🛫', 'Flight Deck'], ['hangar', '🛩', 'Hangar & Air Group'], ['pilots', '🎖', 'Pilots'], ['scout', '📡', 'Scouting & Radar'], ['dc', '🧯', 'Damage Control'], ['ship', '🚢', 'Ship'], ['esc', '🛡', 'Escorts']];
// [tree, id, icon, name, cost, requires, effect]
const TRAITS = [
  ['deck', 'drill', '⏫', 'Deck Drill', 3, null, '⏫ spot & ⚙ arm −30%, refuel −25%'],
  ['deck', 'cats', '🛫', 'Fast Launch', 4, 'drill', '🛫 launch 2→1.1 s · 🛬 land 2.4→1.5 s'],
  ['deck', 'park', '🅿', 'Deck Park+', 4, 'drill', '🅿 deck spots 8→12 (bigger waves)'],
  ['deck', 'barrier', '🧱', 'Crash Barrier', 5, 'cats', '🛬 land while planes are spotted'],
  ['hangar', 'vf', '🛩', 'Fighters +3', 3, null, '🛩 +3 fighters'],
  ['hangar', 'vs', '🔭', 'Scouts +2', 3, null, '🔭 +2 scouts'],
  ['hangar', 'vt', '🐟', 'Torpedo Squadron', 5, null, '🐟 +4 torpedo planes (new type)'],
  ['hangar', 'vb', '💣', 'Bombers +3', 4, 'vf', '💣 +3 dive bombers'],
  ['hangar', 'big', '🏗', 'Big Hangar', 7, 'vb', '🛩+2 💣+2 🐟+2'],
  ['pilots', 'gun', '🎯', 'Gunnery', 3, null, '🛩 dogfight kills ×1.35'],
  ['pilots', 'dive', '💣', 'Dive School', 4, null, '💣 bomb aim ×1.3'],
  ['pilots', 'torp', '🐟', 'Torpedo Drill', 4, 'dive', '🐟 torpedo aim ×1.35'],
  ['pilots', 'ace', '⭐', 'Ace Program', 5, 'gun', '⭐ XP ×1.6, ace at 3 kills (aces ×1.25)'],
  ['pilots', 'night', '🌙', 'Night Ops', 5, null, '🌙 launch & land at night, night aim ↑'],
  ['pilots', 'asr', '🛟', 'Air-Sea Rescue', 3, null, '🛟 75% of downed pilots saved'],
  ['scout', 'lr', '⛽', 'Long-Range Scouts', 3, null, '🔭 scout fuel +40%'],
  ['scout', 'radar', '📡', 'Air Radar', 5, null, '📡 see raids at 900 → 🛡 CAP meets them far out'],
  ['scout', 'photo', '📷', 'Recon Photos', 4, 'lr', '🔭 scout eyes +30%, contacts never fade, see ⚙ arming'],
  ['scout', 'surf', '🌊', 'Surface Radar', 4, 'radar', '📡 see ships 550 day & night'],
  ['scout', 'intel', '🗝', 'Codebreakers', 6, 'photo', '🗝 enemy carrier/base area circled at start'],
  ['dc', 'fire', '🧯', 'Fire Teams', 3, null, '🔥 fires out 2× faster, no spreading'],
  ['dc', 'pumps', '💧', 'Counter-flooding', 3, null, '💧 flooding drained 3× faster'],
  ['dc', 'purge', '⛽', 'Fuel Purge', 4, null, '💥 armed-plane explosions −60%'],
  ['dc', 'repair', '🔧', 'Repair at Sea', 6, 'fire', '🔧 hull repairs when no fire/flood'],
  ['ship', 'eng', '⚙', 'Engines', 3, null, '💨 speed +30%'],
  ['ship', 'aa1', '🔫', 'AA Guns', 4, null, '🔫 AA ×1.5'],
  ['ship', 'rudder', '↩', 'Hard Rudder', 3, null, '🐟 torpedo hits on you −35%'],
  ['ship', 'armor', '🛡', 'Armored Deck', 5, null, '❤ bomb damage −25%'],
  ['ship', 'aa2', '🔫', 'Bofors 40 mm', 6, 'aa1', '🔫 AA ×1.5 again'],
  ['esc', 'dd', '🚤', 'Destroyer Screen', 4, null, '🚤🚤 2 destroyers: AA + lookouts'],
  ['esc', 'picket', '📡', 'Radar Picket', 5, 'dd', '🚤📡 destroyer 600 ahead with air radar'],
  ['esc', 'dd2', '🚤', 'More Destroyers', 4, 'dd', '🚤🚤 +2 destroyers'],
  ['esc', 'ca', '⛴', 'Cruiser', 7, 'dd', '⛴ cruiser: heavy AA + floatplane eyes'],
].map(([tree, id, icon, name, cost, req, fx]) => ({ tree, id, icon, name, cost, req, fx }));
const TR = Object.fromEntries(TRAITS.map((t) => [t.id, t]));
const ZONES = [
  { icon: '🏝', name: 'Coral Shoals', kinds: ['sweep', 'convoy'] },
  { icon: '🌋', name: 'Volcano Strait', kinds: ['sweep', 'convoy', 'base'] },
  { icon: '🌙', name: 'Moon Reef', kinds: ['convoy', 'base', 'sweep'] },
  { icon: '⛈', name: 'Storm Sea', kinds: ['base', 'convoy', 'sweep'] },
  { icon: '🏯', name: 'Dragon Gate', kinds: ['base', 'convoy', 'sweep'] },
];
const KINDS = {
  sweep: { icon: '🚤', name: 'Patrol sweep', goal: 'Sink the patrol boats' },
  convoy: { icon: '🚢', name: 'Convoy raid', goal: 'Sink the cargo ships before they escape' },
  base: { icon: '🏝', name: 'Base strike', goal: 'Knock out the air base' },
  gate: { icon: '⚔', name: 'Carrier battle', goal: 'Sink the enemy carrier' },
};
const GATE_NEED = 2;

function groupCounts(tr) {
  const c = { F: 6, B: 6, T: 0, S: 2 };
  if (tr.vf) c.F += 3; if (tr.vs) c.S += 2; if (tr.vt) c.T += 4; if (tr.vb) c.B += 3;
  if (tr.big) { c.F += 2; c.B += 2; if (tr.vt) c.T += 2; }
  return c;
}
function normRoster(prof) {
  const c = groupCounts(prof.traits || {}); const out = []; let nid = 1;
  for (const k of ['F', 'B', 'T', 'S']) {
    const have = (prof.roster || []).filter((p) => p.type === k).sort((a, b) => b.xp - a.xp).slice(0, c[k]);
    for (const p of have) out.push({ type: k, xp: p.xp | 0, kills: p.kills | 0, ace: !!p.ace });
    for (let i = have.length; i < c[k]; i++) out.push({ type: k, xp: 0, kills: 0, ace: false });
  }
  for (const p of out) p.id = nid++;
  prof.roster = out; return out;
}
const stars = (xp) => (xp >= 50 ? 3 : xp >= 25 ? 2 : xp >= 10 ? 1 : 0);

// ---------- mission setup ----------
function create(prof, zone, kind, seed) {
  const tr = prof.traits || {}, L = zone + 1;
  const S = {
    W, H, t: 0, zone, kind, L, seed, rng: rng32(seed * 7919 + zone * 131 + kind.length * 17), tr, units: [], flights: [], planes: [], feed: [], fx: [],
    nid: 1, known: null, knownFirstT: null, earned: 0, pts: {}, done: false, doneT: 0, over: false, result: null, aar: null,
    fog: new Uint8Array(FG * FG), islands: [], wp: null, capWant: 2, alert: 0, cAcc: 0, sAcc: 0,
    nightT: L >= 3 ? 300 : 1e9, night: false, limit: 720, startHour: L >= 3 ? 13 : 6,
    eGun: 0.9 + 0.06 * L, eAim: 0.7 + 0.07 * L, eAA: 0.85 + 0.1 * L,
    stats: { sunk: 0, sunkBy: {}, kills: 0, hits: 0, drops: 0, lost: 0, saved: 0, ditched: 0, deckBoom: 0, hitOnDeck: 0, noCap: 0, reported: 0, scoutsStopped: 0, cleanRec: 0, emptyStrikes: 0, bingo: 0, raidsDefended: 0, raidsHit: 0, hitsTaken: 0, fireTime: 0, caught: 0, finds: 0, escaped: 0, nightCrash: 0, newAces: 0, firstStrike: false, foundFirst: null, sorties: 0, escLost: 0 },
    obj: { need: 1, got: 0 }, ghosts: true,
  };
  const r = S.rng, rr = (a, b) => a + (b - a) * r();
  // player group
  const cv = addUnit(S, 'CV', 'P', 1500, 2450); cv.hdg = -Math.PI / 2; cv.maxHp = cv.hp = 100;
  cv.aa = (tr.aa1 ? 1.5 : 1) * (tr.aa2 ? 1.5 : 1); S.cv = cv;
  const escs = [];
  if (tr.dd) escs.push([140, -150], [140, 150]);
  if (tr.dd2) escs.push([-170, -170], [-170, 170]);
  for (const o of escs) { const u = addUnit(S, 'DD', 'P', cv.x + o[1], cv.y - o[0]); u.off = o; u.aa *= (tr.aa1 ? 1.2 : 1); }
  if (tr.ca) { const u = addUnit(S, 'CA', 'P', cv.x, cv.y + 220); u.off = [-220, 0]; u.aa *= (tr.aa1 ? 1.2 : 1); u.float = true; }
  if (tr.picket) { const u = addUnit(S, 'DD', 'P', cv.x, cv.y - 600); u.off = [600, 0]; u.picket = true; }
  // air group
  const ros = normRoster(prof);
  for (const p of ros) S.planes.push({ id: p.id, side: 'P', type: p.type, xp: p.xp, kills: p.kills, ace: p.ace, state: 'hangar', readyT: 0, armed: false, ros: p });
  S.deck = { park: tr.park ? 12 : 8, spotted: [], jobs: [], job: null, phase: 'idle', tmr: 0, rtmr: 0 };
  // islands
  const nIs = 5 + Math.floor(r() * 3);
  for (let i = 0; i < nIs; i++) {
    let x, y, k = 0; do { x = rr(250, 2750); y = rr(250, 2300); k++; } while (k < 30 && (D(x, y, 1500, 2450) < 600 || S.islands.some((s) => D(x, y, s.x, s.y) < s.r + 260)));
    S.islands.push(mkIsland(r, x, y, rr(50, 150)));
  }
  const grpOff = (u, offs) => offs.map((o) => { const e = addUnit(S, 'DD', 'E', u.x - o[1], u.y + o[0]); e.lead = u; e.off = o; return e; });
  if (kind === 'sweep') {
    const n = 2 + L; S.obj.need = n;
    for (let i = 0; i < n; i++) {
      const x = rr(350, 2650), y = rr(700, 1800); const u = addUnit(S, 'PB', 'E', x, y); u.obj = true;
      u.route = [[x, y], [clamp(x + rr(-500, 500), 150, 2850), clamp(y + rr(-400, 400), 150, 1900)], [clamp(x + rr(-500, 500), 150, 2850), clamp(y + rr(-400, 400), 150, 1900)]]; u.ri = 1;
    }
    if (L >= 3) { const d = addUnit(S, 'DD', 'E', rr(600, 2400), rr(500, 1200)); d.route = [[d.x, d.y], [rr(400, 2600), rr(400, 1500)]]; d.ri = 1; }
    S.obj.label = '🚤';
  } else if (kind === 'convoy') {
    const n = 3 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0), west = r() < 0.5, y0 = rr(900, 1500), y1 = rr(700, 1500);
    const sx = west ? 200 : 2800, ex = west ? 2950 : 50;
    S.obj.need = n - 1; S.obj.label = '🚢';
    const lead = { x: sx, y: y0 };
    for (let i = 0; i < n; i++) {
      const u = addUnit(S, 'AK', 'E', sx + (west ? -1 : 1) * i * 70, y0); u.obj = true; u.route = [[(sx + ex) / 2, (y0 + y1) / 2 + rr(-200, 200)], [ex, y1]]; u.ri = 0; u.cvy = true; u.exitX = ex; u.west = west; u.hdg = west ? 0 : Math.PI;
      u.route = u.route.map((p) => [p[0] + (west ? -1 : 1) * i * 70, p[1]]);
    }
    const nd = Math.min(1 + Math.floor(L / 2), 3);
    const aks = S.units.filter((u) => u.type === 'AK');
    for (let i = 0; i < nd; i++) { const a = aks[i % aks.length]; const d = addUnit(S, 'DD', 'E', a.x, a.y - 90); d.lead = a; d.off = [0, i % 2 ? 90 : -90]; }
    void lead;
  } else if (kind === 'base') {
    const bx = rr(700, 2300), by = rr(450, 850);
    S.islands.push(mkIsland(r, bx, by, 190, true));
    const b = addUnit(S, 'BASE', 'E', bx, by); b.obj = true; b.maxHp = b.hp = 180 + 40 * L;
    mkAir(S, b, { F: 3 + L, B: 3 + L, T: L >= 2 ? L : 0, S: 2 }, 2);
    S.obj.label = '🏝';
    for (let i = 0; i < 1 + Math.floor(L / 2); i++) { const a = (i % 2 ? 0.6 : -0.6) + Math.PI / 2; const u = addUnit(S, 'PB', 'E', bx + Math.cos(a) * 650, by + Math.sin(a) * 650); u.route = [[u.x, u.y], [u.x + 300, u.y + 100]]; u.ri = 1; }
  } else {
    const x = rr(600, 2400), y = rr(550, 1000);
    const c = addUnit(S, L === 1 ? 'CVL' : 'ECV', 'E', x, y); c.obj = true; c.hdg = Math.PI / 2; c.home0 = [x, y];
    if (L > 1) c.maxHp = c.hp = 140 + 15 * L;
    mkAir(S, c, L === 1 ? { F: 4, B: 4, T: 0, S: 2 } : { F: 4 + L, B: 3 + L, T: L, S: 2 }, L === 1 ? 2 : 3);
    const offs = [[160, 0], [-140, 150], [-140, -150]].slice(0, Math.min(L, 3)); grpOff(c, offs);
    if (L >= 3) { const ca = addUnit(S, 'CA', 'E', x, y - 200); ca.lead = c; ca.off = [0, 220]; }
    if (L >= 2) { const u = addUnit(S, 'PB', 'E', x + rr(-500, 500), y + 700); u.route = [[u.x, u.y], [u.x + rr(-400, 400), u.y + 300]]; u.ri = 1; }
    S.obj.label = '🛳';
  }
  for (const u of S.units) if (u.side === 'E') { u.aa *= S.eAA; }
  // escort & lead headings
  if (tr.intel) { const t = S.units.find((u) => u.side === 'E' && (u.air || u.type === 'AK')); if (t) S.intel = { x: t.x + rr(-250, 250), y: t.y + rr(-250, 250), r: 550 }; }
  S.capWant = 2;
  reveal(S, cv.x, cv.y, 320);
  feed(S, KINDS[kind].icon, KINDS[kind].goal, cv);
  return S;
}
function mkIsland(r, x, y, rad, base) {
  const pts = [], n = 14; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const k = rad * (0.7 + 0.45 * r()); pts.push([x + Math.cos(a) * k, y + Math.sin(a) * k * 0.8]); }
  return { x, y, r: rad, pts, base: !!base };
}
function addUnit(S, type, side, x, y) {
  const t = UT[type];
  const u = { id: S.nid++, type, side, x, y, hdg: -Math.PI / 2, spd: 0, maxSpd: t.spd, hp: t.hp, maxHp: t.hp, aa: t.aa, eye: t.eye, fire: 0, flood: 0, sunk: false, seenT: -1e9, lx: x, ly: y, found: false, rep: 0, wake: [] };
  S.units.push(u); return u;
}
function mkAir(S, u, cnt, cap) {
  u.air = { pl: [], phase: 'idle', armT: 0, nextScout: 12 + S.rng() * 15, capWant: cap, armedN: 0 };
  for (const k of ['F', 'B', 'T', 'S']) for (let i = 0; i < cnt[k]; i++) u.air.pl.push({ id: S.nid++, side: 'E', type: k, xp: 10 * S.L, state: 'home', readyT: 0, home: u });
}

// ---------- helpers ----------
const has = (S, id) => !!S.tr[id];
function feed(S, icon, txt, at, cls) { S.feed.push({ t: S.t, icon, txt, x: at ? at.x : null, y: at ? at.y : null, cls: cls || '' }); if (S.feed.length > 80) S.feed.shift(); }
function earn(S, n, icon, why, at) { if (!n) return; S.earned += n; S.pts[why] = (S.pts[why] || 0) + n; if (at) S.fx.push({ k: 'txt', x: at.x, y: at.y, s: '+' + n + '⭐', t: S.t, life: 2.5 }); }
function reveal(S, x, y, r) {
  const c0 = Math.max(0, Math.floor((x - r) / FC)), c1 = Math.min(FG - 1, Math.floor((x + r) / FC)), r0 = Math.max(0, Math.floor((y - r) / FC)), r1 = Math.min(FG - 1, Math.floor((y + r) / FC));
  for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) if (D(x, y, (i + 0.5) * FC, (j + 0.5) * FC) < r) S.fog[j * FG + i] = 1;
}
const pRdy = (S, p) => p.state === 'hangar' && p.readyT <= S.t;
const ready = (S, type) => S.planes.filter((p) => p.type === type && pRdy(S, p));
const flSpd = (f) => Math.min(...f.planes.map((p) => PT[p.type].spd));
const endur = (S, p) => PT[p.type].end * (p.type === 'S' && p.side === 'P' && has(S, 'lr') ? 1.4 : 1);
function strikeRadius(S, types) { let r = 1e9; for (const k of types) r = Math.min(r, PT[k].spd * PT[k].end * 0.42); return r; }
const nightNow = (S) => S.t >= S.nightT;
const clockMin = (S) => S.startHour * 60 + S.t;
function gunMul(S, p) { if (p.side === 'E') return S.eGun; return (has(S, 'gun') ? 1.35 : 1) * (1 + 0.12 * stars(p.xp)) * (p.ace ? 1.25 : 1); }
function aimMul(S, p) { if (p.side === 'E') return S.eAim; return (p.type === 'B' && has(S, 'dive') ? 1.3 : 1) * (p.type === 'T' && has(S, 'torp') ? 1.35 : 1) * (1 + 0.1 * stars(p.xp)); }
function gainXP(S, p, n) { if (p.side !== 'P') return; p.xp += n * (has(S, 'ace') ? 1.6 : 1); }
function planeLost(S, p, how) {
  p.state = 'lost';
  if (p.side === 'P') {
    S.stats.lost++; if (how === 'ditch') S.stats.ditched++;
    const save = has(S, 'asr') ? 0.75 : how === 'ditch' ? 0.45 : 0.25;
    p.saved = S.rng() < save; if (p.saved) S.stats.saved++;
  }
}

// ---------- orders ----------
function setCourse(S, x, y) { S.wp = { x: clamp(x, 40, W - 40), y: clamp(y, 40, H - 40) }; }
function orderScout(S, x, y) {
  if (S.over) return false;
  const busy = S.deck.jobs.filter((j) => j.kind === 'scout').length + (S.deck.job && S.deck.job.kind === 'scout' ? S.deck.job.rem.length : 0);
  if (ready(S, 'S').length <= busy) { feed(S, '⏳', 'No scout ready', S.cv, 'warn'); return false; }
  S.deck.jobs.push({ kind: 'scout', n: 1, tx: x, ty: y }); feed(S, '🔭', 'Scout queued', S.cv); return true;
}
function orderStrike(S, tgt, x, y) {
  if (S.over) return false;
  if (S.deck.jobs.some((j) => j.kind === 'strike') || (S.deck.job && S.deck.job.kind === 'strike')) { feed(S, '⏳', 'A strike is already on deck', S.cv, 'warn'); return false; }
  if (!ready(S, 'B').length && !ready(S, 'T').length) { feed(S, '⏳', 'No bombers ready', S.cv, 'warn'); return false; }
  S.deck.jobs.push({ kind: 'strike', tgt: tgt ? tgt.id : null, tx: tgt ? tgt.lx : x, ty: tgt ? tgt.ly : y }); feed(S, '💥', 'Strike queued', S.cv); return true;
}
function setCap(S, n) { S.capWant = clamp(n | 0, 0, 12); }
function recoverAll(S) {
  let n = 0; for (const f of S.flights) if (f.side === 'P' && f.state !== 'pattern' && f.state !== 'home') { f.state = 'home'; n++; }
  if (n) feed(S, '🛬', 'All planes recalled', S.cv); return n;
}
function withdraw(S) { if (!S.over) endMission(S, S.done ? 'win' : 'withdraw'); }

// ---------- flights ----------
function newFlight(S, side, kind, home, planes) {
  const f = { id: S.nid++, side, kind, home, planes, x: home.x, y: home.y, hdg: 0, state: 'form', tx: home.x, ty: home.y, tgt: null, fuel: Math.min(...planes.map((p) => endur(S, p))), oa: S.rng() * 6.28, rep: 0, reported: false, seenT: -1e9, lx: 0, ly: 0, threat: false, hitsOnUs: 0, lostAny: false, searchT: 0, pursue: null };
  S.flights.push(f); return f;
}
function addToFlight(S, f, p) { f.planes.push(p); f.fuel = Math.min(f.fuel, endur(S, p) * 0.98 + (f.planes.length > 1 ? 0 : 0)); }
function homeOf(S, f) { return f.side === 'P' ? S.cv : f.home; }
function bingo(S, f) { const h = homeOf(S, f); return f.fuel < D(f.x, f.y, h.x, h.y) / flSpd(f) + 6; }
function flyTo(f, tx, ty, spd, dt) {
  const a = Math.atan2(ty - f.y, tx - f.x), d = D(f.x, f.y, tx, ty); f.hdg = a;
  const s = Math.min(d, spd * dt); f.x += Math.cos(a) * s; f.y += Math.sin(a) * s; return d;
}
function orbit(f, cx, cy, rad, spd, dt) { f.oa += (spd / rad) * dt; const tx = cx + Math.cos(f.oa) * rad, ty = cy + Math.sin(f.oa) * rad; flyTo(f, tx, ty, spd * 1.6, dt); }

function enemyIn(S, side, x, y, r, filt) {
  let best = null, bd = r;
  for (const u of S.units) if (!u.sunk && u.side !== side && (!filt || filt(u))) { const d = D(x, y, u.x, u.y); if (d < bd) { bd = d; best = u; } }
  return best;
}
function stepFlight(S, f, dt) {
  if (!f.planes.length) return;
  const spd = flSpd(f), h = homeOf(S, f), st = f.state;
  const slow = st === 'form' || st === 'pattern' || (st === 'cap' && !f.pursue);
  f.fuel -= dt * (slow ? 0.55 : 1);
  if (f.fuel <= 0) {
    if (f.side === 'P') feed(S, '⛽', f.planes.length + ' ' + PT[f.planes[0].type].icon + ' ditched (no fuel)', f, 'bad');
    for (const p of f.planes) planeLost(S, p, 'ditch'); f.planes = []; return;
  }
  if (!h || h.sunk || h.dead) { // home gone
    if (f.side === 'E') { f.fuel = Math.min(f.fuel, 15); }
  }
  if (st === 'form') { orbit(f, h.x, h.y, 70, spd, dt); return; }
  if (st === 'cap') {
    if (f.pursue && (f.pursue.planes.length === 0 || D(f.pursue.x, f.pursue.y, h.x, h.y) > (f.capR || 500) * 1.3)) f.pursue = null;
    if (f.pursue) flyTo(f, f.pursue.x, f.pursue.y, spd * 1.1, dt); else orbit(f, h.x, h.y, 110, spd, dt);
    if (f.fuel < 24 + D(f.x, f.y, h.x, h.y) / spd) { f.state = 'home'; f.pursue = null; }
    return;
  }
  if (st === 'out' || st === 'search') {
    if (f.kind === 'strike' && f.tgt) {
      const t = f.tgt;
      if (t.sunk) { f.tgt = null; }
      else {
        const seen = f.side === 'P' ? (S.t - t.seenT < 3 || D(f.x, f.y, t.x, t.y) < 260) : D(f.x, f.y, t.x, t.y) < 320;
        if (seen) { f.tx = t.x; f.ty = t.y; }
      }
    }
    if (st === 'out') {
      const d = flyTo(f, f.tx, f.ty, spd, dt);
      if (bingo(S, f)) { f.state = 'home'; if (f.side === 'P' && f.kind === 'strike') { S.stats.bingo++; feed(S, '⛽', 'Strike turned back: bingo fuel', f, 'bad'); } return; }
      if (d < 30) {
        if (f.kind === 'scout') { f.state = 'search'; f.searchT = 16; f.cx = f.x; f.cy = f.y; }
        else if (f.kind === 'strike') { if (!tryAttack(S, f)) { f.state = 'search'; f.searchT = 12; f.cx = f.x; f.cy = f.y; } }
      }
      return;
    }
    // search
    f.searchT -= dt; orbit(f, f.cx, f.cy, f.kind === 'scout' ? 230 : 160, spd, dt);
    if (f.kind === 'strike' && tryAttack(S, f)) return;
    if (f.searchT <= 0 || bingo(S, f)) {
      f.state = 'home';
      if (f.kind === 'strike' && f.side === 'P') { S.stats.emptyStrikes++; feed(S, '❓', 'Strike found nothing there', f, 'bad'); }
    }
    return;
  }
  if (st === 'attack') {
    if (f.tgt && !f.tgt.sunk) { f.tx = f.tgt.x; f.ty = f.tgt.y; }
    flyTo(f, f.tx, f.ty, spd * 1.2, dt); f.atkT -= dt;
    if (f.atkT <= 0) { resolveAttack(S, f); f.state = 'home'; }
    return;
  }
  if (st === 'home') {
    if (!h || h.sunk || h.dead) { flyTo(f, f.x, f.y - 1, spd, dt); return; }
    const d = flyTo(f, h.x, h.y, spd, dt);
    if (d < 70) {
      if (f.side === 'P') { f.state = 'pattern'; }
      else { for (const p of f.planes) { p.state = 'home'; p.readyT = S.t + 40; } f.planes = []; }
    }
    return;
  }
  if (st === 'pattern') { orbit(f, h.x, h.y, 90, spd, dt); }
}
function tryAttack(S, f) {
  let t = f.tgt && !f.tgt.sunk && D(f.x, f.y, f.tgt.x, f.tgt.y) < 300 ? f.tgt : null;
  if (!t) {
    if (f.side === 'P') t = enemyIn(S, 'P', f.x, f.y, 300, (u) => !u.dead);
    else { t = enemyIn(S, 'E', f.x, f.y, 330, (u) => u.type === 'CV'); if (!t) t = enemyIn(S, 'E', f.x, f.y, 300); }
  }
  if (!t || t.dead) return false;
  f.tgt = t; f.state = 'attack'; f.atkT = 3; f.tx = t.x; f.ty = t.y; return true;
}
const EV = (u) => UT[u.type].ev;
function resolveAttack(S, f) {
  let t = f.tgt; if (!t || t.sunk) return;
  const night = nightNow(S), nm = night ? (f.side === 'P' && has(S, 'night') ? 0.8 : 0.5) : 1;
  let hitsHere = 0;
  for (const p of f.planes) {
    if (p.type !== 'B' && p.type !== 'T') continue;
    if (p.type === 'T' && t.type === 'BASE') continue;
    let tgt = t;
    if (f.side === 'E') { // spread over the group
      const near = S.units.filter((u) => u.side === 'P' && !u.sunk && D(u.x, u.y, t.x, t.y) < 260);
      const wsum = near.reduce((a, u) => a + (u.type === 'CV' ? 3 : 1), 0); let k = S.rng() * wsum;
      for (const u of near) { k -= u.type === 'CV' ? 3 : 1; if (k <= 0) { tgt = u; break; } }
    }
    let pr = (p.type === 'B' ? 0.44 : 0.4) * aimMul(S, p) * EV(tgt) * nm;
    if (tgt.type === 'CV' && p.type === 'T' && has(S, 'rudder')) pr *= 0.65;
    if (f.side === 'P') S.stats.drops++; else S.stats.eDrops = (S.stats.eDrops || 0) + 1;
    if (S.rng() < pr) {
      hitsHere++; if (f.side === 'E') S.stats.eHits = (S.stats.eHits || 0) + 1; if (f.side === 'P') { S.stats.hits++; gainXP(S, p, 4); }
      damage(S, tgt, p.type, f);
      S.fx.push({ k: 'boom', x: tgt.x + (S.rng() - 0.5) * 20, y: tgt.y + (S.rng() - 0.5) * 20, t: S.t, life: 1.6, big: 1 });
    } else S.fx.push({ k: 'splash', x: tgt.x + (S.rng() - 0.5) * 70, y: tgt.y + (S.rng() - 0.5) * 70, t: S.t, life: 1.2 });
  }
  if (f.side === 'P') f.didAttack = true;
  if (f.side === 'E') { f.hitsOnUs += hitsHere; if (hitsHere) { S.stats.raidsHit++; } else { S.stats.raidsDefended++; earn(S, 3, '🛡', 'Raid beaten off', S.cv); feed(S, '🛡', 'Raid beaten off: no hits', S.cv, 'good'); } f.resolved = true; }
  else if (hitsHere) feed(S, '🎯', hitsHere + ' hit' + (hitsHere > 1 ? 's' : '') + ' on ' + UT[t.type].name, t, 'good');
  else feed(S, '💦', 'All missed ' + UT[t.type].name, t);
}
function damage(S, u, kind, f) {
  if (u.sunk) return;
  if (u.side === 'P') {
    let dmg = kind === 'B' ? 16 : 22;
    if (u.type === 'CV') {
      S.stats.hitsTaken++;
      if (kind === 'B') { if (has(S, 'armor')) dmg *= 0.75; u.fire += 16; } else { dmg *= 0.9; u.flood += 22; }
      const dk = S.deck.spotted; if (dk.length && kind === 'B') {
        S.stats.hitOnDeck++; let boom = 0;
        const pm = has(S, 'purge') ? 0.4 : 1;
        for (const p of dk.slice()) {
          const armed = p.type === 'B' || p.type === 'T';
          if (S.rng() < (armed ? 0.8 : 0.35) * pm) { boom++; dmg += armed ? 5 : 2; u.fire += armed ? 8 : 4; planeLost(S, p, 'deck'); dk.splice(dk.indexOf(p), 1); }
        }
        if (boom) { S.stats.deckBoom += boom; feed(S, '💥', boom + ' fueled/armed planes blew up on deck!', u, 'bad'); }
      }
      feed(S, kind === 'B' ? '💣' : '🐟', (kind === 'B' ? 'Bomb' : 'Torpedo') + ' hit on our carrier!', u, 'bad');
    } else { if (kind === 'B') u.fire += 10; else u.flood += 20; feed(S, '💥', UT[u.type].name + ' hit', u, 'bad'); }
    u.hp -= dmg; S.alert = S.t;
  } else {
    let dmg = kind === 'B' ? 32 : 45;
    if (u.air && u.air.phase === 'arm' && kind === 'B') {
      const n = u.air.pl.filter((p) => p.state === 'deck').length;
      if (n) { dmg += Math.min(40, n * 7); u.fire += 15; for (const p of u.air.pl) if (p.state === 'deck') p.state = 'lost'; u.air.phase = 'idle'; S.stats.caught++; earn(S, 3, '💥', 'Caught them arming', u); feed(S, '💥', 'Caught them arming! ' + n + ' planes blew up', u, 'good'); }
    }
    if (kind === 'B') u.fire += 10; else u.flood += 20;
    u.hp -= dmg;
    if (u.side === 'E' && (u.type === 'CVL' || u.type === 'ECV') && S.knownFirstT == null && !S.stats.firstStrike) S.stats.firstStrike = true;
  }
  checkSunk(S, u);
}
function checkSunk(S, u) {
  if (u.sunk || u.dead || u.hp > 0) return;
  if (u.type === 'BASE') {
    u.dead = true; u.hp = 0; S.stats.sunk++; S.stats.sunkBy.BASE = 1; earn(S, UT.BASE.pts, '🏝', 'Base knocked out', u); feed(S, '🏝', 'Air base knocked out!', u, 'good');
    if (u.obj) S.obj.got++; S.fx.push({ k: 'boom', x: u.x, y: u.y, t: S.t, life: 3, big: 3 }); return;
  }
  u.sunk = true; u.hp = 0; S.fx.push({ k: 'boom', x: u.x, y: u.y, t: S.t, life: 3, big: 3 });
  if (u.side === 'E') {
    S.stats.sunk++; S.stats.sunkBy[u.type] = (S.stats.sunkBy[u.type] || 0) + 1; earn(S, UT[u.type].pts, '🚢', 'Ships sunk', u); feed(S, '🌊', UT[u.type].name + ' sunk!', u, 'good');
    if (u.obj) S.obj.got++;
    if (u.air) for (const p of u.air.pl) if (p.state !== 'air') p.state = 'lost';
  } else if (u.type !== 'CV') { S.stats.escLost++; feed(S, '🌊', 'Our ' + UT[u.type].name + ' sunk', u, 'bad'); }
}

// ---------- deck (player) ----------
function deckStep(S, dt) {
  const dk = S.deck, cv = S.cv, tr = S.tr;
  const spotT = 1.6 * (tr.drill ? 0.7 : 1), launchT = tr.cats ? 1.1 : 2, recT = tr.cats ? 1.5 : 2.4;
  const pattern = S.flights.filter((f) => f.side === 'P' && f.state === 'pattern' && f.planes.length);
  dk.closed = cv.fire > 30; dk.nightBlock = nightNow(S) && !tr.night;
  if (dk.closed) return;
  const canRecWhile = tr.barrier && (dk.phase === 'spot' || dk.phase === 'arm');
  if ((dk.phase === 'recover' || canRecWhile) && pattern.length) {
    dk.rtmr -= dt;
    if (dk.rtmr <= 0) {
      dk.rtmr = recT; const f = pattern.sort((a, b) => a.fuel - b.fuel)[0]; const p = f.planes.pop();
      if (dk.nightBlock && S.rng() < 0.15) { planeLost(S, p, 'crash'); S.stats.nightCrash++; feed(S, '🌙', 'Night landing crash', cv, 'bad'); }
      else { p.state = 'hangar'; p.readyT = S.t + (p.type === 'B' || p.type === 'T' ? 22 : 15) * (tr.drill ? 0.75 : 1); gainXP(S, p, 2); S.stats.sorties++; }
      if (!f.planes.length) { S.flights.splice(S.flights.indexOf(f), 1); if (f.kind === 'strike' && !f.lostAny && f.didAttack) { S.stats.cleanRec++; earn(S, 1, '🛬', 'Clean recoveries', cv); feed(S, '🛬', 'Strike home: clean recovery', cv, 'good'); } }
    }
  }
  if (dk.phase === 'recover') { if (!pattern.length) { dk.phase = dk.job ? 'spot' : 'idle'; dk.tmr = spotT; } return; }
  if (dk.phase === 'idle') {
    if (pattern.length) { dk.phase = 'recover'; dk.rtmr = recT; return; }
    if (!dk.jobs.length || dk.nightBlock) return;
    const j = dk.jobs.shift(); let pl = [];
    if (j.kind === 'scout') pl = ready(S, 'S').slice(0, j.n);
    else if (j.kind === 'cap') pl = ready(S, 'F').slice(0, j.n);
    else {
      const capAir = capCount(S);
      const reserve = Math.max(0, S.capWant - capAir);
      const fs = ready(S, 'F'); const esc = fs.slice(0, Math.max(0, fs.length - reserve));
      const bs = ready(S, 'B').concat(ready(S, 'T'));
      // interleave escorts so each deck load carries some
      const tot = esc.length + bs.length; let ei = 0, bi = 0;
      for (let i = 0; i < tot; i++) { if (ei < esc.length && (bi >= bs.length || ei / esc.length <= bi / bs.length)) pl.push(esc[ei++]); else pl.push(bs[bi++]); }
      if (capAir === 0) { S.stats.noCap++; feed(S, '⚠', 'Strike launching with no CAP overhead', cv, 'warn'); }
      if (!bs.length) pl = [];
    }
    if (!pl.length) { if (j.kind !== 'cap') feed(S, '⏳', 'No planes ready', cv, 'warn'); return; }
    j.rem = pl.slice(); j.all = pl; dk.job = j; dk.phase = 'spot'; dk.tmr = spotT;
    return;
  }
  const j = dk.job;
  if (dk.phase === 'spot') {
    if (!dk.spotted.length && pattern.some((f) => f.fuel < 22)) { dk.phase = 'recover'; dk.rtmr = recT; feed(S, '🛬', 'Low fuel: launch paused to land planes', cv, 'warn'); return; }
    dk.tmr -= dt; if (dk.tmr > 0) return;
    if (j.rem.length && dk.spotted.length < dk.park) { const p = j.rem.shift(); if (p.state !== 'hangar') return; p.state = 'deck'; dk.spotted.push(p); dk.tmr = spotT; }
    if (!j.rem.length || dk.spotted.length >= dk.park) {
      if (!dk.spotted.length) { dk.phase = 'idle'; dk.job = null; return; }
      const heavy = dk.spotted.some((p) => p.type === 'B' || p.type === 'T');
      dk.phase = 'arm'; dk.tmr = (heavy ? 14 : 5) * (tr.drill ? 0.7 : 1); for (const p of dk.spotted) p.armed = true;
    }
    return;
  }
  if (dk.phase === 'arm') { dk.tmr -= dt; if (dk.tmr <= 0) { if (dk.nightBlock) return; dk.phase = 'launch'; dk.tmr = 0.3; } return; }
  if (dk.phase === 'launch') {
    if (dk.nightBlock) return;
    dk.tmr -= dt; if (dk.tmr > 0) return;
    const p = dk.spotted.shift();
    if (p) {
      p.state = 'air'; p.armed = false;
      if (!j.flight) { j.flight = newFlight(S, 'P', j.kind === 'cap' ? 'cap' : j.kind, cv, []); j.flight.tx = j.tx; j.flight.ty = j.ty; j.flight.tgt = j.tgt ? S.units.find((u) => u.id === j.tgt) : null; }
      addToFlight(S, j.flight, p); dk.tmr = launchT;
    }
    if (!dk.spotted.length) {
      const f = j.flight; j.flight = null;
      if (f) { f.state = f.kind === 'cap' ? 'cap' : 'out'; f.fuel = Math.min(...f.planes.map((q) => endur(S, q))) - (f.kind === 'strike' ? 0 : 0); f.formed = true; if (f.kind === 'strike') feed(S, '💥', 'Strike away: ' + iconsOf(f.planes), f); else if (f.kind === 'scout') feed(S, '🔭', 'Scout away', f); }
      if (j.rem.length) { dk.phase = 'spot'; dk.tmr = spotT; } else { dk.phase = 'idle'; dk.job = null; }
    }
  }
}
function iconsOf(planes) { const c = {}; for (const p of planes) c[p.type] = (c[p.type] || 0) + 1; return Object.entries(c).map(([k, n]) => PT[k].icon + n).join(' '); }
function capCount(S) {
  let n = 0; for (const f of S.flights) if (f.side === 'P' && f.kind === 'cap' && (f.state === 'cap' || f.state === 'form')) n += f.planes.length;
  for (const j of S.deck.jobs) if (j.kind === 'cap') n += j.n;
  if (S.deck.job && S.deck.job.kind === 'cap') n += S.deck.job.rem.length + S.deck.spotted.length;
  return n;
}
function capMgmt(S) {
  const have = capCount(S);
  if (have < S.capWant && !S.deck.jobs.some((j) => j.kind === 'cap')) { const n = Math.min(S.capWant - have, 2, ready(S, 'F').length); if (n > 0) S.deck.jobs.unshift({ kind: 'cap', n }); }
}

// ---------- enemy AI ----------
function enemyAir(S, u) {
  const A = u.air; if (!A || u.sunk || u.dead) return;
  const rdy = (k) => A.pl.filter((p) => p.type === k && p.state === 'home' && p.readyT <= S.t);
  const night = nightNow(S);
  // CAP
  let capN = 0; for (const f of S.flights) if (f.side === 'E' && f.kind === 'cap' && f.home === u && f.state === 'cap') capN += f.planes.length;
  if (capN < A.capWant && !night && A.phase !== 'arm') { const fs = rdy('F').slice(0, A.capWant - capN); if (fs.length) { for (const p of fs) p.state = 'air'; const f = newFlight(S, 'E', 'cap', u, fs); f.state = 'cap'; f.capR = u.type === 'BASE' && S.L >= 3 ? 800 : 520; } }
  // scouts
  if (S.t >= A.nextScout && !night) {
    A.nextScout = S.t + 85;
    const fresh = S.known && S.t - S.known.t < 150;
    for (const p of rdy('S')) {
      let x, y;
      if (fresh) { x = S.known.x + (S.rng() - 0.5) * 700; y = S.known.y + (S.rng() - 0.5) * 700; }
      else { const a = Math.atan2(2450 - u.y, 1500 - u.x) + (S.rng() - 0.5) * 1.9, d = 900 + S.rng() * 900; x = u.x + Math.cos(a) * d; y = u.y + Math.sin(a) * d; }
      p.state = 'air'; const f = newFlight(S, 'E', 'scout', u, [p]); f.state = 'out'; f.tx = clamp(x, 50, W - 50); f.ty = clamp(y, 50, H - 50);
    }
  }
  // strike
  if (A.phase === 'idle' && S.known && S.t - S.known.t < 120 && D(u.x, u.y, S.known.x, S.known.y) < 1250 && !night) {
    const bs = rdy('B').concat(rdy('T'));
    if (bs.length >= 2) { A.phase = 'arm'; A.armT = S.t + (u.type === 'BASE' ? 24 : 30); for (const p of bs) p.state = 'deck'; A.armedN = bs.length; if (S.t - u.seenT < 2 && has(S, 'photo')) feed(S, '⚙', 'Enemy is arming a strike!', u, 'warn'); }
  }
  if (A.phase === 'arm' && S.t >= A.armT) {
    A.phase = 'idle';
    const bs = A.pl.filter((p) => p.state === 'deck');
    if (bs.length) {
      const fs = rdy('F'); const esc = fs.slice(0, Math.max(0, fs.length - 1));
      for (const p of bs.concat(esc)) p.state = 'air';
      const f = newFlight(S, 'E', 'strike', u, bs.concat(esc)); f.state = 'out';
      const k = S.known || { x: S.cv.x, y: S.cv.y }; f.tx = k.x; f.ty = k.y; f.tgt = null;
    }
  }
}
function enemySurface(S, u, dt) {
  if (u.sunk || u.dead || u.type === 'BASE') return;
  let spd = u.maxSpd * (1 - Math.min(0.6, u.flood / 120));
  if (u.lead) {
    if (u.lead.sunk) { u.lead = null; u.route = [[u.x, u.y - 400], [u.x + 300, u.y - 200]]; u.ri = 0; }
    else { const L = u.lead, c = Math.cos(L.hdg), s = Math.sin(L.hdg); const tx = L.x + c * u.off[0] - s * u.off[1], ty = L.y + s * u.off[0] + c * u.off[1]; steer(u, tx, ty, D(u.x, u.y, tx, ty) > 30 ? spd : L.spd, dt); return; }
  }
  if (u.type === 'PB' && u.fleeT > S.t) { const a = Math.atan2(u.y - S.cv.y, u.x - S.cv.x); steer(u, clamp(u.x + Math.cos(a) * 300, 60, W - 60), clamp(u.y + Math.sin(a) * 300, 60, H - 60), spd * 1.2, dt); return; }
  if (u.type === 'CVL' || u.type === 'ECV') {
    let tx = u.home0[0], ty = u.home0[1];
    if (u.hp < u.maxHp * 0.35) { tx = u.x; ty = 60; }
    else if (S.known && S.t - S.known.t < 200) { const a = Math.atan2(u.y - S.known.y, u.x - S.known.x); tx = S.known.x + Math.cos(a) * 1000; ty = S.known.y + Math.sin(a) * 1000; }
    else { const a = S.t / 60; tx = u.home0[0] + Math.cos(a) * 250; ty = u.home0[1] + Math.sin(a) * 250; }
    steer(u, clamp(tx, 80, W - 80), clamp(ty, 60, H - 80), D(u.x, u.y, tx, ty) > 40 ? spd : 0, dt); return;
  }
  if (u.route) {
    const p = u.route[u.ri]; if (!p) { u.spd = 0; return; }
    steer(u, p[0], p[1], spd, dt);
    if (D(u.x, u.y, p[0], p[1]) < 25) {
      if (u.cvy) { u.ri++; if (u.ri >= u.route.length) { u.sunk = true; u.dead = true; u.escaped = true; S.stats.escaped++; feed(S, '🏃', 'Cargo ship escaped', u, 'bad'); } }
      else u.ri = (u.ri + 1) % u.route.length;
    }
  }
}
function steer(u, tx, ty, spd, dt) {
  const want = Math.atan2(ty - u.y, tx - u.x), d = D(u.x, u.y, tx, ty);
  if (d > 3) { const da = wrapA(want - u.hdg); u.hdg += clamp(da, -0.35 * dt, 0.35 * dt); }
  const tgtSpd = d > 3 ? spd : 0; u.spd += clamp(tgtSpd - u.spd, -1.2 * dt, 1.2 * dt);
  u.x += Math.cos(u.hdg) * u.spd * dt; u.y += Math.sin(u.hdg) * u.spd * dt;
}
function playerMove(S, dt) {
  const cv = S.cv, tr = S.tr;
  const spd = cv.maxSpd * (tr.eng ? 1.3 : 1) * (1 - Math.min(0.6, cv.flood / 120)) * (cv.hp < 25 ? 0.6 : 1);
  if (S.wp) { steer(cv, S.wp.x, S.wp.y, spd, dt); if (D(cv.x, cv.y, S.wp.x, S.wp.y) < 30) S.wp = null; }
  else steer(cv, cv.x + Math.cos(cv.hdg) * 50, cv.y + Math.sin(cv.hdg) * 50, 0, dt);
  for (const u of S.units) if (u.side === 'P' && u !== cv && !u.sunk) {
    const c = Math.cos(cv.hdg), s = Math.sin(cv.hdg); const tx = cv.x + c * u.off[0] - s * u.off[1], ty = cv.y + s * u.off[0] + c * u.off[1];
    const d = D(u.x, u.y, tx, ty); steer(u, tx, ty, d > 40 ? u.maxSpd * (tr.eng ? 1.3 : 1) : Math.max(cv.spd, d / 4), dt);
  }
}
function islandPush(S, u) {
  for (const s of S.islands) { const d = D(u.x, u.y, s.x, s.y), m = s.r * 1.2 + (u.type === 'CV' ? 26 : 14); if (d < m && d > 0.01) { u.x = s.x + (u.x - s.x) / d * m; u.y = s.y + (u.y - s.y) / d * m; } }
  u.x = clamp(u.x, 20, W - 20); u.y = clamp(u.y, 20, H - 20);
}

// ---------- sensors ----------
function sensors(S) {
  const tr = S.tr, night = nightNow(S), nk = night ? 0.6 : 1, cv = S.cv;
  const src = [];
  for (const u of S.units) if (u.side === 'P' && !u.sunk) {
    src.push({ x: u.x, y: u.y, r: u.eye * nk, rev: true });
    if (u.float && !night) src.push({ x: u.x, y: u.y, r: 480, rev: true });
    if (u.picket) src.push({ x: u.x, y: u.y, r: 800, air: true });
  }
  if (tr.radar) src.push({ x: cv.x, y: cv.y, r: 900, air: true });
  if (tr.surf) src.push({ x: cv.x, y: cv.y, r: 550, surf: true, rev: true });
  for (const f of S.flights) if (f.side === 'P' && f.planes.length && f.state !== 'pattern') src.push({ x: f.x, y: f.y, r: (f.kind === 'scout' ? 380 * (tr.photo ? 1.3 : 1) : 220) * nk, rev: true });
  S.src = src;
  for (const s of src) if (s.rev) reveal(S, s.x, s.y, s.r);
  for (const u of S.units) if (u.side === 'E' && !u.sunk) {
    let v = false; for (const s of src) if (!s.air && D(s.x, s.y, u.x, u.y) < s.r) { v = true; break; }
    if (v) {
      u.seenT = S.t; u.lx = u.x; u.ly = u.y;
      if (!u.found) { u.found = true; S.stats.finds++; earn(S, 1, '🔭', 'Scouting finds', u); feed(S, '🔭', 'Found: ' + UT[u.type].name, u, 'good'); if (u.air && S.stats.foundFirst == null) S.stats.foundFirst = S.knownFirstT == null; }
    }
  }
  // our scouts shadow what they find (highest value first)
  for (const f of S.flights) if (f.side === 'P' && f.kind === 'scout' && (f.state === 'out' || f.state === 'search') && f.planes.length) {
    const r = 380 * (tr.photo ? 1.3 : 1) * nk; let best = null, bv = -1;
    for (const u of S.units) if (u.side === 'E' && !u.sunk && !u.dead && D(f.x, f.y, u.x, u.y) < r) { const v = (u.air ? 10 : 0) + (u.obj ? 5 : 0) + (UT[u.type].pts || 0); if (v > bv) { bv = v; best = u; } }
    if (best) { f.state = 'search'; f.cx = best.x; f.cy = best.y; f.searchT = Math.max(f.searchT, 3); f.shadow = best; }
    else f.shadow = null;
  }
  for (const f of S.flights) if (f.side === 'E' && f.planes.length) {
    let v = false; for (const s of src) if (!s.surf && D(s.x, s.y, f.x, f.y) < s.r) { v = true; break; }
    if (v) { if (S.t - f.seenT > 20 && f.kind === 'strike') { feed(S, '⚠', 'Raid inbound! ' + iconsOf(f.planes), f, 'warn'); S.alert = S.t; } f.seenT = S.t; f.lx = f.x; f.ly = f.y; }
  }
  // enemy eyes
  const pships = S.units.filter((u) => u.side === 'P' && !u.sunk);
  const sees = (x, y, r) => { for (const u of pships) if (D(x, y, u.x, u.y) < r) return u; return null; };
  const report = (who, at, need) => {
    who.rep += 0.5; if (who.rep < need) return;
    if (!S.known || S.t - S.known.t > 4) {
      if (S.knownFirstT == null) { S.knownFirstT = S.t; S.stats.reported++; feed(S, '📡', 'Enemy reported our position!', at, 'bad'); }
      else if (S.t - S.known.t > 60) { S.stats.reported++; feed(S, '📡', 'Spotted again', at, 'bad'); }
    }
    S.known = { x: S.cv.x, y: S.cv.y, t: S.t }; who.reported = true;
    if (who.type && !who.air && S.t - who.seenT > 5) { who.seenT = S.t - 2; who.lx = who.x + (S.rng() - 0.5) * 200; who.ly = who.y + (S.rng() - 0.5) * 200; who.df = S.t; if (!who.dfOnce) { who.dfOnce = true; feed(S, '📻', 'Radio fix on an enemy transmitter', { x: who.lx, y: who.ly }, 'warn'); } }
    if (who.type === 'PB') who.fleeT = S.t + 60;
  };
  for (const u of S.units) if (u.side === 'E' && !u.sunk && !u.dead) { const s = sees(u.x, u.y, u.eye * nk); if (s) report(u, u, u.type === 'BASE' ? 0.5 : 2); else u.rep = Math.max(0, u.rep - 0.25); }
  for (const f of S.flights) if (f.side === 'E' && f.planes.length) {
    const s = sees(f.x, f.y, (f.kind === 'scout' ? 380 : 300) * nk);
    if (s && f.kind === 'scout') { report(f, f, 5); if (f.state === 'out' || f.state === 'search') { f.state = 'search'; f.cx = s.x; f.cy = s.y; f.searchT = Math.max(f.searchT, 4); } }
    if (s && f.kind === 'strike' && (f.state === 'out' || f.state === 'search')) { f.tx = s.x; f.ty = s.y; if (D(f.x, f.y, s.x, s.y) < 60) tryAttack(S, f); }
    if (f.kind === 'strike' && D(f.x, f.y, cv.x, cv.y) < 1000) f.threat = true;
  }
  // CAP vectoring
  const capR = tr.radar ? 950 : 420;
  for (const f of S.flights) {
    if (f.kind !== 'cap' || f.state !== 'cap' || !f.planes.length) continue;
    if (f.pursue && f.pursue.planes.length) continue;
    let best = null, bd = f.side === 'P' ? capR : (f.capR || 520);
    const h = f.side === 'P' ? cv : f.home;
    for (const g of S.flights) if (g.side !== f.side && g.planes.length && g.state !== 'pattern') {
      if (f.side === 'P' && S.t - g.seenT > 1) continue;
      const d = D(h.x, h.y, g.x, g.y); if (d < bd) { bd = d; best = g; }
    }
    f.pursue = best;
  }
}

// ---------- combat rounds ----------
function combat(S) {
  const fl = S.flights.filter((f) => f.planes.length && f.state !== 'pattern' && f.state !== 'form');
  const kills = [];
  for (const a of fl) {
    const foes = fl.filter((b) => b.side !== a.side && D(a.x, a.y, b.x, b.y) < 80);
    if (!foes.length) continue;
    for (const p of a.planes) {
      const b = foes[Math.floor(S.rng() * foes.length)]; if (!b.planes.length) continue;
      const fs = b.planes.filter((q) => q.type === 'F'), os = b.planes.filter((q) => q.type !== 'F');
      let tgt, base;
      if (p.type === 'F') {
        const wantF = a.kind === 'strike' ? 0.85 : 0.4;
        if (fs.length && (S.rng() < wantF || !os.length)) { tgt = fs[Math.floor(S.rng() * fs.length)]; base = 0.08; }
        else if (os.length) { tgt = os[Math.floor(S.rng() * os.length)]; base = tgt.type === 'S' ? 0.12 : 0.15; }
      } else if (fs.length) { tgt = fs[Math.floor(S.rng() * fs.length)]; base = 0.018; }
      if (!tgt) continue;
      if (S.rng() < base * gunMul(S, p)) kills.push([p, tgt, b]);
    }
  }
  for (const [p, t, b] of kills) {
    if (t.state === 'lost') continue; const i = b.planes.indexOf(t); if (i < 0) continue;
    b.planes.splice(i, 1); b.lostAny = true; planeLost(S, t, 'shot');
    S.fx.push({ k: 'fall', x: b.x, y: b.y, t: S.t, life: 1.5, side: t.side });
    if (p.side === 'P') {
      S.stats.kills++; p.kills++; gainXP(S, p, 3);
      if (!p.ace && p.kills >= (has(S, 'ace') ? 3 : 5)) { p.ace = true; S.stats.newAces++; feed(S, '⭐', 'New ace! ' + PT[p.type].icon, b, 'good'); }
      if (b.kind === 'scout' && !b.reported) { S.stats.scoutsStopped++; earn(S, 1, '🎯', 'Scouts downed before reporting', b); feed(S, '🎯', 'Enemy scout shot down before it reported', b, 'good'); }
    }
    if (!b.planes.length && b.side === 'E' && b.kind === 'strike' && b.threat && !b.resolved) { b.resolved = true; S.stats.raidsDefended++; earn(S, 3, '🛡', 'Raid beaten off', S.cv); feed(S, '🛡', 'Raid wiped out by CAP', b, 'good'); }
  }
  // AA
  const night = nightNow(S);
  for (const u of S.units) {
    if (u.sunk || u.dead || !u.aa) continue;
    const r = u.type === 'BASE' ? 230 : 170;
    for (const f of fl) {
      if (f.side === u.side || D(u.x, u.y, f.x, f.y) > r) continue;
      for (const p of f.planes.slice()) if (S.rng() < 0.028 * u.aa * (night ? 0.7 : 1) * (p.type === 'F' ? 0.6 : 1)) {
        f.planes.splice(f.planes.indexOf(p), 1); f.lostAny = true; planeLost(S, p, 'shot'); S.fx.push({ k: 'fall', x: f.x, y: f.y, t: S.t, life: 1.5, side: p.side });
        if (u.side === 'P') S.stats.kills++;
      }
      if (!f.planes.length && f.side === 'E' && f.kind === 'strike' && f.threat && !f.resolved) { f.resolved = true; S.stats.raidsDefended++; earn(S, 3, '🛡', 'Raid beaten off', S.cv); feed(S, '🛡', 'Raid shot down by AA', f, 'good'); }
    }
  }
  // fires/flooding
  for (const u of S.units) {
    if (u.sunk || u.dead) continue;
    if (u === S.cv) {
      const tr = S.tr;
      if (u.fire > 0) { S.stats.fireTime++; u.hp -= u.fire * 0.02; if (!tr.fire && u.fire > 45) u.fire += 0.5; u.fire = Math.max(0, u.fire - (tr.fire ? 2 : 0.9)); }
      if (u.flood > 0) { u.hp -= u.flood * 0.015; u.flood = Math.max(0, u.flood - (tr.pumps ? 1.2 : 0.4)); }
      if (tr.repair && !u.fire && !u.flood && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 0.12);
    } else {
      if (u.fire > 0) { u.hp -= u.fire * 0.03; u.fire = Math.max(0, u.fire - 0.8); }
      if (u.flood > 0) { u.hp -= u.flood * 0.015; u.flood = Math.max(0, u.flood - 0.5); }
    }
    checkSunk(S, u);
  }
  S.flights = S.flights.filter((f) => f.planes.length || (S.deck.job && S.deck.job.flight === f));
}

// ---------- mission flow ----------
function objCheck(S) {
  if (S.over) return;
  if (S.cv.hp <= 0) { S.cv.hp = 0; endMission(S, 'lost'); return; }
  if (S.done) return;
  if (S.obj.got >= S.obj.need) {
    S.done = true; S.doneT = S.t; const b = S.kind === 'gate' ? 12 : 6; earn(S, b, '✅', 'Mission complete', S.cv); feed(S, '✅', 'Objective done! Bring the planes home', S.cv, 'good'); recoverAll(S); return;
  }
  if (S.kind === 'convoy' && !S.units.some((u) => u.type === 'AK' && !u.sunk)) { S.failed = true; S.done = true; S.doneT = S.t; feed(S, '🏃', 'Convoy gone: too few sunk', S.cv, 'bad'); recoverAll(S); }
}
function tick(S, dt) {
  dt = dt || TICK; if (S.over) return;
  S.t += dt;
  if (!S.night && nightNow(S)) { S.night = true; feed(S, '🌙', 'Night falls', S.cv); }
  playerMove(S, dt);
  for (const u of S.units) { if (u.side === 'E') enemySurface(S, u, dt); if (!u.sunk && u.type !== 'BASE') islandPush(S, u); }
  for (const f of S.flights.slice()) stepFlight(S, f, dt);
  deckStep(S, dt);
  S.sAcc += dt;
  if (S.sAcc >= 0.5) {
    S.sAcc -= 0.5; sensors(S); capMgmt(S);
    for (const u of S.units) if (u.air) enemyAir(S, u);
    for (const u of S.units) if (!u.sunk && (S.t * 2 | 0) % 2 === 0) { u.wake.push([u.x, u.y]); if (u.wake.length > 10) u.wake.shift(); }
  }
  S.cAcc += dt;
  if (S.cAcc >= 1) { S.cAcc -= 1; combat(S); objCheck(S); }
  S.fx = S.fx.filter((e) => S.t - e.t < e.life);
  if (S.done && !S.over) {
    const air = S.flights.some((f) => f.side === 'P' && f.planes.length && f.kind !== 'cap');
    if (!air || S.t - S.doneT > 60) endMission(S, S.failed ? 'fail' : 'win');
  }
  if (!S.over && S.t >= S.limit) endMission(S, S.done && !S.failed ? 'win' : 'time');
}
function endMission(S, res) {
  if (S.over) return; S.over = true; S.result = res;
  const st = S.stats, bad = [], good = [];
  if (res === 'lost') bad.push(['🏳', 'Carrier crippled: limped home']);
  if (st.deckBoom) bad.push(['💥', st.deckBoom + ' armed planes blew up on deck']);
  else if (st.hitOnDeck) bad.push(['🛫', 'Bombed with planes on deck ×' + st.hitOnDeck]);
  if (st.noCap) bad.push(['🛡', 'Strike launched with no CAP ×' + st.noCap]);
  if (st.reported) bad.push(['📡', 'Enemy reported us ×' + st.reported]);
  if (S.kind === 'gate' && st.foundFirst === false) bad.push(['👁', 'They found us first']);
  if (st.ditched) bad.push(['⛽', st.ditched + ' planes ditched (fuel)']);
  if (st.bingo) bad.push(['⛽', 'Strike out of range ×' + st.bingo]);
  if (st.emptyStrikes) bad.push(['❓', 'Strike hit empty sea ×' + st.emptyStrikes]);
  if (st.fireTime > 45) bad.push(['🔥', 'Fires burned ' + st.fireTime + ' s']);
  if (st.raidsHit) bad.push(['💣', 'Raids got through ×' + st.raidsHit]);
  if (st.escaped) bad.push(['🏃', st.escaped + ' ships escaped']);
  if (st.nightCrash) bad.push(['🌙', 'Night crashes ×' + st.nightCrash]);
  if (st.lost - st.ditched - st.deckBoom > S.planes.length * 0.35) bad.push(['💀', 'Heavy air losses (' + st.lost + ')']);
  if (st.escLost) bad.push(['🚤', 'Escorts lost ×' + st.escLost]);
  if (st.sunk) good.push(['🌊', 'Sunk ×' + st.sunk]);
  if (st.hits) good.push(['🎯', st.hits + ' hits / ' + st.drops + ' drops']);
  if (st.kills) good.push(['✈', st.kills + ' planes shot down']);
  if (st.raidsDefended) good.push(['🛡', 'Raids beaten off ×' + st.raidsDefended]);
  if (st.cleanRec) good.push(['🛬', 'Clean recoveries ×' + st.cleanRec]);
  if (st.finds) good.push(['🔭', 'Contacts found ×' + st.finds]);
  if (st.scoutsStopped) good.push(['🎯', 'Scouts downed before reporting ×' + st.scoutsStopped]);
  if (st.caught) good.push(['💥', 'Caught them arming ×' + st.caught]);
  if (S.kind === 'gate' && st.foundFirst) good.push(['👁', 'Found them first']);
  if (st.firstStrike) good.push(['⚡', 'Struck first']);
  if (st.newAces) good.push(['⭐', 'New aces ×' + st.newAces]);
  if (!st.reported && res !== 'lost') good.push(['🌫', 'Never reported']);
  if (res === 'lost') { const k = Math.round(S.earned * 0.5); S.pts['Limp home: half'] = k - S.earned; S.earned = k; }
  // roster update
  const ros = [];
  for (const p of S.planes) { if (p.state === 'lost' && !p.saved) continue; ros.push({ type: p.type, xp: Math.round(p.xp), kills: p.kills, ace: p.ace }); }
  S.aar = { result: res, kind: S.kind, zone: S.zone, earned: S.earned, pts: S.pts, bad, good, stats: st, time: S.t, roster: ros, hp: Math.max(0, Math.round(S.cv.hp)) };
  feed(S, res === 'win' ? '🏆' : res === 'lost' ? '🏳' : '⚓', res === 'win' ? 'Mission won' : res === 'lost' ? 'Limping back to port' : 'Mission over', S.cv);
}
// apply AAR to profile
function applyAAR(prof, aar) {
  prof.pts += aar.earned; prof.roster = aar.roster; prof.missions = (prof.missions || 0) + 1;
  prof.zw = prof.zw || [0, 0, 0, 0, 0]; prof.gates = prof.gates || [false, false, false, false, false];
  if (aar.result === 'win') { if (aar.kind === 'gate') { prof.gates[aar.zone] = true; prof.zone = Math.max(prof.zone || 0, Math.min(4, aar.zone + 1)); } else prof.zw[aar.zone]++; }
  prof.log = (prof.log || []).concat([{ z: aar.zone, k: aar.kind, r: aar.result, e: aar.earned }]).slice(-30);
  normRoster(prof);
}
function newProfile() { const p = { v: 1, pts: 0, traits: {}, roster: [], zone: 0, zw: [0, 0, 0, 0, 0], gates: [false, false, false, false, false], missions: 0 }; normRoster(p); return p; }
function canBuy(prof, id) { const t = TR[id]; return t && !prof.traits[id] && (!t.req || prof.traits[t.req]) && prof.pts >= t.cost; }
function buy(prof, id) { if (!canBuy(prof, id)) return false; prof.pts -= TR[id].cost; prof.traits[id] = true; normRoster(prof); return true; }
function gateOpen(prof, z) { return (prof.zw[z] || 0) >= GATE_NEED; }

const API = { W, H, TICK, FG, FC, PT, UT, TREES, TRAITS, TR, ZONES, KINDS, GATE_NEED, create, tick, setCourse, orderScout, orderStrike, setCap, recoverAll, withdraw, strikeRadius, ready, capCount, clockMin, nightNow, stars, groupCounts, normRoster, newProfile, applyAAR, canBuy, buy, gateOpen, iconsOf, D };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CVSim = API;
})(typeof window !== 'undefined' ? window : globalThis);
