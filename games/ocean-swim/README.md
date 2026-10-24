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

**🙂 Face memory:** if a kid walks off and comes back, even in another jacket, they get their own slot back (same character, colour and friends). A small 🙂 on the roll-call card means the game knows that face. A tiny free face model ([@vladmandic/face-api](https://github.com/vladmandic/face-api), about 8 MB from jsDelivr) loads in a background worker (`js/face.js`, `js/faceworker.js`) a few seconds after the camera starts. It turns a small head crop into 128 numbers, and does that only when needed (about 2 checks per second at most). **Privacy: the face numbers stay in this tab's memory only.** They are never saved (no localStorage or IndexedDB), never sent anywhere, and are forgotten on a new roll call or when the page closes. No photos are kept. If the model can't load, tracking uses shirt colour and position as before. `?face=0` turns it off. 🐞 shows `🙂×samples d=distance` (at or under 0.5 = same kid). Limits: faces far away, turned away, or look-alike siblings or twins fall back to shirt and position.

**Publish:** `index.html`, `icon.svg`, `css/`, `js/`. `test/` and `screenshots/` are dev-only.
Tests: `test/run-all.sh`.
