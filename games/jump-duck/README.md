# Jump & Duck 🐰

Run down a path. **Jump** over logs 🪵, **squat** under bars 🚧, **lean or step** sideways around rocks 🪨, and grab the ⭐ coins.

- 75 second round. Stars at the end: share of obstacles cleared plus coins grabbed (80 % = ⭐⭐⭐, 50 % = ⭐⭐, 25 % = ⭐).
- 📷 **Camera mode:** up to 4 runners (🐰🐻🦊🐼). Each one gets their own lane view, in the order the kids stand in the room. Before the countdown, each kid stands still for **2 s** while a ring fills. That records their own standing height and torso size, so big and small kids are judged fairly.
- ⌨️👤 **1 player keys:** ⬆️/Space/W jump, ⬇️/S duck, ⬅️➡️/A D lanes, or the on-screen buttons and swipes.
- ⌨️👥 **2 players keys:** P1 = W A S D, P2 = arrow keys.
- Kid-friendly timing: if you're up to 0.22 s late with a jump, duck or lean, it still counts, and coins get the same window. Bouncing back up from a squat never counts as a jump.
- 🔊/🔇 mute, 🏠 back to the game picker.

**How detection works:** MediaPipe Pose Landmarker (lite) finds up to 4 bodies in the browser. Per player, everything is measured in *torso lengths* from that player's calibrated standing pose:
jump = hips rise ≥ 0.12 torso while moving up quickly (or are simply ≥ 0.3 torso up), and the shoulders rise too. Duck = shoulders drop ≥ 0.28 torso (squat or bend). Lane = sideways step plus shoulder lean adds up to ≥ 0.3 torso (with hysteresis). The baseline drifts slowly, so walking closer or farther is tolerated.

📷 Privacy: the video stays on your device. It is processed in the browser and never uploaded.

🙂 **Face memory:** if a kid walks off and comes back, even in another shirt, they get their own slot back (same character, colour and score). A small 🙂 on the roll-call card means the game knows that face. A tiny free face model ([@vladmandic/face-api](https://github.com/vladmandic/face-api), about 8 MB from jsDelivr) loads in a background worker a few seconds after the camera starts. It turns a small head crop into 128 numbers, and does that only when needed (about 2 checks per second at most). **The face numbers stay in this tab's memory only.** They are never saved (no localStorage or IndexedDB), never sent anywhere, and are forgotten on a new roll call or when the page closes. No photos are kept. If the model can't load, the game uses shirt colour and position as before. `?face=0` turns it off. 🐞 shows `🙂×samples d=distance` (at or under 0.5 = same kid). Limits: faces far away, turned away, or look-alike siblings or twins fall back to shirt and position.

Files: `index.html`, `icon.svg`, `css/common.css`, `css/game.css`, `js/main.js`, `js/moves.js` (pure detector/course logic), `js/runner.js`, `js/cam.js`, `js/track.js`, `js/face.js` + `js/faceworker.js` (face memory), `js/multi.js`, `js/body.js`, `js/draw.js`, `js/sound.js`.
