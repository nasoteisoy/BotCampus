# 🪖 Trooper Customizer (v4.2: 6 blank roster slots + 23 templates + loadouts + ⭐ award weapons)

A sandbox for designing the look of your RTS army. No fighting. You set a **player name**, create **nations** (colors + flag), give each nation a **6-slot trooper roster** (blank to start: name each slot yourself or pick one of 23 templates) with full loadouts, and design a **space tank**. Every model is built to an RTS budget, so the same units can be dropped into an RTS by the hundred.

Play: `games/trooper-custom/` (https://nasoteisoy.github.io/BotCampus/games/trooper-custom/)

## Data model
```
Player { name }
 └─ Nation { name, primary, secondary, suit tone, flag symbol + symbol color, tech glow color + level }
     ├─ roster: 6 slots { blank?, name, icon, template, loadout + look }
     └─ saved looks (trooper looks, tank looks): shape / gear only, no colors
tank look (shared) · award medals per main weapon (0/64)
```
**New nations start with 6 blank slots** (v4.2). Each one is a dashed card with **+ Slot N**. Tap it to open the chooser:
- **➕ Blank trooper**: type a name (or keep "Slot N"); it starts with the base kit
- **📋 From template**: pick from the template library below. This copies the loadout, name and icon; the name stays editable

Tap the active slot again (or the **✏️ name chip** in the section header) to edit the slot:
- **rename** inline (max 16 characters, Enter saves)
- **icon**: one of 26 emoji, or 🔫 *auto*, which follows the main weapon
- **📋 Template**: replace the loadout with a template
- **↺ Reset**: back to the slot's template, or the base kit for a blank trooper
- **🗑️ Clear**: back to a blank slot (asks ✔️/✖️ first)

Editing a blank slot with the tabs (for example picking a helmet) turns it into a trooper named "Slot N".

On the 🏳️ nation tab, **📋 Fill roster: 6 starter templates** fills the six starters below (it asks first if any slot is already filled). Saves from v4/v4.1 keep their filled rosters; only new nations start blank.

Starter templates (the v4 default roster):

| slot | main weapon | explosive | sidearm | gadget | armor |
|---|---|---|---|---|---|
| 🪖 Trooper | Blaster rifle | Thermal detonator | Blaster pistol | none | Standard |
| 🛡️ Heavy | Rocket launcher | Mines | Commando pistol | none | Heavy |
| 🎯 Sniper | Sniper rifle | Time bombs | Blaster pistol | Recon droid | Standard |
| 🔧 Engineer | Shotgun | Detpacks | Blaster pistol | Fusion cutter | Standard |
| 🚀 Jet Trooper | EMP launcher | Thermal detonator | Blaster pistol | Jetpack | Standard |
| ⭐ Commander | Chaingun | Thermal detonator | Commando pistol | Rally | Standard |

### 📋 Template library (23, `js/templates.js`)
Grouped by role in the picker. Each row has a thumbnail in the nation's colors, its 💰 cost, ⚡ power, ❤️ HP and a one-line description. Templates only use existing kit options. The kit allows one explosive per trooper, so 🏗️ Demolitions carries detpacks plus a rocket launcher.

| role | template | 💰 | description |
|---|---|---|---|
| ⚔️ Assault | 🪖 Trooper | 105 | Cheap all-rounder: blaster rifle + thermal detonator. |
| ⚔️ Assault | 🚀 Jet Trooper | 198 | Flies over walls and stuns droids: EMP + jetpack. |
| ⚔️ Assault | 🎖️ Rifle Veteran | 153 | Seasoned rifleman: commando pistol + supply drop. |
| ⚔️ Assault | 💥 Breacher | 138 | Clears rooms: shotgun + thermal, commando pistol. |
| ⚔️ Assault | 🦘 Jump Assault | 165 | Jets in and blasts up close: shotgun + jetpack. |
| ⚔️ Assault | 💣 Grenadier | 155 | Explosives expert: time bombs + ammo drop for more. |
| 🛡️ Heavy | 🛡️ Heavy | 238 | Tank buster in heavy armor: rocket + mines. |
| 🛡️ Heavy | 🧨 AT Specialist | 185 | Lighter tank hunter: rocket + mines, standard armor. |
| 🛡️ Heavy | 🌀 Suppressor | 243 | Bullet storm pins enemies down: chaingun, heavy armor. |
| 🛡️ Heavy | 🦾 Heavy Commando | 203 | Armored shock trooper: shotgun, detpacks, heavy armor. |
| 🔭 Recon | 🎯 Sniper | 195 | Long-range killer: sniper, time bombs, recon droid. |
| 🔭 Recon | 👟 Scout | 135 | Light and cheap: blaster + recon droid spots enemies. |
| 🔭 Recon | 🛰️ Recon | 205 | Sniper + droid spotter, mines to cover the retreat. |
| 🔭 Recon | 🏹 Marksman | 160 | Cheaper sharpshooter: sniper + commando pistol. |
| 🔭 Recon | ⚡ EMP Hunter | 200 | Hunts droids and tanks: EMP + mines + droid. |
| 🧰 Support | 🔧 Engineer | 170 | Fixes tanks and gates: shotgun, detpack, fusion cutter. |
| 🧰 Support | 🩹 Medic | 140 | Keeps the squad alive with health & ammo drops. |
| 🧰 Support | 🏗️ Demolitions | 185 | Cracks buildings: detpacks + rocket (one explosive type). |
| 🧰 Support | ⛏️ Sapper | 160 | Mines chokepoints and repairs: fusion cutter + mines. |
| 🧰 Support | 🗼 Turret Engineer | 170 | Holds ground with a deployable auto turret. |
| ⭐ Command | ⭐ Commander | 218 | Leads the squad: chaingun + rally call + cape. |
| ⭐ Command | 📣 Rally Captain | 160 | Cheaper leader: blaster + rally call + cape. |
| ⭐ Command | 🏅 Field Marshal | 273 | Armored leader: EMP, rally call, heavy armor. |

You edit colors and the flag **once per nation**, and every unit of that nation uses them: trooper, tank, squads, and saved-look thumbnails.

## Controls
| | |
|---|---|
| **Drag** / one finger | rotate the turntable |
| **Wheel** / pinch | zoom |
| 🪖 / tank icon (top right) | switch unit: trooper ↔ tank |
| front · side · back figures | camera presets |
| 🔄 | auto spin |
| 👥 | squad preview at RTS camera distance. **👥 100** cycles 50 / 100 / 200, and **🔀** gives a mixed squad (90% troopers + 10% tanks) |
| 🎲 / ↺ | randomize / reset the current unit. For a trooper, ↺ resets to the slot's template (or the base kit). On the 🏳️ tab, 🎲 randomizes the nation's colors and flag. |
| roster strip (above the tabs, trooper only) | 6 slot buttons (icon + 💰, or dashed **+ Slot N** when blank). Tap one to edit it; tap a blank one or the active one again to open the slot sheet |

**Labels (v4.1).** The UI is icon-first, so:
- the section header shows the slot as a ✏️ chip (tap to rename)
- the active tab shows its name under the icon (e.g. 🔫 **Weapons**)
- a section header sits at the top of the panel, e.g. `🔫 Weapons · main weapon, ⭐ award`, plus the roster type being edited (🛡️ Heavy) or 🚜 Tank
- tapping a tab, roster slot, unit switch or view/spin/squad/🎲/↺ button pops a short label right next to it (🛡️ Heavy, 📷 Back view, 🚜 Tank…) without covering it
- every one of those buttons has a hover title on desktop

Panel tabs (bottom sheet on phones, side panel on desktop and landscape):

- 🏳️ **Nation**:
  - 👤 player name
  - nation list: tap to switch, ✏️ rename, 🗑️ delete. Delete asks ✔️/✖️ first and says how many saved looks go with it; the last nation can't be deleted. ➕ creates a new nation.
  - primary and secondary colors (12 each + 🎨 custom), suit tone, 12 flag symbols, symbol color (auto / light / dark / primary), glow color and glow level
- Trooper parts (every loadout tile has a one-line tooltip saying what it does in the RTS; picking one also toasts it):
  - 🪖 helmet (dome, angular, crest, goggles, recon) + skin tone
  - 🛡️ armor: **Standard** (white clone-style plates with nation trim) or **Heavy** (more HP, slower, bulkier), with a ❤️ HP / 🏃 speed preview, + shoulder pads
  - 🔫 main weapon (pick 1): Blaster rifle, Rocket launcher, Sniper rifle, Shotgun, Chaingun, EMP launcher, + the **⭐ award weapons** row
  - 💣 sidearm (Blaster pistol / Commando pistol, in a right-thigh holster) + explosive on the belt (Thermal detonator, Mines, Detpacks, Time bombs)
  - 🎒 gadget, 0 or 1, worn on the back: Deployable auto turret, Remote recon droid (hovers by the shoulder), Jetpack, Fusion cutter (repair), Health & ammo drop, Rally (temporary damage resistance for nearby allies). Also 🚩 back flag and cape / scarf.
- Tank parts:
  - ⛓️ hull (light / medium / heavy) + drive (treads / hover)
  - 🎯 turret (dome / wedge / box) + main gun (cannon / twin / railgun / laser)
  - 📡 extras, as on/off tiles: antenna, pennant (nation flag), side skirts, smoke launchers, roof MG

  The nation flag is always shown on both turret sides.
- 💾 **Saved**: **💾+** saves the current unit look into the active nation. Looks are grouped by nation, with thumbnails rendered in that nation's colors; they re-render when the nation's colors change. Tap a look to load it (this switches the unit and the active nation). 🔗 copies a share code, 🔁 overwrites the look with the current one, ✏️ renames, 🗑️ deletes (with confirm).

Part buttons are live 3D thumbnails drawn in the current nation's colors.

## ⭐ Award weapons
Every main weapon has a gold ⭐ award version, unlocked by earning the same medal 64 times. There's no combat yet, so all six show as locked tiles: 🔒, a medal counter of 🎖️0/64 and the price. Tapping a locked tile only shows the counter. Once unlocked, the award version adds a gold rail, a gold muzzle ring and a glow light, and costs more (table below).
- Medal counts live in the save (`db.medals`, one per weapon). The RTS can raise them later.
- Hidden debug unlock: open with `?debug=1` to get a 🧪 ⭐🔓 toggle on the 🔫 tab, or call `__tc.debugUnlock(true)` / `__tc.medals(w, 64)`.
- If an award is picked and later locked again, the choice is kept but isn't shown or charged until it's unlocked.

## 💰 Cost and ⚡ power
Chumi's rule: *"The more or better stuff a unit has the more it will cost in game."* The whole table lives in one config object, `COST` in `js/cost.js`, which the RTS can import as-is.

- **Unit cost** = base + the cost of each chosen option.
- **Power** = base + the power of each chosen option, so "better = pricier" is visible.
- **Cosmetics are free:** everything at nation level (colors, suit, flag, symbol color, glow), plus helmet style (except the recon sensor), cape/scarf, back flag, skin and tank pennant.
- **HP / speed** (`STATS` in `js/cost.js`): trooper ❤️100 🏃5.0. Heavy armor +60 HP and −1.4 speed; rocket −0.3 and chaingun −0.5 speed; jetpack +1.5 speed. Tank ❤️400 🏃3.0, adjusted by hull, hover drive and skirts.

| Trooper (base 💰100 ⚡10) | options: cost (power) |
|---|---|
| helmet | dome / angular / crest / goggles 0, recon +5 (+1) |
| armor | Standard 0, Heavy +45 (+9) |
| shoulder pads | none 0, round +5 (+1), angular +8 (+2) |
| main weapon | Blaster 0, Rocket +60 (+10), Sniper +45 (+8), Shotgun +20 (+5), Chaingun +55 (+9), EMP +50 (+8) |
| ⭐ award version (when unlocked) | Blaster +30 (+3), Rocket +40 (+4), Sniper +35 (+4), Shotgun +25 (+3), Chaingun +40 (+4), EMP +35 (+4) |
| sidearm | Blaster pistol 0, Commando pistol +10 (+2) |
| explosive | Thermal 0, Mines +15 (+3), Detpacks +20 (+4), Time bombs +15 (+3) |
| gadget | none 0, Auto turret +50 (+8), Recon droid +30 (+4), Jetpack +40 (+6), Fusion cutter +25 (+3), Health & ammo +35 (+5), Rally +45 (+7) |
| cape / scarf, back flag, skin | 0 |

Default roster: 🪖 Trooper 💰105 ⚡11 ❤️100 🏃5.0 · 🛡️ Heavy 💰238 ⚡36 ❤️160 🏃3.3 · 🎯 Sniper 💰195 ⚡26 · 🔧 Engineer 💰170 ⚡23 · 🚀 Jet 💰198 ⚡26 🏃6.5 · ⭐ Commander 💰218 ⚡30 🏃4.5.

| Tank (base 💰400 ⚡50) | options: cost (power) |
|---|---|
| hull | light 0, medium +80 (+15), heavy +180 (+35) |
| drive | treads 0, hover +120 (+10) |
| turret | dome 0, wedge +10 (+2), box +20 (+4) |
| main gun | cannon 0, twin +60 (+12), railgun +140 (+28), laser +110 (+22) |
| extras | antenna +15 (+3), side skirts +30 (+6), smoke +25 (+4), roof MG +35 (+7), pennant 0 |

Ranges: the trooper costs 💰100 to 338 (⚡10 to 50), and the tank 💰400 to 965 (default 495).

Where cost shows up:
- the live **💰 cost ⚡ power ❤️ HP 🏃 speed** chip under the stats (it bumps when the cost changes)
- 💰 on each roster button
- a **+cost** badge on every priced option button (free options have no badge)
- **💰/⚡ on each saved-look card**
- the **squad total** in the 👥 squad header. A mixed 100 is 10 tanks plus 15 of each roster type: 10×495 + 15×(105+238+195+170+198+218) = 💰21.8k

## Share codes
- **TC3:** `TC3:<base64url JSON>`, with player name, nation name, nation colors/flag, **all 6 roster slots** (name, icon, full loadout including ⭐), active slot, tank look and the active unit. v4.2 adds three optional arrays: `rb` (blank flags, 0/1), `rt` (template id or null) and `ri` (auto-icon flags). Older readers ignore them; v4 codes without them load as 6 filled slots with the starter templates. A per-look 🔗 code carries a single trooper look instead of the roster, and loads into the active slot. Loading a code reuses a nation with identical colors/flag (preferring the same name) or creates a new one. It does not overwrite your player name.
- **TC2** (v2/v3) and **TC1** (v1) codes still load into the active roster slot. Old gear maps into the kit like this:
  - armor: light/medium → Standard, heavy → Heavy
  - rifle: carbine → Blaster rifle, long laser → Sniper rifle, bullpup → Shotgun
  - backpack: jetpack → Jetpack, radio → Rally, ammo pack → Health & ammo drop

## Storage and migration
Everything is saved in localStorage under `trooper-custom:db` (`{v:3, player, nations[{…colors, roster[6]}], active, slot, unit, tank, looks, medals, debugAward}`).

**Roster slot shape (v4.2, still `v:3`).** The format is additive: every v4 field is still there.
```js
{ name: 'Medic',   // '' when blank (v4: always set)
  icon: '🩹',      // '' when blank
  t: { helm, armor, pads, weapon, award, side, expl, gadget, extra, banner, skin }, // always present; base kit when blank
  blank: false,    // NEW: true = empty slot
  tpl: 'medic',    // NEW: template id, or null (blank trooper / empty)
  ia: false }      // NEW: true = icon follows the main weapon
```
**For Conquest Commander** (it reads `nations[].roster`): skip slots with `blank === true` (e.g. `roster.filter(r => r && !r.blank)`), and fall back to its default roster if none are left. Without this filter, a blank slot still parses (name '' → 'Trooper', base kit), so nothing crashes; it would just appear as an extra base-kit unit. In this app, squads and mixed squads skip blank slots; if the active slot is blank, a single-type squad uses the base kit.

**v4/v4.1 save → v4.2:** nothing to migrate. Slots without a `tpl` key get the starter template of their index (so ↺ behaves as before), plus `blank:false`.

**v2/v3 save → v4:**
- every nation gets the 6 starter templates
- the old current trooper goes into slot 0 (Trooper) of the active nation, mapped as above
- saved trooper looks are converted; tank looks and the current tank are kept
- the old save is kept as `trooper-custom:db-v2`

**v1 keys:** on first run, the v1 keys (`trooper-custom:current`, `trooper-custom:looks`) are migrated:
- one nation is created per distinct color/flag combination ("Nation 1", "Nation 2", ...)
- each v1 look moves into its nation as a trooper look
- the current look's nation becomes active
- the 💾 tab opens once

The v1 keys are left untouched.

## Performance budget (RTS-ready)
| | trooper | tank |
|---|---|---|
| triangles | 668 to **1,474** worst loadout (roster types 968 to 1,062) | 552 to 1,330 (default 898) |
| budget (enforced by tests) | ≤ 1,500 (no need to raise it to 1,800) | ≤ 2,500 |
| materials | **2, shared by both units** | same 2 |
| draw calls, posable single unit | 7 to 8 (4 bones × 2 materials) | 4 |
| draw calls, squad (any size) | 2 per roster type (mixed squad: 6 types + tanks = 14) | 2 |

The worst trooper loadout is goggles helmet, Heavy armor, round pads, ⭐ rocket, commando pistol, mines, jetpack, scarf and banner. The tests check every loadout combination (armor × weapon × award × sidearm × explosive × gadget × cape/scarf × banner = 8,064) with the heaviest helmet and pads.

- **Materials:** one Lambert **nation atlas** (a 176×64 canvas holding the flag tile plus primary, secondary, skin, suit, gunmetal, clone-white and award-gold swatches) and one emissive **glow** material. Recoloring a nation only repaints the atlas: no new materials, no new draw calls. The trooper and tank use the *same* material instances.
- **Squads:** each unit type is merged per material into one `InstancedMesh`. Every instance's matrix is updated each frame (bob/sway, hover tanks float), as it would be in an RTS.
- The HUD shows 🔺 triangles · 🖌️ draw calls · ⏱ FPS.
- Headless Chromium with SwiftShader (software rendering, no GPU) runs a single unit at ~60 fps and 100 troopers, tanks or mixed at ~12–20 fps. A real GPU handles this easily, since the draw-call count stays constant.

For RTS reuse, `js/trooper.js` exports `TeamLook` (atlas + 2 materials), `buildMergedDef(def, state)` and `TROOPER`, and `js/tank.js` exports `TANK`. Create one `TeamLook` per nation and one `InstancedMesh` per material per unit type.

## Files
Publish: `index.html`, `css/`, `js/` (`main.js`, `trooper.js`, `tank.js`, `cost.js`, `templates.js`), `vendor/` (three.js r169 + OrbitControls, vendored, no CDN), `icon.svg`, `manifest.webmanifest`, `sw.js`, `README.md`.
Don't publish: `test/`, `screenshots/`.

The service worker only registers over https. Its cache is `trooper-custom-v6`, and cleanup only deletes caches starting with `trooper-custom-`. Assets load with `?v=6`.

## Tests
```
PLAYWRIGHT_BROWSERS_PATH=<playwright browsers> node test/run.mjs
```
The tests check the following at 390×844, 390×664, 360×740, 844×390 and 1280×800:
- 0 console errors and no overflow on every tab of both units, touch targets of 36 px or more
- every trooper, tank and nation option changes the model, and nation colors propagate to both units
- all UI buttons work
- labels: at every size, the active tab shows its name and the section header matches, for every tab of both units; tap labels appear for tabs, roster slots, unit switch and view buttons, stay in view and don't cover the button; every control has a hover title
- TC3 round-trips all 6 roster slots (loadouts, names, icons, blanks, templates); v4 TC3 codes still load; TC2 and TC1 are accepted and mapped; bad codes are rejected
- trooper (8,064 loadout combos) and tank triangle budgets hold, and each roster type is within budget
- the roster: 6 starter kits, distinct models, cost/HP/speed, the strip UI, per-slot edits surviving a reload, ↺ to the template
- blank slots (v4.2): a new nation = 6 blanks; the chooser; the template picker (≥18, grouped, thumbnails, cost, description) applies loadout + name; blank trooper with a typed name; inline rename persists after reload; icon picker and auto icon; ↺ to the template or base kit; clear with confirm; fill-starter with confirm; squads skip blanks; the save shape; the slot sheet fits at all 5 sizes
- a v4 save (no blank/tpl fields) keeps its filled roster
- loadouts: every tile has an RTS tooltip and toasts it, every option adds a visible model piece, the HP/speed preview works
- ⭐ award weapons: locked 0/64, unlocks at 64 medals (not 63), gold model, priced per the table, `?debug=1` toggle, relock behavior
- cost = base + table for every option; every priced option changes cost and every cosmetic one doesn't; the +cost badges match the table; better = pricier; cost shows on saved-look cards and in the squad header
- trooper, tank and mixed squads
- nation create / rename / switch / delete with confirm, and the player name, all surviving a reload
- saved looks grouped by nation (load, rename, overwrite, delete) surviving a reload, with thumbnails re-rendering in the nation's colors
- v1 → v4 and v2/v3 → v4 migrations, which run once

Screenshots are written to `screenshots/` and results to `test/last-results.txt`.
