/** Fair die rolls from crypto.getRandomValues, with rejection sampling. */

const buf = new Uint32Array(1);
const MAX = 0x100000000;

export function fairInt(n) {
  if (n <= 0) throw new RangeError('n must be positive');
  if (n === 1) return 0;
  const limit = Math.floor(MAX / n) * n;
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}

/** Roll a die with `sides` faces, result in 1..sides inclusive. */
export function fairRoll(sides) {
  return fairInt(sides) + 1;
}

export function fairRolls(count, sides) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = fairRoll(sides);
  return out;
}
