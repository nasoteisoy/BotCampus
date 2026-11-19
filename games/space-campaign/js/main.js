// Space Campaign: fly your carrier across the sector, guard Empire convoys from pirates, mine, salvage and trade,
// and grow a fleet. Fights auto-resolve from fleet strength, or you launch and fly the Space Carrier battle yourself.
import * as THREE from 'three';
import { loadAssets, thumbnail } from './assets.js';
import { createMap } from './map.js';
import { createBattle } from './battle.js';
import { createAudio } from './audio.js';
import { icon } from './icons.js';
import { GOODS, GOOD_IDS, NODES, SHIPS, SHIP_IDS, FLEET_MAX, TECH, TECH_IDS, GOAL_REP, NODE_ICON, OFFICER_MAX, OFFICER_SHIPS, OFFICER_COLORS } from './data.js';
import * as R from './state.js';

const Q = new URLSearchParams(location.search);
const TEST = Q.has('test'), DEV = Q.has('dev');
const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('pc', !isTouch);

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio); renderer.outputColorSpace = THREE.SRGBColorSpace;
const audio = createAudio();
const ui = { mode: 'loading', busy: false, panel: null, paused: false, thumbs: {}, fightLock: false, runActive: false, placing: -1, yardTo: -1, pick: null };
let S = null, map = null, battle = null, A = null;

// ---------- small helpers ----------
const ico = (el, name, size) => { el.innerHTML = icon(name, { size: size || 26 }); };
const I = (name, size = 24) => icon(name, { size });
const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
const NODE_LBL = { station: null, field: 'Asteroids', wreck: 'Wreck', nest: 'Pirate base', beacon: 'Beacon' };
const here = () => (S.node >= 0 ? NODES[S.node] : null); // the location whose bubble the carrier is in, or null in open space
const atStation = () => !!(here() && here().type === 'station');
// officer portrait: cap in the officer's colour + rank chevrons (no reading)
const portrait = (i, rank, cls = '') => `<span class="oport ${cls}" style="--oc:${OFFICER_COLORS[i]}">${I('officer', 30)}<span class="chev">${Array.from({ length: rank + 1 }, () => I('rank', 14)).join('')}</span></span>`;
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
// only a run the player started (New) or loaded (Continue) is ever written; the title backdrop never touches the save
function persist() { if (S && ui.runActive) R.save(S); }
function toast(iconName, text, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind;
  t.innerHTML = `<span class="ti">${I(iconName, 20)}</span><span>${text}</span>`;
  $('toasts').appendChild(t);
  while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, 2200);
}
// long-press / hover tips on anything with data-tip (every icon can explain itself)
const tipEl = $('tip'); let tipTimer = 0, tipShown = false;
function wireTips(root) {
  root.querySelectorAll('[data-tip]').forEach((b) => {
    if (b._tip) return; b._tip = true; b.title = b.dataset.tip;
    b.addEventListener('pointerdown', () => {
      clearTimeout(tipTimer); tipShown = false;
      tipTimer = setTimeout(() => {
        const r = b.getBoundingClientRect(); tipEl.textContent = b.dataset.tip; tipEl.classList.remove('hidden');
        tipEl.style.left = Math.min(innerWidth - 160, Math.max(8, r.left)) + 'px'; tipEl.style.top = Math.min(innerHeight - 40, r.bottom + 8) + 'px'; tipShown = true;
      }, 450);
    });
    const hide = () => { clearTimeout(tipTimer); setTimeout(() => tipEl.classList.add('hidden'), 700); };
    b.addEventListener('pointerup', hide); b.addEventListener('pointerleave', hide);
    b.addEventListener('click', (e) => { if (tipShown) { e.stopImmediatePropagation(); e.preventDefault(); tipShown = false; } }, true);
  });
}

// static icons
document.querySelectorAll('[data-ico]').forEach((el) => ico(el, el.dataset.ico, el.closest('.chip') ? 24 : 34));
ico($('mMenu'), 'menu'); ico($('mMute'), 'volume'); ico($('mInfo'), 'info'); ico($('pClose'), 'x'); ico($('cClose'), 'x');
ico($('btnMenu'), 'pause'); ico($('btnMute'), 'volume'); ico($('btnGo'), 'rocket', 48); ico($('btnFire'), 'zap', 48); ico($('btnHome'), 'dock', 30);
$('alert').querySelector('i').innerHTML = I('swords', 26);
$('hDone').querySelector('i').innerHTML = I('check', 30);
document.querySelector('#admiral .trophy').innerHTML = I('crown', 56);
wireTips(document);

// ---------- HUD ----------
function refreshHud() {
  if (!S) return;
  const set = (id, v) => { const b = $(id).querySelector('b'); if (b.textContent !== String(v)) { b.textContent = v; bump($(id)); } };
  set('cCredits', fmt(S.credits)); set('cDay', S.day); set('cCargo', `${R.cargoUsed(S)}/${R.cargoCap(S)}`);
  $('cDay').querySelector('.dbar span').style.width = Math.round(S.clock * 100) + '%';
  $('cCargo').classList.toggle('full', R.cargoUsed(S) >= R.cargoCap(S));
  $('cRep').querySelector('.bar span').style.width = Math.min(100, (S.rep / GOAL_REP) * 100) + '%';
  $('cRep').dataset.tip = `Empire stars ${S.rep}/${GOAL_REP}`; $('cRep').title = $('cRep').dataset.tip;
  const raids = S.convoys.filter((c) => c.raid);
  $('alert').classList.toggle('hidden', raids.length === 0); $('alert').querySelector('b').textContent = raids.length;
  refreshDock(); refreshHint();
}
function actBtn(id, iconName, label, cls = '', badge = null) {
  return `<button class="act ${cls}" id="${id}" aria-label="${label}" data-tip="${label}"><i>${I(iconName, 30)}</i><span>${label}</span>${badge != null ? `<b class="badge">${badge}</b>` : ''}</button>`;
}
function refreshDock() {
  const n = here();
  $('where').querySelector('i').innerHTML = I(n ? NODE_ICON[n.type] : 'pin', 26);
  $('where').querySelector('b').textContent = n ? n.name || NODE_LBL[n.type] : 'Space';
  let h = '';
  const th = R.threatAt(S, S.node);
  if (th) h += actBtn('aFight', 'swords', 'Fight', 'fight');
  if (n && n.type === 'station') { h += actBtn('aMarket', 'shop', 'Market', 'hot') + actBtn('aYard', 'ship', 'Ships') + actBtn('aTech', 'sparkles', 'Tech'); }
  if (n && n.type === 'field') h += actBtn('aMine', 'drill', 'Mine', S.fields[S.node] > 0 ? 'hot' : '', S.fields[S.node]);
  if (n && n.type === 'wreck') h += actBtn('aSalvage', 'magnet', 'Salvage', S.fields[S.node] > 0 ? 'hot' : '', S.fields[S.node]);
  h += actBtn('aFleet', 'users', 'Fleet', '', S.officers.length ? S.officers.length : null) + actBtn('aWait', 'hourglass', 'Wait');
  $('acts').innerHTML = h; wireTips($('acts'));
  const on = (id, f) => { const b = $(id); if (b) b.addEventListener('click', () => { if (!ui.busy) { audio.unlock(); f(); } }); };
  on('aFight', () => openFight(R.threatAt(S, S.node)));
  on('aMarket', () => openPanel('market')); on('aYard', () => openPanel('yard')); on('aTech', () => openPanel('tech'));
  on('aFleet', () => openPanel('fleet')); on('aWait', doWait);
  on('aMine', () => startHarvest()); on('aSalvage', () => startHarvest());
}
// layered hint: one suggestion at a time, icons first
function refreshHint() {
  const h = $('hint'); let ic = null, txt = '';
  const n = here();
  const raid = S.convoys.find((c) => c.raid);
  if (ui.mode !== 'map' || ui.panel || map.harvestNode >= 0 || ui.placing >= 0) { h.classList.add('hidden'); return; }
  if (R.threatAt(S, S.node)) { ic = 'swords'; txt = 'Tap Fight'; }
  else if (raid) { ic = 'convoy'; txt = 'Fly to the convoy'; }
  else if (n && n.type === 'station' && R.cargoUsed(S) === 0 && S.day < 6) { ic = 'shop'; txt = 'Buy cheap goods'; }
  else if (R.cargoUsed(S) > 0 && S.day < 8) { ic = 'coins'; txt = 'Sell where price is up'; }
  else if (S.day <= 3) { ic = 'pin'; txt = 'Tap anywhere to fly there'; }
  else if (!S.officers.length && S.credits >= R.hireCost() + 200 && S.day > 5) { ic = 'officer'; txt = 'Hire an officer at a station'; }
  h.classList.toggle('hidden', !ic);
  if (ic && h.dataset.k !== txt) { h.dataset.k = txt; h.innerHTML = `<span class="hi">${I(ic, 20)}</span><span>${txt}</span>`; bump(h); }
}
function handleEvents(ev) {
  for (const e of ev || []) {
    if (e.type === 'raid') { toast('swords', 'Pirates attack a convoy!', 'bad'); }
    if (e.type === 'lost') toast('convoy', 'Convoy lost', 'bad');
    if (e.type === 'guardWin' || e.type === 'guardLoss') map.burst(map.convoyPos(e.convoy), e.type === 'guardWin' ? [[1, 0.5, 0.4], [1, 0.85, 0.4], [1, 1, 1]] : [[0.5, 0.94, 1], [1, 1, 1]], 30, 12, 1.8); // a posted fleet fought here
    if (e.type === 'guardWin') toast('shield', `+${e.credits}`, 'good');
    if (e.type === 'guardLoss') toast('shield', e.lost ? `-1 ${SHIPS[e.lost].label}` : '-20%', 'bad');
    if (e.type === 'admiral') setTimeout(showAdmiral, 400);
  }
  if (ev && ev.length !== undefined) { const d = $('cDay'); bump(d); }
}
// ---------- panels ----------
function openPanel(kind, data) {
  ui.panel = kind; map.setEnabled(kind === null); $('panel').classList.remove('hidden'); document.body.classList.add('panel-open');
  renderPanel(kind, data); refreshHint();
}
function closePanel() {
  if (ui.panel === 'fight' && ui.fightLock) return;
  ui.panel = null; $('panel').classList.add('hidden'); document.body.classList.remove('panel-open'); map.setEnabled(true); refreshHud();
}
$('pClose').addEventListener('click', closePanel);
function head(iconName, title, extra = '') {
  $('panel').querySelector('.pico').innerHTML = I(iconName, 28);
  $('panel').querySelector('.ptitle').textContent = title;
  $('panel').querySelector('.pextra').innerHTML = extra;
}
const pchip = (ic, v, tip) => `<span class="pchip" data-tip="${tip}">${I(ic, 18)}${v}</span>`;
function renderPanel(kind, data) {
  const body = $('panel').querySelector('.pbody'); let h = '';
  $('pClose').classList.toggle('hidden', !!ui.fightLock);
  if (kind === 'market') {
    const st = S.node, n = NODES[st];
    head('shop', n.name, pchip('coins', fmt(S.credits), 'Credits') + pchip('cargo', `${R.cargoUsed(S)}/${R.cargoCap(S)}`, 'Cargo hold'));
    for (const g of GOOD_IDS) {
      const bp = R.buyPrice(S, st, g), sp = R.sellPrice(S, st, g), avg = R.avgPrice(g), raw = S.prices[st][g];
      const tag = raw > avg * 1.15 ? `<span class="hi">${I('up', 20)}</span>` : raw < avg * 0.85 ? `<span class="lo">${I('down', 20)}</span>` : '';
      const room = R.cargoCap(S) - R.cargoUsed(S);
      h += `<div class="mrow" data-g="${g}">
        <div class="gico" data-tip="${GOODS[g].label}">${I(GOODS[g].icon, 30)}<span class="own ${S.cargo[g] ? '' : 'zero'}">${S.cargo[g]}</span></div>
        <div class="mprice"><span class="pp">${tag}${I('coins', 20)}${bp}</span><span class="lbl">${GOODS[g].label}</span></div>
        <button class="sbtn sell" data-act="sell" aria-label="Sell ${GOODS[g].label}" data-tip="Sell 1 for ${sp}" ${S.cargo[g] ? '' : 'disabled'}>${I('minus', 24)}+${sp}</button>
        <button class="sbtn buy" data-act="buy" aria-label="Buy ${GOODS[g].label}" data-tip="Buy 1" ${room > 0 && S.credits >= bp ? '' : 'disabled'}>${I('plus', 24)}</button>
        <button class="sbtn max" data-act="max" aria-label="Fill hold with ${GOODS[g].label}" data-tip="Fill the hold" ${room > 0 && S.credits >= bp ? '' : 'disabled'}>${I('cargo', 24)}max</button>
      </div>`;
    }
    const total = GOOD_IDS.reduce((a, g) => a + S.cargo[g] * R.sellPrice(S, st, g), 0);
    h = `<div class="wide top"><button class="sbtn sell" data-act="sellall" aria-label="Sell all cargo" data-tip="Sell all cargo" ${total ? '' : 'disabled'}>${I('cargo', 24)}${I('coins', 24)}+${fmt(total)}</button></div>` + h;
    body.innerHTML = h;
    body.querySelectorAll('.mrow button').forEach((b) => b.addEventListener('click', () => {
      const g = b.closest('.mrow').dataset.g; let n = 0;
      if (b.dataset.act === 'buy') n = R.buy(S, st, g, 1);
      if (b.dataset.act === 'max') n = R.buy(S, st, g, 999);
      if (b.dataset.act === 'sell') { n = R.sell(S, st, g, 1); if (n) audio.ring(); }
      if (n) { audio.gun(); persist(); refreshHud(); renderPanel('market'); }
    }));
    const sa = body.querySelector('[data-act="sellall"]');
    sa.addEventListener('click', () => { let got = 0; for (const g of GOOD_IDS) { const c0 = S.credits; R.sell(S, st, g, S.cargo[g]); got += S.credits - c0; } if (got) { audio.win(); toast('coins', '+' + fmt(got), 'good'); } persist(); refreshHud(); renderPanel('market'); });
  } else if (kind === 'yard') {
    const n = here();
    if (ui.yardTo >= S.officers.length) ui.yardTo = -1;
    const to = ui.yardTo, full = R.groupFull(S, to);
    head('ship', 'Shipyard', pchip('coins', fmt(S.credits), 'Credits'));
    // who gets the new ship: your carrier or one of your officers
    h += `<div class="tgts"><button class="tgt ${to < 0 ? 'on' : ''}" data-to="-1" aria-label="For your carrier" data-tip="New ships join your carrier">${I('ship', 30)}<b>${S.fleet.length}/${FLEET_MAX}</b></button>`;
    S.officers.forEach((o, i) => { h += `<button class="tgt ${to === i ? 'on' : ''}" data-to="${i}" aria-label="For officer ${i + 1}" data-tip="New ships join this officer's fleet">${portrait(i, o.rank)}<b>${o.ships.length}/${OFFICER_SHIPS}</b></button>`; });
    h += '</div><div class="cards">';
    for (const id of n.yard) {
      const sh = SHIPS[id], ok = S.credits >= sh.cost && !full;
      h += `<div class="scard"><img src="${ui.thumbs[id]}" alt="${sh.label}"><div class="nm">${sh.label}</div>
        <div class="stat" data-tip="Attack">${I('sword', 24)}<span class="sbar atk"><span style="width:${sh.atk / 14 * 100}%"></span></span></div>
        <div class="stat" data-tip="Hull">${I('heart', 24)}<span class="sbar hull"><span style="width:${sh.hull / 14 * 100}%"></span></span></div>
        <div class="stat" data-tip="Speed">${I('gauge', 24)}<span class="sbar spd"><span style="width:${sh.speed / 10 * 100}%"></span></span></div>
        ${sh.wing || id === 'fighter' || id === 'bomber' ? `<div class="eff" data-tip="Flies with you in battle">${I('plane', 24)}+${sh.wing || 1}</div>` : ''}
        <button class="sbtn buy" data-ship="${id}" aria-label="Buy ${sh.label}" ${ok ? '' : 'disabled'}>${I('coins', 24)}${fmt(sh.cost)}</button></div>`;
    }
    body.innerHTML = h + '</div>';
    body.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => { ui.yardTo = +b.dataset.to; renderPanel('yard'); }));
    body.querySelectorAll('[data-ship]').forEach((b) => b.addEventListener('click', () => {
      if (R.buyShip(S, b.dataset.ship, ui.yardTo)) { audio.win(); toast('ship', SHIPS[b.dataset.ship].label + '!', 'good'); afterFleetChange(); renderPanel('yard'); }
    }));
  } else if (kind === 'tech') {
    const n = NODES[S.node];
    head('sparkles', 'Tech', pchip('coins', fmt(S.credits), 'Credits'));
    const EFF = { laser: ['sword', '+20%'], missile: ['missile', '+15%'], shield: ['shield', '+1'], cargo: ['cargo', '+10'], drill: ['drill', '+1'], tractor: ['magnet', '+1'], scanner: ['radar', '+1'], warp: ['warp', '+40%'], trade: ['coins', '+2%'] };
    for (const kindName of ['weapon', 'perk']) {
      h += `<div class="sect">${I(kindName === 'weapon' ? 'crosshair' : 'sparkles', 20)}${kindName === 'weapon' ? 'Weapons' : 'Helpful tech'}</div>`;
      for (const t of n.tech.filter((x) => TECH[x].kind === kindName)) {
        const T = TECH[t], lvl = S.tech[t], maxed = lvl >= 3, cost = maxed ? 0 : R.techCost(S, t);
        h += `<div class="tcard"><div class="gico" data-tip="${T.label}">${I(T.icon, 30)}</div>
          <div class="tinfo"><span>${T.label}</span><span class="lv">${[0, 1, 2].map((i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span><span class="eff">${I(EFF[t][0], 20)}${EFF[t][1]}</span></div>
          <button class="sbtn buy" data-tech="${t}" aria-label="Buy ${T.label}" ${!maxed && S.credits >= cost ? '' : 'disabled'}>${maxed ? I('check', 24) : I('coins', 24) + fmt(cost)}</button></div>`;
      }
    }
    body.innerHTML = h;
    body.querySelectorAll('[data-tech]').forEach((b) => b.addEventListener('click', () => {
      if (R.buyTech(S, b.dataset.tech)) { audio.win(); toast(TECH[b.dataset.tech].icon, TECH[b.dataset.tech].label + ' ' + S.tech[b.dataset.tech], 'good'); map.sync(S); persist(); refreshHud(); renderPanel('tech'); }
    }));
  } else if (kind === 'fleet') {
    renderFleet(body);
    return;
  } else if (kind === 'fight') {
    const th = data; const P = R.fleetPower(S), E = th.power, ch = R.winChance(P, E), mx = Math.max(P, E);
    const wing = R.wingmen(S);
    head('swords', th.kind === 'raid' ? 'Save the convoy' : 'Pirate base');
    h += `<div class="vs"><div class="side me" data-tip="Your fleet strength"><span class="big">${I('ship', 40)}</span>${P}<span class="pbar"><span style="width:${P / mx * 100}%"></span></span></div>
      <div class="vsx">VS</div>
      <div class="side them" data-tip="Pirate strength"><span class="big">${I('skull', 40)}</span>${E}<span class="pbar"><span style="width:${E / mx * 100}%"></span></span></div></div>
      <div class="chance" data-tip="Chance to win">${I('dice', 26)}<span class="gauge"><span style="width:${ch * 100}%"></span></span>${Math.round(ch * 100)}%</div>
      <div class="fbtns"><button class="fbtn auto" id="fAuto" aria-label="Auto battle" data-tip="Your fleet fights by itself">${I('dice', 36)}Auto</button>
      <button class="fbtn fly" id="fFly" aria-label="Launch and fly" data-tip="Fly the fighter yourself: every pirate you hit makes the fight easier. Lose your shields and you are pushed back.">${I('rocket', 36)}Launch</button></div>
      <div class="wingrow"><span class="wr" data-tip="Pirates to shoot">${I('skull', 24)}${pirateCount(th)}</span><span class="wr" data-tip="Wingmen">${I('plane', 24)}${wing}</span><span class="wr" data-tip="Shields">${I('shield', 24)}${3 + S.tech.shield}</span>
      ${S.tech.missile ? `<span class="wr" data-tip="Missiles">${I('missile', 24)}${S.tech.missile}</span>` : ''}${S.tech.laser ? `<span class="wr" data-tip="Lasers">${I('zap', 24)}${S.tech.laser}</span>` : ''}</div>`;
    if (th.kind === 'nest') h += `<div class="wide"><button class="sbtn" id="fBack" aria-label="Retreat" data-tip="Fly back">${I('back', 24)}</button></div>`;
    body.innerHTML = h;
    $('fAuto').addEventListener('click', () => autoFight(th));
    $('fFly').addEventListener('click', () => launchFight(th));
    if ($('fBack')) $('fBack').addEventListener('click', () => { ui.fightLock = false; closePanel(); flyTo(S.prevPos.x, S.prevPos.z); });
  } else if (kind === 'result') {
    const r = data;
    head(r.win ? 'trophy' : 'shield', r.win ? 'Victory!' : 'Pushed back');
    h += `<div class="result ${r.win ? 'win' : 'lose'}"><div class="rbig">${I(r.win ? 'trophy' : 'shield', 56)}</div><div class="rows">`;
    if (r.flown) h += `<div class="bs" data-tip="Pirates you shot"><i>${I('skull')}</i>${r.flown.kills}/${r.flown.total}</div>`;
    if (r.shotDown) h += `<div class="bs minus" data-tip="Shields down: your fighter had to run home"><i>${I('shield')}</i>0</div>`;
    if (r.credits) h += `<div class="bs" data-tip="Reward"><i>${I('coins')}</i>+${fmt(r.credits)}</div>`;
    if (r.rep) h += `<div class="bs" data-tip="Empire stars"><i>${I('star')}</i>+${r.rep}</div>`;
    for (const [g, n] of Object.entries(r.loot)) h += `<div class="bs" data-tip="${GOODS[g].label}"><i>${I(GOODS[g].icon)}</i>+${n}</div>`;
    for (const id of r.losses) h += `<div class="bs minus" data-tip="Lost ${SHIPS[id].label}"><i>${I('ship')}</i>-1</div>`;
    if (!r.win) h += `<div class="bs minus" data-tip="Cargo dropped"><i>${I('cargo')}</i>-25%</div>`;
    h += `</div><div class="wide" style="width:100%"><button class="sbtn buy" id="rOk" aria-label="OK">${I('check', 26)}</button></div></div>`;
    body.innerHTML = h;
    $('rOk').addEventListener('click', () => { ui.fightLock = false; closePanel(); if (r.admiral) showAdmiral(); });
  }
  wireTips(body); wireTips($('panel').querySelector('.phead'));
}
const pirateCount = (th) => Math.max(3, Math.min(6, Math.round(th.power / 6)));

// ---------- fleet panel: your carrier's ships + every officer's fleet; tap a ship, then tap where it should go ----------
function shipCard(id, from, idx) {
  const on = ui.pick && ui.pick.from === from && ui.pick.idx === idx;
  return `<button class="fship ${on ? 'on' : ''}" data-pick="${from}:${idx}" aria-label="${SHIPS[id].label}" data-tip="${SHIPS[id].label}: tap, then tap where it goes"><img src="${ui.thumbs[id]}" alt=""></button>`;
}
function dropBtn(to) {
  if (!ui.pick || ui.pick.from === to || R.groupFull(S, to)) return '';
  return `<button class="sbtn drop" data-drop="${to}" aria-label="Move the ship here" data-tip="Move the ship here">${I('down', 26)}</button>`;
}
function renderFleet(body) {
  if (ui.pick && !((ui.pick.from < 0 ? S.fleet : (S.officers[ui.pick.from] || {}).ships || [])[ui.pick.idx])) ui.pick = null;
  head('users', 'Fleet', pchip('crosshair', R.fleetPower(S), 'Strength with you'));
  let h = `<div class="bigstat">
      <div class="bs" data-tip="Strength with you"><i>${I('crosshair')}</i>${R.fleetPower(S)}</div>
      <div class="bs" data-tip="Convoys saved"><i>${I('convoy')}</i>${S.stats.saved}</div>
      <div class="bs" data-tip="Pirates shot down"><i>${I('skull')}</i>${S.stats.kills}</div>
      <div class="bs" data-tip="Empire stars"><i>${I('star')}</i>${S.rep}/${GOAL_REP}</div></div>`;
  if (ui.pick && atStation()) {
    const id = (ui.pick.from < 0 ? S.fleet : S.officers[ui.pick.from].ships)[ui.pick.idx];
    h += `<div class="wide top"><button class="sbtn sell" id="fSell" aria-label="Sell ship" data-tip="Sell this ship">${I('coins', 24)}+${fmt(Math.round(SHIPS[id].cost * 0.5))}</button></div>`;
  }
  // your carrier's own fleet
  h += `<div class="ogroup me"><div class="ohead"><span class="oport me">${I('ship', 30)}</span><span class="pchip" data-tip="Ships with your carrier">${I('ship', 24)}${S.fleet.length}/${FLEET_MAX}</span>${dropBtn(-1)}</div><div class="fleetgrid">`;
  S.fleet.forEach((id, i) => { h += shipCard(id, -1, i); });
  h += '</div></div>';
  // officers
  S.officers.forEach((o, i) => {
    const posted = !!o.post;
    h += `<div class="ogroup" style="--oc:${OFFICER_COLORS[i]}"><div class="ohead">${portrait(i, o.rank)}
      <span class="pchip" data-tip="Fleet strength">${I('crosshair', 24)}${R.officerPower(S, o)}</span>
      <span class="pchip" data-tip="${posted ? 'Guarding an area' : 'Flying with you'}">${I(posted ? 'flag' : 'ship', 24)}${o.ships.length}/${OFFICER_SHIPS}</span>${dropBtn(i)}</div>
      <div class="fleetgrid">${o.ships.map((id, k) => shipCard(id, i, k)).join('')}</div>
      <div class="obtns">
        <button class="sbtn" data-place="${i}" aria-label="Place fleet" data-tip="Send this fleet to guard an area" ${o.ships.length ? '' : 'disabled'}>${I('flag', 26)}</button>
        ${posted ? `<button class="sbtn" data-recall="${i}" aria-label="Recall fleet" data-tip="Call the fleet back to you">${I('home', 26)}</button>` : ''}
        ${R.promoteCost(o) && atStation() ? `<button class="sbtn buy" data-promote="${i}" aria-label="Promote officer" data-tip="Promote: bigger guard area, stronger fleet" ${S.credits >= R.promoteCost(o) ? '' : 'disabled'}>${I('rank', 24)}${I('coins', 20)}${fmt(R.promoteCost(o))}</button>` : ''}
      </div></div>`;
  });
  if (S.officers.length < OFFICER_MAX) {
    const i = S.officers.length, ok = atStation() && S.credits >= R.hireCost();
    h += `<div class="ogroup hire" style="--oc:${OFFICER_COLORS[i]}"><div class="ohead">${portrait(i, 0, 'ghost')}
      <button class="sbtn buy" id="fHire" aria-label="Hire officer" data-tip="${atStation() ? 'Hire an officer to lead a fleet' : 'Hire officers at a station'}" ${ok ? '' : 'disabled'}>${I('plus', 24)}${I('coins', 20)}${fmt(R.hireCost())}</button>${atStation() ? '' : `<span class="pchip" data-tip="Hire officers at a station">${I('station', 24)}</span>`}</div></div>`;
  }
  h += '<div class="sect">' + I('cargo', 24) + `${R.cargoUsed(S)}/${R.cargoCap(S)}</div><div class="bigstat">`;
  for (const g of GOOD_IDS) if (S.cargo[g]) h += `<div class="bs" data-tip="${GOODS[g].label}"><i>${I(GOODS[g].icon)}</i>${S.cargo[g]}</div>`;
  h += '</div><div class="sect">' + I('sparkles', 24) + '</div><div class="bigstat">';
  for (const t of TECH_IDS) if (S.tech[t]) h += `<div class="bs" data-tip="${TECH[t].label}"><i>${I(TECH[t].icon)}</i>${S.tech[t]}</div>`;
  body.innerHTML = h + '</div>';
  const all = (sel, f) => body.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => f(b)));
  all('[data-pick]', (b) => { const [f, k] = b.dataset.pick.split(':').map(Number); ui.pick = ui.pick && ui.pick.from === f && ui.pick.idx === k ? null : { from: f, idx: k }; renderFleet(body); });
  all('[data-drop]', (b) => { if (R.moveShip(S, ui.pick.from, ui.pick.idx, +b.dataset.drop)) { audio.ring(); ui.pick = null; afterFleetChange(); renderFleet(body); } });
  all('[data-place]', (b) => startPlacing(+b.dataset.place));
  all('[data-recall]', (b) => { if (R.recallOfficer(S, +b.dataset.recall)) { audio.ring(); toast('home', '', 'good'); afterFleetChange(); renderFleet(body); } });
  all('[data-promote]', (b) => { if (R.promote(S, +b.dataset.promote)) { audio.win(); afterFleetChange(); renderFleet(body); } });
  all('#fHire', () => { const o = R.hireOfficer(S); if (o) { audio.win(); toast('officer', '+1', 'good'); ui.yardTo = S.officers.length - 1; afterFleetChange(); renderFleet(body); } });
  all('#fSell', () => { const v = R.sellShip(S, ui.pick.idx, ui.pick.from); if (v) { toast('coins', '+' + v, 'good'); ui.pick = null; afterFleetChange(); renderFleet(body); } });
  wireTips(body); wireTips($('panel').querySelector('.phead'));
}
function afterFleetChange() { map.setFleet(R.withMe(S)); map.sync(S); persist(); refreshHud(); }

// ---------- officer placement: pick a spot on the map ----------
function startPlacing(i) {
  ui.placing = i; closePanel();
  const pb = $('placeBar'); pb.querySelector('.where i').innerHTML = portrait(i, S.officers[i].rank, 'small'); pb.querySelector('.where b').innerHTML = I('flag', 26);
  $('dock').classList.add('hidden'); pb.classList.remove('hidden'); refreshHint();
  const c = map.carrierPos(); map.focus(c.x, c.z, Math.max(map.camD, 260));
}
function endPlacing() { ui.placing = -1; $('placeBar').classList.add('hidden'); $('dock').classList.remove('hidden'); refreshHud(); }
$('pbCancel').querySelector('i').innerHTML = I('x', 30);
$('pbCancel').addEventListener('click', endPlacing);
async function placeOfficer(i, x, z) {
  endPlacing();
  const ev = R.postOfficer(S, i, x, z); if (!ev) return;
  audio.ring(); map.sync(S); map.setFleet(R.withMe(S)); persist(); refreshHud();
  const fight = ev.find((e) => e.type === 'guardWin' || e.type === 'guardLoss');
  if (fight) {
    ui.busy = true;
    await new Promise((r) => setTimeout(r, 1300)); // let the fleet arrive first
    await map.playSkirmish(map.convoyPos(fight.convoy), fight.type === 'guardWin', map.officerPos(i));
    audio[fight.type === 'guardWin' ? 'win' : 'thud']();
    map.sync(S); ui.busy = false;
  }
  handleEvents(ev); refreshHud();
}

// ---------- actions ----------
// free flight: the carrier flies straight to the spot; inside a location's bubble it parks at the centre
async function flyTo(x, z) {
  if (ui.busy) return;
  const plan = R.planMove(S, x, z);
  if (plan.dist < 1) { const th = R.threatAt(S, S.node); if (th) openFight(th); return; }
  ui.busy = true; refreshHint(); audio.unlock(); audio.ring();
  await map.flyTo(plan.x, plan.z);
  const res = R.moveTo(S, x, z); handleEvents(res.ev);
  map.sync(S); persist(); ui.busy = false; refreshHud();
  const th = R.threatAt(S, S.node);
  if (th) { openFight(th); return; }
  const n = here(); if (n && n.type === 'station') toast('station', n.name);
}
function doWait() { const ev = R.wait(S); handleEvents(ev); map.sync(S); persist(); refreshHud(); toast('hourglass', 'Day ' + S.day); const th = R.threatAt(S, S.node); if (th) openFight(th); }
function openFight(th) { if (!th) return; ui.fightLock = th.kind === 'nest'; openPanel('fight', th); }

function fightPos(th) { return th.kind === 'raid' ? map.convoyPos(th.convoy) : map.nodePos(th.node); }
async function autoFight(th) {
  if (ui.busy) return; ui.busy = true; ui.fightLock = true;
  $('panel').classList.add('hidden');
  const pos = fightPos(th);
  const at = S.node, res = R.resolveFight(S, th);
  audio.go();
  await map.playSkirmish(pos, res.win);
  if (S.node !== at) map.placeCarrier(S.pos); // pushed back out of a pirate base
  audio[res.win ? 'win' : 'thud']();
  map.sync(S); map.setFleet(R.withMe(S)); persist(); refreshHud();
  ui.busy = false; $('panel').classList.remove('hidden'); ui.panel = 'result'; renderPanel('result', res);
}
function launchFight(th) {
  if (ui.busy) return;
  ui.busy = true; ui.fightLock = true;
  $('panel').classList.add('hidden'); $('mhud').classList.add('hidden'); $('hud').classList.remove('hidden');
  ui.mode = 'battle'; audio.unlock();
  const cfg = { pirates: pirateCount(th), laser: S.tech.laser, missile: S.tech.missile, shield: S.tech.shield, wing: R.wingmen(S), tough: Math.floor(th.power / 12) };
  battle.resize(innerWidth, innerHeight);
  battle.start(cfg, (flown) => {
    ui.mode = 'map'; $('hud').classList.add('hidden'); $('mhud').classList.remove('hidden');
    const at = S.node, res = R.resolveFight(S, th, flown); res.flown = flown;
    if (S.node !== at) map.placeCarrier(S.pos);
    map.sync(S); map.setFleet(R.withMe(S)); persist(); refreshHud();
    map.focus(map.carrierPos().x, map.carrierPos().z - 6, 110);
    ui.busy = false; $('panel').classList.remove('hidden'); ui.panel = 'result'; renderPanel('result', res);
    audio[res.win ? 'win' : 'thud']();
  });
}
function startHarvest() {
  const n = here(); if (!n || S.fields[S.node] <= 0) { toast('hourglass', 'Come back tomorrow'); return; }
  map.harvest(S.node); $('dock').classList.add('hidden'); $('harvestBar').classList.remove('hidden');
  const hb = $('harvestBar'); hb.querySelector('.where i').innerHTML = I(n.type === 'field' ? 'drill' : 'magnet', 26);
  hb.querySelector('.where b').textContent = S.fields[S.node]; refreshHint();
}
function endHarvest() { map.harvest(-1); $('harvestBar').classList.add('hidden'); $('dock').classList.remove('hidden'); map.focus(map.carrierPos().x, map.carrierPos().z - 6, 130); refreshHud(); }
$('hDone').addEventListener('click', endHarvest);
function harvestRock(idx) {
  const n = NODES[S.node];
  // the save only keeps how many rocks are left; the one the player tapped is the one that pops
  const res = n.type === 'field' ? R.mine(S, S.node) : R.salvage(S, S.node);
  if (!res) return;
  if (res.full) { toast('cargo', 'Hold full', 'bad'); return; }
  map.popRock(S.node, idx); audio.pop();
  toast(GOODS[res.good].icon, `+${res.amt} ${GOODS[res.good].label}`, 'good');
  $('harvestBar').querySelector('.where b').textContent = S.fields[S.node];
  persist(); refreshHud();
  if (S.fields[S.node] <= 0) setTimeout(endHarvest, 700);
}

// ---------- map taps ----------
let raidCycle = 0;
$('alert').addEventListener('click', () => {
  const raids = S.convoys.map((c, i) => [c, i]).filter(([c]) => c.raid); if (!raids.length) return;
  const [, i] = raids[raidCycle++ % raids.length]; const p = map.convoyPos(i); map.focus(p.x, p.z, 160);
});
function onMapTap(t) {
  if (ui.busy || ui.mode !== 'map') return;
  if (t.rock != null) { harvestRock(t.rock); return; }
  if (map.harvestNode >= 0) return;
  if (ui.placing >= 0) { // placing an officer's fleet: a location means its centre, anywhere else means right there
    const p = t.node != null ? NODES[t.node] : t.convoy != null ? NODES[R.convoyNode(S.convoys[t.convoy])] : t.ground;
    if (p) placeOfficer(ui.placing, p.x, p.z); return;
  }
  if (t.officer != null) { openPanel('fleet'); return; }
  if (t.convoy != null) { const n = NODES[R.convoyNode(S.convoys[t.convoy])]; flyTo(n.x, n.z); return; }
  if (t.node != null) { flyTo(NODES[t.node].x, NODES[t.node].z); return; }
  if (t.ground) flyTo(t.ground.x, t.ground.z);
}

// ---------- title / menus ----------
function showTitle() {
  persist(); ui.runActive = false; S = null;
  ui.mode = 'title'; $('mhud').classList.add('hidden'); $('hud').classList.add('hidden'); $('panel').classList.add('hidden');
  const saved = R.load();
  $('tContinue').classList.toggle('hidden', !saved);
  if (saved) $('tDay').innerHTML = `${I('clock', 24)} ${saved.day}`;
  $('title').classList.remove('hidden');
  map.focus(-60, 40, 420);
}
function beginGame(state) {
  S = state; ui.runActive = true; ui.fightLock = false; ui.panel = null; ui.busy = false;
  if (map.harvestNode >= 0) endHarvest();
  if (ui.placing >= 0) endPlacing();
  ui.pick = null; ui.yardTo = -1;
  $('admiral').classList.add('hidden'); $('menu').classList.add('hidden');
  $('title').classList.add('hidden'); $('confirm').classList.add('hidden'); $('mhud').classList.remove('hidden');
  map.sync(S, { snap: true }); map.setFleet(R.withMe(S)); map.placeCarrier(S.pos); map.setEnabled(true);
  const c = map.carrierPos(); map.focus(c.x, c.z, 150);
  ui.mode = 'map'; persist(); refreshHud();
  const th = R.threatAt(S, S.node); if (th) openFight(th);
}
$('tNew').addEventListener('click', () => { audio.unlock(); if (R.load()) $('confirm').classList.remove('hidden'); else beginGame(R.newGame()); });
$('cfYes').addEventListener('click', () => { R.clearSave(); beginGame(R.newGame()); });
$('cfNo').addEventListener('click', () => $('confirm').classList.add('hidden'));
$('tContinue').addEventListener('click', () => { audio.unlock(); const s = R.load(); if (s) beginGame(s); });
const pause = (v) => { ui.paused = v; if (v && battle) battle.input.reset(); };
$('mMenu').addEventListener('click', () => { $('menu').classList.remove('hidden'); });
$('btnMenu').addEventListener('click', () => { pause(true); $('menu').classList.remove('hidden'); $('mTitle').classList.add('hidden'); });
$('mResume').addEventListener('click', () => { $('menu').classList.add('hidden'); $('mTitle').classList.remove('hidden'); pause(false); });
$('mTitle').addEventListener('click', () => { $('menu').classList.add('hidden'); closePanel(); showTitle(); });
const openCredits = () => { $('menu').classList.add('hidden'); $('credits').classList.remove('hidden'); pause(true); };
$('mCredits').addEventListener('click', openCredits); $('mInfo').addEventListener('click', openCredits);
$('cClose').addEventListener('click', () => { $('credits').classList.add('hidden'); $('mTitle').classList.remove('hidden'); pause(false); });
const mute = () => { audio.setMuted(!audio.muted); ico($('mMute'), audio.muted ? 'mute' : 'volume'); ico($('btnMute'), audio.muted ? 'mute' : 'volume'); };
$('mMute').addEventListener('click', mute); $('btnMute').addEventListener('click', mute);
$('btnHome').addEventListener('click', () => battle.goHome());
function showAdmiral() {
  $('aSaved').textContent = S.stats.saved; $('aKills').textContent = S.stats.kills; $('aDays').textContent = S.day;
  $('admiral').classList.remove('hidden'); audio.win();
}
$('aGo').addEventListener('click', () => $('admiral').classList.add('hidden'));
addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (!$('credits').classList.contains('hidden')) { $('cClose').click(); return; }
    if (!$('menu').classList.contains('hidden')) { $('mResume').click(); return; }
    if (ui.mode === 'map' && ui.placing >= 0) { endPlacing(); return; }
    if (ui.mode === 'map' && ui.panel && !ui.fightLock) { closePanel(); return; }
    if (ui.mode === 'battle') $('btnMenu').click(); else if (ui.mode === 'map') $('mMenu').click();
  }
});

// ---------- loop ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsShow = 0, fpsLowT = 0; const fpsLog = [];
function frame(now) {
  let rdt = Math.min(Math.max((now - last) / 1000, 0), 0.1); last = now;
  fpsAcc += rdt; fpsN++;
  if (fpsAcc > 1) {
    fpsShow = fpsN / fpsAcc; fpsLog.push(Math.round(fpsShow)); if (fpsLog.length > 600) fpsLog.shift();
    if (fpsShow < 40 && pixelRatio > 1) { if (++fpsLowT >= 3) { pixelRatio = 1; renderer.setPixelRatio(1); onResize(); } } else fpsLowT = 0;
    fpsAcc = 0; fpsN = 0;
  }
  if (ui.mode === 'battle') { battle.update(rdt, ui.paused); if (ui.mode === 'battle') battle.render(); else map.render(); }
  else { map.update(rdt, now / 1000); map.render(); }
  if (DEV) $('dev').textContent = `fps ${fpsShow.toFixed(0)} | calls ${renderer.info.render.calls} | tris ${renderer.info.render.triangles} | pr ${pixelRatio}`;
}
function onResize() {
  renderer.setSize(innerWidth, innerHeight, false);
  if (map) map.resize(innerWidth, innerHeight); if (battle) battle.resize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.suspend(); persist(); } else { audio.resume(); last = performance.now(); } });
addEventListener('pagehide', persist);

async function boot() {
  if (DEV) $('dev').classList.remove('hidden');
  renderer.setSize(innerWidth, innerHeight, false);
  A = await loadAssets((k) => { $('loading').querySelector('.lbar span').style.width = (k * 100) + '%'; });
  for (const id of SHIP_IDS) ui.thumbs[id] = thumbnail(renderer, A.make(SHIPS[id].model, 10));
  map = createMap(renderer, A, canvas); map.onTap(onMapTap);
  battle = createBattle(renderer, A, audio, isTouch);
  onResize();
  // title backdrop: a throwaway demo state shown on the map only; it is never assigned to S, so it can never be saved
  const demo = R.newGame(1); map.sync(demo, { snap: true }); map.setFleet(['fighter', 'bomber', 'destroyer', 'cruiser']); map.placeCarrier(demo.pos);
  $('loading').classList.add('hidden');
  showTitle();
  renderer.setAnimationLoop(frame);
}
boot().catch((e) => { console.error(e); });

if (TEST) {
  // read-only probe for automated QA; it never drives the game (all play goes through real input)
  window.__sc = {
    state: () => ({
      mode: ui.mode, busy: ui.busy, panel: ui.panel, paused: ui.paused, placing: ui.placing, S: S ? JSON.parse(JSON.stringify(S)) : null,
      power: S ? R.fleetPower(S) : 0, harvest: map ? map.harvestNode : -1, camD: map ? map.camD : 0, flying: map ? map.flying : false,
      nodes: map ? NODES.map((n) => ({ id: n.id, type: n.type, r: n.r, ...map.nodeScreen(n.id) })) : [],
      convoys: map && S ? S.convoys.map((c, i) => ({ node: R.convoyNode(c), raid: !!c.raid, ...map.convoyScreen(i) })) : [],
      carrier: map ? { ...map.carrierScreen(), world: (({ x, z }) => ({ x, z }))(map.carrierPos()) } : null,
      wing: map ? map.wingScreen() : [], officers: map ? [0, 1, 2].map((i) => map.officerScreen(i)) : [],
      rocks: map && S && map.harvestNode >= 0 ? map.rocksScreen(map.harvestNode) : [],
      threat: S ? R.threatAt(S, S.node) : null, battle: battle ? battle.probe() : null,
      fps: fpsShow, fpsLog: fpsLog.slice(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pixelRatio,
    }),
    // screen point of a world spot, so QA can tap empty space with real input
    screenOf: (x, z) => map.worldScreen(x, z),
  };
}
