"""Rebuild the reference character as clean articulated Blender geometry.
Source is read-only. Every exported part has closed surfaces and a single joint owner.
"""
import bpy,bmesh,os,json,math,sys,shutil,hashlib
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=ROOT+'/.artifacts/fbx-avatar/clean'
os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath='/Users/myscheduleai/Desktop/Michael/blender/myscheduleweb/avatars1.blend')
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
arm.animation_data_clear();arm.data.pose_position='REST'
for bone in arm.pose.bones:bone.matrix_basis.identity()
bpy.context.view_layer.update()
# Place hand hinges at the visible cuff seam, not above it inside the sleeve.
bpy.context.view_layer.objects.active=arm;arm.hide_set(False);arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for side in ['Left','Right']:
 hand=arm.data.edit_bones[side+'Hand'];forearm=arm.data.edit_bones[side+'ForeArm']
 world=arm.matrix_world@hand.head;world.z=-.19
 target=arm.matrix_world.inverted()@world;delta=target-hand.head
 hand.head=target;hand.tail+=delta;forearm.tail=target
bpy.ops.object.mode_set(mode='OBJECT');bpy.context.view_layer.update()
parts=[]
colours={'cream':(.70,.68,.63,1),'trim':(.46,.46,.43,1),'ink':(.027,.031,.040,1),'inklight':(.045,.05,.065,1),'skin':(.65,.43,.28,1),'red':(.38,.025,.025,1),'white':(.84,.82,.76,1),'metal':(.16,.18,.19,1)}
def material(name):
 existing=bpy.data.materials.get('FBX • '+name)
 if existing:return existing
 mat=bpy.data.materials.new('FBX • '+name);mat.use_nodes=True
 bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=1
 vertex=mat.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='Source colour';mat.node_tree.links.new(vertex.outputs['Color'],bsdf.inputs['Base Color'])
 return mat
materials={}
def finish(obj,name,bone,color=None):
 obj.name=name
 for m in list(obj.modifiers):obj.modifiers.remove(m)
 obj.vertex_groups.clear();vg=obj.vertex_groups.new(name=bone);vg.add(list(range(len(obj.data.vertices))),1,'REPLACE')
 mod=obj.modifiers.new('Joint ownership','ARMATURE');mod.object=arm
 key='head' if name=='head' else name
 if key not in materials:materials[key]=material(key)
 obj.data.materials.clear();obj.data.materials.append(materials[key])
 if color is not None:
  c=colours.get(color,color);attr=obj.data.color_attributes.get('Source colour') or obj.data.color_attributes.new(name='Source colour',type='FLOAT_COLOR',domain='CORNER')
  for item in attr.data:item.color=c
  obj.data.color_attributes.active_color=attr
 for poly in obj.data.polygons:poly.use_smooth=False
 obj.data.validate(clean_customdata=False);obj.data.update();parts.append(obj)
 return obj
# All generated rings have explicit end caps. Bevelled rectangles preserve the low-poly silhouette.
def ring(w,d,z,x=0,y=0):
 c=min(w,d)*.18
 return [(x+sx,y+sy,z) for sx,sy in [(-w/2+c,-d/2),(w/2-c,-d/2),(w/2,-d/2+c),(w/2,d/2-c),(w/2-c,d/2),(-w/2+c,d/2),(-w/2,d/2-c),(-w/2,-d/2+c)]]
def loft(name,rings,bone,color):
 verts=[]
 for z,w,d,x,y in rings:verts+=ring(w,d,z,x,y)
 faces=[tuple(range(7,-1,-1))]
 for n in range(len(rings)-1):
  for i in range(8):faces.append((n*8+i,n*8+(i+1)%8,(n+1)*8+(i+1)%8,(n+1)*8+i))
 faces.append(tuple(range((len(rings)-1)*8,len(rings)*8)))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
 return finish(obj,name,bone,color)
def box(name,center,size,bone,color,bevel=.004):
 bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('Finished edges','BEVEL');m.width=bevel;m.segments=1
  bpy.ops.object.modifier_apply(modifier=m.name)
 o.data.transform(o.matrix_world);o.matrix_world.identity()
 return finish(o,name,bone,color)
def beam(name,a,b,width,depth,bone,color):
 a,b=Vector(a),Vector(b);o=box(name,(0,0,0),(width,depth,(b-a).length),bone,color,min(width*.15,.003))
 q=Vector((0,0,1)).rotation_difference(b-a)
 for v in o.data.vertices:v.co=q@v.co+(a+b)/2
 return o
# Authored head, complete hair and removable cap. No cut fragments from the source.
def oval_loft(name,rings,bone,color,segments=12):
 verts=[]
 for z,w,d,x,y in rings:
  verts.extend([(x+w*.5*math.cos(i*math.tau/segments),y+d*.5*math.sin(i*math.tau/segments),z) for i in range(segments)])
 faces=[tuple(range(segments-1,-1,-1))]
 for j in range(len(rings)-1):
  for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
 faces.append(tuple(range((len(rings)-1)*segments,len(rings)*segments)))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 return finish(o,name,bone,color)
# Continuous rectangular webbing with a closed cross section at every bend.
def ribbon(name,points,normals,width,thickness,bone,color):
 verts=[]
 for i,p in enumerate(points):
  p=Vector(p);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
  n=Vector(normals[i]).normalized();w=t.normalized().cross(n).normalized()*width/2;n*=thickness/2
  verts.extend([p-w-n,p+w-n,p+w+n,p-w+n])
 faces=[(3,2,1,0)]
 for j in range(len(points)-1):
  for k in range(4):faces.append((4*j+k,4*j+(k+1)%4,4*(j+1)+(k+1)%4,4*(j+1)+k))
 faces.append(tuple(range(len(verts)-4,len(verts))))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 return finish(o,name,bone,color)
head=loft('head',[(.397,.18,.17,0,-.026),(.419,.277,.237,0,-.026),(.474,.324,.268,0,-.02),(.584,.335,.27,0,-.013),(.651,.285,.235,0,0)],'Head','skin')
for side in [-1,1]:
 box('hair-ear-'+str(side),(side*.169,-.005,.49),(.048,.06,.078),'Head','skin',.013)
 # Tall dark eyes, softened chin and a restrained low-poly face.
 box('hair-eye-'+str(side),(side*.077,-.159,.523),(.027,.007,.065),'Head','ink',.001)
 box('hair-brow-'+str(side),(side*.077,-.153,.571),(.037,.008,.009),'Head',(.065,.036,.024,1),.001)
box('hair-nose',(0,-.163,.477),(.014,.012,.018),'Head',(.68,.45,.30,1),.004)
box('hair-mouth',(0,-.15,.441),(.029,.003,.004),'Head',(.37,.18,.12,1),.001)
hair=(.060,.038,.026,1)
# A faceted scalp is concealed by staggered, overlapping locks, including the nape.
oval_loft('hair-crown',[(.56,.385,.335,0,.035),(.615,.425,.377,0,.025),(.66,.418,.366,0,.02),(.72,.353,.305,0,.02),(.76,.31,.29,0,.025),(.789,.10,.105,0,.025)],'Head',hair)
# Irregular overlapping crown locks keep a natural silhouette with the cap removed.
for layer,(height,radius,count) in enumerate([(.704,.16,13),(.753,.105,10),(.775,.045,6)]):
 for i in range(count):
  a=i*math.tau/count+layer*.47
  x=radius*math.cos(a);y=.02+radius*.83*math.sin(a);z=height+.009*math.sin(i*2.1)
  lock=loft('hair-crown-lock-%d-%d'%(layer,i),[(z-.037,.083,.074,x,y),(z+.008,.078,.069,x+.009*math.sin(a),y),(z+.032,.039,.043,x+.016*math.sin(a),y+.008)],'Head',hair)
for row,(z,radius,depth,count) in enumerate([(.645,.192,.170,16),(.587,.204,.171,15),(.537,.199,.164,14),(.492,.174,.151,12)]):
 for i in range(count):
  angle=-.12+(math.pi+.24)*i/(count-1) # sides and back; negative Y remains open for face
  x=radius*math.cos(angle);y=.025+depth*math.sin(angle)
  h=.068+((i*7+row*3)%5)*.009
  shade=tuple(v*(.82+((i*3+row)%5)*.075) for v in hair[:3])+(1,)
  o=loft('hair-lock-%d-%d'%(row,i),[(z-h*.5,.036,.043,x,y),(z,.062,.058,x,y),(z+h*.5,.057,.053,x,y)],'Head',shade)
  # Slight tangential lean avoids a uniform fringe without detached fragments.
  pivot=Vector((x,y,z));q=__import__('mathutils').Quaternion((0,1,0),((i%3)-1)*.10)
  for v in o.data.vertices:v.co=pivot+q@(v.co-pivot)
for i in range(7):
 x=(i-3)*.051;z=.608+([.002,.018,-.011,.013,-.006,.022,.005][i])
 box('hair-bang-'+str(i),(x,-.149,z),(.058,.064,.077+(i%3)*.013),'Head',hair,.005)
# Elliptical crown, shaped visor, panel seams, adjustable rear strap and pixel applique.
oval_loft('cap-crown',[(.693,.468,.41,0,.018),(.743,.463,.408,0,.018),(.808,.405,.367,0,.024),(.840,.287,.276,0,.027)],'Head','inklight')
oval_loft('cap-band',[(.686,.477,.418,0,.018),(.708,.477,.418,0,.018)],'Head','ink')
# A tapered, cambered visor follows the crown instead of a rectangular plate.
verts=[]
for z in [.694,.714]:
 verts += [(-.206,-.107,z),(-.206,-.235,z-.014),(-.147,-.305,z-.024),(0,-.328,z-.028),(.147,-.305,z-.024),(.206,-.235,z-.014),(.206,-.107,z)]
faces=[tuple(range(6,-1,-1)),tuple(range(7,14))]+[(i,(i+1)%7,(i+1)%7+7,i+7) for i in range(7)]
mesh=bpy.data.meshes.new('cap-shaped-visor');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('cap-shaped-visor',mesh);bpy.context.collection.objects.link(o);finish(o,'cap-shaped-visor','Head','inklight')
for a in [0,math.pi/3,2*math.pi/3,math.pi,4*math.pi/3,5*math.pi/3]:
 beam('cap-panel-seam',(.239*math.cos(a),.018+.211*math.sin(a),.71),(.145*math.cos(a),.027+.14*math.sin(a),.838),.004,.004,'Head',(.070,.078,.092,1))
box('cap-button',(0,.027,.847),(.033,.031,.016),'Head','ink',.005)
box('cap-rear-opening',(0,.224,.718),(.085,.009,.047),'Head','ink',.013)
box('cap-adjuster',(0,.232,.696),(.10,.012,.019),'Head','inklight',.003)
for i in range(4):box('cap-adjuster-hole',((i-1.5)*.013,.24,.697),(.004,.003,.004),'Head','ink',0)
# The owner's exact logo is a separate, undyed woven patch on the crown.
logo=box('cap-logo',(0,-.183,.770),(.086,.007,.086),'Head','white',0)
# Subdivide the closed patch, then conform both faces to the actual faceted crown.
bm=bmesh.new();bm.from_mesh(logo.data);bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=5,use_grid_fill=True);bm.to_mesh(logo.data);bm.free()
from mathutils.bvhtree import BVHTree
crown=next(o for o in parts if o.name=='cap-crown')
bvh=BVHTree.FromPolygons([v.co.copy() for v in crown.data.vertices],[list(f.vertices) for f in crown.data.polygons])
logo['outer_vertices']=[v.index for v in logo.data.vertices if v.co.y<-.183]
for v in logo.data.vertices:
 hit=bvh.ray_cast(Vector((v.co.x,-1,v.co.z)),Vector((0,1,0)))[0]
 if hit is None:raise RuntimeError('Cap logo has no supporting crown surface')
 v.co.y=hit.y-(.0012 if v.co.y<-.183 else .0002)
uv=logo.data.uv_layers.active or logo.data.uv_layers.new(name='UVMap')
for loop in logo.data.loops:
 v=logo.data.vertices[loop.vertex_index].co
 uv.data[loop.index].uv=((v.x+.043)/.086,(v.z-.727)/.086)
mat=bpy.data.materials.new('Cap logo original PNG');mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.95
texture=mat.node_tree.nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(ROOT+'/src/assets/cap-logo.png');texture.image.pack();texture.interpolation='Linear'
mat.node_tree.links.new(texture.outputs['Color'],bsdf.inputs['Base Color']);logo.data.materials.clear();logo.data.materials.append(mat)
# Crown and applique share the same fitting transform; the patch cannot float.
for obj in parts:
 if obj.name.startswith('cap-'):
  for v in obj.data.vertices:
   v.co.x*=.96;v.co.y=.02+(v.co.y-.02)*.96;v.co.z-=.009
# Three fixed streetwear outfits share the existing articulated skeleton.
tee=loft('tee',[(-.194,.425,.272,0,0),(-.16,.449,.286,0,0),(-.06,.445,.280,0,0),(.07,.427,.27,0,0),(.20,.416,.258,0,.004),(.275,.35,.22,0,.012),(.311,.16,.138,0,.016)],'Spine02','ink')
loft('tee-hem',[(-.199,.428,.274,0,0),(-.177,.440,.279,0,0)],'Spine02','inklight')
loft('neck',[(.303,.112,.105,0,.01),(.416,.112,.105,0,.01)],'Head','skin')
bpy.ops.mesh.primitive_torus_add(major_radius=.065,minor_radius=.008,major_segments=16,minor_segments=4,location=(0,.014,.31))
collar=bpy.context.object;collar.scale.y=.84;bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);collar.data.transform(collar.matrix_world);collar.matrix_world.identity();finish(collar,'tee-collar','Spine02','inklight')
# Prints use the owner's reference artwork. Project their thin closed carriers
# onto the shirt rather than placing floating rectangular labels in front of it.
def print_patch(name,filename,x,z,w,h,back=False,surface=None):
 y=.18 if back else -.18
 o=box(name,(x,y,z),(w,.001,h),'Spine02','white',0)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=7,use_grid_fill=True);bm.to_mesh(o.data);bm.free()
 target=surface or tee
 o['print_target']=target.name;o['print_back']=back
 o['outer_vertices']=[v.index for v in o.data.vertices if (v.co.y>y)==back]
 tree=BVHTree.FromPolygons([v.co.copy() for v in target.data.vertices],[list(f.vertices) for f in target.data.polygons])
 for v in o.data.vertices:
  hit=tree.ray_cast(Vector((v.co.x,1 if back else -1,v.co.z)),Vector((0,-1 if back else 1,0)))[0]
  if hit is None:raise RuntimeError('Unsupported clothing print '+name)
  v.co.y=hit.y+(1 if back else -1)*(.0006 if (v.co.y>y)==back else .0003)
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for loop in o.data.loops:
  v=o.data.vertices[loop.vertex_index].co
  u=(v.x-x+w/2)/w
  uv.data[loop.index].uv=(1-u if back else u,(v.z-z+h/2)/h)
 mat=material(name);mat.use_nodes=True
 bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=1
 tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(ROOT+'/src/assets/outfits/'+filename);tex.image.pack()
 mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);mat.node_tree.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha'])
 o.data.materials.clear();o.data.materials.append(mat)
 return o
print_patch('outfit1-print-front','schedule-front.png',0,.14,.30,.067)
print_patch('outfit1-print-back','schedule-back.png',0,.105,.31,.20,True)
print_patch('outfit2-print-front','house-front.png',.116,.173,.080,.065)
print_patch('outfit2-print-back','bros-back.png',0,.125,.300,.081,True)
# Closed sleeveless vest panels: a deep V leaves the tee lettering visible.
def vest_panel(side):
 outline=[(.008,-.19),(.228,-.19),(.23,.17),(.175,.282),(.081,.315),(.063,.19),(.025,.055),(.008,-.035)]
 verts=[(side*x,y,z) for y in [-.157,-.174] for x,z in outline]
 faces=[tuple(range(7,-1,-1)),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
 mesh=bpy.data.meshes.new('vest-panel');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('vest-panel',mesh);bpy.context.collection.objects.link(o)
 return finish(o,'vest-panel','Spine02','inklight')
for side in [-1,1]:
 vest_panel(side)
 ribbon('vest-shoulder',[(side*.125,-.163,.273),(side*.128,-.07,.291),(side*.128,.045,.296),(side*.125,.134,.281)],[(0,-.4,1),(0,0,1),(0,0,1),(0,.4,1)],.070,.013,'Spine02','inklight')
 beam('vest-v-binding',(side*.080,-.178,.308),(side*.008,-.178,-.035),.011,.009,'Spine02','ink')
 box('vest-side',(side*.22,.005,-.065),(.026,.30,.24),'Spine02','inklight',.008)
 for z in [.058,-.118]:
  box('vest-pocket',(side*.13,-.195,z),(.145,.047,.105),'Spine02','ink',.012)
  box('vest-pocket-flap',(side*.13,-.222,z+.043),(.149,.013,.033),'Spine02','inklight',.005)
  beam('vest-zip',(side*.053,-.221,z+.057),(side*.207,-.221,z+.057),.003,.004,'Spine02','metal')
  box('vest-zip-pull',(side*.063,-.227,z+.05),(.013,.005,.009),'Spine02','metal',.002)
 beam('vest-waist-zip',(side*.025,-.181,-.028),(side*.218,-.181,-.028),.004,.006,'Spine02','metal')
back=loft('vest-back',[(-.19,.448,.024,0,.157),(.18,.416,.023,0,.152),(.29,.338,.023,0,.132),(.311,.17,.018,0,.096)],'Spine02','inklight')
backPocket=box('vest-back-pocket',(0,.183,-.059),(.365,.035,.221),'Spine02','ink',.010)
beam('vest-back-zip',(-.171,.207,.046),(.171,.207,.046),.004,.006,'Spine02','metal')
print_patch('vest-print-back','vest-back.png',0,-.025,.295,.059,True,backPocket)
chest=box('vest-chest-label',(.13,-.18,.164),(.035,.006,.044),'Spine02','inklight',0)
print_patch('vest-print-front','vest-front.png',.13,.164,.033,.042,False,chest)
box('vest-fastener',(0,-.184,-.026),(.059,.012,.025),'Spine02','ink',.004)
box('vest-brass-button',(-.012,-.192,-.026),(.014,.005,.014),'Spine02',(.41,.30,.12,1),.004)
for x,y,z in [(-.15,-.226,-.179),(0,.159,.267)]:
 bpy.ops.mesh.primitive_torus_add(major_radius=.014,minor_radius=.0025,major_segments=12,minor_segments=4,location=(x,y,z),rotation=(math.pi/2,0,0))
 o=bpy.context.object;o.data.transform(o.matrix_world);o.matrix_world.identity();finish(o,'vest-brass-ring','Spine02',(.41,.30,.12,1))
for side in [-1,1]:
 label='Left' if side>0 else 'Right'
 shoulder=arm.matrix_world@arm.data.bones[label+'Arm'].head_local
 elbow=arm.matrix_world@arm.data.bones[label+'ForeArm'].head_local
 wrist=arm.matrix_world@arm.data.bones[label+'Hand'].head_local
 x0,x1,x2=shoulder.x,elbow.x,wrist.x
 y0,y1,y2=shoulder.y,elbow.y,wrist.y
 loft(label+'-sleeve',[(.282,.13,.16,x0,y0),(.23,.17,.18,x0+side*.026,y0),(.163,.17,.18,x1-side*.009,y1-.004),(.115,.163,.175,x1,y1),(.087,.157,.17,x1,y1)],label+'Arm','ink')
 loft(label+'-sleeve-hem',[(.084,.16,.173,x1,y1),(.102,.163,.176,x1,y1)],label+'Arm','inklight')
 loft(label+'-forearm',[(.096,.103,.115,x1,y1),(.025,.109,.118,x1,y1),(-.075,.097,.106,x2,y2),(-.14,.078,.084,x2,y2),(-.195,.068,.064,x2,y2)],label+'ForeArm','skin')
 # A palm with four short articulated-looking fingers; one rigid hand owner.
 hand=loft(label+'-hand',[(-.275,.07,.048,x2,y2),(-.20,.08,.058,x2,y2),(-.19,.064,.052,x2,y2)],label+'Hand','skin')
 fingerparts=[]
 for i in range(4):
  length=[.027,.035,.036,.027][i]
  fingerparts.append(box(label+'-finger-'+str(i),(x2+(i-1.5)*.018,y2,-.27-length/2),(.017,.032,length),label+'Hand','skin',.005))
 fingerparts.append(box(label+'-thumb',(x2-side*.048,y2-.014,-.236),(.024,.032,.043),label+'Hand','skin',.009))
 # Join only the hand subpieces. Their capped volumes remain clean and closed.
 bpy.ops.object.select_all(action='DESELECT');hand.select_set(True)
 for o in fingerparts:o.select_set(True);parts.remove(o)
 bpy.context.view_layer.objects.active=hand;bpy.ops.object.join()
 hand.data.materials.clear();hand.data.materials.append(materials[label+'-hand'])
 for polygon in hand.data.polygons:polygon.material_index=0
 # Anatomical rest: palms inward, thumbs forward, fingers downward.
 pivot=Vector((x2,y2,-.19));turn=__import__('mathutils').Quaternion((0,0,1),side*math.pi/2)
 for vertex in hand.data.vertices:vertex.co=pivot+turn@(vertex.co-pivot)
 hand['palmBasis']='inward'
 # Clean trousers: distinct thigh and shin surfaces meet at a finished knee seam.
 hx=(arm.matrix_world@arm.data.bones[label+'UpLeg'].head_local).x
 kx=(arm.matrix_world@arm.data.bones[label+'Leg'].head_local).x
 fx=(arm.matrix_world@arm.data.bones[label+'Foot'].head_local).x
 loft(label+'-trousers-upper',[(-.16,.197,.253,hx,.009),(-.25,.222,.277,hx+side*.015,.003),(-.335,.23,.286,kx+side*.014,.008),(-.405,.218,.272,kx+side*.006,0),(-.45,.198,.246,kx,0)],label+'UpLeg','ink')
 loft(label+'-trousers-lower',[(-.447,.198,.246,kx,0),(-.50,.222,.27,kx+side*.008,0),(-.595,.238,.281,fx+side*.012,.008),(-.635,.223,.258,fx+side*.008,.012),(-.655,.24,.28,fx+side*.012,.006),(-.68,.18,.209,fx,.024),(-.711,.149,.186,fx,.027)],label+'Leg','inklight')
 box(label+'-cargo-pocket',(hx+side*.114,-.015,-.30),(.035,.152,.12),label+'UpLeg','inklight',.008)
 box(label+'-cargo-flap',(hx+side*.123,-.015,-.24),(.038,.163,.035),label+'UpLeg','ink',.003)
 box(label+'-cargo-front',(hx+side*.025,-.139,-.302),(.112,.030,.113),label+'UpLeg','inklight',.007)
 box(label+'-cargo-front-flap',(hx+side*.025,-.159,-.249),(.120,.018,.028),label+'UpLeg','ink',.003)
 # Clean paneled sneakers; each shoe is a closed set of solids owned only by the foot.
 shoe=label+'-shoe'
 loft(shoe,[(-.846,.174,.32,fx,-.035),(-.826,.202,.35,fx,-.041),(-.794,.202,.347,fx,-.041),(-.783,.183,.322,fx,-.039)],label+'Foot','white')
 loft(shoe+'-upper',[(-.787,.18,.30,fx,-.033),(-.752,.177,.295,fx,-.036),(-.707,.132,.208,fx,.001),(-.685,.118,.145,fx,.035)],label+'Foot','ink')
 box(shoe+'-toe',(fx,-.153,-.771),(.151,.079,.038),label+'Foot','white',.012)
 loft(shoe+'-collar',[(-.71,.142,.16,fx,.034),(-.683,.142,.16,fx,.034)],label+'Foot','white')
 box(shoe+'-tongue',(fx,-.057,-.704),(.065,.10,.032),label+'Foot','trim',.008)
 for i in range(4):beam(shoe+'-lace-'+str(i),(fx-.048,-.105+i*.024,-.703+i*.007),(fx+.048,-.105+i*.024,-.703+i*.007),.009,.009,label+'Foot','white')
 for sideface in [-1,1]:
  box(shoe+'-quarter',(fx+sideface*.086,-.007,-.759),(.018,.082,.047),label+'Foot','white',.005)
  for i in range(4):box(shoe+'-sole-block',(fx+sideface*.099,-.141+i*.07,-.817),(.012,.028,.018),label+'Foot','trim',.002)
 box(shoe+'-heel',(fx,.102,-.759),(.123,.022,.054),label+'Foot','white',.005)
# Restrained face-level colour variation reads as pixel fabric under the PS2 filter.
import random
rng=random.Random(731)
for obj in parts:
 if 'print' in obj.name:continue
 if not any(k in obj.name for k in ['tee','vest-panel','vest-back','sleeve','trousers','cargo','cap-crown']):continue
 bm=bmesh.new();bm.from_mesh(obj.data)
 bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=2,use_grid_fill=True)
 bm.to_mesh(obj.data);bm.free()
 attr=obj.data.color_attributes['Source colour']
 for face in obj.data.polygons:
  factor=rng.choice([.95,.98,1,1,1,1.025,1.045])
  for li in face.loop_indices:
   c=attr.data[li].color;attr.data[li].color=(c[0]*factor,c[1]*factor,c[2]*factor,1)
# Re-project onto the final tessellated fabric/crown. Subdivision changes the
# triangulation of non-planar loft quads, so projecting before it hid ink edges.
for obj in parts:
 if obj.name!='cap-logo' and 'print_target' not in obj:continue
 target=crown if obj.name=='cap-logo' else next(p for p in parts if p.name==obj['print_target'])
 back=bool(obj.get('print_back',False));sign=1 if back else -1
 tree=BVHTree.FromPolygons([v.co.copy() for v in target.data.vertices],[list(f.vertices) for f in target.data.polygons])
 outer=set(obj['outer_vertices'])
 for v in obj.data.vertices:
  relief=.0015 if v.index in outer else .0012
  hit=tree.ray_cast(Vector((v.co.x,sign,v.co.z)),Vector((0,-sign,0)))[0]
  if hit is None:raise RuntimeError('Unsupported final print '+obj.name)
  # Both faces sit outside the fabric. Tiny relief avoids coplanar depth noise.
  v.co.y=hit.y+sign*relief
 obj.data.update()
for obj in parts:
 if obj.name=='head' or obj.name.startswith(('hair-','cap-')):
  for vertex in obj.data.vertices:vertex.co.z-=.043
# Export only the authored model and skeleton; keep an editable Blender deliverable.
for o in list(bpy.context.scene.objects):
 if o!=arm and o not in parts:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in parts:o.select_set(True)
for o in parts:
 world=o.matrix_world.copy();o.parent=arm;o.matrix_world=world
report={'source':'avatars1.blend','construction':'authored reference rebuild; source armature only','mouthSourcePosition':[0,.398,.15],'outfits':['schedule-tee','bros-tee','utility-vest'],'parts':[]}
for o in parts:
 bm=bmesh.new();bm.from_mesh(o.data)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data)
 remaining=set(bm.verts);components=0
 while remaining:
  components+=1;stack=[remaining.pop()]
  while stack:
   for edge in stack.pop().link_edges:
    for vertex in edge.verts:
     if vertex in remaining:remaining.remove(vertex);stack.append(vertex)
 report['parts'].append({'connectedComponents':components,'name':o.name,'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges)})
 bm.free()
bpy.ops.wm.save_as_mainfile(filepath=OUT+'/clean-character.blend')
# The editable Blender file retains every authored object. The web export
# batches only decorations that share a joint, without welding body parts.
def batch_key(name):
 if '-print-' in name:return name
 if name.startswith('vest-'):return 'vest'
 if name=='cap-logo':return 'cap-logo'
 if name.startswith('cap-'):return 'cap'
 if name in ('head','neck') or name.startswith('hair-'):return 'head'
 if name.startswith(('bag-','strap-')):return 'bag-and-strap'
 if name.startswith(('Left','Right')):
  side=name.split('-')[0]
  if 'sleeve' in name:return side+'-sleeve'
  if 'forearm' in name or 'cuff' in name:return side+'-forearm'
  if 'cargo' in name:return side+'-trousers-upper'
  if '-shoe' in name:return side+'-shoe'
  return name
 return 'tee'
batches={}
for part in parts:batches.setdefault(batch_key(part.name),[]).append(part)
for name,objects in batches.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 obj=bpy.context.object;obj.name=name
 if name=='cap-logo' or '-print-' in name:continue
 obj.data.materials.clear();obj.data.materials.append(material(name))
 for polygon in obj.data.polygons:polygon.material_index=0
arm.hide_set(False);arm.hide_viewport=False;arm.hide_render=False
bpy.ops.object.select_all(action='SELECT');arm.select_set(True)
print('EXPORT_ARMATURE',arm.name,arm.select_get(),len(arm.data.bones))
bpy.ops.export_scene.gltf(filepath=OUT+'/clean-character.glb',export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_extras=True)
report['webParts']=list(batches)
report['glbSha256']=hashlib.sha256(open(OUT+'/clean-character.glb','rb').read()).hexdigest()
with open(OUT+'/report.json','w') as f:json.dump(report,f,indent=2)
if '--install' in sys.argv:
 shutil.copyfile(OUT+'/clean-character.glb',ROOT+'/src/assets/neighbour.glb')
 shutil.copyfile(OUT+'/report.json',ROOT+'/src/assets/neighbour.meta.json')
print('CLEAN_REPORT',json.dumps(report))
