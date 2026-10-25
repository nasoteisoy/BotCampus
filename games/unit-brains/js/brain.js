// Conquest Commander — Unit & Squad Brains (pure logic, no DOM). Works as a browser global (window.Brain) and in Node (require).
(function (root) {
  'use strict';
  const VERSION = 1;
  const MAX_ROWS = 6;
  const MIN_HOLD = 1.0;          // hysteresis: a row that starts firing is kept ≥ this many seconds (unless the unit takes damage)
  const TIER2_ENABLED = false;   // ⭐ actions (medic / mine / guard) are CUT for v1 (Lead decision 2026-10-24). Data kept for later.

  // Palette. tier 1 = available at first (5 conditions + the always fallback, 6 actions). tier 2 = later unlocks.
  const CONDS = [
    { id: 'lowHp', icon: '❤️', label: 'Low HP' },
    { id: 'enemyNear', icon: '👀', label: 'Enemy' },
    { id: 'lowAmmo', icon: '🔫', label: 'Low ammo' },
    { id: 'pointNotOurs', icon: '🏳️', label: 'Not ours' },
    { id: 'allyHurt', icon: '🆘', label: 'Ally hurt' },
    { id: 'always', icon: '✅', label: 'Always', fallback: true },
  ];
  const ACTS = [
    { id: 'heal', icon: '💊', label: 'Heal', tier: 1 },
    { id: 'cover', icon: '🧱', label: 'Cover', tier: 1 },
    { id: 'shoot', icon: '🎯', label: 'Shoot', tier: 1 },
    { id: 'capture', icon: '🏳️', label: 'Capture', tier: 1 },
    { id: 'ammo', icon: '📦', label: 'Ammo', tier: 1 },
    { id: 'follow', icon: '🧭', label: 'Follow', tier: 1 },
    { id: 'medic', icon: '➕', label: 'Medic', tier: 2 },
    { id: 'mine', icon: '💣', label: 'Mine', tier: 2 },
    { id: 'guard', icon: '🛡️', label: 'Guard', tier: 2 },
  ];
  const PLANS = [
    { id: 'capture', icon: '🏳️', label: 'Capture' },
    { id: 'hold', icon: '🛡️', label: 'Hold' },
    { id: 'retake', icon: '🔁', label: 'Retake' },
    { id: 'push', icon: '⚔️', label: 'Push' },
  ];
  const FORMS = [
    { id: 'line', label: 'Line' },
    { id: 'wedge', label: 'Wedge' },
    { id: 'blob', label: 'Blob' },
  ];
  const SPACINGS = [1, 2, 3];
  const COND = Object.fromEntries(CONDS.map((c) => [c.id, c]));
  const ACT = Object.fromEntries(ACTS.map((a) => [a.id, a]));
  const PLAN = Object.fromEntries(PLANS.map((p) => [p.id, p]));
  const FORM = Object.fromEntries(FORMS.map((f) => [f.id, f]));
  const actsForTier = (tier) => ACTS.filter((a) => a.tier <= (TIER2_ENABLED ? tier : 1));
  const ACTS_ON = actsForTier(2);   // what the palette shows (6 while ⭐ is cut)

  const r = (c, a, on = true) => ({ if: c, do: a, on });
  // Presets = the v2.3 traits (traits.js TRAITS ids/icons/names) mapped into rows.
  const ALL_PRESETS = [
    { id: 'rusher', icon: '🏃', name: 'Rusher', tier: 1, rows: [r('lowHp', 'heal'), r('lowAmmo', 'ammo'), r('enemyNear', 'shoot'), r('always', 'capture')] },
    { id: 'cover', icon: '🧱', name: 'Cover Fighter', tier: 1, rows: [r('lowHp', 'heal'), r('lowAmmo', 'ammo'), r('enemyNear', 'cover'), r('always', 'capture')] },
    { id: 'sniper', icon: '🎯', name: 'Sniper Nest', tier: 1, rows: [r('enemyNear', 'cover'), r('lowHp', 'heal'), r('lowAmmo', 'ammo'), r('always', 'follow')] },
    { id: 'retaker', icon: '🔁', name: 'Retaker', tier: 1, squadPlan: 'retake', rows: [r('lowHp', 'heal'), r('pointNotOurs', 'capture'), r('enemyNear', 'shoot'), r('always', 'follow')] },
    { id: 'supplier', icon: '➕', name: 'Supplier', tier: 2, rows: [r('allyHurt', 'medic'), r('lowHp', 'heal'), r('lowAmmo', 'ammo'), r('enemyNear', 'shoot'), r('always', 'follow')] },
    { id: 'mines', icon: '💣', name: 'Mine Layer', tier: 2, rows: [r('lowHp', 'heal'), r('enemyNear', 'shoot'), r('lowAmmo', 'ammo'), r('always', 'mine'), r('always', 'capture')] },
    { id: 'guard', icon: '🛡️', name: 'Guard', tier: 2, squadPlan: 'hold', rows: [r('lowHp', 'heal'), r('enemyNear', 'cover'), r('lowAmmo', 'ammo'), r('always', 'guard')] },
  ];
  // ⭐ presets (supplier / mines / guard) need cut actions → hidden while TIER2_ENABLED is false
  const PRESETS = ALL_PRESETS.filter((p) => TIER2_ENABLED || p.tier === 1);
  const PRESET = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

  function presetBrain(id) {
    const p = PRESET[id] || PRESETS[0];
    return { kind: 'cc.unitBrain', v: VERSION, name: p.name, icon: p.icon, preset: p.id, tier: p.tier, rows: p.rows.map((x) => ({ ...x })) };
  }
  function defaultSquad() { return { kind: 'cc.squadBrain', v: VERSION, plan: 'capture', formation: 'wedge', follow: true, spacing: 2 }; }

  // ---- evaluator: top → bottom, skip toggled-off rows, first row whose condition is true AND whose action can run fires.
  // test(condId) -> bool, can(actId) -> bool (optional; default: everything can run). Returns { row, act } or { row: -1, act: null }.
  function evaluate(brain, test, can) {
    const rows = (brain && brain.rows) || [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.on === false) continue;
      const ok = row.if === 'always' ? true : !!test(row.if);
      if (!ok) continue;
      if (can && !can(row.do)) continue;
      return { row: i, act: row.do };
    }
    return { row: -1, act: null };
  }
  // ---- hysteresis: once a row fires it is kept for minHold seconds, unless HP dropped since the last think
  // (took damage → re-evaluate now) or the held row was switched off / its action can no longer run.
  // mem = per-unit state { row, act, since, hp } (start with newMem()). Returns { row, act, held, hurt }.
  function newMem() { return { row: -1, act: null, since: -Infinity, hp: null, why: 'start' }; }
  function evaluateHeld(brain, test, can, mem, now, hp, minHold) {
    const hold = typeof minHold === 'number' ? minHold : MIN_HOLD;
    const hurt = mem.hp !== null && hp < mem.hp;
    mem.hp = hp;
    const rows = (brain && brain.rows) || [];
    let why = 'free';                     // why a re-evaluation happened: free (no hold) | expired | hurt | cant | off
    if (mem.row >= 0 && now - mem.since < hold) {
      const row = rows[mem.row];
      if (!row || row.on === false || row.do !== mem.act) why = 'off';
      else if (can && !can(row.do)) why = 'cant';
      else if (hurt) why = 'hurt';
      else return { row: mem.row, act: mem.act, held: true, hurt, why: 'held' };
    } else if (mem.row >= 0) why = 'expired';
    const res = evaluate(brain, test, can);
    if (res.row !== mem.row || res.act !== mem.act) { mem.row = res.row; mem.act = res.act; mem.since = now; mem.why = why; }
    return { row: res.row, act: res.act, held: false, hurt, why };
  }
  // rows below the first enabled ✅ row can never fire (except when that row's action can't run) — shown as a hint in the editor
  function shadowedRows(brain) {
    const out = []; let seen = false;
    (brain.rows || []).forEach((row, i) => { if (seen && row.on !== false) out.push(i); if (row.on !== false && row.if === 'always') seen = true; });
    return out;
  }

  // ---- validation (strict, returns normalized copy)
  function validateUnitBrain(b) {
    const errors = [];
    if (!b || typeof b !== 'object') return { ok: false, errors: ['not an object'] };
    if (b.kind !== 'cc.unitBrain') errors.push('kind must be cc.unitBrain');
    if (typeof b.v !== 'number' || b.v < 1 || b.v > VERSION) errors.push('v must be 1..' + VERSION);
    const tier = b.tier === undefined ? 1 : b.tier;
    if (tier !== 1 && tier !== 2) errors.push('tier must be 1 or 2');
    else if (tier === 2 && !TIER2_ENABLED) errors.push('⭐ tier 2 is cut for now');
    if (!Array.isArray(b.rows)) errors.push('rows must be an array');
    else {
      if (b.rows.length < 1) errors.push('need at least 1 row');
      if (b.rows.length > MAX_ROWS) errors.push('max ' + MAX_ROWS + ' rows');
      b.rows.forEach((row, i) => {
        if (!row || typeof row !== 'object') { errors.push('row ' + (i + 1) + ' bad'); return; }
        if (!COND[row.if]) errors.push('row ' + (i + 1) + ': unknown IF ' + row.if);
        if (!ACT[row.do]) errors.push('row ' + (i + 1) + ': unknown THEN ' + row.do);
        else if (ACT[row.do].tier > 1 && !TIER2_ENABLED) errors.push('row ' + (i + 1) + ': ' + row.do + ' is cut for now (⭐)');
        else if (ACT[row.do].tier > tier) errors.push('row ' + (i + 1) + ': ' + row.do + ' is locked (tier ' + ACT[row.do].tier + ')');
        if (row.on !== undefined && typeof row.on !== 'boolean') errors.push('row ' + (i + 1) + ': on must be true/false');
      });
    }
    if (b.name !== undefined && (typeof b.name !== 'string' || b.name.length > 24)) errors.push('name: text ≤ 24');
    if (errors.length) return { ok: false, errors };
    return { ok: true, errors, brain: { kind: 'cc.unitBrain', v: VERSION, name: b.name || 'Custom', icon: typeof b.icon === 'string' ? b.icon.slice(0, 8) : '🧠', preset: typeof b.preset === 'string' ? b.preset : null, tier, rows: b.rows.map((x) => ({ if: x.if, do: x.do, on: x.on !== false })) } };
  }
  function validateSquadBrain(s) {
    const errors = [];
    if (!s || typeof s !== 'object') return { ok: false, errors: ['not an object'] };
    if (s.kind !== 'cc.squadBrain') errors.push('kind must be cc.squadBrain');
    if (typeof s.v !== 'number' || s.v < 1 || s.v > VERSION) errors.push('v must be 1..' + VERSION);
    if (!PLAN[s.plan]) errors.push('unknown plan ' + s.plan);
    if (!FORM[s.formation]) errors.push('unknown formation ' + s.formation);
    if (typeof s.follow !== 'boolean') errors.push('follow must be true/false');
    if (!SPACINGS.includes(s.spacing)) errors.push('spacing must be 1, 2 or 3');
    if (errors.length) return { ok: false, errors };
    return { ok: true, errors, squad: { kind: 'cc.squadBrain', v: VERSION, plan: s.plan, formation: s.formation, follow: s.follow, spacing: s.spacing } };
  }
  // bundle = what Save/Load uses: { kind:'cc.brains', v, unit, squad }. Also accepts a bare unit or squad brain.
  function parseBundle(text) {
    let o; try { o = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, errors: ['bad JSON'] }; }
    if (o && o.kind === 'cc.unitBrain') { const u = validateUnitBrain(o); return u.ok ? { ok: true, errors: [], unit: u.brain, squad: null } : u; }
    if (o && o.kind === 'cc.squadBrain') { const s = validateSquadBrain(o); return s.ok ? { ok: true, errors: [], unit: null, squad: s.squad } : s; }
    if (!o || o.kind !== 'cc.brains') return { ok: false, errors: ['kind must be cc.brains'] };
    if (typeof o.v !== 'number' || o.v < 1 || o.v > VERSION) return { ok: false, errors: ['v must be 1..' + VERSION] };
    const u = validateUnitBrain(o.unit), s = validateSquadBrain(o.squad);
    const errors = [...(u.ok ? [] : u.errors.map((e) => 'unit: ' + e)), ...(s.ok ? [] : s.errors.map((e) => 'squad: ' + e))];
    if (errors.length) return { ok: false, errors };
    return { ok: true, errors: [], unit: u.brain, squad: s.squad };
  }
  function makeBundle(unit, squad) { return { kind: 'cc.brains', v: VERSION, unit, squad }; }

  const api = { VERSION, MAX_ROWS, MIN_HOLD, TIER2_ENABLED, ALL_PRESETS, ACTS_ON, newMem, evaluateHeld, CONDS, ACTS, PLANS, FORMS, SPACINGS, COND, ACT, PLAN, FORM, PRESETS, PRESET, actsForTier, presetBrain, defaultSquad, evaluate, shadowedRows, validateUnitBrain, validateSquadBrain, parseBundle, makeBundle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Brain = api;
})(typeof window !== 'undefined' ? window : globalThis);
