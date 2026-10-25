# 🪖 Army HQ — one page, one address, every army game

`games/army/` is the single entry for the shared-army games. Static HTML/CSS/JS, no build, no three.js (CSS background).
Every game, editor, view and the hub opens **inside this page** (a full-screen same-origin `<iframe>` "stage").
**The address bar never changes**: it stays `…/games/army/` whatever is tapped.

- **Refresh** restores the open view: it is kept in `sessionStorage` (`botcampus:army-hq:view` = route + page inside the stage).
- **Back** (phone / browser): opening a view pushes one history entry with the *same* URL; Back pops it and the menu shows.
  Pages opened from inside a view (e.g. Combat ⬅️ → Customizer) add their own same-URL entries, so Back walks them first.
  Forward reopens the last view. 🏠 closes the view and removes its entry (so Back then leaves Army HQ normally).
- Old v2 links with a `#route` (e.g. `…/army/#conquest`) still open that view, then the `#…` is removed from the address.

| Route (internal) | Opens |
|---|---|
| `conquest` | Conquest Commander |
| `ships` | Ship Sandbox |
| `customize/nation` · `customize/troopers` · `customize/armor` | Trooper Customizer showing only that part (`?section=`) |
| `customize/nation/new` | new player + nation, then the nation editor |
| `customize/brains` | Unit Brains |
| `view/action` · `view/combat` · `view/team` | Action view, Combat simulator, Team simulator |
| `customize` | full Customizer (when a game links to it, e.g. Conquest "Edit army") |
| `hub` | 🏠 Everything (the hub page, inside the stage) |

## Keeping everything inside
On every page the stage loads (same origin, so the shell can reach in):
- links with `target=_blank` / `_top` / `_parent` / a named window, and Ctrl/⌘/Shift/middle clicks → opened **in the stage**;
- `window.open(url)` → opened in the stage (returns `null`);
- a link to Army HQ itself → back to the menu (never Army HQ inside Army HQ);
- a link to another site (not `nasoteisoy.github.io`) → not opened, a short note shows. Other `nasoteisoy.github.io` sites
  that the hub lists (seraphina-fortnite, moveable-8, arduino-kit-explorer) are same-site and open in the stage.
- Backstop: the iframe is `sandbox`ed without `allow-popups` / `allow-top-navigation`, so no code inside can open a tab or
  move the page away. Kept: scripts, same-origin storage, forms, `confirm()`/`alert()`, downloads (Brains export), pointer lock, orientation lock.

## Menu
- Header: **Player:** and **Nation:** dropdowns from the shared save `botcampus:army` (via `../shared/army/schema.js?v=8`).
  Each player has exactly one nation, so both lists pick the same thing: the active player (`activePlayerId`).
  Picking one is the menu's only write: it patches `activePlayerId` (+ `updatedAt`/`updatedBy: 'army-hq'`) into the stored JSON.
  `➕ Create` = new player + nation (nation editor); `✏️ Edit` = nation editor. Empty save: both show `➕ Create`.
- Buttons: ▶️ Conquest, 🚢 Ships, 🪖 Customize ▾ (Nation, Troopers, Armor = tanks, Brains), 🎬 Views ▾ (Action view,
  Combat sim, Team sim), 🏠 Everything (the hub). New editors (spaceship, battleship) get an item only when they ship.
  Buttons are `role=button` with no `href`, so nothing offers "open in new tab".
- Settings: 📦 Packs = Conquest's `conquest-commander:pickups-flag` (`'1'` on, `'0'` off, missing = on).
  🔊 Sound = `botcampus:army-menu:sound` (menu blips only, WebAudio, no files).
- Keys: arrows move between buttons; Enter / Space opens (on 🪖 / 🎬 it opens the dropdown, focus on the first item);
  arrows move inside it, Esc closes. When a game opens, keyboard focus goes into it.
- 🏠 position per page is anchored to that page's own HUD so it covers nothing (Conquest: start screen only).

Trooper Customizer section mode lives in `../trooper-custom/js/section.js` (`index.html?section=nation|troopers|armor[&new=1]`).
