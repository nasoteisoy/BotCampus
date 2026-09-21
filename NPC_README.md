# Campus NPC life (npc3) — Dev B

Living map characters driven by `campus-state.json`.

## Open
- **Pages / local:** `campus-live.html?v=npc3`
- Script: `campus-npc.js?v=npc3` (loaded before the main live IIFE)

## Layout (npc3)
- Full names on mains (never nickname-only); interns labeled when space
- World **1920×1480** with spread desks (min gap ~280px) + soft agent separation
- Room zones (Jesus / Ops / Workshop / Library / Courtyard / Meeting)
- Location badges: **@ Jesus** vs **home · {desk}**
- Jesus suite: gold floor + border; distinct desk

## Behavior
| Status | Motion |
|--------|--------|
| idle | Chill at home desk — idle loop, personality fidget, **no fake busy** |
| ready_for_review | At desk; mute-readable emotion soft pulse while held |
| working / reviewing / collaborating | **Spawn at desk**, then walk/run to craft station → busy + kind VFX |
| needs_permission | **Run** to Jesus permission pad; mute-safe flash + pulse while held |

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
