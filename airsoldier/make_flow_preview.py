#!/usr/bin/env python3
from pathlib import Path
from PIL import Image

ROOT = Path("/workspace/bot-campus-publish/airsoldier")
dirs = ["n", "ne", "e", "se", "s"]
cell_h = 512
pad = 16
bg = (24, 24, 32, 255)

rows = []
max_w = 0
for d in dirs:
    frames = []
    for name in [f"idle/idle_{d}.png", f"walk/walk_{d}_a.png", f"walk/walk_{d}_b.png"]:
        p = ROOT / name
        if not p.exists():
            raise SystemExit(f"missing {p}")
        frames.append(Image.open(p).convert("RGBA"))
    # scale already 512 tall; pack horizontally
    gap = pad
    w = sum(im.width for im in frames) + gap * (len(frames) - 1)
    row = Image.new("RGBA", (w, cell_h + pad), bg)
    x = 0
    for im in frames:
        row.paste(im, (x, pad // 2), im)
        x += im.width + gap
    rows.append(row)
    max_w = max(max_w, w)

out_h = len(rows) * (cell_h + pad) + pad
out = Image.new("RGBA", (max_w + 2 * pad, out_h), bg)
y = pad
for row in rows:
    out.paste(row, (pad, y), row)
    y += cell_h + pad

dst = ROOT / "preview" / "flow_preview.png"
dst.parent.mkdir(parents=True, exist_ok=True)
out.convert("RGB").save(dst, "PNG")  # dark bg preview as RGB ok
print(f"wrote {dst} size={out.size}")
