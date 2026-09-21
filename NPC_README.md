# Campus NPC life (npc4) — Dev B

Living map characters driven by `campus-state.json`.

## Open
- **Pages / local:** `campus-live.html?v=npc4`
- Script: `campus-npc.js?v=npc4` (loaded before the main live IIFE)

## Layout (npc4)
- Full names on mains (never nickname-only); interns labeled when space
- World **1920×1480** with spread desks (min gap ~280px) + soft agent separation
- Room zones (Jesus / Ops / Workshop / Library / Courtyard / Meeting) — workshop/library enlarged for craft rings
- Location badges (position-truthful every frame):
  - **@ Jesus** only in Jesus room / on permission pad
  - **home · {desk}** only within ARRIVE of own desk
  - **at {station}** near craft station (code/art/research)
  - Never show home while piled at a craft station
- Jesus suite: gold floor + border; distinct desk
- Fit keeps mains ~70–100px on screen

## Slots (zero stacks)
Craft ARRIVE targets use `stationPos + slotOffset(index)` with **min ~120px** world:
- Mains sorted before interns, stable by agent key
- Hex rings (6 per ring) around each station
- Soft separation also runs while moving and `busy_at_station`

## Behavior
| Status | Motion |
|--------|--------|
| idle | Chill at home desk — idle loop, personality fidget, **no fake busy** |
| ready_for_review | At desk; mute-readable emotion soft pulse while held |
| working / reviewing / collaborating | **Spawn at desk**, then walk/run to **slotted** craft station → busy + kind VFX |
| needs_permission | **Run** to Jesus permission pad (emotion overlay does not freeze); on arrive → `busy_at_station`, pad `.on`, banner clears “running” |

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
