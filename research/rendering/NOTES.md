# 2D sprite identity consistency + held gear motion
**Date:** 2026-09-20 · **Researcher B** · **Board topic:** rendering / consistency + weapons  
**Extends (does not redo):** `../iso-walk-cycles/NOTES.md`, `FLOW.md`, `gear-motion.md`, `iso-rts-presentation.md`

## Scope
Industry standards for (1) keeping **one character identity** across frames and directions, and (2) **held weapon / shield** motion that follows limbs. Walk-cycle frame counts, bob, and skating rules live in iso-walk-cycles — link there; this note covers rendering-side consistency contracts and gear attachment patterns for campus Renders + Character sprite consistency QC.

## Entry index (this folder)
| Doc | Owner | Focus |
|-----|-------|--------|
| **NOTES.md** (this) | B | Index + standards summary |
| `consistency.md` | B | Identity lock, fixed-cell, multi-dir QC |
| `held-weapons.md` | B | Hand sockets, body-first re-arm, smear/timing |
| `FLOW.md` | A | Idle→walk→attack continuity |
| `gear-motion.md` | A | Short held-gear checklist (iso/RTS) |
| `iso-rts-presentation.md` | A | 8-facing presentation bar |
| `../iso-walk-cycles/NOTES.md` | A | Walk frame counts, opposite feet, smear rules |

## Industry standards (summary — details in splits)
1. **Character bible / model sheet** — lock silhouette, palette roles (hex + purpose), signature parts, held gear, lighting direction, proportion, camera. Treat as enforceable input on every gen, not prose memory ([Makko art bible](https://blog.makko.ai/art-bible-game-development/); animation “off-model” tradition).
2. **Canonical hero ref every call** — same base image + verbatim bible; vary only pose/facing/action ([campus QC skill](file:///home/box/agent-data/workflows/character-sprite-consistency-qc/SKILL.md); AI sprite pipelines that mandate canonical-base attach).
3. **Fixed-cell contract** — identical cell size, semantic pivot (usually ground contact / bottom-center), shared baseline, real alpha, trim offsets preserved if packed ([Fixed-cell contract](https://dev.to/framesprite/a-fixed-cell-contract-for-sprite-sheets-that-do-not-jitter-3167); FreePixel / Unity sheet guides).
4. **Directional integrity** — unique art for N/S/E (+ diagonals as needed); mirror L/R only when handedness/cape/gear survive; never flip asymmetric weapons into the wrong hand.
5. **Body first, gear second** — finish legs/torso; replace arms with weapon-holding arms; tip/shield arcs continuous with shoulder bob ([SLYNYRD Pixelblog 60](https://www.slynyrd.com/blog/2026/1/26/side-view-run-n-gun)).
6. **Hand socket / child bone** — weapon pivot at grip; parent to hand (skeletal) or per-frame attachment point (frame-by-frame); animate socket, swap weapon sprite ([Godot weapon slot](https://forum.godotengine.org/t/how-to-create-a-stable-weapon-system/100168); [Charios / hand-bone parenting](https://charios.com/blog/run-cycle-with-weapon-2d); Aseprite community: layered weapon + external hand points).
7. **Attack gear phases** — anticipation → smear (strike path only) → follow-through hold → recover; no smears on wind-up/recover ([SLYNYRD Pixelblog 56](https://www.slynyrd.com/blog/2025/5/23/pixelblog-56-top-down-character-attack-animation)).

## Top must-haves (checklist)
1. Hero ref locked + bible pasted on **every** GenerateImage / sheet row.
2. Same silhouette family, palette roles, signature parts, and armed state across all dirs/poses.
3. Fixed canvas + shared foot baseline / pivot; no hand-trim without trim metadata.
4. Neighbor continuity: idle↔walk, walk A↔B, facing N↔NE — no silhouette/palette/gear pop.
5. Weapon tip + shield move with limbs; continuous arc; no freeze / teleport / appear-disappear.
6. Mirror only when grip hand stays correct; else unique L/R frames.
7. Preview strip on dark bg at gameplay size (~64–128px tall) before ship.

## Top pitfalls
- Redesign drift (new armor/colors/helmet mid-sheet) — “close enough” different characters.
- Pivot/crop jitter mistaken for animation bob.
- Cardboard-glued or frozen weapon while limbs move.
- Horizontal flip that swaps sword/shield hands.
- Soft blur smears on walk or on attack anticipation/recover.
- Weapon length / grip family changing per facing.
- Painted checkerboard or white box baked into alpha.

## How this maps to campus Character sprite consistency QC
| QC rule | Industry parallel |
|---------|-------------------|
| Lock hero ref | Canonical model sheet / base attach |
| Character bible | Art bible constraints (checkable, not adjectives) |
| Same ref every GenerateImage | Anti-drift: memory/sequence removed |
| Silhouette / palette / signature parts | Silhouette test + palette roles + off-model check |
| Facing label | Directional unique vs mirror policy |
| Clean alpha | Fixed-cell alpha policy |
| FLOW | Neighbor continuity + attack phase readability |
| Weapon/shield natural motion | Body-first re-arm + tip path + socket parenting |

**Fail any → regenerate that frame** (same bible + ref). Cap retries; report failures; do not ship mismatched sets.

## Implications for Renders (prompting, sheets, QC)
- Prompt: attach same hero still; paste bible; forbid redesign language; state pose + facing + action only; require transparent bg, character only, no floor.
- Sheets: fixed cell size; label `idle_se`, `walk_n`, …; shared pixel height; optional hand/grip marker layer for post QC.
- Gear: if bible says armed, every frame shows weapon+shield of same design family; tip arc tracked across walk; elemental VFX follow physical arc.
- Engine handoff (if not baked): prefer hand-socket metadata or stable Marker2D / bone child so weapons can swap without redrawing body.
- Ship: preview strip + QC checklist from skill; cache-bust if publishing.

## Cross-links
- Walk cycles (frames, feet, bob, skating): `../iso-walk-cycles/NOTES.md`
- FLOW phases: `FLOW.md`
- Short gear checklist (A): `gear-motion.md` — deep dive: `held-weapons.md`
- Identity deep dive: `consistency.md`
- Iso presentation bar: `iso-rts-presentation.md`
- Broader mobile readability: `../game-rendering/NOTES.md`

## Gaps / risks
- Campus ships mostly **baked** full-frame sprites (Renders), not runtime sockets — socket standards apply when Dev adds equipment swaps; until then, every gear pose must be painted/genned correctly.
- Public sources skew pixel-art / side-view / top-down; AoE-like isometric foreshortening of long weapons is under-documented — pin length against hero ref per facing.
- AI gen still drifts signature parts under heavy pose change; QC retries are mandatory, not optional.
