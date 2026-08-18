import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import type { VenueKey } from '../data/catalogue';
import { AmbientAudio } from './AmbientAudio';
import { DayNightCycle, type DayNightState } from './DayNightCycle';
import { createStylizedWaterMaterial, tintStylizedWater } from './StylizedWater';
import { createMentorDog, type MentorDogRig } from './MentorDog';

export type GraphicsMode = 'normal' | 'lite';
export type CameraMode = 'follow' | 'perspective' | 'first-person' | 'screening';
export type PlayerState = 'walking' | 'seated' | 'swimming';
export type AvatarGesture = 'wave' | 'feed' | 'tail-wag' | 'dance' | 'drink';
export type CarriedItem = 'POPCORN' | 'MENTOR' | 'DRINK' | 'HOTDOG' | 'PIZZA' | 'CHICKEN';
export const NPC_NAMES = ['MENTOR', 'KENNY', 'NUNO', 'MICHAEL', 'SEBINE', 'ZC', 'LOUI', 'MINYUN', 'VIOLA', 'XIEHGAN', 'DRBEAUTY'] as const;
export type NpcId = string;
export type NpcNames = Record<NpcId, string>;
export interface NpcProfile {
  id: NpcId;
  name: string;
  title: string;
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
  | { type: 'drank'; drinks: number; drunk: boolean };

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
  /** Set for NPCs that hold a post rather than walking a route. */
  station?: { position: THREE.Vector3; rotationY: number };
  pose?: 'dj' | 'dance';
  /** Where this NPC is spending its time, and until when. */
  haunt?: string;
  dwellUntil?: number;
}

interface RemoteAvatar {
  group: THREE.Group;
  badge: THREE.Sprite;
  target: THREE.Vector3;
  targetRotation: number;
  state: PlayerState;
  rig: AvatarRig;
  carriedProp: THREE.Group;
  carriedItem?: CarriedItem;
  moving: boolean;
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
  torso: THREE.Mesh;
  treat: THREE.Mesh;
}

interface WaterReflectionVisual {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  material: THREE.MeshBasicMaterial;
  kind: 'sun' | 'moon';
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
const concessionPosition = new THREE.Vector3(7.8, 0, 8);
const pamphletPosition = new THREE.Vector3(4.2, 0, 8);
// Where the sea meets the sand. Every water plane ends here and every piece of
// beach starts here: overlapping the two put opaque sand and a water surface at
// the same height, and they fought for the same pixels along the whole shore.
const SHORE_Z = -58;
const AVATAR_GROUND_Y = 0.28;
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
// The rooftop venue, east across the street from The Basement. The deck sits
// over the eastern part of the shell; the western bay is the open garage, so
// no column has to carry two walkable floors.
const ROOF_Y = 7;
const ROOF_AVATAR_Y = ROOF_Y + AVATAR_GROUND_Y;
const rooftopBounds = {
  minX: 18,
  maxX: 54,
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
  stairMinX: 13.8,
  stairMaxX: 17.4,
  stairMinZ: 20,
  // Head of the lower flight, then the half-landing, then the upper flight.
  stairLandingMinZ: 25.04,
  stairLandingMaxZ: 28.64,
  stairTopZ: 33.68,
  // The top landing is flush with the deck and doubles as the way through the
  // parapet, so arriving at deck height is a step across, not a climb over.
  stairMaxZ: 36.5,
};
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
  driveIn: [[27, -14], [43, -14], [43, -30], [27, -30]],
  shore: [[-9, -30], [9, -30], [9, -40], [-9, -40]],
  clubFront: [[-16, 30], [-6, 30], [-6, 18], [-16, 18]],
};
const NPC_HAUNT_KEYS = Object.keys(NPC_HAUNTS);
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
    position: [36, ROOF_Y + 6.6, 19.9],
    target: [36, ROOF_Y + 6.3, 19.6],
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

const createTextTexture = (lines: string[], foreground = '#f5efe2', background = '#151517') => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#b51f27';
  context.lineWidth = 18;
  context.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
  context.fillStyle = foreground;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  lines.forEach((line, index) => {
    context.font = index === 0 ? '900 92px sans-serif' : '700 48px sans-serif';
    context.fillText(line, canvas.width / 2, 150 + index * 115);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
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
  private readonly projectorWorldPosition = new THREE.Vector3();
  private readonly projectorNdc = new THREE.Vector3();
  private readonly projectorCorners = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  private readonly cameraDirection = new THREE.Vector3();
  private readonly cameraToProjector = new THREE.Vector3();
  private readonly clock = new THREE.Clock();
  private readonly projectorClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 45.68);
  private playerRig?: AvatarRig;
  private originalPlayerIdleRig?: AvatarRig;
  private programmeBoardMaterial?: THREE.MeshStandardMaterial;
  private readonly venueSignMaterials = new Map<VenueKey, THREE.MeshBasicMaterial>();
  private readonly waterTextures: THREE.CanvasTexture[] = [];
  private readonly waterReflections: WaterReflectionVisual[] = [];
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
  private cameraZoom = 1;

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
  private selfVisitorId?: string;
  private mentorClaimPending = false;
  private mentorReleasePending = false;
  private pickupUntil = 0;
  private lastSnapshotAt = 0;
  private performanceWindowStartedAt = performance.now();
  private performanceFrameCount = 0;
  private adaptiveRenderScale = 1;
  private disposed = false;
  private cameraDragging = false;
  private cameraPointerId?: number;
  private cameraPointerX = 0;
  private cameraPointerY = 0;

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
    this.foregroundRenderer.shadowMap.enabled = false;
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
    this.createEnvironment();
    this.createPlayer(palette);
    this.createNpcCrowd();
    this.createAtmosphere();
    this.scene.traverse((object) => {
      if (object.userData.projectorBackground) object.layers.disable(1);
      else object.layers.enable(1);
    });
    this.player.position.set(0, AVATAR_GROUND_Y, 22);
    this.camera.position.set(0, 5.2, 29);

    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('message', this.projectorMessage);
    this.canvas.addEventListener('pointerdown', this.cameraPointerDown);
    // passive: false because the page must not scroll under the world, and a
    // trackpad pinch arrives as a wheel event the browser would otherwise use
    // to zoom the whole document.
    this.canvas.addEventListener('wheel', this.cameraWheel, { passive: false });
    window.addEventListener('pointermove', this.cameraPointerMove);
    window.addEventListener('pointerup', this.cameraPointerUp);
    window.addEventListener('pointercancel', this.cameraPointerUp);
    window.addEventListener('blur', this.cameraPointerReset);
    window.addEventListener('blur', this.clearRunning);
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
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('message', this.projectorMessage);
    this.canvas.removeEventListener('pointerdown', this.cameraPointerDown);
    this.canvas.removeEventListener('wheel', this.cameraWheel);
    window.removeEventListener('pointermove', this.cameraPointerMove);
    window.removeEventListener('pointerup', this.cameraPointerUp);
    window.removeEventListener('pointercancel', this.cameraPointerUp);
    window.removeEventListener('blur', this.cameraPointerReset);
    window.removeEventListener('blur', this.clearRunning);
    this.renderer.dispose();
    this.foregroundRenderer.dispose();
    for (const projector of this.projectors.values()) projector.element.remove();
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

  /** Deterministic loopback fixture that drops the attendee into the club. */
  /** Loopback fixture that drops the attendee on the rooftop deck. */
  focusRooftopForReview(atDj = false): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const x = atDj ? 36 : 30;
    const z = atDj ? rooftopBounds.deckMinZ + 9 : 30;
    this.player.position.set(x, this.groundHeightAt(x, z), z);
    this.player.rotation.y = 0;
    this.cameraMode = 'follow';
    this.cameraOrbit.follow.yaw = Math.PI;
    this.cameraOrbit.follow.pitch = 0.3;
  }

  /** Loopback fixture standing in the lobby, looking at the stair opening. */
  focusClubLobbyForReview(): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const b = clubBounds;
    const x = b.buildingMaxX - 5;
    const z = (b.stairMinZ + b.stairMaxZ) / 2;
    this.player.position.set(x, this.groundHeightAt(x, z), z);
    this.player.rotation.y = -Math.PI / 2;
    this.cameraMode = 'follow';
    this.cameraOrbit.follow.yaw = Math.PI / 2;
    this.cameraOrbit.follow.pitch = 0.5;
  }

  focusClubForReview(atDj = false): void {
    if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;
    const x = atDj ? -68 : -66;
    const z = atDj ? 18.5 + CLUB_Z : -9 + CLUB_Z;
    this.player.position.set(x, this.groundHeightAt(x, z), z);
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

  setGraphicsMode(mode: GraphicsMode): void {
    this.graphicsMode = mode;
    this.adaptiveRenderScale = 1;
    this.performanceWindowStartedAt = performance.now();
    this.performanceFrameCount = 0;
    if (this.stylizedWater) this.stylizedWater.visible = mode === 'normal';
    this.renderer.shadowMap.enabled = mode === 'normal';
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
      visitor.id === this.mentorCarrierId || Boolean(visitor.npcId));
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
      avatar.target.set(displayVisitor.x, reportedY, displayVisitor.z);
      avatar.targetRotation = displayVisitor.rotation;
      avatar.state = displayVisitor.state;
      avatar.moving = displayVisitor.moving;
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
        avatar.gesture = displayVisitor.gesture;
        avatar.gestureUntil = performance.now() + 900;
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
    playlistIds: string[] = [],
    reloadToken = '',
  ): void {
    const projector = this.projectors.get(venue);
    if (!projector) return;
    if (venue !== this.activeProjectorVenue()) {
      this.releaseProjector(venue);
      return;
    }
    const signature = `${film.id}|${playlistIds.join(',')}|${reloadToken}`;
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
    const playlist = playlistIds.filter(Boolean);
    if (playlist.length) {
      playerUrl.searchParams.set('playlist', playlist.join(','));
      playerUrl.searchParams.set('loop', '1');
    }
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

  setPublicScreenPaused(venue: VenueKey, paused: boolean): void {
    const projector = this.projectors.get(venue);
    projector?.iframe?.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func: paused ? 'pauseVideo' : 'playVideo',
      args: [],
    }), '*');
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
    this.programmeBoardMaterial.emissiveMap = texture;
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
      rooftop: new THREE.Vector3(36, AVATAR_GROUND_Y, 4),
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

    const mentor = this.nearbyMentor();
    if (mentor) {
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
      const now = performance.now();
      const gesture: 'wave' | 'tail-wag' = this.controlledNpcId === 'MENTOR' ? 'tail-wag' : 'wave';
      this.playerGesture = gesture;
      this.playerGestureUntil = now + 1_400;
      if (socialTarget.npc) {
        socialTarget.npc.gesture = socialTarget.npc.id === 'MENTOR' ? 'tail-wag' : 'wave';
        socialTarget.npc.gestureUntil = now + 1_600;
      }
      if (socialTarget.remote) {
        socialTarget.remote.gesture = 'wave';
        socialTarget.remote.gestureUntil = now + 1_600;
      }
      const targetPosition = socialTarget.npc?.group.position ?? socialTarget.remote?.group.position;
      if (targetPosition) {
        this.player.rotation.set(0, Math.atan2(
          targetPosition.x - this.player.position.x,
          targetPosition.z - this.player.position.z,
        ), 0);
      }
      this.onAction({ type: 'greet', target: socialTarget.name, gesture });
      return;
    }

    if (this.player.position.distanceTo(new THREE.Vector3(0, 0, -3)) < 7.2) {
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

  private readonly resize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = width / Math.max(height, 1);
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
      this.toggleDancing();
    }
    if (key === 't' && !event.repeat) this.toggleCameraMode();
    if (key === 'e' && !event.repeat) this.interact(event.shiftKey);
  };

  private readonly keyUp = (event: KeyboardEvent): void => {
    this.running = event.shiftKey;
    this.keys.delete(event.key.toLowerCase());
  };

  private readonly cameraPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    event.preventDefault();
    this.cameraDragging = true;
    this.cameraPointerId = event.pointerId;
    this.cameraPointerX = event.clientX;
    this.cameraPointerY = event.clientY;
    this.canvas.classList.add('is-camera-dragging');
    this.canvas.setPointerCapture?.(event.pointerId);
  };

  private readonly cameraPointerMove = (event: PointerEvent): void => {
    if (!this.cameraDragging || event.pointerType !== 'mouse' || event.pointerId !== this.cameraPointerId) return;
    if ((event.buttons & 1) === 0) {
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
    const lowestPitch = this.playerState === 'seated' ? -0.42 : 0.12;
    orbit.pitch = this.cameraMode === 'first-person'
      ? THREE.MathUtils.clamp(orbit.pitch + deltaY * 0.0035, -0.85, 0.95)
      : THREE.MathUtils.clamp(orbit.pitch + deltaY * 0.0035, lowestPitch, 1.08);
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
    this.cameraZoom = THREE.MathUtils.clamp(this.cameraZoom * Math.exp(step), 0.45, 2.2);
  };

  private readonly cameraPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.cameraPointerId) return;
    this.cameraPointerReset();
  };

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
    return Math.min(window.devicePixelRatio, this.graphicsMode === 'normal' ? 0.78 : 0.45);
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
    for (const corner of this.projectorCorners) {
      corner.project(this.camera);
      const pixelX = (corner.x * 0.5 + 0.5) * viewportWidth;
      const pixelY = (corner.y * 0.5 + 0.5) * viewportHeight;
      minX = Math.min(minX, pixelX);
      minY = Math.min(minY, pixelY);
      maxX = Math.max(maxX, pixelX);
      maxY = Math.max(maxY, pixelY);
    }
    const padding = 8;
    const left = Math.max(0, Math.floor(minX - padding));
    const bottom = Math.max(0, Math.floor(minY - padding));
    const right = Math.min(viewportWidth, Math.ceil(maxX + padding));
    const top = Math.min(viewportHeight, Math.ceil(maxY + padding));
    if (right <= left || top <= bottom) return undefined;
    return { x: left, y: bottom, width: right - left, height: top - bottom };
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
  ): void {
    this.colliders.push({
      label,
      minX: x - width / 2 - padding,
      maxX: x + width / 2 + padding,
      minZ: z - depth / 2 - padding,
      maxZ: z + depth / 2 + padding,
      minY: heights?.minY,
      maxY: heights?.maxY,
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
      [c.buildingMaxX, 92, -49, 81],
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
    const gateSign = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 4.2),
      new THREE.MeshBasicMaterial({ map: createTextTexture(['MYSCHEDULE', 'VIRTUAL FESTIVAL']) }),
    );
    gateSign.position.set(0, 8.6, GATE_Z - 0.65);
    this.scene.add(gateSign);

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
    this.createShoreScreen();
    this.createPalace();
    this.createDriveIn();
    this.createClub();
    this.createRooftop();
    this.createConcession();
    this.createPamphletStand();

    const buildingMat = material(0x26262a);
    for (const side of [-1, 1]) {
      const x = side < 0 ? -99 : 60;
      this.mesh([8, 15, 27], [x, 7.5, 4], buildingMat);
      this.mesh([7.2, 1.2, 0.3], [x, 10.2, 17.65], material(0xa31820));
      this.addCollider(x, 4, 8, 27, 0.2, { minY: -0.4, maxY: 40 });
    }

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

  private createProgrammeBoard(): void {
    const boardTexture = createProgrammeTexture(
      'THE SHORE',
      'PUBLIC PROGRAMME',
      'MUSIC VIDEO · LIVE LOOP',
      'ROTATING FESTIVAL TIMETABLE',
    );
    this.programmeBoardMaterial = new THREE.MeshStandardMaterial({
      map: boardTexture,
      emissive: 0xffffff,
      emissiveMap: boardTexture,
      emissiveIntensity: 0.08,
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(12.5, 6.1, 0.45), this.programmeBoardMaterial);
    board.position.set(0, 3.6, -3);
    board.castShadow = true;
    this.scene.add(board);
    this.mesh([0.6, 3.2, 0.6], [-5.3, 1.5, -3], material(0x17171a));
    this.mesh([0.6, 3.2, 0.6], [5.3, 1.5, -3], material(0x17171a));
    this.addCollider(0, -3, 12.5, 1.2);
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
        this.addCollider(x, z, 1.12, 1.15, 0.08);
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
        this.addCollider(x, z, 1.32, 1.25, 0.08);
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
        this.addCollider(x, z, 4.35, 2.55, 0.08);
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
      this.mesh([stairRun / steps + 0.06, 0.4, stairWidth], [x, -progress * -floor - 0.2, (b.stairMinZ + b.stairMaxZ) / 2], darkConcrete);
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
    this.addCollider(stageX, stageZ - 1.6, 5.7, 1.9, 0.12, belowGround, 'club-booth');
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

    // Light rig over the floor.
    for (let index = 0; index < 8; index += 1) {
      const x = -84 + index * 4.8;
      const light = this.mesh(
        [1.6, 0.36, 1.6],
        [x, floor + CLUB_ROOM_HEIGHT - 1.2, 2 + CLUB_Z],
        new THREE.MeshBasicMaterial({ color: clubLightColors[index % clubLightColors.length] }),
      );
      this.clubLights.push(light);
      // Every other fixture in the overhead row carries a real lamp, so the
      // rig lights the floor instead of only glowing at itself.
      if (index % 2 === 0) {
        const beam = new THREE.SpotLight(clubLightColors[index % clubLightColors.length], 0, 34, Math.PI * 0.3, 0.7, 1.3);
        beam.position.set(x, floor + CLUB_ROOM_HEIGHT - 1.4, 2 + CLUB_Z);
        beam.target.position.set(x, floor, 2 + CLUB_Z);
        this.scene.add(beam, beam.target);
        this.clubBeatLights.push(beam);
      }
    }
    for (let index = 0; index < 5; index += 1) {
      const z = b.roomMinZ + 4 + index * 6.5;
      for (const side of [-1, 1]) {
        // The east wall is cut away for the stairs; a fixture there would hang
        // in open air with nothing behind it.
        if (side > 0 && z > b.stairMinZ - 2 && z < b.stairMaxZ + 2) continue;
        const light = this.mesh(
          [0.36, 1.2, 1.2],
          [side < 0 ? b.roomMinX + 0.6 : b.roomMaxX - 0.6, floor + CLUB_ROOM_HEIGHT - 5, z],
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
    deck.userData.projectorBackground = true;
    // East parapet runs the whole depth. The west one is cut open across the
    // stair's top landing: that gap is the door onto the deck, and the reason
    // arriving at the head of the stair no longer walks into a wall.
    this.mesh([0.6, 1.5, deckDepth], [r.maxX + 0.3, ROOF_Y + 0.75, deckCenterZ], warmConcrete);
    this.addCollider(r.maxX + 0.3, deckCenterZ, 0.6, deckDepth, 0.16, onDeck);
    // Between stairMinZ and stairTopZ the stair's own stringer wall stands in
    // the parapet's place and is built with the run.
    for (const [from, to] of [
      [r.deckMinZ, r.stairMinZ],
      [r.stairMaxZ, r.maxZ],
    ] as Array<[number, number]>) {
      const span = to - from;
      if (span <= 0) continue;
      this.mesh([0.6, 1.5, span], [r.minX - 0.3, ROOF_Y + 0.75, (from + to) / 2], warmConcrete);
      this.addCollider(r.minX - 0.3, (from + to) / 2, 0.6, span, 0.16, onDeck);
    }
    this.mesh([width + 1.2, 1.5, 0.6], [centerX, ROOF_Y + 0.75, r.maxZ + 0.3], warmConcrete);
    this.addCollider(centerX, r.maxZ + 0.3, width + 1.2, 0.6, 0.16, onDeck);
    this.mesh([width + 1.2, 1.5, 0.6], [centerX, ROOF_Y + 0.75, r.deckMinZ - 0.3], warmConcrete);
    this.addCollider(centerX, r.deckMinZ - 0.3, width + 1.2, 0.6, 0.16, onDeck);

    // Screen at the deck's south edge, back to the Drive-In, watched northward.
    this.createProjectorSurface('rooftop');
    this.mesh([15, 8, 0.4], [centerX, ROOF_Y + 6.6, r.deckMinZ + 0.6], material(0x050506, 0.72));
    const boothZ = r.deckMinZ + 4.4;
    this.mesh([10, 0.7, 3.6], [centerX, ROOF_Y + 0.35, boothZ], material(0x3d2a24, 0.6, 0.3));
    this.mesh([4.6, 1.2, 1.5], [centerX, ROOF_Y + 1.3, boothZ + 0.8], material(0x2b2b33, 0.5, 0.4));
    this.mesh([4.9, 0.16, 1.8], [centerX, ROOF_Y + 1.95, boothZ + 0.8], material(0x3a3a44, 0.4, 0.5));
    // The booth is furniture, not scenery: the plinth carries the decks and an
    // attendee has to walk round it rather than through the DJ.
    this.addCollider(centerX, boothZ, 10, 3.6, 0.12, onDeck, 'rooftop-booth');
    for (const side of [-1, 1]) {
      this.mesh([1.1, 0.12, 1.1], [centerX + side * 1.35, ROOF_Y + 2.06, boothZ + 0.8], material(0x0d0d10, 0.35, 0.55));
      this.mesh([2, 2.4, 1.8], [centerX + side * 7.4, ROOF_Y + 1.2, boothZ], material(0x241d1a, 0.7, 0.2));
      this.addCollider(centerX + side * 7.4, boothZ, 2, 1.8, 0.12, onDeck, 'rooftop-speaker');
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
      this.addCollider(x, z, 2.4, 2, 0.1, onDeck, 'rooftop-bench');
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
      landingWidth, 0.5, 0.16, { minY: ROOF_Y - 1, maxY: 60 },
    );

    // The kerb and rail hold the open side for the whole climb; the building
    // face holds the other. Between them the run has no way off it.
    const runCenterZ = (r.stairMinZ + r.stairMaxZ) / 2;
    const runDepth = r.stairMaxZ - r.stairMinZ;
    this.addCollider(railX, runCenterZ, kerbWidth, runDepth, 0.16, { minY: -0.4, maxY: 60 });
    // Stringer wall between the flights and the shell, stopping short of the
    // top landing so the last step opens straight onto the deck.
    const stringerDepth = r.stairTopZ - r.stairMinZ;
    const stringerHeight = ROOF_Y + 1.5;
    this.mesh(
      [r.minX - r.stairMaxX, stringerHeight, stringerDepth],
      [(r.stairMaxX + r.minX) / 2, stringerHeight / 2, r.stairMinZ + stringerDepth / 2],
      treadMaterial,
    );
    this.addCollider(
      (r.stairMaxX + r.minX) / 2, r.stairMinZ + stringerDepth / 2,
      r.minX - r.stairMaxX, stringerDepth, 0.16, { minY: -0.4, maxY: 60 },
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
    this.addCollider(concessionPosition.x, concessionPosition.z, 3.4, 2.8, 0.15);
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
    this.addCollider(pamphletPosition.x, pamphletPosition.z, 2.2, 1.35, 0.12);
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
    const count = this.graphicsMode === 'normal' ? DEFAULT_NPC_PROFILES.length : 5;
    DEFAULT_NPC_PROFILES.slice(0, count).forEach((profile, index) => this.createNpcAvatar(profile, index));
    this.stationDj();
    this.stationRooftopDj();
    this.stationClubRegulars();
  }

  /** DR.BEAUTY holds the rooftop booth. */
  private stationRooftopDj(): void {
    const dj = this.npcs.find((npc) => npc.id === 'DRBEAUTY');
    if (!dj) return;
    const position = new THREE.Vector3(36, ROOF_AVATAR_Y, rooftopBounds.deckMinZ + 2.6);
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
  private stationClubRegulars(): void {
    // Kept north of the bar: the counter and its stools reach to about z = 9,
    // and a regular standing in that band reads as wedged into a seat.
    const spots: Array<[string, number, number]> = [
      ['SEBINE', -78, 5 + CLUB_Z],
      ['ZC', -58, 2 + CLUB_Z],
      ['LOUI', -68, -1 + CLUB_Z],
      ['VIOLA', -54, 9 + CLUB_Z],
    ];
    for (const [id, x, z] of spots) {
      const npc = this.npcs.find((candidate) => candidate.id === id && !candidate.dogRig);
      if (!npc) continue;
      const position = new THREE.Vector3(x, CLUB_AVATAR_Y, z);
      npc.station = { position, rotationY: Math.atan2(-68 - x, 22.5 + CLUB_Z - z) };
      npc.pose = 'dance';
      npc.route = [position.clone()];
      npc.waypointIndex = 0;
      npc.group.position.copy(position);
      npc.group.rotation.y = npc.station.rotationY;
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
    const routes: Array<Array<[number, number]>> = [
      [[-9, 15], [9, 15], [9, 6], [-9, 6]],
      [[9, 11], [-9, 11], [-9, 2], [9, 2]],
      [[-10, 0], [10, 0], [10, -9], [-10, -9]],
      [[-8, -17], [8, -17], [8, -27], [-8, -27]],
      [[-10, -30], [10, -30], [10, -40], [-10, -40]],
      [[-17, -12], [-28, -14], [-35, -18], [-35, -26], [-27, -17]],
      [[17, -12], [22, -12], [22, -32], [18, -21]],
      [[-43, -25], [-35, -27], [-27, -22], [-35, -17]],
      [[0, -20], [-8, -30], [0, -39], [8, -30]],
      [[-4, 19], [4, 19], [8, 11], [-8, 11]],
    ];
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
    const routeTemplate = routes[index % routes.length];
    const routeCycle = Math.floor(index / routes.length);
    const offsetX = routeCycle === 0 ? 0 : ((routeCycle % 3) - 1) * 2.4;
    const offsetZ = routeCycle === 0 ? 0 : -Math.floor((routeCycle + 1) / 3) * 2.4;
    const route = routeTemplate.map(([x, z]) => new THREE.Vector3(x + offsetX, AVATAR_GROUND_Y, z + offsetZ));
    npc.position.copy(route[0]);
    this.scene.add(npc);
    const avatar: NpcAvatar = {
      id: profile.id,
      name: profile.name,
      group: npc,
      badge,
      rig,
      dogRig,
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
      haunt: NPC_HAUNT_KEYS[index % NPC_HAUNT_KEYS.length],
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
    mentor.waypointIndex = this.nearestRouteIndex(mentor, dropPosition);
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
  private shuffleNpcHaunt(npc: NpcAvatar, now: number): void {
    if (npc.station || !npc.dwellUntil || now < npc.dwellUntil) return;
    const choices = NPC_HAUNT_KEYS.filter((key) => key !== npc.haunt);
    const next = choices[Math.floor(Math.random() * choices.length)] ?? npc.haunt;
    if (!next) return;
    npc.haunt = next;
    npc.dwellUntil = now + NPC_DWELL_MIN_MS + Math.random() * NPC_DWELL_SPREAD_MS;
    npc.route = NPC_HAUNTS[next].map(([x, z]) => new THREE.Vector3(x, AVATAR_GROUND_Y, z));
    // Head for whichever end of the new loop is closest, so the walk across
    // the festival looks deliberate rather than doubling back.
    npc.waypointIndex = this.nearestRouteIndex(npc, npc.group.position);
    npc.waitUntil = now;
    npc.stuckFor = 0;
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
    group.position.set(visitor.x, visitor.state === 'swimming' ? AVATAR_SWIM_Y : AVATAR_GROUND_Y, visitor.z);
    group.rotation.y = visitor.rotation;
    group.userData.remoteVisitor = true;
    group.traverse((child) => child.layers.enable(1));
    this.scene.add(group);
    return {
      group,
      badge,
      target: group.position.clone(),
      targetRotation: visitor.rotation,
      state: visitor.state,
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

  private createAvatarRig(parent: THREE.Group, palette: AvatarPalette, markPalette = false): AvatarRig {
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
      return part;
    };
    const torso = addPart([1.02, 1.38, 0.62], [0, 1.78, 0], 'top');
    addPart([0.8, 0.82, 0.72], [0, 2.85, 0], 'skin');
    addPart([0.9, 0.34, 0.79], [0, 3.2, -0.02], 'hair');
    addPart([0.78, 0.4, 0.16], [0, 2.98, 0.34], 'hair');
    this.mesh([0.09, 0.1, 0.05], [-0.18, 2.84, 0.385], material(0x171315), parent);
    this.mesh([0.09, 0.1, 0.05], [0.18, 2.84, 0.385], material(0x171315), parent);
    this.mesh([0.24, 0.055, 0.05], [0, 2.64, 0.385], material(0x6f2e2b), parent);

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
    return { leftArm, rightArm, leftLeg, rightLeg, torso, treat };
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
    const dayNight = this.dayNight.update();
    this.updateWaterReflections(elapsed);
    this.updateStylizedWater(elapsed);
    this.updateWaterLayers();
    this.updateClubBeat(elapsed);
    this.updateLampPool();
    this.camera.layers.set(0);
    this.renderer.render(this.scene, this.camera);
    const visibleProjectors: VenueKey[] = [];
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
      const visible = roomMatches &&
        (this.player.position.z - screen.position[2]) * screen.facing >= -0.02 &&
        screenIsInFront && screenTouchesViewport;
      projector.element.style.visibility = visible ? 'visible' : 'hidden';
      if (visible) visibleProjectors.push(venue);
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
        const scissor = this.projectorScissor(venue);
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
        this.animateRig(this.playerRig, this.clock.elapsedTime * 1.2, 0.018);
        this.poseRigSeated(this.playerRig);
      }
      return;
    }
    const horizontal = Number(this.keys.has('d') || this.keys.has('arrowright')) -
      Number(this.keys.has('a') || this.keys.has('arrowleft'));
    const vertical = Number(this.keys.has('s') || this.keys.has('arrowdown')) -
      Number(this.keys.has('w') || this.keys.has('arrowup'));
    this.moveVector.set(horizontal, 0, vertical);
    if (this.moveVector.lengthSq() > 0) {
      this.dancing = false;
      const running = this.running && !this.dancing;
      const speed = this.playerState === 'swimming'
        ? (running ? 6.2 : 4.1)
        : (running ? 12.4 : 7.2);
      this.movePlayer(horizontal, vertical, speed * delta);
    }

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
      this.player.position.y = this.groundHeightAt(this.player.position.x, this.player.position.z);
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
      this.animateRig(this.playerRig, this.clock.elapsedTime * cadence, stride, gesture);
      if (running && this.playerState !== 'swimming') {
        // Leaning into the run, and the arms driving rather than swinging.
        this.playerRig.torso.rotation.x = 0.16;
        this.playerRig.leftArm.rotation.x *= 1.25;
        this.playerRig.rightArm.rotation.x *= 1.25;
      } else if (this.playerState !== 'swimming') {
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
    if (z > -12 && z < 50) max = rooftopBounds.maxX + 4;
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
    const previous = this.player.position.clone();
    const nextX = this.player.position.x + this.moveVector.x;
    const nextZ = this.player.position.z + this.moveVector.z;
    // A step has to be clear at the height being left as well as the height
    // being arrived at. Testing only the destination let an attendee walk out
    // through the club's underground walls: one pace past the room, the ground
    // height is the surface again, so the wall's own height band no longer
    // matched and the collider was skipped.
    const blocked = (x: number, z: number): boolean =>
      this.staticCollides(x, z, this.groundHeightAt(x, z)) ||
      this.staticCollides(x, z, this.player.position.y);
    if (!blocked(nextX, this.player.position.z)) {
      this.player.position.x = nextX;
    }
    if (!blocked(this.player.position.x, nextZ)) {
      this.player.position.z = nextZ;
    }
    const reach = this.walkableXRange(this.player.position.z);
    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, reach.min, reach.max);
    this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -75, GATE_Z - 2);
    this.resolvePlayerCrowdCollisions(previous);
    this.player.rotation.y = Math.atan2(this.moveVector.x, this.moveVector.z);
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
          );
          if (this.playerState === 'swimming' && moving && !gesture) this.poseRigSwimming(npc.rig, elapsed);
          if (this.playerState === 'seated') this.poseRigSeated(npc.rig);
          if (now < this.pickupUntil) npc.rig.leftArm.rotation.x = -1.15;
        }
        if (npc.dogRig) {
          this.animateMentorDog(
            npc.dogRig,
            moving ? elapsed * 8.5 : elapsed * 1.4,
            moving,
            gesture === 'tail-wag',
            now < npc.eatUntil,
          );
          if (this.playerState === 'swimming') this.poseMentorDogSwimming(npc.dogRig, elapsed, moving);
          if (this.playerState === 'seated') this.poseMentorDogSeated(npc.dogRig);
        }
        continue;
      }
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
          );
          if (remoteController.state === 'swimming' && moving && !gesture) this.poseRigSwimming(npc.rig, elapsed);
          if (remoteController.state === 'seated') this.poseRigSeated(npc.rig);
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
          this.animateRig(npc.rig, elapsed * 2.2, 0.03, stationGesture);
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
      this.shuffleNpcHaunt(npc, now);
      const target = npc.route[npc.waypointIndex];
      const direction = target.clone().sub(npc.group.position);
      direction.y = 0;
      const moving = now >= npc.waitUntil && direction.lengthSq() > 0.05;
      if (moving) {
        const step = Math.min(direction.length(), npc.speed * delta);
        direction.normalize();
        const next = npc.group.position.clone().addScaledVector(direction, step);
        if (!this.npcCollides(npc, next.x, next.z)) {
          npc.group.position.x = next.x;
          npc.group.position.z = next.z;
          npc.group.rotation.y = Math.atan2(direction.x, direction.z);
          npc.stuckFor = 0;
        } else if (!this.staticCollides(next.x, next.z, npc.group.position.y)) {
          // Let another attendee clear the path before resuming the route.
          npc.waitUntil = now + 320 + ((npc.phase * 100) % 260);
          npc.stuckFor += delta;
        } else {
          npc.waypointIndex = (npc.waypointIndex + 1) % npc.route.length;
          npc.stuckFor += delta;
        }
      } else if (direction.lengthSq() <= 0.05) {
        npc.waypointIndex = (npc.waypointIndex + 1) % npc.route.length;
        npc.waitUntil = now + 900 + ((npc.phase * 1000) % 1800);
        npc.stuckFor = 0;
      }
      if (npc.stuckFor > 1.6 || this.staticCollides(npc.group.position.x, npc.group.position.z, npc.group.position.y)) {
        const safeIndex = npc.route.findIndex((point) => !this.staticCollides(point.x, point.z, npc.group.position.y));
        if (safeIndex >= 0) {
          npc.group.position.copy(npc.route[safeIndex]);
          npc.waypointIndex = (safeIndex + 1) % npc.route.length;
        }
        npc.stuckFor = 0;
        npc.waitUntil = now + 240;
      }
      npc.group.position.y = AVATAR_GROUND_Y + Math.sin(elapsed * 1.35 + npc.phase) * 0.018;
      const gesture = now < npc.gestureUntil ? npc.gesture : undefined;
      if (npc.rig) this.animateRig(npc.rig, elapsed * 7.4 + npc.phase, moving ? 0.62 : 0.03, gesture);
      if (npc.dogRig) this.animateMentorDog(
        npc.dogRig,
        elapsed * 7.4 + npc.phase,
        moving,
        gesture === 'tail-wag',
        now < npc.eatUntil,
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
    const smoothing = 1 - Math.exp(-delta * 8);
    for (const avatar of this.remoteAvatars.values()) {
      const positionError = avatar.target.distanceTo(avatar.group.position);
      // Easing looks right for walking and wrong for everything else. Taking a
      // seat, going down to the basement, coming up to the deck: those move an
      // attendee further than they could walk between updates, and easing sent
      // the body gliding through the scenery to catch up, which is most of what
      // reads as another visitor being in the wrong place.
      if (positionError > 6) avatar.group.position.copy(avatar.target);
      else avatar.group.position.lerp(avatar.target, smoothing);
      const rotationDelta = Math.atan2(
        Math.sin(avatar.targetRotation - avatar.group.rotation.y),
        Math.cos(avatar.targetRotation - avatar.group.rotation.y),
      );
      avatar.group.rotation.y += rotationDelta * smoothing;
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
      );
      if (avatar.state === 'swimming' && moving && !gesture) this.poseRigSwimming(avatar.rig, elapsed);
      if (avatar.state === 'seated') this.poseRigSeated(avatar.rig);
      avatar.carriedProp.visible = avatar.state !== 'swimming' && avatar.carriedItem === 'POPCORN';
      const distance = avatar.group.position.distanceTo(this.player.position);
      avatar.badge.visible = distance < 12;
    }
  }

  private animateRig(rig: AvatarRig, phase: number, stride: number, gesture?: AvatarGesture): void {
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
    rig.treat.visible = gesture === 'feed';
    if (gesture === 'wave') {
      // Raise the arm away from the head, then wave front-to-back from the
      // shoulder. The previous inward rotation intersected the face.
      rig.rightArm.rotation.z = 2.08 + Math.sin(phase * 2.2) * 0.1;
      rig.rightArm.rotation.x = -0.15 + Math.sin(phase * 2.2) * 0.07;
    } else if (gesture === 'feed') {
      // Reach forward with a visible bite-sized treat at hand level.
      rig.rightArm.rotation.x = -1.18 + Math.sin(phase * 1.7) * 0.06;
      rig.rightArm.rotation.z = -0.1;
    } else if (gesture === 'dance') {
      this.poseRigDance(rig);
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

  private poseRigSeated(rig: AvatarRig): void {
    rig.leftLeg.rotation.x = -1.28;
    rig.rightLeg.rotation.x = -1.28;
    rig.leftArm.rotation.x = -0.12;
    rig.rightArm.rotation.x = -0.12;
    rig.leftArm.rotation.z = 0;
    rig.rightArm.rotation.z = 0;
    rig.torso.rotation.z = 0;
  }

  private poseRigSwimming(rig: AvatarRig, elapsed: number): void {
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

  private animateMentorDog(rig: MentorDogRig, phase: number, moving: boolean, greeting: boolean, eating: boolean): void {
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
    // MENTOR greets only with his tail; the front legs remain a dog walk/idle
    // rather than mimicking the human wave pose.
    rig.rightFrontLeg.rotation.z = 0;
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

  private groundHeightAt(x: number, z: number): number {
    const r = rooftopBounds;
    if (x > r.minX && x < r.maxX && z >= r.deckMinZ && z < r.maxZ) return ROOF_AVATAR_Y;
    const stair = this.rooftopStairHeight(x, z);
    if (stair !== undefined) return stair;
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

  private npcCollides(npc: NpcAvatar, x: number, z: number): boolean {
    if (this.staticCollides(x, z, npc.group.position.y)) return true;
    const radiusSq = 1.05 * 1.05;
    const playerDx = this.player.position.x - x;
    const playerDz = this.player.position.z - z;
    if (playerDx * playerDx + playerDz * playerDz < radiusSq) return true;
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

  private resolvePlayerCrowdCollisions(previous: THREE.Vector3): void {
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
      if (yieldNpc) {
        const npcX = position.x - nx * overlap;
        const npcZ = position.z - nz * overlap;
        if (!this.staticCollides(npcX, npcZ, yieldNpc.group.position.y)) {
          yieldNpc.group.position.x = npcX;
          yieldNpc.group.position.z = npcZ;
          yieldNpc.waitUntil = performance.now() + 360;
          return;
        }
      }

      const playerX = this.player.position.x + nx * overlap;
      const playerZ = this.player.position.z + nz * overlap;
      if (!this.staticCollides(playerX, playerZ)) {
        this.player.position.x = playerX;
        this.player.position.z = playerZ;
      } else {
        this.player.position.x = previous.x;
        this.player.position.z = previous.z;
      }
    };

    for (const npc of this.npcs) {
      if (npc.id === this.controlledNpcId) continue;
      if (npc.id === 'MENTOR' && (this.carriedItem === 'MENTOR' || Boolean(this.mentorCarrierId))) continue;
      separate(npc.group.position, npc);
    }
    for (const avatar of this.remoteAvatars.values()) separate(avatar.group.position);
  }

  private updateCamera(delta: number, _elapsed: number): void {
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
    const smoothing = 1 - Math.exp(-delta * 5.2);
    this.camera.position.lerp(cameraTarget, smoothing);
    this.camera.lookAt(this.lookTarget);
    this.applyDrunkenView(delta);
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
      if (Math.abs(this.camera.fov - 58) > 0.01) {
        this.camera.fov += (58 - this.camera.fov) * 0.12;
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    this.drunkPhase += delta * 1.6;
    // A gentle list rather than a capsize. Roll is added on top of the
    // orientation lookAt produced, never used to overwrite it.
    this.camera.rotation.z += Math.sin(this.drunkPhase) * 0.045 * amount;
    this.camera.position.x += Math.sin(this.drunkPhase * 0.8) * 0.12 * amount;
    this.camera.fov += ((58 + amount * 3.5) - this.camera.fov) * 0.06;
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

  private interactionLabel(): string | undefined {
    if (this.playerState === 'seated') {
      if (this.carriedItem === 'DRINK') return 'SHIFT+E / DRINK UP';
      if (this.nearClubBar()) return 'E / ORDER A DRINK';
      return 'E / STAND UP — private viewing pauses if active';
    }
    // A seat within reach outranks putting MENTOR down, so the prompt has to
    // offer the seat as well. MENTOR stays on the attendee's head once seated.
    const seat = this.nearestSeat();
    if (seat) {
      if (this.occupiedSeats.has(seat.id)) return `${seat.id} · OCCUPIED`;
      return this.carriedItem === 'MENTOR' ? `E TO SIT · ${seat.id}` : `E / TAKE SEAT ${seat.id}`;
    }
    if (this.carriedItem === 'MENTOR') return 'E / PUT MENTOR DOWN';
    if (this.player.position.distanceTo(concessionPosition) < 2.5) {
      return this.carriedItem ? 'POPCORN COLLECTED' : 'E / TAKE POPCORN';
    }
    if (this.nearbyMentor()) {
      return this.carriedItem === 'POPCORN'
        ? 'E / GIVE MENTOR A TREAT · SHIFT+E / PICK UP (POPCORN WILL BE LOST)'
        : 'E / GIVE MENTOR A TREAT · SHIFT+E / PICK UP';
    }
    if (this.carriedItem === 'DRINK') return 'SHIFT+E / DRINK UP';
    if (this.nearClubBar()) return 'E / ORDER A DRINK';
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
    if (this.playerState === 'swimming') return 'SWIMMING · E / GREET WHEN AN ATTENDEE IS NEARBY';
    if (this.player.position.z < -45) return 'SWIMWEAR ON · ENTER WATER';
    if (this.player.position.distanceTo(new THREE.Vector3(0, 0, -3)) < 7.2) return 'E / OPEN ROTATING PROGRAMME';
    return undefined;
  }

  private canInteract(): boolean {
    const seat = this.nearestSeat();
    return this.playerState === 'seated' || this.carriedItem === 'MENTOR' || this.nearbyMentor() !== undefined ||
      this.carriedItem === 'DRINK' || this.nearClubBar() || this.nearShopCounter() ||
      this.nearbyDj() !== undefined ||
      (seat !== undefined && !this.occupiedSeats.has(seat.id)) ||
      this.nearestSocialTarget() !== undefined ||
      this.player.position.distanceTo(new THREE.Vector3(0, 0, -3)) < 7.2 ||
      this.player.position.distanceTo(pamphletPosition) < 2.35 ||
      (!this.carriedItem && this.player.position.distanceTo(concessionPosition) < 2.5);
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

  /**
   * Within reach of the pop-up store's frontage. Measured to the whole counter
   * rather than a point in front of it, so any approach along it works.
   */
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
