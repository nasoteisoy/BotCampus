#!/usr/bin/env python3
"""Horizontal flip E/NE/SE -> W/NW/SW for idle and walk A/B."""
from pathlib import Path
from PIL import Image

ROOT = Path("/workspace/bot-campus-publish/earthsoldier")
pairs = [("e", "w"), ("ne", "nw"), ("se", "sw")]

def flip(src: Path, dst: Path):
    im = Image.open(src).convert("RGBA")
    out = im.transpose(Image.FLIP_LEFT_RIGHT)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, "PNG")
    print(f"FLIP {src.name} -> {dst}")

for a, b in pairs:
    s = ROOT / "idle" / f"idle_{a}.png"
    if s.exists():
        flip(s, ROOT / "idle" / f"idle_{b}.png")
    for phase in ("a", "b"):
        s = ROOT / "walk" / f"walk_{a}_{phase}.png"
        if s.exists():
            flip(s, ROOT / "walk" / f"walk_{b}_{phase}.png")
