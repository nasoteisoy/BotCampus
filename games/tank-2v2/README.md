# Tank 2v2 (three.js, no build step)

RTS-style 2 vs 2 tank skirmish. Static files only: `index.html`, `css/style.css`, `js/*.js`. three.js r169 loads from jsDelivr through an import map. No assets to download: everything is low-poly primitives and canvas textures.

## Run locally
    cd /workspace/tank-2v2 && python3 -m http.server 8792
    # open http://localhost:8792/

## Controls
- Left-click your tank: select it. Shift-click adds a tank. Left-drag a box selects. Keys 1, 2, 3 (3 = both). Esc deselects.
- Left-click the ground: move. Left-click an enemy: attack. A short right-click also gives the order.
- Wheel: smooth zoom toward the cursor (close behind-tank view out to full overview). Right-drag: rotate. Middle-drag or WASD/arrows: pan. Space: focus on selection. X: stop.

## Files
- `js/main.js`: game loop, tanks, AI, combat, input, camera, HUD
- `js/map.js`: arena, obstacles, 2D collision helpers
- `js/nav.js`: grid A* pathfinding with line-of-sight smoothing
- `js/particles.js`: one-draw-call soft point-sprite particles
- `test/playtest.mjs`: headless Playwright playtest; it writes `screenshots/*.png`

## Test (box)
    export PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-runner/browsers
    node test/playtest.mjs http://127.0.0.1:8792/   # 26 checks, writes screenshots/
    node test/stress.mjs 6 idle                       # 6 fast AI-vs-idle matches, looks for stalls
    # PW_PATH overrides the playwright module path (default /workspace/pw-runner/node_modules/playwright/index.mjs)
