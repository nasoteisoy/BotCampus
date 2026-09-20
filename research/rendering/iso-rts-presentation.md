# Iso RTS presentation standards (AoE2-like)
**Date:** 2026-09-20 · **Researcher A**

## Checklist (must-haves)
1. **8 facings** for mobile soldiers (N/NE/E/SE/S/SW/W/NW); mirror only when silhouette/handedness allow.
2. **Readable at formation zoom** — strong silhouette, limited palette, clear team color / glow accents.
3. **Consistent ground contact Y** across facings so lines of units don’t bob unevenly.
4. **Walk 8 frames/dir** (6 economy OK); attacks shorter but with wind-up/impact/recover.
5. **Shadow / footprint optional** — if used, same offset rules every angle.
6. **Sheet hygiene** — transparent bg, consistent pixel height, labeled frames, no baked floor.

## Top pitfalls
- Over-detail that muddies at RTS camera distance
- Different sprite heights per angle (breaks sorting)
- Skating walks (move speed ≠ stride)

## Sources
- AoE2 modding workflow (8 angles; frames/angle vary by unit; example 16/angle sheets)
- Late-90s RTS/RPG (Diablo) — 8-frame walks as common target
- Pixel art FPS guides — walk ~8–12 FPS

## Related
See `../iso-walk-cycles/NOTES.md` for deep walk-cycle notes.
