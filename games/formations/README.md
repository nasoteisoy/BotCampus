# Formations · WW2 section drill (v1.0)

A phone-first sandbox for playing with WW2 small-unit formations. There are no enemies, no timer and no score.
Pick your unit, tap a formation and watch the men walk into their new places, then march them around a small
patch of Normandy-style countryside.

Plain JavaScript + canvas, no libraries, original art. Installable PWA (manifest, `sw.js` cache `formations-v1`, icons):
open it in the phone browser and use **Add to Home Screen**. It works offline after the first visit.

Live: https://nasoteisoy.github.io/BotCampus/games/formations/

## Units
| Unit | Men | Formations |
|---|---|---|
| 🪂 Airborne section (default) | 10: section commander (Sten), Bren gunner + No.2, 2IC, 6 riflemen | Single file, Column, Extended line, Arrowhead, Echelon L/R, Diamond, Blob, All-round |
| 🪂 Airborne platoon | 35: HQ (Lt, Sgt, runner, 2" mortar + No.2) + 3 sections | Two up, One up, Line, Column, Harbour (each section takes its own sub-formation) |
| US rifle squad | 12: squad leader, asst, BAR team (3), 2 scouts, 5 riflemen | Squad column, Single file, Skirmish line, Wedge, Echelon L/R, Diamond, Loose, Perimeter |
| German Gruppe | 10: Gruppenführer (MP 40), MG 42 team (3), Stellvertreter, 5 Schützen | Reihe, Schützenreihe, Schützenkette (MG-anchored), Rudel, Keil, Echelon L/R, Rundum |

Every man is his own figure: helmet colour dot = role (white leader ★, yellow MG, pale yellow MG crew/ammo,
blue 2IC, orange mortar, green scout); his weapon points where he faces.

## Controls
- 👆 **Tap ground**: march there. The formation keeps its shape and wheels to face the way it goes.
- ➤ **Drag the arrow** in front of the leader: turn on the spot.
- ✋ **Hold** the ground: drop waypoints (📍), then tap the final spot to go. ✖ clears them.
- 🤏 Drag to pan, pinch or mouse-wheel to zoom, 🎯 follows the unit again.
- ↔ **Spacing** slider 2–10 m with a live scale bar. 🚶/🏃 walk or rush. ⏸ pause.
- ℹ️ Info card for the current formation: when it was used, pros/cons and five ratings.
- ✏️ Drag single men to make your own layout, then 💾 save to one of 3 slots and 📂 load it later (it remembers the unit).

The leader is always the reference point: slots are placed relative to him and his heading. Men walk (no teleport)
with a little personal jitter and speed difference, wider formations wheel more slowly, and the leader waits for stragglers.

## Overlays (👁)
- 🔫 **Arcs**: each man's arc of fire. Bren / BAR / MG 42 are longer and highlighted. Arcs where a mate stands in the
  way turn red and dashed (friendly masking), so you can see why a file has almost no fire forward.
- 🌡 **Cover**: combined coverage heatmap plus a firepower rose showing the share of fire to ⬆ the front, ↔ the flanks and ⬇ the rear.
- ⚔ **MG burst**: the worst single burst line (≈1.6 m beaten zone) and how many men it would catch. Single file and line are
  terrible when enfiladed.
- 💥 **Shell**: the worst single 10 m shell burst and how many men it would catch. Open the spacing and watch the number fall.
- 🗣 **Voice**: the leader's command radius (platoon: commander plus section leaders). Men out of earshot get a **?**.
- 👻 Slots (target ghost rings while men move) and 🛣 Road (auto column on the road).

## Terrain
Open fields, a road, a hedgerow with a gate, a small wood and a few farm buildings. Men slow down in the wood and
through the hedge, speed up a little on the road and walk round buildings. Marching along the road automatically
switches to a column squeezed onto the road (toggle 🛣) and switches back afterwards.

## Notes
- Arc lengths are shortened so they fit a section-sized view (rifle 60 m, Bren 120 m, BAR 100 m, MG 42 140 m).
- Time runs a little fast so moves stay snappy.
- Formation details follow common WW2 practice in simplified form. Real drill varied by unit, year and ground.
