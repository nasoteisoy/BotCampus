// 🥊 Combat demo: one saved unit fights training dummies on its own.
// It shoots (real damage / range / fire rate), gets shot (real HP + Conquest hit factors), ducks behind specific cover objects,
// and grabs ❤️ health, 📦 ammo and 🔫 weapon packs. Icon HUD only, no bars, no blood (R.U.S.E.-style smoke).
import { Arena, ENEMY_NAT, DEMO, SCALE, stateOf } from './arena.js?v=7';
import { loadArmyData, pickEntry, S } from './army-data.js?v=7';
import { $, h, params, drawFlag, backLink, playControls, markCam, toast } from './arena-ui.js?v=7';

const data = loadArmyData();
let cur = pickEntry(data, params);
const arena = new Arena($('#app'), { size: [22, 26], seed: +params.get('seed') || 0 });
const W = S.ITEMS.trooper.weapon;
const BASIC = S.combatStats('trooper', S.BASIC_GEAR.trooper);
// stage: specific cover objects + packs
const covers = [['sandbags', -3.2, -3.5, 0], ['crate', 3.4, -4.4, 0], ['wall', 0, 0.6, 0], ['barrels', -5.6, 2.6, 0], ['crate', 5.2, 2.2, 0], ['sandbags', -4, 7.2, 0], ['wall', 4.2, 7.8, 0], ['crate', 0, 9.6, 0]];
for (const c of covers) arena.addCover(...c);
arena.addPickup('health', -8, -6.5); arena.addPickup('ammo', 8, -5.5); arena.addPickup('weapon', 0, -6.5, { weapon: 1 }); arena.addPickup('health', 7.5, 4);
let me = null, dummies = [];
const SPAWN = [0, -10.5];
function build() {
  arena.reset();
  const tr = cur.trait || S.CLASS_TRAIT[cur.cls] || 'rusher';
  me = arena.addUnit({ id: cur.id, name: cur.name, icon: cur.icon, kind: cur.kind, team: 'A', st: cur.st, nat: cur.nat, x: SPAWN[0], z: SPAWN[1], yaw: 0, trait: cur.kind === 'tank' ? null : tr, entry: cur });
  const dummyGear = S.toIndex('trooper', S.BASIC_GEAR.trooper);
  dummies = [['hold', -4, 9.5], ['hold', 4.2, 10], ['advance', 0, 11.5]].map(([role, x, z], i) => arena.addUnit({ id: 'd' + i, name: 'Dummy ' + (i + 1), icon: '🤖', team: 'B', enemy: true, role, st: { ...dummyGear }, nat: ENEMY_NAT, x, z, yaw: Math.PI, aimMul: DEMO.dummyAim }));
  arena.follow = me; arena.setCam(arena.cam === 'follow' ? 'follow' : arena.cam, me); markCam(arena);
  renderWho(); renderUnits(); renderStats();
  const u = new URL(location.href); u.searchParams.delete('look'); u.searchParams.delete('slot'); u.searchParams.delete('tank'); u.searchParams.set('unit', cur.id); history.replaceState(null, '', u);
}
// respawns: dummies come back 5 s after going down, the unit 2.5 s after
arena.on('tick', () => {
  for (const d of dummies) if (d.down != null && d.down > 5) arena.respawn(d);
  if (me.down != null && me.down > 2.5) { arena.respawn(me, SPAWN[0], SPAWN[1]); toast('🔁 ' + me.name + ' is back'); }
});
arena.on('pickup', (u, p) => { if (u === me) toast(p.kind === 'health' ? '❤️ +' + DEMO.healthPack : p.kind === 'ammo' ? '📦 ammo' : W[me.wpn].i + ' ' + W[me.wpn].n); renderStats(); });
arena.on('down', (x, by) => { if (x === me) toast('💨 ' + me.name + ' is down'); else if (by === me) toast('💥 ' + x.name + ' down'); });
arena.on('blocked', (x) => { if (x === me && Math.random() < 0.4) toast((x.cover && x.cover.cv.icon || '🧱') + ' cover blocked a shot'); });

function renderWho() {
  drawFlag($('#whoFlag'), cur.nat); $('#whoIco').textContent = cur.icon; $('#whoName').textContent = cur.name;
  $('#whoFor').textContent = `${S.CLASS_INFO[cur.cls].i} · 👤 ${cur.nat.player} · 🏳️ ${cur.nat.name}`;
}
const STATE_ICON = { idle: '🧍', walk: '🚶', run: '🏃', aim: '🎯', cover: '🧱', nest: '🎯', reload: '🔄', plant: '💣', down: '💨' };
let hudKey = '';
function renderHud() {
  const u = me; if (!u) return;
  const hp = Math.round(u.hp), lowHp = u.hp / u.maxHp < 0.35, out = u.ammo + u.reserve === 0;
  const parts = [
    `<span class="${lowHp ? 'bad' : ''}" title="Health">❤️ ${hp}/${Math.round(u.maxHp)}</span>`,
    `<span class="${out ? 'bad' : u.ammo === 0 ? 'warn' : ''}" title="Ammo: magazine | spare">${['🔫', '🚀', '🎯', '💥', '🌀', '⚡'][u.wpn] || '🚜'} ${u.reload != null ? '🔄' : u.ammo}|${u.reserve}</span>`,
    `<span title="State">${STATE_ICON[u.state] || '🧍'}${arena.inCover(u) ? ' ' + (u.cover.cv.icon || '🧱') : ''}</span>`,
    u.buff != null ? `<span class="good" title="Picked-up weapon">⬆️</span>` : '',
    `<span title="Hits landed">🎯 ${u.hits}</span>`, `<span title="Dummies downed">💥 ${u.downs}</span>`, `<span title="Hits taken">🛡️ ${u.taken}</span>`,
  ].join('');
  if (parts !== hudKey) { $('#hud').innerHTML = parts; hudKey = parts; }
}
function renderStats() {
  const c = me.stats, hitsToStop = Math.ceil(me.maxHp / BASIC.dmg);
  const vs = (a, b, hi = true) => (a > b + 1e-6 ? (hi ? 'good' : 'bad') : a < b - 1e-6 ? (hi ? 'bad' : 'good') : '');
  $('#stats').innerHTML = [
    `<span class="${vs(c.speed, BASIC.speed)}" title="Speed (m/s)">🏃 ${c.speed.toFixed(2)}</span>`,
    `<span class="${vs(c.dmg, BASIC.dmg)}" title="Damage per hit">💥 ${+c.dmg.toFixed(1)}</span>`,
    `<span class="${vs(c.range, BASIC.range)}" title="Range (m)">🎯 ${c.range} m</span>`,
    `<span class="${vs(c.rof, BASIC.rof, false)}" title="Seconds between shots">⏱️ ${c.rof} s</span>`,
    c.splash ? `<span title="Splash radius">💫 ${c.splash} m</span>` : '',
    `<span class="${vs(hitsToStop, Math.ceil(BASIC.hp / BASIC.dmg))}" title="Blaster hits it takes to stop this unit">🛡️ ${hitsToStop} hits</span>`,
    c.planned ? '<span title="Tank numbers are planned (no tanks in Conquest yet)">🧪</span>' : '',
  ].join(' ');
  $('#stats').querySelectorAll('span').forEach((s) => { s.style.color = s.className === 'good' ? '#7dffa0' : s.className === 'bad' ? '#ff9a8a' : ''; });
}
function renderUnits() {
  const box = $('#units'); box.replaceChildren();
  let last = null;
  for (const e of data.entries) {
    if (e.playerId !== last && data.players.length > 1) { const c = h('canvas', { width: 32, height: 32, className: 'nflag', title: e.nat.name }); drawFlag(c, e.nat); box.append(c); }
    last = e.playerId;
    const b = h('button', { type: 'button', className: 'unit' + (e.id === cur.id ? ' on' : ''), title: e.name, 'aria-label': e.name, 'data-id': e.id }, [
      h('span', { className: 'ico', textContent: e.icon }), h('i', { textContent: e.name }), h('em', { textContent: '❤️' + Math.round(e.stats.hp) + ' 🏃' + e.stats.speed.toFixed(1) }),
      h('b', { className: 'tr', textContent: S.CLASS_INFO[e.cls].i }),
    ]);
    b.addEventListener('click', () => { cur = e; build(); });
    box.append(b);
  }
  $('#legend').textContent = `🤖 training dummies aim at ${DEMO.dummyAim * 100}% · arena = ${SCALE}× Conquest metres · 🧪 mags, reload, packs are demo-only`;
}
backLink(); playControls(arena, () => build());
build();
let acc = 0; arena.on('tick', (dt) => { acc += dt; if (acc > 0.12) { acc = 0; renderHud(); } });
renderHud();
window.__combat = { arena, get me() { return stateOf(me); }, dummies: () => dummies.map(stateOf), select: (id) => { const e = data.entries.find((x) => x.id === id); if (!e) return false; cur = e; build(); return true; }, fast: (s) => { arena.fast(s); renderHud(); return stateOf(me); }, units: () => data.entries.map((e) => ({ id: e.id, name: e.name, kind: e.kind, cls: e.cls })) };
