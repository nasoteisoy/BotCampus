# Phone Roam / Combat — Option Pack

Three **different** playable micro-games for Jesus to pick among (not skins of one loop).  
Vanilla JS + canvas. Touch + mouse/keyboard. Fixed-dt accumulator loops.

Open any `index.html` locally (file:// or a static server). Script cache bust: `?v=opt1`.

| Option | Path | Pitch |
|--------|------|--------|
| **A** | [a/index.html](a/index.html) | Top-down twin-stick arena clear — left stick move, right stick / Fire shoot, wave score |
| **B** | [b/index.html](b/index.html) | Side-view corridor run — jump, slash primary + gun alt, camera scrolls with you |
| **C** | [c/index.html](c/index.html) | Iso stealth assassin — vision cones, alert meters, dash + rear takedown |

## Per-option layout

```
a/  index.html  game.js  art/.gitkeep
b/  index.html  game.js  art/.gitkeep
c/  index.html  game.js  art/.gitkeep
```

`art/` is empty on purpose — Render A still slots.

## Controls (quick)

- **A:** Virtual L/R sticks (or WASD + mouse/Space/J). Clear waves.
- **B:** On-screen ◀ JUMP ▶ · SLASH · GUN (or WASD/arrows + J/K). Reach the flag.
- **C:** Move stick · DASH · TAKE (or WASD + Shift/K dash, J/Z/Space takedown). Clear 6 marks unseen.

## Docs

- [OPTIONS.md](OPTIONS.md) — pitches for Jesus / Profile
