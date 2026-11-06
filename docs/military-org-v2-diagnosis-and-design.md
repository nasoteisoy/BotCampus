# Military Org v1 diagnosis → v2 design

## Root-cause findings (live UI, 2026-11-06)

Evidence: live desktop screenshot shows zoom **48%**; SVG viewBox ~2172×770; `fitWidth()` scales the whole force into the viewport. Node titles/details call `truncate(..., 34/36)` — 6/14 Black Guard subtitles end in `…`.

1. **Fit-to-entire-force** (`military.js` `fitWidth`) is the primary squash: readable card text becomes ~half size so the whole tree fits.
2. **Whole-org SVG at once** forces every level into one scene → cards stay tiny (~240×78) with truncated copy → user cannot learn what a Banner/Company/Platoon *is*.
3. **No unit education**: labels are names only; no glossary; no “what it does / who reports / size”.
4. **Phone** avoids SVG scale but still nests the full tree in `<details>` without focused drill-down or roomy role prose.
5. Cosmetic CSS tweaks cannot fix this: the information architecture (show everything scaled) is wrong.

## Approved v2 direction (Chumi: go all out, non-canon OK)

Roomy **army explorer**, one command level at a time:
- Breadcrumb of ancestors + Back / Force overview
- Focus card: unit type, leader, strength (CONFIRMED or PROPOSED), plain-language what/contains/function
- Subordinate branch cards to drill into
- Desktop: wide cards + detail panel; Phone: full-width vertical cards (no miniature graph)
- Tabs: Black Guard / Empire / Desert enemy
- Glossary: division, banner, company, platoon, squad; military vs civil (Prefect)
- Flesh out proposed desert enemy chain + Imperial corps-style org; every invention marked **PROPOSED / NON-CANON**; locked canon always **CONFIRMED**
- No canon.json / questions / hold-batch writes; no discarded names; marker `story-military-org-v2`

## Canon anchors (must stay consistent)
- Banner ≈ few hundred; 4 companies; platoons 3/3/2/1; Guard = 5–8 Banners; **no formal regiments** in Guard

## Unit types (added mid-build)
Nine PROPOSED capabilities — Wardline Infantry, Chorus Engines, Gale Striders, Bastion Behemoths, Lantern Kites, Mercy Spinners, Echo Relays, Root Caravans, Purpose Desk — nest under Guard companies/staff without replacing the locked 4-company Banner. Empire and desert enemy get distinct flavor notes; desert gets proposed host/breach/train flesh under the Warrior King.
