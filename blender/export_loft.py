"""Cozy loft for Bot Office: Cycles beauty + textured GLB matching loft-ref vibe."""
import bpy, math
from pathlib import Path

ROOT = Path("/workspace/bot-campus-publish")
OUT, BLEND = ROOT / "baked", ROOT / "blender"
OUT.mkdir(exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 160
scene.cycles.use_denoising = False
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUT / "loft_beauty")
scene.view_settings.view_transform = "Filmic"
scene.view_settings.look = "Medium High Contrast"

# Warm loft world
world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
nt = world.node_tree; nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputWorld")
bg = nt.nodes.new("ShaderNodeBackground")
bg.inputs[0].default_value = (0.55, 0.42, 0.30, 1)
bg.inputs[1].default_value = 0.25
nt.links.new(bg.outputs[0], out.inputs[0])

def load(p):
    return bpy.data.images.load(str(p))

def mat_img(name, img, rough=0.75, scale=(4, 4)):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links; n.clear()
    outn = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    tex = n.new("ShaderNodeTexImage"); tex.image = img
    mapn = n.new("ShaderNodeMapping"); mapn.inputs["Scale"].default_value = (scale[0], scale[1], 1)
    tc = n.new("ShaderNodeTexCoord")
    l.new(tc.outputs["UV"], mapn.inputs["Vector"])
    l.new(mapn.outputs["Vector"], tex.inputs["Vector"])
    l.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    l.new(bsdf.outputs[0], outn.inputs[0])
    return m

def mat_col(name, rgba, rough=0.5, emit=0.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links; n.clear()
    outn = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emit
    l.new(bsdf.outputs[0], outn.inputs[0])
    return m

wood = mat_img("Wood", load(BLEND / "wood-floor.png"), 0.82, (6, 5))
brick = mat_img("Brick", load(BLEND / "brick.png"), 0.9, (5, 2.2))
plaster = mat_col("Plaster", (0.92, 0.88, 0.80, 1), 0.85)
wood_dark = mat_col("WoodDark", (0.35, 0.22, 0.12, 1), 0.7)
metal = mat_col("Metal", (0.45, 0.45, 0.48, 1), 0.35, metal=0.7)
glass = mat_col("GlassWarm", (1.0, 0.92, 0.75, 1), 0.15, emit=1.2)
screen = mat_col("Screen", (0.25, 0.75, 1.0, 1), 0.2, emit=2.5)
plant = mat_col("Plant", (0.15, 0.55, 0.22, 1), 0.65)
potm = mat_col("Pot", (0.72, 0.62, 0.48, 1), 0.8)
sticky_y = mat_col("StickyY", (1.0, 0.92, 0.35, 1), 0.55)
sticky_p = mat_col("StickyP", (1.0, 0.55, 0.75, 1), 0.55)
sticky_b = mat_col("StickyB", (0.45, 0.78, 1.0, 1), 0.55)
cardboard = mat_col("Cardboard", (0.72, 0.55, 0.32, 1), 0.85)

desk_colors = [
    (0.08, 0.55, 0.72, 1),   # teal
    (0.95, 0.45, 0.12, 1),   # orange PLAN
    (0.92, 0.25, 0.45, 1),   # pink
    (0.55, 0.28, 0.85, 1),   # purple
    (0.82, 0.68, 0.42, 1),   # leader wood-ish
]
desk_mats = [mat_col(f"Desk{i}", c, 0.45) for i, c in enumerate(desk_colors)]

def cube(name, loc, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    if o.data.materials:
        o.data.materials[0] = mat
    else:
        o.data.materials.append(mat)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return o

# --- Room shell (Z-up Blender) ---
# Floor thick platform
cube("Floor", (0, 0, 0), (11, 9, 0.2), wood)
# Walls sit on floor (bottom at z≈0.2)
cube("WallBack", (0, -8.9, 2.7), (11.2, 0.4, 3.1), brick)  # extends below floor
cube("WallLeft", (-10.9, 0, 2.7), (0.4, 9.1, 3.1), plaster)
cube("WallRight", (10.9, 0, 2.7), (0.4, 9.1, 3.1), brick)
# Front half-wall / railing so room feels enclosed from overseer view
cube("WallFrontLow", (0, 8.9, 0.55), (11.0, 0.25, 0.55), wood_dark)
# No full ceiling slab — blocks overseer god-view in Three.js
# Corner posts
for i,(x,y) in enumerate([(-10.7,-8.7),(10.7,-8.7),(-10.7,8.7),(10.7,8.7)]):
    cube(f"Post{i}", (x,y,2.9), (0.28,0.28,2.9), wood_dark)
for i, y in enumerate([-5.5, -2, 1.5, 5]):
    cube(f"Beam{i}", (0, y, 5.05), (10.5, 0.22, 0.28), wood_dark)
# Industrial pipes
cube("PipeMain", (0, -1, 4.7), (9.5, 0.14, 0.14), metal)
cube("PipeDrop", (6.5, -1, 4.2), (0.12, 0.12, 0.7), metal)

# Warm window lights on right brick wall
for i in range(4):
    for j in range(2):
        cube(f"Win{i}{j}", (10.7, -5.2 + i * 2.5, 1.7 + j * 1.55), (0.06, 0.7, 0.75), glass)

# Colorful desks + monitors + mugs (no bots — game adds those)
desk_layout = [
    (-4.5, 1.2, 0, "TEAL"),
    (-1.2, 2.0, 1, "PLAN"),
    (2.0, 1.5, 2, "PINK"),
    (5.0, 0.8, 3, "PURP"),
    (3.2, -4.0, 4, "LEAD"),  # leader desk forward
]
for i, (x, y, di, _lab) in enumerate(desk_layout):
    cube(f"Desk{i}", (x, y, 0.55), (0.95, 0.62, 0.55), desk_mats[di])
    # desktop surface wood top
    cube(f"Top{i}", (x, y, 1.12), (0.98, 0.65, 0.04), wood_dark)
    cube(f"Mon{i}", (x, y - 0.35, 1.55), (0.55, 0.05, 0.38), screen)
    cube(f"MonBezel{i}", (x, y - 0.32, 1.55), (0.62, 0.04, 0.44), metal)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.16, location=(x + 0.45, y + 0.2, 1.28))
    mug = bpy.context.active_object
    mug.name = f"Mug{i}"
    mug.data.materials.append(mat_col(f"MugMat{i}", (0.98, 0.85, 0.12, 1), 0.3))

# Leader crown hint on desk 4
cube("CrownBase", (3.2, -4.0, 1.35), (0.18, 0.18, 0.08), mat_col("Gold", (0.95, 0.75, 0.2, 1), 0.25, metal=0.85))

# Plants
for i, (x, y) in enumerate([(-8.5, 5.5), (-8.5, -5.5), (8.2, 5.5), (8.0, -5.8), (-2.5, -6.5)]):
    cube(f"Pot{i}", (x, y, 0.28), (0.35, 0.35, 0.28), potm)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.55, location=(x, y, 1.0))
    leaf = bpy.context.active_object
    leaf.name = f"Leaf{i}"
    leaf.data.materials.append(plant)

# Concept mural as thin framed panel on back wall (not a giant plane)
ref_path = BLEND / "loft-ref.jpg"
if not ref_path.exists():
    ref_path = ROOT / "loft-ref.jpg"
if ref_path.exists():
    mural_img = load(ref_path)
    try:
        mural_img.colorspace_settings.name = "sRGB"
    except Exception:
        pass
    mural_mat = bpy.data.materials.new("Mural")
    mural_mat.use_nodes = True
    n, l = mural_mat.node_tree.nodes, mural_mat.node_tree.links
    n.clear()
    outn = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    tex = n.new("ShaderNodeTexImage"); tex.image = mural_img
    l.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.7
    bsdf.inputs["Emission Strength"].default_value = 0.0
    l.new(bsdf.outputs[0], outn.inputs[0])
    # Thin box: width 6, height 3.4, depth 0.04 — sits on back wall
    cube("ConceptMural", (0, -8.58, 2.55), (3.0, 0.04, 1.7), mural_mat)
    # Force UV project so image maps to front face
    mural = bpy.data.objects["ConceptMural"]
    bpy.context.view_layer.objects.active = mural
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1.0)
    bpy.ops.object.mode_set(mode="OBJECT")
    print("MURAL", ref_path)
else:
    print("NO MURAL IMAGE")

# Sticky notes on back wall (around mural)
for i, (x, z, mat) in enumerate([
    (-8.2, 4.2, sticky_y), (-8.0, 2.4, sticky_p), (8.0, 4.0, sticky_b),
    (8.2, 2.5, sticky_y), (-7.5, 1.5, sticky_p), (7.5, 1.6, sticky_b),
]):
    cube(f"Sticky{i}", (x, -8.68, z), (0.35, 0.02, 0.35), mat)

# Cardboard box "DO EPIC"
cube("Box", (8.5, -6.2, 0.55), (0.7, 0.55, 0.55), cardboard)

# Soft rug
cube("Rug", (0, 0.5, 0.1), (4.5, 3.2, 0.03), mat_col("Rug", (0.55, 0.28, 0.22, 1), 0.9))

# Lights — warm sun through windows + fill
bpy.ops.object.light_add(type="SUN", location=(12, 4, 16))
sun = bpy.context.active_object
sun.data.energy = 4.2
sun.data.angle = 0.02
sun.rotation_euler = (math.radians(48), math.radians(-8), math.radians(55))

bpy.ops.object.light_add(type="AREA", location=(10.2, 0, 2.8))
win = bpy.context.active_object
win.data.energy = 280
win.data.size = 4.5
win.data.size_y = 3.2
win.data.color = (1.0, 0.88, 0.62)
win.rotation_euler = (0, math.radians(-90), 0)

bpy.ops.object.light_add(type="AREA", location=(-2, -1, 3.5))
fill = bpy.context.active_object
fill.data.energy = 55
fill.data.size = 3.5
fill.data.color = (0.55, 0.72, 1.0)
fill.rotation_euler = (math.radians(75), 0, 0)

bpy.ops.object.light_add(type="AREA", location=(0, -6, 4.2))
ceil = bpy.context.active_object
ceil.data.energy = 40
ceil.data.size = 6
ceil.data.color = (1.0, 0.95, 0.85)
ceil.rotation_euler = (math.radians(180), 0, 0)

# Camera: overseer angle into the loft (see walls + desks, not pure top-down)
bpy.ops.object.empty_add(location=(0.5, -0.5, 0.8))
target = bpy.context.active_object
target.name = "CamTarget"
bpy.ops.object.camera_add(location=(11.5, 13.5, 5.8))
cam = bpy.context.active_object
scene.camera = cam
cam.data.lens = 32
con = cam.constraints.new("TRACK_TO")
con.target = target
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"

print("RENDER")
bpy.ops.render.render(write_still=True)
print("BEAUTY", scene.render.filepath + ".png")

# Export meshes only — glTF already converts Z-up → Y-up
bpy.ops.object.select_all(action="DESELECT")
for o in bpy.data.objects:
    if o.type == "MESH":
        o.select_set(True)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
bpy.context.view_layer.objects.active = meshes[0]
glb = OUT / "loft_room.glb"
bpy.ops.export_scene.gltf(
    filepath=str(glb),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
    export_texcoords=True,
    export_normals=True,
    export_yup=True,
)
print("GLB", glb, glb.stat().st_size)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND / "bot_office_loft.blend"))
print("DONE")
