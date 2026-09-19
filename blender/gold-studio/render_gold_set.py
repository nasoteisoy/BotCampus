"""Gold Studio — chunky satin-gold collectible statues on pure black.
Blender 4.3 Cycles CPU beauty stills matching style-lock refs.
"""
import bpy
import math
import traceback
from pathlib import Path
from mathutils import Vector, Matrix, Euler

OUT = Path("/workspace/bot-campus-publish/gold-studio")
OUT.mkdir(parents=True, exist_ok=True)
LOG = Path("/workspace/bot-campus-publish/blender/gold-studio/render_log.txt")

SAMPLES = 248
RES = 1400


def log(msg):
    print(msg, flush=True)
    with open(LOG, "a") as f:
        f.write(msg + "\n")


# ---------------------------------------------------------------------------
# Scene / materials / helpers
# ---------------------------------------------------------------------------

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    try:
        sc.cycles.adaptive_min_samples = 48
    except Exception:
        pass
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    # Opaque pure black film (not transparent)
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "Filmic"
    sc.view_settings.look = "Medium High Contrast"

    world = bpy.data.worlds.new("BlackWorld")
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    outn = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.0, 0.0, 0.0, 1.0)
    bg.inputs[1].default_value = 0.0
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
        if "Sheen Roughness" in bsdf.inputs:
            bsdf.inputs["Sheen Roughness"].default_value = 0.35
        if "Sheen Tint" in bsdf.inputs:
            try:
                bsdf.inputs["Sheen Tint"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
            except Exception:
                pass
    if emit:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emit
    links.new(bsdf.outputs[0], outn.inputs[0])
    return m


def satin_gold(name="SatinGold"):
    # Warm satin gold — metallic ~0.9, roughness ~0.28
    return mat(name, (0.92, 0.68, 0.18, 1.0), rough=0.28, metal=0.9, spec=0.55)


def velvet(name, rgba):
    # Deep velvet with sheen
    m = mat(name, rgba, rough=0.72, metal=0.0, sheen=0.85, spec=0.25)
    # subtle bump for fabric feel
    n, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(x for x in n if x.type == "BSDF_PRINCIPLED")
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18.0
    noise.inputs["Detail"].default_value = 6.0
    bump = n.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 0.04
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def gem_mat(name, rgba, emit=0.4):
    return mat(name, rgba, rough=0.12, metal=0.05, emit=emit, spec=1.0)


def steel_mat(name="Steel"):
    return mat(name, (0.35, 0.38, 0.42, 1.0), rough=0.32, metal=0.85)


def undersuit_mat(name="Undersuit"):
    return mat(name, (0.12, 0.11, 0.10, 1.0), rough=0.78, metal=0.0, sheen=0.15)


def shade(o, angle=40):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth()
    if hasattr(o.data, "use_auto_smooth"):
        o.data.use_auto_smooth = True
        o.data.auto_smooth_angle = math.radians(angle)


def apply_bevel(o, w=0.04, seg=4):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    mod = o.modifiers.new("Bev", "BEVEL")
    mod.width = w
    mod.segments = seg
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(30)
    try:
        bpy.ops.object.modifier_apply(modifier="Bev")
    except Exception:
        pass


def apply_sub(o, levels=1):
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new("Sub", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    try:
        bpy.ops.object.modifier_apply(modifier="Sub")
    except Exception:
        pass


def cube(name, loc, scale, mtl, bev=0.04, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    if bev:
        apply_bevel(o, bev, 4)
    shade(o)
    o.data.materials.append(mtl)
    return o


def cyl(name, loc, r, depth, mtl, rot=(0, 0, 0), bev=0.02, verts=32):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    if bev:
        apply_bevel(o, bev, 3)
    shade(o)
    o.data.materials.append(mtl)
    return o


def sphere(name, loc, r, mtl, sub=2):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24, ring_count=16)
    o = bpy.context.active_object
    o.name = name
    shade(o)
    o.data.materials.append(mtl)
    return o


def cone(name, loc, r1, depth, mtl, r2=0.0, verts=24, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    shade(o)
    o.data.materials.append(mtl)
    return o


def torus(name, loc, major, minor, mtl, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    shade(o)
    o.data.materials.append(mtl)
    return o


def studio_lights(sc, subject_scale=1.0):
    """Strong rim + clean key/fill — product statue lighting."""
    s = subject_scale

    # Key — warm front-left
    bpy.ops.object.light_add(type="AREA", location=(3.8 * s, -3.2 * s, 4.2 * s))
    key = bpy.context.active_object
    key.name = "Key"
    key.data.energy = 420
    key.data.size = 2.8 * s
    key.data.color = (1.0, 0.95, 0.88)
    key.rotation_euler = (math.radians(48), math.radians(12), math.radians(40))

    # Fill — cooler softer
    bpy.ops.object.light_add(type="AREA", location=(-3.5 * s, -1.5 * s, 3.0 * s))
    fill = bpy.context.active_object
    fill.name = "Fill"
    fill.data.energy = 140
    fill.data.size = 4.0 * s
    fill.data.color = (0.65, 0.75, 1.0)
    fill.rotation_euler = (math.radians(55), math.radians(-15), math.radians(-50))

    # Strong rim / back — CRITICAL for black bg separation
    bpy.ops.object.light_add(type="AREA", location=(0.5 * s, 4.5 * s, 2.8 * s))
    rim = bpy.context.active_object
    rim.name = "Rim"
    rim.data.energy = 520
    rim.data.size = 2.2 * s
    rim.data.color = (1.0, 0.98, 1.0)
    rim.rotation_euler = (math.radians(75), 0, math.radians(180))

    # Secondary kicker (top-back)
    bpy.ops.object.light_add(type="AREA", location=(-2.0 * s, 3.5 * s, 4.5 * s))
    kick = bpy.context.active_object
    kick.name = "Kicker"
    kick.data.energy = 180
    kick.data.size = 1.8 * s
    kick.data.color = (0.95, 0.9, 1.0)
    kick.rotation_euler = (math.radians(60), math.radians(-10), math.radians(160))

    # Soft bounce from below
    bpy.ops.object.light_add(type="AREA", location=(0, -0.5 * s, -0.6 * s))
    bounce = bpy.context.active_object
    bounce.name = "Bounce"
    bounce.data.energy = 45
    bounce.data.size = 5.0 * s
    bounce.data.color = (0.9, 0.85, 0.75)
    bounce.rotation_euler = (math.radians(-90), 0, 0)


def cam(sc, loc, target, lens=60):
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.active_object
    c.name = "Cam"
    sc.camera = c
    c.data.lens = lens
    c.data.clip_start = 0.05
    c.data.clip_end = 100
    # aim at target
    direction = Vector(target) - Vector(loc)
    rot = direction.to_track_quat("-Z", "Y")
    c.rotation_euler = rot.to_euler()
    return c


def frame_subject(sc, pad=1.15, yaw=35, elev=0.18):
    """Auto-frame all mesh objects with medium lens feel.
    yaw: degrees from -Y (front); positive = camera to subject's right.
    """
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
    center = (mins + maxs) * 0.5
    size = maxs - mins
    height = max(size.z, 0.1)
    width = max(size.x, size.y, 0.1)
    dist = max(height, width) * pad / (2.0 * math.tan(math.radians(13.5)))
    # Front is -Y in our builds; orbit by yaw around Z
    ang = math.radians(yaw)
    cam_loc = (
        center.x + dist * math.sin(ang),
        center.y - dist * math.cos(ang),
        center.z + height * elev,
    )
    cam(sc, cam_loc, (center.x, center.y, center.z + height * 0.02), lens=62)


# ---------------------------------------------------------------------------
# 1) GOLDEN KNIGHT
# ---------------------------------------------------------------------------

def build_knight():
    gold = satin_gold("KnightGold")
    dark = undersuit_mat("KnightSuit")
    steel = steel_mat("BladeSteel")
    flame = mat("Flame", (1.0, 0.45, 0.08, 1.0), rough=0.4, emit=8.0)
    flame_core = mat("FlameCore", (1.0, 0.92, 0.45, 1.0), rough=0.25, emit=14.0)

    # Torso / breastplate — chunky
    cube("Breast", (0, 0, 1.35), (0.72, 0.42, 0.55), gold, bev=0.06)
    # ab plate
    cube("Ab", (0, 0, 0.95), (0.62, 0.38, 0.32), gold, bev=0.05)
    # undersuit mid
    cube("SuitTorso", (0, 0, 1.15), (0.50, 0.30, 0.70), dark, bev=0.03)

    # Pauldrons — massive rounded
    for sx, name in ((-1, "PaulL"), (1, "PaulR")):
        sphere(name, (sx * 0.58, 0.02, 1.55), 0.32, gold)
        o = bpy.data.objects[name]
        o.scale = (1.15, 0.85, 0.75)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(scale=True)
        apply_bevel(o, 0.03, 3)
        # lower pauldron plate
        cube(f"{name}Low", (sx * 0.55, 0.0, 1.32), (0.28, 0.22, 0.18), gold, bev=0.04)

    # Helmet
    sphere("Helm", (0, 0.02, 1.95), 0.28, gold)
    cube("Visor", (0, -0.18, 1.92), (0.22, 0.12, 0.14), gold, bev=0.03)
    # crest / plume spike
    cone("Crest", (0, 0, 2.28), 0.06, 0.28, gold, r2=0.02)
    cube("HelmJaw", (0, -0.05, 1.72), (0.24, 0.22, 0.12), gold, bev=0.03)
    # dark face slit
    cube("FaceSlit", (0, -0.22, 1.92), (0.14, 0.04, 0.05), dark, bev=0.01)

    # Neck undersuit
    cyl("Neck", (0, 0, 1.68), 0.12, 0.14, dark, bev=0.02)

    # Arms
    for sx, side in ((-1, "L"), (1, "R")):
        # upper arm
        cyl(f"UArm{side}", (sx * 0.72, 0.05, 1.15), 0.13, 0.42, gold,
            rot=(math.radians(15), math.radians(sx * -25), 0), bev=0.025)
        # elbow pad
        sphere(f"Elbow{side}", (sx * 0.85, 0.12, 0.92), 0.12, gold)
        # forearm
        cyl(f"FArm{side}", (sx * 0.95, 0.18, 0.70), 0.11, 0.38, gold,
            rot=(math.radians(20), math.radians(sx * -15), 0), bev=0.025)
        # gauntlet
        cube(f"Gaunt{side}", (sx * 1.05, 0.25, 0.48), (0.18, 0.16, 0.16), gold, bev=0.035)
        # undersuit joint
        sphere(f"Joint{side}", (sx * 0.78, 0.08, 1.05), 0.09, dark)

    # Pose tweak: right arm raised holding sword — rebuild right forearm higher
    # Sword in right hand
    # Blade
    blade = cube("Blade", (1.15, 0.55, 1.05), (0.06, 0.10, 1.05), steel, bev=0.02,
                 rot=(math.radians(-25), math.radians(10), math.radians(15)))
    # gold edge bevel look — thinner gold rim cubes
    cube("BladeEdge", (1.15, 0.55, 1.05), (0.08, 0.04, 1.02), gold, bev=0.015,
         rot=(math.radians(-25), math.radians(10), math.radians(15)))
    # Crossguard
    cube("Guard", (1.08, 0.42, 0.55), (0.32, 0.10, 0.10), gold, bev=0.03,
         rot=(math.radians(-25), math.radians(10), math.radians(15)))
    # Hilt
    cyl("Hilt", (1.05, 0.35, 0.38), 0.05, 0.28, dark,
        rot=(math.radians(65), math.radians(10), math.radians(15)), bev=0.015)
    # Pommel
    sphere("Pommel", (1.02, 0.28, 0.22), 0.07, gold)

    # Flame near hilt / blade base — BIG emissive orange (must read clearly)
    flame_loc = (1.18, 0.55, 0.78)
    cone("FlameOuter", flame_loc, 0.18, 0.55, flame, r2=0.02,
         rot=(math.radians(15), math.radians(-10), math.radians(20)))
    cone("FlameInner", (1.18, 0.55, 0.85), 0.09, 0.42, flame_core, r2=0.015,
         rot=(math.radians(15), math.radians(-10), math.radians(20)))
    cone("Flame2", (1.28, 0.48, 0.90), 0.10, 0.35, flame, r2=0.01,
         rot=(math.radians(35), math.radians(25), math.radians(-15)))
    cone("Flame3", (1.08, 0.60, 0.88), 0.08, 0.30, flame, r2=0.01,
         rot=(math.radians(-20), math.radians(-30), math.radians(40)))
    sphere("FlameGlow", (1.18, 0.55, 0.70), 0.10, flame_core)
    bpy.ops.object.light_add(type="POINT", location=(1.18, 0.55, 0.80))
    fl = bpy.context.active_object
    fl.name = "FlameLight"
    fl.data.energy = 80
    fl.data.color = (1.0, 0.45, 0.08)
    fl.data.shadow_soft_size = 0.2

    # Hips / fauld
    cube("Fauld", (0, 0, 0.72), (0.68, 0.40, 0.22), gold, bev=0.05)
    for sx in (-1, 1):
        cube(f"Tasset{sx}", (sx * 0.28, 0.02, 0.55), (0.26, 0.28, 0.22), gold, bev=0.04)

    # Legs
    for sx, side in ((-1, "L"), (1, "R")):
        # thigh
        cyl(f"Thigh{side}", (sx * 0.22, 0.02, 0.32), 0.15, 0.40, gold, bev=0.03)
        sphere(f"Knee{side}", (sx * 0.22, 0.05, 0.10), 0.13, gold)
        # shin
        cyl(f"Shin{side}", (sx * 0.22, 0.04, -0.18), 0.13, 0.40, gold, bev=0.03)
        # boot
        cube(f"Boot{side}", (sx * 0.22, 0.10, -0.42), (0.22, 0.36, 0.16), gold, bev=0.04)
        # undersuit at knee back hint
        sphere(f"KneeSuit{side}", (sx * 0.22, -0.05, 0.10), 0.08, dark)

    # Belt buckle gem
    gem = gem_mat("BeltGem", (0.85, 0.08, 0.12, 1.0), emit=0.6)
    cube("Buckle", (0, -0.22, 0.78), (0.14, 0.06, 0.12), gold, bev=0.02)
    sphere("Gem", (0, -0.26, 0.78), 0.055, gem)

    # Dynamic ready pose footing
    bpy.data.objects["BootL"].location.y += 0.08
    bpy.data.objects["ShinL"].location.y += 0.05
    bpy.data.objects["ThighL"].location.y += 0.03
    bpy.data.objects["BootR"].location.y -= 0.06
    bpy.data.objects["ShinR"].location.y -= 0.04

    # Bring sword/flame more into front-right silhouette (already +Y-ish)
    # Raise right arm pieces slightly toward camera (-Y)
    for nm in ("FArmR", "GauntR", "Blade", "BladeEdge", "Guard", "Hilt", "Pommel",
               "FlameOuter", "FlameInner", "Flame2", "Flame3", "FlameGlow"):
        if nm in bpy.data.objects:
            o = bpy.data.objects[nm]
            o.location.y -= 0.15
            o.location.z += 0.12

    # Extra chest ridge for readable front silhouette
    cube("ChestRidge", (0, -0.22, 1.40), (0.12, 0.08, 0.35), gold, bev=0.025)

    # Face the figure slightly toward camera: rotate all knight meshes around Z
    import mathutils
    R = mathutils.Matrix.Rotation(math.radians(18), 4, "Z")
    skip = {"Key", "Fill", "Rim", "Kicker", "Bounce", "Cam"}
    for o in list(bpy.data.objects):
        if o.name in skip:
            continue
        if o.type == "MESH" or o.name == "FlameLight":
            o.matrix_world = R @ o.matrix_world



def build_crown():
    gold = satin_gold("CrownGold")
    velvet_m = velvet("CushionVelvet", (0.18, 0.05, 0.32, 1.0))  # deep purple/blue
    ruby = gem_mat("Ruby", (0.78, 0.03, 0.06, 1.0), emit=0.9)
    ruby_sm = gem_mat("RubySm", (0.72, 0.04, 0.07, 1.0), emit=0.55)
    braid = satin_gold("BraidGold")

    # Cushion base — pillowy
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.18))
    cush = bpy.context.active_object
    cush.name = "Cushion"
    cush.scale = (1.15, 0.95, 0.32)
    bpy.ops.object.transform_apply(scale=True)
    apply_bevel(cush, 0.12, 5)
    apply_sub(cush, 1)
    shade(cush)
    cush.data.materials.append(velvet_m)

    # Soft top puff
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.55, location=(0, 0, 0.38), segments=24, ring_count=12)
    puff = bpy.context.active_object
    puff.name = "CushionPuff"
    puff.scale = (1.6, 1.35, 0.45)
    bpy.ops.object.transform_apply(scale=True)
    shade(puff)
    puff.data.materials.append(velvet_m)

    # Gold braid trim around cushion edge
    torus("Braid", (0, 0, 0.28), 0.95, 0.035, braid)
    bpy.data.objects["Braid"].scale = (1.15, 0.95, 1.0)
    bpy.ops.object.transform_apply(scale=True)

    # Corner tassels
    for i, (x, y) in enumerate([(-0.95, -0.78), (0.95, -0.78), (-0.95, 0.78), (0.95, 0.78)]):
        cyl(f"TasselCord{i}", (x * 0.55, y * 0.55, 0.12), 0.02, 0.22, braid, bev=0.005)
        sphere(f"TasselBall{i}", (x * 0.55, y * 0.55, -0.02), 0.06, braid)
        # fringe
        for j in range(5):
            ang = j * 72
            fx = x * 0.55 + 0.03 * math.cos(math.radians(ang))
            fy = y * 0.55 + 0.03 * math.sin(math.radians(ang))
            cyl(f"Fringe{i}_{j}", (fx, fy, -0.10), 0.008, 0.10, braid, bev=0.002)

    # Crown band
    cyl("Band", (0, 0, 0.62), 0.42, 0.18, gold, bev=0.025, verts=48)
    # hollow look: inner dark
    dark_in = undersuit_mat("CrownInner")
    cyl("BandInner", (0, 0, 0.62), 0.34, 0.16, dark_in, bev=0.01, verts=32)

    # Fleur / spikes around crown
    for i in range(8):
        ang = i * 45
        rad = 0.40
        x = rad * math.cos(math.radians(ang))
        y = rad * math.sin(math.radians(ang))
        h = 0.28 if i % 2 == 0 else 0.18
        cone(f"Spike{i}", (x, y, 0.78 + h * 0.35), 0.07 if i % 2 == 0 else 0.05, h, gold, r2=0.01)
        # small ruby on even spikes
        if i % 2 == 0:
            sphere(f"SpikeGem{i}", (x * 0.95, y * 0.95, 0.78), 0.035, ruby_sm)

    # Large front gem setting
    cube("GemSetting", (0, -0.40, 0.72), (0.18, 0.10, 0.20), gold, bev=0.03)
    # Large ruby
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.10, location=(0, -0.48, 0.74))
    big = bpy.context.active_object
    big.name = "BigRuby"
    big.scale = (1.0, 0.7, 1.15)
    bpy.ops.object.transform_apply(scale=True)
    shade(big)
    big.data.materials.append(ruby)

    # Cross / ornament on top front
    cube("CrossV", (0, -0.05, 1.05), (0.05, 0.05, 0.22), gold, bev=0.02)
    cube("CrossH", (0, -0.05, 1.08), (0.16, 0.05, 0.05), gold, bev=0.02)
    sphere("TopPearl", (0, -0.05, 1.18), 0.04, ruby_sm)

    # Rim detail rings
    torus("UpperRim", (0, 0, 0.72), 0.43, 0.02, gold)
    torus("LowerRim", (0, 0, 0.52), 0.43, 0.02, gold)


# ---------------------------------------------------------------------------
# 3) GOLDEN CHALICE
# ---------------------------------------------------------------------------

def build_chalice():
    gold = satin_gold("ChaliceGold")
    # Solid viscous gem-like ruby liquid (no transmission — must read clearly)
    liquid = mat("RubyLiquid", (0.78, 0.02, 0.06, 1.0), rough=0.18, metal=0.05, emit=4.5, spec=0.9)

    # Base — heavy solid
    cyl("Base", (0, 0, 0.08), 0.48, 0.14, gold, bev=0.04, verts=48)
    torus("BaseRim", (0, 0, 0.15), 0.46, 0.03, gold)
    # stepped foot
    cyl("Foot", (0, 0, 0.22), 0.28, 0.12, gold, bev=0.03, verts=40)

    # Stem — thick solid
    cyl("Stem", (0, 0, 0.55), 0.10, 0.55, gold, bev=0.025, verts=32)
    # knop / node mid-stem
    sphere("Knop", (0, 0, 0.55), 0.16, gold)
    torus("KnopRing", (0, 0, 0.55), 0.17, 0.025, gold)

    # Open cup bowl — thick wall via outer hemisphere + inner cavity look
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.45, location=(0, 0, 1.10), segments=48, ring_count=24)
    bowl = bpy.context.active_object
    bowl.name = "Bowl"
    # Delete top half to open the cup
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in bowl.data.vertices:
        # keep lower hemisphere + a bit above equator for wall height
        v.select = (bowl.matrix_world @ v.co).z > 1.28
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    apply_bevel(bowl, 0.02, 2)
    shade(bowl)
    bowl.data.materials.append(gold)

    # Inner liner (slightly smaller) so walls read thick
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.38, location=(0, 0, 1.12), segments=40, ring_count=20)
    inner = bpy.context.active_object
    inner.name = "BowlInner"
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in inner.data.vertices:
        v.select = (inner.matrix_world @ v.co).z > 1.26
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    shade(inner)
    # darkish gold interior
    inner_m = mat("CupInner", (0.55, 0.35, 0.10, 1.0), rough=0.35, metal=0.85)
    inner.data.materials.append(inner_m)

    # Thick rim
    torus("CupRim", (0, 0, 1.30), 0.41, 0.05, gold)

    # Decorative band on bowl
    torus("DecoBand", (0, 0, 1.00), 0.46, 0.035, gold)
    ruby_sm = gem_mat("ChaliceRuby", (0.78, 0.04, 0.08, 1.0), emit=0.7)
    for i in range(6):
        ang = i * 60
        x = 0.47 * math.cos(math.radians(ang))
        y = 0.47 * math.sin(math.radians(ang))
        sphere(f"BandGem{i}", (x, y, 1.00), 0.045, ruby_sm)

    # Viscous ruby-red liquid — high fill so it reads clearly in the open cup
    # Main liquid body (cylinder plug + domed meniscus)
    cyl("LiquidBody", (0, 0, 1.12), 0.35, 0.36, liquid, bev=0.02, verts=40)
    # Domed meniscus surface
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.35, location=(0, 0, 1.28), segments=32, ring_count=16)
    surf = bpy.context.active_object
    surf.name = "LiquidSurf"
    # keep only upper hemisphere-ish bulge
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in surf.data.vertices:
        v.select = (surf.matrix_world @ v.co).z < 1.28
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    surf.scale = (1.0, 1.0, 0.35)
    bpy.ops.object.transform_apply(scale=True)
    shade(surf)
    surf.data.materials.append(liquid)

    # Bright emissive core so liquid pops
    core_m = mat("LiquidCore", (1.0, 0.12, 0.15, 1.0), rough=0.15, emit=3.5, metal=0.0)
    sphere("LiquidCore", (0, 0, 1.15), 0.20, core_m)

    bpy.ops.object.light_add(type="POINT", location=(0, 0, 1.22))
    pl = bpy.context.active_object
    pl.name = "LiquidLight"
    pl.data.energy = 55
    pl.data.color = (1.0, 0.08, 0.12)
    pl.data.shadow_soft_size = 0.25


# ---------------------------------------------------------------------------
# 4) GOLDEN THRONE
# ---------------------------------------------------------------------------

def build_throne():
    gold = satin_gold("ThroneGold")
    seat_v = velvet("SeatVelvet", (0.45, 0.04, 0.08, 1.0))  # deep red
    dark = undersuit_mat("ThroneDark")

    # Seat base / frame
    cube("SeatFrame", (0, 0, 0.55), (1.35, 1.15, 0.18), gold, bev=0.05)
    # Legs
    for i, (x, y) in enumerate([(-0.55, -0.45), (0.55, -0.45), (-0.55, 0.45), (0.55, 0.45)]):
        cyl(f"Leg{i}", (x, y, 0.22), 0.09, 0.44, gold, bev=0.025)
        # foot pad
        sphere(f"Foot{i}", (x, y, 0.04), 0.11, gold)

    # Cross braces
    cube("BraceF", (0, -0.45, 0.25), (1.05, 0.08, 0.08), gold, bev=0.02)
    cube("BraceB", (0, 0.45, 0.25), (1.05, 0.08, 0.08), gold, bev=0.02)

    # Pillowy seat cushion
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.05, 0.72))
    seat = bpy.context.active_object
    seat.name = "SeatCush"
    seat.scale = (1.15, 0.95, 0.22)
    bpy.ops.object.transform_apply(scale=True)
    apply_bevel(seat, 0.10, 5)
    apply_sub(seat, 1)
    shade(seat)
    seat.data.materials.append(seat_v)

    # Back frame — tall
    cube("BackFrame", (0, 0.52, 1.55), (1.25, 0.14, 1.70), gold, bev=0.05)
    # Back cushion
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.38, 1.50))
    back = bpy.context.active_object
    back.name = "BackCush"
    back.scale = (1.05, 0.18, 1.40)
    bpy.ops.object.transform_apply(scale=True)
    apply_bevel(back, 0.09, 5)
    apply_sub(back, 1)
    shade(back)
    back.data.materials.append(seat_v)

    # Scrolled armrests
    for sx, side in ((-1, "L"), (1, "R")):
        # arm rail
        cyl(f"Arm{side}", (sx * 0.68, 0.0, 0.95), 0.07, 0.95, gold,
            rot=(math.radians(90), 0, 0), bev=0.02)
        # front scroll curl — torus segment approx via torus + sphere
        torus(f"Scroll{side}", (sx * 0.68, -0.48, 0.95), 0.14, 0.05, gold,
              rot=(0, math.radians(90), 0))
        sphere(f"ScrollEnd{side}", (sx * 0.68, -0.58, 0.95), 0.08, gold)
        # arm pad velvet
        bpy.ops.mesh.primitive_cube_add(size=1, location=(sx * 0.68, 0.05, 1.05))
        pad = bpy.context.active_object
        pad.name = f"ArmPad{side}"
        pad.scale = (0.16, 0.55, 0.08)
        bpy.ops.object.transform_apply(scale=True)
        apply_bevel(pad, 0.04, 3)
        shade(pad)
        pad.data.materials.append(seat_v)
        # vertical arm support
        cyl(f"ArmPost{side}", (sx * 0.68, 0.40, 0.75), 0.06, 0.40, gold, bev=0.02)

    # Ornate top crest
    cube("CrestBar", (0, 0.52, 2.45), (1.35, 0.12, 0.14), gold, bev=0.035)
    # central crest ornament
    cone("CrestCenter", (0, 0.52, 2.72), 0.12, 0.40, gold, r2=0.02)
    sphere("CrestOrb", (0, 0.52, 2.95), 0.08, gem_mat("ThroneGem", (0.85, 0.08, 0.1, 1.0), emit=0.6))
    # side finials
    for sx in (-1, 1):
        cone(f"Finial{sx}", (sx * 0.58, 0.52, 2.65), 0.07, 0.28, gold, r2=0.015)
        sphere(f"FinialOrb{sx}", (sx * 0.58, 0.52, 2.82), 0.05, gold)

    # Side upright posts
    for sx in (-1, 1):
        cyl(f"Post{sx}", (sx * 0.58, 0.52, 1.55), 0.08, 1.70, gold, bev=0.025)

    # Small lumbar puff cushion
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.35, location=(0, 0.22, 1.05), segments=20, ring_count=12)
    lumbar = bpy.context.active_object
    lumbar.name = "Lumbar"
    lumbar.scale = (1.4, 0.6, 0.7)
    bpy.ops.object.transform_apply(scale=True)
    shade(lumbar)
    lumbar.data.materials.append(seat_v)


# ---------------------------------------------------------------------------
# Render loop
# ---------------------------------------------------------------------------

JOBS = [
    # name, builder, light_scale, yaw_deg, elev, pad
    ("golden_knight", build_knight, 1.2, 28, 0.12, 1.15),
    ("golden_crown", build_crown, 0.9, 32, 0.22, 1.18),
    ("golden_chalice", build_chalice, 0.85, 18, 0.42, 1.15),
    ("golden_throne", build_throne, 1.3, 38, 0.20, 1.18),
]


def main():
    with open(LOG, "w") as f:
        f.write("Gold Studio render log\n")
    log(f"Blender {bpy.app.version_string} | samples={SAMPLES} res={RES}")

    for name, builder, light_scale, yaw, elev, pad in JOBS:
        try:
            log(f"=== BUILD {name} ===")
            sc = reset()
            studio_lights(sc, light_scale)
            builder()
            frame_subject(sc, pad=pad, yaw=yaw, elev=elev)
            outpath = OUT / name
            sc.render.filepath = str(outpath)
            log(f"RENDER {name} -> {outpath}.png")
            bpy.ops.render.render(write_still=True)
            p = Path(str(outpath) + ".png")
            if p.exists():
                log(f"OK {name} size={p.stat().st_size}")
            else:
                log(f"MISSING {name}")
        except Exception as e:
            log(f"FAIL {name}: {e}")
            log(traceback.format_exc())

    log("ALL_DONE")


if __name__ == "__main__":
    main()
