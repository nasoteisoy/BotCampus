# Space Front Line: planet + orbit RTS (three.js, no build step)

The space version of **Front Line** (`games/tank-2v2`). It keeps the same base-building RTS: modes, AI, commands, Unit Menu, Unit Examiner, fog and phone controls. The difference is that every match is fought on **two layers**:

- 🪐 **Planet**: bases, barracks, mech factories, gun works, artillery, plasma turrets, mining rigs. Units are infantry, hover/battle/siege tanks, rail guns and plasma artillery.
- 🚀 **Orbit**: space stations, shipyards, hangars, laser turrets, solar arrays. Units are corvettes, frigates, battleships, carriers (with drones), dropships, plus craft (interceptors, strike and siege bombers, recon drone).

**Win:** destroy every enemy HQ in both layers, meaning all planet bases and all space stations. Your side loses when it has none left.

## Cross-layer play
- **Orbital strike (O):** frigates and battleships charge for 1.2 s, then beam down on the best spotted enemy within 60 m of the ground point directly below them.
- **Troop drop (C):** a dropship carries 2 squads and drops them in pods on the planet below. When it is empty, the same button beams your troops below back up. The AI reloads its dropships at the station for $200.
- **Launch drones (L):** a carrier launches 2 attack drones that live 45 s.
- **View toggle:** the big round button (or **Tab**) switches planet ↔ space. A red **!** badge means the other layer is under attack. Ships you selected in space can be ordered from the planet view: they fly to the point above the spot you tap.

The space layer is the planet grid shifted by `SPACE_X = 1000` on x, so a ship at (x+1000, z) sits directly above ground point (x, z). This keeps targeting, spotting and splash separate per layer with no special cases.

## Modes
- **1 v 1**: you against one AI commander.
- **2 v 2**: you and an AI ally (always Normal) against two AIs.
- **Enemy difficulty:** Easy or Normal.

Every AI commander runs one planner per layer. Each planner builds, trains, attacks in waves, defends, and uses orbital strikes and troop drops.

The menu also offers Sandbox, Unit Explore (Examiner) and Unit Menu (attack matrix, rings, compare).

## Files
- `index.html`, `css/`, `js/`: copied and adapted from `games/tank-2v2`.
- `js/config.js`: units, buildings, abilities and income.
- `js/map.js`: the alien planet plus `buildSpace()`.
- `js/models.js`: ships, stations and turrets.
- `js/icons.js`: ship icons from Space Defense.
- `vendor/`: three.js r169, vendored, with no CDN.

Test hooks live on `window.__game`, including `start(diff, vs)`, `setView`, `simulate` and `autopilot`.
