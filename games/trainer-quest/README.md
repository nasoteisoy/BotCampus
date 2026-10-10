# 🗺 Trainer Quest

You watch, you don't drive. Two trainers (🧢 Kai, 🎀 Mia) each start with one monster and explore a tile map by themselves. They fight and catch monsters, find items, level up and learn moves. You spend the Trainer Points (✨ TP) they earn on **traits**. A trait changes the trainer's AI, so you shape how they play without editing anything directly. Beat the 🌉 **Bridge** (5 trainers in a row, no healing between fights) to unlock the next area. There are 3 areas: 🌲 Mossy Meadow, 🏜 Ember Dunes and 🏔 Frost Peak.

**v3** makes the game harder and easier to follow. There is a 🔥 Hard mode (the default), trainers can faint, a rival roams the map, and the Bridge is a real wall. On screen you get activity bubbles, on-map face-offs, a "Now" strip, a goal tracker with an honest readiness meter, and a short tutorial.

Live: https://nasoteisoy.github.io/BotCampus/games/trainer-quest/

## Same monsters, same rules (no copies)
`index.html` loads `../trainers/doctrine.js` (18 monsters, 8 types, 42 moves, RULES, items, presets) and `../trainers/game.js` (the `TR` damage math, battle engine, scored-planner AI, Why rows and `TRArt` sprites). Every battle in Trainer Quest is a real `TR.turn()` battle, so the Trainers wiki (`../trainers/wiki.html`) stays the single source of truth. The dex and the Why log open it in a sheet.

One small refactor was made in `games/trainers/game.js`: `calcStat(b, hp, lv = 50)` and `damage()` now use `att.lv || 50`. Trainers monsters have no `lv`, so its behaviour is unchanged. A fixed hash over all 36 preset tournaments plus a Why-log battle is identical before and after.

Quest-only data lives in `core.js` and is not a copy of anything in Trainers:
- Area spawn tables, levels and Bridge line-ups.
- Orbs (⚪ Net ×1, 🔵 Star ×1.6, 🟣 Moon ×2.4) and 🍬 Level Candy. The heal items reuse the names, icons and heal amounts from Trainers `ITEMS`.
- **Learnsets**: derived in code from each monster's `moves`/`pool`. The 4 default moves are learned at Lv 1, 1, 5 and 11, with the weakest attack and a status move first. The 3 extra pool moves come at Lv 16, 21 and 26. A wild monster knows its last 4.
- Stats come from the level: Trainers `calcStat` with `lv` instead of 50. EXP to reach Lv L is L³. A KO gives `bst × foeLv / 40`, times the level scaling `((2f+10)/(f+L+10))^3.5`, so farming much weaker monsters gives little EXP.

## Playing
- **Map**: tall grass 🌿, ponds 💧 and the cave 🪨 have wild encounters. ✨ marks an item, ❔ a hidden item (only visible to a Scout II trainer). The 🧑‍🌾 wanderers are trainers who challenge you when you walk past, then rest 💤. 🏥 heals the party. A fog hides tiles nobody has seen yet. Dotted lines show where each trainer is heading.
- **Reading the map without reading (v3)**:
  - **Bubbles** over each trainer show what they are doing: 🚶🚩 going to a flag, 🌿 looking for a wild fight, ⚔ fighting, 🟣 throwing an orb, 🎁 found an item, ⛏ digging, 🏥 going to heal, 😴 resting, 😵🏥 fainted and walking back. A dotted line and a ring show where they are going.
  - **On-map battles**: while a trainer fights, a small face-off box sits next to them. It shows both sprites, HP bars, popping damage numbers and the result (✅ won, 🟣 caught, ❌ lost or fled). It never covers the map centre.
  - **Now strip** under the map: the last 3 important events with big icons. Tap it to open the 📜 feed.
  - **Goal tracker** at the top: the next goal (🌉🥉 1/5), team level vs Bridge level (⬆10→12), and one chip per trainer. Each chip has a readiness meter (the % of 12 simulated Bridge runs that party wins) and a sign of when they will try: 🎯50% (they wait until the sims say ≥ 50%), 🎲Lv12 (they will try at that average level, simulated or not), 🚫2🐾 (Hard: they need 2+ monsters), ⏳1:30 (cooldown after a failed try), 🌉! (on the Bridge now). Tap the tracker for a sheet with each trainer's readiness and the 5 Bridge teams with their AI.
  - **Corner pops** in the map's top-left corner for level-ups, new moves, catches, trait unlocks and faints. They stack up to 3 and disappear after about 3 s.
  - **Tutorial**: the first time you start a run, 5 steps walk you through the flag, a fight, spending ✨, readiness and the Bridge. Skip it at any step; replay it from ⚙ → 🎓.
- **Screen (v2, map first)**: one slim top row (area 🌉x/5 · 🚩 target · ✕ · ✋ · ⏸ · ×1), the goal tracker, the map, the Now strip, one row of slim trainer cards, the tab bar. The map is cropped to the playable area (the outer tree ring is not drawn) and fills about 73% of a 390×844 screen and 66% of a 360×740 screen (the rule is at least 55%). In landscape the map takes the full height on the left; the goal tracker, Now strip, cards and panel sit on the right. Nothing opens over the map by itself: battles show in the trainer card and as a mini-banner above the trainer, toasts sit in the map's top-right corner, and the 🌙 away summary is a small card on the bottom edge (✕, or it hides after 30 s). The 📜 feed and 🧠 Why tabs open as half-height sheets with ✕.
- **✋ pan/zoom**: off by default, so swipes and pinches on the map do nothing. Switch ✋ on (the map gets a yellow outline) to pinch or wheel zoom (up to ×3), drag with one finger to pan, or drag a flag. Switching ✋ off returns to the whole-map view.
- **Flags**: tap 🚩 to cycle the target 🚩🧢 → 🚩🎀 → 🚩👥, then tap the map. The trainer walks there and wanders near the flag. Tap the same flag again to remove it. ✕ clears both flags. Tapping the Bridge sends the trainer to try it. Dragging flags only works with ✋ switched on.
- **Trainers decide** with a scored planner, just like the battle AI: 🏥 heal, 🌉 Bridge, 🎁 item, 🚩 flag, 🌿 fight, 🗺 explore or 🚶 wander. The top 3 options and their scores go to the 🧠 Why log, next to the battle Why rows in Trainers format. Tap a move or monster there to open its wiki page.
- **Battles** run in the Trainers engine. A running battle shows inside that trainer's card (both monsters and HP bars) and as a small ⚔ banner above the trainer on the map. Tap the card or the trainer to open the big view, including orb throws and shakes.
- **Catching**: weaken the monster, then throw an orb. Catch chance = `min(1.2, 360/bst) × 0.55 × (3 − 2·HP%)/3`, × 2 if asleep or × 1.5 for another status, × the orb, × trait bonuses, minus 4% per level the wild monster is above your lead (down to ×0.4). The result is clamped to 2–97%. A catch joins the party if there is room, otherwise it goes to the 📦 box.
- **Tabs**: 🧬 traits, 🐾 party/box (⬆ lead, 📦 to box, → take from box, 🍬 candy), 🎒 bag (use heal items between fights), 📕 dex (🎯 caught, 👁 seen, tap a monster to open its wiki page), 📜 feed, 🧠 Why, ⚙ (stats, 💾 save, 🗑 reset; tap twice to confirm).
- **Difficulty**: pick 🔥 Hard (default) or 🌱 Normal on the start screen; switch any time in ⚙.

| | 🔥 Hard | 🌱 Normal |
|---|---|---|
| Start bag | 1 potion, 5 nets | 3 potions, 6 nets |
| Wild level | team −5…−3, up to area max +8; 4% rare strong spawns (team +3…+5); 15% spawn to counter your lead | team −7…−4, cap +4; 2% rare; 8% counter |
| Fainting (whole party down) | lose 30% of ✨, 60% chance to drop an item, 8 s dazed, then walk to 🏥 (8 s heal) | lose 10% ✨, no item loss, 4 s + 3 s |
| Bridge | needs 2+ monsters; fixed teams with type coverage (Area 1: Lv 8–12, 1–3 monsters each); doctrines status → setup → gambler → Ace → Ace; after a failed try, the cooldown grows 3 → 6 → 9 min | 1+ monsters, same teams 1 level lower, milder doctrines (bug-kid, bug-kid, status, gambler, Ace); cooldown 1.5 → 3 → 4.5 min |
| Rival | team level −1, a loss costs 3 ✨ | team level −3, a loss costs 1 ✨ |
| Other | fewer item spots and slower respawn; NPC wins drop a potion 25% of the time | more items; potion drop 50% |

- **Fainting**: there is no free healing on the spot. A fainted trainer turns grey with 😵🏥, can't pick things up or fight, and must walk back to 🏥.
- **Rival** (😈 Rex, 🦹 Vex, 👺 Oni; one per area): wanders the map, chases trainers within 5 tiles (❗) and picks monsters that beat your lead. Beat them for +4 ✨ and maybe a potion. Lose and you drop ✨ (and faint if your whole party is down). After a fight they rest 💤 for 6 min, and they bring a bigger team after losing twice.
- **Time**: ⏸ pauses, and tapping ×1 cycles the speed ×1 → ×2 → ×4. The game autosaves every 5 s to `localStorage` key `trainer-quest-v1`, and also when the page is hidden. When you come back, the time away is simulated (up to **2 h**) and a 🌙 summary shows what happened.

## Traits (per trainer; each tier needs the one before it; costs ✨4 / 8 / 16 / 28)
An untrained trainer plays with the **Bug-kid doctrine**: high randomness, never switches, and uses at most one potion per battle at 15% HP. Traits change that doctrine or a Quest rule. ✨ is limited (and lost on faints and rival losses), so you can't buy everything early.

**v3 tradeoffs**: traits marked ⚠ have a downside, and three pairs are mutually exclusive (✕): 👁 Read the foe ✕ 🪶 Weaken first, 🔭 Wide view ✕ 🏥 Field care, 🏋 Hard training ✕ 🌱 Herbalist. Downsides: ✨ Crit focus sets up even when behind; 🤲 Steady throw throws more orbs; 🪶 Weaken first means long fights; 🔭 Wide view roams far from 🏥; 🧪 First aid burns potions; 🏥 Field care walks home often; 🤝 EXP share gives fighters −20% EXP; 3️⃣ Trio splits EXP 3 ways; 🏋 Hard training gives no ✨ from wild wins.

| Tree | I | II | III | IV |
|---|---|---|---|---|
| ⚔ Battler | 🔺 Type sense: type 10, dmg 0.6, KO 25, less noise | 👁 Read the foe: KO 50, risk 28, priority 18; simulates the Bridge and only tries at ≥ 50% | 🔁 Switch timing: switches out (hp 25%, bad matchup 1, match 10) | ✨ Crit focus: crit 10, setup 45 |
| 🎯 Catcher | 🤲 Steady throw: ×1.3, throws when the target is weak or would be KO'd next hit | 🪶 Weaken first: avoids KOs (KO −70), favours status moves, waits for low HP or sleep | 💎 Collector: ×1.25, hunts missing species and types and goes to their terrain | 🔮 Orb sense: uses the cheapest orb that gives ≥ 50% |
| 🧭 Scout | 👀 Keen eye: walks to items it can see | ⛏ Hidden finds: spots and digs ❔ | 🔭 Wide view: sight 2 → 4, likes to explore | 🦊 Fight sense: avoids grass and trainers when weak, seeks fights when strong |
| ⛑ Medic | 🧪 First aid: potions at 35% (3 per battle) | 🏥 Field care: heals at the center early, uses potions after fights | 💊 Full care: cures status, revives | 🌱 Herbalist: regenerates while walking, potions +50% outside battle |
| 📣 Coach | 🤝 EXP share: bench gets 50% | 📚 Smart moves: keeps the best 4 (power, STAB, coverage, utility); untrained trainers keep or drop new moves at random | 🎓 Tutor: learns moves 3 levels early | 🏋 Hard training: +30% EXP |
| 👑 Leader | Duo: party cap 1 → 2 | Trio: cap 3 | 🔄 Rotation: cap 4, rebuilds the party from the box at the center, leads with the best matchup | Full party: cap 6 |

**TP**: wild win +1 (only if the foe is at most 4 levels below the party average on Hard, 6 on Normal; ⭐ rare spawns give +3), catch +2, item +1, hidden item +2, trainer win +3, rival win +4, each Bridge trainer +2, Bridge clear +10. You lose ✨ by fainting and by losing to the rival.

## Balance (v3, headless: `core.js` in node, 30 seeds per row, Bridge 1, 60 min cap at ×1)
| difficulty | build | cleared ≤ 60 min | median clear | faints / run | Bridge tries / run | ✨ lost / run |
|---|---|---|---|---|---|---|
| 🔥 Hard | no traits | 0/30 | > 60 min | 112.9 | 0 (never has 2 monsters) | 246 |
| 🔥 Hard | bad build | 22/30 | 54.3 min (p25 50.8) | 57.3 | 10.0 | 157 |
| 🔥 Hard | good build | 30/30 | 28.7 min (p25 24.8, p75 32.6) | 25.3 | 2.2 | 25 |
| 🌱 Normal | no traits | 19/30 | 48.7 min (p25 42.7) | 89.8 | 16.7 | 248 |
| 🌱 Normal | bad build | 28/30 | 46.6 min (p25 38.0, p75 53.2) | 42.0 | 14.1 | 106 |
| 🌱 Normal | good build | 30/30 | 22.6 min (p25 19.4, p75 25.6) | 19.0 | 3.3 | 15 |

Faints count both trainers. The **good** build buys Leader I, Catcher I, Battler I, Medic I, Leader II, Battler II (Bridge sims), Medic II, Coach I, Coach II, … as ✨ allows. The **bad** build buys Leader I, Catcher I, Scout I, Weaken first, Hidden finds, Wide view, Collector, … (no 👑 Trio, no ⛑, no ⚔). It spends ✨ on catching and exploring, so its single-type teams lose to the Bridge again and again. **No traits** on Hard keeps a party of one (cap 1), so the Bridge refuses it.

## Files
`index.html` (layout and CSS), `core.js` (world sim, no DOM, runs in node), `ui.js` (canvas map, activity bubbles, on-map face-offs, goal tracker, Now strip, corner pops, tutorial, cards, big battle view, tabs, ✋ pan/zoom), `sw.js` (cache `trainer-quest-v3`; on activate it deletes only older `trainer-quest-*` caches, network first with cache fallback; it also caches the Trainers files it loads), `manifest.webmanifest`, `icon-192.png`, `icon-512.png`.

## Known gaps
- There is no sound and no walking animation; tiles snap from one to the next.
- Battles are resolved as soon as they start and then replayed. Managing the party during a battle is blocked (⚔ …).
