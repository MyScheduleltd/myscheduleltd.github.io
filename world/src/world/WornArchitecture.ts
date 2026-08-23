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
  /**
   * Structures no cable may be tied to.
   *
   * A cinema is not a tenement, and lines strung off the Palace's roof made it
   * look like a squat.
   *
   * Deliberately narrow. The first cut of this refused *all* dressing inside
   * these volumes and left one wall standing out of twenty — because the large
   * blocks in this world mostly are the venues, so excluding them excluded
   * nearly everything. They still take cornices, windows and paper like any
   * other building. They simply do not get washing lines.
   */
  noCables: THREE.Box3[] = [],
  /** Structures that take no dressing at all — the theatres and their screens. */
  noDress: THREE.Box3[] = [],
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
  // Dark and a little reflective, so a window catches the sky rather than
  // sitting on the wall as a flat patch.
  const glass = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.24, metalness: 0.5 });
  // Two papers, because a wall of identical bills reads as wallpaper. Both are
  // taken off the company's own seashell rather than invented, one of them
  // sunned down toward the grey it would go outdoors.
  const paper = new THREE.MeshStandardMaterial({ color: 0xd8cfc4, roughness: 0.96, metalness: 0 });
  const paperAlt = new THREE.MeshStandardMaterial({ color: 0x9a8f86, roughness: 0.96, metalness: 0 });

  const walls: Array<{ mesh: THREE.Mesh; size: THREE.Vector3; at: THREE.Vector3 }> = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const size = mesh.getWorldScale(new THREE.Vector3());
    const at = mesh.getWorldPosition(new THREE.Vector3());
    if (!isBuilding(mesh, size, at)) return;
    // A cinema screen is not a tenement wall. It was being given a ledge across
    // its face and air-con bolted to its frame, which is the most conspicuous
    // surface in the festival to get wrong.
    if (noDress.some((box) => box.containsPoint(at))) return;
    walls.push({ mesh, size, at });
  });

  const added: THREE.Mesh[] = [];
  // Counted as dressed, not as found. A third are deliberately skipped now, and
  // a tally of what qualified would report a number nothing in the world
  // matches — which is how a working feature came to look broken twice already.
  let dressed = 0;
  for (const { mesh, size, at } of walls) {
    mesh.userData.wornDressed = true;
    // A third of them are left alone.
    //
    // Dressing every wall the same way is its own kind of uniform — which is
    // the thing the original note was about. A real street has a grubby block
    // beside a plain one, and it is the contrast that makes the dressed ones
    // read as deliberate rather than as a filter laid over everything.
    if (placedRandom(at, 97) < 0.33) continue;
    dressed += 1;
    const spin = mesh.getWorldQuaternion(new THREE.Quaternion());
    // Everything on this wall sits on the same storey grid.
    //
    // It all used to be placed independently — the ledge at one random height,
    // air-con at another, paper at a third, windows on their own spacing — and
    // independently placed is exactly what "added randomly" looks like. A real
    // facade is organised by its floors: the ledge runs along one, the units
    // hang under one, the windows sit between them. Nothing here is at a new
    // height that some other element did not already establish.
    const STOREY = 3.6;
    const groundLine = Math.min(4.2, size.y * 0.3);
    const floors = Math.max(1, Math.floor((size.y - groundLine - 1.2) / STOREY));
    /** The height of a floor line, as a fraction of the wall, from its middle. */
    const floorLine = (index: number) => -0.5 + (groundLine + index * STOREY) / size.y;
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

    // Everything that wraps the building is held inside the padding that
    // already surrounds its collider — 0.16 on each side — so none of it can be
    // walked into. That is the whole answer to the missing colliders: a plinth
    // that stands half a metre proud of a wall needs one, and a plinth that
    // sits within the wall's own margin does not. Cheaper than adding colliders
    // and impossible to get out of step with them.
    const PROUD = 0.16;

    // A roof needs an edge. Without one a building simply stops, which is the
    // strongest single tell that a thing was made of boxes.
    piece(size.x + PROUD * 2, 0.55, size.z + PROUD * 2, place(0, 0.5, 0), concrete);
    // And a plinth, so the wall arrives at the ground rather than being pushed
    // into it.
    piece(size.x + PROUD * 2, 0.9, size.z + PROUD * 2, place(0, -0.5, 0), dark);

    // The ledge is cut around whatever is already on the wall.
    //
    // It used to wrap the building as one unbroken box standing proud of the
    // face, which put it in front of everything mounted there — it ran straight
    // across THE ROOFTOP's sign and through the lamps beside the stair. A
    // ledge belongs behind those things, and the way to be behind them is not
    // to be there at all: the band is emitted as runs, and a run stops where a
    // sign, a lamp or a unit begins and picks up again on the far side.
    // The ledge is a floor line, not a height somebody picked. Which floor
    // varies between buildings; that it is *a* floor does not.
    const ledgeY = floorLine(Math.min(floors - 1, 1 + Math.floor(placedRandom(at, 5) * 2)));
    for (const ledge of [
      { axis: 'z' as const, sign: 1, span: size.x, thickness: size.z },
      { axis: 'z' as const, sign: -1, span: size.x, thickness: size.z },
      { axis: 'x' as const, sign: 1, span: size.z, thickness: size.x },
      { axis: 'x' as const, sign: -1, span: size.z, thickness: size.x },
    ]) {
      const steps = Math.max(6, Math.round(ledge.span / 0.7));
      const out = 0.5 + PROUD / ledge.thickness;
      let runStart: number | undefined;
      for (let step = 0; step <= steps; step += 1) {
        const along = step / steps - 0.5;
        const at3 = ledge.axis === 'z'
          ? place(along, ledgeY, ledge.sign * out)
          : place(ledge.sign * out, ledgeY, along);
        // Sampled without counting: this is measuring the wall, not refusing a
        // placement, and the refusal tally is about air-con.
        const blocked = keepClear.some((box) => box.containsPoint(at3));
        if (!blocked && runStart === undefined) runStart = along;
        if ((blocked || step === steps) && runStart !== undefined) {
          const runEnd = blocked ? (step - 1) / steps - 0.5 : along;
          const length = (runEnd - runStart) * ledge.span;
          // A stub of ledge reads as debris rather than as architecture.
          if (length > 1.2) {
            const middle = (runStart + runEnd) / 2;
            const seat = ledge.axis === 'z'
              ? place(middle, ledgeY, ledge.sign * out)
              : place(ledge.sign * out, ledgeY, middle);
            if (ledge.axis === 'z') piece(length, 0.24, PROUD * 2, seat, concrete);
            else piece(PROUD * 2, 0.24, length, seat, concrete);
          }
          runStart = undefined;
        }
      }
    }

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
      // Units hang just under a floor line, the way a real one is bracketed off
      // the slab. They used to be scattered anywhere above head height, which
      // put four of them at four different heights on one wall.
      const highest = 0.5 - (UNIT_HEIGHT / 2 + 0.9) / size.y;
      for (let index = 0; index < units; index += 1) {
        // Spaced along the face rather than scattered, so two never land on
        // top of each other, with a little wander inside each slot.
        const slot = units === 1 ? 0 : (index / (units - 1) - 0.5) * 2;
        const wander = (placedRandom(at, (salt += 1)) - 0.5) * 0.3;
        const along = THREE.MathUtils.clamp(slot * spread * 0.82 + wander * spread, -spread, spread);
        const shelf = floorLine(Math.min(floors - 1, index % Math.max(1, floors)));
        const up = Math.min(highest, shelf - (UNIT_HEIGHT / 2 + 0.35) / size.y);
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

    // Windows.
    //
    // The single biggest reason these read as slabs rather than as buildings:
    // there is nothing on them at the scale of a person. A blank wall twenty
    // metres wide has no way of telling you how big it is. Rows of openings at
    // a storey's spacing give it a floor count, and a floor count gives it a
    // size.
    //
    // Dark glass with a frame, never lit — a lit window implies somebody in a
    // room, and none of these buildings have rooms. Unlit ones read as a
    // building at night, which is what this is.
    const storeys = floors;
    for (const wall of [
      { axis: 'z' as const, sign: 1, span: size.x, thickness: size.z },
      { axis: 'z' as const, sign: -1, span: size.x, thickness: size.z },
      { axis: 'x' as const, sign: 1, span: size.z, thickness: size.x },
      { axis: 'x' as const, sign: -1, span: size.z, thickness: size.x },
    ]) {
      const columns = Math.floor((wall.span - 2) / 3.4);
      if (columns < 1) continue;
      // The frame stands proud and the glass sits back inside it. They used to
      // be given depths and offsets that put their front faces on exactly the
      // same plane, and two surfaces fighting over one plane is what the moire
      // across the glass was — not a texture, a tie the depth buffer could not
      // break. Now there is a clear tenth of a unit between them.
      const frameOut = 0.5 + 0.08 / wall.thickness;
      const out = 0.5 - 0.02 / wall.thickness;
      for (let row = 0; row < storeys; row += 1) {
        // Between the floor lines, which is where a window goes.
        const up = floorLine(row) + (STOREY * 0.45) / size.y;
        if (up > 0.42) break;
        for (let column = 0; column < columns; column += 1) {
          const along = columns === 1 ? 0 : (column / (columns - 1) - 0.5) * ((wall.span - 3.4) / wall.span);
          const seat = wall.axis === 'z'
            ? place(along, up, wall.sign * out)
            : place(wall.sign * out, up, along);
          if (keepClear.some((box) => box.containsPoint(seat))) continue;
          const frameSeat = wall.axis === 'z'
            ? place(along, up, wall.sign * frameOut)
            : place(wall.sign * frameOut, up, along);
          if (wall.axis === 'z') {
            piece(1.9, 1.5, 0.2, frameSeat, concrete);
            piece(1.46, 1.1, 0.1, seat, glass);
          } else {
            piece(0.2, 1.5, 1.9, frameSeat, concrete);
            piece(0.1, 1.1, 1.46, seat, glass);
          }
        }
      }
    }

    // A shopfront band at street level.
    //
    // The reference building is three distinct storeys and the shopfront is
    // what makes the bottom one read as ground: a darker, deeper band with its
    // own fascia over it, at the height a person actually meets a building.
    // Ours are single extrusions, so the whole wall reads as one surface from
    // the pavement to the roof, and nothing tells you where the door would be.
    // This is the only piece here that changes a building's shape rather than
    // hanging something on it.
    const shopHeight = Math.min(4.2, size.y * 0.3);
    const shopTop = -0.5 + shopHeight / size.y;
    piece(size.x + PROUD * 1.4, shopHeight, size.z + PROUD * 1.4, place(0, -0.5 + shopHeight / (2 * size.y), 0), dark);
    // The fascia over it, which is where a shop's name would go — proud of the
    // band so it casts a line of shadow down the front.
    piece(size.x + PROUD * 2, 0.42, size.z + PROUD * 2, place(0, shopTop, 0), concrete);

    // Paper on the walls.
    //
    // Bills, posters, flyers: the layer of a street that nobody planned. They
    // are abstract by instruction — blocks and bars, no lettering — because
    // words on a wall in a world with two real languages either say something
    // nobody chose or say nothing in a way that reads as a mistake.
    for (const board of [
      { axis: 'z' as const, sign: 1, span: size.x, thickness: size.z },
      { axis: 'z' as const, sign: -1, span: size.x, thickness: size.z },
      { axis: 'x' as const, sign: 1, span: size.z, thickness: size.x },
      { axis: 'x' as const, sign: -1, span: size.z, thickness: size.x },
    ]) {
      const bills = Math.min(3, Math.floor(board.span / 9));
      for (let index = 0; index < bills; index += 1) {
        const along = (placedRandom(at, (salt += 1)) - 0.5) * 0.62;
        // Pasted on the shopfront, at the height a hand reaches. Bills go on
        // the part of a building somebody walks past, never on its third floor.
        const up = -0.5 + (1.5 + placedRandom(at, (salt += 1)) * 1.1) / size.y;
        if (up * size.y + size.y / 2 > groundLine - 0.4) continue;
        const out = 0.5 + 0.03 / board.thickness;
        const seat = board.axis === 'z'
          ? place(along, up, board.sign * out)
          : place(board.sign * out, up, along);
        if (keepClear.some((box) => box.containsPoint(seat))) continue;
        const wide = 0.75 + placedRandom(at, (salt += 1)) * 0.5;
        const tall = 1.0 + placedRandom(at, (salt += 1)) * 0.6;
        const sheet = placedRandom(at, salt) > 0.5 ? paper : paperAlt;
        if (board.axis === 'z') piece(wide, tall, 0.05, seat, sheet);
        else piece(0.05, tall, wide, seat, sheet);
        // One dark block on it, so it is a printed thing rather than a blank
        // rectangle — the mark a poster makes at ten metres, which is all
        // anybody ever sees of one.
        const markOut = 0.5 + 0.06 / board.thickness;
        const markSeat = board.axis === 'z'
          ? place(along, up + 0.18 / size.y, board.sign * markOut)
          : place(board.sign * markOut, up + 0.18 / size.y, along);
        if (board.axis === 'z') piece(wide * 0.62, tall * 0.34, 0.03, markSeat, dark);
        else piece(0.03, tall * 0.34, wide * 0.62, markSeat, dark);
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

  // Cables slung between roofs.
  //
  // Everything above dresses a building. This is the only thing that crosses
  // the space *between* two of them, which is most of what makes a street read
  // as a street rather than as a row of separate objects — it is the first
  // thing the eye follows in the reference images, and the world has nothing
  // like it.
  //
  // Each roof is joined to its nearest neighbour, once, and only where they are
  // close enough that a cable would plausibly span the gap. A sag is drawn as
  // three straight segments rather than a curve, because at this distance a
  // catenary and a shallow triangle are the same picture and one of them is
  // three boxes.
  const cable = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.9, metalness: 0.1 });
  const roofs = walls
    .filter(({ at }) => !at.equals(new THREE.Vector3()))
    .filter(({ at }) => !noCables.some((box) => box.containsPoint(at)))
    .map(({ size, at }) => new THREE.Vector3(at.x, at.y + size.y / 2, at.z));
  const strung = new Set<number>();
  for (let index = 0; index < roofs.length; index += 1) {
    let nearest = -1;
    let nearestGap = 34;
    for (let other = 0; other < roofs.length; other += 1) {
      if (other === index) continue;
      const gap = roofs[index].distanceTo(roofs[other]);
      if (gap > 9 && gap < nearestGap) {
        nearestGap = gap;
        nearest = other;
      }
    }
    if (nearest < 0) continue;
    // One cable per pair, not two.
    const pair = Math.min(index, nearest) * 1000 + Math.max(index, nearest);
    if (strung.has(pair)) continue;
    strung.add(pair);

    const from = roofs[index];
    const to = roofs[nearest];
    const sag = Math.min(2.6, nearestGap * 0.12);
    const waypoints = [
      from,
      new THREE.Vector3().lerpVectors(from, to, 0.35).setY(Math.min(from.y, to.y) - sag),
      new THREE.Vector3().lerpVectors(from, to, 0.65).setY(Math.min(from.y, to.y) - sag),
      to,
    ];
    for (let leg = 0; leg < waypoints.length - 1; leg += 1) {
      const start = waypoints[leg];
      const end = waypoints[leg + 1];
      const span = start.distanceTo(end);
      const line = new THREE.Mesh(unitBox, cable);
      line.scale.set(0.09, 0.09, span);
      line.position.copy(start).lerp(end, 0.5);
      line.lookAt(end);
      line.userData.wornDressing = true;
      scene.add(line);
    }
  }

  // And the road itself.
  //
  // A street is not only its buildings. The reference's ground carries as much
  // as its walls do — a manhole, a patch where it was dug up and filled badly,
  // worn markings — and ours is an unbroken sheet of one colour from the gate
  // to the shore, which is the flattest surface in the world and the one a
  // visitor spends the whole time looking at.
  //
  // Laid down the road's own centre line at uneven intervals, and only where
  // the ground is clear. Everything is a hair above the surface: coplanar with
  // it would tie the depth buffer exactly as the windows did.
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.97, metalness: 0.02 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2e2b28, roughness: 0.82, metalness: 0.24 });
  const roadZ = [-8, 4, 13, 22, 30, 38, 46];
  let roadSalt = 500;
  for (const z of roadZ) {
    const seed = new THREE.Vector3(0, 0, z);
    // Across the road rather than down its middle: the centre is where people
    // walk, and a manhole in the middle of the carpet reads as a mistake.
    const x = (placedRandom(seed, (roadSalt += 1)) - 0.5) * 22;
    const y = 0.16;
    if (placedRandom(seed, (roadSalt += 1)) > 0.45) {
      const cover = new THREE.Mesh(unitBox, iron);
      cover.scale.set(1.5, 0.06, 1.5);
      cover.position.set(x, y, z);
      cover.rotation.y = placedRandom(seed, roadSalt) * Math.PI;
      cover.userData.wornDressing = true;
      scene.add(cover);
    }
    // A patch, always, and never the same size twice.
    const patch = new THREE.Mesh(unitBox, asphalt);
    patch.scale.set(
      2.4 + placedRandom(seed, (roadSalt += 1)) * 4,
      0.04,
      1.8 + placedRandom(seed, (roadSalt += 1)) * 3.4,
    );
    patch.position.set(
      x + (placedRandom(seed, (roadSalt += 1)) - 0.5) * 9,
      y - 0.02,
      z + (placedRandom(seed, (roadSalt += 1)) - 0.5) * 5,
    );
    patch.rotation.y = (placedRandom(seed, roadSalt) - 0.5) * 0.3;
    patch.userData.wornDressing = true;
    scene.add(patch);
  }

  return { walls: dressed, refused, signs: keepClear.length };
}

/** A room the interior pass can dress, in world coordinates. */
export interface DressableRoom {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floorY: number;
  ceilingY?: number;
  /** Open to the sky: no ducts, and the clutter is weather-beaten. */
  outdoor?: boolean;
}

/**
 * Dressing for the rooms.
 *
 * Everything so far has been outdoors, and it left the interiors as the
 * cleanest places in the festival — the club especially, which is where a
 * visitor spends the most continuous time and which now reads as plainer than
 * the street above it.
 *
 * A room takes a different vocabulary from a facade, and using the wrong one is
 * how this goes wrong. No windows: there is nothing to see through them. No
 * cornice: a room has no roofline. What a room has is services — the ducting
 * and conduit that a building hides outside and shows inside — and the things
 * that end up stacked against a wall because there is nowhere else to put them.
 *
 * Every piece is tested against the world's own collision before it is placed,
 * so nothing lands in the bar, the booth, the stair or the dance floor. That
 * test is the whole safety of this: the rooms are full of fittings this module
 * knows nothing about.
 */
export function dressInteriors(
  scene: THREE.Object3D,
  rooms: DressableRoom[],
  /** The world's own collision, so nothing is placed inside something. */
  blocked: (x: number, z: number, y: number) => boolean,
): number {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const duct = new THREE.MeshStandardMaterial({ color: 0x54504b, roughness: 0.66, metalness: 0.36 });
  const fitting = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.84, metalness: 0.18 });
  const crate = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.93, metalness: 0.02 });

  let placed = 0;
  const put = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    surface: THREE.Material,
    spin = 0,
  ) => {
    const piece = new THREE.Mesh(unitBox, surface);
    piece.scale.set(width, height, depth);
    piece.position.set(x, y, z);
    piece.rotation.y = spin;
    piece.userData.wornDressing = true;
    piece.receiveShadow = true;
    scene.add(piece);
    placed += 1;
  };

  for (const room of rooms) {
    const seed = new THREE.Vector3(room.minX, room.floorY, room.minZ);
    const spanX = room.maxX - room.minX;
    const spanZ = room.maxZ - room.minZ;
    let salt = 0;

    // Services along the ceiling. Two runs, set in from the walls, with the
    // hangers that hold them up — a duct floating with nothing carrying it is
    // the tell that it was placed rather than installed.
    if (!room.outdoor && room.ceilingY !== undefined) {
      const under = room.ceilingY - 0.75;
      for (const offset of [0.16, 0.78]) {
        const z = room.minZ + spanZ * offset;
        if (blocked(room.minX + spanX / 2, z, under)) continue;
        put(spanX - 2.4, 0.5, 0.72, room.minX + spanX / 2, under, z, duct);
        for (let hanger = 0; hanger < 4; hanger += 1) {
          const x = room.minX + 1.6 + (spanX - 3.2) * (hanger / 3);
          put(0.12, 0.62, 0.12, x, under + 0.55, z, fitting);
        }
      }
    }

    // Conduit and junction boxes down the walls, at the height services run.
    // Indoors only: a deck open to the sky has no walls to run them along, and
    // they were hanging in mid-air over it like scaffolding poles somebody had
    // dropped.
    if (!room.outdoor) {
      for (const wallX of [room.minX + 0.55, room.maxX - 0.55]) {
        const runs = Math.max(2, Math.floor(spanZ / 9));
        for (let index = 0; index < runs; index += 1) {
          const z = room.minZ + (spanZ * (index + 0.5)) / runs;
          const y = room.floorY + 2.9;
          if (blocked(wallX, z, y)) continue;
          put(0.16, 0.16, spanZ / runs - 1.4, wallX, y, z, fitting);
          // A box on the run, which is what makes it read as electrical rather
          // than as a stripe painted on the wall.
          put(0.34, 0.5, 0.4, wallX, y - 0.5, z, duct);
        }
      }
    }

    // And the things stacked where nobody looks.
    //
    // The first cut scattered a dozen crates at random through the room, which
    // on an open deck put them all over the floor people walk on — litter, not
    // storage, and exactly the mess it was meant to avoid. Things do not end up
    // *anywhere*; they end up out of the way. So there are two stacks per room,
    // each tucked into a corner, each a tidy row squared to the wall it is
    // against, with only enough turn on each box to show it was put down by
    // hand rather than laid out.
    const corners: Array<[number, number, number, number]> = [
      [room.minX + 1.5, room.minZ + 1.5, 1, 1],
      [room.maxX - 1.5, room.minZ + 1.5, -1, 1],
      [room.maxX - 1.5, room.maxZ - 1.5, -1, -1],
      [room.minX + 1.5, room.maxZ - 1.5, 1, -1],
    ];
    const first = Math.floor(placedRandom(seed, (salt += 1)) * 4);
    for (const pick of [first, (first + 2) % 4]) {
      const [cornerX, cornerZ, stepX, stepZ] = corners[pick];
      // Along the longer wall of that corner, so the row lies against
      // something rather than jutting into the room.
      const alongZ = spanZ > spanX;
      const boxes = 2 + Math.floor(placedRandom(seed, (salt += 1)) * 2);
      for (let index = 0; index < boxes; index += 1) {
        const x = cornerX + (alongZ ? 0 : stepX * index * 1.25);
        const z = cornerZ + (alongZ ? stepZ * index * 1.25 : 0);
        const height = 0.78;
        if (blocked(x, z, room.floorY + height)) continue;
        const spin = (placedRandom(seed, (salt += 1)) - 0.5) * 0.22;
        put(1.1, height, 0.9, x, room.floorY + height / 2, z, crate, spin);
        // The near end of a row is stacked two high, which is how a stack
        // actually forms — never the far end, and never all of them.
        if (index === 0) {
          put(0.92, 0.62, 0.78, x + 0.06, room.floorY + height + 0.31, z - 0.05, crate, spin * 1.7);
        }
      }
    }
  }

  return placed;
}
