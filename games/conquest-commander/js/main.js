// Conquest Commander: start screen (army, traits, enemy, brain, map), campaign + perk shop, game loop, commander input (marks, stars, rally), HUD, pings, minimap, end screen.
import { View, flagCanvas, lookThumb, disposeThumbs, TEAM_COLOR } from './render.js';
import { Sim, CFG } from './sim.js';
import { MAP, heightAt, setMap, MAP_LIST, isMap } from './map.js';
import { statsOf, mulberry32, CLASS_ICON } from './data.js';
import { loadArmy, defaultUnitLook, randomNation, generatedLooks, armyBudget, ARMY_KEY, MAX_LOOKS } from './army.js';   // v2.4: shared army save
import { PERKS, PERK } from './perks.js';
import { loadCampaign, saveCampaign, newCampaign, recordBattle, enemyPerks, enemyPerkCount, MAPS } from './campaign.js';
import { TRAITS, TRAIT, TRAIT_LONG, traitOf, loadSetup, saveSetup, normDiff } from './traits.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); for (const k of [].concat(kids)) if (k != null) e.append(k); return e; };
const MARK_ICON = { attack: '⚔️', defend: '🛡️', ignore: '🚫' };
const CLASS_NAME = { trooper: 'Trooper', heavy: 'Heavy', engineer: 'Engineer', sniper: 'Sniper', commander: 'Commander', jet: 'Jet trooper' };

// ---------- device profile ----------
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
if (IS_TOUCH) document.body.classList.add('touch');
const view = new View($('#app'), { low: IS_TOUCH });
addEventListener('resize', () => view.resize());

// ---------- state ----------
const G = { state: 'start', sim: null, paused: false, speed: 1, sel: -1, rallyMode: false, opts: null, pings: [], frames: [], longFrames: 0 };
let armies = loadArmy();   // v2.4: 'botcampus:army' (old 'trooper-custom:db' v3 is migrated by the shared schema.js)
// setup (nation, looks, enemy, brain, one trait per look) is remembered in localStorage 'conquest-commander:setup'
const setup = loadSetup();
const pick = { nation: armies.nations.some((n) => n.id === setup.nation) ? setup.nation : armies.active, looks: new Set(setup.looks), enemy: setup.enemy, diff: setup.diff, traits: setup.traits, map: setup.map };
G.camp = loadCampaign(); G.cart = new Set();
// v2.2 map picker: saved in the setup; no pick yet → the campaign's map (old saves: mapIndex 0 = Dust Ridge)
if (!isMap(pick.map)) pick.map = (MAPS[G.camp.mapIndex] || MAPS[0]).id;
const mapInfo = (id) => MAP_LIST.find((m) => m.id === id) || MAP_LIST[0];
function showMap(id) { setMap(id); view.setMap(); }   // active map for the menu backdrop / next battle
showMap(pick.map);

// ---------- start screen ----------
const looksOf = (nid) => { const l = armies.looks.filter((x) => x.nationId === nid); return l.length ? l : [defaultUnitLook(nid)]; };   // a player with no troopers → one basic 'Trooper 1'
const armyTraitOf = (l) => l.armyTrait || '';   // unit.traits[0] from the army save wins; '' → the setup picker below
const traitPickOf = (l) => armyTraitOf(l) || (TRAIT[pick.traits[l.id]] ? pick.traits[l.id] : '');
const thumbCache = new Map();
function thumbOf(nation, look) {
  const k = nation.id + '|' + JSON.stringify(look.st);
  if (!thumbCache.has(k)) thumbCache.set(k, lookThumb(nation, look.st) || look.thumb || '');
  return thumbCache.get(k);
}
function nationChip(n, on, onClick) {
  const c = flagCanvas(n, 60), b = h('button', { className: 'chip' + (on ? ' on' : ''), title: n.name }, [c, h('span', { textContent: n.name })]);
  b.dataset.id = n.id; b.addEventListener('click', onClick); return b;
}
// v2.4 header: player · nation · unit count (from the army save) + 💰 cost check for the picked units
function renderArmyHead(nat, looks) {
  $('#ahFlag').replaceChildren(flagCanvas(nat, 48));
  $('#ahPlayer').textContent = nat.player || armies.player;
  $('#ahNation').textContent = nat.name;
  const n = looks.filter((l) => !l.isDefault).length;
  $('#ahUnits').textContent = n ? `🪖 ×${n}` : '🪖 ×1 (basic)';
  $('#ahUnits').title = n ? `${n} unit${n > 1 ? 's' : ''} in your army` : 'No units saved yet: you get 1 basic Trooper';
  const picked = looks.filter((l) => pick.looks.has(l.id)), b = armyBudget(picked, { ...CFG, ...(mapCfgFull(pick.map)) });
  const el = $('#armyCost'); el.className = 'armycost ' + b.level; el.dataset.level = b.level;
  const per = b.perWaveTroops >= 10 ? '10+' : b.perWaveTroops.toFixed(1);
  el.replaceChildren(
    h('span', { textContent: `💰 ${b.avg} CP avg per spawn · ⭐ +${b.perWave} CP per wave ≈ ${per} troops/wave` }),
    b.level === 'bad' ? h('b', { className: 'warn', textContent: `⚠️ Too expensive to field well: your troops cost too much CP, so reinforcements will trickle in${b.max > b.perWave ? ` (one costs 💰${b.max}, more than a whole wave)` : ''}. Cheaper gear = more troops.` })
      : b.level === 'warn' ? h('b', { className: 'warn', textContent: '⚠️ Pricey army: expect thin reinforcement waves.' }) : '');
}
function renderStart() {
  const my = $('#myNations'); my.replaceChildren(...armies.nations.map((n) => nationChip(n, n.id === pick.nation, () => { pick.nation = n.id; pick.looks.clear(); if (pick.enemy === n.id) pick.enemy = null; renderStart(); })));
  const nat = armies.nations.find((n) => n.id === pick.nation) || armies.nations[0];
  const looks = looksOf(nat.id);
  for (const id of [...pick.looks]) if (!looks.some((l) => l.id === id)) pick.looks.delete(id);
  if (!pick.looks.size) looks.slice(0, 6).forEach((l) => pick.looks.add(l.id));
  $('#myLooks').replaceChildren(...looks.map((l) => {
    const s = statsOf(l), url = thumbOf(nat, l), on = pick.looks.has(l.id);
    const b = h('button', { className: 'look' + (on ? ' on' : ''), title: `${l.name} · ${CLASS_NAME[s.cls]} · 💰${s.cost} CP per spawn · ❤️${s.hp} 🏃${s.speed.toFixed(1)} m/s · ⚡${s.power}` }, [
      url ? h('img', { src: url, alt: '' }) : h('div', { className: 'noimg', textContent: '🪖' }),
      h('b', { className: 'cls', textContent: CLASS_ICON[s.cls], title: CLASS_NAME[s.cls] }),
      l.icon ? h('b', { className: 'ico', textContent: l.icon }) : null,
      h('span', { textContent: l.name }), h('em', { textContent: `💰${s.cost}` })]);
    b.dataset.id = l.id;
    b.addEventListener('click', () => {
      if (pick.looks.has(l.id)) { if (pick.looks.size > 1) pick.looks.delete(l.id); }
      else if (pick.looks.size < MAX_LOOKS) pick.looks.add(l.id); else toast(MAX_LOOKS + ' max');
      renderStart();
    });
    // behaviour trait chip: big icon + 1-2 words; tap → small icon popup
    // v2.4: a trait saved on the unit (army save, unit.traits[0]) wins and shows 🪖; else the picker (dashed = class default)
    const fromArmy = armyTraitOf(l), chosen = traitPickOf(l), tid = traitOf(chosen, s.cls), T = TRAIT[tid];
    const tb = h('button', { className: 'trait' + (fromArmy ? ' set army' : chosen ? ' set' : ' auto') + (on ? '' : ' off'), title: `${TRAIT_LONG[tid]}${fromArmy ? ' (from your army: 🪖 Edit army to change)' : chosen ? '' : ' (auto)'}`, 'aria-label': 'Behaviour: ' + TRAIT_LONG[tid] },
      [h('b', { textContent: T.icon }), h('span', { textContent: T.name }), fromArmy ? h('i', { className: 'tarmy', textContent: '🪖' }) : null]);
    tb.dataset.id = l.id; tb.dataset.trait = tid; if (fromArmy) tb.dataset.src = 'army';
    tb.addEventListener('click', (e) => { e.stopPropagation(); if (fromArmy) { toast('🪖 ' + TRAIT_LONG[tid] + ' · set in your army'); return; } openTraitPop(l, s.cls, tb); });
    const w = h('div', { className: 'lookw' }, [b, tb]); w.dataset.id = l.id;
    return w;
  }));
  $('#lookCount').textContent = `${pick.looks.size}/${MAX_LOOKS}`;
  renderArmyHead(nat, looks);
  const others = armies.nations.filter((n) => n.id !== nat.id);
  if (pick.enemy && pick.enemy !== 'random' && !others.some((n) => n.id === pick.enemy)) pick.enemy = null;
  if (!pick.enemy) pick.enemy = others[0] ? others[0].id : 'random';
  const rnd = h('button', { className: 'chip' + (pick.enemy === 'random' ? ' on' : ''), title: 'Random' }, [h('span', { textContent: '🎲 Random' })]);
  rnd.dataset.id = 'random'; rnd.addEventListener('click', () => { pick.enemy = 'random'; renderStart(); });
  $('#enemyNations').replaceChildren(...others.map((n) => nationChip(n, n.id === pick.enemy, () => { pick.enemy = n.id; renderStart(); })), rnd);
  pick.diff = normDiff(pick.diff);
  $$('#diff [data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === pick.diff));
  // 🗺️ map picker (small / large)
  if (!isMap(pick.map)) pick.map = MAP_LIST[0].id;
  if (G.state === 'start' && MAP.id !== pick.map) showMap(pick.map);
  $('#mapPick').replaceChildren(...MAP_LIST.map((m) => {
    const b = h('button', { className: 'chip mapc' + (m.id === pick.map ? ' on' : ''), title: `${m.name}: ${m.dims}, ${m.posts} posts`, 'aria-pressed': String(m.id === pick.map) },
      [h('b', { textContent: m.icon }), h('span', { textContent: m.name }), h('em', { textContent: `${m.size}·${m.posts}🚩` })]);
    b.dataset.map = m.id; b.addEventListener('click', () => { pick.map = m.id; renderStart(); });
    return b;
  }));
  saveSetup(pick);
  $('#src').innerHTML = {
    army: `📥 ${escapeHTML(nat.player)} · army from <a href="../trooper-custom/?from=conquest">🪖 Trooper Customizer</a>`,
    migrated: `📥 ${escapeHTML(nat.player)} · old Customizer save converted · <a href="../trooper-custom/?from=conquest">🪖 Trooper Customizer</a>`,
    old: `Old Customizer save found: open <a href="../trooper-custom/?from=conquest">🪖 Trooper Customizer</a> once to bring it over.`,
  }[armies.source] || `No saved army yet → 1 basic trooper. Build yours in <a href="../trooper-custom/?from=conquest">🪖 Trooper Customizer</a>`;
  renderCamp();
}
// ---------- trait popup (one behaviour per look) ----------
function openTraitPop(l, cls, anchor) {
  const pop = $('#traitPop'), cur = pick.traits[l.id] || '';
  const opt = (id) => {
    const tid = traitOf(id, cls), T = TRAIT[tid];
    const b = h('button', { className: 'topt' + (cur === id ? ' on' : '') + (id ? '' : ' auto'), title: id ? TRAIT_LONG[id] : `Auto: ${TRAIT_LONG[tid]}` }, [h('b', { textContent: T.icon }), h('span', { textContent: id ? T.name : 'Auto' })]);
    b.dataset.trait = id;
    b.addEventListener('click', (e) => { e.stopPropagation(); if (id) pick.traits[l.id] = id; else delete pick.traits[l.id]; closeTraitPop(); renderStart(); });
    return b;
  };
  $('#traitOpts').replaceChildren(opt(''), ...TRAITS.map((t) => opt(t.id)));
  $('#traitHead').textContent = `${l.icon || CLASS_ICON[cls]} ${l.name}`;
  pop.classList.remove('hidden'); pop.dataset.id = l.id;
  const r = anchor.getBoundingClientRect(), card = $('#traitCard'), cw = card.offsetWidth, ch = card.offsetHeight;
  const x = Math.max(6, Math.min(innerWidth - cw - 6, r.left + r.width / 2 - cw / 2)), y = r.bottom + ch + 8 < innerHeight ? r.bottom + 4 : Math.max(6, r.top - ch - 4);
  card.style.left = x + 'px'; card.style.top = y + 'px';
}
function closeTraitPop() { $('#traitPop').classList.add('hidden'); }
$('#traitPop').addEventListener('click', (e) => { if (e.target.id === 'traitPop') closeTraitPop(); });

// ---------- campaign status + perk shop ----------
const streakTxt = (c) => (c.streak > 0 ? `🔥${c.streak}` : c.streak < 0 ? `🧊${-c.streak}` : '');
const mapCfgFull = (id) => { const was = MAP.id; setMap(id); const c = { ...(MAP.cfg || {}) }; setMap(was); return c; };
const mapCfg = (id) => { const was = MAP.id; setMap(id); const c = { tickets: MAP.cfg.tickets ?? CFG.tickets, live: MAP.cfg.live ?? CFG.live }; setMap(was); return c; };
function renderCamp() {
  const c = G.camp, m = mapInfo(pick.map), mc = mapCfg(m.id);
  $('#campStat').innerHTML = `<b class="cr" title="Credits">💰 ${c.credits}</b><span title="Battle">⚔️ #${c.battle}</span><span title="Wins">🏆 ${c.wins}</span><span title="Losses">💀 ${c.losses}</span>${streakTxt(c) ? `<span title="Streak">${streakTxt(c)}</span>` : ''}<span title="Map">${m.icon} ${escapeHTML(m.name)}</span>`;
  $('#mapLine').textContent = `${m.icon} ${m.name} · 🎟️ ${mc.tickets} · 🪖 ${mc.live} vs ${mc.live} · 🚩×${m.posts}`;
}
let newCampArm = 0;
$('#newCamp').addEventListener('click', () => {
  const b = $('#newCamp');
  if (!newCampArm) { newCampArm = setTimeout(() => { newCampArm = 0; b.classList.remove('arm'); b.textContent = '🆕 New campaign'; }, 3000); b.classList.add('arm'); b.textContent = '✔️ Sure? 💰→1500'; return; }
  clearTimeout(newCampArm); newCampArm = 0; b.classList.remove('arm'); b.textContent = '🆕 New campaign';
  G.camp = newCampaign(); saveCampaign(G.camp); G.cart.clear(); renderCamp(); toast('🆕 💰 ' + G.camp.credits);
});
const cartCost = () => [...G.cart].reduce((a, id) => a + PERK[id].price, 0);
function openShop() {
  G.state = 'shop';
  ['#start', '#end', '#pause', '#help'].forEach((x) => $(x).classList.add('hidden')); $('#shop').classList.remove('hidden');
  for (const id of [...G.cart]) if (!PERK[id]) G.cart.delete(id);
  while (cartCost() > G.camp.credits) G.cart.delete([...G.cart].pop());
  renderShop();
}
function renderShop() {
  const left = G.camp.credits - cartCost();
  $('#shopCredits').innerHTML = `💰 <b>${left}</b>`;
  const n = enemyPerkCount(G.camp), m = mapInfo(pick.map);
  $('#shopInfo').innerHTML = `⚔️ #${G.camp.battle} · ${m.icon} ${escapeHTML(m.name)} · <span title="Enemy perks">🔴 🎁×${n}</span> · ⏳ 1 battle`;
  $('#perkGrid').replaceChildren(...PERKS.map((P) => {
    const on = G.cart.has(P.id), can = on || P.price <= left;
    const b = h('button', { className: 'perk' + (on ? ' on' : '') + (can ? '' : ' no'), title: `${P.name}: ${P.short} · 💰${P.price}`, 'aria-pressed': String(on) },
      [h('b', { className: 'pic', textContent: P.icon }), h('span', { className: 'pn', textContent: P.name }), h('em', { textContent: P.short }), h('u', { textContent: `💰${P.price}` }), on ? h('i', { className: 'tick', textContent: '✔️' }) : null]);
    b.dataset.perk = P.id;
    b.addEventListener('click', () => buyPerk(P.id));
    return b;
  }));
  $('#fight').textContent = G.cart.size ? `⚔️ Fight · 🎁${G.cart.size}` : '⚔️ Fight';
}
function buyPerk(id) {
  if (G.cart.has(id)) G.cart.delete(id);
  else if (PERK[id].price <= G.camp.credits - cartCost()) G.cart.add(id);
  else { toast('💰 ❌'); return false; }
  renderShop(); return G.cart.has(id);
}
function fight(o = {}) {
  const mine = PERKS.map((p) => p.id).filter((id) => G.cart.has(id));  // shop order
  const cost = cartCost(); if (cost > G.camp.credits) return false;
  const map = o.map && isMap(o.map) ? o.map : pick.map;
  G.camp.credits -= cost; G.camp.mapIndex = Math.max(0, MAPS.findIndex((m) => m.id === map)); saveCampaign(G.camp);
  const seed = o.seed ?? ((Math.random() * 1e9) | 0);
  const foe = enemyPerks(G.camp, mine, seed ^ 0x5eed);
  G.cart.clear(); $('#shop').classList.add('hidden');
  startMatch({ ...o, map, seed, perks: [mine, foe], campaign: true, spent: cost });
  return true;
}
$('#shopBack').addEventListener('click', () => toMenu());
$('#fight').addEventListener('click', () => fight());
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
$$('#diff [data-diff]').forEach((b) => b.addEventListener('click', () => { pick.diff = b.dataset.diff; renderStart(); }));
$('#play').addEventListener('click', () => openShop());

// ---------- v2.4: jumps between Conquest and the 🪖 Trooper Customizer (same origin; the army travels in localStorage, never in the URL) ----------
const FROM = (() => { try { return new URLSearchParams(location.search).get('from'); } catch (e) { return null; } })();
const CUSTOM_URL = '../trooper-custom/', EDIT_URL = '../trooper-custom/?from=conquest';
if (FROM === 'custom') $('#backArmy').classList.remove('hidden');   // opened from the customizer's ⚔️ Play Conquest
function editArmy() {
  saveSetup(pick);                                            // keep the setup (picked units, traits, map, enemy)
  G.jumping = EDIT_URL;
  if (window.__noNav) return EDIT_URL;                        // tests
  location.href = EDIT_URL;
  return EDIT_URL;
}
$('#editArmy').addEventListener('click', editArmy);
$('#pauseEdit').addEventListener('click', () => { if (G.opts && G.opts.campaign) toast('🏳️ battle forfeited'); editArmy(); });
$('#backArmy').addEventListener('click', () => saveSetup(pick));
// another tab (the customizer) saved the army → refresh. On the setup screen right away; in a battle, after it.
function reloadArmy() {
  armies = loadArmy();
  if (!armies.nations.some((n) => n.id === pick.nation)) pick.nation = armies.active;
  thumbCache.clear();
  if (G.state === 'start') { renderStart(); toast('🪖 Army updated'); } else G.armyDirty = true;
  return armies;
}
addEventListener('storage', (e) => { if (e.key === ARMY_KEY || e.key === null) reloadArmy(); });

function buildTeams(o) {
  const rng = mulberry32(o.seed || 1);
  const nat = armies.nations.find((n) => n.id === o.nation) || armies.nations[0];
  const all = looksOf(nat.id); let mine = all.filter((l) => o.looks.includes(l.id)).slice(0, MAX_LOOKS); if (!mine.length) mine = all.slice(0, MAX_LOOKS);
  const traits = o.traits || pick.traits;
  // v2.4: unit.traits[0] (army save) first, then the setup picker, else '' = class default. Enemy looks keep their army trait or ''.
  mine = mine.map((l) => ({ ...l, trait: l.armyTrait || (TRAIT[traits[l.id]] ? traits[l.id] : '') }));
  let enemyNat, enemyLooks;
  const en = o.enemy !== 'random' && armies.nations.find((n) => n.id === o.enemy && n.id !== nat.id);
  const enLooks = en ? armies.looks.filter((l) => l.nationId === en.id).slice(0, MAX_LOOKS) : [];
  if (en) { enemyNat = en; enemyLooks = enLooks.length ? enLooks.map((l) => { const { brain, ...x } = l; return { ...x, trait: l.armyTrait || '' }; }) : generatedLooks(rng, en.id, mine.length); }   // brains are player-only
  else { enemyNat = randomNation(rng, nat.p); enemyLooks = generatedLooks(rng, enemyNat.id, mine.length); }   // generated: as many unit types as you
  const perks = o.perks || [[], []];
  return [{ nation: nat, looks: mine, perks: perks[0] || [] }, { nation: enemyNat, looks: enemyLooks, perks: perks[1] || [] }];
}

// ---------- match ----------
function startMatch(o = {}) {
  o = { nation: pick.nation, looks: [...pick.looks], enemy: pick.enemy, difficulty: pick.diff, seed: (Math.random() * 1e9) | 0, map: pick.map, ...o };
  o.difficulty = normDiff(o.difficulty);   // old 'easy' (v2) → 'normal'
  if (!isMap(o.map)) o.map = MAP_LIST[0].id;
  G.opts = o;
  showMap(o.map);   // v2.2: switch map (sim nav/cover + renderer scene follow MAP)
  const teams = buildTeams(o);
  G.sim = new Sim({ teams, difficulty: o.difficulty, seed: o.seed, cfg: o.cfg || {}, map: o.map });
  view.buildArmies(G.sim.teams, Math.max(...G.sim.teams.map((T) => T.live)) + 16);
  view.clearFx();
  disposeThumbs();
  G.state = 'playing'; G.paused = false; G.sel = -1; G.rallyMode = false; G.pings.forEach((p) => p.el.remove()); G.pings = [];
  ['#start', '#end', '#pause', '#help', '#shop', '#traitPop'].forEach((s) => $(s).classList.add('hidden'));
  $('#hud').classList.remove('hidden');
  $('#restart').classList.toggle('hidden', !!o.campaign);  // campaign battles can't be re-rolled
  const home = G.sim.posts[0], cs = (MAP.view && MAP.view.camStart) || [80, 105];
  view.cam.yaw = 0; view.cam.dist = view.w < view.h ? cs[1] : cs[0]; view.cam.x = home.x + cs[0] * 0.4; view.cam.z = home.z; view.cam.want = null;
  mm.id = null; $('#minimap').classList.toggle('hidden', !(MAP.view && MAP.view.minimap));
  [0, 1].forEach((t) => { const c = $(`.tix.t${t} canvas`); c.getContext('2d').drawImage(flagCanvas(G.sim.teams[t].nation, 32), 0, 0); });
  buildBadges(); closeRadial(); showPerkBanner(); updateHUD(true);
}
const perkIcons = (ids) => (ids.length ? ids.map((id) => `<b title="${PERK[id].name}: ${PERK[id].short}">${PERK[id].icon}</b>`).join('') : '<b title="No perks" class="none">🚫</b>');
let bannerT = 0;
function showPerkBanner() {
  const [A, B] = G.sim.teams, el = $('#perkBanner');
  const html = `<div class="pside c0">${perkIcons(A.perks)}</div><span class="vs">⚔️</span><div class="pside c1">${perkIcons(B.perks)}</div>`;
  el.innerHTML = html; $('#pausePerks').innerHTML = html;
  el.classList.remove('hidden', 'fade'); clearTimeout(bannerT);
  bannerT = setTimeout(() => { el.classList.add('fade'); bannerT = setTimeout(() => el.classList.add('hidden'), 600); }, 6000);
}
$('#perkBanner').addEventListener('click', () => $('#perkBanner').classList.add('hidden'));
function toMenu() {
  if (G.armyDirty) { G.armyDirty = false; armies = loadArmy(); thumbCache.clear(); if (!armies.nations.some((n) => n.id === pick.nation)) pick.nation = armies.active; }
  G.state = 'start'; G.sim = null; view.disposeArmies(); view.clearFx();
  $('#hud').classList.add('hidden'); $('#badges').replaceChildren(); G.pings.forEach((p) => p.el.remove()); G.pings = [];
  ['#end', '#pause', '#help', '#shop'].forEach((s) => $(s).classList.add('hidden')); $('#start').classList.remove('hidden'); $('#countdown').classList.add('hidden');
  renderStart();
}
function endMatch() {
  const S = G.sim, o = S.over; G.state = 'over'; closeRadial();
  const win = o.winner === 0, draw = o.winner === -1;
  $('#endTitle').textContent = draw ? '🤝' : win ? '🏆' : '💀';
  $('#endWhy').textContent = (draw ? 'Draw' : win ? 'Victory' : 'Defeat') + ' · ' + ({ tickets: '🎟️ 0', posts: '🚩 all posts 20 s', wiped: '🚩 0 · 🪖 0', time: '⏱️ time' }[o.reason] || '');
  $('#countdown').classList.add('hidden');
  const m = Math.floor(S.time / 60), s = Math.floor(S.time % 60);
  const [A, B] = S.teams, owned = (t) => S.posts.filter((p) => p.owner === t).length;
  $('#endStats').innerHTML = `<span></span><span class="h c0">🔵</span><span class="h c1">🔴</span>
    <span>🎟️</span><span class="c0">${A.tickets}</span><span class="c1">${B.tickets}</span>
    <span>🚩</span><span class="c0">${owned(0)}</span><span class="c1">${owned(1)}</span>
    <span>💥</span><span class="c0">${A.kills}</span><span class="c1">${B.kills}</span>
    <span>💀</span><span class="c0">${A.losses}</span><span class="c1">${B.losses}</span>
    <span>⏱️</span><span>${m}:${String(s).padStart(2, '0')}</span><span></span>`;
  const ce = $('#endCredits');
  if (G.opts.campaign) {
    const r = recordBattle(G.camp, win, owned(0), A.tickets); saveCampaign(G.camp); G.lastReward = r;
    ce.innerHTML = r.lines.map((l) => `<span>${l.icon}</span><span class="n">${l.n > 1 || l.each < 100 ? `${l.n} × ${l.each}` : ''}</span><span class="v">+${l.total}</span>`).join('')
      + `<span class="tot">💰</span><span class="n tot">+</span><span class="v tot">${r.total}</span>`;
    $('#endBal').innerHTML = `💰 <b>${G.camp.credits}</b> · 🏆 ${G.camp.wins} 💀 ${G.camp.losses} ${streakTxt(G.camp)}`;
    ce.classList.remove('hidden'); $('#endBal').classList.remove('hidden');
  } else { ce.classList.add('hidden'); $('#endBal').classList.add('hidden'); G.lastReward = null; }
  $('#end').classList.remove('hidden');
}
$('#again').addEventListener('click', () => (G.opts && G.opts.campaign ? openShop() : startMatch(G.opts ? { ...G.opts, seed: (Math.random() * 1e9) | 0 } : {})));
$('#endMenu').addEventListener('click', toMenu);
function setPause(on) { if (G.state !== 'playing') return; G.paused = on; if (on) { renderPauseUnits(); renderPauseWho(); } $('#pause').classList.toggle('hidden', !on); }
// ⏸️ unit info: per look → its icon, class, behaviour trait, troops alive
function renderPauseUnits() {
  const S = G.sim; if (!S) return;
  const row = (T) => h('div', { className: 'urow c' + T.idx }, T.looks.map((l, i) => {
    const n = S.units.filter((u) => u.alive && u.team === T.idx && u.look === i).length, tr = TRAIT[l.trait];
    const el = h('span', { className: 'ucell', title: `${l.name} · ${CLASS_NAME[l.stats.cls]} · ${TRAIT_LONG[l.trait]}${l.traitPick ? '' : ' (auto)'} · ${n} alive` },
      [h('b', { className: 'uc', textContent: l.icon || CLASS_ICON[l.stats.cls] }), h('i', { className: 'ut', textContent: tr.icon }), h('em', { textContent: '×' + n })]);
    el.dataset.trait = l.trait; return el;
  }));
  $('#pauseUnits').replaceChildren(row(S.teams[0]), row(S.teams[1]));
}
function renderPauseWho() {
  const S = G.sim; if (!S) return; const n = S.teams[0].nation, mine = looksOf(n.id).filter((l) => !l.isDefault).length;
  $('#pauseWho').replaceChildren(flagCanvas(n, 32), h('b', { textContent: n.player || armies.player }), h('span', { textContent: ' · ' + n.name + ' · ' }), h('span', { textContent: `🪖 ×${mine || 1}` }));
}
$('#pauseBtn').addEventListener('click', () => setPause(true));
$('#resume').addEventListener('click', () => setPause(false));
$('#restart').addEventListener('click', () => { setPause(false); startMatch({ ...G.opts, seed: (Math.random() * 1e9) | 0 }); });
$('#toMenu').addEventListener('click', toMenu);
$('#helpBtn').addEventListener('click', () => { G.paused = true; $('#help').classList.remove('hidden'); });
$('#helpClose').addEventListener('click', () => { $('#help').classList.add('hidden'); G.paused = !$('#pause').classList.contains('hidden'); });
$('#camBtn').addEventListener('click', () => centerOnFight());
$('#rallyBtn').addEventListener('click', () => toggleRally());

function centerOnFight() {
  const S = G.sim; if (!S) return;
  // the post you care most about (highest weight); else your units' center
  let bi = -1, bw = 0; S.posts.forEach((p, i) => { const w = S.weight(S.teams[0], i); if (w > bw) { bw = w; bi = i; } });
  if (bi >= 0) view.focus(S.posts[bi].x, S.posts[bi].z);
}
function toggleRally() {
  const S = G.sim; if (!S) return;
  if (S.teams[0].rally) { S.setRally(0, null); G.rallyMode = false; toast('🚩 ✖'); }
  else { G.rallyMode = !G.rallyMode; if (G.rallyMode) { closeRadial(); toast('🚩 👇'); } }
  updateHUD(true);
}
let toastT = 0;
function toast(s) { const t = $('#toast'); t.textContent = s; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1400); }

// ---------- post badges + radial ----------
function buildBadges() {
  $('#badges').replaceChildren(...G.sim.posts.map((p, i) => {
    const b = h('button', { className: 'badge', 'aria-label': 'Post ' + p.id }, [h('span', { textContent: p.id }), h('i'), h('u')]);
    b.dataset.post = i;
    b.addEventListener('click', (e) => { e.stopPropagation(); openRadial(i); });
    return b;
  }));
  $('#score').classList.toggle('n5', G.sim.posts.length > 3); $('#hud').classList.toggle('n5', G.sim.posts.length > 3);   // 5 posts: narrow screens put the post icons on their own row
  $('#postIcons').replaceChildren(...G.sim.posts.map((p, i) => {
    const b = h('button', { className: 'pi', 'aria-label': 'Post ' + p.id }, [h('span', { textContent: p.id }), h('i')]);
    b.dataset.post = i; b.addEventListener('click', () => { view.focus(p.x, p.z); openRadial(i); });
    return b;
  }));
}
function openRadial(i) {
  if (!G.sim || G.state !== 'playing') return;
  G.rallyMode = false; G.sel = i; $('#radial').classList.remove('hidden'); syncRadial(); updateHUD(true);
}
function closeRadial() { G.sel = -1; $('#radial').classList.add('hidden'); $$('.badge').forEach((b) => b.classList.remove('sel')); }
function syncRadial() {
  if (G.sel < 0) return;
  const m = G.sim.teams[0].marks[G.sel], on = G.sim.teams[0].marked;
  $$('#radial .mk').forEach((b) => b.classList.toggle('on', on && b.dataset.mark === m.mark));
  $$('#radial .st').forEach((b) => b.classList.toggle('on', on && +b.dataset.stars === m.stars));
  $$('.badge').forEach((b) => b.classList.toggle('sel', +b.dataset.post === G.sel));
}
function setMark(i, mark, stars) {
  if (!G.sim) return;
  G.sim.setMark(0, i, mark, stars);
  syncRadial(); updateHUD(true);
}
$$('#radial .mk').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setMark(G.sel, b.dataset.mark); }));
$$('#radial .st').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setMark(G.sel, null, +b.dataset.stars); }));
$('#radial .ctr').addEventListener('click', (e) => { e.stopPropagation(); closeRadial(); });
const RADIAL = [['attack', -150], ['defend', -90], ['ignore', -30], [1, 150], [2, 90], [3, 30]];
function placeOverlays() {
  const S = G.sim; if (!S) return;
  const badges = $('#badges').children;
  S.posts.forEach((p, i) => {
    const s = view.project(p.x, heightAt(p.x, p.z) + 9.5, p.z), b = badges[i]; if (!b) return;
    b.style.translate = `${s.x.toFixed(1)}px ${s.y.toFixed(1)}px`;
    b.style.visibility = s.behind ? 'hidden' : '';
    b._sx = s.x; b._sy = s.y;
  });
  if (G.sel >= 0) {
    const b = badges[G.sel], R = Math.min(78, Math.max(66, Math.min(view.w, view.h) * 0.16));
    const cx = Math.max(R + 30, Math.min(view.w - R - 30, b._sx)), cy = Math.max(R + 64, Math.min(view.h - R - 30, b._sy - 23));
    const rad = $('#radial'); rad.style.transform = `translate(${cx}px, ${cy}px)`;
    $$('.rd', rad).forEach((el) => {
      const key = el.dataset.mark || +el.dataset.stars; const ent = RADIAL.find((r) => r[0] === key);
      if (!ent) { el.style.transform = ''; return; }
      const a = ent[1] * Math.PI / 180; el.style.transform = `translate(${(Math.cos(a) * R).toFixed(1)}px, ${(Math.sin(a) * R).toFixed(1)}px)`;
    });
  }
  // pings follow their world spot; offscreen ones stick to the screen edge
  const now = performance.now();
  G.pings = G.pings.filter((p) => { if (now > p.end) { p.el.remove(); return false; } return true; });
  for (const p of G.pings) {
    const s = view.project(p.x, heightAt(p.x, p.z) + 3, p.z), ml = 30, mr = 80, top = 84, bot = 92;  // keep clear of the HUD
    let x = s.x, y = s.y, edge = false;
    if (s.behind) { x = view.w - x; y = view.h - bot; edge = true; }
    if (x < ml || x > view.w - mr || y < top || y > view.h - bot) edge = true;
    x = Math.max(ml, Math.min(view.w - mr, x)); y = Math.max(top, Math.min(view.h - bot, y));
    p.el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`; p.el.classList.toggle('edge', edge);
  }
}
function ping(icon, x, z, color, label = '') {
  if (G.pings.length > 8) { G.pings[0].el.remove(); G.pings.shift(); }
  const el = h('div', { className: 'ping' }, [h('span', { textContent: icon }), label ? h('b', { textContent: label }) : null]);
  el.style.setProperty('--c', color); $('#pings').append(el);
  G.pings.push({ el, x, z, end: performance.now() + 3200, icon });
}
function handleEvents(evs) {
  const S = G.sim;
  for (const e of evs) {
    const post = e.post && S.posts.find((p) => p.id === e.post);
    if (e.type === 'contested' && e.team === 0) ping('⚠️', post.x, post.z, '#ffd65a', post.id);
    else if (e.type === 'captured' && e.team === 0) ping('✅', post.x, post.z, TEAM_COLOR[0], post.id);
    else if ((e.type === 'captured' && e.team === 1) || (e.type === 'neutral' && e.from === 0)) ping('❌', post.x, post.z, TEAM_COLOR[1], post.id);
    else if (e.type === 'squadLost' && e.team === 0) ping('💀', e.x, e.z, TEAM_COLOR[1]);
    else if (e.type === 'retake' && e.team === 0 && post) ping('🔁', post.x, post.z, TEAM_COLOR[0], post.id);
    else if (e.type === 'lastStand') toast(e.team === 0 ? '☠️ 🔵 last stand' : '☠️ 🔴 last stand');
    else if (e.type === 'unlock' && e.team === 0) toast('⭐ 🛩️ unlocked');
  }
}

// ---------- HUD ----------
let hudT = 0, lastHud = '';
function updateHUD(force) {
  const S = G.sim; if (!S) return;
  const [A, B] = S.teams;
  const cd = A.holdT != null ? [0, A.holdT] : B.holdT != null ? [1, B.holdT] : null;
  const sig = [A.tickets, B.tickets, A.lastStand, B.lastStand, cd && cd[0] + ':' + Math.ceil(cd[1]), S.alive(0), Math.floor(A.cp), Math.ceil(A.waveT), S.posts.map((p) => p.owner + ':' + p.ctrl.toFixed(2) + ':' + p.n.join()).join(), A.marked, A.marks.map((m) => m.mark + m.stars).join(), !!A.rally, G.rallyMode].join('|');
  if (!force && sig === lastHud) return; lastHud = sig;
  $('.tix.t0 b').textContent = A.tickets; $('.tix.t1 b').textContent = B.tickets;
  $('.tix.t0').classList.toggle('low', A.tickets <= 20); $('.tix.t1').classList.toggle('low', B.tickets <= 20);
  $('.tix.t0').classList.toggle('ls', A.lastStand); $('.tix.t1').classList.toggle('ls', B.lastStand);
  $('#alive').textContent = `🪖${S.alive(0)}/${A.live}`;
  const cdEl = $('#countdown');
  if (cd && G.state === 'playing') { cdEl.classList.remove('hidden'); cdEl.className = 'cd' + cd[0]; cdEl.querySelector('span').textContent = cd[0] === 0 ? '🏆' : '⚠️'; cdEl.querySelector('b').textContent = Math.max(0, Math.ceil(cd[1])); }
  else cdEl.classList.add('hidden');
  $('#cpChip b').textContent = Math.floor(A.cp); $('#wave').textContent = '⏱' + Math.max(0, Math.ceil(A.waveT));
  const pis = $('#postIcons').children, badges = $('#badges').children;
  S.posts.forEach((p, i) => {
    const m = A.marks[i], oc = p.owner >= 0 ? TEAM_COLOR[p.owner] : '#6b7077';
    const el = pis[i]; el.style.setProperty('--p', Math.round(Math.abs(p.ctrl) * 100)); el.style.setProperty('--c', TEAM_COLOR[p.ctrl > 0 ? 0 : 1]); el.style.setProperty('--o', oc);
    const icon = A.marked ? MARK_ICON[m.mark] : '🤖';   // 🤖 = no orders yet: bots go for the nearest post they don't own
    el.querySelector('i').textContent = icon;
    const b = badges[i]; b.style.setProperty('--o', oc); b.querySelector('i').textContent = icon;
    b.querySelector('u').textContent = !A.marked || m.mark === 'ignore' ? '' : '★'.repeat(m.stars);
    b.classList.toggle('hot', p.n[0] > 0 && p.n[1] > 0);
  });
  $('#rallyBtn').classList.toggle('on', G.rallyMode || !!A.rally);
  $('#rallyBtn').textContent = A.rally ? '🚩✖' : '🚩';
  $('#rallyBtn').style.fontSize = A.rally ? '15px' : '';
}

// ---------- input: mouse + touch + keys ----------
const cv = view.renderer.domElement;
const ptrs = new Map(); let gest = null;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture?.(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) gest = { mode: e.pointerType === 'mouse' && e.button !== 0 ? 'rotate' : 'tap', x0: e.clientX, y0: e.clientY, t0: performance.now(), lx: e.clientX, ly: e.clientY };
  else if (ptrs.size === 2) { const f = two(); gest = { mode: 'pinch', d0: f.d, a0: f.a, dist0: view.cam.dist, yaw0: view.cam.yaw, mx: f.mx, my: f.my }; }
});
function two() { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p || !gest) return;
  p.x = e.clientX; p.y = e.clientY;
  if (gest.mode === 'tap' && Math.hypot(p.x - gest.x0, p.y - gest.y0) > 8) gest.mode = 'pan';
  if (gest.mode === 'pan') { view.pan(p.x - gest.lx, p.y - gest.ly); gest.lx = p.x; gest.ly = p.y; }
  else if (gest.mode === 'rotate') { view.cam.yaw += (p.x - gest.lx) * 0.006; gest.lx = p.x; gest.ly = p.y; }
  else if (gest.mode === 'pinch' && ptrs.size === 2) {
    const f = two(); view.cam.dist = gest.dist0 * gest.d0 / f.d; view.cam.yaw = gest.yaw0 - (f.a - gest.a0);
    view.pan(f.mx - gest.mx, f.my - gest.my); gest.mx = f.mx; gest.my = f.my;
  }
});
function ptrEnd(e) {
  if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
  if (gest && gest.mode === 'tap' && e.type === 'pointerup' && performance.now() - gest.t0 < 600) tap(e.clientX, e.clientY);
  if (!ptrs.size) gest = null; else if (gest && gest.mode === 'pinch') { const [q] = [...ptrs.values()]; gest = { mode: 'pan', lx: q.x, ly: q.y, x0: q.x, y0: q.y }; }
}
cv.addEventListener('pointerup', ptrEnd); cv.addEventListener('pointercancel', ptrEnd);
cv.addEventListener('wheel', (e) => { e.preventDefault(); view.cam.dist *= 1 + Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0012); }, { passive: false });
function tap(x, y) {
  const S = G.sim; if (!S || G.state !== 'playing') return;
  const g = view.pick(x, y); if (!g) return;
  if (G.rallyMode) { S.setRally(0, g.x, g.z); G.rallyMode = false; toast('🚩 ✔'); updateHUD(true); return; }
  let bi = -1, bd = MAP.postR + 3; S.posts.forEach((p, i) => { const d = Math.hypot(p.x - g.x, p.z - g.z); if (d < bd) { bd = d; bi = i; } });
  if (bi >= 0) openRadial(bi); else closeRadial();
}
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (G.state === 'shop') { if (k === 'escape') toMenu(); else if (k === 'enter') fight(); return; }
  if (G.state === 'start' && k === 'escape') { closeTraitPop(); return; }
  if (G.state !== 'playing') return;
  if (k === 'escape') { if (G.sel >= 0 || G.rallyMode) { closeRadial(); G.rallyMode = false; updateHUD(true); } else setPause(!G.paused); return; }
  if (G.paused) return;
  if (k === 'tab') { e.preventDefault(); openRadial((G.sel + 1) % G.sim.posts.length); return; }
  if (k === 'r') return toggleRally();
  if (k === ' ') { e.preventDefault(); return centerOnFight(); }
  if (k === 'h') return $('#helpBtn').click();
  if (G.sel >= 0) {
    const m = G.sim.teams[0].marks[G.sel];
    if (k === '1') setMark(G.sel, 'attack'); else if (k === '2') setMark(G.sel, 'defend'); else if (k === '3') setMark(G.sel, 'ignore');
    else if (k === '+' || k === '=') setMark(G.sel, null, m.stars + 1); else if (k === '-' || k === '_') setMark(G.sel, null, m.stars - 1);
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
function keyPan(dt) {
  const sp = view.cam.dist * 0.9 * dt; let dx = 0, dz = 0;
  if (keys.has('w') || keys.has('arrowup')) dz -= sp; if (keys.has('s') || keys.has('arrowdown')) dz += sp;
  if (keys.has('a') || keys.has('arrowleft')) dx -= sp; if (keys.has('d') || keys.has('arrowright')) dx += sp;
  if (dx || dz) view.panWorld(dx, dz);
  if (keys.has('q')) view.cam.yaw -= dt * 1.6; if (keys.has('e')) view.cam.yaw += dt * 1.6;
}

// ---------- minimap (v2.2, big map only): terrain + walls + rocks, posts, troops, camera view; tap / drag = move the camera ----------
const mm = { el: $('#minimap'), bg: null, id: null, t: 0, draws: 0 };
function minimapBg(W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = (i + 0.5) / W * 2 * MAP.hx - MAP.hx, z = (j + 0.5) / H * 2 * MAP.hz - MAP.hz, hh = Math.min(1, heightAt(x, z) / 18), k = (j * W + i) * 4;
    img.data[k] = 170 - hh * 50; img.data[k + 1] = 178 - hh * 52; img.data[k + 2] = 122 - hh * 40; img.data[k + 3] = 235;
  }
  g.putImageData(img, 0, 0);
  const sx = W / (2 * MAP.hx), sz = H / (2 * MAP.hz);
  g.fillStyle = '#5d554a'; for (const r of MAP.rocks) { g.beginPath(); g.arc((r.x + MAP.hx) * sx, (r.z + MAP.hz) * sz, Math.max(0.8, r.r * sx), 0, 7); g.fill(); }
  g.fillStyle = '#efe9dc'; for (const w of MAP.walls) g.fillRect((w.x - w.hx + MAP.hx) * sx, (w.z - w.hz + MAP.hz) * sz, Math.max(1, w.hx * 2 * sx), Math.max(1, w.hz * 2 * sz));
  return c;
}
function drawMinimap() {
  const S = G.sim, el = mm.el;
  if (!S || G.state !== 'playing' || !(MAP.view && MAP.view.minimap)) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(el.clientWidth * dpr), H = Math.round(el.clientHeight * dpr);
  if (!W || !H) return;
  if (el.width !== W || el.height !== H || mm.id !== MAP.id) { el.width = W; el.height = H; mm.bg = minimapBg(W, H); mm.id = MAP.id; }
  const g = el.getContext('2d'), sx = W / (2 * MAP.hx), sz = H / (2 * MAP.hz), X = (x) => (x + MAP.hx) * sx, Z = (z) => (z + MAP.hz) * sz;
  g.drawImage(mm.bg, 0, 0);
  for (const u of S.units) { if (!u.alive) continue; g.fillStyle = TEAM_COLOR[u.team]; g.fillRect(X(u.x) - dpr, Z(u.z) - dpr, 2 * dpr, 2 * dpr); }
  const R = Math.max(5 * dpr, MAP.postR * sx * 1.3);
  g.font = `bold ${Math.round(R * 1.2)}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  S.posts.forEach((p) => {
    g.beginPath(); g.arc(X(p.x), Z(p.z), R, 0, 7); g.fillStyle = p.owner >= 0 ? TEAM_COLOR[p.owner] : '#9aa1a8'; g.fill();
    if (p.n[0] && p.n[1]) { g.lineWidth = 2 * dpr; g.strokeStyle = '#ffd65a'; g.stroke(); }
    g.fillStyle = '#10161c'; g.fillText(p.id, X(p.x), Z(p.z) + dpr * 0.5);
  });
  const fp = view.footprint(); g.beginPath(); fp.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](X(Math.max(-MAP.hx * 2, Math.min(MAP.hx * 2, q.x))), Z(Math.max(-MAP.hz * 2, Math.min(MAP.hz * 2, q.z))))); g.closePath();
  g.lineWidth = 1.5 * dpr; g.strokeStyle = '#ffffffcc'; g.stroke();
  mm.draws++;
}
{
  let down = false;
  const go = (e) => { const r = mm.el.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width * 2 - 1) * MAP.hx, z = ((e.clientY - r.top) / r.height * 2 - 1) * MAP.hz; view.focus(x, z); mm.t = 0; };
  mm.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); down = true; mm.el.setPointerCapture?.(e.pointerId); go(e); });
  mm.el.addEventListener('pointermove', (e) => { if (down) go(e); });
  const up = () => { down = false; }; mm.el.addEventListener('pointerup', up); mm.el.addEventListener('pointercancel', up);
}

// ---------- loop ----------
let last = performance.now(), acc = 0, idleT = 0;
function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.1, raw); last = now;
  if (G.state === 'playing') { G.frames.push(raw * 1000); if (G.frames.length > 600) G.frames.shift(); if (raw > 0.25) G.longFrames++; }
  const S = G.sim;
  if (S && G.state === 'playing' && !G.paused) {
    acc += dt * G.speed; let n = 0;
    while (acc >= CFG.dt && n < 40) { S.step(); acc -= CFG.dt; n++; }
    if (n >= 40) acc = 0;
  }
  if (S) { const evs = S.events; S.events = []; view.consume(evs); handleEvents(evs); }
  if (G.state === 'start') { idleT += dt; view.cam.yaw = Math.sin(idleT * 0.05) * 0.5; view.cam.x = Math.sin(idleT * 0.03) * MAP.hx * 0.3; view.cam.z = 0; view.cam.dist = MAP.hx * 1.2; }
  else keyPan(dt);
  view.update(S, G.paused ? 0 : dt, now);
  placeOverlays();
  if ((hudT -= dt) <= 0) { hudT = 0.12; updateHUD(false); }
  if ((mm.t -= dt) <= 0) { mm.t = 0.2; drawMinimap(); }
  if (S && S.over && G.state === 'playing') endMatch();
  requestAnimationFrame(frame);
}
renderStart();
requestAnimationFrame(frame);

// ---------- debug / test hooks ----------
window.__game = {
  ready: true,
  get state() { return G.state; }, get sim() { return G.sim; }, G, view, get armies() { return armies; }, pick,
  version: '2.4', reloadArmy: () => reloadArmy(), editArmy: () => editArmy(), from: FROM, maps: () => MAP_LIST.map((m) => ({ ...m })), get map() { return MAP.id; },
  pickMap: (id) => { pick.map = id; renderStart(); return pick.map; }, minimapDraws: () => mm.draws,
  lowProfile: view.low, pixelRatio: () => view.pixelRatio,
  start: (o) => startMatch(o),
  get camp() { return G.camp; }, get cart() { return [...G.cart]; }, get lastReward() { return G.lastReward; },
  shop: () => openShop(), buy: (id) => buyPerk(id), fight: (o) => fight(o),
  reloadCampaign: () => { G.camp = loadCampaign(); renderCamp(); return G.camp; },
  menu: () => toMenu(),
  setMark: (i, mark, stars) => setMark(i, mark, stars),
  openMenu: (i) => openRadial(i), closeMenu: () => closeRadial(),
  setRally: (x, z) => { G.sim.setRally(0, x, z); updateHUD(true); },
  autoCommand: (on) => { G.sim.autoCmd[0] = !!on; },
  simulate: (sec) => { const S = G.sim; S.simulate(sec); const evs = S.events; S.events = []; handleEvents(evs.slice(-20)); view.clearFx(); updateHUD(true); return { time: S.time, over: S.over }; },
  setSpeed: (n) => { G.speed = n; },
  pause: (on) => setPause(on),
  focus: (x, z, d) => { view.cam.x = x; view.cam.z = z; if (d) view.cam.dist = d; view.cam.want = null; },
  screenOfPost: (i) => { const p = G.sim.posts[i]; return view.project(p.x, heightAt(p.x, p.z), p.z); },
  posts: () => G.sim.posts.map((p) => ({ id: p.id, owner: p.owner, ctrl: +p.ctrl.toFixed(3), n: [...p.n] })),
  teams: () => G.sim.teams.map((T) => ({ tickets: T.tickets, cp: Math.floor(T.cp), kills: T.kills, losses: T.losses, bled: T.bled || 0, rally: T.rally, perks: [...T.perks], live: T.live, alive: G.sim.alive(T.idx), lastStand: T.lastStand, holdT: T.holdT, unlocked: T.unlocked, plan: [...T.plan], marked: T.marked, marks: T.marks.map((m) => ({ ...m })), squads: T.squads.map((s) => s.members.filter((u) => u.alive).length), healed: T.healed, minesLaid: T.minesLaid, retakes: T.retakes, nation: T.nation.name, p: T.nation.p, s: T.nation.s, looks: T.looks.map((l) => ({ id: l.id, name: l.name, cls: l.stats.cls, cost: l.stats.cost, trait: l.trait, traitPick: l.traitPick })) })),
  units: (t) => G.sim.units.filter((u) => u.alive && (t == null || u.team === t)).map((u) => ({ id: u.id, team: u.team, squad: u.squad, cls: u.cls, x: u.x, z: u.z, gx: u.gx, gz: u.gz, hp: u.hp, hpMax: u.hpMax, look: u.look, trait: u.trait, post: u.post, inCover: u.inCover, duck: u.duck, crouch: u.crouch, atNest: u.atNest })),
  traitPop: (id) => { const l = looksOf(pick.nation).find((x) => x.id === id), b = document.querySelector(`#myLooks .trait[data-id="${id}"]`); if (l && b) openTraitPop(l, statsOf(l).cls, b); },
  reloadSetup: () => Object.assign(pick, (() => { const d = loadSetup(); return { nation: d.nation || pick.nation, looks: new Set(d.looks), enemy: d.enemy, diff: d.diff, traits: d.traits, map: isMap(d.map) ? d.map : pick.map }; })()),
  frameStats: () => { const f = [...G.frames].sort((a, b) => a - b); return { n: f.length, avg: f.reduce((a, b) => a + b, 0) / (f.length || 1), p95: f[Math.floor(f.length * 0.95)] || 0, max: f[f.length - 1] || 0, long: G.longFrames }; },
  resetFrames: () => { G.frames = []; G.longFrames = 0; },
  renderStats: () => view.stats(),
  atlasHash: (t) => view.armies && view.armies[t].look.hash(),
  pings: () => G.pings.map((p) => p.icon),
};
