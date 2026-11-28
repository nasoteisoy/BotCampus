// Chunky toy furniture made of boxes. Each builder returns a footprint (w × d, back against -z)
// and parts [x, y, z, sx, sy, sz, color] in local space. `top` is a shelf height loot can sit on.
const C = {
  wood: 0x9a5b3a, woodDark: 0x6b3b26, woodLight: 0xc98a52, cream: 0xf3e3c3, teal: 0x2f9e94,
  mustard: 0xe0a83e, coral: 0xe56f61, navy: 0x34507e, plum: 0x7a3f8f, black: 0x2a2230, white: 0xf5efe6,
  green: 0x4e9a52, pot: 0xc0643c, metal: 0xa9b2bf, rose: 0xd88aa6, brass: 0xe6c15a,
};
export const FURN_COLORS = C;

const legs = (w, d, h, t, col) => [
  [-w / 2 + t / 2, h / 2, -d / 2 + t / 2, t, h, t, col], [w / 2 - t / 2, h / 2, -d / 2 + t / 2, t, h, t, col],
  [-w / 2 + t / 2, h / 2, d / 2 - t / 2, t, h, t, col], [w / 2 - t / 2, h / 2, d / 2 - t / 2, t, h, t, col],
];

export const FURNITURE = {
  bed(r) {
    const cover = r.pick([C.teal, C.coral, C.navy, C.rose]);
    return { w: 1.7, d: 2.2, h: 0.95, top: 0.62, parts: [
      [0, 0.22, 0, 1.7, 0.44, 2.2, C.woodDark], [0, 0.52, 0.1, 1.6, 0.18, 1.95, cover],
      [0, 0.66, -0.75, 1.3, 0.14, 0.4, C.white], [0, 0.6, -1.05, 1.7, 1.2, 0.12, C.wood]] };
  },
  sofa(r) {
    const col = r.pick([C.teal, C.mustard, C.coral, C.plum]);
    return { w: 2.2, d: 0.95, h: 0.95, parts: [
      [0, 0.25, 0.05, 2.2, 0.5, 0.85, col], [0, 0.7, -0.33, 2.2, 0.55, 0.28, col],
      [-1.0, 0.55, 0.05, 0.22, 0.3, 0.85, col], [1.0, 0.55, 0.05, 0.22, 0.3, 0.85, col],
      [-0.5, 0.55, 0.1, 0.95, 0.1, 0.6, C.cream], [0.5, 0.55, 0.1, 0.95, 0.1, 0.6, C.cream]] };
  },
  armchair(r) {
    const col = r.pick([C.mustard, C.coral, C.teal, C.rose]);
    return { w: 1.0, d: 0.95, h: 1.0, parts: [
      [0, 0.25, 0.05, 1.0, 0.5, 0.85, col], [0, 0.75, -0.33, 1.0, 0.6, 0.26, col],
      [-0.42, 0.6, 0.05, 0.18, 0.25, 0.85, col], [0.42, 0.6, 0.05, 0.18, 0.25, 0.85, col]] };
  },
  dresser() {
    return { w: 1.5, d: 0.6, h: 0.95, top: 0.95, parts: [
      [0, 0.47, 0, 1.5, 0.94, 0.6, C.wood], [0, 0.25, 0.31, 1.3, 0.25, 0.04, C.woodLight], [0, 0.62, 0.31, 1.3, 0.25, 0.04, C.woodLight],
      [-0.35, 0.25, 0.34, 0.12, 0.06, 0.04, C.brass], [0.35, 0.62, 0.34, 0.12, 0.06, 0.04, C.brass]] };
  },
  wardrobe() {
    return { w: 1.4, d: 0.7, h: 2.2, parts: [
      [0, 1.1, 0, 1.4, 2.2, 0.7, C.woodDark], [-0.35, 1.1, 0.36, 0.62, 1.95, 0.04, C.wood], [0.35, 1.1, 0.36, 0.62, 1.95, 0.04, C.wood],
      [-0.08, 1.1, 0.4, 0.06, 0.2, 0.04, C.brass], [0.08, 1.1, 0.4, 0.06, 0.2, 0.04, C.brass]] };
  },
  bookshelf(r) {
    const parts = [[0, 1.1, 0, 1.4, 2.2, 0.45, C.woodDark]];
    const books = [C.coral, C.teal, C.mustard, C.navy, C.plum, C.green, C.cream];
    for (let s = 0; s < 4; s++) {
      let x = -0.6;
      while (x < 0.55) { const bw = r.range(0.07, 0.16); const bh = r.range(0.28, 0.42);
        parts.push([x + bw / 2, 0.12 + s * 0.52 + bh / 2, 0.06, bw - 0.01, bh, 0.32, r.pick(books)]); x += bw; }
    }
    return { w: 1.4, d: 0.45, h: 2.2, parts };
  },
  lamp(r) {
    const shade = r.pick([C.cream, C.mustard, C.rose]);
    return { w: 0.5, d: 0.5, h: 1.7, glow: [0, 1.45, 0], parts: [
      [0, 0.04, 0, 0.45, 0.08, 0.45, C.black], [0, 0.75, 0, 0.07, 1.4, 0.07, C.black], [0, 1.45, 0, 0.5, 0.4, 0.5, shade]] };
  },
  plant() {
    return { w: 0.6, d: 0.6, h: 1.3, parts: [
      [0, 0.22, 0, 0.5, 0.44, 0.5, C.pot], [0, 0.75, 0, 0.55, 0.55, 0.55, C.green], [0.1, 1.1, -0.05, 0.35, 0.35, 0.35, C.green]] };
  },
  piano() {
    return { w: 1.7, d: 0.75, h: 1.3, top: 1.3, parts: [
      [0, 0.65, -0.1, 1.7, 1.3, 0.55, C.black], [0, 0.78, 0.25, 1.6, 0.08, 0.3, C.white], [0, 0.84, 0.18, 1.6, 0.04, 0.12, C.black],
      [0, 0.2, 0.3, 0.9, 0.06, 0.3, C.woodDark]] };
  },
  fireplace() {
    return { w: 1.9, d: 0.6, h: 1.4, top: 1.4, glow: [0, 0.45, 0.2], parts: [
      [0, 0.7, 0, 1.9, 1.4, 0.6, 0xb5654a], [0, 0.45, 0.2, 1.0, 0.75, 0.3, 0x2a1418], [0, 1.42, 0.05, 2.1, 0.1, 0.75, C.cream],
      [0, 0.25, 0.25, 0.6, 0.2, 0.2, 0xff9a3c]] };
  },
  desk() {
    return { w: 1.5, d: 0.75, h: 0.8, top: 0.8, parts: [
      [0, 0.77, 0, 1.5, 0.08, 0.75, C.woodLight], [-0.55, 0.37, 0, 0.35, 0.74, 0.7, C.wood], ...legs(1.5, 0.75, 0.74, 0.08, C.wood).slice(1, 2)] };
  },
  counter() {
    return { w: 2.0, d: 0.7, h: 0.95, top: 0.95, parts: [
      [0, 0.45, 0, 2.0, 0.9, 0.7, C.cream], [0, 0.93, 0, 2.06, 0.06, 0.76, C.metal], [-0.5, 0.45, 0.36, 0.8, 0.7, 0.03, C.teal], [0.5, 0.45, 0.36, 0.8, 0.7, 0.03, C.teal]] };
  },
  stove() {
    return { w: 0.9, d: 0.7, h: 0.95, top: 0.95, glow: [0, 0.98, 0], parts: [
      [0, 0.45, 0, 0.9, 0.9, 0.7, C.white], [0, 0.93, 0, 0.9, 0.06, 0.7, C.black], [0, 0.45, 0.36, 0.6, 0.45, 0.03, C.black]] };
  },
  fridge() {
    return { w: 0.9, d: 0.75, h: 1.9, parts: [
      [0, 0.95, 0, 0.9, 1.9, 0.75, 0xd9eef0], [0.3, 1.2, 0.39, 0.05, 0.5, 0.04, C.metal], [0, 1.25, 0.38, 0.86, 0.02, 0.02, C.metal]] };
  },
  crates(r) {
    const parts = [[0, 0.4, 0, 0.8, 0.8, 0.8, C.woodLight]];
    if (r.chance(0.7)) parts.push([0.75, 0.3, 0.05, 0.6, 0.6, 0.6, C.wood]);
    if (r.chance(0.5)) parts.push([0.05, 1.05, 0, 0.55, 0.5, 0.55, C.wood]);
    return { w: 1.4, d: 0.85, h: 1.3, parts };
  },
  tub() {
    return { w: 1.8, d: 0.85, h: 0.65, parts: [
      [0, 0.3, 0, 1.8, 0.6, 0.85, C.white], [0, 0.58, 0, 1.6, 0.05, 0.65, 0x8fd3e8], [-0.75, 0.75, -0.3, 0.1, 0.3, 0.1, C.metal]] };
  },
  sink() {
    return { w: 0.8, d: 0.55, h: 0.9, top: 0.9, parts: [
      [0, 0.42, 0, 0.8, 0.84, 0.55, C.teal], [0, 0.88, 0, 0.84, 0.06, 0.6, C.white], [0, 1.4, -0.25, 0.6, 0.7, 0.04, 0xbfe6f0]] };
  },
  // centerpieces (no back wall)
  dining(r) {
    const cloth = r.pick([C.cream, C.rose, C.teal]);
    const parts = [[0, 0.76, 0, 2.4, 0.08, 1.2, cloth], ...legs(2.2, 1.0, 0.72, 0.1, C.wood)];
    for (const sx of [-0.75, 0, 0.75]) for (const sz of [-0.9, 0.9]) {
      parts.push([sx, 0.25, sz, 0.45, 0.5, 0.45, C.woodDark], [sx, 0.7, sz + Math.sign(sz) * 0.2, 0.45, 0.5, 0.08, C.woodDark]);
    }
    return { w: 2.4, d: 2.3, h: 1.0, top: 0.8, center: true, parts };
  },
  coffee() {
    return { w: 1.2, d: 0.7, h: 0.45, top: 0.45, center: true, parts: [[0, 0.42, 0, 1.2, 0.07, 0.7, C.woodLight], ...legs(1.1, 0.6, 0.4, 0.08, C.woodDark)] };
  },
  billiard() {
    return { w: 2.4, d: 1.4, h: 0.85, top: 0.85, center: true, parts: [
      [0, 0.75, 0, 2.4, 0.16, 1.4, C.woodDark], [0, 0.84, 0, 2.15, 0.04, 1.15, C.green], [-1.0, 0.36, -0.5, 0.18, 0.72, 0.18, C.woodDark],
      [1.0, 0.36, -0.5, 0.18, 0.72, 0.18, C.woodDark], [-1.0, 0.36, 0.5, 0.18, 0.72, 0.18, C.woodDark], [1.0, 0.36, 0.5, 0.18, 0.72, 0.18, C.woodDark]] };
  },
  roundtable(r) {
    return { w: 1.3, d: 1.3, h: 0.8, top: 0.8, center: true, parts: [
      [0, 0.76, 0, 1.3, 0.08, 1.3, r.pick([C.cream, C.woodLight])], [0, 0.38, 0, 0.18, 0.72, 0.18, C.woodDark], [0, 0.04, 0, 0.7, 0.08, 0.7, C.woodDark]] };
  },
};

export const THEMES = {
  bedroom: { wall: ['bed', 'dresser', 'wardrobe', 'lamp', 'plant', 'armchair'], mid: ['bed'], center: [null], rug: C.teal },
  lounge:  { wall: ['sofa', 'armchair', 'bookshelf', 'lamp', 'piano', 'plant'], mid: ['sofa', 'fireplace'], center: ['coffee'], rug: C.mustard },
  dining:  { wall: ['dresser', 'plant', 'lamp', 'counter'], mid: ['fireplace', 'dresser'], center: ['dining'], rug: C.coral },
  library: { wall: ['bookshelf', 'bookshelf', 'armchair', 'desk', 'lamp'], mid: ['bookshelf', 'desk'], center: ['roundtable'], rug: C.navy },
  kitchen: { wall: ['counter', 'stove', 'fridge', 'crates'], mid: ['counter', 'stove'], center: ['roundtable'], rug: 0x6f8f8a },
  game:    { wall: ['armchair', 'bookshelf', 'lamp', 'plant', 'piano'], mid: ['fireplace', 'sofa'], center: ['billiard'], rug: C.plum },
  bath:    { wall: ['tub', 'sink', 'plant', 'crates'], mid: ['tub', 'sink'], center: [null], rug: 0x8fbcd0 },
  storage: { wall: ['crates', 'crates', 'wardrobe', 'crates'], mid: ['crates'], center: [null], rug: null },
};
