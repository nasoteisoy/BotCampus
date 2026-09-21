# Runtime sprites — CHARACTER drop (opt5 ready)

**Do not use `_old_shape_*`** (1–3KB Pillow geometry from 19:33).

Live files (illustrated characters, 256² RGBA transparent):

| Opt | Files | Character reads as |
|-----|-------|--------------------|
| A | `player.png` | neon ship fighter |
| A | `enemy_tri.png` | clawed neon robot |
| A | `enemy_pod.png` | spider neon pod creature |
| A | `enemy_rock.png` | neon rock golem |
| B | `player.png` | candy stubby warrior |
| B | `enemy_blob.png` | pink candy blob face |
| B | `enemy_blob_alt.png` | chocolate+frosting blob |
| C | `player.png` | hooded assassin |
| C | `guard.png` | maroon plate guard |

Sheets: `*_sheet.png` = 2×256 horizontal (same frame ×2 until more poses).
`style_world.png` = board only.

Bump `?v=opt5`. Prefer drawImage; never fall back to fillStyle circles when naturalWidth>0.


Proof strip: `art_runtime_proof_strip.png` (all runtime characters in one row).
