# Command Layers

A phone-first WW2 command sandbox. You command **1st Battalion**: give the battalion its objective, and the battalion CO splits it into tasks for three British rifle companies. Each company commander breaks his task into platoon tasks, and each platoon commander breaks his into section tasks (Bn → Coy → Pl → Sec). You can step in at any layer. Press play and watch it unfold at any speed from 0.1× to 16×.

Plain JavaScript, canvas and DOM. No libraries; all art is drawn in code. Works offline as a PWA (Add to Home Screen).

## Playing
- **Planning**: the game starts paused with the battalion ordered to seize the Church. With the default CO that gives A Coy seize the Farm, B Coy seize the Church and C Coy clear the Wood. Open **📋 Orders** and tap a row, or tap a unit (or the **Bn** HQ marker) on the map, to edit it.
- **Battalion orders**: tap the **1st Bn** row at the top of the Orders tree. Pick an objective type (Seize, Clear, Hold, Screen, Recon, Withdraw to) and a target. The battalion CO scores his candidate plans (main effort, flanking enemy positions, fire base, reserve…) and re-tasks the companies according to his personality. Companies you have **🔒 locked**, and anything locked below them, keep their tasks when the battalion re-plans.
- **Edit**: change the objective type or target, set priority and aggression, or move the ◎ (target) and ◇ (position or start point) handles on the map. Unlocked lower layers re-plan at once: a yellow flash, plus a ghost line from the old target to the new one.
- **✋ Drag button** (top right of the map): off by default, so a touch can never move anything by accident. One finger pans and a tap selects. Tap it to turn drag **on**: the button lights up yellow and the ◎/◇ handles pulse yellow with a "drag" label and can be dragged. It **stays on** until you tap it again (or press `D` on a keyboard). Tapping a handle while drag is off shows a reminder.
- **Commanders are people**: every battalion, company, platoon and section leader has obedience, judgment, experience, maybe a quirk, and trust in you. Your edits are *suggestions*. A commander may say "Wilco", grumble, counter-propose (you can Insist, Accept theirs or Compromise), delay, or quietly ignore you, and you find out later in the feed. **🔒 Order** locks a task, so parent re-plans won't overwrite it, and makes your edits orders. Only very stubborn leaders sometimes disobey an order.
- **Plan quality** (0–100) shows on every node, battalion included. How precisely you see it depends on your HQ staff (menu: Green, Regular, Veteran).
- **▶ / ⏸ / ⏭**: play, pause, or step one 0.5 s tick. The speed slider is logarithmic, 0.1× to 16×.
- **❗ Requests**: the battalion CO and the company commanders ask to change their objective (heavy casualties, attack stalled, objective taken early, enemy weakening, flank open) with 1–3 suggestions. Accept, Edit or Deny. The game auto-pauses on requests (you can turn this off). The battalion CO also commits his reserve company when the attack stalls.
- **📻 Feed**: a radio log with level (Bn/Coy/Pl/Sec) and type filters. Tap a message to jump to that unit.
- **☰ Menu**: restart, new scenario, save or load a plan (3 slots, battalion included), HQ experience, tutorial, help, and **🛠 Editor**.

## Objective Editor (v1.2)
Open **☰ Menu → 🛠 Editor** (or go straight to `editor.html`). Everything the commanders use to plan lives in one data object, the *doctrine* (`DEFAULT_DOCTRINE` in `doctrine.js`). The editor has seven tabs:
- **🏷 Task types**: label and icon for each task type, and which types each level (battalion, company, platoon, section) may use.
- **🗺 Battalion maps**: for each battalion objective type, its variants. Each variant has company roles: task type, where the company objective goes (the battalion objective itself, a flanking enemy position left or right with a fallback, an offset spot, or behind as a reserve), importance, an optional "wait for" gate (e.g. wait for the fire-base company) and "clear instead of seize if it's a wood". Each has a live schematic diagram.
- **🗺 Company maps**: for each company objective type, its variants (add, duplicate, delete). Each variant has three platoon roles: task type, placement rule, distance, importance and an optional "wait for" gate. There's a live diagram with the objective, role markers and approach arrow. A nested "How he searches" section sets fire sites, approach angles and how often he makes mistakes.
- **🗺 Platoon maps**: the same breakdown, one level down, into section tasks (position, offsets, look direction) with diagrams.
- **⚙ Section drills**: section state machines drawn as boxes and arrows (move, hold, suppress, overwatch, assault jump-off, wait, charge, consolidate and sweep, plus pinned and broken). You can edit speed, wait timeouts (including the company-level gate wait), gates, radii and arrival distances, and switch off optional phases.
- **📊 Scoring**: the weights behind plan quality, including a battalion section (main effort, flanks, fire base, reserve, frontage, depth…).
- **⇅ Import / Export**: export (copy or download `command-doctrine.json`), import (paste or file), reset.

**💾 Save** stores the doctrine in `localStorage` (`command-doctrine-v1` key; doctrine version 2). The game loads it on start, or uses the defaults if nothing is saved. **↺ Reset** restores the defaults. Imports are checked one field at a time: a bad or out-of-range value falls back to its default, and anything that isn't a doctrine JSON is rejected. Version-1 doctrines (from before the battalion level) still import and load; the battalion parts are filled in from the defaults. Below battalion level, the default doctrine plans exactly like v1.1.

## Files
`index.html` (UI and styles), `doctrine.js` (default doctrine, validation, storage), `editor.html` + `editor.js` (Objective Editor), `game.js` (map, pathfinding, line of sight, objectives tree, commanders, simulation, rendering, UI), `sw.js` (offline cache `command-v3`), `manifest.webmanifest`, icons.
