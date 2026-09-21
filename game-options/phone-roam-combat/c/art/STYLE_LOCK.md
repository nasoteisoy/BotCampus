# C — STYLE LOCK · Painterly Iso Noir Stealth

**One-liner:** Fake-iso dusk rooftops · lean dark assassin · maroon guards · red vision cones · amber lanterns.

**Still authority:** `style_world.png` · `hero_silhouette.png`  
**Runtime sprites:** `player.png` · `guard.png`  
**Machine palette:** `palette.json`

## Exact hex palette

| Role | Hex | Notes |
|------|-----|-------|
| bg | `#0b1020` | cool midnight |
| floor / roof tiles dark | `#1e1b4b` | indigo diamond |
| floor mid | `#312e81` | |
| floor light / stone | `#3b3f6b` / `#475569` | walkway highlight |
| cover / roof | `#1e293b` | dark cover diamonds |
| shadow | `#020617` | alley depth |
| player fill | `#1e3a5f` | dark blue cloak body |
| player cloak deep | `#0f172a` | hood / shadow |
| player stroke | `#334155` | soft rim |
| player eye | `#fbbf24` | amber slit |
| guard fill | `#9f1239` | maroon upright |
| guard hunt | `#f87171` | alert body tint |
| guard idle | `#64748b` | calm slate (optional) |
| vision cone | `rgba(239,68,68,0.28)` | translucent red wedge |
| vision edge | `rgba(248,113,113,0.55)` | |
| lantern | `#fbbf24` | warm point lights |
| lantern glow | `rgba(251,191,36,0.35)` | radial wash |
| bullet / FX (sparse) | `#fbbf24` dash spark · `#f87171` hurt | |
| hit flash | `#ffffff` | |
| alert low / mid / high | `#94a3b8` / `#fbbf24` / `#ef4444` | was green forest — cool it |
| hidden tint | `#67e8f9` soft OR keep subtle `#86efac` at low alpha | prefer cool cyan mist over lime |
| stick / UI tint | `rgba(148,163,184,0.18)` · border `rgba(148,163,184,0.4)` |
| action buttons | bg `rgba(127,29,29,0.85)` · border `#f87171` · accent amber `#fbbf24` |
| HUD text | `#e2e8f0` | |
| overlay card | `#0f172a` · border `#334155` |

## Silhouette rules (shape language)

- **Camera:** fake-iso diamonds (AoE2-ish). Keep diamond tile draw; **recolor** only.
- **Player:** lean crouched **hooded assassin** — jagged cloak hem, amber eye, dagger. Not stubby, not neon ship.
- **Guards:** upright rigid columns; spear OK; maroon reads against cool roofs.
- **Vision cones:** primary gameplay graphic — soft red wedges, never neon cyan.

## Props / FX rules

- Amber lanterns = only warm accents on cool blue/purple world.
- Cover tiles = darker roof diamonds; stay readable under cones.
- FX sparse: dash afterimage, takedown puff — no Geometry Wars particle soup.

## UI mood (CSS hints)

```css
html,body{background:#080c18;color:#e2e8f0}
canvas{background:#0b1020}
.stick-base{background:rgba(148,163,184,.18);border-color:rgba(148,163,184,.4)}
.actions button{border-color:#f87171;background:rgba(127,29,29,.85)}
#overlay .card{background:#0f172a;border-color:#334155}
#overlay button{border-color:#fbbf24;background:#7f1d1d}
```

## Do not

- Neon cyan arena grid / magenta pods (that's **A**)
- Candy pastel sky, stubby green hero, pink frosting (that's **B**)
- Bright green forest diamonds (`#1a3328`, `#2f5d45`, `#4ade80` player) — current defaults
- Chibi proportions or thick cartoon outlines

## Suggested `game.js` fillStyle replacements

| Current | Replace with |
|---------|--------------|
| `#1a3328` / `#2f5d45` (diamonds) | `#1e1b4b` / `#312e81` |
| `#243f32` / `#152820` | `#3b3f6b` / `#0f172a` |
| checker `#14301f` / `#102818` | `#1e293b` / `#0f172a` |
| `rgba(74,222,128,0.08)` grid | `rgba(148,163,184,0.08)` |
| player `#4ade80` / `#86efac` | `#1e3a5f` / hidden cool tint |
| player dark `#14532d` · stroke `#bbf7d0` | `#0f172a` · `#334155` |
| guard idle `#94a3b8` · hunt `#f87171` | keep hunt; idle `#64748b` · fill `#9f1239` |
| cone `rgba(248,113,113,…)` | keep red family (`visionCone` key) |
| burst `#a3e635` / `#4ade80` | `#fbbf24` / `#f87171` |
| flash `rgba(190,255,210,…)` | `rgba(251,191,36,…)` amber |
| alert greens `#4ade80` | `#94a3b8` (low) — mid/high stay amber/red |

Prefer `drawImage` `player.png` + `guard.png`; keep procedural cones/lanterns.
