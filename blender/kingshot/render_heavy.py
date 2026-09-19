"""HEAVY-DETAIL Kingshot isometric battle — Cycles 4.3 beauty stills."""
import bpy
import math
import random
from pathlib import Path
from mathutils import Vector, Matrix, Euler

OUT = Path("/workspace/bot-campus-publish/kingshot")
TEX = Path("/workspace/bot-campus-publish/blender/kingshot/tex")
OUT.mkdir(parents=True, exist_ok=True)
random.seed(42)

# ---------------------------------------------------------------------------
# Scene / materials / helpers
# ---------------------------------------------------------------------------

def reset(w=1920, h=1080, samples=250):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    try:
        sc.cycles.adaptive_min_samples = 32
    except Exception:
        pass
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Filmic"
    sc.view_settings.look = "Medium High Contrast"
    world = bpy.data.worlds.new("WorldHeavy")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.52, 0.72, 0.95, 1.0)
    bg.inputs[1].default_value = 0.85
    return sc


def mat_col(name, rgba, rough=0.5, emit=0.0, metal=0.0, sss=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    n, links = m.node_tree.nodes, m.node_tree.links
    n.clear()
    out = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emit
    # Blender 4.x subsurface
    if sss > 0:
        if "Subsurface Weight" in bsdf.inputs:
            bsdf.inputs["Subsurface Weight"].default_value = sss
            if "Subsurface Radius" in bsdf.inputs:
                bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.4, 0.2)
        elif "Subsurface" in bsdf.inputs:
            bsdf.inputs["Subsurface"].default_value = sss
    links.new(bsdf.outputs[0], out.inputs[0])
    return m


def mat_tex(name, path, rough=0.7, scale=4.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    n, links = m.node_tree.nodes, m.node_tree.links
    n.clear()
    out = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    tex = n.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(path))
    tex.interpolation = "Closest" if "wood" in name.lower() else "Linear"
    mapn = n.new("ShaderNodeMapping")
    mapn.inputs["Scale"].default_value = (scale, scale, scale)
    tc = n.new("ShaderNodeTexCoord")
    links.new(tc.outputs["UV"], mapn.inputs["Vector"])
    links.new(mapn.outputs["Vector"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    links.new(bsdf.outputs[0], out.inputs[0])
    return m


def mat_cape_displace(name, rgba=(0.08, 0.35, 0.92, 1.0)):
    """Fabric-like cape with noise displacement for folds."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    n, links = m.node_tree.nodes, m.node_tree.links
    n.clear()
    out = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = 0.35
    # displacement
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.5
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.55
    noise2 = n.new("ShaderNodeTexNoise")
    noise2.inputs["Scale"].default_value = 2.2
    noise2.inputs["Detail"].default_value = 4.0
    mix = n.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mix.inputs["Factor"].default_value = 0.55
    links.new(noise.outputs["Fac"], mix.inputs["A"])
    links.new(noise2.outputs["Fac"], mix.inputs["B"])
    bump = n.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.55
    bump.inputs["Distance"].default_value = 0.08
    links.new(mix.outputs["Result"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    disp = n.new("ShaderNodeDisplacement")
    disp.inputs["Scale"].default_value = 0.07
    disp.inputs["Midlevel"].default_value = 0.5
    links.new(mix.outputs["Result"], disp.inputs["Height"])
    links.new(bsdf.outputs[0], out.inputs["Surface"])
    links.new(disp.outputs[0], out.inputs["Displacement"])
    m.cycles.displacement_method = "BOTH"
    return m


def shade(o):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth()
    if hasattr(o.data, "use_auto_smooth"):
        o.data.use_auto_smooth = True
        o.data.auto_smooth_angle = math.radians(35)


def apply_bevel(o, w=0.02, seg=3):
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new("Bev", "BEVEL")
    mod.width = w
    mod.segments = seg
    mod.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier="Bev")


def apply_sub(o, levels=1):
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new("Sub", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    bpy.ops.object.modifier_apply(modifier="Sub")


def uv_smart(o):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")


def cube(name, loc, scale, mat, bev=0.02, sub=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    if bev:
        apply_bevel(o, bev, 3)
    if sub:
        apply_sub(o, sub)
    uv_smart(o)
    shade(o)
    o.data.materials.append(mat)
    return o


def cyl(name, loc, r, depth, mat, rot=(0, 0, 0), bev=0.01, verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    if bev:
        apply_bevel(o, bev, 2)
    shade(o)
    o.data.materials.append(mat)
    return o


def cone(name, loc, r1, depth, mat, verts=16, r2=0.0):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    shade(o)
    o.data.materials.append(mat)
    return o


def sphere(name, loc, r, mat, scale=(1, 1, 1), seg=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=max(8, seg // 2))
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    shade(o)
    o.data.materials.append(mat)
    return o


def torus(name, loc, major, minor, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=loc,
        major_segments=24, minor_segments=12
    )
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(rotation=True)
    shade(o)
    o.data.materials.append(mat)
    return o


def plane_displace_cape(name, loc, size_xy, mat, folds=True):
    """Subdivided plane bent into a cape with Displace modifier."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (size_xy[0], size_xy[1], 1)
    bpy.ops.object.transform_apply(scale=True)
    # subdivide heavily in edit mode
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=18)
    bpy.ops.object.mode_set(mode="OBJECT")
    # tilt cape back
    o.rotation_euler = (math.radians(78), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    # displace with cloud texture
    tex = bpy.data.textures.new(f"{name}_noise", type="CLOUDS")
    tex.noise_scale = 0.35
    tex.noise_depth = 4
    mod = o.modifiers.new("Disp", "DISPLACE")
    mod.texture = tex
    mod.strength = 0.18
    mod.mid_level = 0.5
    bpy.ops.object.modifier_apply(modifier="Disp")
    # second finer displace
    tex2 = bpy.data.textures.new(f"{name}_noise2", type="CLOUDS")
    tex2.noise_scale = 0.12
    tex2.noise_depth = 3
    mod2 = o.modifiers.new("Disp2", "DISPLACE")
    mod2.texture = tex2
    mod2.strength = 0.06
    bpy.ops.object.modifier_apply(modifier="Disp2")
    apply_sub(o, 1)
    shade(o)
    o.data.materials.append(mat)
    return o


def lights():
    bpy.ops.object.light_add(type="SUN", location=(14, -10, 20))
    sun = bpy.context.active_object
    sun.name = "Sun"
    sun.data.energy = 5.2
    sun.data.angle = 0.012
    sun.rotation_euler = (math.radians(48), math.radians(10), math.radians(45))

    bpy.ops.object.light_add(type="AREA", location=(-8, 6, 7))
    fill = bpy.context.active_object
    fill.name = "Fill"
    fill.data.energy = 90
    fill.data.size = 10
    fill.data.color = (0.55, 0.75, 1.0)
    fill.rotation_euler = (math.radians(55), 0, math.radians(-30))

    bpy.ops.object.light_add(type="AREA", location=(5, 10, 5))
    rim = bpy.context.active_object
    rim.name = "Rim"
    rim.data.energy = 55
    rim.data.size = 6
    rim.data.color = (1.0, 0.82, 0.65)
    rim.rotation_euler = (math.radians(70), 0, math.radians(160))

    bpy.ops.object.light_add(type="AREA", location=(0, -6, 8))
    key = bpy.context.active_object
    key.name = "KeySoft"
    key.data.energy = 40
    key.data.size = 7
    key.data.color = (1.0, 0.95, 0.88)


def make_mats():
    grass_p = TEX / "grass.png"
    sand_p = TEX / "sand.png"
    wood_p = TEX / "wood.png"
    metal_p = TEX / "metal.png"
    M = {
        "grass": mat_tex("Grass", grass_p, 0.92, 7.0) if grass_p.exists() else mat_col("Grass", (0.28, 0.72, 0.28, 1), 0.9),
        "sand": mat_tex("Sand", sand_p, 0.93, 5.5) if sand_p.exists() else mat_col("Sand", (0.88, 0.74, 0.48, 1), 0.9),
        "wood": mat_tex("Wood", wood_p, 0.68, 2.2) if wood_p.exists() else mat_col("Wood", (0.55, 0.35, 0.18, 1), 0.65),
        "wood_dark": mat_tex("WoodD", wood_p, 0.78, 3.8) if wood_p.exists() else mat_col("WoodD", (0.32, 0.18, 0.09, 1), 0.72),
        "steel": mat_tex("Steel", metal_p, 0.32, 2.0, metal=0.75) if metal_p.exists() else mat_col("Steel", (0.62, 0.66, 0.7, 1), 0.32, metal=0.75),
        "cape": mat_cape_displace("Cape", (0.08, 0.36, 0.95, 1)),
        "cape_dark": mat_col("CapeD", (0.04, 0.18, 0.55, 1), 0.75),
        "gold": mat_col("Gold", (1.0, 0.78, 0.12, 1), 0.18, metal=0.95),
        "gold_bright": mat_col("GoldB", (1.0, 0.88, 0.25, 1), 0.12, metal=0.98, emit=0.15),
        "skin": mat_col("Skin", (1.0, 0.78, 0.64, 1), 0.45, sss=0.25),
        "hair": mat_col("Hair", (0.32, 0.18, 0.08, 1), 0.72),
        "eye_w": mat_col("EyeW", (0.95, 0.95, 0.98, 1), 0.25),
        "pupil": mat_col("Pupil", (0.05, 0.05, 0.08, 1), 0.2),
        "brow": mat_col("Brow", (0.22, 0.12, 0.05, 1), 0.65),
        "lip": mat_col("Lip", (0.85, 0.35, 0.35, 1), 0.4, sss=0.15),
        "gem_b": mat_col("GemB", (0.15, 0.55, 1.0, 1), 0.08, emit=1.2),
        "gem_r": mat_col("GemR", (1.0, 0.15, 0.2, 1), 0.08, emit=1.0),
        "gem_g": mat_col("GemG", (0.15, 0.95, 0.35, 1), 0.08, emit=1.0),
        "red": mat_col("Red", (0.92, 0.06, 0.06, 1), 0.35, metal=0.25),
        "red_dark": mat_col("RedD", (0.42, 0.03, 0.05, 1), 0.4, metal=0.3),
        "red_bright": mat_col("RedB", (1.0, 0.18, 0.12, 1), 0.3, metal=0.2),
        "pants": mat_col("Pants", (0.1, 0.16, 0.42, 1), 0.58),
        "boot": mat_col("Boot", (0.18, 0.1, 0.06, 1), 0.62),
        "hp": mat_col("HP", (0.2, 0.95, 0.32, 1), 0.3, emit=0.9),
        "hp_bg": mat_col("HPBG", (0.08, 0.08, 0.08, 1), 0.5),
        "coin": mat_col("Coin", (1.0, 0.84, 0.1, 1), 0.15, metal=0.96, emit=0.35),
        "white": mat_col("White", (0.96, 0.96, 0.98, 1), 0.35),
        "aura": mat_col("Aura", (0.3, 1.0, 0.4, 1), 0.25, emit=2.5),
        "rope": mat_col("Rope", (0.55, 0.42, 0.22, 1), 0.85),
        "rock": mat_col("Rock", (0.52, 0.48, 0.4, 1), 0.88),
        "armor_w": mat_col("ArmorW", (0.85, 0.88, 0.92, 1), 0.28, metal=0.65),
    }
    return M


# ---------------------------------------------------------------------------
# King — many parts
# ---------------------------------------------------------------------------

def make_king(x, y, z, M, collection=None):
    parts = []

    def add(o):
        parts.append(o)
        return o

    # torso layers
    add(cube("KTorso", (x, y, z + 0.55), (0.36, 0.28, 0.4), M["pants"], 0.04, 1))
    add(cube("KChestPlate", (x, y - 0.14, z + 0.62), (0.3, 0.07, 0.26), M["armor_w"], 0.025, 1))
    add(cube("KChestTrim", (x, y - 0.17, z + 0.62), (0.12, 0.03, 0.22), M["gold"], 0.015))
    # belt + buckle
    add(cube("KBelt", (x, y, z + 0.32), (0.4, 0.3, 0.07), M["gold"], 0.02))
    add(cube("KBuckle", (x, y - 0.16, z + 0.32), (0.1, 0.04, 0.09), M["gold_bright"], 0.015))
    # shoulder pads
    for sx in (-1, 1):
        add(sphere(f"KShoulder{sx}", (x + 0.28 * sx, y, z + 0.72), 0.12, M["armor_w"], scale=(1.1, 0.9, 0.7), seg=24))
        add(cyl(f"KShoulderTrim{sx}", (x + 0.28 * sx, y, z + 0.72), 0.13, 0.04, M["gold"], rot=(math.radians(90), 0, 0), bev=0.008))

    # head + face
    add(sphere("KHead", (x, y, z + 1.0), 0.23, M["skin"], seg=32))
    add(sphere("KHair", (x, y + 0.02, z + 1.1), 0.2, M["hair"], scale=(1.08, 0.92, 0.55), seg=24))
    # eyes
    add(sphere("KEyeL", (x - 0.07, y - 0.19, z + 1.02), 0.038, M["eye_w"], seg=16))
    add(sphere("KEyeR", (x + 0.07, y - 0.19, z + 1.02), 0.038, M["eye_w"], seg=16))
    add(sphere("KPupL", (x - 0.07, y - 0.22, z + 1.02), 0.02, M["pupil"], seg=12))
    add(sphere("KPupR", (x + 0.07, y - 0.22, z + 1.02), 0.02, M["pupil"], seg=12))
    # brows
    add(cube("KBrowL", (x - 0.08, y - 0.2, z + 1.08), (0.08, 0.02, 0.02), M["brow"], 0.005))
    add(cube("KBrowR", (x + 0.08, y - 0.2, z + 1.08), (0.08, 0.02, 0.02), M["brow"], 0.005))
    # mouth
    add(cube("KMouth", (x, y - 0.2, z + 0.92), (0.07, 0.02, 0.015), M["lip"], 0.005))
    # nose hint
    add(sphere("KNose", (x, y - 0.22, z + 0.98), 0.025, M["skin"], scale=(0.7, 1.0, 0.9), seg=12))

    # ornate crown
    add(cyl("KCrownBand", (x, y, z + 1.2), 0.25, 0.11, M["gold"], bev=0.012, verts=32))
    add(cyl("KCrownInner", (x, y, z + 1.22), 0.22, 0.06, M["gold_bright"], bev=0.01, verts=32))
    gems = [M["gem_b"], M["gem_r"], M["gem_g"], M["gem_b"], M["gem_r"], M["gem_g"], M["gem_b"], M["gem_r"]]
    for i, ang in enumerate(range(0, 360, 45)):
        rad = math.radians(ang)
        ox = math.cos(rad) * 0.2
        oy = math.sin(rad) * 0.2
        add(cone(f"KSpike{i}", (x + ox, y + oy, z + 1.36), 0.042, 0.22, M["gold"], 12))
        # little ball tip
        add(sphere(f"KSpikeTip{i}", (x + ox, y + oy, z + 1.48), 0.022, M["gold_bright"], seg=12))
        add(sphere(f"KGem{i}", (x + ox * 0.95, y + oy * 0.95, z + 1.2), 0.032, gems[i], seg=16))
    # front big gem
    add(sphere("KGemFront", (x, y - 0.24, z + 1.22), 0.04, M["gem_b"], seg=16))

    # layered flowing cape with displacement folds
    cape = plane_displace_cape("KCapeMain", (x, y + 0.48, z + 0.62), (0.78, 1.15), M["cape"])
    cape.location = (x, y + 0.52, z + 0.35)
    parts.append(cape)
    cape2 = plane_displace_cape("KCapeUnder", (x, y + 0.44, z + 0.55), (0.68, 1.05), M["cape_dark"])
    cape2.location = (x, y + 0.46, z + 0.28)
    parts.append(cape2)
    # extra fabric flap layers for volume
    for i, (oy, oz, sx) in enumerate([(0.55, 0.2, 0.55), (0.6, 0.1, 0.48)]):
        flap = cube(f"KCapeFlap{i}", (x, y + oy, z + oz + 0.45), (sx, 0.06, 0.7), M["cape"], 0.05, 1)
        parts.append(flap)
    # cape clasp
    add(sphere("KClasp", (x, y - 0.12, z + 0.78), 0.055, M["gold"], seg=16))
    add(sphere("KClaspGem", (x, y - 0.16, z + 0.78), 0.028, M["gem_r"], seg=12))

    # arms + gauntlets
    for sx in (-1, 1):
        add(cyl(f"KUpperArm{sx}", (x + 0.38 * sx, y, z + 0.58), 0.09, 0.26, M["cape"], rot=(0, math.radians(70 * sx), 0), bev=0.015))
        add(cyl(f"KForearm{sx}", (x + 0.52 * sx, y - 0.02, z + 0.42), 0.08, 0.2, M["armor_w"], rot=(0, math.radians(50 * sx), 0), bev=0.012))
        add(cyl(f"KGauntlet{sx}", (x + 0.58 * sx, y - 0.04, z + 0.34), 0.09, 0.1, M["gold"], rot=(0, math.radians(40 * sx), 0), bev=0.01))
        add(sphere(f"KHand{sx}", (x + 0.62 * sx, y - 0.06, z + 0.28), 0.08, M["skin"], seg=16))

    # legs + boots
    for sx in (-1, 1):
        add(cube(f"KThigh{sx}", (x + 0.11 * sx, y, z + 0.22), (0.11, 0.13, 0.15), M["pants"], 0.025, 1))
        add(cube(f"KShin{sx}", (x + 0.11 * sx, y, z + 0.1), (0.1, 0.12, 0.1), M["armor_w"], 0.02))
        add(cube(f"KBoot{sx}", (x + 0.11 * sx, y + 0.05, z + 0.045), (0.12, 0.2, 0.08), M["boot"], 0.025))
        add(cube(f"KBootTrim{sx}", (x + 0.11 * sx, y + 0.05, z + 0.09), (0.125, 0.18, 0.03), M["gold"], 0.01))

    return parts


# ---------------------------------------------------------------------------
# Enemies — layered armor, rivets, varied pose
# ---------------------------------------------------------------------------

def make_enemy(x, y, z, idx, M, yaw=0.0, scale=1.0):
    s = scale
    parts = []

    def add(o):
        parts.append(o)
        return o

    # body plates
    add(cube(f"ETorso{idx}", (x, y, z + 0.45 * s), (0.32 * s, 0.26 * s, 0.34 * s), M["red"], 0.035, 1))
    add(cube(f"EChestPlate{idx}", (x, y - 0.12 * s, z + 0.5 * s), (0.26 * s, 0.05 * s, 0.22 * s), M["red_bright"], 0.02))
    add(cube(f"EAbdomen{idx}", (x, y, z + 0.3 * s), (0.3 * s, 0.24 * s, 0.1 * s), M["red_dark"], 0.02))
    # shoulders
    for sx in (-1, 1):
        add(sphere(f"EShoulder{idx}_{sx}", (x + 0.22 * sx * s, y, z + 0.6 * s), 0.1 * s, M["red_dark"], scale=(1.15, 0.95, 0.75), seg=20))
        add(cube(f"EPauldron{idx}_{sx}", (x + 0.26 * sx * s, y, z + 0.62 * s), (0.08 * s, 0.12 * s, 0.1 * s), M["red"], 0.02))

    # head + helmet + crest
    add(sphere(f"EHead{idx}", (x, y, z + 0.76 * s), 0.16 * s, M["skin"], seg=24))
    add(sphere(f"EHelm{idx}", (x, y, z + 0.86 * s), 0.185 * s, M["red_dark"], scale=(1.08, 1.08, 0.72), seg=24))
    add(cube(f"EVisor{idx}", (x, y - 0.15 * s, z + 0.8 * s), (0.12 * s, 0.035 * s, 0.05 * s), M["eye_w"], 0.008))
    # curved crest (stacked cubes + cone)
    add(cube(f"ECrestBase{idx}", (x, y, z + 1.0 * s), (0.035 * s, 0.05 * s, 0.12 * s), M["gold"], 0.008))
    add(cone(f"ECrestTip{idx}", (x, y + 0.02 * s, z + 1.12 * s), 0.04 * s, 0.1 * s, M["gold"], 10))
    # cheek guards
    for sx in (-1, 1):
        add(cube(f"ECheek{idx}_{sx}", (x + 0.12 * sx * s, y - 0.05 * s, z + 0.78 * s), (0.04 * s, 0.08 * s, 0.1 * s), M["red_dark"], 0.01))

    # shield with boss + rivets
    add(cube(f"EShield{idx}", (x - 0.3 * s, y - 0.02 * s, z + 0.48 * s), (0.05 * s, 0.26 * s, 0.34 * s), M["red_dark"], 0.025, 1))
    add(cyl(f"EBoss{idx}", (x - 0.34 * s, y - 0.02 * s, z + 0.48 * s), 0.055 * s, 0.035 * s, M["gold"], rot=(0, math.radians(90), 0), bev=0.005))
    # rivets as tiny spheres
    for ri, (rx, rz) in enumerate([(-0.08, 0.1), (0.08, 0.1), (-0.08, -0.1), (0.08, -0.1), (0, 0.14), (0, -0.14)]):
        add(sphere(f"ERiv{idx}_{ri}", (x - 0.33 * s, y - 0.02 * s + rx * s, z + 0.48 * s + rz * s), 0.015 * s, M["gold"], seg=8))

    # sword with crossguard + pommel
    blade_yaw = yaw + random.uniform(-0.15, 0.15)
    add(cube(f"EBlade{idx}", (x + 0.28 * s, y, z + 0.55 * s), (0.035 * s, 0.035 * s, 0.4 * s), M["steel"], 0.008))
    add(cube(f"EGuard{idx}", (x + 0.28 * s, y, z + 0.34 * s), (0.14 * s, 0.04 * s, 0.035 * s), M["gold"], 0.01))
    add(cyl(f"EHilt{idx}", (x + 0.28 * s, y, z + 0.28 * s), 0.025 * s, 0.1 * s, M["boot"], bev=0.005))
    add(sphere(f"EPommel{idx}", (x + 0.28 * s, y, z + 0.22 * s), 0.035 * s, M["gold"], seg=12))

    # arms
    for sx in (-1, 1):
        ang = math.radians(55 * sx + random.uniform(-10, 10))
        add(cyl(f"EArm{idx}_{sx}", (x + 0.32 * sx * s, y, z + 0.48 * s), 0.07 * s, 0.22 * s, M["red"], rot=(0, ang, 0), bev=0.01))
        add(sphere(f"EHand{idx}_{sx}", (x + 0.42 * sx * s, y - 0.02 * s, z + 0.38 * s), 0.06 * s, M["skin"], seg=12))

    # legs + boots (slight pose variation)
    for sx in (-1, 1):
        leg_fwd = random.uniform(-0.03, 0.05) * s
        add(cube(f"EThigh{idx}_{sx}", (x + 0.09 * sx * s, y + leg_fwd, z + 0.18 * s), (0.09 * s, 0.11 * s, 0.14 * s), M["red_dark"], 0.02))
        add(cube(f"EBoot{idx}_{sx}", (x + 0.09 * sx * s, y + leg_fwd + 0.03 * s, z + 0.045 * s), (0.1 * s, 0.15 * s, 0.07 * s), M["boot"], 0.018))

    # Pose via parent (geometry already baked with `s` scale)
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(x, y, z))
    root = bpy.context.active_object
    root.name = f"ERoot{idx}"
    for p in parts:
        p.parent = root
        p.matrix_parent_inverse = root.matrix_world.inverted()
    root.rotation_euler = (
        math.radians(random.uniform(-6, 8)),
        math.radians(random.uniform(-4, 4)),
        yaw,
    )
    return root


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

def dense_fence(M):
    posts = 24
    for i in range(posts):
        t = i / (posts - 1)
        x = -6.2 + t * 13.0
        y = 4.8 - t * 10.8
        damaged = i in (10, 11, 12)
        h = 0.55 if damaged else 1.2
        p = cube(f"Post{i}", (x, y, h / 2), (0.11, 0.11, h), M["wood"], 0.018)
        p.rotation_euler = (0, 0, math.radians(-38))
        bpy.ops.object.transform_apply(rotation=True)
        if not damaged:
            cone(f"Tip{i}", (x, y, h + 0.12), 0.09, 0.24, M["wood"], 12)
            # rope bindings at rail heights
            for zh in (0.35, 0.65, 0.95):
                torus(f"Rope{i}_{zh}", (x, y, zh), 0.09, 0.018, M["rope"], rot=(math.radians(90), 0, math.radians(-38)))
        else:
            cube(f"Splint{i}", (x + 0.12, y - 0.08, 0.22), (0.07, 0.07, 0.32), M["wood"], 0.01)
            # fallen piece
            fallen = cube(f"Fallen{i}", (x + 0.35, y - 0.25, 0.08), (0.1, 0.1, 0.45), M["wood_dark"], 0.01)
            fallen.rotation_euler = (math.radians(70), 0, math.radians(20))
            bpy.ops.object.transform_apply(rotation=True)

    # rails between posts
    for i in range(posts - 1):
        if i in (9, 10, 11, 12):
            continue
        t0 = i / (posts - 1)
        t1 = (i + 1) / (posts - 1)
        x0, y0 = -6.2 + t0 * 13.0, 4.8 - t0 * 10.8
        x1, y1 = -6.2 + t1 * 13.0, 4.8 - t1 * 10.8
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        for zh in (0.35, 0.65, 0.95):
            rail = cube(f"Rail{i}_{zh}", (mx, my, zh), (0.4, 0.045, 0.045), M["wood_dark"], 0.008)
            rail.rotation_euler = (0, 0, math.radians(-38))
            bpy.ops.object.transform_apply(rotation=True)


def watchtower(M):
    bx, by = -2.7, 2.6
    # legs
    for ox, oy in [(-0.55, -0.55), (0.55, -0.55), (-0.55, 0.55), (0.55, 0.55)]:
        cyl(f"TLeg_{ox}_{oy}", (bx + ox, by + oy, 1.05), 0.09, 2.1, M["wood_dark"], bev=0.012, verts=16)
    # cross-bracing X on each face
    for face, (dx, dy, rx) in enumerate([
        (0, -0.55, 0), (0, 0.55, 0), (-0.55, 0, 90), (0.55, 0, 90)
    ]):
        for k, zh in enumerate((0.55, 1.35)):
            brace = cube(f"XBrace{face}_{k}", (bx + dx * 0.5, by + dy * 0.5, zh), (0.85, 0.05, 0.05), M["wood"], 0.008)
            brace.rotation_euler = (0, math.radians(28 if k == 0 else -28), math.radians(rx))
            bpy.ops.object.transform_apply(rotation=True)
    # deck with planks
    cube("TDeck", (bx, by, 2.1), (1.35, 1.35, 0.14), M["wood"], 0.025, 1)
    for i in range(-3, 4):
        cube(f"TPlank{i}", (bx, by + i * 0.18, 2.18), (1.25, 0.07, 0.025), M["wood_dark"], 0.004)
    # railings
    for side, dx, dy, sx, sy in [
        ("N", 0, 0.62, 1.25, 0.07), ("S", 0, -0.62, 1.25, 0.07),
        ("E", 0.62, 0, 0.07, 1.25), ("W", -0.62, 0, 0.07, 1.25),
    ]:
        cube(f"TRail{side}", (bx + dx, by + dy, 2.45), (sx, sy, 0.32), M["wood"], 0.015)
        for k in (-0.4, 0, 0.4):
            if side in ("N", "S"):
                cyl(f"TRP{side}{k}", (bx + k, by + dy, 2.55), 0.035, 0.22, M["wood_dark"], verts=12)
            else:
                cyl(f"TRP{side}{k}", (bx + dx, by + k, 2.55), 0.035, 0.22, M["wood_dark"], verts=12)
    # ladder
    cyl("LadL", (bx + 0.78, by - 0.16, 1.05), 0.035, 2.1, M["wood_dark"], verts=12)
    cyl("LadR", (bx + 0.78, by + 0.16, 1.05), 0.035, 2.1, M["wood_dark"], verts=12)
    for i in range(8):
        cube(f"LadRung{i}", (bx + 0.78, by, 0.2 + i * 0.25), (0.06, 0.32, 0.04), M["wood"], 0.008)


def terrain_and_props(M):
    # continuous sand base + grass pad
    cube("SandBase", (1.8, -1.8, -0.1), (18, 18, 0.18), M["sand"], 0.004)
    cube("GrassPad", (-2.4, 2.6, 0.03), (10, 10, 0.1), M["grass"], 0.004)
    # soft blend strip
    cube("Blend", (0.2, 0.4, 0.04), (3.5, 12, 0.06), M["sand"], 0.004)

    # grass tufts
    for i in range(40):
        gx = -2.4 + random.uniform(-4.5, 4.5)
        gy = 2.6 + random.uniform(-4.5, 4.5)
        h = random.uniform(0.12, 0.28)
        cone(f"Tuft{i}", (gx, gy, h / 2), random.uniform(0.04, 0.1), h, M["grass"], 8)
        if i % 3 == 0:
            cone(f"TuftB{i}", (gx + 0.05, gy - 0.04, h / 2 * 0.8), 0.035, h * 0.8, M["grass"], 7)

    # rocks
    for i in range(12):
        rx = random.uniform(1.5, 7)
        ry = random.uniform(-5, 1)
        rr = random.uniform(0.12, 0.38)
        sphere(f"Rock{i}", (rx, ry, rr * 0.4), rr, M["rock"],
               scale=(1, random.uniform(0.8, 1.2), random.uniform(0.45, 0.75)), seg=16)

    # gold coins scattered
    for j, pos in enumerate([(3.9, -1.1), (4.4, -1.6), (3.2, -2.1), (4.8, -0.7), (2.6, -1.4)]):
        c = cyl(f"Coin{j}", (*pos, 0.08), 0.16, 0.04, M["coin"], bev=0.008, verts=24)
        c.rotation_euler = (math.radians(random.uniform(-15, 15)), math.radians(random.uniform(-10, 10)), 0)
        bpy.ops.object.transform_apply(rotation=True)

    # build pad with coin icon
    cube("BuildPad", (-4.1, 0.85, 0.08), (1.0, 1.0, 0.1), M["wood"], 0.025, 1)
    for edge in [(-0.42, 0), (0.42, 0), (0, -0.42), (0, 0.42)]:
        cube(f"PadEdge{edge}", (-4.1 + edge[0], 0.85 + edge[1], 0.14), (0.12 if edge[0] else 0.85, 0.85 if edge[0] else 0.12, 0.04), M["wood_dark"], 0.008)
    cyl("PadCoin", (-4.1, 0.85, 0.25), 0.22, 0.07, M["coin"], bev=0.012, verts=24)

    # selection aura + brackets under king
    kx, ky = -0.85, 1.25
    bpy.ops.mesh.primitive_torus_add(major_radius=0.9, minor_radius=0.04, location=(kx, ky, 0.07), major_segments=48, minor_segments=12)
    aura = bpy.context.active_object
    aura.name = "Aura"
    aura.data.materials.append(M["aura"])
    # glow disc
    bpy.ops.mesh.primitive_cylinder_add(radius=0.85, depth=0.02, location=(kx, ky, 0.05), vertices=48)
    disc = bpy.context.active_object
    disc.name = "AuraDisc"
    disc.data.materials.append(M["aura"])
    for ox, oy in [(-0.58, -0.58), (0.58, -0.58), (-0.58, 0.58), (0.58, 0.58)]:
        cube(f"BrA{ox}", (kx + ox, ky + oy, 0.06), (0.15, 0.035, 0.025), M["white"], 0.004)
        cube(f"BrB{ox}", (kx + ox, ky + oy, 0.06), (0.035, 0.15, 0.025), M["white"], 0.004)

    # HP bars
    def hp_bar(name, loc, w=0.55):
        cube(f"{name}_bg", loc, (w + 0.04, 0.1, 0.08), M["hp_bg"], 0.008)
        cube(name, (loc[0], loc[1], loc[2] + 0.01), (w, 0.07, 0.06), M["hp"], 0.008)

    hp_bar("HPKing", (kx, ky, 1.9), 0.55)
    hp_bar("HPTower", (-2.7, 2.6, 2.85), 0.6)
    hp_bar("HPFence", (0.6, 1.7, 1.45), 0.42)


# ---------------------------------------------------------------------------
# Cameras & render
# ---------------------------------------------------------------------------

def setup_iso_camera(sc):
    bpy.ops.object.empty_add(location=(0.4, -0.3, 0.5))
    tgt = bpy.context.active_object
    tgt.name = "CamTarget"
    bpy.ops.object.camera_add(location=(13, -13, 11))
    cam = bpy.context.active_object
    cam.name = "IsoCam"
    sc.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 15.0
    cam.data.clip_end = 200
    con = cam.constraints.new("TRACK_TO")
    con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    return cam, tgt


def setup_king_camera(sc, kx=-0.85, ky=1.25, kz=0.7):
    bpy.ops.object.empty_add(location=(kx, ky - 0.05, kz + 0.55))
    tgt = bpy.context.active_object
    tgt.name = "KingCamTarget"
    # closer 3/4 hero portrait
    bpy.ops.object.camera_add(location=(kx + 1.35, ky - 1.85, kz + 1.35))
    cam = bpy.context.active_object
    cam.name = "KingCam"
    sc.camera = cam
    cam.data.type = "PERSP"
    cam.data.lens = 70
    cam.data.clip_end = 100
    con = cam.constraints.new("TRACK_TO")
    con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    return cam


def build_scene():
    sc = reset(1920, 1080, 250)
    lights()
    M = make_mats()
    terrain_and_props(M)
    dense_fence(M)
    watchtower(M)
    make_king(-0.85, 1.25, 0.0, M)

    # 14 enemies with varied poses
    enemy_spots = []
    for i in range(14):
        t = 0.35 + (i / 13) * 0.55 + random.uniform(-0.05, 0.05)
        x = -6.2 + t * 13.0 + random.uniform(1.1, 3.4)
        y = 4.8 - t * 10.8 - random.uniform(0.6, 2.9)
        yaw = math.radians(random.uniform(-35, 35) + (-38))  # face toward fence roughly
        scl = random.uniform(0.88, 1.08)
        enemy_spots.append((x, y, i, yaw, scl))
    for x, y, i, yaw, scl in enemy_spots:
        make_enemy(x, y, 0.0, i, M, yaw=yaw, scale=scl)

    return sc, M


def render_battle(sc):
    setup_iso_camera(sc)
    sc.render.resolution_x = 1920
    sc.render.resolution_y = 1080
    sc.cycles.samples = 256
    path = OUT / "battle_heavy"
    sc.render.filepath = str(path)
    print("RENDER_BATTLE_START")
    bpy.ops.render.render(write_still=True)
    print("RENDER_BATTLE_DONE", path.with_suffix(".png"))


def render_king_closeup(sc):
    # hide distant clutter a bit? keep all for context but frame king
    setup_king_camera(sc)
    sc.render.resolution_x = 1200
    sc.render.resolution_y = 1200
    sc.cycles.samples = 270
    path = OUT / "king_heavy"
    sc.render.filepath = str(path)
    print("RENDER_KING_START")
    bpy.ops.render.render(write_still=True)
    print("RENDER_KING_DONE", path.with_suffix(".png"))


def main():
    print("HEAVY_BUILD_START")
    sc, M = build_scene()
    print("SCENE_BUILT objects=", len(bpy.data.objects))
    render_battle(sc)
    render_king_closeup(sc)
    print("ALL_DONE")


main()
