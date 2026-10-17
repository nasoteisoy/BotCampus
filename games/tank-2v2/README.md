# Tank 2v2 (three.js, no build step)

RTS-style 2 vs 2 tank skirmish. Static files only: `index.html`, `css/style.css`, `js/*.js`. three.js r169 loads from jsDelivr through an import map. No assets to download: everything is low-poly primitives and canvas textures.

## Run locally
    cd /workspace/tank-2v2 && python3 -m http.server 8792
    # open http://localhost:8792/

## Map (280 x 280)
- A river runs west to east. Tanks cannot cross deep water. You can cross on 3 bridges (x = -70, 15, 95) or at a shallow ford (x = 55), which is slow.
- Each side spawns on its own bank: blue in the south, red in the north.
- South-west: the original city block. South-east: farmland with hedgerows (these block movement), fences, a farmhouse, a barn and a silo.
- North-west: dense forest. It slows tanks and blocks line of sight. Shells can hit trunks. A tank inside is hard to spot and hard to hit.
- North-east: a hill. Shooting downhill gives up to +35% range and better accuracy.
- Roads let tanks move 1.2x faster.
- Fog of war: you only see enemies your tanks can spot.
- Minimap (top right): shows terrain, your tanks and spotted enemies. Click or drag it to move the camera.

## Controls
- Left-click your tank: select it. Shift-click adds a tank. Left-drag a box selects. Keys 1, 2, 3 (3 = both). Esc deselects.
- Left-click the ground: move. Left-click an enemy: attack. A short right-click also gives the order.
- Wheel: smooth zoom toward the cursor (close behind-tank view out to full overview). Right-drag: rotate. Middle-drag or WASD/arrows: pan. Space: focus on selection. X: stop.

## Files
- `js/main.js`: game loop, tanks, AI, combat, input, camera, HUD
- `js/map.js`: terrain (heights, river, bridges, forest, roads, farm, city), instanced trees, minimap image, collision helpers
- `js/nav.js`: weighted grid A* (roads cheap, forest/ford costly, deep water blocked) with smoothing
- `js/particles.js`: one-draw-call soft point-sprite particles
- `test/playtest.mjs`: headless Playwright playtest; it writes `screenshots/*.png`

## Test (box)
    export PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-runner/browsers
    node test/playtest.mjs http://127.0.0.1:8792/   # 47 checks, writes screenshots/ 01-10
    node test/stress.mjs 6 idle                       # 6 fast AI-vs-idle matches, looks for stalls
    node test/stress.mjs 3 attack                     # player tanks also attack-move
    # PW_PATH overrides the playwright module path (default /workspace/pw-runner/node_modules/playwright/index.mjs)
