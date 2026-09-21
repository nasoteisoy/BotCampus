# Phone roam-combat — STYLE LOCKS (Render A → Dev A)

Three playables, three locked worlds. Stills are mood authority; these locks + `palette.json` + sprites are the **runtime contract** so Dev A can sole-push without guessing.

| Opt | One-liner | Lock + palette | Sprites in `art/` |
|-----|-----------|----------------|-------------------|
| **A** Arena Clear | Neon cyan/magenta Geometry-Wars top-down | [`a/art/STYLE_LOCK.md`](a/art/STYLE_LOCK.md) · [`a/art/palette.json`](a/art/palette.json) | `player.png` · `enemy_tri.png` · `enemy_pod.png` · `enemy_rock.png` |
| **B** Corridor Slash | Whimsy candy side · stubby green hero · blobs | [`b/art/STYLE_LOCK.md`](b/art/STYLE_LOCK.md) · [`b/art/palette.json`](b/art/palette.json) | `player.png` · `enemy_blob.png` · `enemy_blob_alt.png` |
| **C** Shadow Takedown | Painterly iso noir · assassin · cones · lanterns | [`c/art/STYLE_LOCK.md`](c/art/STYLE_LOCK.md) · [`c/art/palette.json`](c/art/palette.json) | `player.png` · `guard.png` |

## Dev A checklist

1. `JSON.parse` each `art/palette.json` — apply hexes to `game.js` fillStyles via `replaceFromGameJs` (and kind-specific enemy colors).
2. Restyle `index.html` sticks/overlay from STYLE_LOCK CSS hints (partial STYLE_LOCK CSS already present — verify against palette).
3. When sprites exist, `drawImage` them instead of colored circles/rects; keep procedural FX (bullets, cones, slash arcs, grid).
4. Keep A/B/C visually **mutually exclusive** (see each lock’s Do-not list).
5. **Sole-push** Pages when wired. Render A does **not** git push. Do not touch elemental soldiers.

## Still authority

- A: `a/art/style_world.png` + `hero_silhouette.png`
- B: `b/art/style_world.png` + `hero_silhouette.png`
- C: `c/art/style_world.png` + `hero_silhouette.png`

## Note on sprite gen

`GenerateImage` was unavailable in this executor session (empty MCP catalog). Runtime sprites were produced with a **style-locked Pillow cel renderer**, punched to transparent RGBA (~160–192px). Re-roll with GenerateImage later if AI polish is required; filenames and palette keys stay stable.
