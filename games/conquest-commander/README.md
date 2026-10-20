# ⚔️ Conquest Commander (v2)

A Battlefront-style Conquest battle where **you are the commander**. Your troopers from the 🪖 Trooper Customizer fight on their own. You decide which command posts matter.

Play: `games/conquest-commander/` (next to `games/trooper-custom/`)

## How to play
1. Pick your nation, up to 6 trooper looks, an enemy nation and the enemy brain (😊 Easy / 😠 Normal). Tap 🛒 ▶️.
2. 🛒 **Perk shop**: tap cards to buy perks with campaign 💰 credits (tap again to refund), then ⚔️ Fight. Perks last one battle.
3. Tap a post (A B C) and choose:
   - ⚔️ attack / 🛡️ defend / 🚫 ignore
   - ★ / ★★ / ★★★ for how much it matters
4. Bots go where the stars point (with no orders: nearest post first). They capture by standing in the ring and shoot enemies they can see.
5. 🚩 rally point: new troops walk there first.
6. Win: the enemy hits 🎟️ 0, or you hold **every** post for 20 s (big countdown), or the enemy has no posts and no troops left.

## Rules (Battlefront II 2005 Conquest; defaults in `CFG`, `js/sim.js`)
- 200 🎟️ per side, 20 live units per side (squads of 4). Each death costs 1 ticket.
- Class mix per team (min/max): 🪖 trooper 9–25; 🚀 heavy, 🔧 engineer, 🎯 sniper, ⭐ commander, 🛩️ jet 1–4 each. Minimums first, then random up to 20. A class missing from your roster gives its slots to troopers. ⭐ and 🛩️ join only after your side has held 2 posts (or with the ⭐ Elite perk).
- Class from gear (Customizer v4 kit): rocket → heavy · sniper → sniper · jetpack or EMP → jet · rally or chaingun → commander · fusion or shotgun → engineer · else trooper. Each keeps its own weapon numbers. (Class abilities beyond weapons are not in yet.)
- Capture: red → ⚪ neutral → blue. An enemy post must be neutralized first, and the enemy can still spawn there until it is. 10 s per step with 1 unit, up to 3x faster with more. Both sides in the ring = stalled.
- Spawn only at your own posts. Majority of posts → the enemy bleeds every 5 s by (your post value − theirs); B is worth 2, A and C 1.
- ☠️ Last stand: when a side's tickets ≤ its units on the field, it stops bleeding and stops getting reinforcements.
- ⭐ CP: start 1,500, +140 every 5 s plus +40 per post. Waves every 10 s; each unit costs its Customizer 💰 cost. 20 min time limit.

## Campaign
- Saved in `localStorage['conquest-commander:campaign']` `{v:1, credits, battle, wins, losses, streak, mapIndex}`. Starts at 💰 1500. 🆕 New campaign (tap twice) resets it.
- Win: 1000 + 50 per post held + 2 per ticket left. Loss: 400 + 50 per post held. The end screen shows the breakdown.
- Perks: 🎟️ Reinforcements +50 (400) · 🛡️ Combat Armor +25% HP (500) · 💥 Weapon Boost +20% dmg (500) · 🚩 Fast Capture +50% (300) · ⏩ Quick Deploy, waves 40% sooner (300) · 👥 Bigger Army, 24 live (700) · ⭐ Elite Classes (400) · 🏰 Garrison: start owning B with 4 guards (600) · 🧨 Sabotage: enemy −25 🎟️ (450) · 💰 War Chest +1000 CP (350).
- The enemy buys 1 perk, +1 per win in your streak, −1 per loss (min 0, max 6). Both sides' perks show as icons at battle start (and in ⏸️).
- Maps: `MAPS` in `js/campaign.js` (Dust Ridge only for now).
- Quick battles started from test hooks don't touch the campaign. Leaving a campaign battle via 🏠 forfeits it (perks are spent, nothing is recorded).

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
- `js/perks.js`: the 10 perks + their effect numbers
- `js/campaign.js`: campaign save, rewards, enemy perk scaling, map list
- `js/trooper.js`, `js/cost.js`: **copied unchanged** from `trooper-custom/js` (Customizer v4 snapshot, Oct 18 2026 19:3x). Re-copy them if the Customizer changes its kit.
- three.js r169 from jsDelivr (import map). No build step.
- Don't publish: `test/`, `screenshots/`.

## Tests
```
node --import ./test/three-hook.mjs test/sim.mjs                              # rules, perks, campaign
PLAYWRIGHT_BROWSERS_PATH=/workspace/pw-runner/browsers node test/run.mjs      # browser: desktop, campaign + shop, v2 save, no save, iPhone 13 landscape + portrait
```
