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
  npcNames as seededNames,
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

export const DEFAULT_NPC_NAMES: NpcNames = Object.fromEntries(NPC_NAMES.map((id) => [id, seededNames[id as keyof typeof seededNames]?.trim()||id]));

/**
 * The titles and introductions the build carries, for the moments it has no
 * service to ask — before `/api/config` answers, and offline.
 *
 * Biographies and translated titles remain in the committed seed. The owner’s
 * requested job titles below are the current English defaults; profiles served
 * by STAFF remain editable and override them. Named JSON imports keep the
 * programme out of this small roster module.
 */
const seeded = (table: Record<string, string>, id: NpcId): string => table[id] ?? '';
const LEGACY_FANTASY_TITLES_ZH=new Set(['神獸','衛生紙','首席研究員','煉金術士','動物園園長','體育老師','小籠包師傅','保健室阿姨','吟遊詩人','警衛先生','李包比仙人','檔期之友']);

export const NPC_TITLES: Record<NpcId, string> = {
  DRBEAUTY:'Artist',KENNY:'DIRECTOR',LOUI:'DIRECTOR',MENTOR:'VIDEO EDITOR',
  MICHAEL:'DIRECTOR',MINYUN:'ADMINISTRATOR',NUNO:'SOUND ENGINEER',
  SEBINE:'DIRECTOR',VIOLA:'PROJECT MANAGER',XIEHGAN:'BOSS',YO:'SOCIAL',ZC:'DIRECTOR',
};

export const DEFAULT_NPC_PROFILES: NpcProfile[] = NPC_NAMES.map((id) => ({
  id,
  name: DEFAULT_NPC_NAMES[id],
  title: NPC_TITLES[id],
  titleZh: LEGACY_FANTASY_TITLES_ZH.has(seeded(seededTitlesZh,id))?'':seeded(seededTitlesZh,id),
  introduction: seeded(seededIntroductions, id),
  introductionZh: seeded(seededIntroductionsZh, id),
}));

/**
 * Who each resident is in their own introduction (VIOLA's 吟遊詩人), as the
 * introduction card always said, rather than their job at the company. The
 * introduction card and the wave dialogue show these (owner, 2026-10-22); the
 * label over a resident's head keeps the job title.
 */
export const NPC_CHARACTER_TITLES: Record<string, { zh: string; en: string }> = {
  MENTOR: { zh: '神獸', en: 'Divine Beast' },
  KENNY: { zh: '衛生紙', en: 'Toilet Paper' },
  NUNO: { zh: '首席研究員', en: 'Chief Researcher' },
  MICHAEL: { zh: '煉金術士', en: 'Alchemist' },
  SEBINE: { zh: '動物園園長', en: 'Zoo Director' },
  ZC: { zh: '體育老師', en: 'PE Teacher' },
  LOUI: { zh: '小籠包師傅', en: 'Soup Dumpling Master' },
  MINYUN: { zh: '保健室阿姨', en: 'School Nurse' },
  VIOLA: { zh: '吟遊詩人', en: 'Bard' },
  XIEHGAN: { zh: '警衛先生', en: 'Mr. Security Guard' },
  DRBEAUTY: { zh: '李包比仙人', en: 'Bobi the Immortal' },
  YO: { zh: '檔期之友', en: 'Friend of MY SCHEDULE' },
};

/** The introduction's title in the reader's language; the job title for anyone without one. */
export const npcCharacterTitleIn = (profile: Pick<NpcProfile, 'id' | 'title' | 'titleZh'>, zh: boolean): string => {
  const character = NPC_CHARACTER_TITLES[profile.id];
  return character ? (zh ? character.zh : character.en) : npcTitleIn(profile, zh);
};

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
