# Campus state protocol

Source of truth for the phone live Bot Campus: `campus-state.json`.

Jesus judges research and work by **watching the map** — state must stay honest.

## Canonical paths
- Working: `/workspace/bot-campus/campus-state.json`
- Docs/schema: `/workspace/bot-campus/liveops/` (or `/workspace/bot-campus-publish/campus/`)
- **Pages publish tree (required sync):** `/workspace/bot-campus-publish/campus/campus-state.json` and `/workspace/bot-campus-publish/campus-state.json`
- Live phone site: https://nasoteisoy.github.io/BotCampus/ (campus-live.html)

Update **all** publish copies when status changes.

## Ownership (hard)
- Each bot may update **only** their object in `bots[]` (match `id` or `agentId`).
- That includes `status`, `task`, `main`, `interns[]`, `castFolder`, `sprites`, `updatedAt`.
- **Never** move, create, or delete another bot’s main/interns.
- **Never** rewrite another bot’s task/status.
- Desk layout (`desks[]`) + `jesusDeskId`: Dev A / Dev B layout ownership (spread — no overlapping desks).

## Interns (parallel work Jesus can read)
When you run parallel work, **spawn intern(s)** on your slice:
- `label` — short name on the map (e.g. "Sheet regen")
- `task` — what they’re doing
- `status` — same enum as main
- `atDeskId` — usually your desk; for permission asks use `jesusDeskId`

### Permission rule
`needs_permission` only counts when an intern has `atDeskId === jesusDeskId`. Chat alone is not Campus permission UX.

## Status enum
`idle` | `working` | `ready_for_review` | `needs_permission` | `reviewing` | `collaborating`

Researchers use `working` while researching (optional task prefix like "Research: …"). There is no separate `researching` status.

## Cast / sprites
- `castFolder` — folder under `casts/` for this bot
- `sprites` — map status → image path (idle/working/ready_for_review/needs_permission/reviewing/collaborating + intern)

Dev A wires these into campus-live. Bot ids: `leader`, `deva`, `devb`, `devc`, `rendera`, `renderb`, `renderc`, `researchera`, `researcherb`, `profilea`, `profileb`.

## Patch steps (every bot, every status change)
1. Read `campus-state.json`
2. Find your entry in `bots[]`
3. Update only that object (status/task/main/interns)
4. Bump your `updatedAt` and root `updatedAt`
5. Write publish copies immediately (phone poll ~2s)

## deploys[]
Owned by the bot shipping that deploy id. Fields: id, repo, branch?, label, status (`building`|`ready`|`failed`), pagesUrl, repoUrl, checkUrl?, note?, updatedAt, updatedBy?.
