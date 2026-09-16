"""Render the authored avatar from four angles, independently of the web renderer."""
import bpy,math,os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=ROOT+'/.artifacts/fbx-avatar/clean'
bpy.ops.wm.open_mainfile(filepath=OUT+'/clean-character.blend')
scene=bpy.context.scene
collection=bpy.data.collections.new('Reference avatar master')
for obj in list(scene.objects):
 for old in list(obj.users_collection):old.objects.unlink(obj)
 collection.objects.link(obj)
for x,angle,label in [(-1.95,0,'FRONT'),(-.65,-math.pi/4,'THREE QUARTER'),(.65,-math.pi/2,'SIDE'),(1.95,math.pi,'BACK')]:
 obj=bpy.data.objects.new(label,None);obj.instance_type='COLLECTION';obj.instance_collection=collection;scene.collection.objects.link(obj);obj.location.x=x;obj.rotation_euler.z=angle
 text=bpy.data.curves.new(label,'FONT');text.body=label;text.align_x='CENTER';text.size=.09
 obj=bpy.data.objects.new(label+' caption',text);scene.collection.objects.link(obj);obj.location=(x,-.25,-1.035);obj.rotation_euler.x=math.pi/2
 mat=bpy.data.materials.get('Caption ink') or bpy.data.materials.new('Caption ink');mat.diffuse_color=(.07,.085,.10,1);obj.data.materials.append(mat)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.852));floor=bpy.context.object
mat=bpy.data.materials.new('Warm paper');mat.diffuse_color=(.72,.70,.66,1);floor.data.materials.append(mat)
world=bpy.data.worlds.new('Studio') if not scene.world else scene.world;scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.75,.8,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
for name,location,power,size in [('Key',(-3,-4,6),750,5),('Fill',(4,-1,3),350,4),('Rim',(0,3,5),500,3)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
 obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.cameras.new('Turnaround');obj=bpy.data.objects.new('Turnaround',camera);scene.collection.objects.link(obj);scene.camera=obj;obj.location=(0,-8,1.8);obj.rotation_euler=(Vector((0,0,-.04))-obj.location).to_track_quat('-Z','Y').to_euler();camera.type='ORTHO';camera.ortho_scale=5.35
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1800;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=OUT+'/reference-turnaround.png'
scene.view_settings.view_transform='AgX'
bpy.ops.render.render(write_still=True)
