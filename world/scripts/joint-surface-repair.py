"""Repair loft correspondence and continuous shoulder skinning in bind space."""
import bpy, math
import numpy as np
from collections import defaultdict
from mathutils import Vector


def wrist_surface(arm, body, side, hand_frame, pin_forearm=False):
    bones=arm.data.bones;W=bones[side+'Hand'].head_local.copy();E=bones[side+'ForeArm'].head_local.copy()
    along,palm=hand_frame(arm,side);across=along.cross(palm).normalized()
    # Keep the measured frame's handedness, and use topology rather than
    # independently choosing an azimuth on every wrist ring.
    roots=[bones[side+'Hand'+f+'1'].head_local.copy() for f in ('Index','Middle','Ring','Pinky')]
    K=sum(roots,Vector())/4;kl=(K-W).dot(along)
    names={g.index:g.name for g in body.vertex_groups}
    def owned(v):
        weights=[(names[g.group],g.weight) for g in v.groups]
        return sum(w for n,w in weights if n in {side+'Hand',side+'ForeArm',side+'ForeArmTwist'})>.5 and not any(n.startswith(side+'Hand') and n!=side+'Hand' and w>1e-5 for n,w in weights)
    def local(v):
        d=v.co-W;return Vector((d.dot(across),d.dot(along),d.dot(palm)))
    bins=defaultdict(list)
    for v in body.data.vertices:
        if owned(v):
            p=local(v)
            if -.051<p.y<kl+.008:bins[round(p.y,5)].append(v.index)
    rings=sorted((l,ids) for l,ids in bins.items() if len(ids)>=12)
    if not rings or abs(rings[0][0]+.05)>.001:raise RuntimeError('Cannot identify wrist cut ring: '+str((side,[(l,len(ids)) for l,ids in rings])))
    neighbors=defaultdict(set)
    for edge in body.data.edges:
        a,b=edge.vertices;neighbors[a].add(b);neighbors[b].add(a)
    # The source cut can also contain small capped sliver loops. Only the
    # largest connected boundary is the cuff joined to the palm loft.
    remaining=set(rings[0][1]);components=[]
    while remaining:
        seed=remaining.pop();component={seed};queue=[seed]
        while queue:
            for i in neighbors[queue.pop()]&remaining:
                remaining.remove(i);component.add(i);queue.append(i)
        components.append(component)
    main=max(components,key=len)
    next_row=set(rings[1][1]);main={i for i in main if neighbors[i]&next_row}
    rings[0]=(rings[0][0],list(main))
    all_rings=rings
    n=len(main);rings=[(l,ids) for l,ids in rings if len(ids)==n]
    if len(rings)<7:raise RuntimeError('Incomplete palm loft: '+str((side,n,[(l,len(ids)) for l,ids in all_rings])))
    cut=set(rings[0][1]);start=max(cut,key=lambda i:local(body.data.vertices[i]).x)
    order=[start];previous=None
    for _ in range(n-1):
        choices=[i for i in neighbors[order[-1]] if i in cut and i!=previous]
        if not choices:raise RuntimeError('Broken cut ring')
        nxt=choices[0] if previous is not None else max(choices,key=lambda i:local(body.data.vertices[i]).z)
        previous=order[-1];order.append(nxt)
    if len(set(order))!=n:raise RuntimeError('Non-cyclic cuff boundary')
    original_cut=np.array([list(local(body.data.vertices[i])) for i in order])
    old_cx,old_cz=(original_cut[:,(0,2)].min(0)+original_cut[:,(0,2)].max(0))/2
    old_hx,old_hz=(original_cut[:,(0,2)].max(0)-original_cut[:,(0,2)].min(0))/2
    theta_values=[math.atan2((p[2]-old_cz)/old_hz,(p[0]-old_cx)/old_hx) for p in original_cut]
    fore_original={v.index:local(v).copy() for v in body.data.vertices if owned(v) and -.13<local(v).y<-.04999}
    far=np.array([list(p) for p in fore_original.values() if p.y<-.10])
    old_far=(far[:,(0,2)].min(0)+far[:,(0,2)].max(0))/2 if len(far) else np.array([old_cx,old_cz])
    correspondence=[order];before=[]
    for l,ids in rings[1:]:
        row=set(ids);mapped=[]
        for i in correspondence[-1]:
            choices=neighbors[i]&row
            if len(choices)!=1:raise RuntimeError('Ambiguous longitudinal wrist edge: '+str((side,l,i,choices)))
            mapped.append(next(iter(choices)))
        if len(set(mapped))!=n:raise RuntimeError('Wrist ring correspondence overlaps')
        correspondence.append(mapped)
    def centre(l):
        if l<=0:
            F=W-E;co=W+F*(l/F.dot(along));d=co-W
            return d.dot(across),d.dot(palm)
        t=min(1,l/kl);d=K-W;return d.dot(across)*t,d.dot(palm)*t
    for row,(l,ids) in zip(correspondence,rings):
        cx,cz=centre(l)
        before.append([math.atan2(local(body.data.vertices[i]).z-cz,local(body.data.vertices[i]).x-cx) for i in row])
    jumps=[abs((b-a+math.pi)%math.tau-math.pi) for arow,brow in zip(before,before[1:]) for a,b in zip(arow,brow)]
    # A continuous wrist/palm profile removes the sharp hourglass shoulder at
    # the wrist while preserving the knuckle and finger-root dimensions.
    control_l=[-.05,-.025,0,.025,.052,rings[-4][0],rings[-3][0],rings[-2][0],rings[-1][0]]
    original=[]
    for l,ids in rings:
        ps=np.array([list(local(body.data.vertices[i])) for i in ids]);original.append(((ps[:,0].max()-ps[:,0].min())/2,(ps[:,2].max()-ps[:,2].min())/2))
    controls=[(.031,.018),(.029,.016),(.029,.015),(.032,.014),(.035,.013)]+original[-4:]
    # Sort and deduplicate controls to support smaller source palms too.
    table=sorted(dict(zip(control_l,controls)).items());ls=[l for l,v in table]
    for row,(l,ids) in zip(correspondence,rings):
        if pin_forearm and row is correspondence[0]:continue
        cx,cz=centre(l);hx=float(np.interp(l,ls,[v[0] for ll,v in table]));hz=float(np.interp(l,ls,[v[1] for ll,v in table]))
        for i,vi in enumerate(row):
            theta=theta_values[i];c,s=math.cos(theta),math.sin(theta)
            x=hx*math.copysign(abs(c)**.9,c);z=hz*math.copysign(abs(s)**.9,s)
            body.data.vertices[vi].co=W+along*l+across*(cx+x)+palm*(cz+z)
    # Match the exposed lower forearm smoothly onto the repaired cut.
    cut_main=set(order)
    for vi,p in fore_original.items():
        if pin_forearm:continue
        if vi in cut_main or not -.115<p.y<-.04999:continue
        v=body.data.vertices[vi]
        t=min(1,max(0,(p.y+.115)/.065));old_c=old_far*(1-t)+np.array([old_cx,old_cz])*t
        smooth=t*t*(3-2*t);bcx,bcz=centre(p.y);cx=old_c[0]*(1-smooth)+bcx*smooth;cz=old_c[1]*(1-smooth)+bcz*smooth
        x,z=p.x-old_c[0],p.z-old_c[1];angle=math.atan2(z/old_hz,x/old_hx)
        target_x=.031*math.copysign(abs(math.cos(angle))**.9,math.cos(angle));target_z=.018*math.copysign(abs(math.sin(angle))**.9,math.sin(angle))
        v.co=W+along*p.y+across*(cx+x*(1-smooth)+target_x*smooth)+palm*(cz+z*(1-smooth)+target_z*smooth)
    # Keep positional duplicates at the sewn cuff on the same new surface.
    body.data.update()
    return {'rings':len(rings),'verticesPerRing':n,'maxPriorLongitudinalAzimuthJumpDegrees':math.degrees(max(jumps)),'newLoftAzimuthJumpDegrees':0.,'fingerBindPreserved':True}


def restore_shoulder_skin_weights(arm,body,band):
    """Undo hair protection on shaded shoulder SKIN using supplied weights."""
    from mathutils import Matrix
    from mathutils.kdtree import KDTree
    band.av._pixel_cache.clear();samples=band.av.face_samples(body)
    # Baked shading darkens skin below the bright-skin classifier's cutoff.
    # Retain skin hue while excluding neutral black cloth and red hair marks.
    colors=[]
    for r,g,b in samples:
        colors.append('skin' if r>.07 and .65<g/r<.97 and .50<b/r<.93 and g>b*1.02 and r>g*1.02 else 'other')
    adjacency=defaultdict(list)
    for poly,color in zip(body.data.polygons,colors):
        for vi in poly.vertices:adjacency[vi].append(color)
    new=band.import_glb('vocal');source_arm=next(o for o in new if o.type=='ARMATURE');source_body=next(o for o in new if o.type=='MESH' and o.vertex_groups)
    coords=band.av.world_verts(source_body);low,high=coords[:,2].min(),coords[:,2].max();scale=1.62/(high-low);hip=band.av.bone_at(source_arm,'Hips')
    band.av.bake(source_arm,source_body,Matrix.Translation((-hip.x*scale,-hip.y*scale,-low*scale))@Matrix.Scale(scale,4))
    tree=KDTree(len(source_body.data.vertices))
    for v in source_body.data.vertices:tree.insert(v.co,v.index)
    tree.balance();names={g.index:g.name for g in source_body.vertex_groups};gn={g.index:g.name for g in body.vertex_groups};byname={g.name:g for g in body.vertex_groups}
    S=[arm.data.bones[s+'Arm'].head_local.copy() for s in ['Left','Right']];changed=[];curtain=[];core_vertices=[];core_weights={}
    for v in body.data.vertices:
        if min((v.co-s).length for s in S)>.40:continue
        colors_at=adjacency[v.index]
        is_skin=colors_at and colors_at.count('skin')/len(colors_at)>=.5
        # The long hair curtains sit beyond the front/back torso surfaces.
        # Their original auto-rig has some arm influence, so retain the
        # corrected rigid Head attachment rather than treating it as sleeve.
        shoulder=min(S,key=lambda s:(v.co-s).length)
        side_curtain=v.co.z>shoulder.z+.02 and abs(v.co.x)>abs(shoulder.x)+.025
        if not is_skin and (abs(v.co.y)>.115 or side_curtain):
            for gi in [g.group for g in v.groups]:body.vertex_groups[gi].remove([v.index])
            byname['Head'].add([v.index],1,'REPLACE');curtain.append(v.index)
            continue
        co,index,distance=tree.find(v.co)
        if distance>.0002:continue
        weights={names[g.group]:g.weight for g in source_body.data.vertices[index].groups}
        if not is_skin and weights.get('Head',0)>.1 and (v.co.y>.075 or (abs(v.co.x)>.18 and v.co.z>shoulder.z-.03)):
            for gi in [g.group for g in v.groups]:body.vertex_groups[gi].remove([v.index])
            byname['Head'].add([v.index],1,'REPLACE');curtain.append(v.index);continue
        core=sum(weights.get(n,0)for n in ('Hips','Spine','Spine01','Spine02'))
        if core>.35:
            core_vertices.append(v.index);core_weights[v.index]=weights
        if weights.get('Head',0)>.3:continue
        limb=sum(w for n,w in weights.items() if any(n.startswith(s+p) for s in ['Left','Right'] for p in ['Arm','ForeArm','Shoulder']))
        flooded=sum(g.weight for g in v.groups if gn[g.group]=='Head')>.5
        torso=abs(v.co.x)<.23 and -.11<v.co.y<.105 and v.co.z<shoulder.z+.07
        if limb<.6 and not (flooded and (limb>.1 or (core>.35 and torso))):continue
        # The flood used to protect hair also reached connected black sleeves.
        # Original head influence distinguishes those sleeves from the hair;
        # texture brightness alone cannot distinguish black cloth from hair.
        if not is_skin and sum(g.weight for g in v.groups if gn[g.group]=='Head')<.5:continue
        for gi in [g.group for g in v.groups]:body.vertex_groups[gi].remove([v.index])
        for n,w in weights.items():
            if n in byname and w>1e-6:byname[n].add([v.index],w,'REPLACE')
        changed.append(v.index)
    for o in new:bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.view_layer.objects.active=arm
    return {'vertices':len(changed),'hairCurtainVertices':len(curtain),'sourceCoreVertices':core_vertices,'sourceCoreWeights':core_weights,'source':'supplied vocal.glb','criterion':'Original arm/shoulder/torso weights restored on skin and falsely Head-attached cloth; long front/back hair curtains attached consistently to Head','vertexIndices':changed}


def shoulder_weights(arm,body,iterations=72):
    names={g.index:g.name for g in body.vertex_groups};gn={g.name:g.index for g in body.vertex_groups}
    old=[{names[g.group]:g.weight for g in v.groups if g.weight>1e-6} for v in body.data.vertices]
    # Elbow weights introduced by the old nearest-limb classifier must not
    # pull proximal shoulder skin toward the forearm's separate rotation.
    for v in body.data.vertices:
        if old[v.index].get('Head',0)>.3:continue
        for side in ('Left','Right'):
            S=arm.data.bones[side+'Arm'].head_local;E=arm.data.bones[side+'ForeArm'].head_local;axis=E-S
            u=(v.co-S).dot(axis)/axis.length_squared
            if 0<u<.65 and (v.co-(S+axis*u)).length<.10:
                fore=sum(old[v.index].pop(side+n,0) for n in ('ForeArm','ForeArmTwist'))
                old[v.index][side+'Arm']=old[v.index].get(side+'Arm',0)+fore
    shoulders=[arm.data.bones[s+'Arm'].head_local.copy() for s in ('Left','Right')]
    active={v.index for v in body.data.vertices if min((v.co-S).length for S in shoulders)<.23 and old[v.index].get('Head',0)<.3 and sum(w for n,w in old[v.index].items()if any(n.startswith(s+p)for s in ('Left','Right')for p in ('Arm','ForeArm','Shoulder')))>.1}
    # Use the same four influences throughout this shoulder patch. Choosing
    # the four largest separately at every vertex discarded different small
    # influences on neighbouring vertices and reintroduced sharp creases.
    for i in active:
        side='Left' if body.data.vertices[i].co.x>0 else 'Right'
        keep={side+n for n in ('Arm','ForeArm','ForeArmTwist')}
        row={n:w for n,w in old[i].items() if n in keep}
        row['Spine02']=sum(w for n,w in old[i].items() if n not in keep)
        old[i]=row
    neighbors=defaultdict(set)
    for edge in body.data.edges:
        a,b=edge.vertices
        if old[a].get('Head',0)<.3 and old[b].get('Head',0)<.3:
            neighbors[a].add(b);neighbors[b].add(a)
    # UV seams and the source's irregular triangle density must not create
    # discontinuities in an otherwise continuous shoulder skin surface.
    from mathutils.kdtree import KDTree
    tree=KDTree(len(body.data.vertices))
    for v in body.data.vertices:tree.insert(v.co,v.index)
    tree.balance()
    for i in active:
        for co,j,d in tree.find_range(body.data.vertices[i].co,.012):
            if i!=j and j in active:neighbors[i].add(j)
    weights=old
    for _ in range(iterations):
        nxt=list(weights)
        for i in active:
            adjacent=neighbors[i]
            if not adjacent:continue
            row=defaultdict(float)
            for n,w in weights[i].items():row[n]+=.5*w
            for j in adjacent:
                for n,w in weights[j].items():row[n]+=.5*w/len(adjacent)
            nxt[i]=dict(row)
        weights=nxt
    for i in active:
        # Feather into the unchanged cloth/neck at the region boundary.
        d=min((body.data.vertices[i].co-S).length for S in shoulders)
        strength=min(1,max(0,(.23-d)/.065));strength=strength*strength*(3-2*strength)
        row=defaultdict(float)
        for n,w in old[i].items():row[n]+=(1-strength)*w
        for n,w in weights[i].items():row[n]+=strength*w
        side='Left' if body.data.vertices[i].co.x>0 else 'Right'
        keep={side+n for n in ('Arm','ForeArm','ForeArmTwist')}
        core=sum(w for n,w in row.items() if n not in keep)
        row={n:w for n,w in row.items() if n in keep};row['Spine02']=core
        S=arm.data.bones[side+'Arm'].head_local;E=arm.data.bones[side+'ForeArm'].head_local;axis=E-S
        u=(body.data.vertices[i].co-S).dot(axis)/axis.length_squared
        t=min(1,max(0,(u-.65)/.4));elbow=t*t*(3-2*t)
        transferred=0
        for n in (side+'ForeArm',side+'ForeArmTwist'):
            value=row.get(n,0);transferred+=value*(1-elbow);row[n]=value*elbow
        row[side+'Arm']=row.get(side+'Arm',0)+transferred
        row=sorted(row.items(),key=lambda item:-item[1])[:4];total=sum(w for n,w in row)
        for g in list(body.data.vertices[i].groups):body.vertex_groups[g.group].remove([i])
        for n,w in row:
            if w>1e-6:body.vertex_groups[gn[n]].add([i],w/total,'REPLACE')
    return {'vertices':len(active),'diffusionIterations':iterations,'hairWeightsPreserved':True}


def skin_material(arm,body,av):
    # Imported atlases reuse image names across .blend files. Their pixels
    # cannot be cached by that name across two different characters.
    av._pixel_cache.clear()
    texels=av.face_texels(body);colors=[t.mean(axis=0) for t in texels];names={g.index:g.name for g in body.vertex_groups};chosen=[];samples=[]
    for face,rgb in zip(body.data.polygons,colors):
        vertices=[body.data.vertices[i] for i in face.vertices]
        own=[sum(g.weight for g in v.groups if any(names[g.group].startswith(s+p) for s in ('Left','Right') for p in ('Arm','ForeArm','Hand'))) for v in vertices]
        if min(own)<.2:continue
        if any(sum(g.weight for g in v.groups if names[g.group]=='Head')>.1 for v in vertices):continue
        r,g,b=rgb
        exposed=False
        for side in ['Left','Right']:
            if not all(sum(g.weight for g in v.groups if any(names[g.group].startswith(side+p) for p in ('Arm','ForeArm','Hand')))>.5 for v in vertices):continue
            W=arm.data.bones[side+'Hand'].head_local;S=arm.data.bones[side+'Arm'].head_local;E=arm.data.bones[side+'ForeArm'].head_local
            along=(arm.data.bones[side+'HandMiddle1'].head_local-W).normalized();upper=(E-S).normalized()
            if body.name.startswith('bass'):
                exposed=exposed or all((v.co-W).dot(along)>-.0499 for v in vertices)
            else:
                exposed=exposed or all((v.co-S).dot(upper)>.09 for v in vertices)
        warm_skin=r>.07 and .65<g/r<.97 and .50<b/r<.93 and g>b*1.02 and r>g*1.02
        if (exposed and warm_skin) or (r>.5 and r>g*1.02 and g>b*1.03 and r-b>.1 and (av.colour_class(texels[face.index])=='skin').mean()>=.8):
            chosen.append(face.index);samples.append(rgb)
    if not samples:raise RuntimeError('No exposed arm skin samples')
    rgb=np.percentile(np.array(samples),60,axis=0)
    image=bpy.data.images.new(body.name+'-smooth-arm-skin',32,32,alpha=False)
    rgba=np.empty((32,32,4),dtype=np.float32);rgba[:,:,:3]=rgb;rgba[:,:,3]=1
    image.pixels.foreach_set(rgba.ravel());image.pack()
    mat=av.plain_material(body.name+'-smooth-arm-skin',image);mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
    body.data.materials.append(mat);idx=len(body.data.materials)-1
    for i in chosen:body.data.polygons[i].material_index=idx
    return {'skinFaces':len(chosen),'skinDisplayRGB':rgb.tolist(),'outfitHairFaceTexturesPreserved':True}


def repair_member(arm,body,name,band):
    result={}
    result['wrists']={s:wrist_surface(arm,body,s,band.strings_motion.hand_frame,pin_forearm=name=='bass-player') for s in ['Left','Right']}
    # Recompute blend weights from the repaired geometry in the true anatomical
    # frame. Every cuff ring gets one longitudinal blend, rather than inheriting
    # angular weight discontinuities from the crumpled source wrist.
    for side in (['Left','Right'] if name=='vocal' else []):
     W=arm.data.bones[side+'Hand'].head_local;E=arm.data.bones[side+'ForeArm'].head_local;along,_=band.strings_motion.hand_frame(arm,side);axis=W-E
     names={g.index:g.name for g in body.vertex_groups};owned={side+n for n in ['ForeArm','ForeArmTwist','Hand']}
     for v in body.data.vertices:
      if sum(g.weight for g in v.groups if names[g.group]in owned)<.5:continue
      if any(names[g.group].startswith(side+'Hand') and names[g.group]!=side+'Hand' and g.weight>.01 for g in v.groups):continue
      l=(v.co-W).dot(along)
      if not -.13<l<.09:continue
      hand=band.av.smoothstep(-.025,.012,l);u=(v.co-E).dot(axis)/axis.length_squared;twist=band.av.smoothstep(.1,.75,u)
      weights={side+'Hand':hand,side+'ForeArmTwist':(1-hand)*twist,side+'ForeArm':(1-hand)*(1-twist)}
      for gi in [g.group for g in v.groups]:body.vertex_groups[gi].remove([v.index])
      for n,w in weights.items():
       if w>1e-6:body.vertex_groups[n].add([v.index],w,'REPLACE')
    if name=='vocal':
     result['restoredShoulderSkinWeights']=restore_shoulder_skin_weights(arm,body,band)
     result['shirtAttachment']=garment_head_weights(arm,body,band.av,result['restoredShoulderSkinWeights']['sourceCoreWeights'])
     result['shoulders']=shoulder_weights(arm,body,iterations=72)
    result['skin']=skin_material(arm,body,band.av)
    return result


def garment_head_weights(arm,body,av,donors):
    """Keep black shirt/print vertices on the chest, distinct from curtains."""
    av._pixel_cache.clear();texels=av.face_texels(body);labels=defaultdict(list)
    for face,rgb in zip(body.data.polygons,texels):
        r,g,b=rgb.T;warm=(r>.07)&(g/r.clip(.001)>.65)&(g/r.clip(.001)<.97)&(b/r.clip(.001)>.5)&(b/r.clip(.001)<.93)&(g>b*1.02)&(r>g*1.02)
        neutral=(g/r.clip(.001)>.65)&(b/r.clip(.001)>.65)
        for i in face.vertices:labels[i].append((float(warm.mean()),float(neutral.mean())))
    names={g.index:g.name for g in body.vertex_groups};changed=[]
    S=[arm.data.bones[s+'Arm'].head_local.copy()for s in ['Left','Right']]
    for v in body.data.vertices:
        if v.index not in donors:continue
        if sum(g.weight for g in v.groups if names[g.group]in ['Head','neck'])<.1:continue
        shoulder=min(S,key=lambda s:(v.co-s).length)
        if not (shoulder.z-.25<v.co.z<shoulder.z+.07 and -.11<v.co.y<.105 and abs(v.co.x)<.255):continue
        if v.co.z>shoulder.z+.02 and abs(v.co.x)>abs(shoulder.x)+.025:continue
        if not labels[v.index] or np.mean([x[0]for x in labels[v.index]])>=.5 or np.mean([x[1]for x in labels[v.index]])<.6:continue
        row={n:w for n,w in donors[v.index].items()if n not in ('Head','neck')};total=sum(row.values())
        if total<.1:continue
        for gi in [g.group for g in v.groups]:body.vertex_groups[gi].remove([v.index])
        for n,w in row.items():
            if w>1e-6:body.vertex_groups[n].add([v.index],w/total,'REPLACE')
        changed.append(v.index)
    return {'vertices':len(changed),'criterion':'Shirt torso/cuff surfaces exclude skin and the long side/front/back hair curtains; remove erroneous head/neck influence','vertexIndices':changed}
