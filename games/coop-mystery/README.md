# Co-op Mystery (V1)

Phone-first multiplayer co-op mystery for Chumi. **Not** The Last Toast — separate game.

Live path (after Dev A push): `games/coop-mystery/` on BotCampus Pages.

## How to play

1. **Create room** → share the 4-letter code. Others **Join** with code + name (rejoin = same name).
2. Host taps **Start**. Each round you get **Say these** lines (talking points — not labeled as clues).
3. Say them out loud. Others tap **I heard…** and pick from a short list. A **wrong pick costs a token**. A right pick unlocks phrase-gated exits on **their** maze only.
4. Your map is a **flat 2D maze** of question spaces. From **here** you see only **adjacent exits** (N/E/S/W). Fog hides the rest — you cannot tap every cell.
5. **Ask this space**: pick a response (1–3). Costs **1 token**. The right answer (often needs a heard phrase) opens the next space and may grant a clue. Wrong / dead end = **Dead end** wall, response **locked for the round**, and **+1 token** cost.
6. Role ability: 1 use / round (Peek fog neighbor, force a talk line, swap a line, verify a clue).
7. Host ends the round → **closest** callout = key clues found **per tokens spent** (guessers rank lower).
8. Final round: group votes **Who has the key?** → win/lose.

**Solo Test:** one phone + bots that show lines so you can feel hear → ask alone.

## Spec coverage (V1)

| Item | Status |
| --- | --- |
| Rounds + private talking points | Yes |
| Phrase-match on receiver (gates exits) | Yes |
| Flat 2D maze, adjacent exits only | Yes |
| Fog of war (non-adjacent hidden) | Yes |
| Question spaces, 1–3 responses | Yes |
| Dead-end walls + lock for round | Yes |
| Question tokens + dead-end extra cost | Yes |
| Wrong hear costs a token | Yes |
| Closest = keys / tokens spent | Yes |
| 4 roles × abilities | Yes |
| Big buttons / one hint / SVG icons | Yes |
| Sample mystery ~3 rounds + final vote | Yes |
| PeerJS host-authoritative + room code | Yes |
| Rejoin localStorage | Yes |
| Solo bots | Yes |
| Content data file + schema | Yes |

No puzzle gates beyond phrase-gated exits (V2). No fantasy content.

## Multiplayer tech

- **PeerJS 1.5.4** vendored (`vendor/peerjs.min.js`) + CDN pin fallback.
- Host owns state; each client gets only their private view.
- Broker / WebRTC failure → clear error; use **Solo Test** or loopback test bus.
- Loopback (`CoopMysteryNet.LoopbackHost/Client`) for automated tests without WebRTC.

## Content schema (`data/*.json`)

```json
{
  "id": "sample-key",
  "title": "Who Has the Key",
  "rounds": 3,
  "tokensPerRound": 4,
  "deadEndExtraCost": 1,
  "suspects": [{ "id": "p1", "name": "Person 1" }],
  "solution": { "suspectId": "p2", "keyClueIds": ["c_desk", "c_camera", "c_bag"] },
  "roles": [{ "id": "role-a", "name": "Role A", "abilities": [
    { "id": "peek", "label": "Peek", "icon": "eye", "usesPerRound": 1, "hint": "…" }
  ]}],
  "phrases": [{ "id": "ph_desk", "text": "Saw it on the desk" }],
  "clues": [{ "id": "c_desk", "text": "Key sat on desk at noon", "deadEnd": false, "herring": false }],
  "maze": {
    "startId": "s0",
    "walledDirs": { "s0": [] },
    "cells": [{
      "id": "s0", "x": 1, "y": 1, "label": "Lobby", "question": "Where first?",
      "responses": [{
        "id": "s0_a", "text": "Desk row", "deadEnd": false, "to": "s_desk",
        "dir": "N", "clueId": null, "requiresPhraseId": null,
        "trail": "true"
      }]
    }]
  },
  "roundTalkingPoints": [{ "role-a": ["ph_desk"], "role-b": ["ph_camera"] }],
  "bots": [{ "name": "Bot 1", "roleId": "role-b" }]
}
```

### Doors, false trails, herrings

- Each maze cell is a **door** with 1–4 exits (responses). Each pick spends 1 guess; a wrong pick (dead end) costs +1 and **locks that door for the round**.
- `trail: "false"` on a response marks a **false-trail door**. It opens like any other and looks identical. Cells reached only through false doors are a false branch.
- `herring: true` on a clue = red herring. Players never see the flag; it reads like a real clue.
- False branches must **never** hold key clues. `node tools/validate.js data/<file>.json` checks this.
- Closest callout scores only real key clues per guess spent. The final reveal shows each player's clues as Key / Real / Herring / Dead end, plus the false doors they passed.

Ability ids: `peek`, `force`, `swap`, `check`.

## Local run

```bash
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## Tests

```bash
PLAYWRIGHT_BROWSERS_PATH=<repo> node tests/e2e.mjs
```

Checks: fog hides non-adjacent cells, tokens decrement, dead-end extra cost, wrong hear costs, wrong response locks, receiver-only phrase, callout efficiency, final reveal, PeerJS probe.

## Ship

`ship/coop-mystery/` + `ship/thumb.png` + `ship/hub-card.json`. Dev A pushes — do not commit from this tree.
