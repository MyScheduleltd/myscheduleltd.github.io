# The 逃脫我的美麗 · ESCAPE MY BEAUTY arcade cabinet (the owner, 2026-11-10:
# a third machine beside M.O.T.H and the jukebox, themed on the game).
# Run inside Blender (MCP): exec(open(this file).read()). Builds a scene of
# clean modelled panels with the same footprint as the M.O.T.H cabinet
# (1.81 wide, 2.12 deep, 3.8 tall), Higgsfield GPT Image 2 artwork on the
# marquee and both sides, and a separate flat screen quad that carries the
# arcadeScreen extra the world mounts the live game on.
import bpy, bmesh, math
from mathutils import Vector

A = '/Users/myscheduleai/Desktop/myschedule-pivot/ps1-restyle-20261109/world/art/escape-arcade-20261110'
NAME = 'ESCAPE cabinet 20261110'

for ob in list(bpy.data.objects):
    if ob.name.startswith('ESCAPE') or ob.name.startswith('ArcadeScreen escape'):
        bpy.data.objects.remove(ob, do_unlink=True)
for me in list(bpy.data.meshes):
    if me.users == 0: bpy.data.meshes.remove(me)
if bpy.data.scenes.get(NAME): bpy.data.scenes.remove(bpy.data.scenes[NAME])
scene = bpy.data.scenes.new(NAME)
bpy.context.window.scene = scene
col = scene.collection


def lin(c): return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def material(mname, rgb, rough=.65, metal=0., image=None, emissive=None, strength=0.):
    m = bpy.data.materials.get(mname) or bpy.data.materials.new(mname)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    color = tuple(lin(c / 255) for c in rgb) + (1,)
    p.inputs['Base Color'].default_value = color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Emission Strength'].default_value = 0
    m.diffuse_color = color
    for n in [n for n in nt.nodes if n.type == 'TEX_IMAGE']: nt.nodes.remove(n)
    if image:
        img = bpy.data.images.load(f'{A}/{image}', check_existing=True); img.reload()
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Closest'
        nt.links.new(tex.outputs['Color'], p.inputs['Base Color'])
        if emissive:
            nt.links.new(tex.outputs['Color'], p.inputs['Emission Color'])
            p.inputs['Emission Strength'].default_value = strength
    elif emissive:
        p.inputs['Emission Color'].default_value = tuple(lin(c / 255) for c in emissive) + (1,)
        p.inputs['Emission Strength'].default_value = strength
    return m


teal = material('ESCAPE teal enamel', (36, 68, 62), .62)
cream = material('ESCAPE cream trim', (233, 220, 174), .55)
black = material('ESCAPE charcoal', (20, 22, 21), .75)
rust = material('ESCAPE rust red', (138, 51, 38), .5)
steel = material('ESCAPE coin steel', (110, 115, 109), .45, .5)
glow = material('ESCAPE coin light', (210, 70, 40), .4, emissive=(255, 90, 50), strength=2.)
side_art = material('ESCAPE side art', (255, 255, 255), .7, image='escape-side.png')
marquee_art = material('ESCAPE marquee art', (255, 255, 255), .45, image='escape-marquee.png', emissive=True, strength=.55)
# At rest the CRT shows the game's own title screen; the live game covers it in play.
glass = material('ESCAPE screen attract', (255, 255, 255), .2, image='escape-attract.png', emissive=True, strength=.8)

# Side profile (y, z); the front faces -Y, which is +Z in the Y-up GLB.
# The control deck climbs to just under the screen's cream bar, so the green
# deck shows below the screen while playing (the owner, 2026-11-10: the Exit
# and Fullscreen buttons sit on it). DECK_BACK is on the bezel's line, 0.04
# up from where the bezel used to start (1.64).
DECK_BACK = (-0.6516, 1.6791)
CORE = [(1.02, 0.0), (-0.78, 0.0), (-0.78, 1.26), (-1.04, 1.36), (-1.04, 1.50), DECK_BACK,
        (-0.38, 2.95), (-0.98, 3.00), (-1.02, 3.66), (-0.92, 3.78), (1.02, 3.78)]


def offset(poly, d):
    """The closed polygon pushed outward by d (the side panels' lip round the body)."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)) / 2
    s = 1 if area > 0 else -1
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e1 = (p1 - p0).normalized(); e2 = (p2 - p1).normalized()
        n1 = Vector((e1.y, -e1.x)) * s; n2 = Vector((e2.y, -e2.x)) * s
        m = (n1 + n2).normalized()
        out.append(tuple(p1 + m * (d / max(m.dot(n1), .3))))
    return out


def extrude(oname, poly, x0, x1, mat):
    me = bpy.data.meshes.new(oname); ob = bpy.data.objects.new(oname, me); col.objects.link(ob)
    bm = bmesh.new(); n = len(poly)
    a = [bm.verts.new((x0, y, z)) for y, z in poly]; b = [bm.verts.new((x1, y, z)) for y, z in poly]
    bm.faces.new(a); bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free(); me.materials.append(mat)
    return ob


W, INNER = .905, .845
body = extrude('ESCAPE body', CORE, -INNER, INNER, teal)
for m in (black, marquee_art, cream): body.data.materials.append(m)
me = body.data; me.uv_layers.new(name='UVMap')
uv = me.uv_layers['UVMap'].data
for f in me.polygons:
    nrm = f.normal
    if abs(nrm.x) > .9: continue
    zs = [me.vertices[v].co.z for v in f.vertices]
    if max(zs) <= 1.26 + 1e-4 and nrm.y < -.9: f.material_index = 1            # kick panel
    elif nrm.y > .9: f.material_index = 1                                          # back
    elif min(zs) >= 1.64 - 1e-4 and max(zs) <= 2.95 + 1e-4 and nrm.y < 0: f.material_index = 1  # bezel
    elif min(zs) >= 3.0 - 1e-4 and max(zs) <= 3.66 + 1e-4 and nrm.y < -.5: f.material_index = 2  # marquee
    elif min(zs) >= 1.36 - 1e-4 and max(zs) <= 1.5 + 1e-4 and nrm.y < -.9: f.material_index = 3  # deck lip
for f in me.polygons:
    for li in f.loop_indices:
        co = me.vertices[me.loops[li].vertex_index].co
        if f.material_index == 2:
            # u across the width, v up the face (3.0 to 3.66), lightly cropped to 2.56:1.
            uv[li].uv = (.03 + (co.x + INNER) / (2 * INNER) * .94, (co.z - 3.0) / .66)
        else:
            uv[li].uv = (co.x, co.z)

for side, (x0, x1) in (('left', (-W, -INNER)), ('right', (INNER, W))):
    panel = extrude(f'ESCAPE {side} side', offset(CORE, .03), x0, x1, cream)
    panel.data.materials.append(side_art)
    pm = panel.data; pm.uv_layers.new(name='UVMap'); puv = pm.uv_layers['UVMap'].data
    outward = -1 if side == 'left' else 1
    for f in pm.polygons:
        if f.normal.x * outward > .9: f.material_index = 1
        for li in f.loop_indices:
            co = pm.vertices[pm.loops[li].vertex_index].co
            # The art is 2:3 and the side 2.14 by 3.84: fit the height, crop the width,
            # with the cabinet's front towards the picture's right on both sides.
            v = (co.z + .02) / 3.84
            frac = (co.y + 1.07) / 2.14
            u = (1 - frac) if side == 'left' else frac
            puv[li].uv = (.5 + (u - .5) * (2.14 / (3.84 * 2 / 3)), v)


def finish(ob, mat):
    ob.data.materials.clear(); ob.data.materials.append(mat)
    if ob.name not in col.objects: col.objects.link(ob)
    for c in list(ob.users_collection):
        if c != col: c.objects.unlink(ob)
    return ob


def box(oname, size, at, mat, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(oname); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(oname, me); ob.location = at; ob.rotation_euler = rot
    return finish(ob, mat)


def cyl(oname, r, h, at, mat, rot=(0, 0, 0), segments=28):
    me = bpy.data.meshes.new(oname); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=h)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(oname, me); ob.location = at; ob.rotation_euler = rot
    return finish(ob, mat)


def sphere(oname, r, at, mat):
    me = bpy.data.meshes.new(oname); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=r)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(oname, me); ob.location = at
    return finish(ob, mat)


# Control deck: its top runs from (-1.04, 1.50) up to DECK_BACK.
tilt = math.atan2(DECK_BACK[1] - 1.50, DECK_BACK[0] + 1.04)
def on_deck(t): return (-1.04 + (DECK_BACK[0] + 1.04) * t, 1.50 + (DECK_BACK[1] - 1.50) * t)
y, z = on_deck(.12)
box('ESCAPE deck stripe', (2 * INNER, .07, .012), (0, y, z + .004), cream, (tilt, 0, 0))
# Placed and sized by the owner in Blender (2026-11-10), read back from that
# scene (escape-cabinet-owner-edit-20261110.blend): the stick and the three
# buttons in one row 0.81 in front of the cabinet's centre, about 60% of the
# way up the deck, the stick's shaft 0.101 long and its ball 0.096 across.
CONTROLS_Y = -.8125
cyl('ESCAPE joystick shaft', .019, .101, (-.38, CONTROLS_Y, 1.6357), black)
sphere('ESCAPE joystick ball', .0482, (-.38, CONTROLS_Y, 1.6997), rust)
for i, (bx, m) in enumerate(((.08, cream), (.3, rust), (.52, cream))):
    cyl(f'ESCAPE button {i}', .06, .05, (bx, CONTROLS_Y, 1.6155), m, (tilt, 0, 0))
# Coin door on the kick panel, and a cream rule along its top.
box('ESCAPE coin door', (.56, .04, .62), (0, -.80, .78), steel)
for dx in (-.13, .13):
    box('ESCAPE coin slot', (.05, .02, .14), (dx, -.825, .92), black)
    box('ESCAPE coin light', (.09, .02, .07), (dx, -.825, .72), glow)
box('ESCAPE kick stripe', (2 * INNER, .02, .06), (0, -.79, 1.2), cream)
# Cream bars along the marquee's bottom and top edges.
box('ESCAPE marquee bar', (2 * INNER + .02, .07, .05), (0, -.995, 3.0), cream)
box('ESCAPE marquee bar', (2 * INNER + .02, .07, .05), (0, -1.035, 3.66), cream)

# The screen: a flat quad in its own XZ plane facing -Y, tilted back with the bezel.
bez0, bez1 = Vector((-.66, 1.64)), Vector((-.38, 2.95))
mid = (bez0 + bez1) / 2
lean = math.atan2(bez1.x - bez0.x, bez1.y - bez0.y)
up = Vector((0, math.sin(lean), math.cos(lean)))          # up the bezel
out = Vector((0, -math.cos(lean), math.sin(lean)))        # out of the bezel, to the front
centre = Vector((0, mid.x, mid.y))
SW = 1.36; SH = SW / 1.196
me = bpy.data.meshes.new('ArcadeScreen escape'); bm = bmesh.new()
vs = [bm.verts.new((x, 0, z)) for x, z in ((-SW / 2, -SH / 2), (SW / 2, -SH / 2), (SW / 2, SH / 2), (-SW / 2, SH / 2))]
face = bm.faces.new(vs); bm.normal_update()
if face.normal.y > 0: face.normal_flip()
layer = bm.loops.layers.uv.new('UVMap')
for loop in face.loops: loop[layer].uv = (loop.vert.co.x / SW + .5, loop.vert.co.z / SH + .5)
bm.to_mesh(me); bm.free()
screen = bpy.data.objects.new('ArcadeScreen escape', me); col.objects.link(screen)
me.materials.append(glass)
screen.rotation_euler = (-lean, 0, 0)
screen.location = centre + out * .012
screen['arcadeScreen'] = True
for oname, size, d in (('ESCAPE bezel top', (SW + .12, .02, .05), SH / 2 + .035), ('ESCAPE bezel bottom', (SW + .12, .02, .05), -SH / 2 - .035)):
    box(oname, size, centre + out * .014 + up * d, cream, (-lean, 0, 0))
for sx in (-1, 1):
    box('ESCAPE bezel side', (.05, .02, SH + .12), centre + out * .014 + Vector((sx * (SW / 2 + .035), 0, 0)), cream, (-lean, 0, 0))

# Smooth finish (the owner, 2026-11-10: "the poly surface looks too rough,
# please smooth it out"): every edge rounded by a bevel, shaded smooth with
# hardened normals so flat panels stay flat and only the edges curve, and the
# round controls drawn with enough sides to read as round. The screen stays
# one flat quad: the live game is mounted on it.
def round_off(ob, width, segments):
    for p in ob.data.polygons: p.use_smooth = True
    if not width: return
    mod = ob.modifiers.new('Rounded edges', 'BEVEL')
    mod.width = width; mod.segments = segments
    mod.limit_method = 'ANGLE'; mod.angle_limit = math.radians(25)
    mod.harden_normals = True; mod.miter_outer = 'MITER_ARC'; mod.use_clamp_overlap = True


for ob in col.objects:
    ob['cabinetRole'] = 'screen' if ob.get('arcadeScreen') else ob.name.split(' ')[1]
    if ob.type != 'MESH': continue
    name = ob.name
    if ob.get('arcadeScreen'):
        for p in ob.data.polygons: p.use_smooth = False
    elif name == 'ESCAPE body': round_off(ob, .045, 4)
    elif name in ('ESCAPE left side', 'ESCAPE right side'): round_off(ob, .024, 4)
    elif 'joystick ball' in name: round_off(ob, 0, 0)
    elif 'joystick' in name or 'button' in name: round_off(ob, .008, 3)
    else: round_off(ob, .009, 3)


def export(path):
    """The cabinet alone (no review camera or light), Y-up, with its extras."""
    bpy.ops.object.select_all(action='DESELECT')
    for ob in col.objects:
        if ob.type == 'MESH' and not ob.name.startswith('REVIEW'): ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, use_active_scene=True, export_extras=True,
                              export_yup=True, export_apply=True, export_cameras=False, export_lights=False,
                              export_image_format='AUTO')
