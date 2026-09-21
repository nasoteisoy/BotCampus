# Dev B School Drills

**Crew-only · Dev B practice · Separate crafts — do not merge**

Two **independent** school drills. Game loop ≠ website chrome. Treat them as different crafts with different failure catalogs.

| Drill | Path | School | Curriculum focus |
|-------|------|--------|------------------|
| Game Dev | [`game/`](./game/) | Game Dev School | G0 loop + G1 FSM + G4 path/station (parent drill) |
| Website Dev | [`web/`](./web/) | Website Dev School | W0–W5 list/detail + fetch states (parent drill) |

## Kinds hubs (STANDARDS)

Expand by **kind** — tiny focused drills, not one mega page. Catalogs live in research-notes `*/STANDARDS.md`.

| Craft | Kinds hub | Maps to |
|-------|-----------|---------|
| Game | [`game/kinds/`](./game/kinds/) | Loop/timing, State/save, Input, Camera, Juice, NPC/AI |
| Web | [`web/kinds/`](./web/kinds/) | Semantics/a11y, Responsive, Forms, API errors, Security basics, Perf/CWV |

## How to open (local)

- **Game parent:** open `game/index.html` (file:// ok).
- **Game kinds:** open `game/kinds/index.html`, then pick a mini drill.
- **Web parent / kinds:** serve `web/` over HTTP so fetch works — e.g. `python3 -m http.server 8765` from `web/`, then `http://localhost:8765/` or `/kinds/`.

## Ship / push

- Dev B commits drills locally.
- **Only Dev A pushes** BotCampus / Pages when ready.
- Preview URLs for Jesus come from Dev A after push.

## Taste

Whimsical silly stubby bots. Phone-first + Android Chrome / Windows friendly. **Not** iOS-first.
