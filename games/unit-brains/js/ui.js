// Editor + arena glue. Icon-first: every control is an icon with at most one short word.
(function () {
  'use strict';
  const B = window.Brain, A = window.Arena;
  const $ = (id) => document.getElementById(id);
  const LS_KEY = 'conquest-commander:brains';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const st = {
    unit: B.newBrain(),
    squad: B.defaultSquad(),
    red: B.enemyBrain(), redSquad: B.defaultSquad(),
    sel: 'b0', touchedAt: -1e9, paused: false, speed: 1, lastFiring: null, tab: 'unit',
  };
  const sim = new A.Sim({ seed: 7, blueBrain: st.unit, blueSquad: st.squad, redBrain: st.red, redSquad: st.redSquad });

  // ---------- unit brain editor ----------
  // src: undefined = the player edited a row (→ autosave); 'load' = a brain was opened (no save)
  function changed(src) {
    sim.setBrains(1, st.unit, st.squad);
    st.lastFiring = null;
    renderRows(); renderSquad();
    if (src !== 'load') autosave();
  }
  function rowEl(row, i, n, shadow) {
    const c = B.COND[row.if], a = B.ACT[row.do];
    const d = document.createElement('div');
    d.className = 'row' + (row.on ? '' : ' off') + (shadow ? ' shadow' : ''); d.dataset.i = i;
    d.innerHTML = `<span class="h" title="Drag">⠿</span><span class="n">${i + 1}</span>
      <button class="pick if" data-k="if" title="IF ${c.label}" aria-label="if ${c.label}">${c.icon}<small>${c.label}</small></button><span class="arr">➜</span>
      <button class="pick then" data-k="do" title="THEN ${a.label}" aria-label="then ${a.label}">${a.icon}<small>${a.label}</small></button><span class="sp"></span>
      <button class="tog" aria-pressed="${row.on}" title="Row on / off" aria-label="toggle row"></button>
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
    def.innerHTML = `<span>No row fits ➜</span><span style="font-size:20px">🏳️</span><span>head for the next post</span>`;
    def.title = 'When no row fires, the trooper captures posts';
    el.appendChild(def);
    $('btnAdd').disabled = rows.length >= B.MAX_ROWS;
    $('rowCount').textContent = rows.length + '/' + B.MAX_ROWS;
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
    const items = kind === 'if' ? B.CONDS : B.ACTS_ON;   // every action works
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = it.id === cur ? 'cur' : ''; b.dataset.id = it.id;
      b.innerHTML = `${it.icon}<span>${it.label}</span>`;
      b.onclick = () => { st.unit.rows[i][kind] = it.id; closeSheet(); changed(); };
      g.appendChild(b);
    });
    $('sheet').classList.remove('hide'); $('sheet').dataset.kind = kind;
  }
  function closeSheet() { $('sheet').classList.add('hide'); }
  $('sheetX').onclick = closeSheet;
  $('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
  $('btnAdd').onclick = () => { if (st.unit.rows.length < B.MAX_ROWS) { st.unit.rows.push({ if: 'always', do: 'capture', on: true }); changed(); } };

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
    B.PLANS.forEach((p) => pl.appendChild(optBtn(`${p.icon}<span>${p.label}</span>`, q.plan === p.id, () => { q.plan = p.id; changed('load'); }, { plan: p.id })));
    const fm = $('forms'); fm.innerHTML = '';
    B.FORMS.forEach((f) => fm.appendChild(optBtn(`<span style="color:#7cc4ff">${FORM_SVG[f.id].replace(/<circle/g, '<circle fill="currentColor"')}</span><span>${f.label}</span>`, q.formation === f.id, () => { q.formation = f.id; changed('load'); }, { form: f.id })));
    const spc = $('spaces'); spc.innerHTML = '';
    [[1, 'S', 7], [2, 'M', 11], [3, 'L', 16]].forEach(([v, l, g]) => spc.appendChild(optBtn(`<span style="color:#7cc4ff">${SP_SVG(g).replace(/<circle/g, '<circle fill="currentColor"')}</span><span>${l}</span>`, q.spacing === v, () => { q.spacing = v; changed('load'); }, { space: v })));
    $('btnFollow').setAttribute('aria-pressed', String(q.follow));
    $('btnFollow').onclick = () => { q.follow = !q.follow; changed('load'); };
    updateGoal();
  }
  function updateGoal() { const g = sim.goal[1]; $('goalLine').textContent = `🔵 ${B.PLAN[st.squad.plan].icon} ➜ ${g ? g.id : '—'}`; }

  // ---------- autosave (no Save tab: ✓ Saved chip) ----------
  // With an army picked, army-picker.js saves the brain onto that trooper (window.__ub.onEdit). Without one, the
  // brain is kept in this browser under LS_KEY (same bundle format as before, so old saves still load).
  const bundleText = () => JSON.stringify(B.makeBundle(st.unit, st.squad), null, 2);
  let saveT = 0, chipT = 0;
  function flashSaved(ok = true, text) { const c = $('savedChip'); c.textContent = ok ? '✓ Saved' : '⚠️ ' + (text || 'Not saved'); c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); clearTimeout(chipT); chipT = setTimeout(() => c.classList.remove('on'), 1800); }
  function autosave() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      if (window.__ub.onEdit) { window.__ub.onEdit(); return; }
      try { localStorage.setItem(LS_KEY, bundleText()); flashSaved(true); } catch (e) { flashSaved(false, 'No storage'); }
    }, 250);
  }
  function applyText(text) {
    const r = B.parseBundle(text);
    if (!r.ok) return false;
    if (r.unit) st.unit = r.unit; if (r.squad) st.squad = r.squad;
    changed('load'); return true;
  }
  { let t = null; try { t = localStorage.getItem(LS_KEY); } catch (e) { t = null; } if (t) applyText(t); }

  // ---------- tabs ----------
  function showTab(t) {
    st.tab = t;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + t));
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
  const pauseLbl = (p) => { $('btnPause').innerHTML = p ? '▶️<small>Play</small>' : '⏸️<small>Pause</small>'; };
  $('btnPause').onclick = () => { st.paused = !st.paused; pauseLbl(st.paused); };
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
        if (!u.alive) chip.innerHTML = '💀 Taken out — respawning';
        else if (u.row < 0) chip.innerHTML = 'No row fits ➜ 🏳️ capturing';
        else if (!st.unit.rows[u.row]) chip.innerHTML = '…';
        else { const row = st.unit.rows[u.row]; chip.innerHTML = `Row ${u.row + 1}: ${B.COND[row.if].icon} ${B.COND[row.if].label} ➜ ${B.ACT[row.do].icon} ${B.ACT[row.do].label}`; }
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

  renderRows(); renderSquad(); showTab('unit');
  // ⬅️ Back (top-left) and ✅ Done (bottom-right): inside Army HQ go back to its menu, else to the Army HQ page
  const HQ = (() => { try { return window.parent !== window && window.parent.__armyMenu ? window.parent.__armyMenu : null; } catch (e) { return null; } })();
  const goBack = (e) => { if (e) e.preventDefault(); clearTimeout(saveT); if (window.__ub.onEdit) window.__ub.onEdit(true); if (HQ) HQ.goHome(); else location.href = '../army/'; };
  $('navBack').addEventListener('click', goBack); document.querySelector('.crumbs a').addEventListener('click', goBack);
  $('doneBtn').addEventListener('click', () => { flashSaved(true); setTimeout(goBack, 350); });
  requestAnimationFrame(frame);

  // test / debug hook
  window.__ub = {
    sim, st, B, A,
    unit: () => clone(st.unit), squad: () => clone(st.squad),
    setUnit: (b) => { st.unit = clone(b); changed('load'); }, setSquad: (q) => { st.squad = clone(q); changed('load'); },
    select: (id) => { st.sel = id; st.lastFiring = null; }, pause: (p) => { st.paused = p; pauseLbl(p); },
    step: (n) => { for (let i = 0; i < n; i++) sim.step(A.DT); },
    reset: (o = {}) => { sim.reset({ ...sim.opts, ...o, blueBrain: st.unit, blueSquad: st.squad }); st.lastFiring = null; },
    showTab, bundleText, applyText, flashSaved, onEdit: null,
    firingIndex: () => { const r = document.querySelector('#rows .row.firing'); return r ? +r.dataset.i : -1; },
  };
})();
