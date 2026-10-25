// Army HQ: ONE page for every army game. The menu + a full-screen same-origin <iframe> "stage", hash-routed
// (#conquest, #ships, #customize/nation, #view/combat, ...) so back / refresh work. A floating 🏠 returns here.
// Save: reads 'botcampus:army' (shared by every game). The only write is the Player / Nation pick
// (activePlayerId patched into the stored JSON, nothing else touched).
// Settings: 📦 packs = Conquest's 'conquest-commander:pickups-flag' ('1' on / '0' off, missing = on)
//           🔊 sound  = 'botcampus:army-menu:sound' ('1' / '0', missing = on), menu blips only.
import * as Army from '../shared/army/schema.js?v=8';

const $ = (s) => document.querySelector(s);
const LS_PICK = 'conquest-commander:pickups-flag', LS_SND = 'botcampus:army-menu:sound';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
// read-only view of localStorage: Army.load() may migrate an old save; reading never writes (the games do)
const RO = { getItem: lsGet, setItem() {}, removeItem() {} };

// ---------- routes: every game / editor / view opens inside this page ----------
// home: where the floating 🏠 sits so it does not cover the game's own buttons (same rules as each game's HUD)
const TC = { pos: 'tl', below: '#costchip', y: 6 }, ARENA = { pos: 'tr', below: '#cambar', y: 6 };
const ROUTES = {
  conquest: { src: '../conquest-commander/', name: 'Conquest', home: { pos: 'tr', only: '#start' } },
  ships: { src: '../ship-sandbox/', name: 'Ships', home: { pos: 'tl', below: '#stats', y: 6 } },
  customize: { src: '../trooper-custom/', name: 'Customize', home: TC },
  'customize/nation': { src: '../trooper-custom/?section=nation', name: 'Nation', home: TC },
  'customize/nation/new': { src: '../trooper-custom/?section=nation&new=1', name: 'Nation', home: TC, become: 'customize/nation' },
  'customize/troopers': { src: '../trooper-custom/?section=troopers', name: 'Troopers', home: TC },
  'customize/armor': { src: '../trooper-custom/?section=armor', name: 'Armor', home: TC },
  'customize/spaceship': { soon: '🛸', name: 'SpaceShip', home: { pos: 'tl' } },
  'customize/battleship': { soon: '🚀', name: 'BattleShip', home: { pos: 'tl' } },
  'customize/brains': { src: '../unit-brains/', name: 'Brains', home: { pos: 'tl', after: '#top .title', x: 10 } },
  'view/action': { src: '../trooper-custom/demo.html', name: 'Action view', home: ARENA },
  'view/combat': { src: '../trooper-custom/combat.html', name: 'Combat simulator', home: ARENA },
  'view/team': { src: '../trooper-custom/team.html', name: 'Team simulator', home: ARENA },
};
const abs = (u) => new URL(u, location.href);
const routeNow = () => decodeURIComponent(location.hash.replace(/^#\/?/, ''));
// which route a URL inside the stage belongs to (games link to each other; keep the address bar honest)
function routeOfUrl(u) {
  let best = null;
  for (const [k, r] of Object.entries(ROUTES)) {
    if (!r.src || r.become) continue;
    const a = abs(r.src), sec = a.searchParams.get('section');
    if (a.pathname.replace(/index\.html$/, '') !== u.pathname.replace(/index\.html$/, '')) continue;
    if ((sec || null) === (u.searchParams.get('section') || null)) best = k;
  }
  return best;
}

// ---------- header: Player / Nation pickers ----------
const SYM = { star: '★', planet: '🪐', comet: '☄', skull: '☠', wing: '🪽', bolt: '⚡', chevron: '︽', crescent: '☾', gear: '⚙', atom: '⚛', triangle: '▲', circle: '●' };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
export function readArmy() {
  const has = lsGet(Army.ARMY_KEY) != null || lsGet(Army.LEGACY_KEYS.customizer) != null || lsGet(Army.LEGACY_KEYS.conquestSetup) != null;
  if (!has) return null;
  try { const a = Army.load(RO); return a && a.players && a.players.length ? a : null; } catch (e) { return null; }
}
const opt = (value, text, sel) => Object.assign(document.createElement('option'), { value, textContent: text, selected: !!sel });
function renderWho() {
  const army = readArmy(), fl = $('#flag'), selP = $('#selP'), selN = $('#selN');
  const empty = !army;
  for (const id of ['#pickP', '#pickN']) { $(id + ' .sel').hidden = empty; $(id + ' .mk').hidden = !empty; }
  fl.hidden = empty;
  if (empty) { $('#units').textContent = ''; selP.replaceChildren(); selN.replaceChildren(); return { empty: true }; }
  const p = Army.activePlayer(army), n = p.nation, units = Army.playerUnits(army, p.id);
  selP.replaceChildren(...army.players.map((x) => opt(x.id, x.name, x.id === p.id)), opt('+new', '➕ Create'));
  selN.replaceChildren(...army.players.map((x) => opt(x.id, x.nation.name, x.id === p.id)), opt('+edit', '✏️ Edit'), opt('+new', '➕ Create'));
  selP.title = 'Player: ' + p.name; selN.title = 'Nation: ' + n.name + ' (each player has one nation)';
  const tr = units.filter((u) => u.kind === 'trooper').length, tk = units.length - tr;
  $('#units').textContent = `🪖 ${tr}` + (tk ? ` · 🚜 ${tk}` : '');
  $('#units').title = `${units.length} units: ${tr} troopers, ${tk} tanks`;
  fl.style.setProperty('--p', n.colors.primary); fl.style.setProperty('--s', n.colors.secondary);
  const sc = n.flag.symbolColor, col = sc === 'white' ? '#fff' : sc === 'black' ? '#111' : sc === 'primary' ? n.colors.primary : (lum(n.colors.secondary) > 0.6 ? '#111' : '#fff');
  const i = fl.querySelector('i'); i.textContent = SYM[n.flag.symbol] || '★'; i.style.color = col;
  return { empty: false, player: p.name, nation: n.name, units: units.length, players: army.players.length };
}
// switch the active player (= their nation): patch only activePlayerId in the stored JSON, keep everything else as is
export function setActive(pid) {
  let raw = lsGet(Army.ARMY_KEY);
  if (raw == null) { try { Army.load(localStorage); } catch (e) { /* no save */ } raw = lsGet(Army.ARMY_KEY); } // legacy-only save: migrate once
  let a = null; try { a = JSON.parse(raw || 'null'); } catch (e) { a = null; }
  if (!a || !Array.isArray(a.players) || !a.players.some((p) => p && p.id === pid)) return false;
  a.activePlayerId = pid; a.updatedAt = new Date().toISOString(); a.updatedBy = 'army-hq';
  return lsSet(Army.ARMY_KEY, JSON.stringify(a));
}
function onPick(e) {
  const v = e.target.value;
  if (v === '+new') { go('customize/nation/new'); return; }
  if (v === '+edit') { go('customize/nation'); return; }
  if (setActive(v)) blip(760, 0.06, 'triangle'); renderWho();
}
$('#selP').addEventListener('change', onPick); $('#selN').addEventListener('change', onPick);
$('#mkP').addEventListener('click', () => go('customize/nation')); $('#mkN').addEventListener('click', () => go('customize/nation'));

// ---------- sound (WebAudio blips, no files) ----------
let ac = null;
const soundOn = () => lsGet(LS_SND) !== '0';
function blip(f = 660, d = 0.06, type = 'square', vol = 0.05) {
  if (!soundOn()) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  } catch (e) { /* no audio */ }
}

// ---------- settings toggles ----------
function paintTog(btn, on) { btn.setAttribute('aria-pressed', String(on)); btn.querySelector('.st').textContent = on ? 'ON' : 'OFF'; }
function renderSettings() {
  paintTog($('#tPick'), lsGet(LS_PICK) !== '0');
  paintTog($('#tSnd'), soundOn());
  $('#tSnd .ic').textContent = soundOn() ? '🔊' : '🔇';
}
$('#tPick').addEventListener('click', () => { lsSet(LS_PICK, lsGet(LS_PICK) === '0' ? '1' : '0'); renderSettings(); blip(lsGet(LS_PICK) === '0' ? 330 : 880); });
$('#tSnd').addEventListener('click', () => { lsSet(LS_SND, soundOn() ? '0' : '1'); renderSettings(); blip(880); });

// ---------- dropdown menus: 🪖 Customize / 🎬 Views ----------
let openMenu = null;
function placeMenu(m, tile) {
  const r = tile.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, pad = 8;
  const w = Math.min(vw - pad * 2, Math.max(r.width, m.classList.contains('one') ? 240 : 340));
  m.style.width = w + 'px'; m.style.left = '0px'; m.style.top = '0px';
  const h = m.offsetHeight;
  let x = Math.min(Math.max(pad, r.left + r.width / 2 - w / 2), vw - w - pad);
  let y = r.bottom + 6;
  if (y + h > vh - pad) y = r.top - h - 6;               // no room below: open above
  if (y < pad) y = Math.max(pad, (vh - h) / 2);          // no room either way: centre
  m.style.left = Math.round(x) + 'px'; m.style.top = Math.round(y) + 'px';
}
function showMenu(tile, focusFirst) {
  const m = $('#' + tile.dataset.menu); if (openMenu && openMenu.m === m) return;
  closeMenu(false);
  m.hidden = false; $('#scrim').hidden = false; tile.setAttribute('aria-expanded', 'true');
  placeMenu(m, tile); openMenu = { m, tile };
  blip(600, 0.05, 'triangle', 0.04);
  if (focusFirst) m.querySelector('a').focus();
}
function closeMenu(refocus = true) {
  if (!openMenu) return;
  const { m, tile } = openMenu; openMenu = null;
  m.hidden = true; $('#scrim').hidden = true; tile.setAttribute('aria-expanded', 'false');
  if (refocus) tile.focus();
}
for (const t of document.querySelectorAll('.tile.drop')) {
  t.addEventListener('click', (e) => { if (openMenu && openMenu.tile === t) closeMenu(false); else showMenu(t, e.detail === 0); }); // keyboard click (detail 0) → focus first item
}
$('#scrim').addEventListener('click', () => closeMenu(false));
addEventListener('resize', () => { if (openMenu) placeMenu(openMenu.m, openMenu.tile); });

// ---------- tiles + menu items: press feedback, sound, keyboard arrows ----------
const tiles = [...document.querySelectorAll('#menu .tile')];
for (const t of document.querySelectorAll('#menu .tile, .ddm a')) {
  t.addEventListener('pointerdown', () => t.classList.add('press'));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) t.addEventListener(ev, () => t.classList.remove('press'));
  t.addEventListener('focus', () => { if (t.matches(':focus-visible')) blip(520, 0.04, 'triangle', 0.04); });
  if (!t.dataset.route) continue;
  t.addEventListener('click', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // new tab etc: the #route link still works
    e.preventDefault(); go(t.dataset.route);
  });
}
$('.tile[data-key=all]').addEventListener('click', (e) => {
  if (!soundOn() || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault(); blip(440, 0.09, 'square', 0.06); setTimeout(() => { location.href = e.currentTarget.href; }, 110);
});
// arrow keys: nearest item in that direction (any grid layout); inside an open dropdown only its items
function moveFocus(list, dx, dy) {
  const cur = document.activeElement;
  if (!list.includes(cur)) { list[0].focus(); return; }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bs = Infinity;
  for (const t of list) {
    if (t === cur) continue;
    const q = t.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, ddx = x - cx, ddy = y - cy;
    const along = dx ? ddx * dx : ddy * dy, across = dx ? Math.abs(ddy) : Math.abs(ddx);
    const edge = dx ? (dx > 0 ? q.left >= r.right - 4 : q.right <= r.left + 4) : (dy > 0 ? q.top >= r.bottom - 4 : q.bottom <= r.top + 4);
    if (along <= 0 || !edge) continue;
    const s = along + across * 2 + (dx ? y : x) * 0.001; // tie → the upper / left one
    if (s < bs) { bs = s; best = t; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
}
addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || current) return; // a game is on stage: keys belong to it
  const k = e.key, d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
  const ae = document.activeElement;
  if (ae && ae.tagName === 'SELECT') return; // native dropdown keys
  if (openMenu) {
    const items = [...openMenu.m.querySelectorAll('a')];
    if (k === 'Escape') { e.preventDefault(); closeMenu(); return; }
    if (k === 'Tab') { closeMenu(false); return; }
    if (d) { e.preventDefault(); moveFocus(items, d[0], d[1]); return; }
    if (k === ' ' && items.includes(ae)) { e.preventDefault(); ae.click(); }
    return;
  }
  if (d) { e.preventDefault(); moveFocus(tiles, d[0], d[1]); return; }
  if ((k === 'Enter' || k === ' ') && !tiles.includes(ae) && !(ae && ae.matches('button,select,a'))) { e.preventDefault(); tiles[0].focus(); }
  if (k === ' ' && tiles.includes(ae) && ae.tagName === 'A') { e.preventDefault(); ae.click(); }
});

// ---------- the stage: one iframe at a time, hash routing ----------
let current = null, frame = null, homeT = 0, lastTile = null, frameNavs = 0; // frameNavs: page loads inside the frame after its first (each adds a history entry)
const home = $('#home');
function go(route) {
  closeMenu(false);
  if (!ROUTES[route]) route = '';
  lastTile = document.activeElement && document.activeElement.closest && document.activeElement.closest('.tile, .ddm a') ? document.activeElement : lastTile;
  blip(440, 0.09, 'square', 0.06);
  if (route === routeNow()) { show(route); return; }
  history.pushState({ hq: 1, from: current ? 'game' : 'menu' }, '', route ? '#' + route : location.pathname + location.search);
  show(route);
}
function goHome() {
  // straight back to the menu entry (no extra history) when the game made no page loads of its own; else a fresh menu entry
  if (history.state && history.state.from === 'menu' && frameNavs <= 0) history.back();
  else { history.pushState({ hq: 1 }, '', location.pathname + location.search); show(''); }
}
home.addEventListener('click', (e) => { e.preventDefault(); goHome(); });
function vis(doc, el) { return !!el && el.getClientRects().length > 0 && doc.defaultView.getComputedStyle(el).visibility !== 'hidden'; }
// keep the 🏠 clear of the game's own HUD: anchor it to an element inside the frame (same origin)
function placeHome() {
  if (!current) return;
  const r = ROUTES[current], hcfg = (r && r.home) || { pos: 'bl' }, ox = hcfg.x ?? 8, oy = hcfg.y ?? 8;
  const V = hcfg.pos[0] === 't' ? 'top' : 'bottom', H = hcfg.pos[1] === 'l' ? 'left' : 'right';
  const st = home.style; st.top = st.bottom = st.left = st.right = 'auto';
  st[V] = `calc(env(safe-area-inset-${V}, 0px) + ${oy}px)`; st[H] = `calc(env(safe-area-inset-${H}, 0px) + ${ox}px)`;
  let on = true, doc = null;
  try { doc = frame && frame.contentDocument; } catch (e) { doc = null; }
  if (doc && doc.body) {
    if (hcfg.only) on = vis(doc, doc.querySelector(hcfg.only));
    const ea = hcfg.after && doc.querySelector(hcfg.after);
    if (on && vis(doc, ea)) {
      const q = ea.getBoundingClientRect(), hh = home.offsetHeight || 36;
      st.left = Math.round(q.right + ox) + 'px'; st.right = 'auto'; st.top = Math.round(q.top + (q.height - hh) / 2) + 'px'; st.bottom = 'auto';
    }
    const eb = hcfg.below && doc.querySelector(hcfg.below);
    if (on && vis(doc, eb)) {
      const q = eb.getBoundingClientRect();
      st.top = Math.round(q.bottom + oy) + 'px'; st.bottom = 'auto';
      if (H === 'left') st.left = Math.round(q.left) + 'px'; else st.right = Math.round(innerWidth - q.right) + 'px';
    }
  }
  home.hidden = !on;
}
function onFrameLoad() {
  let w = null; try { w = frame.contentWindow; void w.location.href; } catch (e) { w = null; }
  if (!w) return;
  frameNavs++;
  const u = new URL(w.location.href), here = new URL(location.href);
  // never nest: the hub or Army HQ itself loaded inside the stage → take it to the top page instead
  if (u.pathname === here.pathname) { goHome(); return; }
  if (/\/games\/(index\.html)?$/.test(u.pathname)) { location.href = u.href; return; }
  const r = routeOfUrl(u);
  if (r && r !== current) { current = r; history.replaceState(history.state, '', '#' + r); document.title = (ROUTES[r].name || 'Army HQ') + ' · 🪖 Army HQ'; }
  try { w.focus(); } catch (e) { /* ignore */ }
  frame.focus();
  placeHome();
}
function show(route) {
  const r = ROUTES[route];
  if (!r) route = '';
  if (route && r.become) history.replaceState(history.state, '', '#' + r.become); // e.g. ".../new": refresh must not create again
  current = route || null;
  const stage = $('#stage'), soon = $('#soon');
  if (frame) { frame.remove(); frame = null; }
  clearInterval(homeT);
  if (!route) {
    document.body.classList.remove('playing'); stage.hidden = true; soon.hidden = true; home.hidden = true;
    document.title = '🪖 Army HQ'; refresh();
    const t = lastTile && lastTile.isConnected && !lastTile.closest('.ddm') ? lastTile : lastTile && lastTile.closest('.ddm') ? document.querySelector(`[data-menu="${lastTile.closest('.ddm').id}"]`) : null;
    if (t) t.focus({ preventScroll: true });
    return;
  }
  document.body.classList.add('playing');
  document.title = r.name + ' · 🪖 Army HQ';
  if (r.soon) {
    stage.hidden = true; soon.hidden = false;
    $('#soonIc').textContent = r.soon; $('#soonName').textContent = r.name;
    home.hidden = false; placeHome(); home.focus({ preventScroll: true });
    return;
  }
  soon.hidden = true; stage.hidden = false;
  frame = document.createElement('iframe');
  frame.title = r.name; frame.name = 'stage';
  frame.allow = 'fullscreen; autoplay; gamepad; screen-wake-lock; clipboard-write';
  frame.setAttribute('allowfullscreen', '');
  frame.src = r.src; frameNavs = -1;
  frame.addEventListener('load', onFrameLoad);
  stage.append(frame);
  home.hidden = true; placeHome();
  homeT = setInterval(placeHome, 400); // cheap poll (no observers on busy game HUDs)
}
addEventListener('popstate', () => { const r = routeNow(); if (r && r === current && (frame || !ROUTES[r].src)) return; show(r); });
addEventListener('hashchange', () => { if ((current || '') !== routeNow()) show(routeNow()); }); // typed / pasted #route
addEventListener('resize', placeHome);

// ---------- refresh when coming back (bfcache) or when a game saves ----------
function refresh() { if (current) return; renderWho(); renderSettings(); for (const t of document.querySelectorAll('.press')) t.classList.remove('press'); }
addEventListener('pageshow', refresh);
addEventListener('storage', (e) => { if (!e.key || e.key === Army.ARMY_KEY || e.key === LS_PICK || e.key === LS_SND) refresh(); });
renderSettings(); renderWho();
show(routeNow());
window.__armyMenu = { readArmy, renderWho, setActive, go, goHome, routes: ROUTES, get route() { return current || ''; }, get frame() { return frame; } };
