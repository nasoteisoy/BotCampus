# Bubble Pop 🫧

Bubbles float up the screen. Pop them with your **hands and feet**.

| | |
|---|---|
| 🫧 | normal bubble: 1 point. Your hand or foot has to be *moving* (standing still doesn't count) |
| ⭐ | appears above a player's head: reach up! 3 points |
| 🐸 | appears low near a player: squat or kick! 2 points |

- 60 second round. A bubble storm in the last 10 s. Stars at the end (more players share the bubbles, so the star targets go down).
- 📷 **Camera mode:** up to 4 kids, each with their own colour (🟢🔵🟠🟣). Everyone pops in the same world, and every pop counts for whoever did it.
- 👆 **No camera:** tap/click bubbles (multi-touch works).
- 🔊/🔇 mute (remembered across Move & Play games), 🏠 back to the game picker.

**How detection works:** MediaPipe Pose Landmarker (lite, free, loaded from jsDelivr / Google storage) runs in the browser at up to 30 Hz and finds up to 4 bodies. The view is mirrored. Landmarks with low visibility are ignored. Hands (index finger, else wrist) and feet are the "touch points". Each one sweeps from its last position, so a fast swipe still pops. A touch has to move at least 0.3 screen heights/s to pop a normal bubble (35 % of that for ⭐/🐸, which spawn right next to you).

📷 Privacy: the video stays on your device. It is processed in the browser and never uploaded.

Files: `index.html`, `icon.svg`, `css/common.css`, `css/game.css`, `js/main.js`, `js/logic.js` (pure hit-test/scoring), `js/runner.js` (shared game shell), `js/cam.js`, `js/multi.js`, `js/body.js`, `js/draw.js`, `js/sound.js`.
