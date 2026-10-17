# Front Line: tank-2v2 RTS (three.js, no build step)

A small R.U.S.E.-style base-builder. You play blue (south) against an AI (red, north). Build a base, earn money from supply depots and roll out units. Destroy the enemy HQ to win (or every enemy building). You lose if your HQ falls.

There are no HP bars. Damage shows as smoke, then fire and a burning wreck. Infantry squads lose soldiers one by one.

The files are static: `index.html`, `css/style.css` and `js/*.js`. three.js r169 loads from jsDelivr through an import map. There are no asset files; all models are low-poly primitives.

## Run locally
    cd /workspace/tank-2v2 && python3 -m http.server 8792
    # open http://localhost:8792/

## Game
- **Start:** each side has an HQ, $1,500 and a recon jeep. The HQ earns +$120/min.
- **Supply depots:** build them on the yellow **$ spots**. Each depot earns +$270/min. A spot must be near your base or your troops. The money display and income per minute sit in the top bar.
- **Build bar:** the depot button plus four colored branch tabs. Each building appears as a ghost: green is valid, red is invalid. You cannot build on water, forest, roads or next to other buildings, and you must stay inside the build radius. Click to place. Construction is timed and shows a progress ring.

| Branch | Building | Units |
|---|---|---|
| Infantry | Barracks | Rifle Squad (8, Q sprint), Bazooka Team (4, E ambush, first-shot bonus), Scout Team (3, R binoculars), Engineers (5, repair, F mine), MG Team (4, suppresses, G deploy), Commandos (4, T satchel) |
| Infantry | Recon Post | Recon Jeep |
| Armor | Tank Factory | Light, Medium, Heavy tank (the heavy has strong front armor) |
| Artillery | AT Gun Depot | AT Gun |
| Artillery | Artillery Base | Howitzer (arcing HE, good vs static targets), AA Gun (flak) |
| Air | Airfield | Recon Plane (unarmed, reveals), Fighter (vs aircraft), Fighter-Bomber (dives with rockets, vs tanks), Bomber (area damage, vs buildings) |

- **Aircraft:** they fly at altitude and loiter over the target or make attack runs. Then they return to the airfield, rearm and repair. They cannot capture anything.
- **Counters:** AT beats tanks, tanks beat infantry, and infantry beats AT guns. AA beats planes. Infantry is tougher in forest, in the city and in garrisoned houses.
- **AI:** builds depots and contests the middle spots, then all four branches including air and AA. It sends growing attack waves and defends its HQ. Easy or Normal.

## Controls
- **Select:** left-click to select, Shift-click to add, drag a box to select several. Double-click selects all units of that type on screen. Ctrl+A selects all.
- **Groups:** Ctrl+1..5 stores a group, 1..5 recalls it.
- **Orders:** left-click the ground to move, left-click an enemy to attack, click a house with infantry selected to garrison. A short right-click gives the same order. X stops.
- **Buildings:** select one to see its unit buttons. Click to queue (the count badge shows the queue) and right-click to cancel and get a refund. Right-click the ground to set the rally flag.
- **Abilities:** buttons with cooldown rings on the selection panel, or hotkeys Q E R F G T.
- **Camera:** wheel zooms toward the cursor, right-drag rotates, middle-drag or WASD pans, H jumps to the HQ. Click the minimap to jump; right-click the minimap to order units there.

## Phone / tablet (touch)
- **Tap** to select a unit, move to the ground, attack an enemy, or open a building's queue. **Double-tap** a unit to select all of that type on screen.
- **Drag** pans. **Pinch** zooms. **Two-finger twist** rotates.
- **Box select:** hold, then drag, or switch on the **Select** button and drag.
- **Placing:** tap a build button and the ghost appears mid-screen. Tap the map to move it, then use **Build ✓**, **Rotate** or **Cancel**.
- **Production:** tap a unit button to queue it. Hold the button to cancel one.
- **Right-side buttons:** HQ, Select, Clear, Stop, Rally (tap Rally, then tap the map), Help. Groups 1–3: hold to store the current selection, tap to recall it.
- **Minimap:** tap to jump the camera.
- **Lighter renderer** on touch devices and small screens: pixel ratio 1.25, 1024 shadow map, about half the particles.
- **Mouse and keyboard** controls are unchanged. A touch only switches on the touch UI. While placing on PC, R also rotates the building.

## Files
- `js/main.js`: game loop, economy, placement, production, units, squads, abilities, aircraft, combat, fog, AI, input, HUD, test hooks (`window.__game`)
- `js/config.js`: economy constants, units, buildings, abilities, damage table, supply spots
- `js/models.js`: low-poly team-colored vehicles, guns, planes, soldiers and buildings
- `js/icons.js`: SVG icons for the HUD
- `js/map.js`: terrain, river, bridges, forest, roads, farm, city
- `js/nav.js`: grid A* with dynamic building blocks
- `js/particles.js`: point-sprite particles

## Test (box)
    export PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-runner/browsers
    node test/playtest.mjs                 # 65 checks; writes screenshots/11-17
    node test/stress.mjs 11 normal 1       # AI vs idle player (HQ invulnerable), 11 game minutes, checks for stalls and errors
    VULN=1 node test/stress.mjs 15 easy 1  # same, but the AI can win the match
    node test/mobile.mjs                   # 45 checks; iPhone 13 landscape + portrait emulation (hasTouch); writes screenshots/18-20
The tests use `__game.simulate(sec)` to fast-forward without rendering, because headless SwiftShader renders at about 1 to 6 fps.
