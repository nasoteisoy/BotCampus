// Coffee Opening v7 · 📊 light report builder + ▶ simulate (old vs new template set) + export/import. All over the 1,900 🧪 FAKE sites.
// Reports read the same one-model data the site panel shows (PFV.schedule / PFV.workflows), so numbers match everywhere.
import * as LX from './lx-model.js?v=7';
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PV = () => window.PFV, STG = () => (window.CO ? window.CO.STAGES : Array.from({ length: 11 }, (_, i) => ({ icon: '•', short: 'Stage ' + (i + 1), name: 'Stage ' + (i + 1) })));
const RN = (r) => LX.ROLES[r] || r, SAVE = 'coffee-opening-reports';
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0), r1 = (x) => Math.round(x * 10) / 10;
const hash = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export const R = { src: 'slip', f: { st: '', stage: '', q: '', min: 0 }, cols: null, sort: null, desc: true, name: '', saved: null, simA: 'asis', simB: 'proposed', sim: null };
// ---------- report sources: columns [key, label, numeric]
export const SRC = {
  slip: { n: '📉 Slipping sites', site: true, cols: [['code', 'Site'], ['city', 'City'], ['st', 'State'], ['os', 'Opening stage'], ['behind', 'Days behind', 1], ['late', 'Late tasks', 1], ['moves', 'Turnover moves', 1], ['open', 'Forecast open']] },
  role: { n: '⏳ Approval bottlenecks by role', cols: [['role', 'Approver role'], ['pend', 'Pending', 1], ['over', 'Overdue', 1], ['escl', 'Escalated', 1], ['avg', 'Avg days / step', 1], ['sites', 'Sites waiting', 1]] },
  tov: { n: '☕ Turnover moves', site: true, cols: [['code', 'Site'], ['city', 'City'], ['st', 'State'], ['moves', 'Times moved', 1], ['base', 'Baseline turnover'], ['fc', 'Forecast turnover'], ['delta', 'Δ days', 1]] },
  cycle: { n: '⏱ Cycle time by stage', cols: [['stage', 'Opening stage'], ['n', 'Sites', 1], ['base', 'Baseline days', 1], ['act', 'Actual days', 1], ['delta', 'Δ days', 1], ['latep', '% late', 1]] },
  stale: { n: '🧟 Stale tasks / missing owners', site: true, cols: [['code', 'Site'], ['city', 'City'], ['st', 'State'], ['kind', 'Issue'], ['item', 'Task / step'], ['owner', 'Owner'], ['days', 'Days', 1]] } };
function sites() { const P = PV(), f = R.f, q = f.q.trim().toLowerCase(); return P.PF.sites.filter((s) => (!f.st || s.st === f.st) && (!f.stage || s.stage === f.stage) && (!q || s.code.toLowerCase().includes(q) || s.city.toLowerCase().includes(q))); }
const osName = (s) => (s.stage === 'Approved' ? (STG()[s.os] || {}).short || s.os : s.stage);
// a task counts as "no owner" when its LX owner field is blank (seeded, ~3% of open tasks; fake)
export const noOwner = (s, t) => t.state !== 'done' && t.state !== 'canceled' && hash(s.code + t.id) % 33 === 0;
export function rows(src = R.src) { const P = PV(), T = P.TODAY(), L = sites(), out = [];
  if (src === 'slip') for (const s of L) { if (s.stage !== 'Approved') continue; const b = P.behind(s); if (b <= 0 && !s.lx.moved) continue; const sc = P.schedule(s);
    out.push({ code: s.code, city: s.city, st: s.st, os: osName(s), behind: b, late: sc.filter((t) => t.late).length, moves: +s.lx.moved || 0, open: P.dayStr(sc[sc.length - 1].fE) }); }
  if (src === 'tov') for (const s of L) { if (!s.lx.moved) continue; const t = P.schedule(s).find((x) => x.id === 'tov') || P.schedule(s).slice(-2)[0]; out.push({ code: s.code, city: s.city, st: s.st, moves: +s.lx.moved, base: P.dayStr(t.bE), fc: P.dayStr(t.fE), delta: t.fE - t.bE }); }
  if (src === 'role') { const by = {}; for (const s of L) { if (s.stage === 'Open' || s.stage === 'Rejected') continue; for (const w of P.workflows(s)) for (const k of w.steps) { const r = by[k.role] || (by[k.role] = { role: RN(k.role), pend: 0, over: 0, escl: 0, d: [], S: new Set() });
      if (k.status === 'Pending') { r.pend++; r.S.add(s.code); if (T > k.due) r.over++; if (T > k.esc) r.escl++; } else if (k.done) r.d.push(k.done - k.start); } }
    for (const r of Object.values(by)) if (r.pend || r.d.length) out.push({ role: r.role, pend: r.pend, over: r.over, escl: r.escl, avg: r1(avg(r.d)), sites: r.S.size }); }
  if (src === 'cycle') { const ST = STG(); ST.forEach((x, i) => { const b = [], a = [], late = []; for (const s of L) { const ts = P.schedule(s).filter((t) => t.st === i); if (!ts.length) continue; const done = ts.every((t) => t.state === 'done');
      b.push(Math.max(...ts.map((t) => t.bE)) - Math.min(...ts.map((t) => t.bS))); if (done) { const d = Math.max(...ts.map((t) => t.fE)) - Math.min(...ts.map((t) => t.fS)); a.push(d); late.push(d > b[b.length - 1] + 2 ? 1 : 0); } }
    if (b.length) out.push({ stage: `${x.icon} ${x.short || x.name}`, n: a.length, base: r1(avg(b)), act: a.length ? r1(avg(a)) : '—', delta: a.length ? r1(avg(a) - avg(b)) : '—', latep: a.length ? Math.round(avg(late) * 100) : '—' }); }); }
  if (src === 'stale') for (const s of L) { if (s.stage === 'Open' || s.stage === 'Rejected') continue; for (const t of P.schedule(s)) { if (t.state === 'active' && T - t.fS > (t.bE - t.bS) * 1.25 + 5) out.push({ code: s.code, city: s.city, st: s.st, kind: '🧟 stale task', item: t.n, owner: t.who ? t.who.name || t.who : '—', days: T - t.fS });
      if (noOwner(s, t)) out.push({ code: s.code, city: s.city, st: s.st, kind: '👤 no owner', item: t.n, owner: '— unassigned', days: Math.max(0, T - t.fS) }); }
    for (const w of P.workflows(s)) for (const k of w.steps) if (k.status === 'Pending' && T > k.esc) out.push({ code: s.code, city: s.city, st: s.st, kind: '⏫ escalated step', item: `${w.name} · ${k.sn}`, owner: k.who ? k.who.name || k.who : '—', days: T - k.start }); }
  const min = +R.f.min || 0, num = SRC[src].cols.filter((c) => c[2]).map((c) => c[0]), mk = num.includes('days') ? 'days' : num.includes('behind') ? 'behind' : num[0];
  const F = min ? out.filter((r) => (typeof r[mk] === 'number' ? r[mk] : 0) >= min) : out; const k = R.sort && SRC[src].cols.some((c) => c[0] === R.sort) ? R.sort : src === 'cycle' ? null : mk;
  if (k) F.sort((a, b) => { const x = a[k], y = b[k]; const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return R.desc ? -c : c; });
  return F; }
const colsOf = () => { const all = SRC[R.src].cols; return R.cols ? all.filter((c) => R.cols.includes(c[0])) : all; };
export function savedList() { if (R.saved) return R.saved; try { R.saved = JSON.parse(localStorage.getItem(SAVE) || '[]').filter((x) => x && SRC[x.src]); } catch (e) { R.saved = []; } return R.saved; }
const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(R.saved)); } catch (e) { /* full */ } };
export function csv(head, data) { const q = (v) => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }; return [head.map(q).join(','), ...data.map((r) => r.map(q).join(','))].join('\n') + '\n'; }
export function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
export function reportView() { const P = PV(), C = colsOf(), all = SRC[R.src].cols, D = rows(), states = [...new Set(P.PF.sites.map((s) => s.st))].sort(), stages = ['Pre-REC', 'REC', 'Approved', 'Open', 'Rejected'];
  return `<div class="rp"><div class="rp-pre">${Object.entries(SRC).map(([k, v]) => `<button data-r="src" data-k="${k}" class="${R.src === k && !R.name ? 'on' : ''}">${esc(v.n)}</button>`).join('')}</div>
   <div class="rp-saved">💾 Saved: ${savedList().length ? savedList().map((x, i) => `<span class="${R.name === x.name ? 'on' : ''}"><button data-r="open" data-i="${i}">${esc(x.name)}</button><button data-r="delSaved" data-i="${i}" aria-label="Delete saved report">✕</button></span>`).join('') : '<i>none yet. Pick a preset, choose filters and columns, then save it.</i>'}</div>
   <div class="rp-f"><select data-r="st" aria-label="State"><option value="">All states</option>${states.map((x) => `<option ${R.f.st === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <select data-r="stage" aria-label="Stage"><option value="">All stages</option>${stages.map((x) => `<option ${R.f.stage === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <input data-r="q" value="${esc(R.f.q)}" placeholder="🔎 code or city" aria-label="Search"><label>min <input type="number" data-r="min" value="${R.f.min || ''}" min="0" aria-label="Minimum days"> d</label>
    <details class="rp-cols"><summary>☰ Columns</summary>${all.map((c) => `<label><input type="checkbox" data-r="col" data-k="${c[0]}" ${C.includes(c) ? 'checked' : ''}>${esc(c[1])}</label>`).join('')}</details>
    <input data-r="name" value="${esc(R.name)}" placeholder="Report name" maxlength="40" aria-label="Report name"><button class="pf-btn sm pri" data-r="save">💾 Save</button><button class="pf-btn sm" data-r="csv">⬇ CSV</button></div>
   <div class="rp-n" id="rpN"><b>${D.length}</b> rows · ${esc(SRC[R.src].n)} · active set: ${esc(LX.active().name)} · 🧪 fake data</div>
   <div class="rp-t"><table><thead><tr>${C.map((c) => `<th><button data-r="sort" data-k="${c[0]}">${esc(c[1])}${R.sort === c[0] ? (R.desc ? ' ▼' : ' ▲') : ''}</button></th>`).join('')}</tr></thead>
   <tbody>${D.slice(0, 200).map((r) => `<tr ${r.code ? `data-r="site" data-k="${r.code}"` : ''}>${C.map((c) => `<td class="${c[2] ? 'n' : ''}">${esc(r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table>${D.length > 200 ? `<p class="rp-more">first 200 of ${D.length} shown · ⬇ CSV has all</p>` : ''}</div></div>`; }
export function act(a, b) { const k = b.dataset.k, i = +b.dataset.i;
  if (a === 'src') { R.src = k; R.cols = null; R.sort = null; R.desc = true; R.name = ''; }
  else if (a === 'sort') { if (R.sort === k) R.desc = !R.desc; else { R.sort = k; R.desc = true; } }
  else if (a === 'save') { const name = (R.name || SRC[R.src].n + ' · ' + (R.f.st || 'all')).slice(0, 40); R.name = name; const L = savedList(), o = { name, src: R.src, f: { ...R.f }, cols: R.cols, sort: R.sort, desc: R.desc }; const j = L.findIndex((x) => x.name === name); if (j >= 0) L[j] = o; else L.push(o); persist(); if (PV().toast) PV().toast('💾 Saved report: ' + name); }
  else if (a === 'open') { const o = savedList()[i]; if (o) Object.assign(R, { src: o.src, f: { st: '', stage: '', q: '', min: 0, ...o.f }, cols: o.cols, sort: o.sort, desc: o.desc, name: o.name }); }
  else if (a === 'delSaved') { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sure?'; return false; } savedList().splice(i, 1); persist(); R.name = ''; }
  else if (a === 'csv') { const C = colsOf(); download(`coffee-opening-report-${R.src}.csv`, csv(C.map((c) => c[1]), rows().map((r) => C.map((c) => r[c[0]]))), 'text/csv'); return false; }
  else if (a === 'site') { PV().openSite(k, true); return false; }
  else if (a === 'simRun') { R.sim = simulate(R.simA, R.simB); }
  else if (a === 'pitch') { const t = pitchText(R.sim); try { navigator.clipboard.writeText(t); } catch (e) { /* no clipboard */ } if (PV().toast) PV().toast('📋 Pitch summary copied'); return false; }
  return true; }
export function edit(t) { const r = t.dataset.r;
  if (r === 'col') { const all = SRC[R.src].cols.map((c) => c[0]); const cur = new Set(R.cols || all); if (t.checked) cur.add(t.dataset.k); else if (cur.size > 1) cur.delete(t.dataset.k); else t.checked = true; R.cols = all.filter((c) => cur.has(c)); return 'full'; }
  if (r === 'name') { R.name = t.value; return null; }
  if (r === 'simA' || r === 'simB') { R[r] = t.value; R.sim = null; return 'full'; }
  if (r in R.f) { R.f[r] = r === 'min' ? Math.max(0, +t.value || 0) : t.value; return r === 'q' || r === 'min' ? 'rows' : 'full'; }
  return null; }
// ---------- ▶ simulate: run every one of the 1,900 sites through set A and set B with the same seeds
function simSet(set, S) { const P = LX.plan(set), I = LX.instances(set), load = {}, ST = STG();
  for (const w of I) for (const s of w.steps) if (!s.usuallyCanceled) load[s.role] = (load[s.role] || 0) + 1;
  for (const k in load) load[k] = Math.max(0, load[k] - 2) * 1.2;   // a role on many chains queues: duplicated chains cost waiting time
  const stage = ST.map(() => 0), role = {}, roleN = {}; let open = 0, appr = 0, touch = 0, rework = 0, escl = 0, canceled = 0;
  const spans = ST.map((_, i) => { const t = P.tasks.filter((x) => x.stage === i); return t.length ? Math.max(...t.map((x) => x.end)) - Math.min(...t.map((x) => x.off)) : 0; });
  for (const s of S) { let gateX = 0; const base = hash(s.code);
    I.forEach((w, n) => { const rnd = LX.seeded((base + n * 131 + hash(w.id)) >>> 0), Rr = LX.runChain(w, 0, rnd, load), t = P.byId.get(w.start[0]); appr += Rr.days; rework += Rr.rework;
      for (const k of Rr.steps) { if (k.status === 'Canceled') { canceled++; continue; } if (k.status === 'Rejected') continue; touch++; const d = k.end - k.start; role[k.s.role] = (role[k.s.role] || 0) + d; roleN[k.s.role] = (roleN[k.s.role] || 0) + 1; if (k.esc) escl++; if (k.s.usuallyCanceled) rework++; }
      const x = Math.max(0, Rr.days - LX.nominal(w)) + (w.ms && w.ms.gate ? Math.max(0, Rr.days - 7) : 0) * 0.5; if (w.ms && w.ms.gate) gateX += x; if (t) stage[t.stage] += x; });
    open += P.total + gateX; }
  const n = S.length || 1; return { name: set.name, n: S.length, open: r1(open / n), appr: r1(appr / n), touch: r1(touch / n), rework: r1(rework / n), escl: r1(escl / n), canceled: r1(canceled / n), chains: set.workflows.length, steps: I.reduce((a, w) => a + w.steps.length, 0),
    stage: spans.map((sp, i) => r1(sp + stage[i] / n)), role: Object.fromEntries(Object.keys(role).map((k) => [k, { days: r1(role[k] / n), avg: r1(role[k] / roleN[k]) }])) }; }
export function simulate(a, b) { const t0 = performance.now(), S = PV().PF.sites, A = LX.getSet(a), B = LX.getSet(b); if (!A || !B) return null; const out = { A: simSet(A, S), B: simSet(B, S) }; out.ms = Math.round(performance.now() - t0); return out; }
const pct = (a, b) => (a ? Math.round((b - a) / a * 100) : 0);
export function pitchText(m) { if (!m) return ''; const { A, B } = m, ex = ['coo', 'cfo', 'pres', 'svp', 'mp'], exA = ex.reduce((x, k) => x + (A.role[k] ? A.role[k].days : 0), 0), exB = ex.reduce((x, k) => x + (B.role[k] ? B.role[k].days : 0), 0);
  return `Simulated on ${A.n.toLocaleString()} sites (🧪 fake data): moving from "${A.name}" to "${B.name}" opens a shop ${r1(A.open - B.open)} days sooner (${A.open} → ${B.open} days, ${pct(A.open, B.open)}%). Approval time per site falls from ${A.appr} to ${B.appr} days, approval touches from ${A.touch} to ${B.touch}, and exec review time from ${r1(exA)} to ${r1(exB)} days per site. Workflow templates: ${A.chains} → ${B.chains}.`; }
function bars(rowsD, max, fmt = (v) => v) { return rowsD.map(([lab, a, b]) => `<div class="sm-r"><span>${esc(lab)}</span><div class="sm-b"><i class="a" style="width:${(a / max) * 100}%"></i><i class="b" style="width:${(b / max) * 100}%"></i></div><small>${fmt(a)} → <b>${fmt(b)}</b></small></div>`).join(''); }
function chart(m) { const ST = STG(), W = 640, H = 220, n = ST.length, bw = (W - 40) / n, mx = Math.max(1, ...m.A.stage, ...m.B.stage);
  let g = `<svg viewBox="0 0 ${W} ${H + 40}" class="sm-chart" role="img" aria-label="Days per opening stage, before vs after"><line x1="30" y1="${H}" x2="${W}" y2="${H}" stroke="#9aa7bd"/>`;
  ST.forEach((x, i) => { const a = m.A.stage[i], b = m.B.stage[i], X = 34 + i * bw, ha = (a / mx) * (H - 20), hb = (b / mx) * (H - 20);
    g += `<rect class="ba" x="${X}" y="${H - ha}" width="${bw * 0.38}" height="${ha}" rx="3" fill="#9aa7bd"><title>${esc(x.short || x.name)} before: ${a} d</title></rect><rect class="bb" x="${X + bw * 0.4}" y="${H - hb}" width="${bw * 0.38}" height="${hb}" rx="3" fill="#1f9d63"><title>${esc(x.short || x.name)} after: ${b} d</title></rect><text x="${X + bw * 0.39}" y="${H + 16}" font-size="14" text-anchor="middle">${x.icon}</text><text x="${X + bw * 0.39}" y="${H + 32}" font-size="9" text-anchor="middle" fill="#5d6b85">${esc(String(x.short || x.name).slice(0, 9))}</text>`; });
  return g + `<text x="34" y="12" font-size="11" fill="#5d6b85" font-weight="700">days per opening stage · <tspan fill="#9aa7bd">■ before</tspan> <tspan fill="#1f9d63">■ after</tspan></text></svg>`; }
export function simView() { const S = LX.sets(), m = R.sim, sel = (k) => `<select data-r="${k}" aria-label="${k === 'simA' ? 'Old set' : 'New set'}">${S.map((s) => `<option value="${esc(s.id)}" ${R[k] === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
  let h = `<div class="sm"><div class="sm-top"><b>▶ Simulate</b> old ${sel('simA')} vs new ${sel('simB')} across all ${PV().PF.sites.length.toLocaleString()} sites <button class="pf-btn sm pri" data-r="simRun">▶ Simulate</button>${m ? `<small>${m.ms} ms</small>` : ''}</div>`;
  if (!m) return h + '<p class="dz-note">Runs every site through both template sets with the same random seeds: cycle time by stage, approval bottlenecks by role, and a pitch-ready summary. 🧪 Fake data.</p></div>';
  const { A, B } = m, rl = [...new Set([...Object.keys(A.role), ...Object.keys(B.role)])].map((k) => [RN(k), A.role[k] ? A.role[k].days : 0, B.role[k] ? B.role[k].days : 0]).sort((x, y) => y[1] - x[1]), rmx = Math.max(1, ...rl.map((x) => Math.max(x[1], x[2])));
  h += `<div class="sm-card" id="smCard"><div class="sm-big"><b>${r1(A.open - B.open)}</b><span>days sooner to open</span><small>${A.open} → ${B.open} days · ${pct(A.open, B.open)}%</small></div>
    <div class="sm-k"><div><b>${A.appr} → ${B.appr}</b><span>approval days / site</span></div><div><b>${A.touch} → ${B.touch}</b><span>approval touches / site</span></div><div><b>${A.chains} → ${B.chains}</b><span>workflow templates</span></div><div><b>${A.canceled} → ${B.canceled}</b><span>canceled steps / site</span></div><div><b>${A.rework} → ${B.rework}</b><span>rework / re-review runs / site</span></div><div><b>${A.steps} → ${B.steps}</b><span>template steps to maintain</span></div></div>
    <p class="sm-p">${esc(pitchText(m))}</p><button class="pf-btn sm" data-r="pitch">📋 Copy pitch</button></div>
   <h4>⏱ Cycle time by stage (before vs after)</h4>${chart(m)}
   <h4>⏳ Bottlenecks by role: days per site in that role's hands</h4><div class="sm-roles">${bars(rl, rmx)}</div></div>`;
  return h; }
// ---------- export / import
export function exportJSON() { return JSON.stringify({ app: 'coffee-opening', kind: 'lx-templates', v: 7, note: 'Fake/demo templates only', active: LX.activeId(), sets: LX.sets() }, null, 1); }
export function stepsCSV() { const out = []; for (const set of LX.sets()) for (const w of set.workflows) w.steps.forEach((s, i) => out.push([set.name, w.name, w.params ? w.params.map((p) => p[0]).join('|') : w.param || '', i + 1, s.id, s.name, s.type, RN(s.role), s.sla, s.esc, s.group || '', s.onReject || '', s.usuallyCanceled ? 'yes' : '']));
  return csv(['Set', 'Workflow', 'Stage params', 'Order', 'Step id', 'Step', 'Type', 'Role', 'SLA days', 'Escalate after days', 'Parallel group', 'If rejected go back to', 'Usually canceled'], out); }
export function importJSON(text) { let o; try { o = JSON.parse(text); } catch (e) { return { ok: false, msg: 'Not valid JSON' }; }
  const list = Array.isArray(o) ? o : o && Array.isArray(o.sets) ? o.sets : o && Array.isArray(o.workflows) ? [o] : null; if (!list || !list.length) return { ok: false, msg: 'No template sets in that file' };
  const S = LX.sets(); let n = 0; for (const raw of list.slice(0, 20)) { const c = LX.clean(raw); if (!c.workflows.length && !c.schedule.length) continue; if (!c.schedule.length) c.schedule = JSON.parse(JSON.stringify(LX.active().schedule));
    let id = c.id, k = 2; while (S.some((x) => x.id === id)) id = c.id + '-' + k++; c.id = id; if (S.some((x) => x.name === c.name)) c.name = (c.name + ' (imported)').slice(0, 60); S.push(c); n++; }
  if (!n) return { ok: false, msg: 'No usable template sets' }; LX.save(); return { ok: true, n, id: S[S.length - 1].id, msg: `Imported ${n} set${n > 1 ? 's' : ''}` }; }
