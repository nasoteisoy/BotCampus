# Dev B School Drills

**Crew-only · Dev B practice · Separate crafts — do not merge**

Two **independent** school drills. Game loop ≠ website chrome. Treat them as different crafts with different failure catalogs.

| Drill | Path | School | Curriculum focus |
|-------|------|--------|------------------|
| Game Dev | [`game/`](./game/) | Game Dev School | G0 loop + G1 FSM + G4 path/station (drills 1+2) |
| Website Dev | [`web/`](./web/) | Website Dev School | W0–W5 list/detail + fetch states (drills 1–3) |

## How to open (local)

- **Game:** open `game/index.html` in a browser (file:// or any static server).
- **Web:** serve `web/` over HTTP so `fetch('data.json')` works — e.g. `python3 -m http.server 8765` from `web/`, then visit `http://localhost:8765/`.

## Ship / push

- Dev B commits drills locally.
- **Only Dev A pushes** BotCampus / Pages when ready.
- Preview URLs for Jesus come from Dev A after push.

## Taste

Whimsical silly stubby bots. Phone-first + Android Chrome / Windows friendly. **Not** iOS-first.
