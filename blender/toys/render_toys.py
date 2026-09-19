"""Three play objects: Cheeky Bot, Tiny Rocket, Scrap Crystal — beauty + GLB each."""
import bpy, math
from pathlib import Path

OUT = Path("/workspace/bot-campus-publish/toys")
OUT.mkdir(parents=True, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 96
    sc.cycles.use_denoising = False
    sc.render.resolution_x = 1200
    sc.render.resolution_y = 1200
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Filmic"
    w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.12, 0.11, 0.14, 1)
    bg.inputs[1].default_value = 0.35
    return sc

def mat_col(name, rgba, rough=0.45, emit=0.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links; n.clear()
    out, bsdf = n.new("ShaderNodeOutputMaterial"), n.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emit
    l.new(bsdf.outputs[0], out.inputs[0]); return m

def lights(sc):
    bpy.ops.object.light_add(type='SUN', location=(4, -3, 8))
    sun = bpy.context.active_object; sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(45), math.radians(15), math.radians(30))
    bpy.ops.object.light_add(type='AREA', location=(-3, 2, 4))
    a = bpy.context.active_object; a.data.energy = 40; a.data.size = 3; a.data.color = (0.6, 0.75, 1)
    bpy.ops.object.light_add(type='AREA', location=(2, 3, 2))
    b = bpy.context.active_object; b.data.energy = 25; b.data.size = 2; b.data.color = (1, 0.85, 0.6)

def cam(sc, loc=(3.2, -3.4, 2.4), target=(0, 0, 0.7)):
    bpy.ops.object.empty_add(location=target); tgt = bpy.context.active_object
    bpy.ops.object.camera_add(location=loc); c = bpy.context.active_object; sc.camera = c
    c.data.lens = 50
    con = c.constraints.new('TRACK_TO'); con.target = tgt
    con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'

def export_glb(path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.select_set(True)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_materials='EXPORT', export_yup=True)

def build_bot():
    body = mat_col("Body", (0.25, 0.55, 0.95, 1), 0.4)
    face = mat_col("Face", (0.2, 0.95, 1.0, 1), 0.2, emit=4)
    metal = mat_col("Ant", (0.9, 0.75, 0.2, 1), 0.25, metal=0.85)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.55)); o = bpy.context.active_object
    o.name = "BotBody"; o.scale = (0.7, 0.55, 0.55); bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(body)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.32, 0.7)); f = bpy.context.active_object
    f.name = "BotFace"; f.scale = (0.45, 0.05, 0.28); bpy.ops.object.transform_apply(scale=True)
    f.data.materials.append(face)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.06, depth=0.35, location=(0, 0, 1.05))
    a = bpy.context.active_object; a.name = "Antenna"; a.data.materials.append(metal)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.1, location=(0, 0, 1.28))
    tip = bpy.context.active_object; tip.name = "AntennaTip"; tip.data.materials.append(mat_col("Tip", (1, 0.3, 0.4, 1), 0.3, emit=2))
    # silly propeller hat
    bpy.ops.mesh.primitive_cylinder_add(radius=0.28, depth=0.08, location=(0, 0, 0.95))
    hat = bpy.context.active_object; hat.name = "Hat"; hat.data.materials.append(mat_col("Hat", (0.95, 0.2, 0.35, 1), 0.45))

def build_rocket():
    hull = mat_col("Hull", (0.92, 0.92, 0.95, 1), 0.35, metal=0.2)
    red = mat_col("Nose", (0.95, 0.2, 0.18, 1), 0.4)
    fin = mat_col("Fin", (0.15, 0.45, 0.95, 1), 0.4)
    flame = mat_col("Flame", (1.0, 0.55, 0.1, 1), 0.3, emit=8)
    bpy.ops.mesh.primitive_cone_add(radius1=0.35, depth=1.4, location=(0, 0, 0.9)); b = bpy.context.active_object
    b.name = "RocketBody"; b.data.materials.append(hull)
    bpy.ops.mesh.primitive_cone_add(radius1=0.35, depth=0.45, location=(0, 0, 1.8)); n = bpy.context.active_object
    n.name = "Nose"; n.data.materials.append(red)
    for i, ang in enumerate([0, 120, 240]):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(math.radians(ang))*0.38, math.sin(math.radians(ang))*0.38, 0.35))
        f = bpy.context.active_object; f.name = f"Fin{i}"
        f.scale = (0.08, 0.28, 0.35); f.rotation_euler = (0, 0, math.radians(ang))
        bpy.ops.object.transform_apply(scale=True, rotation=True); f.data.materials.append(fin)
    bpy.ops.mesh.primitive_cone_add(radius1=0.22, depth=0.5, location=(0, 0, 0.05))
    fl = bpy.context.active_object; fl.name = "Flame"; fl.rotation_euler = (math.radians(180), 0, 0)
    bpy.ops.object.transform_apply(rotation=True); fl.data.materials.append(flame)

def build_crystal():
    gem = mat_col("Gem", (0.55, 0.2, 0.95, 1), 0.15, emit=1.5, metal=0.1)
    gold = mat_col("Base", (0.9, 0.7, 0.2, 1), 0.3, metal=0.9)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.55, location=(0, 0, 0.85))
    c = bpy.context.active_object; c.name = "Crystal"; c.scale = (0.7, 0.7, 1.15)
    bpy.ops.object.transform_apply(scale=True); c.data.materials.append(gem)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=0.18, location=(0, 0, 0.12))
    base = bpy.context.active_object; base.name = "Pedestal"; base.data.materials.append(gold)
    # small orbiting scrap cubes
    scrap = mat_col("Scrap", (0.4, 0.85, 0.95, 1), 0.35, emit=0.8)
    for i, ang in enumerate([30, 150, 270]):
        bpy.ops.mesh.primitive_cube_add(size=0.18, location=(math.cos(math.radians(ang))*0.85, math.sin(math.radians(ang))*0.85, 0.7+0.1*i))
        s = bpy.context.active_object; s.name = f"Scrap{i}"; s.rotation_euler = (0.3*i, 0.2, math.radians(ang))
        bpy.ops.object.transform_apply(rotation=True); s.data.materials.append(scrap)

BUILDERS = [
    ("bot", "Cheeky Bot", build_bot, (2.8, -3.0, 2.0), (0, 0, 0.7)),
    ("rocket", "Tiny Rocket", build_rocket, (3.0, -3.2, 2.2), (0, 0, 1.0)),
    ("crystal", "Scrap Crystal", build_crystal, (2.9, -3.1, 2.1), (0, 0, 0.8)),
]

for key, title, builder, cloc, tgt in BUILDERS:
    print("BUILD", key)
    sc = reset(); lights(sc); builder(); cam(sc, cloc, tgt)
    sc.render.filepath = str(OUT / f"{key}_beauty")
    bpy.ops.render.render(write_still=True)
    export_glb(OUT / f"{key}.glb")
    print("DONE", key, title)

print("ALL_DONE")
