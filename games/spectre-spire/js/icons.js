// Small inline SVG icon set (stroke icons, no emoji).
const P = {
  ghost: '<path d="M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"/><circle cx="10" cy="10" r="1" fill="currentColor"/><circle cx="14" cy="10" r="1" fill="currentColor"/>',
  vac: '<path d="M3 14h9l3-3h3v6h-3l-3-3"/><path d="M18 11l3-1M18 17l3 1M18 14h3"/><rect x="4" y="9" width="6" height="5" rx="1"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.3-2L8 14"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  jump: '<path d="M12 19V5M6 11l6-6 6 6"/><path d="M5 21h14"/>',
  lift: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18M8.5 8l1.5-2 1.5 2M12.5 16l1.5 2 1.5-2"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><circle cx="12" cy="17" r=".8" fill="currentColor"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.7 2.5 1.7-1 1.3-2.5 1.6-2.5.7-2.5 1.7 1 1.8 2.5 1.8 2.5-.6 2.5-1.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cage: '<rect x="5" y="4" width="14" height="16" rx="1"/><path d="M9 4v16M12 4v16M15 4v16"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  shoe: '<path d="M3 17h18v-2l-6-2-3-5H9l-1 3H4z"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  beam: '<path d="M4 10h4l12-5v14L8 14H4z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5 5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  door: '<path d="M4 21V4h11v17M15 6l5 2v13h-5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  lantern: '<path d="M9 4h6M10 4v2M14 4v2"/><rect x="7" y="6" width="10" height="13" rx="3"/><path d="M12 10v5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>',
  plusheart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/><path d="M12 9v6M9 12h6"/>',
  flash: '<path d="M7 3h10l-2 6h4l-9 12 2-8H7z"/>',
};
export const ABILITY_ICON = { strobe: 'flash', turbo: 'vac', ward: 'shield', mend: 'plusheart', lantern: 'lantern', dash: 'wind' };
export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.help}</svg>`;
}
