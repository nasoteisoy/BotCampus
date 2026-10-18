// Inline SVG icons (planet units adapted from Front Line; ships from Space Defense) for build bar, production and selection panels. Simple silhouettes, team color via currentColor.
const tank = (s = 1, heavy = false, td = false) => `<g transform="translate(${20 - 20 * s} ${22 - 22 * s}) scale(${s})"><rect x="3" y="20" width="34" height="8" rx="4" fill="#222"/><rect x="6" y="14" width="28" height="7" rx="2" fill="currentColor"/>${heavy ? '<rect x="11" y="7" width="17" height="8" rx="1" fill="currentColor"/>' : '<rect x="13" y="8" width="13" height="7" rx="3" fill="currentColor"/>'}<rect x="25" y="10" width="${heavy ? 15 : 12}" height="2.4" fill="#ccc"/></g>`;
const man = (x, y, s = 1, extra = '') => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-9" r="2.6" fill="#e0b48c"/><path d="M-3 -6h6v7h-6z" fill="currentColor"/><path d="M-3 1h2.4v7h-2.4zM.6 1h2.4v7h-2.4z" fill="#333"/>${extra}</g>`;
const squad = (n, extra = '') => { const out = []; const cols = Math.min(n, 4), rows = Math.ceil(n / 4); for (let i = 0; i < n; i++) { const c = i % 4, r = Math.floor(i / 4); out.push(man(8 + c * 8 + (r % 2) * 4, 18 + r * 10 - (rows - 1) * 4, rows > 1 ? .75 : .95, extra)); } return out.join(''); };
const gun = (barrel = 16, raise = 0) => `<g><circle cx="13" cy="24" r="4.5" fill="#222"/><path d="M8 22l-6 6M10 21l-6 2" stroke="#555" stroke-width="2"/><rect x="10" y="12" width="9" height="11" fill="currentColor"/><rect x="18" y="${16 - raise}" width="${barrel}" height="2.6" fill="#ccc" transform="rotate(${-raise * 3} 18 17)"/></g>`;
const plane = (big = false) => `<g transform="translate(20 16)">${big ? '<rect x="-17" y="-2" width="34" height="5" rx="2" fill="currentColor"/><rect x="-3" y="-12" width="6" height="26" rx="3" fill="currentColor"/><rect x="-7" y="10" width="14" height="3" fill="currentColor"/><circle cx="-9" cy="-2" r="2" fill="#333"/><circle cx="9" cy="-2" r="2" fill="#333"/>' : '<rect x="-15" y="-1" width="30" height="4" rx="2" fill="currentColor"/><rect x="-2.5" y="-11" width="5" height="22" rx="2.5" fill="currentColor"/><rect x="-6" y="8" width="12" height="3" fill="currentColor"/><rect x="-5" y="-13" width="10" height="1.5" fill="#333"/>'}</g>`;
export const ICON = {
  rifle: squad(8), bazooka: squad(4, '<path d="M-5 -8l10 -2" stroke="#4b5a35" stroke-width="2.2"/>'), scout: squad(3, '<path d="M2 -12v-5" stroke="#222"/>'),
  engineer: squad(5, '<rect x="-4.5" y="-6" width="2" height="5" fill="#6b5a3a"/>'), mgteam: squad(4, '<path d="M2 -5h7" stroke="#222" stroke-width="2"/>'), commando: squad(4, '<rect x="-3" y="-13" width="6" height="2" fill="#7a1f1f"/>'),
  jeep: '<g><rect x="5" y="14" width="28" height="8" rx="2" fill="currentColor"/><rect x="18" y="9" width="2" height="6" fill="#333"/><circle cx="11" cy="23" r="4" fill="#222"/><circle cx="28" cy="23" r="4" fill="#222"/></g>',
  light: tank(.85), medium: tank(1), heavy: tank(1.08, true),
  atgun: gun(18), howitzer: gun(20, 3), aagun: '<g><rect x="8" y="22" width="24" height="4" fill="#444"/><rect x="14" y="14" width="12" height="8" rx="2" fill="currentColor"/><path d="M18 15l8 -12M22 15l8 -12" stroke="#ccc" stroke-width="2.2"/></g>',
  reconplane: plane() + '<circle cx="20" cy="16" r="13" fill="none" stroke="#fff" stroke-dasharray="3 3" opacity=".6"/>', fighter: plane(), fbomber: plane() + '<path d="M10 22h4M26 22h4" stroke="#333" stroke-width="2.5"/>', bomber: plane(true),
  // buildings
  hq: '<g><rect x="6" y="12" width="28" height="16" fill="#c9bfa6"/><rect x="16" y="20" width="8" height="8" fill="currentColor"/><path d="M28 12V2" stroke="#333"/><path d="M28 2h8v5h-8z" fill="currentColor"/></g>',
  depot: '<g><rect x="5" y="17" width="10" height="10" fill="#8b6a3e" stroke="#5a4426"/><rect x="15" y="17" width="10" height="10" fill="#8b6a3e" stroke="#5a4426"/><rect x="10" y="7" width="10" height="10" fill="#8b6a3e" stroke="#5a4426"/><text x="31" y="20" font-size="15" font-weight="900" fill="#ffd65a" text-anchor="middle">$</text></g>',
  barracks: '<g><path d="M4 28a16 14 0 0 1 32 0z" fill="#5d6168"/><rect x="17" y="19" width="6" height="9" fill="currentColor"/></g>',
  recon: '<g><path d="M12 28l3-17M28 28l-3-17" stroke="#7a5a3a" stroke-width="2.5"/><rect x="11" y="9" width="18" height="4" fill="#7a5a3a"/><path d="M9 9l11-7 11 7z" fill="currentColor"/></g>',
  factory: '<g><rect x="4" y="14" width="32" height="14" fill="#c9bfa6"/><path d="M4 14l6-6v6l6-6v6l6-6v6l6-6v6z" fill="#5d6168"/><rect x="31" y="3" width="3" height="11" fill="#77736b"/><rect x="14" y="19" width="12" height="9" fill="currentColor"/></g>',
  atdepot: '<g><rect x="6" y="15" width="28" height="12" fill="#a9a59b"/><rect x="6" y="13" width="28" height="3" fill="#77736b"/><path d="M22 12l12 -6" stroke="#ccc" stroke-width="2.4"/><rect x="14" y="20" width="12" height="7" fill="currentColor"/></g>',
  artillery: '<g><rect x="4" y="20" width="32" height="8" rx="3" fill="#a89466"/><path d="M14 20l16 -14" stroke="#ccc" stroke-width="3"/><rect x="11" y="16" width="8" height="6" fill="currentColor"/></g>',
  airfield: '<g><rect x="2" y="22" width="36" height="5" fill="#4c4f52"/><path d="M5 24.5h4M13 24.5h4M21 24.5h4M29 24.5h4" stroke="#fff"/><path d="M6 21a8 8 0 0 1 16 0z" fill="#5d6168"/><g transform="translate(29 11) scale(.5)"><rect x="-15" y="-1" width="30" height="4" rx="2" fill="currentColor"/><rect x="-2.5" y="-11" width="5" height="22" rx="2.5" fill="currentColor"/></g></g>',
  // abilities
  sprint: '<path d="M8 22l8-4 4 6 6-12M24 8a3 3 0 1 0 0.1 0M6 14h7M4 18h6" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
  ambush: '<g><path d="M20 4l10 22H10z" fill="#3f7a3a"/><path d="M14 10l8 18H6z" fill="#5d9a52"/><circle cx="27" cy="21" r="5" fill="none" stroke="#fff" stroke-width="2"/><path d="M27 15v12M21 21h12" stroke="#fff" stroke-width="1.5"/></g>',
  binoculars: '<g fill="#fff"><circle cx="13" cy="20" r="6"/><circle cx="27" cy="20" r="6"/><rect x="16" y="13" width="8" height="5"/><circle cx="13" cy="20" r="3" fill="#2a6"/><circle cx="27" cy="20" r="3" fill="#2a6"/></g>',
  mine: '<g><ellipse cx="20" cy="22" rx="12" ry="5" fill="#555" stroke="#fff" stroke-width="1.5"/><rect x="17" y="13" width="6" height="7" fill="#777"/><path d="M20 4l2 6h-4z" fill="#ffcc33"/></g>',
  deploy: '<g><path d="M8 28l6-10M32 28l-6-10M20 18v10" stroke="#fff" stroke-width="2.5"/><rect x="10" y="12" width="22" height="5" rx="1" fill="#fff"/><path d="M32 14.5h6" stroke="#ffcc33" stroke-width="2.5"/></g>',
  satchel: '<g><rect x="9" y="14" width="20" height="14" rx="3" fill="#8a6a3a" stroke="#fff" stroke-width="1.5"/><path d="M15 14a5 5 0 0 1 8 0" stroke="#fff" stroke-width="2" fill="none"/><path d="M29 12l5-6M31 15l6-2" stroke="#ffcc33" stroke-width="2.5"/></g>',
  // branch tabs
  tab_inf: man(20, 20, 1.6), tab_armor: tank(1), tab_art: gun(18, 2), tab_air: plane(),
};

// ---------- space (ship silhouettes adapted from Space Defense, games/space-defense/js/icons.js; nose to the right) ----------
const glow = (x, y) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#9ef"/>`;
Object.assign(ICON, {
  corvette: `<g><path d="M36 16L10 9l4 7-4 7z" fill="currentColor"/><path d="M20 16h12" stroke="#9ef" stroke-width="1.6"/>${glow(9, 11)}${glow(9, 21)}</g>`,
  frigate: `<g><path d="M38 16l-8-6H6l-3 3v6l3 3h24z" fill="currentColor"/><rect x="12" y="12" width="12" height="8" rx="2" fill="#333"/><path d="M24 16h10" stroke="#ccc" stroke-width="2"/>${glow(3, 16)}</g>`,
  cruiser: `<g><path d="M39 16l-7-8H5L2 11v10l3 3h27z" fill="currentColor"/><rect x="9" y="10" width="14" height="12" rx="2" fill="#333"/><path d="M22 13h14M22 19h14" stroke="#ccc" stroke-width="2.2"/>${glow(2, 13)}${glow(2, 19)}</g>`,
  carrier: `<g><path d="M39 16l-6-8H4v16h29z" fill="currentColor"/><rect x="8" y="11" width="24" height="10" fill="#333"/><path d="M10 16h20" stroke="#ffd65a" stroke-dasharray="3 2" stroke-width="1.5"/>${glow(3, 12)}${glow(3, 20)}</g>`,
  dropship: `<g><rect x="8" y="9" width="22" height="14" rx="3" fill="currentColor"/><path d="M30 10l7 6-7 6z" fill="currentColor"/><rect x="12" y="12" width="12" height="8" fill="#333"/><path d="M14 14h2v4h-2zM19 14h2v4h-2z" fill="#e0b48c"/>${glow(7, 12)}${glow(7, 20)}</g>`,
  drone: `<g><path d="M30 16L14 9l3 7-3 7z" fill="currentColor"/>${glow(13, 16)}</g>`,
  reconplane: `<g><path d="M30 16L12 11l3 5-3 5z" fill="currentColor"/><circle cx="20" cy="16" r="13" fill="none" stroke="#fff" stroke-dasharray="3 3" opacity=".6"/></g>`,
  fighter: `<g><path d="M38 16L8 10l4 6-4 6z" fill="currentColor"/><path d="M20 16L12 4h4l10 12-10 12h-4z" fill="currentColor" opacity=".75"/>${glow(7, 16)}</g>`,
  fbomber: `<g><path d="M34 16L10 6l5 10-5 10z" fill="currentColor"/><path d="M14 23h8M14 9h8" stroke="#ffb347" stroke-width="2.4"/>${glow(9, 16)}</g>`,
  bomber: `<g><path d="M33 16L18 4h-6l4 8H6v8h10l-4 8h6z" fill="currentColor"/><rect x="18" y="13" width="9" height="6" rx="2" fill="#333"/>${glow(5, 13)}${glow(5, 19)}</g>`,
  station: '<g><circle cx="20" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="20" cy="16" r="5" fill="currentColor"/><path d="M8 16h-6M38 16h-6M20 4V0M20 32v-4" stroke="#ccc" stroke-width="2"/></g>',
  solar: '<g><path d="M20 6v22" stroke="#888" stroke-width="2"/><rect x="3" y="9" width="14" height="14" fill="#2b5fa8" stroke="#9ef"/><rect x="23" y="9" width="14" height="14" fill="#2b5fa8" stroke="#9ef"/><text x="20" y="31" font-size="9" font-weight="900" fill="#ffd65a" text-anchor="middle">$</text></g>',
  shipyard: `<g><path d="M4 6v22M36 6v22M4 8h32M4 26h32" stroke="#8e96a3" stroke-width="2.5"/><path d="M30 17l-5-4H10v8h15z" fill="currentColor"/>${glow(36, 8)}</g>`,
  hangar: `<g><rect x="2" y="22" width="36" height="5" fill="#4a505c"/><path d="M5 24.5h4M13 24.5h4M21 24.5h4M29 24.5h4" stroke="#9ef"/><path d="M4 21V11h14v10z" fill="#8e96a3"/><path d="M36 14L22 10l3 4-3 4z" fill="currentColor"/></g>`,
  sturret: '<g><circle cx="20" cy="20" r="10" fill="#334"/><circle cx="20" cy="20" r="6" fill="currentColor"/><path d="M20 20L36 6" stroke="#6ff3ff" stroke-width="3"/></g>',
  pturret: '<g><path d="M4 28a16 13 0 0 1 32 0z" fill="#77736b"/><rect x="13" y="15" width="14" height="7" rx="2" fill="currentColor"/><path d="M26 17h12" stroke="#ccc" stroke-width="3"/></g>',
  // cross-layer abilities
  orbital: '<g><path d="M20 0v24" stroke="#9ef" stroke-width="5"/><path d="M20 0v24" stroke="#fff" stroke-width="2"/><ellipse cx="20" cy="26" rx="11" ry="4" fill="#ffb347"/><circle cx="20" cy="25" r="3" fill="#fff"/></g>',
  drop: '<g><rect x="11" y="2" width="18" height="9" rx="2" fill="#ddd"/><path d="M20 12v10" stroke="#ffd65a" stroke-width="3"/><path d="M14 19l6 7 6-7" stroke="#ffd65a" stroke-width="3" fill="none"/><path d="M6 29h28" stroke="#c49a68" stroke-width="3"/></g>',
  launch: `<g><path d="M8 26h24" stroke="#888" stroke-width="3"/><path d="M30 12L16 7l3 5-3 5z" fill="#fff"/><path d="M22 22L10 18l2 4-2 4z" fill="#fff"/>${glow(15, 12)}</g>`,
  tab_fleet: `<g><path d="M38 16l-8-6H6l-3 3v6l3 3h24z" fill="#5ce1c8"/>${glow(3, 16)}</g>`,
  view_space: '<g><circle cx="20" cy="16" r="14" fill="#060a24" stroke="#9ef" stroke-width="1.2"/><circle cx="11" cy="9" r="1.1" fill="#fff"/><circle cx="30" cy="23" r="1.1" fill="#fff"/><circle cx="28" cy="8" r="1.5" fill="#fff"/><circle cx="10" cy="22" r=".9" fill="#fff"/><path d="M31 16L13 9.5l3.5 6.5-3.5 6.5z" fill="#cfe9ff" stroke="#59f0ff" stroke-width="1"/><path d="M13 13.5l-5 2.5 5 2.5z" fill="#ffb347"/></g>',
  view_planet: '<g><circle cx="20" cy="16" r="12" fill="#c49a68"/><path d="M9 12c6 2 10-3 22 1M10 21c5-2 12 2 20-1" stroke="#2f7f78" stroke-width="2.5" fill="none"/><ellipse cx="20" cy="16" rx="18" ry="5" fill="none" stroke="#9ef" stroke-width="1.6"/></g>',
});
ICON.tab_air = ICON.fighter;
export const svg = (k, cls = '') => `<svg viewBox="0 0 40 32" class="${cls}">${ICON[k] || ''}</svg>`;
