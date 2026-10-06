"""Analytic two-bone drummer solve with constrained roll and a fixed stick tip.

The wrist is derived from the hand orientation and actual stick attachment.
A smooth elbow swivel completes the joint triangle, avoiding the straight-arm
singularity of IK. All output is baked to ordinary glTF bone transforms.
"""
import math
import bpy
from mathutils.bvhtree import BVHTree
_TORSO = {}
_SKIN = {}
import numpy as np
from mathutils import Vector, Matrix, Euler, Quaternion

def minimize(fn, x, step=0.18, iterations=160):
    points = [list(x)]
    for i in range(len(x)):
        p = list(x)
        p[i] += step
        points.append(p)
    scored = [(fn(p)[0], p) for p in points]
    for _ in range(iterations):
        scored.sort(key=lambda p: p[0])
        best = scored[0][0]
        centroid = [sum((p[1][i] for p in scored[:-1])) / len(x) for i in range(len(x))]
        worst = scored[-1][1]
        reflected = [2 * c - w for (c, w) in zip(centroid, worst)]
        fr = fn(reflected)[0]
        if fr < scored[0][0]:
            expanded = [3 * c - 2 * w for (c, w) in zip(centroid, worst)]
            fe = fn(expanded)[0]
            scored[-1] = (fe, expanded) if fe < fr else (fr, reflected)
        elif fr < scored[-2][0]:
            scored[-1] = (fr, reflected)
        else:
            contracted = [c + 0.5 * (w - c) for (c, w) in zip(centroid, worst)]
            fc = fn(contracted)[0]
            if fc < scored[-1][0]:
                scored[-1] = (fc, contracted)
            else:
                p0 = scored[0][1]
                scored = [scored[0]] + [(fn(p)[0], p) for p in [[v + 0.5 * (w - v) for (v, w) in zip(p0, row[1])] for row in scored[1:]]]
        if max((abs(scored[0][0] - row[0]) for row in scored)) < 1e-09:
            break
    return min(scored, key=lambda p: p[0])[1]

def problem(a, side, tip, stick_frame):
    sign = 1 if side == 'Left' else -1
    (up, fo, ha) = [a.pose.bones[side + n] for n in ['Arm', 'ForeArm', 'Hand']]
    S = up.head.copy()
    A = (fo.bone.head_local - up.bone.head_local).length
    B = (ha.bone.head_local - fo.bone.head_local).length
    Ur = up.parent.matrix.to_3x3().normalized() @ (up.parent.bone.matrix_local.to_3x3().inverted() @ up.bone.matrix_local.to_3x3())
    R0 = fo.bone.matrix_local.to_3x3().inverted() @ ha.bone.matrix_local.to_3x3()
    (grip, axis, palm) = stick_frame(a, side)
    stick_tip = ha.bone.matrix_local.to_3x3().inverted() @ (grip + axis * (.23 if side=='Left' else .29) - ha.bone.head_local)
    roots=[a.data.bones[side+'Hand'+f+'1'].head_local for f in ('Index','Middle','Ring','Pinky')]
    f0=(sum(roots,Vector())/4-ha.bone.head_local).normalized()
    across=(roots[0]-roots[3]);across=(across-f0*across.dot(f0)).normalized()
    p0=a.data.bones[side+'HandIndex1'].matrix_local.to_3x3().col[2].copy()
    p0=(p0-f0*p0.dot(f0)-across*p0.dot(across)).normalized()
    rest = Matrix((f0, p0, f0.cross(p0))).transposed()
    f = Vector((sign * 0.1, -1, -0.05)).normalized()
    p = Vector((-sign * 0.2, 0, -1))
    p = (p - f * p.dot(f)).normalized()
    Hb = Matrix((f, p, f.cross(p))).transposed() @ rest.inverted() @ ha.bone.matrix_local.to_3x3()

    body=bpy.data.objects[a.name.replace('-rig','-body')]
    group_names={g.index:g.name for g in body.vertex_groups}
    if body.as_pointer() not in _TORSO:
        faces=[tuple(p.vertices) for p in body.data.polygons if all(sum(g.weight for g in body.data.vertices[i].groups if group_names[g.group] in ('Hips','Spine','Spine01','Spine02'))>.8 for i in p.vertices)]
        _TORSO[body.as_pointer()]=faces
    # The current seated spine transforms the real shirt/torso vertices.
    deps=bpy.context.evaluated_depsgraph_get(); evaluated=body.evaluated_get(deps); mesh=evaluated.to_mesh()
    torso=BVHTree.FromPolygons([v.co.copy() for v in mesh.vertices],_TORSO[body.as_pointer()]);evaluated.to_mesh_clear()
    cache=(body.as_pointer(),side)
    if cache not in _SKIN:
        candidates=[]
        for v in body.data.vertices:
            weights=[(group_names[g.group],g.weight) for g in v.groups if g.weight>1e-6]
            if any('Hand'+f in n and w>.1 for n,w in weights for f in ('Index','Middle','Ring','Pinky','Thumb')):continue
            if sum(w for n,w in weights if n.startswith(side+'ForeArm') or n==side+'Hand')<.8:continue
            candidates.append((v.co.copy(),weights))
        points=np.array([list(v) for v,w in candidates]);distances=np.full(len(points),np.inf);chosen=[];index=0
        for _ in range(min(180,len(points))):
            chosen.append(index);distances=np.minimum(distances,((points-points[index])**2).sum(1));index=int(distances.argmax())
        _SKIN[cache]=[[(n,w,a.data.bones[n].matrix_local.inverted()@candidates[i][0])for n,w in candidates[i][1]]for i in chosen]
    samples=_SKIN[cache];moving={side+n for n in ('Arm','ForeArm','ForeArmTwist','Hand')}
    stationary={n:a.pose.bones[n].matrix.copy()for row in samples for n,w,v in row if n not in moving}
    def clearance(point):
        nearest,normal,index,distance=torso.find_nearest(point)
        return distance if (point-nearest).dot(normal)>=0 else -distance

    def fn(x):
        H = Euler(x[:3], 'XYZ').to_matrix() @ Hb
        W = tip - H @ stick_tip
        d = W - S
        D = d.length
        d.normalize()
        c = (A * A - B * B + D * D) / (2 * D)
        h = math.sqrt(max(0, A * A - c * c))
        pole = Vector((sign * 0.18, -0.01, -0.24))
        n = pole - d * pole.dot(d)
        n.normalize()
        n = Matrix.Rotation(x[3], 3, d) @ n
        E = S + d * c + n * h
        ax = (E - S).normalized()
        U = Ur.col[1].rotation_difference(ax).to_matrix() @ Ur
        anterior = U @ up.bone.matrix_local.to_3x3().inverted() @ Vector((0, -1, 0))
        anterior = (anterior - ax * anterior.dot(ax)).normalized()
        bend = W - E
        bend = (bend - ax * bend.dot(ax)).normalized()
        roll = math.atan2(ax.dot(anterior.cross(bend)), anterior.dot(bend))
        U = Matrix.Rotation(roll, 3, ax) @ U
        Fr = U @ (up.bone.matrix_local.to_3x3().inverted() @ fo.bone.matrix_local.to_3x3())
        F = Fr.col[1].rotation_difference((W - E).normalized()).to_matrix() @ Fr
        q = (F.inverted() @ H @ R0.inverted()).to_quaternion()
        if q.w < 0:
            q = -q
        twist = Quaternion((q.w, 0, q.y, 0)).normalized()
        swing = q @ twist.inverted()
        prono = 2 * math.atan2(twist.y, twist.w)
        flex = (E - S).angle(W - E)
        physical_wrist=(H@ha.bone.matrix_local.to_3x3().inverted()@f0).angle(W-E)
        # Metres for clearance/reach; radians for anatomical angles. Soft
        # bounds let the optimizer remain smooth near a limit. The exported
        # artifact is checked separately against the final acceptance gates.
        penalty = sum((
            (max(0, E.z - (S.z + 0.005)) / 0.008) ** 2,
            (max(0, S.z - 0.255 - E.z) / 0.008) ** 2,
            (max(0, tip.z + 0.035 - W.z) / 0.008) ** 2,
            (max(0, tip.y + 0.09 - W.y) / 0.008) ** 2,
            (max(0, D - (A + B) * 0.985) / 0.005) ** 2,
            (max(0, abs(roll) - math.radians(75)) / math.radians(3)) ** 2,
            (max(0, swing.angle - math.radians(26)) / math.radians(2)) ** 2,
            (max(0, abs(prono) - math.radians(85)) / math.radians(3)) ** 2,
            (max(0, math.radians(40) - flex) / math.radians(3)) ** 2,
            (max(0, flex - math.radians(120)) / math.radians(3)) ** 2,
            (max(0, (0.155 if side == 'Left' else 0.12) - sign * E.x) / 0.008) ** 2,
            10*(max(0, E.y - S.y - 0.055) / 0.008) ** 2,
            (max(0, S.y - E.y - 0.16) / 0.008) ** 2,
        ))
        distances=[]
        for t in (.15,.3,.5,.7,.9,1.):
            point=E.lerp(W,t);radius=.047*(1-t)+.032*t
            distances.append(clearance(point)-radius)
        penalty+=20*(max(0,physical_wrist-math.radians(12))/math.radians(2))**2
        penalty+=sum((max(0,.008-d)/.004)**2 for d in distances)
        transforms={side+'Arm':(U,S),side+'ForeArm':(F,E),side+'ForeArmTwist':(F@Quaternion((0,1,0),prono).to_matrix(),E),side+'Hand':(H,W)}
        skin_distances=[]
        for row in samples:
            point=Vector()
            for n,w,v in row:
                if n in transforms:r,t=transforms[n];point+=w*(t+r@v)
                else:point+=w*(stationary[n]@v)
            skin_distances.append(clearance(point))
        penalty+=sum(5*(max(0,.008-d)/.003)**2 for d in skin_distances)
        actual_palm=H@ha.bone.matrix_local.to_3x3().inverted()@p0
        penalty+=(max(0,actual_palm.z+.6)/.1)**2
        loss = penalty * 20 + (swing.angle / math.radians(15)) ** 2 + (roll / math.radians(40)) ** 2 + ((flex - math.radians(70)) / math.radians(50)) ** 2 + ((E - S - Vector((sign * 0.1, -0.02, -0.21))).length / 0.1) ** 2 + max(0, (H @ ha.bone.matrix_local.to_3x3().inverted() @ p0).z + 0.4) ** 2 * 3
        return (loss, {'S':list(S),'physicalWrist':math.degrees(physical_wrist),'palmZ':actual_palm.z,'minimumTorsoClearance':min(distances),'minimumSkinTorsoClearance':min(skin_distances),'wristBend': math.degrees(swing.angle), 'upperRoll': math.degrees(roll), 'pronation': math.degrees(prono), 'flexion': math.degrees(flex), 'reach': D, 'E': list(E), 'W': list(W), 'H': [list(row) for row in H]}, (U, F, H, S, E, W))
    return fn
