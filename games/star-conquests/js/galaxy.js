// Galaxy: ~10 planets with biomes and travel links.
// Layouts are viewport-aware so planet hitboxes never overlap.
export const BIOME_COLOR = {
  desert: '#c4a35a', ice: '#9ec9e8', jungle: '#3d9b5f',
  lava: '#d4542a', rock: '#8a7f72', ocean: '#2a6f9e',
};

export const BIOME_TEX = {
  desert: { a: '#e8c878', b: '#a87830', c: '#6a4820' },
  ice:    { a: '#e8f6ff', b: '#8ec4e8', c: '#3a6a90' },
  jungle: { a: '#7dce6a', b: '#2e7a40', c: '#134820' },
  lava:   { a: '#ffb040', b: '#d4542a', c: '#4a1810' },
  rock:   { a: '#c8b8a8', b: '#7a7068', c: '#3a3530' },
  ocean:  { a: '#6ad0e8', b: '#2a6f9e', c: '#0e3050' },
};

export const PLANETS = Object.freeze([
  Object.freeze({ id: 'solara', name: 'Solara', icon: '', biome: 'desert', size: 2, x: 14, y: 22,
    passive: { id: 'home', label: '+8 credits / turn', credits: 8 } }),
  Object.freeze({ id: 'frost', name: 'Frost', icon: '', biome: 'ice', size: 1, x: 50, y: 10,
    passive: { id: 'tickets', label: '+10% tickets in battle', ticketsMul: 1.1 } }),
  Object.freeze({ id: 'verdant', name: 'Verdant', icon: '', biome: 'jungle', size: 2, x: 84, y: 20,
    passive: { id: 'credits', label: '+12 credits / turn', credits: 12 } }),
  Object.freeze({ id: 'ember', name: 'Ember', icon: '', biome: 'lava', size: 2, x: 28, y: 42,
    passive: { id: 'fleet', label: '−20 fleet cost', fleetDiscount: 0.2 } }),
  Object.freeze({ id: 'basin', name: 'Basin', icon: '', biome: 'ocean', size: 3, x: 68, y: 40,
    passive: { id: 'credits', label: '+15 credits / turn', credits: 15 } }),
  Object.freeze({ id: 'granite', name: 'Granite', icon: '', biome: 'rock', size: 1, x: 12, y: 62,
    passive: { id: 'armor', label: '+1 armor on ground', armor: 1 } }),
  Object.freeze({ id: 'tide', name: 'Tide', icon: '', biome: 'ocean', size: 1, x: 48, y: 58,
    passive: { id: 'credits', label: '+6 credits / turn', credits: 6 } }),
  Object.freeze({ id: 'cinder', name: 'Cinder', icon: '', biome: 'lava', size: 2, x: 86, y: 62,
    passive: { id: 'attack', label: '+2 attack on ground', attack: 2 } }),
  Object.freeze({ id: 'glacier', name: 'Glacier', icon: '', biome: 'ice', size: 2, x: 30, y: 82,
    passive: { id: 'tickets', label: '+15% tickets in battle', ticketsMul: 1.15 } }),
  Object.freeze({ id: 'nexus', name: 'Nexus', icon: '', biome: 'rock', size: 3, x: 70, y: 84,
    passive: { id: 'credits', label: '+20 credits / turn', credits: 20 } }),
]);

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

/** Portrait phone: tall grid using full height (pct of map stage). */
export const PORTRAIT_POS = Object.freeze({
  solara:  { x: 16, y: 14 },
  frost:   { x: 50, y: 8 },
  verdant: { x: 84, y: 16 },
  ember:   { x: 30, y: 36 },
  basin:   { x: 70, y: 34 },
  granite: { x: 12, y: 56 },
  tide:    { x: 50, y: 52 },
  cinder:  { x: 88, y: 56 },
  glacier: { x: 28, y: 80 },
  nexus:   { x: 72, y: 82 },
});

/** Landscape short: wide spread. */
export const LANDSCAPE_POS = Object.freeze({
  solara:  { x: 6,  y: 48 },
  frost:   { x: 18, y: 18 },
  verdant: { x: 28, y: 72 },
  ember:   { x: 40, y: 38 },
  basin:   { x: 50, y: 78 },
  granite: { x: 55, y: 14 },
  tide:    { x: 64, y: 48 },
  cinder:  { x: 76, y: 78 },
  glacier: { x: 82, y: 20 },
  nexus:   { x: 94, y: 52 },
});

/** Desktop: roomy. */
export const PC_POS = Object.freeze({
  solara:  { x: 10, y: 50 },
  frost:   { x: 22, y: 18 },
  verdant: { x: 28, y: 72 },
  ember:   { x: 40, y: 40 },
  basin:   { x: 48, y: 78 },
  granite: { x: 55, y: 14 },
  tide:    { x: 62, y: 48 },
  cinder:  { x: 74, y: 78 },
  glacier: { x: 80, y: 22 },
  nexus:   { x: 92, y: 55 },
});

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

/** layout: 'portrait' | 'landscape' | 'pc' */
export function layoutMode(w, h) {
  if (w >= 900) return 'pc';
  if (w > h && h <= 520) return 'landscape';
  return 'portrait';
}

export function planetPos(p, layout) {
  const mode = typeof layout === 'string' ? layout
    : (layout ? 'landscape' : 'portrait');
  if (mode === 'landscape' && LANDSCAPE_POS[p.id]) return LANDSCAPE_POS[p.id];
  if (mode === 'pc' && PC_POS[p.id]) return PC_POS[p.id];
  if (PORTRAIT_POS[p.id]) return PORTRAIT_POS[p.id];
  return { x: p.x, y: p.y };
}
