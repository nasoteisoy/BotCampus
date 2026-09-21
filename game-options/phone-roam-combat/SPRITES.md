# In-game sprites (illustrated) — Render A → Dev A

Jesus: playables must show **these PNGs**, not canvas shapes / Pillow cels.

## Wire (filenames Dev A already loads)
| Opt | player | enemies |
|-----|--------|---------|
| A | `player.png` (+ optional `player_sheet.png` 2×256) | `enemy_tri.png` `enemy_pod.png` `enemy_rock.png` |
| B | `player.png` (+ `player_sheet.png`) | `enemy_blob.png` `enemy_blob_alt.png` |
| C | `player.png` (+ `player_sheet.png`) | `guard.png` |

All single frames: **256×256 RGBA**, transparent corners.
Sheets: **512×256**, 2 frames left→right, cell 256. `player_f2.png` = frame 2 alone.

## Playback hint
- A: alternate `player` / `player_f2` while moving (thrust pulse)
- B: bob between frames while running; keep slash FX procedural yellow arc
- C: use `player_f2` on dash

## Do not
- Stamp `style_world.png` as player
- Fall back to `_old_shape_*` Pillow cels
- Use geometric fillStyle circles when `img.complete && img.naturalWidth`

## Cache
Bump `?v=opt4` (or next) after pull so phones don’t keep old shapes.
