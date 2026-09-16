/** Relocations from each venue's authored plan. Used by geometry and all maps. */
export const SCREENING_SITES = {
  shore: { dx:35, dz:10, grade:0, approach:[35,-19] as const },
  'drive-in': { dx:-35, dz:-10, grade:-.8, approach:[0,-26] as const },
} as const;

/** The roadside programme board, shared by the world and illustrated map. */
export const SHORE_SIGN = {
  x: 55,
  z: -12,
  width: 5.6,
  depth: 0.7,
  rotation: -0.08,
} as const;
export function screeningContains(venue:keyof typeof SCREENING_SITES,x:number,z:number,margin=0):boolean {
  const site=SCREENING_SITES[venue];x-=site.dx;z-=site.dz;
  return venue==='shore'?Math.abs(x)<12+margin&&z< -30+margin&&z> -45.2-margin
    :x>24-margin&&x<46+margin&&z< -17+margin&&z> -35.2-margin;
}
