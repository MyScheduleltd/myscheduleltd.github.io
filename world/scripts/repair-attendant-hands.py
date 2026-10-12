"""Separate the inspected attendant fingers through live Blender MCP.

Keep the authored palm, thumb, wrist, UVs and 24-bone rig. Six rounded slots
remove distal finger bridges; their new inner surfaces use an inspected skin
texel. Coordinates are measured in the attendant's original GLB rest pose.
"""
import math
import bpy
import bmesh
from mathutils import Vector


def separate_attendant_fingers(body):
    if body.get('attendant_fingers_separated'):
        raise RuntimeError('Finger separation already applied')
    names = {g.index: g.name for g in body.vertex_groups}
    hand_groups = {i for i, n in names.items() if n in ('LeftHand', 'RightHand')}
    original = body.data.materials[0]
    image = next(n.image for n in original.node_tree.nodes if n.type == 'TEX_IMAGE' and n.label == 'BASE COLOR')
    pixels = list(image.pixels)
    uvs = body.data.uv_layers.active.data
    source_normals = {}
    for loop in body.data.loops:
        key = tuple(round(x,5) for x in body.data.vertices[loop.vertex_index].co) + tuple(round(x,7) for x in uvs[loop.index].uv)
        source_normals[key] = tuple(body.data.corner_normals[loop.index].vector)
    skin = []
    for face in body.data.polygons:
        if all(sum(g.weight for g in body.data.vertices[i].groups if g.group in hand_groups) > .8 for i in face.vertices):
            for i in face.loop_indices:
                at = uvs[i].uv.copy()
                x, y = round(at.x * (image.size[0]-1)), round(at.y * (image.size[1]-1))
                rgb = pixels[(y*image.size[0]+x)*4:(y*image.size[0]+x)*4+3]
                if rgb[0] > rgb[1] > rgb[2] and min(rgb) > .3:
                    skin.append((sum(rgb), at))
    assert skin, 'No inspected hand skin texel'
    clean_uv = sorted(skin, key=lambda x: x[0])[len(skin)//2][1]
    gap_skin = original.copy()
    gap_skin.name = 'GEO-attendant finger gap skin'
    body.data.materials.append(gap_skin)
    gap_index = len(body.data.materials)-1
    # Weld only duplicate hand vertices at GLB UV/normal seams, retaining UVs
    # per loop. This gives the volume cutter a coherent hand surface.
    bm = bmesh.new(); bm.from_mesh(body.data)
    deform = bm.verts.layers.deform.active
    hand_vertices = [v for v in bm.verts if sum(w for i, w in v[deform].items() if i in hand_groups) > .8]
    bmesh.ops.remove_doubles(bm, verts=hand_vertices, dist=.0001)
    uv = bm.loops.layers.uv.active
    # The generated left ring/little-finger bridge also contained holes.
    # Close its small boundary cycles before cutting a closed volume.
    boundary = {e for e in bm.edges if e.is_boundary and all(sum(w for i,w in v[deform].items() if i in hand_groups) > .8 for v in e.verts)}
    original_boundary = len(boundary)
    while boundary:
        start = next(iter(boundary)).verts[0]
        def cycle(vertex, path, used):
            for edge in vertex.link_edges:
                if edge not in boundary or edge in used: continue
                other = edge.other_vert(vertex)
                if other == start and len(path)>2: return path, used+[edge]
                if other not in path:
                    found = cycle(other,path+[other],used+[edge])
                    if found: return found
        found = cycle(start,[start],[])
        assert found, 'Unclosed source hand boundary'
        verts,edges = found; boundary.difference_update(edges)
        face = bm.faces.new(verts); face.material_index = gap_index; face.smooth = True
        for loop in face.loops: loop[uv].uv = clean_uv
        bmesh.ops.recalc_face_normals(bm,faces=[face])
        bmesh.ops.triangulate(bm,faces=[face])
    bm.to_mesh(body.data); bm.free()
    arm_modifier = next(m for m in body.modifiers if m.type == 'ARMATURE')
    visible = arm_modifier.show_viewport
    arm_modifier.show_viewport = False
    bpy.ops.object.select_all(action='DESELECT')
    body.hide_set(False); body.select_set(True)
    bpy.context.view_layer.objects.active = body
    for side, sign in (('Left', 1), ('Right', -1)):
        # Three web spaces leave four fingers and the existing separate thumb.
        for number, (y, top) in enumerate(((-.043,1.418),(.007,1.414),(.051,1.415))):
            radius = .006
            profile = [(y-radius,1.20),(y+radius,1.20)]
            profile += [(y+radius*math.cos(t),top-radius+radius*math.sin(t))
                        for t in [j*math.pi/10 for j in range(11)]]
            verts = [(x,py,pz) for x in (sign*.63,sign*.94) for py,pz in profile]
            n = len(profile)
            faces = [tuple(reversed(range(n))),tuple(range(n,2*n))]
            faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
            mesh = bpy.data.meshes.new('GEO-finger gap cutter'); mesh.from_pydata(verts,[],faces); mesh.update()
            cutter = bpy.data.objects.new(f'GEO-{side} finger gap {number+1}',mesh)
            bpy.context.scene.collection.objects.link(cutter)
            # Correct mirrored cutter orientation before the exact volume cut.
            bm = bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(mesh); bm.free()
            mesh.materials.append(gap_skin)
            modifier = body.modifiers.new('Separate authored fingers','BOOLEAN')
            modifier.operation = 'DIFFERENCE'; modifier.solver = 'EXACT'
            modifier.material_mode = 'TRANSFER'; modifier.object = cutter
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            bpy.data.objects.remove(cutter,do_unlink=True)
    arm_modifier.show_viewport = visible
    # Resolve the new hand ngons before glTF tessellation. Limit both
    # triangulation and seam welding to vertices owned by the hand bones.
    bm = bmesh.new(); bm.from_mesh(body.data)
    deform = bm.verts.layers.deform.active
    def hand_owned(v): return sum(w for i,w in v[deform].items() if i in hand_groups) > .8
    bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3 and all(hand_owned(v) for v in f.verts)],quad_method='BEAUTY',ngon_method='BEAUTY')
    bmesh.ops.remove_doubles(bm,verts=[v for v in bm.verts if hand_owned(v)],dist=.0001)
    bm.to_mesh(body.data); bm.free()
    gap_index = list(body.data.materials).index(gap_skin)
    for face in body.data.polygons:
        if face.material_index == gap_index:
            face.use_smooth = True
            for loop in face.loop_indices: body.data.uv_layers.active.data[loop].uv = clean_uv
    cap_vertices = {i for f in body.data.polygons if f.material_index == gap_index for i in f.vertices}
    for i in cap_vertices:
        side = 'Left' if (body.matrix_world @ body.data.vertices[i].co).x > 0 else 'Right'
        for group in body.vertex_groups: group.remove([i])
        body.vertex_groups[side+'Hand'].add([i],1,'REPLACE')
    body.data.validate(clean_customdata=False)
    body.data.update(); bpy.context.view_layer.update()
    # Preserve authored split normals on every unchanged surface. The cutter
    # must not alter the shading of the clothes, face or other body parts.
    normals = []
    for loop in body.data.loops:
        key = tuple(round(x,5) for x in body.data.vertices[loop.vertex_index].co) + tuple(round(x,7) for x in body.data.uv_layers.active.data[loop.index].uv)
        normals.append(source_normals.get(key,tuple(body.data.corner_normals[loop.index].vector)))
    body.data.normals_split_custom_set(normals)
    body['attendant_fingers_separated'] = True
    return {'rounded_slots':6,'source_hand_boundary_edges_closed':original_boundary,'new_inner_surface_faces':sum(f.material_index==gap_index for f in body.data.polygons),
            'skin_uv':list(clean_uv),'retained_thumb_palm_wrist':True}
