import * as G from './state.js?v=8g3';
import { SIDE_COL, drawFlag, portrait, shipSide, armySymbol, planeTop, crateIcon, star, arrowCurve, curvePt, drawArrow, secIcon, unitGlyph } from './art.js';
import { icon, unitIcon, UNIT_NAMES } from './icons.js';
import { createSpaceAudio } from './audio.js';
import { computeTerrain } from './terrain.js';
import { openBoard } from './battle.js';
import { STRONG, WEAK, cardKey } from './matchups.js';

const params = new URLSearchParams(location.search);
let speed = params.has('fast') ? 12 : 1;
const sfx = createSpaceAudio();
const $ = (id) => document.getElementById(id);
const cvs = $('map');
const g = cvs.getContext('2d');
const { w: WW, h: WH } = G.WORLD;
const R = G.CIRCLE_R;
const TAG_W = 84, TAG_H = 26, PR = 16; // unit tag box, portrait radius
const SEC_R = 24, SEC_S = 0.8; // section marker radius, tag scale in the island view
const CO_Z = 1.45; // zoom at which battalion tags open up to show every company
const clone = (o) => JSON.parse(JSON.stringify(o));

let S, view, sel = null, busy = false, terrain = null, terrainScale = 0.75;
let seen = new Set(), zseen = new Set(), reconMode = false, board = null, nameAbove = null; // r8g: zseen = zone keys Blue sees (ask 9b)
let planeSel = null, airOpen = false; // r7: the plane picked in the air tray, and whether the tray is open
let strip = null; // r8: the place whose cards are open in the bottom strip { kind, isl, side, sec, fleets }
let foeSel = null; // r8b: the enemy kind picked (army / fleet / fort / plane type): your cards that beat it glow
let drag = null; // r8b: an army card being dragged onto another leader card
let fx;
const resetFx = () => { fx = { moving: null, stayArrows: null, pops: [], pulses: [], reveals: {}, flight: null, flashes: [], strike: null, marks: [], scout: null }; };
resetFx();
const reveals = []; // QA log of reveal effects
const cam = { x: WW / 2, y: WH / 2, z: 0.5 };
let vw = 0, vh = 0, dpr = 1;
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));

// ---------- setup ----------
function newGame(seed = Date.now() % 100000) {
  S = G.createGame(seed);
  view = snapshotView();
  sel = null; busy = false; reconMode = false; strip = null;
  resetFx();
  zseen = G.zoneVision(S, 'blue'); seen = G.vision(S, 'blue', zseen);
  $('end').hidden = true;
  setBanner(S.week, false);
  fitCamera(true);
  updateHud();
}
function snapshotView() { return { islands: clone(S.islands), units: clone(S.units) }; }
const vIsl = (id) => view.islands.find((i) => i.id === id);
const vSec = (islId, secId) => { const i = vIsl(islId); return i && i.secs.find((x) => x.id === secId); };

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  vw = window.innerWidth; vh = window.innerHeight;
  cvs.width = Math.round(vw * dpr); cvs.height = Math.round(vh * dpr);
  clampCam();
}
const contain = () => Math.min(vw / WW, vh / WH);
const zMin = () => Math.min(contain() * 0.95, 0.3);
// r8f: max zoom = Kestra's five zone circles + its fleet still fill the screen (nothing new appears past that, it would
// only crop the same circles); never below 2x the home zoom, never above the old 2.4
const zMax = () => {
  if (!homeZ || !S || !view) return 2.4;
  const ts = placeTokens().filter((t) => t.isl === 'kestra'); if (!ts.length) return 2.4;
  const l = Math.min(...ts.map((t) => t.x - t.r)), r = Math.max(...ts.map((t) => t.x + t.r)), tp = Math.min(...ts.map((t) => t.y - t.r)), b = Math.max(...ts.map((t) => t.y + t.r));
  const fit = Math.min((vw - 32) / (r - l), (vh - 110) / (b - tp));
  return Math.min(2.4, Math.max(homeZ * 2, fit));
};
function fitCamera(home) {
  if (home) { homeZ = null; tokCache = null; } // r8f: lay out at the zoom being tried, then fix the world size there
  const phone = Math.min(vw, vh) < 560;
  if (home && phone && vh > vw) {
    // portrait phone: all of Kestra (land, ring, section markers, airfield planes, tags) and Oska on screen.
    // r7b: zoom out until both fit with a margin (the old fixed zoom clipped Kestra's airfield off the left edge)
    const m = 10, k = G.island(S, 'kestra'), o = G.island(S, 'oska');
    cam.y = WH / 2;
    for (cam.z = Math.min(0.46, vw / 1030); cam.z > 0.27; cam.z -= 0.004) {
      const a = islandExtent(k), b = islandExtent(o);
      if ((b.r - a.l) * cam.z <= vw - 2 * m) break;
    }
    const a = islandExtent(k), b = islandExtent(o);
    cam.x = (a.l + b.r) / 2;
    cam.x = Math.min(cam.x, a.l + (vw / 2 - m) / cam.z); // Kestra wins if both cannot fit
  } else if (home && phone) {
    // landscape phone: Tallow clear of the top edge and left of the WEEK banner, Kestra + Oska in view
    cam.z = Math.min(0.46, Math.max(0.3, vh / 1147));
    cam.x = -60 + vw / (2 * cam.z); cam.y = 269 + (vh / 2 - 18) / cam.z;
  } else {
    cam.z = Math.max(contain(), phone ? 0.46 : 0.36);
    const k = G.island(S, 'kestra');
    cam.x = home ? k.x + (vw / cam.z) * 0.25 : WW / 2; cam.y = WH / 2;
  }
  clampCam();
  if (home) { // r7b: never start with the home island cut by an edge
    const e = islandExtent(G.island(S, 'kestra')), m = 8, l = toScreen(e.l, e.t), r = toScreen(e.r, e.b);
    if (l.x < m) cam.x -= (m - l.x) / cam.z; else if (r.x > vw - m) cam.x += (r.x - vw + m) / cam.z;
    if (l.y < m) cam.y -= (m - l.y) / cam.z; else if (r.y > vh - m) cam.y += (r.y - vh + m) / cam.z;
  }
  if (home) { homeZ = cam.z; tokCache = null; zoneCache = null; }
}
// r7b: world-space box of everything drawn for an island at the current zoom: land, owner ring, section markers,
// parked planes, unit tags and carrier planes (used by the start camera and the e2e home-in-frame check)
function islandExtent(isl) {
  const e = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
  const add = (x0, y0, x1 = x0, y1 = y0) => { e.l = Math.min(e.l, x0); e.r = Math.max(e.r, x1); e.t = Math.min(e.t, y0); e.b = Math.max(e.b, y1); };
  const c = Math.cos(isl.rot), sn = Math.sin(isl.rot);
  const hw = Math.hypot(isl.rx * c, isl.ry * sn) * 1.05, hh = Math.hypot(isl.rx * sn, isl.ry * c) * 1.05;
  add(isl.x - hw, isl.y - hh, isl.x + hw, isl.y + hh);
  const rr = R + 4 / cam.z; add(isl.x - rr, isl.y - rr, isl.x + rr, isl.y + rr);
  if (view && strat()) { // r8: the map shows tokens only
    for (const t of placeTokens().filter((q) => q.isl === isl.id)) add(t.x - t.r, t.y - t.r, t.x + t.r, t.y + t.r);
    return e;
  }
  for (const x of isl.secs) {
    const p = secPos(isl, x); add(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r);
    if (x.kind === 'air') for (const t of airfieldPlanePts(isl, x, p)) add(t.x - t.gl * 0.66, t.y - t.gl * 0.66, t.x + t.gl * 0.66, t.y + t.gl * 0.66);
  }
  if (view && !useBlocks()) for (const u of unitsAtView(isl.id)) {
    const p = tagPos(u), bb = tagBounds(p.x, p.y, p.s); add(bb.x0, bb.y0, bb.x1, bb.y1);
    const n = u.kind === 'fleet' ? S.planes.filter((q) => q.base.fleet === u.id).length : 0;
    if (n) { const gl = MAP_PLANE / cam.z, xa = p.x + (TAG_W / 2 - 1) * p.s + 4 / cam.z, x1 = xa + carrierNudge(isl.id, xa, p.y, gl, n) + gl * (0.62 + (n - 1) * 1.3 + 0.66); add(x1, p.y - gl * 0.66, x1, p.y + gl * 0.66); }
  }
  return e;
}
function clampCam() {
  cam.z = Math.max(zMin(), Math.min(zMax(), cam.z));
  const hw = vw / cam.z / 2, hh = vh / cam.z / 2, m = 120;
  // while the drill-down panel is open the map may slide past the edge by the panel's size
  const p = panelPad, pl = p.left / cam.z, pb = p.bottom / cam.z;
  cam.x = hw * 2 >= WW + 2 * m + pl ? WW / 2 - pl / 2 : Math.max(hw - m - pl, Math.min(WW - hw + m, cam.x));
  cam.y = hh * 2 >= WH + 2 * m + pb ? WH / 2 + pb / 2 : Math.max(hh - m, Math.min(WH - hh + m + pb, cam.y));
}
let panelPad = { left: 0, bottom: 0 };
function measurePanel() {
  const st = $('strip');
  if (st && !st.hidden) { panelPad = { left: 0, bottom: st.offsetHeight + 8 }; return; }
  const e = $('sel');
  if (!e || e.hidden) { panelPad = { left: 0, bottom: 0 }; return; }
  const r = e.getBoundingClientRect();
  const leftDock = r.left < vw * 0.2 && r.right < vw * 0.6;
  panelPad = leftDock ? { left: r.right + 8, bottom: 0 } : { left: 0, bottom: vh - r.top + 8 };
}
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + vw / 2, y: (y - cam.y) * cam.z + vh / 2 });
const toWorld = (x, y) => ({ x: (x - vw / 2) / cam.z + cam.x, y: (y - vh / 2) / cam.z + cam.y });
let planeMarks = [], carrierQ = []; // r7b: map plane icons drawn this frame (screen px) / carrier planes queued over the markers
// 0 = strategic map, 1 = island view with sections
// r8f: ONE look at every zoom (Chumi: "when i zoom in i shouldnt see more"). The island view / close-zoom
// drawing is switched off: secK is pinned to 0, so strat() is always true and useBlocks() always false.
// Zooming only scales the same zone circles + fleet tokens; details show only in the strip after a tap.
const secK = () => 0;
// r8f: zone circles and fleet tokens have a fixed WORLD size, set at the home zoom (where they are ZONE_PX / TOK_PX
// on screen, same as r8e), so zooming in makes them bigger instead of revealing more
let homeZ = null;
const zRef = () => homeZ || cam.z;
// r8 declutter: below the island view the map shows one token per island (troops), per fleet group, and per base
const strat = () => secK() < 0.5;

// ---------- fog ----------
const zKnown = (isl, sec) => zseen.has(G.zkey(isl, sec));
function refreshFog(animate) {
  zseen = G.zoneVision(S, 'blue');
  const now = G.vision(S, 'blue', zseen);
  if (animate) for (const id of now) if (!seen.has(id)) { fx.reveals[id] = performance.now(); reveals.push({ island: id, week: S.week }); }
  seen = now;
}
const fogAlpha = (id) => {
  if (!seen.has(id)) return 1;
  const t0 = fx.reveals[id]; if (!t0) return 0;
  const k = (tNow - t0) / (1100 / Math.max(1, speed / 3));
  if (k >= 1) { delete fx.reveals[id]; return 0; }
  return 1 - k;
};
let fogSprite = null;
function makeFog() {
  // soft grey cloud bank: terrain shapes still faintly show through, like KG's unknown areas
  const c = document.createElement('canvas'); c.width = c.height = 256; const q = c.getContext('2d');
  const r = G.rng(77);
  for (let i = 0; i < 60; i++) {
    const a = r() * 7, d = 20 + r() * 80, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, rr = 26 + r() * 44;
    const gr = q.createRadialGradient(x, y, 0, x, y, rr);
    const l = 70 + Math.floor(r() * 34);
    gr.addColorStop(0, `rgba(${l},${l + 5},${l + 12},.13)`); gr.addColorStop(1, `rgba(${l},${l + 6},${l + 14},0)`);
    q.fillStyle = gr; q.beginPath(); q.arc(x, y, rr, 0, 7); q.fill();
  }
  q.globalCompositeOperation = 'destination-in';
  const edge = q.createRadialGradient(128, 128, 70, 128, 128, 128);
  edge.addColorStop(0, 'rgba(0,0,0,1)'); edge.addColorStop(1, 'rgba(0,0,0,0)');
  q.fillStyle = edge; q.fillRect(0, 0, 256, 256);
  fogSprite = c;
}

// ---------- layout ----------
// what Blue can see at an island: own units, enemy units only when the island is in sight, else one '?' when in contact
// r8g ask 9b: an enemy shows where its zone is seen (an army: its section; a fleet: the sea or the beach / dock it is at)
function foeVisible(u) {
  if (u.side === 'blue' || seen.has(u.at)) return true;
  if (u.kind === 'army') return !!u.sec && zKnown(u.at, u.sec);
  if (u.kind === 'fleet') { const lv = G.unit(S, u.id), sp = lv && lv.at === u.at ? G.fleetSpot(S, lv) : null; return zKnown(u.at, null) || (!!sp && zKnown(u.at, sp)); }
  return false;
}
function unitsAtView(islId) {
  const list = view.units.filter((u) => u.at === islId && !(fx.moving && fx.moving.ids.has(u.id)) && foeVisible(u));
  if (!seen.has(islId) && view.units.some((u) => u.at === islId && u.side === 'red' && !foeVisible(u)) && G.contact(S, 'blue', islId)) {
    list.push({ id: `?${islId}`, side: 'red', kind: 'army', str: 0, cmd: 0, at: islId, sec: null, unknown: true });
  }
  return list.sort((a, b) => (a.side === b.side ? (a.kind === b.kind ? a.cmd - b.cmd : a.kind === 'fleet' ? 1 : -1) : a.side === 'blue' ? -1 : 1));
}
// Centre of a tag inside its island circle; tags stack in one column, scaled down when crowded.
function slot(islId, u) {
  const isl = vIsl(islId);
  const list = unitsAtView(islId);
  const n = list.length, k = Math.max(0, list.findIndex((x) => x.id === u.id));
  const sc = fitScale(n, (n > 4 ? 4 / n : 1) * tokenScale());
  const gap = 34 * sc;
  return { x: isl.x + 7 * sc, y: isl.y + 8 + (k - (n - 1) / 2) * gap, s: sc };
}
// island view: tag sits to the right of its section marker (fleets next to the port or the first beach)
function anchorSec(isl, u) {
  if (u.kind === 'army' && u.sec) return isl.secs.find((x) => x.id === u.sec);
  if (u.unknown) return { x: isl.x, y: isl.y, id: '?' };
  return isl.secs.find((x) => x.kind === 'port') || isl.secs.find((x) => x.kind === 'beach');
}
function secSlot(islId, u) {
  const isl = vIsl(islId);
  const a = anchorSec(isl, u);
  const list = unitsAtView(islId).filter((x) => anchorSec(isl, x) === a);
  const n = list.length, k = Math.max(0, list.findIndex((x) => x.id === u.id));
  const fleetOff = u.kind === "fleet" ? 26 : 0;
  return { x: a.x + SEC_R + 2 + 57 * SEC_S, y: a.y + fleetOff + (k - (n - 1) / 2) * 24, s: SEC_S };
}
function tagPos(u) {
  const k = secK(), p = slot(u.at, u);
  if (k <= 0) return p;
  const q = secSlot(u.at, u);
  return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, s: p.s + (q.s - p.s) * k };
}
// largest scale <= want at which every tag corner of an n-stack stays inside the island circle
function fitScale(n, want) {
  const R = G.CIRCLE_R * 0.97; // r7: tags stay inside the ring; the section icons sit on the ring around them
  for (let sc = want; sc > 0.3; sc -= 0.02) {
    const b = tagBounds(7 * sc, 0, sc);
    const yMax = Math.max(Math.abs(-((n - 1) / 2) * 34 * sc + 8 + b.y0), Math.abs(((n - 1) / 2) * 34 * sc + 8 + b.y1));
    const xMax = Math.max(Math.abs(b.x0), Math.abs(b.x1));
    if (Math.hypot(xMax, yMax) <= R) return Math.max(sc, Math.min(want, 0.62 / cam.z)); // never below readable (19px tall)
  }
  return Math.max(0.3, Math.min(want, 0.62 / cam.z));
}
// tags grow when zoomed out so they stay readable, but never past what fits inside the circle
const tokenScale = () => Math.max(1, Math.min(2.4, 0.8 / cam.z));
function tagBounds(cx, cy, s) {
  return { x0: cx + (-TAG_W / 2 + 1 - PR) * s, x1: cx + (TAG_W / 2 - 1) * s, y0: cy - PR * s, y1: cy + PR * s };
}

// ---------- island view: battalion tags inside the section (companies when zoomed in close) ----------
const blockClose = () => cam.z >= CO_Z;
function blockRows(u) {
  if (u.kind === 'fleet') { G.syncOob(u); return [{ cmd: u.cmd, cells: u.ships.map((t) => ({ type: t, ship: true })) }]; }
  return G.battalions(u).map((b) => ({ cmd: b.cmd, n: b.n, cells: b.cos.map((c) => ({ type: c.type, pips: c.pips })) }));
}
// size of one unit's block in card units (unknown '?' units keep the small tag)
function blockSize(u, close = blockClose()) {
  if (u.unknown) return { w: TAG_W * SEC_S + PR * SEC_S, h: TAG_H * SEC_S + 6, rows: [] };
  const rows = blockRows(u);
  const rh = close ? 30 : 22, pw = close ? 30 : 24;
  const cw = close ? 24 : (u.kind === 'fleet' ? 17 : 10);
  const n = Math.max(1, ...rows.map((r) => r.cells.length));
  return { w: pw + n * cw + 6, h: rows.length * (rh + 3) + 3, rows, rh, pw, cw, close };
}
// Card layout is done in screen space so cards stay on screen and out from under the HUD
// (the same idea as keepClear for the drill-down panel):
// 1. all blocks on one section form one column beside its marker (inland side on the right half);
// 2. cards stop growing past CARD_PX screen px per card unit, so zooming in shows companies, not giant cards;
// 3. the column is clamped inside the screen and nudged off the HUD and off columns already placed;
// 4. when it still cannot sit free it compacts: company icons -> battalion squares -> smaller squares.
const CARD_PX = 1.4, CARD_M = 6, CARD_GAP = 6;
let cardCache = null;
const rectsHit = (r, list) => list.filter((o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top);
function fitCard(pref, W, H, safe, obs) {
  const at = (x, y) => {
    x = Math.max(safe.left, Math.min(safe.right - W, x)); y = Math.max(safe.top, Math.min(safe.bottom - H, y));
    return { left: x, top: y, right: x + W, bottom: y + H };
  };
  const fits = W <= safe.right - safe.left && H <= safe.bottom - safe.top;
  let cands = [at(pref.left, pref.top)], best = null;
  for (let round = 0; round < 6 && !best && cands.length; round++) {
    const next = new Map();
    for (const c of cands) {
      const h = rectsHit(c, obs);
      if (!h.length) {
        const d = Math.hypot(c.left - pref.left, c.top - pref.top);
        if (fits && (!best || d < best.d)) best = { ...c, d };
        continue;
      }
      for (const o of h) {
        for (const r of [at(o.left - W - 4, c.top), at(o.right + 4, c.top), at(c.left, o.top - H - 4), at(c.left, o.bottom + 4)]) {
          const k = `${Math.round(r.left)},${Math.round(r.top)}`;
          if (!next.has(k) && next.size < 600) next.set(k, r);
        }
      }
    }
    cands = [...next.values()];
  }
  return best ? { ...best, free: true } : { ...at(pref.left, pref.top), free: false };
}
// Island names and type badges get the same HUD-avoid path as the cards: when the drawn spot is partly on screen
// but under the HUD or past an edge, the label slides to the nearest free safe slot.
let labelCache = null;
function labelLayout() {
  if (labelCache) return labelCache;
  const out = new Map(), hud = hudRects(), m = CARD_M;
  const safe = { left: m, top: m, right: vw - m, bottom: vh - m };
  const vis = (r) => r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
  const slide = (r, obs) => {
    if (!vis(r)) return r;
    const clear = r.left >= safe.left && r.top >= safe.top && r.right <= safe.right && r.bottom <= safe.bottom && !rectsHit(r, obs).length;
    if (clear) return r;
    const f = fitCard(r, r.right - r.left, r.bottom - r.top, safe, obs);
    return { left: f.left, top: f.top, right: f.right, bottom: f.bottom, moved: true };
  };
  // a slid label first looks for a slot that also keeps off the section markers, then settles for clear of the HUD
  const markers = secK() >= 0.5 ? view.islands.flatMap((i) => i.secs.map((x) => sectionBox(i.id, x.id))).filter(vis) : [];
  const slideBest = (r, obs) => { const a = slide(r, [...obs, ...markers]); return a.moved && !onFree(a, [...obs, ...markers]) ? slide(r, obs) : a; };
  const onFree = (r, obs) => r.left >= safe.left - 0.5 && r.top >= safe.top - 0.5 && r.right <= safe.right + 0.5 && r.bottom <= safe.bottom + 0.5 && !rectsHit(r, obs).length;
  for (const isl of view.islands) {
    const c = toScreen(isl.x, isl.y - R), br = 21 * cam.z;
    const badge = slideBest({ left: c.x - br, right: c.x + br, top: c.y - br, bottom: c.y + br }, hud);
    const name = slideBest(nameBox(isl.id), [...hud, badge]);
    out.set(isl.id, { name, badge });
  }
  labelCache = out;
  return out;
}
const labelBoxes = (isl) => { const l = labelLayout().get(isl.id); return l ? [l.name, l.badge] : [nameBox(isl.id)]; };
// a column is "nudged" when it no longer sits beside its own marker; it then gets a leader line + brace
const NUDGE_PX = 26;
function cardLayout() {
  if (cardCache) return cardCache;
  const out = new Map(), z = cam.z;
  const hud = hudRects(), placed = [];
  const onView = (m) => m.right > 0 && m.left < vw && m.bottom > 0 && m.top < vh;
  const labels = view.islands.flatMap((i) => labelBoxes(i)).filter(onView);
  // other sections' markers are kept at arm's length so a column never parks against the wrong section
  const keep = 40 * Math.min(1, z);
  const markers = view.islands.flatMap((i) => i.secs.map((x) => ({ ...sectionBox(i.id, x.id), isl: i.id }))).filter(onView);
  const safe = { left: CARD_M, top: CARD_M, right: vw - CARD_M, bottom: vh - CARD_M };
  const cols = [];
  for (const isl of view.islands) {
    const groups = new Map();
    for (const u of unitsAtView(isl.id)) {
      const a = anchorSec(isl, u);
      if (!groups.has(a.id)) groups.set(a.id, { a, list: [] });
      groups.get(a.id).list.push(u);
    }
    if (!groups.size) continue;
    // nudged = the column's near edge is well away from its own marker
    const isNudged = (c) => { const gx = Math.max(c.r.left - c.sc.x, c.sc.x - c.r.right, 0), gy = Math.max(c.r.top - c.sc.y, c.sc.y - c.r.bottom, 0); return Math.hypot(gx, gy) > (SEC_R + 8) * z + NUDGE_PX; };
    const place = (mode, tier, group) => {
      const { a, list } = group;
      const left = a.x > isl.x + 20, sc = toScreen(a.x, a.y), off = (SEC_R + 8) * z;
      const close = mode === 'companies';
      const px = mode === 'small' ? Math.min(z, 1) * 0.8 : Math.min(z, CARD_PX);
      const sizes = list.map((u) => blockSize(u, close));
      const W = Math.max(...sizes.map((b) => b.w)) * px;
      const H = (sizes.reduce((n, b) => n + b.h, 0) + CARD_GAP * (list.length - 1)) * px;
      const pref = { left: left ? sc.x - off - W : sc.x + off, top: sc.y - H / 2 };
      const onScreen = pref.left < vw && pref.left + W > 0 && pref.top < vh && pref.top + H > 0;
      const base = tier.replace('*', '');
      const pad = base === 'soft' ? keep : base === 'touch' ? 2 : 12 * Math.min(1, z);
      const others = markers.filter((m) => !(m.isl === isl.id && m.id === a.id))
        .map((m) => ({ left: m.left - pad, right: m.right + pad, top: m.top - pad, bottom: m.bottom + pad }));
      const own = markers.filter((m) => m.isl === isl.id && m.id === a.id);
      const obs = base === 'hud' ? hud : base === 'cover' ? [...hud, ...placed, ...labels, ...own] : [...hud, ...placed, ...labels, ...others, ...own];
      // a column whose island is off screen stays where it is (it is not drawn over the view)
      const r = onScreen ? fitCard(pref, W, H, safe, obs) : { left: pref.left, top: pref.top, right: pref.left + W, bottom: pref.top + H, free: true };
      return { r, sizes, px, left, a, list, sc, isl: isl.id };
    };
    // one card mode per island: every column on the island uses the same mode. Within a mode each column first keeps
    // well clear of the other sections' markers ('soft'), then may sit closer ('near', it still never covers one).
    // Only when no mode fits that way may a column cover another marker ('cover'). The HUD and edges are never given up.
    const modes = blockClose() ? ['companies', 'battalions', 'small'] : ['battalions', 'small'];
    // 'x*' tiers only accept a spot beside the column's own marker; the plain tiers may nudge it away (then a leader is drawn).
    // 'touch' (marker edge to edge, never covering) is only for the small battalion / square cards, not open companies.
    const tiersFor = (m) => m === 'companies' ? ['soft*', 'near*', 'soft', 'near'] : ['soft*', 'near*', 'touch*', 'soft', 'near'];
    const plan = [...modes.map((m) => [m, tiersFor(m)]), ...modes.map((m) => [m, ['cover']])];
    let picks = null;
    for (const [mode, tiers] of plan) {
      const mark = placed.length, got = [];
      let ok = true;
      for (const grp of groups.values()) {
        let c = null;
        for (const tier of tiers) { c = place(mode, tier, grp); if (c.r.free && (!tier.endsWith('*') || !isNudged(c))) break; c.r.free = c.r.free && !tier.endsWith('*'); }
        if (!c.r.free) { ok = false; break; }
        got.push(c); placed.push({ left: c.r.left - 3, top: c.r.top - 3, right: c.r.right + 3, bottom: c.r.bottom + 3 });
      }
      placed.length = mark;
      if (ok) { picks = got; break; }
    }
    if (!picks) picks = [...groups.values()].map((grp) => place('small', 'hud', grp));
    for (const pick of picks) {
      placed.push({ left: pick.r.left - 3, top: pick.r.top - 3, right: pick.r.right + 3, bottom: pick.r.bottom + 3 });
      const nudged = isNudged(pick);
      cols.push({ ...pick.r, sc: pick.sc, side: pick.list[0].side, nudged, isl: pick.isl, sec: pick.a.id, secR: SEC_R * z });
      let y = pick.r.top;
      pick.list.forEach((u, i) => {
        const b = pick.sizes[i], w = b.w * pick.px;
        out.set(u.id, { ...b, sx: pick.left ? pick.r.right - w : pick.r.left, sy: y, px: pick.px, sec: pick.a.id, nudged });
        y += (b.h + CARD_GAP) * pick.px;
      });
    }
  }
  out.cols = cols;
  cardCache = out;
  return out;
}
// leader line + brace from a nudged column back to its own section marker (screen space, under the cards)
function drawLeaders() {
  const cols = cardLayout().cols || [];
  g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const c of cols) {
    if (!c.nudged) continue;
    const onLeft = c.sc.x > c.right, onRight = c.sc.x < c.left;
    const bx = onLeft ? c.right + 8 : onRight ? c.left - 8 : (c.left + c.right) / 2;
    const ty = Math.max(c.top + 6, Math.min(c.bottom - 6, c.sc.y));
    const col = SIDE_COL[c.side] ? SIDE_COL[c.side].fill : '#fff';
    // the line starts at the marker's rim and ends at the brace's middle
    const ex = onLeft || onRight ? bx : bx, ey = onLeft || onRight ? ty : (c.sc.y < c.top ? c.top - 8 : c.bottom + 8);
    const dx = ex - c.sc.x, dy = ey - c.sc.y, d = Math.hypot(dx, dy) || 1, sx = c.sc.x + dx / d * (c.secR + 4), sy = c.sc.y + dy / d * (c.secR + 4);
    for (const [w, st] of [[7, 'rgba(0,0,0,.55)'], [3.5, col]]) {
      g.lineWidth = w; g.strokeStyle = st; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey);
      // brace: a bar along the column's near edge with short end ticks
      if (onLeft || onRight) { const t = onLeft ? -6 : 6; g.moveTo(bx + t, c.top + 4); g.lineTo(bx, c.top + 4); g.lineTo(bx, c.bottom - 4); g.lineTo(bx + t, c.bottom - 4); }
      else { const t = c.sc.y < c.top ? 6 : -6; g.moveTo(c.left + 4, ey + t); g.lineTo(c.left + 4, ey); g.lineTo(c.right - 4, ey); g.lineTo(c.right - 4, ey + t); }
      g.stroke();
    }
    g.fillStyle = col; g.beginPath(); g.arc(sx, sy, 4, 0, 7); g.fill();
  }
  g.restore();
}
// one unit's card in world units; k scales card units to world units for drawing
function blockAt(u) {
  let c = cardLayout().get(u.id);
  if (!c) { cardCache = null; c = cardLayout().get(u.id); }
  if (!c) { const b = blockSize(u), a = vSec(u.at, u.sec) || vIsl(u.at); return { ...b, x0: a.x, y0: a.y, k: 1, px: cam.z, sec: u.sec }; }
  const w = toWorld(c.sx, c.sy), k = c.px / cam.z;
  return { ...c, x0: w.x, y0: w.y, w: c.w * k, h: c.h * k, k };
}
const useBlocks = () => secK() >= 0.5;
function drawBlock(u, blk, alpha = 1) {
  // draw in card units: origin at the card corner, scaled so the card keeps its capped screen size
  g.save(); g.translate(blk.x0, blk.y0); g.scale(blk.k, blk.k);
  const b = { ...blk, x0: 0, y0: 0, w: blk.w / blk.k, h: blk.h / blk.k };
  if (u.unknown) { drawTag(u, b.w / 2 + PR * SEC_S / 2, b.h / 2, SEC_S, alpha); g.restore(); return; }
  const selected = u.id === sel;
  g.save(); g.globalAlpha = alpha;
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  g.fillStyle = 'rgba(14,17,22,.9)'; g.beginPath(); g.roundRect(b.x0, b.y0, b.w, b.h, 6); g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = SIDE_COL[u.side].fill; g.fillRect(b.x0, b.y0 + 4, 3, b.h - 8);
  g.lineWidth = selected ? 3 : 1.2; g.strokeStyle = selected ? '#f5c518' : 'rgba(255,255,255,.35)';
  g.beginPath(); g.roundRect(b.x0, b.y0, b.w, b.h, 6); g.stroke();
  b.rows.forEach((row, i) => {
    const y = b.y0 + 3 + i * (b.rh + 3), cy = y + b.rh / 2, pr = b.rh / 2 - 1.5;
    if (i) { g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(b.x0 + 6, y - 1.5); g.lineTo(b.x0 + b.w - 4, y - 1.5); g.stroke(); }
    g.drawImage(portrait(u.side, row.cmd, 128), b.x0 + 5, cy - pr, pr * 2, pr * 2);
    row.cells.forEach((c, j) => {
      const x = b.x0 + b.pw + j * b.cw + b.cw / 2;
      if (c.ship) { unitGlyph(g, c.type, x, cy, b.cw - 2, '#e9edf1', 2.4); return; }
      if (b.close) {
        unitGlyph(g, c.type, x, y + 11, 18, '#e9edf1', 2.4);
        for (let k = 0; k < G.CO_MAX; k++) { g.fillStyle = k < c.pips ? '#fff' : 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(x - 6 + k * 6, y + 25, 2.1, 0, 7); g.fill(); }
      } else {
        g.fillStyle = `rgba(255,255,255,${0.35 + 0.65 * c.pips / G.CO_MAX})`; g.fillRect(x - 3.5, cy - 4, 7, 8);
      }
    });
  });
  g.restore();
  drawUnitExtras(u, b.x0 + b.w, b.y0, b.h, g, { x: b.x0, y: b.y0 + b.h });
  g.restore();
}

// ---------- r8 declutter: one token per place on the map ----------
// troops: one token per side per island (count = regiments; a fort when only a garrison holds it; '?' under fog)
// fleet: one token per side per island waters (count = ships); carrier: its own base token next to the fleet (count = planes)
// air / port: every airfield and port keeps its own always-visible base token where it lies on the ring
const TOK_PX = 20, BASE_PX = 17, TOK_HIT = 26; // screen px: token radius, base radius, hit radius (52 px target)
let tokCache = null;
// r8e: at map zoom the zone circles ARE the section markers, so no island opens extra detail (no ring markers, no decor)
function detailIsles() { return new Set(); }
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// r8e zone layout at map zoom: one circle per section, ZONE_PX on screen (room for an icon + count), centred on the
// section's own spot (sec x,y) and nudged apart just enough that neighbours keep a ZONE_GAP_PX gap.
const ZONE_PX = 18, ZONE_GAP_PX = 4;
let zoneCache = null, terrainPx = null;
// r8e: is this world point open water? (reads the painted terrain: sea pixels are blue-dominant)
function seaAt(wx, wy) {
  if (!terrainPx) return true;
  const px = Math.round(wx * terrainScale), py = Math.round(wy * terrainScale);
  if (px < 0 || py < 0 || px >= terrainPx.w || py >= terrainPx.h) return true;
  const o = (py * terrainPx.w + px) * 4; return terrainPx.d[o + 2] - terrainPx.d[o] > 8;
}
const seaClear = (pt, r) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => seaAt(pt.x + a * r * 0.7, pt.y + b * r * 0.7));
function zoneLayout(isl) {
  const z = zRef();
  if (!zoneCache || zoneCache.z !== z) zoneCache = { z, m: new Map() };
  const hit = zoneCache.m.get(isl.id); if (hit) return hit;
  const r = ZONE_PX / z, need = 2 * r + ZONE_GAP_PX / z;
  const pts = isl.secs.map((x) => ({ sec: x.id, ax: x.x, ay: x.y, x: x.x, y: x.y, r }));
  const push = () => { let moved = false; for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
    const p = pts[a], q = pts[b]; let dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
    if (d >= need - 0.01) continue; if (d < 0.01) { dx = 1; dy = 0; d = 1; }
    const k = (need - d) / 2 / d; p.x -= dx * k; p.y -= dy * k; q.x += dx * k; q.y += dy * k; moved = true; } return moved; };
  for (let it = 0; it < 40; it++) { push(); for (const p of pts) { p.x += (p.ax - p.x) * 0.05; p.y += (p.ay - p.y) * 0.05; } }
  for (let it = 0; it < 200 && push(); it++);
  const m = new Map(pts.map((p) => [p.sec, p]));
  zoneCache.m.set(isl.id, m);
  return m;
}
// r8g: the zone a plane in the air is drawn over (its ordered zone, else the island's airfield, else its first beach)
function airZone(p) {
  if (!p || !p.air) return null;
  const isl = G.island(S, p.air.isl); if (!isl) return null;
  const x = (p.air.sec && G.section(isl, p.air.sec)) || isl.secs.find((q) => q.kind === 'air') || isl.secs.find((q) => q.kind === 'beach');
  return `${isl.id}:${x.id}`;
}
function placeTokens() {
  if (tokCache) return tokCache;
  const out = [], z = zRef(), tr = TOK_PX / z;
  const nx = !busy && !S.over ? nextArrivals().filter((e) => e.side === 'blue') : [];
  // zones first (drawn under the fleets)
  for (const isl of view.islands) {
    const list = unitsAtView(isl.id);
    const ev = nx.find((e) => e.island === isl.id);
    for (const x of isl.secs) {
      // r8g ask 2: every zone shows what the place is (its symbol) + a count of the units in it (troops, planes on the
      // field, planes in the air over it), whenever there are any. Fog is per zone (ask 9b): a fogged zone is grey.
      const known = zKnown(isl.id, x.id);
      const p = secPos(isl, x, 0), own = known ? x.owner : null;
      const arm = known ? list.filter((u) => u.kind === 'army' && !u.aboard && !u.unknown && u.sec === x.id) : [];
      const planes = known && x.kind === 'air' ? S.planes.filter((q) => !q.air && q.base.isl === isl.id && q.base.sec === x.id) : [];
      const up = S.planes.filter((q) => q.air && airZone(q) === `${isl.id}:${x.id}` && (q.side === 'blue' || known));
      const gar = known && x.owner !== 'blue' ? x.gar : 0;
      const count = arm.length + planes.length + up.length;
      const numSide = arm.length ? arm[0].side : planes.length ? planes[0].side : up.length ? up[0].side : null;
      const next = ev ? (x.kind === 'hq' && ev.troops ? ev.troops : 0) + (x.kind === 'port' && ev.ships ? ev.ships : 0) + (x.kind === 'air' && ev.planes ? ev.planes : 0) : 0;
      out.push({ kind: 'zone', isl: isl.id, sec: x.id, secKind: x.kind, side: null, own, x: p.x, y: p.y, r: p.r, show: x.kind, count, numSide, gar,
        armySide: arm.length ? arm[0].side : null, units: arm.map((u) => u.id), planes: [...planes, ...up].map((q) => q.id), up: up.map((q) => q.id), upSide: up.length ? up[0].side : null, fort: gar > 0, unknown: !known, next });
    }
  }
  const zones = out.slice();
  for (const isl of view.islands) {
    const list = unitsAtView(isl.id);
    const port = isl.secs.find((x) => x.kind === 'port');
    const a0 = port ? Math.atan2(port.y - isl.y, port.x - isl.x) : 0.55;
    const nameOk = (a) => Math.abs(wrapA(a - Math.PI / 2)) > 0.55;
    const nb = nameBox(isl.id), n0 = toWorld(nb.left, nb.top), n1 = toWorld(nb.right, nb.bottom); // keep fleets off the island's name
    const offName = (pt, r) => { const cx = Math.max(n0.x, Math.min(pt.x, n1.x)), cy = Math.max(n0.y, Math.min(pt.y, n1.y)); return Math.hypot(pt.x - cx, pt.y - cy) >= r + 2 / z; };
    const free = (pt, r) => offName(pt, r) && out.every((t) => Math.hypot(t.x - pt.x, t.y - pt.y) >= t.r + r + 3 / z);
    const groups = new Map();
    for (const f of list.filter((u) => u.kind === 'fleet')) { const lv = !busy && G.unit(S, f.id), sp = G.fleetSpot(S, lv && lv.at === f.at ? lv : f), k = `${f.side}:${sp || ''}`; if (!groups.has(k)) groups.set(k, { side: f.side, spot: sp, fl: [] }); groups.get(k).fl.push(f); }
    for (const q of groups.values()) {
      let pos = null;
      if (q.spot) { // docked: just off its beach zone, on the sea side
        const zt = zones.find((t) => t.isl === isl.id && t.sec === q.spot);
        const base = Math.atan2(zt.y - isl.y, zt.x - isl.x), d = zt.r + tr + 3 / z;
        let alt = null;
        for (const k of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) { const pt = { x: zt.x + Math.cos(base + k) * d, y: zt.y + Math.sin(base + k) * d }; if (free(pt, tr)) { if (seaClear(pt, tr)) { pos = pt; break; } if (!alt) alt = pt; } }
        if (!pos) pos = alt;
        if (!pos) pos = { x: zt.x + Math.cos(base) * d, y: zt.y + Math.sin(base) * d };
      } else { // at sea in the island's waters, clear of the zones
        let best = null;
        for (const k of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
          const a = a0 + k; if (!nameOk(a)) continue;
          for (let d = R * 0.9; d <= R * 2.6; d += tr * 0.5) { const pt = { x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d }; if (free(pt, tr) && seaClear(pt, tr)) { if (!best || d < best.d - tr) best = { d, pt }; break; } }
          if (best && best.d <= R * 1.5) break;
        }
        pos = best ? best.pt : { x: isl.x + Math.cos(a0) * R * 1.6, y: isl.y + Math.sin(a0) * R * 1.6 };
      }
      const ids = q.fl.map((f) => f.id), carrying = view.units.filter((a) => ids.includes(a.aboard)).map((a) => a.id);
      const planes = S.planes.filter((pl) => ids.includes(pl.base.fleet)).map((pl) => pl.id);
      out.push({ kind: 'fleet', isl: isl.id, side: q.side, own: q.side, sec: q.spot, x: pos.x, y: pos.y, r: tr, count: q.fl.reduce((n, u) => n + u.str, 0), fleets: ids, units: [...ids, ...carrying], carrying: carrying.length, planes });
    }
  }
  tokCache = out;
  return out;
}
// r8b: cached per week (reinforce only reads holdings that change during End Week)
let nextCache = null;
function nextArrivals() {
  const k = `${S.week}:${S.units.length}:${S.units.reduce((n, u) => n + u.str * (u.cmd + 1), 0)}:${S.planes.length}`;
  if (!nextCache || nextCache.S !== S || nextCache.k !== k) nextCache = { S, k, v: G.previewReinforce(S) };
  return nextCache.v;
}
const tokKey = (t) => `${t.kind}:${t.isl}:${t.side || ''}:${t.sec || ''}`;
function tokenHot(t) {
  if (strip && tokKey(strip) === tokKey(t)) return true;
  if (sel && t.units && t.units.includes(sel)) return true;
  return !!(planeSel && t.planes && t.planes.includes(planeSel));
}
function drawTokens() { for (const t of placeTokens()) { let q = foeSel && !t.ghost ? { ...t, beat: tokenBeats(t) } : t; if (t.kind === 'zone' && zoneTarget(t)) q = { ...q, target: true }; drawToken(q, tokenHot(t)); } }
// r8e: a landing from a fleet already docked at that beach draws from the fleet token's edge (no extra ship glyph)
function landFrom(u, o) {
  if (!strat()) return null;
  const ft = placeTokens().find((t) => t.kind === 'fleet' && t.fleets.includes(u.aboard) && t.isl === o.isl && t.sec === o.sec); if (!ft) return null;
  const zp = secPos(vIsl(o.isl), vSec(o.isl, o.sec)), d = Math.hypot(ft.x - zp.x, ft.y - zp.y) || 1, k = Math.max(0, d - ft.r - 4 / cam.z) / d;
  return { x: zp.x + (ft.x - zp.x) * k, y: zp.y + (ft.y - zp.y) * k };
}
// r8e: zones the selected unit can go to get a dashed gold ring (push inland, land from its ship, dock a fleet)
function zoneTarget(t) {
  const pl = planeSel && !busy && G.plane(S, planeSel);
  if (pl && pl.air) return t.secKind === 'air' && G.canLandPlane(S, pl.id, { isl: t.isl, sec: t.sec }); // r8g: where it may land
  if (pl && pl.type === 'bomber') return G.canStrike(S, pl.id, t.isl, t.sec);
  const u = sel && !busy && G.unit(S, sel); if (!u) return false;
  if (u.kind === 'army' && !u.aboard) return u.at === t.isl && t.sec !== u.sec && G.canSecOrder(S, u, t.sec);
  if (u.kind === 'army' && u.aboard) return G.landIsland(S, u) === t.isl && t.secKind === 'beach';
  if (u.kind === 'fleet') return G.SHIP_ZONES.includes(t.secKind) && G.canFleetMove(S, u.id, t.isl, t.sec);
  return false;
}
// r8b: a Blue token holding something that beats the picked enemy kind
function tokenKeys(t) {
  const ptypes = (t.planes || []).map((id) => G.plane(S, id)).filter((p) => p && p.side === 'blue').map((p) => p.type);
  if (t.kind === 'zone') return [...(t.armySide === 'blue' ? ['army'] : []), ...ptypes];
  if (t.kind === 'fleet' && t.side === 'blue') return ['fleet', ...(t.carrying ? ['army'] : []), ...ptypes];
  return [];
}
const tokenBeats = (t) => !!foeSel && tokenKeys(t).some((k) => STRONG[k].includes(foeSel));
function drawGhost(t, hi, c, zz) {
  const r = t.r, col = SIDE_COL.blue.fill, gc = '#eef1f4';
  c.save();
  c.globalAlpha = 0.6; c.fillStyle = 'rgba(12,15,20,.8)'; c.beginPath(); c.arc(t.x, t.y, r, 0, 7); c.fill();
  c.globalAlpha = 1; c.setLineDash([r * 0.32, r * 0.24]); c.lineWidth = r * 0.16; c.strokeStyle = col; c.stroke(); c.setLineDash([]);
  if (hi) { c.lineWidth = 3 / zz; c.strokeStyle = '#f5c518'; c.beginPath(); c.arc(t.x, t.y, r + 5 / zz, 0, 7); c.stroke(); }
  c.globalAlpha = 0.6;
  if (t.ghost === 'army') armySymbol(c, t.x, t.y, r * 1.12, gc); else if (t.ghost === 'fleet') shipSide(c, t.x, t.y + r * 0.1, r * 1.55, gc); else planeMini(c, t.ev.planeType, t.x, t.y, r * 1.5, 'blue');
  c.globalAlpha = 1;
  // arrival badge (top left): a green ring with an arrow coming in
  const br = Math.max(r * 0.55, 9 / zz), bx = t.x - Math.SQRT1_2 * r, by = t.y - Math.SQRT1_2 * r;
  arriveGlyph(c, bx, by, br);
  if (t.count > 1) { const k = Math.SQRT1_2 * r * 1.02, b2 = Math.max(r * 0.5, 8 / zz); c.fillStyle = '#0d1116'; c.beginPath(); c.arc(t.x + k, t.y - k, b2, 0, 7); c.fill(); c.lineWidth = Math.max(1.5 / zz, b2 * 0.16); c.strokeStyle = '#5fd17a'; c.stroke();
    c.fillStyle = '#fff'; c.font = `900 ${b2 * 1.45}px "Barlow Condensed", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(t.count), t.x + k, t.y - k + b2 * 0.08); }
  c.restore();
}
// "arrives next week": green disc, white arrow pointing down into a bar
function arriveGlyph(c, x, y, r) {
  c.save(); c.fillStyle = '#1f7a3a'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.lineWidth = r * 0.18; c.strokeStyle = '#bff2cc'; c.stroke();
  c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineWidth = r * 0.22; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y - r * 0.55); c.lineTo(x, y + r * 0.1); c.stroke();
  c.beginPath(); c.moveTo(x - r * 0.38, y - r * 0.05); c.lineTo(x + r * 0.38, y - r * 0.05); c.lineTo(x, y + r * 0.38); c.closePath(); c.fill();
  c.fillRect(x - r * 0.5, y + r * 0.45, r, r * 0.16); c.restore();
}
const arriveImg = (() => { let v; return () => { if (v) return v; const c = document.createElement('canvas'); c.width = c.height = 44; const q = c.getContext('2d'); q.scale(2, 2); arriveGlyph(q, 11, 11, 10); return (v = c.toDataURL()); }; })();
function drawToken(t, hi = false, c = g, zz = cam.z) {
  if (t.kind === 'next') { drawGhost(t, hi, c, zz); return; }
  if (t.kind === 'zone') { drawZone(t, hi, c, zz); return; }
  const r = t.r, col = t.own ? SIDE_COL[t.own].fill : '#8a929c', gc = '#eef1f4';
  c.save();
  // r8c: the green counter ring sits outside the gold select ring (r + 5) so both read when a glowing token is selected
  if (t.beat) { c.lineWidth = 4 / zz; c.strokeStyle = 'rgba(95,209,122,.95)'; c.setLineDash([]); c.beginPath(); c.arc(t.x, t.y, r + (hi ? 11 + 1.5 * Math.sin(tNow / 180) : 7 + 2 * Math.sin(tNow / 180)) / zz, 0, 7); c.stroke(); }
  c.shadowColor = 'rgba(0,0,0,.65)'; c.shadowBlur = 6; c.shadowOffsetY = 2 / zz;
  c.fillStyle = 'rgba(12,15,20,.94)'; c.beginPath(); c.arc(t.x, t.y, r, 0, 7); c.fill();
  c.shadowColor = 'transparent';
  c.lineWidth = r * 0.2; c.strokeStyle = col; c.stroke();
  if (hi) { c.lineWidth = 3 / zz; c.strokeStyle = '#f5c518'; c.beginPath(); c.arc(t.x, t.y, r + 5 / zz, 0, 7); c.stroke(); }
  if (t.unknown) { c.fillStyle = gc; c.font = `900 ${r * 1.3}px "Barlow Condensed", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', t.x, t.y + r * 0.06); }
  else if (t.fort) { c.save(); c.translate(t.x, t.y); c.scale(r / 11, r / 11); fortAt(c, 0, 0, t.own); c.restore(); }
  else if (t.kind === 'troops') armySymbol(c, t.x, t.y, r * 1.12, gc);
  else if (t.kind === 'fleet') shipSide(c, t.x, t.y + r * 0.1, r * 1.55, gc);
  else if (t.kind === 'carrier') unitGlyph(c, 'cv', t.x, t.y, r * 1.45, gc, 2.6);
  else secIcon(c, t.kind, t.x, t.y, r * 1.2, gc);
  // small count badge (top right) and a troops-aboard dot on a fleet (top left)
  const badge = (bx, by, fn) => { const br = Math.max(r * 0.5, 8 / zz); c.fillStyle = '#0d1116'; c.beginPath(); c.arc(bx, by, br, 0, 7); c.fill(); c.lineWidth = Math.max(1.5 / zz, br * 0.16); c.strokeStyle = col; c.stroke(); fn(bx, by, br); };
  const k = Math.SQRT1_2 * r * 1.02;
  if (t.count > 1 || (t.count > 0 && (t.kind === 'air' || t.kind === 'carrier' || t.fort))) badge(t.x + k, t.y - k, (bx, by, br) => { c.fillStyle = '#fff'; c.font = `900 ${br * 1.45}px "Barlow Condensed", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(t.count), bx, by + br * 0.08); });
  if (t.carrying) badge(t.x - k, t.y - k, (bx, by, br) => armySymbol(c, bx, by, br * 1.2, '#f5c518'));
  if (t.kind === 'fleet' && t.planes && t.planes.length) badge(t.x + k, t.y + k, (bx, by, br) => planeTop(c, bx, by, br * 1.5, '#e6ebf0', -Math.PI / 2)); // r8e: a carrier's planes ride in its fleet
  c.restore();
}
// r8e: a zone circle (owner outline + soft fill, grey under fog) with what it holds inside: icon + count
const SEC_GREY = 'rgba(196,204,214,.9)', SEC_GREY_FILL = 'rgba(150,158,168,.22)';
// r8g2 fix 4: a solid plane silhouette (the card plane icon's outline, filled) for planes in the air over a zone
const PLANE_P = new Path2D('M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z');
const OPEN_LINE = '#f4dd8e', OPEN_FILL = 'rgba(236,214,140,.30)', OPEN_ICON = '#fff6d6'; // r8g2: revealed, nobody's
const secHex = { blue: { line: '#5b8ff0', fill: 'rgba(44,90,168,.5)' }, red: { line: '#e2453f', fill: 'rgba(179,32,31,.45)' } };
let zoneLog = []; // QA: what each zone circle was drawn with this frame
function drawZone(t, hi, c, zz) {
  const r = t.r, cl = t.own ? secHex[t.own] : null, gc = '#f2f5f8';
  c.save();
  if (t.beat) { c.lineWidth = 4 / zz; c.strokeStyle = 'rgba(95,209,122,.95)'; c.beginPath(); c.arc(t.x, t.y, r + (hi ? 11 + 1.5 * Math.sin(tNow / 180) : 7 + 2 * Math.sin(tNow / 180)) / zz, 0, 7); c.stroke(); }
  // r8g2 fix 1: three looks. Owned = side colour. Revealed but nobody's (neutral / empty) = OPEN: sand tint, solid sand ring,
  // full-colour symbol. Fog = dim grey, hatched, dashed ring, faded symbol.
  const open = !t.unknown && !cl;
  c.fillStyle = cl ? cl.fill : open ? OPEN_FILL : SEC_GREY_FILL; c.beginPath(); c.arc(t.x, t.y, r, 0, 7); c.fill();
  if (t.unknown) { // hatch
    c.save(); c.beginPath(); c.arc(t.x, t.y, r, 0, 7); c.clip(); c.strokeStyle = 'rgba(20,24,30,.55)'; c.lineWidth = Math.max(1.4 / zz, r * 0.07);
    for (let d = -r * 2; d <= r * 2; d += r * 0.32) { c.beginPath(); c.moveTo(t.x + d - r, t.y + r); c.lineTo(t.x + d + r, t.y - r); c.stroke(); }
    c.restore();
  }
  if (t.show && !t.unknown) { c.fillStyle = 'rgba(10,13,18,.55)'; c.beginPath(); c.arc(t.x, t.y, r * 0.78, 0, 7); c.fill(); } // contrast for the icon
  c.lineWidth = 3 / zz; c.strokeStyle = 'rgba(8,10,14,.75)'; c.beginPath(); c.arc(t.x, t.y, r + 1.5 / zz, 0, 7); c.stroke();
  if (t.unknown) c.setLineDash([4 / zz, 3.5 / zz]);
  c.lineWidth = (open ? 3.4 : 2.6) / zz; c.strokeStyle = cl ? cl.line : open ? OPEN_LINE : SEC_GREY; c.beginPath(); c.arc(t.x, t.y, r, 0, 7); c.stroke(); c.setLineDash([]);
  if (t.target && fx.nogoT && tNow - fx.nogoT < 2200) { c.lineWidth = 5 / zz; c.strokeStyle = `rgba(245,197,24,${0.55 + 0.4 * Math.sin(tNow / 110)})`; c.beginPath(); c.arc(t.x, t.y, r + 9 / zz, 0, 7); c.stroke(); }
  if (t.target) { c.setLineDash([5 / zz, 4 / zz]); c.lineDashOffset = -tNow / 40 / zz; c.lineWidth = 2.5 / zz; c.strokeStyle = 'rgba(245,197,24,.95)'; c.beginPath(); c.arc(t.x, t.y, r + 4 / zz, 0, 7); c.stroke(); c.setLineDash([]); }
  if (hi) { c.lineWidth = 3 / zz; c.strokeStyle = '#f5c518'; c.beginPath(); c.arc(t.x, t.y, r + 5 / zz, 0, 7); c.stroke(); }
  // r8g ask 2: the place symbol always (dimmed under fog: the map shape is no secret, the owner is)
  if (t.show) { c.save(); if (t.unknown) c.globalAlpha = 0.38; secIcon(c, t.show, t.x, t.y, r * 1.05, t.unknown ? '#aeb6c0' : open ? OPEN_ICON : gc); c.restore(); }
  const k = Math.SQRT1_2 * r * 1.02, br = Math.max(r * 0.46, 7.5 / zz);
  const disc = (bx, by, ring) => { c.fillStyle = '#0d1116'; c.beginPath(); c.arc(bx, by, br, 0, 7); c.fill(); c.lineWidth = Math.max(1.5 / zz, br * 0.16); c.strokeStyle = ring; c.stroke(); };
  // top right: how many units are here, ringed in their side's colour
  if (t.count > 0) { disc(t.x + k, t.y - k, t.numSide ? secHex[t.numSide].line : cl ? cl.line : SEC_GREY); c.fillStyle = '#fff'; c.font = `900 ${br * 1.45}px "Barlow Condensed", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(t.count), t.x + k, t.y - k + br * 0.08); }
  // top left: a plane in the air over this zone (r8g asks 6 / 7)
  // r8g2 fix 4: a plane silhouette (side colour, dark outline) over the circle's top-left edge, readable at map zoom
  if (t.up && t.up.length) { const L = Math.max(r * 1.7, 30 / zz), ax = t.x - r * 0.6, ay = t.y - r * 0.6;
    c.save(); c.translate(ax - L / 2, ay - L / 2); c.scale(L / 24, L / 24); c.lineJoin = 'round';
    c.lineWidth = 3.2; c.strokeStyle = 'rgba(8,10,14,.95)'; c.stroke(PLANE_P); c.fillStyle = SIDE_COL[t.upSide].light; c.fill(PLANE_P);
    c.lineWidth = 1; c.strokeStyle = '#fff'; c.stroke(PLANE_P); c.restore(); }
  // bottom right: a garrison fort (not a unit; a small mark so the zone still reads as defended)
  if (t.gar > 0) { c.save(); c.translate(t.x + k, t.y + k); c.scale(br / 9, br / 9); fortAt(c, 0, 0, t.own); c.restore(); }
  if (t.next) arriveGlyph(c, t.x - k, t.y + k, br); // r8b arrivals land in this zone next week
  c.restore();
  if (c === g) { const p = toScreen(t.x, t.y); zoneLog.push({ isl: t.isl, sec: t.sec, line: cl ? cl.line : SEC_GREY, tint: cl ? cl.fill : null, known: !t.unknown, open: !t.unknown && !cl, owner: t.own, x: p.x, y: p.y, r: r * zz, wx: t.x, wy: t.y, wr: r, show: t.show, count: t.count, next: t.next, up: (t.up || []).length, gar: t.gar || 0, numSide: t.numSide || null }); }
}
function fortAt(c, x, y, owner) {
  c.fillStyle = 'rgba(20,22,26,.9)'; c.fillRect(x - 7, y - 6, 14, 12);
  c.fillStyle = owner ? SIDE_COL[owner].light : '#d0d4da'; c.fillRect(x - 5, y - 4, 10, 8);
  c.fillRect(x - 5, y - 7, 3, 3); c.fillRect(x + 2, y - 7, 3, 3);
}
function tokenAt(sx, sy) {
  if (!strat()) return null;
  tokCache = null;
  let best = null, bd = 1e9;
  for (const t of placeTokens()) {
    const p = toScreen(t.x, t.y), d = Math.hypot(p.x - sx, p.y - sy);
    if (d <= Math.max(TOK_HIT, t.r * cam.z + 4) && d < bd) { bd = d; best = t; }
  }
  return best;
}
// a token's look as a data URL, for the strip header
function tokenImg(t) {
  const c = document.createElement('canvas'); c.width = c.height = 96; const q = c.getContext('2d'); q.scale(2, 2);
  drawToken({ ...t, x: 24, y: 24, r: 19, count: 0, carrying: 0 }, false, q, 1);
  return c.toDataURL();
}

// ---------- r8 bottom card strip ----------
// r8g ask 3: a two-level drill-down. Level 1 = one card per unit group showing only its leading officer (an army
// regiment, a fleet, an air wing). Tap a group card = level 2: its sub-groups with the real units in them (an army's
// battalions with their companies, a fleet's ships, an air wing's planes). A back card returns to level 1.
const wingCmd = (key) => 300 + [...key].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 7) % 400; // a stable pilot officer per wing
function wingsOf(planes) { const m = new Map(); for (const p of planes) { if (!m.has(p.side)) m.set(p.side, []); m.get(p.side).push(p); } return [...m.entries()].map(([side, list]) => ({ side, list })); }
function stripCards() {
  if (!strip) return [];
  const isl = vIsl(strip.isl), cards = [];
  const list = unitsAtView(strip.isl);
  if (strip.grp) return groupCards(strip.grp, list);
  const groupCard = (u) => ({ t: 'g', u });
  if (strip.kind === 'next') {
    const e = nextArrivals().find((x) => x.side === 'blue' && x.island === strip.isl);
    if (e) {
      for (const a of e.armies) cards.push({ t: 'n', k: 'army', cmd: a.cmd, add: a.add, id: a.id });
      if (e.ships) cards.push({ t: 'n', k: 'ship', type: e.shipType });
      if (e.planes) cards.push({ t: 'n', k: 'plane', type: e.planeType });
    }
    if (!cards.length) cards.push({ t: 'e' });
  } else if (strip.kind === 'zone') {
    const x = isl.secs.find((q) => q.id === strip.sec), known = zKnown(strip.isl, strip.sec);
    list.filter((u) => u.kind === 'army' && !u.aboard && u.sec === strip.sec && !u.unknown).forEach((u) => cards.push(groupCard(u)));
    // planes on this airfield and planes in the air over this zone: one air wing card per side
    const here = S.planes.filter((p) => (known && x.kind === 'air' && !p.air && p.base.isl === strip.isl && p.base.sec === x.id) || (p.air && airZone(p) === `${strip.isl}:${x.id}` && (p.side === 'blue' || known)));
    for (const w of wingsOf(here)) cards.push({ t: 'ga', side: w.side, key: `z:${strip.isl}:${x.id}:${w.side}`, n: w.list.length, up: w.list.some((p) => p.air) });
    if (!known) { if (!cards.length) cards.push({ t: 'q' }); }
    else if (x.owner !== 'blue' && x.gar > 0) cards.push({ t: 'f', sec: x, n: x.gar, own: x.owner });
    // r8b arrivals that land in this zone next week (troops at HQ, a ship at the port, a plane at the airfield)
    const e = nextArrivals().find((q) => q.side === 'blue' && q.island === strip.isl && !busy && !S.over);
    if (e && x.kind === 'hq') for (const a of e.armies) cards.push({ t: 'n', k: 'army', cmd: a.cmd, add: a.add, id: a.id });
    if (e && x.kind === 'port' && e.ships) cards.push({ t: 'n', k: 'ship', type: e.shipType });
    if (e && x.kind === 'air' && e.planes) cards.push({ t: 'n', k: 'plane', type: e.planeType });
    if (!cards.length) cards.push({ t: 'z', kind: x.kind, own: known ? x.owner : null });
  } else if (strip.kind === 'fleet') {
    const ids = strip.fleets || [];
    list.filter((u) => u.kind === 'fleet' && ids.includes(u.id)).forEach((f) => cards.push(groupCard(f)));
    list.filter((u) => u.kind === 'army' && ids.includes(u.aboard)).forEach((u) => cards.push(groupCard(u)));
    for (const w of wingsOf(S.planes.filter((p) => !p.air && ids.includes(p.base.fleet)))) cards.push({ t: 'ga', side: w.side, key: `f:${ids.join(',')}:${w.side}`, n: w.list.length }); // r8e: carrier planes ride with the fleet
    if (!cards.length) cards.push({ t: 'e' });
  }
  return cards;
}
function wingPlanes(key) {
  const [k, a, b, side] = key.split(':');
  if (k === 'z') return S.planes.filter((p) => p.side === side && ((!p.air && p.base.isl === a && p.base.sec === b && zKnown(a, b)) || (p.air && airZone(p) === `${a}:${b}` && (p.side === 'blue' || zKnown(a, b)))));
  const ids = a.split(','); return S.planes.filter((p) => p.side === b && !p.air && ids.includes(p.base.fleet)); // fleet key = f:<ids>:<side>
}
function groupCards(grp, list) {
  const cards = [{ t: 'back' }];
  if (grp.k === 'air') { wingPlanes(grp.key).forEach((p) => cards.push({ t: 'pl', p })); return cards; }
  const u = G.unit(S, grp.id) || list.find((x) => x.id === grp.id);
  if (!u) return cards;
  cards.push({ t: 'g', u, head: true });
  if (u.kind === 'fleet') { G.syncOob(u); u.ships.forEach((t, i) => cards.push({ t: 's', u, ship: t, i })); }
  else G.battalions(u).forEach((b) => cards.push({ t: 'bn', u, b }));
  return cards;
}
const ordersOf = (id) => !!(S.orders[id] || S.secOrders[id] || S.landOrd[id] || S.embark[id]);
// r8b strong / weak row: a green up arrow + what this card beats, a red down arrow + what beats it (real rules only)
const keyImg = (() => { const m = {}; return (k) => {
  if (m[k]) return m[k];
  if (!['army', 'fleet', 'fort'].includes(k)) return (m[k] = unitIcon(k, 16));
  const c = document.createElement('canvas'); c.width = c.height = 48; const q = c.getContext('2d'); q.scale(3, 3);
  if (k === 'army') armySymbol(q, 8, 8, 14, '#eef1f4'); else if (k === 'fleet') shipSide(q, 8, 9, 16, '#eef1f4'); else { q.translate(8, 8.5); q.scale(1.05, 1.05); fortAt(q, 0, 0, null); }
  return (m[k] = `<img src="${c.toDataURL()}" width="16" height="16" alt="">`);
}; })();
function matchRow(k) {
  if (!k || !STRONG[k]) return '';
  const st = STRONG[k], wk = WEAK[k]; if (!st.length && !wk.length) return '';
  const part = (cls, list) => (list.length ? `<span class="mu ${cls}" data-k="${list.join(' ')}"><i class="ar"></i>${list.map((x) => `<i class="mk" data-k="${x}">${keyImg(x)}</i>`).join('')}</span>` : '');
  return `<span class="mr">${part('up', st)}${part('dn', wk)}</span>`;
}
const matchCls = (k) => (!foeSel || !k ? '' : STRONG[k] && STRONG[k].includes(foeSel) ? ' beat' : STRONG[foeSel] && STRONG[foeSel].includes(k) ? ' risk' : '');
function cardHtml(c) {
  const h = cardHtml0(c), k = c.t === 'u' || c.t === 'g' ? (c.u.kind === 'fleet' ? 'fleet' : 'army') : c.t === 's' ? 'fleet' : c.t === 'pl' ? c.p.type : c.t === 'f' ? 'fort' : null;
  if (!k) return h;
  const mine = c.t === 'pl' ? c.p.side === 'blue' : c.t === 'f' ? c.own === 'blue' : c.u.side === 'blue';
  const foeOn = !mine && foeSel === k ? ' foe-on' : '';
  // inject the key, the highlight class and the matchup row into the card's opening tag / before its close
  return h.replace(/^<(button|div) class="sc/, `<$1 data-key="${k}" class="sc${mine ? matchCls(k) : foeOn}`).replace(/<\/(button|div)>$/, `${matchRow(k)}</$1>`);
}
// r8g2: "spent this week" mark: a plane-down arrow onto a runway bar inside a clock-like ring (no words)
const SPENT_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10"/><polyline points="7.5 10 12 14.5 16.5 10"/><line x1="5" y1="19" x2="19" y2="19"/></svg>';
function cardHtml0(c) {
  if (c.t === 'n') {
    const inner = c.k === 'army' ? `<canvas class="sc-p" data-side="blue" data-cmd="${c.cmd}" data-k="army" width="96" height="96"></canvas><b class="sc-add">+${c.add}</b>`
      : `${unitIcon(c.type, 34)}<b class="sc-add">+1</b>`;
    return `<div class="sc next blue" data-n="${c.k}"${c.type ? ` data-t="${c.type}"` : ''}${c.id ? ` data-u0="${c.id}"` : ''}><i class="sc-nx"><img alt="" src="${arriveImg()}" width="22" height="22"></i>${inner}</div>`;
  }
  if (c.t === 'back') return `<button class="sc back" data-back="1" aria-label="Back">${icon('back', { size: 28 })}</button>`;
  if (c.t === 'g') { // officer only: the group's leading officer portrait (+ a small move mark if it has an order)
    const u = c.u, mine = u.side === 'blue', on = u.id === sel;
    const inner = `<canvas class="sc-p" data-side="${u.side}" data-cmd="${u.cmd}" data-k="${u.kind}" data-only="1" width="96" height="96"></canvas>${mine && ordersOf(u.id) ? `<i class="sc-o">${icon('move', { size: 14 })}</i>` : ''}`;
    const attrs = `data-g="${u.id}" data-u="${u.id}" data-cmd="${u.cmd}" data-army="${u.kind === 'army' && !c.head ? 1 : ''}"`;
    return mine ? `<button class="sc grp ${u.side}${on ? ' on' : ''}${c.head ? ' head' : ''}" ${attrs} aria-label="Group">${inner}</button>` : `<div class="sc grp ${u.side} foe${c.head ? ' head' : ''}" data-g="${u.id}">${inner}</div>`;
  }
  if (c.t === 'ga') { // an air wing: its pilot officer, a small plane mark (gold when some are in the air)
    const inner = `<canvas class="sc-p" data-side="${c.side}" data-cmd="${wingCmd(c.key)}" data-only="1" width="96" height="96"></canvas><i class="sc-w${c.up ? ' up' : ''}">${unitIcon('fighter', 16)}</i>`;
    return `<button class="sc grp wing ${c.side}${c.side === 'blue' ? '' : ' foe'}" data-ga="${c.key}" aria-label="Air wing">${inner}</button>`;
  }
  if (c.t === 'bn') { // a battalion: its commander + its companies (the real units) with their pips
    return `<div class="sc bn ${c.u.side}" data-bn="${c.b.n}"><canvas class="sc-c" data-side="${c.u.side}" data-cmd="${c.b.cmd}" width="44" height="44"></canvas><span class="bn-cos">${c.b.cos.map((q) => `<i class="co" data-t="${q.type}">${unitIcon(q.type, 22)}${pipsHtml(q.pips)}</i>`).join('')}</span></div>`;
  }
  if (c.t === 'u') {
    const u = c.u, mine = u.side === 'blue', on = u.id === sel;
    const pips = u.kind === 'army' ? `<span class="sp">${Array.from({ length: G.MAX_STR.army }, (_, k) => `<i class="${k < u.str ? 'on' : ''}"></i>`).join('')}</span>` : '';
    const inner = `<canvas class="sc-p" data-side="${u.side}" data-cmd="${u.cmd}" data-k="${u.kind}" width="96" height="96"></canvas>${pips}${u.aboard ? `<i class="sc-b">${toastImg('ship')}</i>` : ''}${mine && ordersOf(u.id) ? `<i class="sc-o">${icon('move', { size: 14 })}</i>` : ''}`;
    return mine ? `<button class="sc ${u.side}${on ? ' on' : ''}" data-u="${u.id}" data-cmd="${u.cmd}" data-army="${u.kind === 'army' ? 1 : ''}" aria-label="Army">${inner}</button>` : `<div class="sc ${u.side} foe">${inner}</div>`;
  }
  if (c.t === 's') {
    const u = c.u, mine = u.side === 'blue', on = u.id === sel;
    const inner = `${unitIcon(c.ship, 34)}<canvas class="sc-c" data-side="${u.side}" data-cmd="${u.cmd}" width="44" height="44"></canvas>${c.i === 0 && mine && ordersOf(u.id) ? `<i class="sc-o">${icon('move', { size: 14 })}</i>` : ''}`;
    return mine ? `<button class="sc ship ${u.side}${on ? ' on' : ''}" data-u="${u.id}" data-t="${c.ship}" aria-label="${UNIT_NAMES[c.ship]}">${inner}</button>` : `<div class="sc ship ${u.side} foe" data-t="${c.ship}">${inner}</div>`;
  }
  if (c.t === 'pl') {
    const p = c.p, mine = p.side === 'blue', st = p.used ? ' used' : S.strikes[p.id] || (S.flyOrd && S.flyOrd[p.id]) || (S.landPl && S.landPl[p.id]) || (S.reconOrd && S.reconOrd[p.id]) ? ' set' : '';
    const mark = S.strikes[p.id] ? icon('crosshair', { size: 14 }) : S.flyOrd && S.flyOrd[p.id] ? icon('move', { size: 14 }) : S.landPl && S.landPl[p.id] ? icon('anchor', { size: 14 }) : S.reconOrd && S.reconOrd[p.id] ? icon('target', { size: 14 }) : '';
    const inner = `${unitIcon(p.type, 34)}${mark ? `<i class="sc-o">${mark}</i>` : ''}${p.air ? '<i class="sc-up"></i>' : ''}${p.used || p.air ? `<i class="sc-spent${p.air ? ' air' : ''}">${SPENT_SVG}</i>` : ''}`; // r8g2 fix 3: spent this week (flew / landed) or up now = must come down, cannot go up this week
    return mine ? `<button class="sc pl ${p.side}${st}${p.air ? ' air' : ''}${p.id === planeSel ? ' on' : ''}" data-p="${p.id}" data-t="${p.type}" aria-label="${UNIT_NAMES[p.type]}">${inner}</button>` : `<div class="sc pl ${p.side} foe${p.air ? ' air' : ''}" data-t="${p.type}">${inner}</div>`;
  }
  if (c.t === 'f') return `<div class="sc fort ${c.own || 'none'}${c.own === 'blue' ? '' : ' foe'}"><canvas class="sc-f" data-own="${c.own || ''}" width="96" height="96"></canvas><b class="sc-n">${c.n}</b></div>`;
  if (c.t === 'p') return `<div class="sc base ${c.own || 'none'}">${toastImg('port')}</div>`;
  if (c.t === 'z') return `<div class="sc base ${c.own || 'none'}" data-z="${c.kind}">${toastImg(c.kind)}</div>`;
  if (c.t === 'e') return `<div class="sc base none"><img alt="" src="${toastImg('air')}" width="40" height="40" style="opacity:.45"></div>`;
  return `<div class="sc none"><b class="sc-q">?</b></div>`;
}
function renderStrip() {
  const box = $('strip');
  if (strip && (busy || S.over)) strip = null;
  if (!strip) { if (!box.hidden) { box.hidden = true; box.dataset.key = ''; $('app').classList.remove('strip-open'); measurePanel(); } return; }
  const cards = stripCards();
  const key = JSON.stringify([tokKey(strip), strip.grp, sel, planeSel, foeSel, cards.map((c) => [c.t, c.u && c.u.id, c.u && c.u.str, c.u && c.u.cmd, c.u && ordersOf(c.u.id), c.p && c.p.id, c.p && c.p.used, c.p && S.strikes[c.p.id], c.p && S.flyOrd && S.flyOrd[c.p.id], c.p && S.landPl && S.landPl[c.p.id], c.p && S.reconOrd && S.reconOrd[c.p.id], c.p && !!c.p.air, c.n, c.cmd, c.add, c.type, c.key, c.b && c.b.cos.map((q) => q.pips).join()])]);
  const wasHidden = box.hidden;
  box.hidden = false; $('app').classList.add('strip-open');
  box.classList.toggle('lv2', !!strip.grp); // r8g2 fix 2: level 2 is one low row (scrolls sideways) so the map stays usable
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    const sc = box.querySelector('.st-cards'), left = sc && !wasHidden ? sc.scrollLeft : 0;
    const head = placeTokens().find((t) => tokKey(t) === tokKey(strip)) || strip;
    box.innerHTML = `<img class="st-head" alt="" src="${tokenImg(head)}" width="48" height="48"><div class="st-cards">${cards.map(cardHtml).join('')}</div>`
      + `<button class="btn ico" id="st-x" aria-label="Close" title="Close">${icon('x', { size: 24 })}</button>`;
    box.querySelectorAll('canvas.sc-p').forEach((cv) => {
      const q = cv.getContext('2d'); q.drawImage(portrait(cv.dataset.side, +cv.dataset.cmd, 192), 0, 0, 96, 96);
      if (!cv.dataset.only) { q.fillStyle = 'rgba(10,13,18,.85)'; q.fillRect(52, 66, 42, 28); armySymbol(q, 73, 80, 30, '#fff'); }
    });
    box.querySelectorAll('canvas.sc-c').forEach((cv) => cv.getContext('2d').drawImage(portrait(cv.dataset.side, +cv.dataset.cmd, 88), 0, 0, 44, 44));
    box.querySelectorAll('canvas.sc-f').forEach((cv) => { const q = cv.getContext('2d'); q.save(); q.translate(48, 48); q.scale(3.2, 3.2); fortAt(q, 0, 0, cv.dataset.own || null); q.restore(); });
    box.querySelector('.st-cards').scrollLeft = left;
  }
  $('app').style.setProperty('--strip-h', `${box.offsetHeight}px`); // r8c: the strip can wrap to two rows on a narrow screen
  if (wasHidden || box.dataset.h !== String(box.offsetHeight)) { box.dataset.h = String(box.offsetHeight); measurePanel(); }
}
function openStrip(t) {
  if (t.kind === 'fleet' && t.side === 'blue') shipHintSeen();
  strip = { kind: t.kind, isl: t.isl, side: t.side, sec: t.sec || null, fleets: t.fleets || null, grp: null };
  // r8b: opening an enemy place picks its kind, so your counters glow (on the map, in the tray, in your strips)
  if (seen.has(t.isl)) {
    if (t.kind === 'zone') { if (t.armySide === 'red') foeSel = 'army'; else if (t.fort && t.own === 'red') foeSel = 'fort'; }
    else if (t.kind === 'fleet' && t.side === 'red') foeSel = 'fleet';
  }
  armWarnGuard(); // r7c lesson: the opening tap's leftover touchend / click must not land on a card
  sfx.pew(); updateHud(); keepAboveStrip(t.isl);
}
// slide the map so the opened place's tokens sit above the strip
function keepAboveStrip(islId) {
  const st = $('strip'); if (st.hidden) return;
  const top = st.offsetTop - 10; // offsetTop ignores the slide-up transform
  tokCache = null;
  const ts = placeTokens().filter((q) => q.isl === islId); if (!ts.length) return;
  const bottom = Math.max(...ts.map((q) => toScreen(q.x, q.y).y + q.r * cam.z + 6));
  if (bottom > top) { cam.y += (bottom - top) / cam.z; clampCam(); tokCache = null; }
}
function closeStrip() { if (!strip) return; strip = null; foeSel = null; updateHud(); }

// ---------- r8 scout first: no words, a pulsing recon card and a dotted recon path to the fogged island ----------
function scoutCue(attackPid, islId) {
  const p = G.plane(S, attackPid), from = p && G.planeBase(S, p);
  const rec = S.planes.filter((q) => q.side === 'blue' && q.type === 'recon' && !q.used && G.planeBase(S, q) && reconTargetsFor(q.id).includes(islId));
  // a recon already showing in the open strip wins, else the nearest ready one
  const inStrip = (q) => (strip && $('strip').querySelector(`[data-p="${q.id}"]`) ? 0 : 1);
  const r = rec.sort((a, b) => { const A = G.planeBase(S, a), B = G.planeBase(S, b), i = G.island(S, islId); return inStrip(a) - inStrip(b) || Math.hypot(A.x - i.x, A.y - i.y) - Math.hypot(B.x - i.x, B.y - i.y); })[0];
  const rb = r && G.planeBase(S, r);
  fx.scout = { to: islId, rid: r ? r.id : null, from: rb ? { x: rb.x, y: rb.y } : from ? { x: from.x, y: from.y } : null, ok: !!r, t0: performance.now() };
  // r8g: no air tray button any more: open the recon plane's own base (airfield zone or carrier fleet) at its air wing
  if (r && !(strip && $('strip').querySelector(`[data-p="${r.id}"]`))) openPlaneHome(r);
  updateHud();
  pulseRecon();
  sfx.pew();
}
function pulseRecon() {
  document.querySelectorAll('.pulse').forEach((e) => e.classList.remove('pulse'));
  const sc = fx.scout; if (!sc) return;
  const els = sc.rid ? [...document.querySelectorAll(`#strip [data-p="${sc.rid}"], #air [data-p="${sc.rid}"]`)] : [];
  els.forEach((e) => { void e.offsetWidth; e.classList.add('pulse'); });
  clearTimeout(pulseRecon.h); pulseRecon.h = setTimeout(() => { document.querySelectorAll('.pulse').forEach((e) => e.classList.remove('pulse')); }, SCOUT_MS);
}
const SCOUT_MS = 2800;
function drawScout(sc) {
  const k = (tNow - sc.t0) / SCOUT_MS; if (k >= 1) { fx.scout = null; return; }
  const isl = vIsl(sc.to), a = Math.min(1, (1 - k) * 3);
  const col = sc.ok ? 'rgba(232,244,255,.95)' : 'rgba(150,158,168,.85)';
  g.save(); g.globalAlpha = a;
  if (sc.from) {
    const cv = arrowCurve(sc.from, { x: isl.x, y: isl.y }, 0.18), grow = Math.min(1, k * 4);
    g.setLineDash([3 / cam.z, 11 / cam.z]); g.lineCap = 'round'; g.lineWidth = 6 / cam.z; g.strokeStyle = col; g.lineDashOffset = -tNow / 20 / cam.z;
    g.beginPath(); for (let i = 0; i <= 40; i++) { const p = curvePt(cv, (i / 40) * grow); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } g.stroke(); g.setLineDash([]);
    if (sc.ok) { const p = curvePt(cv, Math.min(0.98, grow * 0.5)), q = curvePt(cv, Math.min(1, grow * 0.5 + 0.02)); planeMini(g, 'recon', p.x, p.y, Math.max(30, 30 / cam.z), 'blue', Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2); }
  }
  const pr = R + (14 + 10 * Math.sin(tNow / 160)) / cam.z;
  g.setLineDash([3 / cam.z, 10 / cam.z]); g.lineCap = 'round'; g.lineWidth = 6 / cam.z; g.strokeStyle = col;
  g.beginPath(); g.arc(isl.x, isl.y, pr, 0, 7); g.stroke();
  g.restore();
}

// ---------- render ----------
let tNow = 0;
function frame() {
  tNow = performance.now();
  try { render(); } catch (e) { errors.push(String(e && e.message)); throw e; }
  requestAnimationFrame(frame);
}
function render() {
  cardCache = null; labelCache = null; tokCache = null; planeMarks = []; carrierQ = []; zoneLog = [];
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0f1724'; g.fillRect(0, 0, vw, vh);
  g.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z), dpr * (vh / 2 - cam.y * cam.z));
  if (terrain) { g.imageSmoothingEnabled = true; g.drawImage(terrain, 0, 0, WW, WH); }
  drawGrid();
  const ks = secK();
  if (!busy && S.lastArrows.length) S.lastArrows.forEach((a) => { if (arrowVisible(a)) drawMoveArrow(a, 1, 0.22); });
  view.islands.forEach((isl) => drawIsland(isl, ks));
  view.islands.forEach((isl) => { const a = fogAlpha(isl.id); if (a > 0) drawFog(isl, a); });
  Object.entries(fx.reveals).forEach(([id, t0]) => drawReveal(vIsl(id), t0));
  if (sel && !busy) drawRange();
  if (reconMode && !busy) drawReconTargets();
  if (planeSel && !reconMode && !busy) drawStrikeTargets();
  if (!busy) {
    Object.entries(S.orders).forEach(([id, to]) => {
      const u = G.unit(S, id);
      if (u && u.side === 'blue') {
        drawArrowBetween(u.at, to, 'blue', 1, 0.5 + 0.2 * Math.sin(tNow / 260), u.kind);
        if (u.kind === 'army' && ks > 0 && S.landAt[id]) { const b = vSec(to, S.landAt[id]); if (b) targetRing(b.x, b.y, SEC_R + 9, ks); }
      }
    });
    Object.entries(S.secOrders).forEach(([id, to]) => {
      const u = G.unit(S, id);
      if (u && u.side === 'blue') drawSecArrow(u.at, u.sec, to, 'blue', 1, 0.6 + 0.25 * Math.sin(tNow / 260));
    });
    const pulse = 0.6 + 0.25 * Math.sin(tNow / 260);
    // r7 sealift: beach -> ship (embark) and ship -> beach (land) arrows
    Object.entries(S.embark).forEach(([id, fid]) => { const u = G.unit(S, id); if (!u || u.side !== 'blue' || !u.sec) return;
      const ft = strat() && placeTokens().find((t) => t.kind === 'fleet' && t.fleets.includes(fid)); // r8e: the arrow ends on that fleet's token
      let sp = null;
      if (ft) { const zp = secPos(vIsl(u.at), vSec(u.at, u.sec)), d = Math.hypot(ft.x - zp.x, ft.y - zp.y) || 1, k = Math.max(0, d - ft.r - 4 / cam.z) / d; sp = { x: zp.x + (ft.x - zp.x) * k, y: zp.y + (ft.y - zp.y) * k }; }
      drawShoreArrow(u.at, u.sec, 'blue', 1, pulse, true, sp); });
    Object.entries(S.landOrd).forEach(([id, o]) => { const u = G.unit(S, id); if (u && u.side === 'blue') { drawShoreArrow(o.isl, o.sec, 'blue', 1, pulse, false, landFrom(u, o)); const x = vSec(o.isl, o.sec), q = secPos(vIsl(o.isl), x); targetRing(q.x, q.y, q.r * 1.3 + 3 / cam.z, 0.9); if (G.landingRisk(S, 'blue', o.isl).risk) riskMark(q); } });
    Object.entries(S.strikes).forEach(([pid, to], i) => { const p = G.plane(S, pid); const b = p && G.planeBase(S, p); if (b && p.side === 'blue') drawStrikeLine(b, vIsl(to), p.type, i, pulse); });
    Object.entries(S.reconOrd || {}).forEach(([pid, to]) => { const p = G.plane(S, pid); const b = p && G.planeBase(S, p); if (b && p.side === 'blue') drawReconOrder(b, vIsl(to)); });
  }
  if (fx.stayArrows) fx.stayArrows.forEach((m) => drawMoveArrow(m, 1, 0.85));
  if (fx.moving) fx.moving.list.forEach((m) => drawMoveArrow(m, fx.moving.t, 0.9));
  const blocks = useBlocks();
  if (blocks) drawLeaders();
  if (strat()) {
    // r8: detail (section markers, terrain) only for the island the player opened; then one token per place
    const det = detailIsles();
    void det; // r8e: the zone circles (tokens) are the section markers; drawn above the fog, under the fleets
    drawTokens();
  } else view.islands.forEach((isl) => unitsAtView(isl.id).forEach((u) => {
    if (blocks) { drawBlock(u, blockAt(u)); return; }
    const p = tagPos(u); drawTag(u, p.x, p.y, p.s);
  }));
  if (fx.scout) drawScout(fx.scout);
  if (fx.hop) drawHop(fx.hop);
  // r7: with an army on a beach selected, the ships it can board get a pulsing dashed frame
  const cu = sel && !busy && G.unit(S, sel);
  if (cu && cu.kind === 'army' && !cu.aboard && strat()) placeTokens().filter((t) => t.kind === 'fleet' && t.isl === cu.at && t.fleets.some((id) => G.canEmbark(S, cu, id))).forEach((t) => {
    g.save(); g.setLineDash([10 / cam.z, 7 / cam.z]); g.lineDashOffset = -tNow / 30 / cam.z; g.lineWidth = 3 / cam.z; g.strokeStyle = 'rgba(245,197,24,.95)';
    g.beginPath(); g.arc(t.x, t.y, t.r + 7 / cam.z, 0, 7); g.stroke(); g.restore();
  });
  else if (cu && cu.kind === 'army' && !cu.aboard) unitsAtView(cu.at).filter((f) => f.kind === 'fleet' && G.canEmbark(S, cu, f.id)).forEach((f) => {
    let r;
    if (blocks) { const k = blockAt(f); r = { x0: k.x0, y0: k.y0, x1: k.x0 + k.w, y1: k.y0 + k.h }; } else { const t = tagPos(f); r = tagBounds(t.x, t.y, t.s); }
    const pad = 5 / cam.z;
    g.save(); g.setLineDash([10 / cam.z, 7 / cam.z]); g.lineDashOffset = -tNow / 30 / cam.z; g.lineWidth = 3 / cam.z; g.strokeStyle = 'rgba(245,197,24,.95)';
    g.strokeRect(r.x0 - pad, r.y0 - pad, r.x1 - r.x0 + pad * 2, r.y1 - r.y0 + pad * 2); g.restore();
  });
  // strategic map: section icons ride on the island ring, over the tags so they always read
  drawCarrierPlanes();
  if (fx.moving) fx.moving.list.forEach((m) => {
    const u = view.units.find((x) => x.id === m.unit); if (!u) return;
    const t = Math.min(1, ease(fx.moving.t) * 0.98);
    let p;
    if (m.inland) { const a = vSec(m.from, m.fromSec), b = vSec(m.to, m.toSec); const s0 = ks > 0.5 ? SEC_S : tokenScale() * 0.6; p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: s0 }; }
    else if (m.embark || m.land) { const sh = shorePts(m.from, m.embark ? m.fromSec : m.toSec), a = m.embark ? sh.b : sh.a, b = m.embark ? sh.a : sh.b; p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: ks > 0.5 ? SEC_S : tokenScale() * 0.6 }; }
    else { const c = curvePt(curveFor(m.from, m.to, m.kind), t); p = { ...c, s: tokenScale() }; }
    if (strat()) drawToken({ kind: u.kind === 'fleet' ? 'fleet' : 'troops', side: u.side, x: p.x, y: p.y, r: TOK_PX / zRef(), count: 0, own: u.side });
    else drawTag(u, p.x, p.y, p.s);
  });
  if (fx.flight) drawFlight(fx.flight);
  if (fx.strike) drawStrike(fx.strike);
  fx.marks = fx.marks.filter((m) => tNow - m.t0 < 1500 / Math.max(1, speed / 3));
  fx.marks.forEach(drawMark);
  fx.flashes = fx.flashes.filter((f) => tNow - f.t0 < 700 / Math.max(1, speed / 3));
  fx.flashes.forEach(drawFlash);
  fx.pulses = fx.pulses.filter((p) => tNow - p.t0 < 900 / speed);
  fx.pulses.forEach(drawPulse);
  fx.pops = fx.pops.filter((p) => tNow - p.t0 < 1600 / speed);
  fx.pops.forEach(drawPop);
  // screen-space vignette
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
  g.fillStyle = vg; g.fillRect(0, 0, vw, vh);
  if (hintTarget) placeHint();
}
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const arrowVisible = (a) => a.side === 'blue' || seen.has(a.from) || seen.has(a.to);

function drawGrid() {
  const a = toWorld(0, 0), b = toWorld(vw, vh);
  g.lineWidth = 1 / cam.z;
  for (let step of [100, 500]) {
    g.strokeStyle = step === 100 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.07)';
    g.beginPath();
    for (let x = Math.max(0, Math.floor(a.x / step) * step); x <= Math.min(WW, b.x); x += step) { g.moveTo(x, Math.max(0, a.y)); g.lineTo(x, Math.min(WH, b.y)); }
    for (let y = Math.max(0, Math.floor(a.y / step) * step); y <= Math.min(WH, b.y); y += step) { g.moveTo(Math.max(0, a.x), y); g.lineTo(Math.min(WW, b.x), y); }
    g.stroke();
  }
}

function curveFor(fromId, toId, kind) {
  const a = vIsl(fromId), b = vIsl(toId);
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
  const off = kind === 'fleet' ? 26 : -26; // fleet and army arrows on the same lane sit side by side
  const p0 = { x: a.x + ux * R * 0.55 - uy * off, y: a.y + uy * R * 0.55 + ux * off };
  const p1 = { x: b.x - ux * R * 0.72 - uy * off, y: b.y - uy * R * 0.72 + ux * off };
  return arrowCurve(p0, p1, kind === 'fleet' ? -0.12 : 0.12);
}
function drawArrowBetween(fromId, toId, side, t, alpha, kind) {
  drawArrow(g, curveFor(fromId, toId, kind), side, ease(t), { width: (kind === 'fleet' ? 30 : 42) * tokenScale(), alpha });
}
// short push arrow between two sections of one island
function drawSecArrow(islId, fromSec, toSec, side, t, alpha) {
  const a = vSec(islId, fromSec), b = vSec(islId, toSec); if (!a || !b) return;
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
  const cv = arrowCurve({ x: a.x + ux * SEC_R * 0.7, y: a.y + uy * SEC_R * 0.7 }, { x: b.x - ux * SEC_R * 0.9, y: b.y - uy * SEC_R * 0.9 }, 0.1);
  drawArrow(g, cv, side, ease(t), { width: Math.max(14, 16 * Math.min(1.6, 0.9 / cam.z)), alpha });
}
// r7: shore arrows between a beach and the sea off it (embark: out to the ship, land: in from the ship)
function shorePts(islId, secId, ks = secK()) {
  const isl = vIsl(islId), x = vSec(islId, secId), p = secPos(isl, x, ks);
  const d = Math.hypot(p.x - isl.x, p.y - isl.y) || 1, ux = (p.x - isl.x) / d, uy = (p.y - isl.y) / d;
  const sea = R * (2.1 - 0.3 * ks) + 26 / cam.z;
  return { a: { x: isl.x + ux * sea, y: isl.y + uy * sea }, b: { x: p.x, y: p.y }, r: p.r, ux, uy };
}
function drawShoreArrow(islId, secId, side, t, alpha, out, seaPt = null) {
  if (!vSec(islId, secId)) return;
  const sh = shorePts(islId, secId), gap = sh.r * 1.15;
  if (seaPt) { const d = Math.hypot(seaPt.x - sh.b.x, seaPt.y - sh.b.y) || 1; sh.ux = (seaPt.x - sh.b.x) / d; sh.uy = (seaPt.y - sh.b.y) / d; sh.a = seaPt; } // r8e: to the fleet token itself
  const near = { x: sh.b.x + sh.ux * gap, y: sh.b.y + sh.uy * gap };
  const cv = out ? arrowCurve(near, sh.a, 0.15) : arrowCurve(sh.a, near, -0.15);
  drawArrow(g, cv, side, ease(t), { width: Math.max(14, 16 * Math.min(1.6, 0.9 / cam.z)), alpha });
  if (seaPt) return; // the fleet token marks the transport end
  // a small ship glyph out at sea marks the transport end
  const gl = Math.max(16, 15 / cam.z);
  g.save(); g.globalAlpha = Math.min(1, alpha + 0.2);
  g.fillStyle = 'rgba(12,15,20,.9)'; g.beginPath(); g.arc(sh.a.x, sh.a.y, gl * 0.75, 0, 7); g.fill();
  g.lineWidth = gl * 0.12; g.strokeStyle = SIDE_COL[side].fill; g.stroke();
  shipSide(g, sh.a.x, sh.a.y + gl * 0.08, gl * 1.05, '#e9edf1');
  g.restore();
}
// plane glyph on a dark disc in the side colour; nose points along ang (0 = up)
function planeMini(c, type, x, y, s, side, ang = 0, alpha = 1) {
  c.save(); c.globalAlpha = alpha; c.translate(x, y);
  c.fillStyle = 'rgba(12,15,20,.92)'; c.beginPath(); c.arc(0, 0, s * 0.62, 0, 7); c.fill();
  c.lineWidth = s * 0.09; c.strokeStyle = SIDE_COL[side].fill; c.stroke();
  c.rotate(ang); unitGlyph(c, type, 0, 0, s * 0.86, '#f2f5f8', 2.6);
  c.restore();
}
// r7b: a confirmed landing under a stronger enemy fleet keeps a red ring and a red half mark on its beach
function riskMark(q) {
  const r = q.r * 1.3 + 9 / cam.z;
  g.save(); g.lineWidth = 4 / cam.z; g.strokeStyle = '#ff5a4e'; g.setLineDash([8 / cam.z, 6 / cam.z]);
  g.beginPath(); g.arc(q.x, q.y, r, 0, 7); g.stroke(); g.setLineDash([]);
  const fs = 22 / cam.z, bx = q.x + r * 0.75, by = q.y - r * 0.75;
  g.fillStyle = '#7a1410'; g.beginPath(); g.arc(bx, by, fs * 0.62, 0, 7); g.fill(); g.lineWidth = 2 / cam.z; g.strokeStyle = '#ff8a7e'; g.stroke();
  g.fillStyle = '#fff'; g.font = `900 ${fs}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('\u00bd', bx, by + fs * 0.04);
  g.restore();
}
function drawStrikeLine(b, isl, type, i, alpha) {
  const d = Math.hypot(isl.x - b.x, isl.y - b.y) || 1, ux = (isl.x - b.x) / d, uy = (isl.y - b.y) / d;
  const end = { x: isl.x - ux * R * 0.45 + (i % 3 - 1) * 10, y: isl.y - uy * R * 0.45 };
  const cv = arrowCurve({ x: b.x, y: b.y }, end, 0.2);
  g.save(); g.globalAlpha = alpha; g.setLineDash([14, 12]); g.lineDashOffset = -tNow / 30; g.lineWidth = Math.max(4, 3 / cam.z); g.strokeStyle = 'rgba(245,197,24,.9)';
  g.beginPath(); for (let k = 0; k <= 24; k++) { const p = curvePt(cv, k / 24); k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } g.stroke(); g.restore();
  const t = Math.max(0.3, 0.8 - (i % 4) * 0.16), p = curvePt(cv, t), q = curvePt(cv, t + 0.04), gl = Math.max(26, 22 / cam.z);
  planeMini(g, type, p.x, p.y, gl, 'blue', Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2);
  g.save(); g.lineWidth = Math.max(4, 3 / cam.z); g.strokeStyle = 'rgba(245,197,24,.95)';
  const r = Math.max(22, 16 / cam.z); g.beginPath(); g.arc(isl.x, isl.y, r, 0, 7); g.moveTo(isl.x - r * 1.5, isl.y); g.lineTo(isl.x + r * 1.5, isl.y); g.moveTo(isl.x, isl.y - r * 1.5); g.lineTo(isl.x, isl.y + r * 1.5); g.stroke(); g.restore();
}
function drawMoveArrow(m, t, alpha) {
  if (m.embark || m.land) { drawShoreArrow(m.from, m.embark ? m.fromSec : m.toSec, m.side, t, alpha, !!m.embark); return; }
  if (m.inland) drawSecArrow(m.from, m.fromSec, m.toSec, m.side, t, alpha);
  else drawArrowBetween(m.from, m.to, m.side, t, alpha, m.kind);
}
function targetRing(x, y, r, a = 1) {
  g.save(); g.globalAlpha = a; g.setLineDash([10, 7]); g.lineDashOffset = -tNow / 30; g.lineWidth = 4; g.strokeStyle = 'rgba(245,197,24,.95)';
  g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); g.restore();
}

const ownCol = (o) => (o ? SIDE_COL[o].fill : '#8a8f96');
// r7: sections show at every zoom. On the strategic map each section is an icon marker on the island ring, at the angle
// where it really lies (spread apart and kept off the type badge on top); zooming in slides it to its real spot.
const ringCache = new Map();
function ringAngles(isl) {
  if (ringCache.has(isl.id)) return ringCache.get(isl.id);
  const list = isl.secs.map((x) => ({ id: x.id, a: Math.atan2(x.y - isl.y, x.x - isl.x) }));
  const keepOff = [{ a: -Math.PI / 2, w: 0.5 }, { a: Math.PI / 2, w: 0.5 }, { a: -Math.PI * 0.75, w: 0.26 }]; // type badge, name, flag
  const gap = Math.min(0.95, (Math.PI * 2 - 1.04) / list.length);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  for (let it = 0; it < 80; it++) {
    for (const p of list) {
      for (const k of keepOff) { const d = wrap(p.a - k.a); if (Math.abs(d) < k.w) p.a = wrap(k.a + Math.sign(d || 1) * k.w); }
      for (const q of list) { if (q === p) continue; const d = wrap(p.a - q.a); if (Math.abs(d) < gap) { const push = (gap - Math.abs(d)) / 2 * Math.sign(d || 1); p.a = wrap(p.a + push); q.a = wrap(q.a - push); } }
    }
  }
  const m = new Map(list.map((p) => [p.id, p.a]));
  ringCache.set(isl.id, m);
  return m;
}
const mapMarkR = () => Math.max(11, Math.min(15, R * cam.z * 0.25)) / cam.z; // screen 11-15 px on the map
function secPos(isl, x, ks = secK()) {
  // r8e: at map zoom a section sits in its zone circle (zoneLayout); zooming in slides it to its real spot
  const q = zoneLayout(isl).get(x.id), r0 = q.r, rx = q.x, ry = q.y;
  return { x: rx + (x.x - rx) * ks, y: ry + (x.y - ry) * ks, r: r0 + (SEC_R - r0) * ks };
}
function secAngles(isl) {
  // order sections around the centre so the owner ring reads like a pie of the island
  return isl.secs.map((x) => ({ x, a: Math.atan2(x.y - isl.y, x.x - isl.x) })).sort((p, q) => p.a - q.a);
}
function drawIsland(isl, ks) {
  const known = seen.has(isl.id), st = ks < 0.5, det = st && detailIsles().has(isl.id);
  // under fog the owner stays hidden: neutral ring, badge and no flag
  const own = known ? isl.owner : null;
  const ringCol = ownCol(own);
  g.save();
  if (!st) { g.fillStyle = `rgba(8,12,16,${0.22 * (1 - ks * 0.5)})`; g.beginPath(); g.arc(isl.x, isl.y, R, 0, Math.PI * 2); g.fill(); } // r8d: no island disc at map zoom
  if (!st || det) drawDecor(isl, ks);
  // segmented owner ring: one arc per section
  const segs = secAngles(isl), n = segs.length;
  g.globalAlpha = 0.9 * (1 - ks * 0.7);
  g.lineWidth = 9;
  if (ks > 0) segs.forEach((sg, i) => {
    const a0 = (sg.a + (segs[(i - 1 + n) % n].a + (i === 0 ? -Math.PI * 2 : 0))) / 2;
    const a1 = (sg.a + (segs[(i + 1) % n].a + (i === n - 1 ? Math.PI * 2 : 0))) / 2;
    g.strokeStyle = ownCol(known ? sg.x.owner : null); g.beginPath(); g.arc(isl.x, isl.y, R, a0 + 0.05, a1 - 0.05); g.stroke();
  });
  if (st) { /* r8d: no island ring at map zoom; each section gets its own circle (drawSecCircles, above the fog) */ }
  else {
    g.globalAlpha = 1 - ks * 0.6; g.lineWidth = 2.2; g.strokeStyle = 'rgba(255,255,255,.75)';
    g.beginPath(); g.arc(isl.x, isl.y, R - 6, 0, Math.PI * 2); g.stroke();
  }
  g.globalAlpha = 1;
  // reach highlight when a unit is selected
  if (sel && !busy) {
    const u = G.unit(S, sel);
    if (u && u.at !== isl.id && G.canOrder(S, u, isl.id) && !(fx.nogoT && tNow - fx.nogoT < 2200)) { // r8g3: after a refuse only the legal zones pulse
      g.setLineDash([18, 12]); g.lineDashOffset = -tNow / 30; g.lineWidth = 5; g.strokeStyle = 'rgba(245,197,24,.95)';
      g.beginPath(); g.arc(isl.x, isl.y, R + 12, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
  }
  // type badge at the top of the ring
  const lab = labelLayout().get(isl.id);
  const bw = lab ? toWorld((lab.badge.left + lab.badge.right) / 2, (lab.badge.top + lab.badge.bottom) / 2) : { x: isl.x, y: isl.y - R };
  const bx = bw.x, by = bw.y;
  if (!st) {
  g.fillStyle = '#12161c'; g.beginPath(); g.arc(bx, by, 21, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3; g.strokeStyle = ringCol; g.stroke();
  if (isl.type === 'home') star(g, bx, by, 13, '#f2c43a');
  else if (isl.type === 'supply') crateIcon(g, bx, by, 24, '#e8dcb8');
  else if (isl.type === 'air') planeTop(g, bx, by, 30, '#e6ebf0', -Math.PI / 2);
  else { g.fillStyle = '#c8cdd4'; g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill(); }
  if (own) drawFlag(g, own, isl.x - R * 0.72 - 16, isl.y - R * 0.72 - 11, 32, 21);
  }
  // strategic: hostile garrison as small forts (or '?') on the bottom of the ring (r8: folded into the island token)
  if (ks < 1 && !st) {
    g.globalAlpha = 1 - ks;
    const hostile = isl.secs.filter((x) => x.owner !== 'blue');
    const gar = hostile.reduce((s, x) => s + x.gar, 0);
    if (hostile.length && !known) qBadge(isl.x, isl.y + R - 4, 15);
    else for (let i = 0; i < Math.min(6, gar); i++) fort(isl.x - (Math.min(6, gar) - 1) * 9 + i * 18, isl.y + R - 2, hostile[0] ? hostile[0].owner : null);
    g.globalAlpha = 1;
  }
  if (ks >= 0.5) drawSections(isl, ks, known);
  let np = nameAnchor(isl);
  if (lab && lab.name.moved) { const w = toWorld((lab.name.left + lab.name.right) / 2, lab.name.top); np = { x: w.x, y: w.y, base: 'top' }; }
  g.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = np.base;
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(isl.name, np.x, np.y);
  g.fillStyle = 'rgba(240,242,236,.92)'; g.fillText(isl.name, np.x, np.y);
  g.restore();
}
// terrain read under each section (neutral colours only, so fog never leaks an owner): sand on beaches,
// palm canopies in jungle, a runway on airfields, piers at ports, peaks on ridges, tents at depots, sandbags at HQ
function drawDecor(isl, ks) {
  const a = 0.35 + 0.65 * ks;
  g.save(); g.globalAlpha = a; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const x of isl.secs) {
    const dx = x.x - isl.x, dy = x.y - isl.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, ang = Math.atan2(uy, ux);
    const r = G.rng(x.x * 7 + x.y);
    if (x.kind === 'beach') {
      g.fillStyle = 'rgba(168,156,120,.75)';
      g.beginPath(); g.arc(x.x, x.y, 54, ang - 0.9, ang + 0.9); g.arc(x.x, x.y, 34, ang + 0.75, ang - 0.75, true); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(225,235,240,.55)'; g.lineWidth = 2.5;
      for (const rr of [60, 68]) { g.beginPath(); g.arc(x.x, x.y, rr, ang - 0.7, ang + 0.7); g.stroke(); }
    } else if (x.kind === 'jungle') {
      for (let i = 0; i < 9; i++) {
        const t = r() * 7, rr = 32 + r() * 26, px = x.x + Math.cos(t) * rr, py = x.y + Math.sin(t) * rr, s = 7 + r() * 4;
        g.fillStyle = 'rgba(28,58,34,.9)'; g.beginPath(); g.arc(px, py, s, 0, 7); g.fill();
        g.strokeStyle = 'rgba(92,140,84,.9)'; g.lineWidth = 1.6; g.beginPath();
        for (let k = 0; k < 5; k++) { const q = k * 1.26 + t; g.moveTo(px, py); g.lineTo(px + Math.cos(q) * s, py + Math.sin(q) * s); }
        g.stroke();
      }
    } else if (x.kind === 'air') {
      g.save(); g.translate(x.x, x.y); g.rotate(isl.rot);
      g.fillStyle = 'rgba(58,62,66,.92)'; g.fillRect(-78, -10, 156, 20);
      g.strokeStyle = 'rgba(235,238,240,.8)'; g.lineWidth = 2; g.setLineDash([9, 8]); g.beginPath(); g.moveTo(-70, 0); g.lineTo(70, 0); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(120,124,128,.9)'; g.fillRect(-40, 16, 22, 12); g.fillRect(-12, 16, 22, 12);
      g.restore();
    } else if (x.kind === 'port') {
      g.strokeStyle = 'rgba(150,140,118,.95)'; g.lineWidth = 6;
      for (const o of [-0.45, 0, 0.45]) { const q = ang + o; g.beginPath(); g.moveTo(x.x + Math.cos(q) * 30, x.y + Math.sin(q) * 30); g.lineTo(x.x + Math.cos(q) * 62, x.y + Math.sin(q) * 62); g.stroke(); }
    } else if (x.kind === 'ridge') {
      for (let i = 0; i < 4; i++) {
        const t = ang + Math.PI / 2 + (i - 1.5) * 0.7, px = x.x + Math.cos(t) * 44, py = x.y + Math.sin(t) * 44, s = 13 + r() * 6;
        g.fillStyle = 'rgba(132,126,112,.9)'; g.beginPath(); g.moveTo(px - s, py + s * 0.6); g.lineTo(px, py - s * 0.8); g.lineTo(px + s, py + s * 0.6); g.closePath(); g.fill();
        g.fillStyle = 'rgba(30,30,28,.45)'; g.beginPath(); g.moveTo(px, py - s * 0.8); g.lineTo(px + s, py + s * 0.6); g.lineTo(px + s * 0.2, py + s * 0.6); g.closePath(); g.fill();
      }
    } else if (x.kind === 'depot') {
      for (let i = 0; i < 4; i++) {
        const t = ang + Math.PI + (i - 1.5) * 0.55, px = x.x + Math.cos(t) * 40, py = x.y + Math.sin(t) * 40;
        g.fillStyle = 'rgba(150,138,102,.95)'; g.beginPath(); g.moveTo(px - 9, py + 6); g.lineTo(px, py - 8); g.lineTo(px + 9, py + 6); g.closePath(); g.fill();
      }
    } else if (x.kind === 'hq') {
      g.strokeStyle = 'rgba(150,140,112,.9)'; g.lineWidth = 7; g.setLineDash([8, 5]);
      g.beginPath(); g.arc(x.x, x.y, 40, 0, 7); g.stroke(); g.setLineDash([]);
    }
  }
  g.restore();
}
function fort(x, y, owner) {
  g.fillStyle = 'rgba(20,22,26,.9)'; g.fillRect(x - 7, y - 6, 14, 12);
  g.fillStyle = owner ? SIDE_COL[owner].light : '#d0d4da'; g.fillRect(x - 5, y - 4, 10, 8);
  g.fillRect(x - 5, y - 7, 3, 3); g.fillRect(x + 2, y - 7, 3, 3);
}
function qBadge(x, y, r) {
  g.save(); g.fillStyle = 'rgba(14,16,20,.92)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
  g.fillStyle = '#f0f2f4'; g.font = `900 ${Math.round(r * 1.5)}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('?', x, y + 1); g.restore();
}
function drawSections(isl, ks, known, skipBases = false, only = null) {
  const cur = sel && !busy ? G.unit(S, sel) : null;
  g.save();
  // links (island view only)
  if (ks > 0.5) {
    g.globalAlpha = Math.min(1, (ks - 0.5) * 2);
    g.setLineDash([6, 6]); g.lineWidth = 3; g.strokeStyle = 'rgba(235,238,240,.55)';
    for (const x of isl.secs) for (const l of x.links) if (l > x.id) { const y = isl.secs.find((q) => q.id === l); const a = secPos(isl, x, ks), b = secPos(isl, y, ks); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    g.setLineDash([]); g.globalAlpha = 1;
  }
  for (const x of isl.secs) {
    if (skipBases && (x.kind === 'air' || x.kind === 'port')) continue; // r8: bases have their own tokens
    if (only && !only.has(x.id)) continue;
    const p = secPos(isl, x, ks), r = p.r;
    g.fillStyle = 'rgba(12,15,20,.92)'; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
    g.lineWidth = r * 0.21; g.strokeStyle = known && x.owner ? ownCol(x.owner) : 'rgba(180,190,200,.6)'; g.stroke();
    if (ks > 0.5) { g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(p.x, p.y, r - 4, 0, 7); g.stroke(); }
    secIcon(g, x.kind, p.x, p.y, r * 1.15, '#e6ebf0');
    if (x.kind === 'air' && (x.owner === 'blue' || known)) drawAirfieldPlanes(isl, x, p);
    // garrison under the marker (island view; the map shows forts on the ring bottom)
    if (ks > 0.5) {
      if (x.owner !== 'blue' && x.gar > 0) {
        if (!known) qBadge(p.x, p.y + r + 6, 10);
        else for (let i = 0; i < x.gar; i++) fort(p.x - (x.gar - 1) * 9 + i * 18, p.y + r + 6, x.owner);
      } else if (x.owner !== 'blue' && !known) qBadge(p.x, p.y + r + 6, 10);
    }
    // where the selected army can push inland / land from its ship
    if (cur && cur.kind === 'army' && cur.at === isl.id && !cur.aboard && G.canSecOrder(S, cur, x.id) && x.id !== cur.sec) targetRing(p.x, p.y, r + Math.max(8, 4 / cam.z), 1);
    if (cur && cur.kind === 'army' && cur.aboard && G.landIsland(S, cur) === isl.id && x.kind === 'beach') targetRing(p.x, p.y, r * 1.3 + 3 / cam.z, 1);
  }
  g.restore();
}
// planes parked at an airfield sit in a short row just outside its marker
// r7b: on the map a parked plane icon is a fixed MAP_PLANE px on screen (glyph ~22 px) so the four types read at 390
const MAP_PLANE = 26;
function airfieldPlanePts(isl, x, p) {
  const list = S.planes.filter((q) => q.base.isl === isl.id && q.base.sec === x.id); if (!list.length) return [];
  const d = Math.hypot(p.x - isl.x, p.y - isl.y) || 1, ux = (p.x - isl.x) / d, uy = (p.y - isl.y) / d;
  if (secK() > 0.5) { // island view: a row under the marker (below any forts)
    const gl = Math.max(15, 15 / cam.z);
    const y = p.y + p.r + gl * 0.8 + (x.owner !== 'blue' && x.gar > 0 ? 22 : 0);
    return list.map((q, i) => ({ q, x: p.x + (i - (list.length - 1) / 2) * gl * 1.3, y, gl }));
  }
  const gl = MAP_PLANE / cam.z, cx = p.x + ux * (p.r + gl * 0.7), cy = p.y + uy * (p.r + gl * 0.7);
  return list.map((q, i) => { const o = (i - (list.length - 1) / 2) * gl * 1.3; return { q, x: cx - uy * o, y: cy + ux * o, gl }; });
}
function drawAirfieldPlanes(isl, x, p) {
  for (const t of airfieldPlanePts(isl, x, p)) mapPlane(t.q, t.x, t.y, t.gl);
}
// draw one plane icon on the map and remember its on-screen size (the e2e reads these)
function mapPlane(q, x, y, gl) {
  planeMini(g, q.type, x, y, gl, q.side, 0, q.used ? 0.45 : 1);
  const sp = toScreen(x, y);
  planeMarks.push({ id: q.id, type: q.type, side: q.side, x: sp.x, y: sp.y, glyph: gl * 0.86 * cam.z, disc: gl * 1.24 * cam.z });
}
function drawFog(isl, a) {
  if (!fogSprite) makeFog();
  g.save(); g.globalAlpha = a;
  const s = R * 3.6;
  const dk = g.createRadialGradient(isl.x, isl.y, R * 0.3, isl.x, isl.y, R * 1.9);
  dk.addColorStop(0, 'rgba(6,9,14,.55)'); dk.addColorStop(0.55, 'rgba(6,9,14,.45)'); dk.addColorStop(1, 'rgba(6,9,14,0)');
  g.globalAlpha = a; g.fillStyle = dk; g.beginPath(); g.arc(isl.x, isl.y, R * 1.9, 0, 7); g.fill();
  // faint map hatching marks unknown ground
  g.save(); g.beginPath(); g.arc(isl.x, isl.y, R - 8, 0, 7); g.clip();
  g.strokeStyle = 'rgba(200,210,225,.10)'; g.lineWidth = 2; g.beginPath();
  for (let d = -R; d < R; d += 14) { g.moveTo(isl.x + d - R, isl.y + R); g.lineTo(isl.x + d + R, isl.y - R); }
  g.stroke(); g.restore();
  g.drawImage(fogSprite, isl.x - s / 2, isl.y - s / 2, s, s);
  g.restore();
}
// recon reveal: radar sweep + expanding scan ring as the fog burns off
function drawReveal(isl, t0) {
  if (!isl) return;
  const k = Math.min(1, (tNow - t0) / (1100 / Math.max(1, speed / 3)));
  g.save();
  g.globalAlpha = 1 - k;
  g.lineWidth = 8 * (1 - k) + 2; g.strokeStyle = '#e8f4ff';
  g.beginPath(); g.arc(isl.x, isl.y, R * (0.4 + k * 1.1), 0, 7); g.stroke();
  const a = k * Math.PI * 3;
  const gr = g.createRadialGradient(isl.x, isl.y, 0, isl.x, isl.y, R * 1.2);
  gr.addColorStop(0, 'rgba(200,235,255,.35)'); gr.addColorStop(1, 'rgba(200,235,255,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(isl.x, isl.y); g.arc(isl.x, isl.y, R * 1.2, a - 0.7, a); g.closePath(); g.fill();
  g.restore();
}
function reconTargetsFor(pid) {
  if (!pid) return G.reconTargets(S, 'blue');
  return S.islands.filter((i) => G.canRecon(S, pid, i.id)).map((i) => i.id); // r8g3: the islands this plane may be ordered to scout
}
function drawStrikeTargets() {
  const p = G.plane(S, planeSel), b = p && G.planeBase(S, p); if (!b) return;
  g.save(); g.setLineDash([10, 14]); g.lineWidth = 3 / Math.max(0.6, cam.z); g.strokeStyle = 'rgba(245,197,24,.4)';
  g.beginPath(); g.arc(b.x, b.y, G.AIR_RANGE, 0, 7); g.stroke(); g.restore();
  for (const id of G.strikeTargets(S, p.id)) {
    const isl = vIsl(id), k = 0.8 + 0.2 * Math.sin(tNow / 220);
    g.save(); g.globalAlpha = k; g.setLineDash([14, 10]); g.lineDashOffset = tNow / 25; g.lineWidth = 6; g.strokeStyle = '#f5c518';
    g.beginPath(); g.arc(isl.x, isl.y, R + 16, 0, 7); g.stroke(); g.restore();
  }
  g.save(); g.strokeStyle = 'rgba(245,197,24,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(b.x, b.y, 34 + 6 * Math.sin(tNow / 200), 0, 7); g.stroke(); g.restore();
}
function drawReconTargets() {
  const tg = reconTargetsFor(planeSel);
  for (const id of tg) {
    const isl = vIsl(id);
    const p = 0.6 + 0.4 * Math.sin(tNow / 220);
    g.save(); g.globalAlpha = p; g.setLineDash([14, 10]); g.lineDashOffset = tNow / 25; g.lineWidth = 6; g.strokeStyle = '#e8f4ff';
    g.beginPath(); g.arc(isl.x, isl.y, R + 16, 0, 7); g.stroke(); g.setLineDash([]);
    g.lineWidth = 4; g.beginPath(); g.moveTo(isl.x - 26, isl.y); g.lineTo(isl.x + 26, isl.y); g.moveTo(isl.x, isl.y - 26); g.lineTo(isl.x, isl.y + 26); g.stroke();
    g.beginPath(); g.arc(isl.x, isl.y, 16, 0, 7); g.stroke();
    g.restore();
  }
  for (const s of G.reconSources(S, 'blue').filter((q) => !planeSel || q.plane === planeSel)) { g.save(); g.strokeStyle = 'rgba(232,244,255,.8)'; g.lineWidth = 4; g.beginPath(); g.arc(s.x, s.y, 40 + 6 * Math.sin(tNow / 200), 0, 7); g.stroke(); g.restore(); }
}
function drawFlight(f) {
  const k = Math.min(1, (tNow - f.t0) / f.dur);
  const cv = arrowCurve(f.a, f.b, 0.18);
  g.save();
  g.setLineDash([12, 12]); g.lineWidth = 4; g.strokeStyle = 'rgba(235,242,250,.55)';
  g.beginPath(); for (let i = 0; i <= 30; i++) { const p = curvePt(cv, (i / 30) * k); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } g.stroke(); g.setLineDash([]);
  const p = curvePt(cv, k), q = curvePt(cv, Math.min(1, k + 0.02));
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 10;
  planeMini(g, 'recon', p.x, p.y, Math.max(40, 34 / cam.z), 'blue', Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2);
  g.restore();
}
// r8g3: a queued recon flight (flies at End Week): a dashed white flight line from the base, the recon plane on it, an eye-ring on the island
function drawReconOrder(b, isl) {
  const cv = arrowCurve({ x: b.x, y: b.y }, { x: isl.x, y: isl.y }, 0.18), a = 0.75 + 0.2 * Math.sin(tNow / 260);
  g.save(); g.globalAlpha = a; g.lineCap = 'round';
  g.setLineDash([12 / cam.z, 9 / cam.z]); g.lineDashOffset = -tNow / 18 / cam.z; g.lineWidth = 9 / cam.z; g.strokeStyle = 'rgba(8,10,14,.65)';
  const path = () => { g.beginPath(); for (let i = 0; i <= 40; i++) { const p = curvePt(cv, i / 40); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } };
  path(); g.stroke(); g.lineWidth = 5.5 / cam.z; g.strokeStyle = 'rgba(232,244,255,.98)'; path(); g.stroke();
  g.setLineDash([3 / cam.z, 10 / cam.z]); g.lineWidth = 5 / cam.z; g.beginPath(); g.arc(isl.x, isl.y, R + 14 / cam.z, 0, 7); g.stroke(); g.setLineDash([]);
  const p = curvePt(cv, 0.55), q = curvePt(cv, 0.57);
  g.globalAlpha = 1; g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 8;
  planeMini(g, 'recon', p.x, p.y, Math.max(34, 30 / cam.z), 'blue', Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2);
  g.restore();
}
function drawStrike(st) {
  const k = Math.min(1, (tNow - st.t0) / st.dur), e = st.e, to = vIsl(e.to);
  const gl = Math.max(28, 26 / cam.z);
  const n = e.flights.length + (e.escorts || []).length;
  const fly = (from0, i, type, side, stopAt) => {
    const d = Math.hypot(to.x - from0.x, to.y - from0.y) || 1, px = -(to.y - from0.y) / d, py = (to.x - from0.x) / d, o = (i - (n - 1) / 2) * gl * 1.1;
    const from = { x: from0.x + px * o, y: from0.y + py * o }, end = { x: to.x + px * o * 0.8, y: to.y - R * 0.1 + py * o * 0.8 };
    const cv = arrowCurve(from, end, 0.14);
    const kk = Math.min(k, stopAt);
    g.save(); g.setLineDash([10, 10]); g.lineWidth = Math.max(3, 2 / cam.z); g.strokeStyle = 'rgba(235,242,250,.45)';
    g.beginPath(); for (let j = 0; j <= 24; j++) { const p = curvePt(cv, (j / 24) * kk); j ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } g.stroke(); g.restore();
    const p = curvePt(cv, kk), q = curvePt(cv, Math.min(1, kk + 0.02));
    if (k < stopAt || stopAt >= 1) planeMini(g, type, p.x, p.y, gl, side, Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2);
    else { const a = Math.max(0, 1 - (k - stopAt) * 4); g.save(); g.globalAlpha = a; g.fillStyle = '#ff8a2a'; g.beginPath(); g.arc(p.x, p.y, gl * (0.5 + (k - stopAt) * 2), 0, 7); g.fill(); g.restore(); }
    return p;
  };
  e.flights.forEach((f, i) => fly(f.from, i, f.type, e.side, f.lost ? 0.7 : 1));
  (e.escorts || []).forEach((f, i) => fly(f.from, e.flights.length + i, 'fighter', e.side, 1));
  // interceptors climb out of the target to meet the strike
  const foe = G.other(e.side);
  for (let i = 0; i < Math.min(3, e.interceptors || 0); i++) {
    const kk = Math.min(1, k / 0.7), ang = -Math.PI / 2 + (i - 1) * 0.7;
    const x = to.x + Math.cos(ang) * R * 1.6 * kk, y = to.y + Math.sin(ang) * R * 1.6 * kk;
    planeMini(g, 'fighter', x, y, gl * 0.9, foe, ang + Math.PI / 2);
  }
}
function drawMark(m) {
  const k = Math.min(1, (tNow - m.t0) / (1500 / Math.max(1, speed / 3)));
  const s = Math.max(34, 30 / cam.z), x = m.x, y = m.y - k * s;
  g.save(); g.globalAlpha = 1 - k * k;
  g.fillStyle = 'rgba(14,18,22,.92)'; g.fillRect(x - s / 2, y - s / 2, s, s);
  g.lineWidth = s * 0.07; g.strokeStyle = SIDE_COL[m.side].fill; g.strokeRect(x - s / 2, y - s / 2, s, s);
  if (m.type === 'fort') fort(x, y, m.side); else unitGlyph(g, m.type, x, y, s * 0.75, '#f2f5f8', 2.4);
  g.strokeStyle = '#ff5a4a'; g.lineWidth = s * 0.09; g.beginPath(); g.moveTo(x - s * 0.38, y - s * 0.38); g.lineTo(x + s * 0.38, y + s * 0.38); g.moveTo(x + s * 0.38, y - s * 0.38); g.lineTo(x - s * 0.38, y + s * 0.38); g.stroke();
  g.restore();
}
function drawFlash(f) {
  const k = Math.min(1, (tNow - f.t0) / (700 / Math.max(1, speed / 3)));
  g.save(); g.globalAlpha = 1 - k; g.fillStyle = '#ff8a2a';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(f.x + Math.cos(i * 2.1 + f.x) * 18, f.y + Math.sin(i * 2.1) * 14, 10 + k * 18, 0, 7); g.fill(); }
  g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(f.x, f.y, 8 * (1 - k) + 2, 0, 7); g.fill(); g.restore();
}

function drawRange() {
  const u = G.unit(S, sel); if (!u) return;
  const isl = vIsl(u.at);
  g.save(); g.setLineDash([10, 14]); g.lineWidth = 3 / Math.max(0.6, cam.z); g.strokeStyle = 'rgba(245,197,24,.35)';
  g.beginPath(); g.arc(isl.x, isl.y, G.RANGE[u.kind], 0, Math.PI * 2); g.stroke(); g.restore();
}

function drawTag(u, cx, cy, s = 1, alpha = 1, c = g) {
  c.save(); c.translate(cx, cy); c.scale(s, s); c.globalAlpha = alpha;
  const x0 = -TAG_W / 2 - 7, y0 = -TAG_H / 2;
  const selected = u.id === sel;
  c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  c.fillStyle = 'rgba(16,18,20,.9)'; c.fillRect(x0 + 6, y0, TAG_W, TAG_H);
  c.shadowColor = 'transparent';
  c.lineWidth = selected ? 3 : 1.2; c.strokeStyle = selected ? '#f5c518' : 'rgba(255,255,255,.35)';
  c.strokeRect(x0 + 6, y0, TAG_W, TAG_H);
  c.fillStyle = SIDE_COL[u.side].fill; c.fillRect(x0 + 6, y0 + TAG_H - 3, TAG_W, 3);
  drawFlag(c, u.side, x0 + 26, y0 + 6, 20, 13);
  if (u.kind === 'fleet') shipSide(c, x0 + 60, y0 + 13, 22, '#e9edf1');
  else armySymbol(c, x0 + 60, y0 + 12, 18, '#e9edf1');
  if (u.unknown) {
    c.fillStyle = '#fff'; c.font = '900 22px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', x0 + 83, y0 + 14);
    c.fillStyle = '#1b1f26'; c.beginPath(); c.arc(x0 + 8, 0, PR, 0, 7); c.fill(); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.5)'; c.stroke();
    c.fillStyle = '#d8dde2'; c.fillText('?', x0 + 8, 1);
    c.restore(); return;
  }
  // strength pips (2 rows of 3)
  for (let i = 0; i < u.str; i++) {
    const px = x0 + 77 + (i % 3) * 6, py = y0 + 8 + Math.floor(i / 3) * 7;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, 2.3, 0, 7); c.fill();
  }
  const pic = portrait(u.side, u.cmd, 128);
  c.drawImage(pic, x0 + 6 - PR + 2, -PR, PR * 2, PR * 2);
  if (selected) { c.lineWidth = 3; c.strokeStyle = '#f5c518'; c.beginPath(); c.arc(x0 + 8, 0, PR + 1.5, 0, 7); c.stroke(); }
  drawUnitExtras(u, x0 + 6 + TAG_W, y0, TAG_H, c, null, c === g);
  c.restore();
  // r7b: a carrier's planes sit right of its tag at MAP_PLANE px, drawn after the ring markers so nothing covers them
  if (c === g && u.kind === 'fleet' && S) {
    const gl = MAP_PLANE / cam.z, pl = S.planes.filter((q) => q.base.fleet === u.id);
    const xr = cx + (x0 + 6 + TAG_W) * s + 4 / cam.z + carrierNudge(u.at, cx + (x0 + 6 + TAG_W) * s + 4 / cam.z, cy, gl, pl.length);
    pl.forEach((q, i) => carrierQ.push({ q, x: xr + gl * (0.62 + i * 1.3), y: cy, gl, alpha }));
  }
}
// slide a carrier's plane row right until it clears the island's section markers (map zoom only)
function carrierNudge(islId, x0, y, gl, n) {
  if (!n || secK() > 0.5 || !view) return 0;
  const isl = vIsl(islId); if (!isl) return 0;
  const marks = isl.secs.map((x) => secPos(isl, x));
  for (let d = 0; d < 80 / cam.z; d += 2 / cam.z) {
    let hit = false;
    for (let i = 0; i < n && !hit; i++) { const px = x0 + d + gl * (0.62 + i * 1.3); hit = marks.some((m) => Math.hypot(m.x - px, m.y - y) < m.r + gl * 0.62 + 2 / cam.z); }
    if (!hit) return d;
  }
  return 0;
}
function drawCarrierPlanes() { for (const t of carrierQ) { g.save(); g.globalAlpha = t.alpha; mapPlane(t.q, t.x, t.y, t.gl); g.restore(); } carrierQ = []; }
// r7: an army aboard shows a ship badge; a fleet shows the troops it carries and the planes on its carrier
function drawUnitExtras(u, xr, y0, h, c = g, below = null, skipPlanes = false) {
  const badge = (fn) => { c.fillStyle = '#0d1116'; c.beginPath(); c.arc(xr, y0 + 1, 9, 0, 7); c.fill(); c.lineWidth = 1.6; c.strokeStyle = '#f5c518'; c.stroke(); fn(xr, y0 + 1); };
  if (u.kind === 'army' && u.aboard) badge((x, y) => shipSide(c, x, y + 2, 14, '#fff'));
  if (u.kind !== 'fleet' || !S) return;
  const units = view ? view.units : S.units;
  const n = units.filter((a) => a.aboard === u.id).length;
  if (n) badge((x, y) => { armySymbol(c, x, y, 10, '#fff'); });
  const pl = skipPlanes ? [] : S.planes.filter((q) => q.base.fleet === u.id);
  pl.forEach((q, i) => (below ? planeMini(c, q.type, below.x + 11 + i * 24, below.y + 13, 22, q.side, 0, q.used ? 0.45 : 1) : planeMini(c, q.type, xr + 16 + i * 24, y0 + h / 2, 22, q.side, 0, q.used ? 0.45 : 1)));
}

function drawPop(p) {
  const k = Math.max(0, Math.min(1, (tNow - p.t0) / (1600 / speed)));
  const isl = vIsl(p.island);
  g.save(); g.globalAlpha = 1 - k * k;
  const x = isl.x + 60, y = isl.y - R - 30 - k * 50, w = 92 + (p.ships ? 50 : 0) + (p.planes ? 54 : 0);
  g.fillStyle = 'rgba(14,18,22,.92)'; g.fillRect(x - 46, y - 20, w, 40);
  g.strokeStyle = SIDE_COL[p.side].fill; g.lineWidth = 3; g.strokeRect(x - 46, y - 20, w, 40);
  g.fillStyle = '#fff'; g.font = '900 28px "Barlow Condensed", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(`+${p.troops}`, x - 38, y + 1);
  armySymbol(g, x + 22, y, 22, '#fff');
  if (p.ships) { g.fillText('+1', x + 46, y + 1); shipSide(g, x + 82, y + 2, 22, '#fff'); }
  if (p.planes) { const px = x + 46 + (p.ships ? 50 : 0); g.fillText('+1', px, y + 1); unitGlyph(g, p.planeType, px + 36, y, 26, '#fff', 2.4); }
  g.restore();
}
function drawPulse(p) {
  const k = Math.max(0, (tNow - p.t0) / (900 / speed));
  g.save(); g.globalAlpha = 1 - k; g.lineWidth = 14 * (1 - k) + 2; g.strokeStyle = SIDE_COL[p.side].fill;
  g.beginPath(); g.arc(p.x, p.y, p.r + k * p.r * 0.7, 0, 7); g.stroke(); g.restore();
}

// ---------- HUD ----------
function setBanner(week, flip) {
  $('wkn').textContent = week;
  const b = $('banner');
  if (flip) { b.classList.remove('flip'); void b.offsetWidth; b.classList.add('flip'); }
}
// which islands each side holds; Red islands Blue has not scouted stay a '?' (fog keeps the owner hidden)
function holdings(side) {
  return S.islands.filter((i) => i.owner === side).map((i) => ({ id: i.id, name: i.name, type: i.type, known: side === 'blue' || seen.has(i.id) }));
}
const TYPE_ICON = { home: 'star', supply: 'crate', air: 'plane', plain: 'flag' };
function renderHoldings() {
  for (const side of ['blue', 'red']) {
    const list = holdings(side), chip = $(side === 'blue' ? 'c-blue' : 'c-red');
    chip.querySelector('b').textContent = list.length;
    const ic = list.map((i) => (i.known ? icon(TYPE_ICON[i.type], { size: 14 }) : '<i class="q">?</i>'));
    chip.querySelector('.hold-ico').innerHTML = ic.length > 6 ? ic.slice(0, 5).join('') + `<i class="q">+${ic.length - 5}</i>` : ic.join('');
    chip.setAttribute('aria-label', `${side} islands: ${list.map((i) => (i.known ? i.name : '?')).join(' ')}`);
  }
  const h = $('hold');
  if (!h.hidden) {
    h.innerHTML = ['blue', 'red'].map((side) => `<div class="hold-col ${side}"><canvas data-side="${side}" width="36" height="24"></canvas>${holdings(side)
      .map((i) => (i.known ? `<div class="hold-row">${icon(TYPE_ICON[i.type], { size: 18 })}<span>${i.name}</span></div>` : '<div class="hold-row q"><i class="q">?</i></div>')).join('')}</div>`).join('');
    h.querySelectorAll('canvas').forEach((c) => drawFlag(c.getContext('2d'), c.dataset.side, 1, 1, 34, 22));
  }
}
function toggleHoldings(force) {
  const h = $('hold');
  h.hidden = force === undefined ? !h.hidden : !force;
  if (!h.hidden) {
    renderHoldings();
    // pulse every island Blue can see change hands: own ones and the scouted Red ones
    for (const side of ['blue', 'red']) for (const i of holdings(side)) if (i.known) { const isl = G.island(S, i.id); fx.pulses.push({ x: isl.x, y: isl.y, r: R, side, t0: performance.now() }); }
  }
}
function updateHud() {
  if (!strip || busy) foeSel = null;
  renderHoldings();
  const ids = new Set([...Object.keys(S.orders), ...Object.keys(S.secOrders), ...Object.keys(S.embark), ...Object.keys(S.landOrd)]);
  const pids = new Set([...Object.keys(S.strikes), ...Object.keys(S.flyOrd || {}), ...Object.keys(S.landPl || {}), ...Object.keys(S.reconOrd || {})]); // r8g3: a queued recon counts
  const n = [...ids].filter((id) => G.unit(S, id)?.side === 'blue').length + [...pids].filter((id) => G.plane(S, id)?.side === 'blue').length;
  $('ordn').hidden = !n; $('ordn').textContent = n;
  $('b-end').disabled = busy || !!S.over;
  // r8g ask 1: no bottom plane button. Planes are units in their zone (airfield / air over a zone) or fleet (carrier) strip.
  const canAir = !busy && !S.over && S.planes.some((p) => p.side === 'blue');
  if (!canAir) { airOpen = false; planeSel = null; reconMode = false; }
  if (planeSel && !G.plane(S, planeSel)) { planeSel = null; reconMode = false; }
  renderAir();
  renderStrip();
  const p = $('sel');
  const u = sel && G.unit(S, sel);
  if (!u || busy || strip) { p.hidden = true; $('app').classList.remove('island-view', 'sel-open'); measurePanel(); return; }
  const wasHidden = p.hidden;
  p.hidden = false;
  $('app').classList.add('sel-open');
  $('app').classList.toggle('island-view', secK() > 0.5);
  const pg = $('sel-portrait').getContext('2d'); pg.clearRect(0, 0, 112, 112); pg.drawImage(portrait(u.side, u.cmd, 224), 0, 0, 112, 112);
  const fg = $('sel-flag').getContext('2d'); drawFlag(fg, u.side, 1, 1, 40, 26);
  const kg = $('sel-kind').getContext('2d'); kg.clearRect(0, 0, 44, 30);
  if (u.kind === 'fleet') shipSide(kg, 22, 17, 38, '#e9edf1'); else armySymbol(kg, 22, 15, 30, '#e9edf1');
  renderOob(u);
  $('sel-x').hidden = !S.orders[u.id] && !S.secOrders[u.id];
  $('sel-z').innerHTML = icon(secK() > 0.5 ? 'fit' : 'zoom', { size: 24 });
  measurePanel();
  if (wasHidden || p.dataset.unit !== u.id) { p.dataset.unit = u.id; keepClear(u.at); }
}
// r7 air tray: one row per base (airfield or carrier), a chip per plane. Tap a chip, then a target island.
function renderAir() {
  const box = $('air');
  if (!airOpen || busy || S.over) { box.hidden = true; return; }
  const groups = new Map();
  for (const p of S.planes.filter((q) => q.side === 'blue')) {
    const b = G.planeBase(S, p); if (!b) continue;
    const k = b.fleet ? `f:${b.fleet}` : `a:${b.isl}`;
    if (!groups.has(k)) groups.set(k, { b, list: [] });
    groups.get(k).list.push(p);
  }
  const key = JSON.stringify([[...groups.entries()].map(([k, v]) => [k, v.list.map((p) => [p.id, p.used, S.strikes[p.id] || ''])]), planeSel, foeSel]);
  box.hidden = false;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.innerHTML = [...groups.values()].map(({ b, list }) => `<div class="air-row"><canvas class="air-base" data-k="${b.fleet ? 'cv' : 'air'}" data-isl="${b.isl}" width="64" height="64"></canvas>${list.map((p) => {
    const st = p.used ? 'used' : S.strikes[p.id] ? 'set' : '';
    return `<button class="pl ${st}${p.id === planeSel ? ' on' : ''}${matchCls(p.type)}" data-p="${p.id}" data-t="${p.type}" aria-label="${UNIT_NAMES[p.type]}" title="${UNIT_NAMES[p.type]}">${unitIcon(p.type, 30)}${st === 'set' ? `<i class="tg">${icon('crosshair', { size: 14 })}</i>` : ''}</button>`;
  }).join('')}</div>`).join('');
  box.querySelectorAll('canvas.air-base').forEach((c) => {
    const q = c.getContext('2d'); q.scale(2, 2);
    q.fillStyle = '#12161c'; q.beginPath(); q.arc(16, 16, 14, 0, 7); q.fill(); q.lineWidth = 2.5; q.strokeStyle = SIDE_COL.blue.fill; q.stroke();
    if (c.dataset.k === 'cv') unitGlyph(q, 'cv', 16, 16, 22, '#e6ebf0', 2.2); else secIcon(q, 'air', 16, 16, 21, '#e6ebf0');
  });
}
// r8g: a plane card. On its base: pick it, then tap a zone = strike it (a bomber hits that one zone, fogged or not;
// a torpedo plane the island's sea; a fighter escorts) or, where there is nothing to strike, fly up over it (CAP over your
// airfield / carrier, or one turn in the air anywhere in range). In the air: pick it, then tap your airfield zone or a
// carrier = land there. Tapping the card again clears its order. Recon: tap a fogged island = scout every zone on it.
function pickPlane(pid) {
  const p = G.plane(S, pid); if (!p || busy) return;
  if (S.strikes[pid] || (S.flyOrd && S.flyOrd[pid]) || (S.landPl && S.landPl[pid]) || (S.reconOrd && S.reconOrd[pid])) { G.issueStrike(S, pid, null); G.issueFly(S, pid, null); G.issuePlaneLand(S, pid, null); G.issueRecon(S, pid, null); planeSel = null; reconMode = false; sfx.pew(); updateHud(); return; }
  if (planeSel === pid) { planeSel = null; reconMode = false; updateHud(); return; }
  if (p.air) {
    if (!G.landTargets(S, pid).length) { toast(`${unitIcon(p.type, 28)}${icon('x', { size: 28 })}`, 800); return; }
    sel = null; planeSel = pid; reconMode = false; sfx.pew(); updateHud(); return;
  }
  if (p.used) { toast(`${unitIcon(p.type, 28)}${icon('x', { size: 28 })}`, 800); return; }
  const b = G.planeBase(S, p);
  if (!b) { toast(`${unitIcon(p.type, 28)}${icon('x', { size: 28 })}`, 800); return; }
  if (b.fleet && S.orders[b.fleet]) { toast(`${unitIcon('cv', 28)}${icon('x', { size: 28 })}`, 1000); return; } // a sailing carrier launches nothing
  sel = null; planeSel = pid; reconMode = p.type === 'recon'; // r8g3: a recon plane only ever scouts (an island it cannot reach = refused)
  sfx.pew(); updateHud();
}
// r8g: open the strip where a plane lives (its airfield zone or its carrier's fleet) at its air wing
function openPlaneHome(p) {
  tokCache = null;
  const ts = placeTokens();
  let t = null, key = null;
  if (p.air) { const z = airZone(p).split(':'); t = ts.find((q) => q.kind === 'zone' && q.isl === z[0] && q.sec === z[1]); key = t && `z:${t.isl}:${t.sec}:${p.side}`; }
  else if (p.base.fleet) { t = ts.find((q) => q.kind === 'fleet' && q.fleets.includes(p.base.fleet)); key = t && `f:${t.fleets.join(',')}:${p.side}`; }
  else { t = ts.find((q) => q.kind === 'zone' && q.isl === p.base.isl && q.sec === p.base.sec); key = t && `z:${t.isl}:${t.sec}:${p.side}`; }
  if (!t) return;
  openStrip(t); strip.grp = { k: 'air', key }; updateHud();
}
// r8g: a refused move: no words, the unit's icon + a red X where you tapped (and a short buzz)
let lastRefused = null;
function noGo(sx, sy, what, extra = '') {
  const d = document.createElement('div'); d.className = 'no-go';
  d.style.left = `${Math.max(36, Math.min(vw - 36, sx))}px`; d.style.top = `${Math.max(36, Math.min(vh - 36, sy))}px`; // r8g3: the X stays fully on screen
  d.innerHTML = `${icon('x', { size: 60, className: 'nogo-x' })}`;
  $('app').appendChild(d); setTimeout(() => d.remove(), 2000); // r8g2: the X stays ~2 s
  toast(`${what}${icon('x', { size: 28 })}${extra}`, 1800);
  fx.nogoT = performance.now(); // r8g2: the legal places for the picked unit pulse brighter for a moment
  lastRefused = { x: sx, y: sy, t: performance.now(), what: what.replace(/<[^>]+>/g, '').trim() || 'icon' };
  sfx.alarm();
}
// r8g2 fix 5: a fleet moving at its own island (to open sea / to a beach or dock) moves at once: show it with a short arrow + a ship-check toast
function fleetXY(id) { tokCache = null; const t = placeTokens().find((q) => q.kind === 'fleet' && q.fleets.includes(id)); return t ? { x: t.x, y: t.y } : null; }
let lastHop = null;
function seaHop(id, was) {
  const now = fleetXY(id); if (!now) return;
  const tk = placeTokens().find((q) => q.kind === 'fleet' && q.fleets.includes(id));
  fx.hop = { a: was, b: now, r: tk ? tk.r : null, t0: performance.now(), side: G.unit(S, id).side };
  lastHop = { id, from: was, to: now, t: performance.now() };
  toast(`${toastImg('ship')}${icon('check', { size: 28 })}`, 1800);
}
// r8g3: as readable as the cross-island fleet arrow: same width (30 x tokenScale), a stronger bow, at least ~110 px long on
// screen, tip stopping at the token's edge, full strength for 2 s, then a 0.8 s fade
const HOP_MS = 2800;
function drawHop(h) {
  const k = (tNow - h.t0) / HOP_MS; if (k >= 1) { fx.hop = null; return; }
  const fade = 1 - Math.max(0, k - 0.72) / 0.28;
  const d = Math.hypot(h.b.x - h.a.x, h.b.y - h.a.y);
  if (d < 4) { g.save(); g.globalAlpha = fade; g.lineWidth = 7 / cam.z; g.strokeStyle = SIDE_COL[h.side].light; g.beginPath(); g.arc(h.b.x, h.b.y, (26 + 34 * ((k * 3) % 1)) / cam.z, 0, 7); g.stroke(); g.restore(); return; }
  const ux = (h.b.x - h.a.x) / d, uy = (h.b.y - h.a.y) / d, tr = (h.r || 22 / cam.z) + 6 / cam.z;
  const tip = { x: h.b.x - ux * tr, y: h.b.y - uy * tr }, minL = 110 / cam.z;
  const L = Math.max(minL, Math.hypot(tip.x - h.a.x, tip.y - h.a.y));
  const tail = { x: tip.x - ux * L, y: tip.y - uy * L };
  drawArrow(g, arrowCurve(tail, tip, 0.3), h.side, Math.min(1, k * 4), { width: 30 * tokenScale(), alpha: 0.95 * fade });
}
function planeOrdered() { sfx.hit(); planeSel = null; reconMode = false; strip = null; foeSel = null; updateHud(); }
// drill-down: regiment > battalions (commander portrait each) > companies with their own pips
const pipsHtml = (n) => `<span class="pp">${Array.from({ length: G.CO_MAX }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span>`;
function renderOob(u) {
  const box = $('sel-oob');
  const key = JSON.stringify([u.id, u.str, u.kind === 'fleet' ? u.ships : G.companies(u)]);
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  if (u.kind === 'fleet') {
    G.syncOob(u);
    $('sel-str').innerHTML = `${icon('anchor', { size: 18 })}<b>${u.ships.length}</b>`;
    box.innerHTML = `<div class="bn fleet">${u.ships.map((t) => `<div class="co ship" data-t="${t}" title="${UNIT_NAMES[t]}">${unitIcon(t, 30)}</div>`).join('')}</div>`;
    return;
  }
  $('sel-str').innerHTML = `<i class="pip"></i><b>${G.regPips(u)}</b>`;
  box.innerHTML = G.battalions(u).map((b) => `<div class="bn" data-bn="${b.n}"><canvas class="bn-p" data-cmd="${b.cmd}" width="88" height="88"></canvas>
    <div class="cos">${b.cos.map((c) => `<div class="co" data-t="${c.type}" title="${UNIT_NAMES[c.type]}">${unitIcon(c.type, 24)}${pipsHtml(c.pips)}</div>`).join('')}</div></div>`).join('');
  box.querySelectorAll('canvas.bn-p').forEach((c) => c.getContext('2d').drawImage(portrait(u.side, +c.dataset.cmd, 176), 0, 0, 88, 88));
}
// keep the selected unit's island clear of the panel and the HUD (same nudge loop as the island-view placer)
function keepClear(islId) {
  const isl = G.island(S, islId);
  const boxes = () => {
    if (secK() > 0.5) return islandBoxes(isl);
    // r8f: what is drawn for an island at any zoom = its zone circles + fleet tokens (+ name), not the old ring
    tokCache = null;
    return [...placeTokens().filter((t) => t.isl === isl.id).map((t) => { const p = toScreen(t.x, t.y), r = t.r * cam.z * 1.2; return { left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r }; }), nameBox(isl.id)];
  };
  const hud = hudRects(), pad = 6;
  for (let step = 0; step < 40; step++) {
    let dx = 0, dy = 0, hit = 0;
    for (const box of boxes()) for (const h of hud) {
      const o = overlapAmt(box, h); if (!o) continue;
      hit++;
      const bx = (box.left + box.right) / 2, by = (box.top + box.bottom) / 2, hx = (h.left + h.right) / 2, hy = (h.top + h.bottom) / 2;
      if (o.x <= o.y) dx += bx < hx ? -(o.x + pad) : o.x + pad; else dy += by < hy ? -(o.y + pad) : o.y + pad;
    }
    if (!hit) return true;
    cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam();
  }
  return false;
}
function toast(html, ms = 1100) {
  const t = $('toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms / Math.max(1, speed / 3));
}

// first-run hints
let hintStep = localStorage.getItem('pacificweek:hint') === 'done' || params.has('nohint') ? 'done' : 'unit';
let hintTarget = null;
function refreshHint() {
  const h = $('hint');
  if (hintStep === 'done' || busy || S.over || !$('title').hidden) { h.hidden = true; hintTarget = null; return; }
  if (hintStep === 'wait') { h.hidden = true; hintTarget = null; return; }
  const fleet = S.units.find((u) => u.side === 'blue' && u.kind === 'fleet' && u.at === 'kestra');
  const aboard = S.units.find((u) => u.side === 'blue' && u.aboard);
  const onBeach = fleet && S.units.find((u) => u.side === 'blue' && u.kind === 'army' && G.canEmbark(S, u, fleet.id));
  if (hintStep === 'unit') { hintTarget = onBeach ? { unit: onBeach.id } : { world: G.island(S, 'kestra') }; $('hint-t').textContent = 'TAP YOUR ARMY'; }
  else if (hintStep === 'ship' && fleet) { hintTarget = { unit: fleet.id }; $('hint-t').textContent = 'TAP YOUR SHIP'; }
  else if (hintStep === 'unit2' && aboard) { hintTarget = { unit: aboard.id }; $('hint-t').textContent = 'TAP YOUR ARMY'; }
  else if (hintStep === 'dest') { hintTarget = { world: G.island(S, 'oska') }; $('hint-t').textContent = 'TAP AN ISLAND'; }
  else { hintTarget = { el: $('b-end') }; $('hint-t').textContent = 'END WEEK'; }
  h.hidden = false;
}
function placeHint() {
  const h = $('hint');
  if (hintTarget.unit && strat()) { // r8: point at the unit's card when the strip shows it, else at its token
    const card = strip && $('strip').querySelector(`[data-u="${hintTarget.unit}"]`);
    if (card && sel !== hintTarget.unit) { const r = card.getBoundingClientRect(); hintTarget.pt = { x: r.left + r.width / 2, y: r.top }; }
    else { const t = placeTokens().find((q) => q.units && q.units.includes(hintTarget.unit) && (q.kind === 'fleet' || !G.unit(S, hintTarget.unit)?.aboard)); if (t) { hintTarget.pt = toScreen(t.x, t.y - t.r); hintTarget.tokD = 2 * t.r * cam.z; } }
  } else if (hintTarget.unit) {
    const u = view.units.find((x) => x.id === hintTarget.unit);
    if (u) { const q = useBlocks() ? (() => { const b = blockAt(u); return { x: b.x0 + b.w / 2, y: b.y0 }; })() : (() => { const t = tagPos(u); return { x: t.x, y: t.y - 18 * t.s }; })(); hintTarget.pt = toScreen(q.x, q.y); }
  }
  if (hintTarget.pt) {
    const p = hintTarget.pt, hw = h.offsetWidth / 2 + 6;
    h.classList.remove('below', 'side-r', 'side-l'); h.style.left = `${Math.max(hw, Math.min(vw - hw, p.x))}px`; h.style.top = `${Math.max(h.offsetHeight + 70, p.y - 6)}px`;
    if (strat()) hintOffTokens(h, hintTarget.tokD || 0);
  } else if (hintTarget.world) {
    const p = toScreen(hintTarget.world.x, hintTarget.world.y - R - 30);
    const hw = h.offsetWidth / 2 + 6;
    h.classList.remove('below', 'side-r', 'side-l'); h.style.left = `${Math.max(hw, Math.min(vw - hw, p.x))}px`; h.style.top = `${Math.max(h.offsetHeight + 70, p.y)}px`;
  } else {
    const r = hintTarget.el.getBoundingClientRect();
    h.classList.remove('below', 'side-r', 'side-l'); h.style.left = `${Math.min(vw - 90, r.left + r.width / 2)}px`; h.style.top = `${r.top - 14}px`;
  }
}
// r8g3: TAP YOUR SHIP goes away after the first fleet tap or fleet order and never comes back (kept like the other done-states)
// r8g3: the bubble never sits on a token (so every token stays visible and tappable): lift it (or drop it below) until clear
function hintOffTokens(h, tokD) {
  const W = h.offsetWidth, BH = h.offsetHeight, x = parseFloat(h.style.left), y0 = parseFloat(h.style.top); // above: style.top = the bubble's bottom, pointer 10 px lower
  const tx = hintTarget.pt.x, tr = tokD / 2, ty = hintTarget.pt.y + tr; // the target token's centre / radius on screen
  const toks = placeTokens().map((t) => { const p = toScreen(t.x, t.y); return { x: p.x, y: p.y, r: t.r * cam.z + 4 }; });
  const clear = (l, r, t0, t1) => l > 4 && r < vw - 4 && t0 > 60 && t1 < vh - 90 && toks.every((t) => { const cx = Math.max(l, Math.min(r, t.x)), cy = Math.max(t0, Math.min(t1, t.y)); return Math.hypot(cx - t.x, cy - t.y) >= t.r; });
  const put = (cls, lx, ty2) => { h.classList.remove('below', 'side-r', 'side-l'); if (cls) h.classList.add(cls); h.style.left = `${lx}px`; h.style.top = `${ty2}px`; return true; };
  const yb = y0 + 6 + tokD + 6; // just under the token, pointing up at it
  for (let dy = 0; dy <= 30; dy += 6) if (clear(x - W / 2, x + W / 2, y0 - dy - BH, y0 - dy + 10)) return put('', x, y0 - dy);
  for (let dy = 0; dy <= 30; dy += 6) if (clear(x - W / 2, x + W / 2, yb + dy - 10, yb + dy + BH)) return put('below', x, yb + dy);
  // beside the token, pointing at it sideways (style.top = the bubble's vertical centre)
  for (const dyy of [0, -12, 12, -24, 24]) {
    const cy = ty + dyy, lr = tx + tr + 14; if (clear(lr - 10, lr + W, cy - BH / 2, cy + BH / 2)) return put('side-r', lr, cy);
    const ll = tx - tr - 14; if (clear(ll - W, ll + 10, cy - BH / 2, cy + BH / 2)) return put('side-l', ll, cy);
  }
  for (let dy = 36; dy <= 200; dy += 6) if (clear(x - W / 2, x + W / 2, y0 - dy - BH, y0 - dy + 10)) return put('', x, y0 - dy);
  for (let dy = 36; dy <= 200; dy += 6) if (clear(x - W / 2, x + W / 2, yb + dy - 10, yb + dy + BH)) return put('below', x, yb + dy);
  return false;
}
function shipHintSeen() {
  localStorage.setItem('pacificweek:hint-ship', 'done');
  if (hintStep === 'ship') advanceHint('end1');
}
function advanceHint(step) {
  if (step === 'ship' && localStorage.getItem('pacificweek:hint-ship') === 'done') step = 'end1';
  if (hintStep === 'done') return;
  hintStep = step;
  if (step === 'done') localStorage.setItem('pacificweek:hint', 'done');
  refreshHint();
}

// ---------- interaction ----------
function tagAt(wx, wy) {
  cardCache = null; labelCache = null; // the camera may have moved since the last frame
  for (const isl of view.islands) {
    for (const u of unitsAtView(isl.id)) {
      if (u.unknown) continue;
      let b;
      if (useBlocks()) { const k = blockAt(u); b = { x0: k.x0, x1: k.x0 + k.w, y0: k.y0, y1: k.y0 + k.h }; } else { const p = tagPos(u); b = tagBounds(p.x, p.y, p.s); }
      if (wx >= b.x0 && wx <= b.x1 && wy >= b.y0 && wy <= b.y1) return u;
    }
  }
  return null;
}
function islandAt(wx, wy) {
  let best = null, bd = 1e9;
  for (const isl of S.islands) { const d = Math.hypot(isl.x - wx, isl.y - wy); if (d < R * 1.15 && d < bd) { bd = d; best = isl; } }
  return best;
}
function sectionAt(wx, wy) {
  const ks = secK(), det = strat() ? detailIsles() : null;
  let best = null, bd = 1e9;
  for (const isl of S.islands) for (const x of isl.secs) {
    void det; // r8e: every zone circle is a section marker
    const p = secPos(isl, x, ks), tol = Math.max(p.r + 4 / cam.z, 22 / cam.z);
    const d = Math.hypot(p.x - wx, p.y - wy); if (d < tol && d < bd) { bd = d; best = { isl, x }; }
  }
  return best;
}
function select(id) {
  sel = id;
  if (id) { airOpen = false; planeSel = null; reconMode = false; }
  const u = id && G.unit(S, id);
  if (u && hintStep === 'unit' && u.kind === 'army' && G.unitsAt(S, u.at, 'blue', 'fleet').some((f) => G.canEmbark(S, u, f.id))) advanceHint('ship');
  if (u && hintStep === 'unit2' && u.aboard) advanceHint('dest');
  if (u && u.kind === 'fleet' && u.side === 'blue') shipHintSeen();
  updateHud(); sfx.pew();
}
// small canvas icons for toasts (beach marker, ship)
const toastImg = (() => { const m = {}; return (k) => {
  if (m[k]) return m[k];
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const q = c.getContext('2d'); q.scale(2, 2);
  q.fillStyle = '#12161c'; q.beginPath(); q.arc(16, 16, 14, 0, 7); q.fill(); q.lineWidth = 2.5; q.strokeStyle = SIDE_COL.blue.fill; q.stroke();
  if (k === 'ship') shipSide(q, 16, 17, 22, '#e6ebf0'); else secIcon(q, k, 16, 16, 20, '#e6ebf0');
  return (m[k] = `<img src="${c.toDataURL()}" width="32" height="32" alt="">`);
}; })();
// armies cross water only by ship: walk to a beach, board a ship there, sail, land on a beach
function seaPrompt(u) {
  const x = u.sec && G.section(G.island(S, u.at), u.sec);
  const onBeach = x && x.kind === 'beach' && x.owner === 'blue';
  const ship = G.unitsAt(S, u.at, 'blue', 'fleet').length > 0;
  // r8g: icons only (no words): army -> ship / beach -> ship / ship X
  if (onBeach && ship) return `${armyImg()}${icon('back', { size: 22, className: 'sc-ico flip' })}${toastImg('ship')}`;
  if (!onBeach) return `${toastImg('beach')}${icon('back', { size: 22, className: 'sc-ico flip' })}${toastImg('ship')}`;
  return `${toastImg('ship')}${icon('x', { size: 28 })}`;
}
const armyImg = () => { if (armyImg.v) return armyImg.v; const c = document.createElement('canvas'); c.width = 64; c.height = 64; const q = c.getContext('2d'); q.scale(2, 2); armySymbol(q, 16, 16, 22, '#e6ebf0'); return (armyImg.v = `<img src="${c.toDataURL()}" width="32" height="32" alt="">`); };
function ordered() { sfx.hit(); sel = null; strip = null; foeSel = null; updateHud(); }
// r7b sealift helpers: sail the army's ship to `tid` (if needed) and land it on `beach` (or the best beach).
// Returns the beach id, 'ship' when the ship cannot sail there, or false.
// r8e: the open sea near an island (a fleet order to "the waters of" that island)
function seaIsland(wx, wy) {
  let best = null, bd = 1e9;
  for (const isl of S.islands) { const d = Math.hypot(isl.x - wx, isl.y - wy); if (d < R * 2.6 && d < bd) { bd = d; best = isl; } }
  return best;
}
function sailAndLand(uid, tid, beach) {
  const u = G.unit(S, uid), f = u && G.unit(S, u.aboard); if (!f) return false;
  if (tid !== f.at && tid !== G.landIsland(S, u) && !G.canFleetMove(S, f.id, tid, null)) return 'ship';
  const b = beach || G.landingBeach(S, u, G.island(S, tid));
  // r8e: the ship sails to (or stays in) those waters and docks at the landing beach
  if (!G.issueFleetMove(S, f.id, tid, b)) return 'ship';
  return G.issueLand(S, uid, b) ? b : false;
}
const SNAP_KEYS = ['orders', 'secOrders', 'landOrd', 'landAt', 'embark', 'strikes', 'strikeZ', 'spotOrd', 'flyOrd', 'landPl', 'reconOrd'];
function orderSnap() { const o = {}; for (const k of SNAP_KEYS) if (S[k] !== undefined) o[k] = clone(S[k]); o.__spots = S.units.filter((u) => u.kind === 'fleet').map((u) => [u.id, u.spot ? { ...u.spot } : null]); return o; }
function orderRestore(o) { for (const k of Object.keys(o)) if (k !== '__spots') S[k] = o[k]; for (const [id, sp] of o.__spots || []) { const u = G.unit(S, id); if (u) u.spot = sp; } }
// r7b: the landing-under-fire card. Nothing is ordered until the player confirms.
let warnPending = null;
function warnArt(risk) {
  const c = document.createElement('canvas'), W = 240, H = 64; c.width = W * 2; c.height = H * 2;
  const x = c.getContext('2d'); x.scale(2, 2);
  armySymbol(x, 30, 32, 34, '#fff');
  x.font = '900 30px "Barlow Condensed", sans-serif'; x.textBaseline = 'middle'; x.textAlign = 'left';
  x.fillStyle = '#ff6b5e'; x.fillText('\u00bd', 54, 33);
  shipSide(x, 118, 36, 40, SIDE_COL.red.fill);
  x.fillStyle = '#fff'; x.font = '900 22px "Barlow Condensed", sans-serif'; x.fillText(String(risk.foe), 140, 22);
  x.font = '900 34px "Barlow Condensed", sans-serif'; x.fillText('>', 160, 34);
  shipSide(x, 205, 36, 40, SIDE_COL.blue.fill);
  x.font = '900 22px "Barlow Condensed", sans-serif'; x.fillText(String(risk.own), 226, 22);
  return c.toDataURL();
}
function showWarn(p, at = null) {
  warnPending = p;
  armWarnGuard();
  const w = $('warn');
  w.innerHTML = `<img class="w-art" alt="" src="${warnArt(p.risk)}"><div class="w-t">UNDER FIRE: ARMY LOSES HALF</div>`
    + `<div class="w-b"><button id="warn-no" aria-label="Cancel">${icon('x', { size: 28 })}</button>`
    + `<button id="warn-ok" aria-label="Land anyway">${icon('check', { size: 28 })}<span>LAND</span></button></div>`;
  w.hidden = false;
  placeWarn(w, at);
  $('warn-no').onclick = (e) => { e.stopPropagation(); hideWarn(); };
  $('warn-ok').onclick = (e) => { e.stopPropagation(); confirmWarn(); };
}
// r7c belt 1: the card opens on the island tap's pointerup. The rest of that same gesture (touchend, the compatibility
// mousedown / mouseup / click) lands wherever the finger is, which may be the card. Swallow it in the capture phase,
// and disarm on the gesture's click or when a new gesture starts (pointerdown / touchstart), so a later separate tap on
// LAND or the cancel button works. A short fallback disarm covers a gesture that never sends its click.
let warnGuard = null;
function armWarnGuard() {
  disarmWarnGuard();
  const swallow = (e) => { e.stopImmediatePropagation(); e.preventDefault(); if (e.type === 'click') disarmWarnGuard(); };
  const fresh = () => disarmWarnGuard(); // a new touch or press: let it through
  const types = ['touchend', 'pointerup', 'mousedown', 'mouseup', 'click'];
  types.forEach((t) => window.addEventListener(t, swallow, { capture: true, passive: false }));
  window.addEventListener('pointerdown', fresh, true); window.addEventListener('touchstart', fresh, true);
  warnGuard = { swallow, fresh, types, timer: setTimeout(disarmWarnGuard, 500) };
}
function disarmWarnGuard() {
  const gd = warnGuard; if (!gd) return; warnGuard = null; clearTimeout(gd.timer);
  gd.types.forEach((t) => window.removeEventListener(t, gd.swallow, { capture: true }));
  window.removeEventListener('pointerdown', gd.fresh, true); window.removeEventListener('touchstart', gd.fresh, true);
}
// r7c belt 2: place the card so its buttons are at least WARN_GAP px from the tap, fully on screen, preferring spots
// that do not cover the HUD, End Week or the unit panel. Order of preference: centre, up, sideways, down.
const WARN_GAP = 28, WARN_M = 8;
function placeWarn(w, at) {
  w.style.transform = 'none';
  const W = w.offsetWidth, H = w.offsetHeight;
  const place = (l, t) => { w.style.left = `${l}px`; w.style.top = `${t}px`; };
  const cl = Math.round((vw - W) / 2), ct = Math.round((vh - H) / 2);
  if (!at) { place(cl, ct); return; }
  place(0, 0);
  const btns = ['warn-ok', 'warn-no'].map((id) => { const r = $(id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  const obs = [...document.querySelectorAll('.hud, #sel, #banner, #hold, #air, #strip')].filter((e) => !e.hidden && e.offsetParent !== null)
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
  const clampL = (l) => Math.max(WARN_M, Math.min(vw - W - WARN_M, l)), clampT = (t) => Math.max(WARN_M, Math.min(vh - H - WARN_M, t));
  const btnTop = Math.min(...btns.map((b) => b.t)), btnBot = Math.max(...btns.map((b) => b.b));
  const cands = [
    [cl, ct],
    [cl, at.y - WARN_GAP - H], // whole card above the tap
    [cl, at.y - WARN_GAP - btnBot], // buttons above the tap
    [at.x - WARN_GAP - W, ct], [at.x + WARN_GAP, ct], // left / right of the tap
    [at.x - WARN_GAP - W, at.y - H / 2], [at.x + WARN_GAP, at.y - H / 2],
    [cl, at.y + WARN_GAP - btnTop + 0], [cl, at.y + WARN_GAP], // below
  ];
  for (let t = WARN_M; t <= vh - H - WARN_M; t += 16) for (let l = WARN_M; l <= vw - W - WARN_M; l += 16) cands.push([l, t]);
  const gapTo = (b, l, t) => { const dx = Math.max(b.l + l - at.x, 0, at.x - (b.r + l)), dy = Math.max(b.t + t - at.y, 0, at.y - (b.b + t)); return Math.hypot(dx, dy); };
  const cover = (l, t) => obs.reduce((n, r) => n + Math.max(0, Math.min(l + W, r.right) - Math.max(l, r.left)) * Math.max(0, Math.min(t + H, r.bottom) - Math.max(t, r.top)), 0);
  let best = null;
  cands.forEach(([l0, t0], i) => {
    const l = clampL(Math.round(l0)), t = clampT(Math.round(t0));
    if (Math.min(...btns.map((b) => gapTo(b, l, t))) < WARN_GAP) return;
    const score = cover(l, t) + i * 0.5; // least HUD covered; earlier (preferred) spots win ties
    if (!best || score < best.score) best = { l, t, score };
  });
  if (best) place(best.l, best.t); else place(cl, ct);
  w.dataset.tap = `${Math.round(at.x)},${Math.round(at.y)}`;
}
function hideWarn() { warnPending = null; disarmWarnGuard(); const w = $('warn'); if (w) { w.hidden = true; w.innerHTML = ''; } }
function confirmWarn() {
  const p = warnPending; hideWarn(); if (!p) return;
  const r = sailAndLand(p.uid, p.tid, p.beach);
  if (r && r !== 'ship') { if (hintStep === 'dest') advanceHint('end'); ordered(); }
}
function tapAt(sx, sy) {
  if (busy || S.over) return;
  if (warnPending) { hideWarn(); return; } // a tap on the map cancels the landing card
  const w = toWorld(sx, sy);
  const tk = tokenAt(sx, sy); // r8: map zoom taps land on tokens
  if (reconMode || planeSel) {
    const isl = tk ? G.island(S, tk.isl) : islandAt(w.x, w.y);
    const p = G.plane(S, planeSel), pic = p ? unitIcon(p.type, 28) : '';
    if (p && p.air) { // r8g ask 5: down only on your airfield zone or a carrier
      let base = null;
      if (tk && tk.kind === 'zone' && tk.secKind === 'air') base = { isl: tk.isl, sec: tk.sec };
      else if (tk && tk.kind === 'fleet') { const f = tk.fleets.find((id) => G.canLandPlane(S, p.id, { fleet: id })); base = { fleet: f || tk.fleets[0] }; }
      if (base && G.issuePlaneLand(S, p.id, base)) { planeOrdered(); return; }
      if (tk || isl) { noGo(sx, sy, pic); return; }
      planeSel = null; updateHud(); return;
    }
    if (p && p.type === 'recon') { // r8g3: a recon tap only ever queues a recon order (never a fly order); out of range / already seen = refused, nothing spent
      if (isl && G.issueRecon(S, p.id, isl.id)) { planeOrdered(); return; }
      if (isl) { noGo(sx, sy, pic); return; }
      reconMode = false; planeSel = null; strip = null; updateHud(); return;
    }
    if (p && isl) {
      // r8g ask 9: strike the zone you tap (fogged is fine; a bomber hits only that zone), else fly up over it
      const z = tk && tk.kind === 'zone' ? tk.sec : null;
      if (p.type === 'bomber' && z && G.issueStrike(S, p.id, isl.id, z)) { planeOrdered(); return; }
      if (p.type !== 'bomber' && p.type !== 'recon' && G.issueStrike(S, p.id, isl.id)) { planeOrdered(); return; }
      if (G.issueFly(S, p.id, isl.id, z)) { planeOrdered(); return; }
      noGo(sx, sy, pic); return;
    }
    reconMode = false; planeSel = null; strip = null; updateHud(); return;
  }
  const cur = sel && G.unit(S, sel);
  let forced = null, forcedSec = null; // r8: a token tap that means "this island" (r8e: or this zone)
  if (strat()) {
    // r8e: a picked fleet sails or docks where you tap: a beach zone = dock there, any other zone / token / nearby sea = open sea there
    if (cur && cur.kind === 'fleet') {
      if (tk && tk.kind === 'fleet' && tk.fleets.includes(cur.id)) { openStrip(tk); return; }
      let to = null, spot = null;
      if (tk && tk.kind === 'zone') { // r8g ask 4: a beach or a dock = dock there; a land / airfield / HQ zone = refused
        if (!G.SHIP_ZONES.includes(tk.secKind)) { noGo(sx, sy, toastImg('ship')); return; }
        to = tk.isl; spot = tk.sec;
      }
      else if (tk) to = tk.isl;
      else { const near = seaIsland(w.x, w.y); if (near) to = near.id; }
      if (to) {
        const was = to === cur.at ? fleetXY(cur.id) : null;
        if (G.issueFleetMove(S, cur.id, to, spot)) { if (was) seaHop(cur.id, was); ordered(); return; }
        noGo(sx, sy, toastImg('ship')); return;
      }
      sel = null; strip = null; foeSel = null; updateHud(); return;
    }
    if (tk) {
      if (cur && cur.kind === 'army' && cur.aboard && tk.kind === 'fleet' && tk.fleets.includes(cur.aboard)) { openStrip(tk); return; } // its own ship: show the fleet strip
      if (cur && cur.kind === 'army' && !cur.aboard && tk.kind === 'fleet' && tk.side === 'blue' && tk.isl === cur.at) {
        const fid = tk.fleets.find((id) => G.canEmbark(S, cur, id));
        if (fid && G.issueEmbark(S, cur.id, fid)) { if (hintStep === 'ship') advanceHint('end1'); ordered(); return; }
        toast(seaPrompt(cur), 1300); return;
      }
      if (cur && cur.kind === 'army' && tk.kind === 'zone') {
        if (!cur.aboard && tk.isl === cur.at) {
          if (tk.sec !== cur.sec && G.canSecOrder(S, cur, tk.sec)) { G.issueSecOrder(S, cur.id, tk.sec); ordered(); return; }
          openStrip(tk); return;
        }
        forced = G.island(S, tk.isl); forcedSec = { isl: forced, x: G.section(forced, tk.sec) }; // aboard: land there; on land elsewhere: sea prompt
      } else {
        const home = cur && (cur.kind === 'army' && cur.aboard ? null : cur.at);
        if (cur && tk.isl !== home) forced = G.island(S, tk.isl);
        else { openStrip(tk); return; }
      }
    } else if (!cur) {
      if (strip) { closeStrip(); return; }
      const isl0 = islandAt(w.x, w.y);
      if (isl0) { const zt = placeTokens().filter((t) => t.kind === 'zone' && t.isl === isl0.id).sort((a, b) => Math.hypot(a.x - w.x, a.y - w.y) - Math.hypot(b.x - w.x, b.y - w.y))[0]; if (zt) { openStrip(zt); return; } }
    }
  }
  const tag = strat() ? null : tagAt(w.x, w.y);
  const isl = forced || islandAt(w.x, w.y);
  const sec = forcedSec || (forced ? null : sectionAt(w.x, w.y));
  // r7 sealift 1: an army on a beach taps a friendly ship in the same waters = board it
  if (cur && cur.kind === 'army' && !cur.aboard && tag && tag.kind === 'fleet' && tag.side === 'blue' && tag.at === cur.at) {
    if (G.issueEmbark(S, cur.id, tag.id)) { if (hintStep === 'ship') advanceHint('end1'); ordered(); return; }
    toast(seaPrompt(cur), 1300); select(tag.id); return;
  }
  // r7 sealift 2: an army aboard taps an island (or one of its beaches): its ship sails there and it lands on a beach
  if (cur && cur.kind === 'army' && cur.aboard) {
    const tid = sec ? sec.isl.id : isl && isl.id;
    const onTag = tag && tag.side === 'blue' && tag.at === tid && !sec;
    if (tid && !onTag) {
      // r7b: try the orders, and if the landing would go in under a stronger enemy fleet, undo them and ask first
      const snap = orderSnap();
      const r = sailAndLand(cur.id, tid, sec && sec.x.kind === 'beach' ? sec.x.id : null);
      if (r === 'ship') { toast(`${toastImg('ship')}${icon('x', { size: 28 })}`, 800); return; }
      if (r) {
        const risk = G.landingRisk(S, 'blue', tid);
        if (risk.risk) { orderRestore(snap); showWarn({ uid: cur.id, tid, beach: r, risk }, { x: sx, y: sy }); return; }
        if (hintStep === 'dest') advanceHint('end'); ordered(); return;
      }
    }
  }
  if (tag && tag.side === 'blue' && (!cur || tag.at === cur.at || !isl || isl.id === cur.at) && !(cur && sec && cur.at === sec.isl.id && cur.kind === 'army' && G.canSecOrder(S, cur, sec.x.id) && sec.x.id !== cur.sec && !G.armiesIn(S, sec.isl.id, sec.x.id, 'blue').some((u) => u.id === tag.id))) {
    select(tag.id === sel ? null : tag.id); return;
  }
  // push to a linked section (island view, or the ring markers on the map)
  if (cur && sec && cur.kind === 'army' && sec.isl.id === cur.at && G.canSecOrder(S, cur, sec.x.id)) { G.issueSecOrder(S, cur.id, sec.x.id); ordered(); return; }
  // an army on land cannot cross water by itself: say what to do instead
  if (cur && cur.kind === 'army' && !cur.aboard && isl && isl.id !== cur.at) { noGo(sx, sy, armyImg(), `<i class="t-gap"></i>${seaPrompt(cur)}`); return; } // r8g ask 8: no walking to another island
  if (cur && isl && isl.id !== cur.at) {
    if (G.issueOrder(S, cur.id, isl.id)) { ordered(); return; }
  }
  if (sec) {
    const here = G.unitsAt(S, sec.isl.id, 'blue').filter((u) => u.kind === 'army' && u.sec === sec.x.id);
    if (here.length) { const i = cur ? here.findIndex((u) => u.id === cur.id) : -1; select(here[(i + 1) % here.length].id); return; }
  }
  if (isl) {
    const mine = G.unitsAt(S, isl.id, 'blue');
    if (mine.length) {
      const i = cur ? mine.findIndex((u) => u.id === cur.id) : -1;
      select(mine[(i + 1) % mine.length].id); return;
    }
    if (cur) { toast(`${icon('x', { size: 28 })}`, 700); return; }
  }
  sel = null; strip = null; foeSel = null; updateHud();
}

// ---------- r8b: drag an army card onto another leader's card = that leader now commands it ----------
const DRAG_PX = 12;
function dropTarget(x, y, id) {
  const box = $('strip'); if (box.hidden) return null;
  const cards = [...box.querySelectorAll('.sc[data-army="1"]')].filter((c) => c.dataset.u !== id);
  const top = Math.min(...cards.map((c) => c.getBoundingClientRect().top), 1e9);
  if (y < top - 80) return null; // too far above the strip
  return cards.find((c) => { const r = c.getBoundingClientRect(); return x >= r.left - 4 && x <= r.right + 4 && y <= r.bottom + 10; }) || null;
}
function wireDrag() {
  const box = $('strip');
  box.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.sc[data-army="1"]'); if (!c || busy) return;
    drag = { id: c.dataset.u, pid: e.pointerId, sx: e.clientX, sy: e.clientY, on: false, el: c, ghost: null, over: null };
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.on) {
      if (Math.abs(dy) < DRAG_PX || Math.abs(dy) < Math.abs(dx)) { if (Math.abs(dx) > DRAG_PX) drag = null; return; } // sideways = scroll the strip
      drag.on = true; try { box.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
      const r = drag.el.getBoundingClientRect(), gh = drag.el.cloneNode(true);
      gh.querySelectorAll('canvas').forEach((cv, i) => cv.getContext('2d').drawImage(drag.el.querySelectorAll('canvas')[i], 0, 0));
      gh.classList.add('drag-ghost'); gh.style.left = `${r.left}px`; gh.style.top = `${r.top}px`; gh.style.width = `${r.width}px`; gh.style.height = `${r.height}px`;
      document.body.appendChild(gh); drag.ghost = gh; drag.r0 = r; drag.el.classList.add('lifted'); sfx.pew();
    }
    drag.ghost.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;
    const t = dropTarget(e.clientX, e.clientY, drag.id);
    if (t !== drag.over) { if (drag.over) drag.over.classList.remove('drop'); drag.over = t; if (t) t.classList.add('drop'); }
    e.preventDefault();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag; drag = null;
    if (!d.on) return;
    d.ghost.remove(); d.el.classList.remove('lifted'); if (d.over) d.over.classList.remove('drop');
    armWarnGuard(); // the drop's leftover click must not select / deselect a card
    const t = e.type === 'pointerup' ? dropTarget(e.clientX, e.clientY, d.id) : null;
    if (t && G.reassignCmd(S, d.id, t.dataset.u)) { view = snapshotView(); sfx.hit(); lastReassign = { id: d.id, to: t.dataset.u, cmd: G.unit(S, d.id).cmd }; }
    updateHud();
  };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
}
let lastReassign = null;

const pointers = new Map();
let gesture = null;
cvs.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (!$('hold').hidden) toggleHoldings(false);
  if (!$('report').hidden) $('report').hidden = true;
  cvs.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: cam.z, mid: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2), moved: true };
  }
});
cvs.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gesture) return;
  if (gesture.type === 'pan' && pointers.size === 1) {
    const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
    if (Math.hypot(dx, dy) > 8) { gesture.moved = true; cvs.classList.add('drag'); }
    if (gesture.moved) { cam.x = gesture.cx - dx / cam.z; cam.y = gesture.cy - dy / cam.z; clampCam(); }
  } else if (gesture.type === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    cam.z = gesture.z0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, gesture.d0);
    clampCam();
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    cam.x = gesture.mid.x - (mx - vw / 2) / cam.z; cam.y = gesture.mid.y - (my - vh / 2) / cam.z; clampCam();
  }
});
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  cvs.classList.remove('drag');
  if (gesture && gesture.type === 'pan' && !gesture.moved && pointers.size === 0 && e.type === 'pointerup') tapAt(e.clientX, e.clientY);
  if (pointers.size === 0) gesture = null;
  else if (pointers.size === 1) { const [p] = [...pointers.values()]; gesture = { type: 'pan', sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: true }; }
  updateHud();
};
cvs.addEventListener('pointerup', endPointer);
cvs.addEventListener('pointercancel', endPointer);
cvs.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
function zoomAt(sx, sy, f) {
  const before = toWorld(sx, sy);
  cam.z *= f; clampCam();
  const after = toWorld(sx, sy);
  cam.x += before.x - after.x; cam.y += before.y - after.y; clampCam();
  if (sel) updateHud();
}
window.addEventListener('keydown', (e) => {
  if (!$('title').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startPlay(); } return; }
  if (e.key === 'Escape') { hideWarn(); $('help').hidden = true; sel = null; reconMode = false; planeSel = null; airOpen = false; strip = null; updateHud(); }
  else if ((e.key === 'Enter' || e.key === ' ') && $('end').hidden && $('help').hidden) { e.preventDefault(); doEndWeek(); }
  else if (e.key === 'Tab') {
    e.preventDefault(); if (busy) return;
    const mine = S.units.filter((u) => u.side === 'blue');
    const i = mine.findIndex((u) => u.id === sel);
    if (mine.length) { const u = mine[(i + 1) % mine.length]; select(u.id); const isl = G.island(S, u.at); cam.x = isl.x; cam.y = isl.y; clampCam(); }
  } else if (e.key === '+' || e.key === '=') zoomAt(vw / 2, vh / 2, 1.25);
  else if (e.key === '-') zoomAt(vw / 2, vh / 2, 0.8);
  else if (e.key.startsWith('Arrow')) {
    const d = 80 / cam.z;
    if (e.key === 'ArrowLeft') cam.x -= d; if (e.key === 'ArrowRight') cam.x += d;
    if (e.key === 'ArrowUp') cam.y -= d; if (e.key === 'ArrowDown') cam.y += d;
    clampCam();
  } else if (/^[1-9]$/.test(e.key) && sel) {
    // number keys order the selected unit to the n-th reachable island (keyboard play)
    const u = G.unit(S, sel); const r = G.reachable(S, u);
    const id = r[+e.key - 1]; if (id && G.issueOrder(S, u.id, id)) { sel = null; updateHud(); }
  }
});

// ---------- week resolution ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms / speed));
function tween(ms, fn) {
  return new Promise((res) => {
    const t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / (ms / speed)); fn(k); if (k < 1) requestAnimationFrame(step); else res(); };
    step();
  });
}
async function focusOn(p, z) {
  const c0 = { x: cam.x, y: cam.y, z: cam.z };
  const z1 = Math.max(cam.z, z || cam.z);
  await tween(500, (k) => { const e = ease(k); cam.z = c0.z + (z1 - c0.z) * e; cam.x = c0.x + (p.x - c0.x) * e; cam.y = c0.y + (p.y - c0.y) * e; clampCam(); });
}
let lastEvents = [];
const blueIn = (b) => b.icons.blue.some((i) => i.kind === 'ship' || i.kind === 'inf' || i.kind === 'fort');
const fighters = (b, side) => b.icons[side].filter((i) => i.alive && (i.kind === 'inf' || i.kind === 'ship')).length;

async function doEndWeek(opts = {}) {
  if (busy || S.over || !$('title').hidden) return;
  const nextHint = hintStep === 'end1' ? 'unit2' : 'done';
  hideWarn();
  busy = true; sel = null; foeSel = null; reconMode = false; planeSel = null; airOpen = false; if (hintStep !== 'done') hintStep = 'wait';
  $('report').hidden = true; toggleHoldings(false); updateHud(); refreshHint();
  const camBefore = { x: cam.x, y: cam.y, z: cam.z };
  view = snapshotView();
  const seenBefore = new Set(seen);
  const events = [];
  const gen = G.weekSteps(S, { ai: opts.ai !== false });
  let cur = null;
  for (let step = gen.next(); !step.done; step = gen.next()) {
    const e = step.value;
    if (e.type === 'moves') {
      events.push(e);
      const after = G.vision(S, 'blue');
      const shown = e.moves.filter((m) => m.side === 'blue' || seenBefore.has(m.from) || after.has(m.to));
      if (shown.length) {
        fx.moving = { list: shown, ids: new Set(e.moves.flatMap((m) => [m.unit, ...(m.carry || [])])), t: 0 };
        sfx.alarm();
        await tween(1500, (k) => { fx.moving.t = k; });
        fx.stayArrows = shown; fx.moving = null;
      }
      view.units = clone(S.units);
      refreshFog(true);
      await wait(250);
    } else if (e.type === 'battle-start') {
      const b = e.b;
      const isl = G.island(S, b.island), at = b.kind === 'land' ? G.section(isl, b.sec) : isl;
      cur = { b, board: null };
      if (blueIn(b)) {
        await focusOn(at, b.kind === 'land' ? 1.15 : 0.9);
        fx.flashes.push({ x: at.x, y: at.y, t0: performance.now() });
        await wait(250);
        cur.board = board = openBoard(b, { speedRef: () => speed, sfx, terrain, world: G.WORLD, at, blue: true });
        await board.intro();
      } else if (seen.has(b.island)) fx.flashes.push({ x: at.x, y: at.y, t0: performance.now() });
    } else if (e.type === 'round') {
      const b = e.b;
      if (cur && cur.board) await cur.board.round(e.shots);
      if (!b.done) {
        let side = null;
        if (cur && cur.board && cur.board.wantRetreat && b.canRetreat.blue) side = 'blue';
        else if (opts.retreat && b.canRetreat.blue && opts.retreat(b, 'blue')) side = 'blue';
        else if (opts.blueAi && G.aiWantsRetreat(b, 'blue')) side = 'blue';
        else if (opts.redRetreat !== false && G.aiWantsRetreat(b, 'red')) side = 'red';
        if (side) {
          const before = fighters(b, side);
          G.retreatBattle(S, b, side);
          const after = (b.retreats || []).reduce((n, r) => { const u = G.unit(S, r.unit); return n + (u && u.side === side ? u.str : 0); }, 0);
          if (cur && cur.board) await cur.board.retreat(side, before - after);
        }
      }
    } else if (e.type === 'battle-end') {
      const b = e.b;
      events.push(G.battleEvent(b));
      if (cur && cur.board) { await cur.board.finish(); board = null; }
      view = snapshotView();
      if (b.kind === 'land' && b.winner && seen.has(b.island)) { const x = G.section(G.island(S, b.island), b.sec); fx.pulses.push({ x: x.x, y: x.y, r: SEC_R + 6, side: b.winner, t0: performance.now() }); }
      if (cur && cur.board !== null) await wait(400);
      cur = null;
      updateHud();
    } else if (e.type === 'walk-in' || e.type === 'sweep') {
      events.push(e);
      view.islands = clone(S.islands);
      if (seen.has(e.island)) for (const id of e.secs || [e.sec]) { const x = G.section(G.island(S, e.island), id); fx.pulses.push({ x: x.x, y: x.y, r: SEC_R + 4, side: e.side, t0: performance.now() }); }
    } else if (e.type === 'capture') {
      events.push(e);
      view.islands = clone(S.islands);
      const isl = G.island(S, e.island);
      fx.pulses.push({ x: isl.x, y: isl.y, r: R, side: e.side, t0: performance.now() });
      if (seen.has(e.island) || e.side === 'blue' || e.prev === 'blue') { sfx.boom(); await wait(500); }
      updateHud();
    } else if (e.type === 'strike-abort') {
      // r7b: the target sailed away and nothing in range is left to hit: the planes turn back unspent
      events.push(e);
      if (e.side === 'blue') {
        toast(`${e.planes.map((q) => unitIcon(q.type, 30)).join('')}${icon('back', { size: 24 })}`, 1900); // r8g: no words
        await wait(700);
      }
    } else if (e.type === 'strike') {
      events.push(e);
      if (e.side === 'blue' && e.retargeted && e.retargeted.length) {
        // r7b: the fleet sailed on; the torpedo planes followed it to its new waters
        toast(`${e.retargeted.map((r) => unitIcon((G.plane(S, r.plane) || { type: 'torpedo' }).type, 30)).join('')}${icon('move', { size: 22 })}${toastImg('ship')}<span class="t-sm">${G.island(S, e.to).name}</span>`, 1600);
      }
      if (e.side === 'blue' || seen.has(e.to)) {
        const dur = 1400 / Math.max(1, speed / 3);
        fx.strike = { e, t0: performance.now(), dur };
        sfx.alarm();
        await wait(1400 * speed / Math.max(1, speed / 3));
        fx.strike = null;
        const isl = vIsl(e.to), foe = G.other(e.side);
        e.hits.forEach((h, i) => {
          const x = h.sec ? secPos(isl, vSec(e.to, h.sec)) : { x: isl.x + (i % 3 - 1) * 40, y: isl.y + R * 0.2 };
          fx.flashes.push({ x: x.x, y: x.y, t0: performance.now() });
          if (h.kind !== 'miss') fx.marks.push({ x: x.x, y: x.y - 40, type: h.kind === 'ship' ? h.ship : h.kind === 'fort' ? 'fort' : ((e.lost && e.lost[foe] && e.lost[foe][0]) || { type: 'inf' }).type, side: foe, t0: performance.now() });
        });
        e.flights.filter((f) => f.lost).forEach((f) => fx.marks.push({ x: isl.x, y: isl.y - R * 0.9, type: f.type, side: e.side, t0: performance.now() }));
        if (e.hits.some((h) => h.kind !== 'miss')) sfx.boom();
        view = snapshotView(); updateHud();
        await wait(700);
      } else view = snapshotView();
    } else if (e.type === 'recon') {
      // r8g3: the queued recon flights fly now; what they see stays known (state.js s.known)
      events.push(e);
      const mine = e.flights.filter((f) => f.side === 'blue');
      for (const f of mine) {
        const isl = G.island(S, f.to);
        sfx.alarm();
        fx.flight = { a: { x: f.from.x, y: f.from.y }, b: { x: isl.x, y: isl.y }, t0: performance.now(), dur: 1100 / Math.max(1, speed / 3) };
        await wait(1100 * speed / Math.max(1, speed / 3));
        fx.flight = null;
      }
      if (mine.length) { view = snapshotView(); refreshFog(true); updateHud(); sfx.pew(); await wait(400); }
    } else if (e.type === 'air') {
      // r8g: planes up last week came down (or were lost with nowhere to land); ordered planes went up
      events.push(e);
      const dn = e.landed.filter((m) => m.side === 'blue'), lost = e.lost.filter((m) => m.side === 'blue'), up = e.up.filter((m) => m.side === 'blue');
      if (dn.length || lost.length || up.length) {
        toast(`${up.map((m) => `${unitIcon(m.type, 28)}<i class="t-up"></i>`).join('')}${dn.map((m) => `${unitIcon(m.type, 28)}${icon('back', { size: 20, className: 'sc-ico flip' })}${m.to.fleet ? unitIcon('cv', 28) : toastImg('air')}`).join('')}${lost.map((m) => `${unitIcon(m.type, 28)}${icon('x', { size: 24 })}`).join('')}`, 1500);
        view = snapshotView(); refreshFog(false); updateHud();
        await wait(500);
      }
    } else if (e.type === 'rebase') {
      events.push(e);
      const mv = e.moved.filter((m) => m.side === 'blue'), lost = e.lost.filter((m) => m.side === 'blue');
      if (mv.length || lost.length) {
        toast(`${mv.map((m) => `${unitIcon(m.type, 28)}${icon('back', { size: 20, className: 'sc-ico flip' })}${m.to.fleet ? unitIcon('cv', 28) : toastImg('air')}`).join('')}${lost.map((m) => `${unitIcon(m.type, 28)}${icon('x', { size: 24 })}`).join('')}`, 1800);
        await wait(600);
      }
    } else if (e.type === 'reinforce') {
      events.push(e);
      if (e.side === 'blue' || seen.has(e.island)) fx.pops.push({ ...e, t0: performance.now() });
    } else events.push(e);
  }
  lastEvents = events;
  // camera back to where the player was, then the new week
  if (Math.abs(cam.z - camBefore.z) > 0.01 || Math.hypot(cam.x - camBefore.x, cam.y - camBefore.y) > 4) {
    const c0 = { x: cam.x, y: cam.y, z: cam.z };
    await tween(450, (k) => { const e = ease(k); cam.z = c0.z + (camBefore.z - c0.z) * e; cam.x = c0.x + (camBefore.x - c0.x) * e; cam.y = c0.y + (camBefore.y - c0.y) * e; clampCam(); });
  }
  view = snapshotView();
  refreshFog(true);
  fx.stayArrows = null;
  setBanner(S.week, true);
  busy = false;
  if (hintStep === 'wait') advanceHint(nextHint === 'unit2' && S.units.some((u) => u.side === 'blue' && u.aboard) ? 'unit2' : 'done');
  updateHud(); refreshHint();
  showReport(events, seenBefore);
  if (S.over) { await wait(900); showEnd(); }
  return events;
}

// ---------- week report: every fight Blue saw, who won, and which companies / ships each side lost ----------
let reportData = [];
function showReport(events, seenBefore) {
  const fights = events.filter((e) => (e.type === 'landing' || e.type === 'naval' || e.type === 'strike') && e.lost)
    .map((e) => {
      if (e.type === 'strike') {
        const foe = G.other(e.side), down = e.flights.filter((f) => f.lost).map((f) => ({ type: f.type, plane: true }));
        const own = { [e.side]: down, [foe]: e.lost[foe] };
        const visible = e.side === 'blue' || seen.has(e.to) || seenBefore.has(e.to);
        return { island: e.to, name: G.island(S, e.to).name, kind: 'strike', plane: (e.flights[0] || { type: 'bomber' }).type, winner: e.hits.some((h) => h.kind !== 'miss') ? e.side : foe, blue: own.blue, red: visible ? own.red : [], blueIn: e.side === 'blue' || own.blue.length > 0, visible };
      }
      const blueIn = e.type === 'naval' ? true : e.side === 'blue' || e.prevOwner === 'blue' || e.lost.blue.length > 0;
      const visible = blueIn || seen.has(e.island) || seenBefore.has(e.island);
      const winner = e.type === 'naval' ? e.winner : (e.won ? e.side : G.other(e.side));
      return { island: e.island, name: G.island(S, e.island).name, kind: e.type === 'naval' ? 'naval' : e.secKind, winner, blue: e.lost.blue, red: visible ? e.lost.red : [], blueIn, visible };
    })
    .filter((f) => f.visible && (f.blue.length || f.red.length))
    .sort((a, b) => Number(b.blueIn) - Number(a.blueIn)).slice(0, 4);
  reportData = fights;
  const r = $('report');
  if (!fights.length) { r.hidden = true; return; }
  // one struck icon per company / ship type lost, with a count when more than one went
  const group = (list) => Object.entries(list.reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {}));
  const lostHtml = (side, list) => (list.length ? `<span class="lost ${side}" data-n="${list.length}"><canvas class="rf" data-side="${side}" width="30" height="20"></canvas>${group(list)
    .map(([t, n]) => `<span class="x" data-t="${t}" data-n="${n}" title="${UNIT_NAMES[t]}">${unitIcon(t, 24)}</span>${n > 1 ? `<small>${n}</small>` : ''}`).join('')}</span>` : '');
  r.innerHTML = fights.map((f) => `<div class="rep-row"><canvas class="rk" data-kind="${f.kind}"${f.plane ? ` data-plane="${f.plane}"` : ''} width="56" height="56"></canvas><b>${f.name}</b>
    <canvas class="rw" data-side="${f.winner || ''}" width="30" height="20"></canvas>${lostHtml('blue', f.blue)}${lostHtml('red', f.red)}</div>`).join('');
  r.querySelectorAll('canvas.rk').forEach((c) => { const q = c.getContext('2d'); if (c.dataset.kind === 'naval') shipSide(q, 28, 30, 44, '#e6ebf0'); else if (c.dataset.plane) unitGlyph(q, c.dataset.plane, 28, 28, 44, '#e6ebf0', 2.4); else secIcon(q, c.dataset.kind, 28, 28, 44, '#e6ebf0'); });
  r.querySelectorAll('canvas.rw, canvas.rf').forEach((c) => { if (c.dataset.side) drawFlag(c.getContext('2d'), c.dataset.side, 1, 1, 28, 18); });
  r.style.width = '';
  r.hidden = false;
  // wrapped flex rows keep their one-line width; shrink the card to the real right edge
  const box = r.getBoundingClientRect();
  let right = 0;
  r.querySelectorAll('.rep-row > *').forEach((el) => { right = Math.max(right, el.getBoundingClientRect().right); });
  if (right > 0 && right < box.right - 12) r.style.width = `${Math.ceil(right - box.left + 11)}px`;
  clearTimeout(showReport.h); showReport.h = setTimeout(() => { r.hidden = true; }, 7000 / Math.max(1, speed));
}

// ---------- end card (adapted from parts-library battle-endcard) ----------
function showEnd() {
  const win = S.over.winner === 'blue';
  const st = S.stats;
  const owned = S.islands.filter((i) => i.owner === 'blue').length;
  const stat = (ic, val, lab) => `<div class="ec-stat">${ic}<b>${val}</b><small>${lab}</small></div>`;
  $('endcard').innerHTML = `
    <h1 class="ec-title ${win ? 'win' : 'lose'}">${win ? 'VICTORY' : 'DEFEAT'}</h1>
    <canvas class="ec-flag" id="ec-flag" width="180" height="120"></canvas>
    <div class="ec-grid">
      ${stat(icon('flag', { size: 24 }), S.over.week, 'WEEKS')}
      ${stat(icon('planet', { size: 24 }), `${owned}/${S.islands.length}`, 'ISLANDS')}
      ${stat(icon('anchor', { size: 24 }), `${st.navalWon}/${st.navalFought}`, 'SEA')}
      ${stat(icon('swords', { size: 24 }), `${st.landWon}/${st.landFought}`, 'LAND')}
      ${stat(icon('users', { size: 24 }), st.coLost ? st.coLost.blue : st.lost.blue + st.sunk.blue, 'LOST')}
    </div>
    <button class="btn primary big" id="b-again" aria-label="Play again">${icon('refresh', { size: 26 })}<span class="lb">AGAIN</span></button>`;
  drawFlag($('ec-flag').getContext('2d'), S.over.winner, 2, 2, 176, 116);
  $('end').hidden = false;
  $('b-again').onclick = () => { newGame(); refreshHint(); };
  if (win) sfx.alarm(); else sfx.boom();
}

// ---------- help legend ----------
function buildLegend() {
  const rows = [
    ['army', 'ARMY', 'takes sections'], ['fleet', 'FLEET', 'sea fights'], ['beach', 'BEACH', 'land here first'],
    ['secs', 'SECTIONS', 'take all to win the island'], ['supply', 'DEPOT', '+ troops each week'],
    ['air', 'AIRFIELD', 'bases 4 planes'], ['fog', 'FOG', 'fly recon to see'], ['home', 'HQ', 'take theirs to win'],
    ['lift', 'SEALIFT', 'beach, ship, beach: 2 armies a fleet'], ['cv', 'CARRIER', '2 planes a carrier, they sail with it'],
    ['recon', 'RECON', 'scouts an island'], ['fighter', 'FIGHTER', 'escorts, shoots down planes'],
    ['bomber', 'BOMBER', 'hits troops and forts'], ['torpedo', 'TORPEDO', 'sinks ships'],
  ];
  $('legend').innerHTML = rows.map(([k, a, b]) => `<canvas data-k="${k}" width="200" height="80"></canvas><div>${a}<small>${b}</small></div>`).join('');
  $('legend').querySelectorAll('canvas').forEach((c) => {
    const k = c.dataset.k, q = c.getContext('2d');
    q.scale(2, 2);
    if (k === 'army' || k === 'fleet') { q.translate(58, 20); drawTag({ side: 'blue', kind: k, str: 4, cmd: k === 'army' ? 1 : 3, id: 'x' }, 0, 0, 1, 1, q); return; }
    if (k === 'fog') { q.translate(58, 20); drawTag({ side: 'red', kind: 'army', unknown: true, id: 'q' }, 0, 0, 1, 1, q); return; }
    if (k === 'secs') {
      const cols = ['#2c5aa8', '#2c5aa8', '#b3201f', '#8a8f96'];
      q.lineWidth = 5; cols.forEach((cl, i) => { q.strokeStyle = cl; q.beginPath(); q.arc(50, 20, 15, i * Math.PI / 2 + 0.12, (i + 1) * Math.PI / 2 - 0.12); q.stroke(); });
      return;
    }
    if (['recon', 'fighter', 'bomber', 'torpedo'].includes(k)) { planeMini(q, k, 50, 20, 32, 'blue'); return; }
    if (k === 'lift') {
      for (const [x, d] of [[16, 'beach'], [84, 'beach']]) { q.fillStyle = '#12161c'; q.beginPath(); q.arc(x, 20, 14, 0, 7); q.fill(); q.lineWidth = 2.5; q.strokeStyle = SIDE_COL.blue.fill; q.stroke(); secIcon(q, d, x, 20, 19, '#e6ebf0'); }
      shipSide(q, 50, 22, 30, '#e6ebf0'); q.fillStyle = '#e6ebf0'; q.beginPath(); q.moveTo(33, 16); q.lineTo(37, 20); q.lineTo(33, 24); q.fill(); q.beginPath(); q.moveTo(67, 16); q.lineTo(71, 20); q.lineTo(67, 24); q.fill();
      return;
    }
    if (k === 'cv') { q.fillStyle = '#12161c'; q.beginPath(); q.arc(36, 20, 17, 0, 7); q.fill(); q.lineWidth = 3; q.strokeStyle = SIDE_COL.blue.fill; q.stroke(); unitGlyph(q, 'cv', 36, 20, 26, '#e6ebf0', 2.2); planeMini(q, 'fighter', 66, 20, 20, 'blue'); planeMini(q, 'torpedo', 86, 20, 20, 'blue'); return; }
    q.fillStyle = '#12161c'; q.beginPath(); q.arc(50, 20, 17, 0, 7); q.fill(); q.lineWidth = 3; q.strokeStyle = SIDE_COL.blue.fill; q.stroke();
    const kind = { beach: 'beach', supply: 'depot', air: 'air', home: 'hq' }[k];
    secIcon(q, kind, 50, 20, 24, '#e6ebf0');
  });
}
// ---------- boot ----------
function startPlay() {
  if (!terrain) return;
  $('title').hidden = true; sfx.unlock(); refreshHint();
}
function icons() {
  $('b-restart').innerHTML = icon('refresh', { size: 24 });
  $('b-help').innerHTML = icon('help', { size: 24 });
  $('b-sound').innerHTML = icon('volume', { size: 24 });
  $('z-in').innerHTML = icon('plus', { size: 24 });
  $('z-out').innerHTML = icon('minus', { size: 24 });
  $('z-fit').innerHTML = icon('fit', { size: 24 });
  $('sel-x').innerHTML = icon('x', { size: 24 });
  $('sel-z').innerHTML = icon('zoom', { size: 24 });
  $('b-retreat').querySelector('.i').innerHTML = icon('back', { size: 26 });
  $('nv-amb').innerHTML = icon('crosshair', { size: 28 });
  $('b-end').querySelector('.i').innerHTML = icon('skip', { size: 26 });
  $('b-play').querySelector('.i').innerHTML = icon('play', { size: 28 });
  $('help-ok').querySelector('.i').innerHTML = icon('check', { size: 24 });
  drawFlag($('c-blue').querySelector('canvas').getContext('2d'), 'blue', 1, 1, 34, 22);
  drawFlag($('c-red').querySelector('canvas').getContext('2d'), 'red', 1, 1, 34, 22);
  drawFlag($('t-fb').getContext('2d'), 'blue', 1, 1, 70, 46);
  drawFlag($('t-fr').getContext('2d'), 'red', 1, 1, 70, 46);
  drawFlag($('nv-fb').getContext('2d'), 'blue', 1, 1, 46, 30);
  drawFlag($('nv-fr').getContext('2d'), 'red', 1, 1, 46, 30);
}
function hudRects() {
  return ['#tl', '#tr', '#banner .wk', '#zoom', '#b-end', '#sel', '#strip'].map((s) => {
    const e = document.querySelector(s);
    if (!e || e.hidden || !e.offsetParent) return null;
    const b = e.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  }).filter(Boolean);
}
function nameAnchor(isl) {
  if (nameAbove === isl.id) return { x: isl.x, y: isl.y - R - 28, base: 'bottom' };
  return { x: isl.x, y: isl.y + R + 10, base: 'top' };
}
function nameBox(id) {
  const i = G.island(S, id), a = nameAnchor(i), p = toScreen(a.x, a.y);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif';
  const w = g.measureText(i.name).width * cam.z, h = 26 * cam.z; g.restore();
  return a.base === 'bottom'
    ? { left: p.x - w / 2, right: p.x + w / 2, top: p.y - h, bottom: p.y, name: i.name }
    : { left: p.x - w / 2, right: p.x + w / 2, top: p.y, bottom: p.y + h, name: i.name };
}
function sectionBox(islId, secId) {
  const x = G.section(G.island(S, islId), secId); const p = toScreen(x.x, x.y); const r = SEC_R * cam.z;
  return { left: p.x - r, right: p.x + r, top: p.y - r, bottom: p.y + r + 16 * cam.z, id: secId };
}
function islandBoxes(isl) {
  const badge = toScreen(isl.x, isl.y - R), br = 21 * cam.z;
  return [nameBox(isl.id), { left: badge.x - br, right: badge.x + br, top: badge.y - br, bottom: badge.y + br }, ...isl.secs.map((x) => sectionBox(isl.id, x.id))];
}
function overlapAmt(a, b) {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return (x > 0 && y > 0) ? { x, y } : null;
}
function placeIsland(isl, zWant) {
  const pad = 6;
  let z = zWant;
  nameAbove = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    cam.z = z; cam.x = isl.x; cam.y = isl.y; clampCam();
    const hud = hudRects();
    let ok = false;
    for (let step = 0; step < 60; step++) {
      let dx = 0, dy = 0, hit = 0;
      for (const box of islandBoxes(isl)) {
        for (const h of hud) {
          const o = overlapAmt(box, h);
          if (!o) continue;
          hit++;
          const bx = (box.left + box.right) / 2, by = (box.top + box.bottom) / 2;
          const hx = (h.left + h.right) / 2, hy = (h.top + h.bottom) / 2;
          if (o.x <= o.y) dx += (bx < hx ? -(o.x + pad) : o.x + pad);
          else dy += (by < hy ? -(o.y + pad) : o.y + pad);
        }
        if (box.left < pad) dx += pad - box.left;
        if (box.top < pad) dy += pad - box.top;
        if (box.right > vw - pad) dx -= box.right - (vw - pad);
        if (box.bottom > vh - pad) dy -= box.bottom - (vh - pad);
      }
      if (!hit && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) { ok = true; break; }
      cam.x -= dx / cam.z; cam.y -= dy / cam.z;
      const before = { x: cam.x, y: cam.y };
      clampCam();
      if (hit && Math.hypot(cam.x - before.x, cam.y - before.y) > 0.5) break;
    }
    if (ok) return { x: cam.x, y: cam.y, z: cam.z };
    if (nameAbove !== isl.id) { nameAbove = isl.id; continue; }
    nameAbove = null;
    z = Math.max(0.82, z * 0.88);
  }
  return { x: cam.x, y: cam.y, z: cam.z };
}
function zoomToIsland(id, z) {
  const i = G.island(S, id);
  z = z || Math.min(zRef() * 2.2, Math.min(1.6, Math.max(0.95, Math.min(vw / (i.rx * 1.8 + 100), (vh - 150) / (i.ry * 1.8 + 140))))); // r8f: a mid zoom of the same map
  const saved = { x: cam.x, y: cam.y, z: cam.z };
  const t = placeIsland(i, z);
  cam.x = saved.x; cam.y = saved.y; cam.z = saved.z;
  const c0 = { ...saved };
  return tween(500, (k) => {
    const e = ease(k);
    cam.z = c0.z + (t.z - c0.z) * e;
    cam.x = c0.x + (t.x - c0.x) * e;
    cam.y = c0.y + (t.y - c0.y) * e;
    clampCam();
  }).then(updateHud);
}
function wire() {
  $('b-play').onclick = startPlay;
  $('b-end').onclick = () => doEndWeek();
  $('air').onclick = (e) => { const b = e.target.closest('.pl'); if (b) pickPlane(b.dataset.p); };
  $('strip').onclick = (e) => {
    if (busy || !strip) return;
    // r8g ask 3: back to level 1 / open an air wing / open an enemy group (and pick its kind so your counters glow)
    if (e.target.closest('[data-back]')) { strip.grp = null; sel = null; planeSel = null; reconMode = false; sfx.pew(); updateHud(); return; }
    const ga = e.target.closest('[data-ga]');
    if (ga) { strip.grp = { k: 'air', key: ga.dataset.ga }; sel = null; planeSel = null; reconMode = false; sfx.pew(); updateHud(); keepAboveStrip(strip.isl); return; }
    const fg = e.target.closest('.sc.foe[data-g]:not(.head)');
    if (fg) { if (fg.dataset.key) foeSel = fg.dataset.key; strip.grp = { k: 'u', id: fg.dataset.g }; sfx.pew(); updateHud(); return; }
    // r8b: tap an enemy card = pick its kind; your cards / tokens / tray planes that beat it glow, the ones it beats dim
    const f = e.target.closest('.sc.foe[data-key]');
    if (f) { foeSel = foeSel === f.dataset.key ? null : f.dataset.key; sfx.pew(); updateHud(); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'st-x') { strip = null; foeSel = null; sel = null; planeSel = null; reconMode = false; updateHud(); return; }
    if (b.dataset.p) { pickPlane(b.dataset.p); return; }
    if (b.dataset.g && !b.classList.contains('head')) { strip.grp = { k: 'u', id: b.dataset.g }; select(b.dataset.g); if (strip) keepAboveStrip(strip.isl); return; }
    if (b.classList.contains('head')) return;
    if (b.dataset.u) select(b.dataset.u === sel ? null : b.dataset.u);
  };
  wireDrag();
  $('b-restart').onclick = () => { if (!busy) { newGame(); refreshHint(); } };
  $('b-help').onclick = () => { $('help').hidden = false; };
  $('c-blue').onclick = () => toggleHoldings();
  $('c-red').onclick = () => toggleHoldings();
  $('sel-oob').onclick = (e) => { const c = e.target.closest('.co'); if (c) toast(`${unitIcon(c.dataset.t, 28)}<span>${UNIT_NAMES[c.dataset.t]}</span>`, 900); };
  $('help-ok').onclick = () => { $('help').hidden = true; };
  $('help').onclick = (e) => { if (e.target === $('help')) $('help').hidden = true; };
  $('b-sound').onclick = () => { sfx.setMuted(!sfx.muted); $('b-sound').innerHTML = icon(sfx.muted ? 'mute' : 'volume', { size: 24 }); };
  $('z-in').onclick = () => zoomAt(vw / 2, vh / 2, 1.3);
  $('z-out').onclick = () => zoomAt(vw / 2, vh / 2, 1 / 1.3);
  $('z-fit').onclick = () => { cam.z = contain(); cam.x = WW / 2; cam.y = WH / 2; clampCam(); updateHud(); };
  $('sel-x').onclick = () => { if (sel) { const u = G.unit(S, sel); G.issueOrder(S, sel, u.at); updateHud(); } };
  $('sel-z').onclick = () => {
    const u = sel && G.unit(S, sel); if (!u) return;
    if (cam.z > zRef() * 1.6) { const c0 = { ...cam }, z1 = zRef(); tween(400, (k) => { cam.z = c0.z + (z1 - c0.z) * ease(k); clampCam(); }).then(updateHud); } // r8f: in / out only, same look
    else zoomToIsland(u.at);
  };
  window.addEventListener('resize', resize);
}
async function loadTerrain() {
  terrainScale = Math.min(vw, vh) < 500 ? 0.6 : 0.75;
  const apply = (t) => {
    const c = document.createElement('canvas'); c.width = t.w; c.height = t.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(t.data), t.w, t.h), 0, 0);
    terrain = c; terrainPx = { w: t.w, h: t.h, d: new Uint8ClampedArray(t.data) }; $('loading').classList.add('done'); $('b-play').disabled = false;
  };
  try {
    const wk = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' });
    await new Promise((res, rej) => {
      wk.onmessage = (e) => { apply(e.data); wk.terminate(); res(); };
      wk.onerror = (e) => { e.preventDefault(); rej(e); };
      wk.postMessage({ islands: G.ISLANDS, W: WW, H: WH, scale: terrainScale });
    });
  } catch (_) {
    apply(computeTerrain(G.ISLANDS, WW, WH, terrainScale));
  }
}

resize();
icons(); wire();
newGame(params.has('seed') ? +params.get('seed') : undefined);
buildLegend();
$('b-play').disabled = true;
requestAnimationFrame(frame);
loadTerrain().then(() => { if (params.has('autostart')) startPlay(); });

// test + QA hooks (read-mostly)
window.__PW__ = {
  get S() { return S; }, get view() { return view; }, get busy() { return busy; }, get sel() { return sel; }, cam, G, errors,
  get terrainReady() { return !!terrain; }, get lastEvents() { return lastEvents; }, get seen() { return [...seen]; }, reveals,
  get board() { return board; }, drawnTags: (id) => unitsAtView(id).map((u) => u.id), get reconMode() { return reconMode; }, get secK() { return secK(); },
  setSpeed(n) { speed = n; }, newGame(seed) { newGame(seed); refreshHint(); },
  select(id) { select(id); }, order(id, to, sec) { const ok = G.issueOrder(S, id, to, sec); updateHud(); return ok; },
  secOrder(id, sec) { const ok = G.issueSecOrder(S, id, sec); updateHud(); return ok; },
  refresh() { view = snapshotView(); refreshFog(false); updateHud(); },
  recon(id, pid) { const p = pid || (S.planes.find((q) => q.side === 'blue' && G.canRecon(S, q.id, id)) || {}).id; const ok = !!p && G.issueRecon(S, p, id); updateHud(); return ok; }, // r8g3: queues the order
  get reconOrd() { return { ...(S.reconOrd || {}) }; },
  // test setup only: put an army aboard a friendly ship at its island (moving one there if needed), sail to `to`, land on `sec`
  seaLift(id, to, sec) {
    const u = G.unit(S, id);
    let f = S.units.find((x) => x.side === u.side && x.kind === 'fleet' && x.at === u.at);
    if (!f) { f = S.units.find((x) => x.side === u.side && x.kind === 'fleet'); f.at = u.at; }
    u.aboard = f.id; u.sec = null;
    if (to !== u.at && !G.issueOrder(S, f.id, to)) return false;
    const ok = G.issueLand(S, id, sec || G.landingBeach(S, u, G.island(S, to)));
    view = snapshotView(); updateHud(); return ok;
  },
  embark(id, fid) { const ok = G.issueEmbark(S, id, fid); updateHud(); return ok; },
  land(id, sec) { const ok = G.issueLand(S, id, sec); updateHud(); return ok; },
  strike(pid, to, sec) { const ok = G.issueStrike(S, pid, to, sec || null); updateHud(); return ok; },
  openAir(v = true) { airOpen = v; planeSel = null; reconMode = false; sel = null; updateHud(); },
  get planeSel() { return planeSel; }, get airOpen() { return airOpen; }, get hintStep() { return hintStep; },
  markerScreen(id, sec) { const i = vIsl(id), x = vSec(id, sec), p = secPos(i, x); const c = toScreen(p.x, p.y); return { ...c, r: p.r * cam.z }; },
  endWeek: (opts) => doEndWeek(opts),
  tokenRect(id) {
    const u = view.units.find((x) => x.id === id); if (!u) return null;
    const p = slot(u.at, u), b = tagBounds(p.x, p.y, p.s), isl = vIsl(u.at);
    return { ...b, cx: isl.x, cy: isl.y, r: R, screen: toScreen(p.x, p.y), islandScreen: toScreen(isl.x, isl.y) };
  },
  tagScreen(id) {
    const u = view.units.find((x) => x.id === id); if (!u) return null;
    if (useBlocks()) { const b = blockAt(u); return toScreen(b.x0 + b.w / 2, b.y0 + b.h / 2); }
    const p = tagPos(u); return toScreen(p.x, p.y);
  },
  // r6 QA: battalion / company tags drawn in the island view, in screen px
  blockTags(islId) {
    if (!useBlocks()) return [];
    cardCache = null; labelCache = null;
    return unitsAtView(islId).filter((u) => !u.unknown).map((u) => {
      const b = blockAt(u), a = toScreen(b.x0, b.y0), sec = vSec(islId, b.sec);
      return { id: u.id, side: u.side, kind: u.kind, sec: b.sec, close: b.close, rows: b.rows.length, cells: b.rows.map((r) => r.cells.length),
        left: a.x, top: a.y, right: a.x + b.w * cam.z, bottom: a.y + b.h * cam.z, secScreen: sec ? toScreen(sec.x, sec.y) : null, rowPx: b.rh * b.px, cellPx: b.cw * b.px, z: cam.z, nudged: !!b.nudged };
    });
  },
  islandScreen(id) { const i = G.island(S, id); return toScreen(i.x, i.y); },
  seaIslandAt(sx, sy) { const w = toWorld(sx, sy); if (!seaAt(w.x, w.y)) return null; const i = seaIsland(w.x, w.y); return i ? i.id : null; }, // read-only (r8g3 play: where open sea is)
  sectionScreen(id, sec) { const i = G.island(S, id), x = G.section(i, sec), p = secPos(i, x); return toScreen(p.x, p.y); },
  focus(id, z) { const i = G.island(S, id); cam.x = i.x; cam.y = i.y; if (z) cam.z = z; clampCam(); updateHud(); },
  labels(id) { cardCache = null; labelCache = null; const l = labelLayout().get(id); return l ? { name: { ...l.name }, badge: { ...l.badge } } : null; },
  cardCols() { cardCache = null; labelCache = null; return (cardLayout().cols || []).map((c) => ({ ...c })); },
  zoomToIsland, nameBox, sectionBox, holdings, toggleHoldings, get report() { return reportData; }, keepClear,
  showEnd,
  // r7b QA
  planeMarks: () => planeMarks.map((m) => ({ ...m })),
  homeFrame(id = 'kestra') { const e = islandExtent(G.island(S, id)), a = toScreen(e.l, e.t), b = toScreen(e.r, e.b), n = nameBox(id);
    return { left: Math.min(a.x, n.left), top: Math.min(a.y, n.top), right: Math.max(b.x, n.right), bottom: Math.max(b.y, n.bottom), vw, vh, z: cam.z }; },
  get warn() { return warnPending ? { ...warnPending } : null; },
  tapLand(id, tid) { select(id); const p = this.islandScreen(tid); tapAt(p.x, p.y); },
  // r8 QA
  tokens() { tokCache = null; return placeTokens().map((t) => { const p = toScreen(t.x, t.y); return { kind: t.kind, isl: t.isl, side: t.side, own: t.own || null, sec: t.sec || null, secKind: t.secKind || null, show: t.show || null, next: t.next || 0, count: t.count, units: t.units || [], planes: t.planes || [], fleets: t.fleets || [], x: p.x, y: p.y, r: t.r * cam.z, unknown: !!t.unknown, fort: !!t.fort, numSide: t.numSide || null, up: (t.up || []).length, upSide: t.upSide || null, gar: t.gar || 0 }; }); },
  seaAt(x, y) { return seaAt(x, y); },
  zone(isl, sec) { return this.tokens().find((t) => t.kind === 'zone' && t.isl === isl && t.sec === sec) || null; },
  fleetMove(id, to, sec) { const ok = G.issueFleetMove(S, id, to, sec); updateHud(); return ok; },
  get strip() { return strip ? { ...strip } : null; }, get scout() { return fx.scout ? { ...fx.scout } : null; },
  get strat() { return strat(); }, get zMax() { return zMax(); }, get homeZ() { return homeZ; },
  pickPlane(pid) { pickPlane(pid); },
  // r8g QA
  get lastHop() { return lastHop ? { ...lastHop } : null; }, get hopFx() { return !!fx.hop; },
  get lastRefused() { return lastRefused ? { ...lastRefused } : null; }, zoneSeen: (isl, sec) => zKnown(isl, sec), get zseen() { return [...zseen]; },
  fly(pid, isl, sec) { const ok = G.issueFly(S, pid, isl, sec || null); updateHud(); return ok; },
  planeLand(pid, base) { const ok = G.issuePlaneLand(S, pid, base); updateHud(); return ok; },
  openPlaneHome(pid) { const p = G.plane(S, pid); if (p) openPlaneHome(p); },
  drill(grp) { if (strip) { strip.grp = grp; updateHud(); } },
  // QA count: map tokens whose centre is on screen (the map draws nothing else per unit / plane / section at map zoom)
  mapMarkers() { tokCache = null; const on = (x, y) => x >= 0 && y >= 0 && x <= vw && y <= vh; return placeTokens().filter((t) => { const p = toScreen(t.x, t.y); return on(p.x, p.y); }).length; },
  fitHome() { fitCamera(true); },
  // r8b QA
  nextArrivals: () => clone(nextArrivals()), get foeSel() { return foeSel; }, setFoe(k) { foeSel = k; updateHud(); },
  get lastReassign() { return lastReassign; }, get dragging() { return !!(drag && drag.on); },
  reassign(id, to) { const ok = G.reassignCmd(S, id, to); view = snapshotView(); updateHud(); return ok; },
  stripCards() { return [...document.querySelectorAll('#strip .st-cards .sc')].map((e) => { const r = e.getBoundingClientRect(); return { g: e.dataset.g || null, ga: e.dataset.ga || null, u: e.dataset.u || null, p: e.dataset.p || null, n: e.dataset.n || null, t: e.dataset.t || null, key: e.dataset.key || null, cmd: e.dataset.cmd != null ? +e.dataset.cmd : null,
    foe: e.classList.contains('foe'), beat: e.classList.contains('beat'), risk: e.classList.contains('risk'), next: e.classList.contains('next'), up: (e.querySelector('.mu.up') || {}).dataset?.k || '', dn: (e.querySelector('.mu.dn') || {}).dataset?.k || '', x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }); },
  airChips() { return [...document.querySelectorAll('#air .pl')].map((e) => ({ p: e.dataset.p, t: e.dataset.t, beat: e.classList.contains('beat'), risk: e.classList.contains('risk') })); },
  zones: () => zoneLog.map((z) => ({ ...z })), get SIDE_COL() { return SIDE_COL; }, secHex,
  tokenBeats() { tokCache = null; return placeTokens().filter((t) => !t.ghost && tokenBeats(t)).map((t) => tokKey(t)); },
};
