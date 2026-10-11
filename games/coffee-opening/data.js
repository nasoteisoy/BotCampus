/* Dutch Bros · New Shop Opening Tracker (pitch concept): the plan model (stages, example shops, progress, status, save/load).
   No DOM, no Three.js, so it also runs in node for tests. The example shops are MADE-UP EXAMPLE DATA, not real plans. */
(function (root) {
  'use strict';
  const KEY = 'coffee-opening-v4', KEY_V3 = 'coffee-opening-v3', KEY_V2 = 'coffee-opening-v2', KEY_V1 = 'coffee-opening-v1';   // v1–v3 saves are migrated (and left in place as a backup)
  const BRAND = 'Dutch Bros', SUB = 'New Shop Opening Tracker';
  const STAGES = [
    { id: 'scout', icon: '🔍', name: 'Site scouting', short: 'Scout', owner: 'Real estate' },
    { id: 'loi', icon: '✍️', name: 'LOI signed', short: 'LOI', owner: 'Real estate' },
    { id: 'rec', icon: '📦', name: 'REC package ready', short: 'REC pkg', owner: 'Development' },
    { id: 'vote', icon: '🗳', name: 'REC vote', short: 'Vote', owner: 'Real estate committee', vote: true },
    { id: 'precon', icon: '📝', name: 'Pre-construction', short: 'Pre-con', owner: 'Development' },
    { id: 'build', icon: '🏗', name: 'Construction', short: 'Build', owner: 'Construction PM' },
    { id: 'equip', icon: '☕', name: 'Equipment', short: 'Equip', owner: 'Ops' },
    { id: 'hire', icon: '👥', name: 'Hire & train', short: 'Hire', owner: 'Shop operator' },
    { id: 'ready', icon: '📅', name: 'One month out', short: '1 month', owner: 'Area manager', rollup: ['equip', 'hire'] },
    { id: 'soft', icon: '🧪', name: 'Soft open', short: 'Soft', owner: 'Shop operator' },
    { id: 'grand', icon: '🎉', name: 'Grand opening', short: 'Grand', owner: 'Marketing' },
  ];
  const IDX = {}; STAGES.forEach((s, i) => { IDX[s.id] = i; });
  // example tasks with Dutch Bros flavour (double drive-thru stands, Broistas, line-busters); made-up plan, no real people
  const TASKS = {
    scout: ['Trade area & commuter routes', 'Traffic counts (AM peak)', 'Double drive-thru car stacking (20+ cars, both lanes)', 'Shortlist 3 pad sites', 'Site visits & photos', 'Zoning: drive-thru allowed', 'Pick preferred site'],
    loi: ['Draft LOI terms (rent, TI, term)', 'Send LOI to landlord', 'Negotiate rent & free-rent months', 'Exclusive-use clause (coffee & energy drinks)', 'LOI signed by both sides'],
    rec: ['Stand concept (double drive-thru + walk-up)', 'Capex budget', 'Pro forma (sales, P&L, payback)', 'Legal review (title, zoning, easements)', 'Lease draft from landlord', 'Trade area map & photos', 'Package sent to REC'],
    vote: ['Pre-read sent to committee', 'Book REC meeting slot', 'Present site to committee', 'Answer follow-up questions', 'Conditions of approval logged'],
    precon: ['Lease executed', 'Building permit submitted', 'Building permit approved', 'Health permit plan review', 'GC contract signed', 'Construction drawings final', 'Utilities ordered (power, water, gas, net)', 'Construction schedule set'],
    build: ['Groundbreak', 'Stand foundation poured', 'Stand set & walls up', 'Roof, canopy & windmill on', 'MEP rough-in (plumbing, electric, HVAC)', 'Inspections passed', 'Dual drive-thru lanes & walk-up paved', 'Signage installed'],
    equip: ['Espresso machines (one bar per lane)', 'Grinders', 'Refrigeration & ice machines', 'Blenders (smoothies & frosts)', 'Rebel energy drink cooler', 'Cold brew system', 'POS, menu boards & lane tablets', 'Equipment tested & calibrated'],
    hire: ['Hire shop operator', 'Hire shift leads', 'Post Broista jobs', 'Interviews & offers', 'Hire 20–25 Broistas', 'Food-safety certificates', 'Broista training (drinks, culture, bar flow)', 'Line-buster tablet ordering training'],
    ready: ['Supply set (milk, cold brew, Rebel, cups)', 'First inventory delivered', 'Dutch Rewards app: shop live for orders', 'Local marketing & community plan', 'Opening-week Broista schedule', 'Health inspection passed', 'Opening walkthrough'],
    soft: ['Friends & family day', 'Menu test (Golden Eagle, Rebel, cold brew)', 'Double drive-thru dry runs (timed)', 'Line-busters on tablets in both lanes', 'Fix issues from dry runs', 'Ticket times on target'],
    grand: ['Grand-opening event plan live', 'Opening-day giveaways & stickers ready', 'Local charity partner booked', 'Ribbon cutting booked', 'Extra Broistas (both lanes + line-busters)', 'Doors open 🎉'],
  };
  // each stage's due date, in days before the grand opening target
  const OFF = [-250, -230, -205, -190, -150, -52, -38, -30, -9, -2, 0];
  const VOTES = ['pending', 'approved', 'deferred', 'rejected'];
  // ---- open stores: issue presets (icon, title, default priority) + routine checks
  const PRIO = ['low', 'high', 'urgent'];
  const ISSUES = [['🧊', 'Walk-in cooler down', 'urgent'], ['☕', 'Espresso machine service', 'high'], ['👥', 'Staffing short', 'high'], ['🧾', 'Health inspection due', 'high'],
    ['📦', 'Low inventory', 'low'], ['🧹', 'Deep clean', 'low'], ['🔧', 'HVAC repair', 'high'], ['📄', 'Permit renewal', 'low'], ['⭐', 'Bad review follow-up', 'low'],
    ['🚗', 'Drive-thru wait time high', 'high'], ['📱', 'App ordering down', 'urgent'], ['🥤', 'Rebel stock low', 'high']];
  const CHECKS = [['daily', '🌡', 'Fridge & cooler temps'], ['daily', '🧼', 'Sanitize bar & steam wands'], ['daily', '📱', 'Line-buster tablets charged & synced'], ['daily', '💵', 'Cash count & close'],
    ['weekly', '☕', 'Backflush & grinder clean'], ['weekly', '📦', 'Inventory & order (milk, cold brew, Rebel)'], ['weekly', '🗓', 'Broista schedule posted'],
    ['monthly', '🔧', 'HVAC filter check'], ['monthly', '💧', 'Water filter check'], ['monthly', '🧯', 'Fire extinguisher & safety walk']];
  const EVERY = ['daily', 'weekly', 'monthly'];
  // ---- v4 📍 metro map: every shop has a lat/lng. Example shops sit at real Phoenix-area intersections that match their names.
  const CENTER = [33.4484, -112.074];   // downtown Phoenix
  const EXLL = { 'ex-elm': [33.40735, -111.92647], 'ex-river': [33.41481, -111.87548], 'ex-airport': [33.44005, -111.98605], 'ex-hill': [33.60521, -111.72354],
    'ex-desert': [33.71158, -112.26873], 'ex-sun': [33.33478, -111.75561], 'ex-down': [33.49452, -111.92617], 'ex-hwy': [33.28497, -111.84176],
    'ex-lake': [33.46403, -112.39581], 'ex-pine': [33.53352, -112.26102], 'ex-college': [33.63887, -112.35795] };
  const isLL = (a) => Array.isArray(a) && a.length === 2 && a.every((v) => typeof v === 'number' && isFinite(v)) && Math.abs(a[0]) <= 85 && Math.abs(a[1]) <= 180;
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  // default spots for shops without a pin: a golden-angle spiral around the metro centre, about 3–9 km out, never on top of each other
  function spot(k) { const a = k * 2.39996, r = 0.03 + 0.012 * Math.sqrt(k); return [r5(CENTER[0] + r * Math.sin(a) * 0.84), r5(CENTER[1] + r * Math.cos(a))]; }

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
    return { id: o.id || uid(), icon: o.icon || '🏪', name: o.name || 'New store', example: !!o.example, phase: 'opening', target, stages: plan(target), ll: isLL(o.ll) ? [r5(o.ll[0]), r5(o.ll[1])] : (EXLL[o.id] ? EXLL[o.id].slice() : null), site: { corner: false, stack: false } };
  }
  // tick every task of the first k stages (+ the vote)
  function doneUpTo(s, k) { s.stages.forEach((st, i) => { if (i < k) { st.tasks.forEach(t => { t.done = true; }); if (STAGES[i].vote) st.vote = 'approved'; } }); return s; }
  function tick(s, id, m) { s.stages[IDX[id]].tasks.forEach((t, k) => { if (k < m) t.done = true; }); return s; }
  function issue(icon, t, prio, due, owner = 'Shop operator') { return { id: uid(), icon, t, prio, due: due || '', owner, done: false, at: '' }; }
  function preset(k, d, dueIn) { const [icon, t, prio] = ISSUES[k]; return issue(icon, t, prio, addDays(d, dueIn ?? (prio === 'urgent' ? 0 : prio === 'high' ? 3 : 7))); }
  function newOps(opened, d = today()) {
    return { status: 'auto', opened, issues: [], checks: CHECKS.map(([every, icon, t]) => ({ id: uid(), every, icon, t, last: '', since: opened || d })) };
  }
  function openStore(s, d = today()) { s.phase = 'open'; if (!s.ops) s.ops = newOps(d, d); return s; }
  function examples() {
    const d = today();
    const a = tick(doneUpTo(newStore({ id: 'ex-elm', icon: '🌴', name: 'Tempe · Rural Rd', example: true, target: addDays(d, 125) }), 5), 'build', 3);
    const b = newStore({ id: 'ex-river', icon: '🏜', name: 'Mesa · Main St', example: true, target: addDays(d, 260) });
    doneUpTo(b, 3); tick(b, 'vote', 4); b.stages[3].vote = 'deferred';
    const c = tick(doneUpTo(newStore({ id: 'ex-airport', icon: '✈️', name: 'Phoenix · Sky Harbor', example: true, target: addDays(d, 32) }), 8), 'ready', 3);
    const e = newStore({ id: 'ex-hill', icon: '⛰', name: 'Fountain Hills · Saguaro', example: true, target: addDays(d, 300) });
    doneUpTo(e, 3); tick(e, 'vote', 4); e.stages[3].vote = 'rejected';
    const f = tick(newStore({ id: 'ex-desert', icon: '🌵', name: 'Peoria · Lake Pleasant', example: true, target: addDays(d, 330) }), 'scout', 4);
    const g = tick(doneUpTo(newStore({ id: 'ex-sun', icon: '🌻', name: 'Gilbert · Val Vista', example: true, target: addDays(d, 170) }), 4), 'precon', 5);
    // open stores: built long ago, with their routine checks and issues
    const open = (id, icon, name, ago) => { const s = doneUpTo(newStore({ id, icon, name, example: true, target: addDays(d, -ago) }), 11); openStore(s, addDays(d, -ago));
      s.ops.checks.forEach((c) => { c.last = d; }); return s; };
    const h = open('ex-down', '🏙', 'Scottsdale · Old Town', 420);
    const i = open('ex-hwy', '🚗', 'Chandler · Loop 202', 160);
    const j = open('ex-lake', '⛳', 'Goodyear · Estrella', 240);
    j.ops.issues.push(preset(9, d, 2), preset(4, d, 1)); j.ops.checks.find((c) => c.every === 'weekly').last = addDays(d, -16);
    const k = open('ex-pine', '🏟', 'Glendale · Westgate', 75);
    k.ops.issues.push(preset(11, d, 4), preset(8, d, 5), preset(5, d, 9));
    const l = open('ex-college', '🎓', 'Surprise · Bell Rd', 300);
    l.ops.issues.push(preset(0, d, 0), preset(2, d, 1), preset(3, d, 6)); l.ops.checks.filter((c) => c.every === 'daily').forEach((c) => { c.last = addDays(d, -3); });
    return [a, b, c, e, f, g, h, i, j, k, l];
  }
  function fresh() { const stores = examples(); return { v: 4, cur: stores[0].id, theme: 'day', stores, layers: { traffic: false, existing: true, comp: false } }; }
  // ---- v1/v2 → v3: an example store that is still exactly as shipped (same ticks, texts, owners, votes, issues, relative dates) is swapped
  // for its Dutch Bros v3 example (same id); anything the user touched, and every user store, is kept as is.
  function rel(a, b) { return isDate(a) && isDate(b) ? diffDays(a, b) : ''; }
  function sig(s) {
    const o = s.ops;
    const j = JSON.stringify([s.id, s.icon, s.name, !!s.example, s.phase || 'opening', s.stages.map((st) => [st.id, st.owner, st.status, st.vote || '', rel(s.target, st.due), st.tasks.map((t) => [t.t, !!t.done, rel(s.target, t.due)])]),
      o ? [o.status, rel(s.target, o.opened), o.issues.map((x) => [x.icon, x.t, x.prio, !!x.done, x.owner, rel(o.opened, x.due)]), o.checks.map((c) => [c.every, c.icon, c.t, rel(o.opened, c.last)])] : null]);
    let h = 2166136261; for (let i = 0; i < j.length; i++) { h ^= j.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36);
  }
  // fingerprints of the shipped v1 (4) and v2 (11) example stores, made with sig() above
  const PRISTINE = new Set(['1kdyte9', '1h7t8fb', '1oeuayx', '342n0u', 'h0ygqw', 'lymqmz', '1k2n0v6', '3zhqhk', '1ro43y4', '1ba1bjh', '15py0q4']);
  function migrate(o) {
    const ex = examples(); let swapped = 0;
    o.stores = o.stores.map((s) => { if (!s.example || !PRISTINE.has(sig(s))) return s; const n = ex.find((x) => x.id === s.id); if (!n) return s; swapped++; return n; });
    o.migrated = { from: o.v || 1, swapped }; return o;
  }
  // v4: every shop gets a pin. Kept: any valid lat/lng. Examples (also touched ones) go to their own intersection; other shops get a spread-out default spot.
  function place(o) {
    let k = 0, placed = 0; const used = new Set(o.stores.filter((s) => isLL(s.ll)).map((s) => s.ll.join()));
    for (const s of o.stores) {
      const si = s.site || {}; s.site = { corner: !!si.corner, stack: !!si.stack };
      if (isLL(s.ll)) { s.ll = [r5(s.ll[0]), r5(s.ll[1])]; continue; }
      let ll = s.example && EXLL[s.id] && !used.has(EXLL[s.id].join()) ? EXLL[s.id] : null;
      while (!ll) { const c = spot(k++); if (!used.has(c.join())) ll = c; }
      s.ll = ll.slice(); used.add(ll.join()); placed++;
    }
    return placed;
  }
  function clearExamples(o) { o.stores = o.stores.filter((x) => !x.example); if (!o.stores.length) o.stores.push(newStore({ name: 'My first store' })); place(o); if (!o.stores.some((x) => x.id === o.cur)) o.cur = o.stores[0].id; return o; }

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
    const from = o.v || 1;
    if (from < 3 && !o.noMigrate) migrate(o);
    const placed = place(o);   // v4: pins for shops without a lat/lng
    if (from < 4 && !o.noMigrate) o.migrated = { from, swapped: o.migrated ? o.migrated.swapped : 0, placed };
    delete o.noMigrate;
    if (!o.stores.some(s => s.id === o.cur)) o.cur = o.stores[0].id;
    const L = o.layers || {}; o.layers = { traffic: !!L.traffic, existing: L.existing !== false, comp: !!L.comp };
    o.theme = o.theme === 'night' ? 'night' : 'day'; o.v = 4;
    return o;
  }
  function load(storage) {
    for (const k of [KEY, KEY_V3, KEY_V2, KEY_V1]) { try { const o = JSON.parse(storage.getItem(k)); if (valid(o)) return clean(o); } catch (e) { /* try the next */ } }
    return fresh();
  }
  function importJSON(text) {
    const o = JSON.parse(text);
    if (valid(o)) return clean(o);
    if (o && valid({ stores: [o] })) return clean({ stores: [o], cur: o.id });   // a single exported store
    throw new Error('not an opening plan');
  }

  const API = { KEY, KEY_V3, KEY_V2, KEY_V1, BRAND, SUB, sig, migrate, PRISTINE, CENTER, EXLL, isLL, spot, place, PRIO, ISSUES, CHECKS, EVERY, issue, preset, newOps, openStore, clearExamples, ready, pStart, checkState, openIssues, opsAuto, opsStatus, isOpen, health, needsAttention, sorted, FILTERS, URG, STAGES, IDX, TASKS, OFF, VOTES, today, addDays, diffDays, isDate, uid, plan, newStore, examples, fresh, raw, eff, stopped, rejected, status, overall, current, daysTo, valid, clean, load, importJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CO = API;
})(typeof window !== 'undefined' ? window : globalThis);
