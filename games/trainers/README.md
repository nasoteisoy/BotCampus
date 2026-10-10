# Trainers 🎓

Phone-first PWA where you **train the trainers**: turn-based monster battles (original monsters, types and moves) fought by trainer AIs whose brains you edit in a list-style editor (same look and storage pattern as the Command Layers Objective Editor).

Live: https://nasoteisoy.github.io/BotCampus/games/trainers/

## Play
- **⚔ AI vs AI**: pick a blue and a red trainer and 3 v 3 or 6 v 6. Auto-plays with ⏸ pause, ⏭ step one turn and a 🐢–🐇 speed slider (×0.5 to ×16).
- **🎮 You vs AI**: you play the blue trainer's team. Tap a move, ↩ Switch, or 🎒 Bag (Potion, Super Potion, Full Heal, Revive).
- **🧠 Why**: every AI decision with its top 3 scored options, e.g. `T4 Ace Mara: Super Potion 60 > Switch→Tidebolt 38 > Potion 31 (HP 15%, +85%)`. 🎲 marks when personality noise picked something other than the best.
- **🏆 Tournament**: 10/50/200 battles between two trainers, with a win-rate bar and a list of earlier runs. "Both use the blue team" tests only the brains.
- During play there is almost no text: icons, HP bars, team pips, stage chips and short floating numbers (−45, ×2!, CRIT!, 💤, MISS).

## 📖 Wiki (wiki.html + wiki.js)
Open it from the home screen (📖 in the top bar, or the "📖 Wiki" row) or from the editor (📖). Every page is generated from the game's own data:
- doctrine.js: dex, type chart, presets, and `RULES` (all battle constants).
- game.js: the real damage function, stage multipliers and sprites.

So nothing is duplicated and the wiki can't drift from the game.
- **🐾 Monsters:** picture grid with search (name, type or move) and a type filter. The detail page shows the sprite, type, base stats as bars (plus the level-50 value), the move list (★ = default set), matchups computed from the chart (weak to / resists / immune / status immunity), and which preset teams use it.
- **💥 Moves:** list sortable by name, type, power, accuracy, priority or effect, with a type filter. The detail page shows power, accuracy, priority, crit %, effect and every monster that can learn it.
- **🔺 Types:** an attacker × defender chart (icons, colors, sticky attacker column) and a list view. Each type page lists its offense, defense, monsters and moves.
- **📜 Battle rules:** the damage formula with a live worked example from the engine, same-type bonus, crit table, stage tables, turn order, statuses and items, plus each preset's item thresholds.
- **🎓 Trainers:** the 6 presets with team sprites, a one-line personality summary and bars for their strongest weights, generated from the doctrine. Trainers you edited in the editor (saved in localStorage) appear in a ✎ section.
- **Deep links:** `wiki.html#monster/<id>`, `#move/<id>`, `#type/<id>`, `#trainer/<id>`, `#mytrainer/<id>` (your edited version), plus `#monsters`, `#moves`, `#types`, `#rules`, `#trainers`.
- **← Back:** follows in-wiki history (kept in `history.state`). On a fresh deep link it goes to the parent list.
- **Tap to look up:** these open the wiki in a sheet (an iframe), so a running battle or unsaved editor edits are kept, and AI vs AI pauses while it's open:
  - in a battle: the monster card, the sprite, or the move caption;
  - in the Why log: any scored option or the monster name;
  - in the editor: the team builder's sprite or 📖 button, or a Move-priorities preview row.

## Battle rules (game.js, part 1)
- Level 50 stats from base stats.
- Damage = ((2L/5+2)·Power·A/D)/50+2, then × same-type 1.5 × type chart × crit 1.5 × random 0.85–1.0. Physical moves use Atk/Def, special moves use SpA/SpD.
- Stat stages ±6. Accuracy and evasion stages. Crit stages 1/24 → 1/8 → 1/2. Priority moves go first, then speed; switches and items go before moves.
- Statuses:
  - 💤 Sleep: skips 1–3 turns.
  - ⚡ Paralysis: speed ×½ and a 25% chance to skip.
  - ☠ Poison: 1/8 HP per turn.
  - 🔥 Burn: 1/16 HP per turn and Atk ×½.
  - 💫 Confusion: 2–5 turns, ⅓ chance to hit itself.
- Status immunities: Flame can't burn, Toxin can't be poisoned, Volt can't be paralysed.
- 8 types (🔥 Flame, 💧 Tide, 🌿 Leaf, ⚡ Volt, 🪨 Stone, 🌪 Gale, 🌙 Shade, ☠ Toxin), 18 monsters, 42 moves. Moves include setup (War Cry, Harden, Calm Focus, Tailwind, Sharpen, Blur), healing (Mend, Regrow, Purify, Deep Rest) and status (Drowse Spores, Dusk Lullaby, Numbing Jolt, Toxic Mist, Scorch Glare, Dread Gaze). Mossling and Sporeshroom are the "healer" and "poison healer" supports.

## The trainer brain (scored planner)
Each turn the AI lists **every legal action** (each move, each switch, each usable item). It scores each one as

`score = Σ feature × weight + move-kind bias + switch-rule points`

and picks the highest after adding personality noise (temperature × Gumbel noise).

| Feature | Meaning |
|---|---|
| dmg | expected % of the foe's HP (rolls, crits and accuracy included) |
| ko | KO chance this hit |
| type | type step (×2 = +1, ×½ = −1, immune = −3) |
| status | value of the status it can cause (0 if the foe is already statused or immune) |
| setup | useful stages gained × own HP × safety |
| heal | share of HP restored |
| risk | how hard the foe can hit back (penalty), ignored by the "risk tolerance" share |
| match | how much better the switched-in monster's matchup is |
| item | item value; only offered when the item rules fire (heal at X% HP, revive after N out, full heal on sleep) |
| crit / prio / acc | crit chasing, first strike when a KO is in the air, miss fear |

Presets: 🪲 Bug-kid (random-ish, never switches), 🎖 Ace (smart scorer; weights tuned by hill-climbing against the other five), 🎲 Gambler (KOs and crits), 🩹 Healer/stall, 📈 Setup sweeper, 🌀 Status spammer.

## Editor (editor.html)
- **Tabs:**
  - 👥 Trainers (list, duplicate, delete copies, rename/icon)
  - 🎯 Move priorities (bias per move kind)
  - 🔁 Switch rules (HP threshold, bad-matchup threshold, bonus/penalty, never switch, stay when boosted)
  - 🎒 Item use (potion/super thresholds, revive when, full heal on sleep/other, max per battle, bag contents)
  - 🧠 Personality (temperature, aggression, risk tolerance)
  - 📊 Scoring (all feature weights, plus a 100-battle quick test of your unsaved edits)
  - 🧬 Team (6 slots, monster, order, 4 moves from its pool)
  - ⇅ Import / Export (one trainer or all; copy, download .json, paste or file import)
- **Saving:** 💾 Save stores all trainers in localStorage under `trainers-doctrine-v1`. ↺ Reset puts the current trainer back to its preset; "Reset all" clears the saved file.
- **Validation:** everything is checked field by field on load and import; anything invalid falls back to the trainer's preset.
- **Layout:** nothing is draggable (lists with ↑ ↓ buttons instead), so there is no ✋ Drag toggle.

## Files
- `index.html`: game UI and styles.
- `game.js`: engine and AI (runs in node too), then the UI.
- `doctrine.js`: dex (types, chart, moves, monsters, items), battle `RULES` constants, presets, validation and storage.
- `wiki.html` / `wiki.js`: the in-game wiki.
- `editor.html` / `editor.js`: the trainer editor.
- `sw.js`: offline cache `trainers-v2` (includes the wiki).
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png`.

## Test numbers (node, 200 battles each)
- **Ace vs Bug-kid:**
  - 3 v 3: 98.0% (own teams), 99.5% (same team)
  - 6 v 6: 99.5% (own teams), 98.5% (same team)
- **Edited Ace vs the real Ace** (same team; 50% = no effect):
  - setup = 0: 3.5% (3 v 3) / 15.5% (6 v 6)
  - dmg = 0: 32% / 35%
  - ko = 0: 46.5% / 48%
  - type = 0: 58% / 57%. Type advantage is already inside expected damage, so the extra type weight double-counts.
- **Ace with Bug-kid noise** (temp 30) vs Bug-kid: 72.5%, against 99.5% unedited.
