// Draws the battle on the painted map: objective rings, regiment blocks with flag tags, smoke,
// order chevrons, serif map labels, commander cards and the minimap.
// Source part: none in parts-library draws 2D map battles; smoke drift timing borrows the
// soft-puff idea from parts-library space-particles (one pass, alpha fade, size growth).
import { WORLD, VILLAGES, HAMLETS } from './map.js';
import { BLOCK, isActive, centroid, corpsUnits } from './sim.js';

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
 * r2: a regiment is drawn as a deep formation block like the ref: several ranks stacked one
 * behind the other (narrow rectangles with light rims), not a single thin line. Ranks thin out
 * as the regiment loses strength (3 -> 2 -> 1). Drawing only: the sim footprint (BLOCK,
 * spacing, hit tests) is unchanged and the block stays inside BLOCK.len x 2*BLOCK.depth.
 */
export const RANK = { thick: 6.4, gap: 2.6, len: BLOCK.len * 0.84 };
export const rankCount = (str) => (str > 0.6 ? 3 : str > 0.32 ? 2 : 1);
function drawUnit(g, u, selected, s) {
  const col = SIDE[u.side];
  const n = rankCount(u.str);
  const len = RANK.len * (0.55 + 0.45 * u.str);
  const dep = n * RANK.thick + (n - 1) * RANK.gap;
  g.save();
  g.globalAlpha = u.routed ? u.alpha * 0.8 : 0.5 + 0.5 * u.str;
  g.translate(u.x, u.y);
  g.rotate(u.ang);
  // local x = facing (depth), local y = frontage; rank 0 is the front rank
  g.fillStyle = 'rgba(20,16,8,0.35)';
  g.fillRect(-dep / 2 + 1.5, -len / 2 + 2, dep, len);
  if (selected) {
    g.strokeStyle = GOLD;
    g.lineWidth = Math.max(2.5, 4 / s);
    g.strokeRect(-dep / 2 - 2.5, -len / 2 - 2.5, dep + 5, len + 5);
  }
  for (let i = 0; i < n; i++) {
    const x = dep / 2 - RANK.thick - i * (RANK.thick + RANK.gap);
    g.fillStyle = u.hitFlash > 0 && i === 0 ? '#e8d2b0' : col.fill;
    g.fillRect(x, -len / 2, RANK.thick, len);
    g.fillStyle = col.inner;
    g.fillRect(x + RANK.thick / 2 - 0.6, -len / 2 + 2.5, 1.2, len - 5);
    g.strokeStyle = col.rim;
    g.lineWidth = 1.1;
    g.strokeRect(x, -len / 2, RANK.thick, len);
  }
  g.restore();
  // upright flag tag behind the rear rank
  if (u.routed) return;
  const bx = u.x - Math.cos(u.ang) * (dep / 2 + 2);
  const by = u.y - Math.sin(u.ang) * (dep / 2 + 2);
  g.save();
  g.globalAlpha = 0.6 + 0.4 * u.str;
  g.strokeStyle = '#2a2014'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - 20); g.stroke();
  g.fillStyle = '#f4f0e2';
  g.fillRect(bx, by - 20, 14, 10);
  g.fillStyle = col.flag;
  // invented colours: blue field with a gold disc, white field with a green cross
  if (u.side === 'b') { g.fillRect(bx, by - 20, 14, 10); g.fillStyle = '#e8c040'; g.beginPath(); g.arc(bx + 7, by - 15, 2.6, 0, Math.PI * 2); g.fill(); }
  else { g.fillRect(bx + 5.6, by - 20, 2.8, 10); g.fillRect(bx, by - 16.4, 14, 2.8); }
  g.strokeStyle = 'rgba(30,20,10,0.8)'; g.lineWidth = 0.7;
  g.strokeRect(bx, by - 20, 14, 10);
  g.restore();
}

function drawSmoke(g, fx) {
  for (const p of fx.smoke) {
    const k = p.life / p.max;
    g.globalAlpha = 0.55 * (1 - k) * Math.min(1, p.life * 8);
    g.fillStyle = '#e9e6dc';
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

function drawCorpsCards(g, state, view, art, selectedCorps) {
  for (const c of state.corps) {
    const at = corpsCentroid(state, c.id);
    if (!at) continue;
    const r = corpsCardRect(view, at);
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
  drawCorpsCards(g, state, view, art, ui.selectedCorps);
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
