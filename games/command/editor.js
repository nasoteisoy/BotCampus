/* Command Layers · Objective Editor. Reads and writes the doctrine (doctrine.js) in localStorage.
   Phone-first, plain DOM + inline SVG diagrams, no dependencies. */
(() => {
'use strict';
const D = window.CLDoctrine;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = D.clone;
const RC = ['#e4573f', '#3f8fe4', '#e8c440', '#9fd36a', '#c77dff', '#ff9b6a'];
const FIRE = new Set(['sbf', 'suppress', 'overwatch', 'recon']);
const ASL = new Set(['assault', 'clear']);
let doc, savedJSON, tab = 'types', msg = null;
const open = new Set(['lv:coy', 'coy:seize', 'pl:assault', 'sm:assault', 'sc:attack']);
const pv = {}; // preview approach angle index per company type
function boot() {
  const L = D.load(); doc = L.doc; savedJSON = JSON.stringify(doc);
  if (L.raw && L.warnings.length) msg = { k: 'err', t: `Saved doctrine had ${L.warnings.length} invalid field(s); those use defaults: ${L.warnings.slice(0, 5).join(', ')}${L.warnings.length > 5 ? '…' : ''}` };
  const h = (location.hash || '').slice(1); if (TABS.some(t => t[0] === h)) tab = h;
  bind(); render();
}
const isDirty = () => JSON.stringify(doc) !== savedJSON;
const isCustom = () => !D.same(JSON.parse(savedJSON), D.DEFAULT_DOCTRINE);
const getP = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
function setP(path, v) { const ks = path.split('.'); let o = doc; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
const ty = (t) => doc.types[t] || { icon: '?', label: t };
const tyL = (t) => `${ty(t).icon} ${ty(t).label}`;

// ---------------------------------------------------------------- small widgets
const R2D = 180 / Math.PI;
function shown(v, kind) { const x = kind === 'deg' ? v * R2D : kind === 'pct' ? v * 100 : v; return String(Math.round(x * 10) / 10); }
function nf(path, label, hint = '', o = {}) {
  const v = getP(path), unit = o.unit || (o.kind === 'deg' ? '°' : o.kind === 'pct' ? '%' : '');
  return `<div class="nf${o.full ? ' full' : ''}"><label>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</label><div class="stp"><button data-stp="${path}" data-d="-1" aria-label="less">−</button><input inputmode="decimal" data-num="${path}" data-kind="${o.kind || ''}" data-step="${o.step || 1}" data-min="${o.min ?? ''}" data-max="${o.max ?? ''}" value="${shown(v, o.kind)}" aria-label="${esc(label)}">${unit ? `<span class="u">${esc(unit)}</span>` : ''}<button data-stp="${path}" data-d="1" aria-label="more">+</button></div></div>`;
}
const tog = (path, label, hint = '') => `<div class="tg full"><button class="sw${getP(path) ? ' on' : ''}" data-tog="${path}" aria-label="${esc(label)}" aria-pressed="${!!getP(path)}"></button><span>${esc(label)}${hint ? `<br><small class="hint">${esc(hint)}</small>` : ''}</span></div>`;
const seg = (path, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${getP(path) === v ? 'on' : ''}" data-set="${path}" data-val='${esc(JSON.stringify(v))}'>${esc(l)}</button>`).join('')}</div>`;
const sel = (path, opts, attr = 'data-sel') => `<select ${attr}="${path}">${opts.map(o => (o.group ? `<optgroup label="${esc(o.group)}">${o.items.map(([v, l]) => `<option value="${esc(v)}"${getP(path) === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>` : `<option value="${esc(o[0])}"${getP(path) === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`)).join('')}</select>`;
function grp(key, icon, title, sub, body) {
  const on = open.has(key);
  return `<section class="grp" data-g="${key}"><button class="gh" data-open="${key}" aria-expanded="${on}"><span class="ic">${icon}</span><span class="t"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="chev">${on ? '▾' : '▸'}</span></button>${on ? `<div class="gb">${typeof body === 'function' ? body() : body}</div>` : ''}</section>`;
}

// ---------------------------------------------------------------- labels
const TAG_L = { book: ['📘 Textbook', 'By-the-book and cautious leaders like it'], allIn: ['💥 All-in', 'Dumb, aggressive and glory-seeking leaders like it'], bunched: ['🫂 Bunched', 'Dumb leaders like it'], reserve: ['⏸ Keeps a reserve', 'Cautious and by-the-book leaders like it'], cutoff: ['✂ Cut-off', 'Aggressive leaders like it'] };
const PLACE_L = { fup: '⚔ Jump-off point, then attack the objective', fire: '🔥 Fire position looking at the objective', offset: '📍 Spot relative to the objective', behind: '⬇ Behind the objective, back toward the start', objective: '◎ On the objective itself' };
const SITE_L = { sweep: 'Swept fire spot (each one in the search list)', 'rank:0': 'Best fire spot', 'rank:1': '2nd best fire spot', 'rank:2': '3rd best fire spot', 'rank:3': '4th best fire spot', blind: 'Best spot with NO line of sight (a mistake)', last: 'Worst-scored spot', random: 'Random spot', apart: 'Any spot ≥ N m from the main fire spot', seeApart: 'Spot with line of sight ≥ N m from the main fire spot', role: 'Same spot as role' };
const GATE_L = [['', '— nothing'], ['sbf', '⏳ Fire support first'], ['rear', '🛡 Rearguard (last)']];
const SCORE_KIND_L = [['seize', 'Attack (needs fire support)'], ['clear', 'Clearance (fire support optional)'], ['assault', 'Platoon assault'], ['hold', 'Defence (needs depth)'], ['reserve', 'Reserve position'], ['cutoff', 'Cut-off / blocking'], ['screen', 'Screen'], ['recon', 'Recon'], ['sbf', 'Support by fire'], ['withdraw', 'Withdrawal'], ['other', 'Flat score']];
const LOOK_L = [['obj', 'the objective'], ['ahead', 'straight ahead'], ['none', 'nothing (cover only)']];
const PL_SPOT = { assault: ['start', 0, 85], clear: ['start', 0, 85], sbf: ['fire pos', 0, 120], recon: ['obs. pos', 0, 120], cutoff: ['cut-off pos', -80, -70] }; // schematic, shortened
const DRILL_L = { move: '➜ Move to', hold: '🛡 Hold', suppress: '🔥 Suppress', overwatch: '👁 Overwatch', assault: '⚔ Assault' };

// ---------------------------------------------------------------- diagrams (schematic: objective at the top, approach from the bottom; + side = right)
const back = Math.PI / 2;
const polar = (a, d) => ({ x: Math.cos(back + a) * d, y: Math.sin(back + a) * d });
const SITES = { 'rank:0': polar(0.35, 240), 'rank:1': polar(-0.35, 240), 'rank:2': polar(0.7, 205), 'rank:3': polar(-0.7, 285), blind: polar(0.06, 335), last: polar(1.35, 330), random: polar(-1.05, 255) };
function svgWrap(items, extra, small) {
  // items: {x,y} world points used for bounds
  let x0 = small ? -35 : -60, x1 = -x0, y0 = small ? -35 : -70, y1 = small ? 40 : 90;
  const m = small ? 20 : 30;
  for (const p of items) { x0 = Math.min(x0, p.x - m); x1 = Math.max(x1, p.x + m); y0 = Math.min(y0, p.y - m); y1 = Math.max(y1, p.y + m); }
  y1 += small ? 25 : 50; // room for the approach arrow
  const W = 360, H = small ? 290 : 230, pad = 14, k = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad) / (y1 - y0), small ? 2.4 : 1.3);
  const ox = W / 2 - (x0 + x1) / 2 * k, oy = H / 2 - (y0 + y1) / 2 * k;
  const S = (p) => [Math.round((p.x * k + ox) * 10) / 10, Math.round((p.y * k + oy) * 10) / 10];
  return { S, k, W, H, y1, open: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(extra || 'diagram')}"><defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="context-stroke"/></marker></defs><rect width="${W}" height="${H}" fill="#3a4a24"/>` };
}
function line(S, a, b, col, w, dash, head) { const [x1, y1] = S(a), [x2, y2] = S(b); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}${head ? ' marker-end="url(#ah)"' : ''} stroke-linecap="round"/>`; }
function shorten(a, b, r) { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return { x: b.x - dx / L * Math.min(r, L * 0.8), y: b.y - dy / L * Math.min(r, L * 0.8) }; }
function scaleBar(w) { const m = w.k * 100; const [x, y] = [w.W - 14 - m, w.H - 12]; return `<line x1="${x}" y1="${y}" x2="${x + m}" y2="${y}" stroke="#eef0e2" stroke-width="2"/><text x="${x + m / 2}" y="${y - 4}" fill="#eef0e2" font-size="10" text-anchor="middle">100 m</text>`; }
function marker(S, p, i, icon, extra = '') {
  const [x, y] = S(p);
  return `<g><circle cx="${x}" cy="${y}" r="12" fill="${RC[i % RC.length]}" stroke="#111" stroke-width="1.5"/><text x="${x}" y="${y + 4.5}" font-size="13" font-weight="800" text-anchor="middle" fill="#111">${i + 1}</text><text x="${x + 15}" y="${y - 6}" font-size="13">${icon}</text>${extra ? `<text x="${x}" y="${y + 25}" font-size="11" text-anchor="middle" fill="#ffe08a">${extra}</text>` : ''}</g>`;
}
function objRing(S, k, icon, r = 40) { const [x, y] = S({ x: 0, y: 0 }); return `<circle cx="${x}" cy="${y}" r="${Math.max(10, r * k)}" fill="rgba(233,197,90,.13)" stroke="#e9c55a" stroke-width="2.5" stroke-dasharray="6 4"/><text x="${x}" y="${y + 6}" font-size="17" text-anchor="middle">${icon}</text>`; }
function approach(w) { const [x] = w.S({ x: 0, y: 0 }), [, yb] = w.S({ x: 0, y: w.y1 - 6 }), [, yt] = w.S({ x: 0, y: 62 }); return yb - yt > 20 ? `<line x1="${x}" y1="${yb}" x2="${x}" y2="${yt}" stroke="rgba(255,255,255,.2)" stroke-width="7" marker-end="url(#ah)"/><text x="${x + 8}" y="${yb - 4}" font-size="10" fill="rgba(255,255,255,.6)">approach</text>` : ''; }
// company variant -> schematic role positions
function coyGeom(B, v, ang) {
  const a0 = ang == null ? 0 : ang, side = Math.sign(a0) || 1, sweep = B.search.sites.length ? SITES[B.search.sites[0]] : null;
  const got = [], out = [];
  v.roles.forEach((r, i) => {
    const pl = r.place; let p = null, aim = true, note = '';
    if (pl.kind === 'fup') p = polar((pl.sweep ? a0 : 0) + side * pl.off, pl.dist);
    else if (pl.kind === 'fire') {
      for (const c of pl.site) {
        const [kk, n] = c.split(':'), ref = sweep || got[0];
        if (kk === 'sweep') p = sweep; else if (kk === 'role') p = got[+n] || null;
        else if (kk === 'apart' || kk === 'seeApart') p = ref ? { x: ref.x + (ref.x >= 0 ? -1 : 1) * (+n + 10) * (kk === 'apart' ? 1 : 0.8), y: ref.y + (kk === 'apart' ? 15 : -25) } : null;
        else p = SITES[c] || null;
        if (p) { if (kk === 'blind') note = '🚫👁'; if (kk === 'random') note = '🎲'; break; }
      }
      got[i] = p;
      if (!p) note = '⚠ no spot';
    } else if (pl.kind === 'offset') { const sd = pl.mirror ? side : 1; p = { x: sd * pl.side, y: -pl.fwd }; aim = pl.aim === 'obj'; }
    else if (pl.kind === 'behind') { const sd = pl.mirror ? side : 1; p = { x: sd * pl.side, y: pl.dist }; aim = false; }
    else { p = { x: 0, y: 0 }; aim = false; }
    out.push({ p, aim, note, r });
  });
  return out;
}
function coySVG(t, vi) {
  const B = doc.coy[t], v = B.variants[vi], angs = B.search.angles, ang = angs.length ? angs[(pv[t] || 0) % angs.length] : null;
  const G = coyGeom(B, v, ang), pts = G.filter(g => g.p).map(g => g.p);
  const ghosts = [];
  if (angs.length > 1) v.roles.forEach((r) => { if (r.place.kind === 'fup' && r.place.sweep) for (const a of angs) if (a !== ang) ghosts.push(polar(a + (Math.sign(a) || 1) * r.place.off, r.place.dist)); });
  const w = svgWrap(pts.concat(ghosts), `${t} variant ${vi + 1}`), S = w.S;
  let s = w.open + scaleBar(w) + approach(w) + objRing(S, w.k, ty(t).icon);
  for (const g of ghosts) { const [x, y] = S(g); s += `<circle cx="${x}" cy="${y}" r="4" fill="rgba(255,255,255,.28)"/>`; }
  G.forEach((g, i) => {
    if (!g.p || !g.aim) return;
    const ty1 = g.r.type, end = shorten(g.p, { x: 0, y: 0 }, 42);
    if (ASL.has(ty1)) s += line(S, g.p, end, RC[i % RC.length], 3.5, '', true);
    else if (FIRE.has(ty1)) s += line(S, g.p, end, '#ff9b6a', 2, '2 5', false);
    else s += line(S, g.p, end, RC[i % RC.length], 2, '6 5', true);
  });
  G.forEach((g, i) => { if (g.p) s += marker(S, g.p, i, ty(g.r.type).icon, [g.r.gate === 'sbf' ? '⏳🔥' : g.r.gate === 'rear' ? '🛡last' : '', g.r.mistake && B.search.wrongChance > 0 ? '❓' : '', g.note].filter(Boolean).join(' ')); });
  return s + '</svg>';
}
function plSVG(t, vi) {
  const B = doc.pl[t], v = B.variants[vi], spot = PL_SPOT[t];
  const X = { x: 0, y: 0 }, F = spot ? { x: spot[1], y: spot[2] } : X;
  const pt = (sp) => { const b = sp.base === 'obj' ? X : F; return { x: b.x + sp.side, y: b.y - sp.fwd, b }; };
  const G = v.roles.map(r => ({ r, pos: r.pos ? pt(r.pos) : null, tgt: pt(r.target) }));
  const pts = [F]; G.forEach(g => { if (g.pos) pts.push(g.pos); pts.push(g.tgt); });
  const w = svgWrap(pts, `${t} variant ${vi + 1}`, true), S = w.S;
  let s = w.open + scaleBar(w) + approach(w) + objRing(S, w.k, ty(t).icon, 22);
  if (spot) { const [x, y] = S(F); s += `<text x="${x}" y="${y + 7}" font-size="22" text-anchor="middle" fill="rgba(255,255,255,.75)">◇</text><text x="${x - 16}" y="${y + 4}" font-size="10" text-anchor="end" fill="#fff">${spot[0]}</text>`; }
  G.forEach((g, i) => {
    const c = RC[i % RC.length];
    for (const [sp, p] of [[g.r.pos, g.pos], [g.r.target, g.tgt]]) {
      if (!sp || !p) continue;
      if (sp.pick) { const [x, y] = S(p); s += `<circle cx="${x}" cy="${y}" r="${Math.max(4, sp.pick * w.k)}" fill="none" stroke="${c}" stroke-opacity=".6" stroke-dasharray="3 3"/>`; }
      if (sp.pick && sp.look === 'ahead') s += line(S, p, { x: p.x, y: p.b.y - sp.lookFwd }, '#ff9b6a', 1.5, '2 4', true);
    }
    if (g.pos) {
      const tgt = g.tgt;
      if (g.r.type === 'assault') s += line(S, g.pos, shorten(g.pos, tgt, 10), c, 3, '', true);
      else if (FIRE.has(g.r.type)) s += line(S, g.pos, tgt, '#ff9b6a', 1.8, '2 5', false);
      else s += line(S, g.pos, tgt, c, 1.5, '5 4', true);
    }
  });
  G.forEach((g, i) => { s += marker(S, g.pos || g.tgt, i, ty(g.r.type).icon); });
  return s + '</svg>';
}
function redrawDia(el) {
  const box = el.closest('[data-var]'); if (!box) return;
  const [lv, t, vi] = box.dataset.var.split(':');
  const d = box.querySelector('.dia'); if (d && doc[lv] && doc[lv][t] && doc[lv][t].variants[+vi]) d.innerHTML = lv === 'coy' ? coySVG(t, +vi) : plSVG(t, +vi);
}

// ---------------------------------------------------------------- tabs
const TABS = [['types', '🏷 Task types'], ['coy', '🗺 Company maps'], ['pl', '🗺 Platoon maps'], ['drills', '⚙ Section drills'], ['score', '📊 Scoring'], ['data', '⇅ Import / Export']];
function renderTypes() {
  const lvN = { coy: 'Company objectives', pl: 'Platoon tasks', sec: 'Section tasks' };
  let h = `<p class="intro">Each level can only be given the task types switched on here (they show up as the objective chips in the game's Orders panel). Rename and re-icon any task type below.</p>`;
  for (const lv of ['coy', 'pl', 'sec']) {
    const on = doc.levels[lv];
    h += grp('lv:' + lv, lv === 'coy' ? '🅰' : lv === 'pl' ? '🅿' : '🆂', lvN[lv], `${on.length} allowed: ${on.map(t => ty(t).icon).join(' ')}`, () => {
      let b = '<div class="hint">Allowed types (top to bottom = order of the chips in the game):</div>';
      on.forEach((t, i) => { b += `<div class="lvrow"><span style="font-size:20px">${ty(t).icon}</span><div class="nm"><b>${esc(ty(t).label)}</b>${lv !== 'sec' && !doc[lv === 'coy' ? 'coy' : 'pl'][t] ? `<small>${lv === 'coy' ? '⚠ no company map yet: create one in 🗺 Company maps' : 'uses the Hold breakdown'}</small>` : ''}</div><button data-act="lvUp" data-a="${lv}:${i}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="sw on" data-act="lvTog" data-a="${lv}:${t}" aria-label="Allowed" ${on.length < 2 ? 'disabled' : ''}></button></div>`; });
      const offT = D.TYPE_IDS.filter(t => !on.includes(t));
      if (offT.length) b += '<div class="lbl">Not allowed</div>';
      for (const t of offT) {
        const noSM = lv === 'sec' && !D.SEC_SM.includes(t);
        b += `<div class="lvrow off"><span style="font-size:20px">${ty(t).icon}</span><div class="nm"><b>${esc(ty(t).label)}</b>${noSM ? '<small>sections have no drill for this</small>' : ''}</div><button class="sw" data-act="lvTog" data-a="${lv}:${t}" ${noSM ? 'disabled' : ''} aria-label="Allow"></button></div>`;
      }
      return b;
    });
  }
  h += grp('cat', '🏷', 'Icons and labels', `${D.TYPE_IDS.length} task types`, () => D.TYPE_IDS.map(t => `<div class="tyrow"><input class="ic" data-txt="types.${t}.icon" value="${esc(ty(t).icon)}" maxlength="4" aria-label="${t} icon"><input data-txt="types.${t}.label" value="${esc(ty(t).label)}" maxlength="40" aria-label="${t} label"><span class="lvls">${['coy', 'pl', 'sec'].map(l => `<span class="${doc.levels[l].includes(t) ? 'on' : ''}">${l === 'coy' ? 'C' : l === 'pl' ? 'P' : 'S'}</span>`).join('')}</span></div>`).join('') + '<div class="hint">C / P / S = allowed for company / platoon / section.</div>');
  return h;
}
function tagChips(path) {
  const tags = getP(path);
  return `<div class="chips">${D.TAGS.map(t => `<button class="chip${tags.includes(t) ? ' on' : ''}" data-act="tag" data-a="${path}:${t}" title="${esc(TAG_L[t][1])}">${TAG_L[t][0]}</button>`).join('')}</div>`;
}
function varHead(lv, t, vi, n) {
  const p = `${lv}.${t}.variants.${vi}`;
  return `<div class="vh"><span class="vn">${vi === 0 ? '★ ' : ''}#${vi + 1}</span><input data-txt="${p}.name" value="${esc(getP(p + '.name'))}" aria-label="Variant name"></div>
    <div class="lbl">Style (commander tastes)</div>${tagChips(p + '.tags')}`;
}
function varActs(lv, t, vi, n) {
  const p = `${lv}.${t}.variants.${vi}`, k = getP(p + '.roles').length, who = lv === 'coy' ? 'platoon' : 'section';
  const note = k < 3 ? `Only ${k} role${k > 1 ? 's' : ''}: the spare ${who}${3 - k > 1 ? 's' : ''} will ${lv === 'coy' ? 'go into reserve' : 'hold at the platoon position'}.` : k > 3 ? `${k} roles for 3 ${who}s: ${lv === 'coy' ? 'the least important are' : 'the last ones are'} dropped.` : '';
  return `${note ? `<div class="hint">ℹ ${note}</div>` : ''}<div class="acts"><button data-act="addRole" data-a="${p}" ${getP(p + '.roles').length >= 6 ? 'disabled' : ''}>＋ Role</button><button data-act="dupVar" data-a="${p}">⧉ Duplicate</button><button data-act="upVar" data-a="${p}" ${vi ? '' : 'disabled'}>↑</button><button data-act="delVar" data-a="${p}" ${n < 2 ? 'disabled' : ''}>🗑 Delete</button></div>`;
}
function siteChain(path) {
  const chain = getP(path);
  let h = '';
  for (let i = 0; i < Math.min(3, chain.length + 1); i++) {
    const c = chain[i] || '', [k, n] = c.split(':');
    const opts = [['', i ? '— nothing else (variant skipped)' : '—']].concat(['sweep', 'rank:0', 'rank:1', 'rank:2', 'rank:3', 'blind', 'last', 'random'].map(x => [x, SITE_L[x]]), [['apart', SITE_L.apart], ['seeApart', SITE_L.seeApart]], [0, 1, 2, 3, 4, 5].map(r => ['role:' + r, `${SITE_L.role} ${r + 1}`]));
    const val = k === 'apart' || k === 'seeApart' ? k : c;
    h += `<div class="full nf"><label>${i === 0 ? 'Fire spot' : 'If none, then'}</label><div class="row"><select class="grow" data-chain="${path}" data-i="${i}">${opts.map(([v, l]) => `<option value="${esc(v)}"${val === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${k === 'apart' || k === 'seeApart' ? `<input style="width:76px" inputmode="numeric" data-chainn="${path}" data-i="${i}" value="${n}" aria-label="metres"><span class="hint">m</span>` : ''}</div></div>`;
    if (!c) break;
  }
  return h;
}
function coyRole(t, vi, ri, nRoles) {
  const p = `coy.${t}.variants.${vi}.roles.${ri}`, r = getP(p), pl = r.place, B = doc.coy[t];
  const typeOpts = [{ group: 'Platoon tasks', items: doc.levels.pl.map(x => [x, tyL(x)]) }, { group: 'Other', items: D.TYPE_IDS.filter(x => !doc.levels.pl.includes(x)).map(x => [x, tyL(x)]) }];
  let prm = '';
  if (pl.kind === 'fup') prm = nf(p + '.place.off', 'Angle off the approach', '+ toward the swept flank', { kind: 'deg', step: 5, min: -180, max: 180 }) + nf(p + '.place.dist', 'Distance from objective', '', { unit: 'm', step: 10, min: 0, max: 800 }) + tog(p + '.place.sweep', 'Use the swept approach angle', 'Off = always relative to the straight approach');
  else if (pl.kind === 'fire') prm = siteChain(p + '.place.site');
  else if (pl.kind === 'offset') prm = nf(p + '.place.fwd', 'Forward', '+ beyond / − short of it', { unit: 'm', step: 10 }) + nf(p + '.place.side', 'Side', '+ right / − left', { unit: 'm', step: 10 }) + `<div class="full nf"><label>The platoon's task is aimed at</label>${seg(p + '.place.aim', [['spot', '📍 the spot itself'], ['obj', '◎ the objective']])}</div>` + tog(p + '.place.mirror', 'Mirror to the assault flank', 'Side flips with the swept approach angle');
  else if (pl.kind === 'behind') prm = nf(p + '.place.dist', 'Distance behind', '', { unit: 'm', step: 10, min: 0, max: 800 }) + nf(p + '.place.side', 'Side', '+ right / − left', { unit: 'm', step: 10 }) + tog(p + '.place.mirror', 'Mirror to the assault flank');
  return `<div class="role" style="--rc:${RC[ri % RC.length]}"><div class="rh"><span class="rn">${ri + 1}</span>${sel(p + '.type', typeOpts)}<button data-act="delRole" data-a="${p}" ${nRoles < 2 ? 'disabled' : ''} aria-label="Delete role">✕</button></div>
    <div class="prm"><div class="full nf"><label>Placement</label><select data-kindsel="${p}.place">${D.COY_PLACES.map(k => `<option value="${k}"${pl.kind === k ? ' selected' : ''}>${esc(PLACE_L[k])}</option>`).join('')}</select></div>${prm}
    ${nf(p + '.imp', 'Importance', 'freshest platoon first', { step: 1, min: 1, max: 5 })}<div class="nf"><label>Wait for<small>gate</small></label>${sel(p + '.gate', GATE_L)}</div>
    ${B.search.wrongChance > 0 ? tog(p + '.mistake', 'May attack the wrong feature', `${Math.round(B.search.wrongChance * 100)}% chance (search settings)`) : ''}</div></div>`;
}
function renderCoy() {
  let h = `<p class="intro">How each company commander breaks his objective into 3 platoon tasks. He tries every variant (at every swept fire spot × approach angle), scores each plan with the 📊 Scoring weights, adds his own noise and tastes, and picks one. Variant ★#1 is the textbook answer. Diagrams are schematic: the real map picks spots with cover and line of sight.</p>`;
  const order = [...doc.levels.coy, ...D.TYPE_IDS.filter(t => !doc.levels.coy.includes(t) && doc.coy[t])];
  for (const t of order) {
    const B = doc.coy[t];
    if (!B) { h += grp('coy:' + t, ty(t).icon, ty(t).label, 'no map yet', `<p class="hint">Companies can be given this objective but have no plan for it.</p><button class="addv" data-act="mkCoy" data-a="${t}">＋ Create a map for ${esc(ty(t).label)} (copy of Hold)</button>`); continue; }
    h += grp('coy:' + t, ty(t).icon, ty(t).label, `${B.variants.length} variant${B.variants.length > 1 ? 's' : ''}${doc.levels.coy.includes(t) ? '' : ' · not allowed for companies'}`, () => {
      const p = `coy.${t}`, sr = B.search, angs = sr.angles;
      let b = grp('srch:' + t, '🔎', 'How he searches', `${sr.sites.length || 1} fire spot${sr.sites.length > 1 ? 's' : ''} × ${angs.length || 1} angle${angs.length > 1 ? 's' : ''} × ${B.variants.length} variant${B.variants.length > 1 ? 's' : ''} = ${(sr.sites.length || 1) * (angs.length || 1) * B.variants.length} plans tried · scored as ${(SCORE_KIND_L.find(x => x[0] === B.scoreAs) || ['', B.scoreAs])[1]}`, () => `<div>
        <div class="lbl">Fire spots to sweep</div><div class="chips">${sr.sites.map((c, i) => `<button class="chip x" data-act="delSite" data-a="${p}.search.sites:${i}">${esc(SITE_L[c] || c)}</button>`).join('') || '<span class="hint">none (one pass)</span>'}</div>
        <div class="row"><select class="grow" data-addsite="${p}.search.sites"><option value="">＋ add a fire spot…</option>${['rank:0', 'rank:1', 'rank:2', 'rank:3', 'blind', 'last', 'random'].map(x => `<option value="${x}">${esc(SITE_L[x])}</option>`).join('')}</select></div>
        <div class="lbl">Approach angles to sweep (0° = straight in)</div><div class="chips">${angs.map((a, i) => `<button class="chip x" data-act="delAng" data-a="${p}.search.angles:${i}">${shown(a, 'deg')}°</button>`).join('') || '<span class="hint">none (straight in only)</span>'}</div>
        <div class="row"><input class="grow" id="ang-${t}" inputmode="decimal" placeholder="angle in degrees, e.g. 45" aria-label="New angle"><button data-act="addAng" data-a="${p}.search.angles:${t}">＋ Add</button></div>
        <div class="prm">${nf(p + '.search.wrongChance', 'Wrong-target chance', 'per plan, for roles marked', { kind: 'pct', step: 1, min: 0, max: 100 })}<div class="nf"><label>Scored as<small>📊 rules used</small></label>${sel(p + '.scoreAs', SCORE_KIND_L)}</div>
        ${tog(p + '.search.styleTags', 'Tag plans frontal / blind / wrong target', 'So dumb leaders can prefer them')}</div></div>`);
      if (angs.length > 1) b += `<div class="row"><span class="hint grow">Diagram approach: ${shown(angs[(pv[t] || 0) % angs.length], 'deg')}° (dots = other swept angles)</span><button data-act="pv" data-a="${t}">↻ Next angle</button></div>`;
      B.variants.forEach((v, vi) => {
        b += `<div class="var" data-var="coy:${t}:${vi}">${varHead('coy', t, vi, B.variants.length)}<div class="dia">${coySVG(t, vi)}</div>
          ${v.roles.map((r, ri) => coyRole(t, vi, ri, v.roles.length)).join('')}${varActs('coy', t, vi, B.variants.length)}</div>`;
      });
      return b + `<button class="addv" data-act="addVar" data-a="coy.${t}">＋ Add variant</button>`;
    });
  }
  return h;
}
function pointEd(path, title, canNull) {
  const sp = getP(path);
  if (!sp) return `<div class="pt full"><b>${title}</b><div class="row"><span class="hint grow">none: goes straight to the target</span><button data-act="ptOn" data-a="${path}">＋ Add</button></div></div>`;
  return `<div class="pt full"><b>${title}</b>${canNull ? ` <button data-act="ptOff" data-a="${path}" style="float:right;min-height:34px">✕ none</button>` : ''}
    <div class="nf" style="margin-top:6px"><label>Measured from</label>${seg(path + '.base', [['obj', '◎ platoon target'], ['pos', '◇ platoon position']])}</div>
    <div class="prm">${nf(path + '.side', 'Side', '+ right / − left', { unit: 'm', step: 5 })}${nf(path + '.fwd', 'Forward', '+ ahead / − back', { unit: 'm', step: 5 })}
    ${nf(path + '.pick', 'Leader picks best spot within', '0 = exactly there', { unit: 'm', step: 5, min: 0, max: 200 })}
    ${sp.pick ? `<div class="nf"><label>…looking at<small>line of sight</small></label>${sel(path + '.look', LOOK_L)}</div>${sp.look === 'ahead' ? nf(path + '.lookFwd', 'Looks ahead', '', { unit: 'm', step: 10 }) : ''}` : ''}</div></div>`;
}
function renderPl() {
  let h = `<p class="intro">How each platoon commander breaks his task into 3 section tasks. ◎ is the platoon's target, ◇ its own position (jump-off point, fire position…; the target if it has none). He picks among the variants the same way, scored by the 📊 platoon rules. Task types without a map here use the Hold map.</p>`;
  const order = [...doc.levels.pl, ...D.TYPE_IDS.filter(t => !doc.levels.pl.includes(t) && doc.pl[t])];
  for (const t of order) {
    const B = doc.pl[t];
    if (!B) { h += grp('pl:' + t, ty(t).icon, ty(t).label, 'uses the Hold map', `<button class="addv" data-act="mkPl" data-a="${t}">＋ Create its own map (copy of Hold)</button>`); continue; }
    h += grp('pl:' + t, ty(t).icon, ty(t).label, `${B.variants.length} variant${B.variants.length > 1 ? 's' : ''}`, () => {
      let b = `<div class="row"><span class="hint grow">Scored as</span>${sel(`pl.${t}.scoreAs`, SCORE_KIND_L)}</div>`;
      B.variants.forEach((v, vi) => {
        b += `<div class="var" data-var="pl:${t}:${vi}">${varHead('pl', t, vi, B.variants.length)}<div class="dia">${plSVG(t, vi)}</div>`;
        v.roles.forEach((r, ri) => {
          const p = `pl.${t}.variants.${vi}.roles.${ri}`;
          b += `<div class="role" style="--rc:${RC[ri % RC.length]}"><div class="rh"><span class="rn">${ri + 1}</span>${sel(p + '.type', D.SEC_SM.map(x => [x, tyL(x)]))}<button data-act="delRole" data-a="${p}" ${v.roles.length < 2 ? 'disabled' : ''} aria-label="Delete role">✕</button></div>
            ${pointEd(p + '.pos', r.type === 'assault' ? '◇ Jump-off / position' : '◇ Position (where it goes)', true)}${pointEd(p + '.target', '◎ Target (what it aims at)', false)}</div>`;
        });
        b += varActs('pl', t, vi, B.variants.length) + '</div>';
      });
      return b + `<button class="addv" data-act="addVar" data-a="pl.${t}">＋ Add variant</button>`;
    });
  }
  return h;
}
function phase(n, icon, title, what, body, on, col) {
  return `<div class="ph${on === false ? ' skip' : ''}" style="--pc:${col || '#8fae5a'}"><div class="phh"><span class="n">${n}</span><span class="grow">${icon} ${esc(title)}${on === false ? ' (skipped)' : ''}</span></div><div class="what">${esc(what)}</div>${body ? `<div class="prm">${body}</div>` : ''}</div>`;
}
const arr = (t) => `<div class="arr">${esc(t)}</div>`;
function renderDrills() {
  const s = 'sm', A = doc.sm.assault;
  let h = `<p class="intro">What a section actually does with each task, step by step. Speeds multiply the base walking speed (× aggression). Pinned and broken can interrupt any step.</p>`;
  h += grp('sm:common', '🚶', 'All sections', 'base speed, aggression', () => `<div class="prm">${nf(s + '.common.speed', 'Base walking speed', '', { unit: 'm/s', step: 0.1, min: 0.05, max: 10 })}<span></span>${nf(s + '.common.aggr.0', 'Careful ×', '', { step: 0.05 })}${nf(s + '.common.aggr.1', 'Normal ×', '', { step: 0.05 })}${nf(s + '.common.aggr.2', 'Bold ×', '', { step: 0.05 })}</div>`);
  for (const t of ['move', 'hold']) h += grp('sm:' + t, ty(t).icon, ty(t).label, `move → in position`, () => `<div class="flow">${phase(0, '➜', 'Move to the spot', 'Walks the path to its spot.', nf(`${s}.${t}.speed`, 'Speed ×', '', { step: 0.05 }) + nf(`${s}.${t}.arrive`, 'Arrival distance', '', { unit: 'm', step: 0.5 }))}${arr(`arrived (≤ ${getP(`${s}.${t}.arrive`)} m)`)}${phase(1, '✅', t === 'hold' ? 'In position, holding' : 'Arrived', 'Task achieved; fires at anything it sees.')}</div>`);
  h += grp('sm:suppress', ty('suppress').icon, ty('suppress').label, 'move → fire', () => `<div class="flow">${phase(0, '➜', 'Move to the fire position', 'Progress counts 60% while moving.', nf(s + '.suppress.speed', 'Speed ×', '', { step: 0.05 }) + nf(s + '.suppress.arrive', 'Arrival distance', '', { unit: 'm', step: 0.5 }))}${arr('arrived')}${phase(1, '🔥', 'Fire on the target', 'Spreads fire over enemies near the target, least-suppressed first; area-fires at known but unseen enemy. Its platoon\'s fire support counts as started once it fires.', nf(s + '.suppress.engaged', 'Engaging if it fired within', '', { unit: 's', step: 1 }) + nf(s + '.suppress.focus', 'Targets enemy within', 'of the target', { unit: 'm', step: 5 }) + nf(s + '.suppress.range', 'Max range', '', { unit: 'm', step: 10 }) + nf(s + '.suppress.areaRange', 'Area fire range', '', { unit: 'm', step: 10 }), true, '#ff9b6a')}</div>`);
  h += grp('sm:overwatch', ty('overwatch').icon, ty('overwatch').label, 'move → watch', () => `<div class="flow">${phase(0, '➜', 'Move to the overwatch spot', '', nf(s + '.overwatch.speed', 'Speed ×', '', { step: 0.05 }) + nf(s + '.overwatch.arrive', 'Arrival distance', '', { unit: 'm', step: 0.5 }))}${arr('arrived = task achieved')}${phase(1, '👁', 'Watch and fire', 'Shoots at enemies near its target first.', nf(s + '.overwatch.focus', 'Targets enemy within', 'of the target', { unit: 'm', step: 5 }) + nf(s + '.overwatch.range', 'Max range', '', { unit: 'm', step: 10 }), true, '#8fb6ff')}</div>`);
  h += grp('sm:assault', ty('assault').icon, ty('assault').label, `${[A.jumpoff.on && 'jump-off', A.wait.on && 'wait', 'charge', A.consolidate.on && 'consolidate'].filter(Boolean).join(' → ')}`, () => `<div class="flow">
    ${phase(0, '➜', 'Move to the jump-off point', 'Skipped automatically if the section has no jump-off point.', tog(s + '.assault.jumpoff.on', 'Use this step') + (A.jumpoff.on ? nf(s + '.assault.jumpoff.speed', 'Speed ×', '', { step: 0.05 }) + nf(s + '.assault.jumpoff.arrive', 'Arrival distance', '', { unit: 'm', step: 0.5 }) : ''), A.jumpoff.on, '#8fae5a')}
    ${arr('at the jump-off point')}
    ${phase(1, '⏳', 'Wait', 'Waits for the other assault sections and for the platoon\'s gate (e.g. "wait for fire support" on the company map), then goes.', tog(s + '.assault.wait.on', 'Use this step', 'Off = charge straight away') + (A.wait.on ? tog(s + '.assault.wait.sync', 'Wait for the other assault sections') + (A.wait.sync ? nf(s + '.assault.wait.syncMax', 'Stop waiting for them after', '', { unit: 's', step: 5 }) : '<span></span>') + tog(s + '.assault.wait.gate', 'Obey the gate (fire support / rearguard)') + nf(s + '.assault.wait.maxWait', 'Go anyway after', '', { unit: 's', step: 10 }) : ''), A.wait.on, '#e9c55a')}
    ${arr(A.wait.on ? 'ready + gate open (or timed out)' : 'straight on')}
    ${phase(2, '⚔', 'Charge', 'Runs at the target. Suppressed defenders close to the bayonets lose morale fast.', nf(s + '.assault.charge.far', 'Speed × far out', '', { step: 0.05 }) + nf(s + '.assault.charge.close', 'Speed × final rush', '', { step: 0.05 }) + nf(s + '.assault.charge.closeDist', 'Final rush inside', '', { unit: 'm', step: 10 }) + nf(s + '.assault.charge.take', 'Taken when clear within', '', { unit: 'm', step: 5 }) + nf(s + '.assault.charge.shock', 'Shock radius', '', { unit: 'm', step: 5 }) + nf(s + '.assault.charge.shockSupp', 'Shock if suppression over', '', { step: 5 }) + nf(s + '.assault.charge.shockBase', 'Morale drain / s', '', { step: 0.1 }) + nf(s + '.assault.charge.shockAggr', '+ per aggression step', '', { step: 0.1 }), true, '#e4573f')}
    ${arr('objective clear = achieved')}
    ${phase(3, '🛡', 'Consolidate and mop up', 'Hunts enemy still near the objective, sweeps it for hidden ones, then settles on the target.', tog(s + '.assault.consolidate.on', 'Use this step', 'Off = just stop on the objective') + (A.consolidate.on ? ['radius:Mop-up radius:m:5', 'clearRadius:…on a Clear objective:m:5', 'hunt:Hunts enemy up to:m:10', 'memory:Remembers unseen enemy:s:5', 'closeIn:Closes to:m:1', 'huntSpeed:Hunt speed ×::0.05', 'sweepSpeed:Sweep speed ×::0.05', 'ring:Sweep ring (× radius)::0.05', 'back:Back to target if over:m:5'].map(x => { const [k, l, u, st] = x.split(':'); return nf(`${s}.assault.consolidate.${k}`, l, '', { unit: u, step: +st }); }).join('') : ''), A.consolidate.on, '#9fd36a')}
  </div>`);
  h += grp('sm:gates', '🚦', 'Platoon gates', 'fire support / rearguard timing', () => `<div class="prm">${nf(s + '.gates.sbfWait', 'Assault waits for fire support up to', '', { unit: 's', step: 10 })}${nf(s + '.gates.sbfEngaged', 'Fire support counts after firing for', '', { unit: 's', step: 1 })}${nf(s + '.gates.rearHold', 'Rearguard holds for', '', { unit: 's', step: 5 })}<span></span>${nf(s + '.gates.aggrScale.0', 'Careful: wait ×', '', { step: 0.05 })}${nf(s + '.gates.aggrScale.1', 'Normal: wait ×', '', { step: 0.05 })}${nf(s + '.gates.aggrScale.2', 'Bold: wait ×', '', { step: 0.05 })}</div>`);
  h += grp('sm:states', '⬇', 'Pinned and broken (British sections)', 'interrupt any step', () => `<div class="flow">${phase('any', '▶', 'Any step above', '')}
    ${arr(`suppression > ${doc.sm.pinned.at} + ${doc.sm.pinned.expBonus} × experience`)}
    ${phase('⬇', '', 'Pinned', 'Stops and hugs the ground. After a while it returns fire at whoever is pinning it, then resumes its task once the fire slackens.', nf(s + '.pinned.at', 'Pinned when suppression over', '', { step: 1 }) + nf(s + '.pinned.expBonus', '+ × experience', '', { step: 1 }) + nf(s + '.pinned.recover', 'Recovers under', '', { step: 1 }) + nf(s + '.pinned.returnFire', 'Returns fire after', '', { unit: 's', step: 1 }) + nf(s + '.pinned.expFaster', '− × experience', '', { unit: 's', step: 1 }) + nf(s + '.pinned.resume', 'Resumes task after OK for', '', { unit: 's', step: 1 }), true, '#ffd34a')}
    ${arr(`morale < ${doc.sm.broken.morale} or strength ≤ ${Math.round(doc.sm.broken.strength * 100)}%`)}
    ${phase('✖', '', 'Broken', 'Falls back toward the start line. Rallies when things calm down.', nf(s + '.broken.morale', 'Breaks when morale under', '', { step: 1 }) + nf(s + '.broken.strength', '…or strength at/under', '', { kind: 'pct', step: 5, min: 0, max: 100 }) + nf(s + '.broken.speed', 'Falls back at', '', { unit: 'm/s', step: 0.1 }) + nf(s + '.broken.rallySupp', 'Rallies: suppression under', '', { step: 1 }) + nf(s + '.broken.rallyMorale', '…morale over', '', { step: 1 }) + nf(s + '.broken.rallyDelay', '…broken for at least', '', { unit: 's', step: 1 }), true, '#ef6a5a')}</div>`);
  return h;
}
const SCORE_L = {
  attack: ['⚔', 'Attack plans (seize, clear, platoon assault)', [['supLos', 'Fire support sees the objective', 'pts'], ['supCover', 'Fire support in cover (× cover)', 'pts'], ['supRange', 'Fire support at a good range', 'pts'], ['supMin', '…good range from', 'm'], ['supMax', '…good range to', 'm'], ['clearNoSup', 'Clear without fire support', 'pts'], ['flank', 'Assault comes in from a flank', 'pts'], ['flankAngle', '…flank = angle off the fire line over', 'deg'], ['approach', 'Covered approach (× cover)', 'pts'], ['onTarget', 'Assault on the right target', 'pts'], ['onTargetDist', '…right target = within', 'm'], ['reserve', 'Has a reserve / cut-off / overwatch', 'pts'], ['base', 'Base points', 'pts']]],
  defend: ['🛡', 'Defence plans (hold, reserve, cut-off)', [['cover', 'Positions in cover (× cover)', 'pts'], ['depth', 'Depth (Hold only)', 'pts'], ['depthDist', '…depth = someone back by', 'm'], ['spacing', 'Good spacing', 'pts'], ['minGap', '…bunched if closer than', 'm'], ['maxGap', '…spread out if wider than', 'm'], ['fields', 'Fields of fire (× share)', 'pts'], ['fieldRange', '…field of fire checked to', 'm']]],
  screen: ['👁', 'Screen plans', [['spread', 'Spread out', 'pts'], ['minSpread', '…spread = wider than', 'm'], ['view', 'Can see the approaches (× share)', 'pts'], ['viewRange', '…checked to', 'm'], ['cover', 'Cover (× cover)', 'pts']]],
  recon: ['🔭', 'Recon plans', [['observer', 'Observers see the target', 'pts'], ['coveringFire', 'Covering fire', 'pts'], ['reserve', 'Someone held back', 'pts']]],
  sbf: ['🔥', 'Support-by-fire plans', [['seeing', 'Fire positions see the target (× share)', 'pts'], ['cover', 'Fire positions in cover (× cover)', 'pts'], ['reserve', 'Has a reserve', 'pts']]],
  withdraw: ['↩', 'Withdrawal plans', [['rearguard', 'Has a rearguard', 'pts'], ['near', 'Everyone ends near the rally point (× share)', 'pts'], ['nearDist', '…near = within', 'm']]],
  other: ['·', 'Anything else', [['base', 'Flat score', 'pts']]],
  sec: ['🆂', 'Section task quality', [['fireLos', 'Fire task: sees the target', 'pts'], ['fireCover', 'Fire task: cover (× cover)', 'pts'], ['fireRange', 'Fire task: good range', 'pts'], ['rangeMin', '…from', 'm'], ['rangeMax', '…to', 'm'], ['assaultBase', 'Assault: base', 'pts'], ['fupCover', 'Assault: jump-off in cover', 'pts'], ['approach', 'Assault: covered approach', 'pts'], ['runIn', 'Assault: short run in', 'pts'], ['runInMax', '…short = under', 'm'], ['holdCover', 'Hold: cover', 'pts'], ['holdField', 'Hold: field of fire', 'pts'], ['holdBase', 'Hold: base', 'pts'], ['moveBase', 'Move: base', 'pts'], ['moveApproach', 'Move: covered route', 'pts'], ['moveCover', 'Move: cover at the end', 'pts']]],
  prefs: ['🧠', 'Commander tastes (how leaders pick a plan)', [['noise', 'Misjudgement noise (× lack of judgment)', 'pts'], ['dumbBelow', 'Counts as dumb below judgment', 'pct'], ['dumbScale', 'Dumb bias strength', 'pts'], ['frontal', 'Dumb: likes frontal ×', ''], ['noLos', 'Dumb: likes blind fire spots ×', ''], ['allIn', 'Dumb: likes all-in ×', ''], ['bunched', 'Dumb: likes bunched ×', ''], ['wrong', 'Dumb: likes the wrong target ×', ''], ['aggressive', '🔥 Aggressive: cut-off / all-in bonus', 'pts'], ['cautious', '🐢 Cautious: reserve / textbook bonus', 'pts'], ['glory', '🏅 Glory-seeker: all-in bonus', 'pts'], ['book', '📘 By-the-book: textbook bonus', 'pts']]],
};
function renderScore() {
  let h = `<p class="intro">Plan quality (0–100) is the sum of these points. Commanders choose the plan that looks best to them, so changing a weight changes which variants get picked (and the quality badges in the game). Negative numbers make it a penalty.</p>`;
  for (const [k, [ic, title, rows]] of Object.entries(SCORE_L)) {
    h += grp('sc:' + k, ic, title, rows.filter(r => r[2] === 'pts').slice(0, 3).map(r => `${r[1].split(' (')[0]} ${getP(`score.${k}.${r[0]}`)}`).join(' · '), () => `<div class="prm">${rows.map(([f, l, u]) => nf(`score.${k}.${f}`, l, '', { unit: u === 'deg' || u === 'pct' ? '' : u, kind: u === 'deg' || u === 'pct' ? u : '', step: u === 'm' ? 5 : u === '' ? 0.1 : u === 'pct' ? 5 : 1, min: u === 'pct' ? 0 : undefined, max: u === 'pct' ? 100 : undefined })).join('')}</div>`);
  }
  return h;
}
function renderData() {
  const json = JSON.stringify(doc, null, 1);
  return `<p class="intro">Back up or share the doctrine as JSON. Import replaces the working copy (checked field by field; anything invalid falls back to the default), then tap 💾 Save.</p>
  ${msg ? `<div class="msg ${msg.k}">${esc(msg.t)}</div>` : ''}
  <h2>⬆ Export</h2><textarea id="exTxt" readonly aria-label="Exported JSON">${esc(json)}</textarea>
  <div class="acts"><button id="bCopy">📋 Copy</button><button id="bDown">💾 Download .json</button></div>
  <h2>⬇ Import</h2><textarea id="imTxt" placeholder='Paste doctrine JSON here: { "version": 1, ... }' aria-label="JSON to import"></textarea>
  <div class="acts"><button id="bImport" class="go">⬇ Import pasted JSON</button><label style="flex:1"><input type="file" id="imFile" accept=".json,application/json,text/plain" hidden><button style="width:100%" onclick="this.previousElementSibling.click()">📂 From file</button></label></div>
  <h2>↺ Defaults</h2><p class="hint">Reset puts every map, drill and weight back to how Dev B wrote the game (and clears the saved copy).</p><div class="acts"><button class="warn" data-act="reset">↺ Reset everything to defaults</button></div>`;
}
function renderStatus() {
  const d = isDirty(), c = isCustom();
  const st = $('st'); st.textContent = d ? '● Unsaved' : c ? '✎ Custom saved' : 'Default'; st.className = d ? 'dirty' : c ? 'custom' : '';
  $('bSave').disabled = !d;
  $('bSave').textContent = d ? '💾 Save' : '✓ Saved';
}
function render() {
  const y = window.scrollY, im = $('imTxt') ? $('imTxt').value : '';
  $('tabs').innerHTML = TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
  const f = { types: renderTypes, coy: renderCoy, pl: renderPl, drills: renderDrills, score: renderScore, data: renderData }[tab];
  $('main').innerHTML = (msg && tab !== 'data' ? `<div class="msg ${msg.k}">${esc(msg.t)}</div>` : '') + f();
  if (im && $('imTxt')) $('imTxt').value = im;
  renderStatus();
  window.scrollTo(0, y);
}
function toast(t, k = 'ok') { msg = { k, t }; render(); clearTimeout(toast.h); toast.h = setTimeout(() => { msg = null; document.querySelectorAll('#main .msg').forEach(e => e.remove()); }, 4500); }

// ---------------------------------------------------------------- actions
const newCoyRole = () => ({ type: 'reserve', place: { kind: 'behind', dist: 280, side: 40, mirror: false }, imp: 1, gate: '', mistake: false });
const newSecRole = () => ({ type: 'hold', pos: null, target: { base: 'pos', side: 0, fwd: -30, pick: 28, look: 'none', lookFwd: 200 } });
function act(a, arg, el) {
  const lastDot = (p) => { const i = p.lastIndexOf('.'); return [p.slice(0, i), +p.slice(i + 1)]; };
  switch (a) {
    case 'lvTog': { const [lv, t] = arg.split(':'), L = doc.levels[lv]; const i = L.indexOf(t); if (i >= 0) { if (L.length > 1) L.splice(i, 1); } else L.push(t); break; }
    case 'lvUp': { const [lv, i] = arg.split(':'), L = doc.levels[lv], k = +i; if (k > 0) [L[k - 1], L[k]] = [L[k], L[k - 1]]; break; }
    case 'tag': { const i = arg.lastIndexOf(':'), p = arg.slice(0, i), t = arg.slice(i + 1), tags = getP(p); const j = tags.indexOf(t); if (j >= 0) tags.splice(j, 1); else tags.push(t); break; }
    case 'addVar': { const B = getP(arg), lv = arg.split('.')[0]; const v = { id: 'v' + Date.now().toString(36), name: 'New variant', tags: [], roles: lv === 'coy' ? [newCoyRole(), newCoyRole(), newCoyRole()] : [newSecRole(), newSecRole(), newSecRole()] };
      if (lv === 'coy') { v.roles[0] = { type: 'assault', place: { kind: 'fup', off: 0, dist: 130, sweep: true }, imp: 3, gate: 'sbf', mistake: false }; v.roles[1] = { type: 'sbf', place: { kind: 'fire', site: ['sweep', 'rank:0'] }, imp: 2, gate: '', mistake: false }; }
      else { v.roles[0].target.side = -30; v.roles[1].target.side = 30; v.roles[2].target.fwd = -40; }
      B.variants.push(v); break; }
    case 'dupVar': { const [p, i] = lastDot(arg), L = getP(p), v = clone(L[i]); v.id = 'v' + Date.now().toString(36); v.name = v.name + ' (copy)'; L.splice(i + 1, 0, v); break; }
    case 'delVar': { const [p, i] = lastDot(arg), L = getP(p); if (L.length > 1) L.splice(i, 1); break; }
    case 'upVar': { const [p, i] = lastDot(arg), L = getP(p); if (i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]]; break; }
    case 'addRole': { const L = getP(arg + '.roles'); if (L.length < 6) L.push(arg.startsWith('coy') ? newCoyRole() : newSecRole()); break; }
    case 'delRole': { const [p, i] = lastDot(arg), L = getP(p); if (L.length > 1) L.splice(i, 1); break; }
    case 'ptOn': setP(arg, { base: 'pos', side: 0, fwd: 0, pick: 30, look: 'obj', lookFwd: 200 }); break;
    case 'ptOff': setP(arg, null); break;
    case 'delSite': case 'delAng': { const [p, i] = arg.split(':'); getP(p).splice(+i, 1); break; }
    case 'addAng': { const [p, t] = arg.split(':'), inp = $('ang-' + t), v = parseFloat(inp && inp.value); if (!isFinite(v) || Math.abs(v) > 180) { if (inp) inp.classList.add('bad'); return; } const L = getP(p); if (L.length < 9) L.push(v / R2D); break; }
    case 'pv': pv[arg] = (pv[arg] || 0) + 1; break;
    case 'mkCoy': doc.coy[arg] = clone(doc.coy.hold || D.DEFAULT_DOCTRINE.coy.hold); open.add('coy:' + arg); break;
    case 'mkPl': doc.pl[arg] = clone(doc.pl.hold || D.DEFAULT_DOCTRINE.pl.hold); open.add('pl:' + arg); break;
    case 'reset': confirmBox('Reset everything to defaults?', 'Every task type, objective map, drill and scoring weight goes back to the original. The saved custom doctrine is deleted.', [['↺ Reset', 'warn', () => { D.reset(); doc = D.defaults(); savedJSON = JSON.stringify(doc); toast('Reset to defaults ✓ (the game uses them on its next load)'); }], ['Cancel', '', null]]); return;
    default: return;
  }
  render();
}
function confirmBox(title, text, btns) {
  $('ovBox').innerHTML = `<h3>${esc(title)}</h3><p class="hint" style="font-size:14px">${esc(text)}</p><div class="acts">${btns.map(([l, c], i) => `<button class="${c}" data-ob="${i}">${esc(l)}</button>`).join('')}</div>`;
  $('ov').hidden = false;
  $('ovBox').onclick = (e) => { const b = e.target.closest('[data-ob]'); if (!b) return; $('ov').hidden = true; const f = btns[+b.dataset.ob][2]; if (f) f(); };
}
function save() {
  const r = D.save(doc);
  if (!r) { toast('Could not save (storage blocked?)', 'err'); return false; }
  doc = r.doc;
  if (D.same(doc, D.DEFAULT_DOCTRINE)) D.reset(); // identical to defaults: keep nothing
  savedJSON = JSON.stringify(doc);
  toast(r.warnings.length ? `Saved, but ${r.warnings.length} invalid field(s) were reset to defaults: ${r.warnings.slice(0, 4).join(', ')}` : 'Saved ✓ The game uses this doctrine next time it starts.', r.warnings.length ? 'err' : 'ok');
  return true;
}
function doImport(text) {
  const r = D.parse(text);
  if (!r.ok) { msg = { k: 'err', t: '✖ Import rejected. ' + r.error + ' Nothing was changed.' }; render(); return false; }
  doc = r.doc; if ($('imTxt')) $('imTxt').value = '';
  msg = { k: 'ok', t: `✓ Imported${r.warnings.length ? ` with ${r.warnings.length} field(s) reset to defaults (${r.warnings.slice(0, 4).join(', ')}${r.warnings.length > 4 ? '…' : ''})` : ''}. Tap 💾 Save to use it.` };
  render(); return true;
}
function numInput(el, commit) {
  const kind = el.dataset.kind, v = parseFloat(String(el.value).replace(',', '.'));
  const mn = el.dataset.min === '' ? -Infinity : +el.dataset.min, mx = el.dataset.max === '' ? Infinity : +el.dataset.max;
  if (!isFinite(v)) { el.classList.add('bad'); return; }
  let x = v; if (commit) { x = Math.min(mx, Math.max(mn, v)); if (x !== v) el.value = String(x); } else if (v < mn || v > mx) { el.classList.add('bad'); return; }
  el.classList.remove('bad');
  const path = el.dataset.num, cur = getP(path);
  let val = kind === 'deg' ? x / R2D : kind === 'pct' ? x / 100 : x;
  if (path.endsWith('.imp')) val = Math.round(val);
  if (shown(cur, kind) === String(x) && commit) return; // untouched: keep the exact stored value
  setP(path, val);
  redrawDia(el); renderStatus();
}
function bind() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, a'); if (!b) return;
    const d = b.dataset;
    if (b.id === 'back') { if (isDirty()) { e.preventDefault(); confirmBox('Unsaved changes', 'Save your edits before going back to the game?', [['💾 Save & play', 'go', () => { if (save()) location.href = 'index.html'; }], ['Discard', 'warn', () => { location.href = 'index.html'; }], ['Stay', '', null]]); } return; }
    if (d.tab) { tab = d.tab; history.replaceState(null, '', '#' + tab); window.scrollTo(0, 0); render(); return; }
    if (d.open) { open.has(d.open) ? open.delete(d.open) : open.add(d.open); render(); return; }
    if (d.tog) { setP(d.tog, !getP(d.tog)); render(); return; }
    if (d.set) { setP(d.set, JSON.parse(d.val)); render(); return; }
    if (d.stp) {
      const inp = b.parentElement.querySelector('input'), st = +inp.dataset.step || 1, cur = parseFloat(inp.value) || 0;
      inp.value = String(Math.round((cur + st * +d.d) * 1000) / 1000); numInput(inp, true); return;
    }
    if (d.act) { act(d.act, d.a, b); return; }
    if (b.id === 'bSave') { save(); return; }
    if (b.id === 'bReset') { act('reset'); return; }
    if (b.id === 'bCopy') { const t = $('exTxt'); const done = () => toast('Copied ✓'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, () => { t.select(); document.execCommand('copy'); done(); }); else { t.select(); document.execCommand('copy'); done(); } return; }
    if (b.id === 'bDown') { const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }), a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = 'command-doctrine.json'; document.body.appendChild(a2); a2.click(); setTimeout(() => { URL.revokeObjectURL(a2.href); a2.remove(); }, 500); return; }
    if (b.id === 'bImport') { doImport($('imTxt').value); return; }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.num) numInput(el, false);
    else if (el.dataset.txt) { const v = el.value; if (v.trim()) { setP(el.dataset.txt, v.slice(0, el.dataset.txt.endsWith('.name') ? 80 : 40)); el.classList.remove('bad'); } else el.classList.add('bad'); renderStatus(); }
    else if (el.dataset.chainn) { const n = parseInt(el.value, 10); if (!(n >= 0 && n <= 999)) { el.classList.add('bad'); return; } el.classList.remove('bad'); const L = getP(el.dataset.chainn), i = +el.dataset.i; L[i] = L[i].split(':')[0] + ':' + n; redrawDia(el); renderStatus(); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target, d = el.dataset;
    if (d.num) { numInput(el, true); return; }
    if (d.txt) { render(); return; }
    if (d.sel) { setP(d.sel, el.value); render(); return; }
    if (d.kindsel) { setP(d.kindsel, Object.assign({ kind: el.value }, clone(D.PLACE_DEF[el.value]))); render(); return; }
    if (d.addsite) { if (el.value) { const L = getP(d.addsite); if (L.length < 8) L.push(el.value); } render(); return; }
    if (d.chain) {
      const L = getP(d.chain), i = +d.i, v = el.value;
      if (!v) { L.splice(i); if (!L.length) L.push('rank:0'); } else L[i] = v === 'apart' ? 'apart:70' : v === 'seeApart' ? 'seeApart:80' : v;
      render(); return;
    }
    if (el.id === 'imFile' && el.files && el.files[0]) { const fr = new FileReader(); fr.onload = () => { $('imTxt').value = String(fr.result); doImport(fr.result); }; fr.readAsText(el.files[0]); }
  });
}
// test hook
window.ED = { get doc() { return doc; }, save, doImport, render, isDirty, setTab: (t) => { tab = t; render(); }, open };
boot();
})();
