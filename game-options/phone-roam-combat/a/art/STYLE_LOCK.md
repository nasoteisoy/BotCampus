# A — STYLE LOCK · Neon Cyber Twin-Stick

**One-liner:** Geometry Wars–lite neon cyan/magenta void arena (true top-down twin-stick).

**Still authority:** `style_world.png` · `hero_silhouette.png` · `hero_highangle_alt.png`  
**Runtime sprites:** `player.png` · `enemy_tri.png` · `enemy_pod.png` · `enemy_rock.png`  
**Machine palette:** `palette.json`

## Exact hex palette

| Role | Hex | Notes |
|------|-----|-------|
| bg | `#050510` | near-black void |
| floor / arena | `#0a0a20` | replaces `#161c2a` |
| grid faint | `#1e1b4b` | indigo lattice |
| grid bright | `#312e81` | every Nth line |
| frame | `#7c3aed` | thin neon border |
| player fill | `#1a2236` | dark hull |
| player core | `#22d3ee` | cyan reactor |
| player stroke | `#67e8f9` | cyan rim |
| player accent | `#e879f9` | magenta ring on core |
| enemy tri | `#22d3ee` | hollow cyan triangle |
| enemy pod | `#d946ef` | solid magenta blob |
| enemy rock fill | `#4c1d95` | dark faceted |
| enemy rock edge | `#a78bfa` | lavender edge + cyan veins |
| bullet / FX | `#22d3ee` | cyan pills; shadow `#67e8f9` |
| hit flash | `#ffffff` | brief punch |
| burst secondary | `#e879f9` | kill pops can lean magenta |
| stick / UI tint | `rgba(34,211,238,0.14)` base · border `rgba(34,211,238,0.45)` |
| fire button | bg `rgba(192,38,211,0.75)` · border `#e879f9` |
| HUD text | `#e0f2fe` | cool cyan-white |
| overlay card | `#0f0a1a` · border `#7c3aed` |

## Silhouette rules (shape language)

- **Camera:** true top-down (no side silhouette, no iso diamonds).
- **Player:** compact disc / crescent ship; cyan core + forward spikes; aim direction must read at phone size.
- **Enemies (3 kinds):** hollow **triangle** (cyan), bumpy **pod** (magenta), faceted **rock** (dark + neon edge). Never same blob for all kinds.
- **Projectiles:** short glowing pills / lines, not fat circles.

## Props / FX rules

- Soft bloom on emissives (alpha rings OK); keep juice muted — hit flash + scale punch + light shake.
- Arena = void + faint cyan/violet **grid**, not textured dungeon.
- Muzzle / death: cyan or magenta particle bursts only — no orange fire.

## UI mood (CSS hints)

```css
html,body{background:#050510;color:#e0f2fe}
canvas{background:#050510}
.stick-base{background:rgba(34,211,238,.14);border-color:rgba(34,211,238,.45)}
.stick-knob{background:rgba(34,211,238,.35)}
#fireBtn{border-color:#e879f9;background:rgba(192,38,211,.75)}
#overlay .card{background:#0f0a1a;border-color:#7c3aed}
```

## Do not

- Candy pastels, green tunic, stubby chibi (that's **B**)
- Cool rooftop diamonds, red vision cones, lean assassin (that's **C**)
- Warm orange fire buttons (`#fb923c`), rose-red enemies (`#e11d48`), soft sky-blue player (`#60a5fa`) — current procedural defaults
- Painterly brush edges or thick cartoon outlines

## Suggested `game.js` fillStyle replacements

| Current | Replace with |
|---------|--------------|
| `#161c2a` (arena fill) | `#0a0a20` |
| `#2a3548` (arena stroke) | `#7c3aed` or `#312e81` |
| `#60a5fa` (player) | `#c084fc` hull **or** drawImage `player.png` / procedural cyan core `#22d3ee` |
| `#1e3a8a` (player dark) | `#1a2236` / `#6b21a8` |
| `#e11d48` (enemy) | by kind: tri `#22d3ee` · pod `#d946ef` · rock `#4c1d95` |
| `#7f1d1d` (enemy dark) | `#4c1d95` |
| `#fbbf24` / `#f59e0b` (bullet) | `#22d3ee` / `#67e8f9` |
| burst `#f97316` / `#ef4444` | `#e879f9` / `#22d3ee` |

Prefer `drawImage` of `art/player.png` + `enemy_*.png` when loaded; fall back to neon primitives keyed above.
