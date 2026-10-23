# Freeze Dance 💃

🎵 Music on means **dance!** 🔇 Music off means **freeze!** 🧊 A picture means **copy the pose!** (⭐ star, 🙌 arms up, ✈️ airplane, 🦩 flamingo).

- 90 second round of dance → freeze or pose → dance … Each part is worth up to 3 points. Stars at the end (70 % = ⭐⭐⭐, 40 % = ⭐⭐).
- A freeze only counts if you were dancing before it, so standing still the whole game earns nothing.
- 📷 **Camera mode:** up to 4 kids, each with their own colour and dance meter.
- 👆 **No camera:** tap fast to dance, stop tapping to freeze, and tap the matching picture for pose rounds.
- 🔊/🔇 mute, 🏠 back to the game picker.

**How detection works:** MediaPipe Pose Landmarker (lite) runs in the browser. "Dance energy" is how fast 13 body points (head, shoulders, elbows, wrists, hips, knees, ankles) move, measured in torso lengths per second. Tracker jitter below a small threshold is ignored. Dancing = energy above 0.55. A good freeze = at most 0.45 s of movement above 0.35 energy, counted after a 0.7 s grace to stop. Poses are compared by arm angles, arm spread and a raised foot, and a pose counts once the match is 80 % or more for 0.4 s.

📷 Privacy: the video stays on your device. It is processed in the browser and never uploaded.

Files: `index.html`, `icon.svg`, `css/common.css`, `css/game.css`, `js/main.js`, `js/moves.js` (pure motion/pose logic), `js/rng.js`, `js/runner.js`, `js/cam.js`, `js/multi.js`, `js/body.js`, `js/draw.js`, `js/sound.js`.
