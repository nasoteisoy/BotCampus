# Move & Play 🏃 (hub)

The game picker for the Move & Play camera games. Lives at `games/move-play/`.

- Big picture cards: 🐦 Flap Flyer, 🫧 Bubble Pop, 🐰 Jump & Duck, 💃 Freeze Dance, plus the new open-world 3D games 🦖 Dino Stomp and 🐢 Ocean Swim (pink "3D ✨" badge). Each card shows the body parts it works (💪 arms, 🦵 legs, 🤸 whole body) and 👤×1–4 players.
- Tips row: 📏 stand back so your whole body shows, 💡 good light, 👆 no camera? tap/keys work too.
- 📷 Privacy: the video stays on your device. It is processed in the browser and never uploaded. No accounts, no tracking, no cookies.
- 🙂 Face memory (in the games) is **off in the hub**. Faces live in one page's memory only and are never saved, so they couldn't follow a kid from the hub into a game anyway. The hub doesn't download the face model. (`js/face.js` is here only because `js/cam.js` imports it.)
- Installable PWA: `manifest.webmanifest` plus 192/512/maskable icons. The 📲 button shows up when the browser offers an install.
- `sw.js` uses one cache, `move-play-v6`. It only handles and stores URLs under `games/move-play/`, and it only deletes its own old `move-play-*` caches. Other games and folders on the site are left alone.

Links are relative (`../flap-flyer/`, `../bubble-pop/`, …), so the folder works at any URL depth.

Files: `index.html`, `hub.css`, `hub.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
