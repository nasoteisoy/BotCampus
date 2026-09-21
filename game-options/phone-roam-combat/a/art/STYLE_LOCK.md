# A — STYLE LOCK · Neon Cyber Twin-Stick

**Still authority:** `style_world.png` + `hero_silhouette.png`  
**Feel:** Geometry Wars–lite · cyan + magenta neon on void · geometric blobs

## Palette
See `palette.json`. Hard rules:
- Background nearly black (`#050510` / `#0a0a20`)
- Accents ONLY cyan `#22d3ee` and magenta/violet `#d946ef` / `#c084fc`
- **No** orange fire buttons, **no** rose-red enemies, **no** sky-blue soft player (current defaults)

## Silhouette
- Player: compact top-down blob / triangular ship; cyan core; aim direction readable
- Enemies: hollow triangles, bumpy magenta pods, dark faceted rocks with neon edge — distinct shapes
- Props: soft muzzle rings (not firework soup)

## Draw / CSS
- Arena: dark floor + faint cyan/violet grid; thin neon frame
- Sticks: cyan-tinted translucent circles (left move / right aim)
- Fire: magenta circular button (not orange)
- HUD chips: cyan-tint glass

## Do not
- Whimsy stubby proportions (that's B)
- Iso diamond tiles / vision cones (that's C)
- Warm orange / candy pastels

## Suggested game.js swaps
Use `palette.replaceFromGameJs` map; draw player as triangle+core, enemies as tri/pod/rock variants.
Optional: `drawImage` `player.png` / `enemy_*.png` when present.
