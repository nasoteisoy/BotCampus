// 👥 Team demo: the whole saved team (one player's roster) fights waves of training dummies on its own.
// Each unit plays its Conquest trait (TRAIT_FX): 🏃 rusher charges, 🧱 cover fighter hugs cover, 🎯 sniper nest hangs back,
// 🔁 retaker takes the enemy flag, ➕ supplier heals friends, 💣 mine layer plants mines, 🛡️ guard holds our flag.
import { Arena, ENEMY_NAT, DEMO, SCALE, OUT_T, stateOf } from './arena.js?v=8';
import { loadArmyData, S } from './army-data.js?v=8';
import { $, h, params, drawFlag, backLink, playControls, markCam, toast } from './arena-ui.js?v=8';

const data = loadArmyData();
const players = data.players.filter((p) => data.entries.some((e) => e.playerId === p.id && e.roster));
let pid = params.get('player') && players.some((p) => p.id === params.get('player')) ? params.get('player') : (players.find((p) => p.id === data.activePlayerId) || players[0] || data.players[0]).id;
const arena = new Arena($('#app'), { size: [26, 32], seed: +params.get('seed') || 0 });
const covers = [['sandbags', -4.5, -7.5, 0], ['crate', 4.5, -8, 0], ['wall', 0, -3.5, 0], ['barrels', -7.5, -1, 0], ['crate', 7.2, -1.5, 0], ['sandbags', -3.5, 2.5, 0], ['sandbags', 3.8, 3, 0],
  ['crate', -8, 6, 0], ['wall', 0, 7, 0], ['barrels', 7.5, 6.5, 0], ['sandbags', -4.5, 10.5, 0], ['crate', 4.5, 11, 0]];
for (const c of covers) arena.addCover(...c);
arena.addPickup('health', -10, -9); arena.addPickup('health', 10, 1); arena.addPickup('ammo', 10, -9); arena.addPickup('weapon', -10, 2, { weapon: 1 });
let team = [], foes = [], wave = 0, waveT = 0, wins = 0, ownFlag = null, enemyFlag = null;
const teamEntries = () => data.entries.filter((e) => e.playerId === pid && e.roster);
function build() {
  arena.reset(); for (const f of arena.flags) arena.scene.remove(f.mesh); arena.flags = [];
  const es = teamEntries(), nat = (es[0] && es[0].nat) || { ...ENEMY_NAT };
  ownFlag = arena.addFlag(0, -14, nat, 'A'); enemyFlag = arena.addFlag(0, 14, ENEMY_NAT, 'B');
  team = es.map((e, i) => { const n = es.length, x = (i - (n - 1) / 2) * 1.6;
    return arena.addUnit({ id: e.id, name: e.name, icon: e.icon, kind: e.kind, team: 'A', st: e.st, nat: e.nat, x, z: e.kind === 'tank' ? -13 : -11.5, yaw: 0, trait: e.kind === 'tank' ? null : e.trait || S.CLASS_TRAIT[e.cls], entry: e }); });
  wave = 0; wins = 0; nextWave();
  arena.follow = team[0]; arena.setCam(arena.cam, team[0]); markCam(arena);
  renderWho(); renderUnits();
  const u = new URL(location.href); u.searchParams.set('player', pid); history.replaceState(null, '', u);
}
function nextWave() {
  for (const d of foes) { arena.scene.remove(d.rig.root); d.tpl.dispose(); } arena.units = arena.units.filter((u) => !u.enemy);
  wave++; waveT = 0;
  const n = Math.max(2, Math.min(8, team.length + wave - 1)), gear = S.toIndex('trooper', S.BASIC_GEAR.trooper);
  foes = Array.from({ length: n }, (_, i) => { const x = (i - (n - 1) / 2) * (20 / Math.max(1, n)), z = 11.5 + (i % 2) * 1.5;
    return arena.addUnit({ id: 'w' + wave + 'd' + i, name: 'Dummy ' + (i + 1), icon: '🤖', team: 'B', enemy: true, role: i % 2 ? 'advance' : 'hold', st: { ...gear }, nat: ENEMY_NAT, x, z, yaw: Math.PI, aimMul: DEMO.dummyAim }); });
  if (enemyFlag) arena.paintFlag(enemyFlag, ENEMY_NAT);
  for (const u of team) if (u.down != null) arena.respawn(u);
  for (const u of team) { u.win = null; u.mines = 0; }
  toast('🌊 Wave ' + wave + ' · 🤖×' + n);
}
arena.on('tick', (dt) => {
  for (const u of team) if (u.down != null && u.down > Math.max(6, OUT_T.fade + 0.3)) arena.respawn(u);
  if (foes.length && foes.every((d) => d.down != null)) { waveT += dt; if (waveT > 0.01 && waveT - dt <= 0.01) { wins++; toast('🏆 Wave ' + wave + ' cleared'); } if (waveT > 3.5) nextWave(); }
});
arena.on('flag', (u) => toast('🚩 ' + u.name + ' took the flag'));
arena.on('mine', (u) => { if (Math.random() < 0.5) toast('💣 ' + u.name + ' planted a mine'); });
const GEAR_TOAST = { thermal: '🤾 threw a thermal', detpack: '🧨 placed a detpack', 'time-bomb': '⏰ planted a time bomb', turret: '🗼 deployed a turret', 'recon-droid': '🛰️ sent a recon droid', supply: '📦 dropped a supply crate', rally: '📣 rallied the team' };
arena.on('gear', (u, what) => { if (!u.enemy && GEAR_TOAST[what]) toast(u.name + ' ' + GEAR_TOAST[what]); });

function renderWho() {
  const p = data.players.find((x) => x.id === pid) || data.players[0], es = teamEntries(), nat = es[0] ? es[0].nat : { ...ENEMY_NAT, name: p.nation.name, player: p.name };
  drawFlag($('#whoFlag'), nat); $('#whoIco').textContent = '👥'; $('#whoName').textContent = players.length > 1 ? '' : `${p.name} · ${nat.name}`;
  const sm = $('#whoFor'); sm.replaceChildren();
  if (players.length > 1) {
    const sel = h('select', { 'aria-label': 'Player', title: 'Switch player' }, players.map((q) => h('option', { value: q.id, textContent: '👤 ' + q.name + ' · 🏳️ ' + q.nation.name, selected: q.id === pid })));
    sel.addEventListener('change', () => { pid = sel.value; build(); }); sm.append(sel);
  } else sm.textContent = `🪖×${es.length}`;
}
const STATE_ICON = { idle: '🧍', walk: '🚶', run: '🏃', aim: '🎯', cover: '🧱', nest: '🔭', reload: '🔄', plant: '⬇️', down: '💀' };
const WHY_ICON = { heal: '➕', guard: '🛡️', retake: '🚩', health: '❤️', ammo: '📦', weapon: '🔫', retreat: '↩️' };
function renderUnits() {
  const box = $('#units'); box.replaceChildren();
  if (!team.length) box.append(h('div', { className: 'unit', textContent: '🪖 No units yet' }));
  for (const u of team) {
    const b = h('button', { type: 'button', className: 'unit', title: u.name, 'aria-label': u.name, 'data-id': u.id }, [
      h('b', { className: 'stt' }), h('span', { className: 'ico', textContent: u.icon }), h('i', { textContent: u.name }), h('em'),
      h('b', { className: 'tr', textContent: u.trait ? (S.TRAITS.find((t) => t.id === u.trait) || {}).icon : '🚜', title: u.trait ? (S.TRAITS.find((t) => t.id === u.trait) || {}).long : 'Tank' }),
    ]);
    b.addEventListener('click', () => { arena.setCam('follow', u); markCam(arena); refreshUnits(); });
    box.append(b);
  }
  $('#legend').textContent = 'Top-left of a card = what it is doing · top-right = its battle trait · tap a card to follow it';
  refreshUnits();
}
function refreshUnits() {
  for (const b of document.querySelectorAll('#units .unit[data-id]')) {
    const u = team.find((x) => x.id === b.dataset.id); if (!u) continue;
    b.classList.toggle('down', u.down != null); b.classList.toggle('on', arena.cam === 'follow' && arena.follow === u);
    b.querySelector('.stt').textContent = WHY_ICON[u.goalWhy] && u.state !== 'down' ? WHY_ICON[u.goalWhy] : STATE_ICON[u.state] || '🧍';
    b.querySelector('em').textContent = u.down != null ? '💀 out' : '❤️' + Math.round(u.hp) + ' 💥' + u.downs;
  }
  const left = foes.filter((d) => d.down == null).length;
  const hud = `<span title="Wave">🌊 Wave ${wave}</span><span title="Dummies left">🤖 Left ${left}</span><span title="Waves cleared">🏆 Cleared ${wins}</span><span title="Enemy flag">🚩 Enemy flag ${enemyFlag && enemyFlag.owner !== ENEMY_NAT ? '✅ ours' : '❌'}</span>`;
  if ($('#hud').innerHTML !== hud) $('#hud').innerHTML = hud;
}
backLink('👥 Team'); playControls(arena, () => build());
build();
$('#stats').classList.add('hidden');
let acc = 0; arena.on('tick', (dt) => { acc += dt; if (acc > 0.15) { acc = 0; refreshUnits(); } });
window.__team = { arena, units: () => team.map(stateOf), foes: () => foes.map(stateOf), get wave() { return wave; }, get wins() { return wins; }, fast: (s) => { arena.fast(s); refreshUnits(); return { wave, wins, units: team.map(stateOf) }; }, player: (id) => { if (!players.some((p) => p.id === id)) return false; pid = id; build(); return true; }, gear: () => arena.gear.list(), gearUsed: () => ({ ...arena.gear.used }) };
