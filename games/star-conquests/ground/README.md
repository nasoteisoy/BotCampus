# ⚔️ Star Conquests — Ground Battle (Dev B)

Self-contained ground battle module. Matches `../CONTRACT.md`.

## Export

```js
import { startBattle } from './battle.js';

startBattle({
  type: 'ground',
  planet: { id, name, icon, biome: 'desert'|'ice'|'jungle'|'lava'|'rock'|'ocean', size: 1|2|3 },
  mount: HTMLElement,   // draw only here
  attacker: { side: 'player'|'enemy', color: '#hex', units: [Unit, ...] },
  defender: { side: 'player'|'enemy', color: '#hex', units: [Unit, ...] },
  seed: 12345
}, onDone);

// also returns a Promise resolving to the same result
```

`onDone` fires **exactly once** after DOM/RAF cleanup. Mount is emptied.

## Unit

```js
{ id, type: 'rifle'|'heavy'|'recon'|'tank'|'spaceship'|'battleship',
  name, icon,
  stats: { hp, attack, range, speed, armor },
  hpNow }
```

Ground types spawn; `spaceship` / `battleship` are ignored in the fight and returned unchanged in `survivors`.

Missing `stats` / `hpNow` / `icon` get defaults from `DEFAULT_STATS` in `sim.js`.

## Result

```js
{ winner: 'attacker'|'defender',
  survivors: { attacker: [Unit...], defender: [Unit...] },
  pointsEarned }   // player side only; 10 + 5× enemy ground kills; 0 on loss / retreat
```

## Controls

| Action | How |
|---|---|
| Select | Tap friendly unit |
| Move | Tap ground |
| Target | Tap enemy (with a unit selected) |
| ⏩ Speed | Cycles 1× → 2× → 3× |
| 🏳️ Retreat | Defender wins; attacker survivors kept |

## Crawl vs taken-out

| State | Look |
|---|---|
| 🩹 **Crawl** (HP ≤ 35%) | Prone flat oval, blinking bandage / red +, orange HP bar, label “Crawl”, still selectable, moves & shoots slowly |
| 💀 **Out** (HP ≤ 0) | Grey wreck rotated, 💀 + “❌ Out”, **no HP bar**, not selectable, fades |

## Files

- `battle.js` — `startBattle` (contract entry)
- `sim.js` — seeded sim, AI, crawl/out
- `view.js` — canvas render + tap HUD
- `test.html` — standalone matchups

## Test

Serve `games/` and open `star-conquests/ground/test.html`.


## Feel (v2)
- Chunky top-down soldiers (helmet + gun; rifle/heavy/recon distinct) and tanks (hull, treads, rotating turret).
- Biome props + **cover** (−40% damage, 🛡️ badge). AI seeks cover.
- Juice: muzzle flash, tracers, sparks, damage numbers, scorch, screen shake.
- Drop ship with altitude shadow + landing dust rings.
- Start banner `⚔️ Battle for <planet>` → drop → fight → end `🏆 Victory` / `💀 Defeat` + points, then cleanup, then `onDone` once.

- Portrait phones use an **11×18** map (armies top vs bottom); landscape/PC use **18×12**. Field fills ≥70% viewport height on phone.
- One type icon + optional one 🛡️ on the HP bar row (no floating icon stacks).
