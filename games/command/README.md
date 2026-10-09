# Command Layers

A phone-first WW2 command sandbox. You give three British rifle companies their objectives. Each company commander breaks his objective into platoon tasks, and each platoon commander breaks his into section tasks. Press play and watch it unfold at any speed from 0.1× to 16×.

Plain JavaScript, canvas and DOM. No libraries; all art is drawn in code. Works offline as a PWA (Add to Home Screen).

## Playing
- **Planning**: the game starts paused with a default plan (A Coy seize the Farm, B Coy seize the Church, C Coy clear the Wood). Open **📋 Orders** and tap a row, or tap a unit on the map, to edit it.
- **Edit**: change the objective type or target, drag ◎ (target) or ◇ (position or start point) on the map, or set priority and aggression. Unlocked lower layers re-plan at once: a yellow flash, plus a ghost line from the old target to the new one.
- **Commanders are people**: every company, platoon and section leader has obedience, judgment, experience, maybe a quirk, and trust in you. Your edits are *suggestions*. A commander may say "Wilco", grumble, counter-propose (you can Insist, Accept theirs or Compromise), delay, or quietly ignore you, and you find out later in the feed. **🔒 Order** locks a task, so parent re-plans won't overwrite it, and makes your edits orders. Only very stubborn leaders sometimes disobey an order.
- **Plan quality** (0–100) shows on every node. How precisely you see it depends on your HQ staff (menu: Green, Regular, Veteran).
- **▶ / ⏸ / ⏭**: play, pause, or step one 0.5 s tick. The speed slider is logarithmic, 0.1× to 16×.
- **❗ Requests**: company commanders ask to change their objective (heavy casualties, attack stalled, objective taken early, enemy weakening, flank open) with 1–3 suggestions. Accept, Edit or Deny. The game auto-pauses on requests (you can turn this off).
- **📻 Feed**: a radio log with level and type filters. Tap a message to jump to that unit.
- **☰ Menu**: restart, new scenario, save or load a plan (3 slots), HQ experience, tutorial, help, and **🛠 Editor**.

## Objective Editor (v1.1)
Open **☰ Menu → 🛠 Editor** (or go straight to `editor.html`). Everything the commanders use to plan now lives in one data object, the *doctrine* (`DEFAULT_DOCTRINE` in `doctrine.js`). The editor has six tabs:
- **🏷 Task types**: label and icon for each task type, and which types each level (company, platoon, section) may use.
- **🗺 Company maps**: for each company objective type, its variants (add, duplicate, delete). Each variant has three platoon roles: task type, placement rule, distance, importance and an optional "wait for" gate. There's a live diagram with the objective, role markers and approach arrow. A nested "How he searches" section sets fire sites, approach angles and how often he makes mistakes.
- **🗺 Platoon maps**: the same breakdown, one level down, into section tasks (position, offsets, look direction) with diagrams.
- **⚙ Section drills**: section state machines drawn as boxes and arrows (move, hold, suppress, overwatch, assault jump-off, wait, charge, consolidate and sweep, plus pinned and broken). You can edit speed, wait timeouts, gates, radii and arrival distances, and switch off optional phases.
- **📊 Scoring**: the weights behind plan quality.
- **⇅ Import / Export**: export (copy or download `command-doctrine.json`), import (paste or file), reset.

**💾 Save** stores the doctrine in `localStorage` (`command-doctrine-v1`). The game loads it on start, or uses the defaults if nothing is saved. **↺ Reset** restores the defaults. Imports are checked one field at a time: a bad or out-of-range value falls back to its default, and anything that isn't a doctrine JSON is rejected. With the default doctrine the game behaves exactly like v1.

## Files
`index.html` (UI and styles), `doctrine.js` (default doctrine, validation, storage), `editor.html` + `editor.js` (Objective Editor), `game.js` (map, pathfinding, line of sight, objectives tree, commanders, simulation, rendering, UI), `sw.js` (offline cache `command-v2`), `manifest.webmanifest`, icons.
