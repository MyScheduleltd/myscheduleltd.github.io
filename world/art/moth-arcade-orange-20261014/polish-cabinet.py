import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector

base=Path('/Users/myscheduleai/Desktop/myschedule-pivot/release-npc-20261006/world/.artifacts/moth-arcade-orange-20261014')
art=base.parent.parent/'art/moth-arcade-orange-20261014'
source=bpy.data.scenes['MOTH cabinet refinement 20261013']
scene=bpy.data.scenes.new('MOTH orange cabinet 20261014')
bpy.context.window.scene=scene
scene.world=source.world.copy()

def material(name,rgb,roughness=.64,metal=0):
    def linear(c): return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
    color=tuple(linear(c/255) for c in rgb)+(1,)
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=color
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=roughness
    m.diffuse_color=color
    return m

orange=material('MOTH game orange enamel',(255,92,33),.61)
ivory=material('MOTH polished warm ivory',(231,218,182),.64)
ink=material('MOTH burgundy print',(121,46,38),.72)
black=material('MOTH charcoal powder coat',(25,27,25),.7)
rubber=material('MOTH charcoal rubber',(16,19,17),.84)
silver=material('MOTH brushed hardware',(110,115,109),.46,.4)

# Copy the accepted screen and bevel system. Every earlier scene stays intact.
copied=[]
for ob in source.objects:
    if ob.type!='MESH' or ob.name=='MOTH retained artwork body': continue
    clone=ob.copy();clone.data=ob.data.copy();scene.collection.objects.link(clone)
    clone.name=ob.name.replace('forest','orange')+' 20261014'
    if not clone.get('arcadeScreen'):
        for i,m in enumerate(clone.data.materials):
            if 'forest' in m.name: clone.data.materials[i]=orange
            elif 'ivory' in m.name: clone.data.materials[i]=ivory
            elif 'burgundy' in m.name: clone.data.materials[i]=ink
            elif 'gasket' in m.name: clone.data.materials[i]=rubber
        clone['cabinetRole']='trim'
        if 'edge rail' in ob.name:
            clone.location.y-=.006
    copied.append(clone)
screen=next(o for o in copied if o.get('arcadeScreen'))

def mesh(name,verts,faces,mat,role='shell'):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob)
    data.materials.append(mat);ob['cabinetRole']=role
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    return ob

def bevel(ob,width=.002,segments=3):
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
    mod=ob.modifiers.new('Small manufactured edge radius','BEVEL');mod.width=width;mod.segments=segments
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for f in ob.data.polygons: f.use_smooth=True
    normal=ob.modifiers.new('Stable planar normals','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=50
    bpy.ops.object.modifier_apply(modifier=normal.name)
    return ob

def box(name,location,dimensions,mat,role='hardware',radius=.002):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    ob=bpy.context.object;ob.name=name;ob.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(mat);ob['cabinetRole']=role
    if radius: bevel(ob,radius)
    return ob

# Clean, closed side panels follow the generated cabinet's measured silhouette.
# Keep its extrema so runtime footprint and normalization are unchanged.
profile=[(-.95040798,-.422),(-.400,-.463),(-.200,-.52536),(-.082,-.425),
         (.000,-.233),(.610,-.119),(.663,-.265),(.948315084,-.265),
         (.948315084,.52577698),(-.95040798,.52577698)]
for label,x0,x1 in [('left',-.451270998,-.425270998),('right',.423378014,.449378014)]:
    verts=[(x,y,z) for x in [x0,x1] for z,y in profile];n=len(profile)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    panel=bevel(mesh('MOTH smooth orange '+label+' side',verts,faces,orange),.0015)
    if label=='left':
        panel['higgsfieldJob']='e62abde6-2233-41ae-89f8-e974a9de6c16'
        panel['refinement']='Clean closed panels fitted to the generated silhouette; original screen frame preserved'

box('MOTH clean back',(-.0009465,.508,.0),(.848,.026,1.895),black,'shell')
box('MOTH top lid',(-.0009465,.129,.934),(.848,.782,.026),orange,'shell')
box('MOTH bottom enclosure',(-.0009465,.047,-.93740798),(.848,.940,.026),black,'shell')
# A dark cavity behind the independent display; nothing intersects the aperture.
box('MOTH screen cavity',(-.0009465,.270,.270),(.842,.022,.770),black,'shell')
box('MOTH marquee housing',(-.0009465,-.127,.803),(.842,.270,.281),orange,'shell',.004)
box('MOTH marquee charcoal inset',(-.0009465,-.269,.803),(.807,.006,.234),black,'marquee',.003)

font=bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Arial Bold.ttf')
def text(name,words,location,size,mat,maxwidth,orientation=(math.pi/2,0,0)):
    curve=bpy.data.curves.new(name,'FONT');curve.body=words;curve.align_x='CENTER';curve.align_y='CENTER'
    curve.size=size;curve.font=font;curve.resolution_u=3
    ob=bpy.data.objects.new(name,curve);scene.collection.objects.link(ob)
    ob.location=location;ob.rotation_euler=orientation;curve.materials.append(mat)
    bpy.context.view_layer.update()
    if ob.dimensions.x>maxwidth: ob.scale.x*=maxwidth/ob.dimensions.x
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH');ob=bpy.context.object;ob['cabinetRole']='lettering'
    return ob

text('MOTH crisp title','M.O.T.H',(-.0009465,-.274,.837),.101,ivory,.53)
text('MOTH crisp subtitle','MASTER OF THE HOUSE',(-.0009465,-.274,.765),.025,ivory,.52)
# Orange keyline is geometry, so it stays sharp without fuzzy texture packing.
for z in [.694,.911]: box('MOTH marquee horizontal rule',(-.0009465,-.274,z),(.777,.0015,.0025),orange,'print',0)
for x in [-.389,.387]: box('MOTH marquee vertical rule',(x,-.274,.8025),(.0025,.0015,.217),orange,'print',0)

# Shared flat decal: no artificial baked lighting on the cabinet body.
image=bpy.data.images.load(str(art/'side-artwork.png'),check_existing=True);image.colorspace_settings.name='sRGB'
decal=bpy.data.materials.new('MOTH sharp ivory burgundy artwork');decal.use_nodes=True
p=decal.node_tree.nodes['Principled BSDF'];p.inputs['Roughness'].default_value=.73;p.inputs['Metallic'].default_value=0
tex=decal.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear'
decal.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color']);decal.node_tree.links.new(tex.outputs['Alpha'],p.inputs['Alpha'])
decal.blend_method='CLIP';decal.alpha_threshold=.9;decal.use_backface_culling=True

def artwork(name,verts,uvs):
    ob=mesh(name,verts,[(0,1,2,3)],decal,'artwork')
    uv=ob.data.uv_layers.new(name='Print layout')
    for loop in ob.data.loops: uv.data[loop.index].uv=uvs[loop.vertex_index]
    return ob

for label,x,reverse in [('right',.4509,False),('left',-.4528,True)]:
    # Each motif gets a fitted aspect ratio and remains inside the side silhouette.
    for motif,ys,zs,vs in [('moth',(-.075,.475),(.240,.780),(.49,1)),
                          ('guitarist',(-.213,.487),(-.820,-.220),(0,.49))]:
        verts=[(x,ys[0],zs[0]),(x,ys[1],zs[0]),(x,ys[1],zs[1]),(x,ys[0],zs[1])]
        uvs=[(0,vs[0]),(1,vs[0]),(1,vs[1]),(0,vs[1])]
        if reverse: uvs=[(1-u,v) for u,v in uvs]
        ob=artwork('MOTH '+label+' '+motif+' print',verts,uvs)
        outward=-1 if reverse else 1
        for p in ob.data.polygons:
            if p.normal.x*outward<0:p.flip()
        ob.data.update()

# Small moth emblems flank the title using the same image's upper region.
for x in [-.335,.333]:
    artwork('MOTH marquee emblem',[(x-.047,-.2745,.746),(x+.047,-.2745,.746),(x+.047,-.2745,.868),(x-.047,-.2745,.868)],[(.1,.59),(.9,.59),(.9,.90),(.1,.90)])

# Rebuild the control shelf with coherent planes and smooth physical controls.
deckVerts=[(-.420,-.515,-.195),(.418,-.515,-.195),(.418,-.226,.018),(-.420,-.226,.018),
           (-.420,-.515,-.217),(.418,-.515,-.217),(.418,-.226,-.004),(-.420,-.226,-.004)]
bevel(mesh('MOTH smooth orange control deck',deckVerts,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],orange,'controls'),.003)
deckNormal=Vector((0,-.213,.289)).normalized()
def deckPos(x,y,lift=0): return Vector((x,y,-.195+(y+.515)*(.213/.289)))+deckNormal*lift
def cylinder(name,centre,radius,depth,mat,role='controls',normal=deckNormal):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius,depth=depth,location=centre)
    ob=bpy.context.object;ob.name=name;ob.rotation_euler=normal.to_track_quat('Z','Y').to_euler()
    ob.data.materials.append(mat);ob['cabinetRole']=role;bevel(ob,.0015,1)
    return ob

# Two straight rows replace warped baked-in button circles.
for row,y in enumerate([-.354,-.425]):
    for col,x in enumerate([.020,.098,.176,.254]):
        c=deckPos(x,y,.009)
        cylinder('MOTH button socket',c,.031,.013,rubber)
        cylinder('MOTH button '+str(row*4+col+1),c+deckNormal*.012,.025,.012,ivory if col%2==0 else ink)
joy=deckPos(-.250,-.400,.008)
cylinder('MOTH joystick flange',joy,.047,.012,rubber)
cylinder('MOTH joystick stem',joy+deckNormal*.055,.010,.090,silver)
bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,radius=.036,location=joy+deckNormal*.111)
ob=bpy.context.object;ob.name='MOTH smooth joystick';ob.data.materials.append(rubber);ob['cabinetRole']='controls'
for p in ob.data.polygons:p.use_smooth=True

# Deck perimeter rule is a small continuous print inset, not damaged edge noise.
for x in [-.395,.393]:
    a=deckPos(x,-.492,.002);b=deckPos(x,-.240,.002)
    ob=box('MOTH deck side keyline',(a+b)*.5,(.0025,.003,(b-a).length),ink,'print',0)
    ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
for y in [-.492,-.240]:
    c=deckPos(-.001,y,.003);ob=box('MOTH deck cross keyline',c,(.790,.0025,.0025),ink,'print',0)

# Clean charcoal lower face and functional-looking coin hardware.
lower=mesh('MOTH clean lower front',[(-.420,-.423,-.924),(.418,-.423,-.924),(.418,-.499,-.226),(-.420,-.499,-.226)],[(0,1,2,3)],black,'shell')
door=box('MOTH coin door',(-.001,-.474,-.580),(.330,.027,.382),rubber,'hardware',.006)
door.rotation_euler.x=-math.atan(.076/.698)
for x in [-.080,.078]:
    box('MOTH coin slot rim',(x,-.492,-.480),(.082,.008,.030),silver,'hardware',.002)
    box('MOTH coin slot',(x,-.497,-.480),(.055,.003,.007),rubber,'hardware',.001)
    box('MOTH coin return',(x,-.486,-.650),(.075,.020,.060),black,'hardware',.003)
text('MOTH coin label','INSERT COIN',(-.001,-.493,-.541),.021,ivory,.27)
for z in [-.841,-.819,-.797]:box('MOTH lower speaker slot',(-.001,-.440,z),(.292,.004,.008),rubber,'hardware',.001)
for z in [.430,.397,.364,.331]:box('MOTH back ventilation',(-.001,.523,z),(.466,.006,.014),rubber,'hardware',.002)

# Share one draw call per material/role instead of one per small button or letter.
groups={}
for ob in list(scene.objects):
    if ob.type=='MESH' and not ob.get('arcadeScreen') and not ob.get('cabinetRefinement'):
        key=(ob.get('cabinetRole','shell'),ob.data.materials[0].name)
        groups.setdefault(key,[]).append(ob)
for (role,matname),objects in groups.items():
    if len(objects)<2:continue
    job=next((o.get('higgsfieldJob') for o in objects if o.get('higgsfieldJob')),None)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    joined=bpy.context.object;joined.name='MOTH '+role+' '+matname;joined['cabinetRole']=role
    if job:joined['higgsfieldJob']=job

# Native render proof of full front / side / back, before installation.
cam=source.camera.copy();cam.data=source.camera.data.copy();scene.collection.objects.link(cam);scene.camera=cam
for light in [o for o in source.objects if o.type=='LIGHT']:
    clone=light.copy();clone.data=light.data.copy();scene.collection.objects.link(clone)
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=720;scene.render.resolution_y=900
scene.render.resolution_percentage=100;scene.view_settings.view_transform='Standard'
cam.data.type='ORTHO';cam.data.ortho_scale=2.35
bpy.context.view_layer.update()
for ob in scene.objects:ob.select_set(ob.type=='MESH')
bpy.context.view_layer.objects.active=screen
bpy.ops.export_scene.gltf(filepath=str(base/'cabinet-polished.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=str(base/'cabinet-polished.blend'))
for name,pos in [('polished-front',(0,-4.2,.45)),('polished-side',(2.6,-4.2,1)),('polished-back',(-2.6,4.2,1))]:
    cam.location=pos;cam.rotation_euler=(Vector((0,0,.04))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(art/(name+'.png'));bpy.ops.render.render(write_still=True)
result={'scene':scene.name,'export':str(base/'cabinet-polished.glb'),'source':str(base/'cabinet-polished.blend'),'meshCount':sum(o.type=='MESH' for o in scene.objects),'orange':'#ff5c21','priorScenePreserved':source.name,'screen':list(screen.location)}
json.dump(result,open(base/'polish.json','w'),indent=2)
