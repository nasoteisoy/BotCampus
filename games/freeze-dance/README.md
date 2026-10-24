# Freeze Dance 💃

🎵 Music on means **dance!** 🔇 Music off means **freeze!** 🧊 A picture means **copy the pose!** (⭐ star, 🙌 arms up, ✈️ airplane, 🦩 flamingo).

- 90 second round of dance → freeze or pose → dance … Each part is worth up to 3 points. Stars at the end (70 % = ⭐⭐⭐, 40 % = ⭐⭐).
- A freeze only counts if you were dancing before it, so standing still the whole game earns nothing.
- 📷 **Camera mode:** up to 4 kids, each with their own colour and dance meter.
- 👆 **No camera:** tap fast to dance, stop tapping to freeze, and tap the matching picture for pose rounds.
- 🔊/🔇 mute, 🏠 back to the game picker.

**How detection works:** MediaPipe Pose Landmarker (lite) runs in the browser. "Dance energy" is how fast 13 body points (head, shoulders, elbows, wrists, hips, knees, ankles) move, measured in torso lengths per second. Tracker jitter below a small threshold is ignored. Dancing = energy above 0.55. A good freeze = at most 0.45 s of movement above 0.35 energy, counted after a 0.7 s grace to stop. Poses are compared by arm angles, arm spread and a raised foot, and a pose counts once the match is 80 % or more for 0.4 s.

📷 Privacy: the video stays on your device. It is processed in the browser and never uploaded.

🙂 **Face memory:** if a kid walks off and comes back, even in another shirt, they get their own slot back (same character, colour and score). A small 🙂 on the roll-call card means the game knows that face. A tiny free face model ([@vladmandic/face-api](https://github.com/vladmandic/face-api), about 8 MB from jsDelivr) loads in a background worker a few seconds after the camera starts. It turns a small head crop into 128 numbers, and does that only when needed (about 2 checks per second at most). **The face numbers stay in this tab's memory only.** They are never saved (no localStorage or IndexedDB), never sent anywhere, and are forgotten on a new roll call or when the page closes. No photos are kept. If the model can't load, the game uses shirt colour and position as before. `?face=0` turns it off. 🐞 shows `🙂×samples d=distance` (at or under 0.5 = same kid). Limits: faces far away, turned away, or look-alike siblings or twins fall back to shirt and position.

Files: `index.html`, `icon.svg`, `css/common.css`, `css/game.css`, `js/main.js`, `js/moves.js` (pure motion/pose logic), `js/rng.js`, `js/runner.js`, `js/cam.js`, `js/track.js`, `js/face.js` + `js/faceworker.js` (face memory), `js/multi.js`, `js/body.js`, `js/draw.js`, `js/sound.js`.
