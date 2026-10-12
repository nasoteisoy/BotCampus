# Spaceship Chess: Open Space

A variant of `games/spaceship-chess`, kept separate from it. Same rules and 8x8x8 coordinates, but **no boards**: ships float in open
space (starfield), and **every ship's reach is always drawn** (no tap needed). Phone-first, static files, vanilla JS + vendored Three.js (r169, MIT).

What is on screen:
- 🔵 moves: soft blue dots. 🟠 moves: soft orange diamonds. A cell both sides reach shows the dot left, the diamond right.
- ⚔️ attacks (legal captures): red beam from attacker to target, arrowhead tinted 🔵/🟠 by attacker, pulsing red ring on the attacked ship.
- ⚠️ check: red crossed-ring cage + glowing shell + ⚠️ over the Command station; check beams stay visible even if that side's reach is hidden.
- Depth: only tiny dim dots at the 512 cell centres, level numbers at the side; level focus (1–8) brightens one level's dots and hides other levels' reach.
- Toggle row (top right): 🔵 mine / 🟠 enemy / 🔵🟠 both (default both, remembered in `localStorage['spaceship-chess-open-view-v1']`). Red badge = attacks ready.
- Tapping a ship works as before: its pads glow bright, the always-on reach dims.

Files:
- `rules.js`: pure rules + AI (identical to the original except the save key).
- `ai-worker.js`: AI in a Web Worker.
- `app.js`: scene, ships, reach markers (InstancedMesh: dots, diamonds, beams, arrowheads, rings; legal moves recomputed only after a move/undo/new game, re-laid out on toggle/focus). `window.APP` test hooks incl. `APP.drawn()` (reads markers back from instance matrices).
- `sw.js`: cache `spaceship-chess-open-vN`; deletes only its own old caches. Bump on every release.
- Save: `localStorage['spaceship-chess-open-save-v1']` = `{ mode, moves[] }`, replayed and validated on load.

Tests live outside the repo in `/workspace/spaceship-chess-open-tests` (`bash run.sh`; `SHOTS=dir` for screenshots; `ONLY=p|s|l|d`).
