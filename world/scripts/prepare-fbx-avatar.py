"""Offline FBX import. Never modifies the owner's source FBX or blend file."""
import bpy, json, os
from mathutils import Vector
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = '/Users/myscheduleai/Desktop/Michael/blender/myscheduleweb'
OUT = ROOT + '/.artifacts/fbx-avatar/conversion'
os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=SOURCE+'/avatars.blend')
image = bpy.data.images.get('texture_0')
image.filepath_raw=OUT+'/source-texture.png'
image.file_format='PNG'
image.save()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SOURCE+'/avatars.fbx')
arm = next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
mesh = next(o for o in bpy.context.scene.objects if o.type=='MESH')
arm.animation_data_clear()
arm.data.pose_position='REST'
image=bpy.data.images.load(OUT+'/source-texture.png',check_existing=True)
for mat in mesh.data.materials:
    for node in mat.node_tree.nodes:
        if node.type=='TEX_IMAGE': node.image=image
    for link in list(mat.node_tree.links):
        if link.to_socket.name in ('Emission Color','Normal'): mat.node_tree.links.remove(link)
    bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bsdf.inputs['Emission Strength'].default_value=0
    bsdf.inputs['Metallic'].default_value=0
    bsdf.inputs['Roughness'].default_value=1
report={'bones':{b.name:{'head':list(arm.matrix_world@b.head_local),'tail':list(arm.matrix_world@b.tail_local),'parent':b.parent.name if b.parent else None} for b in arm.data.bones},'bounds':[list(mesh.matrix_world@Vector(c)) for c in mesh.bound_box], 'verticesBefore':len(mesh.data.vertices)}
bpy.context.view_layer.objects.active=mesh
mesh.select_set(True)
# Preserve the densely islanded source appearance as corner colours before
# simplification. This avoids invalid UV interpolation across collapsed islands.
import numpy as np
uvs=np.empty(len(mesh.data.loops)*2,dtype=np.float32)
mesh.data.uv_layers.active.data.foreach_get('uv',uvs)
uvs=uvs.reshape((-1,2))
pixels=np.empty(image.size[0]*image.size[1]*4,dtype=np.float32)
image.pixels.foreach_get(pixels)
pixels=pixels.reshape((image.size[1],image.size[0],4))
x=np.clip((uvs[:,0]*image.size[0]).astype(int),0,image.size[0]-1)
y=np.clip((uvs[:,1]*image.size[1]).astype(int),0,image.size[1]-1)
colours=pixels[y,x].copy()
colours[:,:3]=np.where(colours[:,:3]<=.04045,colours[:,:3]/12.92,((colours[:,:3]+.055)/1.055)**2.4)
attr=mesh.data.color_attributes.new(name='Source colour',type='FLOAT_COLOR',domain='CORNER')
attr.data.foreach_set('color',colours.ravel())
mesh.data.color_attributes.active_color=attr
mat=mesh.data.materials[0]
bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
vertex=mat.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name=attr.name
mat.node_tree.links.new(vertex.outputs['Color'],bsdf.inputs['Base Color'])
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=.00015)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
dec=mesh.modifiers.new('Web silhouette reduction','DECIMATE');dec.ratio=.24
bpy.ops.object.modifier_apply(modifier=dec.name)
# Replace the automatic proximity weights: they pulled the bag into the hands
# and transferred elbow motion into the shirt. Each region can use only its own
# anatomical chain; rigid accessories never borrow an arm or leg influence.
def blend(a,b,value,centre,width=.055):
    t=max(0,min(1,(value-centre)/width+.5))
    return [(a,t),(b,1-t)]
def region(p,rgb):
    x,y,z=p;side='Left' if x>0 else 'Right';ax=abs(x)
    r,g,b=rgb[:3];skin=r>g*1.13 and g>b*1.1 and r>.12
    if z>.36:return 'head', [('Head',1)]
    if y<-.145 and -.18<z<.30 and ax<.36:return 'bag-and-strap',[('Spine02',1)]
    if skin and ax>.20 and -.36<z<-.12:return side+'-hand',[(side+'Hand',1)]
    if ax>.225 and z>-.205 and y>-.13:
        if z<-.095:return side+'-cuff',blend(side+'ForeArm',side+'Hand',z,-.125,.06)
        return side+'-sleeve',blend(side+'Arm',side+'ForeArm',z,.083,.085)
    if skin and ax>.20 and -.36<z<-.15:return side+'-hand',[(side+'Hand',1)]
    if z<-.155 and not (skin and ax>.20 and z>-.36):
        if z<-.695:return side+'-shoe',[(side+'Foot',1)]
        if max(r,g,b)>.22 and ax>.23 and z>-.22:return side+'-cuff',[(side+'ForeArm',1)]
        return side+'-trousers',blend(side+'UpLeg',side+'Leg',z,-.45,.10)
    arm_edge=.175 if z>.08 else .205
    if ax>arm_edge and z>-.35:
        if z<-.155:return side+'-hand',[(side+'Hand',1)]
        if z<-.095:return side+'-cuff',blend(side+'ForeArm',side+'Hand',z,-.125,.06)
        return side+'-sleeve',blend(side+'Arm',side+'ForeArm',z,.083,.085)
    if z<-.19:
        if z<-.695:return side+'-shoe',[(side+'Foot',1)]
        return side+'-trousers',blend(side+'UpLeg',side+'Leg',z,-.45,.10)
    return 'hoodie', [('Spine02',1)]
source_weights=[[(mesh.vertex_groups[g.group].name,g.weight) for g in v.groups] for v in mesh.data.vertices]
mesh.vertex_groups.clear()
groups={b.name:mesh.vertex_groups.new(name=b.name) for b in arm.data.bones}
vertex_regions=[]
colours=mesh.data.color_attributes.get('Source colour')
vertex_colours=np.zeros((len(mesh.data.vertices),4));counts=np.zeros(len(mesh.data.vertices))
for loop in mesh.data.loops:
    vertex_colours[loop.vertex_index]+=np.array(colours.data[loop.index].color);counts[loop.vertex_index]+=1
vertex_colours/=np.maximum(counts[:,None],1)
for v in mesh.data.vertices:
    name,weights=region(mesh.matrix_world@v.co,vertex_colours[v.index]);vertex_regions.append(name)
    original=source_weights[v.index]
    p=mesh.matrix_world@v.co
    side='Left' if p.x>0 else 'Right'
    if name.endswith(('trousers','shoe')):
        original=[(bone,weight) for bone,weight in original if bone in ('Hips',side+'UpLeg',side+'Leg',side+'Foot',side+'ToeBase')]
    elif name.endswith(('hand','cuff')):
        original=[(bone,weight) for bone,weight in original if bone in (side+'Arm',side+'ForeArm',side+'Hand')]
    elif name.endswith('sleeve'):
        original=[(bone,weight) for bone,weight in original if bone in (side+'Shoulder',side+'Arm',side+'ForeArm','Spine','Spine01','Spine02')]
    elif name=='hoodie':
        original=[(bone,weight) for bone,weight in original if bone in ('Hips','Spine','Spine01','Spine02','neck','LeftShoulder','RightShoulder','LeftArm','RightArm')]
    else:original=weights
    total=sum(weight for _,weight in original)
    if total>.001:weights=[(bone,weight/total) for bone,weight in original]
    for bone,weight in weights:
        if weight>0:groups[bone].add([v.index],weight,'REPLACE')
regions=sorted(set(vertex_regions))
materials={}
for name in regions:
    material=mat.copy();material.name='FBX • '+name
    materials[name]=len(mesh.data.materials);mesh.data.materials.append(material)
for face in mesh.data.polygons:
    p=sum((mesh.matrix_world@mesh.data.vertices[v].co for v in face.vertices),Vector())/len(face.vertices)
    rgb=sum((vertex_colours[v] for v in face.vertices))/len(face.vertices)
    name,_=region(p,rgb);face.material_index=materials[name]
report['parts']=regions
report['verticesAfter']=len(mesh.data.vertices)
report['trianglesAfter']=sum(len(p.vertices)-2 for p in mesh.data.polygons)
# Real independent mesh parts, not labels on a single deforming surface.
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
parts=[o for o in bpy.context.scene.objects if o.type=='MESH']
for part in parts:
    name=part.data.materials[0].name.replace('FBX • ','')
    part.name=name
    # The generated source welds touching sleeves/pockets into neighbouring
    # surfaces. Close each newly separated region so lifting a limb reveals a
    # finished surface, not an open tear in the adjacent garment.
    import bmesh
    bm=bmesh.new();bm.from_mesh(part.data)
    colour_layer=bm.loops.layers.float_color.get('Source colour')
    samples=[np.array(loop[colour_layer]) for face in bm.faces for loop in face.loops] if colour_layer else []
    cap_colour=np.mean(samples,axis=0) if samples else np.array([.4,.4,.4,1])
    caps=bmesh.ops.holes_fill(bm,edges=[edge for edge in bm.edges if edge.is_boundary],sides=0).get('faces',[])
    if colour_layer:
        for face in caps:
            for loop in face.loops:loop[colour_layer]=cap_colour
    bmesh.ops.triangulate(bm,faces=[face for face in caps if face.is_valid])
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(part.data);bm.free()
    part.data.validate(clean_customdata=False);part.data.update()
    side='Left' if name.startswith('Left') else 'Right'
    allowed=([side+'Arm',side+'ForeArm'] if name.endswith('sleeve') else
             [side+'ForeArm'] if name.endswith('cuff') else
             [side+'Hand'] if name.endswith('hand') else
             [side+'UpLeg',side+'Leg'] if name.endswith('trousers') else
             [side+'Foot'] if name.endswith('shoe') else
             ['Head'] if name=='head' else ['Spine02'])
    for v in part.data.vertices:
        valid=[(part.vertex_groups[g.group].name,g.weight) for g in v.groups if part.vertex_groups[g.group].name in allowed]
        for group_index in [g.group for g in v.groups]:part.vertex_groups[group_index].remove([v.index])
        total=sum(w for _,w in valid)
        if total<.00001:valid=[(allowed[0],1)];total=1
        for bone,weight in valid:part.vertex_groups[bone].add([v.index],weight/total,'REPLACE')
arm.data.pose_position='REST'
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for part in parts:part.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT+'/neighbour.glb',export_format='GLB',use_selection=True,export_animations=False,export_yup=True)
import shutil
shutil.copyfile(OUT+'/neighbour.glb',ROOT+'/src/assets/neighbour.glb')
with open(ROOT+'/.artifacts/fbx-avatar/source-report.json','w') as f:json.dump(report,f,indent=2)
print('AVATAR_REPORT',json.dumps(report))
