# Dev 2 (alias CampusDev) — Sprite Manifest

**Bot:** Dev 2 (green core #5; alias **CampusDev**)  
**Generated:** 2026-09-20 ~11:36 AM PT  
**Style:** Chibi / desk-readable, flat cel, thick outline, clearer 3/4 front, short connected neck (chin→scarf closed on lean), true transparent BG  
**Held gear:** UNARMED (lime wrench/gear pin is chest badge only)

## Generation note
`GenerateImage` was **not available** in this executor subagent session (no MCP image tools). Frames were produced with a **bible-locked Pillow cel renderer** (`render_dev2.py`), patterned after SpriteForgeSupport’s `render_spriteforge_support.py`, with Dev 2 sky-blue/lime palette, dark-brown short practical hair, lime wrench/gear tool pin, friendly focused eyes + small grin, and a short neck that stays joined on working lean (head locked to `body_cx` with fixed 3/4 offset + trapezoid neck embedded into scarf). Ready for Campus Live ship; if AI-gen re-render is required later, use hero ref + bible on GenerateImage.

## Files

| File | Role | Notes |
|------|------|-------|
| `/workspace/campus-cast/dev-2/BIBLE.md` | Locked character bible | Verbatim source; notes alias CampusDev |
| `/workspace/campus-cast/dev-2/dev2_hero_ref.png` | Canonical hero ref | Neutral idle, 3/4 front, short neck, 512×512 RGBA |
| `/workspace/campus-cast/dev-2/dev2_desk_idle.png` | Desk idle | Same pose family as hero ref |
| `/workspace/campus-cast/dev-2/dev2_desk_working.png` | Working | Lean forward, arms toward desk; **neck join closed** |
| `/workspace/campus-cast/dev-2/dev2_ready_review.png` | Ready for review | Friendly raised-hand wave |
| `/workspace/campus-cast/dev-2/dev2_needs_permission.png` | Needs permission | Alert face + yellow ! badge |
| `/workspace/campus-cast/dev-2/dev2_intern_idle.png` | Mini intern idle | ~70% scale, same ratios |
| `/workspace/campus-cast/dev-2/preview_strip.png` | Dark-bg montage | All 6 frames left→right |
| `/workspace/campus-cast/dev-2/render_dev2.py` | Repro renderer | Deterministic cel pipeline |

## QC checklist (vs hero ref)

| Frame | Silhouette | Palette (sky + lime) | Signature (sky scarf + lime tool pin) | Short neck closed | Facing 3/4 | Clean alpha | Result |
|-------|------------|----------------------|----------------------------------------|-------------------|------------|-------------|--------|
| hero_ref | ✓ | ✓ sky=309 lime=103 | ✓ | ✓ chin→scarf bridge closed | ✓ | ✓ corner (0,0,0,0) | PASS (canonical) |
| desk_idle | ✓ identical to hero | ✓ | ✓ | ✓ | ✓ | ✓ | PASS (byte-match hero) |
| desk_working | ✓ lean + desk reach | ✓ | ✓ | ✓ **0 gap rows** (53/53 dual cols) | ✓ | ✓ | PASS |
| ready_review | ✓ wave arm up | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| needs_permission | ✓ + alert ! badge | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| intern_idle | ✓ same proportions ~70% | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |

## Distinctness
- vs **Leader** (deep green #1B7A4A + gold): Dev 2 uses sky #0EA5E9 + lime #84CC16 — leader-green pixel hits = 0 on hero.
- vs **Support1 / LeaderSupport** (teal #0D9488 + silver): Dev 2 uses sky + lime — teal pixel hits = 0 on hero.
- vs **Dev1 / SpriteForge** (violet #7C3AED + coral #F97316): Dev 2 uses sky + lime — violet/coral (tol15) pixel hits = 0 on hero; dark-brown practical hair (no artist tuft/paint smudge); lime wrench/gear pin (not coral paint-dot).
- vs **Support2 / SpriteForgeSupport** (amber #F59E0B + indigo #4338CA): Dev 2 uses sky + lime — amber/indigo (tol15) pixel hits = 0 on hero; dark-brown hair (not sandy blond); lime tool pin (not indigo QC magnifier).

## Regens / fixes
1. **v1:** Bible-locked Pillow cel from SpriteForgeSupport pipeline; sky-blue scarf + lime wrench/gear pin; dark brown short practical hair; friendly focused face + small grin.
2. **Neck nit fix (inherited):** Working lean locks `head_cx = body_cx - 28s` (fixed 3/4 offset), seats chin into scarf on lean, trapezoid neck with wide base embedded into scarf. Working QC: **0 transparent gap rows** across chin→scarf bridge; mid-torso band fully opaque through neck zone.
3. **Pin polish:** Thick lime badge with gear hub + white wrench overlay for phone-map readability.
4. **Intern:** height ratio ≈0.694; all RGBA corners transparent.

No QC failures remaining at ship. Hero and desk_idle intentionally identical (neutral idle).

## Handoff
Dev 2 / CampusDev (green core #5) sprite pack complete — ready for Campus Live. **Do not start Dev 3.**
