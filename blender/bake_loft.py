"""Bot Office loft — Blender Z-up, Cycles beauty + GLB export."""
import bpy
import math
from pathlib import Path

ROOT = Path("/workspace/bot-campus-publish")
OUT = ROOT / "baked"
BLEND = ROOT / "blender"
OUT.mkdir(exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 64
scene.cycles.use_denoising = False
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUT / "loft_beauty")

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
ntw = world.node_tree
bg = ntw.nodes["Background"]
bg.inputs[0].default_value = (0.55, 0.45, 0.35, 1)
bg.inputs[1].default_value = 0.25

def load_img(path):
    return bpy.data.images.load(str(path))

def mat_tex(name, img, rough=0.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Smart"
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    links.new(bsdf.outputs[0], out.inputs[0])
    return m

def mat_color(name, rgba, rough=0.5, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    if emit > 0:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emit
    links.new(bsdf.outputs[0], out.inputs[0])
    return m

wood = mat_tex("Wood", load_img(BLEND / "wood-floor.png"), 0.85)
brick = mat_tex("Brick", load_img(BLEND / "brick.png"), 0.9)
desks = [
    mat_color("D0", (0.1, 0.45, 0.9, 1), 0.55),
    mat_color("D1", (0.9, 0.4, 0.1, 1), 0.55),
    mat_color("D2", (0.9, 0.15, 0.2, 1), 0.55),
    mat_color("D3", (0.55, 0.25, 0.9, 1), 0.55),
    mat_color("D4", (0.8, 0.5, 0.1, 1), 0.55),
]
glass = mat_color("Glass", (1.0, 0.93, 0.8, 1), 0.15, emit=8.0)
screen = mat_color("Screen", (0.25, 0.75, 1.0, 1), 0.25, emit=10.0)
plant = mat_color("Plant", (0.15, 0.5, 0.2, 1), 0.75)
potm = mat_color("Pot", (0.75, 0.7, 0.6, 1), 0.8)

def add_cube(name, loc, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(mat)
    return ob

def uv_smart(ob):
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")

# Z-up room (meters-ish)
floor = add_cube("Floor", (0, 0, 0), (11, 9, 0.12), wood)
back = add_cube("WallBack", (0, -7.4, 2.5), (11, 0.2, 2.6), brick)
left = add_cube("WallLeft", (-10, 0, 2.5), (0.2, 9, 2.6), brick)
right = add_cube("WallRight", (10, 0, 2.5), (0.2, 9, 2.6), brick)

for i in range(4):
    for j in range(2):
        add_cube(f"Win_{i}_{j}", (9.85, -4.2 + i * 2.3, 1.5 + j * 1.6), (0.06, 0.55, 0.7), glass)

desk_pos = [(-4.2, 0.35), (-1.5, 1.05), (1.5, 0.85), (4.2, 0.45), (2.5, -3.85)]
for i, (x, y) in enumerate(desk_pos):
    add_cube(f"Desk_{i}", (x, y, 0.4), (0.7, 0.45, 0.4), desks[i])
    add_cube(f"Mon_{i}", (x, y - 0.25, 1.05), (0.28, 0.03, 0.2), screen)

for i, (x, y) in enumerate([(-8, 5), (-8, -4), (8, 5), (8, -4)]):
    add_cube(f"Pot_{i}", (x, y, 0.2), (0.3, 0.3, 0.2), potm)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.45, location=(x, y, 0.85))
    leaf = bpy.context.active_object
    leaf.name = f"Leaf_{i}"
    leaf.data.materials.append(plant)

# Lights
bpy.ops.object.light_add(type="SUN", location=(6, 4, 12))
sun = bpy.context.active_object
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(35), math.radians(10), math.radians(25))

bpy.ops.object.light_add(type="AREA", location=(-3, -1, 3.5))
a1 = bpy.context.active_object
a1.data.energy = 50
a1.data.size = 3
a1.data.color = (0.45, 0.7, 1.0)
a1.rotation_euler = (math.radians(90), 0, 0)

bpy.ops.object.light_add(type="AREA", location=(8, 0, 2.8))
a2 = bpy.context.active_object
a2.data.energy = 70
a2.data.size = 2.2
a2.data.color = (1.0, 0.88, 0.6)
a2.rotation_euler = (0, math.radians(-90), 0)

# Camera: high angle looking into room (match game overseer vibe)
bpy.ops.object.camera_add(location=(8.5, 10.5, 11.5))
cam = bpy.context.active_object
# point toward origin
# track
cam.rotation_euler = (math.radians(48), 0, math.radians(35))
scene.camera = cam
# better aim with track-to empty
bpy.ops.object.empty_add(location=(0, 0, 0.5))
empty = bpy.context.active_object
con = cam.constraints.new(type="TRACK_TO")
con.target = empty
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"

for ob in bpy.data.objects:
    if ob.type == "MESH":
        uv_smart(ob)

# Beauty first (prove we can render)
print("RENDER_START")
bpy.ops.render.render(write_still=True)
print("BEAUTY_OK", scene.render.filepath)

# Join meshes for bake
bpy.ops.object.select_all(action="DESELECT")
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
room = bpy.context.active_object
room.name = "LoftRoom"
uv_smart(room)

# Bake DIFFUSE into new image on active material
img = bpy.data.images.new("LoftBake", 2048, 2048, alpha=False)
mat = room.data.materials[0]
nodes = mat.node_tree.nodes
bake_node = nodes.new("ShaderNodeTexImage")
bake_node.image = img
nodes.active = bake_node
bake_node.select = True
scene.render.bake.use_pass_direct = True
scene.render.bake.use_pass_indirect = True
scene.render.bake.use_pass_color = True
scene.render.bake.margin = 8
scene.cycles.samples = 64
print("BAKE_START")
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT", "COLOR"}, margin=8, use_clear=True)
print("BAKE_DONE")
img.filepath_raw = str(OUT / "loft_lightmap.png")
img.file_format = "PNG"
img.save()
print("SAVED_LM", img.filepath_raw)

# Wire bake into material for export
bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
for l in list(mat.node_tree.links):
    if l.to_socket == bsdf.inputs["Base Color"]:
        mat.node_tree.links.remove(l)
mat.node_tree.links.new(bake_node.outputs[0], bsdf.inputs["Base Color"])

glb = OUT / "loft_room.glb"
bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_apply=True, export_materials="EXPORT")
print("GLB", glb)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND / "bot_office_loft.blend"))
print("DONE")
