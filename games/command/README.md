# Command Layers

A phone-first WW2 command sandbox. You command a **brigade front of three British battalions** (1st, 2nd and 3rd Bn) on a 3 km map. Give each battalion its objective, and that battalion's CO splits it into tasks for his three rifle companies. Each company commander breaks his task into platoon tasks, and each platoon commander breaks his into section tasks (Bn → Coy → Pl → Sec). You can step in at any layer. Press play and watch it unfold at any speed from 0.1× to 16×.

Plain JavaScript, canvas and DOM. No libraries; all art is drawn in code. Works offline as a PWA (Add to Home Screen).

## The map (v2.0)
The map is 3000 × 1000 m (3.0 km², up from 1200 × 900 m in v1.x). A river runs across the whole front, with three bridges, and the Mill Brook is a wadeable stream in the east. There are 17 named places in three sectors:
- **West, 1st Bn** (orange, A/B/C Coy): Ashford village, the Orchard, Hill 108, the West Bridge, and the Mill in the rear.
- **Centre, 2nd Bn** (blue, D/E/F Coy): the old v1 map. Centre Bridge, Crossroads, Church, Wood, Ridge and Farm, with the North Bank in the rear.
- **East, 3rd Bn** (yellow, G/H/I Coy): the Manor, the Great Wood, Windmill Hill, the East Bridge, and Northend in the rear.

In the default **🛡 Defenders** mode, each sector has its own German defence: outposts, MG posts, a main position and a local reserve that counterattacks in that sector. That is about 30 German units in all, against 9 British companies (27 platoons).

## Playing
- **Planning**: the game starts paused. 1st Bn is ordered to seize Ashford, 2nd Bn the Church and 3rd Bn the Manor. Each CO picks his own plan.
- **⤢ Fit** (top right) shows the whole front. Pinch or use the mouse wheel to zoom, and drag with one finger to pan. When zoomed out, companies are drawn as coloured markers; tap one to select it. Tap a battalion chip to jump to that sector.
- **📋 Orders**: the tree starts folded to battalions and companies. Tap ▸ to unfold a company, or **⊟ Fold** to fold everything again. Use the **All / 1st / 2nd / 3rd Bn** chips to show one battalion (this also jumps the map to its sector).
- **Battalion orders**: tap a **Bn** row (or the **Bn1/Bn2/Bn3** HQ marker on the map). Pick an objective type (Seize, Clear, Hold, Screen, Recon, Withdraw to) and a target; the nearest places are listed first, and **＋ more** shows the rest. The battalion CO scores his candidate plans (main effort, flanking enemy positions, fire base, reserve…) and re-tasks his companies according to his personality. Companies you have **🔒 locked**, and anything locked below them, keep their tasks. Other battalions are never touched.
- **Edit**: change the objective type or target, set priority and aggression, or move the ◎ (target) and ◇ (position or start point) handles on the map. Unlocked lower layers re-plan at once.
- **✋ Drag button**: off by default, so a touch can never move anything by accident. Tap it to turn drag **on**, and the ◎/◇ handles can be dragged. It stays on until you tap it again (or press `D`).
- **Commanders are people**: every leader has obedience, judgment, experience, maybe a quirk, and trust in you. Your edits are *suggestions*: they may say "Wilco", grumble, counter-propose, delay or ignore you. **🔒 Order** locks a task and makes your edit an order.
- **Plan quality** (0–100) shows on every node. How precisely you see it depends on your HQ staff (menu: Green, Regular, Veteran).
- **▶ / ⏸ / ⏭**: play, pause, or step one 0.5 s tick. The speed slider runs from 0.1× to 16×.
- **❗ Requests**: each battalion CO and the company commanders ask to change their objective, with 1–3 suggestions. Filter them by battalion. Each battalion CO commits his own reserve when his attack stalls.
- **📻 Feed**: a radio log with battalion, level and type filters. Tap a message to jump to that unit.
- **☰ Menu**: restart, new scenario, save or load a plan (3 slots, all three battalions), HQ experience, tutorial, help, and **🛠 Editor**. Saves from v1.x (one-battalion map) can't be placed on the new map. They are refused with a message, and the slot shows "old 1-battalion map".

## Preparing attacks (v2.1)
Spamming Seize gets people killed. Preparation wins:
- **Fire decides it.** A suppressed defender loses most of his accuracy. An unsuppressed one, and above all an MG, cuts down men moving across open ground inside about 250 m. Cover protects much more than before (losses scale with cover^1.6). Support by fire can area-fire a wood or village even when nobody can see the defenders, because their muzzle flashes show a rough position (dashed marker).
- **⚠ Plan warnings.** These appear in the Orders tree, the order panel and under a company's ring on the map: *no fire support*, *unsuppressed MG, no fire support*, *open ground* (jump-off in the open), *cohesion N%*. Plan scoring adds penalties for both (`noSup`, `openPen`). The feed reports "2 Pl caught in the open (by an MG), pinned" and "⚠ E Coy is going in at the Church without fire support".
- **⛓ Cohesion** (sections, platoons, companies, battalions). It drops with assaults, casualties, long moves, heavy fire and scattered platoons. It comes back at rest, faster in cover, near the HQ and under **⟳ Regroup** (a new task for battalions, companies and platoons) or Hold. Low cohesion means slower movement, worse fire, earlier pinning and breaking, and platoons that go in piecemeal. It shows as a bar in the Orders tree and under units on the map. Commanders with good judgment answer an attack order at low cohesion with "C Coy needs about 4 minutes to reorganise", and **🤝 Regroup, then go** gives them the time and then carries out your order.
- **Dig-in and counterattacks.** Sections standing still dig in over about 5 minutes (full rate on Hold/Regroup): they take fewer hits and less suppression. Each German sector counterattacks once, and the counterattack wears down units that are suppressed, disorganised and not dug in.
- **After-action report.** The end screen shows a grade (A–F) and score (places held, casualties, enemy losses), British and enemy casualties, each battalion's strength and cohesion, the mistakes ("B Coy failed at the Church without fire support: 38% casualties", "1st Bn chained 3 attacks without regrouping", places retaken or left unguarded, sections pinned in the open) and what went well.
- Ammunition and fatigue are not modelled separately: cohesion already covers exertion, and a separate ammo track would mostly add bookkeeping.

## ⚖ Mirror: an equal enemy (v2.2)
**☰ Menu → Enemy force** has two choices:
- **🛡 Defenders**: the classic sector defence. It is the default, and old saves load into it.
- **⚖ Mirror**: a German regiment the same size as your brigade.

Switching restarts the current scenario, and the choice is remembered.

**The German force**
- The order of battle matches yours exactly. The regiment is led by an Oberst, with three battalions: I., II. and III. Bataillon, each under an Oberstlt or Maj.
- Each battalion has three companies, 1.–9. Kompanie, each under a Hptm or Oblt.
- Below them are 27 platoons (Lt/Fw) and 81 sections (Uffz/Ogefr).
- That makes 117 units plus HQs per side, 234 in all.
- German officers have German names and the same personality model as yours.

**Same logic for the German commanders.** German companies, platoons and sections use the same planner, objective maps, section drills, cohesion and requests as British ones. When German companies send requests, their HQ answers them for itself.

**The German battalion HQ** (`deHQ`, every 30 s) picks a posture for each battalion, in this order:
1. **Withdraw** to the rear assembly area if strength falls below 45%.
2. **Call off** a failing attack after 25% losses or 15 minutes, then defend.
3. **Regroup** when cohesion is below 50% and the battalion is out of contact.
4. **Consolidate** a place it has taken.
5. **Counter-attack** a British gain within 550 m. This only happens when the British there are weak (low cohesion or not yet dug in) and the Germans are stronger.
6. **Attack** when clearly stronger, by 1.5× with good cohesion.

At least one battalion makes an initial push for a village. The others advance to hold the ridge, hill or high ground next to their sector. Fog of war applies to both sides:
- You only see Germans your units have spotted.
- German radio traffic stays hidden.
- The German regiment's tree is shown only after the battle.

**Fair start: a meeting battle.** The Germans form up north of the river, at the Mill, North Bank and Northend, about as far from the villages and bridges as you are on the south side. Nobody owns any place at the start. Both sides race for the same 14 places, so speed matters as much as preparation.

The south has more cover, which favours you. To balance it, the German MG Gruppe keeps its historical firepower edge (`combat.mirror.deLmg` = 7, versus the British Bren 4).

**Winning.** The battle ends at H+60, when one side drops below 30% strength, or after 4 minutes with no fire from H+25 onwards. When it ends, the fog lifts.
- The verdict comes from places held (yours vs the Germans', 1 point each) plus 6 × (German losses − your losses as fractions).
- A margin of ±1.5 or more is a Victory or a Defeat; anything in between is a Draw.
- The AAR scores both places and casualties on both sides. It also lists German counter-attacks you beat off or that retook ground.

**Doctrine.** The doctrine is shared by both sides; there is no side switch in the editor. The German HQ's own settings are in **⚔ Combat → ⚖ Mirror: German regiment**:
- the think interval and opening weights;
- the attack and counter-attack ratios;
- the stop-loss, withdraw and rout thresholds;
- the request switch and the German MG firepower;
- the scoring weights.

**Balance.** Tested headless with seeded runs, default doctrine, Regular HQ:

| Strategy | Seeds | Victory / Draw / Defeat |
|---|---|---|
| Default plans, no player input | 24 | 12 / 5 / 7 (50% British wins) |
| Seize spam | 12 | 0 / 0 / 12 |
| Deliberate gated attacks | 12 | 3 / 6 / 3 |

Typical losses are 35–45% on each side.

## Objective Editor
Open **☰ Menu → 🛠 Editor** (or go straight to `editor.html`). Everything the commanders use to plan lives in one data object, the *doctrine* (`DEFAULT_DOCTRINE` in `doctrine.js`). The doctrine applies to **all three battalions**; their COs differ only in personality. The editor has eight tabs:
- **🏷 Task types**: label and icon for each task type, and which types each level may use.
- **🗺 Battalion maps**: for each battalion objective type, its variants with company roles (task type, placement rule, importance, "wait for" gate, clear-if-wood) and a live diagram.
- **🗺 Company maps** / **🗺 Platoon maps**: the same breakdown into platoon and section tasks, with diagrams.
- **⚙ Section drills**: section state machines (move, hold, suppress, overwatch, assault, charge, consolidate, pinned, broken…) with editable timings and gates.
- **📊 Scoring**: the weights behind plan quality, battalion section included.
- **⚔ Combat**: the fire model (suppression, open ground, MGs, cover, area fire), cohesion (losses, recovery, effects, thresholds), digging in, the after-action score weights and the **⚖ Mirror** German regiment settings.
- **⇅ Import / Export**: export, import, reset.

**💾 Save** stores the doctrine in `localStorage` (`command-doctrine-v1`; doctrine version 3). Imports are checked one field at a time. Version-1 and version-2 doctrines still load: they get the Regroup task and the default combat section.

## Performance
- Line of sight, woods and elevation use precomputed 5 m grids plus a 100 m spatial index.
- A* is capped at 12 path plans per tick, so H-hour has no spike.
- The map is pre-rendered in 1 km tiles, and only visible tiles are drawn.
- Zoomed-out views use simplified markers.
- Spotting uses a 200 m grid that works the same for both sides, and unit lists per company and battalion are cached.
- Defenders mode has about 147 units, and a sim tick costs about 0.5–1.5 ms.
- Mirror mode has 234 units. A sim tick costs about 1.9 ms on average (p99 5 ms). Only the first 5 s after H-hour cost more, up to about 40 ms per tick, while every unit plans its first moves.
- At 390×844 and 16×, both modes run at 60 fps. In Mirror mode the worst frame mid-battle is 17 ms, whether the map is fit or zoomed.

## Files
`index.html` (UI and styles), `doctrine.js` (default doctrine, validation, storage), `editor.html` + `editor.js` (Objective Editor), `game.js` (map, pathfinding, line of sight, objectives tree, commanders, simulation, rendering, UI), `sw.js` (offline cache `command-v6`), `manifest.webmanifest`, icons.
