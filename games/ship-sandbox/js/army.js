// Ship Sandbox <- army bridge. READ-ONLY: Ship Sandbox never writes localStorage.
// Spec: ARMY_SCHEMA.md v1 (games/shared/army/schema.js + stats.js, owned by Trooper Customizer / Lead: Dev).
// Source order:
//   1) shared schema module: Army.load(readOnlyStorage) -> 'botcampus:army' (or in-memory migration of 'trooper-custom:db' v3;
//      the migration's save() hits a no-op storage, so nothing is written)
//   2) module missing: parse 'botcampus:army' v1 ourselves, else 'trooper-custom:db' v3, else the default nation + 'Trooper 1'.
// adaptArmy() is the ONE swap point that turns a v1 army into Ship Sandbox's internal shape:
//   { src, player:{name}, nation:{name, colors:{primary,secondary}, flag:{stripes:[...], emblem, emblemColor}},
//     troopers:[{ id, name, icon, cls, look:{helmet, armorColor, visor, skin, heavy}, gear:[emoji], stats:{hp, acc, repair} }] }
//   stats.acc = % less weapon spread from this crew member, stats.repair = HP/s they patch on their part.
export const ARMY_KEY = 'botcampus:army';
export const TC_KEY = 'trooper-custom:db';
const HELMETS = ['dome', 'angular', 'crest', 'goggles', 'recon'];
const SYM = ['star', 'planet', 'comet', 'skull', 'wing', 'bolt', 'chevron', 'crescent', 'gear', 'atom', 'triangle', 'circle'];
const SC = ['auto', 'white', 'black', 'primary'], SUIT = ['charcoal', 'olive', 'sand', 'navy', 'white'], VISN = ['cyan', 'red', 'amber', 'green', 'purple', 'white'];
const VISOR = { cyan: '#5ee8ff', red: '#ff4a4a', amber: '#ffb43a', green: '#5dff7a', purple: '#b779ff', white: '#f2f6ff' };
const SKIN = ['#f1c9a5', '#d9a37a', '#a8714a', '#7a4b2e', '#4a2e1e'];
// item ids -> emoji when stats.js is not available (same icons as stats.js ITEMS)
const GEAR_ICON = { blaster: '🔫', rocket: '🚀', sniper: '🎯', shotgun: '💥', chaingun: '🌀', emp: '⚡', mines: '💣', detpack: '🧨', 'time-bomb': '⏱️', thermal: '🟢',
  turret: '🗼', 'recon-droid': '🛰️', jetpack: '🎒', 'fusion-cutter': '🔧', supply: '📦', rally: '📣' };
const CLS_ICON = { trooper: '🪖', heavy: '🚀', engineer: '🔧', sniper: '🎯', commander: '⭐', jet: '🛩️' };
const TC_HELM = HELMETS, TC_ARMOR = ['standard', 'heavy'], TC_WPN = ['blaster', 'rocket', 'sniper', 'shotgun', 'chaingun', 'emp'], TC_EXPL = ['thermal', 'mines', 'detpack', 'time-bomb'],
  TC_GAD = ['none', 'turret', 'recon-droid', 'jetpack', 'fusion-cutter', 'supply', 'rally'], TC_PADS = ['none', 'round', 'angular'], TC_SKIN = ['skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5'];
const hex = (h, fb) => (/^#[0-9a-f]{6}$/i.test(String(h || '')) ? String(h).toLowerCase() : fb);
const str = (s, fb, n = 24) => (typeof s === 'string' && s.trim() ? s.replace(/[<>]/g, '').trim().slice(0, n) : fb);
const clone = (o) => JSON.parse(JSON.stringify(o));
const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const RO_STORAGE = { getItem: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, setItem() {}, removeItem() {} };

export const DEFAULT_ARMY = Object.freeze({
  src: 'default', player: { name: 'Player' },
  nation: { name: 'Home Fleet', colors: { primary: '#2f80ed', secondary: '#ffe14d' }, flag: { stripes: ['#2f80ed'], emblem: 'star', emblemColor: '#ffe14d' } },
  troopers: [{ id: 't1', name: 'Trooper 1', icon: '🪖', cls: 'trooper', look: { helmet: 'dome', armorColor: '#2f80ed', visor: '#5ee8ff', skin: '#d9a37a', heavy: false }, gear: ['🔫'], stats: { hp: 100, acc: 3, repair: 1 }, combat: { hp: 100, acc: 0.5, dmg: 11, rof: 0.55, splash: 0, src: 'fallback' } }],
});

// boarding combat numbers: shared combatStats() (Conquest battle numbers) or this fallback (same numbers as stats.js WEAPONS)
const WPN_FB = { blaster: [11, 0.55, 0], rocket: [55, 2.6, 3.2], sniper: [34, 1.6, 0], shotgun: [24, 0.9, 0], chaingun: [4.2, 0.16, 0], emp: [24, 2, 2.4] };
export function combatOf(u, stats) {
  const g = (u && u.gear) || {};
  if (stats && typeof stats.combatStats === 'function') { try { const c = stats.combatStats(u); if (c && c.hp > 0) return { hp: c.hp, acc: c.acc, dmg: c.dmg, rof: c.rof, splash: c.splash || 0, src: 'shared' }; } catch (e) { /* fallback */ } }
  const w = WPN_FB[g.weapon] || WPN_FB.blaster, heavy = g.armor === 'heavy';
  return { hp: 100 + (heavy ? 60 : 0) + ({ round: 5, angular: 10 }[g.pads] || 0), acc: 0.5 + (heavy ? 0.02 : 0) + (g.weapon && g.weapon !== 'blaster' ? 0.02 : 0), dmg: w[0] * (g.award === 'star' ? 1.1 : 1), rof: w[1], splash: w[2], src: 'fallback' };
}
// crew boosts from a unit: real combatStats() when stats.js is loaded, else a stub from the gear ids
function crewStats(u, cls, stats) {
  let hp = 100 + (u.gear.armor === 'heavy' ? 60 : 0) + ({ round: 5, angular: 10 }[u.gear.pads] || 0), aimPow = 0;
  if (stats && typeof stats.combatStats === 'function') { try { const c = stats.combatStats(u); hp = c.hp; aimPow = Math.round((c.acc - 0.5) * 100); } catch (e) { /* stub */ } }
  return { hp, acc: 3 + aimPow + (cls === 'sniper' ? 6 : cls === 'commander' ? 3 : 0), repair: cls === 'engineer' ? 3 : u.gear.gadget === 'supply' ? 2 : 1 };
}
function classOfStub(g) {
  return g.weapon === 'rocket' ? 'heavy' : g.weapon === 'sniper' ? 'sniper' : g.gadget === 'jetpack' || g.weapon === 'emp' ? 'jet' : g.gadget === 'rally' || g.weapon === 'chaingun' ? 'commander' : g.gadget === 'fusion-cutter' || g.weapon === 'shotgun' ? 'engineer' : 'trooper';
}
// THE adapter: army v1 (ARMY_SCHEMA.md) -> Ship Sandbox shape. shared = { schema, stats } (either may be null)
export function adaptArmy(a, shared = {}, src = ARMY_KEY) {
  if (!a || typeof a !== 'object' || !Array.isArray(a.players) || !a.players.length) return null;
  const { schema, stats } = shared;
  const pl = (schema && schema.activePlayer ? schema.activePlayer(a) : a.players.find((p) => p && p.id === a.activePlayerId)) || a.players[0];
  const n = pl.nation || {}, c = n.colors || {}, f = n.flag || {};
  const prim = hex(c.primary, '#2f80ed'), sec = hex(c.secondary, '#ffe14d');
  const sc = f.symbolColor === 'white' ? '#ffffff' : f.symbolColor === 'black' ? '#1b1f24' : f.symbolColor === 'primary' ? prim : sec;
  const nation = { name: str(n.name, 'Home Fleet'), colors: { primary: prim, secondary: sec }, flag: { stripes: [prim], emblem: SYM.includes(f.symbol) ? f.symbol : 'star', emblemColor: sc } };
  const icon = (field, id) => { const it = stats && stats.ITEMS && stats.ITEMS.trooper[field] && stats.ITEMS.trooper[field].find((x) => x.id === id); return (it && it.icon) || GEAR_ICON[id] || ''; };
  const units = (Array.isArray(a.units) ? a.units : []).filter((u) => u && u.playerId === pl.id && (u.kind || 'trooper') === 'trooper' && u.roster !== false && u.gear)
    .sort((x, y) => (x.slot ?? 99) - (y.slot ?? 99)).slice(0, 12);
  const troopers = units.map((u, i) => {
    const g = u.gear, cls = (stats && stats.classOf ? stats.classOf('trooper', g) : null) || u.class || classOfStub(g);
    const skinI = Math.max(0, TC_SKIN.indexOf(g.skin));
    return { id: str(u.id, 'u' + i, 40), name: str(u.name, 'Trooper ' + (i + 1), 16), icon: str(u.icon, CLS_ICON[cls] || '🪖', 4), cls,
      look: { helmet: HELMETS.includes(g.helm) ? g.helm : 'dome', armorColor: prim, visor: VISOR[n.visor] || '#5ee8ff', skin: SKIN[skinI] || SKIN[1], heavy: g.armor === 'heavy' },
      gear: [icon('weapon', g.weapon), g.expl && g.expl !== 'thermal' ? icon('expl', g.expl) : '', g.gadget && g.gadget !== 'none' ? icon('gadget', g.gadget) : ''].filter(Boolean),
      stats: crewStats(u, cls, stats), combat: combatOf(u, stats) };
  });
  return { src, player: { name: str(pl.name, 'Player') }, nation, troopers: troopers.length ? troopers : clone(DEFAULT_ARMY.troopers) };
}
// legacy 'trooper-custom:db' v3 -> army v1 shape (only used when schema.js is missing; schema.migrate() does this otherwise)
function fromTrooperCustom(db) {
  if (!db || db.v !== 3 || !Array.isArray(db.nations) || !db.nations.length) return null;
  const nt = db.nations.find((x) => x && x.id === db.active) || db.nations[0], pid = 'p-' + nt.id;
  return { version: 1, activePlayerId: pid, players: [{ id: pid, name: db.player && db.player.name, nation: { name: nt.name, colors: { primary: nt.p, secondary: nt.s }, flag: { symbol: SYM[nt.sym | 0], symbolColor: SC[nt.sc | 0] }, suit: SUIT[nt.suit | 0], visor: VISN[nt.vis | 0] } }],
    units: (nt.roster || []).map((r, k) => (r && !r.blank && r.t ? { id: `u-${nt.id}-${k}`, name: r.name, playerId: pid, kind: 'trooper', roster: true, slot: k, icon: r.ia ? '' : r.icon,
      gear: { helm: TC_HELM[r.t.helm | 0], armor: TC_ARMOR[r.t.armor | 0], pads: TC_PADS[r.t.pads | 0], weapon: TC_WPN[r.t.weapon | 0], expl: TC_EXPL[r.t.expl | 0], gadget: TC_GAD[r.t.gadget | 0], skin: TC_SKIN[r.t.skin | 0] } } : null)).filter(Boolean) };
}

// shared modules are optional until games/shared/army ships
export async function loadShared() {
  const out = { stats: null, schema: null };
  try { out.stats = await import('../../shared/army/stats.js?v=9'); } catch (e) { out.stats = null; }
  if (out.stats) { try { out.schema = await import('../../shared/army/schema.js?v=9'); } catch (e) { out.schema = null; } }
  return out;
}
export async function loadArmy(shared) {
  if (shared === undefined) shared = await loadShared();
  const hasArmy = RO_STORAGE.getItem(ARMY_KEY) != null, hasTC = RO_STORAGE.getItem(TC_KEY) != null;
  if (!hasArmy && !hasTC) return clone(DEFAULT_ARMY);
  let a = null;
  if (shared.schema && typeof shared.schema.load === 'function') { try { a = adaptArmy(shared.schema.load(RO_STORAGE), shared, hasArmy ? ARMY_KEY : TC_KEY); } catch (e) { a = null; } }
  if (!a && hasArmy) { const raw = readJSON(ARMY_KEY); if (raw && raw.version >= 1) a = adaptArmy(raw, shared, ARMY_KEY); }
  if (!a && hasTC) a = adaptArmy(fromTrooperCustom(readJSON(TC_KEY)), shared, TC_KEY);
  if (a) a.shared = !!shared.schema;
  return a || clone(DEFAULT_ARMY);
}

// ---------- 2D portrait (canvas -> data URL, cached) ----------
const pcache = new Map();
export function portrait(t, size = 64) {
  const key = JSON.stringify([t.look, size]); if (pcache.has(key)) return pcache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const s = size / 64;
  g.scale(s, s);
  const L = t.look;
  g.fillStyle = '#0b1024'; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill();
  // body / armor
  g.fillStyle = L.armorColor; g.beginPath(); g.moveTo(10, 64); g.quadraticCurveTo(12, 44, 32, 42); g.quadraticCurveTo(52, 44, 54, 64); g.fill();
  if (L.heavy) { g.fillStyle = '#00000055'; g.fillRect(14, 50, 36, 5); g.fillStyle = L.armorColor; g.beginPath(); g.arc(13, 50, 7, 0, 7); g.arc(51, 50, 7, 0, 7); g.fill(); }
  // face
  g.fillStyle = L.skin; g.beginPath(); g.ellipse(32, 31, 11, 13, 0, 0, 7); g.fill();
  // helmet by type
  g.fillStyle = L.armorColor; g.strokeStyle = '#0008'; g.lineWidth = 1.5;
  g.beginPath();
  if (L.helmet === 'angular') { g.moveTo(17, 30); g.lineTo(20, 14); g.lineTo(44, 14); g.lineTo(47, 30); g.closePath(); }
  else if (L.helmet === 'crest') { g.arc(32, 28, 16, Math.PI, 0); g.closePath(); g.rect(29, 6, 6, 12); }
  else if (L.helmet === 'recon') { g.arc(32, 28, 15, Math.PI * 1.05, -0.05); g.closePath(); g.rect(44, 14, 3, 14); }
  else g.arc(32, 28, 16, Math.PI, 0);
  g.fill(); g.stroke();
  // visor
  g.fillStyle = L.visor;
  if (L.helmet === 'goggles') { g.beginPath(); g.arc(26, 30, 4.5, 0, 7); g.arc(38, 30, 4.5, 0, 7); g.fill(); }
  else { g.beginPath(); g.roundRect ? g.roundRect(21, 27, 22, 6, 3) : g.rect(21, 27, 22, 6); g.fill(); }
  g.lineWidth = 2; g.strokeStyle = '#ffffff30'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.stroke();
  const url = c.toDataURL(); pcache.set(key, url); return url;
}
// ---------- flag canvas ----------
export function drawFlag(canvas, flag) {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, st = flag.stripes;
  for (let i = 0; i < st.length; i++) { g.fillStyle = st[i]; g.fillRect(0, Math.floor(H * i / st.length), W, Math.ceil(H / st.length) + 1); }
  g.fillStyle = flag.emblemColor; g.strokeStyle = '#0006'; g.lineWidth = Math.max(1, H / 40);
  const cx = W * 0.5, cy = H * 0.5, r = H * 0.26; g.beginPath();
  switch (flag.emblem) {
    case 'circle': case 'planet': case 'atom': case 'gear': g.arc(cx, cy, r, 0, 7); break;
    case 'skull': g.arc(cx, cy - r * .1, r * .8, 0, 7); g.rect(cx - r * .45, cy + r * .4, r * .9, r * .55); g.fill(); g.fillStyle = '#000a'; g.beginPath(); g.arc(cx - r * .32, cy - r * .1, r * .2, 0, 7); g.arc(cx + r * .32, cy - r * .1, r * .2, 0, 7); break;
    case 'triangle': case 'chevron': g.moveTo(cx, cy - r); g.lineTo(cx + r, cy + r * .8); g.lineTo(cx - r, cy + r * .8); g.closePath(); break;
    case 'crescent': g.arc(cx, cy, r, .6, Math.PI * 2 - .6); g.arc(cx + r * .5, cy, r * .8, Math.PI * 2 - .9, .9, true); break;
    case 'bolt': g.moveTo(cx + r * .2, cy - r); g.lineTo(cx - r * .5, cy + r * .1); g.lineTo(cx, cy + r * .1); g.lineTo(cx - r * .2, cy + r); g.lineTo(cx + r * .5, cy - r * .1); g.lineTo(cx, cy - r * .1); g.closePath(); break;
    default: for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath();
  }
  g.fill(); g.stroke();
}
