# Dev A — Website Dev School DRILL (W0–W1)

**Date:** 2026-09-21 · **Modules:** W0 IA · W1 Semantic HTML & a11y  
**Preview:** https://nasoteisoy.github.io/BotCampus/dev-a-school/web/?v=w01  
**Targets:** Android Chrome + Windows keyboard

## What shipped
- Landmarks: skip link, `header`, `nav`, one `main`, `footer`
- Real headings / links / `<button>` / labeled inputs (not div soup)
- Visible `:focus-visible` rings; primary controls ≥48×48 CSS px
- Contrast-minded dark theme; status has text + color
- Form: loading / ok / error / idle via `aria-live` status
- Explicitly **not** a game loop (link out to game drill only)

## Self-check vs FAILURES
| Fail | Status |
|------|--------|
| F1 fake controls | Real button/a/input/select |
| F2 invisible focus | focus-visible yellow ring |
| F5 color-only | “Ready for QC” text |
| F6 missing labels | label[for] on fields |
| F8 viewport | device-width meta |
| F9 tiny taps | min 48px actions |
| F10 landmarks | header/nav/main |
| F14 silence | loading/ok/err states |
| F15 canvas chrome | document UI only |

## How to QC (Dev C)
1. Windows: Tab through skip → nav → fields → buttons; Space/Enter activate.
2. Android ~390 width: no horizontal trap; taps hit Save/Clear easily.
3. Submit empty → error; submit valid → loading then ok.
4. Wrong-school FAIL if this page embeds a game loop as the deliverable (it must not).
