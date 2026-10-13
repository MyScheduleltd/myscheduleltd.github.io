"""Repair native male torso/shoulder skin weights through live Blender MCP.

Open the preserved production-before.blend, execute this script, then transfer
weight-changes.json into the existing GLB joint/weight accessors. Keep all other
asset buffers, transforms and images byte-identical. See the dated review.
"""
import bpy,json,math,numpy as np
from pathlib import Path
from collections import defaultdict
base=Path(bpy.data.filepath).parent
assert Path(bpy.data.filepath).name=='production-before.blend', 'Open the preserved production-before.blend through Blender MCP first'
body=bpy.data.objects['GEO-male-regeneration-candidate'];rig=bpy.data.objects['RIG-male-regeneration-candidate']
def ease(t):
    t=max(0.,min(1.,t));return t*t*(3.-2.*t)
def key(p):return tuple(math.floor(x*1e6+.5) for x in p)
# Weld only the weight-solver graph. Keep native geometry, UVs and normals.
ids={};points=[];source={};members=defaultdict(list)
for v in body.data.vertices:
    x,y,z=v.co
    if abs(x)>.30 or z<.025 or z>.355:continue
    if body.data.attributes['_hair'].data[v.index].value>.5 or body.data.attributes['_skin'].data[v.index].value<.5:continue
    k=key(v.co)
    if k not in ids:ids[k]=len(points);points.append(v.co.copy());source[ids[k]]=v.index
    members[ids[k]].append(v.index)
edges=set()
for e in body.data.edges:
    a,b=(ids.get(key(body.data.vertices[i].co)) for i in e.vertices)
    if a is not None and b is not None and a!=b:edges.add(tuple(sorted([a,b])))
adj=defaultdict(set)
for a,b in edges:adj[a].add(b);adj[b].add(a)
# Below the underarm the torso and two arms are separate connected surfaces.
# Pin those components instead of accidentally slicing the medial arm by X.
low={i for i,p in enumerate(points) if p.z<.135};unseen=set(low);component=[];pins={}
while unseen:
    start=unseen.pop();todo=[start];group=[start]
    while todo:
        i=todo.pop()
        for j in adj[i]:
            if j in unseen:unseen.remove(j);todo.append(j);group.append(j)
    centre=sum(points[i].x for i in group)/len(group)
    arm=1. if abs(centre)>.17 else 0.
    for i in group:pins[i]=arm
    component.append({'vertices':len(group),'centreX':centre,'arm':arm})
for i,p in enumerate(points):
    if abs(p.x)<.12 and p.z<.29:pins[i]=0.
    if abs(p.x)<.085 and p.z>.29:pins[i]=0.
    if abs(p.x)>.215:pins[i]=1.
n=len(points);a=[];b=[];w=[]
for i,j in edges:
    weight=1./max((points[i]-points[j]).length,1e-5)
    a.extend([i,j]);b.extend([j,i]);w.extend([weight,weight])
a=np.array(a);b=np.array(b);w=np.array(w);denom=np.bincount(a,weights=w,minlength=n)
pin_ids=np.array(list(pins));pin_values=np.array(list(pins.values()))
field=np.full(n,.5);field[pin_ids]=pin_values
for iteration in range(5000):
    avg=np.bincount(a,weights=w*field[b],minlength=n)/np.maximum(denom,1e-8)
    newer=.5*field+.5*avg;newer[pin_ids]=pin_values
    delta=np.max(np.abs(newer-field));field=newer
    if delta<1e-7:break
assert delta<1e-5,delta
changes=[]
for i,p in enumerate(points):
    cap=ease(float(field[i]));side='Left' if p.x>0 else 'Right'
    if p.z<.135 and cap>.999999:continue
    spine_order=['Hips','Spine02','Spine01','Spine'];torso={'Spine':1.}
    for lower,upper in zip(spine_order,spine_order[1:]):
        za=rig.data.bones[lower].head_local.z;zb=rig.data.bones[upper].head_local.z
        if p.z<=zb:
            t=ease((p.z-za)/(zb-za));torso={lower:1.-t,upper:t};break
    arm=ease((abs(p.x)-.10)/.06)
    limbs={side+'Shoulder':1.-arm,side+'Arm':arm}
    new={name:weight*cap for name,weight in limbs.items()}
    for name,weight in torso.items():new[name]=weight*(1.-cap)
    new={name:weight for name,weight in new.items() if weight>1e-7}
    total=sum(new.values());new={name:weight/total for name,weight in new.items()};assert len(new)<=4
    for vi in members[i]:
        vv=body.data.vertices[vi];before={body.vertex_groups[g.group].name:g.weight for g in vv.groups if g.weight>1e-8}
        if all(abs(before.get(name,0)-new.get(name,0))<1e-6 for name in set(before)|set(new)):continue
        changes.append({'vertex':vi,'p':list(vv.co),'old':before,'new':new})
for c in changes:
    v=body.data.vertices[c['vertex']]
    for g in list(v.groups):body.vertex_groups[g.group].remove([v.index])
    for name,weight in c['new'].items():body.vertex_groups[name].add([v.index],weight,'REPLACE')
bpy.context.view_layer.update()
json.dump({'changes':changes},open(base/'weight-changes.json','w'))
json.dump({'solver':'welded surface harmonic blend','iterations':iteration+1,'convergence':float(delta),'lowComponents':component,'vertices':n,'changedBlenderVertices':len(changes)},open(base/'solver-report.json','w'))
bpy.ops.wm.save_as_mainfile(filepath=str(base/'wave-weights-fixed.blend'))
print(json.dumps({'changedBlenderVertices':len(changes),'iterations':iteration+1,'convergence':float(delta),'components':component[:5]}))
