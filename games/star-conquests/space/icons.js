// Lucide icons for space HUD. Prefer ../vendor/lucide/<name>.svg; inline fallback.
// Gold stroke via CSS color: #d4af37 / currentColor on .sc-ico

const INLINE = {
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 10.5C7.5 20.5 4 18 4 13V6a2 2 0 0 1 2-2c2 0 5-1 6-2 1 1 4 2 6 2a2 2 0 0 1 2 2z"/>',
  swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
  crosshair: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  'shield-half': '<path d="M20 13c0 5-3.5 7.5-8 10.5C7.5 20.5 4 18 4 13V6a2 2 0 0 1 2-2c2 0 5-1 6-2 1 1 4 2 6 2a2 2 0 0 1 2 2z"/><path d="M12 22V2"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  'fast-forward': '<polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/>',
  'volume-2': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  'volume-x': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  // extras used by BF2 HUD
  bomb: '<circle cx="12" cy="12" r="3"/><path d="M19 7.5V5a1 1 0 0 0-1-1h-2.5"/><path d="M14.5 4 17 6.5"/><path d="m18 2 2 2"/><path d="M12 15v3"/><path d="M9 18h6"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  target: '<circle cx="12" cy="12" r="2"/><path d="M16 8v5a4 4 0 0 1-4 4H6"/><circle cx="12" cy="12" r="8"/>',
  gamepad: '<line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  joystick: '<path d="M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2z"/><path d="M6.5 8a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0"/><path d="M10 11.5V17"/>',
};

const MAP = {
  hp: 'heart', shield: 'shield', attack: 'swords', range: 'crosshair', speed: 'gauge',
  armor: 'shield-half', pause: 'pause', resume: 'play', retreat: 'flag',
  'speed-toggle': 'fast-forward', sound: 'volume-2', mute: 'volume-x',
  back: 'arrow-left', close: 'x', tickets: 'rocket', target: 'crosshair',
  lead: 'gamepad', command: 'eye', fire: 'crosshair', boost: 'fast-forward',
  bomber: 'bomb', hangar: 'rocket',
  // roster / ship-stats / battleship-stats aliases (no emoji in source)
  scout: 'rocket', fighter: 'gamepad', interceptor: 'fast-forward',
  corvette: 'shield', cruiser: 'shield', dreadnought: 'shield',
  planet: 'target', rifle: 'swords',
  hull: 'rocket', wings: 'fast-forward', engines: 'gauge', guns: 'crosshair', seats: 'gamepad',
  frigate: 'shield', plated: 'shield-half', reactive: 'shield', heavy: 'shield-half',
  basic: 'shield', deflector: 'shield', aegis: 'shield',
  laser: 'crosshair', pulse: 'crosshair', missile: 'rocket', rail: 'crosshair', lance: 'crosshair',
  bay: 'rocket', pods: 'flag', carrier: 'rocket',
  ion: 'gauge', fusion: 'gauge', gravitic: 'gauge', warp: 'fast-forward',
  bomb: 'bomb', hangar: 'rocket',
  none: 'x', light: 'shield', medium: 'shield',
  arrow: 'fast-forward', brick: 'shield', titan: 'shield',
  stubs: 'fast-forward', delta: 'fast-forward', swept: 'gamepad', broad: 'gamepad',
  twin: 'gauge', plasma: 'gauge',
  firepower: 'swords', turn: 'gauge', cost: 'flag', armor: 'shield-half',
  hp: 'heart', range: 'crosshair', speed: 'gauge', attack: 'swords',
};

function svgWrap(inner, cls) {
  return `<svg class="sc-ico ${cls || ''}" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/** Synchronous icon HTML (inline Lucide paths). name = lucide file or logical key. */
export function iconHtml(name, cls = '') {
  const file = MAP[name] || name;
  const inner = INLINE[file] || INLINE.x;
  return svgWrap(inner, cls);
}

export function iconName(logical) { return MAP[logical] || logical; }
