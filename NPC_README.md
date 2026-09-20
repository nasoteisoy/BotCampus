# Campus NPC life (npc2) — Dev B

Living map characters driven by `campus-state.json`.

## Open
- **Pages / local:** `campus-live.html?v=npc2`
- Script: `campus-npc.js?v=npc2` (loaded before the main live IIFE)

## Behavior
| Status | Motion |
|--------|--------|
| idle | Chill at home desk — idle loop, personality fidget, **no fake busy** |
| ready_for_review | At desk; mute-readable `.npc-emotion` soft pulse every ~2.6s (not transition-only) |
| working / reviewing / collaborating | **Spawn at desk**, then walk/run to craft station → `busy_at_station` + kind VFX |
| needs_permission | **Run** to Jesus permission pad; mute-safe 🚨 flash + pulse while held |

## Stations → roles
| Station | Kind | Who |
|---------|------|-----|
| station-code | code | leader, dev-* |
| station-art | art | render-* |
| station-research | research | researcher-* |
| station-permission | permission | anyone `needs_permission` |
| desk-* | home | idle / ready |

Personality `preferredStation` craft-station overrides when present. Desk-only preferredStation does **not** pin busy bots (they use role default station).

## Seed (npc2 demo)
- Movers at desks: leader, render-a, researcher-a, dev-a (working → path to stations)
- researcher-b: **idle** board + main + interns at desk (no busy mismatch)
- ldr-1 intern: `needs_permission` from desk-leader → RUN to station-permission
- dev-b: `ready_for_review` at desk (emotion pulse visible on load)

## Frame keys (Render)
`idle` · `walk_a`/`walk_b` · `run_a`/`run_b` · `busy` · `emotion_ready` · `emotion_permission`  
Missing sheets fall back to existing desk/status frames / swatch.

## Hard fails (Researcher B / Dev C)
1. No walk-in-place (velocity + debounce)
2. No idle while pathing; no busy at wrong place
3. Station VFX match kind (not generic sparkle)
4. Per-bot personality kits
5. Mute-safe emotion spikes **while status holds**
6. Android 10s mute watch — must show real pathing (spawn at desk, not station)
7. Board status must match map (idle ≠ npc-busy)

## Dev A merge
Keep fun-pass v11 juice/Fit/camera. Look for `// === NPC-FSM (Dev B) ===` blocks and `.station` / `.npc-*` CSS. FSM owns sprite `left`/`top` after first paint via rAF.
