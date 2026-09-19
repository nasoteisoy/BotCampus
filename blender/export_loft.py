"""Cleaner loft: good angled Cycles beauty + textured GLB (no broken bake join)."""
import bpy, math
from pathlib import Path

ROOT = Path("/workspace/bot-campus-publish")
OUT, BLEND = ROOT / "baked", ROOT / "blender"
OUT.mkdir(exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 96
scene.cycles.use_denoising = False
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUT / "loft_beauty")

world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.62, 0.5, 0.38, 1)
bg.inputs[1].default_value = 0.3

def load(p): return bpy.data.images.load(str(p))

def mat_img(name, img, rough=0.75):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links; n.clear()
    out, bsdf, tex = n.new("ShaderNodeOutputMaterial"), n.new("ShaderNodeBsdfPrincipled"), n.new("ShaderNodeTexImage")
    tex.image = img
    l.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    l.new(bsdf.outputs[0], out.inputs[0]); return m

def mat_col(name, rgba, rough=0.5, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links; n.clear()
    out, bsdf = n.new("ShaderNodeOutputMaterial"), n.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = emit
    l.new(bsdf.outputs[0], out.inputs[0]); return m

wood, brick = mat_img("Wood", load(BLEND/"wood-floor.png"), 0.85), mat_img("Brick", load(BLEND/"brick.png"), 0.9)
desk_mats = [mat_col(f"D{i}", c, 0.55) for i,c in enumerate([
    (0.12,0.5,0.95,1),(0.95,0.4,0.12,1),(0.95,0.18,0.25,1),(0.6,0.28,0.95,1),(0.85,0.55,0.12,1)])]
glass = mat_col("Glass", (1,0.94,0.82,1), 0.12, 12)
screen = mat_col("Screen", (0.3,0.8,1,1), 0.2, 14)
plant, potm = mat_col("Plant",(0.12,0.48,0.18,1),0.7), mat_col("Pot",(0.72,0.66,0.55,1),0.8)

def cube(name, loc, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    # UV
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT'); return o

cube("Floor", (0,0,0), (11,9,0.12), wood)
cube("WallBack", (0,-7.35,2.6), (11,0.25,2.7), brick)
cube("WallLeft", (-10.1,0,2.6), (0.25,9,2.7), brick)
cube("WallRight", (10.1,0,2.6), (0.25,9,2.7), brick)
# ceiling hint
cube("CeilPipe", (0,0,5.1), (10,0.12,0.12), mat_col("Metal",(0.35,0.35,0.38,1),0.35))

for i in range(4):
    for j in range(2):
        cube(f"Win{i}{j}", (9.95, -4.5+i*2.4, 1.55+j*1.65), (0.05,0.58,0.72), glass)

for i,(x,y) in enumerate([(-4.2,0.4),(-1.5,1.1),(1.5,0.9),(4.2,0.5),(2.5,-3.7)]):
    cube(f"Desk{i}", (x,y,0.42), (0.75,0.5,0.42), desk_mats[i])
    cube(f"Mon{i}", (x, y-0.28, 1.1), (0.32,0.04,0.22), screen)
    # mug
    bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.14, location=(x+0.4, y+0.15, 0.9))
    mug = bpy.context.active_object; mug.name=f"Mug{i}"; mug.data.materials.append(mat_col(f"Mug{i}",(0.98,0.82,0.1,1),0.35))

for i,(x,y) in enumerate([(-8.2,5),(-8.2,-4),(8.2,5),(8.2,-4)]):
    cube(f"Pot{i}", (x,y,0.22), (0.32,0.32,0.22), potm)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.48, location=(x,y,0.9))
    leaf=bpy.context.active_object; leaf.name=f"Leaf{i}"; leaf.data.materials.append(plant)

bpy.ops.object.light_add(type='SUN', location=(7,5,14))
sun=bpy.context.active_object; sun.data.energy=5; sun.rotation_euler=(math.radians(40), math.radians(5), math.radians(30))
bpy.ops.object.light_add(type='AREA', location=(9,0,3))
w=bpy.context.active_object; w.data.energy=120; w.data.size=2.8; w.data.color=(1,0.9,0.65); w.rotation_euler=(0,math.radians(-80),0)
bpy.ops.object.light_add(type='AREA', location=(-2,-2,3.2))
c=bpy.context.active_object; c.data.energy=40; c.data.size=2.5; c.data.color=(0.5,0.75,1); c.rotation_euler=(math.radians(90),0,0)

# Angled overseer camera
bpy.ops.object.empty_add(location=(0,0,0.4)); target=bpy.context.active_object
bpy.ops.object.camera_add(location=(11, 12, 9.5))
cam=bpy.context.active_object; scene.camera=cam
con=cam.constraints.new('TRACK_TO'); con.target=target; con.track_axis='TRACK_NEGATIVE_Z'; con.up_axis='UP_Y'

print("RENDER")
bpy.ops.render.render(write_still=True)
print("BEAUTY", scene.render.filepath)

# Export GLB with materials/textures (exclude lights/camera/empty)
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type=='MESH':
        o.select_set(True)
bpy.context.view_layer.objects.active = next(o for o in bpy.data.objects if o.type=='MESH')
glb = OUT/"loft_room.glb"
bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', use_selection=True, export_apply=True, export_materials='EXPORT', export_texcoords=True, export_normals=True)
print("GLB", glb, glb.stat().st_size)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND/"bot_office_loft.blend"))
print("DONE")
