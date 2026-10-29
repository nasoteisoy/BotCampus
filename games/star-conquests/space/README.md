# STAR CONQUESTS — Space Battle module

Self-contained space battle under `games/star-conquests/space/`.
Implements **CONTRACT.md v1** exactly.

## Export

```js
import { startBattle } from './space/battle.js';

startBattle({
  type: 'space',
  planet: { id, name, icon, biome, size },
  mount: HTMLElement,
  attacker: { side: 'player'|'enemy', color: '#hex', units: [Unit, ...] },
  defender: { side: 'player'|'enemy', color: '#hex', units: [Unit, ...] },
  seed: 12345,
}, onDone);
```

`onDone({ winner: 'attacker'|'defender', survivors: { attacker, defender }, pointsEarned })` fires **once**, after DOM/WebGL cleanup.

## Unit shape (from shell)

```js
{ id, type: 'spaceship'|'battleship'|…, name, icon,
  stats: { hp, attack, range, speed, armor }, hpNow }
```

- Only `spaceship` and `battleship` spawn. Other types are ignored in combat and returned unchanged in `survivors`.
- Shell stats drive combat. Roster extras add shield / hangar / turrets by ship name.

## Fixed roster (no editor)

| Name | Type | HP | Atk | Range | Speed | Armor | Shield | Hangar |
|------|------|----|-----|-------|-------|-------|--------|--------|
| Scout | spaceship | 120 | 12 | 28 | 9 | 5 | 30 | — |
| Fighter | spaceship | 180 | 18 | 32 | 7 | 10 | 50 | — |
| Interceptor | spaceship | 100 | 14 | 26 | 12 | 0 | 20 | — |
| Corvette | battleship | 500 | 40 | 70 | 4 | 15 | 200 | 2 @ 0.25/s |
| Cruiser | battleship | 900 | 70 | 90 | 3 | 25 | 400 | 4 @ 0.33/s |

## Controls (mouse + touch)

- **Tap own ship** → select (yellow ring)
- **Tap empty space** → move order
- **Tap enemy** → attack order
- **🤖 Auto** → fleets fight on their own (on by default)
- **⏩ Speed** → x1 / x2 / x4
- **🏳️ Retreat** → defender wins; attacker survivors kept; 0 points

## Points

`10 + 5 × enemy shell units destroyed` for the player side on a win (0 on loss or retreat).

## Test

Open `space/test.html` (serve the `games/` folder). Sample armies fight over Kepler; result JSON prints at the bottom.

## Files

- `battle.js` — `startBattle`
- `roster.js` — fixed roster
- `ships3d.js` — meshes + shield flash
- `style.css` — HUD (48px taps)
- `vendor/three.module.min.js` — three.js (local copy; Dev A may later move to `star-conquests/vendor/`)
- `test.html` — standalone harness


## Banners (match Dev B ground)

Class names (shared with `ground/view.js`):
- `.sc-banner` + `[data-sc-banner]` — full-screen overlay (`hidden` attr to hide)
- `.sc-ban-card` — centred card
- `.sc-ban-big` — main line
- `.sc-ban-pts` — points line
- `.sc-ban-sub` — "Tap to skip"

Start: `⚔️ Battle over <planet name>`  
End (player view — attacker.side / defender.side === `'player'`): `🏆 Victory` or `💀 Defeat` plus `⭐ <pointsEarned>`  
End banner shows **before** `onDone`; `onDone` fires once after cleanup. Retreat counts as Defeat for the player with 0 points.
