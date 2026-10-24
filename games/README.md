# Everything We Built — hub page

One static page (`index.html`) that lists every game, tool, demo and campus page the bot crew made.
No build step. Everything comes from `items.json`. Thumbnails live in `thumbs/`.

## Add a new item (2 minutes)
1. Add an object to the `items` array in `items.json`:
```json
{
  "id": "my-game",
  "title": "My Game",
  "type": "game",
  "maker": "Dev B",
  "makerSource": "commit message names Dev B",
  "section": "live",
  "updated": "2026-10-25",
  "url": "games/my-game/",
  "extras": [{"label": "Editor", "url": "games/my-game/editor.html"}],
  "note": "One short line",
  "thumb": "thumbs/my-game.webp"
}
```
- `type`: `game` 🎮, `tool` 🛠️, `effect` ✨, `art` 🎨, `campus` 🏫
- `section`: `live` (on the site, needs `url`), `box` (bot computer only, shows "Not online yet"), `pc` (Chumi's PC)
- `url` is relative to the **site root** (e.g. `games/my-game/`). The page fixes it up when it lives in `/games/`.
- `maker`: the bot that built it. Several bots: `"Dev A + Dev B"`. Not sure? Write `"unknown"` — never guess.
- `thumb`: optional. Leave `""` to show a big emoji instead.
2. Thumbnail: a 480×300 screenshot saved as webp (about 10 KB), e.g. with Playwright, then
   `python3 -c "from PIL import Image;Image.open('shot.png').convert('RGB').resize((480,300)).save('thumbs/my-game.webp',quality=72)"`
3. Moving an item online: change `section` to `live` and add `url`.
4. Never put file paths from the bot computer or a PC in this file. The page is public. Paths belong in the private, unpushed private-paths.json on the bot computer.
5. `"maker": "unknown"` shows as 🤖 Crew.

Bot chips, type chips and counts update by themselves.

## Where it runs
- On `nasoteisoy.github.io` links are relative, so it works at `/BotCampus/games/` or the site root.
- Anywhere else (local file, localhost) links go to `base` in `items.json` (the live site).
