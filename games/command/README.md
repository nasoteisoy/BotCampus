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
- **☰ Menu**: restart, new scenario, save or load a plan (3 slots), HQ experience, tutorial, help.

## Files
`index.html` (UI and styles), `game.js` (map, pathfinding, line of sight, objectives tree, commanders, simulation, rendering, UI), `sw.js` (offline cache `command-v1`), `manifest.webmanifest`, icons.
