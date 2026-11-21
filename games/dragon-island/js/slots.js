// Island layout. A slot is only spawned when the manifest lists its file (models/manifest.json).
const PROPS = [
  { id: 'nest', file: '08_nest.glb', kind: 'prop', height: 0.32, pos: [-0.9, -2.6], yaw: 0, radius: 0.45 },
  { id: 'egg', file: '04_egg.glb', kind: 'prop', height: 0.36, pos: [-0.9, -2.6], yaw: 0, radius: 0, sitOn: 'nest' },
  { id: 'chest', file: '05_chest.glb', kind: 'prop', height: 0.55, pos: [3.4, 2.0], yaw: -0.9, radius: 0.5 },
  { id: 'tree', file: '06_tree.glb', kind: 'prop', height: 3.0, pos: [-3.6, -2.4], yaw: 0.3, radius: 0.45 },
  { id: 'rock', file: '07_rock.glb', kind: 'prop', height: 0.8, pos: [3.2, -2.9], yaw: 1.1, radius: 0.6 },
];
export const REAL_SLOTS = [
  { id: 'red', file: '01_dragon_red.glb', kind: 'dragon', label: 'Red', color: '#e23d2b', pos: [0, 1.57], yaw: 0 },
  { id: 'green', file: '02_dragon_green.glb', kind: 'dragon', label: 'Green', color: '#2fa84a', pos: [-2.65, -0.27], yaw: 0.5 },
  { id: 'purple', file: '03_dragon_purple.glb', kind: 'dragon', label: 'Purple', color: '#7a3dff', pos: [2.65, -0.5], yaw: -0.5 },
  ...PROPS,
];
export const SLOTS = REAL_SLOTS;
export const MANIFEST = 'models/manifest.json';
export const CLIPS = ['idle', 'walk', 'run', 'fly', 'takeoff', 'land', 'fire_breath', 'look_around', 'sleep', 'happy'];
