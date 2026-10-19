// In-game cost + power rating. Chumi's rule: "The more or better stuff a unit has the more it will cost in game."
// cost[i] / power[i] = extra cost / power for option value i of that field (0 = included in the base).
// Fields not listed here (and all nation fields: colors, suit, flag, glow) are cosmetic and free.
export const COST = {
  trooper: {
    base: 100, power: 10,
    options: {
      helm: { cost: [0, 0, 0, 0, 5], power: [0, 0, 0, 0, 1] },   // dome/angular/crest/goggles free; recon sensor +5
      armor: { cost: [0, 20, 45], power: [0, 4, 9] },             // light / medium / heavy
      pads: { cost: [0, 5, 8], power: [0, 1, 2] },                // none / round / angular
      pack: { cost: [0, 40, 25, 15], power: [0, 6, 3, 4] },       // none / jetpack / radio / ammo
      rifle: { cost: [0, 25, 15], power: [0, 6, 3] },             // carbine / long laser / bullpup
      extra: { cost: [0, 0, 0], power: [0, 0, 0] },               // cape / scarf: cosmetic
      banner: { cost: [0, 0], power: [0, 0] },                    // back flag: cosmetic
      skin: { cost: [0, 0, 0, 0, 0], power: [0, 0, 0, 0, 0] },    // cosmetic
    },
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
export function unitCost(unit, st) {
  const c = COST[unit]; let cost = c.base, power = c.power;
  for (const [k, o] of Object.entries(c.options)) { cost += o.cost[st[k]] || 0; power += (o.power && o.power[st[k]]) || 0; }
  return { cost, power };
}
export const optionCost = (unit, k, v) => (COST[unit] && COST[unit].options[k] ? COST[unit].options[k].cost[v] || 0 : 0);
export const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : n.toLocaleString('en-US');
