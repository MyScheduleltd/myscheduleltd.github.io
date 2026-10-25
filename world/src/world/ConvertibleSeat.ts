import * as THREE from 'three';

// The proxy must stay hidden even while shader warmup temporarily shows hidden
// objects. It is a measurement only, with no draw, occlusion or raycast role.
const anchorMaterial = new THREE.MeshBasicMaterial({ visible: false });

/**
 * Keep a seat's support attached to its car after visible parts are batched.
 * Each box retains the source mesh's car-local transform, so nested/scaled
 * future cushion models and later buildOnGrade relocation keep the same bounds.
 */
export function createConvertibleSeatProxy(car: THREE.Object3D, cushion: THREE.Object3D, role: 'driver' | 'passenger' = 'driver'): THREE.Mesh {
  car.updateWorldMatrix(true, true);
  const toCar = new THREE.Matrix4().copy(car.matrixWorld).invert();
  const proxy = new THREE.Mesh(new THREE.BufferGeometry(), anchorMaterial);
  proxy.name = `Convertible ${role} seat anchor`;
  proxy.visible = false;
  proxy.userData.environmentExclude = true;
  proxy.userData.convertibleSeatAnchor = true;
  proxy.userData.convertibleSeatRole = role;
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

export interface ConvertibleReviewSeat {
  id: string;
  position: THREE.Vector3;
  forward?: number;
  footFloor?: number;
  cushion?: THREE.Mesh;
}

/** Loopback review data only; callers decide how to expose this snapshot. */
export function driveInSeatLayoutSnapshot<T extends ConvertibleReviewSeat>(seats: readonly T[], anchorFor?: (seat: T) => THREE.Vector3) {
  const describe = (seat: T | undefined) => {
    if (!seat?.cushion) return undefined;
    const pad = new THREE.Box3().setFromObject(seat.cushion);
    return { id: seat.id, position: seat.position.toArray(), anchor: anchorFor?.(seat).toArray(),
      footFloor: seat.footFloor, pad: { min: pad.min.toArray(), max: pad.max.toArray() },
      proxyVisible: seat.cushion.visible, role: seat.cushion.userData.convertibleSeatRole };
  };
  const pairs = Array.from({ length: 6 }, (_, index) => {
    const driverId = `DRIVE-${Math.floor(index / 3) + 1}-${index % 3 + 1}`;
    const passengerId = `DRIVE-${index + 1}-PASSENGER`;
    const driver = seats.find(seat => seat.id === driverId), passenger = seats.find(seat => seat.id === passengerId);
    const driverPad = driver?.cushion && new THREE.Box3().setFromObject(driver.cushion);
    const passengerPad = passenger?.cushion && new THREE.Box3().setFromObject(passenger.cushion);
    return { number: index + 1, driver: describe(driver), passenger: describe(passenger),
      sameCar: Boolean(driver?.cushion?.parent && driver.cushion.parent === passenger?.cushion?.parent),
      independentPads: Boolean(driver?.cushion && passenger?.cushion && driver.cushion !== passenger.cushion && !driverPad!.intersectsBox(passengerPad!)),
      separation: driver && passenger ? driver.position.distanceTo(passenger.position) : undefined };
  });
  return { cars: pairs.length, seats: pairs.filter(pair => pair.driver).length + pairs.filter(pair => pair.passenger).length,
    complete: pairs.every(pair => pair.sameCar && pair.independentPads), pairs };
}
