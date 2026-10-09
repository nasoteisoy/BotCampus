# Command Layers

A phone-first WW2 command sandbox. You command a **brigade front of three British battalions** (1st, 2nd and 3rd Bn) on a 3 km map. Give each battalion its objective, and that battalion's CO splits it into tasks for his three rifle companies. Each company commander breaks his task into platoon tasks, and each platoon commander breaks his into section tasks (Bn → Coy → Pl → Sec). You can step in at any layer. Press play and watch it unfold at any speed from 0.1× to 16×.

Plain JavaScript, canvas and DOM. No libraries; all art is drawn in code. Works offline as a PWA (Add to Home Screen).

## The map (v2.0)
The map is 3000 × 1000 m (3.0 km², up from 1200 × 900 m in v1.x). A river runs across the whole front, with three bridges, and the Mill Brook is a wadeable stream in the east. There are 17 named places in three sectors:
- **West, 1st Bn** (orange, A/B/C Coy): Ashford village, the Orchard, Hill 108, the West Bridge, and the Mill in the rear.
- **Centre, 2nd Bn** (blue, D/E/F Coy): the old v1 map. Centre Bridge, Crossroads, Church, Wood, Ridge and Farm, with the North Bank in the rear.
- **East, 3rd Bn** (yellow, G/H/I Coy): the Manor, the Great Wood, Windmill Hill, the East Bridge, and Northend in the rear.

Each sector has its own German defence: outposts, MG posts, a main position and a local reserve that counterattacks in that sector. That is about 30 German units in all, against 9 British companies (27 platoons).

## Playing
- **Planning**: the game starts paused. 1st Bn is ordered to seize Ashford, 2nd Bn the Church and 3rd Bn the Manor. Each CO picks his own plan.
- **⤢ Fit** (top right) shows the whole front. Pinch or use the mouse wheel to zoom, and drag with one finger to pan. When zoomed out, companies are drawn as coloured markers; tap one to select it. Tap a battalion chip to jump to that sector.
- **📋 Orders**: the tree starts folded to battalions and companies. Tap ▸ to unfold a company, or **⊟ Fold** to fold everything again. Use the **All / 1st / 2nd / 3rd Bn** chips to show one battalion (this also jumps the map to its sector).
- **Battalion orders**: tap a **Bn** row (or the **Bn1/Bn2/Bn3** HQ marker on the map). Pick an objective type (Seize, Clear, Hold, Screen, Recon, Withdraw to) and a target; the nearest places are listed first, and **＋ more** shows the rest. The battalion CO scores his candidate plans (main effort, flanking enemy positions, fire base, reserve…) and re-tasks his companies according to his personality. Companies you have **🔒 locked**, and anything locked below them, keep their tasks. Other battalions are never touched.
- **Edit**: change the objective type or target, set priority and aggression, or move the ◎ (target) and ◇ (position or start point) handles on the map. Unlocked lower layers re-plan at once.
- **✋ Drag button**: off by default, so a touch can never move anything by accident. Tap it to turn drag **on**, and the ◎/◇ handles can be dragged. It stays on until you tap it again (or press `D`).
- **Commanders are people**: every leader has obedience, judgment, experience, maybe a quirk, and trust in you. Your edits are *suggestions*: they may say "Wilco", grumble, counter-propose, delay or ignore you. **🔒 Order** locks a task and makes your edit an order.
- **Plan quality** (0–100) shows on every node. How precisely you see it depends on your HQ staff (menu: Green, Regular, Veteran).
- **▶ / ⏸ / ⏭**: play, pause, or step one 0.5 s tick. The speed slider runs from 0.1× to 16×.
- **❗ Requests**: each battalion CO and the company commanders ask to change their objective, with 1–3 suggestions. Filter them by battalion. Each battalion CO commits his own reserve when his attack stalls.
- **📻 Feed**: a radio log with battalion, level and type filters. Tap a message to jump to that unit.
- **☰ Menu**: restart, new scenario, save or load a plan (3 slots, all three battalions), HQ experience, tutorial, help, and **🛠 Editor**. Saves from v1.x (one-battalion map) can't be placed on the new map. They are refused with a message, and the slot shows "old 1-battalion map".

## Objective Editor
Open **☰ Menu → 🛠 Editor** (or go straight to `editor.html`). Everything the commanders use to plan lives in one data object, the *doctrine* (`DEFAULT_DOCTRINE` in `doctrine.js`). The doctrine applies to **all three battalions**; their COs differ only in personality. The editor has seven tabs:
- **🏷 Task types**: label and icon for each task type, and which types each level may use.
- **🗺 Battalion maps**: for each battalion objective type, its variants with company roles (task type, placement rule, importance, "wait for" gate, clear-if-wood) and a live diagram.
- **🗺 Company maps** / **🗺 Platoon maps**: the same breakdown into platoon and section tasks, with diagrams.
- **⚙ Section drills**: section state machines (move, hold, suppress, overwatch, assault, charge, consolidate, pinned, broken…) with editable timings and gates.
- **📊 Scoring**: the weights behind plan quality, battalion section included.
- **⇅ Import / Export**: export, import, reset.

**💾 Save** stores the doctrine in `localStorage` (`command-doctrine-v1`; doctrine version 2). Imports are checked one field at a time, and version-1 doctrines still load.

## Performance
- Line of sight, woods and elevation use precomputed 5 m grids plus a 100 m spatial index.
- A* is capped at 12 path plans per tick, so H-hour has no spike.
- The map is pre-rendered in 1 km tiles, and only visible tiles are drawn.
- Zoomed-out views use simplified markers.
- With about 147 units, a sim tick costs about 0.5–1.5 ms. At 16× the game runs at 60 fps and 32 ticks/s on desktop.

## Files
`index.html` (UI and styles), `doctrine.js` (default doctrine, validation, storage), `editor.html` + `editor.js` (Objective Editor), `game.js` (map, pathfinding, line of sight, objectives tree, commanders, simulation, rendering, UI), `sw.js` (offline cache `command-v4`), `manifest.webmanifest`, icons.
