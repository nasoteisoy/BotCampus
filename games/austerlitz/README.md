# Austerlitz 1805

A small real-time Napoleonic corps tactics game for phones, and a sibling of [Bridge Too Far](../bridge-too-far/). You command a French corps on the morning of 2 December 1805. The Russo-Austrian army comes down off the Pratzen Heights in the fog toward the villages on the Goldbach stream. Line, column and square, cavalry charges, roundshot and canister, and one battalion of the Imperial Guard held back for the decisive moment. Historical place names are used; all code, art, map layout and text are original.

**Play:** https://nasoteisoy.github.io/BotCampus/games/austerlitz/
**Install:** open the link, then Share ▸ *Add to Home Screen* (iOS) or menu ▸ *Install app* (Android/Chrome). It works offline after the first load.

## How to play
- **Start screen:** pick 🙂 Easy / 😐 Normal / 💀 Hard, then ▶. The choice is remembered. A short 5-step tutorial opens the first time; replay it from ❓ (🎓).
- **Deploy 🇫🇷:** before the clock starts, place your corps in the shaded zone: the French bank west of the Goldbach plus the Sokolnitz bridgehead. Tap a unit and then a spot, or drag it there. 🎲 Auto cycles three ready-made setups (Goldbach line, forward at Sokolnitz, Santon anchor), and ▶ starts the battle. The Allies pick one of four plans: massed on the heights, already descending, a northern thrust, or a southern thrust. Each plan sends a smaller wing at Santon.
- Tap a unit (or its chip in the roster) to select it, then tap the ground to march.
- Order bar: ➜ Move · ⏩ Quick · ⚔️ Charge · 🎯 Fire · 🛡️ Hold · ▦ Form.
  - **Quick:** faster march, no firing on the move. Tires cavalry.
  - **Charge:** tap an enemy. With cavalry selected, tapping an enemy charges it directly.
  - **Fire + enemy** = fire at it. **Fire + ground** = area fire.
  - **Hold:** stand fast, hold fire until the enemy is close, and form square on its own when enemy cavalry threatens.
  - **Form:** the button shows the next formation. Infantry cycles ▬ Line → ▮ Column → ◻ Square. Guns toggle 🐴 Limber / 💥 Unlimber.
- 👥 selects all units. ⏸ pauses (you can still give orders), and 1x/2x sets the speed.
- Drag to pan, pinch to zoom (mouse wheel on desktop). **Long-press then drag** to box-select. **Double-tap a roster chip** to center the view on that unit.
- The unit card shows stars, HP, ammo (or ♞ horse stamina for cavalry) and morale, the current formation and ranges, plus badges (🏠 in a village, ⛰ high ground, ⭐ near the Marshal, 🛡️ holding, 💨 blown, ⁍+ resupplying).
- 🔊/🔇 toggles sound (on by default, remembered). Sound is synthesized live with WebAudio, so there are no audio files: musketry, cannon, canister, drums, bugles and hooves. Short vibrations confirm orders and mark losses, charges and flag changes. 📳 in ❓ help turns them off. They're feature-detected (iOS Safari has no vibrate API, so nothing happens there).

## Formations
| | Fire | Speed | Against cavalry | Against guns |
|---|---|---|---|---|
| ▬ **Line** | full volley across a wide front | slow, must wheel before marching | weak, terrible on the flank | thin target |
| ▮ **Column** | about a third | fast, best for bayonet charges | middling | roundshot ploughs through the depth |
| ◻ **Square** | weak, all-round | crawls | cavalry bounce off | a juicy target |

Changing formation takes a few seconds (veterans are quicker, shaken troops slower). A unit caught mid-change is vulnerable, though a half-formed square already helps. Light infantry (Léger, Jägers, Grenzers) always fights in open order: a small target, good in villages and woods, easy prey for cavalry in the open.

## Cavalry
- Charges need a run-up: momentum builds over the first ~160 m, so a charge from close in hits softly.
- Flanks and rear hit much harder. So do units that are wavering, changing formation, limbered, or routing.
- After a charge the horses are **blown 💨** and can't charge again until they rest. The ♞ bar on the card shows stamina.
- **Squares stop cavalry.** A charge into a formed square bounces off with losses to the riders.
- Infantry that sees a charge coming gives it a closing volley.

## Artillery
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
Hold more of the 3 flags (**Sa**nton, **Pr**atzen, **So**kolnitz) when the 10:00 clock runs out, or break the enemy army. You start holding Santon and Sokolnitz; the Allies hold the Pratzen. A ring around each flag shows capture progress (8 s). Only steady or shaken foot that isn't under fire can capture. Cavalry and guns can only contest. An army breaks when 70% of its units are destroyed or broken.

## Units
| French (you) | Allied (AI) |
|---|---|
| Marshal Soult (morale aura, rallies) | Gen. Kutuzov |
| 4 × Line infantry (4e, 28e, 46e, 57e de Ligne) | 5 × Line infantry (Novgorod, Apsheron, Kursk, Podolia; Salzburg 🇦🇹) |
| 2 × Light infantry (10e, 26e Léger) | Russian Jägers, Grenz battalion 🇦🇹 |
| Cuirassiers (heavy cavalry) | Austrian cuirassiers (heavy) |
| Hussars (light cavalry, fast) | Uhlans (light) |
| Foot battery | Russian battery |
| Horse battery (lighter, quicker) | Austrian battery |
| 🦅 Imperial Guard Grenadiers (reserve) | Reinforcements from the east (see below) |

Russians wear green, Austrians white, the French blue. Each unit has HP (losses also cut firepower and shrink the block on the map), morale, ammo, cavalry stamina, a formation and experience (★–★★★). Survivors keep their stars between rematches (🎖 after ★★★). ♻️🎖 in help or after-action resets them.

## Rules in short
- **Morale ring:** green Steady → yellow Shaken (worse aim) → orange Wavering (won't advance on the enemy, may still fall back) → red Panic (runs, ignores orders) → grey Broken (routs off the map). Fire suppresses, losses and nearby destroyed units shake friends, and a charge bearing down on an already shaken unit shakes it further (squares shrug it off).
- **Rally ⭐:** a panicked or broken unit near its Marshal, and out of fire for a few seconds, recovers to Shaken. Morale also recovers about twice as fast near him.
- **Ammo and stragglers:** ammo runs down. Units west of the Goldbach (or near Sokolnitz), or next to the Marshal, refill when they haven't fired for a few seconds (⁍+). Out of action there, stragglers slowly return to the ranks (up to 70% strength).
- **Villages 🏠:** best cover against musketry and guns, and a strong defensive bonus against charges, especially cavalry. Streams slow troops and weaken them in a fight.
- **Reinforcements ⚠:** Allied columns arrive from the east edge (Easy: 2 battalions + a battery after ~4 min; Normal: the same after ~3½ min; Hard: 3 battalions + light cavalry after 3½ min). A red arrow marks where they come in.
- **Late push ⚠:** in the last 2½–3 minutes the Allies throw everything at your most weakly held flag. A toast warns you.
- **Difficulty** changes Allied accuracy and morale, how quickly the AI reacts, how long its lines trade volleys before pressing on, how readily its cavalry charges, the reinforcements, and on Hard their experience (+1 star).
- **AI:** Allied columns wait briefly on the heights, then march down toward the Goldbach villages. The main body gathers short of its objective and goes in together while a smaller wing heads for Santon. Battalions march in column, deploy into line when engaged, and form square when cavalry threatens. Cavalry waits in reserve for a flank, a gun, a formation change or a routing unit, and countercharges enemy horse. Guns seek high ground with a view of the objective. The general rides to rally panicked units, wavering units fall back, badly hurt ones hold a friendly flag, and a flag being captured is counterattacked.

## After action
The end screen shows the result and how the army broke or time ran out. It lists each of your units with kills, remaining HP, stars and status, highlights the MVP, shows a flag timeline (Sa / Pr / So) with the Guard, reinforcements and push marked, counts charges, squares that held and rallies, and rates the fight ★–★★★. Rematch carries veteran experience over.

## Balance (AI-vs-AI harness, v1.0)
Results are French wins with the AI playing both sides (the French AI commits the Guard once it is available, 7:00 on the clock, if the fight needs it). "Passive" means the French use an auto-deploy setup and never give an order, apart from the Guard arriving on its own at 4:00.

| | AI vs AI | Passive |
|---|---|---|
| Easy | 100/140 (71%) | 1/20 (5%) |
| Normal | 83/160 (52%) | 0/32 (0%) |
| Hard | 39/160 (24%) | 0/20 (0%) |

The AI-vs-AI numbers pool several batches run on the final settings. Single batches of 50 swung by ±10 points, so treat each figure as roughly ±4. Unlike Bridge Too Far, a corps that never gets an order almost always loses, even on Easy: you have to fight this one.

Most games end with one army breaking about 6–8 minutes in. Roughly one in five goes to the clock.

## Files
`index.html` (UI + PWA tags) · `game.js` (all game code, vanilla JS + canvas) · `manifest.webmanifest` · `sw.js` (offline cache, currently `aus-v1`; bump `CACHE` when files change. It only clears its own `aus-*` caches, so Bridge Too Far's cache on the same origin is left alone) · `icon-192.png`, `icon-512.png` (generated with Python/PIL).

## Dev
No build step. Serve the repo (`python3 -m http.server`) and open `/games/austerlitz/`.
Debug hooks: `?auto=1` lets the AI play both sides. `window.AUS.fast(seconds)` fast-forwards the simulation silently. `AUS.start()`, `AUS.autoDeploy()` and `AUS.begin()` drive the deploy phase. `AUS.setDiff('easy'|'normal'|'hard')`, `AUS.commitGuard()` and `AUS.DIFFS` are there for tuning, and `AUS.G` is the live game state. The version tag (`v1.0`) is shown at the bottom of the ❓ help screen.
