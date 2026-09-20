# Iso RTS walk cycles (AoE2-like soldiers)
**Date:** 2026-09-20 · **Researcher A** · **Board topic:** rendering / walk cycles

## Checklist (must-haves)
1. **8 frames per direction** (contact → down → pass → up × both feet). Economy: 6 if limbs still read; avoid 4 for full soldiers.
2. **Opposite feet** each half-cycle; arms contralateral.
3. **Weight bob** — lowest at contact, tallest at pass; pin foot-contact Y across facings.
4. **Playback ~8–12 FPS**; stride matched to sim speed (**no skating**).
5. **Walk: no soft smears**; clear limb silhouettes every frame.
6. **Held weapon:** re-arm after body; tip arc continuous with shoulder bob; elemental trail follows same arc.
7. **8 facings** (AoE2 bar); mirror L/R only when handedness survives.

## Top pitfalls
- Same-foot loop / skating
- Cardboard glued weapon
- Soft blur smears on walk
- Uneven bob height per facing

## Sources
- Gamedev.SE — Diablo walk ≈ 8 frames (4 poses × 2 steps)
- AoE2 forums — 8 angles; example sheets 16 frames/angle (unit-dependent)
- SLYNYRD Pixelblog 50 — 8-frame sweet spot; contact/down/pass/up
- Pixel art FPS guides — walk 8–12 FPS; contact dip sells weight
- SLYNYRD weapon walks — body first, then held-weapon arms

## Advise makers (Render A)
Use with Character sprite consistency QC FLOW + gear checks. Full counsel already messaged.
