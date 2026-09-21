# Game Dev Drill — Velocity Walk + Idle→Path→Busy

**School:** Game Dev · **Modules:** G0 (loop & time), G1 (FSM), G4 (path/station)  
**Curriculum drills:** 1 + 2 combined  
**Platform QC:** Android Chrome + Windows · mute-safe feedback

## What it teaches

| Module | In this stub |
|--------|----------------|
| **G0** | Fixed timestep (`dt = 1/60`) + `requestAnimationFrame` accumulator; frameTime clamp; max catch-up steps (no spiral of death). Update ≠ render. |
| **G1** | Explicit FSM: `idle` \| `walk` \| `busy`. One stubby circle bot entity with clear fields. |
| **G4** | Assign task → cancel idle → path toward station → arrive → busy prop/VFX. Walk class/anim only while `speed > epsilon` (no walk-in-place). |

## How to open

1. Open `index.html` in Chrome (file:// is fine — no fetch needed).
2. Or: `python3 -m http.server 8766` from this folder → `http://localhost:8766/`.
3. Tap **Assign silly task** (or wait for auto-assign). Watch: idle at home desk → walk (legs only when moving) → busy sparkles at the station.
4. **Recall home** returns the bot to idle at the desk.

## Controls

- **Assign silly task** — path to the Work Station.
- **Recall home** — cancel busy/walk, path back to desk, then idle.
- Auto-assign fires once after ~2.5s if you do nothing (still cancelable).

## Mute-safe feedback

- Visual only: bob while walking, station sparkles + busy badge, status chip text, button press flash.
- No audio required (autoplay/mute safe).

## SHIP-CHECKLIST self-check

From `research-notes/game-dev-school/SHIP-CHECKLIST.md` (drill-scoped):

1. [x] Clear game loop (fixed update + render) — not setInterval spaghetti  
2. [x] Explicit entity/FSM state (`idle` / `walk` / `busy`)  
3. [x] Input: Assign / Recall work with touch + mouse (Android Chrome / Windows)  
4. [ ] Camera pan/zoom — N/A for this tiny world drill (fixed canvas)  
5. [x] Core verb playable in &lt;30s (assign → walk → busy)  
6. [x] Mute-safe visual feedback on assign / arrive / busy  
7. [x] Tiny canvas — no pan jank expected  
8. [ ] Play/preview URL — Dev A pushes Pages when ready  
9. [x] This is a **game loop** stub, not a marketing page  

## Failures avoided (skim)

- Variable-dt physics (F1) → fixed `dt` + accumulator  
- Spiral of death (F2) → clamp + maxSteps  
- Walk-in-place → CSS `.walking` only when `velocity > ε`  
- Audio-only juice → visual VFX / chips only  

## Files

- `index.html` — shell, HUD, canvas  
- `game.js` — loop, FSM, path, draw

## Kinds hub

Parent `index.html` stays the **NPC idle→path→busy** drill.

Per-STANDARDS mini drills (loop-timing, state-save, input, camera, juice, npc-ai link):

→ **[`kinds/`](./kinds/)** · map in [`kinds/README.md`](./kinds/README.md)

