"""Build the festival avatars from the Higgsfield rigged generations.

Since 2026-09-25 each sex is ONE body, worn under every outfit: the base
generation, in its swimwear (female-base / male-base, made from concept images
the owner approved, eyes with whites, fingers and toes). The tee, trousers and
shoes of the clothed generations (female / base) are lifted off them, carried
bone by bone onto the base skeleton, pushed clear of the skin and skinned as
the skin under them. The owner asked for the model to stay the same through
every outfit; separately generated bodies never quite matched.

So one file per body holds everything: the body, the garments, the prints, the
vest's hardware and the cap, on one skeleton and one texture. The swimsuit is
the body with the garments hidden; dressed, the skin under the garments is not
drawn (the dye mask's alpha), so nothing pokes through.

Also kept from the first generations' treatment: the generated lettering on the
male tee is painted out and the supplied artwork laid over as skinned decals;
the cap is a separate, removable mesh with the exact 我的檔期 mark, and a shape
key tucks the hair under it. The fused generated fingers are rebuilt with three
bones each and the thumb rigged (see rebuild_fingers), so hands can be posed
and tracked. The bind pose is the generated A-pose; the arms are lowered at
run time.

Run from world/:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
    -P scripts/prepare-higgsfield-avatars.py -- [source-dir]

Reads the `*-rigged.glb` files in the source directory and never writes there.
Writes src/assets/avatars/<sex>.glb, <sex>-dye.png, <sex>-vest.jpg and
avatars.json.
"""
import bpy, bmesh, os, sys, json, math, heapq
import numpy as np
from mathutils import Vector, Matrix
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
WORLD = os.path.dirname(HERE)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SOURCE = ARGS[0] if ARGS else os.path.abspath(os.path.join(WORLD, '../art/generated'))
# AVATAR_OUT / AVATAR_WORK send a trial build somewhere other than the game's assets.
OUT = os.environ.get('AVATAR_OUT') or os.path.join(WORLD, 'src/assets/avatars')
WORK = os.environ.get('AVATAR_WORK') or os.path.join(WORLD, '.artifacts/higgsfield-avatars')
PRINTS = os.path.join(WORLD, 'src/assets/outfits')
CAP_LOGO = os.path.join(WORLD, 'src/assets/cap-logo.png')
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

# key, source stem, sex, swimwear
HEIGHT = 1.7          # the male, crown of the hair to the sole
FLOOR = -0.85         # model origin mid-height, as the previous asset had it
FEMALE_NECK = 0.97    # her neck sits 3% lower than his: similar build, a little shorter
# The male neck height her size was set against, fixed: his body changed to
# the September 25 generation on 2026-10-04, whose neck bone sits 6 cm lower,
# and scaled from it she came out 6 cm shorter. She stays as approved.
HER_SCALE_NECK = 0.33188498
TEX = 2048
HEADS = {'Head', 'head_end', 'headfront'}
# Her avatar is the dressed generation whole (dressed_whole); off, the
# October 1 build (the female-base body with the dressed generation's clothes
# carried onto it).
#
# The owner, October 2, shown the generations side by side: her outfits are
# the dressed generation exactly as generated (female-rigged), and her
# swimsuit is the swim generation exactly as generated (female-swim-rigged,
# job b32d2eb7, the file the owner sent, its 我的檔期 cap part of the head):
# two whole models, swapped, nothing grafted. The female-base generation,
# which the October 1 build used, has another face and is not her.
FEMALE_WHOLE = os.environ.get('AVATAR_FEMALE_WHOLE', '1') == '1'
# Superseded the same night (owner, October 2, seeing the two side by side):
# "I like the female avatar in outfit 1 - 3, so just use the same avatar when
# she's in the swimming suit". Her dressed head, face, bob and clip in every
# outfit; in the swimsuit the swim generation's body (the owner's file) is
# under it, its own head taken off (swim_body_under_head in dressed_whole).
FEMALE_SWIM_MODEL = False
SWIM_BODY_STEM = 'female-swim'
# The owner's rule (restated 2026-10-01): ONE body per character, exactly as
# Higgsfield generated it, head and all; outfits are put on over it. Her
# outfits are her dressed generation's own tee, trousers and shoes, carried
# onto that body: no modelled bob, no repainted face, no modelled tee.
FEMALE_GENERATED_TEE = True
# His outfit as generated (trial): the dressed generation's tee, trousers and
# shoes carried onto his body, as hers once were, instead of the modelled tee
# and sneakers.
MALE_GENERATED_OUTFIT = os.environ.get('AVATAR_MALE_GENERATED', '0') == '1'
# His sneakers as Higgsfield generated them (the reference's chunky charcoal,
# red and cream pair), carried down onto his feet. The modelled clean shoes
# (September 28) read as a flat red shoe (the owner, 2026-10-04: "the colour
# is wrong").
GENERATED_SNEAKERS = os.environ.get('AVATAR_CLEAN_SHOES', '0') != '1'
# His hands exactly as his generation made them: rebuilt (palm lofted,
# fingers cut off at the knuckles and modelled) they met his September 25
# forearms in a broken ring at each wrist (the owner, 2026-10-04: "the hand
# wrists are broken ... just use this GLB as the male body throughout"). He
# has no finger bones then; fists and grips leave his hands as they are.
MALE_HANDS_AS_GENERATED = True
# The October 2 charcoal tee: off. Every reference sheet draws it black, and
# lifted to grey it read as "nothing like the references" (2026-10-04).
MALE_TEE_CHARCOAL = False
# Where the tee stops, measured down each clothed body's front centre line.
HEM = {'male': -.08, 'female': -.09}

report = {}

# Dye classes written into <variant>-dye.png (red channel = class * 40).
# ---------------------------------------------------------------- utilities

def added(action):
    before = set(bpy.data.objects)
    action()
    return [o for o in bpy.data.objects if o not in before]


def import_source(stem):
    # AVATAR_SOURCE_<STEM> (e.g. AVATAR_SOURCE_FEMALE_BASE) points one body at
    # another generation, to compare them through the same build.
    path = os.environ.get('AVATAR_SOURCE_' + stem.upper().replace('-', '_')) or os.path.join(SOURCE, stem + '-rigged.glb')
    new = added(lambda: bpy.ops.import_scene.gltf(filepath=path))
    arm = next(o for o in new if o.type == 'ARMATURE')
    body = next(o for o in new if o.type == 'MESH' and o.vertex_groups)
    for o in new:
        if o not in (arm, body):
            bpy.data.objects.remove(o, do_unlink=True)
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    return arm, body


def world_verts(body):
    co = np.empty(len(body.data.vertices) * 3, dtype=np.float64)
    body.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    m = np.array(body.matrix_world)
    return co @ m[:3, :3].T + m[:3, 3]


def bone_at(arm, name):
    return arm.matrix_world @ arm.data.bones[name].head_local


def bake(arm, body, M):
    """Fold every object transform plus M into the data; objects end at identity."""
    wa, wb = arm.matrix_world.copy(), body.matrix_world.copy()
    body.parent = None
    arm.data.transform(M @ wa)
    arm.matrix_world = Matrix.Identity(4)
    body.data.transform(M @ wb)
    body.matrix_world = Matrix.Identity(4)
    body.parent = arm
    body.matrix_parent_inverse = Matrix.Identity(4)
    for mod in body.modifiers:
        if mod.type == 'ARMATURE':
            mod.object = arm
    bpy.context.view_layer.update()


def owners(body):
    """The bone carrying most weight on each face."""
    names = [g.name for g in body.vertex_groups]
    result = []
    for p in body.data.polygons:
        ww = defaultdict(float)
        for i in p.vertices:
            for g in body.data.vertices[i].groups:
                ww[names[g.group]] += g.weight
        result.append(max(ww, key=ww.get) if ww else '')
    return result


def keep_faces(obj, keep):
    """Delete every face whose index is not in `keep`, then loose vertices."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def duplicate(obj, name):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    bpy.context.collection.objects.link(copy)
    return copy


def image_of(mat):
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    return bsdf.inputs['Base Color'].links[0].from_node.image


def pixels(img):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def downsample(a, factor):
    h, w, c = a.shape
    return a.reshape(h // factor, factor, w // factor, factor, c).mean(axis=(1, 3))


def new_image(name, arr, path, fmt):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=arr.shape[2] == 4 and fmt == 'PNG')
    rgba = arr if arr.shape[2] == 4 else np.concatenate([arr, np.ones((h, w, 1), np.float32)], axis=2)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = fmt
    if fmt == 'JPEG':
        bpy.context.scene.render.image_settings.quality = 88
    img.save()
    img.reload()
    return img


def plain_material(name, img, alpha=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 1
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Emission Strength'].default_value = 0
    if img is not None:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.interpolation = 'Closest'
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha:
            # Prints are projected past their own edges; clamp, never tile.
            tex.extension = 'EXTEND'
            links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
            mat.blend_method = 'CLIP' if hasattr(mat, 'blend_method') else None
    return mat


def face_uvs(obj):
    """Per face: list of UV corners, in the active layer."""
    uv = obj.data.uv_layers.active.data
    return [[uv[li].uv.copy() for li in p.loop_indices] for p in obj.data.polygons]


def raster(mask, tris, w, h, value=True):
    """Write `value` into `mask` (h×w) under each UV triangle."""
    for t in tris:
        p = np.array([[c[0] * w, c[1] * h] for c in t])
        x0, y0 = np.floor(p.min(axis=0)).astype(int)
        x1, y1 = np.ceil(p.max(axis=0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, w - 1), min(y1, h - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        (ax, ay), (bx, by), (cx, cy) = p
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12:
            continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        inside = (l1 >= -.02) & (l2 >= -.02) & (1 - l1 - l2 >= -.02)
        mask[y0:y1 + 1, x0:x1 + 1][inside] = value


def triangles(corners):
    return [(corners[0], corners[i], corners[i + 1]) for i in range(1, len(corners) - 1)]


def lum(rgb):
    return rgb[..., 0] * .2126 + rgb[..., 1] * .7152 + rgb[..., 2] * .0722


def colour_class(rgb):
    """Coarse reading of a texel (display-space RGB): skin, hair, dark cloth, light, other."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    y = lum(rgb)
    skin = (r > .55) & (r > g * 1.04) & (g > b * 1.04) & (r - b > .14)
    hair = ~skin & (y > .07) & (y < .5) & (r > b * 1.06)
    dark = ~skin & ~hair & (y <= .12)
    light = ~skin & (y > .5)
    out = np.full(y.shape, 'other', dtype=object)
    out[dark] = 'dark'
    out[light] = 'light'
    out[hair] = 'hair'
    out[skin] = 'skin'
    return out


_pixel_cache = {}


def face_texels(obj):
    """Per face, the texels at its centre and part-way to each corner."""
    uv = obj.data.uv_layers.active.data
    result = []
    for p in obj.data.polygons:
        img = image_of(obj.data.materials[p.material_index])
        if img.name not in _pixel_cache:
            _pixel_cache[img.name] = pixels(img)[..., :3]
        px = _pixel_cache[img.name]
        h, w = px.shape[:2]
        corners = [uv[li].uv for li in p.loop_indices]
        centre = sum((Vector(c) for c in corners), Vector((0, 0))) / len(corners)
        samples = [centre] + [centre.lerp(Vector(c), .6) for c in corners]
        result.append(np.array([px[min(h - 1, max(0, int(s.y * h))), min(w - 1, max(0, int(s.x * w)))] for s in samples]))
    return result


def face_samples(obj):
    """Mean display-space colour of each face."""
    return [t.mean(axis=0) for t in face_texels(obj)]


def face_colours(obj):
    """The texture's majority reading of each face."""
    result = []
    for rgb in face_texels(obj):
        classes = list(colour_class(rgb))
        result.append(max(set(classes), key=classes.count))
    return result


# ------------------------------------------------------------ body fixes

LEG_BONES = ('UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe')


def smooth_skin(body):
    """Smooth shading on bare skin. The generator's normals are faceted in
    patches, and a few hundred skin faces were flat-shaded outright: arms,
    shoulders and legs showed angular facets. Every skin face outside the
    head (whose planes are drawn on purpose) takes the smooth normal of the
    surface; cloth, hair and shoes keep theirs."""
    me = body.data
    own = owners(body)
    samples = face_samples(body)
    def skinlike(rgb):
        r, g, b = (float(x) for x in rgb)
        return r >= g >= b and r - b > .08 and float(lum(rgb)) > .3
    # Every face, head and hair included, as the generated file shades them.
    # Welding the seams drops the file's smooth normals; restored on "skin"
    # faces only, the rest drew flat: a patchwork of triangles on his legs
    # and chest, and every lump of her face (owner, September 30).
    skin = list(range(len(me.polygons)))
    tmp = me.copy()
    tmp.normals_split_custom_set([(0.0, 0.0, 0.0)] * len(tmp.loops))
    for p in tmp.polygons:
        p.use_smooth = True
    tmp.update()
    smooth = [Vector(n.vector) for n in tmp.corner_normals]
    bpy.data.meshes.remove(tmp)
    # One normal per point: the faces either side of a split (the covered
    # edges, her neck's join) were shaded apart, and drew a line round her
    # neck like a row of stitches (the owner, 2026-10-04).
    at_point = defaultdict(lambda: Vector((0.0, 0.0, 0.0)))
    corner_key = [position_key(me.vertices[me.loops[li].vertex_index].co) for li in range(len(me.loops))]
    for li, k in enumerate(corner_key):
        at_point[k] += smooth[li]
    smooth = [tuple(at_point[k].normalized()) for k in corner_key]
    current = [tuple(n.vector) for n in me.corner_normals]
    loops = {li for i in skin for li in me.polygons[i].loop_indices}
    for i in skin:
        me.polygons[i].use_smooth = True
    me.normals_split_custom_set([smooth[li] if li in loops else current[li] for li in range(len(me.loops))])
    me.update()
    return len(skin)


def split_legs(arm, body):
    """Below the crotch, each trouser leg follows its own leg only.

    The generator weighted the inside of each wide trouser leg partly to the
    other leg, as far down as the knee on the female. Walking, those vertices
    were pulled towards the passing leg and the two legs of the trousers
    looked stuck together. The legs are separate surfaces there, so every
    vertex is handed wholly to the leg that carries most of it, blending in
    over five centimetres below the crotch."""
    bones = arm.data.bones
    crotch = min(bones['LeftUpLeg'].head_local.z, bones['RightUpLeg'].head_local.z)
    names = {g.index: g.name for g in body.vertex_groups}
    groups = {g.name: g for g in body.vertex_groups}
    moved = 0
    for v in body.data.vertices:
        f = (crotch - .03 - v.co.z) / .05
        if f <= 0:
            continue
        f = min(1.0, f)
        f = f * f * (3 - 2 * f)
        legs = {'Left': 0.0, 'Right': 0.0}
        for g in v.groups:
            n = names[g.group]
            for side in legs:
                if n.startswith(side) and any(k in n for k in LEG_BONES):
                    legs[side] += g.weight
        if min(legs.values()) < 1e-4:
            continue
        keep = max(legs, key=legs.get)
        other = 'Right' if keep == 'Left' else 'Left'
        for g in list(v.groups):
            n = names[g.group]
            if not (n.startswith(other) and any(k in n for k in LEG_BONES)):
                continue
            twin = keep + n[len(other):]
            if twin not in groups:
                continue
            w = g.weight * f
            groups[n].add([v.index], g.weight - w, 'REPLACE')
            groups[twin].add([v.index], w, 'ADD')
            moved += 1
    return moved


def head_rigid(body, fit):
    """Everything of the head above the cap's band follows the head bone
    alone. Hair at the back of the head was partly weighted to the neck; as
    the head turned it lagged behind the cap, which the head carries rigidly,
    and showed through it."""
    names = {g.index: g.name for g in body.vertex_groups}
    head = body.vertex_groups.get('Head')
    moved = 0
    for v in body.data.vertices:
        local = cap_local(fit, v.co)
        if local.z < -.02:
            continue
        others = [(names[g.group], g.weight) for g in v.groups if names[g.group] not in HEADS and g.weight > 0]
        if not others:
            continue
        for n, _ in others:
            body.vertex_groups[n].remove([v.index])
        head.add([v.index], sum(w for _, w in others), 'ADD')
        moved += 1
    return moved


def hair_rigid(arm, body):
    """All the hair follows the head bone alone. The bob's ends were partly
    weighted to the neck, so when the chest turned a quarter round on a
    skateboard the ends twisted away from the rest of the hair."""
    head = body.vertex_groups.get('Head')
    neck_z = arm.data.bones['neck'].head_local.z
    names = {g.index: g.name for g in body.vertex_groups}
    own = owners(body)
    cls = face_colours(body)
    verts = set()
    for p, o, c in zip(body.data.polygons, own, cls):
        if c in ('hair', 'dark') and (o in HEADS or o == 'neck') and p.center.z > neck_z - .02:
            verts.update(p.vertices)
    moved = 0
    for i in verts:
        v = body.data.vertices[i]
        others = [(names[g.group], g.weight) for g in v.groups if names[g.group] not in HEADS and g.weight > 0]
        if not others:
            continue
        for n, _ in others:
            body.vertex_groups[n].remove([i])
        head.add([i], sum(w for _, w in others), 'ADD')
        moved += 1
    return moved


def weld(body):
    """Merge the copies of each point the generator split along every UV seam."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    count = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    count -= len(bm.verts)
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    return count


def join_into(body, parts):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()


# ------------------------------------------------------------ fingers
# The generated fingers are fused for most of their length and triangulated at
# random, so no finger could bend on its own and any bend would crumple. Each
# hand keeps its generated palm and thumb; the four fingers are cut off at the
# knuckles and rebuilt as tubes with three edge loops at every joint, textured
# from the fingers they replace, three bones each. The thumb keeps its own
# geometry and gets three bones. Every finger bone's local Z faces the palm, so
# a positive turn about local X curls it in.
FINGERS = ('Index', 'Middle', 'Ring', 'Pinky')      # from the thumb's side
# The knuckle (MCP) as a fraction of wrist to longest fingertip.
KNUCKLE = {'Index': .555, 'Middle': .56, 'Ring': .55, 'Pinky': .52}
PHALANGES = (.45, .30, .25)                          # of each finger's length
REST_BEND = .2                                       # radians at each finger joint
RING_SIDES = 8


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def hand_frame(V, wrist, side):
    """Along the hand, across it toward the thumb, and out of the palm."""
    sign = 1 if side == 'Left' else -1
    far = V[np.argsort(-np.linalg.norm(V - wrist, axis=1))[:max(8, len(V) // 10)]].mean(0)
    along = (far - wrist) / np.linalg.norm(far - wrist)
    # Width is the widest direction of the palm perpendicular to its length.
    # Generated rigs do not share a palm facing direction; world -Y was the
    # thickness axis on the male, producing four needles on inflated knuckles.
    plane=(V-wrist)-np.outer((V-wrist)@along,along)
    _,axes=np.linalg.eigh(np.cov(plane.T))
    across=axes[:,-1]
    across-=along*(across@along);across/=np.linalg.norm(across)
    if across@np.array([0,-1,0.])<0:across=-across
    palm = np.cross(along, across)
    if palm @ np.array([-sign, 0, 0]) < 0:           # the palms face the thighs
        palm = -palm
    return along, across, palm


def measure_hand(arm, body, side):
    """Fingertips, knuckle line, widths and the thumb, from the generated hand."""
    names = [g.name for g in body.vertex_groups]
    gi = names.index(side + 'Hand')
    owned = [v.index for v in body.data.vertices
             if any(g.group == gi and g.weight > .5 for g in v.groups)]
    V = np.array([body.data.vertices[i].co[:] for i in owned])
    wrist = np.array(arm.data.bones[side + 'Hand'].head_local[:])
    along, across, palm = hand_frame(V, wrist, side)
    P = np.stack([(V - wrist) @ across, (V - wrist) @ along, (V - wrist) @ palm], 1)
    L = P[:, 1].max()
    # Four fingertips: the far end of the hand split four ways across it.
    zone = np.where(P[:, 1] > .78 * L)[0]
    x = P[zone, 0]
    cent = np.percentile(x, [88, 63, 37, 12])
    for _ in range(40):
        lab = np.argmin(abs(x[:, None] - cent[None]), 1)
        cent = np.array([x[lab == k].mean() if (lab == k).any() else cent[k] for k in range(4)])
    tips, tip_rows = [], []
    for k in range(4):
        m = zone[lab == k]
        row = m[np.argmax(P[m, 1])]
        tip = P[row]
        near = P[np.linalg.norm(P - tip, axis=1) < .014]
        tips.append(np.array([tip[0], tip[1], near[:, 2].mean()]))
        tip_rows.append(row)
    spacing = float(np.mean(np.abs(np.diff(cent))))
    # The palm where the fingers are cut: its width sets the four tubes.
    cut = min(KNUCKLE.values()) * L - .004
    band = P[(abs(P[:, 1] - cut) < .012) & (P[:, 0] < cent[0] + .55 * spacing)]
    lo, hi = band[:, 0].min(), band[:, 0].max()
    thick_lo, thick_hi = band[:, 2].min(), band[:, 2].max()
    # Past the knuckle line the hand is two pieces: the four fingers, joined,
    # and the top of the thumb. The thumb is that second piece, followed back
    # over the surface toward the wrist for a thumb's length.
    row_of = {v: r for r, v in enumerate(owned)}
    adj = defaultdict(set)
    for e in body.data.edges:
        a, b = (row_of.get(i) for i in e.vertices)
        if a is not None and b is not None:
            adj[a].add(b)
            adj[b].add(a)
    above = set(np.where(P[:, 1] > cut)[0])
    pieces, seen = [], set()
    for start in above:
        if start in seen:
            continue
        piece, stack = [], [start]
        seen.add(start)
        while stack:
            x = stack.pop()
            piece.append(x)
            for n in adj[x]:
                if n in above and n not in seen:
                    seen.add(n)
                    stack.append(n)
        pieces.append(piece)
    finger_rows = set(r for piece in pieces if set(piece) & set(tip_rows) for r in piece)
    thumb_top = [r for piece in pieces if not set(piece) & set(tip_rows) and len(piece) >= 5
                 and P[piece, 0].max() > cent[0] for r in piece]
    thumb_rows = []
    if thumb_top:
        tip_row = max(thumb_top, key=lambda r: P[r, 1])
        reach = .62 * L
        dist = {tip_row: 0.0}
        queue = [(0.0, tip_row)]
        while queue:
            dd, x = heapq.heappop(queue)
            if dd > dist.get(x, 1e9) or dd > reach:
                continue
            for n in adj[x]:
                if n in finger_rows:
                    continue
                nd = dd + float(np.linalg.norm(P[n] - P[x]))
                if nd < dist.get(n, 1e9):
                    dist[n] = nd
                    heapq.heappush(queue, (nd, n))
        thumb_rows = [r for r, dd in dist.items() if dd <= reach]
        ring = [r for r in thumb_rows if dist[r] > .8 * reach]
        tip_t = P[tip_row]
        base_t = P[ring].mean(0) if ring else P[thumb_rows].mean(0)
    else:
        tip_t = P[np.argmax(P[:, 0])]
        base_t = np.array([cent[0], .12 * L, (thick_lo + thick_hi) / 2])
    thumb = [owned[r] for r in thumb_rows]
    to_world = lambda q: wrist + across * q[0] + along * q[1] + palm * q[2]
    return {
        'wrist': wrist, 'along': along, 'across': across, 'palm': palm, 'L': L, 'cut': cut,
        'owned': owned, 'P': P, 'spacing': spacing, 'span': (lo, hi), 'thickness': (thick_lo, thick_hi),
        'tips': tips, 'centres': cent, 'thumb': thumb, 'thumbTip': to_world(tip_t), 'thumbBase': to_world(base_t),
        'thumbPoints': [body.data.vertices[i].co.copy() for i in thumb],
        'fingerVerts': set(owned[r] for r in finger_rows), 'to_world': to_world,
    }


def finger_chain(h, k, name):
    """Knuckle to fingertip centre as three phalanges, relaxed."""
    L, (lo, hi) = h['L'], h['span']
    width = (hi - lo) / 4
    x = hi - width * (k + .5)                        # the index on the thumb's side
    a = KNUCKLE[name] * L
    tip = h['tips'][k]
    # The palm's own depth over this finger at the cut: the knuckle is
    # centred in it and as deep, so the finger leaves the hand flush.
    P = h['P']
    over = P[(abs(P[:, 1] - h['cut']) < .014) & (abs(P[:, 0] - x) < width * .5)]
    thick = (over[:, 2].min(), over[:, 2].max()) if len(over) >= 3 else h['thickness']
    knuckle = np.array([x, a, (thick[0] + thick[1]) / 2])
    length = {'Index': .37, 'Middle': .41, 'Ring': .38, 'Pinky': .30}[name] * L
    end = np.array([x, a + length, knuckle[2] + length * .13])
    # The shape at unit length, bent REST_BEND at each of the two joints.
    heads = [np.zeros(2)]
    for i, l in enumerate(PHALANGES):
        heads.append(heads[-1] + l * np.array([math.cos(i * REST_BEND), math.sin(i * REST_BEND)]))
    chord = heads[-1]
    want = np.array([end[1] - knuckle[1], end[2] - knuckle[2]])
    scale = np.linalg.norm(want) / np.linalg.norm(chord)
    turn = math.atan2(want[1], want[0]) - math.atan2(chord[1], chord[0])
    c, s_ = math.cos(turn), math.sin(turn)
    joints = []
    for i, p in enumerate(heads):
        q = scale * np.array([c * p[0] - s_ * p[1], s_ * p[0] + c * p[1]])
        f = i / 3
        joints.append(h['to_world'](np.array([knuckle[0] * (1 - f) + end[0] * f, knuckle[1] + q[0], knuckle[2] + q[1]])))
    return joints, width, float(thick[1] - thick[0])


def finger_mesh(h, joints, width, palm_thickness, name, side):
    """One finger: rings of RING_SIDES, three at each joint, a rounded tip."""
    d = [(joints[i + 1] - joints[i]) / np.linalg.norm(joints[i + 1] - joints[i]) for i in range(3)]
    seg = [np.linalg.norm(joints[i + 1] - joints[i]) for i in range(3)]
    S = [0, seg[0], seg[0] + seg[1], sum(seg)]
    w = width * .88
    t = min(w * .86, palm_thickness * .62)
    delta = min(seg) * .22
    bones = [side + 'Hand' + name + str(i) for i in (1, 2, 3)]
    hand = side + 'Hand'
    # (arc position, scale, weights)
    # The knuckle no wider than the finger: rings flared past it read as
    # swollen joints.
    rings = [(-w * .45, 1.0, {hand: .5, bones[0]: .5}), (0, 1.0, {hand: .2, bones[0]: .8}),
             (S[1] * .5, 1.0, {bones[0]: 1})]
    for j in (1, 2):
        rings += [(S[j] - delta, 1, {bones[j - 1]: .8, bones[j]: .2}), (S[j], 1, {bones[j - 1]: .5, bones[j]: .5}),
                  (S[j] + delta, 1, {bones[j - 1]: .2, bones[j]: .8})]
        rings.append(((S[j] + S[j + 1]) / 2 if j == 1 else S[3] - t * .3, 1, {bones[j]: 1}))
    rings += [(S[3] + t * .06, .9, {bones[2]: 1}), (S[3] + t * .24, .66, {bones[2]: 1})]

    def at(s):
        if s <= 0:
            return joints[0] + d[0] * s, d[0]
        for i in range(3):
            if abs(s - S[i]) < 1e-9 and i > 0:
                v = d[i - 1] + d[i]
                return joints[i], v / np.linalg.norm(v)
            if s < S[i + 1] or i == 2:
                return joints[i] + d[i] * (s - S[i]), d[i]
    verts, weights, faces = [], [], []
    for s, scale, ww in rings:
        c, direction = at(s)
        lat = h['across'] - direction * (h['across'] @ direction)
        lat /= np.linalg.norm(lat)
        up = np.cross(direction, lat)
        if up @ h['palm'] < 0:
            up = -up
        taper = 1 - .14 * max(0, min(1, s / S[3]))
        # A knuckle as deep as the palm it leaves, easing to the finger.
        # Only where it leaves the palm is it as deep as the palm, easing to
        # the finger's own depth within a third of the first bone.
        depth = t + (min(palm_thickness * .9, w * 1.3) - t) * (1 - smoothstep(-w * .2, S[1] * .35, s))
        for k in range(RING_SIDES):
            ang = 2 * math.pi * (k + .5) / RING_SIDES
            cx, cy = math.cos(ang), math.sin(ang)
            sx, sy = math.copysign(abs(cx) ** .7, cx), math.copysign(abs(cy) ** .7, cy)
            verts.append(c + lat * (w / 2 * taper * scale * sx) + up * (depth / 2 * taper * scale * sy))
            weights.append(ww)
    n = len(rings)
    for r in range(n - 1):
        for k in range(RING_SIDES):
            a, b = r * RING_SIDES + k, r * RING_SIDES + (k + 1) % RING_SIDES
            faces.append((a, b, b + RING_SIDES, a + RING_SIDES))
    c_end, d_end = at(S[3])
    verts.append(c_end + d_end * t * .36)
    weights.append({bones[2]: 1})
    pole = len(verts) - 1
    last = (n - 1) * RING_SIDES
    faces += [(last + k, last + (k + 1) % RING_SIDES, pole) for k in range(RING_SIDES)]
    c0, _ = at(-w * .45)
    verts.append(c0 - d[0] * w * .2)
    weights.append({hand: .5, bones[0]: .5})
    base = len(verts) - 1
    faces += [((k + 1) % RING_SIDES, k, base) for k in range(RING_SIDES)]
    return verts, weights, faces


# ------------------------------------------------------------ palm
# The male generation's wrist is a balloon (12.5 x 9 cm where the female's is
# 7 x 5) and its thumb a flat stub. Squeezing it (the September 29
# refine_wrist_volume) clamped the balloon about the wrist bone, which is not
# the middle of the arm, and crumpled the palm and the thumb into it. So, as
# with the fingers, the hand is cut off above the wrist and modelled instead:
# the forearm stub is slimmed, then rings of a rounded box are lofted from the
# cut, through a narrower wrist and a palm with the thumb's pad, to a cap round
# the finger roots. The thumb is a tube on the thumb bones. Everything new is
# textured from the palm it replaces. Distances are in the hand's own frame:
# l along it from the wrist bone, x across it toward the thumb, z out of the palm.
PALM_CUT = -.05          # l of the cut, where the balloon begins
FOREARM_SLIM = -.16      # l where slimming the forearm stub starts
# (l, half-width, half-thickness); the knuckle rows are fitted to the fingers.
PALM_ROWS = [(-.03, .033, .023), (-.008, .031, .020), (.012, .038, .019),
             (.032, .042, .018), (.052, .043, .016)]
THUMB = {'base': (.026, 0.0, .004), 'lengths': (.036, .028, .024), 'width': .026,
         # directions of the three bones as (x, l, z): out off the palm's
         # edge, then round toward the index, the tip level with the knuckles
         'dirs': ((.55, .70, .40), (.25, .90, .30), (.02, .96, .20))}


def rebuild_palm(arm, body):
    """Replace the generated wrist, palm and thumb of both hands (see above)."""
    if body.data.shape_keys:
        raise RuntimeError('rebuild_palm runs before any shape key exists')
    from mathutils.bvhtree import BVHTree
    from mathutils.interpolate import poly_3d_calc
    names = [g.name for g in body.vertex_groups]
    gindex = {n: i for i, n in enumerate(names)}
    finger_groups = {i for i, n in enumerate(names) if any(n.startswith(s + 'Hand' + f) for s in ('Left', 'Right') for f in FINGERS)}
    out = {}
    for side in ('Left', 'Right'):
        B = arm.data.bones
        W = np.array(B[side + 'Hand'].head_local)
        knuckle = {n: np.array(B[side + 'Hand' + n + '1'].head_local) for n in FINGERS}
        along = np.mean(list(knuckle.values()), 0) - W
        along /= np.linalg.norm(along)
        across = knuckle['Index'] - knuckle['Pinky']
        across -= along * (across @ along)
        across /= np.linalg.norm(across)
        # Bone.z_axis is expressed relative to its parent. Mesh vertices and
        # knuckle positions are in armature space, so use matrix_local here.
        palm = np.array(B[side + 'HandIndex1'].matrix_local.to_3x3().col[2])
        palm -= along * (palm @ along) + across * (palm @ across)
        palm /= np.linalg.norm(palm)
        local = lambda co: np.array([(np.array(co) - W) @ across, (np.array(co) - W) @ along, (np.array(co) - W) @ palm])
        world = lambda x, l, z: W + across * x + along * l + palm * z
        mine = {gindex[n] for n in (side + 'Hand', side + 'ForeArm')} | {gindex[n] for n in names if n.startswith(side + 'HandThumb')}

        def ours(v):
            ww = {g.group: g.weight for g in v.groups}
            if any(ww.get(g, 0) > 0 for g in finger_groups):
                return False
            return sum(w for g, w in ww.items() if g in mine) > .5

        # The finger roots: across the four, and how deep the tubes are.
        K = {n: local(p) for n, p in knuckle.items()}
        tube = defaultdict(list)
        for v in body.data.vertices:
            for g in v.groups:
                if g.weight > .5 and names[g.group] in {side + 'Hand' + n + '1' for n in FINGERS}:
                    tube[names[g.group]].append(local(v.co))
        tx = np.concatenate([np.array(p)[:, 0] for p in tube.values()])
        tz = np.concatenate([np.array(p)[:, 2] for p in tube.values()])
        kl = float(np.mean([k[1] for k in K.values()]))
        kx, kz = (tx.min() + tx.max()) / 2, (tz.min() + tz.max()) / 2
        khx, khz = (tx.max() - tx.min()) / 2 + .003, (tz.max() - tz.min()) / 2 + .003

        # What the new skin is textured from: this hand past the cut.
        source = duplicate(body, body.name + '-palm-source')
        keep = {p.index for p in body.data.polygons
                if all(ours(body.data.vertices[i]) for i in p.vertices)
                and local(p.center)[1] > PALM_CUT - .005}
        keep_faces(source, keep)
        src = source.data
        # Only faces whose texels all read as skin: the balloon's folds were
        # painted dark, and a thumb textured from one came out with a brown streak.
        clean = [i for i, t in enumerate(face_texels(source)) if (colour_class(t) == 'skin').all()]
        if len(clean) < 20:
            clean = list(range(len(src.polygons)))
        tree = BVHTree.FromPolygons([v.co.copy() for v in src.vertices], [tuple(src.polygons[i].vertices) for i in clean])

        # Slim the forearm stub toward the cut, about its own centre line.
        region = [v for v in body.data.vertices if ours(v)]
        P = np.array([local(v.co) for v in region])

        def centre(l0, l1):
            m = (P[:, 1] >= l0) & (P[:, 1] <= l1)
            return np.array([(P[m, 0].min() + P[m, 0].max()) / 2, (P[m, 2].min() + P[m, 2].max()) / 2])
        c_far, c_cut = centre(FOREARM_SLIM - .02, FOREARM_SLIM + .01), centre(PALM_CUT - .012, PALM_CUT)
        at_cut = P[(P[:,1]>PALM_CUT-.012)&(P[:,1]<PALM_CUT+.006)]
        cut_radius = (at_cut[:,(0,2)].max(0)-at_cut[:,(0,2)].min(0))*.5
        ratio = np.minimum(1.0, np.array([.036,.022])/cut_radius)
        fore_axis = W-np.array(B[side+'ForeArm'].head_local)
        def bone_centre(l):
            co = W + fore_axis*(l/(fore_axis@along))
            return local(co)[[0,2]]
        for v, p in zip(region, P):
            if not FOREARM_SLIM < p[1] < PALM_CUT + .02:
                continue
            f = smoothstep(FOREARM_SLIM, PALM_CUT, p[1])
            old_c = c_far + (c_cut - c_far) * (p[1] - FOREARM_SLIM) / (PALM_CUT - FOREARM_SLIM)
            c = old_c*(1-f)+bone_centre(p[1])*f
            radial = (p[[0,2]]-old_c)*(1+(ratio-1)*f)
            v.co = Vector(world(c[0]+radial[0],p[1],c[1]+radial[1]))
        body.data.update()

        # Cut, and find the opening.
        bm = bmesh.new()
        bm.from_mesh(body.data)
        deform = bm.verts.layers.deform.verify()
        uv = bm.loops.layers.uv.active
        own = lambda v: (not any(v[deform].get(g, 0) > 0 for g in finger_groups)
                         and sum(w for g, w in v[deform].items() if g in mine) > .5)
        faces = [f for f in bm.faces if all(own(v) for v in f.verts) and local(f.calc_center_median())[1] > PALM_CUT - .03]
        geom = list({v for f in faces for v in f.verts}) + list({e for f in faces for e in f.edges}) + faces
        plane = Vector(world(0, PALM_CUT, 0))
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=plane, plane_no=Vector(along), clear_outer=True)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        edges = [e for e in bm.edges if e.is_boundary and all(abs((v.co - plane).dot(Vector(along))) < 1e-4 for v in e.verts)]
        # The largest loop of the opening (a stray sliver can make a small one).
        loops, seen = [], set()
        for e in edges:
            if e in seen:
                continue
            ring, stack = [], [e]
            seen.add(e)
            while stack:
                x = stack.pop()
                ring.append(x)
                for v in x.verts:
                    for n in v.link_edges:
                        if n in edges and n not in seen:
                            seen.add(n)
                            stack.append(n)
            loops.append(ring)
        ring_edges = max(loops, key=len)
        for small in loops:
            if small is not ring_edges:
                bmesh.ops.triangle_fill(bm, edges=small, use_beauty=True)
        # Walk it in order.
        start = ring_edges[0].verts[0]
        order, prev = [start], None
        link = defaultdict(list)
        for e in ring_edges:
            a, b = e.verts
            link[a].append(b)
            link[b].append(a)
        while True:
            nxt = [n for n in link[order[-1]] if n is not prev]
            if not nxt or nxt[0] is start:
                break
            prev = order[-1]
            order.append(nxt[0])
        rim = np.array([local(v.co) for v in order])
        area = sum(rim[i,0]*rim[(i+1)%len(rim),2]-rim[(i+1)%len(rim),0]*rim[i,2] for i in range(len(rim)))
        if area < 0:
            order.reverse();rim=rim[::-1].copy()
        centre_cut = bone_centre(PALM_CUT)
        theta0 = math.atan2((rim[0,2]-centre_cut[1])/.022,(rim[0,0]-centre_cut[0])/.036)
        lengths=np.linalg.norm(np.roll(rim,-1,axis=0)-rim,axis=1)
        cumulative=np.concatenate(([0.],np.cumsum(lengths[:-1])))
        theta=theta0+math.tau*cumulative/lengths.sum()
        # Make the original cuff boundary a regular volume centred on the
        # actual forearm joint line. The supplied balloon rim was offset from
        # that line and remained a large sharp fan even with a straight wrist.
        for v,t in zip(order,theta):
            c,s=math.cos(t),math.sin(t)
            v.co=Vector(world(centre_cut[0]+.036*math.copysign(abs(c)**.75,c),PALM_CUT,centre_cut[1]+.022*math.copysign(abs(s)**.75,s)))
            v[deform].clear();v[deform][gindex[side+'ForeArm']]=1.
        cx0,cz0=centre_cut
        out[side]={'loop':len(order),'backStep':0.,'cutHalfWidth':.036,'cutHalfDepth':.022,'cutCentre':list(centre_cut)}
        out[side]['loftBackStep'] = 0.0

        # Rows: the palm's own, then the knuckle rows fitted round the finger roots.
        # The palm ends at the knuckle line: any further and it swallows the
        # first finger bones and the fingers read stubby.
        rows = PALM_ROWS + [(kl - .012, khx + .001, khz + .002), (kl - .003, khx, khz),
                            (kl + .003, khx * .86, khz * .78), (kl + .007, khx * .58, khz * .5)]
        def row_centre(l):
            f = smoothstep(PALM_CUT, kl - .02, l)
            return cx0 + (kx - cx0) * f, cz0 + (kz - cz0) * f

        def thenar(l, t):
            # The thumb's pad: on the palm side of the thumb's edge, fading by the knuckles.
            lobe = max(0.0, math.cos(t - math.radians(35))) ** 3
            return .008 * lobe * math.sin(math.pi * min(1, max(0, (l + .005) / .065)))
        rings = [order]
        for l, hx, hz in rows:
            cx, cz = row_centre(l)
            ring = []
            for t in theta:
                c, s = math.cos(t), math.sin(t)
                sx, sz = math.copysign(abs(c) ** .75, c), math.copysign(abs(s) ** .75, s)
                bump = thenar(l, t)
                ring.append(bm.verts.new(Vector(world(cx + (hx + bump) * sx, l, cz + (hz + bump) * sz))))
            rings.append(ring)
        cx, cz = row_centre(kl + .009)
        pole = bm.verts.new(Vector(world(cx, kl + .009, cz)))
        new_faces = []
        n = len(order)
        for r in range(len(rings) - 1):
            a, b = rings[r], rings[r + 1]
            for i in range(n):
                new_faces.append(bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])))
        for i in range(n):
            new_faces.append(bm.faces.new((rings[-1][i], rings[-1][(i + 1) % n], pole)))
        # Outward: the first new quad's normal leaves the ring's centre line.
        f0 = new_faces[n * 2]
        f0.normal_update()
        p = local(f0.calc_center_median())
        cx, cz = row_centre(p[1])
        if f0.normal.dot(Vector(world(*p) - world(cx, p[1], cz))) < 0:
            for f in new_faces:
                f.normal_flip()
        # Skinned as the arm is: forearm into hand across the wrist.
        hand_g, fore_g = gindex[side + 'Hand'], gindex[side + 'ForeArm']
        for r, ring in enumerate(rings[1:]):
            w = smoothstep(PALM_CUT, -.005, rows[r][0])
            for v in ring:
                v[deform][hand_g] = w
                if w < 1:
                    v[deform][fore_g] = 1 - w
        pole[deform][hand_g] = 1.0

        # The thumb: its generated vertices went with the cut; a tube on its bones.
        base = np.array(THUMB['base'])
        cxw, czw = row_centre(base[1])
        joint = np.array([cxw + base[0], base[1], czw + base[2]])
        joints = [world(*joint)]
        for length, d in zip(THUMB['lengths'], THUMB['dirs']):
            d = np.array(d) / np.linalg.norm(d)
            joint = joint + d * length
            joints.append(world(*joint))
        verts, weights, tfaces = finger_mesh({'across': across, 'palm': palm}, joints, THUMB['width'], .030, 'Thumb', side)
        tv = [bm.verts.new(Vector(p)) for p in verts]
        for v, ww in zip(tv, weights):
            for bone, value in ww.items():
                if bone not in gindex:
                    gindex[bone] = len(body.vertex_groups)
                    body.vertex_groups.new(name=bone)
                v[deform][gindex[bone]] = value
        thumb_faces = [bm.faces.new([tv[i] for i in f]) for f in tfaces]
        # Outward, as the fingers are: the preview lights inside-out faces the
        # same, the game shades them dark.
        bmesh.ops.recalc_face_normals(bm, faces=thumb_faces)
        # Texture every new face from the one old face nearest its centre.
        for f in new_faces + thumb_faces:
            f.smooth = True
            _, _, index, _ = tree.find_nearest(f.calc_center_median())
            face = src.polygons[clean[index]]
            f.material_index = face.material_index
            corners = [src.vertices[i].co for i in face.vertices]
            middle = sum(corners, Vector()) / len(corners)
            for loop in f.loops:
                w = poly_3d_calc(corners, middle.lerp(loop.vert.co, .35))
                w = [max(0.0, x) if math.isfinite(x) else 0.0 for x in w]
                total = sum(w) or 1.0
                loop[uv].uv = sum((src.uv_layers.active.data[li].uv * (wk / total) for li, wk in zip(face.loop_indices, w)), Vector((0, 0)))
        bm.to_mesh(body.data)
        bm.free()
        body.data.update()
        bpy.data.objects.remove(source, do_unlink=True)
        out[side].update(knuckles=[round(float(v), 3) for v in (kx, kl, kz, khx, khz)], rings=len(rings), thumb=len(tv))

        # The thumb bones onto the new thumb.
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = arm
        arm.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        eb = arm.data.edit_bones
        for i in range(3):
            bone = eb[side + 'HandThumb' + str(i + 1)]
            bone.head, bone.tail = Vector(joints[i]), Vector(joints[i + 1])
            bone.align_roll(Vector(-across * .8 + palm * .2).normalized())
        tip = eb[side + 'HandThumb4']
        tip.head = Vector(joints[3])
        tip.tail = tip.head + (Vector(joints[3]) - Vector(joints[2])).normalized() * .01
        bpy.ops.object.mode_set(mode='OBJECT')
    return out


# ------------------------------------------------------------ toes
# The generated feet end in lumps: four on his, one fused block on hers; the
# owner's reference draws five small rounded toes on one smooth foot. As with
# the palm, the foot is cut across the ball and its front lofted again from
# the cut's own edge, so the new skin joins the old without a seam: rows of a
# rounded box that flattens toward the toes, the last rows reaching forward
# only as far as the toe each point belongs to, which draws the five tips and
# the notches between them; a shallow groove runs back over the top between
# toes. Distances are in the foot's own frame: x across it toward the body's
# middle, l along it from the ball, z up.
TOE_SHARE = (.29, .19, .18, .17, .17)     # of the foot's width, big toe first
TOE_LENGTH = (1.0, .9, .82, .74, .64)     # of the longest
TOE_CUT = .3                               # where the cut sits, of ball-to-tip


def sculpt_toes(arm, body):
    """Loft a smooth five-toed front onto each foot (see above)."""
    if body.data.shape_keys:
        raise RuntimeError('sculpt_toes runs before any shape key exists')
    from mathutils.bvhtree import BVHTree
    from mathutils.interpolate import poly_3d_calc
    names = [g.name for g in body.vertex_groups]
    gindex = {n: i for i, n in enumerate(names)}
    out = {}
    for side in ('Left', 'Right'):
        B = arm.data.bones
        if side + 'ToeBase' not in B or side + 'ToeBase' not in gindex:
            continue
        ankle, ball = np.array(B[side + 'Foot'].head_local), np.array(B[side + 'ToeBase'].head_local)
        fwd = ball - ankle
        fwd[2] = 0
        fwd /= np.linalg.norm(fwd)
        up = np.array([0.0, 0.0, 1.0])
        m = np.cross(up, fwd)
        if m[0] * -np.sign(ball[0]) < 0:
            m = -m
        local = lambda co: np.array([(np.array(co) - ball) @ m, (np.array(co) - ball) @ fwd, co[2]])
        world = lambda x, l, z: Vector((ball + m * x + fwd * l + up * (z - ball[2])).tolist())
        foot = {gindex[n] for n in names if n.startswith(side + 'Toe') or n == side + 'Foot'}
        ours = lambda weights: sum(w for g, w in weights if g in foot) > .5
        region = [v for v in body.data.vertices if ours((g.group, g.weight) for g in v.groups)]
        P = np.array([local(v.co) for v in region])
        tip = float(P[:, 1].max())
        cut = TOE_CUT * tip
        sole = float(P[:, 2].min())

        source = duplicate(body, body.name + '-toe-source')
        keep_faces(source, {p.index for p in body.data.polygons
                            if all(ours((g.group, g.weight) for g in body.data.vertices[i].groups) for i in p.vertices)
                            and local(p.center)[1] < cut})
        src = source.data
        clean = [i for i, t in enumerate(face_texels(source)) if (colour_class(t) == 'skin').all()] or list(range(len(src.polygons)))
        tree = BVHTree.FromPolygons([v.co.copy() for v in src.vertices], [tuple(src.polygons[i].vertices) for i in clean])

        bm = bmesh.new()
        bm.from_mesh(body.data)
        deform = bm.verts.layers.deform.verify()
        uv = bm.loops.layers.uv.active
        # Every face at the front of this foot, whatever its weights: a face
        # left out of the cut kept its far corner and stood up out of the new
        # skin as a flap.
        touches = lambda v: sum(w for g, w in v[deform].items() if g in foot) > .15
        faces = [f for f in bm.faces if any(touches(v) for v in f.verts)
                 and max(local(v.co)[1] for v in f.verts) > cut - .005
                 and abs(local(f.calc_center_median())[0]) < .16]
        geom = list({v for f in faces for v in f.verts}) + list({e for f in faces for e in f.edges}) + faces
        plane = world(0, cut, ball[2])
        normal = Vector(fwd.tolist())
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=plane, plane_no=normal, clear_outer=True)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        edges = [e for e in bm.edges if e.is_boundary and all(abs((v.co - plane).dot(normal)) < 1e-4 for v in e.verts)]
        # The largest loop of the opening, in order.
        loops, seen = [], set()
        for e in edges:
            if e in seen:
                continue
            ring, stack = [], [e]
            seen.add(e)
            while stack:
                x = stack.pop()
                ring.append(x)
                for v in x.verts:
                    for n in v.link_edges:
                        if n in edges and n not in seen:
                            seen.add(n)
                            stack.append(n)
            loops.append(ring)
        ring_edges = max(loops, key=len)
        for small in loops:
            if small is not ring_edges:
                bmesh.ops.triangle_fill(bm, edges=small, use_beauty=True)
        link = defaultdict(list)
        for e in ring_edges:
            a_, b_ = e.verts
            link[a_].append(b_)
            link[b_].append(a_)
        start_v = ring_edges[0].verts[0]
        order, prev = [start_v], None
        while True:
            nxt = [n for n in link[order[-1]] if n is not prev]
            if not nxt or nxt[0] is start_v:
                break
            prev = order[-1]
            order.append(nxt[0])
        L0 = np.array([local(v.co) for v in order])
        cx0, cz0 = (L0[:, 0].min() + L0[:, 0].max()) / 2, (L0[:, 2].min() + L0[:, 2].max()) / 2
        hx0, hz0 = (L0[:, 0].max() - L0[:, 0].min()) / 2, (L0[:, 2].max() - L0[:, 2].min()) / 2
        theta = np.unwrap(np.arctan2((L0[:, 2] - cz0) / hz0, (L0[:, 0] - cx0) / hx0))
        if theta[-1] < theta[0]:
            order.reverse()
            theta = -theta[::-1]
        toe_len = tip - cut
        edges_x = np.cumsum((0,) + TOE_SHARE)

        def toe_at(x):
            """Which toe a point across the front belongs to, and how far
            it sits from that toe's middle (0) to its edge (1)."""
            u = float(np.clip((cx0 + hx0 - x) / (2 * hx0), 0, 1))
            k = min(4, int(np.searchsorted(edges_x, u, side='right') - 1))
            s_ = (u - edges_x[k]) / TOE_SHARE[k]
            return k, abs(2 * s_ - 1)
        # (fraction of the toes' length, half-width scale, half-height scale)
        rows = [(.2, 1.0, .92), (.42, .99, .8), (.62, .97, .66), (.8, .94, .56), (.93, .86, .48)]
        rings = [order]
        for r, (frac, sx, sz) in enumerate(rows):
            ring = []
            for t in theta:
                c, s_ = math.cos(t), math.sin(t)
                x = cx0 + hx0 * sx * math.copysign(abs(c) ** .7, c)
                hz = hz0 * sz
                z = sole + hz + hz * math.copysign(abs(s_) ** .7, s_)
                k, edge = toe_at(x)
                reach = TOE_LENGTH[k] * (1 - .16 * edge ** 2)
                # The front rows stop where this toe ends; the notch between
                # toes is where they stop shortest.
                f = min(frac, reach * (frac / rows[-1][0]) if frac > .5 else frac)
                if s_ > .2 and frac > .3:
                    z -= .0035 * edge ** 3
                ring.append(bm.verts.new(world(x, cut + f * toe_len, z)))
            rings.append(ring)
        # Round the tips: the last ring closes on a line along its middle.
        closing = [bm.verts.new(world(cx0 + hx0 * .8 * math.copysign(abs(math.cos(t)) ** .7, math.cos(t)),
                                      cut + toe_len * min(.97, TOE_LENGTH[toe_at(cx0 + hx0 * .8 * math.cos(t))[0]] * .97),
                                      sole + hz0 * .44)) for t in theta]
        rings.append(closing)
        n = len(order)
        new_faces = []
        for r in range(len(rings) - 1):
            a_, b_ = rings[r], rings[r + 1]
            for i in range(n):
                quad = (a_[i], a_[(i + 1) % n], b_[(i + 1) % n], b_[i])
                if len({v for v in quad}) == 4:
                    new_faces.append(bm.faces.new(quad))
        # The front, a strip closing the flattened last ring from underneath.
        half = n // 2
        for i in range(half - 1):
            j = n - 1 - i
            quad = (closing[i], closing[i + 1], closing[j - 1], closing[j])
            if len(set(quad)) == 4:
                try:
                    new_faces.append(bm.faces.new(quad))
                except ValueError:
                    pass
        # Each new face outward, judged against the foot's own middle line.
        for f in new_faces:
            f.normal_update()
            c = f.calc_center_median()
            inside = world(cx0, min(local(c)[1], cut + toe_len * .7), sole + hz0 * .5)
            if f.normal.dot(c - inside) < 0:
                f.normal_flip()
        foot_g, toe_g = gindex[side + 'Foot'], gindex[side + 'ToeBase']
        for r, ring in enumerate(rings[1:]):
            w = smoothstep(0, .5, (rows[r][0] if r < len(rows) else 1.0))
            for v in ring:
                v[deform][toe_g] = w
                if w < 1:
                    v[deform][foot_g] = 1 - w
        for f in new_faces:
            f.smooth = True
            _, _, index, _ = tree.find_nearest(f.calc_center_median())
            face = src.polygons[clean[index]]
            f.material_index = face.material_index
            corners = [src.vertices[i].co for i in face.vertices]
            middle = sum(corners, Vector()) / len(corners)
            for loop in f.loops:
                w = poly_3d_calc(corners, middle.lerp(loop.vert.co, .35))
                w = [max(0.0, x) if math.isfinite(x) else 0.0 for x in w]
                total = sum(w) or 1.0
                loop[uv].uv = sum((src.uv_layers.active.data[li].uv * (wk / total) for li, wk in zip(face.loop_indices, w)), Vector((0, 0)))
        bm.to_mesh(body.data)
        bm.free()
        body.data.update()
        bpy.data.objects.remove(source, do_unlink=True)
        out[side] = {'loop': n, 'toeLength': round(toe_len, 3), 'width': round(2 * hx0, 3)}
    return out


# ------------------------------------------------------------ face and skin

def flatten_face(arm, body, iterations=240):
    """Take the sculpted nose, mouth and carved eye sockets off her face. The
    September 25 head models them as crinkled lumps that shade grey on a face
    her sheet draws flat. The front of the face below the fringe, chosen by
    where its vertices are (the lumps face every way, so their normals cannot
    pick them), is relaxed in depth only toward the smooth surface its edge
    spans; the texture stays where it was."""
    own = owners(body)
    cls = face_colours(body)
    polys = body.data.polygons
    cx = arm.data.bones['Head'].head_local.x
    # Her eyes as this head draws them, for paint_face too.
    dark = [p.center.z for p, o, c in zip(polys, own, cls) if o in HEADS and c == 'dark' and p.normal.y < -.5 and abs(p.center.x - cx) < .09]
    eye = float(np.median(dark)) if len(dark) >= 5 else EYE_HEIGHT['female']
    body['eyeZ'] = eye
    head_faces = [p for p, o, c in zip(polys, own, cls) if o in HEADS and c != 'hair']
    ids = {i for p in head_faces for i in p.vertices}
    V = body.data.vertices
    skin_front = [V[i].co for i in ids if abs(V[i].co.x - cx) < .03 and V[i].co.z < eye]
    chin = min(c.z for c in skin_front) if skin_front else eye - .12
    face_y = float(np.percentile([V[i].co.y for i in ids if abs(V[i].co.x - cx) < .06 and chin < V[i].co.z < eye + .03], 30))
    # Every head vertex in the zone, eye sockets included whatever colour
    # they read; only the fringe's strands, hanging in front, stay out.
    fringe = {i for p, o, c in zip(polys, own, cls) if o in HEADS and c == 'hair' for i in p.vertices}
    every = {i for p, o in zip(polys, own) if o in HEADS for i in p.vertices}
    region = {i for i in every if abs(V[i].co.x - cx) < .07 and chin + .004 < V[i].co.z < eye + .03
              and V[i].co.y < face_y + .06 and not (i in fringe and V[i].co.y < face_y - .004)}
    link = defaultdict(set)
    for e in body.data.edges:
        a, b = e.vertices
        link[a].add(b)
        link[b].add(a)
    inner = [i for i in region if link[i] <= region]
    ys = {i: V[i].co.y for i in region | {n for i in region for n in link[i]}}
    # A smooth curved front fitted to the whole zone (least squares, so the
    # lumps average out), then the edges relaxed into the head round it.
    P = np.array([[V[i].co.x - cx, V[i].co.z - eye, V[i].co.y] for i in region])
    A = np.stack([np.ones(len(P)), P[:, 0] ** 2, P[:, 1], P[:, 1] ** 2, P[:, 0] ** 2 * P[:, 1]], axis=1)
    coef = np.linalg.lstsq(A, P[:, 2], rcond=None)[0]
    for i in inner:
        u, w = V[i].co.x - cx, V[i].co.z - eye
        ys[i] = float(coef @ np.array([1, u * u, w, w * w, u * u * w]))
    edge = [i for i in inner if any(n not in inner for n in link[i] if n in region) or any(n not in region for n in link[i])]
    near_edge = set(edge)
    for _ in range(3):
        near_edge |= {n for i in near_edge for n in link[i] if n in inner}
    for _ in range(40):
        ys.update({i: sum(ys[n] for n in link[i]) / len(link[i]) for i in near_edge})
    moved = 0.0
    for i in inner:
        moved = max(moved, abs(V[i].co.y - ys[i]))
        V[i].co.y = ys[i]
    body.data.update()
    body['chinZ'] = chin
    return {'vertices': len(inner), 'deepest': round(moved, 4), 'eye': round(eye, 3), 'chin': round(chin, 3)}


def relax_skin(body, rounds=6):
    """Even out the body's skin surface. The generated mesh is coarse and
    creased, and the game's banded shading draws a hard line along every
    crease, which is the patchwork of triangles on his legs and chest.
    Taubin smoothing (a shrink step and an equal swell) takes the creases
    out without thinning the limbs. Heads, hands, feet and anything not
    skin-coloured keep their shape."""
    own = owners(body)
    cls = face_colours(body)
    polys = body.data.polygons
    V = body.data.vertices
    # Nor the shoulders and upper arms, under the sleeves: relaxed, the skin
    # round the armpit crept out through the tee once the arms came down.
    keep_out = lambda o: o in HEADS or 'Hand' in o or 'Toe' in o or 'Shoulder' in o or (o.endswith('Arm') and 'Fore' not in o)
    region = set()
    blocked = set()
    for p, o, c in zip(polys, own, cls):
        (region if (c == 'skin' and not keep_out(o)) else blocked).update(p.vertices)
    region -= blocked
    link = defaultdict(set)
    for e in body.data.edges:
        a, b = e.vertices
        link[a].add(b)
        link[b].add(a)
    co = {i: V[i].co.copy() for i in region | {n for i in region for n in link[i]}}
    for _ in range(rounds):
        for factor in (.5, -.53):
            step = {i: (sum((co[n] for n in link[i]), Vector()) / len(link[i]) - co[i]) * factor for i in region if link[i]}
            for i, d in step.items():
                co[i] = co[i] + d
    for i in region:
        V[i].co = co[i]
    body.data.update()
    return len(region)


def smooth_neck(arm, body, iterations=12):
    """Even out the neck and where it joins the head: the generated column is
    faceted and stepped under the jaw. Laplacian relaxation of the skin
    between the base of the neck and the chin, the outermost ring held."""
    B = arm.data.bones
    neck, head = B['neck'].head_local, B['Head'].head_local
    z0, z1 = neck.z - .015, head.z + .02
    cls = face_colours(body)
    polys = body.data.polygons
    region = set()
    for p, c in zip(polys, cls):
        if c != 'skin':
            continue
        q = p.center
        if z0 < q.z < z1 and math.hypot(q.x - neck.x, q.y - neck.y) < .075:
            region.update(p.vertices)
    link = defaultdict(set)
    for e in body.data.edges:
        a, b = e.vertices
        link[a].add(b)
        link[b].add(a)
    inner = [i for i in region if link[i] <= region]
    co = {i: body.data.vertices[i].co.copy() for i in region | {n for i in region for n in link[i]}}
    for _ in range(iterations):
        nxt = {i: sum((co[n] for n in link[i]), Vector()) / len(link[i]) for i in inner}
        for i, c in nxt.items():
            co[i] = co[i].lerp(c, .6)
    for i in inner:
        body.data.vertices[i].co = co[i]
    body.data.update()
    return len(inner)


def _face_pixels(body, atlas, faces):
    h, w = atlas.shape[:2]
    for i in faces:
        for rows, cols, points in texels(body, [i], w, h):
            yield i, rows, cols, points


def clean_skin(body, atlas):
    """One even skin tone over the body, the way the reference sheets paint
    it. The generated texture's skin is mottled with darker triangles and
    scratches, which read as broken low-poly facets once lit. Every texel of
    a skin face outside the head that is itself skin-coloured (not the
    swimwear's black or its white piping) takes the body's median skin; the
    lighting and the cel bands do the shading."""
    own = owners(body)
    faces = [i for i, o in enumerate(own) if o not in HEADS]
    picked = []
    for i, rows, cols, _ in _face_pixels(body, atlas, faces):
        picked.append((rows, cols))
    rows = np.concatenate([r for r, _ in picked])
    cols = np.concatenate([c for _, c in picked])
    rgb = atlas[rows, cols]
    y = lum(rgb)
    warm = (rgb[:, 0] > rgb[:, 2] + .06) & (y > .22) & (rgb[:, 0] > .35)
    tone = np.median(rgb[warm], axis=0)
    atlas[rows[warm], cols[warm]] = tone
    return {'texels': int(warm.sum()), 'tone': [round(float(c), 3) for c in tone]}


def clean_collar(tee, arm, atlas):
    """The tee round the neck in the shirt's own black. The clothed model's
    neck was lifted off with the shirt, so the collar's faces carried skin
    and its shading, cut ragged by the collar trim: a broken, skin-flecked
    edge at the throat. Every texel of the tee within 6 cm under the collar
    that is not the shirt's dark takes the shirt's black."""
    neck = arm.data.bones['neck'].head_local
    faces = [p.index for p in tee.data.polygons if p.center.z > neck.z - .06 and math.hypot(p.center.x - neck.x, p.center.y - neck.y) < .13]
    pix = list(_face_pixels(tee, atlas, faces))
    if not pix:
        return 0
    rows = np.concatenate([r for _, r, _, _ in pix])
    cols = np.concatenate([c for _, _, c, _ in pix])
    face_of = np.concatenate([np.full(len(r), i) for i, r, _, _ in pix])
    rgb = atlas[rows, cols]
    y = lum(rgb)
    off = y > .16
    # The shirt's own shade here, not its darkest: filled with the darkest,
    # the repainted texels showed as black specks on the back.
    black = np.median(rgb[~off], axis=0) if (~off).sum() > 20 else np.array([.07, .07, .07])
    # Scraps that are mostly skin are the old neck, not shirt: they go.
    # Painted black they sat on his neck as dark flecks. Not on a modelled
    # tee, though: every face of it is shirt, and deleting the collar's
    # faces that happened to sample skin punched holes in it, through which
    # his neck showed as shards (the owner, 2026-10-01). Those are painted.
    modelled = any(k in tee.name for k in TEE_NECK)
    scraps = set() if modelled else {int(i) for i in set(face_of.tolist()) if off[face_of == i].mean() > .5}
    if scraps:
        keep_faces(tee, {p.index for p in tee.data.polygons if p.index not in scraps})
    rest = ~np.isin(face_of, list(scraps)) & off
    atlas[rows[rest], cols[rest]] = black
    return {'texels': int(rest.sum()), 'scraps': len(scraps)}


def relax_collar(tee, arm, rounds=4):
    """Smooth the folds the clothed model's collar left standing on the
    shoulders either side of the neck."""
    neck = arm.data.bones['neck'].head_local
    V = tee.data.vertices
    region = {v.index for v in V if v.co.z > neck.z - .07 and math.hypot(v.co.x - neck.x, v.co.y - neck.y) < .14}
    link = defaultdict(set)
    for e in tee.data.edges:
        a, b = e.vertices
        link[a].add(b)
        link[b].add(a)
    bm = bmesh.new()
    bm.from_mesh(tee.data)
    edge_verts = {v.index for v in bm.verts if v.is_boundary}
    bm.free()
    inner = [i for i in region if i not in edge_verts and link[i]]
    co = {i: V[i].co.copy() for i in region | {n for i in region for n in link[i]}}
    for _ in range(rounds):
        for factor in (.5, -.53):
            step = {i: (sum((co[n] for n in link[i]), Vector()) / len(link[i]) - co[i]) * factor for i in inner}
            for i, d in step.items():
                co[i] = co[i] + d
    for i in inner:
        V[i].co = co[i]
    tee.data.update()
    return len(inner)


def clean_tee_skin(tee, atlas):
    """Her tee in its own black all over. Cut from the dressed model along
    triangle edges, its sleeve ends carried flecks of the arm's skin in their
    texture, which read as torn hems."""
    pix = list(_face_pixels(tee, atlas, range(len(tee.data.polygons))))
    if not pix:
        return 0
    rows = np.concatenate([r for _, r, _, _ in pix])
    cols = np.concatenate([c for _, _, c, _ in pix])
    rgb = atlas[rows, cols]
    y = lum(rgb)
    # Skin flecks, and any light texel at all: the generated tee is plain
    # black (the prints are layers of their own), and pale seams in its
    # texture showed across her back as white streaks (2026-10-01).
    skin = ((rgb[:, 0] > rgb[:, 2] + .08) & (y > .22)) | (y > .16)
    shade = np.median(rgb[y < .16], axis=0) if (y < .16).sum() > 20 else np.array([.06, .06, .06])
    atlas[rows[skin], cols[skin]] = shade
    return int(skin.sum())


def paint_face(arm, body, atlas):
    """Her face as her sheet draws it (character-prototype female-base-front):
    a flat skin front; each eye a tall rectangle, dark on the inside with a
    pale block on the outer side and a thin lid line over both; a short brow
    above; a small mouth line well below; a faint blush under each eye. Sized
    and placed from her own eyes as the generated texture drew them."""
    own = owners(body)
    polys = body.data.polygons
    cx = arm.data.bones['Head'].head_local.x
    eye_z = float(body.get('eyeZ', EYE_HEIGHT['female']))
    front = [i for i, o in enumerate(own) if o in HEADS and polys[i].normal.y < -.3 and abs(polys[i].center.x - cx) < .08
             and eye_z - .12 < polys[i].center.z < eye_z + .06]
    pix = list(_face_pixels(body, atlas, front))
    rows = np.concatenate([r for _, r, _, _ in pix])
    cols = np.concatenate([c for _, _, c, _ in pix])
    pts = np.concatenate([p for _, _, _, p in pix])
    face_of = np.concatenate([np.full(len(r), i) for i, r, _, _ in pix])
    rgb = atlas[rows, cols]
    cls = colour_class(rgb)
    # Leave the hair drawn on the head alone: faces mostly hair keep their texels.
    hairy = {i for i in set(face_of.tolist()) if (cls[face_of == i] == 'hair').mean() > .5}
    mine = np.array([i not in hairy for i in face_of])
    dark = mine & (lum(rgb) < .07) & (np.abs(pts[:, 2] - eye_z) < .045)
    eyes = {}
    for side, sel in (('right', dark & (pts[:, 0] < cx)), ('left', dark & (pts[:, 0] > cx))):
        if sel.sum() < 12:
            continue
        xs, zs = pts[sel, 0], pts[sel, 2]
        eyes[side] = [float(np.percentile(xs, 4)), float(np.percentile(xs, 96)), float(np.percentile(zs, 4)), float(np.percentile(zs, 96))]
    if len(eyes) < 2:
        return {'painted': 0, 'eyes': len(eyes)}
    skin_sel = mine & (cls == 'skin')
    skin = np.median(rgb[skin_sel], axis=0) if skin_sel.sum() > 20 else np.array([.93, .8, .72])
    hair = np.array([.2, .16, .16])
    out = rgb.copy()
    out[mine] = skin
    x, z = pts[:, 0], pts[:, 2]
    # Proportioned as her sheet: the eyes' tops at the fringe (where the
    # generated eyes' tops were), each .37 of the face's half width across
    # and 1.16 times that tall, starting .35 of it out from the middle.
    top = float(np.mean([e[3] for e in eyes.values()]))
    level = mine & (np.abs(z - (top - .015)) < .008) & (cls != 'hair')
    half = float(np.percentile(np.abs(x[level] - cx), 97)) if level.sum() > 20 else .07
    ew, gap = .37 * half, .35 * half
    eh = 1.16 * ew
    ez0 = top - eh

    def rect(sel, xa, xb, za, zb, colour, alpha=1.0):
        m = sel & (x >= min(xa, xb)) & (x <= max(xa, xb)) & (z >= za) & (z <= zb)
        out[m] = out[m] * (1 - alpha) + np.array(colour) * alpha
    for sign in (-1, 1):
        inner, outer = cx + sign * gap, cx + sign * (gap + ew)
        split = inner + (outer - inner) * .64
        blush = mine & (((x - (inner + (outer - inner) * .55)) / (ew * .6)) ** 2 + ((z - (ez0 - eh * .12)) / (eh * .17)) ** 2 < 1)
        out[blush] = out[blush] * .78 + np.array([.97, .62, .6]) * .22
        rect(mine, inner, split, ez0, top, [.14, .12, .13])
        rect(mine, split, outer, ez0, top, [.87, .86, .87])
        rect(mine, inner - sign * ew * .04, outer + sign * ew * .08, top - eh * .02, top + eh * .07, [.17, .13, .13])
        rect(mine, inner + sign * ew * .05, inner + sign * ew * .55, top + eh * .35, top + eh * .55, hair)
    rect(mine, cx - half * .09, cx + half * .09, ez0 - eh * .62, ez0 - eh * .55, skin * np.array([.84, .64, .58]))
    atlas[rows[mine], cols[mine]] = out[mine]
    return {'painted': int(mine.sum()), 'eye': [round(ew, 3), round(eh, 3), round(ez0, 3), round(gap, 3)], 'half': round(half, 3)}


def rebuild_fingers(arm, body, normalize_palm=True):
    """Cut the fused fingers at the knuckles, model and rig new ones, rig the thumb."""
    # Normalise the generated palm before measuring the new knuckles.
    for side in (('Left','Right') if normalize_palm else []):
        h=measure_hand(arm,body,side)
        length=min(1,.135/h['L']); width=min(1,.083/(h['span'][1]-h['span'][0]))
        depth=min(1,.035/(h['thickness'][1]-h['thickness'][0]))
        for i in h['owned']:
            v=body.data.vertices[i]; d=np.array(v.co)-h['wrist']
            blend=smoothstep(0,h['L']*.28,float(d@h['along']))
            along=1+(length-1)*blend; across=1+(width-1)*blend; thick=1+(depth-1)*blend
            v.co=h['wrist']+h['along']*(d@h['along'])*along+h['across']*(d@h['across'])*across+h['palm']*(d@h['palm'])*thick
    body.data.update()
    hands = {side: measure_hand(arm, body, side) for side in ('Left', 'Right')}
    out = {}
    # What the old fingers looked like, to texture the new ones from.
    source = duplicate(body, body.name + '-fingers')
    keep = set()
    for side, h in hands.items():
        for p in body.data.polygons:
            if all(i in h['fingerVerts'] for i in p.vertices):
                keep.add(p.index)
    keep_faces(source, keep)
    # Cut: everything past the knuckle plane on the fingers' side of the thumb.
    bm = bmesh.new()
    bm.from_mesh(body.data)
    uv = bm.loops.layers.uv.active
    # Which hand each vertex belongs to, carried through the cuts (indices are not).
    code = {'Left': 1, 'Right': 2}
    which = bm.verts.layers.int.new('hand')
    bm.verts.ensure_lookup_table()
    for side, h in hands.items():
        for i in h['owned']:
            bm.verts[i][which] = code[side]
        for i in h['thumb']:
            bm.verts[i][which] = code[side] + 10
    for side, h in hands.items():
        region = [f for f in bm.faces if all(v[which] == code[side] for v in f.verts)
                  and (f.calc_center_median() - Vector(h['wrist'])).dot(Vector(h['along'])) > h['cut'] - .03]
        geom = list({v for f in region for v in f.verts}) + list({e for f in region for e in f.edges}) + region
        plane = Vector(h['wrist']) + Vector(h['along']) * h['cut']
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=plane, plane_no=Vector(h['along']), clear_outer=True)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        opening = [e for e in bm.edges if e.is_boundary and all(abs((v.co - plane).dot(Vector(h['along']))) < 1e-4 for v in e.verts)]
        filled = bmesh.ops.triangle_fill(bm, edges=opening, use_beauty=True)['geom']
        for f in [g for g in filled if isinstance(g, bmesh.types.BMFace)]:
            f.smooth = True
            for loop in f.loops:
                others = [l for l in loop.vert.link_loops if l.face is not f]
                if others:
                    loop[uv].uv = others[0][uv].uv
        out[side] = {'opening': len(opening), 'left': sum(1 for e in bm.edges if e.is_boundary)}
    bm.verts.layers.int.remove(which)
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    # The new fingers, one object, then textured from the old ones and joined.
    verts, weights, faces = [], [], []
    chains = {}
    for side, h in hands.items():
        for k, name in enumerate(FINGERS):
            joints, width, depth = finger_chain(h, k, name)
            chains[side + name] = joints
            v, w, f = finger_mesh(h, joints, width, depth, name, side)
            o = len(verts)
            verts += [Vector(p) for p in v]
            weights += w
            faces += [tuple(i + o for i in face) for face in f]
    mesh = bpy.data.meshes.new('fingers')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    fingers = bpy.data.objects.new('fingers', mesh)
    bpy.context.scene.collection.objects.link(fingers)
    for poly in mesh.polygons:
        poly.use_smooth = True
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for i, ww in enumerate(weights):
        for bone, value in ww.items():
            group = fingers.vertex_groups.get(bone) or fingers.vertex_groups.new(name=bone)
            group.add([i], value, 'REPLACE')
    for m in body.data.materials:
        mesh.materials.append(m)
    # Each face takes its texture from the one old finger face nearest its
    # centre, every corner placed within it. Corner by corner, neighbouring
    # corners landed on different islands of the generated layout and one
    # small face spread across half the texture.
    from mathutils.bvhtree import BVHTree
    from mathutils.interpolate import poly_3d_calc
    src = source.data
    src_uv = src.uv_layers.active.data
    tree = BVHTree.FromPolygons([v.co.copy() for v in src.vertices], [tuple(p.vertices) for p in src.polygons])
    layer = mesh.uv_layers.new(name=body.data.uv_layers.active.name)
    for poly in mesh.polygons:
        _, _, index, _ = tree.find_nearest(poly.center)
        face = src.polygons[index]
        corners = [src.vertices[i].co for i in face.vertices]
        centre = sum(corners, Vector()) / len(corners)
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            # Pulled most of the way to the source face's centre, so the
            # corner lands inside it rather than across a seam.
            w = poly_3d_calc(corners, centre.lerp(co, .35))
            w = [max(0.0, x) if math.isfinite(x) else 0.0 for x in w]
            total = sum(w) or 1.0
            w = [x / total for x in w]
            layer.data[li].uv = sum((src_uv[l].uv * wk for l, wk in zip(face.loop_indices, w)), Vector((0, 0)))
    bpy.data.objects.remove(source, do_unlink=True)
    uvs = np.empty(len(layer.data) * 2)
    layer.data.foreach_get('uv', uvs)
    out['uvRange'] = [round(float(np.nanmin(uvs)), 3), round(float(np.nanmax(uvs)), 3), int(np.isnan(uvs).sum())]
    # Bones: three a finger, three for the thumb, Z toward the palm.
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for side, h in hands.items():
        for name in FINGERS:
            joints = chains[side + name]
            parent = eb[side + 'Hand']
            for i in range(3):
                bone = eb.new(side + 'Hand' + name + str(i + 1))
                bone.head, bone.tail = Vector(joints[i]), Vector(joints[i + 1])
                bone.align_roll(Vector(h['palm']))
                bone.parent, bone.use_connect = parent, i > 0
                parent = bone
            # An unweighted end bone at the fingertip: glTF keeps no tails,
            # and posing by tracked joints needs to know where the tip is.
            end = eb.new(side + 'Hand' + name + '4')
            end.head = Vector(joints[3])
            end.tail = end.head + (Vector(joints[3]) - Vector(joints[2])).normalized() * .01
            end.parent, end.use_connect = parent, True
        base, tip = Vector(h['thumbBase']), Vector(h['thumbTip'])
        points = [base, base.lerp(tip, .47), base.lerp(tip, .75), tip]
        parent = eb[side + 'Hand']
        for i in range(3):
            bone = eb.new(side + 'HandThumb' + str(i + 1))
            bone.head, bone.tail = points[i], points[i + 1]
            # The thumb curls across the palm, toward the little finger.
            bone.align_roll(Vector(-h['across'] * .8 + h['palm'] * .2).normalized())
            bone.parent, bone.use_connect = parent, i > 0
            parent = bone
        end = eb.new(side + 'HandThumb4')
        end.head, end.tail = tip, tip + (tip - points[2]).normalized() * .01
        end.parent, end.use_connect = parent, True
    bpy.ops.object.mode_set(mode='OBJECT')
    # The thumb's own vertices, by how far along it they lie.
    for side, h in hands.items():
        base, tip = Vector(h['thumbBase']), Vector(h['thumbTip'])
        axis = tip - base
        groups = [body.vertex_groups.get(side + 'HandThumb' + str(i)) or body.vertex_groups.new(name=side + 'HandThumb' + str(i)) for i in (1, 2, 3)]
        hand_group = body.vertex_groups[side + 'Hand']
        from mathutils.kdtree import KDTree
        tree = KDTree(len(h['thumbPoints']))
        for k, co in enumerate(h['thumbPoints']):
            tree.insert(co, k)
        tree.balance()
        moved = 0
        for v in body.data.vertices:
            if not h['thumbPoints'] or tree.find(v.co)[2] > 1e-6:
                continue
            weight = sum(g.weight for g in v.groups if g.group == hand_group.index)
            if weight < .5:
                continue
            u = (v.co - base).dot(axis) / axis.length_squared
            share = [0, 0, 0]
            share[0] = smoothstep(.02, .22, u) * (1 - smoothstep(.42, .52, u))
            share[1] = smoothstep(.42, .52, u) * (1 - smoothstep(.70, .80, u))
            share[2] = smoothstep(.70, .80, u)
            total = sum(share)
            if total <= 0:
                continue
            hand_group.add([v.index], weight * (1 - total), 'REPLACE')
            for g, value in zip(groups, share):
                if value > 0:
                    g.add([v.index], weight * value, 'REPLACE')
            moved += 1
        out[side]['thumb'] = moved
    join_into(body, [fingers])
    return out


# ------------------------------------------------------------ normalising

def normalise(key, arm, body, sex, swim, placed):
    v = world_verts(body)
    lo, hi = v[:, 2].min(), v[:, 2].max()
    hips = bone_at(arm, 'Hips')
    neck = bone_at(arm, 'neck')
    ankle = (bone_at(arm, 'LeftFoot').z + bone_at(arm, 'RightFoot').z) / 2
    if not swim:
        if sex == 'male':
            s = HEIGHT / (hi - lo)
        else:
            s = FEMALE_NECK * (HER_SCALE_NECK - FLOOR) / (neck.z - lo)
        M = Matrix.Translation((-hips.x * s, -hips.y * s, FLOOR - lo * s)) @ Matrix.Scale(s, 4)
    else:
        # Same ankle-to-neck length as the clothed body, neck on its neck, so
        # the transplanted head lands exactly where it was made to sit.
        clothed = placed[sex]
        s = (clothed['neck'].z - clothed['ankle']) / (neck.z - ankle)
        M = Matrix.Translation(clothed['neck'] - neck * s) @ Matrix.Scale(s, 4)
    bake(arm, body, M)
    v = world_verts(body)
    placed[key] = {
        'neck': bone_at(arm, 'neck').copy(), 'head': bone_at(arm, 'Head').copy(),
        'ankle': (bone_at(arm, 'LeftFoot').z + bone_at(arm, 'RightFoot').z) / 2,
        'lo': float(v[:, 2].min()), 'hi': float(v[:, 2].max()), 'scale': s,
    }


def strip_emission(body):
    for mat in body.data.materials:
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        for link in list(bsdf.inputs['Emission Color'].links):
            mat.node_tree.links.remove(link)
        bsdf.inputs['Emission Strength'].default_value = 0
        bsdf.inputs['Metallic'].default_value = 0
        bsdf.inputs['Roughness'].default_value = 1


# ------------------------------------------------------- head transplant

def position_key(co):
    return (round(co.x, 5), round(co.y, 5), round(co.z, 5))


def ring_fill(values):
    """A ring of per-angle values with gaps: fill each gap from either side,
    then take the median of every value and its two neighbours, so one stray
    vertex cannot throw a spike."""
    bins = len(values)
    known = [i for i, x in enumerate(values) if x is not None]
    if not known:
        return None
    out = list(values)
    for i in range(bins):
        if out[i] is not None:
            continue
        before = max((k for k in known if k < i), default=known[-1] - bins)
        after = min((k for k in known if k > i), default=known[0] + bins)
        t = (i - before) / (after - before)
        out[i] = values[before % bins] + (values[after % bins] - values[before % bins]) * t
    return [sorted((out[i - 1], out[i], out[(i + 1) % bins]))[1] for i in range(bins)]


def ray_tree(obj):
    from mathutils.bvhtree import BVHTree
    return BVHTree.FromPolygons([v.co.copy() for v in obj.data.vertices], [tuple(p.vertices) for p in obj.data.polygons])


FACE_DETAIL = 2.4     # reserve enough texels for the rectangular eyes


def uv_area(mesh, layer):
    """The fraction of the texture a UV layer's faces cover."""
    uv = mesh.uv_layers[layer].data
    total = 0.0
    for p in mesh.polygons:
        ls = list(p.loop_indices)
        for k in range(1, len(ls) - 1):
            u0, u1, u2 = uv[ls[0]].uv, uv[ls[k]].uv, uv[ls[k + 1]].uv
            total += abs((u1.x - u0.x) * (u2.y - u0.y) - (u2.x - u0.x) * (u1.y - u0.y)) / 2
    return total


def enlarge_face(body, layer, factor):
    """Scale up, each about its own centre, the UV islands that lie mostly on
    the front of the head, so packing gives them more of the texture."""
    own = owners(body)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv[layer]
    parent = list(range(len(bm.faces)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    same = lambda a, b: (a - b).length < 1e-6
    for e in bm.edges:
        if len(e.link_loops) != 2:
            continue
        l1, l2 = e.link_loops
        if same(l1[uvl].uv, l2.link_loop_next[uvl].uv) and same(l1.link_loop_next[uvl].uv, l2[uvl].uv):
            parent[find(l1.face.index)] = find(l2.face.index)
    islands = defaultdict(list)
    for f in bm.faces:
        islands[find(f.index)].append(f)
    scaled = 0
    for faces in islands.values():
        area = sum(f.calc_area() for f in faces)
        front = sum(f.calc_area() for f in faces if own[f.index] in HEADS and f.normal.y < -.35)
        if front < area / 2:
            continue
        loops = [l for f in faces for l in f.loops]
        centre = sum((l[uvl].uv for l in loops), Vector((0, 0))) / len(loops)
        for l in loops:
            l[uvl].uv = centre + (l[uvl].uv - centre) * factor
        scaled += 1
    bm.to_mesh(body.data)
    bm.free()
    return scaled


def unify_texture(key, body, size=TEX):
    """Re-lay the body's UVs with room between the islands and bake its
    textures across, returning the new atlas (display-space RGB).

    Higgsfield's layout is hundreds of small islands packed edge to edge. On
    screen every smaller mip level averages each island with its neighbours,
    so from any distance skin and grey bled into the black cloth as fine light
    lines along the seams — the cracking. With a margin round every island
    and the margin filled with the island's own colour, the mips stay clean.
    A swimwear body's transplanted head, which has its own image, is baked
    into the same atlas.

    The mesh is welded first. Split along every one of its three thousand UV
    seams, it laid out as three thousand tiny islands, and the margins
    between them took 96% of the texture: the body was drawn at an eighth of
    the source's detail, and the face, eyes and lids came out as blotches.
    Welded, the islands are whole regions of the body, the margin is a fixed
    four texels, and the islands on the front of the head are laid out
    larger, since the face is what anyone looks at. (The build welds every
    body as soon as it is placed; this only catches what was added since.)"""
    mesh = body.data
    welded = weld(body)
    # Each part and each generation unwrapped on its own: joined through the
    # weld, her tee's collar and the band at her neck fell in one island,
    # projected onto the same texels, and the collar's black was baked over
    # her nape (2026-10-04). Welded again after the bake.
    apart = islands_apart(body)
    source_uv = mesh.uv_layers.active.name
    target = mesh.uv_layers.new(name='Baked')
    mesh.uv_layers.active = target
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), margin_method='FRACTION', island_margin=.004,
                             area_weight=0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    enlarge_face(body, 'Baked', FACE_DETAIL)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION', margin=.004, shape_method='AABB')
    bpy.ops.object.mode_set(mode='OBJECT')
    report.setdefault(key, {}).update(weldedLate=welded, atlasUsed=round(uv_area(mesh, 'Baked'), 3))
    # Bake at twice the size and average down: one colour sample per texel
    # would alias the pixel artwork.
    bake_size = size * 2
    image = bpy.data.images.new(key + '-bake', bake_size, bake_size, alpha=False)
    for mat in mesh.materials:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        source = image_of(mat)
        texture = next(n for n in nodes if n.type == 'TEX_IMAGE' and n.image == source)
        uv_node = nodes.new('ShaderNodeUVMap')
        uv_node.uv_map = source_uv
        links.new(uv_node.outputs['UV'], texture.inputs['Vector'])
        texture.interpolation = 'Closest'
        bake_node = nodes.new('ShaderNodeTexImage')
        bake_node.image = image
        nodes.active = bake_node
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.cycles.device = 'CPU'
    scene.render.bake.margin = 24
    scene.render.bake.margin_type = 'EXTEND'
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_clear=True, margin=24)
    atlas = downsample(pixels(image)[..., :3], 2)
    mesh.uv_layers.remove(mesh.uv_layers[source_uv])
    mesh.uv_layers.active = mesh.uv_layers['Baked']
    mesh.uv_layers['Baked'].active_render = True
    for p in mesh.polygons:
        p.material_index = 0
    mesh.materials.clear()
    bpy.data.images.remove(image)
    _pixel_cache.clear()
    report[key]['islandsApart'] = apart
    weld(body)
    return atlas.astype(np.float32)


def islands_apart(body):
    """Split the edges where one part meets another (body, tee, trousers,
    shoes) or the swim body meets her dressed one, so each unwraps alone."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    layers = [bm.faces.layers.int.get(n) for n in ('part', 'swim_origin')]
    layers = [l for l in layers if l is not None]
    seam = [e for e in bm.edges if len(e.link_faces) == 2
            and any(e.link_faces[0][l] != e.link_faces[1][l] for l in layers)]
    bmesh.ops.split_edges(bm, edges=seam)
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    return len(seam)


def coverage(obj, w, h):
    """Which texels any face of `obj` actually uses, conservatively: a face
    thinner than a pixel still claims the pixels it is drawn from, or padding
    would overwrite them with a neighbouring island's colour."""
    mask = np.zeros((h, w), bool)
    for rows, cols, _ in texels(obj, range(len(obj.data.polygons)), w, h):
        mask[rows, cols] = True
    return mask


def pad(img, covered, rings=24):
    """Carry each UV island's edge colours out into the empty space around it.

    The generated atlas leaves a brown gutter between islands. Seen from any
    distance the GPU's smaller mip levels average that gutter into the edge of
    every island, which is what drew fine light cracks along every seam of the
    body. Filling the gutter with the island's own colour removes it."""
    out = img.copy()
    known = covered.copy()
    for _ in range(rings):
        acc = np.zeros_like(out)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(out, (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        grow = ~known & (cnt > 0)
        if not grow.any():
            break
        out[grow] = acc[grow] / cnt[grow][:, None]
        known |= grow
    return out


def finish_texture(key, body, atlas, covered):
    """The atlas, padded out from every texel any part uses, as the body's
    material; the garments share it."""
    img = new_image(key + '-body', pad(atlas, covered), os.path.join(WORK, key + '-body.png'), 'PNG')
    material = plain_material('avatar-body', img)
    body.data.materials.append(material)
    return material


def poly_tris(obj, index):
    uv = obj.data.uv_layers.active.data
    p = obj.data.polygons[index]
    return triangles([tuple(uv[li].uv) for li in p.loop_indices])


def grow(mask, within, steps):
    for _ in range(steps):
        out = mask.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            out |= np.roll(mask, (dy, dx), (0, 1))
        mask = out & within
    return mask


def tee_slivers(body, atlas, hem, collar, shoulder_x):
    """Paint out skin-coloured slivers inside the tee.

    A few generated triangles on the torso sample the skin beside their own
    island, and show as pale cracks through the shirt. Below the collar and
    inside the shoulders a clothed torso is all tee, so any skin-coloured texel
    there becomes the tee's own black."""
    h, w = atlas.shape[:2]
    own = owners(body)
    polys = body.data.polygons
    faces = [i for i, o in enumerate(own)
             if hem + .01 < polys[i].center.z < collar - .03 and abs(polys[i].center.x) < shoulder_x * .92
             and not any(n in o for n in ('Arm', 'Hand', 'Leg', 'Foot', 'Toe')) and o not in HEADS]
    rows, cols, cloth = [], [], []
    for r, c, _ in texels(body, faces, w, h):
        rows.append(r)
        cols.append(c)
    if not rows:
        return 0
    rows, cols = np.concatenate(rows), np.concatenate(cols)
    rgb = atlas[rows, cols]
    r_, g_, b_ = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    pale = (lum(rgb) > .3) & (r_ > b_ * 1.08)
    tee = np.median(rgb[~pale], axis=0) if (~pale).any() else np.array([.08, .08, .08])
    atlas[rows[pale], cols[pale]] = tee
    return int(pale.sum())


def erase_lettering(body, atlas, zones):
    """Paint out the lettering Higgsfield baked into the tee.

    Inside the chest and back zones every light texel is rebuilt from the dark
    cloth around it, one ring at a time, so the fabric's own noise continues
    through where the characters were instead of a flat patch appearing.
    """
    h, w = atlas.shape[:2]
    zone = np.zeros((h, w), bool)
    for p in body.data.polygons:
        c, n = p.center, p.normal
        for side, zlo, zhi in zones:
            facing = n.y < -.25 if side == 'front' else n.y > .25
            if abs(c.x) < .16 and zlo < c.z < zhi and facing:
                raster(zone, poly_tris(body, p.index), w, h)
    hole = grow(zone & (lum(atlas) > .2), zone, 2)
    known = zone & ~hole
    out = atlas.copy()
    for _ in range(96):
        if not hole.any():
            break
        acc = np.zeros_like(out)
        cnt = np.zeros((h, w))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(out, (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        fill = hole & (cnt > 0)
        out[fill] = acc[fill] / cnt[fill][:, None]
        known |= fill
        hole &= ~fill
    if hole.any():
        out[hole] = np.median(atlas[zone & ~grow(zone & (lum(atlas) > .2), zone, 2)], axis=0)
    return out, int(zone.sum())


# ---------------------------------------------------------------- artwork

def load_rgba(path, size=None, pad=6):
    """Read an image as bottom-up float RGBA, optionally fitted within `size`,
    with a fully transparent border so clamped sampling never smears an edge."""
    img = bpy.data.images.load(path, check_existing=False)
    a = pixels(img).copy()
    bpy.data.images.remove(img)
    if size:
        h, w = a.shape[:2]
        f = max(1, int(math.ceil(max(h, w) / size)))
        h2, w2 = (h // f) * f, (w // f) * f
        a = downsample(a[:h2, :w2], f)
    if not pad:
        return a
    padded = np.zeros((a.shape[0] + 2 * pad, a.shape[1] + 2 * pad, 4), np.float32)
    padded[pad:-pad, pad:-pad] = a
    return padded


def cap_mark(size=512):
    """The 我的檔期 mark in white.

    The supplied file is a white square with the characters cut out of it as
    transparent holes, so the mark is the holes: whatever is see-through inside
    the square, which sits in a transparent margin of its own."""
    a = load_rgba(CAP_LOGO, size, pad=0)
    solid = a[..., 3] > .5
    rows, cols = np.where(solid.any(axis=1))[0], np.where(solid.any(axis=0))[0]
    inset = int(round(.035 * a.shape[0]))
    inside = np.zeros(solid.shape, bool)
    inside[rows[0] + inset:rows[-1] - inset, cols[0] + inset:cols[-1] - inset] = True
    # The badge as the owner's reference shows it (October 2): the square
    # itself, white, with the characters in near-black, opaque over the cap.
    # Before, only the characters were drawn, white on the cap's colour.
    ink = np.where(inside, 1 - a[..., 3], 0)
    square = np.zeros(solid.shape, bool)
    square[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1] = True
    out = np.zeros_like(a)
    out[..., :3] = (.96 * (1 - ink) + .06 * ink)[..., None]
    out[..., 3] = square
    padded = np.zeros((a.shape[0] + 12, a.shape[1] + 12, 4), np.float32)
    padded[6:-6, 6:-6] = out
    return padded


def textured(name, rgba, alpha=True):
    fmt = 'PNG'
    img = new_image(name, rgba, os.path.join(WORK, name + '.png'), fmt)
    return plain_material(name, img, alpha)


def noise_texture(name, base, spread, size=32, block=2, seed=7):
    rng = np.random.default_rng(seed)
    cells = rng.uniform(-1, 1, (size // block, size // block, 1))
    tone = np.repeat(np.repeat(cells, block, 0), block, 1)
    rgb = np.clip(np.array(base, np.float32)[None, None, :] + tone * spread, 0, 1)
    return rgb.astype(np.float32)


def decal(body, name, rgba, side, cx, cz, width, lift=.0045):
    """Copy the cloth under a print, lift it off the surface and project the
    artwork straight on. The copy keeps the cloth's skin weights, so the print
    moves with the shirt and never slides or cuts through it."""
    height = width * rgba.shape[0] / rgba.shape[1]
    x0, z0 = cx - width / 2, cz - height / 2
    toward = -1 if side == 'front' else 1
    verts = body.data.vertices
    keep = set()
    for p in body.data.polygons:
        if p.normal.y * toward < .15:
            continue
        xs = [verts[i].co.x for i in p.vertices]
        zs = [verts[i].co.z for i in p.vertices]
        if max(xs) < x0 or min(xs) > x0 + width or max(zs) < z0 or min(zs) > z0 + height:
            continue
        keep.add(p.index)
    d = duplicate(body, name)
    if d.data.shape_keys:
        d.shape_key_clear()
    keep_faces(d, keep)
    # Lift along the normal shared by every copy of a point. The mesh is split
    # along its UV seams, and each copy's own normal differs: lifted apart,
    # the copies opened thin cracks through the print.
    shared = defaultdict(Vector)
    for v in d.data.vertices:
        shared[position_key(v.co)] += v.normal
    for v in d.data.vertices:
        v.co += shared[position_key(v.co)].normalized() * lift
    uvl = d.data.uv_layers.active.data
    for p in d.data.polygons:
        for li, vi in zip(p.loop_indices, p.vertices):
            co = d.data.vertices[vi].co
            u = (co.x - x0) / width
            uvl[li].uv = (1 - u if side == 'back' else u, (co.z - z0) / height)
    d.data.materials.clear()
    d.data.materials.append(textured(name, rgba))
    d['componentId'] = name
    return d


# The owner's reference vest (2026-09-24): matte black, binding and stitching
# a shade lighter, dark zips with light pulls, brass hardware.
VEST_SWATCH = {
    'nylon': (.075, .078, .083), 'binding': (.16, .165, .17), 'stitch': (.25, .255, .26),
    'teeth': (.3, .3, .31), 'pull': (.62, .63, .65), 'brass': (.66, .52, .26),
    'flap': (.1, .103, .108), 'pocket': (.088, .091, .097),
}


class VestLayout:
    """Where the vest's parts sit, from the body's own landmarks, in model
    units. Shared by the painted cloth and the pockets built on it."""

    def __init__(self, hem, collar, shoulder, narrow):
        self.hem, self.collar, self.shoulder, self.narrow = hem, collar, shoulder, narrow
        self.top = shoulder.z + .03
        self.armpit = shoulder.z - .085
        self.v_bottom = collar - .12          # the V opens from here to the collar
        self.yoke = shoulder.z - .042
        self.waist_zip = hem + .12
        self.chest_x, self.lower_x = .068 * narrow, .07 * narrow
        self.chest_top = self.v_bottom + .004
        self.panel = (-.105 * narrow, .105 * narrow, hem + .018, shoulder.z - .1)

    def v_half(self, z):
        t = np.clip((z - self.v_bottom) / (self.collar + .01 - self.v_bottom), 0, 1)
        return np.where(z >= self.v_bottom, .005 + .068 * t, .0)

    def side(self, z):
        lift = np.clip((z - self.armpit) / (self.top - self.armpit), 0, 1)
        return self.shoulder.x * 1.04 * (1 - lift) + .118 * lift


def texels(obj, faces, w, h, reach=.75):
    """For each face, the texels it covers and where each sits on the body at
    rest. Yields (rows, cols, points).

    Conservative: a texel counts when its centre is within `reach` pixels of
    the triangle, not only inside it. Re-laid UVs leave some triangles thinner
    than a pixel; strictly they cover nothing, and the colour they show on
    screen came from whatever island lay next to them."""
    uv = obj.data.uv_layers.active.data
    verts = obj.data.vertices
    for i in faces:
        p = obj.data.polygons[i]
        loops, ids = list(p.loop_indices), list(p.vertices)
        for k in range(1, len(loops) - 1):
            tri = (0, k, k + 1)
            P = np.array([[uv[loops[j]].uv[0] * w, uv[loops[j]].uv[1] * h] for j in tri])
            X = np.array([verts[ids[j]].co[:] for j in tri])
            x0, y0 = np.floor(P.min(axis=0) - reach).astype(int)
            x1, y1 = np.ceil(P.max(axis=0) + reach).astype(int)
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, w - 1), min(y1, h - 1)
            if x1 < x0 or y1 < y0:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
            q = np.stack([xs, ys], axis=-1)
            # Distance from each texel centre to the triangle: zero inside.
            (ax, ay), (bx, by), (cx, cy) = P
            d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(d) > 1e-12:
                l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
                l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
                inside = (l1 >= 0) & (l2 >= 0) & (1 - l1 - l2 >= 0)
            else:
                inside = np.zeros(xs.shape, bool)
            near = inside.copy()
            for a, b in ((P[0], P[1]), (P[1], P[2]), (P[2], P[0])):
                ab = b - a
                t = np.clip(((q - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
                near |= np.linalg.norm(q - (a + t[..., None] * ab), axis=-1) <= reach
            if not near.any():
                continue
            # Where each texel sits in 3D: barycentric, clamped onto the triangle.
            if abs(d) > 1e-12:
                bary = np.stack([l1, l2, 1 - l1 - l2], axis=-1).clip(0, None)
                bary /= np.maximum(bary.sum(axis=-1, keepdims=True), 1e-9)
            else:
                bary = np.full(xs.shape + (3,), 1 / 3)
            points = bary[near] @ X
            yield (ys[near] - .5).astype(int), (xs[near] - .5).astype(int), points


def vest_texture(key, body, atlas, layout, covered, tee_print=None):
    """The vest painted over the tee: every edge decided by where a texel sits
    on the body at rest, so none follows the generated mesh's own edges.

    Front: a V down to the chest pockets, a zip from there to the hem, binding
    round every opening, a yoke seam, and a zip across each side of the waist.
    Back: a yoke seam and the big zipped pocket panel the print sits on. The
    tee's own light and shade carry through, so the folds stay."""
    L = layout
    h, w = atlas.shape[:2]
    own = owners(body)
    polys = body.data.polygons
    faces = [i for i, o in enumerate(own)
             if L.hem - .02 < polys[i].center.z < L.top + .03 and abs(polys[i].center.x) < L.shoulder.x + .012
             and not any(n in o for n in ('ForeArm', 'Hand', 'Leg', 'Foot', 'Toe')) and o not in HEADS]
    cy = float(np.median([polys[i].center.y for i in faces]))
    out = atlas.copy()
    tee_light = float(np.median(lum(atlas[atlas.sum(axis=2) < .9])))
    sw = {k: np.array(v, np.float32) for k, v in VEST_SWATCH.items()}
    neck = .052
    x0, x1, z0, z1 = L.panel
    for rows, cols, pts in texels(body, faces, w, h):
        sx, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
        x = np.abs(sx)
        front = y < cy
        vh = L.v_half(z)
        side = L.side(z)
        opening = front & (x < vh)
        neckline = ~front & (z > L.collar - .02) & (x < neck)
        inside = (z > L.hem + .004) & (z < L.top) & (x < side) & ~opening & ~neckline
        inside &= lum(atlas[rows, cols]) < .35
        shade = np.clip(lum(atlas[rows, cols]) / max(tee_light, .02), .75, 1.3)[:, None]
        edge = np.minimum.reduce([
            z - L.hem, side - x,
            np.where(front & (z >= L.v_bottom), x - vh, 1.0),
            np.where(neckline | (~front & (z > L.collar - .02)), x - neck, 1.0),
        ])
        colour = np.repeat(sw['nylon'][None], len(z), axis=0)
        colour[edge < .008] = sw['binding']
        teeth = (np.floor(z / .0045) % 2 == 0)
        teeth_h = (np.floor(sx / .0045) % 2 == 0)
        # The front zip, from the bottom of the V to the hem.
        centre = front & (z < L.v_bottom) & (x < .006)
        colour[centre] = np.where(teeth[centre, None], sw['teeth'], sw['binding'])
        # Stitching: the yoke seam front and back, and the back panel's outline.
        seam = np.abs(z - L.yoke) < .0028
        panel = ~front & (sx > x0) & (sx < x1) & (z > z0) & (z < z1)
        outline = ~front & (((np.abs(sx - x0) < .0028) | (np.abs(sx - x1) < .0028)) & (z > z0) & (z < z1)
                            | (np.abs(z - z0) < .0028) & (sx > x0) & (sx < x1))
        colour[(seam | outline) & (edge >= .008)] = sw['stitch']
        # The back panel's zip along its top, and the waist zips in front.
        back_zip = ~front & (np.abs(z - z1) < .0045) & (sx > x0 + .01) & (sx < x1 - .01)
        colour[back_zip] = np.where(teeth_h[back_zip, None], sw['teeth'], sw['binding'])
        waist = front & (np.abs(z - L.waist_zip) < .0045) & (x > .014) & (x < side - .014)
        colour[waist] = np.where(teeth_h[waist, None], sw['teeth'], sw['binding'])
        colour[panel & ~outline & ~back_zip] = colour[panel & ~outline & ~back_zip] * 1.08
        grain = (np.sin(np.floor(sx / .01) * 12.99 + np.floor(z / .01) * 78.23) * 43758.5) % 1
        colour = colour * (.98 + .04 * grain)[:, None] * shade
        out[rows[inside], cols[inside]] = np.clip(colour[inside], 0, 1)
        # The tee's own lettering, where the V leaves the tee showing.
        if tee_print is not None:
            art, cx, cz, width = tee_print
            height = width * art.shape[0] / art.shape[1]
            u = (sx - (cx - width / 2)) / width
            v = (z - (cz - height / 2)) / height
            show = front & ~inside & (u >= 0) & (u < 1) & (v >= 0) & (v < 1)
            if show.any():
                texel = art[np.clip((v[show] * art.shape[0]).astype(int), 0, art.shape[0] - 1),
                            np.clip((u[show] * art.shape[1]).astype(int), 0, art.shape[1] - 1)]
                r, c = rows[show], cols[show]
                a = texel[:, 3:4]
                out[r, c] = out[r, c] * (1 - a) + texel[:, :3] * a
    out = pad(out, covered)
    new_image(key + '-vest', out, os.path.join(OUT, key + '-vest.jpg'), 'JPEG')
    return cy


def build_vest(arm, body, layout, key, cy):
    """The vest's hardware, stood on the painted cloth: two double-flap chest
    pockets, two zipped lower pockets with double flaps, the snap tab across
    the front zip, zip pulls, and brass D-rings front and back. Every piece
    takes the skin weights of the cloth under it."""
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree
    L = layout
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    groups = {g.index: g.name for g in body.vertex_groups}
    kd = KDTree(len(body.data.vertices))
    for v in body.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    names = list(VEST_SWATCH)
    swatch_uv = {name: ((i + .5) / len(names), .5) for i, name in enumerate(names)}
    swatch = np.zeros((2, len(names), 3), np.float32)
    for i, name in enumerate(names):
        swatch[:, i] = VEST_SWATCH[name]
    material = textured(key + '-vest-parts', swatch, alpha=False)
    parts = []

    def box(x, z, width, height, depth, kind, back=False, lift=0.0):
        origin, direction = (Vector((x, cy + 1, z)), Vector((0, -1, 0))) if back else (Vector((x, cy - 1, z)), Vector((0, 1, 0)))
        hit = tree.ray_cast(origin, direction)
        if hit[0] is None:
            return
        at, normal = hit[0], hit[1]
        outward = -direction
        if normal.dot(outward) < 0:
            normal = -normal
        normal = (normal + outward).normalized()
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts:
            v.co = Vector((v.co.x * width, v.co.y * depth, v.co.z * height))
        m = bpy.data.meshes.new('vest-part')
        bm.to_mesh(m)
        bm.free()
        frame = (-normal).to_track_quat('Y', 'Z').to_matrix().to_4x4()
        m.transform(Matrix.Translation(at + normal * (depth / 2 - .002 + lift)) @ frame)
        uv = m.uv_layers.new(name='UVMap')
        for loop in uv.data:
            loop.uv = swatch_uv[kind]
        o = bpy.data.objects.new('vest-part', m)
        bpy.context.collection.objects.link(o)
        o.data.materials.append(material)
        _, nearest, _ = kd.find(at)
        for g in body.data.vertices[nearest].groups:
            o.vertex_groups.new(name=groups[g.group]).add(list(range(len(m.vertices))), g.weight, 'REPLACE')
        parts.append(o)

    def ring(x, z, back=False):
        for dx, dz, bw, bh in ((0, .006, .014, .003), (0, -.006, .014, .003), (-.006, 0, .003, .012), (.006, 0, .003, .012)):
            box(x + dx, z + dz, bw, bh, .005, 'brass', back, lift=.004)

    for side in (-1, 1):
        # Chest pocket with two flaps side by side.
        cx, top = side * L.chest_x, L.chest_top
        box(cx, top - .028, .058, .054, .012, 'pocket')
        for f in (-1, 1):
            box(cx + f * .0145, top - .01, .027, .02, .016, 'flap')
        # Lower pocket: a zip across its top, two flaps below it.
        lx, ltop = side * L.lower_x, L.waist_zip - .012
        box(lx, ltop - .032, .07, .062, .014, 'pocket')
        box(lx, ltop - .004, .066, .005, .017, 'teeth')
        box(lx + side * .026, ltop - .006, .006, .012, .02, 'pull')
        for f in (-1, 1):
            box(lx + f * .0165, ltop - .02, .032, .022, .02, 'flap')
        # The waist zip's pull, near the centre.
        box(side * .02, L.waist_zip - .004, .006, .012, .012, 'pull')
    box(0, L.v_bottom - .006, .006, .014, .012, 'pull')
    # Snap tab across the front zip, with its brass stud.
    box(0, L.v_bottom - .045, .034, .011, .01, 'nylon')
    box(0, L.v_bottom - .045, .007, .007, .014, 'brass')
    ring(-L.lower_x, L.waist_zip - .082)
    box(0, L.collar - .035, .012, .016, .008, 'nylon', back=True)
    ring(0, L.collar - .05, back=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    vest = parts[0]
    vest.name = key + '-vest'
    for p in vest.data.polygons:
        p.use_smooth = False
    vest.parent = arm
    vest.modifiers.new('Armature', 'ARMATURE').object = arm
    vest['componentId'] = 'vest'
    return vest


# -------------------------------------------------------------------- her bob

# Her bob, modelled as the sheet draws it (the owner, October 1).
# The face's half width, round from the front. At 52.5 degrees the window
# reached past her cheeks, and the gaps where the generated side hair came
# off showed through it; the sheet's locks frame the face closer.
BOB_WINDOW = math.radians(45)
BOB_FRINGE = .035                  # the fringe's straight edge over the eyes' middle
BOB_OFFSET = .007                  # clear of the hair it replaces


def bob_texture(key, base, N, rows, window_cols, fringe_row):
    """Pixel blocks as the sheet paints the hair: vertical strands two blocks
    to a column of the mesh, each a shade of her own hair, darker toward the
    ends and under, lighter in a band over the crown."""
    rng = np.random.default_rng(7)
    W, H = 2 * N, 2 * rows
    base = np.array(base, np.float32)
    strand = rng.normal(0, .07, W)
    out = np.zeros((H, W, 3), np.float32)
    for y in range(H):
        v = (y + .5) / H                       # 0 at the ends, 1 at the crown
        shade = .82 + .22 * v
        shade += .12 * math.exp(-((v - .72) / .08) ** 2)     # the crown's sheen
        for x in range(W):
            k = shade * (1 + strand[x] + rng.normal(0, .035))
            out[y, x] = np.clip(base * k, 0, 1)
    # The fringe's and the ends' last block a shade darker, notched here and there.
    for x in range(W):
        if rng.random() < .55:
            out[0, x] *= .8
    return new_image(key + '-bob', out, os.path.join(WORK, key + '-bob.png'), 'PNG')


def build_bob(arm, body, key):
    """Her hair as a bob of the sheet's kind, in place of the generated one.

    The generated hair hung in strands with gaps between them and a toothed
    fringe, and its ends went black and spiky. The bob is a shell round the
    head: a dome from the crown down to a straight fringe just over the eyes,
    and a curtain falling straight from there to where her hair ended, with a
    window for the face. Every point is laid just outside the hair it replaces
    (a ray from outside in), so it keeps her hair's size and shape. Its edges
    turn in to the head for thickness, and its ends close in under it to the
    neck, so no view looks into the head. The generated hair is taken off;
    the bob joins the body, so its texture, dye and the cap's squash treat it
    as hair as before."""
    from mathutils.bvhtree import BVHTree
    B = arm.data.bones
    own = owners(body)
    cls = face_colours(body)
    polys = body.data.polygons
    verts = [v.co.copy() for v in body.data.vertices]
    head_parts = [i for i, o in enumerate(own) if o in HEADS or o == 'neck']
    hair = [i for i in head_parts if cls[i] == 'hair']
    texels = face_texels(body)
    base = np.median(np.concatenate([texels[i] for i in hair[::7]]), axis=0)
    everything = BVHTree.FromPolygons(verts, [tuple(polys[i].vertices) for i in head_parts])
    hair_set = set(hair)
    # The head and neck's own skin, for the edges to turn in to.
    bare = BVHTree.FromPolygons(verts, [tuple(polys[i].vertices) for i in head_parts if i not in hair_set])
    H = B['Head'].head_local
    eye = EYE_HEIGHT['female']
    top_fringe = eye + BOB_FRINGE
    ends = float(np.percentile([polys[i].center.z for i in hair], 1.5))
    C = Vector((H.x, H.y, top_fringe))

    def reach(tree, origin, d, far=.6):
        hit = tree.ray_cast(origin + d * far, -d, far)[0]
        return None if hit is None else (hit - origin).length

    N = 48
    thetas = [-math.pi + 2 * math.pi * i / N for i in range(N)]
    # Rows from the ends up: the curtain, then the dome to the crown.
    J, D = 8, 9
    curtain = [ends + (top_fringe - ends) * j / J for j in range(J)]
    dome = [math.radians(10 * k) for k in range(D)]            # 0 is the fringe's height
    rows = [('z', z) for z in curtain] + [('phi', p) for p in dome]
    radius = []
    for kind, val in rows:
        ring = []
        for t in thetas:
            if kind == 'z':
                o, d = Vector((C.x, C.y, val)), Vector((math.sin(t), -math.cos(t), 0))
            else:
                o, d = C, Vector((math.cos(val) * math.sin(t), -math.cos(val) * math.cos(t), math.sin(val)))
            ring.append(reach(everything, o, d))
        known = [r for r in ring if r is not None]
        ring = [r if r is not None else (max(known) if known else .15) for r in ring]
        radius.append(ring)
    raw = [list(r) for r in radius]
    for _ in range(3):
        radius = [[(r[i - 1] + 2 * r[i] + r[(i + 1) % N]) / 4 for i in range(N)] for r in radius]
    radius = [[max(a, b) + BOB_OFFSET for a, b in zip(r, q)] for r, q in zip(radius, raw)]
    # The curtain falls straight from the fringe's height and tucks in a
    # little at the ends, as the sheet's bob does, clear of the head, the
    # ears and the jaw. (Laid on the generated hair it flared out at the ends
    # like a bell.)
    for j in range(J):
        s_ = (J - j) / J
        z = curtain[j]
        floor = [reach(bare, Vector((C.x, C.y, z)), Vector((math.sin(t), -math.cos(t), 0))) for t in thetas]
        ring = [max(radius[J][i] * (1 - .035 * s_ * s_), (floor[i] or 0) + .014) for i in range(N)]
        for _ in range(2):
            ring = [(ring[i - 1] + 2 * ring[i] + ring[(i + 1) % N]) / 4 for i in range(N)]
        radius[j] = [max(ring[i], (floor[i] or 0) + .012) for i in range(N)]

    def point(k, i):
        kind, val = rows[k]
        t = thetas[i]
        r = radius[k][i]
        if kind == 'z':
            return Vector((C.x + r * math.sin(t), C.y - r * math.cos(t), val))
        return C + Vector((math.cos(val) * math.sin(t), -math.cos(val) * math.cos(t), math.sin(val))) * r

    window = lambda i: abs(thetas[i] + math.pi / N) < BOB_WINDOW          # the cell from column i to i+1
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new(body.data.uv_layers.active.name)
    grid = [[bm.verts.new(point(k, i)) for i in range(N)] for k in range(len(rows))]
    pole = bm.verts.new(C + Vector((0, 0, max(reach(everything, C, Vector((0, 0, 1))) or .2, 0) + BOB_OFFSET)))
    R = len(rows)
    vcoord = lambda k: k / R

    def face(vs, uvs):
        f = bm.faces.new(vs)
        for l, (u, v) in zip(f.loops, uvs):
            l[uv].uv = (u, v)
        return f
    for k in range(R):
        for i in range(N):
            j = (i + 1) % N
            if k < J and window(i):
                continue
            u0, u1 = i / N, (i + 1) / N
            if k + 1 < R:
                face((grid[k][i], grid[k][j], grid[k + 1][j], grid[k + 1][i]),
                     ((u0, vcoord(k)), (u1, vcoord(k)), (u1, vcoord(k + 1)), (u0, vcoord(k + 1))))
            else:
                face((grid[k][i], grid[k][j], pole), ((u0, vcoord(k)), (u1, vcoord(k)), ((u0 + u1) / 2, 1.0)))
    # The edges turned in to the head.
    inward = []
    def tuck(v, dist_in):
        c = v.co
        d = Vector((c.x - C.x, c.y - C.y, 0)).normalized()
        o = Vector((C.x, C.y, c.z))
        skin = reach(bare, o, d, (c - o).length + .05)
        r = (c - o).length
        # Where no skin is left behind the edge (the generated hair came off
        # there), the turn goes deep, a wall of hair, so nothing shows past it.
        # Just short of the skin: driven 4 mm into it, the turn poked out
        # through her cheek where it curves, as a black shard.
        depth = min(r - .006, skin + .0015) if skin is not None else r * .45
        return bm.verts.new(o + d * max(depth, .02))
    under = lambda v: (v.co - Vector((C.x, C.y, v.co.z))).length
    dark_uv = (.5, 1.5 / (2 * R))
    # The ends: closed in under the bob to the neck, on a smooth ring round it.
    ring0 = [i for i in range(N) if not window(i) or not window((i - 1) % N)]
    o0 = Vector((C.x, C.y, curtain[0]))
    neck_r = [reach(bare, o0, Vector((math.sin(t), -math.cos(t), 0)), .3) for t in thetas]
    known = [r for r in neck_r if r is not None]
    neck_r = [r if r is not None else (min(known) if known else .05) for r in neck_r]
    for _ in range(3):
        neck_r = [(neck_r[i - 1] + 2 * neck_r[i] + neck_r[(i + 1) % N]) / 4 for i in range(N)]
    inner = {}
    for i in ring0:
        t = thetas[i]
        r = min(neck_r[i] - .004, radius[0][i] - .012)
        inner[i] = bm.verts.new(o0 + Vector((math.sin(t), -math.cos(t), 0)) * max(r, .02))
    for i in ring0:
        j = (i + 1) % N
        if j in inner and not window(i):
            f = face((inner[i], inner[j], grid[0][j], grid[0][i]), (dark_uv,) * 4)
            inward.append((f, Vector((0, 0, -1))))
    # The fringe's edge and the window's sides.
    wl = min(i for i in range(N) if window(i))
    wr = max(i for i in range(N) if window(i)) + 1
    fringe = {i: tuck(grid[J][i], .02) for i in range(wl, wr + 1)}
    for i in range(wl, wr):
        f = face((grid[J][i], grid[J][i + 1], fringe[i + 1], fringe[i]), (dark_uv,) * 4)
        inward.append((f, Vector((0, 0, -1))))
    for col, toward in ((wl, 1), (wr, -1)):
        side = {k: tuck(grid[k][col], .02) for k in range(J)}
        side[J] = fringe[col]
        for k in range(J):
            f = face((grid[k][col], grid[k + 1][col], side[k + 1], side[k]), (dark_uv,) * 4)
            t = thetas[col]
            inward.append((f, Vector((math.cos(t), math.sin(t), 0)) * toward))
    bm.normal_update()
    for f, want in inward:
        if f.normal.dot(want) < 0:
            f.normal_flip()
    for f in bm.faces:
        f.smooth = True
    # The clip on her left, on the lock beside the face at the eyes' tops,
    # tipped toward the face (the sheet's; the generated one went with the
    # hair). Cream, which the dye leaves alone.
    t = BOB_WINDOW + math.radians(9)
    z = top_fringe - .022
    k = max(j for j in range(J) if curtain[j] <= z)
    r = radius[k][int(round((t + math.pi) / (2 * math.pi) * N)) % N]
    out = Vector((math.sin(t), -math.cos(t), 0))
    along = Vector((math.cos(t), math.sin(t), 0))
    tip = math.radians(28)
    up = Vector((0, 0, 1)) * math.cos(tip) + along * math.sin(tip)
    side = up.cross(out)
    centre = Vector((C.x, C.y, z)) + out * (r + .003)
    corners = [bm.verts.new(centre + side * sx * .0085 + up * sy * .017 + out * sz * .0045)
               for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    idx = lambda sx, sy, sz: corners[(sx > 0) * 4 + (sy > 0) * 2 + (sz > 0)]
    quads = [((1, -1, 1), (1, 1, 1), (-1, 1, 1), (-1, -1, 1), out), ((-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1), -out),
             ((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1), side), ((-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1), -side),
             ((-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1), up), ((-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1), -up)]
    for *q, want in quads:
        f = face([idx(*c) for c in q], ((.1, .1), (.1, .9), (.9, .9), (.9, .1)))
        f.material_index = 1
        f.normal_update()
        if f.normal.dot(want) < 0:
            f.normal_flip()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    mesh = bpy.data.meshes.new(key + '-bob')
    bm.to_mesh(mesh)
    bm.free()
    bob = bpy.data.objects.new(key + '-bob', mesh)
    bpy.context.collection.objects.link(bob)
    bob.matrix_world = body.matrix_world.copy()
    bob.vertex_groups.new(name='Head').add(list(range(len(mesh.vertices))), 1, 'REPLACE')
    # Marked, so the face painter can tell the bob from the face under it.
    mesh.attributes.new('bob', 'INT', 'FACE').data.foreach_set('value', [1] * len(mesh.polygons))
    mesh.materials.append(plain_material(key + '-bob', bob_texture(key, base, N, R, None, J)))
    clip = np.tile(np.array([.93, .89, .72], np.float32), (8, 4, 1))
    clip[3:5, :] = [.62, .6, .55]
    mesh.materials.append(plain_material(key + '-clip', new_image(key + '-clip', clip, os.path.join(WORK, key + '-clip.png'), 'PNG')))
    # The generated hair off.
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in hair], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # Where a strand lay on the face inside the window, its going left a hole
    # in her cheek (kept, the strands stood off it as shards). Small holes
    # there are closed, their texture taken from the skin round them, which
    # the face painter paints over.
    def on_face(c):
        return abs(math.atan2(c.x - C.x, -(c.y - C.y))) < BOB_WINDOW + math.radians(6) and ends < c.z < top_fringe + .01
    uvl = bm.loops.layers.uv.active
    used, closed = set(), 0
    for e0 in bm.edges:
        if not e0.is_boundary or e0 in used:
            continue
        loop, todo = [], [e0]
        used.add(e0)
        while todo:
            e = todo.pop()
            loop.append(e)
            for v in e.verts:
                for e2 in v.link_edges:
                    if e2.is_boundary and e2 not in used:
                        used.add(e2)
                        todo.append(e2)
        if sum(e.calc_length() for e in loop) > .14 or not all(on_face(v.co) for e in loop for v in e.verts):
            continue
        made = bmesh.ops.holes_fill(bm, edges=loop, sides=0)['faces']
        for f in made:
            for l in f.loops:
                other = next((m for m in l.vert.link_loops if m.face not in made), None)
                if other is not None:
                    l[uvl].uv = other[uvl].uv
        closed += 1
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    join_into(body, [bob])
    return {'faces': len(mesh.polygons), 'removed': len(hair), 'holesClosed': closed, 'fringe': round(top_fringe, 3), 'ends': round(ends, 3),
            'shade': [round(float(x), 3) for x in base]}


def paint_sheet_face(arm, body, atlas, fringe):
    """Her face as the owner's sheet draws it (October 1): one flat pale tone
    in the bob's window; two tall near-black eyes just under the fringe, each
    with a lid line over it and a square white glint in its upper corner; a
    tiny mouth; a faint blush. Sized from the window itself: the eyes a
    quarter of the height from the fringe to the chin, their inner edges
    three quarters of an eye's width either side of the middle."""
    own = owners(body)
    polys = body.data.polygons
    bob = np.zeros(len(polys), np.int32)
    body.data.attributes['bob'].data.foreach_get('value', bob)
    cx = arm.data.bones['Head'].head_local.x
    cy = arm.data.bones['Head'].head_local.y
    neck = arm.data.bones['neck'].head_local
    # Whichever way they face: through a gap in her cheek the inside of the
    # head showed, dark, as a triangle.
    front = [i for i, o in enumerate(own) if o in HEADS and not bob[i]
             and abs(math.atan2(polys[i].center.x - cx, -(polys[i].center.y - cy))) < BOB_WINDOW + math.radians(8)
             and neck.z < polys[i].center.z < fringe + .02]
    pix = list(_face_pixels(body, atlas, front))
    rows = np.concatenate([r for _, r, _, _ in pix])
    cols = np.concatenate([c for _, _, c, _ in pix])
    pts = np.concatenate([p for _, _, _, p in pix])
    rgb = atlas[rows, cols]
    cls = colour_class(rgb)
    skin_sel = cls == 'skin'
    skin = np.median(rgb[skin_sel], axis=0) if skin_sel.sum() > 20 else np.array([.95, .86, .8])
    x, z = pts[:, 0], pts[:, 2]
    chin = float(np.percentile(z[np.abs(x - cx) < .03], 1))
    out = np.tile(skin, (len(rgb), 1))
    eh = .3 * (fringe - chin)
    ew = eh / 1.35
    top = fringe - .003
    bottom = top - eh

    def paint(m, colour, alpha=1.0):
        out[m] = out[m] * (1 - alpha) + np.array(colour) * alpha

    def box(xa, xb, za, zb):
        return (x >= min(xa, xb)) & (x <= max(xa, xb)) & (z >= za) & (z <= zb)
    for sign in (-1, 1):
        inner = cx + sign * .7 * ew
        outer = inner + sign * ew
        mid = (inner + outer) / 2
        blush = ((x - mid) / (ew * .75)) ** 2 + ((z - (bottom - eh * .22)) / (eh * .16)) ** 2 < 1
        paint(blush, [.96, .62, .6], .16)
        paint(box(inner, outer, bottom, top), [.11, .085, .09])
        # The lower third a dark brown, as the sheet's eyes catch the light.
        paint(box(inner + sign * ew * .12, outer - sign * ew * .12, bottom + eh * .06, bottom + eh * .34), [.3, .21, .2])
        # The lid: a line over the eye, a little wider than it.
        paint(box(inner - sign * ew * .06, outer + sign * ew * .1, top - eh * .09, top), [.06, .045, .05])
        # The glint, upper left on both eyes, as one light.
        left = min(inner, outer)
        paint(box(left + ew * .14, left + ew * .42, top - eh * .42, top - eh * .16), [.97, .97, .97])
    mouth_z = chin + .3 * (bottom - chin)
    paint(box(cx - ew * .2, cx + ew * .2, mouth_z - .0022, mouth_z + .0022), skin * np.array([.78, .6, .56]))
    atlas[rows, cols] = out
    body.data.attributes.remove(body.data.attributes['bob'])
    return {'painted': int(len(rgb)), 'eye': [round(ew, 3), round(eh, 3), round(top, 3)], 'chin': round(chin, 3),
            'skin': [round(float(v), 3) for v in skin]}


# -------------------------------------------------------------------- cap

# A six-panel baseball cap's crown, as the owner's sheet draws it: walls
# that lean in from the band and round over into the top (October 1). The
# first profile was a dome, which read as a beanie; the second stood upright
# to half its height with a flat top, on a squared plan, and read as a
# pillbox.
CROWN = [(0, 1.0), (.2, .99), (.4, .955), (.6, .88), (.75, .76), (.87, .58), (.95, .36), (1.0, 0.0)]


def crown_factor(t):
    t = min(1, max(0, t))
    for (t0, f0), (t1, f1) in zip(CROWN, CROWN[1:]):
        if t <= t1:
            return f0 + (f1 - f0) * (t - t0) / (t1 - t0)
    return 0


def head_frame(arm, body, sex):
    """Measure the clothed head: eyes, face, hair, crown. Everything the cap
    is fitted from."""
    own = owners(body)
    cls = face_colours(body)
    polys = body.data.polygons
    head = [i for i, o in enumerate(own) if o in HEADS]
    skin = [polys[i].center for i in head if cls[i] == 'skin' and polys[i].normal.y < -.4]
    eyes = [polys[i].center for i in head if cls[i] == 'dark' and polys[i].normal.y < -.5 and abs(polys[i].center.x) < .09]
    if len(eyes) >= 5:
        eye_z = float(np.median([c.z for c in eyes]))
    else:
        # The male's eyes are the brown of his hair; which class their texels
        # read as moves with the atlas packing. The heads never change, so
        # the height measured when they did read dark stands in.
        eye_z = EYE_HEIGHT[sex]
    report.setdefault(sex, {})['eyes'] = {'faces': len(eyes), 'z': round(eye_z, 3)}
    ids = {vi for i in head for vi in polys[i].vertices}
    co = np.array([body.data.vertices[i].co[:] for i in ids])
    hb = arm.data.bones['Head'].head_local
    return {'eye': eye_z, 'faceFront': min(c.y for c in skin), 'chin': min(c.z for c in skin if abs(c.x) < .03),
            'top': float(co[:, 2].max()), 'co': co, 'x': hb.x, 'headZ': hb.z}


# Eye heights, measured off the faces themselves (2026-09-27): the non-skin
# faces on the front of the face between chin and fringe. His are at .47-.505;
# the .421 carried before was below them, which is why his brim sat on his eyes.
EYE_HEIGHT = {'male': .487, 'female': .435}   # hers remeasured on the September 25 head
# The band sits this far above the middle of the eyes: on the brow, over the
# fringe, as a cap is worn. His eyes are tall, so less of a gap over their middle.
CAP_BAND = {'male': .105, 'female': .085}
# How tall the crown stands over its band, against the band's half width. Hers
# (1.05) for both: sized to the top of his curls it stood 1.66 and swallowed
# his head, and the owner asked for the two caps to match.
CAP_RISE = 1.05
# The shared cap's scale against the September 28 master.
CAP_SIZE = .85
# Hair this far below the band is drawn in to it while the cap is on.
CAP_SKIRT = .07


def fit_cap(frame, sex):
    """The cap sits snug on the head: its band goes round the hair at brow
    height, a little inside it, and its crown rises nearly to the top of the
    hair. CapHair presses the hair in under it.

    The first cap was fitted inside the hair with its band high on the head:
    the curls stood out all round it and only a flat disc of crown showed. The
    second enclosed all the hair, which on the curls made a helmet."""
    co, eye = frame['co'], frame['eye']
    band = eye + CAP_BAND[sex] + .008
    ring = co[np.abs(co[:, 2] - band) < .015]
    cx = frame['x']
    # One physical cap master for both bodies. Hair changes shape to fit it;
    # curly hair must not scale the hat into a different product. At .242 it
    # stood a quarter wider than her hair (.197 at the band) and the owner
    # found it too big on both (2026-09-29); CAP_SIZE fits it to her head.
    s = CAP_SIZE
    back = float(np.percentile(ring[:, 1], 97))
    return {
        'origin': Vector((cx, (float(np.percentile(ring[:, 1], 3)) + back) / 2, band)),
        'a': .242 * s, 'b': .240 * s, 'H': .195 * s,
        'tilt': math.radians(-3), 'brim': .15 * s, 'exp': 2.15,
    }


def cap_point(fit, theta, t, lift=0.0):
    """A point on the crown: theta around from the front (0 = straight ahead)."""
    n = fit['exp']
    f = crown_factor(t) + lift
    c, s = math.cos(theta), math.sin(theta)
    r = 1 / ((abs(s) ** n + abs(c) ** n) ** (1 / n))
    local = Vector((s * r * fit['a'] * f, -c * r * fit['b'] * f, t * fit['H']))
    return cap_world(fit, local)


def cap_world(fit, local):
    return fit['origin'] + Matrix.Rotation(fit['tilt'], 3, 'X') @ local


def cap_local(fit, point):
    return Matrix.Rotation(-fit['tilt'], 3, 'X') @ (point - fit['origin'])


def weighted(obj, arm, bone='Head'):
    obj.parent = arm
    obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    obj.modifiers.new('Armature', 'ARMATURE').object = arm
    return obj


# The opening at the back over the strap: per row of the crown from the
# band, how far round from straight behind it is open.
CAP_OPENING = {1: math.radians(17), 2: math.radians(6)}


def build_cap(arm, fit, key):
    seg, rows = 32, [0, .12, .28, .44, .56, .68, .78, .86, .92, .96, 1.0]
    verts, faces, uvs = [], [], []
    for t in rows[:-1]:
        for s in range(seg):
            verts.append(cap_point(fit, 2 * math.pi * s / seg, t))
    verts.append(cap_world(fit, Vector((0, 0, fit['H']))))
    for k in range(len(rows) - 2):
        for s in range(seg):
            behind = abs(math.pi - 2 * math.pi * (s + .5) / seg)
            if behind < CAP_OPENING.get(k, -1):
                continue
            a, b = k * seg + s, k * seg + (s + 1) % seg
            faces.append((b, a, a + seg, b + seg))
    top = len(verts) - 1
    last = (len(rows) - 2) * seg
    for s in range(seg):
        faces.append((last + (s + 1) % seg, last + s, top))
    # Inner lining: the band's inside face, so the crown never shows its back.
    inner0 = len(verts)
    for s in range(seg):
        verts.append(cap_world(fit, cap_local(fit, verts[s]) * .96 + Vector((0, 0, .012))))
    for s in range(seg):
        a, b = s, (s + 1) % seg
        faces.append((a, b, inner0 + b, inner0 + a))
    # The bill: a stiff, gently curved peak off the front of the band, broad
    # and rounded at the front like a baseball cap's, pitched down a little
    # and curving down at its sides. The first was an oval plate.
    steps, length, thick = 16, fit['brim'], .012
    pitch = math.tan(math.radians(12))
    bill = []
    for i in range(steps + 1):
        phi = math.radians(-80 + 160 * i / steps)
        c, s_ = math.cos(phi), math.sin(phi)
        inner = Vector((s_ * fit['a'] * 1.005, -c * fit['b'] * 1.005, -.003))
        reach = max(c, 0) ** .55
        outer = inner + Vector((s_ * length * .08, -length * reach, 0))
        row = []
        for u in (0, .5, 1):
            p = inner.lerp(outer, u)
            d = (inner - p).length
            p.z -= pitch * d + .34 * length * s_ * s_ * u * u
            row.append((cap_world(fit, p), cap_world(fit, p + Vector((0, 0, thick * (1 - .35 * u))))))
        ids = []
        for lo, hi in row:
            ids.append((len(verts), len(verts) + 1))
            verts += [lo, hi]
        bill.append(ids)
    for i in range(steps):
        for j in range(2):
            (l0, h0), (l1, h1) = bill[i][j], bill[i][j + 1]
            (m0, g0), (m1, g1) = bill[i + 1][j], bill[i + 1][j + 1]
            faces += [(h0, h1, g1, g0), (m0, m1, l1, l0)]
        (lo, hi), (mo, mi) = bill[i][2], bill[i + 1][2]
        faces.append((lo, mo, mi, hi))
    for i in (0, steps):
        (l0, h0), (l1, h1), (l2, h2) = bill[i]
        faces += [(l0, l1, h1, h0), (l1, l2, h2, h1)] if i == 0 else [(h0, h1, l1, l0), (h1, h2, l2, l1)]
    # Button on the crown.
    b0 = len(verts)
    for z in (0, .012):
        for s in range(6):
            a = 2 * math.pi * s / 6
            verts.append(cap_world(fit, Vector((math.cos(a) * .013, math.sin(a) * .013, fit['H'] - .004 + z))))
    for s in range(6):
        a, b = b0 + s, b0 + (s + 1) % 6
        faces.append((a, b, b + 6, a + 6))
    faces.append(tuple(range(b0 + 11, b0 + 5, -1)))
    mesh = bpy.data.meshes.new(key + '-cap')
    mesh.from_pydata([v[:] for v in verts], [], faces)
    mesh.update()
    layer = mesh.uv_layers.new(name='UVMap')
    for p in mesh.polygons:
        for li, vi in zip(p.loop_indices, p.vertices):
            v = mesh.vertices[vi].co
            layer.data[li].uv = (v.x * 9 + v.y * 5, v.z * 9 + v.y * 4)
    cap = bpy.data.objects.new(key + '-cap', mesh)
    bpy.context.collection.objects.link(cap)
    mesh.materials.append(textured('cap-cloth', noise_texture('cap-cloth', (.9, .9, .9), .07), alpha=False))
    cap['componentId'] = 'cap'
    # Kept on the object so a check can measure hair against this exact cap.
    cap['fit'] = {'origin': list(fit['origin']), 'a': fit['a'], 'b': fit['b'], 'H': fit['H'],
                  'tilt': fit['tilt'], 'brim': fit['brim'], 'exp': fit['exp']}
    return weighted(cap, arm)


def build_cap_mark(arm, fit, key, mark):
    """The mark as its own thin skin over the front panels, just proud of them."""
    t0, t1 = .18, .76
    height = (t1 - t0) * fit['H']
    width = height * mark.shape[1] / mark.shape[0]
    theta = width / (2 * fit['a'] * crown_factor((t0 + t1) / 2))
    cols, rows = 8, 8
    verts, faces, uvs = [], [], []
    for j in range(rows + 1):
        t = t0 + (t1 - t0) * j / rows
        for i in range(cols + 1):
            th = -theta + 2 * theta * i / cols
            verts.append(cap_point(fit, th, t, lift=.02))
            uvs.append((i / cols, j / rows))
    for j in range(rows):
        for i in range(cols):
            a = j * (cols + 1) + i
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    mesh = bpy.data.meshes.new(key + '-cap-mark')
    mesh.from_pydata([v[:] for v in verts], [], faces)
    mesh.update()
    # Faces outward, toward the viewer in front of the cap.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    if bm.faces[len(bm.faces) // 2].normal.y > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    layer = mesh.uv_layers.new(name='UVMap')
    for p in mesh.polygons:
        for li, vi in zip(p.loop_indices, p.vertices):
            layer.data[li].uv = uvs[vi]
    obj = bpy.data.objects.new(key + '-cap-mark', mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(textured('cap-mark', mark))
    obj['componentId'] = 'cap-logo'
    return weighted(obj, arm)


def ensure_basis(body):
    if not body.data.shape_keys:
        body.shape_key_add(name='Basis', from_mix=False)


def charcoal_tee(tee, atlas, target=.27):
    """His tee in charcoal, as the owner's reference has it (October 2),
    not black: every dark texel of the tee lifted by the same amount, so its
    folds and seams keep their shading. Light texels (stitching) stay."""
    h, w = atlas.shape[:2]
    rows, cols = [], []
    for r, c, _ in texels(tee, range(len(tee.data.polygons)), w, h):
        rows.append(r); cols.append(c)
    if not rows:
        return 0
    rows, cols = np.concatenate(rows), np.concatenate(cols)
    rgb = atlas[rows, cols, :3]
    dark = lum(rgb) < .3
    lift = target - float(np.median(lum(rgb[dark])))
    rgb[dark] = np.clip(rgb[dark] + lift, 0, 1)
    atlas[rows, cols, :3] = rgb
    return round(lift, 3)


def cap_hair_key(body, fit, hug=False):
    """Contain only crown hair, retaining the visible fringe, sides and nape.
    No lateral cut-off: excluding the outer vertices left long stretched fins.
    The small blend is below the band; hair below it stays exactly as modelled.
    """
    ensure_basis(body)
    key=body.shape_key_add(name='CapHair',from_mix=False);key.value=0
    own=owners(body);classes=face_colours(body)
    # The face and ears are never moved, only hair; above the band, skin is
    # scalp, and goes under the crown with the hair or pokes through its top.
    protected={i for p,o,c in zip(body.data.polygons,own,classes) if o in HEADS and c=='skin' for i in p.vertices
               if cap_local(fit,body.data.vertices[i].co).z<0}
    moved=0;n=fit['exp']
    norm=lambda v,f:((abs(v.x)/(fit['a']*f))**n+(abs(v.y)/(fit['b']*f))**n)**(1/n)
    for i in range(len(body.data.vertices)):
        if i in protected:continue
        local=cap_local(fit,body.data.vertices[i].co)
        if local.z<-CAP_SKIRT:continue
        new=local.copy()
        if local.z>=0:
            # Inside the crown.
            t=min(local.z/fit['H'],.94);q=norm(local,max(.08,crown_factor(t))*.91)
            new.z=min(local.z,.94*fit['H'])
            if q>1:new.x/=q;new.y/=q
        else:
            # Below the band the hair leaves from under the rim and eases out
            # to its own shape over CAP_SKIRT. Released within 3 cm (Sep 28),
            # curls bent out sharply at the rim, as if the rim cut them.
            # Hugged (his curls, October 2): out only a little under the rim,
            # as on the owner's reference, not standing out round the cap.
            w=smoothstep(0,CAP_SKIRT,-local.z);allowed=(.93+.18*w*w) if hug else (.97+.6*w*w)
            q=norm(local,1.0)
            if q>allowed:new.x*=allowed/q;new.y*=allowed/q
            # And stays under the bill: a fringe at the rim poked up through it.
            e=math.hypot(new.x/fit['a'],new.y/fit['b'])
            phi=math.atan2(new.x/fit['a'],-new.y/fit['b'])
            if e>.97 and abs(phi)<math.radians(80):
                s_=math.sin(phi);out=max(0.0,(e-1.005))*math.hypot(s_*fit['a'],math.cos(phi)*fit['b'])
                if out<=fit['brim']:
                    under=-.003-math.tan(math.radians(12))*out-.34*fit['brim']*s_*s_*(out/fit['brim'])**2-.008
                    new.z=min(new.z,under)
        if (new-local).length>1e-5:key.data[i].co=cap_world(fit,new);moved+=1
    return moved


# ---------------------------------------------------------------- dye mask

def srgb_to_linear(c):
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)


def tee_edge(body, hem, w, h, bins=36):
    """Per angle round the body, the height where the tee really stops.

    HEM marks where the body of the tee meets its hem band, and the band, a
    shade lighter, hangs a few centimetres further over the trousers. Dyeing
    everything below HEM as trousers turned the band the trousers' colour.
    The edge is found from the shape instead: going down from HEM, the first
    height at which the outermost surface steps in by more than a centimetre,
    off the tee onto the trousers. Returns the body's centre and the edge
    height per angle."""
    own = owners(body)
    faces = [p.index for p, o in zip(body.data.polygons, own)
             if hem - .16 < p.center.z < hem + .03 and o not in HEADS
             and not any(n in o for n in ('Arm', 'Hand', 'Foot', 'Toe'))]
    pts = np.concatenate([p for _, _, p in texels(body, faces, w, h)])
    centre = pts[:, :2].mean(axis=0)
    d = pts[:, :2] - centre
    r = np.hypot(d[:, 0], d[:, 1])
    b = ((np.arctan2(d[:, 1], d[:, 0]) % (2 * np.pi)) / (2 * np.pi) * bins).astype(int) % bins
    step, floor = .004, hem - .16
    k = np.floor((pts[:, 2] - floor) / step).astype(int)
    inside = k >= 0
    outer = np.full((bins, k.max() + 1), -1.0)
    np.maximum.at(outer, (b[inside], k[inside]), r[inside])
    at = lambda z: int((z - floor) / step)
    edge = []
    for i in range(bins):
        tee = outer[i, at(hem - .012):at(hem + .012) + 1]
        tee = tee[tee > 0]
        found = None
        if len(tee):
            for kk in range(at(hem), at(hem - .11), -1):
                if 0 < outer[i, kk] < np.median(tee) - .012:
                    found = floor + (kk + 1) * step
                    break
        edge.append(min(hem, max(hem - .1, found)) if found is not None else None)
    edge = ring_fill(edge)
    edge = np.array(edge if edge is not None else [hem - .06] * bins)
    report.setdefault(body.name, {})['teeEdge'] = [round(float(e - hem), 3) for e in edge]
    return centre, edge


def edge_at(centre, edge, pts):
    """The tee's edge height under each point, interpolated round the body."""
    n = len(edge)
    d = pts[:, :2] - centre
    pos = (np.arctan2(d[:, 1], d[:, 0]) % (2 * np.pi)) / (2 * np.pi) * n - .5
    i0 = np.floor(pos).astype(int)
    t = pos - i0
    return edge[i0 % n] * (1 - t) + edge[(i0 + 1) % n] * t


def export(key, arm, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in [arm] + objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    path = os.path.join(OUT, key + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_animations=False, export_extras=True, export_yup=True, export_skins=True,
        export_morph=True, export_morph_normal=False, export_image_format='AUTO', export_attributes=True,
        export_jpeg_quality=88, export_tangents=False)
    compress(path)


def compress(path):
    """Meshopt-compress a GLB in place: about half the bytes, decoded in the
    browser by three.js's bundled MeshoptDecoder. Signing in waited on these
    files. GLTF_TRANSFORM may name a local gltf-transform binary; otherwise
    the pinned CLI is fetched through npx."""
    import subprocess
    tool = os.environ.get('GLTF_TRANSFORM')
    if not tool:
        local = os.path.abspath(os.path.join(WORLD, '../.tools/node_modules/.bin/gltf-transform'))
        if os.path.exists(local): tool = local
    command = [tool] if tool else ['npx', '--yes', '@gltf-transform/cli@4.5.0']
    # The 2048 atlas as WebP at 95: 4.4 MB to 1.5 MB for her, no difference on
    # screen (about 1/255 on average). The world waited on these files at the
    # gate and took long to open (the owner, October 2). Only the body atlas:
    # the prints and the cap stay PNG, small and exact. Before meshopt, which
    # a later texture pass would undo.
    subprocess.run(command + ['webp', path, path, '--quality', '95', '--pattern', '*-body'], check=True, capture_output=True)
    subprocess.run(command + ['meshopt', path, path], check=True, capture_output=True)


# ------------------------------------------------------------------ build


# ---------------------------------------------------------------- garments

# key, the base generation (one body, in its swimwear, worn under every
# outfit), and the clothed generation whose clothes are lifted onto it.
BODIES = [('male', 'male-base', 'base'), ('female', 'female-base', 'female')]
if FEMALE_SWIM_MODEL:
    BODIES.append(('female-swim', 'female-swim', None))
GARMENTS = ('tee', 'trousers', 'shoes')
TORSO = ('Spine', 'Spine01', 'Spine02', 'LeftShoulder', 'RightShoulder')
ARM_BONES = ('Shoulder', 'Arm', 'ForeArm', 'Hand')
# What each garment may follow. The tee's hem followed the thighs and
# stretched as they swung; the trousers never follow an arm.
FOLLOW = {
    'tee': lambda n: not any(k in n for k in LEG_BONES),
    'trousers': lambda n: n == 'Hips' or any(k in n for k in LEG_BONES),
    'shoes': lambda n: any(k in n for k in ('Foot', 'ToeBase', 'Leg')) and 'UpLeg' not in n,
}


def skinlike(rgb):
    r, g, b = (float(x) for x in rgb)
    return r >= g >= b and r - b > .08 and float(lum(rgb)) > .3


def classify_garments(carm, cbody, sex):
    """Which faces of the clothed generation are the tee, the trousers and
    the shoes. The torso is all tee, whatever a texel's colour: pale
    lettering and the generator's skin-coloured slivers are still cloth.
    Below the tee's own edge, legs are trousers; feet are shoes; skin and the
    head are left behind (the tee's crew collar, weighted to the head, is not)."""
    own = owners(cbody)
    samples = face_samples(cbody)
    cut = carm.data.bones['Head'].head_local.z
    neck = carm.data.bones['neck'].head_local.z
    axis = Vector(carm.data.bones['neck'].head_local[:2])
    centre, edge = tee_edge(cbody, HEM[sex], 1024, 1024)
    kind = {}
    for p, o, rgb in zip(cbody.data.polygons, own, samples):
        c = p.center
        near_neck = (Vector(c[:2]) - axis).length < .085
        # Skin at the neck, inside the collar, is the neck, not the tee.
        if o in TORSO and not (near_neck and c.z > neck - .06 and skinlike(rgb)):
            kind[p.index] = 'tee'
            continue
        if skinlike(rgb):
            continue
        if o in HEADS:
            # The crew collar is weighted to the head. Only at the base of the
            # neck, though: hair tips hanging to the chin are dark too.
            if c.z < min(cut, neck + .025) and near_neck and float(lum(rgb)) < .2 and abs(float(rgb[0] - rgb[2])) < .035:
                kind[p.index] = 'tee'
            continue
        if 'Hand' in o or 'ForeArm' in o:
            continue
        if 'Foot' in o or 'Toe' in o:
            kind[p.index] = 'shoes'
        elif 'Leg' in o or o == 'Hips':
            kind[p.index] = 'tee' if c.z > edge_at(centre, edge, np.array([c[:]]))[0] - .002 else 'trousers'
        else:
            kind[p.index] = 'tee'
    return kind


def retarget(obj, carm, barm, follow=lambda n: True, fallback='Hips'):
    """Carry a garment from the clothed generation's skeleton onto the base's,
    bone by bone, as the approved September 27 build did: each vertex follows
    its bones, weighted, and each bone's share is stretched along it by how
    much longer the base's bone is. That build copied whole bone matrices,
    roll included, and the September 28 bodies roll their bones arbitrarily,
    so here each bone turns by the least rotation from its clothed direction
    to its base one. (Fitting the whole garment by four heights and the arm
    span instead, as September 28 did, shrank the loose tee and the wide
    trousers and opened a gap at the waist.)

    Only the bones the garment may follow count (FOLLOW): the clothed model
    weights the tee's hem partly to the thighs, and carried by them it split
    into teeth. A vertex left with none follows `fallback`."""
    def axis(bone):
        # Toward the joint it leads to, not its tail: generated rigs point a
        # root's tail anywhere (the new male's Hips is 91 degrees off the
        # clothed model's), and turning by that twisted the tee's lower half.
        kids = [c for c in bone.children if c.name[:4] in ('Left', 'Righ') and bone.name[:4] == c.name[:4]] \
            if bone.name[:4] in ('Left', 'Righ') else [c for c in bone.children if c.name[:4] not in ('Left', 'Righ')]
        if len(kids) == 1:
            return kids[0].head_local - bone.head_local
        return bone.tail_local - bone.head_local
    T = {}
    for b in carm.data.bones:
        bb = barm.data.bones.get(b.name)
        if bb is None:
            continue
        ca, ba = axis(b), axis(bb)
        if ca.length < 1e-6 or ba.length < 1e-6:
            continue
        R = ca.normalized().rotation_difference(ba.normalized()).to_matrix()
        T[b.name] = (b.head_local.copy(), ca.normalized(), ba.length / ca.length, bb.head_local.copy(), R)
    names = {vg.index: vg.name for vg in obj.vertex_groups}

    def carried(co, n):
        h, d, s, bh, R = T[n]
        off = co - h
        return bh + R @ (off + d * off.dot(d) * (s - 1))
    for v in obj.data.vertices:
        acc, total = Vector(), 0.0
        for g in v.groups:
            n = names[g.group]
            if n in T and g.weight > 0 and follow(n):
                acc += carried(v.co, n) * g.weight
                total += g.weight
        v.co = acc / total if total > 0 else carried(v.co, fallback)
    obj.data.update()


def level_shoes(obj, carm, barm):
    """Carry each shoe straight across to the base's ankle, without turning
    it. Turned bone by bone, the two models' foot bones point differently
    (a bare foot's ankle is lower than a shod one's), which tipped the male's
    shoes toes-up by some twenty degrees. Both stood flat on the ground."""
    names = {vg.index: vg.name for vg in obj.vertex_groups}
    shift = {side: barm.data.bones[side + 'Foot'].head_local - carm.data.bones[side + 'Foot'].head_local
             for side in ('Left', 'Right')}
    for v in obj.data.vertices:
        left = sum(g.weight for g in v.groups if names[g.group].startswith('Left'))
        right = sum(g.weight for g in v.groups if names[g.group].startswith('Right'))
        side = 'Left' if (left > right if left != right else v.co.x > 0) else 'Right'
        v.co = v.co + shift[side]
    obj.data.update()


def level_hem(tee):
    """Bring the tee's hem down to one level all round.

    The tee and the trousers were lifted off the clothed model along one
    colour boundary, so the hem and the waistband are the same jagged line,
    their teeth interlocked: with the tee over the trousers, the waistband's
    teeth showed as the trousers' dye running up into the shirt. The hem's
    notches are pulled down to where its teeth end, so it runs level and
    covers them; the tee is then laid over the trousers (over_trousers)."""
    bm = bmesh.new()
    bm.from_mesh(tee.data)
    boundary = {v for e in bm.edges if e.is_boundary for v in e.verts}
    lowest = min(v.co.z for v in boundary)
    # The hem only: not the sleeves' or the neck's openings.
    hem = [v for v in boundary if v.co.z < lowest + .15 and abs(v.co.x) < .3]
    level = float(np.percentile([v.co.z for v in hem], 5))
    # How tall the teeth were: notches above lowest + .15 are not levelled.
    span = max(v.co.z for v in boundary if abs(v.co.x) < .3 and v.co.z < lowest + .4) - lowest
    moved = 0
    for v in hem:
        if v.co.z > level:
            v.co.z = level
            moved += 1
    bm.to_mesh(tee.data)
    bm.free()
    tee.data.update()
    return {'level': round(level, 3), 'moved': moved, 'span': round(span, 3)}


def boundary_loops(bm):
    """The garment's openings, each a set of boundary vertices."""
    edges = [e for e in bm.edges if e.is_boundary]
    seen, loops = set(), []
    link = defaultdict(list)
    for e in edges:
        a, b = e.verts
        link[a].append(b)
        link[b].append(a)
    for v in link:
        if v in seen:
            continue
        loop, stack = [], [v]
        seen.add(v)
        while stack:
            x = stack.pop()
            loop.append(x)
            for n in link[x]:
                if n not in seen:
                    seen.add(n)
                    stack.append(n)
        loops.append(loop)
    return loops


def plain_hem(tee, arm):
    """Paint the bottom of the shirt in the shirt's own black.

    The generator painted the clothed model's belt, grey and camouflage, into
    the lowest few centimetres of the tee, the rolled hem included; carried
    over it read as a jagged grey band at the waist. Below the waist, every
    face that is not the plain black of the shirt takes its texture from one
    plain patch of the shirt's front instead."""
    texels = face_texels(tee)
    lum = lambda t: float((t @ np.array([.2126, .7152, .0722])).mean())
    spread = lambda t: float((t @ np.array([.2126, .7152, .0722])).std())
    waist = arm.data.bones['Hips'].head_local.z + .01
    front = [(i, t) for i, (p, t) in enumerate(zip(tee.data.polygons, texels))
             if abs(p.center.x) < .06 and p.normal.y < -.5 and waist + .03 < p.center.z < waist + .12]
    if not front:
        return 0
    ref_index, ref = min(front, key=lambda it: spread(it[1]))
    black = lum(ref)
    uv = tee.data.uv_layers.active.data
    ref_poly = tee.data.polygons[ref_index]
    spot = sum((uv[li].uv for li in ref_poly.loop_indices), Vector((0, 0))) / len(ref_poly.loop_indices)
    painted = 0
    for p, t in zip(tee.data.polygons, texels):
        if p.center.z > waist or abs(p.center.x) > .3:
            continue
        if lum(t) > black + .025 or spread(t) > .02:
            for li in p.loop_indices:
                uv[li].uv = spot
            painted += 1
    tee.data.update()
    return painted


def tidy_tee(tee, arm, paint=True, recalc=True):
    """Paint the hem plain (plain_hem), and cut the sleeves' teeth back to a
    line square to the arm."""
    painted = plain_hem(tee, arm) if paint else 0
    bm = bmesh.new()
    bm.from_mesh(tee.data)
    loops = [l for l in boundary_loops(bm) if len(l) >= 6]
    neck = arm.data.bones['neck'].head_local
    centre = lambda loop: sum((v.co for v in loop), Vector()) / len(loop)
    hem = min(loops, key=lambda l: centre(l).z)
    collar = min(loops, key=lambda l: (centre(l) - neck).length)
    out = {'openings': len(loops), 'hem': round(float(np.median([v.co.z for v in hem])), 3), 'painted': painted}
    # The sleeves: teeth reaching further down the arm are pulled back.
    trimmed = 0
    for loop in loops:
        if loop is hem or loop is collar:
            continue
        side = 'Left' if centre(loop).x > 0 else 'Right'
        shoulder = arm.data.bones[side + 'Arm'].head_local
        axis = (arm.data.bones[side + 'ForeArm'].head_local - shoulder).normalized()
        # Only an opening that goes round the arm is a sleeve; a stray hole
        # in the cloth is left alone.
        offset = centre(loop) - shoulder
        if (offset - axis * offset.dot(axis)).length > .06 or offset.dot(axis) < .03:
            continue
        reach = [(v.co - shoulder).dot(axis) for v in loop]
        stop = float(np.percentile(reach, 20))
        for v, a in zip(loop, reach):
            if a > stop:
                v.co -= axis * (a - stop)
                trimmed += 1
    out['sleeveTeeth'] = trimmed
    # The neck is finished by crew_neck, which makes its own rib.
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(tee.data)
    bm.free()
    tee.data.update()
    return out


def cut_sleeves(tee, arm):
    """Cut her sleeves straight across, square to the arm, where most of
    each hem ends. Lifted off the dressed model along triangle edges, the
    hems hung onto the arm in rags; pulled back along the arm (as his are in
    tidy_tee) the rags only moved."""
    bm = bmesh.new()
    bm.from_mesh(tee.data)
    out = {}
    for side in ('Left', 'Right'):
        shoulder = arm.data.bones[side + 'Arm'].head_local
        axis = (arm.data.bones[side + 'ForeArm'].head_local - shoulder).normalized()
        along = lambda co: (co - shoulder).dot(axis)
        off = lambda co: ((co - shoulder) - axis * along(co)).length
        loops = [l for l in boundary_loops(bm) if len(l) >= 6]
        sleeve = [l for l in loops if .03 < along(sum((v.co for v in l), Vector()) / len(l))
                  and off(sum((v.co for v in l), Vector()) / len(l)) < .07]
        if not sleeve:
            continue
        loop = max(sleeve, key=len)
        stop = float(np.percentile([along(v.co) for v in loop], 30))
        # The sleeve's own tube only: wider, and the cut went into the
        # tee's sides under the arms and opened holes there.
        radius = float(np.percentile([off(v.co) for v in loop], 90)) + .01
        faces = [f for f in bm.faces if off(f.calc_center_median()) < radius and along(f.calc_center_median()) > stop - .03]
        geom = list({v for f in faces for v in f.verts}) + list({e for f in faces for e in f.edges}) + faces
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=shoulder + axis * stop, plane_no=axis, clear_outer=True)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        out[side] = round(stop, 3)
    bm.to_mesh(tee.data)
    bm.free()
    tee.data.update()
    return out


def settle_shoulders(tee, body, arm, gap=.013):
    """Lay the dressed model's tee down onto her own shoulders. It was made
    on a body with higher, squarer shoulders, and carried onto hers it stood
    off them like a shrug. Above the armpits, cloth further than `gap` off
    the skin is brought down to it, fading in over the top of the arm."""
    tree = ray_tree(body)
    arm_z = min(arm.data.bones[s + 'Arm'].head_local.z for s in ('Left', 'Right'))
    span = max(abs(arm.data.bones[s + 'Arm'].head_local.x) for s in ('Left', 'Right')) + .09
    neck = arm.data.bones['neck'].head_local
    moved = 0
    for v in tee.data.vertices:
        co = v.co
        if co.z < arm_z - .06 or abs(co.x - neck.x) > span:
            continue
        loc, normal, _, dist = tree.find_nearest(co)
        if loc is None:
            continue
        out = (co - loc).dot(normal)
        if out <= gap:
            continue
        w = smoothstep(arm_z - .06, arm_z + .01, co.z)
        v.co = co.lerp(loc + normal * gap, w)
        moved += 1
    tee.data.update()
    return moved


def crew_neck(tee, arm, body):
    """A crew neck as the reference sheets draw it: a round opening hugging
    the base of the neck, a little lower at the front, finished with a rib.

    The tees came with a collar made for another head: the male's clothed
    model wore it high, and cut flat across (the old lower_collar) it became
    a boat neck with ragged corners on the shoulders; the dressed female's
    stood round the swapped-in neck in rags. Here the neck is measured on the
    body, everything of the tee above a round neckline about it goes, the
    opening's edge is laid on that line, and a one-centimetre rib is turned
    up from it."""
    neck = arm.data.bones['neck'].head_local
    V = body.data.vertices
    column = [v.co for v in V if neck.z < v.co.z < neck.z + .035 and math.hypot(v.co.x - neck.x, v.co.y - neck.y) < .075]
    cx = float(np.mean([c.x for c in column])) if column else neck.x
    cy = float(np.mean([c.y for c in column])) if column else neck.y
    rx = float(np.percentile([abs(c.x - cx) for c in column], 90)) if column else .045
    ry = float(np.percentile([abs(c.y - cy) for c in column], 90)) if column else .04
    RX, RY = rx + .012, ry + .012             # the opening stands just off the skin
    base, dip = neck.z + .006, .018          # lower at the front by this much

    def line(x, y):
        t = math.atan2(x - cx, -(y - cy))     # 0 at the front (-y)
        front = max(0.0, math.cos(t)) ** 2
        return t, base - dip * front
    bm = bmesh.new()
    bm.from_mesh(tee.data)
    near = lambda co: ((co.x - cx) / .16) ** 2 + ((co.y - cy) / .14) ** 2 < 1 and co.z > neck.z - .08
    doomed = []
    for f in bm.faces:
        c = f.calc_center_median()
        if near(c):
            z = line(c.x, c.y)[1]
            inside = ((c.x - cx) / RX) ** 2 + ((c.y - cy) / RY) ** 2 < 1.6
            if c.z > z + .004 or (inside and c.z > z - .01):
                doomed.append(f)
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    # Shreds of the old collar left hanging by one edge stood up over the
    # shoulders as slivers: faces round the neck with two open edges go,
    # a few passes over.
    shoulders = lambda co: ((co.x - cx) / .26) ** 2 + ((co.y - cy) / .16) ** 2 < 1 and co.z > neck.z - .06
    for _ in range(6):
        loose = [f for f in bm.faces if shoulders(f.calc_center_median()) and sum(e.is_boundary for e in f.edges) >= 2]
        if not loose:
            break
        bmesh.ops.delete(bm, geom=loose, context='FACES')
        doomed += loose
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    # The opening is the whole boundary loop round the neck: snapping only
    # its points near the neck left the rest as a sawtooth at the back.
    loops = [l for l in boundary_loops(bm) if len(l) >= 6]
    collar = min(loops, key=lambda l: (sum((v.co for v in l), Vector()) / len(l) - Vector((cx, cy, base))).length)
    # And every open edge round the neck, the bottoms of the notches the cut
    # left at the back included: laid on the line, they close.
    around = {v for e in bm.edges if e.is_boundary for v in e.verts
              if ((v.co.x - cx) / (RX + .1)) ** 2 + ((v.co.y - cy) / (RY + .14)) ** 2 < 1
              and v.co.z > line(v.co.x, v.co.y)[1] - .06}
    ring = set(collar) | around
    for v in ring:
        t = math.atan2(v.co.x - cx, -(v.co.y - cy))
        v.co.x, v.co.y = cx + RX * math.sin(t), cy - RY * math.cos(t)
        v.co.z = line(v.co.x, v.co.y)[1]
    edges = [e for e in bm.edges if e.is_boundary and all(v in ring for v in e.verts)]
    made = bmesh.ops.extrude_edge_only(bm, edges=edges)['geom']
    for v in [g for g in made if isinstance(g, bmesh.types.BMVert)]:
        t = math.atan2(v.co.x - cx, -(v.co.y - cy))
        v.co.x, v.co.y = cx + (RX - .004) * math.sin(t), cy - (RY - .004) * math.cos(t)
        v.co.z += .012
    # Only the rib is oriented, outward from the neck. Recalculating the
    # whole generated tee turned it inside out, and the prints went on its back.
    for f in [g for g in made if isinstance(g, bmesh.types.BMFace)]:
        f.normal_update()
        c = f.calc_center_median()
        if f.normal.dot(Vector((c.x - cx, c.y - cy, 0))) < 0:
            f.normal_flip()
    bm.to_mesh(tee.data)
    bm.free()
    tee.data.update()
    return {'cut': round(base - dip, 3), 'ring': len(ring), 'rib': len(edges), 'removed': len(doomed), 'neck': [round(rx, 3), round(ry, 3)]}


def lower_collar(tee, arm):
    """Cut the crew neck down to the base of the neck. The clothed models wear
    it like a turtleneck: carried onto the base bodies it rose 6 cm up his neck
    and 4 cm up hers, to the chin, and her neck vanished whenever she was
    dressed. Only near the neck: the shoulders stay as they are."""
    neck = arm.data.bones['neck'].head_local
    cut = neck.z + .006
    bm = bmesh.new()
    bm.from_mesh(tee.data)
    # Out to 14 cm: at 10 the clothed collar's folds were left standing as
    # points on the shoulders either side of the neck.
    near = lambda p: math.hypot(p.x - neck.x, p.y - neck.y) < .14
    region = [f for f in bm.faces if near(f.calc_center_median()) and f.calc_center_median().z > cut - .03]
    geom = list({v for f in region for v in f.verts}) + list({e for f in region for e in f.edges}) + region
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, cut), plane_no=(0, 0, 1), clear_outer=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(tee.data)
    bm.free()
    tee.data.update()
    return round(cut, 3)


def trousers_under(trousers, hem):
    """Take the trousers off above 3 cm over the tee's level hem. Up there the
    tee covers them all round, and their teeth poked out through the tee's
    broad faces; below it they still run up under the hem."""
    cut = hem + .03
    bm = bmesh.new()
    bm.from_mesh(trousers.data)
    region = [f for f in bm.faces if f.calc_center_median().z > cut - .1]
    geom = list({v for f in region for v in f.verts}) + list({e for f in region for e in f.edges}) + region
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, cut), plane_no=(0, 0, 1), clear_outer=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(trousers.data)
    bm.free()
    trousers.data.update()
    return round(cut, 3)


def over_trousers(tee, trousers, arm, offset=.005):
    """Where the tee and the trousers overlap, the tee lies outside. Each was
    fitted to the skin alone, so round the waist whichever sat further out
    showed, and the trousers' dye came up over the shirt.

    Measured along the ray from outside the body in to its middle, not by the
    trousers' own normals, which do not all face out: a shrinkwrap going by
    them left half the waist with the trousers on top."""
    from mathutils.bvhtree import BVHTree
    mesh = trousers.data
    tree = BVHTree.FromPolygons([v.co.copy() for v in mesh.vertices], [tuple(p.vertices) for p in mesh.polygons])
    top = max(v.co.z for v in mesh.vertices) + .01
    hips = arm.data.bones['Hips'].head_local
    moved = 0
    for v in tee.data.vertices:
        if v.co.z > top:
            continue
        axis = Vector((hips.x, hips.y, v.co.z))
        out = v.co - axis
        if out.length < 1e-4:
            continue
        out.normalize()
        hit = tree.ray_cast(axis + out * 1.0, -out, 1.0)[0]
        if hit is None:
            continue
        reach = (hit - axis).length + offset
        if (v.co - axis).length < reach:
            v.co = axis + out * reach
            moved += 1
    tee.data.update()
    return moved


def fit_outside(obj, body, offset=.006):
    """Push whatever of a garment lies inside the body out to just above its
    skin; what is already outside stays."""
    for mod in list(obj.modifiers):
        obj.modifiers.remove(mod)
    m = obj.modifiers.new('fit', 'SHRINKWRAP')
    m.target = body
    m.wrap_method = 'NEAREST_SURFACEPOINT'
    m.wrap_mode = 'OUTSIDE'
    m.offset = offset
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier='fit')


def body_weights(obj, body, follow, limit=None):
    """A garment moves exactly as the skin under it: every vertex takes the
    weights of the nearest point of the body, blended across that face, from
    the bones the garment may follow.

    limit(co, bone) scales a bone's weight at a garment vertex; limit.bones
    names the bones it may scale. A vertex it leaves with no weight at all
    takes the weights of the nearest body vertex free of those bones."""
    tree = ray_tree(body)
    names = {vg.index: vg.name for vg in body.vertex_groups}
    per = [{names[g.group]: g.weight for g in v.groups if follow(names[g.group])} for v in body.data.vertices]
    if limit:
        from mathutils.kdtree import KDTree
        whole = [i for i, v in enumerate(body.data.vertices)
                 if per[i] and not any(limit.bones(n) for n in per[i])]
        plain_tree = KDTree(len(whole))
        for k, i in enumerate(whole):
            plain_tree.insert(body.data.vertices[i].co, k)
        plain_tree.balance()
        plain = [per[i] for i in whole]
    for vg in list(obj.vertex_groups):
        obj.vertex_groups.remove(vg)
    groups = {}
    fallback = 'Hips'
    for v in obj.data.vertices:
        loc, _, fi, _ = tree.find_nearest(v.co)
        ids = list(body.data.polygons[fi].vertices)
        near = [1 / max((body.data.vertices[i].co - loc).length, 1e-5) for i in ids]
        mix = defaultdict(float)
        for i, k in zip(ids, near):
            for n, w in per[i].items():
                mix[n] += w * k
        if limit:
            for n in list(mix):
                mix[n] *= limit(v.co, n)
            if sum(mix.values()) < 1e-3:
                mix = defaultdict(float, plain[plain_tree.find(v.co)[1]])
        if not mix:
            mix[fallback] = 1.0
        top = sorted(mix.items(), key=lambda kv: -kv[1])[:4]
        total = sum(w for _, w in top)
        for n, w in top:
            if n not in groups:
                groups[n] = obj.vertex_groups.new(name=n)
            groups[n].add([v.index], w / total, 'REPLACE')


SLEEVE_REACH = (.095, .115)


def sleeves_only(arm):
    """A limit for body_weights: only the sleeves follow the arms. The skin
    of the flank under the arm carries some of the arm's weight, and the
    tee's side panels lying over it took it too: raised overhead (the fall,
    the peak of the dance) the arm dragged his shirt's sides out into wings
    down to the hem. Past the shoulder cap an arm bone keeps its weight
    within SLEEVE_REACH[0] of the upper arm's axis — every sleeve vertex
    lies within 9 cm of it — and loses it by SLEEVE_REACH[1], where the
    side panels begin."""
    axes = {}
    for side in ('Left', 'Right'):
        bone = arm.data.bones[side + 'Arm']
        head = arm.matrix_world @ bone.head_local
        axes[side] = (head, ((arm.matrix_world @ bone.tail_local) - head).normalized())
    near, far = SLEEVE_REACH

    def bones(name):
        return name.startswith(('Left', 'Right')) and any(k in name for k in ('Arm', 'Hand')) and 'Shoulder' not in name

    def limit(co, name):
        if not bones(name):
            return 1.0
        head, axis = axes['Left' if name.startswith('Left') else 'Right']
        q = co - head
        along = q.dot(axis)
        if along < .08:
            return 1.0
        off = (q - axis * along).length
        return min(1.0, max(0.0, (far - off) / (far - near)))
    limit.bones = bones
    return limit


def clean_shoes(arm, key):
    """Chunky high-top sneakers after the reference sheet (art/generated/
    shoe-reference.png): a thick stepped ivory sole with heel and forefoot lugs
    and a notch under the arch, an ivory toe bumper, a black upper with an
    overlay toe cap, eyestays either side of the laces, a strap round the ankle
    and a heel counter, four flat ivory laces and a padded black collar. His
    overlays are the reference's red; hers are the grey of her sheet.

    Built as solid blocky panels, the PS2 way: every face takes one flat colour
    by where it sits, so the panels meet on crisp lines instead of the thin
    overlay quads the September 28 shoe floated over a smooth shell."""
    BLACK, OVER, IVORY, SOLE = 0, 1, 2, 3
    verts, faces, materials, groups = [], [], [], {}
    male = key == 'male'

    def face(ids, material):
        faces.append(list(ids))
        materials.append(material)

    def loft(rows, closed, paint, cap_first=False, cap_last=False):
        """Rows of equal length; paint(centre) chooses each face's colour."""
        first = len(verts)
        n = len(rows[0])
        verts.extend(p for row in rows for p in row)
        at = lambda j, i: first + j * n + i % n
        for j in range(len(rows) - 1):
            for i in range(n if closed else n - 1):
                ids = [at(j, i), at(j, i + 1), at(j + 1, i + 1), at(j + 1, i)]
                centre = sum((Vector(verts[k]) for k in ids), Vector()) / 4
                face(ids, paint(centre))
        for j, wanted in ((0, cap_first), (len(rows) - 1, cap_last)):
            if wanted:
                ids = [at(j, i) for i in range(n)]
                centre = sum((Vector(verts[k]) for k in ids), Vector()) / n
                face(ids if j else list(reversed(ids)), paint(centre))

    def prism(x0, x1, y0, y1, z0, z1, chamfer, material):
        ring = lambda z: [(x0 + chamfer, y0, z), (x1 - chamfer, y0, z), (x1, y0 + chamfer, z), (x1, y1 - chamfer, z),
                          (x1 - chamfer, y1, z), (x0 + chamfer, y1, z), (x0, y1 - chamfer, z), (x0, y0 + chamfer, z)]
        loft([ring(z0), ring(z1)], True, lambda c: material, True, True)

    for side in ('Left', 'Right'):
        ankle = arm.data.bones[side + 'Foot'].head_local
        ax, ay, floor = ankle.x, ankle.y, FLOOR + .004
        first = len(verts)
        lug, sole = .012, (.046 if male else .040)
        top = .165 if male else .13
        # Sole: two lugs with the arch notch between them, then the midsole
        # slab, its top edge standing a touch proud of the upper.
        prism(ax - .080, ax + .080, ay - .006, ay + .088, floor, floor + lug, .02, SOLE)
        prism(ax - .086, ax + .086, ay - .194, ay - .075, floor, floor + lug, .03, SOLE)
        outline = [(-.048, -.192), (.048, -.192), (.069, -.18), (.083, -.15), (.085, -.10), (.08, -.035),
                   (.075, .035), (.062, .073), (.039, .087), (-.039, .087), (-.062, .073), (-.075, .035),
                   (-.08, -.035), (-.085, -.10), (-.083, -.15), (-.069, -.18)]
        slab = [[(ax + x * k, ay + y * k, floor + z) for x, y in outline] for z, k in ((lug, .98), (sole - .007, 1.02), (sole, 1.0))]
        loft(slab, True, lambda c: IVORY, True, True)
        zb = floor + sole
        # The foot box: arch-shaped sections from inside the ankle to the toe,
        # the toe capped. (y, half width, top height above the floor)
        rise = 1.0 if male else .82
        sections = [(0.0, .074, .135), (-.03, .077, .118), (-.06, .079, .104), (-.09, .080, .094),
                    (-.12, .080, .086), (-.15, .078, .080), (-.17, .072, .074), (-.185, .060, .066), (-.195, .042, .056)]
        rows = []
        for y, w, h in sections:
            h = sole + (h - sole) * rise
            row = []
            for k in range(15):
                theta = math.pi * (1 - k / 14)
                c, s = math.cos(theta), math.sin(theta)
                row.append((ax + w * math.copysign(abs(c) ** .55, c), ay + y, zb + (floor + h - zb) * abs(s) ** .55))
            rows.append(row)

        def foot_paint(c):
            y, x, z = c.y - ay, abs(c.x - ax), c.z - zb
            if y < -.178 and z < .016:
                return IVORY                      # the toe bumper
            if z < .014:
                return BLACK                      # the mudguard all round
            if y < -.105:
                return OVER                       # the toe cap
            if .022 < x < .06 and z > .026:
                return OVER                       # the eyestays
            return BLACK                          # tongue and sides
        loft(rows, False, foot_paint, False, True)
        # The ankle: rings round it from the sole to the collar.
        cy, rx, ry = ay + .028, .073, .066
        heights = [0, .016, .034, .052, .070, .088, .104, top - sole - .012, top - sole]

        def ring(z, scale, dip=0.0):
            # `dip` lowers the front of a ring: the collar falls to the tongue.
            out = []
            for i in range(16):
                a = math.tau * i / 16
                c, s = math.cos(a), math.sin(a)
                out.append((ax + rx * scale * math.copysign(abs(c) ** .7, c), cy + ry * scale * math.copysign(abs(s) ** .7, s),
                            zb + z - dip * max(0.0, -s) ** 1.5))
            return out
        strap = (.058, .090) if male else (.046, .072)

        def ankle_paint(c):
            z, back = c.z - zb, c.y - cy
            if strap[0] < z < strap[1]:
                return OVER                       # the strap round the ankle
            if back > .03 and z < .034:
                return OVER                       # the heel counter, a black band above it
            return BLACK
        dip = .024 if male else .016
        loft([ring(z, 1 - .05 * z / (top - sole), dip * z / (top - sole)) for z in heights], True, ankle_paint)
        # Padded collar: over the rim and down inside it.
        loft([ring(top - sole, .95, dip), ring(top - sole + .007, .9, dip), ring(top - sole - .018, .82, dip)], True, lambda c: BLACK)
        # Four flat laces across the instep.
        for t in range(4):
            y = -.108 + t * .023
            h = sole + (float(np.interp(-y, [-s[0] for s in sections], [s[2] for s in sections])) - sole) * rise
            z0 = floor + h - .002
            prism(ax - .031, ax + .031, ay + y - .006, ay + y + .006, z0, z0 + .007, .003, IVORY)
        groups[side + 'Foot'] = list(range(first, len(verts)))
    mesh = bpy.data.meshes.new(key + '-sneakers')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(key + '-shoes', mesh)
    bpy.context.collection.objects.link(obj)
    mesh.uv_layers.new(name='UVMap')
    for li in mesh.uv_layers.active.data:
        li.uv = (.5, .5)
    # The reference's muted brick red on charcoal, not a saturated red on black.
    colours = [('black', (.16, .15, .15, 1)),
               ('overlay', (.66, .27, .25, 1) if male else (.46, .46, .47, 1)),
               ('ivory', (.84, .81, .75, 1)),
               ('sole-detail', (.70, .68, .63, 1))]
    for name, colour in colours:
        img = bpy.data.images.new(key + '-shoe-' + name, 2, 2)
        img.pixels[:] = list(colour) * 4
        mesh.materials.append(plain_material(key + '-shoe-' + name, img))
    for poly, material in zip(mesh.polygons, materials):
        poly.material_index = material
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for bone, ids in groups.items():
        obj.vertex_groups.new(name=bone).add(ids, 1, 'REPLACE')
    obj.parent = arm
    obj.modifiers.new('Armature', 'ARMATURE').object = arm
    return obj


def round_face(arm,body):
    """Add cheek/chin depth to the source surface while carrying its existing UVs.
    This moves the actual face, including the eye polygons, without an overlay.
    """
    own=owners(body);col=face_colours(body)
    skin=[p for p,o,c in zip(body.data.polygons,own,col) if o in HEADS and c=='skin' and p.normal.y<-.35]
    if not skin:return 0
    z0=min(p.center.z for p in skin);z1=max(p.center.z for p in skin)
    cx=arm.data.bones['Head'].head_local.x
    front=float(np.percentile([p.center.y for p in skin],75))
    width=max(abs(p.center.x-cx) for p in skin)
    width=max(.12,width)
    ids={i for p,o in zip(body.data.polygons,own) if o in HEADS for i in p.vertices}
    count=0
    for i in ids:
        v=body.data.vertices[i];x,y,z=v.co
        if not (z0-.014<z<z1+.035 and y<front+.04):continue
        u=(x-cx)/(width*1.06);t=(z-(z0-.014))/(z1-z0+.049)
        bulge=.052*max(0,1-u*u)**1.2*math.sin(math.pi*t)**.8
        blend=1-smoothstep(front,front+.04,y)
        v.co.y-=bulge*blend
        count+=1
    body.data.update()
    return count


def jogger_cuffs(arm, trousers):
    """His cargos gather at the ankle, as on his reference sheet ("cargo pants,
    jogger style"): below the knee each leg draws in toward the shin, most in
    the last third, and never tighter than the sneaker's collar, so the cuff
    sits on the shoe rather than in it. Hers stay wide and straight."""
    names = {g.index: g.name for g in trousers.vertex_groups}
    drawn = 0
    for v in trousers.data.vertices:
        left = sum(g.weight for g in v.groups if names[g.group].startswith('Left'))
        right = sum(g.weight for g in v.groups if names[g.group].startswith('Right'))
        side = 'Left' if (left > right if left != right else v.co.x > 0) else 'Right'
        knee, ankle = arm.data.bones[side + 'Leg'].head_local, arm.data.bones[side + 'Foot'].head_local
        t = (knee.z - v.co.z) / (knee.z - ankle.z)
        if t <= .3:
            continue
        axis = knee.lerp(ankle, min(1.0, t))
        radial = Vector((v.co.x - axis.x, v.co.y - axis.y, 0))
        if radial.length < 1e-6:
            continue
        want = radial.length * (1 - .26 * smoothstep(.3, .9, t))
        v.co.x, v.co.y = (Vector((axis.x, axis.y, 0)) + radial.normalized() * max(want, min(radial.length, .084)))[:2]
        drawn += 1
    trousers.data.update()
    return drawn


def trouser_clearance(arm,obj):
    """Keep a visible inner-leg gap below the crotch, preserving the pockets."""
    crotch=min(arm.data.bones[side+'UpLeg'].head_local.z for side in ('Left','Right'))-.075
    if 'female' in obj.name and not obj.get('referenceFlareV2'):
        for v in obj.data.vertices:
            side='Left' if v.co.x>0 else 'Right'
            ankle=arm.data.bones[side+'Foot'].head_local;hip=arm.data.bones[side+'UpLeg'].head_local
            u=max(0,min(1,(v.co.z-ankle.z)/(hip.z-ankle.z)))
            centre=ankle.lerp(hip,u)
            flare=1+.21*(1-smoothstep(.10,.72,u))
            v.co.x=centre.x+(v.co.x-centre.x)*flare
            v.co.y=centre.y+(v.co.y-centre.y)*(1+.06*(flare-1)/.21)
        obj['referenceFlareV2']=True
    names={g.index:g.name for g in obj.vertex_groups}
    for v in obj.data.vertices:
        blend=1-smoothstep(crotch-.06,crotch+.015,v.co.z)
        if not blend:continue
        left=sum(g.weight for g in v.groups if names[g.group].startswith('Left'))
        right=sum(g.weight for g in v.groups if names[g.group].startswith('Right'))
        sign=1 if left>right else -1
        v.co.x=sign*max(sign*v.co.x,.023*blend)
    obj.data.update()


# Each modelled tee's sleeves, by avatar: (shoulder joint, arm axis, length).
TEE_SLEEVES = {}
# Per avatar, the modelled tee's crew neck: centre, radii, base height, front dip.
TEE_NECK = {}
# Per avatar wearing a generated tee: the plane its neckline is cut along.
COLLAR_PLANE = {}
# Per avatar wearing a generated tee: per side, a plane across the upper arm
# just inside the sleeve's end.
SLEEVE_PLANES = {}
# The crew neck's rib, standing this far over the collar's edge: a flat crew
# rib, as the reference draws it. At 2.4 cm (October 1, to hide the neck's
# cut skin) it stood up the neck like a turtleneck (the owner, October 4).
RIB = .013
# How far the crew neck's opening stands clear of the neck.
COLLAR_EASE = .006


def waistband(trousers):
    """The bottom of the trousers' dark waistband, or None: the dark run down
    from their top, centimetre by centimetre, until the camouflage starts.
    The tee comes down past it: on his September 25 body the band is 6 cm
    deep and showed as a black belt under the hem (the owner, 2026-10-04:
    the reference's tee covers the waist)."""
    zs = np.array([p.center.z for p in trousers.data.polygons])
    if not len(zs):
        return None
    light = lum(np.array(face_samples(trousers)))
    top, z = zs.max(), zs.max()
    while z > top - .2:
        sel = (zs <= z) & (zs > z - .01)
        if sel.any() and float(np.median(light[sel])) > .29:
            return float(z) if z < top else None
        z -= .01
    return None


def model_tee(arm, body, source, key, waist=None):
    """A clean tee, modelled on the body (the owner, September 30 and
    October 1).

    The tees lifted off the dressed generations kept their collars and
    sleeve hems as tangled triangle strips, and every cut through them left
    teeth or holes; a copy of the body's own skin carried its seams, its gaps
    and her hair along. So the tee is built as a low-poly garment is: rings
    round the torso from the hem to the shoulders, a shelf over the shoulders
    in to a round crew neck with a rib, and a tube down each upper arm. Each
    point is laid just outside the outermost skin in its direction (a ray
    from outside in, so it spans the hollows as cloth does), eased looser
    toward the hem like the reference's boxy tee. Hems, sleeve ends and the
    neck are exact by construction, with a turned edge for thickness. The
    length and sleeves are the generated tee's; it is the generated tee's
    plain black, and the prints, the vest and the dyes go on it as before."""
    from mathutils.bvhtree import BVHTree
    B = arm.data.bones
    neck = B['neck'].head_local
    sv = [v.co.copy() for v in source.data.vertices]
    hem = float(np.percentile([c.z for c in sv], 3))
    if waist is not None:
        hem = min(hem, waist - .015)
    sleeve = {}
    for side in ('Left', 'Right'):
        sh = B[side + 'Arm'].head_local.copy()
        ax = (B[side + 'ForeArm'].head_local - sh).normalized()
        reach = [(c - sh).dot(ax) for c in sv if (c - sh).dot(ax) > .03 and ((c - sh) - ax * (c - sh).dot(ax)).length < .09]
        sleeve[side] = (sh, ax, float(np.percentile(reach, 85)) if reach else .16)
    TEE_SLEEVES[key] = sleeve
    texels = face_texels(source)
    dark = np.concatenate([t for t in texels])
    shade = np.median(dark[lum(dark) < .14], axis=0) if (lum(dark) < .14).sum() > 20 else np.array([.05, .05, .055])

    own = owners(body)
    cls = face_colours(body)
    polys = body.data.polygons
    verts = [v.co.copy() for v in body.data.vertices]
    TORSO = {'Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'LeftShoulder', 'RightShoulder'}
    top_z = min(sleeve[s][0].z for s in sleeve)

    def tree(pick):
        # Everything below the head: the generated shoulders rise above the
        # neck bone, and cut off at its height they poked up through the tee.
        faces = [tuple(p.vertices) for p, o, c in zip(polys, own, cls) if c != 'hair' and o not in HEADS and pick(o, p.center)]
        return BVHTree.FromPolygons(verts, faces)
    # The torso, with the caps of the shoulders it runs over.
    torso = tree(lambda o, c: o in TORSO or (o in ('LeftArm', 'RightArm') and c.z > top_z - .04
                                             and (c - sleeve['Left' if o == 'LeftArm' else 'Right'][0]).length < .08))
    arms = {s: tree(lambda o, c, s=s: o == s + 'Arm') for s in sleeve}
    above = tree(lambda o, c: True)

    def outermost(t, origin, direction, reach=.5):
        """The first skin met coming in from `reach` out along `direction`."""
        hit = t.ray_cast(origin + direction * reach, -direction, reach)[0]
        return None if hit is None else (hit - origin).length

    def fill(ring):
        """Close the gaps a ring's rays found no skin in, round the ring."""
        n = len(ring)
        known = [i for i, r in enumerate(ring) if r is not None]
        if not known:
            return [.08] * n
        out = []
        for i in range(n):
            if ring[i] is not None:
                out.append(ring[i])
                continue
            a = max((k for k in known if k < i), default=known[-1] - n)
            b = min((k for k in known if k > i), default=known[0] + n)
            f = (i - a) / (b - a)
            out.append(ring[a % n] * (1 - f) + ring[b % n] * f)
        return out

    def smooth_ring(ring, rounds):
        for _ in range(rounds):
            ring = [(ring[i - 1] + 2 * ring[i] + ring[(i + 1) % len(ring)]) / 4 for i in range(len(ring))]
        return ring

    # --- the torso: rings from the hem to the shoulders.
    N = 40
    torso_pts = [v for v in verts if abs(v.x) < .2]
    shoulder_top = max((v.z for p, o, c in zip(polys, own, cls) if c != 'hair' and (o in ('LeftArm', 'RightArm', 'LeftShoulder', 'RightShoulder'))
                        for v in [polys[p.index].center] if abs(v.x) > .05 and v.z < neck.z + .04), default=neck.z)
    heights = [hem + (top_z - hem) * (k / 12) ** .9 for k in range(13)]
    rings = []
    for z in heights:
        band = [v for v in torso_pts if abs(v.z - z) < .015]
        cy = (min(v.y for v in band) + max(v.y for v in band)) / 2 if band else neck.y
        centre = Vector((0.0, cy, z))
        raw = [outermost(torso, centre, Vector((math.sin(2 * math.pi * i / N), -math.cos(2 * math.pi * i / N), 0))) for i in range(N)]
        raw = fill(raw)
        ease = .013 + .014 * smoothstep(top_z - .06, hem, z)
        r = smooth_ring(raw, 3)
        r = [max(a, b + .006) + ease for a, b in zip(r, raw)]
        rings.append((centre, r))
    # Rings a little smoothed from one to the next, so the side seams run true.
    for _ in range(2):
        rings = [rings[0]] + [(rings[k][0], [(rings[k - 1][1][i] + 2 * rings[k][1][i] + rings[k + 1][1][i]) / 4 if True else 0
                                            for i in range(N)]) for k in range(1, len(rings) - 1)] + [rings[-1]]
    # Never inside the skin after the smoothing.
    rings = [(c, [max(r[i], (outermost(torso, c, Vector((math.sin(2 * math.pi * i / N), -math.cos(2 * math.pi * i / N), 0))) or 0) + .009)
                  for i in range(N)]) for c, r in rings]

    def ring_point(c, r, i):
        t = 2 * math.pi * i / N
        return Vector((c.x + r[i] * math.sin(t), c.y - r[i] * math.cos(t), c.z))

    # --- the crew neck: round, a little lower in front, a rib turned up.
    # Seated where the neck stands up out of the shoulders, measured on the
    # skin: the generated neck bone sits down between the shoulders, and a
    # collar fitted there rode up the neck like a turtleneck and squared the
    # shoulders off (the owner, 2026-10-04: "the neck and shoulders are
    # wrong"). The reference's crew neck lies at the base of the neck with
    # the neck showing above it.
    neck_verts = {i for p, o, c in zip(polys, own, cls) if o == 'neck' and c != 'hair' for i in p.vertices}
    skin_faces = [p for p, o, c in zip(polys, own, cls) if c != 'hair']

    def section(z):
        pts = []
        for p in skin_faces:
            vs = list(p.vertices)
            for a, b in zip(vs, vs[1:] + vs[:1]):
                if (verts[a].z - z) * (verts[b].z - z) < 0:
                    pts.append(verts[a].lerp(verts[b], (z - verts[a].z) / (verts[b].z - verts[a].z)))
        side = [abs(q.x - neck.x) for q in pts if abs(q.y - neck.y) < .015 and abs(q.x - neck.x) < .25]
        fb = [q.y - neck.y for q in pts if abs(q.x - neck.x) < .012 and abs(q.y - neck.y) < .2]
        return (min(side) if side else None), (min(fb) if fb else None), (max(fb) if fb else None)
    profile = [(z, *section(z)) for z in np.arange(neck.z, B['Head'].head_local.z + .04, .004)]
    widths = [w for _, w, _, _ in profile if w]
    column = min(widths) if widths else .035
    # The base of the neck: the lowest height at which the side of the neck is
    # within 80% of its own width of the column (above it the shoulders have
    # fallen away).
    # The base of the neck: where the shoulders' slope comes in to within
    # 2.4 neck-widths of the neck's middle. Higher, at the column itself, the
    # collar met his chin.
    base = next((z for z, w, _, _ in profile if w and w < column * 2.4), neck.z + .004)
    at = min(profile, key=lambda r: abs(r[0] - (base + RIB)))
    front, back = at[2] if at[2] is not None else -.035, at[3] if at[3] is not None else .035
    cx, cy = neck.x, neck.y + (front + back) / 2
    RX = max(at[1] or column, column * 1.3) + COLLAR_EASE
    RY = min((back - front) / 2 + COLLAR_EASE, RX * 1.05)
    dip = .018
    TEE_NECK[key] = (cx, cy, RX, RY, base, dip)

    # The collar lies on the body all round, riding up over the tops of the
    # shoulders at the sides and dipping in front, as a crew neck sits. Held
    # level, the shoulders rose through the shelf beside it in two points.
    ring_z = []
    for i in range(N):
        t = 2 * math.pi * i / N
        x, y = cx + (RX + .006) * math.sin(t), cy - (RY + .006) * math.cos(t)
        hit = torso.ray_cast(Vector((x, y, base + .1)), Vector((0, 0, -1)), 1.0)[0]
        low = base - dip * max(0.0, math.cos(t)) ** 2
        ring_z.append(max(low, hit.z + .003) if hit and hit.z < base + .03 else low)
    for _ in range(3):
        ring_z = [(ring_z[i - 1] + 2 * ring_z[i] + ring_z[(i + 1) % N]) / 4 for i in range(N)]

    def neck_point(i, k=0.0):
        t = 2 * math.pi * i / N
        return Vector((cx + (RX + k) * math.sin(t), cy - (RY + k) * math.cos(t), ring_z[i]))

    # --- the shoulders: a shelf from the top ring in to the neck, laid on
    # the skin from above.
    top_c, top_r = rings[-1]
    shelf = []
    for f in (.25, .5, .72, .88):
        row = []
        for i in range(N):
            a, b = ring_point(top_c, top_r, i), neck_point(i, .012)
            p = a.lerp(b, f)
            # From just over the base of the neck: higher, her bob hangs out
            # over the shoulders and the shelf rose on it into a funnel.
            # (From over the collar's height: the neck bone lies below the
            # shoulders' top on the generated bodies.)
            hit = torso.ray_cast(Vector((p.x, p.y, max(neck.z, base) + .02)), Vector((0, 0, -1)), 1.0)[0]
            z = max(a.z + (b.z - a.z) * f, (hit.z + .014) if hit else -9)
            # Rounded over the shoulder: the first row swells out a little.
            row.append(Vector((p.x, p.y, z)))
        shelf.append(row)
    # Smoothed round the neck and from row to row: laid on the skin, the
    # shelf followed the flare's ridges, and with the opening fitted to the
    # neck its top came out zig-zagged.
    for _ in range(8):
        shelf = [[(row[i - 1] + row[i] * 2 + row[(i + 1) % N]) / 4 for i in range(N)] for row in shelf]
    for _ in range(3):
        for k in range(1, len(shelf) - 1):
            shelf[k] = [shelf[k][i].lerp((shelf[k - 1][i] + shelf[k + 1][i]) / 2, .5) for i in range(N)]

    bm = bmesh.new()
    grid = [[bm.verts.new(ring_point(c, r, i)) for i in range(N)] for c, r in rings]
    grid += [[bm.verts.new(p) for p in row] for row in shelf]
    grid.append([bm.verts.new(neck_point(i)) for i in range(N)])
    rib = [bm.verts.new(neck_point(i, -.002) + Vector((0, 0, RIB))) for i in range(N)]
    # The rib folds in to the neck. The hole is 1.6 cm wider than the neck so
    # the head can turn, and looking down that gap showed the hidden skin's
    # ragged edge and the tee's dark inside: a torn collar (the owner,
    # 2026-10-01). Turned in, the rib meets the skin and closes it.
    fold = [bm.verts.new(neck_point(i, -(COLLAR_EASE + .003)) + Vector((0, 0, RIB - .005))) for i in range(N)]
    # The hem turned up inside.
    lip = [bm.verts.new(ring_point(rings[0][0], [x - .007 for x in rings[0][1]], i) + Vector((0, 0, .004))) for i in range(N)]
    for k in range(len(grid) - 1):
        for i in range(N):
            j = (i + 1) % N
            bm.faces.new((grid[k][i], grid[k][j], grid[k + 1][j], grid[k + 1][i]))
    for i in range(N):
        j = (i + 1) % N
        bm.faces.new((grid[-1][i], grid[-1][j], rib[j], rib[i]))
        bm.faces.new((rib[i], rib[j], fold[j], fold[i]))
        bm.faces.new((lip[i], lip[j], grid[0][j], grid[0][i]))
    # Wound to face out as built: rows run up and round anticlockwise seen
    # from above, and on over the shelf in to the neck. (Turning faces by a
    # guessed outward direction flipped patches of the shelf.)

    # --- the sleeves: a tube down each upper arm from inside the shoulder.
    M = 20
    for side, (sh, ax, end) in sleeve.items():
        u = (Vector((0, 0, 1)) - ax * ax.z).normalized()
        w = ax.cross(u)
        # From under the shoulder's cap, where the torso's shelf covers its
        # start, to the generated tee's sleeve length.
        stations = [-.01, .025, .065] + [.065 + (end - .065) * k / 4 for k in range(1, 5)]
        tube = []
        for s in stations:
            c = sh + ax * s
            raw = fill([outermost(arms[side], c, (u * math.cos(2 * math.pi * i / M) + w * math.sin(2 * math.pi * i / M)), .2) for i in range(M)])
            r = smooth_ring(raw, 2)
            ease = .010 + .012 * smoothstep(0, end, s)
            tube.append([c + (u * math.cos(2 * math.pi * i / M) + w * math.sin(2 * math.pi * i / M)) * (max(r[i], raw[i] + .004) + ease)
                         for i in range(M)])
        # Near the joint the rays meet the shoulder and the flank too; the
        # arm is no wider there than a little way down it.
        arm_r = [sum((p - (sh + ax * stations[2])).length for p in tube[2]) / M]
        for k in (0, 1):
            c = sh + ax * stations[k]
            tube[k] = [c + (p - c) * min(1.0, arm_r[0] * 1.02 / max((p - c).length, 1e-4)) for p in tube[k]]
        # The sleeve's top lies on the shoulder: a round tube from the shoulder
        # joint stood up over the shoulder's line on each side, two points
        # that squared the shoulders off (the owner, 2026-10-04).
        # Eased in round the tube (all of it on top, none at the sides), so
        # the flattened top runs into the sleeve without a crease.
        for k, row in enumerate(tube):
            c = sh + ax * stations[k]
            for i, q in enumerate(row):
                up = (q - c).normalized().dot(u)
                if up <= 0:
                    continue
                hit = above.ray_cast(Vector((q.x, q.y, q.z + .3)), Vector((0, 0, -1)), .6)[0]
                if hit is None:
                    continue
                lid = hit.z + .014 + .006 * k / (len(tube) - 1)
                if q.z > lid:
                    row[i] = Vector((q.x, q.y, q.z - (q.z - lid) * smoothstep(0.0, .7, up)))
        for _ in range(2):
            tube = [tube[0]] + [[(tube[k - 1][i] + tube[k][i] * 2 + tube[k + 1][i]) / 4 for i in range(M)] for k in range(1, len(tube) - 1)] + [tube[-1]]
        rows = [[bm.verts.new(p) for p in row] for row in tube]
        cuff = [bm.verts.new(sh + ax * (end - .004) + (p - sh - ax * end) * .9) for p in tube[-1]]
        rows.append(cuff)
        for k in range(len(rows) - 1):
            for i in range(M):
                j = (i + 1) % M
                bm.faces.new((rows[k][i], rows[k][j], rows[k + 1][j], rows[k + 1][i]))
    for f in bm.faces:
        f.smooth = True
    bmesh.ops.triangulate(bm, faces=list(bm.faces))

    mesh = bpy.data.meshes.new(key + '-tee')
    bm.to_mesh(mesh)
    bm.free()
    uv = mesh.uv_layers.new(name=body.data.uv_layers.active.name)
    for l in uv.data:
        l.uv = (.5, .5)
    tee = bpy.data.objects.new(key + '-tee', mesh)
    bpy.context.collection.objects.link(tee)
    tee.matrix_world = body.matrix_world.copy()
    body_weights(tee, body, lambda n: n not in HEADS, sleeves_only(arm))
    img = new_image(key + '-tee-black', np.tile(np.array(shade, np.float32), (4, 4, 1)), os.path.join(WORK, key + '-tee-black.png'), 'PNG')
    tee.data.materials.append(plain_material(key + '-tee', img))
    report.setdefault(key, {})['modelTee'] = {'hem': round(hem, 3), 'waistband': waist and round(waist, 3), 'sleeves': {k: round(v[2], 3) for k, v in sleeve.items()},
                                           'neck': [round(RX, 3), round(RY, 3)], 'collarBase': round(base, 3), 'neckBone': round(neck.z, 3), 'column': round(column, 3), 'shoulderTop': round(shoulder_top, 3),
                                           'faces': len(tee.data.polygons), 'shade': [round(float(x), 3) for x in shade]}
    return tee, hem


def replace_tee(arm, body, garments, key):
    """Swap the lifted tee for the modelled one and seat the trousers under it."""
    source = garments['tee']
    tee, hem = model_tee(arm, body, source, key, waistband(garments['trousers']))
    name = source.name
    bpy.data.objects.remove(source, do_unlink=True)
    tee.name = name
    tee.parent = arm
    for m in list(tee.modifiers):
        tee.modifiers.remove(m)
    tee.modifiers.new('Armature', 'ARMATURE').object = arm
    garments['tee'] = tee
    report.setdefault(body.name, {})['collar'] = arm.data.bones['neck'].head_local.z - .01
    report[body.name]['trousersTop'] = trousers_under(garments['trousers'], hem)
    report[body.name]['overTrousers'] = over_trousers(tee, garments['trousers'], arm)
    report[body.name]['tidy'] = {'hem': round(hem, 3)}
    return garments


def stitch(obj, dist=.003):
    """Join a carried garment's pieces where they meet. The generated tee's
    sleeves and body are separate pieces lying edge to edge; with the arms
    lowered from the A-pose they pulled apart and the backdrop showed
    through across her back as white cracks (2026-10-01). Joined, the
    sleeve stretches with the arm instead. Each joined point takes the
    average of the pieces' weights, so it moves as both do."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    deform = bm.verts.layers.deform.active
    before = len(bm.verts)
    from mathutils.kdtree import KDTree
    tree = KDTree(len(bm.verts))
    for v in bm.verts:
        tree.insert(v.co, v.index)
    tree.balance()
    bm.verts.ensure_lookup_table()
    if deform:
        for v in bm.verts:
            group = [bm.verts[i] for _, i, _ in tree.find_range(v.co, dist)]
            if len(group) < 2:
                continue
            mix = {}
            for u in group:
                for k, w in u[deform].items():
                    mix[k] = mix.get(k, 0.0) + w / len(group)
            v[deform].clear()
            for k, w in mix.items():
                v[deform][k] = w
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    joined = before - len(bm.verts)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return joined


def sleeve_planes(tee, arm):
    """Where each sleeve ends, as a plane across the upper arm 2 cm inside
    it. Her arm's skin under the sleeve was hidden face by face and its
    edge showed ragged inside the sleeve's opening; cut along this plane it
    ends in one line, out of sight."""
    bm = bmesh.new()
    bm.from_mesh(tee.data)
    edge = [v.co.copy() for v in bm.verts if v.is_boundary]
    bm.free()
    planes, out = {}, {}
    for side in ('Left', 'Right'):
        shoulder = arm.data.bones[side + 'Arm'].head_local
        elbow = arm.data.bones[side + 'ForeArm'].head_local
        axis = (elbow - shoulder).normalized()
        length = (elbow - shoulder).length
        ring = []
        for co in edge:
            t = (co - shoulder).dot(axis)
            if .2 * length < t < 1.25 * length and (co - shoulder - axis * t).length < .13:
                ring.append(t)
        if len(ring) < 6:
            continue
        end = float(np.median(ring))
        point = shoulder + axis * (end - .02)
        planes[side] = (point, axis)
        out[side] = round(end, 3)
    # One sleeve found, the other mirrored from it: the tee is symmetric.
    for side, other in (('Left', 'Right'), ('Right', 'Left')):
        if side not in planes and other in planes:
            co, axis = planes[other]
            planes[side] = (Vector((-co.x, co.y, co.z)), Vector((-axis.x, axis.y, axis.z)))
            out[side] = 'mirrored'
    SLEEVE_PLANES[tee.name.replace('-tee', '')] = planes
    return out


def drop_scraps(obj, smallest=40):
    """Loose pieces of a carried garment smaller than `smallest` faces: the
    collar's cut left one floating over her shoulder."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    seen, gone = set(), []
    for f in bm.faces:
        if f in seen:
            continue
        part, stack = [], [f]
        seen.add(f)
        while stack:
            g = stack.pop()
            part.append(g)
            for v in g.verts:
                for h in v.link_faces:
                    if h not in seen:
                        seen.add(h)
                        stack.append(h)
        if len(part) < smallest:
            gone += part
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return len(gone)


def close_holes(obj, sides=24):
    """Close the small holes in a carried garment. Lifting her tee off the
    dressed generation, a few shirt triangles over the shoulder blades read
    as skin and were left behind, and the backdrop showed through as white
    streaks. Only loops of up to `sides` edges are closed: the neck, sleeve
    and hem openings are far larger. Each patch takes the texture of a
    neighbouring corner, which is the shirt's black."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.active
    edges = [e for e in bm.edges if e.is_boundary]
    made = bmesh.ops.holes_fill(bm, edges=edges, sides=sides)['faces']
    for f in made:
        for loop in f.loops:
            near = [l for e in loop.vert.link_edges for l in e.link_loops if l.face not in made]
            if uv and near:
                loop[uv].uv = near[0][uv].uv.copy()
    count = len(made)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return count


def cut_collar(tee, arm):
    """Her generated tee's neckline, cut clean. Its collar is weighted partly
    to the head, and carried onto her body its edge rode up the throat as
    dark teeth (the owner, 2026-10-01). Everything of the tee near the neck
    above the collar line goes, along one cut, lower in front as a crew neck
    dips."""
    n = arm.data.bones['neck'].head_local
    front, back = Vector((n.x, n.y - .05, n.z - .022)), Vector((n.x, n.y + .05, n.z - .004))
    normal = Vector((1, 0, 0)).cross(back - front).normalized()
    if normal.z < 0:
        normal = -normal
    bm = bmesh.new()
    bm.from_mesh(tee.data)
    near = [f for f in bm.faces if math.hypot(f.calc_center_median().x - n.x, f.calc_center_median().y - n.y) < .1]
    geom = list({v for f in near for v in f.verts}) + list({e for f in near for e in f.edges}) + near
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=front, plane_no=normal)
    gone = [f for f in bm.faces if math.hypot(f.calc_center_median().x - n.x, f.calc_center_median().y - n.y) < .1
            and (f.calc_center_median() - front).dot(normal) > 0]
    count = len(gone)
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(tee.data)
    bm.free()
    tee.data.update()
    COLLAR_PLANE[tee.name.replace('-tee', '')] = (front + normal * .004, normal, n.copy())
    return count


def dress_as_generated(arm, body, carm, cbody, sex):
    """Her outfit exactly as Higgsfield generated it (the owner, September
    30: use the dressed model whole; one body and the September 25 head
    throughout). The dressed model's tee, trousers and shoes are carried onto
    her skeleton bone by bone, so they take her proportions, and keep the
    generator's own skin weights. Nothing is trimmed, levelled, cut, pushed
    out or replaced: every one of those edits left a seam, a hole or a
    ragged edge. Her skin, head and hands are her own body's, which shows
    wherever the clothes do not cover it."""
    kind = classify_garments(carm, cbody, sex)
    garments = {}
    for name in GARMENTS:
        obj = duplicate(cbody, body.name.replace('-body', '') + '-' + name)
        if obj.data.shape_keys:
            obj.shape_key_clear()
        keep_faces(obj, {i for i, k in kind.items() if k == name})
        # The collar is weighted partly to the head, which on her body sits
        # higher than on the dressed model's: carried by it the collar rode up
        # to her chin. It follows the neck instead.
        if name == 'shoes':
            # Carried straight across to her ankles, not turned by the foot
            # bones, which point differently on the two models and tipped the
            # shoes six centimetres toes-up.
            level_shoes(obj, carm, arm)
            # Both soles on one floor: the two ankles are not at the same
            # height on her body, and one shoe hung nine millimetres up.
            names_ = {vg.index: vg.name for vg in obj.vertex_groups}
            low = {}
            for v in obj.data.vertices:
                side = 'Left' if sum(g.weight for g in v.groups if names_[g.group].startswith('Left')) >= .5 else 'Right'
                low[side] = min(low.get(side, 9.0), v.co.z)
            floor = min(low.values())
            for v in obj.data.vertices:
                side = 'Left' if sum(g.weight for g in v.groups if names_[g.group].startswith('Left')) >= .5 else 'Right'
                v.co.z -= low[side] - floor
            obj.data.update()
        else:
            retarget(obj, carm, arm, (lambda n: n not in HEADS) if name == 'tee' else (lambda n: True), 'neck' if name == 'tee' else 'Hips')
        obj.data.normals_split_custom_set([(0.0, 0.0, 0.0)] * len(obj.data.loops))
        for poly in obj.data.polygons:
            poly.use_smooth = True
        obj.parent = arm
        obj.modifiers.new('Armature', 'ARMATURE').object = arm
        garments[name] = obj
        report.setdefault(body.name, {})[name] = len(obj.data.polygons)
    if (FEMALE_GENERATED_TEE and sex == 'female') or (MALE_GENERATED_OUTFIT and sex == 'male'):
        report.setdefault(body.name, {})['collar'] = arm.data.bones['neck'].head_local.z - .01
        report[body.name]['collarCut'] = cut_collar(garments['tee'], arm)
        report[body.name]['teeStitched'] = stitch(garments['tee'])
        report[body.name]['teeHoles'] = close_holes(garments['tee'])
        report[body.name]['teeScraps'] = drop_scraps(garments['tee'])
        report[body.name]['sleeveCuts'] = sleeve_planes(garments['tee'], arm)
    else:
        replace_tee(arm, body, garments, body.name.replace('-body', ''))
    report[body.name]['asGenerated'] = True
    return garments


def same_floor(shoes):
    """Both soles on one floor: the two ankles are not at the same height on
    every generated body, and one shoe hung up off the ground."""
    names_ = {vg.index: vg.name for vg in shoes.vertex_groups}
    side_of = lambda v: 'Left' if sum(g.weight for g in v.groups if names_[g.group].startswith('Left')) >= .5 else 'Right'
    low = {}
    for v in shoes.data.vertices:
        low[side_of(v)] = min(low.get(side_of(v), 9.0), v.co.z)
    floor = min(low.values())
    for v in shoes.data.vertices:
        v.co.z -= low[side_of(v)] - floor
    shoes.data.update()
    return {k: round(v - floor, 4) for k, v in low.items()}


def dress(arm, body, carm, cbody, sex):
    """The clothed generation's tee, trousers and shoes, lifted off it and put
    on the base body: carried across the skeleton, pushed clear of the skin,
    and skinned exactly as the skin under them."""
    kind = classify_garments(carm, cbody, sex)
    garments = {}
    for name in GARMENTS:
        if name == 'shoes' and not GENERATED_SNEAKERS:
            garments[name] = clean_shoes(arm, sex)
            continue
        obj = duplicate(cbody, body.name.replace('-body', '') + '-' + name)
        if obj.data.shape_keys:
            obj.shape_key_clear()
        keep_faces(obj, {i for i, k in kind.items() if k == name})
        if name == 'shoes':
            level_shoes(obj, carm, arm)
            report.setdefault(body.name, {})['soles'] = same_floor(obj)
        else:
            if name == 'tee':
                # The crew collar is weighted partly to the head. The new
                # female's head sits 8 cm higher than the clothed model's, and
                # carried by it the collar rode up to her chin and hid her neck.
                retarget(obj, carm, arm, lambda n: FOLLOW['tee'](n) and n not in HEADS, 'neck')
            else:
                retarget(obj, carm, arm, FOLLOW[name])
        # Carried across, the clothed model's own normals no longer fit.
        obj.data.normals_split_custom_set([(0.0, 0.0, 0.0)] * len(obj.data.loops))
        fit_outside(obj, body)
        body_weights(obj, body, FOLLOW[name], sleeves_only(arm) if name == 'tee' else None)
        if name == 'trousers':
            split_legs(arm, obj)
            trouser_clearance(arm, obj)
            if sex == 'male':
                report.setdefault(body.name, {})['jogger'] = jogger_cuffs(arm, obj)
        obj.parent = arm
        obj.modifiers.new('Armature', 'ARMATURE').object = arm
        garments[name] = obj
        report.setdefault(body.name, {})[name] = len(obj.data.polygons)
    # Clean horizontal cuffs sit inside the sneaker collars, a little below
    # their tops (the generated sneakers' collars are lower than the clean
    # shoes' were, and cut at 4.5 cm over the ankle a gap of sock showed).
    cuff = sum(arm.data.bones[side + 'Foot'].head_local.z for side in ('Left', 'Right')) / 2 + .045
    if GENERATED_SNEAKERS:
        tops = [v.co.z for v in garments['shoes'].data.vertices]
        cuff = min(cuff, float(np.percentile(tops, 97)) - .012)
    obj = garments['trousers']
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(0, 0, cuff), plane_no=(0, 0, 1), clear_inner=True)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(obj.data); bm.free(); obj.data.update()
    report.setdefault(body.name, {})['cuff'] = round(cuff, 3)
    # The tee is modelled (model_tee); the lifted one only lends its length.
    return replace_tee(arm, body, garments, body.name.replace('-body', ''))


def covered_faces(body, garments, collar=None):
    """The faces of the body a garment lies over, or that poke out through
    one. They are not drawn while the clothes are on, so no skin can show
    through a sleeve or a shoe however the body moves."""
    parts = list(garments.values())
    offsets = np.cumsum([0] + [len(o.data.vertices) for o in parts[:-1]])
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons([v.co.copy() for o in parts for v in o.data.vertices],
                                [tuple(int(i + off) for i in p.vertices) for o, off in zip(parts, offsets) for p in o.data.polygons])
    # Under a modelled crew neck, the neck is first cut along the collar: a
    # plane through the rib's top, lower in front as the collar dips. Hidden
    # whole, his large neck triangles left a sawtooth of skin standing in
    # front of the collar (the owner, 2026-10-01: "torn up"); cut, the
    # skin ends in one line behind the rib.
    ring = TEE_NECK.get(body.name.replace('-body', ''))
    plane = None
    sleeve_cuts = SLEEVE_PLANES.get(body.name.replace('-body', ''), {})
    if sleeve_cuts:
        bm = bmesh.new()
        bm.from_mesh(body.data)
        for side, (co, normal) in sleeve_cuts.items():
            near = [f for f in bm.faces if abs((f.calc_center_median() - co).dot(normal)) < .05
                    and ((f.calc_center_median() - co) - normal * (f.calc_center_median() - co).dot(normal)).length < .08]
            geom = list({v for f in near for v in f.verts}) + list({e for f in near for e in f.edges}) + near
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=normal)
        bm.to_mesh(body.data)
        bm.free()
        body.data.update()
    cut = COLLAR_PLANE.get(body.name.replace('-body', ''))
    if cut:
        # Her generated tee's neckline: the neck's skin is cut along the same
        # line, a few millimetres higher, so its edge tucks under the tee's
        # rather than notching along it.
        co, normal, nb = cut
        bm = bmesh.new()
        bm.from_mesh(body.data)
        near = [f for f in bm.faces if math.hypot(f.calc_center_median().x - nb.x, f.calc_center_median().y - nb.y) < .1
                and abs(f.calc_center_median().z - nb.z) < .06]
        geom = list({v for f in near for v in f.verts}) + list({e for f in near for e in f.edges}) + near
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=normal)
        bm.to_mesh(body.data)
        bm.free()
        body.data.update()
        cx, cy, rx, ry = nb.x, nb.y, .04, .04
        plane = (co, normal)
    if ring:
        cx, cy, rx, ry, base, dip = ring
        back, front = Vector((cx, cy + ry, base + .011)), Vector((cx, cy - ry, base - dip + .011))
        normal = Vector((1, 0, 0)).cross(back - front).normalized()
        if normal.z < 0:
            normal = -normal
        plane = (front, normal)
        bm = bmesh.new()
        bm.from_mesh(body.data)
        near = [f for f in bm.faces if math.hypot(f.calc_center_median().x - cx, f.calc_center_median().y - cy) < max(rx, ry) + .08
                and abs(f.calc_center_median().z - base) < .06]
        geom = list({v for f in near for v in f.verts}) + list({e for f in near for e in f.edges}) + near
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=front, plane_no=normal)
        bm.to_mesh(body.data)
        bm.free()
        body.data.update()
    own = owners(body)
    covered = set()
    neck_at = body.parent.data.bones['neck'].head_local if body.parent and body.parent.type == 'ARMATURE' else Vector()
    for p, o in zip(body.data.polygons, own):
        # Below the collar's cut, near the neck: under the collar, whatever
        # bone carries it. Checked first: the base of his neck is weighted
        # partly to the head, and head faces skipped every rule below.
        c = p.center
        if plane:
            dx, dy = (c.x - cx) / (rx + .06), (c.y - cy) / (ry + .06)
            height = (c - plane[0]).dot(plane[1])
            if dx * dx + dy * dy < 1 and height < 0:
                covered.add(p.index)
                continue
            # Just above the cut, only the neck's own column stays. Wider is
            # the flare from the neck out to the shoulders, which bulges out
            # through the tee between its shoulders and the rib and showed
            # as points of skin over the black.
            # Every corner, not the centre: the neck ended in a star of long
            # triangles whose centres sat in the column and whose tips
            # reached out over the tee.
            def outside(v):
                kx, ky = (v.x - cx) / (rx - COLLAR_EASE + .006), (v.y - cy) / (ry - COLLAR_EASE + .006)
                return kx * kx + ky * ky > 1
            if ring and dx * dx + dy * dy < 1 and height < .035 and any(outside(body.data.vertices[i].co) for i in p.vertices):
                covered.add(p.index)
                continue
        if o in HEADS or 'Hand' in o:
            continue
        # The upper arm: covered on the shoulder's side of its sleeve's cut,
        # bare beyond it, and nothing else decides.
        arm_side = 'Left' if o.startswith('Left') else 'Right' if o.startswith('Right') else None
        if arm_side and arm_side in sleeve_cuts and ('Arm' in o and 'ForeArm' not in o):
            co, normal = sleeve_cuts[arm_side]
            if (p.center - co).dot(normal) < 0:
                covered.add(p.index)
            continue
        # Under the cloth, or poking out through it by a few millimetres:
        # nearest the garment, on its inner side. Her body is not the shape
        # her tee was made on, and over the shoulder blades and at the sleeve
        # ends her skin stood out through it in pale slivers (2026-10-01).
        if COLLAR_PLANE.get(body.name.replace('-body', '')):
            near = tree.find_nearest(p.center, .04)
            if near[0] is not None and (p.center - near[0]).dot(near[1]) < .004:
                covered.add(p.index)
                continue
        if 'ForeArm' in o:
            continue
        c, n = p.center, p.normal
        # Inside the modelled crew neck and below its rib's top, the neck is
        # under the collar: hidden. Shown, its triangles stood up past the
        # rib as ragged shards of skin (the owner, 2026-10-01).
        # Above the trimmed collar the neck is bare: hidden only where it
        # pokes through the tee. The fan of rays still found the collar
        # round it and cut a ragged hole in her throat.
        if collar is not None and (o == 'neck' or (c.z > collar - .004 and math.hypot(c.x - neck_at.x, c.y - neck_at.y) < .075)):
            if tree.ray_cast(c, -n, .05)[0] is not None:
                covered.add(p.index)
            continue
        # The torso, hips, legs and feet are always under the tee, the
        # trousers and the shoes. Only where a garment ends part way along a
        # limb — the sleeves, the collar — is it measured.
        if o in TORSO or o == 'Hips' or any(k in o for k in LEG_BONES):
            covered.add(p.index)
            continue
        # The upper arm, under a modelled tee's sleeve: hidden only from 7 cm
        # inside the sleeve's end, deep enough that the sleeve's wall hides
        # the edge. Found by rays, and at 2.5 cm, that edge was ragged and
        # showed through the open sleeve.
        sleeves = TEE_SLEEVES.get(body.name.replace('-body', ''))
        if sleeves and o in ('LeftArm', 'RightArm'):
            sh, ax, end = sleeves['Left' if o == 'LeftArm' else 'Right']
            if (c - sh).dot(ax) < end - .07:
                covered.add(p.index)
            continue
        # Anything poking out through a garment is under it.
        if tree.ray_cast(c, -n, .05)[0] is not None:
            covered.add(p.index)
            continue
        # Otherwise most of a fan of rays off the skin must meet a garment,
        # out to 35 cm: the trousers and the tee hang well clear of a thin
        # body. One ray along the normal slipped out through the collar and
        # between a sleeve and the shoulder, and left the skin there showing.
        # The fan leaves the skin sideways, so a forearm's never reach the
        # sleeve above it.
        # Directly under the cloth, within 5 cm: under it, whatever the fan
        # says. Relaxed smooth, the skin under his sleeves sat far enough
        # below the tee for the fan to miss it, and showed through the
        # tee's seams as flecks of skin.
        if tree.ray_cast(c + n * .001, n, .05)[0] is not None:
            covered.add(p.index)
            continue
        side = n.orthogonal().normalized()
        other = n.cross(side).normalized()
        fan = [n] + [(n + d * .85).normalized() for d in (side, -side, other, -other)] + [(n * .6 + side * .4 + other * .4).normalized()]
        hits = sum(tree.ray_cast(c + n * .001, d, .35)[0] is not None for d in fan)
        if hits >= 4:
            covered.add(p.index)
    return covered


def mark_covered(body, covered):
    """The body's `_covered` attribute: 1 on every vertex most of whose faces
    are under the clothes. The shader leaves those out while the clothes are on.
    A vertex attribute, not a texture channel: a browser may throw away the
    colour of a fully transparent texel, and with it the dye weights."""
    # Exact, face by face: the edges between covered and bare faces are split
    # so no vertex is shared, and a vertex is hidden when all its faces are.
    # Shared, the flag blended across every boundary triangle, which the
    # shader cut part way: ragged shards of skin at the collar and sleeves.
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    under = {f for f in bm.faces if f.index in covered}
    seam = [e for e in bm.edges if len(e.link_faces) == 2 and (e.link_faces[0] in under) != (e.link_faces[1] in under)]
    bmesh.ops.split_edges(bm, edges=seam)
    layer = bm.verts.layers.float.new('_covered')
    for v in bm.verts:
        v[layer] = 1.0 if v.link_faces and all(f in under for f in v.link_faces) else 0.0
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()


def join_parts(body, garments):
    """One mesh for one bake: every part marked, so it can be split again."""
    for index, obj in enumerate([body] + [garments[n] for n in GARMENTS]):
        attr = obj.data.attributes.new('part', 'INT', 'FACE')
        attr.data.foreach_set('value', [index] * len(obj.data.polygons))
    join_into(body, [garments[n] for n in GARMENTS])


def split_parts(body, key):
    """Separate the baked mesh into the body and a mesh per garment."""
    part = np.zeros(len(body.data.polygons), np.int32)
    body.data.attributes['part'].data.foreach_get('value', part)
    garments = {}
    for index, name in enumerate(GARMENTS, start=1):
        obj = duplicate(body, key + '-' + name)
        keep_faces(obj, {int(i) for i in np.nonzero(part == index)[0]})
        obj.data.attributes.remove(obj.data.attributes['part'])
        obj['componentId'] = 'garment-' + name
        garments[name] = obj
    keep_faces(body, {int(i) for i in np.nonzero(part == 0)[0]})
    body.data.attributes.remove(body.data.attributes['part'])
    return garments


# ---------------------------------------------------------------- dye mask

def eye_texels(body, faces, atlas):
    """Every texel of the eyes, found from the eyes themselves.

    Each eye is the box round its own near-black texels on the front of the
    face (both sides measured apart), and inside it every texel is eye — the
    whites, the lids and the slanted walls of the carved sockets alike —
    except what hangs in front of the eyes' own depth (the fringe). A fixed
    box round one measured height, counting only faces turned to the front,
    left parts of each socket in the hair's class, a different part in each
    eye, so dyeing her hair turned one eye the hair's colour and left the
    other (the owner, October 2); and it held the fringe's strands out of the
    hair's dye. Returns a mask over the atlas."""
    h, w = atlas.shape[:2]
    rows, cols, pts = [], [], []
    for r, c, q in texels(body, faces, w, h):
        rows.append(r); cols.append(c); pts.append(q)
    mask = np.zeros((h, w), bool)
    if not rows:
        return mask
    rows, cols, pts = np.concatenate(rows), np.concatenate(cols), np.concatenate(pts)
    rgb = atlas[rows, cols, :3]
    y = lum(rgb)
    skin = colour_class(rgb) == 'skin'
    # The face: the front half of the head, where its skin is.
    front = pts[:, 1] < np.median(pts[:, 1])
    face = skin & front
    if face.sum() < 50:
        return mask
    x0, x1 = np.percentile(pts[face, 0], [2, 98])
    z0, z1 = np.percentile(pts[face, 2], [2, 98])
    mid = float(np.median(pts[face, 0]))
    dark = (y < .08) & front & (pts[:, 0] > x0) & (pts[:, 0] < x1) & (pts[:, 2] > z0) & (pts[:, 2] < z1)
    for side in (-1, 1):
        mine = dark & (np.sign(pts[:, 0] - mid) == side)
        if mine.sum() < 20:
            continue
        # The eye's own block of black: stray dark texels in the locks
        # beside the face stretched a percentile box out over the hair.
        def run(v):
            counts, edges = np.histogram(v, bins=40)
            top = int(np.argmax(counts))
            lo = hi = top
            while lo > 0 and counts[lo - 1] >= counts[top] * .12:
                lo -= 1
            while hi < len(counts) - 1 and counts[hi + 1] >= counts[top] * .12:
                hi += 1
            return edges[lo], edges[hi + 1]
        ex0, ex1 = run(pts[mine, 0])
        mine = mine & (pts[:, 0] >= ex0) & (pts[:, 0] <= ex1)
        depth = float(np.percentile(pts[mine, 1], 2)) - .01
        # Its height from everything dark in that column behind the fringe:
        # the lower third of each eye is a dark brown, not black.
        column = (y < .2) & front & (pts[:, 0] >= ex0) & (pts[:, 0] <= ex1) & (pts[:, 1] >= depth) \
            & (pts[:, 2] > z0) & (pts[:, 2] < z1)
        ez0, ez1 = run(pts[column, 2])
        # A little round it, for the whites and the lash line at its edges.
        mx, mz = (ex1 - ex0) * .6, (ez1 - ez0) * .2
        box = lambda gx, gz: front & (pts[:, 0] > ex0 - gx) & (pts[:, 0] < ex1 + gx) & (pts[:, 2] > ez0 - gz) \
            & (pts[:, 2] < ez1 + gz) & (pts[:, 1] >= depth) & (pts[:, 0] > x0) & (pts[:, 0] < x1)
        inside = box(mx, mz)
        mask[rows[inside], cols[inside]] = True
    return mask


def dye_mask(key, body, garments, atlas, frame):
    """Which palette colour may dye each texel, as weights: red skin, green
    hair, blue the garment dye of whichever mesh the texel is on — the
    swimsuit on the body, the trousers on theirs. Weights, so the mask
    filters and mipmaps like the texture it describes.

    Returns the counts, the native colour of each slot (the palette value
    that leaves the texture untouched) and each slot's median linear
    lightness, which the shader measures a texel's shade against."""
    h, w = atlas.shape[:2]
    rgb = atlas[..., :3]
    r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    y = lum(rgb)
    region = np.zeros((h, w), np.uint8)   # body only: 1 head, 2 limbs, 3 legs, 4 torso, 5 feet
    for p, o in zip(body.data.polygons, owners(body)):
        r = 1 if o in HEADS else 2 if ('Arm' in o or 'Hand' in o or 'Shoulder' in o or o == 'neck') else \
            5 if ('Foot' in o or 'Toe' in o) else 3 if ('Leg' in o) else 4
        for rows, cols, _ in texels(body, [p.index], w, h):
            region[rows, cols] = r
    trousers = np.zeros((h, w), bool)
    if 'trousers' in garments:
        for rows, cols, _ in texels(garments['trousers'], range(len(garments['trousers'].data.polygons)), w, h):
            trousers[rows, cols] = True
    # The eyes, by where they are on the face rather than by colour: his are
    # the brown of his hair, and dyeing the hair dyed them with it. Taller
    # above the middle than below, for her lashes.
    if key.startswith('female'):
        eyes = eye_texels(body, [p.index for p, o in zip(body.data.polygons, owners(body)) if o in HEADS], atlas)
    else:
        # His eyes are hair-brown, not black, so eye_texels cannot find them.
        eyes = np.zeros((h, w), bool)
        in_eyes = [p.index for p, o in zip(body.data.polygons, owners(body)) if o in HEADS
                   and -.03 < p.center.z - frame['eye'] < .045 and abs(p.center.x - frame['x']) < .09
                   and p.center.y < frame['faceFront'] + .06 and p.normal.y < -.3]
        for rows, cols, _ in texels(body, in_eyes, w, h):
            eyes[rows, cols] = True
    lit = colour_class(rgb) == 'skin'
    shaded = (r_ > g_ * 1.03) & (g_ > b_ * 1.02) & (r_ - b_ > .1) & (y > .45)
    # The hair clip is cream, yellower than any skin (green further above
    # blue than red above green), and keeps its colour.
    cream = (region == 1) & (g_ - b_ > (r_ - g_) * 1.15)
    skin = (lit | shaded) & (region > 0) & ~cream
    # Hair: on the head, not skin, not the eyes' black or whites, not the clip.
    white = (y > .62) & (rgb.max(axis=-1) - rgb.min(axis=-1) < .25)
    hair = (region == 1) & ~skin & (y > .06) & ~white & ~cream & ~eyes
    if key == 'female-swim':
        # Her swim generation's hair is near black, the same neutral black as
        # the 我的檔期 cap that is part of its head and as her eyes, and the
        # three run into each other: texel by texel, face by face, and face
        # by face smoothed over its neighbours, a dye left half the fringe
        # dark, speckled the cap and coloured part of one eye (October 2). Her
        # hair in the swimsuit keeps its generated colour; skin and swimsuit
        # still dye.
        hair = np.zeros((h, w), bool)
    suit = (region >= 2) & ~skin & (y < .16)
    # The swimsuit's piping fades from black to white over a texel or two;
    # those texels dye in part, so a light suit's stripes have soft edges.
    edge = (region >= 2) & ~skin & (y >= .16) & (y < .55) & (rgb.max(axis=-1) - rgb.min(axis=-1) < .12)
    weights = np.zeros((h, w, 3), np.float32)
    weights[..., 0] = skin
    weights[..., 1] = hair
    weights[..., 2] = suit | trousers
    weights[..., 2][edge & ~trousers] = np.clip((.55 - y[edge & ~trousers]) / .39, 0, 1)
    linear = lum(srgb_to_linear(rgb))
    native, reference, counts = {}, {}, {}
    for name, sel in (('skin', skin), ('hair', hair), ('swimwear', suit), ('bottoms', trousers)):
        counts[name] = int(sel.sum())
        if sel.any():
            med = np.median(rgb[sel], axis=0)
            native[name] = '#' + ''.join('%02x' % int(round(min(1, max(0, v)) * 255)) for v in med)
            reference[name] = float(np.median(linear[sel]))
    weights = pad(weights, coverage_all([body] + list(garments.values()), w, h))
    bpy.context.scene.render.image_settings.compression = 100
    new_image(key + '-dye', weights, os.path.join(OUT, key + '-dye.png'), 'PNG')
    return counts, native, reference


def coverage_all(objs, w, h):
    mask = np.zeros((h, w), bool)
    for o in objs:
        mask |= coverage(o, w, h)
    return mask


# ------------------------------------------------- her, as generated

# Her own neck shows in the swimsuit from this far above her collar cut, and
# the swim body's neck stops NECK_BRIDGE below that; a band of faces joins them.
NECK_JOIN_ABOVE_COLLAR = .006
NECK_BRIDGE = .012


def neck_join_height(body, axis, chin):
    """Just above the top of her collar cut: from there up her neck is whole.
    The cut is the dressed body's open edge round the neck, where the tee
    was taken off."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    tops = [max(v.co.z for v in e.verts) for e in bm.edges if e.is_boundary
            and all((Vector(v.co[:2]) - axis).length < .09 and chin - .12 < v.co.z < chin + .01 for v in e.verts)]
    bm.free()
    return min(max(tops, default=chin - .03) + NECK_JOIN_ABOVE_COLLAR, chin - .002)


def cut_at(obj, z, axis, reach=.1):
    """Split every face round the neck that crosses height z, so the faces
    there end exactly at z."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    faces = [f for f in bm.faces if (Vector(f.calc_center_median()[:2]) - axis).length < reach
             and min(v.co.z for v in f.verts) < z < max(v.co.z for v in f.verts)]
    if faces:
        edges = list({e for f in faces for e in f.edges})
        verts = list({v for f in faces for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=verts + edges + faces, plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return len(faces)


NECK_BINS = 48


def neck_outline(obj, z, axis, faces=None, reach=.075):
    """The neck's radius round its axis at height z, by angle (NECK_BINS)."""
    V = [v.co for v in obj.data.vertices]
    found = [[] for _ in range(NECK_BINS)]
    for p in obj.data.polygons:
        if faces is not None and p.index not in faces:
            continue
        vs = list(p.vertices)
        for a, b in zip(vs, vs[1:] + vs[:1]):
            if (V[a].z - z) * (V[b].z - z) >= 0:
                continue
            q = V[a].lerp(V[b], (z - V[a].z) / (V[b].z - V[a].z))
            d = Vector((q.x - axis.x, q.y - axis.y))
            if d.length < reach:
                found[int((math.atan2(d.y, d.x) + math.pi) / math.tau * NECK_BINS) % NECK_BINS].append(d.length)
    return ring_fill([max(x) if x else None for x in found])


def outline_at(outline, angle):
    t = (angle + math.pi) / math.tau * NECK_BINS - .5
    i = math.floor(t)
    f = t - i
    return outline[i % NECK_BINS] * (1 - f) + outline[(i + 1) % NECK_BINS] * f


def match_neck(dressed, swim, join, under, axis, fade=.05):
    """Give the top of the swim body's neck her neck's outline at the join,
    angle by angle, fading back to its own over `fade` below. The two
    generations' necks are the same width; the swim one stood 1 cm further
    out at the nape."""
    shown = {p.index for p in dressed.data.polygons if p.center.z > join}
    hers = neck_outline(dressed, join + .002, axis, shown)
    its = neck_outline(swim, under - .002, axis)
    if not hers or not its:
        return None
    for v in swim.data.vertices:
        d = Vector((v.co.x - axis.x, v.co.y - axis.y))
        if v.co.z < under - fade or d.length > .075 or d.length < 1e-6:
            continue
        a = math.atan2(d.y, d.x)
        k = outline_at(hers, a) / max(outline_at(its, a), 1e-4)
        w = smoothstep(under - fade, under, v.co.z)
        d *= 1 + (k - 1) * w
        v.co.x, v.co.y = axis.x + d.x, axis.y + d.y
    swim.data.update()
    return {'hers': [round(min(hers), 3), round(max(hers), 3)], 'its': [round(min(its), 3), round(max(its), 3)]}


def bridge_neck(body, join, under, axis, first_swim_vertex):
    """Close the band between her neck's ring at `join` and the swim neck's
    top ring at `under` with triangles, walking both rings round together.
    The band is skin from the swim neck just under it, and counts as the swim
    body (swim_origin), so its skin is cleaned and tinted with it: textured
    from her side of the join it took the collar's dark inside and drew a
    black ring round her neck."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    origin = bm.faces.layers.int.get('swim_origin')
    angle = lambda v: math.atan2(v.co.y - axis.y, v.co.x - axis.x)
    near = lambda v: (Vector(v.co[:2]) - axis).length < .07
    hers = [v for v in bm.verts if v.index < first_swim_vertex and abs(v.co.z - join) < 1e-5 and near(v)
            and any(f.calc_center_median().z > join for f in v.link_faces)]
    its = [v for v in bm.verts if v.index >= first_swim_vertex and abs(v.co.z - under) < 1e-5 and near(v) and v.is_boundary]
    if len(hers) < 6 or len(its) < 6:
        bm.free()
        return {'hers': len(hers), 'its': len(its)}
    A, B = sorted(hers, key=angle), sorted(its, key=angle)
    def below(v):
        # The middle of the swim face under the vertex: a corner's own UV sits
        # on its island's edge, and the bake read the dark texel beyond it.
        face = min(v.link_faces, key=lambda f: f.calc_center_median().z, default=None)
        if face is None:
            return None, 0
        return sum((l[uv].uv for l in face.loops), Vector((0, 0))) / len(face.loops), face.material_index
    texture = {v: below(v) for v in B}
    nearest = lambda v: min(B, key=lambda b: abs((angle(b) - angle(v) + math.pi) % math.tau - math.pi))
    na, nb = len(A), len(B)
    unwrap = lambda seq, k: angle(seq[k % len(seq)]) + (math.tau if k >= len(seq) else 0)
    i = j = 0
    made = []
    while i < na or j < nb:
        if j >= nb or (i < na and unwrap(A, i + 1) <= unwrap(B, j + 1)):
            tri = (A[i % na], A[(i + 1) % na], B[j % nb]); i += 1
        else:
            tri = (A[i % na], B[(j + 1) % nb], B[j % nb]); j += 1
        try:
            f = bm.faces.new(tri)
        except ValueError:
            continue
        f.normal_update()
        centre = f.calc_center_median()
        if f.normal.dot(Vector((centre.x - axis.x, centre.y - axis.y, 0))) < 0:
            f.normal_flip()
        f.material_index = texture[B[0]][1]
        f[origin] = 1
        for loop in f.loops:
            src = texture.get(loop.vert) or texture[nearest(loop.vert)]
            if src[0] is not None:
                loop[uv].uv = src[0]
        f.smooth = True
        made.append(f)
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    return {'hers': na, 'its': nb, 'faces': len(made)}


def dressed_whole(key, arm, body, sex, placed, base_stem):
    """Her avatar IS the dressed Higgsfield generation, as generated: its
    head, bob, clip, face, arms and hands, and its tee, trousers and shoes cut
    apart only so they can be shown, hidden and dyed (the owner, 2026-10-01:
    "the higgsfield generated model looks fine, you just need to integrate it
    better"). Sleeves and arms come off one mesh, so they cannot fight. The
    modelled bob, the repainted face and the modelled tee are gone for her.

    The swimsuit needs skin under the clothes, which the dressed generation
    does not have, so the base generation is carried onto her skeleton
    beneath it with its own head taken off: her generated head is worn in
    every outfit. Base faces carry `_covered` (not drawn while dressed); her
    dressed arms and hands carry `_dressed` (not drawn while swimming), the
    base's own arms showing instead. The one seam is at the neck, under the bob."""
    kind = classify_garments(arm, body, sex)
    garments = {}
    for name in GARMENTS:
        obj = duplicate(body, key + '-' + name)
        if obj.data.shape_keys:
            obj.shape_key_clear()
        keep_faces(obj, {i for i, k in kind.items() if k == name})
        obj.parent = arm
        obj.modifiers.new('Armature', 'ARMATURE').object = arm
        garments[name] = obj
        report.setdefault(key, {})[name] = len(obj.data.polygons)
    keep_faces(body, {p.index for p in body.data.polygons if p.index not in kind})
    report[key]['fingers'] = rebuild_fingers(arm, body)
    if FEMALE_SWIM_MODEL:
        # Her swimsuit is a model of its own (swim_model): nothing under
        # these clothes, and nothing of hers is ever hidden.
        report[key]['asGenerated'] = 'whole'
        return garments, set(), None
    # Everything left of the dressed model is skin, head and hair. Hidden in
    # the swimsuit: the arms and hands, and the neck below the chin, whose
    # bottom is the generator's ragged collar cut. The swimsuit's body
    # replaces them; its neck rises into the underside of her head, so the
    # join is under the jaw, inside the head (the owner, 2026-10-01: "what
    # is wrong with the female neck ... why it keeps happening").
    own = owners(body)
    collar = arm.data.bones['neck'].head_local.z - .012
    axis = Vector(arm.data.bones['neck'].head_local[:2])
    samples = face_samples(body)
    chin = min((p.center.z for p, o, rgb in zip(body.data.polygons, own, samples)
                if o in HEADS and skinlike(rgb) and (Vector(p.center[:2]) - axis).length < .06), default=collar + .05)
    report[key]['chin'] = round(chin, 3)
    # Shown in the swimsuit: her head, her hair however it was weighted, and
    # her own neck down to `join`, a whole ring just above where the
    # generator cut her collar. The swim body's neck rises to just under it,
    # takes its outline and is bridged to it (bridge_neck). Cut off under her
    # chin with her neck hidden (October 3), nothing joined the two: an open
    # ring under her jaw, through which the inside of her head showed from
    # above (the owner, 2026-10-04: "the neck is literally falling off").
    join = neck_join_height(body, axis, chin)
    cut_at(body, join, axis)
    own = owners(body)
    classes = face_colours(body)
    report[key]['neckJoin'] = round(join, 4)
    # Dark bits are shown only if they belong to her hair (joined to her head
    # through other dark faces): loose dark slivers by the neck showed as specks.
    by_vertex = defaultdict(list)
    for p in body.data.polygons:
        for v in p.vertices:
            by_vertex[v].append(p.index)
    heads = [p.index for p, o in zip(body.data.polygons, own) if o in HEADS]
    joined, stack = set(heads), list(heads)
    while stack:
        i = stack.pop()
        for v in body.data.polygons[i].vertices:
            for j in by_vertex[v]:
                if j not in joined and classes[j] in ('hair', 'dark'):
                    joined.add(j); stack.append(j)
    # Below the join only her hair's ends, and only outside the neck: a dark
    # shadow on her throat is joined to her head too.
    hide = [0 if p.center.z > join
            or (p.index in joined and classes[p.index] in ('hair', 'dark') and (Vector(p.center[:2]) - axis).length > .055)
            else 1 for p in body.data.polygons]
    report[key]['headShownInSwim'] = hide.count(0)
    flag = [0.0] * len(body.data.vertices)

    barm, bbody = import_source(SWIM_BODY_STEM)
    barm.name, bbody.name = key + '-swim-rig', key + '-swim-body'
    strip_emission(bbody)
    normalise(key + '-swim', barm, bbody, sex, True, placed)
    weld(bbody)
    split_legs(barm, bbody)
    if bbody.data.shape_keys:
        bbody.shape_key_clear()
    retarget(bbody, barm, arm)
    # The swim generation's own head, bob and cap off: hers is worn instead.
    # Everything above `under` goes, and its bob's ends below it.
    cut_at(bbody, join - NECK_BRIDGE, axis)
    bown, bcls = owners(bbody), face_colours(bbody)
    bneck = arm.data.bones['neck'].head_local.z
    # All of its hair too, however it was weighted: the bob's ends, weighted
    # to the neck and shoulders, were left as dark slivers round her
    # shoulders. Then any scraps the cuts left loose.
    # Hair, not the swimsuit: what is dark and joined to the head through
    # other dark faces is its bob; the suit meets the head only through the
    # skin of the neck. (By colour, the suit's edges went with the hair and
    # left holes at the straps; by owner, the bob's ends stayed as spikes.)
    bshoulder = min(arm.data.bones[s + 'Arm'].head_local.z for s in ('Left', 'Right'))
    head_faces = {p.index for p, o in zip(bbody.data.polygons, bown) if o in HEADS}
    darkish = {p.index for p, c in zip(bbody.data.polygons, bcls)
               if c in ('hair', 'dark') and p.center.z > bshoulder - .12}
    by_vertex = defaultdict(list)
    for p in bbody.data.polygons:
        for v in p.vertices:
            by_vertex[v].append(p.index)
    hair = set()
    stack = [i for i in head_faces]
    seen = set(stack)
    while stack:
        i = stack.pop()
        for v in bbody.data.polygons[i].vertices:
            for j in by_vertex[v]:
                if j not in seen and j in darkish:
                    seen.add(j); hair.add(j); stack.append(j)
    report[key]['swimHairFaces'] = len(hair)
    # Its neck stops NECK_BRIDGE under hers, reshaped to her neck's outline.
    under = join - NECK_BRIDGE
    keep_faces(bbody, {p.index for p in bbody.data.polygons if p.center.z < under and p.index not in hair})
    # Its shoulders up to hers: beside the neck they sit 4 cm under her
    # tee's, and the neck ran longer in the swimsuit than in her clothes (the
    # owner, 2026-10-04: "the neck is too tall compared to other outfits").
    # Measured with its own hair gone (on it, the rays met the bob, not the
    # shoulders) and faded to nothing at the neck's top ring, which stays
    # where it meets hers.
    report[key]['swimShoulderLift'] = raise_shoulders(arm, garments['tee'], bbody, chin, top=under)
    report[key]['swimNeck'] = match_neck(body, bbody, join, under, axis)
    report[key]['swimScraps'] = drop_scraps(bbody)
    report[key]['swimFaces'] = len(bbody.data.polygons)

    bpy.data.objects.remove(barm, do_unlink=True)

    first_swim = len(body.data.polygons)
    first_swim_vertex = len(body.data.vertices)
    attr = body.data.attributes.new('_dressed', 'FLOAT', 'POINT')
    attr.data.foreach_set('value', flag)
    # Which faces the swimsuit hides, as faces: turned into the vertex flag
    # only at the very end (swim_flags), after the last weld, with the edges
    # between hidden and shown faces split, so the boundary is exact.
    body.data.attributes.new('swim_hide', 'INT', 'FACE').data.foreach_set('value', hide)
    body.data.attributes.new('swim_origin', 'INT', 'FACE')
    bbody.data.attributes.new('swim_origin', 'INT', 'FACE').data.foreach_set('value', [1] * len(bbody.data.polygons))
    bbody.parent = arm
    join_into(body, [bbody])
    report[key]['neckBridge'] = bridge_neck(body, join, join - NECK_BRIDGE, axis, first_swim_vertex)
    covered = set(range(first_swim, len(body.data.polygons)))
    report[key]['dressedSkinVerts'] = int(sum(flag))
    report[key]['asGenerated'] = 'whole'
    return garments, covered, first_swim_vertex


def shoulder_top(obj, x, y):
    """The top of the shoulder at (x, y): the highest surface there that is
    neither head nor hair."""
    from mathutils.bvhtree import BVHTree
    own, cls = owners(obj), face_colours(obj)
    keep = [tuple(p.vertices) for p, o, c in zip(obj.data.polygons, own, cls) if o not in HEADS and c != 'hair']
    tree = BVHTree.FromPolygons([v.co.copy() for v in obj.data.vertices], keep)
    hit = tree.ray_cast(Vector((x, y, .45)), Vector((0, 0, -1)), 2.0)[0]
    return hit.z if hit else None


def raise_shoulders(arm, tee, swim, chin, top=None):
    """Lift the swimsuit body's shoulders to her generated ones. The base
    generation's shoulders slope 7 cm lower beside the neck (10 cm in front)
    than the dressed one's, so under her generated head its neck ran long
    (the owner, 2026-10-01: "abnormally long, not like the male neck"). The
    lift is whole where the neck meets the shoulders and fades out down the
    chest and along the arms; up the neck it fades to nothing under the chin,
    so the neck is as long as it is in her clothes."""
    n = arm.data.bones['neck'].head_local
    gaps = []
    for side in (-1, 1):
        for dy in (0.0, -.03):
            # Her generated shoulders are the tee's: there is no skin under it.
            a, b = shoulder_top(tee, n.x + side * .09, n.y + dy), shoulder_top(swim, n.x + side * .09, n.y + dy)
            if a is not None and b is not None:
                gaps.append(a - b)
    if not gaps:
        return 0.0
    junction = n.z - .065           # where the base's neck meets its shoulders
    # To her collar line, not to the tee's top: the tee's rib stands above the
    # shoulder, and lifted to it (8.6 cm) she had no neck at all. At the
    # collar the swimsuit shows as much neck as her clothes do.
    collar = n.z - .012
    lift = min(max(collar - junction, 0.0), max(float(np.median(gaps)), 0.0), .1)
    low = junction - .11            # nothing moves below the chest
    for v in swim.data.vertices:
        z, r = v.co.z, math.hypot(v.co.x - n.x, v.co.y - n.y)
        if z <= low:
            continue
        roof = chin if top is None else top
        up = smoothstep(low, junction, z) if z < junction else max(0.0, (roof - z) / max(roof - junction, 1e-3))
        out = 1.0 - smoothstep(.12, .2, r)
        # Front and sides only, where the gap was measured: the back was
        # already high enough, and lifted it stood out behind the neck under
        # the hair as a ledge (the owner, 2026-10-01: "sticking out").
        back = 1.0 - smoothstep(n.y, n.y + .05, v.co.y)
        v.co.z += lift * up * out * back
    swim.data.update()
    return round(lift, 3)


def taper_neck(arm, dressed, swim, chin):
    """Narrow the top of the swimsuit body's neck to her generated neck's
    width where the two meet under the chin. The base's neck is wider, and
    met there it made a step with a line round it and an edge standing out
    at the side (the owner, 2026-10-01). Blended in over the last 3 cm, a
    touch inside hers so its cut edge stays hidden."""
    a = arm.data.bones['neck'].head_local
    def widths(obj, lo, hi):
        V = np.array([v.co[:] for v in obj.data.vertices])
        sel = V[(V[:, 2] > lo) & (V[:, 2] < hi) & (np.hypot(V[:, 0] - a.x, V[:, 1] - a.y) < .08)]
        if len(sel) < 4:
            return None
        return float(np.median(np.abs(sel[:, 0] - a.x))), float(np.median(np.abs(sel[:, 1] - a.y)))
    own, cls = owners(dressed), face_colours(dressed)
    skin = {i for p, c in zip(dressed.data.polygons, cls) if c == 'skin' for i in p.vertices}
    V = np.array([dressed.data.vertices[i].co[:] for i in skin]) if skin else np.zeros((0, 3))
    sel = V[(V[:, 2] > chin - .005) & (V[:, 2] < chin + .02) & (np.hypot(V[:, 0] - a.x, V[:, 1] - a.y) < .08)] if len(V) else V
    if len(sel) < 4:
        return None
    want = (float(np.median(np.abs(sel[:, 0] - a.x))) * .96, float(np.median(np.abs(sel[:, 1] - a.y))) * .96)
    have = widths(swim, chin - .015, chin + .005)
    if not have:
        return None
    sx, sy = min(1.0, want[0] / max(have[0], 1e-4)), min(1.0, want[1] / max(have[1], 1e-4))
    for v in swim.data.vertices:
        c = v.co
        if math.hypot(c.x - a.x, c.y - a.y) > .09 or c.z < chin - .03:
            continue
        w = smoothstep(chin - .03, chin - .005, c.z)
        c.x = a.x + (c.x - a.x) * (1 + (sx - 1) * w)
        c.y = a.y + (c.y - a.y) * (1 + (sy - 1) * w)
    swim.data.update()
    return [round(sx, 3), round(sy, 3)]


def tint_swim_skin(body, atlas):
    """The swimsuit body's skin in her generated skin's colour. The two
    generations' skins differ a shade (the base's bluer), which drew a line
    where the base's neck meets her head."""
    origin = np.zeros(len(body.data.polygons), np.int32)
    body.data.attributes['swim_origin'].data.foreach_get('value', origin)
    tones = {}
    for side in (0, 1):
        faces = [i for i in range(len(origin)) if origin[i] == side]
        pix = list(_face_pixels(body, atlas, faces))
        rows = np.concatenate([r for _, r, _, _ in pix]); cols = np.concatenate([c for _, _, c, _ in pix])
        rgb = atlas[rows, cols, :3]
        skin = colour_class(rgb) == 'skin'
        tones[side] = (rows[skin], cols[skin], np.median(rgb[skin], axis=0))
    rows, cols, base = tones[1]
    gain = tones[0][2] / np.maximum(base, 1e-3)
    atlas[rows, cols, :3] = np.clip(atlas[rows, cols, :3] * gain, 0, 1)
    return [round(float(g), 3) for g in gain]


def clean_swim_neck(arm, body, atlas, join=None):
    """The swim body's neck in plain skin. Its generation painted the shadow
    of its own bob on its nape, which now showed as dark lines under her
    hair. Anything on its neck above the shoulders that is not skin takes the
    median of that skin."""
    origin = np.zeros(len(body.data.polygons), np.int32)
    body.data.attributes['swim_origin'].data.foreach_get('value', origin)
    shoulder = min(arm.data.bones[s + 'Arm'].head_local.z for s in ('Left', 'Right'))
    nax = Vector(arm.data.bones['neck'].head_local[:2])
    faces = [p.index for p in body.data.polygons if origin[p.index] and p.center.z > shoulder - .01
             and (Vector(p.center[:2]) - nax).length < .075]
    pix = list(_face_pixels(body, atlas, faces))
    if not pix:
        return 0
    rows = np.concatenate([r for _, r, _, _ in pix]); cols = np.concatenate([c for _, _, c, _ in pix])
    rgb = atlas[rows, cols, :3]
    skin = colour_class(rgb) == 'skin'
    if skin.sum() < 20:
        return 0
    tone = np.median(rgb[skin], axis=0)
    atlas[rows[~skin], cols[~skin], :3] = tone
    changed = int((~skin).sum())
    # The last few centimetres under her neck, the band included, in one
    # flat tone: the swim generation's neck was dotted there (its own
    # collar's shading), and the dots ringed her neck at the join.
    if join is not None:
        top = [p.index for p in body.data.polygons if origin[p.index] and p.center.z > join - .04
               and (Vector(p.center[:2]) - nax).length < .075]
        for _, r, c, _ in _face_pixels(body, atlas, top):
            atlas[r, c, :3] = tone
            changed += len(r)
    return changed


def swim_flags(body):
    """Her `_dressed` vertex flag from the `swim_hide` faces: the edges where
    a hidden face meets a shown one are split first, so no vertex is shared
    and the shader's cut follows the faces exactly. Shared, the flag blended
    across every boundary triangle and left a ragged, half-drawn ring at her
    neck and shoulders in the swimsuit."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    layer = bm.faces.layers.int.get('swim_hide')
    seam = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0][layer] != e.link_faces[1][layer]]
    bmesh.ops.split_edges(bm, edges=seam)
    flag = bm.verts.layers.float.get('_dressed')
    for v in bm.verts:
        v[flag] = 1.0 if v.link_faces and all(f[layer] for f in v.link_faces) else 0.0
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    return len(seam)


def clean_neck_edge(arm, body, atlas):
    """Her generated neck ends where its collar began, and its last row of
    texels is the collar's pale inside: hidden by the tee, it showed as white
    flecks round her neck in the swimsuit. Pale, unsaturated texels on her
    own neck, below the jaw, take the median of her skin."""
    origin = np.zeros(len(body.data.polygons), np.int32)
    body.data.attributes['swim_origin'].data.foreach_get('value', origin)
    jaw = arm.data.bones['Head'].head_local.z
    faces = [p.index for p, o in zip(body.data.polygons, owners(body))
             if not origin[p.index] and (o == 'neck' or o in HEADS) and p.center.z < jaw]
    pix = list(_face_pixels(body, atlas, faces))
    if not pix:
        return 0
    rows = np.concatenate([r for _, r, _, _ in pix])
    cols = np.concatenate([c for _, _, c, _ in pix])
    rgb = atlas[rows, cols, :3]
    y = lum(rgb)
    chroma = rgb.max(axis=-1) - rgb.min(axis=-1)
    skin = (colour_class(rgb) == 'skin')
    pale = (y > .7) & (chroma < .1) & ~skin
    if skin.sum() < 20:
        return 0
    atlas[rows[pale], cols[pale], :3] = np.median(rgb[skin], axis=0)
    return int(pale.sum())


# ------------------------------------------------------------------ build

def swim_model(key, arm, body, meta):
    """Her swimsuit: the swim generation (the owner's file, job b32d2eb7)
    exactly as generated, its 我的檔期 cap included, as a model of its own
    that the game swaps in for the dressed one. Only what every avatar gets:
    the fused fingers rebuilt with bones, the texture laid out with margins,
    the hair rigid to the head, and the dye mask (skin, hair, swimsuit)."""
    report.setdefault(key, {})['fingers'] = rebuild_fingers(arm, body)
    body['componentId'] = 'body'
    atlas = unify_texture(key, body)
    everything = coverage_all([body], *atlas.shape[1::-1])
    finish_texture(key, body, atlas, everything)
    report[key]['smoothSkin'] = smooth_skin(body)
    frame = head_frame(arm, body, 'female')
    report[key]['hairRigid'] = hair_rigid(arm, body)
    report[key]['dye'], native, reference = dye_mask(key, body, {}, atlas, frame)
    body.parent = arm
    export(key, arm, [body])
    mouth_z = frame['chin'] + .36 * (frame['eye'] - frame['chin'])
    meta[key] = {'sex': 'female', 'mouth': [frame['x'], mouth_z, -frame['faceFront']], 'native': native,
                 'reference': reference}


def build(stages):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    placed, meta = {}, {}
    mark = cap_mark()
    art = {name: load_rgba(os.path.join(PRINTS, name + '.png')) for name in
           ('schedule-front', 'schedule-back', 'schedule-tag', 'house-front', 'bros-back', 'vest-front', 'vest-back')}
    # AVATAR_ONLY=female builds one avatar (trial builds only: avatars.json
    # then lists just it); AVATAR_STOP=dressed saves the scene once it is
    # dressed and stops, for working on one step against it.
    only = set(filter(None, os.environ.get('AVATAR_ONLY', '').split(',')))
    for key, base_stem, clothed_stem in BODIES:
        sex = 'female' if key.startswith('female') else key
        whole = key == 'female' and FEMALE_WHOLE
        arm, body = import_source(clothed_stem if whole else base_stem)
        arm.name, body.name = key + '-rig', key + '-body'
        strip_emission(body)
        normalise(key, arm, body, sex, False, placed)
        if only and key not in only:
            # Measured all the same: the other body is scaled against it.
            for o in (arm, body):
                bpy.data.objects.remove(o, do_unlink=True)
            continue
        weld(body)
        if key == 'female-swim':
            swim_model(key, arm, body, meta)
            for o in (arm, body):
                o.name = 'done-' + o.name
            continue
        her_covered = None
        if whole:
            garments, her_covered, _ = dressed_whole(key, arm, body, sex, placed, base_stem)
        elif not (sex == 'male' and MALE_HANDS_AS_GENERATED):
            report.setdefault(key, {})['fingers'] = rebuild_fingers(arm, body)
        if sex == 'male' and not MALE_HANDS_AS_GENERATED:
            report[key]['palm'] = rebuild_palm(arm, body)
        # The generated bodies stand as generated (the owner, September 30:
        # "the models generated from Higgsfield look just fine; integrate them
        # without glitches"). Reshaping the face, the toes, the neck and the
        # skin is off; each can be switched back on for comparison.
        reshape = set(os.environ.get('AVATAR_RESHAPE', '').split(','))
        if 'toes' in reshape:
            report[key]['toes'] = sculpt_toes(arm, body)
        if 'face' in reshape:
            report[key]['roundedFace'] = round_face(arm, body) if sex == 'male' else flatten_face(arm, body)
        if 'neck' in reshape:
            report[key]['neckSmoothed'] = smooth_neck(arm, body)
        # Off: relaxed, his legs came out lumpy (September 30). The flat tone
        # and the smooth shading normals are what the owner kept.
        if os.environ.get('AVATAR_RELAX_SKIN', '0') == '1':
            report[key]['relaxedSkin'] = relax_skin(body)
        if not whole:
            carm, cbody = import_source(clothed_stem)
            carm.name, cbody.name = key + '-clothed-rig', key + '-clothed-body'
            strip_emission(cbody)
            normalise(key + '-clothed', carm, cbody, sex, True, placed)
            weld(cbody)
            report.setdefault(key, {})['splitLegs'] = split_legs(arm, body)
            garments = dress_as_generated(arm, body, carm, cbody, sex) if sex == 'female' or MALE_GENERATED_OUTFIT else dress(arm, body, carm, cbody, sex)
            for o in (cbody, carm):
                bpy.data.objects.remove(o, do_unlink=True)
        body['componentId'] = 'body'
        if os.environ.get('AVATAR_STOP') == 'dressed':
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, key + '-dressed.blend'))
            return
        if sex == 'female' and not whole and not FEMALE_GENERATED_TEE:
            report[key]['bob'] = build_bob(arm, body, key)
        bones = {n: arm.data.bones[n].head_local.copy() for n in ('Hips', 'LeftArm', 'neck', 'Head')}
        # Where the tee body meets its hem band, as HEM was on the clothed model.
        tee_verts = np.array([v.co[:] for v in garments['tee'].data.vertices])
        hem = float(np.percentile(tee_verts[:, 2], 2)) + (.075 if sex == 'male' else .085)
        collar = bones['neck'].z - .012
        chest = bones['LeftArm'].z - .085
        join_parts(body, garments)
        atlas = unify_texture(key, body)
        garments = split_parts(body, key)
        if 'skin' in reshape:
            report[key]['skin'] = clean_skin(body, atlas)
        if sex != 'female':
            report[key]['collarTexels'] = clean_collar(garments['tee'], arm, atlas)
        elif not whole:
            report[key]['teeSkin'] = clean_tee_skin(garments['tee'], atlas)
        if whole and not FEMALE_SWIM_MODEL:
            report[key]['neckEdge'] = clean_neck_edge(arm, body, atlas)
            report[key]['swimSkinTone'] = tint_swim_skin(body, atlas)
            report[key]['swimNeckClean'] = clean_swim_neck(arm, body, atlas, report[key].get('neckJoin'))

        if sex == 'female' and not whole and not FEMALE_GENERATED_TEE:
            report[key]['face'] = (paint_face(arm, body, atlas) if 'face' in reshape
                                   else paint_sheet_face(arm, body, atlas, report[key]['bob']['fringe']))
        # Hers: the swimsuit's body is under the clothes, all of it.
        covered = her_covered if whole else covered_faces(body, garments, report[body.name].get('collar'))
        mark_covered(body, covered)
        report[key].update(hem=round(hem, 3), covered=len(covered))
        tee = garments['tee']
        report[key]['teeSlivers'] = tee_slivers(tee, atlas, -9, 9, 9)
        if sex == 'male':
            # The generated lettering, front and back, relative to the neck.
            n = bones['neck'].z
            atlas, zoned = erase_lettering(tee, atlas, [('front', n - .217, n - .032), ('back', n - .267, n - .032)])
            report[key]['erasedTexels'] = zoned
        if sex == 'male' and MALE_TEE_CHARCOAL:
            report[key]['charcoalTee'] = charcoal_tee(tee, atlas)
        everything = coverage_all([body, tee, garments['trousers'], garments['shoes']], *atlas.shape[1::-1])
        material = finish_texture(key, body, atlas, everything)
        for g in garments.values():
            g.data.materials.clear()
            g.data.materials.append(material)
        report[key]['smoothSkin'] = smooth_skin(body)
        narrow = .9 if sex == 'female' else 1
        parts = [body] + [garments[n] for n in GARMENTS]
        prints = [
            decal(tee, key + '-schedule-front', art['schedule-front'], 'front', 0, chest, .19 * narrow),
            decal(tee, key + '-schedule-back', art['schedule-back'], 'back', 0, chest - .04, .215 * narrow),
            decal(tee, key + '-schedule-tag', art['schedule-tag'], 'front', -.12 * narrow, hem + .035, .026),
            decal(tee, key + '-house-front', art['house-front'], 'front', .066 * narrow, chest + .03, .05),
            decal(tee, key + '-bros-back', art['bros-back'], 'back', 0, chest - .005, .25 * narrow),
        ]
        for obj, component in zip(prints, ('print-schedule-front', 'print-schedule-back', 'print-schedule-tag', 'print-house-front', 'print-bros-back')):
            obj['componentId'] = component
        layout = VestLayout(hem, collar, bones['LeftArm'], narrow)
        cy = vest_texture(key, tee, atlas, layout, everything)
        vest = build_vest(arm, tee, layout, key, cy)
        px0, px1, pz0, pz1 = layout.panel
        vest_prints = [decal(tee, key + '-vest-front', art['vest-front'], 'front', layout.chest_x, layout.chest_top + .022, .03),
                       decal(tee, key + '-vest-back', art['vest-back'], 'back', 0, (pz0 + pz1) / 2 + .008, (px1 - px0) * .86)]
        vest_prints[0]['componentId'], vest_prints[1]['componentId'] = 'print-vest-front', 'print-vest-back'
        parts += prints + [vest] + vest_prints
        frame = head_frame(arm, body, sex)
        fit = fit_cap(frame, sex)
        mouth_z = frame['chin'] + .36 * (frame['eye'] - frame['chin'])
        parts += [build_cap(arm, fit, key), build_cap_mark(arm, fit, key, mark)]
        report[key]['headRigid'] = head_rigid(body, fit)
        report[key]['hairRigid'] = hair_rigid(arm, body)
        report[key]['capHair'] = cap_hair_key(body, fit, hug=sex == 'male')
        report[key]['dye'], native, reference = dye_mask(key, body, garments, atlas, frame)
        if whole and not FEMALE_SWIM_MODEL:
            report[key]['swimSeam'] = swim_flags(body)
        for obj in parts:
            obj.parent = arm
        export(key, arm, parts)
        report[key].update({k: (list(v) if isinstance(v, Vector) else v) for k, v in placed[key].items()})
        # glTF is Y-up: Blender (x, y, z) arrives as (x, z, -y).
        meta[key] = {'sex': sex, 'mouth': [frame['x'], mouth_z, -frame['faceFront']], 'native': native, 'reference': reference,
                     'cap': {'band': fit['origin'].z, 'top': fit['origin'].z + fit['H']}}
        # Out of the scene, so the next body's lookups by name cannot find them.
        for o in [arm] + parts:
            o.name = 'done-' + o.name
    with open(os.path.join(OUT, 'avatars.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, 'avatars.blend'))
    print('BUILT', json.dumps(report, indent=1))


# Run by Blender; the band's build imports this file for its steps instead.
if __name__ == '__main__':
    build(set(ARGS[1:]) if len(ARGS) > 1 else {'all'})
