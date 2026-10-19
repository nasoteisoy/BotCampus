# ⚔️ Conquest Commander (v1)

A Battlefront-style Conquest battle where **you are the commander**. Your troopers from the 🪖 Trooper Customizer fight on their own. You decide which command posts matter.

Play: `games/conquest-commander/` (next to `games/trooper-custom/`)

## How to play
1. Pick your nation, up to 6 trooper looks, an enemy nation and the enemy brain (😊 Easy / 😠 Normal).
2. Tap a post (A B C) and choose:
   - ⚔️ attack / 🛡️ defend / 🚫 ignore
   - ★ / ★★ / ★★★ for how much it matters
3. Bots go where the stars point. They capture by standing in the ring and shoot enemies they can see.
4. 🚩 rally point: new troops walk there first.
5. 🎟️ tickets: every death costs 1. Holding 2 of the 3 posts drains 1 enemy ticket every 5 s.
6. You **win** when the enemy reaches 🎟️ 0, or when you hold every post and the enemy has nobody alive. There is also a 15 min time limit.

## Rules (defaults in `CFG`, `js/sim.js`)
- 12 vs 12 bots, in squads of 4
- 150 tickets per side
- Capture: 10 s, faster with more units than the enemy (up to 3x). A tie freezes the ring. Taking an enemy post means 10 s to neutral, then 10 s to own it.
- ⭐ CP: start with 1,500. Every 5 s you get +70, plus +20 for each post you hold.
- Auto waves every 10 s at an owned post that isn't under attack. Each unit costs its customizer 💰 cost in CP.
- Class from gear (v1, Customizer v4 kit):
  - rocket launcher → 🚀 Heavy (splash damage)
  - everything else → 🔫 Trooper, but each keeps its own weapon numbers (blaster, sniper = long range, shotgun = close, chaingun = fast, EMP = small splash)
- HP and speed come from the Customizer's `unitStats`. ⚡ power adds a little accuracy, and an award weapon adds +10% damage.
- The enemy commander uses the same marks (Easy rethinks every 25 s and aims worse; Normal every 6 s).

## Controls
| | PC | Phone |
|---|---|---|
| move camera | drag / WASD / arrows | 1-finger drag |
| zoom | wheel | pinch |
| turn | Q E / right-drag | twist |
| post menu | click post or badge, Tab = next | tap |
| marks / stars | 1 2 3 · + − | radial buttons |
| rally | R then click | 🚩 then tap |
| center | Space / 🎯 | 🎯 |
| pause / help | Esc / H | ⏸️ / ❓ |

## Customizer import
- Reads `localStorage['trooper-custom:db']`. Same origin on GitHub Pages, so it is shared with the Customizer.
  - **Customizer v4 save** `{v:3, player, nations[{…colors, roster[6]{name, icon, t}}], looks, tank, …}`: each nation's 6-slot roster plus its saved trooper looks (`u` = v4 digits)
  - **older save** `{v:2, …, cur, looks}`: trooper looks are mapped into the v4 kit with the Customizer's own `undigitsV2Trooper`
- Tank looks are skipped until v2.
- If nothing is saved, two built-in default armies are used.
- Read-only: this game never writes to that key.

## Files
- `index.html`, `css/style.css`
- `js/main.js`: UI, input, HUD, loop, `window.__game` test hooks
- `js/sim.js`: rules, AI, combat; pure, fixed-step, fast-forward with `simulate(sec)`
- `js/render.js`: three.js view, instanced armies
- `js/map.js`: the Dust Ridge map
- `js/nav.js`: grid A* pathfinding
- `js/data.js`: import, class, stats
- `js/trooper.js`, `js/cost.js`: **copied unchanged** from `trooper-custom/js` (Customizer v4 snapshot, Oct 18 2026 19:3x). Re-copy them if the Customizer changes its kit.
- three.js r169 from jsDelivr (import map). No build step.
- Don't publish: `test/`, `screenshots/`.

## Tests
```
node --import ./test/three-hook.mjs test/sim.mjs                              # rules (22 checks)
PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-runner/browsers node test/run.mjs      # browser (86 checks: desktop, v2 save, no save, iPhone 13 landscape + portrait)
```
