# Campus state protocol (LiveOps)

Source of truth for the phone live Bot Campus: `campus-state.json`.

## Canonical paths
- Working: `/workspace/bot-campus/campus-state.json` (+ `liveops/` docs)
- **Pages publish tree:** `/workspace/bot-campus-publish/campus/campus-state.json` (keep in sync — this feeds `nasoteisoy/BotCampus`)
- LiveOps must update **both** trees when the schema or seed changes.

## Ownership (hard)
- Each bot may update **only** their object in `bots[]` (matched by `id` / `agentId`).
- That includes their `main` sprite and their `interns[]`.
- **Never** move, create, or delete another bot’s main/interns.
- **Never** rewrite another bot’s `status` / `task` / `updatedAt`.
- Desk layout (`desks[]`) and `jesusDeskId` are owned by **LiveOps** (+ CampusDev for layout). Genre bots don’t edit desks.

## Permission rule
`needs_permission` only counts for Jesus when an **intern** from the requesting bot has `atDeskId === jesusDeskId`. Chat alone is not Campus permission UX.

## How to patch your slice
1. Read `campus-state.json`.
2. Find `bots[i]` where `id` is you (or `agentId` matches).
3. Change only that object’s fields + its `interns`.
4. Set `bots[i].updatedAt` and document root `updatedAt` to now (ISO-8601).
5. Write the file back immediately (target: phone feels live within ~1s).

### Pseudo-API (for CampusDev writers / Pages)
- `GET /campus-state.json` — full document
- `PATCH /bots/:botId` — body is a partial bot slice; server merges **only if** caller owns `:botId`
- Reject cross-bot writes

## Status enum
`idle` | `working` | `ready_for_review` | `needs_permission` | `reviewing` | `collaborating`

## Intern placement
- Default: `atDeskId` = owner’s `deskId`
- Meeting: both bots’ interns share a meeting desk / courtyard desk id
- Permission ask: set intern `status=needs_permission` and `atDeskId=jesusDeskId`


## Deploy board (`deploys[]`)
Phone strip so Jesus sees Pages/GitHub status and can tap through.

Fields per entry: `id`, `repo` (owner/name), `branch?`, `label`, `status` (`building`|`ready`|`failed`), `pagesUrl`, `repoUrl` (optional alias `checkUrl` = repoUrl), `note?`, `updatedAt`, `updatedBy?`.

### Who writes deploys
- The bot (or CI) that owns that deploy `id` updates it when a push/Pages build starts or finishes.
- Example: CampusDev owns `botcampus-pages`.
- Do **not** invent extra top-level boards — keep one `deploys[]` array.

### Poll (phone UI)
- Poll `campus-state.json` every **2s** (1s if hosting allows; feel-live target ~1–2s).
- Highlight `needs_permission` interns where `atDeskId === jesusDeskId`.
- Render `deploys[]` as a strip with status chip + links to `pagesUrl` / `repoUrl`.
