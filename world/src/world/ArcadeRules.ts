export const MOTH_GAME_URL = 'https://myscheduleltd.com/moth/';
/** 16 November 2026, 00:00 in Taiwan (UTC+8), independent of the viewer's timezone. */
export const ARCADE_UNLOCK_AT = Date.parse('2026-11-15T16:00:00.000Z');

/** The release becomes playable at the exact boundary, without a page reload. */
export function arcadeIsLocked(now = Date.now()): boolean {
  return now < ARCADE_UNLOCK_AT;
}

export const ARCADE_HEIGHT = 3.8;
export const ARCADE_WIDTH = 1.81;
// Rounded outwards from the loaded cabinet, including its tilted front trim.
export const ARCADE_DEPTH = 2.12;
export const ARCADE_REACH = 3.5;
export const JUKEBOX_RIGHT_SHIFT = 3.4;
export const ARCADE_WALL_CLEARANCE = .02;

/** Back the west-facing cabinet up to the outside face of a solid wall. */
export function arcadeAgainstWallX(wallCentreX: number, wallThickness: number): number {
  return wallCentreX - wallThickness / 2 - ARCADE_DEPTH / 2 - ARCADE_WALL_CLEARANCE;
}

/** Centre the pair's outer edges beneath the sign, accounting for cabinet widths. */
export function cabinetPairPositions(centreZ: number): { arcadeZ: number; jukeboxZ: number } {
  const arcadeZ = centreZ - (JUKEBOX_RIGHT_SHIFT + (2.4 - ARCADE_WIDTH) / 2) / 2;
  return { arcadeZ, jukeboxZ: arcadeZ + JUKEBOX_RIGHT_SHIFT };
}

export function arcadeIsNearest(player: { x: number; z: number }, arcade: { x: number; z: number }, jukebox?: { x: number; z: number }): boolean {
  const reach = Math.hypot(player.x - arcade.x, player.z - arcade.z);
  return reach < ARCADE_REACH && (!jukebox || reach < Math.hypot(player.x - jukebox.x, player.z - jukebox.z));
}

/** Load the current public release on every visit, including local previews. */
export function arcadeGameUrl(embedded = true, launchToken = crypto.randomUUID()): string {
  const url = new URL(MOTH_GAME_URL);
  if (embedded) url.searchParams.set('arcade', '1');
  // Pages caches its entry HTML. A new URL per launch fetches the entry again;
  // that live entry supplies the current release's versioned scripts/styles.
  url.searchParams.set('arcadeLaunch', launchToken);
  return url.href;
}

export function externalArcadeRequired(coarsePointer: boolean, finePointer: boolean, immersiveVr: boolean): boolean {
  return immersiveVr || (coarsePointer && !finePointer);
}
