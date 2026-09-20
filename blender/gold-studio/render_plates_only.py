"""Gold Studio — HARD no-sphere plate rebuild (Blender 4.3 Cycles).
ABSOLUTE RULE: never call uv_sphere / ico_sphere / metaball.
Allowed: cube, cylinder, cone, plane, torus — then heavy bevel (+ optional subsurf).
Pauldrons = flattened beveled boxes / tapered cylinders. Helmets = stacked plates.
"""
import bpy, math, traceback, re
from pathlib import Path
from mathutils import Vector, Matrix

OUT = Path("/workspace/bot-campus-publish/gold-studio")
OUT.mkdir(parents=True, exist_ok=True)
LOG = Path("/workspace/bot-campus-publish/blender/gold-studio/plates_only_log.txt")
SAMPLES, RES = 256, 1400

# Forbidden API substrings — assert at import/run time
FORBIDDEN = (
    "primitive_uv_sphere_add",
    "primitive_ico_sphere_add",
    "primitive_metaball_add",
    "bpy.ops.object.metaball_add",
)

def log(m):
    print(m, flush=True)
    with open(LOG, "a") as f:
        f.write(m + "\n")

def assert_no_spheres_in_source():
    src = Path(__file__).read_text()
    # Only flag actual bpy.ops CALLS, not forbid-list string literals / comments
    pats = [
        r"bpy\.ops\.mesh\.primitive_uv_sphere_add\s*\(",
        r"bpy\.ops\.mesh\.primitive_ico_sphere_add\s*\(",
        r"bpy\.ops\.object\.metaball_add\s*\(",
        r"bpy\.ops\.mesh\.primitive_metaball",
        r"\bdef\s+sph\s*\(",
    ]
    hits = []
    for pat in pats:
        if re.search(pat, src):
            hits.append(pat)
    if hits:
        raise SystemExit(f"SPHERE PRIMITIVES FOUND IN SCRIPT: {hits}")
    log("VERIFY: zero sphere/metaball bpy.ops calls in source OK")

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    try:
        sc.cycles.adaptive_min_samples = 64
    except Exception:
        pass
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "Filmic"
    sc.view_settings.look = "Medium High Contrast"
    world = bpy.data.worlds.new("W")
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    outn = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0, 0, 0, 1)
    bg.inputs[1].default_value = 0
    nt.links.new(bg.outputs[0], outn.inputs[0])
    return sc

def mat(name, rgba, rough=0.3, metal=0.0, emit=0.0, sheen=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    n, links = m.node_tree.nodes, m.node_tree.links
    n.clear()
    outn = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = spec
    elif "Specular" in bsdf.inputs:
        bsdf.inputs["Specular"].default_value = spec
    if sheen > 0 and "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    if emit:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emit
    links.new(bsdf.outputs[0], outn.inputs[0])
    return m

def M_gold(n="g"):
    return mat(n, (0.94, 0.70, 0.18, 1), rough=0.28, metal=0.94, spec=0.55)

def M_sil(n="s"):
    return mat(n, (0.85, 0.87, 0.90, 1), rough=0.18, metal=0.97, spec=0.8)

def M_gm(n="gm"):
    return mat(n, (0.14, 0.15, 0.17, 1), rough=0.30, metal=0.90)

def M_cu(n="cu"):
    return mat(n, (0.78, 0.42, 0.15, 1), rough=0.32, metal=0.92)

def M_red(n="r"):
    return mat(n, (0.80, 0.06, 0.04, 1), rough=0.38, metal=0.20)

def M_j(n="j"):
    return mat(n, (0.10, 0.10, 0.11, 1), rough=0.78, metal=0.0, sheen=0.3)

def M_fab(n, rgba):
    return mat(n, rgba, rough=0.80, metal=0.0, sheen=0.55)

def M_em(n, rgba, s=14):
    return mat(n, rgba, rough=0.4, emit=s)

def M_skin(n="sk"):
    return mat(n, (0.91, 0.72, 0.56, 1), rough=0.50)

def M_hair(n="hr"):
    return mat(n, (0.22, 0.10, 0.04, 1), rough=0.60)

def shade(o, a=36):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth()
    if hasattr(o.data, "use_auto_smooth"):
        o.data.use_auto_smooth = True
        o.data.auto_smooth_angle = math.radians(a)

def bev(o, w=0.04, seg=5):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    mod = o.modifiers.new("B", "BEVEL")
    mod.width = w
    mod.segments = seg
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(22)
    try:
        bpy.ops.object.modifier_apply(modifier="B")
    except Exception:
        pass

def subsurf(o, levels=1):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    mod = o.modifiers.new("S", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    try:
        bpy.ops.object.modifier_apply(modifier="S")
    except Exception:
        pass

def box(name, loc, sc, mtl, b=0.045, rot=(0, 0, 0), ss=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = sc
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    if b:
        bev(o, b, 5)
    if ss:
        subsurf(o, ss)
    shade(o)
    o.data.materials.append(mtl)
    return o

def cyl(name, loc, r, d, mtl, rot=(0, 0, 0), b=0.018, v=28, ss=0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc, vertices=v)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    if b:
        bev(o, b, 3)
    if ss:
        subsurf(o, ss)
    shade(o)
    o.data.materials.append(mtl)
    return o

def cone(name, loc, r1, d, mtl, r2=0.0, rot=(0, 0, 0), b=0.012, v=20):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=d, location=loc, vertices=v)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    if b:
        bev(o, b, 2)
    shade(o)
    o.data.materials.append(mtl)
    return o

def plane(name, loc, sc, mtl, rot=(0, 0, 0), b=0.0, subdiv=0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = sc
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    if subdiv:
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.subdivide(number_cuts=subdiv)
        bpy.ops.object.mode_set(mode="OBJECT")
    if b:
        bev(o, b, 3)
    shade(o)
    o.data.materials.append(mtl)
    return o

def torus(name, loc, major, minor, mtl, rot=(0, 0, 0), b=0.0):
    bpy.ops.mesh.primitive_torus_add(
        location=loc, major_radius=major, minor_radius=minor,
        major_segments=28, minor_segments=12
    )
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    if b:
        bev(o, b, 2)
    shade(o)
    o.data.materials.append(mtl)
    return o

# ---- plate helpers (no spheres) ----
def plate_dome(name, loc, sx, sy, sz, mtl, b=0.035):
    """Flattened layered boxes approximating a rounded pauldron/helmet volume."""
    box(f"{name}_a", loc, (sx, sy, sz * 0.55), mtl, b=b)
    box(
        f"{name}_b",
        (loc[0], loc[1], loc[2] + sz * 0.28),
        (sx * 0.88, sy * 0.88, sz * 0.42),
        mtl,
        b=b * 0.9,
    )
    box(
        f"{name}_c",
        (loc[0], loc[1], loc[2] + sz * 0.48),
        (sx * 0.68, sy * 0.70, sz * 0.28),
        mtl,
        b=b * 0.75,
    )
    return None

def joint_block(name, loc, r, mtl):
    """Elbow/knee/hand joint as short beveled cylinder + cube (no sphere)."""
    cyl(f"{name}_c", loc, r * 0.95, r * 1.15, mtl, b=0.02, v=20)
    box(f"{name}_b", loc, (r * 1.55, r * 1.55, r * 1.35), mtl, b=0.028)
    return None

def hand_block(name, loc, mtl, sc=1.0):
    box(f"{name}_p", loc, (0.14 * sc, 0.12 * sc, 0.10 * sc), mtl, b=0.025)
    for i, ox in enumerate((-0.045, -0.015, 0.015, 0.045)):
        box(
            f"{name}_f{i}",
            (loc[0] + ox * sc, loc[1] - 0.04 * sc, loc[2] - 0.06 * sc),
            (0.035 * sc, 0.05 * sc, 0.09 * sc),
            mtl,
            b=0.008,
        )
    return None

def lights(sc, s=1.0):
    specs = [
        ("Key", (3.5 * s, -3.4 * s, 4.0 * s), 450, 2.5 * s, (1, 0.94, 0.86), (50, 8, 42)),
        ("Fill", (-3.2 * s, -2.2 * s, 2.8 * s), 85, 3.8 * s, (0.45, 0.58, 1.0), (55, -12, -52)),
        ("Rim", (0.3 * s, 4.8 * s, 2.5 * s), 850, 1.7 * s, (1, 0.98, 1), (68, 0, 180)),
        ("Kick", (-2.0 * s, 3.2 * s, 4.6 * s), 220, 1.4 * s, (0.95, 0.9, 1), (55, 0, 155)),
        ("Side", (-4.2 * s, 1.2 * s, 2.2 * s), 320, 1.3 * s, (0.85, 0.92, 1), (55, -15, -95)),
        ("Bounce", (0, -0.2 * s, -0.35 * s), 35, 5.0 * s, (0.9, 0.8, 0.65), (-90, 0, 0)),
    ]
    for name, loc, e, sz, col, rot in specs:
        bpy.ops.object.light_add(type="AREA", location=loc)
        L = bpy.context.active_object
        L.name = name
        L.data.energy = e
        L.data.size = sz
        L.data.color = col
        L.rotation_euler = tuple(math.radians(a) for a in rot)

def cam_at(sc, loc, tgt, lens=54):
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.active_object
    c.name = "Cam"
    sc.camera = c
    c.data.lens = lens
    c.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return c

def frame(sc, pad=1.26, yaw=18, elev=0.08, lens=54):
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        return
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            mins = Vector((min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)))
            maxs = Vector((max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)))
    c = (mins + maxs) * 0.5
    size = maxs - mins
    h = max(size.z, 0.1)
    w = max(size.x, size.y, 0.1)
    dist = max(h, w) * pad / (2 * math.tan(math.radians(14)))
    ang = math.radians(yaw)
    loc = (c.x + dist * math.sin(ang), c.y - dist * math.cos(ang), c.z + h * elev)
    cam_at(sc, loc, (c.x, c.y, c.z + h * 0.02), lens)

def plight(name, loc, e, col=(1, 0.5, 0.12), sz=0.2):
    bpy.ops.object.light_add(type="POINT", location=loc)
    L = bpy.context.active_object
    L.name = name
    L.data.energy = e
    L.data.color = col
    L.data.shadow_soft_size = sz

def render_out(sc, path):
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    log(f"WROTE {path} bytes={path.stat().st_size if path.exists() else 0}")

# ---- flame: cones + beveled boxes only (NO spheres) ----
def flame(tag, loc, sc=1.0):
    o = M_em(f"{tag}o", (1.0, 0.25, 0.03, 1), 12)
    m = M_em(f"{tag}m", (1.0, 0.55, 0.08, 1), 20)
    c = M_em(f"{tag}c", (1.0, 0.96, 0.55, 1), 36)
    x, y, z = loc
    # base = flattened beveled box + short cylinder (not sphere)
    box(f"{tag}b", (x, y, z), (0.26 * sc, 0.22 * sc, 0.16 * sc), o, b=0.04)
    cyl(f"{tag}bc", (x, y, z + 0.02 * sc), 0.11 * sc, 0.12 * sc, o, b=0.02, v=16)
    cone(f"{tag}m", (x, y, z + 0.22 * sc), 0.11 * sc, 0.28 * sc, m, r2=0.02)
    box(f"{tag}c", (x, y, z + 0.10 * sc), (0.12 * sc, 0.11 * sc, 0.14 * sc), c, b=0.03)
    cone(f"{tag}u", (x, y, z + 0.42 * sc), 0.08 * sc, 0.24 * sc, m, r2=0.012)
    cone(f"{tag}t", (x, y, z + 0.60 * sc), 0.035 * sc, 0.20 * sc, o, r2=0.002)
    cone(
        f"{tag}w1",
        (x - 0.05 * sc, y, z + 0.32 * sc),
        0.04 * sc,
        0.16 * sc,
        o,
        r2=0.004,
        rot=(0, math.radians(-20), 0),
    )
    cone(
        f"{tag}w2",
        (x + 0.05 * sc, y, z + 0.30 * sc),
        0.035 * sc,
        0.14 * sc,
        o,
        r2=0.004,
        rot=(0, math.radians(18), 0),
    )
    cone(
        f"{tag}w3",
        (x, y - 0.04 * sc, z + 0.36 * sc),
        0.03 * sc,
        0.15 * sc,
        m,
        r2=0.003,
        rot=(math.radians(12), 0, 0),
    )

def sword(tag, grip, tip_dir=(0, 0, 1), blen=0.95, gw=0.12, g=None, s=None, gem=False, flbase=False):
    g = g or M_gold(f"{tag}g")
    s = s or M_sil(f"{tag}s")
    gr = mat(f"{tag}gr", (0.30, 0.14, 0.08, 1), rough=0.7)
    dx, dy, dz = tip_dir
    L = math.sqrt(dx * dx + dy * dy + dz * dz) or 1
    dx, dy, dz = dx / L, dy / L, dz / L
    gx, gy, gz = grip
    up = Vector((dx, dy, dz))
    side = up.cross(Vector((0, 1, 0)))
    if side.length < 0.15:
        side = up.cross(Vector((1, 0, 0)))
    side.normalize()
    fwd = up.cross(side).normalized()

    def P(t):
        return (gx + dx * t, gy + dy * t, gz + dz * t)

    def oriented_box(name, center, sx, sy, sz, mtl, bw=0.012):
        bpy.ops.mesh.primitive_cube_add(size=1, location=center)
        o = bpy.context.active_object
        o.name = name
        o.matrix_world = (
            Matrix.Translation(center)
            @ Matrix((side, fwd, up)).transposed().to_4x4()
            @ Matrix.Diagonal((sx, sy, sz, 1))
        )
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        bev(o, bw, 3)
        shade(o)
        o.data.materials.append(mtl)
        return o

    # pommel = short beveled cylinder / box (NOT sphere)
    oriented_box(f"{tag}pom", P(-0.09), 0.09, 0.09, 0.07, g, 0.018)
    cyl(f"{tag}pomC", P(-0.09), 0.048, 0.06, g, b=0.012, v=16)
    oriented_box(f"{tag}grip", P(0.0), 0.055, 0.055, 0.17, gr, 0.01)
    oriented_box(f"{tag}guard", P(0.10), 0.26, 0.055, 0.045, g, 0.012)
    if gem:
        gem_m = M_em(f"{tag}gem", (1.0, 0.55, 0.1, 1), 12)
        gc = P(0.10)
        box(
            f"{tag}gem",
            (gc[0] - fwd.x * 0.04, gc[1] - fwd.y * 0.04, gc[2] - fwd.z * 0.04),
            (0.055, 0.04, 0.055),
            gem_m,
            b=0.012,
        )
    oriented_box(f"{tag}blade", P(0.12 + blen * 0.5), gw, 0.035, blen, s, 0.01)
    dark = mat(f"{tag}ful", (0.42, 0.45, 0.50, 1), rough=0.32, metal=0.9)
    bc = P(0.12 + blen * 0.5)
    oriented_box(
        f"{tag}ful",
        (bc[0] - fwd.x * 0.012, bc[1] - fwd.y * 0.012, bc[2] - fwd.z * 0.012),
        gw * 0.35,
        0.02,
        blen * 0.8,
        dark,
        0.005,
    )
    oriented_box(f"{tag}tip", P(0.12 + blen + 0.04), gw * 0.45, 0.025, 0.10, s, 0.008)
    if flbase:
        fp = P(0.20)
        flame(f"{tag}fl", (fp[0] - fwd.x * 0.06, fp[1] - fwd.y * 0.06, fp[2]), sc=0.40)
        plight(f"{tag}flL", fp, 70, (1, 0.45, 0.1), 0.22)

# =====================================================================
# 1 LAVA KNIGHT — dark gunmetal, copper trim, lava chest, flame crest
# =====================================================================
def build_lava():
    gm, cu = M_gm("Lgm"), M_cu("Lcu")
    lava, lavay = M_em("Ll", (1, 0.38, 0.04, 1), 16), M_em("Lly", (1, 0.85, 0.2, 1), 24)
    eye = M_em("Le", (1, 0.9, 0.18, 1), 30)
    hand = mat("Lhnd", (0.92, 0.28, 0.06, 1), rough=0.4, metal=0.2, emit=3.5)
    belt = mat("Lbel", (0.55, 0.28, 0.12, 1), rough=0.5, metal=0.4)

    for sx, t in ((-1, "L"), (1, "R")):
        box(f"foot{t}", (sx * 0.24, 0.04, 0.07), (0.24, 0.32, 0.14), gm, b=0.04)
        box(f"toe{t}", (sx * 0.24, -0.14, 0.06), (0.20, 0.14, 0.12), gm, b=0.035)
        box(f"ember{t}", (sx * 0.24, 0.06, 0.15), (0.14, 0.16, 0.07), lava, b=0.018)
        box(f"shin{t}", (sx * 0.22, 0.02, 0.32), (0.20, 0.20, 0.32), gm, b=0.035)
        box(f"slit{t}", (sx * 0.22, -0.11, 0.32), (0.05, 0.04, 0.24), lava, b=0.01)
        box(f"thigh{t}", (sx * 0.20, 0.0, 0.55), (0.20, 0.20, 0.28), gm, b=0.032)

    box("pelvis", (0, 0.02, 0.72), (0.68, 0.40, 0.24), gm, b=0.045)
    box("skirt", (0, 0.0, 0.60), (0.70, 0.38, 0.14), gm, b=0.035)
    for sx, t in ((-1, "L"), (1, "R")):
        box(f"tasset{t}", (sx * 0.28, 0.0, 0.58), (0.22, 0.16, 0.18), gm, b=0.028)
    box("belt", (0, 0.0, 0.82), (0.62, 0.36, 0.10), belt, b=0.022)
    cyl("buck", (0, -0.20, 0.82), 0.08, 0.055, cu, rot=(math.radians(90), 0, 0))

    box("chest", (0, 0.02, 1.12), (0.70, 0.42, 0.55), gm, b=0.05)
    box("trimT", (0, -0.22, 1.34), (0.60, 0.05, 0.06), cu, b=0.012)
    box("trimB", (0, -0.22, 0.92), (0.56, 0.05, 0.05), cu, b=0.012)
    for sx, t in ((-1, "L"), (1, "R")):
        box(f"trimS{t}", (sx * 0.32, -0.22, 1.12), (0.04, 0.04, 0.40), cu, b=0.01)
    box("lv1", (0, -0.06, 1.05), (0.36, 0.16, 0.40), lava, b=0.03)
    box("lv2", (0, -0.08, 1.15), (0.24, 0.14, 0.26), lavay, b=0.022)
    box("lv3", (0, -0.10, 1.25), (0.14, 0.10, 0.14), lavay, b=0.015)
    flame("Lcf", (0, -0.18, 1.22), 0.32)

    for sx, t in ((-1, "L"), (1, "R")):
        # Pauldrons = flattened layered BOXES (not balls)
        box(f"paul{t}", (sx * 0.55, 0.02, 1.36), (0.42, 0.36, 0.22), gm, b=0.045)
        box(f"paul2{t}", (sx * 0.58, 0.0, 1.48), (0.36, 0.30, 0.12), gm, b=0.035)
        box(f"pTop{t}", (sx * 0.55, 0.0, 1.54), (0.34, 0.24, 0.06), cu, b=0.014)
        box(f"pLow{t}", (sx * 0.52, 0.0, 1.18), (0.28, 0.22, 0.16), gm, b=0.03)
        # tapered cylinder rim under pauldron
        cyl(f"pRim{t}", (sx * 0.55, 0.02, 1.26), 0.18, 0.06, cu, b=0.01, v=20)
        box(f"uarm{t}", (sx * 0.62, 0.0, 1.00), (0.18, 0.18, 0.30), gm, b=0.03)
        cyl(f"cuff{t}", (sx * 0.64, 0.0, 0.78), 0.15, 0.16, gm, b=0.022)
        box(f"cTr{t}", (sx * 0.64, 0.0, 0.87), (0.17, 0.17, 0.035), cu, b=0.008)
        cyl(f"cGl{t}", (sx * 0.64, 0.0, 0.68), 0.10, 0.05, lava, b=0.008)
        hand_block(f"hand{t}", (sx * 0.64, 0.0, 0.56), hand, sc=0.95)

    # Helmet = stacked beveled boxes + cylinders + cones (NO sphere)
    box("helm", (0, 0.04, 1.70), (0.62, 0.58, 0.48), gm, b=0.055)
    box("helmTop", (0, 0.04, 1.90), (0.52, 0.50, 0.22), gm, b=0.04)
    cyl("helmCap", (0, 0.04, 1.98), 0.22, 0.10, gm, b=0.02, v=24)
    box("beak", (0, -0.28, 1.62), (0.30, 0.28, 0.24), gm, b=0.035, rot=(math.radians(20), 0, 0))
    cone("beakT", (0, -0.46, 1.64), 0.10, 0.16, gm, r2=0.02, rot=(math.radians(90), 0, 0))
    box("jaw", (0, -0.02, 1.44), (0.36, 0.32, 0.18), gm, b=0.035)
    for sx, t in ((-1, "L"), (1, "R")):
        cone(
            f"horn{t}",
            (sx * 0.26, 0.10, 1.90),
            0.055,
            0.20,
            gm,
            r2=0.012,
            rot=(math.radians(-28), 0, math.radians(sx * 30)),
        )
        box(f"eye{t}", (sx * 0.11, -0.36, 1.64), (0.11, 0.05, 0.07), eye, b=0.012)
        # side plate cheeks
        box(f"cheek{t}", (sx * 0.28, -0.08, 1.62), (0.10, 0.22, 0.22), gm, b=0.025)
    box("crestB", (0, 0.02, 1.96), (0.16, 0.20, 0.14), gm, b=0.025)
    flame("Lhf", (0, 0.0, 2.00), 0.55)

    plight("Lc", (0, -0.3, 1.1), 80, (1, 0.4, 0.08), 0.3)
    plight("Lh", (0, 0, 2.2), 60, (1, 0.5, 0.1), 0.25)
    plight("LbL", (-0.24, 0.08, 0.16), 25, (1, 0.4, 0.08), 0.12)
    plight("LbR", (0.24, 0.08, 0.16), 25, (1, 0.4, 0.08), 0.12)

# =====================================================================
# 2 REDGOLD — gold helm, red torso/pauldron PLATES, crouch, sword+flame
# =====================================================================
def build_redgold():
    g, r, j, s = M_gold("RGg"), M_red("RGr"), M_j("RGj"), M_sil("RGs")
    vg = M_em("RGv", (1.0, 0.30, 0.05, 1), 22)

    for sx, t in ((-1, "L"), (1, "R")):
        box(f"boot{t}", (sx * 0.40, -0.28, 0.08), (0.20, 0.30, 0.14), g, b=0.035)
        box(f"toe{t}", (sx * 0.40, -0.46, 0.07), (0.16, 0.14, 0.10), g, b=0.025)
        box(
            f"greave{t}",
            (sx * 0.36, -0.12, 0.32),
            (0.19, 0.20, 0.36),
            g,
            b=0.035,
            rot=(math.radians(18), 0, 0),
        )
        joint_block(f"knee{t}", (sx * 0.34, -0.02, 0.48), 0.10, j)
        box(
            f"thigh{t}",
            (sx * 0.30, 0.08, 0.60),
            (0.19, 0.24, 0.32),
            j,
            b=0.03,
            rot=(math.radians(-48), 0, math.radians(sx * 8)),
        )
        for i, off in enumerate((-0.07, 0, 0.07)):
            cyl(f"tr{t}{i}", (sx * 0.30, 0.08 - off * 0.35, 0.58 + off * 0.55), 0.105, 0.045, j, b=0.006)
        box(
            f"skirt{t}",
            (sx * 0.26, 0.02, 0.78),
            (0.22, 0.14, 0.26),
            r,
            b=0.025,
            rot=(math.radians(-8), 0, math.radians(sx * 12)),
        )
        box(f"skT{t}", (sx * 0.26, -0.06, 0.78), (0.20, 0.035, 0.24), g, b=0.01)

    box("hip", (0, 0.06, 0.85), (0.50, 0.32, 0.18), j, b=0.032)
    box("belt", (0, 0.06, 0.96), (0.52, 0.30, 0.10), g, b=0.022)
    cyl("med", (0, -0.12, 0.96), 0.09, 0.05, g, rot=(math.radians(90), 0, 0))
    box("skC", (0, 0.0, 0.72), (0.20, 0.12, 0.24), r, b=0.022)

    box("chest", (0, 0.10, 1.25), (0.56, 0.36, 0.46), r, b=0.045, rot=(math.radians(10), 0, 0))
    box("cTT", (0, -0.08, 1.44), (0.54, 0.05, 0.065), g, b=0.012)
    box("cTB", (0, -0.06, 1.06), (0.52, 0.05, 0.055), g, b=0.012)
    box("cRidge", (0, -0.08, 1.25), (0.08, 0.055, 0.36), g, b=0.01)

    for sx, t in ((-1, "L"), (1, "R")):
        # Tiered red plate pauldrons with gold trim — flattened boxes
        box(f"paul{t}", (sx * 0.50, 0.10, 1.48), (0.40, 0.34, 0.20), r, b=0.04)
        box(f"paulB{t}", (sx * 0.52, 0.08, 1.58), (0.34, 0.28, 0.10), r, b=0.03)
        box(f"pT{t}", (sx * 0.50, 0.08, 1.64), (0.32, 0.22, 0.05), g, b=0.012)
        box(f"pL{t}", (sx * 0.48, 0.08, 1.32), (0.24, 0.20, 0.14), r, b=0.025)
        box(f"pTrim{t}", (sx * 0.50, -0.08, 1.48), (0.36, 0.04, 0.14), g, b=0.01)
        box(f"uarm{t}", (sx * 0.56, 0.12, 1.18), (0.16, 0.16, 0.36), j, b=0.025)
        for i, z in enumerate((1.30, 1.20, 1.10)):
            cyl(f"ar{t}{i}", (sx * 0.56, 0.12, z), 0.12, 0.05, j, b=0.006)

    box(
        "rGaunt",
        (0.70, -0.05, 0.85),
        (0.17, 0.17, 0.34),
        g,
        b=0.032,
        rot=(math.radians(35), math.radians(10), math.radians(-15)),
    )
    cyl("rCuff", (0.76, -0.18, 0.66), 0.15, 0.11, g, b=0.016, rot=(math.radians(40), 0, 0))
    hand_block("rHand", (0.80, -0.28, 0.52), j, sc=0.9)
    joint_block("rElbow", (0.62, 0.05, 1.00), 0.09, j)

    box(
        "lGaunt",
        (-0.55, -0.35, 1.28),
        (0.17, 0.17, 0.32),
        g,
        b=0.032,
        rot=(math.radians(-50), math.radians(-5), math.radians(10)),
    )
    cyl("lCuff", (-0.58, -0.52, 1.45), 0.14, 0.10, g, b=0.016)
    hand_block("lHand", (-0.60, -0.62, 1.55), j, sc=0.85)
    joint_block("lElbow", (-0.52, -0.05, 1.18), 0.09, j)

    # Gold helm from stacked plates (no sphere)
    box("helm", (0, 0.12, 1.72), (0.48, 0.50, 0.44), g, b=0.05)
    box("helmTop", (0, 0.14, 1.90), (0.40, 0.42, 0.18), g, b=0.035)
    box("hFace", (0, -0.08, 1.66), (0.26, 0.20, 0.28), g, b=0.03)
    box("hRidge", (0, 0.04, 1.90), (0.06, 0.22, 0.16), g, b=0.012)
    for sx, t in ((-1, "L"), (1, "R")):
        cone(f"spk{t}", (sx * 0.10, 0.06, 2.02), 0.04, 0.17, g, r2=0.004)
        box(
            f"wing{t}",
            (sx * 0.22, 0.06, 1.78),
            (0.08, 0.16, 0.12),
            g,
            b=0.014,
            rot=(0, 0, math.radians(sx * -25)),
        )
    box("vis1", (0, -0.28, 1.72), (0.18, 0.04, 0.032), vg, b=0.006)
    box("vis2", (0, -0.28, 1.64), (0.16, 0.04, 0.028), vg, b=0.006)
    # T-visor vertical
    box("visV", (0, -0.28, 1.66), (0.04, 0.04, 0.12), vg, b=0.005)
    box("chin", (0, -0.04, 1.48), (0.22, 0.20, 0.14), g, b=0.025)

    sword("RGs", grip=(0.82, -0.35, 0.48), tip_dir=(0.15, -0.25, -0.95), blen=1.05, gw=0.13, g=g, s=s)
    flame("RGf", (-0.60, -0.75, 1.65), 0.68)
    plight("RGfl", (-0.55, -0.78, 1.72), 120, (1, 0.4, 0.08), 0.35)
    plight("RGv", (0, -0.38, 1.68), 35, (1, 0.25, 0.05), 0.12)

# =====================================================================
# 3 HERO — face from beveled cubes, blocky hair slabs, cape planes
# =====================================================================
def build_hero():
    g, s, d = M_gold("Hg"), M_sil("Hs"), M_j("Hd")
    sk, hr = M_skin("Hsk"), M_hair("Hhr")
    red = M_fab("Hred", (0.78, 0.06, 0.06, 1))
    co = M_fab("Hco", (0.55, 0.22, 0.05, 1))
    ci = M_fab("Hci", (0.98, 0.55, 0.12, 1))
    glove = mat("Hgl", (0.12, 0.12, 0.13, 1), rough=0.72)
    ew = mat("Hew", (0.97, 0.95, 0.92, 1), rough=0.28)
    ea = M_em("Hea", (0.98, 0.62, 0.12, 1), 5)
    pup = mat("Hpu", (0.04, 0.02, 0.01, 1), rough=0.25)

    for sx, t in ((-1, "L"), (1, "R")):
        cyl(f"th{t}", (sx * 0.20, 0.0, 0.55), 0.125, 0.42, d, b=0.015)
        box(f"gr{t}", (sx * 0.20, 0.02, 0.26), (0.16, 0.17, 0.34), g, b=0.03)
        box(f"gt{t}", (sx * 0.20, -0.08, 0.26), (0.14, 0.03, 0.32), g, b=0.008)
        box(f"bt{t}", (sx * 0.20, 0.10, 0.05), (0.17, 0.28, 0.11), g, b=0.03)
        box(f"to{t}", (sx * 0.20, -0.08, 0.05), (0.15, 0.12, 0.09), g, b=0.022)
        # pointed knee plate
        box(f"kn{t}", (sx * 0.20, -0.06, 0.38), (0.12, 0.10, 0.10), g, b=0.02)

    box("belt", (0, 0, 0.82), (0.48, 0.30, 0.12), red, b=0.022)
    cyl("buck", (0, -0.16, 0.82), 0.08, 0.045, g, rot=(math.radians(90), 0, 0))
    box("loin", (0, -0.02, 0.64), (0.16, 0.11, 0.26), red, b=0.018)

    box("suit", (0, 0.02, 1.15), (0.44, 0.28, 0.52), d, b=0.028)
    box("cuir", (0, -0.02, 1.22), (0.50, 0.26, 0.46), g, b=0.04)
    box("ridge", (0, -0.14, 1.22), (0.07, 0.055, 0.38), g, b=0.01)
    cone("vpt", (0, -0.04, 0.98), 0.18, 0.12, g, r2=0.035, rot=(math.radians(180), 0, 0))
    cyl("collar", (0, 0, 1.50), 0.155, 0.12, g, b=0.016)
    box("scarf", (0, -0.10, 1.44), (0.32, 0.14, 0.10), red, b=0.016)
    box("scarfH", (0.15, -0.12, 1.28), (0.09, 0.07, 0.22), red, b=0.012)

    for sx, t in ((-1, "L"), (1, "R")):
        # Layered arched plate pauldrons (boxes)
        box(f"paul{t}", (sx * 0.46, 0.0, 1.48), (0.36, 0.32, 0.16), g, b=0.038)
        box(f"paul2{t}", (sx * 0.48, 0.0, 1.56), (0.30, 0.26, 0.08), g, b=0.028)
        box(f"p2{t}", (sx * 0.48, 0.0, 1.30), (0.24, 0.20, 0.14), g, b=0.022)
        box(f"p3{t}", (sx * 0.50, 0.0, 1.20), (0.18, 0.16, 0.08), g, b=0.016)
        cyl(f"sc{t}", (sx * 0.48, -0.16, 1.46), 0.035, 0.035, g, rot=(math.radians(90), 0, 0))

    cyl("uaR", (0.52, 0.02, 1.15), 0.10, 0.28, d, b=0.012)
    box("foR", (0.56, 0.04, 0.90), (0.13, 0.13, 0.28), g, b=0.025)
    hand_block("haR", (0.56, 0.04, 0.70), glove, sc=0.8)

    cyl("uaL", (-0.48, -0.10, 1.22), 0.10, 0.26, d, b=0.012, rot=(math.radians(-48), 0, math.radians(-10)))
    box(
        "foL",
        (-0.56, -0.32, 1.38),
        (0.13, 0.13, 0.26),
        g,
        b=0.025,
        rot=(math.radians(-58), math.radians(10), 0),
    )
    hand_block("haL", (-0.60, -0.48, 1.55), glove, sc=0.8)

    # FACE from beveled cubes (NOT a sphere)
    box("head", (0, 0.02, 1.78), (0.30, 0.28, 0.34), sk, b=0.055)
    box("headTop", (0, 0.02, 1.92), (0.26, 0.24, 0.12), sk, b=0.04)
    box("jaw", (0, -0.02, 1.62), (0.22, 0.18, 0.12), sk, b=0.03)
    box("chin", (0, -0.06, 1.56), (0.12, 0.10, 0.06), sk, b=0.018)
    box("nose", (0, -0.16, 1.76), (0.032, 0.05, 0.045), sk, b=0.006)
    for sx, t in ((-1, "L"), (1, "R")):
        # Eyes as flat cylinders + boxes
        cyl(
            f"ew{t}",
            (sx * 0.065, -0.145, 1.79),
            0.048,
            0.03,
            ew,
            rot=(math.radians(90), 0, 0),
            b=0.008,
            v=16,
        )
        box(f"ea{t}", (sx * 0.065, -0.162, 1.79), (0.07, 0.02, 0.055), ea, b=0.008)
        cyl(
            f"pu{t}",
            (sx * 0.065, -0.175, 1.79),
            0.014,
            0.02,
            pup,
            rot=(math.radians(90), 0, 0),
            b=0.003,
            v=10,
        )
        box(f"br{t}", (sx * 0.065, -0.15, 1.86), (0.06, 0.024, 0.018), hr, b=0.004)
        # ears as flattened boxes
        box(f"ear{t}", (sx * 0.17, 0.0, 1.76), (0.04, 0.06, 0.08), sk, b=0.012)
    box("mouth", (0, -0.155, 1.64), (0.045, 0.014, 0.012), mat("lip", (0.75, 0.4, 0.35, 1), rough=0.5), b=0.003)

    # Blocky hair SLABS (no spheres)
    box("hb", (0, 0.08, 1.92), (0.34, 0.30, 0.16), hr, b=0.04)
    box("hb2", (0, 0.10, 2.00), (0.30, 0.26, 0.10), hr, b=0.03)
    box("qf", (0.02, -0.06, 2.00), (0.22, 0.20, 0.14), hr, b=0.035)
    box("qff", (0, -0.14, 1.94), (0.18, 0.14, 0.16), hr, b=0.035)
    box("qf3", (0.04, -0.10, 2.06), (0.14, 0.16, 0.10), hr, b=0.025)
    for sx, t in ((-1, "L"), (1, "R")):
        box(f"sh{t}", (sx * 0.16, 0.04, 1.74), (0.10, 0.12, 0.16), hr, b=0.022)
        box(f"sh2{t}", (sx * 0.14, 0.08, 1.86), (0.08, 0.10, 0.12), hr, b=0.018)

    # Cape from subdivided planes + thick boxes for volume
    plane(
        "capeP",
        (0, 0.42, 1.05),
        (0.70, 1.10, 1),
        co,
        rot=(math.radians(78), 0, 0),
        subdiv=4,
        b=0.0,
    )
    box("cape", (0, 0.36, 1.08), (0.65, 0.12, 1.05), co, b=0.04, rot=(math.radians(14), 0, 0))
    box("capeI", (0, 0.26, 1.08), (0.58, 0.06, 0.98), ci, b=0.03, rot=(math.radians(14), 0, 0))
    for sx, t in ((-1, "L"), (1, "R")):
        box(f"cT{t}", (sx * 0.26, 0.22, 1.48), (0.22, 0.10, 0.16), co, b=0.018)
        box(f"cTi{t}", (sx * 0.28, 0.18, 1.30), (0.12, 0.06, 0.40), ci, b=0.015)

    sword("Hs", grip=(0.58, -0.05, 0.74), tip_dir=(0.02, -0.15, 1), blen=0.92, gw=0.12, g=g, s=s, gem=True)
    flame("Hfb", (-0.58, -0.72, 1.70), 0.60)
    plight("Hfbl", (-0.48, -0.5, 1.7), 140, (1, 0.55, 0.15), 0.38)
    plight("Hface", (-0.22, -0.38, 1.78), 50, (1, 0.6, 0.25), 0.2)

# =====================================================================
# 4 GOLD PLATE — full gold layers, crest helm, medallion, flaming sword
# =====================================================================
def build_gold_plate():
    g, s = M_gold("GPg"), M_sil("GPs")
    fab = M_fab("GPf", (0.08, 0.09, 0.07, 1))
    dark = mat("GPd", (0.04, 0.04, 0.04, 1), rough=0.5)

    for sx, t in ((-1, "L"), (1, "R")):
        cyl(f"th{t}", (sx * 0.24, 0.02, 0.55), 0.13, 0.40, fab, b=0.015)
        box(f"kn{t}", (sx * 0.24, -0.02, 0.36), (0.14, 0.14, 0.12), g, b=0.025)
        box(f"gr{t}", (sx * 0.24, 0.02, 0.20), (0.16, 0.17, 0.30), g, b=0.03)
        box(f"bt{t}", (sx * 0.24, 0.10, 0.05), (0.17, 0.28, 0.11), g, b=0.03)
        box(f"to{t}", (sx * 0.24, -0.08, 0.05), (0.15, 0.12, 0.09), g, b=0.022)

    box("hip", (0, 0, 0.80), (0.54, 0.32, 0.16), fab, b=0.028)
    box("belt", (0, 0, 0.92), (0.56, 0.32, 0.10), g, b=0.022)
    cyl("sun", (0, -0.17, 0.92), 0.10, 0.05, g, rot=(math.radians(90), 0, 0))
    for i, ang in enumerate(range(0, 360, 45)):
        rad = math.radians(ang)
        box(
            f"ray{i}",
            (0.14 * math.sin(rad), -0.17, 0.92 + 0.14 * math.cos(rad)),
            (0.028, 0.022, 0.06),
            g,
            b=0.004,
        )
    box("tasC", (0, -0.02, 0.70), (0.18, 0.12, 0.22), g, b=0.025)
    for sx, t in ((-1, "L"), (1, "R")):
        box(f"tas{t}", (sx * 0.26, 0.0, 0.68), (0.16, 0.12, 0.20), g, b=0.022)

    box("cuir", (0, 0, 1.25), (0.58, 0.36, 0.54), g, b=0.048)
    box("cRid", (0, -0.16, 1.22), (0.08, 0.065, 0.46), g, b=0.012)
    cone("cPt", (0, -0.04, 0.96), 0.22, 0.16, g, r2=0.04, rot=(math.radians(180), 0, 0))
    box("wJ", (0, 0, 1.02), (0.46, 0.28, 0.10), fab, b=0.018)

    for sx, t in ((-1, "L"), (1, "R")):
        # Layered semi-circular plate pauldrons — flattened boxes + tapered cyl
        box(f"p1{t}", (sx * 0.50, 0.0, 1.50), (0.40, 0.34, 0.18), g, b=0.04)
        box(f"p1b{t}", (sx * 0.52, 0.0, 1.58), (0.34, 0.28, 0.08), g, b=0.03)
        box(f"p2{t}", (sx * 0.52, 0.0, 1.32), (0.26, 0.22, 0.14), g, b=0.025)
        box(f"p3{t}", (sx * 0.54, 0.0, 1.20), (0.20, 0.18, 0.10), g, b=0.018)
        cyl(f"pRim{t}", (sx * 0.50, 0.0, 1.42), 0.16, 0.05, g, b=0.01, v=20)

    cyl("uaL", (-0.56, 0.0, 1.12), 0.11, 0.26, fab, b=0.012)
    box("vaL", (-0.58, 0.02, 0.86), (0.14, 0.14, 0.30), g, b=0.028)
    for fi in range(4):
        box(f"fL{fi}", (-0.58 + (fi - 1.5) * 0.04, -0.02, 0.66), (0.04, 0.055, 0.10), g, b=0.008)
    box("palmL", (-0.58, 0.0, 0.72), (0.12, 0.10, 0.08), g, b=0.018)

    cyl("uaR", (0.62, -0.10, 1.20), 0.11, 0.28, fab, b=0.012, rot=(math.radians(-28), 0, math.radians(32)))
    box(
        "vaR",
        (0.85, -0.28, 1.10),
        (0.14, 0.14, 0.30),
        g,
        b=0.028,
        rot=(math.radians(-38), math.radians(-5), math.radians(42)),
    )
    for fi in range(4):
        box(f"fR{fi}", (0.98 + (fi - 1.5) * 0.032, -0.45, 0.98), (0.04, 0.055, 0.10), g, b=0.008)
    box("palmR", (0.95, -0.40, 1.02), (0.12, 0.10, 0.08), g, b=0.018)

    # Closed crest helm — stacked boxes/cylinders/cones only
    box("helm", (0, 0.02, 1.76), (0.46, 0.44, 0.42), g, b=0.05)
    box("helmTop", (0, 0.04, 1.94), (0.38, 0.36, 0.16), g, b=0.035)
    cyl("helmCap", (0, 0.02, 2.00), 0.16, 0.08, g, b=0.016, v=22)
    box("hF", (0, -0.12, 1.72), (0.24, 0.20, 0.30), g, b=0.032)
    box("crest", (0, 0.0, 2.02), (0.05, 0.26, 0.16), g, b=0.014)
    cone("cF", (0, -0.16, 2.00), 0.05, 0.14, g, r2=0.015, rot=(math.radians(90), 0, 0))
    box("visor", (0, -0.28, 1.74), (0.16, 0.035, 0.035), dark, b=0.005)
    box("visor2", (0, -0.28, 1.68), (0.14, 0.03, 0.028), dark, b=0.004)
    for sx, t in ((-1, "L"), (1, "R")):
        box(
            f"wing{t}",
            (sx * 0.26, 0.0, 1.76),
            (0.10, 0.14, 0.12),
            g,
            b=0.016,
            rot=(0, 0, math.radians(sx * -20)),
        )
        box(f"cheek{t}", (sx * 0.20, -0.06, 1.62), (0.10, 0.16, 0.16), g, b=0.02)
    cyl("gor", (0, 0, 1.52), 0.16, 0.14, g, b=0.016)
    box("chin", (0, -0.08, 1.52), (0.18, 0.16, 0.10), g, b=0.016)

    sword("GPs", grip=(1.02, -0.50, 1.02), tip_dir=(0.05, -0.2, 1), blen=1.08, gw=0.14, g=g, s=s, flbase=True)
    flame("GPxf", (1.00, -0.62, 1.18), 0.48)
    plight("GPxfL", (1.0, -0.65, 1.2), 90, (1, 0.45, 0.1), 0.25)

# =====================================================================
BUILDS = [
    ("plate_lava_knight.png", build_lava, dict(pad=1.32, yaw=8, elev=0.05, lens=55)),
    ("plate_redgold_knight.png", build_redgold, dict(pad=1.28, yaw=18, elev=0.10, lens=50)),
    ("plate_hero_knight.png", build_hero, dict(pad=1.22, yaw=12, elev=0.08, lens=52)),
    ("plate_gold_knight.png", build_gold_plate, dict(pad=1.24, yaw=26, elev=0.07, lens=54)),
]

def main():
    if LOG.exists():
        LOG.unlink()
    log("=== plates_only HARD no-sphere START ===")
    assert_no_spheres_in_source()
    for fname, builder, fkw in BUILDS:
        try:
            log(f"--- {fname} ---")
            sc = reset()
            builder()
            lights(sc, 1.05)
            frame(sc, **fkw)
            render_out(sc, OUT / fname)
        except Exception as e:
            log(f"FAIL {fname}: {e}\n{traceback.format_exc()}")
    log("=== DONE ===")
    for fname, _, _ in BUILDS:
        p = OUT / fname
        log(f"RESULT {fname} exists={p.exists()} bytes={p.stat().st_size if p.exists() else 0}")
    miss = [f for f, _, _ in BUILDS if not (OUT / f).exists()]
    if miss:
        raise SystemExit(f"Missing: {miss}")

if __name__ == "__main__":
    main()
