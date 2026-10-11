"""Selective dressed-hand repair, inspected and executed through Blender MCP.

Preserves the swim body, finger bones, garment masks, UVs, and cap morph.
Male: close the generated palm/finger-root boundary loops.
Female: fit closed palm and five digit surfaces to the existing finger rig.
"""
import math
import bpy
import bmesh
from mathutils import Vector


def repair_tracked_hands(body, arm, sex):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    deform = bm.verts.layers.deform.active
    dressed = bm.verts.layers.float.get('_DRESSED') or bm.verts.layers.float.get('_dressed')
    covered = bm.verts.layers.float.get('_COVERED') or bm.verts.layers.float.get('_covered')
    uv = bm.loops.layers.uv.active
    names = {g.index: g.name for g in body.vertex_groups}

    def owned(v, side=None):
        prefix = (side or '') + 'Hand'
        return v[dressed] > .5 and sum(w for i, w in v[deform].items()
            if (names.get(i, '').startswith(prefix) if side else 'Hand' in names.get(i, ''))) > .5

    report = {}
    image = next(n.image for mat in body.data.materials if mat and mat.use_nodes
                 for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    pixels = list(image.pixels)
    width, height = image.size

    def texel(at):
        x = min(width - 1, max(0, round(at.x * (width - 1))))
        y = min(height - 1, max(0, round(at.y * (height - 1))))
        return pixels[(y * width + x) * 4:(y * width + x) * 4 + 3]

    skin_uvs = [loop[uv].uv.copy() for face in bm.faces if all(owned(v) for v in face.verts)
                for loop in face.loops if (lambda c: c[0] > c[1] > c[2] and min(c) > .3)(texel(loop[uv].uv))]
    if not skin_uvs:
        raise RuntimeError('No inspected skin texel available for the hand repair')
    # Pick a median skin texel, avoiding the atlas islands carrying clothing.
    skin_uvs.sort(key=lambda at: sum(texel(at)))
    clean_uv = skin_uvs[len(skin_uvs) // 2]
    if sex == 'male':
        # GLB splits coincident vertices at UV/normal seams. Only merge the
        # dressed hands, at a tolerance below a finger's surface detail.
        bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if owned(v)], dist=.0002)
        flaps = [f for f in bm.faces if all(e.is_boundary for e in f.edges) and all(owned(v) for v in f.verts)]
        bmesh.ops.delete(bm, geom=flaps, context='FACES')
        edges = {e for e in bm.edges if e.is_boundary and all(owned(v) for v in e.verts)}
        report['boundary_edges_before'] = len(edges)
        added = []
        # Some holes share a vertex. Extract simple cycles rather than treating
        # the entire branching boundary as one polygon.
        while edges:
            start = next(iter(edges)).verts[0]

            def cycle(v, path, used):
                for e in v.link_edges:
                    if e not in edges or e in used:
                        continue
                    other = e.other_vert(v)
                    if other == start and len(path) > 2:
                        return path, used + [e]
                    if other not in path:
                        found = cycle(other, path + [other], used + [e])
                        if found:
                            return found

            found = cycle(start, [start], [])
            if not found:
                raise RuntimeError('Hand boundary is not a closed cycle')
            vertices, loop_edges = found
            edges.difference_update(loop_edges)
            material = next(f.material_index for e in loop_edges for f in e.link_faces)
            # Ear clipping keeps a non-planar palm opening local to its
            # boundary, rather than folding a centre fan through the palm.
            face = bm.faces.new(vertices)
            face.material_index, face.smooth = material, True
            for loop in face.loops:
                loop[uv].uv = clean_uv
            triangles = bmesh.ops.triangulate(bm, faces=[face], ngon_method='EAR_CLIP')['faces']
            for triangle in triangles:
                edge = next((e for e in triangle.edges if len(e.link_faces) == 2 and any(f not in triangles for f in e.link_faces)), None)
                if edge:
                    own_loop = next(l for l in edge.link_loops if l.face == triangle)
                    other_loop = next(l for l in edge.link_loops if l.face != triangle)
                    if own_loop.vert == other_loop.vert:
                        triangle.normal_flip()
            added.extend(triangles)
        # The source has narrow overlapping skin wedges. Keep the patch's
        # triangles distinct from them so export validation does not discard
        # a coincident triangle and reopen the seam.
        local_patches = []
        for face in added:
            corners = list(face.verts)
            centre = bm.verts.new(sum((v.co for v in corners), Vector()) / 3)
            weights = {}
            for v in corners:
                for index, weight in v[deform].items():
                    weights[index] = weights.get(index, 0) + weight / 3
            weights = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:4]
            total = sum(w for i, w in weights)
            for index, weight in weights:
                centre[deform][index] = weight / total
            centre[dressed], centre[covered] = 1, 0
            for layer in bm.verts.layers.shape.values():
                centre[layer] = centre.co
            material = face.material_index
            bm.faces.remove(face)
            for k in range(3):
                patch = bm.faces.new([corners[k], corners[(k + 1) % 3], centre])
                patch.material_index, patch.smooth = material, True
                for loop in patch.loops:
                    loop[uv].uv = clean_uv
                local_patches.append(patch)
        added = local_patches
        # A collapsed export triangle may leave a final three-edge loop.
        residual = [e for e in bm.edges if e.is_boundary and all(owned(v) for v in e.verts)]
        extra = bmesh.ops.holes_fill(bm, edges=residual, sides=3)['faces'] if residual else []
        for f in extra:
            f.smooth = True
            f.material_index = added[0].material_index
            for loop in f.loops:
                existing = next((l for l in loop.vert.link_loops if l.face != f), None)
                if existing:
                    loop[uv].uv = existing[uv].uv
        added += extra
        bm.normal_update()
        bmesh.ops.triangulate(bm, faces=added)
        # The generated skin also contains an isolated triangular flap inside
        # the palm opening. It has no neighbouring faces and is not a surface
        # patch; discard it after closing the surrounding connected skin.
        stray = [f for f in bm.faces if all(e.is_boundary for e in f.edges)
                 and all(owned(v) for v in f.verts)]
        bmesh.ops.delete(bm, geom=stray, context='FACES')
        report['removed_isolated_flaps'] = len(flaps) + len(stray)
        report['boundary_edges_after'] = sum(e.is_boundary and all(owned(v) for v in e.verts) for e in bm.edges)
        if report['boundary_edges_after']:
            raise RuntimeError('Hand repair left an open edge')
        # The generated palm is pinched at several finger roots even after
        # closing its boundaries. A closed inner palm surface bridges those
        # pinches while retaining all original articulated fingers.
        for side in ('Left', 'Right'):
            bones = arm.data.bones
            wrist = bones[side + 'Hand'].head_local
            along = (bones[side + 'HandMiddle1'].head_local - wrist).normalized()
            across = bones[side + 'HandIndex1'].head_local - bones[side + 'HandPinky1'].head_local
            across = (across - along * across.dot(along)).normalized()
            normal = along.cross(across).normalized()
            centre = wrist + along * .039
            created = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1)['verts']
            for vertex in created:
                at = vertex.co.copy()
                vertex.co = centre + along * at.z * .036 + across * at.x * .039 + normal * at.y * .013
                vertex[deform][body.vertex_groups[side + 'Hand'].index] = 1
                vertex[dressed], vertex[covered] = 1, 0
                for layer in bm.verts.layers.shape.values():
                    vertex[layer] = vertex.co
            patches = {f for v in created for f in v.link_faces}
            for face in patches:
                face.material_index, face.smooth = added[0].material_index, True
                for loop in face.loops:
                    loop[uv].uv = clean_uv
            bmesh.ops.triangulate(bm, faces=list(patches))
            report[side + '_palm_bridge_vertices'] = len(created)
    elif sex == 'female':
        # Retain the finger bones, replacing the dressed hand's malformed
        # rectangular palm ledge and digit surfaces with a fitted wrist loft.
        # The ledge extended beyond the index root and read as a sixth digit.
        for side in ('Left', 'Right'):
            bones = arm.data.bones
            wrist = bones[side + 'Hand'].head_local
            along = (bones[side + 'HandMiddle1'].head_local - wrist).normalized()
            across = bones[side + 'HandIndex1'].head_local - bones[side + 'HandPinky1'].head_local
            across = (across - along * across.dot(along)).normalized()
            normal = along.cross(across).normalized()
            mine = {i for i, n in names.items() if n == side + 'ForeArm' or n.startswith(side + 'Hand')}

            def palm_owned(v):
                return v[dressed] > .5 and sum(w for i, w in v[deform].items() if i in mine) > .5

            bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if palm_owned(v)], dist=.0002)
            remove = [v for v in bm.verts if palm_owned(v) and (v.co - wrist).dot(along) > -.020]
            material = next(f.material_index for v in remove for f in v.link_faces)
            bmesh.ops.delete(bm, geom=remove, context='VERTS')
            boundary = [e for e in bm.edges if e.is_boundary and all(palm_owned(v) for v in e.verts)
                        and all(-.08 < (v.co - wrist).dot(along) < .0 for v in e.verts)]
            if not boundary:
                raise RuntimeError('Missing inspected female wrist boundary')
            order = [boundary[0].verts[0]]
            edge = boundary[0]
            while True:
                vertex = edge.other_vert(order[-1])
                if vertex == order[0]:
                    break
                order.append(vertex)
                choices = [e for e in vertex.link_edges if e in boundary and e != edge]
                if len(choices) != 1:
                    raise RuntimeError('Female wrist boundary is not one closed ring')
                edge = choices[0]
            if len(order) != len(boundary):
                raise RuntimeError('Unexpected additional female wrist boundary')
            centre = sum((v.co for v in order), Vector()) / len(order)
            cx, cz = (centre - wrist).dot(across), (centre - wrist).dot(normal)
            theta = [math.atan2((v.co - centre).dot(normal), (v.co - centre).dot(across)) for v in order]
            rings = [order]
            # Round off the knuckle edge beneath the existing finger bases;
            # there is no flat shelf on the thumb side of the index finger.
            rows = [(-.018, .030, .021), (0, .032, .020), (.025, .041, .017),
                    (.050, .041, .014), (.065, .039, .012), (.073, .036, .009),
                    (.078, .027, .004)]
            for l, half_width, depth in rows:
                f = min(1, max(0, (l + .02) / .075))
                centre_x, centre_z = cx * (1 - f) - .010 * f, cz * (1 - f)
                ring = []
                for t in theta:
                    c, s = math.cos(t), math.sin(t)
                    ring_width = half_width
                    if c > 0 and l <= 0:
                        ring_width = .041 if l < 0 else .039
                    # A rounded thenar pad joins the thumb base to the palm.
                    # It fades before the index root, so it cannot read as a digit.
                    pad = .009 * max(0, c) ** 2 * max(0, 1 - abs(l - .029) / .043)
                    vertex = bm.verts.new(wrist + along * l + across * (centre_x + ring_width * math.copysign(abs(c) ** .75, c) + pad)
                                          + normal * (centre_z + (depth + pad * .3) * math.copysign(abs(s) ** .75, s)))
                    # The runtime rolls the hand relative to the forearm.
                    # Blend that roll across the wrist instead of applying
                    # the full hand rotation at the first replacement ring.
                    hand_weight = min(1, max(0, (l + .040) / .060))
                    hand_weight = hand_weight * hand_weight * (3 - 2 * hand_weight)
                    vertex[deform][body.vertex_groups[side + 'Hand'].index] = hand_weight
                    if hand_weight < 1:
                        vertex[deform][body.vertex_groups[side + 'ForeArm'].index] = 1 - hand_weight
                    vertex[dressed], vertex[covered] = 1, 0
                    for layer in bm.verts.layers.shape.values():
                        vertex[layer] = vertex.co
                    ring.append(vertex)
                rings.append(ring)
            faces = []
            for a, b in zip(rings, rings[1:]):
                for k in range(len(order)):
                    faces.append(bm.faces.new([a[k], a[(k + 1) % len(order)], b[(k + 1) % len(order)], b[k]]))
            faces.append(bm.faces.new(rings[-1]))
            for face in faces:
                face.material_index, face.smooth = material, True
                for loop in face.loops:
                    loop[uv].uv = clean_uv
            bmesh.ops.recalc_face_normals(bm, faces=faces)
            bmesh.ops.triangulate(bm, faces=faces)
            report[side + '_palm'] = {'removed_vertices': len(remove), 'wrist_ring': len(order)}
        # The source thumb rig points back into the wrist on one side. Align
        # both metacarpals to the measured palm plane before adding geometry.
        bpy.ops.object.select_all(action='DESELECT')
        arm.hide_set(False)
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        for side in ('Left', 'Right'):
            bones = arm.data.edit_bones
            wrist = bones[side + 'Hand'].head.copy()
            along = (bones[side + 'HandMiddle1'].head - wrist).normalized()
            across = bones[side + 'HandIndex1'].head - bones[side + 'HandPinky1'].head
            across = (across - along * across.dot(along)).normalized()
            base = wrist + along * .022 + across * .030
            tip = base + along * .043 + across * .043
            points = [base.lerp(tip, t) for t in (0, .48, .76, 1)]
            for i in range(3):
                bone = bones[side + 'HandThumb' + str(i + 1)]
                bone.head, bone.tail = points[i], points[i + 1]
            bones[side + 'HandThumb4'].head = tip
            bones[side + 'HandThumb4'].tail = tip + (tip - base).normalized() * .004
        bpy.ops.object.mode_set(mode='OBJECT')
        bpy.context.view_layer.update()
        for side, digit in ((s, d) for s in ('Left', 'Right') for d in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')):
            chain = [arm.data.bones[side + 'Hand' + digit + str(i)] for i in (1, 2, 3)]
            points = [b.head_local.copy() for b in chain] + [chain[-1].tail_local.copy()]
            axis = (points[-1] - points[0]).normalized()
            across = axis.cross(Vector((0, 0, 1))).normalized()
            normal = axis.cross(across).normalized()
            # The base cap sits inside the existing closed palm. The shaft
            # follows the inspected thumb bones, with a rounded closed tip.
            centres = [points[0] - axis * (.010 if digit == 'Thumb' else .005)]
            owners = [{body.vertex_groups[side + 'Hand'].index: 1}]
            radius = .012 if digit == 'Thumb' else .0088
            radii = [radius * 1.08]
            for segment in range(3):
                for step in range(3):
                    t = step / 3
                    centres.append(points[segment].lerp(points[segment + 1], t))
                    a = body.vertex_groups[side + 'Hand' + digit + str(segment + 1)].index
                    b = body.vertex_groups[side + 'Hand' + digit + str(min(segment + 2, 3))].index
                    weights = {a: 1 - t, b: t} if a != b else {a: 1}
                    if digit == 'Thumb' and segment == 0:
                        hand_share = .65 * (1 - t) ** 2
                        weights = {i: w * (1 - hand_share) for i, w in weights.items()}
                        weights[body.vertex_groups[side + 'Hand'].index] = hand_share
                    owners.append(weights)
                    radii.append(radius * (1 - .22 * (segment + t) / 3))
            centres += [points[-1], points[-1] + axis * .004]
            owners += [{body.vertex_groups[side + 'Hand' + digit + '3'].index: 1}] * 2
            radii += [radius * .58, .0015]
            palm = [v for v in bm.verts if owned(v, side)]
            source = min(palm, key=lambda v: (v.co - points[0]).length)
            source_uv = clean_uv
            material = source.link_faces[0].material_index
            rings = []
            for centre, radius, weights in zip(centres, radii, owners):
                ring = []
                for k in range(10):
                    angle = k * math.tau / 10
                    v = bm.verts.new(centre + radius * (across * math.cos(angle) + normal * math.sin(angle)))
                    for index, weight in weights.items():
                        v[deform][index] = weight
                    v[dressed], v[covered] = 1, 0
                    for layer in bm.verts.layers.shape.values():
                        v[layer] = v.co
                    ring.append(v)
                rings.append(ring)
            faces = [bm.faces.new(list(reversed(rings[0]))), bm.faces.new(rings[-1])]
            for first, second in zip(rings, rings[1:]):
                for k in range(10):
                    faces.append(bm.faces.new([first[k], first[(k + 1) % 10], second[(k + 1) % 10], second[k]]))
            for f in faces:
                f.material_index, f.smooth = material, True
                for l in f.loops:
                    l[uv].uv = source_uv
            bmesh.ops.recalc_face_normals(bm, faces=faces)
            bmesh.ops.triangulate(bm, faces=faces)
            report[side + '_' + digit] = {'vertices': sum(len(r) for r in rings), 'closed': all(not e.is_boundary for r in rings for v in r for e in v.link_edges)}
    # Existing generated thumb tips also contain stray dark atlas texels.
    # A hand has no cloth: re-map only contaminated hand triangles.
    cleaned = 0
    for face in bm.faces:
        if not all(owned(v) for v in face.verts):
            continue
        colours = [texel(l[uv].uv) for l in face.loops]
        if any(min(c) < .25 or max(c) - min(c) < .04 for c in colours):
            for loop in face.loops:
                loop[uv].uv = clean_uv
            cleaned += 1
    report['contaminated_hand_uv_faces'] = cleaned
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    return report
