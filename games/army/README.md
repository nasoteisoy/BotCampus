# 🪖 Army HQ — one page for every army game

`games/army/` is the single entry for the shared-army games. Static HTML/CSS/JS, no build, no three.js (CSS background).
Every game, editor and view opens **inside this page** (a full-screen same-origin `<iframe>` "stage"), with hash routes so
browser back / forward and refresh work. A floating 🏠 returns to the menu without leaving the page.

| Route | Opens |
|---|---|
| `#conquest` | Conquest Commander |
| `#ships` | Ship Sandbox |
| `#customize/nation` · `#customize/troopers` · `#customize/armor` | Trooper Customizer showing only that part (`?section=`) |
| `#customize/nation/new` | new player + nation, then the nation editor (address becomes `#customize/nation`) |
| `#customize/brains` | Unit Brains |
| `#customize/spaceship` · `#customize/battleship` | 🚧 coming panel |
| `#view/action` · `#view/combat` · `#view/team` | Action view, Combat simulator, Team simulator |
| `#customize` | full Customizer (when a game links to it, e.g. Conquest "Edit army") |
| (none) | the menu |

Links between games inside the stage stay inside the page; the address bar follows (e.g. Combat ⬅️ → `#customize`).
If the stage ever lands on the hub or Army HQ itself, it is taken to the top page instead (no nesting).

- Header: **Player:** and **Nation:** dropdowns from the shared save `botcampus:army` (via `../shared/army/schema.js?v=8`).
  Each player has exactly one nation, so both lists pick the same thing: the active player (`activePlayerId`).
  Picking one is the menu's only write: it patches `activePlayerId` (+ `updatedAt`/`updatedBy: 'army-hq'`) into the stored JSON and
  leaves everything else as it is. `➕ Create` = new player + nation (nation editor); `✏️ Edit` = nation editor.
  Empty save: both show `➕ Create`, which opens the nation editor (the Customizer makes Player 1 / Nation 1 on first open).
- Buttons: ▶️ Conquest, 🚢 Ships, 🪖 Customize ▾ (Nation, Troopers, Armor = tanks, SpaceShip 🚧, BattleShip 🚧, Brains),
  🎬 Views ▾ (Action view, Combat sim, Team sim), 🏠 Everything (the hub, normal link).
- Settings: 📦 Packs = Conquest's `conquest-commander:pickups-flag` (`'1'` on, `'0'` off, missing = on).
  🔊 Sound = `botcampus:army-menu:sound` (menu blips only, WebAudio, no files).
- Keys: arrows move between buttons; Enter / Space opens (on 🪖 / 🎬 it opens the dropdown, focus on the first item);
  arrows move inside it, Esc closes. When a game opens, keyboard focus goes into it.
- 🏠 position per game is anchored to that game's own HUD so it covers nothing (Conquest: start screen only; in a battle use
  Conquest's own menu to get back to its start screen).

Trooper Customizer section mode lives in `../trooper-custom/js/section.js` (`index.html?section=nation|troopers|armor[&new=1]`);
without `?section=` the Customizer is unchanged.
