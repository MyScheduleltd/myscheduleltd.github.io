"""Match swimwear to the MCP-inspected clothed avatar limbs.

Use the repaired dressed lower arms and five-digit hands in every wardrobe
mode. Retain the existing swimwear and upper body, joining its upper arms to
those shared limbs. Reshape only bare-foot skin; garment/shoe geometry and
all 64 original bones remain unchanged. Apply once after tracked hand repair.
"""
import math
import bpy
import bmesh
from mathutils import Vector


def weight_male_bare_feet(body, arm):
    """Keep the plantar surface on the foot when the shin bends in a stride."""
    if body.get('male_foot_weight_profile'):
        raise RuntimeError('Male foot weight profile already applied')
    covered=body.data.attributes.get('_COVERED') or body.data.attributes.get('_covered')
    report={}
    for side in ('Left','Right'):
        foot=body.vertex_groups[side+'Foot'];toe=body.vertex_groups[side+'ToeBase']
        ankle=arm.data.bones[side+'Foot'].head_local
        changed=0
        for v in body.data.vertices:
            weights={g.group:g.weight for g in v.groups}
            if covered.data[v.index].value<=.5 or weights.get(foot.index,0)+weights.get(toe.index,0)<=.15:continue
            blend=max(0,min(1,(ankle.z-.025-v.co.z)/.055));blend=blend*blend*(3-2*blend)
            transferred=sum(w for i,w in weights.items() if i not in (foot.index,toe.index))*blend
            if transferred<.000001:continue
            for i,w in weights.items():
                if i not in (foot.index,toe.index):
                    if blend==1:body.vertex_groups[i].remove([v.index])
                    else:body.vertex_groups[i].add([v.index],w*(1-blend),'REPLACE')
            foot.add([v.index],weights.get(foot.index,0)+transferred,'REPLACE');changed+=1
        report[side]={'reweighted_vertices':changed,'shin_blend_start_below_ankle':.025,'full_foot_weight_below_ankle':.080}
    body['male_foot_weight_profile']='plantar-foot-v1'
    return report


def refine_male_bare_feet(body, arm):
    """Remove the generated upswept wedge, keeping skin topology and weights.

    The earlier plan-view narrowing left a sloping heel/ball sole. Runtime
    contact calibration pitched that slope flat and lifted the toes. Inspect
    each old transverse envelope, then reshape its height into a planted
    heel/ball, shallow medial arch and rounded, low toe box. Coordinates above
    the ankle fade to the original shin, so the leg attachment stays intact.
    """
    if body.get('male_foot_profile'):
        raise RuntimeError('Male foot profile already applied')
    covered = body.data.attributes.get('_COVERED') or body.data.attributes.get('_covered')
    names = {g.index:g.name for g in body.vertex_groups}
    report = {}
    def lerp_profile(t, knots):
        if t <= knots[0][0]: return knots[0][1]
        for (a,x),(b,y) in zip(knots,knots[1:]):
            if t <= b:
                u=(t-a)/(b-a);u=u*u*(3-2*u)
                return x+(y-x)*u
        return knots[-1][1]
    for side in ('Left','Right'):
        ankle=arm.data.bones[side+'Foot'].head_local.copy()
        forward=Vector((math.copysign(math.sin(math.radians(4)),ankle.x),-math.cos(math.radians(4)),0))
        across=Vector((-forward.y,forward.x,0))
        points=[]
        for v in body.data.vertices:
            if covered.data[v.index].value>.5 and sum(g.weight for g in v.groups if names[g.group] in (side+'Foot',side+'ToeBase'))>.15:
                d=v.co-ankle;points.append((v.index,d.dot(forward),d.dot(across),v.co.z))
        lo=min(p[1] for p in points);hi=max(p[1] for p in points)
        # A continuous sampled envelope retains toe surface curvature rather
        # than assigning a single flat height to every toe vertex.
        sections=[]
        for j in range(81):
            t=lo+(hi-lo)*j/80
            band=[p for p in points if abs(p[1]-t)<.012]
            sections.append((t,min(p[3] for p in band),max(p[3] for p in band)))
        sole=-.853
        changed=0
        for index,long,lateral,z in points:
            s=(long-lo)/(hi-lo)*80;j=min(79,max(0,int(s)));u=s-j
            bottom=sections[j][1]*(1-u)+sections[j+1][1]*u
            top=sections[j][2]*(1-u)+sections[j+1][2]*u
            height=max(0,min(1,(z-bottom)/max(.001,top-bottom)))
            length=long*(.177/hi if long>=0 else -.070/lo)
            width_scale=lerp_profile(length,[(-.07,.72),(0,.76),(.075,.94),(.177,.94)])
            width=lateral*width_scale
            # The medial arch lifts the inner midsole; the outer rim remains
            # close to the floor. Heel and ball share the same contact plane.
            medial=max(0,min(1,.5-math.copysign(1,ankle.x)*width/.075))
            arch=math.exp(-((length-.035)/.038)**2)*.009*medial
            spring=lerp_profile(length,[(-.07,.006),(-.05,0),(.125,0),(.177,.004)])
            low=sole+arch+spring
            dorsal=lerp_profile(length,[(-.07,ankle.z+.025),(-.02,ankle.z+.025),(0,ankle.z+.018),(.035,ankle.z-.005),(.07,sole+.065),(.105,sole+.047),(.14,sole+.036),(.177,sole+.026)])
            wanted_z=low+(dorsal-low)*height
            # Never move the shin or ankle rim; below them deform smoothly.
            blend=max(0,min(1,(ankle.z+.005-z)/.055))
            wanted=ankle+forward*length+across*width
            wanted.z=wanted_z
            move=(wanted-body.data.vertices[index].co)*blend
            if move.length>.0000001:
                body.data.vertices[index].co+=move
                if body.data.shape_keys:
                    for key in body.data.shape_keys.key_blocks:key.data[index].co+=move
                changed+=1
        report[side]={'changed_vertices':changed,'target_heel_length':.070,'target_toe_length':.177,'sole_z':sole,'toe_dorsal_height':.026,'max_medial_arch':.009}
    body.data.update()
    # Recompute only moved loops, retaining authored normals everywhere else.
    body.data.normals_split_custom_set([(0,0,0) if covered.data[l.vertex_index].value>.5 and any(names[g.group].endswith(('Foot','ToeBase')) and g.weight>.15 for g in body.data.vertices[l.vertex_index].groups) else tuple(body.data.corner_normals[l.index].vector) for l in body.data.loops])
    report['weights']=weight_male_bare_feet(body,arm)
    body['male_foot_profile']='planted-rounded-v1'
    return report


def match_swim_body(body, arm, sex):
    if body.get('swim_body_matched'):
        raise RuntimeError('Swim body repair already applied')
    bm = bmesh.new(); bm.from_mesh(body.data)
    dressed = bm.verts.layers.float.get('_DRESSED') or bm.verts.layers.float.get('_dressed')
    covered = bm.verts.layers.float.get('_COVERED') or bm.verts.layers.float.get('_covered')
    deform = bm.verts.layers.deform.active
    uv = bm.loops.layers.uv.active
    names = {g.index:g.name for g in body.vertex_groups}
    image = next(n.image for mat in body.data.materials if mat and mat.use_nodes
                 for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    pixels=list(image.pixels); width,height=image.size
    def colour(at):
        x,y=round(at.x*(width-1)),round(at.y*(height-1))
        return pixels[(y*width+x)*4:(y*width+x)*4+3]
    def hand_owned(v): return sum(w for i,w in v[deform].items() if 'Hand' in names[i])>.5
    texels=[l[uv].uv.copy() for f in bm.faces if all(v[dressed]>.5 and hand_owned(v) for v in f.verts)
            for l in f.loops if (lambda c:c[0]>c[1]>c[2] and min(c)>.3)(colour(l[uv].uv))]
    assert texels, 'No inspected native skin texel'
    clean_uv=sorted(texels,key=lambda t:sum(colour(t)))[len(texels)//2]
    source_uv=body.data.uv_layers.active.data
    source_normals={tuple(round(x,6) for x in body.data.vertices[l.vertex_index].co)+tuple(round(x,7) for x in source_uv[l.index].uv):tuple(body.data.corner_normals[l.index].vector) for l in body.data.loops}
    report={'limbs':{},'feet':{}}
    def geo(faces):return list({v for f in faces for v in f.verts})+list({e for f in faces for e in f.edges})+faces
    def cut_loop(edges):
        assert edges,'Missing arm join loop'
        by_vertex={}
        for edge in edges:
            for v in edge.verts:by_vertex.setdefault(v,[]).append(edge)
        assert all(len(es)==2 for es in by_vertex.values()),'Arm join is not a closed loop'
        start=next(iter(by_vertex));ring=[start];current=start;previous=None
        while True:
            edge=next(e for e in by_vertex[current] if e!=previous)
            other=edge.other_vert(current)
            if other==start:break
            assert other not in ring,'Arm join crosses itself'
            ring.append(other);current=other;previous=edge
        assert len(ring)==len(by_vertex),'More than one arm join loop'
        return ring
    for side in ('Left','Right'):
        ids={i for i,n in names.items() if n.startswith(side) and ('Arm' in n or 'Hand' in n)}
        ours=lambda v:sum(w for i,w in v[deform].items() if i in ids)>.15
        native=[v for v in bm.verts if ours(v) and v[dressed]>.5]
        bmesh.ops.remove_doubles(bm,verts=native,dist=.0002)
        elbow=arm.data.bones[side+'ForeArm'].head_local.copy()
        wrist=arm.data.bones[side+'Hand'].head_local.copy()
        axis=(wrist-elbow).normalized()
        # The generated cuff contains branching/open edges on three arms.
        # MCP inspection found the first continuous cross-section 30 mm
        # below the elbow on all four; trim only that damaged cuff skin.
        native_plane=elbow+axis*.030
        swim_plane=elbow-axis*.006
        native_faces=[f for f in bm.faces if all(ours(v) and v[dressed]>.5 for v in f.verts)]
        bmesh.ops.bisect_plane(bm,geom=geo(native_faces),plane_co=native_plane,plane_no=axis,dist=.000001,clear_inner=True)
        native_edges=[e for e in bm.edges if e.is_boundary and all(v[dressed]>.5 and ours(v) and abs((v.co-native_plane).dot(axis))<.00001 for v in e.verts)]
        native_ring=cut_loop(native_edges)
        # UV seams split the original bare-arm surface into coincident
        # vertices. Join only this arm before cutting its matching contour.
        bmesh.ops.remove_doubles(bm,verts=[v for v in bm.verts if ours(v) and v[covered]>.5],dist=.0002)
        swim_faces=[f for f in bm.faces if all(ours(v) and v[covered]>.5 for v in f.verts)]
        bmesh.ops.bisect_plane(bm,geom=geo(swim_faces),plane_co=swim_plane,plane_no=axis,dist=.000001,clear_outer=True)
        swim_edges=[e for e in bm.edges if e.is_boundary and all(v[covered]>.5 and ours(v) and abs((v.co-swim_plane).dot(axis))<.00001 for v in e.verts)]
        swim_ring=cut_loop(swim_edges)
        # Share all surviving native arms/hands; no wardrobe-specific copy.
        for v in bm.verts:
            if ours(v) and v[dressed]>.5:v[dressed],v[covered]=0,0
        # Bring the upper arm profile toward the native forearm at the join,
        # retaining its torso attachment and its original skinning weights.
        across=axis.cross(Vector((0,1,0))).normalized();normal=axis.cross(across).normalized()
        def radial(v,plane):
            p=v.co-plane;return Vector((p.dot(across),p.dot(normal)))
        ncenter=sum((radial(v,native_plane) for v in native_ring),Vector((0,0)))/len(native_ring)
        scenter=sum((radial(v,swim_plane) for v in swim_ring),Vector((0,0)))/len(swim_ring)
        nr=sum((radial(v,native_plane)-ncenter).length for v in native_ring)/len(native_ring)
        sr=sum((radial(v,swim_plane)-scenter).length for v in swim_ring)/len(swim_ring)
        scale=max(.7,min(1.2,nr/sr))
        for v in bm.verts:
            if not(ours(v) and v[covered]>.5):continue
            t=(v.co-swim_plane).dot(axis);blend=max(0,min(1,1+t/.10))
            p=radial(v,swim_plane);wanted=(p-scenter)*scale+ncenter
            delta=(wanted-p)*blend
            move=across*delta.x+normal*delta.y
            v.co+=move
            for shape in bm.verts.layers.shape.values():v[shape]+=move
        # Order both contours around the bone axis; stitch different polygon
        # counts with a monotonic angular zipper, without closing the lumen.
        def ordered(ring,plane):
            points=[]
            for v in ring:
                p=radial(v,plane)-ncenter
                points.append((math.atan2(p.y,p.x)%math.tau,v))
            return sorted(points,key=lambda x:x[0])
        a,b=ordered(native_ring,native_plane),ordered(swim_ring,swim_plane)
        i=j=0;patches=[]
        while i<len(a) or j<len(b):
            av,bv=a[i%len(a)][1],b[j%len(b)][1]
            an=a[(i+1)%len(a)][0]+(math.tau if i+1>=len(a) else 0) if i<len(a) else math.inf
            bn=b[(j+1)%len(b)][0]+(math.tau if j+1>=len(b) else 0) if j<len(b) else math.inf
            if an<bn:vs=[av,a[(i+1)%len(a)][1],bv];i+=1
            else:vs=[av,b[(j+1)%len(b)][1],bv];j+=1
            f=bm.faces.new(vs);f.smooth=True
            f.material_index=next(iter(av.link_faces)).material_index
            for l in f.loops:l[uv].uv=clean_uv
            patches.append(f)
        bmesh.ops.recalc_face_normals(bm,faces=patches)
        # The tee cuffs are oblique, especially on their inner surfaces.
        # Keep the join AND enough upper-arm skin shared to reach inside
        # every cuff sector; hiding half the bridge leaves an elbow gap.
        sleeve_overlap=.10 if sex=='male' else .075
        shared_upper=0
        for v in bm.verts:
            if ours(v) and v[covered]>.5 and (v.co-elbow).dot(axis)>=-sleeve_overlap:
                v[dressed],v[covered]=0,0;shared_upper+=1
        report['limbs'][side]={'native_join_vertices':len(a),'swim_join_vertices':len(b),'bridge_triangles':len(patches),'upper_arm_scale':scale}
        report['limbs'][side]['shared_upper_arm_vertices']=shared_upper
    # The same head, shoulder/elbow/wrist and hip/knee/ankle joints serve all
    # outfits. The bare skin must fit those joints without a long broad toe.
    for side in ('Left','Right'):
        foot_ids={i for i,n in names.items() if n in (side+'Foot',side+'ToeBase')}
        ankle=arm.data.bones[side+'Foot'].head_local.copy()
        toe=arm.data.bones[side+'ToeBase'].head_local.copy()
        forward=toe-ankle;forward.z=0;forward.normalize()
        across=Vector((-forward.y,forward.x,0))
        angle=math.atan2(forward.x,-forward.y)
        target=math.copysign(math.radians(4),angle)
        new_forward=Vector((math.sin(target),-math.cos(target),0))
        new_across=Vector((-new_forward.y,new_forward.x,0))
        feet=[v for v in bm.verts if v[covered]>.5 and sum(w for i,w in v[deform].items() if i in foot_ids)>.15]
        assert len(feet)>80,'No bare foot skin'
        width_scale=.67 if sex=='male' else .76
        length_scale=.82
        for v in feet:
            delta=v.co-ankle;lateral=delta.dot(across);longitudinal=delta.dot(forward)
            blend=max(0,min(1,(ankle.z+.025-v.co.z)/.07))
            # The heel stays full and the ball/toes taper as an ordinary foot.
            front=max(0,min(1,(longitudinal+.018)/.15))
            w=lateral*(1+(width_scale-1)*front)
            length=longitudinal*(length_scale if longitudinal>0 else .96)
            wanted=ankle+new_across*w+new_forward*length+Vector((0,0,delta.z))
            move=(wanted-v.co)*blend;v.co+=move
            for shape in bm.verts.layers.shape.values():v[shape]+=move
        report['feet'][side]={'vertices':len(feet),'forefoot_width_scale':width_scale,'forward_length_scale':length_scale,'target_rest_yaw_degrees':math.degrees(target)}
    bm.to_mesh(body.data);bm.free();body.data.validate(clean_customdata=False);body.data.update()
    # Keep the authored normals on retained surfaces; only joins and reshaped
    # bare feet need newly calculated smooth normals.
    source_uv=body.data.uv_layers.active.data
    body.data.normals_split_custom_set([source_normals.get(tuple(round(x,6) for x in body.data.vertices[l.vertex_index].co)+tuple(round(x,7) for x in source_uv[l.index].uv),(0,0,0)) for l in body.data.loops])
    body['swim_body_matched']=True
    if sex=='male':report['anatomicalFeet']=refine_male_bare_feet(body,arm)
    return report
