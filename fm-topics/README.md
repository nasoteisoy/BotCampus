# Field Marshal Topics

Minimal outside UI for multi-topic Field Marshal work. **No new bots.**

- Live (after Dev A push): https://nasoteisoy.github.io/BotCampus/fm-topics/
- Data: `topics.json`
- UI: `index.html` (plain list → What / Summary / Left off → Open & copy context)

App deep link is only `grokbot://app/v1/agent?id=<uuid>` — no prefilled message. Button copies opener text then opens FM; user pastes once.

## Topic fields

- `id`, `title`
- `what` — what this topic is
- `summary` — summary of everything so far
- `leftOff` — where we left off (so Chumi never has to re-read chats)
- `note` — combined fallback of the three (for older clients)
- `updatedAt`

## Create / rename / update notes

1. Chumi tells Field Marshal the change.
2. Field Marshal asks Dev B to patch `topics.json` (and `index.html` only if UI changes).
3. Dev B commits only `fm-topics/` files.
4. **Dev A** sole-pushes BotCampus Pages.
