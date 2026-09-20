# Campus NPC life (npc1) — Dev B

Living map characters driven by `campus-state.json`.

## Open
- **Pages / local:** `campus-live.html?v=npc1`
- Script: `campus-npc.js?v=npc1` (loaded before the main live IIFE)

## Behavior
| Status | Motion |
|--------|--------|
| idle / ready_for_review | Chill at home desk — idle loop, personality fidget, **no fake busy** |
| working / reviewing / collaborating | Walk/run to craft station → `busy_at_station` + kind VFX |
| needs_permission | **Run** to Jesus permission pad; mute-safe 🚨 flash |

## Stations → roles
| Station | Kind | Who |
|---------|------|-----|
| station-code | code | leader, dev-* |
| station-art | art | render-* |
| station-research | research | researcher-* |
| station-permission | permission | anyone `needs_permission` |
| desk-* | home | idle / Profile preferredStation |

Personality `preferredStation` from Profile A overrides when present.

## Frame keys (Render)
`idle` · `walk_a`/`walk_b` · `run_a`/`run_b` · `busy` · `emotion_ready` · `emotion_permission`  
Missing sheets fall back to existing desk/status frames / swatch.

## Hard fails (Researcher B)
1. No walk-in-place (velocity + debounce)
2. No idle while pathing; no busy at wrong place
3. Station VFX match kind (not generic sparkle)
4. Per-bot personality kits
5. Mute-safe emotion spikes
6. Android 10s mute watch — must not look like pinned chips

## Dev A merge
Keep fun-pass v11 juice/Fit/camera. Look for `// === NPC-FSM (Dev B) ===` blocks and `.station` / `.npc-*` CSS. FSM owns sprite `left`/`top` after first paint via rAF.
