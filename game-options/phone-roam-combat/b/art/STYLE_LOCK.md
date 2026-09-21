# B — STYLE LOCK · Whimsy-Stubby Candy Slash

**One-liner:** Side-view candy corridor · stubby green-tunic hero · gooey blob enemies.

**Still authority:** `style_world.png` · `hero_silhouette.png`  
**Runtime sprites:** `player.png` · `enemy_blob.png` · `enemy_blob_alt.png`  
**Machine palette:** `palette.json`

## Exact hex palette

| Role | Hex | Notes |
|------|-----|-------|
| bg / sky | `#e9d5ff` | lavender pastel (replaces purple dungeon) |
| sky deep | `#ddd6fe` | parallax band |
| floor / ground | `#c4b5a0` | tan cobble |
| ground dark | `#a8a29e` | shadow strip |
| building | `#fda4af` | pink candy walls |
| frosting | `#f9a8d4` | drips / ledges |
| player fill (tunic) | `#166534` | forest green |
| player stroke / shade | `#14532d` | outline-ish dark green |
| player skin | `#fde68a` / face `#ffcdb2` | |
| player helm / hat | `#166534` + cream horns `#f5f5dc` | |
| player cape / leather | `#9a3412` | brown cape/boots |
| sword | `#e5e7eb` · guard `#eab308` | |
| enemy pink blob | `#ec4899` | primary fodder |
| enemy green / icing | `#84cc16` | alt candy |
| enemy chocolate | `#78350f` + icing `#f9a8d4` | brute / alt |
| bullet / gun FX | `#67e8f9` | keep as cool accent OK |
| slash / FX | `#facc15` | yellow crescent |
| hit flash | `#ffffff` | |
| stick / UI tint | base `rgba(244,114,182,0.25)` · border `#f472b6` |
| buttons | slash pink `#db2777` · play green `#166534` + gold border `#facc15` |
| HUD text | `#3b0764` | dark on pastel |
| overlay card | `#fdf4ff` · border `#f9a8d4` |

## Silhouette rules (shape language)

- **Camera:** pure side-view; hero **faces run direction** (right by default).
- **Hero:** stubby — big head, short thick limbs, green tunic, horned/floppy hat, oversized sword. Thick readable masses (not lean).
- **Enemies:** round candy **blobs** with stubby feet + angry faces — never red humanoids.
- **FX:** bold yellow slash arc + star sparks; juicy, soft, impactful.

## Props / FX rules

- Parallax candy buildings (pink frosting drips) behind tan ground plane.
- Combo / slash juice = yellow crescents; deaths = pink/lime candy pops.
- No neon grid, no vision cones.

## UI mood (CSS hints)

```css
html,body{background:#f3e8ff;color:#3b0764}
canvas{background:#e9d5ff}
.stick-base{background:rgba(244,114,182,.25);border-color:#f472b6}
.stick-knob{background:rgba(255,255,255,.55);border-color:#f9a8d4}
#overlay .card{background:#fdf4ff;border-color:#f9a8d4;color:#3b0764}
#overlay button{border-color:#facc15;background:#166534;color:#fff}
```

## Do not

- Neon cyan/magenta void + geometric ships (that's **A**)
- Cool blue/purple rooftops, red vision cones, hooded assassin (that's **C**)
- Dark purple dungeon fills (`#120e16`, `#1a1222`, `#2a1f30`) — current defaults
- Tall realistic proportions or sharp cyber edges

## Suggested `game.js` fillStyle replacements

| Current | Replace with |
|---------|--------------|
| `#120e16` | `#e9d5ff` |
| `#1a1222` | `#ddd6fe` |
| `#2a1f30` / `#3d2e44` | `#c4b5a0` / `#a8a29e` |
| `#4a3560` / `#7c5a9e` (props) | `#fda4af` / `#f9a8d4` |
| `#a78bfa` (player) | `#166534` |
| `#5b21b6` / `#6d28d9` | `#14532d` |
| `#ddd6fe` (player light) | `#fde68a` (skin/helm light) |
| `#be123c` / `#9f1239` (enemies) | `#ec4899` / `#78350f` |
| `#450a0a` / `#881337` | `#9f1239` shade → use `#831843` / `#4a1c0a` |
| `#c084fc` / `#e9d5ff` (slash) | `#facc15` / `#fef08a` |
| `#67e8f9` gun FX | keep or soften — OK as secondary |

Prefer `drawImage` `player.png`, `enemy_blob.png`, `enemy_blob_alt.png`.
