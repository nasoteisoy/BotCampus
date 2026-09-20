# Map pan / pinch-zoom — strategy & campus UIs
**Date:** 2026-09-20 · **Researcher A** · **Crew-only** (not for Jesus to read)  
**Context:** campus-live feels cramped; Jesus OK with scroll + zoom in/out. Apply to Bot Campus map and future RTS/god-game maps.

## Industry pattern (AoE / SimCity / mobile RTS / god-games)
Dense maps are normal. **Camera is the spacing tool** — don’t thin the world until pan+zoom feel good.
- **1-finger drag** = pan (after small movement threshold)
- **2-finger pinch** = zoom **toward pinch midpoint** (world point under fingers stays put)
- Optional: 2-finger drag = pan only; **mode-lock** pan vs pinch (first gesture to cross threshold wins) so zoom doesn’t drift
- Desktop: wheel zoom toward cursor; drag / edge / arrows to pan; minimap jump

## Must-haves checklist
1. **Pan:** 1-finger drag; cancel tap/select once drag > ~**3 mm** physical (or ≥8 CSS px floor)
2. **Zoom:** pinch to **focal midpoint**; also **+/− buttons** (accessibility — pinch can’t be the only door)
3. **Zoom range:** usable min (overview of whole campus) → max (desk readable); soft clamp / slight rubber-band
4. **Pan bounds:** clamp so map can’t leave empty void; leave ~10–20% padding at min zoom
5. **Inertia:** light momentum on pan release; kill on second touch
6. **Touch targets (chrome):** ≥**44×44 pt** (Apple) / **48×48 dp** (Material); ≥**8 dp** gap between adjacent controls
7. **Hit vs visual:** icons can be 24px; pad invisible hit area to 44/48
8. **Gesture vs UI:** map gestures ignore when touch starts on HUD; HUD doesn’t steal mid-gesture
9. **Performance:** only update/cull what’s in (or near) viewport; throttle zoom redraw; avoid full-scene layout every frame
10. **Crowding:** prefer camera + grouping (AoE Mobile “troops not every soldier”) over spreading sprites so far they feel empty
11. **Minimap / jump** (nice): tap region to recenter when campus grows

## Min spacing (content)
- Interactive desks/bots: keep **visual** density; ensure at max zoom a desk’s primary action ≥44pt hit
- Between adjacent tappable sprites: prefer ≥8–16 CSS px gap **or** larger hit pads that don’t overlap centers
- If still cramped at max zoom → grow hit pads / open detail sheet on tap, don’t force empty map

## Performance pitfalls
- Re-layout entire DOM on every pan frame (use transform/canvas/WebGL camera)
- No culling at min zoom with hundreds of nodes
- Simultaneous pan+pinch without mode-lock → jitter
- Zoom about screen center → player loses place (feels broken)

## Sources
- Unity RTS Engine mobile controls — 1-finger pan, 2-finger pinch, min drag, zoom-to-middle
- Godot / strategy tutorials — zoom toward pinch midpoint; pan × zoom factor
- Generals Android touch port — 3 mm thresholds; exclusive pan vs pinch mode-lock
- WCAG 2.5.1 / 2.5.8 — multipoint needs single-pointer alternative; target size floors
- Apple HIG 44×44 pt · Material 48×48 dp · ~8 dp spacing
- AoE Mobile — dense war via **grouped** control, not micro every unit; map drag + zoom + bookmarks/coords

## Advise Dev A
Ship camera first: pan + pinch-to-point + zoom buttons + clamps. Keep campus dense; let zoom solve “cramped.” Then tune thresholds on a real phone.
