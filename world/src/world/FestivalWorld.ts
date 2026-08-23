import * as THREE from 'three';
import { applyWornStyle, setWornStyle, wornStyleSettings, wornMeshesRequested, taperedPrism } from './WornStyle';
import { dressBuildings } from './WornArchitecture';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import type { VenueKey } from '../data/catalogue';
import { AmbientAudio } from './AmbientAudio';
import { DayNightCycle, type DayNightState } from './DayNightCycle';
import { createStylizedWaterMaterial, tintStylizedWater } from './StylizedWater';
import { createMentorDog, type MentorDogRig } from './MentorDog';

export type GraphicsMode = 'normal' | 'lite';
export type CameraMode = 'follow' | 'perspective' | 'first-person' | 'screening';
export type PlayerState = 'walking' | 'seated' | 'swimming';
export type AvatarGesture = 'wave' | 'feed' | 'tail-wag' | 'dance' | 'drink' | 'jump' | 'stumble' | 'offer' | 'bow' | 'punch' | 'hit';
export type CarriedItem = 'POPCORN' | 'MENTOR' | 'DRINK' | 'HOTDOG' | 'PIZZA' | 'CHICKEN';
export const NPC_NAMES = ['MENTOR', 'KENNY', 'NUNO', 'MICHAEL', 'SEBINE', 'ZC', 'LOUI', 'MINYUN', 'VIOLA', 'XIEHGAN', 'DRBEAUTY', 'YO'] as const;
export type NpcId = string;
export type NpcNames = Record<NpcId, string>;
export interface NpcProfile {
  id: NpcId;
  name: string;
  title: string;
}
export interface MentorFollowerTarget {
  kind: 'visitor' | 'npc';
  id: string;
}
export const DEFAULT_NPC_NAMES: NpcNames = Object.fromEntries(NPC_NAMES.map((name) => [name, name]));
export const NPC_TITLES: Record<NpcId, string> = {
  MENTOR: 'Video Editor',
  KENNY: 'Director',
  NUNO: 'Sound Engineer',
  MICHAEL: 'Director',
  SEBINE: 'Director',
  ZC: 'Director',
  LOUI: 'Director',
  MINYUN: 'Director Manager',
  VIOLA: 'Project Manager',
  XIEHGAN: 'Resident DJ',
  DRBEAUTY: 'Rooftop DJ',
  YO: 'Festival Videographer',
};
export const DEFAULT_NPC_PROFILES: NpcProfile[] = NPC_NAMES.map((id) => ({
  id,
  name: DEFAULT_NPC_NAMES[id],
  title: NPC_TITLES[id],
}));
export type WorldAction =
  | { type: 'seated'; seatId: string; venue: VenueKey }
  | { type: 'seatUnavailable'; seatId: string }
  | { type: 'stood' }
  | { type: 'food'; item: CarriedItem }
  | { type: 'shop' }
  | { type: 'pamphlet' }
  | { type: 'swim'; active: boolean; stowedPopcorn?: boolean }
  | { type: 'greet'; target: string; gesture: 'wave' | 'tail-wag' }
  | { type: 'treat'; target: string }
  | { type: 'mentor'; active: boolean; discardedPopcorn?: boolean }
  | { type: 'programme' }
  | { type: 'dj'; name: string; venue: 'club' | 'rooftop' }
  | { type: 'dance'; active: boolean }
  | { type: 'drinkOrdered' }
  | { type: 'ate' }
  | { type: 'drank'; drinks: number; drunk: boolean }
  | { type: 'donate'; target?: string; deity?: string }
  | { type: 'punch'; struck?: string; targetId?: string }
  | { type: 'punched'; droppedMentor: boolean; by?: string }
  | { type: 'died'; by?: string }
  | { type: 'jukebox' }
  | { type: 'jump' };

export interface AvatarPalette {
  skin: string;
  hair: string;
  top: string;
  bottoms: string;
  swimwear: string;
}

export interface WorldSnapshot {
  cameraMode: CameraMode;
  location: string;
  dayNight: DayNightState;
  playerState: PlayerState;
  inTheater: boolean;
  screeningVenue: VenueKey;
  outfit: 'festival' | 'swimwear';
  carriedItem?: CarriedItem;
  stowedItem?: 'POPCORN';
  hasPamphlet: boolean;
  npcCount: number;
  interaction?: string;
  canInteract: boolean;
  x: number;
  /** Height matters: the deck is seven up and the basement sixteen down. */
  y: number;
  z: number;
  rotation: number;
  moving: boolean;
  running: boolean;
  gesture?: AvatarGesture;
}

export interface RemoteVisitorVisual {
  id: string;
  name: string;
  originalName: string;
  palette: AvatarPalette;
  x: number;
  y?: number;
  z: number;
  rotation: number;
  state: PlayerState;
  moving: boolean;
  running?: boolean;
  gesture?: AvatarGesture;
  carriedItem?: CarriedItem;
  npcId?: string;
  impersonationOrigin?: {
    x: number;
    y?: number;
    z: number;
    rotation: number;
    moving?: boolean;
    state: PlayerState;
  };
}

interface Seat {
  id: string;
  venue: VenueKey;
  position: THREE.Vector3;
  /** A bar stool faces the counter and keeps the ordinary camera. */
  kind?: 'screening' | 'bar' | 'bench';
  facing?: number;
}

interface ProjectorSurface {
  element: HTMLDivElement;
  object: CSS3DObject;
  iframe?: HTMLIFrameElement;
  filmId?: string;
  youtubeId?: string;
  signature?: string;
  muted: boolean;
  /** Stopped by STAFF, and so not to be woken by any of the nudges. */
  paused?: boolean;
  /**
   * The last screening the festival asked this venue to run, kept even while
   * nobody is in the room, so walking in can start it straight away instead of
   * waiting for the programme to be pushed round again.
   */
  pending?: { film: { id: string; title: string; embedUrl: string; youtubeId: string }; offsetSeconds: number; reloadToken: string };
  lastAdvanceAt?: number;
  currentTime?: number;
  currentTimeAt?: number;
  duration?: number;
  playing?: boolean;
}

/**
 * Where a venue's programme had got to when its player was last torn down, and
 * when that was. A screening is not restarted from the top just because the
 * attendee walked out of the room and back in.
 */
interface Playhead {
  youtubeId: string;
  seconds: number;
  at: number;
  duration?: number;
}

interface NpcAvatar {
  id: NpcId;
  name: string;
  group: THREE.Group;
  badge: THREE.Sprite;
  rig?: AvatarRig;
  dogRig?: MentorDogRig;
  dogBoard?: THREE.Group;
  remoteCarriedProp: THREE.Group;
  route: THREE.Vector3[];
  waypointIndex: number;
  speed: number;
  waitUntil: number;
  gestureUntil: number;
  gesture?: AvatarGesture;
  eatUntil: number;
  phase: number;
  stuckFor: number;
  /** Carried off the route by a punch, and spent over the next moment. */
  knockback: THREE.Vector3;
  /** In the mood to dance at this stop of the round. Decided on arrival. */
  dances?: boolean;
  /** Set for NPCs that hold a post rather than walking a route. */
  station?: { position: THREE.Vector3; rotationY: number };
  /** When it last stepped aside for somebody, so a review can see it happen. */
  gaveWayAt?: number;
  /** Whether that somebody was another visitor rather than this client. */
  gaveWayToRemote?: boolean;
  /** How far right of its direction of travel it walks, in world units. */
  laneOffset: number;
  /** This resident's own circuit of venues, walked round and round for ever. */
  tour: string[];
  tourIndex: number;
  /** The nodes still to walk through to reach the venue it is bound for. */
  transit: THREE.Vector3[];
  /** The network node it is standing on, or heading for. */
  atNode?: string;
  /**
   * Shoved into the scenery by a punch and walking back out of it. Nothing
   * else sets this: the network itself is verified clear, so a resident that
   * follows it never needs rescuing.
   */
  recovering?: boolean;
  pose?: 'dj' | 'dance';
  /** Where this NPC is spending its time, and until when. */
  haunt?: string;
  dwellUntil?: number;
  /**
   * This resident's own lane. Every route in the festival is a shared list of
   * points, so without an offset of their own every resident visiting a place
   * walked the identical line through the identical spots and piled into
   * whoever was already walking it. Fixed per resident so the lane is theirs
   * and no two are ever the same.
   */
  lane: THREE.Vector2;
}

interface RemoteAvatar {
  group: THREE.Group;
  badge: THREE.Sprite;
  target: THREE.Vector3;
  /** Where this body was told to be before the update now being played out. */
  previousTarget: THREE.Vector3;
  /** When that update landed, and how long the one before it took to arrive. */
  targetAt: number;
  updateInterval: number;
  targetRotation: number;
  previousRotation: number;
  state: PlayerState;
  rig: AvatarRig;
  carriedProp: THREE.Group;
  carriedItem?: CarriedItem;
  moving: boolean;
  running: boolean;
  gestureUntil: number;
  gesture?: AvatarGesture;
  animationPhase: number;
  name: string;
}

interface AvatarRig {
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  /**
   * What the poses bend when they bend "the torso".
   *
   * On the original figure this is the torso mesh itself, and rotating it turns
   * a slab. On the restyled figure it is the spine — a pivot at the waist that
   * the chest, shoulders, arms and head all hang from — so the same line of
   * pose code that used to twist one box now leans the entire upper body over
   * the hips, and every gesture already written gets a spine for free.
   */
  torso: THREE.Object3D;
  treat: THREE.Mesh;
  /** Head, face and hair together, so a bow takes the whole of it. */
  head: THREE.Group;
  /** Under the feet, and only out while running. */
  board: THREE.Group;
  /**
   * The second joint down each limb, on the restyled figure only.
   *
   * These are bones in every sense that matters here. A three.js Skeleton
   * exists to *deform* one continuous mesh, and these limbs are rigid segments
   * — so a hierarchy of pivots is not an approximation of a rig, it is the
   * correct one, minus skinning weights that would have nothing to weight.
   * What the old figure actually lacked was not bones but joints: a whole arm
   * that swung as one piece could only ever pendulum. With an elbow and a knee
   * in the chain the same walk gets a forearm that trails and a heel that
   * lifts, and gestures can bend where a body bends.
   *
   * Absent on the original figure, so everything that drives them checks first.
   */
  leftElbow?: THREE.Group;
  rightElbow?: THREE.Group;
  leftKnee?: THREE.Group;
  rightKnee?: THREE.Group;
}

interface WaterReflectionVisual {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  material: THREE.MeshBasicMaterial;
  kind: 'sun' | 'moon';
}

interface FireworkRocket {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  velocity: number;
  targetY: number;
  colour: THREE.Color;
}

interface FireworkBurst {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  velocities: Float32Array;
  reflection: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  origin: THREE.Vector3;
  age: number;
  lifetime: number;
  peakIntensity: number;
  currentIntensity: number;
}

interface Collider {
  label?: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Omitted for ordinary scenery, which blocks at every height. */
  minY?: number;
  maxY?: number;
  /**
   * How high the thing stands, where that differs from the band it is refused
   * in. Those bands answer which storey a collider belongs to, not how tall it
   * is, and the camera needs the second question: a waist-high DJ desk given
   * the club room's whole height so that nobody on the street above walks into
   * it read as floor-to-ceiling, and threw the view straight into the booth.
   */
  viewTop?: number;
}

interface WorldOptions {
  canvas: HTMLCanvasElement;
  foregroundCanvas: HTMLCanvasElement;
  cssLayer: HTMLElement;
  graphicsMode: GraphicsMode;
  palette: AvatarPalette;
  onSnapshot: (snapshot: WorldSnapshot) => void;
  onAction: (action: WorldAction) => void;
  onProjectorAdvance?: (venue: VenueKey, youtubeId: string) => void;
  /** How long the work on a venue's screen runs, as the player reports it. */
  onProjectorDuration?: (venue: VenueKey, youtubeId: string, seconds: number) => void;
}

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
// Keep the two service stands together on the inner half of the main road.
// Their padded colliders retain a narrow walking gap, while the outer edge of
// the popcorn booth no longer crowds the road boundary.
// Both stalls moved across to the western half of the roadway, keeping the
// spacing and the inset from the kerb they had on the eastern one. They stay on
// the asphalt: the road runs from z = 2 to the gate, so at z = 8 they are on it
// and clear of the red carpet either side. Their fronts face +z, towards the
// gate, which is the way arrivals come — mirroring them in x alone leaves that
// facing correct, so nothing here needs turning.
/**
 * Where the timetable stands. Three separate places used to carry its position
 * as a literal, so moving the board left the radius you can read it from behind
 * on the old spot — the board in one place and the prompt to open it in
 * another. They all read this now.
 */
const programmeBoardPosition = new THREE.Vector3(0, 0, 1);
const programmeBoardSize = { width: 12.5, height: 6.1, depth: 0.45 } as const;
const programmeBoardCenterY = 3.6;
// Level with the first lamp up the road at z = 16, and pulled in off the kerb.
// The stalls carry colliders wider than the stalls themselves — the popcorn
// booth's is 3.4 across — so sitting at x = -7.8 its western edge reached -9.5
// while the roadway stops at -8.5, and the thing everybody could see was a
// stall standing in the red. Both now sit wholly on the asphalt.
const concessionPosition = new THREE.Vector3(-6.6, 0, 16);
const pamphletPosition = new THREE.Vector3(-3, 0, 16);
// Where the sea meets the sand. Every water plane ends here and every piece of
// beach starts here: overlapping the two put opaque sand and a water surface at
// the same height, and they fought for the same pixels along the whole shore.
const SHORE_Z = -58;
const AVATAR_GROUND_Y = 0.28;
// A leap of about 2.4 units — waist height on a 3.46-unit body, near enough to
// 1.2m. Nearly nine tenths of a second in the air, which at a run carries the
// best part of eleven units forward: enough to clear a gap rather than only an
// obstacle.
const JUMP_SPEED = 11.2;
const GRAVITY = 26;
// Landing harder than this staggers the body. A jump from flat ground arrives
// at exactly its launch speed, so the threshold sits above it: only a drop of
// roughly four units beyond the jump's own arc stumbles, which leaves hopping
// off a bench clean and coming off the roof anything but.
const STUMBLE_IMPACT = 14;
// How far the ground has to fall away underfoot before it counts as stepping
// off an edge rather than walking down a step. A rooftop tread is 0.35, so this
// clears a staircase without turning it into a series of little hops.
const LEDGE_DROP = 0.75;
// How far a rider stands above the road: the exact height of this board from
// the road to the top of its deck — wheel bottom at -0.46 under the hips, deck
// top at -0.09, so 0.37. Anything less and the board cannot fit between the
// soles and the ground: either the soles come through the deck or the wheels
// go under the road.
const SKATE_LIFT = 0.37;
const CAMERA_ZOOM_KEY = 'myschedule-camera-zoom-v1';
/** Below this the frame is narrower than it is tall and the fov is widened. */
const PORTRAIT_ASPECT = 1.35;
/**
 * How far outside a theatre's walls its player starts loading, in world units.
 * About three strides — enough of a run-up to cover the fetch and the buffer,
 * short enough that walking past a door does not start a film.
 */
const PROJECTOR_WARM_MARGIN = 6;
/**
 * How far away a resident stops being posed on a phone. Roughly the width of
 * the square: past it a body is a few pixels tall and its limbs cannot be made
 * out, so the pose is work nobody sees.
 */
const NPC_ANIMATION_RANGE_SQ = 38 * 38;
/**
 * How far off a shared route a resident walks their own line. Ten places are
 * shared between twelve residents, so the pairs that actually walk the same
 * route are the ones ten apart in the round — and those sit 2.8 apart at this
 * radius, twice the 1.35 two bodies are held at. Residents crossing between
 * different places are still the separation pass's job; lanes only make sure
 * nobody is asked to walk a line somebody else is already walking.
 */
const NPC_LANE_RADIUS = 2.6;
const CAMERA_ZOOM_MIN = 0.45;
const CAMERA_ZOOM_MAX = 2.2;
/** How far back the camera sat last visit, if the browser still remembers. */
const readStoredZoom = (): number => {
  try {
    const saved = Number(window.localStorage.getItem(CAMERA_ZOOM_KEY));
    if (!Number.isFinite(saved) || saved <= 0) return 1;
    return Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, saved));
  } catch {
    // Private browsing refuses storage; the default distance is no loss.
    return 1;
  }
};
const AVATAR_SWIM_Y = -2.08;
// The underside of the avatar's torso, measured from its group origin. Put the
// origin this far below a seat pad and the avatar rests on it.
const AVATAR_SEAT_DROP = 1.09;
/** The one tilt the camera holds while swimming. Turning is still free. */
const SWIM_CAMERA_PITCH = 0.2;

const clubLightColors = [0xff2f6d, 0x38e0ff, 0xffd23f, 0x8c4bff, 0x2fff9e, 0xff6a1f];
// The street elevation is kept to the house colours: pink and orange.
const clubFacadeColors = [0xff2f6d, 0xff7a1f];
// How far north the club sits, keeping it clear of the red carpet and road.
const EDIBLE_ITEMS: CarriedItem[] = ['POPCORN', 'DRINK', 'HOTDOG', 'PIZZA', 'CHICKEN'];
const DRUNK_DURATION_MS = 45_000;
/**
 * How long the struck gestures run for.
 *
 * These exist because animateRig is handed the walking phase — the world clock
 * times a cadence — and a gesture cannot be posed from that. It has no idea
 * when the gesture began, so anything written as sin(clamp(phase * k, 0, PI))
 * saturated at PI within the first second the world was open and evaluated to
 * zero for ever after. The punch's entire throwing action was that expression,
 * so the arm never moved: all anybody ever saw was the static guard hand left
 * hanging out in front, which reads as an offer to shake rather than a punch.
 * The recoil from taking one was the same.
 *
 * Knowing the span, a rig can work out how far through it is from gestureUntil
 * alone, which every caller already has.
 */
const GESTURE_SPAN_MS: Partial<Record<AvatarGesture, number>> = {
  punch: 560,
  hit: 620,
  // MENTOR's bow is posed from how far through the gesture it is, and a gesture
  // with no span here reports zero for ever — so the dog's play-bow had a depth
  // of nothing and O looked like it did not work at all. These are the lengths
  // donate() actually sets.
  offer: 1_500,
  bow: 1_500,
};
/** How far into the swing the fist arrives. */
const PUNCH_CONTACT_MS = 200;
// The rooftop venue, east across the street from The Basement. The deck sits
// over the eastern part of the shell; the western bay is the open garage, so
// no column has to carry two walkable floors.
const ROOF_Y = 7;
const ROOF_AVATAR_Y = ROOF_Y + AVATAR_GROUND_Y;
// The temple stands where a featureless block used to, on ground the map
// already had but nobody was allowed to walk on. Approached from the west,
// up three steps onto a raised podium.
const TEMPLE = {
  minX: 76,
  maxX: 106,
  minZ: -14,
  maxZ: 22,
  podium: 1.2,
  stepMinX: 71.4,
  wallThickness: 0.9,
  doorHalfWidth: 3.6,
};
const TEMPLE_FLOOR_Y = TEMPLE.podium + AVATAR_GROUND_Y;
const rooftopBounds = {
  // Pulled four units east off the road. The stair runs down the outside of the
  // west face and its kerb reached x = 13.3, while the red carpet's edge is at
  // 14 — so the bottom flight stood in the red. The stair cannot move on its
  // own without walking into the wall it hangs off, so the whole shell moved
  // and took the stair, the deck, the garage and the shop with it.
  minX: 22,
  maxX: 58,
  minZ: 8,
  maxZ: 44,
  // The southern strip is the open garage, facing the Drive-In.
  bayMaxZ: 19,
  deckMinZ: 19,
  // The stair climbs north along the road-facing west face, outside the shell.
  // An avatar is 3.46 units head to heel for a person of about 1.75m, so one
  // metre is close to two units. The run is sized in those terms: a 0.35 rise
  // on a 0.56 going is a 175/280mm step, and 2R + G lands on 1.26 units — the
  // proportion a stair is actually comfortable at. Twenty risers carry the
  // 7-unit climb, split into two flights of ten with a landing between them,
  // because no flight should run more than about sixteen risers unbroken.
  stairMinX: 17.8,
  stairMaxX: 21.4,
  stairMinZ: 20,
  // Head of the lower flight, then the half-landing, then the upper flight.
  stairLandingMinZ: 25.04,
  stairLandingMaxZ: 28.64,
  stairTopZ: 33.68,
  // The top landing is flush with the deck and doubles as the way through the
  // parapet, so arriving at deck height is a step across, not a climb over.
  stairMaxZ: 36.5,
};

/**
 * The middle of the roof deck. Four places used to write this as the literal
 * 36 — the deck's screen, that screen's camera target, the fast-travel arrival
 * and the resident DJ's post — so moving the building would have left the
 * screen, the view of it and the DJ standing where the building used to be.
 */
const ROOFTOP_CENTER_X = (rooftopBounds.minX + rooftopBounds.maxX) / 2;
/** Second line on each venue's sign until STAFF change it. */
const DEFAULT_VENUE_SUBTITLES: Record<VenueKey, string> = {
  palace: 'COMMERCIAL',
  'drive-in': 'TELEVISION',
  shore: 'MUSIC VIDEO',
  club: 'XIEH GAN',
  rooftop: 'DR.BEAUTY',
};
const ROOF_RISER = 0.35;
const ROOF_GOING = 0.56;
// Where the crowd spends its time. Each haunt carries a small loop so an NPC
// wanders while it is there rather than standing on one spot. The club is not
// in this list: it is underground and NPCs cannot use the stairs.
const NPC_HAUNTS: Record<string, Array<[number, number]>> = {
  gate: [[-9, 52], [9, 52], [9, 44], [-9, 44]],
  square: [[-9, 8], [9, 8], [9, -4], [-9, -4]],
  promenade: [[-10, 30], [10, 30], [10, 18], [-10, 18]],
  palace: [[-42, -22], [-28, -22], [-28, -30], [-42, -30]],
  driveIn: [[29, -13], [41, -13], [41, -18], [29, -18]],
  shore: [[-8, -26], [8, -26], [8, -31], [-8, -31]],
  clubFront: [[-14, 29], [-7, 29], [-7, 19], [-14, 19]],
  // The three rooms the residents never actually went into. Written out rather
  // than derived, because CLUB_Z, rooftopBounds and TEMPLE are all declared
  // below this: the club room is x -88..-50 by z 1..42, the roof deck is
  // x 18..54 by z 19..44, and the temple hall is x 76..106 by z -14..22.
  clubFloor: [[-78, 14], [-58, 14], [-58, 30], [-78, 30]],
  rooftopDeck: [[31, 28], [45, 28], [45, 36], [31, 36]],
  temple: [[82, -6], [94, -6], [94, 14], [82, 14]],
};
/**
 * The walkable network of the festival.
 *
 * Residents cross the world on foot now, so every journey has to be expressible
 * as a run of straight lines that a body can actually walk — through the club's
 * doorway, down its stair, up the outside of the garage — rather than a jump
 * from room to room. These are the corners those lines turn at.
 *
 * Nothing here is eyeballed. `?review=nav` samples every link end to end
 * against the same collision the residents answer to, and names any link a body
 * could not walk; the numbers below are what came back clean.
 */
const NAV_POINTS: Record<string, [number, number]> = {
  gate: [2, 47],
  promenade: [2, 24],
  // East of the timetable board, which stands across the middle of the square
  // and which the old spine walked straight into.
  square: [9, 6],
  southJunction: [9, -12],
  shore: [0, -31],
  palace: [-35, -26],
  // The Drive-In is entered from its north side; coming at it across the
  // diagonal walks into the back of the cars.
  driveInApproach: [35, -12],
  driveIn: [35, -16],
  // West, into The Basement: across the forecourt, in at the door, then down
  // the stair slot on its centre line.
  clubFront: [-11, 24],
  clubDoor: [-19, 23.5],
  clubStairTop: [-26, 23.5],
  clubStairFoot: [-52, 23.5],
  clubFloor: [-68, 22],
  // East, up the outside of The Rooftop. The flight runs north up the west
  // face, so its foot and head share a centre line.
  // The flight is approached along its own centre line from the south. From
  // the west a body walks into the kerb the handrail stands on.
  roofStairApproach: [19.6, 16],
  roofStairFoot: [19.6, 21],
  roofStairTop: [19.6, 35],
  roofDeck: [36, 30],
  // The long walk east to the temple, south of the garage's plot.
  // Out past the square's east kerb before turning for the temple: straight
  // from the square the line clips the furniture at its edge.
  templeSpur: [20, 0],
  templeApproach: [40, 4],
  templeFoot: [73, 4],
  templeHall: [88, 4],
};
const NAV_LINKS: Array<[string, string]> = [
  ['gate', 'promenade'],
  ['promenade', 'square'],
  ['square', 'southJunction'],
  ['southJunction', 'shore'],
  ['southJunction', 'palace'],
  ['southJunction', 'driveInApproach'],
  ['driveInApproach', 'driveIn'],
  ['promenade', 'clubFront'],
  ['clubFront', 'clubDoor'],
  ['clubDoor', 'clubStairTop'],
  ['clubStairTop', 'clubStairFoot'],
  ['clubStairFoot', 'clubFloor'],
  ['promenade', 'roofStairApproach'],
  ['roofStairApproach', 'roofStairFoot'],
  ['roofStairFoot', 'roofStairTop'],
  ['roofStairTop', 'roofDeck'],
  ['square', 'templeSpur'],
  ['templeSpur', 'templeApproach'],
  ['templeApproach', 'templeFoot'],
  ['templeFoot', 'templeHall'],
];
const NAV_ADJACENCY: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const [from, to] of NAV_LINKS) {
    (map[from] ??= []).push(to);
    (map[to] ??= []).push(from);
  }
  return map;
})();

/**
 * The shortest run of links from one node to another, as the nodes to walk
 * through — the node underfoot is not among them. An empty answer means the
 * two are not connected at all, which is a fault in the network rather than
 * something a resident should try to improvise around.
 */
function navPath(from: string, to: string): string[] {
  if (from === to) return [];
  const cameFrom: Record<string, string | undefined> = { [from]: undefined };
  const queue: string[] = [from];
  while (queue.length > 0) {
    const at = queue.shift() as string;
    for (const next of NAV_ADJACENCY[at] ?? []) {
      if (next in cameFrom) continue;
      cameFrom[next] = at;
      if (next === to) {
        const path: string[] = [];
        let step: string | undefined = to;
        while (step !== undefined && step !== from) {
          path.unshift(step);
          step = cameFrom[step];
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

/**
 * One resident's own circuit, and it runs for ever: on reaching the end of the
 * list it starts the list again, so nobody finishes touring and stops.
 *
 * Everybody walking the same ring in the same order turned the festival into a
 * procession — one line of people arriving everywhere together and shouldering
 * through each other at every corner. Taking a different stride through the
 * ring gives each resident a different order of venues instead. The strides are
 * the numbers coprime with the ring's length, which is what guarantees a stride
 * visits every venue rather than looping early round a few of them.
 */
const TOUR_STRIDES = [1, 3, 7, 9];
function tourFor(index: number): string[] {
  const stride = TOUR_STRIDES[index % TOUR_STRIDES.length];
  const start = index % NPC_TOUR.length;
  return NPC_TOUR.map((_, step) => NPC_TOUR[(start + step * stride) % NPC_TOUR.length]);
}

/** The node a resident stands on when it arrives at each haunt. */
const HAUNT_NODE: Record<string, string> = {
  gate: 'gate',
  promenade: 'promenade',
  square: 'square',
  shore: 'shore',
  palace: 'palace',
  driveIn: 'driveIn',
  clubFront: 'clubFront',
  clubFloor: 'clubFloor',
  rooftopDeck: 'roofDeck',
  temple: 'templeHall',
};

/**
 * The floor each haunt stands on. Everything outdoors is at street level; the
 * club is sixteen down and the deck seven up, and a resident sent there has to
 * arrive at that height or the ground under them is read as the street.
 */
const NPC_HAUNT_FLOOR: Record<string, number> = {
  clubFloor: -16.5 + AVATAR_GROUND_Y,
  rooftopDeck: 7 + AVATAR_GROUND_Y,
  temple: 1.2 + AVATAR_GROUND_Y,
};
/** Rooms worth stopping to dance in. */
const NPC_DANCE_HAUNTS = new Set(['clubFloor', 'rooftopDeck']);
/**
 * The order a resident works round the festival. They used to jump to a haunt
 * at random, which from any one spot looked like standing still and then
 * vanishing; a fixed round with a different starting point each reads as a
 * crowd circulating, and means every venue has somebody in it.
 */
const NPC_TOUR = ['gate', 'promenade', 'clubFront', 'clubFloor', 'square', 'temple', 'shore', 'palace', 'driveIn', 'rooftopDeck'];
/**
 * How long the dog stays where a visitor put it down before it picks its own
 * round back up. Long enough that setting it down somewhere means something,
 * short enough that it is not abandoned there.
 */
const MENTOR_LINGER_MS = 90_000;
const NPC_DWELL_MIN_MS = 35_000;
const NPC_DWELL_SPREAD_MS = 55_000;
const CLUB_Z = 15;
// The gate sits north of the club, so attendees pass it on the way in.
const GATE_Z = 62;
const CLUB_FLOOR_Y = -16.5;
const CLUB_ROOM_HEIGHT = 15;
const CLUB_AVATAR_Y = CLUB_FLOOR_Y + AVATAR_GROUND_Y;
/** How far the bar stands off the room's south wall, so a stool has room behind it. */
const CLUB_BAR_STANDOFF = 4.4;
// The club occupies a lot north-west of MY SQUARE, on ground the walkable area
// did not previously reach. Attendees come through a door on the east face
// into a ground-floor lobby, then down a stair run into the basement room.
const clubBounds = {
  buildingMinX: -90,
  buildingMaxX: -20,
  buildingMinZ: -15 + CLUB_Z,
  buildingMaxZ: 27 + CLUB_Z,
  // The ground floor reaches west as far as the room's east wall below it.
  // Past that wall there is no second storey to stand on, so the floor stops
  // where the wall stops and a balustrade takes over from there.
  lobbyMinX: -50,
  lobbyMaxX: -20,
  lobbyMinZ: -15 + CLUB_Z,
  lobbyMaxZ: 27 + CLUB_Z,
  // The run starts inside the lobby, so its first treads show through the
  // opening in the floor instead of hiding behind the west wall.
  stairTopX: -24,
  stairBottomX: -50,
  stairMinZ: 5 + CLUB_Z,
  stairMaxZ: 12 + CLUB_Z,
  roomMinX: -88,
  roomMaxX: -50,
  roomMinZ: -14 + CLUB_Z,
  roomMaxZ: 27 + CLUB_Z,
  // Lined up with the stair run, so the way down is straight ahead on entry.
  doorMinZ: 5.5 + CLUB_Z,
  doorMaxZ: 11.5 + CLUB_Z,
};

const venueScreens: Record<VenueKey, {
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  scale: number;
  /** Which side of the screen an attendee watches from, along z. */
  facing: 1 | -1;
}> = {
  shore: {
    label: 'The Shore',
    position: [0, 6.1, -45.68],
    target: [0, 5.8, -46],
    scale: 0.0095,
    facing: 1,
  },
  palace: {
    label: 'The Palace',
    position: [-35, 5.7, -48.18],
    target: [-35, 5.45, -48.5],
    scale: 0.00845,
    facing: 1,
  },
  'drive-in': {
    label: 'Drive-In 88',
    position: [35, 6.05, -35.68],
    target: [35, 5.75, -36],
    scale: 0.00915,
    facing: 1,
  },
  rooftop: {
    label: 'The Rooftop',
    // Hung at the deck's north edge, watched from the deck to the south.
    position: [ROOFTOP_CENTER_X, ROOF_Y + 6.6, 19.9],
    target: [ROOFTOP_CENTER_X, ROOF_Y + 6.3, 19.6],
    scale: 0.0088,
    facing: 1,
  },
  club: {
    label: 'The Basement',
    // Hung on the room's north wall, watched from the floor to the south.
    position: [-68, CLUB_FLOOR_Y + CLUB_ROOM_HEIGHT / 2, 41.5],
    target: [-68, CLUB_FLOOR_Y + CLUB_ROOM_HEIGHT / 2 - 0.3, 41.9],
    scale: 0.0092,
    facing: -1,
  },
};

const material = (
  color: number,
  roughness = 0.85,
  metalness = 0.05,
): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/**
 * The brand's own display face, and the one hard problem with putting a font on
 * a sign: a canvas draws with whatever font is resolved at that instant, and a
 * face still downloading is a face the sign silently never gets. Every marquee
 * in the world is painted while the world is being built, which is far too
 * early. So each sign registers how to repaint itself, and they are all redrawn
 * once the face has actually arrived.
 */
const signRepaints: Array<() => void> = [];
let brandFontLoaded = false;

const loadBrandFont = (): void => {
  if (brandFontLoaded || typeof document === 'undefined' || !document.fonts) return;
  brandFontLoaded = true;
  document.fonts.load('400 92px "BebasNeueBrand"')
    .then(() => {
      for (const repaint of signRepaints) repaint();
    })
    .catch(() => undefined);
};

const signFont = (size: number, heading: boolean): string => {
  // Bebas has no lowercase and only one weight, so a heading asks for neither.
  if (heading && brandFontLoaded) return `400 ${size}px "BebasNeueBrand", Impact, sans-serif`;
  return heading ? `900 ${size}px sans-serif` : `700 ${size}px sans-serif`;
};

const createTextTexture = (lines: string[], foreground = '#f5efe2', background = '#151517') => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  const paint = () => {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#b51f27';
    context.lineWidth = 18;
    context.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
    context.fillStyle = foreground;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    lines.forEach((line, index) => {
      const heading = index === 0;
      context.font = signFont(heading ? 104 : 48, heading);
      // Bebas is a condensed face and sits taller on the line than the old
      // fallback, so the heading is nudged down to stay centred in its band.
      context.fillText(line, canvas.width / 2, (heading ? 158 : 150) + index * 115);
    });
  };
  paint();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  signRepaints.push(() => {
    paint();
    texture.needsUpdate = true;
  });
  return texture;
};

const createNameTexture = (name: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  const fontSize = Math.max(30, Math.min(54, 430 / Math.max(name.length * 0.58, 1)));
  context.font = `900 ${fontSize}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(0,0,0,.9)';
  context.lineWidth = 14;
  context.strokeText(name, 256, 64);
  context.fillStyle = '#f5efe2';
  context.fillText(name, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const createProgrammeTexture = (
  venue: string,
  title: string,
  details: string,
  nextTitle: string,
) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = '#101012';
  context.fillRect(0, 0, 1024, 512);
  context.strokeStyle = '#b51f27';
  context.lineWidth = 17;
  context.strokeRect(22, 22, 980, 468);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#df3e47';
  context.font = '800 36px sans-serif';
  context.fillText('NOW PLAYING', 512, 78);
  context.fillStyle = '#f5efe2';
  context.font = '900 67px sans-serif';
  context.fillText(venue, 512, 145);
  context.font = '800 43px sans-serif';
  const shortTitle = title.length > 34 ? `${title.slice(0, 33)}…` : title;
  context.fillText(shortTitle, 512, 235);
  context.fillStyle = '#d4cabb';
  context.font = '700 28px sans-serif';
  context.fillText(details, 512, 300);
  context.fillStyle = '#f5efe2';
  context.font = '700 24px sans-serif';
  const shortNext = nextTitle.length > 38 ? `${nextTitle.slice(0, 37)}…` : nextTitle;
  context.fillText(`UP NEXT · ${shortNext}`, 512, 390);
  context.fillStyle = '#df3e47';
  context.fillRect(365, 446, 294, 7);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const createWaterTexture = (light = false) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  const gradient = context.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, light ? '#27758c' : '#0b3142');
  gradient.addColorStop(0.52, light ? '#1a6078' : '#0f4053');
  gradient.addColorStop(1, light ? '#3d8ba0' : '#082936');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  context.globalAlpha = light ? 0.34 : 0.2;
  context.strokeStyle = '#bce7e9';
  for (let y = -20; y < 540; y += 22) {
    context.beginPath();
    for (let x = -10; x <= 522; x += 14) {
      const waveY = y + Math.sin((x + y) * 0.035) * 6 + Math.sin(x * 0.09) * 2;
      if (x < 0) context.moveTo(x, waveY);
      else context.lineTo(x, waveY);
    }
    context.lineWidth = light ? 2.2 : 1.25;
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(light ? 9 : 12, light ? 5 : 7);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const createWaterReflectionTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  const verticalFade = context.createLinearGradient(0, 0, 0, 512);
  verticalFade.addColorStop(0, 'rgba(255,255,255,0)');
  verticalFade.addColorStop(0.18, 'rgba(255,255,255,.18)');
  verticalFade.addColorStop(0.58, 'rgba(255,255,255,.95)');
  verticalFade.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = verticalFade;
  for (let row = 0; row < 36; row += 1) {
    const y = 14 + row * 14;
    const centerOffset = Math.sin(row * 1.73) * 18;
    const width = 18 + (row / 35) * 108 + Math.sin(row * 0.91) * 12;
    context.globalAlpha = 0.2 + ((row * 7) % 9) / 14;
    context.fillRect(128 + centerOffset - width / 2, y, width, 3 + (row % 3));
  }
  context.globalCompositeOperation = 'destination-in';
  context.globalAlpha = 1;
  context.fillStyle = verticalFade;
  context.fillRect(0, 0, 256, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export class FestivalWorld {
  readonly audio = new AmbientAudio();

  private readonly canvas: HTMLCanvasElement;
  private readonly foregroundCanvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly foregroundRenderer: THREE.WebGLRenderer;
  private readonly cssRenderer: CSS3DRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cssScene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 300);
  private readonly dayNight: DayNightCycle;
  private readonly player = new THREE.Group();
  private readonly originalPlayerIdle = new THREE.Group();
  private readonly carriedProp = new THREE.Group();
  private readonly playerShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  private readonly keys = new Set<string>();
  private readonly colliders: Collider[] = [];
  private readonly seats: Seat[] = [];
  private readonly npcs: NpcAvatar[] = [];
  private readonly remoteAvatars = new Map<string, RemoteAvatar>();
  private readonly remoteNpcControls = new Map<string, RemoteVisitorVisual>();
  private readonly occupiedSeats = new Set<string>();
  private readonly projectors = new Map<VenueKey, ProjectorSurface>();
  private mountedProjectorVenue?: VenueKey;
  /** Loopback-only override for the timetable/projector overlap regression. */
  private reviewProjectorVenue?: VenueKey;
  private lastProjectorNudgeAt = 0;
  private canvasSizeObserver?: ResizeObserver;
  private readonly playheads = new Map<VenueKey, Playhead>();
  private readonly clubLights: THREE.Mesh[] = [];
  private readonly clubFloorPanels: THREE.Mesh[] = [];
  private readonly clubBeatLights: THREE.SpotLight[] = [];
  private readonly clubFacadeLights: THREE.Mesh[] = [];
  private readonly clubFacadeGlows: THREE.PointLight[] = [];
  private readonly lampPosts: Array<{ x: number; z: number; height: number; targetX: number; castsShadow: boolean }> = [];
  private readonly lampPool: THREE.SpotLight[] = [];
  private lampPoolAt = 0;
  private clubFloorLight?: THREE.PointLight;
  private clubNeon?: THREE.Mesh;
  private clubBoothGlow?: THREE.Mesh;
  private clubBeat = { bpm: 120, startedAt: 0 };
  private dancing = false;
  /** SHIFT held: the avatar runs, on land and in the water. */
  private running = false;
  private shopSign?: THREE.Mesh;
  private shopCounter?: { x: number; z: number };
  private drinks = 0;
  private carriedPropKind?: CarriedItem;
  private drinkUntil = 0;
  private drunkUntil = 0;
  private drunkPhase = 0;
  private reviewFrameCount = 0;
  private reviewLastDelta = 0;
  private readonly shadowSpotlights: THREE.SpotLight[] = [];
  private readonly onSnapshot: WorldOptions['onSnapshot'];
  private readonly onAction: WorldOptions['onAction'];
  private readonly onProjectorAdvance?: WorldOptions['onProjectorAdvance'];
  private readonly onProjectorDuration?: WorldOptions['onProjectorDuration'];
  private readonly lookTarget = new THREE.Vector3();
  private readonly moveVector = new THREE.Vector3();
  private readonly npcControlTarget = new THREE.Vector3();
  private readonly mentorTargetPosition = new THREE.Vector3();
  private readonly mentorStepPosition = new THREE.Vector3();
  private readonly projectorWorldPosition = new THREE.Vector3();
  private readonly projectorNdc = new THREE.Vector3();
  private readonly projectorCorners = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  private readonly programmeBoardCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
  private readonly cameraDirection = new THREE.Vector3();
  private readonly cameraToProjector = new THREE.Vector3();
  private readonly clock = new THREE.Clock();
  private readonly projectorClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 45.68);
  private readonly projectorCornerView = new THREE.Vector3();
  private readonly programmeBoardViewPosition = new THREE.Vector3();
  private readonly projectorViewPosition = new THREE.Vector3();
  private playerRig?: AvatarRig;
  private originalPlayerIdleRig?: AvatarRig;
  private programmeBoardMaterial?: THREE.MeshBasicMaterial;
  private reviewSuppressedProjectors: VenueKey[] = [];
  private readonly venueSignMaterials = new Map<VenueKey, THREE.MeshBasicMaterial>();
  private readonly waterTextures: THREE.CanvasTexture[] = [];
  private readonly waterReflections: WaterReflectionVisual[] = [];
  private readonly fireworkRockets: FireworkRocket[] = [];
  private readonly fireworkBursts: FireworkBurst[] = [];
  /**
   * One light exists for the lifetime of the world and follows the brightest
   * firework. Adding and removing PointLights changes Three's shader defines,
   * which made the first burst compile a succession of new scene programs and
   * freeze the festival. A fixed light keeps the real illumination without
   * changing the renderer's light count while the celebration is running.
   */
  private readonly fireworkWorldLight = new THREE.PointLight(0xffffff, 0, 82, 1.45);
  private fireworksUntil = 0;
  private nextFireworkAt = 0;
  private stylizedWater?: THREE.Mesh;
  private waterVolume?: THREE.Mesh;
  private waveSurface?: THREE.Mesh;
  private stylizedWaterMaterial?: THREE.ShaderMaterial;
  private readonly cameraOrbit = {
    follow: { yaw: 0, pitch: Math.atan2(3.4, 10) },
    perspective: { yaw: Math.atan2(7.8, 7.2), pitch: Math.atan2(4.85, Math.hypot(7.8, 7.2)) },
  };
  private readonly screeningOrbit = { yaw: 0, pitch: 0 };
  /**
   * How far back the orbit cameras sit, as a multiple of their resting
   * distance. Held between a shoulder-close view and roughly twice the default,
   * which is as far as the world reads before the walls start intruding.
   */
  private cameraZoom = readStoredZoom();
  private templeAura?: THREE.Mesh;
  private templeSignMaterial?: THREE.MeshBasicMaterial;
  private templeSignText = { name: '美麗本人', label: 'THE TEMPLE' };
  private readonly entranceSignMaterials: THREE.MeshBasicMaterial[] = [];
  private entranceSignText = { title: 'MYSCHEDULE', subtitle: 'VIRTUAL FESTIVAL' };
  private templeAltar?: { x: number; z: number };
  private jukebox?: { x: number; z: number };
  private lastDonationAt = 0;
  private lastPunchAt = 0;
  /** A landed blow's moment of contact, and what it is worth on the camera. */
  private punchImpactAt = 0;
  private punchImpactPower = 0;
  private punchImpactNpc?: NpcAvatar;
  // A blow is felt three ways: the view is jolted, the body is thrown, and the
  // legs go for a moment. Shake decays on its own clock so a second punch
  // landing mid-shake adds to it rather than restarting it.
  private cameraShake = 0;
  private cameraShakePhase = 0;
  private readonly knockback = new THREE.Vector3();
  private readonly cameraProbe = new THREE.Vector3();
  /** How far back the view is actually sitting, eased towards where it may. */
  private cameraReach = 0;
  private punchPointerX = 0;
  private punchPointerY = 0;
  private verticalVelocity = 0;
  private airborne = false;
  private skating = false;
  /** While recovering from a heavy landing: slower, and shown staggering. */
  private stumbleUntil = 0;

  private animationFrame = 0;
  private cameraMode: CameraMode = 'follow';
  private graphicsMode: GraphicsMode;
  private palette: AvatarPalette;
  private playerState: PlayerState = 'walking';
  private previousCameraMode: Exclude<CameraMode, 'screening'> = 'follow';
  private outfit: 'festival' | 'swimwear' = 'festival';
  private carriedItem?: CarriedItem;
  private stowedItem?: 'POPCORN';
  private hasPamphlet = false;
  private activeSeat?: Seat;
  private playerGestureUntil = 0;
  private playerGesture?: AvatarGesture;
  private controlledNpcId?: string;
  private mentorCarrierId?: string;
  private mentorFollower?: MentorFollowerTarget;
  /** Keeps the loopback greeting fixture deterministic while a recovered dev
      session finishes publishing its last empty follower state. */
  private mentorGreetingReview = false;
  private selfVisitorId?: string;
  private mentorClaimPending = false;
  private mentorReleasePending = false;
  private pickupUntil = 0;
  private lastSnapshotAt = 0;
  private performanceWindowStartedAt = performance.now();
  private performanceFrameCount = 0;
  private adaptiveRenderScale = 1;
  private stickX = 0;
  private stickY = 0;
  private disposed = false;
  /** In a camera mode, where a tap on the frame is aiming rather than fighting. */
  private photographing = false;
  private cameraDragging = false;
  private cameraPointerId?: number;
  private cameraPointerX = 0;
  private cameraPointerY = 0;
  /** Every finger currently down on the world, so a pinch can be recognised. */
  private readonly touchPoints = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  /**
   * A camera's fov is its *vertical* one, so holding it at 58 on a phone held
   * upright leaves barely twenty-eight degrees across — a slot, with the street
   * either side of it out of frame. Recomputed on resize to keep roughly the
   * width the desk view has.
   */
  private baseFov = 58;

  constructor({ canvas, foregroundCanvas, cssLayer, graphicsMode, palette, onSnapshot, onAction, onProjectorAdvance, onProjectorDuration }: WorldOptions) {
    this.canvas = canvas;
    this.foregroundCanvas = foregroundCanvas;
    this.graphicsMode = graphicsMode;
    this.palette = palette;
    this.onSnapshot = onSnapshot;
    this.onAction = onAction;
    this.onProjectorAdvance = onProjectorAdvance;
    this.onProjectorDuration = onProjectorDuration;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: graphicsMode === 'normal',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = graphicsMode === 'normal';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(this.mainPixelRatio());
    this.foregroundRenderer = new THREE.WebGLRenderer({
      canvas: foregroundCanvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.foregroundRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.foregroundRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.foregroundRenderer.toneMappingExposure = 0.92;
    // Matched to the main renderer. This pass redraws the same geometry over
    // the finished picture, so any difference in how it is lit shows as a
    // rectangle the shape of the scissor box: unshadowed, it laid a lit copy of
    // the scene over the shadowed one, which is the pale block over the
    // timetable — a board that stands in shadow.
    this.foregroundRenderer.shadowMap.enabled = graphicsMode === 'normal';
    this.foregroundRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.foregroundRenderer.setClearColor(0x000000, 0);
    this.foregroundRenderer.clippingPlanes = [this.projectorClipPlane];
    this.foregroundRenderer.setPixelRatio(this.foregroundPixelRatio());
    this.cssRenderer = new CSS3DRenderer({ element: cssLayer });
    this.cssRenderer.domElement.classList.add('world-css3d__renderer');

    this.scene.fog = new THREE.Fog(0x111521, 34, graphicsMode === 'normal' ? 150 : 92);
    const requestedCycleMinute = new URLSearchParams(window.location.search).get('cycleMinute');
    const parsedCycleMinute = requestedCycleMinute === null ? undefined : Number(requestedCycleMinute);
    const localTimeOverride = ['127.0.0.1', 'localhost'].includes(window.location.hostname) &&
      parsedCycleMinute !== undefined && Number.isFinite(parsedCycleMinute)
      ? parsedCycleMinute
      : undefined;
    this.dayNight = new DayNightCycle(this.scene, localTimeOverride);
    this.dayNight.setShadowsEnabled(graphicsMode === 'normal');
    this.dayNight.directionalLight.layers.enable(1);
    this.dayNight.hemisphereLight.layers.enable(1);
    this.dayNight.moonLight.layers.enable(1);
    this.dayNight.sunObject.layers.enable(1);
    this.dayNight.moonObject.layers.enable(1);
    this.fireworkWorldLight.castShadow = false;
    this.scene.add(this.fireworkWorldLight);
    this.createEnvironment();
    this.createPlayer(palette);
    this.createNpcCrowd();
    this.createAtmosphere();
    this.scene.traverse((object) => {
      if (object.userData.projectorBackground) object.layers.disable(1);
      else object.layers.enable(1);
    });
    // The sky belongs to the main render only. The pass that redraws geometry
    // over the screens clears the depth buffer inside each screen's rectangle
    // first, so anything of the sky left on its layer is painted over whatever
    // is in that rectangle at full size — which is what the pale block over the
    // timetable was: the moon, a hundred units of sky away, drawn on top of a
    // board four units in front of the attendee. The lights above keep their
    // layer, because layer 1 still has to be lit; it is only the discs and the
    // stars that must not be drawn there.
    this.dayNight.sunObject.layers.disable(1);
    this.dayNight.moonObject.layers.disable(1);
    this.dayNight.sunObject.traverse((object) => object.layers.disable(1));
    this.dayNight.moonObject.traverse((object) => object.layers.disable(1));
    this.player.position.set(0, AVATAR_GROUND_Y, 22);
    this.camera.position.set(0, 5.2, 29);

    window.addEventListener('resize', this.resize);
    // The mask that hides the screens behind whatever stands in front of them is
    // worked out from the camera against the size of the canvas, so the moment
    // the world's idea of that size is wrong the mask lands in the wrong place
    // and eats into the picture. It is wrong exactly once, at the start: the
    // canvas is measured before the browser has laid it out, and a phone then
    // folds its own toolbars away a moment later and changes it again. A window
    // resize does not always follow either of those. Watching the canvas itself
    // does, whatever moved it.
    this.canvasSizeObserver = new ResizeObserver(() => this.resize());
    this.canvasSizeObserver.observe(this.canvas);
    window.visualViewport?.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('message', this.projectorMessage);
    this.canvas.addEventListener('pointerdown', this.cameraPointerDown);
    // passive: false because the page must not scroll under the world, and a
    // trackpad pinch arrives as a wheel event the browser would otherwise use
    // to zoom the whole document.
    this.canvas.addEventListener('wheel', this.cameraWheel, { passive: false });
    // The browser offers its own menu over a canvas — save image, copy image,
    // inspect — and on a trackpad it takes very little for a click to be read
    // as the one that opens it. In a world you are playing, that menu is never
    // what was wanted, and it swallows the punch.
    this.canvas.addEventListener('contextmenu', this.suppressContextMenu);
    window.addEventListener('pointermove', this.cameraPointerMove);
    window.addEventListener('pointerup', this.cameraPointerUp);
    window.addEventListener('pointercancel', this.cameraPointerUp);
    window.addEventListener('blur', this.cameraPointerReset);
    window.addEventListener('blur', this.clearRunning);
    document.addEventListener('visibilitychange', this.resumeProjectorsOnReturn);
    window.addEventListener('pointerup', this.nudgeProjectorsOnGesture, true);
    this.resize();
  }

  start(): void {
    this.clock.start();
    this.render();
  }

  stop(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resize);
    this.canvasSizeObserver?.disconnect();
    window.visualViewport?.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('message', this.projectorMessage);
    this.canvas.removeEventListener('pointerdown', this.cameraPointerDown);
    this.canvas.removeEventListener('wheel', this.cameraWheel);
    this.canvas.removeEventListener('contextmenu', this.suppressContextMenu);
    window.removeEventListener('pointermove', this.cameraPointerMove);
    window.removeEventListener('pointerup', this.cameraPointerUp);
    window.removeEventListener('pointercancel', this.cameraPointerUp);
    window.removeEventListener('blur', this.cameraPointerReset);
    window.removeEventListener('blur', this.clearRunning);
    document.removeEventListener('visibilitychange', this.resumeProjectorsOnReturn);
    window.removeEventListener('pointerup', this.nudgeProjectorsOnGesture, true);
    this.stopFireworks();
    this.renderer.dispose();
    this.foregroundRenderer.dispose();
    for (const projector of this.projectors.values()) projector.element.remove();
  }

  /**
   * A celebration owned by this browser alone. Nothing enters presence or the
   * festival service, so another attendee neither renders nor receives it.
   */
  startFireworks(durationMs = 125_000): void {
    const now = performance.now();
    this.fireworksUntil = now + Math.max(120_000, durationMs);
    this.nextFireworkAt = now;
  }

  stopFireworks(): void {
    this.fireworksUntil = 0;
    this.nextFireworkAt = 0;
    while (this.fireworkRockets.length) this.removeFireworkRocket(this.fireworkRockets.pop()!);
    while (this.fireworkBursts.length) this.removeFireworkBurst(this.fireworkBursts.pop()!);
    this.fireworkWorldLight.intensity = 0;
  }

  /** Local QA summary: exposes counts, never the scene or mutable effect. */
  fireworksReviewSnapshot(): { active: boolean; rockets: number; bursts: number; particles: number; lights: number; reflections: number } {
    return {
      active: this.fireworksUntil > performance.now(),
      rockets: this.fireworkRockets.length,
      bursts: this.fireworkBursts.length,
      particles: this.fireworkBursts.reduce((total, burst) => total + burst.velocities.length / 3, 0),
      lights: this.fireworkWorldLight.intensity > 0.01 ? 1 : 0,
      reflections: this.fireworkBursts.length,
    };
  }

  /** Local review helper used by the in-app visual QA route. */
  focusMentorForReview(carrying = false, carrierNpcId?: string): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const mentor = this.npcs[0];
    if (!mentor) return;
    const carrierNpc = carrierNpcId
      ? this.npcs.find((npc) => npc.id === carrierNpcId && npc !== mentor)
      : undefined;
    if (carrierNpc) {
      carrierNpc.group.position.set(0, AVATAR_GROUND_Y, 14.5);
      carrierNpc.group.rotation.y = Math.PI;
      this.setControlledNpcId(carrierNpc.id);
    }
    mentor.waitUntil = Number.POSITIVE_INFINITY;
    mentor.waypointIndex = 0;
    mentor.group.position.set(0, 0, 14.5);
    mentor.group.rotation.y = Math.PI;
    this.player.position.set(0, AVATAR_GROUND_Y, 14.5);
    this.player.visible = carrying && !carrierNpc;
    this.cameraMode = 'follow';
    this.cameraOrbit.follow.yaw = 0;
    this.cameraOrbit.follow.pitch = 0.4;
    if (carrying) this.pickUpMentor();
  }

  /** Loopback fixture for the autonomous loyalty walk toward this attendee. */
  focusMentorFollowerForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    this.focusMentorForReview(false);
    this.setSharedMentorCarrier(null, 'review-self');
    this.setMentorFollower({ kind: 'visitor', id: 'review-self' });
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    if (!mentor) return;
    const x = this.player.position.x + 13;
    const z = this.player.position.z - 2;
    mentor.group.position.set(x, this.groundHeightAt(x, z), z);
  }

  /**
   * A loyal MENTOR standing at the pamphlet stand. The greeting case had its
   * own fixture; every other fixed place had none, which is why the pamphlet
   * being unreachable had to be reported rather than caught.
   */
  /** Picks the dog up and sets it straight back down, the way a visitor does. */
  dropMentorForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const me = this.selfVisitorId ?? 'review-self';
    this.selfVisitorId = me;
    this.setMentorFollower(null);
    this.player.position.set(NAV_POINTS.square[0], AVATAR_GROUND_Y, NAV_POINTS.square[1]);
    this.pickUpMentor();
    // Told to the service, not just to us. A pick-up announces itself, so a
    // put-down that stays quiet leaves the service still holding this visitor
    // as the carrier — and it hands the dog straight back. What looked like a
    // dog wandering eleven units off was a dog being carried there.
    this.putDownMentor(true);
    this.mentorClaimPending = false;
    this.setSharedMentorCarrier(null, me);
  }

  /** Where the dog was left, and how long it means to stay there. */
  mentorDropReviewSnapshot(): unknown {
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    if (!mentor) return { mentor: 'missing' };
    // World, not local: a carried dog is parented to whoever is carrying it, and
    // its own position field is then a few centimetres from their hands.
    const where = mentor.group.getWorldPosition(new THREE.Vector3());
    return {
      carried: this.carriedItem === 'MENTOR' || Boolean(this.mentorCarrierId),
      parentedTo: mentor.group.parent?.type ?? 'none',
      xz: [Number(where.x.toFixed(2)), Number(where.z.toFixed(2))],
      fromDropPoint: Number(where.distanceTo(this.player.position).toFixed(2)),
      // Infinite while it is walking somewhere, which is not a number worth
      // printing.
      lingerLeft: mentor.transit.length > 0
        ? 'travelling'
        : Math.round((mentor.dwellUntil ?? 0) - performance.now()),
      pacingPoints: mentor.route.length,
      travelling: mentor.transit.length,
      atNode: mentor.atNode,
      following: this.mentorFollower !== undefined,
      insideScenery: this.staticCollides(
        mentor.group.position.x,
        mentor.group.position.z,
        mentor.group.position.y,
      ),
    };
  }

  /**
   * The dog buried inside the popcorn booth, with its owner standing right
   * beside it. Both halves matter: the escape used to require the owner to be
   * more than seven units off, so a dog stuck in something you were looking at
   * was a dog stuck for good.
   */
  /**
   * Every link in the walkable network, walked end to end against the same
   * collision a resident answers to. A link that reports a blocked sample is a
   * link somebody will get stuck on, so this is what the node coordinates were
   * chosen against rather than read off the plan.
   */
  /**
   * Every resident: where it is, where it is bound, and how much of its walk is
   * left. Two readings apart tell walking from standing, and a body whose y has
   * changed is one that took a stair.
   */
  residentsReviewSnapshot(): unknown {
    // The dog is on the round too, so it belongs in the readout.
    return this.npcs
      .map((npc) => ({
        id: npc.id,
        xyz: [
          Number(npc.group.position.x.toFixed(1)),
          Number(npc.group.position.y.toFixed(1)),
          Number(npc.group.position.z.toFixed(1)),
        ],
        haunt: npc.haunt,
        legsLeft: npc.transit.length,
        stationed: npc.station !== undefined,
        recovering: npc.recovering === true,
        insideScenery: this.staticCollides(
          npc.group.position.x,
          npc.group.position.z,
          npc.group.position.y,
        ),
        tour: npc.tour.join('>'),
      }));
  }

  /**
   * How close the crowd is actually getting. A pair inside the radius they
   * collide at is a pair that is pushing, and a resident whose stuck timer is
   * climbing is one that is not getting past whatever is in front of it.
   */
  crowdingReviewSnapshot(): unknown {
    const walking = this.npcs.filter((npc) => !npc.station);
    let closest = Number.POSITIVE_INFINITY;
    let closestPair = '';
    let touching = 0;
    for (let i = 0; i < walking.length; i += 1) {
      for (let j = i + 1; j < walking.length; j += 1) {
        const gap = Math.hypot(
          walking[i].group.position.x - walking[j].group.position.x,
          walking[i].group.position.z - walking[j].group.position.z,
        );
        // Only counts as pushing if they are on the same storey.
        if (Math.abs(walking[i].group.position.y - walking[j].group.position.y) > 2) continue;
        if (gap < closest) {
          closest = gap;
          closestPair = `${walking[i].id}/${walking[j].id}`;
        }
        if (gap < 1.4) touching += 1;
      }
    }
    const now = performance.now();
    return {
      residents: walking.length,
      // Everybody in the world besides this client, whether or not they are
      // doing anything: residents give way to them the same either way.
      otherVisitors: this.remoteAvatars.size,
      givingWay: walking
        .filter((npc) => npc.gaveWayAt !== undefined && now - npc.gaveWayAt < 2_000)
        .map((npc) => `${npc.id}${npc.gaveWayToRemote ? ':guest' : ':you'}`),
      closestGap: Number(closest.toFixed(2)),
      closestPair,
      // How near a resident has come to a visitor at all — without which a
      // reading of "nobody gave way" says nothing about whether giving way
      // works, only that nobody was close enough to need to.
      closestToVisitor: Number(walking.reduce((nearest, npc) => {
        const gaps = [this.player.position];
        for (const avatar of this.remoteAvatars.values()) gaps.push(avatar.group.position);
        for (const visitor of gaps) {
          if (Math.abs(visitor.y - npc.group.position.y) > 2) continue;
          nearest = Math.min(nearest, Math.hypot(
            visitor.x - npc.group.position.x,
            visitor.z - npc.group.position.z,
          ));
        }
        return nearest;
      }, Number.POSITIVE_INFINITY).toFixed(2)),
      pairsTouching: touching,
      stuck: walking
        .filter((npc) => npc.stuckFor > 1)
        .map((npc) => `${npc.id}:${npc.stuckFor.toFixed(1)}s`),
      insideScenery: walking
        .filter((npc) => this.staticCollides(npc.group.position.x, npc.group.position.z, npc.group.position.y))
        .map((npc) => npc.id),
    };
  }

  /**
   * Tier one of the art direction, behind a flag. Nothing calls this unless the
   * URL asks for it, so a visitor sees exactly the world they saw yesterday.
   *
   * Re-applied rather than applied once, because the world keeps building: the
   * club's fittings, a remote visitor's avatar and the day's fireworks are all
   * made after the opening pass, and an unpatched material in a patched world
   * is more obvious than no patch at all.
   */
  applyWornStyleForReview(amount: number, steps: number, grain: number): number {
    // Dressing first, so the clutter it hangs on the walls is picked up by the
    // shading pass in the same sweep rather than staying smooth-shaded and
    // ungrained among everything that is not.
    // Accumulated, not assigned. The pass marks what it has already dressed, so
    // the later re-runs correctly find nothing to do — and assigning their
    // return value overwrote the real count with zero, which made a working
    // feature look like a broken one.
    if (wornMeshesRequested()) {
      // Fetched here rather than on load, so a visitor who never asks for the
      // style never pays for the font.
      loadBrandFont();
      const dressing = dressBuildings(this.scene);
      this.wornBuildings += dressing.walls;
      this.wornSignsSpared += dressing.refused;
      this.wornSigns = dressing.signs;
    }
    const patched = applyWornStyle(this.scene);
    setWornStyle(amount, steps, grain);
    return patched;
  }

  private wornBuildings = 0;

  private wornSignsSpared = 0;

  private wornSigns = 0;

  wornStyleReviewSnapshot(): unknown {
    const settings = wornStyleSettings();
    let materials = 0;
    let flattened = 0;
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        materials += 1;
        if ((material as THREE.Material).userData?.wornFlattened === true) flattened += 1;
      }
    });
    // How many walls are big enough to be worth dressing, against how many
    // actually were. The two diverging is the fastest way to catch a selector
    // that has stopped matching what the world is made of.
    let dressable = 0;
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const size = mesh.getWorldScale(new THREE.Vector3());
      if (size.y >= 6 && Math.max(size.x, size.z) >= 5) dressable += 1;
    });
    return {
      ...settings,
      materials,
      flattened,
      buildingsDressed: this.wornBuildings,
      dressableWalls: dressable,
      // Where the sole actually ends up, against the ground under it. The
      // arithmetic said one thing and the road said another, so this measures
      // the thing itself.
      soleAboveGround: (() => {
        // Visible parts only. A Box3 over the whole body includes the hidden
        // skateboard parked under the feet, which is lower than any sole and
        // made the restyled figure and the original read identically wrong.
        const box = new THREE.Box3();
        this.player.traverseVisible((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) box.expandByObject(mesh);
        });
        const ground = this.groundHeightAt(this.player.position.x, this.player.position.z)
          - AVATAR_GROUND_Y;
        return box.isEmpty() ? null : Number((box.min.y - ground).toFixed(3));
      })(),
      signsProtected: this.wornSigns,
      placementsRefusedOverSigns: this.wornSignsSpared,
    };
  }

  navReviewSnapshot(): unknown {
    const results: Array<Record<string, unknown>> = [];
    for (const [from, to] of NAV_LINKS) {
      const a = NAV_POINTS[from];
      const b = NAV_POINTS[to];
      const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(2, Math.ceil(span / 0.4));
      let y = this.groundHeightAt(a[0], a[1]);
      let blockedAt: [number, number] | undefined;
      let blocked = 0;
      let climb = 0;
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const next = this.groundHeightAt(x, z, y);
        climb = Math.max(climb, Math.abs(next - y));
        y = next;
        if (this.staticCollides(x, z, y)) {
          blocked += 1;
          if (!blockedAt) blockedAt = [Number(x.toFixed(1)), Number(z.toFixed(1))];
        }
      }
      results.push({
        link: `${from}->${to}`,
        span: Number(span.toFixed(1)),
        blocked,
        firstBlock: blockedAt,
        // A jump in the floor between two samples 0.4 apart is a ledge, not a
        // slope: a resident would be walking up the side of something.
        worstStep: Number(climb.toFixed(2)),
        endY: Number(y.toFixed(2)),
      });
    }
    const loops: Array<Record<string, unknown>> = [];
    for (const [haunt, points] of Object.entries(NPC_HAUNTS)) {
      const floor = NPC_HAUNT_FLOOR[haunt] ?? AVATAR_GROUND_Y;
      let blocked = 0;
      let firstBlock: [number, number] | undefined;
      for (let corner = 0; corner < points.length; corner += 1) {
        const a = points[corner];
        const b = points[(corner + 1) % points.length];
        const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps;
          const x = a[0] + (b[0] - a[0]) * t;
          const z = a[1] + (b[1] - a[1]) * t;
          if (this.staticCollides(x, z, floor)) {
            blocked += 1;
            if (!firstBlock) firstBlock = [Number(x.toFixed(1)), Number(z.toFixed(1))];
          }
        }
      }
      if (blocked > 0) loops.push({ haunt, blocked, firstBlock });
    }
    // Every journey the circuits can ask for, checked as a real run of links.
    const venues = Object.keys(HAUNT_NODE);
    const unroutable: string[] = [];
    for (const from of venues) {
      for (const to of venues) {
        if (from === to) continue;
        const path = navPath(HAUNT_NODE[from], HAUNT_NODE[to]);
        if (path.length === 0) {
          unroutable.push(`${from}->${to}`);
          continue;
        }
        // Every hop has to be a link that exists, or the walk cuts a corner
        // through whatever the network was routing around.
        let at = HAUNT_NODE[from];
        for (const hop of path) {
          if (!(NAV_ADJACENCY[at] ?? []).includes(hop)) unroutable.push(`${from}->${to}@${at}-${hop}`);
          at = hop;
        }
      }
    }
    return {
      unroutableJourneys: unroutable,
      journeysChecked: venues.length * (venues.length - 1),
      // The stair links have to descend, or they are not stairs.
      descents: results
        .filter((r) => (r.link as string).includes('club') || (r.link as string).includes('roof'))
        .map((r) => `${r.link} endY=${r.endY} step=${r.worstStep}`),
      // A wander loop that runs through the scenery is where a resident spends
      // its whole dwell, so it matters as much as the walk that got it there.
      badLoops: loops,
      // A haunt whose node is missing is a room nobody can be routed to.
      unreachableHaunts: Object.entries(HAUNT_NODE)
        .filter(([, node]) => !NAV_POINTS[node])
        .map(([haunt]) => haunt),
      bad: results.filter((r) => (r.blocked as number) > 0 || (r.worstStep as number) > 0.9),
      clean: results.filter((r) => (r.blocked as number) === 0 && (r.worstStep as number) <= 0.9).length,
      total: results.length,
    };
  }

  focusMentorWedgedForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const me = this.selfVisitorId ?? 'review-self';
    this.selfVisitorId = me;
    this.setSharedMentorCarrier(null, me);
    this.setMentorFollower({ kind: 'visitor', id: me });
    this.player.position.set(concessionPosition.x + 3.4, AVATAR_GROUND_Y, concessionPosition.z);
    this.playerState = 'walking';
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    if (mentor) {
      mentor.group.position.set(concessionPosition.x, AVATAR_GROUND_Y, concessionPosition.z);
      mentor.stuckFor = 0;
    }
  }

  /** Whether the dog is standing inside scenery, and how far off its owner is. */
  mentorWedgedReviewSnapshot(): unknown {
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    if (!mentor) return { mentor: 'missing' };
    return {
      mentorXZ: [Number(mentor.group.position.x.toFixed(2)), Number(mentor.group.position.z.toFixed(2))],
      insideScenery: this.staticCollides(
        mentor.group.position.x,
        mentor.group.position.z,
        mentor.group.position.y,
      ),
      distanceToOwner: Number(mentor.group.position.distanceTo(this.player.position).toFixed(2)),
      stuckFor: Number(mentor.stuckFor.toFixed(2)),
      follows: this.mentorFollowsActiveAvatar(),
    };
  }

  focusMentorAtStandForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    // The loyalty test compares the follower against this client's own id, so
    // the fixture has to agree with it rather than invent a name.
    const me = this.selfVisitorId ?? 'review-self';
    this.selfVisitorId = me;
    this.setSharedMentorCarrier(null, me);
    this.setMentorFollower({ kind: 'visitor', id: me });
    const stand = pamphletPosition;
    this.player.position.set(stand.x + 1.2, AVATAR_GROUND_Y, stand.z + 1.2);
    this.playerState = 'walking';
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    if (mentor) {
      mentor.group.position.set(
        this.player.position.x - 1.4,
        this.player.position.y,
        this.player.position.z,
      );
    }
  }

  /** What the prompt offers while a loyal dog stands beside a fixed place. */
  mentorAtStandReviewSnapshot(): unknown {
    return {
      mentorNearby: this.nearbyMentor() !== undefined,
      mentorFollowsMe: this.mentorFollowsActiveAvatar(),
      atAFixedPlace: this.atAFixedPlace(),
      mentorGivesWay: this.mentorGivesWay(),
      interaction: this.interactionLabel(),
      promptAction: this.promptAction,
      hasPamphlet: this.hasPamphlet,
    };
  }

  /** Loopback fixture with both a loyal MENTOR and a human greeting target. */
  focusMentorGreetingForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    this.mentorGreetingReview = true;
    this.focusMentorForReview(false);
    this.setSharedMentorCarrier(null, 'review-self');
    this.setMentorFollower({ kind: 'visitor', id: 'review-self' });
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    const guest = this.npcs.find((npc) => npc.id !== 'MENTOR' && npc.pose !== 'dj');
    if (!mentor || !guest) return;
    mentor.group.position.set(
      this.player.position.x - 1.8,
      this.player.position.y,
      this.player.position.z,
    );
    const guestPosition = new THREE.Vector3(
      this.player.position.x + 1.8,
      this.player.position.y,
      this.player.position.z,
    );
    guest.station = { position: guestPosition, rotationY: -Math.PI / 2 };
    guest.group.position.copy(guestPosition);
    guest.group.rotation.y = guest.station.rotationY;
  }

  /** Deterministic loopback fixture that drops the attendee into the club. */
  /** Loopback fixture that drops the attendee on the rooftop deck. */
  focusRooftopForReview(atDj = false): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const x = atDj ? ROOFTOP_CENTER_X : ROOFTOP_CENTER_X - 6;
    const z = atDj ? rooftopBounds.deckMinZ + 9 : 30;
    this.player.position.set(x, this.groundHeightAt(x, z), z);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.player.rotation.y = 0;
    this.cameraMode = 'follow';
    this.cameraOrbit.follow.yaw = Math.PI;
    this.cameraOrbit.follow.pitch = 0.3;
  }

  /**
   * Loopback fixture standing on the approach road looking north at the gate,
   * which is the one view of the sign every arrival gets.
   */
  focusGateForReview(fromOutside = false): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    // Two views, because the gate is read from both. Outside is where the sign
    // faces and where the crossbar used to stand in front of it; inside is the
    // view every attendee already in the festival has of the same structure.
    const z = fromOutside ? GATE_Z - 4 : GATE_Z - 22;
    this.player.position.set(0, this.groundHeightAt(0, z), z);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.player.rotation.y = fromOutside ? 0 : Math.PI;
    this.cameraMode = 'follow';
    // The zoom is remembered between visits, so a fixture that does not reset
    // it is framed by whatever the last person did with the wheel.
    this.cameraZoom = 1;
    this.cameraOrbit.follow.yaw = fromOutside ? 0 : Math.PI;
    this.cameraOrbit.follow.pitch = fromOutside ? 0.12 : -0.06;
  }

  /**
   * The side-on MY SQUARE view where the Shore projector's second render pass
   * repeatedly left a translucent rectangle beside the programme board.
   */
  focusTimetableForReview(withProjector = false, close = false): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    this.reviewProjectorVenue = withProjector ? 'shore' : undefined;
    this.player.position.set(-4.4, this.groundHeightAt(-4.4, 8), 8);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.player.rotation.y = 0;
    this.cameraMode = 'follow';
    this.cameraZoom = close ? 0.56 : 1;
    this.cameraOrbit.follow.yaw = -0.2;
    this.cameraOrbit.follow.pitch = 0.2;
  }

  /**
   * Loopback-only views of the Shore projector from either side of its panel.
   * The rear view catches the CSS3D/WebGL compositor drawing a portal through
   * the otherwise opaque back; the front view makes sure fixing that does not
   * suppress the film for its audience.
   */
  focusProjectorSideForReview(fromBehind: boolean): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    this.reviewProjectorVenue = 'shore';
    const z = fromBehind ? -54 : -32;
    this.player.position.set(0, this.groundHeightAt(0, z), z);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.player.rotation.y = fromBehind ? Math.PI : 0;
    this.cameraMode = 'first-person';
    this.cameraZoom = 1;
    this.cameraOrbit.follow.yaw = fromBehind ? Math.PI : 0;
    this.cameraOrbit.follow.pitch = 0;
  }

  projectorSideReviewSnapshot(): {
    cameraZ: number;
    screenZ: number;
    cameraOnViewingSide: boolean;
    iframeMounted: boolean;
    cssVisibility: string;
    foregroundVisibility: string;
  } {
    const screen = venueScreens.shore;
    const projector = this.projectors.get('shore');
    return {
      cameraZ: this.camera.position.z,
      screenZ: screen.position[2],
      cameraOnViewingSide: (this.camera.position.z - screen.position[2]) * screen.facing > 0.02,
      iframeMounted: Boolean(projector?.iframe),
      cssVisibility: projector?.element.style.visibility || '',
      foregroundVisibility: this.foregroundCanvas.style.visibility,
    };
  }

  timetableReviewSnapshot(): {
    player: { x: number; y: number; z: number };
    mountedProjectorVenue?: VenueKey;
    iframeVenues: VenueKey[];
    visibleCssProjectors: VenueKey[];
    foregroundVisibility: string;
    suppressedProjectorVenues: VenueKey[];
  } {
    return {
      player: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
      mountedProjectorVenue: this.mountedProjectorVenue,
      iframeVenues: [...this.projectors].filter(([, projector]) => Boolean(projector.iframe)).map(([venue]) => venue),
      visibleCssProjectors: [...this.projectors]
        .filter(([, projector]) => projector.element.style.visibility !== 'hidden')
        .map(([venue]) => venue),
      foregroundVisibility: this.foregroundCanvas.style.visibility,
      suppressedProjectorVenues: this.reviewSuppressedProjectors,
    };
  }

  /** Loopback-only ocean view for checking sunrise, sunset and moonrise. */
  focusCelestialForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    this.player.position.set(0, this.groundHeightAt(0, -48), -48);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.player.rotation.y = 0;
    this.cameraMode = 'first-person';
    this.cameraOrbit.follow.yaw = 0;
    this.cameraOrbit.follow.pitch = 0.04;
  }

  celestialReviewSnapshot(): unknown {
    return {
      dayNight: this.dayNight.getState(),
      ...this.dayNight.getCelestialReviewState(),
    };
  }

  /** Loopback fixture inside the temple, facing the altar down the hall. */
  focusTempleForReview(atAltar = false): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const centerZ = (TEMPLE.minZ + TEMPLE.maxZ) / 2;
    // Far enough in that the camera, which sits ten behind, is inside the hall
    // too — from the doorway it stood out on the forecourt looking at a wall.
    const x = atAltar ? TEMPLE.maxX - 11 : TEMPLE.minX + 14;
    this.player.position.set(x, this.groundHeightAt(x, centerZ), centerZ);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.player.rotation.y = Math.PI / 2;
    // First person, because the hall is the thing being looked at and a
    // third-person camera sits ten units behind the body — which in here is
    // outside the building, through a wall, looking at the back of it.
    this.cameraMode = 'first-person';
    this.cameraZoom = 1;
    // In first person the look vector is (-sin yaw, -sin pitch, -cos yaw), so
    // this faces east, up the hall towards the altar.
    this.cameraOrbit.follow.yaw = -Math.PI / 2;
    this.cameraOrbit.follow.pitch = atAltar ? 0.02 : -0.06;
  }

  /**
   * What the gate and the temple actually measure, for a loopback check. The
   * headroom is the figure that matters in the temple: the hall was built at a
   * height the god did not fit under.
   */
  structureReviewSnapshot(): {
    player: { x: number; y: number; z: number };
    templeFloorY: number;
    templeCeilingY: number;
    templeHeadroom: number;
    altarTop: { minX: number; maxX: number; y: number };
    deity: { x: number; lotusMinX: number; lotusMaxX: number; crownY: number };
    gateSignZ: number[];
    gateBarZ: { min: number; max: number };
    jukebox: { seatedAt: number; corners: number[]; probe: Array<{ dx: number; dz: number; y: number }> };
  } {
    const wallHeight = 10.5;
    const tierY = TEMPLE.podium + wallHeight + 0.5;
    // Underside of the first roof tier, then the timber band slung beneath it.
    const ceiling = tierY - 0.9 / 2 - 0.15 - 0.35 / 2;
    const floor = TEMPLE.podium;
    const altarX = TEMPLE.maxX - 5.5;
    const tableCenterX = altarX + 1.3;
    const tableWidth = 6.6;
    const deityX = altarX + 1.9;
    return {
      player: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
      templeFloorY: floor,
      templeCeilingY: ceiling,
      templeHeadroom: ceiling - floor,
      altarTop: { minX: tableCenterX - tableWidth / 2, maxX: tableCenterX + tableWidth / 2, y: TEMPLE.podium + 1.38 },
      // The lotus is the widest thing on the table and the part that was over
      // the edge: eight petals on a 1.9 radius, each 0.8 across.
      deity: {
        x: deityX,
        lotusMinX: deityX - 2.3,
        lotusMaxX: deityX + 2.3,
        crownY: TEMPLE.podium + 1.4 + 5.575,
      },
      gateSignZ: [GATE_Z - 0.9, GATE_Z + 0.9],
      gateBarZ: { min: GATE_Z - 0.55, max: GATE_Z + 0.55 },
      jukebox: (() => {
        const jx = this.jukebox?.x ?? 0;
        const jz = this.jukebox?.z ?? 0;
        const corners = [[-0.75, -1.2], [0.75, -1.2], [-0.75, 1.2], [0.75, 1.2]]
          .map(([dx, dz]) => this.groundHeightAt(jx + dx, jz + dz, 0) - AVATAR_GROUND_Y);
        // A wider sweep, to see whether anything around it stands higher than
        // the four corners report — which is the only way the body can still be
        // meeting ground after being seated on the highest of them.
        const probe: Array<{ dx: number; dz: number; y: number }> = [];
        for (let dx = -2; dx <= 2; dx += 1) {
          for (let dz = -2; dz <= 2; dz += 1) {
            probe.push({ dx, dz, y: this.groundHeightAt(jx + dx, jz + dz, 0) - AVATAR_GROUND_Y });
          }
        }
        return { seatedAt: Math.max(...corners), corners, probe };
      })(),
    };
  }

  /** Loopback fixture on the road, looking at the jukebox and the stair. */
  focusJukeboxForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    // Derived from where the jukebox actually is, so this cannot drift away
    // from it the way it just did when the building moved.
    const x = (this.jukebox?.x ?? 21) - 5;
    const z = this.jukebox?.z ?? 13.5;
    this.player.position.set(x, this.groundHeightAt(x, z), z);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.player.rotation.y = Math.PI / 2;
    this.cameraMode = 'follow';
    this.cameraZoom = 1;
    this.cameraOrbit.follow.yaw = -Math.PI / 2;
    this.cameraOrbit.follow.pitch = 0.16;
  }

  /** Loopback fixture standing in the lobby, looking at the stair opening. */
  /**
   * Sat on a stool at the basement bar, which is otherwise only reachable by
   * walking there — and a browser that has suspended its frame loop cannot walk
   * anywhere. Reasoning about this seat has been wrong three times; this is so
   * it can be looked at instead.
   */
  focusClubBarForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const stool = this.seats.find((seat) => seat.kind === 'bar');
    if (!stool) return;
    this.activeSeat = stool;
    this.playerState = 'seated';
    this.cameraMode = 'screening';
    this.player.position.copy(this.seatAnchor(stool));
    this.player.rotation.y = stool.facing ?? Math.PI;
  }

  /** What the prompt says and what a press on it would do, for review only. */
  barReviewSnapshot(): unknown {
    const stool = this.seats.find((seat) => seat.kind === 'bar');
    return {
      seatedOn: this.activeSeat?.id,
      seatKind: this.activeSeat?.kind,
      playerState: this.playerState,
      playerXZ: [Number(this.player.position.x.toFixed(2)), Number(this.player.position.z.toFixed(2))],
      stoolXZ: stool ? [Number(stool.position.x.toFixed(2)), Number(stool.position.z.toFixed(2))] : undefined,
      inClubRoom: this.inClubRoom(this.player.position.x, this.player.position.z),
      nearClubBar: this.nearClubBar(),
      carriedItem: this.carriedItem,
      interaction: this.interactionLabel(),
      canInteract: this.canInteract(),
      promptAction: this.promptAction,
    };
  }

  focusClubLobbyForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const b = clubBounds;
    const x = b.buildingMaxX - 5;
    const z = (b.stairMinZ + b.stairMaxZ) / 2;
    this.player.position.set(x, this.groundHeightAt(x, z), z);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.player.rotation.y = -Math.PI / 2;
    this.cameraMode = 'follow';
    this.cameraOrbit.follow.yaw = Math.PI / 2;
    this.cameraOrbit.follow.pitch = 0.5;
  }

  /**
   * The foot of the stair down from the lobby, looking back up the flight —
   * the one view that shows whether the run has anything under it.
   */
  focusClubStairForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const z = (clubBounds.stairMinZ + clubBounds.stairMaxZ) / 2;
    const x = clubBounds.roomMaxX - 15;
    this.player.position.set(x, this.groundHeightAt(x, z), z);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.player.rotation.y = Math.PI / 2;
    this.cameraMode = 'follow';
    this.cameraOrbit.follow.yaw = -Math.PI / 2;
    this.cameraOrbit.follow.pitch = 0.12;
  }

  focusClubForReview(atDj = false): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const x = atDj ? -68 : -66;
    const z = atDj ? 18.5 + CLUB_Z : -9 + CLUB_Z;
    this.player.position.set(x, this.groundHeightAt(x, z), z);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.player.rotation.y = 0;
    this.cameraMode = 'follow';
    this.cameraOrbit.follow.yaw = Math.PI;
    this.cameraOrbit.follow.pitch = 0.2;
  }

  /**
   * Loopback-only cost readout. Draw calls, lights and live video players are
   * the three things that actually move the frame budget in this world.
   */
  performanceSnapshot(): {
    drawCalls: number;
    triangles: number;
    programs: number;
    sceneObjects: number;
    lights: number;
    shadowCasters: number;
    livePlayers: number;
    colliders: number;
    npcs: number;
  } | undefined {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return undefined;
    let sceneObjects = 0;
    let lights = 0;
    let shadowCasters = 0;
    this.scene.traverse((object) => {
      sceneObjects += 1;
      if ((object as THREE.Light).isLight) lights += 1;
      if (object.castShadow) shadowCasters += 1;
    });
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      programs: this.renderer.info.programs?.length ?? 0,
      sceneObjects,
      lights,
      shadowCasters,
      livePlayers: [...this.projectors.values()].filter((projector) => Boolean(projector.iframe)).length,
      colliders: this.colliders.length,
      npcs: this.npcs.length,
    };
  }

  /** Read-only loopback snapshot of the club room and its beat rig. */
  /**
   * Where the club's own regulars are standing. A still room is the symptom
   * this exists to catch, and it is not one a single frame can show: it takes
   * two readings a few seconds apart to tell dancing on the spot from walking.
   */
  clubRegularsReviewSnapshot(): Array<Record<string, unknown>> {
    return this.npcs
      .filter((npc) => ['SEBINE', 'ZC', 'LOUI', 'VIOLA'].includes(npc.id))
      .map((npc) => ({
        id: npc.id,
        xz: [Number(npc.group.position.x.toFixed(2)), Number(npc.group.position.z.toFixed(2))] as [number, number],
        stationed: npc.station !== undefined,
        haunt: npc.haunt,
        travelling: npc.transit.length,
        tour: npc.tour.join('>'),
        route: npc.route.length,
        waypoint: npc.waypointIndex,
        target: npc.route[npc.waypointIndex]
          ? [Number(npc.route[npc.waypointIndex].x.toFixed(2)), Number(npc.route[npc.waypointIndex].z.toFixed(2))]
          : undefined,
        waitFor: Math.round(npc.waitUntil - performance.now()),
        stuckFor: Number(npc.stuckFor.toFixed(2)),
        blockedHere: this.npcCollides(npc, npc.group.position.x, npc.group.position.z),
      }));
  }

  clubReviewSnapshot(): {
    location: string;
    venue: VenueKey;
    playerY: number;
    onClubFloor: boolean;
    djId?: string;
    djDistance?: number;
    djPose?: string;
    interaction?: string;
    entryRoute: Array<{ x: number; y: number; blocked: boolean }>;
    npcHaunts: string[];
    nearBar: boolean;
    nearShop: boolean;
    openingHits: string[];
    roomBlockers: string[];
    rooftopRoute: Array<{ x: number; z: number; y: number; blocked: boolean }>;
    barSeats: number;
    drinks: number;
    drunkenness: number;
    frames: number;
    lastDelta: number;
    camera: number[];
    lookAt: number[];
    playerXZ: number[];
    lightCount: number;
    litLights: number;
    bpm: number;
  } | undefined {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return undefined;
    const dj = this.npcs.find((npc) => npc.pose === 'dj');
    return {
      location: this.locationName(),
      venue: this.screeningVenue(),
      playerY: Number(this.player.position.y.toFixed(2)),
      onClubFloor: Math.abs(this.player.position.y - CLUB_AVATAR_Y) < 0.05,
      djId: dj?.id,
      djDistance: dj ? Number(dj.group.position.distanceTo(this.player.position).toFixed(2)) : undefined,
      djPose: dj?.pose,
      interaction: this.interactionLabel(),
      frames: this.reviewFrameCount,
      lastDelta: Number(this.reviewLastDelta.toFixed(4)),
      camera: this.camera.position.toArray().map((value) => Number(value.toFixed(2))),
      lookAt: this.lookTarget.toArray().map((value) => Number(value.toFixed(2))),
      playerXZ: [Number(this.player.position.x.toFixed(2)), Number(this.player.position.z.toFixed(2))],
      // Collision probe along the entry route, so the walk in can be checked
      // without driving the avatar frame by frame.
      entryRoute: [-19, -24, -30, -34, -38, -42, -46, -48, -52, -58, -66, -76]
        .map((x) => ({
          x,
          y: Number(this.groundHeightAt(x, 8.5 + CLUB_Z).toFixed(2)),
          blocked: this.staticCollides(x, 8.5 + CLUB_Z, this.groundHeightAt(x, 8.5 + CLUB_Z)),
        })),
      npcHaunts: this.npcs
        .filter((npc) => !npc.station)
        .map((npc) => `${npc.id}:${npc.haunt ?? '-'}`),
      nearBar: this.nearClubBar(),
      nearShop: this.nearShopCounter(),
      // What a ray dropped down the stair opening actually hits. The only
      // honest way to tell an opening from a floor that looks like one.
      openingHits: (() => {
        const b = clubBounds;
        const origin = new THREE.Vector3(
          (b.lobbyMinX + b.stairTopX) / 2,
          6,
          (b.stairMinZ + b.stairMaxZ) / 2,
        );
        const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 40);
        // Name sprites carry no material map until first render, so meshes only.
        const meshes: THREE.Mesh[] = [];
        this.scene.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
        });
        return ray.intersectObjects(meshes, false)
          .slice(0, 5)
          .map((hit) => `y${hit.point.y.toFixed(2)} w${hit.object.scale.x.toFixed(1)}x${hit.object.scale.z.toFixed(1)}`);
      })(),
      roomBlockers: (() => {
        const found = new Map<string, number>();
        const b = clubBounds;
        for (let x = b.roomMinX + 2; x < b.roomMaxX - 2; x += 2) {
          for (let z = b.roomMinZ + 2; z < b.roomMaxZ - 2; z += 2) {
            const y = CLUB_AVATAR_Y;
            for (const collider of this.colliders) {
              if (x <= collider.minX || x >= collider.maxX) continue;
              if (z <= collider.minZ || z >= collider.maxZ) continue;
              if (collider.minY !== undefined && y < collider.minY) continue;
              if (collider.maxY !== undefined && y > collider.maxY) continue;
              const key = collider.label ?? 'unlabelled';
              found.set(key, (found.get(key) ?? 0) + 1);
            }
          }
        }
        return [...found.entries()].map(([label, cells]) => `${label}:${cells}`);
      })(),
      // Walking the rooftop: up the stair, across the bay, onto the deck.
      rooftopRoute: [
        [15.5, 18], [15.5, 21], [15.5, 24], [15.5, 27], [15.5, 30], [15.5, 33],
        [15.5, 35], [17.5, 35], [19, 35], [24, 32], [30, 28], [36, 30], [44, 34], [50, 38],
        [36, 12], [36, 15], [36, 17],
      ].map(([x, z]) => ({
        x,
        z,
        y: Number(this.groundHeightAt(x, z).toFixed(2)),
        blocked: this.staticCollides(x, z, this.groundHeightAt(x, z)),
      })),
      barSeats: this.seats.filter((seat) => seat.kind === 'bar').length,
      drinks: this.drinks,
      drunkenness: Number(this.drunkenness().toFixed(2)),
      lightCount: this.clubLights.length,
      litLights: this.clubLights.filter((light) => ((light.material as THREE.MeshBasicMaterial).opacity ?? 1) > 0.3).length,
      bpm: this.clubBeat.bpm,
    };
  }

  /** Read-only local QA geometry snapshot; excluded outside loopback hosts. */
  mentorReviewSnapshot(): {
    carried: boolean;
    dogBounds: { min: number[]; max: number[] };
    hairBounds: { min: number[]; max: number[] };
    clearance: number;
    primitiveKinds: string[];
  } | undefined {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return undefined;
    const mentor = this.npcs[0];
    const carrier = this.activeCarrierGroup();
    const hairParts = carrier.children.filter((child) => child.userData.paletteSlot === 'hair');
    if (!mentor?.dogRig || hairParts.length === 0) return undefined;
    carrier.updateMatrixWorld(true);
    const dogBounds = new THREE.Box3().setFromObject(mentor.dogRig.root);
    const hairBounds = hairParts.reduce(
      (bounds, part) => bounds.union(new THREE.Box3().setFromObject(part)),
      new THREE.Box3(),
    );
    const primitiveKinds = new Set<string>();
    mentor.dogRig.root.traverse((object) => {
      if (object instanceof THREE.Mesh) primitiveKinds.add(object.geometry.type);
    });
    return {
      carried: this.carriedItem === 'MENTOR',
      dogBounds: { min: dogBounds.min.toArray(), max: dogBounds.max.toArray() },
      hairBounds: { min: hairBounds.min.toArray(), max: hairBounds.max.toArray() },
      clearance: dogBounds.min.y - hairBounds.max.y,
      primitiveKinds: [...primitiveKinds],
    };
  }

  mentorFollowerReviewSnapshot(): { follower?: MentorFollowerTarget; distance?: number } | undefined {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return undefined;
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    const target = this.mentorFollowerObject();
    if (!mentor || !target) return { follower: this.mentorFollower };
    target.getWorldPosition(this.mentorTargetPosition);
    return {
      follower: this.mentorFollower,
      distance: Number(mentor.group.position.distanceTo(this.mentorTargetPosition).toFixed(2)),
    };
  }

  mentorGreetingReviewSnapshot(): {
    follower?: MentorFollowerTarget;
    interaction?: string;
    canInteract: boolean;
    hasSecondaryPrompt: boolean;
    gesture?: AvatarGesture;
    mentorEating: boolean;
  } | undefined {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return undefined;
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    return {
      follower: this.mentorFollower,
      interaction: this.interactionLabel(),
      canInteract: this.canInteract(),
      hasSecondaryPrompt: this.promptSecondary,
      gesture: performance.now() < this.playerGestureUntil ? this.playerGesture : undefined,
      mentorEating: Boolean(mentor && performance.now() < mentor.eatUntil),
    };
  }

  /** Read-only loopback snapshot for the STAFF NPC-control handoff flow. */
  npcControlReviewSnapshot(): {
    controlledNpcId?: string;
    playerVisible: boolean;
    originalIdleVisible: boolean;
    playerPosition: number[];
    originalPosition: number[];
    npcPosition?: number[];
    playerNpcDistance?: number;
    playerState: PlayerState;
    carriedItem?: CarriedItem;
    carriedPropVisible: boolean;
    carriedPropParentNpcId?: string;
  } | undefined {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return undefined;
    const controlledNpc = this.controlledNpcId
      ? this.npcs.find((npc) => npc.id === this.controlledNpcId)
      : undefined;
    return {
      controlledNpcId: this.controlledNpcId,
      playerVisible: this.player.visible,
      originalIdleVisible: this.originalPlayerIdle.visible,
      playerPosition: this.player.position.toArray(),
      originalPosition: this.originalPlayerIdle.position.toArray(),
      npcPosition: controlledNpc?.group.position.toArray(),
      playerNpcDistance: controlledNpc?.group.position.distanceTo(this.player.position),
      playerState: this.playerState,
      carriedItem: this.carriedItem,
      carriedPropVisible: this.carriedProp.visible,
      carriedPropParentNpcId: this.npcs.find((npc) => npc.group === this.carriedProp.parent)?.id,
    };
  }

  /** Deterministic loopback fixture for controlled-NPC popcorn and seating QA. */
  focusNpcPopcornForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const npc = this.npcs.find((candidate) => candidate.id === 'KENNY' && !candidate.dogRig);
    const seat = this.seats.find((candidate) => candidate.venue === 'shore');
    if (!npc || !seat) return;
    npc.group.position.copy(this.seatAnchor(seat));
    npc.group.rotation.y = Math.PI;
    this.setControlledNpcId(npc.id);
    this.carriedItem = 'POPCORN';
    this.stowedItem = undefined;
    this.activeSeat = seat;
    this.playerState = 'seated';
    this.player.position.copy(this.seatAnchor(seat));
    this.player.rotation.y = Math.PI;
    this.previousCameraMode = 'follow';
    this.cameraMode = 'screening';
    this.syncCarriedPropAnchor();
  }

  /** Deterministic loopback fixture for the seated public-screening mobile UI. */
  focusPublicScreeningForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const seat = this.seats.find((candidate) => candidate.venue === 'shore');
    if (!seat) return;
    this.activeSeat = seat;
    this.playerState = 'seated';
    this.player.position.copy(this.seatAnchor(seat));
    this.player.rotation.y = seat.facing ?? Math.PI;
    this.previousCameraMode = 'follow';
    this.cameraMode = 'screening';
    this.screeningOrbit.yaw = 0;
    this.screeningOrbit.pitch = 0;
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
  }

  setNpcProfiles(profiles: NpcProfile[]): void {
    for (const [index, profile] of profiles.slice(0, 24).entries()) {
      let npc = this.npcs.find((candidate) => candidate.id === profile.id);
      if (!npc) {
        npc = this.createNpcAvatar(profile, index);
      }
      const name = profile.name.trim() || profile.id;
      if (name === npc.name) continue;
      npc.name = name;
      const material = npc.badge.material as THREE.SpriteMaterial;
      const previousTexture = material.map;
      material.map = createNameTexture(name);
      material.needsUpdate = true;
      previousTexture?.dispose();
    }
    this.applyControlledNpcVisibility();
  }

  setControlledNpcId(npcId?: string): void {
    if (npcId === this.controlledNpcId) return;
    const nextNpc = npcId ? this.npcs.find((npc) => npc.id === npcId) : undefined;
    if (npcId && !nextNpc) return;

    // MENTOR is parented to the active avatar while carried. Put him down
    // before changing identities so he cannot remain attached to an NPC that
    // has returned to autonomous movement.
    if (this.carriedItem === 'MENTOR' && npcId !== this.controlledNpcId) this.putDownMentor();
    if (this.playerState === 'seated') this.standUp();
    if (this.playerState === 'swimming') this.setSwimming(false);

    if (npcId && !this.controlledNpcId) {
      this.originalPlayerIdle.position.copy(this.player.position);
      this.originalPlayerIdle.rotation.copy(this.player.rotation);
      this.originalPlayerIdle.visible = true;
    }

    if (nextNpc) {
      this.player.position.copy(nextNpc.group.getWorldPosition(new THREE.Vector3()));
      this.player.position.y = AVATAR_GROUND_Y;
      this.player.quaternion.copy(nextNpc.group.getWorldQuaternion(new THREE.Quaternion()));
      this.playerState = 'walking';
      this.activeSeat = undefined;
    } else if (this.controlledNpcId) {
      this.player.position.copy(this.originalPlayerIdle.position);
      this.player.position.y = AVATAR_GROUND_Y;
      this.player.rotation.copy(this.originalPlayerIdle.rotation);
      this.playerState = 'walking';
      this.originalPlayerIdle.visible = false;
    }

    this.controlledNpcId = npcId;
    this.syncCarriedPropAnchor();
    this.applyControlledNpcVisibility();
  }

  setSharedMentorCarrier(carrierId: string | null, selfVisitorId: string): void {
    if (this.mentorGreetingReview && selfVisitorId !== 'review-self') return;
    this.mentorCarrierId = carrierId ?? undefined;
    this.selfVisitorId = selfVisitorId;
    if (carrierId === selfVisitorId) this.mentorClaimPending = false;
    if (carrierId && carrierId !== selfVisitorId) this.mentorClaimPending = false;
    if (!carrierId) this.mentorReleasePending = false;
    if (carrierId === selfVisitorId && this.carriedItem !== 'MENTOR' && !this.mentorReleasePending) {
      const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
      if (mentor?.dogRig) {
        this.carriedItem = 'MENTOR';
        this.stowedItem = undefined;
        this.attachMentorToCarrier(mentor, this.activeCarrierGroup());
      }
    } else if (this.carriedItem === 'MENTOR' && carrierId !== selfVisitorId && !this.mentorClaimPending) {
      this.putDownMentor(false);
    }
    if (this.isMentorControlLocked()) {
      this.carriedItem = undefined;
      this.stowedItem = undefined;
      this.keys.clear();
      this.moveVector.set(0, 0, 0);
    }
    this.syncSharedMentorCarrier();
  }

  setMentorFollower(follower: MentorFollowerTarget | null): void {
    if (this.mentorGreetingReview && follower?.id !== 'review-self') return;
    this.mentorFollower = follower ?? undefined;
  }

  rejectMentorCarry(): void {
    this.mentorClaimPending = false;
    if (this.carriedItem === 'MENTOR') this.putDownMentor(false);
  }

  restoreMentorCarry(): void {
    if (this.mentorCarrierId !== this.selfVisitorId) return;
    this.mentorReleasePending = false;
    this.setSharedMentorCarrier(this.mentorCarrierId ?? null, this.selfVisitorId ?? '');
  }

  private applyControlledNpcVisibility(): void {
    for (const npc of this.npcs) {
      npc.group.visible = true;
    }
    this.player.visible = !this.controlledNpcId;
  }

  /** Space starts and stops dancing; moving or sitting down ends it. */
  toggleDancing(): boolean {
    if (this.playerState === 'seated' || this.isMentorControlLocked()) return false;
    this.dancing = !this.dancing;
    this.onAction({ type: 'dance', active: this.dancing });
    return this.dancing;
  }

  toggleCameraMode(): CameraMode {
    if (this.cameraMode === 'screening') return this.cameraMode;
    const order: CameraMode[] = ['follow', 'perspective', 'first-person'];
    const next = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.cameraMode = next;
    return this.cameraMode;
  }

  setMovementKey(key: 'w' | 'a' | 's' | 'd', active: boolean): void {
    if (active) this.keys.add(key);
    else this.keys.delete(key);
  }

  /**
   * A thumbstick's actual reading: any direction, and any pace up to a walk.
   * The keyboard can only ever say yes or no in four directions, so it goes on
   * being read as it was — this sits beside it and wins whenever it is pushed.
   */
  setMovementVector(horizontal: number, vertical: number): void {
    this.stickX = THREE.MathUtils.clamp(horizontal, -1, 1);
    this.stickY = THREE.MathUtils.clamp(vertical, -1, 1);
  }

  setGraphicsMode(mode: GraphicsMode): void {
    this.graphicsMode = mode;
    this.adaptiveRenderScale = 1;
    this.performanceWindowStartedAt = performance.now();
    this.performanceFrameCount = 0;
    if (this.stylizedWater) this.stylizedWater.visible = mode === 'normal';
    this.renderer.shadowMap.enabled = mode === 'normal';
    this.foregroundRenderer.shadowMap.enabled = mode === 'normal';
    this.dayNight.setShadowsEnabled(mode === 'normal');
    for (const spotlight of this.shadowSpotlights) spotlight.castShadow = mode === 'normal';
    this.applyRenderPixelRatios();
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.far = mode === 'normal' ? 150 : 92;
  }

  setAvatarPalette(palette: AvatarPalette): void {
    this.palette = palette;
    for (const avatar of [this.player, this.originalPlayerIdle]) {
      avatar.traverse((child: THREE.Object3D) => {
        if (!(child instanceof THREE.Mesh)) return;
        const slot = child.userData.paletteSlot as keyof AvatarPalette | undefined;
        if (slot && child.material instanceof THREE.MeshStandardMaterial) {
          const color = this.outfit === 'swimwear' && (slot === 'top' || slot === 'bottoms')
            ? palette.swimwear
            : palette[slot];
          child.material.color.set(color);
        }
      });
    }
  }

  setRemoteVisitors(visitors: RemoteVisitorVisual[]): void {
    const limit = this.graphicsMode === 'normal' ? 32 : 12;
    const priorityVisitors = visitors.filter((visitor) =>
      visitor.id === this.mentorCarrierId ||
      (this.mentorFollower?.kind === 'visitor' && visitor.id === this.mentorFollower.id) ||
      Boolean(visitor.npcId));
    const visibleVisitors = [
      ...priorityVisitors,
      ...visitors.filter((visitor) => !priorityVisitors.includes(visitor)),
    ].slice(0, limit);
    const activeIds = new Set(visibleVisitors.map((visitor) => visitor.id));
    this.remoteNpcControls.clear();
    for (const visitor of visibleVisitors) {
      if (visitor.npcId) this.remoteNpcControls.set(visitor.npcId, visitor);
    }
    for (const [id, avatar] of this.remoteAvatars) {
      if (activeIds.has(id)) continue;
      avatar.group.removeFromParent();
      avatar.group.traverse((child) => {
        if (!(child instanceof THREE.Mesh || child instanceof THREE.Sprite)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const item of materials) item.dispose();
      });
      this.remoteAvatars.delete(id);
    }
    for (const visitor of visibleVisitors) {
      if (visitor.gesture === 'feed') {
        const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
        if (mentor) {
          const mentorPosition = mentor.group.getWorldPosition(new THREE.Vector3());
          if (new THREE.Vector3(visitor.x, mentorPosition.y, visitor.z).distanceTo(mentorPosition) < 4.2) {
            mentor.eatUntil = performance.now() + 1_750;
            mentor.gesture = 'tail-wag';
            mentor.gestureUntil = performance.now() + 1_850;
          }
        }
      }
      const idleOrigin = visitor.npcId ? visitor.impersonationOrigin : undefined;
      const displayVisitor: RemoteVisitorVisual = idleOrigin ? {
        ...visitor,
        name: visitor.originalName,
        x: idleOrigin.x,
        y: idleOrigin.y,
        z: idleOrigin.z,
        rotation: idleOrigin.rotation,
        state: 'walking',
        moving: false,
        gesture: undefined,
        carriedItem: undefined,
      } : visitor;
      let avatar = this.remoteAvatars.get(visitor.id);
      if (!avatar) {
        avatar = this.createRemoteAvatar(displayVisitor);
        this.remoteAvatars.set(visitor.id, avatar);
      }
      // Everyone used to be drawn at ground level whatever height they were
      // actually at, which put anyone on the roof deck seven units under their
      // own feet and anyone in the basement sixteen units above the ceiling.
      // An older client sends no height at all, so fall back to the floor it
      // would have been drawn on rather than dropping it to zero.
      const reportedY = typeof displayVisitor.y === 'number' && Number.isFinite(displayVisitor.y)
        ? displayVisitor.y
        : (displayVisitor.state === 'swimming' ? AVATAR_SWIM_Y : AVATAR_GROUND_Y);
      // Play the body from where it was to where it now is, over the time the
      // next update is expected to take. Easing toward the latest position
      // instead made everyone sprint to their last known spot, stop dead, and
      // jump again — at a run that is nearly three units of stutter per step,
      // and it is what reads as another visitor being in the wrong place even
      // when they are standing in the same room.
      const arrivedAt = performance.now();
      const sinceLast = arrivedAt - avatar.targetAt;
      if (sinceLast > 20) {
        avatar.previousTarget.copy(avatar.group.position);
        avatar.previousRotation = avatar.group.rotation.y;
        avatar.updateInterval = THREE.MathUtils.clamp(sinceLast, 90, 600);
        avatar.targetAt = arrivedAt;
      }
      avatar.target.set(displayVisitor.x, reportedY, displayVisitor.z);
      avatar.targetRotation = displayVisitor.rotation;
      avatar.state = displayVisitor.state;
      avatar.moving = displayVisitor.moving;
      avatar.running = displayVisitor.running === true;
      avatar.carriedItem = displayVisitor.carriedItem;
      if (avatar.name !== displayVisitor.name) {
        avatar.name = displayVisitor.name;
        const material = avatar.badge.material as THREE.SpriteMaterial;
        const previousTexture = material.map;
        material.map = createNameTexture(displayVisitor.name);
        material.needsUpdate = true;
        previousTexture?.dispose();
      }
      if (displayVisitor.gesture) {
        // Armed for the gesture's own length, and only when it is a new one or
        // the last has run out. Presence arrives several times a second, and
        // re-arming on each arrival pinned the body to the first frame of the
        // action for as long as the service kept reporting it — which for a
        // punch is its entire length, so nobody ever saw one land.
        const span = GESTURE_SPAN_MS[displayVisitor.gesture] ?? 900;
        if (avatar.gesture !== displayVisitor.gesture || performance.now() >= avatar.gestureUntil) {
          avatar.gesture = displayVisitor.gesture;
          avatar.gestureUntil = performance.now() + span;
        }
        if (displayVisitor.gesture === 'feed') {
          const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
          if (mentor) {
            const mentorPosition = mentor.group.getWorldPosition(new THREE.Vector3());
            if (avatar.target.distanceTo(mentorPosition) < 4.2) {
              mentor.eatUntil = performance.now() + 1_750;
              mentor.gesture = 'tail-wag';
              mentor.gestureUntil = performance.now() + 1_850;
            }
          }
        }
      }
    }
    this.syncSharedMentorCarrier();
    this.applyControlledNpcVisibility();
  }

  setOccupiedSeats(seatIds: string[]): void {
    this.occupiedSeats.clear();
    for (const seatId of seatIds) this.occupiedSeats.add(seatId);
  }

  forceStand(): void {
    if (this.playerState === 'seated') this.standUp();
  }

  /**
   * Tears down a venue's player. Video decode is the most expensive thing on
   * the page, so screens the attendee cannot see do not keep one running.
   */
  private releaseProjector(venue: VenueKey): void {
    const projector = this.projectors.get(venue);
    if (!projector?.iframe) return;
    // Note where the programme had got to before the player goes away, so the
    // next one can pick it up rather than start the work again.
    if (projector.youtubeId && projector.currentTime !== undefined && projector.currentTimeAt !== undefined) {
      this.playheads.set(venue, {
        youtubeId: projector.youtubeId,
        seconds: projector.currentTime + (performance.now() - projector.currentTimeAt) / 1000,
        at: Date.now(),
        duration: projector.duration,
      });
    }
    projector.element.replaceChildren();
    projector.iframe = undefined;
    projector.signature = undefined;
    projector.currentTime = undefined;
    projector.currentTimeAt = undefined;
  }

  /**
   * The venue whose player should be loading. Deliberately wider than the room
   * itself: a YouTube player has to fetch, hand-shake and buffer, and doing all
   * of that only once somebody is through the door is exactly the wait that was
   * noticeable on the way in. The club's lobby and stairs, the rooftop steps
   * and a few strides outside each theatre door give it that run-up, so the
   * picture is already running by the time they arrive. Once actually inside,
   * the exact answer wins, so a warmed neighbour never holds the room's own
   * screen off.
   */
  private projectorVenue(): VenueKey | undefined {
    return this.reviewProjectorVenue ?? this.activeProjectorVenue() ?? this.approachingVenue();
  }

  private approachingVenue(): VenueKey | undefined {
    const { x, z } = this.player.position;
    if (this.inClub(x, z)) return 'club';
    if (this.onRooftop(x, z)) return 'rooftop';
    const m = PROJECTOR_WARM_MARGIN;
    if (z < -30 + m && z > -45.2 - m && Math.abs(x) < 12 + m) return 'shore';
    if (x < -24 + m && x > -46 - m && z < -31 + m && z > -49.2 - m) return 'palace';
    if (x > 24 - m && x < 46 + m && z < -17 + m && z > -35.2 - m) return 'drive-in';
    return undefined;
  }

  /**
   * Mounts and releases players as somebody walks about. Without this the only
   * thing that started a screening was the festival pushing its programme
   * round, so entering a room meant waiting for that to come round again and
   * only then for the player to load — two waits stacked on each other.
   */
  private updateProjectorMounts(): void {
    const wanted = this.projectorVenue();
    if (wanted === this.mountedProjectorVenue) return;
    this.mountedProjectorVenue = wanted;
    for (const venue of this.projectors.keys()) {
      if (venue === wanted) continue;
      this.releaseProjector(venue);
    }
    if (!wanted) return;
    const pending = this.projectors.get(wanted)?.pending;
    if (pending) {
      this.setPublicScreening(wanted, pending.film, pending.offsetSeconds, pending.reloadToken);
    }
  }

  /** The venue whose screen is worth running a player for right now. */
  private activeProjectorVenue(): VenueKey | undefined {
    const { x, z } = this.player.position;
    if (this.inClub(x, z)) return this.inClubRoom(x, z) ? 'club' : undefined;
    if (this.onRooftop(x, z)) return 'rooftop';
    return this.inTheater() ? this.screeningVenue() : undefined;
  }

  setPublicScreening(
    venue: VenueKey,
    film: { id: string; title: string; embedUrl: string; youtubeId: string },
    offsetSeconds: number,
    reloadToken = '',
  ): void {
    const projector = this.projectors.get(venue);
    if (!projector) return;
    projector.pending = { film, offsetSeconds, reloadToken };
    if (venue !== this.projectorVenue()) {
      this.releaseProjector(venue);
      return;
    }
    const signature = `${film.id}|${reloadToken}`;
    if (projector.signature === signature) return;
    projector.filmId = film.id;
    projector.youtubeId = film.youtubeId;
    projector.signature = signature;
    const playerUrl = new URL(film.embedUrl.replace('youtube-nocookie.com', 'youtube.com'));
    playerUrl.searchParams.set('autoplay', '1');
    playerUrl.searchParams.set('mute', '1');
    playerUrl.searchParams.set('controls', '0');
    playerUrl.searchParams.set('playsinline', '1');
    playerUrl.searchParams.set('rel', '0');
    playerUrl.searchParams.set('enablejsapi', '1');
    playerUrl.searchParams.set('modestbranding', '1');
    playerUrl.searchParams.set('start', String(this.resumeOffset(venue, film.youtubeId, offsetSeconds)));
    if (window.location.origin !== 'null') playerUrl.searchParams.set('origin', window.location.origin);
    playerUrl.searchParams.set('widget_referrer', window.location.href);
    const iframe = document.createElement('iframe');
    iframe.title = `Public screening — ${film.title}`;
    iframe.src = playerUrl.toString();
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.tabIndex = -1;
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: `myschedule-${venue}` }), '*');
      iframe.contentWindow?.postMessage(JSON.stringify({
        event: 'command',
        func: projector.muted ? 'mute' : 'unMute',
        args: [],
      }), '*');
    });
    projector.element.replaceChildren(iframe);
    projector.iframe = iframe;
  }

  /**
   * Where to start a venue's player. A programme clock from the festival
   * service wins, because it is the same for everyone in the room. Without one
   * the offset arrives as zero, so fall back to where this venue had got to
   * when its player was last torn down, carried forward by the time since —
   * otherwise walking out and back in replays the work from the top.
   */
  private resumeOffset(venue: VenueKey, youtubeId: string, offsetSeconds: number): number {
    const scheduled = Math.max(0, Math.floor(offsetSeconds));
    if (scheduled > 0) return scheduled;
    const playhead = this.playheads.get(venue);
    if (!playhead || playhead.youtubeId !== youtubeId) return scheduled;
    const elapsed = playhead.seconds + (Date.now() - playhead.at) / 1000;
    if (!Number.isFinite(elapsed) || elapsed < 0) return scheduled;
    // Past the end of the work with no way to know what came next while the
    // player was gone, so wrap within it rather than seek out of range.
    const wrapped = playhead.duration && playhead.duration > 1 ? elapsed % playhead.duration : elapsed;
    return Math.max(0, Math.floor(wrapped));
  }

  /** The two lines on a venue's sign. Both are STAFF's to set. */
  setVenueName(venue: VenueKey, name: string, subtitle?: string): void {
    venueScreens[venue].label = name;
    const signMaterial = this.venueSignMaterials.get(venue);
    if (!signMaterial) return;
    const next = createTextTexture([name, subtitle ?? DEFAULT_VENUE_SUBTITLES[venue]]);
    const previous = signMaterial.map;
    signMaterial.map = next;
    signMaterial.needsUpdate = true;
    if (previous && previous !== next) previous.dispose();
  }

  /**
   * A phone stops whatever is playing the moment the browser goes away — a
   * message, a call, the screen locking — and does not start it again on the
   * way back. Coming back to a festival where every screen has quietly stopped
   * is the thing that made the screenings feel like they pause on a phone and
   * not on a desk.
   */
  private readonly resumeProjectorsOnReturn = (): void => {
    if (document.hidden) return;
    this.nudgeProjectorsToPlay();
  };

  /**
   * Any touch of the page is a chance a phone will now allow what it refused
   * before, since it wants a gesture behind playback. Throttled, because it
   * costs a message to each screen and fingers land often.
   */
  private readonly nudgeProjectorsOnGesture = (): void => {
    const now = performance.now();
    if (now - this.lastProjectorNudgeAt < 1_500) return;
    this.lastProjectorNudgeAt = now;
    this.nudgeProjectorsToPlay();
  };

  setPublicScreenPaused(venue: VenueKey, paused: boolean): void {
    const projector = this.projectors.get(venue);
    if (!projector) return;
    // Remembered, so that the nudges below never restart a venue STAFF have
    // deliberately stopped. Everything else may be woken; this may not.
    projector.paused = paused;
    projector.iframe?.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func: paused ? 'pauseVideo' : 'playVideo',
      args: [],
    }), '*');
  }

  /**
   * Ask every screen that should be running to run. A phone will not start a
   * video on its own account nearly as readily as a desk does — it stops them
   * when the browser goes away, declines to start them out of sight, and in
   * places wants a finger to have touched the page first — so rather than
   * assume one autoplay took, the festival asks again whenever something has
   * happened that might have changed the answer. Venues STAFF have stopped are
   * left stopped.
   */
  private nudgeProjectorsToPlay(): void {
    for (const projector of this.projectors.values()) {
      if (projector.paused) continue;
      projector.iframe?.contentWindow?.postMessage(JSON.stringify({
        event: 'command', func: 'playVideo', args: [],
      }), '*');
    }
  }

  setProgrammeBoard(
    venue: string,
    title: string,
    details: string,
    nextTitle: string,
  ): void {
    if (!this.programmeBoardMaterial) return;
    const texture = createProgrammeTexture(venue, title, details, nextTitle);
    const previous = this.programmeBoardMaterial.map;
    this.programmeBoardMaterial.map = texture;
    this.programmeBoardMaterial.needsUpdate = true;
    if (previous && previous !== texture) previous.dispose();
  }

  setPublicScreenMuted(audibleVenue: VenueKey | undefined, muted: boolean): void {
    for (const [venue, projector] of this.projectors) {
      const projectorMuted = muted || venue !== audibleVenue;
      if (projectorMuted === projector.muted) continue;
      projector.muted = projectorMuted;
      projector.iframe?.contentWindow?.postMessage(JSON.stringify({
        event: 'command',
        func: projectorMuted ? 'mute' : 'unMute',
        args: [],
      }), '*');
    }
  }

  /** Where the in-world projector currently is, so a screening can join it. */
  publicScreenTime(venue: VenueKey): number | undefined {
    const projector = this.projectors.get(venue);
    if (!projector || projector.currentTime === undefined || projector.currentTimeAt === undefined) return undefined;
    const drift = projector.playing === false ? 0 : (performance.now() - projector.currentTimeAt) / 1000;
    // A stale sample means the projector stopped reporting; do not guess.
    if (drift > 30) return undefined;
    return Math.max(0, projector.currentTime + drift);
  }

  setPublicScreenVolume(value: number): void {
    for (const projector of this.projectors.values()) {
      projector.iframe?.contentWindow?.postMessage(JSON.stringify({
        event: 'command',
        func: 'setVolume',
        args: [Math.round(THREE.MathUtils.clamp(value, 0, 1) * 100)],
      }), '*');
    }
  }

  fastTravel(destination: 'gate' | 'square' | 'palace' | 'drive-in' | 'shore' | 'club' | 'rooftop'): void {
    if (this.playerState === 'seated') this.standUp();
    const positions = {
      gate: new THREE.Vector3(0, AVATAR_GROUND_Y, GATE_Z - 6),
      square: new THREE.Vector3(0, AVATAR_GROUND_Y, 3),
      palace: new THREE.Vector3(-35, AVATAR_GROUND_Y, -34),
      'drive-in': new THREE.Vector3(35, AVATAR_GROUND_Y, -18),
      shore: new THREE.Vector3(0, AVATAR_GROUND_Y, -25),
      club: new THREE.Vector3(-15, AVATAR_GROUND_Y, 8.5 + CLUB_Z),
      rooftop: new THREE.Vector3(ROOFTOP_CENTER_X, AVATAR_GROUND_Y, 4),
    };
    this.player.position.copy(positions[destination]);
    this.setSwimming(false);
    this.setOutfit(false);
  }

  /**
   * Where an occupant's group origin goes for a given seat. Bar stools store
   * that point directly; the theatre chairs store the chair position and are
   * sat on from a little forward of it, at standing height.
   */
  private seatAnchor(seat: Seat): THREE.Vector3 {
    if (seat.kind === 'bar' || seat.kind === 'bench') return seat.position.clone();
    return seat.position.clone().add(new THREE.Vector3(0, AVATAR_GROUND_Y, 0.28));
  }

  interact(pickUpMentor = false): void {
    if (this.playerState === 'seated') {
      // SHIFT+E drinks without leaving the stool; plain E stands up.
      if (pickUpMentor && this.carriedItem === 'DRINK') {
        this.drinkUntil = performance.now() + 1_500;
        this.playerGesture = 'drink';
        this.playerGestureUntil = this.drinkUntil;
        this.carriedItem = undefined;
        this.syncCarriedPropAnchor();
        this.drinks += 1;
        if (this.drinks >= 3) this.drunkUntil = performance.now() + DRUNK_DURATION_MS;
        this.onAction({ type: 'drank', drinks: this.drinks, drunk: this.drinks >= 3 });
        return;
      }
      if (!pickUpMentor && this.nearClubBar() && !this.carriedItem) {
        this.carriedItem = 'DRINK';
        this.syncCarriedPropAnchor();
        this.pickupUntil = performance.now() + 700;
        this.onAction({ type: 'drinkOrdered' });
        return;
      }
      this.standUp();
      return;
    }

    // SHIFT+E is an explicit request for MENTOR, so it outranks the seat and
    // concession stand. MENTOR's route passes within reach of both, and the
    // ordinary priority order used to swallow every pickup attempt there.
    if (pickUpMentor) {
      const requestedMentor = this.nearbyMentor();
      if (requestedMentor) {
        this.pickUpMentor();
        return;
      }
    }

    const seat = this.nearestSeat();
    if (seat) {
      if (this.occupiedSeats.has(seat.id)) {
        this.onAction({ type: 'seatUnavailable', seatId: seat.id });
        return;
      }
      this.activeSeat = seat;
      this.playerState = 'seated';
      this.previousCameraMode = this.cameraMode === 'perspective' ? 'perspective' : 'follow';
      // A bar stool is not a seat in an auditorium: it keeps the orbit camera,
      // so dragging still looks around the room rather than locking onto a
      // screen nobody sat down to watch.
      this.cameraMode = 'screening';
      this.screeningOrbit.yaw = 0;
      this.screeningOrbit.pitch = 0;
      this.player.position.copy(this.seatAnchor(seat));
      this.player.rotation.y = seat.facing ?? Math.PI;
      this.onAction({ type: 'seated', seatId: seat.id, venue: seat.venue });
      return;
    }

    if (this.carriedItem === 'MENTOR') {
      this.putDownMentor();
      return;
    }

    if (this.carriedItem && EDIBLE_ITEMS.includes(this.carriedItem) && this.carriedItem !== 'DRINK') {
      this.playerGesture = 'drink';
      this.playerGestureUntil = performance.now() + 1_400;
      this.carriedItem = undefined;
      this.syncCarriedPropAnchor();
      this.onAction({ type: 'ate' });
      return;
    }

    if (pickUpMentor && this.carriedItem === 'DRINK') {
      this.drinkUntil = performance.now() + 1_500;
      this.playerGesture = 'drink';
      this.playerGestureUntil = this.drinkUntil;
      this.carriedItem = undefined;
      this.syncCarriedPropAnchor();
      this.drinks += 1;
      // Enough of them and the room starts to move on its own.
      if (this.drinks >= 3) this.drunkUntil = performance.now() + DRUNK_DURATION_MS;
      this.onAction({ type: 'drank', drinks: this.drinks, drunk: this.drinks >= 3 });
      return;
    }

    if (this.nearJukebox()) {
      this.onAction({ type: 'jukebox' });
      return;
    }

    if (this.nearShopCounter()) {
      this.onAction({ type: 'shop' });
      return;
    }

    if (this.nearClubBar()) {
      this.carriedItem = 'DRINK';
      this.stowedItem = undefined;
      this.syncCarriedPropAnchor();
      this.pickupUntil = performance.now() + 700;
      this.onAction({ type: 'drinkOrdered' });
      return;
    }
    if (this.player.position.distanceTo(concessionPosition) < 2.5) {
      this.carriedItem = 'POPCORN';
      this.syncCarriedPropAnchor();
      this.pickupUntil = performance.now() + 750;
      this.onAction({ type: 'food', item: 'POPCORN' });
      return;
    }

    // When MENTOR is loyal to the body being controlled he naturally stays in
    // feeding range all the time. A nearby attendee must outrank that permanent
    // dog prompt or the player can never greet anybody again. This is mirrored
    // in interactionLabel(), so the words and the action stay in agreement.
    const followerGreeting = this.mentorFollowsActiveAvatar() ? this.nearestSocialTarget() : undefined;
    if (followerGreeting) {
      this.greetSocialTarget(followerGreeting);
      return;
    }

    const mentor = this.nearbyMentor();
    // SHIFT+E still means the dog wherever you are standing — asking for him
    // explicitly should always reach him. Plain E gives way to the counter.
    if (mentor && (pickUpMentor || !this.mentorGivesWay())) {
      if (pickUpMentor) this.pickUpMentor();
      else this.feedMentor(mentor);
      return;
    }

    if (this.player.position.distanceTo(pamphletPosition) < 2.35) {
      this.hasPamphlet = true;
      this.onAction({ type: 'pamphlet' });
      return;
    }

    const dj = this.nearbyDj();
    if (dj) {
      this.player.rotation.set(0, Math.atan2(
        dj.group.position.x - this.player.position.x,
        dj.group.position.z - this.player.position.z,
      ), 0);
      this.onAction({ type: 'dj', name: dj.name, venue: dj.id === 'DRBEAUTY' ? 'rooftop' : 'club' });
      return;
    }

    const socialTarget = this.nearestSocialTarget();
    if (socialTarget) {
      this.greetSocialTarget(socialTarget);
      return;
    }

    if (this.player.position.distanceTo(programmeBoardPosition) < 7.2) {
      this.onAction({ type: 'programme' });
    }
  }

  private feedMentor(mentor: NpcAvatar): void {
    const now = performance.now();
    this.playerGesture = 'feed';
    this.playerGestureUntil = now + 1_650;
    mentor.eatUntil = now + 1_850;
    mentor.gesture = 'tail-wag';
    mentor.gestureUntil = now + 1_950;
    const mentorPosition = mentor.group.getWorldPosition(new THREE.Vector3());
    this.player.rotation.set(0, Math.atan2(
      mentorPosition.x - this.player.position.x,
      mentorPosition.z - this.player.position.z,
    ), 0);
    if (mentor.group.parent === this.scene) {
      mentor.group.rotation.y = Math.atan2(
        this.player.position.x - mentorPosition.x,
        this.player.position.z - mentorPosition.z,
      );
    }
    this.onAction({ type: 'treat', target: mentor.name });
  }

  private greetSocialTarget(target: { name: string; npc?: NpcAvatar; remote?: RemoteAvatar }): void {
    const now = performance.now();
    const gesture: 'wave' | 'tail-wag' = this.controlledNpcId === 'MENTOR' ? 'tail-wag' : 'wave';
    this.playerGesture = gesture;
    this.playerGestureUntil = now + 1_400;
    if (target.npc) {
      target.npc.gesture = target.npc.id === 'MENTOR' ? 'tail-wag' : 'wave';
      target.npc.gestureUntil = now + 1_600;
    }
    if (target.remote) {
      target.remote.gesture = 'wave';
      target.remote.gestureUntil = now + 1_600;
    }
    const targetPosition = target.npc?.group.position ?? target.remote?.group.position;
    if (targetPosition) {
      this.player.rotation.set(0, Math.atan2(
        targetPosition.x - this.player.position.x,
        targetPosition.z - this.player.position.z,
      ), 0);
    }
    this.onAction({ type: 'greet', target: target.name, gesture });
  }

  private readonly resize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const aspect = width / Math.max(height, 1);
    this.camera.aspect = aspect;
    // Widened as the frame narrows, so turning a phone upright shows more of
    // the world rather than a taller slice of the same slot. Not the full
    // correction — that reaches a hundred and thirty degrees on a phone and
    // bends every straight edge in the festival — but enough that the street
    // reads. Landscape is left exactly as it was.
    this.baseFov = aspect >= PORTRAIT_ASPECT
      ? 58
      : Math.min(74, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(29)) * PORTRAIT_ASPECT / Math.max(aspect, 0.3))));
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.foregroundRenderer.setSize(width, height, false);
    this.cssRenderer.setSize(width, height);
  };

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const key = event.key.toLowerCase();
    this.running = event.shiftKey;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
      event.preventDefault();
      this.keys.add(key);
      if (!event.repeat && this.playerState !== 'seated') {
        const horizontal = Number(key === 'd' || key === 'arrowright') - Number(key === 'a' || key === 'arrowleft');
        const vertical = Number(key === 's' || key === 'arrowdown') - Number(key === 'w' || key === 'arrowup');
        this.movePlayer(horizontal, vertical, this.playerState === 'swimming' ? 0.12 : 0.2);
      }
    }
    if (key === ' ' && !event.repeat) {
      event.preventDefault();
      this.jump();
    }
    if (key === 'b' && !event.repeat) this.toggleDancing();
    if (key === 'o' && !event.repeat) this.donate();
    if (key === 't' && !event.repeat) this.toggleCameraMode();
    if (key === 'e' && !event.repeat) this.interact(event.shiftKey);
  };

  /**
   * A standing jump. Refused while seated or swimming, and while already in
   * the air, so it cannot be used to climb by repetition.
   */
  /** The touch pad's jump button. SPACE reaches jump() directly. */
  /**
   * The ring of buttons a phone gets in place of a keyboard. Each one is the
   * key it stands for, so there is nothing a thumb cannot reach that a desk
   * can.
   */
  setPhotographing(active: boolean): void {
    this.photographing = active;
  }

  punchFromTouch(): void {
    this.punch();
  }

  offerFromTouch(): void {
    this.donate();
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  jumpFromTouch(): void {
    this.jump();
  }

  private jump(): void {
    if (this.playerState === 'seated' || this.playerState === 'swimming') return;
    if (this.airborne || this.isMentorControlLocked()) return;
    if (performance.now() < this.stumbleUntil) return;
    this.dancing = false;
    this.airborne = true;
    this.verticalVelocity = JUMP_SPEED;
    this.playerGesture = 'jump';
    this.playerGestureUntil = performance.now() + 900;
    this.onAction({ type: 'jump' });
  }

  /**
   * An offering: to 美麗本人 when stood before the altar, otherwise to whoever
   * is nearest. Nothing is counted or kept — the bow is the whole of it.
   */
  private donate(): void {
    if (this.playerState === 'swimming' || this.airborne) return;
    const now = performance.now();
    if (now - this.lastDonationAt < 1_200) return;
    const atAltar = this.atTheAltar();
    let target: string | undefined;
    if (!atAltar) {
      const npc = this.nearestNpcWithin(5.2);
      if (!npc) return;
      target = npc.name;
      // They bow back, which is the only reply an offering needs.
      npc.gesture = 'bow';
      npc.gestureUntil = now + 1_500;
    }
    this.lastDonationAt = now;
    this.dancing = false;
    this.playerGesture = 'offer';
    this.playerGestureUntil = now + 1_500;
    this.onAction({ type: 'donate', target, deity: target ? undefined : this.templeSignText.name });
  }

  /** The nearest resident within reach and in front, never one behind. */
  private nearestNpcInFront(reach: number): NpcAvatar | undefined {
    const facingX = Math.sin(this.player.rotation.y);
    const facingZ = Math.cos(this.player.rotation.y);
    let nearest: NpcAvatar | undefined;
    let closest = reach;
    for (const npc of this.npcs) {
      if (npc.id === this.controlledNpcId) continue;
      const dx = npc.group.position.x - this.player.position.x;
      const dz = npc.group.position.z - this.player.position.z;
      if (Math.abs(npc.group.position.y - this.player.position.y) > 2.6) continue;
      const distance = Math.hypot(dx, dz);
      if (distance > closest || distance < 0.001) continue;
      if ((dx / distance) * facingX + (dz / distance) * facingZ < 0.55) continue;
      closest = distance;
      nearest = npc;
    }
    return nearest;
  }

  /**
   * The nearest other attendee in front of the thrower, judged on where their
   * body is drawn rather than where it was last reported from.
   */
  private nearestVisitorInFront(reach: number): { id: string; name: string } | undefined {
    const facingX = Math.sin(this.player.rotation.y);
    const facingZ = Math.cos(this.player.rotation.y);
    let nearest: { id: string; name: string } | undefined;
    let closest = reach;
    for (const [id, avatar] of this.remoteAvatars) {
      if (!avatar.group.visible) continue;
      const dx = avatar.group.position.x - this.player.position.x;
      const dz = avatar.group.position.z - this.player.position.z;
      if (Math.abs(avatar.group.position.y - this.player.position.y) > 2.6) continue;
      const distance = Math.hypot(dx, dz);
      if (distance > closest || distance < 0.001) continue;
      if ((dx / distance) * facingX + (dz / distance) * facingZ < 0.55) continue;
      closest = distance;
      nearest = { id, name: avatar.name };
    }
    return nearest;
  }

  private nearestNpcWithin(reach: number): NpcAvatar | undefined {
    let nearest: NpcAvatar | undefined;
    let nearestDistance = reach;
    for (const npc of this.npcs) {
      if (npc.id === this.controlledNpcId) continue;
      const distance = npc.group.position.distanceTo(this.player.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = npc;
      }
    }
    return nearest;
  }

  private readonly keyUp = (event: KeyboardEvent): void => {
    this.running = event.shiftKey;
    this.keys.delete(event.key.toLowerCase());
  };

  private readonly suppressContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly cameraPointerDown = (event: PointerEvent): void => {
    // Pen and touch turn the camera and throw punches too; only the mouse's
    // other buttons are left alone.
    if (event.button !== 0) return;
    event.preventDefault();
    this.cameraDragging = true;
    if (event.pointerType !== 'mouse') {
      this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // A second finger is a pinch, not a punch and not a turn. Turning stops
      // so the view does not lurch as the hand spreads, and the punch is
      // cancelled by moving its origin out of tapping range.
      if (this.touchPoints.size === 2) {
        const [a, b] = [...this.touchPoints.values()];
        this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        this.cameraDragging = false;
        this.punchPointerX = Number.NaN;
      }
    }
    this.cameraPointerId = event.pointerId;
    this.cameraPointerX = event.clientX;
    this.cameraPointerY = event.clientY;
    this.punchPointerX = event.clientX;
    this.punchPointerY = event.clientY;
    this.canvas.classList.add('is-camera-dragging');
    this.canvas.setPointerCapture?.(event.pointerId);
  };

  private readonly cameraPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' && this.touchPoints.has(event.pointerId)) {
      this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.touchPoints.size >= 2) {
        const [a, b] = [...this.touchPoints.values()];
        const spread = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDistance > 0 && spread > 0 && this.cameraMode !== 'screening' && this.cameraMode !== 'first-person') {
          // Fingers apart pulls the camera in, the way a pinch zooms a photo.
          this.cameraZoom = THREE.MathUtils.clamp(
            this.cameraZoom * (this.pinchDistance / spread),
            CAMERA_ZOOM_MIN,
            CAMERA_ZOOM_MAX,
          );
          this.rememberZoom();
        }
        this.pinchDistance = spread;
        event.preventDefault();
        return;
      }
    }
    // Touch and pen turn the camera as the mouse does — the handler that put
    // this pointer down said as much, but this one used to hand every finger
    // straight back, so a phone could walk but never look.
    if (!this.cameraDragging || event.pointerId !== this.cameraPointerId) return;
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      this.cameraPointerReset();
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - this.cameraPointerX;
    const deltaY = event.clientY - this.cameraPointerY;
    this.cameraPointerX = event.clientX;
    this.cameraPointerY = event.clientY;
    if (Math.abs(deltaX) > 180 || Math.abs(deltaY) > 180) return;
    if (this.cameraMode === 'screening') {
      this.screeningOrbit.yaw = THREE.MathUtils.clamp(this.screeningOrbit.yaw - deltaX * 0.0034, -1.5, 1.5);
      this.screeningOrbit.pitch = THREE.MathUtils.clamp(this.screeningOrbit.pitch + deltaY * 0.0028, -0.3, 0.28);
      return;
    }
    const orbit = this.cameraOrbit[this.cameraMode === 'perspective' ? 'perspective' : 'follow'];
    orbit.yaw -= deltaX * 0.0042;
    // First person looks level and can tip below the horizon; the orbit
    // cameras sit above the avatar and must stay there — except on a seat,
    // where the screen is high on a far wall and a camera pinned above the
    // eyeline can never be tilted up far enough to find it.
    // In the water the view is held at one height and only turns. Tilting the
    // eye down towards the surface is what made the sea fill the whole frame,
    // so the pitch is not the attendee's to change while swimming.
    if (this.playerState === 'swimming') {
      orbit.pitch = SWIM_CAMERA_PITCH;
      return;
    }
    // On land the orbit cameras used to be held between 0.12 and 1.08 — barely
    // seven degrees below the top of the arc and never able to look up at a
    // roofline or down over an edge. The floor of that range existed because a
    // camera swung below the avatar ends up in the road; now that the view is
    // pulled clear of whatever it meets, including the ground, it can go where
    // it is pointed. Kept off the poles, where the horizon rolls over.
    const lowestPitch = this.playerState === 'seated' ? -0.6 : -0.5;
    orbit.pitch = this.cameraMode === 'first-person'
      ? THREE.MathUtils.clamp(orbit.pitch + deltaY * 0.0035, -1.25, 1.32)
      : THREE.MathUtils.clamp(orbit.pitch + deltaY * 0.0035, lowestPitch, 1.36);
  };

  /**
   * Wheel and trackpad pinch pull the camera in and push it out. A pinch on a
   * trackpad reaches the page as a wheel event with ctrlKey set, and moves in
   * much smaller steps than a mouse notch, so it is scaled up to feel the same
   * under either hand.
   */
  private readonly cameraWheel = (event: WheelEvent): void => {
    // Seated at a screen and in first person the distance is not the
    // attendee's to set: one is framed on the screen, the other is an eyeline.
    if (this.cameraMode === 'screening' || this.cameraMode === 'first-person') return;
    event.preventDefault();
    // Wheel deltas arrive in lines or pages depending on the device.
    const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    // Calibrated so the whole range takes about twenty-five notches of a mouse
    // wheel rather than four. A trackpad sends many small deltas per gesture
    // and a pinch sends smaller ones still, so the pinch is scaled up to cover
    // the same ground in one comfortable movement.
    const step = event.deltaY * lines * (event.ctrlKey ? 0.006 : 0.0005);
    this.cameraZoom = THREE.MathUtils.clamp(this.cameraZoom * Math.exp(step), CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
    this.rememberZoom();
  };

  private rememberZoom(): void {
    try {
      window.localStorage.setItem(CAMERA_ZOOM_KEY, String(this.cameraZoom));
    } catch {
      // Not being able to remember it is not worth interrupting anyone over.
    }
  }

  private readonly cameraPointerUp = (event: PointerEvent): void => {
    if (this.touchPoints.delete(event.pointerId)) {
      // Coming off a pinch, whichever finger stays down starts a fresh drag
      // from where it is rather than snapping the view to the old origin.
      this.pinchDistance = 0;
      const remaining = [...this.touchPoints.entries()][0];
      if (remaining) {
        this.cameraPointerId = remaining[0];
        this.cameraPointerX = remaining[1].x;
        this.cameraPointerY = remaining[1].y;
        this.cameraDragging = true;
        return;
      }
    }
    if (event.pointerId !== this.cameraPointerId) return;
    // The same button turns the camera, so only a click that stayed put counts
    // as a punch — a drag is someone looking around.
    const travelled = Math.hypot(event.clientX - this.punchPointerX, event.clientY - this.punchPointerY);
    // Not while a picture is being composed. In a camera mode a tap on the
    // frame is somebody adjusting the shot, and answering it with a fist put a
    // swinging arm through the middle of the photograph they were taking.
    if (event.button === 0 && travelled < 8 && !Number.isNaN(this.punchPointerX) && !this.photographing) this.punch();
    this.cameraPointerReset();
  };

  /** A jab. Whoever is in front of it is told by the service, not by us. */
  private punch(): void {
    if (this.playerState === 'seated' || this.playerState === 'swimming') return;
    if (this.isMentorControlLocked()) return;
    const now = performance.now();
    if (now - this.lastPunchAt < 620) return;
    this.lastPunchAt = now;
    this.dancing = false;
    this.playerGesture = 'punch';
    this.playerGestureUntil = now + (GESTURE_SPAN_MS.punch ?? 560);
    // Residents are ours to settle: they exist only in this client, so unlike a
    // blow aimed at another attendee there is nobody else to arbitrate it.
    // A small kick as the arm leaves, so the click is answered at once, and the
    // real jolt held back until the fist arrives. Nearly all of what makes a
    // blow feel heavy is that gap: a quiet wind-up and then a crack.
    this.cameraShake = Math.min(1.4, this.cameraShake + 0.1);
    const npc = this.nearestNpcInFront(3.2);
    // Residents are ours to settle: they exist only in this client.
    this.punchImpactAt = now + PUNCH_CONTACT_MS;
    this.punchImpactPower = npc ? 0.5 : 0.16;
    this.punchImpactNpc = npc;
    if (npc) {
      // The recoil is scheduled rather than played now. gestureProgress clamps
      // below zero, so an end set beyond its own span simply holds the body at
      // rest until contact — the resident does not fold up before being hit.
      npc.gesture = 'hit';
      npc.gestureUntil = now + PUNCH_CONTACT_MS + (GESTURE_SPAN_MS.hit ?? 620);
      // Knocked out of whatever they were doing, and off their route for a
      // moment, so the blow reads as landing rather than passing through.
      npc.waitUntil = now + PUNCH_CONTACT_MS + 700;
    }
    // Whoever the thrower can actually see in front of them. The service holds
    // positions that are up to a fifth of a second old and only sent while
    // something changes, so at a walk its picture of a moving body trails the
    // one on screen by a couple of units and at a run by five — further than
    // the reach itself. Aiming at what is drawn, and letting the service check
    // the pair are plausibly close rather than recompute the aim, is the only
    // version of this that answers to what the thrower saw.
    const struck = this.nearestVisitorInFront(3.2);
    if (struck) this.punchImpactPower = Math.max(this.punchImpactPower, 0.5);
    this.onAction({ type: 'punch', struck: npc?.name, targetId: struck?.id });
  }

  /**
   * Taking one: the view is jolted, the body is thrown off the blow's line, the
   * legs go for half a second, and anything carried is let go of. `fromX`/
   * `fromZ` are where the punch was thrown from; without them the body is
   * thrown straight backwards.
   */
  takeHit(by?: string, fromX?: number, fromZ?: number): void {
    const now = performance.now();
    this.playerGesture = 'hit';
    this.playerGestureUntil = now + 620;
    this.dancing = false;
    // Taking one is the loudest thing that happens to an attendee, so it gets
    // the largest jolt in the world — more than the landing from a rooftop.
    this.cameraShake = Math.min(1.8, this.cameraShake + 1.15);
    // Thrown away from whoever swung. Falling back on the facing keeps this
    // working against an older service that does not send the origin.
    const away = new THREE.Vector3();
    if (fromX !== undefined && fromZ !== undefined) {
      away.set(this.player.position.x - fromX, 0, this.player.position.z - fromZ);
    }
    if (away.lengthSq() < 0.0001) {
      away.set(-Math.sin(this.player.rotation.y), 0, -Math.cos(this.player.rotation.y));
    }
    this.knockback.copy(away.normalize()).multiplyScalar(9.6);
    // Off balance rather than frozen: movement still answers, at the same
    // reduced pace a bad landing costs, so nobody is held still to be hit again.
    this.stumbleUntil = Math.max(this.stumbleUntil, now + 520);
    const droppedMentor = this.carriedItem === 'MENTOR';
    if (droppedMentor) this.putDownMentor();
    this.onAction({ type: 'punched', droppedMentor, by });
  }

  /**
   * Going down. The body is put on the floor, everything it held is let go of,
   * and it wakes at the altar.
   *
   * There is no meter for this anywhere and there is not meant to be: what
   * tells an attendee they are in trouble is that the last two blows shook the
   * frame harder than the first three, and then the world goes out. Coming back
   * in the temple is the whole of the punishment — the walk from the east edge
   * of the festival to wherever they were is a long one.
   */
  die(by?: string): void {
    const now = performance.now();
    this.dancing = false;
    this.playerGesture = 'stumble';
    this.playerGestureUntil = now + 1_600;
    this.cameraShake = 1.8;
    this.knockback.set(0, 0, 0);
    if (this.carriedItem === 'MENTOR') this.putDownMentor();
    this.carriedItem = undefined;
    this.stowedItem = undefined;
    this.carriedProp.visible = false;
    if (this.playerState === 'seated') this.standUp();
    // Held on the floor for the length of the blackout, then set down before
    // the altar facing her, which is the one place in the festival that reads
    // as somewhere you are returned to rather than somewhere you walked.
    this.stumbleUntil = now + 2_200;
    window.setTimeout(() => this.respawnAtTemple(), 1_250);
    this.onAction({ type: 'died', by });
  }

  private respawnAtTemple(): void {
    const centerZ = (TEMPLE.minZ + TEMPLE.maxZ) / 2;
    const x = TEMPLE.maxX - 13;
    this.player.position.set(x, TEMPLE_FLOOR_Y, centerZ);
    this.airborne = false;
    this.verticalVelocity = 0;
    this.knockback.set(0, 0, 0);
    // Facing the altar, which is east of here.
    this.player.rotation.y = Math.PI / 2;
    this.cameraOrbit.follow.yaw = -Math.PI / 2;
    this.cameraOrbit.perspective.yaw = -Math.PI / 2;
    // The camera is eased towards its mark every frame; without this it flies
    // the length of the festival to catch up with a body that has just been
    // moved across it.
    this.camera.position.set(x - 9, TEMPLE_FLOOR_Y + 4.4, centerZ);
  }

  /** Releasing focus mid-stride would otherwise leave the avatar running. */
  private readonly clearRunning = (): void => {
    this.running = false;
  };

  private readonly cameraPointerReset = (): void => {
    if (this.cameraPointerId !== undefined && this.canvas.hasPointerCapture?.(this.cameraPointerId)) {
      this.canvas.releasePointerCapture?.(this.cameraPointerId);
    }
    this.cameraDragging = false;
    this.cameraPointerId = undefined;
    this.touchPoints.clear();
    this.pinchDistance = 0;
    this.canvas.classList.remove('is-camera-dragging');
  };

  private readonly projectorMessage = (event: MessageEvent): void => {
    if (!String(event.origin).includes('youtube.com') && !String(event.origin).includes('youtube-nocookie.com')) return;
    let payload: {
      event?: string;
      info?: number | { playerState?: number; errorCode?: number; currentTime?: number; duration?: number };
    };
    try {
      payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    const info = typeof payload.info === 'object' ? payload.info : undefined;
    if (info && typeof info.duration === 'number' && info.duration > 0) {
      for (const [venue, projector] of this.projectors) {
        if (!projector.iframe || projector.iframe.contentWindow !== event.source) continue;
        projector.duration = info.duration;
        if (projector.youtubeId) this.onProjectorDuration?.(venue, projector.youtubeId, info.duration);
        break;
      }
    }
    if (info && typeof info.currentTime === 'number') {
      // The projector is the only thing that knows where the public screening
      // actually is. Record it so a maximized screening can join in progress.
      for (const projector of this.projectors.values()) {
        if (!projector.iframe || projector.iframe.contentWindow !== event.source) continue;
        projector.currentTime = info.currentTime;
        projector.currentTimeAt = performance.now();
        if (typeof info.playerState === 'number') projector.playing = info.playerState === 1;
        break;
      }
    }
    const ended = (payload.event === 'onStateChange' && payload.info === 0) ||
      (payload.event === 'infoDelivery' && info?.playerState === 0);
    const unavailable = payload.event === 'onError' || Boolean(info?.errorCode);
    if (!ended && !unavailable) return;
    for (const [venue, projector] of this.projectors) {
      if (!projector.iframe || projector.iframe.contentWindow !== event.source || !projector.youtubeId) continue;
      const now = performance.now();
      if (projector.lastAdvanceAt && now - projector.lastAdvanceAt < 1800) return;
      projector.lastAdvanceAt = now;
      this.onProjectorAdvance?.(venue, projector.youtubeId);
      return;
    }
  };

  private mainPixelRatio(): number {
    return Math.min(window.devicePixelRatio, this.graphicsMode === 'normal' ? 1.25 : 0.7);
  }

  private foregroundPixelRatio(): number {
    // Matched to the main renderer. This pass redraws the same geometry over
    // the finished picture, and the two only agree if they are shaded at the
    // same resolution: at 0.78 against 1.25 the shadow bias, which is tuned for
    // the main pass, came out as self-shadowing here — a rectangle of dimmed
    // scene the shape of the scissor box, which is the block over the timetable.
    // The pass only ever covers the screens' own rectangles, so this costs a
    // fraction of a full-frame render.
    return this.mainPixelRatio();
  }

  private projectorScissor(venue: VenueKey): { x: number; y: number; width: number; height: number } | undefined {
    const screen = venueScreens[venue];
    const viewportWidth = this.foregroundCanvas.clientWidth || window.innerWidth;
    const viewportHeight = this.foregroundCanvas.clientHeight || window.innerHeight;
    const halfWidth = 800 * screen.scale;
    const halfHeight = 450 * screen.scale;
    const [x, y, z] = screen.position;
    this.projectorCorners[0].set(x - halfWidth, y - halfHeight, z);
    this.projectorCorners[1].set(x + halfWidth, y - halfHeight, z);
    this.projectorCorners[2].set(x - halfWidth, y + halfHeight, z);
    this.projectorCorners[3].set(x + halfWidth, y + halfHeight, z);
    let minX = viewportWidth;
    let minY = viewportHeight;
    let maxX = 0;
    let maxY = 0;
    let behindCamera = false;
    for (const corner of this.projectorCorners) {
      // A corner behind the camera comes back through project() with its sign
      // flipped, and the box built from it is nonsense — usually far too small.
      // That is the hole the panel was painting through: outside this box
      // nothing is redrawn over it, so it showed raw.
      this.projectorCornerView.copy(corner).applyMatrix4(this.camera.matrixWorldInverse);
      if (this.projectorCornerView.z > -0.05) behindCamera = true;
      corner.project(this.camera);
      const pixelX = (corner.x * 0.5 + 0.5) * viewportWidth;
      const pixelY = (corner.y * 0.5 + 0.5) * viewportHeight;
      minX = Math.min(minX, pixelX);
      minY = Math.min(minY, pixelY);
      maxX = Math.max(maxX, pixelX);
      maxY = Math.max(maxY, pixelY);
    }
    // The browser is the authority on where it actually paints the panel, so
    // the box is never allowed to be smaller than the element's own rectangle.
    const panel = this.projectors.get(venue)?.element.getBoundingClientRect();
    if (panel && panel.width > 0 && panel.height > 0) {
      minX = Math.min(minX, panel.left);
      maxX = Math.max(maxX, panel.right);
      // The element's rectangle counts down the page; the scissor counts up.
      minY = Math.min(minY, viewportHeight - panel.bottom);
      maxY = Math.max(maxY, viewportHeight - panel.top);
    }
    if (behindCamera) {
      // Part of the screen is beside or behind the viewer, so the corners are
      // meaningless. Draw nothing rather than guess: this pass paints geometry
      // over the main render, so an oversized box is not a safe default — it
      // lays a washed-out copy of the scene across everything it covers.
      return undefined;
    }
    const padding = 24;
    const left = Math.max(0, Math.floor(minX - padding));
    const bottom = Math.max(0, Math.floor(minY - padding));
    const right = Math.min(viewportWidth, Math.ceil(maxX + padding));
    const top = Math.min(viewportHeight, Math.ceil(maxY + padding));
    if (right <= left || top <= bottom) return undefined;
    return { x: left, y: bottom, width: right - left, height: top - bottom };
  }

  /**
   * The projector compositor normally redraws only the rectangle occupied by
   * the CSS video. When that rectangle cuts across the timetable, the same
   * board is consequently split between the main and foreground renderers and
   * the renderer boundary becomes visible. This tight box lets us detect that
   * overlap and suppress the hidden projector composite altogether.
   */
  private programmeBoardScissor(): { x: number; y: number; width: number; height: number } | undefined {
    const viewportWidth = this.foregroundCanvas.clientWidth || window.innerWidth;
    const viewportHeight = this.foregroundCanvas.clientHeight || window.innerHeight;
    const halfWidth = programmeBoardSize.width / 2;
    const halfHeight = programmeBoardSize.height / 2;
    const halfDepth = programmeBoardSize.depth / 2;
    let minX = viewportWidth;
    let minY = viewportHeight;
    let maxX = 0;
    let maxY = 0;
    let cornerIndex = 0;
    for (const x of [-halfWidth, halfWidth]) {
      for (const y of [programmeBoardCenterY - halfHeight, programmeBoardCenterY + halfHeight]) {
        for (const z of [programmeBoardPosition.z - halfDepth, programmeBoardPosition.z + halfDepth]) {
          const corner = this.programmeBoardCorners[cornerIndex++];
          corner.set(programmeBoardPosition.x + x, y, z);
          this.projectorCornerView.copy(corner).applyMatrix4(this.camera.matrixWorldInverse);
          if (this.projectorCornerView.z > -0.05) return undefined;
          corner.project(this.camera);
          const pixelX = (corner.x * 0.5 + 0.5) * viewportWidth;
          const pixelY = (corner.y * 0.5 + 0.5) * viewportHeight;
          minX = Math.min(minX, pixelX);
          minY = Math.min(minY, pixelY);
          maxX = Math.max(maxX, pixelX);
          maxY = Math.max(maxY, pixelY);
        }
      }
    }
    const padding = 8;
    const left = Math.max(0, Math.floor(minX - padding));
    const bottom = Math.max(0, Math.floor(minY - padding));
    const right = Math.min(viewportWidth, Math.ceil(maxX + padding));
    const top = Math.min(viewportHeight, Math.ceil(maxY + padding));
    if (right <= left || top <= bottom) return undefined;
    return { x: left, y: bottom, width: right - left, height: top - bottom };
  }

  private programmeBoardIsInFrontOfProjector(venue: VenueKey): boolean {
    this.programmeBoardViewPosition
      .set(programmeBoardPosition.x, programmeBoardCenterY, programmeBoardPosition.z)
      .applyMatrix4(this.camera.matrixWorldInverse);
    this.projectorViewPosition.set(...venueScreens[venue].position).applyMatrix4(this.camera.matrixWorldInverse);
    // Camera-space objects in front have a negative z; the value closer to
    // zero is nearer to the camera. Unlike a world-z comparison, this remains
    // correct when the attendee orbits the camera around the board.
    return this.programmeBoardViewPosition.z > this.projectorViewPosition.z + 0.05;
  }

  private scissorsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y;
  }

  private applyRenderPixelRatios(): void {
    this.renderer.setPixelRatio(this.mainPixelRatio() * this.adaptiveRenderScale);
    this.foregroundRenderer.setPixelRatio(this.foregroundPixelRatio() * this.adaptiveRenderScale);
  }

  private tuneRenderScale(now: number): void {
    if (this.graphicsMode !== 'normal') return;
    this.performanceFrameCount += 1;
    const elapsed = now - this.performanceWindowStartedAt;
    if (elapsed < 3500) return;
    const framesPerSecond = (this.performanceFrameCount * 1000) / elapsed;
    if (framesPerSecond < 44 && this.adaptiveRenderScale > 0.67) {
      this.adaptiveRenderScale = Math.max(0.67, this.adaptiveRenderScale - 0.16);
      this.applyRenderPixelRatios();
    }
    this.performanceWindowStartedAt = now;
    this.performanceFrameCount = 0;
  }

  private mesh(
    size: [number, number, number],
    position: [number, number, number],
    meshMaterial: THREE.Material,
    parent: THREE.Object3D = this.scene,
  ): THREE.Mesh {
    const object = new THREE.Mesh(boxGeometry, meshMaterial);
    object.scale.set(...size);
    object.position.set(...position);
    // Casting is opt-in. Every caster is re-drawn into the sun's shadow map
    // each frame, so a world-wide default doubled the scene's draw calls.
    object.castShadow = false;
    object.receiveShadow = this.graphicsMode === 'normal';
    parent.add(object);
    return object;
  }

  /** Marks a group's meshes as shadow casters, for the few that earn it. */
  private castShadows(root: THREE.Object3D): void {
    root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) object.castShadow = this.graphicsMode === 'normal';
    });
  }

  private addCollider(
    x: number,
    z: number,
    width: number,
    depth: number,
    padding = 0.35,
    heights?: { minY: number; maxY: number },
    label?: string,
    // How high the thing actually stands, when that is not the same as the band
    // it is refused in. Those bands say which storey a collider belongs to —
    // the club's booth is given the room's whole height so that a body on the
    // street above is not stopped by it — and that is not a claim about how
    // tall the object is. The camera needs the second question answered: a
    // waist-high desk described as floor-to-ceiling shoved the view into it.
    viewTop?: number,
  ): void {
    this.colliders.push({
      label,
      minX: x - width / 2 - padding,
      maxX: x + width / 2 + padding,
      minZ: z - depth / 2 - padding,
      maxZ: z + depth / 2 + padding,
      minY: heights?.minY,
      maxY: heights?.maxY,
      viewTop,
    });
  }

  private createProjectorSurface(venue: VenueKey): void {
    const screen = venueScreens[venue];
    const element = document.createElement('div');
    element.className = `public-projector public-projector--${venue}`;
    element.setAttribute('aria-label', `${screen.label} public projector screen`);
    element.style.pointerEvents = 'none';
    const object = new CSS3DObject(element);
    object.position.set(...screen.position);
    if (screen.facing === -1) object.rotation.y = Math.PI;
    object.scale.setScalar(screen.scale);
    this.cssScene.add(object);
    this.projectors.set(venue, { element, object, muted: true });
  }

  private addSpotlight(
    position: [number, number, number],
    target: [number, number, number],
    intensityScale: number,
    distance: number,
    castsShadow: boolean,
    color = 0xffc782,
  ): THREE.SpotLight {
    const spotlight = new THREE.SpotLight(color, 0, distance, Math.PI * 0.27, 0.68, 1.45);
    spotlight.position.set(...position);
    spotlight.target.position.set(...target);
    spotlight.castShadow = castsShadow && this.graphicsMode === 'normal';
    spotlight.shadow.mapSize.set(512, 512);
    spotlight.shadow.camera.near = 0.4;
    spotlight.shadow.camera.far = distance;
    spotlight.shadow.bias = -0.0012;
    spotlight.shadow.normalBias = 0.035;
    this.scene.add(spotlight, spotlight.target);
    this.dayNight.addLampLight(spotlight, intensityScale);
    if (castsShadow) this.shadowSpotlights.push(spotlight);
    return spotlight;
  }

  private createLampPost(
    x: number,
    z: number,
    lampMaterial: THREE.MeshStandardMaterial,
    castsShadow: boolean,
    height = 4.8,
    targetX = x,
  ): void {
    this.mesh([0.18, height, 0.18], [x, height / 2, z], material(0x2b2c30, 0.55, 0.7));
    this.mesh([0.62, 0.48, 0.62], [x, height + 0.05, z], lampMaterial);
    this.addCollider(x, z, 0.28, 0.28, 0.18, { minY: -0.4, maxY: 40 });
    // Every post is a light source, but the lights themselves come from a
    // fixed pool that follows the attendee. A dedicated light per post would
    // put the count back where it was tanking the frame rate.
    this.lampPosts.push({ x, z, height, targetX, castsShadow });
  }

  /**
   * Hands the pooled lamp lights to the nearest posts. The pool is small and
   * constant, so the whole promenade reads as lit without the per-pixel cost
   * of a light for every post in the world.
   */
  private updateLampPool(): void {
    if (!this.lampPool.length || !this.lampPosts.length) return;
    const now = performance.now();
    if (now - this.lampPoolAt < 400) return;
    this.lampPoolAt = now;
    const ranked = [...this.lampPosts]
      .map((post) => ({
        post,
        distance: (post.x - this.player.position.x) ** 2 + (post.z - this.player.position.z) ** 2,
      }))
      .sort((first, second) => first.distance - second.distance);
    this.lampPool.forEach((light, index) => {
      const nearest = ranked[index];
      if (!nearest) {
        light.visible = false;
        return;
      }
      light.visible = true;
      light.position.set(nearest.post.x, nearest.post.height, nearest.post.z);
      light.target.position.set(nearest.post.targetX, 0, nearest.post.z - 0.9);
      light.target.updateMatrixWorld();
    });
  }

  private createEnvironment(): void {
    const groundMaterial = material(0x34312d);
    const c = clubBounds;
    const terrain: Array<[number, number, number, number]> = [
      // [minX, maxX, minZ, maxZ] — four pieces leaving the club's plot open.
      [-104, c.buildingMinX, -49, 81],
      // Reaches past the temple with room to spare. It used to stop at 92,
      // which left the eastern third of the building — and its roof overhang —
      // hanging over the edge of the world.
      [c.buildingMaxX, 124, -49, 81],
      [c.buildingMinX, c.buildingMaxX, -49, c.buildingMinZ],
      [c.buildingMinX, c.buildingMaxX, c.buildingMaxZ, 81],
    ];
    for (const [minX, maxX, minZ, maxZ] of terrain) {
      const slab = this.mesh(
        [maxX - minX, 0.4, maxZ - minZ],
        [(minX + maxX) / 2, -0.25, (minZ + maxZ) / 2],
        groundMaterial,
      );
      slab.receiveShadow = true;
      slab.userData.projectorBackground = true;
    }

    const promenade = this.mesh([29, 0.12, 83 + (GATE_Z - 29)], [0, 0.02, 2 + (GATE_Z - 29) / 2], material(0xa89d8c));
    promenade.receiveShadow = true;
    promenade.userData.projectorBackground = true;
    // Stop the pale wayfinding stripe before the Shore beach venue so the
    // screening floor remains visually uninterrupted.
    // The pale wayfinding stripe belongs to the square only. End it before
    // the Shore approach so the beach venue remains sand, chairs, and screen.
    const promenadeStripe = this.mesh([2.2, 0.04, 31], [0, 0.1, 28], material(0xc4b69f));
    promenadeStripe.userData.projectorBackground = true;
    const carpetMaterial = material(0x941a22, 0.76, 0.04);
    // The ceremonial carpet ends at the Shore entrance. The screening itself
    // sits directly on the beach rather than on a carpeted platform.
    const centralCarpet = this.mesh([28, 0.055, 65 + (GATE_Z - 29)], [0, 0.16, 7 + (GATE_Z - 29) / 2], carpetMaterial);
    centralCarpet.receiveShadow = true;
    centralCarpet.userData.projectorBackground = true;

    const deepWaterTexture = createWaterTexture(false);
    const surfaceWaterTexture = createWaterTexture(true);
    this.waterTextures.push(deepWaterTexture, surfaceWaterTexture);
    const oceanMaterial = new THREE.MeshStandardMaterial({
      color: 0x0e3445,
      map: deepWaterTexture,
      roughness: 0.58,
      metalness: 0.04,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const ocean = this.mesh([196, 0.35, 52], [0, -0.08, -84], oceanMaterial);
    ocean.receiveShadow = true;
    ocean.userData.projectorBackground = true;
    const waterVolume = this.mesh([196, 2.6, 52], [0, -1.48, -84], new THREE.MeshStandardMaterial({
      color: 0x052332,
      transparent: true,
      opacity: 0.2,
      roughness: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    waterVolume.userData.projectorBackground = true;
    this.waterVolume = waterVolume;
    // Cel-shaded surface for 一般 graphics. 精簡 keeps the cheaper textured
    // water below, so the shader never costs anything on the low setting.
    const stylised = createStylizedWaterMaterial();
    const stylisedWater = new THREE.Mesh(new THREE.PlaneGeometry(196, 52, 1, 1), stylised);
    stylisedWater.rotation.x = -Math.PI / 2;
    stylisedWater.position.set(0, 0.14, -84);
    stylisedWater.userData.projectorBackground = true;
    stylisedWater.visible = this.graphicsMode === 'normal';
    this.scene.add(stylisedWater);
    this.stylizedWater = stylisedWater;
    this.stylizedWaterMaterial = stylised;

    const waveSurface = this.mesh([196, 0.025, 52], [0, 0.115, -84], new THREE.MeshStandardMaterial({
      color: 0x5aa4b4,
      map: surfaceWaterTexture,
      transparent: true,
      opacity: 0.28,
      roughness: 0.5,
      metalness: 0.02,
      depthWrite: false,
    }));
    waveSurface.userData.projectorBackground = true;
    this.waveSurface = waveSurface;
    const reflectionTexture = createWaterReflectionTexture();
    for (const kind of ['sun', 'moon'] as const) {
      const reflectionMaterial = new THREE.MeshBasicMaterial({
        color: kind === 'sun' ? 0xffd28a : 0xb9d2ff,
        map: reflectionTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const reflection = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), reflectionMaterial);
      reflection.rotation.x = -Math.PI / 2;
      reflection.position.set(0, 0.145 + (kind === 'moon' ? 0.004 : 0), -70.5);
      reflection.scale.set(11, 38, 1);
      reflection.renderOrder = kind === 'moon' ? 3 : 2;
      reflection.userData.projectorBackground = true;
      this.scene.add(reflection);
      this.waterReflections.push({ mesh: reflection, material: reflectionMaterial, kind });
    }
    // The sand stops exactly on the waterline. It used to run a unit past it,
    // under water planes at the same height, which is what made the sea and the
    // beach interlock along the shore.
    const beachDepth = -15 - SHORE_Z;
    const beach = this.mesh([196, 0.23, beachDepth], [0, 0, SHORE_Z + beachDepth / 2], material(0xc4a979, 0.92, 0.02));
    beach.userData.projectorBackground = true;
    // Bands of slightly different sand, damp nearest the water, so the beach
    // reads as a graded surface instead of one flat colour.
    // The damp band ends on the waterline like the sand under it, and every
    // band sits just clear of the water surface rather than level with it.
    const sandBands: Array<[number, number, number]> = [
      [-24, 8, 0xcbb184],
      [-34, 12, 0xc0a377],
      [-46, 12, 0xa98d68],
      [SHORE_Z + 2.7, 5.4, 0x8c7355],
    ];
    for (const [z, depth, colour] of sandBands) {
      const band = this.mesh([196, 0.02, depth], [0, 0.125, z], material(colour, 0.95, 0.02));
      band.userData.projectorBackground = true;
      band.receiveShadow = true;
    }

    this.createBeachPlanting();

    const buoyWhite = material(0xf3ead7);
    const buoyRed = material(0xa91c24);
    for (let x = -30; x <= 30; x += 7.5) {
      this.mesh([1.15, 0.65, 1.15], [x, 0.1, -88], Math.abs(x / 7.5) % 2 === 0 ? buoyRed : buoyWhite);
    }

    const gateMat = material(0x16171a, 0.7, 0.25);
    this.mesh([1.1, 9, 1.1], [-14, 4.5, GATE_Z], gateMat);
    this.mesh([1.1, 9, 1.1], [14, 4.5, GATE_Z], gateMat);
    this.mesh([29, 1.1, 1.1], [0, 8.6, GATE_Z], gateMat);
    this.addCollider(-14, GATE_Z, 1.1, 1.1);
    this.addCollider(14, GATE_Z, 1.1, 1.1);
    // One sign on each face of the crossbar, each standing a third of a unit
    // proud of it.
    //
    // There was a single panel, facing north, sunk two thirds of a unit into
    // the bar's own one-unit thickness — so from the approach, which is the
    // side it faces and the only side it could be read from, the bar stood
    // between the reader and it and cut the second line off. The two are the
    // same near-black at the same height, which is why it read as one object
    // with a band across it rather than as two. Being a plane, it was also
    // invisible from inside the festival, where the gate is seen just as often.
    for (const facing of [1, -1]) {
      const gateSign = new THREE.Mesh(
        new THREE.PlaneGeometry(22, 4.2),
        new THREE.MeshBasicMaterial({
          map: createTextTexture([this.entranceSignText.title, this.entranceSignText.subtitle]),
        }),
      );
      this.entranceSignMaterials.push(gateSign.material as THREE.MeshBasicMaterial);
      gateSign.position.set(0, 8.6, GATE_Z + facing * 0.9);
      if (facing < 0) gateSign.rotation.y = Math.PI;
      this.scene.add(gateSign);
      // Short stubs back to the bar, so the panel reads as mounted on it.
      for (const side of [-1, 1]) {
        this.mesh([0.24, 0.24, 0.9], [side * 9.4, 8.6, GATE_Z + facing * 0.45], gateMat);
      }
    }

    // The approach road now runs from the gate south past the club turning.
    const road = this.mesh([17, 0.06, GATE_Z - 4], [0, 0.2, (GATE_Z + 4) / 2 - 2], material(0x2f2d31, 0.8, 0.1));
    road.receiveShadow = true;
    road.userData.projectorBackground = true;
    for (let z = 8; z < GATE_Z - 4; z += 6) {
      const dash = this.mesh([0.5, 0.05, 2.4], [0, 0.24, z], material(0xd8d2c4, 0.6, 0.1));
      dash.userData.projectorBackground = true;
    }
    // The turning that leads west to The Basement's forecourt.
    const clubRoadWidth = Math.abs(clubBounds.buildingMaxX - -8);
    const clubRoad = this.mesh(
      [clubRoadWidth, 0.06, 11],
      [(clubBounds.buildingMaxX + -8) / 2, 0.2, (clubBounds.doorMinZ + clubBounds.doorMaxZ) / 2],
      material(0x2f2d31, 0.8, 0.1),
    );
    clubRoad.receiveShadow = true;
    clubRoad.userData.projectorBackground = true;

    // A fixed pool of lamp lights, reassigned to whichever posts are closest.
    for (let index = 0; index < 6; index += 1) {
      const light = this.addSpotlight([0, 5, 0], [0, 0, 0], index === 0 ? 46 : 38, 20, index === 0);
      this.lampPool.push(light);
    }

    this.createProgrammeBoard();
    this.createJukebox();
    this.createShoreScreen();
    this.createPalace();
    this.createDriveIn();
    this.createClub();
    this.createRooftop();
    this.createConcession();
    this.createPamphletStand();

    // Only the western block remains: the eastern one is the temple now.
    const buildingMat = material(0x26262a);
    this.mesh([8, 15, 27], [-99, 7.5, 4], buildingMat);
    this.mesh([7.2, 1.2, 0.3], [-99, 10.2, 17.65], material(0xa31820));
    this.addCollider(-99, 4, 8, 27, 0.2, { minY: -0.4, maxY: 40 });
    this.createTemple();

    const branchPromenade = this.mesh([93, 0.08, 12], [0, 0.13, -14], material(0x6d655b));
    branchPromenade.receiveShadow = true;
    branchPromenade.userData.projectorBackground = true;
    const branchStripe = this.mesh([93, 0.025, 1.6], [0, 0.185, -14], material(0xc4b69f));
    branchStripe.userData.projectorBackground = true;
    const branchCarpet = this.mesh([93, 0.055, 7.5], [0, 0.22, -14], carpetMaterial);
    branchCarpet.receiveShadow = true;
    branchCarpet.userData.projectorBackground = true;
    // Connect the cross-town carpet to The Palace entrance. Its surface sits
    // a few millimetres above both adjoining pieces to prevent z-fighting.
    const palaceApproachCarpet = this.mesh([12, 0.055, 16], [-35, 0.225, -24], carpetMaterial);
    palaceApproachCarpet.receiveShadow = true;
    palaceApproachCarpet.userData.projectorBackground = true;

    const lampMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd7a1,
      emissive: 0xffa340,
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    this.dayNight.addLampMaterial(lampMaterial);
    // Posts line the promenade, but only every other pair carries a light.
    // Their emissive heads still read as lit, and the hemisphere light fills
    // the rest, at a fraction of the per-pixel cost.
    // Every post on the promenade stands on the same two lines, x = ±11, at
    // the same 10-unit spacing and the same height. A post that sits off
    // either reads as a mistake from anywhere on the road, so the exceptions
    // below remove a post rather than nudging one out of line.
    const PROMENADE_LAMP_X = 11;
    const PROMENADE_LAMP_HEIGHT = 4.8;
    // The turning to The Basement is lit from the promenade line, aimed west
    // down the road instead of standing in it.
    const clubTurningZ = 16;
    for (let z = GATE_Z - 6; z >= -30; z -= 10) {
      for (const x of [-PROMENADE_LAMP_X, PROMENADE_LAMP_X]) {
        // Nothing is planted across the club's doorway on the west side, nor
        // in front of the Shore poster stand.
        if (x < 0 && z !== clubTurningZ && z > clubBounds.doorMinZ - 7 && z < clubBounds.doorMaxZ + 7) continue;
        if (x < 0 && z <= -18 && z >= -30) continue;
        // Clear of the rooftop stair, which lands on the road-facing side.
        if (x > 0 && z >= rooftopBounds.stairMinZ - 8 && z <= rooftopBounds.stairMaxZ + 8) continue;
        // Nothing stands in the crossing itself. At z = -14 the east-west
        // street cuts across the promenade, and a post on either side of it
        // ends up planted in the middle of the junction.
        if (z === -14) continue;
        // The turning post throws its light west; the rest wash the roadway.
        const targetX = x < 0 && z === clubTurningZ ? clubBounds.buildingMaxX : 0;
        this.createLampPost(x, z, lampMaterial, z === 3, PROMENADE_LAMP_HEIGHT, targetX);
      }
    }

    for (const z of [-34, -42]) {
      for (const x of [-15, 15]) {
        this.createLampPost(x, z, lampMaterial, z === -34 && x === -15, 5.3, 0);
      }
    }

    // Palace floodlights are mounted invisibly beneath the entrance marquee.
    // The former emissive cubes floated in the sky and read as stray objects.
    this.addSpotlight([-35, 8.05, -31.15], [-35, 0, -35.5], 90, 26, true, 0xffb86b);

    for (const z of [-18, -29]) {
      for (const x of [26, 44]) {
        this.createLampPost(x, z, lampMaterial, z === -18 && x === 26, 6.3, 35);
      }
    }

  }

  /**
   * The jukebox, against the rooftop's west wall at the foot of its outside
   * stair. The stair runs x 13.8 to 17.4 climbing north from z 20, alongside
   * the building's wall at x = 18; this stands just south of the bottom step,
   * back to the wall, so anybody walking up to the deck passes its front.
   *
   * It is built into a group and turned, rather than laid out along the axes
   * like everything else in this world, because it has a front — the lit panel
   * and the arch over it — and that front has to face the way people arrive
   * from, which here is the road to the west.
   */
  private createJukebox(): void {
    // Against the west wall, centred under the venue's own sign rather than
    // parked beside the stair. The sign hangs at the middle of the garage bay,
    // and read from the road the two now line up. Both follow the shell, so
    // moving the building again carries them together.
    const r = rooftopBounds;
    const x = r.minX - 1;
    const z = (r.minZ + r.bayMaxZ) / 2;
    const cabinet = new THREE.Group();
    // Stood on whatever the ground actually is here rather than on y = 0. The
    // festival's floor is not one plane — kerbs, aprons and the lot around the
    // rooftop all sit proud of the street — so a cabinet built from zero had
    // its plinth buried wherever the ground was higher than that. groundHeightAt
    // answers in avatar origins, which is the floor plus AVATAR_GROUND_Y, so
    // that comes back off. The fromY is given explicitly because this runs
    // while the world is still being built and there is no player to read yet.
    // Sampled at the four corners of the footprint, not just the middle. It
    // stands where a kerb runs under one side of it, so the centre reads a
    // height the far corner does not have and the low side was left cut off by
    // the ground. Taking the highest of the four puts the whole cabinet on the
    // upper surface; the skirt below deals with the rest.
    const halfDepth = 0.75;
    const halfWidth = 1.2;
    const floorY = Math.max(
      this.groundHeightAt(x - halfDepth, z - halfWidth, 0),
      this.groundHeightAt(x + halfDepth, z - halfWidth, 0),
      this.groundHeightAt(x - halfDepth, z + halfWidth, 0),
      this.groundHeightAt(x + halfDepth, z + halfWidth, 0),
    ) - AVATAR_GROUND_Y;
    // Lifted clear of the dressing. Probing the ground around this spot returns
    // 0 at every corner, but the surfaces actually drawn there — promenade,
    // stripe, carpet — are thin slabs stacked a couple of tenths above that
    // logical floor, and the cabinet seated on the floor had its bottom edge
    // inside them. This clears the thickest of them. It cannot open a gap
    // underneath, because the skirt still runs more than a unit below.
    cabinet.position.set(x, floorY + 0.24, z);
    // Built facing -z; a quarter turn puts that front on -x, towards the road.
    cabinet.rotation.y = Math.PI / 2;
    this.scene.add(cabinet);
    const shell = material(0x2a1512, 0.62, 0.18);
    const trim = material(0xc9a227, 0.34, 0.66);
    const glass = new THREE.MeshStandardMaterial({
      color: 0xff5a3c, emissive: 0xff4a2a, emissiveIntensity: 0.85, roughness: 0.4,
    });
    // A cabinet with a lit arch over it, which is the whole silhouette at this
    // resolution — nobody needs to read the record titles off the object.
    // The plinth runs a metre below the seating plane. groundHeightAt only
    // knows the floors that can be walked on, and the lot here is dressed with
    // kerbs and aprons it has never heard of, so the exact drop under any one
    // corner is not knowable from here. A skirt buried in the ground reads as a
    // cabinet standing on it; a cabinet cut off by it does not.
    this.mesh([2.4, 2, 1.5], [0, -0.5, 0], shell, cabinet);
    this.mesh([2.2, 2.4, 1.3], [0, 1.7, 0], shell, cabinet);
    this.mesh([1.7, 0.9, 0.12], [0, 2.1, -0.68], glass, cabinet);
    this.mesh([2.4, 0.34, 1.5], [0, 3.1, 0], trim, cabinet);
    this.mesh([1.9, 0.42, 1.1], [0, 3.42, 0], glass, cabinet);
    for (const side of [-1, 1]) {
      this.mesh([0.16, 2.2, 0.16], [side * 1.05, 1.85, -0.62], trim, cabinet);
    }
    // The one light it throws, so the foot of the stair has a warm corner.
    const glow = new THREE.PointLight(0xff7a44, 26, 15, 1.6);
    glow.position.set(x - 1.2, floorY + 2.6, z);
    this.scene.add(glow);
    this.dayNight.addLampLight(glow, 1);
    // Turned a quarter, so the footprint's width and depth swap over.
    this.addCollider(x, z, 1.5, 2.4);
    this.jukebox = { x, z };
  }

  private createProgrammeBoard(): void {
    const boardTexture = createProgrammeTexture(
      'THE SHORE',
      'PUBLIC PROGRAMME',
      'MUSIC VIDEO · LIVE LOOP',
      'ROTATING FESTIVAL TIMETABLE',
    );
    // This is a luminous display, not a painted board. Keeping its face out of
    // the lighting and tone-mapping pipelines also makes the main WebGL pass
    // and the transparent projector-occlusion pass produce identical pixels.
    // A lit material was shaded differently by the two renderers, revealing
    // the projector's otherwise invisible scissor as a dark translucent block
    // across the middle of the timetable.
    this.programmeBoardMaterial = new THREE.MeshBasicMaterial({
      map: boardTexture,
      fog: false,
      toneMapped: false,
    });
    const boardX = programmeBoardPosition.x;
    // Brought forward to where the carpet meets the road. The roadway stops at
    // z = 2 and the carpet carries on south from there; standing four units
    // back at z = -3 the timetable sat adrift in the middle of the red, with
    // nothing to place it against. Here it reads as the thing at the end of the
    // road. It is still walked around rather than into: the walkable width at
    // this depth runs far wider than the board.
    const boardZ = programmeBoardPosition.z;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(programmeBoardSize.width, programmeBoardSize.height, programmeBoardSize.depth),
      this.programmeBoardMaterial,
    );
    board.position.set(boardX, programmeBoardCenterY, boardZ);
    board.castShadow = true;
    board.receiveShadow = false;
    this.scene.add(board);
    this.mesh([0.6, 3.2, 0.6], [boardX - 5.3, 1.5, boardZ], material(0x17171a));
    this.mesh([0.6, 3.2, 0.6], [boardX + 5.3, 1.5, boardZ], material(0x17171a));
    this.addCollider(boardX, boardZ, programmeBoardSize.width, 1.2);
  }

  private createShoreScreen(): void {
    const screenMaterial = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.72 });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(17, 9.5, 0.55), screenMaterial);
    screen.position.set(0, 6.1, -46);
    screen.castShadow = true;
    this.scene.add(screen);
    this.mesh([0.7, 12, 0.7], [-9, 5.2, -46], material(0x141519, 0.55, 0.65));
    this.mesh([0.7, 12, 0.7], [9, 5.2, -46], material(0x141519, 0.55, 0.65));
    this.addCollider(0, -46, 19, 1.5);

    this.createProjectorSurface('shore');
    const shoreSignMaterial = new THREE.MeshBasicMaterial({ map: createTextTexture(['THE SHORE', 'MUSIC VIDEO']) });
    this.venueSignMaterials.set('shore', shoreSignMaterial);
    const shoreSign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.15), shoreSignMaterial);
    shoreSign.position.set(-11.6, 3.35, -28.2);
    shoreSign.rotation.y = 0.12;
    this.scene.add(shoreSign);
    // Offset both supports behind the rotated poster plane so neither post
    // crosses the artwork when viewed from the entrance.
    this.mesh([0.34, 4.9, 0.34], [-13.75, 2.15, -28.32], material(0x15171a));
    this.mesh([0.34, 4.9, 0.34], [-9.55, 2.15, -28.82], material(0x15171a));
    this.addCollider(-13.75, -28.32, 0.45, 0.45);
    this.addCollider(-9.55, -28.82, 0.45, 0.45);

    const chairMaterial = material(0xded3bd);
    for (let row = 0; row < 3; row += 1) {
      for (let column = -3; column <= 3; column += 1) {
        const x = column * 2.25;
        const z = -34.5 - row * 2.8;
        this.mesh([1.3, 0.18, 1.4], [x, 0.55, z], chairMaterial);
        this.mesh([1.3, 1.3, 0.16], [x, 1.15, z + 0.6], chairMaterial);
        this.addCollider(x, z, 1.12, 1.15, 0.08, { minY: -0.4, maxY: 1.8 });
        this.seats.push({
          id: `SHORE-${row + 1}-${column + 4}`,
          venue: 'shore',
          position: new THREE.Vector3(x, 0, z),
        });
      }
    }
  }

  private createPalace(): void {
    const centerX = -35;
    const centerZ = -39.5;
    const screenZ = -48.5;
    const entranceZ = -31.1;
    // The beach top is y=0.115. Keep the Palace floor on a distinct y-plane;
    // sharing that surface caused the striped clipping visible while moving.
    const carpet = this.mesh([21, 0.08, 17], [centerX, 0.21, centerZ], material(0x4b181c));
    carpet.receiveShadow = true;
    carpet.userData.projectorBackground = true;

    const wallMaterial = material(0x171419, 0.72, 0.15);
    this.mesh([1, 10, 18], [centerX - 10.5, 5, centerZ], wallMaterial);
    this.mesh([1, 10, 18], [centerX + 10.5, 5, centerZ], wallMaterial);
    this.addCollider(centerX - 10.5, centerZ, 1, 18, 0.16);
    this.addCollider(centerX + 10.5, centerZ, 1, 18, 0.16);
    for (const x of [centerX - 8, centerX + 8]) {
      this.mesh([0.45, 8.8, 0.45], [x, 4.4, entranceZ], material(0xb58b43, 0.55, 0.45));
    }
    this.mesh([21, 0.55, 0.7], [centerX, 9.1, entranceZ], material(0xb58b43, 0.55, 0.45));

    const palaceSignMaterial = new THREE.MeshBasicMaterial({ map: createTextTexture(['THE PALACE', 'COMMERCIAL']) });
    this.venueSignMaterials.set('palace', palaceSignMaterial);
    const marquee = new THREE.Mesh(
      new THREE.PlaneGeometry(15.8, 3.3),
      palaceSignMaterial,
    );
    marquee.position.set(centerX, 7.25, entranceZ - 0.35);
    this.scene.add(marquee);

    const screen = this.mesh([15.3, 8.5, 0.55], [centerX, 5.7, screenZ], material(0x050506, 0.72));
    screen.castShadow = true;
    this.mesh([0.7, 11.5, 0.7], [centerX - 8.1, 5.2, screenZ], wallMaterial);
    this.mesh([0.7, 11.5, 0.7], [centerX + 8.1, 5.2, screenZ], wallMaterial);
    this.addCollider(centerX, screenZ, 17.5, 1.3);
    this.createProjectorSurface('palace');

    const seatMaterial = material(0x9a2028);
    for (let row = 0; row < 3; row += 1) {
      for (let column = -2; column <= 2; column += 1) {
        const x = centerX + column * 2.75;
        const z = -36.7 - row * 3.05;
        this.mesh([1.6, 0.28, 1.55], [x, 0.62, z], seatMaterial);
        this.mesh([1.6, 1.65, 0.22], [x, 1.35, z + 0.67], seatMaterial);
        this.addCollider(x, z, 1.32, 1.25, 0.08, { minY: -0.4, maxY: 2.2 });
        this.seats.push({
          id: `PALACE-${row + 1}-${column + 3}`,
          venue: 'palace',
          position: new THREE.Vector3(x, 0, z),
        });
      }
    }
  }

  private createDriveIn(): void {
    const centerX = 35;
    const asphalt = this.mesh([25, 0.14, 22], [centerX, 0.04, -24.5], material(0x25282b));
    asphalt.receiveShadow = true;
    asphalt.userData.projectorBackground = true;
    // Four dividers define three centered bays. The previous three lines ran
    // through the cars instead of between them.
    for (const x of [centerX - 10.8, centerX - 3.6, centerX + 3.6, centerX + 10.8]) {
      const parkingLine = this.mesh([0.1, 0.025, 19], [x, 0.13, -23.5], material(0xe8d89d));
      parkingLine.userData.projectorBackground = true;
    }

    const screen = this.mesh([16.6, 9.2, 0.6], [centerX, 6.05, -36], material(0x050506, 0.72));
    screen.castShadow = true;
    this.mesh([0.75, 12.5, 0.75], [centerX - 8.8, 5.4, -36], material(0x12151a, 0.55, 0.65));
    this.mesh([0.75, 12.5, 0.75], [centerX + 8.8, 5.4, -36], material(0x12151a, 0.55, 0.65));
    this.addCollider(centerX, -36, 19, 1.4);
    this.createProjectorSurface('drive-in');

    const driveSignMaterial = new THREE.MeshBasicMaterial({ map: createTextTexture(['DRIVE-IN 88', 'TELEVISION']) });
    this.venueSignMaterials.set('drive-in', driveSignMaterial);
    const roadside = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 4.5),
      driveSignMaterial,
    );
    roadside.position.set(48.5, 5.3, -16.2);
    roadside.rotation.y = -0.32;
    this.scene.add(roadside);
    // Both legs sit behind the rotated poster plane and no longer occlude its
    // title when approached from MY SQUARE.
    this.mesh([0.5, 6.8, 0.5], [46.05, 3.1, -17.75], material(0x15171a));
    this.mesh([0.5, 6.8, 0.5], [50.65, 3.1, -16.35], material(0x15171a));
    this.addCollider(46.05, -17.75, 0.5, 0.5);
    this.addCollider(50.65, -16.35, 0.5, 0.5);

    const carColors = [0x8f1720, 0xd3b356, 0x315c70, 0xd8d0bc, 0x6d4f7d, 0x335d3f];
    let carIndex = 0;
    for (let row = 0; row < 2; row += 1) {
      for (let column = -1; column <= 1; column += 1) {
        const x = centerX + column * 7.2;
        const z = -20.5 - row * 6.2;
        const car = new THREE.Group();
        car.position.set(x, 0, z);
        const carMaterial = material(carColors[carIndex % carColors.length], 0.55, 0.35);
        this.mesh([4.6, 1.05, 2.9], [0, 0.85, 0], carMaterial, car);
        this.mesh([2.9, 0.95, 2.35], [0, 1.65, -0.2], material(0x17232d, 0.25, 0.4), car);
        for (const wheelX of [-1.65, 1.65]) {
          this.mesh([0.45, 0.8, 0.85], [wheelX, 0.45, -1.05], material(0x090a0b), car);
          this.mesh([0.45, 0.8, 0.85], [wheelX, 0.45, 1.05], material(0x090a0b), car);
        }
        this.scene.add(car);
        this.addCollider(x, z, 4.35, 2.55, 0.08, { minY: -0.4, maxY: 2.2 });
        this.seats.push({
          id: `DRIVE-${row + 1}-${column + 2}`,
          venue: 'drive-in',
          position: new THREE.Vector3(x, 0, z + 1.9),
        });
        carIndex += 1;
      }
    }
  }

  private createClub(): void {
    const b = clubBounds;
    const floor = CLUB_FLOOR_Y;
    const roomCenterX = (b.roomMinX + b.roomMaxX) / 2;
    const roomCenterZ = (b.roomMinZ + b.roomMaxZ) / 2;
    const roomWidth = b.roomMaxX - b.roomMinX;
    const roomDepth = b.roomMaxZ - b.roomMinZ;
    const buildingCenterX = (b.buildingMinX + b.buildingMaxX) / 2;
    const buildingCenterZ = (b.buildingMinZ + b.buildingMaxZ) / 2;
    const buildingWidth = b.buildingMaxX - b.buildingMinX;
    const buildingDepth = b.buildingMaxZ - b.buildingMinZ;
    const brick = material(0x2a2229, 0.8, 0.14);
    const concrete = material(0x1b1b20, 0.82, 0.12);
    const darkConcrete = material(0x121216, 0.86, 0.1);
    // The room is sealed from the sky, so its surfaces are kept light enough
    // to catch the lamps rather than swallowing them.
    const roomWall = new THREE.MeshStandardMaterial({
      color: 0x413a4a,
      roughness: 0.72,
      metalness: 0.18,
      emissive: 0x2a2740,
      emissiveIntensity: 1.2,
    });
    const roomShell = new THREE.MeshStandardMaterial({
      color: 0x2b2733,
      roughness: 0.6,
      metalness: 0.3,
      emissive: 0x211f30,
      emissiveIntensity: 1.05,
    });
    const aboveGround = { minY: -0.4, maxY: 40 };
    const belowGround = { minY: floor - 1.5, maxY: -0.5 };

    // A paved forecourt so the new ground reads as a developed lot rather than
    // the bare plane the walkable area was extended onto. Nothing is planted
    // in front of the doors; lamps there blocked the way in.
    const paving = material(0x2c2b30, 0.7, 0.2);
    for (const [minX, maxX, minZ, maxZ] of [
      // East of the doors, and a margin along each outside face.
      [b.buildingMaxX, b.buildingMaxX + 14, b.buildingMinZ - 9, b.buildingMaxZ + 9],
      [b.buildingMinX - 9, b.buildingMaxX, b.buildingMinZ - 9, b.buildingMinZ],
      [b.buildingMinX - 9, b.buildingMaxX, b.buildingMaxZ, b.buildingMaxZ + 9],
      [b.buildingMinX - 9, b.buildingMinX, b.buildingMinZ, b.buildingMaxZ],
    ] as Array<[number, number, number, number]>) {
      const slab = this.mesh(
        [maxX - minX, 0.16, maxZ - minZ],
        [(minX + maxX) / 2, 0.08, (minZ + maxZ) / 2],
        paving,
      );
      slab.receiveShadow = true;
      slab.userData.projectorBackground = true;
    }

    // Shell. Built as four walls and a roof rather than one solid block, so
    // the lobby is a real room instead of space carved out of a filled box.
    const wallThickness = 1;
    const wallHeight = 8.4;
    const wallY = wallHeight / 2;
    this.mesh([wallThickness, wallHeight, buildingDepth], [b.buildingMinX, wallY, buildingCenterZ], brick);
    this.addCollider(b.buildingMinX, buildingCenterZ, wallThickness, buildingDepth, 0.2, aboveGround);
    for (const z of [b.buildingMinZ, b.buildingMaxZ]) {
      this.mesh([buildingWidth, wallHeight, wallThickness], [buildingCenterX, wallY, z], brick);
      this.addCollider(buildingCenterX, z, buildingWidth, wallThickness, 0.2, aboveGround);
    }
    // East face, split around the doorway.
    for (const [from, to] of [[b.buildingMinZ, b.doorMinZ], [b.doorMaxZ, b.buildingMaxZ]] as Array<[number, number]>) {
      const span = Math.abs(to - from);
      this.mesh([wallThickness, wallHeight, span], [b.buildingMaxX, wallY, (from + to) / 2], brick);
      this.addCollider(b.buildingMaxX, (from + to) / 2, wallThickness, span, 0.2, aboveGround);
    }
    const doorCenterZ = (b.doorMinZ + b.doorMaxZ) / 2;
    const doorHeight = 5.8;
    // Header over the opening keeps the wall reading as continuous.
    this.mesh([wallThickness, wallHeight - doorHeight, b.doorMaxZ - b.doorMinZ], [b.buildingMaxX, doorHeight + (wallHeight - doorHeight) / 2, doorCenterZ], brick);
    this.mesh([buildingWidth + 1.6, 0.7, buildingDepth + 1.6], [buildingCenterX, wallHeight + 0.35, buildingCenterZ], concrete);
    for (let index = 0; index < 7; index += 1) {
      this.mesh([buildingWidth + 1.8, 0.5, 0.5], [buildingCenterX, wallHeight + 0.8, b.buildingMinZ + 2 + index * 3.8], darkConcrete);
    }

    // Doorway dressing. Both leaves stand open against the jambs.
    // Set a few centimetres proud of the wall. Flush, the dressing's faces and
    // the wall's landed on the same planes and speckled around the opening.
    this.mesh([1.5, doorHeight, 0.6], [b.buildingMaxX + 0.36, doorHeight / 2, b.doorMinZ - 0.36], material(0x35141c, 0.6, 0.3));
    this.mesh([1.5, doorHeight, 0.6], [b.buildingMaxX + 0.36, doorHeight / 2, b.doorMaxZ + 0.36], material(0x35141c, 0.6, 0.3));
    this.mesh([1.6, 0.8, b.doorMaxZ - b.doorMinZ + 1.5], [b.buildingMaxX + 0.36, doorHeight + 0.4, doorCenterZ], material(0x35141c, 0.6, 0.3));
    const leafWidth = (b.doorMaxZ - b.doorMinZ) / 2;
    for (const [z, side] of [[b.doorMinZ, -1], [b.doorMaxZ, 1]] as Array<[number, number]>) {
      const leafZ = z + side * 0.2;
      this.mesh(
        [leafWidth, doorHeight - 0.4, 0.28],
        [b.buildingMaxX + 1.15 + leafWidth / 2, (doorHeight - 0.4) / 2, leafZ],
        material(0x8a1220, 0.45, 0.4),
      );
      this.addCollider(b.buildingMaxX + 1.15 + leafWidth / 2, leafZ, leafWidth, 0.28, 0.12, aboveGround);
    }
    // The jambs are solid too, so nobody walks through the frame.
    for (const z of [b.doorMinZ - 0.36, b.doorMaxZ + 0.36]) {
      this.addCollider(b.buildingMaxX + 0.36, z, 1.5, 0.6, 0.12, aboveGround);
    }
    // The venue sign is fixed to the wall above the doorway; the club has no
    // free-standing poster stand.
    const doorSignMaterial = new THREE.MeshBasicMaterial({ map: createTextTexture(['THE BASEMENT', 'XIEH GAN']) });
    this.venueSignMaterials.set('club', doorSignMaterial);
    const doorSign = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 2.2), doorSignMaterial);
    doorSign.position.set(b.buildingMaxX + 0.56, 7.1, doorCenterZ);
    doorSign.rotation.y = Math.PI / 2;
    this.scene.add(doorSign);
    this.clubNeon = this.mesh(
      [0.22, 0.22, 9.8],
      [b.buildingMaxX + 0.56, doorHeight + 0.1, doorCenterZ],
      new THREE.MeshBasicMaterial({ color: 0xff2f6d }),
    );

    // Club lighting across the south face, the elevation The Palace looks at.
    // These are wall washers rather than street lamps, so nothing stands in
    // the way of the doors.
    const southZ = b.buildingMinZ - 0.62;
    for (let index = 0; index < 9; index += 1) {
      const x = b.buildingMinX + 3 + index * ((buildingWidth - 6) / 8);
      const box = this.mesh([1.5, 0.9, 0.5], [x, 6.6, southZ], material(0x101014, 0.7, 0.2));
      box.castShadow = false;
      const lens = this.mesh(
        [1.1, 0.5, 0.24],
        [x, 6.6, southZ - 0.3],
        new THREE.MeshBasicMaterial({ color: clubFacadeColors[index % clubFacadeColors.length] }),
      );
      this.clubFacadeLights.push(lens);
    }
    // A neon band along the parapet, and uplights washing the brick.
    for (const y of [8.1, 1.1]) {
      const band = this.mesh(
        [buildingWidth - 2, 0.26, 0.26],
        [buildingCenterX, y, southZ - 0.2],
        new THREE.MeshBasicMaterial({ color: y > 4 ? clubFacadeColors[0] : clubFacadeColors[1] }),
      );
      this.clubFacadeLights.push(band);
    }
    const facadeGlow = new THREE.PointLight(clubFacadeColors[0], 0, 34, 1.7);
    facadeGlow.position.set(buildingCenterX, 5.4, southZ - 2);
    this.scene.add(facadeGlow);
    this.clubFacadeGlows.push(facadeGlow);

    // Ground-floor lobby, running west as far as the room's east wall below it
    // — the last line the floor has anything to stand on. Laid either side of
    // the stair slot, so the hole in the floor is the only thing announcing the
    // way down. No interior walls, no signage.
    const groundFloorMaterial = material(0x3a3340, 0.6, 0.25);
    // Full-width floor north and south of the opening.
    for (const [from, to] of [
      [b.buildingMinZ, b.stairMinZ],
      [b.stairMaxZ, b.buildingMaxZ],
    ] as Array<[number, number]>) {
      const slab = this.mesh(
        [b.buildingMaxX - b.lobbyMinX, 0.4, Math.abs(to - from)],
        [(b.lobbyMinX + b.buildingMaxX) / 2, 0.02, (from + to) / 2],
        groundFloorMaterial,
      );
      slab.receiveShadow = true;
      slab.userData.projectorBackground = true;
    }
    // And the strip east of the opening, so the hole has floor on every side.
    const eastStrip = this.mesh(
      [b.buildingMaxX - b.stairTopX, 0.4, b.stairMaxZ - b.stairMinZ],
      [(b.stairTopX + b.buildingMaxX) / 2, 0.02, (b.stairMinZ + b.stairMaxZ) / 2],
      groundFloorMaterial,
    );
    eastStrip.receiveShadow = true;
    eastStrip.userData.projectorBackground = true;
    // The floor's west edge is a balcony over the room below, so it is closed
    // with a waist-high balustrade rather than a wall: the point of standing
    // there is to look down at the dance floor. The stair slot is left open —
    // that is the way down. The guard reaches below ground level as well as
    // above it, because the far side of it is a sixteen-unit drop.
    const kerb = material(0x8a1220, 0.45, 0.4);
    const balustradeX = b.roomMaxX - 0.2;
    const balustradeHeight = 1.7;
    for (const [from, to] of [
      [b.buildingMinZ, b.stairMinZ - 0.7],
      [b.stairMaxZ + 0.7, b.buildingMaxZ],
    ] as Array<[number, number]>) {
      const span = Math.abs(to - from);
      this.mesh([0.4, balustradeHeight, span], [balustradeX, 0.22 + balustradeHeight / 2, (from + to) / 2], kerb);
      this.mesh([0.62, 0.22, span], [balustradeX, 0.22 + balustradeHeight, (from + to) / 2], material(0x2b2733, 0.5, 0.35));
      this.addCollider(balustradeX, (from + to) / 2, 0.4, span, 0.16, { minY: floor - 2, maxY: 40 }, 'gallery-balustrade');
    }

    // The plot's own surface west of the balcony is the club's roof. A light
    // well is cut through it, and through the room's ceiling directly below,
    // so the balcony has something to overlook: the drop lands on the dance
    // floor rather than on a slab a metre down.
    const wellMinX = -64;
    const wellMaxX = b.roomMaxX;
    const wellMinZ = 8;
    const wellMaxZ = 34;
    const capMaterial = material(0x2f2b33, 0.8, 0.12);
    for (const [minX, maxX, minZ, maxZ] of [
      [b.buildingMinX, wellMinX, b.buildingMinZ, b.buildingMaxZ],
      [wellMinX, b.lobbyMinX, b.buildingMinZ, wellMinZ],
      [wellMinX, b.lobbyMinX, wellMaxZ, b.buildingMaxZ],
    ] as Array<[number, number, number, number]>) {
      const cap = this.mesh(
        [maxX - minX, 0.4, maxZ - minZ],
        [(minX + maxX) / 2, 0.02, (minZ + maxZ) / 2],
        capMaterial,
      );
      cap.receiveShadow = true;
      cap.userData.projectorBackground = true;
    }

    // A kerb around the stair slot, so the drop is legible from across the room.
    // Overhanging the slot by a few centimetres. Flush with the floor's own
    // edge, the kerb's face and the slab's face shared a plane and speckled.
    for (const z of [b.stairMinZ - 0.18, b.stairMaxZ + 0.18]) {
      this.mesh([b.stairTopX - b.lobbyMinX, 0.5, 0.5], [(b.lobbyMinX + b.stairTopX) / 2, 0.34, z], kerb);
    }
    this.mesh([0.5, 0.5, b.stairMaxZ - b.stairMinZ + 1.36], [b.stairTopX + 0.18, 0.34, (b.stairMinZ + b.stairMaxZ) / 2], kerb);

    // House lighting for the ground floor. Every fitting is fixed flush to the
    // face of the wall it belongs to: the inner faces are half a wall thickness
    // in from each wall's centre line, so the sconce body sits half its own
    // depth further in again. They are spaced along those walls rather than
    // grouped, which is what made the old lobby read as a corridor of lamps.
    const sconce = new THREE.MeshBasicMaterial({ color: 0xffcf94 });
    const sconceDepth = 0.4;
    const eastFaceX = b.buildingMaxX - wallThickness / 2 - sconceDepth / 2;
    const southFaceZ = b.buildingMinZ + wallThickness / 2 + sconceDepth / 2;
    const northFaceZ = b.buildingMaxZ - wallThickness / 2 - sconceDepth / 2;
    // East wall, clear of the doorway.
    for (const z of [b.buildingMinZ + 7, b.buildingMaxZ - 7]) {
      this.mesh([sconceDepth, 0.9, 2.2], [eastFaceX, 4.1, z], sconce);
    }
    // North and south walls, across the width of the floor.
    for (const x of [b.lobbyMinX + 6, (b.lobbyMinX + b.buildingMaxX) / 2, b.buildingMaxX - 6]) {
      this.mesh([2.2, 0.9, sconceDepth], [x, 4.1, southFaceZ], sconce);
      this.mesh([2.2, 0.9, sconceDepth], [x, 4.1, northFaceZ], sconce);
    }
    // The west edge has no wall to fix anything to, so it is lit from the floor
    // along the balcony instead.
    for (let index = 0; index < 4; index += 1) {
      const z = b.buildingMinZ + 6 + index * ((buildingDepth - 12) / 3);
      if (z > b.stairMinZ - 2 && z < b.stairMaxZ + 2) continue;
      this.mesh([1.1, 0.12, 0.5], [balustradeX + 0.9, 0.28, z], sconce);
    }
    for (const [x, z] of [
      [b.lobbyMinX + 8, b.buildingMinZ + 11],
      [b.lobbyMinX + 8, b.buildingMaxZ - 11],
      [b.buildingMaxX - 8, b.buildingMinZ + 11],
      [b.buildingMaxX - 8, b.buildingMaxZ - 11],
    ] as Array<[number, number]>) {
      const fill = new THREE.PointLight(0xffcf94, 26, 30, 1.4);
      fill.position.set(x, 4.2, z);
      this.scene.add(fill);
    }
    // Light for the descent. The head of the run is lit from the lobby ceiling
    // directly over the opening; below that the fittings are fixed to the
    // stairwell's own side walls. Nothing is left hanging in the middle of the
    // shaft with no ceiling, rod or bracket holding it up.
    const shaftLight = new THREE.MeshBasicMaterial({ color: 0xffd9a8 });
    const openingCenterZ = (b.stairMinZ + b.stairMaxZ) / 2;
    // A run of fittings down the ceiling over the slot rather than one panel
    // the length of it, which is far too long to read as a light.
    for (let index = 0; index < 3; index += 1) {
      const x = b.stairTopX - 3.5 - index * 8;
      this.mesh([3.4, 0.16, 3.4], [x, wallHeight - 0.08, openingCenterZ], shaftLight);
      const ceilingLamp = new THREE.PointLight(0xffd9a8, 46, 26, 1.15);
      ceilingLamp.position.set(x, wallHeight - 0.4, openingCenterZ);
      this.scene.add(ceilingLamp);
    }
    // Side-wall fittings, low enough down the run that the shaft wall behind
    // each one is still there to carry it.
    for (const [fraction, side] of [[0.45, -1], [0.72, 1], [0.95, -1]] as Array<[number, number]>) {
      const x = b.stairTopX - (b.stairTopX - b.stairBottomX) * fraction;
      const y = this.groundHeightAt(x, openingCenterZ) + 3;
      const z = side < 0 ? b.stairMinZ - 0.25 : b.stairMaxZ + 0.25;
      this.mesh([1.6, 0.5, 0.3], [x, y, z], shaftLight);
      const lamp = new THREE.PointLight(0xffd9a8, 42, 24, 1.15);
      lamp.position.set(x, y, z - side * 0.6);
      this.scene.add(lamp);
    }

    // The stair opening is left completely clear: a plain hole in the lobby
    // floor with the steps visible in it, and nothing else to explain it.

    // Stair run down to the room.
    const stairWidth = b.stairMaxZ - b.stairMinZ;
    const stairRun = b.stairTopX - b.stairBottomX;
    const steps = 14;
    for (let step = 0; step < steps; step += 1) {
      const progress = (step + 0.5) / steps;
      const x = b.stairTopX - stairRun * progress;
      // Each tread is masonry carried down to the room's floor, the way the
      // rooftop flight already is. Drawn as thin slabs they left the whole run
      // hanging over a void: the gap between one tread and the next looked
      // clean through the flight, and under the lowest steps there was neither
      // ground nor wall to see — just the outside.
      const treadTop = progress * floor;
      this.mesh(
        [stairRun / steps + 0.06, treadTop - floor, stairWidth],
        [x, (treadTop + floor) / 2, (b.stairMinZ + b.stairMaxZ) / 2],
        darkConcrete,
      );
    }
    // Shaft walls either side of the run, carried all the way up to the
    // underside of the ground floor. They used to stop a room's height short,
    // leaving a slot of daylight along the steps and nothing for the stair's
    // own light fittings to be mounted on.
    const shaftTop = -0.18;
    const shaftHeight = shaftTop - floor;
    for (const z of [b.stairMinZ - 0.7, b.stairMaxZ + 0.7]) {
      this.mesh([stairRun - 0.4, shaftHeight, 0.6], [(b.stairTopX + b.stairBottomX) / 2 + 0.2, floor + shaftHeight / 2, z], concrete);
      this.addCollider((b.stairTopX + b.stairBottomX) / 2, z, stairRun, 0.6, 0.16, { minY: floor - 1.5, maxY: 40 }, 'stair-balustrade');
    }

    // The room.
    const roomFloor = this.mesh([roomWidth, 0.5, roomDepth], [roomCenterX, floor - 0.25, roomCenterZ], roomShell);
    roomFloor.receiveShadow = true;
    roomFloor.userData.projectorBackground = true;
    // Ceiling, opened under the balcony's light well. The two openings line up,
    // so the balcony looks through both and lands on the dance floor.
    const ceilingY = floor + CLUB_ROOM_HEIGHT;
    for (const [minX, maxX, minZ, maxZ] of [
      [b.roomMinX - 1, wellMinX, b.roomMinZ - 1, b.roomMaxZ + 1],
      [wellMinX, b.roomMaxX + 1, b.roomMinZ - 1, wellMinZ],
      [wellMinX, b.roomMaxX + 1, wellMaxZ, b.roomMaxZ + 1],
    ] as Array<[number, number, number, number]>) {
      this.mesh(
        [maxX - minX, 0.6, maxZ - minZ],
        [(minX + maxX) / 2, ceilingY, (minZ + maxZ) / 2],
        roomShell,
      );
    }
    // Fascia around the well, closing the storey-deep cavity between the room's
    // ceiling and the roof cap so the opening reads as one clean shaft.
    // Held a hair under the floor above rather than flush with it: two faces on
    // the same plane shimmer, and this rim is the one the balcony looks over.
    const fasciaTop = 0.1;
    const fasciaHeight = fasciaTop - (ceilingY - 0.3);
    const fasciaY = (fasciaTop + ceilingY - 0.3) / 2;
    for (const [x, z, sx, sz] of [
      [wellMinX, (wellMinZ + wellMaxZ) / 2, 0.8, wellMaxZ - wellMinZ],
      [(wellMinX + wellMaxX) / 2, wellMinZ, wellMaxX - wellMinX, 0.8],
      [(wellMinX + wellMaxX) / 2, wellMaxZ, wellMaxX - wellMinX, 0.8],
    ] as Array<[number, number, number, number]>) {
      this.mesh([sx, fasciaHeight, sz], [x, fasciaY, z], roomShell);
    }
    this.mesh([0.8, CLUB_ROOM_HEIGHT, roomDepth + 1.6], [b.roomMinX - 0.4, floor + CLUB_ROOM_HEIGHT / 2, roomCenterZ], roomWall);
    this.addCollider(b.roomMinX - 0.4, roomCenterZ, 0.8, roomDepth + 1.6, 0.16, belowGround, 'room-west-wall');
    // East wall, split around the foot of the stairs.
    for (const [from, to] of [
      [b.roomMinZ - 0.8, b.stairMinZ - 0.35],
      [b.stairMaxZ + 0.35, b.roomMaxZ + 0.8],
    ] as Array<[number, number]>) {
      const span = Math.abs(to - from);
      this.mesh([0.8, CLUB_ROOM_HEIGHT, span], [b.roomMaxX + 0.4, floor + CLUB_ROOM_HEIGHT / 2, (from + to) / 2], roomWall);
      this.addCollider(b.roomMaxX + 0.4, (from + to) / 2, 0.8, span, 0.16, belowGround, 'room-east-wall');
    }
    // Header over that opening, above head height so it never blocks the way.
    this.mesh([0.9, 1.6, b.stairMaxZ - b.stairMinZ + 0.5], [b.roomMaxX + 0.45, floor + CLUB_ROOM_HEIGHT - 0.9, (b.stairMinZ + b.stairMaxZ) / 2], roomWall);
    for (const z of [b.roomMinZ - 0.4, b.roomMaxZ + 0.4]) {
      this.mesh([roomWidth, CLUB_ROOM_HEIGHT, 0.8], [roomCenterX, floor + CLUB_ROOM_HEIGHT / 2, z], roomWall);
      this.addCollider(roomCenterX, z, roomWidth + 1.6, 0.8, 0.16, belowGround, 'room-end-wall');
    }

    // Back wall screen.
    this.createProjectorSurface('club');
    this.mesh([23, 10.4, 0.4], [-68, floor + CLUB_ROOM_HEIGHT / 2, b.roomMaxZ - 0.25], material(0x050506, 0.72));

    // Stage, set back so the dance floor has the middle of the room.
    const stageX = -68;
    const stageZ = 22.5 + CLUB_Z;
    this.mesh([17, 0.9, 5], [stageX, floor + 0.45, stageZ + 0.6], material(0x1f1622, 0.6, 0.35));
    this.addCollider(stageX, stageZ + 0.6, 17, 5, 0.05, belowGround, 'stage');
    this.mesh([5.4, 1.3, 1.6], [stageX, floor + 1.55, stageZ - 1.6], material(0x24242b, 0.5, 0.4));
    this.mesh([5.7, 0.16, 1.9], [stageX, floor + 2.25, stageZ - 1.6], material(0x35353f, 0.4, 0.5));
    // The decks stand proud of the stage front, so they need holding on their
    // own account — the stage collider stops short of them.
    this.addCollider(stageX, stageZ - 1.6, 5.7, 1.9, 0.12, belowGround, 'club-booth', CLUB_FLOOR_Y + 1.5);
    for (const side of [-1, 1]) {
      this.mesh([1.2, 0.12, 1.2], [stageX + side * 1.5, floor + 2.37, stageZ - 1.6], material(0x0d0d10, 0.35, 0.55));
      this.mesh([0.52, 0.14, 0.52], [stageX + side * 1.5, floor + 2.47, stageZ - 1.6], material(0xd8d3c6, 0.4, 0.4));
    }
    this.mesh([1.1, 0.14, 1.5], [stageX, floor + 2.37, stageZ - 1.6], material(0x17171c, 0.35, 0.5));
    this.clubBoothGlow = this.mesh(
      [5.1, 0.1, 0.12],
      [stageX, floor + 1.02, stageZ - 2.5],
      new THREE.MeshBasicMaterial({ color: 0x38e0ff }),
    );
    for (const side of [-1, 1]) {
      const x = stageX + side * 11;
      this.mesh([2.2, 2, 2.4], [x, floor + 1, stageZ + 0.6], material(0x131317, 0.7, 0.2));
      this.mesh([1.8, 1.7, 2], [x, floor + 2.85, stageZ + 0.6], material(0x131317, 0.7, 0.2));
      this.addCollider(x, stageZ + 0.6, 2.2, 2.4, 0.1, belowGround, 'speaker');
    }

    // Dance floor: lit panels across the open middle of the room.
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const x = -85 + column * 5.6;
        const z = -9 + CLUB_Z + row * 4.6;
        const panel = this.mesh(
          [5.2, 0.08, 4.3],
          [x, floor + 0.06, z],
          new THREE.MeshBasicMaterial({ color: clubLightColors[(row + column) % clubLightColors.length] }),
        );
        (panel.material as THREE.MeshBasicMaterial).transparent = true;
        (panel.material as THREE.MeshBasicMaterial).opacity = 0.3;
        this.clubFloorPanels.push(panel);
      }
    }

    // Bar along the south wall, away from the dance floor. Counter and stool
    // are at the heights a bar actually uses: a 1.1m counter and a 0.75m stool,
    // which at this world's scale of roughly two units to the metre is 2.2 and
    // 1.5 above the walking surface.
    // Stood off the wall rather than against it. Pushed up to the south wall
    // there was nowhere behind a stool for a camera to sit, so a drinker's
    // view of the screen was taken by the counter they were sitting at.
    const barZ = b.roomMinZ + 1.4 + CLUB_BAR_STANDOFF;
    const stoolZ = b.roomMinZ + 3.4 + CLUB_BAR_STANDOFF;
    const barFloor = floor + 0.25;
    const counterHeight = 2.2;
    const stoolHeight = 1.5;
    const stoolPadTop = barFloor + stoolHeight;
    this.mesh([20, counterHeight - 0.14, 1.4], [-68, barFloor + (counterHeight - 0.14) / 2, barZ], material(0x2b1d1f, 0.55, 0.35));
    this.addCollider(-68, barZ, 20, 1.4, 0.1, belowGround, 'bar-counter');
    this.mesh([20.4, 0.14, 1.7], [-68, barFloor + counterHeight - 0.07, barZ], material(0x4a3326, 0.4, 0.45));
    for (let index = 0; index < 6; index += 1) {
      const x = -76 + index * 3.2;
      this.mesh([0.5, stoolHeight - 0.14, 0.5], [x, barFloor + (stoolHeight - 0.14) / 2, stoolZ], material(0x1a1a1f, 0.6, 0.3));
      this.mesh([0.78, 0.14, 0.78], [x, stoolPadTop - 0.07, stoolZ], material(0x6d2630, 0.5, 0.35));
      // Footrest, because a stool this tall needs somewhere to put your feet.
      this.mesh([0.86, 0.1, 0.1], [x, barFloor + 0.55, stoolZ - 0.38], material(0x6b5a3a, 0.5, 0.6));
      this.seats.push({
        id: `CLUB-1-${index + 1}`,
        venue: 'club',
        // The anchor is where the avatar's group origin goes, so the underside
        // of its torso lands on the pad instead of hovering over it.
        position: new THREE.Vector3(x, stoolPadTop - AVATAR_SEAT_DROP, stoolZ),
        kind: 'bar',
        // Facing the counter, which sits just north of the stools.
        facing: Math.PI,
      });
    }
    // Bottles behind the counter, so the bar reads as one.
    for (let index = 0; index < 10; index += 1) {
      this.mesh(
        [0.28, 0.7 + (index % 3) * 0.18, 0.28],
        [-77 + index * 1.9, floor + 1.9, b.roomMinZ + 1.15],
        material([0x8f5a2b, 0x2f6d4a, 0x8a1220][index % 3], 0.4, 0.3),
      );
    }
    this.mesh([20, 1.8, 0.5], [-68, floor + 2.4, b.roomMinZ + 0.45], material(0x1c1720, 0.7, 0.2));

    // The wall behind the bar carries the same fittings as the sides. The wall
    // opposite carries none: the screen hangs there, and lamps flanking a
    // picture compete with it however clear of it they are.
    //
    // Centred on the wall rather than merely spread across it. The first run
    // sat five from one corner and three from the other, which is the kind of
    // lean you do not notice until you look straight at it. Set out from the
    // wall's own middle, so the formation is symmetrical whatever the room's
    // width happens to be.
    const endWallY = floor + CLUB_ROOM_HEIGHT - 5;
    const barWallCentreX = (b.roomMinX + b.roomMaxX) / 2;
    for (let index = 0; index < 5; index += 1) {
      const x = barWallCentreX + (index - 2) * 7;
      const light = this.mesh(
        [1.2, 1.2, 0.36], [x, endWallY, b.roomMinZ + 0.95],
        new THREE.MeshBasicMaterial({ color: clubLightColors[(index + 3) % clubLightColors.length] }),
      );
      this.clubLights.push(light);
    }

    // The ceiling is left bare. It carried a rig of hanging fittings, and every
    // attempt to place them ran into the light well cut through the slab — a
    // fitting standing in that hole hangs from nothing. A clean ceiling is the
    // simpler room and the one that was asked for.
    //
    // What stays is the light itself. A spotlight has no body to see, so these
    // throw the beat down onto the floor without anything hanging up there to
    // throw it: the room still pulses, the ceiling is just empty. They are kept
    // clear of the well so their cones fall on the floor rather than down the
    // shaft, and there are four rather than one per fitting, which is cheaper
    // on a phone than the rig ever was.
    const beatBeamY = floor + CLUB_ROOM_HEIGHT - 1.4;
    for (const [index, beamX] of [-82, -76, -70, -64].entries()) {
      const beamZ = b.roomMinZ + 6 + index * 3.2;
      const colour = clubLightColors[index % clubLightColors.length];
      const beam = new THREE.SpotLight(colour, 0, 34, Math.PI * 0.3, 0.7, 1.3);
      beam.position.set(beamX, beatBeamY, beamZ);
      beam.target.position.set(beamX, floor, beamZ);
      this.scene.add(beam, beam.target);
      this.clubBeatLights.push(beam);
    }
    for (let index = 0; index < 5; index += 1) {
      const z = b.roomMinZ + 4 + index * 6.5;
      for (const side of [-1, 1]) {
        // The east wall is cut away for the stairs; a fixture there would hang
        // in open air with nothing behind it. The old margin was two, which let
        // one through sitting exactly on the boundary — half of it on the wall
        // and half over the opening, which is the fitting that was reported as
        // clipping the edge. Four clears the cut properly.
        if (side > 0 && z > b.stairMinZ - 4 && z < b.stairMaxZ + 4) continue;
        const light = this.mesh(
          [0.36, 1.2, 1.2],
          // Stood off the wall rather than buried in it. At 0.6 the fitting
          // straddled the inner face — the wall runs half a thickness either
          // side of the room's edge — so most of the body was inside the wall
          // and only a slice showed, which is why it read as growing out of it.
          [side < 0 ? b.roomMinX + 0.95 : b.roomMaxX - 0.95, floor + CLUB_ROOM_HEIGHT - 5, z],
          new THREE.MeshBasicMaterial({ color: clubLightColors[(index + side + 5) % clubLightColors.length] }),
        );
        this.clubLights.push(light);
      }
    }

    // Sealed rooms get no help from the sky, so the club carries its own
    // house lighting across the whole floor.
    // The room is lit by its colour rig alone; the emissive walls carry the
    // ambient level so no white lamp is needed.
    const lobbyFill = new THREE.PointLight(0xffd9b0, 34, 28, 1.4);
    lobbyFill.position.set(-28, 3.6, 8 + CLUB_Z);
    this.scene.add(lobbyFill);
    const floorGlow = new THREE.PointLight(0xff2f6d, 0, 52, 1.5);
    floorGlow.position.set(roomCenterX, floor + 6, 3 + CLUB_Z);
    this.scene.add(floorGlow);
    this.clubFloorLight = floorGlow;
  }


  /**
   * A Buddhist-style temple on the festival's eastern edge, where a blank block
   * stood. Built in the same voxel idiom as everything else: a stone podium,
   * lacquered columns, and two tiers of tiled roof with the eaves kicked up at
   * the corners, which is what reads as a temple at this resolution. Inside,
   * an altar to 美麗本人 — no figure, only the offering table and the light.
   */
  /**
   * Re-letters the arch over the road when STAFF change it. Both faces carry
   * the same words, so both get a texture of their own rather than sharing one:
   * a shared CanvasTexture disposed on one face is disposed for the other too.
   */
  setEntranceSign(title: string, subtitle: string): void {
    this.entranceSignText = {
      title: title.trim() || this.entranceSignText.title,
      subtitle: subtitle.trim() || this.entranceSignText.subtitle,
    };
    for (const material of this.entranceSignMaterials) {
      const previous = material.map;
      material.map = createTextTexture([this.entranceSignText.title, this.entranceSignText.subtitle]);
      material.needsUpdate = true;
      previous?.dispose();
    }
  }

  /** Re-letters the temple sign when STAFF change it. */
  setTempleSign(name: string, label: string): void {
    this.templeSignText = {
      name: name.trim() || this.templeSignText.name,
      label: label.trim() || this.templeSignText.label,
    };
    if (!this.templeSignMaterial) return;
    const previous = this.templeSignMaterial.map;
    this.templeSignMaterial.map = createTextTexture([this.templeSignText.name, this.templeSignText.label]);
    this.templeSignMaterial.needsUpdate = true;
    previous?.dispose();
  }

  /** The god the altar is dedicated to, for the offering message. */
  templeDeity(): string {
    return this.templeSignText.name;
  }

  private createTemple(): void {
    const t = TEMPLE;
    const centerX = (t.minX + t.maxX) / 2;
    const centerZ = (t.minZ + t.maxZ) / 2;
    const width = t.maxX - t.minX;
    const depth = t.maxZ - t.minZ;
    const stone = material(0xa9a094, 0.9, 0.04);
    const paleStone = material(0xc3bbae, 0.88, 0.04);
    const lacquer = material(0x8f1d1d, 0.6, 0.16);
    const timber = material(0x5d2f22, 0.75, 0.08);
    const tile = material(0x2f5a4a, 0.55, 0.28);
    const gold = material(0xc9a227, 0.35, 0.62);

    // Podium, and the three steps that climb it from the festival side.
    this.mesh([width + 3, t.podium, depth + 3], [centerX, t.podium / 2, centerZ], stone);
    this.mesh([width + 0.6, 0.12, depth + 0.6], [centerX, t.podium + 0.06, centerZ], paleStone);
    for (let step = 0; step < 3; step += 1) {
      const riseTop = (t.podium / 3) * (step + 1);
      const x = t.minX - 1.5 - (2 - step) * 1.4;
      this.mesh([1.5, riseTop, 13], [x, riseTop / 2, centerZ], stone);
    }

    // Raised from 6.4. At that height the eaves came down to about six units
    // over the floor and the god's crown was inside the roof slab — a hall you
    // stooped in. The doorway below does not follow it up; see doorHeight.
    const wallHeight = 10.5;
    const doorHeight = 7.2;
    const wallY = t.podium + wallHeight / 2;
    // North and south walls, then the east wall behind the altar.
    for (const z of [t.minZ, t.maxZ]) {
      this.mesh([width, wallHeight, t.wallThickness], [centerX, wallY, z], lacquer);
      this.addCollider(centerX, z, width, t.wallThickness, 0.16, { minY: -0.4, maxY: 60 }, 'temple-wall');
    }
    this.mesh([t.wallThickness, wallHeight, depth], [t.maxX, wallY, centerZ], lacquer);
    this.addCollider(t.maxX, centerZ, t.wallThickness, depth, 0.16, { minY: -0.4, maxY: 60 }, 'temple-wall');
    // West front, open in the middle: that gap is the way in.
    for (const side of [-1, 1]) {
      const from = side < 0 ? t.minZ : centerZ + t.doorHalfWidth;
      const to = side < 0 ? centerZ - t.doorHalfWidth : t.maxZ;
      const span = to - from;
      this.mesh([t.wallThickness, wallHeight, span], [t.minX, wallY, (from + to) / 2], lacquer);
      this.addCollider(t.minX, (from + to) / 2, t.wallThickness, span, 0.16, { minY: -0.4, maxY: 60 }, 'temple-front');
    }
    // Lintel over the doorway, so the opening reads as a door and not a hole.
    // It sits at the door's own height rather than the wall's: a taller hall
    // should not mean a taller hole in the front of it.
    this.mesh([t.wallThickness + 0.4, 1.5, t.doorHalfWidth * 2], [t.minX, t.podium + doorHeight - 0.75, centerZ], timber);
    // The front wall carries on above the lintel to meet the eaves.
    this.mesh(
      [t.wallThickness, wallHeight - doorHeight, t.doorHalfWidth * 2],
      [t.minX, t.podium + doorHeight + (wallHeight - doorHeight) / 2, centerZ],
      lacquer,
    );

    // One pillar to each corner, carrying the roof where it needs carrying.
    // They used to march down the middle of both flanks, which put one squarely
    // in the doorway.
    for (const z of [t.minZ + 3.2, t.maxZ - 3.2]) {
      for (const x of [t.minX + 3.2, t.maxX - 3.2]) {
        this.mesh([1.3, wallHeight, 1.3], [x, wallY, z], lacquer);
        this.mesh([1.8, 0.55, 1.8], [x, t.podium + wallHeight - 0.28, z], gold);
        this.mesh([1.7, 0.4, 1.7], [x, t.podium + 0.2, z], stone);
        this.addCollider(x, z, 1.3, 1.3, 0.1, { minY: -0.4, maxY: 60 }, 'temple-column');
      }
    }

    // Two tiers of roof. Each is a slab with a deeper slab under its eaves, and
    // four kicked corners — the upturn is the whole silhouette of the thing.
    const tier = (y: number, overhangX: number, overhangZ: number, thickness: number): void => {
      const w = width + overhangX;
      const d = depth + overhangZ;
      this.mesh([w, thickness, d], [centerX, y, centerZ], tile);
      this.mesh([w - 2, 0.35, d - 2], [centerX, y - thickness / 2 - 0.15, centerZ], timber);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const kick = this.mesh([3.4, thickness * 0.8, 3.4], [centerX + sx * (w / 2 - 1.2), y + 0.5, centerZ + sz * (d / 2 - 1.2)], tile);
          kick.rotation.z = -sx * 0.34;
          kick.rotation.x = sz * 0.34;
        }
      }
    };
    tier(t.podium + wallHeight + 0.5, 7, 7, 0.9);
    this.mesh([width - 6, 2.6, depth - 6], [centerX, t.podium + wallHeight + 2.3, centerZ], lacquer);
    tier(t.podium + wallHeight + 4.1, 1.5, 1.5, 0.8);
    // Finial.
    this.mesh([1.2, 1.8, 1.2], [centerX, t.podium + wallHeight + 5.4, centerZ], gold);

    // The name over the door.
    this.templeSignMaterial = new THREE.MeshBasicMaterial({
      map: createTextTexture([this.templeSignText.name, this.templeSignText.label]),
    });
    const templeSign = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 2.4), this.templeSignMaterial);
    // Hung outside the building on a bracket, clear of the eaves. Held tight to
    // the wall it sat back under the overhanging roof, in its shadow and half
    // hidden by it; a temple banner belongs out in front where it can be read
    // from the forecourt.
    // Hung high on the front, in the band of wall between the lintel and the
    // eaves that opened up when the hall was raised. Tying it to the door's
    // height kept it out of the roof but left it sitting on the lintel with
    // three units of blank wall above it, which reads as a notice by the door
    // rather than the name of the building.
    //
    // The ceiling on this is the bracket, not the sign: the arm reaches back
    // under the eaves to meet the wall, and the timber band beneath the first
    // roof tier comes down to 11.425. At 1.9 above the sign, the arm sets the
    // highest the sign can hang at 9.5, and this leaves it half a unit clear.
    // The sign itself stays four and a half units out from the wall, past the
    // edge of the overhang, so the roof does not put it back in shadow.
    const signY = t.podium + 7.9;
    templeSign.position.set(t.minX - 4.6, signY, centerZ);
    const signBracket = material(0x4a3a2a, 0.7, 0.1);
    this.mesh([4.4, 0.26, 0.26], [t.minX - 2.4, signY + 1.9, centerZ], signBracket);
    for (const side of [-1, 1]) {
      this.mesh([0.16, 1.5, 0.16], [t.minX - 4.6, signY + 1.15, centerZ + side * 3.9], signBracket);
    }
    this.mesh([0.3, 0.3, 8.6], [t.minX - 4.6, signY + 1.8, centerZ], signBracket);
    templeSign.rotation.y = -Math.PI / 2;
    this.scene.add(templeSign);

    // The altar, at the far end facing the door: a low offering table with the
    // god seated above it. Not a pillar — a figure, in the same blocky idiom as
    // everyone who comes to see her.
    const altarX = t.maxX - 5.5;
    // The god sits 1.9 back from the offering line, and her lotus is 2.3
    // across from the middle of it — on a table 3.2 wide she stood with most of
    // the dais over the edge and nothing under it. The top now runs from in
    // front of the offerings to clear behind her, and the stone base follows,
    // set in so the top still reads as a top.
    const tableCenterX = altarX + 1.3;
    const tableWidth = 6.6;
    this.mesh([tableWidth - 1.4, 1.1, 12], [tableCenterX, t.podium + 0.55, centerZ], stone);
    this.mesh([tableWidth, 0.28, 12.6], [tableCenterX, t.podium + 1.24, centerZ], timber);
    for (const z of [centerZ - 3, centerZ, centerZ + 3]) {
      this.mesh([0.9, 0.45, 0.9], [altarX - 0.1, t.podium + 1.6, z], gold);
    }
    // Incense, three sticks with an ember at the tip.
    for (const z of [centerZ - 1.4, centerZ, centerZ + 1.4]) {
      this.mesh([0.07, 1.3, 0.07], [altarX - 1.1, t.podium + 2.03, z], timber);
      this.mesh([0.14, 0.14, 0.14], [altarX - 1.1, t.podium + 2.72, z], material(0xff6a2a, 0.3, 0.1));
    }

    // 美麗本人 herself, seated on a lotus dais behind the table, facing the
    // door. Gilded rather than skin-toned: this is an image of a god, not
    // another attendee standing at the back of the room.
    const deityBase = t.podium + 1.4;
    const deity = new THREE.Group();
    deity.position.set(altarX + 1.9, deityBase, centerZ);
    deity.rotation.y = -Math.PI / 2;
    this.scene.add(deity);
    const petal = material(0xd8b34a, 0.42, 0.5);
    for (const [ring, radius, height] of [[8, 1.9, 0.34], [6, 1.35, 0.3]] as Array<[number, number, number]>) {
      for (let i = 0; i < ring; i += 1) {
        const angle = (i / ring) * Math.PI * 2;
        const leaf = this.mesh([0.8, height, 0.5], [Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius], petal, deity);
        leaf.rotation.y = -angle;
        leaf.rotation.x = -0.32;
      }
    }
    this.mesh([2.6, 0.4, 2.6], [0, 0.7, 0], gold, deity);
    // Crossed legs, then the body, arms resting in the lap, and the head.
    this.mesh([2.9, 0.6, 1.5], [0, 1.15, 0.15], gold, deity);
    this.mesh([1.05, 0.55, 1.2], [-0.85, 1.5, 0.1], gold, deity);
    this.mesh([1.05, 0.55, 1.2], [0.85, 1.5, 0.1], gold, deity);
    this.mesh([1.7, 1.9, 1.1], [0, 2.35, -0.1], gold, deity);
    this.mesh([0.45, 1.5, 0.5], [-1.05, 2.3, 0.05], gold, deity);
    this.mesh([0.45, 1.5, 0.5], [1.05, 2.3, 0.05], gold, deity);
    // Hands together in the lap.
    this.mesh([0.9, 0.3, 0.7], [0, 1.62, 0.42], material(0xe6c766, 0.35, 0.55), deity);
    this.mesh([1.15, 1.15, 1.05], [0, 3.85, -0.05], gold, deity);
    // Hair, and a crown above it.
    this.mesh([1.28, 0.42, 1.14], [0, 4.5, -0.06], material(0x3b2f1c, 0.7, 0.2), deity);
    this.mesh([1.05, 0.5, 1.05], [0, 4.92, -0.06], petal, deity);
    this.mesh([0.3, 0.55, 0.3], [0, 5.3, -0.06], petal, deity);
    // Eyes, lowered.
    for (const side of [-1, 1]) {
      this.mesh([0.14, 0.06, 0.06], [side * 0.26, 3.82, 0.54], material(0x2a2118), deity);
    }
    // A halo behind the head, which is what carries the light in the room.
    const halo = this.mesh(
      [3.4, 3.4, 0.16],
      [0, 3.9, -0.75],
      new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.24, depthWrite: false }),
    );
    halo.rotation.y = 0;
    // Kept out of the pass that redraws geometry over the screens. That pass
    // clears the depth buffer inside each screen's rectangle before it renders,
    // and this is the one object in the world that is both transparent and does
    // not write depth — so it painted itself over whatever happened to be in
    // that rectangle, a hundred units away, as a pale block.
    halo.userData.projectorBackground = true;
    this.templeAura = halo;
    // Set at ninety a arm's length from her, this washed the gilding out to
    // white and lost every edge of the figure. Enough to lift her off the wall
    // and no more; the lanterns light the room.
    const auraLight = new THREE.PointLight(0xffcf8a, 26, 20, 1.7);
    auraLight.position.set(altarX - 2.6, t.podium + 4.6, centerZ);
    this.scene.add(auraLight);
    this.addCollider(tableCenterX, centerZ, tableWidth, 12.6, 0.2, { minY: -0.4, maxY: 60 }, 'temple-altar');
    this.templeAltar = { x: altarX, z: centerZ };

    // Lanterns down the aisle, on cords from the ceiling.
    //
    // They used to be placed at a height measured up from the floor, which is
    // how a lamp on a post is placed, not how a lantern is hung — so they sat
    // in mid-air with a gap above them, and raising the hall only widened the
    // gap. A hung thing is measured down from what holds it. The underside of
    // the first roof tier is the ceiling of this room: the slab is centred at
    // wallHeight + 0.5 and is 0.9 deep, with a 0.35 timber band slung 0.15
    // under it, so the lowest thing overhead is at wallHeight + 0.5 - 0.625.
    const ceilingY = t.podium + wallHeight + 0.5 - 0.9 / 2 - 0.15 - 0.35 / 2;
    const lanternHeight = 1.1;
    // Head height and above, well clear of the tallest attendee.
    const lanternTopY = t.podium + 5.55;
    for (const z of [centerZ - 5, centerZ + 5]) {
      for (const x of [t.minX + 8, t.maxX - 9]) {
        const cordLength = ceilingY - lanternTopY;
        this.mesh([0.09, cordLength, 0.09], [x, lanternTopY + cordLength / 2, z], material(0x2a2118, 0.8, 0.05));
        this.mesh([0.8, lanternHeight, 0.8], [x, lanternTopY - lanternHeight / 2, z], material(0xd8452c, 0.5, 0.1));
        // Cap where the cord meets the lantern, so the join is not a wire
        // vanishing into a box.
        this.mesh([0.34, 0.14, 0.34], [x, lanternTopY, z], material(0xc9a227, 0.4, 0.55));
        const glow = new THREE.PointLight(0xff9a5a, 55, 26, 1.4);
        glow.position.set(x, lanternTopY - lanternHeight, z);
        this.scene.add(glow);
      }
    }
  }

  private createRooftop(): void {
    const r = rooftopBounds;
    const width = r.maxX - r.minX;
    const depth = r.maxZ - r.minZ;
    const centerX = (r.minX + r.maxX) / 2;
    const bayCenterZ = (r.minZ + r.bayMaxZ) / 2;
    const bayDepth = r.bayMaxZ - r.minZ;
    const deckCenterZ = (r.deckMinZ + r.maxZ) / 2;
    const deckDepth = r.maxZ - r.deckMinZ;
    const brick = material(0x3a2f2c, 0.78, 0.14);
    const warmConcrete = material(0x4a3d35, 0.75, 0.12);
    const aboveGround = { minY: -0.4, maxY: 60 };
    const onDeck = { minY: ROOF_Y - 1, maxY: 60 };
    // The parapet is 1.5 tall and was solid all the way to the sky, so there
    // was no way off the deck but the stair. Topped at its own coping, a
    // running jump carries over it and the attendee falls to the street.
    const parapet = { minY: ROOF_Y - 1, maxY: ROOF_Y + 1.5 };

    const forecourt = this.mesh([width + 18, 0.16, 22], [centerX, 0.04, r.minZ - 9], material(0x3a352f, 0.7, 0.2));
    forecourt.receiveShadow = true;
    forecourt.userData.projectorBackground = true;

    // Mass under the deck, solid at street level. The stair now stands clear
    // of this footprint, so the block needs no opening cut through it.
    // Stopped half a unit short of the deck's finished floor. Carried the whole
    // way up, its top face and the deck's landed on exactly the same plane and
    // the two fought for every pixel, which is what made the floor shimmer.
    this.mesh([width, ROOF_Y - 0.5, deckDepth], [centerX, (ROOF_Y - 0.5) / 2, deckCenterZ], brick);
    this.addCollider(centerX, deckCenterZ, width, deckDepth, 0.2, { minY: -0.4, maxY: ROOF_Y - 2 });
    // Roof slab, with its overhang reading as a cornice from the street. It
    // sits under the deck's finished floor: carried at ROOF_Y + 0.3 its top
    // was 0.6 above the level everything on the deck is set out from, so the
    // avatar stood shin-deep in it and the floor lights were buried entirely.
    this.mesh([width + 1.2, 0.6, depth + 1.2], [centerX, ROOF_Y - 0.35, (r.minZ + r.maxZ) / 2], warmConcrete);

    // Garage bay: floor, side walls, open to the south.
    this.mesh([width, 0.5, bayDepth], [centerX, 0.1, bayCenterZ], material(0x453b33, 0.7, 0.15));
    for (const x of [r.minX, r.maxX]) {
      this.mesh([0.8, ROOF_Y, bayDepth], [x, ROOF_Y / 2, bayCenterZ], brick);
      this.addCollider(x, bayCenterZ, 0.8, bayDepth, 0.16, aboveGround);
    }

    // The bay is a pop-up clothing store: one frontage across the three former
    // counters, with the shopfront facing the Drive-In the way the stalls did.
    const counterZ = r.bayMaxZ - 2.4;
    this.mesh([31, 2.3, 2.6], [centerX, 1.15, counterZ], material(0x2e2621, 0.7, 0.2));
    this.mesh([31.6, 0.45, 3], [centerX, 2.55, counterZ], material(0xd8642c, 0.5, 0.25));
    this.addCollider(centerX, counterZ, 31, 2.6, 0.16, { minY: -0.4, maxY: ROOF_Y }, 'shop-counter');
    for (const side of [-1, 0, 1]) {
      const rail = this.mesh([6.4, 0.24, 0.24], [centerX + side * 10, 4.4, counterZ - 0.2], material(0x8a8f96, 0.4, 0.6));
      rail.castShadow = false;
      // Stock on the rail, so the frontage reads as a clothes shop.
      for (let index = 0; index < 6; index += 1) {
        const x = centerX + side * 10 - 2.6 + index * 1.05;
        this.mesh(
          [0.72, 1.5, 0.3],
          [x, 3.55, counterZ - 0.2],
          material([0x9f1720, 0x20242c, 0xd5b23f, 0x3f6d5a, 0x8a4b8f, 0xd8d3c6][index % 6], 0.8, 0.05),
        );
      }
      const stallLamp = new THREE.PointLight(0xffcf94, 22, 14, 1.4);
      stallLamp.position.set(centerX + side * 10, 3.4, counterZ - 3);
      this.scene.add(stallLamp);
    }
    this.shopSign = new THREE.Mesh(
      new THREE.PlaneGeometry(11.2, 3),
      new THREE.MeshBasicMaterial({ map: createTextTexture(['THE POP-UP', 'CLOTHING STORE']) }),
    );
    // Forward of the rail and clear of the soffit. At 5.4 its top ran into the
    // roof slab overhead, and a metre and a half out it sat almost on the stock.
    this.shopSign.position.set(centerX, 4.5, counterZ - 4.2);
    this.shopSign.rotation.y = Math.PI;
    this.scene.add(this.shopSign);
    // Where an attendee stands to be served, in front of the frontage.
    this.shopCounter = { x: centerX, z: counterZ - 4.2 };

    const rooftopSignMaterial = new THREE.MeshBasicMaterial({
      map: createTextTexture(['THE ROOFTOP', DEFAULT_VENUE_SUBTITLES.rooftop]),
    });
    this.venueSignMaterials.set('rooftop', rooftopSignMaterial);
    const rooftopSign = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 2.6), rooftopSignMaterial);
    rooftopSign.position.set(r.minX - 0.42, 4.6, bayCenterZ);
    rooftopSign.rotation.y = -Math.PI / 2;
    this.scene.add(rooftopSign);
    const rooftopSignGlow = new THREE.PointLight(0xffcf94, 20, 16, 1.5);
    rooftopSignGlow.position.set(r.minX - 2.2, 5.2, bayCenterZ);
    this.scene.add(rooftopSignGlow);

    this.createRooftopStair(warmConcrete, brick);

    // Deck and parapet.
    const deck = this.mesh([width, 0.5, deckDepth], [centerX, ROOF_Y - 0.25, deckCenterZ], material(0x54463c, 0.7, 0.15));
    deck.receiveShadow = true;
    // And it casts, which is not the default here — casting is opt-in because
    // every caster is redrawn into the sun's shadow map each frame. The deck
    // has to be one: the resident DJ stands on it, and with the floor under her
    // absent from the shadow map the sun ran straight through it and printed
    // her shadow on the soffit of the garage below, where she is not standing.
    // A floor somebody stands on has to be in the map, or everything on it
    // leaks through to whatever is underneath.
    deck.castShadow = true;
    deck.userData.projectorBackground = true;
    // East parapet runs the whole depth. The west one is cut open across the
    // stair's top landing: that gap is the door onto the deck, and the reason
    // arriving at the head of the stair no longer walks into a wall.
    this.mesh([0.6, 1.5, deckDepth], [r.maxX + 0.3, ROOF_Y + 0.75, deckCenterZ], warmConcrete);
    this.addCollider(r.maxX + 0.3, deckCenterZ, 0.6, deckDepth, 0.16, parapet);
    // Between stairMinZ and stairTopZ the stair's own stringer wall stands in
    // the parapet's place and is built with the run.
    for (const [from, to] of [
      [r.deckMinZ, r.stairMinZ],
      [r.stairMaxZ, r.maxZ],
    ] as Array<[number, number]>) {
      const span = to - from;
      if (span <= 0) continue;
      this.mesh([0.6, 1.5, span], [r.minX - 0.3, ROOF_Y + 0.75, (from + to) / 2], warmConcrete);
      this.addCollider(r.minX - 0.3, (from + to) / 2, 0.6, span, 0.16, parapet);
    }
    this.mesh([width + 1.2, 1.5, 0.6], [centerX, ROOF_Y + 0.75, r.maxZ + 0.3], warmConcrete);
    this.addCollider(centerX, r.maxZ + 0.3, width + 1.2, 0.6, 0.16, parapet);
    this.mesh([width + 1.2, 1.5, 0.6], [centerX, ROOF_Y + 0.75, r.deckMinZ - 0.3], warmConcrete);
    this.addCollider(centerX, r.deckMinZ - 0.3, width + 1.2, 0.6, 0.16, parapet);

    // Screen at the deck's south edge, back to the Drive-In, watched northward.
    this.createProjectorSurface('rooftop');
    this.mesh([15, 8, 0.4], [centerX, ROOF_Y + 6.6, r.deckMinZ + 0.6], material(0x050506, 0.72));
    const boothZ = r.deckMinZ + 4.4;
    this.mesh([10, 0.7, 3.6], [centerX, ROOF_Y + 0.35, boothZ], material(0x3d2a24, 0.6, 0.3));
    this.mesh([4.6, 1.2, 1.5], [centerX, ROOF_Y + 1.3, boothZ + 0.8], material(0x2b2b33, 0.5, 0.4));
    this.mesh([4.9, 0.16, 1.8], [centerX, ROOF_Y + 1.95, boothZ + 0.8], material(0x3a3a44, 0.4, 0.5));
    // The booth is furniture, not scenery: the plinth carries the decks and an
    // attendee has to walk round it rather than through the DJ.
    this.addCollider(centerX, boothZ, 10, 3.6, 0.12, onDeck, 'rooftop-booth', ROOF_Y + 1.4);
    for (const side of [-1, 1]) {
      this.mesh([1.1, 0.12, 1.1], [centerX + side * 1.35, ROOF_Y + 2.06, boothZ + 0.8], material(0x0d0d10, 0.35, 0.55));
      this.mesh([2, 2.4, 1.8], [centerX + side * 7.4, ROOF_Y + 1.2, boothZ], material(0x241d1a, 0.7, 0.2));
      this.addCollider(centerX + side * 7.4, boothZ, 2, 1.8, 0.12, onDeck, 'rooftop-speaker', ROOF_Y + 2.2);
    }

    // Fittings on the inside face of the parapet, washing the deck from its
    // edge. Set into the floor they were both too many and underfoot; up on the
    // wall a quarter as many cover the same ground. They run off the same beat
    // as the club's rig, so the roof answers the track it is playing.
    const parapetFace = 0.34;
    const lightY = ROOF_Y + 0.95;
    const deckLightAt = (x: number, z: number, size: [number, number, number]): void => {
      const light = this.mesh(size, [x, lightY, z], new THREE.MeshBasicMaterial({
        color: clubLightColors[this.clubLights.length % clubLightColors.length],
      }));
      this.clubLights.push(light);
    };
    for (let index = 0; index < 4; index += 1) {
      const x = r.minX + 4 + index * ((width - 8) / 3);
      deckLightAt(x, r.deckMinZ + parapetFace, [1.5, 0.42, 0.22]);
      deckLightAt(x, r.maxZ - parapetFace, [1.5, 0.42, 0.22]);
    }
    for (let index = 0; index < 3; index += 1) {
      const z = r.deckMinZ + 5 + index * ((deckDepth - 10) / 2);
      deckLightAt(r.minX + parapetFace, z, [0.22, 0.42, 1.5]);
      deckLightAt(r.maxX - parapetFace, z, [0.22, 0.42, 1.5]);
    }
    // Benches, low enough to sit on.
    for (const [benchIndex, [x, z]] of ([[centerX - 11, deckCenterZ + 4], [centerX + 11, deckCenterZ + 2], [centerX - 3, deckCenterZ + 7]] as Array<[number, number]>).entries()) {
      this.mesh([2.4, 0.8, 2], [x, ROOF_Y + 0.4, z], material(0x4d3a2c, 0.6, 0.2));
      // Topped at the seat rather than at the sky, so a jump clears the bench
      // instead of stopping dead against it.
      this.addCollider(x, z, 2.4, 2, 0.1, { minY: ROOF_Y - 1, maxY: ROOF_Y + 0.8 }, 'rooftop-bench');
      this.seats.push({
        // Numbered by position in this list rather than by how many benches
        // happen to exist, so the ids stay put and keep matching the service's
        // register of seats.
        id: `ROOFTOP-BENCH-${benchIndex + 1}`,
        venue: 'rooftop',
        // Perched on the block, facing the screen at the deck's south edge.
        position: new THREE.Vector3(x, ROOF_Y + 0.8 - AVATAR_SEAT_DROP, z),
        kind: 'bench',
        facing: Math.PI,
      });
    }

    for (const [x, z] of [[centerX - 9, deckCenterZ], [centerX + 9, deckCenterZ + 3]] as Array<[number, number]>) {
      const warmth = new THREE.PointLight(0xffb066, 30, 26, 1.3);
      warmth.position.set(x, ROOF_Y + 3, z);
      this.scene.add(warmth);
    }
  }

  /**
   * The stair up to the rooftop deck, built the way one would be drawn: two
   * flights of ten equal 0.35 risers on 0.56 goings, a half-landing between
   * them deep enough to turn on, and a top landing level with the deck so the
   * last step is onto the floor you are heading for rather than over a kerb.
   * The run climbs northward against the building's west face, which carries
   * the whole flight on a solid stringer wall instead of leaving the treads
   * cantilevered off nothing.
   */
  private createRooftopStair(
    treadMaterial: THREE.MeshStandardMaterial,
    wallMaterial: THREE.MeshStandardMaterial,
  ): void {
    const r = rooftopBounds;
    const stairWidth = r.stairMaxX - r.stairMinX;
    const centerX = (r.stairMinX + r.stairMaxX) / 2;
    const halfHeight = ROOF_Y / 2;
    const railColour = material(0x8a5a2b, 0.5, 0.3);
    // The open side. Its kerb and its posts stand on the flight's own masonry,
    // which is why the mass below is drawn half a unit wider than the treads.
    const kerbWidth = 0.5;
    const massMinX = r.stairMinX - kerbWidth;
    const massCenterX = (massMinX + r.stairMaxX) / 2;
    const massWidth = r.stairMaxX - massMinX;
    const railX = r.stairMinX - kerbWidth / 2;
    const handrail = 1.8;
    const ground = -0.5;

    /**
     * One flight: nine treads, then a tenth riser onto the landing above.
     * Each tread is masonry carried to the ground, so no part of the run is
     * left hanging over a void, and the guard is an open handrail on posts
     * rather than a solid wall — a wall the height of a handrail turned the
     * whole flight into a sawtooth silhouette with the steps hidden behind it.
     */
    const flight = (footZ: number, footY: number): void => {
      for (let step = 0; step < 9; step += 1) {
        const top = footY + ROOF_RISER * (step + 1);
        const treadZ = footZ + ROOF_GOING * (step + 0.5);
        this.mesh(
          [massWidth, top - ground, ROOF_GOING + 0.02],
          [massCenterX, (top + ground) / 2, treadZ],
          treadMaterial,
        );
        // Kerb along the open edge, low enough to leave the steps in view.
        this.mesh([kerbWidth, 0.36, ROOF_GOING + 0.02], [railX, top + 0.18, treadZ], wallMaterial);
      }
      // The pitch line runs nosing to nosing: nine goings across, nine risers
      // up, which is 32 degrees — the angle a stair is comfortable at.
      const run = ROOF_GOING * 9;
      const rise = ROOF_RISER * 9;
      const rail = this.mesh(
        [0.26, 0.26, Math.hypot(run, rise) + 0.5],
        [railX, footY + ROOF_RISER + rise / 2 + handrail, footZ + run / 2],
        railColour,
      );
      rail.rotation.x = -Math.atan2(rise, run);
      for (let post = 0; post <= 9; post += 3) {
        const y = footY + ROOF_RISER * (post + 1);
        this.mesh([0.22, handrail, 0.22], [railX, y + handrail / 2, footZ + ROOF_GOING * post], railColour);
      }
    };

    const landing = (minZ: number, maxZ: number, surfaceY: number, maxX: number): void => {
      const depth = maxZ - minZ;
      const width = maxX - massMinX;
      const cx = (massMinX + maxX) / 2;
      this.mesh([width, surfaceY - ground, depth], [cx, (surfaceY + ground) / 2, (minZ + maxZ) / 2], treadMaterial);
      this.addCollider(cx, (minZ + maxZ) / 2, width, depth, 0.16, { minY: -0.4, maxY: surfaceY - 1.5 });
      this.mesh([kerbWidth, 0.36, depth], [railX, surfaceY + 0.18, (minZ + maxZ) / 2], wallMaterial);
      this.mesh([0.26, 0.26, depth], [railX, surfaceY + handrail, (minZ + maxZ) / 2], railColour);
      for (const z of [minZ + 0.2, maxZ - 0.2]) {
        this.mesh([0.22, handrail, 0.22], [railX, surfaceY + handrail / 2, z], railColour);
      }
    };

    flight(r.stairMinZ, 0);
    landing(r.stairLandingMinZ, r.stairLandingMaxZ, halfHeight, r.stairMaxX);
    flight(r.stairLandingMaxZ, halfHeight);
    // The top landing runs east only as far as the deck edge, filling the gap
    // left in the parapet. Sizing it to the deck's own width once walled the
    // roof in half.
    landing(r.stairTopZ, r.stairMaxZ, ROOF_Y, r.minX);
    // Parapet closing the north end of that landing, and nothing further east.
    const landingWidth = r.minX - massMinX;
    const landingCenterX = (massMinX + r.minX) / 2;
    this.mesh(
      [landingWidth, 1.5, 0.5],
      [landingCenterX, ROOF_Y + 0.75, r.stairMaxZ + 0.25],
      treadMaterial,
    );
    this.addCollider(
      landingCenterX, r.stairMaxZ + 0.25,
      landingWidth, 0.5, 0.16, { minY: ROOF_Y - 1, maxY: ROOF_Y + 1.5 },
    );

    // The kerb and rail hold the open side for the whole climb; the building
    // face holds the other. Between them the run has no way off it.
    const runCenterZ = (r.stairMinZ + r.stairMaxZ) / 2;
    const runDepth = r.stairMaxZ - r.stairMinZ;
    // Topped at the deck's coping rather than the sky. Anyone on the stair is
    // below that and still held, but a jump from the deck carries over it —
    // this kerb runs the length of the deck's west edge and was the invisible
    // wall there.
    this.addCollider(railX, runCenterZ, kerbWidth, runDepth, 0.16, { minY: -0.4, maxY: ROOF_Y + 1.5 });
    // Stringer wall between the flights and the shell, stopping short of the
    // top landing so the last step opens straight onto the deck.
    const stringerDepth = r.stairTopZ - r.stairMinZ;
    const stringerHeight = ROOF_Y + 1.5;
    this.mesh(
      [r.minX - r.stairMaxX, stringerHeight, stringerDepth],
      [(r.stairMaxX + r.minX) / 2, stringerHeight / 2, r.stairMinZ + stringerDepth / 2],
      treadMaterial,
    );
    // Blocked to the sky, though the wall itself stops at stringerHeight. It
    // runs the length of the deck's west edge, so that overshoot was the
    // invisible wall there. Held to its own height, the stair is still walled
    // and a jump from the deck clears it.
    this.addCollider(
      (r.stairMaxX + r.minX) / 2, r.stairMinZ + stringerDepth / 2,
      r.minX - r.stairMaxX, stringerDepth, 0.16, { minY: -0.4, maxY: stringerHeight },
    );
    // A kerb across the foot of the run, so the bottom step reads as a step.
    this.mesh([stairWidth + 1, 0.16, 2.4], [centerX, 0.08, r.stairMinZ - 1.2], treadMaterial);

    // Lights on the building face, opposite the handrail. Fixed to the one
    // side of the run that is a solid wall, washing the treads across it.
    for (const [z, y] of [
      [r.stairMinZ + 2.5, ROOF_RISER * 5],
      [r.stairLandingMinZ + 1.8, halfHeight],
      [r.stairLandingMaxZ + 2.5, halfHeight + ROOF_RISER * 5],
      // Nothing past stairTopZ: the stringer wall ends there and the fitting
      // was left hanging in open air with no wall behind it.
    ] as Array<[number, number]>) {
      this.mesh(
        [0.16, 0.34, 1.2],
        [r.stairMaxX - 0.08, y + 1.5, z],
        new THREE.MeshBasicMaterial({ color: 0xffb066 }),
      );
      const glow = new THREE.PointLight(0xffb066, 18, 13, 1.5);
      glow.position.set(r.stairMaxX - 0.6, y + 1.3, z);
      this.scene.add(glow);
    }
  }

  /**
   * Beach planting, placed by hand rather than scattered. Nothing is planted
   * inside the corridor the Shore seats and screen occupy, and nothing sits
   * south of the seating where it would enter frame. Each position is checked
   * against existing colliders before it is built.
   */
  private createBeachPlanting(): void {
    const palmTrunk = material(0x6b4a2f, 0.85, 0.05);
    const palmFrond = material(0x2f6d3f, 0.8, 0.05);
    const grassBlade = material(0x5c7f43, 0.9, 0.02);
    const dune = material(0xbfa176, 0.95, 0.02);

    const palms: Array<[number, number, number]> = [
      [-54, -26, 5.6], [-62, -30, 4.4], [-56, -36, 6.2], [-68, -25, 5],
      [-74, -32, 4.2], [-66, -40, 5.4], [-82, -28, 5.2], [-78, -38, 4.8],
      [54, -26, 5.4], [62, -30, 4.6], [56, -36, 4], [68, -25, 6],
      [74, -32, 5], [66, -40, 5.2], [82, -28, 5.6], [78, -38, 4.6],
      [-60, -48, 5], [60, -48, 5], [-72, -46, 4.4], [72, -46, 4.4],
    ];
    for (const [x, z, height] of palms) {
      if (this.staticCollides(x, z, AVATAR_GROUND_Y)) continue;
      this.mesh([0.5, height, 0.5], [x, height / 2, z], palmTrunk);
      this.addCollider(x, z, 0.6, 0.6, 0.2, { minY: -0.4, maxY: 40 });
      this.mesh([6.2, 0.22, 1.3], [x, height + 0.1, z], palmFrond);
      this.mesh([1.3, 0.22, 6.2], [x, height + 0.02, z], palmFrond);
      this.mesh([1.8, 0.5, 1.8], [x, height + 0.35, z], palmFrond);
    }

    const clumps: Array<[number, number]> = [
      [-50, -22], [-58, -23], [-66, -22], [-74, -23], [-84, -22],
      [50, -22], [58, -23], [66, -22], [74, -23], [84, -22],
      [-52, -42], [-64, -44], [-76, -42],
      [52, -42], [64, -44], [76, -42],
      [-58, -54], [58, -54],
    ];
    for (const [x, z] of clumps) {
      if (this.staticCollides(x, z, AVATAR_GROUND_Y)) continue;
      this.mesh([2.6, 0.3, 2.2], [x, 0.16, z], dune);
      const bladeCount = this.graphicsMode === 'normal' ? 5 : 2;
      for (let blade = 0; blade < bladeCount; blade += 1) {
        const angle = (blade / bladeCount) * Math.PI * 2;
        const spread = 0.55 + (blade % 3) * 0.22;
        this.mesh(
          [0.16, 0.9 + (blade % 4) * 0.22, 0.16],
          [x + Math.cos(angle) * spread, 0.55, z + Math.sin(angle) * spread],
          grassBlade,
        );
      }
    }

    for (const [x, z] of [[-56, -20], [57, -20.4]] as Array<[number, number]>) {
      this.mesh([0.22, 3.2, 0.22], [x, 1.6, z], material(0x8a7a63, 0.8, 0.05));
      this.mesh([4.4, 0.3, 4.4], [x, 3.3, z], material(0xc23b3b, 0.7, 0.05));
      this.addCollider(x, z, 0.4, 0.4, 0.2, { minY: -0.4, maxY: 40 });
    }
  }

  private createConcession(): void {
    const booth = new THREE.Group();
    booth.position.copy(concessionPosition);
    this.mesh([3.2, 2.5, 2.6], [0, 1.25, 0], material(0x9f1720), booth);
    this.mesh([3.8, 0.35, 3.1], [0, 2.7, 0], material(0x17171a), booth);
    const signTexture = createTextTexture(['POP!', 'TAKE ONE'], '#f5efe2', '#a91c24');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 1.25),
      new THREE.MeshBasicMaterial({ map: signTexture }),
    );
    sign.position.set(0, 2.1, 1.34);
    booth.add(sign);
    this.mesh([0.5, 0.75, 0.5], [0, 3.05, 0], material(0xffc93c), booth);
    this.scene.add(booth);
    // Head height, so the view rides over it. It is honestly taller than that,
    // but it is a stall in the middle of a walkway: treating it as something
    // that blocks the camera pulls the view in every time somebody passes it,
    // which is what it has been doing.
    this.addCollider(concessionPosition.x, concessionPosition.z, 3.4, 2.8, 0.15, undefined, 'concession', 2.4);
  }

  private createPamphletStand(): void {
    const stand = new THREE.Group();
    stand.position.copy(pamphletPosition);
    this.mesh([2.1, 1.9, 1.2], [0, 0.95, 0], material(0x15171a, 0.72, 0.16), stand);
    this.mesh([2.35, 0.22, 1.45], [0, 2.02, -0.12], material(0xa91c24), stand);
    const shelf = this.mesh([1.75, 0.14, 0.82], [0, 1.55, 0.48], material(0xb99664), stand);
    shelf.rotation.x = -0.28;
    for (const x of [-0.58, 0, 0.58]) {
      const booklet = this.mesh([0.48, 0.05, 0.7], [x, 1.72, 0.43], material(x === 0 ? 0xf5efe2 : 0xa91c24), stand);
      booklet.rotation.x = -0.28;
    }
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.75, 0.72),
      new THREE.MeshBasicMaterial({ map: createTextTexture(['FESTIVAL', 'PAMPHLET']) }),
    );
    label.position.set(0, 0.75, 0.615);
    stand.add(label);
    this.scene.add(stand);
    // Chest height: the view rides over it rather than being stopped by it.
    this.addCollider(pamphletPosition.x, pamphletPosition.z, 2.2, 1.35, 0.12, undefined, 'pamphlet', 2.1);
  }

  private createPlayer(palette: AvatarPalette): void {
    this.playerRig = this.createAvatarRig(this.player, palette, true);
    this.populatePopcornProp(this.carriedProp);
    this.positionPopcornProp(this.carriedProp);
    this.player.add(this.carriedProp);
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.y = -AVATAR_GROUND_Y + 0.02;
    this.playerShadow.userData.projectorBackground = true;
    this.player.add(this.playerShadow);
    this.scene.add(this.player);

    this.originalPlayerIdleRig = this.createAvatarRig(this.originalPlayerIdle, palette, true);
    const idleShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
    );
    idleShadow.rotation.x = -Math.PI / 2;
    idleShadow.position.y = -AVATAR_GROUND_Y + 0.02;
    idleShadow.userData.projectorBackground = true;
    this.originalPlayerIdle.add(idleShadow);
    this.originalPlayerIdle.visible = false;
    this.scene.add(this.originalPlayerIdle);
  }

  private createNpcCrowd(): void {
    // The festival is its residents; a phone was being shown five of the twelve
    // and a square that looked deserted. Lite mode still gives up shadows, draw
    // scale and screen range, which is where the frames actually come from —
    // seven more voxel figures is a far cheaper thing to buy back.
    const count = DEFAULT_NPC_PROFILES.length;
    DEFAULT_NPC_PROFILES.slice(0, count).forEach((profile, index) => this.createNpcAvatar(profile, index));
    this.stationDj();
    this.stationRooftopDj();
    this.clubRegularsOpenTheFloor();
  }

  /** DR.BEAUTY holds the rooftop booth. */
  private stationRooftopDj(): void {
    const dj = this.npcs.find((npc) => npc.id === 'DRBEAUTY');
    if (!dj) return;
    const position = new THREE.Vector3(ROOFTOP_CENTER_X, ROOF_AVATAR_Y, rooftopBounds.deckMinZ + 2.6);
    dj.station = { position, rotationY: 0 };
    dj.pose = 'dj';
    dj.route = [position.clone()];
    dj.waypointIndex = 0;
    dj.group.position.copy(position);
    dj.group.rotation.y = 0;
  }

  /**
   * A few regulars hold the dance floor so the room is never empty. They keep
   * their own beat offset, otherwise the floor moves as one block.
   */
  /**
   * Where the club's regulars start the evening. They used to be stationed —
   * pinned to a point with the dance pose running — and then, briefly, pinned
   * to the room by a resident flag. Neither let them leave, and a basement
   * nobody can walk out of is as closed as one nobody can walk into.
   *
   * They are ordinary residents with ordinary circuits now. The club is simply
   * the venue they happen to open on, and they walk out of it up the stair like
   * anybody else when their dwell is up.
   */
  private clubRegularsOpenTheFloor(): void {
    // Kept north of the bar: the counter and its stools reach to about z = 9,
    // and a regular standing in that band reads as wedged into a seat.
    const spots: Array<[string, number, number]> = [
      ['SEBINE', -78, 5 + CLUB_Z],
      ['ZC', -58, 2 + CLUB_Z],
      ['LOUI', -68, -1 + CLUB_Z],
      ['VIOLA', -54, 9 + CLUB_Z],
    ];
    const round = NPC_HAUNTS.clubFloor;
    const now = performance.now();
    for (const [id, x, z] of spots) {
      const npc = this.npcs.find((candidate) => candidate.id === id && !candidate.dogRig);
      if (!npc) continue;
      npc.station = undefined;
      npc.pose = undefined;
      npc.haunt = 'clubFloor';
      npc.atNode = HAUNT_NODE.clubFloor;
      npc.transit = [];
      npc.tourIndex = npc.tour.indexOf('clubFloor');
      if (npc.tourIndex < 0) npc.tourIndex = 0;
      npc.dances = true;
      npc.group.position.set(x, CLUB_AVATAR_Y, z);
      npc.group.rotation.y = Math.atan2(-68 - x, 22.5 + CLUB_Z - z);
      npc.route = round.map(([px, pz]) => this.laneAdjusted(px, pz, npc.lane, CLUB_AVATAR_Y));
      npc.waypointIndex = this.nearestRouteIndex(npc, npc.group.position);
      // Staggered, so the four do not all climb the stair together.
      npc.dwellUntil = now + NPC_DWELL_MIN_MS + Math.random() * NPC_DWELL_SPREAD_MS;
      npc.waitUntil = now + Math.random() * 2_400;
      npc.stuckFor = 0;
    }
  }

  /** The resident DJ holds the booth instead of wandering the festival. */
  private stationDj(): void {
    const dj = this.npcs.find((npc) => npc.id === 'XIEHGAN');
    if (!dj) return;
    // Clear of the desk in front of them, not inside it.
    const position = new THREE.Vector3(-68, CLUB_AVATAR_Y + 0.9, 23.6 + CLUB_Z);
    dj.station = { position, rotationY: Math.PI };
    dj.pose = 'dj';
    dj.route = [position.clone()];
    dj.waypointIndex = 0;
    dj.group.position.copy(position);
    dj.group.rotation.y = Math.PI;
  }

  private createNpcAvatar(profile: NpcProfile, index: number): NpcAvatar {
    const npc = new THREE.Group();
    const hue = (index * 0.13 + 0.02) % 1;
    const shirtColor = `#${new THREE.Color().setHSL(hue, 0.48, 0.34).getHexString()}`;
    const npcPalette: AvatarPalette = {
      skin: index % 2 ? '#7a4a35' : '#b77856',
      hair: index % 3 ? '#171315' : '#3a241d',
      top: shirtColor,
      bottoms: '#20242c',
      swimwear: shirtColor,
    };
    const dogRig = profile.id === 'MENTOR' ? createMentorDog() : undefined;
    // MENTOR rides too, on a board cut down to a dog's length.
    const dogBoard = dogRig ? this.createSkateboard(dogRig.root, 0.72, -0.04) : undefined;
    const rig = dogRig ? undefined : this.createAvatarRig(npc, npcPalette);
    if (dogRig) npc.add(dogRig.root);
    const remoteCarriedProp = new THREE.Group();
    this.populatePopcornProp(remoteCarriedProp);
    this.positionPopcornProp(remoteCarriedProp, Boolean(dogRig));
    remoteCarriedProp.visible = false;
    npc.add(remoteCarriedProp);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createNameTexture(profile.name),
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }));
    badge.position.set(0, dogRig ? 1.9 : 3.48, 0);
    badge.scale.set(1.55, 0.39, 1);
    badge.visible = false;
    npc.add(badge);
    // Residents open on the venue they are spending their first dwell at, and
    // on that venue's own loop. They used to start on a separate list of hand
    // written rounds that nothing ever checked — and the first of them ran
    // along z = 15 from x = -9 to 9, which is straight through the popcorn
    // stand. MENTOR walked that one. Every loop here is walked by ?review=nav
    // and known to be clear.
    const startHaunt = NPC_TOUR[index % NPC_TOUR.length];
    const startFloor = NPC_HAUNT_FLOOR[startHaunt] ?? AVATAR_GROUND_Y;
    const routeTemplate = NPC_HAUNTS[startHaunt];
    // A lane of this resident's own, kept for as long as they exist, and
    // applied to every route they are ever handed. Ten places are shared
    // between twelve residents, and the routes themselves are shared lists of
    // points — so without this, everybody who visited a place walked the very
    // same line through the very same spots and piled into whoever was already
    // walking it. Stepped round a circle by a turn that never lines back up
    // with itself, so no two residents are ever given the same lane. It also
    // subsumes the old start-position nudge, which only moved the two that
    // wrapped and left them on the shared line regardless.
    const lane = new THREE.Vector2(
      Math.cos(index * 2.399) * NPC_LANE_RADIUS,
      Math.sin(index * 2.399) * NPC_LANE_RADIUS,
    );
    const route = routeTemplate.map(([x, z]) => this.laneAdjusted(x, z, lane, startFloor));
    // Spread round the loop rather than all stood on its first corner.
    npc.position.copy(route[index % route.length]);
    this.scene.add(npc);
    const avatar: NpcAvatar = {
      id: profile.id,
      name: profile.name,
      lane,
      // How far to the right of its own line of travel this one walks. Applied
      // across the direction of travel rather than in a fixed compass
      // direction: the lane above is a fixed vector, so on a link that happens
      // to run along it the offset slid a resident up and down the link
      // instead of across it, and two of them ended up on the same line.
      laneOffset: 0.5 + (index % 6) * 0.34,
      group: npc,
      badge,
      rig,
      dogRig,
      dogBoard,
      remoteCarriedProp,
      route,
      waypointIndex: 1,
      speed: 0.85 + (index % 4) * 0.13,
      waitUntil: index * 350,
      gestureUntil: 0,
      gesture: undefined,
      eatUntil: 0,
      phase: index * 0.81,
      stuckFor: 0,
      knockback: new THREE.Vector3(),
      // Spread round the circuit rather than bunched at its head, so every
      // venue has somebody in it from the moment the world opens.
      haunt: NPC_TOUR[index % NPC_TOUR.length],
      tour: tourFor(index),
      tourIndex: 0,
      transit: [],
      atNode: HAUNT_NODE[NPC_TOUR[index % NPC_TOUR.length]],
      dwellUntil: performance.now() + NPC_DWELL_MIN_MS + index * 4_000,
    };
    this.npcs.push(avatar);
    return avatar;
  }

  private pickUpMentor(): void {
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    if (!mentor?.dogRig || this.carriedItem === 'MENTOR') return;
    const discardedPopcorn = this.carriedItem === 'POPCORN' || this.stowedItem === 'POPCORN';
    this.carriedItem = 'MENTOR';
    this.mentorClaimPending = true;
    this.mentorReleasePending = false;
    this.stowedItem = undefined;
    this.carriedProp.visible = false;
    this.attachMentorToCarrier(mentor, this.activeCarrierGroup());
    mentor.waitUntil = Number.POSITIVE_INFINITY;
    mentor.stuckFor = 0;
    this.pickupUntil = performance.now() + 620;
    this.onAction({ type: 'mentor', active: true, discardedPopcorn });
  }

  private attachMentorToCarrier(mentor: NpcAvatar, carrier: THREE.Group): void {
    if (!mentor.dogRig) return;
    // When STAFF is playing as an NPC the regular player group is hidden.
    // Parent MENTOR to the avatar that is actually visible, otherwise the dog
    // inherits the hidden original avatar and disappears as soon as it is held.
    carrier.attach(mentor.group);
    // The dog is compact while carried and its four foot blocks rest just
    // above the avatar's hair instead of intersecting the head geometry.
    mentor.group.position.set(0, 3.52, 0.05);
    mentor.group.rotation.set(0, 0, 0);
    mentor.group.scale.setScalar(0.56);
    // Tuck all four legs inward into a compact perched pose. The leg pivots
    // no longer extend downward into the avatar's hair while MENTOR is carried.
    mentor.dogRig.leftFrontLeg.rotation.z = 1.08;
    mentor.dogRig.rightFrontLeg.rotation.z = -1.08;
    mentor.dogRig.leftBackLeg.rotation.z = 1.08;
    mentor.dogRig.rightBackLeg.rotation.z = -1.08;
    mentor.badge.visible = false;
  }

  private activeCarrierGroup(): THREE.Group {
    if (!this.controlledNpcId) return this.player;
    return this.npcs.find((npc) => npc.id === this.controlledNpcId)?.group ?? this.player;
  }

  private populatePopcornProp(prop: THREE.Group): void {
    this.mesh([0.42, 0.72, 0.42], [0, 0, 0], material(0xa91c24), prop);
    this.mesh([0.5, 0.38, 0.5], [0, 0.48, 0], material(0xffd767), prop);
  }

  private populateFoodProp(prop: THREE.Group, base: number, filling: number): void {
    this.mesh([0.5, 0.24, 0.34], [0, 0, 0], material(base, 0.55, 0.15), prop);
    this.mesh([0.42, 0.16, 0.26], [0, 0.16, 0], material(filling, 0.5, 0.15), prop);
  }

  private populateDrinkProp(prop: THREE.Group): void {
    this.mesh([0.3, 0.62, 0.3], [0, 0, 0], material(0x9fd8e8, 0.25, 0.5), prop);
    this.mesh([0.34, 0.1, 0.34], [0, -0.3, 0], material(0x2a2a32, 0.5, 0.4), prop);
    this.mesh([0.2, 0.16, 0.2], [0, 0.36, 0], material(0xffb347, 0.4, 0.3), prop);
  }

  private positionPopcornProp(prop: THREE.Group, dogCarrier = false): void {
    prop.position.set(dogCarrier ? 0.68 : -0.95, dogCarrier ? 0.82 : 1.38, dogCarrier ? 0.28 : -0.08);
    prop.rotation.set(0, 0, 0);
    prop.scale.setScalar(dogCarrier ? 0.78 : 1);
  }

  private syncCarriedPropAnchor(): void {
    const carrier = this.activeCarrierGroup();
    if (this.carriedProp.parent !== carrier) carrier.attach(this.carriedProp);
    const dogCarrier = this.npcs.some((npc) => npc.group === carrier && Boolean(npc.dogRig));
    this.positionPopcornProp(this.carriedProp, dogCarrier);
    if (this.carriedPropKind !== this.carriedItem) {
      this.carriedProp.clear();
      if (this.carriedItem === 'DRINK') this.populateDrinkProp(this.carriedProp);
      else if (this.carriedItem === 'HOTDOG') this.populateFoodProp(this.carriedProp, 0xd8642c, 0xf0d8a8);
      else if (this.carriedItem === 'PIZZA') this.populateFoodProp(this.carriedProp, 0xe0a52e, 0xc4482a);
      else if (this.carriedItem === 'CHICKEN') this.populateFoodProp(this.carriedProp, 0xc4842a, 0xe8d6a8);
      else this.populatePopcornProp(this.carriedProp);
      this.carriedPropKind = this.carriedItem;
    }
    this.carriedProp.visible = this.playerState !== 'swimming' &&
      Boolean(this.carriedItem) && this.carriedItem !== 'MENTOR';
  }

  private putDownMentor(emitAction = true): void {
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    if (!mentor?.dogRig || this.carriedItem !== 'MENTOR') return;
    const forward = new THREE.Vector3(Math.sin(this.player.rotation.y), 0, Math.cos(this.player.rotation.y));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const candidates = [
      this.player.position.clone().addScaledVector(forward, 1.75),
      this.player.position.clone().addScaledVector(right, 1.75),
      this.player.position.clone().addScaledVector(right, -1.75),
      this.player.position.clone().addScaledVector(forward, -1.75),
    ];
    const dropPosition = candidates.find((candidate) => !this.staticCollides(candidate.x, candidate.z)) ?? this.player.position.clone();
    // MENTOR always returns to solid ground, even if the attendee carries him
    // as far as the waterline before putting him down.
    dropPosition.z = Math.max(dropPosition.z, -57.3);
    this.scene.attach(mentor.group);
    mentor.group.scale.setScalar(1);
    mentor.dogRig.leftFrontLeg.rotation.set(0, 0, 0);
    mentor.dogRig.rightFrontLeg.rotation.set(0, 0, 0);
    mentor.dogRig.leftBackLeg.rotation.set(0, 0, 0);
    mentor.dogRig.rightBackLeg.rotation.set(0, 0, 0);
    mentor.group.position.set(dropPosition.x, AVATAR_GROUND_Y, dropPosition.z);
    mentor.group.rotation.set(0, this.player.rotation.y, 0);
    // Set down is not the same as sent away. The dog stays where it was left
    // and mills about there for a while before picking its round back up —
    // otherwise putting it down somewhere on purpose was pointless, because it
    // simply set off for the next venue on its circuit and left.
    mentor.transit = [];
    mentor.atNode = this.nearestNavNode(dropPosition);
    mentor.route = this.smallLoopAround(dropPosition);
    mentor.waypointIndex = this.nearestRouteIndex(mentor, dropPosition);
    mentor.dwellUntil = performance.now() + MENTOR_LINGER_MS;
    mentor.dances = false;
    mentor.recovering = false;
    mentor.waitUntil = performance.now() + 1250;
    mentor.stuckFor = 0;
    this.carriedItem = undefined;
    if (emitAction) {
      this.mentorReleasePending = true;
      this.onAction({ type: 'mentor', active: false });
    }
  }

  private syncSharedMentorCarrier(): void {
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    if (!mentor?.dogRig) return;
    if (!this.mentorCarrierId) {
      if (mentor.group.parent !== this.scene && this.carriedItem !== 'MENTOR') {
        const worldPosition = mentor.group.getWorldPosition(new THREE.Vector3());
        const worldRotation = mentor.group.getWorldQuaternion(new THREE.Quaternion());
        this.scene.attach(mentor.group);
        mentor.group.scale.setScalar(1);
        mentor.group.position.set(worldPosition.x, AVATAR_GROUND_Y, Math.max(worldPosition.z, -57.3));
        mentor.group.quaternion.copy(worldRotation);
        mentor.dogRig.leftFrontLeg.rotation.set(0, 0, 0);
        mentor.dogRig.rightFrontLeg.rotation.set(0, 0, 0);
        mentor.dogRig.leftBackLeg.rotation.set(0, 0, 0);
        mentor.dogRig.rightBackLeg.rotation.set(0, 0, 0);
        mentor.waitUntil = performance.now() + 600;
      }
      return;
    }
    if (this.mentorCarrierId === this.selfVisitorId && this.mentorReleasePending) return;
    const carrier = this.mentorCarrierId === this.selfVisitorId
      ? this.activeCarrierGroup()
      : this.remoteAvatars.get(this.mentorCarrierId)?.group;
    if (carrier && mentor.group.parent !== carrier) this.attachMentorToCarrier(mentor, carrier);
  }

  private isMentorControlLocked(): boolean {
    return this.controlledNpcId === 'MENTOR' && Boolean(this.mentorCarrierId) && this.mentorCarrierId !== this.selfVisitorId;
  }

  /**
   * Moves an NPC on to a different part of the festival once it has spent long
   * enough where it is. Stationed NPCs, the DJ among them, never shuffle.
   */
  /**
   * Moves a resident on to the next stop of their round once they have spent
   * long enough at this one.
   *
   * Two changes from the version that picked a haunt at random. The order is
   * now a fixed circuit, entered at a different point by each resident, so the
   * festival reads as a crowd going round it rather than people blinking
   * between spots. And the circuit takes in the club floor, the roof deck and
   * the temple, which nobody had ever been inside.
   *
   * Those three are on floors of their own, reached through a door and a stair
   * run that this routing cannot follow — it walks straight at the next
   * waypoint and gives up on whatever it bumps into. So a resident bound for
   * one of them is set down at its edge instead, and only while nobody is close
   * enough to watch it happen; if somebody is, the move waits. It is the same
   * bargain the crowd already makes at the edge of view, held to a distance
   * where it cannot be seen.
   */
  /**
   * A point on a shared route, moved into one resident's own lane. Routes hug
   * walls in places and a lane is a few metres wide, so where the offset would
   * put somebody inside the scenery it is given up for that point rather than
   * walking them into a building.
   */
  /**
   * A node, moved across the line of travel by as much of the given width as
   * will fit. Corridors are not all the same width — the stair down to the club
   * is eight across and the one up to the deck is under four — so a width that
   * is fine on the road puts a body in the handrail on the stair. Rather than
   * give the offset up entirely and put everybody back on one line, it is tried
   * at decreasing fractions and the widest clear one is taken.
   */
  private laneShifted(x: number, z: number, perpX: number, perpZ: number, width: number): THREE.Vector3 {
    for (const fraction of [1, 0.62, 0.34]) {
      const shiftedX = x + perpX * width * fraction;
      const shiftedZ = z + perpZ * width * fraction;
      const y = this.groundHeightAt(shiftedX, shiftedZ);
      if (!this.staticCollides(shiftedX, shiftedZ, y)) return new THREE.Vector3(shiftedX, y, shiftedZ);
    }
    return new THREE.Vector3(x, this.groundHeightAt(x, z), z);
  }

  private laneAdjusted(x: number, z: number, lane: THREE.Vector2, y: number): THREE.Vector3 {
    const shiftedX = x + lane.x;
    const shiftedZ = z + lane.y;
    if (this.staticCollides(shiftedX, shiftedZ, y)) return new THREE.Vector3(x, y, z);
    return new THREE.Vector3(shiftedX, y, shiftedZ);
  }

  /**
   * Sets a resident off for the next venue on its own circuit, on foot.
   *
   * It used to be put down at the destination whenever that destination was on
   * another storey and nobody was close enough to see it happen — which is why
   * the club could never fill while you were standing in it, and why anybody
   * leaving a room walked into its wall until the recovery threw them through
   * the ceiling. There is no placement left anywhere in here. The route is a
   * run of network links from the node underfoot to the node at the far end,
   * and the resident walks every metre of it: out of the room, up the stair,
   * along the road, and in through the next door.
   *
   * Reaching the end of the circuit wraps back to its start, so the round never
   * finishes.
   */
  private advanceNpcJourney(npc: NpcAvatar, now: number): void {
    if (npc.station || npc.transit.length > 0) return;
    if (!npc.dwellUntil || now < npc.dwellUntil) return;
    npc.tourIndex = (npc.tourIndex + 1) % npc.tour.length;
    const next = npc.tour[npc.tourIndex];
    const arriving = NPC_HAUNTS[next];
    const destination = HAUNT_NODE[next];
    if (!arriving || !destination) return;
    const floor = NPC_HAUNT_FLOOR[next] ?? AVATAR_GROUND_Y;
    const from = npc.atNode ?? HAUNT_NODE[npc.haunt ?? ''] ?? destination;
    const path = navPath(from, destination);
    // Each leg is walked to the right of its own centre line, by this
    // resident's own width. Two residents meeting head-on therefore pass on
    // opposite sides without having to agree on anything, and two going the
    // same way are spread across the link rather than queued along it.
    let fromX = npc.group.position.x;
    let fromZ = npc.group.position.z;
    npc.transit = path.map((node) => {
      const [x, z] = NAV_POINTS[node];
      const runX = x - fromX;
      const runZ = z - fromZ;
      const run = Math.hypot(runX, runZ) || 1;
      fromX = x;
      fromZ = z;
      return this.laneShifted(x, z, runZ / run, -runX / run, npc.laneOffset);
    });
    npc.atNode = destination;
    npc.haunt = next;
    // Held until it actually arrives, so a long walk is not cut short by the
    // dwell it has not started yet.
    npc.dwellUntil = Number.POSITIVE_INFINITY;
    npc.route = arriving.map(([x, z]) => this.laneAdjusted(x, z, npc.lane, floor));
    npc.waypointIndex = 0;
    npc.dances = false;
    npc.waitUntil = now;
    npc.stuckFor = 0;
  }

  /** Come to rest at the venue: wander its loop, and dance if the mood takes. */
  private arriveAtHaunt(npc: NpcAvatar, now: number): void {
    npc.dwellUntil = now + NPC_DWELL_MIN_MS + Math.random() * NPC_DWELL_SPREAD_MS;
    // Whether this one is in the mood, decided fresh on each visit so the same
    // resident is not always the one dancing.
    npc.dances = NPC_DANCE_HAUNTS.has(npc.haunt ?? '') && Math.random() < 0.55;
    npc.waypointIndex = this.nearestRouteIndex(npc, npc.group.position);
    npc.stuckFor = 0;
  }

  /** The network node nearest a point, by straight-line distance on the ground. */
  /**
   * A few paces' wander round a point, for a dog that has just been set down.
   * Corners that turn out to be inside something are given up rather than
   * walked into — the drop can be anywhere a visitor can stand, including
   * tight against a wall, so a fixed square around it is not always free.
   */
  private smallLoopAround(centre: THREE.Vector3): THREE.Vector3[] {
    const corners: Array<[number, number]> = [[1.6, 0], [0, 1.6], [-1.6, 0], [0, -1.6]];
    const loop: THREE.Vector3[] = [];
    for (const [offsetX, offsetZ] of corners) {
      const x = centre.x + offsetX;
      const z = Math.max(centre.z + offsetZ, -57.3);
      const y = this.groundHeightAt(x, z, centre.y);
      if (!this.staticCollides(x, z, y)) loop.push(new THREE.Vector3(x, y, z));
    }
    // Nowhere clear to pace: stand still rather than walk into the wall.
    if (loop.length === 0) loop.push(centre.clone());
    return loop;
  }

  private nearestNavNode(position: THREE.Vector3): string {
    let nearest = 'square';
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const [node, [x, z]] of Object.entries(NAV_POINTS)) {
      const distance = (x - position.x) ** 2 + (z - position.z) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = node;
      }
    }
    return nearest;
  }

  private nearestNavPoint(position: THREE.Vector3): THREE.Vector3 {
    const [x, z] = NAV_POINTS[this.nearestNavNode(position)];
    return new THREE.Vector3(x, this.groundHeightAt(x, z, position.y), z);
  }

  private nearestRouteIndex(npc: NpcAvatar, position: THREE.Vector3): number {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    npc.route.forEach((point, index) => {
      const distance = point.distanceToSquared(position);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });
    return nearestIndex;
  }

  private createRemoteAvatar(visitor: RemoteVisitorVisual): RemoteAvatar {
    const group = new THREE.Group();
    const rig = this.createAvatarRig(group, visitor.palette);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createNameTexture(visitor.name),
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }));
    badge.position.set(0, 3.48, 0);
    badge.scale.set(1.7, 0.42, 1);
    group.add(badge);
    const carriedProp = new THREE.Group();
    this.populatePopcornProp(carriedProp);
    this.positionPopcornProp(carriedProp);
    carriedProp.visible = visitor.state !== 'swimming' && visitor.carriedItem === 'POPCORN';
    group.add(carriedProp);
    // A new body starts at the height it was reported at, not at street level.
    group.position.set(
      visitor.x,
      typeof visitor.y === 'number' && Number.isFinite(visitor.y)
        ? visitor.y
        : (visitor.state === 'swimming' ? AVATAR_SWIM_Y : AVATAR_GROUND_Y),
      visitor.z,
    );
    group.rotation.y = visitor.rotation;
    group.userData.remoteVisitor = true;
    group.traverse((child) => child.layers.enable(1));
    this.scene.add(group);
    return {
      group,
      badge,
      target: group.position.clone(),
      previousTarget: group.position.clone(),
      targetAt: performance.now(),
      updateInterval: 220,
      targetRotation: visitor.rotation,
      previousRotation: visitor.rotation,
      state: visitor.state,
      running: visitor.running === true,
      rig,
      carriedProp,
      carriedItem: visitor.carriedItem,
      moving: visitor.moving,
      gestureUntil: visitor.gesture ? performance.now() + 900 : 0,
      gesture: visitor.gesture,
      animationPhase: 0,
      name: visitor.name,
    };
  }

  /**
   * A board under the feet, kept out of sight until someone runs. Built in the
   * same blocky idiom as everything else: a deck, two trucks, four wheels.
   */
  private createSkateboard(parent: THREE.Object3D, scale = 1, lift = 0): THREE.Group {
    const board = new THREE.Group();
    board.scale.setScalar(scale);
    board.position.set(0, lift, 0);
    const deckWood = material(0x3a2f2a, 0.62, 0.12);
    const grip = material(0x14151a, 0.95, 0.02);
    const truck = material(0x9aa1ab, 0.32, 0.68);
    const wheel = material(0xe8e2d2, 0.5, 0.1);
    // Turned across the direction of travel: the board runs under the stance
    // and the rider stands sideways on it.
    board.rotation.y = Math.PI / 2;

    // Measured down from the hips. The rider is lifted by SKATE_LIFT while
    // riding, which puts the road at -0.46 here: the wheels meet it, the deck
    // top meets the soles at -0.09, and nothing passes through anything.
    const deckY = -0.135;
    const baseplateY = -0.21;
    const hangerY = -0.28;
    const axleY = -0.33;
    this.mesh([2.0, 0.09, 0.66], [0, deckY, 0], deckWood, board);
    this.mesh([1.86, 0.025, 0.6], [0, deckY + 0.055, 0], grip, board);
    for (const end of [-1, 1]) {
      const kick = this.mesh([0.52, 0.09, 0.62], [end * 1.16, deckY + 0.1, 0], deckWood, board);
      kick.rotation.z = -end * 0.46;
      const kickGrip = this.mesh([0.46, 0.025, 0.56], [end * 1.16, deckY + 0.145, 0], grip, board);
      kickGrip.rotation.z = -end * 0.46;
    }
    for (const end of [-1, 1]) {
      this.mesh([0.34, 0.07, 0.42], [end * 0.66, baseplateY, 0], truck, board);
      this.mesh([0.16, 0.12, 0.52], [end * 0.66, hangerY, 0], truck, board);
      this.mesh([0.1, 0.07, 0.84], [end * 0.66, axleY, 0], truck, board);
      for (const side of [-1, 1]) {
        this.mesh([0.19, 0.26, 0.26], [end * 0.66, axleY, side * 0.39], wheel, board);
      }
    }
    board.visible = false;
    parent.add(board);
    return board;
  }

  /**
   * Regular stance: standing across the board, left foot over the front truck,
   * right over the tail, arms spread wide for balance.
   */
  private poseRigSkating(rig: AvatarRig, phase: number): void {
    // Riding is a crouch: the front knee stays folded and the back leg pushes
    // straighter, with the arms out and loose for balance.
    this.foldJoints(rig, 0.5, 0.5, 0.62 + Math.sin(phase) * 0.12, 0.3);
    const bob = Math.sin(phase * 1.6);
    rig.torso.rotation.y = 0;
    rig.torso.rotation.x = 0.15 + bob * 0.03;
    rig.torso.rotation.z = 0;
    // Looking along the board, over the leading shoulder.
    rig.head.rotation.set(0, -0.62, 0);
    // Knees soft, the front one driven a little further forward.
    rig.leftLeg.rotation.x = -0.2 - bob * 0.04;
    rig.leftLeg.rotation.z = 0.12;
    rig.rightLeg.rotation.x = 0.16 + bob * 0.04;
    rig.rightLeg.rotation.z = -0.1;
    // Straight out to the sides. A positive rotation about z swings an arm
    // towards +x, so the left arm needs a negative one to go outward — with
    // the signs the other way round both arms folded across the chest and
    // disappeared inside the torso, which is what read as arms cut off.
    rig.leftArm.rotation.x = bob * 0.06;
    rig.rightArm.rotation.x = -bob * 0.06;
    rig.leftArm.rotation.z = -1.42 - bob * 0.05;
    rig.rightArm.rotation.z = 1.42 + bob * 0.05;
    rig.board.visible = true;
  }

  /**
   * The restyled figure — tier three, for the avatars only, behind the same
   * flag as the shading.
   *
   * Every pivot keeps its name and its position, so animateRig, the seating,
   * the skateboard, the gestures and the collision all carry on untouched. What
   * changes is only the shape hanging underneath each one.
   *
   * Four moves, and the coat is not among them: the head drops to roughly a
   * sixth of the height so the figure reads adult rather than childlike; a hard
   * shoulder yoke sits proud of the torso as its own facet; the torso, arms and
   * legs all taper, so nothing is a rectangle; and the face is a single dark
   * band rather than modelled eyes and a mouth. The clothes stay ordinary and
   * every colour is still the visitor's own choice.
   */
  private createStyledAvatarRig(parent: THREE.Group, palette: AvatarPalette, markPalette: boolean): AvatarRig {
    window.setTimeout(() => this.castShadows(parent), 0);
    const shade = (slot: keyof AvatarPalette) =>
      material(Number.parseInt(palette[slot].replace('#', ''), 16), 0.86, 0.02);
    const add = (
      geometry: THREE.BufferGeometry,
      position: [number, number, number],
      slot: keyof AvatarPalette,
      target: THREE.Object3D,
    ) => {
      const part = new THREE.Mesh(geometry, shade(slot));
      part.position.set(...position);
      // The gate's live preview recolours by this, so a restyled part has to
      // carry it exactly as the old one did or the colour pickers go dead.
      if (markPalette) part.userData.paletteSlot = slot;
      // A person is not a wall: skin and hair take the shading but not the
      // surface grain.
      if (slot === 'skin' || slot === 'hair') part.material.userData.wornNoGrain = true;
      target.add(part);
      return part;
    };
    // The hard, unpainted parts: joints, visor, sole. Not on the palette,
    // because they are the through-line that holds a crowd of freely coloured
    // figures together now that no single accent does.
    const hardware = material(0x14161a, 0.62, 0.28);
    const shell = (
      geometry: THREE.BufferGeometry,
      position: [number, number, number],
      target: THREE.Object3D,
    ) => {
      const part = new THREE.Mesh(geometry, hardware);
      part.position.set(...position);
      target.add(part);
      return part;
    };

    // ---- pelvis --------------------------------------------------------
    // Stays on the body's own root, because a lean should bend above the waist
    // and leave the hips where the legs are.
    add(taperedPrism(0.42, 0.36, 0.42, 0.54), [0, 1.3, 0], 'bottoms', parent);

    // ---- spine ---------------------------------------------------------
    // Everything above the waist hangs off this, so bending it carries the
    // chest, the shoulders, both arms and the head together — which is what
    // separates a body leaning into a walk from a slab being twisted.
    const spine = new THREE.Group();
    spine.position.set(0, 1.55, 0);
    parent.add(spine);

    // Chest and waist as two pieces meeting at a narrow join, rather than one
    // taper running the whole way. The break at the waist is what stops the
    // body reading as a single carved lump.
    add(taperedPrism(0.56, 0.44, 0.86, 0.56), [0, 0.47, 0], 'top', spine);
    shell(taperedPrism(0.43, 0.4, 0.14, 0.54), [0, 0, 0], spine);

    // ---- shoulders -----------------------------------------------------
    // Caps that stand slightly proud of the body, which is the one silhouette
    // cue that reads at any distance and in any colour.
    shell(taperedPrism(0.64, 0.58, 0.1, 0.58), [0, 0.89, 0], spine);
    for (const side of [-1, 1]) {
      add(taperedPrism(0.2, 0.15, 0.22, 0.95), [side * 0.53, 0.81, 0], 'top', spine);
    }

    // ---- head ----------------------------------------------------------
    shell(taperedPrism(0.12, 0.15, 0.15, 1), [0, 1.0, 0], spine);
    const head = new THREE.Group();
    head.position.set(0, 1.05, 0);
    spine.add(head);
    add(taperedPrism(0.23, 0.27, 0.46, 0.94), [0, 0.23, 0], 'skin', head);
    add(taperedPrism(0.285, 0.26, 0.13, 0.98), [0, 0.43, -0.015], 'hair', head);
    // The band was always going to read as a visor, so it is one: wrapped
    // round the sides rather than stuck on the front, and in the same hardware
    // as the joints so the whole figure hangs together.
    const visor = new THREE.Mesh(taperedPrism(0.24, 0.25, 0.1, 1.02), hardware);
    visor.position.set(0, 0.245, 0.012);
    head.add(visor);

    const limb = (
      x: number,
      y: number,
      geometry: THREE.BufferGeometry,
      height: number,
      slot: keyof AvatarPalette,
      root: THREE.Object3D,
    ) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      root.add(pivot);
      add(geometry, [0, -height / 2, 0], slot, pivot);
      return pivot;
    };

    // ---- limbs ---------------------------------------------------------
    // Each limb is upper and lower with a narrow joint between, which is the
    // single most futuristic thing on the figure and costs nothing: the pieces
    // hang off the same pivot, so nothing about the animation changes.
    // Everything below the joint hangs off its own pivot, so the lower half of
    // a limb can move relative to the upper half instead of riding along with
    // it. The segments were already drawn this way; they simply had nothing to
    // turn about.
    const arm = (side: number) => {
      const pivot = limb(side * 0.56, 0.73, taperedPrism(0.115, 0.08, 0.6, 0.94), 0.6, 'top', spine);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.64, 0);
      pivot.add(elbow);
      shell(taperedPrism(0.075, 0.075, 0.09, 1), [0, 0, 0], elbow);
      add(taperedPrism(0.088, 0.07, 0.56, 0.94), [0, -0.33, 0], 'skin', elbow);
      shell(taperedPrism(0.085, 0.062, 0.16, 0.96), [0, -0.68, 0], elbow);
      return { pivot, joint: elbow };
    };
    const leg = (side: number) => {
      const pivot = limb(side * 0.24, 1.16, taperedPrism(0.185, 0.13, 0.66, 0.84), 0.66, 'bottoms', parent);
      const knee = new THREE.Group();
      knee.position.set(0, -0.71, 0);
      pivot.add(knee);
      shell(taperedPrism(0.115, 0.115, 0.1, 0.9), [0, 0, 0], knee);
      // The original figure's foot bottoms out 0.09 below the body's origin,
      // and the ground is placed against that. This leg was reaching to 0.205,
      // so the restyled figure stood a tenth of a unit deeper than the world
      // expected and its feet disappeared into the road. The shin is shortened
      // to bring the sole back to where the ground actually is.
      add(taperedPrism(0.132, 0.1, 0.39, 0.82), [0, -0.245, 0], 'bottoms', knee);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, 0.46), hardware);
      foot.position.set(0, -0.485, 0.08);
      knee.add(foot);
      return { pivot, joint: knee };
    };

    const left = arm(-1);
    const right = arm(1);
    const leftLower = leg(-1);
    const rightLower = leg(1);
    const leftArm = left.pivot;
    const rightArm = right.pivot;
    const leftLeg = leftLower.pivot;
    const rightLeg = rightLower.pivot;

    // The treat rides the forearm now, so a held thing follows the hand rather
    // than hanging in the air where the hand used to be.
    const treat = this.mesh([0.16, 0.16, 0.22], [0, -0.56, 0.16], material(0xd18a35, 0.78), right.joint);
    treat.visible = false;
    const board = this.createSkateboard(parent);
    return {
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      // The spine stands in for the torso, so every pose already written bends
      // the whole upper body without one line of those poses changing.
      torso: spine,
      treat,
      head,
      board,
      leftElbow: left.joint,
      rightElbow: right.joint,
      leftKnee: leftLower.joint,
      rightKnee: rightLower.joint,
    };
  }

  private createAvatarRig(parent: THREE.Group, palette: AvatarPalette, markPalette = false): AvatarRig {
    if (wornMeshesRequested()) return this.createStyledAvatarRig(parent, palette, markPalette);
    // Avatars are the one thing whose shadow is always worth its cost.
    window.setTimeout(() => this.castShadows(parent), 0);
    const addPart = (
      size: [number, number, number],
      position: [number, number, number],
      slot: keyof AvatarPalette,
      target: THREE.Object3D = parent,
    ) => {
      const part = this.mesh(
        size,
        position,
        material(Number.parseInt(palette[slot].replace('#', ''), 16), 0.82, 0.03),
        target,
      );
      if (markPalette) part.userData.paletteSlot = slot;
      if (slot === 'skin' || slot === 'hair') {
        (part.material as THREE.Material).userData.wornNoGrain = true;
      }
      return part;
    };
    const torso = addPart([1.02, 1.38, 0.62], [0, 1.78, 0], 'top');
    // The head pivots at the neck. It used to be a handful of parts fixed to
    // the body, so bowing tipped the torso and left the face pointing level.
    const head = new THREE.Group();
    head.position.set(0, 2.47, 0);
    parent.add(head);
    addPart([0.8, 0.82, 0.72], [0, 0.38, 0], 'skin', head);
    addPart([0.9, 0.34, 0.79], [0, 0.73, -0.02], 'hair', head);
    addPart([0.78, 0.4, 0.16], [0, 0.51, 0.34], 'hair', head);
    this.mesh([0.09, 0.1, 0.05], [-0.18, 0.37, 0.385], material(0x171315), head);
    this.mesh([0.09, 0.1, 0.05], [0.18, 0.37, 0.385], material(0x171315), head);
    this.mesh([0.24, 0.055, 0.05], [0, 0.17, 0.385], material(0x6f2e2b), head);

    const limb = (
      x: number,
      y: number,
      size: [number, number, number],
      slot: keyof AvatarPalette,
    ) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      parent.add(pivot);
      addPart(size, [0, -size[1] / 2, 0], slot, pivot);
      return pivot;
    };
    const leftArm = limb(-0.68, 2.2, [0.3, 1.22, 0.38], 'skin');
    const rightArm = limb(0.68, 2.2, [0.3, 1.22, 0.38], 'skin');
    const leftLeg = limb(-0.28, 1.16, [0.4, 1.25, 0.5], 'bottoms');
    const rightLeg = limb(0.28, 1.16, [0.4, 1.25, 0.5], 'bottoms');
    const treat = this.mesh([0.16, 0.16, 0.22], [0, -1.2, 0.16], material(0xd18a35, 0.78), rightArm);
    treat.visible = false;
    const board = this.createSkateboard(parent);
    return { leftArm, rightArm, leftLeg, rightLeg, torso, treat, head, board };
  }

  private createAtmosphere(): void {
    const count = this.graphicsMode === 'normal' ? 140 : 50;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 90;
      positions[index * 3 + 1] = Math.random() * 18 + 2;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xffe4b5, size: 0.05, transparent: true, opacity: 0.55 }),
    );
    particles.userData.projectorBackground = true;
    this.scene.add(particles);
  }

  private render = (): void => {
    if (this.disposed) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    this.reviewFrameCount += 1;
    this.reviewLastDelta = delta;
    this.waterTextures[0]?.offset.set((elapsed * 0.004) % 1, (elapsed * 0.0015) % 1);
    this.waterTextures[1]?.offset.set((-elapsed * 0.006) % 1, (elapsed * 0.003) % 1);
    this.tuneRenderScale(performance.now());
    this.updatePlayer(delta);
    this.updateNpcs(delta, elapsed);
    this.updateRemoteAvatars(delta, elapsed);
    this.updateCamera(delta, elapsed);
    // Cheap: it compares one venue key and returns, unless somebody has just
    // walked into or out of a room.
    this.updateProjectorMounts();
    const dayNight = this.dayNight.update();
    this.updateWaterReflections(elapsed);
    this.updateStylizedWater(elapsed);
    this.updateWaterLayers();
    this.updateFireworks(delta, performance.now());
    this.updateClubBeat(elapsed);
    if (this.templeAura) {
      // The presence breathes rather than sitting there painted on.
      const auraMaterial = this.templeAura.material as THREE.MeshBasicMaterial;
      auraMaterial.opacity = 0.12 + Math.sin(elapsed * 0.9) * 0.05;
    }
    this.updateLampPool();
    this.camera.layers.set(0);
    this.renderer.render(this.scene, this.camera);
    const visibleProjectors: VenueKey[] = [];
    const visibleProjectorScissors = new Map<VenueKey, { x: number; y: number; width: number; height: number }>();
    const boardScissor = this.programmeBoardScissor();
    this.reviewSuppressedProjectors = [];
    for (const [venue, projector] of this.projectors) {
      const screen = venueScreens[venue];
      this.projectorWorldPosition.set(...screen.position);
      this.camera.getWorldDirection(this.cameraDirection);
      this.cameraToProjector.subVectors(this.projectorWorldPosition, this.camera.position);
      this.projectorNdc.copy(this.projectorWorldPosition).project(this.camera);
      const screenIsInFront = this.cameraToProjector.dot(this.cameraDirection) > 0;
      const screenTouchesViewport = Math.abs(this.projectorNdc.x) < 1.9 &&
        Math.abs(this.projectorNdc.y) < 1.65 && this.projectorNdc.z > -1 && this.projectorNdc.z < 1;
      // The CSS3D layer draws over the WebGL scene and cannot be occluded by
      // walls, so an interior screen has to be gated on being in that room and
      // the outdoor screens on being outside it.
      const insideClub = this.inClub(this.player.position.x, this.player.position.z);
      const onDeck = this.onRooftop(this.player.position.x, this.player.position.z);
      const roomMatches = venue === 'club'
        ? this.inClubRoom(this.player.position.x, this.player.position.z)
        : venue === 'rooftop' ? onDeck : (!insideClub && !onDeck);
      // Every live panel costs twice: once as a video composited over the
      // canvas, and again in the pass that redraws scene geometry back over it.
      // Standing in the square, three or four were being paid for at ranges
      // where the picture is a few pixels across and nobody could tell what was
      // on. Past this they are dropped; the programme itself is unaffected,
      // because the running order is kept by the service and not by the panel.
      // Generous on a desktop and tight on a phone. The festival is about a
      // hundred and forty deep, so the desktop figure only drops a screen at
      // the far corners of the map — where it is a handful of pixels — and
      // leaves every view anybody actually stands in looking as it did. The
      // phone gives up more, which is the trade that was asked for there.
      // Forty-six was far too tight: standing in the square on a phone, every
      // screen in the festival was outside it and nothing appeared to be
      // playing at all. A screening you cannot see is not a saving, it is a
      // missing festival. Ninety keeps the square's screens live and still
      // drops the ones across the map.
      // One distance for every device now. A phone had a shorter reach than a
      // desk, so the same walk up to the same screen showed a picture on one and
      // an empty frame on the other — which is the difference that was being
      // felt. Whatever a phone gives up, it should not be a different festival.
      const range = 120;
      const withinRange = this.cameraToProjector.length() < range;
      // With no iframe there is no DOM picture to mask: the ordinary WebGL
      // screen already supplies the black physical surface and occludes
      // correctly on its own. Running the second renderer for an empty CSS
      // panel only repainted its scissor rectangle over nearby geometry — the
      // persistent translucent block beside the timetable — and paid for an
      // otherwise useless scene pass.
      // Gate both compositor layers from the camera, not the avatar. Orbiting
      // can put the camera behind a screen while the avatar remains in front;
      // the CSS backface then disappears but the foreground mask keeps drawing,
      // turning the black rear panel into a clipped portal through the venue.
      const cameraOnViewingSide = (this.camera.position.z - screen.position[2]) * screen.facing > 0.02;
      const wantsVisible = Boolean(projector.iframe) && roomMatches && withinRange &&
        cameraOnViewingSide &&
        screenIsInFront && screenTouchesViewport;
      const compositorScissor = wantsVisible ? this.projectorScissor(venue) : undefined;
      // CSS3D video always sits above the main WebGL canvas. Its transparent
      // foreground mask is the hard rectangle the user kept seeing across the
      // timetable. If the timetable is closer to the camera and their screen
      // rectangles overlap, the video is genuinely hidden by the timetable;
      // suppress both CSS video and mask until the camera moves clear. This
      // removes the rectangle instead of trying to shade-match it.
      const timetableBlocksProjector = Boolean(boardScissor && compositorScissor &&
        this.programmeBoardIsInFrontOfProjector(venue) && this.scissorsOverlap(boardScissor, compositorScissor));
      const visible = wantsVisible && Boolean(compositorScissor) && !timetableBlocksProjector;
      if (wantsVisible && timetableBlocksProjector) this.reviewSuppressedProjectors.push(venue);
      // Coming back into view, ask it to play. A player that a phone stopped
      // while it was out of sight — or while the browser was in the background,
      // which phones do on their own — otherwise stays stopped once it is
      // looked at again, and the screen sits there showing a still.
      if (visible && projector.element.style.visibility === 'hidden' && !projector.paused) {
        projector.iframe?.contentWindow?.postMessage(JSON.stringify({
          event: 'command', func: 'playVideo', args: [],
        }), '*');
      }
      projector.element.style.visibility = visible ? 'visible' : 'hidden';
      if (visible && compositorScissor) {
        visibleProjectors.push(venue);
        visibleProjectorScissors.set(venue, compositorScissor);
      }
    }
    if (visibleProjectors.length) this.cssRenderer.render(this.cssScene, this.camera);
    this.foregroundCanvas.style.visibility = visibleProjectors.length ? 'visible' : 'hidden';
    if (visibleProjectors.length) {
      const sceneBackground = this.scene.background;
      this.scene.background = null;
      this.camera.layers.set(1);
      this.foregroundRenderer.autoClear = false;
      this.foregroundRenderer.setScissorTest(false);
      this.foregroundRenderer.clear(true, true, false);
      this.foregroundRenderer.setScissorTest(true);
      const farthestFirst = visibleProjectors.sort(
        (a, b) => venueScreens[a].position[2] - venueScreens[b].position[2],
      );
      for (const venue of farthestFirst) {
        const scissor = visibleProjectorScissors.get(venue);
        if (!scissor) continue;
        // Keep the half of the scene between the screen and the viewer. Which
        // half that is depends on the side the screen is watched from.
        const facing = venueScreens[venue].facing;
        this.projectorClipPlane.normal.set(0, 0, facing);
        this.projectorClipPlane.constant = -venueScreens[venue].position[2] * facing;
        this.foregroundRenderer.setScissor(scissor.x, scissor.y, scissor.width, scissor.height);
        this.foregroundRenderer.clear(true, true, false);
        this.foregroundRenderer.render(this.scene, this.camera);
      }
      this.foregroundRenderer.setScissorTest(false);
      this.foregroundRenderer.autoClear = true;
      this.camera.layers.set(0);
      this.scene.background = sceneBackground;
    }

    const now = performance.now();
    if (now - this.lastSnapshotAt > 200) {
      this.onSnapshot({
        cameraMode: this.cameraMode,
        location: this.locationName(),
        dayNight,
        playerState: this.playerState,
        inTheater: this.inTheater(),
        screeningVenue: this.screeningVenue(),
        outfit: this.outfit,
        carriedItem: this.carriedItem,
        stowedItem: this.stowedItem,
        hasPamphlet: this.hasPamphlet,
        npcCount: this.npcs.length,
        interaction: this.interactionLabel(),
        canInteract: this.canInteract(),
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
        rotation: this.player.rotation.y,
        moving: !this.isMentorControlLocked() && this.moveVector.lengthSq() > 0.0001,
        running: this.running && !this.dancing && this.playerState === 'walking',
        gesture: this.dancing
          ? 'dance'
          : performance.now() < this.playerGestureUntil ? this.playerGesture : undefined,
      });
      this.lastSnapshotAt = now;
    }
    this.animationFrame = requestAnimationFrame(this.render);
  };

  /**
   * Keeps the cel-shaded sea in step with the sky. The glint band is aimed at
   * whichever of the sun or moon is up, so the light on the water tracks the
   * body that is actually casting it.
   */
  /**
   * The sea is drawn as several stacked sheets: a body, a surface, a cel-shaded
   * top and the sun's glitter, none of which write depth. Seen from the
   * promenade they cover a strip of the screen and cost nothing to speak of.
   * Swimming puts the camera on the waterline, where every one of them fills
   * the whole frame at once and the page is left shading the same pixels five
   * times over — geometry is only four thousand triangles, so this is the
   * entire cost. Close to the surface, only the sheets that can actually be
   * told apart are drawn.
   */
  private updateWaterLayers(): void {
    const stylised = this.stylizedWater?.visible !== false && this.graphicsMode === 'normal';
    // Height of the eye above the water, not the avatar's: the camera is what
    // decides how much of the screen these sheets cover.
    const eyeAboveWater = this.camera.position.y - 0.14;
    // Only when the eye is genuinely grazing the surface. The swimming camera
    // is now held well above that, so the sea keeps all of its sheets — and its
    // glitter — at the height an attendee actually sees it from.
    const nearSurface = eyeAboveWater < 1.5 && this.camera.position.z < -40;
    if (this.waterVolume) {
      // The body below the surface. From above it gives the sea its depth;
      // from the waterline it is edge-on and doubles the fill for nothing,
      // and it is double-sided, so it costs twice again.
      this.waterVolume.visible = !nearSurface;
    }
    if (this.waveSurface) {
      // Ripple detail that only reads under the cel-shaded top. With that in
      // place at eye level it is a second full-screen wash of the same colour.
      this.waveSurface.visible = !(nearSurface && stylised);
    }
    for (const reflection of this.waterReflections) {
      // Glitter is a highlight seen across a surface. At eye level it is a
      // full-screen additive pass and reads as haze.
      if (nearSurface) reflection.mesh.visible = false;
    }
  }

  private updateStylizedWater(elapsed: number): void {
    const material = this.stylizedWaterMaterial;
    if (!material || !this.stylizedWater?.visible) return;
    material.uniforms.uTime.value = elapsed;
    (material.uniforms.uCamXZ.value as THREE.Vector2).set(this.camera.position.x, this.camera.position.z);

    const state = this.dayNight.getWaterReflectionState();
    const night = state.moon.strength > state.sun.strength;
    const body = night ? state.moon : state.sun;
    tintStylizedWater(material, night
      ? { deep: 0x0a2233, mid: 0x1d4d66, highlight: 0xbcd8ea, glint: body.color, glintStrength: body.strength * 0.55 }
      : { deep: 0x0d3346, mid: 0x2f7f96, highlight: 0xe4f6f6, glint: body.color, glintStrength: body.strength * 0.65 });
    (material.uniforms.uGlintOrigin.value as THREE.Vector2).set(body.x, -70);

    // A ring follows an attendee who is in the water.
    const ripple = material.uniforms.uRipple.value as THREE.Vector3;
    if (this.playerState === 'swimming') {
      ripple.set(this.player.position.x, this.player.position.z, 0.9 + Math.sin(elapsed * 1.6) * 0.5);
    } else {
      ripple.z = 0;
    }
  }

  private updateWaterReflections(elapsed: number): void {
    const state = this.dayNight.getWaterReflectionState();
    for (const reflection of this.waterReflections) {
      const light = state[reflection.kind];
      reflection.mesh.position.x = THREE.MathUtils.clamp(light.x * 0.78, -48, 48);
      reflection.mesh.scale.x = THREE.MathUtils.lerp(15, 5.5, light.elevation);
      reflection.mesh.scale.y = THREE.MathUtils.lerp(41, 24, light.elevation);
      // Keep the glitter on the water. Its far end used to reach several units
      // up the beach, brightening the sand along the shore.
      reflection.mesh.position.z = Math.min(
        -69.5 - light.elevation * 3,
        SHORE_Z - 1.5 - reflection.mesh.scale.y / 2,
      );
      reflection.mesh.rotation.z = Math.sin(elapsed * 0.22 + (reflection.kind === 'moon' ? 1.8 : 0)) * 0.018;
      reflection.material.color.copy(light.color);
      reflection.material.opacity = light.strength * (0.72 + Math.sin(elapsed * 1.7) * 0.06);
      reflection.mesh.visible = reflection.material.opacity > 0.01;
    }
  }

  private updateFireworks(delta: number, now: number): void {
    const running = now < this.fireworksUntil;
    const rocketCap = this.graphicsMode === 'normal' ? 2 : 1;
    const burstCap = this.graphicsMode === 'normal' ? 4 : 2;
    if (running && now >= this.nextFireworkAt && this.fireworkRockets.length < rocketCap && this.fireworkBursts.length < burstCap) {
      this.spawnFireworkRocket();
      const finale = this.fireworksUntil - now < 20_000;
      const minimum = finale ? (this.graphicsMode === 'normal' ? 520 : 900) : (this.graphicsMode === 'normal' ? 950 : 1_450);
      const spread = finale ? (this.graphicsMode === 'normal' ? 380 : 520) : (this.graphicsMode === 'normal' ? 550 : 650);
      this.nextFireworkAt = now + minimum + Math.random() * spread;
    }

    for (let index = this.fireworkRockets.length - 1; index >= 0; index -= 1) {
      const rocket = this.fireworkRockets[index];
      rocket.mesh.position.y += rocket.velocity * delta;
      rocket.velocity -= 1.15 * delta;
      const positions = rocket.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let trailIndex = 0; trailIndex < positions.count; trailIndex += 1) {
        positions.setXYZ(
          trailIndex,
          rocket.mesh.position.x,
          rocket.mesh.position.y - trailIndex * 0.38,
          rocket.mesh.position.z,
        );
      }
      positions.needsUpdate = true;
      if (rocket.mesh.position.y < rocket.targetY) continue;
      this.explodeFirework(rocket);
      this.fireworkRockets.splice(index, 1);
    }

    for (let index = this.fireworkBursts.length - 1; index >= 0; index -= 1) {
      const burst = this.fireworkBursts[index];
      burst.age += delta;
      const fade = Math.max(0, 1 - burst.age / burst.lifetime);
      const positions = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const positionArray = positions.array as Float32Array;
      const horizontalDrag = Math.pow(0.988, delta * 60);
      const verticalDrag = Math.pow(0.991, delta * 60);
      for (let offset = 0; offset < positionArray.length; offset += 3) {
        burst.velocities[offset] *= horizontalDrag;
        burst.velocities[offset + 1] = burst.velocities[offset + 1] * verticalDrag - 3.1 * delta;
        burst.velocities[offset + 2] *= horizontalDrag;
        positionArray[offset] += burst.velocities[offset] * delta;
        positionArray[offset + 1] += burst.velocities[offset + 1] * delta;
        positionArray[offset + 2] += burst.velocities[offset + 2] * delta;
      }
      positions.needsUpdate = true;
      burst.points.material.opacity = Math.pow(fade, 1.35);
      burst.currentIntensity = burst.peakIntensity * Math.pow(fade, 2.2) * (0.82 + Math.random() * 0.18);
      burst.reflection.material.opacity = 0.52 * Math.pow(fade, 1.7);
      burst.reflection.scale.x = 10 + burst.age * 4;
      burst.reflection.scale.y = 30 + burst.age * 8;
      if (burst.age < burst.lifetime) continue;
      this.removeFireworkBurst(burst);
      this.fireworkBursts.splice(index, 1);
    }
    this.updateFireworkWorldLight();
  }

  private updateFireworkWorldLight(): void {
    let brightest: FireworkBurst | undefined;
    for (const burst of this.fireworkBursts) {
      if (!brightest || burst.currentIntensity > brightest.currentIntensity) brightest = burst;
    }
    if (brightest) {
      this.fireworkWorldLight.position.copy(brightest.origin);
      this.fireworkWorldLight.color.copy(brightest.points.material.color);
      this.fireworkWorldLight.intensity = brightest.currentIntensity;
      return;
    }
    const rocket = this.fireworkRockets[0];
    if (rocket) {
      this.fireworkWorldLight.position.copy(rocket.mesh.position);
      this.fireworkWorldLight.color.copy(rocket.colour);
      this.fireworkWorldLight.intensity = 34;
      return;
    }
    this.fireworkWorldLight.intensity = 0;
  }

  private spawnFireworkRocket(): void {
    const colours = [0xff3158, 0xffc83d, 0x62d6ff, 0x9f70ff, 0x52ed94, 0xff8a42];
    const colour = new THREE.Color(colours[Math.floor(Math.random() * colours.length)]);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.graphicsMode === 'normal' ? 0.16 : 0.2, 6, 5),
      new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }),
    );
    // Kept in the part of the horizon visible from the Shore: the earlier,
    // wider arc was physically over the sea but most bursts opened just beyond
    // a normal camera's vertical or horizontal field of view.
    mesh.position.set(THREE.MathUtils.randFloat(-34, 34), 0.8, THREE.MathUtils.randFloat(-101, -88));
    mesh.userData.projectorBackground = true;
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({
      color: colour,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    trail.userData.projectorBackground = true;
    this.scene.add(mesh, trail);
    this.fireworkRockets.push({
      mesh,
      trail,
      velocity: THREE.MathUtils.randFloat(16.5, 21.5),
      targetY: THREE.MathUtils.randFloat(13, 24),
      colour,
    });
  }

  private explodeFirework(rocket: FireworkRocket): void {
    const origin = rocket.mesh.position.clone();
    this.removeFireworkRocket(rocket);
    const count = this.graphicsMode === 'normal' ? 40 : 24;
    const pattern = Math.floor(Math.random() * 4);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      positions[offset] = origin.x;
      positions[offset + 1] = origin.y;
      positions[offset + 2] = origin.z;
      const speed = THREE.MathUtils.randFloat(5.2, 10.5);
      if (pattern === 1) {
        const angle = index / count * Math.PI * 2;
        velocities[offset] = Math.cos(angle) * speed;
        velocities[offset + 1] = Math.sin(angle) * speed;
        velocities[offset + 2] = THREE.MathUtils.randFloatSpread(1.7);
      } else if (pattern === 2) {
        velocities[offset] = THREE.MathUtils.randFloatSpread(7.5);
        velocities[offset + 1] = THREE.MathUtils.randFloat(3.5, 10.5);
        velocities[offset + 2] = THREE.MathUtils.randFloatSpread(5.2);
      } else if (pattern === 3) {
        const spoke = index % 12 / 12 * Math.PI * 2;
        const reach = THREE.MathUtils.randFloat(0.35, 1);
        velocities[offset] = Math.cos(spoke) * speed * reach;
        velocities[offset + 1] = (3.2 + Math.sin(spoke) * 4.2) * reach;
        velocities[offset + 2] = THREE.MathUtils.randFloatSpread(2.8);
      } else {
        const vertical = THREE.MathUtils.randFloatSpread(2);
        const angle = Math.random() * Math.PI * 2;
        const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical * 0.25));
        velocities[offset] = Math.cos(angle) * horizontal * speed;
        velocities[offset + 1] = vertical * speed * 0.5;
        velocities[offset + 2] = Math.sin(angle) * horizontal * speed * 0.72;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: rocket.colour,
      size: this.graphicsMode === 'normal' ? 0.92 : 1.12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    points.userData.projectorBackground = true;
    points.frustumCulled = false;
    const peakIntensity = this.graphicsMode === 'normal' ? 165 : 110;

    const reflectionMaterial = new THREE.MeshBasicMaterial({
      color: rocket.colour,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const reflection = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), reflectionMaterial);
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.set(origin.x * 0.82, 0.158, THREE.MathUtils.clamp(origin.z + 21, -88, -66));
    reflection.scale.set(10, 30, 1);
    reflection.renderOrder = 5;
    reflection.userData.projectorBackground = true;
    this.scene.add(points, reflection);
    this.fireworkBursts.push({
      points,
      velocities,
      reflection,
      origin,
      age: 0,
      lifetime: THREE.MathUtils.randFloat(2.4, 3.8),
      peakIntensity,
      currentIntensity: peakIntensity,
    });
  }

  private removeFireworkRocket(rocket: FireworkRocket): void {
    this.scene.remove(rocket.mesh, rocket.trail);
    rocket.mesh.geometry.dispose();
    rocket.mesh.material.dispose();
    rocket.trail.geometry.dispose();
    rocket.trail.material.dispose();
  }

  private removeFireworkBurst(burst: FireworkBurst): void {
    this.scene.remove(burst.points, burst.reflection);
    burst.points.geometry.dispose();
    burst.points.material.dispose();
    burst.reflection.geometry.dispose();
    burst.reflection.material.dispose();
  }

  private updatePlayer(delta: number): void {
    if (this.originalPlayerIdle.visible && this.originalPlayerIdleRig) {
      this.animateRig(this.originalPlayerIdleRig, this.clock.elapsedTime * 1.2, 0.025);
    }
    if (this.isMentorControlLocked()) {
      const carrier = this.mentorCarrierId ? this.remoteAvatars.get(this.mentorCarrierId) : undefined;
      if (carrier) {
        const carrierPosition = carrier.group.getWorldPosition(new THREE.Vector3());
        this.player.position.set(carrierPosition.x, AVATAR_GROUND_Y, carrierPosition.z);
        this.player.rotation.y = carrier.group.rotation.y;
      }
      this.playerState = 'walking';
      this.moveVector.set(0, 0, 0);
      this.player.visible = false;
      if (this.playerRig) this.animateRig(this.playerRig, this.clock.elapsedTime * 1.2, 0.018);
      return;
    }
    if (this.playerState === 'seated') {
      this.moveVector.set(0, 0, 0);
      this.player.visible = !this.controlledNpcId;
      this.syncCarriedPropAnchor();
      if (this.playerRig) {
        // The gesture was never handed over, so a drink taken on a stool was
        // felt — the glass left your hand, the count went up — and never seen.
        const seatedGesture = performance.now() < this.playerGestureUntil ? this.playerGesture : undefined;
        this.animateRig(
          this.playerRig,
          this.clock.elapsedTime * 1.2,
          0.018,
          seatedGesture,
          false,
          this.gestureProgress(seatedGesture, this.playerGestureUntil),
        );
        this.poseRigSeated(this.playerRig, seatedGesture);
      }
      return;
    }
    const keyed = Math.hypot(this.stickX, this.stickY) < 0.001;
    const horizontal = keyed
      ? Number(this.keys.has('d') || this.keys.has('arrowright')) -
        Number(this.keys.has('a') || this.keys.has('arrowleft'))
      : this.stickX;
    const vertical = keyed
      ? Number(this.keys.has('s') || this.keys.has('arrowdown')) -
        Number(this.keys.has('w') || this.keys.has('arrowup'))
      : this.stickY;
    this.moveVector.set(horizontal, 0, vertical);
    if (this.moveVector.lengthSq() > 0) {
      this.dancing = false;
      const running = this.running && !this.dancing;
      const speed = this.playerState === 'swimming'
        ? (running ? 6.2 : 4.1)
        : (running ? 12.4 : 7.2);
      // Winded by the landing: the legs are under you again but not yet
      // carrying you at full pace.
      const recovering = performance.now() < this.stumbleUntil ? 0.42 : 1;
      this.movePlayer(horizontal, vertical, speed * recovering * delta);
    }
    this.applyKnockback(delta);

    const shouldWearSwimwear = this.player.position.z < -58.2;
    if (shouldWearSwimwear !== (this.outfit === 'swimwear')) this.setOutfit(shouldWearSwimwear);
    const shouldSwim = this.player.position.z < -60;
    this.setSwimming(shouldSwim);

    if (this.playerState === 'swimming') {
      // Keep the head, torso, and arms clearly above the waterline. Swimming is
      // a continuous movement state; E remains available for nearby greetings.
      this.player.position.y = AVATAR_SWIM_Y + Math.sin(this.clock.elapsedTime * 3.2) * 0.035;
      this.player.rotation.x = 0;
      this.player.rotation.z = Math.sin(this.clock.elapsedTime * 2.1) * 0.025;
    } else {
      const ground = this.groundHeightAt(this.player.position.x, this.player.position.z);
      if (this.airborne) {
        this.verticalVelocity -= GRAVITY * delta;
        this.player.position.y += this.verticalVelocity * delta;
        if (this.player.position.y <= ground) {
          const impact = -this.verticalVelocity;
          this.player.position.y = ground;
          this.verticalVelocity = 0;
          this.airborne = false;
          if (impact > STUMBLE_IMPACT) {
            // The further the drop the longer the recovery, up to a limit: a
            // fall from the roof should cost a moment, not a punishment.
            const severity = THREE.MathUtils.clamp((impact - STUMBLE_IMPACT) / 10, 0, 1);
            this.stumbleUntil = performance.now() + 320 + severity * 460;
            this.playerGesture = 'stumble';
            this.playerGestureUntil = this.stumbleUntil;
            this.dancing = false;
          }
        }
      } else if (this.player.position.y - ground > LEDGE_DROP) {
        // Walked off an edge. The body used to be pinned to whatever floor was
        // underneath it, so stepping off the deck teleported the attendee to
        // the street; now they fall.
        this.airborne = true;
        this.verticalVelocity = 0;
      } else {
        this.player.position.y = ground + (this.skating ? SKATE_LIFT : 0);
      }
      this.player.rotation.x = 0;
      this.player.rotation.z = 0;
    }
    this.player.visible = !this.controlledNpcId && this.cameraMode !== 'first-person';
    this.player.scale.setScalar(1);
    this.syncCarriedPropAnchor();
    if (this.playerRig) {
      const moving = this.moveVector.lengthSq() > 0;
      const gesture = this.dancing
        ? 'dance'
        : performance.now() < this.playerGestureUntil ? this.playerGesture : undefined;
      // Running lengthens the stride and quickens the cadence together; only
      // raising one reads as a walk played back at the wrong speed.
      const running = this.running && moving && !this.dancing;
      const cadence = moving ? (running ? 12.6 : 8.5) : 1.4;
      const stride = this.playerState === 'swimming'
        ? (moving ? (running ? 0.42 : 0.3) : 0.025)
        : (moving ? (running ? 1.02 : 0.72) : 0.035);
      // On land a run is a ride; in the water it stays a swim.
      const skating = running && this.playerState === 'walking';
      this.skating = skating;
      this.animateRig(
        this.playerRig, this.clock.elapsedTime * cadence, stride, gesture, skating,
        this.gestureProgress(gesture, this.playerGestureUntil),
      );
      if (running && !skating && this.playerState !== 'swimming') {
        // Leaning into the run, and the arms driving rather than swinging.
        this.playerRig.torso.rotation.x = 0.16;
        this.playerRig.leftArm.rotation.x *= 1.25;
        this.playerRig.rightArm.rotation.x *= 1.25;
      } else if (this.playerState !== 'swimming' && !gesture) {
        // Only undoes the run's lean. Without the gesture check this also
        // flattened every pose that bends the body — the bow, the offering,
        // the stagger — leaving the head tipped over a torso stood bolt
        // upright. animateRig already clears the lean when nothing is posed.
        this.playerRig.torso.rotation.x = 0;
      }
      if (this.playerState === 'swimming' && moving && !gesture) {
        const paddle = Math.sin(this.clock.elapsedTime * 6.6);
        this.playerRig.leftArm.rotation.x = paddle * 0.72;
        this.playerRig.rightArm.rotation.x = -paddle * 0.72;
      }
      if (performance.now() < this.pickupUntil) this.playerRig.leftArm.rotation.x = -1.15;
    }
  }

  /**
   * How far east and west the walkable ground reaches at a given depth. Held as
   * two independent limits rather than one symmetric one, and with the bands
   * overlapping along z, because the old single limit changed value halfway
   * across the Rooftop's forecourt: an attendee walking up from the Drive-In
   * was snapped back onto the road, which is why the food stalls could only be
   * reached from one direction.
   */
  private walkableXRange(z: number): { min: number; max: number } {
    // The beach, The Palace and the Drive-In share one wide strip.
    if (z < -8) return { min: -55, max: 55 };
    let min = -14;
    let max = 14;
    // The Basement's plot, west of the road.
    if (z > -11 && z < GATE_Z - 2) min = clubBounds.buildingMinX - 9;
    // The Rooftop's plot and the forecourt in front of it, east of the road.
    // The forecourt starts south of the promenade, so this band has to reach
    // past z = 0 to meet the strip below it.
    // Reaches as far north as The Basement's plot does on the other side of the
    // road. It used to stop at 50, fourteen short of where an attendee leaving
    // the deck's north edge lands, and the limit fell from 58 to 14 at that
    // line — so crossing it dragged the body twenty-two units sideways.
    if (z > -12 && z <= GATE_Z - 2) max = rooftopBounds.maxX + 4;
    // The temple's ground was always drawn — the map reaches x = 92 — but the
    // festival stopped anyone at 58, so it could only ever be looked at.
    if (z > TEMPLE.minZ - 6 && z < TEMPLE.maxZ + 6) max = TEMPLE.maxX + 5;
    return { min, max };
  }

  private movePlayer(horizontal: number, vertical: number, distance: number): void {
    // Third-person controls are always camera-relative: W advances toward the
    // current view, S retreats, and A/D strafe along its right vector.
    this.camera.getWorldDirection(this.cameraDirection);
    this.cameraDirection.y = 0;
    this.cameraDirection.normalize();
    const rightX = -this.cameraDirection.z;
    const rightZ = this.cameraDirection.x;
    this.moveVector.set(
      rightX * horizontal + this.cameraDirection.x * -vertical,
      0,
      rightZ * horizontal + this.cameraDirection.z * -vertical,
    );
    if (this.moveVector.lengthSq() === 0) return;
    this.moveVector.normalize().multiplyScalar(distance);

    const nextX = this.player.position.x + this.moveVector.x;
    const nextZ = this.player.position.z + this.moveVector.z;
    // A step has to be clear at the height being left as well as the height
    // being arrived at. Testing only the destination let an attendee walk out
    // through the club's underground walls: one pace past the room, the ground
    // height is the surface again, so the wall's own height band no longer
    // matched and the collider was skipped.
    // Already standing inside something. That is where a STAFF member lands
    // when they take over a resident stationed behind their own decks: every
    // direction reads as blocked and there is no way out of the booth. When the
    // ground underfoot is refused already, movement is allowed so the body can
    // walk itself clear.
    const stuck = this.staticCollides(this.player.position.x, this.player.position.z, this.player.position.y) ||
      this.staticCollides(this.player.position.x, this.player.position.z,
        this.groundHeightAt(this.player.position.x, this.player.position.z, this.player.position.y));
    // A step has to be clear at the height being left as well as the height
    // being arrived at. Testing only the destination let an attendee walk out
    // through the club's underground walls: one pace past the room, the ground
    // height is the surface again, so the wall's own height band no longer
    // matched and the collider was skipped. In the air only the body's own
    // height is tested, which is what lets a jump carry over anything the world
    // has given a top to.
    const blocked = (x: number, z: number): boolean => {
      if (stuck) return false;
      if (this.airborne) return this.staticCollides(x, z, this.player.position.y);
      return this.staticCollides(x, z, this.groundHeightAt(x, z, this.player.position.y)) ||
        this.staticCollides(x, z, this.player.position.y);
    };
    if (!blocked(nextX, this.player.position.z)) {
      this.player.position.x = nextX;
    }
    if (!blocked(this.player.position.x, nextZ)) {
      this.player.position.z = nextZ;
    }
    // Depth first, then the width allowed at that depth. Taken the other way
    // round, a stride that overshot the north limit read the width belonging to
    // ground the attendee is never allowed to stand on, and slammed them
    // sideways before the depth was pulled back.
    this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -75, GATE_Z - 2);
    const reach = this.walkableXRange(this.player.position.z);
    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, reach.min, reach.max);
    this.resolvePlayerCrowdCollisions();
    this.player.rotation.y = Math.atan2(this.moveVector.x, this.moveVector.z);
  }

  private mentorFollowerObject(): THREE.Object3D | undefined {
    if (!this.mentorFollower) return undefined;
    if (this.mentorFollower.kind === 'npc') {
      return this.npcs.find((npc) => npc.id === this.mentorFollower?.id)?.group;
    }
    if (this.mentorFollower.id === this.selfVisitorId) {
      return this.controlledNpcId && this.originalPlayerIdle.visible ? this.originalPlayerIdle : this.player;
    }
    return this.remoteAvatars.get(this.mentorFollower.id)?.group;
  }

  private placeMentorNearFollower(mentor: NpcAvatar, target: THREE.Vector3): boolean {
    // Four points at arm's length are not enough to clear something as broad
    // as the popcorn stand — every one of them can be inside it. The corners
    // and a wider ring give the dog somewhere to land that the near ring does
    // not reach.
    const offsets: Array<[number, number]> = [
      [0, 2.4], [2.4, 0], [-2.4, 0], [0, -2.4],
      [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8],
      [0, 4.2], [4.2, 0], [-4.2, 0], [0, -4.2],
    ];
    for (const [offsetX, offsetZ] of offsets) {
      const x = target.x + offsetX;
      const z = Math.max(target.z + offsetZ, -57.3);
      const y = this.groundHeightAt(x, z, target.y);
      if (Math.abs(y - target.y) > 1.8 || this.staticCollides(x, z, y)) continue;
      mentor.group.position.set(x, y, z);
      mentor.waypointIndex = this.nearestRouteIndex(mentor, mentor.group.position);
      mentor.stuckFor = 0;
      mentor.waitUntil = performance.now() + 180;
      return true;
    }
    return false;
  }

  /**
   * Loyalty movement is rendered from one shared server target. A short
   * catch-up placement handles stacked venue floors that ordinary NPC routes
   * cannot traverse, while nearby movement still walks and respects scenery.
   */
  private updateMentorFollower(mentor: NpcAvatar, targetObject: THREE.Object3D, delta: number): boolean {
    targetObject.getWorldPosition(this.mentorTargetPosition);
    const dx = this.mentorTargetPosition.x - mentor.group.position.x;
    const dz = this.mentorTargetPosition.z - mentor.group.position.z;
    const distance = Math.hypot(dx, dz);
    const verticalGap = Math.abs(this.mentorTargetPosition.y - mentor.group.position.y);
    // Wedged inside the scenery is its own reason to move, whatever the
    // distance. The escape used to ask for distance > 7 as well, so a dog stuck
    // in something its owner was standing next to stayed stuck for good: close
    // up it never qualified, and inside 2.25 the early return below cleared the
    // stuck timer before it could ever reach the threshold.
    const wedged = this.staticCollides(
      mentor.group.position.x,
      mentor.group.position.z,
      mentor.group.position.y,
    );
    if (wedged || distance > 32 || (verticalGap > 2.2 && distance < 18) || mentor.stuckFor > 2.4) {
      if (this.placeMentorNearFollower(mentor, this.mentorTargetPosition)) return false;
    }
    if (distance <= 2.25 && !wedged) {
      mentor.stuckFor = 0;
      mentor.group.rotation.y = Math.atan2(dx, dz);
      return false;
    }

    const travel = Math.min(distance - 2.1, Math.max(5.4, mentor.speed * 5.2) * delta);
    const nx = dx / distance;
    const nz = dz / distance;
    this.mentorStepPosition.set(
      mentor.group.position.x + nx * travel,
      mentor.group.position.y,
      mentor.group.position.z + nz * travel,
    );
    const nextY = this.groundHeightAt(this.mentorStepPosition.x, this.mentorStepPosition.z, mentor.group.position.y);
    let moved = false;
    if (!this.npcCollides(mentor, this.mentorStepPosition.x, this.mentorStepPosition.z)) {
      mentor.group.position.set(this.mentorStepPosition.x, nextY, this.mentorStepPosition.z);
      moved = true;
    } else {
      const nextX = mentor.group.position.x + nx * travel;
      if (!this.npcCollides(mentor, nextX, mentor.group.position.z)) {
        mentor.group.position.x = nextX;
        moved = true;
      }
      const nextZ = mentor.group.position.z + nz * travel;
      if (!this.npcCollides(mentor, mentor.group.position.x, nextZ)) {
        mentor.group.position.z = nextZ;
        moved = true;
      }
      if (moved) {
        mentor.group.position.y = this.groundHeightAt(
          mentor.group.position.x,
          mentor.group.position.z,
          mentor.group.position.y,
        );
      }
    }
    mentor.group.rotation.y = Math.atan2(nx, nz);
    mentor.stuckFor = moved ? 0 : mentor.stuckFor + delta;
    return moved;
  }

  /**
   * Carries the body away from a punch that landed on it. Separate from
   * movePlayer because a blow lands whether or not the struck attendee is
   * pressing anything, and it has to answer the same walls and edges walking
   * does — being punched should not put anyone through a wall.
   */
  private applyKnockback(delta: number): void {
    if (this.knockback.lengthSq() < 0.0004) {
      this.knockback.set(0, 0, 0);
      return;
    }
    const nextX = this.player.position.x + this.knockback.x * delta;
    const nextZ = this.player.position.z + this.knockback.z * delta;
    if (this.staticCollides(nextX, nextZ, this.player.position.y)) {
      // Put against a wall the blow stops there rather than pushing through it.
      this.knockback.set(0, 0, 0);
      return;
    }
    this.player.position.x = nextX;
    this.player.position.z = nextZ;
    this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -75, GATE_Z - 2);
    const reach = this.walkableXRange(this.player.position.z);
    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, reach.min, reach.max);
    this.knockback.multiplyScalar(Math.exp(-delta * 8.2));
  }

  private updateNpcs(delta: number, elapsed: number): void {
    const now = performance.now();
    let nearestNpc: NpcAvatar | undefined;
    let nearestDistance = 6.5;
    for (const npc of this.npcs) {
      if (npc.id === 'MENTOR' && this.mentorCarrierId) {
        npc.group.visible = true;
        npc.badge.visible = false;
        npc.remoteCarriedProp.visible = false;
        if (npc.dogRig) {
          const gesture = npc.id === this.controlledNpcId && now < this.playerGestureUntil
            ? this.playerGesture
            : npc.gestureUntil > now ? npc.gesture : undefined;
          this.animateMentorDog(npc.dogRig, elapsed * 5.4, false, gesture === 'tail-wag', now < npc.eatUntil);
        }
        continue;
      }
      if (npc.id === this.controlledNpcId) {
        npc.group.visible = true;
        npc.badge.visible = false;
        npc.group.position.set(
          this.player.position.x,
          this.playerState === 'swimming' ? (npc.dogRig ? AVATAR_GROUND_Y - 0.52 : AVATAR_SWIM_Y) : this.player.position.y,
          this.player.position.z,
        );
        npc.group.rotation.copy(this.player.rotation);
        const moving = this.moveVector.lengthSq() > 0;
        const gesture = this.dancing
          ? 'dance'
          : now < this.playerGestureUntil
            ? this.playerGesture
            : now < npc.gestureUntil ? npc.gesture : undefined;
        npc.remoteCarriedProp.visible = false;
        if (npc.rig) {
          this.animateRig(
            npc.rig,
            moving ? elapsed * 8.5 : elapsed * 1.4,
            this.playerState === 'swimming' ? (moving ? 0.3 : 0.025) : (moving ? 0.72 : 0.035),
            gesture,
            this.running && moving && !this.dancing && this.playerState === 'walking',
            this.gestureProgress(gesture, this.playerGestureUntil),
          );
          if (this.playerState === 'swimming' && moving && !gesture) this.poseRigSwimming(npc.rig, elapsed);
          if (this.playerState === 'seated') this.poseRigSeated(npc.rig, gesture);
          if (now < this.pickupUntil) npc.rig.leftArm.rotation.x = -1.15;
        }
        if (npc.dogRig) {
          this.animateMentorDog(
            npc.dogRig,
            moving ? elapsed * 8.5 : elapsed * 1.4,
            moving,
            gesture === 'tail-wag',
            now < npc.eatUntil,
            gesture === 'hit',
            gesture,
            this.gestureProgress(gesture, this.playerGestureUntil),
          );
          if (this.playerState === 'swimming') this.poseMentorDogSwimming(npc.dogRig, elapsed, moving);
          if (this.playerState === 'seated') this.poseMentorDogSeated(npc.dogRig);
          // Riding: the legs stop paddling and the board carries the dog.
          const dogSkating = this.running && moving && !this.dancing && this.playerState === 'walking';
          if (npc.dogBoard) npc.dogBoard.visible = dogSkating;
          if (dogSkating) {
            npc.dogRig.leftFrontLeg.rotation.x = -0.22;
            npc.dogRig.rightFrontLeg.rotation.x = -0.22;
            npc.dogRig.leftBackLeg.rotation.x = 0.2;
            npc.dogRig.rightBackLeg.rotation.x = 0.2;
            npc.dogRig.body.rotation.z = 0.14;
          }
        }
        continue;
      }
      if (npc.dogBoard) npc.dogBoard.visible = false;
      const remoteController = this.remoteNpcControls.get(npc.id);
      if (remoteController) {
        npc.group.visible = true;
        npc.badge.visible = false;
        this.npcControlTarget.set(
          remoteController.x,
          remoteController.state === 'swimming' ? AVATAR_SWIM_Y : AVATAR_GROUND_Y,
          remoteController.z,
        );
        const positionError = npc.group.position.distanceTo(this.npcControlTarget);
        const smoothing = 1 - Math.exp(-delta * 8);
        npc.group.position.lerp(this.npcControlTarget, smoothing);
        const rotationDelta = Math.atan2(
          Math.sin(remoteController.rotation - npc.group.rotation.y),
          Math.cos(remoteController.rotation - npc.group.rotation.y),
        );
        npc.group.rotation.y += rotationDelta * smoothing;
        const moving = remoteController.moving || positionError > 0.055;
        const gesture = remoteController.gesture ?? (now < npc.gestureUntil ? npc.gesture : undefined);
        npc.remoteCarriedProp.visible = remoteController.state !== 'swimming' && remoteController.carriedItem === 'POPCORN';
        this.positionPopcornProp(npc.remoteCarriedProp, Boolean(npc.dogRig));
        if (npc.rig) {
          this.animateRig(
            npc.rig,
            elapsed * 8.2,
            remoteController.state === 'swimming' ? (moving ? 0.3 : 0.025) : (moving ? 0.62 : 0.025),
            gesture,
            false,
            this.gestureProgress(gesture, npc.gestureUntil),
          );
          if (remoteController.state === 'swimming' && moving && !gesture) this.poseRigSwimming(npc.rig, elapsed);
          if (remoteController.state === 'seated') this.poseRigSeated(npc.rig, gesture);
        }
        if (npc.dogRig) {
          this.animateMentorDog(
            npc.dogRig,
            elapsed * 8.2,
            moving,
            gesture === 'tail-wag',
            now < npc.eatUntil,
          );
          if (remoteController.state === 'swimming') this.poseMentorDogSwimming(npc.dogRig, elapsed, moving);
          if (remoteController.state === 'seated') this.poseMentorDogSeated(npc.dogRig);
        }
        continue;
      }
      npc.group.visible = true;
      npc.remoteCarriedProp.visible = false;
      if (npc.station && npc.id !== this.controlledNpcId) {
        npc.group.position.copy(npc.station.position);
        npc.group.rotation.y = npc.station.rotationY;
        const stationGesture = now < npc.gestureUntil ? npc.gesture : undefined;
        if (npc.rig) {
          this.animateRig(npc.rig, elapsed * 2.2, 0.03, stationGesture, false,
            this.gestureProgress(stationGesture, npc.gestureUntil));
          // Somebody holding a post has nothing to do but look at whoever
          // comes near, which is exactly when a still figure most needs to
          // stop looking like furniture.
          const seen = this.nearestBodyTo(npc.group.position, 11);
          if (seen) this.glanceAt(npc.rig, npc.group, seen, stationGesture);
          if (npc.pose === 'dj' && !stationGesture) this.poseRigDj(npc.rig, elapsed);
          if (npc.pose === 'dance' && !stationGesture) this.poseRigDance(npc.rig, npc.phase);
        }
        const distance = npc.group.position.distanceTo(this.player.position);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestNpc = npc;
        }
        continue;
      }
      if (npc.id === 'MENTOR' && this.carriedItem === 'MENTOR') {
        npc.badge.visible = false;
        // A carried MENTOR keeps eating and wagging even before the service
        // confirms the shared carrier, and while the carrier is seated.
        if (npc.dogRig) {
          const carriedGesture = now < npc.gestureUntil ? npc.gesture : undefined;
          this.animateMentorDog(npc.dogRig, elapsed * 5.4, false, carriedGesture === 'tail-wag', now < npc.eatUntil);
        }
        continue;
      }
      if (npc.id === 'MENTOR' && this.mentorFollower) {
        const followerObject = this.mentorFollowerObject();
        if (followerObject) {
          let moving = false;
          if (npc.knockback.lengthSq() > 0.0004) {
            const slideX = npc.group.position.x + npc.knockback.x * delta;
            const slideZ = npc.group.position.z + npc.knockback.z * delta;
            if (!this.staticCollides(slideX, slideZ, npc.group.position.y)) {
              npc.group.position.x = slideX;
              npc.group.position.z = slideZ;
              moving = true;
            } else {
              npc.knockback.set(0, 0, 0);
            }
            npc.knockback.multiplyScalar(Math.exp(-delta * 7.5));
          } else {
            npc.knockback.set(0, 0, 0);
            moving = this.updateMentorFollower(npc, followerObject, delta);
          }
          npc.group.position.y = this.groundHeightAt(
            npc.group.position.x,
            npc.group.position.z,
            npc.group.position.y,
          ) + Math.sin(elapsed * 1.35 + npc.phase) * 0.018;
          const gesture = now < npc.gestureUntil ? npc.gesture : undefined;
          if (npc.dogRig) this.animateMentorDog(
            npc.dogRig,
            elapsed * 8.4 + npc.phase,
            moving,
            gesture === 'tail-wag',
            now < npc.eatUntil,
            gesture === 'hit',
            gesture,
            this.gestureProgress(gesture, npc.gestureUntil),
          );
          const distanceToPlayer = npc.group.position.distanceTo(this.player.position);
          if (distanceToPlayer < nearestDistance) {
            nearestDistance = distanceToPlayer;
            nearestNpc = npc;
          }
          continue;
        }
      }
      this.advanceNpcJourney(npc, now);
      // Mid-journey a resident is walking the network, link by link; at rest it
      // is wandering the venue's own loop. Same walk either way.
      const travelling = npc.transit.length > 0;
      const target = travelling ? npc.transit[0] : npc.route[npc.waypointIndex];
      const direction = target.clone().sub(npc.group.position);
      direction.y = 0;
      const moving = now >= npc.waitUntil && direction.lengthSq() > 0.05;
      if (moving) {
        const targetGap = direction.length();
        const step = Math.min(targetGap, npc.speed * delta);
        direction.normalize();
        const next = npc.group.position.clone().addScaledVector(direction, step);
        // Give way to a visitor. Stepping round only once a step is actually
        // blocked is late — by then somebody is already walking into you — so a
        // resident with a visitor close ahead of it goes round early, while
        // there is still room to. Only ahead of it, and only on the same
        // storey: somebody behind, or on the floor above, is not in the way.
        const givingWay = this.visitorInTheWay(npc, direction, targetGap);
        if (givingWay) npc.gaveWayAt = now;
        if (!givingWay && !this.npcCollides(npc, next.x, next.z)) {
          npc.group.position.x = next.x;
          npc.group.position.z = next.z;
          npc.group.rotation.y = Math.atan2(direction.x, direction.z);
          npc.stuckFor = 0;
        } else if (!this.staticCollides(next.x, next.z, npc.group.position.y)) {
          // Somebody in the way rather than something. Standing still was the
          // whole trouble: two residents meeting head-on each waited for the
          // other, both timed out together, and both set off into each other
          // again — a jam that never cleared. Each steps round to its right
          // instead, which for two of them meeting is opposite ways, so they
          // pass. The step still keeps some of the forward run, so it reads as
          // going round somebody rather than sidling sideways.
          const dodgeX = npc.group.position.x + (direction.x * 0.45 + direction.z) * step;
          const dodgeZ = npc.group.position.z + (direction.z * 0.45 - direction.x) * step;
          if (
            !this.npcCollides(npc, dodgeX, dodgeZ)
            && !this.staticCollides(dodgeX, dodgeZ, npc.group.position.y)
          ) {
            npc.group.rotation.y = Math.atan2(dodgeX - npc.group.position.x, dodgeZ - npc.group.position.z);
            npc.group.position.x = dodgeX;
            npc.group.position.z = dodgeZ;
            npc.stuckFor = 0;
          } else {
            // Boxed in on that side too. Wait, but for an interval of this
            // resident's own, so a group held up at one spot does not try again
            // all together on the same tick and box each other in afresh.
            npc.waitUntil = now + 320 + ((npc.phase * 100) % 260);
            npc.stuckFor += delta;
          }
        } else if (!travelling) {
          npc.waypointIndex = (npc.waypointIndex + 1) % npc.route.length;
          npc.stuckFor += delta;
        } else {
          // Scenery across a link. Skipping the link would cut the corner off
          // the network and walk them through whatever the link was going
          // round, so they wait for it instead.
          npc.waitUntil = now + 420;
          npc.stuckFor += delta;
        }
      } else if (direction.lengthSq() <= 0.05) {
        if (travelling) {
          // One link done. The next begins from here, with no pause: stopping
          // at every corner made the walk across the festival look like a
          // series of errands rather than one journey.
          npc.transit.shift();
          if (npc.transit.length === 0) this.arriveAtHaunt(npc, now);
          npc.stuckFor = 0;
          continue;
        }
        npc.waypointIndex = (npc.waypointIndex + 1) % npc.route.length;
        // Reaching a corner of the club floor or the roof deck is where a
        // resident in the mood stops and dances, rather than pacing the room
        // like everywhere else. The pause and the gesture run together, so they
        // are still rather than sliding along mid-step.
        if (npc.dances && Math.random() < 0.7) {
          const bout = 6_000 + Math.random() * 9_000;
          npc.waitUntil = now + bout;
          npc.gesture = 'dance';
          npc.gestureUntil = now + bout;
        } else {
          npc.waitUntil = now + 900 + ((npc.phase * 1000) % 1800);
        }
        npc.stuckFor = 0;
      }
      // Nothing here moves a body without walking it. The old recovery set the
      // position outright — to a corner of the route, from anywhere, in front of
      // anybody — which is what made residents blink across rooms. The network
      // is verified clear end to end, so a resident following it does not need
      // rescuing; the only way into the scenery now is to be punched into it,
      // and the way back out is to walk.
      if (this.staticCollides(npc.group.position.x, npc.group.position.z, npc.group.position.y)) {
        npc.recovering = true;
      }
      if (npc.recovering) {
        const refuge = this.nearestNavPoint(npc.group.position);
        const out = refuge.clone().sub(npc.group.position);
        out.y = 0;
        if (out.lengthSq() < 0.25) {
          npc.recovering = false;
          npc.stuckFor = 0;
          // Whatever it was doing was interrupted by the blow; pick the journey
          // up again from where it now stands.
          npc.transit = [];
          npc.atNode = this.nearestNavNode(npc.group.position);
          npc.dwellUntil = now;
        } else {
          // Walked, not placed: the same speed it walks everywhere else, so it
          // reads as somebody picking themselves up rather than a body moving
          // between frames.
          out.normalize().multiplyScalar(Math.min(npc.speed * delta, out.length()));
          npc.group.position.x += out.x;
          npc.group.position.z += out.z;
          npc.group.rotation.y = Math.atan2(out.x, out.z);
        }
      } else if (npc.stuckFor > 4) {
        // Held up too long by the crowd rather than the scenery. Re-plan from
        // where it is instead of shoving through.
        npc.transit = [];
        npc.atNode = this.nearestNavNode(npc.group.position);
        npc.dwellUntil = now;
        npc.stuckFor = 0;
      }
      // Carried off the route by a punch. Applied after the route step and
      // before the floor is found, so a struck resident skids back over the
      // ground they are standing on rather than through it.
      if (npc.knockback.lengthSq() > 0.0004) {
        const slideX = npc.group.position.x + npc.knockback.x * delta;
        const slideZ = npc.group.position.z + npc.knockback.z * delta;
        if (!this.staticCollides(slideX, slideZ, npc.group.position.y)) {
          npc.group.position.x = slideX;
          npc.group.position.z = slideZ;
        } else {
          npc.knockback.set(0, 0, 0);
        }
        npc.knockback.multiplyScalar(Math.exp(-delta * 7.5));
      } else {
        npc.knockback.set(0, 0, 0);
      }
      // Stand on the floor underfoot, not on the street. Pinned to street
      // height, a resident stationed on the roof deck sank through it — which
      // is what put DR.BEAUTY waist-deep in the shop counter.
      npc.group.position.y = this.groundHeightAt(
        npc.group.position.x,
        npc.group.position.z,
        npc.group.position.y,
      ) + Math.sin(elapsed * 1.35 + npc.phase) * 0.018;
      const gesture = now < npc.gestureUntil ? npc.gesture : undefined;
      // Posing a body writes ten bones, and it is the one per-resident cost
      // paid every frame by every resident. Across the square that is what
      // twelve of them costs a phone. Beyond this they are a few pixels tall
      // and no arm swing on them can be made out — so on a phone the distant
      // ones keep walking their routes and simply stop swinging, unless they
      // are in the middle of a gesture somebody might be watching for. They
      // stay present, which is the point; they just stop being animated at a
      // range where nobody can see that they are.
      const farAway = npc.group.position.distanceToSquared(this.player.position) > NPC_ANIMATION_RANGE_SQ;
      const poseNpc = !farAway || gesture !== undefined || this.graphicsMode === 'normal';
      if (npc.rig && poseNpc) {
        this.animateRig(npc.rig, elapsed * 7.4 + npc.phase, moving ? 0.62 : 0.03, gesture, false,
          this.gestureProgress(gesture, npc.gestureUntil));
        // And a resident walking past looks over at whoever is nearest —
        // another visitor counts the same as this one. To a resident there is
        // no difference between the two.
        const worthALook = this.nearestBodyTo(npc.group.position, 9);
        if (worthALook) this.glanceAt(npc.rig, npc.group, worthALook, gesture);
      }
      if (npc.dogRig) this.animateMentorDog(
        npc.dogRig,
        elapsed * 7.4 + npc.phase,
        moving,
        gesture === 'tail-wag',
        now < npc.eatUntil,
        gesture === 'hit',
        gesture,
        this.gestureProgress(gesture, npc.gestureUntil),
      );
      const distance = npc.group.position.distanceTo(this.player.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestNpc = npc;
      }
    }
    for (const npc of this.npcs) {
      if (npc.id === this.controlledNpcId || this.remoteNpcControls.has(npc.id) ||
        (npc.id === 'MENTOR' && (this.carriedItem === 'MENTOR' || Boolean(this.mentorCarrierId)))) {
        npc.badge.visible = false;
        continue;
      }
      npc.badge.visible = npc === nearestNpc || npc.gestureUntil > now;
    }
  }

  private updateRemoteAvatars(delta: number, elapsed: number): void {
    for (const avatar of this.remoteAvatars.values()) {
      const positionError = avatar.previousTarget.distanceTo(avatar.target);
      // Taking a seat, going down to the basement, coming up to the deck: those
      // move an attendee further than they could walk between updates, and
      // playing them out sent the body gliding through the scenery to catch up.
      if (positionError > 6) {
        avatar.group.position.copy(avatar.target);
        avatar.group.rotation.y = avatar.targetRotation;
      } else {
        const played = THREE.MathUtils.clamp(
          (performance.now() - avatar.targetAt) / avatar.updateInterval,
          0,
          1,
        );
        avatar.group.position.lerpVectors(avatar.previousTarget, avatar.target, played);
        const rotationDelta = Math.atan2(
          Math.sin(avatar.targetRotation - avatar.previousRotation),
          Math.cos(avatar.targetRotation - avatar.previousRotation),
        );
        avatar.group.rotation.y = avatar.previousRotation + rotationDelta * played;
      }
      if (avatar.state === 'swimming') avatar.group.position.y += Math.sin(elapsed * 3.1) * 0.025;
      const moving = avatar.moving || positionError > 0.055;
      avatar.animationPhase += delta * (moving ? 8.2 : 1.4);
      const gesture = avatar.gesture === 'dance'
        ? 'dance'
        : performance.now() < avatar.gestureUntil ? avatar.gesture : undefined;
      this.animateRig(
        avatar.rig,
        avatar.animationPhase,
        avatar.state === 'swimming' ? (moving ? 0.3 : 0.025) : (moving ? 0.62 : 0.025),
        gesture,
        avatar.running && moving && avatar.state === 'walking',
        this.gestureProgress(gesture, avatar.gestureUntil),
      );
      if (avatar.state === 'swimming' && moving && !gesture) this.poseRigSwimming(avatar.rig, elapsed);
      if (avatar.state === 'seated') this.poseRigSeated(avatar.rig, gesture);
      avatar.carriedProp.visible = avatar.state !== 'swimming' && avatar.carriedItem === 'POPCORN';
      const distance = avatar.group.position.distanceTo(this.player.position);
      avatar.badge.visible = distance < 12;
    }
  }

  /**
   * How far through a timed gesture a body is, 0 to 1, worked out from the
   * moment it ends. Clamping at the bottom is what lets a gesture be scheduled
   * to begin later than it is set: give it an end further out than its span and
   * it simply holds at rest until its own time comes.
   */
  private gestureProgress(gesture: AvatarGesture | undefined, until: number, now = performance.now()): number {
    const span = gesture ? GESTURE_SPAN_MS[gesture] : undefined;
    if (!span) return 0;
    return THREE.MathUtils.clamp(1 - (until - now) / span, 0, 1);
  }

  /**
   * Folds the second joint of each limb. Every gesture written before the
   * joints existed left them wherever the last frame put them, which showed up
   * as a bowing figure with one leg still mid-stride.
   *
   * A knee only bends backwards and an elbow only bends forwards, so both are
   * given as a positive amount here and the sign is applied in one place.
   */
  /**
   * Turns a head toward somebody nearby.
   *
   * The cheapest thing on this whole board that makes a crowd feel inhabited,
   * and it needs no geometry at all — only the neck that came with the spine.
   * Applied after the body has been animated, because every pose writes the
   * head's rotation and would otherwise overwrite this.
   *
   * Held to a comfortable arc: past that a person turns their shoulders too,
   * and a head swivelling further than a neck goes is worse than one that never
   * moves at all. Nobody glances while doing something else, so a gesture
   * suppresses it.
   */
  /**
   * The nearest person to a point — this client or any other visitor — or
   * nothing if the nearest is further off than the given reach.
   */
  private nearestBodyTo(from: THREE.Vector3, reach: number): THREE.Vector3 | undefined {
    let nearest: THREE.Vector3 | undefined;
    let nearestGap = reach;
    const consider = (position: THREE.Vector3) => {
      // Same storey only: the club is under the promenade, and somebody
      // sixteen units below is not somebody to look at.
      if (Math.abs(position.y - from.y) > 2.4) return;
      const gap = from.distanceTo(position);
      if (gap < nearestGap && gap > 0.2) {
        nearestGap = gap;
        nearest = position;
      }
    };
    consider(this.player.position);
    for (const avatar of this.remoteAvatars.values()) consider(avatar.group.position);
    return nearest;
  }

  private glanceAt(rig: AvatarRig, body: THREE.Object3D, target: THREE.Vector3, gesture?: AvatarGesture): void {
    if (gesture !== undefined) return;
    const toward = Math.atan2(target.x - body.position.x, target.z - body.position.z);
    let turn = toward - body.rotation.y;
    // Round the short way, or a body facing north-west whips its head round
    // the long side of the circle to look at something just past north-east.
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    if (Math.abs(turn) > 1.9) return;
    const held = THREE.MathUtils.clamp(turn, -0.85, 0.85);
    // Eased rather than snapped, so a head that comes into range turns rather
    // than teleports its gaze.
    rig.head.rotation.y = THREE.MathUtils.lerp(rig.head.rotation.y, held, 0.12);
    const rise = THREE.MathUtils.clamp((target.y - body.position.y - 2.4) * 0.4, -0.22, 0.22);
    rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, -rise, 0.12);
  }

  private foldJoints(rig: AvatarRig, leftElbow: number, rightElbow: number, leftKnee = 0, rightKnee = 0): void {
    // These avatars face +Z, not the -Z that three.js takes as forward. The
    // movement code says so — rotation.y is atan2(x, z), which is zero when the
    // body is travelling towards positive z — and so does the original head,
    // which puts its eyes at z = +0.385.
    //
    // The first cut of these joints took the engine's default instead and had
    // both of them bending the wrong way: elbows folding out behind the body
    // and knees breaking forwards. Rotating by θ about x sends a hanging limb's
    // end to -sin θ in z, so forward is a negative rotation here. An elbow
    // folds the forearm forwards and a knee folds the shin backwards, which is
    // why the two take opposite signs.
    if (rig.leftElbow) rig.leftElbow.rotation.set(-leftElbow, 0, 0);
    if (rig.rightElbow) rig.rightElbow.rotation.set(-rightElbow, 0, 0);
    if (rig.leftKnee) rig.leftKnee.rotation.set(leftKnee, 0, 0);
    if (rig.rightKnee) rig.rightKnee.rotation.set(rightKnee, 0, 0);
  }

  private animateRig(rig: AvatarRig, phase: number, stride: number, gesture?: AvatarGesture, skating = false, progress = 0): void {
    // Riding overrides the gait but not a gesture: someone waving from a board
    // is still waving.
    if (skating && !gesture) {
      this.poseRigSkating(rig, phase);
      return;
    }
    rig.board.visible = skating;
    const swing = Math.sin(phase) * stride;
    rig.leftLeg.rotation.x = swing;
    rig.rightLeg.rotation.x = -swing;
    rig.leftArm.rotation.x = -swing * 0.72;
    rig.rightArm.rotation.x = swing * 0.72;
    rig.rightArm.rotation.z = 0;
    // Axes only the dance and DJ poses touch. Without clearing them the body
    // keeps the last frame of the pose after the pose ends.
    rig.leftArm.rotation.z = 0;
    rig.torso.rotation.y = 0;
    rig.torso.rotation.x = 0;
    rig.head.rotation.set(0, 0, 0);
    rig.leftLeg.rotation.z = 0;
    rig.rightLeg.rotation.z = 0;
    // A leg swings forward on a positive rotation about x, so the knee has to
    // bend the other way — the shin trails the thigh through the forward half
    // of the stride and the heel comes up, which is the difference between
    // walking and swinging two planks from the hip. The arm gets a standing
    // bend it never loses, because nobody walks with their elbows locked.
    // A positive leg rotation carries that leg behind the body, so a leg is
    // trailing when its own swing is positive — and that is the half of the
    // stride where the knee folds and the heel comes up. The arms run opposite
    // to the legs, and an elbow folds most as its arm comes forward.
    this.foldJoints(
      rig,
      0.2 + Math.max(0, swing) * 0.5,
      0.2 + Math.max(0, -swing) * 0.5,
      Math.max(0, swing) * 0.95,
      Math.max(0, -swing) * 0.95,
    );
    rig.treat.visible = gesture === 'feed';
    if (gesture === 'wave') {
      // Raise the arm away from the head, then wave front-to-back from the
      // shoulder. The previous inward rotation intersected the face.
      rig.rightArm.rotation.z = 2.08 + Math.sin(phase * 2.2) * 0.1;
      rig.rightArm.rotation.x = -0.15 + Math.sin(phase * 2.2) * 0.07;
      // With an elbow the wave comes from the forearm, which is where a wave
      // actually comes from — the whole arm rocking at the shoulder always
      // read as semaphore.
      if (rig.rightElbow) {
        rig.rightElbow.rotation.set(-0.55, 0, Math.sin(phase * 2.6) * 0.42);
      }
    } else if (gesture === 'feed') {
      // Reach forward with a visible bite-sized treat at hand level.
      rig.rightArm.rotation.x = -1.18 + Math.sin(phase * 1.7) * 0.06;
      if (rig.rightElbow) rig.rightElbow.rotation.set(-0.32, 0, 0);
      rig.rightArm.rotation.z = -0.1;
    } else if (gesture === 'dance') {
      this.poseRigDance(rig);
      return;
    } else if (gesture === 'jump') {
      // A tuck: arms thrown up for the lift, knees drawn in under the body.
      // Read from the body's own height rather than a clock, so the pose
      // follows the arc — arms highest off the ground, legs straightening as
      // the feet come back down.
      const lift = THREE.MathUtils.clamp(this.verticalVelocity / JUMP_SPEED, -1, 1);
      rig.leftArm.rotation.x = -2.1 - lift * 0.5;
      rig.rightArm.rotation.x = -2.1 - lift * 0.5;
      rig.leftArm.rotation.z = 0.3;
      rig.rightArm.rotation.z = -0.3;
      rig.leftLeg.rotation.x = -0.85 + lift * 0.35;
      rig.rightLeg.rotation.x = -0.4 + lift * 0.2;
      rig.torso.rotation.x = 0.12;
      // A tuck is knees drawn up, which is a knee bend and not a hip rotation.
      // Straightening as the feet come back down is what sells the landing.
      const tuck = Math.max(0, 1 - Math.abs(lift)) * 0.5;
      this.foldJoints(rig, 1.15, 1.15, 1.1 - tuck, 0.75 - tuck * 0.6);
      return;
    } else if (gesture === 'stumble') {
      // Caught on the front foot and recovering: the body straightens as the
      // phase runs on, so the stagger reads as one movement rather than a loop.
      const recover = THREE.MathUtils.clamp(Math.sin(phase * 2.6), -1, 1);
      rig.torso.rotation.x = 0.5 - Math.abs(recover) * 0.16;
      // Head up, looking where the feet are going rather than at them.
      rig.head.rotation.x = -0.26 + recover * 0.08;
      rig.leftArm.rotation.x = -1.5 + recover * 0.4;
      rig.rightArm.rotation.x = -1.2 - recover * 0.4;
      rig.leftArm.rotation.z = 0.75;
      rig.rightArm.rotation.z = -0.62;
      rig.leftLeg.rotation.x = -0.72 + recover * 0.22;
      rig.rightLeg.rotation.x = 0.46 - recover * 0.18;
      // The trailing leg buckles and the leading one braces straight, which is
      // what a stagger is: one leg failing and the other catching it.
      this.foldJoints(rig, 0.95 - recover * 0.2, 0.7 + recover * 0.25, 0.12, 0.85 - recover * 0.2);
      return;
    } else if (gesture === 'offer') {
      // Both hands raised together and held out, the body bowed over them.
      const settle = THREE.MathUtils.clamp(Math.sin(phase * 1.5), -1, 1);
      rig.torso.rotation.x = 0.44 + settle * 0.05;
      // The head goes with it, and a little further: an offering is made
      // looking down at the hands, not out over them.
      rig.head.rotation.x = 0.34 + settle * 0.04;
      rig.leftArm.rotation.x = -1.42 - settle * 0.06;
      rig.rightArm.rotation.x = -1.42 - settle * 0.06;
      rig.leftArm.rotation.z = 0.26;
      rig.rightArm.rotation.z = -0.26;
      rig.leftLeg.rotation.x = 0;
      rig.rightLeg.rotation.x = 0;
      // Held out, not stuck out: the forearms come up so the offering sits in
      // front of the chest rather than at the end of two straight arms.
      this.foldJoints(rig, 0.72 + settle * 0.05, 0.72 + settle * 0.05);
      return;
    } else if (gesture === 'bow') {
      // The bow returned: deeper at the waist, hands together at the chest.
      const dip = THREE.MathUtils.clamp(Math.sin(phase * 1.2), -1, 1);
      rig.torso.rotation.x = 0.62 + dip * 0.1;
      rig.head.rotation.x = 0.4 + dip * 0.06;
      rig.leftArm.rotation.x = -1.2;
      rig.rightArm.rotation.x = -1.2;
      rig.leftArm.rotation.z = 0.34;
      rig.rightArm.rotation.z = -0.34;
      rig.leftLeg.rotation.x = 0;
      rig.rightLeg.rotation.x = 0;
      // Hands together at the chest, which needs the elbows well folded.
      this.foldJoints(rig, 1.35, 1.35);
      return;
    } else if (gesture === 'punch') {
      // A cross. What makes a punch read as a punch rather than a reach is the
      // shape of its timing: the body loads slowly, releases violently, and
      // overruns the target before it gathers itself. An arm that simply
      // travels out and back at one speed is a handshake however far it goes.
      //
      // coil rises through the wind-up and is spent by contact. strike is zero
      // until the wind-up ends, snaps over in a fifth of the gesture — the
      // exponent under one is what makes it leave rather than travel — and
      // falls away over the whole of the rest.
      const coil = progress < 0.3
        ? progress / 0.3
        : Math.max(0, 1 - (progress - 0.3) / 0.16);
      const strike = progress < 0.3
        ? 0
        : progress < 0.46
          ? Math.pow((progress - 0.3) / 0.16, 0.5)
          : Math.max(0, 1 - (progress - 0.46) / 0.54);
      // The rear hand: drawn back past the ribs, then thrown through.
      rig.rightArm.rotation.x = 0.62 * coil - 2 * strike;
      rig.rightArm.rotation.z = -0.12 - 0.26 * strike;
      // The lead hand holds a guard at the chin and is pulled back as the other
      // goes out, which is where the turn of the shoulders comes from.
      rig.leftArm.rotation.x = -1.05 + 0.7 * strike;
      rig.leftArm.rotation.z = 0.44 - 0.1 * strike;
      // The whole body turns through it. Feet stay planted: this is all
      // rotation, so nothing here can push the avatar through a wall.
      rig.torso.rotation.y = 0.46 * coil - 0.66 * strike;
      rig.torso.rotation.x = -0.12 * coil + 0.34 * strike;
      rig.head.rotation.y = 0.22 * coil - 0.38 * strike;
      rig.head.rotation.x = 0.16 * strike;
      // Weight rolls off the back foot onto the front one.
      rig.leftLeg.rotation.x = -0.12 - 0.3 * strike;
      rig.rightLeg.rotation.x = 0.16 + 0.28 * strike;
      // The punch is in the elbow. A cross is a folded arm thrown straight —
      // the striking elbow snaps from tight to locked as it goes through, and
      // the guard hand stays folded at the chin throughout. Rotating two rigid
      // arms at the shoulder could never show that.
      this.foldJoints(rig, 1.5 - 0.25 * strike, 1.45 * coil * (1 - strike), 0.14, 0.1);
      return;
    } else if (gesture === 'hit') {
      // Taking one: head snapped back, body folded away from it, arms flung up.
      // Snaps over in the first fifth and lets go slowly, the reverse of the
      // punch that caused it.
      const recoil = progress < 0.2
        ? Math.pow(progress / 0.2, 0.45)
        : Math.max(0, 1 - (progress - 0.2) / 0.8);
      rig.torso.rotation.x = -0.34 * recoil;
      rig.torso.rotation.y = 0.26 * recoil;
      rig.head.rotation.x = -0.44 * recoil;
      rig.leftArm.rotation.x = -1.2 * recoil;
      rig.rightArm.rotation.x = -1.05 * recoil;
      rig.leftArm.rotation.z = 0.6 * recoil;
      rig.rightArm.rotation.z = -0.5 * recoil;
      rig.leftLeg.rotation.x = 0.22 * recoil;
      rig.rightLeg.rotation.x = -0.14 * recoil;
      return;
    } else if (gesture === 'drink') {
      // Raise the glass to the mouth and tip it back.
      rig.rightArm.rotation.x = -2.32 + Math.sin(phase * 1.4) * 0.08;
      rig.rightArm.rotation.z = -0.34;
    }
    rig.torso.rotation.z = Math.sin(phase * 0.5) * Math.min(stride, 0.06);
  }

  /**
   * Dancing is timed to the club's shared beat rather than the animation
   * clock, so a floor full of avatars moves together.
   */
  private poseRigDance(rig: AvatarRig, offset = 0): void {
    // Joints are put back explicitly: a pose that does not mention them leaves
    // whatever the last walking frame happened to set, and the body arrives at
    // the dance floor still mid-stride.
    if (rig.leftElbow) rig.leftElbow.rotation.set(0.62, 0, 0);
    if (rig.rightElbow) rig.rightElbow.rotation.set(0.62, 0, 0);
    if (rig.leftKnee) rig.leftKnee.rotation.set(0, 0, 0);
    if (rig.rightKnee) rig.rightKnee.rotation.set(0, 0, 0);
    const beat = this.clubBeatPhase() * Math.PI * 2 + offset;
    const bounce = Math.sin(beat);
    const sway = Math.sin(beat / 2);
    // The limbs pivot from the shoulders and hips; the torso is a separate
    // mesh, so shifting its position would tear the body apart.
    rig.leftArm.rotation.x = -1.15 + bounce * 0.42;
    rig.rightArm.rotation.x = -1.15 - bounce * 0.42;
    rig.leftArm.rotation.z = 0.34 + bounce * 0.22;
    rig.rightArm.rotation.z = -0.34 + bounce * 0.22;
    rig.leftLeg.rotation.x = bounce * 0.24;
    rig.rightLeg.rotation.x = -bounce * 0.24;
    rig.torso.rotation.y = sway * 0.3;
    rig.torso.rotation.z = bounce * 0.09;
    rig.treat.visible = false;
  }

  /** The DJ throws a hand up when a request lands. */
  acknowledgeDjRequest(): void {
    const dj = this.npcs.find((npc) => npc.pose === 'dj');
    if (!dj) return;
    dj.gesture = 'wave';
    dj.gestureUntil = performance.now() + 1_500;
  }

  /** Beats elapsed on the club's shared clock, as a fraction of one beat. */
  private clubBeatPhase(): number {
    const secondsPerBeat = 60 / this.clubBeat.bpm;
    const sinceStart = this.clubBeat.startedAt
      ? (Date.now() - this.clubBeat.startedAt) / 1000
      : this.clock.elapsedTime;
    return sinceStart / secondsPerBeat;
  }

  /**
   * Working the decks: one hand riding a platter, the other on the mixer,
   * with a bob that follows the same beat the lights use.
   */
  private poseRigDj(rig: AvatarRig, elapsed: number): void {
    // Joints are put back explicitly: a pose that does not mention them leaves
    // whatever the last walking frame happened to set, and the body arrives at
    // the dance floor still mid-stride.
    if (rig.leftElbow) rig.leftElbow.rotation.set(0.85, 0, 0);
    if (rig.rightElbow) rig.rightElbow.rotation.set(0.85, 0, 0);
    if (rig.leftKnee) rig.leftKnee.rotation.set(0, 0, 0);
    if (rig.rightKnee) rig.rightKnee.rotation.set(0, 0, 0);
    const secondsPerBeat = 60 / this.clubBeat.bpm;
    const sinceStart = this.clubBeat.startedAt ? (Date.now() - this.clubBeat.startedAt) / 1000 : elapsed;
    const beat = (sinceStart / secondsPerBeat) * Math.PI * 2;
    const bob = Math.sin(beat);
    rig.leftArm.rotation.x = -1.15 + Math.sin(beat * 2) * 0.34;
    rig.leftArm.rotation.z = 0.28;
    rig.rightArm.rotation.x = -1.05 + Math.cos(beat) * 0.26;
    rig.rightArm.rotation.z = -0.22;
    rig.leftLeg.rotation.x = bob * 0.06;
    rig.rightLeg.rotation.x = -bob * 0.06;
    rig.torso.rotation.y = Math.sin(beat / 2) * 0.16;
    rig.torso.rotation.x = bob * 0.07;
  }

  /**
   * Sitting overwrites the whole body, which is right for the legs and was
   * quietly wrong for the arms: a drink raised at the bar was posed and then
   * flattened back down in the same frame, so nobody sitting on a stool was
   * ever seen to drink. The legs still fold under the seat whatever else is
   * happening; the drinking arm is left where the gesture put it.
   */
  private poseRigSeated(rig: AvatarRig, gesture?: AvatarGesture): void {
    // Sitting is knees. The hips take the thighs forward and the knees drop the
    // shins straight down — which a single-jointed leg simply cannot do, and is
    // why seated figures used to look as though they were levitating in a
    // crouch. Elbows rest folded on the lap.
    this.foldJoints(rig, 0.8, 0.8, 1.5, 1.5);
    rig.leftLeg.rotation.x = -1.28;
    rig.rightLeg.rotation.x = -1.28;
    rig.leftArm.rotation.x = -0.12;
    rig.leftArm.rotation.z = 0;
    rig.torso.rotation.z = 0;
    if (gesture === 'drink') return;
    rig.rightArm.rotation.x = -0.12;
    rig.rightArm.rotation.z = 0;
  }

  private poseRigSwimming(rig: AvatarRig, elapsed: number): void {
    // Arms reach nearly straight through a stroke and legs kick from the knee.
    this.foldJoints(rig, 0.2, 0.2, 0.45 + Math.sin(elapsed * 5.2) * 0.35, 0.45 - Math.sin(elapsed * 5.2) * 0.35);
    const paddle = Math.sin(elapsed * 6.6);
    rig.leftArm.rotation.x = paddle * 0.72;
    rig.rightArm.rotation.x = -paddle * 0.72;
  }

  private poseMentorDogSeated(rig: MentorDogRig): void {
    rig.leftBackLeg.rotation.x = -1.05;
    rig.rightBackLeg.rotation.x = -1.05;
    rig.leftFrontLeg.rotation.x = 0;
    rig.rightFrontLeg.rotation.x = 0;
    rig.body.rotation.x = -0.08;
  }

  private poseMentorDogSwimming(rig: MentorDogRig, elapsed: number, moving: boolean): void {
    const paddle = moving ? Math.sin(elapsed * 7.2) * 0.62 : 0.08;
    rig.leftFrontLeg.rotation.x = paddle;
    rig.rightFrontLeg.rotation.x = -paddle;
    rig.leftBackLeg.rotation.x = -paddle;
    rig.rightBackLeg.rotation.x = paddle;
    rig.body.rotation.x = 0.06;
  }

  /**
   * MENTOR's own vocabulary for the three things the human avatars do on B, O
   * and the left button. He has no arms and no spine to speak of, so none of
   * the humanoid poses transfer: what a dog has is a front end it can lift,
   * drop and drive forward, and a tail. Each action is built from those.
   */
  private animateMentorDog(
    rig: MentorDogRig,
    phase: number,
    moving: boolean,
    greeting: boolean,
    eating: boolean,
    flinching = false,
    gesture?: AvatarGesture,
    progress = 0,
  ): void {
    const stride = moving ? Math.sin(phase) * 0.48 : Math.sin(phase * 0.35) * 0.018;
    rig.leftFrontLeg.rotation.x = stride;
    rig.rightFrontLeg.rotation.x = -stride;
    rig.leftBackLeg.rotation.x = -stride;
    rig.rightBackLeg.rotation.x = stride;
    rig.body.rotation.x = 0;
    rig.body.rotation.z = moving ? Math.sin(phase * 0.5) * 0.025 : 0;
    rig.head.rotation.x = eating ? 0.46 + Math.sin(phase * 1.65) * 0.12 : 0;
    rig.head.rotation.y = Math.sin(phase * 0.24) * 0.08;
    rig.tail.rotation.z = Math.sin(phase * (greeting ? 3.8 : 0.7)) * (greeting ? 0.62 : 0.18);
    if (flinching) {
      // No humanoid rig to snap back, so the dog drops and turns its head away.
      rig.body.rotation.x = 0.3;
      rig.head.rotation.x = -0.42;
      rig.head.rotation.y = 0.5;
      rig.tail.rotation.z = 0;
    }
    // MENTOR greets only with his tail; the front legs remain a dog walk/idle
    // rather than mimicking the human wave pose.
    rig.rightFrontLeg.rotation.z = 0;

    if (gesture === 'dance') {
      // Up on the back legs, front paws paddling, tail going. The bounce is off
      // the beat of the paws so the whole animal is never still at once.
      const beat = Math.sin(phase * 2.1);
      const paddle = Math.sin(phase * 4.2);
      rig.body.rotation.x = -0.62 + beat * 0.12;
      rig.leftFrontLeg.rotation.x = -0.95 + paddle * 0.55;
      rig.rightFrontLeg.rotation.x = -0.95 - paddle * 0.55;
      rig.leftBackLeg.rotation.x = 0.24 + beat * 0.1;
      rig.rightBackLeg.rotation.x = 0.24 - beat * 0.1;
      rig.head.rotation.x = -0.24 + beat * 0.1;
      rig.head.rotation.y = Math.sin(phase * 1.05) * 0.3;
      rig.tail.rotation.z = Math.sin(phase * 4.6) * 0.7;
      return;
    }

    if (gesture === 'offer' || gesture === 'bow') {
      // A play-bow: chest to the ground, front legs stretched out, rump up.
      // Held through the middle of the gesture rather than swung through, so it
      // reads as reverence and not as a stumble.
      const depth = Math.min(1, Math.sin(Math.min(progress, 0.999) * Math.PI) * 1.6);
      rig.body.rotation.x = 0.78 * depth;
      rig.leftFrontLeg.rotation.x = -0.95 * depth;
      rig.rightFrontLeg.rotation.x = -0.95 * depth;
      rig.leftBackLeg.rotation.x = 0.14 * depth;
      rig.rightBackLeg.rotation.x = 0.14 * depth;
      rig.head.rotation.x = 0.42 * depth;
      rig.head.rotation.y = 0;
      rig.tail.rotation.z = Math.sin(phase * 3.2) * 0.5 * depth;
      return;
    }

    if (gesture === 'punch') {
      // Rearing up and snapping. Same shape of timing as the humans' cross —
      // the weight gathers back over the hips, then the front end is thrown up
      // and forward and the jaw closes at the top of it.
      const coil = progress < 0.3
        ? progress / 0.3
        : Math.max(0, 1 - (progress - 0.3) / 0.16);
      const strike = progress < 0.3
        ? 0
        : progress < 0.46
          ? Math.pow((progress - 0.3) / 0.16, 0.5)
          : Math.max(0, 1 - (progress - 0.46) / 0.54);
      rig.body.rotation.x = 0.22 * coil - 1.05 * strike;
      // Front legs tuck on the way up and reach on the way through.
      rig.leftFrontLeg.rotation.x = 0.5 * coil - 1.5 * strike;
      rig.rightFrontLeg.rotation.x = 0.5 * coil - 1.35 * strike;
      // The back legs take the weight and drive.
      rig.leftBackLeg.rotation.x = 0.3 * coil + 0.42 * strike;
      rig.rightBackLeg.rotation.x = 0.3 * coil + 0.42 * strike;
      // The head pulls back with the load and snaps down through the target.
      rig.head.rotation.x = -0.4 * coil + 0.72 * strike;
      rig.head.rotation.y = 0;
      rig.tail.rotation.z = 0.2 * strike;
      return;
    }
  }

  /** True while the position is anywhere inside the club building. */
  private inClub(x: number, z: number): boolean {
    return this.inClubRoom(x, z) || this.onClubStairs(x, z) || this.inClubLobby(x, z);
  }

  private inClubRoom(x: number, z: number): boolean {
    const b = clubBounds;
    return x > b.roomMinX && x < b.roomMaxX && z > b.roomMinZ && z < b.roomMaxZ;
  }

  private onClubStairs(x: number, z: number): boolean {
    const b = clubBounds;
    return x >= b.stairBottomX && x < b.stairTopX && z > b.stairMinZ && z < b.stairMaxZ;
  }

  private inClubLobby(x: number, z: number): boolean {
    const b = clubBounds;
    return x > b.lobbyMinX && x < b.lobbyMaxX && z > b.lobbyMinZ && z < b.lobbyMaxZ;
  }

  /**
   * Standing height for a position. Everywhere is flat except the club, where
   * the stair run carries the attendee from the lobby down to the room.
   */
  /** True while on the rooftop deck or the stair that climbs to it. */
  private onRooftop(x: number, z: number): boolean {
    const r = rooftopBounds;
    const onDeck = x > r.minX && x < r.maxX && z > r.deckMinZ && z < r.maxZ;
    return onDeck || this.rooftopStairHeight(x, z) !== undefined;
  }

  /**
   * Height of the rooftop stair at a point, or undefined off it. The two
   * flights ramp; the half-landing and the top landing are level, and the top
   * landing reaches east to the deck edge so stepping off it is a step across.
   */
  private rooftopStairHeight(x: number, z: number): number | undefined {
    const r = rooftopBounds;
    if (x <= r.stairMinX) return undefined;
    if (z > r.stairTopZ) {
      return x < r.maxX && z <= r.stairMaxZ ? ROOF_AVATAR_Y : undefined;
    }
    if (x >= r.stairMaxX || z <= r.stairMinZ) return undefined;
    const half = (ROOF_AVATAR_Y - AVATAR_GROUND_Y) / 2;
    if (z <= r.stairLandingMinZ) {
      const progress = (z - r.stairMinZ) / (r.stairLandingMinZ - r.stairMinZ);
      return AVATAR_GROUND_Y + half * progress;
    }
    if (z <= r.stairLandingMaxZ) return AVATAR_GROUND_Y + half;
    const progress = (z - r.stairLandingMaxZ) / (r.stairTopZ - r.stairLandingMaxZ);
    return AVATAR_GROUND_Y + half + half * progress;
  }

  /**
   * The floor under a given spot. `fromY` says which storey the body is on,
   * which only matters where one walkable surface sits above another: the shop
   * fills the garage bay and its roof carries on from the deck, so the same
   * plan position is two different floors depending on who is asking.
   */
  private groundHeightAt(x: number, z: number, fromY = this.player.position.y): number {
    const r = rooftopBounds;
    if (x > r.minX && x < r.maxX && z >= r.deckMinZ && z < r.maxZ) return ROOF_AVATAR_Y;
    // The slab over the shop, level with the deck it continues from. Only for
    // a body already up there — at street level this is the shop's own floor.
    if (x > r.minX && x < r.maxX && z > r.minZ && z < r.deckMinZ && fromY > ROOF_Y - 1) return ROOF_AVATAR_Y;
    const stair = this.rooftopStairHeight(x, z);
    if (stair !== undefined) return stair;
    if (x > TEMPLE.minX - 1.5 && x < TEMPLE.maxX + 1.5 && z > TEMPLE.minZ - 1.5 && z < TEMPLE.maxZ + 1.5) {
      return TEMPLE_FLOOR_Y;
    }
    // The three steps on the temple's west face, taken as one ramp so the climb
    // is smooth rather than a stutter of ledges.
    if (x > TEMPLE.stepMinX && x <= TEMPLE.minX - 1.5 && z > TEMPLE.minZ && z < TEMPLE.maxZ) {
      const climbed = (x - TEMPLE.stepMinX) / (TEMPLE.minX - 1.5 - TEMPLE.stepMinX);
      return AVATAR_GROUND_Y + (TEMPLE_FLOOR_Y - AVATAR_GROUND_Y) * THREE.MathUtils.clamp(climbed, 0, 1);
    }
    if (this.inClubRoom(x, z)) return CLUB_AVATAR_Y;
    if (this.onClubStairs(x, z)) {
      const b = clubBounds;
      const progress = (b.stairTopX - x) / (b.stairTopX - b.stairBottomX);
      return AVATAR_GROUND_Y + (CLUB_AVATAR_Y - AVATAR_GROUND_Y) * THREE.MathUtils.clamp(progress, 0, 1);
    }
    return AVATAR_GROUND_Y;
  }

  private staticCollides(x: number, z: number, y = this.player.position.y): boolean {
    return this.colliders.some(
      (collider) =>
        x > collider.minX && x < collider.maxX && z > collider.minZ && z < collider.maxZ &&
        (collider.minY === undefined || y >= collider.minY) &&
        (collider.maxY === undefined || y <= collider.maxY),
    );
  }

  /**
   * Whether a visitor is close enough ahead of this resident to be worth going
   * round early — before a step is actually blocked, by which time somebody is
   * already walking into you.
   *
   * Everybody in the world counts, not only whoever is at this keyboard: to a
   * resident there is no difference between the two, and there is no reason for
   * a guest to be the only one people step aside for.
   *
   * Three conditions. Ahead of it, because somebody behind is not in the way.
   * On the same storey, because the club is under the promenade and the deck is
   * over the garage. And nearer than the spot being walked to — without that
   * last one a resident gives way to somebody merely standing beside it, and
   * backs off a step at a time until it has left the place entirely.
   */
  private visitorInTheWay(npc: NpcAvatar, direction: THREE.Vector3, targetGap: number): boolean {
    const reachSq = Math.min(8, targetGap * targetGap);
    const ahead = (position: THREE.Vector3): boolean => {
      const toVisitorX = position.x - npc.group.position.x;
      const toVisitorZ = position.z - npc.group.position.z;
      if (toVisitorX * toVisitorX + toVisitorZ * toVisitorZ >= reachSq) return false;
      if (Math.abs(position.y - npc.group.position.y) >= 2) return false;
      return toVisitorX * direction.x + toVisitorZ * direction.z > 0;
    };
    if (ahead(this.player.position)) {
      npc.gaveWayToRemote = false;
      return true;
    }
    for (const avatar of this.remoteAvatars.values()) {
      if (ahead(avatar.group.position)) {
        npc.gaveWayToRemote = true;
        return true;
      }
    }
    return false;
  }

  private npcCollides(npc: NpcAvatar, x: number, z: number): boolean {
    if (this.staticCollides(x, z, npc.group.position.y)) return true;
    // Bodies are close to a unit across, so 1.05 between centres left them
    // visibly inside one another whenever two routes crossed.
    const radiusSq = 1.35 * 1.35;
    // Wider than the separation distance the pass above enforces, so a resident
    // stops short of an attendee rather than walking into them and being shoved
    // out again — which is what made two bodies draw through each other.
    const playerRadiusSq = 1.32 * 1.32;
    const playerDx = this.player.position.x - x;
    const playerDz = this.player.position.z - z;
    if (playerDx * playerDx + playerDz * playerDz < playerRadiusSq) return true;
    for (const other of this.npcs) {
      if (other === npc) continue;
      if (other.id === this.controlledNpcId) continue;
      if (other.id === 'MENTOR' && (this.carriedItem === 'MENTOR' || Boolean(this.mentorCarrierId))) continue;
      const dx = other.group.position.x - x;
      const dz = other.group.position.z - z;
      if (dx * dx + dz * dz < radiusSq) return true;
    }
    for (const avatar of this.remoteAvatars.values()) {
      const dx = avatar.group.position.x - x;
      const dz = avatar.group.position.z - z;
      if (dx * dx + dz * dz < radiusSq) return true;
    }
    return false;
  }

  /**
   * Holds bodies out of each other without ever being able to trap one.
   *
   * The rule that wedged people was the last resort below: when the shove that
   * would separate two bodies ran into scenery, the attendee was put back where
   * they had been at the start of the frame. Standing between a resident and a
   * wall, that undid every step they took to walk out of it — the harder they
   * pushed, the more reliably they were returned. Nothing now moves an attendee
   * backwards; if there is nowhere to shove them, they are left where their own
   * movement put them, which is always a way out.
   */
  private resolvePlayerCrowdCollisions(): void {
    const minimumDistance = 1.12;
    const separate = (position: THREE.Vector3, yieldNpc?: NpcAvatar) => {
      // Floors are stacked in this world — the deck is seven up, the basement
      // sixteen down — and this test is horizontal only. Without a height check
      // someone standing directly overhead would shove the attendee sideways
      // through a wall they cannot see.
      if (Math.abs(position.y - this.player.position.y) > 2.6) return;
      let dx = this.player.position.x - position.x;
      let dz = this.player.position.z - position.z;
      let distance = Math.hypot(dx, dz);
      if (distance >= minimumDistance) return;
      if (distance < 0.001) {
        dx = -this.moveVector.x || 1;
        dz = -this.moveVector.z;
        distance = Math.hypot(dx, dz);
      }
      const nx = dx / distance;
      const nz = dz / distance;
      const overlap = minimumDistance - distance + 0.04;

      // NPCs yield a short step when possible, so a group cannot form a hard
      // ring around the attendee. Solid scenery still remains authoritative.
      // A resident gives way first, and will step aside as well as back: with
      // only the straight retreat to try, one standing against a wall had
      // nowhere to go and the attendee wore the whole overlap.
      if (yieldNpc) {
        const escapes: Array<[number, number]> = [[-nx, -nz], [-nz, nx], [nz, -nx]];
        for (const [ax, az] of escapes) {
          const npcX = position.x + ax * overlap;
          const npcZ = position.z + az * overlap;
          if (this.staticCollides(npcX, npcZ, yieldNpc.group.position.y)) continue;
          yieldNpc.group.position.x = npcX;
          yieldNpc.group.position.z = npcZ;
          yieldNpc.waitUntil = performance.now() + 360;
          return;
        }
      }

      // Otherwise the attendee is moved out, sliding along whichever axis is
      // free when the direct line is not.
      const playerX = this.player.position.x + nx * overlap;
      const playerZ = this.player.position.z + nz * overlap;
      if (!this.staticCollides(playerX, playerZ)) {
        this.player.position.x = playerX;
        this.player.position.z = playerZ;
        return;
      }
      if (!this.staticCollides(playerX, this.player.position.z)) {
        this.player.position.x = playerX;
        return;
      }
      if (!this.staticCollides(this.player.position.x, playerZ)) {
        this.player.position.z = playerZ;
      }
      // Nowhere at all to put them: leave the body where it is. Overlapping for
      // a moment is a great deal better than being pinned in place.
    };

    for (const npc of this.npcs) {
      if (npc.id === this.controlledNpcId) continue;
      if (npc.id === 'MENTOR' && (this.carriedItem === 'MENTOR' || Boolean(this.mentorCarrierId))) continue;
      separate(npc.group.position, npc);
    }
    for (const avatar of this.remoteAvatars.values()) separate(avatar.group.position);
  }

  /**
   * Lands a thrown punch at the moment the fist gets there rather than when the
   * button went down: the jolt, the resident's recoil and the shove they take
   * all belong to contact, not to the wind-up before it.
   */
  private settlePunchImpact(): void {
    if (!this.punchImpactAt || performance.now() < this.punchImpactAt) return;
    this.punchImpactAt = 0;
    this.cameraShake = Math.min(1.8, this.cameraShake + this.punchImpactPower);
    const npc = this.punchImpactNpc;
    this.punchImpactNpc = undefined;
    if (!npc) return;
    const away = new THREE.Vector3(
      npc.group.position.x - this.player.position.x,
      0,
      npc.group.position.z - this.player.position.z,
    );
    if (away.lengthSq() < 0.0001) return;
    npc.knockback.copy(away.normalize()).multiplyScalar(7.4);
  }

  private updateCamera(delta: number, _elapsed: number): void {
    this.settlePunchImpact();
    const cameraTarget = this.player.position.clone();
    if (this.cameraMode === 'screening') {
      const venue = this.activeSeat?.venue ?? this.screeningVenue();
      // Height is relative to the seat, not an absolute 3.6: the club's floor
      // is sixteen units down, so a fixed height put the camera above the roof.
      // The side comes from which way the screen faces, or the camera ends up
      // behind it in the venues whose audience sits to the north.
      cameraTarget.set(
        this.player.position.x,
        this.player.position.y + 3.3,
        this.player.position.z + 2.6 * venueScreens[venue].facing,
      );
      this.lookTarget.set(...venueScreens[venue].target);
      const viewingDistance = Math.max(9, this.lookTarget.distanceTo(cameraTarget));
      const forward = this.lookTarget.clone().sub(cameraTarget).normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
      this.lookTarget.addScaledVector(right, this.screeningOrbit.yaw * viewingDistance * 0.92);
      this.lookTarget.y -= this.screeningOrbit.pitch * viewingDistance * 0.68;
    } else if (this.cameraMode === 'first-person') {
      const orbit = this.cameraOrbit.follow;
      const eye = this.player.position.clone().add(new THREE.Vector3(0, 2.62, 0));
      cameraTarget.copy(eye);
      this.lookTarget.copy(eye).add(new THREE.Vector3(
        -Math.sin(orbit.yaw) * 6,
        -Math.sin(orbit.pitch) * 6,
        -Math.cos(orbit.yaw) * 6,
      ));
      // Snap rather than ease, or the view lags a step behind the body.
      this.camera.position.copy(cameraTarget);
      this.camera.lookAt(this.lookTarget);
      this.applyCameraShake(delta);
      return;
    } else {
      this.lookTarget.copy(this.player.position).add(new THREE.Vector3(
        0,
        this.cameraMode === 'perspective' ? 1.65 : 1.4,
        this.cameraMode === 'perspective' ? 0 : -2.2,
      ));
      const orbit = this.cameraOrbit[this.cameraMode === 'perspective' ? 'perspective' : 'follow'];
      const radius = (this.cameraMode === 'perspective' ? 11.68 : 10.56) * this.cameraZoom;
      const horizontalRadius = Math.cos(orbit.pitch) * radius;
      cameraTarget.copy(this.lookTarget).add(new THREE.Vector3(
        Math.sin(orbit.yaw) * horizontalRadius,
        Math.sin(orbit.pitch) * radius,
        Math.cos(orbit.yaw) * horizontalRadius,
      ));
    }
    this.confineCameraToClub(cameraTarget);
    this.confineCameraOverWater(cameraTarget);
    this.pullCameraClearOfWalls(cameraTarget, delta);
    const smoothing = 1 - Math.exp(-delta * 5.2);
    this.camera.position.lerp(cameraTarget, smoothing);
    this.camera.lookAt(this.lookTarget);
    this.applyCameraShake(delta);
    this.applyDrunkenView(delta);
  }

  /**
   * The jolt of a punch, thrown or taken. Shakes the camera off its mark and
   * rolls the horizon for a third of a second, then is gone. It accumulates
   * rather than resets, so a flurry builds instead of flickering, and it is
   * capped so the view is never thrown so far the world stops reading.
   */
  private applyCameraShake(delta: number): void {
    if (this.cameraShake <= 0.001) {
      this.cameraShake = 0;
      return;
    }
    this.cameraShakePhase += delta * 44;
    const amount = this.cameraShake;
    this.camera.position.x += Math.sin(this.cameraShakePhase * 1.7) * amount * 0.4;
    this.camera.position.y += Math.sin(this.cameraShakePhase * 2.3 + 1.1) * amount * 0.28;
    this.camera.position.z += Math.cos(this.cameraShakePhase * 1.9) * amount * 0.4;
    // Re-aimed after the shove, so the body stays in frame while the mount
    // rattles around it. The roll goes on top, and is what sells the hit.
    this.camera.lookAt(this.lookTarget);
    this.camera.rotation.z += Math.sin(this.cameraShakePhase * 2.05) * amount * 0.055;
    this.cameraShake = Math.max(0, amount - delta * 3.6);
  }

  /** How far gone the attendee is, 0 to 1, easing off as it wears away. */
  drunkenness(): number {
    const remaining = this.drunkUntil - performance.now();
    if (remaining <= 0) return 0;
    return Math.min(1, remaining / (DRUNK_DURATION_MS * 0.55));
  }

  /**
   * The room moves on its own once the drinks add up: the horizon rolls, the
   * aim wanders and the lens breathes. Movement itself is left alone, so an
   * attendee can always walk out of the club.
   */
  private applyDrunkenView(delta: number): void {
    const amount = this.drunkenness();
    if (amount <= 0) {
      // Never touch the orientation when sober. lookAt has already set it, and
      // its roll is rarely zero, so nudging that value tilts the whole view.
      if (Math.abs(this.camera.fov - this.baseFov) > 0.01) {
        this.camera.fov += (this.baseFov - this.camera.fov) * 0.12;
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    this.drunkPhase += delta * 1.6;
    // A gentle list rather than a capsize. Roll is added on top of the
    // orientation lookAt produced, never used to overwrite it.
    this.camera.rotation.z += Math.sin(this.drunkPhase) * 0.045 * amount;
    this.camera.position.x += Math.sin(this.drunkPhase * 0.8) * 0.12 * amount;
    this.camera.fov += ((this.baseFov + amount * 3.5) - this.camera.fov) * 0.06;
    this.camera.updateProjectionMatrix();
  }

  /**
   * The club is the only roofed interior, so it gets its own camera rather
   * than the outdoor orbit, which swings wide enough to rise through the roof
   * and frame the lot outside. Rather than clamping the camera into the room,
   * which collapses the shot to nothing when the attendee stands against a
   * wall, the view distance is cut to whatever fits and the camera lifts as it
   * is squeezed, easing into a look down over the floor.
   */
  /**
   * Holds the eye in a band above the waterline while swimming. Grazing the
   * surface is what costs: at that angle the sea's sheets are seen almost
   * edge-on, so each one covers the whole frame and the horizon stretches to
   * the far edge of a 196-unit plane. Lifting the eye a little turns the same
   * sheets back into a strip of the screen, which is the difference the
   * attendee noticed between a smooth view and a stuttering one.
   */
  /**
   * Keeps the camera on the attendee's side of whatever stands behind them.
   *
   * The orbit cameras are placed by trigonometry alone, ten units back along
   * the view: walk up to a wall and that ten units is inside it, so the view
   * passes through the wall and the world is seen from within the masonry. This
   * walks out from the head towards where the camera wants to be and stops at
   * the first thing in the way, which is what a chase camera has to do.
   *
   * It marches the world's own colliders rather than raycasting the scene:
   * those boxes are what the body is already refused by, so the camera stops at
   * exactly the surfaces that are solid, and none of the scenery that is not.
   */
  /**
   * What actually stands between the view and the body. A chair does not: the
   * camera rides well above one and should ride over it. Only things that reach
   * head height are treated as obstructions.
   *
   * Colliders with no top at all are walls and buildings and always count —
   * which is also why the chairs had to be given a real one. Without it they
   * were infinitely tall to this test, so standing anywhere in a seating block
   * threw the camera in against the nearest seat back.
   */
  private blocksCamera(x: number, z: number, y: number): boolean {
    const headHeight = this.player.position.y + 2.2;
    return this.colliders.some(
      (collider) =>
        x > collider.minX && x < collider.maxX && z > collider.minZ && z < collider.maxZ &&
        (collider.minY === undefined || y >= collider.minY) &&
        (collider.maxY === undefined || y <= collider.maxY) &&
        // Where it really tops out, falling back to the band when nothing
        // better is known. Undefined on both means a wall, which always counts.
        ((collider.viewTop ?? collider.maxY) === undefined ||
          (collider.viewTop ?? collider.maxY)! > headHeight),
    );
  }

  private pullCameraClearOfWalls(cameraTarget: THREE.Vector3, delta: number): void {
    if (this.playerState === 'swimming') return;
    // Not while seated at a screening. Everywhere else the look target is the
    // attendee's own head, so walking out from it towards the camera walks out
    // from the body — which is what this is for. In the screening view the look
    // target is the screen itself, thirty-odd units away across the room, so
    // the same walk started at the screen and stopped at the first thing it
    // met, pinning the camera about a unit from the panel. That is why sitting
    // down anywhere with a screen filled the whole frame with the film.
    //
    // The seated camera does not need this: it is placed at a known offset from
    // a registered seat inside a room, and confineCameraToClub already holds it
    // within the walls.
    if (this.cameraMode === 'screening') return;
    this.cameraProbe.subVectors(cameraTarget, this.lookTarget);
    const reach = this.cameraProbe.length();
    if (reach < 0.001) return;
    this.cameraProbe.divideScalar(reach);
    // A third of a unit is finer than the thinnest wall in the world, which is
    // the temple's at 0.9, so nothing can be stepped over.
    const step = 0.33;
    // Held off the surface by a little more than the near plane, or the wall
    // the camera has stopped against is itself clipped through.
    const clearance = 0.55;
    let safe = reach;
    for (let travelled = clearance; travelled <= reach; travelled += step) {
      const x = this.lookTarget.x + this.cameraProbe.x * travelled;
      const y = this.lookTarget.y + this.cameraProbe.y * travelled;
      const z = this.lookTarget.z + this.cameraProbe.z * travelled;
      if (this.blocksCamera(x, z, y)) {
        // Never closer than this. Some things in the world are honestly taller
        // than a head — a market stall is — so they should hold the view off,
        // but a unit and a tenth puts the camera inside the avatar's collar,
        // which is what "zoomed in super close" has meant every time.
        safe = Math.max(3.4, travelled - clearance);
        break;
      }
    }
    // The ground counts too: tilting down used to bury the camera in the road.
    for (let travelled = clearance; travelled <= safe; travelled += step) {
      const x = this.lookTarget.x + this.cameraProbe.x * travelled;
      const y = this.lookTarget.y + this.cameraProbe.y * travelled;
      const z = this.lookTarget.z + this.cameraProbe.z * travelled;
      if (y < this.groundHeightAt(x, z, this.player.position.y) + 0.45) {
        safe = Math.max(1.1, travelled - step);
        break;
      }
    }
    // The distance is eased rather than the position, so the view closes in
    // behind something and opens again afterwards without either being a jump.
    // Snapping it was what made walking past a seat feel like a shove.
    if (this.cameraReach <= 0) this.cameraReach = safe;
    else this.cameraReach += (safe - this.cameraReach) * (1 - Math.exp(-delta * 8.5));
    if (this.cameraReach >= reach - 0.01) return;
    cameraTarget.copy(this.lookTarget).addScaledVector(this.cameraProbe, this.cameraReach);
  }

  private confineCameraOverWater(cameraTarget: THREE.Vector3): void {
    if (this.playerState !== 'swimming') return;
    const waterline = 0.14;
    cameraTarget.y = THREE.MathUtils.clamp(cameraTarget.y, waterline + 2.2, waterline + 3.6);
    // The horizon stays where it is. Turning is free; the height and the tilt
    // are fixed, which is the view that holds its frame rate over open water.
    this.lookTarget.y = waterline + 1.15;
  }

  private confineCameraToClub(cameraTarget: THREE.Vector3): void {
    const { x, z } = this.player.position;
    if (!this.inClub(x, z)) return;
    const b = clubBounds;
    const inset = 1.1;
    let minX = b.roomMinX + inset;
    let maxX = b.roomMaxX - inset;
    let minZ = b.roomMinZ + inset;
    let maxZ = b.roomMaxZ - inset;
    let ceiling = CLUB_FLOOR_Y + CLUB_ROOM_HEIGHT - 1.4;
    if (this.inClubLobby(x, z)) {
      minX = b.lobbyMinX + inset;
      maxX = b.lobbyMaxX - inset;
      minZ = b.lobbyMinZ + inset;
      maxZ = b.lobbyMaxZ - inset;
      ceiling = 4.2;
    } else if (this.onClubStairs(x, z)) {
      minX = b.stairBottomX + 0.6;
      maxX = b.stairTopX - 0.6;
      minZ = b.stairMinZ + 0.6;
      maxZ = b.stairMaxZ - 0.6;
      ceiling = 4.2;
    }

    // A screening view is aimed at the screen on purpose; pulling its target
    // back onto the attendee is what left the bar looking at the counter.
    if (this.cameraMode === 'first-person' || this.cameraMode === 'screening') return;
    const orbit = this.cameraOrbit[this.cameraMode === 'perspective' ? 'perspective' : 'follow'];
    const dirX = Math.sin(orbit.yaw);
    const dirZ = Math.cos(orbit.yaw);
    const reach = (direction: number, low: number, high: number, from: number): number => {
      if (Math.abs(direction) < 0.0001) return Number.POSITIVE_INFINITY;
      return direction > 0 ? (high - from) / direction : (low - from) / direction;
    };
    const preferred = 7.4;
    const radius = Math.max(1.6, Math.min(preferred, reach(dirX, minX, maxX, x), reach(dirZ, minZ, maxZ, z)));
    const squeeze = (preferred - radius) / preferred;
    const floorY = this.groundHeightAt(x, z);

    this.lookTarget.set(x, floorY + 1.3, z);
    cameraTarget.set(
      x + dirX * radius,
      Math.min(floorY + 2.3 + squeeze * 2.6 + Math.sin(orbit.pitch) * 1.3, ceiling),
      z + dirZ * radius,
    );
    cameraTarget.y = Math.max(cameraTarget.y, floorY + 0.85);
  }

  /**
   * The tempo and downbeat of the track the club is playing. Both come from
   * the service, so every attendee's lights flash on the same beat.
   */
  setClubBeat(bpm: number, startedAt: number): void {
    this.clubBeat = { bpm: THREE.MathUtils.clamp(bpm || 120, 40, 220), startedAt };
  }

  private updateClubBeat(elapsed: number): void {
    if (!this.clubLights.length) return;
    const secondsPerBeat = 60 / this.clubBeat.bpm;
    const sinceStart = this.clubBeat.startedAt
      ? (Date.now() - this.clubBeat.startedAt) / 1000
      : elapsed;
    const beat = sinceStart / secondsPerBeat;
    const phase = beat - Math.floor(beat);
    // A sharp attack that decays across the beat reads as a strobe rather
    // than a sine fade.
    const pulse = Math.pow(1 - phase, 2.6);
    const bar = Math.floor(beat) % 4;
    // The room holds one colour per bar. Every fixture and floor panel shares
    // it, so the whole space flashes as one rather than as a patchwork.
    const barColor = clubLightColors[Math.floor(beat / 4) % clubLightColors.length];
    for (const light of this.clubLights) {
      const lightMaterial = light.material as THREE.MeshBasicMaterial;
      lightMaterial.color.setHex(barColor);
      lightMaterial.transparent = true;
      lightMaterial.opacity = 0.22 + pulse * 0.78;
      light.scale.y = 0.85 + pulse * 0.5;
    }
    for (const panel of this.clubFloorPanels) {
      const panelMaterial = panel.material as THREE.MeshBasicMaterial;
      panelMaterial.color.setHex(barColor);
      panelMaterial.transparent = true;
      panelMaterial.opacity = 0.2 + pulse * 0.7;
    }
    for (const beam of this.clubBeatLights) {
      beam.color.setHex(barColor);
      beam.intensity = 20 + pulse * 90;
    }
    if (this.clubFloorLight) this.clubFloorLight.color.setHex(barColor);
    this.clubFacadeLights.forEach((light, index) => {
      const facadeMaterial = light.material as THREE.MeshBasicMaterial;
      facadeMaterial.transparent = true;
      facadeMaterial.opacity = index % 4 === bar ? 0.45 + pulse * 0.55 : 0.22 + pulse * 0.24;
    });
    this.clubFacadeGlows.forEach((glow, index) => {
      glow.intensity = (index % 4 === bar ? 10 : 3) + pulse * 16;
    });
    if (this.clubFloorLight) this.clubFloorLight.intensity = 55 + pulse * 90;
    if (this.clubNeon) {
      (this.clubNeon.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.45;
      (this.clubNeon.material as THREE.MeshBasicMaterial).transparent = true;
    }
    if (this.clubBoothGlow) {
      (this.clubBoothGlow.material as THREE.MeshBasicMaterial).opacity = 0.4 + pulse * 0.6;
      (this.clubBoothGlow.material as THREE.MeshBasicMaterial).transparent = true;
    }
  }

  private locationName(): string {
    const x = this.player.position.x;
    const z = this.player.position.z;
    if (z > GATE_Z - 12) return 'FESTIVAL GATE';
    if (this.inClub(x, z)) return 'THE BASEMENT';
    if (this.onRooftop(x, z)) return 'THE ROOFTOP';
    if (x < -20 && z < -28 && z > -50) return 'THE PALACE';
    if (x > 20 && z < -8 && z > -38) return 'DRIVE-IN 88';
    if (z > -17) return 'MY SQUARE';
    if (z > -30) return 'THE SHORE ENTRANCE';
    if (z < -48) return 'MEDITERRANEAN SEA';
    return 'THE SHORE';
  }

  /** Whether the attendee is stood before the altar, close enough to worship. */
  private atTheAltar(): boolean {
    if (!this.templeAltar) return false;
    if (this.player.position.y < TEMPLE.podium - 0.5) return false;
    return Math.hypot(
      this.player.position.x - this.templeAltar.x,
      this.player.position.z - this.templeAltar.z,
    ) < 7;
  }

  /**
   * What a tap on the prompt should do. Decided in the same breath as the words
   * are chosen, so the two can never disagree — the prompt used to be wired
   * straight to interact() whatever it said, which left the altar's O / WORSHIP
   * doing nothing at all on a phone, and SHIFT+E / DRINK UP pouring nothing.
   */
  private promptAction: 'worship' | 'shift' | 'interact' = 'interact';
  /**
   * Whether the prompt is offering something or merely saying where you are.
   * Recorded by the prompt itself: the list this used to be kept in was a
   * second, hand-copied set of the same branches, and it had drifted — the
   * altar was never added to it, so the button carrying O / WORSHIP was
   * disabled and swallowed every tap. A phone has no O key, so the only way in
   * was shut.
   */
  private promptActionable = false;
  /**
   * Whether the prompt offers a second thing behind SHIFT+E. Only MENTOR does:
   * E gives a treat and SHIFT+E picks the dog up, and a phone can say neither
   * of those without being given a button for it.
   */
  private promptSecondary = false;

  /** Do whatever the prompt is currently offering. */
  triggerPrompt(): void {
    if (this.promptAction === 'worship') this.donate();
    else this.interact(this.promptAction === 'shift');
  }

  private interactionLabel(): string | undefined {
    this.promptAction = 'interact';
    this.promptActionable = true;
    this.promptSecondary = false;
    if (this.atTheAltar()) {
      this.promptAction = 'worship';
      return `O / WORSHIP ${this.templeSignText.name}`;
    }
    if (this.playerState === 'seated') {
      if (this.carriedItem === 'DRINK') {
        this.promptAction = 'shift';
        return 'SHIFT+E / DRINK UP';
      }
      if (this.nearClubBar()) return 'E / ORDER A DRINK';
      return 'E / STAND UP — private viewing pauses if active';
    }
    // A seat within reach outranks putting MENTOR down, so the prompt has to
    // offer the seat as well. MENTOR stays on the attendee's head once seated.
    const seat = this.nearestSeat();
    if (seat) {
      if (this.occupiedSeats.has(seat.id)) {
        this.promptActionable = false;
        return `${seat.id} · OCCUPIED`;
      }
      return this.carriedItem === 'MENTOR' ? `E TO SIT · ${seat.id}` : `E / TAKE SEAT ${seat.id}`;
    }
    if (this.carriedItem === 'MENTOR') return 'E / PUT MENTOR DOWN';
    if (this.player.position.distanceTo(concessionPosition) < 2.5) {
      // Was a dead end that only told you what you were holding. Eating has
      // always been what E does with anything edible; nothing ever said so, and
      // on a phone, where the prompt is the only way to reach an action, that
      // meant it could not be done at all.
      if (this.carriedItem) return this.eatingLabel() ?? 'POPCORN COLLECTED';
      return 'E / TAKE POPCORN';
    }
    const followerGreeting = this.mentorFollowsActiveAvatar() ? this.nearestSocialTarget() : undefined;
    if (followerGreeting) return this.controlledNpcId === 'MENTOR'
      ? `E / WAG TAIL AT ${followerGreeting.name}`
      : `E / WAVE TO ${followerGreeting.name}`;
    if (this.nearbyMentor() && !this.mentorGivesWay()) {
      this.promptSecondary = true;
      return this.carriedItem === 'POPCORN'
        ? 'E / GIVE MENTOR A TREAT · SHIFT+E / PICK UP (POPCORN WILL BE LOST)'
        : 'E / GIVE MENTOR A TREAT · SHIFT+E / PICK UP';
    }
    if (this.carriedItem === 'DRINK') {
      this.promptAction = 'shift';
      return 'SHIFT+E / DRINK UP';
    }
    // Anything else edible, wherever you happen to be standing with it.
    const eating = this.eatingLabel();
    if (eating) return eating;
    if (this.nearClubBar()) return 'E / ORDER A DRINK';
    if (this.nearJukebox()) return 'E / PUT A RECORD ON';
    if (this.nearShopCounter()) return 'E / OPEN THE POP-UP STORE';
    const dj = this.nearbyDj();
    if (dj) return `E / REQUEST A TRACK FROM ${dj.name}`;
    const socialTarget = this.nearestSocialTarget();
    if (socialTarget) return this.controlledNpcId === 'MENTOR'
      ? `E / WAG TAIL AT ${socialTarget.name}`
      : `E / WAVE TO ${socialTarget.name}`;
    if (this.player.position.distanceTo(pamphletPosition) < 2.35) {
      return this.hasPamphlet ? 'E / OPEN FESTIVAL PAMPHLET' : 'E / TAKE FESTIVAL PAMPHLET';
    }
    // Nothing to perform: these two describe where you are, they do not offer
    // anything, so a tap on them should stay a tap on nothing.
    if (this.playerState === 'swimming') {
      this.promptActionable = false;
      return 'SWIMMING · E / GREET WHEN AN ATTENDEE IS NEARBY';
    }
    if (this.player.position.z < -45) {
      this.promptActionable = false;
      return 'SWIMWEAR ON · ENTER WATER';
    }
    if (this.player.position.distanceTo(programmeBoardPosition) < 7.2) return 'E / OPEN ROTATING PROGRAMME';
    this.promptActionable = false;
    return undefined;
  }

  /**
   * Whether the prompt on screen can be pressed. Read from the prompt rather
   * than worked out again, so the two cannot disagree. Both snapshots ask for
   * the words immediately before asking this.
   */
  /**
   * What a carried thing offers to be done with it, if anything. A drink is
   * poured with SHIFT+E and has its own prompt; everything else edible is eaten
   * with plain E.
   */
  private eatingLabel(): string | undefined {
    const item = this.carriedItem;
    if (!item || item === 'DRINK' || !EDIBLE_ITEMS.includes(item)) return undefined;
    return `E / EAT ${item}`;
  }

  private canInteract(): boolean {
    return this.promptActionable;
  }

  /** Whether the prompt also offers a SHIFT+E, which a phone has no way to say. */
  hasSecondaryPrompt(): boolean {
    return this.promptSecondary;
  }

  /** Do the SHIFT+E half of a prompt that offers both. */
  triggerSecondaryPrompt(): void {
    this.interact(true);
  }

  private nearestSocialTarget(): { name: string; npc?: NpcAvatar; remote?: RemoteAvatar } | undefined {
    let nearest: { name: string; npc?: NpcAvatar; remote?: RemoteAvatar; distance: number } | undefined;
    for (const npc of this.npcs) {
      if (npc.id === 'MENTOR' || npc.id === this.controlledNpcId || npc.pose === 'dj') continue;
      const distance = npc.group.position.distanceTo(this.player.position);
      if (distance < 3.3 && (!nearest || distance < nearest.distance)) nearest = { name: npc.name, npc, distance };
    }
    for (const remote of this.remoteAvatars.values()) {
      const distance = remote.group.position.distanceTo(this.player.position);
      if (distance < 3.3 && (!nearest || distance < nearest.distance)) nearest = { name: remote.name, remote, distance };
    }
    return nearest;
  }

  /** Whether MENTOR's current loyalty target is the body this browser moves. */
  private mentorFollowsActiveAvatar(): boolean {
    if (!this.mentorFollower) return false;
    if (this.controlledNpcId) {
      return this.mentorFollower.kind === 'npc' && this.mentorFollower.id === this.controlledNpcId;
    }
    return this.mentorFollower.kind === 'visitor' && this.mentorFollower.id === this.selfVisitorId;
  }

  /**
   * Within reach of the pop-up store's frontage. Measured to the whole counter
   * rather than a point in front of it, so any approach along it works.
   */
  /** Within arm's reach of the jukebox, on any side of it. */
  private nearJukebox(): boolean {
    if (!this.jukebox) return false;
    if (Math.abs(this.player.position.y - AVATAR_GROUND_Y) > 2.6) return false;
    return Math.hypot(
      this.player.position.x - this.jukebox.x,
      this.player.position.z - this.jukebox.z,
    ) < 4.2;
  }

  private nearShopCounter(): boolean {
    if (!this.shopCounter) return false;
    const alongCounter = Math.max(0, Math.abs(this.shopCounter.x - this.player.position.x) - 15);
    const outFromCounter = this.player.position.z - this.shopCounter.z;
    return Math.hypot(alongCounter, outFromCounter) < 4.6;
  }

  /** Within reach of the club's counter, from the room side of it. */
  private nearClubBar(): boolean {
    if (!this.inClubRoom(this.player.position.x, this.player.position.z)) return false;
    const counterZ = clubBounds.roomMinZ + 1.4 + CLUB_BAR_STANDOFF;
    return Math.abs(this.player.position.z - counterZ) < 3.8 &&
      this.player.position.x > -79 && this.player.position.x < -57;
  }

  private nearbyDj(): NpcAvatar | undefined {
    // Both booths are candidates; whichever is in reach wins.
    let nearest: NpcAvatar | undefined;
    let nearestDistance = 6.5;
    for (const npc of this.npcs) {
      if (npc.pose !== 'dj' || !npc.station || npc.id === this.controlledNpcId) continue;
      const distance = npc.group.position.distanceTo(this.player.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = npc;
      }
    }
    return nearest;
  }

  /**
   * Whether the attendee is standing at one of the festival's fixed places — a
   * counter, a booth, a stand, the board. A MENTOR who follows you is in
   * feeding range every second of the day, so without this he stands in front
   * of every one of them and the prompt never changes. The greeting had the
   * same fault and was fixed on its own; this is the rest of the list, so the
   * next one does not have to be reported separately.
   */
  private atAFixedPlace(): boolean {
    return this.nearClubBar()
      || this.nearJukebox()
      || this.nearShopCounter()
      || this.nearbyDj() !== undefined
      || this.player.position.distanceTo(pamphletPosition) < 2.35
      || this.player.position.distanceTo(programmeBoardPosition) < 7.2;
  }

  /** A following MENTOR gives way to whatever you have walked up to. */
  private mentorGivesWay(): boolean {
    return this.mentorFollowsActiveAvatar() && this.atAFixedPlace();
  }

  private nearbyMentor(): NpcAvatar | undefined {
    if (this.carriedItem === 'MENTOR') return undefined;
    const mentor = this.npcs.find((npc) => npc.id === 'MENTOR');
    if (mentor?.id === this.controlledNpcId || this.mentorCarrierId) return undefined;
    if (!mentor?.dogRig || mentor.group.parent !== this.scene) return undefined;
    return mentor.group.getWorldPosition(new THREE.Vector3()).distanceTo(this.player.position) < 3.3 ? mentor : undefined;
  }

  private nearestSeat(): Seat | undefined {
    if (this.playerState === 'swimming') return undefined;
    return this.seats.find((seat) => seat.position.distanceTo(this.player.position) < 1.55);
  }

  private inTheater(): boolean {
    const x = this.player.position.x;
    const z = this.player.position.z;
    if (this.inClub(this.player.position.x, this.player.position.z)) return true;
    if (this.onRooftop(this.player.position.x, this.player.position.z)) return true;
    const inShore = z < -30 && z > -45.2 && Math.abs(x) < 12;
    const inPalace = x < -24 && x > -46 && z < -31 && z > -49.2;
    const inDriveIn = x > 24 && x < 46 && z < -17 && z > -35.2;
    return inShore || inPalace || inDriveIn;
  }

  private screeningVenue(): VenueKey {
    if (this.activeSeat) return this.activeSeat.venue;
    const x = this.player.position.x;
    const z = this.player.position.z;
    if (this.inClub(x, z)) return 'club';
    if (this.onRooftop(x, z)) return 'rooftop';
    if (x < -20 && z < -29 && z > -50) return 'palace';
    if (x > 20 && z < -8 && z > -39) return 'drive-in';
    return 'shore';
  }

  private setOutfit(swimwear: boolean): void {
    this.outfit = swimwear ? 'swimwear' : 'festival';
    this.setAvatarPalette(this.palette);
  }

  private setSwimming(active: boolean): void {
    const wasSwimming = this.playerState === 'swimming';
    if (active && !wasSwimming) {
      this.playerState = 'swimming';
      this.cameraOrbit.follow.pitch = SWIM_CAMERA_PITCH;
      this.cameraOrbit.perspective.pitch = SWIM_CAMERA_PITCH;
      this.setOutfit(true);
      const stowedPopcorn = this.carriedItem === 'POPCORN';
      if (stowedPopcorn) {
        this.stowedItem = 'POPCORN';
        this.carriedItem = undefined;
        this.carriedProp.visible = false;
      }
      this.onAction({ type: 'swim', active: true, stowedPopcorn });
    } else if (!active && wasSwimming) {
      this.playerState = 'walking';
      this.player.position.y = AVATAR_GROUND_Y;
      this.player.rotation.x = 0;
      this.player.rotation.z = 0;
      this.player.visible = !this.controlledNpcId;
      this.player.scale.setScalar(1);
      if (!this.carriedItem && this.stowedItem === 'POPCORN') {
        this.carriedItem = 'POPCORN';
        this.stowedItem = undefined;
      }
      this.syncCarriedPropAnchor();
      if (this.player.position.z > -58.2) this.setOutfit(false);
      this.onAction({ type: 'swim', active: false });
    }
  }

  private standUp(): void {
    const seatPosition = this.activeSeat?.position ?? this.player.position;
    this.player.position.set(seatPosition.x + 1.2, 0, seatPosition.z + 1.6);
    this.player.position.y = this.groundHeightAt(this.player.position.x, this.player.position.z);
    this.activeSeat = undefined;
    this.playerState = 'walking';
    this.cameraMode = this.previousCameraMode;
    this.screeningOrbit.yaw = 0;
    this.screeningOrbit.pitch = 0;
    this.onAction({ type: 'stood' });
  }
}
