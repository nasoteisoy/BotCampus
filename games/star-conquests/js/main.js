// Star Conquests — shell integrator (title, galaxy map, shop, battles, win/lose).
import { PLANETS, LINKS, BIOME_COLOR, neighbors, planetById } from './galaxy.js';
import { CATALOG, STAT_LABELS, GROUND_TYPES, SPACE_TYPES, unitIconHtml } from './shop.js';
import { hasSave, loadSave, clearSave } from './save.js';
import {
  newGame, restoreGame, autosave, buyUnit, moveUnits, prepareAttack,
  applyStageResult, resolveAttackEnd, enemyPlan, applyEnemyMove,
  prepareEnemyAttack, endPlayerTurn, endEnemyTurn, checkEnd,
  PLAYER, ENEMY, COLORS,
} from './state.js';
import { runFullAttack } from './battle-runner.js';

const app = document.getElementById('app');
let state = null;
let selectedUnits = new Set();
let mode = 'map'; // map | shop | battle | title | end
let toastTimer = 0;

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

function show(screen) {
  mode = screen;
  for (const el of app.querySelectorAll('.screen')) el.classList.add('hidden');
  const s = app.querySelector(`#scr-${screen}`);
  if (s) s.classList.remove('hidden');
}

function renderTitle() {
  show('title');
  const cont = app.querySelector('#btn-continue');
  cont.classList.toggle('hidden', !hasSave());
  cont.hidden = !hasSave();
}

function startNew() {
  clearSave();
  state = newGame();
  selectedUnits = new Set();
  autosave(state);
  renderMap();
  // first-run hint (below header; no toast — avoids covering chips)
  const hint = app.querySelector('#hint');
  if (hint) { hint.hidden = false; setTimeout(() => { hint.hidden = true; }, 4500); }
}

function continueGame() {
  const data = loadSave();
  if (!data) { startNew(); return; }
  state = restoreGame(data);
  selectedUnits = new Set();
  if (state.result === 'win' || state.result === 'lose') renderEnd();
  else renderMap();
  toast('✓ Loaded');
}

function renderMap() {
  show('map');
  const st = state;
  app.querySelector('#pts').textContent = st.points;
  app.querySelector('#turn-n').textContent = st.turn;
  app.querySelector('#phase-l').textContent = st.phase === 'enemy' ? '💀 Enemy' : '👤 You';

  const svg = app.querySelector('#map-svg');
  const nodes = app.querySelector('#planets');
  // links
  let lines = '';
  for (const [a, b] of LINKS) {
    const A = planetById(a), B = planetById(b);
    lines += `<line x1="${A.x}%" y1="${A.y}%" x2="${B.x}%" y2="${B.y}%" class="link"/>`;
  }
  svg.innerHTML = lines;

  nodes.innerHTML = '';
  for (const p of PLANETS) {
    const owner = st.owners[p.id];
    const g = st.garrisons[p.id] || [];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'planet' + (st.selected === p.id ? ' on' : '') + (owner === PLAYER ? ' mine' : ' foe');
    btn.style.left = p.x + '%';
    btn.style.top = p.y + '%';
    btn.style.setProperty('--biome', BIOME_COLOR[p.biome] || '#888');
    btn.dataset.id = p.id;
    btn.setAttribute('aria-label', `${p.name}, ${owner === PLAYER ? 'yours' : 'enemy'}`);
    const nG = g.filter((u) => GROUND_TYPES.has(u.type)).length;
    const nS = g.filter((u) => SPACE_TYPES.has(u.type)).length;
    btn.innerHTML = `
      <span class="p-ic" style="font-size:${18 + p.size * 6}px">${p.icon}</span>
      <span class="p-name">${p.name}</span>
      <span class="p-own">${owner === PLAYER ? '🔵' : '🔴'}</span>
      <span class="p-count" title="Units">🪖${nG} 🚀${nS}</span>`;
    btn.addEventListener('click', () => selectPlanet(p.id));
    nodes.appendChild(btn);
  }

  renderPanel();
}

function selectPlanet(id) {
  if (!state || state.phase !== 'player') return;
  const prev = state.selected;
  state.selected = id;
  // if selecting a different owned planet while units selected → try move
  // else just select
  selectedUnits = new Set();
  renderMap();
  if (prev && prev !== id) {
    // show actions in panel
  }
}

function renderPanel() {
  const panel = app.querySelector('#panel');
  const id = state.selected;
  const p = planetById(id);
  if (!p) { panel.innerHTML = ''; return; }
  const owner = state.owners[id];
  const g = state.garrisons[id] || [];
  const mine = owner === PLAYER;
  const linked = neighbors(id);

  let html = `
    <div class="pan-head">
      <span class="ph-ic">${p.icon}</span>
      <div><b>${p.name}</b><small>${p.biome} · ${mine ? '🔵 Yours' : '🔴 Enemy'}</small></div>
    </div>
    <div class="pan-units" role="list">`;

  if (!g.length) html += `<p class="empty">No units</p>`;
  for (const u of g) {
    const canPick = mine && state.phase === 'player';
    const on = selectedUnits.has(u.id);
    html += `<button type="button" class="unit ${on ? 'on' : ''}" data-uid="${u.id}" ${canPick ? '' : 'disabled'}
      aria-pressed="${on}" aria-label="${u.name}">
      <span class="u-ic">${unitIconHtml(u)}</span>
      <span class="u-nm">${u.name}</span>
      <span class="u-hp"><small>❤️ HP</small> ${Math.ceil(u.hpNow)}/${u.stats.hp}</span>
    </button>`;
  }
  html += `</div><div class="pan-actions">`;

  if (mine && state.phase === 'player') {
    // Shop lives only in the bottom bar (one place).
    const friendly = linked.filter((n) => state.owners[n] === PLAYER);
    const hostile = linked.filter((n) => state.owners[n] !== PLAYER);
    if (!selectedUnits.size) {
      html += `<p class="tip">👆 Pick units, then Attack or Move</p>`;
    } else {
      for (const n of friendly) {
        const np = planetById(n);
        html += `<button type="button" class="btn move" data-act="move" data-to="${n}">➡️ ${np.icon} Move</button>`;
      }
      for (const n of hostile) {
        const np = planetById(n);
        html += `<button type="button" class="btn attack" data-act="attack" data-to="${n}">⚔️ ${np.icon} Attack</button>`;
      }
    }
  } else if (!mine && state.phase === 'player') {
    // find owned linked planets to attack from
    const froms = linked.filter((n) => state.owners[n] === PLAYER);
    if (froms.length) {
      html += `<p class="tip">Select units on a linked 🔵 planet, then Attack</p>`;
      for (const f of froms) {
        html += `<button type="button" class="btn secondary" data-act="goto" data-to="${f}">⬅️ ${planetById(f).icon}</button>`;
      }
    }
  }

  html += `</div>`;
  panel.innerHTML = html;

  panel.querySelectorAll('.unit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.uid;
      if (selectedUnits.has(uid)) selectedUnits.delete(uid);
      else selectedUnits.add(uid);
      renderPanel();
      // re-highlight planets
      app.querySelectorAll('.planet').forEach((el) => el.classList.toggle('on', el.dataset.id === state.selected));
    });
  });
  panel.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => onPanelAct(btn.dataset.act, btn.dataset.to));
  });
}

function onPanelAct(act, to) {
  if (act === 'shop') { renderShop(); return; }
  if (act === 'goto') { selectPlanet(to); return; }
  if (act === 'move') {
    const r = moveUnits(state, state.selected, to, [...selectedUnits]);
    if (!r.ok) { toast('⛔ Cannot move'); return; }
    selectedUnits = new Set();
    state.selected = to;
    toast('➡️ Moved');
    renderMap();
    return;
  }
  if (act === 'attack') {
    beginAttack(state.selected, to, [...selectedUnits]);
  }
}

async function beginAttack(fromId, toId, unitIds) {
  const ctx = prepareAttack(state, fromId, toId, unitIds);
  if (!ctx.ok) { toast('⛔ Cannot attack'); return; }
  state.phase = 'battle';
  show('battle');
  const mount = app.querySelector('#battle-mount');
  const label = app.querySelector('#battle-label');

  const applyStage = (result, stage) => {
    const w = applyStageResult(state, ctx, result, stage);
    toast(result.pointsEarned ? `💰 +${result.pointsEarned}` : (w === 'attacker' ? '✅' : '❌'));
    return w;
  };

  const { finalWinner } = await runFullAttack({
    ctx,
    playerIsAttacker: true,
    mount,
    onStage: (t) => { label.textContent = t === 'space' ? '🚀 Space battle' : '⚔️ Ground battle'; },
    applyStage,
  });

  const end = resolveAttackEnd(state, ctx, finalWinner);
  selectedUnits = new Set();
  state.phase = 'player';
  if (end === 'win' || end === 'lose') { renderEnd(); return; }
  toast(finalWinner === 'attacker' ? '🏁 Victory' : '↩️ Held off');
  renderMap();
}

function renderShop() {
  show('shop');
  const planetId = state.selected;
  const p = planetById(planetId);
  if (!p || state.owners[planetId] !== PLAYER) {
    // pick first owned
    const own = PLANETS.find((x) => state.owners[x.id] === PLAYER);
    if (own) state.selected = own.id;
  }
  const dest = planetById(state.selected);
  app.querySelector('#shop-pts').textContent = state.points;
  app.querySelector('#shop-dest').textContent = `${dest.icon} ${dest.name}`;

  // planet picker
  const pick = app.querySelector('#shop-planets');
  pick.innerHTML = '';
  for (const pl of PLANETS.filter((x) => state.owners[x.id] === PLAYER)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (pl.id === state.selected ? ' on' : '');
    b.textContent = `${pl.icon} ${pl.name}`;
    b.addEventListener('click', () => { state.selected = pl.id; renderShop(); });
    pick.appendChild(b);
  }

  const grid = app.querySelector('#shop-grid');
  grid.innerHTML = '';
  for (const c of CATALOG) {
    const card = document.createElement('button');
    card.type = 'button';
    const need = Math.max(0, c.cost - state.points);
    const can = need === 0;
    card.className = 'shop-card' + (can ? '' : ' cant');
    // Avoid native disabled (browser greys whole card and hides "need 💰").
    card.setAttribute('aria-disabled', can ? 'false' : 'true');
    card.setAttribute('aria-label', can ? `Buy ${c.name} for ${c.cost}` : `${c.name}: need ${need} more points`);
    let stats = STAT_LABELS.map((s) =>
      `<span class="stat"><small>${s.icon} ${s.word}</small><b>${c.stats[s.key]}</b></span>`).join('');
    const foot = can
      ? `<span class="sc-buy">🛒 Buy</span>`
      : `<span class="sc-need"><small>need 💰</small>${need} more</span>`;
    card.innerHTML = `
      <span class="sc-ic">${unitIconHtml(c)}</span>
      <span class="sc-nm">${c.name}</span>
      <span class="sc-cost">💰 ${c.cost}</span>
      <div class="sc-stats">${stats}</div>
      ${foot}`;
    card.addEventListener('click', () => {
      if (!can) return;
      const r = buyUnit(state, c.type, state.selected);
      if (!r.ok) { toast(r.reason === 'points' ? '💰 Need points' : '⛔'); return; }
      toast(`✓ ${r.unit.icon} Bought`);
      renderShop();
    });
    grid.appendChild(card);
  }
}

function renderEnd() {
  show('end');
  const win = state.result === 'win';
  app.querySelector('#end-icon').textContent = win ? '🏆' : '💀';
  app.querySelector('#end-title').textContent = win ? 'Star Conquest!' : 'Defeated';
  app.querySelector('#end-sub').textContent = win
    ? `You hold every planet · 💰 ${state.points}`
    : `No planets left · Turn ${state.turn}`;
}

async function doEndTurn() {
  if (!state || state.phase !== 'player') return;
  endPlayerTurn(state);
  toast('💀 Enemy turn');
  renderMap();
  app.querySelector('#endturn').disabled = true;

  // AI moves
  const plan = enemyPlan(state);
  for (const m of plan.moves) {
    applyEnemyMove(state, m);
    await wait(400);
    renderMap();
  }

  if (plan.attack) {
    const ctx = prepareEnemyAttack(state, plan.attack);
    state.phase = 'battle';
    show('battle');
    const mount = app.querySelector('#battle-mount');
    const label = app.querySelector('#battle-label');
    const playerIsAttacker = false;

    const applyStage = (result, stage) => applyStageResult(state, ctx, result, stage);

    const { finalWinner } = await runFullAttack({
      ctx,
      playerIsAttacker,
      mount,
      onStage: (t) => { label.textContent = t === 'space' ? '🚀 Enemy space' : '⚔️ Enemy ground'; },
      applyStage,
    });
    const end = resolveAttackEnd(state, ctx, finalWinner);
    if (end === 'win' || end === 'lose') {
      app.querySelector('#endturn').disabled = false;
      renderEnd();
      return;
    }
  }

  endEnemyTurn(state);
  const ended = checkEnd(state);
  app.querySelector('#endturn').disabled = false;
  if (ended) { renderEnd(); return; }
  toast('👤 Your turn');
  renderMap();
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function buildShell() {
  app.innerHTML = `
  <section id="scr-title" class="screen">
    <div class="title-bg" aria-hidden="true">
      <div class="stars"></div>
      <svg class="title-planet" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
        <circle cx="100" cy="100" r="72" fill="#e8892a"/>
        <ellipse cx="100" cy="100" rx="96" ry="22" fill="none" stroke="#f5d76e" stroke-width="8" transform="rotate(-18 100 100)"/>
        <ellipse cx="100" cy="100" rx="96" ry="22" fill="none" stroke="#c9a010" stroke-width="2.5" opacity=".75" transform="rotate(-18 100 100)"/>
      </svg>
      <svg class="title-ships" viewBox="0 0 400 160" preserveAspectRatio="xMinYMid meet">
        <!-- fighters: fat wings + cockpit + nose, red trails -->
        <g class="ship ship-a">
          <line x1="8" y1="78" x2="100" y2="58" stroke="#e04848" stroke-width="5" stroke-linecap="round"/>
          <path d="M100 58 L125 52 L138 45 L148 52 L160 58 L148 64 L138 71 L125 64 Z" fill="#c9d2e8"/>
          <path d="M112 58 L128 38 L140 48 L124 58 Z" fill="#7a88a8"/>
          <path d="M112 58 L128 78 L140 68 L124 58 Z" fill="#7a88a8"/>
          <ellipse cx="142" cy="58" rx="8" ry="5.5" fill="#3aa0ff" stroke="#e8eefc" stroke-width="1.2"/>
          <path d="M148 55 L168 58 L148 61 Z" fill="#e8eefc"/>
        </g>
        <g class="ship ship-b">
          <line x1="36" y1="128" x2="148" y2="100" stroke="#e04848" stroke-width="5" stroke-linecap="round"/>
          <path d="M148 100 L180 92 L198 82 L212 92 L228 100 L212 108 L198 118 L180 108 Z" fill="#b8c4dc"/>
          <path d="M165 100 L188 72 L205 86 L178 100 Z" fill="#6a7898"/>
          <path d="M165 100 L188 128 L205 114 L178 100 Z" fill="#6a7898"/>
          <ellipse cx="205" cy="100" rx="10" ry="7" fill="#3aa0ff" stroke="#e8eefc" stroke-width="1.2"/>
          <path d="M212 96 L238 100 L212 104 Z" fill="#e8eefc"/>
        </g>
        <g class="ship ship-c">
          <line x1="175" y1="42" x2="258" y2="22" stroke="#e04848" stroke-width="4" stroke-linecap="round"/>
          <path d="M258 22 L278 18 L288 12 L298 18 L310 22 L298 26 L288 32 L278 26 Z" fill="#d8e0f0"/>
          <path d="M268 22 L282 8 L294 16 L280 22 Z" fill="#8a96b0"/>
          <path d="M268 22 L282 36 L294 28 L280 22 Z" fill="#8a96b0"/>
          <ellipse cx="292" cy="22" rx="6.5" ry="4.5" fill="#3aa0ff" stroke="#fff" stroke-width="1"/>
          <path d="M298 20 L314 22 L298 24 Z" fill="#fff"/>
        </g>
      </svg>
      <svg class="title-terrain" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 50 L40 28 L80 48 L120 18 L170 42 L220 22 L270 48 L320 24 L360 44 L400 30 L400 120 L0 120 Z" fill="#3a2416"/>
        <path d="M0 70 L50 48 L100 68 L160 40 L220 62 L290 45 L350 66 L400 52 L400 120 L0 120 Z" fill="#2a1a10"/>
      </svg>
      <svg class="title-troops" viewBox="0 0 200 70" preserveAspectRatio="xMinYMax meet" aria-hidden="true">
        <!-- side-view soldier silhouettes + one tank (un-stretched) -->
        <g fill="#3ecf6a">
          <!-- soldier 1 -->
          <g transform="translate(6,18)">
            <ellipse cx="8" cy="5" rx="5" ry="4.5"/>
            <path d="M3.5 3.2 Q8 0.5 12.5 3.2" fill="none" stroke="#2a9a4a" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M5 10 L5 28 L8.2 36 L11.2 28 L11.2 10 Z"/>
            <path d="M4.5 28 L3 40" stroke="#3ecf6a" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M11.5 28 L13 40" stroke="#3ecf6a" stroke-width="2.2" stroke-linecap="round"/>
            <rect x="11" y="14" width="16" height="2" rx="1"/>
            <rect x="25" y="12.8" width="4" height="1.4" rx=".4" fill="#2a9a4a"/>
            <circle cx="10" cy="15" r="1.6"/>
          </g>
          <!-- soldier 2 -->
          <g transform="translate(42,12)">
            <ellipse cx="8" cy="5" rx="5" ry="4.5"/>
            <path d="M3.5 3.2 Q8 0.5 12.5 3.2" fill="none" stroke="#2a9a4a" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M5 10 L5 30 L8.2 40 L11.2 30 L11.2 10 Z"/>
            <path d="M4.5 30 L3 44" stroke="#3ecf6a" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M11.5 30 L13 44" stroke="#3ecf6a" stroke-width="2.2" stroke-linecap="round"/>
            <rect x="11" y="15" width="17" height="2" rx="1"/>
            <rect x="26" y="13.8" width="4" height="1.4" rx=".4" fill="#2a9a4a"/>
            <circle cx="10" cy="16" r="1.6"/>
          </g>
          <!-- soldier 3 -->
          <g transform="translate(78,20)">
            <ellipse cx="7.5" cy="4.5" rx="4.6" ry="4.2"/>
            <path d="M3.2 2.8 Q7.5 0.4 11.8 2.8" fill="none" stroke="#2a9a4a" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M4.8 9.5 L4.8 26 L7.8 34 L10.8 26 L10.8 9.5 Z"/>
            <path d="M4.4 26 L3 38" stroke="#3ecf6a" stroke-width="2" stroke-linecap="round"/>
            <path d="M11 26 L12.4 38" stroke="#3ecf6a" stroke-width="2" stroke-linecap="round"/>
            <rect x="10.5" y="13.5" width="14" height="1.8" rx=".8"/>
            <rect x="23" y="12.4" width="3.5" height="1.2" rx=".3" fill="#2a9a4a"/>
          </g>
          <!-- tank -->
          <g transform="translate(112,28)">
            <rect x="0" y="14" width="36" height="10" rx="2"/>
            <path d="M4 14 L6 6 H22 L26 14 Z"/>
            <rect x="20" y="8" width="22" height="3" rx="1"/>
            <circle cx="7" cy="25" r="3.2"/>
            <circle cx="18" cy="25" r="3.2"/>
            <circle cx="29" cy="25" r="3.2"/>
            <circle cx="7" cy="25" r="1.2" fill="#2a9a4a"/>
            <circle cx="18" cy="25" r="1.2" fill="#2a9a4a"/>
            <circle cx="29" cy="25" r="1.2" fill="#2a9a4a"/>
          </g>
          <!-- soldier 4 -->
          <g transform="translate(158,16)">
            <ellipse cx="8" cy="5" rx="5" ry="4.5"/>
            <path d="M3.5 3.2 Q8 0.5 12.5 3.2" fill="none" stroke="#2a9a4a" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M5 10 L5 28 L8.2 38 L11.2 28 L11.2 10 Z"/>
            <path d="M4.5 28 L3 42" stroke="#3ecf6a" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M11.5 28 L13 42" stroke="#3ecf6a" stroke-width="2.2" stroke-linecap="round"/>
            <rect x="11" y="14.5" width="15" height="2" rx="1"/>
            <rect x="24.5" y="13.3" width="4" height="1.4" rx=".4" fill="#2a9a4a"/>
            <circle cx="10" cy="15.5" r="1.6"/>
          </g>
        </g>
      </svg>
    </div>
    <div class="card title-card">
      <h1>STAR CONQUESTS</h1>
      <p class="sub">Win battles · earn points · buy units</p>
      <button type="button" id="btn-new" class="btn primary big">▶️ New game</button>
      <button type="button" id="btn-continue" class="btn secondary big hidden" hidden>▶️ Continue</button>
    </div>
  </section>

  <section id="scr-map" class="screen hidden">
    <header class="bar">
      <button type="button" id="btn-home" class="icon-btn" aria-label="Title">⬅️</button>
      <div class="crumb" title="Star Conquests">🌌 Map</div>
      <div class="meta">
        <span class="pill" title="Points"><small>💰 Points</small> <b id="pts">0</b></span>
        <span class="pill" title="Turn"><small>🕐 Turn</small> <b id="turn-n">1</b></span>
        <span class="pill" id="phase-l">👤 You</span>
      </div>
    </header>
    <div id="hint" class="hint" hidden>👆 Tap planet · pick units · Attack</div>
    <div id="map-wrap">
      <svg id="map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div id="planets"></div>
    </div>
    <aside id="panel"></aside>
    <footer class="bar bottom">
      <button type="button" id="btn-shop" class="btn secondary">🛒 Shop</button>
      <button type="button" id="endturn" class="btn primary">✅ End turn</button>
    </footer>
  </section>

  <section id="scr-shop" class="screen hidden">
    <header class="bar">
      <button type="button" id="shop-back" class="icon-btn" aria-label="Back">⬅️</button>
      <div class="crumb">🛒 Shop</div>
      <div class="meta">
        <span class="pill"><small>💰 Points</small> <b id="shop-pts">0</b></span>
        <span class="pill"><small>📍 To</small> <b id="shop-dest"></b></span>
      </div>
    </header>
    <div id="shop-planets" class="chips"></div>
    <div id="shop-grid" class="shop-grid"></div>
  </section>

  <section id="scr-battle" class="screen hidden">
    <header class="bar">
      <div class="crumb" id="battle-label">⚔️ Battle</div>
    </header>
    <div id="battle-mount"></div>
  </section>

  <section id="scr-end" class="screen hidden">
    <div class="card title-card">
      <div class="logo" id="end-icon">🏆</div>
      <h1 id="end-title">Victory</h1>
      <p class="sub" id="end-sub"></p>
      <button type="button" id="btn-again" class="btn primary big">▶️ New game</button>
      <button type="button" id="btn-end-title" class="btn secondary big">⬅️ Title</button>
    </div>
  </section>`;

  app.querySelector('#btn-new').addEventListener('click', startNew);
  app.querySelector('#btn-continue').addEventListener('click', continueGame);
  app.querySelector('#btn-home').addEventListener('click', () => { autosave(state); renderTitle(); });
  app.querySelector('#btn-shop').addEventListener('click', () => {
    if (state.owners[state.selected] !== PLAYER) {
      const own = PLANETS.find((x) => state.owners[x.id] === PLAYER);
      if (own) state.selected = own.id;
    }
    renderShop();
  });
  app.querySelector('#endturn').addEventListener('click', doEndTurn);
  app.querySelector('#shop-back').addEventListener('click', () => renderMap());
  app.querySelector('#btn-again').addEventListener('click', startNew);
  app.querySelector('#btn-end-title').addEventListener('click', renderTitle);
}

buildShell();
renderTitle();
