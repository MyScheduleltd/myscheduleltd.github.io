"""The avatars' walk, taken from the owner's reference (art/reference/
walking-mixamo.fbx, a Mixamo "Walking" on the avatars' own skeleton).

One gait cycle is read off it, from the model's right heel strike to the
next, and turned into the rig's joint angles: for each leg the thigh's swing
and splay and the knee's bend, for each arm the same at the shoulder and the
elbow, and the chest's and head's turn. Angles, not bone rotations, so the
one walk fits every body, the visitors' and the residents' alike, whatever
their proportions and A-pose. The stride the cycle covers is measured from
the reference's own forward travel and scaled to the rig's leg, so a planted
foot does not slide.

Run: /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/prepare-walk.py
Writes src/data/walk-cycle.json.
"""
import bpy, json, math, os
from mathutils import Matrix, Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, '..', '..', 'art', 'reference', 'walking-mixamo.fbx')
OUT = os.path.join(HERE, '..', 'src', 'data', 'walk-cycle.json')
SAMPLES = 48
RIG_LEG = .66 + .52          # the procedural rig's thigh and shin

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SOURCE, automatic_bone_orientation=False)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
scene = bpy.context.scene
M = arm.matrix_world
# Blender (x, y, z), facing -y, to the body's three.js frame (x, y up, z forward).
C = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))
to3 = lambda v: C @ Vector(v)


def at(frame):
    scene.frame_set(int(frame), subframe=frame - int(frame))


def head(name):
    return to3(M @ arm.pose.bones[name].head)


def world_rot(name, rest=False):
    b = arm.pose.bones[name]
    m = (M @ (b.bone.matrix_local if rest else b.matrix)).to_3x3().normalized()
    return (C @ m @ C.inverted()).to_quaternion()


# The right heel strikes: the frames where the right ankle, having swung
# forward, stops moving forward.
first, last = (int(round(x)) for x in arm.animation_data.action.frame_range)
ankle = []
for f in range(first, last + 1):
    at(f)
    ankle.append((f, head('RightFoot').z, head('RightFoot').y))
speed = [(ankle[i + 1][0], ankle[i + 1][1] - ankle[i][1]) for i in range(len(ankle) - 1)]
peak = max(v for _, v in speed)
strikes = [f for (f, v), (_, prev) in zip(speed[1:], speed) if prev > .3 * peak >= v]
if len(strikes) < 2:
    raise RuntimeError(f'need two right heel strikes, found {strikes}')
# The clip holds two cycles exactly (each foot plants 24 frames after it
# last did); the threshold can land a frame either side, so the cycle is half
# the clip, from the first strike.
start = strikes[0]
end = start + (last - first + 1) / 2
at(start)
hips0 = head('Hips')
at(end)
travel = (head('Hips') - hips0).z
at(first)
thigh = (head('RightLeg') - head('RightUpLeg')).length
shin = (head('RightFoot') - head('RightLeg')).length
stride = travel * RIG_LEG / (thigh + shin)

rest = {n: world_rot(n, True) for n in ('Spine02', 'Head')}


def direction(a, b, frame_q):
    return (frame_q.inverted() @ (head(b) - head(a))).normalized()


def swing_splay(u):
    # The rig's rest limb hangs straight down; rotation X then Z (three.js
    # XYZ order applies Z first): u = Rx(a) Rz(c) (0, -1, 0).
    c = math.asin(max(-1.0, min(1.0, u.x)))
    a = math.atan2(-u.z, -u.y)
    return a, c


def bend(a, b, c):
    u, w = (head(b) - head(a)).normalized(), (head(c) - head(b)).normalized()
    return math.acos(max(-1.0, min(1.0, u.dot(w))))


# The body's rise and fall and each foot's lift, as shares of the leg: read
# through the rig's longer leg the knee angles alone sank the hips twice as
# far as the reference's do, and the step read as a lunge.
heights = []
for k in range(SAMPLES):
    at(start + (end - start) * k / SAMPLES)
    heights.append((head('RightUpLeg').y, head('LeftUpLeg').y, head('RightFoot').y, head('LeftFoot').y))
hip_top = max(max(h[0], h[1]) for h in heights)
ankle_floor = min(min(h[2], h[3]) for h in heights)
standing = hip_top - ankle_floor

frames = []
for k in range(SAMPLES):
    at(start + (end - start) * k / SAMPLES)
    torso = world_rot('Spine02') @ rest['Spine02'].inverted()
    headq = torso.inverted() @ (world_rot('Head') @ rest['Head'].inverted())
    row = {'torso': list(torso.to_euler('XYZ')), 'head': list(headq.to_euler('XYZ'))}
    # The rig's left limbs drive the model's right bones (ImportedAvatar's map).
    for rig_side, side in (('left', 'Right'), ('right', 'Left')):
        a, c = swing_splay(direction(side + 'UpLeg', side + 'Leg', Quaternion()))
        row[rig_side + 'Leg'] = [a, c]
        row[rig_side + 'Knee'] = bend(side + 'UpLeg', side + 'Leg', side + 'Foot')
        a, c = swing_splay(direction(side + 'Arm', side + 'ForeArm', torso))
        row[rig_side + 'Arm'] = [a, c]
        row[rig_side + 'Elbow'] = bend(side + 'Arm', side + 'ForeArm', side + 'Hand')
        # The ankle below this hip, as a share of standing hip height: 1 is
        # a straight leg on the floor, less is the hips dipped or the foot lifted.
        row[rig_side + 'Drop'] = (head(side + 'UpLeg').y - head(side + 'Foot').y) / standing
    frames.append({k: [round(x, 4) for x in v] if isinstance(v, list) else round(v, 4) for k, v in row.items()})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump({'source': 'art/reference/walking-mixamo.fbx', 'strikes': strikes, 'cycleFrames': round(end - start, 3),
               'fps': scene.render.fps, 'stride': round(stride, 4), 'frames': frames}, f, separators=(',', ':'))
print('WALK', json.dumps({'strikes': strikes, 'cycle': end - start, 'travel': round(travel, 3), 'leg': round(thigh + shin, 3), 'stride': round(stride, 3)}))
