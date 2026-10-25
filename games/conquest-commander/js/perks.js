// Pre-battle perks (like SWBF2 Galactic Conquest bonuses). They last one battle only.
export const PERKS = [
  { id: 'tickets', icon: '🎟️', name: 'Reinforcements', short: '+50 🎟️', price: 400 },
  { id: 'armor', icon: '🛡️', name: 'Combat Armor', short: '+25% ❤️', price: 500 },
  { id: 'weapon', icon: '💥', name: 'Weapon Boost', short: '+20% 💥', price: 500 },
  { id: 'capture', icon: '🚩', name: 'Fast Capture', short: '+50% 🚩', price: 300 },
  { id: 'deploy', icon: '⏩', name: 'Quick Deploy', short: '-40% ⏱️', price: 300 },
  { id: 'army', icon: '👥', name: 'Bigger Army', short: '+4 🪖', price: 700 },
  { id: 'elite', icon: '⭐', name: 'Elites from the start', short: '⭐🛩️ at once', price: 400 },
  { id: 'garrison', icon: '🏰', name: 'Garrison', short: '🚩 mid + 4 🪖', price: 600 },
  { id: 'sabotage', icon: '🧨', name: 'Sabotage', short: '-25 🎟️ 🔴', price: 450 },
  { id: 'warchest', icon: '💰', name: 'War Chest', short: '+1000 ⭐', price: 350 },
];
export const PERK = Object.fromEntries(PERKS.map((p) => [p.id, p]));

// effect numbers the sim reads (one team's perk list → modifiers)
export function perkMods(ids = []) {
  const has = (k) => ids.includes(k);
  return {
    tickets: has('tickets') ? 50 : 0,
    hpMul: has('armor') ? 1.25 : 1,
    dmgMul: has('weapon') ? 1.2 : 1,
    capMul: has('capture') ? 1.5 : 1,
    waveMul: has('deploy') ? 0.6 : 1,
    live: has('army') ? 24 : 0,
    elite: has('elite'),
    garrison: has('garrison'),
    sabotage: has('sabotage') ? 25 : 0,
    cp: has('warchest') ? 1000 : 0,
  };
}
