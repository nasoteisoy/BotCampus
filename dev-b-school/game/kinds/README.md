# Game kinds — map to STANDARDS.md

Hub: [`index.html`](./index.html)  
Source catalog: `research-notes/game-dev-school/STANDARDS.md`

| Kind (STANDARDS) | Drill path | What this tiny stub shows |
|------------------|------------|---------------------------|
| **Loop / timing** | [`loop-timing/`](./loop-timing/) | Fixed timestep + accumulator; tick count vs displayed FPS |
| **State / save** | [`state-save/`](./state-save/) | JSON state blob; export/import + localStorage resume |
| **Input** | [`input/`](./input/) | Gesture vs HUD hitboxes — tap HUD without moving cam; tap world to move |
| **Camera / UI feel** | [`camera/`](./camera/) | Pan/zoom clamps + zoom buttons on a dense map stub |
| **Juice / feedback** | [`juice/`](./juice/) | Mute-safe flash/scale on button press (no audio) |
| **NPC / AI behavior** | [`npc-ai/`](./npc-ai/) → [`../index.html`](../index.html) | Idle → path → busy FSM (parent game drill) |

**Not drilled here (still in STANDARDS):** Perf budgets, Content pipeline, Tooling/CI, A11y-in-games lite — learn later or borrow from web kinds where relevant.

**Platform:** Android Chrome + Windows. Whimsical silly stubby bots.
