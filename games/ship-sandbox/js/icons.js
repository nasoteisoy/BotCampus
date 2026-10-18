// Small inline SVG icons (viewBox 0 0 40 32), same style as Front Line / Space Defense icons.
export const ICON = {
  pause: '<g fill="#fff"><rect x="11" y="7" width="6" height="18" rx="1.5"/><rect x="23" y="7" width="6" height="18" rx="1.5"/></g>',
  play: '<path d="M13 6l16 10-16 10z" fill="#fff"/>',
  reset: '<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M29 16a9 9 0 1 1-3-6.7"/><path d="M27 4v6h-6"/></g>',
  wrench: '<path d="M27 5a7 7 0 0 0-8.6 8.6L7 25l3 3 11.4-11.4A7 7 0 0 0 30 8l-4 4-3-1-1-3z" fill="#ffd65a"/>',
  ship: '<g><path d="M38 16l-8-6H6l-3 3v6l3 3h24z" fill="currentColor"/><rect x="12" y="12" width="12" height="8" rx="2" fill="#333"/><path d="M24 16h10" stroke="#ccc" stroke-width="2"/><circle cx="3" cy="16" r="2.4" fill="#9ef"/></g>',
  back: '<g><path d="M30 8L8 16l22 8-6-8z" fill="#4dff88"/><circle cx="34" cy="16" r="3" fill="#ff8f80"/></g>',
};
export const svg = (inner, color = '#4aa3ff') => `<svg viewBox="0 0 40 32" style="color:${color}" aria-hidden="true">${inner}</svg>`;
