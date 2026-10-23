# 🐦 Flap Flyer (v1)

Cozy low-poly 3D flight. Flap, glide, bank, and fly through the pink light beams to collect **16 🍎**.
No game over: bump the ground and you just puff some dust and bounce.

Static site, no build step. three.js 0.169 + MediaPipe Tasks Vision 0.10.14 come from jsDelivr through an import map;
the pose model (`pose_landmarker_lite`) comes from Google storage. Everything is free and runs in the browser.

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

## Test hooks (`window.__game`)
`state`, `apples`, `perf`, `pose`, `start()`, `flap(strength)`, `bank(x)`, `simulate(sec)`, `setPaused(b)`, `setBird({...})`, `height(x,z)`, `replay(seed)`.

## Tests (not deployed)
```
bash test/run-all.sh          # unit + e2e + screenshots + perf
node test/unit-pose.mjs       # pose -> control mapping, synthetic landmarks
node test/e2e.mjs [profile]   # desktop | iphone13-portrait | iphone13-landscape | denied | person
```
Uses Playwright from `/workspace/pw-runner` (`PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-runner/browsers`) with a fake camera.
`test/make-fake-person.py` draws a simple procedural cartoon person who flaps and tilts (`test/fixtures/person.y4m`, about 97 MB, created automatically when missing).
It is played back as a fake webcam, so the real PoseLandmarker gets tested end to end.
