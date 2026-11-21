// Draws the battle on the painted map: objective rings, unit blocks (infantry ranks in line,
// column or square; cavalry with diagonal stripes; guns limbered or unlimbered), flag tags, smoke,
// order lines with role glyphs for the selected command, override markers, serif map labels,
// commander cards and the minimap.
// Source part: none in parts-library draws 2D map battles; smoke drift timing borrows the
// soft-puff idea from parts-library space-particles (one pass, alpha fade, size growth).
import { WORLD, VILLAGES, HAMLETS } from './map.js';
import { BLOCK, isActive, centroid, corpsUnits } from './sim.js';
import { nodeCentroid } from './command.js';

const SIDE = {
  b: { fill: '#2a2f9e', inner: '#5a64d8', rim: '#e8ecff', flag: '#2a2f9e', ring: '#3f5bff' },
  g: { fill: '#2f9a3a', inner: '#7ad07a', rim: '#f2fff0', flag: '#2f9a3a', ring: '#3fd04a' },
};
const GOLD = '#ffd23f';
const SERIF = 'Georgia, "Times New Roman", Times, serif';

export function createFx() {
  return { smoke: [], flashes: [], marks: [] };
}

export function addVolleyFx(fx, e) {
  const fx0 = Math.cos(e.ang), fy0 = Math.sin(e.ang);
  for (let i = 0; i < 3; i++) {
    const lat = (i - 1) * 9;
    fx.smoke.push({
      x: e.x + fx0 * 8 - fy0 * lat, y: e.y + fy0 * 8 + fx0 * lat,
      vx: fx0 * 6 + (Math.random() - 0.5) * 4, vy: fy0 * 6 + (Math.random() - 0.5) * 4,
      r: 4 + Math.random() * 3, life: 0, max: 1.6 + Math.random() * 1.2,
    });
  }
  fx.flashes.push({ x: e.x + fx0 * 7, y: e.y + fy0 * 7, life: 0.14 });
  if (fx.smoke.length > 360) fx.smoke.splice(0, fx.smoke.length - 360);
}

/** r3: cannon shots (big muzzle smoke, a dirt burst where the ball lands) and melee dust. */
export function addCannonFx(fx, e) {
  const a = Math.atan2(e.ty - e.y, e.tx - e.x);
  for (let i = 0; i < 2; i++) fx.smoke.push({ x: e.x + Math.cos(a) * 12, y: e.y + Math.sin(a) * 12, vx: Math.cos(a) * 8 + (Math.random() - 0.5) * 6, vy: Math.sin(a) * 8 + (Math.random() - 0.5) * 6, r: 7 + Math.random() * 3, life: 0, max: 2.4 });
  fx.smoke.push({ x: e.tx, y: e.ty, vx: 0, vy: -3, r: 4, life: 0, max: 0.9, dirt: true });
  fx.flashes.push({ x: e.x + Math.cos(a) * 12, y: e.y + Math.sin(a) * 12, life: 0.18 });
}
export function addDustFx(fx, e) {
  for (let i = 0; i < 2; i++) fx.smoke.push({ x: e.x + (Math.random() - 0.5) * 14, y: e.y + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, r: 3 + Math.random() * 3, life: 0, max: 1, dirt: true });
}

export function addOrderMark(fx, x, y) {
  fx.marks.push({ x, y, life: 1.1 });
}

export function stepFx(fx, dt) {
  for (const p of fx.smoke) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 7; }
  fx.smoke = fx.smoke.filter((p) => p.life < p.max);
  for (const f of fx.flashes) f.life -= dt;
  fx.flashes = fx.flashes.filter((f) => f.life > 0);
  for (const m of fx.marks) m.life -= dt;
  fx.marks = fx.marks.filter((m) => m.life > 0);
}

/** Screen rectangle of a corps' portrait card, just above its highest regiment and flag. */
export function corpsCardRect(view, at) {
  const sx = at.x * view.s + view.ox;
  const top = (at.top - BLOCK.len / 2 - 22) * view.s + view.oy;
  return { x: sx - 14, y: top - 39, w: 28, h: 35 };
}

export function corpsCentroid(state, corpsId) {
  const live = corpsUnits(state, corpsId);
  return live.length ? centroid(live) : null;
}

function drawVillageRings(g, state, s, t) {
  for (const v of state.villages) {
    const col = v.owner ? SIDE[v.owner].ring : '#f3ead0';
    g.lineWidth = 2.2 / s;
    g.setLineDash([8 / s, 6 / s]);
    g.strokeStyle = col;
    g.globalAlpha = 0.8;
    g.beginPath(); g.arc(v.x, v.y, v.r, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    if (v.prog !== 0 && Math.abs(v.prog) < 1) {
      g.strokeStyle = SIDE[v.prog > 0 ? 'b' : 'g'].ring;
      g.lineWidth = 5 / s;
      g.beginPath(); g.arc(v.x, v.y, v.r + 6 / s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.abs(v.prog)); g.stroke();
    }
    if (v.contested) {
      g.globalAlpha = 0.25 + 0.2 * Math.sin(t * 8);
      g.fillStyle = '#ff6a3a';
      g.beginPath(); g.arc(v.x, v.y, v.r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
}

/**
 * r3: units are battalions. Infantry draws as stacked ranks (line), a narrow deep block
 * (column) or a hollow square; ranks thin with losses (3 -> 2 -> 1). Cavalry has two ranks with
 * diagonal stripes like the ref's horse; guns draw limbered (limber + team) or unlimbered (barrel,
 * wheels, crew). Drawing only: the sim footprint stays inside the r2 BLOCK bounds.
 */
export const RANK = { thick: 4, gap: 1.6, len: 20 };
export const rankCount = (str) => (str > 0.6 ? 3 : str > 0.32 ? 2 : 1);

function rimRect(g, x, y, w, h, col, flash) {
  g.fillStyle = flash ? '#e8d2b0' : col.fill;
  g.fillRect(x, y, w, h);
  g.strokeStyle = col.rim;
  g.lineWidth = 0.9;
  g.strokeRect(x, y, w, h);
}

function drawInfantry(g, u, col) {
  const n = rankCount(u.str);
  const flash = u.hitFlash > 0;
  if (u.form === 'square') {
    const a = 7.5 + 1.5 * u.str, w = 3.4;
    rimRect(g, -a, -a, w, 2 * a, col, flash); rimRect(g, a - w, -a, w, 2 * a, col, flash);
    rimRect(g, -a + w, -a, 2 * a - 2 * w, w, col, flash); rimRect(g, -a + w, a - w, 2 * a - 2 * w, w, col, flash);
    return 2 * a;
  }
  if (u.form === 'column') {
    const len = 8 + 2 * u.str, k = n + 1;
    for (let i = 0; i < k; i++) rimRect(g, 9 - 3.4 - i * 4.8, -len / 2, 3.4, len, col, flash && i === 0);
    return k * 4.8;
  }
  const len = RANK.len * (0.6 + 0.4 * u.str);
  const dep = n * RANK.thick + (n - 1) * RANK.gap;
  for (let i = 0; i < n; i++) {
    const x = dep / 2 - RANK.thick - i * (RANK.thick + RANK.gap);
    rimRect(g, x, -len / 2, RANK.thick, len, col, flash && i === 0);
  }
  return dep;
}

function drawCavalry(g, u, col) {
  const n = u.str > 0.45 ? 2 : 1;
  const len = 13 + 4 * u.str, t = 5.4;
  for (let i = 0; i < n; i++) {
    const x = 5 - t - i * (t + 2.2);
    g.fillStyle = u.hitFlash > 0 && i === 0 ? '#e8d2b0' : col.fill;
    g.fillRect(x, -len / 2, t, len);
    g.save();
    g.beginPath(); g.rect(x, -len / 2, t, len); g.clip();
    g.strokeStyle = col.rim; g.lineWidth = 1.2;
    for (let yy = -len / 2 - t; yy < len / 2 + t; yy += 4.2) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + t, yy + t); g.stroke(); }
    g.restore();
    g.strokeStyle = col.rim; g.lineWidth = 0.9; g.strokeRect(x, -len / 2, t, len);
  }
  return n * t + (n - 1) * 2.2;
}

function wheel(g, x, y) { g.beginPath(); g.arc(x, y, 2.1, 0, Math.PI * 2); g.fill(); g.stroke(); }
function drawGun(g, u, col) {
  g.lineWidth = 0.9;
  g.strokeStyle = '#1c140a';
  if (u.limbered) {
    // limber box, gun trailed behind, two-horse team ahead
    g.fillStyle = col.fill; g.fillRect(-3, -3.5, 7, 7); g.strokeStyle = col.rim; g.strokeRect(-3, -3.5, 7, 7);
    g.fillStyle = '#3a2e1c'; g.strokeStyle = '#1c140a';
    g.fillRect(-11, -1, 8, 2); wheel(g, -6, -3.6); wheel(g, -6, 3.6);
    g.fillStyle = '#5a4128';
    g.beginPath(); g.ellipse(8.5, -2.6, 3.2, 1.6, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(8.5, 2.6, 3.2, 1.6, 0, 0, Math.PI * 2); g.fill();
    return 8;
  }
  // unlimbered: barrel to the front, wheels, trail, crew behind on a side-coloured plate
  g.fillStyle = col.fill; g.fillRect(-10, -6, 6, 12); g.strokeStyle = col.rim; g.strokeRect(-10, -6, 6, 12);
  g.fillStyle = '#2a2014'; g.fillRect(-4, -1.6, 15, 3.2);
  g.fillStyle = '#3a2e1c'; g.strokeStyle = '#1c140a'; wheel(g, 0, -4.2); wheel(g, 0, 4.2);
  g.fillStyle = '#f2ead0';
  for (const yy of [-4, 0, 4]) { g.beginPath(); g.arc(-7, yy, 1.1, 0, Math.PI * 2); g.fill(); }
  return 12;
}

function drawUnit(g, u, selected, s) {
  const col = SIDE[u.side];
  g.save();
  g.globalAlpha = u.routed ? u.alpha * 0.8 : 0.55 + 0.45 * u.str;
  g.translate(u.x, u.y);
  g.rotate(u.ang);
  if (selected) {
    g.strokeStyle = GOLD;
    g.lineWidth = Math.max(2, 3.2 / s);
    g.beginPath(); g.arc(0, 0, u.kind === 'art' ? 13 : 13.5, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = 'rgba(20,16,8,0.32)';
  g.fillRect(-8, -9, 17, 19);
  const dep = u.kind === 'cav' ? drawCavalry(g, u, col) : u.kind === 'art' ? drawGun(g, u, col) : drawInfantry(g, u, col);
  g.restore();
  if (u.routed || u.kind === 'art') return;
  // upright tag behind the block: colours on foot, a swallowtail pennant on horse
  const bx = u.x - Math.cos(u.ang) * (dep / 2 + 2);
  const by = u.y - Math.sin(u.ang) * (dep / 2 + 2);
  g.save();
  g.globalAlpha = 0.6 + 0.4 * u.str;
  g.strokeStyle = '#2a2014'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - 15); g.stroke();
  if (u.kind === 'cav') {
    g.fillStyle = col.flag;
    g.beginPath(); g.moveTo(bx, by - 15); g.lineTo(bx + 11, by - 13); g.lineTo(bx + 7, by - 11.5); g.lineTo(bx + 11, by - 10); g.lineTo(bx, by - 8.5); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(240,236,220,0.9)'; g.lineWidth = 0.7; g.stroke();
  } else {
    g.fillStyle = '#f4f0e2';
    g.fillRect(bx, by - 15, 10, 7);
    g.fillStyle = col.flag;
    // invented colours: blue field with a gold disc, white field with a green cross
    if (u.side === 'b') { g.fillRect(bx, by - 15, 10, 7); g.fillStyle = '#e8c040'; g.beginPath(); g.arc(bx + 5, by - 11.5, 1.9, 0, Math.PI * 2); g.fill(); }
    else { g.fillRect(bx + 4, by - 15, 2, 7); g.fillRect(bx, by - 12.5, 10, 2); }
    g.strokeStyle = 'rgba(30,20,10,0.8)'; g.lineWidth = 0.6;
    g.strokeRect(bx, by - 15, 10, 7);
  }
  g.restore();
}

/* ---------- order lines for the selected command ---------- */
export const ROLE_STYLE = {
  attack: { col: '#ffffff', dash: [] },
  pin: { col: '#ff7a4a', dash: [] },
  flank: { col: '#ffd23f', dash: [7, 4] },
  reserve: { col: '#cfc8b0', dash: [2, 5] },
  bombard: { col: '#ffa040', dash: [10, 3, 2, 3] },
  screen: { col: '#8fe0ff', dash: [6, 4] },
  support: { col: '#e8e0c0', dash: [4, 4] },
  hold: { col: '#b8d0ff', dash: [] },
  move: { col: '#ffffff', dash: [] },
};
/** Role glyphs drawn on a 24-unit grid (canvas paths, no emoji). */
const GLYPH = {
  attack: 'M5 12h11M12 6l6 6-6 6',
  move: 'M5 12h11M12 6l6 6-6 6',
  pin: 'M5 5l14 14M19 5L5 19M4 9l5-5M15 20l5-5',
  flank: 'M5 19c0-8 4-12 12-12M13 3l4 4-4 4',
  reserve: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
  bombard: 'M4 15h10l6-4M7 19a2.5 2.5 0 1 0 0.1 0M17 6a1.5 1.5 0 1 0 0.1 0',
  screen: 'M7 4v8a5 5 0 0 0 10 0V4M5 4h4M15 4h4',
  support: 'M6 14l6-6 6 6M6 19l6-6 6 6',
  hold: 'M6 21V4M6 4h11l-3 4 3 4H6',
};
const glyphPaths = {};
const glyphPath = (r) => glyphPaths[r] || (glyphPaths[r] = new Path2D(GLYPH[r] || GLYPH.attack));

function roleBadge(g, x, y, role, r = 11) {
  const st = ROLE_STYLE[role] || ROLE_STYLE.attack;
  g.fillStyle = 'rgba(24,18,8,0.88)';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = st.col; g.lineWidth = 1.6; g.stroke();
  g.save();
  g.translate(x - r * 0.72, y - r * 0.72);
  g.scale(r * 1.44 / 24, r * 1.44 / 24);
  g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
  g.stroke(glyphPath(role));
  g.restore();
}

function arrowLine(g, a, b, st, w) {
  g.strokeStyle = st.col; g.lineWidth = w; g.setLineDash(st.dash);
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  g.setLineDash([]);
}

/** Order lines: the selected command's goal, its children's sub-plans and one level below. */
export function drawOrderLines(g, state, view, nodeId) {
  const n = nodeId && state.nodes.get(nodeId);
  if (!n) return;
  const S = (p) => ({ x: p.x * view.s + view.ox, y: p.y * view.s + view.oy });
  const c = nodeCentroid(n);
  if (!c) return;
  g.save();
  g.globalAlpha = 0.95;
  const drawPlan = (node, depth) => {
    for (const p of node.plan) {
      const kid = state.nodes.get(p.id);
      const kc = kid && nodeCentroid(kid);
      if (!kc) continue;
      const st = ROLE_STYLE[p.role] || ROLE_STYLE.attack;
      const a = S(kc), b = S(p);
      if (depth === 0) {
        g.strokeStyle = 'rgba(20,14,6,0.6)'; g.lineWidth = 5; g.setLineDash([]);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      arrowLine(g, a, b, st, depth === 0 ? 2.4 : 1.3);
      if (depth === 0 && kid.plan.length && kid.level !== 'reg') drawPlan(kid, 1);
      if (depth === 0) roleBadge(g, b.x, b.y, p.role, 11);
      else { g.fillStyle = st.col; g.beginPath(); g.arc(b.x, b.y, 2.6, 0, Math.PI * 2); g.fill(); }
    }
  };
  if (n.order) {
    const a = S(c), b = S(n.order);
    g.strokeStyle = GOLD; g.lineWidth = 2; g.setLineDash([3, 4]);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.arc(b.x, b.y, 15, 0, Math.PI * 2); g.stroke();
  }
  drawPlan(n, 0);
  if (n.level === 'bn' && n.order) roleBadge(g, S(n.order).x, S(n.order).y, n.order.role, 11);
  g.restore();
}

/** Broken-chain marker over every blue command the player has taken under direct control. */
const CHAIN = new Path2D('M9 15l-2 2a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0M15 9l2-2a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0M8 4v3M4 8h3M16 20v-3M20 16h-3');
export function drawOverrides(g, state, view) {
  for (const n of state.nodes.values()) {
    if (!n.override || n.side !== 'b') continue;
    const c = nodeCentroid(n);
    if (!c) continue;
    const x = c.x * view.s + view.ox, y = c.y * view.s + view.oy - 26;
    g.fillStyle = 'rgba(24,18,8,0.9)';
    g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffb040'; g.lineWidth = 1.6; g.stroke();
    g.save(); g.translate(x - 7, y - 7); g.scale(14 / 24, 14 / 24); g.lineWidth = 2.6; g.lineCap = 'round'; g.stroke(CHAIN); g.restore();
  }
}

function drawSmoke(g, fx) {
  for (const p of fx.smoke) {
    const k = p.life / p.max;
    g.globalAlpha = 0.55 * (1 - k) * Math.min(1, p.life * 8);
    g.fillStyle = p.dirt ? '#8a7350' : '#e9e6dc';
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
  }
  for (const f of fx.flashes) {
    g.globalAlpha = Math.min(1, f.life * 9);
    g.fillStyle = '#ffb030';
    g.beginPath(); g.arc(f.x, f.y, 3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

function drawMarks(g, fx, s) {
  g.strokeStyle = GOLD;
  g.lineWidth = 3 / s;
  for (const m of fx.marks) {
    g.globalAlpha = Math.min(1, m.life * 2);
    const r = (10 + (1.1 - m.life) * 18) / s;
    g.beginPath(); g.arc(m.x, m.y, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(m.x, m.y, 3 / s, 0, Math.PI * 2); g.fillStyle = GOLD; g.fill();
  }
  g.globalAlpha = 1;
}

function label(g, text, x, y, size, bold) {
  g.font = `${bold ? 'bold ' : ''}italic ${size}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(30,26,14,0.85)';
  g.strokeText(text, x, y);
  g.fillStyle = '#f5eed6';
  g.fillText(text, x, y);
}

const VILLAGE_FONT = 14;
const villageLabelAt = (view, v) => ({ x: v.x * view.s + view.ox, y: v.y * view.s + view.oy + 30 + 30 * view.s });

/** r2: screen box of a scenery hamlet's map label (same placement as drawLabels). */
export function hamletLabelBox(g, view, h) {
  g.font = `italic 12px ${SERIF}`;
  const w = g.measureText(h.name).width + 4;
  const x = h.x * view.s + view.ox, y = h.y * view.s + view.oy + 22 + 20 * view.s;
  return { left: x - w / 2, right: x + w / 2, top: y - 9, bottom: y + 9 };
}

/** Screen box of an objective village's map label (text plus its dark outline). */
export function villageLabelBox(g, view, v) {
  g.font = `bold italic ${VILLAGE_FONT}px ${SERIF}`;
  const w = g.measureText(v.name).width + 4;
  const h = VILLAGE_FONT + 6;
  const at = villageLabelAt(view, v);
  return { left: at.x - w / 2, right: at.x + w / 2, top: at.y - h / 2, bottom: at.y + h / 2 };
}

function drawLabels(g, view) {
  const { s, ox, oy } = view;
  for (const h of HAMLETS) label(g, h.name, h.x * s + ox, h.y * s + oy + 22 + 20 * s, 12, false);
  for (const v of VILLAGES) { const at = villageLabelAt(view, v); label(g, v.name, at.x, at.y, VILLAGE_FONT, true); }
}

/**
 * r3: commander cards dodge map labels (Brasino sat under corps III's card at 844x390): try
 * above the corps, then higher, left and right, and keep the first spot clear of every label.
 */
export function corpsCardRects(g, state, view) {
  const labels = [...HAMLETS.map((h) => hamletLabelBox(g, view, h)), ...VILLAGES.map((v) => villageLabelBox(g, view, v))];
  const hit = (r) => labels.some((b) => r.x < b.right && b.left < r.x + r.w && r.y < b.bottom && b.top < r.y + r.h);
  const out = {};
  for (const c of state.corps) {
    const at = corpsCentroid(state, c.id);
    if (!at) continue;
    const r0 = corpsCardRect(view, at);
    const tries = [[0, 0], [0, -24], [-r0.w - 10, 10], [r0.w + 10, 10], [-r0.w - 10, -24], [r0.w + 10, -24], [0, -48]];
    let r = r0;
    for (const [dx, dy] of tries) { const k = { ...r0, x: r0.x + dx, y: r0.y + dy }; if (!hit(k)) { r = k; break; } }
    out[c.id] = r;
  }
  return out;
}

function drawCorpsCards(g, state, view, art, selectedCorps, rects) {
  for (const c of state.corps) {
    const r = rects[c.id];
    if (!r) continue;
    g.fillStyle = 'rgba(20,14,6,0.5)';
    g.fillRect(r.x + 2, r.y + 2, r.w, r.h);
    g.drawImage(art.portraits[c.id], r.x, r.y, r.w, r.h);
    g.fillStyle = SIDE[c.side].fill;
    g.fillRect(r.x, r.y + r.h - 6, r.w, 6);
    if (selectedCorps.has(c.id)) {
      g.strokeStyle = GOLD; g.lineWidth = 3;
      g.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    }
    if (c.underFire > 0 && c.side === 'b') {
      g.strokeStyle = `rgba(255,80,50,${Math.min(1, c.underFire)})`; g.lineWidth = 2;
      g.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
    }
  }
}

export function drawScene(g, view, state, art, fx, ui) {
  const { s, ox, oy, dpr } = view;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#2f2e1b';
  g.fillRect(0, 0, view.w, view.h);
  g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  g.drawImage(art.terrain, 0, 0);
  drawVillageRings(g, state, s, ui.time);
  drawMarks(g, fx, s);
  const order = state.units.filter((u) => !u.dead).sort((a, b) => a.y - b.y);
  for (const u of order) drawUnit(g, u, ui.selected.has(u.id), s);
  drawSmoke(g, fx);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawLabels(g, view);
  drawOrderLines(g, state, view, ui.node);
  drawOverrides(g, state, view);
  ui.cardRects = corpsCardRects(g, state, view);
  drawCorpsCards(g, state, view, art, ui.selectedCorps, ui.cardRects);
  if (ui.box) {
    const b = ui.box;
    g.fillStyle = 'rgba(255,210,63,0.12)';
    g.strokeStyle = GOLD; g.lineWidth = 1.5; g.setLineDash([6, 4]);
    g.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    g.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    g.setLineDash([]);
  }
}

export function drawMinimap(g, mini, state, view) {
  const k = mini.width / WORLD.w;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(mini.base, 0, 0, mini.width, mini.height);
  for (const v of state.villages) {
    g.fillStyle = v.owner ? SIDE[v.owner].ring : '#f3ead0';
    g.beginPath(); g.arc(v.x * k, v.y * k, 4 * mini.dpr, 0, Math.PI * 2); g.fill();
  }
  for (const u of state.units) {
    if (!isActive(u)) continue;
    g.fillStyle = SIDE[u.side].fill;
    g.fillRect(u.x * k - 1.5 * mini.dpr, u.y * k - 1.5 * mini.dpr, 3 * mini.dpr, 3 * mini.dpr);
  }
  g.strokeStyle = GOLD; g.lineWidth = 1.5 * mini.dpr;
  g.strokeRect((-view.ox / view.s) * k, (-view.oy / view.s) * k, (view.w / view.s) * k, (view.h / view.s) * k);
}
