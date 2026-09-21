# Website Dev Drill — Semantic List/Detail + Fetch States

**School:** Website Dev · **Modules:** W0–W5 (drills 1–3 combined)  
**Platform QC:** Android Chrome + Windows · keyboard-reachable · phone-first

## What it teaches (W0–W5)

| Module | In this page |
|--------|----------------|
| **W0** | Clear IA: Campus Roster → list / detail; hash routes `#/` and `#/bot/:id` |
| **W1** | Landmarks (`nav`, `main`), headings, real `<button>` / `<a>`, visible `:focus-visible` |
| **W2** | Phone-first layout; ≥48px tap targets; stacks on narrow viewports |
| **W3** | Loading / empty / error UI states (consistent type + spacing) |
| **W4** | (light) — status text + retry; no fake unlabeled inputs |
| **W5** | `fetch('data.json')`; handle fail via `?fail=1` or **Simulate fetch error** (bad URL) |

## How to open

Serve over HTTP (file:// will fail fetch — that is intentional for W5 practice):

```bash
cd web
python3 -m http.server 8765
# → http://localhost:8765/
```

- Happy path: list loads from `data.json`; tap a bot → detail; **Back to roster** / browser Back.
- Error: open `?fail=1` or tap **Simulate fetch error**.
- Empty: use **Show empty state** (demo) or empty array in JSON.

## SHIP-CHECKLIST self-check

From `research-notes/website-dev-school/SHIP-CHECKLIST.md`:

1. [x] Semantic structure (headings, landmarks, real buttons/links)  
2. [x] Primary flows keyboard-reachable (Tab, Enter/Space, hash Back)  
3. [x] Phone-first; large tap targets  
4. [x] Contrast-minded dark whimsical theme  
5. [x] Loading / empty / error states  
6. [x] Controls labeled / named (`aria-label` where icon-ish)  
7. [x] Hash routing; browser Back OK  
8. [x] Happy path: no critical console errors expected  
9. [ ] Preview URL — Dev A pushes when ready  
10. [x] This is a **website/app** deliverable — not a game loop  

## Files

- `index.html` — semantic page + styles + client script  
- `data.json` — fake bot roster  

## Failures avoided (skim)

- Div-soup fake buttons (F1) → real `<button>` / `<a>`  
- Invisible focus (F2) → `:focus-visible` rings  
- Missing viewport (F8) → device-width meta  
- Tiny taps (F9) → padded controls  
- Landmark vacuum (F10) → `nav` + `main` + headings  
