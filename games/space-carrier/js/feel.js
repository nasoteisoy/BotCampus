// Easing + pulse helpers copied from parts-library space-vehicle-feel (vehicle-feel.js) so this game
// uses the same motion curves as the Star Conquests fighters, without shipping the whole module.
const TAU = Math.PI * 2;
export const pulse = (t, at, rise = 0.03, decay = 0.14) => (t < at ? 0 : t < at + rise ? (t - at) / rise : Math.exp(-(t - at - rise) / decay));
export const wobble = (t, at, f = 9, d = 0.35) => (t < at ? 0 : Math.sin((t - at) * f * TAU / 2) * Math.exp(-(t - at) / d));
