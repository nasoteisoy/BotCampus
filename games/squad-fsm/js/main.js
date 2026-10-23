// Squad FSM: editor + battle UI
import { STATES, STATE_KEYS, CONDS, COND_KEYS, ROLES, ROLE_KEYS, ENEMIES, MISSIONS, PARAM_ICON, tutorialFSM, starterFSM, blankFSM } from './data.js';
import { Battle, MW, MH } from './sim.js';

const $ = id => document.getElementById(id);
const LS = { cur: 'sfsm-current', slots: 'sfsm-slots', prog: 'sfsm-progress', mis: 'sfsm-mission' };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const clone = o => JSON.parse(JSON.stringify(o));
let nid = Date.now() % 100000;
const newId = p => p + (++nid).toString(36);

const G = {
  fsm: validFSM(load(LS.cur, null)) || starterFSM(),
  role: null, sel: null, selT: null, connect: null, moveMode: false,
  mi: Math.min(load(LS.mis, 0), MISSIONS.length - 1), prog: load(LS.prog, {}),
  battle: null, running: false, speeds: [1, 0.5, 0.25, 2], spI: 0, tab: 'ed',
};
function validFSM(f) { return f && Array.isArray(f.states) && f.states.length && Array.isArray(f.trans) && f.start ? (f.roles = f.roles || {}, f) : null; }
function persist() { save(LS.cur, G.fsm); }
function curFSM() { return (G.role && G.fsm.roles[G.role]) || G.fsm; }

// ---------------- tabs ----------------
function isSplit() { return matchMedia('(min-width:900px) and (min-height:560px)').matches; }
function showTab(t) {
  G.tab = t;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === t);
  for (const p of ['ed', 'bfPane', 'logPane']) $(p).classList.toggle('show', isSplit() || p === t);
  resize(); renderGraph();
}
for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => showTab(b.dataset.tab);

// ---------------- popup picker ----------------
function pick(items, cb) {
  const el = $('pick'); el.innerHTML = '';
  for (const it of items) { const b = document.createElement('button'); b.innerHTML = `${it.icon}<small>${it.name}</small>`; b.dataset.k = it.k; b.onclick = e => { e.stopPropagation(); el.classList.add('hidden'); cb(it.k); }; el.appendChild(b); }
  const x = document.createElement('button'); x.innerHTML = '✕<small>close</small>'; x.dataset.k = 'close'; x.onclick = e => { e.stopPropagation(); el.classList.add('hidden'); }; el.appendChild(x);
  el.classList.remove('hidden');
}

// ---------------- graph editor ----------------
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (t, a = {}, p) => { const e = document.createElementNS(SVGNS, t); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const ANY = { id: 'any', x: 26, y: 26 };
const R = 25;
function nodePos(f, id) { return id === 'any' ? ANY : f.states.find(s => s.id === id); }
function liveCounts() {
  const m = {}; const b = G.battle; if (!b) return m;
  for (const u of b.units) if (u.player && !u.vipUnit && !u.dead && !u.down) {
    if (G.role ? u.role !== G.role || !G.fsm.roles[G.role] : G.fsm.roles[u.role]) continue;
    (m[u.state] = m[u.state] || []).push(u);
  }
  return m;
}
function condLabel(t) { const C = CONDS[t.cond]; return (t.neg ? '🚫' : '') + C.icon + (C.v != null ? (t.cond === 'hp' || t.cond === 'ammo' || t.cond === 'squad' ? '<' : t.cond === 'count' || t.cond === 'timer' ? '>' : '') + t.v + (C.unit || '') : ''); }
function prioOf(f, t) { return f.trans.filter(o => o.from === t.from).indexOf(t) + 1; }
let lastGraphKey = '';
function renderGraph(force) {
  const f = curFSM(); const svg = $('graph');
  const live = liveCounts(); const lf = G.battle && G.battle.lastFire && G.battle.t - G.battle.lastFire.t < 0.7 ? G.battle.lastFire.tid : null;
  const key = JSON.stringify([f, G.sel, G.selT, G.connect, G.role, Object.entries(live).map(([k, v]) => k + v.map(u => u.role).join()), lf, G.moveMode]);
  if (!force && key === lastGraphKey) return; lastGraphKey = key;
  svg.innerHTML = '';
  svgEl('defs', {}, svg).innerHTML = '<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8fa3b5"/></marker><marker id="ahs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ffd65a"/></marker>';
  const ge = svgEl('g', {}, svg), gc = svgEl('g', {}, svg), gn = svgEl('g', {}, svg);
  const pairCount = {};
  for (const t of f.trans) {
    const a = nodePos(f, t.from), b = nodePos(f, t.to); if (!a || !b) continue;
    const k = [t.from, t.to].sort().join('|'); const n = pairCount[k] = (pairCount[k] || 0) + 1;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const rev = f.trans.some(o => o.from === t.to && o.to === t.from);
    const bend = (rev ? 22 : 0) + (n - 1) * 18; // curve sideways for two-way / parallel arrows
    const px = -uy * bend, py = ux * bend;
    const x1 = a.x + ux * R, y1 = a.y + uy * R, x2 = b.x - ux * (R + 2), y2 = b.y - uy * (R + 2);
    const cx = (x1 + x2) / 2 + px, cy = (y1 + y2) / 2 + py;
    const sel = G.selT === t.id;
    svgEl('path', { d: `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`, class: 'edge' + (lf === t.id ? ' flash' : '') + (sel ? ' sel' : ''), 'marker-end': sel ? 'url(#ahs)' : 'url(#ah)' }, ge);
    const mx = (x1 + 2 * cx + x2) / 4, my = (y1 + 2 * cy + y2) / 4;
    const lbl = prioOf(f, t) + ' ' + condLabel(t);
    const w = 14 + lbl.length * 6.2;
    const chip = svgEl('g', { class: 'chip' + (sel ? ' sel' : ''), 'data-t': t.id, transform: `translate(${mx} ${my})` }, gc);
    svgEl('rect', { x: -w / 2, y: -11, width: w, height: 22, rx: 11 }, chip);
    svgEl('text', {}, chip).textContent = lbl;
    chip.addEventListener('click', e => { e.stopPropagation(); G.sel = t.from; G.selT = t.id; renderAll(); });
  }
  const all = [ANY, ...f.states];
  for (const s of all) {
    const isAny = s.id === 'any'; const S = isAny ? { icon: '✳', name: 'Any', col: '#3b4855' } : STATES[s.type];
    const lv = live[s.id];
    const g = svgEl('g', { class: 'node' + (G.sel === s.id ? ' sel' : '') + (lv ? ' live' : ''), 'data-s': s.id, transform: `translate(${s.x} ${s.y})` }, gn);
    svgEl('circle', { class: 'c', r: isAny ? 18 : R, fill: S.col, opacity: G.battle && G.battle.t > 0 && !lv && !isAny ? 0.55 : 1 }, g);
    if (s.id === f.start) svgEl('circle', { r: R + 5, fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-dasharray': '4 3' }, g);
    svgEl('text', { 'font-size': isAny ? 16 : 22 }, g).textContent = S.icon;
    svgEl('text', { class: 'lbl', y: isAny ? 27 : 36 }, g).textContent = S.name;
    if (lv) { const bt = svgEl('text', { class: 'badge', y: -R - 9 }, g); bt.textContent = lv.map(u => ROLES[u.role].icon).join(''); }
    attachNode(g, s);
  }
  $('hint').textContent = G.connect ? '🎯 tap the target state' : G.moveMode ? '✋ drag states' : '';
}
function svgPt(e) { const svg = $('graph'); const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function attachNode(g, s) {
  g.addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (G.moveMode && s.id !== 'any') {
      const start = svgPt(e), ox = s.x, oy = s.y; let moved = false;
      const mv = ev => { const p = svgPt(ev); s.x = Math.max(28, Math.min(372, ox + p.x - start.x)); s.y = Math.max(28, Math.min(372, oy + p.y - start.y)); moved = true; renderGraph(); };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) persist(); else tapNode(s); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      return;
    }
  });
  g.addEventListener('click', e => { e.stopPropagation(); if (!G.moveMode || s.id === 'any') tapNode(s); });
}
function tapNode(s) {
  const f = curFSM();
  if (G.connect) {
    if (s.id !== 'any') { const t = { id: newId('t'), from: G.connect, to: s.id, cond: 'seen', v: null, neg: false }; f.trans.push(t); G.selT = t.id; G.sel = G.connect; persist(); }
    G.connect = null; renderAll(); return;
  }
  G.sel = s.id; G.selT = null; renderAll();
}
$('graph').addEventListener('click', () => { if (G.connect) { G.connect = null; } else { G.sel = null; G.selT = null; } renderAll(); });

// ---------------- inspector ----------------
function btn(html, cls, fn, title) { const b = document.createElement('button'); b.innerHTML = html; if (cls) b.className = cls; if (title) b.title = title; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; }
function renderInsp() {
  const el = $('insp'); el.innerHTML = ''; const f = curFSM();
  if (G.role && !G.fsm.roles[G.role]) {
    const R0 = ROLES[G.role]; const d = document.createElement('div');
    d.innerHTML = `<h3>${R0.icon} ${R0.name}</h3><div class="muted">👥 uses the squad FSM</div>`; el.appendChild(d);
    el.appendChild(btn('✏️ Own FSM', 'opt', () => { const c = clone(G.fsm); delete c.roles; c.roles = {}; G.fsm.roles[G.role] = c; persist(); renderAll(); }, 'Give this role its own FSM'));
    return;
  }
  const head = document.createElement('div'); head.className = 'row';
  if (G.role) head.appendChild(btn('🗑 ' + ROLES[G.role].icon + ' override', 'opt', () => { delete G.fsm.roles[G.role]; persist(); renderAll(); }, 'Remove role override'));
  if (!G.sel) {
    const d = document.createElement('div'); d.className = 'muted'; d.textContent = '👆 tap a state'; el.appendChild(d);
    el.appendChild(head); allRules(el, f); return;
  }
  const isAny = G.sel === 'any'; const s = isAny ? null : f.states.find(x => x.id === G.sel);
  if (!isAny && !s) { G.sel = null; return renderInsp(); }
  const S = isAny ? { icon: '✳', name: 'Any state' } : STATES[s.type];
  const h = document.createElement('h3'); h.innerHTML = `<span style="font-size:22px">${S.icon}</span> ${S.name}`; el.appendChild(h);
  const tools = document.createElement('div'); tools.className = 'row';
  tools.appendChild(btn('➕↗', 'opt' + (G.connect ? ' on' : ''), () => { G.connect = G.connect ? null : G.sel; renderAll(); }, 'New arrow from here'));
  if (!isAny) {
    tools.appendChild(btn('⭐', 'opt' + (f.start === s.id ? ' on' : ''), () => { f.start = s.id; persist(); renderAll(); }, 'Start state'));
    tools.appendChild(btn('🗑', 'opt', () => {
      if (f.states.length <= 1) return;
      f.states = f.states.filter(x => x !== s); f.trans = f.trans.filter(t => t.from !== s.id && t.to !== s.id);
      if (f.start === s.id) f.start = f.states[0].id; G.sel = null; persist(); renderAll();
    }, 'Delete state'));
  }
  if (G.role) tools.appendChild(btn('🗑 ' + ROLES[G.role].icon, 'opt', () => { delete G.fsm.roles[G.role]; persist(); renderAll(); }, 'Remove role override'));
  el.appendChild(tools);
  if (!isAny) {
    const P = STATES[s.type].params;
    for (const k in P) {
      const r = document.createElement('div'); r.className = 'row';
      for (const o of P[k]) { const cur = (s.params[k] || P[k][0]) === o; r.appendChild(btn(`${PARAM_ICON[o] || ''} ${o}`, 'opt' + (cur ? ' on' : ''), () => { s.params[k] = o; persist(); renderAll(); })); }
      el.appendChild(r);
    }
  }
  const lst = f.trans.filter(t => t.from === G.sel);
  const cap = document.createElement('div'); cap.className = 'muted'; cap.textContent = lst.length ? '↗ leave when… (1 = first)' : '↗ no arrows yet: tap ➕↗'; el.appendChild(cap);
  el.appendChild(transList(f, lst));
}
function allRules(el, f) {
  const cap = document.createElement('div'); cap.className = 'muted'; cap.style.marginTop = '6px'; cap.textContent = '📋 all arrows'; el.appendChild(cap);
  el.appendChild(transList(f, [...f.trans].sort((a, b) => (a.from === 'any' ? -1 : f.states.findIndex(s => s.id === a.from)) - (b.from === 'any' ? -1 : f.states.findIndex(s => s.id === b.from))), true));
}
function stIcon(f, id) { if (id === 'any') return '✳'; const s = f.states.find(x => x.id === id); return s ? STATES[s.type].icon : '?'; }
function transList(f, lst, showFrom) {
  const ul = document.createElement('ul'); ul.className = 'tlist';
  for (const t of lst) {
    const li = document.createElement('li'); li.dataset.t = t.id; if (G.selT === t.id) li.classList.add('sel');
    const C = CONDS[t.cond];
    const pr = document.createElement('span'); pr.className = 'pr'; pr.textContent = prioOf(f, t); li.appendChild(pr);
    if (showFrom) { const fs = document.createElement('span'); fs.textContent = stIcon(f, t.from) + '→'; li.appendChild(fs); }
    li.appendChild(btn('▲', 'up', () => movePrio(f, t, -1), 'Higher priority'));
    li.appendChild(btn('▼', 'dn', () => movePrio(f, t, 1), 'Lower priority'));
    li.appendChild(btn('🚫', 'neg' + (t.neg ? ' on' : ''), () => { t.neg = !t.neg; persist(); renderAll(); }, 'NOT'));
    li.appendChild(btn(`${C.icon} <small>${C.name}</small>`, 'cond', () => pick(COND_KEYS.map(k => ({ k, icon: CONDS[k].icon, name: CONDS[k].name })), k => { t.cond = k; t.v = CONDS[k].v ?? null; G.selT = t.id; persist(); renderAll(); }), 'Condition'));
    if (C.v != null) {
      li.appendChild(btn('−', 'minus', () => { t.v = Math.max(C.min, t.v - C.step); persist(); renderAll(); }));
      const v = document.createElement('span'); v.className = 'val'; v.textContent = t.v + (C.unit || ''); li.appendChild(v);
      li.appendChild(btn('+', 'plus', () => { t.v = Math.min(C.max, t.v + C.step); persist(); renderAll(); }));
    }
    li.appendChild(btn('→ ' + stIcon(f, t.to), 'to', () => pick(f.states.map(s => ({ k: s.id, icon: STATES[s.type].icon, name: STATES[s.type].name })), k => { t.to = k; persist(); renderAll(); }), 'Go to state'));
    li.appendChild(btn('✖', 'del', () => { f.trans = f.trans.filter(x => x !== t); persist(); renderAll(); }, 'Delete arrow'));
    li.onclick = () => { G.selT = t.id; G.sel = t.from; renderAll(); };
    ul.appendChild(li);
  }
  return ul;
}
function movePrio(f, t, dir) {
  const same = f.trans.filter(o => o.from === t.from); const i = same.indexOf(t), j = i + dir;
  if (j < 0 || j >= same.length) return;
  const a = f.trans.indexOf(t), b = f.trans.indexOf(same[j]); [f.trans[a], f.trans[b]] = [f.trans[b], f.trans[a]];
  G.selT = t.id; persist(); renderAll();
}
function renderRoles() {
  const el = $('roles'); el.innerHTML = '';
  const mk = (k, icon, title) => { const b = btn(icon, (G.role === k ? 'on' : '') + (k && G.fsm.roles[k] ? ' ov' : ''), () => { G.role = k; G.sel = null; G.selT = null; G.connect = null; renderAll(); }, title); b.dataset.role = k || 'squad'; el.appendChild(b); };
  mk(null, '👥', 'Whole squad');
  for (const k of ROLE_KEYS) mk(k, ROLES[k].icon, ROLES[k].name);
}
$('bAdd').onclick = () => pick(STATE_KEYS.map(k => ({ k, icon: STATES[k].icon, name: STATES[k].name })), k => {
  const f = curFSM(); let x = 200, y = 200, tries = 0;
  while (tries++ < 60 && [ANY, ...f.states].some(s => Math.hypot(s.x - x, s.y - y) < 70)) { x = 50 + Math.random() * 300; y = 50 + Math.random() * 300; }
  const s = { id: newId('s'), type: k, x, y, params: {} }; f.states.push(s); G.sel = s.id; G.selT = null; persist(); renderAll();
});
$('bMove').onclick = () => { G.moveMode = !G.moveMode; $('bMove').classList.toggle('on', G.moveMode); renderGraph(true); };

// ---------------- battle ----------------
const cv = $('cv'), ctx = cv.getContext('2d');
let view = { s: 1, ox: 0, oy: 0 };
function resize() {
  const r = $('bf').getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
  if (!r.width) return;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  // portrait screens: turn the map 90° so it fills the phone (start at top, enemy at the bottom)
  const rot = r.height > r.width * 1.15;
  const mw = rot ? MH : MW, mh = rot ? MW : MH;
  const s = Math.min(r.width / (mw + 4), r.height / (mh + 4));
  view = { s: s * dpr, ox: (r.width - mw * s) / 2 * dpr, oy: (r.height - mh * s) / 2 * dpr, dpr, rot };
}
addEventListener('resize', () => { showTab(G.tab); });
function newBattle() {
  G.battle = new Battle(MISSIONS[G.mi], G.fsm); G.running = false; G.acc = 0; G.seenLog = 0;
  $('log').innerHTML = ''; $('endCard').classList.add('hidden'); updHud(); renderGraph(true);
}
function setFSM(f) { G.fsm = f; G.fsm.roles = G.fsm.roles || {}; if (G.battle) G.battle.fsm = f; G.sel = null; G.selT = null; G.role = null; persist(); renderAll(); }
function updHud() {
  const m = MISSIONS[G.mi]; $('misName').textContent = m.icon + ' ' + (G.mi + 1) + '. ' + m.name;
  const b = G.battle; $('clock').textContent = '⏱ ' + (b ? Math.floor(b.t) : 0) + '/' + m.time;
  $('bPlay').textContent = G.running ? '⏸' : '▶'; $('bSpeed').textContent = '×' + G.speeds[G.spI];
}
const STEP = 0.05;
function advance(sec) { const b = G.battle; let n = Math.round(sec / STEP); while (n-- > 0 && !b.over) b.step(STEP); afterStep(); }
function afterStep() {
  const b = G.battle; flushLog();
  if (b.over && !G.endShown) { G.endShown = true; G.running = false; showEnd(); }
  updHud();
}
$('bPlay').onclick = () => { const b = G.battle; if (b.over) { newBattle(); } G.running = !G.running; if (G.running) { G.endShown = false; if (!isSplit() && G.tab === 'ed') showTab('bfPane'); } updHud(); };
$('bStep').onclick = () => { G.running = false; if (!G.battle.over) advance(0.2); renderGraph(); };
$('bSpeed').onclick = () => { G.spI = (G.spI + 1) % G.speeds.length; updHud(); };
$('bRestart').onclick = () => { G.endShown = false; newBattle(); };
function showEnd() {
  const o = G.battle.over, m = MISSIONS[G.mi], el = $('endCard');
  if (o.win) { const p = G.prog[m.id] || 0; if (o.stars > p) { G.prog[m.id] = o.stars; save(LS.prog, G.prog); } }
  el.innerHTML = `<div class="big">${o.win ? '🏆' : '💀'}</div><div class="stars">${o.win ? '⭐'.repeat(o.stars) + '☆'.repeat(3 - o.stars) : ''}</div>
   <div class="muted">${o.win ? '✅' : '❌'} ${o.why} · 🧍 ${o.alive}/${o.alive + o.lost} · ⏱ ${Math.round(o.t)}s</div>`;
  const r = document.createElement('div'); r.className = 'row'; r.style.justifyContent = 'center';
  r.appendChild(btn('↺', 'opt', () => { G.endShown = false; newBattle(); }, 'Retry'));
  r.appendChild(btn('🧠', 'opt', () => showTab('ed'), 'Edit FSM'));
  if (o.win && G.mi < MISSIONS.length - 1) r.appendChild(btn('▶ ' + MISSIONS[G.mi + 1].icon, 'opt', () => selectMission(G.mi + 1), 'Next mission'));
  el.appendChild(r); el.className = 'endcard ' + (o.win ? 'win' : 'lose');
}
function fmtLog(e) {
  const ic = ROLES[e.role] ? ROLES[e.role].icon : '🆘';
  if (e.from === 'down') return `${ic} ${e.who} 💀 down`;
  if (e.from === 'dead') return `${ic} ${e.who} ✝ lost`;
  if (e.from === 'up') return `${ic} ${e.who} 🩹 back up (${e.by})`;
  const w = e.why ? ' (' + condLabel(e.why) + ' ' + CONDS[e.why.cond].name + ')' : '';
  return `${ic} ${e.who}: ${STATES[e.from] ? STATES[e.from].icon + ' ' + STATES[e.from].name : '?'} → ${STATES[e.to].icon} ${STATES[e.to].name}${w}`;
}
function flushLog() {
  const b = G.battle; const ol = $('log');
  while (G.seenLog < b.log.length) {
    const e = b.log[G.seenLog++]; const li = document.createElement('li');
    li.innerHTML = `<span class="tt">${e.t.toFixed(1)}</span><span></span>`; li.lastChild.textContent = fmtLog(e); ol.prepend(li);
    if (ol.children.length > 200) ol.lastChild.remove();
  }
  $('logN').textContent = b.log.length;
  const tk = $('ticker'); tk.innerHTML = '';
  for (const e of b.log.slice(-3)) { const d = document.createElement('div'); d.textContent = fmtLog(e); tk.appendChild(d); }
}
$('bLogClr').onclick = () => { $('log').innerHTML = ''; };

function draw() {
  const b = G.battle; if (!b || window.__noRender) return;
  const W = cv.width, H = cv.height; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#10161c'; ctx.fillRect(0, 0, W, H);
  const { s, ox, oy, rot } = view; if (rot) ctx.setTransform(0, s, -s, 0, ox + s * MH, oy); else ctx.setTransform(s, 0, 0, s, ox, oy);
  const txt = (t, x, y) => { if (!rot) return ctx.fillText(t, x, y); ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2); ctx.fillText(t, 0, 0); ctx.restore(); };
  ctx.fillStyle = '#3d4a35'; ctx.fillRect(0, 0, MW, MH);
  ctx.strokeStyle = '#ffffff10'; ctx.lineWidth = 0.1; for (let x = 0; x <= MW; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MH); ctx.stroke(); } for (let y = 0; y <= MH; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MW, y); ctx.stroke(); }
  const m = b.m;
  // patrol route
  ctx.strokeStyle = '#5aa9ff66'; ctx.lineWidth = 0.4; ctx.setLineDash([1.5, 1.5]); ctx.beginPath(); ctx.moveTo(m.start[0], m.start[1]); for (const [x, y] of m.path) ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
  if (m.zone) { ctx.fillStyle = m.goal === 'hold' ? '#ffd65a22' : '#5fd39a22'; ctx.strokeStyle = m.goal === 'hold' ? '#ffd65a' : '#5fd39a'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.arc(m.zone[0], m.zone[1], m.zone[2], 0, 7); ctx.fill(); ctx.stroke(); }
  for (const r of m.blocks) { ctx.fillStyle = '#2a2f36'; ctx.fillRect(r[0], r[1], r[2], r[3]); ctx.fillStyle = '#4b535e'; ctx.fillRect(r[0] + 0.6, r[1] + 0.6, r[2] - 1.2, r[3] - 1.2); }
  for (const r of m.walls) { ctx.fillStyle = '#9a8a6a'; ctx.fillRect(r[0], r[1], r[2], r[3]); ctx.strokeStyle = '#5c5240'; ctx.lineWidth = 0.25; ctx.strokeRect(r[0], r[1], r[2], r[3]); }
  for (const f of b.fx) {
    if (f.k === 'shot') { ctx.strokeStyle = f.p ? '#fff3a0' : '#ff8a7a'; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke(); }
    else if (f.k === 'boom') { ctx.fillStyle = `rgba(255,${120 + 100 * f.t},40,${f.t})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.2 - f.t), 0, 7); ctx.fill(); }
    else if (f.k === 'heal') { ctx.fillStyle = '#ff9ad5'; ctx.font = '2.4px sans-serif'; txt('✚', f.x + 1, f.y - 2 - (1 - f.t) * 2); }
  }
  for (const g of b.nades || []) { const k = 1 - g.t / g.T; const x = g.sx + (g.x - g.sx) * k, y = g.sy + (g.y - g.sy) * k - Math.sin(k * Math.PI) * 4; ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x, y, 0.6, 0, 7); ctx.fill(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const u of b.units) {
    if (u.dead) { ctx.fillStyle = '#0006'; ctx.font = '2px sans-serif'; txt('✝', u.x, u.y); continue; }
    if (!u.player && u.hidden && b.t - u.firedT > 1.5 && !b.units.some(o => o.player && o.seen.includes(u))) { ctx.globalAlpha = 0.25; }
    const col = u.vipUnit ? '#ff9ad5' : u.player ? '#4aa3ff' : '#e5534b';
    ctx.fillStyle = col; ctx.strokeStyle = u.inCover ? '#8fd18a' : '#0009'; ctx.lineWidth = u.inCover ? 0.5 : 0.25;
    ctx.beginPath(); ctx.arc(u.x, u.y, 1.6, 0, 7); ctx.fill(); ctx.stroke();
    if (u.face != null && !u.down) { ctx.strokeStyle = '#000a'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.x + Math.cos(u.face) * 2.6, u.y + Math.sin(u.face) * 2.6); ctx.stroke(); }
    ctx.font = '2px sans-serif'; txt(u.player ? (ROLES[u.role] && !u.vipUnit ? ROLES[u.role].icon : '🆘') : ENEMIES[u.kind].icon, u.x, u.y + 0.1);
    if (u.down) { ctx.font = '2.6px sans-serif'; txt('💀', u.x, u.y - 3.2); }
    else {
      const st = b.stateOf(u); if (st && u.player) { const hx = rot ? u.x - 3.8 : u.x, hy = rot ? u.y : u.y - 3.8; ctx.fillStyle = '#000c'; ctx.strokeStyle = STATES[st.type].col; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.arc(hx, hy, 1.9, 0, 7); ctx.fill(); ctx.stroke(); ctx.font = '2.5px sans-serif'; txt(STATES[st.type].icon, hx, hy + 0.1); }
      const fr = u.hp / u.hpMax; ctx.fillStyle = '#000a'; if (rot) ctx.fillRect(u.x + 2, u.y - 1.6, 0.55, 3.2); else ctx.fillRect(u.x - 1.6, u.y + 2, 3.2, 0.55); ctx.fillStyle = fr > 0.5 ? '#5fd39a' : fr > 0.25 ? '#ffd65a' : '#ff6a5a'; if (rot) ctx.fillRect(u.x + 2, u.y + 1.6 - 3.2 * fr, 0.55, 3.2 * fr); else ctx.fillRect(u.x - 1.6, u.y + 2, 3.2 * fr, 0.55);
    }
    ctx.globalAlpha = 1;
  }
}
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (G.running && G.battle && !G.battle.over) { G.acc += dt * G.speeds[G.spI]; let n = 0; while (G.acc >= STEP && n++ < 20) { G.battle.step(STEP); G.acc -= STEP; } afterStep(); renderGraph(); }
  draw();
  requestAnimationFrame(frame);
}

// ---------------- missions sheet ----------------
function openSheet(title, fill) { $('sheetT').textContent = title; const b = $('sheetB'); b.innerHTML = ''; fill(b); $('sheet').classList.remove('hidden'); }
$('sheetX').onclick = () => $('sheet').classList.add('hidden');
function selectMission(i) {
  G.mi = i; save(LS.mis, i); G.endShown = false;
  const m = MISSIONS[i];
  if (m.tutorial && !G.prog[m.id]) { setFSM(tutorialFSM()); }
  newBattle(); $('sheet').classList.add('hidden');
}
$('bMis').onclick = () => openSheet('📋 Missions', b => {
  const ul = document.createElement('ul'); ul.className = 'mlist';
  MISSIONS.forEach((m, i) => {
    const li = document.createElement('li'); if (i === G.mi) li.className = 'cur'; li.dataset.m = i;
    const st = G.prog[m.id] || 0;
    li.innerHTML = `<span class="ic">${m.icon}</span><span class="nm"><b>${i + 1}. ${m.name}</b><br><span class="muted">${m.teach}</span></span><span class="st">${'⭐'.repeat(st)}${'☆'.repeat(3 - st)}</span>`;
    li.onclick = () => brief(b, i); ul.appendChild(li);
  });
  b.appendChild(ul);
});
function brief(b, i) {
  const m = MISSIONS[i]; b.innerHTML = '';
  const d = document.createElement('div'); d.className = 'brief';
  const goal = { clear: '☠️ Clear all', reach: '🏁 Reach zone', hold: '🚩 Hold zone', rescue: '🆘 Rescue + clear' }[m.goal];
  d.innerHTML = `<div class="ic">${m.icon}</div><b>${i + 1}. ${m.name}</b><p>${m.tip}</p><div class="row">${goal} · ⏱ ${m.time}s · ⭐ ≤${m.par}s</div><div class="row">👥 ${m.squad.map(r => ROLES[r].icon).join('')} vs ${m.enemies.map(e => ENEMIES[e[0]].icon).join('')}${m.waves ? ' +🌊' : ''}</div>`;
  b.appendChild(d);
  const r = document.createElement('div'); r.className = 'row';
  const go = btn('▶ Go', 'opt on', () => selectMission(i)); go.id = 'mGo'; r.appendChild(go);
  if (m.tutorial) r.appendChild(btn('🧩 Broken FSM', 'opt', () => { setFSM(tutorialFSM()); selectMission(i); }));
  r.appendChild(btn('◀', 'opt', () => $('bMis').onclick()));
  b.appendChild(r);
}

// ---------------- save / load ----------------
function slots() { return load(LS.slots, []); }
$('bSave').onclick = () => openSheet('💾 FSMs', renderSave);
function renderSave(b) {
  b.innerHTML = '';
  const r = document.createElement('div'); r.className = 'row';
  const sv = btn('💾 Save', 'opt on', () => { const s = slots(); s.push({ name: 'FSM ' + (s.length + 1), at: Date.now(), fsm: clone(G.fsm) }); save(LS.slots, s); renderSave(b); }); sv.id = 'svNew'; r.appendChild(sv);
  r.appendChild(btn('🧩', 'opt', () => setFSM(tutorialFSM()), 'Broken tutorial FSM'));
  r.appendChild(btn('🧠', 'opt', () => setFSM(starterFSM()), 'Starter FSM'));
  r.appendChild(btn('⬜', 'opt', () => setFSM(blankFSM()), 'Blank FSM'));
  b.appendChild(r);
  const ul = document.createElement('ul'); ul.className = 'mlist';
  slots().forEach((s, i) => {
    const li = document.createElement('li'); li.dataset.slot = i;
    li.innerHTML = `<span class="ic">🧠</span><span class="nm"><b>${s.name}</b><br><span class="muted">${s.fsm.states.map(x => STATES[x.type].icon).join('')} · ↗${s.fsm.trans.length}</span></span>`;
    li.appendChild(btn('📂', 'ld', () => { setFSM(clone(s.fsm)); $('sheet').classList.add('hidden'); }, 'Load'));
    li.appendChild(btn('⧉', 'cp', () => { const a = slots(); a.splice(i + 1, 0, { ...clone(s), name: s.name + ' copy' }); save(LS.slots, a); renderSave(b); }, 'Copy'));
    li.appendChild(btn('🗑', 'rm', () => { const a = slots(); a.splice(i, 1); save(LS.slots, a); renderSave(b); }, 'Delete'));
    ul.appendChild(li);
  });
  b.appendChild(ul);
  const ta = document.createElement('textarea'); ta.id = 'json'; ta.placeholder = '{ JSON }';
  const r2 = document.createElement('div'); r2.className = 'row';
  r2.appendChild(btn('⬇ JSON', 'opt', () => {
    const txt = JSON.stringify(G.fsm, null, 1); ta.value = txt;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = 'squad-fsm.json'; a.click();
    try { navigator.clipboard && navigator.clipboard.writeText(txt).catch(() => {}); } catch {}
  }, 'Export'));
  r2.appendChild(btn('⬆ JSON', 'opt', () => { try { const f = validFSM(JSON.parse(ta.value)); if (!f) throw 0; setFSM(f); ta.value = '✅'; } catch { ta.value = '❌ bad JSON'; } }, 'Import from box'));
  const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json,application/json'; fi.style.display = 'none';
  fi.onchange = async () => { const t = await fi.files[0].text(); ta.value = t; };
  r2.appendChild(btn('📁', 'opt', () => fi.click(), 'Open file'));
  b.appendChild(r2); b.appendChild(ta); b.appendChild(fi);
}

function renderAll() { renderRoles(); renderGraph(true); renderInsp(); }

// ---------------- boot ----------------
window.__hooks = {
  G, MISSIONS,
  battle: () => G.battle,
  run(sec) { advance(sec); renderGraph(true); return G.battle.over; },
  fsm: () => G.fsm,
  log: () => G.battle.log.map(fmtLog),
  state: () => ({ t: G.battle.t, running: G.running, over: G.battle.over, speed: G.speeds[G.spI], units: G.battle.units.filter(u => u.player).map(u => ({ name: u.name, state: G.battle.stateOf(u).type, hp: u.hp, down: u.down, dead: u.dead })) }),
};
if (MISSIONS[G.mi].tutorial && !G.prog[MISSIONS[G.mi].id] && !localStorage.getItem(LS.cur)) G.fsm = tutorialFSM();
persist();
showTab(isSplit() ? 'ed' : 'ed');
newBattle(); renderAll();
requestAnimationFrame(frame);
