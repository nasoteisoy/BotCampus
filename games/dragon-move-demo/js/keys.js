// WASD / arrow keys as a move vector (x right, y forward), diagonals normalised.
const CODES = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

export function createKeys(target = window) {
  const down = new Set();
  target.addEventListener('keydown', (e) => { if (CODES[e.code]) { down.add(e.code); e.preventDefault(); } });
  target.addEventListener('keyup', (e) => down.delete(e.code));
  target.addEventListener('blur', () => down.clear());
  return {
    vector() {
      let x = 0, y = 0;
      for (const c of down) { x += CODES[c][0]; y += CODES[c][1]; }
      x = Math.sign(x); y = Math.sign(y);
      const l = Math.hypot(x, y) || 1;
      return { x: x / l, y: y / l };
    },
  };
}
