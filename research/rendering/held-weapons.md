# Held weapon & shield animation (2D sprites)
**Date:** 2026-09-20 · **Researcher B**  
**Parent index:** `NOTES.md` · **Short checklist (A):** `gear-motion.md` · **Walk body motion:** `../iso-walk-cycles/NOTES.md`

## Scope
How industry keeps **swords, spears, guns, shields** attached and moving with limbs across walk/idle/attack and multi-dir sheets. Body walk keys (contact/down/pass/up) stay in iso-walk-cycles; here = gear attachment, arcs, layering, smears, engine sockets.

## Industry standards / common practices

### 1. Body first, then re-arm (frame-by-frame / pixel)
Proven pixel workflow (SLYNYRD Pixelblog 60 — Move with gun):
1. Animate full walk/run **without** caring about the final weapon arms.
2. Remove ordinary arms on each frame.
3. Paint **weapon-holding arms** that inherit the same shoulder position and bounce.
4. Invent a small sway of the weapon consistent with stride — tip path continuous, not glued stiff and not teleporting.

Same idea for sword/shield soldiers: legs/torso establish weight; gear is a second pass that must pass the “standing QC” (idle→walk, walk A↔B).

Source: [SLYNYRD Pixelblog 60](https://www.slynyrd.com/blog/2026/1/26/side-view-run-n-gun)

### 2. Hand socket / child-of-hand (skeletal / engine)
When the pipeline supports layers or bones:
- Parent weapon to **hand bone** (or Marker2D / WeaponSlot under the hand).
- Set weapon **local pivot at the grip** (hilt), then rotate into hold angle.
- Animate the **slot** (pos/rot); swap child weapon sprite/scene for equipment changes — do not rewrite body anims per sword.
- Unity 2D Animation: child Transform under hand bone + SpriteRenderer; SpriteSkin for deforming limbs.
- Godot: AnimationPlayer keys the slot Node2D; swap WeaponSprite child ([forum pattern](https://forum.godotengine.org/t/how-to-create-a-stable-weapon-system/100168)).
- Aseprite: character layers + separate weapon layers; export weapon strip; engine or JSON carries hand points (Aseprite does not natively export pivots — use guide/point layers or importers like MetaSprite).

Sources: [Charios weapon run-cycle](https://charios.com/blog/run-cycle-with-weapon-2d); [Aseprite character weapons thread](https://community.aseprite.org/t/character-weapons/4186); Unity SpriteSkin docs; Godot forum weapon slot.

### 3. Layer / draw order (clipping)
- Blade often needs **over** torso on some frames and **under** arm/hand on others.
- Classic sheet trick (Pixelsource-style weapon templates): duplicate attack frames — one “under” (full weapon) and one “over” with hilt erased so hand covers grip.
- In skeletal tools: key Z-order / sibling index at problem frames; micro-adjust hand bone if tip clips leg.

### 4. Grip family & length consistency
- Lock grip type in the bible: one-hand high, two-hand spear underhand, gun stock to shoulder, etc.
- Same grip family and **weapon length** across all facings — length change per angle reads as a different item.
- Shield as counterweight: off-hand opposite sway or brace; frozen cardboard only for explicit “guard” idle.
- 8-dir attacks: weapon stays in the **same hand** every angle (no accidental mirror swap) — [SLYNYRD Pixelblog 56](https://www.slynyrd.com/blog/2025/5/23/pixelblog-56-top-down-character-attack-animation).

### 5. Attack phases for held gear
Typical 4–5 phases (timing sells weapon weight):
| Phase | Gear behavior | Smear? |
|-------|---------------|--------|
| Anticipation | Draw back / wind-up | No |
| Smear | Large travel on strike path | Yes (path-defining) |
| Rebound | Optional (heavy ground hit) | Brief |
| Follow-through | Full extension; hold longer | No |
| Recover | Return toward idle | No |

Heavier weapons → longer anticipation / follow-through / recover (e.g. hammer vs short sword timings in Pixelblog 56). Elemental trails must follow the **physical tip arc**, not a second unrelated motion.

### 6. Move + act layering (advanced)
For shoot-while-run / attack-while-walk: split **legs** and **torso+weapon** layers so lower body cycles independently while upper body plays shoot/swing frames (Pixelblog 60 Move & Shoot). Campus iso soldiers may stay full-frame baked; note the pattern for future modular sheets.

## Top must-haves
1. Bible states armed state + grip family + weapon/shield silhouette.
2. Body motion complete before final gear arms (or socket parented to hand).
3. Continuous tip path across idle→walk and walk neighbors; shield moves with off-arm.
4. No freeze / teleport / appear-disappear when bible says armed.
5. Attack: clear wind-up → strike → recover; smears only on strike path.
6. Mirror ban when flip would change handedness.
7. VFX trails track the same arc as the blade/muzzle.

## Top pitfalls
- Cardboard-glued weapon (campus “frozen gear” fail).
- Tip teleports between frames or changes length per facing.
- Soft glow smear eating the blade silhouette on walks.
- Flip-induced wrong-hand sword/shield.
- Smears on anticipation or recover (noisy, weakens hit read).
- Clipping unresolved (no under/over split, no Z-order keys).
- Designing a new weapon mid-sheet instead of the bible item.

## Map to campus QC skill
Skill standing check: *“sword/shield/gear must move naturally with arms/body… Fail if gear is frozen, teleports, ignores limb motion, or appears/disappears mid-loop when the bible says armed.”*  
This note is the industry backing for that fail condition + practical re-arm / socket / smear recipes. Complements A’s `gear-motion.md` (short bar) with sources and engine patterns.

## Implications for Renders
- Prompt: name the exact weapon+shield from the bible; require grip visible; “weapon moves with arm, tip follows shoulder bob.”
- Negative: “frozen weapon”, “weapon floating”, “missing shield”, “different sword.”
- After gen: flip through strip focusing **only** on tip and shield edge — if tip jumps or shield is stamped, regen that frame.
- Prefer unique L/R for armed units rather than hope flip works.
- If Dev later needs swappable loot: export hand marker coords or keep modular arm+weapon layers; until then bake correct gear every frame.

## Cross-links
- `NOTES.md` · `consistency.md` · `gear-motion.md` (A short list) · `FLOW.md` · `../iso-walk-cycles/NOTES.md` (body walk; weapon tip arc with shoulder bob)
