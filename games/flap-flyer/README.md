# 🐦🐦 Flap Flyer 2 (multiplayer split screen)

Cozy low-poly 3D flight. Flap, glide, bank, and fly through the pink light beams to collect **16 🍎**.
No game over: bump the ground and you just puff some dust and bounce.

Static site, no build step. three.js 0.169 + MediaPipe Tasks Vision 0.10.14 come from jsDelivr through an import map;
the pose model (`pose_landmarker_lite`) comes from Google storage. Everything is free and runs in the browser.

## v2: one bird screen per person 📷 🙆🙆 = 🐦🐦
Turn on 📷 and everyone who stands in front of the camera gets their own bird and their own screen (up to 4).
- A person counts once their **face and shoulders** are visible for about **1 s**. Walk out for about **2 s** and your screen fades (🙈, your bird freezes), then it is removed. Come back sooner and you continue.
- 1 = full screen · 2 = side by side (landscape) or stacked (portrait) · 3 = 2×2 with a 🍎 scoreboard tile · 4 = 2×2.
- Players are numbered and colored left to right as you stand in the mirrored preview: 1 🟢, 2 🔵, 3 🟠, 4 🟣. Each screen has a colored border and a number + 🍎 badge. The camera preview shows the same numbered, colored boxes.
- Slots stay put when people shuffle around or cross a little. Screens are ordered by where people stand, and only re-ordered when someone joins or leaves.
- **Apples are shared (co-op):** one world, one seed, 16 🍎 for the whole team. Whoever flies through a beam first gets it (counted on their badge); the top counter is the team total.
- Joining mid-game: your bird appears beside the current leader (most 🍎), same heading.
- Other birds show a small colored ◆ marker. A friend's bird right in front of your camera is hidden on your screen only.
- No camera: 1-player keys/tap/tilt as before. 👥 on the title = 2 players on one keyboard (bird 1: W/A/D/Space, bird 2: ↑/←/→). Tapping a screen flaps that screen's bird.

## Controls
| Mode | Flap 🪽 | Bank ↩️↪️ |
|---|---|---|
| ⌨️ PC | Space / W / ↑ / mouse click | A D / ← → |
| 👆 Phone | tap anywhere | hold + drag left/right |
| 📱 Tilt (phone) | tap anywhere | tilt the phone (iOS asks permission when you press 📱) |
| 📷 Camera | flap your arms down (faster = more lift) | hold your arms out and tilt them like plane wings |

Keys and taps keep working in every mode. Camera is opt-in, and the game is fully playable without it.
Camera status icons: ⏳ loading · ✅ tracking · 🙈 no person seen · ⚠️ model could not load · 🚫 camera blocked.
🔊/🔇 = mute (M). 🔄 on the win screen = new world (new seed). `?seed=123` picks a world.

## Files
- `index.html`, `css/style.css`, `icon.svg`
- `js/main.js`: game loop, physics, camera, input, HUD, `window.__game` test hooks
- `js/world.js`: seeded terrain (10×10 chunks of 200 m, playable 1200 m with a soft turn-back edge at r=520 m), instanced trees, mountain ring, apples and beams
- `js/bird.js`: blocky bird and flap animation · `js/fx.js`: dust/sparkle particles and wingtip ribbons
- `js/audio.js`: procedural WebAudio (wind, ambient pentatonic music, chime, flap, thump); no audio files
- `js/pose.js`: webcam + PoseLandmarker + skeleton overlay · `js/poseMap.js`: pure pose→control mapping
- `js/rng.js`: seeded RNG + Perlin noise
- `js/multi.js` (v2): pure helpers: landmarks→person filter, `PeopleTracker` (debounce + stable slots), `layoutViewports`, player colors

## Test hooks (`window.__game`)
`state`, `apples`, `perf`, `pose`, `start()`, `flap(strength)`, `bank(x)`, `simulate(sec)`, `setPaused(b)`, `setBird({...})`, `height(x,z)`, `replay(seed)`.
v2: `players`, `views`, `flap(strength, slot)`, `bank(x, slot)`, `setBird(o, slot)`, `toggleDuo()`, `fakeCamera()` (pose pipeline with no webcam), `injectPeople([landmarks…])`, `render()`, `_three` (debug: scene/renderer/camera/world).

## Tests (not deployed)
```
bash test/run-all.sh          # unit + e2e + screenshots + perf
node test/unit-pose.mjs       # pose -> control mapping, synthetic landmarks
node test/unit-multi.mjs      # debounce, slot tracking, layout math
node test/e2e-multi.mjs       # fake 1-4 people at 390x844, 844x390, 1280x800
node test/shots-multi.mjs     # screenshots 10-19 · node test/perf-multi.mjs (1/2/4 views FPS)
node test/playtest.mjs        # ~90 s headless session with fake flapping people (logs only)
node test/e2e.mjs [profile]   # desktop | iphone13-portrait | iphone13-landscape | denied | person
```
Uses Playwright from `/workspace/pw-runner` (`PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-runner/browsers`) with a fake camera.
`test/make-fake-person.py` draws a simple procedural cartoon person who flaps and tilts (`test/fixtures/person.y4m`, about 97 MB, created automatically when missing).
It is played back as a fake webcam, so the real PoseLandmarker gets tested end to end.
