/** Simple CSS/SVG icon helpers — no emoji art. */
(function (global) {
  'use strict';

  const ICONS = {
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
    megaphone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 10v4h2l5 3V7L5 10H3zm12.5 2c0-1.8-1-3.3-2.5-4v8c1.5-.7 2.5-2.2 2.5-4zM14 4.3v2.1c2.9.9 5 3.5 5 6.6s-2.1 5.7-5 6.6v2.1c4-.9 7-4.5 7-8.7s-3-7.8-7-8.7z"/></svg>',
    swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.5 3l-6.5 2.5L7 3 2.5 4.5v15.7L8 18l6.5 2.5L21.5 18V3.8L20.5 3zM8 16.3l-3.5 1.2V6.4L8 5.3v11zm6.5 2.1L10 16.7V5.6l4.5 1.7v11.1zM19 15.8l-2.5.9V5.7L19 4.8v11z"/></svg>',
    wall: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h18v4H3V5zm0 5h8v4H3v-4zm10 0h8v4h-8v-4zM3 15h18v4H3v-4z"/></svg>',
    talk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>',
    hear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zM8 11c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.9 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z"/></svg>',
    hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 11V5a1.5 1.5 0 0 1 3 0v5h.5V3.5a1.5 1.5 0 0 1 3 0V10h.5V5a1.5 1.5 0 0 1 3 0v8.5c0 4.1-2.9 7.5-7 7.5-2.4 0-4.3-1.2-5.6-3.1L3 14.1a1.5 1.5 0 0 1 2.4-1.8L8 15V11z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V7zm2 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>',
    door: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17h2v1H3v-1h2zm10-9a1 1 0 1 0 2 0 1 1 0 0 0-2 0z"/></svg>',
    fog: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 8h14v2H3zm4 4h14v2H7zm-4 4h14v2H3z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h3v3H4zm5 0h11v3H9zM4 10.5h3v3H4zm5 0h11v3H9zM4 16h3v3H4zm5 0h11v3H9z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4l13 8-13 8z"/></svg>',
    keyEmpty: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12.7 10C12 8.2 10.1 7 8 7c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.1 0 3.9-1.2 4.7-3H17v3h3v-3h2v-4H12.7z"/></svg>',
    key: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.7 10C12 8.2 10.1 7 8 7c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.1 0 3.9-1.2 4.7-3H17v3h3v-3h2v-4H12.7zM8 13c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 17.3 18.2 21l-1.6-7.1L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2l5.4 4.7L5.8 21z"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>'
  };

  function icon(name, cls) {
    const svg = ICONS[name] || ICONS.alert;
    return '<span class="ico ' + (cls || '') + '" data-ico="' + name + '">' + svg + '</span>';
  }

  global.CoopIcons = { icon: icon, ICONS: ICONS };
})(typeof window !== 'undefined' ? window : globalThis);
