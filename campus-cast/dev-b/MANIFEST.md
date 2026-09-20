# Dev B (aliases LiveOps, Dev 3) — Sprite Manifest

**Bot:** Dev B (green core #6; aliases **LiveOps**, **Dev 3**)  
**Generated:** 2026-09-20 ~11:40 AM PT  
**Style:** Chibi / desk-readable, flat cel, thick outline, clearer 3/4 front, short connected neck (chin→scarf closed on lean), true transparent BG  
**Held gear:** UNARMED (cyan pulse/dot pin is chest badge only)

## Generation note
`GenerateImage` was **not available** in this executor subagent session (no MCP image tools). Frames were produced with a **bible-locked Pillow cel renderer** (`render_devb.py`), patterned after Dev 2’s `render_dev2.py` / SpriteForgeSupport pipeline, with Dev B rose/cyan palette, black short neat hair, cyan pulse/dot pin, calm focused eyes + small confident smile, and a short neck that stays joined on working lean (head locked to `body_cx` with fixed 3/4 offset + trapezoid neck embedded into scarf). Ready for Campus Live ship; if AI-gen re-render is required later, use hero ref + bible on GenerateImage.

## Files

| File | Role | Notes |
|------|------|-------|
| `/workspace/campus-cast/dev-b/BIBLE.md` | Locked character bible | Verbatim source; notes aliases LiveOps, Dev 3 |
| `/workspace/campus-cast/dev-b/devb_hero_ref.png` | Canonical hero ref | Neutral idle, 3/4 front, short neck, 512×512 RGBA |
| `/workspace/campus-cast/dev-b/devb_desk_idle.png` | Desk idle | Same pose family as hero ref |
| `/workspace/campus-cast/dev-b/devb_desk_working.png` | Working | Lean forward, arms toward desk; **neck join closed** |
| `/workspace/campus-cast/dev-b/devb_ready_review.png` | Ready for review | Calm raised-hand wave |
| `/workspace/campus-cast/dev-b/devb_needs_permission.png` | Needs permission | Alert face + yellow ! badge |
| `/workspace/campus-cast/dev-b/devb_intern_idle.png` | Mini intern idle | ~70% scale, same ratios |
| `/workspace/campus-cast/dev-b/preview_strip.png` | Dark-bg montage | All 6 frames left→right |
| `/workspace/campus-cast/dev-b/render_devb.py` | Repro renderer | Deterministic cel pipeline |

## QC checklist (vs hero ref)

| Frame | Silhouette | Palette (rose + cyan) | Signature (rose scarf + cyan pulse pin) | Short neck closed | Facing 3/4 | Clean alpha | Result |
|-------|------------|----------------------|------------------------------------------|-------------------|------------|-------------|--------|
| hero_ref | ✓ | ✓ rose=309 cyan=97 | ✓ | ✓ chin→scarf bridge closed | ✓ | ✓ corner (0,0,0,0) | PASS (canonical) |
| desk_idle | ✓ identical to hero | ✓ | ✓ | ✓ | ✓ | ✓ | PASS (byte-match hero) |
| desk_working | ✓ lean + desk reach | ✓ rose=263 cyan=90 | ✓ | ✓ **0 gap rows** (33/33 neck-zone cols) | ✓ | ✓ | PASS |
| ready_review | ✓ wave arm up | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| needs_permission | ✓ + alert ! badge | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| intern_idle | ✓ same proportions ~70% | ✓ rose=165 cyan=66 | ✓ | ✓ | ✓ | ✓ | PASS |

## Distinctness
- vs **Leader** (deep green #1B7A4A + gold): Dev B uses rose #E11D48 + cyan #22D3EE — leader-green/gold pixel hits = 0 on hero.
- vs **Support1 / DevC** (teal #0D9488 + silver): Dev B uses rose + cyan — teal pixel hits = 0 on hero.
- vs **RenderA** (violet #7C3AED + coral #F97316): Dev B uses rose + cyan — violet/coral (tol15) pixel hits = 0 on hero; black neat hair (no artist tuft); cyan pulse pin (not coral paint-dot).
- vs **RenderC** (amber #F59E0B + indigo #4338CA): Dev B uses rose + cyan — amber/indigo (tol15) pixel hits = 0 on hero; black hair (not sandy blond); cyan pulse pin (not indigo QC magnifier).
- vs **DevA / Dev 2** (sky #0EA5E9 + lime #84CC16): Dev B uses rose + cyan — sky/lime (tol15) pixel hits = 0 on hero; black hair (not dark brown); cyan pulse pin (not lime wrench/gear); calm confident smile (not energetic grin).

## Regens / fixes
1. **v1:** Bible-locked Pillow cel from Dev 2 / SpriteForgeSupport pipeline; rose scarf + cyan pulse/dot pin; black short neat hair; calm focused face + small confident smile.
2. **Neck nit fix (inherited):** Working lean locks `head_cx = body_cx - 28s` (fixed 3/4 offset), seats chin into scarf on lean, trapezoid neck with wide base embedded into scarf. Working QC: **0 transparent gap rows** across chin→scarf bridge (33/33 neck-zone cols); mid-torso band fully opaque through neck zone.
3. **Pin polish:** Thick cyan badge with concentric pulse ring + core dot + white highlight for phone-map readability.
4. **Intern:** height ratio ≈0.694; all RGBA corners transparent.

No QC failures remaining at ship. Hero and desk_idle intentionally identical (neutral idle).

## Handoff
Dev B / LiveOps / Dev 3 (green core #6) sprite pack complete — ready for Campus Live.
