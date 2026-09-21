# C — STYLE LOCK · Painterly Iso Noir

**Still authority:** `style_world.png` + `hero_silhouette.png`  
**Feel:** AoE2-ish diamond cam · dusk rooftops · vision-cone stealth

## Palette
See `palette.json`. Hard rules:
- Cool midnight blue / indigo tiles — **not** green forest
- Warm amber lanterns only as accents `#fbbf24`
- Vision cones translucent red; guards maroon; player dark cloak + amber eye slit
- Sparse FX — telegraphs must stay readable

## Silhouette
- Player: lean crouched hooded assassin (not stubby, not neon ship)
- Guards: upright rigid; red vision wedges are the UI
- Cover: dark diamond roofs / stone walkways

## Draw / CSS
- Keep diamond tile draw; recolor to indigo/slate
- Cones: `visionCone` fill + soft edge
- Sticks muted slate; dash/action button deep red + amber border
- HUD dark glass, cool text

## Do not
- Neon cyan arena (A)
- Candy pastel / stubby hero (B)
- Bright green “safe forest” look (current defaults)

## Suggested game.js swaps
Retint diamonds via `replaceFromGameJs`; player dark blue diamond+cloak; guards maroon; keep cone drawing but red.
Optional: `player.png`, `guard.png`.
