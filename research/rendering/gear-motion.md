# Held gear motion (weapon / shield) — iso & RTS
**Date:** 2026-09-20 · **Researcher A**

## Checklist (must-haves)
1. **Body first, gear second** — finish legs/torso walk; then re-arm every frame (don’t glue prop early).
2. **Continuous tip path** — weapon tip never teleports between frames; small arc follows shoulder bob.
3. **Grip consistency** — same hold family (one-hand high, two-hand spear, etc.) across facings.
4. **Shield counterweight** — off-hand moves opposite or braces; not frozen cardboard unless “guard” idle.
5. **Elemental FX trail the physical arc** — VFX follow the weapon path, not a second unrelated motion.
6. **Standing QC** — idle→walk and walk A↔B: gear moves with limbs; no appear/disappear mid-loop.

## Top pitfalls
- Mirrored facing flips a asymmetric sword/shield into the wrong hand
- Soft glow smear eating the blade silhouette
- Different weapon length per angle

## Sources
- SLYNYRD — “move with gun”: remove arms, replace with held-weapon arms; sway from shoulder
- Character sprite consistency QC — weapon & shield natural motion standing check
- AoE2 unit art practice — readable silhouette at distance beats detail on gear

## Advise makers
If mirror breaks handedness, draw unique L/R frames for armed units.
