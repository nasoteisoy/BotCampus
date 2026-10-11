/* Coffee Opening: the plan model (stages, example stores, progress, status, save/load).
   No DOM, no Three.js, so it also runs in node for tests. All plan data here is GENERIC EXAMPLE DATA. */
(function (root) {
  'use strict';
  const KEY = 'coffee-opening-v2', KEY_V1 = 'coffee-opening-v1';   // v1 saves are migrated (and left in place as a backup)
  const STAGES = [
    { id: 'scout', icon: '🔍', name: 'Site scouting', short: 'Scout', owner: 'Real estate' },
    { id: 'loi', icon: '✍️', name: 'LOI signed', short: 'LOI', owner: 'Real estate' },
    { id: 'rec', icon: '📦', name: 'REC package ready', short: 'REC pkg', owner: 'Development' },
    { id: 'vote', icon: '🗳', name: 'REC vote', short: 'Vote', owner: 'Real estate committee', vote: true },
    { id: 'precon', icon: '📝', name: 'Pre-construction', short: 'Pre-con', owner: 'Development' },
    { id: 'build', icon: '🏗', name: 'Construction', short: 'Build', owner: 'Construction PM' },
    { id: 'equip', icon: '☕', name: 'Equipment', short: 'Equip', owner: 'Ops' },
    { id: 'hire', icon: '👥', name: 'Hire & train', short: 'Hire', owner: 'Store manager' },
    { id: 'ready', icon: '📅', name: 'One month out', short: '1 month', owner: 'Area manager', rollup: ['equip', 'hire'] },
    { id: 'soft', icon: '🧪', name: 'Soft open', short: 'Soft', owner: 'Store manager' },
    { id: 'grand', icon: '🎉', name: 'Grand opening', short: 'Grand', owner: 'Marketing' },
  ];
  const IDX = {}; STAGES.forEach((s, i) => { IDX[s.id] = i; });
  // generic example tasks (no real company, no real people)
  const TASKS = {
    scout: ['Trade area & demographics', 'Traffic counts (AM peak)', 'Shortlist 3 sites', 'Site visits & photos', 'Drive-thru stacking check (12+ cars)', 'Zoning check', 'Pick preferred site'],
    loi: ['Draft LOI terms (rent, TI, term)', 'Send LOI to landlord', 'Negotiate rent & free-rent months', 'Exclusive-use clause (coffee)', 'LOI signed by both sides'],
    rec: ['Site plan & concept design', 'Capex budget', 'Pro forma (sales, P&L, payback)', 'Legal review (title, zoning, easements)', 'Lease draft from landlord', 'Trade area map & photos', 'Package sent to REC'],
    vote: ['Pre-read sent to committee', 'Book REC meeting slot', 'Present site to committee', 'Answer follow-up questions', 'Conditions of approval logged'],
    precon: ['Lease executed', 'Building permit submitted', 'Building permit approved', 'Health permit plan review', 'GC contract signed', 'Construction drawings final', 'Utilities ordered (power, water, gas, net)', 'Construction schedule set'],
    build: ['Groundbreak', 'Foundation poured', 'Framing & walls', 'Roof on', 'MEP rough-in (plumbing, electric, HVAC)', 'Inspections passed', 'Drive-thru lane & parking paved', 'Signage installed'],
    equip: ['Espresso machines (2)', 'Grinders', 'Refrigeration & ice machine', 'Brewers & blenders', 'POS & menu boards', 'Water filtration', 'Equipment tested & calibrated'],
    hire: ['Hire store manager', 'Post barista jobs', 'Interviews & offers', 'Hire 12–15 baristas', 'Food-safety certificates', 'Barista training (drinks, bar flow)', 'POS & drive-thru training'],
    ready: ['Vendors & supply set (milk, beans, cups)', 'First inventory delivered', 'Local marketing plan', 'Opening-week staff schedule', 'Health inspection passed', 'Opening walkthrough'],
    soft: ['Friends & family day', 'Soft-open menu test', 'Drive-thru dry runs (timed)', 'Fix issues from dry runs', 'Ticket times on target'],
    grand: ['Grand-open marketing live', 'Ribbon cutting booked', 'Opening-day promos ready', 'Extra staff scheduled', 'Doors open 🎉'],
  };
  // each stage's due date, in days before the grand opening target
  const OFF = [-250, -230, -205, -190, -150, -52, -38, -30, -9, -2, 0];
  const VOTES = ['pending', 'approved', 'deferred', 'rejected'];
  // ---- open stores: issue presets (icon, title, default priority) + routine checks
  const PRIO = ['low', 'high', 'urgent'];
  const ISSUES = [['🧊', 'Walk-in cooler down', 'urgent'], ['☕', 'Espresso machine service', 'high'], ['👥', 'Staffing short', 'high'], ['🧾', 'Health inspection due', 'high'],
    ['📦', 'Low inventory', 'low'], ['🧹', 'Deep clean', 'low'], ['🔧', 'HVAC repair', 'high'], ['📄', 'Permit renewal', 'low'], ['⭐', 'Bad review follow-up', 'low']];
  const CHECKS = [['daily', '🌡', 'Fridge & cooler temps'], ['daily', '🧼', 'Sanitize bar & steam wands'], ['daily', '💵', 'Cash count & close'], ['daily', '🧹', 'Floor & lobby clean'],
    ['weekly', '☕', 'Backflush & grinder clean'], ['weekly', '📦', 'Inventory count & order'], ['weekly', '🗓', 'Staff schedule posted'],
    ['monthly', '🔧', 'HVAC filter check'], ['monthly', '💧', 'Water filter check'], ['monthly', '🧯', 'Fire extinguisher & safety walk']];
  const EVERY = ['daily', 'weekly', 'monthly'];

  // ---- dates (local YYYY-MM-DD strings)
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + Math.round(n)); return ymd(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

  let n = 0; const uid = () => Date.now().toString(36).slice(-4) + (n++).toString(36) + Math.random().toString(36).slice(2, 5);

  function plan(target) {
    return STAGES.map((S, i) => {
      const due = addDays(target, OFF[i]), from = addDays(target, i ? OFF[i - 1] : OFF[0] - 30), span = diffDays(from, due), names = TASKS[S.id];
      const st = { id: S.id, owner: S.owner, due, status: 'auto', tasks: names.map((t, k) => ({ id: uid(), t, done: false, due: addDays(from, span * (k + 1) / names.length) })) };
      if (S.vote) st.vote = 'pending';
      return st;
    });
  }
  function newStore(o) {
    const target = o.target || addDays(today(), 240);
    return { id: o.id || uid(), icon: o.icon || '🏪', name: o.name || 'New store', example: !!o.example, phase: 'opening', target, stages: plan(target) };
  }
  // tick every task of the first k stages (+ the vote)
  function doneUpTo(s, k) { s.stages.forEach((st, i) => { if (i < k) { st.tasks.forEach(t => { t.done = true; }); if (STAGES[i].vote) st.vote = 'approved'; } }); return s; }
  function tick(s, id, m) { s.stages[IDX[id]].tasks.forEach((t, k) => { if (k < m) t.done = true; }); return s; }
  function issue(icon, t, prio, due, owner = 'Store manager') { return { id: uid(), icon, t, prio, due: due || '', owner, done: false, at: '' }; }
  function preset(k, d, dueIn) { const [icon, t, prio] = ISSUES[k]; return issue(icon, t, prio, addDays(d, dueIn ?? (prio === 'urgent' ? 0 : prio === 'high' ? 3 : 7))); }
  function newOps(opened, d = today()) {
    return { status: 'auto', opened, issues: [], checks: CHECKS.map(([every, icon, t]) => ({ id: uid(), every, icon, t, last: '', since: opened || d })) };
  }
  function openStore(s, d = today()) { s.phase = 'open'; if (!s.ops) s.ops = newOps(d, d); return s; }
  function examples() {
    const d = today();
    const a = tick(doneUpTo(newStore({ id: 'ex-elm', icon: '🌳', name: 'Elm St drive-thru', example: true, target: addDays(d, 125) }), 5), 'build', 3);
    const b = newStore({ id: 'ex-river', icon: '🌊', name: 'Riverside kiosk', example: true, target: addDays(d, 260) });
    doneUpTo(b, 3); tick(b, 'vote', 4); b.stages[3].vote = 'deferred';
    const c = tick(doneUpTo(newStore({ id: 'ex-airport', icon: '✈️', name: 'Airport Rd café', example: true, target: addDays(d, 32) }), 8), 'ready', 3);
    const e = newStore({ id: 'ex-hill', icon: '⛰', name: 'Hilltop corner', example: true, target: addDays(d, 300) });
    doneUpTo(e, 3); tick(e, 'vote', 4); e.stages[3].vote = 'rejected';
    const f = tick(newStore({ id: 'ex-desert', icon: '🌵', name: 'Desert Ridge', example: true, target: addDays(d, 330) }), 'scout', 4);
    const g = tick(doneUpTo(newStore({ id: 'ex-sun', icon: '🌻', name: 'Sunflower Plaza', example: true, target: addDays(d, 170) }), 4), 'precon', 5);
    // open stores: built long ago, with their routine checks and issues
    const open = (id, icon, name, ago) => { const s = doneUpTo(newStore({ id, icon, name, example: true, target: addDays(d, -ago) }), 11); openStore(s, addDays(d, -ago));
      s.ops.checks.forEach((c) => { c.last = d; }); return s; };
    const h = open('ex-down', '🏙', 'Downtown Main', 420);
    const i = open('ex-hwy', '🚗', 'Highway 9 drive-thru', 160);
    const j = open('ex-lake', '🏖', 'Lakeside', 240);
    j.ops.issues.push(preset(1, d, 2), preset(4, d, 1)); j.ops.checks.find((c) => c.every === 'weekly').last = addDays(d, -16);
    const k = open('ex-pine', '🌲', 'Pinecrest', 75);
    k.ops.issues.push(preset(6, d, 4), preset(8, d, 5), preset(5, d, 9));
    const l = open('ex-college', '🎓', 'College Ave', 300);
    l.ops.issues.push(preset(0, d, 0), preset(2, d, 1), preset(3, d, 6)); l.ops.checks.filter((c) => c.every === 'daily').forEach((c) => { c.last = addDays(d, -3); });
    return [a, b, c, e, f, g, h, i, j, k, l];
  }
  function fresh() { const stores = examples(); return { v: 2, cur: stores[0].id, theme: 'day', stores }; }
  function clearExamples(o) { o.stores = o.stores.filter((x) => !x.example); if (!o.stores.length) o.stores.push(newStore({ name: 'My first store' })); if (!o.stores.some((x) => x.id === o.cur)) o.cur = o.stores[0].id; return o; }

  // ---- progress & status
  function raw(s, i) {
    const st = s.stages[i], S = STAGES[i]; let tot = st.tasks.length, d = st.tasks.filter(t => t.done).length;
    if (S.vote) { tot++; if (st.vote === 'approved') d++; }
    if (S.rollup) for (const id of S.rollup) { tot++; if (raw(s, IDX[id]) >= 1) d++; }
    return tot ? d / tot : 0;
  }
  const rejected = (s) => s.stages[IDX.vote].vote === 'rejected';
  const stopped = (s, i) => rejected(s) && i > IDX.vote;   // a rejected REC vote stops every later stage
  const eff = (s, i) => (stopped(s, i) ? 0 : raw(s, i));
  function autoStatus(s, i, d) {
    const st = s.stages[i];
    if (stopped(s, i) || (i === IDX.vote && st.vote === 'rejected')) return 'blocked';
    if (raw(s, i) >= 1) return 'done';
    if (i === IDX.vote && st.vote === 'deferred') return 'risk';
    const late = st.tasks.some(t => !t.done && isDate(t.due) && t.due < d) || (isDate(st.due) && st.due < d);
    return late ? 'risk' : 'ok';
  }
  function status(s, i, d = today()) { const o = s.stages[i].status; return o && o !== 'auto' ? o : autoStatus(s, i, d); }
  const overall = (s) => STAGES.reduce((a, _, i) => a + eff(s, i), 0) / STAGES.length;
  function current(s) { if (rejected(s)) return IDX.vote; for (let i = 0; i < STAGES.length; i++) if (eff(s, i) < 1) return i; return STAGES.length - 1; }
  const daysTo = (s, d = today()) => diffDays(d, s.target);
  const ready = (s) => STAGES.every((_, i) => eff(s, i) >= 1);   // all 11 done → can move to 🏪 Open

  // ---- routine checks: done this period / due / overdue (missed a whole period)
  function pStart(every, d) { const x = parse(d); if (every === 'daily') return d; if (every === 'weekly') { x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); } return d.slice(0, 8) + '01'; }
  const prevStart = (every, d) => pStart(every, addDays(pStart(every, d), -1));
  function checkState(c, d = today()) { if (isDate(c.last) && c.last >= pStart(c.every, d)) return 'done'; const ref = isDate(c.last) ? c.last : isDate(c.since) ? c.since : d; return ref < prevStart(c.every, d) ? 'late' : 'due'; }
  const openIssues = (s) => (s.ops ? s.ops.issues.filter((x) => !x.done) : []);
  function opsAuto(s, d = today()) {
    const o = s.ops; if (!o) return 'ok'; const op = openIssues(s);
    if (op.some((x) => x.prio === 'urgent')) return 'urgent';
    if (op.some((x) => x.prio === 'high' || (isDate(x.due) && x.due < d)) || o.checks.some((c) => checkState(c, d) === 'late')) return 'attn';
    return 'ok';
  }
  const opsStatus = (s, d = today()) => (s.ops && s.ops.status !== 'auto' ? s.ops.status : opsAuto(s, d));
  const isOpen = (s) => s.phase === 'open';
  // one word for lists, filters and the district map: urgent / attn / ok (open) · blocked / risk / ok (opening)
  function health(s, d = today()) { if (isOpen(s)) return opsStatus(s, d); if (rejected(s)) return 'blocked'; const st = status(s, current(s), d); return st === 'blocked' ? 'blocked' : st === 'risk' ? 'risk' : 'ok'; }
  const needsAttention = (s, d = today()) => health(s, d) !== 'ok';
  const URG = { urgent: 0, blocked: 1, attn: 2, risk: 3, ok: 4 };
  function sorted(stores, by, d = today()) {
    const k = (s) => (by === 'name' ? s.name.toLowerCase() : by === 'stage' ? (isOpen(s) ? 20 : current(s)) * 1000 + (1 - overall(s)) * 100 : URG[health(s, d)] * 100 + (isOpen(s) ? 50 : 0) + (isOpen(s) ? 0 : current(s)));
    return stores.slice().sort((a, b) => { const x = k(a), y = k(b); return x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name); });
  }
  const FILTERS = { all: () => true, opening: (s) => !isOpen(s), open: (s) => isOpen(s), attn: (s, d) => needsAttention(s, d) };

  // ---- save / load / import
  function valid(o) {
    if (!o || !Array.isArray(o.stores) || !o.stores.length) return false;
    return o.stores.every(s => s && typeof s.name === 'string' && isDate(s.target) && Array.isArray(s.stages) && s.stages.length === STAGES.length &&
      s.stages.every((st, i) => st && st.id === STAGES[i].id && Array.isArray(st.tasks) && st.tasks.every(t => t && typeof t.t === 'string')));
  }
  function clean(o) {
    for (const s of o.stores) {
      s.id = s.id || uid(); s.icon = s.icon || '🏪'; s.example = !!s.example;
      s.stages.forEach((st, i) => { st.status = ['auto', 'ok', 'risk', 'blocked'].includes(st.status) ? st.status : 'auto'; st.owner = String(st.owner || ''); st.due = isDate(st.due) ? st.due : '';
        if (STAGES[i].vote) st.vote = VOTES.includes(st.vote) ? st.vote : 'pending';
        st.tasks = st.tasks.map(t => ({ id: t.id || uid(), t: String(t.t).slice(0, 120), done: !!t.done, due: isDate(t.due) ? t.due : '' })); });
    }
    for (const s of o.stores) {   // v2: lifecycle + operating data (v1 saves have neither → 'opening')
      s.phase = s.phase === 'open' ? 'open' : 'opening';
      if (s.ops || s.phase === 'open') {
        const p = s.ops || {}; s.ops = { status: ['auto', 'ok', 'attn', 'urgent'].includes(p.status) ? p.status : 'auto', opened: isDate(p.opened) ? p.opened : s.target,
          issues: (Array.isArray(p.issues) ? p.issues : []).filter((x) => x && typeof x.t === 'string').map((x) => ({ id: x.id || uid(), icon: String(x.icon || '⚠️').slice(0, 8), t: x.t.slice(0, 120), prio: PRIO.includes(x.prio) ? x.prio : 'low', due: isDate(x.due) ? x.due : '', owner: String(x.owner || '').slice(0, 60), done: !!x.done, at: isDate(x.at) ? x.at : '' })),
          checks: Array.isArray(p.checks) ? p.checks.filter((c) => c && typeof c.t === 'string').map((c) => ({ id: c.id || uid(), every: EVERY.includes(c.every) ? c.every : 'daily', icon: String(c.icon || '✔').slice(0, 8), t: c.t.slice(0, 120), last: isDate(c.last) ? c.last : '', since: isDate(c.since) ? c.since : '' })) : newOps(s.target).checks };
      }
    }
    if (!o.stores.some(s => s.id === o.cur)) o.cur = o.stores[0].id;
    o.theme = o.theme === 'night' ? 'night' : 'day'; o.v = 2;
    return o;
  }
  function load(storage) {
    for (const k of [KEY, KEY_V1]) { try { const o = JSON.parse(storage.getItem(k)); if (valid(o)) return clean(o); } catch (e) { /* try the next */ } }
    return fresh();
  }
  function importJSON(text) {
    const o = JSON.parse(text);
    if (valid(o)) return clean(o);
    if (o && valid({ stores: [o] })) return clean({ stores: [o], cur: o.id });   // a single exported store
    throw new Error('not a Coffee Opening plan');
  }

  const API = { KEY, KEY_V1, PRIO, ISSUES, CHECKS, EVERY, issue, preset, newOps, openStore, clearExamples, ready, pStart, checkState, openIssues, opsAuto, opsStatus, isOpen, health, needsAttention, sorted, FILTERS, URG, STAGES, IDX, TASKS, OFF, VOTES, today, addDays, diffDays, isDate, uid, plan, newStore, examples, fresh, raw, eff, stopped, rejected, status, overall, current, daysTo, valid, clean, load, importJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CO = API;
})(typeof window !== 'undefined' ? window : globalThis);
