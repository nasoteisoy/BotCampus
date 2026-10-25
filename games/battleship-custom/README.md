# 🚀 BattleShip Editor

Design capital ships for space battles, saved per nation in the shared army save (`army.battleships[]`).

- Steps: 1 Ship › 2 Parts › 3 Done (same wording as the SpaceShip Editor). Ships save automatically; "✓ Saved" flashes top-right.
- Header: ⬅️ Back top-left, the breadcrumb Nation › 🚀 BattleShips › Name › Part, then "🚀 Editing: Name".
- Each part card shows that part close up (the rest of the ship is greyed out). Size cards show the whole ship at one scale.
- Parts (nothing is locked): 📐 Size, 🛡️ Armor, 🔵 Shield, 💥 Guns, ✈️ Hangar, 🚀 Engine.
- 🎬 Demo: the ship flies, its turrets fire, the shield takes hits and the hangar launches SpaceShips and troopers.
  Shields (yours and the enemy's) are a light edge glow: very faint in the editor, about 0.08 opacity at rest in the demo, and they flash when hit.
  On phones held upright, the preview grows to about 45% of the screen while the demo runs; the steps and tabs come back on Stop.
- Part cards show a close-up of that part, brightly lit, with the rest of the ship as a dark ghost. The list scrolls so the last card always clears the ✅ Done button.
- Hangar SpaceShips come from the SpaceShip Editor (`../spaceship-custom/`) when it is deployed: the player's saved
  `army.spaceships[]` (their real models), otherwise its default base ship. Without it, the demo uses its own small craft.
- Drag the 3D view to turn it (mouse or touch). Use the wheel or a pinch to zoom.

Files: `index.html`, `css/style.css`, `js/main.js` (UI), `js/battleship-stats.js` (pure stats plus the parts table),
`js/fleet.js` (save format plus merge-on-write), `js/ship3d.js` (low-poly model), `js/demo.js` (demo battle),
`js/spacecraft.js` (loads the SpaceShip Editor's `ship3d.js` + `ship-stats.js` for hangar launches; read-only, never writes `spaceships[]`).
three.js comes from `../trooper-custom/vendor/three.module.min.js` (the same copy the Trooper Customizer uses).
Format and API: [BATTLESHIP_FORMAT.md](BATTLESHIP_FORMAT.md).
