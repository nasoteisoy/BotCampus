# Leader (CampusCast) — Sprite Manifest

**Bot:** Leader (first of green core six)  
**Generated:** 2026-09-20 PT  
**Style:** Chibi / desk-readable, flat cel, thick outline, 3/4 front, true transparent BG  
**Held gear:** UNARMED  

## Generation note
`GenerateImage` was **not available** in this executor subagent session (`isGenerateImageEnabled=false`; no MCP image tools). Frames were produced with a **bible-locked Pillow cel renderer** (`render_leader.py`) so silhouette, palette, and signature parts stay identical across poses. Ready for SpriteForgeSupport PASS/FAIL; if AI-gen re-render is required later, use hero ref + bible on GenerateImage.

## Files

| File | Role | Notes |
|------|------|-------|
| `/workspace/campus-cast/leader/BIBLE.md` | Locked character bible | Verbatim source for prompts/renderer |
| `/workspace/campus-cast/leader/leader_hero_ref.png` | Canonical hero ref | Neutral idle, 3/4 front, 512×512 RGBA |
| `/workspace/campus-cast/leader/leader_desk_idle.png` | Desk idle | Same pose family as hero ref |
| `/workspace/campus-cast/leader/leader_desk_working.png` | Working | Lean forward, arms toward desk |
| `/workspace/campus-cast/leader/leader_ready_review.png` | Ready for review | Friendly raised-hand wave |
| `/workspace/campus-cast/leader/leader_needs_permission.png` | Needs permission | Alert face + yellow ! badge |
| `/workspace/campus-cast/leader/leader_intern_idle.png` | Mini intern idle | ~70% scale, same head ratio, simplified hands |
| `/workspace/campus-cast/leader/preview_strip.png` | Dark-bg montage | All 6 frames left→right |
| `/workspace/campus-cast/leader/render_leader.py` | Repro renderer | Deterministic cel pipeline |

## QC checklist (vs hero ref)

| Frame | Silhouette | Palette | Signature (green scarf + gold pin) | Facing 3/4 | Clean alpha | Result |
|-------|------------|---------|--------------------------------------|------------|-------------|--------|
| hero_ref | ✓ | ✓ | ✓ | ✓ | ✓ corner (0,0,0,0) | PASS (canonical) |
| desk_idle | ✓ identical to hero | ✓ | ✓ | ✓ | ✓ | PASS (byte-match hero) |
| desk_working | ✓ lean shift | ✓ | ✓ | ✓ | ✓ | PASS after pose regen ×2 |
| ready_review | ✓ wave arm up | ✓ | ✓ | ✓ | ✓ | PASS after wave regen ×2 |
| needs_permission | ✓ + alert badge | ✓ | ✓ | ✓ | ✓ | PASS |
| intern_idle | ✓ same proportions, smaller | ✓ | ✓ | ✓ | ✓ | PASS |

## Regens
1. **v1→v2:** Stronger scarf-at-neck placement, clearer 3/4, alert mouth/badge.  
2. **v2→v3:** Dramatic wave (arm above head) + working forward reach; verified transparent corners.  
3. **v3 polish:** Working lean + desk reach exaggerated for desk readability.

No QC failures remaining at ship. Hero and desk_idle intentionally identical (neutral idle).

## Handoff
Ready for **SpriteForgeSupport** consistency QC / PASS-FAIL before Campus Live ship.
