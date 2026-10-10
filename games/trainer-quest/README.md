# 🗺 Trainer Quest

You watch, you don't drive. Two trainers (🧢 Kai, 🎀 Mia) each start with one monster and explore a tile map by themselves. They fight and catch monsters, find items, level up and learn moves. You spend the Trainer Points (✨ TP) they earn on **traits**. A trait changes the trainer's AI, so you shape how they play without editing anything directly. Beat the 🌉 **Bridge** (5 trainers in a row, no healing between fights) to unlock the next area. There are 3 areas: 🌲 Mossy Meadow, 🏜 Ember Dunes and 🏔 Frost Peak.

Live: https://nasoteisoy.github.io/BotCampus/games/trainer-quest/

## Same monsters, same rules (no copies)
`index.html` loads `../trainers/doctrine.js` (18 monsters, 8 types, 42 moves, RULES, items, presets) and `../trainers/game.js` (the `TR` damage math, battle engine, scored-planner AI, Why rows and `TRArt` sprites). Every battle in Trainer Quest is a real `TR.turn()` battle, so the Trainers wiki (`../trainers/wiki.html`) stays the single source of truth. The dex and the Why log open it in a sheet.

One small refactor was made in `games/trainers/game.js`: `calcStat(b, hp, lv = 50)` and `damage()` now use `att.lv || 50`. Trainers monsters have no `lv`, so its behaviour is unchanged. A fixed hash over all 36 preset tournaments plus a Why-log battle is identical before and after.

Quest-only data lives in `core.js` and is not a copy of anything in Trainers:
- Area spawn tables, levels and Bridge line-ups.
- Orbs (⚪ Net ×1, 🔵 Star ×1.6, 🟣 Moon ×2.4) and 🍬 Level Candy. The heal items reuse the names, icons and heal amounts from Trainers `ITEMS`.
- **Learnsets**: derived in code from each monster's `moves`/`pool`. The 4 default moves are learned at Lv 1, 1, 8 and 13, with the weakest attack and a status move first. The 3 extra pool moves come at Lv 17, 22 and 27. A wild monster knows its last 4.
- Stats come from the level: Trainers `calcStat` with `lv` instead of 50. EXP to reach Lv L is L³. A KO gives `bst × foeLv / 40`, times the level scaling `((2f+10)/(f+L+10))^3.5`, so farming much weaker monsters gives little EXP.

## Playing
- **Map**: tall grass 🌿, ponds 💧 and the cave 🪨 have wild encounters. ✨ marks an item, ❔ a hidden item (only visible to a Scout II trainer). The 🧑‍🌾 wanderers are trainers who challenge you when you walk past, then rest 💤. 🏥 heals the party. A fog hides tiles nobody has seen yet. Dotted lines show where each trainer is heading.
- **Flags**: pick 🚩🧢, 🚩🎀 or 🚩👥, then tap the map. The trainer walks there and wanders near the flag. Tap the same flag again to remove it. ✕ clears both flags. Tapping the Bridge sends the trainer to try it. Dragging flags only works with ✋ Drag switched on; without it, swipes on the map are ignored.
- **Trainers decide** with a scored planner, just like the battle AI: 🏥 heal, 🌉 Bridge, 🎁 item, 🚩 flag, 🌿 fight, 🗺 explore or 🚶 wander. The top 3 options and their scores go to the 🧠 Why log, next to the battle Why rows in Trainers format. Tap a move or monster there to open its wiki page.
- **Battles** run in the Trainers engine. A strip over the map shows each running battle; tap it to watch the big view, including orb throws and shakes.
- **Catching**: weaken the monster, then throw an orb. Catch chance = `min(1.2, 360/bst) × 0.42 × (3 − 2·HP%)/3`, × 2 if asleep or × 1.5 for another status, × the orb, × trait bonuses, minus 4% per level the wild monster is above your lead (down to ×0.4). The result is clamped to 2–97%. A catch joins the party if there is room, otherwise it goes to the 📦 box.
- **Tabs**: 🧬 traits, 🐾 party/box (⬆ lead, 📦 to box, → take from box, 🍬 candy), 🎒 bag (use heal items between fights), 📕 dex (🎯 caught, 👁 seen, tap a monster to open its wiki page), 📜 feed, 🧠 Why, ⚙ (stats, 💾 save, 🗑 reset; tap twice to confirm).
- **Time**: ⏸ pauses, ×1 ×2 ×4 sets the speed. The game autosaves every 5 s to `localStorage` key `trainer-quest-v1`, and also when the page is hidden. When you come back, the time away is simulated (up to **2 h**) and a 🌙 summary shows what happened.

## Traits (per trainer; each tier needs the one before it; costs ✨4 / 8 / 16 / 28)
An untrained trainer plays with the **Bug-kid doctrine**: high randomness, never switches, and uses at most one potion per battle at 15% HP. Traits change that doctrine or a Quest rule.

| Tree | I | II | III | IV |
|---|---|---|---|---|
| ⚔ Battler | 🔺 Type sense: type 10, dmg 0.6, KO 25, less noise | 👁 Read the foe: KO 50, risk 28, priority 18; only tries the Bridge when its levels are high enough | 🔁 Switch timing: switches out (hp 25%, bad matchup 1, match 10) | ✨ Crit focus: crit 10, setup 45 |
| 🎯 Catcher | 🤲 Steady throw: ×1.3, throws when the target is weak or would be KO'd next hit | 🪶 Weaken first: avoids KOs (KO −70), favours status moves, waits for low HP or sleep | 💎 Collector: ×1.25, hunts missing species and types and goes to their terrain | 🔮 Orb sense: uses the cheapest orb that gives ≥ 50% |
| 🧭 Scout | 👀 Keen eye: walks to items it can see | ⛏ Hidden finds: spots and digs ❔ | 🔭 Wide view: sight 2 → 4, likes to explore | 🦊 Fight sense: avoids grass and trainers when weak, seeks fights when strong |
| ⛑ Medic | 🧪 First aid: potions at 35% (3 per battle) | 🏥 Field care: heals at the center early, uses potions after fights | 💊 Full care: cures status, revives | 🌱 Herbalist: regenerates while walking, potions +50% outside battle |
| 📣 Coach | 🤝 EXP share: bench gets 50% | 📚 Smart moves: keeps the best 4 (power, STAB, coverage, utility); untrained trainers keep or drop new moves at random | 🎓 Tutor: learns moves 3 levels early | 🏋 Hard training: +30% EXP |
| 👑 Leader | Duo: party cap 1 → 2 | Trio: cap 3 | 🔄 Rotation: cap 4, rebuilds the party from the box at the center, leads with the best matchup | Full party: cap 6 |

**TP**: wild win +1 (only if the foe is at most 2 levels below the party average), catch +2, item +1, hidden item +2, trainer win +3, each Bridge trainer +2, Bridge clear +10.

## Balance (headless, `core.js` in node, 30 seeds, Bridge 1, cap 60 min of ×1 time)
| build | cleared | median time | Bridge win rate | battle win rate |
|---|---|---|---|---|
| no traits | 17/30 | 47.1 min (p25 29.0, p75 51.7) | 2% | 80% |
| good build | 30/30 | 24.2 min (p25 21.6, p75 26.9) | 9% | 82% |
| good minus 👑 Leader | 30/30 | 32.5 min | 6% | 82% |
| good minus ⛑ Medic | 30/30 | 29.9 min | 10% | 85% |
| good minus ⚔ Battler | 30/30 | 25.6 min | 9% | 82% |

The good build buys traits in this order: Leader I, Battler I, Medic I, Coach I, Leader II, Catcher I, Battler II, Medic II, Scout I, and so on, in whatever order TP allows. The Bridge win rate is low partly because Bridge attempts include untrained trainers trying too early, which is how they learn. With the good build (6 seeds), Bridge 2 falls at 35–68 min and Bridge 3 at 49–143 min.

## Files
`index.html` (layout and CSS), `core.js` (world sim, no DOM, runs in node), `ui.js` (canvas map, cards, battle strips and view, tabs), `sw.js` (cache `trainer-quest-v1`, network first with cache fallback; it also caches the Trainers files it loads), `manifest.webmanifest`, `icon-192.png`, `icon-512.png`.

## Known gaps
- There is no sound and no walking animation; tiles snap from one to the next.
- Battles are resolved as soon as they start and then replayed. Managing the party during a battle is blocked (⚔ …).
- Trainers' `sw.js` deletes every cache that isn't its own when it activates. If that happens, Trainer Quest's offline cache is refilled the next time it is opened online.
