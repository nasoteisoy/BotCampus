// Spectre Spire: Haunt Haulers. Boot, menus, online rooms, the game loop and juice.
import * as THREE from 'three';
import { HUNTERS, SHOP, T, TOWER_SIZES, FLOOR_TYPES, LOOT, GHOSTS } from './config.js';
import { Sim, GHOST_KINDS, HI, aimVector } from './sim.js';
import { buildFloor, flowField, flowDir, lineClear } from './tower.js';
import { View } from './world3d.js';
import { createInput } from './input.js';
import { createParticles, createPopups, createShake } from './fx.js';
import { initAudio, sfx, setHum, setSound } from './audio.js';
import { LocalPlayer } from './player.js';
import * as net from './net.js';
import { $, show, current, hydrateIcons, toast, initTips, renderHunters, renderShop, helpHTML } from './ui.js';
import { resetHud, updateTopBar, updateAim, aimText, updateLabels, esc } from './hud.js';

const QA = new URLSearchParams(location.search).has('qa');
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---------- settings (saved on this device)
const SKEY = 'spectreSpire:settings';
const settings = { sens: 1, fov: 75, invertY: false, shake: true, bob: true, sound: true, name: '', hunter: 0, tower: 5, bots: 3 };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (e) { /* fresh settings */ }
const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* private mode */ } };
const HKEY = 'spectreSpire:hints';
let hintsDone = {};
try { hintsDone = JSON.parse(localStorage.getItem(HKEY) || '{}'); } catch (e) { hintsDone = {}; }

// ---------- boot
hydrateIcons();
initTips();
const view = new View($('#view'));
const particles = createParticles(view.scene);
const popups = createPopups($('#pops'), view.camera);
const shake = createShake();
const player = new LocalPlayer();
const input = createInput({
  canvas: $('#view'), stickZone: $('#stickZone'), lookZone: $('#lookZone'), stickEl: $('#stick'), knobEl: $('#knob'),
  buttons: { suck: $('#bSuck'), grab: $('#bGrab'), skill: $('#bSkill'), jump: $('#bJump'), guide: $('#guideBtn') },
  onPause: () => openPause(), settings,
});
const fine = matchMedia('(pointer: fine)').matches && !('ontouchstart' in window);
document.body.classList.toggle('desk', fine);
window.addEventListener('touchstart', () => document.body.classList.remove('desk'), { once: true, passive: true });
window.addEventListener('resize', () => { view.resize(); particles.setScale(view.h); });
particles.setScale(view.h);
setSound(settings.sound);
document.addEventListener('pointerdown', () => initAudio(), { capture: true });
$('#helpBody').innerHTML = helpHTML();
$('#nameIn').value = settings.name;
$('#nameIn').addEventListener('input', () => { settings.name = $('#nameIn').value.trim().slice(0, 14); saveSettings(); });
const myName = () => settings.name || 'Hunter';
const MY_ID = net.makeId();

// title screen backdrop: a slowly turning floor
let backdrop = buildFloor({ runSeed: 777, n: 4, type: 'hunt' });
view.buildFloor(backdrop);
view.setGun(HUNTERS[settings.hunter].color);
view.gun.visible = false;

// ---------- menus
let setupMode = 'solo';
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { sfx.click(); show('sMenu'); }));
$('#mSolo').onclick = () => openSetup('solo');
$('#mHost').onclick = () => openSetup('host');
$('#mJoin').onclick = () => { sfx.click(); $('#joinErr').textContent = ''; show('sJoin'); $('#codeIn').focus(); };
let helpBack = 'sMenu';
const openHelp = () => { helpBack = current() || null; show('sHelp'); };
$('#mHelp').onclick = openHelp;
$('#helpClose').onclick = () => { if (helpBack && helpBack !== 'sHelp') show(helpBack); else { show(null); resumeInput(); } };

function openSetup(mode) {
  sfx.click();
  setupMode = mode;
  $('#setupCrumb').textContent = mode === 'solo' ? 'Spectre Spire › Solo › Set up' : 'Spectre Spire › Create a room › Set up';
  $('#setupGoText').textContent = mode === 'solo' ? 'Start' : 'Open room';
  $('#botsBox').hidden = mode !== 'solo';
  const pick = () => renderHunters($('#hunterGrid'), { selected: settings.hunter, onPick: (i) => { settings.hunter = i; saveSettings(); sfx.click(); pick(); } });
  pick();
  $('#towerSeg').innerHTML = TOWER_SIZES.map((n) => `<button data-n="${n}" class="${n === settings.tower ? 'sel' : ''}">${n}<small>floors</small></button>`).join('');
  $('#towerSeg').onclick = (e) => { const b = e.target.closest('[data-n]'); if (!b) return; settings.tower = +b.dataset.n; saveSettings(); sfx.click(); openSetup(setupMode); };
  $('#botCount').textContent = settings.bots;
  show('sSetup');
}
$('#botMinus').onclick = () => { settings.bots = Math.max(0, settings.bots - 1); $('#botCount').textContent = settings.bots; saveSettings(); sfx.click(); };
$('#botPlus').onclick = () => { settings.bots = Math.min(5, settings.bots + 1); $('#botCount').textContent = settings.bots; saveSettings(); sfx.click(); };
$('#setupGo').onclick = () => { sfx.click(); if (setupMode === 'solo') startSolo(); else createRoom(); };
$('#codeIn').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('#codeIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('#joinGo').onclick = () => joinRoom();

// ---------- pause and settings
function syncSettingsUI() {
  $('#setSens').value = settings.sens; $('#setFov').value = settings.fov; $('#setInvert').checked = settings.invertY;
  $('#setShake').checked = settings.shake; $('#setBob').checked = settings.bob; $('#setSound').checked = settings.sound;
}
for (const [id, key, num] of [['setSens', 'sens', 1], ['setFov', 'fov', 1], ['setInvert', 'invertY', 0], ['setShake', 'shake', 0], ['setBob', 'bob', 0], ['setSound', 'sound', 0]]) {
  $('#' + id).addEventListener('input', (e) => { settings[key] = num ? +e.target.value : e.target.checked; saveSettings(); setSound(settings.sound); });
}
function openPause() {
  if (!S || S.phase === 'win' || S.phase === 'lose' || current()) return;
  input.unlock(); input.reset();
  syncSettingsUI();
  $('#pauseNote').textContent = S.role === 'solo' ? 'The game is paused.' : 'Online games keep going while this menu is open.';
  S.paused = S.role === 'solo';
  show('sPause');
}
function resumeInput() { if (S) { S.paused = false; input.state.enabled = true; } }
$('#pauseBtn').addEventListener('click', openPause);
$('#helpBtn').addEventListener('click', () => { if (S) { input.unlock(); S.paused = S.role === 'solo'; } openHelp(); });
$('#resumeBtn').onclick = () => { sfx.click(); show(null); resumeInput(); };
$('#pauseHelp').onclick = openHelp;
$('#quitBtn').onclick = () => leaveGame('You left the game.');

// =====================================================================
// Game session
// =====================================================================
let S = null;

function newSession(role, extra) {
  return { role, me: MY_ID, phase: 'play', paused: false, snap: null, buf: [], floorKey: '', floor: null, lastEid: -1, eidPrimed: false,
    want: -1, wantT: 0, abSeq: 0, buySeq: 0, buyItem: null, readyFor: 0, sendT: 0, lastSnapAt: performance.now(), stopFns: [],     revealShown: false, hint: null, hintT: 0, startedAt: performance.now(), ...extra };
}

function startSolo() {
  const roster = [{ pid: MY_ID, name: myName(), h: settings.hunter, ctrl: 'local' }];
  const free = HUNTERS.map((_, i) => i).filter((i) => i !== settings.hunter);
  for (let i = 0; i < settings.bots; i++) roster.push({ pid: 'bot' + i, name: HUNTERS[free[i]].name, h: free[i], ctrl: 'bot' });
  const sim = new Sim({ runSeed: (Math.random() * 1e9) | 0, tower: settings.tower, roster });
  beginGame(newSession('solo', { sim }));
}

function beginGame(sess) {
  S = sess;
  show(null);
  $('#hud').hidden = false;
  resetHud();
  input.reset(); input.state.enabled = true;
  if (fine && !input.state.touch) toast('Click the game to look around with the mouse.', 3500);
}

function leaveGame(msg) {
  if (!S) return;
  const s = S; S = null;
  s.stopFns.forEach((f) => f());
  if (s.role === 'host') { net.netPatch(s.code, 'meta', { phase: 'closed' }).catch(() => {}); setTimeout(() => net.netDelete(s.code).catch(() => {}), 4000); }
  if (s.role === 'guest') { net.netDelete(s.code, 'p/' + MY_ID).catch(() => {}); net.netDelete(s.code, 'lobby/' + MY_ID).catch(() => {}); }
  setHum(false); input.unlock(); input.reset(); input.state.enabled = false;
  $('#hud').hidden = true;
  popups.clear(); particles.clear(); resetHud();
  view.clearFloor(); for (const o of view.hunters.values()) view.scene.remove(o.mesh); view.hunters.clear();
  view.mateLights.forEach((l) => { l.visible = false; });
  view.buildFloor(backdrop); view.gun.visible = false;
  show('sMenu');
  if (msg) toast(msg);
}

// ---------- online: host
async function createRoom() {
  const btn = $('#setupGo'); btn.disabled = true;
  try {
    let code = net.makeCode();
    for (let i = 0; i < 4 && (await net.netGet(code, 'meta')); i++) code = net.makeCode();
    await net.netPut(code, 'meta', { host: MY_ID, v: net.PROTOCOL, tower: settings.tower, phase: 'lobby', at: Date.now() });
    await net.netPut(code, 'lobby/' + MY_ID, { n: myName(), h: settings.hunter, rd: 1, t: Date.now() });
    openLobby({ code, host: true });
  } catch (e) { toast('Could not open a room: ' + e.message); }
  btn.disabled = false;
}

// ---------- online: guest
async function joinRoom() {
  const code = $('#codeIn').value.trim().toUpperCase();
  if (code.length !== 4) { $('#joinErr').textContent = 'Type the 4-letter code.'; return; }
  $('#joinGo').disabled = true; $('#joinErr').textContent = 'Joining…';
  try {
    const meta = await net.netGet(code, 'meta');
    if (!meta || meta.phase === 'closed') throw new Error('No open room with the code ' + code + '.');
    if (meta.v !== net.PROTOCOL) throw new Error('That room runs a different version. Reload the page.');
    const lobby = (await net.netGet(code, 'lobby')) || {};
    const taken = new Set(Object.values(lobby).map((p) => p.h));
    let h = settings.hunter; if (taken.has(h)) h = HUNTERS.findIndex((_, i) => !taken.has(i));
    if (h < 0) throw new Error('The room is full (6 hunters).');
    await net.netPut(code, 'lobby/' + MY_ID, { n: myName(), h, rd: 0, t: Date.now() });
    $('#joinErr').textContent = '';
    openLobby({ code, host: false, meta });
  } catch (e) { $('#joinErr').textContent = e.message; }
  $('#joinGo').disabled = false;
}

// ---------- lobby (both)
let L = null;
function openLobby({ code, host, meta }) {
  L = { code, host, lobby: {}, friends: [], ready: host, myH: settings.hunter, tower: meta ? meta.tower : settings.tower, stop: [], beat: 0 };
  $('#lobbyCode').textContent = code; $('#lobbyCode2').textContent = code;
  $('#startBtn').hidden = !host; $('#readyBtn').hidden = host;
  $('#addFriend').hidden = !(host && myName() === 'chumiboy');
  $('#lobbyNote').textContent = host ? 'Friends open this game, tap Join a room and type the code.' : 'Waiting for the host to start. Tap Ready when you are set.';
  $('#lobbyTower').textContent = `Tower: ${L.tower} floors.`;
  show('sLobby');
  L.stop.push(net.listen(code, 'lobby', (m) => { if (!L) return; L.lobby = m || {}; if (L.lobby[MY_ID]) L.myH = L.lobby[MY_ID].h; renderLobby(); }));
  if (!host) L.stop.push(net.listen(code, 'meta', (m) => {
    if (!L) return;
    if (!m || m.phase === 'closed') { closeLobby(); show('sMenu'); toast('The host closed the room.'); return; }
    if (m.phase === 'play' && m.seed) { const c = L.code; closeLobby(true); startGuest(c); }
  }));
  L.beat = setInterval(() => { if (L) net.netPatch(code, 'lobby/' + MY_ID, { t: Date.now() }).catch(() => {}); }, 4000);
  renderLobby();
}
function closeLobby(keep) {
  if (!L) return;
  L.stop.forEach((f) => f()); clearInterval(L.beat);
  if (!keep) { if (L.host) { net.netPatch(L.code, 'meta', { phase: 'closed' }).catch(() => {}); setTimeout(() => net.netDelete(L.code).catch(() => {}), 3000); } else net.netDelete(L.code, 'lobby/' + MY_ID).catch(() => {}); }
  L = null;
}
const freshLobby = () => Object.entries(L.lobby).filter(([, p]) => p && Date.now() - (p.t || 0) < 20000);
function renderLobby() {
  if (!L) return;
  const rows = freshLobby().map(([pid, p]) => ({ pid, name: p.n, h: p.h, rd: p.rd, me: pid === MY_ID, host: pid === (L.host ? MY_ID : null) }));
  for (const f of L.friends) rows.push({ pid: f.pid, name: f.name, h: f.h, rd: 1, friend: true });
  $('#lobbyCount').textContent = `(${rows.length}/6)`;
  $('#lobbyList').innerHTML = rows.map((r) => `<div class="lrow" style="--c:${HUNTERS[r.h]?.css || '#888'}"><span class="dot"></span><span class="nm">${esc(r.name)}${r.me ? ' (you)' : ''}<br><span class="tag">${HUNTERS[r.h]?.name || ''} · ${HUNTERS[r.h]?.abilityName || ''}${r.friend ? ' · computer friend' : ''}</span></span><span class="rd ${r.rd ? 'on' : ''}">${r.rd ? 'Ready' : 'Not ready'}</span></div>`).join('');
  const taken = new Set(rows.filter((r) => !r.me).map((r) => r.h));
  renderHunters($('#lobbyHunters'), { selected: L.myH, taken, compact: true, onPick: (i) => {
    L.myH = i; settings.hunter = i; saveSettings(); sfx.click();
    net.netPatch(L.code, 'lobby/' + MY_ID, { h: i }).catch(() => {});
    renderLobby();
  } });
  $('#readyBtn').classList.toggle('on', !!L.ready);
  $('#readyBtn').querySelector('span').textContent = L.ready ? 'Ready!' : 'Ready';
  const guests = rows.filter((r) => !r.me && !r.friend);
  $('#startBtn').disabled = !(guests.every((r) => r.rd));
  $('#addFriend').disabled = rows.length >= 6;
}
$('#readyBtn').onclick = () => { if (!L) return; L.ready = !L.ready; sfx.click(); net.netPatch(L.code, 'lobby/' + MY_ID, { rd: L.ready ? 1 : 0 }).catch(() => {}); renderLobby(); };
$('#lobbyLeave').onclick = () => { closeLobby(); show('sMenu'); };
$('#copyCode').onclick = () => { try { navigator.clipboard.writeText(L.code); toast('Code copied'); } catch (e) { toast('Code: ' + L.code); } };
$('#addFriend').onclick = () => {
  if (!L || myName() !== 'chumiboy') return;
  const used = new Set([...freshLobby().map(([, p]) => p.h), ...L.friends.map((f) => f.h)]);
  const h = HUNTERS.findIndex((_, i) => !used.has(i)); if (h < 0) return;
  L.friends.push({ pid: 'friend' + (L.friends.length + 1), name: 'Friend ' + (L.friends.length + 1), h });
  sfx.click(); renderLobby();
};
$('#startBtn').onclick = async () => {
  if (!L || !L.host) return;
  sfx.click();
  const used = new Set();
  const roster = [];
  const entries = freshLobby().sort(([a], [b]) => (a === MY_ID ? -1 : b === MY_ID ? 1 : 0));
  for (const [pid, p] of entries) {
    let h = p.h; if (used.has(h)) h = HUNTERS.findIndex((_, i) => !used.has(i));
    used.add(h); roster.push({ pid, name: p.n || 'Hunter', h, ctrl: pid === MY_ID ? 'local' : 'remote' });
  }
  for (const f of L.friends) { let h = f.h; if (used.has(h)) h = HUNTERS.findIndex((_, i) => !used.has(i)); used.add(h); roster.push({ pid: f.pid, name: f.name, h, ctrl: 'bot' }); }
  const seed = (Math.random() * 1e9) | 0, code = L.code, tower = L.tower;
  closeLobby(true);
  const sim = new Sim({ runSeed: seed, tower, roster });
  const sess = newSession('host', { sim, code, sender: net.makeSender(code, 's'), lastSeen: new Map() });
  sess.sender.send(sim.snapshot());
  await net.netPatch(code, 'meta', { phase: 'play', seed }).catch(() => {});
  sess.stopFns.push(net.listen(code, 'p', (m) => {
    if (!S || S !== sess || !m) return;
    for (const [pid, inp] of Object.entries(m)) {
      if (pid === MY_ID || !inp) continue;
      if (!sess.sim.hunters.has(pid)) continue;
      if (inp._seen !== inp.t) { inp._seen = inp.t; sess.lastSeen.set(pid, performance.now()); }
      sess.sim.setInput(pid, inp);
    }
  }));
  sess.stopFns.push(net.listen(code, 'lobby', (m) => { // late joiners and leavers
    if (!S || S !== sess) return;
    const lob = m || {};
    for (const [pid, p] of Object.entries(lob)) {
      if (pid === MY_ID || !p || sess.sim.hunters.has(pid) || Date.now() - (p.t || 0) > 20000) continue;
      const usedH = new Set([...sess.sim.hunters.values()].map((h) => h.h));
      if (usedH.size >= 6) continue;
      let h = p.h; if (usedH.has(h)) h = HUNTERS.findIndex((_, i) => !usedH.has(i));
      sess.sim.addHunter({ pid, name: p.n || 'Hunter', h, ctrl: 'remote' });
      sess.lastSeen.set(pid, performance.now());
      toast(`${p.n || 'A hunter'} joined!`);
    }
    for (const h of [...sess.sim.hunters.values()]) if (h.ctrl === 'remote' && !lob[h.pid]) sess.sim.removeHunter(h.pid);
  }));
  const beat = setInterval(() => net.netPatch(code, 'lobby/' + MY_ID, { t: Date.now() }).catch(() => {}), 4000);
  sess.stopFns.push(() => clearInterval(beat));
  beginGame(sess);
};

function startGuest(code) {
  const sess = newSession('guest', { code, sender: net.makeSender(code, 'p/' + MY_ID) });
  sess.stopFns.push(net.listen(code, 's', (s) => {
    if (!S || S !== sess || !s || !s.h) return;
    sess.buf.push({ at: performance.now(), s }); if (sess.buf.length > 12) sess.buf.shift();
    sess.lastSnapAt = performance.now();
  }));
  sess.stopFns.push(net.listen(code, 'meta', (m) => { if (S === sess && (!m || m.phase === 'closed')) leaveGame('The host ended the game.'); }));
  const beat = setInterval(() => net.netPatch(code, 'lobby/' + MY_ID, { t: Date.now() }).catch(() => {}), 4000);
  sess.stopFns.push(() => clearInterval(beat));
  beginGame(sess);
}

// guests draw the world ~120 ms in the past, blending the two snapshots around that moment
function interpSnap(sess) {
  const buf = sess.buf; if (!buf.length) return null;
  const newest = buf[buf.length - 1].s;
  const at = performance.now() - 120;
  let a = buf[0], b = buf[buf.length - 1];
  for (let i = 0; i < buf.length - 1; i++) if (buf[i].at <= at && buf[i + 1].at >= at) { a = buf[i]; b = buf[i + 1]; break; }
  if (a === b || a.s.n !== b.s.n || b.s.n !== newest.n) return newest;
  const t = Math.max(0, Math.min(1, (at - a.at) / Math.max(1, b.at - a.at)));
  const lerp = (x, y) => x + (y - x) * t;
  const lerpAng = (x, y) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * t;
  const am = new Map(a.s.g.map((g) => [g[0], g]));
  const g = b.s.g.map((gb) => { const ga = am.get(gb[0]); if (!ga) return gb; const o = gb.slice(); o[2] = lerp(ga[2], gb[2]); o[3] = lerp(ga[3], gb[3]); o[4] = lerp(ga[4], gb[4]); o[5] = lerpAng(ga[5], gb[5]); return o; });
  const lm = new Map(a.s.l.map((l) => [l[0], l]));
  const l = (b.s.l || []).map((lb) => { const la = lm.get(lb[0]); if (!la) return lb; const o = lb.slice(); o[1] = lerp(la[1], lb[1]); o[2] = lerp(la[2], lb[2]); o[3] = lerp(la[3], lb[3]); o[4] = lerpAng(la[4], lb[4]); return o; });
  const h = {};
  for (const [pid, hb] of Object.entries(b.s.h)) {
    const ha = a.s.h[pid]; const o = hb.slice();
    if (ha) { o[10] = lerp(ha[10], hb[10]); o[11] = lerp(ha[11], hb[11]); o[12] = lerp(ha[12], hb[12]); o[13] = lerpAng(ha[13], hb[13]); o[14] = lerp(ha[14], hb[14]); }
    if (newest.h[pid]) for (const k of [3, 4, 5, 6, 7, 8, 16]) o[k] = newest.h[pid][k];
    h[pid] = o;
  }
  return { ...newest, g, l, h, gu: b.s.gu || [] };
}

// what this player sends: position, look and button state
function myInput() {
  return { x: r2(player.x), y: r2(player.y), z: r2(player.z), yw: r3(player.yaw), pt: r3(player.pitch), s: S.suckOn ? 1 : 0, g: S.want,
    ab: S.abSeq, bs: S.buySeq, bi: S.buyItem, rd: S.readyFor, t: Date.now() };
}

// ---------- floor changes
function enterFloor(snap) {
  if (S.seed !== undefined && S.seed !== snap.seed) S.lastEid = 0; // the host started a new run: event ids restart
  S.seed = snap.seed;
  S.floorKey = snap.n + ':' + snap.seed;
  S.floor = S.sim ? S.sim.floor : buildFloor({ runSeed: snap.seed, n: snap.n, type: snap.ty, extraTime: snap.up.clock || 0, players: snap.np });
  view.buildFloor(S.floor); view.elevFlow = null;
  const mine = snap.h[MY_ID];
  const sp = S.floor.spawns[(mine ? mine[HI.slot] : 0) % 6];
  player.reset(sp.x, sp.z, sp.yaw);
  view.setGun(HUNTERS[mine ? mine[HI.h] : settings.hunter].color); view.gun.visible = true;
  S.want = -1; S.revealShown = false; S.hint = null; $('#hint').hidden = true;
  popups.clear(); particles.clear(); resetHud();
  const ft = FLOOR_TYPES[snap.ty];
  banner(`Floor ${snap.n} · ${ft.name}`, `${ft.goal} · Quota $${S.floor.quota}`);
  sfx.ding();
}

let bannerT = 0;
function banner(title, sub, ms = 3200) {
  const b = $('#banner'); b.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`; b.hidden = false;
  clearTimeout(bannerT); bannerT = setTimeout(() => { b.hidden = true; }, ms);
}

// ---------- first-run hints, one at a time
function hint(key, text, persist = true) {
  if (hintsDone[key] || S.hint === key) return;
  S.hint = key; S.hintT = 9; S.hintPersist = persist;
  const h = $('#hint'); h.textContent = text; h.hidden = false;
}
function hintDone(key) {
  if (S && S.hint === key) { S.hint = null; $('#hint').hidden = true; }
  if (!hintsDone[key]) { hintsDone[key] = 1; try { localStorage.setItem(HKEY, JSON.stringify(hintsDone)); } catch (e) { /* ignore */ } }
}

// ---------- events from the host's game: sounds, particles, popups
function nearMe(x, z, d = 18) { return Math.hypot(x - player.x, z - player.z) < d; }
function ghostPos(gid) { const o = view.ghosts.get(gid); return o ? o.mesh.position : null; }
function nameOf(pid) { const h = S.snap && S.snap.h[pid]; return h ? h[HI.name] : 'A hunter'; }
function onEvent(e) {
  const mine = e.pid === MY_ID || (e.by && (Array.isArray(e.by) ? e.by.includes(MY_ID) : e.by === MY_ID));
  switch (e.k) {
    case 'stun': { const p = ghostPos(e.gid); if (p) { particles.burst(p.x, p.y + 0.3, p.z, 0xfff27a, 12, 2.5, 0.18, 0.5, 0); if (nearMe(p.x, p.z)) sfx.stun(); } if (mine) { hintDone('light'); hint('suck', 'Dizzy! Now HOLD Suck while aiming at it'); } break; }
    case 'cap': {
      particles.burst(e.x, e.y, e.z, GHOSTS[e.kind].color, 30, 4, 0.25, 0.8, 0); particles.burst(e.x, e.y, e.z, 0xffd34d, 12, 3, 0.15, 0.9, 6);
      popups.add(`+$${e.v}`, e.x, e.y + 0.4, e.z, e.kind === 'boss' ? 'big' : '');
      if (nearMe(e.x, e.z, 25)) { sfx.capture(); setTimeout(sfx.coin, 180); }
      if (mine) { shake.add(0.3); shake.hitStop(0.07); S.tankGlow = 1; hintDone('suck'); hint('grab', 'Aim at loot and tap GRAB. Carry it into the elevator.'); }
      break; }
    case 'need': if (mine) { const p = ghostPos(e.gid); if (p) popups.add(`Need ${e.n} hunters!`, p.x, p.y + 0.6, p.z, 'bad', 1.4); } break;
    case 'free': { const p = ghostPos(e.gid); if (p) { popups.add('Broke free!', p.x, p.y + 0.5, p.z, 'bad'); if (nearMe(p.x, p.z)) sfx.boo(); } break; }
    case 'wind': { const p = ghostPos(e.gid); if (p && nearMe(p.x, p.z, 8)) sfx.boo(); break; }
    case 'hit':
      if (e.pid === MY_ID) { player.knock(e.dx, e.dz); shake.add(0.6); shake.hitStop(0.08); flash('red'); sfx.hit(); S.want = -1; }
      else { const o = view.hunters.get(e.pid); if (o && nearMe(o.mesh.position.x, o.mesh.position.z)) sfx.hit(); }
      break;
    case 'down': if (e.pid === MY_ID) sfx.down(); else toast(`${nameOf(e.pid)} is spooked! Stand next to them.`); break;
    case 'rev': if (e.pid === MY_ID) { sfx.revive(); toast('Back on your feet!'); } else if (nearMe(...posOf(e.pid))) sfx.revive(); break;
    case 'ab': {
      const H = HUNTERS[S.snap.h[e.pid]?.[1] ?? 0];
      if (nearMe(e.x, e.z, 22)) sfx.ability();
      if (e.a === 'strobe') { particles.burst(e.x, 1.4, e.z, 0xffffff, 40, 8, 0.3, 0.4, 0); if (nearMe(e.x, e.z, 12)) { flash('white'); sfx.strobe(); } }
      else particles.burst(e.x, 1.2, e.z, H.color, 30, 4, 0.25, 0.7, 0);
      if (e.a === 'lantern') view.showPath(player.x, player.z, 8);
      if (e.pid !== MY_ID) toast(`${nameOf(e.pid)} used ${H.abilityName}`, 1600);
      break; }
    case 'dmg': popups.add(`-$${e.loss}`, e.x, e.y + 0.3, e.z, 'bad'); particles.burst(e.x, e.y, e.z, 0xffffff, 8, 2, 0.1, 0.4, 6); if (nearMe(e.x, e.z)) sfx.crack(); break;
    case 'smash': popups.add(`Smashed! -$${e.loss}`, e.x, e.y + 0.3, e.z, 'bad big', 1.6); particles.burst(e.x, e.y, e.z, 0x9ad0ff, 26, 4, 0.14, 0.9, 9); if (nearMe(e.x, e.z)) { sfx.smash(); shake.add(0.2); } break;
    case 'bump': if (nearMe(e.x, e.z, 10)) sfx.bump(); break;
    case 'in': popups.add(`+$${e.v}`, e.x, e.y + 0.4, e.z, 'mint'); particles.burst(e.x, e.y, e.z, 0xffd34d, 14, 2.5, 0.16, 0.8, 4); sfx.coin(); hintDone('grab'); break;
    case 'quota': sfx.quota(); banner('Quota met!', 'Everyone standing: get in the elevator', 2600); hint('lift', 'Quota met! Everyone into the elevator', false); break;
    case 'depart': sfx.ding(); break;
    case 'freed': popups.add('Guest freed!', e.x, 2.2, e.z, 'mint'); sfx.free(); break;
    case 'saved': popups.add(`+$${e.v} guest safe`, e.x, 1.5, e.z, 'mint'); sfx.coin(); break;
    case 'roar': popups.add(`${e.hp} to go!`, e.x, e.y + 2, e.z, 'bad big'); sfx.roar(); shake.add(0.5); particles.burst(e.x, e.y, e.z, 0xb5ffcf, 40, 6, 0.3, 0.8, 0); break;
    case 'summon': { const p = ghostPos(e.gid); if (p && nearMe(p.x, p.z)) sfx.boo(); break; }
    case 'buy': sfx.buy(); if (e.pid !== MY_ID) toast(`${nameOf(e.pid)} bought ${SHOP.find((s) => s.id === e.item)?.name}`, 1800); break;
    case 'left': toast(`${e.name} left the game`); break;
    case 'lift': sfx.ding(); break;
    case 'win': sfx.win(); break;
    case 'lose': sfx.lose(); break;
    default: break;
  }
}
function posOf(pid) { const h = S.snap && S.snap.h[pid]; return h ? [h[HI.x], h[HI.z]] : [1e9, 1e9]; }
let flashT = 0;
function flash(kind) {
  const f = $('#flashOverlay'); f.className = kind === 'red' ? 'red' : '';
  f.style.transition = 'none'; f.style.opacity = kind === 'red' ? '1' : '0.85';
  clearTimeout(flashT); flashT = setTimeout(() => { f.style.transition = 'opacity .45s'; f.style.opacity = '0'; }, 40);
}

// ---------- what am I aiming at?
function findAim(snap) {
  const eye = { x: player.x, y: player.y + T.eye, z: player.z }, a = aimVector(player.yaw, player.pitch);
  let best = null, bestScore = 1e9;
  for (const l of snap.l) {
    const [id, x, y, z, , value, holders, inZone] = l;
    const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, d = Math.hypot(dx, dy, dz);
    if (d > T.grabRange + 0.6 || d < 0.05) continue;
    const ang = Math.acos(Math.min(1, (dx * a.x + dy * a.y + dz * a.z) / d));
    const kind = S.floor.loot[id]?.kind || 'vase';
    if (ang < 0.32 + Math.atan2(LOOT[kind].r, d) && ang * 3 + d * 0.2 < bestScore) { bestScore = ang * 3 + d * 0.2; best = { type: 'loot', id, kind, value, holders, inZone }; }
  }
  if (best) return best;
  for (const g of snap.g) {
    const [id, ki, x, y, z, , st] = g, kind = GHOST_KINDS[ki];
    const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, d = Math.hypot(dx, dy, dz);
    if (d > T.lightRange + 2) continue;
    const ang = Math.acos(Math.min(1, (dx * a.x + dy * a.y + dz * a.z) / d));
    if (ang < T.lightCone + Math.atan2(GHOSTS[kind].size * 0.5, d) && ang + d * 0.05 < bestScore) { bestScore = ang + d * 0.05; best = { type: 'ghost', id, kind, stunned: !!(st & 1) }; }
  }
  return best;
}

// ---------- main loop
let last = performance.now(), simAcc = 0, titleT = 0;
const nozzle = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.25, (now - last) / 1000); last = now; // the game clock keeps real time on slow devices
  const rawDt = Math.min(0.05, realDt);
  const sh = shake.update(rawDt, settings.shake);
  const dt = rawDt * sh.scale;
  if (!S) { titleCam(rawDt); view.render(); return; }

  // 1. advance the authoritative game (solo / host)
  if (S.sim && !S.paused) {
    simAcc += realDt;
    while (simAcc >= 1 / 30) { S.sim.setInput(MY_ID, myInput()); S.sim.step(1 / 30); simAcc -= 1 / 30; }
    if (S.role === 'host') {
      S.sendT -= rawDt;
      if (S.sendT <= 0) { S.sendT = 0.1; S.sender.send(S.sim.snapshot()); }
      for (const [pid, t] of S.lastSeen) if (now - t > 20000 && S.sim.hunters.has(pid)) { S.sim.removeHunter(pid); S.lastSeen.delete(pid); }
    }
  }
  const snap = S.sim ? S.sim.snapshot() : interpSnap(S);
  if (!snap) { waitingScreen(now); view.render(); return; }
  if (S.role === 'guest' && now - S.lastSnapAt > 15000) { leaveGame('Lost the connection to the host.'); return; }
  S.snap = snap;
  if (S.floorKey !== snap.n + ':' + snap.seed) { if (S.result) { S.result = null; } enterFloor(snap); }

  // 2. events
  if (!S.eidPrimed) { S.eidPrimed = true; S.lastEid = S.role === 'guest' && snap.e.length ? snap.e[snap.e.length - 1].id : 0; }
  for (const e of snap.e) if (e.id > S.lastEid) { S.lastEid = e.id; onEvent(e); }

  // 3. phase screens
  phaseScreens(snap);
  const mine = snap.h[MY_ID];
  if (!mine) { view.render(); return; }
  const [, hi, , , down, cd, , , hold] = mine;
  const playing = snap.ph === 'play' && !current();

  // 4. local player
  const inp = playing && input.state.enabled ? input.sample() : (input.sample(), { mx: 0, my: 0, lookDx: 0, lookDy: 0, suck: false });
  if (playing) {
    if (inp.grab && !down) {
      if (S.want >= 0) { S.want = -1; sfx.click(); }
      else if (S.aim && S.aim.type === 'loot') { S.want = S.aim.id; S.wantT = 1.5; sfx.click(); }
      else toast('Aim at loot to grab it', 1200);
    }
    if (S.want >= 0) { if (hold === S.want) S.wantT = 1.5; else { S.wantT -= rawDt; if (S.wantT <= 0) S.want = -1; } }
    if (inp.skill) {
      if (down) toast('Spooked hunters cannot use skills', 1200);
      else if (cd > 0) toast(`${HUNTERS[hi].abilityName} recharging: ${Math.ceil(cd)}s`, 1200);
      else { S.abSeq++; if (HUNTERS[hi].ability === 'dash') player.dash(); sfx.ability(); }
    }
    if (inp.guide) { view.showPath(player.x, player.z, 8); sfx.click(); }
    if (inp.jump && player.onGround && !down) sfx.jump();
  }
  S.suckOn = playing && inp.suck && !down && S.want < 0;
  let carry = 1;
  if (hold >= 0) { const it = snap.l.find((l) => l[0] === hold); const w = LOOT[S.floor.loot[hold]?.kind]?.weight || 1; carry = w >= 3 ? (it && it[6] >= 2 ? 0.7 : 0.4) : w > 1 ? 0.8 : 0.95; }
  const mul = 1 + 0.1 * (snap.up.shoes || 0);
  if (snap.ph === 'play') player.update(dt, inp, S.floor, { speedMul: mul, down: !!down, carry, jump: inp.jump });
  if (S.role === 'guest') { S.sendT -= rawDt; if (S.sendT <= 0) { S.sendT = 1 / 12; S.sender.send(myInput()); } }

  // 5. camera, gun, flashlight
  const cam = view.camera;
  const bob = settings.bob && player.onGround ? Math.sin(player.bob) * 0.045 * Math.min(1, player.moving) : 0;
  cam.position.set(player.x + sh.x, player.y + (down ? 0.45 : T.eye) + bob + sh.y, player.z);
  cam.rotation.set(player.pitch, player.yaw, sh.roll + (down ? 0.25 : 0));
  if (cam.fov !== settings.fov) { cam.fov = settings.fov; cam.updateProjectionMatrix(); }
  const g = view.gun;
  g.visible = !down && snap.ph === 'play';
  const sway = Math.sin(player.bob * 0.5) * 0.012 * Math.min(1, player.moving);
  const jit = S.suckOn ? 0.008 : 0;
  g.position.set(0.26 + sway + (Math.random() - 0.5) * jit, -0.25 + Math.abs(sway) * 0.6 + (Math.random() - 0.5) * jit, -0.55 + (S.suckOn ? 0.02 : 0));
  g.rotation.set(inp.lookDy * 0.6, inp.lookDx * 0.6, 0);
  S.tankGlow = Math.max(0, (S.tankGlow || 0) - rawDt * 1.5);
  g.userData.tank.material.emissiveIntensity = 0.6 + S.tankGlow * 3 + (S.suckOn ? 0.4 : 0);
  view.flash.visible = !down;
  view.flash.intensity = 15 * (1 + (snap.up.beam || 0) * 0.15);
  g.userData.noz.getWorldPosition(nozzle);

  // 6. world + effects
  const aim = playing ? findAim(snap) : null; S.aim = aim;
  let heldPred = null;
  if (hold >= 0) {
    const it = snap.l.find((l) => l[0] === hold), kind = S.floor.loot[hold]?.kind;
    if (it && kind && LOOT[kind].weight < 3 && it[6] === 1) {
      const a = aimVector(player.yaw, Math.max(-0.7, Math.min(0.6, player.pitch)));
      heldPred = { id: hold, x: player.x + a.x * T.holdDist, y: Math.max(LOOT[kind].r, player.y + T.eye - 0.25 + a.y * T.holdDist), z: player.z + a.z * T.holdDist };
    }
  }
  view.sync(snap, MY_ID, dt, now / 1000, { heldPred, quota: S.floor.quota });
  suckFx(snap, dt);
  view.updatePath(rawDt);
  if (snap.rv > 0 && !S.revealShown) { S.revealShown = true; view.showPath(player.x, player.z, 8); }
  if (snap.rv <= 0) S.revealShown = false;
  particles.update(dt);
  popups.update(rawDt, view.w, view.h);
  setHum(S.suckOn, Math.min(1, snap.g.filter((x) => x[6] & 2).length ? 1 : 0.3));

  // 7. HUD
  updateTopBar(snap, S.floor, MY_ID);
  updateAim(aim ? { type: aim.type, html: aimText(aim, hold) } : null);
  updateLabels(view, snap, MY_ID, S.floor, view.w, view.h);
  $('#bGrab').classList.toggle('holding', hold >= 0 || S.want >= 0);
  $('#grabText').textContent = hold >= 0 || S.want >= 0 ? 'Drop' : 'Grab';
  $('#depart').hidden = !(snap.dep > 0 && snap.ph === 'play');
  if (snap.dep > 0) $('#depart').textContent = `Going up in ${Math.max(1, Math.ceil(3 - snap.dep))}…`;
  if (playing) hintsTick(snap, rawDt);
  view.render();
}

function titleCam(dt) {
  titleT += dt * 0.08;
  const f = backdrop, cx = f.worldW / 2, cz = f.worldD / 2;
  view.camera.position.set(cx + Math.cos(titleT) * 5, 1.7, cz + Math.sin(titleT) * 5);
  view.camera.rotation.set(-0.08, -titleT + Math.PI / 2 + Math.PI, 0);
}
function waitingScreen() { if (!$('#sLift').hidden) return; show('sLift'); $('#liftTitle').textContent = 'Connecting…'; $('#liftText').textContent = 'Waiting for the host’s hotel.'; }

// vacuum particles: dust flies into my nozzle, ghosts stream in while being sucked
function suckFx(snap, dt) {
  if (S.suckOn) {
    const a = aimVector(player.yaw, player.pitch), cam = view.camera.position;
    for (let i = 0; i < 3; i++) {
      const d = 1.5 + Math.random() * 4, s = d * 0.35;
      particles.stream(cam.x + a.x * d + (Math.random() - 0.5) * s, cam.y + a.y * d + (Math.random() - 0.5) * s, cam.z + a.z * d + (Math.random() - 0.5) * s, nozzle, 0xd8f7ff, 0.07);
    }
  }
  for (const gs of snap.g) {
    if (!(gs[6] & 2)) continue;
    const o = view.ghosts.get(gs[0]); if (!o) continue;
    const p = o.mesh.position, col = GHOSTS[GHOST_KINDS[gs[1]]].color;
    if (S.suckOn && Math.hypot(p.x - player.x, p.z - player.z) < T.suckRange + 1) for (let i = 0; i < 2; i++) particles.stream(p.x + (Math.random() - 0.5) * 0.5, p.y + (Math.random() - 0.5) * 0.5, p.z + (Math.random() - 0.5) * 0.5, nozzle, col, 0.16);
  }
  for (const o of view.hunters.values()) {
    if (!o.suck || Math.random() > 0.5) continue;
    const m = o.mesh, f = -Math.sin(m.rotation.y), fz = -Math.cos(m.rotation.y);
    const tgt = { x: m.position.x + f * 0.75, y: m.position.y + 0.95, z: m.position.z + fz * 0.75 };
    const d = 1.5 + Math.random() * 3;
    particles.stream(tgt.x + f * d + (Math.random() - 0.5), tgt.y + (Math.random() - 0.5), tgt.z + fz * d + (Math.random() - 0.5), tgt, 0xd8f7ff, 0.07);
  }
}

function hintsTick(snap, dt) {
  if (!$('#banner').hidden) return; // one message at a time
  if (S.hint) { S.hintT -= dt; if (S.hintT <= 0) { if (S.hintPersist) hintDone(S.hint); else { S.hint = null; } $('#hint').hidden = true; } return; }
  const ghostNear = snap.g.some((g) => Math.hypot(g[2] - player.x, g[4] - player.z) < 10 && lineClear(S.floor, player.x, player.z, g[2], g[4]));
  if (ghostNear) hint('light', 'Ghost! Keep your flashlight on it until it gets dizzy');
  else if (performance.now() - S.startedAt > 25000) hint('grab', 'Aim at loot and tap GRAB. Carry it into the elevator.');
}

// ---------- lift, shop and result screens
function phaseScreens(snap) {
  const ph = snap.ph;
  if (ph === S.phase && ph !== 'shop') return;
  const prev = S.phase; S.phase = ph;
  if (ph === 'play') {
    if (['sLift', 'sShop', 'sResult'].includes(current())) { show(null); input.state.enabled = true; }
    return;
  }
  input.unlock(); setHum(false);
  if (ph === 'lift') {
    const lf = snap.lf;
    show('sLift');
    $('#liftTitle').textContent = `Floor ${lf ? lf.n : snap.n} cleared!`;
    $('#liftText').textContent = lf ? `You brought $${lf.collected} (quota $${lf.quota}). Bank: $${snap.gold}. Going up…` : 'Going up…';
  } else if (ph === 'shop') {
    if (prev !== 'shop') { S.readyFor = 0; show('sShop'); S.shopBusyUntil = 0; }
    renderShopScreen(snap);
  } else if (ph === 'win' || ph === 'lose') showResult(snap);
}

let shopKey = '';
function renderShopScreen(snap) {
  const busy = performance.now() < (S.shopBusyUntil || 0);
  const key = JSON.stringify([snap.gold, snap.up, busy, S.readyFor, snap.shopT, Object.values(snap.h).map((h) => h[HI.ready])]);
  if (key === shopKey) return; shopKey = key;
  $('#shopBank').textContent = '$' + snap.gold;
  $('#shopNote').textContent = `Next: floor ${snap.n + 1} of ${snap.tot}. Upgrades help the whole team. Anyone can buy with the shared bank.`;
  renderShop($('#shopItems'), { gold: snap.gold, up: snap.up, busy, onBuy: (id) => { S.buySeq++; S.buyItem = id; S.shopBusyUntil = performance.now() + 400; sfx.click(); setTimeout(() => { shopKey = ''; }, 420); } });
  const humans = Object.values(snap.h).filter((h) => !h[HI.bot]);
  const ready = humans.filter((h) => h[HI.ready] === snap.n + 1).length;
  $('#shopTimer').textContent = `Doors close in ${snap.shopT}s · ${ready}/${humans.length} ready`;
  $('#shopReadyText').textContent = S.readyFor === snap.n + 1 ? 'Waiting for friends…' : 'Next floor';
  $('#shopReady').disabled = S.readyFor === snap.n + 1;
}
$('#shopReady').onclick = () => { if (!S || !S.snap) return; S.readyFor = S.snap.n + 1; sfx.click(); shopKey = ''; };

const LOSE_TEXT = { quota: 'The clock ran out before the quota was met.', down: 'Every hunter got spooked.', boss: 'The Night Manager was still loose when time ran out.' };
function showResult(snap) {
  const r = snap.res; if (!r) return;
  S.result = r;
  show('sResult');
  $('#resTitle').textContent = r.win ? 'You topped the Spire!' : `Run over on floor ${r.n}`;
  $('#resText').textContent = r.win ? `All ${snap.tot} floors cleared with $${r.gold} in the bank.` : `${LOSE_TEXT[r.reason] || ''} Bank: $${r.gold}.`;
  $('#resTable').innerHTML = '<tr><th>Hunter</th><th>Ghosts</th><th>Hauled</th><th>Broke</th><th>Saves</th></tr>' +
    r.stats.map((s) => `<tr><td><span class="dot" style="--c:${HUNTERS[s.h].css}"></span>${esc(s.name)}</td><td>${s.caught}</td><td>$${Math.max(0, s.hauled)}</td><td>$${s.broken}</td><td>${s.saves}</td></tr>`).join('');
  $('#resAgain').hidden = S.role === 'guest';
  $('#resText').textContent += S.role === 'guest' ? ' The host can start another run.' : '';
}
$('#resMenu').onclick = () => leaveGame();
$('#resAgain').onclick = () => {
  if (!S || !S.sim) return;
  sfx.click();
  const roster = [...S.sim.hunters.values()].map((h) => ({ pid: h.pid, name: h.name, h: h.h, ctrl: h.ctrl }));
  const seed = (Math.random() * 1e9) | 0;
  S.sim = new Sim({ runSeed: seed, tower: S.sim.tower, roster });
  S.floorKey = ''; S.lastEid = -1; S.eidPrimed = false; S.phase = 'play'; S.readyFor = 0; S.abSeq = 0; S.buySeq = 0; S.startedAt = performance.now();
  if (S.role === 'host') net.netPatch(S.code, 'meta', { seed }).catch(() => {});
  show(null); input.state.enabled = true;
};

document.getElementById('loading').remove();
show('sMenu');
requestAnimationFrame(frame);

// test hooks, only with ?qa=1 in the address
if (QA) {
  window.__ss = {
    state: () => S && S.snap && { role: S.role, ph: S.snap.ph, n: S.snap.n, col: S.snap.col, quota: S.floor && S.floor.quota, me: MY_ID, x: player.x, z: player.z, hold: S.snap.h[MY_ID]?.[8], ghosts: S.snap.g.length, loot: S.snap.l.length, players: Object.keys(S.snap.h).length, gold: S.snap.gold, code: S.code },
    lobbyCode: () => L && L.code,
    toElevator: () => { const e = S.floor.elevator; player.x = e.x; player.z = e.z; },
    look: (yaw, pitch) => { player.yaw = yaw; player.pitch = pitch; },
    haul: () => { if (!S.sim) return false; const e = S.sim.floor.elevator; S.sim.loot.forEach((l, i) => { if (!l.gone && !l.inZone) { l.x = e.x - 1 + (i % 3); l.z = e.z - 0.5 + ((i / 3) | 0) % 2; l.y = 0.5; l.vx = l.vy = l.vz = 0; } }); return true; },
    faceNearest: (kind) => { const list = kind === 'loot' ? S.snap.l.map((l) => [l[1], l[2], l[3]]) : S.snap.g.map((g) => [g[2], g[3], g[4]]); if (!list.length) return false; list.sort((a, b) => Math.hypot(a[0] - player.x, a[2] - player.z) - Math.hypot(b[0] - player.x, b[2] - player.z)); const [x, y, z] = list[0]; const dx = x - player.x, dz = z - player.z; player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.atan2(y - (player.y + T.eye), Math.hypot(dx, dz)); return Math.hypot(dx, dz); },
    walkTo: (x, z) => { player.x = x; player.z = z; },
    pathTo: (x, z) => { const ff = flowField(S.floor, x, z), pts = []; let px = player.x, pz = player.z; for (let i = 0; i < 800; i++) { const d = flowDir(S.floor, ff, px, pz); if (!d || d.at) break; px += d.x * 0.25; pz += d.z * 0.25; if (i % 4 === 3) pts.push([px, pz]); } return pts; },
    pos: () => ({ x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch }),
    elevator: () => S.floor.elevator,
    sim: () => S && S.sim,
  };
}
