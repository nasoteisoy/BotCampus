# 2D character sprite identity consistency (frames / directions)
**Date:** 2026-09-20 · **Researcher B**  
**Parent index:** `NOTES.md` · **Do not redo:** walk-cycle counts → `../iso-walk-cycles/NOTES.md`

## Scope
Keeping **one** character across idle/walk/attack and 4/8 directions: silhouette, palette, signature parts, lighting, camera, cell/pivot. Not a full walk-cycle tutorial.

## Industry standards / common practices

### 1. Art bible / model sheet (identity lock)
- Animation tradition: multi-angle model sheet; violations called **off-model**.
- Game art bible = aesthetic rules + hard specs: palette with **roles** (hex + purpose), outline treatment, silhouette test size, head:body ratio, projection/camera, key-light direction, resolution/cell size, do-not-do list.
- Convert adjectives (“chunky”, “warm”) into checkable constraints (limb width px, hex list).
- Sources: [Makko — How to Write a Game Art Bible](https://blog.makko.ai/art-bible-game-development/) (silhouette as load-bearing; fixed lighting cheapest consistency win; TF2 silhouette paper cited); fighting-game practice of locked palette counts / lighting family (e.g. KoF 16-color discipline discussions).

### 2. Canonical reference on every generation
- One approved hero still (front or ¾) is the identity ground truth.
- Every sheet row / GenerateImage attaches **that** image and pastes the **same** bible; only pose, facing, action change.
- Idle is the canary: if helmet/shoulder width/backpack/crest drifts on idle breath frames, faster actions will be worse.
- Sources: campus Character sprite consistency QC skill; seeddance / AI sprite workflows emphasizing short identity anchors; character-sprite-maker SKILL pattern (canonical-base attach mandatory).

### 3. Fixed-cell / pivot contract (anti-jitter)
| Field | Contract |
|-------|----------|
| Cell W×H | Identical for every frame in an action |
| Pivot | Semantic: ground contact / bottom-center for grounded walks; not “visual center of opaque pixels” |
| Baseline | Shared foot Y across facings so formations don’t bob unevenly |
| Alpha | Real transparency — never painted checkerboard |
| Trim | Keep original size + X/Y offset if atlas-trimmed; never hand-trim then re-center |
| Order | Explicit row-major / named frames + loop policy |

Diagnostic: freeze world position + camera; overlay all frames; if still jittering, art/pivot/trim is wrong before blaming filtering.
- Sources: [Fixed-cell contract (DEV)](https://dev.to/framesprite/a-fixed-cell-contract-for-sprite-sheets-that-do-not-jitter-3167); [FreePixel sprite sheets](https://freepixel.art/blog/creating-smooth-character-animations-with-sprite-sheets); [Unity sheet practical guide](https://dev.to/nitin_808a59e08de0d0385ab/how-to-make-a-sprite-sheet-for-unity-a-practical-guide-2cak); [Atlas padding / trim metadata](https://imagemint.net/tutorials/sprite-atlas-packing).

### 4. Multi-direction policy
- Plan frame budget before drawing: 8 facings × N frames multiplies fast (AoE2-like / top-down).
- Prefer unique art for N, S, E (+ NE/SE…); horizontal flip W/NW/SW **only** if design is symmetric enough.
- Never flip when cape, team emblem, or held gear makes the mirror read as wrong hand / wrong facing.
- Neighbor dirs should interpolate: N↔NE silhouette and palette must not pop.
- Sources: FreePixel directional note; campus QC optional mirror rule; SLYNYRD 8-dir attack — weapon stays in same hand all angles ([Pixelblog 56](https://www.slynyrd.com/blog/2025/5/23/pixelblog-56-top-down-character-attack-animation)).

### 5. Lighting & detail hierarchy
- One key-light family for the whole sheet (same side/top bias).
- Detail on face / chest / weapon / signature crest; quiet elsewhere — detail everywhere = noise at RTS/phone zoom.
- Silhouette test at gameplay size (campus ~64–128px tall).

## Top must-haves
1. Locked hero ref path saved with the set.
2. Short bible: silhouette, palette roles, signature parts, held gear, style, camera.
3. Same ref + bible on every frame gen.
4. Fixed cell + shared baseline/pivot; clean alpha.
5. QC: silhouette, palette, signature parts, facing, alpha, FLOW vs neighbors.
6. Preview strip on dark bg before ship.

## Top pitfalls
- Treating “similar” as “same character.”
- Per-frame redesign words in prompts (“new armor”, “reimagine”).
- Different lighting or outline weight per facing.
- Crop-to-opaque without trim metadata → bounce.
- Mirroring armed / asymmetric units.
- Over-detail that dies at map/phone scale.

## Map to campus QC skill
Direct 1:1 with skill sections Before generating / Prompt rules / QC loop items 1–6. This note supplies the **industry why** and fixed-cell packaging rules the skill assumes when shipping sheets.

## Implications for Renders
- Prompt discipline > fancy style words.
- Name outputs by facing+action; reject unlabeled grids.
- After gen: punch alpha, crop to shared height, overlay-check baseline.
- If a facing fails silhouette/palette/signature — regenerate that facing only; do not “average” the sheet toward the bad frame.

## Cross-links
- `NOTES.md` · `held-weapons.md` · `FLOW.md` · `../iso-walk-cycles/NOTES.md` · `iso-rts-presentation.md`
