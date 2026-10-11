# ☕ Dutch Bros · New Shop Opening Tracker

> **Pitch concept, unofficial.** Not affiliated with or endorsed by Dutch Bros. The name is used only to identify the brand. The windmill-on-a-cup mark, the icons and all the 3D art are original; no logo or brand artwork is copied. (Folder and storage keys keep the old `coffee-opening` name.)

A 3D tracker for opening a **new Dutch Bros-style double drive-thru stand**. An isometric lot builds itself up as the opening plan moves forward: survey stakes, then the foundation, the blue-and-white stand, the roof with its little windmill, the walk-up canopy, the two drive-thru lanes, equipment, Broistas, a car queue in each lane with line-buster Broistas on tablets, and balloons on opening day. The progress comes from your real checklists, which you can edit.

Live once pushed: https://nasoteisoy.github.io/BotCampus/games/coffee-opening/ (Add to Home Screen to install it; it works offline after the first visit.)

**🧪 Example data.** The 11 example shops (Tempe, Mesa, Phoenix, Fountain Hills, Peoria, Gilbert, Scottsdale, Chandler, Goodyear, Glendale, Surprise) are made-up Phoenix-area examples in mixed states, not real plans. ⚙ → 🧹 Clear examples (tap twice) removes only the 🧪 stores and keeps yours. ⚙ → ↺ resets everything back to the examples.

## v3: Dutch Bros pitch
- **Branding**: "Dutch Bros · New Shop Opening Tracker" in the title, the navy header (with an original windmill-on-a-cup mark), a short splash, the manifest (`short_name` Dutch Bros), the PWA icons, the ⚙ menu and both 🎬 tours. The palette is navy / royal blue / white with a light-blue accent, in day and night mode.
- **3D stand**: a small blue-and-white stand with a drive-thru window on each side, a lane on each side, a walk-up window under a canopy, and a windmill on the roof (it spins once open). When open: a stop-and-go car queue in both lanes, 2 line-buster Broistas taking orders on tablets, and walk-up customers. The 🗺 district minis are small stands too.
- **Content**: Broistas, shift leads, a shop operator, the Rebel cooler, cold brew, the Golden Eagle / Rebel menu test, line-buster tablet training and a daily tablet check, the Dutch Rewards app, double drive-thru car stacking in scouting, and opening-day event checks. New issue presets: 🚗 drive-thru wait time high, 📱 app ordering down (urgent), 🥤 Rebel stock low.
- **Saves**: v3 saves to `coffee-opening-v3` and migrates v2 and v1 saves (the old keys are left as a backup). Your own shops and everything you changed are kept. A 🧪 example shop is swapped for its Dutch Bros example only if it is still exactly as it shipped (same ticks, texts, owners, votes, issues and relative dates, checked by fingerprint). If you had already cleared the examples, none are added. Importing a v1 or v2 JSON export goes through the same migration.

## v2: many stores, open stores
- **🏪 ▾ store picker**: an icon list. Filter 🏪 all / 🏗 opening / ☕ open / ⚠️ needs attention, each with its count. Sort 🚨 urgency / 📶 stage / 🔤 name. Each row shows the icon, the name, 🧪, a status line of icons and a bar. ＋ adds a store; ✏️ renames it or changes its icon; 🗑 deletes it (tap twice).
- **🗺 District map** (side button, picker header or ⚙): every store is a mini 3D building that grows with its own build progress. Each has a status ring (royal blue: opening; 🟢 open and normal; 🟠 attention or at risk; 🔴 urgent, rejected or blocked, pulsing) and a label. Tap a building or its label to fly into that store. The bottom bar holds the filter chips with counts: non-matching stores are dimmed and the list opens. 🎬 there runs the **district tour**, flying store to store (urgent ones first, about 2.4 s each).
- **🏪 Open / Operating**: the lifecycle state after 🎉. The timeline ends with a 🏪 node; once all 11 stages are at 100%, "🏪 Open the store" appears there and on the 🎉 sheet. ↩ in the picker moves a store back to opening (tap twice).
  - **3D**: the stations are gone and the lot is in business. Windows are lit, the sign says NOW OPEN, customers walk in, the drive-thru is full and road traffic is busy. A **3D bubble** floats over the roof for each open issue, with a border colour by priority and a red pulse when it is urgent. ✅ shows when there are none. Tap a bubble to open that issue.
  - **Dashboard bar** (replaces the timeline): the status chip, the issue icons, 🔁 checks done/total, and ➕.
  - **Status**: 🔴 Urgent if any open issue is urgent; 🟠 Needs attention if any is high, any is past its due date, or any routine check is overdue; otherwise 🟢 Normal. 🤖 / 🟢 / 🟠 / 🔴 overrides it manually.
  - **🛠 Issues**: icon, title, 👤 owner, 📅 due, and a priority chip (tap it: 🔵 low → 🟠 high → 🔴 urgent). ✔ resolves an issue (it moves to "✔ resolved", where ↩ reopens it). ✏️ edits the title and owner, and 🗑 deletes (tap twice). Presets: 🧊 walk-in cooler down, ☕ espresso machine service, 👥 staffing short, 🧾 health inspection due, 📦 low inventory, 🧹 deep clean, 🔧 HVAC repair, 📄 permit renewal, ⭐ bad review follow-up. You can also type your own.
  - **🔁 Routine checks**: daily (temps, sanitize, cash, floor), weekly (backflush, inventory, schedule) and monthly (HVAC filter, water filter, safety walk). Each one resets at the start of its day, week (Monday) or month: ✅ done, ⏳ due, ⚠️ overdue (missed the previous period). When all are done the header shows "✅ Normal".
- **Saving**: see v3 above.

## The 11 stages (bottom timeline)
| # | Stage | In the 3D lot |
|---|---|---|
| 1 | 🔍 Site scouting | surveyor tripod, flagged stakes, scout car |
| 2 | ✍️ LOI signed | FOR LEASE sign turns to LEASED ✔ |
| 3 | 📦 REC package ready (designs, budget, pro forma, legal, lease draft) | binders stack up, blueprint roll |
| 4 | 🗳 REC vote: ✅ Approved / ⏸ Deferred / ❌ Rejected / ⏳ Pending | podium lamps; ❌ turns stages 5–11 red ⛔ and stops them |
| 5 | 📝 Pre-construction (lease executed, permits, GC contract, drawings, utilities, schedule) | site trailer, permits pinned, footprint stakes |
| 6 | 🏗 Construction (groundbreak → inspections → paving → signage) | crane and trucks; foundation → walls → roof → glass front → paved lane → sign |
| 7 | ☕ Equipment (espresso, grinders, refrigeration, POS, …) | crates turn into machines behind the glass; HVAC on the roof |
| 8 | 👥 Hire & train | the training huddle grows; staff walk in from the parking lot |
| 9 | 📅 One month out (vendors and supply, marketing, staff ready) | pallets; two lamps check stage 7 ☕ and stage 8 👥 |
| 10 | 🧪 Soft open (menu test, dry runs) | patio tables, first drive-thru cars |
| 11 | 🎉 Grand opening | balloon arch, ribbon, confetti, a busy drive-thru, NOW OPEN sign |

## Progress rules
- **Stage %** = ticked tasks ÷ tasks. For 🗳, the vote counts as one more item, done only when it is ✅ Approved. For 📅 One month out, "stage 7 at 100%" and "stage 8 at 100%" count as 2 more items (it is a readiness rollup).
- **❌ Rejected** stops stages 5–11: they show 0%, red ⛔, 🔴 Blocked, and the building stays empty.
- **Status** is automatic: ✅ done, 🟠 at risk (a task or the stage is past its date, or the vote is ⏸ Deferred), 🔴 blocked (rejected), 🟢 on track otherwise. You can override it per stage (🤖 auto / 🟢 / 🟠 / 🔴).
- **Overall %** (top bar) = the average of the 11 stages. **🎉 N** = days to the grand-opening date. Tap it to change the date.

## Using it
- **Tap** a station, its floating label, the building, or a timeline node. The camera glides there and the panel opens: a bottom sheet on a phone held upright (at most about half the scene), a floating side panel in landscape. The panel shows %, status, 👤 owner, 📅 due date, the vote buttons or the readiness checks, and the checklist.
- **Checklist**: tap the box to tick. ✏️ renames, 📅 sets a date (red when overdue), 🗑 deletes (tap twice). ＋ adds a task. ◀ ▶ step through the stages.
- **📋** lists all 11 stages with bars (on an open store it opens the dashboard). **🏪 ▾** is the store picker (see above).
- **🎬 Build tour** (on a store; on the 🗺 map 🎬 is the district tour): plays the whole build from 0 to 100% in 60 s, with the camera following each stage. It never changes your data. ⏹ or any timeline tap stops it.
- **🌙 / ☀️**: night mode (deep navy, light-blue neon routes, lit lamps and windows) or day mode (light, navy and royal-blue accents).
- **✋ Drag** is off by default, so swipes and pinches on the scene do nothing. Switch it on (orange outline) to drag-pan, pinch-zoom, twist-rotate or wheel-zoom. ➕ ➖ ⟳ ⌂ always work.
- **Saving**: every edit is saved to `localStorage` (`coffee-opening-v3`). ⚙ → ⬇ Export JSON / ⬆ Import JSON (it accepts a full export or one store; anything else is rejected and your data is kept).

## Tech
- Plain files, no build step. `three.module.min.js` is three.js r169 (MIT), vendored so the app works offline.
- `data.js`: stages, the example plan, progress, status, load and import. It has no DOM, so it also runs in node.
- `app.js`: the Three.js scene (one `lot` group for the store and one `dist` group for the 🗺 map; the issue bubbles are emoji canvas sprites) (OrthographicCamera, flat-shaded low-poly boxes and cylinders, ground progress rings, dotted routes with glowing pulses, movers), the HTML labels, the panel, the timeline, the tour, and input.
- Phones: the pixel ratio is capped at 2, there is one shadow-casting light (1024 map), and geometry stays low (about 17k triangles). The dots on each route are a single instanced mesh.
- `sw.js`: cache `coffee-opening-v3`, network first with a cache fallback. On activate it deletes only keys starting with `coffee-opening-` (the origin is shared with the other games).
