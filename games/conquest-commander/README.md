# ⚔️ Conquest Commander (v2.4)

A Battlefront-style Conquest battle where **you are the commander**. Your troopers from the 🪖 Trooper Customizer fight on their own. You decide which command posts matter.

Play: `games/conquest-commander/` (next to `games/trooper-custom/` and `games/shared/army/`)

**v2.4: one army with the 🪖 Trooper Customizer.** Both games read the same save (`localStorage['botcampus:army']`) and the same gear numbers (`games/shared/army/stats.js`). What you build in the Customizer is what fights here, at the price the Customizer shows.

## How to play
1. Pick your nation, up to 6 trooper looks, a **behaviour trait** for each look (the chip under it), an enemy nation, the **🗺️ map** (🏜️ Dust Ridge small / 🏞️ Grand Valley large) and the enemy brain (😠 Normal / 😈 Elite). Tap **▶ Fight** (perk shop) → **⚔️ Start battle**. Your picks are remembered. Your saved roster **🚜 tanks** (max 2) drive in too.
2. 🛒 **Perk shop**: tap cards to buy perks with campaign 💰 credits (tap again to refund), then ⚔️ Fight. Perks last one battle.
3. Tap a post (A B C, or A–E on Grand Valley) and choose:
   - ⚔️ attack / 🛡️ defend / 🚫 ignore
   - ★ / ★★ / ★★★ for how much it matters
4. Every bot picks its own post: the stars split your army by weight (★★★ gets 3× the troops of ★). With no orders (🤖 on the badges) each bot goes for the nearest post you don't own. They capture by standing in the ring and shoot enemies they can see.
5. 🚩 rally point: new troops walk there first.
6. Win: the enemy hits 🎟️ 0, or you hold **every** post for 20 s (big countdown), or the enemy has no posts and no troops left.

## Maps (v2.2, `js/map.js`)
| | 🏜️ Dust Ridge (S) | 🏞️ Grand Valley (L) |
|---|---|---|
| size | 200 × 120 m | 600 × 360 m (3× per side, 9× the area) |
| posts (value) | A 1 · **B 2** · C 1 | A West Base 1 · B North Outpost 1 · **C Old Temple 2** · D South Outpost 1 · E East Base 1 |
| start | A 🔵 · B ⚪ · C 🔴 | A B 🔵 · C ⚪ · D E 🔴 |
| capture ring | 9 m | 11 m |
| 🎟️ / live per side | 200 / 20 | 300 / 32 (8 squads) |
| time limit | 20 min | 30 min |
| zoom out | 170 m | 440 m (whole valley) + 🗺️ minimap |

- **Grand Valley**: three lanes west → east: the north lane through B, the center lane through the Old Temple (C), the south lane through D. Two ridges flank the temple (the **North Ridge** with the **Twin Spires**, and its mirror in the south), with broken rock lines on the crests (the gaps are the ways over). High ground sits behind each outpost (**Watch Rock**) and behind each base (**Southwest Bluffs** / **Northeast Bluffs**). Every post is a walled compound with a gap in each side and low blocks inside, so the fights happen at the posts; ruins along the lanes give cover on the way. ~170 rocks, 90 walls, 20 hills, ~2,100 cover spots.
- Every map is **point-mirrored** around the center for fairness: blue plays west, red east. Rocks are a seeded scatter (the same every time).
- The **🗺️ minimap** (big map only, bottom left): terrain, walls, rocks, posts in owner colors (yellow ring = contested), every trooper as a dot, your view as a white outline. Tap or drag it to move the camera.
- Campaign: the battle is fought on the map you picked; `mapIndex` in the save is that map (0 = Dust Ridge, 1 = Grand Valley). No automatic rotation.
- Map API (`js/map.js`): `MAP` is the active map, one object updated in place by `setMap(id)` (unknown id → Dust Ridge); `MAP_LIST` lists the maps. `new Sim({ …, map: 'grand-valley' })` switches too. Shape: `{ id, name, icon, size, hx, hz, postR, posts:[{id,x,z,owner,value,home?}], hills:[{x,z,r,h}], walls:[{x,z,hx,hz,h}], rocks:[{x,z,r}], cfg:{tickets,live,timeLimit}, view:{camMax,camStart,fogNear,fogFar,minimap,colors…}, frontR, navCell }`. `cfg` overrides `CFG` for that map. The nav grid and the cover spots are built from the props the first time a map is used and cached per map id (`getNav()`, `getCover()` in `js/sim.js`). The renderer rebuilds its map scene with `view.setMap()`.

## Rules (Battlefront II 2005 Conquest; defaults in `CFG`, `js/sim.js`, a map's `cfg` overrides them)
- 200 🎟️ per side, 20 live units per side (squads of 4) on Dust Ridge; 300 🎟️ and 32 live on Grand Valley. Each death costs 1 ticket.
- Class mix per team (min/max): 🪖 trooper 9–25; 🚀 heavy, 🔧 engineer, 🎯 sniper, ⭐ commander, 🛩️ jet 1–4 each. Minimums first, then random up to the live count. A class missing from your roster gives its slots to troopers. ⭐ and 🛩️ are **earned**: they join after your side has held 2 posts (or from the start with the ⭐ *Elites from the start* perk).
- Class from gear (Customizer v4 kit): rocket → heavy · sniper → sniper · jetpack or EMP → jet · rally or chaingun → commander · fusion or shotgun → engineer · else trooper. Each keeps its own weapon numbers. (Class abilities beyond weapons are not in yet.)
- Capture: red → ⚪ neutral → blue. An enemy post must be neutralized first, and the enemy can still spawn there until it is. 10 s per step with 1 unit, up to 3x faster with more. Both sides in the ring = stalled.
- Spawn only at your own posts. Majority of posts (2 of 3, or 3 of 5) → the enemy bleeds every 5 s by (your post value − theirs, at least 1); the middle post is worth 2, the others 1. Grand Valley: holding A B C vs D E = 4 − 2 = 2 per 5 s.
- ☠️ Last stand: when a side's tickets ≤ its units on the field, it stops bleeding and stops getting reinforcements.
- ⭐ CP: start 1,500, +140 every 5 s plus +40 per post. Waves every 10 s; each unit costs its Customizer 💰 cost. 20 min time limit (30 min on Grand Valley).

## Bot AI (Battlefront II 2005 style, `js/sim.js`)
- **Individual bots.** No squad movement. Squads are only spawn-slot bookkeeping (and the 💀 alert).
- **Goals.** With marks, the team is split like SWBF2 `AddAIGoal` weights. Each post gets a quota of bots = its share of the total weight (largest remainder). The bots nearest a post are the ones sent there, and bots stay on their post while its quota holds. Weights: ⚔️ = stars (×0.35 on your own quiet post), 🛡️ = stars (×0.6 if not yours), 🚫 = 0. With **no marks** (🤖), each bot goes to the nearest post it doesn't own (equal distance → higher value).
- **Retake.** When a post falls (neutralized), ex-owners within **60 m** turn back to retake it for up to 40 s, or until it is fully theirs again. A 🔁 ping shows it.
- **Shooting.** A bot only shoots what it can see (rocks and walls block the line). It takes the nearest enemy, with a small bonus for keeping its current target.
- **Cover.** There are 320 cover spots on Dust Ridge (~2,100 on Grand Valley) beside rocks and walls, generated from the map props and mirrored for fairness. A bot that is fighting may run to a free spot within reach that puts the prop between it and the enemy. There it crouches (hidden and can't be shot), then pops up to shoot (~1.2 s down, ~1.6 s up). Popped up, it is 30% harder to hit. Crouched, it takes half rocket splash. There are no grenades, so there is no grenade dodge.
- **No retreat, no morale.** Hurt bots limp but keep going.
- **Brain** (enemy only): 😠 Normal = v2 numbers. 😈 Elite = ×1.15 accuracy (snipers ×1.4), fires 12% faster, re-plans marks every 4 s instead of 6 s. Old saves and old calls with `easy` map to `normal`, and `hard` maps to `elite`.

## Behaviour traits
One trait per roster look. Tap the chip under the tile to get the popup: Auto + 7 traits. A dashed chip means Auto (the class default). The pick is saved with your selection in `localStorage['conquest-commander:setup']` `{v:1, nation, looks, enemy, diff, traits:{lookId: traitId}, map}` (`map` since v2.2; missing = the campaign's map, i.e. Dust Ridge for old saves). Enemy looks always use class defaults. The trait shows on the roster chip and in ⏸️ (look · trait · troops alive).

| Trait | Default for | Exact effect (`TRAIT_FX`, `js/traits.js`) |
|---|---|---|
| 🏃 Rusher | trooper, commander, jet | Pushes the objective. Moves at 85% speed while shooting. 12% cover chance per 4 s, only spots ≤ 5 m away, leaves cover 1.5 s after the last enemy sighting, and never stays more than **4 s** (then it pushes on; no new cover try for 6 s). |
| 🧱 Cover | heavy | Always looks for cover within 15 m when fighting and stays there until 7 s after the last sighting. Moves at 25% speed while shooting (holds position). |
| 🔭 Sniper spot | sniper | Picks a spot 0.85–1.1 × (range × 0.8, clamped to 14–36 m) from its post, with a clear view of the post. It prefers high ground and its own side. Crouches there facing the post for **60–120 s** (the timer starts on arrival), then moves to a new nest. It leaves early if an enemy gets within **14 m**. |
| 🔁 Retaker | – | Retake radius **100 m** instead of 60 m. Also turns back when an own post is merely **attacked** (enemy in the ring), not only when it falls. |
| ➕ Supplier | engineer | Walks to the most-hurt ally within 28 m (HP < 95%). Heals every ally within 6 m by **5 HP/s** (green beam). Gives Mine Layers in range 1 mine back every 15 s. |
| 💣 Mines (Mine Layer) | – | 3 mines per life. At its own post (attacked, or marked 🛡️, or any own post while unmarked) it plants them 5–11 m out toward the enemy, ≥ 3 m apart (1.2 s each). Skips a post that already has 6 own mines. A mine arms after 1 s and triggers at 1.8 m: 70 dmg, 3.2 m splash. Max 12 per team (the oldest goes). |
| 🛡️ Guard | – | Ignores the marks and stays at the nearest post its side owns (inside the ring). Cover only within the ring + 6 m. If that post is lost, it guards the next nearest one. |

All traits work the same on both maps (v2.3): cover spots, sniper spots, retake radius and mines use each map's own props, nav grid and posts (`getCover` is cached per map id).

Base numbers for traits that don't say otherwise: 50% cover chance, 9 m reach, 3 s hold, 50% speed while shooting, 60 m retake.

## Campaign
- Saved in `localStorage['conquest-commander:campaign']` `{v:1, credits, battle, wins, losses, streak, mapIndex}`. Starts at 💰 1500. 🆕 New campaign (tap twice) resets it.
- Win: 1000 + 50 per post held + 2 per ticket left. Loss: 400 + 50 per post held. The end screen shows the breakdown.
- Perks: 🎟️ Reinforcements +50 (400) · 🛡️ Combat Armor +25% HP (500) · 💥 Weapon Boost +20% dmg (500) · 🚩 Fast Capture +50% (300) · ⏩ Quick Deploy, waves 40% sooner (300) · 👥 Bigger Army, +4 live: 24 on Dust Ridge, 36 on Grand Valley (700) · ⭐ Elites from the start: ⭐ & 🛩️ join at once (400) · 🏰 Garrison: start owning the middle post (B on Dust Ridge, C on Grand Valley) with 4 guards (600) · 🧨 Sabotage: enemy −25 🎟️ (450) · 💰 War Chest +1000 CP (350).
- The enemy buys 1 perk, +1 per win in your streak, −1 per loss (min 0, max 6). Both sides' perks show as icons at battle start (and in ⏸️).
- Maps: `MAPS` in `js/campaign.js` = `MAP_LIST` from `js/map.js` (Dust Ridge, Grand Valley).
- Quick battles started from test hooks don't touch the campaign. Leaving a campaign battle via 🏠 forfeits it (perks are spent, nothing is recorded).

## Controls
| | PC | Phone |
|---|---|---|
| move camera | drag / WASD / arrows / click the minimap | 1-finger drag / tap the minimap |
| zoom (Grand Valley: out to 440 m) | wheel | pinch |
| turn | Q E / right-drag | twist |
| post menu | click post or badge, Tab = next | tap |
| marks / stars | 1 2 3 · + − | radial buttons |
| rally | R then click | 🚩 then tap |
| center | Space / 🎯 | 🎯 |
| pause / help | Esc / H | ⏸️ / ❓ |

## Your army (v2.4, `js/army.js`)
- **Where it comes from:** the shared BotCampus army save `localStorage['botcampus:army']` (v1, spec: `games/shared/army/ARMY_SCHEMA.md`), loaded with the shared `games/shared/army/schema.js`. Everything is sanitized there (names, ids, gear, traits, brains).
  - An **old Customizer save** (`'trooper-custom:db'` v3) is converted once by the shared `migrate()`, which writes `botcampus:army`. The old key is left alone, and old Conquest trait picks move onto the units.
  - An even older save (v1/v2) isn't converted here. The setup screen asks you to open the Customizer once.
  - **No save:** you get one cheap basic **Trooper 1** (💰100), not a ready-made army.
- **What you field:** the active player's roster troopers (up to 6 types, in slot order). Tanks and bench units aren't used yet.
- **Who you fight:** another saved player (their roster troopers), or 🎲 a random nation with a generated army that has as many unit types as yours (trooper first, then heavy, sniper, engineer, jet, commander).
- **Traits:** the first valid entry in a unit's `traits[]` is its behaviour. The chip shows 🪖 (set in the army); change it in the Customizer. Units with no trait use the setup picker (or the class default).
- **Cost:** each spawn costs the unit's shared `unitCost()` in ⭐ CP (shown on every tile). The setup screen compares your average cost with the CP you earn per wave and warns ⚠️ when the army is too expensive to reinforce. Campaign 💰 credits still only buy perks.
- **Header:** the setup screen and the ⏸️ pause menu show your player name, nation flag and name, and unit count.
- **Jumps:**
  - **🪖 Edit army** (on the setup screen, or 🪖 in pause) saves your setup and opens `../trooper-custom/?from=conquest`. The Customizer's ⬅️ brings you back.
  - The Customizer's ⚔️ opens Conquest with `?from=custom`, which shows **↩ Back to army**.
  - No army data is ever put in a URL.
  - Conquest listens for `storage` events on `botcampus:army`, so an edit in another tab updates the setup screen (or the next menu visit, mid-battle).
- **Conquest never writes `botcampus:army`** (only the shared one-time migration does).

## Files
- `index.html`, `css/style.css`
- `js/main.js`: UI, input, HUD, loop, `window.__game` test hooks
- `js/sim.js`: rules, AI, combat; pure, fixed-step, fast-forward with `simulate(sec)`
- `js/render.js`: three.js view, instanced armies, map scene rebuilt per map
- `js/map.js`: the maps (Dust Ridge, Grand Valley), `MAP` + `setMap`, props grid for fast line-of-sight
- `js/nav.js`: grid A* pathfinding (per map; unreachable pockets are blocked)
- `js/army.js`: loads the shared army (above), unit → look, generated enemy, cost check
- `js/data.js`: class + battle stats from the shared `stats.js` (no local copies; `cost.js` is gone)
- `js/traits.js`: the 7 behaviour traits, class defaults, their numbers, setup save, difficulty mapping, cover spots (`getCover`) and the trait jobs (`TRAIT_AI`: cover/pop-up, sniper nest, supplier aura, mines), mixed into `Sim`
- `js/perks.js`: the 10 perks + their effect numbers
- `js/campaign.js`: campaign save, rewards, enemy perk scaling, map list
- `js/trooper.js`: **copied unchanged** from `trooper-custom/js` (Customizer v4 snapshot, Oct 18 2026), used for the 3D look builders.
- `../shared/army/stats.js` + `schema.js`: shared with the Customizer (imported as `../../shared/army/…?v=8` from `js/`, the same module URLs the Customizer uses). Don't copy them in.
- three.js r169 from jsDelivr (import map). No build step.
- Don't publish: `test/`, `screenshots/`, `PROGRESS*.md`.

## Performance (v2.2)
- Same renderer for both maps: one instanced mesh for all rocks, one for all walls, instanced troopers (one mesh per look and part), so the big map costs about the same number of draw calls (~35 at normal zoom, ~55 zoomed all the way out). Terrain is coarser per meter on the big map (190×118 segments desktop, 116×72 phone).
- Line of sight uses a 16 m props grid (only rocks/walls near the line are tested; same results as before, ~5× faster on Dust Ridge, ~60× on Grand Valley). The nav grid build uses the same grid (25 ms for Grand Valley).
- Fog and the far plane follow the zoom, so the overview still shows the whole valley.
- Measured in headless Chromium (SwiftShader software GPU, shared box, so absolute numbers are pessimistic): see `test/perf.json` after a run.

## Tests
```
node --import ./test/three-hook.mjs test/sim.mjs                              # rules, perks, campaign, bot AI, traits, 24-match balance, maps + Grand Valley (5 posts, mirror, nav, 8 big matches, no stuck bots, traits on the big map: retake, cover, nest, mines), v2.4 shared army (every gear id resolves, no save, v3 migration, mixed-gear army, spawn cost, cost check) (→ test/balance.txt; set SHARED_ARMY=<path to games/shared/army> if it isn't the default)
bash test/stage.sh                                                            # staging tree games/{shared/army,trooper-custom,conquest-commander} (run.mjs does this itself)
PLAYWRIGHT_BROWSERS_PATH=<playwright browsers> node test/run.mjs              # browser: desktop (traits, cover, nests), campaign + shop, v2 save, no save, iPhone 13 landscape + portrait, map picker + Grand Valley desktop/phone incl. traits in a big battle, v2.4 army header/costs/pause/storage refresh + Customizer ⇄ Conquest round trip (→ test/perf.json, screenshots/unite-*.png)
```

## v2.5: tanks, gear, taken out (army audit fixes)
- **🚜 Tanks.** Each side fields its saved roster tanks (max 2; a generated enemy fields as many as you). A tank drives to the post its side wants most, fights on the way with its tank weapon (stats.js `TANK_WEAPONS`), can't capture posts or pick up packs, takes ×0.35 damage from small arms (rockets/explosives full, 🧨 detpacks ×2), is stunned 2.5 s by 🌩️ EMP-launcher hits, costs **1 ticket** when destroyed and respawns on the next wave if your side can pay its 💰 CP. Wrecks stay dark and tilted for ~3.6 s, then fade.
- **🎒 Gear works in battle** (on in the browser; `?gear=0` turns it off; off in node tests so the seeded balance numbers stay the same). Each sidearm, explosive and gadget does what its one-line effect text (stats.js `GEAR_EFFECT`) says: 🔸 sidearms fire while the main weapon reloads; 🤾 thermals are thrown at a seen enemy; ⚠️ mines are planted at your post; 🧨 detpacks go on a tank or an enemy group; ⏰ time bombs are planted on an enemy post being taken; 🗼 turret, 🛰️ recon droid, 📦 supply crate and 📣 rally deploy once per life; 🎒 jetpack = faster on foot; 🔧 fusion cutter repairs allied tanks and turrets. Turrets, droids, crates, rally rings and blinking time bombs are drawn on the map.
- **💀 Taken out ≠ crouch.** A downed trooper flinches, is knocked back along the hit direction onto its back, its weapon flies off and lands beside it, it lies ~3 s and then fades out (no blinking).
- **HUD words.** Buttons have labels (Pause / Rally / Fight / Help), the chip reads `💰 CP · Wave ⏱ · Troops 🪖 live/max`, badges say "AI-held: no orders yet", perks are listed on the pause screen (Your perks / Enemy perks), and a one-time hint explains tapping a post.
- **🧠 Brains** (Unit Brains save): no presets or tiers; the rows you saved run (default on; `?brains=0` turns them off). New rows: medic heals, mine planting, guard a post.
