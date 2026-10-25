# 🛸 SpaceShip editor (Army HQ)

A **SpaceShip** is an air ship a unit can ride into battle the same way it rides armor, and it can also fly in **space battles**.
Every ship has `modes: ["ground","space"]`.

This page builds SpaceShips for the active player/nation from the shared Army save. It works on phones (portrait and landscape, touch) and PCs.

- **Steps:** ① Pick ship › ② Change parts › ③ Done (same wording as the BattleShip editor).
- **Fixed buttons:** "⬅️ Back" (icon + word) sits top-left. The one yellow **✅ Done** sits bottom-right. "✓ Saved" flashes top-right after every save.
- **Header:** always shows "🛸 Editing: *name*" with a breadcrumb: Nation › SpaceShips › *name* › *part* (the last crumb is the part tab you are on).
- **Slots:** hull, wings, engines, guns, shield, seats. Nothing is locked, and new ships start as the cheap base "SpaceShip N".
- **Stats:** each stat has an icon, a word and a 10-segment bar (❤️ Hull, 🛡️ Shield, ⚡ Speed, 💥 Firepower, 🎯 Range, 🪑 Seats, 💰 Cost). Part cards show green ▲ / red ▼ changes. While you try a part, the bar segments light up green (gain) or red (loss), and a ▲/▼ badge sits in its own slot at the end of the bar, never over the stat's name. Tap a stat to see what it means.
- **Preview:** a low-poly three.js model you can rotate with a drag (touch or mouse). It has 🎬 Demo, 🔄 Spin and 🌌 Space / 🌍 Ground backdrop buttons. The camera frames the ship from its size and the screen shape, so the ship fills the preview on phones and PCs.
- **🎬 Demo:**
  1. The ship flies in.
  2. Your roster troopers (names from the save, up to the seat count) walk in and board.
  3. It lifts off and fires at a drone.
  4. It takes hits. The **shield absorbs damage first, then the hull**.
  5. It flies off into space.

  The camera follows the ship. The status (❤️ hull, 🛡️ shield, 🪑 seats) is a slim strip along the bottom edge of the preview, never over the ship.

## Files

| File | What |
|---|---|
| `index.html`, `css/style.css` | page and layout |
| `js/main.js` | UI, save/merge, scene |
| `js/ship-stats.js` | pure stats module (no DOM) |
| `js/ship3d.js` | low-poly ship builder |
| `js/demo.js` | demo scene |
| `vendor/` | three.js r-module + OrbitControls (copied from trooper-custom) |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | PWA. The cache is `spaceship-custom-v1`, and cleanup only deletes `spaceship-custom-*` caches. |

## Save: `botcampus:army` v1 → new top-level field `spaceships[]`

```js
army.spaceships = [{
  id: "sp-…",              // string, unique
  name: "SpaceShip 1",     // ≤16 chars
  playerId: "p-…",         // owner (army.players[].id); the editor shows the active player's ships
  parts: { hull: "scout|arrow|brick|titan", wings: "stubs|delta|swept|broad",
           engines: "ion|twin|plasma|warp", guns: "pulse|twin|missile|rail",
           shield: "none|light|medium|heavy", seats: "2|4|6|8" },
  stats: { v:1, hp, shield, shieldRegen, speed, spaceSpeed, dmg, rof, splash, laser, weapon,
           range, dps, firepower, seats, cost, modes:["ground","space"] },   // derived, always = spaceshipStats(parts)
  createdAt: "ISO", updatedAt: "ISO"
  // unknown keys on a ship are kept
}]
```

- The shared loader (`shared/army/schema.js` `sanitize/load/save`) **keeps unknown top-level keys**, so `spaceships` survives every other game's `Army.save`. This is tested.
- Unknown fields on players and units would be dropped (except `ext`), which is why ships live at the top level.
- Up to 20 ships per player. The base ship gives `{hp:150, shield:0, speed:4, spaceSpeed:10, range:30, firepower:20, seats:2, cost:300}`.

### `army.spaceships` vs `army.ships`: two different fields

| | `army.ships` | `army.spaceships` |
|---|---|---|
| **What it holds** | Capital ships for the **Ship Sandbox** game. The shared schema reserves it (`emptyArmy` has `ships: []`, and its shape is still TBD). | This editor's **rideable SpaceShips**: transports troopers board, for ground and space battles (shape above). |
| **Who writes it** | Ship Sandbox (later). This page never writes it. | Only this page (`spaceship-custom`), with merge-on-write (see below). |
| **Who reads it** | Ship Sandbox. `sanitize` keeps it as it is. | Any game that wants a player's SpaceShips. Read it through `js/ship-stats.js` (`cleanShip`, `spaceshipStats`), not the raw `stats` object. |
| **In the schema** | A named field in `shared/army/schema.js`. | Not named in the schema. It survives because the loader keeps unknown top-level keys (tested). |

Don't merge the two fields. A SpaceShip is a small transport, while a Sandbox ship is a big warship with its own rules. `ship-stats.js` is the reader API for `army.spaceships`: it fixes bad or missing parts and always returns the same numbers this editor shows.

### Use the stats in a game

```js
import { spaceshipStats, cleanShip } from '../spaceship-custom/js/ship-stats.js?v=1';
const ships = (army.spaceships || []).filter((s) => s.playerId === army.activePlayerId).map((s) => cleanShip(s));
const st = spaceshipStats(ships[0]);   // accepts a ship or a parts object
// ground battle: st.speed; space battle: st.spaceSpeed; damage → st.shield first, then st.hp
```

## Write safety

- **Opening never writes.** A player with no ships sees a draft "SpaceShip 1", which is saved on the first change or ✅ Done.
- **Merge-on-write.** Changes are debounced by 250 ms and flushed on `pagehide` / hidden. Each write re-reads the stored save and replaces only the `spaceships` entries this page touched (changed or deleted ids). Every other field, including `updatedAt` / `updatedBy`, is written back byte-identical.
- **Corrupt save:** the page never overwrites it and shows a toast instead.
- **Legacy-only save** (`trooper-custom:db`): the page migrates it with `Army.load` first.
- **No save:** the page writes a fresh valid army v1 (`updatedBy: "spaceship-custom"`).
- **`storage` listener:** changes from other tabs or games reload live. This page's unsaved (dirty) ships and the draft stay on top.

## Embed / Army HQ shell

- The page runs embedded when it is inside a frame, or when the URL has `?section=…` or `?embed=1`.
- **Embedded main screen:** the page's own ⬅️ Back is hidden. An empty 48×48 `#homeSpot` reserves the top-left corner for the shell's 🏠.
- **Embedded demo:** `#homeSpot` hides and ⬅️ Back shows. In the demo, Back only exits the demo.
- **Standalone:** ⬅️ Back is a same-tab link to `../army/`.
- The page never touches `top` / `parent` location, never opens tabs, and Done never navigates.

Suggested route in `games/army/menu.js`:

```js
'customize/spaceship': { src: '../spaceship-custom/?section=ship', name: 'SpaceShip', home: { pos: 'tl', only: '#homeSpot', x: 8, y: 8 } },
```

## Tests

The Playwright suite (outside the repo) covers:

- desktop 1280×800, iPhone 13 portrait and landscape;
- empty and seeded saves;
- the UI checklist items;
- write safety;
- the storage listener;
- the demo;
- embed in a shell-mimic iframe.
