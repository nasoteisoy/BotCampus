# Dino Stomp 🦖 (Move & Play, 3D)

A cute little 3D dinosaur in an open valley. Kids move it with their whole body in front of the camera.
Lives at `games/dino-stomp/`, next to the Move & Play hub (`../move-play/`, 🏠 button).

**Moves (camera)**
- 🚶 March in place = walk (faster marching = faster dino)
- ↩️↪️ Lean left / right = turn
- ⬆️ Jump = dino jumps (and stomps when it lands). Jump up onto rocks to reach eggs.
- 🦖 Both arms up high = ROAR. Roar under a golden tree and the fruit falls down.
- Standing still does nothing.

**Find 18:** 🍎 fruit on the ground, golden fruit in trees (roar), 🥚 eggs on rocks (jump). Every egg hatches a baby dino that follows you.
Relaxed by default (no timer, no fail). ⏱️ on the title turns on a 3-minute round.

**Players:** 1–4 kids, split screen (roll call 📣🙋 decides who is who). No camera? Keys or touch:
W walk, A/D turn, Space jump, E roar (player 2: arrows, ↓/Enter jump, Right-Shift or / roar). Touch: hold = walk, drag = turn, tap = jump, 🦖 ⬆️ buttons.
Menus work by holding a hand on a button for about 1.2 s. 🔍 changes the camera distance. 🔊 toggles sound.

**Tech:** static files only, no build. three.js 0.169 and MediaPipe Tasks Vision 0.10.14 from jsDelivr (importmap). All models are made from simple shapes in code, so there are no asset files.
The video stays on the device: it is processed in the browser and never uploaded.

**🙂 Face memory:** if a kid walks off and comes back, even in another jacket, they get their own slot back (same character, colour and finds). A small 🙂 on the roll-call card means the game knows that face. A tiny free face model ([@vladmandic/face-api](https://github.com/vladmandic/face-api), about 8 MB from jsDelivr) loads in a background worker (`js/face.js`, `js/faceworker.js`) a few seconds after the camera starts. It turns a small head crop into 128 numbers, and does that only when needed (about 2 checks per second at most). **Privacy: the face numbers stay in this tab's memory only.** They are never saved (no localStorage or IndexedDB), never sent anywhere, and are forgotten on a new roll call or when the page closes. No photos are kept. If the model can't load, tracking uses shirt colour and position as before. `?face=0` turns it off. 🐞 shows `🙂×samples d=distance` (at or under 0.5 = same kid). Limits: faces far away, turned away, or look-alike siblings or twins fall back to shirt and position.

**Publish:** `index.html`, `icon.svg`, `css/`, `js/`. `test/` and `screenshots/` are dev-only.
Tests: `test/run-all.sh` (needs Playwright; see `PLAYWRIGHT_BROWSERS_PATH`).
