"""Refine the Higgsfield (Meshy 7) statue for the web, headless Blender 5.2:

  Blender -b --factory-startup --python refine_statue.py -- <raw.glb> <colour-reference.glb> <out.glb> <report.json> [targetTriangles]

The owner asked (2026-10-22) for a statue that looks like the reference image,
"web game ready for three.js", refined in Blender, about 8,000 triangles.

1. Weld exact duplicate vertices and drop loose fragments the generator left.
2. Collapse-decimate a copy to the target with the head, hands and Crocs held
   at higher density (a vertex-group weight on the collapse cost): they carry
   the likeness and the joke, the tee and shorts are broad planes. The
   generator's UV layout is cut into so many charts that collapse refuses to
   cross them (it stalls near 16,600), so the copy drops its UVs, is unwrapped
   afresh, and the generated colour is baked onto it from the full mesh.
3. Warm the baked colour to the square's established gold: the mean colour
   of the previously installed statue's texture, by a per-channel gain, so the
   new figure sits with the plinth and the temple statue.
4. One mesh, one material (base colour only, metallic 0, roughness 0.8), no
   normal, PBR or emissive maps, no rig or animation. Shared vertices: the
   runtime draws it flat-shaded, so stored normals need not be split.
"""
import bpy, bmesh, sys, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
raw, colour_ref, out, report_path = argv[:4]
target = int(argv[4]) if len(argv) > 4 else 8000
# The likeness's vertex weight: 1 is the clothes' rate, lower keeps more
# detail. Never 0, which Blender treats as never collapsing at all.
hold = float(argv[5]) if len(argv) > 5 else 0.5

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before and o.type == 'MESH']

def texture_mean(image):
    px = image.pixels[:]
    n = len(px) // 4
    step = max(1, n // 200000)
    sums = [0.0, 0.0, 0.0]; count = 0
    for i in range(0, n, step):
        a = px[i * 4 + 3]
        if a < 0.5: continue
        sums[0] += px[i * 4]; sums[1] += px[i * 4 + 1]; sums[2] += px[i * 4 + 2]; count += 1
    return [s / count for s in sums]

bpy.ops.wm.read_factory_settings(use_empty=True)
# The gold the square already uses, from the installed statue's own texture.
ref_objects = import_glb(colour_ref)
ref_images = [n.image for o in ref_objects for s in o.material_slots if s.material and s.material.node_tree
              for n in s.material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
ref_mean = texture_mean(ref_images[0])
for o in ref_objects: bpy.data.objects.remove(o, do_unlink=True)

objects = import_glb(raw)
assert len(objects) == 1, f'expected one generated mesh, got {len(objects)}'
obj = objects[0]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
# Apply the import transform so the exported mesh is in plain metres, Y up.
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
mesh = obj.data
before_triangles = sum(len(p.vertices) - 2 for p in mesh.polygons)

# 1. Clean.
bm = bmesh.new(); bm.from_mesh(mesh)
merged_before = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
merged = merged_before - len(bm.verts)
# Loose islands far smaller than the figure are generator debris.
bm.verts.ensure_lookup_table()
islands, seen = [], set()
for face in bm.faces:
    if face.index in seen: continue
    stack, island = [face], []
    seen.add(face.index)
    while stack:
        f = stack.pop(); island.append(f)
        for e in f.edges:
            for g in e.link_faces:
                if g.index not in seen: seen.add(g.index); stack.append(g)
    islands.append(island)
islands.sort(key=len, reverse=True)
debris = [f for island in islands[1:] if len(island) < 30 for f in island]
bmesh.ops.delete(bm, geom=debris, context='FACES')
bm.to_mesh(mesh); bm.free()

# The generated texture's own mean, measured over the whole atlas: the baked
# map has empty space between its islands, which would skew a mean of it.
raw_mean = texture_mean(next(n.image for s in obj.material_slots for n in s.material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image))

# 2. Decimate a copy, holding the likeness at higher density.
source = obj
obj = source.copy(); obj.data = source.data.copy(); bpy.context.collection.objects.link(obj)
mesh = obj.data
while mesh.uv_layers: mesh.uv_layers.remove(mesh.uv_layers[0])
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
pts = [obj.matrix_world @ v.co for v in mesh.vertices]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
size = hi - lo; cx = (lo.x + hi.x) / 2
group = obj.vertex_groups.new(name='likeness')
held = 0
for v in mesh.vertices:
    p = obj.matrix_world @ v.co
    h = (p.z - lo.z) / size.z
    head = h > 0.80 and abs(p.x - cx) < size.x * 0.13
    hands = abs(p.x - cx) > size.x * 0.40 and h > 0.80
    feet = h < 0.20
    if head or hands or feet: held += 1
    group.add([v.index], hold if (head or hands or feet) else 1.0, 'REPLACE')
current = sum(len(p.vertices) - 2 for p in mesh.polygons)
mod = obj.modifiers.new('decimate', 'DECIMATE')
mod.decimate_type = 'COLLAPSE'
mod.use_collapse_triangulate = True
mod.vertex_group = 'likeness'
mod.vertex_group_factor = 1.0
mod.invert_vertex_group = False
# Find the ratio that lands on the target (the held areas make it non-linear).
lo_r, hi_r, ratio = 0.005, 1.0, target / current
for _ in range(14):
    mod.ratio = ratio
    deps = bpy.context.evaluated_depsgraph_get(); deps.update()
    tri = len(obj.evaluated_get(deps).to_mesh().polygons)
    obj.evaluated_get(deps).to_mesh_clear()
    if abs(tri - target) < target * 0.02: break
    if tri > target: hi_r = ratio
    else: lo_r = ratio
    ratio = (lo_r + hi_r) / 2
bpy.ops.object.modifier_apply(modifier='decimate')
obj.vertex_groups.clear()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
after_triangles = len(mesh.polygons)
for p in mesh.polygons: p.use_smooth = True

# Fresh UVs, then bake the generated colour across from the full mesh.
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
edge = int(argv[6]) if len(argv) > 6 else 2048
baked = bpy.data.images.new('victory-statue-colour', edge, edge, alpha=False)
material = bpy.data.materials.new('victory-statue-gold'); material.use_nodes = True
mesh.materials.clear(); mesh.materials.append(material)
nodes = material.node_tree.nodes
target_node = nodes.new('ShaderNodeTexImage'); target_node.image = baked
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
material.node_tree.links.new(target_node.outputs['Color'], bsdf.inputs['Base Color'])
nodes.active = target_node
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 1
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = max(size) * 0.02
scene.render.bake.max_ray_distance = max(size) * 0.05
scene.render.bake.margin = 8
bpy.ops.object.select_all(action='DESELECT'); source.select_set(True); obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True)
bpy.data.objects.remove(source, do_unlink=True)
image = baked

# 3. Warm the baked colour to the square's gold.
gain = [min(1.6, max(0.6, r / max(1e-4, m))) for r, m in zip(ref_mean, raw_mean)]
px = list(image.pixels[:])
for i in range(0, len(px), 4):
    px[i] = min(1.0, px[i] * gain[0]); px[i + 1] = min(1.0, px[i + 1] * gain[1]); px[i + 2] = min(1.0, px[i + 2] * gain[2])
image.pixels[:] = px
image.update()
image.file_format = 'PNG'
image.pack()

# 4. One base-colour map; every other map and factor reset.
for socket in ('Normal', 'Metallic', 'Roughness', 'Emission Color'):
    for link in list(bsdf.inputs[socket].links): material.node_tree.links.remove(link)
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Roughness'].default_value = 0.8
for n in list(nodes):
    if n.type == 'TEX_IMAGE' and n.image != image: nodes.remove(n)
for extra in [m for m in bpy.data.materials if m != material]: bpy.data.materials.remove(extra)
obj.name = 'victory-statue'; mesh.name = 'victory-statue'; material.name = 'victory-statue-gold'

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_yup=True,
                          export_apply=True, export_normals=True, export_texcoords=True,
                          export_materials='EXPORT', export_image_format='AUTO',
                          export_animations=False, export_skins=False, export_morph=False,
                          export_cameras=False, export_lights=False, export_extras=False,
                          export_tangents=False, export_vertex_color='NONE')
report = {'raw': raw, 'out': out, 'trianglesBefore': before_triangles, 'trianglesAfter': after_triangles,
          'mergedVertices': merged, 'debrisFaces': len(debris), 'islands': len(islands), 'heldVertices': held,
          'decimateRatio': ratio, 'holdFactor': hold, 'vertices': len(mesh.vertices), 'colour': {'reference': ref_mean, 'raw': raw_mean, 'gain': gain},
          'image': {'name': image.name, 'size': list(image.size)}, 'size': list(size)}
json.dump(report, open(report_path, 'w'), indent=1)
print('REPORT', json.dumps(report))
