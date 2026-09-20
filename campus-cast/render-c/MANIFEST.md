# SpriteForgeSupport (CampusCast) — Sprite Manifest

**Bot:** SpriteForgeSupport (green core #4)  
**Generated:** 2026-09-20 PT  
**Style:** Chibi / desk-readable, flat cel, thick outline, clearer 3/4 front, short connected neck (chin→scarf closed on lean), true transparent BG  
**Held gear:** UNARMED (indigo QC pin is chest badge only)

## Generation note
`GenerateImage` was **not available** in this executor subagent session (no MCP image tools). Frames were produced with a **bible-locked Pillow cel renderer** (`render_spriteforge_support.py`), patterned after SpriteForge’s `render_spriteforge.py`, with SpriteForgeSupport amber/indigo palette, sandy-blond neat hair, indigo magnifying-glass/checkmark QC pin, attentive eyes, and a short neck that stays joined on working lean (SpriteForge nit fix: head locked to `body_cx` with fixed 3/4 offset + trapezoid neck embedded into scarf). Ready for Campus Live ship; if AI-gen re-render is required later, use hero ref + bible on GenerateImage.

## Files

| File | Role | Notes |
|------|------|-------|
| `/workspace/campus-cast/spriteforge-support/BIBLE.md` | Locked character bible | Verbatim source for prompts/renderer |
| `/workspace/campus-cast/spriteforge-support/spriteforge_support_hero_ref.png` | Canonical hero ref | Neutral idle, 3/4 front, short neck, 512×512 RGBA |
| `/workspace/campus-cast/spriteforge-support/spriteforge_support_desk_idle.png` | Desk idle | Same pose family as hero ref |
| `/workspace/campus-cast/spriteforge-support/spriteforge_support_desk_working.png` | Working | Lean forward, arms toward desk; **neck join closed** |
| `/workspace/campus-cast/spriteforge-support/spriteforge_support_ready_review.png` | Ready for review | Friendly raised-hand wave |
| `/workspace/campus-cast/spriteforge-support/spriteforge_support_needs_permission.png` | Needs permission | Alert face + yellow ! badge |
| `/workspace/campus-cast/spriteforge-support/spriteforge_support_intern_idle.png` | Mini intern idle | ~70% scale, same ratios |
| `/workspace/campus-cast/spriteforge-support/preview_strip.png` | Dark-bg montage | All 6 frames left→right |
| `/workspace/campus-cast/spriteforge-support/render_spriteforge_support.py` | Repro renderer | Deterministic cel pipeline |

## QC checklist (vs hero ref)

| Frame | Silhouette | Palette (amber + indigo) | Signature (amber scarf + indigo QC pin) | Short neck closed | Facing 3/4 | Clean alpha | Result |
|-------|------------|--------------------------|------------------------------------------|-------------------|------------|-------------|--------|
| hero_ref | ✓ | ✓ | ✓ | ✓ chin−scarf=9px stub | ✓ | ✓ corner (0,0,0,0) | PASS (canonical) |
| desk_idle | ✓ identical to hero | ✓ | ✓ | ✓ | ✓ | ✓ | PASS (byte-match hero) |
| desk_working | ✓ lean + desk reach | ✓ | ✓ | ✓ **0 gap rows** (nit fix) | ✓ | ✓ | PASS |
| ready_review | ✓ wave arm up | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| needs_permission | ✓ + alert ! badge | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| intern_idle | ✓ same proportions ~70% | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |

## Distinctness
- vs **Leader** (deep green #1B7A4A + gold): SpriteForgeSupport uses amber #F59E0B + indigo #4338CA — green pixel hits = 0 on hero.
- vs **LeaderSupport** (teal #0D9488 + silver): SpriteForgeSupport uses amber + indigo — teal pixel hits = 0 on hero.
- vs **SpriteForge** (violet #7C3AED + coral #F97316): SpriteForgeSupport uses amber + indigo — violet/coral (tol15) pixel hits = 0 on hero; sandy-blond neat hair (no artist tuft/paint smudge); indigo magnifier/check pin (not coral paint-dot).

## Regens / fixes
1. **v1:** Bible-locked Pillow cel from SpriteForge pipeline; amber scarf + indigo QC pin; sandy blond neat hair; attentive approving face.
2. **Neck nit fix (SpriteForge):** Working lean previously grew head↔body delta (~28→48px) and could open chin→scarf. Fix: lock `head_cx = body_cx - 28s` (fixed 3/4 offset), seat chin into scarf on lean, trapezoid neck with wide base embedded into scarf. Working QC: **0 transparent gap rows** across chin→scarf bridge; chin−scarf stub = 9px (matches SpriteForge idle stub).
3. **Pin polish:** Thickened indigo magnifying-glass + white checkmark for phone-map readability.
4. **Intern:** height ratio ≈0.694; all RGBA corners transparent.

No QC failures remaining at ship. Hero and desk_idle intentionally identical (neutral idle).

## Handoff
SpriteForgeSupport (green core #4) sprite pack complete — ready for Campus Live.
