# Axis & Allies 1942 in Space

Hot-seat browser strategy game for Chumi. Local build only (`/workspace/space-axis-allies/`). Do not push/deploy from this tree (Dev A / Leader route that).

## Run

```bash
cd /workspace/space-axis-allies
python3 -m http.server 8765
```

Open http://127.0.0.1:8765/

Needs network once for three.js via jsDelivr CDN (import map in `index.html`).

## Playtest

```bash
python3 -m http.server 8765 &
node playtest.mjs
```

Screenshots land in `screenshots/`.

## Layout

- `index.html` — shell + import map
- `css/style.css` — UI
- `js/data.js` — factions, units, systems, zones, starting setup
- `js/game.js` — phases, movement, combat, income, victory
- `js/map3d.js` — three.js spheres / zone pins / ship pins (no planet spin/orbit)
- `js/ui.js` / `js/main.js` — hot-seat UI

## Factions (turn order)

1. Iron Khanate ~ USSR  
2. Void Regency ~ Germany  
3. Helix Imperium ~ UK  
4. Crimson Forge ~ Japan  
5. Terran Concord ~ USA  
