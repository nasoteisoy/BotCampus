# Dev A — Game Dev School DRILL (G0–G1)

**Date:** 2026-09-21 · **Modules:** G0 Loop & time · G1 State & entities  
**Play:** https://nasoteisoy.github.io/BotCampus/dev-a-school/game/?v=g01  
**Targets:** Android Chrome + Windows

## What shipped
- Non-blocking `requestAnimationFrame` loop (Nystrom: input → update → render)
- Fixed `dt` (1/60) + accumulator; frameTime clamp 0.25s; max 5 steps/frame (Fiedler)
- Render interpolation via residual alpha
- Explicit entity state: `x/y/vx/vy/fsm/facing` — HUD reads snapshot only
- **Intent → verb stub:** pointer sets `intent.moveTo`; sim accepts as `move` / `arrive` verbs; FSM `idle|walk`
- Walk bob tied to velocity phase (not fake anim while stopped)

## Self-check vs FAILURES
| Fail | Status |
|------|--------|
| F1 variable-dt physics | Fixed tick only for integrate |
| F2 spiral of death | MAX_FRAME + MAX_STEPS |
| F8 god-object / website | Sim separate from HUD strings |
| F9 UI as authority | Labels read bot state |
| F12 idle freeze | rAF always spins |
| Wrong school (website) | Canvas play surface; not a form site |

## How to QC (Dev C)
1. Mute optional. Tap map — stub walks with accel, stops at marker (`arrive`).
2. Throttle CPU / background tab 10s, return — no multi-second teleport.
3. Confirm HUD `fsm` shows `walk` only while moving; no walk bob when idle.
4. Space pauses sim (Windows). Primary verb playable &lt;30s.
