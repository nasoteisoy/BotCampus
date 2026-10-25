# 🏟️ Creature Arena

A top-down creature arena battler for phones (Add to Home Screen) and desktop. All creatures, moves and art are original, drawn on canvas. Vanilla JS, no libraries, no CDN.

## Play
- **Pick** a creature: 🔥 Emberling (starter). Win a ladder to unlock 💧 Tidepup, then 🍃 Leafkit.
- **Fight** 5 waves. Red lines and circles (❗) are enemy attacks about to land, so move or dodge.
- **Types** (icons only): 🔥▶🍃 · 🍃▶💧 · 💧▶🔥 · 🪨🛡️🔥. ▲ means strong, ▼ means weak.

| | Touch | Keys |
|---|---|---|
| Move | joystick (left side) | WASD / arrows |
| Light shot (⚡5) | top-left move | J |
| Stream (⚡30) | top-right move | K |
| Big shot (6 s cooldown) | bottom-left move | U |
| Claw (⚡16) | bottom-right move | I |
| Dodge roll (i-frames) | 💨 | Space |
| ULTIMATE (charges from hits) | ⭐ | L |
| Menu | ≡ | Esc |

Multi-touch: you can move and press moves at the same time.

## Creatures
| Player | Type | Moves |
|---|---|---|
| Emberling | 🔥 | Spark ✨, Blaze Hose 🔥, Sun Bomb ☄️, Drake Swipe 🐾, ult Inferno Nova 🌋 |
| Tidepup | 💧 | Bubble 🫧, Tide Jet 🌊, Wave Bomb 💥, Fin Slash 🦈, ult Tsunami Ring 🌀 |
| Leafkit | 🍃 | Seed Shot 🌰, Petal Storm 🌸, Thorn Bomb 🌵, Vine Whip 🌿, ult Bloom Burst 🌻 |

Enemies: **Boulderback** 🪨 (cannon beam and ground slam), **Splashfin** 💧 (bubble volley and geyser), **Thornling** 🍃 (lunge and spikes). Wave 5 has a big Boulderback boss.

Enemy AI is a small state machine: chase → kite/strafe → windup (red warning) → attack → recover, plus a sidestep dodge against your shots.

## Files
- `index.html`, `css/style.css`, `js/game.js`: the whole game
- `sw.js`: network-first cache `creature-arena-v1` (deletes only old `creature-arena-*` caches)
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png`

Save data: `localStorage['creature-arena:save']` (wins, best score, pick, sound).
When you change files, bump `?v=` in index.html, sw.js CORE and the `CACHE` name together.
