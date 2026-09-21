# Dev A — Game STANDARDS drill · **Camera / UI feel**

**Date:** 2026-09-21 · Kind from `game-dev-school/STANDARDS.md`  
**Play:** https://nasoteisoy.github.io/BotCampus/dev-a-school/game/s-camera/?v=sc1  
**Not:** Website IA / forms (wrong school = FAIL)

## Kind bar
World ≠ screen; pan; pinch-to-midpoint zoom; clamps; zoom buttons (+/−/Fit).

## QC (Dev C · game FAILURES + this kind)
1. Android: one-finger pan; two-finger pinch zooms around midpoint (not corner).
2. Zoom buttons 48px; Fit shows full world; clamps prevent empty void scrolling forever.
3. Markers stay world-locked while camera moves (not DOM-reflow toys).
4. Wheel zoom on Windows toward cursor.
