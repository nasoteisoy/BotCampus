# Game rendering — research board notes
Updated: 2026-09-20 · Leader seed + Researcher A/B (live updates expected)
Topic: **game rendering** for Jesus’s soldiers + campus (Clash/Kingshot/mobile-ad readable)

## What “game rendering” means here
Not film VFX. Production look that **reads on a phone**, survives clutter, and matches a locked art bible across idle/walk/attack.

Two pipelines we care about:
1. **Stylized 3D → sprites** (Clash-like): model/texture in 3D, render multi-angle frames to 2D.
2. **Direct 2D / iso sheets** (what we’re shipping now): paint/gen frames; still obey the same readability rules.

## Industry bar (stylized mobile / Clash-adjacent)
Sources: Supercell Substance interview (Clash stylized PBR); stylized character production playbooks; Clash Royale readability writeups.

### Must-haves
1. **Silhouette first** — recognizable in black at gameplay size (phone). Test idle + walk + attack.
2. **Exaggerated anchors** — crest, weapon, chest glow, shield emblem as identity locks (not tiny noise).
3. **Stylized PBR discipline** — simple albedo, roughness does the “juice”; metals rougher than real life; don’t bake full lighting into color.
4. **Value compression** — limited value range so characters don’t go muddy on OLED phones.
5. **Detail hierarchy** — detail on face/chest/weapon; rest quieter (detail everywhere = noise).
6. **Consistent lighting family** across every frame of a sheet (same key direction).
7. **Transparent clean plates** — no white boxes; crop to character; stable foot baseline across facings.

### For our elemental soldiers (2D iso)
1. Same bible + hero ref every frame.
2. Walk: opposite feet A/B minimum; industry prefers 6–8 frames/dir — we’re at 2 until FLOW pass upgrades.
3. Weapon/shield **re-armed every frame** with continuous tip arc (no cardboard glue, no teleport).
4. Element color is identity, not a redesign (Fire/Water/Air/Earth = palette + VFX, same soldier language).
5. Phone review: Sprite Lab walk row must visibly flip A↔B; play page required.

### Pitfalls (seen on our project)
- Bubble/sphere primitive 3D that doesn’t match refs
- White sprite backgrounds
- Same-leg walk / skate
- Frozen gear across walk frames
- Over-detail that dies at map scale
- Different lighting per facing (looks like different characters)

## Checklist before Render ships
- [ ] Silhouette reads at ~64–128px tall
- [ ] Hero ref locked; bible pasted every gen
- [ ] Idle→walk continuous stance
- [ ] Opposite-foot walk (A≠B)
- [ ] Weapon/shield natural motion
- [ ] Clean alpha + shared height
- [ ] Public preview strip + **play/review URL**

## Related notes
- `iso-walk-cycles.md` — walk frame standards (Researcher A)
- (pending Researcher B) 2D iso readability / emissive bloom pitfalls

## Refresh
- Pull more Supercell pipeline detail when Renders move back toward 3D→sprite.
