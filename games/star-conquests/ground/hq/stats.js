// BotCampus shared army stats — ONE source of truth for every game (Trooper Customizer, Conquest Commander, Ship Sandbox…).
// Pure ES module: no DOM, no three.js, safe to import in the browser and in Node tests.
//   import { ITEMS, COST, STATS, unitCost, unitStats, combatStats, classOf, gearLines } from '../shared/army/stats.js';
//
// Numbers below are copied 1:1 from Conquest Commander v2.3 (js/cost.js, js/data.js, js/traits.js, js/sim.js CFG) on 2026-10-24.
// Conquest should import this file instead of keeping its own copies, so a change here changes every game.
//
// Gear is stored by ITEM ID (string) in the army save (see ARMY_SCHEMA.md). The customizer's 3D builder still uses the
// option INDEX per field; toIndex()/toGear() convert between the two. Index order = order of ITEMS[kind][field].

export const STATS_VERSION = 1;

// ---------- item catalogue (id, name, icon, one-line tip) ----------
// Every loadout item (main weapon, sidearm, explosive, gadget) has a real battle effect in Conquest and the demos:
// SIDEARMS / EXPLOSIVES / GADGETS below hold the numbers, gearLines() prints them. Cosmetic fields are 🎨 look only.
const I = (id, n, i, tip = '') => Object.freeze({ id, n, i, tip });
export const ITEMS = Object.freeze({
  trooper: Object.freeze({
    helm: [I('dome', 'Dome', 'Trooper'), I('angular', 'Angular', 'Trooper'), I('crest', 'Crest', 'Trooper'), I('goggles', 'Goggles', 'Gog'), I('recon', 'Recon sensor', 'Scan')],
    armor: [I('standard', 'Standard', 'Armor', 'Trooper white plates: balanced HP and speed.'), I('heavy', 'Heavy', 'Wall', '+60 HP, but slower and bulkier.')],
    pads: [I('none', 'None', '∅'), I('round', 'Round', 'Round'), I('angular', 'Angular', 'Ang')],
    weapon: [
      I('rifle', 'Rifle', 'Rifle', 'Reliable all-round rifle, good vs infantry.'),
      I('rocket', 'Rocket', 'Rocket', 'Slow splash rockets: full damage to tanks and turrets.'),
      I('sniper', 'Sniper', 'Scope', 'Very long range, high damage, slow to fire.'),
      I('shotgun', 'Shotgun', 'SG', 'Huge damage up close, weak at range.'),
      I('chaingun', 'Chaingun', 'CG', 'Bullet storm; slows you down.'),
      I('emp', 'EMP', 'EMP', 'Splash shots that also stun tanks, turrets and bots.'),
    ],
    side: [I('rifle-pistol', 'Rifle pistol', 'Pistol', 'Backup pistol: fires while the main weapon reloads.'), I('commando-pistol', 'Commando pistol', 'CPist', 'Harder-hitting backup pistol, fires while the main weapon reloads.')],
    expl: [
      I('thermal', 'Thermal', 'Bomb', 'Thrown at close enemies: blows up after a short fuse.'),
      I('mines', 'Mines', 'Warn', 'Planted at your post: blows up enemies who step on it.'),
      I('detpack', 'Detpack', 'Detpack', 'Placed by tanks or groups of enemies, then set off: double damage to tanks.'),
      I('time-bomb', 'Time bomb', 'Time', 'Planted at an enemy post: a big blast after a delay.'),
    ],
    gadget: [
      I('none', 'None', '∅', 'No gadget: cheapest.'),
      I('turret', 'Turret', 'Turret', 'Deploys an auto turret that shoots enemies near it.'),
      I('recon-bot', 'Bot', 'Bot', 'Recon bot flies with you, zaps enemies and helps your team aim.'),
      I('jetpack', 'Jetpack', 'Gear', 'Faster on foot; makes a Jet trooper.'),
      I('fusion-cutter', 'Fusion', 'Fix', 'Repairs friendly tanks and turrets nearby; makes an Engineer.'),
      I('supply', 'Supply', 'Supply', 'Drops a crate that heals and re-arms allies nearby.'),
      I('rally', 'Rally', 'Rally', 'Rally call: allies nearby take less damage for a while.'),
    ],
    extra: [I('none', 'None', '∅'), I('cape', 'Cape', 'Wrap'), I('scarf', 'Scarf', 'Wrap')],
    banner: [I('none', 'Off', '∅'), I('flag', 'Back flag', 'Flag')],
    skin: [I('skin-1', 'Skin 1', ''), I('skin-2', 'Skin 2', ''), I('skin-3', 'Skin 3', ''), I('skin-4', 'Skin 4', ''), I('skin-5', 'Skin 5', '')],
  }),
  tank: Object.freeze({
    hull: [I('light', 'Light', 'Light'), I('medium', 'Medium', ''), I('heavy', 'Heavy', 'Wall')],
    drive: [I('treads', 'Treads', ''), I('hover', 'Hover', 'Hover')],
    turret: [I('dome', 'Dome', 'Dome'), I('wedge', 'Wedge', 'Wedge'), I('box', 'Box', 'Box')],
    gun: [I('cannon', 'Cannon', 'Ang'), I('twin', 'Twin', 'Twin'), I('railgun', 'Rail', ''), I('laser', 'Laser', 'Laser')],
    antenna: [I('none', 'Off', '∅'), I('antenna', 'Antenna', 'Scan')],
    skirts: [I('none', 'Off', '∅'), I('skirts', 'Skirts', '')],
    smoke: [I('none', 'Off', '∅'), I('smoke', 'Smoke', 'Smoke')],
    mg: [I('none', 'Off', '∅'), I('mg', 'Roof MG', 'Rifle')],
    pennant: [I('none', 'Off', '∅'), I('pennant', 'Pennant', 'Flag')],
  }),
});
// nation look ids (army save stores these strings; the 3D painter uses the index)
export const NATION_ITEMS = Object.freeze({
  suit: ['charcoal', 'olive', 'sand', 'navy', 'white'],
  sym: ['star', 'planet', 'comet', 'skull', 'wing', 'bolt', 'chevron', 'crescent', 'gear', 'atom', 'triangle', 'circle'],
  sc: ['auto', 'white', 'black', 'primary'],
  vis: ['cyan', 'red', 'amber', 'green', 'purple', 'white'],
  glow: ['off', 'soft', 'bright'],
});
export const GEAR_FIELDS = Object.freeze({ trooper: Object.keys(ITEMS.trooper), tank: Object.keys(ITEMS.tank) });
// Old saves (customizer v3 'l.u' look strings, TC share codes) still carry an 'award' digit after the weapon. It was removed
// (no award weapons any more): migrate() decodes old strings with this order and drops the award digit.
export const LEGACY_GEAR_FIELDS = Object.freeze({ trooper: Object.freeze(['helm', 'armor', 'pads', 'weapon', 'award', 'side', 'expl', 'gadget', 'extra', 'banner', 'skin']), tank: GEAR_FIELDS.tank });
// basic, cheapest figure every new unit starts with (Chumi: "no preset units")
export const BASIC_GEAR = Object.freeze({
  trooper: Object.freeze({ helm: 'dome', armor: 'standard', pads: 'none', weapon: 'rifle', side: 'rifle-pistol', expl: 'thermal', gadget: 'none', extra: 'none', banner: 'none', skin: 'skin-2' }),
  tank: Object.freeze({ hull: 'light', drive: 'treads', turret: 'dome', gun: 'cannon', antenna: 'none', skirts: 'none', smoke: 'none', mg: 'none', pennant: 'none' }),
});

// ---------- id <-> index ----------
export function toIndex(kind, gear = {}) { // gear ids → { field: index } (unknown id → basic item)
  const out = {};
  for (const f of GEAR_FIELDS[kind]) { const list = ITEMS[kind][f]; let i = list.findIndex((x) => x.id === gear[f]); if (i < 0) i = list.findIndex((x) => x.id === BASIC_GEAR[kind][f]); out[f] = Math.max(0, i); }
  return out;
}
export function toGear(kind, st = {}) { // { field: index } → gear ids
  const out = {};
  for (const f of GEAR_FIELDS[kind]) { const list = ITEMS[kind][f], i = st[f]; out[f] = (Number.isInteger(i) && list[i] ? list[i] : list.find((x) => x.id === BASIC_GEAR[kind][f])).id; }
  return out;
}
// gear-id object → index state. Decided on the gear fields only (index states may carry other string keys: nation colors, ids…)
const asIndex = (kind, g) => (g && Object.keys(ITEMS[kind] || {}).some((f) => typeof g[f] === 'string') ? toIndex(kind, g) : g || {});

// ---------- cost (Conquest command points) — identical to Conquest v2.3 cost.js ----------
// cost[i] / power[i] = extra for option index i (0 = included in base). Fields not listed are cosmetic and free.
export const COST = {
  trooper: {
    base: 100, power: 10,
    options: {
      helm: { cost: [0, 0, 0, 0, 5], power: [0, 0, 0, 0, 1] },
      armor: { cost: [0, 45], power: [0, 9] },
      pads: { cost: [0, 5, 8], power: [0, 1, 2] },
      weapon: { cost: [0, 60, 45, 20, 55, 50], power: [0, 10, 8, 5, 9, 8] },
      side: { cost: [0, 10], power: [0, 2] },
      expl: { cost: [0, 15, 20, 15], power: [0, 3, 4, 3] },
      gadget: { cost: [0, 50, 30, 40, 25, 35, 45], power: [0, 8, 4, 6, 3, 5, 7] },
      extra: { cost: [0, 0, 0], power: [0, 0, 0] },
      banner: { cost: [0, 0], power: [0, 0] },
      skin: { cost: [0, 0, 0, 0, 0], power: [0, 0, 0, 0, 0] },
    },
  },
  tank: {
    base: 400, power: 50,
    options: {
      hull: { cost: [0, 80, 180], power: [0, 15, 35] },
      drive: { cost: [0, 120], power: [0, 10] },
      turret: { cost: [0, 10, 20], power: [0, 2, 4] },
      gun: { cost: [0, 60, 140, 110], power: [0, 12, 28, 22] },
      antenna: { cost: [0, 15], power: [0, 3] },
      skirts: { cost: [0, 30], power: [0, 6] },
      smoke: { cost: [0, 25], power: [0, 4] },
      mg: { cost: [0, 35], power: [0, 7] },
      pennant: { cost: [0, 0], power: [0, 0] },
    },
  },
};
// HP + speed (RTS m/s, before the battle speed factor) — identical to Conquest v2.3 cost.js STATS
export const STATS = {
  trooper: { hp: 100, speed: 5.0, mods: { armor: { hp: [0, 60], speed: [0, -1.4] }, weapon: { speed: [0, -0.3, 0, 0, -0.5, 0] }, gadget: { speed: [0, 0, 0, 1.5, 0, 0, 0] } } },
  tank: { hp: 400, speed: 3.0, mods: { hull: { hp: [0, 150, 350], speed: [0, -0.4, -0.9] }, drive: { speed: [0, 1.2] }, skirts: { hp: [0, 50] } } },
};
// Battle rules — Conquest v2.3 data.js statsOf + sim.js
export const BATTLE = Object.freeze({
  speedMul: 0.9,            // statsOf: speed * 0.9
  padsHp: [0, 5, 10],       // statsOf: hp + pads bonus
  accBase: 0.5, accPerPower: 0.002, accMaxBonus: 0.12, // acc = 0.5 + min(0.12, power * 0.002)
  hitInCover: 0.7,          // sim.fire: target popped up behind cover → hit chance ×0.7
  hitCrouch: 0.85,          // crouched (nest) → ×0.85
  hitMoving: 0.9,           // moving target → ×0.9
  rangeFalloff: 0.45,       // hit chance × (1 - 0.45 * dist / range)
  splashFalloff: 0.6,       // splash dmg × (1 - 0.6 * dist / radius)
  splashDuckInCover: 0.5,   // ducked in cover → splash ×0.5
  dmgSpread: [0.85, 1.15],  // each hit = dmg × 0.85…1.15
  rofSpread: [0.85, 1.15],
  regen: 0.05,              // Conquest CFG.regen (HP/s fraction out of combat)
  mine: Object.freeze({ dmg: 70, r: 1.8, splash: 3.2, max: 12, arm: 1, plant: 1.2 }),
});
// Main weapon battle numbers — Conquest v2.3 data.js WEAPONS (index = weapon item order)
export const WEAPONS = Object.freeze([
  { id: 'rifle', kind: 'rifle', range: 28, rof: 0.55, dmg: 11, splash: 0 },
  { id: 'rocket', kind: 'rocket', range: 30, rof: 2.6, dmg: 55, splash: 3.2 },
  { id: 'sniper', kind: 'rifle', range: 42, rof: 1.6, dmg: 34, splash: 0, laser: 1 },
  { id: 'shotgun', kind: 'rifle', range: 15, rof: 0.9, dmg: 24, splash: 0 },
  { id: 'chaingun', kind: 'rifle', range: 24, rof: 0.16, dmg: 4.2, splash: 0 },
  { id: 'emp', kind: 'rocket', range: 22, rof: 2.0, dmg: 24, splash: 2.4 },
].map(Object.freeze));
// Magazines, reload and pickups: ONE table for Conquest (conquest-commander/js/pickups.js, only with ?pickups=1 / ?brains=1)
// and the customizer's 🥊 Combat / 👥 Team demos (trooper-custom/js/arena.js). Not in Conquest v2.3 itself.
// mag[i] = rounds per magazine for WEAPONS[i]; reserveMags = spare magazines carried (and refilled by a 📦 pack).
export const MAGS = Object.freeze({
  mag: Object.freeze([12, 2, 5, 6, 40, 4]),   // rifle, rocket, sniper, shotgun, chaingun, emp
  magDefault: 10,                             // unknown weapon
  tankMag: 6,                                 // tank guns (Conquest tanks + demos)
  reserveMags: 8,                             // spare magazines
  reload: 1.6,                                // seconds to reload
  healthPack: 50,                             // ❤ pack heals +50 HP
  respawn: 10,                                // seconds until a taken ❤ / 📦 pack comes back
});
// Tank guns: Conquest tanks (sim.js) + the customizer demos. shell = splash round, rail / beam = instant hit.
export const TANK_WEAPONS = Object.freeze([
  { id: 'cannon', kind: 'shell', range: 40, rof: 2.8, dmg: 60, splash: 2.5 },
  { id: 'twin', kind: 'shell', range: 36, rof: 1.6, dmg: 38, splash: 2.0 },
  { id: 'railgun', kind: 'rail', range: 60, rof: 4.0, dmg: 120, splash: 0.8 },
  { id: 'laser', kind: 'beam', range: 45, rof: 0.5, dmg: 16, splash: 0 },
].map(Object.freeze));
// Tanks in Conquest (SWBF2 armor, kept simple): drive to the priority post, shoot, can be destroyed, respawn on waves for
// tickets + CP. They do not capture posts. Rifle / pistol / turret hits do armorMul damage; rockets, EMP, explosives full.
export const TANK_RULES = Object.freeze({ maxPerTeam: 2, armorMul: 0.35, empStun: 2.5, detpackMul: 2, capture: false });
// Sidearm (index = side item order): fires while the main weapon reloads (or is out of ammo).
export const SIDEARMS = Object.freeze([
  { id: 'rifle-pistol', range: 18, rof: 0.6, dmg: 8 },
  { id: 'commando-pistol', range: 20, rof: 0.45, dmg: 11 },
].map(Object.freeze));
// Explosive (index = expl item order). count = uses per life. Conquest + the demos use these numbers.
//  thermal: thrown at an enemy within range, explodes after fuse · mines: planted at your own post (sim mine rules)
//  detpack: placed at a tank / enemy group within range, set off after fuse (tank damage × TANK_RULES.detpackMul)
//  time-bomb: planted while taking an enemy-held or neutral post, explodes after fuse
export const EXPLOSIVES = Object.freeze([
  { id: 'thermal', use: 'throw', count: 2, range: 14, fuse: 1.2, dmg: 60, splash: 3.5, cd: 6 },
  { id: 'mines', use: 'plant', count: 2, range: 0, fuse: 0, dmg: 70, splash: 3.2, cd: 4 },
  { id: 'detpack', use: 'place', count: 1, range: 8, fuse: 1.5, dmg: 110, splash: 4, cd: 8 },
  { id: 'time-bomb', use: 'plant', count: 1, range: 0, fuse: 6, dmg: 150, splash: 5, cd: 10 },
].map(Object.freeze));
// Gadget (index = gadget item order). once = one deploy per life. Conquest + the demos.
export const GADGETS = Object.freeze([
  { id: 'none' },
  { id: 'turret', use: 'deploy', once: true, hp: 150, life: 40, range: 26, rof: 0.5, dmg: 8 },
  { id: 'recon-bot', use: 'deploy', once: true, hp: 40, life: 30, range: 16, rof: 0.8, dmg: 5, spotR: 18, spotAcc: 0.08 },
  { id: 'jetpack', use: 'passive' },
  { id: 'fusion-cutter', use: 'passive', repairR: 6, repairHp: 20 },
  { id: 'supply', use: 'deploy', once: true, hp: 80, life: 30, r: 5, healHp: 8, ammo: true },
  { id: 'rally', use: 'deploy', once: true, life: 8, r: 10, dmgTaken: 0.75 },
].map(Object.freeze));

// ---------- classes + traits — Conquest v2.3 data.js classOf, traits.js ----------
export const CLASSES = ['trooper', 'heavy', 'engineer', 'sniper', 'commander', 'jet'];
export const CLASS_INFO = Object.freeze({
  trooper: { i: 'T', n: 'Trooper' }, heavy: { i: 'H', n: 'Heavy' }, engineer: { i: 'E', n: 'Engineer' },
  sniper: { i: 'S', n: 'Sniper' }, commander: { i: 'C', n: 'Commander' }, jet: { i: 'J', n: 'Jet' }, tank: { i: 'K', n: 'Tank' },
});
// rocket → heavy · sniper → sniper · jetpack or EMP → jet · rally or chaingun → commander · fusion or shotgun → engineer · else trooper
export function classOf(kind, gear) {
  if (kind === 'tank') return 'tank';
  const st = asIndex('trooper', gear);
  if (st.weapon === 1) return 'heavy';
  if (st.weapon === 2) return 'sniper';
  if (st.gadget === 3 || st.weapon === 5) return 'jet';
  if (st.gadget === 6 || st.weapon === 4) return 'commander';
  if (st.gadget === 4 || st.weapon === 3) return 'engineer';
  return 'trooper';
}
export const TRAITS = Object.freeze([
  { id: 'rusher', icon: 'Rush', name: 'Rusher', long: 'Rusher' },
  { id: 'cover', icon: 'Cover', name: 'Cover', long: 'Cover Fighter' },
  { id: 'sniper', icon: 'Snipe', name: 'Sniper', long: 'Sniper Spot' },
  { id: 'retaker', icon: 'Retake', name: 'Retaker', long: 'Retaker' },
  { id: 'supplier', icon: 'Supply', name: 'Supplier', long: 'Supplier' },
  { id: 'mines', icon: 'Mines', name: 'Mines', long: 'Mine Layer' },
  { id: 'guard', icon: 'Guard', name: 'Guard', long: 'Guard' },
].map(Object.freeze));
export const TRAIT_IDS = TRAITS.map((t) => t.id);
export const CLASS_TRAIT = Object.freeze({ trooper: 'rusher', heavy: 'cover', sniper: 'sniper', engineer: 'supplier', commander: 'rusher', jet: 'rusher', tank: 'rusher' });
const TB = { cover: 0.5, coverR: 9, hold: 3, fight: 0.5, retakeR: 60 };
// numbers the Conquest sim reads (traits.js TRAIT_FX)
export const TRAIT_FX = Object.freeze({
  rusher: { ...TB, cover: 0.12, coverR: 5, hold: 1.5, fight: 0.85, coverMax: 4 },
  cover: { ...TB, cover: 1, coverR: 15, hold: 7, fight: 0.25 },
  sniper: { ...TB, cover: 0.3, coverR: 7, hold: 4, fight: 0.3, nest: true, nestMin: 60, nestMax: 120, nestNear: 14 },
  retaker: { ...TB, retakeR: 100, retakeHot: true, retakePull: 1 },
  supplier: { ...TB, heal: true, healR: 6, healHp: 5, seekR: 28 },
  mines: { ...TB, mines: 3 },
  guard: { ...TB, cover: 0.7, coverR: 7, hold: 4, fight: 0.4, guard: true },
});
// unit.traits[] → the trait a game should run (first valid id, else the class default)
export const traitOf = (traits, cls) => (Array.isArray(traits) ? traits : [traits]).find((t) => TRAIT_IDS.includes(t)) || CLASS_TRAIT[cls] || 'rusher';

// ---------- helpers ----------
// unitCost(unit) / unitStats(unit) take an army-save unit { kind, gear }. Legacy form (kind, indexState) still works.
const norm = (a, b) => (typeof a === 'string' ? [a, asIndex(a, b)] : [a.kind || 'trooper', asIndex(a.kind || 'trooper', a.gear)]);
export function unitCost(a, b) {
  const [kind, st] = norm(a, b), c = COST[kind]; let cost = c.base, power = c.power;
  for (const [k, o] of Object.entries(c.options)) { cost += o.cost[st[k]] || 0; power += (o.power && o.power[st[k]]) || 0; }
  return { cost, power };
}
export function unitStats(a, b) { // customizer HP / speed (before battle factors)
  const [kind, st] = norm(a, b), s = STATS[kind]; let hp = s.hp, speed = s.speed;
  for (const [k, m] of Object.entries(s.mods)) { hp += (m.hp && m.hp[st[k]]) || 0; speed += (m.speed && m.speed[st[k]]) || 0; }
  return { hp, speed: Math.round(speed * 10) / 10 };
}
// combatStats(unit): exactly what Conquest's battle uses (data.js statsOf) — hp, speed m/s, dmg, range m, rof s, splash m, acc 0..1
export function combatStats(a, b) {
  const [kind, st] = norm(a, b), { cost, power } = unitCost(kind, st), { hp, speed } = unitStats(kind, st);
  if (kind === 'tank') { const w = TANK_WEAPONS[st.gun] || TANK_WEAPONS[0]; return { kind, cls: 'tank', cost, power, hp, speed: speed * BATTLE.speedMul, acc: BATTLE.accBase + Math.min(BATTLE.accMaxBonus, power * BATTLE.accPerPower), weapon: w.kind, ...w, laser: w.kind === 'beam' || w.kind === 'rail', dps: w.dmg / w.rof }; }
  const w = WEAPONS[st.weapon] || WEAPONS[0], dmg = w.dmg;
  return { kind, cls: classOf(kind, st), cost, power, hp: hp + (BATTLE.padsHp[st.pads || 0] || 0), speed: speed * BATTLE.speedMul, acc: BATTLE.accBase + Math.min(BATTLE.accMaxBonus, power * BATTLE.accPerPower), weapon: w.kind, id: w.id, range: w.range, rof: w.rof, splash: w.splash, laser: !!w.laser, emp: w.id === 'emp', dmg, dps: dmg / w.rof,
    side: SIDEARMS[st.side] || SIDEARMS[0], expl: EXPLOSIVES[st.expl] || EXPLOSIVES[0], gadget: GADGETS[st.gadget] || GADGETS[0] };
}
const sgn = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d).replace(/\.0+$/, '');
// gearLines(kind, field, index|id) → short icon strings describing what the item does in battle (real numbers).
// Icons mean one thing each: 💥 damage · 📏 range · ⏱ time between shots / fuse · 💫 blast radius · ❤ HP · 🏃 speed · ⚡ power · 💰 cost
export const GEAR_EFFECT = Object.freeze({
  side: (s) => `fires while reloading · dmg ${s.dmg} · ${s.range} m · ${s.rof} s`,
  expl: {
    thermal: (e) => `thrown ×${e.count} per life · dmg ${e.dmg} · blast ${e.splash} m · ${e.range} m`,
    mines: (e) => `planted ×${e.count} at your post · dmg ${e.dmg} · blast ${e.splash} m`,
    detpack: (e) => `placed + set off ×${e.count} · dmg ${e.dmg} (×${TANK_RULES.detpackMul} vs tanks) · blast ${e.splash} m`,
    'time-bomb': (e) => `planted at enemy posts ×${e.count} · dmg ${e.dmg} after ${e.fuse} s · blast ${e.splash} m`,
  },
  gadget: {
    none: () => '∅ no gadget',
    turret: (g) => `deploys a turret · HP ${g.hp} · dmg ${g.dmg} · ${g.range} m · ${g.life} s`,
    'recon-bot': (g) => `bot flies along · dmg ${g.dmg} · team aim +${Math.round(g.spotAcc * 100)}% near it · ${g.life} s`,
    jetpack: () => 'faster on foot',
    'fusion-cutter': (g) => `repairs tanks + turrets · +${g.repairHp} HP/s · ${g.repairR} m`,
    supply: (g) => `crate heals +${g.healHp} HP/s and refills ammo · ${g.r} m · ${g.life} s`,
    rally: (g) => `allies within ${g.r} m take −${Math.round((1 - g.dmgTaken) * 100)}% damage for ${g.life} s`,
  },
});
export function gearLines(kind, field, v) {
  const list = ITEMS[kind] && ITEMS[kind][field]; if (!list) return [];
  const i = typeof v === 'string' ? Math.max(0, list.findIndex((x) => x.id === v)) : v | 0, out = [];
  const m = STATS[kind].mods[field];
  if (m && m.hp && m.hp[i]) out.push('HP ' + sgn(m.hp[i], 0) + ' HP');
  if (m && m.speed && m.speed[i]) out.push('SPD ' + sgn(m.speed[i] * BATTLE.speedMul, 2) + ' m/s');
  const clsAfter = (f) => classOf('trooper', { ...toIndex('trooper', BASIC_GEAR.trooper), [f]: i });
  if (kind === 'trooper') {
    if (field === 'pads' && BATTLE.padsHp[i]) out.push('HP +' + BATTLE.padsHp[i] + ' HP');
    if (field === 'weapon') { const w = WEAPONS[i]; out.unshift(`dmg ${w.dmg}`, `${w.range} m`, `${w.rof} s`); if (w.splash) out.push(`blast ${w.splash} m`); if (w.id === 'emp') out.push(`stuns tanks ${TANK_RULES.empStun} s`); const cls = clsAfter('weapon'); if (cls !== 'trooper') out.push('→ ' + CLASS_INFO[cls].i + ' ' + CLASS_INFO[cls].n); }
    if (field === 'side') out.unshift(GEAR_EFFECT.side(SIDEARMS[i] || SIDEARMS[0]));
    if (field === 'expl') { const e = EXPLOSIVES[i] || EXPLOSIVES[0]; out.unshift(GEAR_EFFECT.expl[e.id](e)); }
    if (field === 'gadget') { const g = GADGETS[i] || GADGETS[0]; if (i) out.unshift(GEAR_EFFECT.gadget[g.id](g)); const cls = clsAfter('gadget'); if (cls !== 'trooper') out.push('→ ' + CLASS_INFO[cls].i + ' ' + CLASS_INFO[cls].n); }
  }
  if (kind === 'tank' && field === 'gun') { const w = TANK_WEAPONS[i]; out.push(`dmg ${w.dmg}`, `${w.range} m`, `${w.rof} s`); if (w.splash) out.push(`blast ${w.splash} m`); }
  const c = COST[kind].options[field]; const cost = c && c.cost[i];
  const statField = (m && (m.hp || m.speed)) || (kind === 'trooper' && ['pads', 'weapon'].includes(field));
  if (c && c.power && c.power[i]) out.push('PWR +' + c.power[i] + ' power');
  if (!out.length) out.push(statField ? 'base' : 'look only');
  if (cost) out.push('cost +' + cost);
  return out;
}
export const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : n.toLocaleString('en-US'));
