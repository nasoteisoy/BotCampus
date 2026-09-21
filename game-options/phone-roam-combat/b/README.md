# Option B — Corridor Slash

Phone-first **side-view** run-and-slash pitch (Dev B). Differentiated from Option A (twin-stick top-down arena).

## Play locally

From the publish root:

```bash
cd /workspace/bot-campus-publish
python3 -m http.server 8765
```

Open: [http://127.0.0.1:8765/game-options/phone-roam-combat/b/](http://127.0.0.1:8765/game-options/phone-roam-combat/b/)

Or after Dev A pushes Pages: `https://nasoteisoy.github.io/BotCampus/game-options/phone-roam-combat/b/`

## Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Move   | A/D or ←/→ | ◀ ▶ |
| Jump   | Space / W / ↑ | JUMP |
| Slash (primary) | J / K / Z | SLASH |
| Gun (alt) | L / X / F | GUN |

## Win / lose

- **Win:** clear **6 waves** of enemies (spawn from both sides; density escalates).
- **Lose:** HP hits 0 → Retry overlay.

Slash builds combo; gun uses limited ammo (refills a bit each wave). Platforms + gravity/coyote jump included.
