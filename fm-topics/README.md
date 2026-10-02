# Field Marshal Topics

Minimal outside UI for multi-topic Field Marshal work. **No new bots.**

- Live (after Dev A push): https://nasoteisoy.github.io/BotCampus/fm-topics/
- Data: `topics.json`
- UI: `index.html` (plain list → Open Field Marshal)

## Create / rename

1. Chumi tells Field Marshal the title change.
2. Field Marshal asks Dev B to patch `topics.json`.
3. Dev B commits only `fm-topics/` files.
4. **Dev A** sole-pushes BotCampus Pages.

Schema per topic: `id`, `title`, `note`, `updatedAt`.
