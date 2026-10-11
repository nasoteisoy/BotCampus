# ☕ Coffee Opening

A 3D tracker for opening a **new** coffee shop. An isometric lot builds itself up as the opening plan moves forward: survey stakes, then the foundation, walls, roof, signage, equipment, staff, cars in the drive-thru, and balloons on opening day. The progress comes from your real checklists, which you can edit.

Live once pushed: https://nasoteisoy.github.io/BotCampus/games/coffee-opening/ (Add to Home Screen to install it; it works offline after the first visit.)

**🧪 Example data.** The 4 stores and every task are a generic example plan, not a real company. ⚙ → ↺ resets everything back to the example plan.

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
- **📋** lists all 11 stages with bars. **🏪 ▾** lists the stores: switch, rename, change the icon, ＋ add a new store with a blank plan, or 🗑 delete one.
- **🎬 Auto tour**: plays the whole build from 0 to 100% in 60 s, with the camera following each stage. It never changes your data. ⏹ or any timeline tap stops it.
- **🌙 / ☀️**: night mode (dark, neon orange routes, lit lamps and windows) or day mode (light, coral accents).
- **✋ Drag** is off by default, so swipes and pinches on the scene do nothing. Switch it on (orange outline) to drag-pan, pinch-zoom, twist-rotate or wheel-zoom. ➕ ➖ ⟳ ⌂ always work.
- **Saving**: every edit is saved to `localStorage` (`coffee-opening-v1`). ⚙ → ⬇ Export JSON / ⬆ Import JSON (it accepts a full export or one store; anything else is rejected and your data is kept).

## Tech
- Plain files, no build step. `three.module.min.js` is three.js r169 (MIT), vendored so the app works offline.
- `data.js`: stages, the example plan, progress, status, load and import. It has no DOM, so it also runs in node.
- `app.js`: the Three.js scene (OrthographicCamera, flat-shaded low-poly boxes and cylinders, ground progress rings, dotted routes with glowing pulses, movers), the HTML labels, the panel, the timeline, the tour, and input.
- Phones: the pixel ratio is capped at 2, there is one shadow-casting light (1024 map), and geometry stays low (about 17k triangles). The dots on each route are a single instanced mesh.
- `sw.js`: cache `coffee-opening-v1`, network first with a cache fallback. On activate it deletes only keys starting with `coffee-opening-` (the origin is shared with the other games).
