import * as THREE from 'three';

// The proxy must stay hidden even while shader warmup temporarily shows hidden
// objects. It is a measurement only, with no draw, occlusion or raycast role.
const anchorMaterial = new THREE.MeshBasicMaterial({ visible: false });

/**
 * Keep a seat's support attached to its car after visible parts are batched.
 * Each box retains the source mesh's car-local transform, so nested/scaled
 * future cushion models and later buildOnGrade relocation keep the same bounds.
 */
export function createConvertibleSeatProxy(car: THREE.Object3D, cushion: THREE.Object3D): THREE.Mesh {
  car.updateWorldMatrix(true, true);
  const toCar = new THREE.Matrix4().copy(car.matrixWorld).invert();
  const proxy = new THREE.Mesh(new THREE.BufferGeometry(), anchorMaterial);
  proxy.name = 'Convertible driver seat anchor';
  proxy.visible = false;
  proxy.userData.environmentExclude = true;
  proxy.userData.convertibleSeatAnchor = true;
  proxy.raycast = () => {};
  cushion.traverseVisible(object => {
    const source = object as THREE.Mesh;
    if (!source.isMesh) return;
    const positions = source.geometry?.getAttribute('position');
    if (!positions) return;
    const bounds = source.geometry.boundingBox?.clone() ?? new THREE.Box3();
    if (!source.geometry.boundingBox) {
      const vertex = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) bounds.expandByPoint(vertex.fromBufferAttribute(positions, i));
    }
    if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) return;
    const size = bounds.getSize(new THREE.Vector3()), centre = bounds.getCenter(new THREE.Vector3());
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    geometry.translate(centre.x, centre.y, centre.z);
    const part = new THREE.Mesh(geometry, anchorMaterial);
    part.visible = false;
    part.matrix.copy(toCar).multiply(source.matrixWorld);
    part.matrixAutoUpdate = false;
    part.raycast = () => {};
    proxy.add(part);
  });
  if (!proxy.children.length) throw new Error('Convertible seat needs finite visible cushion bounds');
  car.add(proxy);
  return proxy;
}
