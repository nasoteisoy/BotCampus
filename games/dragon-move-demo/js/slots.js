// Island layout, shared by the page and the build step. Both islands use exactly this layout.
// A slot is only spawned when the build step found and optimized its file (models/manifest.json).
// Realistic dragons use the cute layout with slightly widened spawn slots so the longer bodies fit.
export const TOOLS = ['meshy', 'tripo'];
export const STYLES = ['cute', 'real'];
export const MANIFEST = { cute: 'models/manifest.json', real: 'models-real/manifest.json' };
const PROPS = [
  { id: 'nest', file: '08_nest.glb', kind: 'prop', height: 0.32, pos: [-0.9, -2.6], yaw: 0, radius: 0.45 },
  { id: 'egg', file: '04_egg.glb', kind: 'prop', height: 0.36, pos: [-0.9, -2.6], yaw: 0, radius: 0, sitOn: 'nest' },
  { id: 'chest', file: '05_chest.glb', kind: 'prop', height: 0.55, pos: [3.4, 2.0], yaw: -0.9, radius: 0.5 },
  { id: 'tree', file: '06_tree.glb', kind: 'prop', height: 3.0, pos: [-3.6, -2.4], yaw: 0.3, radius: 0.45 },
  { id: 'rock', file: '07_rock.glb', kind: 'prop', height: 0.8, pos: [3.2, -2.9], yaw: 1.1, radius: 0.6 },
];
export const CUTE_SLOTS = [
  { id: 'pink', file: '01_dragon_pink.glb', kind: 'dragon', label: 'Pink', color: '#ff8fa3', pos: [0, 1.4], yaw: 0 },
  { id: 'mint', file: '02_dragon_mint.glb', kind: 'dragon', label: 'Mint', color: '#7fe0b8', pos: [-2.3, -0.2], yaw: 0.5 },
  { id: 'lavender', file: '03_dragon_lavender.glb', kind: 'dragon', label: 'Lavender', color: '#b9a3ff', pos: [2.3, -0.4], yaw: -0.5 },
  ...PROPS,
];
export const REAL_SLOTS = [
  { id: 'red', file: '01_dragon_red.glb', kind: 'dragon', label: 'Red', color: '#e23d2b', pos: [0, 1.57], yaw: 0 },
  { id: 'green', file: '02_dragon_green.glb', kind: 'dragon', label: 'Green', color: '#2fa84a', pos: [-2.65, -0.27], yaw: 0.5 },
  { id: 'purple', file: '03_dragon_purple.glb', kind: 'dragon', label: 'Purple', color: '#7a3dff', pos: [2.65, -0.5], yaw: -0.5 },
  ...PROPS,
];
export const SLOTS = CUTE_SLOTS;
export const SLOTS_BY_STYLE = { cute: CUTE_SLOTS, real: REAL_SLOTS };
export const STYLE_PAIR = { pink: 'red', mint: 'green', lavender: 'purple', red: 'pink', green: 'mint', purple: 'lavender' };
export function mapSlot(id, style) {
  const slots = SLOTS_BY_STYLE[style];
  if (slots.some((s) => s.id === id)) return id;
  const alt = STYLE_PAIR[id];
  if (alt && slots.some((s) => s.id === alt)) return alt;
  return (slots.find((s) => s.kind === 'dragon') || slots[0]).id;
}
export const CLIPS = ['idle', 'walk', 'run', 'fly', 'takeoff', 'land', 'fire_breath', 'look_around', 'sleep', 'happy'];
