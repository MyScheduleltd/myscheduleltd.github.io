export const MOTH_GAME_URL = 'https://myscheduleltd.com/moth/';
/** 逃脫我的美麗 · ESCAPE MY BEAUTY, the second playable cabinet (the owner, 2026-11-10). */
export const ESCAPE_GAME_URL = 'https://myscheduleltd.com/lol/';
export type ArcadeGame = 'moth' | 'escape';
export const ARCADE_TITLES: Readonly<Record<ArcadeGame, string>> = { moth: 'M.O.T.H', escape: '逃脫我的美麗' };
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
export const JUKEBOX_WIDTH = 2.4;
/** The space between neighbouring machines in the row (the owner, 2026-11-10: "leave a reasonable space"). */
export const ARCADE_ROW_GAP = .6;
export const ARCADE_WALL_CLEARANCE = .02;

/** Back the west-facing cabinet up to the outside face of a solid wall. */
export function arcadeAgainstWallX(wallCentreX: number, wallThickness: number): number {
  return wallCentreX - wallThickness / 2 - ARCADE_DEPTH / 2 - ARCADE_WALL_CLEARANCE;
}

/**
 * The row beneath the 你媽俱樂部 sign, left to right as seen from the road:
 * M.O.T.H, 逃脫我的美麗, then the jukebox, side by side with 0.6 between
 * them (the owner, 2026-11-10), the whole row centred on the sign.
 */
export function cabinetRowPositions(centreZ: number): { mothZ: number; escapeZ: number; jukeboxZ: number } {
  const total = ARCADE_WIDTH * 2 + JUKEBOX_WIDTH + ARCADE_ROW_GAP * 2;
  const mothZ = centreZ - total / 2 + ARCADE_WIDTH / 2;
  const escapeZ = mothZ + ARCADE_WIDTH + ARCADE_ROW_GAP;
  return { mothZ, escapeZ, jukeboxZ: escapeZ + ARCADE_WIDTH / 2 + ARCADE_ROW_GAP + JUKEBOX_WIDTH / 2 };
}

/** The cabinet a player here would play: the nearest within reach, and nearer than the jukebox. */
export function nearestArcade(player: { x: number; z: number }, cabinets: ReadonlyArray<{ game: ArcadeGame; x: number; z: number }>, jukebox?: { x: number; z: number }): ArcadeGame | undefined {
  let game: ArcadeGame | undefined, best = ARCADE_REACH;
  for (const cabinet of cabinets) {
    const reach = Math.hypot(player.x - cabinet.x, player.z - cabinet.z);
    if (reach < best) { game = cabinet.game; best = reach; }
  }
  if (game && jukebox && Math.hypot(player.x - jukebox.x, player.z - jukebox.z) <= best) return undefined;
  return game;
}

/** Load the current public release on every visit, including local previews. */
export function arcadeGameUrl(embedded = true, launchToken = crypto.randomUUID(), game: ArcadeGame = 'moth'): string {
  const url = new URL(game === 'escape' ? ESCAPE_GAME_URL : MOTH_GAME_URL);
  // Only M.O.T.H speaks the cabinet's key and exit bridge.
  if (embedded && game === 'moth') url.searchParams.set('arcade', '1');
  // Pages caches its entry HTML. A new URL per launch fetches the entry again;
  // that live entry supplies the current release's versioned scripts/styles.
  url.searchParams.set('arcadeLaunch', launchToken);
  return url.href;
}

export function externalArcadeRequired(coarsePointer: boolean, finePointer: boolean, immersiveVr: boolean): boolean {
  return immersiveVr || (coarsePointer && !finePointer);
}
