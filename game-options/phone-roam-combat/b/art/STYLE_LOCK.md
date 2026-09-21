# B — STYLE LOCK · Whimsy-Stubby Candy Slash

**Still authority:** `style_world.png` + `hero_silhouette.png`  
**Feel:** Side-scroll corridor · candy/gingerbread town · bold stubby cartoon

## Palette
See `palette.json`. Hard rules:
- Bright pastel sky/lavender; pink frosting buildings; tan cobble ground
- Hero: green tunic `#166534`, horned tan helm, brown cape, yellow slash arc
- Enemies: round candy blobs (pink / lime / chocolate+icing) — **not** red humanoids
- **No** dark purple dungeon look (current defaults)

## Silhouette
- Hero: short legs, big head, thick outline, side profile facing run direction
- Sword primary; hip gun optional accent
- Hit-stop: bold yellow crescent + star spark

## Draw / CSS
- Parallax candy buildings behind ground plane
- Rounded pink sticks / green play button
- HUD dark-on-pastel (readable on bright bg)

## Do not
- Neon cyan/magenta void (that's A)
- Cool noir rooftops / vision cones (that's C)
- Tall realistic proportions

## Suggested game.js swaps
Brighten bg/ground; player green stubby rect+helm; enemies ellipses in candy colors; slash FX yellow.
Optional sprites: `player.png`, `enemy_blob.png`, `enemy_blob_alt.png`.
