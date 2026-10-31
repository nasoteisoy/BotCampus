// 🥊 Combat demo: one saved unit fights training dummies on its own.
// It shoots (real damage / range / fire rate), gets shot (real HP + Conquest hit factors), ducks behind specific cover objects,
// and grabs ❤ health, 📦 ammo and 🔫 weapon packs. Icon HUD only, no bars, no blood (R.U.S.E.-style smoke).
import { Arena, ENEMY_NAT, DEMO, SCALE, OUT_T, stateOf } from './arena.js';
import { loadArmyData, pickEntry, S } from './army-data-stub.js';
import { $, h, params, drawFlag, backLink, playControls, markCam, toast } from './arena-ui-stub.js';

const data = loadArmyData();
let cur = pickEntry(data, params);
const arena = new Arena($('#app'), { size: [22, 26], seed: +params.get('seed') || 0 });
const W = S.ITEMS.trooper.weapon;
const BASIC = S.combatStats('trooper', S.BASIC_GEAR.trooper);
// stage: specific cover objects + packs
const covers = [['sandbags', -3.2, -3.5, 0], ['crate', 3.4, -4.4, 0], ['wall', 0, 0.6, 0], ['barrels', -5.6, 2.6, 0], ['crate', 5.2, 2.2, 0], ['sandbags', -4, 7.2, 0], ['wall', 4.2, 7.8, 0], ['crate', 0, 9.6, 0]];
for (const c of covers) arena.addCover(...c);
arena.gear.addPost(0, -1.2, 'B');   // the middle post (held by the dummies): where a ⏰ time bomb gets planted
arena.addPickup('health', -8, -6.5); arena.addPickup('ammo', 8, -5.5); arena.addPickup('weapon', 0, -6.5, { weapon: 1 }); arena.addPickup('health', 7.5, 4);
let me = null, dummies = [];
const SPAWN = [0, -10.5];
function build() {
  arena.reset();
  const tr = cur.trait || S.CLASS_TRAIT[cur.cls] || 'rusher';
  me = arena.addUnit({ id: cur.id, name: cur.name, icon: cur.icon, kind: cur.kind, team: 'A', st: cur.st, nat: cur.nat, x: SPAWN[0], z: SPAWN[1], yaw: 0, trait: cur.kind === 'tank' ? null : tr, entry: cur });
  const dummyGear = S.toIndex('trooper', S.BASIC_GEAR.trooper);
  dummies = [['hold', -4, 9.5], ['hold', 4.2, 10], ['advance', 0, 11.5]].map(([role, x, z], i) => arena.addUnit({ id: 'd' + i, name: 'Dummy ' + (i + 1), icon: 'Bot', team: 'B', enemy: true, role, st: { ...dummyGear }, nat: ENEMY_NAT, x, z, yaw: Math.PI, aimMul: DEMO.dummyAim }));
  arena.follow = me; arena.setCam(arena.cam === 'follow' ? 'follow' : arena.cam, me); markCam(arena);
  renderWho(); renderUnits(); renderStats();
  const u = new URL(location.href); u.searchParams.delete('look'); u.searchParams.delete('slot'); u.searchParams.delete('tank'); u.searchParams.set('unit', cur.id); history.replaceState(null, '', u);
}
// respawns: dummies come back 5 s after going down, the unit once its taken-out fall has faded (OUT_T.fade)
const BACK_AFTER = OUT_T.fade + 0.3;
arena.on('tick', () => {
  for (const d of dummies) if (d.down != null && d.down > Math.max(5, BACK_AFTER)) arena.respawn(d);
  if (me.down != null && me.down > BACK_AFTER) { arena.respawn(me, SPAWN[0], SPAWN[1]); toast(me.name + ' is back'); }
});
arena.on('pickup', (u, p) => { if (u === me) toast(p.kind === 'health' ? 'HP +' + DEMO.healthPack : p.kind === 'ammo' ? 'ammo' : W[me.wpn].i + ' ' + W[me.wpn].n); renderStats(); });
arena.on('down', (x, by) => { if (x === me) toast(me.name + ' taken out'); else if (by === me) toast(x.name + ' taken out'); });
const GEAR_TOAST = { thermal: 'Thermal thrown', mines: 'Mine planted', detpack: 'Detpack placed', 'time-bomb': 'Time bomb planted', turret: 'Turret deployed', 'recon-bot': 'Recon bot out', supply: 'Supply crate dropped', rally: 'Rally!' };
arena.on('gear', (u, what) => { if (u === me && GEAR_TOAST[what]) toast(GEAR_TOAST[what]); });
arena.on('blocked', (x) => { if (x === me && Math.random() < 0.4) toast((x.cover && x.cover.cv.icon || 'Wall') + ' cover blocked a shot'); });

function renderWho() {
  drawFlag($('#whoFlag'), cur.nat); $('#whoIco').textContent = cur.icon; $('#whoName').textContent = cur.name;
  $('#whoFor').textContent = `${S.CLASS_INFO[cur.cls].i} · ${cur.nat.player} · ${cur.nat.name}`;
}
const STATE = { idle: 'Standing', walk: 'Walking', run: 'Running', aim: 'Aiming', cover: 'In cover', nest: 'Sniper spot', reload: 'Reloading', plant: 'Planting', down: 'Taken out' };
let hudKey = '';
function renderHud() {
  const u = me; if (!u) return;
  const hp = Math.round(u.hp), lowHp = u.hp / u.maxHp < 0.35, out = u.ammo + u.reserve === 0;
  const wi = u.kind === 'tank' ? 'Tank' : (W[u.wpn] || W[0]).i, side = u.side != null && u.gear ? S.ITEMS.trooper.side.find((x) => x.id === u.gear.side.id) : null;
  const parts = [
    `<span class="${lowHp ? 'bad' : ''}" title="Health">HP ${hp}/${Math.round(u.maxHp)}</span>`,
    `<span class="${out ? 'bad' : u.ammo === 0 ? 'warn' : ''}" title="Ammo: magazine | spare">${wi} Ammo ${u.reload != null ? 'REL' : u.ammo}|${u.reserve}</span>`,
    `<span title="What it is doing">${side ? side.i + ' Pistol' : STATE[u.state] || STATE.idle}</span>`,
    u.buff != null ? `<span class="good" title="Picked-up weapon">Pickup</span>` : '',
    `<span title="Hits landed">Hits ${u.hits}</span>`, `<span title="Dummies taken out">Takedowns ${u.downs}</span>`,
  ].join('');
  if (parts !== hudKey) { $('#hud').innerHTML = parts; hudKey = parts; }
}
function renderStats() {
  const c = me.stats, hitsToStop = Math.ceil(me.maxHp / BASIC.dmg);
  const vs = (a, b, hi = true) => (a > b + 1e-6 ? (hi ? 'good' : 'bad') : a < b - 1e-6 ? (hi ? 'bad' : 'good') : '');
  $('#stats').innerHTML = [
    `<span class="${vs(c.speed, BASIC.speed)}" title="Speed (m/s)">Speed ${c.speed.toFixed(2)}</span>`,
    `<span class="${vs(c.dmg, BASIC.dmg)}" title="Damage per hit">Damage ${+c.dmg.toFixed(1)}</span>`,
    `<span class="${vs(c.range, BASIC.range)}" title="Range (m)">Range ${c.range} m</span>`,
    `<span class="${vs(c.rof, BASIC.rof, false)}" title="Seconds between shots">Reload ${c.rof} s</span>`,
    c.splash ? `<span title="Blast radius">Blast ${c.splash} m</span>` : '',
    `<span class="${vs(hitsToStop, Math.ceil(BASIC.hp / BASIC.dmg))}" title="Rifle hits it takes to take this unit out">Takes ${hitsToStop} hits</span>`,
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
      h('span', { className: 'ico', textContent: e.icon }), h('i', { textContent: e.name }), h('em', { textContent: 'HP' + Math.round(e.stats.hp) + ' SPD' + e.stats.speed.toFixed(1) }),
      h('b', { className: 'tr', textContent: S.CLASS_INFO[e.cls].i }),
    ]);
    b.addEventListener('click', () => { cur = e; build(); });
    box.append(b);
  }
  renderGear();
}
// 🎒 the unit's loadout: tap one for what it does in battle (same numbers as Conquest)
function renderGear() {
  const box = $('#legend'); box.replaceChildren(); box.className = 'gearrow';
  if (cur.kind !== 'trooper') { box.append(h('span', { textContent: 'Tank: main gun + armor (rifle and pistol hits do ' + Math.round(S.TANK_RULES.armorMul * 100) + '% damage)' })); return; }
  const I = S.ITEMS.trooper, st = cur.st, e = S.EXPLOSIVES[st.expl | 0] || S.EXPLOSIVES[0], g = S.GADGETS[st.gadget | 0] || S.GADGETS[0];
  const items = [[I.side[st.side | 0] || I.side[0], S.GEAR_EFFECT.side(S.SIDEARMS[st.side | 0] || S.SIDEARMS[0])], [I.expl[st.expl | 0] || I.expl[0], S.GEAR_EFFECT.expl[e.id](e)], [I.gadget[st.gadget | 0] || I.gadget[0], S.GEAR_EFFECT.gadget[g.id](g)]];
  box.append(h('b', { textContent: 'Gear' }));
  for (const [it, fx] of items) { const b = h('button', { type: 'button', className: 'gearchip', title: it.n + ': ' + fx, textContent: it.i + ' ' + it.n }); b.addEventListener('click', () => { $('#gearInfo').textContent = it.i + ' ' + it.n + ': ' + fx; }); box.append(b); }
  box.append(h('i', { id: 'gearInfo', textContent: 'Tap an item to see what it does' }));
}
// live roster card for the unit in the arena: its ❤ now, 💀 when taken out
function refreshCard() {
  const b = document.querySelector('#units .unit.on em'); if (!b || !me) return;
  const t = me.down != null ? 'out' : 'HP' + Math.round(me.hp) + ' SPD' + me.stats.speed.toFixed(1); if (b.textContent !== t) b.textContent = t;
  document.querySelector('#units .unit.on').classList.toggle('down', me.down != null);
}
backLink('Combat'); playControls(arena, () => build());
build();
let acc = 0; arena.on('tick', (dt) => { acc += dt; if (acc > 0.12) { acc = 0; renderHud(); refreshCard(); } });
renderHud();
window.__combat = { arena, get me() { return stateOf(me); }, dummies: () => dummies.map(stateOf), select: (id) => { const e = data.entries.find((x) => x.id === id); if (!e) return false; cur = e; build(); return true; }, fast: (s) => { arena.fast(s); renderHud(); return stateOf(me); }, units: () => data.entries.map((e) => ({ id: e.id, name: e.name, kind: e.kind, cls: e.cls })), gear: () => arena.gear.list(), gearUsed: () => ({ ...arena.gear.used }) };
