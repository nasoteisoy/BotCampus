// 📖 Unit Menu ("Unit Guide" in code): full-screen reference of every unit (attack matrix, special ranges, ring diagram to scale, config)
// plus a sortable / filterable compare table and a side-by-side compare of two picked units.
// Loaded lazily by main.js; data comes from config.js (and the Unit Examiner's tuning when opened from there).
import { UNITS, BUILDINGS, ABILITIES, BRANCHES, BODIES, BODY_KEYS, LVL_MULT, DMG_MULT, HQ_INCOME, DEPOT_INCOME, BUILD_RADIUS, VISION_BLD } from './config.js';
import { svg } from './icons.js';
import { unitModel, EXTRA, BODY_COLOR, f0, accInfo, ACC_LEGEND } from './unitinfo.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BR_ORDER = ['inf', 'armor', 'art', 'air'];
const BR_ICON = { inf: '🪖', armor: '🛡️', art: '💥', air: '✈️' };
const WPN = { mg: 'Machine gun', at: 'AT shells', cannon: 'Tank cannon', he: 'HE shells (arcing)', flak: 'Flak', aamg: 'Air-to-air MG', rocket: 'Rockets', bomb: 'Bombs' };
const PRODUCER = {}, PRODUCER_K = {}; for (const [k, b] of Object.entries(BUILDINGS)) for (const u of b.units) { PRODUCER[u] = b.name; PRODUCER_K[u] = k; }
const BLD_TYPES = Object.keys(BUILDINGS);
const BLD_BR = { hq: { name: 'Command', icon: '⭐', color: '#e6e6e6' }, eco: { name: 'Economy', icon: '💲', color: '#ffd65a' } };
const bldBr = (k) => { const br = BUILDINGS[k].br; return br ? BLD_BR[br] || { name: BRANCHES[br].name, icon: BR_ICON[br], color: BRANCHES[br].color } : BLD_BR.hq; };
const BLD_COLOR = '#b48cff';
const TYPES = BR_ORDER.flatMap((br) => Object.keys(UNITS).filter((t) => UNITS[t].br === br));
const PREF_KEY = 'frontline.guide.v1', RINGS_KEY = 'frontline.rings.v1';   // ring toggles are shared with Unit Explore

const G = { rings: true, nums: true, open: false, tab: 'units', filter: 'all', sort: { k: 'order', dir: 1 }, picks: [], common: false, tuned: null, from: 'menu', onClose: null, opts: {} };
try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); if (p.filter) G.filter = p.filter; if (p.sort) G.sort = p.sort; if (Array.isArray(p.picks)) G.picks = p.picks.filter((t) => UNITS[t]).slice(0, 2); G.common = !!p.common; } catch { /* ignore */ }
try { const r = JSON.parse(localStorage.getItem(RINGS_KEY) || 'null'); if (r) { G.rings = r.rings !== false; G.nums = r.nums !== false; } } catch { /* ignore */ }
const saveRings = () => { try { localStorage.setItem(RINGS_KEY, JSON.stringify({ rings: G.rings, nums: G.nums })); } catch { /* ignore */ } };
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ filter: G.filter, sort: G.sort, picks: G.picks, common: G.common })); } catch { /* ignore */ } };
let root = null;

// ---------- data ----------
function effVs(t) { const d = UNITS[t].vs, o = G.tuned?.[t]?.vs || {}; const v = {}; for (const b of BODY_KEYS) v[b] = { lvl: o[b]?.lvl ?? d[b].lvl, rng: o[b]?.rng ?? d[b].rng, acc: o[b]?.acc ?? d[b].acc ?? 3 }; return v; }
const effVis = (t) => G.tuned?.[t]?.vis ?? UNITS[t].vis;
function isTuned(t, b) { const d = UNITS[t]; if (b === 'vis') return effVis(t) !== d.vis; if (b) { const e = effVs(t)[b]; return e.lvl !== d.vs[b].lvl || e.rng !== d.vs[b].rng || e.acc !== (d.vs[b].acc ?? 3); } return BODY_KEYS.some((k) => isTuned(t, k)) || isTuned(t, 'vis'); }
const model = (t) => unitModel(UNITS[t], { vs: effVs(t), vis: effVis(t), bombThrow: G.opts.bombThrow, bombFall: G.opts.bombFall });
function ringsOf(m) {
  const out = [];
  for (const e of m.extras) out.push({ k: e.k, r: e.r, color: EXTRA[e.k].color, dashed: e.k !== 'vis' && e.k !== 'repair', label: `${EXTRA[e.k].icon} ${EXTRA[e.k].label} ${f0(e.r)}` });
  for (const c of m.rows) if (c.can) out.push({ k: c.k, r: c.r, color: c.color, dashed: false, label: `${c.icon} vs ${c.label} ${f0(c.r)}` });
  return out;
}
let COMMON_R = 0;
function commonR() { if (!COMMON_R) COMMON_R = Math.max(...TYPES.map((t) => Math.max(...ringsOf(model(t)).map((r) => r.r)))); return COMMON_R; }
function config(t) {
  const d = UNITS[t], ab = d.ability ? ABILITIES[d.ability] : null;
  const c = [['💲', 'Cost', '$' + d.cost], ['⏱️', 'Build time', d.time + ' s'], ['❤️', d.men ? 'Men × hp' : 'HP', d.men ? `${d.men} × ${d.hpm} = ${d.hp}` : d.hp], ['🏃', 'Speed', d.speed]];
  if (d.turn) c.push(['↻', 'Turn', d.turn]);
  c.push(['🔫', 'Weapon', d.wpn ? WPN[d.wpn] || d.wpn : 'none'], ['💥', 'Damage', d.dmg ?? '—'], ['⏳', 'Rate of fire', d.rof ? `1 / ${d.rof} s` : d.wpn ? 'per run' : '—']);
  if (d.splash) c.push(['💢', 'Splash', d.splash]);
  if (d.ammo) c.push(['🚀', 'Ammo', d.ammo + (d.wpn === 'bomb' ? ' run (6 bombs)' : ' run (2 rocket pairs)')]);
  if (d.alt) c.push(['☁️', 'Altitude', d.alt]);
  if (d.deploy) c.push(['⚙️', 'Set-up time', d.deploy + ' s']);
  if (d.front) c.push(['🛡️', 'Front armor', `takes ×${d.front}`]);
  if (d.loiter) c.push(['🔄', 'Loiter radius', d.loiter]);
  c.push(['✨', 'Ability', ab ? `${ab.name} (${ab.label}) · cd ${ab.cd} s` : '—'], ['🏭', 'Built at', PRODUCER[t] || '—', PRODUCER_K[t]]);
  return c;
}
const apips = (a) => `<span class="gapips" aria-label="accuracy ${a}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= a ? 'on' : ''}"></i>`).join('')}</span>`;
const pips = (l) => `<span class="gpips" aria-label="level ${l}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}</span>`;

// ---------- ring diagram (SVG, to scale) ----------
function niceStep(R) { const raw = R / 2.5; for (const s of [5, 10, 20, 25, 50, 100]) if (s >= raw) return s; return 100; }
function ringSvg(t, size = 150) {
  const m = model(t), rings = ringsOf(m).sort((a, b) => b.r - a.r);
  const R = G.common ? commonR() : Math.max(10, ...rings.map((r) => r.r)), k = 88 / R;
  let prev = Infinity, stack = 0, lastY = -999;
  const nums = [];
  const circles = rings.map((r) => {
    if (Math.abs(r.r - prev) < .8) stack++; else stack = 0; prev = r.r;
    const rr = Math.max(1, r.r * k - stack * 2.4);
    if (G.nums && stack === 0) { const y = Math.max(-96, -rr * .72 - 2); if (Math.abs(y - lastY) >= 9) { lastY = y; nums.push(`<text class="grn" x="${(rr * .69 + 2).toFixed(1)}" y="${y.toFixed(1)}" fill="${r.color}" font-size="10" font-weight="700">${f0(r.r)}</text>`); } }
    if (!G.rings) return '';
    return `<circle r="${rr.toFixed(1)}" fill="none" stroke="${r.color}" stroke-width="${r.k === 'vis' ? 1.2 : 2.2}" ${r.dashed ? 'stroke-dasharray="5 4"' : ''} opacity="${r.k === 'vis' ? .6 : .95}"><title>${esc(r.label)}</title></circle>`;
  }).join('');
  const step = niceStep(R), w = step * k;
  return `<svg class="gring" viewBox="-100 -100 200 200" width="${size}" height="${size}" role="img" aria-label="${esc(UNITS[t].name)} rings to scale">
    <circle r="98" fill="rgba(255,255,255,.03)"/>${circles}${nums.join('')}
    <circle r="3.2" fill="#4aa3ff" stroke="#fff" stroke-width="1"/>
    <g transform="translate(${(-92).toFixed(1)} 93)"><path d="M0 0h${w.toFixed(1)}" stroke="#cfd8e1" stroke-width="2"/><path d="M0 -3v6M${w.toFixed(1)} -3v6" stroke="#cfd8e1" stroke-width="1.5"/><text x="${(w / 2).toFixed(1)}" y="-5" fill="#cfd8e1" font-size="11" text-anchor="middle">${step} m</text></g>
  </svg>`;
}

// ---------- unit card ----------
function matrixHtml(t) {
  const m = model(t);
  const rows = m.rows.map((c) => `<div class="gm-row ${c.can ? '' : 'cant'} ${isTuned(t, c.k) ? 'tuned' : ''}" data-b="${c.k}" style="--c:${c.color}" title="${esc(c.note)}">
      <span class="gm-name"><i class="sw"></i>${c.icon} ${c.label}</span>
      ${c.lvl > 0 ? pips(c.lvl) : '<span class="gm-no">can\'t hit</span>'}
      <span class="gm-rng">${c.lvl > 0 ? f0(c.r || c.rng) : '—'}</span>
      <span class="gm-mult">${c.lvl > 0 ? '×' + c.mult : ''}</span>
      <span class="gm-accp" title="accuracy level ${c.acc}">${c.accInfo.kind !== 'none' ? apips(c.acc) : ''}</span>
      ${c.accInfo.text ? `<span class="gm-acc">🎯 ${esc(c.accInfo.text)}</span>` : ''}${isTuned(t, c.k) ? `<em class="gtag" title="config.js: L${UNITS[t].vs[c.k].lvl} / ${UNITS[t].vs[c.k].rng}">tuned</em>` : ''}
    </div>`).join('');
  const extras = m.extras.map((e) => `<div class="gx ${e.k === 'vis' && isTuned(t, 'vis') ? 'tuned' : ''}" style="--c:${EXTRA[e.k].color}" title="${esc(e.note)}"><i class="sw ${e.k !== 'vis' && e.k !== 'repair' ? 'dash' : ''}"></i>${EXTRA[e.k].icon} ${EXTRA[e.k].label} <b>${f0(e.r)}</b>${e.k === 'vis' && isTuned(t, 'vis') ? ` <em class="gtag" title="config.js: ${UNITS[t].vis}">tuned</em>` : ''}</div>`).join('');
  return `<div class="gm"><div class="gm-head"><span>Body</span><span>Level</span><span>Rng</span><span>Dmg</span><span>Acc</span></div>${rows}</div><div class="gxs">${extras}</div>`;
}
function cardHtml(t, compact = false) {
  const d = UNITS[t], ab = d.ability ? ABILITIES[d.ability] : null, tuned = isTuned(t);
  return `<article class="gcard ${compact ? 'compact' : ''}" data-unit="${t}" style="--c:${BRANCHES[d.br].color}">
    <header>${svg(t, 'blue')}<div><b>${esc(d.name)}</b><small>${BR_ICON[d.br]} ${BRANCHES[d.br].name} · body <span class="gbt">${BODIES[d.body].icon} ${BODIES[d.body].name}</span>${tuned ? ' · <em class="gtag">tuned</em>' : ''}</small></div>
      ${compact ? '' : `<button class="gpick ${G.picks.includes(t) ? 'on' : ''}" data-pick="${t}" title="Add to the side-by-side compare">⚖️</button>`}</header>
    <div class="gtop"><div class="gleft">${matrixHtml(t)}</div><div class="gright">${ringSvg(t, compact ? 128 : 150)}</div></div>
    <div class="gcfg">${config(t).map(([i, k, v, bk]) => bk ? `<button class="glink" data-gotob="${bk}" title="Show the ${esc(v)} card"><i>${i}</i>${esc(k)}<b>${esc(v)}</b></button>` : `<span><i>${i}</i>${esc(k)}<b>${esc(v)}</b></span>`).join('')}</div>
    <p class="gdesc">${esc(d.desc)}${ab ? ` <b>${esc(ab.name)}:</b> ${esc(ab.desc)}` : ''}</p>
  </article>`;
}
function legendHtml() {
  return `<details class="glegend"><summary>🎯 Accuracy, cover &amp; moving targets <small>tap to open</small></summary><div class="glg">${ACC_LEGEND.map(([i, k, v]) => `<div><i>${i}</i><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}<div><i>⭕</i><b>Rings</b><span>${Object.entries(BODY_COLOR).map(([b, c]) => `<em style="color:${c}">━ ${BODIES[b].name}</em>`).join(' ')} · dashed = special (min range, rocket window, bomb release, deploy, satchel)</span></div></div></details>`;
}
// ---------- building cards ----------
const incomeOf = (k) => (k === 'hq' ? HQ_INCOME : k === 'depot' ? DEPOT_INCOME : 0);
function placeRules(k) {
  if (k === 'hq') return ['Placed at the start of the match: one per side, cannot be built or moved.', `Anchors your build radius: ${BUILD_RADIUS} m around it.`, 'If it is destroyed you lose the match (sandbox: only with "HQ win rules" on).', 'Always visible to both sides.'];
  if (k === 'depot') return ['Must sit on a free $ supply spot (snaps to the nearest one within 9 m).', `Within ${BUILD_RADIUS + 10} m of your HQ or a finished building, OR within 30 m of your own ground troops (lets you grab far spots).`, 'Not while visible enemy ground troops are within 14 m of the spot.'];
  return [`Within ${BUILD_RADIUS} m of your HQ or any finished building of yours.`, 'Not on water, forest or road; ground must be fairly flat (≤ 3 m height difference).', 'At least 3 m clear of other buildings; keeps supply spots and units clear.'];
}
function bldDamagers(k) {
  return TYPES.map((t) => ({ t, v: effVs(t).bld })).filter((o) => o.v.lvl > 0)
    .sort((a, b) => b.v.lvl - a.v.lvl || (UNITS[b.t].dmg || 0) * LVL_MULT[b.v.lvl] - (UNITS[a.t].dmg || 0) * LVL_MULT[a.v.lvl] || b.v.rng - a.v.rng);
}
function bldConfig(k) {
  const b = BUILDINGS[k], inc = incomeOf(k);
  const c = [['💲', 'Cost', b.cost ? '$' + b.cost : 'free (start)'], ['⏱️', 'Build time', b.time ? b.time + ' s' : '—'], ['❤️', 'HP', b.hp], ['📐', 'Footprint', `${f0(b.hx * 2)} × ${f0(b.hz * 2)} m`], ['↕️', 'Height', b.h + ' m'], ['👁', 'Vision', VISION_BLD]];
  if (inc) c.push(['💰', 'Income', `+$${f0(inc * 60)}/min`]);
  c.push(['🏗️', 'Build radius', `${BUILD_RADIUS} m${k === 'hq' ? '' : ' once finished'}`]);
  return c;
}
function bldCardHtml(k) {
  const b = BUILDINGS[k], br = bldBr(k), dm = bldDamagers(k), sat = DMG_MULT.satchel?.bld;
  const prod = b.units.length ? b.units.map((t) => `<button class="gchip" data-goto="${t}" title="Show the ${esc(UNITS[t].name)} card">${svg(t, 'blue')}<span>${esc(UNITS[t].name)}</span><small>$${UNITS[t].cost}</small></button>`).join('') : '<span class="gnone">— no units</span>';
  const dmRow = ({ t, v }, i) => `<div class="gdm ${i < 3 ? 'top' : ''}"><button class="gdm-u" data-goto="${t}">${svg(t, 'blue')}${esc(UNITS[t].name)}</button>${pips(v.lvl)}<span class="gm-mult">×${LVL_MULT[v.lvl]}</span><span class="gm-rng">${v.rng} m</span><span class="gdm-d" title="damage per shot vs buildings">${f0((UNITS[t].dmg || 0) * LVL_MULT[v.lvl])}</span></div>`;
  const dmg = dm.slice(0, 6).map(dmRow).join('') + (dm.length > 6 ? `<details class="gmore"><summary>all ${dm.length} units that can hit buildings</summary>${dm.slice(6).map((o, i) => dmRow(o, i + 6)).join('')}</details>` : '');
  return `<article class="gcard gbld" data-bld="${k}" style="--c:${br.color}">
    <header>${svg(k, 'blue')}<div><b>${esc(b.name)}</b><small>${br.icon} ${br.name} · body <span class="gbt">${BODIES.bld.icon} ${BODIES.bld.name}</span></small></div></header>
    <div class="gcfg">${bldConfig(k).map(([i, kk, v]) => `<span><i>${i}</i>${esc(kk)}<b>${esc(v)}</b></span>`).join('')}</div>
    <div class="gbsec"><h4>🏭 Produces</h4><div class="gchips">${prod}</div></div>
    <div class="gbsec"><h4>📍 Placement</h4><ul class="grules">${placeRules(k).map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>
    <div class="gbsec gdmg"><h4>💣 Damages it best <small>level vs Building · ×dmg · range · dmg/shot</small></h4><div class="gdm-list">${dmg}</div>${sat ? `<p class="gnote">Commando satchel charge: ×${sat} vs buildings. Engineers repair buildings.</p>` : ''}</div>
    <p class="gdesc">${esc(b.desc || (k === 'hq' ? `Your command post. +$${f0(HQ_INCOME * 60)}/min. Lose it and you lose.` : ''))}</p>
  </article>`;
}
function bldGroupHtml() {
  return `<section class="ggroup" data-br="bld" style="--c:${BLD_COLOR}"><h3>${BODIES.bld.icon} Buildings <small>${BLD_TYPES.length}</small></h3><div class="ggrid">${BLD_TYPES.map(bldCardHtml).join('')}</div></section>`;
}
function unitsHtml() {
  return legendHtml() + BR_ORDER.filter((br) => G.filter === 'all' || G.filter === br).map((br) => {
    const list = TYPES.filter((t) => UNITS[t].br === br);
    return `<section class="ggroup" data-br="${br}" style="--c:${BRANCHES[br].color}"><h3>${BR_ICON[br]} ${BRANCHES[br].name} <small>${list.length}</small></h3><div class="ggrid">${list.map((t) => cardHtml(t)).join('')}</div></section>`;
  }).join('') + (G.filter === 'all' || G.filter === 'bld' ? bldGroupHtml() : '');
}
function bldTableHtml() {
  const atk = (k) => bldDamagers(k).slice(0, 3).map(({ t }) => `<button class="gdm-u" data-goto="${t}">${svg(t, 'blue')}</button>`).join('');
  const rows = BLD_TYPES.map((k) => { const b = BUILDINGS[k], br = bldBr(k), inc = incomeOf(k);
    return `<tr data-bld="${k}"><td class="gc-name" style="--c:${br.color}">${svg(k, 'blue')}${esc(b.name)}</td><td>${br.icon} ${br.name}</td><td>${b.cost ? '$' + b.cost : '—'}</td><td>${b.time ? b.time + ' s' : '—'}</td><td>${b.hp}</td><td>${f0(b.hx * 2)}×${f0(b.hz * 2)}</td><td>${inc ? '+$' + f0(inc * 60) : '—'}</td><td>${b.cost ? f0(b.hp / b.cost * 100) / 100 : '—'}</td><td class="gc-prod">${b.units.map((t) => `<button class="gdm-u" data-goto="${t}" title="${esc(UNITS[t].name)}">${svg(t, 'blue')}</button>`).join('') || '—'}</td><td class="gc-prod">${atk(k)}</td></tr>`; }).join('');
  return `<h3 class="gsub">🏠 Buildings <small>footprint in m · HP per $ · tap an icon for its card</small></h3><div class="gtable-wrap"><table class="gtable gbtable"><thead><tr><th>Building</th><th>Branch</th><th>💲</th><th>⏱️</th><th>❤️</th><th>📐</th><th>💰/min</th><th>HP/$</th><th>Produces</th><th>💣 Best vs it</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------- compare ----------
const COLS = [
  { k: 'name', label: 'Unit', val: (t) => UNITS[t].name },
  { k: 'body', label: 'Body', val: (t) => BODIES[UNITS[t].body].name },
  ...BODY_KEYS.map((b) => ({ k: 'vs.' + b, label: BODIES[b].icon, title: 'vs ' + BODIES[b].name + ' (level / range)', body: b, val: (t) => { const v = effVs(t)[b]; return v.lvl > 0 ? v.lvl * 1000 + v.rng : -1; } })),
  { k: 'vis', label: '👁', title: 'Vision', val: (t) => effVis(t) },
  { k: 'cost', label: '💲', title: 'Cost', val: (t) => UNITS[t].cost },
  { k: 'hp', label: '❤️', title: 'HP', val: (t) => UNITS[t].hp },
  { k: 'speed', label: '🏃', title: 'Speed', val: (t) => UNITS[t].speed },
  { k: 'dmg', label: '💥', title: 'Damage per shot', val: (t) => UNITS[t].dmg || 0 },
];
function sortedTypes() {
  const list = TYPES.filter((t) => G.filter === 'all' || UNITS[t].br === G.filter);
  const c = COLS.find((x) => x.k === G.sort.k);
  if (!c) return list;
  return [...list].sort((a, b) => { const va = c.val(a), vb = c.val(b); return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * G.sort.dir || TYPES.indexOf(a) - TYPES.indexOf(b); });
}
function cellVs(t, b) {
  const v = effVs(t)[b], tu = isTuned(t, b);
  if (v.lvl <= 0) return `<td class="gc-vs no ${tu ? 'tuned' : ''}" title="can't hit">—</td>`;
  return `<td class="gc-vs l${v.lvl} ${tu ? 'tuned' : ''}" style="--c:${BODY_COLOR[b]}" title="L${v.lvl} ×${LVL_MULT[v.lvl]} · range ${v.rng} · acc ${v.acc}: ${esc(accInfo(UNITS[t], b, v).text)}${tu ? ' (tuned)' : ''}"><b>${v.lvl}</b><small>${v.rng}</small><i class="gca">🎯${v.acc}</i></td>`;
}
function tableHtml() {
  const arrow = (k) => (G.sort.k === k ? (G.sort.dir > 0 ? ' ▲' : ' ▼') : '');
  const head = `<tr><th class="gc-pick">⚖️</th>${COLS.map((c) => `<th data-sort="${c.k}" title="${esc(c.title || c.label)} · click to sort" ${c.body ? `style="--c:${BODY_COLOR[c.body]}" class="gc-b"` : ''}>${c.label}${arrow(c.k)}</th>`).join('')}</tr>`;
  const rows = sortedTypes().map((t) => { const d = UNITS[t]; return `<tr data-unit="${t}" class="${G.picks.includes(t) ? 'picked' : ''}" style="--c:${BRANCHES[d.br].color}">
    <td class="gc-pick"><input type="checkbox" data-pick="${t}" ${G.picks.includes(t) ? 'checked' : ''} aria-label="Compare ${esc(d.name)}"></td>
    <td class="gc-name">${svg(t, 'blue')}<span>${esc(d.name)}</span>${isTuned(t) ? '<em class="gtag">tuned</em>' : ''}</td>
    <td class="gc-body">${BODIES[d.body].icon}</td>
    ${BODY_KEYS.map((b) => cellVs(t, b)).join('')}
    <td class="${isTuned(t, 'vis') ? 'tuned' : ''}">${effVis(t)}</td><td>${d.cost}</td><td>${d.hp}</td><td>${d.speed}</td><td>${d.dmg ?? '—'}</td></tr>`; }).join('');
  return `<div class="gtable-wrap"><table class="gtable"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}
const STATS = [
  ['💲 Cost', (t) => UNITS[t].cost, -1], ['⏱️ Build time', (t) => UNITS[t].time, -1], ['❤️ HP', (t) => UNITS[t].hp, 1], ['🏃 Speed', (t) => UNITS[t].speed, 1],
  ['💥 Damage', (t) => UNITS[t].dmg || 0, 1], ['⏳ Seconds per shot', (t) => UNITS[t].rof || 0, -1], ['👁 Vision', (t) => effVis(t), 1],
  ...BODY_KEYS.map((b) => [`${BODIES[b].icon} vs ${BODIES[b].name}`, (t) => effVs(t)[b], 0]),
  ...BODY_KEYS.map((b) => [`🎯 acc vs ${BODIES[b].name}`, (t) => { const v = effVs(t)[b]; return v.lvl > 0 ? v.acc : 0; }, 1]),
];
function sideHtml() {
  if (G.picks.length < 2) return `<div class="gside empty">⚖️ Tick <b>two</b> units in the table (or the ⚖️ on their cards) to compare them side by side.${G.picks.length ? ` Picked: <b>${esc(UNITS[G.picks[0]].name)}</b>` : ''}</div>`;
  const [a, b] = G.picks;
  const fmt = (v) => (typeof v === 'object' ? (v.lvl > 0 ? `L${v.lvl} · ${v.rng} m` : '—') : v || '—');
  const score = (v) => (typeof v === 'object' ? (v.lvl > 0 ? v.lvl * 1000 + v.rng : -1) : v);
  const rows = STATS.map(([label, fn, better]) => {
    const va = fn(a), vb = fn(b), sa = score(va), sb = score(vb);
    const dir = better === 0 ? 1 : better; const wa = sa !== sb && (sa - sb) * dir > 0 && !(better === -1 && !sa), wb = sa !== sb && (sb - sa) * dir > 0 && !(better === -1 && !sb);
    return `<tr><th>${label}</th><td class="${wa ? 'win' : ''}">${fmt(va)}</td><td class="${wb ? 'win' : ''}">${fmt(vb)}</td></tr>`;
  }).join('');
  return `<div class="gside"><div class="gside-head"><b>⚖️ ${esc(UNITS[a].name)} vs ${esc(UNITS[b].name)}</b><button data-ui="clearpicks">Clear</button></div>
    <table class="gvs"><thead><tr><th></th><th>${svg(a, 'blue')}${esc(UNITS[a].name)}</th><th>${svg(b, 'blue')}${esc(UNITS[b].name)}</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="gpair">${cardHtml(a, true)}${cardHtml(b, true)}</div></div>`;
}
function compareHtml() { if (G.filter === 'bld') return bldTableHtml(); return `${legendHtml()}${sideHtml()}<h3 class="gsub">📊 All units × 6 bodies <small>level (big) / range (small) / 🎯 accuracy · click a header to sort</small></h3>${tableHtml()}${G.filter === 'all' ? bldTableHtml() : ''}`; }

// ---------- shell ----------
function render() {
  if (!root) return;
  root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === G.tab));
  root.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('on', b.dataset.filter === G.filter));
  $('#gcommon', root).checked = G.common;
  for (const [id, on] of [['#grings', G.rings], ['#gnums', G.nums]]) { const b = $(id, root); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.querySelector('b').textContent = on ? 'on' : 'off'; }
  $('#gtuned', root).hidden = !G.tuned || !TYPES.some((t) => isTuned(t));
  const body = $('#gbody', root), y = body.scrollTop;
  body.innerHTML = G.tab === 'units' ? unitsHtml() : compareHtml();
  body.scrollTop = y;
}
function buildDom() {
  root = document.createElement('div'); root.id = 'guide'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Unit Menu');
  root.innerHTML = `<div class="gwrap">
    <div class="ghead"><b class="gtitle">📖 Unit Menu</b>
      <nav class="gtabs"><button data-tab="units">📇 Units</button><button data-tab="compare">📊 Compare</button></nav>
      <button class="gclose" data-ui="close" aria-label="Close (Esc)">✕</button></div>
    <div class="gbar"><div class="gfilter">${[['all', '✳️ All'], ...BR_ORDER.map((b) => [b, BR_ICON[b] + ' ' + BRANCHES[b].name]), ['bld', '🏠 Buildings']].map(([k, l]) => `<button data-filter="${k}">${l}</button>`).join('')}</div>
      <label class="gchk" title="Draw every ring diagram at the same scale (largest range)"><input type="checkbox" id="gcommon"> same scale</label>
      <button class="gtgl" data-ui="rings" id="grings" title="Show / hide the rings in the diagrams">⭕ <b></b></button><button class="gtgl" data-ui="nums" id="gnums" title="Show / hide the ring numbers">🔢 <b></b></button>
      <span id="gtuned" class="gtag big" hidden>🎛 showing your examiner tuning</span></div>
    <div id="gbody" class="gbody"></div></div>`;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => {
    const el = e.target.closest('button, th[data-sort]'); if (!el) return;
    if (el.dataset.ui === 'close') return closeGuide();
    if (el.dataset.goto) return gotoCard('unit', el.dataset.goto);
    if (el.dataset.gotob) return gotoCard('bld', el.dataset.gotob);
    if (el.dataset.tab) { G.tab = el.dataset.tab; $('#gbody', root).scrollTop = 0; return render(); }
    if (el.dataset.filter) { G.filter = el.dataset.filter; savePrefs(); return render(); }
    if (el.dataset.sort) { G.sort = G.sort.k === el.dataset.sort ? { k: el.dataset.sort, dir: -G.sort.dir } : { k: el.dataset.sort, dir: el.dataset.sort === 'name' || el.dataset.sort === 'body' ? 1 : -1 }; savePrefs(); return render(); }
    if (el.dataset.pick) { togglePick(el.dataset.pick); if (G.tab === 'units' && G.picks.length === 2) { G.tab = 'compare'; $('#gbody', root).scrollTop = 0; } return render(); }
    if (el.dataset.ui === 'rings') { G.rings = !G.rings; saveRings(); return render(); }
    if (el.dataset.ui === 'nums') { G.nums = !G.nums; saveRings(); return render(); }
    if (el.dataset.ui === 'clearpicks') { G.picks = []; savePrefs(); return render(); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'gcommon') { G.common = e.target.checked; savePrefs(); render(); }
    if (e.target.dataset.pick) { togglePick(e.target.dataset.pick); render(); }
  });
  for (const ev of ['wheel', 'pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'contextmenu', 'dblclick']) root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
}
function gotoCard(kind, k) {
  const br = kind === 'unit' ? UNITS[k].br : 'bld';
  G.tab = 'units'; if (G.filter !== 'all' && G.filter !== br) G.filter = br; savePrefs(); render();
  const el = root.querySelector(kind === 'unit' ? `.ggroup .gcard[data-unit="${k}"]` : `.gcard[data-bld="${k}"]`); if (!el) return;
  el.scrollIntoView({ block: 'start' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
function togglePick(t) { const i = G.picks.indexOf(t); if (i >= 0) G.picks.splice(i, 1); else { G.picks.push(t); if (G.picks.length > 2) G.picks.shift(); } savePrefs(); }
function onKey(e) {
  if (!G.open) return;
  e.stopPropagation();   // the game underneath never sees keys while the guide is open
  if (e.type === 'keydown' && e.code === 'Escape') { e.preventDefault(); closeGuide(); }
}
// opts: { from: 'menu'|'play'|'examiner', tuned: {type:{vs,vis}} | null, bombThrow, bombFall, onClose }
export function openGuide(opts = {}) {
  if (!root) buildDom();
  G.opts = opts; G.tuned = opts.tuned && Object.keys(opts.tuned).length ? opts.tuned : null; G.from = opts.from || 'menu'; G.onClose = opts.onClose || null;
  if (opts.tab) G.tab = opts.tab;
  try { const r = JSON.parse(localStorage.getItem(RINGS_KEY) || 'null'); if (r) { G.rings = r.rings !== false; G.nums = r.nums !== false; } } catch { /* ignore */ }
  COMMON_R = 0;
  G.open = true; root.classList.add('on'); document.body.classList.add('guide-open');
  window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
  render();
  return true;
}
export function closeGuide() {
  if (!G.open) return;
  G.open = false; root.classList.remove('on'); document.body.classList.remove('guide-open');
  window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
  const cb = G.onClose; G.onClose = null; cb?.();
}
// test hooks
window.__guide = {
  setRings: (r, n) => { G.rings = !!r; G.nums = !!n; saveRings(); render(); },
  get open() { return G.open; }, get state() { return { rings: G.rings, nums: G.nums, tab: G.tab, filter: G.filter, sort: { ...G.sort }, picks: [...G.picks], common: G.common, tuned: !!G.tuned, from: G.from }; },
  setTab: (t) => { G.tab = t; render(); }, setFilter: (f) => { G.filter = f; render(); }, sortBy: (k, dir = -1) => { G.sort = { k, dir }; render(); },
  pick: (t) => { togglePick(t); render(); }, clearPicks: () => { G.picks = []; savePrefs(); render(); }, close: closeGuide,
  order: () => sortedTypes(), buildings: () => BLD_TYPES.slice(), goto: (kind, k) => gotoCard(kind, k),
};
