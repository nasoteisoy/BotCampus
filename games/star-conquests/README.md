# STAR CONQUESTS

Standalone browser game. Take every planet, earn points, buy units.

## Play

Open `index.html` (serve the `games/` folder). One URL, no hash routing.

- **▶️ New game** / **▶️ Continue** (Continue only if a save exists)
- Galaxy map: tap planets, select units, move or attack linked worlds
- Attack = space battle (if ships) then ground battle
- **🛒 Shop**: buy Rifle / Heavy / Recon / Tank / SpaceShip / BattleShip with points
- Win = hold every planet · Lose = hold none
- Save key: `star-conquests:save`

## Battles

Shell loads `ground/battle.js` and `space/battle.js` (CONTRACT.md). If missing, uses `js/fallback-battle.js`.

Dev test: `dev-battle.html?type=ground` or `?type=space`.

## Stack

Plain HTML/CSS/ES modules. Vendor three.js in `vendor/` for battle modules. No build step.
