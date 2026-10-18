// Inline SVG icons (viewBox 0 0 40 32), team color via currentColor.
// Ground unit / building silhouettes adapted from Front Line (games/tank-2v2/js/icons.js).
const tank = (s = 1, heavy = false) => `<g transform="translate(${20 - 20 * s} ${22 - 22 * s}) scale(${s})"><rect x="3" y="20" width="34" height="8" rx="4" fill="#222"/><rect x="6" y="14" width="28" height="7" rx="2" fill="currentColor"/>${heavy ? '<rect x="11" y="7" width="17" height="8" rx="1" fill="currentColor"/>' : '<rect x="13" y="8" width="13" height="7" rx="3" fill="currentColor"/>'}<rect x="25" y="10" width="${heavy ? 15 : 12}" height="2.4" fill="#ccc"/></g>`;
const man = (x, y, s = 1, extra = '') => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-9" r="2.6" fill="#e0b48c"/><path d="M-3 -6h6v7h-6z" fill="currentColor"/><path d="M-3 1h2.4v7h-2.4zM.6 1h2.4v7h-2.4z" fill="#333"/>${extra}</g>`;
const squad = (n, extra = '') => { const o = []; for (let i = 0; i < n; i++) o.push(man(8 + (i % 4) * 8, 22, .95, extra)); return o.join(''); };
const gun = (barrel = 16, raise = 0) => `<g><circle cx="13" cy="24" r="4.5" fill="#222"/><path d="M8 22l-6 6M10 21l-6 2" stroke="#555" stroke-width="2"/><rect x="10" y="12" width="9" height="11" fill="currentColor"/><rect x="18" y="${16 - raise}" width="${barrel}" height="2.6" fill="#ccc" transform="rotate(${-raise * 3} 18 17)"/></g>`;
const glow = (x, y) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#9ef"/>`;
export const ICON = {
  // player ships (nose to the right)
  fighter: `<g><path d="M34 16L10 6l5 10-5 10z" fill="currentColor"/><path d="M22 16l-8-4v8z" fill="#cfe"/>${glow(9, 16)}</g>`,
  interceptor: `<g><path d="M38 16L8 10l4 6-4 6z" fill="currentColor"/><path d="M20 16L12 4h4l10 12-10 12h-4z" fill="currentColor" opacity=".75"/>${glow(7, 16)}</g>`,
  bomber: `<g><path d="M33 16L18 4h-6l4 8H6v8h10l-4 8h6z" fill="currentColor"/><rect x="18" y="13" width="9" height="6" rx="2" fill="#333"/>${glow(5, 13)}${glow(5, 19)}</g>`,
  frigate: `<g><path d="M38 16l-8-6H6l-3 3v6l3 3h24z" fill="currentColor"/><rect x="12" y="12" width="12" height="8" rx="2" fill="#333"/><path d="M24 16h10" stroke="#ccc" stroke-width="2"/>${glow(3, 16)}</g>`,
  carrier: `<g><path d="M39 16l-6-8H4v16h29z" fill="currentColor"/><rect x="8" y="11" width="24" height="10" fill="#333"/><path d="M10 16h20" stroke="#ffd65a" stroke-dasharray="3 2" stroke-width="1.5"/>${glow(3, 12)}${glow(3, 20)}</g>`,
  dropship: `<g><rect x="8" y="9" width="22" height="14" rx="3" fill="currentColor"/><path d="M30 10l7 6-7 6z" fill="currentColor"/><rect x="12" y="12" width="12" height="8" fill="#333"/><path d="M14 14h2v4h-2zM19 14h2v4h-2z" fill="#e0b48c"/>${glow(7, 12)}${glow(7, 20)}</g>`,
  drone: `<g><path d="M30 16L14 9l3 7-3 7z" fill="currentColor"/></g>`,
  // space turrets
  laser: `<g><circle cx="20" cy="20" r="10" fill="#334"/><circle cx="20" cy="20" r="6" fill="currentColor"/><path d="M20 20L36 6" stroke="#6ff3ff" stroke-width="3"/></g>`,
  missile: `<g><rect x="8" y="16" width="24" height="12" rx="3" fill="#334"/><path d="M12 16l3-12 3 12zM19 16l3-12 3 12zM26 16l3-12 3 12z" fill="currentColor"/><path d="M15 4l0-2M22 4v-2M29 4v-2" stroke="#ffb347" stroke-width="2"/></g>`,
  flak: `<g><circle cx="20" cy="22" r="9" fill="#334"/><path d="M16 20l-6-14M24 20l6-14" stroke="currentColor" stroke-width="3.5"/><circle cx="9" cy="6" r="3" fill="#ffe08a"/><circle cx="31" cy="6" r="3" fill="#ffe08a"/></g>`,
  shield: `<g><circle cx="20" cy="17" r="13" fill="none" stroke="#b88cff" stroke-width="2.5" stroke-dasharray="4 2"/><path d="M20 6l8 4v6c0 6-4 9-8 11-4-2-8-5-8-11v-6z" fill="currentColor"/></g>`,
  // ground units
  rifle: squad(4), bazooka: squad(3, '<path d="M-5 -8l10 -2" stroke="#4b5a35" stroke-width="2.2"/>'),
  light: tank(.85), medium: tank(1), howitzer: gun(20, 3),
  // ground buildings
  bunker: '<g><path d="M4 28a16 13 0 0 1 32 0z" fill="#77736b"/><rect x="12" y="18" width="16" height="4" fill="#111"/><path d="M28 20h8" stroke="currentColor" stroke-width="3"/></g>',
  cannon: '<g><rect x="6" y="20" width="28" height="8" fill="#77736b"/><rect x="11" y="13" width="14" height="8" rx="2" fill="currentColor"/><path d="M24 16h14" stroke="#ccc" stroke-width="3"/></g>',
  mortar: '<g><rect x="4" y="22" width="32" height="6" rx="3" fill="#a89466"/><path d="M14 22l16 -16" stroke="#ccc" stroke-width="4"/><rect x="10" y="17" width="8" height="6" fill="currentColor"/></g>',
  ion: '<g><rect x="10" y="22" width="20" height="6" fill="#77736b"/><path d="M14 22l6-14 6 14z" fill="currentColor"/><path d="M20 8V0" stroke="#9ef" stroke-width="3"/><circle cx="20" cy="4" r="3" fill="#fff"/></g>',
  barracks: '<g><path d="M4 28a16 14 0 0 1 32 0z" fill="#5d6168"/><rect x="17" y="19" width="6" height="9" fill="currentColor"/></g>',
  factory: '<g><rect x="4" y="14" width="32" height="14" fill="#c9bfa6"/><path d="M4 14l6-6v6l6-6v6l6-6v6l6-6v6z" fill="#5d6168"/><rect x="31" y="3" width="3" height="11" fill="#77736b"/><rect x="14" y="19" width="12" height="9" fill="currentColor"/></g>',
  station: '<g><circle cx="20" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="20" cy="16" r="5" fill="currentColor"/><path d="M8 16h-6M38 16h-6M20 4V0M20 32v-4" stroke="#ccc" stroke-width="2"/></g>',
  hq: '<g><rect x="6" y="12" width="28" height="16" fill="#c9bfa6"/><rect x="16" y="20" width="8" height="8" fill="currentColor"/><path d="M28 12V2" stroke="#333"/><path d="M28 2h8v5h-8z" fill="currentColor"/></g>',
  // enemies
  e_drone: '<g><path d="M8 16L28 8l-4 8 4 8z" fill="currentColor"/></g>',
  e_raider: '<g><path d="M6 16L30 6l-6 10 6 10z" fill="currentColor"/><path d="M30 6l6 2M30 26l6-2" stroke="currentColor" stroke-width="2"/></g>',
  e_gunship: '<g><path d="M3 16l9-9h18l6 9-6 9H12z" fill="currentColor"/><circle cx="20" cy="16" r="4" fill="#ff5"/></g>',
  e_cruiser: '<g><path d="M2 16l8-8h26v16H10z" fill="currentColor"/><rect x="16" y="11" width="14" height="10" fill="#401"/><path d="M2 16h-0" stroke="#fff"/></g>',
  e_lander: '<g><rect x="9" y="8" width="22" height="16" rx="8" fill="currentColor"/><path d="M12 24l-4 6M28 24l4 6" stroke="currentColor" stroke-width="2.5"/><circle cx="20" cy="16" r="4" fill="#fd5"/></g>',
  e_mother: '<g><ellipse cx="20" cy="16" rx="19" ry="11" fill="currentColor"/><ellipse cx="20" cy="16" rx="9" ry="5" fill="#ff5"/><path d="M4 16h-3M39 16" stroke="#fff"/></g>',
  e_grunt: squad(4),
  e_crawler: '<g><ellipse cx="20" cy="20" rx="15" ry="7" fill="currentColor"/><path d="M8 26l-4 4M14 27l-2 4M26 27l2 4M32 26l4 4" stroke="currentColor" stroke-width="2"/><path d="M30 17h9" stroke="#ccc" stroke-width="2.5"/></g>',
  e_walker: '<g><rect x="10" y="4" width="20" height="13" rx="3" fill="currentColor"/><path d="M14 17l-5 13M26 17l5 13" stroke="currentColor" stroke-width="3.5"/><path d="M30 9h9" stroke="#ccc" stroke-width="3"/></g>',
  // ui
  amove: '<g fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M6 26L30 6M22 6h8v8"/><path d="M8 8l8 8M16 8l-8 8" stroke="#ff8f80"/></g>',
  hold: '<g><path d="M12 28V12a3 3 0 0 1 6 0v-4a3 3 0 0 1 6 0v4a3 3 0 0 1 6 0v10c0 4-3 6-7 6z" fill="#fff"/></g>',
  retreat: '<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M30 24c0-8-6-12-14-12H8"/><path d="M14 6l-6 6 6 6"/></g>',
  all: '<g fill="none" stroke="#8ff7ff" stroke-width="2.5"><rect x="5" y="5" width="30" height="22" rx="2" stroke-dasharray="4 3"/><circle cx="15" cy="16" r="3" fill="#8ff7ff"/><circle cx="25" cy="16" r="3" fill="#8ff7ff"/></g>',
  x: '<path d="M10 6l20 20M30 6L10 26" stroke="#ff8f80" stroke-width="3.5" stroke-linecap="round"/>',
  up: '<path d="M20 4l12 14h-7v10h-10V18H8z" fill="#4dff88"/>',
  sell: '<g><circle cx="20" cy="16" r="12" fill="#d9a520"/><text x="20" y="22" font-size="17" font-weight="900" fill="#6b4a00" text-anchor="middle">$</text></g>',
};
export const lane = (n) => `<g><path d="M4 26C14 22 18 10 36 6" stroke="#8ff7ff" stroke-width="3" fill="none" stroke-dasharray="5 3"/><text x="13" y="17" font-size="15" font-weight="900" fill="#fff">${n}</text></g>`;
export const svg = (inner, color = '#4aa3ff', cls = '') => `<svg class="${cls}" viewBox="0 0 40 32" style="color:${color}" aria-hidden="true">${inner}</svg>`;
