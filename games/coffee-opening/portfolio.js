// Coffee Opening v6 · 🇺🇸 Portfolio: the top zoom level (US > metro > site > 3D stand) over ~1,900 🧪 made-up sites.
// Lazy: this module, portfolio.css and portfolio.json load only when 🇺🇸 is opened. Data: tools/gen-portfolio.mjs (seeded, fake).
// ONE status source: status(s) drives the badge, the colour, the recommendation and the filters.
const G = () => window.COG, $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const TYPES = { O: { icon: '🟢', name: 'Open', col: '#2fb171' }, A: { icon: '🔵', name: 'Approved / pipeline', col: '#1f5fd1' }, L: { icon: '🟡', name: 'Looking (Pre-REC/REC)', col: '#e8a900' }, F: { icon: '🟣', name: 'Franchise', col: '#8b5cf6' }, R: { icon: '⚫', name: 'Rejected', col: '#5b6475' } };
export const TARGET = { coc: 18, spread: 8, rentPct: 8, pctile: 50, xfer: 10, aadt: 13000, budget: 1500, dist: 3 };
const URB = ['Urban', 'Suburban', 'Rural'], DEAL = ['Ground lease', 'Build-to-suit'], COMPLVL = ['Low', 'Medium', 'High'];
const CAPEX = [['📎', 'Misc fees / legal', [['Legal', .45], ['Title & survey', .3], ['Misc fees', .25]]], ['📐', 'Soft costs', [['Design', .4], ['Entitlement', .25], ['Permits', .35]]],
  ['☕', 'Equipment', [['Espresso & brew', .45], ['Refrigeration', .25], ['POS & tech', .15], ['Smallwares', .15]]], ['🪧', 'Signage', [['Pylon / monument', .5], ['Building signs', .3], ['Menu boards', .2]]],
  ['🦺', 'General conditions', [['Supervision', .45], ['Temp facilities', .25], ['Insurance & bonds', .3]]], ['🏗', 'Building costs', [['Modular building', .5], ['Site work & paving', .3], ['Utilities', .2]]],
  ['🛟', 'Contingency', [['Owner contingency', .6], ['GC contingency', .4]]], ['🚦', 'TIA (traffic improvements)', [['Turn lane / signal', .7], ['Traffic study', .3]]]];
const CRIME = ['Shootings', 'Assault', 'Robbery', 'Violent total', 'Burglary', 'Theft', 'Vandalism', 'Property total', 'Total'];
const CMT = ['Strong morning commute side of the road; easy right-in/right-out.', 'Pad is tight; stacking for 18 cars after the redesign.', 'Landlord open to an early-access period.', 'Neighbouring pad pulls lunch traffic, not mornings.',
  'AVP: like the trade area, want rent closer to target.', 'AVP: approve if the TIA scope stays under budget.', 'Ops: hiring pool OK, 2 shops within 25 min for training.', 'Ops: watch the shared driveway at school pickup.',
  'School zone nearby slows the AM peak.', 'Growth corridor; 3 subdivisions under way.', 'Signal timing study requested by the city.', 'Ops: night lighting needed on the back lane.'];
const CMTK = [['🏷', 'REM · site'], ['🧭', 'AVP'], ['🛠', 'Ops']];
export const PF = { data: null, sites: [], loadMs: 0, bytes: 0, f: { types: new Set(['O', 'A', 'L', 'F', 'R']), stage: '', state: '', tier: '', deal: '', q: '' }, sort: { k: 'code', d: 1 }, view: 'map', sel: null, tab: 'ov', map: null, layer: null, list: [] };
const DAY0 = Date.UTC(2020, 0, 1);
export const dayStr = (d) => (d == null ? '—' : new Date(DAY0 + d * 864e5).toISOString().slice(0, 10));
export const money = (k) => (Math.abs(k) >= 1000 ? `$${(k / 1000).toFixed(2)}M` : `$${Math.round(k)}K`);
// ---- decode one packed row into a friendly object (kept on the row, decoded once)
function decode(D, a, i) {
  const c = D.cities[a[5]], fn = a[15], dl = a[14], mk = a[13], lx = a[23];
  const s = { i, code: a[0], type: a[1], stage: a[2], os: a[3], addr: a[4], city: c[0], st: c[1], cbsa: c[2], county: c[3], ll: a[6], tap: a[7], dp: a[8], age: a[9], growth: a[10], urb: a[11], tier: a[12],
    mk: { isNew: !!mk[0], share: mk[1], comp: mk[2], tam: mk[3], open: mk[4], pipe: mk[5], pen: mk[6], n3auv: mk[7], dOpen: mk[8], dAppr: mk[9] },
    deal: { type: dl[0], dev: D.firms.dev[dl[1]], bsf: dl[2], psf: dl[3], park: dl[4], cot: D.cotenants[dl[5]], aadt: dl[6], rent: dl[7], term: dl[8], opts: dl[9], esc: dl[10] },
    fin: { rev: fn[0], pct: fn[1], lo: fn[2], hi: fn[3], bud: fn[4], ti: fn[5], coc: fn[6], spread: fn[7], margin: fn[8] }, xfer: a[16], capex: a[17], comp: a[18], re: a[19], nc: a[20], crime: a[21], cm: a[22],
    lx: { fr: lx[0], reloc: lx[1], frIdx: lx[2], roa: lx[3], shopNo: lx[4], btype: lx[5], pStart: lx[6], baseOpen: lx[7], moved: lx[8], ms: lx[9], mb: lx[10], firms: lx[11], slips: lx[12], wf: lx[13] }, link: a[24] || null };
  s.fin.rentPct = Math.round(s.deal.rent / s.fin.rev * 1000) / 10; s.fin.xferMax = s.xfer.reduce((m, x) => Math.max(m, x[2]), 0);
  s.q = `${s.code} ${s.city} ${s.st} ${s.cbsa} ${s.addr}`.toLowerCase(); s.nr = risks(s).length; s.st_ = status(s); return s;
}
// ---- ONE status source: badge + colour + recommendation (the old bug: Approved badge with a 'TBD' recommendation)
export function status(s) {
  const T = TYPES[s.type], f = s.fin, warn = risks(s).length;
  if (s.stage === 'Open') return { key: 'open', badge: s.type === 'F' ? '🟣 Franchise · open' : '🟢 Open', col: T.col, rec: s.type === 'F' ? 'Operating · franchise partner' : 'Operating', why: s.lx.ms[7] != null ? `Opened ${dayStr(s.lx.ms[7])}` : 'Open' };
  if (s.stage === 'Approved') return { key: 'approved', badge: '🔵 Approved', col: T.col, rec: '✅ Approved, build it', why: `REC approved ${dayStr(s.lx.ms[1])} · opening stage ${s.os + 1}/11` };
  if (s.stage === 'Rejected') return { key: 'rejected', badge: '⚫ Rejected', col: T.col, rec: '⛔ Rejected, archived', why: s.lx.ms[1] != null ? `Decided ${dayStr(s.lx.ms[1])}` : 'Declined at REC' };
  const good = f.coc >= TARGET.coc && f.spread >= TARGET.spread, bad = f.coc < TARGET.coc - 6 || f.spread < 0;
  const rec = bad ? '👎 Recommend decline' : good && warn <= 2 ? '👍 Recommend approve' : '🤔 Review the risks';
  return { key: s.stage === 'REC' ? 'rec' : 'prerec', badge: s.stage === 'REC' ? '🟡 REC · vote pending' : '🟡 Pre-REC', col: T.col, rec: s.stage === 'REC' ? rec : (bad ? '👎 Likely a pass' : '📦 Build the REC package'), why: `CoC ${f.coc}% (target ≥ ${TARGET.coc}%) · spread ${f.spread}% · ${warn} risk${warn === 1 ? '' : 's'}` };
}
export function upsides(s) { const u = [], f = s.fin, m = s.mk;
  if (s.deal.aadt >= TARGET.aadt) u.push(`🚗 Traffic ${s.deal.aadt.toLocaleString()} cars/day, over the ${TARGET.aadt / 1000}K threshold`);
  if (s.growth >= 2) u.push(`📈 Trade area growing ${s.growth}%/yr`); if (f.pct >= 70) u.push(`💵 Projected revenue at the ${f.pct}th percentile of ${s.cbsa}`);
  if (m.isNew) u.push('🆕 New market, first-mover'); else if (m.dOpen >= 5) u.push(`☕ Nearest open shop ${m.dOpen} mi away`);
  if (s.re[2] <= 0.5) u.push(`🛒 Grocer ${s.re[2]} mi away (${s.re[3]}th pct)`); if (s.nc[0] >= 1000) u.push(`🏘 ${s.nc[0].toLocaleString()} new homes within 5 mi`);
  if (f.coc >= TARGET.coc + 5) u.push(`🎯 Cash-on-cash ${f.coc}%, well over the ${TARGET.coc}% target`); return u; }
export function risks(s) { const r = [], f = s.fin, m = s.mk;
  if (s.stage !== 'Open') { if (m.dOpen < TARGET.dist) r.push(`☕ Within ${TARGET.dist} mi of an existing shop (${m.dOpen} mi)`); if (m.dAppr < TARGET.dist) r.push(`🔵 Within ${TARGET.dist} mi of an approved shop (${m.dAppr} mi)`); }
  if (s.growth < 0) r.push(`📉 Projected negative growth (${s.growth}%/yr)`); if (s.deal.aadt < TARGET.aadt) r.push(`🚗 Traffic ${s.deal.aadt.toLocaleString()}/day, under the ${TARGET.aadt / 1000}K threshold`);
  if (f.xferMax > TARGET.xfer) r.push(`↔ Takes ${f.xferMax}% of sales from a nearby shop (limit ${TARGET.xfer}%)`); if (f.rentPct > TARGET.rentPct) r.push(`🏠 Rent ${f.rentPct}% of revenue (target ≤ ${TARGET.rentPct}%)`);
  if (f.pct < 30) r.push(`📊 ${f.pct}th percentile Rebel grid`); if (m.comp === 2) r.push('⚔ High competition'); if (s.crime[32] > s.crime[34] * 1.25) r.push(`🚨 Crime index ${s.crime[32]}, ${Math.round((s.crime[32] / s.crime[34] - 1) * 100)}% over the nearest shop`);
  if (f.bud > TARGET.budget) r.push(`🏗 Budget ${money(f.bud)} over the ${money(TARGET.budget)} guide`); return r; }
// ---- load (lazy, timed)
let loading = null;
export function load() {
  if (loading) return loading; const t0 = performance.now();
  loading = fetch('portfolio.json').then((r) => { if (!r.ok) throw new Error('portfolio ' + r.status); return r.text(); }).then((txt) => {
    PF.bytes = txt.length; const D = PF.data = JSON.parse(txt); PF.sites = D.sites.map((a, i) => decode(D, a, i)); PF.byType = {}; Object.keys(TYPES).forEach((k) => { PF.byType[k] = PF.sites.filter((s) => s.type === k); }); PF.loadMs = Math.round(performance.now() - t0); return PF; });
  return loading;
}
function css() { if ($('pfCss')) return; const l = document.createElement('link'); l.id = 'pfCss'; l.rel = 'stylesheet'; l.href = 'portfolio.css?v=6'; document.head.appendChild(l); }
// ---- filters
export function filtered() { const f = PF.f, q = f.q.trim().toLowerCase();
  if (!q && !f.stage && !f.state && !f.tier && f.deal === '') { const out = []; for (const k of Object.keys(TYPES)) if (f.types.has(k)) out.push(...PF.byType[k]); return out; }
  return PF.sites.filter((s) => f.types.has(s.type) && (!f.stage || s.stage === f.stage) && (!f.state || s.st === f.state) && (!f.tier || s.tier === +f.tier) && (f.deal === '' || s.deal.type === +f.deal) && (!q || s.q.includes(q))); }
// ---- shell
export function open(code) {
  css(); let root = $('pf');
  if (!root) { root = document.createElement('section'); root.id = 'pf'; root.setAttribute('aria-label', 'US portfolio'); document.body.appendChild(root); build(root); }
  root.hidden = false; document.body.classList.add('pf-on');
  return load().then(() => { fillSelects(); refresh(); initMap(); if (code) openSite(code); return PF; }).catch((e) => { $('pfBody').innerHTML = `<p class="pf-err">🇺🇸 ❌ Portfolio data did not load (${esc(e.message)})</p>`; });
}
export function close() { const r = $('pf'); if (r) r.hidden = true; document.body.classList.remove('pf-on'); }
function build(root) {
  root.innerHTML = `<header class="pf-top"><button class="pf-ib" data-pf="close" aria-label="Back to the shops" title="Back">⬅</button><b class="pf-title">🇺🇸 <span>Portfolio</span> <small id="pfCount"></small></b>
  <span class="pf-ex" title="Every site, number, person and comment is made up">🧪 Example data</span>
  <input id="pfQ" type="search" placeholder="🔎 Code or city" aria-label="Search by code or city" autocomplete="off">
  <div class="pf-seg" role="group" aria-label="View"><button data-view="map" class="on" aria-label="Map view">🗺<small>Map</small></button><button data-view="table" aria-label="Table view">📋<small>Table</small></button><button data-view="bott" aria-label="Bottlenecks">⏳<small>Waits</small></button><button data-view="slip" aria-label="Slipping sites">📉<small>Slipping</small></button></div></header>
  <div class="pf-kpis" id="pfKpis"></div>
  <div class="pf-chips" id="pfChips">${Object.entries(TYPES).map(([k, t]) => `<button class="pf-chip on" data-type="${k}" style="--c:${t.col}" aria-pressed="true"><i></i>${esc(t.name.split(' (')[0])} <b data-n="${k}"></b></button>`).join('')}
   <select id="pfStage" aria-label="Stage"><option value="">All stages</option>${['Pre-REC', 'REC', 'Approved', 'Open', 'Rejected'].map((x) => `<option>${x}</option>`).join('')}</select>
   <select id="pfState" aria-label="State"><option value="">All states</option></select>
   <select id="pfTier" aria-label="Tier"><option value="">All tiers</option>${[1, 2, 3, 4].map((x) => `<option value="${x}">Tier ${x}</option>`).join('')}</select>
   <select id="pfDeal" aria-label="Deal type"><option value="">All deals</option><option value="0">Ground lease</option><option value="1">Build-to-suit</option></select>
   <button class="pf-chip reset" data-pf="reset" aria-label="Clear filters">✕ Clear</button></div>
  <div class="pf-body view-map" id="pfBody"><div id="pfMap" class="pf-map"></div><div class="pf-legend">${Object.values(TYPES).map((t) => `<span><i style="background:${t.col}"></i>${esc(t.name.split(' (')[0])}</span>`).join('')}</div>
   <div class="pf-altv" id="pfAlt"></div><div class="pf-table" id="pfTable"><div class="pf-th" id="pfTh"></div><div class="pf-scroll" id="pfScroll"><div class="pf-spacer" id="pfSpacer"></div><div class="pf-rows" id="pfRows"></div></div></div></div>
  <aside id="pfSite" class="pf-site" hidden aria-label="Site details"></aside>`;
  root.addEventListener('click', onClick); root.addEventListener('change', onChange);
  let qt = 0; $('pfQ').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { PF.f.q = $('pfQ').value; refresh(); const L = PF.list; if (PF.f.q.trim() && L.length && L.length <= 40 && PF.map) PF.map.fitBounds(L.map((s) => s.ll), { maxZoom: 12, padding: [40, 40] }); }, 120); });
  $('pfQ').addEventListener('keydown', (e) => { if (e.key === 'Enter' && PF.list.length) { const ex = PF.list.find((s) => s.code.toLowerCase() === $('pfQ').value.trim().toLowerCase()) || (PF.list.length === 1 ? PF.list[0] : null); if (ex) openSite(ex.code, true); } });
  $('pfScroll').addEventListener('scroll', drawRows, { passive: true });
}
function fillSelects() { const sel = $('pfState'); if (sel.options.length > 1) return; const st = [...new Set(PF.sites.map((s) => s.st))].sort(); sel.insertAdjacentHTML('beforeend', st.map((x) => `<option>${x}</option>`).join('')); }
function onChange(e) { const id = e.target.id; const k = { pfStage: 'stage', pfState: 'state', pfTier: 'tier', pfDeal: 'deal' }[id]; if (!k) return; PF.f[k] = e.target.value; refresh(true); }
function onClick(e) {
  const b = e.target.closest('button,[data-code],.pf-row'); if (!b) return;
  if (b.dataset.type) { const t = b.dataset.type, S = PF.f.types; if (S.has(t) && S.size === 1) Object.keys(TYPES).forEach((k) => S.add(k)); else if (e.shiftKey || S.size < 5) S.has(t) ? S.delete(t) : S.add(t); else { S.clear(); S.add(t); } refresh(); return; }
  if (b.dataset.view) return setView(b.dataset.view);
  if (b.dataset.sort) { const k = b.dataset.sort; PF.sort = { k, d: PF.sort.k === k ? -PF.sort.d : (k === 'code' || k === 'city' ? 1 : -1) }; refresh(); return; }
  if (b.dataset.doc) return openDoc(+b.dataset.doc);
  if (b.dataset.docnav) { const v = $('pfDocV'); return openDoc((+v.dataset.k + +b.dataset.docnav + 4) % 4); }
  if (b.dataset.code) return openSite(b.dataset.code, true);
  if (b.dataset.tab) { PF.tab = b.dataset.tab; return renderSite(); }
  const a = b.dataset.pf;
  if (a === 'close') return close();
  if (a === 'docClose') { $('pfDocV').hidden = true; return; }
  if (a === 'reset') { PF.f = { types: new Set(Object.keys(TYPES)), stage: '', state: '', tier: '', deal: '', q: '' }; ['pfStage', 'pfState', 'pfTier', 'pfDeal', 'pfQ'].forEach((id) => { $(id).value = ''; }); refresh(true); return; }
  if (a === 'siteClose') { PF.sel = null; $('pfSite').hidden = true; drawMarkers(); return; }
  if (a === 'cx-all' || a === 'cx-none') { $('pfSite').querySelectorAll('details.cx').forEach((d) => { d.open = a === 'cx-all'; }); return; }
  if (a === 'metro') { const s = PF.sel; close(); const g = G(); if (g) { g.setMode('metro'); if (s && s.link) setTimeout(() => g.selectPin(s.link), 400); } return; }
  if (a === 'stand') { const s = PF.sel; const g = G(); if (!g || !s) return; close(); if (g.pfStand) g.pfStand(s.code); return; }
  if (a === 'cmp') { const g = G(); if (g && PF.sel) { g.toggleCmp('pf:' + PF.sel.code); renderSite(); } return; }
  if (a === 'cmpOpen') { const g = G(); close(); if (g) g.openCompare(); return; }
  if (a === 'zoomTo' && PF.sel && PF.map) { PF.map.setView(PF.sel.ll, 13); if (PF.view !== 'map') setView('map'); }
}
function setView(v) { PF.view = v; renderAlt(); $('pfBody').className = 'pf-body view-' + v; document.querySelectorAll('#pf .pf-seg button').forEach((x) => x.classList.toggle('on', x.dataset.view === v)); if (PF.map) setTimeout(() => { PF.map.invalidateSize(); drawMarkers(); }, 0); drawRows(); }
// ---- KPIs (follow the filters)
function kpis(L) { const n = L.length || 1, by = {}; Object.keys(TYPES).forEach((k) => { by[k] = 0; }); const pipe = {}; let rev = 0, coc = 0, nl = 0, slip = 0;
  for (const s of L) { by[s.type]++; if (s.type !== 'R') { rev += s.fin.rev; coc += s.fin.coc; nl++; } if (s.type === 'A' || s.type === 'L') pipe[s.st] = (pipe[s.st] || 0) + 1; if (s.type === 'A' && s.lx.moved) slip++; }
  const top = Object.entries(pipe).sort((a, b) => b[1] - a[1]).slice(0, 5), mx = top.length ? top[0][1] : 1;
  return `<div class="pf-kpi big"><b>${L.length.toLocaleString()}</b><small>sites</small></div>` + Object.entries(TYPES).map(([k, t]) => `<div class="pf-kpi" style="--c:${t.col}"><b>${by[k]}</b><small>${t.icon} ${esc(t.name.split(' (')[0])}</small></div>`).join('') +
    `<div class="pf-kpi"><b>${money(nl ? rev / nl : 0)}</b><small>💵 avg projected revenue</small></div><div class="pf-kpi ${nl && coc / nl >= TARGET.coc ? 'ok' : 'warn'}"><b>${nl ? (coc / nl).toFixed(1) : 0}%</b><small>🎯 avg CoC · target ${TARGET.coc}%</small></div>` +
    `<div class="pf-kpi ${slip ? 'warn' : 'ok'}"><b>${slip}</b><small>⏰ pipeline sites with a moved turnover</small></div>` +
    `<div class="pf-kpi wide"><small>🔵🟡 Pipeline by state</small>${top.map(([st, c]) => `<span class="pf-bar"><em>${st}</em><i style="width:${Math.round(c / mx * 100)}%"></i><b>${c}</b></span>`).join('') || '<em>none</em>'}</div>`; }
// ---- refresh: filter → KPIs, chips, table, map
const COLS = [['code', 'Code', (s) => s.code], ['city', 'City', (s) => `${s.city}, ${s.st}`], ['type', 'Type', (s) => s.type], ['stage', 'Stage', (s) => s.stage], ['rev', 'Rev', (s) => s.fin.rev], ['pct', 'Pctl', (s) => s.fin.pct], ['coc', 'CoC', (s) => s.fin.coc], ['spread', 'Spread', (s) => s.fin.spread], ['aadt', 'AADT', (s) => s.deal.aadt], ['tier', 'Tier', (s) => s.tier], ['risk', '⚠', (s) => s.nr]];
export function refresh(fit) { const t0 = performance.now(); refreshNow(fit); PF.lastMs = Math.round((performance.now() - t0) * 10) / 10; }
function refreshNow(fit) {
  const L = filtered(), c = COLS.find((x) => x[0] === PF.sort.k) || COLS[0], d = PF.sort.d, get = c[2];
  const K = new Map(); for (const s of L) K.set(s, get(s)); L.sort((a, b) => { const x = K.get(a), y = K.get(b); return (x < y ? -1 : x > y ? 1 : 0) * d || (a.code < b.code ? -1 : 1); }); PF.list = L;
  $('pfCount').textContent = `· ${L.length.toLocaleString()} of ${PF.sites.length.toLocaleString()}`; const sig = L.length + ':' + (L[0] && L[0].code) + PF.f.q + PF.f.stage + PF.f.state + PF.f.tier + PF.f.deal + [...PF.f.types].join(''); if (sig !== PF.kSig) { PF.kSig = sig; $('pfKpis').innerHTML = kpis(L); }
  const cnt = {}; for (const s of PF.sites) cnt[s.type] = (cnt[s.type] || 0) + 1;
  document.querySelectorAll('#pfChips [data-type]').forEach((b) => { const on = PF.f.types.has(b.dataset.type); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.querySelector('b').textContent = cnt[b.dataset.type] || 0; });
  $('pfTh').innerHTML = COLS.map(([k, n]) => `<button data-sort="${k}" class="c-${k} ${PF.sort.k === k ? 'on' : ''}" aria-label="Sort by ${n}">${n}${PF.sort.k === k ? (d > 0 ? ' ▲' : ' ▼') : ''}</button>`).join('');
  $('pfSpacer').style.height = L.length * ROWH + 'px'; drawRows(); drawMarkers(); renderAlt();
  if (fit && PF.map && L.length) { const b = PF.map.options; PF.map.fitBounds(L.map((s) => s.ll), { maxZoom: 11, padding: [30, 30] }); }
}
function renderAlt() { const el = $('pfAlt'); if (!el) return; el.innerHTML = PF.view === 'bott' ? renderBott() : PF.view === 'slip' ? renderSlip() : ''; }
// ---- virtualized table: only the rows in view are in the DOM
const ROWH = 36;
function drawRows() { const sc = $('pfScroll'); if (!sc || PF.view === 'map' && innerWidth < 1100) { if ($('pfRows')) $('pfRows').innerHTML = ''; return; }
  const L = PF.list, top = sc.scrollTop, h = sc.clientHeight || 600, a = Math.max(0, Math.floor(top / ROWH) - 8), b = Math.min(L.length, Math.ceil((top + h) / ROWH) + 8); let html = '';
  for (let i = a; i < b; i++) { const s = L[i], t = TYPES[s.type], rk = s.nr;
    html += `<div class="pf-row ${PF.sel === s ? 'sel' : ''}" data-code="${s.code}" style="top:${i * ROWH}px" role="button" tabindex="0"><span class="c-code"><i style="background:${t.col}"></i>${s.code}</span><span class="c-city">${esc(s.city)}, ${s.st}</span><span class="c-type">${t.icon}</span><span class="c-stage">${s.stage}</span><span class="c-rev">${money(s.fin.rev)}</span><span class="c-pct">${s.fin.pct}</span><span class="c-coc ${s.fin.coc >= TARGET.coc ? 'ok' : 'bad'}">${s.fin.coc}%</span><span class="c-spread ${s.fin.spread >= TARGET.spread ? 'ok' : 'bad'}">${s.fin.spread}%</span><span class="c-aadt">${(s.deal.aadt / 1000).toFixed(1)}K</span><span class="c-tier">${s.tier}</span><span class="c-risk ${rk >= 3 ? 'bad' : ''}">${rk || '✓'}</span></div>`; }
  $('pfRows').innerHTML = html; }
// ---- map: Leaflet (already vendored) + a fast pixel-grid clusterer (only cells in view become markers)
function initMap() {
  if (PF.map) { PF.map.invalidateSize(); drawMarkers(); return; } const g = G(); if (!g || !g.loadLeaflet) return;
  g.loadLeaflet().then((L) => { if (PF.map) return; PF.L = L; const m = PF.map = L.map('pfMap', { zoomControl: true, minZoom: 3, maxZoom: 17, worldCopyJump: false, preferCanvas: true, boxZoom: false });
    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    L.tileLayer(g.TILE(), { maxZoom: 19, keepBuffer: 1, updateWhenIdle: true, attribution: g.ATTR_BASE + ' · sites: 🧪 made-up' }).addTo(m);
    m.fitBounds([[25.5, -124.5], [48.8, -80]]); PF.layer = L.layerGroup().addTo(m); m.on('moveend zoomend', drawMarkers); drawMarkers(); });
}
export function clusters() { const m = PF.map; if (!m) return []; const z = m.getZoom(), cell = z >= 13 ? 0 : z >= 10 ? 34 : 54, bb = m.getBounds().pad(0.15), cells = new Map(), out = [];
  for (const s of PF.list) { if (!bb.contains(s.ll)) continue; if (!cell) { out.push({ n: 1, s, ll: s.ll }); continue; } const p = m.project(s.ll, z), k = Math.floor(p.x / cell) + ':' + Math.floor(p.y / cell); let c = cells.get(k); if (!c) cells.set(k, c = { n: 0, la: 0, ln: 0, by: {}, list: [] }); c.n++; c.la += s.ll[0]; c.ln += s.ll[1]; c.by[s.type] = (c.by[s.type] || 0) + 1; c.list.push(s); }
  for (const c of cells.values()) out.push(c.n === 1 ? { n: 1, s: c.list[0], ll: c.list[0].ll } : { n: c.n, ll: [c.la / c.n, c.ln / c.n], by: c.by, list: c.list }); return out; }
let mkT = 0; function drawMarkers() { if (mkT) return; mkT = requestAnimationFrame(() => { mkT = 0; drawMarkersNow(); }); }
const MK = new Map();
function drawMarkersNow() { const m = PF.map, L = PF.L; if (!m || !PF.layer) return; const cs = clusters(); PF.nMarkers = cs.length; const keep = new Set();
  for (const c of cs) { let mk; const key = c.n === 1 ? c.s.code + (PF.sel === c.s ? '*' : '') : `${Math.round(c.ll[0] * 1e4)}:${Math.round(c.ll[1] * 1e4)}:${c.n}:${Object.entries(c.by).join()}`; keep.add(key);
    if (MK.has(key)) { if (c.n > 1) MK.get(key)._pf = c; continue; }
    if (c.n === 1) { const s = c.s, sel = PF.sel === s; mk = L.circleMarker(s.ll, { radius: sel ? 9 : 6, color: sel ? '#fff' : '#0d1733', weight: sel ? 3 : 1.2, fillColor: TYPES[s.type].col, fillOpacity: 0.95 }); mk.on('click', () => openSite(s.code)); mk.bindTooltip(`${s.code} · ${s.city}, ${s.st} · ${s.stage}`, { direction: 'top', offset: [0, -6] }); }
    else { let acc = 0; const stops = Object.entries(c.by).map(([k, v]) => { const a0 = acc; acc += v / c.n * 100; return `${TYPES[k].col} ${a0.toFixed(1)}% ${acc.toFixed(1)}%`; }).join(','), sz = c.n >= 100 ? 50 : c.n >= 20 ? 42 : 34;
      mk = L.marker(c.ll, { icon: L.divIcon({ className: 'pf-cl', html: `<div style="width:${sz}px;height:${sz}px;background:conic-gradient(${stops})"><b>${c.n}</b></div>`, iconSize: [sz, sz] }), keyboard: false, title: `${c.n} sites` });
      mk._pf = c; mk.on('click', () => { const cc = mk._pf; const b = L.latLngBounds(cc.list.map((s) => s.ll)); m.fitBounds(b, { maxZoom: Math.max(m.getZoom() + 2, 0), padding: [40, 40] }); }); }
    MK.set(key, mk); PF.layer.addLayer(mk); }
  for (const [k, mk] of MK) if (!keep.has(k)) { PF.layer.removeLayer(mk); MK.delete(k); } }
// ---- site panel
export function openSite(code, fly) { const s = PF.sites.find((x) => x.code === code); if (!s) return; PF.sel = s; if (fly && PF.map) PF.map.setView(s.ll, Math.max(PF.map.getZoom(), 11)); renderSite(); drawMarkers(); drawRows(); }
const TABS = [['ov', '🏠', 'Overview'], ['fin', '💵', 'Financials'], ['mkt', '🧭', 'Market'], ['risk', '🚨', 'Risk'], ['sum', '📄', 'Summary'], ['wf', '✅', 'Workflows'], ['sch', '📅', 'Schedule'], ['docs', '🗂', 'Docs'], ['cm', '💬', 'Comments']];
export function renderSite() { const s = PF.sel, el = $('pfSite'); if (!s) { el.hidden = true; return; } el.hidden = false; const st = s.st_;
  el.innerHTML = `<header class="pf-sh" style="--c:${st.col}"><div><b class="pf-code">${s.code}</b> <span class="pf-ex">🧪</span><div class="pf-addr">${esc(s.addr)} · ${esc(s.city)}, ${s.st}</div></div><button class="pf-ib" data-pf="siteClose" aria-label="Close site">✕</button></header>
   <div class="pf-status" style="--c:${st.col}"><span class="pf-badge">${st.badge}</span><div class="pf-rec"><b>${st.rec}</b><small>${esc(st.why)}</small></div></div>
   <div class="pf-acts"><button class="pf-btn" data-pf="zoomTo">🔍 Zoom to site</button>${s.link ? `<button class="pf-btn pri" data-pf="metro">📍 Phoenix map</button>` : ''}${s.stage === 'Approved' || s.stage === 'Open' ? `<button class="pf-btn pri" data-pf="stand">🏪 3D stand</button>` : ''}${cmpBtns(s)}</div>
   <nav class="pf-tabs" role="tablist">${TABS.map(([k, i, n]) => `<button role="tab" data-tab="${k}" class="${PF.tab === k ? 'on' : ''}" aria-selected="${PF.tab === k}">${i}<small>${n}</small></button>`).join('')}</nav>
   <div class="pf-tab" data-tabbody="${PF.tab}">${({ ov: tabOv, fin: tabFin, mkt: tabMkt, risk: tabRisk, sum: tabSum, wf: tabWf, sch: tabSch, docs: tabDocs, cm: tabCm }[PF.tab] || tabOv)(s)}</div>`; }
const cmpBtns = (s) => { const g = G(), C = (g && g.state.cmp) || [], on = C.includes('pf:' + s.code); return `<button class="pf-btn ${on ? 'on' : ''}" data-pf="cmp" aria-pressed="${on}">${on ? '➖' : '➕'} Compare</button>${C.length ? `<button class="pf-btn" data-pf="cmpOpen">⚖ ${C.length}/3</button>` : ''}`; };
const kn = (icon, label, val, target, ok, sub) => `<div class="pf-kn ${ok == null ? '' : ok ? 'ok' : 'bad'}"><small>${icon} ${label}</small><b>${val}</b><em>${target}${ok == null ? '' : ok ? ' ✓' : ' ⚠'}</em>${sub ? `<i>${sub}</i>` : ''}</div>`;
function tabOv(s) { const f = s.fin, u = upsides(s), r = risks(s);
  return `<div class="pf-facts">${[['🏙', 'Metro (CBSA)', s.cbsa], ['👥', 'TA pop', s.tap.toLocaleString()], ['🕘', 'Day pop', s.dp.toLocaleString()], ['🎂', 'Median age', s.age], ['📈', 'Growth', s.growth + '%'], ['🏘', 'Urbanicity', URB[s.urb]], ['🏅', 'Site tier', s.tier]].map(([i, k, v]) => `<span><small>${i} ${k}</small><b>${esc(v)}</b></span>`).join('')}</div>
   <div class="pf-kns">${kn('💵', 'Projected revenue', money(f.rev), `${f.pct}th pct of ${esc(s.cbsa)} · ${money(f.lo)}–${money(f.hi)}`, f.pct >= TARGET.pctile)}${kn('🎯', 'Cash on cash', f.coc + '%', `target ≥ ${TARGET.coc}%`, f.coc >= TARGET.coc)}
    ${kn('📐', 'Spread over WACC', f.spread + '%', `target ≥ ${TARGET.spread}%`, f.spread >= TARGET.spread)}${kn('🏠', 'Rent % of revenue', f.rentPct + '%', `target ≤ ${TARGET.rentPct}%`, f.rentPct <= TARGET.rentPct)}
    ${kn('🏗', 'Construction budget', money(f.bud), `guide ≤ ${money(TARGET.budget)}${f.ti ? ` · TI ${money(f.ti)}` : ''}`, f.bud <= TARGET.budget)}${kn('🚗', 'Traffic (AADT)', s.deal.aadt.toLocaleString(), `threshold ${TARGET.aadt.toLocaleString()}`, s.deal.aadt >= TARGET.aadt)}</div>
   <div class="pf-ur"><div class="up"><h4>👍 Upside · ${u.length}</h4>${u.map((x) => `<p>${esc(x)}</p>`).join('') || '<p class="muted">None flagged</p>'}</div><div class="rk"><h4>⚠ Risks · ${r.length}</h4>${r.map((x) => `<p>${esc(x)}</p>`).join('') || '<p class="muted">None flagged ✓</p>'}</div></div>
   <h4>🤝 Project & deal</h4><div class="pf-facts">${[['📄', 'Deal', DEAL[s.deal.type]], ['🏢', 'Developer', s.deal.dev], ['📏', 'Building', s.deal.bsf.toLocaleString() + ' sf'], ['🗺', 'Property', s.deal.psf.toLocaleString() + ' sf'], ['🅿', 'Parking', s.deal.park], ['🛍', 'Co-tenancy', s.deal.cot], ['💲', 'Rent / yr', money(s.deal.rent)], ['⏳', 'Term', `${s.deal.term} yrs + ${s.deal.opts}×5`], ['📈', 'Escalations', s.deal.esc === 10 ? '10% / 5 yrs' : s.deal.esc + '% / yr']].map(([i, k, v]) => `<span><small>${i} ${k}</small><b>${esc(v)}</b></span>`).join('')}</div>
`; }
// ---- financials: snapshot, two sensitivity heat grids (base highlighted), CapEx tree
export const STEPS = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15];
export function sens(s) { const f = s.fin, inv = f.bud - f.ti; return STEPS.map((a) => { const m = f.margin + (a - 1) * 40; return { a, rev: f.rev * a, m, cells: STEPS.map((c) => { const coc = (f.rev * a * m / 100 - s.deal.rent) / (inv * c) * 100; return { c, coc, spread: coc - (f.coc - f.spread) }; }) }; }); }
function grid(s, k, target) { const S = sens(s), pct = (v) => v.toFixed(1) + '%', cls = (v) => (v >= target ? 'g' : v >= target - 5 ? 'y' : 'r');
  return `<div class="pf-grid" data-grid="${k}"><table><thead><tr><th>AUV · $ · margin ↓ / build cost →</th>${STEPS.map((c) => `<th>${Math.round(c * 100)}%</th>`).join('')}</tr></thead><tbody>${S.map((r) => `<tr><th>${Math.round(r.a * 100)}% · ${money(r.rev)} · ${r.m.toFixed(1)}%</th>${r.cells.map((c) => `<td class="${cls(c[k])} ${r.a === 1 && c.c === 1 ? 'base' : ''}">${pct(c[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function tabFin(s) { const f = s.fin, tot = s.capex.reduce((a, b) => a + b, 0);
  return `<div class="pf-kns">${kn('💵', 'Projected revenue', money(f.rev), `${f.pct}th pct vs ${esc(s.cbsa)} AUV ${money(s.mk.n3auv)}`, f.pct >= TARGET.pctile, `range ${money(f.lo)}–${money(f.hi)}`)}${kn('🏗', 'Construction budget', money(f.bud), `incl. TI/TC ${money(f.ti)}`, f.bud <= TARGET.budget)}
    ${kn('🎯', 'Cash on cash', f.coc + '%', `target ≥ ${TARGET.coc}%`, f.coc >= TARGET.coc)}${kn('📐', 'Spread over WACC', f.spread + '%', `WACC ${(f.coc - f.spread).toFixed(1)}% · target ≥ ${TARGET.spread}%`, f.spread >= TARGET.spread)}${kn('🏠', 'Rent % of revenue', f.rentPct + '%', `target ≤ ${TARGET.rentPct}%`, f.rentPct <= TARGET.rentPct)}${kn('📊', 'Margin', f.margin + '%', 'store 4-wall', null)}</div>
   <h4>↔ Sales transfer from nearby shops</h4>${s.xfer.length ? `<div class="pf-xf">${s.xfer.map(([c, k, p]) => `<span class="${p > TARGET.xfer ? 'bad' : ''}"><b>${c}</b> −${money(k)} · ${p}%${p > TARGET.xfer ? ' ⚠' : ''}</span>`).join('')}</div>` : '<p class="muted">No nearby shops lose sales ✓</p>'}
   <h4>🌡 Spread over WACC · sensitivity <small>(base outlined)</small></h4>${grid(s, 'spread', TARGET.spread)}
   <h4>🌡 Cash on cash · sensitivity</h4>${grid(s, 'coc', TARGET.coc)}
   <h4>🧱 Site budget <span class="pf-cxbtns"><button class="pf-btn sm" data-pf="cx-all">➕ Expand all</button><button class="pf-btn sm" data-pf="cx-none">➖ Collapse all</button></span></h4>
   <div class="pf-cx">${CAPEX.map(([i, n, subs], k) => `<details class="cx"><summary><span>${i} ${n}</span><b>${money(s.capex[k])}</b><em style="width:${Math.round(s.capex[k] / tot * 100)}%"></em></summary>${subs.map(([sn, p]) => `<div class="cx-sub"><span>${sn}</span><b>${money(s.capex[k] * p)}</b></div>`).join('')}</details>`).join('')}
    <div class="cx-tot"><span>Σ Total CapEx</span><b>${money(tot)}</b></div></div>`; }
function tabMkt(s) { const m = s.mk, D = PF.data, comps = D.comps;
  const sum = (dt, col) => s.comp.reduce((a, row, k) => a + (comps[k][1] === dt ? row[col] : 0), 0);
  return `<h4>🧭 Market strategy</h4><div class="pf-facts">${[['🆕', 'Market', m.isNew ? 'New' : 'Existing'], ['🥧', 'Share', m.share + '%'], ['⚔', 'Competition', COMPLVL[m.comp]], ['🎯', 'TAM (shops)', m.tam], ['🟢', 'Open', m.open], ['🔵', 'Pipeline', m.pipe], ['📊', 'Penetration', m.pen + '%'], ['☕', 'Nearest 3 AUV', money(m.n3auv)], ['📏', 'Closest open', m.dOpen + ' mi'], ['📏', 'Closest approved', m.dAppr + ' mi']].map(([i, k, v]) => `<span class="${(k.startsWith('Closest') && parseFloat(v) < TARGET.dist) ? 'bad' : ''}"><small>${i} ${k}</small><b>${esc(v)}</b></span>`).join('')}</div>
   <h4>⚔ Comp strength <small>(drive time)</small></h4><div class="pf-ct"><table><thead><tr><th>Competitor</th><th>5 min</th><th>10 min</th><th>15 min</th><th>${esc(s.cbsa)}</th></tr></thead><tbody>
   ${s.comp.map((r, k) => `<tr><th>${comps[k][1] ? '🚗' : '🚶'} ${esc(comps[k][0])}</th>${r.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}
   <tr class="sum"><th>🚗 Drive-thru</th>${[0, 1, 2, 3].map((c) => `<td>${sum(1, c)}</td>`).join('')}</tr><tr class="sum"><th>🚶 No drive-thru</th>${[0, 1, 2, 3].map((c) => `<td>${sum(0, c)}</td>`).join('')}</tr></tbody></table></div>
   <h4>🛒 Nearest RE signals</h4><div class="pf-facts">${[['🏬', 'Big box', 0], ['🛒', 'Grocer', 2], ['🛍', 'Shopping center', 4]].map(([i, k, j]) => `<span><small>${i} ${k}</small><b>${s.re[j]} mi</b><em>${s.re[j + 1]}th pct</em></span>`).join('')}</div>
   <h4>🏗 New construction within 5 mi</h4><div class="pf-facts"><span><small>🏘 Homes</small><b>${s.nc[0].toLocaleString()}</b></span><span><small>🏬 Retail</small><b>${s.nc[1]}K sf</b></span></div>`; }
function tabRisk(s) { const r = risks(s), C = s.crime, mx = Math.max(...C);
  return `<h4>⚠ Risks · ${r.length}</h4>${r.map((x) => `<p class="pf-rk">${esc(x)}</p>`).join('') || '<p class="muted">None flagged ✓</p>'}
   <h4>🚨 Crime profile vs analogs <small>(index, 100 = US avg)</small></h4><div class="pf-crk">${['This site', 'High analog', 'Nearest shop', 'Similar analog'].map((n, j) => `<span><i class="k${j}"></i>${n}</span>`).join('')}</div>
   <div class="pf-crime">${CRIME.map((n, k) => `<div class="cr-row ${/total/i.test(n) ? 'tot' : ''}"><small>${n}${/total/i.test(n) && k < 8 ? ' %' : ''}</small><div>${[0, 1, 2, 3].map((j) => `<i class="k${j}" style="width:${Math.round(C[k * 4 + j] / mx * 100)}%" title="${C[k * 4 + j]}"><b>${C[k * 4 + j]}</b></i>`).join('')}</div></div>`).join('')}</div>
   <h4>💬 Latest comments</h4>${s.cm.length ? s.cm.map(([k, t, d, p]) => `<p class="pf-cm"><b>${CMTK[k][0]} ${CMTK[k][1]} · ${esc(PF.data.people[p])}</b> <small>${dayStr(d)}</small><br>${esc(CMT[t])}</p>`).join('') : '<p class="muted">No comments yet</p>'}`; }
// ================= v6 Phase 2 · Lucernex-style project depth (all derived from the seeded fake data) =================
export const TODAY = () => (PF.data ? PF.data.today : 0);
// schedule template: [group, task, baseline offset (days from project start), duration, opening-stage index it rolls up into, role]
export const TASK = [['🏠 Real estate', 'Test fit requested', 0, 12, 0, 'rem'], ['🏠 Real estate', 'Test fit approved', 12, 10, 0, 'rem'], ['🏠 Real estate', 'LOI signed', 22, 14, 1, 'rem'], ['🏠 Real estate', 'Early access', 36, 20, 1, 'rem'],
  ['🔬 Site investigation', 'SIR (site investigation report)', 40, 30, 2, 'pdm'], ['🏠 Real estate', 'RE committee', 80, 15, 3, 'rem'], ['🏠 Real estate', 'Lease / PSA executed', 95, 30, 4, 'rem'],
  ['🏛 Planning', 'Pre-app meeting', 100, 14, 4, 'pdm'], ['🏛 Planning', 'Submit application', 114, 10, 4, 'pdm'], ['🏛 Planning', 'Planning hearing', 124, 45, 4, 'pdm'], ['🏛 Planning', 'COA received', 169, 12, 4, 'pdm'],
  ['📜 GL lease deadlines', 'Due diligence period', 95, 60, 4, 'rem'], ['📜 GL lease deadlines', 'Tenant plans to landlord', 140, 20, 4, 'arch'], ['📜 GL lease deadlines', 'Permit & approvals contingency', 160, 45, 4, 'pdm'],
  ['📐 Design', 'CD kick-off', 150, 10, 4, 'arch'], ['📐 Design', 'Construction documents', 160, 40, 4, 'arch'], ['📐 Design', 'Bid & award GC', 200, 20, 4, 'cm'],
  ['🧾 Permits', 'Permits applied', 205, 10, 4, 'pdm'], ['🧾 Permits', 'Permits issued', 215, 40, 4, 'pdm'],
  ['🏗 Construction', 'Site work', 255, 35, 5, 'cm'], ['🏗 Construction', 'Building set + finish', 290, 50, 5, 'gc'], ['☕ Turnover', 'Equipment & hiring', 340, 40, 6, 'ops'], ['☕ Turnover', 'Turnover to Ops', 380, 10, 8, 'cm'], ['🎉 Open', 'Soft + grand open', 390, 14, 9, 'ops']];
const ROLE = { rem: 'Real Estate Manager', pdm: 'Pre-Development Manager', cm: 'Construction Manager', cred: 'CRED coordinator', arch: 'Architect', civil: 'Civil engineering', sign: 'Signage vendor', gc: 'General contractor', sup: 'Site superintendent', llm: 'Landlord · main', llc: 'Landlord · construction', ops: 'Ops · business coach' };
const MBR = ['rem', 'pdm', 'cm', 'cred', 'sup', 'llm', 'llc', 'ops', 'avp'];
export function person(s, role) { const P = PF.data.people, i = MBR.indexOf(role); if (i >= 0 && i < s.lx.mb.length) return P[s.lx.mb[i]]; const F = PF.data.firms, f = s.lx.firms;
  return role === 'arch' ? F.arch[f[0]] : role === 'civil' ? F.civil[f[1]] : role === 'sign' ? F.sign[f[2]] : role === 'gc' ? F.gc[f[3]] : EXEC[role] || P[0]; }
const EXEC = { coo: 'Avery Q. (COO)', cfo: 'Jordan M. (CFO)', pres: 'Riley S. (President of Ops)', svp: 'Casey D. (SVP Field Ops)', mp: 'Market Planning team', dir: 'Morgan T. (Dev Director)', legal: 'Legal team' };
const ini = (n) => String(n).replace(/\(.*\)/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const hue = (n) => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const av = (n, cls = '') => `<i class="pf-av ${cls}" style="--h:${hue(n)}" title="${esc(n)}">${esc(ini(n))}</i>`;
// how far along the project is: Open → everything done; Looking → up to the REC; Rejected → stopped at the REC
function horizon(s) { const T = TODAY(); return s.stage === 'Open' ? Infinity : s.stage === 'Rejected' ? s.lx.pStart + 95 : s.stage === 'Approved' ? T : Math.min(T, s.lx.pStart + (s.stage === 'REC' ? 95 : 60)); }
export function schedule(s) { if (s._sch) return s._sch; const T = TODAY(), p0 = s.lx.pStart, hz = horizon(s); let slip = 0; const out = [];
  TASK.forEach(([g, n, off, dur, st, role], i) => { const bS = p0 + off, bE = bS + dur, sl = s.lx.slips[i] || 0; let fS = bS + slip; slip += sl; let fE = fS + dur + sl;
    let state, pct; const stopped = s.stage === 'Rejected' && off > 95, gated = (s.stage === 'Pre-REC' || s.stage === 'REC') && off >= 80;
    if (s.stage === 'Approved') {   // one source: the opening stage (os) decides what is done; dates follow it
      if (st < s.os) { state = 'done'; pct = 100; if (fE > T) { fE = T - (s.os - st) * 3; fS = Math.min(fS, fE - dur); } }
      else if (st === s.os) { if (fE <= T && i < TASK.length - 1 && TASK[i + 1][4] === st) { state = 'done'; pct = 100; } else if (fS > T + 3) { state = 'todo'; pct = 0; } else { state = 'active'; fS = Math.min(fS, T - 3); fE = Math.max(fE, T + 5 + sl); pct = Math.round(clamp((T - fS) / (fE - fS), 0, 0.95) * 100); } }
      else { state = 'todo'; pct = 0; const at = T + 6 + (st - s.os - 1) * 12 + (off - 255 > 0 ? (off - 255) / 3 : 0); if (fS < at) { fS = Math.round(at); fE = fS + dur + sl; } }
    } else if (stopped) { state = 'canceled'; pct = 0; } else if (fE <= hz && !gated) { state = 'done'; pct = 100; } else if (fS <= T && !gated && s.stage !== 'Rejected') { state = 'active'; pct = Math.round(clamp((T - fS) / (fE - fS), 0, 0.95) * 100); }
    else { state = 'todo'; pct = 0; if (gated) { const sh = Math.max(0, T - bS + 10); fS = Math.max(fS, bS + sh); fE = fS + dur + sl; } }
    const deadline = bE + 7, slack = deadline - fE, late = state !== 'canceled' && state !== 'done' ? fE > bE + 2 && (state === 'active' || fE > T) : fE > bE + 2;
    out.push({ i, g, n, role, who: person(s, role), st, bS, bE, fS, fE, dur: fE - fS, slack, late: late && sl > 0 || fE - bE > 6 && state !== 'done', state, pct }); });
  return (s._sch = out); }
export function behind(s) { const L = schedule(s), last = L[L.length - 1]; return last.fE - last.bE; }
// approval workflows (statuses follow the ONE stage source + dates)
const WF = [['🗳', 'Real Estate Committee', [['REC package', 'rem', 'dir'], ['COO approval', 'coo'], ['CFO approval', 'cfo'], ['President of Ops approval', 'pres'], ['SVP Field Ops approval', 'svp'], ['Market Planning approval', 'mp'], ['Close-out', 'cred']], 75],
  ['💰', 'Budget · Baseline', [['Prepare', 'pdm'], ['Director review', 'dir'], ['Rework', 'pdm', 0, 1], ['REM review', 'rem'], ['Re-review', 'dir'], ['Approve', 'cfo']], 45],
  ['💰', 'Budget · Committed', [['Prepare', 'cm'], ['Director review', 'dir'], ['Rework', 'cm', 0, 1], ['REM review', 'rem'], ['Re-review', 'dir'], ['Approve', 'cfo']], 230],
  ['🤝', 'GC Agreement', [['Draft agreement', 'cm'], ['Legal review', 'legal'], ['GC signature', 'gc'], ['Countersign', 'dir']], 205],
  ['🔓', 'Release of Contingencies', [['Set up', 'cred'], ['Construction sign-off', 'cm'], ['Legal sign-off', 'legal'], ['Final approval', 'cfo']], 175],
  ['👥', 'Assign project members', [['Assign team', 'cred'], ['Confirm roles', 'rem']], 20]];
export function workflows(s) { if (s._wf) return s._wf; const T = TODAY(), hz = horizon(s), p0 = s.lx.pStart, out = [];
  // which approval is live now follows the opening stage (os): committed budget at pre-con, GC at build start, contingencies near the end
  const gate = [3, 0, 4, 4, 9, 0], live = s.stage === 'REC' ? 0 : s.stage === 'Approved' ? (s.os === 4 ? 2 : s.os === 5 ? 3 : s.os >= 9 ? 4 : -1) : -1;
  WF.forEach(([icon, name, steps, off], w) => { const seed = s.lx.wf[w % s.lx.wf.length]; let begun = p0 + off + (seed % 4) * 3; const hzW = w === live ? T : hz;
    if (w === live) begun = T - 6 - seed * 5;
    if (s.stage === 'Approved' && w > 1 && w !== live && s.os < gate[w] + (w === 4 ? 0 : 1)) { out.push({ icon, name, status: 'NOT STARTED', steps: [], begun: null }); return; }
    if (begun > T || (s.stage === 'Rejected' && off > 95) || ((s.stage === 'Pre-REC') && off > 60) || (s.stage === 'REC' && off > 80)) { out.push({ icon, name, status: 'NOT STARTED', steps: [], begun: null }); return; }
    let d = begun, waiting = null; const st = [];
    steps.forEach(([sn, role, , rework], k) => { if (rework && seed % 3 !== 0) return; const due = d + 5 + (k % 3) * 2, take = 2 + ((seed + k * 3) % 7) + (role === 'cfo' || role === 'coo' ? 3 : 0), end = d + take;
      const who = person(s, role); let status;
      if (waiting) status = 'Upcoming'; else if (rework && seed % 2) status = 'Canceled'; else if (end <= (w === live ? T - 1 - seed : hzW) && !(w === live && k >= 1 + seed % (st.length + 2))) status = /approv/i.test(sn) || k > 0 ? 'Approved' : 'Complete'; else { status = 'Pending'; waiting = { sn, who, role, days: T - d, over: T > due }; }
      if (s.stage === 'Rejected' && w === 0 && k === 1 && status !== 'Pending') status = 'Rejected';
      st.push({ sn, role, who, status, start: d, due, done: status === 'Pending' || status === 'Upcoming' ? null : Math.min(end, hzW), rework: !!rework, notify: k === steps.length - 1 ? person(s, 'rem') : null }); if (status !== 'Pending' && status !== 'Upcoming' && status !== 'Canceled') d = end + 1; });
    if (s.stage === 'Rejected' && w === 0) { const ri = st.findIndex((x) => x.status === 'Rejected'); st.forEach((x, k) => { if (k > ri && ri >= 0) { x.status = 'Canceled'; x.done = null; } }); waiting = null; }
    if (w === live && !waiting) { const k = st.findIndex((x) => x.status !== 'Canceled' && x.rework === false && x === st[st.length - 1]); const L2 = st[st.length - 1]; L2.status = 'Pending'; L2.done = null; waiting = { sn: L2.sn, who: L2.who, role: L2.role, days: T - L2.start, over: T > L2.due }; }
    const closed = !waiting, end = closed ? Math.max(...st.map((x) => x.done || 0)) : null;
    out.push({ icon, name, status: closed ? 'CLOSED' : 'OPEN', begun, completed: end, days: (closed ? end : T) - begun, steps: st, waiting }); });
  return (s._wf = out); }
// opening-stage rollups (our 11 stages) from the tasks + the REC workflow
export function rollup(s) { const C = window.CO, ST = C ? C.STAGES : [], sch = schedule(s), wf = workflows(s)[0];
  return ST.map((x, i) => { const t = sch.filter((k) => k.st === i); let pct = t.length ? Math.round(t.reduce((a, k) => a + k.pct, 0) / t.length) : null;
    if (x.id === 'vote') pct = s.stage === 'Approved' || s.stage === 'Open' ? 100 : s.stage === 'Rejected' ? 0 : wf.status === 'OPEN' ? Math.round(wf.steps.filter((k) => k.status === 'Approved' || k.status === 'Complete').length / 7 * 100) : 0;
    if (pct == null) pct = s.stage === 'Open' ? 100 : s.os > i ? 100 : s.os === i ? 50 : 0;
    if (s.stage === 'Open') pct = 100; return { ...x, pct, late: t.some((k) => k.late && k.state !== 'done'), rejected: x.id === 'vote' && s.stage === 'Rejected' }; }); }
export function overallPct(s) { const R = rollup(s); return R.length ? Math.round(R.reduce((a, r) => a + r.pct, 0) / R.length) : 0; }
// ---- tabs
const KS = ['Key status', 'LOI signed', 'RE Committee approved', 'RE contract executed', 'In planning review', 'Permits applied', 'Under construction', 'Turnover to Ops', 'Open'];
function keyStatus(s) { const ms = s.lx.ms; let k = 0; ms.forEach((d, i) => { if (d != null) k = i + 1; }); return s.stage === 'Rejected' ? 'Rejected' : s.stage === 'Pre-REC' ? 'Pre-REC · scouting' : s.stage === 'REC' ? 'REC · package in review' : KS[k] || 'Started'; }
function riskFactor(s) { const b = behind(s), n = s.nr; const lvl = b > 30 || n >= 5 ? 'High' : b > 10 || n >= 3 ? 'Medium' : 'Low'; const d = new Date(Date.UTC(2020, 0, 1) + TODAY() * 864e5); return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()} · ${lvl}`; }
export function tabSum(s) { const lx = s.lx, R = rollup(s), ms = lx.ms, turnBase = s.lx.baseOpen - 10, sch = schedule(s), turn = sch[22];
  const fact = (i, k, v, cls = '') => `<span class="${cls}"><small>${i} ${k}</small><b>${esc(v)}</b></span>`;
  return `<h4>🛤 Opening tracker <small>· rolled up from ${TASK.length} schedule tasks + workflows · ${overallPct(s)}%</small></h4>
   <div class="pf-roll">${R.map((r) => `<div class="${r.pct >= 100 ? 'done' : r.pct > 0 ? 'go' : ''} ${r.late ? 'late' : ''} ${r.rejected ? 'rej' : ''}" title="${esc(r.name)} · ${r.pct}%"><b>${r.rejected ? '⛔' : r.icon}</b><i style="--p:${r.pct}"></i><small>${esc(r.short)}</small></div>`).join('')}</div>
   <h4>🏷 General info</h4><div class="pf-facts">${fact('📛', 'Project', `${s.code} · ${s.addr} · ${s.city} · ${s.stage}`, 'w2')}${fact('🗂', 'Portfolio', lx.fr ? 'Franchise' : 'Company shops')}${fact('🔁', 'Relocation', lx.reloc ? 'Yes' : 'No')}${fact('🤝', 'Franchisee / operator', lx.fr && lx.frIdx >= 0 ? PF.data.firms.fr[lx.frIdx] : 'Company operated')}${fact('🧑‍🏫', 'Business coach', person(s, 'ops'))}${fact('🧭', 'AVP', person(s, 'avp'))}</div>
   <h4>📍 Site data</h4><div class="pf-facts">${fact('🗺', 'ROA / region', 'ROA ' + lx.roa)}${fact('#️⃣', 'Shop # in ROA', lx.shopNo)}${fact('📄', 'Deal type', lx.fr ? 'Franchise' : 'Company owned')}${fact('🏗', 'Project type', s.deal.type ? 'BTS' : 'Ground lease')}${fact('🏠', 'Building type', lx.btype)}${fact('📏', 'Building', s.deal.bsf.toLocaleString() + ' sf')}${fact('🗺', 'Property', s.deal.psf.toLocaleString() + ' sf')}${fact('🏛', 'County', s.county)}${fact('🌐', 'Lat / lng', s.ll.join(', '))}</div>
   <h4>📅 Key dates & status</h4><div class="pf-facts">${fact('🚦', 'Key status', keyStatus(s))}${fact('⚠', 'Risk factor', riskFactor(s), /High/.test(riskFactor(s)) ? 'bad' : '')}${fact('🎯', 'Original turnover to Ops', dayStr(turnBase))}${fact('🔁', 'Times turnover moved', lx.moved, lx.moved ? 'bad' : '')}${fact('📆', 'Turnover (forecast)', dayStr(turn.fE))}${fact('🎉', 'Open date', dayStr(s.stage === 'Open' ? ms[7] : sch[23].fE) + (s.stage === 'Open' ? '' : ' (fcst)'))}${fact('⏱', 'Vs baseline', behind(s) > 0 ? `${behind(s)} days behind` : 'on time ✓', behind(s) > 0 ? 'bad' : '')}</div>
   <h4>🏁 Milestone actuals</h4><div class="pf-ms">${KS.slice(1).map((k, i) => `<div class="${ms[i] != null ? 'done' : ''}"><b>${ms[i] != null ? '✓' : i + 1}</b><span>${k}</span><small>${ms[i] != null ? dayStr(ms[i]) : '—'}</small></div>`).join('')}</div>
   <h4>👥 Project members</h4><div class="pf-mem">${Object.entries(ROLE).map(([k, r]) => { const n = k === 'llm' || k === 'llc' ? person(s, k) : person(s, k); return `<div>${av(n)}<span><b>${esc(n)}</b><small>${esc(r)}</small></span></div>`; }).join('')}</div>`; }
export function tabWf(s) { const W = workflows(s), T = TODAY();
  return W.map((w) => `<div class="pf-wf ${w.status === 'OPEN' ? 'open' : w.status === 'CLOSED' ? 'closed' : 'ns'}"><header><b>${w.icon} ${esc(w.name)}</b><span class="pf-pill">${w.status}</span>${w.begun != null ? `<small>begun ${dayStr(w.begun)}${w.completed ? ` · done ${dayStr(w.completed)}` : ''} · ${w.days} days ${w.status === 'OPEN' ? 'open' : ''}</small>` : '<small>not started yet</small>'}</header>
   ${w.waiting ? `<p class="pf-wait ${w.waiting.over ? 'over' : ''}">⏳ Waiting on <b>${esc(w.waiting.who)}</b> (${esc(w.waiting.sn)}) for <b>${w.waiting.days} days</b>${w.waiting.over ? ' · overdue' : ''}</p>` : ''}
   ${w.steps.length ? `<div class="pf-chain">${w.steps.map((k) => { const over = k.status === 'Pending' && T > k.due; return `<div class="st ${k.status.toLowerCase()} ${over ? 'over' : ''} ${k.rework ? 'rw' : ''}">${av(k.who)}<b class="ck">${k.status === 'Upcoming' ? '○' : k.status === 'Pending' ? (over ? '!' : '…') : k.status === 'Canceled' ? '✕' : k.status === 'Rejected' ? '⛔' : '✓'}</b><span>${k.rework ? '↩ ' : ''}${esc(k.sn)}</span><small>${esc(k.who)}</small><small>${k.status}${k.done ? ' ' + dayStr(k.done).slice(5) : ` · due ${dayStr(k.due).slice(5)}`}</small></div>`; }).join('<em class="ar">➜</em>')}</div>` : ''}</div>`).join(''); }
export function tabSch(s) { const L = schedule(s), T = TODAY(), lo0 = Math.min(...L.map((t) => Math.min(t.bS, t.fS))) - 10, hi = Math.max(...L.map((t) => Math.max(t.bE, t.fE, t.bE + 7))) + 10;
  // zoom the axis to the active window: long-running pipeline sites start ~5 months before today; earlier (finished) work is clipped with a ◀ marker
  const lo = s.stage !== 'Open' && hi - lo0 > 360 ? Math.max(lo0, Math.min(T - 150, hi - 300)) : lo0, span = hi - lo, cl = (d) => Math.max(lo, Math.min(hi, d));
  PF.gantt = { lo, hi, zoomed: lo > lo0 };
  const x = (d) => ((cl(d) - lo) / span * 100).toFixed(2) + '%', w = (a, b) => (Math.max(0.4, (cl(b) - cl(a)) / span * 100)).toFixed(2) + '%';
  const months = [], stepD = span > 420 ? 91 : span > 200 ? 61 : 30; for (let d = lo + 5; d <= hi - 5; d += stepD) months.push(d); let g = '';
  const lateN = L.filter((t) => t.late).length;
  return `<div class="pf-gl"><span><i class="bl"></i>Baseline</span><span><i class="fc"></i>Forecast</span><span><i class="dn"></i>Done</span><span><i class="lt"></i>Late</span><span><i class="sk"></i>Slack</span><span><i class="td"></i>Today</span>${PF.gantt && false ? '' : ''}<b class="${lateN ? 'bad' : ''}">${lateN ? `⚠ ${lateN} late` : '✓ on track'} · ${behind(s) > 0 ? behind(s) + ' days behind baseline' : 'on baseline'}</b></div>
   <div class="pf-gantt"><div class="gh"><span></span><div>${months.map((d) => `<em style="left:${x(d)}">${dayStr(d).slice(2, 7)}</em>`).join('')}</div></div>
   ${L.map((t) => { const head = t.g !== g ? (g = t.g, `<div class="gg">${esc(t.g)}</div>`) : ''; return head + `<div class="gr ${t.late ? 'late' : ''} ${t.state}" data-task="${t.i}"><span title="${esc(t.n)} · ${esc(t.who)}">${t.late ? '⚠ ' : t.state === 'done' ? '✓ ' : ''}${esc(t.n)}<small>${esc(t.who)} · ${t.pct}% · slack ${t.slack}d</small></span><div class="tl">
     ${t.fE < lo && t.bE < lo ? '<em class="past">◀ done earlier</em>' : ''}<i class="b" style="left:${x(t.bS)};width:${w(t.bS, t.bE)}"></i><i class="f" style="left:${x(t.fS)};width:${w(t.fS, t.fE)}"><u style="width:${t.pct}%"></u></i>${t.slack > 0 && t.state !== 'done' ? `<i class="sk" style="left:${x(t.fE)};width:${w(t.fE, t.fE + t.slack)}"></i>` : ''}</div></div>`; }).join('')}
   <div class="today" style="left:calc(var(--gl, 150px) + (100% - var(--gl, 150px)) * ${((T - lo) / span).toFixed(4)})"><b>Today</b></div></div>`; }
// ---- docs: generated SVG placeholders (no photos)
export function docSvg(s, k) { const h = hue(s.code), seed = parseInt(s.code.slice(2), 10), cars = 8 + seed % 12, W = 640, H = 420, lab = `<text x="16" y="404" font-size="13" fill="#5d6b85" font-family="system-ui">🧪 Generated placeholder · ${s.code} · not a real plan or photo</text>`;
  if (k === 0) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#16295a"/><circle cx="320" cy="150" r="70" fill="#7cc4f0"/><text x="320" y="166" text-anchor="middle" font-size="48" fill="#16295a">☕</text><text x="320" y="270" text-anchor="middle" font-size="34" font-weight="800" fill="#fff" font-family="system-ui">Site plan · ${s.code}</text><text x="320" y="306" text-anchor="middle" font-size="18" fill="#7cc4f0" font-family="system-ui">${esc(s.addr)} · ${esc(s.city)}, ${s.st}</text><text x="320" y="340" text-anchor="middle" font-size="15" fill="#c5cfdd" font-family="system-ui">Rev. ${1 + seed % 4} · ${s.deal.bsf} sf · ${s.deal.type ? 'BTS' : 'Ground lease'}</text>${lab.replace('#5d6b85', '#c5cfdd')}</svg>`;
  if (k === 1) { let c = ''; for (let i = 0; i < cars; i++) { const t = i / cars, a = Math.PI * 1.1 * t; const lane = i % 2; const r = 120 + lane * 26; c += `<rect x="${(330 + Math.cos(a + 0.4) * r * 1.3).toFixed(0)}" y="${(205 + Math.sin(a + 0.4) * r * 0.9).toFixed(0)}" width="22" height="13" rx="4" fill="${lane ? '#f5a524' : '#1f5fd1'}"/>`; }
    let p = ''; for (let i = 0; i < 14; i++) p += `<rect x="${40 + i * 40}" y="350" width="34" height="34" fill="none" stroke="#9aa7bd"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#eef3fa"/><rect x="20" y="20" width="600" height="${H - 60}" fill="#fff" stroke="#c5cfdd" stroke-dasharray="8 6"/><path d="M150 330 C 120 150, 540 60, 560 240 S 380 360, 300 300" fill="none" stroke="#c5cfdd" stroke-width="64" stroke-linecap="round"/><rect x="280" y="170" width="110" height="70" fill="#16295a" rx="6"/><text x="335" y="212" text-anchor="middle" fill="#fff" font-size="16" font-family="system-ui">Shop ${s.deal.bsf} sf</text>${c}${p}<text x="40" y="44" font-size="16" font-weight="700" fill="#16295a" font-family="system-ui">Layout · double drive-thru · stacking ${cars} cars</text>${lab}</svg>`; }
  if (k === 2) { let b = ''; for (let i = 0; i < 18; i++) b += `<rect x="${(seed * (i + 3) * 37) % 600}" y="${(seed * (i + 7) * 53) % 380}" width="${40 + (i * 13) % 50}" height="${30 + (i * 17) % 40}" fill="hsl(${(h + i * 9) % 360},18%,${70 + i % 3 * 5}%)"/>`;
    const pts = Array.from({ length: 7 }, (_, i) => { const a = i / 7 * Math.PI * 2, r = 120 + (seed * (i + 1)) % 60; return `${(320 + Math.cos(a) * r * 1.3).toFixed(0)},${(200 + Math.sin(a) * r).toFixed(0)}`; }).join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#cfd8c4"/>${b}<path d="M0 200 H640 M320 0 V420" stroke="#8a8f99" stroke-width="18"/><polygon points="${pts}" fill="rgba(31,95,209,.18)" stroke="#1f5fd1" stroke-width="3" stroke-dasharray="10 6"/><circle cx="335" cy="185" r="12" fill="#e5484d" stroke="#fff" stroke-width="3"/><text x="16" y="30" font-size="16" font-weight="700" fill="#16295a" font-family="system-ui">Aerial · trade area (${s.tap.toLocaleString()} TA pop)</text>${lab}</svg>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="250" fill="#9fd0f2"/><rect y="250" width="${W}" height="170" fill="#8a8f99"/><polygon points="250,420 390,420 330,250 310,250" fill="#f5f5f5" opacity=".7"/><rect x="380" y="160" width="190" height="95" fill="#16295a" rx="6"/><rect x="400" y="140" width="150" height="26" fill="#1f5fd1" rx="4"/><text x="475" y="159" text-anchor="middle" fill="#fff" font-size="14" font-family="system-ui">COFFEE (placeholder)</text><rect x="60" y="190" width="140" height="65" fill="hsl(${h},20%,70%)"/><text x="16" y="30" font-size="16" font-weight="700" fill="#16295a" font-family="system-ui">Street view · ${esc(s.addr)}</text>${lab}</svg>`; }
const DOCS = [['📘', 'Site plan · cover'], ['🚗', 'Site plan · layout + stacking'], ['🛰', 'Aerial · trade area'], ['🛣', 'Street view']];
export function tabDocs(s) { return `<div class="pf-docs">${DOCS.map(([i, n], k) => `<button class="pf-doc" data-doc="${k}" aria-label="Open ${esc(n)}"><span class="th">${docSvg(s, k)}</span><b>${i} ${esc(n)}</b></button>`).join('')}</div>`; }
export function openDoc(k) { const s = PF.sel; if (!s) return; let v = $('pfDocV'); if (!v) { v = document.createElement('div'); v.id = 'pfDocV'; v.setAttribute('role', 'dialog'); $('pf').appendChild(v); }
  v.hidden = false; v.dataset.k = k; v.innerHTML = `<header><b>${DOCS[k][0]} ${esc(DOCS[k][1])} · ${s.code}</b><span>${k + 1} / ${DOCS.length}</span><button class="pf-ib" data-docnav="-1" aria-label="Previous">◀</button><button class="pf-ib" data-docnav="1" aria-label="Next">▶</button><button class="pf-ib" data-pf="docClose" aria-label="Close viewer">✕</button></header><div class="pf-docimg">${docSvg(s, k)}</div><nav>${DOCS.map((d, j) => `<button class="pf-doc mini ${j === k ? 'on' : ''}" data-doc="${j}" aria-label="${esc(d[1])}"><span class="th">${docSvg(s, j)}</span></button>`).join('')}</nav>`; }
// ---- comments: REM, Ops, AVP decision
export function tabCm(s) { const P = PF.data.people, C = s.cm.map(([k, t, d, p]) => ({ k, txt: CMT[t], d, who: P[p] })), avp = person(s, 'avp');
  if (s.stage === 'Approved' || s.stage === 'Open') C.push({ k: 1, d: s.lx.ms[1] != null ? s.lx.ms[1] : s.lx.pStart + 95, who: avp, txt: '✅ AVP decision: approve. Numbers clear the targets; proceed to lease.', dec: 'ok' });
  else if (s.stage === 'Rejected') C.push({ k: 1, d: s.lx.pStart + 95, who: avp, txt: '⛔ AVP decision: decline. ' + (risks(s)[0] || 'Returns under target.'), dec: 'no' });
  else if (s.stage === 'REC') C.push({ k: 1, d: TODAY(), who: avp, txt: `⏳ AVP decision pending · ${s.st_.rec}`, dec: 'wait' });
  C.sort((a, b) => b.d - a.d); const by = [0, 2, 1].map((k) => [k, C.filter((c) => c.k === k).length]);
  return `<div class="pf-cmf">${by.map(([k, n]) => `<span>${CMTK[k][0]} ${CMTK[k][1]} · ${n}</span>`).join('')}</div>${C.map((c) => `<div class="pf-cm2 ${c.dec || ''}">${av(c.who)}<div><b>${CMTK[c.k][0]} ${CMTK[c.k][1]} · ${esc(c.who)}</b> <small>${dayStr(c.d)}</small><p>${esc(c.txt)}</p></div></div>`).join('') || '<p class="muted">No comments yet</p>'}`; }
// ---- portfolio views: ⏳ Bottlenecks and 📉 Slipping sites
export function bottlenecks() { const by = {}, worst = []; for (const s of PF.list) { if (s.stage === 'Open' || s.stage === 'Rejected') continue; for (const w of workflows(s)) { for (const k of w.steps) { const r = by[k.role] || (by[k.role] = { role: k.role, pend: 0, over: 0, days: 0, n: 0, done: 0 }); if (k.status === 'Pending') { r.pend++; if (TODAY() > k.due) r.over++; } else if (k.done) { r.days += k.done - k.start; r.done++; } }
    if (w.waiting) worst.push({ s, w, days: w.waiting.days, over: w.waiting.over }); } }
  return { roles: Object.values(by).filter((r) => r.pend || r.done).sort((a, b) => b.pend - a.pend), worst: worst.sort((a, b) => b.days - a.days).slice(0, 12) }; }
const RNAME = Object.assign({}, ROLE, { coo: 'COO', cfo: 'CFO', pres: 'President of Ops', svp: 'SVP Field Ops', mp: 'Market Planning', dir: 'Development Director', legal: 'Legal' });
export function renderBott() { const B = bottlenecks(), mx = Math.max(1, ...B.roles.map((r) => r.pend));
  return `<div class="pf-alt"><h3>⏳ Bottlenecks <small>· pending approval steps by approver, across ${PF.list.filter((s) => s.stage !== 'Open' && s.stage !== 'Rejected').length} active sites in view</small></h3>
   <div class="pf-bt">${B.roles.map((r) => `<div class="row" data-role="${r.role}"><b>${esc(RNAME[r.role] || r.role)}</b><div class="bar"><i style="width:${r.pend / mx * 100}%"></i><em style="width:${r.over / mx * 100}%"></em></div><span><b>${r.pend}</b> pending${r.over ? ` · <em>${r.over} overdue</em>` : ''}</span><small>${r.done ? (r.days / r.done).toFixed(1) : '—'} days / step</small></div>`).join('')}</div>
   <h3>🐢 Longest waits</h3><div class="pf-list">${B.worst.map(({ s, w, days, over }) => `<button class="pf-li ${over ? 'over' : ''}" data-code="${s.code}"><b>${s.code}</b><span>${esc(s.city)}, ${s.st}</span><span>${w.icon} ${esc(w.name)}</span><span>⏳ ${esc(w.waiting.who)}</span><b class="d">${days} d</b></button>`).join('')}</div></div>`; }
export function slipping() { return PF.list.filter((s) => s.stage === 'Approved').map((s) => ({ s, b: behind(s), late: schedule(s).filter((t) => t.late).length })).filter((x) => x.b > 0 || x.s.lx.moved).sort((a, b) => b.b - a.b || b.s.lx.moved - a.s.lx.moved); }
export function renderSlip() { const L = slipping(), mx = Math.max(1, ...L.map((x) => x.b));
  return `<div class="pf-alt"><h3>📉 Slipping sites <small>· ${L.length} pipeline sites behind baseline or with a moved turnover</small></h3><div class="pf-list">${L.slice(0, 60).map(({ s, b, late }) => `<button class="pf-li ${b > 30 ? 'over' : ''}" data-code="${s.code}"><b>${s.code}</b><span>${esc(s.city)}, ${s.st}</span><span class="sb"><i style="width:${b / mx * 100}%"></i></span><b class="d">+${b} d</b><span>🔁 ${s.lx.moved}× moved</span><span>⚠ ${late} late tasks</span></button>`).join('')}</div></div>`; }

window.PFV = { PF, open, close, openSite, status, risks, upsides, sens, filtered, refresh, clusters, load, schedule, workflows, rollup, overallPct, behind, bottlenecks, slipping, docSvg, openDoc };
