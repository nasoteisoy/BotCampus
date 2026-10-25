// Army HQ: ONE page for every army game, ONE address. The menu + a full-screen same-origin <iframe> "stage".
// The address bar never changes: the open view lives in sessionStorage (refresh restores it), Back = a same-URL
// history entry (Back closes the view), and every link / window.open / top navigation inside the stage is kept
// inside the stage (sandbox backstop: no popups, no top navigation). A floating 🏠 returns here.
// Save: reads 'botcampus:army' (shared by every game). The only write is the Player / Nation pick
// (activePlayerId patched into the stored JSON, nothing else touched).
// Settings: 📦 packs = Conquest's 'conquest-commander:pickups-flag' ('1' on / '0' off, missing = on)
//           🔊 sound  = 'botcampus:army-menu:sound' ('1' / '0', missing = on), menu blips only.
import * as Army from '../shared/army/schema.js?v=9';

const $ = (s) => document.querySelector(s);
const LS_PICK = 'conquest-commander:pickups-flag', LS_SND = 'botcampus:army-menu:sound';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
// read-only view of localStorage: Army.load() may migrate an old save; reading never writes (the games do)
const RO = { getItem: lsGet, setItem() {}, removeItem() {} };

// ---------- routes: every game / editor / view opens inside this page ----------
// home: where the floating 🏠 sits so it does not cover the game's own buttons (same rules as each game's HUD)
// land: override on short landscape phones · beside: just left of that element, same top · at: sit on that element (a slot the page
// keeps free for it) · after: just right of that element · css: injected into that page
// own: the page draws its own ⬅️ Back + '🏠 Army HQ ›' crumbs top-left (they call back here), so the floating 🏠 hides: one way home, one corner
const TC = { own: true }, ARENA = { own: true };
// dd: an item in a dropdown (ddC = 🪖 Customize, ddV = 🎬 Views), in this order. A new editor = one line here.
const ROUTES = {
  conquest: { src: '../conquest-commander/', name: 'Conquest', home: { pos: 'tr', only: '#start' } },
  ships: { src: '../ship-sandbox/', name: 'Ships', home: { pos: 'tl', below: '#stats', y: 6 } },
  customize: { src: '../trooper-custom/', name: 'Customize', home: TC },
  'customize/nation': { src: '../trooper-custom/?section=nation', name: 'Nation', home: TC, dd: ['ddC', '🏳️', 'Nation: name, colors, flag'] },
  'customize/nation/new': { src: '../trooper-custom/?section=nation&new=1', name: 'Nation', home: TC, become: 'customize/nation' },
  'customize/troopers': { src: '../trooper-custom/?section=troopers', name: 'Troopers', home: TC, dd: ['ddC', '🪖', 'Troopers: helmet, armor, weapons, gear'] },
  'customize/armor': { src: '../trooper-custom/?section=armor', name: 'Armor', home: TC, dd: ['ddC', '🚜', 'Armor: tanks (hull, turret, gun)'] },
  // SpaceShip / BattleShip keep a free slot (#homeSpot / #hqslot) next to their ⬅️ Back for the 🏠; when Back shows (demo / step 2) the 🏠 sits right of it
  'customize/spaceship': { src: '../spaceship-custom/?section=ship', name: 'SpaceShip', home: { pos: 'tl', after: '#backBtn', at: '#homeSpot', x: 8 }, dd: ['ddC', '🛸', 'SpaceShip: ride into battle or space'] },
  'customize/battleship': { src: '../battleship-custom/?section=battleship', name: 'BattleShip', home: { pos: 'tl', at: '#hqslot', after: '#back', x: 8 }, dd: ['ddC', '🚀', 'BattleShip: win the space battle'] },
  'customize/brains': { src: '../unit-brains/', name: 'Brains', home: { own: true }, dd: ['ddC', '🧠', 'Brains: IF → THEN for your troops'] },
  'view/action': { src: '../trooper-custom/demo.html', name: 'Action view', home: ARENA, dd: ['ddV', '🎬', 'Action view: walk, shoot, drive'] },
  'view/combat': { src: '../trooper-custom/combat.html', name: 'Combat simulator', label: 'Combat sim', home: ARENA, dd: ['ddV', '🎯', 'Combat simulator: one trooper vs targets'] },
  'view/team': { src: '../trooper-custom/team.html', name: 'Team simulator', label: 'Team sim', home: ARENA, dd: ['ddV', '👥', 'Team simulator: your team vs waves'] },
  hub: { src: '../', name: 'Everything', home: { pos: 'tr', x: 12, y: 10 }, css: 'header h1{padding-right:64px;min-height:52px;display:flex;align-items:center;gap:8px;margin-top:0}' }, // room for 🏠 in the hub's title row
};
for (const [route, r] of Object.entries(ROUTES)) {
  if (!r.dd) continue;
  const [dd, ic, tip] = r.dd, a = document.createElement('a');
  Object.assign(a, { role: 'menuitem', tabIndex: 0, title: tip });
  a.setAttribute('role', 'menuitem'); a.dataset.route = route;
  a.append(Object.assign(document.createElement('span'), { className: 'ic', textContent: ic }), Object.assign(document.createElement('span'), { className: 'lb', textContent: r.label || r.name }));
  document.getElementById(dd).append(a);
}
const OTHER = { name: 'Army HQ', home: { pos: 'br', y: 12, x: 12 } }; // any other page reached inside the stage (hub games)
const abs = (u) => new URL(u, location.href);
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
  selP.replaceChildren(...army.players.map((x) => opt(x.id, x.name, x.id === p.id)), opt('+new', '➕ New player'));
  selN.replaceChildren(...army.players.map((x) => opt(x.id, x.nation.name, x.id === p.id)), opt('+edit', '✏️ Edit'), opt('+new', '➕ New nation'));
  selP.title = 'Player: ' + p.name; selN.title = 'Nation: ' + n.name + ' (each player has one nation)';
  const tr = units.filter((u) => u.kind === 'trooper').length, tk = units.length - tr;
  const nw = (n, one, many) => `${n} ${n === 1 ? one : many}`; // every stat says what it counts
  $('#units').textContent = `🪖 ${nw(tr, 'trooper', 'troopers')}` + (tk ? ` · 🚜 ${nw(tk, 'tank', 'tanks')}` : '');
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
  t.addEventListener('click', (e) => { e.preventDefault(); go(t.dataset.route); });
  t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); t.click(); } }); // role=button links (no href: nothing to open in a new tab)
  t.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press: no "open in new tab" sheet
}
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

// ---------- the stage: one iframe at a time, ONE address ----------
// history: [menu entry] → go() pushes a same-URL entry {hq:'view'} → Back pops it → popstate closes the view.
// Links inside the stage may add their own (same-URL) entries; Back walks them inside the stage first.
const SS = 'botcampus:army-hq:view';
const ssGet = () => { try { return JSON.parse(sessionStorage.getItem(SS) || 'null'); } catch (e) { return null; } };
const ssSet = (v) => { try { if (v) sessionStorage.setItem(SS, JSON.stringify(v)); else sessionStorage.removeItem(SS); } catch (e) { /* private mode */ } };
const URL0 = location.href.replace(/#.*$/, ''); // the one address
let current = null, frame = null, homeT = 0, lastTile = null, frameUrl = null, toastT = 0, lastView = null; // lastView: for Forward after Back
const home = $('#home');
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }
function go(route) {
  closeMenu(false);
  if (!ROUTES[route]) route = '';
  lastTile = document.activeElement && document.activeElement.closest && document.activeElement.closest('.tile, .ddm a') ? document.activeElement : lastTile;
  blip(440, 0.09, 'square', 0.06);
  if (!route) { goHome(); return; }
  if (!(history.state && history.state.hq === 'view')) history.pushState({ hq: 'view' }, '', URL0);
  show(route);
}
function goHome() {
  const wasView = history.state && history.state.hq === 'view';
  show('');
  if (wasView) history.back(); // drop the view entry (the stage's own entries went with the iframe) → Back now leaves normally
}
home.addEventListener('click', (e) => { e.preventDefault(); goHome(); });
home.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } });
function vis(doc, el) { return !!el && el.getClientRects().length > 0 && doc.defaultView.getComputedStyle(el).visibility !== 'hidden'; }
const cfgNow = () => (current === '*' ? OTHER : ROUTES[current]) || OTHER;
const homeCfg = () => { const h = cfgNow().home || { pos: 'bl' }; return (h.land && innerHeight <= 520 && innerWidth > innerHeight) ? h.land : h; };
// keep the 🏠 clear of the game's own HUD: anchor it to an element inside the frame (same origin)
function placeHome() {
  if (!current) return;
  guard();
  const hcfg = homeCfg(), ox = hcfg.x ?? 8, oy = hcfg.y ?? 8;
  if (hcfg.own) { home.hidden = true; home.classList.remove('fit'); home.style.width = ''; return; } // the page has its own ⬅️ Back / 🏠 Army HQ crumb
  const V = hcfg.pos[0] === 't' ? 'top' : 'bottom', H = hcfg.pos[1] === 'l' ? 'left' : 'right';
  const st = home.style; st.top = st.bottom = st.left = st.right = 'auto';
  st[V] = `calc(env(safe-area-inset-${V}, 0px) + ${oy}px)`; st[H] = `calc(env(safe-area-inset-${H}, 0px) + ${ox}px)`;
  let on = true, doc = null, fit = false;
  try { doc = frame && frame.contentDocument; } catch (e) { doc = null; }
  if (doc && doc.body) {
    if (hcfg.only) on = vis(doc, doc.querySelector(hcfg.only));
    const ea = hcfg.after && doc.querySelector(hcfg.after);
    const qa = vis(doc, ea) && ea.getBoundingClientRect();
    if (on && qa && qa.bottom > 0 && qa.top < innerHeight && qa.right + 60 < innerWidth) {
      const q = qa, hh = home.offsetHeight || 48;
      st.left = Math.round(q.right + ox) + 'px'; st.right = 'auto'; st.top = Math.round(q.top + (q.height - hh) / 2) + 'px'; st.bottom = 'auto';
    }
    const et = hcfg.at && doc.querySelector(hcfg.at);
    fit = on && vis(doc, et);
    if (fit) { const q = et.getBoundingClientRect(); st.width = Math.round(q.width) + 'px'; st.left = Math.round(q.left) + 'px'; st.top = Math.round(q.top + (q.height - (home.offsetHeight || 48)) / 2) + 'px'; st.right = st.bottom = 'auto'; }
    const eb = hcfg.below && doc.querySelector(hcfg.below);
    if (on && vis(doc, eb)) {
      const q = eb.getBoundingClientRect();
      st.top = Math.round(q.bottom + oy) + 'px'; st.bottom = 'auto';
      if (H === 'left') st.left = Math.round(q.left) + 'px'; else st.right = Math.round(innerWidth - q.right) + 'px';
    }
    const es = hcfg.beside && doc.querySelector(hcfg.beside);
    if (on && vis(doc, es)) { const q = es.getBoundingClientRect(); st.top = Math.round(q.top) + 'px'; st.bottom = 'auto'; st.right = Math.round(innerWidth - q.left + ox) + 'px'; st.left = 'auto'; }
  }
  home.classList.toggle('fit', fit); if (!fit) st.width = ''; // fit: exactly the slot the page keeps free (no spill onto its title)
  home.hidden = !on;
}
// ---- keep everything inside the stage (same origin, so the shell can reach into each page it loads) ----
const SHELL = abs('./').pathname;
const isShell = (u) => u.origin === location.origin && (u.pathname === SHELL || u.pathname === SHELL + 'index.html');
function stageNav(w, href) {
  let u; try { u = new URL(href, w.location.href); } catch (e) { return; }
  // the hub writes full live links when it runs off GitHub Pages (preview copies): point those at this same copy
  const LIVE = 'https://nasoteisoy.github.io/BotCampus/';
  if (u.origin !== location.origin && u.href.indexOf(LIVE) === 0) u = new URL(u.href.slice(LIVE.length), new URL('../../', URL0));
  if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) { toast('🔒 Outside links stay closed in Army HQ'); return; }
  if (isShell(u)) { goHome(); return; }
  w.location.assign(u.href); // inside the stage (same tab, same address bar)
}
function patchWin(w) {
  if (!w || w.__hqPatched) return;
  let doc; try { doc = w.document; } catch (e) { return; }
  if (!doc || !doc.head || !doc.body) return; // too early: the next check (load / 400ms poll) patches it
  w.__hqPatched = true;
  const css = cfgNow().css; // a little room for the 🏠 on pages that have none (shell-side, the page's own files stay as they are)
  if (css && doc.head) { const el = doc.createElement('style'); el.dataset.armyHq = '1'; el.textContent = css; doc.head.append(el); }
  // window.open('x') → open it in the stage instead of a new tab / window
  try { w.open = function (href) { if (href) stageNav(w, String(href)); return null; }; } catch (e) { /* locked */ }
  // links: target=_blank/_top/_parent/named, other sites, and links back to Army HQ itself
  doc.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href], area[href]');
    if (!a || e.defaultPrevented) return;
    const raw = a.getAttribute('href') || '';
    if (a.hasAttribute('download') || /^(javascript:|blob:|data:|#)/i.test(raw)) return; // same page / file save
    let u; try { u = new URL(a.href, w.location.href); } catch (e2) { return; }
    const tgt = (a.getAttribute('target') || (doc.querySelector('base[target]') || {}).target || '').toLowerCase();
    const outside = u.origin !== location.origin, away = tgt && tgt !== '_self';
    if (outside || away || isShell(u) || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) { e.preventDefault(); e.stopPropagation(); stageNav(w, u.href); }
  }, true);
  doc.addEventListener('auxclick', (e) => { const a = e.target && e.target.closest && e.target.closest('a[href]'); if (a) e.preventDefault(); }, true); // middle click: no new tab
  doc.addEventListener('submit', (e) => { const f = e.target; if (f && f.target && f.target !== '_self') f.target = '_self'; }, true);
  // links that pages make later inherit the rule through the click handler above; nested frames get patched too
  for (const f of doc.querySelectorAll('iframe')) { try { patchWin(f.contentWindow); } catch (e) { /* cross-origin */ } }
}
// cheap check (also from the 400ms poll): page inside the stage changed → patch it, remember it for refresh
function guard() {
  let w = null; try { w = frame && frame.contentWindow; void w.location.href; } catch (e) { w = null; }
  if (!w) return;
  if (w.location.href === 'about:blank') return;
  let u; try { u = new URL(w.location.href); } catch (e) { return; }
  if (u.href !== frameUrl) {
    frameUrl = u.href;
    if (isShell(u)) { goHome(); return; } // never nest Army HQ in itself
    const r = routeOfUrl(u) || '*';
    if (r !== current) { current = r; document.title = cfgNow().name + ' · 🪖 Army HQ'; }
    const keep = new URL(u.href); keep.searchParams.delete('new'); // refresh must not create another nation
    ssSet({ route: current, url: keep.pathname + keep.search + keep.hash });
  }
  patchWin(w);
}
function onFrameLoad() {
  guard();
  if (!current) return;
  try { frame.contentWindow.focus(); } catch (e) { /* ignore */ }
  frame.focus();
  placeHome();
}
function show(route, url) {
  const r = route === '*' ? OTHER : ROUTES[route];
  if (!r) route = '';
  const current0 = current;
  current = route || null;
  const stage = $('#stage');
  if (frame) { frame.remove(); frame = null; }
  clearInterval(homeT); frameUrl = null;
  if (!route) {
    if (current0) lastView = ssGet() || lastView;
    ssSet(null);
    document.body.classList.remove('playing'); stage.hidden = true; home.hidden = true;
    document.title = '🪖 Army HQ'; refresh();
    const t = lastTile && lastTile.isConnected && !lastTile.closest('.ddm') ? lastTile : lastTile && lastTile.closest('.ddm') ? document.querySelector(`[data-menu="${lastTile.closest('.ddm').id}"]`) : null;
    if (t) t.focus({ preventScroll: true });
    return;
  }
  if (r.become) current = r.become;
  document.body.classList.add('playing');
  document.title = r.name + ' · 🪖 Army HQ';
  stage.hidden = false;
  frame = document.createElement('iframe');
  frame.title = r.name; frame.name = 'stage';
  frame.allow = 'fullscreen; autoplay; gamepad; screen-wake-lock; clipboard-write';
  // backstop: no popups / new windows and no navigating this page away, whatever a game's code tries
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-pointer-lock allow-orientation-lock');
  let src = r.src;
  if (url) { try { const u = abs(url); if (u.origin === location.origin && !isShell(u)) src = u.pathname + u.search + u.hash; } catch (e) { /* keep route src */ } }
  frame.src = src;
  frame.addEventListener('load', onFrameLoad);
  stage.append(frame);
  { const k = abs(src); k.searchParams.delete('new'); ssSet({ route: current, url: k.pathname + k.search }); }
  home.hidden = true; placeHome();
  homeT = setInterval(placeHome, 400); // cheap poll (no observers on busy game HUDs)
}
// Back (phone / browser): our view entry popped → close the view. Forward onto a view entry → reopen the last view.
addEventListener('popstate', (e) => {
  const st = e.state;
  if (st && st.hq === 'view') { if (!current) { const v = ssGet() || lastView; if (v && v.route) show(v.route, v.url); } return; }
  if (current) show('');
});
addEventListener('resize', placeHome);

// ---------- refresh when coming back (bfcache) or when a game saves ----------
function refresh() { if (current) return; renderWho(); renderSettings(); for (const t of document.querySelectorAll('.press')) t.classList.remove('press'); }
addEventListener('pageshow', refresh);
addEventListener('storage', (e) => { if (!e.key || e.key === Army.ARMY_KEY || e.key === LS_PICK || e.key === LS_SND) refresh(); });
renderSettings(); renderWho();
// boot: old v2 links (…/army/#conquest) still open their view, then the address is cleaned; refresh restores the view
{
  const legacy = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (location.hash) history.replaceState(history.state, '', URL0);
  const saved = ssGet(), want = ROUTES[legacy] ? { route: legacy } : saved;
  const r = want && (want.route === '*' || ROUTES[want.route]) ? want : null;
  if (r) {
    if (!(history.state && history.state.hq === 'view')) { history.replaceState(null, '', URL0); history.pushState({ hq: 'view' }, '', URL0); }
    show(r.route, r.url);
  } else if (history.state && history.state.hq === 'view') { history.replaceState(null, '', URL0); }
}
window.__armyMenu = { readArmy, renderWho, setActive, go, goHome, routes: ROUTES, toast, get route() { return current || ''; }, get frame() { return frame; } };
