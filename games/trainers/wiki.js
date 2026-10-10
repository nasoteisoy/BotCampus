/* Trainers · Wiki. Everything here is generated from the game's own data (doctrine.js: dex, type chart, presets, RULES;
   game.js: damage math, stage multipliers, sprites), so the wiki can't drift from the game. Hash routes:
   #monsters #monster/<id> #moves #move/<id> #types #type/<id> #rules #trainers #trainer/<id> #mytrainer/<id> */
(() => {
'use strict';
const D = window.TRDoctrine, R = D.RULES, art = window.TRArt, $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMBED = /[?&]embed=1/.test(location.search);
if (EMBED) document.body.classList.add('embed');
const TY = D.TYPES, TIDS = Object.keys(TY);
const tIc = (t) => (t ? TY[t].icon : '⭘'), tCol = (t) => (t ? TY[t].col : '#8a8f78'), tName = (t) => (t ? TY[t].name : 'Typeless');
const tBadge = (t, link = true) => t ? `<a class="tb2" href="#type/${t}" style="--tc:${tCol(t)}"${link ? '' : ' tabindex="-1"'}>${tIc(t)} ${tName(t)}</a>` : `<span class="tb2" style="--tc:#8a8f78">⭘ Typeless</span>`;
const CAT = { phys: ['💪', 'Physical', 'Atk vs Def'], spec: ['🔮', 'Special', 'SpA vs SpD'], stat: ['🌀', 'Status', 'no damage'] };
const STATL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', acc: 'Accuracy', eva: 'Evasion', crit: 'Crit stage' };
const pct = (x) => Math.round(x * 100) + '%';
const frac = (x) => ({ 0.125: '1/8', 0.0625: '1/16', 0.5: '½', 0.25: '¼' }[x] || (Math.abs(1 / x - Math.round(1 / x)) < 1e-9 ? '1/' + Math.round(1 / x) : String(x)));
const effTxt = (e) => (e === 0 ? '×0' : e === 0.5 ? '×½' : e === 0.25 ? '×¼' : '×' + e);

// ---------------------------------------------------------------- derived data
function moveEffects(mv) {
  const out = [];
  if (mv.st) { const [s, c] = mv.st; out.push(`${R.statusIcon[s]} ${c >= 1 ? '' : pct(c) + ' '}${R.statusName[s]}`); }
  if (mv.boost) for (const [k, v] of Object.entries(mv.boost)) out.push(`⬆ ${STATL[k]} +${v}`);
  if (mv.drop) for (const [k, v] of Object.entries(mv.drop)) out.push(`⬇ foe ${STATL[k]} ${v}`);
  if (mv.heal) out.push(`❤ heals ${pct(mv.heal)}`);
  if (mv.cure) out.push('✨ cures own status');
  if (mv.rest) out.push(`❤ full heal, then 💤 ${R.restSleep} turns`);
  if (mv.hex) out.push('×2 power if the foe has a status');
  if (mv.crit) out.push(`✨ crit stage +${mv.crit}`);
  if (mv.pri) out.push(`⚡ goes first (+${mv.pri})`);
  return out;
}
const learners = (id) => D.MON_IDS.filter(m => D.DEX[m].pool.includes(id));
const defMatch = (t) => { const o = { weak: [], resist: [], immune: [], normal: [] }; for (const a of TIDS) { const e = D.eff(a, t); (e === 0 ? o.immune : e > 1 ? o.weak : e < 1 ? o.resist : o.normal).push(a); } return o; };
const offMatch = (t) => { const o = { strong: [], weak: [], none: [] }; for (const d of TIDS) { const e = D.eff(t, d); if (e === 0) o.none.push(d); else if (e > 1) o.strong.push(d); else if (e < 1) o.weak.push(d); } return o; };
const chips = (ts, cls = '') => ts.length ? `<div class="chips">${ts.map(t => `<a class="tchip ${cls}" href="#type/${t}" style="--tc:${tCol(t)}">${tIc(t)} ${tName(t)}</a>`).join('')}</div>` : '<span class="hint">none</span>';
const monCard = (id, extra = '') => { const d = D.DEX[id]; return `<a class="mc" href="#monster/${id}" style="--tc:${tCol(d.type)}"><img src="${art(id)}" alt=""><b>${esc(d.name)}</b><small>${tIc(d.type)} ${tName(d.type)}${extra}</small></a>`; };
const moveRow = (id, star) => { const m = D.MOVES[id]; return `<a class="mr" href="#move/${id}" style="--tc:${tCol(m.type)}"><span class="ti">${tIc(m.type)}</span><span class="t"><b>${star ? '★ ' : ''}${esc(m.name)}</b><small>${CAT[m.cat][0]} ${moveEffects(m).join(' · ') || CAT[m.cat][1]}</small></span><span class="num">${m.pow ? '💥' + m.pow : '—'}</span><span class="num">${m.acc == null ? '∞' : '🎯' + m.acc}</span></a>`; };

// trainer summary from doctrine weights
const FEAT = { dmg: ['💥', 'loves big damage', 60], ko: ['☠', 'hunts KOs', 1], type: ['🔺', 'chases type advantage', 1], status: ['💤', 'spreads status', 1], setup: ['📈', 'sets up boosts', 1], heal: ['❤', 'heals a lot', 1], risk: ['⚠', 'plays safe', 1], match: ['🔁', 'switches for matchups', 1], item: ['🎒', 'leans on items', 1], crit: ['✨', 'chases crits', 3], prio: ['⚡', 'strikes first', 1], acc: ['🎯', 'hates missing', 30] };
const FEATN = { dmg: 'Damage', ko: 'KO chance', type: 'Type adv.', status: 'Status', setup: 'Setup', heal: 'Healing', risk: 'Risk fear', match: 'Matchup', item: 'Items', crit: 'Crits', prio: 'First strike', acc: 'Miss fear' };
const featVal = (t, k) => Math.abs(t.score[k] * FEAT[k][2]);
const topFeats = (t, n) => Object.keys(FEAT).sort((a, b) => featVal(t, b) - featVal(t, a)).slice(0, n);
function summary(t) {
  const p = t.pers, [a, b] = topFeats(t, 2);
  const temper = p.temp >= 20 ? '🎲 plays almost at random' : p.temp >= 5 ? '🎲 a bit unpredictable' : '🎯 picks the best';
  const sw = t.sw.never ? '🚫 never switches' : `🔁 switches at ${pct(t.sw.hp)} HP`;
  return `${temper} · ${FEAT[a][1]} & ${FEAT[b][1]} · ${sw} · 🧪 ≤${pct(t.items.healAt)}`;
}
const bars = (t, keys) => `<div class="bars">${keys.map(k => { const v = featVal(t, k); return `<div class="bar"><span class="bi">${FEAT[k][0]}</span><span class="bl">${FEATN[k]}</span><span class="bt"><i style="width:${Math.min(100, v / 0.9)}%"></i></span><span class="bv">${t.score[k]}</span></div>`; }).join('')}</div>`;
function myTrainers() {
  const L = D.load(); if (!L.custom) return [];
  return L.doc.order.map(id => L.doc.trainers[id]).filter(t => !D.PRESETS[t.id] || !D.same(t, D.PRESETS[t.id]));
}

// ---------------------------------------------------------------- pages
const SECTIONS = [['monsters', '🐾', 'Monsters', () => `${D.MON_IDS.length} monsters`], ['moves', '💥', 'Moves', () => `${D.MOVE_IDS.length} moves`], ['types', '🔺', 'Types', () => `${TIDS.length} types · chart`], ['rules', '📜', 'Battle rules', () => 'damage, statuses, items'], ['trainers', '🎓', 'Trainers', () => `${D.PRESET_IDS.length} presets${myTrainers().length ? ` + ${myTrainers().length} ✎` : ''}`]];
const ui = { q: '', tf: '', sort: 'name', dir: 1, mtf: '', tview: 'chart' };
function pHome() {
  return { title: '📖 Wiki', body: `<div class="list">${SECTIONS.map(([k, ic, t, s]) => `<a class="row" href="#${k}"><span class="ic">${ic}</span><span class="t"><b>${t}</b><small>${s()}</small></span><span class="chev">›</span></a>`).join('')}</div>` };
}
function pMonsters() {
  return { title: '🐾 Monsters', body: `<input id="q" type="search" placeholder="🔎 Search name, type or move" value="${esc(ui.q)}" aria-label="Search monsters" autocomplete="off">
    <div class="chips tf">${[['', '✱ All']].concat(TIDS.map(t => [t, tIc(t)])).map(([t, l]) => `<button class="tfb${ui.tf === t ? ' on' : ''}" data-tf="${t}" style="--tc:${tCol(t || null)}" aria-label="${t ? tName(t) : 'All types'}">${l}</button>`).join('')}</div>
    <div id="grid" class="grid">${monGrid()}</div>` };
}
function monGrid() {
  const q = ui.q.trim().toLowerCase();
  const ids = D.MON_IDS.filter(id => { const d = D.DEX[id]; if (ui.tf && d.type !== ui.tf) return false; if (!q) return true; return d.name.toLowerCase().includes(q) || tName(d.type).toLowerCase().includes(q) || d.pool.some(m => D.MOVES[m].name.toLowerCase().includes(q)); });
  return ids.length ? ids.map(id => monCard(id)).join('') : '<p class="hint">No monster matches.</p>';
}
function pMonster(id) {
  const d = D.DEX[id]; if (!d) return null;
  const tot = Object.values(d.base).reduce((a, b) => a + b, 0), dm = defMatch(d.type), om = offMatch(d.type);
  const lv = (k) => TR.calcStat(d.base[k], k === 'hp');
  const usedBy = D.PRESET_IDS.filter(p => D.PRESETS[p].team.some(s => s.mon === id));
  return { title: d.name, body: `<div class="hero" style="--tc:${tCol(d.type)}"><img src="${art(id)}" alt="${esc(d.name)}"><div><h1>${esc(d.name)}</h1>${tBadge(d.type)}<p class="hint">Base total ${tot}</p></div></div>
    <h2>📊 Base stats</h2><div class="stats">${Object.keys(d.base).map(k => `<div class="sr"><span class="sl">${STATL[k]}</span><span class="sv">${d.base[k]}</span><span class="st"><i style="width:${Math.min(100, d.base[k] / 1.3)}%;background:${d.base[k] >= 100 ? '#5fd35a' : d.base[k] >= 70 ? '#f2c933' : '#ef8a4a'}"></i></span><span class="s5">${lv(k)}</span></div>`).join('')}<div class="hint">Right column = the stat at level ${R.level}.</div></div>
    <h2>🛡 Matchups (when hit)</h2>
    <div class="mm"><div class="ml">😣 Weak to ×2</div>${chips(dm.weak, 'bad')}</div>
    <div class="mm"><div class="ml">💪 Resists ×½</div>${chips(dm.resist, 'good')}</div>
    <div class="mm"><div class="ml">🚫 Immune ×0</div>${chips(dm.immune, 'good')}</div>
    ${R.immune && Object.entries(R.immune).filter(([, t]) => t === d.type).map(([s]) => `<div class="mm"><div class="ml">✨ Can't get</div><span class="tchip">${R.statusIcon[s]} ${R.statusName[s]}</span></div>`).join('')}
    <h2>⚔ Its ${tName(d.type)} moves hit</h2><div class="mm"><div class="ml">×2</div>${chips(om.strong, 'good')}</div><div class="mm"><div class="ml">×½</div>${chips(om.weak, 'bad')}</div>${om.none.length ? `<div class="mm"><div class="ml">×0</div>${chips(om.none, 'bad')}</div>` : ''}
    <h2>💥 Moves <small class="hint">★ = default set</small></h2><div class="list">${d.moves.map(m => moveRow(m, true)).join('')}${d.pool.filter(m => !d.moves.includes(m)).map(m => moveRow(m)).join('')}</div>
    ${usedBy.length ? `<h2>🎓 In preset teams</h2><div class="list">${usedBy.map(p => trRow(D.PRESETS[p], 'trainer')).join('')}</div>` : ''}` };
}
const SORTS = [['name', 'Name'], ['type', 'Type'], ['pow', '💥'], ['acc', '🎯'], ['pri', '⚡'], ['eff', 'Effect']];
function sortedMoves() {
  const key = { name: (m) => m.name, type: (m) => (m.type ? TIDS.indexOf(m.type) : 99) * 1000 - m.pow, pow: (m) => m.pow, acc: (m) => (m.acc == null ? 101 : m.acc), pri: (m) => m.pri, eff: (m) => (moveEffects(m)[0] || '~') }[ui.sort];
  return D.MOVE_IDS.filter(id => !ui.mtf || (D.MOVES[id].type || 'none') === ui.mtf).sort((a, b) => { const x = key(D.MOVES[a]), y = key(D.MOVES[b]); return (x < y ? -1 : x > y ? 1 : D.MOVES[a].name < D.MOVES[b].name ? -1 : 1) * (x === y ? 1 : ui.dir); });
}
function pMoves() {
  return { title: '💥 Moves', body: `<div class="lbl">Sort by (tap again to flip)</div><div class="seg sorts">${SORTS.map(([k, l]) => `<button class="${ui.sort === k ? 'on' : ''}" data-sort="${k}">${l}${ui.sort === k ? (ui.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`).join('')}</div>
    <div class="chips tf">${[['', '✱ All']].concat(TIDS.map(t => [t, tIc(t)]), [['none', '⭘']]).map(([t, l]) => `<button class="tfb${ui.mtf === t ? ' on' : ''}" data-mtf="${t}" style="--tc:${t && t !== 'none' ? tCol(t) : '#8a8f78'}" aria-label="${t ? (t === 'none' ? 'Typeless' : tName(t)) : 'All types'}">${l}</button>`).join('')}</div>
    <div class="list" id="mlist">${sortedMoves().map(id => moveRow(id)).join('')}</div>` };
}
function pMove(id) {
  const m = D.MOVES[id]; if (!m) return null;
  const L = learners(id), def = L.filter(x => D.DEX[x].moves.includes(id));
  const fx = moveEffects(m);
  return { title: m.name, body: `<div class="hero" style="--tc:${tCol(m.type)}"><div class="bigic">${tIc(m.type)}</div><div><h1>${esc(m.name)}</h1>${tBadge(m.type)} <span class="tb2" style="--tc:#555">${CAT[m.cat][0]} ${CAT[m.cat][1]}</span></div></div>
    <div class="facts"><div><span>💥</span><b>${m.pow || '—'}</b><small>power</small></div><div><span>🎯</span><b>${m.acc == null ? '∞' : m.acc + '%'}</b><small>accuracy</small></div><div><span>⚡</span><b>${m.pri ? '+' + m.pri : '0'}</b><small>priority</small></div><div><span>✨</span><b>${pct(R.critStages[Math.min(R.critStageMax, m.crit)])}</b><small>crit</small></div></div>
    <h2>🧪 Effect</h2><div class="list">${(fx.length ? fx : [m.pow ? '💥 plain hit' : '—']).map(t => `<div class="fx">${esc(t)}</div>`).join('')}<div class="hint">${m.pow ? `${CAT[m.cat][2]}; ×${R.stab} when the user is ${tName(m.type)}${m.type ? '' : ' (typeless moves never get it)'}.` : 'Status move: no damage.'}${m.acc == null ? ' Never misses.' : ''}</div></div>
    <h2>🐾 Learned by ${L.length}</h2><div class="grid">${L.map(x => monCard(x, def.includes(x) ? ' · ★' : '')).join('')}</div><div class="hint">★ = in its default set.</div>` };
}
function pTypes() {
  const chart = `<div class="chartw"><table class="chart"><thead><tr><th class="corner">⚔↓ 🛡→</th>${TIDS.map(t => `<th><a href="#type/${t}" style="--tc:${tCol(t)}" aria-label="${tName(t)}">${tIc(t)}</a></th>`).join('')}</tr></thead><tbody>${TIDS.map(a => `<tr><th><a href="#type/${a}" style="--tc:${tCol(a)}" aria-label="${tName(a)}">${tIc(a)}</a></th>${TIDS.map(d => { const e = D.eff(a, d); return `<td class="${e === 0 ? 'z' : e > 1 ? 'g' : e < 1 ? 'r' : ''}">${e === 1 ? '' : effTxt(e).slice(1)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div><div class="hint">Rows = attacking move type, columns = defending monster type. Green ×2, red ×½, black ×0, empty ×1. Typeless moves are ×1 against everything.</div>`;
  const list = `<div class="list">${TIDS.map(t => { const o = offMatch(t), dd = defMatch(t); return `<a class="trow2" href="#type/${t}" style="--tc:${tCol(t)}"><span class="ti big">${tIc(t)}</span><span class="t"><b>${tName(t)}</b><small>⚔ ×2 → ${o.strong.map(tIc).join(' ') || '—'}${o.none.length ? ' · ×0 → ' + o.none.map(tIc).join(' ') : ''}</small><small>🛡 weak to ${dd.weak.map(tIc).join(' ') || '—'}${dd.immune.length ? ' · immune ' + dd.immune.map(tIc).join(' ') : ''}</small></span><span class="chev">›</span></a>`; }).join('')}</div>`;
  return { title: '🔺 Types', body: `<div class="seg">${[['chart', '▦ Chart'], ['list', '☰ List']].map(([k, l]) => `<button class="${ui.tview === k ? 'on' : ''}" data-tview="${k}">${l}</button>`).join('')}</div>${ui.tview === 'chart' ? chart : list}` };
}
function pType(t) {
  if (!TY[t]) return null;
  const o = offMatch(t), dd = defMatch(t), mons = D.MON_IDS.filter(id => D.DEX[id].type === t), mvs = D.MOVE_IDS.filter(id => D.MOVES[id].type === t);
  const imm = Object.entries(R.immune).filter(([, x]) => x === t);
  return { title: tName(t), body: `<div class="hero" style="--tc:${tCol(t)}"><div class="bigic">${tIc(t)}</div><div><h1>${tName(t)}</h1><p class="hint">${mons.length} monsters · ${mvs.length} moves</p></div></div>
    <h2>⚔ Attacking with ${tName(t)}</h2><div class="mm"><div class="ml">×2 super</div>${chips(o.strong, 'good')}</div><div class="mm"><div class="ml">×½ weak</div>${chips(o.weak, 'bad')}</div>${o.none.length ? `<div class="mm"><div class="ml">×0 no effect</div>${chips(o.none, 'bad')}</div>` : ''}
    <h2>🛡 Defending as ${tName(t)}</h2><div class="mm"><div class="ml">😣 Weak to</div>${chips(dd.weak, 'bad')}</div><div class="mm"><div class="ml">💪 Resists</div>${chips(dd.resist, 'good')}</div><div class="mm"><div class="ml">🚫 Immune</div>${chips(dd.immune, 'good')}</div>
    ${imm.length ? `<div class="mm"><div class="ml">✨ Can't get</div>${imm.map(([s]) => `<span class="tchip">${R.statusIcon[s]} ${R.statusName[s]}</span>`).join('')}</div>` : ''}
    <h2>🐾 Monsters</h2><div class="grid">${mons.map(x => monCard(x)).join('')}</div>
    <h2>💥 Moves</h2><div class="list">${mvs.map(x => moveRow(x)).join('')}</div>` };
}
function pRules() {
  // a live worked example from the real damage function
  const A = TR.mkMon({ mon: 'flarelynx', moves: ['inferno'] }), B = TR.mkMon({ mon: 'thornback', moves: ['vinelash'] }), mv = D.MOVES.inferno;
  const lo = TR.damage(A, B, mv, false, R.rollMin), hi = TR.damage(A, B, mv, false, R.rollMax), cr = TR.damage(A, B, mv, true, R.rollMax);
  const stg = [-6, -2, -1, 0, 1, 2, 6];
  const S = (ic, t, body) => `<section class="rs"><h2>${ic} ${t}</h2>${body}</section>`;
  const st = (s, txt) => `<div class="fx"><span class="si">${R.statusIcon[s]}</span><b>${R.statusName[s][0].toUpperCase() + R.statusName[s].slice(1)}</b> ${txt}</div>`;
  return { title: '📜 Battle rules', body:
    S('💥', 'Damage', `<div class="formula">base = ⌊⌊⌊2·L/5 + 2⌋ · Power · A / D⌋ / 50⌋ + 2<br>damage = base × STAB × type × crit × random</div>
      <div class="hint">L = level ${R.level}. 💪 Physical: A = Atk, D = Def. 🔮 Special: A = SpA, D = SpD. random = ${R.rollMin}–${R.rollMax} (${R.rolls} steps). Type ×0 = no damage, otherwise at least 1.</div>
      <div class="fx">🧮 Example: ${esc(A.name)} (SpA ${A.st.spa}) uses ${tIc(mv.type)} ${mv.name} (💥${mv.pow}) on ${esc(B.name)} (SpD ${B.st.spd}): ×${R.stab} same type, ×${D.eff(mv.type, B.type)} type → <b>${lo}–${hi}</b> of ${B.max} HP, crit ${cr}.</div>`)
    + S('🟰', 'Same-type bonus (STAB)', `<div class="fx">A move that matches its user's type does <b>×${R.stab}</b>. Typeless ⭘ moves never get it.</div>`)
    + S('✨', 'Critical hits', `<div class="fx">Crit = <b>×${R.critMult}</b> damage and ignores the attacker's lowered Atk/SpA and the defender's raised Def/SpD.</div><div class="tbl">${R.critStages.map((c, i) => `<div><small>stage ${i}</small><b>${pct(c)}</b></div>`).join('')}</div><div class="hint">Stage = the move's crit bonus + ✨ Sharpen boosts (max ${R.critStageMax}).</div>`)
    + S('📈', 'Stat, accuracy and evasion stages', `<div class="hint">Each stat goes from −${R.stageMax} to +${R.stageMax}. Switching out resets them.</div>
      <div class="tbl"><div><small>stage</small><b>Atk…Spe</b><b>Acc/Eva</b></div>${stg.map(s => `<div><small>${s > 0 ? '+' + s : s}</small><b>×${Math.round(TR.stgM(s) * 100) / 100}</b><b>×${Math.round(TR.accM(s) * 100) / 100}</b></div>`).join('')}</div>
      <div class="fx">🎯 Hit chance = move accuracy × Acc/Eva multiplier of (attacker accuracy − defender evasion). ∞ moves never miss.</div>`)
    + S('⏩', 'Turn order', `<div class="fx">↩ Switches and 🎒 items happen first, then moves by ⚡ priority, then by speed (paralysis halves it), ties at random.</div><div class="fx">☠ 🔥 Poison and burn hurt at the end of each turn. After ${R.turnCap} turns the side with more HP left wins.</div>`)
    + S('💤', 'Statuses', st('slp', `skips ${R.sleepMin}–${R.sleepMax} turns, then wakes up. (💤 Deep Rest: full heal, then ${R.restSleep} turns.)`)
      + st('par', `speed ×${R.parSpeed}, and ${pct(R.parSkip)} chance to skip each turn.`)
      + st('psn', `loses ${frac(R.psnFrac)} of max HP each turn.`)
      + st('brn', `loses ${frac(R.brnFrac)} of max HP each turn, physical damage ×${R.brnAtk}.`)
      + st('cnf', `${R.cnfMin}–${R.cnfMax} turns; ${pct(R.cnfSelf)} chance to hit itself (💥${R.cnfPow} typeless) instead. Ends on switch.`)
      + `<div class="hint">One major status at a time (confusion can stack on top). Immune: ${Object.entries(R.immune).map(([s, t]) => `${tIc(t)} can't get ${R.statusIcon[s]}`).join(', ')}.</div>`)
    + S('🎒', 'Items', `<div class="list">${Object.entries(D.ITEMS).map(([k, it]) => `<div class="fx"><span class="si">${it.icon}</span><b>${it.name}</b> ${it.heal ? `+${it.heal} HP` : k === 'full' ? 'cures sleep, paralysis, poison, burn and confusion' : `brings a fainted monster back with ${pct(R.reviveFrac)} HP`}</div>`).join('')}</div>
      <div class="hint">Using an item takes the turn. The bag is limited. The AI only considers an item when its rule fires:</div>
      <div class="chartw"><table class="itbl"><thead><tr><th>Trainer</th><th>🧪 ≤</th><th>⚗ ≤</th><th>💖 when</th><th>💊 💤</th><th>👜</th></tr></thead><tbody>${D.PRESET_IDS.map(id => { const t = D.PRESETS[id], I = t.items; return `<tr><td><a href="#trainer/${id}">${esc(t.icon)} ${esc(t.name.split(' ')[0])}</a></td><td>${pct(I.healAt)}</td><td>${pct(I.superAt)}</td><td>${I.reviveAt ? I.reviveAt + ' out' : 'never'}</td><td>${I.fullHealSleep ? '✔' : '—'}</td><td>${Object.keys(D.ITEMS).map(k => D.ITEMS[k].icon + t.bag[k]).join(' ')}</td></tr>`; }).join('')}</tbody></table></div>`) };
}
function trRow(t, route, mine) {
  return `<a class="trow2" href="#${route}/${encodeURIComponent(t.id)}"><span class="ti big">${esc(t.icon)}</span><span class="t"><b>${mine ? '✎ ' : ''}${esc(t.name)}</b><span class="tm">${t.team.map(s => `<img src="${art(s.mon)}" alt="">`).join('')}</span><small>${esc(summary(t))}</small></span><span class="chev">›</span></a>`;
}
function pTrainers() {
  const mine = myTrainers();
  return { title: '🎓 Trainers', body: `<p class="hint">Each trainer scores every legal action with these weights and picks the top one. Bars = the trainer's strongest weights.</p>
    <div class="list">${D.PRESET_IDS.map(id => { const t = D.PRESETS[id]; return `${trRow(t, 'trainer')}${bars(t, topFeats(t, 3))}`; }).join('')}</div>
    ${mine.length ? `<h2>✎ Your trainers (edited in 🛠)</h2><div class="list">${mine.map(t => `${trRow(t, 'mytrainer', true)}${bars(t, topFeats(t, 3))}`).join('')}</div>` : ''}` };
}
function pTrainer(id, mine) {
  let t = null;
  if (mine) { const L = D.load(); t = L.doc.trainers[id]; } else t = D.PRESETS[id] || D.load().doc.trainers[id];
  if (!t) return null;
  const custom = mine || !D.PRESETS[id];
  return { title: t.name, body: `<div class="hero"><div class="bigic">${esc(t.icon)}</div><div><h1>${custom ? '✎ ' : ''}${esc(t.name)}</h1><p class="hint">${esc(summary(t))}</p>${EMBED ? '' : `<a class="btn" href="editor.html#score:${encodeURIComponent(t.id)}">🛠 Edit</a>`}</div></div>
    <h2>🧬 Team <small class="hint">first 3 play 3 v 3</small></h2><div class="list">${t.team.map((s, i) => `<div class="slot2"><a class="mc sm" href="#monster/${s.mon}"><img src="${art(s.mon)}" alt=""><b>${i + 1}. ${esc(D.DEX[s.mon].name)}</b><small>${tIc(D.DEX[s.mon].type)}</small></a><div class="mvl">${s.moves.map(m => `<a class="mvc" href="#move/${m}" style="--tc:${tCol(D.MOVES[m].type)}">${tIc(D.MOVES[m].type)} ${esc(D.MOVES[m].name)}</a>`).join('')}</div></div>`).join('')}</div>
    <h2>📊 Scoring weights</h2>${bars(t, Object.keys(FEAT))}
    <h2>🧠 Personality and rules</h2><div class="kv">
      <div><span>🎲 Temperature</span><b>${t.pers.temp}</b></div><div><span>🔥 Aggression</span><b>×${t.pers.aggr}</b></div><div><span>🧗 Risk tolerance</span><b>${pct(t.pers.risk)}</b></div>
      <div><span>🔁 Switching</span><b>${t.sw.never ? 'never' : `HP ≤ ${pct(t.sw.hp)} or matchup ≤ −${t.sw.bad}`}</b></div>
      <div><span>🧪 Potion / ⚗ Super</span><b>≤ ${pct(t.items.healAt)} / ≤ ${pct(t.items.superAt)}</b></div><div><span>💖 Revive</span><b>${t.items.reviveAt ? t.items.reviveAt + ' out' : 'never'}</b></div>
      <div><span>💊 Full Heal on 💤</span><b>${t.items.fullHealSleep ? 'yes' : 'no'}</b></div><div><span>👜 Bag</span><b>${Object.keys(D.ITEMS).map(k => D.ITEMS[k].icon + '×' + t.bag[k]).join(' ')}</b></div>
      <div><span>🎯 Move-kind bias</span><b>💥${t.movePri.attack} 💤${t.movePri.status} 📈${t.movePri.setup} ❤${t.movePri.heal}</b></div></div>` };
}

// ---------------------------------------------------------------- router + back navigation
// in-wiki depth lives in history.state, so back works after reloads and with the browser's own back button
const wkDepth = () => (history.state && typeof history.state.wk === 'number' ? history.state.wk : 0);
let lastDepth = 0;
if (!history.state || typeof history.state.wk !== 'number') history.replaceState({ wk: 0 }, ''); else lastDepth = history.state.wk;
const parentOf = (r) => ({ monster: '#monsters', move: '#moves', type: '#types', trainer: '#trainers', mytrainer: '#trainers' }[r] || '#');
function route() { const h = decodeURIComponent((location.hash || '#').slice(1)); const i = h.indexOf('/'); return i < 0 ? [h, ''] : [h.slice(0, i), h.slice(i + 1)]; }
function render() {
  const [r, id] = route();
  const P = { '': pHome, monsters: pMonsters, moves: pMoves, types: pTypes, rules: pRules, trainers: pTrainers }[r];
  let pg = P ? P() : r === 'monster' ? pMonster(id) : r === 'move' ? pMove(id) : r === 'type' ? pType(id) : r === 'trainer' ? pTrainer(id) : r === 'mytrainer' ? pTrainer(id, true) : null;
  if (!pg) pg = { title: '❓ Not found', body: `<p class="hint">No wiki entry for “${esc(r + (id ? '/' + id : ''))}”.</p><a class="row" href="#"><span class="ic">📖</span><span class="t"><b>Wiki home</b></span></a>` };
  $('ttl').textContent = pg.title;
  document.title = pg.title + ' · Trainers wiki';
  $('main').innerHTML = pg.body;
  $('main').dataset.route = r + (id ? '/' + id : '');
  $('bBack').hidden = !r && EMBED;
  $('bBack').textContent = r ? '←' : '← Game';
  $('bBack').setAttribute('aria-label', r ? 'Back' : 'Back to the game');
}
function back() {
  const [r] = route();
  if (!r) { if (!EMBED) location.href = 'index.html'; return; }
  if (wkDepth() > 0) history.back(); else location.hash = parentOf(r);
}
addEventListener('hashchange', () => {
  if (!history.state || typeof history.state.wk !== 'number') history.replaceState({ wk: lastDepth + 1 }, ''); // a new in-wiki page
  lastDepth = wkDepth(); window.scrollTo(0, 0); render();
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (b.id === 'bBack') { back(); return; }
  if (d.tf !== undefined) { ui.tf = d.tf; document.querySelectorAll('[data-tf]').forEach(x => x.classList.toggle('on', x.dataset.tf === ui.tf)); $('grid').innerHTML = monGrid(); return; }
  if (d.sort) { if (ui.sort === d.sort) ui.dir = -ui.dir; else { ui.sort = d.sort; ui.dir = d.sort === 'pow' || d.sort === 'acc' || d.sort === 'pri' ? -1 : 1; } render(); return; }
  if (d.mtf !== undefined) { ui.mtf = d.mtf; render(); return; }
  if (d.tview) { ui.tview = d.tview; render(); return; }
});
document.addEventListener('input', (e) => { if (e.target.id === 'q') { ui.q = e.target.value; $('grid').innerHTML = monGrid(); } });
const orient = () => document.body.classList.toggle('land', innerWidth > innerHeight);
addEventListener('resize', orient); orient();
render();
// test hooks
window.WK = { render, route, ui, get depth() { return wkDepth(); }, moveEffects, summary, learners };
})();
