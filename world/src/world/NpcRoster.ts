/**
 * The festival's residents, and the handful of strings the interface needs
 * before there is a world to show.
 *
 * A leaf module on purpose. These used to live in `FestivalWorld.ts`, and the
 * gate imported them — which meant that naming the residents pulled in the
 * whole world: three.js, the scene, and the avatar model with it. So the entry
 * bundle was 702KB and had to download and parse before the gate could draw a
 * single field. Keeping them here lets the gate ask for the roster without
 * asking for the festival.
 *
 * `FestivalWorld` re-exports everything below, so nothing that already imports
 * these from there needs to change.
 */

import {
  npcTitles as seededTitles,
  npcTitlesZh as seededTitlesZh,
  npcIntroductions as seededIntroductions,
  npcIntroductionsZh as seededIntroductionsZh,
} from '../../server/festival-seed.json';

export const NPC_NAMES = ['MENTOR', 'KENNY', 'NUNO', 'MICHAEL', 'SEBINE', 'ZC', 'LOUI', 'MINYUN', 'VIOLA', 'XIEHGAN', 'DRBEAUTY', 'YO'] as const;
export type NpcId = string;
export type NpcNames = Record<NpcId, string>;

export interface NpcProfile {
  id: NpcId;
  name: string;
  title: string;
  /** The job title in Chinese. Optional: the English one stands in for it. */
  titleZh?: string;
  /**
   * What this resident says about themselves, written by STAFF.
   *
   * The owner writes in Chinese, so `introductionZh` is the original and this
   * is its translation. Either may be absent, and a reader in either language
   * is shown the other rather than an empty card; a resident with neither
   * still has a name and a job title, and that is what their card shows.
   */
  introduction?: string;
  introductionZh?: string;
}

export interface MentorFollowerTarget {
  kind: 'visitor' | 'npc';
  id: string;
}

/** Residents who wear the female body. The owner named them on 2026-09-25. */
export const FEMALE_RESIDENTS: ReadonlySet<NpcId> = new Set(['SEBINE', 'VIOLA', 'MINYUN']);

export const DEFAULT_NPC_NAMES: NpcNames = Object.fromEntries(NPC_NAMES.map((name) => [name, name]));

/**
 * The titles and introductions the build carries, for the moments it has no
 * service to ask — before `/api/config` answers, and offline.
 *
 * Read from the committed seed rather than copied out of it, so the one file
 * `capture-state.mjs` writes is the only place these are kept and the two
 * cannot drift. Only these four fields reach the bundle: a named import from
 * JSON is tree-shaken, and the programme in the same file is not pulled in.
 */
const seeded = (table: Record<string, string>, id: NpcId): string => table[id] ?? '';

export const NPC_TITLES: Record<NpcId, string> = Object.fromEntries(NPC_NAMES.map((id) => [id, seeded(seededTitles, id) || 'Festival Staff']));

export const DEFAULT_NPC_PROFILES: NpcProfile[] = NPC_NAMES.map((id) => ({
  id,
  name: DEFAULT_NPC_NAMES[id],
  title: NPC_TITLES[id],
  titleZh: seeded(seededTitlesZh, id),
  introduction: seeded(seededIntroductions, id),
  introductionZh: seeded(seededIntroductionsZh, id),
}));

/** A resident's job title in the reader's language, falling back to English. */
export const npcTitleIn = (profile: Pick<NpcProfile, 'title' | 'titleZh'>, zh: boolean): string =>
  (zh && profile.titleZh?.trim()) || profile.title;

/**
 * A resident's introduction in the reader's language. Falls back to the other
 * language either way: a reader is better served by the owner's Chinese than by
 * a card that says nothing has been written.
 */
export const npcIntroductionIn = (profile: Pick<NpcProfile, 'introduction' | 'introductionZh'>, zh: boolean): string => {
  const english = profile.introduction?.trim() ?? '';
  const chinese = profile.introductionZh?.trim() ?? '';
  return zh ? chinese || english : english || chinese;
};

/**
 * What MENTOR's prompt adds, and the exact string the interface matches to
 * translate it. The dog's tap and hold are already spoken for — a treat and a
 * pick-up — so its introduction is a double tap, which is MENTOR's alone.
 */
export const DOUBLE_TAP_INTRODUCTION = ' · DOUBLE TAP / INTRODUCTION';
