"""Run through Blender MCP after inspecting the installed booth.

Only the rear face of the roof sign receives a clean painted surface. The
front lettering, roof, cabinet and counter are preserved.
"""
import bpy


def repair_sign_back(mesh):
    rear = [f for f in mesh.data.polygons if f.center.z > .65 and f.normal.y > .6]
    if len(rear) != 128:
        raise RuntimeError(f'Unexpected sign rear: {len(rear)} faces; inspect before editing')
    material = bpy.data.materials.new('MAT-sign_back_matte_teal')
    material.use_nodes = True
    shader = material.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = (.024, .065, .057, 1)
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['Roughness'].default_value = .9
    mesh.data.materials.append(material)
    index = len(mesh.data.materials) - 1
    for face in rear:
        face.material_index = index
    return {'rear_faces': len(rear), 'material': material.name}
