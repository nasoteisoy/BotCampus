# 2D / iso game rendering — animation ↔ look (phone-first)
**Date:** 2026-09-20 · **Researcher B** (sibling slice)  
**Scope:** Overlap between **animation** and the **rendered look** for iso RTS soldiers (AoE-like) and Bot Campus sprites — *not* a redo of PBR-vs-stylized / Clash density (see `NOTES.md`). Covers: rendered walk readability, phone-size texture/readability, bloom/emissive VFX pitfalls, frame-to-frame consistency under post-process/lighting.

**Parent / sibling:** `NOTES.md` (Researcher A — style bar, silhouette, sprite vs 3D) · walk basics: `../iso-walk-cycles/NOTES.md` + local `iso-walk-cycles.md` · FLOW/gear: `../rendering/FLOW.md`, `../rendering/gear-motion.md`

---

## 1. Walk cycles in a **rendered** look (not pure pixel-only)

Walk timing/poses live in iso-walk-cycles notes. Here: how **lighting, normals/fake lighting, outlines, and frame timing** make that walk *readable* when the sheet is lit or post-processed.

### Lighting that sells weight (without breaking the loop)
- **Lock one key direction** across every walk frame and every facing (bible rule from `NOTES.md`). Changing sun per frame = flicker that reads as skating even when feet are correct.
- Paint or bake **top-left (or bible) key + soft fill** so contact-frame shadows darken at the plant foot; pass-frame highlights read taller — reinforces the contact→pass bob without extra frames.
- **Value range locked:** midtones for cloth, darker contact shadows, one highlight band. If frame N is brighter than frame N+1 for no pose reason, playback “pulses.”
- Fake lighting on sprites: either **painted light** (cheapest, most consistent) or **shared 2D lights + normal maps**. Prefer painted for mass RTS units; normals only if light direction must react in-world.

### Normals / fake lighting pitfalls on walk sheets
- Auto-from-grayscale normals create **edge “rooftop” bumps** → white rim flicker as limbs swing past the light ([Unity 2D normal white-edge threads](https://discussions.unity.com/t/2d-normal-map-white-edge/250673)). Soften bump; author normals from volume, not height-from-alpha.
- URP Renderer2D light texture at **0.5×** scale often causes white outlines on lit sprites — set lighting quality **1×** if edges must stay crisp (cost ↑).
- Import normals **Point (no filter)** when the sheet is pixel/near-pixel; bilinear normals shimmer on limb edges during walk.
- Keep normal **alpha identical** to color alpha or light samples empty texels → halo ghosts on moving limbs.

### Outlines on moving iso characters
- Outline **weight in screen pixels** must stay constant across the cycle. Per-frame hand-painted outlines that thicken on foreshortened limbs read as “breathing” weight.
- Prefer: bake a **fixed 1px (or bible) outline** at sheet resolution, *or* a shader outline with **cell padding** so the outline can draw outside the opaque silhouette ([Unity outline-at-cell-edge](https://discussions.unity.com/t/how-do-i-create-a-2d-outline-which-will-work-on-sprites-that-are-at-the-edge-of-a-cell/886684)).
- Iso: outline color slightly darker than local shadow, not pure black on every material — pure black + bloom = muddy blob at phone RTS zoom.
- Walk rule (cross-link): **no soft smear outlines** on walk; keep limb silhouettes hard every frame (`iso-walk-cycles`).

### Frame timing × render look
- Playback **~8–12 FPS** still holds for rendered sheets; at phone size, slower than ~8 FPS makes lighting “step” look like hitching.
- Contact frames should be the **darkest / most planted** in value; pass frames brightest/tallest — timing and lighting reinforce each other.
- Do **not** compensate weak bob with bloom pulses or emissive flicker on the torso — that fights readability and burns OLED.

### Standards (sources)
- Fixed light direction + silhouette at gameplay scale: BinaryPH pixel lighting notes — https://binary.ph/2026/05/16/pixel-art-mastery-for-modern-games-color-clean-lines-and-lighting-that-scale/
- Fixed-cell / pivot contract (anti-jitter): https://dev.to/framesprite/a-fixed-cell-contract-for-sprite-sheets-that-do-not-jitter-3167
- Sheet workflow (pivot, baseline, overlay QC): https://www.seeddance.io/blog/sprite-sheet-maker
- 3D→2D capture consistency (anchors, lighting, outline): https://sorceress.games/pages/3d-to-2d
- Internal: `../iso-walk-cycles/NOTES.md` (8 frames, bob, no soft smears)

---

## 2. Texture / readability at **phone size**

Jesus cares about **live Bot Campus sprites + mobile UI/thumbnails**. Author and QC at the size players actually see.

### Rules of thumb
| Context | On-screen footprint (approx) | Detail budget |
|---------|------------------------------|---------------|
| Campus desk / UI thumbnail | ~48–96 px tall | Silhouette + 1 role prop + face block |
| Iso soldier at formation zoom | ~24–48 px tall | Faction accent + weapon profile only |
| Ad / store crop | often harsher than editor | Role in &lt;1s; no thin lines |

- **Silhouette first, then local contrast, then hue.** Color alone fails on bright outdoor LCD and dim OLED.
- **Safe detail density:** if a feature is &lt;~2–3 px after downscale, delete it — it becomes noise or shimmer.
- Author **at target grid** (or integer × target). Prefer author 64 and show ×1/×2 over author 256 and hope mip/mip-less shrink looks intentional ([sprite scale/detail](https://app.pathbits.com/articles/optimizing-sprite-readability-with-scale-and-detail), [Sorceress pipeline](https://sorceress.games/blog/convert-image-to-pixel-art-game-sprite-pipeline)).
- **Contrast:** charcoal-on-dark and pastel-on-sky both die at phone size — raise separation or use a light/dark outline ring that survives compression.
- **Mip / scale-down:**
  - Fixed UI / campus sprites at native size → **disable mipmaps** (save ~33% memory; avoid blur) ([mobile sprite optimize](https://aispritegen.com/blog/optimize-sprites-for-mobile)).
  - World sprites that shrink with RTS camera → enable mips **or** provide LOD sheets; never rely on bilinear shrink of a busy albedo.
  - Pixel / near-pixel: **Point** filter + integer scale; mismatched PPU = sub-pixel blur regardless of filter.
- Atlas: **1–2 px padding** (or extrusion) between cells — bleed looks like outline flicker during walk ([sheet padding](https://jaconir.online/blogs/sprite-sheet-animation-guide)).
- Compression: ASTC (iOS+) / ETC2 fallback; QC after compress — emissive masks and 1px outlines are first casualties.

### Phone-size checklist
1. [ ] Black-silhouette test at **real phone px** (not editor zoom)
2. [ ] Class/role ID without color (soldier vs caster vs campus role)
3. [ ] Weapon / prop still a distinct spike after shrink
4. [ ] Outline weight ≥1 solid px at min gameplay size (or intentional none)
5. [ ] No features thinner than ~2 px post-scale
6. [ ] Thumbnail / ad crop still reads in &lt;1s
7. [ ] Compression + filter settings match art (Point vs Bilinear) and were verified on device
8. [ ] Mips off for fixed UI; LOD or mips for zoomed RTS units

### Sources
- PathBits — scale vs detail density: https://app.pathbits.com/articles/optimizing-sprite-readability-with-scale-and-detail  
- Mobile art pipeline (contrast, atlas, mips off for 2D UI): https://gamineai.com/courses/mobile-puzzle-game/lessons/lesson-3-mobile-art-pipeline  
- Sprite optimize (mips, ASTC, overdraw): https://aispritegen.com/blog/optimize-sprites-for-mobile  
- Silhouette / nearest / no mips for pixel sprites: https://gtstu.com/pixel-art-indie-game-beginner-guide/

---

## 3. Bloom / emissive pitfalls (character VFX)

Applies to glows, elemental FLOW trails, chest lights, weapon energy — especially on phone OLED/LCD.

### Do
- Treat bloom as **accent**, not identity. Silhouette must still read with bloom **off**.
- Prefer **localized** glow: emissive mask on chest/weapon tip, soft additive sprite/billboard, or low-res additive pass — not full-screen bloom on every unit ([Nordeus / Arm Unite case study](https://engineering.nordeus.com/post-processing-effects-at-60-fps-on-mid-range-smartphones-unite-berlin-2018/), [Arm GDC18 post](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/post-processing-effects-for-mobile-at-gdc18)).
- Drive bloom from **HDR values &gt;1** with a threshold under the emissive peak; clamped 0–1 albedo cannot bloom ([Unity URP emissive/bloom](https://bugnet.io/blog/how-to-fix-bloom-not-affecting-emissive-particles)).
- Cap intensity; enable NaN/clamp guards on mobile. Extreme HDR → black/NaN on some GLES paths.
- Tune on the **mobile URP/Godot Mobile** quality asset, not Desktop Editor defaults ([Unity editor-vs-mobile bloom discrepancy](https://discussions.unity.com/t/addressing-the-discrepancy-in-bloom-effects-between-urp-editor-and-mobile-devices/1698886/1)).
- Godot 2D: enable **HDR 2D** only if you need per-sprite overbright; otherwise Canvas glow + higher threshold. Prefer **Screen** blend; keep intensity modest; use HDR luminance cap ([Godot Environment / glow](https://docs.godotengine.org/en/stable/tutorials/3d/environment_and_post_processing.html)).
- Elemental FLOW: trail **follows weapon/body arc** (`../rendering/gear-motion.md`); emissive mask keyed to tip, not a second bobbing light on the torso.

### Don’t
- **Wash the silhouette** — bloom radius large enough to melt limbs into a light blob at formation zoom.
- **Eat weapon edges** — halo wider than the blade/staff thickness; outline + bloom stacking doubles the wipe.
- **Chest light as second key** — fights bible light direction; walk looks strobed.
- **Ignore OLED vs LCD** — OLED: high bloom + pure emissive → clipping, smear, battery; LCD: same settings look dimmer/washed. QC both.
- **Stack transparent glow layers** on many units → overdraw death on tile GPUs (mobile bandwidth).
- Assume Editor bloom = device bloom (different renderer asset / HDR / API).

### Bloom / emissive do–don’t (short card)
| Do | Don’t |
|----|-------|
| Masked emissive on tip/chest only | Full-screen bloom for every soldier |
| Threshold just under HDR peak | Threshold 0 + high intensity “for style” |
| Billboard / low-res additive for mass units | Per-unit high-res Gaussian bloom |
| QC silhouette with bloom disabled | Ship look that only works with bloom on |
| Mobile quality asset parity | Desktop-only tuning |
| Trail follows gear arc | Independent floating glow orb |

### Sources
- Nordeus bloom-at-60 on mid phones: https://engineering.nordeus.com/post-processing-effects-at-60-fps-on-mid-range-smartphones-unite-berlin-2018/  
- Arm — texture/billboard bloom vs post: https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/post-processing-effects-for-mobile-at-gdc18  
- Godot glow / HDR 2D: https://docs.godotengine.org/en/stable/tutorials/3d/environment_and_post_processing.html  
- Unity URP bloom mobile discrepancy: https://discussions.unity.com/t/addressing-the-discrepancy-in-bloom-effects-between-urp-editor-and-mobile-devices/1698886/1  
- Meta / mobile secondary-pass cost (bloom as resolve-heavy): https://developers.meta.com/horizon/documentation/native/android/gpu-impaired-algorithms/

---

## 4. Animation ↔ render pipeline overlap (must stay consistent across sheet frames)

When post-process, lighting, or outline shaders are applied, these fields are **contracts**, not “cleanup.”

| Must stay consistent | Why |
|----------------------|-----|
| **Pivot / baseline** | Bottom-center (grounded) or documented foot-contact; trim offsets preserved. Jitter ≠ animation ([fixed-cell contract](https://dev.to/framesprite/a-fixed-cell-contract-for-sprite-sheets-that-do-not-jitter-3167)). |
| **Cell size + padding** | Outline/glow shaders need room outside opaque pixels; packed cells without pad → clipped outlines, bleed. |
| **Value / exposure range** | Same midtone floor/ceiling so bloom threshold doesn’t fire randomly per frame. |
| **Outline weight** | Constant screen-px weight; no per-frame thicken. |
| **Emissive masks** | Same texel policy (where glow lives); mask alpha matches color alpha. Don’t paint chest emissive on idle and omit on walk. |
| **Light direction / normal convention** | One bible key; normals same green-Y convention and filter mode for all frames. |
| **Alpha policy** | Real transparency; no checkerboard baked in; no fringe from wrong premultiply. |
| **Palette / material steps** | Stylized steps locked; compression must not invent mid-colors that bloom differently. |

### Pipeline QC (overlay pass)
1. Freeze world position; overlay all walk frames on the pivot crosshair.
2. Confirm foot-contact Y and head bob envelope (intentional only).
3. Toggle **bloom off/on** — silhouette ID must survive.
4. Toggle **outline shader** — weight constant; no cell-edge clip.
5. Scrub emissive mask — no frame drops the chest/weapon glow unless pose hides it.
6. Device check: mid Android LCD + one OLED; mobile renderer asset.

### Cross-links
- Walk poses/timing: `../iso-walk-cycles/NOTES.md`, `iso-walk-cycles.md`
- Idle→walk→attack continuity: `../rendering/FLOW.md`
- Weapon arcs / elemental trail: `../rendering/gear-motion.md`
- Style / silhouette / mobile ad bar: `NOTES.md`
- QC skill: Character sprite consistency QC (hero ref, bible, weapon motion)

---

## Top must-haves checklist (this slice)
1. [ ] Locked key light + value range across every walk frame/facing  
2. [ ] Fixed pivot/baseline + cell padding for outline/glow  
3. [ ] Phone-px silhouette + role read (bloom off)  
4. [ ] Outline weight constant; no soft walk smears  
5. [ ] Emissive masked + thresholded; trail follows gear arc  
6. [ ] Mobile post-process asset parity (Editor ≠ ship look)  
7. [ ] Mips/filter/compression verified at real scale  

## Top pitfalls (this slice)
1. Light or exposure drifting per frame → pulse/skate illusion  
2. Bloom/halo eating weapon silhouette at RTS/phone zoom  
3. Outline clipped at cell edge or thickening mid-cycle  
4. Detail density that dies into shimmer after mip/compress  
5. Desktop bloom tuned; mobile dark, clipped, or overdrawn  

## Counsel for Renders / Devs (short)
**Animate under a locked light and pivot contract; prove the walk reads at phone pixels with bloom off; add glow as a masked accent on the gear arc — never as the silhouette.** Devs: ship the mobile renderer/HDR settings artists actually QC’d.

## Gaps / risks
- No Bot Campus–specific measured px footprints in-repo yet — treat table above as starting bar; measure live UI and update.  
- Engine split (Unity URP 2D vs Godot HDR 2D) means bloom recipes differ — document per-skinId which stack is live.  
- Sibling `rendering/` covers FLOW/gear; keep emissive trail ownership there to avoid double standards.  
- OLED clipping not yet instrumented in campus QC skill — recommend adding “bloom off silhouette” + “OLED still” to that checklist.
