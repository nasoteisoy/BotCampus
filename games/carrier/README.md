# Carrier Traits

A phone-first WW2 Pacific carrier game. **You are the carrier.** You choose where to sail and what to launch; your air group, escorts and the enemy act on their own. Everything you do earns ⭐ points, and you spend them on **traits** that change how your carrier plays.

Plain JavaScript and canvas. No libraries; all art is drawn in code. Works offline as a PWA (cache `carrier-v1`). Designed for 390×844 portrait, and fine on desktop.

## Playing (almost no reading: icons first)
- **👆 Tap the sea** to sail there. **Tap a ship or a red `?`** (a last-seen contact) for 💥 Strike / 🔭 Scout buttons.
- **🔭 Scout**, then tap the sea: one scout flies there and searches. When it finds ships it **shadows them**, so their position stays fresh until it runs low on fuel.
- **💥 Strike**, then tap a target: every ready bomber 💣 (and 🐟 torpedo planes, once unlocked) goes, plus spare fighters 🛩 as escort. The dashed ring is strike range. A strike sent to an old `?` may find empty sea.
- **🛡 − n +**: how many fighters to keep on CAP over the carrier. The deck relieves them automatically. The number after the dot is how many are up or queued.
- **🛬** recalls everything.
- **Deck cycle**: ⏫ spot → ⚙ arm → 🛫 launch → 🛬 recover. The deck does **one thing at a time**. The slot strip shows the planes spotted on deck, and armed bombers glow red.
  - While a strike is spotted and arming, returning planes circle and burn fuel ⛽. Planes that run dry ditch.
  - When someone is low on fuel, the deck pauses a launch between planes to land them.
  - If a bomb hits while armed or fueled planes are on deck, they **explode** 💥: extra damage, big fires 🔥, and lost planes.
- **🔥 Fire** burns the hull and closes the deck while it is above 30. **💧 Flooding** slows the ship.
- **📡 Being found.** Patrol boats, ships and enemy scouts that see you report your position after a few seconds (scouts take 5 s), and then enemy carriers and bases arm and launch raids at that spot.
  - Shoot their scouts down before they report (+⭐), or move away after being reported: raids fly to where you *were*.
  - An enemy that radios a report also gives itself away: a 📻 fix shows its rough position.
- **🌙 Night** falls at 18:00 in zones 3–5. Without 🌙 Night Ops you cannot launch, landings can crash, and attacks are weaker. Everyone sees less.
- **Controls**
  - ⏸ pauses; ×1 / ×2 / ×4 sets the speed.
  - ⚓ (tap twice) withdraws from the mission. ❓ opens help and the tutorial.
  - **✋ Drag**: panning by drag is **off by default**, so touches never move the map by accident. Turn ✋ on to drag-pan.
  - Pinch, the mouse wheel or ＋/－ zoom. 🎯 follows the carrier, ⤢ shows the whole map, and tapping a feed line jumps to it.

## Missions and progression
- There are **5 sea zones**: 🏝 Coral Shoals, 🌋 Volcano Strait, 🌙 Moon Reef, ⛈ Storm Sea and 🏯 Dragon Gate.
- Each zone has missions you can replay:
  - 🚤 **Patrol sweep**: sink the patrol boats.
  - 🚢 **Convoy raid**: sink most of the cargo ships before they cross the map.
  - 🏝 **Base strike**: knock out an island air base that has its own CAP, scouts and raids. Zones 2–5.
- **2 wins in a zone** open its ⚔ **Carrier battle**: an enemy carrier group with its own scouts, CAP and strikes. A light carrier in zone 1, a fleet carrier with destroyers in zone 2, plus a cruiser and pickets later. Winning it unlocks the next zone. Enemy skill, AA and numbers grow by zone.
- **Losing** means the carrier is crippled 🏳 and limps back to port.
  - You keep half the ⭐ earned in that mission.
  - The ship is repaired and lost planes are replaced with rookies.
  - There is no permadeath. Pilots who were rescued keep their XP.
- **Pilots** gain XP from sorties, hits and kills (🎖 stars improve aim and gunnery). Five kills make an ace ⭐ (three with Ace Program).
- **⭐ Points**
  | Action | ⭐ |
  |---|---|
  | Sink a patrol boat | 2 |
  | Sink a cargo ship or destroyer | 3 |
  | Sink a cruiser | 5 |
  | Sink a light carrier / fleet carrier | 10 / 12 |
  | Knock out a base | 8 |
  | Each contact found 🔭 | 1 |
  | Enemy scout downed before it reports | 1 |
  | Raid beaten off with no hits 🛡 | 3 |
  | Clean strike recovery 🛬 | 1 |
  | Caught an enemy carrier arming | 3 |
  | Mission complete | 6 |
  | Carrier battle won | 12 |
- **After-action report** after every mission: result, ⭐ breakdown, 👍 what went well and ⚠ mistakes.
  - Mistakes include: armed planes blew up on deck, strike launched with no CAP, enemy reported us, they found us first, planes ditched, strike out of range, strike hit empty sea, fires, raids got through, ships escaped, night crashes, heavy losses.
  - Went well includes: sinkings, hits, kills, raids beaten off, clean recoveries, finds, scouts stopped, caught them arming, found them first, struck first, new aces, never reported.
- **Save**: progress is stored in `localStorage` (`carrier-save-v1`) after each mission and each purchase. A mission in progress is not saved. ♻ in port resets everything (with a confirm).

## Traits (33, in 7 trees)
| Tree | Traits (⭐ cost, 🔒 needs) |
|---|---|
| 🛫 Flight Deck | Deck Drill 3 (spot/arm −30%, refuel −25%) · Fast Launch 4 🔒Drill (launch 2→1.1 s, land 2.4→1.5 s) · Deck Park+ 4 🔒Drill (deck spots 8→12, bigger waves) · Crash Barrier 5 🔒Fast Launch (land while planes are spotted) |
| 🛩 Hangar & Air Group | Fighters +3 · Scouts +2 · Torpedo Squadron 5 (new type 🐟 ×4) · Bombers +3 🔒Fighters · Big Hangar 7 🔒Bombers (+2 🛩💣🐟) |
| 🎖 Pilots | Gunnery 3 (dogfight ×1.35) · Dive School 4 (bomb aim ×1.3) · Torpedo Drill 4 🔒Dive (torpedo aim ×1.35) · Ace Program 5 🔒Gunnery (XP ×1.6, aces at 3 kills) · Night Ops 5 · Air-Sea Rescue 3 (75% of downed pilots saved) |
| 📡 Scouting & Radar | Long-Range Scouts 3 (fuel +40%) · Air Radar 5 (see raids at 900 → CAP meets them far out; radar ring) · Recon Photos 4 🔒LR (scout eyes +30%, contacts never fade, see ⚙ enemy arming) · Surface Radar 4 🔒Radar (ships at 550, day and night) · Codebreakers 6 🔒Photos (enemy carrier/base area 🗝 circled at start) |
| 🧯 Damage Control | Fire Teams 3 (fires out 2× faster, no spreading) · Counter-flooding 3 · Fuel Purge 4 (deck explosions −60%) · Repair at Sea 6 🔒Fire Teams |
| 🚢 Ship | Engines 3 (+30% speed) · AA Guns 4 (×1.5) · Hard Rudder 3 (torpedo hits −35%) · Armored Deck 5 (bomb damage −25%) · Bofors 40 mm 6 🔒AA (×1.5 again) |
| 🛡 Escorts | Destroyer Screen 4 (2 DDs: AA, lookouts, they soak hits) · Radar Picket 5 🔒Screen (DD 600 ahead with air radar) · More Destroyers 4 🔒Screen · Cruiser 7 🔒Screen (heavy AA + floatplane eyes) |

Traits show on the map and in the HUD: the radar ring, escort ships, the 📡 picket, the 🗝 intel circle, extra deck slots, more planes in the hangar chips, ⚙ on arming enemy carriers, and contacts that never fade.

## Balance (headless, `sim.js` + a scripted player bot)
**Zone 1 carrier battle**, 40 seeds each:

| Setup | Win | Lost (sunk) | Out of time | Carrier ❤ left |
|---|---|---|---|---|
| No traits | 11 | 8 | 21 | 64% |
| Sensible 30 ⭐ build (Air Radar, Destroyer Screen, Fighters +3, Dive School, Deck Drill, Fire Teams, Gunnery) | 24 | 0 | 16 | 93% |
| 45 ⭐ build (adds Torpedo Squadron, Long-Range Scouts, AA Guns) | 34 | 0 | 6 | 92% |
| 30 ⭐ build, careless play (no CAP, strikes at anything at once) | 15 | 0 | 25 | 88% |

**Campaign to the first carrier-battle win**, 20 campaigns:
- Buying traits along the way: 20/20 won, median **31 sim-minutes** at ×1, about 3.8 missions (2 wins, then the battle). That is roughly 17–22 real minutes when transits run at ×2.
- Never buying: median 37 sim-minutes, 5.8 missions, with many more carrier-battle defeats.

With no traits, the bot wins zone 1 sweeps 70% of the time and convoys 88%, each taking 8–10 sim-minutes. Full 5-zone campaigns with buys took 2.5–7 sim-hours (3 runs).

## Performance
At 390×844 and ×4, the busiest setup runs at 60 fps: the zone 5 carrier battle with all traits (13 ships and up to about 40 planes). Worst frames are 17–33 ms. Fog is a 60×60 grid, blurred and composited on a 150 px canvas. A sim tick averages about 0.02 ms (Node, zone 5 battle).

## Files
- `index.html`: UI and styles.
- `sim.js`: all rules, with no DOM (`window.CVSim` in the browser, `module.exports` in Node). Covers the data, deck cycle, flights, combat, sensors, enemy AI, missions, AAR and profile.
- `game.js`: rendering, input, HUD, port, AAR, help, tutorial and saves (`window.CV` is exposed for testing).
- `sw.js`: offline cache `carrier-v1`.
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png`.

## Known issues
- Ships steer around islands crudely, by being pushed out of them. There is no pathfinding.
- A mission in progress isn't saved; closing the app abandons it.
- Air combat is resolved in 1-second rounds between flights within 80 m; it isn't a dogfight simulation.
- The headless balance uses a scripted bot. Real players will move and scout differently, so the numbers are a guide.
