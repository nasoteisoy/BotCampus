# BotCampus live hosting

Public site: https://nasoteisoy.github.io/BotCampus/

## Status (2026-09-25)

| Surface | On GitHub Pages | Needs local / adapter |
| --- | --- | --- |
| Hub (`index.html`) | Live | — |
| Old Campus Live / Bot Office | **Retired** (stubs only) | Archaeology via git history |
| **Bot Crossing** (`/crossing/`) | Brochure + shell polling sanitized `agents.json` | Full Three.js colony + harness scan = Node on your machine |
| **Agent World** (`/agent-world/`) | Brochure + demo GIFs only | Live village = Mac `ps`/`lsof` + Claude CLI (or exporter) |

## Pages can host

- Static HTML/CSS/JS hubs and brochures
- Small sanitized JSON feeds (no raw harness transcripts)
- Lightweight demo media (GIFs/posters — not huge proprietary art dumps or background MP4s)

## Pages cannot run

- Bot Crossing’s Vite/Node API (`server/api.mjs`, harness adapters under `server/harnesses/`)
- Local filesystem / session-store scanners
- Agent World’s Mac process discovery and live sprite runtime
- File watchers, OS deep links (`harness://`, etc.)

## Crossing feed schema (Pages)

`crossing/agents.json`:

```json
{
  "updatedAt": "ISO-8601",
  "agents": [
    {
      "id": "string",
      "label": "string",
      "status": "running|waiting|errored|idle|archived",
      "needsYou": false,
      "zoneId": "optional-string"
    }
  ]
}
```

The Pages shell polls this file. An exporter/adapter (later) should write **only** this sanitized shape — never raw transcripts.

## Proposed adapter approach

1. **Local runner** (Mac/Linux/Windows) runs Crossing or Agent World against real harnesses.
2. **Exporter** periodically maps live sessions → sanitized `agents.json` (and optionally Agent World status JSON later).
3. **Publish path**: commit/push to this repo, or CI artifact upload, or a tiny authenticated write endpoint (not required for first live shell).
4. **Windows note**: a local UI on `:3102` does not by itself populate Agent World sprites on Pages; sprites need the Mac-style discovery path or an explicit exporter feeding sanitized JSON.

## Retired URLs

- `/` no longer auto-redirects to `office.html`
- `/campus-live.html` and `/office.html` are retirement stubs linking back to the hub
