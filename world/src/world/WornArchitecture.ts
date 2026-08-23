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

export function dressBuildings(
  scene: THREE.Object3D,
  /**
   * Places nothing may be bolted over that the scene itself cannot show us.
   * The public screening screens are the reason this exists: they are CSS3D
   * objects living in a second scene, so a sweep of the world's meshes never
   * sees them, and an air-con unit parked across one covers the film.
   */
  keepClearExtra: THREE.Box3[] = [],
): { walls: number; refused: number; signs: number } {
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
  for (const box of keepClearExtra) keepClear.push(box.clone().expandByScalar(1.1));
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
    const UNIT_WIDTH = 1.05;
    const UNIT_HEIGHT = 0.78;
    const faces: Array<{ axis: 'x' | 'z'; sign: number; span: number; thickness: number }> = [
      { axis: 'z', sign: 1, span: size.x, thickness: size.z },
      { axis: 'z', sign: -1, span: size.x, thickness: size.z },
      { axis: 'x', sign: 1, span: size.z, thickness: size.x },
      { axis: 'x', sign: -1, span: size.z, thickness: size.x },
    ];
    let salt = 0;
    for (const face of faces) {
      // A unit has to fit on the wall it is bolted to, with a margin either
      // side. Several of these walls are a single unit thick, and a unit wider
      // than the face it sits on hangs off both ends into open air — which is
      // what was overflowing. Anything that cannot take one is left bare.
      const room = face.span / 2 - UNIT_WIDTH / 2 - 0.5;
      if (room <= 0) continue;
      // And how many is a question about how much wall there is, not a number
      // picked at random. One per seven units of frontage, three at most: four
      // faces each taking up to three regardless of size is what put a dozen
      // air-conditioners on a shed.
      const units = Math.min(3, Math.floor(face.span / 7));
      if (units < 1) continue;
      const spread = room / face.span;
      // Vertically the same: above head height, and far enough below the
      // cornice that the box is not pushed through the roof edge.
      const lowest = 3.6 / size.y - 0.5;
      const highest = 0.5 - (UNIT_HEIGHT / 2 + 0.9) / size.y;
      if (highest <= lowest) continue;
      for (let index = 0; index < units; index += 1) {
        // Spaced along the face rather than scattered, so two never land on
        // top of each other, with a little wander inside each slot.
        const slot = units === 1 ? 0 : (index / (units - 1) - 0.5) * 2;
        const wander = (placedRandom(at, (salt += 1)) - 0.5) * 0.3;
        const along = THREE.MathUtils.clamp(slot * spread * 0.82 + wander * spread, -spread, spread);
        const up = lowest + placedRandom(at, (salt += 1)) * (highest - lowest);
        const out = 0.5 + 0.34 / face.thickness;
        const grilleOut = 0.5 + 0.66 / face.thickness;
        const seat = face.axis === 'z'
          ? place(along, up, face.sign * out)
          : place(face.sign * out, up, along);
        // Somewhere a sign or a screen already is. Leave the wall bare there.
        if (overlapsSign(seat)) continue;
        if (face.axis === 'z') {
          piece(UNIT_WIDTH, UNIT_HEIGHT, 0.62, seat, metal);
          piece(0.8, 0.55, 0.06, place(along, up, face.sign * grilleOut), dark);
        } else {
          piece(0.62, UNIT_HEIGHT, UNIT_WIDTH, seat, metal);
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
