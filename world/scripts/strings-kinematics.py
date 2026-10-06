"""Contact-driven guitar/bass poses, solved in armature coordinates and baked."""
import math
from mathutils import Vector, Matrix, Quaternion, Euler
from mathutils.bvhtree import BVHTree
import numpy as np
_SKIN_SAMPLES = {}


def hand_frame(arm, side):
    bones = arm.data.bones
    wrist = bones[side + 'Hand'].head_local
    roots = [bones[side + 'Hand' + f + '1'].head_local for f in ('Index', 'Middle', 'Ring', 'Pinky')]
    along = (sum(roots, Vector()) / 4 - wrist).normalized()
    across = roots[0] - roots[3]
    across = (across - along * across.dot(along)).normalized()
    palm = bones[side + 'HandIndex1'].matrix_local.to_3x3().col[2].copy()
    palm = (palm - along * palm.dot(along) - across * palm.dot(across)).normalized()
    return along, palm


def curled_tip(arm, side, finger, angles):
    """Tip in the Hand joint frame, including the actual curved bind chain."""
    bones = arm.data.bones
    parent = bones[side + 'Hand']
    matrix = Matrix.Identity(4)
    for i, angle in enumerate(angles, 1):
        bone = bones[side + 'Hand' + finger + str(i)]
        matrix = matrix @ parent.matrix_local.inverted() @ bone.matrix_local
        matrix = matrix @ Quaternion((1, 0, 0), angle).to_matrix().to_4x4()
        parent = bone
    return (matrix @ parent.matrix_local.inverted() @ bones[side + 'Hand' + finger + '4'].matrix_local).translation


class Instrument:
    def __init__(self, obj):
        self.tree = BVHTree.FromPolygons([v.co.copy() for v in obj.data.vertices], [tuple(p.vertices) for p in obj.data.polygons])

    def front(self, point):
        """Sample the real front surface, rather than the prop's global depth."""
        direction=getattr(self,'palm_direction',Vector((0,1,0))).normalized()
        origin = point - direction*2
        hit, normal, index, distance = self.tree.ray_cast(origin,direction,4)
        if hit is None:
            raise RuntimeError('Instrument contact ray missed the playing surface')
        return hit-direction*.003

    def signed_distance(self, point):
        nearest, normal, index, distance = self.tree.find_nearest(point)
        return distance if (point-nearest).dot(normal) >= 0 else -distance


def problem(arm, body, side, contact, finger_tip, surface, deformation, reference):
    sign = 1 if side == 'Left' else -1
    up, fore, hand = [arm.pose.bones[side+n] for n in ('Arm', 'ForeArm', 'Hand')]
    S = up.head.copy()
    A = (fore.bone.head_local - up.bone.head_local).length
    B = (hand.bone.head_local - fore.bone.head_local).length
    Ur = up.parent.matrix.to_3x3().normalized() @ up.parent.bone.matrix_local.to_3x3().inverted() @ up.bone.matrix_local.to_3x3()
    R0 = fore.bone.matrix_local.to_3x3().inverted() @ hand.bone.matrix_local.to_3x3()
    f0, p0 = hand_frame(arm, side)
    Rest = Matrix((f0, p0, f0.cross(p0))).transposed()
    f = Vector((-.25, -.65, .72) if side == 'Left' else ((.3,-.3,-.9) if arm.name.startswith('bass') else (.9, -.25, -.18))).normalized()
    p = Vector((0,-1,0)) if side=='Left' else deformation.to_3x3() @ surface.palm_direction
    p = (p - f * p.dot(f)).normalized()
    Hb = Matrix((f, p, f.cross(p))).transposed() @ Rest.inverted() @ hand.bone.matrix_local.to_3x3()
    inverse = deformation.inverted()
    cache_key = (body.as_pointer(), side)
    if cache_key not in _SKIN_SAMPLES:
        groups = {g.index:g.name for g in body.vertex_groups}
        candidates = []
        W0 = hand.bone.head_local
        for v in body.data.vertices:
            weights = [(groups[g.group],g.weight) for g in v.groups if g.weight>1e-6]
            if (v.co-W0).length>.26: continue
            if any('Hand'+f in n and w>.1 for n,w in weights for f in ('Index','Middle','Ring','Pinky','Thumb')): continue
            if sum(w for n,w in weights if n.startswith(side+'ForeArm') or n==side+'Hand')<.85: continue
            candidates.append((v.co.copy(), weights))
        # Farthest-point coverage includes cuff protrusions that a bone-centred
        # capsule misses, and covers the whole irregular wrist/palm surface.
        points = np.array([list(v) for v,w in candidates])
        chosen=[]; distances=np.full(len(points),np.inf); index=0
        for _ in range(min(200,len(points))):
            chosen.append(index)
            distances=np.minimum(distances,((points-points[index])**2).sum(1))
            index=int(distances.argmax())
        _SKIN_SAMPLES[cache_key] = [[(n,w,arm.data.bones[n].matrix_local.inverted()@candidates[i][0]) for n,w in candidates[i][1]] for i in chosen]
    skin_samples = _SKIN_SAMPLES[cache_key]
    stationary = {n:arm.pose.bones[n].matrix.copy() for row in skin_samples for n,w,v in row if n not in {side+'Arm',side+'ForeArm',side+'ForeArmTwist',side+'Hand'}}
    def evaluate(x):
        H = Euler(x[:3], 'XYZ').to_matrix() @ Hb
        W = contact - H @ finger_tip
        direction = W-S
        D = direction.length
        direction.normalize()
        c = (A*A-B*B+D*D)/(2*D)
        height = math.sqrt(max(0, A*A-c*c))
        pole = Vector((sign*.18, .005, -.19))
        n = (pole-direction*pole.dot(direction)).normalized()
        n = Matrix.Rotation(x[3], 3, direction) @ n
        E = S + direction*c + n*height
        axis = (E-S).normalized()
        U = Ur.col[1].rotation_difference(axis).to_matrix() @ Ur
        anterior = U @ up.bone.matrix_local.to_3x3().inverted() @ Vector((0, -1, 0))
        anterior = (anterior-axis*anterior.dot(axis)).normalized()
        bend = W-E
        bend = (bend-axis*bend.dot(axis)).normalized()
        roll = math.atan2(axis.dot(anterior.cross(bend)), anterior.dot(bend))
        U = Matrix.Rotation(roll, 3, axis) @ U
        Fr = U @ up.bone.matrix_local.to_3x3().inverted() @ fore.bone.matrix_local.to_3x3()
        F = Fr.col[1].rotation_difference((W-E).normalized()).to_matrix() @ Fr
        q = (F.inverted() @ H @ R0.inverted()).to_quaternion()
        if q.w < 0: q = -q
        twist = Quaternion((q.w, 0, q.y, 0)).normalized()
        bind_bend = (q @ twist.inverted()).angle
        metacarpal = H @ hand.bone.matrix_local.to_3x3().inverted() @ f0
        wrist = metacarpal.angle((W-E).normalized())
        pronation = 2*math.atan2(twist.y, twist.w)
        flex = (E-S).angle(W-E)
        penalties = [
            (max(0, D-(A+B)*.97)/.005)**2,
            (10 if arm.name.startswith('bass') else 1)*(max(0, wrist-math.radians(12 if arm.name.startswith('bass') else 10))/math.radians(2))**2,
            (max(0, abs(pronation)-math.radians(85))/math.radians(3))**2,
            (max(0, abs(roll)-math.radians(88))/math.radians(3))**2,
            (max(0, math.radians(30)-flex)/math.radians(3))**2,
            (max(0, flex-math.radians(140 if side=='Left' else 125))/math.radians(3))**2,
            (max(0, .14-sign*E.x)/.01)**2,
            (max(0, E.z-S.z+(-.01 if side=='Right' and arm.name.startswith('bass') else .02))/.008)**2,
        ]
        penalties.append((max(0,bind_bend-math.radians(26))/math.radians(2))**2)
        # Swept arm volumes keep sleeves and wrists outside the solid prop.
        for first, last, radii in [(S,E,(.055,.050))]:
            for u in [.05,.25,.5,.75,1]:
                point = first.lerp(last,u)
                radius = radii[0]*(1-u)+radii[1]*u
                d = surface.signed_distance(inverse @ point)
                penalties.append((max(0, radius+.007-d)/.005)**2)
        Ft = F @ Quaternion((0,1,0),pronation).to_matrix()
        transforms = {side+'Arm':(U,S),side+'ForeArm':(F,E),side+'ForeArmTwist':(Ft,E),side+'Hand':(H,W)}
        skin_distances=[]
        for row in skin_samples:
            point=Vector()
            for n,w,v in row:
                if n in transforms:
                    r,t=transforms[n]; point += w*(t+r@v)
                else: point += w*(stationary[n]@v)
            d=surface.signed_distance(inverse@point)
            skin_distances.append(d)
            penalties.append(8*(max(0,.008-d)/.002)**2)
        regularity = 2 * sum((v-r)**2 for v,r in zip(x, reference))
        loss = 20*sum(penalties) + (wrist/math.radians(10))**2 + (roll/math.radians(50))**2 + ((flex-math.radians(80))/math.radians(60))**2 + regularity
        return loss, {'contact':list(contact),'wristClearance':surface.signed_distance(inverse@W),'tipPalmDot':(H@finger_tip).dot(deformation.to_3x3()@surface.palm_direction),'palmInwardDot':(H@hand.bone.matrix_local.to_3x3().inverted()@p0).dot(deformation.to_3x3()@surface.palm_direction),'wristBend':math.degrees(wrist),'bindWristBend':math.degrees(bind_bend),'upperArmRoll':math.degrees(roll),'forearmPronation':math.degrees(pronation),'elbowFlexion':math.degrees(flex),'S':list(S),'E':list(E),'W':list(W),'largestPenalty':max(penalties),'minimumSkinClearance':min(skin_distances),'worstSkinSample':[(n,w,list(v))for n,w,v in skin_samples[skin_distances.index(min(skin_distances))]]}, (U,F,H,S,E,W)
    evaluate.physical_seeds=[]
    if side=='Right':
        for values in [(.6,-.65,-.35),(.7,-.55,-.45),(.75,-.45,-.45),(.65,-.4,-.65),(.8,-.3,-.5)]:
            fingers=Vector(values).normalized()
            palm=deformation.to_3x3()@surface.palm_direction
            palm=(palm-fingers*palm.dot(fingers)).normalized()
            target=Matrix((fingers,palm,fingers.cross(palm))).transposed()@Rest.inverted()@hand.bone.matrix_local.to_3x3()
            angles=list((target@Hb.inverted()).to_euler('XYZ'))
            wrist=contact-target@finger_tip
            direction=(wrist-S).normalized()
            pole=Vector((sign*.18,.005,-.19));n=(pole-direction*pole.dot(direction)).normalized()
            wanted=Vector((sign*.12,-.15,-.07));wanted=(wanted-direction*wanted.dot(direction)).normalized()
            phi=math.atan2(direction.dot(n.cross(wanted)),n.dot(wanted))
            evaluate.physical_seeds.extend([angles+[phi+d] for d in (-.3,0.,.3)])
    return evaluate
