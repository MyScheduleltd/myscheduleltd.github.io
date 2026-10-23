import * as THREE from 'three';
import { programUniforms } from './PlanetCurve';

/**
 * Indoors in the isometric view the attendee is seen through a lens (owner,
 * 2026-10-23): a soft-edged circle round them inside which the roof, and the
 * walls on the camera's side of the room, are cut away, while the building
 * outside the circle is drawn whole. The roof is cut just under each room's
 * own ceiling, so what hangs or stands in the room (the temple's lanterns, the
 * Palace's screen) stays whole.
 *
 * It replaces pulling the camera in front of the near wall. That put the near
 * plane inside the building, which sliced the ground away with the wall and
 * showed the empty sky under the pop-up shop, and cut the deck above it into
 * a slab across the attendee's feet.
 *
 * Done in the shader every world material already runs, the clip test, so it
 * costs no extra pass: three uniforms, shared by every program the way the
 * planet's bend is, and one test per pixel that returns at once while the lens
 * is closed. The edge fades with a fixed screen-space dither rather than with
 * transparency, which would need the roof drawn twice. Shadow maps compile
 * without clipping, so the room stays in the shade of the roof it no longer
 * shows. Needs the planet curve's per-program uniforms; on the flat map the
 * lens stays closed.
 */
export const CUTAWAY_LENS = Object.freeze({
  /** Radius as a share of the view's shorter side: the owner's "large". */
  radius: .445,
  /** The outer share of the radius over which the cut fades out. */
  feather: .3,
  /**
   * Out of doors, on the temple's approach stairs, the cut is this far over
   * the feet: over a 3.46-unit avatar's head and a resident's name card and
   * NPC ticket, which reach about 4.1.
   */
  overhead: 4.6,
  /** The near walls are cut down to this far above the floor or the ground outside, whichever is higher. */
  sill: .3,
  /** Where a near wall starts, measured in from the room's edge: its thickness and a little. */
  wall: 1.2,
  /** How fast the lens opens on the way in and closes on the way out. */
  rate: 9,
  /** The lens is centred this far above the attendee's feet, mid-body. */
  centre: 1.7,
});

/**
 * Where the attendee is: its footprint, the floor under them, and the height
 * the roof is cut at. `nearWalls` false is open ground with a building on the
 * camera's side, where only the overhead cut applies.
 */
export interface CutawayRoom { minX: number; maxX: number; minZ: number; maxZ: number; floor: number; ceiling: number; nearWalls?: boolean;
  /** The highest ground on the camera's side, near the attendee: the near walls are never cut below it. */
  ground?: number }

/** The orthographic box the lens is measured against. */
export type CutawayCamera = THREE.Camera & { left: number; right: number; top: number; bottom: number };

export const cutawayUniforms = {
  /** View space to world, to test a pixel's height and side of the room. */
  cutawayToWorld: { value: new THREE.Matrix4() },
  /** The lens in view space: centre x and y, radius (0 while closed), feather. */
  cutawayLens: { value: new THREE.Vector4() },
  /** Which way the camera's side lies on x and z, and the near walls' lines, signed the same way. */
  cutawayNear: { value: new THREE.Vector4() },
  /** The sill the near walls are cut to, and the height everything is cut above. */
  cutawayLevels: { value: new THREE.Vector4() },
};

const MARK = '/* cutaway-lens */';
const DECLARATIONS = /* glsl */ `
#if NUM_CLIPPING_PLANES > 0 && !defined( CUTAWAY_KEEP )
	uniform mat4 cutawayToWorld;
	uniform vec4 cutawayLens;
	uniform vec4 cutawayNear;
	uniform vec4 cutawayLevels;
	uniform vec3 planetCentre;
	uniform float planetRadius;
	// The planet's bend undone, so rooms are measured where they are modelled:
	// bent, a ceiling twenty units off sank under its own cut height.
	vec3 cutawayUnbend( vec3 w ) {
		#ifdef PLANET_FLAT
			return w;
		#else
			if ( planetRadius <= 0.0 ) return w;
			vec2 d = w.xz - planetCentre.xz;
			float s = length( d ), up = w.y + planetRadius;
			if ( s < 1e-4 ) return w;
			float th = atan( s, up );
			vec2 along = d / s * th * planetRadius;
			return vec3( planetCentre.x + along.x, length( vec2( s, up ) ) - planetRadius, planetCentre.z + along.y );
		#endif
	}
#endif
`;
const TEST = /* glsl */ `
#if NUM_CLIPPING_PLANES > 0 && !defined( CUTAWAY_KEEP )
	if ( cutawayLens.z > 0.0 ) {
		// vClipPosition is the view-space position, negated.
		float cutawayReach = length( vClipPosition.xy + cutawayLens.xy ) / cutawayLens.z;
		if ( cutawayReach < 1.0 ) {
			vec3 cutawayWorld = cutawayUnbend( ( cutawayToWorld * vec4( - vClipPosition, 1.0 ) ).xyz );
			bool cutawayNearSide = cutawayWorld.x * cutawayNear.x > cutawayNear.z || cutawayWorld.z * cutawayNear.y > cutawayNear.w;
			if ( cutawayWorld.y > cutawayLevels.y || ( cutawayNearSide && cutawayWorld.y > cutawayLevels.x ) ) {
				// Fixed interleaved-gradient dither: kept more often towards the rim.
				float cutawayKeep = smoothstep( 1.0 - cutawayLens.w, 1.0, cutawayReach );
				if ( fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) >= cutawayKeep ) discard;
			}
		}
	}
#endif
`;

/** The two clip chunks with the lens added, or undefined if three.js has changed their shape. */
export function cutawayLensChunks(pars: string, fragment: string): [pars: string, fragment: string] | undefined {
  if (pars.includes(MARK)) return [pars, fragment];
  if (!pars.includes('varying vec3 vClipPosition;') || !fragment.includes('#if NUM_CLIPPING_PLANES > 0')) return undefined;
  return [`${MARK}\n${pars}${DECLARATIONS}`, `${fragment}${TEST}`];
}

/** Patches the shared chunks, so it must run before the first program compiles. Idempotent. */
export function installCutawayLens(): boolean {
  const chunks = THREE.ShaderChunk as Record<string, string>;
  const patched = cutawayLensChunks(chunks.clipping_planes_pars_fragment, chunks.clipping_planes_fragment);
  if (!patched) return false;
  [chunks.clipping_planes_pars_fragment, chunks.clipping_planes_fragment] = patched;
  Object.assign(programUniforms, cutawayUniforms);
  return true;
}

const scratch = { centre: new THREE.Vector3(), toCamera: new THREE.Vector3() };

/** Opens round the attendee while they are in a room, and closes when they leave. */
export class CutawayLens {
  /** 0 closed, 1 fully open. */
  open = 0;
  private room?: CutawayRoom;

  /** Shut at once: out of the isometric view the lens means nothing. */
  close(): void {
    this.open = 0;
    this.room = undefined;
    cutawayUniforms.cutawayLens.value.set(0, 0, 0, 0);
  }

  /** Call after the camera has been placed for the frame. `room` is undefined outdoors. */
  update(camera: CutawayCamera, attendee: THREE.Vector3, room: CutawayRoom | undefined, delta: number): void {
    if (room) this.room = room;
    // Opens like an iris on the way in, rather than the roof blinking out.
    this.open = THREE.MathUtils.damp(this.open, room ? 1 : 0, CUTAWAY_LENS.rate, delta);
    if (room && this.open > .995) this.open = 1;
    if (!room && this.open < .005) this.open = 0;
    const r = this.room;
    if (!this.open || !r) { this.close(); return; }
    camera.updateWorldMatrix(true, false);
    const centre = scratch.centre.copy(attendee);
    centre.y += CUTAWAY_LENS.centre;
    centre.applyMatrix4(camera.matrixWorldInverse);
    const shorter = Math.min(camera.right - camera.left, camera.top - camera.bottom);
    cutawayUniforms.cutawayLens.value.set(centre.x, centre.y, CUTAWAY_LENS.radius * shorter * this.open, CUTAWAY_LENS.feather);
    cutawayUniforms.cutawayToWorld.value.copy(camera.matrixWorld);
    // The near walls are the room's sides that face the camera.
    const toCamera = camera.getWorldDirection(scratch.toCamera).negate();
    const sx = toCamera.x < 0 ? -1 : 1, sz = toCamera.z < 0 ? -1 : 1;
    const nearX = sx > 0 ? r.maxX - CUTAWAY_LENS.wall : r.minX + CUTAWAY_LENS.wall;
    const nearZ = sz > 0 ? r.maxZ - CUTAWAY_LENS.wall : r.minZ + CUTAWAY_LENS.wall;
    if (r.nearWalls === false) cutawayUniforms.cutawayNear.value.set(1, 1, 1e9, 1e9);
    else cutawayUniforms.cutawayNear.value.set(sx, sz, nearX * sx, nearZ * sz);
    // Never below the street outside: the club's lobby is lower than the
    // pavement at its door, and cutting there showed the empty sky (owner,
    // 2026-10-23).
    cutawayUniforms.cutawayLevels.value.set(Math.max(r.floor, r.ground ?? 0, 0) + CUTAWAY_LENS.sill, r.ceiling, 0, 0);
  }
}
