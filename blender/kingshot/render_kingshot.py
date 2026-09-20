"""Kingshot-style polish pass — continuous ground, picket fence, chunkier characters."""
import bpy, math, random
from pathlib import Path

OUT = Path("/workspace/bot-campus-publish/kingshot")
OUT.mkdir(parents=True, exist_ok=True)
random.seed(11)

def reset(w=1600, h=900, samples=180):
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
    sc.view_settings.look = "High Contrast"
    world = bpy.data.worlds.new("W"); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.62, 0.82, 0.98, 1)
    bg.inputs[1].default_value = 1.0
    return sc

def mat(name, rgba, rough=0.5, emit=0.0, metal=0.0):
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

def mats():
    return dict(
        grass=mat("Grass", (0.28, 0.78, 0.32, 1), 0.88),
        grass_dark=mat("GrassD", (0.18, 0.55, 0.22, 1), 0.9),
        sand=mat("Sand", (0.90, 0.78, 0.52, 1), 0.92),
        wood=mat("Wood", (0.62, 0.40, 0.20, 1), 0.65),
        wood_dark=mat("WoodD", (0.38, 0.22, 0.10, 1), 0.6),
        skin=mat("Skin", (1.0, 0.82, 0.68, 1), 0.5),
        cape=mat("Cape", (0.12, 0.42, 0.98, 1), 0.4),
        gold=mat("Gold", (1.0, 0.82, 0.18, 1), 0.25, metal=0.9),
        red=mat("Red", (0.92, 0.1, 0.1, 1), 0.4),
        red_dark=mat("RedD", (0.5, 0.05, 0.08, 1), 0.45),
        steel=mat("Steel", (0.7, 0.72, 0.76, 1), 0.3, metal=0.75),
        hp=mat("HP", (0.2, 0.95, 0.35, 1), 0.35, emit=0.6),
        coin=mat("Coin", (1.0, 0.85, 0.15, 1), 0.22, metal=0.95, emit=0.35),
        pants=mat("Pants", (0.15, 0.22, 0.5, 1), 0.55),
        white=mat("White", (0.95, 0.95, 0.97, 1), 0.45),
    )

def cube(name, loc, scale, material, bevel=0.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = o.modifiers.new("B", "BEVEL"); mod.width = bevel; mod.segments = 3
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier="B")
    bpy.ops.object.shade_smooth(); o.data.materials.append(material)
    return o

def cyl(name, loc, r, depth, material, rot=(0,0,0), bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc)
    o = bpy.context.active_object; o.name = name
    o.rotation_euler = rot; bpy.ops.object.transform_apply(rotation=True)
    if bevel > 0:
        mod = o.modifiers.new("B", "BEVEL"); mod.width = bevel; mod.segments = 2
        bpy.ops.object.modifier_apply(modifier="B")
    bpy.ops.object.shade_smooth(); o.data.materials.append(material)
    return o

def cone(name, loc, r1, depth, material):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, depth=depth, location=loc)
    o = bpy.context.active_object; o.name = name
    bpy.ops.object.shade_smooth(); o.data.materials.append(material)
    return o

def sphere(name, loc, r, material, scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24, ring_count=12)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.shade_smooth(); o.data.materials.append(material)
    return o

def lights():
    bpy.ops.object.light_add(type="SUN", location=(10, -8, 16))
    sun = bpy.context.active_object
    sun.data.energy = 4.0; sun.data.angle = 0.012
    sun.rotation_euler = (math.radians(52), math.radians(10), math.radians(45))
    bpy.ops.object.light_add(type="AREA", location=(-6, 4, 5))
    fill = bpy.context.active_object
    fill.data.energy = 55; fill.data.size = 7; fill.data.color = (0.65, 0.8, 1.0)
    bpy.ops.object.light_add(type="AREA", location=(2, 6, 3))
    rim = bpy.context.active_object
    rim.data.energy = 35; rim.data.size = 4; rim.data.color = (1.0, 0.9, 0.75)

def cam_ortho(sc, loc=(12, -12, 10), target=(1, -0.5, 0.3), scale=15):
    bpy.ops.object.empty_add(location=target); tgt = bpy.context.active_object
    bpy.ops.object.camera_add(location=loc); c = bpy.context.active_object
    sc.camera = c; c.data.type = "ORTHO"; c.data.ortho_scale = scale
    con = c.constraints.new("TRACK_TO"); con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"; con.up_axis = "UP_Y"

def cam_persp(sc, loc, target, lens=45):
    bpy.ops.object.empty_add(location=target); tgt = bpy.context.active_object
    bpy.ops.object.camera_add(location=loc); c = bpy.context.active_object
    sc.camera = c; c.data.lens = lens
    con = c.constraints.new("TRACK_TO"); con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"; con.up_axis = "UP_Y"

def make_king(x, y, z, M, tag=""):
    # stubby cute king
    cube(f"{tag}Body", (x, y, z+0.5), (0.42, 0.34, 0.42), M["cape"], 0.06)
    sphere(f"{tag}Head", (x, y, z+0.98), 0.26, M["skin"])
    # crown band + spikes
    cyl(f"{tag}CrownBand", (x, y, z+1.22), 0.24, 0.1, M["gold"], bevel=0.02)
    for i, ang in enumerate(range(0, 360, 72)):
        ox = math.cos(math.radians(ang)) * 0.14
        oy = math.sin(math.radians(ang)) * 0.14
        cone(f"{tag}Spike{i}", (x+ox, y+oy, z+1.36), 0.05, 0.18, M["gold"])
    # cape
    cube(f"{tag}Cape", (x, y+0.28, z+0.45), (0.48, 0.1, 0.65), M["cape"], 0.05)
    # arms
    for sx in (-1, 1):
        cyl(f"{tag}Arm{sx}", (x+0.38*sx, y, z+0.5), 0.09, 0.32, M["skin"],
            rot=(0, math.radians(70*sx), 0), bevel=0.02)
    # legs
    for sx in (-1, 1):
        cube(f"{tag}Leg{sx}", (x+0.14*sx, y, z+0.16), (0.12, 0.14, 0.18), M["pants"], 0.03)
    # tiny face dots
    sphere(f"{tag}EyeL", (x-0.08, y-0.22, z+1.02), 0.035, mat(f"{tag}Eye", (0.1,0.1,0.12,1), 0.3))
    sphere(f"{tag}EyeR", (x+0.08, y-0.22, z+1.02), 0.035, mat(f"{tag}Eye2", (0.1,0.1,0.12,1), 0.3))

def make_enemy(x, y, z, i, M):
    # red armored stubby knight
    cube(f"EBody{i}", (x, y, z+0.42), (0.34, 0.28, 0.38), M["red"], 0.045)
    sphere(f"EHead{i}", (x, y, z+0.78), 0.2, M["skin"])
    # helmet dome
    sphere(f"Helm{i}", (x, y, z+0.88), 0.22, M["red_dark"], scale=(1, 1, 0.7))
    # visor slit
    cube(f"Visor{i}", (x, y-0.18, z+0.82), (0.16, 0.04, 0.05), mat(f"V{i}", (0.05,0.05,0.06,1), 0.4), 0.01)
    # sword raised
    ang = random.uniform(-20, 20)
    cube(f"Sword{i}", (x+0.28, y-0.05, z+0.55), (0.05, 0.05, 0.36), M["steel"], 0.01)
    # legs
    for sx in (-1, 1):
        cube(f"ELeg{i}_{sx}", (x+0.1*sx, y, z+0.12), (0.1, 0.12, 0.14), M["red_dark"], 0.02)

def fence_line(M):
    # diagonal picket fence with rails
    posts = []
    for i in range(16):
        t = i / 15
        x = -5.5 + t * 11.5
        y = 4.2 - t * 9.5
        damaged = i in (6, 7, 8)
        h = 0.55 if damaged else 1.05
        p = cube(f"Post{i}", (x, y, h/2), (0.1, 0.1, h), M["wood"], 0.02)
        p.rotation_euler = (0, 0, math.radians(-38))
        bpy.ops.object.transform_apply(rotation=True)
        if not damaged:
            cone(f"Pick{i}", (x, y, h + 0.08), 0.09, 0.2, M["wood"])
        posts.append((x, y, h, damaged))
    # horizontal rails between undamaged sections
    for i in range(len(posts) - 1):
        x0, y0, h0, d0 = posts[i]
        x1, y1, h1, d1 = posts[i+1]
        if d0 or d1:
            continue
        mx, my = (x0+x1)/2, (y0+y1)/2
        for zh in (0.35, 0.7):
            rail = cube(f"Rail{i}_{zh}", (mx, my, zh), (0.55, 0.06, 0.06), M["wood_dark"], 0.015)
            rail.rotation_euler = (0, 0, math.radians(-38))
            bpy.ops.object.transform_apply(rotation=True)

def watchtower(M):
    base = (-2.4, 2.3, 0)
    for ox, oy in [(-0.5, -0.5), (0.5, -0.5), (-0.5, 0.5), (0.5, 0.5)]:
        cyl(f"TLeg{ox}", (base[0]+ox, base[1]+oy, 0.85), 0.09, 1.7, M["wood_dark"], bevel=0.01)
    cube("Deck", (base[0], base[1], 1.75), (1.25, 1.25, 0.14), M["wood"], 0.03)
    # railing
    for dx, dy, sx, sy in [
        (0, 0.55, 1.15, 0.08), (0, -0.55, 1.15, 0.08),
        (0.55, 0, 0.08, 1.15), (-0.55, 0, 0.08, 1.15),
    ]:
        cube(f"Rail_{dx}_{dy}", (base[0]+dx, base[1]+dy, 2.05), (sx, sy, 0.28), M["wood"], 0.02)
    # ladder hint
    cube("Ladder", (base[0]+0.7, base[1], 0.9), (0.08, 0.2, 0.9), M["wood_dark"], 0.015)

def build_battle():
    sc = reset(1700, 956, 200)
    M = mats(); lights()

    # Single continuous ground plate (no floating twin pads)
    cube("Ground", (0.5, -0.3, -0.1), (14, 14, 0.12), M["sand"], 0.005)
    # Grass half as raised carpet that covers the "inside" side of the fence
    g = cube("Grass", (-2.2, 2.4, 0.02), (8.5, 8.5, 0.06), M["grass"], 0.005)
    # Dark seam along fence line
    seam = cube("Seam", (0.3, 0.2, 0.06), (9.5, 0.45, 0.03), M["grass_dark"], 0.01)
    seam.rotation_euler = (0, 0, math.radians(-38))
    bpy.context.view_layer.objects.active = seam
    bpy.ops.object.transform_apply(rotation=True)

    fence_line(M)
    watchtower(M)
    make_king(-0.8, 1.2, 0, M, "K")

    # targeting bracket under king (simple white corners)
    for ox, oy in [(-0.45, -0.45), (0.45, -0.45), (-0.45, 0.45), (0.45, 0.45)]:
        cube(f"Bracket{ox}_{oy}", (-0.8+ox, 1.2+oy, 0.05), (0.12, 0.04, 0.03), M["white"], 0.005)
        cube(f"Bracket2{ox}_{oy}", (-0.8+ox, 1.2+oy, 0.05), (0.04, 0.12, 0.03), M["white"], 0.005)

    # HP bar over king
    cube("HPKing", (-0.8, 1.2, 1.75), (0.5, 0.07, 0.06), M["hp"], 0.01)
    cube("HPTower", (-2.4, 2.3, 2.45), (0.55, 0.07, 0.06), M["hp"], 0.01)

    # enemy swarm pressing fence
    for i in range(22):
        # cluster along sand side of fence
        t = random.uniform(0.35, 0.85)
        x = -5.5 + t * 11.5 + random.uniform(0.8, 2.8)
        y = 4.2 - t * 9.5 - random.uniform(0.6, 2.2)
        make_enemy(x, y, 0, i, M)

    # coin on sand
    cyl("LootCoin", (3.5, -1.2, 0.1), 0.2, 0.06, M["coin"], bevel=0.01)
    # build pad
    cube("BuildPad", (-3.8, 0.8, 0.08), (0.85, 0.85, 0.1), M["wood"], 0.03)
    cyl("PadCoin", (-3.8, 0.8, 0.22), 0.22, 0.07, M["coin"], bevel=0.01)

    # green aura circle near king
    bpy.ops.mesh.primitive_torus_add(major_radius=0.7, minor_radius=0.04, location=(-0.8, 1.2, 0.06))
    aura = bpy.context.active_object; aura.name = "Aura"
    aura.data.materials.append(mat("Aura", (0.3, 1.0, 0.4, 1), 0.3, emit=1.5))

    cam_ortho(sc, loc=(11.5, -11.5, 9.5), target=(0.8, -0.2, 0.4), scale=14.5)
    sc.render.filepath = str(OUT / "battle_iso")
    print("RENDER battle"); bpy.ops.render.render(write_still=True); print("SAVED battle")

def build_king():
    sc = reset(1200, 1200, 180)
    M = mats(); lights()
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.5, 0.75, 0.95, 1)
    cube("G", (0, 0, -0.05), (2.5, 2.5, 0.08), M["grass"], 0.01)
    make_king(0, 0, 0, M, "Hero")
    cam_persp(sc, (3.0, -3.4, 2.4), (0, 0, 0.85), 48)
    sc.render.filepath = str(OUT / "king_hero")
    print("RENDER king"); bpy.ops.render.render(write_still=True); print("SAVED king")

def build_enemies():
    sc = reset(1200, 1200, 180)
    M = mats(); lights()
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.68, 0.48, 1)
    cube("G", (0, 0, -0.05), (2.8, 2.8, 0.08), M["sand"], 0.01)
    make_enemy(-0.45, 0.15, 0, 1, M)
    make_enemy(0.1, -0.1, 0, 2, M)
    make_enemy(0.6, 0.2, 0, 3, M)
    cam_persp(sc, (2.8, -3.0, 2.0), (0.1, 0, 0.55), 48)
    sc.render.filepath = str(OUT / "enemies_hero")
    print("RENDER enemies"); bpy.ops.render.render(write_still=True); print("SAVED enemies")

build_battle()
print("ALL_DONE")
