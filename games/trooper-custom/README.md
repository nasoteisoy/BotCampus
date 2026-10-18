# 🪖 Trooper Customizer

A sandbox with one space-era rifle trooper. You only change how he looks: two team colors, a flag symbol, and his gear. There's no fighting. The model is built to the same budget as an RTS unit, so this exact trooper can be dropped into an RTS by the hundred.

Play: `games/trooper-custom/` (https://nasoteisoy.github.io/BotCampus/games/trooper-custom/)

## Controls
| | |
|---|---|
| **Drag** / one finger | rotate the turntable |
| **Wheel** / pinch | zoom |
| 🧍 front · side · back | camera presets (the three figure buttons) |
| 🔄 | auto spin |
| 👥 | squad preview: 100 copies at RTS camera distance. Tap the **👥 100** chip to switch 50 / 100 / 200 |
| 🎲 / ↺ | randomize / reset |

Panel tabs (bottom sheet on phones, right side on desktop / landscape):

- 🎨 **Colors**: primary (12 + 🎨 custom picker), secondary/trim (12 + custom), suit tone (5)
- 🏳️ **Flag**: 12 vector symbols (star, planet, comet, skull, wing, bolt, chevron, crescent, gear, atom, triangle, circle). Symbol color: Auto / Light / Dark / Primary. 🚩 back banner on/off (it goes on the antenna when the radio pack is equipped)
- 🪖 **Head**: helmet (Dome visor, Angular, Crest, Open-face goggles, Recon mono-eye), visor color (6), glow (off / soft / bright), skin tone (shows with the goggles helmet)
- 🛡️ **Armor**: build (light / medium / heavy), shoulder pads (none / round / angular)
- 🎒 **Gear**: backpack (none / jetpack / radio / ammo), extra (none / cape / scarf). Extra is off by default
- 🔫 **Rifle**: carbine, long laser rifle, bullpup
- 💾 **Looks**: type a name and press **💾+** to save. Each saved look shows a rendered thumbnail. Tap a row to load it, 🔗 copies its share code, 🔁 overwrites it with the current look, ✏️ renames it, 🗑️ deletes it (asks ✔️/✖️ first). The 🔗 share code field shows the current look's `TC1:` code: 📋 copies it, and pasting a code then pressing ⤵ loads it.

The part tiles are live 3D thumbnails of each option, drawn in your current colors.

**Persistence** (localStorage): the current trooper is stored in `trooper-custom:current` (as a share code) and the library in `trooper-custom:looks` (up to 40 looks, with a 96 px PNG thumbnail each).

**Share code**: `TC1:` + primary hex + secondary hex + one base-36 digit per option, in this order: sym, sc, helm, vis, glow, armor, pads, pack, rifle, extra, banner, suit, skin. Fields are only ever appended, so old codes keep working.

## Performance budget (RTS-ready)
- **Triangles:** the default trooper is ~1,000 triangles. Across all 3,240 part combinations the range is 480 to 1,410, and the hard cap is 1,500 (enforced by the tests).
- **Materials: 2 in total.** One Lambert material uses a 160×64 canvas **team atlas**: the flag tile plus solid swatches for primary, secondary, skin, suit, gunmetal and trim. The second is an emissive **visor** material (visor, lenses, rifle coils, jet glow). Changing colors or the symbol only repaints the atlas. No new materials or textures are created, and each team shares one atlas.
- **Draw calls:** 6 for the posable single trooper (merged per bone × material, so the idle animation is just group transforms with no skinning). In the squad, the whole trooper is merged per material into **one `InstancedMesh` each → 2 draw calls for the entire squad**, whether it's 50, 100 or 200 troopers. Every instance's matrix is updated each frame (bob/sway), as it would be in an RTS.
- The HUD chip shows 🔺 triangles · 🖌️ draw calls · ⏱ FPS for the single trooper or the whole squad.
- Headless Chromium with SwiftShader (software rendering, no GPU) gets about 60 fps for the single trooper, about 15 fps for 100 troopers (116k tris) and about 8 fps for 200. A real GPU handles this easily, since the draw-call count stays constant.

For RTS reuse: `js/trooper.js` exports `buildMerged(state)` (2 geometries) and `TeamLook` (atlas + 2 materials). Create one `TeamLook` per team and one `InstancedMesh` per material per unit type.

## Files
Publish: `index.html`, `css/`, `js/`, `vendor/` (three.js r169 + OrbitControls, vendored, no CDN), `icon.svg`, `manifest.webmanifest`, `sw.js`, `README.md`.
Don't publish: `test/`, `screenshots/`.

The service worker only registers over https. Its cache is `trooper-custom-v1`, and cleanup only deletes caches starting with `trooper-custom-`. Assets load with `?v=1`.

## Tests
```
PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-runner/browsers node test/run.mjs
```
The tests start a static server (`test/server.mjs`) and check the following at 390×844, 390×664, 360×740, 844×390 and 1280×800:
- 0 console errors, no overflow, touch targets of 36 px or more
- every option value changes the model
- every UI button sets the state
- share codes round-trip
- the triangle and material budget holds over all combinations
- squad preview, including the FPS readout and live updates
- the saved-looks library: save, load, rename, overwrite, and delete with confirm, all surviving a reload

Screenshots are written to `screenshots/` and results to `test/last-results.txt`.
