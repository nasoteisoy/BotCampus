# Austerlitz 1805

A small real-time Napoleonic corps tactics game for phones, and a sibling of [Bridge Too Far](../bridge-too-far/). You command a French corps on the morning of 2 December 1805, either through its division commanders (tell them which zone to take or hold and they deploy the battalions themselves) or battalion by battalion. The Russo-Austrian army comes down off the Pratzen Heights in the fog toward the villages on the Goldbach stream. Line, column and square, cavalry charges, roundshot and canister, and one battalion of the Imperial Guard held back for the decisive moment. Historical place names are used; all code, art, map layout and text are original.

**Play:** https://nasoteisoy.github.io/BotCampus/games/austerlitz/
**Install:** open the link, then Share ▸ *Add to Home Screen* (iOS) or menu ▸ *Install app* (Android/Chrome). It works offline after the first load.

## How to play
- **Start screen:** pick 🙂 Easy / 😐 Normal / 💀 Hard, then ▶. The choice is remembered. A short 9-step tutorial opens the first time; replay it from ❓ (🎓).
- **Deploy 🇫🇷:** before the clock starts, place your corps in the shaded zone: the French bank west of the Goldbach plus the Sokolnitz bridgehead. **Drag a division commander ⚑** (new in v3) and his whole division re-forms around him, or drag single units to fine-tune, or **draw his line** ✏️ (new in v4). See *Setting up with commanders* and *Line orders* below. 🎲 Auto cycles three ready-made setups (Goldbach line, forward at Sokolnitz, Santon anchor), and ▶ starts the battle. The Allies pick one of four plans: massed on the heights, already descending, a northern thrust, or a southern thrust. Each plan sends a smaller wing at Santon.
- **Division commanders ⚑** (new in v2): the bottom strip lists your divisions (name, zone, ⚔/🛡 posture, strength bar). Tap a commander's marker on the map or his strip button, then tap a place. See *Division commanders* below.
- Tap a unit (or its chip in the roster) to select it, then tap the ground to march. That is a **direct order**: the unit leaves its commander until the order is done (see below).
- Order bar: ➜ Move · ⏩ Quick · ⚔️ Charge · 🎯 Fire · 🛡️ Hold · ▦ Form · ↩️ Div (back under the commander).
  - **Quick:** faster march, no firing on the move. Tires cavalry.
  - **Charge:** tap an enemy. With cavalry selected, tapping an enemy charges it directly.
  - **Fire + enemy** = fire at it. **Fire + ground** = area fire.
  - **Hold:** stand fast, hold fire until the enemy is close, and form square on its own when enemy cavalry threatens.
  - **Form:** the button shows the next formation. Infantry cycles ▬ Line → ▮ Column → ◻ Square. Guns toggle 🐴 Limber / 💥 Unlimber.
- 👥 selects all units. ⏸ pauses (you can still give orders), and 1x/2x sets the speed.
- Drag to pan, pinch to zoom (mouse wheel on desktop). **Long-press then drag** to box-select. **Double-tap a roster chip** to center the view on that unit.
- The unit card shows stars, HP, ammo (or ♞ horse stamina for cavalry) and morale, the current formation and ranges, plus badges (🏠 in a village, ⛰ high ground, ⭐ near the Marshal, 🛡️ holding, 💨 blown, ⁍+ resupplying).
- 🔊/🔇 toggles sound (on by default, remembered). Sound is synthesized live with WebAudio, so there are no audio files: musketry, cannon, canister, drums, bugles and hooves. Short vibrations confirm orders and mark losses, charges and flag changes. 📳 in ❓ help turns them off. They're feature-detected (iOS Safari has no vibrate API, so nothing happens there).

## Division commanders ⚑
Your corps is split into six divisions. Each has a commander marker (a coloured disc with initials and a swallow-tail pennant) that rides behind his troops. A coloured pip above each unit's strength bar shows its division; a hollow white pip means the unit is under your direct orders.

| Division | Units |
|---|---|
| **Vandamme** (IV Corps) | 4e and 46e de Ligne, foot battery section 1 |
| **St-Hilaire** (IV Corps) | 28e de Ligne, 10e Léger, foot battery section 2 |
| **Legrand** (IV Corps) | 26e Léger, foot battery section 3, horse battery section 1 |
| **Lannes** (V Corps) | 57e de Ligne (Santon garrison), horse battery section 2 |
| **Murat** (cavalry reserve) | cuirassiers (2 squadron pairs), hussars (2 squadron pairs), horse battery section 3 |
| **Garde** | 🦅 Guard Grenadiers, once committed |

The Allies use the same system: **Miloradovich**, **Kolowrat** (Austrians), **Langeron**, **Kamensky** (Pratzen garrison), **Liechtenstein** (cavalry) and **Dokhturov** (the reinforcement columns from the east). Their commanders appear on the map once you have spotted some of their troops.

**Setting up with commanders** (new in v3)
- In the deploy phase, drag a commander's marker anywhere in the shaded French area. The area pulses with a white dashed border while you drag, and a ghost of the division (translucent unit blocks, dashed lines and a facing arrow) shows where every unit will stand before you let go. Drops outside the area are clamped to its edge.
- Or tap a commander (map or strip) and then tap a spot inside the area.
- On release the division re-forms instantly, using the same planner the commanders use in battle: front line, supports, guns on good ground with a field of fire, cavalry on the flanks, nothing in the stream and no overlaps. It costs no game time.
- ✏️ Line: draw a line instead (see *Line orders*).
- ⟲ / ⟳ on the command bar turn the selected division 30° (it re-forms facing the new way). ⚔️ Take / 🛡️ Hold set its opening posture.
- With a commander selected, tapping *outside* the area gives him his opening zone instead (as in v2), which he marches to when the battle starts.
- Single units can still be dragged afterwards. Murat's cavalry can be placed like any division; the 🦅 Garde stays in reserve until committed.

**Line orders ✏️** (new in v4)
- Select a commander, tap ✏️ **Line** on the command bar (it lights up), then draw on the map with one finger: a quick straight stroke or a freehand curve. Two fingers still pinch-zoom, and a stroke shorter than ~40 m counts as an ordinary tap. Line mode switches itself off after one line.
- While you draw, a ghost of the division shows where each unit will stand. On release the line stays on the map, dashed in the division colour, with ticks on the side it faces, a ⇅ arrow in the middle and the planned slot boxes.
- **Facing:** by default the line faces the enemy (spotted troops nearby, else their nearest flag). If the enemy is straight down the line, it faces away from where the division stands. Tap the ⇅ arrow on the map (or ⇅ **Flip** on the bar) to turn the whole line round.
- **The formation:** the front-line battalions are spread evenly along the line, centre to centre at least 58 m and at most 170 m apart. If the line is too short for all of them, the extras become supports. Every battalion faces straight across the line where it stands, so a curved line is followed slot by slot. Supports stand 70 m behind the gaps, battered battalions 140 m back, light infantry 55 m ahead as skirmishers (in cover if there is any), guns at the two ends (extra guns in gaps of 100 m or more) on the best nearby ground for a field of fire, and cavalry pairs behind the wings. A cavalry-only division puts its squadrons on the line. A division with only light infantry (Legrand) puts it on the line.
- **The Goldbach:** slots never go in the stream or a pond. If the line crosses the stream, the division keeps to its own (near) bank plus any bridge on the line. Battalions that no longer fit become supports. If the near-bank part is too short for even one battalion, the whole dry line is used.
- 🛡️ **Hold:** the division marches in column, deploys onto the line and holds it. Line battalions stay on their slots and turn in place to fire. They only charge enemies within ~70 m, and dress back onto the line with a short side-step instead of wheeling away. ⚔️ **Take:** the same, but once the line has formed and nobody is within ~160 m, it steps forward 45 m at a time (up to 300 m), stopping when it makes contact or would step into the stream.
- **In setup:** a line drawn inside the blue area places the division on it instantly (points outside the area are pulled back to its edge), and it keeps that line as its order when the battle starts. Dragging the commander or one of his units afterwards replaces the line.

**Giving a zone order**
- Tap a commander on the map (or his button in the strip). The command bar appears: ⚔️ **Take** · 🛡️ **Hold** · 👥 **Units** (select his units for direct orders) · ↩️ **Rejoin** · ✖ **Done**.
- Tap a place: within reach of a named place (Santon, Pratzen, Sokolnitz, Telnitz, Puntowitz, Girzikowitz, Pratze, the Pheasantry, Blasowitz) it snaps to it; anywhere else it makes a zone about 95 m across. You can also **drag from the commander** to the spot, or, with a commander selected, **press, hold and drag** on the map to draw a zone of any size (55–240 m). Tapping an enemy unit gives an attack zone around it.
- Pick the posture first or afterwards; changing it re-issues the order. New divisions start on 🛡️ Hold *in place*: they keep the spots you deployed them on until you give a zone.
- Your zones are drawn on the map as dashed circles in the division colour, with an arrow from the commander. A selected commander also shows his plan: a faint dashed rectangle for each unit's slot (the unit's own footprint, turned to its facing), with a dashed line from any unit still on its way.

**What the commander does**
- **Planned formation (v3):** every order is turned into a fixed plan once: each unit gets its own slot, and the plan is only redrawn when the zone, the facing (by more than ~25°), the posture or the division's make-up changes. So units march to their own slot, never to the zone centre, and they don't reshuffle.
  - **Front line:** the fittest battalions stand side by side, facing the threat (Hold) or the direction of advance. Spacing is 64–100 m centre to centre (a battalion frontage plus a gap), spread to fit the zone.
  - **Supports:** a second line 70 m behind, offset to sit behind the gaps. Battered or wavering battalions go to a reserve line 140 m back.
  - **Skirmishers:** light infantry 55 m in front of the line, in the best cover nearby.
  - **Guns:** on the flanks of the line, on the best nearby ground for height and line of sight.
  - **Cavalry:** squadron pairs on the wings, outside the guns.
  - Divisions sent to the same zone stand side by side instead of on top of each other.
  - Battalions move in column and deploy into line when they reach their slot. Idle friends keep at least 30 m apart.
- 🛡️ **Hold:** faces the nearest enemy threat, front line slightly forward in the zone. Badly hurt battalions rotate to the reserve line and fresh ones fill the gaps.
- ⚔️ **Take:** the foot of every division sent to the same zone gathers ~340 m short and goes in together. Battalions keep level with the slower ones rather than arriving one by one. Enemy troops standing between the division and the zone are dealt with first: the division forms a battle line at musket range facing them, the guns unlimber behind it, and it closes in to charge once they waver. Guns support the assault from 200–430 m on your side of the zone. Cavalry waits behind the attack for a target. When the zone is taken the division digs in as if holding it.
- Always: infantry forms **square** when enemy cavalry threatens, and moves in column and fights in line. Guns unlimber when they reach their spot. Spots avoid the Goldbach and ponds (so troops only cross it to get somewhere), and guns stay out of houses and woods. Squadron pairs of the same regiment charge together.

**Direct control** still works exactly as in v1. Any order given to a unit (move, charge, fire, form, hold) takes it out of its division for the moment, and it drops back under its commander once the order is finished. 🛡️ Hold is the exception: it lasts until you tap ↩️ **Div** on the unit or ↩️ **Rejoin** on the command bar. Marshal Soult rallies panicked units on his own unless you give him an order.

## Formations
| | Fire | Speed | Against cavalry | Against guns |
|---|---|---|---|---|
| ▬ **Line** | full volley across a wide front | slow, must wheel before marching | weak, terrible on the flank | thin target |
| ▮ **Column** | about a third | fast, best for bayonet charges | middling | roundshot ploughs through the depth |
| ◻ **Square** | weak, all-round | crawls | cavalry bounce off | a juicy target |

Changing formation takes a few seconds (veterans are quicker, shaken troops slower). A unit caught mid-change is vulnerable, though a half-formed square already helps. Light infantry (Léger, Jägers, Grenzers) always fights in open order: a small target, good in villages and woods, easy prey for cavalry in the open.

## Cavalry
- Each regiment is split into **two squadron pairs** (half a regiment each). A pair has half the men and hits half as hard. Two pairs charging the same target together hit like the whole regiment, and a commander sends a regiment's second pair in alongside the first.
- Charges need a run-up: momentum builds over the first ~160 m, so a charge from close in hits softly.
- Flanks and rear hit much harder. So do units that are wavering, changing formation, limbered, or routing.
- After a charge the horses are **blown 💨** and can't charge again until they rest. The ♞ bar on the card shows stamina.
- **Squares stop cavalry.** A charge into a formed square bounces off with losses to the riders.
- Infantry that sees a charge coming gives it a closing volley.

## Artillery
- Each battery is split into **three 2-gun sections** that deploy independently. Together they fire as much as the old 6-gun battery did, so one section on its own does a third of that.
- Guns must **unlimber 💥** (5 s) to fire and **limber 🐴** (4 s) to move. They only cross the Goldbach on the bridges.
- **Roundshot** (out to ~650 m for foot guns) skips along the ground and bounces through every rank in its path. Deep columns, squares and lines hit from the end (enfiladed) suffer most. The hit-% in the aim line accounts for how wide the target looks from the gun.
- **Canister** inside the red ring (~170 m) is a short, deadly cone.
- Firing makes gunsmoke. It drifts with the wind and blocks sight.

## Fire distance and sight
- Select a unit to see its **range rings**. Solid = effective range, dashed = maximum range, red = canister. Cavalry shows its charge reach, and the Marshal his rally aura. The tint is clipped by line of sight.
- Drag while Fire or Charge is selected, or long-press an enemy, to draw an **aim line** with distance and hit-% (or charge odds). ✖ means out of range or no sight.
- Round 🎯 button (bottom-left): rings for **all** your units at once. Off by default, remembered.
- Tap a spotted enemy with nothing selected to see its **threat range** in red.
- **Fog 🌫:** the morning is foggy and spotting ranges are short (less so on high ground). The fog lifts between about 7:30 and 5:30 on the clock. ≋ next to the clock means fog is still about.
- **Hills ⛰:** the Pratzen crest blocks sight. Units on high ground see farther and shoot slightly better downhill. Villages and woods block sight; gunsmoke clouds thin it.

## The Imperial Guard 🦅
One battalion of Guard Grenadiers waits off-map. The 🦅 button next to 🎯 counts down until the Guard is ready (7:00 on the clock). After that, one tap commits it, and that decision can't be undone. It marches in from the west edge and lifts the whole corps' morale. If you never call it, it arrives on its own at 4:00.

## Win
Hold more of the 3 flags (**Sa**nton, **Pr**atzen, **So**kolnitz) when the 10:00 clock runs out, or break the enemy army. You start holding Santon and Sokolnitz; the Allies hold the Pratzen. A ring around each flag shows capture progress (8 s). Only steady or shaken foot that isn't under fire can capture. Cavalry and guns can only contest. An army breaks when 70% of its strength is destroyed or broken (a squadron pair counts as half a unit, a gun section as a third).

## Units
| French (you) | Allied (AI) |
|---|---|
| Marshal Soult (morale aura, rallies) | Gen. Kutuzov |
| 4 × Line infantry (4e, 28e, 46e, 57e de Ligne) | 5 × Line infantry (Novgorod, Apsheron, Kursk, Podolia; Salzburg 🇦🇹) |
| 2 × Light infantry (10e, 26e Léger) | Russian Jägers, Grenz battalion 🇦🇹 |
| Cuirassiers, 2 squadron pairs (heavy cavalry) | Austrian cuirassiers, 2 squadron pairs (heavy) |
| Hussars, 2 squadron pairs (light cavalry, fast) | Uhlans, 2 squadron pairs (light) |
| Foot battery, 3 × 2-gun sections | Russian battery, 3 × 2-gun sections |
| Horse battery, 3 × 2-gun sections (lighter, quicker) | Austrian battery, 3 × 2-gun sections |
| 🦅 Imperial Guard Grenadiers (reserve) | Reinforcements from the east (see below) |

Russians wear green, Austrians white, the French blue. Each unit has HP (losses also cut firepower and shrink the block on the map), morale, ammo, cavalry stamina, a formation and experience (★–★★★). Survivors keep their stars between rematches (🎖 after ★★★; v2 keeps them under a new save key, so v1 veterans start fresh). ♻️🎖 in help or after-action resets them.

## Rules in short
- **Morale ring:** green Steady → yellow Shaken (worse aim) → orange Wavering (won't advance on the enemy, may still fall back) → red Panic (runs, ignores orders) → grey Broken (routs off the map). Fire suppresses, losses and nearby destroyed units shake friends, and a charge bearing down on an already shaken unit shakes it further (squares shrug it off).
- **Rally ⭐:** a panicked or broken unit near its Marshal, and out of fire for a few seconds, recovers to Shaken. Morale also recovers about twice as fast near him.
- **Ammo and stragglers:** ammo runs down. Units west of the Goldbach (or near Sokolnitz), or next to the Marshal, refill when they haven't fired for a few seconds (⁍+). Out of action there, stragglers slowly return to the ranks (up to 70% strength).
- **Villages 🏠:** best cover against musketry and guns, and a strong defensive bonus against charges, especially cavalry. Streams slow troops and weaken them in a fight.
- **Reinforcements ⚠:** Allied columns (Dokhturov's division) arrive from the east edge (Easy: 2 battalions + a battery of three sections after ~4 min; Normal: the same after ~3½ min; Hard: 3 battalions + two pairs of light cavalry after 3½ min). A red arrow marks where they come in.
- **Late push ⚠:** in the last 2–3 minutes the Allies throw everything at your most weakly held flag. A toast warns you.
- **Difficulty** changes Allied accuracy and morale, how quickly the AI reacts, how long its lines trade volleys before pressing on, how readily its cavalry charges, the reinforcements, and on Hard their experience (+1 star).
- **AI:** the Allied army has the same two layers as you. A strategist picks the objective (wait on the heights, attack the villages, counterattack a flag being captured, defend, late push) and hands zones to its division commanders: Kamensky always garrisons the Pratzen, and a wing (Kolowrat, plus Miloradovich in the northern plan) goes for Santon. The commanders then deploy their battalions with exactly the logic described under *Division commanders*. Cavalry waits for a flank, a gun, a formation change or a routing unit, and countercharges enemy horse. The general rides to rally panicked units and wavering units fall back. With 🎲/`?auto=1` the French run on the same system.

## After action
The end screen shows the result and how the army broke or time ran out. It lists each of your units with kills, remaining HP, stars and status, highlights the MVP, shows a flag timeline (Sa / Pr / So) with the Guard, reinforcements and push marked, counts charges, squares that held and rallies, and rates the fight ★–★★★. Rematch carries veteran experience over.

## Balance (v2.2 / v4 check)
v4 lets a battalion in line dress its ranks with a short side-step instead of wheeling away (both armies), which helps whoever is holding a position. Normal, 80 games each on the v3 settings: AI vs AI 34/80 (42%), sensible zone plan 55/80 (69%), rush with the Guard held back 7/40 (18%). Single batches of 40 swung from 58% to 80%. Allied morale 1.14 was tried and dropped AI vs AI to 33% without moving the zone plan, so the v3 settings were kept.

## Balance (v2.1 / v3 update)
The planned formations made division commanders much better, for both armies, and a scripted player using only zone orders jumped from 54% to 79% on Normal. Normal Allied accuracy and morale were raised to 1.05 / 1.1 (from 1.0 / 1.03). Easy and Hard are unchanged. French wins from the same harness (same scenarios as below):

| | AI vs AI | Sensible zone plan | Rush, Guard held back |
|---|---|---|---|
| Easy | 28/40 (70%) | 34/40 (85%) | – |
| Normal | 37/80 (46%) | 48/80 (60%) | 11/40 (28%) |
| Hard | 9/40 (23%) | 13/40 (33%) | – |

Formation checks (headless, 390×844, a player selects a commander and taps a zone: Take and Hold, named places and free zones, small zones by the Goldbach and at the map edge). In every Hold case there were no overlapping blocks. The median nearest-neighbour distance was at least one unit frontage (battalions 71–128 m apart, against 32 m piled up in v2), and the front line lay within 0–9 m of a straight line (82 m in v2).

## Balance (v2.0)
French wins on the final settings, from a headless harness (`AUS.fast`). Each cell pools two batches of 24–40 games, so treat it as roughly ±6 points.
- **AI vs AI:** both sides are run by the strategist + division commanders.
- **Sensible zone plan:** a scripted player who only gives commander zone orders. At the start Vandamme and St-Hilaire ⚔ take the Pratzen, Legrand 🛡 holds Sokolnitz, Lannes 🛡 holds the Santon and Murat 🛡 holds a zone behind the Goldbach. The Guard is called at 7:00 and sent to ⚔ the Pratzen, and Murat ⚔ counterattacks any French flag that is being captured or has been lost.
- **Rush, Guard held back:** the same opening, but the Guard only holds Sokolnitz.

| | AI vs AI | Sensible zone plan | Rush, Guard held back | v1 AI vs AI |
|---|---|---|---|---|
| Easy | 62/80 (78%) | 61/80 (76%) | 25/40 (63%) | 71% |
| Normal | 45/76 (59%) | 43/80 (54%) | 13/40 (33%) | 52% |
| Hard | 17/64 (27%) | 19/64 (30%) | 2/40 (5%) | 24% |

The division commanders made Allied attacks more coherent, so Allied accuracy and morale were lowered on every difficulty (Easy acc 0.82 / morale 0.9 / push in the last 2:00; Normal 1.0 / 1.03; Hard 1.0 / 1.0) to bring the numbers back to the v1 targets.

Commander checks from the same runs:
- Only 1–3% of standing French units overlap a friend within 20 m (Allies 4–9%, mostly where several divisions crowd the Pratzen).
- 87–96% of battalion-moments with formed enemy cavalry within 150 m were in square or forming one.
- 100% of gun sections that reached their assigned spot unlimbered there.

## Balance (AI-vs-AI harness, v1.0, before division commanders)
Results are French wins with the AI playing both sides (the French AI commits the Guard once it is available, 7:00 on the clock, if the fight needs it). "Passive" means the French use an auto-deploy setup and never give an order, apart from the Guard arriving on its own at 4:00.

| | AI vs AI | Passive |
|---|---|---|
| Easy | 100/140 (71%) | 1/20 (5%) |
| Normal | 83/160 (52%) | 0/32 (0%) |
| Hard | 39/160 (24%) | 0/20 (0%) |

The AI-vs-AI numbers pool several batches run on the final settings. Single batches of 50 swung by ±10 points, so treat each figure as roughly ±4. Unlike Bridge Too Far, a corps that never gets an order almost always loses, even on Easy: you have to fight this one.

Most games end with one army breaking about 6–8 minutes in. Roughly one in five goes to the clock.

## Files
`index.html` (UI + PWA tags) · `game.js` (all game code, vanilla JS + canvas) · `manifest.webmanifest` · `sw.js` (offline cache, currently `aus-v4`; bump `CACHE` when files change. It only clears its own `aus-*` caches, so Bridge Too Far's cache on the same origin is left alone) · `icon-192.png`, `icon-512.png` (generated with Python/PIL).

## Dev
No build step. Serve the repo (`python3 -m http.server`) and open `/games/austerlitz/`.
Debug hooks: `?auto=1` lets the AI play both sides. `window.AUS.fast(seconds)` fast-forwards the simulation silently. `AUS.start()`, `AUS.autoDeploy()` and `AUS.begin()` drive the deploy phase. `AUS.setDiff('easy'|'normal'|'hard')`, `AUS.commitGuard()` and `AUS.DIFFS` are there for tuning, and `AUS.G` is the live game state. `AUS.orderDiv('van', 'Pratzen', 'attack')` gives a zone order (division key `van`/`sth`/`leg`/`lan`/`mur`/`gar`, a place name or `{x, y, r}`, `'attack'` or `'hold'`), and `AUS.ZONES` lists the named places. `AUS.orderLine('van', [{x, y}, ...], 'hold'|'attack')` gives a line order (in setup it places the division), `AUS.flipLine('van')` flips it, `AUS.lineGhost` previews it. `AUS.placeDiv('van', x, y, angle)` does a setup drop (deploy phase only), and `AUS.divSetupLayout`, `AUS.rotateDiv` and `AUS.inZoneRect` expose the same logic. The version tag (`v2.2`) is shown at the bottom of the ❓ help screen.
