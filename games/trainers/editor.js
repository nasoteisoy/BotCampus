/* Trainers · Trainer Editor. Reads and writes the trainer doctrine (doctrine.js) in localStorage.
   Same layout and storage pattern as the Command Layers objective editor. Phone-first, plain DOM, no dependencies. */
(() => {
'use strict';
const D = window.TRDoctrine, art = window.TRArt || (() => '');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = D.clone;
let doc, savedJSON, tab = 'trainers', sel = 'ace', msg = null, testRes = null, testOpp = 'bugkid';
const open = new Set(['sc:attack', 'sc:support', 'sc:switch', 'it:rules', 'it:bag', 'sw:rules', 'mp:bias', 'pe:main']);
function boot() {
  const L = D.load(); doc = L.doc; savedJSON = JSON.stringify(doc);
  if (L.custom && L.warnings.length) msg = { k: 'err', t: `Saved trainers had ${L.warnings.length} invalid field(s); those use defaults: ${L.warnings.slice(0, 5).join(', ')}` };
  const h = (location.hash || '').slice(1).split(':'); if (TABS.some(t => t[0] === h[0])) tab = h[0];
  if (h[1] && doc.trainers[h[1]]) sel = h[1];
  bind(); render();
}
const T = () => doc.trainers[sel];
const P = (k) => `trainers.${sel}.${k}`;
const isDirty = () => JSON.stringify(doc) !== savedJSON;
const isCustom = () => !D.same(JSON.parse(savedJSON), D.DEFAULT_DOCTRINE);
const trDirty = (id) => { const s = JSON.parse(savedJSON).trainers[id]; return !s || !D.same(s, doc.trainers[id]); };
const trCustom = (id) => !D.PRESETS[id] || !D.same(doc.trainers[id], D.PRESETS[id]);
const getP = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
function setP(path, v) { const ks = path.split('.'); let o = doc; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }

// ---------------------------------------------------------------- widgets (same as the objective editor)
function shown(v, kind) { const x = kind === 'pct' ? v * 100 : v; return String(Math.round(x * 100) / 100); }
function nf(path, label, hint = '', o = {}) {
  const v = getP(path), unit = o.unit || (o.kind === 'pct' ? '%' : '');
  return `<div class="nf${o.full ? ' full' : ''}"><label>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</label><div class="stp"><button data-stp="${path}" data-d="-1" aria-label="less">−</button><input inputmode="decimal" data-num="${path}" data-kind="${o.kind || ''}" data-step="${o.step || 1}" data-min="${o.min ?? ''}" data-max="${o.max ?? ''}" data-int="${o.int ? 1 : ''}" value="${shown(v, o.kind)}" aria-label="${esc(label)}">${unit ? `<span class="u">${esc(unit)}</span>` : ''}<button data-stp="${path}" data-d="1" aria-label="more">+</button></div></div>`;
}
const tog = (path, label, hint = '') => `<div class="tg full"><button class="sw${getP(path) ? ' on' : ''}" data-tog="${path}" aria-label="${esc(label)}" aria-pressed="${!!getP(path)}"></button><span>${esc(label)}${hint ? `<br><small class="hint">${esc(hint)}</small>` : ''}</span></div>`;
function grp(key, icon, title, sub, body) {
  const on = open.has(key);
  return `<section class="grp" data-g="${key}"><button class="gh" data-open="${key}" aria-expanded="${on}"><span class="ic">${icon}</span><span class="t"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="chev">${on ? '▾' : '▸'}</span></button>${on ? `<div class="gb">${typeof body === 'function' ? body() : body}</div>` : ''}</section>`;
}
// one weight per list row: icon, what it means, stepper
const wrow = (path, icon, title, text, o = {}) => `<div class="wrow"><span class="ic">${icon}</span><div><b>${esc(title)}</b><small>${esc(text)}</small></div>${nf(path, title, '', o)}</div>`;
const tIc = (t) => (t ? D.TYPES[t].icon : '⭘');

// ---------------------------------------------------------------- tabs
const TABS = [['trainers', '👥 Trainers'], ['moves', '🎯 Move priorities'], ['switch', '🔁 Switch rules'], ['items', '🎒 Item use'], ['pers', '🧠 Personality'], ['score', '📊 Scoring'], ['team', '🧬 Team'], ['data', '⇅ Import / Export']];
function whoBar() {
  return `<div id="who"><span class="wi">${esc(T().icon)}</span><select data-who="1" aria-label="Trainer being edited">${doc.order.map(id => `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(doc.trainers[id].icon + ' ' + doc.trainers[id].name)}${trDirty(id) ? ' ●' : ''}</option>`).join('')}</select></div>`;
}
const PRESET_L = { bugkid: '🪲 Bug-kid: random-ish, dumb', ace: '🎖 Ace: smart scorer', gambler: '🎲 Gambler: chases crits and KOs', healer: '🩹 Healer / stall', setup: '📈 Setup sweeper', status: '🌀 Status spammer' };
function renderTrainers() {
  let h = `<p class="intro">Every trainer is a lead with a team and a brain. Each turn the brain lists every legal action (each move, each switch, each item), scores it with this trainer's weights, adds personality noise and picks the top score. Pick a trainer to edit it in the other tabs.</p>`;
  for (const id of doc.order) {
    const t = doc.trainers[id], pre = !!D.PRESETS[id];
    h += `<div class="trow${id === sel ? ' on' : ''}"><button class="pick" data-sel="${esc(id)}"><span class="ic">${esc(t.icon)}</span><span class="t"><b>${esc(t.name)}</b><small>${esc(PRESET_L[t.preset] || t.preset)}${pre ? '' : ' · copy'}</small><span class="tm">${t.team.map(s => `<img src="${art(s.mon)}" alt="">`).join('')}</span></span></button>${trDirty(id) ? '<span class="badge" style="background:#a08a10;color:#111">●</span>' : trCustom(id) ? '<span class="badge c">✎</span>' : ''}<button data-act="dup" data-a="${esc(id)}" aria-label="Duplicate">⧉</button>${pre ? '' : `<button data-act="del" data-a="${esc(id)}" aria-label="Delete">🗑</button>`}</div>`;
  }
  h += `<h2>✎ ${esc(T().name)}</h2><div class="tyrow"><input class="ic" data-txt="${P('icon')}" value="${esc(T().icon)}" maxlength="4" aria-label="Icon"><input data-txt="${P('name')}" value="${esc(T().name)}" maxlength="40" aria-label="Name"><span></span></div>
    <div class="hint">Based on: ${esc(PRESET_L[T().preset])}. ↺ Reset puts this trainer back to that preset.</div>`;
  return h;
}
function renderMoves() {
  const t = T();
  let h = whoBar() + `<p class="intro">Flat points added to every move of a kind, before the 📊 scoring features. Positive = likes it, negative = avoids it.</p>`;
  h += grp('mp:bias', '🎯', 'Move-kind bias', 'points added to each kind of move', () =>
    wrow(P('movePri.attack'), '💥', 'Attack moves', 'Anything that deals damage', { step: 1 })
    + wrow(P('movePri.status'), '💤', 'Status moves', 'Sleep, paralysis, poison, burn, confusion', { step: 1 })
    + wrow(P('movePri.setup'), '📈', 'Setup moves', 'Raise own stats (War Cry, Harden…) or lower the foe\'s', { step: 1 })
    + wrow(P('movePri.heal'), '❤', 'Healing moves', 'Mend, Regrow, Purify, Deep Rest', { step: 1 })
    + wrow(P('movePri.priority'), '⚡', 'First-strike bonus', 'Extra for a priority move when someone is about to be KO\'d', { step: 1 })
    + wrow(P('movePri.strongest'), '🏋', 'Strongest-move bonus', 'Extra for the highest power move, matchup or not', { step: 1 }));
  h += grp('mp:prev', '👀', 'Team moves preview', 'which kind each move counts as', () => `<div class="prev">${t.team.map(s => `<div class="lbl">${tIc(D.DEX[s.mon].type)} ${esc(D.DEX[s.mon].name)}</div>${s.moves.map(id => { const m = D.MOVES[id]; const k = m.pow ? '💥 attack' : m.st ? '💤 status' : m.heal || m.rest ? '❤ heal' : '📈 setup'; const kk = m.pow ? 'attack' : m.st ? 'status' : m.heal || m.rest ? 'heal' : 'setup'; return `<div class="pr"><span>${tIc(m.type)} ${esc(m.name)}${m.pri ? ' ⚡' : ''}</span><span>${k} ${t.movePri[kk] >= 0 ? '+' : ''}${t.movePri[kk]}</span></div>`; }).join('')}`).join('')}</div>`);
  return h;
}
function renderSwitch() {
  let h = whoBar() + `<p class="intro">A switch is only attractive when a rule fires: low HP or a bad matchup. Then it gets the bonus; otherwise the penalty. Switching costs a turn, so the foe gets a free hit on the incoming monster (counted as risk in 📊).</p>`;
  h += grp('sw:rules', '🔁', 'Switch rules', T().sw.never ? 'never switches' : `HP ≤ ${Math.round(T().sw.hp * 100)}% or matchup ≤ −${T().sw.bad}`, () => `<div class="prm">${tog(P('sw.never'), 'Never switch', 'Only sends in the next one when a monster faints')}
    ${nf(P('sw.hp'), 'Switch out at HP', 'rule 1', { kind: 'pct', step: 5, min: 0, max: 100 })}${nf(P('sw.bad'), 'Bad matchup at', 'rule 2: type score ≤ −this', { step: 0.25, min: 0, max: 5 })}
    ${nf(P('sw.bonus'), 'Bonus when a rule fires', '', { step: 1, unit: 'pts' })}${nf(P('sw.penalty'), 'Penalty otherwise', '', { step: 1, unit: 'pts' })}
    ${tog(P('sw.keepBoosted'), 'Stay in when boosted', 'Penalty again if the active has +2 or more stages')}</div>
    <div class="hint">Matchup = best type hit my monster has on the foe − best the foe has on mine (log scale: ×2 = 1, ×½ = −1), +0.4 if faster.</div>`);
  return h;
}
function renderItems() {
  let h = whoBar() + `<p class="intro">Items cost the turn. The rules below decide when an item is even considered; 📊 Item weight decides how much it is worth.</p>`;
  h += grp('it:rules', '🎒', 'When to use', `potion ≤ ${Math.round(T().items.healAt * 100)}% · super ≤ ${Math.round(T().items.superAt * 100)}%`, () => `<div class="prm">
    ${nf(P('items.healAt'), '🧪 Potion at HP', '+60 HP', { kind: 'pct', step: 5, min: 0, max: 100 })}${nf(P('items.superAt'), '⚗ Super Potion at HP', '+140 HP', { kind: 'pct', step: 5, min: 0, max: 100 })}
    ${nf(P('items.reviveAt'), '💖 Revive when this many are out', '0 = never', { step: 1, min: 0, max: 6, int: true })}${nf(P('items.maxPerBattle'), 'Max items per battle', '', { step: 1, min: 0, max: 20, int: true })}
    ${tog(P('items.fullHealSleep'), '💊 Full Heal when asleep', 'Wakes the active monster up')}${tog(P('items.fullHealOther'), '💊 Full Heal other statuses', 'Poison, burn, paralysis')}</div>`);
  h += grp('it:bag', '👜', 'Bag', Object.keys(D.ITEMS).map(k => `${D.ITEMS[k].icon}×${T().bag[k]}`).join(' '), () => `<div class="prm">${Object.keys(D.ITEMS).map(k => nf(P('bag.' + k), `${D.ITEMS[k].icon} ${D.ITEMS[k].name}`, '', { step: 1, min: 0, max: 9, int: true })).join('')}</div>`);
  return h;
}
function renderPers() {
  let h = whoBar() + `<p class="intro">Personality bends the scores before the pick.</p>`;
  h += grp('pe:main', '🧠', 'Personality', `temp ${T().pers.temp} · aggression ×${T().pers.aggr} · risk ${Math.round(T().pers.risk * 100)}%`, () =>
    wrow(P('pers.temp'), '🎲', 'Temperature', 'Random noise added to every score. 0 = always the best; 30 = Bug-kid chaos', { step: 1, min: 0, max: 100 })
    + wrow(P('pers.aggr'), '🔥', 'Aggression', 'Multiplies damage and KO points', { step: 0.1, min: 0, max: 5 })
    + wrow(P('pers.risk'), '🧗', 'Risk tolerance', 'Ignores this share of the 📊 risk penalty. 100% = fearless', { kind: 'pct', step: 5, min: 0, max: 100 }));
  return h;
}
const FEAT = {
  dmg: ['💥', 'Expected damage', 'points per % of the foe\'s HP the move should take (accuracy and crits included)', 0.05],
  ko: ['☠', 'KO chance', 'points × chance this hit knocks the foe out', 1],
  type: ['🔺', 'Type advantage', 'points per type step (×2 = +1, ×½ = −1, immune = −3)', 1],
  status: ['💤', 'Status value', 'points × value of the status it can cause (sleep 1, para/poison .6, burn .5, confusion .4)', 1],
  setup: ['📈', 'Setup value', 'points × useful stages gained × own HP × safety', 1],
  heal: ['❤', 'Healing', 'points × 2 × share of max HP restored', 1],
  risk: ['⚠', 'Self HP risk', 'penalty × how hard the foe can hit back (share of my HP, +½ KO chance)', 1],
  match: ['🔁', 'Matchup after switch', 'points × how much better the new monster\'s matchup is', 1],
  item: ['🎒', 'Item value', 'points for using an item (potion: + heal share; revive / full heal: fixed)', 1],
  crit: ['✨', 'Crit chasing', 'points × crit chance × 10', 1],
  prio: ['⚡', 'First strike', 'points for a priority move when a KO is in the air', 1],
  acc: ['🎯', 'Miss fear', 'penalty per % miss chance', 0.05],
};
function renderScore() {
  const t = T();
  let h = whoBar() + `<p class="intro">Score of an action = Σ feature × weight (+ move-kind bias + switch rule points), then personality noise; the highest wins. The 🧠 Why log after a battle shows the top 3 scores each turn.</p>`;
  const rows = (ks) => ks.map(k => wrow(P('score.' + k), FEAT[k][0], FEAT[k][1], FEAT[k][2], { step: FEAT[k][3] })).join('');
  h += grp('sc:attack', '⚔', 'Attacking', `dmg ${t.score.dmg} · KO ${t.score.ko} · type ${t.score.type}`, () => rows(['dmg', 'ko', 'type', 'crit', 'prio', 'acc']));
  h += grp('sc:support', '🧪', 'Support', `status ${t.score.status} · setup ${t.score.setup} · heal ${t.score.heal}`, () => rows(['status', 'setup', 'heal', 'item']));
  h += grp('sc:switch', '🛡', 'Safety', `risk ${t.score.risk} · matchup ${t.score.match}`, () => rows(['risk', 'match']));
  h += grp('sc:test', '🧪', 'Quick test (unsaved edits)', testRes ? `${Math.round(testRes.rate * 100)}% vs ${doc.trainers[testOpp] ? doc.trainers[testOpp].name : ''}` : 'run 100 battles now', () => `<div class="row"><select class="grow" data-opp="1" aria-label="Opponent">${doc.order.map(id => `<option value="${esc(id)}"${id === testOpp ? ' selected' : ''}>${esc(doc.trainers[id].icon + ' ' + doc.trainers[id].name)}</option>`).join('')}</select><button data-act="test" class="go">▶ 100</button></div><div class="hint">3 v 3, both sides use ${esc(t.name)}'s team, so only the brains differ.</div>${testRes ? `<div class="msg ok" id="testOut">${esc(t.name)} won <b>${testRes.w[0]}</b> · lost ${testRes.w[1]} · draws ${testRes.draw} → <b>${Math.round(testRes.rate * 100)}%</b></div>` : ''}`);
  return h;
}
const STAT_L = [['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe']];
function moveLabel(id) { const m = D.MOVES[id]; return `${tIc(m.type)} ${m.name}${m.pow ? ' 💥' + m.pow : m.st ? ' ' + ({ slp: '💤', par: '⚡', psn: '☠', brn: '🔥', cnf: '💫' })[m.st[0]] : m.heal || m.rest ? ' ❤' : ' 📈'}`; }
function renderTeam() {
  const t = T(), n = t.team.length;
  let h = whoBar() + `<p class="intro">Up to 6 monsters, 4 moves each. Order matters: the first one leads, and 3 v 3 battles use the first 3.</p>`;
  t.team.forEach((s, i) => {
    const d = D.DEX[s.mon], p = P(`team.${i}`);
    h += `<div class="slot${i >= 3 ? ' bench3' : ''}"><div class="sh"><span class="sn">${i + 1}</span><img src="${art(s.mon)}" alt=""><select data-mon="${i}" aria-label="Monster ${i + 1}">${D.MON_IDS.map(id => `<option value="${id}"${id === s.mon ? ' selected' : ''}>${tIc(D.DEX[id].type)} ${esc(D.DEX[id].name)}</option>`).join('')}</select></div>
      <div class="sa"><div class="stats">${STAT_L.map(([k, l]) => `<span>${l} ${d.base[k]}</span>`).join('')}${i >= 3 ? '<span>6 v 6 only</span>' : ''}</div><button data-act="up" data-a="${i}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button data-act="down" data-a="${i}" ${i < n - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button data-act="rm" data-a="${i}" ${n > 3 ? '' : 'disabled'} aria-label="Remove">✕</button></div>
      <div class="mvs">${[0, 1, 2, 3].map(j => `<select data-mv="${p}.moves.${j}" aria-label="Move ${j + 1}">${d.pool.map(id => `<option value="${id}"${s.moves[j] === id ? ' selected' : ''}${s.moves.includes(id) && s.moves[j] !== id ? ' disabled' : ''}>${esc(moveLabel(id))}</option>`).join('')}</select>`).join('')}</div></div>`;
  });
  if (n < 6) h += `<button class="addv" data-act="add">＋ Add a monster</button>`;
  return h;
}
function renderData() {
  return `${whoBar()}<p class="intro">Back up or share trainers as JSON. Import replaces or adds (checked field by field; anything invalid falls back to its preset), then tap 💾 Save.</p>
  ${msg ? `<div class="msg ${msg.k}">${esc(msg.t)}</div>` : ''}
  <h2>⬆ Export</h2><div class="seg" style="margin-bottom:6px"><button class="${exAll ? '' : 'on'}" data-ex="one">${esc(T().icon)} This trainer</button><button class="${exAll ? 'on' : ''}" data-ex="all">👥 All trainers</button></div>
  <textarea id="exTxt" readonly aria-label="Exported JSON">${esc(JSON.stringify(exAll ? doc : T(), null, 1))}</textarea>
  <div class="acts"><button id="bCopy">📋 Copy</button><button id="bDown">💾 Download .json</button></div>
  <h2>⬇ Import</h2><textarea id="imTxt" placeholder='Paste one trainer { "id": …, "team": …, "score": … } or all { "trainers": { … } }' aria-label="JSON to import"></textarea>
  <div class="acts"><button id="bImport" class="go">⬇ Import pasted JSON</button><label style="flex:1"><input type="file" id="imFile" accept=".json,application/json,text/plain" hidden><button style="width:100%" onclick="this.previousElementSibling.click()">📂 From file</button></label></div>
  <h2>↺ Defaults</h2><p class="hint">Reset all puts every preset trainer back and deletes your copies (and the saved file).</p><div class="acts"><button class="warn" data-act="resetAll">↺ Reset all trainers</button></div>`;
}
let exAll = false;
function renderStatus() {
  const d = isDirty(), c = isCustom();
  const st = $('st'); st.textContent = d ? '● Unsaved' : c ? '✎ Custom saved' : 'Default'; st.className = d ? 'dirty' : c ? 'custom' : '';
  $('bSave').disabled = !d; $('bSave').textContent = d ? '💾 Save' : '✓ Saved';
}
function render() {
  const y = window.scrollY, im = $('imTxt') ? $('imTxt').value : '';
  if (!doc.trainers[sel]) sel = doc.order[0];
  $('tabs').innerHTML = TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
  const f = { trainers: renderTrainers, moves: renderMoves, switch: renderSwitch, items: renderItems, pers: renderPers, score: renderScore, team: renderTeam, data: renderData }[tab];
  $('main').innerHTML = (msg && tab !== 'data' ? `<div class="msg ${msg.k}">${esc(msg.t)}</div>` : '') + f();
  if (im && $('imTxt')) $('imTxt').value = im;
  renderStatus(); window.scrollTo(0, y);
}
function toast(t, k = 'ok') { msg = { k, t }; render(); clearTimeout(toast.h); toast.h = setTimeout(() => { msg = null; document.querySelectorAll('#main .msg:not(#testOut)').forEach(e => e.remove()); }, 4500); }

// ---------------------------------------------------------------- actions
function newId(base) { let id; do id = `${base}-${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 36).toString(36)}`; while (doc.trainers[id]); return id; }
function act(a, arg) {
  const team = T().team;
  switch (a) {
    case 'dup': { const src = doc.trainers[arg], id = newId(src.preset), c = clone(src); c.id = id; c.name = (src.name + ' copy').slice(0, 40); doc.trainers[id] = c; doc.order.splice(doc.order.indexOf(arg) + 1, 0, id); sel = id; toast(`⧉ Copied as "${c.name}" (tap 💾 Save to keep it)`); return; }
    case 'del': { if (D.PRESETS[arg]) return; const t = doc.trainers[arg]; confirmBox(`Delete ${t.name}?`, 'This copy is removed when you save.', [['🗑 Delete', 'warn', () => { delete doc.trainers[arg]; doc.order = doc.order.filter(x => x !== arg); if (sel === arg) sel = doc.order[0]; render(); }], ['Cancel', '', null]]); return; }
    case 'up': { const i = +arg; if (i > 0) [team[i - 1], team[i]] = [team[i], team[i - 1]]; break; }
    case 'down': { const i = +arg; if (i < team.length - 1) [team[i + 1], team[i]] = [team[i], team[i + 1]]; break; }
    case 'rm': { if (team.length > 3) team.splice(+arg, 1); break; }
    case 'add': { if (team.length < 6) { const id = D.MON_IDS.find(m => !team.some(s => s.mon === m)) || D.MON_IDS[0]; team.push({ mon: id, moves: D.DEX[id].moves.slice() }); } break; }
    case 'test': { const r = window.TR && TR.tournament(T(), doc.trainers[testOpp], 100, { size: 3, sameTeam: true, seed: 2024 }); testRes = r; break; }
    case 'reset': { const t = T(), pre = D.PRESETS[t.preset]; confirmBox(`Reset ${t.name}?`, `Every weight, rule and the team go back to the ${PRESET_L[t.preset]} preset. Tap 💾 Save afterwards to store it.`, [['↺ Reset', 'warn', () => { const c = clone(pre); c.id = t.id; if (!D.PRESETS[t.id]) c.name = t.name; doc.trainers[t.id] = c; toast(`↺ ${c.name} reset to the preset. Tap 💾 Save to keep it.`); }], ['Cancel', '', null]]); return; }
    case 'resetAll': confirmBox('Reset all trainers?', 'All presets go back to default and your copies are deleted. The saved file is cleared.', [['↺ Reset all', 'warn', () => { D.reset(); doc = D.defaults(); savedJSON = JSON.stringify(doc); sel = 'ace'; toast('Reset to defaults ✓'); }], ['Cancel', '', null]]); return;
    default: return;
  }
  render();
}
function confirmBox(title, text, btns) {
  $('ovBox').innerHTML = `<h3>${esc(title)}</h3><p class="hint" style="font-size:14px">${esc(text)}</p><div class="acts">${btns.map(([l, c], i) => `<button class="${c}" data-ob="${i}">${esc(l)}</button>`).join('')}</div>`;
  $('ov').hidden = false;
  $('ovBox').onclick = (e) => { const b = e.target.closest('[data-ob]'); if (!b) return; $('ov').hidden = true; const f = btns[+b.dataset.ob][2]; if (f) f(); };
}
function save() {
  const r = D.save(doc);
  if (!r) { toast('Could not save (storage blocked?)', 'err'); return false; }
  doc = r.doc;
  if (D.same(doc, D.DEFAULT_DOCTRINE)) D.reset();
  savedJSON = JSON.stringify(doc);
  toast(r.warnings.length ? `Saved, but ${r.warnings.length} invalid field(s) were reset: ${r.warnings.slice(0, 4).join(', ')}` : 'Saved ✓ The game uses these trainers from the next battle.', r.warnings.length ? 'err' : 'ok');
  return true;
}
function doImport(text) {
  const r = D.parse(text);
  if (!r.ok) { msg = { k: 'err', t: '✖ Import rejected. ' + r.error + ' Nothing was changed.' }; render(); return false; }
  const w = r.warnings.length ? ` with ${r.warnings.length} field(s) reset (${r.warnings.slice(0, 4).join(', ')}${r.warnings.length > 4 ? '…' : ''})` : '';
  if (r.single) {
    const t = r.trainer, isNew = !doc.trainers[t.id];
    doc.trainers[t.id] = t; if (isNew) doc.order.push(t.id); sel = t.id;
    msg = { k: 'ok', t: `✓ Imported ${t.icon} ${t.name}${isNew ? ' as a new trainer' : ' (replaced)'}${w}. Tap 💾 Save to use it.` };
  } else { doc = r.doc; if (!doc.trainers[sel]) sel = doc.order[0]; msg = { k: 'ok', t: `✓ Imported ${doc.order.length} trainers${w}. Tap 💾 Save to use them.` }; }
  if ($('imTxt')) $('imTxt').value = '';
  render(); return true;
}
function numInput(el, commit) {
  const kind = el.dataset.kind, v = parseFloat(String(el.value).replace(',', '.'));
  const mn = el.dataset.min === '' ? -Infinity : +el.dataset.min, mx = el.dataset.max === '' ? Infinity : +el.dataset.max;
  if (!isFinite(v)) { el.classList.add('bad'); return; }
  let x = v; if (commit) { x = Math.min(mx, Math.max(mn, v)); if (x !== v) el.value = String(x); } else if (v < mn || v > mx) { el.classList.add('bad'); return; }
  el.classList.remove('bad');
  const path = el.dataset.num, cur = getP(path);
  let val = kind === 'pct' ? x / 100 : x;
  if (el.dataset.int) val = Math.round(val);
  if (shown(cur, kind) === String(x) && commit) return;
  setP(path, Math.round(val * 10000) / 10000);
  renderStatus();
}
function bind() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, a'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (b.id === 'back') { if (isDirty()) { e.preventDefault(); confirmBox('Unsaved changes', 'Save your edits before going back to the game?', [['💾 Save & play', 'go', () => { if (save()) location.href = 'index.html'; }], ['Discard', 'warn', () => { location.href = 'index.html'; }], ['Stay', '', null]]); } return; }
    if (d.tab) { tab = d.tab; history.replaceState(null, '', '#' + tab + ':' + sel); window.scrollTo(0, 0); render(); return; }
    if (d.sel) { sel = d.sel; testRes = null; history.replaceState(null, '', '#' + tab + ':' + sel); render(); return; }
    if (d.open) { open.has(d.open) ? open.delete(d.open) : open.add(d.open); render(); return; }
    if (d.tog) { setP(d.tog, !getP(d.tog)); render(); return; }
    if (d.ex) { exAll = d.ex === 'all'; render(); return; }
    if (d.stp) { const inp = b.parentElement.querySelector('input'), st = +inp.dataset.step || 1, cur = parseFloat(inp.value) || 0; inp.value = String(Math.round((cur + st * +d.d) * 1000) / 1000); numInput(inp, true); return; }
    if (d.act) { act(d.act, d.a); return; }
    if (b.id === 'bSave') { save(); return; }
    if (b.id === 'bReset') { act('reset'); return; }
    if (b.id === 'bCopy') { const t = $('exTxt'); const done = () => toast('Copied ✓'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(done, () => { t.select(); document.execCommand('copy'); done(); }); else { t.select(); document.execCommand('copy'); done(); } return; }
    if (b.id === 'bDown') { const blob = new Blob([$('exTxt').value], { type: 'application/json' }), a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = exAll ? 'trainers-all.json' : `trainer-${sel}.json`; document.body.appendChild(a2); a2.click(); setTimeout(() => { URL.revokeObjectURL(a2.href); a2.remove(); }, 500); return; }
    if (b.id === 'bImport') { doImport($('imTxt').value); return; }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.num) numInput(el, false);
    else if (el.dataset.txt) { const v = el.value; if (v.trim()) { setP(el.dataset.txt, v.slice(0, el.dataset.txt.endsWith('.icon') ? 4 : 40)); el.classList.remove('bad'); } else el.classList.add('bad'); renderStatus(); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target, d = el.dataset;
    if (d.num) { numInput(el, true); return; }
    if (d.txt) { render(); return; }
    if (d.who) { sel = el.value; testRes = null; history.replaceState(null, '', '#' + tab + ':' + sel); render(); return; }
    if (d.opp) { testOpp = el.value; testRes = null; render(); return; }
    if (d.mon !== undefined) { const i = +d.mon; T().team[i] = { mon: el.value, moves: D.DEX[el.value].moves.slice() }; render(); return; }
    if (d.mv) { setP(d.mv, el.value); render(); return; }
    if (el.id === 'imFile' && el.files && el.files[0]) { const fr = new FileReader(); fr.onload = () => { $('imTxt').value = String(fr.result); doImport(fr.result); }; fr.readAsText(el.files[0]); }
  });
}
window.ED = { get doc() { return doc; }, get sel() { return sel; }, save, doImport, render, isDirty, setTab: (t) => { tab = t; render(); }, select: (id) => { sel = id; render(); }, open };
boot();
})();
