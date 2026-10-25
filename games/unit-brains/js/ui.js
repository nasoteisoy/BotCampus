// Editor + arena glue. Icon-first: every control is an icon with at most one short word.
(function () {
  'use strict';
  const B = window.Brain, A = window.Arena;
  const $ = (id) => document.getElementById(id);
  const LS_KEY = 'conquest-commander:brains';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const st = {
    unit: B.presetBrain('rusher'),
    squad: B.defaultSquad(),
    red: B.presetBrain('rusher'), redSquad: B.defaultSquad(),
    sel: 'b0', touchedAt: -1e9, paused: false, speed: 1, lastFiring: null, tab: 'unit',
  };
  const sim = new A.Sim({ seed: 7, blueBrain: st.unit, blueSquad: st.squad, redBrain: st.red, redSquad: st.redSquad });

  // ---------- unit brain editor ----------
  function changed(fromPreset) {
    if (!fromPreset) { st.unit.preset = null; st.unit.name = 'Custom'; st.unit.icon = '🧠'; }
    sim.setBrains(1, st.unit, st.squad);
    st.lastFiring = null;
    renderPresets(); renderRows(); renderSquad();
    if (st.tab === 'json') fillJson();
  }
  function renderPresets() {
    const el = $('presets'); el.innerHTML = '';
    B.PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'pre' + (st.unit.preset === p.id ? ' on' : ''); b.dataset.preset = p.id; b.title = p.name;
      b.innerHTML = `${p.icon}<span>${p.tier > 1 ? '⭐' : ''}${p.name.split(' ')[0]}</span>`;
      b.onclick = () => loadPreset(p.id);
      el.appendChild(b);
    });
  }
  function loadPreset(id) {
    st.unit = B.presetBrain(id);
    const p = B.PRESET[id]; if (p.squadPlan) st.squad.plan = p.squadPlan;
    changed(true);
  }
  function rowEl(row, i, n, shadow) {
    const c = B.COND[row.if], a = B.ACT[row.do];
    const d = document.createElement('div');
    d.className = 'row' + (row.on ? '' : ' off') + (shadow ? ' shadow' : ''); d.dataset.i = i;
    d.innerHTML = `<span class="h" title="Drag">⠿</span><span class="n">${i + 1}</span>
      <button class="pick if" data-k="if" title="IF ${c.label}" aria-label="if ${c.label}">${c.icon}</button><span class="arr">➜</span>
      <button class="pick then" data-k="do" title="THEN ${a.label}" aria-label="then ${a.label}">${a.icon}</button><span class="sp"></span>
      <button class="tog" aria-pressed="${row.on}" title="On / off" aria-label="toggle"></button>
      <button class="sm up" title="Up" aria-label="up" ${i === 0 ? 'disabled' : ''}>▲</button>
      <button class="sm dn" title="Down" aria-label="down" ${i === n - 1 ? 'disabled' : ''}>▼</button>
      <button class="sm del" title="Remove" aria-label="remove" ${n <= 1 ? 'disabled' : ''}>✖</button>`;
    d.querySelector('.pick.if').onclick = () => openSheet('if', i);
    d.querySelector('.pick.then').onclick = () => openSheet('do', i);
    d.querySelector('.tog').onclick = () => { st.unit.rows[i].on = !st.unit.rows[i].on; changed(); };
    d.querySelector('.up').onclick = () => moveRow(i, i - 1);
    d.querySelector('.dn').onclick = () => moveRow(i, i + 1);
    d.querySelector('.del').onclick = () => { if (st.unit.rows.length > 1) { st.unit.rows.splice(i, 1); changed(); } };
    hookDrag(d.querySelector('.h'), d, i);
    return d;
  }
  function renderRows() {
    const el = $('rows'); el.innerHTML = '';
    const rows = st.unit.rows, sh = new Set(B.shadowedRows(st.unit));
    rows.forEach((row, i) => el.appendChild(rowEl(row, i, rows.length, sh.has(i))));
    const def = document.createElement('div');
    def.className = 'fallback'; def.id = 'defRow';
    def.innerHTML = `<span>∅ ➜</span><span style="font-size:20px">${st.squad.follow ? '🧭' : '🏳️'}</span><span>👥</span>`;
    def.title = 'Nothing fires: follow squad plan';
    el.appendChild(def);
    $('btnAdd').disabled = rows.length >= B.MAX_ROWS;
    $('rowCount').textContent = rows.length + '/' + B.MAX_ROWS;
    $('btnTier').setAttribute('aria-pressed', String(st.unit.tier > 1));
  }
  function moveRow(from, to) {
    const rows = st.unit.rows; if (to < 0 || to >= rows.length || from === to) return;
    const [r] = rows.splice(from, 1); rows.splice(to, 0, r); changed();
  }
  function hookDrag(handle, rowDiv, i) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); handle.setPointerCapture(e.pointerId);
      const y0 = e.clientY, list = [...$('rows').querySelectorAll('.row')];
      const mids = list.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
      rowDiv.classList.add('drag');
      const move = (ev) => { rowDiv.style.transform = `translateY(${ev.clientY - y0}px)`; };
      const up = (ev) => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        rowDiv.classList.remove('drag'); rowDiv.style.transform = '';
        const y = mids[i] + (ev.clientY - y0);
        let to = mids.filter((m, k) => k !== i && m < y).length;
        moveRow(i, Math.max(0, Math.min(list.length - 1, to)));
      };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    });
  }
  // icon palette (bottom sheet)
  function openSheet(kind, i) {
    const g = $('sheetGrid'); g.innerHTML = '';
    const cur = st.unit.rows[i][kind];
    const items = kind === 'if' ? B.CONDS : B.ACTS_ON;   // ⭐ actions are cut for now (B.TIER2_ENABLED)
    items.forEach((it) => {
      const locked = kind === 'do' && it.tier > st.unit.tier;
      const b = document.createElement('button');
      b.className = it.id === cur ? 'cur' : ''; b.dataset.id = it.id; b.disabled = locked;
      b.innerHTML = `${locked ? '🔒' : it.icon}<span>${it.label}</span>`;
      b.onclick = () => { st.unit.rows[i][kind] = it.id; closeSheet(); changed(); };
      g.appendChild(b);
    });
    $('sheet').classList.remove('hide'); $('sheet').dataset.kind = kind;
  }
  function closeSheet() { $('sheet').classList.add('hide'); }
  $('sheetX').onclick = closeSheet;
  $('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
  $('btnAdd').onclick = () => { if (st.unit.rows.length < B.MAX_ROWS) { st.unit.rows.push({ if: 'always', do: 'capture', on: true }); changed(); } };
  if (!B.TIER2_ENABLED) $('btnTier').hidden = true;   // ⭐ unlock cut for v1
  $('btnTier').onclick = () => {
    if (st.unit.tier > 1) {
      if (st.unit.rows.some((r) => B.ACT[r.do].tier > 1)) { const b = $('btnTier'); b.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], 200); return; }
      st.unit.tier = 1;
    } else st.unit.tier = 2;
    changed(true);
  };

  ['pointerdown', 'wheel', 'touchstart'].forEach((t) => $('tab-unit').addEventListener(t, () => { st.touchedAt = performance.now(); }, { passive: true }));

  // ---------- squad brain ----------
  const FORM_SVG = {
    line: '<svg viewBox="0 0 44 24"><circle cx="6" cy="12" r="4"/><circle cx="17" cy="12" r="4"/><circle cx="28" cy="12" r="4"/><circle cx="39" cy="12" r="4"/></svg>',
    wedge: '<svg viewBox="0 0 44 24"><circle cx="22" cy="5" r="4"/><circle cx="13" cy="13" r="4"/><circle cx="31" cy="13" r="4"/><circle cx="5" cy="20" r="3.5"/><circle cx="39" cy="20" r="3.5"/></svg>',
    blob: '<svg viewBox="0 0 44 24"><circle cx="18" cy="8" r="4"/><circle cx="27" cy="11" r="4"/><circle cx="15" cy="17" r="4"/><circle cx="24" cy="19" r="3.5"/><circle cx="32" cy="18" r="3"/></svg>',
  };
  const SP_SVG = (g) => `<svg viewBox="0 0 44 24"><circle cx="${22 - g}" cy="12" r="4"/><circle cx="22" cy="12" r="4"/><circle cx="${22 + g}" cy="12" r="4"/></svg>`;
  function optBtn(html, on, onclick, data) { const b = document.createElement('button'); b.className = 'opt' + (on ? ' on' : ''); b.innerHTML = html; b.onclick = onclick; Object.assign(b.dataset, data); return b; }
  function renderSquad() {
    const q = st.squad;
    const pl = $('plans'); pl.innerHTML = '';
    B.PLANS.forEach((p) => pl.appendChild(optBtn(`${p.icon}<span>${p.label}</span>`, q.plan === p.id, () => { q.plan = p.id; changed(true); }, { plan: p.id })));
    const fm = $('forms'); fm.innerHTML = '';
    B.FORMS.forEach((f) => fm.appendChild(optBtn(`<span style="color:#7cc4ff">${FORM_SVG[f.id].replace(/<circle/g, '<circle fill="currentColor"')}</span><span>${f.label}</span>`, q.formation === f.id, () => { q.formation = f.id; changed(true); }, { form: f.id })));
    const spc = $('spaces'); spc.innerHTML = '';
    [[1, 'S', 7], [2, 'M', 11], [3, 'L', 16]].forEach(([v, l, g]) => spc.appendChild(optBtn(`<span style="color:#7cc4ff">${SP_SVG(g).replace(/<circle/g, '<circle fill="currentColor"')}</span><span>${l}</span>`, q.spacing === v, () => { q.spacing = v; changed(true); }, { space: v })));
    $('btnFollow').setAttribute('aria-pressed', String(q.follow));
    $('btnFollow').onclick = () => { q.follow = !q.follow; changed(true); };
    updateGoal();
  }
  function updateGoal() { const g = sim.goal[1]; $('goalLine').textContent = `🔵 ${B.PLAN[st.squad.plan].icon} ➜ ${g ? g.id : '—'}`; }

  // ---------- JSON ----------
  const bundleText = () => JSON.stringify(B.makeBundle(st.unit, st.squad), null, 2);
  function fillJson() { $('jsonBox').value = bundleText(); }
  function msg(ok, text) { const m = $('jsonMsg'); m.className = 'msg ' + (ok ? 'ok' : 'bad'); m.textContent = (ok ? '✅ ' : '❌ ') + text; }
  function applyText(text) {
    const r = B.parseBundle(text);
    if (!r.ok) { msg(false, r.errors.slice(0, 2).join(' · ')); return false; }
    if (r.unit) st.unit = r.unit; if (r.squad) st.squad = r.squad;
    changed(true); fillJson(); msg(true, 'OK'); return true;
  }
  $('btnCopy').onclick = () => {
    fillJson(); const t = $('jsonBox').value;
    const fallback = () => { try { $('jsonBox').select(); document.execCommand('copy'); msg(true, 'Copied'); } catch (e) { msg(false, 'Select + copy'); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => msg(true, 'Copied'), fallback); else fallback();
  };
  $('btnDown').onclick = () => {
    const blob = new Blob([bundleText()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'brains.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); msg(true, 'brains.json');
  };
  $('fileIn').onchange = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => applyText(String(rd.result)); rd.readAsText(f); e.target.value = '';
  };
  $('btnSave').onclick = () => { try { localStorage.setItem(LS_KEY, bundleText()); msg(true, 'Saved'); } catch (e) { msg(false, 'No storage'); } };
  $('btnLoad').onclick = () => { let t = null; try { t = localStorage.getItem(LS_KEY); } catch (e) { t = null; } if (!t) { msg(false, 'Nothing saved'); return; } applyText(t); };
  $('btnApply').onclick = () => applyText($('jsonBox').value);

  // ---------- tabs ----------
  function showTab(t) {
    st.tab = t;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + t));
    if (t === 'json') { fillJson(); $('jsonMsg').textContent = ''; }
  }
  document.querySelectorAll('.tab').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });

  // ---------- arena ----------
  const cv = $('arena'), ctx = cv.getContext('2d');
  let view = { s: 1, ox: 0, oy: 0 };
  function resize() {
    const r = $('arenaWrap').getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    const s = Math.min(cv.width / A.W, cv.height / A.H) * 0.97;
    view = { s, ox: (cv.width - A.W * s) / 2, oy: (cv.height - A.H * s) / 2, dpr };
  }
  new ResizeObserver(resize).observe($('arenaWrap')); resize();
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect(), dpr = view.dpr || 1;
    const wx = ((e.clientX - r.left) * dpr - view.ox) / view.s, wy = ((e.clientY - r.top) * dpr - view.oy) / view.s;
    let best = null, bd = e.pointerType === 'touch' ? 8 : 5;
    for (const u of sim.units) if (u.team === 1) { const d = Math.hypot(u.x - wx, u.y - wy); if (d < bd) { bd = d; best = u; } }
    st.sel = best ? best.id : null; st.lastFiring = null;
  });
  $('btnPause').onclick = () => { st.paused = !st.paused; $('btnPause').textContent = st.paused ? '▶️' : '⏸️'; };
  $('btnSpeed').onclick = () => { st.speed = st.speed === 1 ? 2 : st.speed === 2 ? 4 : 1; $('spd').textContent = st.speed; };
  $('btnReset').onclick = () => { sim.reset({ ...sim.opts, blueBrain: st.unit, blueSquad: st.squad }); st.lastFiring = null; };

  function selUnit() { return st.sel ? sim.units.find((u) => u.id === st.sel) : null; }
  function updateFiring() {
    const u = selUnit();
    const key = u ? (u.alive ? String(u.row) : 'dead') : 'none';
    const chip = $('selChip');
    if (key !== st.lastFiring) {
      st.lastFiring = key;
      document.querySelectorAll('#rows .row').forEach((r) => r.classList.toggle('firing', !!u && u.alive && +r.dataset.i === u.row));
      // keep the glowing row on screen (short phones) unless the player scrolled/touched the list in the last 3 s
      const fr = document.querySelector('#rows .row.firing'), pane = $('tab-unit');
      if (fr && st.tab === 'unit' && performance.now() - st.touchedAt > 3000) {
        const a = fr.getBoundingClientRect(), b = pane.getBoundingClientRect();
        if (a.top < b.top || a.bottom > b.bottom) pane.scrollTop += a.top < b.top ? a.top - b.top - 4 : a.bottom - b.bottom + 4;
      }
      const def = $('defRow'); if (def) def.classList.toggle('firingDef', !!u && u.alive && u.row === -1);
      if (!u) chip.classList.add('hide');
      else {
        chip.classList.remove('hide');
        if (!u.alive) chip.innerHTML = '<span class="k">★</span>💀';
        else if (u.row < 0) chip.innerHTML = `<span class="k">∅</span>➜ ${st.squad.follow ? '🧭' : '🏳️'}`;
        else if (!st.unit.rows[u.row]) chip.innerHTML = '<span class="k">…</span>';
        else { const row = st.unit.rows[u.row]; chip.innerHTML = `<span class="k">#${u.row + 1}</span>${B.COND[row.if].icon} ➜ ${B.ACT[row.do].icon}`; }
      }
    }
    $('hint').classList.toggle('hide', !!u);
  }
  let last = performance.now(), acc = 0, goalTick = 0;
  function frame(now) {
    const el = Math.min(0.1, (now - last) / 1000); last = now;
    if (!st.paused) { acc += el * st.speed; let n = 0; while (acc >= A.DT && n < 24) { sim.step(A.DT); acc -= A.DT; n++; } if (n >= 24) acc = 0; }
    A.draw(ctx, sim, view, st.sel, now);
    updateFiring();
    if ((goalTick += el) > 0.25) { goalTick = 0; const s = sim.score(); $('sb').textContent = s[1]; $('sr').textContent = s[2]; updateGoal(); }
    requestAnimationFrame(frame);
  }

  renderPresets(); renderRows(); renderSquad(); showTab('unit');
  requestAnimationFrame(frame);

  // test / debug hook
  window.__ub = {
    sim, st, B, A,
    unit: () => clone(st.unit), squad: () => clone(st.squad),
    setUnit: (b) => { st.unit = clone(b); changed(true); }, setSquad: (q) => { st.squad = clone(q); changed(true); },
    select: (id) => { st.sel = id; st.lastFiring = null; }, pause: (p) => { st.paused = p; $('btnPause').textContent = p ? '▶️' : '⏸️'; },
    step: (n) => { for (let i = 0; i < n; i++) sim.step(A.DT); },
    reset: (o = {}) => { sim.reset({ ...sim.opts, ...o, blueBrain: st.unit, blueSquad: st.squad }); st.lastFiring = null; },
    showTab, bundleText, applyText,
    firingIndex: () => { const r = document.querySelector('#rows .row.firing'); return r ? +r.dataset.i : -1; },
  };
})();
