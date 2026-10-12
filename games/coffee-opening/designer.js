// Coffee Opening v7 · 🛠 Workflow Designer (admin mode). Edits the ONE template model in lx-model.js; the 1,900 🧪 sites render through the active set.
// Reorder with ▲▼ buttons (no free dragging). Every edit saves and redraws the live flow diagram.
import * as LX from './lx-model.js?v=7';
import * as RP from './reports.js?v=7';
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const D = { set: null, tab: 'wf', wf: null, renaming: null, site: '', host: null };
const STG = () => (window.CO ? window.CO.STAGES : Array.from({ length: 11 }, (_, i) => ({ icon: '•', short: 'Stage ' + (i + 1) })));
const opts = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(n)}</option>`).join('');
const uid = (p, list) => { let i = list.length + 1; while (list.some((x) => x.id === p + i)) i++; return p + i; };
function cur() { LX.sets(); if (!D.set || !LX.getSet(D.set)) D.set = LX.activeId(); return LX.getSet(D.set); }
function curWf(set) { if (!set.workflows.some((w) => w.id === D.wf)) D.wf = set.workflows[0] ? set.workflows[0].id : null; return set.workflows.find((w) => w.id === D.wf); }
export function render(host) { D.host = host || D.host; const el = D.host; if (!el) return; const set = cur(), act = LX.activeId() === set.id;
  el.innerHTML = `<div class="dz" data-dz>
   <div class="dz-top"><b class="dz-h">🛠 Workflow Designer</b><select data-d="pickSet" aria-label="Template set">${LX.sets().map((s) => `<option value="${esc(s.id)}" ${s.id === set.id ? 'selected' : ''}>${esc(s.name)}${s.id === LX.activeId() ? ' ●' : ''}</option>`).join('')}</select>
    ${D.renaming === 'set' ? `<input data-d="setName" value="${esc(set.name)}" maxlength="60" aria-label="Set name"><button class="pf-btn sm" data-d="renameDone">✔</button>` : `<button class="pf-btn sm" data-d="renameSet" aria-label="Rename set">✏️</button>`}
    <button class="pf-btn sm" data-d="dupSet" aria-label="Duplicate set">📑 Duplicate</button><button class="pf-btn sm" data-d="delSet" aria-label="Delete set" ${LX.sets().length < 2 ? 'disabled' : ''}>🗑</button>
    ${act ? '<span class="dz-live">● Live for the 1,900 sites</span>' : `<button class="pf-btn sm pri" data-d="useSet">● Use for the 1,900 sites</button>`}<button class="pf-btn sm" data-d="reset" aria-label="Reset to presets">↺ Presets</button>
    <span class="dz-io"><button class="pf-btn sm" data-d="export" aria-label="Export templates as JSON">⬇ JSON</button><button class="pf-btn sm" data-d="csv" aria-label="Export steps as CSV">⬇ Steps CSV</button><label class="pf-btn sm dz-imp">⬆ Import<input type="file" accept=".json,application/json" data-d2="file" aria-label="Import templates JSON"></label></span></div>
   <nav class="dz-tabs">${[['wf', '✅', 'Workflows'], ['ms', '🏁', 'Milestones'], ['sch', '📅', 'Schedule'], ['rep', '📊', 'Reports'], ['sim', '▶', 'Simulate']].map(([k, i, n]) => `<button data-d="tab" data-k="${k}" class="${D.tab === k ? 'on' : ''}">${i} ${n}</button>`).join('')}</nav>
   <div class="dz-body">${D.tab === 'ms' ? msView(set) : D.tab === 'sch' ? schView(set) : D.tab === 'rep' ? RP.reportView() : D.tab === 'sim' ? RP.simView() : wfView(set)}</div></div>`;
  bind(el); }
// ---------- workflows
function wfView(set) { const w = curWf(set), P = LX.plan(set);
  const list = `<div class="dz-list">${set.workflows.map((x) => `<button data-d="pickWf" data-k="${esc(x.id)}" class="${x === w ? 'on' : ''}"><b>${esc(x.icon)} ${esc(x.name)}</b><small>${x.steps.length} steps · ~${LX.nominal(x)} d${x.params ? ` · ×${x.params.length}` : ''}</small></button>`).join('')}
   <div class="dz-lb"><button class="pf-btn sm" data-d="newWf">➕ New</button>${w ? `<button class="pf-btn sm" data-d="dupWf">📑</button><button class="pf-btn sm" data-d="delWf" aria-label="Delete workflow">🗑</button>` : ''}</div></div>`;
  if (!w) return `<div class="dz-wf">${list}<p class="muted">No workflows yet. ➕ New</p></div>`;
  const taskOpt = (v) => P.tasks.map((t) => `<option value="${esc(t.id)}" ${t.id === v ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const steps = w.steps.map((s, i) => `<div class="dz-step" data-i="${i}"><span class="dz-mv"><button data-d="up" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button data-d="down" data-i="${i}" ${i < w.steps.length - 1 ? '' : 'disabled'} aria-label="Move down">▼</button></span>
    <input data-f="name" data-i="${i}" value="${esc(s.name)}" maxlength="60" aria-label="Step name"><select data-f="type" data-i="${i}" aria-label="Type">${opts(LX.TYPES, s.type)}</select><select data-f="role" data-i="${i}" aria-label="Role">${opts(LX.ROLES, s.role)}</select>
    <label>⏱<input type="number" data-f="sla" data-i="${i}" value="${s.sla}" min="1" max="365" aria-label="SLA days">d</label><label>⏫<input type="number" data-f="esc" data-i="${i}" value="${s.esc}" min="1" max="365" aria-label="Escalate after days">d</label>
    <label>⇉<input data-f="group" data-i="${i}" value="${esc(s.group || '')}" maxlength="12" placeholder="—" aria-label="Parallel group"></label>
    <select data-f="onReject" data-i="${i}" aria-label="If rejected go back to"><option value="">no loop</option>${w.steps.slice(0, i).map((t) => `<option value="${esc(t.id)}" ${s.onReject === t.id ? 'selected' : ''}>↩ ${esc(t.name)}</option>`).join('')}</select>
    <label class="ck"><input type="checkbox" data-f="usuallyCanceled" data-i="${i}" ${s.usuallyCanceled ? 'checked' : ''}>usually canceled</label><button data-d="delStep" data-i="${i}" aria-label="Delete step">🗑</button></div>`).join('');
  const start = w.params ? `<div class="dz-params">${w.params.map((p, j) => `<span>📌 <input data-pf="${j}" data-pk="0" value="${esc(p[0])}" maxlength="30" aria-label="Param"> starts at <select data-pf="${j}" data-pk="1">${taskOpt(p[1])}</select> ${p[2] >= 0 ? '+' : ''}<input type="number" data-pf="${j}" data-pk="2" value="${p[2]}" aria-label="Lag days">d <button data-d="delParam" data-i="${j}" aria-label="Delete param">✕</button></span>`).join('')}<button class="pf-btn sm" data-d="addParam">➕ Param</button></div>`
    : `<div class="dz-params"><span>▶ starts at <select data-w="start0">${taskOpt(w.start[0])}</select> <input type="number" data-w="start1" value="${w.start[1]}" aria-label="Lag days">d</span><button class="pf-btn sm" data-d="toParams">➕ Stage param</button></div>`;
  return `<div class="dz-wf">${list}<div class="dz-ed">
   <div class="dz-wh">${D.renaming === 'wf' ? `<input data-w="name" value="${esc(w.name)}" maxlength="60" aria-label="Workflow name"><button class="pf-btn sm" data-d="renameDone">✔</button>` : `<b>${esc(w.icon)} ${esc(w.name)}</b><button class="pf-btn sm" data-d="renameWf" aria-label="Rename workflow">✏️</button>`}
    <span class="dz-nom" id="dzNom">⏱ ~${LX.nominal(w)} days nominal${w.params ? ` × ${w.params.length} runs` : ''}</span></div>${start}
   <div class="dz-ms">🏁 Milestone when it closes: <input data-w="ms" value="${esc(w.ms ? w.ms.name : '')}" maxlength="60" placeholder="none" aria-label="Milestone name"> <label class="ck"><input type="checkbox" data-w="gate" ${w.ms && w.ms.gate ? 'checked' : ''}>gate</label></div>
   <div class="dz-flow" id="dzFlow">${flow(w)}</div>
   <div class="dz-steps">${steps}</div><button class="pf-btn sm" data-d="addStep">➕ Step</button></div></div>`; }
// live SVG flow: lanes left→right, parallel groups stacked, rework loops curve back in red
export function flow(w) { const L = LX.lanes(w), CW = 156, NH = 54, GAP = 10, maxN = Math.max(1, ...L.map((l) => l.steps.length)), H = maxN * (NH + GAP) + 64, W = L.length * CW + 30, pos = {};
  const ic = { task: '🔧', approval: '✅', notify: '🔔' }; let svg = '';
  L.forEach((l, i) => { const x = 14 + i * CW, n = l.steps.length, y0 = (H - 40 - n * (NH + GAP)) / 2 + 8;
    if (n > 1) svg += `<rect x="${x - 6}" y="${y0 - 8}" width="${CW - 22}" height="${n * (NH + GAP) + 6}" rx="12" fill="none" stroke="#7cc4f0" stroke-dasharray="5 4"/><text x="${x + 2}" y="${y0 - 11}" font-size="9" fill="#1f5fd1" font-weight="800">⇉ ${esc(l.group)} · parallel</text>`;
    l.steps.forEach((s, j) => { const y = y0 + j * (NH + GAP); pos[s.id] = { x, y, lane: i }; const cx = s.usuallyCanceled;
      svg += `<g class="node" data-node="${esc(s.id)}"><rect x="${x}" y="${y}" width="${CW - 34}" height="${NH}" rx="10" fill="${cx ? '#f1f3f7' : s.type === 'approval' ? '#e3f6eb' : s.type === 'notify' ? '#fff4d6' : '#e6efff'}" stroke="${cx ? '#9aa7bd' : '#16295a'}" ${cx ? 'stroke-dasharray="4 3"' : ''}/>
       <text x="${x + 8}" y="${y + 17}" font-size="11" font-weight="800" fill="#12203f">${ic[s.type]} ${esc(s.name.length > 16 ? s.name.slice(0, 15) + '…' : s.name)}<title>${esc(s.name)}</title></text><text x="${x + 8}" y="${y + 32}" font-size="9.5" fill="#5d6b85">${esc(LX.ROLES[s.role].slice(0, 22))}</text>
       <text x="${x + 8}" y="${y + 46}" font-size="9.5" fill="${cx ? '#9aa7bd' : '#1f5fd1'}">${cx ? 'usually canceled' : `⏱ ${s.sla}d · ⏫ ${s.esc}d`}</text></g>`; }); });
  for (let i = 0; i + 1 < L.length; i++) { const a = 14 + i * CW + CW - 34, b = 14 + (i + 1) * CW, y = (H - 40) / 2 + 8; svg += `<path d="M${a} ${y} L${b - 4} ${y}" stroke="#16295a" stroke-width="2" marker-end="url(#ah)"/>`; }
  let loops = 0; for (const s of w.steps) if (s.onReject && pos[s.onReject] && pos[s.id]) { loops++; const p = pos[s.id], q = pos[s.onReject], x1 = p.x + (CW - 34) / 2, x2 = q.x + (CW - 34) / 2, yb = H - 22 - (loops - 1) * 8;
    svg += `<path class="loop" d="M${x1} ${p.y + NH} C ${x1} ${yb}, ${x2} ${yb}, ${x2} ${q.y + NH + 2}" fill="none" stroke="#e5484d" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#ahr)"/><text x="${(x1 + x2) / 2}" y="${yb - 2}" font-size="9.5" fill="#e5484d" text-anchor="middle" font-weight="800">↩ if rejected</text>`; }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Flow of ${esc(w.name)}"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#16295a"/></marker><marker id="ahr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#e5484d"/></marker></defs>${svg}</svg>`; }
// ---------- milestones (derived, read-only here: edit at the source)
function msView(set) { const M = LX.milestones(set);
  return `<p class="dz-note">🏁 One canonical list, <b>auto-derived</b> from the schedule tasks and workflows that complete each milestone. Edit a milestone at its source (a task in 📅 Schedule or a workflow's "milestone when it closes").</p>
   <div class="dz-mt"><div class="hd"><span>Milestone</span><span>Definition</span><span>Owner</span><span>Gate</span><span>Completed by</span><span>Baseline day</span></div>
   ${M.map((m) => `<div class="row" data-ms="${esc(m.name)}"><b>${esc(m.name)}</b><span>${esc(m.def || '—')}</span><span>${esc(LX.ROLES[m.owner] || m.owner)}</span><span>${m.gate ? '🚧 gate' : '—'}</span><button class="lnk" data-d="${m.kind === 'task' ? 'goTask' : 'goWf'}" data-k="${esc(m.ref)}">${esc(m.by)}</button><span>day ${m.day}</span></div>`).join('')}</div>`; }
// ---------- schedule template (dependencies → baseline)
function schView(set) { const P = LX.plan(set), crit = LX.critical(set), groups = [...new Set(set.schedule.map((t) => t.g))], ST = STG();
  const depTxt = (t) => t.deps.map(([d, l]) => d + (l ? (l > 0 ? '+' : '') + l : '')).join(', ');
  const rows = set.schedule.map((t, i) => { const p = P.byId.get(t.id); return `<div class="dz-task ${crit.has(t.id) ? 'crit' : ''}" data-i="${i}" data-tid="${esc(t.id)}"><span class="dz-mv"><button data-d="tup" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button data-d="tdown" data-i="${i}" ${i < set.schedule.length - 1 ? '' : 'disabled'} aria-label="Move down">▼</button></span>
    <code>${esc(t.id)}</code><input data-t="name" data-i="${i}" value="${esc(t.name)}" maxlength="60" aria-label="Task name"><input data-t="g" data-i="${i}" value="${esc(t.g)}" maxlength="40" aria-label="Group" class="g">
    <label><input type="number" data-t="dur" data-i="${i}" value="${t.dur}" min="1" max="720" aria-label="Duration days">d</label><label>after <input data-t="deps" data-i="${i}" value="${esc(depTxt(t))}" placeholder="—" aria-label="Depends on (id+lag, comma)"></label>
    <select data-t="role" data-i="${i}" aria-label="Role">${opts(LX.ROLES, t.role)}</select><select data-t="stage" data-i="${i}" aria-label="Rolls up into stage">${ST.map((s, k) => `<option value="${k}" ${k === t.stage ? 'selected' : ''}>${s.icon} ${esc(s.short)}</option>`).join('')}</select>
    <input data-t="ms" data-i="${i}" value="${esc(t.ms ? t.ms.name : '')}" placeholder="🏁 milestone" maxlength="60" aria-label="Milestone" class="ms"><span class="dz-off">day ${p.off}–${p.end}</span><button data-d="delTask" data-i="${i}" aria-label="Delete task">🗑</button></div>`; }).join('');
  return `<div class="dz-sh"><span>📅 ${set.schedule.length} tasks · baseline <b id="dzTotal">${P.total} days</b> to open · <i class="crit-k"></i> critical path</span>${P.cycles.length ? `<span class="bad">⚠ dependency loop at ${esc(P.cycles.join(', '))} (cut)</span>` : ''}<button class="pf-btn sm" data-d="addTask">➕ Task</button></div>
   <div class="dz-tasks">${rows}</div>
   <div class="dz-apply"><b>▶ Apply to a site</b> <input data-d2="site" value="${esc(D.site)}" placeholder="Site code, e.g. ${esc(firstCode())}" maxlength="6" aria-label="Site code"> <button class="pf-btn sm pri" data-d="apply">Create baseline</button><div id="dzBase">${D.site ? baseView(set, D.site) : ''}</div></div>`; }
const firstCode = () => (window.PFV && window.PFV.PF.sites[0] ? window.PFV.PF.sites.find((s) => s.stage === 'Approved').code : 'TX3417');
const dstr = (d) => new Date(Date.UTC(2020, 0, 1) + d * 864e5).toISOString().slice(0, 10);
function baseView(set, code) { const s = window.PFV && window.PFV.PF.sites.find((x) => x.code === code.toUpperCase()); if (!s) return `<p class="bad">No site ${esc(code)}</p>`;
  const B = LX.baseline(set, s.lx.pStart), lo = B[0] ? Math.min(...B.map((t) => t.bS)) : 0, hi = Math.max(lo + 1, ...B.map((t) => t.bE)), crit = LX.critical(set);
  return `<p class="dz-note">📌 ${esc(s.code)} · ${esc(s.city)}, ${s.st}: project start ${dstr(s.lx.pStart)} → baseline open <b>${dstr(hi)}</b> (${hi - lo} days)</p><div class="dz-mini">${B.map((t) => `<div class="${crit.has(t.id) ? 'crit' : ''}"><span>${esc(t.name)}</span><i style="left:${((t.bS - lo) / (hi - lo) * 100).toFixed(1)}%;width:${Math.max(0.6, (t.bE - t.bS) / (hi - lo) * 100).toFixed(1)}%"></i><small>${dstr(t.bS).slice(5)}→${dstr(t.bE).slice(5)}</small></div>`).join('')}</div>`; }
// ---------- events
function bind(el) {
  el.onclick = (e) => { const r = e.target.closest('[data-r]'); if (r && r.tagName !== 'INPUT' && r.tagName !== 'SELECT') { e.stopPropagation(); if (RP.act(r.dataset.r, r)) keep(render); return; }
    const b = e.target.closest('[data-d]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return; e.stopPropagation(); act(b.dataset.d, b); };
  el.oninput = (e) => (e.target.dataset.r ? redit(e.target, false) : edit(e.target, false)); el.onchange = (e) => (e.target.dataset.r ? redit(e.target, true) : e.target.dataset.d2 === 'file' ? imp(e.target) : edit(e.target, true));
}
const keep = (f) => { const y = D.host.scrollTop; f(); D.host.scrollTop = y; };
// report fields: text filters refresh the table while typing (focus kept); selects/checkboxes re-render
function redit(t, commit) { if (t.tagName === 'INPUT' && t.type !== 'checkbox' && commit) return; const m = RP.edit(t); if (m === 'full') keep(render);
  else if (m === 'rows') { const tmp = document.createElement('div'); tmp.innerHTML = RP.reportView(); const a = D.host.querySelector('.rp-t'), n = D.host.querySelector('#rpN'); if (a) a.replaceWith(tmp.querySelector('.rp-t')); if (n) n.replaceWith(tmp.querySelector('#rpN')); } }
function imp(inp) { const f = inp.files && inp.files[0]; if (!f) return; f.text().then((txt) => { const r = RP.importJSON(txt); if (window.PFV && PFV.toast) PFV.toast((r.ok ? '⬆ ' : '❌ ') + r.msg); if (r.ok) { D.set = r.id; D.wf = null; D.tab = 'wf'; } render(); }); }
function act(a, b) { const set = cur(), w = curWf(set), i = +b.dataset.i;
  const mv = (arr, j, k) => { if (k < 0 || k >= arr.length) return; const [x] = arr.splice(j, 1); arr.splice(k, 0, x); };
  switch (a) {
    case 'tab': D.tab = b.dataset.k; break; case 'pickWf': D.wf = b.dataset.k; D.renaming = null; break;
    case 'newWf': { const id = uid('wf', set.workflows); set.workflows.push({ id, name: 'New workflow', icon: '📋', start: [set.schedule[0] ? set.schedule[0].id : 'tfr', 0], steps: [{ id: 's1', name: 'Prepare', type: 'task', role: 'rem', sla: 5, esc: 10 }, { id: 's2', name: 'Approve', type: 'approval', role: 'dir', sla: 3, esc: 6 }] }); D.wf = id; D.renaming = 'wf'; break; }
    case 'dupWf': if (w) { const c = JSON.parse(JSON.stringify(w)); c.id = uid(w.id + '-', set.workflows); c.name = w.name + ' (copy)'; delete c.ms; set.workflows.splice(set.workflows.indexOf(w) + 1, 0, c); D.wf = c.id; } break;
    case 'delWf': if (w) { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '🗑 Sure?'; return; } set.workflows.splice(set.workflows.indexOf(w), 1); D.wf = null; } break;
    case 'renameWf': D.renaming = 'wf'; break; case 'renameSet': D.renaming = 'set'; break; case 'renameDone': D.renaming = null; break;
    case 'up': mv(w.steps, i, i - 1); fixLoops(w); break; case 'down': mv(w.steps, i, i + 1); fixLoops(w); break;
    case 'delStep': w.steps.splice(i, 1); fixLoops(w); break;
    case 'addStep': w.steps.push({ id: uid('s', w.steps), name: 'New step', type: 'approval', role: 'dir', sla: 3, esc: 6 }); break;
    case 'toParams': w.params = [[w.param || 'Baseline', w.start[0], w.start[1]]]; delete w.start; delete w.param; break;
    case 'addParam': w.params.push(['Stage ' + (w.params.length + 1), w.params[0][1], w.params[0][2]]); break;
    case 'delParam': w.params.splice(i, 1); if (!w.params.length) { w.start = [set.schedule[0].id, 0]; delete w.params; } break;
    case 'pickSet': return;
    case 'dupSet': { const c = JSON.parse(JSON.stringify(set)); c.id = 'set' + Date.now().toString(36).slice(-5); c.name = set.name + ' (copy)'; LX.sets().push(c); D.set = c.id; D.renaming = 'set'; break; }
    case 'delSet': { if (LX.sets().length < 2) return; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '🗑 Sure?'; return; } const S = LX.sets(); S.splice(S.indexOf(set), 1); if (LX.activeId() === set.id) LX.setActive(S[0].id); D.set = null; break; }
    case 'useSet': LX.setActive(set.id); break; case 'reset': if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '↺ Sure? edits are lost'; return; } LX.resetPresets(); D.set = null; D.wf = null; break;
    case 'tup': mv(set.schedule, i, i - 1); break; case 'tdown': mv(set.schedule, i, i + 1); break;
    case 'delTask': { const t = set.schedule[i]; set.schedule.splice(i, 1); set.schedule.forEach((u) => { u.deps = u.deps.filter((d) => d[0] !== t.id); }); break; }
    case 'addTask': { const last = set.schedule[set.schedule.length - 1]; set.schedule.push({ id: uid('t', set.schedule), g: last ? last.g : 'Tasks', name: 'New task', dur: 10, deps: last ? [[last.id, 0]] : [], stage: last ? last.stage : 0, role: 'rem' }); break; }
    case 'apply': D.site = (D.host.querySelector('[data-d2="site"]') || {}).value || firstCode(); break;
    case 'goTask': D.tab = 'sch'; LX.save(); render(); { const r = D.host.querySelector(`[data-tid="${b.dataset.k}"]`); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); } } return;
    case 'export': RP.download('coffee-opening-templates.json', RP.exportJSON(), 'application/json'); return;
    case 'csv': RP.download('coffee-opening-steps.csv', RP.stepsCSV(), 'text/csv'); return;
    case 'goWf': D.tab = 'wf'; D.wf = b.dataset.k; break;
    default: return; }
  LX.save(); render(); }
function fixLoops(w) { w.steps.forEach((s, i) => { if (s.onReject && !w.steps.slice(0, i).some((t) => t.id === s.onReject)) delete s.onReject; }); }
// field edits: text fields update the model + the live diagram while typing; selects/checkboxes re-render
function edit(t, commit) { const set = cur(), w = curWf(set), i = +t.dataset.i; let full = commit && (t.tagName === 'SELECT' || t.type === 'checkbox'); // text/number: no re-render on blur, so the next tap lands
  if (t.dataset.d === 'pickSet') { if (commit) { D.set = t.value; D.wf = null; render(); } return; }
  if (t.dataset.d === 'setName') { set.name = t.value.slice(0, 60) || 'Set'; }
  else if (t.dataset.f && w) { const s = w.steps[i]; const f = t.dataset.f;
    if (f === 'sla' || f === 'esc') { const v = Math.max(1, Math.min(365, Math.round(+t.value) || 1)); s[f] = v; }
    else if (f === 'usuallyCanceled') { if (t.checked) s.usuallyCanceled = true; else delete s.usuallyCanceled; full = true; }
    else if (f === 'group' || f === 'onReject') { const v = t.value.replace(/[^\w-]/g, '').slice(0, 12); if (v) s[f] = v; else delete s[f]; }
    else s[f] = f === 'name' ? t.value.slice(0, 60) : t.value; }
  else if (t.dataset.w && w) { const k = t.dataset.w; if (k === 'name') w.name = t.value.slice(0, 60); else if (k === 'start0') w.start[0] = t.value; else if (k === 'start1') w.start[1] = Math.round(+t.value) || 0;
    else if (k === 'ms') { if (t.value.trim()) w.ms = Object.assign(w.ms || { def: '', gate: false }, { name: t.value.slice(0, 60) }); else delete w.ms; } else if (k === 'gate' && w.ms) w.ms.gate = t.checked; }
  else if (t.dataset.pf != null && w && w.params) { const p = w.params[+t.dataset.pf], k = +t.dataset.pk; p[k] = k === 2 ? Math.round(+t.value) || 0 : t.value; }
  else if (t.dataset.t) { const x = set.schedule[i], k = t.dataset.t;
    if (k === 'dur') x.dur = Math.max(1, Math.min(720, Math.round(+t.value) || 1)); else if (k === 'stage') x.stage = +t.value; else if (k === 'deps') { if (!commit) return; x.deps = t.value.split(',').map((v) => v.trim()).filter(Boolean).map((v) => { const m = v.match(/^([\w-]+)\s*([+-]\s*\d+)?$/); return m ? [m[1], m[2] ? parseInt(m[2].replace(/\s/g, ''), 10) : 0] : null; }).filter((d) => d && d[0] !== x.id && set.schedule.some((u) => u.id === d[0])); full = true; }
    else if (k === 'ms') { if (t.value.trim()) x.ms = Object.assign(x.ms || { def: '', gate: false, at: 'end' }, { name: t.value.slice(0, 60) }); else delete x.ms; }
    else x[k] = t.value; }
  else if (t.dataset.d2 === 'site') { D.site = t.value.trim().toUpperCase(); if (commit) { LX.save(); render(); } return; }
  else return;
  LX.save();
  if (full) { const y = D.host.scrollTop; render(); D.host.scrollTop = y; return; }
  // live: redraw only the diagram + derived numbers so typing keeps focus
  const f = D.host.querySelector('#dzFlow'); if (f && w) f.innerHTML = flow(w); const n = D.host.querySelector('#dzNom'); if (n && w) n.textContent = `⏱ ~${LX.nominal(w)} days nominal${w.params ? ` × ${w.params.length} runs` : ''}`;
  if (w) { const sm = D.host.querySelector(`.dz-list [data-k="${w.id}"] small`); if (sm) sm.textContent = `${w.steps.length} steps · ~${LX.nominal(w)} d${w.params ? ` · ×${w.params.length}` : ''}`; }
  const tot = D.host.querySelector('#dzTotal'); if (tot) { const P = LX.plan(set), cr = new Set(LX.critical(set)); tot.textContent = P.total + ' days';
    D.host.querySelectorAll('.dz-task').forEach((r) => { const q = P.byId.get(r.dataset.tid); if (q) r.querySelector('.dz-off').textContent = `day ${q.off}–${q.end}`; r.classList.toggle('crit', cr.has(r.dataset.tid)); }); } }
window.DZ = { D, render, flow, LX, RP };
