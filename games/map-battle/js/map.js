// Map layout for the made-up Battle of Kerovo: river, roads, villages, hills, earthworks, start lines.
// Source part: none in parts-library covers a painted 2D campaign map; written new for map-battle.
// All place names are invented.

export const WORLD = { w: 2400, h: 1600 };

/** Small seeded generator so the painted map and portraits look the same on every load. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom smoothing so rivers and roads wind instead of zig-zag. */
export function smoothPath(points, steps = 8) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export const RIVER = smoothPath([
  [2400, 150], [2180, 220], [1990, 160], [1790, 250], [1620, 370], [1440, 400], [1300, 470],
  [1180, 570], [1030, 560], [890, 620], [770, 720], [610, 745], [440, 690], [270, 770], [0, 830],
]);

export const STREAMS = [
  smoothPath([[880, 1600], [950, 1450], [880, 1300], [930, 1160], [860, 990], [890, 820], [840, 660]]),
  smoothPath([[2400, 700], [2250, 760], [2150, 690], [1980, 740], [1850, 650], [1700, 610], [1620, 380]]),
  smoothPath([[1600, 1600], [1660, 1480], [1580, 1360], [1650, 1240], [1560, 1130]]),
  smoothPath([[0, 300], [140, 360], [260, 330], [380, 420], [440, 690]]),
];

export const ROADS = [
  smoothPath([[0, 980], [380, 1000], [700, 930], [1000, 910], [1250, 900], [1600, 960], [2050, 1180], [2400, 1250]]),
  smoothPath([[1040, 0], [1110, 200], [1150, 420], [1200, 640], [1250, 900], [1180, 1100], [1120, 1330], [1060, 1600]]),
  smoothPath([[1150, 420], [1480, 310], [1900, 250], [2400, 320]]),
  smoothPath([[1120, 1330], [760, 1420], [520, 1250], [380, 1000]]),
  smoothPath([[1120, 1330], [1580, 1390], [2050, 1180]]),
  smoothPath([[0, 390], [440, 430], [800, 450], [1150, 420]]),
  smoothPath([[380, 1000], [330, 1300], [260, 1600]]),
  smoothPath([[2050, 1180], [2100, 900], [1950, 520], [1900, 250]]),
];

/** Objective villages: holding all three for HOLD_SECONDS wins. */
export const VILLAGES = [
  { id: 'kerovo', name: 'Kerovo', x: 1150, y: 420, r: 72 },
  { id: 'dalnitsa', name: 'Dalnitsa', x: 1250, y: 900, r: 72 },
  { id: 'semovka', name: 'Semovka', x: 1120, y: 1330, r: 72 },
];

/** Scenery villages with labels only. */
export const HAMLETS = [
  { name: 'Brasino', x: 380, y: 1000 },
  { name: 'Ulmeny', x: 2050, y: 1180 },
  { name: 'Tarvel', x: 1900, y: 250 },
  { name: 'Pesnaya', x: 440, y: 430 },
  { name: 'Volgino', x: 2100, y: 760 },
];

export const HILLS = [
  { x: 990, y: 1080, r: 190, h: 1 },
  { x: 1480, y: 640, r: 150, h: 0.9 },
  { x: 620, y: 300, r: 200, h: 0.7 },
  { x: 1900, y: 1450, r: 220, h: 0.8 },
  { x: 1720, y: 1060, r: 130, h: 0.6 },
  { x: 300, y: 1350, r: 170, h: 0.6 },
];

/** Earthworks give cover. ang is the direction the open side faces away from (the front). */
export const REDOUBTS = [
  { x: 975, y: 1000, ang: 0 },
  { x: 1010, y: 1100, ang: 0 },
  { x: 965, y: 1200, ang: 0.2 },
  { x: 1470, y: 610, ang: Math.PI },
  { x: 1530, y: 700, ang: Math.PI },
];

/** Start lines: three blue corps on the west bank, three green corps on the east. */
export const START = {
  b: [
    { x: 430, y: 470, face: 0 },
    { x: 520, y: 900, face: 0 },
    { x: 440, y: 1290, face: 0 },
  ],
  g: [
    { x: 1960, y: 470, face: Math.PI },
    { x: 2010, y: 940, face: Math.PI },
    { x: 1960, y: 1330, face: Math.PI },
  ],
};

export const REGIMENTS_PER_CORPS = 6;
