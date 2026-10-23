# Squad FSM

Program the brain of a soldier squad. Build a finite state machine (states + arrows with conditions), press ▶ and watch the squad fight.

- 🧠 FSM tab: tap a state to edit its behaviour, ➕↗ to draw an arrow, tap the condition chip to change it, ▲▼ to change priority, ✋ to move nodes. 👥 squad FSM, or give 🔫 🔩 🩹 ⭐ roles their own.
- ⚔ Battle tab: ▶/⏸, ⏭ step, ×speed, ↺. State icon above each soldier, live state lit in the graph.
- 📜 Log: every transition, e.g. "Rifleman 2: Patrol → Take cover (💥 Under fire)".
- 📋 7 missions with ⭐⭐⭐ (win, nobody lost, under par time). Mission 1 starts with a broken FSM to fix.
- 💾 save / copy / delete FSMs (localStorage), JSON export / import.

Damage uses the Front Line attack-level rule (`LVL_MULT`). Pure 2D canvas, no libraries. Offline PWA (cache `squad-fsm-v1`).
