/** Sprig Peak — feel knobs (cited in DESIGN.md) */
export const TILE = 16;
export const SCALE = 3;
export const FIXED_DT = 1 / 60;
export const MAX_FRAME = 0.05;

// Platformer feel — Celeste forgiveness / GMTK toolkit / input-systems.md
export const COYOTE_TIME = 0.10;      // 100ms (platformer.md #1; input-systems ~0.10)
export const JUMP_BUFFER = 0.12;      // 120ms (platformer.md #2; input-systems ~0.12)
export const JUMP_VY = -320;
export const JUMP_CUT = 0.45;         // velocity factor on release (variable height)
export const GRAVITY = 980;
export const HOLD_GRAVITY = 620;      // reduced near apex while holding (platformer.md #3)
export const MAX_FALL = 480;
export const RUN_ACCEL = 1800;
export const RUN_DECEL = 2200;
export const RUN_MAX = 140;
export const AIR_ACCEL = 1200;
export const DASH_SPEED = 280;
export const DASH_TIME = 0.14;
export const SPRING_VY = -420;
export const HIT_INVULN = 1.0;
export const HITSTOP_BOSS = 0.08;     // game-feel.md hit-stop ~0.08
export const SHAKE_DECAY = 1.2;       // game-feel.md trauma decay
export const SHAKE_MAX = 10;

export const SAVE_KEY = 'sprigpeak:v1';
export const GAME_NAME = 'Sprig Peak';

export const POWERS = { doubleJump: 'dj', dash: 'dash', shield: 'shield' };
