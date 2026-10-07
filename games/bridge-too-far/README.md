# Bridge Too Far

A small real-time WW2 squad tactics game for phones. British airborne hold a river town against a German garrison, autumn 1944, with one bridge in the middle. It's inspired by classic squad-level wargames. All names, art, map, and text are original.

**Play:** https://nasoteisoy.github.io/BotCampus/games/bridge-too-far/
**Install:** open the link, then Share ▸ *Add to Home Screen* (iOS) or menu ▸ *Install app* (Android/Chrome). It works offline after the first load.

## How to play
- Tap a unit (or its chip in the roster) to select it. Tap the ground to move.
- Order bar: ➜ Move · ⏩ Fast · 🐾 Sneak · 🎯 Fire · 🛡️ Hold · 💨 Smoke.
  - Tap an order, then tap the ground. **Fire + ground** = area fire. Tapping a visible enemy with a unit selected = fire at it.
  - Hold = ambush. The unit stays put, is harder to spot, and opens fire when enemies come close.
- 👥 selects all units. ⏸ pauses (you can still give orders), and 1x/2x sets the speed.
- Drag to pan, pinch to zoom (mouse wheel on desktop).
- **Win:** hold more of the 3 flags (West, Bridge, East) when the 9:00 clock runs out, or break or destroy the whole enemy force.

## Units
| Airborne (you) | German (AI) |
|---|---|
| Officer (morale aura) | Officer |
| 3 × Rifle section | 3 × Rifle squad |
| Bren LMG team | MG team |
| PIAT anti-tank team | Mortar |
| Sniper | Half-track (light armor, MG) |
| 2" Mortar (HE + smoke) | Assault gun (heavy armor, HE gun) |

Each unit has HP (casualties also reduce firepower), morale, ammo, and experience (★–★★★).

## Rules in short
- **Morale ring:** green Steady → yellow Shaken (worse aim) → orange Pinned (can't move) → red Panic (runs for cover, ignores orders) → grey Broken (routs off the map). Incoming fire suppresses, and casualties shock nearby friends. Morale recovers out of fire, about twice as fast near an officer.
- **Accuracy** depends on range, the target's cover (house > hedge/wall/trees > open), whether either side is moving, morale, and experience.
- **Line of sight:** houses block it, thick tree clumps block it, and so does smoke. Enemies show only while spotted. A faded "?" marks their last known spot. Firing gives a unit's position away, while sneaking, holding, and cover hide it.
- **Armor:** rifles and MGs barely hurt the half-track and can't hurt the assault gun. The PIAT (range about 150) and mortar hits work.
- **AI:** advances on the nearest flag it doesn't hold, moving cover to cover and sneaking near the enemy. MG and sniper teams take overwatch spots, the mortar stays in range, and vehicles trail the infantry and back off from close infantry. It lays smoke for bridge crossings, guards its home flag, and wounded or broken units fall back.

## Files
`index.html` (UI + PWA tags) · `game.js` (all game code, vanilla JS + canvas) · `manifest.webmanifest` · `sw.js` (offline cache, bump `CACHE` when files change) · `icon-192.png`, `icon-512.png` (generated with Python/PIL).

## Dev
No build step. Serve the folder (`python3 -m http.server`) and open `/games/bridge-too-far/`.
Debug hooks: `?auto=1` lets the AI play both sides. `window.BTF.fast(seconds)` fast-forwards the simulation.
