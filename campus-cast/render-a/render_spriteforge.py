#!/usr/bin/env python3
"""SpriteForge bible-locked cel chibi renderer. Run: python3 render_spriteforge.py"""
from PIL import Image, ImageDraw
import math, os

OUT = os.path.dirname(os.path.abspath(__file__))
SIZE = 512

# Palette — locked to bible
VIOLET = (0x7C, 0x3A, 0xED, 255)
VIOLET_DK = (0x5B, 0x21, 0xB6, 255)
VIOLET_LT = (0xA7, 0x8B, 0xFA, 255)
CORAL = (0xF9, 0x73, 0x16, 255)
CORAL_DK = (0xC2, 0x41, 0x0C, 255)
CORAL_LT = (0xFB, 0x92, 0x3C, 255)
SKIN = (0xF5, 0xE6, 0xD3, 255)
HAIR = (0x2E, 0x1A, 0x47, 255)        # dark purple/black
HAIR_DK = (0x1A, 0x0F, 0x2E, 255)
HAIR_HI = (0x4C, 0x1D, 0x95, 255)     # violet highlight tuft tip
SHIRT = (0xF4, 0xF4, 0xF6, 255)
SHIRT_DK = (0xD0, 0xD0, 0xD6, 255)
PANTS = (0x2F, 0x36, 0x3F, 255)
PANTS_DK = (0x1E, 0x22, 0x28, 255)
OUTLINE = (0x10, 0x10, 0x12, 255)
WHITE = (255, 255, 255, 255)
IRIS = (0x2A, 0x2A, 0x30, 255)
CHEEK = (0xF0, 0xB0, 0xA0, 160)
SMUDGE = (0x7C, 0x3A, 0xED, 90)       # tiny violet paint smudge
ALERT_Y = (0xFF, 0xD4, 0x4A, 255)
ALERT_R = (0xE8, 0x3B, 0x3B, 255)

def ellipse(d, box, fill, ow=5):
    d.ellipse(box, fill=fill, outline=OUTLINE, width=ow)

def rrect(d, box, r, fill, ow=5):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=OUTLINE, width=ow)

def thick_line(d, a, b, fill, width, oe=5):
    d.line([a, b], fill=OUTLINE, width=width + oe)
    d.line([a, b], fill=fill, width=width)

def draw_paint_dot_pin(d, cx, cy, s, ow):
    """Thicker coral paint-dot badge on chest — phone-map readable."""
    # Outer coral blob (extra thick for map readability)
    r = int(22 * s)
    ellipse(d, [cx - r, cy - r, cx + r, cy + r], CORAL, max(3, ow))
    # Mid ring for paint-blob depth
    r_mid = int(15 * s)
    ellipse(
        d,
        [cx - r_mid, cy - r_mid + int(1 * s), cx + r_mid, cy + r_mid + int(1 * s)],
        CORAL_DK,
        max(2, ow - 2),
    )
    # Inner highlight droplet
    r2 = int(11 * s)
    ellipse(
        d,
        [cx - r2 + int(2 * s), cy - r2 - int(2 * s), cx + r2 + int(2 * s), cy + r2 - int(2 * s)],
        CORAL_LT,
        max(2, ow - 2),
    )
    # Specular white
    hs = max(3, int(5 * s))
    d.ellipse([cx - int(7 * s), cy - int(10 * s), cx - int(7 * s) + hs, cy - int(10 * s) + hs], fill=WHITE)
    # Tiny drip for paint-dot identity
    drip_w = int(8 * s)
    drip_h = int(12 * s)
    ellipse(
        d,
        [cx - drip_w // 2, cy + int(10 * s), cx + drip_w // 2, cy + int(10 * s) + drip_h],
        CORAL_DK,
        max(2, ow - 2),
    )
    # Pin stem hint (dark)
    d.rectangle(
        [cx - int(3 * s), cy - r - int(5 * s), cx + int(3 * s), cy - r + int(2 * s)],
        fill=OUTLINE,
    )

def draw_spriteforge(pose="idle", scale=1.0):
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = scale
    ow = max(3, int(5 * s))
    cx = SIZE // 2
    H = int(400 * s)
    foot_y = int(SIZE * 0.88)
    top_y = foot_y - H

    lean = int(40 * s) if pose == "working" else 0
    # Clearer 3/4 body turn (body offset right, face bias left)
    body_ox = int(24 * s)
    face_ox = int(-12 * s)

    head_r = int(H * 0.26)
    hip_y = foot_y - int(56 * s)
    torso_h = int(72 * s)
    torso_w = int(86 * s)
    torso_top = hip_y - torso_h + int(12 * s)
    body_cx = cx + body_ox + lean
    scarf_cy_guess = torso_top + int(2 * s)
    # Short neck: chin sits just above scarf; only ~12–16px of neck visible
    neck_gap = int(14 * s)
    head_cy = scarf_cy_guess - neck_gap - head_r + int(8 * s) + lean // 4
    head_cx = cx + lean // 2 - int(4 * s)  # head slightly left of body for 3/4

    # --- Legs ---
    leg_w = int(30 * s)
    for off, col in [(-int(20 * s), PANTS), (int(16 * s), PANTS_DK)]:
        x0 = body_cx + off - leg_w // 2
        fy = foot_y + (int(4 * s) if pose == "working" and off > 0 else 0)
        rrect(d, [x0, hip_y - int(4 * s), x0 + leg_w, fy - int(10 * s)], int(12 * s), col, ow)
        ellipse(d, [x0 - int(3 * s), fy - int(18 * s), x0 + leg_w + int(8 * s), fy], PANTS_DK, ow)

    # --- Torso ---
    rrect(d, [body_cx - torso_w // 2, torso_top, body_cx + torso_w // 2, hip_y + int(6 * s)], int(20 * s), SHIRT, ow)
    # 3/4 shirt seam hint
    d.line(
        [(body_cx + int(8 * s), torso_top + int(16 * s)), (body_cx + int(8 * s), hip_y)],
        fill=SHIRT_DK, width=max(2, int(3 * s)),
    )

    shoulder_y = torso_top + int(16 * s)
    arm_w = int(22 * s)
    hand_r = int(14 * s) if s > 0.8 else int(11 * s)

    def draw_hand(hx, hy):
        ellipse(d, [hx - hand_r, hy - hand_r, hx + hand_r, hy + hand_r], SKIN, ow)

    def sleeve(sx, sy):
        ellipse(d, [sx - int(15 * s), sy - int(11 * s), sx + int(15 * s), sy + int(13 * s)], SHIRT, ow)

    Lsx = body_cx - (torso_w // 2 - int(4 * s))
    Rsx = body_cx + (torso_w // 2 - int(4 * s))
    sy = shoulder_y

    if pose == "working":
        # lean/craft work — both arms toward desk ahead (empty hands)
        for sx, ex in ((Lsx, body_cx + int(8 * s)), (Rsx, body_cx + int(52 * s))):
            ey = hip_y + int(10 * s)
            thick_line(d, (sx, sy), (ex, ey), SKIN, arm_w + 2, ow)
            sleeve(sx, sy)
            draw_hand(ex, ey)
    elif pose == "wave":
        # ready / wave — left arm down, right arm up
        thick_line(d, (Lsx, sy), (Lsx - int(16 * s), hip_y - int(6 * s)), SKIN, arm_w, ow)
        sleeve(Lsx, sy)
        draw_hand(Lsx - int(16 * s), hip_y - int(6 * s))
        mid = (Rsx + int(8 * s), sy - int(50 * s))
        tip = (Rsx + int(18 * s), head_cy - head_r - int(8 * s))
        thick_line(d, (Rsx, sy), mid, SKIN, arm_w + 2, ow)
        thick_line(d, mid, tip, SKIN, arm_w + 2, ow)
        sleeve(Rsx, sy)
        draw_hand(*tip)
        hx, hy = tip
        for ang in (-40, -10, 20, 50):
            a = math.radians(-90 + ang)
            fx = hx + int((hand_r + 8 * s) * math.cos(a))
            fy = hy + int((hand_r + 8 * s) * math.sin(a))
            ellipse(d, [fx - int(4 * s), fy - int(7 * s), fx + int(4 * s), fy + int(7 * s)], SKIN, 2)
    elif pose == "alert":
        for sx, side in ((Lsx, -1), (Rsx, 1)):
            ex = sx + side * int(28 * s)
            ey = sy - int(18 * s)
            thick_line(d, (sx, sy), (ex, ey), SKIN, arm_w, ow)
            sleeve(sx, sy)
            draw_hand(ex, ey)
    else:
        # idle — arms at sides, empty hands
        for sx, side in ((Lsx, -1), (Rsx, 1)):
            ex = sx + side * int(20 * s)
            ey = hip_y - int(4 * s)
            thick_line(d, (sx, sy), (ex, ey), SKIN, arm_w, ow)
            sleeve(sx, sy)
            draw_hand(ex, ey)

    # --- Violet scarf/bandana ---
    scarf_cy = torso_top + int(2 * s)
    ellipse(d, [body_cx - int(50 * s), scarf_cy - int(16 * s), body_cx + int(50 * s), scarf_cy + int(34 * s)], VIOLET, ow)
    ellipse(d, [body_cx - int(30 * s), scarf_cy - int(4 * s), body_cx + int(32 * s), scarf_cy + int(18 * s)], VIOLET_DK, max(2, ow - 2))
    # scarf / bandana tails
    d.polygon(
        [
            (body_cx - int(6 * s), scarf_cy + int(18 * s)),
            (body_cx - int(26 * s), scarf_cy + int(72 * s)),
            (body_cx - int(6 * s), scarf_cy + int(60 * s)),
            (body_cx + int(10 * s), scarf_cy + int(24 * s)),
        ],
        fill=VIOLET_DK,
    )
    d.line(
        [
            (body_cx - int(6 * s), scarf_cy + int(18 * s)),
            (body_cx - int(26 * s), scarf_cy + int(72 * s)),
            (body_cx - int(6 * s), scarf_cy + int(60 * s)),
            (body_cx + int(10 * s), scarf_cy + int(24 * s)),
            (body_cx - int(6 * s), scarf_cy + int(18 * s)),
        ],
        fill=OUTLINE, width=ow,
    )
    d.polygon(
        [
            (body_cx + int(6 * s), scarf_cy + int(14 * s)),
            (body_cx + int(14 * s), scarf_cy + int(54 * s)),
            (body_cx + int(30 * s), scarf_cy + int(48 * s)),
            (body_cx + int(24 * s), scarf_cy + int(12 * s)),
        ],
        fill=VIOLET,
    )
    d.line(
        [
            (body_cx + int(6 * s), scarf_cy + int(14 * s)),
            (body_cx + int(14 * s), scarf_cy + int(54 * s)),
            (body_cx + int(30 * s), scarf_cy + int(48 * s)),
            (body_cx + int(24 * s), scarf_cy + int(12 * s)),
            (body_cx + int(6 * s), scarf_cy + int(14 * s)),
        ],
        fill=OUTLINE, width=ow,
    )
    # bandana knot highlight
    ellipse(
        d,
        [body_cx - int(10 * s), scarf_cy + int(8 * s), body_cx + int(10 * s), scarf_cy + int(24 * s)],
        VIOLET_LT,
        max(2, ow - 2),
    )

    # Coral paint-dot badge pin (chest) — thicker for phone-map
    draw_paint_dot_pin(d, body_cx + int(26 * s), scarf_cy + int(12 * s), s, ow)

    # --- Short visible neck ---
    neck_w = int(42 * s)
    chin = head_cy + head_r - int(6 * s)
    neck_top = chin - int(4 * s)
    neck_bot = scarf_cy + int(10 * s)
    rrect(
        d,
        [head_cx - neck_w // 2, neck_top, head_cx + neck_w // 2, neck_bot],
        int(12 * s),
        SKIN,
        max(3, ow - 1),
    )

    # --- Head ---
    hr = head_r
    ellipse(d, [head_cx - hr, head_cy - hr, head_cx + hr, head_cy + hr], SKIN, max(4, int(6 * s)))

    # Dark purple/black short hair with messy artist tuft
    d.pieslice(
        [head_cx - hr - int(2 * s), head_cy - hr - int(10 * s), head_cx + hr + int(2 * s), head_cy + int(36 * s)],
        200, 340, fill=HAIR, outline=OUTLINE, width=ow,
    )
    # messy fringe / artist mess
    d.polygon(
        [
            (head_cx - int(48 * s), head_cy - hr + int(22 * s)),
            (head_cx - int(32 * s), head_cy - int(14 * s)),
            (head_cx - int(18 * s), head_cy - hr + int(8 * s)),
            (head_cx - int(4 * s), head_cy - int(18 * s)),
            (head_cx + int(10 * s), head_cy - hr + int(6 * s)),
            (head_cx + int(22 * s), head_cy - int(12 * s)),
            (head_cx + int(36 * s), head_cy - hr + int(14 * s)),
            (head_cx + int(48 * s), head_cy - int(6 * s)),
            (head_cx + hr - int(6 * s), head_cy - hr + int(28 * s)),
            (head_cx - hr + int(6 * s), head_cy - hr + int(30 * s)),
        ],
        fill=HAIR,
    )
    # side fluff (3/4 back of head)
    ellipse(
        d,
        [head_cx + hr - int(30 * s), head_cy - int(8 * s), head_cx + hr + int(6 * s), head_cy + int(38 * s)],
        HAIR, ow,
    )
    # ONE signature messy artist tuft sticking up (taller, violet-tipped)
    tuft = [
        (head_cx - int(6 * s), head_cy - hr + int(10 * s)),
        (head_cx - int(2 * s), head_cy - hr - int(28 * s)),
        (head_cx + int(10 * s), head_cy - hr - int(36 * s)),  # tip
        (head_cx + int(14 * s), head_cy - hr - int(18 * s)),
        (head_cx + int(8 * s), head_cy - hr + int(8 * s)),
    ]
    d.polygon(tuft, fill=HAIR)
    d.line(tuft + [tuft[0]], fill=OUTLINE, width=max(2, ow - 1))
    # violet tip on tuft
    d.polygon(
        [
            (head_cx + int(2 * s), head_cy - hr - int(22 * s)),
            (head_cx + int(10 * s), head_cy - hr - int(36 * s)),
            (head_cx + int(12 * s), head_cy - hr - int(20 * s)),
        ],
        fill=HAIR_HI,
    )
    # darker fringe tip
    d.polygon(
        [
            (head_cx - int(8 * s), head_cy - hr + int(18 * s)),
            (head_cx + int(4 * s), head_cy - int(6 * s)),
            (head_cx + int(14 * s), head_cy - hr + int(20 * s)),
        ],
        fill=HAIR_DK,
    )
    # re-show face oval over hair edge
    d.pieslice([head_cx - hr, head_cy - hr, head_cx + hr, head_cy + hr], 350, 95, fill=SKIN)
    d.arc([head_cx - hr, head_cy - hr, head_cx + hr, head_cy + hr], 0, 360, fill=OUTLINE, width=max(3, int(5 * s)))

    # Eyes — bright curious
    eye_y = head_cy - int(4 * s)
    eye_dx = int(30 * s)
    erx, ery = int(17 * s), int(19 * s)
    for side in (-1, 1):
        ex = head_cx + face_ox + side * eye_dx
        ellipse(d, [ex - erx, eye_y - ery, ex + erx, eye_y + ery], WHITE, max(3, int(4 * s)))
        ir = int(10 * s) if pose == "alert" else int(9 * s)
        # curious: pupils a bit upward / toward viewer
        ix = ex + int(2 * s)
        iy = eye_y + (int(-2 * s) if pose != "alert" else 0)
        if pose == "working":
            iy = eye_y + int(5 * s)  # looking down at work
        ellipse(d, [ix - ir, iy - ir, ix + ir, iy + ir], IRIS, max(2, int(3 * s)))
        hs = max(2, int(4 * s))
        d.ellipse([ix - hs, iy - ir + int(2 * s), ix, iy - ir + int(2 * s) + hs], fill=WHITE)
        # slightly raised curious brows
        brow = int(-10 * s) if pose == "alert" else int(-6 * s)
        d.arc(
            [ex - erx, eye_y - ery + brow - int(10 * s), ex + erx, eye_y - ery + brow + int(8 * s)],
            200, 340, fill=OUTLINE, width=max(2, int(4 * s)),
        )

    # Cheeks + tiny paint smudge (artist energy)
    for side in (-1, 1):
        chx = head_cx + face_ox + side * int(44 * s)
        chy = eye_y + int(24 * s)
        d.ellipse([chx - int(9 * s), chy - int(5 * s), chx + int(9 * s), chy + int(5 * s)], fill=CHEEK)
    # left cheek violet paint smudge
    smx = head_cx + face_ox - int(48 * s)
    smy = eye_y + int(30 * s)
    d.ellipse([smx - int(6 * s), smy - int(4 * s), smx + int(6 * s), smy + int(4 * s)], fill=SMUDGE)
    d.ellipse([smx + int(4 * s), smy + int(2 * s), smx + int(10 * s), smy + int(7 * s)], fill=(0xF9, 0x73, 0x16, 70))

    # Mouth — small creative grin
    mx = head_cx + face_ox
    my = head_cy + int(36 * s)
    if pose == "alert":
        ellipse(d, [mx - int(9 * s), my - int(5 * s), mx + int(9 * s), my + int(11 * s)], (0x4A, 0x30, 0x30, 255), max(2, int(3 * s)))
    elif pose == "working":
        # focused tiny grin
        d.arc([mx - int(14 * s), my - int(4 * s), mx + int(14 * s), my + int(12 * s)], 20, 150, fill=OUTLINE, width=max(2, int(3 * s)))
    elif pose == "wave":
        # bigger creative grin
        d.arc([mx - int(22 * s), my - int(10 * s), mx + int(22 * s), my + int(18 * s)], 15, 165, fill=OUTLINE, width=max(3, int(4 * s)))
    else:
        # small creative grin (asymmetric-ish)
        d.arc([mx - int(18 * s), my - int(6 * s), mx + int(18 * s), my + int(14 * s)], 25, 155, fill=OUTLINE, width=max(3, int(4 * s)))

    # Alert ! badge
    if pose == "alert":
        bx = head_cx + hr + int(4 * s)
        by = head_cy - hr - int(20 * s)
        br = int(32 * s)
        ellipse(d, [bx - br, by - br, bx + br, by + br], ALERT_Y, max(3, int(5 * s)))
        d.rectangle([bx - int(5 * s), by - int(16 * s), bx + int(5 * s), by + int(4 * s)], fill=ALERT_R, outline=OUTLINE, width=2)
        ellipse(d, [bx - int(6 * s), by + int(8 * s), bx + int(6 * s), by + int(20 * s)], ALERT_R, 2)
        for ang in (45, 165, 270):
            a = math.radians(ang)
            sx_ = bx + int(br * 1.4 * math.cos(a))
            sy_ = by + int(br * 1.4 * math.sin(a))
            sr = int(6 * s)
            ellipse(d, [sx_ - sr, sy_ - sr, sx_ + sr, sy_ + sr], ALERT_Y, 2)

    return im


if __name__ == "__main__":
    specs = [
        ("spriteforge_hero_ref.png", "idle", 1.0),
        ("spriteforge_desk_idle.png", "idle", 1.0),
        ("spriteforge_desk_working.png", "working", 1.0),
        ("spriteforge_ready_review.png", "wave", 1.0),
        ("spriteforge_needs_permission.png", "alert", 1.0),
        ("spriteforge_intern_idle.png", "idle", 0.70),
    ]
    frames = []
    for name, pose, sc in specs:
        im = draw_spriteforge(pose, sc)
        p = os.path.join(OUT, name)
        im.save(p, "PNG")
        frames.append(im)
        print("wrote", p, im.size, im.mode)

    pad, cell, lh = 16, 512, 36
    cols = len(frames)
    strip = Image.new("RGBA", (cols * cell + (cols + 1) * pad, cell + pad * 2 + lh), (0x1A, 0x1A, 0x22, 255))
    sd = ImageDraw.Draw(strip)
    labels = ["hero_ref", "desk_idle", "working", "ready_review", "needs_perm", "intern_idle"]
    for i, im in enumerate(frames):
        x = pad + i * (cell + pad)
        strip.alpha_composite(im, (x, pad + lh))
        sd.text((x + 8, 10), labels[i], fill=(0xCC, 0xCC, 0xD8, 255))
    strip.convert("RGB").save(os.path.join(OUT, "preview_strip.png"))
    print("preview ok")
