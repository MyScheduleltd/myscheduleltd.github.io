"""Headless Blender inspection of a statue GLB: full figure from four sides and
a close face view, textured, flat-shaded, studio light.

  Blender -b --factory-startup --python render_views.py -- <glb> <outdir> <tag> [faceYaw]

`faceYaw` (degrees) turns the cameras if the model's face is not toward the
glTF +Z axis (Blender -Y). Prints REPORT with bounds and triangle counts.
"""
import bpy, sys, os, json, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
glb, out, tag = argv[0], argv[1], argv[2]
yaw = math.radians(float(argv[3])) if len(argv) > 3 else 0.0
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
deps = bpy.context.evaluated_depsgraph_get()
pts = []
tris = 0
for o in meshes:
    m = o.evaluated_get(deps).to_mesh()
    m.calc_loop_triangles()
    tris += len(m.loop_triangles)
    pts += [o.matrix_world @ v.co for v in m.vertices]
    o.evaluated_get(deps).to_mesh_clear()
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
size = hi - lo
centre = (lo + hi) / 2
images = [{'name': i.name, 'size': list(i.size)} for i in bpy.data.images]
report = {'glb': glb, 'triangles': tris, 'meshes': len(meshes), 'materials': len(bpy.data.materials), 'images': images,
          'bounds': [list(lo), list(hi)], 'size': list(size)}

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x = 900; scene.render.resolution_y = 1100
scene.world = bpy.data.worlds.new('w'); scene.world.color = (0.86, 0.85, 0.82)
for o in meshes:
    for poly in o.data.polygons: poly.use_smooth = False
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
turn = Matrix.Rotation(yaw, 4, 'Z')

def shoot(name, direction, target, span):
    cam_data.ortho_scale = span
    d = (turn @ direction.to_4d()).to_3d().normalized()
    cam.location = target + d * (max(size) * 4)
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(out, f'{tag}-{name}.png')
    bpy.ops.render.render(write_still=True)

full = max(size.z, size.x) * 1.08
for name, direction in [('front', Vector((0, -1, 0))), ('three-quarter', Vector((0.72, -0.7, 0.08))),
                        ('side', Vector((1, 0, 0))), ('back', Vector((0, 1, 0)))]:
    shoot(name, direction, centre, full)
# The head: the top eighth of the figure, near the centre line (the arms are raised wide).
top = [p for p in pts if p.z > lo.z + size.z * 0.80 and abs(p.x - centre.x) < size.x * 0.12]
if top:
    hc = Vector((sum(p.x for p in top) / len(top), sum(p.y for p in top) / len(top), sum(p.z for p in top) / len(top)))
    shoot('face', Vector((0, -1, 0.05)), hc, size.z * 0.22)
    shoot('face-three-quarter', Vector((0.7, -0.7, 0.05)), hc, size.z * 0.22)
json.dump(report, open(os.path.join(out, f'{tag}-report.json'), 'w'), indent=1)
print('REPORT', json.dumps(report))
