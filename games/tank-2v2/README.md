# Front Line: tank-2v2 RTS (three.js, no build step)

A small R.U.S.E.-style base-builder. You play blue (south) against an AI (red, north). Build a base, earn money from supply depots and roll out units. Destroy the enemy HQ to win (or every enemy building). You lose if your HQ falls.

There are no HP bars. Damage shows as smoke, then fire and a burning wreck. Infantry squads lose soldiers one by one.

The files are static: `index.html`, `css/style.css` and `js/*.js`. three.js r169 loads from jsDelivr through an import map. There are no asset files; all models are low-poly primitives.

## Run locally
    cd /workspace/tank-2v2 && python3 -m http.server 8792
    # open http://localhost:8792/

## Main menu
Big buttons, top to bottom: **📘 How to Play** · **▶ Play 1 v 1** (Easy / Normal picker under it) · **🧪 Play Sandbox** · **🔍 Unit Explore** · **📖 Unit Menu**. Back / ✕ / Esc from any of them returns to the menu. Direct links: `?howto`, `?sandbox`, `?examiner` or `?explore`, `?units` or `?guide`.
- **How to Play:** the 4 step cards, the counters strip, mouse/keys and touch controls, the 6 body types, what level / range / accuracy mean, and the ring colours.
- **Pause:** ⏸ in the top bar, **P**, or **Esc** (Esc first cancels placing / clears the selection). The pause menu has ▶ Resume, 📖 Unit Menu (stays paused), 📘 How to Play and 🚪 Quit to main menu. Paused means fully frozen: sim, AI, timers, production and cooldowns. Opening the Unit Menu in a match also pauses it.
- **📊 Live stats (Play):** a small floating card for one selected unit (HP, state, target, reload, damage dealt). Off by default; toggle with **I**, the 📊 button in the selection panel, or the phone Help panel. Remembered.

## 📖 Unit Menu
A full-screen reference of all 17 units, grouped by branch, plus the 8 buildings.
- **Unit cards:** body type; the 6-row matrix (level pips or "can't hit", range, multiplier, accuracy pips and the effective hit chance or spread at short / mid / max range); vision, min range and special ranges; an SVG ring diagram to scale (⭕ rings / 🔢 numbers toggles, "same scale" option); config (cost, time, HP or men × hp, speed, rate of fire, damage, weapon, splash, ammo, ability + cooldown, built at → links to the building) and the description.
- **Building cards** (🏠 Buildings filter, or at the end of "All"): icon and branch, cost, build time, HP, footprint, body Building, vision, income (HQ, depot), build radius and placement rules, the units it produces as chips that jump to those cards, what damages it best (units sorted by level vs Building, with ×dmg, range and damage per shot) and the description.
- **📊 Compare:** an accuracy / cover / moving-target legend; one big table of all units × 6 bodies (sortable by any column, filterable by branch, scrolls inside its own box on phones); tick 2 units for a side-by-side table (best value in green) plus both cards; and a buildings table (cost, time, HP, footprint, income, HP per $, produces, best attackers).
- Opened from Unit Explore it shows your tuning, marked **tuned**.

## 🧪 Play Sandbox
Build any scenario on the real map, then run it. Setup starts paused.
- **Place:** palette of every building and unit grouped by branch, 🔵 Blue / 🔴 Red switch, free and instant. Select a piece to ✥ move, ↻ rotate or 🗑 delete (Delete key); Clear all. One HQ per team, optional.
- **Setup:** red AI Off / Hold / Fight / Full AI (Full needs a red HQ), fog on/off, money per side, "HQ win rules" (off by default).
- **Run:** ▶ Play, ⏸ Pause, speed ¼×–2×, ↺ Reset to the setup captured at the last Play. You can edit while paused: the frozen state becomes the new world (time and AI memory restart).
- **Save:** named scenarios in this browser, plus Export / Import as a text code (`FL1:…`).
- The Unit Menu, ring toggles and live stats work inside it. Fits an iPhone 13 (bottom sheet in portrait, side column in landscape).

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
- **Telling units apart:** every type has its own silhouette. Light tank: low wheeled recon hull, small round turret, short thin gun and a whip antenna. Medium: tracked, sloped glacis, domed turret, muzzle-braked gun. Heavy: wide boxy hull with side skirts and armor plates, big square turret, very long thick gun. Jeep: windshield, spare wheel, driver and pintle MG. AT gun: shield and muzzle brake. Howitzer: long barrel, recuperator, trail spades. AA gun: twin barrels with flash hiders and a ring sight. Infantry: rifle squad (helmet + rifles), bazooka team (long tubes on the shoulder), scouts (lighter build, cap, binoculars, green scarf, radio), engineers (yellow helmet, orange vest stripes, backpack, wrench), MG team (heavy MG, tripod and ammo box), commandos (dark team-tinted gear, maroon beret, SMG, satchel, knife).
- **Unit badges:** a small icon of the unit type floats above every squad and vehicle you can see. Units hidden in the fog get none. Press **V** (or the button in the help panel / touch help) to switch them off and on. They are on by default and the setting is remembered.

## Controls
- **Select:** left-click to select, Shift-click to add, drag a box to select several. Double-click selects all units of that type on screen. Ctrl+A selects all.
- **Groups:** Ctrl+1..5 stores a group, 1..5 recalls it.
- **Orders:** left-click the ground to move, left-click an enemy to attack, click a house with infantry selected to garrison. A short right-click gives the same order. X stops.
- **Buildings:** select one to see its unit buttons. Click to queue (the count badge shows the queue) and right-click to cancel and get a refund. Right-click the ground to set the rally flag.
- **Abilities:** buttons with cooldown rings on the selection panel, or hotkeys Q E R F G T.
- **V:** unit-type badges on/off. **I:** live stats card. **U:** Unit Menu. **P / Esc:** pause.
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

## Body types and attack levels
Every unit and building has one of six **body types**: 🪖 Infantry (`inf`), 🛡️ Armor (`armor`), ✈️ Air (`air`), 💥 Artillery (`art`, towed guns), 🚙 Truck/Jeep (`truck`), 🏠 Building (`bld`). The body type shows in the production tooltip and the selection panel.

Each unit in `js/config.js` has `vs: { inf, armor, air, art, truck, bld }`, and each entry is `{ lvl, rng, acc }`:
- `lvl` 0–5 sets the damage multiplier through `LVL_MULT = [0, 0.06, 0.4, 0.75, 1.0, 1.4]`. Level 0 means the unit can't hit that body, so it never targets it.
- `rng` is the engagement range against that body. Deploy (+8), garrison (+5) and the height bonus still apply on top. For aircraft, `rng` is the radius around the ordered point in which they pick targets.
- `acc` 1–5 is the accuracy. Hit-scan weapons (MG, flak, fighter guns) roll `ACC_HIT = [0, .35, .5, .62, .72, .8]`; infantry in cover (forest, town, garrison, ambush) is ×`CONCEAL_HIT` (72% → 50%). Shells and HE use a spread multiplier `ACC_SPREAD = [0, 1.6, 1.25, 1, .8, .62]` on the wobble (±(0.6 + 0.05·d) m for shells, ±(2 + 0.045·d) m for the howitzer); concealed targets ×1.6, buildings ×0.3, moving targets are led by 90% of their motion. Plane rockets aim off by up to `ACC_RKT[acc]` m; bombs space the 6-bomb stick 2.2 m × spread. The seed reproduces the old hidden numbers exactly.
- Ranges differ per body by role (anti-tank units reach armor furthest, infantry reach infantry furthest):

| Unit | Infantry | Armor | Air | Artillery | Truck/Jeep | Building |
|---|---|---|---|---|---|---|
| Rifle Squad | L4 · 28 m · acc 4 | L1 · 16 m · acc 5 | — | L5 · 26 m · acc 5 | L3 · 24 m · acc 5 | L1 · 18 m · acc 5 |
| Bazooka Team | L1 · 18 m · acc 3 | L4 · 32 m · acc 3 | — | L2 · 26 m · acc 3 | L4 · 30 m · acc 3 | L2 · 24 m · acc 3 |
| Scout Team | L4 · 24 m · acc 4 | L1 · 12 m · acc 5 | — | L5 · 22 m · acc 5 | L3 · 20 m · acc 5 | L1 · 14 m · acc 5 |
| Engineers | L4 · 22 m · acc 4 | L1 · 12 m · acc 5 | — | L5 · 20 m · acc 5 | L3 · 18 m · acc 5 | L1 · 14 m · acc 5 |
| Machine Gun Team | L4 · 34 m · acc 4 | L1 · 14 m · acc 5 | — | L5 · 30 m · acc 5 | L3 · 28 m · acc 5 | L1 · 18 m · acc 5 |
| Commandos | L4 · 28 m · acc 4 | L1 · 16 m · acc 5 | — | L5 · 26 m · acc 5 | L3 · 24 m · acc 5 | L1 · 18 m · acc 5 |
| Recon Jeep | L4 · 28 m · acc 4 | L1 · 14 m · acc 5 | — | L5 · 26 m · acc 5 | L3 · 26 m · acc 5 | L1 · 16 m · acc 5 |
| Light Tank | L5 · 22 m · acc 3 | L4 · 38 m · acc 3 | — | L2 · 34 m · acc 3 | L4 · 36 m · acc 3 | L3 · 30 m · acc 3 |
| Medium Tank | L5 · 24 m · acc 3 | L4 · 44 m · acc 3 | — | L2 · 40 m · acc 3 | L4 · 40 m · acc 3 | L3 · 34 m · acc 3 |
| Heavy Tank | L5 · 26 m · acc 3 | L4 · 50 m · acc 3 | — | L2 · 44 m · acc 3 | L4 · 44 m · acc 3 | L3 · 38 m · acc 3 |
| AT Gun | L1 · 24 m · acc 3 | L4 · 50 m · acc 3 | — | L2 · 40 m · acc 3 | L4 · 46 m · acc 3 | L2 · 32 m · acc 3 |
| Howitzer | L5 · 135 m · acc 3 | L3 · 135 m · acc 3 | — | L5 · 135 m · acc 3 | L4 · 135 m · acc 3 | L5 · 135 m · acc 3 |
| AA Gun | — | — | L4 · 62 m · acc 2 | — | — | — |
| Recon Plane | — | — | — | — | — | — |
| Fighter | — | — | L4 · 30 m · acc 5 | — | — | — |
| Fighter-Bomber | L3 · 35 m · acc 5 | L5 · 35 m · acc 5 | — | L4 · 35 m · acc 5 | L5 · 35 m · acc 5 | L3 · 35 m · acc 5 |
| Bomber | L4 · 35 m · acc 3 | L3 · 35 m · acc 3 | — | L5 · 35 m · acc 3 | L4 · 35 m · acc 3 | L5 · 35 m · acc 3 |

- Special cases keep their own rules: the howitzer's minimum range, MG deploy, the AA gun's anti-air only, indirect fire, the fighter-bomber's dive (fires when the target is `rocketWin` = 14–38 m ahead), bomber ammo, and satchel/mine damage (`DMG_MULT.satchel` / `.mine`).

### Attack orders and air runs
- **Attack on a target that drops out of sight:** units keep the order and head for its *last known position* (where the team last actually saw it, never its live position). They engage again as soon as it's spotted. If it isn't there when they arrive, they stop and a "Target lost" toast plus a grey marker explains why. A target the team has never spotted can't be ordered on.
- **Bomber aim:** bomb flight is closed-form, so it no longer depends on frame rate: drag equal to the old 0.99 per 1/20 s step, an initial 1 m/s drop and gravity × 1.4. The bomber uses the same formulas to release exactly one bomb throw before the target's predicted position, so moving targets are led. The 6-bomb stick (2.2 m apart) is centred on that point.
- **Aircraft follow the same fog rule:** an attack order on a hidden target sends the plane to its last known position. While the target stays hidden, bombers and fighter-bombers don't fire or drop anything. At the spot the plane loiters for its normal loiter time and attacks if the target is spotted again; otherwise it flies home with the same "Target lost" toast and grey marker.
- **Fighter-bomber / bomber runs:** if a pass can't reach the fire window (target inside the turning circle, overshot, or badly lined up), the plane extends straight out to a run-in distance of at least 60 m, turns back and lines up again. After 3 failed passes the alignment limit is relaxed; after 6 it flies home, so it never loops. Bombers drop only when the target is about one lead distance ahead, so a close start doesn't waste the stick.
- Vision is `vis`. The old weapon × armor table is kept as a comment in `config.js`. Levels were seeded from it as the nearest level on a log scale.

## 🔍 Unit Explore (the Unit Examiner)
Open it with **🔍 Unit Explore** in the main menu, `index.html?explore` or `index.html?examiner`. It uses the real game code for movement, combat, abilities and models on the real map. There's no economy, AI or win/lose, and money is unlimited. Normal Play is unchanged, and `examiner.js` only loads when you open the Examiner.
- **Pick tab**: choose a unit (grouped by branch). It spawns as blue. Choose an opponent: any unit, a building, or none. The opponent spawns as red in 😴 Dummy (never fires), 🛡️ Hold (fires, never moves) or ⚔️ Fight back mode. You can also pick the arena (forest edge / town / open field) and turn "see everything" on or off.
- **Test tab**: Move here (click or tap the ground), Attack, Stop, the unit's ability, −25% HP, Kill and Reset, for both blue and red. Speed is ⏸ / ¼× / ½× / 1× / 2×, with camera follow.
  - Live stats (📊 show/hide, remembered): HP or men left, state, target, range, reload, speed, ability cooldown, damage dealt, plus the config stats.
- **Attack matrix & rings**: one row per body type with level pips, range, multiplier and accuracy pips + text. "Can't hit" rows (level 0) have no ring.
  - **⭕ Rings** and **🔢 Ring numbers** switch the ground rings and their labels independently (shared with the Unit Menu and Sandbox, remembered). Under them, ground rings each have their own checkbox: one per hittable body, vision, plus min range / deploy / dive / bomb drop / satchel / repair where they apply. Rings with the same radius are nested and labeled with class, level and multiplier.
  - 🎛 **Tune** edits level, range and accuracy (A+/A−) live (+/− or slider) and vision. Edits are saved in this browser (`localStorage`) and apply only inside the Examiner. Each unit has a Reset to defaults. `config.js` never changes.
- **💣 Show bomb impacts** (Pick tab, on by default): each bomb leaves a yellow dot, the stick centre gets a red cross, and a label shows the centre's miss distance from the target plus the per-bomb range in metres.
- **Notes tab**: per-unit notes (saved in `localStorage`) with quick chips. **📋 Copy all notes** copies a plain-text report of every note plus each tuned value as `default -> mine`.
- Desktop shows a side panel. On phones it's a bottom sheet you can collapse; tap a button, then tap the ground.

## Files
- `js/main.js`: game loop, economy, placement, production, units, squads, abilities, aircraft, combat, fog, AI, input, HUD, test hooks (`window.__game`)
- `js/config.js`: economy constants, units (with per-body attack levels `vs`), body types, level → damage table, buildings, abilities, supply spots
- `js/examiner.js`: Unit Explore (lazy-loaded only when opened)
- `js/guide.js`: 📖 Unit Menu: unit + building cards, compare tables (lazy-loaded)
- `js/sandbox.js`: 🧪 Play Sandbox (lazy-loaded)
- `js/unitinfo.js`: shared unit model / live readout / accuracy text used by Explore, Unit Menu, Sandbox and the live card
- `css/sandbox.css`: Sandbox panel styles
- `css/examiner.css`: Examiner panel / bottom sheet styles
- `js/models.js`: low-poly team-colored vehicles, guns, planes, soldiers and buildings
- `js/icons.js`: SVG icons for the HUD
- `js/badges.js`: unit-type icon badges (one instanced, screen-sized billboard draw call; atlas built from icons.js)
- `js/map.js`: terrain, river, bridges, forest, roads, farm, city
- `js/nav.js`: grid A* with dynamic building blocks
- `js/particles.js`: point-sprite particles

## Test (box)
    export PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-runner/browsers
    node test/playtest.mjs [baseUrl]       # 66 checks; writes screenshots/11-17
    node test/stress.mjs 11 normal 1       # AI vs idle player (HQ invulnerable), 11 game minutes, checks for stalls and errors
    VULN=1 node test/stress.mjs 15 easy 1  # same, but the AI can win the match
    node test/mobile.mjs                   # 46 checks; iPhone 13 landscape + portrait emulation (hasTouch); writes screenshots/18-20
    node test/examiner.mjs                 # 73 checks; every unit: move / fire / ability / damage states / rings, tuning, notes, copy,
                                           #   normal Play untouched, iPhone 13 by tap; writes screenshots/examiner-*.png + examiner-results.json
    node test/regress.mjs                  # attack orders on hidden targets for ground units and aircraft (last known position, no fog leak); fighter-bomber + bomber vs targets 10/25/40/80 m ahead; bomber accuracy (9 approaches); accuracy seeding + per-body ranges; unit badges
    node test/lineup.mjs                   # screenshots/lineup-tanks.png, lineup-infantry.png (+ -close, -phone): every type side by side, blue front row, red behind
    node test/ui.mjs                       # 67 checks: main menu, How to Play, pause (frozen), live stats, Unit Menu (17 units × 6 rows, 8 buildings, compare), ring toggles, sandbox, iPhone 13
    node test/bodies.mjs                   # every unit has 6 body entries; level-0 bodies are never targeted or damaged; level>0 ones are
The tests use `__game.simulate(sec)` to fast-forward without rendering, because headless SwiftShader renders at about 1 to 6 fps.
