import * as THREE from 'three';

/**
 * Dressing for the buildings.
 *
 * The avatars were rebuilt and the buildings were not, so they still read as
 * the slabs they always were. The instinct is to give them more interesting
 * shapes — but look at what the reference images actually do. The night-city
 * courtyard is built almost entirely from plain boxes. What makes it read as a
 * city is everything stuck to them: air-con units, railings, ledges, the
 * cables slung between one roof and the next. The silhouette is not the thing.
 * The clutter is the thing.
 *
 * So nothing here changes a building's shape. It finds the slabs already in the
 * world and hangs the clutter of an inhabited place off them: a cornice so the
 * roof has an edge, a plinth so the wall meets the ground somewhere, units
 * bolted to the facades, conduit running down a corner, and a ledge partway up.
 * A box with a cornice and four air-con units is not a box any more.
 *
 * Every piece is decoration only. Nothing carries a collider, everything is
 * either above head height or flatter than the padding already around the wall,
 * and the whole pass is skipped unless the style flag asks for it.
 */

/**
 * Stable pseudo-randomness from a position, so a building is dressed the same
 * way on every load. A different arrangement each time would make the world
 * feel unmoored in a way nobody could name but everybody would feel.
 */
function placedRandom(seed: THREE.Vector3, salt: number): number {
  const value = Math.sin(seed.x * 12.9898 + seed.y * 78.233 + seed.z * 37.719 + salt * 4.1) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Every mesh in this world shares one unit cube and is sized by its scale, so a
 * geometry carries no dimensions worth reading and anything parented to a wall
 * inherits that wall's scale. Both facts shape what follows: sizes are read off
 * the world scale, and the dressing is added to the scene at world coordinates
 * rather than as children, so a 1.05-unit air-con box is 1.05 units wherever it
 * lands instead of being multiplied by the twenty-metre wall behind it.
 */
function isBuilding(mesh: THREE.Mesh, size: THREE.Vector3, at: THREE.Vector3): boolean {
  if (mesh.userData.projectorBackground === true) return false;
  if (mesh.userData.wornDressed === true) return false;
  if (mesh.userData.wornDressing === true) return false;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  // Screens, signs and neon are all unlit. A cornice across a cinema screen
  // would be absurd.
  if (material instanceof THREE.MeshBasicMaterial) return false;
  if (size.y < 6) return false;
  if (Math.max(size.x, size.z) < 5) return false;
  // A wall, not a post: something far taller than it is wide is a lamp column,
  // and hanging air-con off a lamp post helps nobody.
  if (size.y > Math.max(size.x, size.z) * 8) return false;
  // Standing up out of the ground, not buried under it.
  if (at.y < 1) return false;
  return true;
}

export function dressBuildings(scene: THREE.Object3D): { walls: number; refused: number; signs: number } {
  scene.updateMatrixWorld(true);

  // Everything unlit is a sign, a screen or a neon band — the things a visitor
  // has to be able to read. Their boxes are collected first so that nothing
  // gets bolted across them; an air-con unit parked on the marquee eats the
  // name of the venue, which is a far worse outcome than a bare wall.
  const keepClear: THREE.Box3[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const surface = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!(surface instanceof THREE.MeshBasicMaterial)) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (!box.isEmpty()) keepClear.push(box.expandByScalar(1.1));
  });
  let refused = 0;
  const overlapsSign = (at: THREE.Vector3) => {
    const clash = keepClear.some((box) => box.containsPoint(at));
    if (clash) refused += 1;
    return clash;
  };

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.94, metalness: 0.02 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x6b6764, roughness: 0.62, metalness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24211f, roughness: 0.88, metalness: 0.06 });

  const walls: Array<{ mesh: THREE.Mesh; size: THREE.Vector3; at: THREE.Vector3 }> = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const size = mesh.getWorldScale(new THREE.Vector3());
    const at = mesh.getWorldPosition(new THREE.Vector3());
    if (!isBuilding(mesh, size, at)) return;
    walls.push({ mesh, size, at });
  });

  const added: THREE.Mesh[] = [];
  for (const { mesh, size, at } of walls) {
    mesh.userData.wornDressed = true;
    const spin = mesh.getWorldQuaternion(new THREE.Quaternion());
    // Local coordinates on the unit cube run -0.5 to 0.5, so this converts a
    // fraction of the wall into the point it actually occupies in the world.
    const place = (x: number, y: number, z: number) =>
      mesh.localToWorld(new THREE.Vector3(x, y, z));
    const piece = (
      width: number,
      height: number,
      depth: number,
      position: THREE.Vector3,
      surface: THREE.Material,
    ) => {
      const part = new THREE.Mesh(unitBox, surface);
      part.scale.set(width, height, depth);
      part.position.copy(position);
      part.quaternion.copy(spin);
      part.userData.wornDressing = true;
      part.receiveShadow = true;
      scene.add(part);
      added.push(part);
      return part;
    };

    // A roof needs an edge. Without one a building simply stops, which is the
    // strongest single tell that a thing was made of boxes.
    piece(size.x + 0.8, 0.55, size.z + 0.8, place(0, 0.5, 0), concrete);
    // And a plinth, so the wall arrives at the ground rather than being pushed
    // into it.
    piece(size.x + 0.5, 0.9, size.z + 0.5, place(0, -0.5, 0), dark);
    // A ledge at a floor line, which gives the wall a horizontal to catch light
    // and somewhere for a shadow to sit under.
    piece(size.x + 0.34, 0.24, size.z + 0.34, place(0, placedRandom(at, 5) * 0.16 - 0.02, 0), concrete);

    // Units bolted to the facades. Never below head height, so nothing ends up
    // somewhere a visitor could walk into it.
    const faces: Array<{ axis: 'x' | 'z'; sign: number; span: number }> = [
      { axis: 'z', sign: 1, span: size.x },
      { axis: 'z', sign: -1, span: size.x },
      { axis: 'x', sign: 1, span: size.z },
      { axis: 'x', sign: -1, span: size.z },
    ];
    let salt = 0;
    for (const face of faces) {
      const units = 1 + Math.floor(placedRandom(at, (salt += 1)) * 3);
      for (let index = 0; index < units; index += 1) {
        const along = (placedRandom(at, (salt += 1)) - 0.5) * 0.7;
        const lowest = 3.6 / size.y - 0.5;
        const up = lowest + placedRandom(at, (salt += 1)) * Math.max(0.05, 0.44 - lowest);
        const out = 0.5 + 0.34 / (face.axis === 'z' ? size.z : size.x);
        const grilleOut = 0.5 + 0.66 / (face.axis === 'z' ? size.z : size.x);
        const seat = face.axis === 'z'
          ? place(along, up, face.sign * out)
          : place(face.sign * out, up, along);
        // Somewhere a sign already is. Leave the wall bare there.
        if (overlapsSign(seat)) continue;
        if (face.axis === 'z') {
          piece(1.05, 0.78, 0.62, seat, metal);
          piece(0.8, 0.55, 0.06, place(along, up, face.sign * grilleOut), dark);
        } else {
          piece(0.62, 0.78, 1.05, seat, metal);
          piece(0.06, 0.55, 0.8, place(face.sign * grilleOut, up, along), dark);
        }
      }
    }

    // Conduit down one corner. Buildings in the places these references are
    // drawn from carry their services on the outside, and one vertical line
    // does a great deal to break a flat wall.
    const cornerX = placedRandom(at, 41) > 0.5 ? 0.46 : -0.46;
    const cornerZ = placedRandom(at, 42) > 0.5 ? 1 : -1;
    const runsAt = place(cornerX, 0, cornerZ * (0.5 + 0.18 / size.z));
    if (!overlapsSign(runsAt)) piece(0.28, size.y - 1.8, 0.28, runsAt, metal);
  }

  return { walls: walls.length, refused, signs: keepClear.length };
}
