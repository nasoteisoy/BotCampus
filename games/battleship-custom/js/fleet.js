// BattleShip fleet storage: army.battleships[] inside the shared save 'botcampus:army' (v1). Pure ES module (no DOM).
// Writes are merge-on-write raw JSON patches: re-read the latest stored army, replace ONLY battleships[] entries this
// page changed (by id), stamp updatedAt / updatedBy, and write. Every other field stays byte-identical.
import { cleanParts, BASE_PARTS } from './battleship-stats.js?v=1';

export const FIELD = 'battleships';
export const BY = 'battleship-custom';
export const LIMITS = Object.freeze({ shipsPerPlayer: 20, name: 20 });
const clean = (x, max = LIMITS.name) => String(x ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
export const newShipId = () => 'b-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ship = { id, name, playerId, v, parts:{hull,armor,shield,guns,hangar,engine}, updatedAt, ...unknown keys kept }
export function cleanShip(s = {}, playerId = '') {
  const o = s && typeof s === 'object' ? s : {};
  return {
    ...o,
    id: typeof o.id === 'string' && o.id ? o.id.slice(0, 40) : newShipId(),
    name: clean(o.name) || 'BattleShip',
    playerId: typeof o.playerId === 'string' && o.playerId ? o.playerId : playerId,
    v: 1,
    parts: cleanParts(o.parts),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date(0).toISOString(),
  };
}
export const fleetOf = (list, playerId) => list.filter((s) => s.playerId === playerId);
// 'BattleShip 1', 'BattleShip 2', … lowest free number for that player
export function nextShipName(list, playerId) {
  const used = new Set(fleetOf(list, playerId).map((s) => s.name));
  for (let n = 1; ; n++) if (!used.has('BattleShip ' + n)) return 'BattleShip ' + n;
}
export const newShip = (list, playerId) => cleanShip({ id: newShipId(), name: nextShipName(list, playerId), playerId, parts: { ...BASE_PARTS }, updatedAt: new Date().toISOString() }, playerId);

const json = (raw) => { try { return JSON.parse(raw || 'null'); } catch (e) { return null; } };
// all ships in a stored army object (bad entries skipped, never thrown)
export const shipsIn = (a) => (a && Array.isArray(a[FIELD]) ? a[FIELD].filter((s) => s && typeof s === 'object' && typeof s.id === 'string' && s.id).map((s) => cleanShip(s)) : []);

// merge-on-write. raw = current stored JSON string (or null). base = army object to start from when nothing is stored
// (e.g. Army.emptyArmy()). changed = Map id → ship (only ships THIS page edited), deleted = Set of ids.
// Returns the new JSON string. Ships stored by others (other players, other tabs) are kept as stored (verbatim objects).
export function mergeFleet(raw, base, changed, deleted, now = new Date().toISOString()) {
  let a = json(raw);
  if (!a || typeof a !== 'object' || Array.isArray(a)) a = base;
  const stored = Array.isArray(a[FIELD]) ? a[FIELD] : [];
  const out = [], seen = new Set();
  for (const s of stored) {
    const id = s && typeof s === 'object' ? s.id : null;
    if (id && deleted.has(id)) continue;
    if (id && changed.has(id)) { out.push(changed.get(id)); seen.add(id); continue; }
    out.push(s);
    if (id) seen.add(id);
  }
  for (const [id, s] of changed) if (!seen.has(id) && !deleted.has(id)) out.push(s);
  return JSON.stringify({ ...a, [FIELD]: out, updatedAt: now, updatedBy: BY });
}
