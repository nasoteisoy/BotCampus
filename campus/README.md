# Bot Campus — live state

Phone live view: [`../campus-live.html`](../campus-live.html)  
Live URL: https://nasoteisoy.github.io/BotCampus/campus-live.html?v=1

Source of truth: `campus-state.json` (polled every ~1s by the phone client).

## Ownership rules

- Each bot owns **one main sprite** at their desk and any **intern** mini-sprites they spawn.
- **Only the owning bot** may move or update their own main + intern sprites. Never edit another bot’s slice of `bots[]`.
- On any status change, the owning bot patches **only their object** and bumps top-level `updatedAt` (ISO).

## Statuses

| Status | Meaning |
|--------|---------|
| `idle` | At desk, nothing active |
| `working` | Doing a task |
| `ready_for_review` | Work waiting on Jesus or a support |
| `needs_permission` | **High alert** — must be an intern at Jesus’s desk |
| `reviewing` | Evaluating another bot’s work |
| `collaborating` | Meeting with another bot |

## Permission desk (critical)

Jesus will **not** treat something as needing permission unless he **sees an intern sprite at his desk** asking.

Chat alone is not enough. To request permission:

1. Spawn an intern on your bot: `{ "id": "…", "status": "needs_permission", "label": "short ask", "at": "jesus" }`
2. Leave your **main** at `"at": "desk"`.
3. When approved or denied, remove/update that intern and clear the alert.

## Deploy board (`deploys[]`)

The phone UI shows a card per entry. For GitHub Pages on this repo:

```json
{
  "id": "botcampus-pages",
  "repo": "nasoteisoy/BotCampus",
  "repoUrl": "https://github.com/nasoteisoy/BotCampus",
  "branch": "main",
  "status": "building",
  "label": "GitHub Pages",
  "pagesUrl": "https://nasoteisoy.github.io/BotCampus/",
  "checkUrl": "https://github.com/nasoteisoy/BotCampus/actions",
  "updatedAt": "ISO",
  "note": "Push in flight"
}
```

### When Pages finishes

Patch `deploys[0]` (or the matching `id`):

1. Right after push → `"status": "building"`, note like `"Deploying…"`, bump `updatedAt`.
2. When Pages is live → `"status": "ready"`, note like `"Last push live"`, bump `updatedAt`.
3. On failure → `"status": "failed"`, note with the error hint.

Helper script (from repo root or `campus/`):

```bash
./campus/update_deploy.sh building "Deploying campus-live"
./campus/update_deploy.sh ready "Last push live"
./campus/update_deploy.sh failed "Pages build error"
```

Or with `gh` (no script):

```bash
# after push
gh api repos/nasoteisoy/BotCampus/pages/builds/latest --jq .status
# built → ready · building → building · errored → failed
```

## Roles

- **CampusDev** — phone UI / layout / map
- **LiveOps** — schema, write conventions, ownership enforcement
- **Everyone else** — update only your own bot + interns; follow permission-desk rule
