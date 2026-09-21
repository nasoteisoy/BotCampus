# Campus NPC life (npc5) — Dev B

Living map characters driven by `campus-state.json`.

## Open
- **Pages / local:** `campus-live.html?v=npc5`
- Script: `campus-npc.js?v=npc5` (loaded before the main live IIFE)

## Layout (npc5)
- Full names on mains (never nickname-only); interns labeled when space
- World **2100×1600** with spread desks + craft rings + soft agent separation
- Room zones (Jesus / Ops / Workshop / Library / Courtyard / Meeting) — enlarged for craft rings
- Location badges (position-truthful every frame):
  - **@ Jesus** only in Jesus room / on permission pad
  - **home · {desk}** only within ARRIVE of own desk
  - **at {station}** near craft station (code/art/research)
  - Never show home while piled at a craft station
- Jesus suite: gold floor + border; distinct desk
- Fit keeps mains ~70–100px on screen
- Mains render above interns (`z-index` 8 vs 5)

## Slots (zero stacks — best-effort; Dev A COLLISION-LAYOUT may refine)
- **Mains:** INNER hex ring around craft/permission stations (`SLOT_MIN_DIST` ~130)
- **Interns:** owner-orbit (≥125px around owner main) OR OUTER station ring (~200+)
- Home desks: mains north; interns clear orbit (never under main body)
- Global separation every frame: main-main **130**, main-intern **100**, intern-intern **80** (interns yield more)

## Stuck walkers (npc5)
- If `walk`/`run` but world displacement **&lt; 2px over 0.5s** → nudge free slot OR force idle/busy (drop walk class)
- Never keep `npc-walk` with near-zero motion

## Permission banner (npc5)
- Shows while agents are still en route / partial
- **Clears** (remove `.show`) when all arrived OR none in `needs_permission`
- Pad still lights `.on` via FSM; banner does not stick on “at Jesus pad”

## Behavior
| Status | Motion |
|--------|--------|
| idle | Chill at home desk — idle loop, personality fidget, **no fake busy** |
| ready_for_review | At desk; mute-readable emotion soft pulse while held |
| working / reviewing / collaborating | **Spawn at desk**, then walk/run to **slotted** craft station → busy + kind VFX |
| needs_permission | **Run** to Jesus permission pad (emotion overlay does not freeze); on arrive → `busy_at_station`, pad `.on`, banner clears |

## Stations → roles
| Station | Kind | Who |
|---------|------|-----|
| station-code | code | leader, dev-* |
| station-art | art | render-* |
| station-research | research | researcher-* |
| station-permission | permission | anyone `needs_permission` |
| desk-* | home | idle / ready |

Personality `preferredStation` craft-station overrides when present.

## Hard fails (still)
- No walk-in-place
- No idle while pathing; no busy pose at wrong place
- Station VFX match kind
- First spawn always at desk
- Zero main/main or main/intern piles at same station %
