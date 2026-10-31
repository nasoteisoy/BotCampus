// Fixed unit catalog + shop helpers. Points only; no locks/medals/editors.
// icon = emoji string for CONTRACT / battle modules.
// Shell UI uses unitIconHtml() so Rifle/Heavy/Tank render as crisp SVGs.

export const CATALOG = Object.freeze([
  Object.freeze({ type: 'rifle', name: 'Rifle Trooper', icon: 'rifle', cost: 50,
    stats: Object.freeze({ hp: 100, attack: 12, range: 3, speed: 4, armor: 1 }), role: 'ground' }),
  Object.freeze({ type: 'heavy', name: 'Heavy Trooper', icon: 'heavy', cost: 80,
    stats: Object.freeze({ hp: 160, attack: 22, range: 2, speed: 2, armor: 3 }), role: 'ground' }),
  Object.freeze({ type: 'recon', name: 'Recon Trooper', icon: 'rifle', cost: 60,
    stats: Object.freeze({ hp: 80, attack: 14, range: 5, speed: 5, armor: 0 }), role: 'ground' }),
  Object.freeze({ type: 'tank', name: 'Tank', icon: 'tank', cost: 200,
    stats: Object.freeze({ hp: 400, attack: 40, range: 4, speed: 2, armor: 8 }), role: 'ground' }),
  Object.freeze({ type: 'spaceship', name: 'SpaceShip', icon: 'ship', cost: 150,
    stats: Object.freeze({ hp: 200, attack: 25, range: 4, speed: 6, armor: 3 }), role: 'space' }),
  Object.freeze({ type: 'battleship', name: 'BattleShip', icon: 'battleship', cost: 350,
    stats: Object.freeze({ hp: 500, attack: 55, range: 6, speed: 3, armor: 10 }), role: 'space' }),
]);

export const byType = (t) => CATALOG.find((c) => c.type === t);
export const GROUND_TYPES = new Set(['rifle', 'heavy', 'recon', 'tank']);
export const SPACE_TYPES = new Set(['spaceship', 'battleship']);

let _uid = 0;
export function resetUid(n = 0) { _uid = n | 0; }
export function nextUid() { return `u-${(++_uid).toString(36)}`; }
export function peekUid() { return _uid; }

export function makeUnit(type, nameExtra = '') {
  const c = byType(type);
  if (!c) throw new Error('unknown unit type');
  const n = nameExtra || `${c.name}`;
  return {
    id: nextUid(),
    type: c.type,
    name: n,
    icon: c.icon,
    stats: { ...c.stats },
    hpNow: c.stats.hp,
  };
}

export const STAT_LABELS = [
  { key: 'hp', icon: 'heart', word: 'HP' },
  { key: 'attack', icon: 'swords', word: 'Attack' },
  { key: 'range', icon: 'crosshair', word: 'Range' },
  { key: 'speed', icon: 'gauge', word: 'Speed' },
  { key: 'armor', icon: 'shield', word: 'Armor' },
];

/** 3–4 icon bars for shop cards (Deploy-card look). */
export const BAR_STATS = [
  { key: 'hp', icon: 'heart', max: 500, color: '#3ecf8e' },
  { key: 'attack', icon: 'swords', max: 55, color: '#f5a623' },
  { key: 'speed', icon: 'gauge', max: 6, color: '#5bbcff' },
  { key: 'armor', icon: 'shield', max: 10, color: '#c9d2e8' },
];

export function filterForBattle(units, battleType) {
  const set = battleType === 'space' ? SPACE_TYPES : GROUND_TYPES;
  return units.filter((u) => set.has(u.type) && u.hpNow > 0);
}

/** Helmeted rifle trooper holding a long rifle — same language as Heavy. */
const SVG_RIFLE = `<svg class="unit-svg" viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" focusable="false">
  <circle cx="10.5" cy="8" r="5.5" fill="#d8e0f4"/>
  <path d="M4.8 8.2c0-3.4 2.5-5.8 5.7-5.8s5.7 2.4 5.7 5.8" fill="none" stroke="#1a2438" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M5.8 6.8h9.4" stroke="#f5c518" stroke-width="2" stroke-linecap="round"/>
  <path d="M6.5 14s1.5 10.5 4.1 10.5S14.7 14 14.7 14" fill="#4a5f8a"/>
  <path d="M7.6 16h5.8v8c0 1.6-1.3 2.8-2.9 2.8S7.6 25.6 7.6 24z" fill="#3aa0ff"/>
  <!-- rifle: stock + receiver + long barrel (no toy tip) -->
  <path d="M3.5 18.2 L8.5 16.5 L9.2 18.2 L5.2 20.2 Z" fill="#2a3348" stroke="#c9d2e8" stroke-width=".8"/>
  <rect x="8.5" y="15.6" width="7" height="3.2" rx=".7" fill="#3a4a68" stroke="#e8eefc" stroke-width=".9"/>
  <rect x="15" y="16.2" width="14.5" height="2" rx=".5" fill="#1a2438" stroke="#9aa8c7" stroke-width=".8"/>
  <rect x="28.5" y="15.8" width="2.2" height="2.8" rx=".4" fill="#5b6f9a"/>
  <rect x="11.2" y="18.6" width="1.8" height="3.6" rx=".4" fill="#1a2438"/>
  <circle cx="12.2" cy="17" r="1.1" fill="#e8eefc"/>
  <path d="M9 18.5 L12 17.2" stroke="#d8e0f4" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

const SVG_HEAVY = `<svg class="unit-svg" viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" focusable="false">
  <circle cx="12.5" cy="7.5" r="7" fill="#d8e0f4"/>
  <path d="M5 8c0-4.2 3.2-7.2 7.5-7.2S20 3.8 20 8" fill="none" stroke="#1a2438" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M6 6.5h13" stroke="#f5c518" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M6.5 13.5s2 12 6 12 6-12 6-12" fill="#4a5f8a"/>
  <path d="M8 16h9v9c0 2-1.8 3.4-4.5 3.4S8 27 8 25z" fill="#3aa0ff"/>
  <path d="M18.5 10.5c6 1.6 10 6 10 11 0 5.5-4.6 9.2-9.8 9.2-.7 0-1.4-.07-2.1-.2" fill="#f0f4ff" stroke="#1a2438" stroke-width="1.8"/>
  <path d="M19.2 14.5c3.8 1.2 6.2 4 6.2 7 0 3.5-2.8 6-6.2 6" fill="none" stroke="#f5c518" stroke-width="1.8"/>
  <circle cx="22.2" cy="20.5" r="2" fill="#3aa0ff"/>
</svg>`;

/** Side-view tank: hull, turret, long barrel — readable at small size. */
/** Scout trooper: same helmet family + antenna scout mark (not a dish alone). */
const SVG_RECON = `<svg class="unit-svg" viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" focusable="false">
  <circle cx="12" cy="8" r="5.5" fill="#d8e0f4"/>
  <path d="M6.2 8.2c0-3.4 2.5-5.8 5.8-5.8s5.8 2.4 5.8 5.8" fill="none" stroke="#1a2438" stroke-width="2.8" stroke-linecap="round"/>
  <path d="M7.2 6.8h9.6" stroke="#3ecf8e" stroke-width="2" stroke-linecap="round"/>
  <path d="M8 14s1.5 10.5 4.1 10.5S16.2 14 16.2 14" fill="#4a5f8a"/>
  <path d="M9.1 16h5.8v8c0 1.6-1.3 2.8-2.9 2.8S9.1 25.6 9.1 24z" fill="#3aa0ff"/>
  <rect x="15.5" y="15.5" width="12" height="2.2" rx=".6" fill="#1a2438" stroke="#9aa8c7" stroke-width=".8"/>
  <rect x="26.5" y="15" width="2.2" height="3.2" rx=".4" fill="#3ecf8e"/>
  <!-- scout antenna -->
  <line x1="17.5" y1="8" x2="17.5" y2="2" stroke="#f5c518" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="17.5" cy="1.5" r="1.6" fill="#3ecf8e" stroke="#fff" stroke-width=".6"/>
</svg>`;

const SVG_TANK = `<svg class="unit-svg" viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" focusable="false">
  <rect x="0.5" y="20.5" width="26" height="8.5" rx="2.2" fill="#2a3348" stroke="#e8eefc" stroke-width="1.6"/>
  <circle cx="6" cy="24.8" r="3" fill="#0e141e" stroke="#fff" stroke-width="1.2"/>
  <circle cx="14" cy="24.8" r="3" fill="#0e141e" stroke="#fff" stroke-width="1.2"/>
  <circle cx="22" cy="24.8" r="3" fill="#0e141e" stroke="#fff" stroke-width="1.2"/>
  <path d="M2.5 20.5h22l-1.8-9.5H4.5z" fill="#5b6f9a" stroke="#fff" stroke-width="1.4"/>
  <rect x="8" y="8" width="12.5" height="7" rx="1.8" fill="#3aa0ff" stroke="#fff" stroke-width="1.4"/>
  <rect x="18" y="10" width="13.5" height="3.2" rx="1.4" fill="#f5c518" stroke="#c9a010" stroke-width="1.1"/>
  <circle cx="14" cy="11.5" r="1.5" fill="#fff"/>
</svg>`;

/**
 * Shell UI icon for a unit type or unit object.
 * Rifle/Heavy/Tank → inline SVG; others → catalog emoji. Battles still get emoji via unit.icon.
 */
const SVG_SPACESHIP = `<svg class="unit-svg" viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" focusable="false">
  <path d="M4 16 L14 12 L26 14 L30 16 L26 18 L14 20 Z" fill="#c9d2e8" stroke="#e8eefc" stroke-width="1.2"/>
  <path d="M10 16 L16 8 L20 14 L14 16 Z" fill="#7a88a8"/>
  <path d="M10 16 L16 24 L20 18 L14 16 Z" fill="#7a88a8"/>
  <ellipse cx="22" cy="16" rx="4" ry="3" fill="#3aa0ff" stroke="#fff" stroke-width="1"/>
  <path d="M2 16 L8 14 L8 18 Z" fill="#e04848"/>
</svg>`;

const SVG_BATTLESHIP = `<svg class="unit-svg" viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" focusable="false">
  <path d="M2 18 L8 12 L24 10 L30 16 L24 22 L8 20 Z" fill="#b8c4dc" stroke="#fff" stroke-width="1.2"/>
  <rect x="10" y="8" width="12" height="6" rx="1.5" fill="#5b6f9a" stroke="#e8eefc" stroke-width="1"/>
  <circle cx="16" cy="11" r="2" fill="#3aa0ff"/>
  <rect x="22" y="12" width="8" height="2.5" rx="1" fill="#f5c518"/>
  <circle cx="6" cy="16" r="2" fill="#e04848"/>
  <circle cx="10" cy="15" r="1.5" fill="#e04848"/>
</svg>`;


export function unitIconHtml(typeOrUnit) {
  const type = typeof typeOrUnit === 'string' ? typeOrUnit : typeOrUnit?.type;
  if (type === 'rifle') return `<span class="u-ic-svg" data-type="rifle">${SVG_RIFLE}</span>`;
  if (type === 'heavy') return `<span class="u-ic-svg" data-type="heavy">${SVG_HEAVY}</span>`;
  if (type === 'recon') return `<span class="u-ic-svg" data-type="recon">${SVG_RECON}</span>`;
  if (type === 'tank') return `<span class="u-ic-svg" data-type="tank">${SVG_TANK}</span>`;
  if (type === 'spaceship') return `<span class="u-ic-svg" data-type="spaceship">${SVG_SPACESHIP}</span>`;
  if (type === 'battleship') return `<span class="u-ic-svg" data-type="battleship">${SVG_BATTLESHIP}</span>`;
  // No emoji art in shell — blank placeholder if type unknown
  return `<span class="u-ic-svg" data-type="unknown" aria-hidden="true"></span>`;
}


/** Cached PNG dataURLs for unit types (Army HQ low-poly via ground/models3d). */
const _thumbCache = new Map();

/**
 * Render a unit thumbnail. Prefer 3D from ../ground/models3d.js; fall back to unitIconHtml SVG.
 * endcard.js (Dev B) should call this: unitThumbHtml(unit|type, size).
 * @param {string|object} typeOrUnit
 * @param {number} [size=64]
 * @returns {string} HTML string (img or svg span)
 */
export function unitThumbHtml(typeOrUnit, size = 64) {
  const type = typeof typeOrUnit === 'string' ? typeOrUnit : typeOrUnit?.type;
  const key = `${type || 'x'}:${size}:v3`;
  const cached = _thumbCache.get(key);
  if (cached) return `<img class="u-thumb" width="${size}" height="${size}" alt="" src="${cached}" draggable="false"/>`;
  // Sync fallback while async bake runs
  queueMicrotask(() => { bakeThumb(type, size).catch(() => {}); });
  return `<span class="u-thumb-fall" style="width:${size}px;height:${size}px">${unitIconHtml(typeOrUnit)}</span>`;
}

async function bakeThumb(type, size) {
  const key = `${type}:${size}:v3`;
  if (_thumbCache.has(key)) return _thumbCache.get(key);
  try {
    const THREE = await import('../vendor/three.module.min.js');
    const T = THREE.default || THREE;
    let root = null;
    const team = '#3aa0ff';
    if (type === 'spaceship' || type === 'battleship') {
      try {
        const ships = await import('../space/ships3d.js');
        root = type === 'battleship'
          ? ships.buildBattleShip('corvette', team)
          : ships.buildSpaceShip('fighter', team);
      } catch {
        root = null;
      }
    } else {
      const m = await import('../ground/models3d.js');
      if (type === 'tank') root = m.makeTank(team);
      else root = m.makeTrooper(type === 'heavy' || type === 'recon' ? type : 'rifle', team);
    }
    if (!root) return null;
    const scene = new T.Scene();
    scene.add(root);
    root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(root);
    const sizeV = new T.Vector3();
    const center = new T.Vector3();
    box.getSize(sizeV);
    box.getCenter(center);
    const maxDim = Math.max(sizeV.x, sizeV.y, sizeV.z, 0.05);
    const fovDeg = 32;
    const fov = (fovDeg * Math.PI) / 180;
    // Fit whole model with padding so torsos/tanks aren't cropped
    const fitDist = (maxDim * 0.5) / Math.tan(fov / 2) * 1.45;
    const cam = new T.PerspectiveCamera(fovDeg, 1, 0.05, 80);
    cam.position.set(
      center.x + fitDist * 0.55,
      center.y + fitDist * 0.28,
      center.z + fitDist * 0.78,
    );
    cam.lookAt(center.x, center.y + sizeV.y * 0.02, center.z);
    scene.add(new T.AmbientLight(0xffffff, 0.9));
    const d = new T.DirectionalLight(0xffffff, 0.95); d.position.set(3, 5, 2); scene.add(d);
    const fill = new T.DirectionalLight(0x88aaff, 0.35); fill.position.set(-2, 1, -2); scene.add(fill);
    const renderer = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    _thumbCache.set(key, url);
    renderer.dispose();
    try {
      const m = await import('../ground/models3d.js');
      if (m.disposeObject3D) m.disposeObject3D(root);
    } catch { /* */ }
    // notify UI
    document.dispatchEvent(new CustomEvent('sc-thumbs-ready', { detail: { type, size } }));
    return url;
  } catch (err) {
    return null;
  }
}

/** Warm cache for fleets + class trooper types (call once from shell). */
export function warmUnitThumbs(size = 64) {
  const types = new Set(CATALOG.map((c) => c.type));
  for (const t of ['rifle', 'heavy', 'recon']) types.add(t);
  for (const t of types) bakeThumb(t, size).catch(() => {});
  // Shop cards use 72; deploy strip uses 48 — warm both common sizes
  if (size !== 72) for (const t of types) bakeThumb(t, 72).catch(() => {});
  if (size !== 48) for (const t of types) bakeThumb(t, 48).catch(() => {});
}
