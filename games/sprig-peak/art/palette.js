/**
 * Sprig Peak — cohesive ~32-color palette.
 * Light source: top-left. Use shadow→base→light→highlight ramps.
 * Colored outlines = darker hue of the fill (not pure black everywhere).
 * Mirrored exactly in tools/make-sprites.py COLORS.
 */
export const PALETTE = {
  // Core / ink
  void: '#0b0e18',
  ink: '#1a2030',
  inkSoft: '#2a3348',
  // Sky ramp (far→near atmospheric)
  skyDeep: '#3a6ea5',
  skyMid: '#5a9fd4',
  sky: '#7ec8f0',
  skyPale: '#c5e8fa',
  cloud: '#e8f4fc',
  // Mountains / parallax
  mtFar: '#6a8fb0',
  mtMid: '#4a6a58',
  mtNear: '#2f4a38',
  mtNearDk: '#1e3226',
  // Sprig hero
  skinSh: '#d4a07a',
  skin: '#f0c8a0',
  skinHi: '#ffe8d0',
  tunicSh: '#1a7a72',
  tunic: '#2eb8a8',
  tunicHi: '#5ee0d0',
  scarf: '#e85a6a',
  scarfDk: '#a83848',
  bootSh: '#c46a10',
  boot: '#f0a028',
  bootHi: '#ffd078',
  leafSh: '#2a8a38',
  leaf: '#46c050',
  leafHi: '#8aef70',
  // Enemies
  shellSh: '#5a3a22',
  shell: '#8a5a32',
  shellHi: '#c48a50',
  wingSh: '#5a3878',
  wing: '#8a5ab8',
  wingHi: '#c090e8',
  plantSh: '#2a6a28',
  plant: '#48a040',
  plantHi: '#78d060',
  // Hazards / metal
  metalSh: '#6a7080',
  metal: '#a0a8b8',
  metalHi: '#d8dce8',
  danger: '#e84848',
  dangerDk: '#a02828',
  // Earth / wood / gold
  dirtSh: '#3a2818',
  dirt: '#6a4830',
  dirtHi: '#9a7048',
  grassSh: '#2a6a28',
  grass: '#48a038',
  grassHi: '#78d058',
  woodSh: '#4a3018',
  wood: '#8a5a30',
  woodHi: '#c49058',
  goldSh: '#a87818',
  gold: '#f0c830',
  goldHi: '#fff0a0',
  // UI
  white: '#f8f8fc',
  heart: '#e84868',
  // Aliases used by game.js parallax / legacy draws
  skyTop: '#3a6ea5',
  skyBot: '#7ec8f0',
  bgForestFar: '#6a8fb0',
  bgForestMid: '#4a6a58',
  bgForestNear: '#2f4a38',
  body: '#2eb8a8',
  outline: '#1a2030',
};

/** Flat list of every palette hex for validation tests */
export const PALETTE_LIST = Object.values(PALETTE);

/** RGBA 0–255 tuples matching tools/make-sprites.py */
export function hexToRgba(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
}
export const RGBA = Object.fromEntries(
  Object.entries(PALETTE).map(([k, v]) => [k, hexToRgba(v)])
);
