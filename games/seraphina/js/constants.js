/** Seraphina Forest — feel knobs (Round 3) */
export const TILE = 16;
export const FIXED_DT = 1 / 60;
export const MAX_FRAME = 0.05;

/** Hero on 32×48 canvas. Pivot (16,48). */
export const HERO_W = 32;
export const HERO_H = 48;
export const HERO_PIVOT_X = 16;
export const HERO_PIVOT_Y = 48;
export const HERO_SPEED = 78;
export const HERO_HIT_R = 10;

/** Slime 16×16 — same integer ZOOM as hero (no per-sprite multiplier). */
export const SLIME_NATIVE = 16;
export const SLIME_DRAW = 1;
export const SLIME_SPEED = 26;
export const SLIME_HIT_R = 9;
export const SLIME_IDLE_MS = 200;
export const SLIME_HOP_MS = 90;
export const SLIME_DEATH_MS = 80;

export const ARROW_SPEED = 170;
export const ARROW_RATE = 1 / 3;
export const ARROW_LIFE = 1.6;
/** Trail ghost positions kept (3–4 fading frames). */
export const ARROW_TRAIL_LEN = 4;

export const WALK_MS = 120;
export const SHOOT_MS = 100;

export const MAX_HP = 3;
export const HIT_INVULN = 1.0;
export const HITSTOP_POP = 0.04;
export const SHAKE_DECAY = 1.2;
export const SHAKE_MAX = 5;

export const SAVE_KEY = 'seraphina-forest:v1';
export const GAME_NAME = 'Seraphina Forest';

/** Lightest F-palette tone for arrow shaft rim (#cca774). */
export const ARROW_RIM = '#cca774';

/**
 * Integer ZOOM only — every sprite uses this. Phones keep ≥2 so pixels read;
 * hero lands ~1/4 short side (closest integer to 1/5–1/6 without ZOOM=1).
 */
export function pickZoom(shortSide) {
  let z = Math.round(shortSide / (HERO_H * 5.5));
  if (z < 2) z = 2;
  while (z > 2 && (HERO_H * z) / shortSide > 0.28) z--;
  return Math.max(2, Math.floor(z));
}

/** Filled by tools/bow_qc.mjs after each art-pack copy. Fallback: approved + flip + bob. */
export const BOW_FALLBACK_FRAMES = [
  'walk_down_1.png',
  'walk_down_2.png',
  'walk_down_3.png',
  'walk_up_0.png',
  'walk_up_3.png',
  'walk_left_0.png',
  'walk_left_2.png',
  'walk_left_3.png',
];
