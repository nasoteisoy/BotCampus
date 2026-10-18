# Front Line Defense (phone-first tower defense on the Front Line engine)

Hold the line for **12 waves**. Enemy waves come down three red lanes (west, centre and east bridges) toward your HQ.
Place towers, deploy real Front Line units from the HQ, command them, and upgrade everything. If the HQ falls, you lose.

Built on Dev A's Front Line tank RTS (`games/tank-2v2`, copied here, not imported). It reuses the engine, map, unit models, silhouettes,
icons, unit badges, the attack matrix (`vs` levels per body type), the Unit Examiner and the touch controls.
three.js r169 is vendored in `vendor/` so the game works offline as a PWA.

## How to play
- **🏰 Towers** (tray tab): tap a tower to enter build mode. A ghost and its range ring appear in front of the HQ. Tap the map to move it, then **✓**. Build mode stays on until you tap **✕** (or tap the tower button again). Mouse: hover, then click.
  - MG Nest $150 (vs infantry), AT Bunker $260 (vs tanks), Flak Tower $220 (vs planes, wave 2+), Mortar Pit $380 (long-range splash, wave 3+), Supply Depot $250 on a **$** spot (+$270/min).
  - Towers must be within 50 m of the HQ, a depot or another tower. Not on water, forest or $ spots.
- **🪖 Units**: tap a unit to deploy it from the HQ (hold or right-click to cancel). All 17 Front Line units; some unlock on later waves (🔒n).
- **Command**: tap a unit to select it, tap the ground to move, tap an enemy to attack. Abilities, groups, Select box, Stop and Rally work as in Front Line.
- **⬆ Upgrades**: armory per branch (🪖 🛡️ 💥 ✈️, 3 levels: +20% damage, -20% damage taken each), 💰 supply (+$72/min per level), 🔧 repair HQ (+700).
  Tap a tower to see its stars: **⬆** (★★, ★★★: +45% damage, +12% range, tougher, full repair) or **💲** sell for 60%.
- **📋 Waves**: every wave's enemies (icons with counts) and lanes (↙ ⬇ ↘) ahead of time.
- **▶ 🌊n** (top): a build phase counts down between waves; tap to call the next wave early for a bonus ($3 per second left).
- **Money**: start $900, HQ +$120/min, bounty for every kill (32% of its cost), and a bonus for each cleared wave.
- **Win**: clear wave 12. **Lose**: the HQ is destroyed. Enemy waves grow and add new types (tanks wave 3, mediums 4, fighter-bombers 5, commandos 6, heavies 7, bombers 8, fighters 9; the boss wave 12 adds a heavy and a bomber).

## Run locally
    cd /workspace/bot-campus-publish && python3 -m http.server 8799
    # open http://localhost:8799/games/front-line-defense/

## PWA
`manifest.webmanifest`, `icon-192.png` / `icon-512.png`, and `sw.js` with cache `front-line-defense-v1`. Activate deletes only cache keys starting with `front-line-defense-`.
Fetches are network-first with `cache:'no-cache'` (the cache is the offline fallback). A new version reloads the page once and shows an "⬆ Updated" toast.

## Files
- `js/main.js`: the Front Line engine plus the **FRONT LINE DEFENSE** section (lanes, seeded waves, director, towers, upgrades, tray HUD, `window.__game` test hooks such as `td()`, `nextWave()`, `placeTower()`, `upgradeTower()`, `armoryUp()`)
- `js/config.js`: units (towers are static units with `br: 'def'`), `TD` tuning, `UNLOCK`, `ARMORY`
- `js/models.js`: tower models (sandbag MG nest, concrete AT bunker, flak tower, mortar pit) next to the Front Line models
- `js/icons.js`, `js/badges.js`, `js/examiner.js` (towers appear in the Examiner under 🏰), `js/map.js`, `js/nav.js`, `js/particles.js`
- `css/style.css`, `css/examiner.css` (Front Line), `css/fld.css` (tray, wave button, lists)
