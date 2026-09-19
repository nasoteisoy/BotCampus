"""Toy Box v2 — richer meshes, studio lighting, higher-quality Cycles."""
import bpy, math, bmesh
from pathlib import Path
from mathutils import Vector, Matrix

OUT = Path("/workspace/bot-campus-publish/toys")
OUT.mkdir(parents=True, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 192
    sc.cycles.use_denoising = False  # OIDN often missing
    sc.render.resolution_x = 1400
    sc.render.resolution_y = 1400
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Filmic"
    sc.view_settings.look = "Medium High Contrast"
    w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
    nt = w.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.08, 0.07, 0.10, 1)
    bg.inputs[1].default_value = 0.25
    nt.links.new(bg.outputs[0], out.inputs[0])
    return sc

def mat(name, rgba, rough=0.4, emit=0.0, metal=0.0, spec=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links; n.clear()
    outn = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = spec
    if emit:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emit
    l.new(bsdf.outputs[0], outn.inputs[0])
    return m

def bevel(obj, width=0.03, segments=3):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width; mod.segments = segments; mod.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier="Bevel")

def shade_smooth(obj, auto=True):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    if auto and hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(40)

def lights(sc):
    bpy.ops.object.light_add(type="AREA", location=(3.5, -2.5, 4.5))
    key = bpy.context.active_object
    key.data.energy = 250; key.data.size = 2.2; key.data.color = (1, 0.96, 0.9)
    key.rotation_euler = (math.radians(50), math.radians(15), math.radians(35))

    bpy.ops.object.light_add(type="AREA", location=(-3.2, 1.5, 3.2))
    fill = bpy.context.active_object
    fill.data.energy = 90; fill.data.size = 3.5; fill.data.color = (0.55, 0.7, 1.0)
    fill.rotation_euler = (math.radians(60), math.radians(-20), math.radians(-40))

    bpy.ops.object.light_add(type="AREA", location=(0, 3.5, 1.5))
    rim = bpy.context.active_object
    rim.data.energy = 120; rim.data.size = 2.0; rim.data.color = (1.0, 0.7, 0.85)
    rim.rotation_euler = (math.radians(85), 0, math.radians(180))

    # soft bounce from below
    bpy.ops.object.light_add(type="AREA", location=(0, 0, -0.4))
    bounce = bpy.context.active_object
    bounce.data.energy = 30; bounce.data.size = 4; bounce.data.color = (0.8, 0.75, 0.9)
    bounce.rotation_euler = (0, 0, 0)

def cam(sc, loc=(3.4, -3.6, 2.3), target=(0, 0, 0.75)):
    bpy.ops.object.empty_add(location=target); tgt = bpy.context.active_object
    bpy.ops.object.camera_add(location=loc); c = bpy.context.active_object
    sc.camera = c; c.data.lens = 55; c.data.dof.use_dof = False
    con = c.constraints.new("TRACK_TO"); con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"; con.up_axis = "UP_Y"

def export_glb(path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.select_set(True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_materials="EXPORT", export_yup=True,
        export_normals=True,
    )

# ---------- Cheeky Bot v2 ----------
def build_bot():
    body_m = mat("BotBody", (0.22, 0.52, 0.98, 1), rough=0.35)
    belly_m = mat("Belly", (0.35, 0.65, 1.0, 1), rough=0.4)
    face_m = mat("Face", (0.15, 0.95, 1.0, 1), rough=0.15, emit=3.5)
    metal_m = mat("Gold", (0.95, 0.75, 0.2, 1), rough=0.2, metal=0.9)
    hat_m = mat("Hat", (0.95, 0.18, 0.4, 1), rough=0.4)
    tip_m = mat("Tip", (1.0, 0.45, 0.7, 1), rough=0.25, emit=2.5)
    foot_m = mat("Foot", (0.12, 0.2, 0.45, 1), rough=0.5)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.62))
    body = bpy.context.active_object; body.name = "BotBody"
    body.scale = (0.78, 0.62, 0.62); bpy.ops.object.transform_apply(scale=True)
    bevel(body, 0.06, 4); shade_smooth(body); body.data.materials.append(body_m)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.28, location=(0, -0.18, 0.55))
    belly = bpy.context.active_object; belly.name = "Belly"
    belly.scale = (1.1, 0.7, 0.95); bpy.ops.object.transform_apply(scale=True)
    shade_smooth(belly); belly.data.materials.append(belly_m)

    # face screen (inset)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.34, 0.78))
    face = bpy.context.active_object; face.name = "BotFace"
    face.scale = (0.42, 0.04, 0.26); bpy.ops.object.transform_apply(scale=True)
    bevel(face, 0.02, 2); face.data.materials.append(face_m)

    # eyes as dark dots on a separate thin plane? use two spheres
    eye_m = mat("Eye", (0.05, 0.08, 0.12, 1), rough=0.2)
    for x in (-0.12, 0.12):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, location=(x, -0.37, 0.82))
        e = bpy.context.active_object; e.name = f"Eye{x}"; shade_smooth(e)
        e.data.materials.append(eye_m)

    # smile — small torus segment approx with scaled sphere
    bpy.ops.mesh.primitive_torus_add(major_radius=0.1, minor_radius=0.018, location=(0, -0.37, 0.7))
    smile = bpy.context.active_object; smile.name = "Smile"
    smile.rotation_euler = (math.radians(90), 0, 0); smile.scale = (1, 0.45, 1)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    smile.data.materials.append(eye_m)

    # propeller beanie
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.42, location=(0, 0, 1.05))
    hat = bpy.context.active_object; hat.name = "Hat"
    hat.scale = (1, 1, 0.45); bpy.ops.object.transform_apply(scale=True)
    # cut bottom by scaling — just squash
    shade_smooth(hat); hat.data.materials.append(hat_m)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.045, depth=0.4, location=(0, 0, 1.35))
    ant = bpy.context.active_object; ant.name = "Antenna"
    bevel(ant, 0.01, 2); shade_smooth(ant); ant.data.materials.append(metal_m)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(0, 0, 1.58))
    tip = bpy.context.active_object; tip.name = "Tip"; shade_smooth(tip)
    tip.data.materials.append(tip_m)

    # propeller blades
    blade_m = mat("Blade", (0.95, 0.9, 0.3, 1), rough=0.35)
    for ang in (0, 90):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.58))
        bl = bpy.context.active_object; bl.name = f"Blade{ang}"
        bl.scale = (0.55, 0.08, 0.02); bl.rotation_euler = (0, 0, math.radians(ang))
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        bevel(bl, 0.01, 2); bl.data.materials.append(blade_m)

    # stubby feet
    for x in (-0.28, 0.28):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0.05, 0.12))
        f = bpy.context.active_object; f.name = f"Foot{x}"
        f.scale = (0.22, 0.32, 0.14); bpy.ops.object.transform_apply(scale=True)
        bevel(f, 0.04, 3); shade_smooth(f); f.data.materials.append(foot_m)

    # arms
    arm_m = body_m
    for x, s in ((-0.55, 1), (0.55, -1)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.1, depth=0.35, location=(x, 0, 0.55))
        a = bpy.context.active_object; a.name = f"Arm{x}"
        a.rotation_euler = (0, math.radians(70*s), 0)
        bpy.ops.object.transform_apply(rotation=True)
        bevel(a, 0.02, 2); shade_smooth(a); a.data.materials.append(arm_m)

# ---------- Tiny Rocket v2 ----------
def build_rocket():
    hull_m = mat("Hull", (0.94, 0.94, 0.97, 1), rough=0.28, metal=0.15)
    stripe_m = mat("Stripe", (0.95, 0.25, 0.2, 1), rough=0.35)
    nose_m = mat("Nose", (0.95, 0.22, 0.2, 1), rough=0.3)
    fin_m = mat("Fin", (0.15, 0.45, 0.98, 1), rough=0.35)
    window_m = mat("Window", (0.4, 0.85, 1.0, 1), rough=0.1, emit=1.2, metal=0.2)
    flame_m = mat("Flame", (1.0, 0.55, 0.12, 1), rough=0.35, emit=6)
    flame2_m = mat("FlameCore", (1.0, 0.95, 0.6, 1), rough=0.2, emit=10)
    ring_m = mat("Ring", (0.85, 0.7, 0.25, 1), rough=0.25, metal=0.8)

    # body as elongated UV sphere + cone stack
    bpy.ops.mesh.primitive_cylinder_add(radius=0.32, depth=1.15, location=(0, 0, 0.95))
    body = bpy.context.active_object; body.name = "RocketBody"
    # taper with lattice-ish: scale top via shapekey skip — use cone for upper
    bevel(body, 0.02, 2); shade_smooth(body); body.data.materials.append(hull_m)

    bpy.ops.mesh.primitive_cone_add(radius1=0.32, radius2=0.02, depth=0.7, location=(0, 0, 1.85))
    nose = bpy.context.active_object; nose.name = "Nose"
    shade_smooth(nose); nose.data.materials.append(nose_m)

    # red stripe ring
    bpy.ops.mesh.primitive_torus_add(major_radius=0.325, minor_radius=0.035, location=(0, 0, 1.15))
    stripe = bpy.context.active_object; stripe.name = "Stripe"
    shade_smooth(stripe); stripe.data.materials.append(stripe_m)

    # porthole
    bpy.ops.mesh.primitive_cylinder_add(radius=0.11, depth=0.08, location=(0, -0.30, 1.15))
    win = bpy.context.active_object; win.name = "Window"
    win.rotation_euler = (math.radians(90), 0, 0); bpy.ops.object.transform_apply(rotation=True)
    shade_smooth(win); win.data.materials.append(window_m)

    # gold collar
    bpy.ops.mesh.primitive_torus_add(major_radius=0.33, minor_radius=0.025, location=(0, 0, 0.55))
    collar = bpy.context.active_object; collar.name = "Collar"
    shade_smooth(collar); collar.data.materials.append(ring_m)

    # fins — swept wedges
    for i, ang in enumerate([0, 120, 240]):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.45))
        fin = bpy.context.active_object; fin.name = f"Fin{i}"
        fin.scale = (0.06, 0.42, 0.38)
        # move out then rotate
        bpy.ops.object.transform_apply(scale=True)
        fin.location = (
            math.cos(math.radians(ang)) * 0.38,
            math.sin(math.radians(ang)) * 0.38,
            0.42,
        )
        fin.rotation_euler = (math.radians(12), 0, math.radians(ang))
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        bevel(fin, 0.015, 2); shade_smooth(fin); fin.data.materials.append(fin_m)

    # nozzle
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.18, location=(0, 0, 0.28))
    noz = bpy.context.active_object; noz.name = "Nozzle"
    shade_smooth(noz); noz.data.materials.append(mat("Nozzle", (0.25, 0.25, 0.28, 1), rough=0.4, metal=0.7))

    bpy.ops.mesh.primitive_cone_add(radius1=0.2, depth=0.55, location=(0, 0, 0.0))
    fl = bpy.context.active_object; fl.name = "Flame"
    fl.rotation_euler = (math.radians(180), 0, 0); bpy.ops.object.transform_apply(rotation=True)
    shade_smooth(fl); fl.data.materials.append(flame_m)

    bpy.ops.mesh.primitive_cone_add(radius1=0.1, depth=0.4, location=(0, 0, 0.05))
    fl2 = bpy.context.active_object; fl2.name = "FlameCore"
    fl2.rotation_euler = (math.radians(180), 0, 0); bpy.ops.object.transform_apply(rotation=True)
    shade_smooth(fl2); fl2.data.materials.append(flame2_m)

# ---------- Scrap Crystal v2 ----------
def build_crystal():
    gem_m = mat("Gem", (0.62, 0.25, 0.98, 1), rough=0.08, emit=0.9, metal=0.05, spec=1.0)
    # glassier: lower roughness
    core_m = mat("Core", (0.85, 0.55, 1.0, 1), rough=0.05, emit=2.0)
    gold_m = mat("GoldBase", (0.92, 0.72, 0.22, 1), rough=0.22, metal=0.95)
    scrap_m = mat("Scrap", (0.35, 0.9, 1.0, 1), rough=0.25, emit=1.2, metal=0.3)
    scrap2_m = mat("Scrap2", (1.0, 0.55, 0.2, 1), rough=0.3, emit=0.8, metal=0.4)

    # main crystal — elongated icosphere with pointier scale
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.55, location=(0, 0, 0.95))
    gem = bpy.context.active_object; gem.name = "Crystal"
    gem.scale = (0.55, 0.55, 1.35); bpy.ops.object.transform_apply(scale=True)
    # slight twist
    bpy.ops.object.modifier_add(type="SIMPLE_DEFORM")
    gem.modifiers["SimpleDeform"].deform_method = "TWIST"
    gem.modifiers["SimpleDeform"].angle = math.radians(25)
    bpy.ops.object.modifier_apply(modifier="SimpleDeform")
    shade_smooth(gem); gem.data.materials.append(gem_m)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.22, location=(0, 0, 0.95))
    core = bpy.context.active_object; core.name = "Core"
    core.scale = (0.5, 0.5, 1.1); bpy.ops.object.transform_apply(scale=True)
    shade_smooth(core); core.data.materials.append(core_m)

    # ornate pedestal
    bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=0.14, location=(0, 0, 0.1))
    base = bpy.context.active_object; base.name = "Pedestal"
    bevel(base, 0.03, 3); shade_smooth(base); base.data.materials.append(gold_m)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.42, minor_radius=0.04, location=(0, 0, 0.2))
    rim = bpy.context.active_object; rim.name = "Rim"
    shade_smooth(rim); rim.data.materials.append(gold_m)

    # orbiting scraps — varied
    mats = [scrap_m, scrap2_m, scrap_m]
    shapes = ["cube", "ico", "cone"]
    for i, ang in enumerate([20, 140, 260]):
        r = 0.95; z = 0.65 + 0.15 * (i % 3)
        loc = (math.cos(math.radians(ang)) * r, math.sin(math.radians(ang)) * r, z)
        if shapes[i] == "cube":
            bpy.ops.mesh.primitive_cube_add(size=0.2, location=loc)
        elif shapes[i] == "ico":
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.12, location=loc)
        else:
            bpy.ops.mesh.primitive_cone_add(radius1=0.1, depth=0.22, location=loc)
        s = bpy.context.active_object; s.name = f"Scrap{i}"
        s.rotation_euler = (0.4 * i, 0.3, math.radians(ang + 20))
        bpy.ops.object.transform_apply(rotation=True)
        if shapes[i] == "cube":
            bevel(s, 0.02, 2)
        shade_smooth(s); s.data.materials.append(mats[i])

BUILDERS = [
    ("bot", "Cheeky Bot", build_bot, (3.2, -3.4, 2.2), (0, 0, 0.85)),
    ("rocket", "Tiny Rocket", build_rocket, (3.3, -3.5, 2.4), (0, 0, 1.05)),
    ("crystal", "Scrap Crystal", build_crystal, (3.2, -3.4, 2.2), (0, 0, 0.9)),
]

for key, title, builder, cloc, tgt in BUILDERS:
    print("BUILD", key)
    sc = reset(); lights(sc); builder(); cam(sc, cloc, tgt)
    sc.render.filepath = str(OUT / f"{key}_beauty")
    bpy.ops.render.render(write_still=True)
    print("BEAUTY", key)
    export_glb(OUT / f"{key}.glb")
    print("DONE", key, title)

print("ALL_DONE")
