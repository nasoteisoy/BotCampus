/**
 * Tiny 5×7 pixel digits (and a few glyphs) — code-drawn, no system text.
 * Each glyph: array of 7 strings of length 5, '#' = on.
 */
const GLYPHS = {
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '#   #', '    #', '  ## ', ' #   ', '#    ', '#####'],
  '3': [' ### ', '#   #', '    #', '  ## ', '    #', '#   #', ' ### '],
  '4': ['#   #', '#   #', '#   #', '#####', '    #', '    #', '    #'],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
  '6': [' ### ', '#    ', '#    ', '#### ', '#   #', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', '  #  ', '  #  ', '  #  '],
  '8': [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '],
  '9': [' ### ', '#   #', '#   #', ' ####', '    #', '    #', ' ### '],
};

export function drawDigit(ctx, ch, x, y, color = '#f0e6c8', scale = 1) {
  const g = GLYPHS[ch];
  if (!g) return 6 * scale;
  ctx.fillStyle = color;
  for (let row = 0; row < 7; row++) {
    const line = g[row];
    for (let col = 0; col < 5; col++) {
      if (line[col] === '#') {
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }
  }
  return 6 * scale;
}

export function drawNumber(ctx, n, x, y, color = '#f0e6c8', scale = 1) {
  const s = String(Math.max(0, Math.floor(n)));
  let cx = x;
  for (const ch of s) cx += drawDigit(ctx, ch, cx, y, color, scale);
  return cx - x;
}

export function numberWidth(n, scale = 1) {
  return String(Math.max(0, Math.floor(n))).length * 6 * scale;
}
