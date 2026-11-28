// Game data: hunters, ghosts, loot, floors and the elevator shop. Tuning lives here.
export const HUNTERS = [
  { id: 'ivy',   name: 'Ivy',   color: 0xff5a6e, css: '#ff5a6e', ability: 'strobe',  abilityName: 'Strobe',     cd: 14,
    short: 'Flash stuns every ghost near you',     long: 'A huge camera flash. Every ghost within 10 m is stunned at once, even big ones. Great before a team suck.' },
  { id: 'moss',  name: 'Moss',  color: 0x56d87e, css: '#56d87e', ability: 'turbo',   abilityName: 'Turbo suck', cd: 16,
    short: 'Vacuum ×2.5 and counts as two hunters', long: 'For 6 seconds your vacuum pulls 2.5× harder and counts as two hunters, so you can bag a big horned ghost alone.' },
  { id: 'juno',  name: 'Juno',  color: 0x52a8ff, css: '#52a8ff', ability: 'ward',    abilityName: 'Ward',       cd: 18,
    short: 'Bubble that ghosts cannot enter',      long: 'Drops a glowing bubble for 8 seconds. Ghosts are pushed out and cannot hit anyone inside. Good for hauling past a crowd.' },
  { id: 'bram',  name: 'Bram',  color: 0xffa63d, css: '#ffa63d', ability: 'mend',    abilityName: 'Mend',       cd: 15,
    short: 'Heal and revive friends near you',      long: 'Every hunter within 6 m gets full hearts, and spooked hunters near you stand right back up.' },
  { id: 'pip',   name: 'Pip',   color: 0xffd84a, css: '#ffd84a', ability: 'lantern', abilityName: 'Lantern',    cd: 14,
    short: 'Show all ghosts and loot through walls', long: 'For 8 seconds the whole team sees every ghost, every valuable and the way to the elevator, through walls.' },
  { id: 'ozzie', name: 'Ozzie', color: 0xc77dff, css: '#c77dff', ability: 'dash',    abilityName: 'Dash',       cd: 8,
    short: 'Burst forward, then run fast',          long: 'A quick burst forward, then 5 seconds of extra speed. Hauling loot keeps the boost.' },
];

export const GHOSTS = {
  wisp:  { name: 'Wisp',        hp: 1,   need: 1, speed: 2.6, size: 0.55, bounty: 20,  color: 0x8fefff, dmg: 1 },
  puff:  { name: 'Puff',        hp: 1.6, need: 1, speed: 2.0, size: 0.8,  bounty: 35,  color: 0xc6a6ff, dmg: 1 },
  horn:  { name: 'Horned ghost', hp: 3,  need: 2, speed: 1.6, size: 1.15, bounty: 90, color: 0xff94bd, dmg: 1 },
  gold:  { name: 'Gold ghost',  hp: 1.6, need: 1, speed: 3.2, size: 0.7,  bounty: 150, color: 0xffd34d, dmg: 0 },
  boss:  { name: 'The Night Manager', hp: 3, need: 2, speed: 1.5, size: 2.2, bounty: 300, color: 0x7dffb2, dmg: 1 },
};

// weight: 1 light, 1.5 medium (slows you), 3 heavy (needs two hunters to lift)
export const LOOT = {
  vase:    { name: 'Vase',          value: [70, 120],  fragile: 1.0, weight: 1,   r: 0.26 },
  orb:     { name: 'Crystal ball',  value: [120, 190], fragile: 1.4, weight: 1,   r: 0.24 },
  frame:   { name: 'Painting',      value: [80, 140],  fragile: 0.5, weight: 1,   r: 0.32 },
  trophy:  { name: 'Trophy',        value: [90, 160],  fragile: 0.3, weight: 1,   r: 0.24 },
  musicbox:{ name: 'Music box',     value: [60, 100],  fragile: 0.8, weight: 1,   r: 0.22 },
  bars:    { name: 'Gold bars',     value: [170, 240], fragile: 0.1, weight: 1.5, r: 0.3  },
  clock:   { name: 'Grand clock',   value: [320, 440], fragile: 0.6, weight: 3,   r: 0.5  },
  throne:  { name: 'Golden toilet', value: [280, 400], fragile: 0.3, weight: 3,   r: 0.48 },
};

export const FLOOR_TYPES = {
  hunt:     { name: 'Ghost Hunt',    icon: 'ghost', goal: 'Bag ghosts and haul loot',          quotaMul: 1.0 },
  rescue:   { name: 'Rescue',        icon: 'cage',  goal: 'Free the guests in purple cages',   quotaMul: 1.0 },
  treasure: { name: 'Treasure Rush', icon: 'coin',  goal: 'Lots of loot, catch the gold ghost', quotaMul: 1.35 },
  boss:     { name: 'Boss Floor',    icon: 'crown', goal: 'Bag the Night Manager',             quotaMul: 0.7 },
};

export const TOWER_SIZES = [5, 10, 15];

export const SHOP = [
  { id: 'heal',   name: 'Snack pack',   icon: 'heart', base: 60,  step: 0,   max: 99, desc: 'Every hunter back to full hearts (spooked hunters stand up).' },
  { id: 'tank',   name: 'Bigger tank',  icon: 'vac',   base: 120, step: 80,  max: 4,  desc: 'Vacuums pull 25% harder for the rest of the run.' },
  { id: 'beam',   name: 'Long beam',    icon: 'beam',  base: 100, step: 70,  max: 3,  desc: 'Flashlights reach 2 m farther and stun faster.' },
  { id: 'shoes',  name: 'Sneakers',     icon: 'shoe',  base: 90,  step: 60,  max: 3,  desc: 'Everyone walks 10% faster.' },
  { id: 'pad',    name: 'Bubble wrap',  icon: 'box',   base: 110, step: 80,  max: 3,  desc: 'Loot loses 30% less value when bumped or dropped.' },
  { id: 'clock',  name: 'Extra time',   icon: 'clock', base: 80,  step: 60,  max: 4,  desc: '+20 seconds on every floor timer.' },
  { id: 'cool',   name: 'Quick charge', icon: 'bolt',  base: 100, step: 80,  max: 3,  desc: 'Abilities recharge 20% faster.' },
];

export const T = {
  roomSize: 8, wallH: 3.2, wallT: 0.3, doorW: 2.2, doorH: 2.5,
  eye: 1.55, playerR: 0.35, walk: 4.2, gravity: 18, jumpV: 5.6,
  maxHearts: 3, reviveTime: 2.5, reviveRange: 1.8,
  lightRange: 10, lightCone: 0.32, stunRate: 1.6, stunTime: 3.2,
  suckRange: 7.5, suckCone: 0.42, suckPower: 0.75,
  grabRange: 3.0, holdDist: 1.5,
  breakSpeed: 4.6, lootGravity: 12,
  shopTime: 35, liftTime: 3,
};

export function floorTypeFor(n, total, rng, prev) {
  if (n % 5 === 0 || n === total) return 'boss';
  if (n === 1) return 'hunt';
  const opts = ['hunt', 'rescue', 'treasure'].filter((t) => t !== prev);
  return rng.pick(opts);
}

export function quotaFor(n, type) {
  return Math.round(((260 + 130 * (n - 1)) * FLOOR_TYPES[type].quotaMul) / 10) * 10;
}

export function timeFor(n, type, extra) {
  const base = type === 'boss' ? 210 : 165;
  return base + Math.min(60, (n - 1) * 6) + extra * 20;
}

export function shopPrice(item, owned) { return item.base + item.step * owned; }
