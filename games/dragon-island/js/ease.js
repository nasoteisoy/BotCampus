// Small frame-rate independent easing helpers shared by movement, flight pose and the follow camera.
/** Share of the remaining gap to close this frame for an exponential ease at `rate` per second. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
/** Angle wrapped to (-PI, PI]. */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
