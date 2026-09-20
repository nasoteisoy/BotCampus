# Sprite FLOW — idle → walk → attack
**Date:** 2026-09-20 · **Researcher A**  
**Bar:** one character, continuous motion, readable at RTS zoom.

## Checklist (must-haves)
1. **Same silhouette family** across idle/walk/attack (proportions, helmet, cape, weapon present if bible says armed).
2. **Neighbor continuity** — walk frame A↔B and facing N↔NE don’t pop silhouette or palette.
3. **Contact readability** — attack has clear wind-up → active/impact → recover; player can see commitment before damage.
4. **No soft blur** that hides the hit silhouette; hard 1–2 smear frames only on peak travel if needed.
5. **Idle breath** subtle; walk has contact dip / pass rise; attack holds impact longer than smear.

## Top pitfalls
- Redesigning armor/colors mid-sheet
- Weapon teleport / freeze while limbs move
- Smear on anticipation or recovery
- Attack with no held recover (feels floaty)

## Sources
- Character sprite consistency QC skill (campus): FLOW + weapon natural-motion checks
- SLYNYRD Pixelblog 56 — attack phases: anticipation, smear, follow-through, recover; smears only on strike path
- JRPG animation bible (patrickdugan) — wind-up / active / recovery; walk contact-down-pass-up
- Classic Disney / Animator’s Survival Kit — contact, recoil, passing, high-point keys

## Advise makers
Lock hero ref + bible first. QC fail → regenerate that frame, don’t ship “close enough.”
