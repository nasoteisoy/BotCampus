# 🪖 Trooper Customizer (v2: nations + tank)

A sandbox for designing the look of your RTS army. No fighting. You set a **player name**, create **nations** (colors + flag), and design **unit looks** (a space-era rifle trooper and a space tank) that belong to a nation. Every model is built to an RTS budget, so the same units can be dropped into an RTS by the hundred.

Play: `games/trooper-custom/` (https://nasoteisoy.github.io/BotCampus/games/trooper-custom/)

## Data model
```
Player { name }
 └─ Nation { name, primary, secondary, suit tone, flag symbol + symbol color, tech glow color + level }
     └─ unit looks (trooper looks, tank looks): shape / gear only, no colors
```
You edit colors and the flag **once per nation**, and every unit of that nation uses them: trooper, tank, squads, and saved-look thumbnails.

## Controls
| | |
|---|---|
| **Drag** / one finger | rotate the turntable |
| **Wheel** / pinch | zoom |
| 🪖 / tank icon (top right) | switch unit: trooper ↔ tank |
| front · side · back figures | camera presets |
| 🔄 | auto spin |
| 👥 | squad preview at RTS camera distance. **👥 100** cycles 50 / 100 / 200, and **🔀** gives a mixed squad (90% troopers + 10% tanks) |
| 🎲 / ↺ | randomize / reset the current unit (on the 🏳️ tab, 🎲 randomizes the nation's colors and flag) |

Panel tabs (bottom sheet on phones, side panel on desktop and landscape):

- 🏳️ **Nation**:
  - 👤 player name
  - nation list: tap to switch, ✏️ rename, 🗑️ delete. Delete asks ✔️/✖️ first and says how many saved looks go with it; the last nation can't be deleted. ➕ creates a new nation.
  - primary and secondary colors (12 each + 🎨 custom), suit tone, 12 flag symbols, symbol color (auto / light / dark / primary), glow color and glow level
- Trooper parts:
  - 🪖 helmet (dome, angular, crest, goggles, recon) + skin tone
  - 🛡️ armor (light / medium / heavy) + shoulder pads
  - 🎒 backpack + 🚩 back flag + cape / scarf
  - 🔫 rifle (carbine, laser, bullpup)
- Tank parts:
  - ⛓️ hull (light / medium / heavy) + drive (treads / hover)
  - 🎯 turret (dome / wedge / box) + main gun (cannon / twin / railgun / laser)
  - 📡 extras, as on/off tiles: antenna, pennant (nation flag), side skirts, smoke launchers, roof MG

  The nation flag is always shown on both turret sides.
- 💾 **Saved**: **💾+** saves the current unit look into the active nation. Looks are grouped by nation, with thumbnails rendered in that nation's colors; they re-render when the nation's colors change. Tap a look to load it (this switches the unit and the active nation). 🔗 copies a share code, 🔁 overwrites the look with the current one, ✏️ renames, 🗑️ deletes (with confirm).

Part buttons are live 3D thumbnails drawn in the current nation's colors.

## Share codes
- **TC2:** `TC2:<base64url JSON>`, with player name, nation name, nation colors/flag, trooper look, tank look and the active unit. Loading a code reuses a nation with identical colors/flag (preferring the same name) or creates a new one. It does not overwrite your player name.
- **TC1** (v1 trooper codes) still load. Their colors/flag go to a matching or new nation and the gear goes to the trooper.

## Storage and v1 migration
Everything is saved in localStorage under `trooper-custom:db` (`{v:2, player, nations, active, unit, cur, looks}`).

On first run of v2, the v1 keys (`trooper-custom:current`, `trooper-custom:looks`) are migrated:
- one nation is created per distinct color/flag combination ("Nation 1", "Nation 2", ...)
- each v1 look moves into its nation as a trooper look
- the current look's nation becomes active
- the 💾 tab opens once

The v1 keys are left untouched.

## Performance budget (RTS-ready)
| | trooper | tank |
|---|---|---|
| triangles (all part combos) | 480 to 1,410 (default 1,004) | 552 to 1,330 (default 898) |
| budget (enforced by tests) | ≤ 1,500 | ≤ 2,500 |
| materials | **2, shared by both units** | same 2 |
| draw calls, posable single unit | 6 | 4 |
| draw calls, squad (any size) | 2 | 2 (mixed squad: 4) |

- **Materials:** one Lambert **nation atlas** (a 160×64 canvas holding the flag tile plus primary, secondary, skin, suit, gunmetal and trim swatches) and one emissive **glow** material. Recoloring a nation only repaints the atlas: no new materials, no new draw calls. The trooper and tank use the *same* material instances.
- **Squads:** each unit type is merged per material into one `InstancedMesh`. Every instance's matrix is updated each frame (bob/sway, hover tanks float), as it would be in an RTS.
- The HUD shows 🔺 triangles · 🖌️ draw calls · ⏱ FPS.
- Headless Chromium with SwiftShader (software rendering, no GPU) runs a single unit at ~60 fps and 100 troopers, tanks or mixed at ~12–20 fps. A real GPU handles this easily, since the draw-call count stays constant.

For RTS reuse, `js/trooper.js` exports `TeamLook` (atlas + 2 materials), `buildMergedDef(def, state)` and `TROOPER`, and `js/tank.js` exports `TANK`. Create one `TeamLook` per nation and one `InstancedMesh` per material per unit type.

## Files
Publish: `index.html`, `css/`, `js/` (`main.js`, `trooper.js`, `tank.js`), `vendor/` (three.js r169 + OrbitControls, vendored, no CDN), `icon.svg`, `manifest.webmanifest`, `sw.js`, `README.md`.
Don't publish: `test/`, `screenshots/`.

The service worker only registers over https. Its cache is `trooper-custom-v2`, and cleanup only deletes caches starting with `trooper-custom-`. Assets load with `?v=2`.

## Tests
```
PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-runner/browsers node test/run.mjs
```
The tests check the following at 390×844, 390×664, 360×740, 844×390 and 1280×800:
- 0 console errors and no overflow on every tab of both units, touch targets of 36 px or more
- every trooper, tank and nation option changes the model, and nation colors propagate to both units
- all UI buttons work
- TC2 round-trips, TC1 is accepted, bad codes are rejected
- trooper and tank triangle budgets hold over all part combinations
- trooper, tank and mixed squads
- nation create / rename / switch / delete with confirm, and the player name, all surviving a reload
- saved looks grouped by nation (load, rename, overwrite, delete) surviving a reload, with thumbnails re-rendering in the nation's colors
- v1 → v2 migration, which runs once

Screenshots are written to `screenshots/` and results to `test/last-results.txt`.
