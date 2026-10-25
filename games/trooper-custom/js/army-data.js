// Demo pages' view of the army save: one flat list of "entries" (units with painter state + real battle stats).
// Source of truth: 'botcampus:army' via games/shared/army/schema.js (migrates the old 'trooper-custom:db' on first load).
import * as Army from '../../shared/army/schema.js?v=9';
import * as S from '../../shared/army/stats.js?v=9';
import * as T from './trooper.js?v=7';

const clean = (x, max = 24) => String(x ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
export const WEAPON_ICONS = S.ITEMS.trooper.weapon.map((w) => w.i); // one icon per weapon (stats.js)
// entry: { key, id, kind, name, icon, st (index state), nat (painter nation + id, name, player), trait, thumb, roster, playerId, cls, stats }
export function entryOf(u, p) {
  const st = Army.unitState(u), cls = S.classOf(u.kind, u.gear);
  const nat = { id: p.nation.id, name: p.nation.name, player: p.name, playerId: p.id, ...Army.nationState(p.nation) };
  return {
    key: 'unit:' + u.id, id: u.id, kind: u.kind, name: clean(u.name, 16) || (u.kind === 'tank' ? 'Tank' : 'Trooper'),
    icon: u.kind === 'tank' ? '🚜' : clean(u.icon, 4) || WEAPON_ICONS[st.weapon] || '🪖', st, nat, trait: u.traits[0] || '', thumb: u.thumb || '',
    roster: u.roster, playerId: p.id, cls, stats: S.combatStats(u), legacyLookId: u.ext && u.ext.legacyLookId, unit: u,
  };
}
export function loadArmyData() {
  let army = Army.load();
  const out = { army, players: army.players, entries: [], activePlayerId: army.activePlayerId, source: 'army' };
  if (!army.units.length) { // nothing saved yet: one basic trooper + one basic tank (not written back)
    out.source = 'default';
    const p = army.players[0];
    army = { ...army, units: [Army.newUnit(army, p.id, 'trooper', { id: 'demo-trooper-1', slot: 0 }), Army.newUnit(army, p.id, 'tank', { id: 'demo-tank-1', slot: 0 })] };
    out.army = army;
  }
  const order = [...army.players.filter((p) => p.id === army.activePlayerId), ...army.players.filter((p) => p.id !== army.activePlayerId)];
  for (const p of order) {
    const mine = Army.playerUnits(army, p.id);
    const rank = (u) => (u.roster ? (u.kind === 'trooper' ? 0 : 1) : 2);
    mine.sort((a, b) => rank(a) - rank(b) || (a.slot ?? 99) - (b.slot ?? 99));
    for (const u of mine) out.entries.push(entryOf(u, p));
  }
  const cu = army.ext && army.ext['trooper-custom'] || {};
  out.unitKind = cu.unit === 'tank' ? 'tank' : 'trooper'; out.slot = Number.isInteger(cu.slot) ? cu.slot : 0;
  return out;
}
// start unit from the URL: ?unit=<army id> · legacy ?look=<old look id> · ?slot=<nationId>.<i> · ?tank[=<nationId>] · ?player=<id>
export function pickEntry(data, params) {
  const E = data.entries, act = data.activePlayerId;
  const u = params.get('unit');
  if (u && u !== 'tank') { const e = E.find((x) => x.id === u); if (e) return e; }
  const lk = params.get('look'); if (lk) { const e = E.find((x) => x.id === lk || x.id === 'l-' + lk || x.legacyLookId === lk); if (e) return e; }
  const sl = params.get('slot'); if (sl) { const [nid, i] = sl.split('.'); const e = E.find((x) => x.nat.id === nid && x.kind === 'trooper' && x.roster && x.unit.slot === +i); if (e) return e; }
  const pl = params.get('player') || act;
  if (params.get('tank') != null || u === 'tank') { const e = E.find((x) => x.kind === 'tank' && x.playerId === (params.get('tank') ? E.find((y) => y.nat.id === params.get('tank'))?.playerId || pl : pl)); if (e) return e; }
  // otherwise: the trooper being edited (not the last tank)
  return E.find((x) => x.playerId === pl && x.kind === 'trooper' && x.roster && x.unit.slot === data.slot) || E.find((x) => x.playerId === pl && x.kind === 'trooper') || E.find((x) => x.kind === 'trooper') || E[0];
}
export const ARMY_KEY = Army.ARMY_KEY;
export { Army, S, T };
