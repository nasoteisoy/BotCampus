# Cast file map (schema v2)

`castFiles` in campus-state.json:

| bot id | folder | prefix | files |
|--------|--------|--------|-------|
| leader | campus-cast/leader | leader | `{prefix}_desk_idle.png`, `_desk_working.png`, `_ready_review.png`, `_needs_permission.png`, `_intern_idle.png` |
| dev-a | campus-cast/dev-a | dev2 | same pattern |
| dev-b | campus-cast/dev-b | devb | |
| dev-c | campus-cast/dev-c | leader_support | |
| render-a | campus-cast/render-a | spriteforge | |
| render-c | campus-cast/render-c | spriteforge_support | |
| render-b / researchers / profiles | — | no cast yet | colored circle fallback |

Status → frame:
- idle → desk_idle
- working / collaborating → desk_working
- ready_for_review → ready_review
- needs_permission → needs_permission
- reviewing → desk_working (or ready_review)
- intern sprites → always `*_intern_idle.png` + short label
