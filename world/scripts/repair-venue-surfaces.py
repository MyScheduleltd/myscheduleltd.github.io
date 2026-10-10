"""Local, selective repairs to Meshy surfaces. Raw downloads stay untouched.
Run Blender -b --factory-startup -P scripts/repair-venue-surfaces.py.
No decimation, texture resizing, or replacement of the character's rig.
"""
import bpy,bmesh,json,hashlib,numpy as np
from pathlib import Path
from mathutils import Vector
WORLD=Path(__file__).resolve().parent.parent
RAW=WORLD/'.artifacts/venue-repair-20261009'
OUT=WORLD/'src/assets/venue-scenery'
REPORT={}
def solid(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.9
 return m
def cube(name,at,size,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=at);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bevel=o.modifiers.new('small edge finish','BEVEL');bevel.width=.004;bevel.segments=1
 bpy.ops.object.modifier_apply(modifier=bevel.name);o.data.materials.append(mat);return o
def export(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
 b=(OUT/f'{name}.glb').read_bytes();REPORT[name].update(bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
# Retain the generated booth, planarize plaster relief and rebuild its malformed cabinet.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(RAW/'box-office.glb'))
o=next(o for o in bpy.data.objects if o.type=='MESH');mat=o.data.materials[0]
im=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE'and n.label=='BASE COLOR')
pix=np.array(im.pixels[:]).reshape(im.size[1],im.size[0],4);uv=o.data.uv_layers.active.data
plaster=solid('GEO-clean warm plaster',(.64,.61,.53));o.data.materials.append(plaster)
removed=[f.index for f in o.data.polygons if f.center.z<.53]
bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.faces[i]for i in removed],context='FACES');bm.to_mesh(o.data);bm.free();o.data.update()
# Exact, closed panels replace the defective generated plaster and poster relief.
panels=[cube('GEO-left booth wall',(-.762,0,-.215),(.075,1.6,1.47),plaster),
 cube('GEO-back booth wall',(0,.765,-.215),(1.56,.075,1.47),plaster),
 cube('GEO-front service wall',(0,-.765,-.685),(1.56,.075,.53),plaster),
 cube('GEO-service counter',(0,-.79,-.401),(1.44,.18,.045),plaster),
 cube('GEO-door front pier',(.762,-.645,-.215),(.075,.23,1.47),plaster),
 cube('GEO-door rear pier',(.762,.52,-.215),(.075,.50,1.47),plaster),
 cube('GEO-door lintel',(.762,-.13,.408),(.075,.80,.224),plaster)]
cabinet=[cube('GEO-ticket cabinet case',(0,.46,-.679),(.75,.42,.54),plaster),cube('GEO-ticket cabinet top',(0,.46,-.392),(.79,.46,.034),plaster)]
trim=solid('GEO-cabinet dark teal',(.04,.065,.059))
for x in [-.186,.186]:
 cabinet.append(cube('GEO-cabinet door',(x,.241,-.674),(.362,.018,.49),plaster))
 cabinet.append(cube('GEO-cabinet pull',(x*.24,.225,-.60),(.018,.028,.08),trim))
frames=[]
frame_mat=solid('GEO-booth charcoal frame',(.015,.019,.018))
for x in [-.775,.775]:
 for y in [-.785,.785]:frames.append(cube('GEO-booth post',(x,y,-.215),(.09,.09,1.47),frame_mat))
frames.append(cube('GEO-service header',(0,-.785,.469),(1.64,.09,.115),frame_mat))
REPORT['box-office']={'replaced_plaster_and_cabinet_faces':len(removed),'closed_panels':len(panels)}
export('box-office',[o]+panels+cabinet+frames)
# Keep character topology, face/hair/shoe maps and skin weights. Correct sleeve
# atlas contamination with a dedicated shirt surface, trousers with their own cloth.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(RAW/'attendant.glb'))
o=next(o for o in bpy.data.objects if o.type=='MESH'and len(o.data.materials)>0)
shirt=solid('GEO-ivory staff shirt',(.83,.80,.68));trousers=solid('GEO-charcoal staff trousers',(.095,.099,.102))
o.data.materials.append(shirt);o.data.materials.append(trousers);counts={'shirt':0,'trousers':0}
im=next(n.image for n in o.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE'and n.label=='BASE COLOR')
pix=np.array(im.pixels[:]).reshape(im.size[1],im.size[0],4);uv=o.data.uv_layers.active.data
for f in o.data.polygons:
 c=sum((o.matrix_world@o.data.vertices[i].co for i in f.vertices),Vector())/len(f.vertices)
 if abs(c.x)>.34 and 1.89<c.z<2.33:
  f.material_index=1;counts['shirt']+=1
 elif abs(c.x)<.54 and .29<c.z<1.78:
  t=sum((uv[l].uv for l in f.loop_indices),Vector((0,0)))/len(f.loop_indices)
  rgb=pix[int(t.y*(im.size[1]-1)),int(t.x*(im.size[0]-1)),:3]
  if rgb[0]>rgb[1]*1.8 and rgb[0]>.015:continue # Keep the burgundy vest hem.
  f.material_index=2;counts['trousers']+=1
REPORT['attendant']=counts
export('attendant',[o,o.parent])
(WORLD/'.artifacts/venue-finish-20261009/surface-repair.json').write_text(json.dumps(REPORT,indent=2))
