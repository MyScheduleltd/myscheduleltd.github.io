"""Build the rooftop band from its Higgsfield generations.

Four musicians (a lead vocalist, a bassist, a lead guitarist and a drummer),
their instruments, a stage set and a bonfire with two log benches, generated
on Higgsfield on 2026-09-27 in the style of the visitor avatars (jobs listed in
band/jobs.json next to the sources). They play on the roof over the pop-up
shop while the jukebox has a record on, and sit round the bonfire while it
has none.

Each musician goes through the same steps as a visitor's body (welded, the
fused fingers rebuilt with three bones each, the texture rebaked into one
padded atlas), then gets its animations, authored here: IK targets are keyed
on the instruments and baked into plain bone keys, so the game only plays
clips. Everything faces -Y (the character's front), in metres; the game scales
by the avatars' factor and turns the set to face the beach.

Run from world/:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
    -P scripts/prepare-band.py -- [source-dir]

Writes src/assets/band/<member>.glb, stage.glb and bonfire.glb.
"""
import bpy, os, sys, math, json, importlib.util
import numpy as np
from mathutils import Vector, Matrix, Quaternion, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
WORLD = os.path.dirname(HERE)
spec = importlib.util.spec_from_file_location('avatars', os.path.join(HERE, 'prepare-higgsfield-avatars.py'))
av = importlib.util.module_from_spec(spec)
spec.loader.exec_module(av)
spec_drums = importlib.util.spec_from_file_location('drummer_kinematics', os.path.join(HERE, 'drummer-kinematics.py'))
drum_motion = importlib.util.module_from_spec(spec_drums)
spec_drums.loader.exec_module(drum_motion)

spec_strings = importlib.util.spec_from_file_location('strings_kinematics', os.path.join(HERE, 'strings-kinematics.py'))
strings_motion = importlib.util.module_from_spec(spec_strings)
spec_strings.loader.exec_module(strings_motion)
spec_surface = importlib.util.spec_from_file_location('joint_surface', os.path.join(HERE, 'joint-surface-repair.py'))
joint_surface = importlib.util.module_from_spec(spec_surface)
spec_surface.loader.exec_module(joint_surface)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SOURCE = ARGS[0] if ARGS else os.path.abspath(os.path.join(WORLD, '../art/generated/band'))
OUT = os.path.join(WORLD, 'src/assets/band')
os.makedirs(OUT, exist_ok=True)
av.OUT = OUT

FPS = 30
BEAT = 15                  # frames per beat: 120 bpm
BAR = 4 * BEAT
# Member, sex, height (crown to sole, metres; the male visitor is 1.7).
MEMBERS = [('vocal', 'female', 1.62), ('bass-player', 'female', 1.62), ('guitarist', 'male', 1.7), ('drummer', 'male', 1.7)]
report = {}


# ------------------------------------------------------------ helpers

def import_glb(name):
    new = av.added(lambda: bpy.ops.import_scene.gltf(filepath=os.path.join(SOURCE, name + '.glb')))
    return new


def rest(arm, name):
    return arm.data.bones[name].matrix_local.to_3x3()


def head(arm, name):
    return arm.data.bones[name].head_local.copy()


def world_turn(pb, R):
    """Pose a bone by a turn R given in world axes about its own head, over its rest."""
    B = pb.bone.matrix_local.to_3x3()
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = (B.inverted() @ R @ B).to_quaternion()


def world_move(pb, delta):
    """Move a bone (the hips) by a world offset over its rest."""
    pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector(delta)


def rot(axis, degrees):
    return Matrix.Rotation(math.radians(degrees), 3, axis)


def empty(name, location, parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = .03
    e.location = location
    if parent:
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    return e


def key(obj, frame, *paths):
    # q and -q encode the same rotation, but interpolating their components
    # crosses zero and produces a full wrist spin. Keep adjacent keys on one
    # quaternion hemisphere before Blender creates the animation curves.
    if 'rotation_quaternion' in paths:
        previous = obj.get('_previous_rotation')
        if previous and sum(a*b for a,b in zip(previous, obj.rotation_quaternion)) < 0:
            obj.rotation_quaternion.negate()
        obj['_previous_rotation'] = list(obj.rotation_quaternion)
    for p in paths:
        obj.keyframe_insert(p, frame=frame)


def cyclic(action):
    """Every curve loops, so the first key equals the last and the clip seams."""
    for fc in av_fcurves(action):
        mod = fc.modifiers.new('CYCLES')
        for k in fc.keyframe_points:
            k.interpolation = 'BEZIER'


def av_fcurves(action):
    # Blender 4.4+ keeps curves in layered actions; older ones on the action.
    if hasattr(action, 'layers') and action.layers:
        out = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out += list(bag.fcurves)
        return out
    return list(action.fcurves)


# ------------------------------------------------------------ the musicians

WORK = os.path.join(WORLD, '.artifacts/band')
os.makedirs(WORK, exist_ok=True)


def repair_torso_weights(arm, body, name):
    bones=arm.data.bones
    hip=bones['Hips'].head_local.z; neck=bones['neck'].head_local.z
    shoulder=min(abs(bones[side+'Arm'].head_local.x) for side in ('Left','Right'))
    groups={g.index:g.name for g in body.vertex_groups}
    levels=sorted([(bones[n].head_local.z,n) for n in ('Hips','Spine','Spine01','Spine02','neck')])
    count=0
    for v in body.data.vertices:
        # Exclude the long hair, which is already assigned to Head.
        head_weight=sum(g.weight for g in v.groups if groups[g.group]=='Head')
        if head_weight>.4: continue
        centre=1-av.smoothstep(shoulder*.55,shoulder*1.03,abs(v.co.x))
        inside=hip+.015 < v.co.z < neck-.04
        skirt=name=='vocal' and hip-.23 < v.co.z < hip+.012 and abs(v.co.x)<.22
        if not inside and not skirt: continue
        if skirt: centre=1
        if centre<=0: continue
        z=v.co.z
        lower=max((item for item in levels if item[0]<=z),default=levels[0])
        upper=min((item for item in levels if item[0]>=z),default=levels[-1])
        t=(z-lower[0])/(upper[0]-lower[0]) if upper[0]>lower[0] else 0
        weights={'Hips':1} if skirt else {lower[1]:1-t,upper[1]:t} if upper!=lower else {lower[1]:1}
        old=[(groups[g.group],g.weight) for g in v.groups]
        for n,w in old: body.vertex_groups[n].add([v.index],w*(1-centre),'REPLACE')
        for n,w in weights.items(): body.vertex_groups[n].add([v.index],w*centre,'ADD')
        count+=1
    return count


def skirt_follows_thighs(arm, body):
    """Her skirt rides on her thighs, and her thighs are her own again.

    repair_torso_weights bound everything from the hips to the skirt's hem to
    the hips alone, the thighs inside it included. Standing that held the
    skirt still; seated, the knees went forward while the tops of the thighs
    stayed upright, the thigh-high socks stretched from knee to hip and stood
    out through the skirt (the owner, October 2: "the bottom of the lead
    singer's model looks broken"). Now what lies on a thigh follows that
    thigh, and the cloth around them blends from the hips into the nearer
    thigh with depth: the front panel nearly all the way, the back less, so
    seated it drapes over the lap and the back stays on the seat."""
    bones = arm.data.bones
    hip = bones['Hips'].head_local
    groups = {g.index: g.name for g in body.vertex_groups}
    r = thigh_radius(arm)
    axes = {side: (bones[side + 'UpLeg'].head_local.copy(), bones[side + 'Leg'].head_local.copy()) for side in ('Left', 'Right')}

    def to_axis(co, side):
        a, b = axes[side]
        ab = b - a
        t = max(0.0, min(1.0, (co - a).dot(ab) / ab.length_squared))
        return (co - (a + ab * t)).length, t

    legs = cloth = 0
    for v in body.data.vertices:
        co = v.co
        if not (hip.z - .23 < co.z < hip.z + .012 and abs(co.x) < .22):
            continue
        if sum(g.weight for g in v.groups if groups[g.group] == 'Head') > .4:
            continue
        side = 'Left' if co.x > 0 else 'Right'
        dist, along = to_axis(co, side)
        if dist < r * 1.12 and along > .02:
            # Leg: the thigh, blended into the hips only at its very top.
            share = av.smoothstep(.02, .18, along)
            weights = {side + 'UpLeg': share, 'Hips': 1 - share}
            legs += 1
        else:
            depth = max(0.0, min(1.0, (hip.z - co.z) / .23)) ** 1.2
            front = av.smoothstep(hip.y + .03, hip.y - .06, co.y)
            share = depth * (.35 + .5 * front)
            mix = av.smoothstep(-.04, .04, co.x)
            weights = {'Hips': 1 - share, 'LeftUpLeg': share * mix, 'RightUpLeg': share * (1 - mix)}
            cloth += 1
        for g in list(v.groups):
            body.vertex_groups[groups[g.group]].remove([v.index])
        for n, w in weights.items():
            if w > 1e-4:
                body.vertex_groups[n].add([v.index], w, 'REPLACE')
    return {'legs': legs, 'cloth': cloth}


def add_forearm_twists(arm, body):
    """Spread pronation down the forearm instead of twisting the elbow."""
    align_ik_endpoints(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for side in ('Left', 'Right'):
        fore = arm.data.edit_bones[side + 'ForeArm']
        twist = arm.data.edit_bones.new(side + 'ForeArmTwist')
        twist.head, twist.tail, twist.roll = fore.head.copy(), fore.tail.copy(), fore.roll
        twist.parent = fore
        arm.data.edit_bones[side + 'Hand'].parent = twist
    bpy.ops.object.mode_set(mode='OBJECT')
    changed = {}
    for side in ('Left', 'Right'):
        E = arm.data.bones[side + 'ForeArm'].head_local
        W = arm.data.bones[side + 'Hand'].head_local
        axis = W - E
        fore = body.vertex_groups[side + 'ForeArm']
        twist = body.vertex_groups.new(name=side + 'ForeArmTwist')
        n = 0
        for v in body.data.vertices:
            weight = sum(g.weight for g in v.groups if g.group == fore.index)
            if weight <= 1e-6:
                continue
            u = max(0, min(1, (v.co - E).dot(axis) / axis.length_squared))
            share = av.smoothstep(.15, .95, u)
            fore.add([v.index], weight * (1-share), 'REPLACE')
            if share:
                twist.add([v.index], weight * share, 'REPLACE')
            n += 1
        changed[side] = n
    return changed


def calibrate_palm_bind(arm, body, side="Right"):
    """Calibrate the right hand's neutral frame; keep connected digits rigid."""
    f,p=strings_motion.hand_frame(arm,side)
    W=arm.data.bones[side+'Hand'].head_local.copy()
    axis=(W-arm.data.bones[side+'ForeArm'].head_local).normalized()
    p=(p-axis*p.dot(axis)).normalized()
    desired=Vector((0,-1,-.3));desired=(desired-axis*desired.dot(axis)).normalized()
    angle=math.atan2(axis.dot(p.cross(desired)),p.dot(desired))
    names={g.index:g.name for g in body.vertex_groups}
    for v in body.data.vertices:
        w=min(1.,sum(g.weight for g in v.groups if names[g.group].startswith(side+'Hand')))
        if w: v.co=W+Matrix.Rotation(angle*w,3,axis)@(v.co-W)
    bpy.context.view_layer.objects.active=arm;arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bones=[b for b in arm.data.edit_bones if b.name.startswith(side+'Hand')]
    saved={b.name:(b.matrix.copy(),b.length,b.use_connect) for b in bones}
    for b in bones:b.use_connect=False
    T=Matrix.Translation(W)@Matrix.Rotation(angle,4,axis)@Matrix.Translation(-W)
    for b in bones:
        matrix,length,connected=saved[b.name];b.matrix=T@matrix;b.length=length
    for b in bones:b.use_connect=saved[b.name][2]
    bpy.ops.object.mode_set(mode='OBJECT');body.data.update()
    length_error=max(abs(arm.data.bones[n].length-row[1]) for n,row in saved.items())
    head_error=max((arm.data.bones[n].head_local-(T@row[0]).translation).length for n,row in saved.items())
    if length_error>1e-5 or head_error>1e-5:raise RuntimeError('Rigid hand bind transform changed finger geometry: '+str((side,length_error,head_error,[(n,(arm.data.bones[n].head_local-(T@row[0]).translation).length) for n,row in saved.items() if (arm.data.bones[n].head_local-(T@row[0]).translation).length>2e-6])))
    member=next(n for n,sex,height in MEMBERS if n in arm.name) if any(n in arm.name for n,sex,height in MEMBERS) else 'drummer'
    report.setdefault(member,{})[side+'RigidBindMaxLengthErrorMeters']=length_error
    report[member][side+'RigidBindMaxJointErrorMeters']=head_error
    arm[side+'PalmBindCorrected']=True
    report.setdefault(member,{})[side+'PalmBindCorrectionDegrees']=math.degrees(angle)


def prepare_member(name, sex, height):
    cached = os.path.join(WORK, name + '-prepared.blend')
    # BAND_REUSE=1 starts from the last prepared body: the clips can be
    # worked on without baking the texture again.
    if os.environ.get('BAND_REUSE') and os.path.exists(cached):
        bpy.ops.wm.open_mainfile(filepath=cached)
        report[name] = {'reused': True}
        return bpy.data.objects[name + '-rig'], bpy.data.objects[name + '-body']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    new = import_glb(name)
    arm = next(o for o in new if o.type == 'ARMATURE')
    body = next(o for o in new if o.type == 'MESH' and o.vertex_groups)
    for o in new:
        if o not in (arm, body):
            bpy.data.objects.remove(o, do_unlink=True)
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    av.strip_emission(body)
    v = av.world_verts(body)
    lo, hi = v[:, 2].min(), v[:, 2].max()
    s = height / (hi - lo)
    hips = av.bone_at(arm, 'Hips')
    av.bake(arm, body, Matrix.Translation((-hips.x * s, -hips.y * s, -lo * s)) @ Matrix.Scale(s, 4))
    av.weld(body)
    # Ring topology across the wrist supports bending. The supplied files
    # have a single hand joint and irregular, fused finger geometry.
    av.PALM_ROWS = [(-.03, .028, .016), (-.008, .026, .014), (.012, .032, .014),
                    (.032, .035, .013), (.052, .035, .012)]
    av.THUMB = {'base': (.023, .006, .003), 'lengths': (.025, .020, .016), 'width': .018,
                'dirs': ((.6, .65, .35), (.25, .9, .3), (.02, .96, .2))}
    report[name] = {'fingers': av.rebuild_fingers(arm, body)}
    report[name]['palms'] = av.rebuild_palm(arm, body)
    # Keep the bassist's supplied inward-facing neutral hand frame.
    if name=='drummer':
        for side in ('Left','Right'):calibrate_palm_bind(arm,body,side)
    report[name]['forearmTwistWeights'] = add_forearm_twists(arm, body)
    report[name]['torsoWeights'] = repair_torso_weights(arm, body, name)
    # Preserve the generated face artwork and UVs; band members need no dye atlas.
    for mat in body.data.materials:
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Roughness'].default_value = .9
    report[name]['smoothSkin'] = av.smooth_skin(body)
    arm.name, body.name = name + '-rig', name + '-body'
    align_ik_endpoints(arm)
    body['componentId'] = 'body'
    bpy.ops.wm.save_as_mainfile(filepath=cached)
    return arm, body


def calibrate_pole(arm, upper, lower, end, constraint):
    """Account for each generated bone's roll instead of sharing a -90 degree offset."""
    # Choose the elbow/knee plane closest to its pole with the target at rest.
    saved_target = constraint.target.location.copy()
    origin = arm.pose.bones[upper].head.copy()
    constraint.target.location = origin.lerp(saved_target, .72)
    constraint.use_stretch = False
    bpy.context.view_layer.update()
    best, score = 0.0, -1e9
    for i in range(72):
        angle = -math.pi + i * math.tau / 72
        constraint.pole_angle = angle
        bpy.context.view_layer.update()
        shoulder = arm.pose.bones[upper].head
        axis = (arm.pose.bones[end].head - shoulder).normalized()
        bend = arm.pose.bones[lower].head - shoulder
        desired = constraint.pole_target.matrix_world.translation - shoulder
        bend -= axis * bend.dot(axis)
        desired -= axis * desired.dot(axis)
        fit = bend.normalized().dot(desired.normalized())
        if fit > score:
            score, best = fit, angle
    constraint.pole_angle = best
    constraint.target.location = saved_target
    constraint.use_stretch = False
    bpy.context.view_layer.update()


def align_ik_endpoints(arm):
    # Imported glTF bones retain centimetre-length display tails after the
    # mesh/joints are normalised to metres. IK uses those tails as lengths.
    # The joint positions and rolls stay fixed; only tail distances change.
    bpy.context.view_layer.objects.active=arm
    bpy.ops.object.mode_set(mode='EDIT')
    for side in ('Left','Right'):
        for first,next_name in [('Arm','ForeArm'),('ForeArm','Hand'),('UpLeg','Leg'),('Leg','Foot')]:
            bone=arm.data.edit_bones[side+first]
            bone.tail=arm.data.edit_bones[side+next_name].head.copy()
        # The twist joint must share the corrected forearm bind frame. An
        # old display-tail frame made pronation rotate the wrist head sideways.
        if side+'ForeArmTwist' in arm.data.edit_bones:
            fore=arm.data.edit_bones[side+'ForeArm'];twist=arm.data.edit_bones[side+'ForeArmTwist']
            twist.head=fore.head;twist.tail=fore.tail;twist.roll=fore.roll
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()


class Pose:
    """IK targets for the hands (with their orientation) and feet, a pole for
    every elbow and knee, all as empties the clips key; fingers and the spine
    are keyed on the bones directly."""

    def __init__(self, arm):
        align_ik_endpoints(arm)
        self.arm = arm
        self.hand = {}
        for side, sign in (('Left', 1), ('Right', -1)):
            wrist = head(arm, side + 'Hand')
            t = empty(f'ik-{side}-hand', wrist)
            t.rotation_mode = 'QUATERNION'
            pole = empty(f'pole-{side}-arm', head(arm, side + 'ForeArm') + Vector((sign * .35, -.25, -.15)))
            c = arm.pose.bones[side + 'ForeArm'].constraints.new('IK')
            c.target, c.chain_count, c.pole_target = t, 2, pole
            calibrate_pole(arm, side + 'Arm', side + 'ForeArm', side + 'Hand', c)
            r = arm.pose.bones[side + 'Hand'].constraints.new('COPY_ROTATION')
            r.target = t
            foot = empty(f'ik-{side}-foot', head(arm, side + 'Foot'))
            knee = empty(f'pole-{side}-leg', head(arm, side + 'Leg') + Vector((sign * .05, -.6, 0)))
            c = arm.pose.bones[side + 'Leg'].constraints.new('IK')
            c.target, c.chain_count, c.pole_target = foot, 2, knee
            calibrate_pole(arm, side + 'UpLeg', side + 'Leg', side + 'Foot', c)
            self.hand[side] = (t, pole, foot, knee)
        # The hand's frame at rest, to turn a wanted palm into the bone's turn.
        self.frames = {}

    def hand_to(self, side, frame, at, fingers, palm):
        """Wrist at `at`; the fingers pointing `fingers`, the palm facing `palm`."""
        t = self.hand[side][0]
        t.location = at
        B = rest(self.arm, side + 'Hand')
        rest_fingers, rest_palm = self.rest_frame(side)
        f, p = Vector(fingers).normalized(), Vector(palm)
        p = (p - f * p.dot(f)).normalized()
        Rest = Matrix((rest_fingers, rest_palm, rest_fingers.cross(rest_palm))).transposed()
        Want = Matrix((f, p, f.cross(p))).transposed()
        t.rotation_quaternion = (Want @ Rest.inverted() @ B).to_quaternion()
        key(t, frame, 'location', 'rotation_quaternion')

    def rest_frame(self, side):
        if not self.frames.get(side):
            bones = self.arm.data.bones
            wrist = bones[side + 'Hand'].head_local
            middle = bones[side + 'HandMiddle1'].head_local
            index, pinky = bones[side + 'HandIndex1'].head_local, bones[side + 'HandPinky1'].head_local
            fingers = (middle - wrist).normalized()
            across = (index - pinky)
            across = (across - fingers * across.dot(fingers)).normalized()
            # Finger roll records the measured palm, including palm-forward
            # sources where the world-X sign test is ambiguous.
            palm = bones[side + 'HandMiddle1'].matrix_local.to_3x3().col[2].copy()
            palm = (palm - fingers * palm.dot(fingers)).normalized()
            self.frames[side] = (fingers, palm)
        return self.frames[side]

    def foot_to(self, side, frame, at):
        f = self.hand[side][2]
        f.location = at
        key(f, frame, 'location')

    def pole(self, side, frame, at, leg=False):
        p = self.hand[side][3 if leg else 1]
        p.location = at
        key(p, frame, 'location')


def curl(arm, frame, side, finger, angles, spread=0.0):
    for i, a in enumerate(angles):
        pb = arm.pose.bones[f'{side}Hand{finger}{i + 1}']
        pb.rotation_mode = 'QUATERNION'
        q = Quaternion((1, 0, 0), a)
        if i == 0 and spread:
            q = q @ Quaternion((0, 0, 1), spread)
        pb.rotation_quaternion = q
        pb.keyframe_insert('rotation_quaternion', frame=frame)


def grip(arm, frame, side, amount=1.0, thumb=.6):
    for finger in ('Index', 'Middle', 'Ring', 'Pinky'):
        curl(arm, frame, side, finger, (1.2 * amount, 1.35 * amount, .9 * amount))
    curl(arm, frame, side, 'Thumb', (.3 * thumb, .5 * thumb, .6 * thumb))


def spine(arm, frame, lean=0.0, twist=0.0, side=0.0, nod=0.0, turn=0.0, drop=0.0):
    """Lean forward (+), twist to the character's left (+), tilt; the head nods and turns."""
    for name, share in (('Spine', .3), ('Spine01', .35), ('Spine02', .35)):
        pb = arm.pose.bones[name]
        world_turn(pb, rot('X', -lean * share) @ rot('Z', twist * share) @ rot('Y', side * share))
        pb.keyframe_insert('rotation_quaternion', frame=frame)
    for name, share in (('neck', .4), ('Head', .6)):
        pb = arm.pose.bones[name]
        world_turn(pb, rot('X', -nod * share) @ rot('Z', turn * share))
        pb.keyframe_insert('rotation_quaternion', frame=frame)
    hips = arm.pose.bones['Hips']
    world_move(hips, (0, 0, -drop))
    hips.keyframe_insert('location', frame=frame)


def bake(arm, name, frames):
    """Bake every pose bone over the clip into plain keys; drop the rig."""
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, frames + 1
    errors={side:0.0 for side in ('Left','Right')}
    for frame in range(1,frames+2,3):
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
        for side in errors:
            target=bpy.data.objects.get('ik-'+side+'-hand')
            if target:errors[side]=max(errors[side],(arm.pose.bones[side+'Hand'].head-target.matrix_world.translation).length)
    report.setdefault('wristTargetError',{}).setdefault(arm.name,{})[name]=errors
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=1, frame_end=frames + 1, only_selected=True, visual_keying=True,
                     clear_constraints=True, use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    action = arm.animation_data.action
    report.setdefault('forearmTurn', {}).setdefault(arm.name, {})[name] = natural_arms(arm, frames)
    report.setdefault('wrists', {}).setdefault(arm.name, {})[name] = relax_wrists(arm, frames)
    stabilize_baked_rotations(action)
    final_errors={side:0.0 for side in ('Left','Right')}
    for frame in range(1,frames+2,3):
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
        for side in final_errors:
            target=bpy.data.objects.get('ik-'+side+'-hand')
            if target: final_errors[side]=max(final_errors[side],(arm.pose.bones[side+'Hand'].head-target.matrix_world.translation).length)
    report.setdefault('postBakeWristTargetError',{}).setdefault(arm.name,{})[name]=final_errors
    action.name = name
    action.use_fake_user = True
    arm.animation_data.action = None
    return action


def stabilize_baked_rotations(action):
    """Keep baked quaternions on one hemisphere, including subframe playback."""
    curves = av_fcurves(action)
    paths = {fc.data_path for fc in curves if fc.data_path.endswith('rotation_quaternion')}
    for path in paths:
        channels = sorted((fc for fc in curves if fc.data_path == path), key=lambda fc: fc.array_index)
        if len(channels) != 4:
            continue
        previous = None
        for keys in zip(*(fc.keyframe_points for fc in channels)):
            q = Quaternion([k.co.y for k in keys]).normalized()
            if previous is not None and q.dot(previous) < 0:
                q.negate()
            for k, value in zip(keys, q):
                k.co.y = value
                k.interpolation = 'LINEAR'
            previous = q.copy()
    # Positions are also sampled every frame; Bezier overshoot can break
    # target contact between otherwise correct samples.
    for fc in curves:
        for k in fc.keyframe_points:
            k.interpolation = 'LINEAR'


def normalize_skin_weights(body):
    """Make the saved Blender rig agree with glTF's four-influence skin."""
    trimmed = 0
    for v in body.data.vertices:
        weights = sorted(((g.group, g.weight) for g in v.groups if g.weight > 1e-6), key=lambda x: -x[1])
        if not weights:
            raise RuntimeError(f'Unweighted body vertex {v.index}')
        kept = weights[:4]
        trimmed += len(weights) > 4
        total = sum(w for _, w in kept)
        # VertexGroupElement references are invalidated by removal. Snapshot
        # numeric indices before editing, or a removed entry shifts the next
        # one and unrelated influences can survive.
        for gi in [g.group for g in v.groups]:
            body.vertex_groups[gi].remove([v.index])
        for gi, w in kept:
            body.vertex_groups[gi].add([v.index], w / total, 'REPLACE')
    return trimmed


def repair_wrist_weights(arm, body):
    """Give the original cut rim and the new palm identical wrist blending.

    The generated rim had arbitrary hand weights, while the new rings used
    forearm weights at their start. They separated into a sharp crease when
    bent. Reweight both sides of the seam in the measured hand frame.
    """
    changed = {}
    for side in ('Left', 'Right'):
        names = {g.index: g.name for g in body.vertex_groups}
        W = arm.data.bones[side + 'Hand'].head_local
        E = arm.data.bones[side + 'ForeArm'].head_local
        middle = arm.data.bones[side + 'HandMiddle1'].head_local
        along = (middle - W).normalized()
        axis = W - E
        region = {side + n for n in ('Hand', 'ForeArm', 'ForeArmTwist')}
        groups = {n: body.vertex_groups[n] for n in region}
        count = 0
        for v in body.data.vertices:
            if any(g.weight > 1e-5 and names[g.group].startswith(side + 'Hand')
                   and names[g.group] != side + 'Hand' for g in v.groups):
                continue
            owned = sum(g.weight for g in v.groups if names[g.group] in region)
            l = (v.co - W).dot(along)
            if owned < .5 or l < -.11:
                continue
            hand_share = av.smoothstep(-.075, .005, l)
            u = max(0, min(1, (v.co - E).dot(axis) / axis.length_squared))
            twist_share = av.smoothstep(.15, .95, u)
            weights = {side + 'Hand': hand_share,
                       side + 'ForeArm': (1-hand_share) * (1-twist_share),
                       side + 'ForeArmTwist': (1-hand_share) * twist_share}
            for gi in [g.group for g in v.groups]:
                body.vertex_groups[gi].remove([v.index])
            for n, w in weights.items():
                if w > 1e-6:
                    groups[n].add([v.index], w, 'REPLACE')
            count += 1
        changed[side] = count
    return changed


def remove_cross_limb_weights(arm, body):
    """Fit continuous arm weights to the source's shoulder/elbow/wrist line.

    The generated weights contain leg influences on sleeves and abrupt jumps
    between neighboring arm vertices. Removing only the worst entries leaves
    that discontinuity. A spatial blend makes adjacent vertices agree.
    """
    names = {g.index: g.name for g in body.vertex_groups}
    changed = {}
    for side in ('Left', 'Right'):
        S, E, W = (arm.data.bones[side+n].head_local.copy() for n in ('Arm','ForeArm','Hand'))
        U, L = E-S, W-E
        own = {g.index for g in body.vertex_groups if g.name in
               {side+n for n in ('Shoulder','Arm','ForeArm','ForeArmTwist','Hand')}
               or g.name.startswith(side+'Hand')}
        K = arm.data.bones[side+'HandMiddle1'].head_local
        along = (K-W).normalized()
        groups = {n: body.vertex_groups[side+n] for n in ('Arm','ForeArm','ForeArmTwist','Hand')}
        count = 0
        for v in body.data.vertices:
            weights = [(g.group,g.weight) for g in v.groups]
            share = sum(w for gi,w in weights if gi in own)
            if share < .15 or sum(w for gi,w in weights if names[gi]=='Head') > .1:
                continue
            if any(w > 1e-5 and names[gi].startswith(side+'Hand') and names[gi]!=side+'Hand' for gi,w in weights):
                continue
            tu = max(0,min(1,(v.co-S).dot(U)/U.length_squared))
            tl = max(0,min(1,(v.co-E).dot(L)/L.length_squared))
            du, dl = (v.co-(S+U*tu)).length, (v.co-(E+L*tl)).length
            distance = min(du,dl)
            arc = tu*U.length if du<dl else U.length+tl*L.length
            strength = av.smoothstep(.025,.11,arc)
            if distance > .15 or strength <= 0:
                continue
            fore = av.smoothstep(-.05,.05,(v.co-E).dot(L.normalized()))
            hand = av.smoothstep(-.075,.005,(v.co-W).dot(along))
            twist = av.smoothstep(.15,.95,tl)
            target = {'Arm':1-fore,'ForeArm':fore*(1-hand)*(1-twist),
                      'ForeArmTwist':fore*(1-hand)*twist,'Hand':fore*hand}
            original_total = sum(w for _,w in weights) or 1
            for gi in [gi for gi,_ in weights]:
                body.vertex_groups[gi].remove([v.index])
            for gi,w in weights:
                value = (1-strength)*w/original_total
                if value > 1e-6:
                    body.vertex_groups[gi].add([v.index],value,'REPLACE')
            for n,w in target.items():
                if w*strength > 1e-6:
                    groups[n].add([v.index],w*strength,'ADD')
            count += 1
        changed[side] = count
    return changed


def protect_vocal_hair(arm, body):
    """Keep the singer's connected hair curtains out of the arm repair."""
    from collections import defaultdict
    colours = av.face_colours(body)
    neck = arm.data.bones['neck'].head_local.z
    allowed = {p.index for p,c in zip(body.data.polygons,colours) if c in ('hair','dark')}
    by_vertex = defaultdict(list)
    for i in allowed:
        for vi in body.data.polygons[i].vertices:
            by_vertex[vi].append(i)
    seen = {i for i in allowed if body.data.polygons[i].center.z > neck+.03}
    queue = list(seen)
    while queue:
        i = queue.pop()
        for vi in body.data.polygons[i].vertices:
            for j in by_vertex[vi]:
                if j not in seen:
                    seen.add(j); queue.append(j)
    vertices = {vi for i in seen for vi in body.data.polygons[i].vertices}
    head_group = body.vertex_groups['Head']
    for vi in vertices:
        v = body.data.vertices[vi]
        for gi in [g.group for g in v.groups]:
            body.vertex_groups[gi].remove([vi])
        head_group.add([vi],1,'REPLACE')
    return len(vertices)


# How far a hand may turn away from its forearm, measured from the way the
# generated hand continues the generated forearm at rest. The clips aim every
# hand at a world orientation (a palm on the knee, under a bass neck, along a
# stick) whatever the forearm did, and where the two disagreed the wrist
# folded or twisted (the owner, October 1: "their wrists and hands are still
# broken and twisted"). He chose clean wrists over exact grips.
WRIST_BEND = math.radians(28)
WRIST_TWIST = math.radians(22)


# How far a forearm may turn about its own length (pronation or supination)
# to face the hand the way a clip wants it, before the wrist takes the rest.
FOREARM_TURN = math.radians(90)


def natural_arms(arm, frames):
    """Rebuild every arm of a baked clip from where its joints are, as an arm
    moves: the upper arm and forearm each swing straight from rest onto their
    joints, no roll of their own, and the forearm then turns about its length
    (at most FOREARM_TURN) toward the hand's wanted facing.

    The generated arms are nearly straight at rest, so Blender's IK could bend
    an elbow from either side, and then rolled the whole arm half a turn about
    the shoulder to bring the elbow to its pole: the elbow sat where it should
    but both bones were turned over, every palm faced up, and clamping the
    wrists only hid it (the owner, October 2: "their arms and hands and wrists
    are turning and moving in the wrong orientations"). Returns the largest
    forearm turn used, in degrees, per side."""
    used = {'Left': 0.0, 'Right': 0.0}
    previous_roll = {}
    # Pronation is relative to each source bind pose. Its twist bone spreads
    # the turn along the lower arm while the elbow remains stable.
    for frame in range(1, frames + 2):
        bpy.context.scene.frame_set(frame)
        for side in ('Left', 'Right'):
            up, fore, hand = (arm.pose.bones[side + n] for n in ('Arm', 'ForeArm', 'Hand'))
            S, E, W = up.head.copy(), fore.head.copy(), hand.head.copy()
            wanted = hand.matrix.to_3x3().normalized()
            parent = up.parent
            Ur = parent.matrix.to_3x3().normalized() @ (parent.bone.matrix_local.to_3x3().inverted() @ up.bone.matrix_local.to_3x3())
            U = Ur.col[1].rotation_difference((E - S).normalized()).to_matrix() @ Ur
            # The elbow is a hinge. Align the source arm's anterior surface
            # with its bend plane before asking the forearm to pronate.
            # Shortest-arc swing alone left the female elbows rotated inward
            # and forced a 180-degree roll across the wrist clamp boundary.
            axis = (E - S).normalized()
            anterior = U @ up.bone.matrix_local.to_3x3().inverted() @ Vector((0, -1, 0))
            anterior = (anterior - axis * anterior.dot(axis)).normalized()
            bend = W - E
            bend = (bend - axis * bend.dot(axis)).normalized()
            if bend.length > .1:
                angle = math.atan2(axis.dot(anterior.cross(bend)), anterior.dot(bend))
                U = Matrix.Rotation(angle, 3, axis) @ U
            M = U.to_4x4(); M.translation = S; up.matrix = M
            bpy.context.view_layer.update()
            Fr = U @ (up.bone.matrix_local.to_3x3().inverted() @ fore.bone.matrix_local.to_3x3())
            F = Fr.col[1].rotation_difference((W - E).normalized()).to_matrix() @ Fr
            R0 = fore.bone.matrix_local.to_3x3().inverted() @ hand.bone.matrix_local.to_3x3()
            q = ((F.inverted() @ wanted) @ R0.inverted()).to_quaternion()
            if q.w < 0:
                q = -q
            raw = 2 * math.atan2(q.y, q.w)
            if side in previous_roll:
                # atan2 wraps at pi; an almost identical orientation must
                # not switch the anatomical limit from +90 to -90 degrees.
                raw += math.tau * round((previous_roll[side] - raw) / math.tau)
            previous_roll[side] = raw
            roll = max(-FOREARM_TURN, min(FOREARM_TURN, raw))
            used[side] = max(used[side], abs(math.degrees(roll)))
            M = F.to_4x4(); M.translation = E; fore.matrix = M
            bpy.context.view_layer.update()
            twist = arm.pose.bones[side + 'ForeArmTwist']
            M = (F @ Quaternion((0, 1, 0), roll).to_matrix()).to_4x4()
            M.translation = E; twist.matrix = M
            bpy.context.view_layer.update()
            M = wanted.to_4x4(); M.translation = W; hand.matrix = M
            bpy.context.view_layer.update()
            for pb in (up, fore, twist, hand):
                pb.keyframe_insert('rotation_quaternion', frame=frame)
                pb.keyframe_insert('location', frame=frame)
    return {k: round(v) for k, v in used.items()}


def wrist_turn(arm, side):
    """The hand's turn away from its rest relation to the forearm, in the
    forearm's frame, as (swing, twist) about the forearm's own axis (Y)."""
    F = arm.pose.bones[side + 'ForeArmTwist'].matrix.to_3x3()
    H = arm.pose.bones[side + 'Hand'].matrix.to_3x3()
    R0 = arm.data.bones[side + 'ForeArm'].matrix_local.to_3x3().inverted() @ arm.data.bones[side + 'Hand'].matrix_local.to_3x3()
    q = ((F.inverted() @ H) @ R0.inverted()).to_quaternion()
    if q.w < 0:
        q = -q
    twist = Quaternion((q.w, 0, q.y, 0))
    twist = twist.normalized() if twist.magnitude > 1e-9 else Quaternion()
    swing = q @ twist.inverted()
    return swing, twist, F, R0


def relax_wrists(arm, frames):
    """Hold every baked hand within WRIST_BEND and WRIST_TWIST of its
    forearm, keeping where the wrist is; the fingers and anything skinned to
    the hand follow it. Returns the worst bend and twist before and after,
    in degrees."""
    worst = {'before': [0.0, 0.0], 'after': [0.0, 0.0], 'clamped': 0}
    for frame in range(1, frames + 2):
        bpy.context.scene.frame_set(frame)
        for side in ('Left', 'Right'):
            swing, twist, F, R0 = wrist_turn(arm, side)
            sa, ta = swing.angle, 2 * math.atan2(abs(twist.y), twist.w)
            worst['before'] = [max(worst['before'][0], math.degrees(sa)), max(worst['before'][1], math.degrees(ta))]
            if sa <= WRIST_BEND and ta <= WRIST_TWIST:
                continue
            if sa > WRIST_BEND:
                swing = Quaternion(swing.axis, WRIST_BEND)
            if ta > WRIST_TWIST:
                twist = Quaternion((0, 1, 0), math.copysign(WRIST_TWIST, twist.y * twist.w))
            pb = arm.pose.bones[side + 'Hand']
            at = pb.matrix.translation.copy()
            M = (F @ (swing @ twist).to_matrix() @ R0).to_4x4()
            M.translation = at
            pb.matrix = M
            bpy.context.view_layer.update()
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            worst['clamped'] += 1
    for frame in range(1, frames + 2, 2):
        bpy.context.scene.frame_set(frame)
        for side in ('Left', 'Right'):
            swing, twist, _, _ = wrist_turn(arm, side)
            worst['after'] = [max(worst['after'][0], math.degrees(swing.angle)), max(worst['after'][1], math.degrees(2 * math.atan2(abs(twist.y), twist.w)))]
    worst['before'] = [round(x) for x in worst['before']]
    worst['after'] = [round(x) for x in worst['after']]
    return worst


def reset(arm):
    """A fresh clip: no keys, the rig's targets back at rest."""
    if arm.animation_data:
        arm.animation_data.action = None
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY' and (o.name.startswith('ik-') or o.name.startswith('pole-') or o.name.startswith('aim-')):
            bpy.data.objects.remove(o, do_unlink=True)
    for pb in arm.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
        pb.matrix_basis.identity()
    for a in list(bpy.data.actions):
        if not a.use_fake_user:
            bpy.data.actions.remove(a)
    bpy.context.view_layer.update()


# ------------------------------------------------------------ the clips

def arms_down(arm, frame, swing=(0.0, 0.0), out=4.0):
    """Arms hanging from the generated A-pose, swinging forward (+) by degrees."""
    for side, sign, s in (('Left', 1, swing[0]), ('Right', -1, swing[1])):
        pb = arm.pose.bones[side + 'Arm']
        direction = (head(arm, side + 'ForeArm') - head(arm, side + 'Arm')).normalized()
        wanted = Vector((sign * math.sin(math.radians(out)), -math.sin(math.radians(s)), -math.cos(math.radians(s)))).normalized()
        world_turn(pb, direction.rotation_difference(wanted).to_matrix())
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        fa = arm.pose.bones[side + 'ForeArm']
        world_turn(fa, rot('X', -8 - max(0, s) * .6))
        fa.keyframe_insert('rotation_quaternion', frame=frame)
        grip(arm, frame, side, .25, .3)


def key_everything(arm, frames):
    """Every bone keyed at both ends, so a clip never inherits another's pose."""
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        for f in (1, frames + 1):
            if not any(fc.data_path.startswith(f'pose.bones["{pb.name}"]') for fc in (av_fcurves(arm.animation_data.action) if arm.animation_data and arm.animation_data.action else [])):
                pb.keyframe_insert('rotation_quaternion', frame=f)
                pb.keyframe_insert('location', frame=f)


def clip_walk(arm):
    """Two steps a second, in place: the game moves the body along."""
    reset(arm)
    frames = 30
    for f in range(0, frames + 1, 3):
        p = 2 * math.pi * f / frames
        for side, phase in (('Left', 0), ('Right', math.pi)):
            q = p + phase
            hip = arm.pose.bones[side + 'UpLeg']
            world_turn(hip, rot('X', -20 * math.sin(q)))
            hip.keyframe_insert('rotation_quaternion', frame=f + 1)
            knee = arm.pose.bones[side + 'Leg']
            world_turn(knee, rot('X', 6 + 32 * max(0.0, math.cos(q)) ** 1.5))
            knee.keyframe_insert('rotation_quaternion', frame=f + 1)
        spine(arm, f + 1, lean=3, twist=4 * math.sin(p), drop=.012 * (1 - abs(math.cos(p))))
        walking_arms(arm, f + 1, (14 * math.sin(p + math.pi), 14 * math.sin(p)))
    key_everything(arm, frames)
    a = arm.animation_data.action
    a.name, a.use_fake_user = 'walk', True
    arm.animation_data.action = None
    return a


def walking_arms(arm, frame, swings):
    """Use anatomical palm frames and spread pronation along the forearm.

    Jacket clearance comes from the arm's outward swing, rather than moving
    its wrist independently or inheriting a palm-forward source A-pose.
    """
    bpy.context.view_layer.update()
    torso=arm.pose.bones['Spine02']
    T=torso.matrix.to_3x3().normalized() @ torso.bone.matrix_local.to_3x3().inverted()
    out=18
    for side,sign,s in [('Left',1,swings[0]),('Right',-1,swings[1])]:
        shoulder_clearance=.05 if arm.name.startswith('bass') else (.04 if arm.name.startswith('guitar') and side=='Right' else 0)
        up,fore,twist,hand=[arm.pose.bones[side+n] for n in ('Arm','ForeArm','ForeArmTwist','Hand')]
        Ur=up.parent.matrix.to_3x3().normalized() @ up.parent.bone.matrix_local.to_3x3().inverted() @ up.bone.matrix_local.to_3x3()
        axis=T @ Vector((sign*math.sin(math.radians(out)),-math.sin(math.radians(s)),-math.cos(math.radians(s)))).normalized()
        U=Ur.col[1].rotation_difference(axis).to_matrix() @ Ur
        # These loose sleeve meshes extend inward from the supplied shoulder
        # pivot. Fit the walking attachment to the garment without changing
        # the bind skeleton or the accepted performance/seated poses.
        parent_rest=up.parent.bone.matrix_local.inverted() @ up.bone.matrix_local
        shoulder=(up.parent.matrix @ parent_rest).translation
        M=U.to_4x4();M.translation=shoulder+T @ Vector((sign*shoulder_clearance,0,0));up.matrix=M
        bpy.context.view_layer.update()
        E=fore.head.copy()
        Fr=U @ up.bone.matrix_local.to_3x3().inverted() @ fore.bone.matrix_local.to_3x3()
        along=Matrix.Rotation(math.radians(-10),3,T @ Vector((1,0,0))) @ axis
        F=Fr.col[1].rotation_difference(along).to_matrix() @ Fr
        M=F.to_4x4();M.translation=E;fore.matrix=M
        bpy.context.view_layer.update()
        W=hand.head.copy();f0,p0=strings_motion.hand_frame(arm,side)
        palm=T @ Vector((-sign,0,0));palm=(palm-along*palm.dot(along)).normalized()
        Rest=Matrix((f0,p0,f0.cross(p0))).transposed()
        H=Matrix((along,palm,along.cross(palm))).transposed() @ Rest.inverted() @ hand.bone.matrix_local.to_3x3()
        R0=fore.bone.matrix_local.to_3x3().inverted() @ hand.bone.matrix_local.to_3x3()
        q=((F.inverted() @ H) @ R0.inverted()).to_quaternion()
        if q.w<0:q.negate()
        roll=max(-FOREARM_TURN,min(FOREARM_TURN,2*math.atan2(q.y,q.w)))
        M=(F @ Quaternion((0,1,0),roll).to_matrix()).to_4x4();M.translation=E;twist.matrix=M
        bpy.context.view_layer.update()
        M=H.to_4x4();M.translation=W;hand.matrix=M
        bpy.context.view_layer.update()
        for pb in (up,fore,twist,hand):key(pb,frame,'rotation_quaternion','location')
        grip(arm,frame,side,.18,.25)


def thigh_radius(arm):
    """How thick a thigh is: seated, the hips ride this far over the seat."""
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.get('componentId') == 'body')
    group = body.vertex_groups['LeftUpLeg'].index
    hip, knee = head(arm, 'LeftUpLeg'), head(arm, 'LeftLeg')
    axis = (knee - hip).normalized()
    d = []
    for v in body.data.vertices:
        if any(g.group == group and g.weight > .6 for g in v.groups):
            r = v.co - hip
            d.append((r - axis * r.dot(axis)).length)
    return float(np.percentile(d, 85)) if d else .08


def fit_seat_contact(arm, seat, frames):
    body=next(o for o in bpy.data.objects if o.type=='MESH' and o.get('componentId')=='body')
    names={g.index:g.name for g in body.vertex_groups}
    hip=head(arm,'Hips')
    ids=[v.index for v in body.data.vertices if hip.z-.09<v.co.z<hip.z+.06 and abs(v.co.x)<.2 and v.co.y>hip.y-.04 and sum(g.weight for g in v.groups if names[g.group] in ('Hips','LeftUpLeg','RightUpLeg'))>.65]
    def lowest():
        low=1e9
        for f in range(1,frames+2,15):
            bpy.context.scene.frame_set(f);bpy.context.view_layer.update()
            evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
            candidates=[mesh.vertices[i].co.z for i in ids if abs(mesh.vertices[i].co.x)<.21 and -.13<mesh.vertices[i].co.y<.14]
            if candidates:low=min(low,min(candidates))
            evaluated.to_mesh_clear()
        return low
    low=lowest()
    if not math.isfinite(low) or low>10:raise RuntimeError('No pelvis contact samples')
    for iteration in range(3):
        # 3.5 cm clear, not 8 mm: exported to four weights a vertex, the
        # seat of the trousers skins a few centimetres lower in the browser
        # than here, and sank into the top of the log.
        error=seat+.035-low
        if abs(error)<.003:break
        delta=rest(arm,'Hips').inverted()@Vector((0,0,error))
        for fc in av_fcurves(arm.animation_data.action):
            if fc.data_path=='pose.bones["Hips"].location':
                d=delta[fc.array_index]
                for k in fc.keyframe_points:
                    k.co.y+=d;k.handle_left.y+=d;k.handle_right.y+=d
        low=lowest()
    report.setdefault('seatContact',{})[arm.name]=round(low-seat,5)


def clip_sit(arm, seat, variant):
    """Seated on a log by the fire: talking, listening, warming the hands.

    The hips ride a thigh's thickness over the seat: set by the hip joint
    alone they sank a hand's depth into the log. Each hand points along its
    own forearm, bent a little down on the knee and a little up to the fire;
    aimed independently of the arm, the wrists bent back and twisted."""
    reset(arm)
    pose = Pose(arm)
    frames = 8 * BAR
    hips = head(arm, 'Hips')
    knee_l = head(arm, 'LeftLeg')
    thigh = (head(arm, 'LeftUpLeg') - knee_l).length
    pad = thigh_radius(arm)
    drop = hips.z - (seat + pad + .045)
    report.setdefault('seat', {})[arm.name] = round(pad, 3)
    upper_len = {s_: (head(arm, s_ + 'ForeArm') - head(arm, s_ + 'Arm')).length for s_ in ('Left', 'Right')}
    lower_len = {s_: (head(arm, s_ + 'Hand') - head(arm, s_ + 'ForeArm')).length for s_ in ('Left', 'Right')}
    for f in range(0, frames + 1, BEAT):
        t = f / frames
        breathe = math.sin(2 * math.pi * t * 4)
        look = math.sin(2 * math.pi * (t + variant * .23))
        warm = max(0.0, math.sin(2 * math.pi * (t * 2 + variant * .31))) ** 3
        # Leaning in a little to the fire when warming the hands.
        spine(arm, f + 1, lean=8 + 1.5 * breathe + 7 * warm, twist=10 * look * (1 - warm), nod=6 + 4 * math.sin(2 * math.pi * t * 3 + variant),
              turn=18 * look * (1 - warm), drop=drop)
        # Where the shoulders actually are this frame, leaned and dropped.
        bpy.context.scene.frame_set(f + 1)
        bpy.context.view_layer.update()
        for side, sign in (('Left', 1), ('Right', -1)):
            x = sign * .13
            shin=(head(arm,side+'Leg')-head(arm,side+'Foot')).length
            ankle=head(arm,side+'Foot').z
            # Planted forward on the floor, the shins sloping out from the
            # knee: under the knee the toes reached back into the log rounds
            # that carry the bench, and the calves into the bench itself.
            reach_forward = math.sqrt(max(0.0, shin * shin - max(0.0, seat + pad + .04 - ankle) ** 2))
            pose.foot_to(side, f + 1, (x * 1.05, -(thigh * .8) - max(reach_forward * .8, .16), ankle))
            pose.pole(side, f + 1, (x, -1.0, seat + .2), leg=True)
            shoulder = arm.matrix_world @ arm.pose.bones[side + 'Arm'].head
            upper, lower = upper_len[side], lower_len[side]
            reach = upper + lower
            # Resting on the thigh as far along it as the arm reaches with the
            # elbow still bent. Aimed at the knee (October 2) the short
            # generated arms could not get there: the IK pulled them out
            # straight and the hands hung in the air over the lap like claws
            # (the owner, 2026-10-04: "their elbows shouldn't snap like that").
            on_thigh = seat + 2 * pad + .03
            rest_at = Vector((x * .95, hips.y - .03, on_thigh))
            for k in range(1, 21):
                p = Vector((x * .95, hips.y - .03 - k / 20 * thigh * .85, on_thigh))
                if (p - shoulder).length <= reach * .86:
                    rest_at = p
            # Warming: out toward the fire, at 80% of the arm's length.
            fire = Vector((x * .55, -(thigh * 1.2), seat + pad + .24))
            fire_at = shoulder + (fire - shoulder).normalized() * reach * .8
            at = rest_at.lerp(fire_at, warm)
            # Elbows back and down by the hips, so each forearm lies along its
            # thigh. Pulled out to the side (sign * .55, a little forward),
            # the elbows flared, the forearms came in across the knees and
            # the hands turned in at each other (the owner, October 2).
            elbow_pole = Vector((sign * .3, .4, seat + .02))
            span = at - shoulder
            d = min(span.length, upper + lower - 1e-3)
            along = (d * d + upper * upper - lower * lower) / (2 * d)
            out = elbow_pole - shoulder
            out = (out - span.normalized() * out.dot(span.normalized())).normalized()
            elbow = shoulder + span.normalized() * along + out * math.sqrt(max(0.0, upper * upper - along * along))
            forearm = (at - elbow).normalized()
            # The hand carries on from the forearm: flat along the thigh,
            # fingers a little down over it; to the fire, lifted a little.
            level = Vector((forearm.x, forearm.y, 0)).normalized() if Vector((forearm.x, forearm.y, 0)).length > 1e-3 else forearm
            fingers = (level + Vector((0, 0, -.2))).normalized().lerp((forearm + Vector((0, 0, .35))).normalized(), warm)
            # Palm flat down on the thigh; to the fire, turned to face it.
            palm = Vector((-sign * .12 * (1 - warm), -warm, -(1 - warm) + .15 * warm))
            pose.hand_to(side, f + 1, at, fingers, palm)
            pose.pole(side, f + 1, elbow_pole)
            # Fingers loosely curled at rest, open to the fire: curled hard
            # they read as claws.
            grip(arm, f + 1, side, .18 * (1 - warm) + .05, .25)
    fit_seat_contact(arm, seat, frames)
    return bake(arm, 'sit', frames)


def attach(obj, arm, bone, matrix_world):
    """Carry a prop on a bone: placed at rest, then skinned wholly to it.
    Parented to a bone instead, Blender offsets the child by the bone's tail,
    and the generated hand bones' tails are far from the hands, so the sticks
    floated off. Skinned, it moves exactly as the bone does, in any engine.
    Returns an empty that rides the bone the same way, for keying targets on."""
    obj.data.transform(matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    obj.parent = arm
    obj.matrix_parent_inverse = Matrix.Identity(4)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    obj.modifiers.new('rig', 'ARMATURE').object = arm
    rider = bpy.data.objects.new('aim-' + obj.name, None)
    bpy.context.scene.collection.objects.link(rider)
    rider.parent = arm
    rider.parent_type = 'BONE'
    rider.parent_bone = bone
    bpy.context.view_layer.update()
    rider.matrix_world = matrix_world
    return rider


# ------------------------------------------------------------ props

def load_prop(name, size, texture=512, source=None):
    """One generated prop as one mesh: its longest side `size` metres, standing
    on the ground at the origin, its texture brought down to `texture`."""
    new = import_glb(source or name)
    meshes = [o for o in new if o.type == 'MESH']
    for o in new:
        if o.type != 'MESH':
            for c in o.children:
                c.matrix_parent_inverse = Matrix.Identity(4)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o != obj and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    v = av.world_verts(obj)
    lo, hi = v.min(0), v.max(0)
    s = size / float((hi - lo).max())
    obj.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])))
    obj.name = 'prop-' + name
    for m in obj.data.materials:
        img = av.image_of(m)
        if img and max(img.size) > texture:
            img.scale(texture, texture)
        # Matte and unlit by metal: the game lights them like the avatars.
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Roughness'].default_value = .9
    av.strip_emission(obj)
    return obj


def mic_stand(height):
    """The mic stand, its base centred on the origin and its microphone
    turned to face +Y (the singer, standing behind it). Generated facing the
    viewer; turned about its bounds instead, the pole would have moved."""
    stand = load_prop('mic', height)
    v = av.world_verts(stand)
    base = v[v[:, 2] < v[:, 2].min() + .03 * height]
    cx, cy = float(base[:, 0].mean()), float(base[:, 1].mean())
    stand.data.transform(Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation((-cx, -cy, 0)))
    stand['componentId'] = 'mic-stand'
    return stand


def bounds(obj):
    v = av.world_verts(obj)
    return Vector(v.min(0)), Vector(v.max(0))


# ------------------------------------------------------------ performances

def body_front(arm, z):
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.get('componentId') == 'body')
    v = av.world_verts(body)
    near = v[(abs(v[:, 2] - z) < .03) & (abs(v[:, 0]) < .06)]
    return float(near[:, 1].min())


def remove_loose_strap(inst):
    av.weld(inst)
    lo,hi=bounds(inst);L=hi.z-lo.z
    # The loop is the thin part below/left of the body on both preserved props.
    # Preserve the wide body, pickguard, pickups, bridge and neck.
    keep=set()
    for p in inst.data.polygons:
        x,z=p.center.x/L,p.center.z/L
        edge=float(np.interp(z,[0,.028,.06,.12,.22,.31,.40,.47,.51],[-.015,-.055,-.095,-.136,-.125,-.091,-.098,-.105,-.07]))
        if z>.51 or (z>.028 and x>edge):keep.add(p.index)
    av.keep_faces(inst,keep)


def shoulder_strap(arm, inst, M, L):
    # A continuous wide strip from the upper horn over the shoulder and down
    # the back to the lower strap button, with thickness rather than a line.
    shoulder=head(arm,'LeftArm')
    front=body_front(arm,shoulder.z-.06)
    points=[M@Vector((-.085*L,0,.43*L)),
            Vector((shoulder.x*.78,front-.03,shoulder.z-.10)),
            Vector((shoulder.x*.79,front-.005,shoulder.z+.025)),
            Vector((shoulder.x*.78,shoulder.y+.07,shoulder.z+.038)),
            Vector((shoulder.x*.55,shoulder.y+.13,shoulder.z-.08)),
            Vector((-.15,.15,head(arm,'Hips').z+.12)),
            M@Vector((.015*L,.035,.045*L))]
    # Catmull-Rom samples retain the specified attachment points.
    path=[]
    for k in range(len(points)-1):
        p0=points[max(0,k-1)];p1=points[k];p2=points[k+1];p3=points[min(len(points)-1,k+2)]
        for j in range(8):
            t=j/8;path.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
    path.append(points[-1]);verts=[];faces=[]
    for k,c in enumerate(path):
        tangent=(path[min(k+1,len(path)-1)]-path[max(0,k-1)]).normalized()
        across=Vector((1,0,0));across=(across-tangent*across.dot(tangent)).normalized()
        normal=tangent.cross(across).normalized()
        for x,z in [(-1,-1),(1,-1),(1,1),(-1,1)]:verts.append(c+across*x*.019+normal*z*.002)
    for k in range(len(path)-1):
        for j in range(4):faces.append((k*4+j,k*4+(j+1)%4,(k+1)*4+(j+1)%4,(k+1)*4+j))
    me=bpy.data.meshes.new('shoulder-strap');me.from_pydata(verts,[],faces);me.update()
    o=bpy.data.objects.new('prop-strap',me);bpy.context.collection.objects.link(o)
    mat=bpy.data.materials.new('woven-black-strap');mat.diffuse_color=(.018,.014,.012,1);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=mat.diffuse_color;mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.95;me.materials.append(mat)
    attach(o,arm,'Spine',Matrix.Identity(4))
    av.join_into(inst,[o])


def strung(arm, kind, length, frames):
    """Hands contact the real strings, with wrists and sleeves clear of the prop."""
    import random
    reset(arm)
    pose = Pose(arm)
    for side in ('Left', 'Right'):
        for suffix in ('ForeArm', 'Hand'):
            for c in list(arm.pose.bones[side + suffix].constraints):
                arm.pose.bones[side + suffix].constraints.remove(c)
    body = bpy.data.objects[arm.name.replace('-rig', '-body')]
    inst = load_prop(kind, length)
    remove_loose_strap(inst)
    hips = head(arm, 'Hips')
    R = rot('Z', float(os.environ.get('BASS_Z','-25')) if kind=='bass' else -25) @ rot('X', float(os.environ.get('BASS_FACE_TILT','-30')) if kind=='bass' else 0) @ rot('Y', 52 if kind == 'guitar' else float(os.environ.get('BASS_Y','48')))
    lo, hi = bounds(inst)
    L = hi.z - lo.z
    depth = hi.y - lo.y
    centre = Vector((0, 0, .2 * L))
    at = Vector((float(os.environ.get('BASS_X','-.08')) if kind=='bass' else -.08, body_front(arm, hips.z + (float(os.environ.get('BASS_FRONT_HEIGHT','.2')) if kind=='bass' else .05)) - depth * .5 + (.02 if kind=='bass' else -.02), hips.z + (float(os.environ.get('BASS_HEIGHT','.11')) if kind=='bass' else .04)))
    M = Matrix.Translation(at) @ R.to_4x4() @ Matrix.Translation(-centre)
    if kind=='bass':
        from mathutils.bvhtree import BVHTree
        torso_groups={g.index for g in body.vertex_groups if g.name in ('Hips','Spine','Spine01','Spine02')}
        torso_faces=[tuple(face.vertices) for face in body.data.polygons if sum(sum(g.weight for g in body.data.vertices[i].groups if g.group in torso_groups) for i in face.vertices)/len(face.vertices)>.65]
        torso=BVHTree.FromPolygons([v.co.copy() for v in body.data.vertices],torso_faces)
        shift=0.
        for v in inst.data.vertices:
            if v.co.z>.52*L:continue
            point=M@v.co
            hit,normal,index,distance=torso.ray_cast(Vector((point.x,-2,point.z)),Vector((0,1,0)),4.)
            if hit is not None: shift=min(shift,hit.y-.015-point.y)
        M.translation.y+=shift
        print('STRING_TORSO_FIT',shift,flush=True)
    print('STRING_PLACEMENT', arm.name, list(lo), list(hi), list(at), body_front(arm, hips.z+.05), flush=True)
    attach(inst, arm, 'Spine', M)
    surface = strings_motion.Instrument(inst)
    surface.palm_direction = R @ Vector((0,1,0))
    native = [M.inverted() @ v.co for v in inst.data.vertices]
    neck_x = [v.x for v in native if .58 * L < v.z < .72 * L]
    string_x = (min(neck_x) + max(neck_x)) * .5
    centres=[]
    for z in np.linspace(.50*L,.70*L,16):
        xs=[v.x for v in native if abs(v.z-z)<.009*L]
        if len(xs)>3 and max(xs)-min(xs)<.11*L:centres.append((z,(min(xs)+max(xs))*.5))
    line=np.polyfit([z for z,x in centres],[x for z,x in centres],1) if len(centres)>3 else (0.,string_x)
    string_x_at=lambda z:float(line[0]*z+line[1])
    print('STRING_LINE',kind,list(line),'body',string_x_at(.30*L),'old',string_x,flush=True)
    for f in range(0, frames + 1, 3):
        bpy.context.scene.frame_set(f + 1)
        t = f / BEAT
        bob = .5 + .5 * math.cos(math.tau * t)
        spine(arm, f + 1, lean=3 + 2 * bob, twist=5 * math.sin(math.pi * t / 4), side=3 * math.sin(math.pi * t / 2),
              nod=8 * bob - 2, turn=10 * math.sin(math.pi * t / 8), drop=.012 * bob)
        for side, sign in (('Left', 1), ('Right', -1)):
            pose.foot_to(side, f + 1, (sign * .2, -.02 * sign, head(arm, side + 'Foot').z))
            pose.pole(side, f + 1, (sign * .25, -.8, hips.z - .3), leg=True)
    frets = [x * L for x in ((.60, .64, .62, .66) if kind == 'guitar' else (.46, .50, .48, .52))]

    def fingers_at(side, f):
        if side == 'Left':
            return {n: angles for n, angles in [('Index', (.4, .6, .3)), ('Middle', (.45, .65, .3)),
                     ('Ring', (.45, .65, .3)), ('Pinky', (.45, .6, .3)), ('Thumb', (.25, .4, .3))]}
        if kind == 'guitar':
            return {n: angles for n, angles in [('Index', (.6, .8, .5)), ('Middle', (.6, .8, .5)),
                     ('Ring', (.95, 1.25, .75)), ('Pinky', (.95, 1.25, .75)), ('Thumb', (.5, .7, .4))]}
        pluck = .06 * math.sin(math.pi * f / BEAT)
        return {n: angles for n, angles in [('Index', (.95+pluck, .45, .2)), ('Middle', (.95-pluck, .45, .2)),
                 ('Ring', (.55, .7, .4)), ('Pinky', (.55, .7, .4)), ('Thumb', (.25, .3, .3))]}

    def contact_at(side, f):
        if side == 'Left':
            bar = int(f // BAR) % 4
            blend = .5 - .5 * math.cos(math.pi * min(1, ((f % BAR) / BAR) / .3))
            z = frets[(bar - 1) % 4] * (1-blend) + frets[bar] * blend
            return surface.front(M @ Vector((string_x_at(z), 0, z)))
        swing = math.cos(math.pi * f / BEAT * (2 if kind == 'guitar' else 1))
        z=float(os.environ.get('BASS_PICK','.30'))*L if kind=='bass' else .30*L
        return surface.front(M @ Vector((string_x_at(z)+(.020 if kind == 'guitar' else .008)*swing, 0, z)))

    solved = {s: [] for s in ('Left', 'Right')}
    initial = {}
    for f in range(1 if os.environ.get('STRING_PROBE') else frames):
        bpy.context.scene.frame_set(f + 1)
        bpy.context.view_layer.update()
        D = arm.pose.bones['Spine'].matrix @ arm.data.bones['Spine'].matrix_local.inverted()
        for side in solved:
            fingers = fingers_at(side, f)
            finger='Middle' if side=='Left' else 'Index'
            tip = strings_motion.curled_tip(arm, side, finger, fingers[finger])
            reference = initial.get(side, [0, 0, 0, 0])
            solve = strings_motion.problem(arm, body, side, D @ contact_at(side, f), tip, surface, D, reference)
            if f == 0:
                random.seed(41 if side == 'Left' else 42)
                seeds = [[0, 0, 0, 0]] + [[random.uniform(-1.7, 1.7) for _ in range(3)] + [random.uniform(-math.pi, math.pi)] for _ in range(32)]
                if kind=='bass' and side=='Right':
                    seeds += [[-.314054,.714996,.819855,-1.616066],[-.263318,.440194,.678997,-1.512445],[-.470199,.343010,.693672,-1.414172]]
                    for seed in seeds[-3:]:print('STRING_WARM_SEED',solve(seed)[:2],flush=True)
                seeds += solve.physical_seeds
                if os.environ.get('STRING_SEED') and side=='Right':seeds=[json.loads(os.environ['STRING_SEED'])]
                candidates = [drum_motion.minimize(solve, seed, step=.15, iterations=300) for seed in seeds]
                params = min(candidates, key=lambda x: solve(x)[0])
                initial[side] = params[:]
                print('STRING_INITIAL', arm.name, side, solve(params)[:2], params, flush=True)
            else:
                params = drum_motion.minimize(solve, reference, step=.045, iterations=140)
            solved[side].append(params)
        if f % 60 == 0: print('STRING_PROGRESS', arm.name, f, flush=True)
    if os.environ.get('STRING_PROBE'):
        raise RuntimeError('STRING_PROBE complete; no export written')
    for side in solved:
        for _ in range(2):
            values = solved[side]
            solved[side] = [[.25 * values[(i-1) % frames][j] + .5 * values[i][j] + .25 * values[(i+1) % frames][j]
                             for j in range(4)] for i in range(frames)]
    contact_metrics = {s: [] for s in solved}
    for f in range(frames + 1):
        bpy.context.scene.frame_set(f + 1)
        bpy.context.view_layer.update()
        D = arm.pose.bones['Spine'].matrix @ arm.data.bones['Spine'].matrix_local.inverted()
        for side in solved:
            fingers = fingers_at(side, f)
            finger = 'Middle' if side == 'Left' else 'Index'
            tip = strings_motion.curled_tip(arm, side, finger, fingers[finger])
            solve = strings_motion.problem(arm, body, side, D @ contact_at(side, f), tip, surface, D, initial[side])
            loss, metrics, (U,F,H,S,E,W) = solve(solved[side][f % frames])
            contact_metrics[side].append(metrics)
            for suffix, rotation, at in [('Arm',U,S),('ForeArm',F,E),('Hand',H,W)]:
                pb = arm.pose.bones[side + suffix]
                matrix = rotation.to_4x4(); matrix.translation = at
                pb.matrix = matrix
                bpy.context.view_layer.update()
                key(pb, f+1, 'location', 'rotation_quaternion')
            target = pose.hand[side][0]
            target.location = W; target.rotation_quaternion = H.to_quaternion()
            key(target, f+1, 'location', 'rotation_quaternion')
            for finger, angles in fingers.items():
                curl(arm, f+1, side, finger, angles)
    report.setdefault(arm.name.replace('-rig',''), {})['playingContactSolve'] = {s: {n: max(abs(v[n]) for v in rows) for n in ('wristBend','upperArmRoll','forearmPronation','largestPenalty')} for s,rows in contact_metrics.items()}
    shoulder_strap(arm, inst, M, L)
    inst['componentId'] = 'instrument'
    return bake(arm, 'play', frames)


def clip_vocal(arm, frames):
    """At the stand: one hand on it below the microphone, the other working the crowd."""
    reset(arm)
    pose = Pose(arm)
    hips = head(arm, 'Hips')
    mouth_z = head(arm, 'Head').z + .02
    face = body_front(arm, mouth_z)
    stand = bpy.data.objects.get('prop-mic') or mic_stand(mouth_z + .02)
    stand.location = (0, face - .11, 0)
    report['micHeight'] = mouth_z + .02
    pole_top = Vector((0, face - .12, mouth_z - .1))
    for f in range(0, frames + 1, 3):
        t = f / BEAT
        bar = int(f // BAR) % 4
        beat = t % 1
        bob = .5 + .5 * math.cos(math.tau * t)
        pose.hand_to('Right', f + 1, pole_top + Vector((-.03, .07, -.12)), Vector((.2, -.6, .7)), Vector((.9, -.2, 0)))
        grip(arm, f + 1, 'Right', .95, .9)
        # Out to the crowd on bars 2 and 4, pumped on the beat; at the side otherwise.
        up = (.5 - .5 * math.cos(math.tau * f / (4 * BAR))) ** 2
        reach = Vector((.32, -.25, hips.z + .1)).lerp(Vector((.36, -.30, mouth_z - .08 + .025 * bob)), up)
        pose.hand_to('Left', f + 1, reach, Vector((.25, -.6, -.75)).lerp(Vector((.25, -.85, .25)), up), Vector((-1, 0, 0)))
        # Let the fist follow the slow crowd gesture. Closing all three
        # phalanges on every beat made the fingertips flick by 24 degrees
        # per frame even though the wrist itself was smooth.
        grip(arm, f + 1, 'Left', .25 + .4 * up, .4)
        pose.pole('Right', f + 1, (-.45, -.25, hips.z + .18))
        pose.pole('Left', f + 1, (.5, -.18, hips.z + .12))
        spine(arm, f + 1, lean=2 + 2 * bob, twist=-6 + 8 * math.sin(math.pi * t / 4), side=4 * math.sin(math.pi * t / 2),
              nod=-4 + 5 * bob, turn=12 * math.sin(math.pi * t / 8) * (1 - up) + 10 * up, drop=.01 * bob)
        for side, sign in (('Left', 1), ('Right', -1)):
            step = .06 if side == 'Left' else -.03
            pose.foot_to(side, f + 1, (head(arm, side + 'Foot').x + sign * .025, step, head(arm, side + 'Foot').z))
            pose.pole(side, f + 1, (sign * .2, -.8, hips.z - .3), leg=True)
    return bake(arm, 'play', frames)


# Fit each overhand grip in the measured palm frame. Mirror the stick's
# diagonal across the two hands, and choose a balance point that keeps both
# wrists straight while their tips reach the existing hi-hat and snare.
STICK_ANGLE = math.radians(35)
# How far inside the palm the stick lies: in the curl of the fingers.
STICK_DEPTH = .02


def stick_frame(arm, side):
    """The stick's grip point and axis in the hand's rest frame, and the
    palm's facing: (grip, axis, palm), all at rest."""
    bones = arm.data.bones
    wrist = bones[side + 'Hand'].head_local
    middle = bones[side + 'HandMiddle1'].head_local
    fingers,palm = strings_motion.hand_frame(arm,side)
    across = bones[side + 'HandIndex1'].head_local - bones[side + 'HandPinky1'].head_local
    across = (across - fingers * across.dot(fingers)).normalized()

    axis = (fingers * math.cos(STICK_ANGLE) + across * math.sin(STICK_ANGLE) * (-1 if side=='Left' else 1)).normalized()
    grip_at = middle.lerp(wrist, .35) + palm * STICK_DEPTH
    return grip_at, axis, palm


def drumsticks(arm):
    sticks = []
    for side, sign in (('Left', 1), ('Right', -1)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=.005, depth=.34)
        stick = bpy.context.active_object
        stick.name = f'prop-stick-{side}'
        mat = bpy.data.materials.get('stick') or bpy.data.materials.new('stick')
        mat.diffuse_color = (.78, .62, .38, 1)
        stick.data.materials.append(mat)
        grip_at, axis, _ = stick_frame(arm, side)
        q = Vector((0, 0, 1)).rotation_difference(axis)
        # A hand's width of butt behind the fist, the rest out in front.
        M = Matrix.Translation(grip_at + axis * ((.23 if side=='Left' else .29)-.17)) @ q.to_matrix().to_4x4()
        stick.matrix_world = Matrix.Identity(4)
        attach(stick, arm, side + 'Hand', M)
        stick['componentId'] = 'instrument'
        sticks.append(stick)
    return sticks


def clip_drums(arm, frames, kit):
    """Closed grips with constrained elbows and actual stick-tip reach."""
    reset(arm)
    pose = Pose(arm)
    # The legs retain IK. Arms use an analytic joint triangle so a nearly
    # straight source arm cannot choose the opposite side of its elbow hinge.
    for side in ('Left', 'Right'):
        for suffix in ('ForeArm', 'Hand'):
            pb = arm.pose.bones[side + suffix]
            for constraint in list(pb.constraints):
                pb.constraints.remove(constraint)
    seat = kit['throne'].z
    drop = head(arm, 'Hips').z - (seat + thigh_radius(arm))
    # Establish the seated torso before solving hands. A later pelvis height
    # correction would otherwise lift the stick tips away from the pads.
    for f in range(frames + 1):
        bpy.context.scene.frame_set(f + 1)
        phase = math.tau * f / BEAT
        spine(arm, f + 1, lean=7 + 1.5 * math.cos(phase), twist=2 * math.sin(phase / 4),
              nod=4 + 3 * math.cos(phase - .3), turn=3 * math.sin(phase / 8), drop=drop)
        for side, sign in (('Left', 1), ('Right', -1)):
            foot = kit['hatpedal'] if side == 'Left' else kit['kick']
            pose.foot_to(side, f + 1, foot + Vector((0, 0, .014 * (.5 - .5 * math.cos(phase / 2)))))
            pose.pole(side, f + 1, (sign * .3, -1, seat + .3), leg=True)
    fit_seat_contact(arm, seat, frames)
    print('DRUM_SHOULDERS',[(side,list(arm.pose.bones[side+'Arm'].head),list(arm.data.bones[side+'Arm'].head_local))for side in ('Left','Right')],flush=True)
    # Deterministic initial solutions on the two reachable grip branches.
    seeds = {'Left': [3.106, 1.109, 3.507, -.764], 'Right': [.712, .248, 1.056, .134]}
    initial, solved = {}, {side: [] for side in seeds}

    def tip_at(side, f):
        phase = math.tau * f / BEAT
        lift = (.5 - .5 * math.cos(phase * 2)) if side == 'Left' else (.5 + .5 * math.cos(phase / 2))
        pad = kit['pads']['hihat'] if side == 'Left' else kit['pads']['snare']
        contact = Vector((-.070, .075, 0)) if side == 'Right' else Vector((.015, .035, 0))
        return pad + contact + Vector((0, 0, .012 + (.04 if side=='Left'else .075) * lift))

    for f in range(1 if os.environ.get('DRUM_PROBE') else frames):
        bpy.context.scene.frame_set(f + 1)
        bpy.context.view_layer.update()
        for side in ('Left', 'Right'):
            solve = drum_motion.problem(arm, side, tip_at(side, f), stick_frame)
            if f == 0:
                print('DRUM_ZERO',side,solve([0.,0.,0.,0.])[:2],flush=True)
                import random
                rng=random.Random(23)
                options=[seeds[side],[0.,0.,0.,0.]]+[[rng.uniform(-math.pi,math.pi) for _ in range(3)]+[rng.uniform(-math.pi,math.pi)] for _ in range(50)]
                candidates=[drum_motion.minimize(solve,x,step=.1,iterations=220) for x in options]
                params=min(candidates,key=lambda x:solve(x)[0])
                print('DRUM_INITIAL',side,solve(params)[:2],params,flush=True)
                initial[side] = params[:]
            else:
                reference = initial[side]
                def stable(x):
                    loss, metrics, matrices = solve(x)
                    return loss + 8 * sum((v-r)**2 for v,r in zip(x, reference)), metrics, matrices
                # A fixed branch reference makes the complete loop periodic;
                # a preceding-frame reference would accumulate hysteresis.
                params = drum_motion.minimize(stable, reference, step=.045, iterations=160)
            solved[side].append(params)
    if os.environ.get('DRUM_PROBE'):raise RuntimeError('DRUM_PROBE complete; no export written')
    # Circular filtering removes numerical optimizer jitter. Reconstruct the
    # entire joint triangle from each filtered orientation and the exact tip
    # path, so smoothing cannot move the stick off its playing surface.
    for side in solved:
        for _ in range(2):
            values = solved[side]
            solved[side] = [[.25 * values[(i-1) % frames][j] + .5 * values[i][j] + .25 * values[(i+1) % frames][j]
                             for j in range(4)] for i in range(frames)]
    drum_stats={s:[] for s in ('Left','Right')}
    for f in range(frames + 1):
        bpy.context.scene.frame_set(f + 1)
        bpy.context.view_layer.update()
        for side in ('Left', 'Right'):
            solve = drum_motion.problem(arm, side, tip_at(side, f), stick_frame)
            loss, metrics, (U, F, H, S, E, W) = solve(solved[side][f % frames])
            drum_stats[side].append({'frame':f+1,**metrics})
            for suffix, R, at in [('Arm', U, S), ('ForeArm', F, E), ('Hand', H, W)]:
                pb = arm.pose.bones[side + suffix]
                M = R.to_4x4(); M.translation = at
                pb.matrix = M
                bpy.context.view_layer.update()
                key(pb, f + 1, 'location', 'rotation_quaternion')
            target = pose.hand[side][0]
            target.location = W
            target.rotation_quaternion = H.to_quaternion()
            key(target, f + 1, 'location', 'rotation_quaternion')
            grip(arm, f + 1, side, .75, .9)
    with open(os.path.join(WORK,'drummer-solve.json'),'w') as file:json.dump(drum_stats,file)
    return bake(arm, 'play', frames)


# ------------------------------------------------------------ the sets

# The kit as generated, in its own coordinates (before scaling): where each
# drum head and cymbal lies (up-facing faces clustered), and the throne,
# which was generated beside the kit where the drummer sits.
KIT_SCALE = .75
KIT_PADS = {
    'snare': (-.62, .02, -.01), 'hihat': (-.75, -.1, .18), 'tom1': (-.23, .16, .26), 'tom2': (.19, .14, .26),
    'floor': (.36, .05, -.04), 'crash': (-.54, .46, .51), 'ride': (.38, .41, .55),
}
KIT_THRONE = (-.23, -.53)
THRONE_TOP = .30           # metres: the chibi drummer's knee height
# How far the kit moves across in front of the throne once turned round. The
# generated throne stood beside the kit; moved 18 cm further that way to bring
# the drums into reach, the bass drum ended up a third of a metre to his right
# and the owner saw him sitting off to one side (October 1). At +6 cm the bass
# drum is in front of his right knee and the snare by his left, both hands
# still reach, and the pieces move together (the snare's stand stands 2 cm
# off the bass drum's shell, so they cannot be moved apart).
KIT_ACROSS = .06


def make_kit():
    """The kit in the drummer's frame: drummer on the throne at the origin,
    facing -Y like everyone, the kit before him."""
    kit = load_prop('drums', 1.898 * KIT_SCALE)
    # load_prop centred the kit on its bounds and stood it on z = 0.
    lo, hi = -.58, .59
    to = lambda p: Vector(((p[0] - 0) * KIT_SCALE, (p[1] - 0) * KIT_SCALE, (p[2] - lo) * KIT_SCALE))
    throne_at = to((KIT_THRONE[0], KIT_THRONE[1], 0))
    # Raise the throne to knee height: its vertices, and only its, stretch up.
    mesh = kit.data
    for v in mesh.vertices:
        if (Vector((v.co.x, v.co.y)) - Vector((throne_at.x, throne_at.y))).length < .16 * KIT_SCALE / .75 and v.co.z < .4:
            v.co.z *= THRONE_TOP / ((-.24 - lo) * KIT_SCALE)
    # The drummer faces the audience (-Y): turn the kit half round about the throne.
    M = Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation((-throne_at.x, -throne_at.y, 0))
    mesh.transform(M)
    # Bring the playing surfaces over the seated player's reach; retain the throne at origin.
    for v in mesh.vertices:
        if not (Vector((v.co.x, v.co.y)).length < .15 and v.co.z < .55):
            v.co.x += KIT_ACROSS
    pads = {k: M @ to(p) + Vector((KIT_ACROSS, 0, 0)) for k, p in KIT_PADS.items()}
    kit['componentId'] = 'drums'
    return kit, {'pads': pads, 'throne': Vector((0, 0, THRONE_TOP)), 'kick': Vector((-.12, -.34, .14)),
                 'hatpedal': Vector((.3, -.28, .14))}


def mark(name, location, parent=None, facing=0.0):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = location
    e.rotation_euler = (0, 0, facing)
    e['componentId'] = 'mark'
    return e


def export_set(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=False,
                              export_extras=True, export_yup=True, export_image_format='AUTO', export_jpeg_quality=85)
    av.compress(path)


def export_member(name, arm, objects):
    # JPEG: each member's one opaque atlas was a 7 MB PNG, and the six band
    # files took minutes to arrive on the owner's connection (2026-10-01).
    bpy.ops.object.select_all(action='DESELECT')
    for o in [arm] + objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=True,
                              export_animation_mode='ACTIONS', export_anim_slide_to_zero=True, export_force_sampling=True, export_frame_step=1,
                              export_optimize_animation_size=True, export_extras=True, export_yup=True, export_skins=True,
                              export_morph=False, export_image_format='JPEG', export_jpeg_quality=88)
    av.compress(path)


# ------------------------------------------------------------ build

# Where everyone stands, in the stage's frame (metres, facing -Y).
# Spread across the roof (the owner found the first layout crowded): the
# guitar and bass wide, the amps wider, the drums further back.
STAGE = {'vocal': (0, -.8), 'guitarist': (-2.3, -.25), 'bass-player': (2.3, -.25)}
RISER = (0, 1.35)
AMP_X, AMP_Y = 3.2, .5
# The log's seat: the chibis' knee height (as the drum throne is). At 42 cm,
# a hand over their knees, their feet reached the ground only with the thighs
# sloping down through the log's front edge.
BENCH_SEAT = .34
SEAT_FORWARD = .2          # the seat marks, forward of the bench's middle


def build():
    meta = {'members': {}, 'fps': FPS, 'beat': BEAT}
    only = os.environ.get('BAND_ONLY')
    if only:
        if only not in {m[0] for m in MEMBERS}:
            raise ValueError(f'Unknown band member: {only}')
        with open(os.path.join(OUT, 'band.json')) as f:
            meta = json.load(f)
    kit_info = None
    for index, (name, sex, height) in enumerate(MEMBERS):
        if only and name != only:
            continue
        arm, body = prepare_member(name, sex, height)
        if name == 'vocal':
            report.setdefault(name, {})['skirt'] = skirt_follows_thighs(arm, body)
            report[name]['protectedHairVertices'] = protect_vocal_hair(arm, body)
        report[name]['crossLimbWeights'] = remove_cross_limb_weights(arm, body)
        report[name]['wristSeamWeights'] = repair_wrist_weights(arm, body)
        report[name]['trimmedSkinVertices'] = normalize_skin_weights(body)
        if name in ('vocal','bass-player'):
            from types import SimpleNamespace
            api=SimpleNamespace(av=av,import_glb=import_glb,strings_motion=strings_motion)
            report[name]['jointSurfaceRepair']=joint_surface.repair_member(arm,body,name,api)
            normalize_skin_weights(body)
            av.smooth_skin(body)
        bpy.context.scene.render.fps = FPS
        props = []
        clips = [clip_walk(arm), clip_sit(arm, BENCH_SEAT, index)]
        if name == 'guitarist':
            clips.append(strung(arm, 'guitar', .74, 8 * BAR))
            props.append(bpy.data.objects['prop-guitar'])
        elif name == 'bass-player':
            clips.append(strung(arm, 'bass', .84, 8 * BAR))
            props.append(bpy.data.objects['prop-bass'])
        elif name == 'vocal':
            clips.append(clip_vocal(arm, 8 * BAR))
            stand = bpy.data.objects['prop-mic']
            meta['micStand'] = list(stand.location)
            bpy.data.objects.remove(stand, do_unlink=True)
        else:
            kit, kit_info = make_kit()
            props += drumsticks(arm)
            clips.append(clip_drums(arm, 8 * BAR, kit_info))
            bpy.data.objects.remove(kit, do_unlink=True)
        reset(arm)
        for a in clips:
            a.use_fake_user = True
        body.parent = arm
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, name + '-animated.blend'))
        export_member(name, arm, [body] + props)
        meta['members'][name] = {'sex': sex, 'height': height, 'clips': [a.name for a in clips]}
        report[name]['clips'] = {a.name: [round(x) for x in a.frame_range] for a in clips}
    if only:
        with open(os.path.join(OUT, 'band.json'), 'w') as f:
            json.dump(meta, f, indent=1)
        print('BUILT', json.dumps(report, indent=1, default=str))
        return
    # The stage set: the drum riser, the kit, two amps, the mic stand, and the
    # guitar and bass stood against their amps for when nobody is playing.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objects = []
    riser = load_prop('riser', 2.3)
    riser.data.transform(Matrix.Scale(.24 / bounds(riser)[1].z, 4, Vector((0, 0, 1))))
    riser.location = (RISER[0], RISER[1], 0)
    riser['componentId'] = 'riser'
    top = bounds(riser)[1].z
    kit, info = make_kit()
    kit_lo, kit_hi = bounds(kit)
    # The drummer on the stage's middle line (the kit spreads further to his
    # right than his left, and centred by its footprint it put him off to one
    # side); front to back, the footprint centred on the platform.
    centre = (kit_lo + kit_hi) * .5
    kit.location = (RISER[0], RISER[1] - centre.y, top)
    rlo, rhi = bounds(riser)
    sx=max(1, (2*max(-kit_lo.x, kit_hi.x)+.5)/(rhi.x-rlo.x))
    sy=max(1, (kit_hi.y-kit_lo.y+.6)/(rhi.y-rlo.y))
    riser.data.transform(Matrix.Diagonal((sx,sy,1,1)))
    objects += [riser, kit, mark('mark-drummer', kit.location)]
    for side, sign in (('guitar', -1), ('bass', 1)):
        amp = load_prop('amp', .62 if side == 'guitar' else .74, source='amp')
        amp.name = f'prop-amp-{side}'
        amp.location = (sign * AMP_X, AMP_Y, 0)
        amp.rotation_euler = (0, 0, sign * math.radians(-12))
        amp['componentId'] = 'amp'
        rest_inst = load_prop(side, .86 if side == 'guitar' else .98)
        rest_inst.name = f'rest-{side}'
        rest_inst.location = (sign * AMP_X - sign * .42, AMP_Y - .25, 0)
        rest_inst.rotation_euler = (math.radians(-14), 0, sign * math.radians(20))
        rest_inst['componentId'] = 'resting-instrument'
        objects += [amp, rest_inst]
    # The same stand she was animated with, where she was animated with it.
    stand = mic_stand(report.get('micHeight', 1.3))
    vocal = Vector((STAGE['vocal'][0], STAGE['vocal'][1], 0))
    stand.location = vocal + Vector(meta.get('micStand', (0, -.25, 0)))
    objects += [stand, mark('mark-vocal', vocal)]
    for who in ('guitarist', 'bass-player'):
        objects.append(mark('mark-' + who, (STAGE[who][0], STAGE[who][1], 0)))
    export_set('stage', objects)
    # The bonfire, with a log bench either side facing it, two seats on each.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fire = load_prop('bonfire', 1.1)
    fire['componentId'] = 'bonfire'
    objects = [fire, mark('fire', (0, 0, .15))]
    seats = [('vocal', 0), ('bass-player', 0), ('guitarist', 1), ('drummer', 1)]
    for k, facing in enumerate((0.0, math.pi)):
        bench = load_prop('bench', 1.45)
        bench.data.transform(Matrix.Scale(BENCH_SEAT / bounds(bench)[1].z, 4, Vector((0, 0, 1))))
        y = 1.45 if k == 0 else -1.45
        bench.location = (0, y, 0)
        bench.rotation_euler = (0, 0, facing)
        bench.name = f'prop-bench-{k}'
        bench['componentId'] = 'bench'
        objects.append(bench)
    for (who, k), dx in zip(seats, (-.36, .36, -.36, .36)):
        y = 1.45 if k == 0 else -1.45
        # Facing the fire: -Y is a body's front. Near the front of the log,
        # 7 cm behind its edge: the bench is 60 cm deep, and sat in its middle
        # their knees came just to the edge and their shins went down through
        # its front (the owner, October 1).
        forward = SEAT_FORWARD
        objects.append(mark('seat-' + who, (dx, y + (-forward if k == 0 else forward), 0), facing=0.0 if k == 0 else math.pi))
    export_set('bonfire', objects)
    meta['stage'] = {k: list(v) for k, v in STAGE.items()}
    with open(os.path.join(OUT, 'band.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('BUILT', json.dumps(report, indent=1, default=str))


if __name__ == '__main__':
    build()
