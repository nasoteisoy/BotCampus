// In-game cost, power, HP and speed. Chumi's rule: "The more or better stuff a unit has the more it will cost in game."
// cost[i] / power[i] = extra cost / power for option value i of that field (0 = included in the base).
// Fields not listed (and all nation fields: colors, suit, flag, glow) are cosmetic and free.
export const MEDALS_NEEDED = 64; // same medal earned 64 times unlocks a weapon's ⭐ award version
export const COST = {
  trooper: {
    base: 100, power: 10,
    options: {
      helm: { cost: [0, 0, 0, 0, 5], power: [0, 0, 0, 0, 1] },          // dome/angular/crest/goggles free; recon sensor +5
      armor: { cost: [0, 45], power: [0, 9] },                           // standard / heavy
      pads: { cost: [0, 5, 8], power: [0, 1, 2] },                       // none / round / angular
      weapon: { cost: [0, 60, 45, 20, 55, 50], power: [0, 10, 8, 5, 9, 8] }, // blaster / rocket / sniper / shotgun / chaingun / EMP
      side: { cost: [0, 10], power: [0, 2] },                            // blaster pistol / commando pistol
      expl: { cost: [0, 15, 20, 15], power: [0, 3, 4, 3] },              // thermal / mines / detpacks / time bombs
      gadget: { cost: [0, 50, 30, 40, 25, 35, 45], power: [0, 8, 4, 6, 3, 5, 7] }, // none / turret / recon droid / jetpack / fusion cutter / health&ammo / rally
      extra: { cost: [0, 0, 0], power: [0, 0, 0] },                      // cape / scarf: cosmetic
      banner: { cost: [0, 0], power: [0, 0] },                           // back flag: cosmetic
      skin: { cost: [0, 0, 0, 0, 0], power: [0, 0, 0, 0, 0] },           // cosmetic
    },
    // ⭐ award version of the selected main weapon (only counts when unlocked): extra cost/power per weapon
    award: { cost: [30, 40, 35, 25, 40, 35], power: [3, 4, 4, 3, 4, 4] },
  },
  tank: {
    base: 400, power: 50,
    options: {
      hull: { cost: [0, 80, 180], power: [0, 15, 35] },          // light / medium / heavy
      drive: { cost: [0, 120], power: [0, 10] },                 // treads / hover
      turret: { cost: [0, 10, 20], power: [0, 2, 4] },           // dome / wedge / box
      gun: { cost: [0, 60, 140, 110], power: [0, 12, 28, 22] },  // cannon / twin / railgun / laser
      antenna: { cost: [0, 15], power: [0, 3] },
      skirts: { cost: [0, 30], power: [0, 6] },
      smoke: { cost: [0, 25], power: [0, 4] },
      mg: { cost: [0, 35], power: [0, 7] },
      pennant: { cost: [0, 0], power: [0, 0] },                  // cosmetic
    },
  },
};
// HP + speed (RTS units/s). Armor drives HP/speed; jetpack and heavy weapons nudge speed.
export const STATS = {
  trooper: { hp: 100, speed: 5.0, mods: { armor: { hp: [0, 60], speed: [0, -1.4] }, weapon: { speed: [0, -0.3, 0, 0, -0.5, 0] }, gadget: { speed: [0, 0, 0, 1.5, 0, 0, 0] } } },
  tank: { hp: 400, speed: 3.0, mods: { hull: { hp: [0, 150, 350], speed: [0, -0.4, -0.9] }, drive: { speed: [0, 1.2] }, skirts: { hp: [0, 50] } } },
};
export function unitCost(unit, st) {
  const c = COST[unit]; let cost = c.base, power = c.power;
  for (const [k, o] of Object.entries(c.options)) { cost += o.cost[st[k]] || 0; power += (o.power && o.power[st[k]]) || 0; }
  if (c.award && st.award) { cost += c.award.cost[st.weapon] || 0; power += c.award.power[st.weapon] || 0; }
  return { cost, power };
}
export function unitStats(unit, st) {
  const s = STATS[unit]; let hp = s.hp, speed = s.speed;
  for (const [k, m] of Object.entries(s.mods)) { hp += (m.hp && m.hp[st[k]]) || 0; speed += (m.speed && m.speed[st[k]]) || 0; }
  return { hp, speed: Math.round(speed * 10) / 10 };
}
export const optionCost = (unit, k, v) => (COST[unit] && COST[unit].options[k] ? COST[unit].options[k].cost[v] || 0 : 0);
export const awardCost = (w) => COST.trooper.award.cost[w] || 0;
export const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : n.toLocaleString('en-US');

// Names, icons and one-line RTS tooltips for every loadout item (shown on tiles + toasted on pick)
export const ITEMS = {
  armor: [
    { n: 'Standard', i: '🛡️', tip: 'Clone-white plates: balanced HP and speed.' },
    { n: 'Heavy', i: '🧱', tip: '+60 HP, but slower and bulkier.' },
  ],
  weapon: [
    { n: 'Blaster', i: '🔫', tip: 'Reliable all-round rifle, good vs infantry.' },
    { n: 'Rocket', i: '🚀', tip: 'Slow splash rockets that wreck tanks and turrets.' },
    { n: 'Sniper', i: '🎯', tip: 'Very long range, high damage, slow to fire.' },
    { n: 'Shotgun', i: '💥', tip: 'Huge damage up close, weak at range.' },
    { n: 'Chaingun', i: '🌀', tip: 'Spins up into a bullet storm; slows you down.' },
    { n: 'EMP', i: '⚡', tip: 'Stuns droids, tanks and turrets in an area.' },
  ],
  award: [
    { tip: '⭐ Award blaster: faster fire, gold trim.' },
    { tip: '⭐ Award rocket: bigger blast radius.' },
    { tip: '⭐ Award sniper: pierces through 2 targets.' },
    { tip: '⭐ Award shotgun: tighter spread, more range.' },
    { tip: '⭐ Award chaingun: no spin-up delay.' },
    { tip: '⭐ Award EMP: longer stun.' },
  ],
  side: [
    { n: 'Blaster', i: '🔫', tip: 'Backup pistol when the main weapon reloads.' },
    { n: 'Commando', i: '🎖️', tip: 'Harder-hitting pistol with a quick draw.' },
  ],
  expl: [
    { n: 'Thermal', i: '💣', tip: 'Thrown detonator: splash damage on a timer.' },
    { n: 'Mines', i: '⚠️', tip: 'Plant hidden mines that blow up enemies who step on them.' },
    { n: 'Detpack', i: '🧨', tip: 'Remote charge that cracks buildings and tanks.' },
    { n: 'Time bomb', i: '⏱️', tip: 'Big delayed blast: plant, run, boom.' },
  ],
  gadget: [
    { n: 'None', i: '∅', tip: 'No gadget: cheapest.' },
    { n: 'Turret', i: '🗼', tip: 'Deploys an auto turret that guards an area.' },
    { n: 'Droid', i: '🛸', tip: 'Remote recon droid scouts ahead and spots enemies.' },
    { n: 'Jetpack', i: '🚀', tip: 'Jump over walls and cliffs; +1.5 speed.' },
    { n: 'Fusion', i: '🔧', tip: 'Fusion cutter repairs tanks, turrets and gates.' },
    { n: 'Supply', i: '➕', tip: 'Drops a health & ammo crate for nearby allies.' },
    { n: 'Rally', i: '📣', tip: 'Rally call: nearby allies take less damage for a while.' },
  ],
};
