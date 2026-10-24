# Ocean Swim 🐢 (Move & Play, 3D)

A cute little 3D sea turtle in an open, sunny bay. Kids swim it with their whole body in front of the camera.
Lives at `games/ocean-swim/`, next to the Move & Play hub (`../move-play/`, 🏠 button).

**Moves (camera)**
- 🏊 Arm strokes (swing arms up and down, or breaststroke) = swim forward. More strokes = faster. Stop and it glides to a stop.
- ↩️↪️ Lean left / right = turn
- ⬆️ Both arms held up high = float up
- ⬇️ Squat down = dive down
- Standing still does nothing.

**Find 18:** 🐚 shells on the sand, ⭕ bubble rings up high (swim through them), and pearls in clams on top of rocks. Every pearl becomes a fish friend that swims along with you.
A ⬆️ or ⬇️ hint shows when the nearest thing is above or below you. There are no enemies, no air meter and no fail, and the walls of the bay just turn you around.
Relaxed by default. ⏱️ on the title turns on a 3-minute round.

**Players:** 1–4 kids, split screen (roll call 📣🙋). No camera? Keys or touch:
W swim, A/D turn, Space up, S or Left-Shift down, E stroke (player 2: arrows, Enter up, ↓ or Right-Shift down). Touch: hold = swim, drag = turn, tap = stroke, ⬆️ ⬇️ buttons.
Menus work by holding a hand on a button for about 1.2 s. 🔍 changes the camera distance. 🔊 toggles sound.

**Tech:** static files only, no build. three.js 0.169 and MediaPipe Tasks Vision 0.10.14 from jsDelivr (importmap). All models are made from simple shapes in code.
The video stays on the device and is never uploaded.

**Publish:** `index.html`, `icon.svg`, `css/`, `js/`. `test/` and `screenshots/` are dev-only.
Tests: `test/run-all.sh`.
