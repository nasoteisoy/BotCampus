// Army data: reads the Trooper Customizer save (localStorage 'trooper-custom:db', same origin on GitHub Pages),
// falls back to built-in armies, and turns a look's gear into a class + combat stats.
// Supports the Customizer v4 save (db v:3, 6-slot roster per nation, v4 kit) and the older v2/v3 save (db v:2).
import { sanitizeNation, sanitizeFields, undigits, undigitsV2Trooper, mapV2Trooper, defaultRoster, TROOPER_FIELDS, TROOPER_FIELDS_V2, TROOPER_DEFAULT, TROOPER_DEFAULT_V2, NATION_DEFAULT } from './trooper.js';
import { unitCost, unitStats } from './cost.js';

export const LS_DB = 'trooper-custom:db';

const DEFAULT_NATIONS = [
  { id: 'def-blue', name: 'Azure League', p: '#2f80ed', s: '#ffe14d', suit: 0, sym: 0, sc: 0, vis: 0, glow: 1 },
  { id: 'def-red', name: 'Crimson Pact', p: '#c0392b', s: '#1b1f24', suit: 1, sym: 3, sc: 0, vis: 1, glow: 1 },
];

const clean = (x, max = 24) => String(x ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const rosterLooks = (nid, roster) => roster.map((r, i) => ({ id: `r-${nid}-${i}`, nationId: nid, name: clean(r.name, 16) || 'Trooper', icon: clean(r.icon, 4), st: sanitizeFields(r.t, TROOPER_FIELDS, TROOPER_DEFAULT), roster: true }));

// Returns { player, nations, looks:[{id,nationId,name,icon,st}], active, source:'customizer'|'default', version }
export function loadArmies(storage = globalThis.localStorage) {
  let d = null;
  try { d = JSON.parse(storage.getItem(LS_DB) || 'null'); } catch (e) { d = null; }
  const out = { player: 'Player', nations: [], looks: [], source: 'default', version: 0 };
  if (d && (d.v === 3 || d.v === 2) && Array.isArray(d.nations)) {
    out.version = d.v;
    out.player = clean(d.player && d.player.name) || 'Player';
    for (const n of d.nations) if (n && typeof n.id === 'string') out.nations.push({ id: n.id, name: clean(n.name) || 'Nation', ...sanitizeNation(n), _roster: n.roster });
    const ids = new Set(out.nations.map((n) => n.id));
    // v4 save: each nation's 6-slot roster comes first
    if (d.v === 3) for (const n of out.nations) { const filled = Array.isArray(n._roster) ? n._roster.filter((r) => r && !r.blank) : []; out.looks.push(...rosterLooks(n.id, filled.length ? filled : defaultRoster())); }
    for (const l of d.looks || []) {
      if (!l || l.unit !== 'trooper' || !ids.has(l.nationId)) continue;
      const st = d.v === 3 ? undigits(l.u, TROOPER_FIELDS, TROOPER_DEFAULT) : undigitsV2Trooper(l.u); if (!st) continue;
      out.looks.push({ id: String(l.id), nationId: l.nationId, name: clean(l.name) || 'Look', icon: '', st });
    }
    // v2 save: the active nation's current trooper counts as a look when it has none saved
    if (d.v === 2 && d.cur && d.cur.trooper && ids.has(d.active) && !out.looks.some((l) => l.nationId === d.active))
      out.looks.push({ id: 'cur-' + d.active, nationId: d.active, name: 'Current', icon: '', st: mapV2Trooper(sanitizeFields(d.cur.trooper, TROOPER_FIELDS_V2, TROOPER_DEFAULT_V2)) });
    out.nations.forEach((n) => delete n._roster);
    out.active = ids.has(d.active) ? d.active : (out.nations[0] && out.nations[0].id);
    if (out.nations.length) out.source = 'customizer';
  }
  if (!out.nations.length) {
    out.nations = DEFAULT_NATIONS.map((n) => ({ ...n }));
    out.active = out.nations[0].id;
  }
  return out;
}

// built-in army = the Customizer's default 6-type roster (Trooper, Heavy, Sniper, Engineer, Jet Trooper, Commander)
export function defaultLooksFor(nationId) { return rosterLooks(nationId, defaultRoster()).map((l) => ({ ...l, id: 'def-' + l.id })); }

// random nation (enemy fallback) that doesn't clash with the player's primary color
const PALETTE = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#5b7a3a', '#1abc9c', '#6c4bd1', '#d35b9f', '#2e343c', '#e8eef4'];
const SEC = ['#1b1f24', '#ffe14d', '#f4f6f8', '#ff9f1a', '#00d4ff', '#4cd964'];
export function randomNation(rng, avoidHex) {
  const hexDist = (a, b) => { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.abs((x >> 16) - (y >> 16)) + Math.abs(((x >> 8) & 255) - ((y >> 8) & 255)) + Math.abs((x & 255) - (y & 255)); };
  const opts = PALETTE.filter((c) => !avoidHex || hexDist(c, avoidHex) > 180);
  const p = opts[(rng() * opts.length) | 0] || '#c0392b';
  return { id: 'rnd-enemy', name: 'Raiders', ...sanitizeNation({ ...NATION_DEFAULT, p, s: SEC[(rng() * SEC.length) | 0], suit: (rng() * 5) | 0, sym: (rng() * 12) | 0, vis: (rng() * 6) | 0, glow: 1 + ((rng() * 2) | 0) }) };
}
export function randomLooks(rng, nationId, n = 4) {
  const base = defaultRoster(), out = [];
  for (let i = 0; i < n; i++) {
    const st = { ...base[i % base.length].t };
    for (const k of ['helm', 'pads', 'extra', 'banner', 'skin', 'side', 'expl']) { const f = TROOPER_FIELDS.find(([q]) => q === k); st[k] = (rng() * f[1]) | 0; }
    if (rng() < 0.3) st.armor = 1;
    out.push({ id: `rnd-${i}`, nationId, name: base[i % base.length].name, icon: base[i % base.length].icon, st });
  }
  return out;
}

// ---------- class + stats from gear (v1: Trooper + Heavy) ----------
// Design rule (v4 kit): rocket launcher → Heavy. Everything else plays as Trooper in v1, but keeps its own
// weapon numbers (sniper = long range, shotgun = close, chaingun = fast, EMP = small splash).
// Sharpshooter / Engineer / Jet Trooper / Commander abilities come in v2.
export const classOf = (st) => (st.weapon === 1 ? 'heavy' : 'trooper');

const WEAPONS = [
  { weapon: 'rifle', range: 28, rof: 0.55, dmg: 11, splash: 0 },        // blaster
  { weapon: 'rocket', range: 30, rof: 2.6, dmg: 55, splash: 3.2 },      // rocket launcher (Heavy)
  { weapon: 'rifle', range: 42, rof: 1.6, dmg: 34, splash: 0, laser: 1 }, // sniper
  { weapon: 'rifle', range: 15, rof: 0.9, dmg: 24, splash: 0 },         // shotgun
  { weapon: 'rifle', range: 24, rof: 0.16, dmg: 4.2, splash: 0 },       // chaingun
  { weapon: 'rocket', range: 22, rof: 2.0, dmg: 24, splash: 2.4 },      // EMP launcher
];
export function statsOf(st) {
  const { cost, power } = unitCost('trooper', st);
  const { hp, speed } = unitStats('trooper', st);
  const w = WEAPONS[st.weapon] || WEAPONS[0];
  const acc = 0.5 + Math.min(0.12, power * 0.002);   // a bit better with more ⚡
  return { cls: classOf(st), cost, power, hp: hp + [0, 5, 10][st.pads || 0], speed: speed * 0.9, acc, ...w, dmg: w.dmg * (st.award ? 1.1 : 1) };
}

export function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
