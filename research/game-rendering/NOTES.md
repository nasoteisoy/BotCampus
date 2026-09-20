# Game rendering — industry standards for our games
**Date:** 2026-09-20 · **Researcher A**  
**Scope:** Game art / realtime & sprite rendering. Applies to **elemental soldiers** (AoE2-like iso RTS) and **campus bot** characters (live Bot Campus).

## What “industry standard” means here
Not one shader. A **shippable bar**:
1. **Readable at real size** (phone thumbnails, ads, RTS zoom, campus desk sprites).
2. **One locked visual language** (bible: palette, proportions, light direction, outline/material rules).
3. **Pipeline that scales** — many units/bots without unique hero cost each.
4. **Mobile-safe cost** — mid-range phones, stable FPS, simple materials/batching.
5. **Same character across frames/poses** (QC) — FLOW + gear motion (see related notes).

Clash / Kingshot / Supercell midcore set the commercial taste: **bright stylized, dense readable scenes, friendly funnel** — not Unreal cinematic PBR.

---

## PBR vs stylized
| Approach | Use when | Notes |
|----------|----------|-------|
| **Photoreal PBR** | Cinematics, rare hero close-ups | Heavy; kills readability at micro scale; avoid as default for soldiers/campus |
| **Stylized PBR** (Clash-like) | 3D buildings/units on mobile | Use PBR maps but **break realism**: simple albedo (few color steps), **rougher-than-real** metals for nicer gradients (Supercell Helsinki / Substance) |
| **NPR / flat / pixel** | 2D sprites, campus bots, AoE2 soldiers | Silhouette + value > micro detail; no fake photo lighting |

**Standard for us:** default **stylized** (2D sprite *or* stylized-PBR 3D). Never mix photoreal soldiers with cartoon campus bots in one product without an explicit skinId split.

---

## Mobile “game-ad” look
Ads and store screenshots sell the game in **1–2 seconds** on a small crop.
- Exaggerated shapes, vibrant but controlled palette, glossy or clear key light.
- Instant **role read** (soldier vs mage vs bot desk worker).
- Busy-but-clear: many props OK if **value contrast** separates layers (UI, units, FX).
- Avoid muddy midtones and thin outlines that vanish when compressed for ads.

Clash/Kingshot lesson: **friendly cartoony midcore** widens funnel; grim realistic 4X narrows it.

---

## Clash / Kingshot-like density
- **Many small readable pieces** on screen (buildings, troops, FX) — density is a feature.
- Each piece needs a **distinct silhouette**; team/faction color anchors.
- LOD: detail dies first; silhouette + team color last.
- Performance: shared materials, atlases, baked or simple lighting, blob shadows over many realtime shadows (low-poly mobile practice).

---

## Lighting
- **One key + soft fill** direction locked in the style bible (same for all units in a skin).
- Stylized PBR: play roughness for gradient; keep albedo simple.
- Sprites: **paint the light** (top-left key common) consistently across the sheet — don’t change sun per frame.
- Mobile 3D: prefer baked / probe / limited realtime; blob shadows under characters.

---

## Silhouette readability (non-negotiable)
Test as **black silhouette** at gameplay and ad sizes.
- Must ID class (infantry / cavalry / caster / campus role) with no color.
- Hold across idle, walk, attack poses (recognition-threshold rule).
- Exaggerated props (crest, weapon profile, hardhat, neon trim) are silhouette anchors.

---

## Sprite vs 3D pipelines
| | **2D sprites** (elemental soldiers, many campus bots) | **3D stylized** (vehicles, some campus/hero) |
|--|------------------------------------------------------|-----------------------------------------------|
| Strength | Pixel control, cheap draw, classic RTS | Smooth turns, lighting reuse, one mesh×skins |
| Cost | 8 facings × frames; QC every cel | Rig + anim clips; LOD + materials |
| Standard bar | 8-dir walks, FLOW QC, gear arcs | Stylized PBR limits, readable LODs |
| When to pick | Mass units, desk sprites, AoE2 feel | Hero close-ups, tanks, continuous 3D campus |

**Hybrid OK:** 3D for world, sprites for UI/campus cast — but **one bible per skinId**.

---

## Bar — elemental soldiers
1. Iso/RTS readable at formation zoom (silhouette + faction accent).
2. Walk: 8 frames/dir, opposite feet, no skate (see `iso-walk-cycles`).
3. Attack FLOW: wind-up → impact → recover; hard smears only on strike peak.
4. Weapons re-armed after body; tip arc continuous (`rendering/gear-motion.md`).
5. Elemental FX trail the **weapon/body arc**, not a second motion.
6. Style: stylized cel/pixel — not photoreal PBR.

## Bar — campus bots
1. Instant role silhouette (Leader, Dev, Render, Researcher, etc.).
2. Status-readable poses (idle / working / review / needs permission) without text.
3. Same character across mini-intern variants (palette/prop accents only).
4. Phone UI: large clear shapes; ad-like polish on hero desk sprite.
5. Prefer 2D/simple 3D; avoid heavy PBR on dozens of live sprites.

---

## Must-haves checklist (Renders)
1. [ ] Style bible locked (palette, light dir, proportions, outline/material rules)
2. [ ] Silhouette pass at real on-screen size (black + color)
3. [ ] Pipeline chosen (sprite sheet **or** stylized-PBR) and skinId-aligned
4. [ ] Mobile/ad crop still reads role in <1s
5. [ ] FLOW + gear QC for animated sets
6. [ ] Density test: unit still separates in a crowded Clash-like frame
7. [ ] No photoreal default unless Leader explicitly asks

## Top pitfalls
1. Photoreal PBR on tiny mobile units → muddy noise  
2. Inconsistent light direction across a sheet  
3. Weak silhouettes that rely on color alone  
4. Mixing sprite and 3D languages without a skin split  
5. Soft glow/FX that erase weapon or face  
6. Hero-detail budget on every mass soldier  
7. Ignoring ad/screenshot crop (only looks good in editor zoom)

## Sources
- Supercell Helsinki / Adobe Substance — Clash stylized PBR: simple albedo, exaggerated roughness, boxy props + gradients  
- ArtBlast — Supercell hire guide: micro-scale silhouette, vibrant contrast, portfolio match per game  
- Sunstrike — game art styles: phone size kills detail; silhouette + value survive  
- Stylized 3D production playbooks — recognition-threshold silhouette tests across poses  
- Kingshot / Century midcore coverage — bright cartoony low-poly medieval; density + funnel  
- Low-poly mobile blogs — baked light, batching, blob shadows  
- Related campus notes: `rendering/FLOW.md`, `rendering/gear-motion.md`, `iso-walk-cycles/NOTES.md`

## Advise Renders (one-liner)
**Ship stylized and silhouette-first; use PBR only as a controlled tool, never as photoreal default.**
