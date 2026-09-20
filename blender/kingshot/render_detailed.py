"""Detailed Kingshot-like battle — textured ground, dense fence, fuller characters."""
import bpy, math, random
from pathlib import Path

OUT = Path("/workspace/bot-campus-publish/kingshot")
TEX = Path("/workspace/bot-campus-publish/blender/kingshot/tex")
OUT.mkdir(parents=True, exist_ok=True)
random.seed(21)

def reset(w=1920, h=1080, samples=220):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "Filmic"
    sc.view_settings.look = "Medium High Contrast"
    world = bpy.data.worlds.new("W"); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.75, 0.95, 1)
    bg.inputs[1].default_value = 0.9
    # soft AO via world slightly darker? keep bright sky
    return sc

def mat_col(name, rgba, rough=0.5, emit=0.0, metal=0.0):
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

def mat_tex(name, path, rough=0.7, scale=4.0, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links; n.clear()
    out, bsdf = n.new("ShaderNodeOutputMaterial"), n.new("ShaderNodeBsdfPrincipled")
    tex = n.new("ShaderNodeTexImage"); tex.image = bpy.data.images.load(str(path))
    mapn = n.new("ShaderNodeMapping"); mapn.inputs["Scale"].default_value = (scale, scale, scale)
    tc = n.new("ShaderNodeTexCoord")
    l.new(tc.outputs["UV"], mapn.inputs["Vector"])
    l.new(mapn.outputs["Vector"], tex.inputs["Vector"])
    l.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    l.new(bsdf.outputs[0], out.inputs[0]); return m

def shade(o, auto=True):
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth()
    if auto and hasattr(o.data, "use_auto_smooth"):
        o.data.use_auto_smooth = True
        o.data.auto_smooth_angle = math.radians(35)

def bevel(o, w=0.02, seg=3):
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new("B", "BEVEL"); mod.width = w; mod.segments = seg; mod.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier="B")

def subdivide(o, levels=1):
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new("S", "SUBSURF"); mod.levels = levels; mod.render_levels = levels
    bpy.ops.object.modifier_apply(modifier="S")

def cube(name, loc, scale, mat, bev=0.025, sub=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    if bev: bevel(o, bev, 3)
    if sub: subdivide(o, sub)
    # UV
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    shade(o); o.data.materials.append(mat); return o

def cyl(name, loc, r, depth, mat, rot=(0,0,0), bev=0.01):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, vertices=24)
    o = bpy.context.active_object; o.name = name
    o.rotation_euler = rot; bpy.ops.object.transform_apply(rotation=True)
    if bev: bevel(o, bev, 2)
    shade(o); o.data.materials.append(mat); return o

def cone(name, loc, r1, depth, mat, verts=16):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, depth=depth, location=loc, vertices=verts)
    o = bpy.context.active_object; o.name = name
    shade(o); o.data.materials.append(mat); return o

def sphere(name, loc, r, mat, scale=(1,1,1), seg=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg//2)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    shade(o); o.data.materials.append(mat); return o

def lights():
    bpy.ops.object.light_add(type='SUN', location=(12,-8,18))
    sun = bpy.context.active_object
    sun.data.energy = 4.5; sun.data.angle = 0.01
    sun.rotation_euler = (math.radians(50), math.radians(12), math.radians(48))
    bpy.ops.object.light_add(type='AREA', location=(-7,5,6))
    f = bpy.context.active_object; f.data.energy = 70; f.data.size = 8; f.data.color = (0.6,0.78,1)
    bpy.ops.object.light_add(type='AREA', location=(4,8,4))
    r = bpy.context.active_object; r.data.energy = 45; r.data.size = 5; r.data.color = (1,0.85,0.7)

def make_king(x,y,z,M):
    # body with belt + chest plate feel
    cube("KTorso", (x,y,z+0.55), (0.38,0.3,0.42), M['cape'], 0.05, 1)
    cube("KBelt", (x,y,z+0.32), (0.4,0.32,0.08), M['gold'], 0.02)
    cube("KChest", (x,y-0.12,z+0.62), (0.32,0.08,0.28), M['steel'], 0.02)
    # head
    sphere("KHead", (x,y,z+1.0), 0.24, M['skin'], seg=32)
    # hair fringe
    sphere("KHair", (x,y+0.02,z+1.12), 0.2, M['hair'], scale=(1.05,0.9,0.55), seg=24)
    # face
    sphere("KEyeL", (x-0.08,y-0.2,z+1.02), 0.035, M['eye'])
    sphere("KEyeR", (x+0.08,y-0.2,z+1.02), 0.035, M['eye'])
    sphere("KPupL", (x-0.08,y-0.23,z+1.02), 0.018, M['pupil'])
    sphere("KPupR", (x+0.08,y-0.23,z+1.02), 0.018, M['pupil'])
    # crown ornate
    cyl("KBand", (x,y,z+1.22), 0.26, 0.12, M['gold'], bev=0.015)
    for i,ang in enumerate(range(0,360,45)):
        ox = math.cos(math.radians(ang))*0.18
        oy = math.sin(math.radians(ang))*0.18
        cone(f"KSp{i}", (x+ox,y+oy,z+1.38), 0.045, 0.2, M['gold'], 12)
        sphere(f"KGem{i}", (x+ox,y+oy,z+1.22), 0.03, M['gem'])
    # flowing cape — layered slabs
    for i, (dz, sy, thick) in enumerate([(0.35,0.55,0.08),(0.2,0.7,0.07),(0.05,0.85,0.06)]):
        cube(f"Cape{i}", (x, y+0.28+i*0.04, z+0.55-i*0.08), (0.5-i*0.04, thick, sy), M['cape'], 0.06, 1)
    # arms with sleeves + hands
    for sx in (-1,1):
        cyl(f"KSleeve{sx}", (x+0.4*sx,y,z+0.55), 0.11, 0.28, M['cape'], rot=(0,math.radians(65*sx),0), bev=0.02)
        sphere(f"KHand{sx}", (x+0.55*sx,y-0.05,z+0.42), 0.09, M['skin'])
    # legs boots
    for sx in (-1,1):
        cube(f"KThigh{sx}", (x+0.12*sx,y,z+0.22), (0.12,0.14,0.16), M['pants'], 0.03)
        cube(f"KBoot{sx}", (x+0.12*sx,y+0.04,z+0.08), (0.13,0.2,0.1), M['boot'], 0.03)

def make_enemy(x,y,z,i,M):
    # armored goblin-knight
    cube(f"ETorso{i}", (x,y,z+0.45), (0.34,0.28,0.36), M['red'], 0.04, 1)
    cube(f"EShoulderL{i}", (x-0.22,y,z+0.62), (0.12,0.14,0.12), M['red_dark'], 0.03)
    cube(f"EShoulderR{i}", (x+0.22,y,z+0.62), (0.12,0.14,0.12), M['red_dark'], 0.03)
    sphere(f"EHead{i}", (x,y,z+0.78), 0.18, M['skin'], seg=24)
    # helmet with crest
    sphere(f"EHelm{i}", (x,y,z+0.88), 0.2, M['red_dark'], scale=(1.05,1.05,0.75), seg=24)
    cube(f"EVisor{i}", (x,y-0.16,z+0.82), (0.14,0.04,0.06), M['eye'], 0.01)
    cube(f"ECrest{i}", (x,y,z+1.05), (0.04,0.06,0.16), M['gold'], 0.01)
    # shield
    cube(f"EShield{i}", (x-0.32,y-0.05,z+0.5), (0.06,0.28,0.36), M['red_dark'], 0.03)
    cyl(f"EShieldBoss{i}", (x-0.36,y-0.05,z+0.5), 0.06, 0.04, M['gold'], rot=(0,math.radians(90),0))
    # sword
    cube(f"EBlade{i}", (x+0.3,y,z+0.55), (0.04,0.04,0.42), M['steel'], 0.01)
    cube(f"EGuard{i}", (x+0.3,y,z+0.35), (0.12,0.04,0.04), M['gold'], 0.01)
    # legs
    for sx in (-1,1):
        cube(f"ELeg{i}_{sx}", (x+0.1*sx,y,z+0.14), (0.1,0.12,0.14), M['red_dark'], 0.025)
        cube(f"EBoot{i}_{sx}", (x+0.1*sx,y+0.03,z+0.05), (0.11,0.16,0.08), M['boot'], 0.02)

def dense_fence(M):
    for i in range(22):
        t = i/21
        x = -6 + t*12.5
        y = 4.5 - t*10.2
        damaged = i in (9,10,11)
        h = 0.6 if damaged else 1.15
        # thicker post
        p = cube(f"Post{i}", (x,y,h/2), (0.12,0.12,h), M['wood'], 0.02)
        p.rotation_euler = (0,0,math.radians(-40)); bpy.ops.object.transform_apply(rotation=True)
        if not damaged:
            # pointed top from cone
            cone(f"Tip{i}", (x,y,h+0.1), 0.1, 0.22, M['wood'])
            # side brace
            if i % 2 == 0 and i < 21:
                cube(f"Brace{i}", (x+0.25,y-0.2,0.45), (0.35,0.06,0.06), M['wood_dark'], 0.01)
        else:
            # broken splinters
            cube(f"Splint{i}", (x+0.15,y-0.1,0.25), (0.08,0.08,0.35), M['wood'], 0.01)
    # long rails
    for i in range(20):
        if i in (8,9,10,11): continue
        t0, t1 = i/21, (i+1)/21
        x0,y0 = -6+t0*12.5, 4.5-t0*10.2
        x1,y1 = -6+t1*12.5, 4.5-t1*10.2
        mx,my = (x0+x1)/2,(y0+y1)/2
        for zh in (0.35,0.65,0.95):
            rail = cube(f"Rail{i}_{zh}", (mx,my,zh), (0.42,0.05,0.05), M['wood_dark'], 0.01)
            rail.rotation_euler = (0,0,math.radians(-40)); bpy.ops.object.transform_apply(rotation=True)

def watchtower(M):
    bx,by = -2.6, 2.5
    for ox,oy in [(-0.55,-0.55),(0.55,-0.55),(-0.55,0.55),(0.55,0.55)]:
        cyl(f"Leg{ox}_{oy}", (bx+ox,by+oy,1.0), 0.1, 2.0, M['wood_dark'], bev=0.015)
        # cross braces
        cube(f"XB{ox}_{oy}", (bx+ox*0.5,by+oy*0.5,0.7), (0.7,0.06,0.06), M['wood'], 0.01)
    cube("Deck", (bx,by,2.05), (1.4,1.4,0.16), M['wood'], 0.03, 1)
    # plank lines via extra thin cubes
    for i in range(-2,3):
        cube(f"Plank{i}", (bx, by+i*0.25, 2.14), (1.3,0.08,0.03), M['wood_dark'], 0.005)
    for side,(dx,dy,sx,sy) in {
        'N':(0,0.62,1.3,0.08),'S':(0,-0.62,1.3,0.08),'E':(0.62,0,0.08,1.3),'W':(-0.62,0,0.08,1.3)
    }.items():
        cube(f"Rail{side}", (bx+dx,by+dy,2.4), (sx,sy,0.35), M['wood'], 0.02)
        # posts on rail
        for k in (-0.4,0.4):
            if side in ('N','S'):
                cyl(f"RP{side}{k}", (bx+k,by+dy,2.55), 0.04, 0.25, M['wood_dark'])
    # ladder
    for i in range(6):
        cube(f"Lad{i}", (bx+0.75, by, 0.25+i*0.3), (0.08,0.35,0.05), M['wood_dark'], 0.01)
    cyl("LadL", (bx+0.75, by-0.15, 1.0), 0.04, 2.0, M['wood_dark'])
    cyl("LadR", (bx+0.75, by+0.15, 1.0), 0.04, 2.0, M['wood_dark'])

def build():
    sc = reset(1920, 1080, 200)
    lights()
    M = {
        'grass': mat_tex("Grass", TEX/"grass.png", 0.9, 6) if (TEX/"grass.png").exists() else mat_col("Grass",(0.3,0.75,0.3,1),0.9),
        'sand': mat_tex("Sand", TEX/"sand.png", 0.92, 5) if (TEX/"sand.png").exists() else mat_col("Sand",(0.88,0.75,0.5,1),0.9),
        'wood': mat_tex("Wood", TEX/"wood.png", 0.7, 2.5) if (TEX/"wood.png").exists() else mat_col("Wood",(0.55,0.35,0.18,1),0.65),
        'wood_dark': mat_tex("WoodD", TEX/"wood.png", 0.75, 3.5) if (TEX/"wood.png").exists() else mat_col("WoodD",(0.35,0.2,0.1,1),0.7),
        'steel': mat_tex("Steel", TEX/"metal.png", 0.35, 2, metal=0.7) if (TEX/"metal.png").exists() else mat_col("Steel",(0.65,0.68,0.72,1),0.35,metal=0.7),
        'cape': mat_col("Cape", (0.1,0.38,0.95,1), 0.4),
        'gold': mat_col("Gold", (1.0,0.8,0.15,1), 0.22, metal=0.92),
        'skin': mat_col("Skin", (1.0,0.8,0.66,1), 0.48),
        'hair': mat_col("Hair", (0.35,0.2,0.1,1), 0.7),
        'eye': mat_col("Eye", (0.95,0.95,0.97,1), 0.3),
        'pupil': mat_col("Pupil", (0.08,0.08,0.1,1), 0.25),
        'gem': mat_col("Gem", (0.2,0.7,1.0,1), 0.15, emit=0.8),
        'red': mat_col("Red", (0.9,0.08,0.08,1), 0.38),
        'red_dark': mat_col("RedD", (0.45,0.04,0.06,1), 0.42),
        'pants': mat_col("Pants", (0.12,0.18,0.45,1), 0.55),
        'boot': mat_col("Boot", (0.2,0.12,0.08,1), 0.6),
        'hp': mat_col("HP", (0.25,0.95,0.35,1), 0.35, emit=0.7),
        'coin': mat_col("Coin", (1.0,0.85,0.12,1), 0.2, metal=0.95, emit=0.4),
        'white': mat_col("White", (0.95,0.95,0.97,1), 0.4),
        'aura': mat_col("Aura", (0.35,1.0,0.45,1), 0.3, emit=2.0),
    }

    # continuous ground
    cube("SandBase", (1.5,-1.5,-0.12), (16,16,0.14), M['sand'], 0.005)
    cube("GrassPad", (-2.2,2.5,0.02), (9.5,9.5,0.08), M['grass'], 0.005)
    # little grass clumps
    for i in range(25):
        gx = -2.2 + random.uniform(-4,4)
        gy = 2.5 + random.uniform(-4,4)
        cone(f"Tuft{i}", (gx,gy,0.12), 0.08, 0.2, M['grass'])

    dense_fence(M)
    watchtower(M)
    make_king(-0.9, 1.3, 0, M)

    # selection bracket + aura
    bpy.ops.mesh.primitive_torus_add(major_radius=0.85, minor_radius=0.035, location=(-0.9,1.3,0.08))
    aura = bpy.context.active_object; aura.name="Aura"; aura.data.materials.append(M['aura'])
    for ox,oy in [(-0.55,-0.55),(0.55,-0.55),(-0.55,0.55),(0.55,0.45)]:
        cube(f"Br{ox}", (-0.9+ox,1.3+oy,0.06), (0.14,0.035,0.03), M['white'], 0.005)
        cube(f"Br2{ox}", (-0.9+ox,1.3+oy,0.06), (0.035,0.14,0.03), M['white'], 0.005)

    cube("HP1", (-0.9,1.3,1.85), (0.55,0.08,0.07), M['hp'], 0.01)
    cube("HP2", (-2.6,2.5,2.75), (0.6,0.08,0.07), M['hp'], 0.01)
    # fence HP
    cube("HP3", (0.5,1.8,1.4), (0.45,0.07,0.06), M['hp'], 0.01)

    # swarm
    for i in range(28):
        t = random.uniform(0.4, 0.9)
        x = -6 + t*12.5 + random.uniform(1.0, 3.2)
        y = 4.5 - t*10.2 - random.uniform(0.8, 2.8)
        make_enemy(x,y,0,i,M)

    # coins + build pad
    for j,pos in enumerate([(3.8,-1.0),(4.3,-1.5),(2.9,-2.0)]):
        cyl(f"Coin{j}", (*pos,0.1), 0.18, 0.05, M['coin'], bev=0.01)
    cube("Pad", (-4.0,0.9,0.1), (0.95,0.95,0.12), M['wood'], 0.03, 1)
    cyl("PadCoin", (-4.0,0.9,0.28), 0.25, 0.08, M['coin'], bev=0.015)

    # rocks on sand
    for i in range(8):
        sphere(f"Rock{i}", (random.uniform(2,6), random.uniform(-4,0), 0.12),
               random.uniform(0.15,0.35), mat_col(f"RockM{i}", (0.55,0.5,0.42,1), 0.85),
               scale=(1,1,random.uniform(0.5,0.8)), seg=16)

    bpy.ops.object.empty_add(location=(0.5,-0.2,0.4)); tgt=bpy.context.active_object
    bpy.ops.object.camera_add(location=(12,-12,10)); cam=bpy.context.active_object
    sc.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=15
    con=cam.constraints.new('TRACK_TO'); con.target=tgt
    con.track_axis='TRACK_NEGATIVE_Z'; con.up_axis='UP_Y'

    sc.render.filepath = str(OUT / "battle_iso")
    print("RENDER"); bpy.ops.render.render(write_still=True); print("SAVED")

    # also king closeup detailed
    # skip separate for time — user wants non-simple battle

    print("ALL_DONE")

build()
