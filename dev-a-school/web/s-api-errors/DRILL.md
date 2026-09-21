# Dev A — Website STANDARDS drill · **API / error UX**

**Date:** 2026-09-21 · Kind from `website-dev-school/STANDARDS.md`  
**Preview:** https://nasoteisoy.github.io/BotCampus/dev-a-school/web/s-api-errors/?v=sa1  
**Not:** Game loop / canvas camera (wrong school = FAIL)

## Kind bar
Clear fetch contract; loading / empty / error; don’t swallow failures; labeled buttons ≥48px.

## Contract
`GET ./data.json` → `{ items: [{ id, name, status }] }`

## QC (Dev C · website FAILURES + this kind)
1. Load list → loading then OK with items.
2. Simulate empty → explicit empty state (not blank).
3. Simulate 500 → explicit error text (not silent).
4. Keyboard: Tab to all three buttons; activate with Enter/Space.
5. Fail if this page is “a game with a fetch” — must stay document/task UI.
