"""
Badges, modelled and ray traced in Blender (Cycles).

Each badge is a block of glass with its mark suspended inside as a metal wire,
like a paperweight: the family is the shape (lessons a disc, plugins a hex,
learning a rounded plate), the tier is the material (quartz, sapphire, emerald,
diamond-and-gold). Real refraction (IOR per material), dispersion where the
material has it, caustics, a studio light set. Transparent background, so the
renders sit on Bezier's dark and light surfaces alike.

Run with Blender, or with the `bpy` package:
    python badges.py --out renders --size 512 --samples 128 [--only extrude] [--blend badge.blend]
"""

import argparse
import math
import os
import sys

import bpy

# ---- the system ------------------------------------------------------------

TIERS = {
    # name: glass tint, IOR, dispersion, metal colour, metal roughness
    "quartz": ((0.97, 0.98, 1.0), 1.46, 0.0, (0.91, 0.92, 0.94), 0.22),
    "sapphire": ((0.42, 0.60, 1.0), 1.77, 0.01, (0.95, 0.95, 0.97), 0.12),
    "emerald": ((0.40, 0.95, 0.66), 1.57, 0.01, (1.0, 0.78, 0.34), 0.14),
    "diamond": ((1.0, 1.0, 1.0), 2.42, 0.044, (1.0, 0.77, 0.30), 0.08),
}

# Marks as strokes in a 100×100 box (SVG orientation, y down); circles as (cx, cy, r).
MARKS = {
    "extrude": [[(38, 64), (62, 64), (62, 44), (38, 44), (38, 64)], [(38, 44), (46, 36), (70, 36), (62, 44)], [(62, 64), (70, 56), (70, 36)]],
    "chapter": [[(30, 50), (70, 50)], [(38, 40), (38, 60)], [(50, 40), (50, 60)], [(62, 40), (62, 60)]],
    "stepin": [[(36, 62), (36, 38), (54, 50), (36, 62)], [(58, 38), (66, 38), (66, 62), (58, 62)]],
    "teacher": [(42, 43, 6), (60, 47, 5), [(31, 65), (35, 58), (42, 55), (49, 58), (53, 65)], [(51, 65), (55, 59), (60, 57), (65, 59), (69, 65)]],
    "plugin": [[(40, 40), (47, 40), (47, 33), (53, 33), (53, 40), (60, 40), (60, 47), (67, 47), (67, 53), (60, 53), (60, 62), (40, 62), (40, 40)]],
    "installs": [[(50, 33), (50, 58)], [(39, 47), (50, 58), (61, 47)], [(35, 67), (65, 67)]],
    "offline": [[(34, 57), (42, 50), (50, 48), (58, 50), (66, 57)], [(41, 62), (46, 58), (54, 58), (59, 62)], (50, 67, 1.8), [(34, 34), (66, 70)]],
    "clean": [(50, 50, 19), [(40, 51), (47, 58), (61, 42)]],
    "firststep": [[(44, 40), (53, 33), (53, 67)], [(43, 67), (63, 67)]],
    "streak": [(50, 50, 18), (50, 50, 10)],
    "levelup": [[(34, 66), (43, 66), (43, 57), (52, 57), (52, 48), (61, 48), (61, 39), (70, 39)]],
    "remix": [[(34, 43), (60, 43)], [(53, 36), (60, 43), (53, 50)], [(66, 57), (40, 57)], [(47, 50), (40, 57), (47, 64)]],
}

FAMILY = {
    "extrude": "disc", "chapter": "disc", "stepin": "disc", "teacher": "disc",
    "plugin": "hex", "installs": "hex", "offline": "hex", "clean": "hex",
    "firststep": "plate", "streak": "plate", "levelup": "plate", "remix": "plate",
}

THICKNESS = 0.42
MARK_SCALE = 0.0135  # 100-box units to scene units
WIRE = 0.034


# ---- scene ----------------------------------------------------------------


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.render.film_transparent = True
    scene.cycles.use_denoising = True
    # Glass inside glass needs room to bounce, and caustics are the point of glass.
    scene.cycles.max_bounces = 24
    scene.cycles.transmission_bounces = 20
    scene.cycles.glossy_bounces = 12
    scene.cycles.caustics_reflective = True
    scene.cycles.caustics_refractive = True
    scene.cycles.blur_glossy = 0.4
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    return scene


def studio(scene):
    world = bpy.data.worlds.new("Studio")
    scene.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    ramp = nodes.new("ShaderNodeValToRGB")
    bg = nodes.new("ShaderNodeBackground")
    out = nodes.new("ShaderNodeOutputWorld")
    # A soft studio sweep: bright above, near black below, so glass has something to refract.
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.004, 0.004, 0.005, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.55, 0.57, 0.62, 1)
    links.new(coord.outputs["Generated"], sep.inputs[0])
    links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.8
    links.new(bg.outputs["Background"], out.inputs["Surface"])

    def area(name, location, rotation, size, power, color=(1, 1, 1)):
        light = bpy.data.lights.new(name, "AREA")
        light.size = size
        light.energy = power
        light.color = color
        obj = bpy.data.objects.new(name, light)
        obj.location = location
        obj.rotation_euler = rotation
        scene.collection.objects.link(obj)

    area("Key", (-2.6, -3.0, 3.2), (math.radians(50), 0, math.radians(-40)), 2.5, 520)
    area("Rim", (2.8, 2.4, 2.0), (math.radians(-60), 0, math.radians(140)), 3.0, 420, (0.92, 0.95, 1.0))
    area("Kick", (2.4, -2.6, -0.4), (math.radians(95), 0, math.radians(45)), 1.2, 160, (1.0, 0.94, 0.86))

    # A glowing sweep behind the badge that the camera never sees directly: glass is only as
    # bright as what it refracts, and over a dark world it reads as black.
    bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 4.5, 0.6), rotation=(math.radians(90), 0, 0))
    sweep = bpy.context.object
    sweep.name = "Sweep"
    glow = bpy.data.materials.new("Sweep")
    glow.use_nodes = True
    gn, gl = glow.node_tree.nodes, glow.node_tree.links
    gn.clear()
    tc = gn.new("ShaderNodeTexCoord")
    grad = gn.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    mapping = gn.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.32, 0.32, 1)
    mapping.inputs["Location"].default_value = (0.5, 0.5, 0)
    tone = gn.new("ShaderNodeValToRGB")
    tone.color_ramp.elements[0].color = (0, 0, 0, 1)
    tone.color_ramp.elements[1].color = (1, 1, 1, 1)
    emission = gn.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 2.4
    output = gn.new("ShaderNodeOutputMaterial")
    gl.new(tc.outputs["UV"], mapping.inputs["Vector"])
    gl.new(mapping.outputs["Vector"], grad.inputs["Vector"])
    gl.new(grad.outputs["Fac"], tone.inputs["Fac"])
    gl.new(tone.outputs["Color"], emission.inputs["Color"])
    gl.new(emission.outputs["Emission"], output.inputs["Surface"])
    sweep.data.materials.append(glow)
    sweep.visible_camera = False

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 85
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (0, -7.2, 0.9)
    cam.rotation_euler = (math.radians(83), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam


# ---- materials ----------------------------------------------------------------


def principled(name, **values):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    for key, value in values.items():
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value
    return material


def glass(tier):
    tint, ior, dispersion, _, _ = TIERS[tier]
    return principled(
        f"Glass {tier}",
        **{
            "Base Color": (*tint, 1),
            "Transmission Weight": 1.0,
            "Roughness": 0.0,
            "IOR": ior,
            "Dispersion": dispersion,
            "Coat Weight": 0.3,
        },
    )


def metal(tier):
    _, _, _, colour, roughness = TIERS[tier]
    return principled(
        f"Metal {tier}",
        **{"Base Color": (*colour, 1), "Metallic": 1.0, "Roughness": roughness},
    )


# ---- geometry -----------------------------------------------------------------


def body(family, material):
    if family == "disc":
        bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=1.0, depth=THICKNESS)
    elif family == "hex":
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=1.08, depth=THICKNESS)
        bpy.context.object.rotation_euler.z = math.radians(30)
        bpy.ops.object.transform_apply(rotation=True)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1.8)
        bpy.context.object.scale.z = THICKNESS / 1.8
        bpy.ops.object.transform_apply(scale=True)
    obj = bpy.context.object
    bevel = obj.modifiers.new("Bevel", "BEVEL")
    # Round the plate's corners in plan, chamfer every other edge: polished, not sharp.
    bevel.width = 0.34 if family == "plate" else 0.07
    bevel.segments = 12 if family == "plate" else 6
    if family == "plate":
        bevel.limit_method = "ANGLE"
        second = obj.modifiers.new("Edge", "BEVEL")
        second.width = 0.07
        second.segments = 6
    obj.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return obj


def wire(points, material, closed=False):
    curve = bpy.data.curves.new("Mark", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = WIRE
    curve.bevel_resolution = 6
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, (x, y) in zip(spline.points, points):
        point.co = ((x - 50) * MARK_SCALE * 1.75, -(y - 50) * MARK_SCALE * 1.75, 0, 1)
    spline.use_cyclic_u = closed
    obj = bpy.data.objects.new("Mark", curve)
    obj.data.materials.append(material)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def circle(cx, cy, r, material):
    points = [(cx + r * math.cos(t), cy + r * math.sin(t)) for t in (i * math.tau / 64 for i in range(64))]
    return wire(points, material, closed=True)


def outline(family, material):
    """The metal frame inside the glass, just in from its edge, sized in scene units."""
    unit = MARK_SCALE * 1.75
    if family == "disc":
        return circle(50, 50, 0.86 / unit, material)
    if family == "hex":
        r = 0.94 / unit
        corners = [(50 + r * math.cos(math.radians(60 * i)), 50 + r * math.sin(math.radians(60 * i))) for i in range(6)]
        return wire(corners, material, closed=True)
    half, rad = 0.76 / unit, 0.26 / unit
    points = []
    for cx, cy, start in ((50 + half - rad, 50 + half - rad, 0), (50 - half + rad, 50 + half - rad, 90), (50 - half + rad, 50 - half + rad, 180), (50 + half - rad, 50 - half + rad, 270)):
        points += [(cx + rad * math.cos(math.radians(start + a)), cy + rad * math.sin(math.radians(start + a))) for a in range(0, 91, 10)]
    return wire(points, material, closed=True)


def badge(mark, tier):
    family = FAMILY[mark]
    group = bpy.data.objects.new("Badge", None)
    bpy.context.scene.collection.objects.link(group)
    parts = [body(family, glass(tier))]
    gold = metal(tier)
    parts.append(outline(family, gold))
    for stroke in MARKS[mark]:
        parts.append(circle(*stroke, gold) if isinstance(stroke, tuple) else wire(stroke, gold))
    for part in parts:
        part.parent = group
    # Stood on its edge facing the camera, turned a little so the glass shows its depth.
    group.rotation_euler = (math.radians(90), 0, math.radians(-16))
    return group


# ---- main --------------------------------------------------------------------


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="renders")
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--samples", type=int, default=128)
    parser.add_argument("--only", action="append")
    parser.add_argument("--tier", action="append")
    parser.add_argument("--blend")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    for mark in args.only or MARKS:
        for tier in args.tier or TIERS:
            scene = reset()
            studio(scene)
            scene.render.resolution_x = scene.render.resolution_y = args.size
            scene.cycles.samples = args.samples
            badge(mark, tier)
            scene.render.filepath = os.path.join(args.out, f"{mark}-{tier}.png")
            bpy.ops.render.render(write_still=True)
            print("rendered", scene.render.filepath, flush=True)
            if args.blend:
                bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))


if __name__ == "__main__":
    main()
