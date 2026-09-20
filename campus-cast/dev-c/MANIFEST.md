# LeaderSupport (CampusCast) — Sprite Manifest

**Bot:** LeaderSupport (green core #2)  
**Generated:** 2026-09-20 PT  
**Style:** Chibi / desk-readable, flat cel, thick outline, clearer 3/4 front, short visible neck, true transparent BG  
**Held gear:** UNARMED (clipboard is chest badge/pin only)

## Generation note
`GenerateImage` was **not available** in this executor subagent session (no MCP image tools). Frames were produced with a **bible-locked Pillow cel renderer** (`render_leader_support.py`), patterned after Leader’s `render_leader.py`, with LeaderSupport palette/signature and a short neck connecting head to torso. Ready for SpriteForgeSupport PASS/FAIL; if AI-gen re-render is required later, use hero ref + bible on GenerateImage.

## Files

| File | Role | Notes |
|------|------|-------|
| `/workspace/campus-cast/leader-support/BIBLE.md` | Locked character bible | Verbatim source for prompts/renderer |
| `/workspace/campus-cast/leader-support/leader_support_hero_ref.png` | Canonical hero ref | Neutral idle, 3/4 front, short neck, 512×512 RGBA |
| `/workspace/campus-cast/leader-support/leader_support_desk_idle.png` | Desk idle | Same pose family as hero ref |
| `/workspace/campus-cast/leader-support/leader_support_desk_working.png` | Working | Lean forward, arms toward desk |
| `/workspace/campus-cast/leader-support/leader_support_ready_review.png` | Ready for review | Friendly raised-hand wave |
| `/workspace/campus-cast/leader-support/leader_support_needs_permission.png` | Needs permission | Alert face + yellow ! badge |
| `/workspace/campus-cast/leader-support/leader_support_intern_idle.png` | Mini intern idle | ~70% scale, same ratios |
| `/workspace/campus-cast/leader-support/preview_strip.png` | Dark-bg montage | All 6 frames left→right |
| `/workspace/campus-cast/leader-support/render_leader_support.py` | Repro renderer | Deterministic cel pipeline |

## QC checklist (vs hero ref)

| Frame | Silhouette | Palette (teal + silver) | Signature (teal scarf + silver clipboard pin) | Short neck | Facing 3/4 | Clean alpha | Result |
|-------|------------|-------------------------|-----------------------------------------------|------------|------------|-------------|--------|
| hero_ref | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ corner (0,0,0,0) | PASS (canonical) |
| desk_idle | ✓ identical to hero | ✓ | ✓ | ✓ | ✓ | ✓ | PASS (byte-match hero) |
| desk_working | ✓ lean + desk reach | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| ready_review | ✓ wave arm up | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| needs_permission | ✓ + alert ! badge | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |
| intern_idle | ✓ same proportions ~70% | ✓ | ✓ | ✓ | ✓ | ✓ | PASS |

## Regens
1. **v1→v2:** Shortened giraffe neck to stubby short visible neck; stronger 3/4 body turn (body_ox ↑, head offset); head seated closer to scarf.  
2. **v2 polish:** Confirmed neck gap ~35px face→scarf with narrow stub; teal/silver/hair/skin palette hits; intern height ratio ≈0.70; all RGBA corners transparent.

No QC failures remaining at ship. Hero and desk_idle intentionally identical (neutral idle).

## Handoff
Ready for **SpriteForgeSupport** consistency QC / PASS-FAIL before Campus Live ship.
