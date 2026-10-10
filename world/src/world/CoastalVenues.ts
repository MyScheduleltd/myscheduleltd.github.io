/** Relocations from each venue's authored plan. Used by geometry and all maps. */
export const SCREENING_SITES = {
  shore: { dx:35, dz:10, grade:0, approach:[35,-19] as const },
  'drive-in': { dx:-35, dz:-10, grade:-.8, approach:[0,-26] as const },
} as const;

/** The Shore's entrance board, clear of the service road and seating rows. */
export const SHORE_SIGN = {
  x: 50.5,
  z: -16.1,
  width: 5.6,
  depth: 0.7,
  rotation: -0.08,
} as const;

/** Decorative staff are scenery, separate from the named resident roster. */
export const VENUE_STANDS = {
  'drive-in': { x: 17, z: -27, approachX: 17, approachZ: -23.8, range: 2.8 },
  shore: { x: SHORE_SIGN.x, z: SHORE_SIGN.z, approachX: SHORE_SIGN.x, approachZ: SHORE_SIGN.z + 2.3, range: 2.8 },
  palace: { x: -37.6, z: -12.2, rotation: Math.PI / 2, approachX: -35.4, approachZ: -12.2, range: 2.8 },
} as const;

export type VenueStandKey = keyof typeof VENUE_STANDS;
export function venueStandNear(x: number, z: number): VenueStandKey | undefined {
  return (Object.keys(VENUE_STANDS) as VenueStandKey[]).find((venue) => {
    const stand = VENUE_STANDS[venue];
    return Math.hypot(x - stand.approachX, z - stand.approachZ) < stand.range;
  });
}
export function screeningContains(venue:keyof typeof SCREENING_SITES,x:number,z:number,margin=0):boolean {
  const site=SCREENING_SITES[venue];x-=site.dx;z-=site.dz;
  return venue==='shore'?Math.abs(x)<12+margin&&z< -30+margin&&z> -45.2-margin
    :x>24-margin&&x<46+margin&&z< -17+margin&&z> -35.2-margin;
}
