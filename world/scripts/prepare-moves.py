"""The avatars' punch and dance, taken from the owner's Mixamo files
(2026-10-01): art/reference/punching.fbx, a right jab, and
art/reference/northern-soul-floor-combo.fbx, a Northern Soul floor routine.

Both are on the avatars' bone names, but they rest in a T-pose and the
avatars in their generated A-pose. Each bone's motion is kept as its turn
away from the file's rest, in the body's frame, with every joint's rest
position beside it: the game first turns each of a body's bones onto the
file's rest (from its own rest direction to the file's), then applies the
turn. Applied straight onto the A-pose, every arm was off by the difference
and the dance's arms were wrong (the owner, October 2). The hips' travel and drop are kept too, as fractions of the standing
hip height, so the routine travels and goes down to the floor as authored.

Run: /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/prepare-moves.py
Writes src/data/moves.json.
"""
import bpy, json, os
from mathutils import Matrix, Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
REFERENCE = os.path.join(HERE, '..', '..', 'art', 'reference')
OUT = os.path.join(HERE, '..', 'src', 'data', 'moves.json')
BONES = ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head',
         'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
         'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
         'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
         'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']
# Blender (x, y, z), facing -y, to the body's three.js frame (x, y up, z forward).
C = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))
FPS = 24


def read(path, first, last, contact=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    scene = bpy.context.scene
    M = arm.matrix_world.to_3x3()
    rest = {n: (M @ arm.data.bones[n].matrix_local.to_3x3()).normalized() for n in BONES}
    frames = list(range(first, last + 1))
    hips, feet = [], []
    for f in frames:
        scene.frame_set(f)
        hips.append(arm.matrix_world @ arm.pose.bones['Hips'].head)
        feet.append(min((arm.matrix_world @ arm.pose.bones[s + 'Foot'].head).z for s in ('Left', 'Right')))
    # The floor under the ankles, and the hips' height standing: taken over
    # the whole clip (taken only at frames where both feet were down, it was
    # a crouch, and every move travelled three times too far).
    import statistics
    ground = sorted(feet)[len(feet) // 20]
    standing = sorted(h.z for h in hips)[int(len(hips) * .9)]
    leg = standing - ground
    start = hips[0]
    bones = {n: [] for n in BONES}
    travel = []
    for k, f in enumerate(frames):
        scene.frame_set(f)
        for n in BONES:
            W = (M @ arm.pose.bones[n].matrix.to_3x3()).normalized()
            D = C @ (W @ rest[n].inverted()) @ C.transposed()
            q = D.to_quaternion()
            # Same hemisphere as the frame before, so the game's blend between
            # frames never swings a bone the long way round.
            if len(bones[n]) >= 4 and q.dot(Quaternion(bones[n][-1:] + bones[n][-4:-1])) < 0:
                q.negate()
            bones[n] += [round(q.x, 4), round(q.y, 4), round(q.z, 4), round(q.w, 4)]
        h = hips[k]
        offset = C @ Vector((h.x - start.x, h.y - start.y, h.z - standing))
        travel += [round(v / leg, 4) for v in offset]
    scene.frame_set(first)
    joints = {n: [round(v, 4) for v in C @ (arm.matrix_world @ arm.data.bones[n].head_local)] for n in BONES}
    clip = {'frames': len(frames), 'bones': bones, 'hips': travel, 'rest': joints}
    if contact is not None:
        clip['contact'] = round((contact - first) / FPS, 3)
    return clip


moves = {
    'fps': FPS,
    # The fist is furthest out at frame 9.
    'punch': read(os.path.join(REFERENCE, 'punching.fbx'), 1, 23, contact=9),
    # Frame 255 is frame 1 again: one 254-frame cycle, looped.
    'dance': read(os.path.join(REFERENCE, 'northern-soul-floor-combo.fbx'), 1, 254),
}
with open(OUT, 'w') as f:
    json.dump(moves, f, separators=(',', ':'))
print('MOVES', {k: v['frames'] for k, v in moves.items() if isinstance(v, dict)}, os.path.getsize(OUT))
