"""Redo the hair dye's mask round the eyes of an installed avatar, with the
build's own eye_texels (see prepare-higgsfield-avatars.py): the eyes keep
their colours whatever the hair is dyed, and the fringe takes the dye.

The build is not deterministic, so a reviewed model is fixed in place rather
than rebuilt. Run:
  AVATAR=female /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/fix-eye-dye.py
"""
import bpy, os, sys, importlib.util
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('build', os.path.join(HERE, 'prepare-higgsfield-avatars.py'))
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
key = os.environ.get('AVATAR', 'female')
assets = os.path.join(HERE, '..', 'src', 'assets', 'avatars')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(assets, key + '.glb'))
body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.get('componentId') == 'body')
# The rest frame the build measures in: applied, so texel points are in metres.
bpy.context.view_layer.objects.active = body
body.data.transform(body.matrix_world)
body.matrix_world.identity()
image = next(n.image for m in body.data.materials for n in m.node_tree.nodes if n.type == 'TEX_IMAGE')
w, h = image.size
atlas = np.array(image.pixels[:], np.float32).reshape(h, w, 4)
dye_image = bpy.data.images.load(os.path.join(assets, key + '-dye.png'))
dye = np.array(dye_image.pixels[:], np.float32).reshape(h, w, 4)
heads = [p.index for p, o in zip(body.data.polygons, build.owners(body)) if o in build.HEADS]
eyes = build.eye_texels(body, heads, atlas)
covered = build.coverage(body, w, h)
head = np.zeros((h, w), bool)
for rows, cols, _ in build.texels(body, heads, w, h):
    head[rows, cols] = True
rgb = atlas[..., :3]
r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
y = build.lum(rgb)
# The build's hair rule, with the new eyes.
lit = build.colour_class(rgb) == 'skin'
shaded = (r_ > g_ * 1.03) & (g_ > b_ * 1.02) & (r_ - b_ > .1) & (y > .45)
cream = head & (g_ - b_ > (r_ - g_) * 1.15)
skin = (lit | shaded) & head & ~cream
white = (y > .62) & (rgb.max(axis=-1) - rgb.min(axis=-1) < .25)
hair = head & ~skin & (y > .06) & ~white & ~cream & ~eyes
before = int((dye[..., 1] > .5)[head].sum())
weights = dye[..., :3].copy()
weights[..., 1][head] = hair[head]
weights[..., 0][eyes] = 0
others = [o for o in bpy.data.objects if o.type == 'MESH' and o is not body and o.data.uv_layers]
allc = covered.copy()
for o in others:
    if o.data.materials and any(n.type == 'TEX_IMAGE' and n.image == image for m in o.data.materials if m and m.node_tree for n in m.node_tree.nodes):
        allc |= build.coverage(o, w, h)
weights = build.pad(np.where(allc[..., None], weights, 0), allc)
bpy.context.scene.render.image_settings.compression = 100
build.new_image(key + '-dye-fixed', weights, os.path.join(assets, key + '-dye.png'), 'PNG')
print('EYE-DYE', key, {'eyeTexels': int(eyes.sum()), 'hairBefore': before, 'hairAfter': int(hair[head].sum())})
