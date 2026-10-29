// Galaxy: ~10 planets with biomes, icons, and travel links.
export const BIOME_COLOR = {
  desert: '#c4a35a', ice: '#9ec9e8', jungle: '#3d9b5f',
  lava: '#d4542a', rock: '#8a7f72', ocean: '#2a6f9e',
};

export const PLANETS = Object.freeze([
  Object.freeze({ id: 'solara', name: 'Solara', icon: '☀️', biome: 'desert', size: 2, x: 12, y: 52 }),
  Object.freeze({ id: 'frost', name: 'Frost', icon: '❄️', biome: 'ice', size: 1, x: 28, y: 22 }),
  Object.freeze({ id: 'verdant', name: 'Verdant', icon: '🌿', biome: 'jungle', size: 2, x: 38, y: 58 }),
  Object.freeze({ id: 'ember', name: 'Ember', icon: '🔥', biome: 'lava', size: 2, x: 48, y: 30 }),
  Object.freeze({ id: 'basin', name: 'Basin', icon: '🌊', biome: 'ocean', size: 3, x: 55, y: 68 }),
  Object.freeze({ id: 'granite', name: 'Granite', icon: '🪨', biome: 'rock', size: 1, x: 62, y: 18 }),
  Object.freeze({ id: 'tide', name: 'Tide', icon: '🏝️', biome: 'ocean', size: 1, x: 70, y: 48 }),
  Object.freeze({ id: 'cinder', name: 'Cinder', icon: '🌋', biome: 'lava', size: 2, x: 78, y: 72 }),
  Object.freeze({ id: 'glacier', name: 'Glacier', icon: '🧊', biome: 'ice', size: 2, x: 82, y: 28 }),
  Object.freeze({ id: 'nexus', name: 'Nexus', icon: '🌀', biome: 'rock', size: 3, x: 90, y: 55 }),
]);

// Undirected travel links between planets
export const LINKS = Object.freeze([
  ['solara', 'frost'], ['solara', 'verdant'],
  ['frost', 'ember'], ['frost', 'granite'],
  ['verdant', 'ember'], ['verdant', 'basin'],
  ['ember', 'basin'], ['ember', 'granite'], ['ember', 'tide'],
  ['basin', 'tide'], ['basin', 'cinder'],
  ['granite', 'glacier'], ['granite', 'tide'],
  ['tide', 'glacier'], ['tide', 'cinder'], ['tide', 'nexus'],
  ['cinder', 'nexus'], ['glacier', 'nexus'],
]);

export const HOME_PLAYER = 'solara';
export const CAPTURE_BONUS = 25;

export function planetById(id) {
  return PLANETS.find((p) => p.id === id);
}

export function neighbors(id) {
  const out = [];
  for (const [a, b] of LINKS) {
    if (a === id) out.push(b);
    else if (b === id) out.push(a);
  }
  return out;
}

export function areLinked(a, b) {
  return LINKS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
