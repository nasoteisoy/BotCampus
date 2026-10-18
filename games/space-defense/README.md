# Space Defense: Front Line (two-layer tower defense)

A space + planet tower defense built on the Front Line control scheme (`games/tank-2v2`), with the look of Space Battles (`games/space-battles`). Sibling to the ground version at `games/front-line-defense/`.

Plain HTML/CSS/ES-module JS on a 2D canvas. No build step, no CDN, no assets. Everything is drawn in code.

## Play
- Defend the **🛰️ Station** (space) and the **🏰 HQ** (planet). If either one hits 0 HP, you lose.
- Survive **12 waves**. Wave 12 is the **👾 Mothership** boss. It launches raiders and landers.
- **Two layers.** Tap the big round 🪐/🚀 button (or press Space) to switch views. A red **!** badge pulses when the other layer is under attack.
- **Space:** 3 lanes. Tap a ⬡ slot to build **Laser** (vs small craft), **Missile** (vs capital ships), **Flak** (area, vs swarms/landers) or **Shield** (allies nearby take less damage and heal). Buy ships from the tray: Fighter, Interceptor, Bomber, Frigate, Carrier (launches drones), Dropship.
- **Planet:** 2 lanes. Enemy **landers** that reach the planet's atmosphere (dashed orange ring in space) drop ground troops at the red landing zones. Build **Bunker** (MG), **Cannon** (AT), **Mortar** (area), **Ion Cannon** (shoots landers in orbit from the ground), **Barracks** (unlocks Rifle and Bazooka) and **Factory** (unlocks Light/Medium tank and Howitzer).
- **Cross-layer:**
  - **☄️ Orbital strike:** Frigates and Bombers can strike the planet. Select the ship, tap ☄️, then tap the target.
  - **📦 Ferry:** a Dropship carries up to 4 ground units anywhere on the planet. Select it, tap 📦, tap your troops, then tap the destination.
- **Credits:** kill bounties, a wave-clear bonus, and a small trickle during waves. Starting the next wave early pays a bonus.
- **Upgrades:** tap a turret to upgrade it to ★★/★★★ or sell it. The 🔧 tab has ship/troop weapon and armor tech (3 levels each).
- **Attack matrix:** bodies are 🛩️ small craft, 🚢 capital, 📦 lander, 🪖 infantry, 🛞 armor and 🏠 structure. Each attacker has a level 0-5 per body, with the same damage table as Front Line. Open the **🔍 Unit Examiner** to see who beats whom.
- Difficulty is 🙂 Easy or 😠 Normal. Speed goes 1x/2x/3x.

## Controls (Front Line style)
| Touch | Mouse / keys | Action |
|---|---|---|
| tap unit | left-click | select (double-tap: all of that type) |
| hold + drag (or drag at 1x zoom) | left-drag | box select |
| tap ground / enemy | left- or right-click | move / attack |
| ⚔️ toggle | A | attack-move |
| ✋ / lane 1-3 buttons | H, 1-3 | hold here / hold a lane |
| ↩ | R | retreat to base (units repair there) |
| pinch / two-finger drag | wheel / right- or middle-drag | zoom / pan |
| 🪐/🚀 button | Space | switch layer |
| | B / F / N / Esc | strike / ferry / next wave / cancel |

## Files
- `index.html`: HUD, start/end/rules/examiner overlays
- `css/style.css`: phone-first layout (portrait: bottom tray; landscape: right tray)
- `js/config.js`: all data (bodies, LVL_MULT, turrets, units, enemies, waves, tech)
- `js/icons.js`: inline SVG icons (ground silhouettes adapted from tank-2v2)
- `js/main.js`: simulation, AI, rendering, input, Unit Examiner, debug hooks

## Debug / testing
`?debug=1` exposes `window.SD`:
- `SD.fast(seconds)`: synchronous fast-forward
- `SD.auto(true)`: autoplayer
- `SD.state()`, `SD.toS(u, v)`: world to screen
- `SD.nextWave()`, `SD.god()`, `SD.credits(n)`

Other URL options: `&speed=N` multiplies real time, `&seed=N` makes runs deterministic, `&diff=easy`, `&autostart`.

Run locally from the repo root with `python3 -m http.server`, then open `/games/space-defense/`.
