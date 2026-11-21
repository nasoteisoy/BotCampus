import * as G from './state.js';
import { SIDE_COL, drawFlag, portrait, shipSide, armySymbol, planeTop, crateIcon, star, arrowCurve, curvePt, drawArrow, secIcon, unitGlyph } from './art.js';
import { icon, unitIcon, UNIT_NAMES } from './icons.js';
import { createSpaceAudio } from './audio.js';
import { computeTerrain } from './terrain.js';
import { openBoard } from './battle.js';

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
let seen = new Set(), reconMode = false, board = null, nameAbove = null;
let fx;
const resetFx = () => { fx = { moving: null, stayArrows: null, pops: [], pulses: [], reveals: {}, flight: null, flashes: [] }; };
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
  sel = null; busy = false; reconMode = false;
  resetFx();
  seen = G.vision(S, 'blue');
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
const zMax = 2.4;
function fitCamera(home) {
  const phone = Math.min(vw, vh) < 560;
  if (home && phone && vh > vw) {
    // portrait phone: Kestra and Oska both on screen (tags keep their r2 pixel size through tokenScale)
    cam.z = Math.min(0.46, vw / 1030); cam.x = 685; cam.y = WH / 2;
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
}
function clampCam() {
  cam.z = Math.max(zMin(), Math.min(zMax, cam.z));
  const hw = vw / cam.z / 2, hh = vh / cam.z / 2, m = 120;
  // while the drill-down panel is open the map may slide past the edge by the panel's size
  const p = panelPad, pl = p.left / cam.z, pb = p.bottom / cam.z;
  cam.x = hw * 2 >= WW + 2 * m + pl ? WW / 2 - pl / 2 : Math.max(hw - m - pl, Math.min(WW - hw + m, cam.x));
  cam.y = hh * 2 >= WH + 2 * m + pb ? WH / 2 + pb / 2 : Math.max(hh - m, Math.min(WH - hh + m + pb, cam.y));
}
let panelPad = { left: 0, bottom: 0 };
function measurePanel() {
  const e = $('sel');
  if (!e || e.hidden) { panelPad = { left: 0, bottom: 0 }; return; }
  const r = e.getBoundingClientRect();
  const leftDock = r.left < vw * 0.2 && r.right < vw * 0.6;
  panelPad = leftDock ? { left: r.right + 8, bottom: 0 } : { left: 0, bottom: vh - r.top + 8 };
}
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + vw / 2, y: (y - cam.y) * cam.z + vh / 2 });
const toWorld = (x, y) => ({ x: (x - vw / 2) / cam.z + cam.x, y: (y - vh / 2) / cam.z + cam.y });
// 0 = strategic map, 1 = island view with sections
const secK = () => Math.max(0, Math.min(1, (cam.z - 0.62) / 0.28));

// ---------- fog ----------
function refreshFog(animate) {
  const now = G.vision(S, 'blue');
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
function unitsAtView(islId) {
  const list = view.units.filter((u) => u.at === islId && !(fx.moving && fx.moving.ids.has(u.id)) && (u.side === 'blue' || seen.has(islId)));
  if (!seen.has(islId) && view.units.some((u) => u.at === islId && u.side === 'red') && G.contact(S, 'blue', islId)) {
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
  const R = G.CIRCLE_R * 1.35; // corners may sit past the ring so tags stay readable at phone start zoom
  for (let sc = want; sc > 0.3; sc -= 0.02) {
    const b = tagBounds(7 * sc, 0, sc);
    const yMax = Math.max(Math.abs(-((n - 1) / 2) * 34 * sc + 8 + b.y0), Math.abs(((n - 1) / 2) * 34 * sc + 8 + b.y1));
    const xMax = Math.max(Math.abs(b.x0), Math.abs(b.x1));
    if (Math.hypot(xMax, yMax) <= R) return sc;
  }
  return 0.3;
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
  cardCache = null; labelCache = null;
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
  }
  if (fx.stayArrows) fx.stayArrows.forEach((m) => drawMoveArrow(m, 1, 0.85));
  if (fx.moving) fx.moving.list.forEach((m) => drawMoveArrow(m, fx.moving.t, 0.9));
  const blocks = useBlocks();
  if (blocks) drawLeaders();
  view.islands.forEach((isl) => unitsAtView(isl.id).forEach((u) => {
    if (blocks) { drawBlock(u, blockAt(u)); return; }
    const p = tagPos(u); drawTag(u, p.x, p.y, p.s);
  }));
  if (fx.moving) fx.moving.list.forEach((m) => {
    const u = view.units.find((x) => x.id === m.unit); if (!u) return;
    const t = Math.min(1, ease(fx.moving.t) * 0.98);
    let p;
    if (m.inland) { const a = vSec(m.from, m.fromSec), b = vSec(m.to, m.toSec); const s0 = ks > 0.5 ? SEC_S : tokenScale() * 0.6; p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: s0 }; }
    else { const c = curvePt(curveFor(m.from, m.to, m.kind), t); p = { ...c, s: tokenScale() }; }
    drawTag(u, p.x, p.y, p.s);
  });
  if (fx.flight) drawFlight(fx.flight);
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
function drawMoveArrow(m, t, alpha) {
  if (m.inland) drawSecArrow(m.from, m.fromSec, m.toSec, m.side, t, alpha);
  else drawArrowBetween(m.from, m.to, m.side, t, alpha, m.kind);
}
function targetRing(x, y, r, a = 1) {
  g.save(); g.globalAlpha = a; g.setLineDash([10, 7]); g.lineDashOffset = -tNow / 30; g.lineWidth = 4; g.strokeStyle = 'rgba(245,197,24,.95)';
  g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); g.restore();
}

const ownCol = (o) => (o ? SIDE_COL[o].fill : '#8a8f96');
function secAngles(isl) {
  // order sections around the centre so the owner ring reads like a pie of the island
  return isl.secs.map((x) => ({ x, a: Math.atan2(x.y - isl.y, x.x - isl.x) })).sort((p, q) => p.a - q.a);
}
function drawIsland(isl, ks) {
  const known = seen.has(isl.id);
  // under fog the owner stays hidden: neutral ring, badge and no flag
  const own = known ? isl.owner : null;
  const ringCol = ownCol(own);
  g.save();
  g.fillStyle = `rgba(8,12,16,${0.22 * (1 - ks * 0.5)})`;
  g.beginPath(); g.arc(isl.x, isl.y, R, 0, Math.PI * 2); g.fill();
  drawDecor(isl, ks);
  // segmented owner ring: one arc per section
  const segs = secAngles(isl), n = segs.length;
  g.globalAlpha = 0.9 * (1 - ks * 0.7);
  g.lineWidth = 9;
  segs.forEach((sg, i) => {
    const a0 = (sg.a + (segs[(i - 1 + n) % n].a + (i === 0 ? -Math.PI * 2 : 0))) / 2;
    const a1 = (sg.a + (segs[(i + 1) % n].a + (i === n - 1 ? Math.PI * 2 : 0))) / 2;
    g.strokeStyle = ownCol(known ? sg.x.owner : null); g.beginPath(); g.arc(isl.x, isl.y, R, a0 + 0.05, a1 - 0.05); g.stroke();
  });
  g.globalAlpha = 1 - ks * 0.6; g.lineWidth = 2.2; g.strokeStyle = 'rgba(255,255,255,.75)';
  g.beginPath(); g.arc(isl.x, isl.y, R - 6, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
  // reach highlight when a unit is selected
  if (sel && !busy) {
    const u = G.unit(S, sel);
    if (u && u.at !== isl.id && G.canOrder(S, u, isl.id)) {
      g.setLineDash([18, 12]); g.lineDashOffset = -tNow / 30; g.lineWidth = 5; g.strokeStyle = 'rgba(245,197,24,.95)';
      g.beginPath(); g.arc(isl.x, isl.y, R + 12, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
  }
  // type badge at the top of the ring
  const lab = labelLayout().get(isl.id);
  const bw = lab ? toWorld((lab.badge.left + lab.badge.right) / 2, (lab.badge.top + lab.badge.bottom) / 2) : { x: isl.x, y: isl.y - R };
  const bx = bw.x, by = bw.y;
  g.fillStyle = '#12161c'; g.beginPath(); g.arc(bx, by, 21, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3; g.strokeStyle = ringCol; g.stroke();
  if (isl.type === 'home') star(g, bx, by, 13, '#f2c43a');
  else if (isl.type === 'supply') crateIcon(g, bx, by, 24, '#e8dcb8');
  else if (isl.type === 'air') planeTop(g, bx, by, 30, '#e6ebf0', -Math.PI / 2);
  else { g.fillStyle = '#c8cdd4'; g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill(); }
  if (own) drawFlag(g, own, isl.x - R * 0.72 - 16, isl.y - R * 0.72 - 11, 32, 21);
  // strategic: hostile garrison as small forts (or '?') on the bottom of the ring
  if (ks < 1) {
    g.globalAlpha = 1 - ks;
    const hostile = isl.secs.filter((x) => x.owner !== 'blue');
    const gar = hostile.reduce((s, x) => s + x.gar, 0);
    if (hostile.length && !known) qBadge(isl.x, isl.y + R - 4, 15);
    else for (let i = 0; i < Math.min(6, gar); i++) fort(isl.x - (Math.min(6, gar) - 1) * 9 + i * 18, isl.y + R - 2, hostile[0] ? hostile[0].owner : null);
    g.globalAlpha = 1;
  }
  if (ks > 0) drawSections(isl, ks, known);
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
function drawSections(isl, ks, known) {
  const cur = sel && !busy ? G.unit(S, sel) : null;
  g.save(); g.globalAlpha = ks;
  // links
  g.setLineDash([6, 6]); g.lineWidth = 3; g.strokeStyle = 'rgba(235,238,240,.55)';
  for (const x of isl.secs) for (const l of x.links) if (l > x.id) { const y = isl.secs.find((q) => q.id === l); g.beginPath(); g.moveTo(x.x, x.y); g.lineTo(y.x, y.y); g.stroke(); }
  g.setLineDash([]);
  for (const x of isl.secs) {
    g.fillStyle = 'rgba(12,15,20,.88)'; g.beginPath(); g.arc(x.x, x.y, SEC_R, 0, 7); g.fill();
    g.lineWidth = 5; g.strokeStyle = known && x.owner ? ownCol(x.owner) : 'rgba(180,190,200,.5)'; g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(x.x, x.y, SEC_R - 4, 0, 7); g.stroke();
    secIcon(g, x.kind, x.x, x.y, SEC_R * 1.15, '#e6ebf0');
    // garrison under the marker
    if (x.owner !== 'blue' && x.gar > 0) {
      if (!known) qBadge(x.x, x.y + SEC_R + 6, 10);
      else for (let i = 0; i < x.gar; i++) fort(x.x - (x.gar - 1) * 9 + i * 18, x.y + SEC_R + 6, x.owner);
    } else if (x.owner !== 'blue' && !known) qBadge(x.x, x.y + SEC_R + 6, 10);
    // where the selected army can push
    if (cur && cur.kind === 'army' && cur.at === isl.id && G.canSecOrder(S, cur, x.id) && x.id !== cur.sec) targetRing(x.x, x.y, SEC_R + 8, ks);
    if (cur && cur.kind === 'army' && cur.at !== isl.id && x.kind === 'beach' && G.canOrder(S, cur, isl.id)) targetRing(x.x, x.y, SEC_R + 8, ks * 0.8);
  }
  g.restore();
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
function drawReconTargets() {
  const tg = G.reconTargets(S, 'blue');
  for (const id of tg) {
    const isl = vIsl(id);
    const p = 0.6 + 0.4 * Math.sin(tNow / 220);
    g.save(); g.globalAlpha = p; g.setLineDash([14, 10]); g.lineDashOffset = tNow / 25; g.lineWidth = 6; g.strokeStyle = '#e8f4ff';
    g.beginPath(); g.arc(isl.x, isl.y, R + 16, 0, 7); g.stroke(); g.setLineDash([]);
    g.lineWidth = 4; g.beginPath(); g.moveTo(isl.x - 26, isl.y); g.lineTo(isl.x + 26, isl.y); g.moveTo(isl.x, isl.y - 26); g.lineTo(isl.x, isl.y + 26); g.stroke();
    g.beginPath(); g.arc(isl.x, isl.y, 16, 0, 7); g.stroke();
    g.restore();
  }
  for (const s of G.reconSources(S, 'blue')) { g.save(); g.strokeStyle = 'rgba(232,244,255,.8)'; g.lineWidth = 4; g.beginPath(); g.arc(s.x, s.y, 40 + 6 * Math.sin(tNow / 200), 0, 7); g.stroke(); g.restore(); }
}
function drawFlight(f) {
  const k = Math.min(1, (tNow - f.t0) / f.dur);
  const cv = arrowCurve(f.a, f.b, 0.18);
  g.save();
  g.setLineDash([12, 12]); g.lineWidth = 4; g.strokeStyle = 'rgba(235,242,250,.55)';
  g.beginPath(); for (let i = 0; i <= 30; i++) { const p = curvePt(cv, (i / 30) * k); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } g.stroke(); g.setLineDash([]);
  const p = curvePt(cv, k), q = curvePt(cv, Math.min(1, k + 0.02));
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 10;
  planeTop(g, p.x, p.y, 92, '#f2f5f8', Math.atan2(q.y - p.y, q.x - p.x));
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
  c.restore();
}

function drawPop(p) {
  const k = Math.max(0, Math.min(1, (tNow - p.t0) / (1600 / speed)));
  const isl = vIsl(p.island);
  g.save(); g.globalAlpha = 1 - k * k;
  const x = isl.x + 60, y = isl.y - R - 30 - k * 50;
  g.fillStyle = 'rgba(14,18,22,.92)'; g.fillRect(x - 46, y - 20, 92 + (p.ships ? 50 : 0), 40);
  g.strokeStyle = SIDE_COL[p.side].fill; g.lineWidth = 3; g.strokeRect(x - 46, y - 20, 92 + (p.ships ? 50 : 0), 40);
  g.fillStyle = '#fff'; g.font = '900 28px "Barlow Condensed", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(`+${p.troops}`, x - 38, y + 1);
  armySymbol(g, x + 22, y, 22, '#fff');
  if (p.ships) { g.fillText('+1', x + 46, y + 1); shipSide(g, x + 82, y + 2, 22, '#fff'); }
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
  renderHoldings();
  const n = [...Object.keys(S.orders), ...Object.keys(S.secOrders)].filter((id) => G.unit(S, id)?.side === 'blue').length;
  $('ordn').hidden = !n; $('ordn').textContent = n;
  $('b-end').disabled = busy || !!S.over;
  const fl = G.flightsLeft(S, 'blue'), canRecon = !busy && !S.over && fl > 0 && G.reconTargets(S, 'blue').length > 0;
  if (!canRecon) reconMode = false;
  $('b-recon').hidden = !canRecon; $('recn').textContent = fl; $('b-recon').classList.toggle('on', reconMode);
  const p = $('sel');
  const u = sel && G.unit(S, sel);
  if (!u || busy) { p.hidden = true; $('app').classList.remove('island-view', 'sel-open'); measurePanel(); return; }
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
    const c = toScreen(isl.x, isl.y), r = (R + 4) * cam.z;
    return [{ left: c.x - r, right: c.x + r, top: c.y - r - 21 * cam.z, bottom: c.y + r }, nameBox(isl.id)];
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
  if (hintStep === 'unit') { hintTarget = { world: G.island(S, 'kestra') }; $('hint-t').textContent = 'TAP YOUR ARMY'; }
  else if (hintStep === 'dest') { hintTarget = { world: G.island(S, 'oska') }; $('hint-t').textContent = 'TAP AN ISLAND'; }
  else { hintTarget = { el: $('b-end') }; $('hint-t').textContent = 'END WEEK'; }
  h.hidden = false;
}
function placeHint() {
  const h = $('hint');
  if (hintTarget.world) {
    const p = toScreen(hintTarget.world.x, hintTarget.world.y - R - 30);
    const hw = h.offsetWidth / 2 + 6;
    h.classList.remove('below'); h.style.left = `${Math.max(hw, Math.min(vw - hw, p.x))}px`; h.style.top = `${Math.max(h.offsetHeight + 70, p.y)}px`;
  } else {
    const r = hintTarget.el.getBoundingClientRect();
    h.classList.remove('below'); h.style.left = `${Math.min(vw - 90, r.left + r.width / 2)}px`; h.style.top = `${r.top - 14}px`;
  }
}
function advanceHint(step) {
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
  if (secK() < 0.5) return null;
  const tol = Math.max(SEC_R + 4, 22 / cam.z);
  let best = null, bd = 1e9;
  for (const isl of S.islands) for (const x of isl.secs) { const d = Math.hypot(x.x - wx, x.y - wy); if (d < tol && d < bd) { bd = d; best = { isl, x }; } }
  return best;
}
function select(id) { sel = id; if (id) advanceHint('dest'); updateHud(); sfx.pew(); }
function tapAt(sx, sy) {
  if (busy || S.over) return;
  const w = toWorld(sx, sy);
  if (reconMode) {
    const isl = islandAt(w.x, w.y);
    if (isl && G.reconTargets(S, 'blue').includes(isl.id)) { doRecon(isl.id); return; }
    reconMode = false; updateHud(); return;
  }
  const tag = tagAt(w.x, w.y);
  const isl = islandAt(w.x, w.y);
  const sec = sectionAt(w.x, w.y);
  const cur = sel && G.unit(S, sel);
  if (tag && tag.side === 'blue' && (!cur || tag.at === cur.at || !isl || isl.id === cur.at) && !(cur && sec && cur.at === sec.isl.id && cur.kind === 'army' && G.canSecOrder(S, cur, sec.x.id) && sec.x.id !== cur.sec && !G.armiesIn(S, sec.isl.id, sec.x.id, 'blue').some((u) => u.id === tag.id))) {
    select(tag.id === sel ? null : tag.id); return;
  }
  // island view: push to a linked section, or land on a chosen beach
  if (cur && sec && cur.kind === 'army') {
    if (sec.isl.id === cur.at && G.canSecOrder(S, cur, sec.x.id)) { G.issueSecOrder(S, cur.id, sec.x.id); sfx.hit(); advanceHint('end'); sel = null; updateHud(); return; }
    if (sec.isl.id !== cur.at && sec.x.kind === 'beach' && G.issueOrder(S, cur.id, sec.isl.id, sec.x.id)) { sfx.hit(); advanceHint('end'); sel = null; updateHud(); return; }
  }
  if (cur && isl && isl.id !== cur.at) {
    if (G.issueOrder(S, cur.id, isl.id)) { sfx.hit(); advanceHint('end'); sel = null; updateHud(); return; }
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
  sel = null; updateHud();
}

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
  if (e.key === 'Escape') { $('help').hidden = true; sel = null; reconMode = false; updateHud(); }
  else if ((e.key === 'Enter' || e.key === ' ') && $('end').hidden && $('help').hidden) { e.preventDefault(); doEndWeek(); }
  else if (e.key === 'Tab') {
    e.preventDefault(); if (busy) return;
    const mine = S.units.filter((u) => u.side === 'blue');
    const i = mine.findIndex((u) => u.id === sel);
    if (mine.length) { const u = mine[(i + 1) % mine.length]; select(u.id); const isl = G.island(S, u.at); cam.x = isl.x; cam.y = isl.y; clampCam(); }
  } else if (e.key === '+' || e.key === '=') zoomAt(vw / 2, vh / 2, 1.25);
  else if (e.key === '-') zoomAt(vw / 2, vh / 2, 0.8);
  else if (e.key === 'r' || e.key === 'R') { if (!$('b-recon').hidden) { reconMode = !reconMode; updateHud(); } }
  else if (e.key.startsWith('Arrow')) {
    const d = 80 / cam.z;
    if (e.key === 'ArrowLeft') cam.x -= d; if (e.key === 'ArrowRight') cam.x += d;
    if (e.key === 'ArrowUp') cam.y -= d; if (e.key === 'ArrowDown') cam.y += d;
    clampCam();
  } else if (/^[1-9]$/.test(e.key) && sel) {
    // number keys order the selected unit to the n-th reachable island (keyboard play)
    const u = G.unit(S, sel); const r = G.reachable(S, u);
    const id = r[+e.key - 1]; if (id && G.issueOrder(S, u.id, id)) { advanceHint('end'); sel = null; updateHud(); }
  }
});

// ---------- recon ----------
async function doRecon(islId) {
  if (busy) return null;
  const f = G.recon(S, 'blue', islId);
  if (!f) return null;
  reconMode = false; busy = true; updateHud();
  const isl = G.island(S, islId);
  sfx.alarm();
  fx.flight = { a: { x: f.from.x, y: f.from.y }, b: { x: isl.x, y: isl.y }, t0: performance.now(), dur: 1100 / Math.max(1, speed / 3) };
  await wait(1100 * speed / Math.max(1, speed / 3));
  fx.flight = null;
  refreshFog(true);
  sfx.pew();
  busy = false; updateHud();
  return f;
}

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
  busy = true; sel = null; reconMode = false; advanceHint('done'); $('report').hidden = true; toggleHoldings(false); updateHud(); refreshHint();
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
        fx.moving = { list: shown, ids: new Set(e.moves.map((m) => m.unit)), t: 0 };
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
  updateHud(); refreshHint();
  showReport(events, seenBefore);
  if (S.over) { await wait(900); showEnd(); }
  return events;
}

// ---------- week report: every fight Blue saw, who won, and which companies / ships each side lost ----------
let reportData = [];
function showReport(events, seenBefore) {
  const fights = events.filter((e) => (e.type === 'landing' || e.type === 'naval') && e.lost)
    .map((e) => {
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
  r.innerHTML = fights.map((f) => `<div class="rep-row"><canvas class="rk" data-kind="${f.kind}" width="56" height="56"></canvas><b>${f.name}</b>
    <canvas class="rw" data-side="${f.winner || ''}" width="30" height="20"></canvas>${lostHtml('blue', f.blue)}${lostHtml('red', f.red)}</div>`).join('');
  r.querySelectorAll('canvas.rk').forEach((c) => { const q = c.getContext('2d'); if (c.dataset.kind === 'naval') shipSide(q, 28, 30, 44, '#e6ebf0'); else secIcon(q, c.dataset.kind, 28, 28, 44, '#e6ebf0'); });
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
    ['air', 'AIRFIELD', '+ planes, recon'], ['fog', 'FOG', 'fly recon to see'], ['home', 'HQ', 'take theirs to win'],
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
  $('b-recon').querySelector('.i').innerHTML = icon('plane', { size: 28 });
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
  return ['#tl', '#tr', '#banner .wk', '#zoom', '#b-end', '#b-recon', '#sel'].map((s) => {
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
  $('app').classList.add('island-view');
  z = z || Math.min(1.6, Math.max(0.95, Math.min(vw / (i.rx * 1.8 + 100), (vh - 150) / (i.ry * 1.8 + 140))));
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
  $('b-recon').onclick = () => { if (busy) return; reconMode = !reconMode; sel = null; updateHud(); };
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
    if (secK() > 0.5) { const c0 = { ...cam }; tween(400, (k) => { cam.z = c0.z + (0.5 - c0.z) * ease(k); clampCam(); }).then(updateHud); }
    else zoomToIsland(u.at);
  };
  window.addEventListener('resize', resize);
}
async function loadTerrain() {
  terrainScale = Math.min(vw, vh) < 500 ? 0.6 : 0.75;
  const apply = (t) => {
    const c = document.createElement('canvas'); c.width = t.w; c.height = t.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(t.data), t.w, t.h), 0, 0);
    terrain = c; $('loading').classList.add('done'); $('b-play').disabled = false;
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
  recon: (id) => doRecon(id),
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
  sectionScreen(id, sec) { const x = G.section(G.island(S, id), sec); return toScreen(x.x, x.y); },
  focus(id, z) { const i = G.island(S, id); cam.x = i.x; cam.y = i.y; if (z) cam.z = z; clampCam(); updateHud(); },
  labels(id) { cardCache = null; labelCache = null; const l = labelLayout().get(id); return l ? { name: { ...l.name }, badge: { ...l.badge } } : null; },
  cardCols() { cardCache = null; labelCache = null; return (cardLayout().cols || []).map((c) => ({ ...c })); },
  zoomToIsland, nameBox, sectionBox, holdings, toggleHoldings, get report() { return reportData; }, keepClear,
  showEnd,
};
