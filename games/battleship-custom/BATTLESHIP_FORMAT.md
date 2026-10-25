# BattleShip format (v1)

BattleShips are big capital ships for space battles. They are not the small troop-carrying
SpaceShips. The BattleShip Editor (`games/battleship-custom/`) writes them into the shared army save.

## 1. Where it lives

- localStorage key **`botcampus:army`** (army schema v1, `games/shared/army/schema.js`)
- new top-level field **`battleships`**: an array that holds every nation's ships, tagged by `playerId`
  (the same way `units[]` are)

```json
{
  "kind": "…", "version": 1, "activePlayerId": "p-…", "players": [ … ], "units": [ … ], "…": "…",
  "battleships": [
    {
      "id": "b-mh2k1x9abc",
      "name": "BattleShip 1",
      "playerId": "p-…",
      "v": 1,
      "parts": { "hull": "corvette", "armor": "light", "shield": "none", "guns": "laser", "hangar": "none", "engine": "ion" },
      "updatedAt": "2026-10-25T18:00:00.000Z"
    }
  ],
  "updatedAt": "…", "updatedBy": "battleship-custom"
}
```

| field | type | notes |
|---|---|---|
| `id` | string | `b-` + random, max 40 chars, unique |
| `name` | string | max 20 chars, no control chars or `<>`; the editor auto-names ships `BattleShip N` |
| `playerId` | string | owner = `players[].id` |
| `v` | 1 | ship format version |
| `parts` | object | one id per slot (table below); an unknown or missing id falls back to the slot's first (base) part |
| `updatedAt` | ISO string | last edit |
| anything else | – | **kept** as-is, so other games may add fields |

Limits: 20 ships per player. Nothing is locked, and every part is free to pick.

### Loader note
The shared `Army.sanitize()` / `Army.load()` **keeps unknown top-level fields**, so `battleships[]` survives
other games' saves that go through sanitize. It **drops** unknown fields inside `players[]` and `units[]` (only `ext` is kept),
so ships are stored at the top level, not inside players. Some writers still save their whole sanitized
army without re-reading it first. That keeps the field, but a write made from an older copy can undo a
newer ship edit from another tab.

### Writing rules (what the editor does)
- **Merge-on-write**: re-read the stored JSON right before writing, then replace only the ship entries
  this page changed (by `id`). Ships deleted here are removed, new ones are appended, and every other ship is kept verbatim.
  `updatedAt` / `updatedBy` are stamped. Every other field stays byte-identical.
- Dirty flag plus a ~350 ms debounced autosave. ✅ Done, page hide and tab hide flush right away.
- Listens for the `storage` event, so a change from another tab or game is picked up (pending edits are kept on top).
- Editor-only UI state uses its own keys: `battleship-custom:ui` (selected ship per player) and `battleship-custom:hint` (first-run tip seen).

## 2. Parts table (frozen, `PARTS` in `js/battleship-stats.js`)

The first option in each slot is the cheap base.

**hull** (size): hp, mass, hard = turret hardpoints, bay = hangar multiplier, shieldMul, cost

| id | name | hp | mass | hard | bay | shieldMul | cost |
|---|---|---|---|---|---|---|---|
| corvette | Corvette | 400 | 1.0 | 2 | 1 | 1.0 | 100 |
| frigate | Frigate | 700 | 1.6 | 3 | 1 | 1.3 | 180 |
| cruiser | Cruiser | 1200 | 2.6 | 4 | 2 | 1.7 | 320 |
| dreadnought | Dreadnought | 2000 | 4.0 | 6 | 3 | 2.2 | 560 |

**armor**: armor = % damage cut, hpMul, mass, cost

| id | name | armor | hpMul | mass | cost |
|---|---|---|---|---|---|
| light | Light | 10 | 1.0 | 0 | 0 |
| plated | Plated | 25 | 1.1 | 0.3 | 60 |
| reactive | Reactive | 30 | 1.1 | 0.4 | 120 |
| heavy | Heavy | 40 | 1.25 | 0.8 | 140 |

**shield**: shield points and regen/s (both × hull shieldMul), mass, cost

| id | name | shield | regen | mass | cost |
|---|---|---|---|---|---|
| none | None | 0 | 0 | 0 | 0 |
| basic | Basic | 200 | 10 | 0.1 | 60 |
| deflector | Deflector | 400 | 20 | 0.2 | 140 |
| aegis | Aegis | 700 | 35 | 0.3 | 260 |

**guns** (turrets & cannons): per turret, with turret count = hull `hard`

| id | name | dmg/shot | shots/s | range | splash | cost/turret |
|---|---|---|---|---|---|---|
| laser | Laser | 12 | 2 | 300 | 0 | 20 |
| pulse | Pulse | 30 | 1 | 260 | 0 | 35 |
| missile | Missiles | 60 | 0.5 | 420 | 30 | 45 |
| rail | Railgun | 120 | 0.25 | 500 | 0 | 60 |
| lance | Lance | 50 | 1 | 350 | 0 | 80 |

**hangar**: launches small SpaceShips and troopers (slots/troops × hull `bay`)

| id | name | slots | troops | launches/s | mass | cost |
|---|---|---|---|---|---|---|
| none | None | 0 | 0 | 0 | 0 | 0 |
| bay | Bay | 2 | 0 | 0.2 | 0.2 | 80 |
| pods | Drop pods | 0 | 12 | 0.5 | 0.2 | 120 |
| carrier | Carrier | 4 | 6 | 0.33 | 0.5 | 200 |

**engine**: thrust, turnK (turn multiplier), boost (sprint multiplier), cost

| id | name | thrust | turnK | boost | cost |
|---|---|---|---|---|---|
| ion | Ion | 100 | 1 | 1 | 0 |
| fusion | Fusion | 170 | 1 | 1 | 90 |
| gravitic | Gravitic | 120 | 2 | 1 | 110 |
| warp | Warp | 140 | 1 | 2.5 | 120 |

## 3. Stats API (`js/battleship-stats.js`, a pure ES module with no DOM, usable in Node)

```js
import { battleshipStats, PARTS, SLOTS, BASE_PARTS, part, cleanParts, FORMAT_VERSION } from '../battleship-custom/js/battleship-stats.js?v=1';
const s = battleshipStats(ship);   // ship = { parts } or a bare parts map; returns a frozen object
```

| stat | formula |
|---|---|
| `mass` | hull + armor + shield + hangar mass |
| `hp` | round(hull.hp × armor.hpMul) |
| `armor` | armor % cut from each hit |
| `shield` / `shieldRegen` | shield.shield × hull.shieldMul / shield.regen × hull.shieldMul (per s) |
| `speed` | engine.thrust / mass (m/s); `boost` = engine.boost |
| `turn` | round(60 × engine.turnK / mass) deg/s |
| `turrets` | hull.hard |
| `dps` | turrets × gun.dmg × gun.rof; plus `gunDmg`, `gunRof`, `range`, `splash`, `weapon` (gun id) |
| `hangarSlots` / `troopers` | hangar.slots × hull.bay / hangar.troops × hull.bay; `launchRate` = hangar.rate |
| `cost` | hull + armor + shield + turrets × gun.cost + hangar + engine |
| `power` | round(√(EHP × max(1,dps)) + hangarSlots×15 + troopers×3), with EHP = (hp + shield)/(1 − armor/100) |

The base ship (all first options) has hp 400, armor 10, shield 0, dps 48, speed 100, turn 60, cost 140.

UI helpers: `STAT_ROWS` (icon + word label + good direction), `rowValue(stats, key)` (hangar = slots + troopers/3),
`STAT_MAX` (max over all 5,120 part combos), `PIPS` = 10, `pips(key, v)` → 0..10 bar segments.

Fleet helpers (`js/fleet.js`): `FIELD`, `LIMITS`, `cleanShip`, `fleetOf`, `nextShipName`, `newShip`, `shipsIn(army)`,
`mergeFleet(rawJson, baseArmy, changedMap, deletedSet)` (returns the JSON string to store).

## 4. Opening the editor

- `games/battleship-custom/` is the ship list (step 1).
- `?section=battleship` or `?section=fleet` also opens the ship list (this is the Army HQ default).
- `?section=hull|armor|shield|guns|hangar|engine` opens that part tab straight away (step 2).

## SpaceShips in the hangar (SpaceShip Editor link)

`js/spacecraft.js` → `spaceshipsFor(rawArmy, playerId, colors)` resolves to `null` or `{ source: 'saved' | 'default', ships, make(i) }`.
It imports `../../spaceship-custom/js/ship3d.js?v=1` (`buildShip`, `ShipLook`) and `ship-stats.js?v=1` (`cleanShip`, `spaceshipStats`, `BASE_PARTS`)
only when that editor is known to be there: the save already has `army.spaceships[]` for the player, or `games/items.json` lists `spaceship-custom`.
That way a missing folder never causes a 404 in the console. The demo launches `make(i)` models (nose +Z, scaled to about 1.1 units long),
and each one's `spaceSpeed` sets its flight time. `army.spaceships[]` is only read, never written.
- Inside an iframe, the header keeps a free slot right of ⬅️ Back for the HQ 🏠 button
  (suggested HQ route: `home: { pos: 'tl', after: '#back', x: 8 }`).
- The editor never navigates the top window and never opens new windows.
