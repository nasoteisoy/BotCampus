/* Axis & Allies 1942 in Space — static game data
   Spec wins over printed rules where they conflict. */

export const FACTIONS = {
  iron: {
    id: 'iron', name: 'Iron Khanate', short: 'IK', side: 'allies',
    earthPower: 'USSR', color: '#2f6b3c', colorDark: '#17401f',
    startIPC: 24, order: 0,
  },
  void: {
    id: 'void', name: 'Void Regency', short: 'VR', side: 'axis',
    earthPower: 'Germany', color: '#5a5a5a', colorDark: '#2a2a2a',
    startIPC: 41, order: 1,
  },
  helix: {
    id: 'helix', name: 'Helix Imperium', short: 'HI', side: 'allies',
    earthPower: 'UK', color: '#d8b62c', colorDark: '#7a6010',
    startIPC: 31, order: 2,
  },
  crimson: {
    id: 'crimson', name: 'Crimson Forge', short: 'CF', side: 'axis',
    earthPower: 'Japan', color: '#e3361f', colorDark: '#8a1a0c',
    startIPC: 30, order: 3,
  },
  terran: {
    id: 'terran', name: 'Terran Concord', short: 'TC', side: 'allies',
    earthPower: 'USA', color: '#d6cfb8', colorDark: '#7a735e',
    startIPC: 42, order: 4,
  },
};

export const TURN_ORDER = ['iron', 'void', 'helix', 'crimson', 'terran'];

export const UNITS = {
  infantry: { id: 'infantry', name: 'Infantry', cost: 2, attack: 2, defense: 2, move: 1, kind: 'ground', abbrev: 'Inf' },
  artillery: { id: 'artillery', name: 'Artillery', cost: 4, attack: 2, defense: 2, move: 1, kind: 'ground', abbrev: 'Art', supportInf: true },
  tank: { id: 'tank', name: 'Tank', cost: 6, attack: 3, defense: 3, move: 2, kind: 'ground', abbrev: 'Tnk' },
  aa: { id: 'aa', name: 'AA Gun', cost: 4, attack: 0, defense: 1, move: 1, kind: 'ground', abbrev: 'AA', aaFire: 2 },
  fighter: { id: 'fighter', name: 'Fighter', cost: 10, attack: 3, defense: 4, move: 4, kind: 'air', abbrev: 'Ftr' },
  bomber: { id: 'bomber', name: 'Bomber', cost: 12, attack: 4, defense: 1, move: 6, kind: 'air', abbrev: 'Bmb', stratBomb: true },
  transport: { id: 'transport', name: 'Transport', cost: 7, attack: 0, defense: 0, move: 2, kind: 'ship', abbrev: 'Trn', capacity: 2 },
  submarine: { id: 'submarine', name: 'Sub', cost: 6, attack: 2, defense: 1, move: 2, kind: 'ship', abbrev: 'Sub', stealth: true, surprise: true },
  destroyer: { id: 'destroyer', name: 'Destroyer', cost: 8, attack: 3, defense: 2, move: 2, kind: 'ship', abbrev: 'Des', antiSub: true },
  cruiser: { id: 'cruiser', name: 'Cruiser', cost: 12, attack: 3, defense: 3, move: 2, kind: 'ship', abbrev: 'Cru', bombard: true },
  battleship: { id: 'battleship', name: 'Battleship', cost: 20, attack: 4, defense: 4, move: 2, kind: 'ship', abbrev: 'BB', hits: 2, bombard: true },
  carrier: { id: 'carrier', name: 'Carrier', cost: 14, attack: 1, defense: 2, move: 2, kind: 'ship', abbrev: 'CV', hangar: 2 },
};

/** Planets / moons / dwarfs and deep-space connectors */
export const SYSTEMS = {
  northAmerica: { id: 'northAmerica', name: 'North America', kind: 'planet', pos: [-20, 5, 0], radius: 3.2, continent: 'NA' },
  greenland: { id: 'greenland', name: 'Greenland', kind: 'moon', parent: 'northAmerica', pos: [-14.2, 9.2, 3.5], radius: 0.85 },
  southAmerica: { id: 'southAmerica', name: 'South America', kind: 'planet', pos: [-18, -9, 2], radius: 2.6, continent: 'SA' },
  europe: { id: 'europe', name: 'Europe', kind: 'planet', pos: [0, 6, 0], radius: 2.8, continent: 'EU' },
  england: { id: 'england', name: 'England', kind: 'moon', parent: 'europe', pos: [-5.2, 9.5, 2.5], radius: 0.95 },
  africa: { id: 'africa', name: 'Africa', kind: 'planet', pos: [1.5, -7, 1], radius: 2.7, continent: 'AF' },
  madagascar: { id: 'madagascar', name: 'Madagascar', kind: 'moon', parent: 'africa', pos: [6.2, -10.5, 3.5], radius: 0.7 },
  asia: { id: 'asia', name: 'Asia', kind: 'planet', pos: [18, 4, -2], radius: 3.6, continent: 'AS' },
  japan: { id: 'japan', name: 'Japan', kind: 'moon', parent: 'asia', pos: [25.5, 7.5, 3.5], radius: 1.05 },
  australia: { id: 'australia', name: 'Australia', kind: 'planet', pos: [15, -11, 4], radius: 2.2, continent: 'AU' },
  newZealand: { id: 'newZealand', name: 'New Zealand', kind: 'moon', parent: 'australia', pos: [19.5, -13.5, 7.5], radius: 0.65 },
  // Pacific dwarf row — east of Asia, south of Japan, clear gaps
  hawaii: { id: 'hawaii', name: 'Hawaiian Isles', kind: 'dwarf', pos: [-6, 0, 12], radius: 0.7 },
  midway: { id: 'midway', name: 'Midway', kind: 'dwarf', pos: [-1.5, 4, 13], radius: 0.45 },
  wake: { id: 'wake', name: 'Wake', kind: 'dwarf', pos: [10, 2.5, 13], radius: 0.4 },
  carolines: { id: 'carolines', name: 'Carolines', kind: 'dwarf', pos: [22.5, 0.3, 11], radius: 0.5 },
  philippines: { id: 'philippines', name: 'Philippines', kind: 'dwarf', pos: [22.5, -3.5, 7], radius: 0.65 },
  iwoJima: { id: 'iwoJima', name: 'Iwo Jima', kind: 'dwarf', pos: [26, 3, 7], radius: 0.4 },
  okinawa: { id: 'okinawa', name: 'Okinawa', kind: 'dwarf', pos: [27.5, 5.5, 5.5], radius: 0.4 },
  eastIndies: { id: 'eastIndies', name: 'East Indies', kind: 'dwarf', pos: [10.5, -3.5, 10], radius: 0.75 },
  borneo: { id: 'borneo', name: 'Borneo', kind: 'dwarf', pos: [15.5, -4, 8], radius: 0.55 },
  newGuinea: { id: 'newGuinea', name: 'New Guinea', kind: 'dwarf', pos: [17.5, -8, 9.5], radius: 0.55 },
  solomons: { id: 'solomons', name: 'Solomons', kind: 'dwarf', pos: [20, -7, 11.5], radius: 0.5 },
};

export const DEEP_SPACE = {
  ds_atl_n: { id: 'ds_atl_n', name: 'North Atlantic Deep', kind: 'deep', pos: [-10, 7, -2], links: ['england', 'greenland', 'northAmerica', 'europe', 'ds_atl_c'] },
  ds_atl_c: { id: 'ds_atl_c', name: 'Central Atlantic Deep', kind: 'deep', pos: [-9, 0, -1], links: ['ds_atl_n', 'ds_atl_s', 'northAmerica', 'southAmerica', 'africa', 'europe'] },
  ds_atl_s: { id: 'ds_atl_s', name: 'South Atlantic Deep', kind: 'deep', pos: [-9, -9, 1], links: ['ds_atl_c', 'southAmerica', 'africa', 'ds_ind_w'] },
  ds_med: { id: 'ds_med', name: 'Mediterranean Deep', kind: 'deep', pos: [3, 1, -2], links: ['europe', 'england', 'africa', 'asia', 'ds_atl_c'] },
  ds_ind_w: { id: 'ds_ind_w', name: 'West Indian Deep', kind: 'deep', pos: [7, -8, 1], links: ['africa', 'madagascar', 'asia', 'ds_atl_s', 'ds_ind_e'] },
  ds_ind_e: { id: 'ds_ind_e', name: 'East Indian Deep', kind: 'deep', pos: [12, -6, 4], links: ['ds_ind_w', 'asia', 'australia', 'eastIndies', 'borneo', 'ds_pac_s'] },
  ds_pac_n: { id: 'ds_pac_n', name: 'North Pacific Deep', kind: 'deep', pos: [8, 5, 9], links: ['northAmerica', 'asia', 'japan', 'midway', 'wake', 'hawaii', 'ds_pac_c'] },
  ds_pac_c: { id: 'ds_pac_c', name: 'Central Pacific Deep', kind: 'deep', pos: [14, 1, 11], links: ['ds_pac_n', 'ds_pac_s', 'hawaii', 'midway', 'wake', 'carolines', 'philippines', 'japan'] },
  ds_pac_s: { id: 'ds_pac_s', name: 'South Pacific Deep', kind: 'deep', pos: [16, -5, 10], links: ['ds_pac_c', 'ds_ind_e', 'australia', 'newZealand', 'solomons', 'newGuinea', 'eastIndies', 'hawaii'] },
};

/**
 * Surface zones (A&A 1942 territories) on planets/moons/dwarfs.
 * uv: [u,v] 0..1 for placement on sphere (longitude/latitude style).
 * ipc: 1942 IPC value. vc: victory city name or null.
 */
export const ZONES = {
  // —— North America ——
  eus: { id: 'eus', name: 'Eastern United States', system: 'northAmerica', owner: 'terran', original: 'terran', ipc: 12, terrain: 'land', vc: 'Washington', uv: [0.15, 0.45], factory: true },
  cus: { id: 'cus', name: 'Central United States', system: 'northAmerica', owner: 'terran', original: 'terran', ipc: 6, terrain: 'land', uv: [0.28, 0.48] },
  wus: { id: 'wus', name: 'Western United States', system: 'northAmerica', owner: 'terran', original: 'terran', ipc: 10, terrain: 'land', vc: 'San Francisco', uv: [0.42, 0.48], factory: true },
  alaska: { id: 'alaska', name: 'Alaska', system: 'northAmerica', owner: 'terran', original: 'terran', ipc: 2, terrain: 'land', uv: [0.55, 0.28] },
  mexico: { id: 'mexico', name: 'Mexico', system: 'northAmerica', owner: 'terran', original: 'terran', ipc: 1, terrain: 'land', uv: [0.25, 0.62] },
  camerica: { id: 'camerica', name: 'Central America', system: 'northAmerica', owner: 'terran', original: 'terran', ipc: 1, terrain: 'land', uv: [0.22, 0.72] },
  ecanada: { id: 'ecanada', name: 'Eastern Canada', system: 'northAmerica', owner: 'helix', original: 'helix', ipc: 3, terrain: 'land', uv: [0.12, 0.32] },
  wcanada: { id: 'wcanada', name: 'Western Canada', system: 'northAmerica', owner: 'helix', original: 'helix', ipc: 1, terrain: 'land', uv: [0.40, 0.30] },
  greenland_z: { id: 'greenland_z', name: 'Greenland', system: 'greenland', owner: 'helix', original: 'helix', ipc: 0, terrain: 'land', uv: [0.25, 0.42] },

  // —— South America ——
  brazil: { id: 'brazil', name: 'Brazil', system: 'southAmerica', owner: 'terran', original: 'terran', ipc: 2, terrain: 'land', uv: [0.45, 0.40] },
  argentina: { id: 'argentina', name: 'Argentina', system: 'southAmerica', owner: 'terran', original: 'terran', ipc: 2, terrain: 'land', uv: [0.40, 0.70] },
  venezuela: { id: 'venezuela', name: 'Venezuela', system: 'southAmerica', owner: 'terran', original: 'terran', ipc: 1, terrain: 'land', uv: [0.35, 0.25] },
  peru: { id: 'peru', name: 'Peru', system: 'southAmerica', owner: 'terran', original: 'terran', ipc: 1, terrain: 'land', uv: [0.25, 0.50] },

  // —— Europe ——
  germany: { id: 'germany', name: 'Germany', system: 'europe', owner: 'void', original: 'void', ipc: 10, terrain: 'land', vc: 'Berlin', uv: [0.45, 0.40], factory: true },
  france: { id: 'france', name: 'France', system: 'europe', owner: 'void', original: 'void', ipc: 6, terrain: 'land', vc: 'Paris', uv: [0.28, 0.48] },
  nweurope: { id: 'nweurope', name: 'Northwestern Europe', system: 'europe', owner: 'void', original: 'void', ipc: 2, terrain: 'land', uv: [0.32, 0.35] },
  norway: { id: 'norway', name: 'Norway', system: 'europe', owner: 'void', original: 'void', ipc: 2, terrain: 'land', uv: [0.42, 0.22] },
  finland: { id: 'finland', name: 'Finland', system: 'europe', owner: 'void', original: 'void', ipc: 1, terrain: 'land', uv: [0.55, 0.22] },
  baltic: { id: 'baltic', name: 'Baltic States', system: 'europe', owner: 'void', original: 'void', ipc: 2, terrain: 'land', uv: [0.58, 0.32] },
  poland: { id: 'poland', name: 'Poland', system: 'europe', owner: 'void', original: 'void', ipc: 2, terrain: 'land', uv: [0.55, 0.42] },
  bulgaria: { id: 'bulgaria', name: 'Bulgaria-Romania', system: 'europe', owner: 'void', original: 'void', ipc: 2, terrain: 'land', uv: [0.58, 0.52] },
  italy: { id: 'italy', name: 'Italy', system: 'europe', owner: 'void', original: 'void', ipc: 3, terrain: 'land', vc: 'Rome', uv: [0.42, 0.58], factory: true },
  seurope: { id: 'seurope', name: 'Southern Europe', system: 'europe', owner: 'void', original: 'void', ipc: 2, terrain: 'land', uv: [0.50, 0.60] },
  ukraine: { id: 'ukraine', name: 'Ukraine S.S.R.', system: 'europe', owner: 'void', original: 'void', ipc: 2, terrain: 'land', uv: [0.68, 0.45] },
  belorussia: { id: 'belorussia', name: 'Belorussia', system: 'europe', owner: 'void', original: 'void', ipc: 2, terrain: 'land', uv: [0.65, 0.35] },
  westrussia: { id: 'westrussia', name: 'West Russia', system: 'europe', owner: 'void', original: 'void', ipc: 2, terrain: 'land', uv: [0.72, 0.38] },
  england_z: { id: 'england_z', name: 'United Kingdom', system: 'england', owner: 'helix', original: 'helix', ipc: 8, terrain: 'land', vc: 'London', uv: [0.25, 0.42], factory: true },

  // —— Africa ——
  morocco: { id: 'morocco', name: 'Morocco', system: 'africa', owner: 'void', original: 'void', ipc: 1, terrain: 'land', uv: [0.25, 0.30] },
  algeria: { id: 'algeria', name: 'Algeria', system: 'africa', owner: 'void', original: 'void', ipc: 1, terrain: 'land', uv: [0.35, 0.28] },
  libya: { id: 'libya', name: 'Libya', system: 'africa', owner: 'void', original: 'void', ipc: 1, terrain: 'land', uv: [0.48, 0.28] },
  egypt: { id: 'egypt', name: 'Egypt', system: 'africa', owner: 'helix', original: 'helix', ipc: 2, terrain: 'land', uv: [0.58, 0.30] },
  sudan: { id: 'sudan', name: 'Anglo-Egypt Sudan', system: 'africa', owner: 'helix', original: 'helix', ipc: 1, terrain: 'land', uv: [0.58, 0.42] },
  congo: { id: 'congo', name: 'Belgian Congo', system: 'africa', owner: 'helix', original: 'helix', ipc: 2, terrain: 'land', uv: [0.48, 0.55] },
  fwafrica: { id: 'fwafrica', name: 'French West Africa', system: 'africa', owner: 'helix', original: 'helix', ipc: 1, terrain: 'land', uv: [0.28, 0.45] },
  safrica: { id: 'safrica', name: 'Union of South Africa', system: 'africa', owner: 'helix', original: 'helix', ipc: 2, terrain: 'land', uv: [0.48, 0.75] },
  madagascar_z: { id: 'madagascar_z', name: 'Madagascar', system: 'madagascar', owner: 'helix', original: 'helix', ipc: 1, terrain: 'land', uv: [0.25, 0.42] },

  // —— Asia ——
  russia: { id: 'russia', name: 'Russia', system: 'asia', owner: 'iron', original: 'iron', ipc: 8, terrain: 'land', vc: 'Moscow', uv: [0.35, 0.35], factory: true },
  karelia: { id: 'karelia', name: 'Karelia S.S.R.', system: 'asia', owner: 'iron', original: 'iron', ipc: 2, terrain: 'land', vc: 'Leningrad', uv: [0.22, 0.28], factory: true },
  archangel: { id: 'archangel', name: 'Archangel', system: 'asia', owner: 'iron', original: 'iron', ipc: 2, terrain: 'land', uv: [0.30, 0.22] },
  novosibirsk: { id: 'novosibirsk', name: 'Novosibirsk', system: 'asia', owner: 'iron', original: 'iron', ipc: 1, terrain: 'land', uv: [0.48, 0.32] },
  caucasus: { id: 'caucasus', name: 'Caucasus', system: 'asia', owner: 'iron', original: 'iron', ipc: 3, terrain: 'land', uv: [0.28, 0.48], factory: true },
  kazakh: { id: 'kazakh', name: 'Kazakh S.S.R.', system: 'asia', owner: 'iron', original: 'iron', ipc: 2, terrain: 'land', uv: [0.40, 0.45] },
  evenki: { id: 'evenki', name: 'Evenki National Okrug', system: 'asia', owner: 'iron', original: 'iron', ipc: 2, terrain: 'land', uv: [0.55, 0.28] },
  yakut: { id: 'yakut', name: 'Yakut S.S.R.', system: 'asia', owner: 'iron', original: 'iron', ipc: 1, terrain: 'land', uv: [0.65, 0.25] },
  buryatia: { id: 'buryatia', name: 'Buryatia S.S.R.', system: 'asia', owner: 'iron', original: 'iron', ipc: 2, terrain: 'land', uv: [0.70, 0.35] },
  sfe: { id: 'sfe', name: 'Soviet Far East', system: 'asia', owner: 'iron', original: 'iron', ipc: 1, terrain: 'land', uv: [0.78, 0.32] },
  manchuria: { id: 'manchuria', name: 'Manchuria', system: 'asia', owner: 'crimson', original: 'crimson', ipc: 3, terrain: 'land', uv: [0.75, 0.42] },
  kiangsu: { id: 'kiangsu', name: 'Kiangsu', system: 'asia', owner: 'crimson', original: 'crimson', ipc: 2, terrain: 'land', vc: 'Shanghai', uv: [0.72, 0.52] },
  kwangtung: { id: 'kwangtung', name: 'Kwangtung', system: 'asia', owner: 'crimson', original: 'crimson', ipc: 2, terrain: 'land', uv: [0.68, 0.58] },
  fic: { id: 'fic', name: 'French Indo-China', system: 'asia', owner: 'crimson', original: 'crimson', ipc: 2, terrain: 'land', uv: [0.62, 0.65] },
  malaya: { id: 'malaya', name: 'Malaya', system: 'asia', owner: 'crimson', original: 'crimson', ipc: 1, terrain: 'land', uv: [0.58, 0.72] },
  india: { id: 'india', name: 'India', system: 'asia', owner: 'helix', original: 'helix', ipc: 3, terrain: 'land', vc: 'Calcutta', uv: [0.48, 0.62], factory: true },
  burma: { id: 'burma', name: 'Burma', system: 'asia', owner: 'helix', original: 'helix', ipc: 1, terrain: 'land', uv: [0.55, 0.60] },
  persia: { id: 'persia', name: 'Persia', system: 'asia', owner: 'helix', original: 'helix', ipc: 1, terrain: 'land', uv: [0.32, 0.55] },
  transjordan: { id: 'transjordan', name: 'Trans-Jordan', system: 'asia', owner: 'helix', original: 'helix', ipc: 1, terrain: 'land', uv: [0.25, 0.55] },
  yunnan: { id: 'yunnan', name: 'Yunnan', system: 'asia', owner: 'terran', original: 'terran', ipc: 1, terrain: 'land', uv: [0.62, 0.55] },
  szechwan: { id: 'szechwan', name: 'Szechwan', system: 'asia', owner: 'terran', original: 'terran', ipc: 1, terrain: 'land', uv: [0.65, 0.50] },
  anhwei: { id: 'anhwei', name: 'Anhwei', system: 'asia', owner: 'terran', original: 'terran', ipc: 1, terrain: 'land', uv: [0.70, 0.48] },
  japan_z: { id: 'japan_z', name: 'Japan', system: 'japan', owner: 'crimson', original: 'crimson', ipc: 8, terrain: 'land', vc: 'Tokyo', uv: [0.25, 0.42], factory: true },

  // —— Australia ——
  eaustralia: { id: 'eaustralia', name: 'Eastern Australia', system: 'australia', owner: 'helix', original: 'helix', ipc: 2, terrain: 'land', uv: [0.55, 0.45] },
  waustralia: { id: 'waustralia', name: 'Western Australia', system: 'australia', owner: 'helix', original: 'helix', ipc: 1, terrain: 'land', uv: [0.30, 0.50] },
  newzealand_z: { id: 'newzealand_z', name: 'New Zealand', system: 'newZealand', owner: 'helix', original: 'helix', ipc: 1, terrain: 'land', uv: [0.25, 0.42] },

  // —— Pacific dwarfs (one zone each) ——
  hawaii_z: { id: 'hawaii_z', name: 'Hawaiian Islands', system: 'hawaii', owner: 'terran', original: 'terran', ipc: 1, terrain: 'land', vc: 'Honolulu', uv: [0.25, 0.42] },
  philippines_z: { id: 'philippines_z', name: 'Philippine Islands', system: 'philippines', owner: 'crimson', original: 'crimson', ipc: 3, terrain: 'land', vc: 'Manila', uv: [0.25, 0.42] },
  eastindies_z: { id: 'eastindies_z', name: 'East Indies', system: 'eastIndies', owner: 'crimson', original: 'crimson', ipc: 4, terrain: 'land', uv: [0.25, 0.42] },
  borneo_z: { id: 'borneo_z', name: 'Borneo', system: 'borneo', owner: 'crimson', original: 'crimson', ipc: 1, terrain: 'land', uv: [0.25, 0.42] },
  newguinea_z: { id: 'newguinea_z', name: 'New Guinea', system: 'newGuinea', owner: 'crimson', original: 'crimson', ipc: 1, terrain: 'land', uv: [0.25, 0.42] },
  solomons_z: { id: 'solomons_z', name: 'Solomon Islands', system: 'solomons', owner: 'crimson', original: 'crimson', ipc: 1, terrain: 'land', uv: [0.25, 0.42] },
  carolines_z: { id: 'carolines_z', name: 'Caroline Islands', system: 'carolines', owner: 'crimson', original: 'crimson', ipc: 1, terrain: 'land', uv: [0.25, 0.42] },
  midway_z: { id: 'midway_z', name: 'Midway', system: 'midway', owner: 'terran', original: 'terran', ipc: 0, terrain: 'land', uv: [0.25, 0.42] },
  wake_z: { id: 'wake_z', name: 'Wake Island', system: 'wake', owner: 'crimson', original: 'crimson', ipc: 0, terrain: 'land', uv: [0.25, 0.42] },
  iwo_z: { id: 'iwo_z', name: 'Iwo Jima', system: 'iwoJima', owner: 'crimson', original: 'crimson', ipc: 0, terrain: 'land', uv: [0.25, 0.42] },
  okinawa_z: { id: 'okinawa_z', name: 'Okinawa', system: 'okinawa', owner: 'crimson', original: 'crimson', ipc: 1, terrain: 'land', uv: [0.25, 0.42] },

  // —— Planetary SEA zones (blue water, no income, no owner) ——
  // North America oceans
  na_atlantic: { id: 'na_atlantic', name: 'NA East Coast Sea', system: 'northAmerica', terrain: 'sea', ipc: 0, uv: [0.05, 0.48] },
  na_gulf: { id: 'na_gulf', name: 'Gulf of Mexico Sea', system: 'northAmerica', terrain: 'sea', ipc: 0, uv: [0.18, 0.68] },
  na_pacific: { id: 'na_pacific', name: 'NA West Coast Sea', system: 'northAmerica', terrain: 'sea', ipc: 0, uv: [0.62, 0.48] },
  na_arctic: { id: 'na_arctic', name: 'NA Arctic Sea', system: 'northAmerica', terrain: 'sea', ipc: 0, uv: [0.30, 0.12] },
  na_carib: { id: 'na_carib', name: 'Caribbean Sea', system: 'northAmerica', terrain: 'sea', ipc: 0, uv: [0.12, 0.78] },
  greenland_sea: { id: 'greenland_sea', name: 'Greenland Sea', system: 'greenland', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },

  // South America
  sa_atlantic: { id: 'sa_atlantic', name: 'SA Atlantic Sea', system: 'southAmerica', terrain: 'sea', ipc: 0, uv: [0.70, 0.45] },
  sa_pacific: { id: 'sa_pacific', name: 'SA Pacific Sea', system: 'southAmerica', terrain: 'sea', ipc: 0, uv: [0.10, 0.50] },
  sa_south: { id: 'sa_south', name: 'SA Southern Sea', system: 'southAmerica', terrain: 'sea', ipc: 0, uv: [0.50, 0.88] },

  // Europe
  eu_northsea: { id: 'eu_northsea', name: 'North Sea', system: 'europe', terrain: 'sea', ipc: 0, uv: [0.30, 0.18] },
  eu_balticsea: { id: 'eu_balticsea', name: 'Baltic Sea', system: 'europe', terrain: 'sea', ipc: 0, uv: [0.52, 0.28] },
  eu_medwest: { id: 'eu_medwest', name: 'Western Med Sea', system: 'europe', terrain: 'sea', ipc: 0, uv: [0.28, 0.68] },
  eu_medeast: { id: 'eu_medeast', name: 'Eastern Med Sea', system: 'europe', terrain: 'sea', ipc: 0, uv: [0.55, 0.72] },
  eu_atlantic: { id: 'eu_atlantic', name: 'Europe Atlantic Sea', system: 'europe', terrain: 'sea', ipc: 0, uv: [0.12, 0.42] },
  eu_black: { id: 'eu_black', name: 'Black Sea', system: 'europe', terrain: 'sea', ipc: 0, uv: [0.72, 0.55] },
  england_sea: { id: 'england_sea', name: 'English Channel Sea', system: 'england', terrain: 'sea', ipc: 0, uv: [0.5, 0.1] },

  // Africa
  af_med: { id: 'af_med', name: 'Africa Med Sea', system: 'africa', terrain: 'sea', ipc: 0, uv: [0.40, 0.12] },
  af_atlantic: { id: 'af_atlantic', name: 'Africa Atlantic Sea', system: 'africa', terrain: 'sea', ipc: 0, uv: [0.12, 0.45] },
  af_indian: { id: 'af_indian', name: 'Africa Indian Sea', system: 'africa', terrain: 'sea', ipc: 0, uv: [0.78, 0.50] },
  af_south: { id: 'af_south', name: 'Africa Southern Sea', system: 'africa', terrain: 'sea', ipc: 0, uv: [0.48, 0.90] },
  madagascar_sea: { id: 'madagascar_sea', name: 'Madagascar Sea', system: 'madagascar', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },

  // Asia
  as_arctic: { id: 'as_arctic', name: 'Asia Arctic Sea', system: 'asia', terrain: 'sea', ipc: 0, uv: [0.45, 0.08] },
  as_pacific: { id: 'as_pacific', name: 'Asia Pacific Sea', system: 'asia', terrain: 'sea', ipc: 0, uv: [0.88, 0.40] },
  as_southchina: { id: 'as_southchina', name: 'South China Sea', system: 'asia', terrain: 'sea', ipc: 0, uv: [0.70, 0.68] },
  as_indian: { id: 'as_indian', name: 'Asia Indian Sea', system: 'asia', terrain: 'sea', ipc: 0, uv: [0.42, 0.78] },
  as_persian: { id: 'as_persian', name: 'Persian Gulf Sea', system: 'asia', terrain: 'sea', ipc: 0, uv: [0.28, 0.62] },
  as_bering: { id: 'as_bering', name: 'Bering Sea', system: 'asia', terrain: 'sea', ipc: 0, uv: [0.85, 0.22] },
  japan_sea: { id: 'japan_sea', name: 'Sea of Japan', system: 'japan', terrain: 'sea', ipc: 0, uv: [0.5, 0.1] },

  // Australia
  au_coral: { id: 'au_coral', name: 'Coral Sea', system: 'australia', terrain: 'sea', ipc: 0, uv: [0.75, 0.40] },
  au_indian: { id: 'au_indian', name: 'Australia Indian Sea', system: 'australia', terrain: 'sea', ipc: 0, uv: [0.15, 0.50] },
  au_south: { id: 'au_south', name: 'Australia Southern Sea', system: 'australia', terrain: 'sea', ipc: 0, uv: [0.45, 0.85] },
  newzealand_sea: { id: 'newzealand_sea', name: 'Tasman Sea', system: 'newZealand', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },

  // Pacific dwarfs — surrounding seas
  hawaii_sea: { id: 'hawaii_sea', name: 'Hawaii Sea', system: 'hawaii', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },
  philippines_sea: { id: 'philippines_sea', name: 'Philippine Sea', system: 'philippines', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },
  eastindies_sea: { id: 'eastindies_sea', name: 'East Indies Sea', system: 'eastIndies', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },
  borneo_sea: { id: 'borneo_sea', name: 'Borneo Sea', system: 'borneo', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },
  newguinea_sea: { id: 'newguinea_sea', name: 'New Guinea Sea', system: 'newGuinea', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },
  solomons_sea: { id: 'solomons_sea', name: 'Solomon Sea', system: 'solomons', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },
  carolines_sea: { id: 'carolines_sea', name: 'Caroline Sea', system: 'carolines', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },
  midway_sea: { id: 'midway_sea', name: 'Midway Sea', system: 'midway', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },
  wake_sea: { id: 'wake_sea', name: 'Wake Sea', system: 'wake', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },
  iwo_sea: { id: 'iwo_sea', name: 'Iwo Sea', system: 'iwoJima', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },
  okinawa_sea: { id: 'okinawa_sea', name: 'Okinawa Sea', system: 'okinawa', terrain: 'sea', ipc: 0, uv: [0.5, 0.12] },

};

/** Adjacency: zone-to-zone on same planet, and zone↔deep-space via system links */
export function buildAdjacency() {
  const adj = {};
  const add = (a, b) => {
    if (!adj[a]) adj[a] = new Set();
    if (!adj[b]) adj[b] = new Set();
    adj[a].add(b);
    adj[b].add(a);
  };
  const isSea = (z) => z && z.terrain === 'sea';
  const isLand = (z) => z && z.terrain !== 'sea';

  const bySys = {};
  for (const z of Object.values(ZONES)) {
    if (!bySys[z.system]) bySys[z.system] = [];
    bySys[z.system].push(z);
  }

  // Same-system: land↔land, sea↔sea, and coastal sea↔land (all pairs on body — playable scale)
  for (const list of Object.values(bySys)) {
    const lands = list.filter(isLand);
    const seas = list.filter(isSea);
    for (let i = 0; i < lands.length; i++)
      for (let j = i + 1; j < lands.length; j++) add(lands[i].id, lands[j].id);
    for (let i = 0; i < seas.length; i++)
      for (let j = i + 1; j < seas.length; j++) add(seas[i].id, seas[j].id);
    for (const s of seas)
      for (const l of lands) add(s.id, l.id);
  }

  // Historical land bridges (land only)
  const bridges = [
    ['alaska', 'sfe'],
    ['transjordan', 'egypt'],
    ['persia', 'caucasus'],
    ['westrussia', 'russia'],
    ['westrussia', 'karelia'],
    ['ukraine', 'caucasus'],
    ['belorussia', 'karelia'],
    ['fic', 'burma'],
    ['burma', 'yunnan'],
    ['kwangtung', 'yunnan'],
    ['kiangsu', 'anhwei'],
    ['manchuria', 'sfe'],
    ['manchuria', 'buryatia'],
  ];
  for (const [a, b] of bridges) if (ZONES[a] && ZONES[b]) add(a, b);

  // Deep-space mesh: deep↔deep, and deep↔SEA zones of linked systems (not land)
  for (const ds of Object.values(DEEP_SPACE)) {
    adj[ds.id] = adj[ds.id] || new Set();
    for (const link of ds.links) {
      if (DEEP_SPACE[link]) {
        add(ds.id, link);
      } else if (SYSTEMS[link]) {
        const zones = bySys[link] || [];
        for (const z of zones) {
          if (isSea(z)) add(ds.id, z.id);
        }
        // If a system has no sea (shouldn't happen), fall back to any zone
        if (!zones.some(isSea)) {
          for (const z of zones) add(ds.id, z.id);
        }
      }
    }
  }

  const out = {};
  for (const [k, v] of Object.entries(adj)) out[k] = [...v];
  return out;
}

export function startingUnits() {
  const u = {};
  const put = (loc, fac, units) => {
    if (!u[loc]) u[loc] = {};
    if (!u[loc][fac]) u[loc][fac] = {};
    for (const [t, n] of Object.entries(units)) u[loc][fac][t] = (u[loc][fac][t] || 0) + n;
  };

  // Iron Khanate (USSR)
  put('russia', 'iron', { infantry: 4, artillery: 1, aa: 1, tank: 2, fighter: 1 });
  put('karelia', 'iron', { infantry: 4, artillery: 1, fighter: 1 });
  put('archangel', 'iron', { infantry: 1, tank: 1 });
  put('novosibirsk', 'iron', { infantry: 1 });
  put('caucasus', 'iron', { infantry: 3, artillery: 1, aa: 1, tank: 1 });
  put('kazakh', 'iron', { infantry: 1 });
  put('evenki', 'iron', { infantry: 2 });
  put('yakut', 'iron', { infantry: 1 });
  put('buryatia', 'iron', { infantry: 2 });
  put('sfe', 'iron', { infantry: 2 });
  put('ds_atl_n', 'iron', { submarine: 1 });

  // Void Regency (Germany)
  put('germany', 'void', { infantry: 3, aa: 1, tank: 2, fighter: 1, bomber: 1 });
  put('france', 'void', { infantry: 1, aa: 1, tank: 2 });
  put('nweurope', 'void', { infantry: 1, tank: 1, fighter: 1 });
  put('norway', 'void', { infantry: 2, fighter: 1 });
  put('finland', 'void', { infantry: 3 });
  put('baltic', 'void', { infantry: 1, tank: 1 });
  put('poland', 'void', { infantry: 2, tank: 1, fighter: 1 });
  put('bulgaria', 'void', { infantry: 2, tank: 1, fighter: 1 });
  put('italy', 'void', { infantry: 1, aa: 1, tank: 1 });
  put('seurope', 'void', { infantry: 1, artillery: 1 });
  put('ukraine', 'void', { infantry: 3, artillery: 1, tank: 1, fighter: 1 });
  put('belorussia', 'void', { infantry: 3 });
  put('westrussia', 'void', { infantry: 3, artillery: 1, tank: 1 });
  put('morocco', 'void', { infantry: 1 });
  put('algeria', 'void', { infantry: 1, artillery: 1 });
  put('libya', 'void', { infantry: 1, tank: 1 });
  put('eu_atlantic', 'void', { cruiser: 1, submarine: 1, transport: 1 });
  put('ds_atl_n', 'void', { submarine: 1 });
  put('eu_medwest', 'void', { battleship: 1, transport: 1 });
  put('ds_atl_c', 'void', { submarine: 2 });

  // Helix Imperium (UK)
  put('england_z', 'helix', { infantry: 2, artillery: 1, aa: 1, tank: 1, fighter: 2, bomber: 1 });
  put('ecanada', 'helix', { tank: 1 });
  put('wcanada', 'helix', { infantry: 1 });
  put('egypt', 'helix', { infantry: 1, tank: 1, artillery: 1, fighter: 1 });
  put('safrica', 'helix', { infantry: 1 });
  put('transjordan', 'helix', { infantry: 1 });
  put('persia', 'helix', { infantry: 1 });
  put('india', 'helix', { infantry: 3, aa: 1 });
  put('burma', 'helix', { infantry: 1 });
  put('eaustralia', 'helix', { infantry: 2 });
  put('waustralia', 'helix', { infantry: 1 });
  put('newzealand_z', 'helix', { infantry: 1 });
  put('sudan', 'helix', { infantry: 1 });
  put('congo', 'helix', { infantry: 1 });
  put('fwafrica', 'helix', { infantry: 1 });
  put('madagascar_z', 'helix', { infantry: 1 });
  put('england_sea', 'helix', { battleship: 1, transport: 1 });
  put('na_atlantic', 'helix', { destroyer: 1, transport: 1 });
  put('eu_medeast', 'helix', { cruiser: 1 });
  put('af_indian', 'helix', { destroyer: 1 });
  put('ds_ind_e', 'helix', { carrier: 1, fighter: 1, cruiser: 1, transport: 1 });
  put('ds_pac_s', 'helix', { cruiser: 1, transport: 1, submarine: 1 });

  // Crimson Forge (Japan)
  put('japan_z', 'crimson', { infantry: 4, artillery: 1, aa: 1, tank: 1, fighter: 1, bomber: 1 });
  put('manchuria', 'crimson', { infantry: 3, fighter: 1 });
  put('kiangsu', 'crimson', { infantry: 4 });
  put('kwangtung', 'crimson', { infantry: 1, artillery: 1 });
  put('iwo_z', 'crimson', { infantry: 1 });
  put('okinawa_z', 'crimson', { infantry: 1 });
  put('wake_z', 'crimson', { infantry: 1 });
  put('fic', 'crimson', { infantry: 2, artillery: 1, fighter: 1 });
  put('malaya', 'crimson', { infantry: 1 });
  put('eastindies_z', 'crimson', { infantry: 2 });
  put('borneo_z', 'crimson', { infantry: 1 });
  put('newguinea_z', 'crimson', { infantry: 1 });
  put('solomons_z', 'crimson', { infantry: 1 });
  put('carolines_z', 'crimson', { infantry: 1 });
  put('philippines_z', 'crimson', { infantry: 1, artillery: 1 });
  put('japan_sea', 'crimson', { carrier: 1, fighter: 2, battleship: 1 });
  put('philippines_sea', 'crimson', { carrier: 1, fighter: 1, cruiser: 1 });
  put('ds_pac_s', 'crimson', { battleship: 1, transport: 1, destroyer: 1 });
  put('ds_ind_e', 'crimson', { transport: 1, destroyer: 1 });
  put('ds_pac_c', 'crimson', { submarine: 1 });

  // Terran Concord (USA)
  put('eus', 'terran', { infantry: 2, artillery: 1, aa: 1, tank: 1, fighter: 1, bomber: 1 });
  put('cus', 'terran', { infantry: 1 });
  put('wus', 'terran', { infantry: 2, aa: 1, fighter: 1 });
  put('alaska', 'terran', { infantry: 1 });
  put('hawaii_z', 'terran', { infantry: 1, fighter: 1 });
  put('midway_z', 'terran', { infantry: 1 });
  put('yunnan', 'terran', { infantry: 2 });
  put('szechwan', 'terran', { infantry: 2, fighter: 1 });
  put('anhwei', 'terran', { infantry: 2 });
  put('brazil', 'terran', { infantry: 1 });
  put('mexico', 'terran', { infantry: 1 });
  put('na_atlantic', 'terran', { destroyer: 1, transport: 2 });
  put('ds_atl_s', 'terran', { cruiser: 1 });
  put('hawaii_sea', 'terran', { carrier: 1, fighter: 1, destroyer: 1, submarine: 1 });
  put('na_pacific', 'terran', { battleship: 1, destroyer: 1, transport: 1 });

  return u;
}

export const VICTORY = {
  alliesStart: 7,
  axisStart: 6,
  alliesWinAt: 10,
  axisWinAt: 9,
};
