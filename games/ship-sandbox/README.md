# Ship Sandbox

A sandbox (not a full game): one big capital ship built from separate breakable parts, plus a palette of attacks to test against it.
Built for phones first and icons first. Installs as a PWA (Add to Home Screen) and works offline.

## Play
- **Attack palette** (bottom on phones, left column on phone landscape): tap an icon to send that attack.
  💥 Cannon · 🚀 Rockets · 🔦 Laser · 🐟 Torpedo · 🎯 Artillery · 💣 Bomber (bombing run) · ✈️ Fighters (strafing) · 🌀 EMP
- **Target**: tap a part on the ship, or a row in the 🧩 list. Tap the 🎯 chip (or the same part again) to go back to the whole ship.
- **Top buttons**: ⏸ pause · 🐢 slow-mo (×1 / ×0.5 / ×0.25) · ↺ reset ship · 🫧 shield on/off · ↩ ship fires back · ×N attackers per tap (1/3/5/10)
- **Lists**: 🧩 parts (HP bars, status, 🔧 repair) · 📜 log (what hit what, for how much) · 🔢 damage matrix (attack vs armor)
- **Identify parts** (v2): with a mouse, hover any part to light it up (outline and glow, rest of the ship dims) with a live card: icon, name, what it does, HP, armor, status (OK / damaged / broken / offline / shielded) and active effects (e.g. "engines at 25%: reactor down"). Hovering a 🧩 list row lights up that part on the ship, and hovering the ship lights up its row. On touch, **long-press** a part for the same card (✕ or tap elsewhere to close); a normal tap still targets. 🏷 toggles small name tags on every part (off by default).
- **Camera**: drag to rotate, pinch or scroll to zoom, two fingers (or right-drag) to pan.

## Parts and what breaking them does
| Part | Armor | When it breaks |
|---|---|---|
| 🔺🟫🔻 Bow / Mid / Stern hull | 🧱 plate | lose all three = 💀 ship lost |
| 🧭 Bridge | 🛡️ heavy | aim ×2.5 worse, cannons fire slower |
| 📡 Sensors | 📡 light | aim ×2 worse, range −40% |
| ☢️ Reactor | 🛡️ heavy | ⚡ power lost: guns, launcher, laser, shield, hangar go offline; engines drop to 25% |
| 🫧 Shield gen | ⚡ energy | bubble gone for good (until repaired) |
| 🔥 Engine L / R | ⚙️ mech | speed halves, then stops |
| 💥 Cannon 1 / 2, 🚀 Launcher, 🔦 Laser | ⚙️ / ⚡ | that weapon stops firing back |
| 🛬 Hangar | ⚙️ mech | no more escort fighters |

The shield bubble soaks hits first (each attack has its own level vs shields; 🌀 EMP is best). It refills after 3 s without hits while the generator has power.
Hits on a part that is already broken fall through to the hull under it at half damage. Rockets, torpedoes, artillery, bombs and EMP splash nearby parts.

## Damage rule
Same rule as Front Line (`games/tank-2v2`) and Space Defense (`games/space-defense`): every attack has a level 0–5 per armor type, and the level maps to a multiplier
`[0, 0.06, 0.4, 0.75, 1.0, 1.4]`. All numbers live in `js/config.js`.

## Files
- `index.html`, `css/style.css`: layout and HUD
- `js/main.js`: scene, ship parts, attackers, damage, cascades, HUD, and the `window.__ss` test hooks
- `js/config.js`: parts, attacks, matrix, tuning
- `js/particles.js`: copied from Front Line (ground bounce removed)
- `js/icons.js`: SVG button icons
- `vendor/`: three.js r-module and OrbitControls, vendored so it works offline
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: PWA. The cache is `ship-sandbox-v2` (scripts load with `?v=2`), cleanup only deletes `ship-sandbox-*` caches, and fetches are network-first with `cache: 'no-cache'`. An update toast shows when a new version is ready.
