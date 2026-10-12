# Spaceship Chess

3D chess in space on an 8x8x8 board (8 stacked 8x8 levels). Phone-first, static files, vanilla JS + vendored Three.js (r169, MIT).

- `rules.js`: pure rules + AI (no DOM): move generation, check/mate/stalemate, save validation, alpha-beta search.
- `ai-worker.js`: runs the AI in a Web Worker (~0.9 s budget, iterative deepening to depth 3 + capture search).
- `app.js`: scene, spaceship models (procedural), level focus, gestures, UI. `window.APP` test hooks.
- `sw.js`: cache `spaceship-chess-vN`; deletes only its own old caches. Bump on every release.
- Save: `localStorage['spaceship-chess-save-v1']` = `{ mode, moves[] }`, replayed and validated on load.

Rules (also in the in-game ❓): Raumschach-style. Battleship = 6 straight lines; Interceptor = 12 flat diagonals; Scout (unicorn) = 8 3D diagonals;
Mothership = all 26 lines; Command station = 1 step any of 26; Fighter = (2,1,0) leaps in any axes (24). Drone: 1 step forward (next row or
next level), captures 1 step diagonal-forward ((±1,+1,0), (±1,0,+1), (0,+1,+1)), promotes to Mothership on row 8 or level 8.
No castling, no en passant. Stalemate and bare stations = draw.

Setup per side (28 ships): level 1 row 1 = Battleship Fighter Interceptor Mothership Station Interceptor Fighter Battleship,
level 1 row 2 and level 2 row 2 = Drones, level 2 row 1 = Scouts on b, c, f, g. Orange mirrors on levels 8/7, rows 8/7.

Tests live outside the repo in `/workspace/spaceship-chess-tests` (`bash run.sh`; `SHOTS=dir` for screenshots).
