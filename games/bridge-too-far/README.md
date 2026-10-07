# Bridge Too Far

A small real-time WW2 squad tactics game for phones. British airborne hold a river town against a German garrison, autumn 1944, with one bridge in the middle. It's inspired by classic squad-level wargames. All names, art, map, and text are original.

**Play:** https://nasoteisoy.github.io/BotCampus/games/bridge-too-far/
**Install:** open the link, then Share ▸ *Add to Home Screen* (iOS) or menu ▸ *Install app* (Android/Chrome). It works offline after the first load.

## How to play
- **Start screen:** pick 🙂 Easy / 😐 Normal / 💀 Hard, then ▶. The choice is remembered. A short 4-step tutorial opens the first time; replay it from ❓.
- **Deploy 🪂:** before the clock starts, place your paras in the shaded drop zone (west bank plus the west end of the bridge). Tap a unit and then a spot, or drag the unit there. 🎲 Auto cycles three ready-made setups, and ▶ starts the battle. The Germans pick one of four setups (bridgehead, standard, north, south).
- Tap a unit (or its chip in the roster) to select it. Tap the ground to move.
- Order bar: ➜ Move · ⏩ Fast · 🐾 Sneak · 🎯 Fire · 🛡️ Hold · 💨 Smoke.
  - Tap an order, then tap the ground. **Fire + ground** = area fire. Tapping a visible enemy with a unit selected = fire at it.
  - Hold = ambush. The unit stays put, is harder to spot, and opens fire when enemies come close.
- 👥 selects all units. ⏸ pauses (you can still give orders), and 1x/2x sets the speed.
- Drag to pan, pinch to zoom (mouse wheel on desktop). **Long-press then drag** to box-select. **Double-tap a roster chip** to center the view on that unit.
- While your finger is down, a dotted line previews the move path. Moving units show their route and a destination pin.
- The unit card shows stars, HP, ammo and morale bars, the weapon range, plus badges (🏠 garrisoned, ⭐ rallying, 🛡️ holding, ⁍+ resupplying).
- 🔊/🔇 toggles sound (on by default, remembered). Sound is synthesized live with WebAudio, so there are no audio files. Short vibrations confirm orders and mark lost units, flag changes and nearby big explosions; 📳 in ❓ help turns them off. They're feature-detected (iOS Safari has no vibrate API, so nothing happens there).

## Fire distance (v3)
- Select a unit to see its **range rings**. Solid = effective range (good hit chance). Dashed = max range (poor hits). Soft tint is clipped by line of sight, so areas behind houses, thick woods or smoke show as shadowed.
- Each weapon looks different: rifle green, Bren/MG yellow dashed, sniper long blue, PIAT short orange (anti-tank only), mortar purple with a red no-fire inner ring (indirect, not LOS-clipped).
- Drag while Fire is selected, or long-press an enemy, to draw an **aim line** colored by hit chance, with a tiny distance / hit-% badge. ✖ when out of range or no LOS.
- Enemies inside the selected unit's range get yellow corner brackets.
- Round 🎯 button (bottom-left): rings for **all** your units at once, faint. Off by default, remembered.
- Tap a spotted enemy with nothing selected to see its **threat range** in red.

## Win
Hold more of the 3 flags (West, Bridge, East) when the 9:00 clock runs out, or break or destroy the whole enemy force. You start holding West + Bridge. A ring around each flag shows capture progress (7 s). Only infantry that is steady or shaken and not under fire can capture. Vehicles and pinned units can only contest.

## Units
| Airborne (you) | German (AI) |
|---|---|
| Officer (morale aura) | Officer |
| 3 × Rifle section | 3 × Rifle squad |
| Bren LMG team | MG team |
| PIAT anti-tank team | Mortar |
| Sniper | Half-track (light armor, MG) |
| 2" Mortar (HE + smoke) | Assault gun (heavy armor, HE gun) |

Each unit has HP (casualties also reduce firepower), morale, ammo, and experience (★–★★★). Survivors keep their stars between rematches (🎖 after ★★★); ♻️🎖 in help or after-action resets them.

## Rules in short
- **Morale ring:** green Steady → yellow Shaken (worse aim) → orange Pinned (can't move) → red Panic (runs for cover, ignores orders) → grey Broken (routs off the map). Incoming fire suppresses, and casualties shock nearby friends. Morale recovers out of fire, about twice as fast near an officer.
- **Rally ⭐:** a panicked or broken unit within reach of its officer, and out of fire for a few seconds, recovers to Shaken. A star with a progress arc shows it happening.
- **Ammo:** it runs down. Units in their own deploy zone, or next to their officer, slowly resupply when they haven't fired for a few seconds (⁍+). In the zone they also slowly regain PIAT, smoke, and grenade rounds.
- **Houses 🏠:** a stationary unit inside a house gets a garrison bonus to accuracy on top of the house cover.
- **Hedges and walls 🌿:** they partly block sight, so targets behind them are harder to spot and to hit.
- **Reinforcements ⚠:** German reinforcements arrive midgame from the east edge (Easy: 1 squad after 5½ min; Normal: 2 squads + MG after ~4 min; Hard: 3 squads + MG after 3½ min). A red arrow marks where they come in.
- **Late push ⚠🌉:** in the last ~2–3 minutes the Germans throw everything at the Bridge, with smoke and mortar fire. A toast warns you.
- **Difficulty** also changes German accuracy, how quickly the AI reacts, how long it holds positions, and its experience.
- **Line of sight:** houses block it, thick tree clumps block it, and so does smoke. Enemies show only while spotted. A faded "?" marks their last known spot. Firing gives a unit's position away, while sneaking, holding, and cover hide it.
- **Armor:** rifles and MGs barely hurt the half-track and can't hurt the assault gun. The PIAT (range about 150) and mortar hits work.
- **AI:** advances on the nearest flag it doesn't hold, moving cover to cover and sneaking near the enemy. MG and sniper teams take overwatch spots, the mortar stays in range, and vehicles trail the infantry and back off from close infantry. It lays smoke for bridge crossings, guards its home flag, and counterattacks a flag being captured. The officer goes to rally panicked units, and wounded units fall back to hold a friendly flag.

## After action
The end screen lists each of your units with kills, remaining HP and stars, highlights the MVP, shows a flag-ownership timeline (W / B / E), and rates the fight ★–★★★. Rematch carries veteran experience over.

## Balance (AI-vs-AI harness, v3.0)
Results are British wins with the AI playing both sides. "Passive" means the British only use an auto-deploy setup and never give an order.

| | AI vs AI | Passive |
|---|---|---|
| Easy (N=40) | 30/40 (75%) | 23/40 (58%) |
| Normal (N=60) | 29/60 (48%) | 12/60 (20%) |
| Hard (N=40) | 11/40 (28%) | 3/40 (8%) |

## Files
`index.html` (UI + PWA tags) · `game.js` (all game code, vanilla JS + canvas) · `manifest.webmanifest` · `sw.js` (offline cache, currently `btf-v3`, bump `CACHE` when files change) · `icon-192.png`, `icon-512.png` (generated with Python/PIL).

## Dev
No build step. Serve the folder (`python3 -m http.server`) and open `/games/bridge-too-far/`.
Debug hooks: `?auto=1` lets the AI play both sides. `window.BTF.fast(seconds)` fast-forwards the simulation silently. `BTF.start()`, `BTF.autoDeploy()`, and `BTF.begin()` drive the deploy phase. The version tag (`v3.0`) is shown at the bottom of the ❓ help screen.
