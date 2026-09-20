# SpriteForge (CampusCast) — Sprite Manifest

**Bot:** SpriteForge (green core #3)  
**Generated:** 2026-09-20 PT  
**Style:** Chibi / desk-readable, flat cel, thick outline, clearer 3/4 front, short visible neck, true transparent BG  
**Held gear:** UNARMED (coral paint-dot is chest badge/pin only)

## Generation note
`GenerateImage` was **not available** in this executor subagent session (no MCP image tools). Frames were produced with a **bible-locked Pillow cel renderer** (`render_spriteforge.py`), patterned after LeaderSupport’s `render_leader_support.py`, with SpriteForge violet/coral palette, messy artist tuft, paint-smudge cheek, and a short neck connecting head to torso. Ready for SpriteForgeSupport PASS/FAIL; if AI-gen re-render is required later, use hero ref + bible on GenerateImage.

## Files

| File | Role | Notes |
|------|------|-------|
| `/workspace/campus-cast/spriteforge/BIBLE.md` | Locked character bible | Verbatim source for prompts/renderer |
| `/workspace/campus-cast/spriteforge/spriteforge_hero_ref.png` | Canonical hero ref | Neutral idle, 3/4 front, short neck, 512×512 RGBA |
| `/workspace/campus-cast/spriteforge/spriteforge_desk_idle.png` | Desk idle | Same pose family as hero ref |
| `/workspace/campus-cast/spriteforge/spriteforge_desk_working.png` | Working | Lean forward, arms toward desk |
| `/workspace/campus-cast/spriteforge/spriteforge_ready_review.png` | Ready for review | Friendly raised-hand wave |
| `/workspace/campus-cast/spriteforge/spriteforge_needs_permission.png` | Needs permission | Alert face + yellow ! badge |
| `/workspace/campus-cast/spriteforge/spriteforge_intern_idle.png` | Mini intern idle | ~70% scale, same ratios |
| `/workspace/campus-cast/spriteforge/preview_strip.png` | Dark-bg montage | All 6 frames left→right |
| `/workspace/campus-cast/spriteforge/render_spriteforge.py` | Repro renderer | Deterministic cel pipeline |

## QC checklist (vs hero ref)

| Frame | Silhouette | Palette (violet + coral) | Signature (violet scarf + coral paint-dot pin) | Short neck | Facing 3/4 | Clean alpha | Result |
|-------|------------|--------------------------|------------------------------------------------|------------|------------|-------------|--------|
| hero_ref | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ corner (0,0,0,0) | PASS (canonical) |
| desk_idle | ✓ identical to hero | ✓ | ✓ | ✓ | ✓ | ✓ | PASS (byte-match hero) |
| desk_working | ✓ lean + desk reach | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| ready_review | ✓ wave arm up | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| needs_permission | ✓ + alert ! badge | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| intern_idle | ✓ same proportions ~70% | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |

## Distinctness
- vs **Leader** (deep green #1B7A4A + gold): SpriteForge uses violet #7C3AED + coral #F97316 — green pixel hits ≈ 0 on hero.
- vs **LeaderSupport** (teal #0D9488 + silver): SpriteForge uses violet + coral — teal pixel hits ≈ 0 on hero.
- Extra identity: dark-purple artist tuft + cheek paint smudge (Leader/LeaderSupport lack these).

## Regens
1. **v1→v2:** Thickened coral paint-dot pin (r≈22, mid ring + drip) for phone-map readability per bible; confirmed neck stub + 3/4 body turn; intern height ratio ≈0.694; all RGBA corners transparent.

No QC failures remaining at ship. Hero and desk_idle intentionally identical (neutral idle).

## Handoff
Ready for **SpriteForgeSupport** consistency QC / PASS-FAIL before Campus Live ship.
