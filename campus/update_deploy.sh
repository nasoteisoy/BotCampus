#!/usr/bin/env bash
# Patch deploys[id=botcampus-pages] status in campus-state.json (LiveOps schema).
# Usage: ./campus/update_deploy.sh <building|ready|failed> [note]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/campus/campus-state.json"
STATUS="${1:-}"
NOTE="${2:-}"
if [[ -z "$STATUS" || ! "$STATUS" =~ ^(building|ready|failed)$ ]]; then
  echo "Usage: $0 building|ready|failed [note]" >&2
  exit 1
fi
NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
python3 - "$STATE" "$STATUS" "$NOTE" "$NOW" <<'PY'
import json, sys
path, status, note, now = sys.argv[1:5]
with open(path) as f:
    data = json.load(f)
deploys = data.setdefault("deploys", [])
d = next((x for x in deploys if x.get("id") == "botcampus-pages"), None)
if d is None:
    d = {
        "id": "botcampus-pages",
        "repo": "nasoteisoy/BotCampus",
        "repoUrl": "https://github.com/nasoteisoy/BotCampus",
        "branch": "main",
        "label": "GitHub Pages",
        "pagesUrl": "https://nasoteisoy.github.io/BotCampus/",
        "checkUrl": "https://github.com/nasoteisoy/BotCampus/actions",
    }
    deploys.append(d)
d["status"] = status
d["updatedAt"] = now
d["updatedBy"] = d.get("updatedBy") or "campusdev"
if note:
    d["note"] = note
elif status == "building":
    d["note"] = "Deploying…"
elif status == "ready":
    d["note"] = "Last push live"
else:
    d["note"] = "Deploy failed"
data["updatedAt"] = now
if "schemaVersion" not in data:
    data["schemaVersion"] = 1
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print(f"deploys botcampus-pages status={status} updatedAt={now}")
PY
