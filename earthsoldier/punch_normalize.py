#!/usr/bin/env python3
"""Punch light/checkerboard BG to alpha, crop bbox, scale height to 512."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

def punch_and_normalize(src: Path, dst: Path, target_h: int = 512):
    im = Image.open(src).convert("RGBA")
    arr = np.array(im)
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.float32)
    a = arr[:, :, 3].astype(np.float32)

    # chroma + luminance for "light gray / checkerboard" detection
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    chroma = mx - mn
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]

    # candidate BG: low-chroma light pixels (or already low alpha)
    is_light_low_chroma = (chroma < 28) & (lum > 180)
    # also near-white
    is_near_white = (rgb[:, :, 0] > 230) & (rgb[:, :, 1] > 230) & (rgb[:, :, 2] > 230) & (chroma < 40)
    # mid gray checkerboard cells
    is_mid_gray = (chroma < 18) & (lum > 140) & (lum < 200)
    bg_cand = is_light_low_chroma | is_near_white | is_mid_gray

    # Only flood from edges
    from collections import deque
    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg_cand[y, x] or a[y, x] < 128:
                q.append((y, x))
                visited[y, x] = True
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y, x] and (bg_cand[y, x] or a[y, x] < 128):
                q.append((y, x))
                visited[y, x] = True

    mask = np.zeros((h, w), dtype=bool)
    while q:
        y, x = q.popleft()
        mask[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                if bg_cand[ny, nx] or a[ny, nx] < 40:
                    visited[ny, nx] = True
                    q.append((ny, nx))

    out = arr.copy()
    out[mask, 3] = 0

    # Also zero RGB where fully transparent for clean bbox
    out[out[:, :, 3] == 0, :3] = 0

    punched = Image.fromarray(out, "RGBA")
    bbox = punched.getbbox()
    if bbox is None:
        raise SystemExit(f"empty after punch: {src}")
    cropped = punched.crop(bbox)
    cw, ch = cropped.size
    new_w = max(1, int(round(cw * (target_h / ch))))
    resized = cropped.resize((new_w, target_h), Image.Resampling.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    resized.save(dst, "PNG")
    print(f"OK {src} -> {dst} size={resized.size}")

if __name__ == "__main__":
    punch_and_normalize(Path(sys.argv[1]), Path(sys.argv[2]))
