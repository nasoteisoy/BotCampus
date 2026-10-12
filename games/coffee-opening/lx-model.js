// Coffee Opening v7 · 🛠 LX template model: ONE model for workflows, milestones and schedules.
// The 🇺🇸 portfolio renders every site's workflows + schedule through the ACTIVE set (default 'As-is (current LX)'); the designer edits the same objects.
// Sets live in localStorage 'coffee-opening-lx' (separate from the shop save). 🧪 fake roles only, no people.
export const ROLES = { rem: 'Real Estate Manager', pdm: 'Pre-Dev Manager', cm: 'Construction Manager', cred: 'CRED Coordinator', dir: 'Director', coo: 'COO', cfo: 'CFO', pres: 'President of Ops', svp: 'SVP Field Ops', mp: 'Market Planning', legal: 'Legal', arch: 'Architect', gc: 'General contractor', ops: 'Ops · business coach' };
export const TYPES = { task: '🔧 Task', approval: '✅ Approval', notify: '🔔 Notify' };
export const STORE = 'coffee-opening-lx';
const st = (id, name, type, role, sla, esc, x = {}) => Object.assign({ id, name, type, role, sla, esc }, x);
const tk = (id, g, name, dur, deps, stage, role, x = {}) => Object.assign({ id, g, name, dur, deps, stage, role }, x);
// As-is schedule (24 tasks, dependency-driven; FS + lag days). Its computed offsets reproduce the v6 baseline exactly.
const SCHED = () => [
  tk('tfr', '🏠 Real estate', 'Test fit requested', 12, [], 0, 'rem'), tk('tfa', '🏠 Real estate', 'Test fit approved', 10, [['tfr', 0]], 0, 'rem'),
  tk('loi', '🏠 Real estate', 'LOI signed', 14, [['tfa', 0]], 1, 'rem', { ms: { name: 'LOI signed', def: 'Letter of intent signed by both parties', gate: false, at: 'end' } }),
  tk('ea', '🏠 Real estate', 'Early access', 20, [['loi', 0]], 1, 'rem'), tk('sir', '🔬 Site investigation', 'SIR (site investigation report)', 30, [['tfa', 18]], 2, 'pdm'),
  tk('recm', '🏠 Real estate', 'RE committee', 15, [['sir', 10]], 3, 'rem'),
  tk('lease', '🏠 Real estate', 'Lease / PSA executed', 30, [['recm', 0]], 4, 'rem', { ms: { name: 'RE contract executed', def: 'Lease or PSA fully executed', gate: true, at: 'end' } }),
  tk('preapp', '🏛 Planning', 'Pre-app meeting', 14, [['recm', 5]], 4, 'pdm'),
  tk('submit', '🏛 Planning', 'Submit application', 10, [['preapp', 0]], 4, 'pdm', { ms: { name: 'In planning review', def: 'Planning application submitted and accepted', gate: false, at: 'end' } }),
  tk('hearing', '🏛 Planning', 'Planning hearing', 45, [['submit', 0]], 4, 'pdm'), tk('coa', '🏛 Planning', 'COA received', 12, [['hearing', 0]], 4, 'pdm'),
  tk('dd', '📜 GL lease deadlines', 'Due diligence period', 60, [['recm', 0]], 4, 'rem'), tk('tpl', '📜 GL lease deadlines', 'Tenant plans to landlord', 20, [['lease', 15]], 4, 'arch'),
  tk('pac', '📜 GL lease deadlines', 'Permit & approvals contingency', 45, [['tpl', 0]], 4, 'pdm'),
  tk('cdk', '📐 Design', 'CD kick-off', 10, [['preapp', 36]], 4, 'arch'), tk('cds', '📐 Design', 'Construction documents', 40, [['cdk', 0]], 4, 'arch'), tk('bid', '📐 Design', 'Bid & award GC', 20, [['cds', 0]], 4, 'cm'),
  tk('pa', '🧾 Permits', 'Permits applied', 10, [['cds', 5]], 4, 'pdm', { ms: { name: 'Permits applied', def: 'Building permit application submitted', gate: false, at: 'end' } }),
  tk('pi', '🧾 Permits', 'Permits issued', 40, [['pa', 0]], 4, 'pdm'),
  tk('sw', '🏗 Construction', 'Site work', 35, [['pi', 0]], 5, 'cm', { ms: { name: 'Under construction', def: 'Contractor mobilized on site', gate: true, at: 'start' } }),
  tk('bld', '🏗 Construction', 'Building set + finish', 50, [['sw', 0]], 5, 'gc'), tk('eqh', '☕ Turnover', 'Equipment & hiring', 40, [['bld', 0]], 6, 'ops'),
  tk('tov', '☕ Turnover', 'Turnover to Ops', 10, [['eqh', 0]], 8, 'cm', { ms: { name: 'Turnover to Ops', def: 'Keys handed to Ops, punch list under 10 items', gate: true, at: 'end' } }),
  tk('open', '🎉 Open', 'Soft + grand open', 14, [['tov', 0]], 9, 'ops', { ms: { name: 'Open', def: 'First paying customer at the window', gate: false, at: 'end' } })];
const BUDGET_ASIS = (id, param, startTask, lag) => ({ id, name: `Budget Approval · ${param}`, icon: '💰', param, start: [startTask, lag], steps: [st('prep', 'Prepare', 'task', 'pdm', 5, 10), st('drev', 'Director review', 'approval', 'dir', 5, 10),
  st('rw', 'Rework', 'task', 'pdm', 5, 10, { usuallyCanceled: true }), st('remr', 'REM review', 'approval', 'rem', 5, 10), st('rrev', 'Re-review', 'approval', 'dir', 5, 10, { usuallyCanceled: true }), st('appr', 'Approve', 'approval', 'cfo', 5, 10)] });
export function presets() {
  const asis = { id: 'asis', name: 'As-is (current LX)', locked: false, workflows: [
    { id: 'rec', name: 'REC Approval', icon: '🗳', start: ['recm', -5], ms: { name: 'RE Committee approved', def: 'All REC approvers signed', gate: true }, steps: [st('pkg', 'REC package', 'task', 'rem', 5, 10), st('coo', 'COO approval', 'approval', 'coo', 5, 10), st('cfo', 'CFO approval', 'approval', 'cfo', 5, 10), st('pres', 'President of Ops approval', 'approval', 'pres', 5, 10), st('svp', 'SVP Field Ops approval', 'approval', 'svp', 5, 10), st('mp', 'Market Planning approval', 'approval', 'mp', 5, 10), st('close', 'Close-out', 'notify', 'cred', 2, 5)] },
    BUDGET_ASIS('bud-base', 'Baseline', 'sir', 5), BUDGET_ASIS('bud-rec', 'REC', 'recm', -12), BUDGET_ASIS('bud-com', 'Committed', 'bid', 10),
    { id: 'gc', name: 'GC Agreement', icon: '🤝', start: ['bid', 5], steps: [st('draft', 'Draft agreement', 'task', 'cm', 7, 14), st('legal', 'Legal review', 'approval', 'legal', 10, 20), st('gcsig', 'GC signature', 'task', 'gc', 5, 10), st('csig', 'Countersign', 'approval', 'dir', 5, 10)] },
    { id: 'roc', name: 'Release of Contingencies', icon: '🔓', start: ['pi', -40], steps: [st('setup', 'Set up', 'task', 'cred', 10, 20), st('cso', 'Construction sign-off', 'approval', 'cm', 30, 45), st('lso', 'Legal sign-off', 'approval', 'legal', 45, 60), st('fin', 'Final approval', 'approval', 'cfo', 20, 30)] },
    { id: 'mem', name: 'Assign Project Members', icon: '👥', start: ['tfr', 20], steps: [st('assign', 'Assign team', 'task', 'cred', 5, 10), st('confirm', 'Confirm roles', 'approval', 'rem', 3, 7)] }], schedule: SCHED() };
  const prop = { id: 'proposed', name: 'Proposed', locked: false, workflows: [
    { id: 'rec', name: 'REC Approval', icon: '🗳', start: ['recm', -5], ms: { name: 'RE Committee approved', def: 'All REC approvers signed (in parallel)', gate: true }, steps: [st('pkg', 'REC package', 'task', 'rem', 5, 8), st('coo', 'COO approval', 'approval', 'coo', 3, 5, { group: 'exec' }), st('cfo', 'CFO approval', 'approval', 'cfo', 3, 5, { group: 'exec' }), st('pres', 'President of Ops approval', 'approval', 'pres', 3, 5, { group: 'exec' }), st('svp', 'SVP Field Ops approval', 'approval', 'svp', 3, 5, { group: 'exec' }), st('mp', 'Market Planning approval', 'approval', 'mp', 3, 5, { group: 'exec', onReject: 'pkg' }), st('close', 'Close-out', 'notify', 'cred', 1, 3)] },
    { id: 'bud', name: 'Budget Approval', icon: '💰', params: [['Baseline', 'sir', 5], ['REC', 'recm', -12], ['Committed', 'bid', 10]], steps: [st('prep', 'Prepare', 'task', 'pdm', 4, 7), st('drev', 'Director review', 'approval', 'dir', 3, 5, { onReject: 'prep' }), st('appr', 'Approve', 'approval', 'cfo', 3, 5)] },
    { id: 'gc', name: 'GC Agreement', icon: '🤝', start: ['bid', 0], steps: [st('draft', 'Draft from standard form', 'task', 'cm', 4, 7), st('legal', 'Legal review', 'approval', 'legal', 5, 8, { group: 'sign', onReject: 'draft' }), st('gcsig', 'GC signature', 'task', 'gc', 5, 8, { group: 'sign' }), st('csig', 'Countersign', 'approval', 'dir', 2, 4)] },
    { id: 'roc', name: 'Release of Contingencies', icon: '🔓', start: ['pi', -20], steps: [st('setup', 'Set up', 'task', 'cred', 3, 5), st('cso', 'Construction sign-off', 'approval', 'cm', 7, 10, { group: 'so' }), st('lso', 'Legal sign-off', 'approval', 'legal', 7, 10, { group: 'so', onReject: 'setup' }), st('fin', 'Final approval', 'approval', 'cfo', 3, 5)] },
    { id: 'mem', name: 'Assign Project Members', icon: '👥', start: ['tfr', 5], steps: [st('assign', 'Assign team (auto from region)', 'task', 'cred', 2, 4)] }], schedule: SCHED() };
  // proposed schedule: planning starts in parallel with the lease, design overlaps planning
  const ps = prop.schedule, f = (id) => ps.find((t) => t.id === id);
  f('preapp').deps = [['recm', 0]]; f('cdk').deps = [['submit', 0]]; f('tpl').deps = [['lease', 0]]; f('hearing').dur = 40;
  return [asis, prop];
}
// ---- persistence
let SETS = null, ACTIVE = 'asis';
export function sets() { if (SETS) return SETS; try { const o = JSON.parse(localStorage.getItem(STORE) || 'null'); if (o && Array.isArray(o.sets) && o.sets.length) { SETS = o.sets.map(clean); ACTIVE = o.active || 'asis'; } } catch (e) { /* bad JSON → presets */ }
  if (!SETS) SETS = presets(); if (!SETS.some((s) => s.id === ACTIVE)) ACTIVE = SETS[0].id; return SETS; }
export function save() { try { localStorage.setItem(STORE, JSON.stringify({ v: 7, active: ACTIVE, sets: SETS })); } catch (e) { /* storage full */ } bump(); }
export function resetPresets() { SETS = presets(); ACTIVE = 'asis'; save(); }
export const active = () => sets().find((s) => s.id === ACTIVE) || sets()[0];
export const activeId = () => (sets(), ACTIVE);
export function setActive(id) { if (sets().some((s) => s.id === id)) { ACTIVE = id; save(); } }
export const getSet = (id) => sets().find((s) => s.id === id);
let REV = 0; const subs = new Set(); export const rev = () => REV; export const onChange = (f) => subs.add(f); function bump() { REV++; subs.forEach((f) => { try { f(); } catch (e) { /* listener */ } }); }
// ---- validation / repair (imports and old saves)
const sid = (v, d) => String(v || d).replace(/[^\w-]/g, '').slice(0, 24) || d;
export function clean(set) { const o = { id: sid(set.id, 'set-' + Math.random().toString(36).slice(2, 7)), name: String(set.name || 'Set').slice(0, 60), workflows: [], schedule: [] };
  for (const w of set.workflows || []) { const ws = { id: sid(w.id, 'wf'), name: String(w.name || 'Workflow').slice(0, 60), icon: String(w.icon || '📋').slice(0, 4), steps: [] };
    if (Array.isArray(w.params) && w.params.length) ws.params = w.params.map((p) => [String(p[0]).slice(0, 30), sid(p[1], 'tfr'), +p[2] || 0]); else { ws.start = Array.isArray(w.start) ? [sid(w.start[0], 'tfr'), +w.start[1] || 0] : ['tfr', 0]; if (w.param) ws.param = String(w.param).slice(0, 30); }
    if (w.ms) ws.ms = { name: String(w.ms.name).slice(0, 60), def: String(w.ms.def || '').slice(0, 160), gate: !!w.ms.gate };
    for (const s of w.steps || []) { const x = { id: sid(s.id, 's' + ws.steps.length), name: String(s.name || 'Step').slice(0, 60), type: TYPES[s.type] ? s.type : 'task', role: ROLES[s.role] ? s.role : 'rem', sla: Math.max(1, Math.min(365, +s.sla || 5)), esc: Math.max(1, Math.min(365, +s.esc || 10)) };
      if (s.group) x.group = sid(s.group, 'g'); if (s.onReject) x.onReject = sid(s.onReject, ''); if (s.usuallyCanceled) x.usuallyCanceled = true; ws.steps.push(x); }
    ws.steps.forEach((s) => { if (s.onReject && !ws.steps.some((t, i) => t.id === s.onReject && i < ws.steps.indexOf(s))) delete s.onReject; }); o.workflows.push(ws); }
  for (const t of set.schedule || []) { const x = { id: sid(t.id, 't' + o.schedule.length), g: String(t.g || 'Tasks').slice(0, 40), name: String(t.name || 'Task').slice(0, 60), dur: Math.max(1, Math.min(720, +t.dur || 5)), deps: [], stage: Math.max(0, Math.min(10, +t.stage || 0)), role: ROLES[t.role] ? t.role : 'rem' };
    x.deps = (t.deps || []).filter((d) => Array.isArray(d)).map((d) => [sid(d[0], ''), +d[1] || 0]); if (t.ms) x.ms = { name: String(t.ms.name).slice(0, 60), def: String(t.ms.def || '').slice(0, 160), gate: !!t.ms.gate, at: t.ms.at === 'start' ? 'start' : 'end' }; o.schedule.push(x); }
  o.schedule.forEach((t) => { t.deps = t.deps.filter((d) => d[0] !== t.id && o.schedule.some((u) => u.id === d[0])); }); return o; }
// ---- schedule: dependencies → baseline offsets (topological; cycles are cut and reported)
export function plan(set) { const T = set.schedule, byId = new Map(T.map((t) => [t.id, t])), off = new Map(), cyc = [], seen = new Set();
  const visit = (t, path) => { if (off.has(t.id)) return off.get(t.id); if (path.has(t.id)) { cyc.push(t.id); return 0; } path.add(t.id); let o = 0;
    for (const [d, lag] of t.deps) { const u = byId.get(d); if (u) o = Math.max(o, visit(u, path) + u.dur + lag); } path.delete(t.id); off.set(t.id, Math.max(0, o)); return Math.max(0, o); };
  T.forEach((t) => visit(t, new Set())); seen.clear(); const out = T.map((t) => ({ ...t, off: off.get(t.id), end: off.get(t.id) + t.dur }));
  return { tasks: out, byId: new Map(out.map((t) => [t.id, t])), total: Math.max(0, ...out.map((t) => t.end)), cycles: [...new Set(cyc)] }; }
export function baseline(set, pStart) { const P = plan(set); return P.tasks.map((t) => ({ id: t.id, name: t.name, g: t.g, bS: pStart + t.off, bE: pStart + t.end, role: t.role, stage: t.stage })); }
// critical path: walk back from the last task along the binding dependency
export function critical(set) { const P = plan(set), last = P.tasks.reduce((a, t) => (t.end > (a ? a.end : -1) ? t : a), null), path = new Set(); let t = last;
  while (t) { path.add(t.id); let nx = null; for (const [d, lag] of t.deps) { const u = P.byId.get(d); if (u && u.end + lag === t.off) nx = u; } t = nx; } return path; }
// ---- workflows: expand param templates into instances (Budget × Baseline/REC/Committed)
export function instances(set) { const out = []; for (const w of set.workflows) { if (w.params && w.params.length) w.params.forEach(([p, task, lag]) => out.push({ ...w, iid: `${w.id}:${p}`, name: `${w.name} · ${p}`, param: p, start: [task, lag] })); else out.push({ ...w, iid: w.id }); } return out; }
// stages of a chain: consecutive steps with the same group run in parallel
export function lanes(w) { const L = []; for (const s of w.steps) { const last = L[L.length - 1]; if (s.group && last && last.group === s.group) last.steps.push(s); else L.push({ group: s.group || null, steps: [s] }); } return L; }
// ---- milestones: ONE canonical list, auto-derived from tasks + workflows (never typed twice)
export function milestones(set) { const out = [];
  for (const t of set.schedule) if (t.ms) out.push({ name: t.ms.name, def: t.ms.def, gate: t.ms.gate, owner: t.role, by: `📅 task · ${t.name} (${t.ms.at})`, kind: 'task', ref: t.id, at: t.ms.at });
  for (const w of set.workflows) if (w.ms) out.push({ name: w.ms.name, def: w.ms.def, gate: w.ms.gate, owner: (w.steps[w.steps.length - 1] || {}).role || 'rem', by: `✅ workflow · ${w.name} closes`, kind: 'wf', ref: w.id });
  const P = plan(set); const when = (m) => (m.kind === 'task' ? (m.at === 'start' ? P.byId.get(m.ref).off : P.byId.get(m.ref).end) : (() => { const w = set.workflows.find((x) => x.id === m.ref), t = P.byId.get((w.start || (w.params && w.params[0].slice(1)) || ['tfr'])[0]); return (t ? t.off : 0) + ((w.start || [0, 0])[1] || 0) + nominal(w); })());
  out.forEach((m) => { m.day = when(m); }); return out.sort((a, b) => a.day - b.day); }
// nominal (SLA) duration of a chain: parallel lanes take their slowest step
export const nominal = (w) => lanes(w).reduce((a, l) => a + Math.max(...l.steps.map((s) => (s.usuallyCanceled ? 0 : s.sla))), 0);
// ---- one site run of a workflow instance (shared by the portfolio panel and ▶ Simulate)
// rnd: seeded 0..1 generator; load: role → extra wait days; returns per-step timing + rework count
export function runChain(w, begin, rnd, load = {}) { const L = lanes(w), steps = []; let d = begin, rework = 0, guard = 0;
  for (let i = 0; i < L.length && guard < 40; i++, guard++) { const lane = L[i]; let laneEnd = d;
    for (const s of lane.steps) { if (s.usuallyCanceled && rnd() < 0.8) { steps.push({ s, start: d, end: d, status: 'Canceled' }); continue; }
      const take = Math.max(1, Math.round(s.sla * (0.55 + rnd() * 0.9) + (load[s.role] || 0) * rnd())); const end = d + take; laneEnd = Math.max(laneEnd, end);
      steps.push({ s, start: d, end, status: s.type === 'approval' ? 'Approved' : 'Complete', late: take > s.sla, esc: take > s.esc }); }
    const back = lane.steps.find((s) => s.onReject); if (back && rework < 1 && rnd() < 0.22) { const j = L.findIndex((l) => l.steps.some((s) => s.id === back.onReject)); if (j >= 0 && j < i) { rework++; steps.push({ s: back, start: laneEnd, end: laneEnd, status: 'Rejected', loop: back.onReject }); d = laneEnd + 1; i = j - 1; continue; } }
    d = laneEnd + 1; }
  return { steps, end: d - 1, days: d - 1 - begin, rework }; }
export const seeded = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
