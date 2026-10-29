// Fixed unit catalog + shop helpers. Points only; no locks/medals/editors.
// icon = emoji string for CONTRACT / battle modules.
// Shell UI uses unitIconHtml() so Rifle/Heavy/Tank render as crisp SVGs.

export const CATALOG = Object.freeze([
  Object.freeze({ type: 'rifle', name: 'Rifle Trooper', icon: '🪖', cost: 50,
    stats: Object.freeze({ hp: 100, attack: 12, range: 3, speed: 4, armor: 1 }), role: 'ground' }),
  Object.freeze({ type: 'heavy', name: 'Heavy Trooper', icon: '🛡️', cost: 80,
    stats: Object.freeze({ hp: 160, attack: 22, range: 2, speed: 2, armor: 3 }), role: 'ground' }),
  Object.freeze({ type: 'recon', name: 'Recon Trooper', icon: '📡', cost: 60,
    stats: Object.freeze({ hp: 80, attack: 14, range: 5, speed: 5, armor: 0 }), role: 'ground' }),
  Object.freeze({ type: 'tank', name: 'Tank', icon: '🚛', cost: 200,
    stats: Object.freeze({ hp: 400, attack: 40, range: 4, speed: 2, armor: 8 }), role: 'ground' }),
  Object.freeze({ type: 'spaceship', name: 'SpaceShip', icon: '🚀', cost: 150,
    stats: Object.freeze({ hp: 200, attack: 25, range: 4, speed: 6, armor: 3 }), role: 'space' }),
  Object.freeze({ type: 'battleship', name: 'BattleShip', icon: '🛸', cost: 350,
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
  { key: 'hp', icon: '❤️', word: 'HP' },
  { key: 'attack', icon: '⚔️', word: 'Attack' },
  { key: 'range', icon: '🎯', word: 'Range' },
  { key: 'speed', icon: '💨', word: 'Speed' },
  { key: 'armor', icon: '🛡️', word: 'Armor' },
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
export function unitIconHtml(typeOrUnit) {
  const type = typeof typeOrUnit === 'string' ? typeOrUnit : typeOrUnit?.type;
  if (type === 'rifle') return `<span class="u-ic-svg" data-type="rifle">${SVG_RIFLE}</span>`;
  if (type === 'heavy') return `<span class="u-ic-svg" data-type="heavy">${SVG_HEAVY}</span>`;
  if (type === 'tank') return `<span class="u-ic-svg" data-type="tank">${SVG_TANK}</span>`;
  const emoji = typeof typeOrUnit === 'string'
    ? (byType(type)?.icon || '')
    : (typeOrUnit?.icon || byType(type)?.icon || '');
  return `<span class="u-ic-emoji">${emoji}</span>`;
}
