# Animation sheets — phone-roam A/B/C (Render A → Dev A)

Jesus: playables must animate with **frame sheets**, not slide-translate of one stamp.

## Layout (all sheets)
- Horizontal strip, **cell 256×256**, RGBA transparent
- Frames left → right, 0-indexed
- Suggested FPS: idle **6**, walk **10**, attack **12** (play once then idle)

## Files per option

### Players (`{a,b,c}/art/`)
| File | Frames | Use |
|------|--------|-----|
| `player_idle_sheet.png` | 4 | loop while stopped |
| `player_walk_sheet.png` | 4 | loop while moving |
| `player_attack_sheet.png` | 4 | play once on fire/slash/dash |
| `player.png` | 1 | fallback = idle[0] |
| `player_f2.png` | 1 | fallback walk frame |

### Enemies
| Opt | Files |
|-----|-------|
| A | `enemy_tri_sheet.png`, `enemy_pod_sheet.png`, `enemy_rock_sheet.png` (4 each) |
| B | `enemy_blob_sheet.png`, `enemy_blob_alt_sheet.png` (4 each) |
| C | `guard_sheet.png`, `guard_idle_sheet.png`, `guard_walk_sheet.png` |

## Wire hint
```js
const cell = 256;
function drawFrame(img, frameIndex, dx, dy, scale) {
  const n = img.width / cell;
  const f = ((frameIndex % n) + n) % n;
  ctx.drawImage(img, f*cell, 0, cell, cell, dx, dy, cell*scale, cell*scale);
}
```
Advance frame on timer; attack resets to idle on end.

## Note
Sheets preserve locked identity (A = opt7-passed human). Procedural limb/bob/shear for clear motion until painted keyframes replace them. Sole-push `?v=opt8` (or next).


## Deepen-pass extras (opt8)
Discrete frames also exported:
- `player_idle.png` + `player_idle_f2..f4.png`
- `player_walk.png` + `player_walk_f2..f4.png`
- `player_attack.png` + `player_attack_f2..f4.png`

Enemy juice:
- A/B: `enemy_*_hitdeath_sheet.png` — 6 frames: idle, hit flash, death×3, poof
- C: `guard_hitdeath_sheet.png` — same

Prefer sheets for playback; discrete `*_fN` if easier to wire.
