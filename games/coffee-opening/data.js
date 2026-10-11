/* Coffee Opening: the plan model (stages, example stores, progress, status, save/load).
   No DOM, no Three.js, so it also runs in node for tests. All plan data here is GENERIC EXAMPLE DATA. */
(function (root) {
  'use strict';
  const KEY = 'coffee-opening-v1';
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
    return { id: o.id || uid(), icon: o.icon || '🏪', name: o.name || 'New store', example: !!o.example, target, stages: plan(target) };
  }
  // tick every task of the first k stages (+ the vote)
  function doneUpTo(s, k) { s.stages.forEach((st, i) => { if (i < k) { st.tasks.forEach(t => { t.done = true; }); if (STAGES[i].vote) st.vote = 'approved'; } }); return s; }
  function tick(s, id, m) { s.stages[IDX[id]].tasks.forEach((t, k) => { if (k < m) t.done = true; }); return s; }
  function examples() {
    const d = today();
    const a = tick(doneUpTo(newStore({ id: 'ex-elm', icon: '🌳', name: 'Elm St drive-thru', example: true, target: addDays(d, 125) }), 5), 'build', 3);
    const b = newStore({ id: 'ex-river', icon: '🌊', name: 'Riverside kiosk', example: true, target: addDays(d, 260) });
    doneUpTo(b, 3); tick(b, 'vote', 4); b.stages[3].vote = 'deferred';
    const c = tick(doneUpTo(newStore({ id: 'ex-airport', icon: '✈️', name: 'Airport Rd café', example: true, target: addDays(d, 32) }), 8), 'ready', 3);
    const e = newStore({ id: 'ex-hill', icon: '⛰', name: 'Hilltop corner', example: true, target: addDays(d, 300) });
    doneUpTo(e, 3); tick(e, 'vote', 4); e.stages[3].vote = 'rejected';
    return [a, b, c, e];
  }
  function fresh() { const stores = examples(); return { v: 1, cur: stores[0].id, theme: 'day', stores }; }

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
    if (!o.stores.some(s => s.id === o.cur)) o.cur = o.stores[0].id;
    o.theme = o.theme === 'night' ? 'night' : 'day'; o.v = 1;
    return o;
  }
  function load(storage) { try { const o = JSON.parse(storage.getItem(KEY)); if (valid(o)) return clean(o); } catch (e) { /* fall through */ } return fresh(); }
  function importJSON(text) {
    const o = JSON.parse(text);
    if (valid(o)) return clean(o);
    if (o && valid({ stores: [o] })) return clean({ stores: [o], cur: o.id });   // a single exported store
    throw new Error('not a Coffee Opening plan');
  }

  const API = { KEY, STAGES, IDX, TASKS, OFF, VOTES, today, addDays, diffDays, isDate, uid, plan, newStore, examples, fresh, raw, eff, stopped, rejected, status, overall, current, daysTo, valid, clean, load, importJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CO = API;
})(typeof window !== 'undefined' ? window : globalThis);
